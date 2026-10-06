import {
  ACTIVITY_RATE_LIMIT,
  ACTIVITY_RATE_WINDOW_MS,
  ACTIVITY_TTL_MS,
  GameActivityService,
} from './game-activity.service';

const ed = { id: 'u1', username: 'Ед' };
const neko = { id: 'u2', username: 'Neko' };

describe('GameActivityService', () => {
  it('sets and clears an activity and reports the affected room', () => {
    const s = new GameActivityService();
    expect(s.set('s1', ed, 'r1', 'doodle', 0)).toEqual(['r1']);
    expect(s.snapshot('r1')).toEqual([
      {
        roomId: 'r1',
        userId: 'u1',
        username: 'Ед',
        game: 'doodle',
        joinable: true,
        sessionId: 'r1:doodle',
      },
    ]);
    expect(s.set('s1', ed, 'r1', null, 1)).toEqual(['r1']);
    expect(s.snapshot('r1')).toEqual([]);
  });

  it('ignores unknown games and treats a repeat as a silent heartbeat', () => {
    const s = new GameActivityService();
    expect(s.set('s1', ed, 'r1', 'nope', 0)).toEqual([]);
    s.set('s1', ed, 'r1', 'snake', 0);
    expect(s.set('s1', ed, 'r1', 'snake', 10_000)).toEqual([]);
  });

  it('expires without heartbeat but survives with one', () => {
    const s = new GameActivityService();
    s.set('s1', ed, 'r1', 'snake', 0);
    s.set('s1', ed, 'r1', 'snake', ACTIVITY_TTL_MS - 1);
    expect(s.sweep(ACTIVITY_TTL_MS + 1000)).toEqual([]);
    expect(s.sweep(2 * ACTIVITY_TTL_MS + 5000)).toEqual(['r1']);
    expect(s.snapshot('r1')).toEqual([]);
  });

  it('drops the activity when the socket disconnects', () => {
    const s = new GameActivityService();
    s.set('s1', ed, 'r1', 'snake', 0);
    expect(s.removeSocket('s1')).toEqual(['r1']);
    expect(s.removeSocket('s1')).toEqual([]);
  });

  it('moves an activity between rooms and reports both', () => {
    const s = new GameActivityService();
    s.set('s1', ed, 'r1', 'snake', 0);
    expect(s.set('s1', ed, 'r2', 'snake', 1)).toEqual(['r1', 'r2']);
    expect(s.snapshot('r1')).toEqual([]);
  });

  it('is not joinable for single-player games or when the session is full', () => {
    const s = new GameActivityService();
    s.set('s1', ed, 'r1', 'filword', 0);
    expect(s.snapshot('r1')[0].joinable).toBe(false);
    s.set('s1', ed, 'r1', 'snake', 1);
    expect(s.snapshot('r1')[0].joinable).toBe(true);
    s.set('s2', neko, 'r1', 'snake', 2);
    expect(s.snapshot('r1').every((a) => !a.joinable)).toBe(true);
  });

  it('collapses several sockets of one user into one activity', () => {
    const s = new GameActivityService();
    s.set('s1', ed, 'r1', 'snake', 0);
    s.set('s2', ed, 'r1', 'snake', 5);
    expect(s.snapshot('r1')).toHaveLength(1);
    expect(s.snapshot('r1')[0].joinable).toBe(true);
  });

  it('rate-limits one socket', () => {
    const s = new GameActivityService();
    for (let i = 0; i < ACTIVITY_RATE_LIMIT; i++) {
      expect(s.allow('s1', i)).toBe(true);
    }
    expect(s.allow('s1', 100)).toBe(false);
    expect(s.allow('s2', 100)).toBe(true);
    expect(s.allow('s1', ACTIVITY_RATE_WINDOW_MS + 100)).toBe(true);
  });
});
