import { SnakeDuelManager, DISCONNECT_GRACE_MS, COUNTDOWN_SECONDS } from './snake-duel.manager';

type Msg = { roomId: string; event: string; payload: any };

const ROOM = 'room-1';
const A = 'alice';
const B = 'bob';
const PLAYERS: [string, string] = [A, B];

function setup() {
  const sent: Msg[] = [];
  const manager = new SnakeDuelManager(
    (roomId, event, payload) => sent.push({ roomId, event, payload }),
    () => 0.5,
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
  it('shows the selected level to both and starts only when both are ready', () => {
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
    manager.setReady(ROOM, PLAYERS, A, true);
    manager.selectLevel(ROOM, PLAYERS, B, 2);
    expect(last().ready[A]).toBe(false);
  });

  it('level 1 only bumps classicRun (the client plays it locally)', () => {
    const { manager, last } = setup();
    manager.setReady(ROOM, PLAYERS, A, true);
    manager.setReady(ROOM, PLAYERS, B, true);
    expect(last().level).toBe(1);
    expect(last().classicRun).toBe(1);
    expect(last().phase).toBe('lobby');
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

describe('server-driven duel', () => {
  it('counts down 3-2-1, then ticks at a fixed rate', () => {
    const { manager, sent, last, startDuel } = setup();
    startDuel();
    expect(last().countdown).toBe(3);
    jest.advanceTimersByTime(1000);
    expect(last().countdown).toBe(2);
    jest.advanceTimersByTime(1000);
    expect(last().countdown).toBe(1);
    jest.advanceTimersByTime(1000);
    expect(last().phase).toBe('playing');
    const ticksBefore = last().duel.tick;
    jest.advanceTimersByTime(330);
    expect(last().duel.tick).toBe(ticksBefore + 3);
    expect(manager).toBeDefined();
    expect(sent.every((m) => m.event === 'snake-session')).toBe(true);
  });

  it('applies a client input on the next tick and ignores reverses', () => {
    const { manager, last, toPlaying } = setup();
    toPlaying();
    manager.input(ROOM, PLAYERS, A, 'left'); // A едет вправо → разворот игнорируется
    manager.input(ROOM, PLAYERS, A, 'down');
    jest.advanceTimersByTime(110);
    expect(last().duel.snakes[A].dir).toBe('down');
  });

  it('a wall hit ends the round for the rival and shows a roundEnd pause', () => {
    const { manager, last, toPlaying } = setup();
    toPlaying();
    manager.input(ROOM, PLAYERS, A, 'up');
    jest.advanceTimersByTime(110 * 6); // с y=3 вверх — выход за стену
    expect(last().phase).toBe('roundEnd');
    expect(last().roundWinner).toBe(B);
    expect(last().wins[B]).toBe(1);
    jest.advanceTimersByTime(2000);
    expect(last().phase).toBe('countdown');
    expect(last().duel.round).toBe(2);
  });

  it('first to 3 wins takes the match', () => {
    const { manager, last, toPlaying } = setup();
    toPlaying();
    for (let r = 0; r < 3; r += 1) {
      manager.input(ROOM, PLAYERS, A, 'up');
      jest.advanceTimersByTime(110 * 6);
      if (r < 2) jest.advanceTimersByTime(2000 + COUNTDOWN_SECONDS * 1000);
    }
    expect(last().phase).toBe('matchEnd');
    expect(last().matchWinner).toBe(B);
    expect(last().endReason).toBe('score');
  });

  it('allows a rematch after the match ends', () => {
    const { manager, last, toPlaying } = setup();
    toPlaying();
    for (let r = 0; r < 3; r += 1) {
      manager.input(ROOM, PLAYERS, A, 'up');
      jest.advanceTimersByTime(110 * 6);
      if (r < 2) jest.advanceTimersByTime(2000 + COUNTDOWN_SECONDS * 1000);
    }
    manager.setReady(ROOM, PLAYERS, A, true);
    manager.setReady(ROOM, PLAYERS, B, true);
    expect(last().phase).toBe('countdown');
    expect(last().wins[A]).toBe(0);
  });
});

describe('disconnects', () => {
  it('pauses the round, and resumes (with a fresh countdown) if the player returns in time', () => {
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
