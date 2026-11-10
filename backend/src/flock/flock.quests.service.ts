import { BadRequestException, ConflictException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EmeraldReason } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { FLOCK_CONFIG, type QuestDef } from './flock.config';
import { FlockRubiesService } from './flock.rubies.service';
import { dayKeyInZone, nextDayStartInZone, shiftDayKey } from './flock.time';

const Q = FLOCK_CONFIG.quests;
const TZ = FLOCK_CONFIG.rubies.dailyTimeZone;

/** Слоти доби: 0 - просте, 1 - середнє (обидва за рубіни), 2 - складне (за смарагди). */
export const QUEST_TIERS = ['simple', 'medium', 'hard'] as const;

/** Подія для прогресу: add - додати n, max - прогрес = max(прогрес, n) (маса, тривалість життя). */
export interface QuestEvent {
  kind: QuestDef['kind'];
  n: number;
  mode: 'add' | 'max';
  /** Для survive_map: на якій карті арени. */
  map?: number;
}

interface QRow {
  slot: number;
  questId: string;
  progress: number;
  claimed: boolean;
  /** Прогрес змінено в пам'яті й ще не записано в БД. */
  dirty: boolean;
}

interface UserQuests {
  day: string;
  rows: QRow[];
}

export interface QuestView {
  slot: number;
  id: string;
  kind: QuestDef['kind'];
  target: number;
  progress: number;
  claimed: boolean;
  done: boolean;
  reward: { type: 'rubies' | 'emeralds'; amount: number };
}

const defOf = (id: string): QuestDef | undefined => Q.pool.find((d) => d.id === id);

const fail = (Ex: typeof BadRequestException, code: string, extra = {}) => new Ex({ code, ...extra });

/**
 * Щоденні завдання. Прогрес рахується в пам'яті (події арени), у БД пишеться пакетно: при смерті, виході й не рідше за flushMs.
 * На тіках звернень до БД немає. «Забрати» перевіряє БД (після скидання прогресу гравця), повторно не нараховує.
 */
