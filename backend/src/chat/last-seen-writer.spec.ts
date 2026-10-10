import { LastSeenWriter } from './last-seen-writer';

describe('LastSeenWriter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('writes the first offline transition immediately', () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const w = new LastSeenWriter(write, 15_000);
    w.schedule('u1', new Date(1000));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('u1', new Date(1000));
  });

  it('merges a flapping user into one delayed write carrying the latest time', () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const w = new LastSeenWriter(write, 15_000);
    w.schedule('u1', new Date(1000));
    jest.advanceTimersByTime(2_000);
    w.schedule('u1', new Date(3000));
    jest.advanceTimersByTime(2_000);
    w.schedule('u1', new Date(5000));
    expect(write).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(20_000);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith('u1', new Date(5000));
  });

  it('throttles per user, not globally', () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const w = new LastSeenWriter(write, 15_000);
    w.schedule('u1', new Date(1));
    w.schedule('u2', new Date(2));
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('flushes pending writes on dispose and swallows write errors', async () => {
    const write = jest.fn().mockRejectedValue(new Error('db down'));
    const w = new LastSeenWriter(write, 15_000);
    w.schedule('u1', new Date(1));
    w.schedule('u1', new Date(2));
    w.dispose();
    expect(write).toHaveBeenCalledTimes(2);
    await Promise.resolve();
  });
});
