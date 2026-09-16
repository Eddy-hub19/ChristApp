import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { TelegramAuthDto } from './dto/TelegramAuthDTO';

const AUTH_DATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Проверяет подлинность данных из Telegram Login Widget по алгоритму Telegram:
 * https://core.telegram.org/widgets/login#checking-authorization
 */
@Injectable()
export class TelegramAuthService {
  constructor(private config: ConfigService) {}

  private getBotToken(): string {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    if (!token) {
      throw new InternalServerErrorException(
        'TELEGRAM_BOT_TOKEN is not configured',
      );
    }
    return token;
  }

  private buildDataCheckString(dto: TelegramAuthDto): string {
    const entries = Object.entries(dto as unknown as Record<string, unknown>)
      .filter(([key, value]) => key !== 'hash' && value !== undefined)
      .map(([key, value]) => `${key}=${String(value)}`)
      .sort();

    return entries.join('\n');
  }

  /** Бросает UnauthorizedException, если подпись неверна или данные устарели (>24ч). */
  verify(dto: TelegramAuthDto): void {
    const botToken = this.getBotToken();

    const authDateMs = dto.auth_date * 1000;
    if (
      !Number.isFinite(authDateMs) ||
      Date.now() - authDateMs > AUTH_DATE_MAX_AGE_MS
    ) {
      throw new UnauthorizedException('Telegram auth data устарела');
    }

    const dataCheckString = this.buildDataCheckString(dto);
    const secretKey = createHash('sha256').update(botToken).digest();
    const expectedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedHash, 'hex');
    const actualBuf = Buffer.from(dto.hash, 'hex');

    const isValid =
      expectedBuf.length === actualBuf.length &&
      timingSafeEqual(expectedBuf, actualBuf);

    if (!isValid) {
      throw new UnauthorizedException('Неверная подпись Telegram');
    }
  }
}
