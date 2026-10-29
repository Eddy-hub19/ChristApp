import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { FLOCK_CONFIG } from './flock.config';
import { FlockRubiesService } from './flock.rubies.service';
import { dayKeyInZone, nextDayStartInZone, shiftDayKey } from './flock.time';

const R = FLOCK_CONFIG.rubies;
const D = FLOCK_CONFIG.dailyRecords;
const TZ = R.dailyTimeZone;
/** Довжина циклу нагород серії (днів до скидання). */
const CYCLE = D.streakRewards.length;
const SWEEP_MS = 60_000;
/** Скільки пропущених діб максимум наздоганяємо за один прохід. */
const MAX_CATCH_UP = 40;

interface TopRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  mass: number;
}

/** «Рекорди дня» і нагорода за серію днів на 1-му місці. У БД пишуть тільки люди (боти й Вожак сюди не доходять). */
@Injectable()
export class FlockDailyService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(FlockDailyService.name);
  private timer: NodeJS.Timeout | null = null;
  private closing = false;
  /** Що вже записано в БД цього дня: щоб не писати той самий або менший результат. */
  private written = new Map<string, { day: string; mass: number }>();
  private topCache: { at: number; day: string; rows: TopRow[] } | null = null;
  /** Хто тримає серію днів на 1-му місці (FlockStreak.days > 0); оновлюється при старті й після закриття доби. */
  streakHolder: { userId: string; days: number } | null = null;
  private streakListeners: (() => void)[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly rubies: FlockRubiesService,
  ) {}

  /** Підписка на зміну держателя серії (арена розсилає її гравцям). */
  onStreakChange(fn: () => void) {
    this.streakListeners.push(fn);
  }

  /** Перечитує держателя серії з БД; слухачів кличе лише при зміні. */
  async refreshStreak() {
    try {
      const row = await this.prisma.flockStreak.findFirst({
        where: { days: { gt: 0 } },
        orderBy: { days: 'desc' },
        select: { userId: true, days: true },
      });
      const prev = this.streakHolder;
      if (prev?.userId === row?.userId && prev?.days === row?.days) return;
      this.streakHolder = row ? { userId: row.userId, days: row.days } : null;
      for (const fn of this.streakListeners) fn();
    } catch (e) {
      this.log.error(`refreshStreak: ${String(e)}`);
    }
  }

  onModuleInit() {
    void this.refreshStreak();
    void this.closePendingDays();
    this.timer = setInterval(() => void this.closePendingDays(), SWEEP_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Записує дневний рекорд, лише якщо він вищий за вже записаний. */
  async recordMass(userId: string, rawMass: number, now = new Date()) {
    const mass = Math.round(rawMass);
    if (!(mass > 0)) return;
    const day = dayKeyInZone(now, TZ);
    const seen = this.written.get(userId);
    if (seen && seen.day === day && seen.mass >= mass) return;
    this.written.set(userId, { day, mass });
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "FlockDailyRecord" ("day", "userId", "maxMass", "updatedAt")
        VALUES (${day}, ${userId}, ${mass}, NOW())
        ON CONFLICT ("day", "userId") DO UPDATE SET
          "maxMass" = EXCLUDED."maxMass", "updatedAt" = NOW()
        WHERE "FlockDailyRecord"."maxMass" < EXCLUDED."maxMass"`;
    } catch (e) {
      this.written.delete(userId);
      this.log.error(`recordMass: ${String(e)}`);
    }
  }

  private async topToday(now: Date): Promise<TopRow[]> {
    const day = dayKeyInZone(now, TZ);
    const c = this.topCache;
    if (c && c.day === day && now.getTime() - c.at < D.cacheMs) return c.rows;
    const rows = await this.prisma.flockDailyRecord.findMany({
      where: { day },
      orderBy: [{ maxMass: 'desc' }, { updatedAt: 'asc' }],
      take: D.topSize,
      include: {
        user: { select: { nickname: true, username: true, avatarUrl: true } },
      },
    });
    const top = rows.map((r) => ({
      userId: r.userId,
      name: r.user.nickname || r.user.username,
      avatarUrl: r.user.avatarUrl,
      mass: r.maxMass,
    }));
    this.topCache = { at: now.getTime(), day, rows: top };
    return top;
  }

  /** Таблиця для лобі: топ дня (кеш), рядок гравця поза трійкою, час до скидання, прогрес серії лідера. */
  async getBoard(userId: string, now = new Date()) {
    const day = dayKeyInZone(now, TZ);
    const top = await this.topToday(now);
    let me: { rank: number; mass: number } | null = null;
    const inTop = top.findIndex((r) => r.userId === userId);
    if (inTop >= 0) me = { rank: inTop + 1, mass: top[inTop].mass };
    else {
      const rec = await this.prisma.flockDailyRecord.findUnique({
        where: { day_userId: { day, userId } },
        select: { maxMass: true },
      });
      if (rec) {
        const above = await this.prisma.flockDailyRecord.count({
          where: { day, maxMass: { gt: rec.maxMass } },
        });
        me = { rank: above + 1, mass: rec.maxMass };
      }
    }
    let streak: { days: number; reward: number } | null = null;
    if (inTop === 0 && top[0].mass >= D.minMass) {
      const s = await this.prisma.flockStreak.findUnique({ where: { userId } });
      const prev = s && s.lastDay === shiftDayKey(day, -1) ? s.days : 0;
      const days = (prev % CYCLE) + 1;
      streak = { days, reward: D.streakRewards[days - 1] };
    }
    return {
      top: top.map((r, i) => ({
        rank: i + 1,
        name: r.name,
        avatarUrl: r.avatarUrl,
        mass: r.mass,
        me: r.userId === userId,
        // дні серії - лише в №1, якщо він і є держатель серії (завершені доби, FlockStreak.days)
        streakDays:
          i === 0 && this.streakHolder?.userId === r.userId
            ? this.streakHolder.days
            : 0,
      })),
      me,
      streak,
      resetsInMs: Math.max(
        0,
        nextDayStartInZone(now, TZ).getTime() - now.getTime(),
      ),
      config: {
        streakRewards: [...D.streakRewards],
        streakDays: CYCLE,
        minMass: D.minMass,
      },
    };
  }

  /** Видана за серію нагорода, яку гравець ще не бачив (повертає суму один раз). */
  async claimStreakAward(userId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ pendingAward: number }[]>`
      UPDATE "FlockStreak" s SET "pendingAward" = 0
      FROM (SELECT "userId", "pendingAward" FROM "FlockStreak"
            WHERE "userId" = ${userId} FOR UPDATE) o
      WHERE s."userId" = o."userId"
      RETURNING o."pendingAward"`;
    const amount = rows[0]?.pendingAward ?? 0;
    if (amount > 0) {
      await this.prisma.flockStreak.deleteMany({
        where: { userId, days: 0, pendingAward: 0 },
      });
    }
    return amount;
  }

  /** Який день серії дав таку суму (1..CYCLE) або 0, якщо суму склали кілька непоказаних нагород. */
  streakAwardDay(amount: number): number {
    return D.streakRewards.indexOf(amount) + 1;
  }

  /** Закриває всі незакриті доби до вчорашньої включно, по порядку. Безпечно викликати повторно й паралельно. */
  async closePendingDays(now = new Date()) {
    if (this.closing) return;
    this.closing = true;
    try {
      const yesterday = shiftDayKey(dayKeyInZone(now, TZ), -1);
      const last = await this.prisma.flockDayWinner.findFirst({
        orderBy: { day: 'desc' },
        select: { day: true },
      });
      let day = last ? shiftDayKey(last.day, 1) : yesterday;
      let closed = 0;
      for (let i = 0; day <= yesterday && i < MAX_CATCH_UP; i++) {
        await this.closeDay(day);
        day = shiftDayKey(day, 1);
        closed++;
      }
      await this.prisma.flockDailyRecord.deleteMany({
        where: { day: { lt: shiftDayKey(dayKeyInZone(now, TZ), -D.keepDays) } },
      });
      if (closed > 0) await this.refreshStreak();
    } catch (e) {
      this.log.error(`closePendingDays: ${String(e)}`);
    } finally {
      this.closing = false;
    }
  }

  /** Підсумок доби: переможець, серія, нагорода. Повторний виклик для тієї ж доби нічого не робить. */
  async closeDay(day: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('flock-close-day'))`;
      if (await tx.flockDayWinner.findUnique({ where: { day } })) return;
      const top = await tx.flockDailyRecord.findFirst({
        where: { day, maxMass: { gte: D.minMass } },
        orderBy: [{ maxMass: 'desc' }, { updatedAt: 'asc' }],
      });
      await tx.flockDayWinner.create({
        data: { day, userId: top?.userId ?? null, maxMass: top?.maxMass ?? 0 },
      });
      // серія всіх інших (а без переможця - усіх) обривається; рядки з видачею, яку ще не показали, лишаються
      await tx.flockStreak.updateMany({
        where: top ? { userId: { not: top.userId } } : {},
        data: { days: 0 },
      });
      if (top) {
        const prev = await tx.flockStreak.findUnique({
          where: { userId: top.userId },
        });
        const continues = !!prev && prev.lastDay === shiftDayKey(day, -1);
        // день серії: 1..CYCLE; кожна закрита доба №1 платить streakRewards[день-1], після останньої серія з нуля
        let days = ((continues ? prev.days : 0) % CYCLE) + 1;
        const award = D.streakRewards[days - 1];
        if (award > 0) {
          await this.rubies.grantStreakInTx(
            tx,
            top.userId,
            award,
            `streak day ${days}/${CYCLE}, ${day}`,
          );
        }
        if (days >= CYCLE) days = 0;
        await tx.flockStreak.upsert({
          where: { userId: top.userId },
          create: { userId: top.userId, days, lastDay: day, pendingAward: award },
          update: { days, lastDay: day, pendingAward: { increment: award } },
        });
      }
      await tx.flockStreak.deleteMany({ where: { days: 0, pendingAward: 0 } });
    });
  }
}
