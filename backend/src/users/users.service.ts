import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { authUserCache } from '../auth/auth-user-cache';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { normalizeUsernameHandle } from './username.util';
import { PUBLIC_USER_PROFILE_SELECT } from '../common/public-user';
import { canUseBubbleStyles } from '../config/bubble-styles';

const ACTIVITY_CACHE_MS = 60_000;

function latestDate(a?: Date | null, b?: Date | null): Date | undefined {
  if (a && b) return a.getTime() >= b.getTime() ? a : b;
  return a ?? b ?? undefined;
}

const profileSelect = {
  id: true,
  email: true,
  username: true,
  nickname: true,
  createdAt: true,
  lastSeenAt: true,
  isActive: true,
  avatarUrl: true,
  themeForegroundHex: true,
  themeBackgroundHex: true,
  themeFontKey: true,
  bio: true,
  bubbleStyle: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // Отримати всіх користувачів
  async getAllUsers() {
    const [users, activity] = await Promise.all([
      this.prisma.user.findMany({
        // справочник виден всем: без email и прочего приватного
        select: PUBLIC_USER_PROFILE_SELECT,
        orderBy: { createdAt: 'asc' },
      }),
      this.getLastActivityByUser(),
    ]);
    // `lastSeenAt` пишеться лише при відключенні сокета; у кого його ще немає, відновлюємо
    // з останнього повідомлення чи входу — щоб список учасників мав чесний порядок.
    return users.map((user) => ({
      ...user,
      lastSeenAt: latestDate(user.lastSeenAt, activity.get(user.id)) ?? null,
    }));
  }

  private activityCache: { at: number; map: Map<string, Date> } | null = null;

  /** Остання активність (повідомлення / вхід) по користувачу; кеш на хвилину, бо `/users` викликають часто. */
  private async getLastActivityByUser(): Promise<Map<string, Date>> {
    const now = Date.now();
    if (this.activityCache && now - this.activityCache.at < ACTIVITY_CACHE_MS) {
      return this.activityCache.map;
    }
    const [messages, sessions] = await Promise.all([
      this.prisma.message.groupBy({
        by: ['senderId'],
        _max: { createdAt: true },
      }),
      this.prisma.refreshSession.groupBy({
        by: ['userId'],
        _max: { createdAt: true },
      }),
    ]);
    const map = new Map<string, Date>();
    for (const row of messages) {
      const merged = latestDate(map.get(row.senderId), row._max.createdAt);
      if (merged) map.set(row.senderId, merged);
    }
    for (const row of sessions) {
      const merged = latestDate(map.get(row.userId), row._max.createdAt);
      if (merged) map.set(row.userId, merged);
    }
    this.activityCache = { at: now, map };
    return map;
  }

  // Отримати одного користувача за id
  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_USER_PROFILE_SELECT,
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const hasIdentity =
      dto.username !== undefined || dto.nickname !== undefined;
    const hasAppearance =
      dto.themeForegroundHex !== undefined ||
      dto.themeBackgroundHex !== undefined ||
      dto.themeFontKey !== undefined;
    const hasBio = dto.bio !== undefined;
    const hasBubbleStyle = dto.bubbleStyle !== undefined;

    if (!hasIdentity && !hasAppearance && !hasBio && !hasBubbleStyle) {
      throw new BadRequestException('Нет данных для обновления');
    }

    const nextUsername =
      dto.username !== undefined
        ? normalizeUsernameHandle(dto.username)
        : undefined;
    const nextNickname =
      dto.nickname !== undefined ? dto.nickname.trim() : undefined;

    if (nextNickname !== undefined && !nextNickname) {
      throw new BadRequestException('Ник не может быть пустым');
    }

    if (nextUsername !== undefined) {
      const taken = await this.prisma.user.findFirst({
        where: { username: nextUsername, NOT: { id: userId } },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('Этот @username уже занят');
      }
    }

    const themeFg =
      dto.themeForegroundHex === undefined
        ? undefined
        : dto.themeForegroundHex === null || dto.themeForegroundHex === ''
          ? null
          : dto.themeForegroundHex;
    const themeBg =
      dto.themeBackgroundHex === undefined
        ? undefined
        : dto.themeBackgroundHex === null || dto.themeBackgroundHex === ''
          ? null
          : dto.themeBackgroundHex;
    const themeFont =
      dto.themeFontKey === undefined
        ? undefined
        : dto.themeFontKey === null || dto.themeFontKey === ''
          ? null
          : dto.themeFontKey;

    const nextBio =
      dto.bio === undefined
        ? undefined
        : dto.bio.trim() === ''
          ? null
          : dto.bio.trim();

    if (hasBubbleStyle && dto.bubbleStyle !== 'default') {
      // тестовый режим: пока BUBBLE_STYLES_ACCESS = 'admin', менять стиль может только админ
      const me = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      if (!canUseBubbleStyles(me?.username)) {
        throw new ForbiddenException('Стили пузырей пока недоступны');
      }
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(hasBubbleStyle ? { bubbleStyle: dto.bubbleStyle } : {}),
          ...(nextUsername !== undefined ? { username: nextUsername } : {}),
          ...(nextNickname !== undefined ? { nickname: nextNickname } : {}),
          ...(themeFg !== undefined ? { themeForegroundHex: themeFg } : {}),
          ...(themeBg !== undefined ? { themeBackgroundHex: themeBg } : {}),
          ...(themeFont !== undefined ? { themeFontKey: themeFont } : {}),
          ...(nextBio !== undefined ? { bio: nextBio } : {}),
        },
        select: profileSelect,
      });
      // JwtStrategy кешує користувача на 30 с: власна правка має бути видна одразу.
      authUserCache.invalidate(userId);
      return updated;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target;
        const fields = Array.isArray(target)
          ? target.map((item) => String(item).toLowerCase())
          : [];
        if (fields.some((f) => f.includes('username'))) {
          throw new ConflictException('Этот @username уже занят');
        }
      }
      throw error;
    }
  }

  async setAvatarUrl(userId: string, avatarUrl: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: profileSelect,
    });
    authUserCache.invalidate(userId);
    return updated;
  }

  async getAvatarLikesReceivedCount(targetUserId: string) {
    const count = await this.prisma.avatarLike.count({
      where: { targetUserId },
    });
    return { receivedCount: count };
  }

  async getAvatarLikeState(targetUserId: string, viewerId: string) {
    const [receivedCount, existing] = await Promise.all([
      this.prisma.avatarLike.count({ where: { targetUserId } }),
      this.prisma.avatarLike.findUnique({
        where: {
          targetUserId_likerUserId: { targetUserId, likerUserId: viewerId },
        },
      }),
    ]);
    return {
      receivedCount: receivedCount,
      likedByMe: Boolean(existing),
    };
  }

  async toggleAvatarLike(targetUserId: string, likerUserId: string) {
    if (targetUserId === likerUserId) {
      throw new BadRequestException('Нельзя лайкнуть свой аватар');
    }

    const targetExists = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!targetExists) {
      throw new NotFoundException('Пользователь не найден');
    }

    const existing = await this.prisma.avatarLike.findUnique({
      where: {
        targetUserId_likerUserId: { targetUserId, likerUserId },
      },
    });

    if (existing) {
      await this.prisma.avatarLike.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.avatarLike.create({
        data: { targetUserId, likerUserId },
      });
    }

    return this.getAvatarLikeState(targetUserId, likerUserId);
  }
}
