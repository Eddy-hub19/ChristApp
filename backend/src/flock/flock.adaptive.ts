import { FLOCK_CONFIG } from './flock.config';

/**
 * Запобіжник для слабкого CPU (безкоштовний Render душить процес квотою): якщо таймер тіка стабільно
 * запізнюється, арена тимчасово знижує частоту (10 -> 8 -> 6 Гц), а коли стало спокійно - повертає.
 * Клієнт про це знає з часу сервера в пакеті (інтерполяція за часом, а не за номером тіка).
 */
export class AdaptiveRate {
  private level = 0;
  private ema = 0;
  private changedAt = -Infinity;
  private readonly rates: number[];

  constructor(
    baseHz: number = FLOCK_CONFIG.tickHz,
    fallbacks: readonly number[] = FLOCK_CONFIG.tickHzFallback,
    private readonly upMs: number = FLOCK_CONFIG.lagBackoffMs,
    private readonly downMs: number = FLOCK_CONFIG.lagRecoverMs,
  ) {
    this.rates = [baseHz, ...fallbacks.filter((h) => h < baseHz)];
  }

  get hz() {
    return this.rates[this.level];
  }

  /** Викликається на кожному тіку із запізненням таймера (мс) і поточним часом (мс). Повертає частоту. */
  update(lateMs: number, nowMs: number): number {
    this.ema = this.ema * 0.85 + lateMs * 0.15;
    const sinceChange = nowMs - this.changedAt;
    if (
      this.ema > this.upMs &&
      this.level < this.rates.length - 1 &&
      sinceChange > 2000
    ) {
      this.level++;
      this.changedAt = nowMs;
      this.ema = this.upMs * 0.5; // дати нову частоту оцінити з чистого аркуша
    } else if (this.ema < this.downMs && this.level > 0 && sinceChange > 8000) {
      this.level--;
      this.changedAt = nowMs;
    }
    return this.hz;
  }
}
