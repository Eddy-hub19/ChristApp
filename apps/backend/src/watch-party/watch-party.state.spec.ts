import {
  applyControlCommand,
  compensateTransit,
  initialManualState,
  manualCountdownElapsed,
  manualDropReady,
  manualPause,
  manualResume,
  manualSetReady,
  manualStart,
  pickNextHost,
  projectPosition,
  resetManualState,
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

describe('ручна синхронізація (IFRAME/MANUAL)', () => {
  it('початковий стан — idle, без готових, без відліку, без напрацьованого часу', () => {
    expect(initialManualState()).toEqual({
      phase: 'idle',
      countdownEndsAtMs: null,
      readyUserIds: new Set(),
      accumulatedMs: 0,
      runningSinceMs: null,
    });
  });

  it('manualSetReady додає й знімає готовність, не займаючи фазу', () => {
    let state = initialManualState();
    state = manualSetReady(state, 'a', true);
    state = manualSetReady(state, 'b', true);
    expect([...state.readyUserIds].sort()).toEqual(['a', 'b']);
    expect(state.phase).toBe('idle');

    state = manualSetReady(state, 'a', false);
    expect([...state.readyUserIds]).toEqual(['b']);
  });

  it('manualDropReady прибирає користувача, що вийшов із кімнати', () => {
    let state = initialManualState();
    state = manualSetReady(state, 'a', true);
    state = manualDropReady(state, 'a');
    expect(state.readyUserIds.size).toBe(0);
  });

  it('manualStart переводить idle → countdown із дедлайном за 3с', () => {
    const state = manualStart(initialManualState(), 1_000_000);
    expect(state).toEqual({
      phase: 'countdown',
      countdownEndsAtMs: 1_003_000,
      readyUserIds: new Set(),
      accumulatedMs: 0,
      runningSinceMs: null,
    });
  });

  it('manualStart відхиляє повторний виклик поза idle', () => {
    const started = manualStart(initialManualState(), 1_000_000)!;
    expect(manualStart(started, 1_000_100)).toBeNull();
  });

  it('manualCountdownElapsed переводить countdown → running, скидає дедлайн і ставить якір "запізлілого" таймера на момент дедлайну', () => {
    const started = manualStart(initialManualState(), 1_000_000)!;
    const running = manualCountdownElapsed(started);
    expect(running).toEqual({
      phase: 'running',
      countdownEndsAtMs: null,
      readyUserIds: new Set(),
      accumulatedMs: 0,
      runningSinceMs: 1_003_000, // = countdownEndsAtMs, не "коли спрацював таймер"
    });
  });

  it('manualCountdownElapsed — no-op поза countdown', () => {
    expect(manualCountdownElapsed(initialManualState())).toBeNull();
  });

  it('manualPause переводить running або countdown → paused', () => {
    const started = manualStart(initialManualState(), 1_000_000)!;
    const running = manualCountdownElapsed(started)!;
    expect(manualPause(running, 1_010_000)?.phase).toBe('paused');
    expect(manualPause(started, 1_001_000)?.phase).toBe('paused');
  });

  it('manualPause відхиляє виклик з idle/paused', () => {
    expect(manualPause(initialManualState(), 0)).toBeNull();
    const paused = manualPause(manualCountdownElapsed(manualStart(initialManualState(), 0)!)!, 5_000)!;
    expect(manualPause(paused, 6_000)).toBeNull();
  });

  it('manualPause з running накопичує пройдений час показу (accumulatedMs) і знімає якір', () => {
    const started = manualStart(initialManualState(), 0)!; // countdownEndsAtMs = 3_000
    const running = manualCountdownElapsed(started)!; // runningSinceMs = 3_000
    const paused = manualPause(running, 15_000)!; // йшло 12с
    expect(paused.accumulatedMs).toBe(12_000);
    expect(paused.runningSinceMs).toBeNull();
  });

  it('manualPause з countdown (перервали ще до running) не додає час показу', () => {
    const started = manualStart(initialManualState(), 0)!;
    const paused = manualPause(started, 1_500)!;
    expect(paused.accumulatedMs).toBe(0);
  });

  it('manualResume переводить paused → новий countdown, не чіпаючи вже напрацьований час', () => {
    const started = manualStart(initialManualState(), 0)!;
    const running = manualCountdownElapsed(started)!;
    const paused = manualPause(running, 15_000)!; // accumulatedMs = 12_000
    const resumed = manualResume(paused, 20_000);
    expect(resumed).toEqual({
      phase: 'countdown',
      countdownEndsAtMs: 23_000,
      readyUserIds: new Set(),
      accumulatedMs: 12_000,
      runningSinceMs: null,
    });
  });

  it('manualResume відхиляє виклик поза paused', () => {
    expect(manualResume(initialManualState(), 0)).toBeNull();
  });

  it('повторні паузи додають до вже накопиченого часу (кілька відрізків running)', () => {
    let state = manualStart(initialManualState(), 0)!; // countdownEndsAtMs = 3_000
    state = manualCountdownElapsed(state)!; // runningSinceMs = 3_000
    state = manualPause(state, 8_000)!; // +5_000 → accumulatedMs = 5_000
    state = manualResume(state, 10_000)!; // countdownEndsAtMs = 13_000
    state = manualCountdownElapsed(state)!; // runningSinceMs = 13_000
    state = manualPause(state, 20_000)!; // +7_000 → accumulatedMs = 12_000
    expect(state.accumulatedMs).toBe(12_000);
  });

  it('resetManualState завжди повертає чистий idle (напр. після зміни відео)', () => {
    let state = manualStart(initialManualState(), 0)!;
    state = manualSetReady(state, 'a', true);
    state = manualCountdownElapsed(state)!;
    manualPause(state, 10_000);
    expect(resetManualState()).toEqual(initialManualState());
  });
});
