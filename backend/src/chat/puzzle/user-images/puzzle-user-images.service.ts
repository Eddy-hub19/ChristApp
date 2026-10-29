import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { setUserPuzzleImages, type PuzzleImage } from '../data/puzzle-images';

/** Скільки активних своїх картинок може мати користувач (старіші видаляються). */
export const USER_PUZZLE_MAX_ACTIVE = 5;
/** Не частіше одного завантаження на користувача раз на стільки мс. */
export const USER_PUZZLE_MIN_INTERVAL_MS = 10_000;
export const USER_PUZZLE_MAX_BYTES = 2 * 1024 * 1024;
const REFRESH_MS = 60_000;

export type UserPuzzleImageDto = {
  id: string;
  url: string;
  width: number;
  height: number;
  showAuthor: boolean;
  createdAt: string;
};

/** Тип файлу за сигнатурою (magic bytes), а не за заголовком Content-Type: jpeg / png / webp. */
export function detectImageType(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpeg';
  }
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

type Row = {
  id: string;
  ownerId: string;
  url: string;
  cloudinaryId: string;
  width: number;
  height: number;
  showAuthor: boolean;
  createdAt: Date;
  owner: { username: string; nickname: string | null };
};

/** Власні картинки «Пазлів»: завантаження, обмеження, видалення, блокування, реєстр для гри. */
@Injectable()
export class PuzzleUserImagesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PuzzleUserImagesService.name);
  private readonly lastUpload = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  onModuleInit() {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private toGameImage(row: Row): PuzzleImage {
    return {
      id: row.id,
      characterIds: [],
      url: row.url,
      cloudinaryId: row.cloudinaryId,
      width: row.width,
      height: row.height,
      title: '',
      author: '',
      year: 0,
      source: '',
      license: 'user',
      licenseUrl: null,
      commonsTitle: '',
      sourceUrl: '',
      userMade: true,
      authorName: row.showAuthor
        ? row.owner.nickname?.trim() || row.owner.username
        : null,
    };
  }

  /** Перечитати всі картинки з БД у реєстр гри (після змін і раз на хвилину: працює й для кількох інстансів). */
  async refresh() {
    try {
      const rows = await this.prisma.userPuzzleImage.findMany({
        orderBy: { createdAt: 'desc' },
        include: { owner: { select: { username: true, nickname: true } } },
      });
      setUserPuzzleImages(rows.map((r) => this.toGameImage(r)));
    } catch (err) {
      this.logger.warn(`puzzle user images refresh failed: ${String(err)}`);
    }
  }

  private dto(row: {
    id: string;
    url: string;
    width: number;
    height: number;
    showAuthor: boolean;
    createdAt: Date;
  }): UserPuzzleImageDto {
    return {
      id: row.id,
      url: row.url,
      width: row.width,
      height: row.height,
      showAuthor: row.showAuthor,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async upload(userId: string, buffer: Buffer, showAuthor: boolean) {
    if (!this.cloudinary.isReady()) {
      throw new ServiceUnavailableException('storage_unavailable');
    }
    if (buffer.length === 0 || buffer.length > USER_PUZZLE_MAX_BYTES) {
      throw new BadRequestException('too_large');
    }
    if (!detectImageType(buffer)) {
      throw new BadRequestException('unsupported_type');
    }
    const blocked = await this.prisma.puzzleUploadBlock.findUnique({
      where: { userId },
    });
    if (blocked) throw new ForbiddenException('upload_blocked');
    const now = Date.now();
    const last = this.lastUpload.get(userId) ?? 0;
    if (now - last < USER_PUZZLE_MIN_INTERVAL_MS) {
      throw new HttpException('rate_limited', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.lastUpload.set(userId, now);

    let stored: Awaited<ReturnType<CloudinaryService['uploadPuzzleImage']>>;
    try {
      stored = await this.cloudinary.uploadPuzzleImage(buffer);
    } catch (err) {
      this.lastUpload.delete(userId);
      this.logger.warn(`puzzle image upload failed: ${String(err)}`);
      throw new BadRequestException('upload_failed');
    }
    const row = await this.prisma.userPuzzleImage.create({
      data: {
        ownerId: userId,
        url: stored.url,
        cloudinaryId: stored.publicId,
        width: stored.width,
        height: stored.height,
        showAuthor,
      },
    });
    // не більше USER_PUZZLE_MAX_ACTIVE активних: найстаріші зникають
    const mine = await this.prisma.userPuzzleImage.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'asc' },
    });
    for (const old of mine.slice(0, Math.max(0, mine.length - USER_PUZZLE_MAX_ACTIVE))) {
      await this.deleteRow(old);
    }
    await this.refresh();
    return this.dto(row);
  }

  async listMine(userId: string) {
    const rows = await this.prisma.userPuzzleImage.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.dto(r));
  }

  async setShowAuthor(userId: string, id: string, showAuthor: boolean) {
    const row = await this.prisma.userPuzzleImage.findUnique({ where: { id } });
    if (!row || row.ownerId !== userId) throw new NotFoundException();
    const updated = await this.prisma.userPuzzleImage.update({
      where: { id },
      data: { showAuthor },
    });
    await this.refresh();
    return this.dto(updated);
  }

  private async deleteRow(row: { id: string; cloudinaryId: string }) {
    await this.prisma.userPuzzleImage.deleteMany({ where: { id: row.id } });
    await this.cloudinary.destroyImage(row.cloudinaryId);
  }

  /** Видалити картинку: автор - свою, адмін - будь-яку (`asAdmin` визначає контролер за тим самим allowlist, що й AdminGuard). */
  async remove(id: string, actorId: string, asAdmin: boolean) {
    const row = await this.prisma.userPuzzleImage.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    if (row.ownerId !== actorId && !asAdmin) throw new ForbiddenException();
    await this.deleteRow(row);
    await this.refresh();
  }

  /** Видалення акаунта: усі картинки користувача (файли в Cloudinary теж). */
  async removeAllOfUser(userId: string) {
    const rows = await this.prisma.userPuzzleImage.findMany({
      where: { ownerId: userId },
    });
    for (const r of rows) await this.deleteRow(r);
    if (rows.length > 0) await this.refresh();
  }

  /** Адмінка: усі картинки (прев'ю, автор, дата). */
  async listAll() {
    const rows = await this.prisma.userPuzzleImage.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { id: true, username: true, nickname: true } },
      },
    });
    return rows.map((r) => ({
      ...this.dto(r),
      owner: {
        id: r.owner.id,
        username: r.owner.username,
        nickname: r.owner.nickname,
      },
    }));
  }

  async listBlocks() {
    const rows = await this.prisma.puzzleUploadBlock.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { username: true, nickname: true } } },
    });
    return rows.map((r) => ({
      userId: r.userId,
      username: r.user.username,
      nickname: r.user.nickname,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async setBlocked(userId: string, blocked: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Member not found');
    if (blocked) {
      await this.prisma.puzzleUploadBlock.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
    } else {
      await this.prisma.puzzleUploadBlock.deleteMany({ where: { userId } });
    }
    return { userId, blocked };
  }
}
