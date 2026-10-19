import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, RubyReason } from '@prisma/client';
import { Pool } from 'pg';
import {
  FLOCK_CONFIG as C,
  HIDDEN_SKINS,
  FREE_SKINS,
  NUM_SKINS,
  PREMIUM_FROM,
  SPECIAL_FROM,
} from './flock.config';
import { FlockRubiesService } from './flock.rubies.service';
import { dayStartInZone } from './flock.time';

/**
 * Інтеграційні тести на справжньому Postgres: блокування й транзакції не перевіриш моками.
 * Запуск: TEST_DATABASE_URL=postgresql://... npx jest flock.rubies.service
 * (БД має бути з накоченими міграціями; без змінної набір пропускається).
 */
const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('FlockRubiesService (БД)', () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let svc: FlockRubiesService;
  let n = 0;

  const makeUser = async () => {
    n++;
    return prisma.user.create({
      data: {
        email: `r${Date.now()}${n}@t.io`,
        username: `r${Date.now()}${n}`,
        password: 'x',
      },
    });
  };
  const giveRubies = (actor: string, user: string, amount: number) =>
    svc.adminAdjust(actor, user, amount, 'test');

  // Скриті скіни (HIDDEN_SKINS) купити не можна. Зараз скритих нема (анімовані повернули), тож тести механізму
  // приховування ховають преміум-скіни на час тесту, а тести цін - відкривають усе.
  const hidden = HIDDEN_SKINS as number[];
  const hiddenSaved = [...hidden];
  const openSkins = () => {
    hidden.length = 0;
  };
  const hideSkins = () => {
    hidden.splice(0, hidden.length, 18, 19, 20, 21, 22, 23);
  };
  afterEach(() => {
    hidden.splice(0, hidden.length, ...hiddenSaved);
  });

  beforeAll(() => {
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    svc = new FlockRubiesService(prisma as never);
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  it('нагорода за 1-ше місце: +10, запис у журналі з балансом після', async () => {
    const u = await makeUser();
    expect(await svc.awardTop1(u.id)).toEqual({
      amount: C.rubies.top1Reward,
      balance: C.rubies.top1Reward,
    });
    const tx = await prisma.rubyTransaction.findMany({
      where: { userId: u.id },
    });
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({
      delta: 10,
      balanceAfter: 10,
      reason: RubyReason.ARENA_TOP1,
    });
  });

  it('добовий ліміт: після 100 нагород нових нема, а доба рахується за Києвом', async () => {
    const u = await makeUser();
    const now = new Date();
    const dayStart = dayStartInZone(now, C.rubies.dailyTimeZone);
    // вчорашні за Києвом (на хвилину до початку доби) не враховуються
    await prisma.flockProfile.create({ data: { userId: u.id, rubies: 500 } });
    await prisma.rubyTransaction.create({
      data: {
        userId: u.id,
        delta: 500,
        balanceAfter: 500,
        reason: RubyReason.ARENA_TOP1,
        createdAt: new Date(dayStart.getTime() - 60_000),
      },
    });
    // сьогоднішні: 95 з 100
    await prisma.rubyTransaction.create({
      data: {
        userId: u.id,
        delta: C.rubies.dailyLimit - 5,
        balanceAfter: 595,
        reason: RubyReason.ARENA_TOP1,
        createdAt: dayStart,
      },
    });
    // залишок 5: нагороду обрізано до залишку
    expect(await svc.awardTop1(u.id, now)).toMatchObject({ amount: 5 });
    // ліміт вичерпано
    expect(await svc.awardTop1(u.id, now)).toBeNull();
    // Покупки та адмін-нарахування в ліміт не входять
    await giveRubies('admin', u.id, 50);
    expect(await svc.awardTop1(u.id, now)).toBeNull();
    // А наступної доби - знову можна
    const tomorrow = new Date(now.getTime() + 24 * 3600_000);
    expect(await svc.awardTop1(u.id, tomorrow)).toMatchObject({
      amount: C.rubies.top1Reward,
    });
  });

  it('покупка з нестачею балансу: помилка not_enough, нічого не змінюється', async () => {
    const u = await makeUser();
    await giveRubies('admin', u.id, C.rubies.skinPrice - 1);
    await expect(svc.buySkin(u.id, FREE_SKINS)).rejects.toMatchObject({
      response: { code: 'not_enough', missing: 1 },
    });
    expect((await svc.getMe(u.id)).rubies).toBe(C.rubies.skinPrice - 1);
    expect(await svc.ownedSkins(u.id)).toEqual([]);
  });

  it('успішна покупка: списання, скін у власності, запис у журналі', async () => {
    const u = await makeUser();
    await giveRubies('admin', u.id, 30);
    expect(await svc.buySkin(u.id, FREE_SKINS)).toEqual({
      rubies: 30 - C.rubies.skinPrice,
      skinId: FREE_SKINS,
    });
    expect(await svc.ownedSkins(u.id)).toEqual([FREE_SKINS]);
    const tx = await prisma.rubyTransaction.findFirst({
      where: { userId: u.id, reason: RubyReason.SKIN_PURCHASE },
    });
    expect(tx).toMatchObject({ delta: -20, skinId: FREE_SKINS });
  });

  it('подвійна покупка послідовно: already_owned, списано один раз', async () => {
    const u = await makeUser();
    await giveRubies('admin', u.id, 100);
    await svc.buySkin(u.id, FREE_SKINS + 1);
    await expect(svc.buySkin(u.id, FREE_SKINS + 1)).rejects.toMatchObject({
      response: { code: 'already_owned' },
    });
    expect((await svc.getMe(u.id)).rubies).toBe(80);
  });

  it('подвійне натискання (паралельно): одна покупка, баланс не йде в мінус', async () => {
    const u = await makeUser();
    await giveRubies('admin', u.id, C.rubies.skinPrice); // вистачає рівно на одну
    const res = await Promise.allSettled([
      svc.buySkin(u.id, FREE_SKINS + 2),
      svc.buySkin(u.id, FREE_SKINS + 2),
      svc.buySkin(u.id, FREE_SKINS + 3),
    ]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const me = await svc.getMe(u.id);
    expect(me.rubies).toBe(0);
    expect(me.ownedSkins).toHaveLength(1);
    const purchases = await prisma.rubyTransaction.count({
      where: { userId: u.id, reason: RubyReason.SKIN_PURCHASE },
    });
    expect(purchases).toBe(1);
  });

  it('безкоштовні й неіснуючі скіни купити не можна', async () => {
    const u = await makeUser();
    await expect(svc.buySkin(u.id, 0)).rejects.toMatchObject({
      response: { code: 'skin_free' },
    });
    await expect(svc.buySkin(u.id, NUM_SKINS)).rejects.toMatchObject({
      response: { code: 'invalid_skin' },
    });
  });

  it('підміна скіна клієнтом: платний без покупки недоступний, куплений - доступний', async () => {
    const u = await makeUser();
    expect(await svc.canUseSkin(u.id, 0)).toBe(true);
    expect(await svc.canUseSkin(u.id, FREE_SKINS - 1)).toBe(true);
    expect(await svc.canUseSkin(u.id, FREE_SKINS)).toBe(false);
    expect(await svc.canUseSkin(u.id, NUM_SKINS - 1)).toBe(false);
    expect(await svc.canUseSkin(u.id, NUM_SKINS)).toBe(false);
    expect(await svc.canUseSkin(u.id, -1)).toBe(false);
    expect(await svc.canUseSkin(u.id, 1.5)).toBe(false);
    await expect(svc.setSelectedSkin(u.id, FREE_SKINS)).rejects.toBeDefined();
    await giveRubies('admin', u.id, 20);
    await svc.buySkin(u.id, FREE_SKINS);
    expect(await svc.canUseSkin(u.id, FREE_SKINS)).toBe(true);
    // чужі покупки не рахуються
    const other = await makeUser();
    expect(await svc.canUseSkin(other.id, FREE_SKINS)).toBe(false);
  });

  it('преміум-скін: ціна 60 окремо від 20, списання й запис у журналі з правильною ціною', async () => {
    openSkins();
    const u = await makeUser();
    expect(C.rubies.premiumSkinPrice).toBe(60);
    await giveRubies('admin', u.id, 100);
    expect(await svc.buySkin(u.id, PREMIUM_FROM)).toEqual({
      rubies: 40,
      skinId: PREMIUM_FROM,
    });
    // звичайний платний скін далі коштує 20
    expect(await svc.buySkin(u.id, FREE_SKINS)).toEqual({
      rubies: 20,
      skinId: FREE_SKINS,
    });
    const purchase = await prisma.flockSkinPurchase.findUnique({
      where: { userId_skinId: { userId: u.id, skinId: PREMIUM_FROM } },
    });
    expect(purchase?.price).toBe(60);
    const tx = await prisma.rubyTransaction.findFirst({
      where: { userId: u.id, skinId: PREMIUM_FROM },
    });
    expect(tx).toMatchObject({
      delta: -60,
      balanceAfter: 40,
      reason: RubyReason.SKIN_PURCHASE,
    });
    const me = await svc.getMe(u.id);
    expect(me.config).toMatchObject({
      skinPrice: 20,
      premiumSkinPrice: 60,
      premiumFrom: PREMIUM_FROM,
      totalSkins: NUM_SKINS,
    });
  });

  it('преміум-скін: нестача балансу (59 з 60) - not_enough з missing 1, нічого не змінюється', async () => {
    openSkins();
    const u = await makeUser();
    await giveRubies('admin', u.id, 59);
    await expect(svc.buySkin(u.id, SPECIAL_FROM - 1)).rejects.toMatchObject({
      response: { code: 'not_enough', missing: 1 },
    });
    expect((await svc.getMe(u.id)).rubies).toBe(59);
    expect(await svc.ownedSkins(u.id)).toEqual([]);
    // 20 вистачило б на звичайний платний, а старої ціни преміума (40) - вже ні
    const v = await makeUser();
    await giveRubies('admin', v.id, 20);
    await expect(svc.buySkin(v.id, PREMIUM_FROM)).rejects.toMatchObject({
      response: { code: 'not_enough', missing: 40 },
    });
    const w = await makeUser();
    await giveRubies('admin', w.id, 40);
    await expect(svc.buySkin(w.id, PREMIUM_FROM)).rejects.toMatchObject({
      response: { code: 'not_enough', missing: 20 },
    });
  });

  it('перевірка скіна при вході: преміум без покупки недоступний, куплений - доступний, чужий і неіснуючий - ні', async () => {
    openSkins();
    const u = await makeUser();
    for (let id = PREMIUM_FROM; id < NUM_SKINS; id++) {
      expect(await svc.canUseSkin(u.id, id)).toBe(false);
    }
    expect(await svc.canUseSkin(u.id, NUM_SKINS)).toBe(false);
    await expect(svc.setSelectedSkin(u.id, PREMIUM_FROM)).rejects.toBeDefined();
    await giveRubies('admin', u.id, 60);
    await svc.buySkin(u.id, PREMIUM_FROM);
    expect(await svc.canUseSkin(u.id, PREMIUM_FROM)).toBe(true);
    expect(await svc.canUseSkin(u.id, PREMIUM_FROM + 1)).toBe(false);
    await svc.setSelectedSkin(u.id, PREMIUM_FROM);
    const other = await makeUser();
    expect(await svc.canUseSkin(other.id, PREMIUM_FROM)).toBe(false);
  });

  it('адмін: нарахування й списання з причиною, actorId у журналі', async () => {
    const u = await makeUser();
    expect(await svc.adminAdjust('adm1', u.id, 50, ' бонус ')).toEqual({
      rubies: 50,
    });
    expect(await svc.adminAdjust('adm1', u.id, -15, 'штраф')).toEqual({
      rubies: 35,
    });
    const tx = await prisma.rubyTransaction.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(tx.map((t) => [t.delta, t.note, t.actorId, t.reason])).toEqual([
      [50, 'бонус', 'adm1', RubyReason.ADMIN_ADJUST],
      [-15, 'штраф', 'adm1', RubyReason.ADMIN_ADJUST],
    ]);
  });

  it('адмін: причина обовʼязкова, 0 - помилка, списання більше за баланс - помилка', async () => {
    const u = await makeUser();
    await giveRubies('adm', u.id, 10);
    await expect(svc.adminAdjust('adm', u.id, 5, '  ')).rejects.toMatchObject({
      response: { code: 'reason_required' },
    });
    await expect(svc.adminAdjust('adm', u.id, 0, 'x')).rejects.toMatchObject({
      response: { code: 'invalid_amount' },
    });
    await expect(svc.adminAdjust('adm', u.id, 1.5, 'x')).rejects.toMatchObject({
      response: { code: 'invalid_amount' },
    });
    await expect(svc.adminAdjust('adm', u.id, -11, 'x')).rejects.toMatchObject({
      response: { code: 'insufficient_balance', balance: 10 },
    });
    expect((await svc.getMe(u.id)).rubies).toBe(10);
    await expect(
      svc.adminAdjust('adm', 'no-such-user', 5, 'x'),
    ).rejects.toMatchObject({ response: { code: 'user_not_found' } });
  });

  it('БД не дозволяє мінусовий баланс навіть повз сервіс (CHECK)', async () => {
    const u = await makeUser();
    await expect(
      prisma.flockProfile.create({ data: { userId: u.id, rubies: -1 } }),
    ).rejects.toBeDefined();
  });

  it('перенос статистики з localStorage: один раз, повторний виклик ігнорується', async () => {
    const u = await makeUser();
    const first = await svc.importStats(u.id, {
      bestMass: 1234,
      eaten: 7,
      topMs: 60_000,
      games: 3,
    });
    expect(first).toMatchObject({
      imported: true,
      stats: { bestMass: 1234, eaten: 7, topMs: 60_000, games: 3 },
    });
    const second = await svc.importStats(u.id, { bestMass: 99999, eaten: 99 });
    expect(second.imported).toBe(false);
    expect((await svc.getMe(u.id)).stats.bestMass).toBe(1234);
  });

  it('статистика після смерті: серверні рекорди накопичуються', async () => {
    const u = await makeUser();
    await svc.recordRun(u.id, { maxMass: 500, kills: 2, topMs: 1000 });
    await svc.recordRun(u.id, { maxMass: 300, kills: 1, topMs: 500 });
    expect((await svc.getMe(u.id)).stats).toEqual({
      bestMass: 500,
      eaten: 3,
      topMs: 1500,
      games: 2,
    });
  });

  it('скриті скіни: купити не можна навіть із балансом, баланс і покупки не змінюються', async () => {
    hideSkins();
    const u = await makeUser();
    await giveRubies('admin', u.id, 1000);
    for (const id of HIDDEN_SKINS) {
      await expect(svc.buySkin(u.id, id)).rejects.toMatchObject({
        response: { code: 'skin_hidden' },
      });
    }
    const me = await svc.getMe(u.id);
    expect(me.rubies).toBe(1000);
    expect(me.ownedSkins).toEqual([]);
    expect(me.config.hiddenSkins).toEqual([...HIDDEN_SKINS]);
    // звичайні платні скіни купуються, як раніше
    await expect(svc.buySkin(u.id, FREE_SKINS)).resolves.toMatchObject({
      skinId: FREE_SKINS,
    });
  });

  it('скіни, куплені до приховування, лишаються у гравця й доступні для гри', async () => {
    hideSkins();
    const u = await makeUser();
    const id = HIDDEN_SKINS[0];
    await prisma.flockSkinPurchase.create({
      data: { userId: u.id, skinId: id, price: 60 },
    });
    expect(await svc.canUseSkin(u.id, id)).toBe(true);
    expect((await svc.getMe(u.id)).ownedSkins).toContain(id);
    // а чужій людині без покупки той самий скін недоступний
    const other = await makeUser();
    expect(await svc.canUseSkin(other.id, id)).toBe(false);
  });

  it('бонус за перший вхід: +20 один раз, повторно і паралельно не нараховується, пишеться в журнал', async () => {
    const u = await makeUser();
    const [a, b] = await Promise.all([
      svc.claimEntryBonus(u.id),
      svc.claimEntryBonus(u.id),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await svc.claimEntryBonus(u.id)).toBeNull();
    expect((await svc.getMe(u.id)).rubies).toBe(20);
    const tx = await prisma.rubyTransaction.findMany({
      where: { userId: u.id, reason: 'ENTRY_BONUS' },
    });
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ delta: 20, balanceAfter: 20 });
  });

  it('whatsNewSeen: тільки вперед, за замовчуванням 0, сміття відхиляється', async () => {
    const u = await makeUser();
    expect((await svc.getMe(u.id)).whatsNewSeen).toBe(0);
    await svc.markWhatsNewSeen(u.id, 3);
    await svc.markWhatsNewSeen(u.id, 2);
    expect((await svc.getMe(u.id)).whatsNewSeen).toBe(3);
    await expect(svc.markWhatsNewSeen(u.id, -1)).rejects.toBeDefined();
    await expect(svc.markWhatsNewSeen(u.id, 'x')).rejects.toBeDefined();
    await svc.markWhatsNewSeen(u.id, 10 ** 9);
    expect((await svc.getMe(u.id)).whatsNewSeen).toBe(1000);
  });
  it('особливий скін: покупка за 40, списання, журнал і запис покупки з ціною 40', async () => {
    const u = await makeUser();
    expect(C.rubies.specialSkinPrice).toBe(40);
    await giveRubies('admin', u.id, 100);
    expect(await svc.buySkin(u.id, SPECIAL_FROM)).toEqual({
      rubies: 60,
      skinId: SPECIAL_FROM,
    });
    expect(await svc.buySkin(u.id, NUM_SKINS - 1)).toEqual({
      rubies: 20,
      skinId: NUM_SKINS - 1,
    });
    const purchase = await prisma.flockSkinPurchase.findUnique({
      where: { userId_skinId: { userId: u.id, skinId: SPECIAL_FROM } },
    });
    expect(purchase?.price).toBe(40);
    const tx = await prisma.rubyTransaction.findFirst({
      where: { userId: u.id, skinId: SPECIAL_FROM },
    });
    expect(tx).toMatchObject({
      delta: -40,
      balanceAfter: 60,
      reason: RubyReason.SKIN_PURCHASE,
    });
    expect((await svc.getMe(u.id)).config).toMatchObject({
      specialSkinPrice: 40,
      specialFrom: SPECIAL_FROM,
      totalSkins: 32,
    });
  });

  it('особливий скін: нестача балансу (39 з 40) - not_enough з missing 1, нічого не змінюється', async () => {
    const u = await makeUser();
    await giveRubies('admin', u.id, 39);
    await expect(svc.buySkin(u.id, SPECIAL_FROM)).rejects.toMatchObject({
      response: { code: 'not_enough', missing: 1 },
    });
    expect((await svc.getMe(u.id)).rubies).toBe(39);
    expect(await svc.ownedSkins(u.id)).toEqual([]);
    expect(
      await prisma.rubyTransaction.count({
        where: { userId: u.id, reason: RubyReason.SKIN_PURCHASE },
      }),
    ).toBe(0);
  });

  it('особливий скін: перевірка при вході - без покупки недоступний, куплений - доступний, поза діапазоном - ні', async () => {
    const u = await makeUser();
    for (let id = SPECIAL_FROM; id < NUM_SKINS; id++) {
      expect(await svc.canUseSkin(u.id, id)).toBe(false);
    }
    expect(await svc.canUseSkin(u.id, NUM_SKINS)).toBe(false);
    await expect(svc.setSelectedSkin(u.id, SPECIAL_FROM)).rejects.toBeDefined();
    await giveRubies('admin', u.id, 40);
    await svc.buySkin(u.id, SPECIAL_FROM);
    expect(await svc.canUseSkin(u.id, SPECIAL_FROM)).toBe(true);
    expect(await svc.canUseSkin(u.id, SPECIAL_FROM + 1)).toBe(false);
    const other = await makeUser();
    expect(await svc.canUseSkin(other.id, SPECIAL_FROM)).toBe(false);
  });
});
