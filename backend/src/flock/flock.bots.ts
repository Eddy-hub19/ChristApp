import { BOT_NAMES } from './flock.bot-names';
import { ARTIFACT, FLOCK_CONFIG } from './flock.config';
import { inHazard, navPush, navRoute } from './flock.nav';
import {
  radiusOf,
  speedOf,
  type FlockWorld,
  type Player,
  type Rng,
} from './flock.engine';

const C = FLOCK_CONFIG;

// Список імен лежить в окремому файлі даних; реекспорт лишає старий імпорт із './flock.bots'.
export { BOT_NAMES };

export type Personality = 'cautious' | 'aggressive' | 'balanced';

interface Brain {
  personality: Personality;
  /** Зсув, щоб боти думали в різні тіки. */
  offset: number;
  wanderAngle: number;
  wanderUntil: number;
  lastSplitAt: number;
  lastEngageAt: number;
  stuckX: number;
  stuckY: number;
  stuckAt: number;
  unstuckUntil: number;
  unstuckAngle: number;
}

interface Profile {
  fleeRadius: number;
  huntRadius: number;
  foodRadius: number;
  /** Мінімальний шанс спіймати ціль (0..1), щоб ділитись для нападу; 0 у «обережного» = ніколи (див. splitEnabled). */
  splitMinCatch: number;
  splitEnabled: boolean;
  /** Навколо цілі стільки радіусів більшого гравця - ціль «під охороною», не чіпаємо. */
  guardRadius: number;
}

const PROFILES: Record<Personality, Profile> = {
  cautious: {
    fleeRadius: 700,
    huntRadius: 200,
    foodRadius: 420,
    splitMinCatch: 1,
    splitEnabled: false,
    guardRadius: 420,
  },
  balanced: {
    fleeRadius: 520,
    huntRadius: 420,
    foodRadius: 380,
    splitMinCatch: 0.85,
    splitEnabled: true,
    guardRadius: 320,
  },
  aggressive: {
    fleeRadius: 380,
    huntRadius: 760,
    foodRadius: 300,
    splitMinCatch: 0.7,
    splitEnabled: true,
    guardRadius: 220,
  },
};

/** Налаштування розумності ботів (усе дешево: сітка, лічені масиви, без алокацій на думку). */
const AI = {
  /** Макс. поворот за одну думку (рад); при втечі x2: без смикань, але від загрози розвертається швидко. */
  maxTurn: 1.0,
  wallMargin: 220,
  /** Стеля упередження цілі (с). */
  leadMaxSec: 1.5,
  /** Здобич: цінність = маса / (відстань + preyDistSoft). */
  preyDistSoft: 200,
  /** Втеча: скільки кандидатних напрямків оцінюємо й на яку відстань уперед. */
  fleeDirs: 12,
  fleeLook: 320,
  /** Схованка в кущі, у який бот вміщується, у межах цієї відстані. */
  hideRadius: 450,
  /** Розгрупування: через стільки мс без цілей і загроз частини збираються докупи. */
  regroupAfterMs: 2500,
  splitGapMs: 5000,
  stuckCheckMs: 1500,
  stuckMinMove: 40,
  unstuckMs: 1300,
  maxThreats: 24,
  maxPrey: 16,
} as const;

const TWO_PI = Math.PI * 2;
const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= TWO_PI;
  while (a < -Math.PI) a += TWO_PI;
  return a;
};

// Робочі буфери (один потік, думки не перетинаються): без алокацій у steady state.
const thX = new Float64Array(AI.maxThreats);
const thY = new Float64Array(AI.maxThreats);
const thR = new Float64Array(AI.maxThreats);
const prX = new Float64Array(AI.maxPrey);
const prY = new Float64Array(AI.maxPrey);
const prM = new Float64Array(AI.maxPrey);
const prVx = new Float64Array(AI.maxPrey);
const prVy = new Float64Array(AI.maxPrey);
const push = { x: 0, y: 0 };
const route = { x: 0, y: 0 };

/**
 * Ім'я бота, якого ще немає на арені. Вільні базові імена беруться випадково; коли всі зайняті —
 * випадкове базове з найменшим вільним номером: «Пушистик 2», «Пушистик 3» …
 */
