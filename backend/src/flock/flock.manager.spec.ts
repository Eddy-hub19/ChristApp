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

const BOARD_TICKS = Math.round(C.tickHz * C.boardEverySec);

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
    expect(over).toMatchObject({ ok: false, error: 'full' });
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
    for (let i = 0; i < BOARD_TICKS + 1; i++) arena.step();
    const states = ctx.sent.filter((m) => m.event === 's');
    expect(states.length).toBe(BOARD_TICKS + 1);
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

  describe('пауза і відновлення сесії', () => {
    const PAUSE = C.resumePauseMs;
    const me = (userId = 'u1') => {
      const arena = ctx.mgr._arena(1)!;
      return {
        arena,
        player: [...arena.world.players.values()].find(
          (p) => !p.bot && p.name === userId,
        )!,
      };
    };
    const joinAs = (conn: string, user: string, opts = {}) =>
      ctx.mgr.join(conn, user, user, 3, opts);

    it('join видає токен; розрив ставить овечку на паузу, а не видаляє', () => {
      const r = joinAs('c1', 'u1');
      expect(r.token).toMatch(/^[0-9a-f]{32}$/);
      ctx.mgr.disconnect('c1');
      const { player } = me();
      expect(player.alive).toBe(true);
      expect(player.paused).toBe(true);
      expect(ctx.mgr.stats()[0].humans).toBe(1); // місце зарезервоване
    });

    it('повернення за 10 с: та сама овечка (маса, частини, позиція), без екрана входу, щит 2 с', () => {
      const r = joinAs('c1', 'u1');
      const { arena, player } = me();
      player.cells[0].mass = 300;
      player.cells[0].x = 1234;
      player.cells[0].y = 987;
      player.maxMass = 555;
      player.kills = 2;
      player.effects = {};
      arena.world.queueSplit(player.id);
      arena.step();
      const cellsBefore = player.cells.length;
      const pid = player.id;
      ctx.mgr.disconnect('c1');
      ctx.advance(10_000);
      ctx.mgr.sweep();
      const back = joinAs('c2', 'u1', { resume: r.token });
      expect(back.resumed).toBe(true);
      expect(back.pid).toBe(pid);
      expect(back.token).not.toBe(r.token); // токен ротується
      const after = arena.world.players.get(pid)!;
      expect(after.paused).toBe(false);
      expect(after.cells.length).toBe(cellsBefore);
      expect(after.maxMass).toBe(555);
      expect(after.kills).toBe(2);
      expect(arena.world.isShielded(after)).toBe(true);
      const left = (after.effects.shield ?? 0) - arena.world.now;
      expect(left).toBeGreaterThan(C.resumeShieldMs - 200);
      expect(left).toBeLessThanOrEqual(C.resumeShieldMs);
      // стан іде на НОВИЙ сокет, на старий - ні
      ctx.sent.length = 0;
      arena.step();
      expect(
        ctx.sent.filter((m) => m.event === 's').every((m) => m.key === 'c2'),
      ).toBe(true);
      expect(ctx.sent.some((m) => m.event === 's' && m.key === 'c2')).toBe(
        true,
      );
    });

    it('повернення через 25 с: сесії вже нема, звичайний вхід із resumeFailed', () => {
      const r = joinAs('c1', 'u1');
      const oldPid = me().player.id;
      ctx.mgr.disconnect('c1');
      ctx.advance(25_000);
      ctx.mgr.sweep();
      expect(ctx.mgr.isActive()).toBe(false); // овечка зникла, арена заснула
      const back = joinAs('c2', 'u1', { resume: r.token });
      expect(back.ok).toBe(true);
      expect(back.resumed).toBeFalsy();
      expect(back.resumeFailed).toBe(true);
      const fresh = ctx.mgr
        ._arena(back.arenaId!)!
        .world.players.get(back.pid!)!;
      expect(fresh.total).toBe(C.startMass);
      void oldPid;
    });

    it('resumeOnly: сесії нема - нічого не створюємо, повертаємо expired (клієнт покаже лобі)', () => {
      const r = joinAs('c1', 'u1');
      ctx.mgr.disconnect('c1');
      ctx.advance(25_000);
      ctx.mgr.sweep();
      const back = joinAs('c2', 'u1', { resume: r.token, resumeOnly: true });
      expect(back).toMatchObject({
        ok: false,
        error: 'expired',
        resumeFailed: true,
      });
      expect(ctx.mgr.isActive()).toBe(false); // жодної нової овечки й арени
    });

    it('resumeOnly з чужим токеном не чіпає чужу сесію в паузі', () => {
      const a = joinAs('c1', 'u1');
      joinAs('c2', 'u2');
      ctx.mgr.disconnect('c1');
      expect(
        joinAs('c3', 'u2', { resume: a.token, resumeOnly: true }).error,
      ).toBe('expired');
      expect(ctx.mgr['byUser'].get('u2')).toBeDefined(); // u2 лишається у своїй сесії
    });

    it('пауза спливає рівно по resumePauseMs (не раніше)', () => {
      joinAs('c1', 'u1');
      joinAs('c2', 'u2');
      ctx.mgr.disconnect('c1');
      ctx.advance(PAUSE - 1);
      ctx.mgr.sweep();
      expect(ctx.mgr.stats()[0].humans).toBe(2);
      ctx.advance(2);
      ctx.mgr.sweep();
      expect(ctx.mgr.stats()[0].humans).toBe(1);
    });

    it('явний вихід (хрестик): одразу, без паузи, токен більше не діє', () => {
      const r = joinAs('c1', 'u1');
      joinAs('c2', 'u2');
      ctx.mgr.leave('c1');
      expect(ctx.mgr.stats()[0].humans).toBe(1);
      // розрив після явного виходу нічого не ставить на паузу
      ctx.mgr.disconnect('c1');
      const back = joinAs('c3', 'u1', { resume: r.token });
      expect(back.resumed).toBeFalsy();
      expect(back.resumeFailed).toBe(true);
    });

    it("гравця в паузі не можна з'їсти, він нікого не їсть і не підбирає бонуси", () => {
      joinAs('c1', 'u1');
      const { arena, player } = me();
      const bot = [...arena.world.players.values()].find((p) => p.bot)!;
      const w = arena.world;
      player.effects = {};
      bot.effects = {};
      player.spawnedAt = -1e9; // пільговий час боту не заважає
      // хижак 600 над овечкою
      bot.cells.forEach((c) => {
        c.mass = 600;
        c.x = 1500;
        c.y = 1500;
      });
      player.cells.forEach((c) => {
        c.mass = 40;
        c.x = 1500;
        c.y = 1500;
      });
      ctx.mgr.disconnect('c1');
      for (let i = 0; i < 5; i++) arena.step();
      expect(player.alive).toBe(true);
      expect(player.cells[0].mass).toBe(40); // хижак накрив, але не з'їв
      // бонус під овечкою в паузі лежить, поки поруч нікого
      bot.cells.forEach((c) => {
        c.x = 100;
        c.y = 100;
      });
      w.bonuses.length = 0;
      w.bonuses.push({ id: 99, x: 1500, y: 1500, kind: 'golden' });
      for (let i = 0; i < 3; i++) arena.step();
      expect(w.bonuses.some((b) => b.id === 99)).toBe(true);
      expect(player.cells[0].mass).toBe(40);
      // а коли гравець в паузі - більший, він не їсть меншого
      const small = [...w.players.values()].find((p) => p.bot && p !== bot)!;
      small.cells.forEach((c) => {
        c.mass = 30;
        c.x = 1500;
        c.y = 1500;
      });
      player.cells[0].mass = 400;
      bot.cells.forEach((c) => {
        c.x = 100;
        c.y = 100;
      });
      small.effects = {};
      for (let i = 0; i < 5; i++) arena.step();
      expect(small.alive).toBe(true);
    });

    it('ліміт арени: зарезервоване місце не віддається іншому, новий гравець отримує full', () => {
      for (let i = 0; i < C.maxHumansPerArena; i++) joinAs(`c${i}`, `u${i}`);
      ctx.mgr.disconnect('c0'); // u0 в паузі
      const extra = joinAs('cx', 'ux');
      expect(extra).toMatchObject({ ok: false, error: 'full' });
      // u0 повертається у своє місце
      const tokenOfU0 = ctx.mgr['byUser'].get('u0')!.token;
      const back = joinAs('c0b', 'u0', { resume: tokenOfU0 });
      expect(back.resumed).toBe(true);
      // а коли пауза спливла - місце вільне
      ctx.mgr.disconnect('c0b');
      ctx.advance(PAUSE + 100);
      ctx.mgr.sweep();
      expect(joinAs('cx', 'ux').ok).toBe(true);
    });

    it('чужий токен не підходить; токен привʼязаний до користувача', () => {
      const a = joinAs('c1', 'u1');
      joinAs('c2', 'u2');
      ctx.mgr.disconnect('c1');
      // u2 з токеном u1 - не відновлює чужу овечку
      const steal = joinAs('c3', 'u2', { resume: a.token });
      expect(steal.resumed).toBeFalsy();
      expect(steal.resumeFailed).toBe(true);
      // овечка u1 і далі чекає
      expect(ctx.mgr['byUser'].get('u1')!.pausedUntil).not.toBeNull();
    });

    it('старий сокет ще "живий" (мережа блимнула): новий його витісняє', () => {
      const r = joinAs('c1', 'u1');
      const back = joinAs('c2', 'u1', { resume: r.token });
      expect(back.resumed).toBe(true);
      expect(
        ctx.sent.some(
          (m) =>
            m.key === 'c1' && m.event === 'e' && m.payload.code === 'taken',
        ),
      ).toBe(true);
      ctx.mgr.input('c1', 1, 1, false, false); // старий уже нічого не керує
      expect(me().player.angle).not.toBe(1);
      ctx.mgr.disconnect('c1'); // його пізній розрив не ставить паузу на новий сокет
      expect(me().player.paused).toBe(false);
    });

    it('таймери ефектів і злиття не горять під час паузи; статистика не росте', () => {
      const r = joinAs('c1', 'u1');
      const { arena, player } = me();
      const w = arena.world;
      player.effects = { speed: w.now + 5000 };
      player.cells[0].mergeAt = w.now + 4000;
      const spawnedBefore = player.spawnedAt;
      ctx.mgr.disconnect('c1');
      for (let i = 0; i < C.tickHz * 10; i++) arena.step(); // 10 с світового часу
      ctx.mgr.input; // (ввід у паузі ігнорується, бо сокета нема)
      joinAs('c2', 'u1', { resume: r.token });
      expect((player.effects.speed ?? 0) - w.now).toBeGreaterThan(4000);
      expect(player.cells[0].mergeAt - w.now).toBeGreaterThan(3000);
      expect(player.spawnedAt).toBeGreaterThan(spawnedBefore); // survivedMs без паузи
    });

    it('на паузі овечка стоїть, а іншим показується з прапором паузи і таймером', () => {
      joinAs('c1', 'u1');
      joinAs('c2', 'u2');
      const { arena, player } = me();
      const other = arena.world.players;
      void other;
      ctx.mgr.disconnect('c1');
      ctx.sent.length = 0;
      ctx.advance(7000);
      arena.step();
      const st = decodeState(
        ctx.sent.find((m) => m.event === 's' && m.key === 'c2')!.payload,
      );
      const mine = st.cells.find((c) => c.pid === player.id);
      if (mine) expect(mine.fx & 32).toBe(32);
      if (mine) {
        const t = st.paused.find((p) => p.pid === player.id)!;
        expect(t.remainingMs).toBeGreaterThan(12_000);
        expect(t.remainingMs).toBeLessThanOrEqual(C.resumePauseMs - 6900);
      }
    });

    it('запрошена арена: є місце - туди; арени нема (закрита) - у доступну без помилки; повна - full', () => {
      const first = joinAs('c1', 'u1');
      expect(joinAs('c2', 'u2', { arena: first.arenaId }).arenaId).toBe(
        first.arenaId,
      );
      // арени 77 не існує: заходимо в доступну, жодної помилки
      const ghost = joinAs('c3', 'u3', { arena: 77 });
      expect(ghost.ok).toBe(true);
      expect(ghost.arenaId).toBe(first.arenaId);
      // заповнюємо
      for (let i = 4; i < 4 + C.maxHumansPerArena; i++)
        joinAs(`c${i}`, `u${i}`, { arena: first.arenaId });
      expect(joinAs('cz', 'uz', { arena: first.arenaId })).toMatchObject({
        ok: false,
        error: 'full',
      });
    });
  });
});
