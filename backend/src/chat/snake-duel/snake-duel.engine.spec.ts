import {
  INPUT_BUFFER,
  createRound,
  placeFairFood,
  queueDirection,
  stepRound,
  type Dir,
  type DuelLevel,
  type DuelRound,
  type SnakeState,
} from './snake-duel.engine';
import { DUEL_LEVELS, DUEL_LEVEL_ID } from './snake-duel.levels';

const level = DUEL_LEVELS[DUEL_LEVEL_ID];

function snake(cells: Array<[number, number]>, dir: Dir): SnakeState {
  return {
    body: cells.map(([x, y]) => ({ x, y })),
    dir,
    queue: [],
    alive: true,
  };
}

function round(a: SnakeState, b: SnakeState, food: [number, number] = [0, 15]): DuelRound {
  return { snakes: [a, b], food: { x: food[0], y: food[1] }, tick: 0 };
}

describe('createRound', () => {
  it('spawns length-3 snakes in opposite corners, not facing each other head-on', () => {
    const r = createRound(level, () => 0.5);
    const [a, b] = r.snakes;
    expect(a.body).toHaveLength(3);
    expect(b.body).toHaveLength(3);
    expect(a.body[0].y).not.toBe(b.body[0].y);
    // за один хід нікуди не врізаються
    expect(stepRound(r, level).outcome).toBe('continue');
  });

  it('places food at equal Manhattan distance from both heads', () => {
    for (const seed of [0, 0.25, 0.5, 0.99]) {
      const r = createRound(level, () => seed);
      const [a, b] = [r.snakes[0].body[0], r.snakes[1].body[0]];
      const d = (h: { x: number; y: number }) =>
        Math.abs(h.x - r.food.x) + Math.abs(h.y - r.food.y);
      expect(d(a)).toBe(d(b));
    }
  });

  it('never puts food on a snake or an obstacle', () => {
    const withWall: DuelLevel = { ...level, obstacles: () => [{ x: 12, y: 8 }] };
    const r = createRound(withWall, () => 0.3);
    expect(r.food).not.toEqual({ x: 12, y: 8 });
    for (const s of r.snakes) {
      expect(s.body.some((c) => c.x === r.food.x && c.y === r.food.y)).toBe(false);
    }
    expect(placeFairFood(withWall, r.snakes, () => 0)).toBeDefined();
  });
});

describe('input buffer', () => {
  it('forbids 180° turns and repeats, applying turns on successive ticks', () => {
    const r = round(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[20, 10], [21, 10], [22, 10]], 'left'));
    expect(queueDirection(r, 0, 'left')).toBe(false); // розворот
    expect(queueDirection(r, 0, 'right')).toBe(false); // той самий напрямок
    expect(queueDirection(r, 0, 'up')).toBe(true);
    expect(queueDirection(r, 0, 'left')).toBe(true); // up → left допустимо
    expect(queueDirection(r, 0, 'down')).toBe(false); // буфер повний
    expect(r.snakes[0].queue).toHaveLength(INPUT_BUFFER);

    stepRound(r, level);
    expect(r.snakes[0].dir).toBe('up');
    expect(r.snakes[0].body[0]).toEqual({ x: 5, y: 4 });
    stepRound(r, level);
    expect(r.snakes[0].dir).toBe('left');
    expect(r.snakes[0].body[0]).toEqual({ x: 4, y: 4 });
  });

  it('rejects a reverse relative to the last queued direction', () => {
    const r = round(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[20, 10], [21, 10], [22, 10]], 'left'));
    queueDirection(r, 0, 'up');
    expect(queueDirection(r, 0, 'down')).toBe(false);
  });
});

describe('collisions', () => {
  it('wall: the snake dies, the rival wins', () => {
    const r = round(snake([[0, 5], [1, 5], [2, 5]], 'left'), snake([[10, 10], [11, 10], [12, 10]], 'left'));
    const res = stepRound(r, level);
    expect(res.died).toEqual([true, false]);
    expect(res.outcome).toBe('win1');
  });

  it('self: turning into its own body kills', () => {
    const body: Array<[number, number]> = [[5, 5], [5, 6], [6, 6], [6, 5], [6, 4]];
    const r = round(snake(body, 'up'), snake([[20, 10], [21, 10], [22, 10]], 'left'));
    queueDirection(r, 0, 'right');
    const res = stepRound(r, level);
    expect(res.died[0]).toBe(true);
    expect(res.outcome).toBe('win1');
  });

  it('may enter the cell its own tail is leaving', () => {
    const body: Array<[number, number]> = [[5, 5], [5, 6], [6, 6], [6, 5]];
    const r = round(snake(body, 'up'), snake([[20, 10], [21, 10], [22, 10]], 'left'));
    queueDirection(r, 0, 'right');
    const res = stepRound(r, level);
    expect(res.died[0]).toBe(false);
  });

  it("rival's body: the one who ran into it dies", () => {
    const a = snake([[5, 5], [4, 5], [3, 5]], 'right');
    const b = snake([[6, 6], [6, 5], [6, 4], [6, 3], [6, 2]], 'down');
    // голова b уходит вниз; клетка (6,5), куда входит a, остаётся в теле b
    const r = round(a, b);
    const res = stepRound(r, level);
    expect(res.died).toEqual([true, false]);
    expect(res.outcome).toBe('win1');
  });

  it('head-on into the same cell is a draw', () => {
    const r = round(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[7, 5], [8, 5], [9, 5]], 'left'));
    const res = stepRound(r, level);
    expect(res.died).toEqual([true, true]);
    expect(res.outcome).toBe('draw');
  });

  it('swapping places (head into the cell the rival just left) kills both', () => {
    const r = round(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[6, 5], [7, 5], [8, 5]], 'left'));
    const res = stepRound(r, level);
    expect(res.died).toEqual([true, true]);
    expect(res.outcome).toBe('draw');
  });

  it('dying on the very tick of eating does not win the round', () => {
    // a съедает еду, но b входит в голову a в той же клетке → оба погибают
    const r = round(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[7, 5], [8, 5], [9, 5]], 'left'), [6, 5]);
    expect(stepRound(r, level).outcome).toBe('draw');
  });

  it('dying into a wall on the eating tick loses to the rival', () => {
    const r = round(snake([[0, 5], [1, 5], [2, 5]], 'left'), snake([[10, 10], [11, 10], [12, 10]], 'left'), [-1, 5]);
    const res = stepRound(r, level);
    expect(res.outcome).toBe('win1');
  });

  it('an obstacle kills like a wall', () => {
    const lvl: DuelLevel = { ...level, obstacles: () => [{ x: 6, y: 5 }] };
    const r = round(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[20, 10], [21, 10], [22, 10]], 'left'));
    expect(stepRound(r, lvl).outcome).toBe('win1');
  });
});

describe('food', () => {
  it('first to eat (alone) wins the round and grows', () => {
    const r = round(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[20, 10], [21, 10], [22, 10]], 'left'), [6, 5]);
    const res = stepRound(r, level);
    expect(res.outcome).toBe('win0');
    expect(res.ate).toEqual([true, false]);
    expect(r.snakes[0].body).toHaveLength(4);
  });

  it('both reaching the food on the same tick is a draw (and the round ends, food is re-placed next round)', () => {
    const r = round(snake([[5, 5], [4, 5], [3, 5]], 'right'), snake([[6, 6], [7, 6], [8, 6]], 'up'), [6, 5]);
    const res = stepRound(r, level);
    expect(res.ate).toEqual([true, true]);
    expect(res.outcome).toBe('draw');
  });
});
