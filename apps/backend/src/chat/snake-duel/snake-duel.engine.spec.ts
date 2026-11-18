import {
  FOOD_HEAD_CLEARANCE,
  INPUT_BUFFER,
  RESPAWN_HEAD_CLEARANCE,
  RESPAWN_LOOKAHEAD,
  createMatch,
  pickRespawn,
  placeFairFood,
  placeFood,
  queueDirection,
  stepMatch,
  type Dir,
  type DuelLevel,
  type DuelMatch,
  type SnakeState,
} from './snake-duel.engine';
import { DUEL_LEVELS, DUEL_LEVEL_ID } from './snake-duel.levels';

const level = DUEL_LEVELS[DUEL_LEVEL_ID];
const rng = () => 0.5;
const RESPAWN_TICKS = Math.ceil(level.respawnMs / level.tickMs(0));

function snake(cells: Array<[number, number]>, dir: Dir): SnakeState {
  return {
    body: cells.map(([x, y]) => ({ x, y })),
    dir,
    queue: [],
    alive: true,
    respawnAtTick: null,
  };
}

function match(
  a: SnakeState,
  b: SnakeState,
  food: [number, number] = [0, 15],
  scores: [number, number] = [0, 0],
): DuelMatch {
  return { snakes: [a, b], scores, food: { x: food[0], y: food[1] }, tick: 0 };
}

const cellEq = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  a.x === b.x && a.y === b.y;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

describe('level', () => {
  it('is a race to 30 at a constant 110 ms tick', () => {
    expect(level.targetScore).toBe(30);
    expect(level.respawnMs).toBe(3000);
    expect([0, 100, 1000, 5000].map((t) => level.tickMs(t))).toEqual([110, 110, 110, 110]);
  });
});

describe('createMatch', () => {
  it('spawns length-3 snakes, score 0:0, not facing each other head-on', () => {
    const m = createMatch(level, rng);
    expect(m.scores).toEqual([0, 0]);
    expect(m.snakes[0].body).toHaveLength(3);
    expect(m.snakes[1].body).toHaveLength(3);
    expect(m.snakes[0].body[0].y).not.toBe(m.snakes[1].body[0].y);
    expect(stepMatch(m, level, rng).winner).toBeNull();
    expect(m.snakes[0].alive && m.snakes[1].alive).toBe(true);
  });

  it('places the first food at equal Manhattan distance from both heads', () => {
    for (const seed of [0, 0.25, 0.5, 0.99]) {
      const m = createMatch(level, () => seed);
      const [a, b] = [m.snakes[0].body[0], m.snakes[1].body[0]];
      expect(dist(a, m.food)).toBe(dist(b, m.food));
    }
  });

  it('never puts food on a snake or an obstacle', () => {
    const withWall: DuelLevel = { ...level, obstacles: () => [{ x: 12, y: 8 }] };
    const m = createMatch(withWall, () => 0.3);
    expect(m.food).not.toEqual({ x: 12, y: 8 });
    for (const s of m.snakes) expect(s.body.some((c) => cellEq(c, m.food))).toBe(false);
    expect(placeFairFood(withWall, m.snakes, () => 0)).toBeDefined();
  });
});

describe('eating', () => {
  it('gives +1 score and grows the snake by one cell', () => {
    const m = match(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[20, 12], [21, 12], [22, 12]], 'left'), [6, 5]);
    const r = stepMatch(m, level, rng);
    expect(r.ate).toEqual([true, false]);
    expect(m.scores).toEqual([1, 0]);
    expect(m.snakes[0].body).toHaveLength(4);
    expect(m.snakes[1].body).toHaveLength(3);
    expect(r.winner).toBeNull();
  });

  it('puts new food straight away: free cell, not near any head', () => {
    for (const seed of [0, 0.2, 0.5, 0.8, 0.99]) {
      const m = match(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[20, 12], [21, 12], [22, 12]], 'left'), [6, 5]);
      stepMatch(m, level, () => seed);
      expect(cellEq(m.food, { x: 6, y: 5 })).toBe(false);
      for (const s of m.snakes) {
        expect(s.body.some((c) => cellEq(c, m.food))).toBe(false);
        expect(dist(s.body[0], m.food)).toBeGreaterThanOrEqual(FOOD_HEAD_CLEARANCE);
      }
    }
  });

  it('does not grow without eating (tail follows)', () => {
    const m = match(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[20, 12], [21, 12], [22, 12]], 'left'));
    stepMatch(m, level, rng);
    expect(m.snakes[0].body).toEqual([{ x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }]);
  });

  it('simultaneous grab: nobody scores, the food moves elsewhere', () => {
    const m = match(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[7, 5], [8, 5], [9, 5]], 'left'), [6, 5]);
    const r = stepMatch(m, level, rng);
    expect(r.ate).toEqual([false, false]);
    expect(r.foodRelocated).toBe(true);
    expect(m.scores).toEqual([0, 0]);
    expect(cellEq(m.food, { x: 6, y: 5 })).toBe(false);
    expect(m.snakes[0].body).toHaveLength(3);
    expect(m.snakes[1].body).toHaveLength(3);
  });
});

