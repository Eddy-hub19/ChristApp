import { FLOCK_CONFIG as C } from './flock.config';
import {
  BotGovernor,
  botCapForHumans,
  classifyLoad,
  type LoadSample,
} from './flock.bot-governor';
import { FlockManager } from './flock.manager';

const CALM: LoadSample = { lateMs: 1, loopP99Ms: 5, cpuPct: 5 };
const BUSY: LoadSample = { lateMs: 40, loopP99Ms: 5, cpuPct: 5 };

describe('classifyLoad', () => {
  it('высокая нагрузка по любому из показателей, низкая - только когда все низкие', () => {
    expect(classifyLoad(CALM).level).toBe('low');
    expect(
      classifyLoad({ ...CALM, lateMs: C.botLoad.high.lateMs + 1 }).level,
    ).toBe('high');
    expect(
      classifyLoad({ ...CALM, loopP99Ms: C.botLoad.high.loopP99Ms + 1 }).level,
    ).toBe('high');
    expect(
      classifyLoad({ ...CALM, cpuPct: C.botLoad.high.cpuPct + 1 }).level,
    ).toBe('high');
    // между порогами - норма (гистерезис), ботов ни убираем, ни возвращаем
    expect(
      classifyLoad({
        ...CALM,
        lateMs: (C.botLoad.low.lateMs + C.botLoad.high.lateMs) / 2,
      }).level,
    ).toBe('normal');
  });
});

describe('botCapForHumans (жёсткие лимиты)', () => {
  it('до 3 людей лимита нет, 4-5 -> 2, 6 -> 0', () => {
    for (const n of [0, 1, 2, 3]) expect(botCapForHumans(n)).toBe(Infinity);
    expect(botCapForHumans(4)).toBe(2);
    expect(botCapForHumans(5)).toBe(2);
    expect(botCapForHumans(6)).toBe(0);
  });
});

describe('BotGovernor', () => {
  it('при высокой нагрузке убирает ботов по одному и не уходит ниже 0', () => {
    const g = new BotGovernor(3);
    let active = 5;
    const seen: number[] = [];
    for (let i = 0; i < 8; i++) {
      const d = g.evaluate(BUSY, 5, active, i * 2500);
      if (d.action === 'remove') active--;
      seen.push(active);
    }
    expect(seen).toEqual([4, 3, 2, 1, 0, 0, 0, 0]);
    expect(g.limit(5)).toBe(0);
  });

  it('возвращает по одному только после долгой низкой нагрузки и снимает ограничение на штатном числе', () => {
    const g = new BotGovernor(3);
    g.evaluate(BUSY, 3, 3, 0); // loadCap 2
    g.evaluate(BUSY, 3, 2, 1); // loadCap 1
    expect(g.limit(3)).toBe(1);
    let t = 2;
    // две спокойные оценки - ещё рано
    g.evaluate(CALM, 3, 1, t++);
    g.evaluate(CALM, 3, 1, t++);
    expect(g.limit(3)).toBe(1);
    // третья - возвращается один
    expect(g.evaluate(CALM, 3, 1, t++).action).toBe('add');
    expect(g.limit(3)).toBe(2);
    // нормальная (не низкая) нагрузка сбрасывает счётчик
    g.evaluate({ ...CALM, lateMs: 10 }, 3, 2, t++);
    g.evaluate(CALM, 3, 2, t++);
    g.evaluate(CALM, 3, 2, t++);
    expect(g.limit(3)).toBe(2);
    g.evaluate(CALM, 3, 2, t++);
    expect(g.loadCap).toBeNull(); // вернулся штатный 3
    expect(g.limit(3)).toBe(3);
  });

  it('штатный лимит по людям всегда сильнее: limit не превышает desired', () => {
    const g = new BotGovernor(1);
    expect(g.limit(2)).toBe(2);
    g.evaluate(BUSY, 5, 5, 0);
    expect(g.limit(2)).toBe(2); // loadCap 4, desired 2
  });
});

