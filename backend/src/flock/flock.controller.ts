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
import { FlockRubiesService } from './flock.rubies.service';

@Controller('flock')
@UseGuards(JwtAuthGuard)
export class FlockController {
  constructor(private readonly rubies: FlockRubiesService) {}

  private uid(req: Request) {
    return (req.user as { id: string }).id;
  }

  @Get('me')
  me(@Req() req: Request) {
    return this.rubies.getMe(this.uid(req));
  }

  @Post('skins/:id/buy')
  buy(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    return this.rubies.buySkin(this.uid(req), id);
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
