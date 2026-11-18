import { FlockInviteLimiter, isFlockInviteContent } from './flock-invite-limit';

describe('FlockInviteLimiter', () => {
  it('allows one invite per user per minute', () => {
    const limiter = new FlockInviteLimiter(60_000);
    expect(limiter.tryAcquire('a', 1_000)).toBe(0);
    expect(limiter.tryAcquire('a', 1_000 + 10_000)).toBe(50);
    expect(limiter.tryAcquire('a', 1_000 + 59_999)).toBe(1);
    expect(limiter.tryAcquire('a', 1_000 + 60_000)).toBe(0);
  });

  it('limits users independently', () => {
    const limiter = new FlockInviteLimiter(60_000);
    expect(limiter.tryAcquire('a', 0)).toBe(0);
    expect(limiter.tryAcquire('b', 1)).toBe(0);
    expect(limiter.tryAcquire('a', 2)).toBeGreaterThan(0);
  });
});

describe('isFlockInviteContent', () => {
  it('matches only the exact invite marker', () => {
    expect(isFlockInviteContent('[[flock-invite:3]]')).toBe(true);
    expect(isFlockInviteContent(' [[flock-invite:0]] ')).toBe(true);
    expect(isFlockInviteContent('hello [[flock-invite:3]]')).toBe(false);
    expect(isFlockInviteContent('[[sticker:1]]')).toBe(false);
  });
});