describe('Арена: боты по нагрузке', () => {
  function setup(probe: () => { loopP99Ms: number; cpuPct: number }) {
    let t = 1_000_000;
    let seed = 7;
    const rng = () =>
      (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const mgr = new FlockManager(
      () => undefined,
      rng,
      () => t,
      {},
      { loadProbe: probe },
    );
    return { mgr, advance: (ms: number) => (t += ms) };
  }

  it('высокая нагрузка: боты уходят по одному, не исчезая на глазах; низкая - возвращаются', () => {
    let load = { loopP99Ms: 5, cpuPct: 5 };
    const { mgr } = setup(() => load);
    mgr.join('c1', 'u1', 'Аня', 1);
    const arena = mgr._arena(1)!;
    const start = arena.activeBots;
    expect(start).toBe(C.botTarget);

    load = { loopP99Ms: 5000, cpuPct: 5 }; // высокий лаг event loop
    arena.evaluateLoad();
    expect(arena.activeBots).toBe(start - 1);
    // ушедший бот ещё в мире (уходит, а не исчез мгновенно)
    expect(arena.bots.size).toBe(start);
    expect(arena.retiring.size).toBe(1);

    arena.evaluateLoad();
    expect(arena.activeBots).toBe(start - 2);

    // со временем уходящие боты покидают арену (скрылись за краем или истёк таймаут)
    for (
      let i = 0;
      i < Math.ceil((C.botLoad.retireMaxMs / 1000) * C.tickHz) + 50;
      i++
    )
      arena.step();
    expect(arena.retiring.size).toBe(0);
    expect(arena.bots.size).toBe(arena.activeBots);

    // нагрузка упала надолго -> по одному возвращаются
    load = { loopP99Ms: 1, cpuPct: 1 };
    for (let i = 0; i < C.botLoad.returnAfterLow; i++) arena.evaluateLoad();
    expect(arena.activeBots).toBe(start - 1);
    for (let i = 0; i < C.botLoad.returnAfterLow * 3; i++) arena.evaluateLoad();
    expect(arena.activeBots).toBe(start);
    mgr.dispose();
  });

  it('первыми уходят самые маленькие боты', () => {
    let load = { loopP99Ms: 5, cpuPct: 5 };
    const { mgr } = setup(() => load);
    mgr.join('c1', 'u1', 'Аня', 1);
    const arena = mgr._arena(1)!;
    const bots = [...arena.bots].map((id) => arena.world.players.get(id)!);
    bots.forEach((b, i) => {
      b.total = 100 + i * 10;
      b.cells[0].mass = b.total;
    });
    const smallest = bots[0].id;
    load = { loopP99Ms: 5000, cpuPct: 5 };
    arena.evaluateLoad();
    expect([...arena.retiring.keys()]).toEqual([smallest]);
    mgr.dispose();
  });

  it('при 4-5 людях ботов не больше 2, при 6 - 0, даже когда нагрузка в норме', () => {
    const { mgr } = setup(() => ({ loopP99Ms: 1, cpuPct: 1 }));
    for (let i = 0; i < 6; i++) mgr.join(`c${i}`, `u${i}`, `P${i}`, 0);
    const arena = mgr._arena(1)!;
    expect(arena.humans).toBe(6);
    for (let i = 0; i < 40; i++) arena.evaluateLoad();
    for (let i = 0; i < 400; i++) arena.step();
    expect(arena.bots.size).toBe(0);

    // один человек вышел -> 5 людей -> до 2 ботов, больше нельзя
    mgr.leave('c5');
    for (let i = 0; i < 40; i++) arena.evaluateLoad();
    expect(arena.activeBots).toBeLessThanOrEqual(2);
    mgr.dispose();
  });

  it('решения видны в статистике (для админки)', () => {
    const { mgr } = setup(() => ({ loopP99Ms: 5000, cpuPct: 5 }));
    mgr.join('c1', 'u1', 'Аня', 1);
    mgr._arena(1)!.evaluateLoad();
    const s = mgr.stats()[0];
    expect(s.load?.loopP99Ms).toBe(5000);
    expect(s.decisions.at(-1)).toMatchObject({
      action: 'remove',
      level: 'high',
    });
    expect(s.botsLoadCap).toBe(C.botTarget - 1);
    mgr.dispose();
  });
});
