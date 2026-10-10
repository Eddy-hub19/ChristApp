import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { authUserCache } from './auth-user-cache';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');

    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: { sub?: string }) {
    if (!payload?.sub) {
      return null;
    }

    const cached = authUserCache.get(payload.sub);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        createdAt: true,
        isActive: true,
        avatarUrl: true,
        themeForegroundHex: true,
        themeBackgroundHex: true,
        themeFontKey: true,
        bio: true,
      },
    });

    if (!user?.isActive) {
      return null;
    }

    authUserCache.set(payload.sub, user);
    return user;
  }
}
