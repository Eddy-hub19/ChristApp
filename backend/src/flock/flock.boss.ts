import { FLOCK_CONFIG } from './flock.config';
import {
  radiusOf,
  speedOf,
  type FlockWorld,
  type Player,
  type Rng,
} from './flock.engine';

const C = FLOCK_CONFIG;
const B = C.boss;

/** Оцінка руху гравця між двома думками Вожака (для упередження). */
interface Track {
  x: number;
  y: number;
  t: number;
  vx: number;
  vy: number;
}

/** Що Вожак побачив про одного чужого гравця за цю думку. */
interface Seen {
  p: Player;
  total: number;
  cx: number;
  cy: number;
  /** Найбільша клітина й найближчий край гравця до центру Вожака. */
  maxCell: number;
  nearest: number;
  /** Їстівна для Вожака маса (клітини, які він може з'їсти), її центр і найбільша їстівна клітина. */
  edible: number;
  ex: number;
  ey: number;
  edibleMax: number;
  vx: number;
  vy: number;
}

interface BossBrain {
  /** Зсув, щоб думки Вожака не збігалися з тіком, де думають інші боти. */
  offset: number;
  wanderAngle: number;
  wanderUntil: number;
  tracks: Map<number, Track>;
  seen: Map<number, Seen>;
  targetPid: number;
  lastSplitAt: number;
  /** Остання мить, коли була здобич у полі або загроза: після паузи частини збираються докупи. */
  lastEngageAt: number;
  ambush: { x: number; y: number; r: number; until: number } | null;
  ambushCooldownUntil: number;
  stuckX: number;
  stuckY: number;
  stuckAt: number;
  unstuckUntil: number;
  unstuckAngle: number;
}

export function initBoss(p: Player, rng: Rng) {
  const brain: BossBrain = {
    offset: Math.floor(rng() * B.thinkEvery),
    wanderAngle: rng() * Math.PI * 2,
    wanderUntil: 0,
    tracks: new Map(),
    seen: new Map(),
    targetPid: 0,
    lastSplitAt: -1e9,
    lastEngageAt: 0,
    ambush: null,
    ambushCooldownUntil: 0,
    stuckX: 0,
    stuckY: 0,
    stuckAt: 0,
    unstuckUntil: 0,
    unstuckAngle: 0,
  };
  p.brain = brain;
}

const TWO_PI = Math.PI * 2;
const wrap = (a: number) => {
  while (a > Math.PI) a -= TWO_PI;
  while (a < -Math.PI) a += TWO_PI;
  return a;
};
/** Швидкість гравця не буває більшою: відсікає стрибки оцінки при поділі / з'їданні. */
const MAX_EST_SPEED = 420;

/** Найближча стіна до точки: відстань і одиничний вектор У БІК стіни. */
function nearestWall(x: number, y: number) {
  const W = C.worldSize;
  let d = x;
  let nx = -1;
  let ny = 0;
  if (W - x < d) {
    d = W - x;
    nx = 1;
    ny = 0;
  }
  if (y < d) {
    d = y;
    nx = 0;
    ny = -1;
  }
  if (W - y < d) {
    d = W - y;
    nx = 0;
    ny = 1;
  }
  return { d, nx, ny };
}

/** Скільки стін ближче за dist (2 - кут). */
function wallsWithin(x: number, y: number, dist: number) {
  const W = C.worldSize;
  let n = 0;
  if (x < dist) n++;
  if (W - x < dist) n++;
  if (y < dist) n++;
  if (W - y < dist) n++;
  return n;
}

/**
 * ШІ «Вожака»: сильніший за звичайних ботів, але чесний (ті самі правила рушія). Думає раз на boss.thinkEvery тіків.
 * - Оцінює швидкість цілей між думками й наводиться з упередженням, а не на поточну позицію.
 * - Здобич обирає за вигодою (їстівна маса / відстань), мілочь ігнорує; гравець важливіший за їжу.
 *   Біля стіни й у кутах добиває, інакше заходить зі сторони, протилежної стіні, і заганяє до краю.
 * - Ділиться для нападу лише коли шанс спіймати високий; після паузи збирає частини докупи.
 * - Тікає від більших і від груп у бік куща, у який вміщується; кущі, що рвуть його, об'їжджає.
 * - Тактика: в «натовпі» тримається окраїни й б'є одинаків, проти одного гравця йде прямо на нього.
 * - Не застрягає (детектор зсуву) і повертає плавно (ліміт кута за думку).
 * Правила новачків, щита й паузи тримає сам рушій (stepCellVsCell), тут вони дзеркалені, щоб не ганятись марно.
 */
