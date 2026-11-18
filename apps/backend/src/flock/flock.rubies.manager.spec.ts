import { FLOCK_CONFIG as C } from './flock.config';
import { FlockManager } from './flock.manager';

const BOARD_TICKS = Math.round(C.tickHz * C.boardEverySec) + 2;

function setup() {
  const rewards: string[] = [];
  const t = 1_000_000;
  let seed = 7;
  const rng = () =>
    (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const mgr = new FlockManager(() => undefined, rng, () => t, {
    onTop1: (userId) => rewards.push(userId),
  });
  const join = (conn: string, user: string) => {
    const r = mgr.join(conn, user, user, 0);
    const world = mgr._arena(r.arenaId!)!.world;
    return { r, world, player: world.players.get(r.pid!)! };
  };
  /** Прокручує арену достатньо тіків, щоб вийшла таблиця лідерів. */
  const play = (arenaId: number) => {
    const a = mgr._arena(arenaId)!;
    for (let i = 0; i < BOARD_TICKS; i++) a.step();
  };
  return { mgr, rewards, join, play };
}

/** Масивна овечка, значно більша за будь-кого на арені (боти ~24). */
const grow = (p: { cells: { mass: number }[] }, mass: number) => {
  p.cells[0].mass = mass;
};

describe('Рубіни: нагорода за 1-ше місце (серверна логіка арени)', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => (ctx = setup()));
  afterEach(() => ctx.mgr.dispose());

  it('перше місце, але маса нижче порога - нагороди нема', () => {
    const { player, r } = ctx.join('c1', 'u1');
    grow(player, C.rubies.top1MassThreshold - 500);
    ctx.play(r.arenaId!);
    expect(ctx.rewards).toEqual([]);
  });

  it('перше місце з масою від порога - нагорода гравцеві', () => {
    const { player, r } = ctx.join('c1', 'u1');
    grow(player, C.rubies.top1MassThreshold + 500);
    ctx.play(r.arenaId!);
    expect(ctx.rewards).toEqual(['u1']);
  });

  it('не перше місце (є хтось більший) - нагороди нема', () => {
    const { player, r, world } = ctx.join('c1', 'u1');
    const other = ctx.join('c2', 'u2').player;
    grow(player, C.rubies.top1MassThreshold + 500);
    grow(other, C.rubies.top1MassThreshold + 2500);
    ctx.play(r.arenaId!);
    expect(ctx.rewards).toEqual(['u2']);
    void world;
  });

  it('один раз за життя: далі тримання 1-го місця не дає нових нагород', () => {
    const { player, r } = ctx.join('c1', 'u1');
    grow(player, C.rubies.top1MassThreshold + 500);
    ctx.play(r.arenaId!);
    ctx.play(r.arenaId!);
    ctx.play(r.arenaId!);
    expect(ctx.rewards).toEqual(['u1']);
  });

  it('після загибелі й народження нагороду можна заробити знову', () => {
    const { player, r } = ctx.join('c1', 'u1');
    grow(player, C.rubies.top1MassThreshold + 500);
    ctx.play(r.arenaId!);
    expect(ctx.rewards).toHaveLength(1);

    player.alive = false; // з'їли
    ctx.mgr.join('c1', 'u1', 'u1', 0); // "ще раз" з того ж сокета = переродження
    expect(player.alive).toBe(true);
    grow(player, C.rubies.top1MassThreshold + 500);
    ctx.play(r.arenaId!);
    expect(ctx.rewards).toEqual(['u1', 'u1']);
  });

  it('гравець у паузі (без звʼязку) нагороди не отримує', () => {
    const { player, r } = ctx.join('c1', 'u1');
    grow(player, C.rubies.top1MassThreshold + 500);
    ctx.mgr.disconnect('c1');
    ctx.play(r.arenaId!);
    expect(ctx.rewards).toEqual([]);
  });
});
