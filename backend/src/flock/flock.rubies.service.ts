import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RubyReason } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { FLOCK_CONFIG, FREE_SKINS, NUM_SKINS, isPaidSkin } from './flock.config';
import { dayStartInZone } from './flock.time';

const R = FLOCK_CONFIG.rubies;

export type FlockErrorCode =
  | 'invalid_skin'
  | 'skin_free'
  | 'already_owned'
  | 'not_enough'
  | 'reason_required'
  | 'invalid_amount'
  | 'insufficient_balance'
  | 'user_not_found';

const fail = (Ex: typeof BadRequestException, code: FlockErrorCode, extra = {}) =>
  new Ex({ code, ...extra });

export interface FlockStatsDto {
  bestMass: number;
  eaten: number;
  topMs: number;
  games: number;
}

export interface AwardResult {
  amount: number;
  balance: number;
}

type Tx = Prisma.TransactionClient;

/** Усі зміни рубінів: баланс + рядок журналу в одній транзакції, під блокуванням профілю. */
@Injectable()
export class FlockRubiesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Створює профіль, якщо його ще нема, і блокує рядок до кінця транзакції. */
  private async lockProfile(tx: Tx, userId: string): Promise<number> {
    await tx.$executeRaw`INSERT INTO "FlockProfile" ("userId") VALUES (${userId}) ON CONFLICT ("userId") DO NOTHING`;
    const rows = await tx.$queryRaw<{ rubies: number }[]>`
      SELECT "rubies" FROM "FlockProfile" WHERE "userId" = ${userId} FOR UPDATE`;
    return rows[0].rubies;
  }

  private async apply(
    tx: Tx,
    userId: string,
    balance: number,
    entry: {
      delta: number;
      reason: RubyReason;
      note?: string;
      skinId?: number;
      actorId?: string;
    },
  ): Promise<number> {
    const next = balance + entry.delta;
    await tx.flockProfile.update({
      where: { userId },
      data: { rubies: next },
    });
    await tx.rubyTransaction.create({
      data: { userId, balanceAfter: next, ...entry },
    });
    return next;
  }

  async ownedSkins(userId: string): Promise<number[]> {
    const rows = await this.prisma.flockSkinPurchase.findMany({
      where: { userId },
      select: { skinId: true },
    });
    return rows.map((r) => r.skinId).sort((a, b) => a - b);
  }

  /** Чи може користувач грати цим скіном (безкоштовний або куплений). */
  async canUseSkin(userId: string, skin: number): Promise<boolean> {
    if (!Number.isInteger(skin) || skin < 0 || skin >= NUM_SKINS) return false;
    if (!isPaidSkin(skin)) return true;
    const row = await this.prisma.flockSkinPurchase.findUnique({
      where: { userId_skinId: { userId, skinId: skin } },
    });
    return !!row;
  }

  async getMe(userId: string) {
    const [profile, skins] = await Promise.all([
      this.prisma.flockProfile.findUnique({ where: { userId } }),
      this.ownedSkins(userId),
    ]);
    return {
      rubies: profile?.rubies ?? 0,
      ownedSkins: skins,
      selectedSkin: profile?.selectedSkin ?? 0,
      statsImported: !!profile?.statsImportedAt,
      stats: toStats(profile),
      config: {
        skinPrice: R.skinPrice,
        freeSkins: FREE_SKINS,
        totalSkins: NUM_SKINS,
        top1Reward: R.top1Reward,
        top1MassThreshold: R.top1MassThreshold,
      },
    };
  }

  /**
   * Нагорода за 1-ше місце. Повертає null, якщо добовий ліміт вичерпано (сума обрізається до залишку).
   * Добу рахуємо за часом Києва.
   */
  async awardTop1(userId: string, now = new Date()): Promise<AwardResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const balance = await this.lockProfile(tx, userId);
      const since = dayStartInZone(now, R.dailyTimeZone);
      const agg = await tx.rubyTransaction.aggregate({
        _sum: { delta: true },
        where: {
          userId,
          reason: RubyReason.ARENA_TOP1,
          createdAt: { gte: since },
        },
      });
      const left = R.dailyLimit - (agg._sum.delta ?? 0);
      const amount = Math.min(R.top1Reward, left);
      if (amount <= 0) return null;
      const next = await this.apply(tx, userId, balance, {
        delta: amount,
        reason: RubyReason.ARENA_TOP1,
      });
      return { amount, balance: next };
    });
  }

  /** Покупка: перевірка балансу, списання, запис покупки й журналу - атомарно. */
  async buySkin(userId: string, skinId: number) {
    if (!Number.isInteger(skinId) || skinId < 0 || skinId >= NUM_SKINS)
      throw fail(BadRequestException, 'invalid_skin');
    if (!isPaidSkin(skinId)) throw fail(BadRequestException, 'skin_free');
    return this.prisma.$transaction(async (tx) => {
      const balance = await this.lockProfile(tx, userId);
      const owned = await tx.flockSkinPurchase.findUnique({
        where: { userId_skinId: { userId, skinId } },
      });
      if (owned) throw fail(ConflictException, 'already_owned');
      if (balance < R.skinPrice)
        throw fail(BadRequestException, 'not_enough', {
          missing: R.skinPrice - balance,
        });
      await tx.flockSkinPurchase.create({
        data: { userId, skinId, price: R.skinPrice },
      });
      const next = await this.apply(tx, userId, balance, {
        delta: -R.skinPrice,
        reason: RubyReason.SKIN_PURCHASE,
        skinId,
      });
      return { rubies: next, skinId };
    });
  }

  /** Адмін: нарахувати або списати (delta ≠ 0), причина обов'язкова, баланс не йде нижче нуля. */
  async adminAdjust(actorId: string, userId: string, delta: number, note: string) {
    const reason = typeof note === 'string' ? note.trim() : '';
    if (!reason) throw fail(BadRequestException, 'reason_required');
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000)
      throw fail(BadRequestException, 'invalid_amount');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw fail(NotFoundException, 'user_not_found');
    return this.prisma.$transaction(async (tx) => {
      const balance = await this.lockProfile(tx, userId);
      if (balance + delta < 0)
        throw fail(BadRequestException, 'insufficient_balance', { balance });
      const next = await this.apply(tx, userId, balance, {
        delta,
        reason: RubyReason.ADMIN_ADJUST,
        note: reason.slice(0, 300),
        actorId,
      });
      return { rubies: next };
    });
  }

  async adminOverview(userId: string) {
    const [me, transactions] = await Promise.all([
      this.getMe(userId),
      this.prisma.rubyTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return { ...me, transactions };
  }

  /** Статистика після смерті: пише сервер за власними даними арени. */
  async recordRun(
    userId: string,
    run: { maxMass: number; kills: number; topMs: number },
  ) {
    const mass = Math.max(0, Math.round(run.maxMass));
    await this.prisma.$transaction(async (tx) => {
      await this.lockProfile(tx, userId);
      const p = await tx.flockProfile.findUniqueOrThrow({ where: { userId } });
      await tx.flockProfile.update({
        where: { userId },
        data: {
          bestMass: Math.max(p.bestMass, mass),
          eaten: p.eaten + Math.max(0, run.kills),
          topMs: p.topMs + BigInt(Math.max(0, Math.round(run.topMs))),
          games: p.games + 1,
        },
      });
    });
  }

  /** Разовий перенос статистики з localStorage: повторні виклики ігноруються, значення обмежені. */
  async importStats(userId: string, input: Partial<FlockStatsDto>) {
    const n = (v: unknown, max: number) =>
      typeof v === 'number' && Number.isFinite(v) && v > 0
        ? Math.min(max, Math.floor(v))
        : 0;
    const add = {
      bestMass: n(input.bestMass, 1_000_000),
      eaten: n(input.eaten, 1_000_000),
      topMs: n(input.topMs, 1e10),
      games: n(input.games, 1_000_000),
    };
    return this.prisma.$transaction(async (tx) => {
      await this.lockProfile(tx, userId);
      const p = await tx.flockProfile.findUniqueOrThrow({ where: { userId } });
      if (p.statsImportedAt) return { imported: false, stats: toStats(p) };
      const updated = await tx.flockProfile.update({
        where: { userId },
        data: {
          bestMass: Math.max(p.bestMass, add.bestMass),
          eaten: p.eaten + add.eaten,
          topMs: p.topMs + BigInt(add.topMs),
          games: p.games + add.games,
          statsImportedAt: new Date(),
        },
      });
      return { imported: true, stats: toStats(updated) };
    });
  }

  async setSelectedSkin(userId: string, skin: number) {
    if (!(await this.canUseSkin(userId, skin)))
      throw fail(BadRequestException, 'invalid_skin');
    await this.prisma.flockProfile.upsert({
      where: { userId },
      create: { userId, selectedSkin: skin },
      update: { selectedSkin: skin },
    });
  }
}

function toStats(
  p: { bestMass: number; eaten: number; topMs: bigint; games: number } | null,
): FlockStatsDto {
  return {
    bestMass: p?.bestMass ?? 0,
    eaten: p?.eaten ?? 0,
    topMs: Number(p?.topMs ?? 0),
    games: p?.games ?? 0,
  };
}
