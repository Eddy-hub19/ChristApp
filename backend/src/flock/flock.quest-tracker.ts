import type { FlockWorld, Player } from './flock.engine';
import { FLOCK_CONFIG } from './flock.config';
import type { QuestEvent } from './flock.quests.service';

const Q = FLOCK_CONFIG.quests;

/** Куди йдуть події: userId, connKey, події, flush (записати в БД: смерть, вихід). */
export type QuestEmit = (userId: string, connKey: string | null, events: QuestEvent[], flush: boolean) => void;

interface St {
  x: number;
  y: number;
  hasPos: boolean;
  activeUntil: number;
  life: number;
  lastAt: number;
  aliveMs: number;
  sprintAcc: number;
  playAcc: number;
  deadSent: boolean;
}

/**
 * Лічильник прогресу щоденних завдань на боці арени: раз на sampleMs читає лічильники гравців (їжа, бонуси, жертви, рушення) і шле події.
 * Нічого не пише в БД і не працює на кожному тіку. Прогрес лише в живого (або щойно загиблого), не на паузі й лише якщо гравець рухався
 * за останні activeWindowMs (захист від AFK). 
 */
export class QuestTracker {
  private readonly st = new Map<string, St>();
  private nextAt = 0;

  constructor(
    private readonly emit: QuestEmit,
    private readonly mapId: number,
  ) {}

  /** Викликається з тіка арени; сама відсікає частоту. */
  step(w: FlockWorld, sessions: Iterable<{ userId: string; pid: number; connKey: string | null }>) {
    if (w.now < this.nextAt) return;
    this.nextAt = w.now + Q.sampleMs;
    for (const s of sessions) {
      const p = w.players.get(s.pid);
      if (p) this.sample(w, s.userId, s.connKey, p, false);
    }
  }

  /** Гравець іде з арени: останнє зчитування й запис у БД. */
  leave(w: FlockWorld, s: { userId: string; pid: number; connKey: string | null }) {
    const p = w.players.get(s.pid);
    if (p) this.sample(w, s.userId, s.connKey, p, true);
    this.st.delete(s.userId);
  }

  private sample(w: FlockWorld, userId: string, connKey: string | null, p: Player, leaving: boolean) {
    let st = this.st.get(userId);
    if (!st) {
      st = { x: 0, y: 0, hasPos: false, activeUntil: 0, life: p.spawnedAt, lastAt: w.now, aliveMs: 0, sprintAcc: 0, playAcc: 0, deadSent: false };
      this.st.set(userId, st);
    }
    const dt = Math.max(0, Math.min(w.now - st.lastAt, 5_000));
    st.lastAt = w.now;
    if (p.paused) {
      st.hasPos = false;
      return;
    }
    if (st.life !== p.spawnedAt) {
      st.life = p.spawnedAt;
      st.aliveMs = 0;
      st.sprintAcc = 0;
      st.deadSent = false;
    }
    if (p.alive && p.cells.length) {
      const cc = w.centroid(p);
      if (st.hasPos && Math.hypot(cc.x - st.x, cc.y - st.y) >= Q.minMove) st.activeUntil = w.now + Q.activeWindowMs;
      else if (!st.hasPos) st.activeUntil = Math.max(st.activeUntil, w.now);
      st.x = cc.x;
      st.y = cc.y;
      st.hasPos = true;
    }
    const active = w.now <= st.activeUntil;
    const food = p.qFood;
    const sprintMs = p.qSprintMs;
    p.qFood = 0;
    p.qSprintMs = 0;
    if (!active) {
      // не рухався: прогресу нема, але вихід і загибель усе одно записують те, що вже накопичено
      const done = leaving || (!p.alive && !st.deadSent);
      if (!p.alive) st.deadSent = true;
      if (done) this.emit(userId, connKey, [], true);
      return;
    }
    const ev: QuestEvent[] = [];
    if (food > 0) ev.push({ kind: 'food', n: food, mode: 'add' });
    st.sprintAcc += sprintMs;
    if (st.sprintAcc >= 1000) {
      const sec = Math.floor(st.sprintAcc / 1000);
      st.sprintAcc -= sec * 1000;
      ev.push({ kind: 'sprint', n: sec, mode: 'add' });
    }
    ev.push({ kind: 'mass', n: p.maxMass, mode: 'max' });
    if (p.alive) {
      // «день грав» для серії досягнення: жива гра в русі (не пауза, не AFK), цілі секунди
      st.playAcc += dt;
      if (st.playAcc >= 1000) {
        const playSec = Math.floor(st.playAcc / 1000);
        st.playAcc -= playSec * 1000;
        ev.push({ kind: 'play', n: playSec, mode: 'add' });
      }
      st.aliveMs += dt;
      const sec = Math.floor(st.aliveMs / 1000);
      ev.push({ kind: 'alive', n: sec, mode: 'max' });
      ev.push({ kind: 'survive_map', n: sec, mode: 'max', map: this.mapId });
    }
    const flush = leaving || (!p.alive && !st.deadSent);
    if (!p.alive) st.deadSent = true;
    this.emit(userId, connKey, ev, flush);
  }
}
