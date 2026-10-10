import { FLOCK_CONFIG as C } from './flock.config';
import { FlockWorld, radiusOf, speedOf } from './flock.engine';

function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Порожній світ без їжі й кущів: сцену розставляємо вручну. */
function emptyWorld() {
  const w = new FlockWorld(seeded());
  for (const m of w.foodChunks) m.clear();
  w.foodById.clear();
  w.thorns.length = 0;
  return w;
}

function player(w: FlockWorld, x: number, y: number, mass: number, name = 'p') {
  const p = w.addPlayer({ name, skin: 0 });
  p.effects = {};
  const c = p.cells[0];
  c.x = x;
  c.y = y;
  c.mass = mass;
  c.mergeAt = 0;
  p.power = 0;
  return p;
}

const step = (w: FlockWorld, n = 1) => {
  for (let i = 0; i < n; i++) {
    // не даємо фону поповнювати їжу під час точних сценаріїв
    w.tick(1 / C.tickHz);
    for (const m of w.foodChunks) m.clear();
    w.foodById.clear();
  }
};

describe('FlockWorld: рух і швидкість', () => {
  it('чим більша маса, тим повільніше', () => {
    expect(speedOf(500)).toBeLessThan(speedOf(30));
    expect(speedOf(1e7)).toBeGreaterThanOrEqual(C.minSpeed);
  });

  it('сервер сам обмежує швидкість: ввід не може її збільшити', () => {
    const w = emptyWorld();
    const p = player(w, 1000, 1000, 30);
    w.setInput(p.id, 0, 99); // сила > 1 обрізається
    expect(p.power).toBe(1);
    step(w, C.tickHz); // 1 с
    const travelled = p.cells[0].x - 1000;
    expect(travelled).toBeLessThanOrEqual(speedOf(30) * 1.05);
    expect(travelled).toBeGreaterThan(speedOf(30) * 0.9);
  });

  it('NaN у вводі ігнорується', () => {
    const w = emptyWorld();
    const p = player(w, 1000, 1000, 30);
    w.setInput(p.id, NaN, 1);
    expect(p.power).toBe(0);
  });

  it('клітина не виходить за межі світу', () => {
    const w = emptyWorld();
    const p = player(w, 5, 5, 30);
    w.setInput(p.id, Math.PI, 1);
    step(w, 60);
    expect(p.cells[0].x).toBeGreaterThanOrEqual(0);
  });
});

