import { advanceStation, nextTrackId, trackEndsAt, type RadioQueueItem } from './radio.schedule';

const q: RadioQueueItem[] = [
  { id: 'a', durationMs: 100_000 },
  { id: 'b', durationMs: 200_000 },
  { id: 'c', durationMs: 50_000 },
];

describe('radio schedule', () => {
  it('пустая очередь - эфир офлайн', () => {
    expect(advanceStation([], { trackId: 'a', startedAtMs: 0 }, 10)).toBeNull();
    expect(nextTrackId([], null)).toBeNull();
  });

  it('нет позиции - стартует первый трек сейчас (или заданный)', () => {
    expect(advanceStation(q, null, 5_000)).toEqual({ trackId: 'a', startedAtMs: 5_000 });
    expect(advanceStation(q, null, 5_000, 'c')).toEqual({ trackId: 'c', startedAtMs: 5_000 });
  });

  it('трек ещё играет - позиция не меняется', () => {
    const pos = { trackId: 'b', startedAtMs: 1_000 };
    expect(advanceStation(q, pos, 150_000)).toEqual(pos);
  });

  it('трек закончился - следующий стартует ровно в момент конца предыдущего', () => {
    expect(advanceStation(q, { trackId: 'a', startedAtMs: 0 }, 100_500)).toEqual({ trackId: 'b', startedAtMs: 100_000 });
  });

  it('после рестарта догоняет несколько треков и круг очереди', () => {
    // круг = 350 с; прошло 2 круга и 120 с: a(0-100) закончился, играет b
    expect(advanceStation(q, { trackId: 'a', startedAtMs: 0 }, 2 * 350_000 + 120_000)).toEqual({
      trackId: 'b',
      startedAtMs: 2 * 350_000 + 100_000,
    });
  });

  it('последний трек переходит на первый', () => {
    expect(advanceStation(q, { trackId: 'c', startedAtMs: 0 }, 50_001)).toEqual({ trackId: 'a', startedAtMs: 50_000 });
    expect(nextTrackId(q, 'c')).toBe('a');
  });

  it('текущий трек удалили - стартует переданный следующий, иначе первый', () => {
    const gone = { trackId: 'zzz', startedAtMs: 0 };
    expect(advanceStation(q, gone, 1_000, 'b')).toEqual({ trackId: 'b', startedAtMs: 1_000 });
    expect(advanceStation(q, gone, 1_000)).toEqual({ trackId: 'a', startedAtMs: 1_000 });
  });

  it('один трек крутится по кругу', () => {
    const one: RadioQueueItem[] = [{ id: 'x', durationMs: 60_000 }];
    expect(advanceStation(one, { trackId: 'x', startedAtMs: 0 }, 130_000)).toEqual({ trackId: 'x', startedAtMs: 120_000 });
  });

  it('trackEndsAt', () => {
    expect(trackEndsAt(q, { trackId: 'b', startedAtMs: 1_000 })).toBe(201_000);
    expect(trackEndsAt(q, null)).toBeNull();
  });
});