describe('winning', () => {
  it('the first to eat the 30th piece wins', () => {
    const m = match(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[20, 12], [21, 12], [22, 12]], 'left'), [6, 5], [29, 28]);
    const r = stepMatch(m, level, rng);
    expect(r.winner).toBe(0);
    expect(m.scores).toEqual([30, 28]);
  });

  it('29 is not enough', () => {
    const m = match(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[20, 12], [21, 12], [22, 12]], 'left'), [6, 5], [28, 29]);
    expect(stepMatch(m, level, rng).winner).toBeNull();
  });
});

describe('death and respawn', () => {
  it('a wall hit kills the snake but keeps the score; the rival is untouched', () => {
    const m = match(snake([[0, 5], [1, 5], [2, 5]], 'left'), snake([[20, 12], [21, 12], [22, 12]], 'left'), [10, 10], [7, 4]);
    const r = stepMatch(m, level, rng);
    expect(r.died).toEqual([true, false]);
    expect(m.snakes[0].alive).toBe(false);
    expect(m.scores).toEqual([7, 4]);
    expect(m.snakes[0].respawnAtTick).toBe(m.tick + RESPAWN_TICKS);
    expect(m.snakes[1].alive).toBe(true);
  });

  it('own body kills too', () => {
    const m = match(
      snake([[5, 5], [5, 6], [6, 6], [6, 5], [6, 4]], 'up'),
      snake([[20, 12], [21, 12], [22, 12]], 'left'),
    );
    m.snakes[0].queue.push('right');
    expect(stepMatch(m, level, rng).died[0]).toBe(true);
  });

  it('running into the rival body kills; a dead snake takes no part in collisions', () => {
    const m = match(snake([[0, 5], [1, 5], [2, 5]], 'left'), snake([[10, 4], [10, 5], [10, 6]], 'down'));
    stepMatch(m, level, rng); // A умирает о стену
    expect(m.snakes[0].alive).toBe(false);
    // B проезжает сквозь «призрака» A, но тело A остаётся для отрисовки
    const ghost = m.snakes[0].body.map((c) => ({ ...c }));
    m.snakes[1].body = [{ x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }];
    m.snakes[1].dir = 'left';
    const r = stepMatch(m, level, rng);
    expect(r.died[1]).toBe(false);
    expect(m.snakes[0].body).toEqual(ghost);
    // и еда не появляется на призраке
    for (let i = 0; i < 20; i += 1) {
      const food = placeFood(level, m, () => i / 20);
      expect(ghost.some((c) => cellEq(c, food))).toBe(false);
    }
  });

  it('a dead snake cannot be steered', () => {
    const m = match(snake([[0, 5], [1, 5], [2, 5]], 'left'), snake([[20, 12], [21, 12], [22, 12]], 'left'));
    stepMatch(m, level, rng);
    expect(queueDirection(m, 0, 'up')).toBe(false);
  });

  it('respawns after 3 seconds with length 3, the score kept and a safe place', () => {
    const m = match(snake([[0, 5], [1, 5], [2, 5]], 'left'), snake([[12, 8], [13, 8], [14, 8]], 'left'), [20, 2], [9, 3]);
    stepMatch(m, level, rng);
    expect(m.snakes[0].alive).toBe(false);
    for (let i = 0; i < RESPAWN_TICKS - 1; i += 1) {
      // держим соперника на месте, чтобы он сам не умер
      m.snakes[1].body = [{ x: 12, y: 8 }, { x: 13, y: 8 }, { x: 14, y: 8 }];
      m.snakes[1].dir = 'left';
      stepMatch(m, level, rng);
      expect(m.snakes[0].alive).toBe(false);
    }
    m.snakes[1].body = [{ x: 12, y: 8 }, { x: 13, y: 8 }, { x: 14, y: 8 }];
    const r = stepMatch(m, level, rng);
    expect(r.respawned[0]).toBe(true);
    const s = m.snakes[0];
    expect(s.alive).toBe(true);
    expect(s.body).toHaveLength(3);
    expect(m.scores).toEqual([9, 3]);
    const rival = m.snakes[1].body[0];
    for (const c of s.body) {
      expect(dist(c, rival)).toBeGreaterThanOrEqual(RESPAWN_HEAD_CLEARANCE);
      expect(m.snakes[1].body.some((b) => cellEq(b, c))).toBe(false);
    }
  });

  it('never respawns closer than 4 cells to the rival head or right in front of it', () => {
    const rival = snake([[12, 8], [11, 8], [10, 8]], 'right');
    for (const seed of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 0.999]) {
      const m = match(snake([[0, 0], [1, 0], [2, 0]], 'left'), rival, [3, 12]);
      m.snakes[0].alive = false;
      const spawn = pickRespawn(level, m, 0, () => seed);
      const cells = [0, 1, 2].map((i) => {
        const back = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] }[spawn.dir];
        return { x: spawn.head.x + back[0] * i, y: spawn.head.y + back[1] * i };
      });
      for (const c of cells) {
        expect(dist(c, rival.body[0])).toBeGreaterThanOrEqual(RESPAWN_HEAD_CLEARANCE);
        for (let i = 1; i <= RESPAWN_LOOKAHEAD; i += 1) {
          expect(cellEq(c, { x: 12 + i, y: 8 })).toBe(false);
        }
        expect(c.x >= 0 && c.y >= 0 && c.x < 24 && c.y < 16).toBe(true);
        expect(rival.body.some((b) => cellEq(b, c))).toBe(false);
      }
    }
  });

  it('head-on: both die, both respawn', () => {
    const m = match(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[7, 5], [8, 5], [9, 5]], 'left'), [20, 2], [5, 6]);
    const r = stepMatch(m, level, rng);
    // головы входят в одну и ту же клетку? нет: 6 и 6 — это одна клетка (5→6, 7→6)
    expect(r.died).toEqual([true, true]);
    expect(m.scores).toEqual([5, 6]);
    for (let i = 0; i < RESPAWN_TICKS; i += 1) stepMatch(m, level, rng);
    expect(m.snakes[0].alive && m.snakes[1].alive).toBe(true);
    expect(m.snakes[0].body).toHaveLength(3);
    expect(m.snakes[1].body).toHaveLength(3);
    expect(m.snakes[0].body.some((c) => m.snakes[1].body.some((o) => cellEq(c, o)))).toBe(false);
    expect(m.scores).toEqual([5, 6]);
  });

  it('swapping places (head into the rival\'s previous cell) kills both', () => {
    const m = match(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[6, 5], [7, 5], [8, 5]], 'left'));
    expect(stepMatch(m, level, rng).died).toEqual([true, true]);
  });

  it('eating and dying on one tick gives nothing', () => {
    // голова A входит в еду и одновременно в голову B
    const m = match(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[7, 5], [8, 5], [9, 5]], 'left'), [6, 5]);
    m.food = { x: 6, y: 5 };
    const r = stepMatch(m, level, rng);
    expect(r.ate).toEqual([false, false]);
    expect(m.scores).toEqual([0, 0]);
  });
});

describe('queueDirection', () => {
  it('ignores reverses and repeats, and caps the buffer', () => {
    const m = match(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[20, 12], [21, 12], [22, 12]], 'left'));
    expect(queueDirection(m, 0, 'left')).toBe(false);
    expect(queueDirection(m, 0, 'right')).toBe(false);
    expect(queueDirection(m, 0, 'up')).toBe(true);
    expect(queueDirection(m, 0, 'left')).toBe(true);
    expect(m.snakes[0].queue.length).toBeLessThanOrEqual(INPUT_BUFFER);
    expect(queueDirection(m, 0, 'down')).toBe(false);
  });
});
