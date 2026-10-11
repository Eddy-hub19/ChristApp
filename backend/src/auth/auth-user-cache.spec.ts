import { AuthUserCache } from './auth-user-cache';

describe('AuthUserCache', () => {
  it('serves a user until the TTL, then forgets it', () => {
    let now = 0;
    const cache = new AuthUserCache<{ id: string }>(30_000, () => now);
    cache.set('u1', { id: 'u1' });
    now = 29_999;
    expect(cache.get('u1')).toEqual({ id: 'u1' });
    now = 30_001;
    expect(cache.get('u1')).toBeUndefined();
  });

  it('drops a user on invalidate (profile edit, delete)', () => {
    const cache = new AuthUserCache<{ id: string }>();
    cache.set('u1', { id: 'u1' });
    cache.invalidate('u1');
    expect(cache.get('u1')).toBeUndefined();
  });
});
