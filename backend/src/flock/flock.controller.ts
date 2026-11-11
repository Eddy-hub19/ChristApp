import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { FlockDailyService } from './flock.daily.service';
import { FlockRubiesService } from './flock.rubies.service';
import { FlockQuestsService } from './flock.quests.service';
import { isLegendarySkin, isPremiumSkin, isSpecialSkin } from './flock.config';
import { FlockGateway } from './flock.gateway';

@Controller('flock')
@UseGuards(JwtAuthGuard)
export class FlockController {
  constructor(
    private readonly rubies: FlockRubiesService,
    private readonly daily: FlockDailyService,
    private readonly gateway: FlockGateway,
    private readonly quests: FlockQuestsService,
  ) {}

  private uid(req: Request) {
    return (req.user as { id: string }).id;
  }

  @Get('me')
  async me(@Req() req: Request) {
    const userId = this.uid(req);
    // відкриття гри = перший запит профілю: тут же нараховуємо разовий бонус (баланс у відповіді вже з ним)
    const bonus = await this.rubies.claimEntryBonus(userId);
    const streakAward = await this.daily.claimStreakAward(userId);
    const collection = await this.rubies.claimPremiumCollection(userId);
    const [me, daily, questsClaimable] = await Promise.all([
      this.rubies.getMe(userId),
      this.daily.getBoard(userId),
      this.quests.claimable(userId).catch(() => 0),
    ]);
    return {
      ...me,
      daily,
      questsClaimable,
      ...(bonus ? { entryBonus: bonus.amount } : {}),
      ...(collection ? { premiumCollection: collection.amount } : {}),
      ...(streakAward > 0
        ? {
            streakAward,
            streakAwardDay: this.daily.streakAwardDay(streakAward),
          }
        : {}),
    };
  }

  /** Лише таблиця «Рекорди дня» (лобі оновлює її раз на ~30 с). */
  @Get('daily')
  dailyBoard(@Req() req: Request) {
    return this.daily.getBoard(this.uid(req));
  }

  /** Лобі режиму «Замки»: скільки людей на кожній стороні. */
  @Get('castles/lobby')
  castlesLobby() {
    return this.gateway.castlesLobby();
  }

  /** Щоденні завдання: три завдання доби, час до скидання за Києвом. */
  @Get('quests')
  questsList(@Req() req: Request) {
    return this.quests.list(this.uid(req));
  }

  /** «Забрати» нагороду за завдання: перевіряє сервер, повторний запит не нараховує. */
  @Post('quests/:slot/claim')
  questClaim(@Req() req: Request, @Param('slot', ParseIntPipe) slot: number) {
    return this.quests.claim(this.uid(req), slot);
  }

  @Post('skins/:id/buy')
  async buy(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const userId = this.uid(req);
    const res = await this.rubies.buySkin(userId, id);
    // завдання «купити скін»: лише реальна покупка гравцем за рубіни (адмінська видача й нагороди сюди не доходять; легендарні - за смарагди, не рахуються)
    const kind = isLegendarySkin(id) ? null : isSpecialSkin(id) || isPremiumSkin(id) ? 'buy_skin_special' : 'buy_skin_regular';
    if (kind) void this.quests.credit(userId, [{ kind, n: 1, mode: 'add' }]).then(() => this.quests.flushUser(userId)).catch(() => undefined);
    return res;
  }

  @Post('artifacts/:id/buy')
  buyArtifact(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    return this.rubies.buyArtifact(this.uid(req), id);
  }

  @Put('artifact')
  async selectArtifact(
    @Req() req: Request,
    @Body() body: { artifact?: unknown },
  ) {
    await this.rubies.setSelectedArtifact(
      this.uid(req),
      typeof body?.artifact === 'number' ? body.artifact : -1,
    );
    return { ok: true };
  }

  @Put('skin')
  async select(@Req() req: Request, @Body() body: { skin?: unknown }) {
    await this.rubies.setSelectedSkin(
      this.uid(req),
      typeof body?.skin === 'number' ? body.skin : -1,
    );
    return { ok: true };
  }

  @Put('whats-new')
  whatsNew(@Req() req: Request, @Body() body: { version?: unknown }) {
    return this.rubies.markWhatsNewSeen(this.uid(req), body?.version);
  }

  @Post('stats/import')
  importStats(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.rubies.importStats(this.uid(req), body ?? {});
  }
}
