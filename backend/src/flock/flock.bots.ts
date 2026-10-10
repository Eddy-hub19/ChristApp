import { FLOCK_CONFIG } from './flock.config';
import {
  radiusOf,
  type FlockWorld,
  type Player,
  type Rng,
} from './flock.engine';

const C = FLOCK_CONFIG;

export type Personality = 'cautious' | 'aggressive' | 'balanced';

interface Brain {
  personality: Personality;
  /** Зсув, щоб боти думали в різні тіки. */
  offset: number;
  wanderAngle: number;
  wanderUntil: number;
}

interface Profile {
  fleeRadius: number;
  huntRadius: number;
  foodRadius: number;
  splitAttackChance: number;
}

const PROFILES: Record<Personality, Profile> = {
  cautious: {
    fleeRadius: 700,
    huntRadius: 200,
    foodRadius: 420,
    splitAttackChance: 0,
  },
  balanced: {
    fleeRadius: 520,
    huntRadius: 420,
    foodRadius: 380,
    splitAttackChance: 0.12,
  },
  aggressive: {
    fleeRadius: 380,
    huntRadius: 760,
    foodRadius: 300,
    splitAttackChance: 0.45,
  },
};

export const BOT_NAMES = [
  'Овечка Долі',
  'Ягня Сем',
  'Баранчик Бо',
  'Пухнастик',
  'Кучерявка',
  'Хмаринка',
  'Вовчок Сірко',
  'Лапка',
  'Білявка',
  'Ягнятко Мі',
  'Рогатик',
  'Мʼякуш',
  'Пастушка Зоря',
  'Хутринка',
  'Барашек Тім',
  'Сніжинка',
  'Сіра Тінь',
  'Бубка',
  'Пушок',
  'Кучерик',
  'Лунка',
  'Грізний Хвіст',
  'Вовна',
  'Мілка',
];

export function initBot(p: Player, rng: Rng, personality?: Personality) {
  const roll = rng();
  const brain: Brain = {
    personality:
      personality ??
      (roll < 0.33 ? 'cautious' : roll < 0.7 ? 'balanced' : 'aggressive'),
    offset: Math.floor(rng() * C.botThinkEvery),
    wanderAngle: rng() * Math.PI * 2,
    wanderUntil: 0,
  };
  p.brain = brain;
}

/**
 * Простий ШІ: утеча від більших, полювання на менших, їжа/бонуси, блукання.
 * Викликається щотіку, але рахує тільки раз на botThinkEvery (зі зсувом) -
 * між думками бот їде за попереднім рішенням.
 */
export function thinkBot(world: FlockWorld, p: Player, rng: Rng) {
  const brain = p.brain as Brain | undefined;
  if (!brain || !p.alive) return;
  if ((world.tickNo + brain.offset) % C.botThinkEvery !== 0) return;

  const me = world.centroid(p);
  let myMax = 0;
  for (const c of p.cells) if (c.mass > myMax) myMax = c.mass;
  const prof = PROFILES[brain.personality];

  let fx = 0;
  let fy = 0;
  let threatened = false;
  let preyDist = Infinity;
  let preyX = 0;
  let preyY = 0;
  let preyMass = 0;

  const scan = Math.max(prof.fleeRadius, prof.huntRadius) + radiusOf(myMax);
  world.queryCells(me.x, me.y, scan, (c) => {
    if (c.pid === p.id) return;
    const o = world.players.get(c.pid);
    if (!o || !o.alive || o.paused) return; // гравців у паузі боти не помічають
    if (world.isGhost(o) || world.isGhost(p)) return;
    const d = Math.hypot(c.x - me.x, c.y - me.y) || 1;
    if (
      c.mass >= myMax * C.eatRatio &&
      !world.isShielded(p) &&
      d < prof.fleeRadius + radiusOf(c.mass)
    ) {
      // чим ближче загроза, тим сильніше відштовхування
      const w = 1 / (d * d);
      fx += ((me.x - c.x) / d) * w * 1e5;
      fy += ((me.y - c.y) / d) * w * 1e5;
      threatened = true;
    } else if (
      myMax >= c.mass * C.eatRatio &&
      !world.isShielded(o) &&
      // новачків-людей боти не переслідують (див. botGraceMs)
      !(!o.bot && world.now - o.spawnedAt < C.botGraceMs) &&
      d < prof.huntRadius
    ) {
      const score = d - c.mass; // більша здобич ціннішa
      if (score < preyDist) {
        preyDist = score;
        preyX = c.x;
        preyY = c.y;
        preyMass = c.mass;
      }
    }
  });

  let angle: number | null = null;
  let split = false;

  // куші: великим об'їжджати
  if (myMax > C.thornMass * C.thornPopRatio) {
    for (const t of world.thorns) {
      const d = Math.hypot(t.x - me.x, t.y - me.y) || 1;
      const safe = radiusOf(myMax) + radiusOf(t.mass) + 70;
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

  if (threatened) {
    angle = Math.atan2(fy, fx);
  } else if (preyDist < Infinity) {
    angle = Math.atan2(preyY - me.y, preyX - me.x);
    const dist = Math.hypot(preyX - me.x, preyY - me.y);
    // атака з поділом: половина маси ще має бути більшою за жертву
    if (
      dist < 380 &&
      p.cells.length < C.maxCellsPerPlayer / 2 &&
      myMax / 2 >= preyMass * C.eatRatio &&
      myMax >= C.minSplitMass &&
      rng() < prof.splitAttackChance
    ) {
      split = true;
    }
  } else {
    // найближча їжа
    let best = Infinity;
    let tx = 0;
    let ty = 0;
    world.foodNear(me.x, me.y, prof.foodRadius, (f) => {
      const d = Math.hypot(f.x - me.x, f.y - me.y);
      if (d < best) {
        best = d;
        tx = f.x;
        ty = f.y;
      }
    });
    for (const b of world.bonuses) {
      const d = Math.hypot(b.x - me.x, b.y - me.y);
      if (d < 450 && d * 0.5 < best) {
        best = d * 0.5;
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
    // легка корекція від стін/кущів
    if (fx !== 0 || fy !== 0) {
      angle = Math.atan2(Math.sin(angle) + fy, Math.cos(angle) + fx);
    }
  }

  p.angle = angle;
  p.power = 1;
  if (split) world.queueSplit(p.id);
}
