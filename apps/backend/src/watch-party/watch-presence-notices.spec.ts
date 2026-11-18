import {
  AWAY_GRACE_MS,
  BACK_WINDOW_MS,
  PresenceNotices,
  type PresenceEvent,
  type PresenceNoticeData,
} from './watch-presence-notices';

const ROOM = 'room';
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function setup(opts: { lastEvent?: PresenceEvent | null; joined?: boolean } = {}) {
  const log: Array<{ op: 'create' | 'update'; id: string; data: PresenceNoticeData; userId?: string }> = [];
  let seq = 0;
  const hostOutcome = jest.fn((): { toUserId?: string; paused?: boolean } => ({
    toUserId: 'neko',
  }));
  const notices = new PresenceNotices({
    hostHandoverDelayMs: 17_000,
    create: async (_r, userId, data) => {
      const id = `m${++seq}`;
      log.push({ op: 'create', id, data, userId });
      return id;
    },
    update: async (_r, id, data) => {
      log.push({ op: 'update', id, data });
    },
    lastEvent: async () => opts.lastEvent ?? null,
    isJoined: async () => opts.joined ?? true,
    hostOutcome,
    now: () => Date.now(),
  });
  return { notices, log, hostOutcome };
}

describe('PresenceNotices', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const enter = async (n: PresenceNotices) => {
    n.arrived(ROOM, 'u');
    await flush();
  };

  it('explicit leave (button / closed mini-player) is published immediately', async () => {
    const { notices, log } = setup();
    await enter(notices);
    log.length = 0;
    notices.departed(ROOM, 'u', { explicit: true, wasHost: false });
    await flush();
    expect(log).toHaveLength(1);
    expect(log[0].data.event).toBe('left');
  });

  it('closed tab: nothing before 30s, "left" after', async () => {
    const { notices, log } = setup();
    await enter(notices);
    log.length = 0;
    notices.departed(ROOM, 'u', { explicit: false, wasHost: false });
    await jest.advanceTimersByTimeAsync(AWAY_GRACE_MS - 1_000);
    expect(log).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1_500);
    expect(log.map((l) => l.data.event)).toEqual(['left']);
  });

  it('app minimised for 10s and brief network loss show nothing at all', async () => {
    const { notices, log } = setup();
    await enter(notices);
    log.length = 0;
    notices.departed(ROOM, 'u', { explicit: false, wasHost: false });
    await jest.advanceTimersByTimeAsync(10_000);
    notices.arrived(ROOM, 'u');
    await jest.advanceTimersByTimeAsync(AWAY_GRACE_MS * 2);
    expect(log).toHaveLength(0);
  });

  it('minimised for 60s then back within 2 min: the "left" row becomes "back"', async () => {
    const { notices, log } = setup();
    await enter(notices);
    log.length = 0;
    notices.departed(ROOM, 'u', { explicit: false, wasHost: false });
    await jest.advanceTimersByTimeAsync(60_000);
    notices.arrived(ROOM, 'u');
    await flush();
    expect(log.map((l) => `${l.op}:${l.data.event}`)).toEqual(['create:left', 'update:back']);
    expect(log[1].id).toBe(log[0].id);
  });

  it('back after more than 2 minutes adds a separate "joined" row', async () => {
    const { notices, log } = setup();
    await enter(notices);
    log.length = 0;
    notices.departed(ROOM, 'u', { explicit: true, wasHost: false });
    await flush();
    await jest.advanceTimersByTimeAsync(BACK_WINDOW_MS + 1_000);
    notices.arrived(ROOM, 'u');
    await flush();
    expect(log.map((l) => `${l.op}:${l.data.event}`)).toEqual(['create:left', 'create:joined']);
  });

  it('after an explicit leave, returning within 30s is a "back", not a new left+joined pair', async () => {
    const { notices, log } = setup();
    await enter(notices);
    log.length = 0;
    notices.departed(ROOM, 'u', { explicit: true, wasHost: false });
    await flush();
    await jest.advanceTimersByTimeAsync(5_000);
    notices.arrived(ROOM, 'u');
    await flush();
    expect(log.map((l) => `${l.op}:${l.data.event}`)).toEqual(['create:left', 'update:back']);
  });

  it('first visit shows "joined", but not when the last row already says they are in', async () => {
    const first = setup({ lastEvent: null });
    await enter(first.notices);
    expect(first.log.map((l) => l.data.event)).toEqual(['joined']);

    const restarted = setup({ lastEvent: 'joined' });
    await enter(restarted.notices);
    expect(restarted.log).toHaveLength(0);
  });

  it('host leaving: explicit waits for the handover and reports the new host', async () => {
    const { notices, log, hostOutcome } = setup();
    await enter(notices);
    log.length = 0;
    notices.departed(ROOM, 'u', { explicit: true, wasHost: true });
    await jest.advanceTimersByTimeAsync(16_000);
    expect(log).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(2_000);
    expect(hostOutcome).toHaveBeenCalled();
    expect(log[0].data).toMatchObject({ event: 'left', wasHost: true, toUserId: 'neko' });
  });

  it('host leaving with nobody to take over reports the pause', async () => {
    const { notices, log, hostOutcome } = setup();
    hostOutcome.mockReturnValue({ paused: true });
    await enter(notices);
    log.length = 0;
    notices.departed(ROOM, 'u', { explicit: false, wasHost: true });
    await jest.advanceTimersByTimeAsync(AWAY_GRACE_MS + 100);
    expect(log[0].data).toMatchObject({ event: 'left', wasHost: true, paused: true });
  });

  it('immediate departure (left the room for good) skips the membership check', async () => {
    const { notices, log } = setup({ joined: false });
    await enter(notices);
    log.length = 0;
    notices.departed(ROOM, 'u', { explicit: true, wasHost: false, immediate: true });
    await flush();
    expect(log.map((l) => l.data.event)).toEqual(['left']);
  });

  it('a user who is no longer a member gets no timed "left" row', async () => {
    const { notices, log } = setup({ joined: false });
    await enter(notices);
    log.length = 0;
    notices.departed(ROOM, 'u', { explicit: false, wasHost: false });
    await jest.advanceTimersByTimeAsync(AWAY_GRACE_MS + 100);
    expect(log).toHaveLength(0);
  });

  it('rate-limits flapping users', async () => {
    const { notices, log } = setup();
    await enter(notices);
    log.length = 0;
    for (let i = 0; i < 4; i++) {
      notices.departed(ROOM, 'u', { explicit: true, wasHost: false });
      await flush();
      await jest.advanceTimersByTimeAsync(BACK_WINDOW_MS + 1_000);
      notices.arrived(ROOM, 'u');
      await flush();
    }
    expect(log.filter((l) => l.op === 'create').length).toBeLessThanOrEqual(6);
  });

  it('a second departure while already shown as left does not duplicate', async () => {
    const { notices, log } = setup();
    await enter(notices);
    log.length = 0;
    notices.departed(ROOM, 'u', { explicit: true, wasHost: false });
    await flush();
    notices.departed(ROOM, 'u', { explicit: false, wasHost: false });
    await jest.advanceTimersByTimeAsync(AWAY_GRACE_MS * 2);
    expect(log).toHaveLength(1);
  });
});
