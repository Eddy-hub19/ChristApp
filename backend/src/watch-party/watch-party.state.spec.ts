import {
  applyControlCommand,
  compensateTransit,
  pickNextHost,
  projectPosition,
  type WatchPlaybackState,
} from './watch-party.state';

const base: WatchPlaybackState = {
  provider: 'YOUTUBE',
  videoId: 'dQw4w9WgXcQ',
  isPlaying: true,
  positionSec: 10,
  updatedAtMs: 1_000_000,
};

describe('projectPosition', () => {
  it('рахує позицію під час відтворення від якоря', () => {
    expect(projectPosition(base, 1_004_500)).toBeCloseTo(14.5);
  });

  it('на паузі позиція не рухається', () => {
    expect(projectPosition({ ...base, isPlaying: false }, 1_050_000)).toBe(10);
  });

  it('не йде назад, якщо годинник «відстає» від якоря', () => {
    expect(projectPosition(base, 999_000)).toBe(10);
  });
});

describe('compensateTransit', () => {
  it('додає час доставки для відтворення', () => {
    expect(compensateTransit(20, true, 1_000_000, 1_000_300)).toBeCloseTo(20.3);
  });

  it('ігнорує підозрілу затримку (розбіжність годинників)', () => {
    expect(compensateTransit(20, true, 1_000_000, 1_010_000)).toBe(20);
    expect(compensateTransit(20, true, 1_000_500, 1_000_000)).toBe(20);
  });

  it('на паузі нічого не компенсує', () => {
    expect(compensateTransit(20, false, 1_000_000, 1_000_300)).toBe(20);
  });
});

describe('applyControlCommand', () => {
  it('pause фіксує позицію хоста', () => {
    const next = applyControlCommand(
      base,
      { type: 'pause', positionSec: 12.3 },
      1_002_000,
    );
    expect(next).toMatchObject({ isPlaying: false, positionSec: 12.3 });
    expect(next?.updatedAtMs).toBe(1_002_000);
  });

  it('play без позиції продовжує з проєкції', () => {
    const paused = { ...base, isPlaying: false };
    const next = applyControlCommand(paused, { type: 'play' }, 1_005_000);
    expect(next).toMatchObject({ isPlaying: true, positionSec: 10 });
  });

  it('seek не змінює play/pause', () => {
    const next = applyControlCommand(
      base,
      { type: 'seek', positionSec: 100 },
      1_001_000,
    );
    expect(next).toMatchObject({ isPlaying: true, positionSec: 100 });
  });

  it('changeVideo ставить нове відео на паузу з таймкоду', () => {
    const next = applyControlCommand(
      base,
      { type: 'changeVideo', provider: 'YOUTUBE', videoId: 'abcdefghijk', startSec: 42 },
      1_001_000,
    );
    expect(next).toEqual({
      provider: 'YOUTUBE',
      videoId: 'abcdefghijk',
      isPlaying: false,
      positionSec: 42,
      updatedAtMs: 1_001_000,
    });
  });

  it('changeVideo дозволяє змінити провайдера (напр. YouTube → Vimeo)', () => {
    const next = applyControlCommand(
      base,
      { type: 'changeVideo', provider: 'VIMEO', videoId: '76979871', startSec: 0 },
      1_001_000,
    );
    expect(next).toMatchObject({ provider: 'VIMEO', videoId: '76979871' });
  });

  it('heartbeat у межах похибки нічого не розсилає', () => {
    const next = applyControlCommand(
      base,
      { type: 'heartbeat', positionSec: 15.1, isPlaying: true },
      1_005_000,
    );
    expect(next).toBeNull();
  });

  it('heartbeat виправляє якір, коли хост відстав (буферизація)', () => {
    const next = applyControlCommand(
      base,
      { type: 'heartbeat', positionSec: 13, isPlaying: true },
      1_005_000,
    );
    expect(next).toMatchObject({ positionSec: 13, updatedAtMs: 1_005_000 });
  });

  it('heartbeat не запускає відтворення після паузи', () => {
    const paused = { ...base, isPlaying: false };
    expect(
      applyControlCommand(
        paused,
        { type: 'heartbeat', positionSec: 40, isPlaying: true },
        1_005_000,
      ),
    ).toBeNull();
  });

  it('відкидає від’ємні та нескінченні позиції', () => {
    expect(
      applyControlCommand(base, { type: 'seek', positionSec: -5 }, 1_000_000)
        ?.positionSec,
    ).toBe(0);
    expect(
      applyControlCommand(
        base,
        { type: 'pause', positionSec: Number.POSITIVE_INFINITY },
        1_000_000,
      )?.positionSec,
    ).toBe(0);
  });
});

describe('pickNextHost', () => {
  it('обирає першого за часом приєднання серед присутніх', () => {
    expect(pickNextHost(['host', 'a', 'b'], 'host', new Set(['b', 'a']))).toBe(
      'a',
    );
  });

  it('пропускає відсутніх', () => {
    expect(pickNextHost(['host', 'a', 'b'], 'host', new Set(['b']))).toBe('b');
  });

  it('null, якщо в залі нікого, крім хоста', () => {
    expect(pickNextHost(['host', 'a'], 'host', new Set(['host']))).toBeNull();
  });
});
