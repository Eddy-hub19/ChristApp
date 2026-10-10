import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { isAdminDashboardUsername } from 'src/config/admin-dashboard';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdminGuard } from './admin.guard';
import { ServerMetricsService } from './server-metrics.service';
import { CpuBenchmarkService } from './cpu-benchmark.service';
import { ChatGateway } from 'src/chat/chat.gateway';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: ServerMetricsService,
    private readonly chatGateway: ChatGateway,
    private readonly cpuBenchmark: CpuBenchmarkService,
  ) {}

  private normalizeUsername(value: string | null | undefined): string {
    return value?.trim().toLowerCase() ?? '';
  }

  /** Стан сервера для вкладки «Процеси»: процес, хост, БД, реалтайм. */
  @Get('server')
  async serverStatus() {
    const dbStartedAt = performance.now();
    const [dbOk, usersTotal, usersActive] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(
        () => true,
        () => false,
      ),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
    ]);
    const dbPingMs = Math.round((performance.now() - dbStartedAt) * 10) / 10;
    const { pool } = this.prisma;

    return {
      generatedAt: new Date().toISOString(),
      ...this.metrics.snapshot(),
      db: {
        ok: dbOk,
        /** Час відповіді трьох паралельних запитів (ping + 2 count) — верхня оцінка RTT до БД. */
        pingMs: dbPingMs,
        pool: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
          max: pool.options.max ?? 10,
        },
      },
      realtime: this.chatGateway.getRealtimeStats(),
      users: { total: usersTotal, active: usersActive },
    };
  }

  /** Останній замір швидкості CPU (null - ще не міряли від запуску процесу). */
  @Get('cpu-benchmark')
  latestCpuBenchmark() {
    return { result: this.cpuBenchmark.latest() };
  }

  /** Заміряти швидкість ядра цього сервера відносно M2 (синхронно, ~100 мс). */
  @Post('cpu-benchmark')
  runCpuBenchmark() {
    return this.cpuBenchmark.run();
  }

  /** Усі учасники: максимум полів для огляду в адмінці. */
  @Get('members')
  async listMembers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        createdAt: true,
        isActive: true,
        lastSeenAt: true,
        avatarUrl: true,
      },
    });
  }

  @Delete('members/:id')
  async deleteMember(@Param('id') id: string, @Req() req: Request) {
    const actor = req.user as { id?: string; username?: string } | undefined;
    if (!id?.trim()) {
      throw new BadRequestException('Member id is required');
    }

    if (!actor?.id) {
      throw new ForbiddenException('Invalid admin session');
    }

    if (actor.id === id) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, email: true },
    });

    if (!target) {
      throw new NotFoundException('Member not found');
    }

    const targetUsername = this.normalizeUsername(target.username);
    if (targetUsername && isAdminDashboardUsername(targetUsername)) {
      throw new ForbiddenException('Cannot delete another admin account');
    }

    await this.prisma.user.delete({ where: { id: target.id } });
    return {
      id: target.id,
      username: target.username,
      email: target.email,
      deleted: true,
    };
  }
}
