import { monitorEventLoopDelay, type IntervalHistogram } from 'perf_hooks';
import { FLOCK_CONFIG } from './flock.config';

const L = FLOCK_CONFIG.botLoad;

/** Одна оцінка навантаження арени за останній інтервал. */
export interface LoadSample {
  /** Середнє запізнення таймера тіків, мс. */
  lateMs: number;
  /** p99 затримки event loop процесу, мс. */
  loopP99Ms: number;
  /** CPU процесу, % від бюджету інстанса (RENDER_CPU_BUDGET_MS). */
  cpuPct: number;
}

export type LoadLevel = 'low' | 'normal' | 'high';

export type LoadReason = 'late' | 'loop' | 'cpu';

export interface GovernorDecision {
  /** Час за годинником арени, мс. */
  at: number;
  level: LoadLevel;
  action: 'remove' | 'add' | 'hold';
  /** Ліміт ботів за навантаженням після рішення (null - без обмеження). */
  loadCap: number | null;
  /** Які показники перевищили поріг (для підписів в адмінці; тексти - у перекладах). */
  reasons: LoadReason[];
  /** Оцінка, за якою ухвалено рішення. */
  sample: LoadSample;
}

export function classifyLoad(
  s: LoadSample,
  high = L.high,
  low = L.low,
): { level: LoadLevel; reasons: LoadReason[] } {
  const reasons: LoadReason[] = [];
  if (s.lateMs > high.lateMs) reasons.push('late');
  if (s.loopP99Ms > high.loopP99Ms) reasons.push('loop');
  if (s.cpuPct > high.cpuPct) reasons.push('cpu');
  if (reasons.length) return { level: 'high', reasons };
  if (
    s.lateMs < low.lateMs &&
    s.loopP99Ms < low.loopP99Ms &&
    s.cpuPct < low.cpuPct
  )
    return { level: 'low', reasons };
  return { level: 'normal', reasons };
}

/**
 * Регулятор кількості ботів за навантаженням. Чиста логіка без таймерів: арена викликає `evaluate` раз на
 * botLoad.evalMs. Високе навантаження - ліміт ботів знижується на одного (до 0); довго низьке (returnAfterLow
 * оцінок поспіль) - піднімається на одного, поки не дійде до штатної кількості. Нормальне - тримаємо як є.
 */
export class BotGovernor {
  /** null - обмеження немає (діє лише штатна кількість). */
  loadCap: number | null = null;
  private lowStreak = 0;

  constructor(
    private readonly returnAfterLow: number = L.returnAfterLow,
    private readonly thresholds = { high: L.high, low: L.low },
  ) {}

  evaluate(
    s: LoadSample,
    /** Штатна кількість ботів (за людьми й жорсткими лімітами). */
    desired: number,
    /** Скільки ботів зараз реально грає (без тих, що йдуть). */
    active: number,
    at: number,
  ): GovernorDecision {
    const { level, reasons } = classifyLoad(
      s,
      this.thresholds.high,
      this.thresholds.low,
    );
    let action: GovernorDecision['action'] = 'hold';
    if (level === 'high') {
      this.lowStreak = 0;
      const base = Math.min(this.loadCap ?? Infinity, desired, active);
      if (base > 0) {
        this.loadCap = base - 1;
        action = 'remove';
      } else {
        this.loadCap = 0;
      }
    } else if (level === 'low') {
      this.lowStreak++;
      if (this.loadCap !== null && this.lowStreak >= this.returnAfterLow) {
        this.lowStreak = 0;
        this.loadCap += 1;
        action = 'add';
        if (this.loadCap >= desired) this.loadCap = null;
      }
    } else {
      this.lowStreak = 0;
    }
    return { at, level, action, loadCap: this.loadCap, reasons, sample: s };
  }

  /** Скільки ботів дозволено: штатна кількість, обмежена навантаженням. */
  limit(desired: number): number {
    return this.loadCap === null ? desired : Math.min(desired, this.loadCap);
  }
}

/** Жорсткий ліміт ботів за кількістю живих людей (flock.config: botCapByHumans). */
export function botCapForHumans(humans: number): number {
  for (const [from, cap] of FLOCK_CONFIG.botCapByHumans) {
    if (humans >= from) return cap;
  }
  return Infinity;
}

/**
 * Вимірює те, що не знає сама арена: лаг event loop (гістограма за інтервал) і CPU процесу від бюджету інстанса.
 * Кожна арена має свій екземпляр: `sample()` скидає лічильники.
 */
export class ProcessLoadSampler {
  private readonly hist: IntervalHistogram = monitorEventLoopDelay({
    resolution: 10,
  });
  private cpu0 = process.cpuUsage();
  private t0 = performance.now();

  constructor(private readonly budgetMsPerSec: number) {
    this.hist.enable();
  }

  sample(): Pick<LoadSample, 'loopP99Ms' | 'cpuPct'> {
    const wall = Math.max(1, performance.now() - this.t0);
    const cpu = process.cpuUsage(this.cpu0);
    const cpuMsPerSec = ((cpu.user + cpu.system) / 1000 / wall) * 1000;
    // monitorEventLoopDelay міряє від «ідеального» кроку resolution: віднімаємо його
    const p99 = Math.max(0, this.hist.percentile(99) / 1e6 - 10);
    this.hist.reset();
    this.cpu0 = process.cpuUsage();
    this.t0 = performance.now();
    return {
      loopP99Ms: Number.isFinite(p99) ? p99 : 0,
      cpuPct: (cpuMsPerSec / this.budgetMsPerSec) * 100,
    };
  }

  dispose() {
    this.hist.disable();
  }
}