@Injectable()
export class FlockQuestsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(FlockQuestsService.name);
  private readonly cache = new Map<string, Promise<UserQuests>>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rubies: FlockRubiesService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.flushAll(), Q.flushMs);
    this.timer.unref?.();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flushAll();
  }

  /** Вибір завдання слота: випадкове з пулу за складністю, без учорашнього (якщо є з чого обрати). */
  private pick(slot: number, exclude: string | undefined): QuestDef | null {
    const tier = QUEST_TIERS[slot];
    const all = Q.pool.filter((d) => d.enabled !== false && d.tier === tier);
    const fresh = all.filter((d) => d.id !== exclude);
    const from = fresh.length ? fresh : all;
    return from.length ? from[Math.floor(Math.random() * from.length)] : null;
  }

  /** Завдання доби гравця: читає з БД або створює (унікальність userId+day+slot захищає від гонки). */
  private async loadFromDb(userId: string, day: string): Promise<UserQuests> {
    let rows = await this.prisma.flockDailyQuest.findMany({ where: { userId, day }, orderBy: { slot: 'asc' } });
    if (rows.length < QUEST_TIERS.length) {
      const yesterday = await this.prisma.flockDailyQuest.findMany({ where: { userId, day: shiftDayKey(day, -1) } });
      const have = new Set(rows.map((r) => r.slot));
      const data: { userId: string; day: string; slot: number; questId: string }[] = [];
      for (let slot = 0; slot < QUEST_TIERS.length; slot++) {
        if (have.has(slot)) continue;
        const def = this.pick(slot, yesterday.find((y) => y.slot === slot)?.questId);
        if (def) data.push({ userId, day, slot, questId: def.id });
      }
      if (data.length) await this.prisma.flockDailyQuest.createMany({ data, skipDuplicates: true });
      rows = await this.prisma.flockDailyQuest.findMany({ where: { userId, day }, orderBy: { slot: 'asc' } });
    }
    return {
      day,
      rows: rows.map((r) => ({ slot: r.slot, questId: r.questId, progress: r.progress, claimed: !!r.claimedAt, dirty: false })),
    };
  }

  private load(userId: string, now = new Date()): Promise<UserQuests> {
    const day = dayKeyInZone(now, TZ);
    const hit = this.cache.get(userId);
    if (hit) {
      const p = hit.then((u) => (u.day === day ? u : null));
      return p.then((u) => u ?? this.reload(userId, day, hit));
    }
    return this.reload(userId, day, null);
  }

  private reload(userId: string, day: string, prev: Promise<UserQuests> | null): Promise<UserQuests> {
    // доба змінилась: недописаний прогрес минулої доби записуємо, потім читаємо нову
    const p = (async () => {
      if (prev) await prev.then((u) => this.flushRows(userId, u)).catch(() => undefined);
      return this.loadFromDb(userId, day);
    })();
    this.cache.set(userId, p);
    p.catch(() => this.cache.delete(userId));
    return p;
  }

  /**
   * Подія арени для гравця. Повертає слоти, що щойно виконані (для плашки в грі). Нічого не пише в БД.
   * Завдання з вимкненим прапором або поза пулом ніколи не прогресують.
   */
  async credit(userId: string, events: QuestEvent[], now = new Date()): Promise<number[]> {
    if (!Q.enabled || events.length === 0) return [];
    let u: UserQuests;
    try {
      u = await this.load(userId, now);
    } catch (e) {
      this.log.error(`quests load: ${String(e)}`);
      return [];
    }
    const done: number[] = [];
    for (const row of u.rows) {
      if (row.claimed) continue;
      const def = defOf(row.questId);
      if (!def || def.enabled === false) continue;
      const before = row.progress;
      for (const ev of events) {
        if (ev.kind !== def.kind) continue;
        if (def.maps && (ev.map === undefined || !def.maps.includes(ev.map))) continue;
        const n = Math.max(0, Math.floor(ev.n));
        if (n <= 0) continue;
        row.progress = Math.min(def.target, ev.mode === 'add' ? row.progress + n : Math.max(row.progress, n));
      }
      if (row.progress !== before) {
        row.dirty = true;
        if (before < def.target && row.progress >= def.target) done.push(row.slot);
      }
    }
    return done;
  }

  private async flushRows(userId: string, u: UserQuests) {
    for (const row of u.rows) {
      if (!row.dirty) continue;
      row.dirty = false;
      try {
        // прогрес лише зростає
        await this.prisma.flockDailyQuest.updateMany({
          where: { userId, day: u.day, slot: row.slot, claimedAt: null, progress: { lt: row.progress } },
          data: { progress: row.progress },
        });
      } catch (e) {
        row.dirty = true;
        this.log.error(`quests flush: ${String(e)}`);
      }
    }
  }

  /** Записати прогрес гравця (смерть, вихід, «Забрати», перегляд). */
  async flushUser(userId: string) {
    const hit = this.cache.get(userId);
    if (!hit) return;
    try {
      await this.flushRows(userId, await hit);
    } catch {
      /* кеш не завантажився: нічого писати */
    }
  }

  /** Записати все, що змінилось (раз на flushMs), і прибрати з кешу тих, хто вже не змінюється. */
  async flushAll() {
    for (const [userId, hit] of [...this.cache]) {
      try {
        const u = await hit;
        await this.flushRows(userId, u);
        // старі доби з кешу прибираємо, щоб не росла пам'ять
        if (u.day !== dayKeyInZone(new Date(), TZ)) this.cache.delete(userId);
      } catch {
        this.cache.delete(userId);
      }
    }
  }

  private view(u: UserQuests): QuestView[] {
    const out: QuestView[] = [];
    for (const row of u.rows) {
      const def = defOf(row.questId);
      if (!def) continue;
      out.push({
        slot: row.slot,
        id: def.id,
        kind: def.kind,
        target: def.target,
        progress: Math.min(def.target, row.progress),
        claimed: row.claimed,
        done: row.progress >= def.target,
        reward: { ...Q.rewards[def.tier] },
      });
    }
    return out;
  }

  /** Для вікна «Завдання»: три завдання сьогодні, час до скидання (за Києвом), чи є невзята нагорода. */
  async list(userId: string, now = new Date()) {
    const u = await this.load(userId, now);
    await this.flushRows(userId, u);
    const quests = this.view(u);
    return {
      day: u.day,
      resetInMs: Math.max(0, nextDayStartInZone(now, TZ).getTime() - now.getTime()),
      quests,
      claimable: quests.filter((q) => q.done && !q.claimed).length,
    };
  }

  /** Скільки виконаних, але не взятих завдань (крапка на кнопці). */
  async claimable(userId: string, now = new Date()): Promise<number> {
    if (!Q.enabled) return 0;
    const u = await this.load(userId, now);
    return this.view(u).filter((q) => q.done && !q.claimed).length;
  }

  /**
   * «Забрати»: у транзакції - прапор взято (updateMany лише для claimedAt IS NULL), потім нарахування.
   * Повторний або паралельний запит нічого не нараховує. Якщо нагорода не може бути видана (стеля смарагдів), позначка
   * знімається разом з відкатом транзакції й завдання лишається доступним.
   */
  async claim(userId: string, slot: number, now = new Date()) {
    if (!Q.enabled || !Number.isInteger(slot) || slot < 0 || slot >= QUEST_TIERS.length) throw fail(BadRequestException, 'invalid_quest');
    const u = await this.load(userId, now);
    await this.flushRows(userId, u);
    const row = u.rows.find((r) => r.slot === slot);
    const def = row ? defOf(row.questId) : undefined;
    if (!row || !def) throw fail(BadRequestException, 'invalid_quest');
    const result = await this.prisma.$transaction(async (tx) => {
      // прогрес і взято - з БД, не з пам'яті
      const db = await tx.flockDailyQuest.findUnique({ where: { userId_day_slot: { userId, day: u.day, slot } } });
      if (!db) throw fail(BadRequestException, 'invalid_quest');
      if (db.claimedAt) throw fail(ConflictException, 'quest_claimed');
      if (db.progress < def.target) throw fail(BadRequestException, 'quest_not_done');
      const marked = await tx.flockDailyQuest.updateMany({ where: { userId, day: u.day, slot, claimedAt: null }, data: { claimedAt: new Date() } });
      if (marked.count !== 1) throw fail(ConflictException, 'quest_claimed');
      const reward = Q.rewards[def.tier];
      if (reward.type === 'emeralds') {
        const r = await this.rubies.grantEmeraldsInTx(tx, userId, reward.amount, EmeraldReason.DAILY_QUEST_EMERALD, `${u.day}:${def.id}`);
        if (r.amount <= 0) throw fail(BadRequestException, 'emerald_cap');
        return { type: 'emeralds' as const, amount: r.amount, balance: r.balance };
      }
      const r = await this.rubies.grantQuestRubiesInTx(tx, userId, reward.amount, `${u.day}:${def.id}`);
      return { type: 'rubies' as const, amount: r.amount, balance: r.balance };
    });
    row.claimed = true;
    return { ...result, ...(await this.list(userId, now)) };
  }
}
