import { FLOCK_CONFIG } from './flock.config';
import {
  radiusOf,
  type FlockWorld,
  type Player,
  type Rng,
} from './flock.engine';

const C = FLOCK_CONFIG;
const B = C.boss;

interface BossBrain {
  /** Зсув, щоб думки Вожака не збігалися з тіком, де думають інші боти. */
  offset: number;
  wanderAngle: number;
  wanderUntil: number;
}

export function initBoss(p: Player, rng: Rng) {
  const brain: BossBrain = {
    offset: Math.floor(rng() * B.thinkEvery),
    wanderAngle: rng() * Math.PI * 2,
    wanderUntil: 0,
  };
  p.brain = brain;
}

/**
 * ШІ «Вожака»: сильніший за звичайних ботів, але чесний (ті самі правила рушія). Думає раз на boss.thinkEvery тіків.
 * Полює на велику здобич (оцінка = відстань - маса * вага), ділиться для атаки, підбирає бонуси й їжу,
 * тікає від більших - і ховається в куші, у який вміщується; більші за куш гравці, що женуться слідом, рвуться об нього.
 * Правила новачків, щита й паузи тримає сам рушій (stepCellVsCell), тут вони дзеркалені, щоб не ганятись марно.
 */
export function thinkBoss(world: FlockWorld, p: Player, rng: Rng) {
  const brain = p.brain as BossBrain | undefined;
  if (!brain || !p.alive || p.paused) return;
  if ((world.tickNo + brain.offset) % B.thinkEvery !== 0) return;

  const me = world.centroid(p);
  let myMax = 0;
  for (const c of p.cells) if (c.mass > myMax) myMax = c.mass;
  const myR = radiusOf(myMax);
  const shielded = world.isShielded(p);

  let fx = 0;
  let fy = 0;
  let threatened = false;
  let preyScore = Infinity;
  let preyX = 0;
  let preyY = 0;
  let preyMass = 0;

  const scan = Math.max(B.fleeRadius, B.huntRadius) + myR;
  world.queryCells(me.x, me.y, scan, (c) => {
    if (c.pid === p.id) return;
    const o = world.players.get(c.pid);
    if (!o || !o.alive || o.paused) return;
    if (world.isGhost(o) || world.isGhost(p)) return;
    const d = Math.hypot(c.x - me.x, c.y - me.y) || 1;
    if (
      c.mass >= myMax * C.eatRatio &&
      !shielded &&
      d < B.fleeRadius + radiusOf(c.mass)
    ) {
      const w = 1 / (d * d);
      fx += ((me.x - c.x) / d) * w * 1e5;
      fy += ((me.y - c.y) / d) * w * 1e5;
      threatened = true;
    } else if (
      myMax >= c.mass * C.eatRatio &&
      c.mass >= B.preyMinMass &&
      !world.isShielded(o) &&
      // новачків-людей не чіпаємо (див. botGraceMs; рушій теж не дасть їх з'їсти)
      !(!o.bot && world.now - o.spawnedAt < C.botGraceMs) &&
      d < B.huntRadius
    ) {
      const score = d - c.mass * B.preyMassWeight * B.aggression;
      if (score < preyScore) {
        preyScore = score;
        preyX = c.x;
        preyY = c.y;
        preyMass = c.mass;
      }
    }
  });

  // куші, що рвуть Вожака (менші за нього) - об'їжджаємо; ті, що більші за нього, - сховище
  if (myMax > C.thornMass * C.thornPopRatio) {
    for (const t of world.thorns) {
      if (radiusOf(t.mass) >= myR) continue;
      const d = Math.hypot(t.x - me.x, t.y - me.y) || 1;
      const safe = myR + radiusOf(t.mass) + 70;
      if (d < safe) {
        fx += ((me.x - t.x) / d) * 1.5;
        fy += ((me.y - t.y) / d) * 1.5;
      }
    }
  }

  // стіни
  const margin = 220;
  if (me.x < margin) fx += (margin - me.x) / margin;
  if (me.x > C.worldSize - margin)
    fx -= (me.x - (C.worldSize - margin)) / margin;
  if (me.y < margin) fy += (margin - me.y) / margin;
  if (me.y > C.worldSize - margin)
    fy -= (me.y - (C.worldSize - margin)) / margin;

  let angle: number;
  let hold = false;
  let split = false;

  if (threatened) {
    angle = Math.atan2(fy, fx);
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
      angle = Math.atan2(best.y - me.y, best.x - me.x);
      // всередині куща завмираємо: хто більший за кущ і женеться слідом - рветься об нього
      hold = best.d < best.r - myR * 0.2;
    }
  } else if (preyScore < Infinity) {
    angle = Math.atan2(preyY - me.y, preyX - me.x);
    const dist = Math.hypot(preyX - me.x, preyY - me.y);
    if (
      dist < 420 &&
      p.cells.length < 4 &&
      myMax / 2 >= preyMass * C.eatRatio &&
      myMax >= C.minSplitMass &&
      rng() < B.splitAttackChance * B.aggression
    ) {
      split = true;
    }
  } else {
    // бонуси й найближча їжа
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
      angle = Math.atan2(ty - me.y, tx - me.x);
    } else {
      if (world.now >= brain.wanderUntil) {
        brain.wanderAngle = rng() * Math.PI * 2;
        brain.wanderUntil = world.now + 2000 + rng() * 3000;
      }
      angle = brain.wanderAngle;
    }
    if (fx !== 0 || fy !== 0) {
      angle = Math.atan2(Math.sin(angle) + fy, Math.cos(angle) + fx);
    }
  }

  p.angle = angle;
  p.power = hold ? 0 : 1;
  if (split) world.queueSplit(p.id);
}