export function thinkBoss(world: FlockWorld, p: Player, rng: Rng) {
  const brain = p.brain as BossBrain | undefined;
  if (!brain || !p.alive || p.paused) return;
  if ((world.tickNo + brain.offset) % B.thinkEvery !== 0) return;

  const now = world.now;
  const me = world.centroid(p);
  let myMax = 0;
  let myMin = Infinity;
  let big = p.cells[0];
  for (const c of p.cells) {
    if (c.mass > myMax) {
      myMax = c.mass;
      big = c;
    }
    if (c.mass < myMin) myMin = c.mass;
  }
  const myR = radiusOf(myMax);
  const shielded = world.isShielded(p);
  const frozen = now < p.frozenUntil;
  const W = C.worldSize;

  // ---- огляд: збираємо інформацію по гравцях ----
  const seen = brain.seen;
  seen.clear();
  world.queryCells(me.x, me.y, B.viewRadius + myR, (c) => {
    if (c.pid === p.id) return;
    const o = world.players.get(c.pid);
    if (!o || !o.alive || o.paused) return;
    if (world.isGhost(o) || world.isGhost(p)) return;
    let s = seen.get(c.pid);
    if (!s) {
      s = {
        p: o,
        total: 0,
        cx: 0,
        cy: 0,
        maxCell: 0,
        nearest: Infinity,
        edible: 0,
        ex: 0,
        ey: 0,
        edibleMax: 0,
        vx: 0,
        vy: 0,
      };
      seen.set(c.pid, s);
    }
    s.total += c.mass;
    s.cx += c.x * c.mass;
    s.cy += c.y * c.mass;
    if (c.mass > s.maxCell) s.maxCell = c.mass;
    const d = Math.hypot(c.x - me.x, c.y - me.y) - radiusOf(c.mass);
    if (d < s.nearest) s.nearest = d;
    if (myMax >= c.mass * C.eatRatio) {
      s.edible += c.mass;
      s.ex += c.x * c.mass;
      s.ey += c.y * c.mass;
      if (c.mass > s.edibleMax) s.edibleMax = c.mass;
    }
  });

  let humansNear = 0;
  let humansSeen = 0;
  let crowdX = 0;
  let crowdY = 0;
  for (const [pid, s] of seen) {
    s.cx /= s.total;
    s.cy /= s.total;
    if (s.edible > 0) {
      s.ex /= s.edible;
      s.ey /= s.edible;
    }
    // швидкість між думками
    const tr = brain.tracks.get(pid);
    if (tr) {
      const dtS = (now - tr.t) / 1000;
      if (dtS > 0 && dtS < 1.5) {
        let vx = (s.cx - tr.x) / dtS;
        let vy = (s.cy - tr.y) / dtS;
        const sp = Math.hypot(vx, vy);
        if (sp > MAX_EST_SPEED) {
          vx = (vx / sp) * MAX_EST_SPEED;
          vy = (vy / sp) * MAX_EST_SPEED;
        }
        tr.vx = tr.vx * (1 - B.velSmooth) + vx * B.velSmooth;
        tr.vy = tr.vy * (1 - B.velSmooth) + vy * B.velSmooth;
      } else {
        tr.vx = 0;
        tr.vy = 0;
      }
      tr.x = s.cx;
      tr.y = s.cy;
      tr.t = now;
      s.vx = tr.vx;
      s.vy = tr.vy;
    } else {
      brain.tracks.set(pid, { x: s.cx, y: s.cy, t: now, vx: 0, vy: 0 });
    }
    if (!s.p.bot) {
      humansSeen++;
      if (Math.hypot(s.cx - me.x, s.cy - me.y) < B.crowdRadius) {
        humansNear++;
        crowdX += s.cx;
        crowdY += s.cy;
      }
    }
  }
  for (const pid of brain.tracks.keys()) if (!seen.has(pid)) brain.tracks.delete(pid);
  const crowd = humansNear >= B.crowdCount;
  const solo = humansSeen === 1;

  // ---- загрози: більші гравці й групи ----
  let fx = 0;
  let fy = 0;
  let threatened = false;
  let groupMass = 0;
  let groupN = 0;
  let gx = 0;
  let gy = 0;
  for (const s of seen.values()) {
    const d = Math.hypot(s.cx - me.x, s.cy - me.y) || 1;
    if (
      !shielded &&
      s.maxCell >= myMin * C.eatRatio &&
      d < B.fleeRadius + radiusOf(s.maxCell)
    ) {
      const w = Math.min(1.5, Math.max(0.3, B.fleeRadius / d - 0.3));
      fx += ((me.x - s.cx) / d) * w;
      fy += ((me.y - s.cy) / d) * w;
      threatened = true;
    }
    if (d < B.groupRadius) {
      groupMass += s.total;
      groupN++;
      gx += s.cx;
      gy += s.cy;
    }
  }
  if (!shielded && groupN >= 2 && groupMass >= me.mass * B.groupThreatRatio) {
    gx /= groupN;
    gy /= groupN;
    const d = Math.hypot(me.x - gx, me.y - gy) || 1;
    fx += ((me.x - gx) / d) * 1.2;
    fy += ((me.y - gy) / d) * 1.2;
    threatened = true;
  }

  // ---- перешкоди: кущі, що рвуть Вожака, і стіни ----
  let ox = 0;
  let oy = 0;
  if (myMax > C.thornMass * C.thornPopRatio) {
    for (const t of world.thorns) {
      if (radiusOf(t.mass) >= myR) continue;
      const d = Math.hypot(t.x - me.x, t.y - me.y) || 1;
      const safe = myR + radiusOf(t.mass) + 90;
      if (d < safe) {
        const k = 1.6 * (1 + (safe - d) / safe);
        ox += ((me.x - t.x) / d) * k;
        oy += ((me.y - t.y) / d) * k;
      }
    }
  }
  const margin = B.wallMargin;
  if (me.x < margin) ox += (margin - me.x) / margin;
  if (me.x > W - margin) ox -= (me.x - (W - margin)) / margin;
  if (me.y < margin) oy += (margin - me.y) / margin;
  if (me.y > W - margin) oy -= (me.y - (W - margin)) / margin;

  // ---- рішення ----
  // dirX/dirY - бажаний напрямок (одиничний, 0 - немає); hold - стояти; split - поділитись
  let dirX = 0;
  let dirY = 0;
  let hold = false;
  let split = false;
  let urgent = false;
  let engaged = false;
  const mySpeed = Math.max(40, speedOf(myMax));

  if (threatened) {
    engaged = true;
    urgent = true;
    brain.ambush = null;
    dirX = fx;
    dirY = fy;
    // схованка: найближчий кущ, у який вміщуємось, не в бік загрози
    const fl = Math.hypot(fx, fy) || 1;
    let best: { x: number; y: number; d: number; r: number } | null = null;
    for (const t of world.thorns) {
      const tr = radiusOf(t.mass);
      if (tr <= myR * 1.05) continue;
      const d = Math.hypot(t.x - me.x, t.y - me.y);
      if (d > B.hideRadius) continue;
      const dot = ((t.x - me.x) * fx + (t.y - me.y) * fy) / ((d || 1) * fl);
      if (dot < -0.25) continue;
      if (!best || d < best.d) best = { x: t.x, y: t.y, d, r: tr };
    }
    if (best) {
      dirX = best.x - me.x;
      dirY = best.y - me.y;
      // всередині куща завмираємо: хто більший за кущ і женеться слідом - рветься об нього
      hold = best.d < best.r - myR * 0.2;
    }
  } else {
    // ---- здобич ----
    let target: Seen | null = null;
    let targetValue = 0;
    for (const s of seen.values()) {
      if (s.edible < B.preyMinMass) continue;
      const o = s.p;
      if (world.isShielded(o)) continue;
      // новачків-людей не чіпаємо (див. botGraceMs; рушій теж не дасть їх з'їсти)
      if (!o.bot && now - o.spawnedAt < C.botGraceMs) continue;
      const dist = Math.hypot(s.ex - me.x, s.ey - me.y);
      if (dist > B.huntRadius) continue;
      // ціль у кущі, що рве Вожака, недосяжна
      let unreachable = false;
      if (myMax > C.thornMass * C.thornPopRatio) {
        for (const t of world.thorns) {
          const tr = radiusOf(t.mass);
          if (tr < myR && Math.hypot(t.x - s.ex, t.y - s.ey) < tr) {
            unreachable = true;
            break;
          }
        }
      }
      if (unreachable) continue;
      let value = (s.edible * B.aggression) / (dist + B.preyDistSoft);
      if (s.p.id === brain.targetPid) value *= B.preyStickBonus;
      if (wallsWithin(s.ex, s.ey, B.trapWallDist) >= 1) value *= 1.2;
      // «натовп»: б'ємо лише одинаків (поруч із ціллю нікого), інакше майже не цікаво
      if (crowd) {
        let alone = true;
        for (const o2 of seen.values()) {
          if (o2 === s) continue;
          if (Math.hypot(o2.cx - s.cx, o2.cy - s.cy) < B.loneRadius) {
            alone = false;
            break;
          }
        }
        if (!alone && dist > myR * 3) value *= 0.1;
      }
      if (value > targetValue) {
        targetValue = value;
        target = s;
      }
    }

    if (target) {
      engaged = true;
      brain.targetPid = target.p.id;
      const dist = Math.hypot(target.ex - me.x, target.ey - me.y);
      // упередження: куди дійде ціль, поки ми добираємось (дві ітерації)
      let ax = target.ex;
      let ay = target.ey;
      let lead = 0;
      for (let i = 0; i < 2; i++) {
        lead = Math.min(
          B.leadMaxSec,
          Math.hypot(ax - me.x, ay - me.y) / mySpeed,
        );
        ax = target.ex + target.vx * lead;
        ay = target.ey + target.vy * lead;
      }
      const rr = radiusOf(target.edibleMax);
      ax = Math.min(W - rr, Math.max(rr, ax));
      ay = Math.min(W - rr, Math.max(rr, ay));

      // загін до краю: поки ціль далеко від стіни, заходимо з протилежного боку, ближче - добиваємо
      const wallDist = nearestWall(ax, ay);
      const trapped = wallDist.d < B.trapWallDist;
      const corner = wallsWithin(ax, ay, B.trapWallDist * 1.2) >= 2;
      if (!solo && !trapped && dist > myR * 3) {
        const off = Math.min(dist * B.herdFactor, B.herdMaxOffset);
        ax -= wallDist.nx * off;
        ay -= wallDist.ny * off;
      }

      // засідка в кущі, у який вміщується велика клітина, поки ціль поряд, але ще не в зоні удару
      const amb = brain.ambush;
      if (amb && (now > amb.until || dist < B.ambushStrikeDist)) {
        brain.ambush = null;
        brain.ambushCooldownUntil = now + B.ambushCooldownMs;
      }
      if (!brain.ambush && now >= brain.ambushCooldownUntil && dist > B.ambushStrikeDist) {
        let bestBush: { x: number; y: number; r: number; d: number } | null = null;
        for (const t of world.thorns) {
          const tr = radiusOf(t.mass);
          if (tr <= myR * 1.05) continue;
          const d = Math.hypot(t.x - me.x, t.y - me.y);
          if (d > B.ambushRadius) continue;
          if (Math.hypot(t.x - target.ex, t.y - target.ey) > B.ambushLureRadius) continue;
          if (!bestBush || d < bestBush.d) bestBush = { x: t.x, y: t.y, r: tr, d };
        }
        if (bestBush)
          brain.ambush = {
            x: bestBush.x,
            y: bestBush.y,
            r: bestBush.r,
            until: now + B.ambushMaxMs,
          };
      }
      if (brain.ambush) {
        const a = brain.ambush;
        dirX = a.x - me.x;
        dirY = a.y - me.y;
        hold = Math.hypot(dirX, dirY) < a.r - myR * 0.2;
      } else {
        dirX = ax - me.x;
        dirY = ay - me.y;
      }

      // поділ для нападу: лише коли шанс спіймати високий
      if (
        !brain.ambush &&
        p.cells.length < 4 &&
        now - brain.lastSplitAt >= B.splitGapMs &&
        myMax / 2 >= target.edibleMax * C.eatRatio &&
        myMax >= C.minSplitMass
      ) {
        const away = Math.hypot(target.ex - me.x, target.ey - me.y) || 1;
        // складова швидкості цілі «від нас» (мінус - біжить на нас)
        const vr =
          (target.vx * (target.ex - me.x) + target.vy * (target.ey - me.y)) / away;
        const gap = Math.max(0, dist - myR - rr);
        const reach =
          (C.splitImpulse / C.impulseFriction + radiusOf(myMax / 2) * 0.8) * 1.15;
        const gapEff = gap + vr * 0.6;
        let chance = 1 - Math.max(0, gapEff) / reach;
        if (trapped) chance += 0.1;
        if (corner) chance += 0.15;
        if (chance >= B.splitMinCatch) {
          split = true;
          brain.lastSplitAt = now;
        }
      }
    } else {
      brain.targetPid = 0;
      brain.ambush = null;
    }

    if (!target) {
      // ---- збір частин, якщо ділились ----
      if (
        p.cells.length > 1 &&
        now - brain.lastEngageAt >= B.regroupAfterMs &&
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
          dirX = big.x - mx / mm;
          dirY = big.y - my / mm;
        }
      }
      if (dirX === 0 && dirY === 0) {
        // ---- бонуси й найближча їжа ----
        let best = Infinity;
        let tx = 0;
        let ty = 0;
        world.foodNear(me.x, me.y, B.foodRadius, (f) => {
          const d = Math.hypot(f.x - me.x, f.y - me.y);
          if (d < best) {
            best = d;
            tx = f.x;
            ty = f.y;
          }
        });
        for (const b of world.bonuses) {
          const d = Math.hypot(b.x - me.x, b.y - me.y);
          if (d < B.bonusRadius && d * 0.35 < best) {
            best = d * 0.35;
            tx = b.x;
            ty = b.y;
          }
        }
        if (best < Infinity) {
          dirX = tx - me.x;
          dirY = ty - me.y;
        } else if (crowd) {
          // «натовп»: на окраїну, подалі від центру скупчення, вздовж стіни
          const cx = crowdX / humansNear;
          const cy = crowdY / humansNear;
          const away = Math.hypot(me.x - cx, me.y - cy) || 1;
          const awx = (me.x - cx) / away;
          const awy = (me.y - cy) / away;
          const wl = nearestWall(me.x, me.y);
          if (wl.d > B.outskirtsMargin) {
            dirX = wl.nx * 0.6 + awx * 0.4;
            dirY = wl.ny * 0.6 + awy * 0.4;
          } else {
            const sgn = -wl.ny * awx + wl.nx * awy >= 0 ? 1 : -1;
            dirX = -wl.ny * sgn;
            dirY = wl.nx * sgn;
          }
        } else {
          if (now >= brain.wanderUntil) {
            brain.wanderAngle = rng() * TWO_PI;
            brain.wanderUntil = now + 2000 + rng() * 3000;
          }
          dirX = Math.cos(brain.wanderAngle);
          dirY = Math.sin(brain.wanderAngle);
        }
      }
    }
  }
  if (engaged) brain.lastEngageAt = now;

  // нормалізуємо бажаний напрямок і додаємо відштовхування від стін і небезпечних кущів
  const dl = Math.hypot(dirX, dirY);
  if (dl > 0) {
    dirX /= dl;
    dirY /= dl;
  }
  let mx = dirX;
  let my = dirY;
  if (!hold) {
    mx += ox;
    my += oy;
  }
  let desired = mx === 0 && my === 0 ? p.angle : Math.atan2(my, mx);

  // ---- застрягання: рухаємось, а на місці ----
  const stationary = hold || frozen || p.power === 0;
  if (brain.stuckAt === 0 || stationary) {
    brain.stuckX = me.x;
    brain.stuckY = me.y;
    brain.stuckAt = now;
  } else if (now - brain.stuckAt >= B.stuckCheckMs) {
    if (Math.hypot(me.x - brain.stuckX, me.y - brain.stuckY) < B.stuckMinMove) {
      brain.unstuckUntil = now + B.unstuckMs;
      brain.unstuckAngle =
        Math.atan2(W / 2 - me.y, W / 2 - me.x) + (rng() - 0.5) * 1.2;
    }
    brain.stuckX = me.x;
    brain.stuckY = me.y;
    brain.stuckAt = now;
  }
  if (!threatened && now < brain.unstuckUntil) {
    desired = brain.unstuckAngle;
    urgent = true;
  }

  // ---- плавний поворот (ліміт кута за думку; на втечі швидше) ----
  const maxTurn = B.maxTurnPerThink * (urgent ? 2 : 1);
  const delta = wrap(desired - p.angle);
  p.angle = wrap(p.angle + Math.max(-maxTurn, Math.min(maxTurn, delta)));
  p.power = hold ? 0 : 1;
  if (split) world.queueSplit(p.id);
}
