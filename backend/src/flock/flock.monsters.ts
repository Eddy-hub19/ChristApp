import { FLOCK_CONFIG } from './flock.config';
import { radiusOf, type FlockWorld, type Player, type Rng } from './flock.engine';

const C = FLOCK_CONFIG;
const M = C.monsters;

interface MonsterBrain {
  /** Зсув, щоб думки чудовиськ не збігалися в одному тіку. */
  offset: number;
}

export function initMonster(p: Player, rng: Rng) {
  const brain: MonsterBrain = { offset: Math.floor(rng() * M.thinkEvery) };
  p.brain = brain;
}

/** Чи можна напасти на гравця: людина, жива, не на паузі, без щита й привида, не новачок (перші botGraceMs). */
function attackable(world: FlockWorld, o: Player | undefined): o is Player {
  return (
    !!o &&
    o.alive &&
    !o.bot &&
    !o.paused &&
    !world.isShielded(o) &&
    !world.isGhost(o) &&
    world.now - o.spawnedAt >= C.botGraceMs
  );
}

/**
 * Дешевий ШІ: рідше за звичайних ботів (раз на monsters.thinkEvery тіків) шукає найближчу клітину людини, на яку можна
 * напасти, - спершу в пространственій сітці навколо (aggroRadius), інакше біжить до найближчої такої людини на карті.
 * Лави не боїться (стежить лише за ціллю), ділитися й кидати не вміє. Між думками їде за попереднім напрямком.
 */
export function thinkMonster(world: FlockWorld, p: Player, _rng: Rng) {
  const brain = p.brain as MonsterBrain | undefined;
  if (!brain) return;
  if ((world.tickNo + brain.offset) % M.thinkEvery !== 0) return;
  const me = world.centroid(p);
  let tx = 0;
  let ty = 0;
  let best = Infinity;
  world.queryCells(me.x, me.y, M.aggroRadius, (c) => {
    const owner = world.players.get(c.pid);
    if (!attackable(world, owner)) return;
    const d = Math.hypot(c.x - me.x, c.y - me.y) - radiusOf(c.mass);
    if (d < best) {
      best = d;
      tx = c.x;
      ty = c.y;
    }
  });
  if (best === Infinity) {
    for (const o of world.players.values()) {
      if (!attackable(world, o)) continue;
      const c = world.centroid(o);
      const d = Math.hypot(c.x - me.x, c.y - me.y);
      if (d < best) {
        best = d;
        tx = c.x;
        ty = c.y;
      }
    }
  }
  if (best === Infinity) {
    p.power = 0;
    return;
  }
  p.angle = Math.atan2(ty - me.y, tx - me.x);
  p.power = 1;
}