describe('FlockWorld: поїдання', () => {
  it('великий їсть того, хто менший на 25%+, і забирає масу', () => {
    const w = emptyWorld();
    const big = player(w, 1000, 1000, 100, 'big');
    const small = player(w, 1002, 1000, 70, 'small');
    big.effects = small.effects = {};
    step(w);
    expect(small.alive).toBe(false);
    expect(big.cells[0].mass).toBeCloseTo(170, 0);
    expect(big.killed).toContain('small');
    expect(big.kills).toBe(1);
    expect(w.deaths).toEqual([{ pid: small.id, killerPid: big.id }]);
  });

  it('майже рівних (менше ніж на 25%) не їсть', () => {
    const w = emptyWorld();
    const a = player(w, 1000, 1000, 100);
    const b = player(w, 1001, 1000, 90);
    step(w, 5);
    expect(a.alive && b.alive).toBe(true);
  });

  it("треба реально накрити центр: торкання краєм не з'їдає", () => {
    const w = emptyWorld();
    const big = player(w, 1000, 1000, 400);
    const small = player(w, 1000 + radiusOf(400) + 5, 1000, 100);
    step(w, 3);
    expect(big.alive && small.alive).toBe(true);
  });

  it('щит захищає від поїдання', () => {
    const w = emptyWorld();
    const big = player(w, 1000, 1000, 200);
    const small = player(w, 1001, 1000, 50);
    small.effects.shield = w.now + 5000;
    step(w, 3);
    expect(small.alive).toBe(true);
    expect(big.cells[0].mass).toBe(200);
  });

  it('привид: не їсть і його не їдять', () => {
    const w = emptyWorld();
    const big = player(w, 1000, 1000, 200);
    const small = player(w, 1001, 1000, 50);
    small.effects.ghost = w.now + 5000;
    step(w, 3);
    expect(small.alive).toBe(true);
    big.effects.ghost = w.now + 5000;
    small.effects = {};
    step(w, 3);
    expect(small.alive && big.alive).toBe(true);
  });

  it('стартовий щит тримається spawnShieldMs (5 с) і потім зникає', () => {
    const w = emptyWorld();
    const p = w.addPlayer({ name: 'n', skin: 1 });
    expect(C.spawnShieldMs).toBe(5000);
    expect(w.isShielded(p)).toBe(true);
    w.now += 4900;
    expect(w.isShielded(p)).toBe(true);
    w.now += 200;
    expect(w.isShielded(p)).toBe(false);
  });

  it('бот не їсть людину, що на арені менше botGraceMs, але їсть після', () => {
    const w = emptyWorld();
    const bot = w.addPlayer({ name: 'bot', skin: 0, bot: true });
    const human = w.addPlayer({ name: 'h', skin: 0 });
    for (const p of [bot, human]) p.effects = {};
    bot.cells[0].mass = 300;
    bot.cells[0].x = bot.cells[0].y = 1000;
    human.cells[0].mass = 40;
    human.cells[0].x = human.cells[0].y = 1000;
    step(w, 3);
    expect(human.alive).toBe(true); // новачок
    w.now += C.botGraceMs + 100;
    step(w, 2);
    expect(human.alive).toBe(false);
  });

  it('людина їсть ботів і людей одразу, без пільгового періоду', () => {
    const w = emptyWorld();
    const human = w.addPlayer({ name: 'h', skin: 0 });
    const bot = w.addPlayer({ name: 'bot', skin: 0, bot: true });
    for (const p of [bot, human]) p.effects = {};
    human.cells[0].mass = 300;
    human.cells[0].x = human.cells[0].y = 1000;
    bot.cells[0].mass = 40;
    bot.cells[0].x = bot.cells[0].y = 1000;
    step(w, 2);
    expect(bot.alive).toBe(false);
  });

  it('їжа росте масу; ✖2 подвоює приріст', () => {
    const w = new FlockWorld(seeded());
    const p = player(w, 1000, 1000, 40);
    const q = player(w, 2000, 2000, 40);
    for (const pl of [p, q]) {
      w.foodNear(pl.cells[0].x, pl.cells[0].y, 300, () => {});
    }
    // кладемо їжу рівно під клітини вручну
    const put = (x: number, y: number) => {
      const before = w.foodById.size;
      void before;
      const f = { id: 60000 + Math.floor(x), x, y, kind: 0 };
      w.foodById.set(f.id, f);
      const idx =
        Math.floor(y / C.chunkSize) * Math.ceil(C.worldSize / C.chunkSize) +
        Math.floor(x / C.chunkSize);
      w.foodChunks[idx].set(f.id, f);
    };
    put(1000, 1000);
    put(2000, 2000);
    q.effects.double = w.now + 9000;
    const mp = p.cells[0].mass;
    const mq = q.cells[0].mass;
    w.tick(1 / C.tickHz);
    expect(p.cells[0].mass - mp).toBeCloseTo(C.foodMass, 1);
    expect(q.cells[0].mass - mq).toBeCloseTo(C.foodMass * 2, 1);
  });
});