export function pickBotName(rng: Rng, taken: Iterable<string>): string {
  const used = new Set(taken);
  const free = BOT_NAMES.filter((n) => !used.has(n));
  if (free.length > 0) return free[Math.floor(rng() * free.length)];
  const base = BOT_NAMES[Math.floor(rng() * BOT_NAMES.length)];
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export function initBot(p: Player, rng: Rng, personality?: Personality) {
  const roll = rng();
  const brain: Brain = {
    personality:
      personality ??
      (roll < 0.33 ? 'cautious' : roll < 0.7 ? 'balanced' : 'aggressive'),
    offset: Math.floor(rng() * C.botThinkEvery),
    wanderAngle: rng() * Math.PI * 2,
    wanderUntil: 0,
    lastSplitAt: -1e9,
    lastEngageAt: 0,
    stuckX: 0,
    stuckY: 0,
    stuckAt: 0,
    unstuckUntil: 0,
    unstuckAngle: 0,
  };
  p.brain = brain;
}

/**
 * ШІ ботів: утеча від більших (з урахуванням країв, заборонених зон і кущів; до куща, у який вміщується),
 * полювання за вигодою з упередженням руху цілі (цілі під охороною більших не чіпаємо), дроблення лише при
 * високому шансі й збір частин докупи, їжа/бонуси, блукання, плавні повороти й антизастрягання.
 * Викликається щотіку, але рахує тільки раз на botThinkEvery (зі зсувом) - між думками бот їде за попереднім
 * рішенням. Радіус огляду не змінений; уся геометрія через просторову сітку світу й шар flock.nav.ts.
 * Новачків-людей (botGraceMs), гравців під щитом і на паузі бот не чіпає.
 */
export function thinkBot(world: FlockWorld, p: Player, rng: Rng) {
  const brain = p.brain as Brain | undefined;
  if (!brain || !p.alive) return;
  if ((world.tickNo + brain.offset) % C.botThinkEvery !== 0) return;

  const now = world.now;
  const me = world.centroid(p);
  let myMax = 0;
  let big = p.cells[0];
  for (const c of p.cells)
    if (c.mass > myMax) {
      myMax = c.mass;
      big = c;
    }
  const myR = radiusOf(myMax);
  const mySpeed = Math.max(40, speedOf(myMax));
  const prof = PROFILES[brain.personality];
  const shielded = world.isShielded(p);

  let fx = 0;
  let fy = 0;
  let threatened = false;
  let nTh = 0;
  let nPr = 0;

  const scan = Math.max(prof.fleeRadius, prof.huntRadius) + myR;
  world.queryCells(me.x, me.y, scan, (c) => {
    if (c.pid === p.id) return;
    const o = world.players.get(c.pid);
    if (!o || !o.alive || o.paused) return; // гравців у паузі боти не помічають
    if (world.isGhost(o) || world.isGhost(p)) return;
    const d = Math.hypot(c.x - me.x, c.y - me.y) || 1;
    // «Кадило»: носія бот не переслідує, а в радіусі дії відхиляється від нього
    if (world.hasArtifact(o, ARTIFACT.censer)) {
      if (d < C.artifacts.censerRadius + radiusOf(c.mass)) {
        const w = 1 / (d * d);
        fx += ((me.x - c.x) / d) * w * 1e5;
        fy += ((me.y - c.y) / d) * w * 1e5;
        threatened = true;
      }
      return;
    }
    if (c.mass >= myMax * C.eatRatio) {
      // більший: пам'ятаємо для оцінки втечі й охорони цілей (навіть далекий)
      if (nTh < AI.maxThreats) {
        thX[nTh] = c.x;
        thY[nTh] = c.y;
        thR[nTh] = radiusOf(c.mass);
        nTh++;
      }
      if (!shielded && d < prof.fleeRadius + radiusOf(c.mass)) {
        // чим ближче загроза, тим сильніше відштовхування
        const w = 1 / (d * d);
        fx += ((me.x - c.x) / d) * w * 1e5;
        fy += ((me.y - c.y) / d) * w * 1e5;
        threatened = true;
      }
    } else if (
      myMax >= c.mass * C.eatRatio &&
      !world.isShielded(o) &&
      // новачків-людей боти не переслідують (див. botGraceMs)
      !(!o.bot && now - o.spawnedAt < C.botGraceMs) &&
      d < prof.huntRadius &&
      nPr < AI.maxPrey
    ) {
      // швидкість цілі з її курсу: упередження без відстеження історії
      const sp = now < o.frozenUntil ? 0 : speedOf(c.mass) * o.power;
      prX[nPr] = c.x;
      prY[nPr] = c.y;
      prM[nPr] = c.mass;
      prVx[nPr] = Math.cos(o.angle) * sp;
      prVy[nPr] = Math.sin(o.angle) * sp;
      nPr++;
    }
  });

  // вибір здобичі за вигодою; ціль під охороною більшого й у забороненій зоні пропускаємо
  let pi = -1;
  let bestValue = 0;
  for (let i = 0; i < nPr; i++) {
    if (inHazard(world, prX[i], prY[i])) continue;
    let guarded = false;
    for (let j = 0; j < nTh; j++) {
      if (Math.hypot(thX[j] - prX[i], thY[j] - prY[i]) < prof.guardRadius + thR[j]) {
        guarded = true;
        break;
      }
    }
    if (guarded) continue;
    const dist = Math.hypot(prX[i] - me.x, prY[i] - me.y);
    const value = prM[i] / (dist + AI.preyDistSoft);
    if (value > bestValue) {
      bestValue = value;
      pi = i;
    }
  }

  // перешкоди: краї, заборонені зони, великим - кущі
  navPush(world, me.x, me.y, myR, AI.wallMargin, push);
  let ox = push.x;
  let oy = push.y;
  if (myMax > C.thornMass * C.thornPopRatio) {
    for (const t of world.thorns) {
      const d = Math.hypot(t.x - me.x, t.y - me.y) || 1;
      const safe = myR + radiusOf(t.mass) + 70;
      if (d < safe) {
        ox += ((me.x - t.x) / d) * 1.5;
        oy += ((me.y - t.y) / d) * 1.5;
      }
    }
  }

  let dx = 0;
  let dy = 0;
  let split = false;
  let urgent = false;
  let engaged = false;

  if (threatened) {
    engaged = true;
    urgent = true;
    // кращий з кількох напрямків: від загрози, не в стіну/заборонену зону/гострий куст, у відкритий простір
    const away = Math.atan2(fy, fx);
    let bestScore = -Infinity;
    let bestA = away;
    const W = C.worldSize;
    for (let i = 0; i < AI.fleeDirs; i++) {
      const a = away + wrapAngle((i / AI.fleeDirs) * TWO_PI);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const px = me.x + ca * AI.fleeLook;
      const py = me.y + sa * AI.fleeLook;
      let score = Math.cos(wrapAngle(a - away)) * 2;
      if (px < myR || py < myR || px > W - myR || py > W - myR) score -= 3;
      else {
        const room = Math.min(px, py, W - px, W - py);
        if (room < 300) score -= (300 - room) / 150;
      }
      if (inHazard(world, px, py, myR) || inHazard(world, (me.x + px) / 2, (me.y + py) / 2, myR)) score -= 6;
      // відстань від загроз у кінці кроку
      let near = Infinity;
      for (let j = 0; j < nTh; j++) {
        const dd = Math.hypot(thX[j] - px, thY[j] - py) - thR[j];
        if (dd < near) near = dd;
      }
      if (near < Infinity) score += Math.min(near, 600) / 300;
      if (score > bestScore) {
        bestScore = score;
        bestA = a;
      }
    }
    dx = Math.cos(bestA);
    dy = Math.sin(bestA);
    // кущ, у який вміщуємось (радіус більший за наш), не в бік загрози
    if (brain.personality !== 'aggressive') {
      let best = Infinity;
      for (const t of world.thorns) {
        const tr = radiusOf(t.mass);
        if (tr <= myR * 1.05) continue;
        const d = Math.hypot(t.x - me.x, t.y - me.y);
        if (d > AI.hideRadius || d >= best) continue;
        const dot = ((t.x - me.x) * fx + (t.y - me.y) * fy) / ((d || 1) * (Math.hypot(fx, fy) || 1));
        if (dot < -0.25) continue;
        best = d;
        dx = t.x - me.x;
        dy = t.y - me.y;
      }
    }
  } else if (pi >= 0) {
    engaged = true;
    const px0 = prX[pi];
    const py0 = prY[pi];
    const dist = Math.hypot(px0 - me.x, py0 - me.y);
    // упередження: куди дійде ціль, поки ми добираємось (дві ітерації)
    let ax = px0;
    let ay = py0;
    for (let i = 0; i < 2; i++) {
      const lead = Math.min(AI.leadMaxSec, Math.hypot(ax - me.x, ay - me.y) / mySpeed);
      ax = px0 + prVx[pi] * lead;
      ay = py0 + prVy[pi] * lead;
    }
    const W = C.worldSize;
    ax = Math.min(W - 20, Math.max(20, ax));
    ay = Math.min(W - 20, Math.max(20, ay));
    if (inHazard(world, ax, ay)) {
      ax = px0;
      ay = py0;
    }
    navRoute(world, me.x, me.y, ax, ay, myR, route);
    dx = route.x - me.x;
    dy = route.y - me.y;
    // поділ для нападу: лише коли шанс спіймати високий (відстань з урахуванням руху цілі, досяжність ривка)
    if (
      prof.splitEnabled &&
      route.x === ax &&
      p.cells.length < C.maxCellsPerPlayer / 2 &&
      myMax / 2 >= prM[pi] * C.eatRatio &&
      myMax >= C.minSplitMass &&
      now - brain.lastSplitAt >= AI.splitGapMs
    ) {
      const rr = radiusOf(prM[pi]);
      const vr = ((prVx[pi] * (px0 - me.x) + prVy[pi] * (py0 - me.y)) / (dist || 1));
      const gap = Math.max(0, dist - myR - rr) + vr * 0.6;
      const reach = (C.splitImpulse / C.impulseFriction + radiusOf(myMax / 2) * 0.8) * 1.15;
      if (1 - Math.max(0, gap) / reach >= prof.splitMinCatch) {
        split = true;
        brain.lastSplitAt = now;
      }
    }
  } else {
    // збір частин після поділу (коли тихо)
    if (
      p.cells.length > 1 &&
      now - brain.lastEngageAt >= AI.regroupAfterMs &&
      now - brain.lastSplitAt >= C.mergeDelayMs
    ) {
      let mx = 0;
      let my = 0;
      let mm = 0;
      for (const c of p.cells) {
        if (c === big) continue;
        mx += c.x * c.mass;
        my += c.y * c.mass;
        mm += c.mass;
      }
      if (mm > 0) {
        dx = big.x - mx / mm;
        dy = big.y - my / mm;
      }
    }
    if (dx === 0 && dy === 0) {
      // найближча їжа (не в забороненій зоні) і бонуси
      let best = Infinity;
      let tx = 0;
      let ty = 0;
      world.foodNear(me.x, me.y, prof.foodRadius, (f) => {
        const d = Math.hypot(f.x - me.x, f.y - me.y);
        if (d < best && !inHazard(world, f.x, f.y, 4)) {
          best = d;
          tx = f.x;
          ty = f.y;
        }
      });
      for (const b of world.bonuses) {
        const d = Math.hypot(b.x - me.x, b.y - me.y);
        if (d < 450 && d * 0.5 < best && !inHazard(world, b.x, b.y, 4)) {
          best = d * 0.5;
          tx = b.x;
          ty = b.y;
        }
      }
      if (best < Infinity) {
        navRoute(world, me.x, me.y, tx, ty, myR, route);
        dx = route.x - me.x;
        dy = route.y - me.y;
      } else {
        if (now >= brain.wanderUntil) {
          brain.wanderAngle = rng() * TWO_PI;
          brain.wanderUntil = now + 2000 + rng() * 3000;
        }
        dx = Math.cos(brain.wanderAngle);
        dy = Math.sin(brain.wanderAngle);
      }
    }
  }
  if (engaged) brain.lastEngageAt = now;

  // бажаний напрямок + відштовхування від країв/зон/кущів
  const dl = Math.hypot(dx, dy);
  if (dl > 0) {
    dx /= dl;
    dy /= dl;
  }
  let mx = dx;
  let my = dy;
  if (threatened) {
    // втеча вже врахувала краї; тут лише кущі й м'яка корекція
    mx += ox * 0.6;
    my += oy * 0.6;
  } else {
    mx += ox;
    my += oy;
  }
  let desired = mx === 0 && my === 0 ? p.angle : Math.atan2(my, mx);

  // застрягання: їде, а на місці (край, кущ) - розвертається до центру
  if (brain.stuckAt === 0 || p.power === 0 || now < p.frozenUntil) {
    brain.stuckX = me.x;
    brain.stuckY = me.y;
    brain.stuckAt = now;
  } else if (now - brain.stuckAt >= AI.stuckCheckMs) {
    if (Math.hypot(me.x - brain.stuckX, me.y - brain.stuckY) < AI.stuckMinMove) {
      brain.unstuckUntil = now + AI.unstuckMs;
      brain.unstuckAngle = Math.atan2(C.worldSize / 2 - me.y, C.worldSize / 2 - me.x) + (rng() - 0.5) * 1.2;
    }
    brain.stuckX = me.x;
    brain.stuckY = me.y;
    brain.stuckAt = now;
  }
  if (!threatened && now < brain.unstuckUntil) {
    desired = brain.unstuckAngle;
    urgent = true;
  }

  // плавний поворот: ліміт кута за думку (втеча - удвічі швидше)
  const maxTurn = AI.maxTurn * (urgent ? 2 : 1);
  const delta = wrapAngle(desired - p.angle);
  p.angle = wrapAngle(p.angle + Math.max(-maxTurn, Math.min(maxTurn, delta)));
  p.power = 1;
  if (split) world.queueSplit(p.id);
}
