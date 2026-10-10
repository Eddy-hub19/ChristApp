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
    for (let i = 0; i < 20; i++) ctx.mgr.join(`c${i}`, `u${i}`, `P${i}`, 0);
    const s = ctx.mgr.stats()[0];
    expect(s.humans).toBe(20);
    expect(s.bots).toBe(Math.max(C.botMin, C.botTotalTarget - 20));
    for (let i = 20; i < 35; i++) ctx.mgr.join(`c${i}`, `u${i}`, `P${i}`, 0);
    expect(ctx.mgr.stats()[0].bots).toBe(C.botMin);
  });

  it('після 50 людей відкривається друга арена, після ліміту - відмова', () => {
    for (let i = 0; i < C.maxHumansPerArena * C.maxArenas; i++) {
      expect(ctx.mgr.join(`c${i}`, `u${i}`, 'P', 0).ok).toBe(true);
    }
    expect(ctx.mgr.stats().map((a) => a.humans)).toEqual([
      C.maxHumansPerArena,
      C.maxHumansPerArena,
    ]);
    const over = ctx.mgr.join('extra', 'ux', 'P', 0);
    expect(over).toEqual({ ok: false, error: 'full' });
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
