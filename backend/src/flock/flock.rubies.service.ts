import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RubyReason } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  FLOCK_CONFIG,
  clientGameConfig,
  FREE_SKIN_IDS,
  NUM_SKINS,
  NUM_ARTIFACTS,
  HIDDEN_SKINS,
  isArtifactId,
  PREMIUM_SKIN_IDS,
  SPECIAL_FROM,
  premiumCollectionIds,
  isHiddenSkin,
  isPaidSkin,
  isPremiumSkin,
  isSelectableSkin,
  skinPriceOf,
} from './flock.config';
import { dayStartInZone } from './flock.time';

const R = FLOCK_CONFIG.rubies;

export type FlockErrorCode =
  | 'invalid_version'
  | 'skin_hidden'
  | 'invalid_skin'
  | 'invalid_artifact'
  | 'skin_free'
  | 'already_owned'
  | 'not_enough'
  | 'reason_required'
  | 'invalid_amount'
  | 'insufficient_balance'
  | 'user_not_found';

const fail = (
  Ex: typeof BadRequestException,
  code: FlockErrorCode,
  extra = {},
) => new Ex({ code, ...extra });

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
      artifactId?: number;
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
    if (!isSelectableSkin(skin)) return false;
    if (!isPaidSkin(skin)) return true;
    const row = await this.prisma.flockSkinPurchase.findUnique({
      where: { userId_skinId: { userId, skinId: skin } },
    });
    return !!row;
  }

  async ownedArtifacts(userId: string): Promise<number[]> {
    const rows = await this.prisma.flockArtifactPurchase.findMany({
      where: { userId },
      select: { artifactId: true },
    });
    return rows.map((r) => r.artifactId).sort((a, b) => a - b);
  }

  /** Чи може користувач надіти артефакт (куплений); 0 - «нічого» - завжди можна. */
  async canUseArtifact(userId: string, artifact: number): Promise<boolean> {
    if (artifact === 0) return true;
    if (!isArtifactId(artifact)) return false;
    const row = await this.prisma.flockArtifactPurchase.findUnique({
      where: { userId_artifactId: { userId, artifactId: artifact } },
    });
    return !!row;
  }

  /**
   * Артефакт для входу на арену: запитаний клієнтом (0 - без нього) має бути куплений, інакше null (відмова).
   * Без запиту (старий клієнт) беремо надітий у профілі, якщо він ще куплений.
   */
  async resolveArtifact(
    userId: string,
    requested: number | undefined,
  ): Promise<number | null> {
    if (requested === undefined) {
      const profile = await this.prisma.flockProfile.findUnique({
        where: { userId },
        select: { selectedArtifact: true },
      });
      const sel = profile?.selectedArtifact ?? 0;
      return (await this.canUseArtifact(userId, sel)) ? sel : 0;
    }
    return (await this.canUseArtifact(userId, requested)) ? requested : null;
  }

  async getMe(userId: string) {
    const [profile, skins, artifacts] = await Promise.all([
      this.prisma.flockProfile.findUnique({ where: { userId } }),
      this.ownedSkins(userId),
      this.ownedArtifacts(userId),
    ]);
    // надітий артефакт без покупки (напр. відкликано адміном) не показуємо як надітий
    const selectedArtifact = artifacts.includes(profile?.selectedArtifact ?? 0)
      ? (profile?.selectedArtifact ?? 0)
      : 0;
    return {
      rubies: profile?.rubies ?? 0,
      ownedSkins: skins,
      ownedArtifacts: artifacts,
      selectedArtifact,
      // збережений знятий скін віддаємо як 0 (біла овечка); у БД він замінюється при наступному виборі скіна
      selectedSkin: isSelectableSkin(profile?.selectedSkin ?? 0) ? (profile?.selectedSkin ?? 0) : 0,
      whatsNewSeen: profile?.whatsNewSeen ?? 0,
      premiumCollectionClaimed: !!profile?.premiumCollectionAt,
      statsImported: !!profile?.statsImportedAt,
      stats: toStats(profile),
      config: {
        skinPrice: R.skinPrice,
        premiumSkinPrice: R.premiumSkinPrice,
        specialSkinPrice: R.specialSkinPrice,
        premiumCollectionReward: R.premiumCollectionReward,
        artifactPrice: FLOCK_CONFIG.artifacts.price,
        totalArtifacts: NUM_ARTIFACTS,
        freeSkinIds: [...FREE_SKIN_IDS],
        premiumSkinIds: [...PREMIUM_SKIN_IDS],
        specialFrom: SPECIAL_FROM,
        hiddenSkins: [...HIDDEN_SKINS],
        totalSkins: NUM_SKINS,
        top1Reward: R.top1Reward,
        top1MassThreshold: R.top1MassThreshold,
        game: clientGameConfig(),
      },
    };
  }

  /** Запам'ятовує переглянуту версію «Що нового»: лише вперед (максимум), значення обмежене. */
  async markWhatsNewSeen(userId: string, version: unknown) {
    const v =
      typeof version === 'number' && Number.isFinite(version) && version > 0
        ? Math.min(1000, Math.floor(version))
        : 0;
    if (v === 0) throw fail(BadRequestException, 'invalid_version');
    await this.prisma.$transaction(async (tx) => {
      await this.lockProfile(tx, userId);
      await tx.flockProfile.updateMany({
        where: { userId, whatsNewSeen: { lt: v } },
        data: { whatsNewSeen: v },
      });
    });
    return { whatsNewSeen: v };
  }

  /**
   * Нагорода за 1-ше місце. Повертає null, якщо добовий ліміт вичерпано (сума обрізається до залишку).
   * Добу рахуємо за часом Києва.
   */
  /** Перемога в режимі «Звужуване коло»: та сама добова межа арени, що й за 1-ше місце (причина ARENA_TOP1), інша сума. */
  async awardCircleWin(userId: string, now = new Date()): Promise<AwardResult | null> {
    return this.awardTop1(userId, now, FLOCK_CONFIG.circle.winReward);
  }

  async awardTop1(
    userId: string,
    now = new Date(),
    reward: number = R.top1Reward,
  ): Promise<AwardResult | null> {
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
      const amount = Math.min(reward, left);
      if (amount <= 0) return null;
      const next = await this.apply(tx, userId, balance, {
        delta: amount,
        reason: RubyReason.ARENA_TOP1,
      });
      return { amount, balance: next };
    });
  }

  /** Нагорода за серію днів на 1-му місці: у транзакції закриття доби, поза добовим лімітом арени. */
  async grantStreakInTx(
    tx: Tx,
    userId: string,
    amount: number,
    note?: string,
  ) {
    const balance = await this.lockProfile(tx, userId);
    return this.apply(tx, userId, balance, {
      delta: amount,
      reason: RubyReason.ARENA_STREAK,
      ...(note ? { note } : {}),
    });
  }

  /** Нагорода за перемогу над «Вожаком»: фіксована, не входить у добовий ліміт. */
  async awardBossKill(userId: string): Promise<AwardResult | null> {
    if (R.bossKillReward <= 0) return null;
    return this.prisma.$transaction(async (tx) => {
      const balance = await this.lockProfile(tx, userId);
      const next = await this.apply(tx, userId, balance, {
        delta: R.bossKillReward,
        reason: RubyReason.ARENA_BOSS,
      });
      return { amount: R.bossKillReward, balance: next };
    });
  }

  /**
   * Разовий бонус за перший вхід у гру: +entryBonus рубінів, один раз на гравця (під блокуванням профілю,
   * тож паралельні запити не нарахують двічі). Повертає null, якщо бонус уже отримано.
   */
  async claimEntryBonus(userId: string): Promise<AwardResult | null> {
    if (R.entryBonus <= 0) return null;
    return this.prisma.$transaction(async (tx) => {
      const balance = await this.lockProfile(tx, userId);
      const profile = await tx.flockProfile.findUniqueOrThrow({
        where: { userId },
        select: { entryBonusAt: true },
      });
      if (profile.entryBonusAt) return null;
      const next = await this.apply(tx, userId, balance, {
        delta: R.entryBonus,
        reason: RubyReason.ENTRY_BONUS,
      });
      await tx.flockProfile.update({
        where: { userId },
        data: { entryBonusAt: new Date() },
      });
      return { amount: R.entryBonus, balance: next };
    });
  }

  /**
   * Разова нагорода за повну колекцію преміум-скінів у продажу (без прихованих): під блокуванням профілю, у тій самій
   * транзакції, що й покупка; поза добовим лімітом арени. Повторно не нараховується (premiumCollectionAt).
   * Повертає суму або 0.
   */
  private async claimPremiumCollectionInTx(tx: Tx, userId: string, balance: number): Promise<{ amount: number; balance: number }> {
    const reward = R.premiumCollectionReward;
    if (reward <= 0) return { amount: 0, balance };
    const profile = await tx.flockProfile.findUniqueOrThrow({
      where: { userId },
      select: { premiumCollectionAt: true },
    });
    if (profile.premiumCollectionAt) return { amount: 0, balance };
    const need = premiumCollectionIds();
    const have = await tx.flockSkinPurchase.count({
      where: { userId, skinId: { in: need } },
    });
    if (need.length === 0 || have < need.length) return { amount: 0, balance };
    const next = await this.apply(tx, userId, balance, {
      delta: reward,
      reason: RubyReason.PREMIUM_COLLECTION,
    });
    await tx.flockProfile.update({
      where: { userId },
      data: { premiumCollectionAt: new Date() },
    });
    return { amount: reward, balance: next };
  }

  /** Гравець уже володіє всією колекцією на момент виходу оновлення: нагорода при наступному вході (один раз). */
  async claimPremiumCollection(userId: string): Promise<AwardResult | null> {
    if (R.premiumCollectionReward <= 0) return null;
    return this.prisma.$transaction(async (tx) => {
      const balance = await this.lockProfile(tx, userId);
      const r = await this.claimPremiumCollectionInTx(tx, userId, balance);
      return r.amount > 0 ? r : null;
    });
  }

  /** Покупка: перевірка балансу, списання, запис покупки й журналу - атомарно. */
  async buySkin(userId: string, skinId: number) {
    if (!isSelectableSkin(skinId))
      throw fail(BadRequestException, 'invalid_skin');
    if (!isPaidSkin(skinId)) throw fail(BadRequestException, 'skin_free');
    // скриті скіни купити не можна (вже куплені лишаються доступними, див. canUseSkin)
    if (isHiddenSkin(skinId)) throw fail(BadRequestException, 'skin_hidden');
    return this.prisma.$transaction(async (tx) => {
      const balance = await this.lockProfile(tx, userId);
      const owned = await tx.flockSkinPurchase.findUnique({
        where: { userId_skinId: { userId, skinId } },
      });
      if (owned) throw fail(ConflictException, 'already_owned');
      const price = skinPriceOf(skinId);
      if (balance < price)
        throw fail(BadRequestException, 'not_enough', {
          missing: price - balance,
        });
      await tx.flockSkinPurchase.create({
        data: { userId, skinId, price },
      });
      const next = await this.apply(tx, userId, balance, {
        delta: -price,
        reason: RubyReason.SKIN_PURCHASE,
        skinId,
      });
      // купили останній преміум-скін колекції: нагорода в тій самій транзакції
      const bonus = isPremiumSkin(skinId)
        ? await this.claimPremiumCollectionInTx(tx, userId, next)
        : { amount: 0, balance: next };
      return {
        rubies: bonus.balance,
        skinId,
        ...(bonus.amount > 0 ? { premiumCollection: bonus.amount } : {}),
      };
    });
  }

  /** Покупка артефакта: перевірка балансу, списання, запис покупки й журналу - атомарно (як у скінів). */
  async buyArtifact(userId: string, artifactId: number) {
    if (!isArtifactId(artifactId))
      throw fail(BadRequestException, 'invalid_artifact');
    return this.prisma.$transaction(async (tx) => {
      const balance = await this.lockProfile(tx, userId);
      const owned = await tx.flockArtifactPurchase.findUnique({
        where: { userId_artifactId: { userId, artifactId } },
      });
      if (owned) throw fail(ConflictException, 'already_owned');
      const price = FLOCK_CONFIG.artifacts.price;
      if (balance < price)
        throw fail(BadRequestException, 'not_enough', {
          missing: price - balance,
        });
      await tx.flockArtifactPurchase.create({
        data: { userId, artifactId, price },
      });
      const next = await this.apply(tx, userId, balance, {
        delta: -price,
        reason: RubyReason.ARTIFACT_PURCHASE,
        artifactId,
      });
      return { rubies: next, artifactId };
    });
  }

  /** Адмін: видати артефакт безкоштовно (запис у журналі з delta 0, щоб лишився слід). */
  async adminGrantArtifact(
    actorId: string,
    userId: string,
    artifactId: number,
  ) {
    if (!isArtifactId(artifactId))
      throw fail(BadRequestException, 'invalid_artifact');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw fail(NotFoundException, 'user_not_found');
    return this.prisma.$transaction(async (tx) => {
      const balance = await this.lockProfile(tx, userId);
      const owned = await tx.flockArtifactPurchase.findUnique({
        where: { userId_artifactId: { userId, artifactId } },
      });
      if (owned) throw fail(ConflictException, 'already_owned');
      await tx.flockArtifactPurchase.create({
        data: { userId, artifactId, price: 0 },
      });
      await this.apply(tx, userId, balance, {
        delta: 0,
        reason: RubyReason.ARTIFACT_PURCHASE,
        artifactId,
        note: 'admin grant',
        actorId,
      });
      return { artifactId };
    });
  }

  /** Адмін: нарахувати або списати (delta ≠ 0), причина обов'язкова, баланс не йде нижче нуля. */
  async adminAdjust(
    actorId: string,
    userId: string,
    delta: number,
    note: string,
  ) {
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
    const kills = Math.max(0, run.kills);
    const topMs = BigInt(Math.max(0, Math.round(run.topMs)));
    // Один атомарний запит замість транзакції з блокуванням (було ~6 звернень до БД на кожну смерть): рубіни не чіпаємо.
    await this.prisma.$executeRaw`
      INSERT INTO "FlockProfile" ("userId", "bestMass", "eaten", "topMs", "games")
      VALUES (${userId}, ${mass}, ${kills}, ${topMs}, 1)
      ON CONFLICT ("userId") DO UPDATE SET
        "bestMass" = GREATEST("FlockProfile"."bestMass", EXCLUDED."bestMass"),
        "eaten" = "FlockProfile"."eaten" + EXCLUDED."eaten",
        "topMs" = "FlockProfile"."topMs" + EXCLUDED."topMs",
        "games" = "FlockProfile"."games" + 1`;
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

  /** Надіти (1..7) або зняти (0) артефакт: лише куплений, зберігається в профілі (усі пристрої). */
  async setSelectedArtifact(userId: string, artifact: number) {
    if (!(await this.canUseArtifact(userId, artifact)))
      throw fail(BadRequestException, 'invalid_artifact');
    await this.prisma.flockProfile.upsert({
      where: { userId },
      create: { userId, selectedArtifact: artifact },
      update: { selectedArtifact: artifact },
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
