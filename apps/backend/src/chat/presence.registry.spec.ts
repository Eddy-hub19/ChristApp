import {
  PRESENCE_AWAY_AFTER_MS,
  PRESENCE_DISCONNECT_DEBOUNCE_MS,
  PresenceRegistry,
  type PresenceChange,
} from './presence.registry';

describe('PresenceRegistry', () => {
  let r: PresenceRegistry;
  let changes: PresenceChange[];

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    r = new PresenceRegistry();
    changes = [];
    r.onChange((c) => changes.push(c));
    r.start();
  });

  afterEach(() => {
    r.stop();
    jest.useRealTimers();
  });

  const summary = () => changes.map((c) => `${c.userId}:${c.isOnline}`);

  it('a connected socket is NOT online until the client says the app is visible', () => {
    r.connect('s1', 'u1');
    expect(r.isOnline('u1')).toBe(false);
    r.setActive('s1', true);
    expect(r.isOnline('u1')).toBe(true);
    expect(summary()).toEqual(['u1:true']);
  });

  it('explicit away goes offline immediately and records lastSeen at that moment', () => {
    r.connect('s1', 'u1');
    r.setActive('s1', true);
    jest.advanceTimersByTime(7_000);
    r.setActive('s1', false);
    expect(r.isOnline('u1')).toBe(false);
    expect(changes[1]).toEqual({
      userId: 'u1',
      isOnline: false,
      lastSeenAt: new Date('2026-01-01T12:00:07Z'),
    });
  });

  it('keepalive request from the owner marks away; somebody else cannot', () => {
    r.connect('s1', 'u1');
    r.setActive('s1', true);
    expect(r.setActive('s1', false, 'mallory')).toBe(false);
    expect(r.isOnline('u1')).toBe(true);
    expect(r.setActive('s1', false, 'u1')).toBe(true);
    expect(r.isOnline('u1')).toBe(false);
  });

  it('heartbeats keep the user online past the timeout; silence drops them at ~45s', () => {
    r.connect('s1', 'u1');
    r.setActive('s1', true);
    for (let i = 0; i < 6; i += 1) {
      jest.advanceTimersByTime(20_000);
      r.setActive('s1', true);
    }
    expect(r.isOnline('u1')).toBe(true);
    expect(summary()).toEqual(['u1:true']);

    const lastBeat = Date.now();
    jest.advanceTimersByTime(PRESENCE_AWAY_AFTER_MS - 1_000);
    expect(r.isOnline('u1')).toBe(true);
    jest.advanceTimersByTime(6_000); // sweeper ticks every 5s
    expect(r.isOnline('u1')).toBe(false);
    expect(changes.at(-1)?.lastSeenAt).toEqual(new Date(lastBeat));
  });

  it('socket drop is debounced: a quick reconnect never flickers', () => {
    r.connect('s1', 'u1');
    r.setActive('s1', true);
    r.disconnect('s1');
    expect(r.isOnline('u1')).toBe(true);

    jest.advanceTimersByTime(PRESENCE_DISCONNECT_DEBOUNCE_MS - 1_000);
    r.connect('s2', 'u1');
    r.setActive('s2', true);
    jest.advanceTimersByTime(PRESENCE_DISCONNECT_DEBOUNCE_MS * 2);
    expect(r.isOnline('u1')).toBe(true);
    expect(summary()).toEqual(['u1:true']);
  });

  it('socket drop without a return goes offline after the debounce, lastSeen = drop time', () => {
    r.connect('s1', 'u1');
    r.setActive('s1', true);
    const droppedAt = Date.now();
    r.disconnect('s1');
    jest.advanceTimersByTime(PRESENCE_DISCONNECT_DEBOUNCE_MS + 1);
    expect(r.isOnline('u1')).toBe(false);
    expect(changes.at(-1)?.lastSeenAt).toEqual(new Date(droppedAt));
  });

  it('explicit away during a pending drop is not delayed', () => {
    r.connect('s1', 'u1');
    r.setActive('s1', true);
    r.connect('s2', 'u1');
    r.setActive('s2', true);
    r.disconnect('s1'); // s2 still active → still online, nothing pending
    expect(r.isOnline('u1')).toBe(true);
    r.setActive('s2', false);
    expect(r.isOnline('u1')).toBe(false);
  });

  it('several devices: online while any is active, offline only when all left', () => {
    r.connect('phone', 'u1');
    r.connect('laptop', 'u1');
    r.setActive('phone', true);
    r.setActive('laptop', true);
    expect(summary()).toEqual(['u1:true']);

    r.setActive('phone', false);
    expect(r.isOnline('u1')).toBe(true);
    r.setActive('laptop', false);
    expect(r.isOnline('u1')).toBe(false);
    expect(summary()).toEqual(['u1:true', 'u1:false']);
  });

  it('a hidden second device does not keep the user online', () => {
    r.connect('phone', 'u1');
    r.connect('laptop', 'u1'); // connected but hidden: never sent active
    r.setActive('phone', true);
    r.setActive('phone', false);
    expect(r.isOnline('u1')).toBe(false);
    expect(r.socketCount('u1')).toBe(2);
  });

  it('a stale device does not drop a user whose other device is still beating', () => {
    r.connect('phone', 'u1');
    r.connect('laptop', 'u1');
    r.setActive('phone', true);
    r.setActive('laptop', true);
    jest.advanceTimersByTime(30_000);
    r.setActive('laptop', true);
    jest.advanceTimersByTime(30_000); // phone silent for 60s, laptop for 30s
    expect(r.isOnline('u1')).toBe(true);
    expect(summary()).toEqual(['u1:true']);
  });

  it('users are independent', () => {
    r.connect('a', 'u1');
    r.connect('b', 'u2');
    r.setActive('a', true);
    r.setActive('b', true);
    r.setActive('a', false);
    expect(r.onlineUserIds()).toEqual(['u2']);
  });

  it('reset (backend start): nobody is online until they send active again', () => {
    r.connect('s1', 'u1');
    r.setActive('s1', true);
    r.reset();
    expect(r.onlineUserIds()).toEqual([]);
    expect(r.socketCount('u1')).toBe(0);
    r.start();
    jest.advanceTimersByTime(PRESENCE_AWAY_AFTER_MS * 2);
    expect(summary()).toEqual(['u1:true']); // no phantom offline event either
  });

  it('connect is idempotent: a late registration does not reset an already active device', () => {
    r.connect('s1', 'u1');
    r.setActive('s1', true);
    r.connect('s1', 'u1');
    expect(r.isOnline('u1')).toBe(true);
    r.setActive('s1', false);
    expect(r.isOnline('u1')).toBe(false);
  });

  it('events from an unknown socket are ignored', () => {
    expect(r.setActive('ghost', true)).toBe(false);
    expect(r.onlineUserIds()).toEqual([]);
  });
});
