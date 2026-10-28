import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeUsernameHandle } from 'src/users/username.util';
import { authUserCache } from './auth-user-cache';
import { AuthRateLimiter, clientIp } from './auth-rate-limiter';
import { AuthService } from './auth.service';
import { ChooseNicknameDto, GoogleCodeDto } from './dto/GoogleDTO';

const PROVIDER = 'google';
/** redirect_uri принимаем только на наш callback: чужой путь значит подделанный запрос. */
const REDIRECT_PATH = '/api/auth/google/callback';
const NONCE_TTL_MS = 15 * 60_000;

interface GoogleProfile {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

function apiError(
  Exception: new (body: object) => Error,
  statusCode: number,
  code: string,
  message: string,
) {
  return new Exception({ statusCode, code, message });
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  /** nonce -> когда можно забыть: один nonce - одна успешная проверка ID-токена (защита от повтора). */
  private readonly usedNonces = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private auth: AuthService,
    private limiter: AuthRateLimiter,
  ) {}

  private clientId(): string | undefined {
    return this.config.get<string>('GOOGLE_CLIENT_ID')?.trim() || undefined;
  }

  private clientSecret(): string | undefined {
    return this.config.get<string>('GOOGLE_CLIENT_SECRET')?.trim() || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.clientId() && this.clientSecret());
  }

  private requireConfig(): { clientId: string; clientSecret: string } {
    const clientId = this.clientId();
    const clientSecret = this.clientSecret();
    if (!clientId || !clientSecret) {
      this.logger.error(
        'google auth is not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
      );
      throw apiError(
        ServiceUnavailableException,
        503,
        'GOOGLE_NOT_CONFIGURED',
        'Вход через Google не настроен на сервере: не заданы GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET.',
      );
    }
    return { clientId, clientSecret };
  }

  private failed() {
    return apiError(
      UnauthorizedException,
      401,
      'GOOGLE_AUTH_FAILED',
      'Не удалось войти через Google. Попробуйте ещё раз.',
    );
  }

  private rememberNonce(nonce: string): boolean {
    const now = Date.now();
    for (const [n, until] of this.usedNonces) {
      if (until <= now) this.usedNonces.delete(n);
    }
    if (this.usedNonces.has(nonce)) return false;
    this.usedNonces.set(nonce, now + NONCE_TTL_MS);
    return true;
  }

  /**
   * Меняет code на ID-токен и проверяет его сами (подпись по ключам Google, iss, exp, aud = наш Client ID,
   * nonce из нашей куки, email_verified). Данным от клиента верим только как «code + nonce».
   */
  private async verify(dto: GoogleCodeDto): Promise<GoogleProfile> {
    const { clientId, clientSecret } = this.requireConfig();

    let path: string;
    try {
      path = new URL(dto.redirectUri).pathname;
    } catch {
      throw this.failed();
    }
    if (path !== REDIRECT_PATH) {
      this.logger.warn('google auth rejected: unexpected redirect path');
      throw this.failed();
    }

    try {
      const client = new OAuth2Client({
        clientId,
        clientSecret,
        redirectUri: dto.redirectUri,
      });
      const { tokens } = await client.getToken({
        code: dto.code,
        redirect_uri: dto.redirectUri,
      });
      if (!tokens.id_token) throw new Error('no id_token');
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: clientId,
      });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email) throw new Error('missing sub/email');
      if (p.aud !== clientId) throw new Error('aud mismatch');
      if (p.email_verified !== true) throw new Error('email not verified');
      if (!p.nonce || p.nonce !== dto.nonce) throw new Error('nonce mismatch');
      if (!this.rememberNonce(dto.nonce)) throw new Error('nonce reused');
      return {
        sub: p.sub,
        email: p.email.trim().toLowerCase(),
        name: p.name?.trim() || null,
        picture: p.picture?.trim() || null,
      };
    } catch (error) {
      // токены и code в лог не попадают: только причина
      this.logger.warn(
        `google verify failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw this.failed();
    }
  }

  private async uniqueTempUsername(): Promise<string> {
    for (let i = 0; i < 5; i += 1) {
      const candidate = `g${randomBytes(6).toString('hex')}`;
      const taken = await this.prisma.user.findFirst({
        where: { username: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    return `g${randomBytes(9).toString('hex')}`.slice(0, 20);
  }

  /** Вход или регистрация через Google. Аккаунты по email НЕ объединяем. */
  async login(dto: GoogleCodeDto, res: Response, req?: Request) {
    this.limiter.countGoogle(clientIp(req));
    const profile = await this.verify(dto);

    const existing = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerId: { provider: PROVIDER, providerId: profile.sub },
      },
      select: {
        id: true,
        email: true,
        user: { select: { id: true, isActive: true } },
      },
    });

    if (existing) {
      if (!existing.user.isActive) throw this.failed();
      if (existing.email !== profile.email) {
        await this.prisma.authIdentity.update({
          where: { id: existing.id },
          data: { email: profile.email },
        });
      }
      await this.auth.issueRefreshSession(existing.user.id, res);
      this.logger.log(`google login success: userId=${existing.user.id}`);
      return this.auth.buildAccessResponse(existing.user.id);
    }

    const emailOwner = await this.prisma.user.findFirst({
      where: { email: profile.email },
      select: { id: true },
    });
    if (emailOwner) {
      this.logger.warn(
        `google signup denied: email belongs to userId=${emailOwner.id}`,
      );
      throw apiError(
        ConflictException,
        409,
        'GOOGLE_EMAIL_EXISTS',
        'Аккаунт с этим email уже есть. Войдите своим ником и подключите Google в профиле.',
      );
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          email: profile.email,
          username: await this.uniqueTempUsername(),
          nickname: profile.name?.slice(0, 40) ?? null,
          avatarUrl: profile.picture,
          password: null,
          isActive: true,
          usernameChosen: false,
          authIdentities: {
            create: {
              provider: PROVIDER,
              providerId: profile.sub,
              email: profile.email,
            },
          },
        },
        select: { id: true },
      });
      await this.auth.issueRefreshSession(user.id, res);
      this.logger.log(`google signup success: userId=${user.id}`);
      return this.auth.buildAccessResponse(user.id);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw apiError(
          ConflictException,
          409,
          'GOOGLE_EMAIL_EXISTS',
          'Аккаунт с этим email уже есть. Войдите своим ником и подключите Google в профиле.',
        );
      }
      throw error;
    }
  }

  /** Подключение Google к текущему аккаунту (пользователь определяется по refresh-куке). */
  async link(dto: GoogleCodeDto, req: Request) {
    this.limiter.countGoogle(clientIp(req));
    const userId = await this.auth.userIdFromRefreshCookie(req);
    const profile = await this.verify(dto);

    const byGoogle = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerId: { provider: PROVIDER, providerId: profile.sub },
      },
      select: { userId: true },
    });
    if (byGoogle) {
      if (byGoogle.userId === userId) return { ok: true };
      throw apiError(
        ConflictException,
        409,
        'GOOGLE_ALREADY_LINKED',
        'Этот Google-аккаунт уже подключён к другому профилю.',
      );
    }

    const mine = await this.prisma.authIdentity.findUnique({
      where: { userId_provider: { userId, provider: PROVIDER } },
      select: { id: true },
    });
    if (mine) {
      throw apiError(
        ConflictException,
        409,
        'GOOGLE_ALREADY_CONNECTED',
        'К вашему профилю уже подключён другой Google-аккаунт. Сначала отключите его.',
      );
    }

    await this.prisma.authIdentity.create({
      data: {
        userId,
        provider: PROVIDER,
        providerId: profile.sub,
        email: profile.email,
      },
    });
    this.logger.log(`google linked: userId=${userId}`);
    return { ok: true };
  }

  /** Способы входа для экрана «Налаштування». Email Google виден только владельцу. */
  async methods(userId: string) {
    const [user, identity] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { password: true },
      }),
      this.prisma.authIdentity.findUnique({
        where: { userId_provider: { userId, provider: PROVIDER } },
        select: { email: true },
      }),
    ]);
    return {
      hasPassword: Boolean(user?.password),
      google: identity ? { email: identity.email } : null,
      googleEnabled: this.isConfigured(),
    };
  }

  async unlink(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user?.password) {
      throw apiError(
        ConflictException,
        409,
        'LAST_LOGIN_METHOD',
        'Это единственный способ входа. Сначала задайте пароль.',
      );
    }
    await this.prisma.authIdentity.deleteMany({
      where: { userId, provider: PROVIDER },
    });
    this.logger.log(`google unlinked: userId=${userId}`);
    return { ok: true };
  }

  async setPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (user?.password) {
      throw apiError(
        ConflictException,
        409,
        'PASSWORD_ALREADY_SET',
        'Пароль уже задан.',
      );
    }
    const hash = await bcrypt.hash(password, 10);
    // условие password: null защищает от гонки двух запросов
    await this.prisma.user.updateMany({
      where: { id: userId, password: null },
      data: { password: hash },
    });
    return { ok: true };
  }

  async usernameAvailable(rawUsername: string, req?: Request) {
    this.limiter.countUsernameCheck(clientIp(req));
    const username = normalizeUsernameHandle(rawUsername ?? '');
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return { available: false, reason: 'format' as const };
    }
    const taken = await this.prisma.user.findFirst({
      where: { username },
      select: { id: true },
    });
    return taken
      ? { available: false, reason: 'taken' as const }
      : { available: true };
  }

  /** Первый вход через Google: выбор @username (и, по желанию, имени). До этого API закрыто JwtAuthGuard-ом. */
  async chooseNickname(userId: string, dto: ChooseNicknameDto) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { usernameChosen: true },
    });
    if (!current) throw new UnauthorizedException();
    if (current.usernameChosen) {
      throw apiError(
        ConflictException,
        409,
        'USERNAME_ALREADY_CHOSEN',
        'Username уже выбран. Его можно изменить в профиле.',
      );
    }

    const username = normalizeUsernameHandle(dto.username);
    const taken = await this.prisma.user.findFirst({
      where: { username, NOT: { id: userId } },
      select: { id: true },
    });
    if (taken) {
      throw apiError(
        ConflictException,
        409,
        'USERNAME_TAKEN',
        'Этот username уже занят. Выберите другой @username.',
      );
    }

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          username,
          usernameChosen: true,
          ...(dto.nickname?.trim() ? { nickname: dto.nickname.trim() } : {}),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw apiError(
          ConflictException,
          409,
          'USERNAME_TAKEN',
          'Этот username уже занят. Выберите другой @username.',
        );
      }
      throw error;
    }
    authUserCache.invalidate(userId);
    return this.auth.buildAccessResponse(userId);
  }
}
