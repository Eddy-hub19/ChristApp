import { FLOCK_CONFIG } from './flock.config';

const Z = FLOCK_CONFIG.circle;

/** Одне повідомлення клієнтам про стан кола; далі вони самі рахують радіус за часом (без потоку по тіках). */
export interface CircleMsg {
  x: number;
  y: number;
  /** Радіус на цю мить і цільовий радіус поточної стадії. */
  r0: number;
  r1: number;
  /** Скільки мс чекаємо до початку звуження від ЦІЄЇ миті й скільки воно триватиме (мс). */
  hold: number;
  shrink: number;
  /** Номер стадії (0 - розминка) і скільки їх усього. */
  stage: number;
  stages: number;
}

interface Segment {
  /** Початок сегмента від старту раунду (мс). */
  at: number;
  hold: number;
  shrink: number;
  from: number;
  to: number;
}

/**
 * Хід одного раунду режиму «Звужуване коло»: розминка, стадії (чекаємо -> звужуємось), фінальна пауза. Чиста логіка без
 * таймерів і без доступу до світу: арена віддає годинник, а отримує радіус і події стадій.
 */
export class CircleRound {
  readonly segments: Segment[] = [];
  readonly totalMs: number;
  private lastSeg = -1;

  constructor(
    readonly x: number,
    readonly y: number,
    readonly startedAt: number,
  ) {
    let at = 0;
    let from: number = Z.startRadius;
    this.segments.push({ at, hold: Z.warmupMs, shrink: 0, from, to: from });
    at += Z.warmupMs;
    for (const st of Z.stages) {
      this.segments.push({ at, hold: st.holdMs, shrink: st.shrinkMs, from, to: st.radius });
      at += st.holdMs + st.shrinkMs;
      from = st.radius;
    }
    this.totalMs = at + Z.finalHoldMs;
  }

  elapsed(now: number) {
    return now - this.startedAt;
  }

  /** Розминка ще триває (звуження й втрата маси не почалися, боти ще додаються). */
  inWarmup(now: number) {
    return this.elapsed(now) < Z.warmupMs;
  }

  private segIndex(t: number) {
    let i = 0;
    while (i + 1 < this.segments.length && t >= this.segments[i + 1].at) i++;
    return i;
  }

  radiusAt(now: number): number {
    const t = this.elapsed(now);
    const seg = this.segments[this.segIndex(t)];
    const into = t - seg.at;
    if (into <= seg.hold) return seg.from;
    if (seg.shrink <= 0) return seg.to;
    return seg.from + (seg.to - seg.from) * Math.min(1, (into - seg.hold) / seg.shrink);
  }

  /** Повідомлення про сегмент, у якому ми зараз (для нових клієнтів): hold/shrink - те, що лишилось. */
  snapshot(now: number): CircleMsg {
    const t = this.elapsed(now);
    const idx = this.segIndex(t);
    const seg = this.segments[idx];
    const into = t - seg.at;
    const holdLeft = Math.max(0, seg.hold - into);
    const shrinkLeft = into <= seg.hold ? seg.shrink : Math.max(0, seg.shrink - (into - seg.hold));
    return {
      x: Math.round(this.x),
      y: Math.round(this.y),
      r0: Math.round(this.radiusAt(now)),
      r1: Math.round(seg.to),
      hold: Math.round(holdLeft),
      shrink: Math.round(shrinkLeft),
      stage: idx,
      stages: this.segments.length - 1,
    };
  }

  /** Повертає повідомлення, якщо з минулого виклику почався новий сегмент (першим викликом - розминка). */
  nextEvent(now: number): CircleMsg | null {
    const idx = this.segIndex(this.elapsed(now));
    if (idx === this.lastSeg) return null;
    this.lastSeg = idx;
    return this.snapshot(now);
  }

  /** Час вийшов: після останнього звуження пройшла фінальна пауза. */
  timeUp(now: number) {
    return this.elapsed(now) >= this.totalMs;
  }
}
