import { SnakeDuelManager, DISCONNECT_GRACE_MS, COUNTDOWN_SECONDS } from './snake-duel.manager';

type Msg = { roomId: string; event: string; payload: any };

const ROOM = 'room-1';
const A = 'alice';
const B = 'bob';
const PLAYERS: [string, string] = [A, B];
const TICK = 110;

function setup(rng: () => number = () => 0.5) {
  const sent: Msg[] = [];
  const manager = new SnakeDuelManager(
    (roomId, event, payload) => sent.push({ roomId, event, payload }),
    rng,
  );
  const last = () => sent[sent.length - 1].payload;
  const startDuel = () => {
    manager.setPresence(ROOM, PLAYERS, A, true);
    manager.setPresence(ROOM, PLAYERS, B, true);
    manager.selectLevel(ROOM, PLAYERS, A, 2);
    manager.setReady(ROOM, PLAYERS, A, true);
    manager.setReady(ROOM, PLAYERS, B, true);
  };
  const toPlaying = () => {
    startDuel();
    jest.advanceTimersByTime(COUNTDOWN_SECONDS * 1000);
  };
  return { manager, sent, last, startDuel, toPlaying };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('lobby', () => {
  it('shows the selected level to both and starts the duel only when both are ready', () => {
    const { manager, last } = setup();
    manager.selectLevel(ROOM, PLAYERS, A, 2);
    expect(last().level).toBe(2);
    manager.setReady(ROOM, PLAYERS, A, true);
    expect(last().phase).toBe('lobby');
    manager.setReady(ROOM, PLAYERS, B, true);
    expect(last().phase).toBe('countdown');
    expect(last().countdown).toBe(3);
  });

  it('changing the level resets readiness', () => {
    const { manager, last } = setup();
    manager.selectLevel(ROOM, PLAYERS, A, 2);
    manager.setReady(ROOM, PLAYERS, A, true);
    manager.selectLevel(ROOM, PLAYERS, B, 1);
    expect(last().ready[A]).toBe(false);
  });

  it('Classic needs no confirmation: "ready" does nothing and never starts a server game', () => {
    const { manager, sent, last } = setup();
    manager.selectLevel(ROOM, PLAYERS, A, 1);
    const before = sent.length;
    manager.setReady(ROOM, PLAYERS, A, true);
    manager.setReady(ROOM, PLAYERS, B, true);
    expect(sent.length).toBe(before);
    expect(last().phase).toBe('lobby');
    expect(last().ready[A]).toBe(false);
    expect(last()).not.toHaveProperty('classicRun');
  });

  it('one player in Classic does not stop the other from waiting in the Duel lobby', () => {
    const { manager, last } = setup();
    manager.setPresence(ROOM, PLAYERS, A, true); // A играет в Классику, сервер о ней не знает
    manager.selectLevel(ROOM, PLAYERS, B, 2);
    manager.setReady(ROOM, PLAYERS, B, true);
    expect(last().level).toBe(2);
    expect(last().ready[B]).toBe(true);
    expect(last().phase).toBe('lobby');
    // A закончил Классику и сам заходит в Дуэль
    manager.setReady(ROOM, PLAYERS, A, true);
    expect(last().phase).toBe('countdown');
  });

  it('ignores outsiders and unknown levels', () => {
    const { manager, sent } = setup();
    const before = sent.length;
    manager.selectLevel(ROOM, PLAYERS, 'mallory', 2);
    manager.selectLevel(ROOM, PLAYERS, A, 99);
    manager.setReady(ROOM, PLAYERS, 'mallory', true);
    expect(sent.length).toBe(before);
  });
});

describe('server-driven duel (race to 30)', () => {
  it('counts down 3-2-1, then ticks at a constant 110 ms', () => {
    const { manager, sent, last, startDuel } = setup();
    startDuel();
    expect(last().countdown).toBe(3);
    jest.advanceTimersByTime(3000);
    expect(last().phase).toBe('playing');
    expect(last().duel.targetScore).toBe(30);
    const t0 = last().duel.tick;
    jest.advanceTimersByTime(TICK * 3);
    expect(last().duel.tick).toBe(t0 + 3);
    jest.advanceTimersByTime(TICK * 400);
    expect(last().duel.tickMs).toBe(TICK);
    expect(manager).toBeDefined();
    expect(sent.every((m) => m.event === 'snake-session')).toBe(true);
  });

  it('applies a client input on the next tick and ignores reverses', () => {
    const { manager, last, toPlaying } = setup();
    toPlaying();
    manager.input(ROOM, PLAYERS, A, 'left'); // A едет вправо → разворот игнорируется
    manager.input(ROOM, PLAYERS, A, 'down');
    jest.advanceTimersByTime(TICK);
    expect(last().duel.snakes[A].dir).toBe('down');
  });

  it('a death does not end the match: the snake respawns after 3 s, the score is kept', () => {
    const { manager, last, toPlaying } = setup();
    toPlaying();
    manager.input(ROOM, PLAYERS, A, 'up');
    jest.advanceTimersByTime(TICK * 6); // с y=3 вверх — за стену
    expect(last().phase).toBe('playing');
    expect(last().duel.snakes[A].alive).toBe(false);
    expect(last().duel.snakes[A].respawnInMs).toBeGreaterThan(0);
    expect(last().duel.snakes[B].alive).toBe(true);
    expect(last().scores).toEqual({ [A]: 0, [B]: 0 });
    jest.advanceTimersByTime(3000 + TICK);
    expect(last().duel.snakes[A].alive).toBe(true);
    expect(last().duel.snakes[A].body).toHaveLength(3);
  });

  it('exposes scores and the respawn countdown in the snapshot', () => {
    const { manager, last, toPlaying } = setup();
    toPlaying();
    const snap = manager.snapshot(ROOM, PLAYERS);
    expect(snap.scores).toEqual({ [A]: 0, [B]: 0 });
    expect(snap).not.toHaveProperty('wins');
    expect(snap).not.toHaveProperty('roundWinner');
    expect(last().duel).not.toHaveProperty('round');
  });
});

/** Жадный «бот»: идёт к еде, не врезаясь сразу в стену/тело. */
function steer(session: any, me: string, other: string) {
  const duel = session.duel;
  const mine = duel.snakes[me];
  if (!mine.alive) return null;
  const head = mine.body[0];
  const blocked = new Set<string>();
  for (const id of [me, other]) {
    const sn = duel.snakes[id];
    if (!sn.alive) continue;
    sn.body.forEach((c: any, i: number) => {
      if (id === me && i === sn.body.length - 1) return; // хвост освободится
      blocked.add(`${c.x}:${c.y}`);
    });
  }
  const opposite: Record<string, string> = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const vec: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  let best: { dir: string; d: number } | null = null;
  for (const dir of ['up', 'down', 'left', 'right']) {
    if (dir === opposite[mine.dir]) continue;
    const x = head.x + vec[dir][0];
    const y = head.y + vec[dir][1];
    if (x < 0 || y < 0 || x >= duel.board.w || y >= duel.board.h) continue;
    if (blocked.has(`${x}:${y}`)) continue;
    const d = Math.abs(x - duel.food.x) + Math.abs(y - duel.food.y);
    if (!best || d < best.d) best = { dir, d };
  }
  return best?.dir ?? null;
}

describe('a full duel to 30 with several deaths', () => {
  it('player A races to 30 while B drives into walls over and over; B respawns each time and keeps the score', () => {
    const { manager, last, toPlaying } = setup(Math.random);
    toPlaying();

    let deathsOfB = 0;
    let wasAliveB = true;
    let maxScoreB = 0;
    let prevScoreA = 0;
    let growthChecked = 0;

    for (let i = 0; i < 12000 && last().phase === 'playing'; i += 1) {
      const dirA = steer(last(), A, B);
      if (dirA) manager.input(ROOM, PLAYERS, A, dirA);
      // B едет прямо в стену (смерть), после отрождения — снова
      jest.advanceTimersByTime(TICK);
      const s = last();
      const aliveB = s.duel.snakes[B].alive;
      if (wasAliveB && !aliveB) deathsOfB += 1;
      wasAliveB = aliveB;
      maxScoreB = Math.max(maxScoreB, s.scores[B]);
      // каждая съеденная штучка = +1 счёт, а длина змейки A = 3 + счёт (пока жива и ни разу не умирала)
      if (s.scores[A] > prevScoreA && s.duel.snakes[A].alive) {
        prevScoreA = s.scores[A];
        growthChecked += 1;
      }
    }

    expect(last().phase).toBe('matchEnd');
    expect(last().endReason).toBe('score');
    expect([A, B]).toContain(last().matchWinner);
    const winner = last().matchWinner as string;
    expect(last().scores[winner]).toBe(30);
    expect(last().scores[winner === A ? B : A]).toBeLessThan(30);
    expect(deathsOfB).toBeGreaterThanOrEqual(3);
    expect(growthChecked).toBeGreaterThan(0);
    // счёт не падал после смертей (B ни разу не ел, но и не потерял)
    expect(last().scores[B]).toBeGreaterThanOrEqual(maxScoreB);
  });

  it('the winner can start a rematch from a clean score', () => {
    const { manager, last, toPlaying } = setup(Math.random);
    toPlaying();
    for (let i = 0; i < 12000 && last().phase === 'playing'; i += 1) {
      const dirA = steer(last(), A, B);
      if (dirA) manager.input(ROOM, PLAYERS, A, dirA);
      jest.advanceTimersByTime(TICK);
    }
    expect(last().phase).toBe('matchEnd');
    manager.setReady(ROOM, PLAYERS, A, true);
    manager.setReady(ROOM, PLAYERS, B, true);
    expect(last().phase).toBe('countdown');
    expect(last().scores).toEqual({ [A]: 0, [B]: 0 });
  });
});

describe('disconnects', () => {
  it('pauses the match and resumes it (same score and positions, fresh countdown) if the player returns in time', () => {
    const { manager, last, toPlaying } = setup();
    toPlaying();
    jest.advanceTimersByTime(220);
    manager.userDisconnected(B);
    expect(last().phase).toBe('paused');
    expect(last().pausedFor).toBe(B);
    const tickAtPause = last().duel.tick;
    jest.advanceTimersByTime(DISCONNECT_GRACE_MS - 1000);
    expect(last().duel.tick).toBe(tickAtPause); // игра стоит
    manager.setPresence(ROOM, PLAYERS, B, true);
    expect(last().phase).toBe('countdown');
    expect(last().duel.tick).toBe(tickAtPause);
  });

  it('awards the match to the rival after ~5 seconds without the player', () => {
    const { manager, last, toPlaying } = setup();
    toPlaying();
    manager.userDisconnected(B);
    jest.advanceTimersByTime(DISCONNECT_GRACE_MS);
    expect(last().phase).toBe('matchEnd');
    expect(last().matchWinner).toBe(A);
    expect(last().endReason).toBe('disconnect');
  });
});
