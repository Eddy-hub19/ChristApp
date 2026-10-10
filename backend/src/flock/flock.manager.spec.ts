import { FLOCK_CONFIG as C } from './flock.config';
import { FlockManager } from './flock.manager';
import {
  decodeBoard,
  decodeState,
  packetType,
  PKT_BOARD,
  PKT_STATE,
} from './protocol';

function setup() {
  const sent: { key: string; event: string; payload: any }[] = [];
  let t = 1_000_000;
  let seed = 11;
  const rng = () =>
    (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const mgr = new FlockManager(
    (key, event, payload) => sent.push({ key, event, payload }),
    rng,
    () => t,
  );
  return { mgr, sent, advance: (ms: number) => (t += ms), time: () => t };
}

describe('FlockManager', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => (ctx = setup()));
  afterEach(() => ctx.mgr.dispose());

  it('без живих гравців арени немає (боти сплять)', () => {
    expect(ctx.mgr.isActive()).toBe(false);
    expect(ctx.mgr.stats()).toEqual([]);
  });

  it('перший гравець будить арену з ботами, останній - вимикає її повністю', () => {
    const r = ctx.mgr.join('c1', 'u1', 'Аня', 1);
    expect(r.ok).toBe(true);
    expect(ctx.mgr.isActive()).toBe(true);
    expect(ctx.mgr.stats()[0].bots).toBe(C.botTarget);
    ctx.mgr.leave('c1');
    expect(ctx.mgr.isActive()).toBe(false);
    expect(ctx.mgr._arena(1)).toBeUndefined();
  });

  it('боти зменшуються, коли приходять люди (але не нижче мінімуму)', () => {
    ctx.mgr.join('c0', 'u0', 'P0', 0);
    expect(ctx.mgr.stats()[0].bots).toBe(C.botTarget);
    for (let i = 1; i < C.maxHumansPerArena; i++) {
      ctx.mgr.join(`c${i}`, `u${i}`, `P${i}`, 0);
    }
    const s = ctx.mgr.stats()[0];
    expect(s.humans).toBe(C.maxHumansPerArena);
    expect(s.bots).toBe(
      Math.max(C.botMin, Math.min(C.botTarget, C.botTotalTarget - s.humans)),
    );
    expect(s.bots).toBeLessThan(C.botTarget);
    expect(s.bots).toBeGreaterThanOrEqual(C.botMin);
  });

  it('арена одна й має ліміт людей: сьомий - відмова full, без входу', () => {
    expect(C.maxArenas).toBe(1);
    for (let i = 0; i < C.maxHumansPerArena; i++) {
      expect(ctx.mgr.join(`c${i}`, `u${i}`, 'P', 0).ok).toBe(true);
    }
    expect(ctx.mgr.stats()).toHaveLength(1);
    const over = ctx.mgr.join('extra', 'ux', 'P', 0);
    expect(over).toEqual({ ok: false, error: 'full' });
    expect(ctx.mgr.stats()[0].humans).toBe(C.maxHumansPerArena);
    // звільнилось місце - новий гравець заходить
    ctx.mgr.leave('c0');
    expect(ctx.mgr.join('extra', 'ux', 'P', 0).ok).toBe(true);
  });

  it('при ліміті двох арен нова відкривається, лише коли перша заповнена', () => {
    const cfg = C as unknown as Record<string, number>;
    const prev = cfg.maxArenas;
    cfg.maxArenas = 2;
    try {
      for (let i = 0; i < C.maxHumansPerArena; i++)
        ctx.mgr.join(`c${i}`, `u${i}`, 'P', 0);
      expect(ctx.mgr.stats()).toHaveLength(1);
      expect(ctx.mgr.join('x', 'ux', 'P', 0).ok).toBe(true);
      expect(ctx.mgr.stats()).toHaveLength(2);
    } finally {
      cfg.maxArenas = prev;
    }
  });

  it('один користувач у двох вкладках = одна сесія', () => {
    ctx.mgr.join('a', 'same', 'X', 0);
    ctx.mgr.join('b', 'same', 'X', 0);
    expect(ctx.mgr.stats()[0].humans).toBe(1);
  });

  it('арена шле стан і таблицю лідерів бінарними пакетами тільки своїм гравцям', () => {
    ctx.mgr.join('c1', 'u1', 'Аня', 1);
    const arena = ctx.mgr._arena(1)!;
    for (let i = 0; i < C.tickHz + 1; i++) arena.step();
    const states = ctx.sent.filter((m) => m.event === 's');
    expect(states.length).toBe(C.tickHz + 1);
    expect(states.every((m) => m.key === 'c1')).toBe(true);
    expect(packetType(states[0].payload)).toBe(PKT_STATE);
    const first = decodeState(states[0].payload);
    // перший пакет містить знімок чанків їжі навколо; наступні - лише дельти
    expect(first.chunks.length).toBeGreaterThan(0);
    const next = decodeState(states[3].payload);
    expect(next.chunks.length).toBeLessThanOrEqual(first.chunks.length);
    const boards = ctx.sent.filter((m) => m.event === 'l');
    expect(boards.length).toBeGreaterThan(0);
    expect(packetType(boards[0].payload)).toBe(PKT_BOARD);
    expect(decodeBoard(boards[0].payload).top.length).toBeGreaterThan(0);
  });

  it('гравець бачить лише те, що поруч (область видимості)', () => {
    ctx.mgr.join('c1', 'u1', 'Аня', 1);
    const arena = ctx.mgr._arena(1)!;
    arena.step();
    const st = decodeState(ctx.sent.find((m) => m.event === 's')!.payload);
    const total = arena.world.players.size;
    expect(st.cells.length).toBeLessThan(total);
    const me = st.cells.find((c) => c.pid === st.selfPid)!;
    const R =
      arena.world.viewRadius(arena.world.players.get(st.selfPid)!) * 1.15;
    for (const c of st.cells) {
      expect(Math.abs(c.x - me.x)).toBeLessThanOrEqual(R + 1);
      expect(Math.abs(c.y - me.y)).toBeLessThanOrEqual(R + 1);
    }
  });

  it('форма області видимості залежить від екрана, площа - ні', () => {
    ctx.mgr.join('c1', 'u1', 'Аня', 1);
    const arena = ctx.mgr._arena(1)!;
    const w = arena.world;
    const me = [...w.players.values()].find((p) => !p.bot)!;
    const bot = [...w.players.values()].find((p) => p.bot)!;
    me.cells.forEach((c) => {
      c.x = 1500;
      c.y = 1500;
    });
    const cen = w.centroid(me);
    const R = w.viewRadius(me);
    // ціль за межами квадрата, але в межах широкого екрана
    bot.cells.forEach((c) => {
      c.x = cen.x + R * 1.15 * 1.3;
      c.y = cen.y;
      c.mass = 20;
    });
    bot.effects.shield = w.now + 60_000;
    const seen = () => {
      ctx.sent.length = 0;
      arena.step();
      const st = decodeState(ctx.sent.find((m) => m.event === 's')!.payload);
      return st.cells.some((c) => c.pid === bot.id);
    };
    expect(seen()).toBe(false); // квадрат (aspect=1) не бачить
    ctx.mgr.input('c1', 0, 0, false, false, 2.2); // широкий екран
    bot.cells.forEach((c) => {
      c.x = cen.x + R * 1.15 * 1.3;
      c.y = cen.y;
    });
    expect(seen()).toBe(true);
    // а по вертикалі такий екран бачить менше, ніж квадрат
    bot.cells.forEach((c) => {
      c.x = cen.x;
      c.y = cen.y + R * 1.15 * 0.9;
    });
    expect(seen()).toBe(false);
  });

  it('співвідношення сторін обмежене (не можна зажадати нескінченний огляд)', () => {
    ctx.mgr.join('c1', 'u1', 'Аня', 1);
    ctx.mgr.input('c1', 0, 0, false, false, 1e9);
    const arena = ctx.mgr._arena(1)!;
    const me = [...arena.world.players.values()].find((p) => !p.bot)!;
    const bot = [...arena.world.players.values()].find((p) => p.bot)!;
    me.cells.forEach((c) => {
      c.x = 1000;
      c.y = 1500;
    });
    const cen = arena.world.centroid(me);
    bot.cells.forEach((c) => {
      c.x = Math.min(
        3190,
        cen.x +
          arena.world.viewRadius(me) * 1.15 * Math.sqrt(C.aspectMax) * 1.2,
      );
      c.y = cen.y;
    });
    ctx.sent.length = 0;
    arena.step();
    const st = decodeState(ctx.sent.find((m) => m.event === 's')!.payload);
    expect(st.cells.some((c) => c.pid === bot.id)).toBe(false);
  });

  it('ввід обмежений за частотою (античіт)', () => {
    ctx.mgr.join('c1', 'u1', 'Аня', 1);
    const w = ctx.mgr._arena(1)!.world;
    const pid = [...w.players.values()].find((p) => !p.bot)!.id;
    for (let i = 0; i < 40; i++) ctx.mgr.input('c1', 1, 1, false, false);
    ctx.mgr.input('c1', 2, 1, false, false); // 41-ше за секунду ігнорується
    expect(w.players.get(pid)!.angle).toBe(1);
    ctx.advance(1001);
    ctx.mgr.input('c1', 2, 1, false, false);
    expect(w.players.get(pid)!.angle).toBe(2);
  });

  it('AFK викидає з арени, і арена засинає', () => {
    jest.useFakeTimers();
    const local = setup();
    local.mgr.join('c1', 'u1', 'Аня', 1);
    local.advance(C.afkKickMs + 1000);
    jest.advanceTimersByTime(6000);
    expect(local.mgr.isActive()).toBe(false);
    expect(local.sent.some((m) => m.event === 'e')).toBe(true);
    local.mgr.dispose();
    jest.useRealTimers();
  });

  it('після смерті шле підсумок, "ще раз" відроджує', () => {
    ctx.mgr.join('c1', 'u1', 'Аня', 1);
    const arena = ctx.mgr._arena(1)!;
    const me = [...arena.world.players.values()].find((p) => !p.bot)!;
    const killer = [...arena.world.players.values()].find((p) => p.bot)!;
    me.effects = {};
    killer.effects = {};
    me.spawnedAt = -1e9; // пільговий час новачка минув
    killer.cells[0].mass = 500;
    killer.cells[0].x = me.cells[0].x;
    killer.cells[0].y = me.cells[0].y;
    arena.step();
    const dead = ctx.sent.find((m) => m.event === 'd');
    expect(dead).toBeDefined();
    expect(dead!.payload.killer).toBe(killer.name);
    expect(dead!.payload).toEqual(
      expect.objectContaining({
        maxMass: expect.any(Number),
        survivedMs: expect.any(Number),
        kills: 0,
      }),
    );
    ctx.mgr.join('c1', 'u1', 'Аня', 1);
    expect(me.alive).toBe(true);
  });

  it('вимкнений гравець (leave) більше не отримує пакетів', () => {
    ctx.mgr.join('c1', 'u1', 'A', 0);
    ctx.mgr.join('c2', 'u2', 'B', 0);
    const arena = ctx.mgr._arena(1)!;
    ctx.mgr.leave('c1');
    ctx.sent.length = 0;
    arena.step();
    expect(ctx.sent.every((m) => m.key === 'c2')).toBe(true);
  });
});
