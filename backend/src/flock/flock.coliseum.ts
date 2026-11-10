import { FLOCK_CONFIG } from './flock.config';
import { radiusOf, type FlockWorld, type Player, type Rng } from './flock.engine';

const C = FLOCK_CONFIG;
const K = C.coliseum;

/** Множник числа/маси за кількістю людей: лінійна інтерполяція між 1, 3 і 6 (за межами - крайні значення). */
export function playerScale(humans: number): { count: number; mass: number } {
  const keys = Object.keys(K.playerScale)
    .map(Number)
    .sort((a, b) => a - b);
  const h = Math.max(keys[0], Math.min(keys[keys.length - 1], humans));
  let lo = keys[0];
  let hi = keys[keys.length - 1];
  for (const k of keys) {
    if (k <= h) lo = k;
  }
  for (const k of [...keys].reverse()) {
    if (k >= h) hi = k;
  }
  const a = K.playerScale[lo];
  const b = K.playerScale[hi];
  const t = hi === lo ? 0 : (h - lo) / (hi - lo);
  return { count: a.count + (b.count - a.count) * t, mass: a.mass + (b.mass - a.mass) * t };
}

/** Скільки вовків і яка маса в хвилі k (1-based) для `humans` людей; shed - регулятор навантаження просить менше. */
export function waveSpec(k: number, humans: number, shed = false): { count: number; mass: number } {
  const s = playerScale(humans);
  let count = Math.round((K.wolves.base + K.wolves.perWave * (k - 1)) * s.count);
  if (shed) count = Math.round(count * K.shedFraction);
  count = Math.max(K.wolves.minCount, count);
  return { count, mass: (K.wolves.massBase + K.wolves.massPerWave * (k - 1)) * s.mass };
}

export const tigerMass = (humans: number) => Math.round(K.tiger.massBase * playerScale(humans).mass);

/** Простий ШІ вовка/тигра: переслідує найближчу овечку, яку може з'їсти (тигр - будь-яку), вовк тікає від більших овець поруч. */
export function thinkMob(w: FlockWorld, p: Player) {
  if (!p.alive || p.cells.length === 0) return;
  if ((w.tickNo + p.id) % C.botThinkEvery !== 0) return;
  const me = w.centroid(p);
  let myMass = 0;
  for (const c of p.cells) myMass = Math.max(myMass, c.mass);
  let chase: { x: number; y: number; d: number } | null = null;
  let flee: { x: number; y: number; d: number } | null = null;
  for (const o of w.players.values()) {
    if (o.bot || !o.alive || o.paused || o.wolf || o.tiger) continue;
    for (const c of o.cells) {
      const d = Math.hypot(c.x - me.x, c.y - me.y) - radiusOf(c.mass);
      if (!p.tiger && c.mass >= myMass * C.eatRatio) {
        if (d < 380 && (!flee || d < flee.d)) flee = { x: c.x, y: c.y, d };
      } else if (!chase || d < chase.d) chase = { x: c.x, y: c.y, d };
    }
  }
  const sp = p.tiger ? K.tiger.speed : K.wolfSpeed;
  if (flee) {
    p.angle = Math.atan2(me.y - flee.y, me.x - flee.x);
  } else if (chase) {
    p.angle = Math.atan2(chase.y - me.y, chase.x - me.x);
  } else {
    const a = w.arena;
    p.angle = a ? Math.atan2(a.cy - me.y, a.cx - me.x) : p.angle;
  }
  p.power = sp;
}

export interface ColiseumHud {
  /** Фаза: 0 - стоїмо (нікого нема), 1 - пауза перед хвилею, 2 - хвиля, 3 - тигр. */
  ph: 0 | 1 | 2 | 3;
  /** Номер хвилі (для паузи - наступної); у фазі тигра - номер останньої хвилі. */
  w: number;
  /** Живих вовків / усього в хвилі. */
  n: number;
  t: number;
  /** До початку хвилі (мс) у паузі. */
  next?: number;
  /** Тигр: маса й максимум. */
  tg?: { m: number; M: number };
  /** Наступною буде хвиля тигра. */
  tgNext?: boolean;
}

/**
 * Безперервний цикл хвиль карти «Арена»: пауза -> хвилі 1..N -> тигр -> знову з хвилі 1. Нікого нема - цикл стоїть.
 * Лише керує світом (додає вовків і тигра, прибирає загиблих); нагороди й повідомлення - справа менеджера.
 */
export class ColiseumDirector {
  phase: 0 | 1 | 2 | 3 = 0;
  wave = 1;
  private pauseUntil = 0;
  private frozenAt: number | null = null;
  private mobs = new Set<number>();
  private total = 0;
  private tigerPid = 0;
  private gate = 0;
  private lastShed = false;
  /** Порядковий номер тигра (для унікального ключа перемоги). */
  tigerSeq = 0;
  /** Фаза чи номер хвилі змінилися від останнього зчитування (менеджер шле HUD одразу). */
  changed = true;
  /** Короткі події для звуку й підказок: 'wave' | 'tiger' | 'tigerDown'. */
  readonly events: string[] = [];

  constructor(
    private readonly w: FlockWorld,
    private readonly rng: Rng,
  ) {}

  private setPhase(ph: 0 | 1 | 2 | 3) {
    if (this.phase !== ph) this.changed = true;
    this.phase = ph;
  }

