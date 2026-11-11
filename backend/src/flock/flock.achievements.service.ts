import { BadRequestException, ConflictException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EmeraldReason, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { FLOCK_CONFIG } from './flock.config';
import { ownSpecialsBought, streakCountDay, streakShown } from './flock.achievements.logic';
import { FlockRubiesService } from './flock.rubies.service';
import { dayKeyInZone } from './flock.time';
import type { QuestEvent } from './flock.quests.service';

const A = FLOCK_CONFIG.achievements;
const TZ = FLOCK_CONFIG.rubies.dailyTimeZone;
type Tx = Prisma.TransactionClient;

export type AchievementKey = 'streak' | 'mass' | 'specials';
const KEYS: readonly AchievementKey[] = ['streak', 'mass', 'specials'];

export interface AchievementView {
  key: AchievementKey;
  progress: number;
  target: number;
  done: boolean;
  claimed: boolean;
  reward: { type: 'emeralds'; amount: number };
  /** Серія: секунди гри за сьогодні (для «Сьогодні: M з 10 хв»). */
  todaySec?: number;
  needSec?: number;
}

interface Pending {
  /** Секунди живої гри по добах (Київ). */
  days: Map<string, number>;
  /** Найбільша маса за життя, помічена з останнього запису. */
  mass: number;
}

const fail = (Ex: typeof BadRequestException, code: string, extra = {}) => new Ex({ code, ...extra });

/**
 * «Складні досягнення» (єдине джерело смарагдів): серія днів гри, маса за одне життя, збір особливих скінів.
 * Прогрес (секунди гри, маса) накопичується в пам'яті з подій арени (раз на секунду на гравця, без БД на тіках) і пишеться пакетно:
 * раз на flushMs, при смерті, виході, перегляді й «Забрати». Видача - у транзакції під блокуванням рядка стану; ключ нагороди унікальний.
 */
@Injectable()
export class FlockAchievementsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(FlockAchievementsService.name);
  private readonly pending = new Map<string, Pending>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rubies: FlockRubiesService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.flushAll(), FLOCK_CONFIG.quests.flushMs);
    this.timer.unref?.();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flushAll();
  }

  /** Події арени (лише пам'ять): 'play' - секунди живої гри (рухається, не пауза), 'mass' - найбільша маса життя. */
  credit(userId: string, events: QuestEvent[], now = new Date()) {
    if (!A.enabled) return;
    for (const ev of events) {
      if (ev.kind !== 'play' && ev.kind !== 'mass') continue;
      let p = this.pending.get(userId);
      if (!p) this.pending.set(userId, (p = { days: new Map(), mass: 0 }));
      if (ev.kind === 'play' && A.streak.enabled) {
        const n = Math.max(0, Math.floor(ev.n));
        if (n > 0) {
          const day = dayKeyInZone(now, TZ);
          p.days.set(day, (p.days.get(day) ?? 0) + n);
        }
      } else if (ev.kind === 'mass' && A.mass.enabled) {
        p.mass = Math.max(p.mass, Math.floor(ev.n));
      }
    }
  }

  /** Блокує (і створює) рядок стану гравця до кінця транзакції. */
  private async lockState(tx: Tx, userId: string) {
    await tx.$executeRaw`INSERT INTO "FlockAchievementState" ("userId","updatedAt") VALUES (${userId}, NOW()) ON CONFLICT ("userId") DO NOTHING`;
    await tx.$queryRaw`SELECT "userId" FROM "FlockAchievementState" WHERE "userId" = ${userId} FOR UPDATE`;
    return tx.flockAchievementState.findUniqueOrThrow({ where: { userId } });
  }

  /** Записати накопичене з пам'яті (одна коротка транзакція на гравця). */
  async flushUser(userId: string) {
    const p = this.pending.get(userId);
    if (!p) return;
    this.pending.delete(userId);
    try {
      await this.prisma.$transaction((tx) => this.applyPending(tx, userId, p));
    } catch (e) {
      // не втрачаємо накопичене: повертаємо в пам'ять
      const cur = this.pending.get(userId);
      if (cur) {
        for (const [d, s] of p.days) cur.days.set(d, (cur.days.get(d) ?? 0) + s);
        cur.mass = Math.max(cur.mass, p.mass);
      } else this.pending.set(userId, p);
      this.log.error(`achievements flush: ${String(e)}`);
    }
  }

  async flushAll() {
    for (const userId of [...this.pending.keys()]) await this.flushUser(userId);
  }

  private async applyPending(tx: Tx, userId: string, p: Pending) {
    let st = await this.lockState(tx, userId);
    let playDay = st.playDay;
    let playSeconds = st.playSeconds;
    let streak = { streakCount: st.streakCount, streakLastDay: st.streakLastDay };
    for (const day of [...p.days.keys()].sort()) {
      if (playDay !== day) {
        playDay = day;
        playSeconds = 0;
      }
      playSeconds += p.days.get(day) ?? 0;
      if (playSeconds >= A.streak.minMinutes * 60) streak = streakCountDay(streak, day);
    }
    st = await tx.flockAchievementState.update({
      where: { userId },
      data: { playDay, playSeconds, ...streak, maxMass: Math.max(st.maxMass, p.mass) },
    });
    return st;
  }

  /** Стан для вікна «Завдання»: три досягнення. */
  async list(userId: string, now = new Date()) {
    await this.flushUser(userId);
    const today = dayKeyInZone(now, TZ);
    const { st, claims, specials } = await this.read(userId);
    const claimed = new Set(claims.map((c) => c.key));
    const items = this.view(st, claimed, specials, today);
    return { items, claimable: items.filter((i) => i.done && !i.claimed).length, emeraldDailyCap: FLOCK_CONFIG.emeralds.emeraldDailyCap };
  }

  async claimable(userId: string, now = new Date()): Promise<number> {
    if (!A.enabled) return 0;
    return (await this.list(userId, now)).claimable;
  }

  private async read(userId: string) {
    const [st0, claims, specials] = await Promise.all([
      this.prisma.flockAchievementState.findUnique({ where: { userId } }),
      this.prisma.flockAchievementClaim.findMany({ where: { userId } }),
      ownSpecialsBought(this.prisma, userId),
    ]);
    let st = st0 ?? { userId, streakCount: 0, streakCycle: 0, streakLastDay: null, playDay: null, playSeconds: 0, maxMass: 0, specialsDone: false, updatedAt: new Date() };
    // усі особливі вже куплені (до виходу оновлення або покупкою до фіксації): фіксуємо
    if (!st.specialsDone && specials.total > 0 && specials.have >= specials.total && A.specials.enabled) {
      st = await this.prisma.flockAchievementState.upsert({ where: { userId }, create: { userId, specialsDone: true }, update: { specialsDone: true } });
    }
    return { st, claims, specials };
  }

  private view(
    st: { streakCount: number; streakCycle: number; streakLastDay: string | null; playDay: string | null; playSeconds: number; maxMass: number; specialsDone: boolean },
    claimed: Set<string>,
    specials: { have: number; total: number },
    today: string,
  ): AchievementView[] {
    const out: AchievementView[] = [];
    if (A.streak.enabled) {
      const shown = streakShown(st, today, A.streak.days);
      out.push({
        key: 'streak',
        progress: shown,
        target: A.streak.days,
        done: shown >= A.streak.days,
        claimed: false,
        reward: { type: 'emeralds', amount: A.streak.emeralds },
        todaySec: st.playDay === today ? st.playSeconds : 0,
        needSec: A.streak.minMinutes * 60,
      });
    }
    if (A.mass.enabled) {
      out.push({
        key: 'mass',
        progress: Math.min(st.maxMass, A.mass.target),
        target: A.mass.target,
        done: st.maxMass >= A.mass.target || claimed.has('mass'),
        claimed: claimed.has('mass'),
        reward: { type: 'emeralds', amount: A.mass.emeralds },
      });
    }
    if (A.specials.enabled) {
      const done = st.specialsDone || claimed.has('specials');
      out.push({
        key: 'specials',
        progress: done ? Math.max(specials.have, specials.total) : specials.have,
        target: Math.max(1, specials.total),
        done,
        claimed: claimed.has('specials'),
        reward: { type: 'emeralds', amount: A.specials.emeralds },
      });
    }
    return out;
  }

  /**
   * «Забрати»: у транзакції під блокуванням стану - перевірка виконання, унікальний рядок нагороди (повтор - 409), нарахування.
   * Серія: нагорода раз за коло (ключ `streak:<коло>`), далі коло +1 і серія з нуля. Добовий потолок смарагдів діє лише для серії;
   * якщо видати нічого (потолок/стеля), нагорода не списується й лишається доступною.
   */
  async claim(userId: string, key: string, now = new Date()) {
    if (!A.enabled || !KEYS.includes(key as AchievementKey)) throw fail(BadRequestException, 'invalid_achievement');
    const k = key as AchievementKey;
    const cfg = k === 'streak' ? A.streak : k === 'mass' ? A.mass : A.specials;
    if (!cfg.enabled) throw fail(BadRequestException, 'invalid_achievement');
    await this.flushUser(userId);
    const today = dayKeyInZone(now, TZ);
    const result = await this.prisma.$transaction(async (tx) => {
      // порядок блокувань той самий, що в покупці скіна: профіль, потім стан досягнень
      await this.rubies.lockProfileInTx(tx, userId);
      let st = await this.lockState(tx, userId);
      let claimKey: string;
      if (k === 'streak') {
        if (streakShown(st, today, A.streak.days) < A.streak.days) throw fail(BadRequestException, 'achievement_not_done');
        claimKey = `streak:${st.streakCycle}`;
      } else if (k === 'mass') {
        if (st.maxMass < A.mass.target) throw fail(BadRequestException, 'achievement_not_done');
        claimKey = 'mass';
      } else {
        if (!st.specialsDone) {
          const sp = await ownSpecialsBought(tx, userId);
          if (sp.total === 0 || sp.have < sp.total) throw fail(BadRequestException, 'achievement_not_done');
          st = await tx.flockAchievementState.update({ where: { userId }, data: { specialsDone: true } });
        }
        claimKey = 'specials';
      }
      if (await tx.flockAchievementClaim.findUnique({ where: { userId_key: { userId, key: claimKey } } })) throw fail(ConflictException, 'achievement_claimed');
      const reason = k === 'streak' ? EmeraldReason.ACHIEVEMENT_STREAK_EMERALD : EmeraldReason.ACHIEVEMENT_EMERALD;
      const r = await this.rubies.grantEmeraldsInTx(tx, userId, cfg.emeralds, reason, claimKey, now);
      if (r.amount <= 0) throw fail(BadRequestException, r.limited === 'daily' ? 'emerald_daily_cap' : 'emerald_cap');
      await tx.flockAchievementClaim.create({ data: { userId, key: claimKey, amount: r.amount } });
      if (k === 'streak') await tx.flockAchievementState.update({ where: { userId }, data: { streakCount: 0, streakCycle: st.streakCycle + 1 } });
      return { amount: r.amount, balance: r.balance };
    });
    return { type: 'emeralds' as const, ...result, ...(await this.list(userId, now)) };
  }
}