describe('FlockWorld: розділення, злиття, кидок', () => {
  it('поділ: маса навпіл, шматок летить уперед', () => {
    const w = emptyWorld();
    const p = player(w, 1000, 1000, 100);
    p.angle = 0;
    w.queueSplit(p.id);
    step(w, 2);
    expect(p.cells).toHaveLength(2);
    expect(p.cells[0].mass + p.cells[1].mass).toBeCloseTo(100, 0);
    expect(p.cells[1].x).toBeGreaterThan(p.cells[0].x);
  });

  it('малу масу ділити не можна; частота обмежена кулдауном', () => {
    const w = emptyWorld();
    const p = player(w, 1000, 1000, C.minSplitMass - 1);
    w.queueSplit(p.id);
    step(w);
    expect(p.cells).toHaveLength(1);
    p.cells[0].mass = 200;
    w.queueSplit(p.id);
    step(w);
    w.queueSplit(p.id); // одразу ж - кулдаун
    step(w);
    expect(p.cells).toHaveLength(2);
  });

  it('не більше maxCellsPerPlayer частин', () => {
    const w = emptyWorld();
    const p = player(w, 1000, 1000, 5000);
    for (let i = 0; i < 8; i++) {
      w.queueSplit(p.id);
      w.now += C.splitCooldownMs + 1;
      step(w);
    }
    expect(p.cells.length).toBeLessThanOrEqual(C.maxCellsPerPlayer);
  });

  it('частини зливаються тільки після mergeDelay', () => {
    const w = emptyWorld();
    const p = player(w, 1000, 1000, 200);
    w.queueSplit(p.id);
    step(w, 2);
    expect(p.cells).toHaveLength(2);
    // зводимо частини разом, але раніше за час злиття
    p.cells[1].x = p.cells[0].x;
    p.cells[1].y = p.cells[0].y;
    p.cells[1].vx = p.cells[1].vy = 0;
    step(w, 3);
    expect(p.cells).toHaveLength(2);
    w.now += C.mergeDelayMs + 100;
    p.cells[1].x = p.cells[0].x;
    p.cells[1].y = p.cells[0].y;
    step(w, 2);
    expect(p.cells).toHaveLength(1);
    expect(p.cells[0].mass).toBeCloseTo(200, 0);
  });

  it("кидок: маса зменшується, з'являється згусток, його можуть з'їсти", () => {
    const w = emptyWorld();
    const a = player(w, 1000, 1000, 100);
    a.angle = 0;
    w.queueThrow(a.id);
    step(w);
    expect(a.cells[0].mass).toBeCloseTo(100 - C.throwMass, 0);
    expect(w.blobs).toHaveLength(1);
    w.blobs[0].vx = w.blobs[0].vy = 0;
    const b = player(w, w.blobs[0].x, w.blobs[0].y, 40);
    const before = b.cells[0].mass;
    step(w, 3);
    expect(w.blobs).toHaveLength(0);
    expect(b.cells[0].mass).toBeGreaterThan(before);
  });
});

describe('FlockWorld: кущі', () => {
  it('великий, наїхавши на кущ, розсипається, маса зберігається', () => {
    const w = emptyWorld();
    const p = player(w, 1000, 1000, 400);
    w.thorns.push({ id: 1, x: 1000, y: 1000, mass: C.thornMass });
    step(w, 1);
    expect(p.cells.length).toBeGreaterThan(2);
    const total = p.cells.reduce((s, c) => s + c.mass, 0);
    expect(total).toBeCloseTo(400, 0);
  });

  it('вибух не повторюється щотіку (імунітет)', () => {
    const w = emptyWorld();
    const p = player(w, 1000, 1000, 400);
    w.thorns.push({ id: 1, x: 1000, y: 1000, mass: C.thornMass });
    step(w, 1);
    const n = p.cells.length;
    step(w, 2);
    expect(p.cells.length).toBe(n);
  });

  it('маленький куща не боїться (ховається за ним)', () => {
    const w = emptyWorld();
    const p = player(w, 1000, 1000, 40);
    w.thorns.push({ id: 1, x: 1000, y: 1000, mass: C.thornMass });
    step(w, 5);
    expect(p.cells).toHaveLength(1);
    expect(p.cells[0].mass).toBeCloseTo(40, 0);
  });
});