  /** Вовки й тигр цієї арени (менеджер не вважає їх ботами за навантаженням). */
  isMob(pid: number) {
    return this.mobs.has(pid);
  }

  /** Крок директора (раз на тік; важка робота лише раз на ~0,5 с). Повертає pid тигра, якого щойно повалено (або 0), і масу вбитих для підрахунку. */
  step(humans: number, shed: boolean): { tigerDown?: { pid: number; dmg: [number, number][] } } {
    const w = this.w;
    // нікого нема: цикл стоїть (таймери зсуваємо)
    if (humans === 0) {
      this.frozenAt ??= w.now;
      this.setPhase(this.phase === 0 ? 0 : this.phase);
      return {};
    }
    if (this.frozenAt !== null) {
      this.pauseUntil += w.now - this.frozenAt;
      this.frozenAt = null;
    }
    if (this.phase === 0) {
      this.setPhase(1);
      this.pauseUntil = w.now + K.wavePauseMs;
    }
    // прибираємо загиблих вовків через пів секунди після смерті
    for (const id of [...this.mobs]) {
      const p = w.players.get(id);
      if (!p) {
        this.mobs.delete(id);
        continue;
      }
      if (!p.alive && w.now - p.diedAt > 1500 && id !== this.tigerPid) {
        w.removePlayer(id);
        this.mobs.delete(id);
      }
    }
    // регулятор навантаження: першим переходом у «високе» знімає частину вовків (не нижче minCount)
    if (shed && !this.lastShed && this.phase === 2) this.trimWolves();
    this.lastShed = shed;

    if (this.phase === 1) {
      if (w.now >= this.pauseUntil) this.startNext(humans, shed);
      return {};
    }
    if (this.phase === 2) {
      let alive = 0;
      for (const id of this.mobs) if (w.players.get(id)?.alive) alive++;
      if (alive === 0) {
        this.wave++;
        this.pauseUntil = w.now + K.wavePauseMs;
        this.setPhase(1);
      }
      return {};
    }
    if (this.phase === 3) {
      const down = w.tigerDown.shift();
      if (down) {
        w.tigerDown.length = 0;
        this.events.push('tigerDown');
        const p = w.players.get(this.tigerPid);
        if (p) w.removePlayer(this.tigerPid);
        this.mobs.delete(this.tigerPid);
        this.tigerPid = 0;
        this.wave = 1;
        this.pauseUntil = w.now + K.wavePauseMs;
        this.setPhase(1);
        return { tigerDown: down };
      }
    }
    return {};
  }

  private trimWolves() {
    const keep = Math.max(K.wolves.minCount, Math.ceil(this.mobs.size * K.shedFraction));
    const wolves = [...this.mobs]
      .map((id) => this.w.players.get(id))
      .filter((p): p is Player => !!p && p.alive && p.wolf)
      .sort((a, b) => a.total - b.total);
    let over = wolves.length - keep;
    for (const p of wolves) {
      if (over-- <= 0) break;
      this.w.removePlayer(p.id);
      this.mobs.delete(p.id);
    }
  }

  private spawn(opts: { wolf?: boolean; tiger?: boolean; mass: number }) {
    const at = this.w.gatePoint(this.gate++);
    const jitter = () => (this.rng() - 0.5) * 120;
    const skin = K.wolfSkins[Math.floor(this.rng() * K.wolfSkins.length)];
    const p = this.w.addPlayer({
      name: opts.tiger ? 'Тигр' : 'Вовк',
      skin,
      bot: true,
      wolf: opts.wolf,
      tiger: opts.tiger,
      mass: opts.mass,
      at: { x: at.x + jitter(), y: at.y + jitter() },
    });
    this.mobs.add(p.id);
    return p;
  }

  private startNext(humans: number, shed: boolean) {
    if (this.wave > K.wavesBeforeTiger) {
      this.tigerSeq++;
      const t = this.spawn({ tiger: true, mass: tigerMass(humans) });
      this.tigerPid = t.id;
      this.total = 1;
      this.setPhase(3);
      this.events.push('tiger');
      return;
    }
    const spec = waveSpec(this.wave, humans, shed);
    for (let i = 0; i < spec.count; i++) this.spawn({ wolf: true, mass: spec.mass * (0.85 + this.rng() * 0.3) });
    this.total = spec.count;
    this.setPhase(2);
    this.events.push('wave');
  }

  /** Знімок для HUD (шле менеджер раз на секунду й при змінах). */
  hud(): ColiseumHud {
    const w = this.w;
    let n = 0;
    for (const id of this.mobs) {
      const p = w.players.get(id);
      if (p?.alive && p.wolf) n++;
    }
    const h: ColiseumHud = { ph: this.phase, w: Math.min(this.wave, K.wavesBeforeTiger), n, t: this.total };
    if (this.phase === 1) {
      h.next = Math.max(0, Math.round(this.pauseUntil - (this.frozenAt ?? w.now)));
      h.tgNext = this.wave > K.wavesBeforeTiger;
    }
    if (this.phase === 3) {
      const t = w.players.get(this.tigerPid);
      if (t?.maxHp) h.tg = { m: Math.max(0, Math.round(t.total)), M: Math.round(t.maxHp) };
    }
    return h;
  }

  /** Живі мобы (для навігації й розсилки в менеджері). */
  mobIds(): Iterable<number> {
    return this.mobs;
  }
}
