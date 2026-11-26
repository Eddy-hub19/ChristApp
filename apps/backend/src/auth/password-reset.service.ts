import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRateLimiter, clientIp } from './auth-rate-limiter';
import { authUserCache } from './auth-user-cache';

/** Сколько живёт ссылка сброса, выданная админом. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Сброс пароля через админку: почты в проекте нет, поэтому админ получает одноразовую ссылку и передаёт её человеку.
 * В БД лежит только хеш токена; ссылка живёт час, срабатывает один раз, новая ссылка гасит прежние.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private prisma: PrismaService,
    private limiter: AuthRateLimiter,
  ) {}

  async issue(userId: string, adminId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Member not found');

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
      this.prisma.passwordResetToken.create({
        data: { userId, tokenHash: sha256Hex(token), expiresAt },
      }),
    ]);
    this.logger.log(`password reset issued: userId=${userId}; by=${adminId}`);
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async confirm(token: string, password: string, req?: Request) {
    this.limiter.countPasswordReset(clientIp(req));

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256Hex(token) },
      select: { id: true, userId: true, usedAt: true, expiresAt: true },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw this.invalid();
    }

    const hash = await bcrypt.hash(password, 10);
    await this.prisma.$transaction(async (tx) => {
        // usedAt: null защищает от гонки двух запросов с одной ссылкой
        const claimed = await tx.passwordResetToken.updateMany({
          where: { id: record.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (claimed.count !== 1) throw this.invalid();
        await tx.user.update({
          where: { id: record.userId },
          data: { password: hash },
        });
        // забытый пароль мог быть чужим: выходим со всех устройств
        await tx.refreshSession.deleteMany({
          where: { userId: record.userId },
        });
        await tx.passwordResetToken.deleteMany({
          where: { userId: record.userId, id: { not: record.id } },
        });
    });
    authUserCache.invalidate(record.userId);
    this.logger.log(`password reset done: userId=${record.userId}`);
    return { ok: true };
  }

  private invalid() {
    return new BadRequestException({
      statusCode: 400,
      code: 'RESET_TOKEN_INVALID',
      message: 'Ссылка недействительна или устарела. Попросите новую.',
    });
  }
}