describe('FlockWorld: бонуси', () => {
  const putBonus = (w: FlockWorld, kind: any, x: number, y: number) =>
    w.bonuses.push({ id: w.bonuses.length + 1, x, y, kind });

  it.each(['speed', 'magnet', 'shield', 'ghost', 'double'] as const)(
    '%s вмикає ефект на заданий час',
    (kind) => {
      const w = emptyWorld();
      const p = player(w, 1000, 1000, 50);
      putBonus(w, kind, 1000, 1000);
      step(w);
      expect(w.hasEffect(p, kind)).toBe(true);
      expect(w.bonuses).toHaveLength(0);
      w.now += C.bonusDurations[kind] + 50;
      expect(w.hasEffect(p, kind)).toBe(false);
    },
  );

  it('золоте руно одразу додає масу', () => {
    const w = emptyWorld();
    const p = player(w, 1000, 1000, 100);
    putBonus(w, 'golden', 1000, 1000);
    step(w);
    expect(p.cells[0].mass).toBeCloseTo(
      100 + Math.max(C.goldenMinMass, 100 * C.goldenMassFraction),
      0,
    );
  });

  it('заморозка зупиняє найближчих суперників на 2 с', () => {
    const w = emptyWorld();
    const me = player(w, 1000, 1000, 50);
    const near = player(w, 1300, 1000, 50);
    const far = player(w, 2900, 2900, 50);
    putBonus(w, 'freeze', 1000, 1000);
    step(w);
    near.angle = 0;
    near.power = 1;
    far.power = 1;
    const x0 = near.cells[0].x;
    step(w, 3);
    expect(near.cells[0].x).toBeCloseTo(x0, 0);
    expect(far.cells[0].x).not.toBeCloseTo(2900, 0);
    expect(me.frozenUntil).toBe(0);
    w.now += 2100;
    step(w, 3);
    expect(near.cells[0].x).toBeGreaterThan(x0 + 1);
  });

  it('прискорення збільшує швидкість', () => {
    const w = emptyWorld();
    const a = player(w, 500, 500, 50);
    const b = player(w, 500, 1500, 50);
    b.effects.speed = w.now + 5000;
    a.angle = b.angle = 0;
    a.power = b.power = 1;
    step(w, 5);
    expect(b.cells[0].x - 500).toBeGreaterThan((a.cells[0].x - 500) * 1.3);
  });

  it('магніт притягує їжу', () => {
    const w = emptyWorld();
    const p = player(w, 1000, 1000, 50);
    p.effects.magnet = w.now + 5000;
    const f = { id: 5000, x: 1200, y: 1000, kind: 0 };
    w.foodById.set(f.id, f);
    w.foodChunks[
      Math.floor(1000 / C.chunkSize) * 10 + Math.floor(1200 / C.chunkSize)
    ].set(f.id, f);
    w.tick(1 / C.tickHz);
    expect(f.x).toBeLessThan(1200);
  });

  it("бонуси з'являються періодично, але не більше ліміту", () => {
    const w = emptyWorld();
    for (
      let i = 0;
      i < (C.bonusSpawnEveryMs / 1000) * C.tickHz * (C.maxBonuses + 2);
      i++
    )
      w.tick(1 / C.tickHz);
    expect(w.bonuses.length).toBeGreaterThan(0);
    expect(w.bonuses.length).toBeLessThanOrEqual(C.maxBonuses);
  });
});

describe('FlockWorld: ліміти і стан', () => {
  it('їжа поповнюється до ліміту, але не вище', () => {
    const w = new FlockWorld(seeded());
    expect(w.foodById.size).toBe(C.maxFood);
    const first = w.foodById.values().next().value!;
    // з'їли одну - поповнилось
    const p = player(w, first.x, first.y, 40);
    void p;
    for (let i = 0; i < 5; i++) w.tick(1 / C.tickHz);
    expect(w.foodById.size).toBeLessThanOrEqual(C.maxFood);
    expect(w.foodById.size).toBeGreaterThanOrEqual(C.maxFood - 1);
  });

  it('повторне переродження повертає початкову масу', () => {
    const w = emptyWorld();
    const big = player(w, 1000, 1000, 100);
    const victim = player(w, 1001, 1000, 50);
    step(w);
    expect(victim.alive).toBe(false);
    w.respawn(victim);
    expect(victim.alive).toBe(true);
    expect(victim.total).toBe(C.startMass);
    expect(big.alive).toBe(true);
  });

  it('час у топ-1 накопичується у лідера', () => {
    const w = emptyWorld();
    const a = player(w, 500, 500, 100);
    player(w, 2500, 2500, 50);
    step(w, C.tickHz);
    expect(a.topMs).toBeGreaterThan(900);
  });
});
