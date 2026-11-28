import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  ServiceUnavailableException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminGuard } from 'src/admin/admin.guard';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { uploadErrorMessage } from 'src/common/upload-error-message';
import { RadioService } from './radio.service';
import {
  RADIO_AUDIO_MAX_BYTES,
  parseRadioMeta,
  validateRadioAudio,
  validateRadioCover,
} from './radio.upload';

type UploadedFilesMap = { file?: Express.Multer.File[]; cover?: Express.Multer.File[] };

/** Загружать треки может любой вошедший пользователь, но не чаще UPLOAD_LIMIT раз за UPLOAD_WINDOW_MS (защита от заваливания эфира). */
const UPLOAD_LIMIT = 5;
const UPLOAD_WINDOW_MS = 10 * 60 * 1000;

@Controller('api/radio')
@UseGuards(JwtAuthGuard)
export class RadioController {
  private readonly logger = new Logger(RadioController.name);

  /** userId -> метки времени недавних загрузок (в памяти одного процесса, как и расписание эфира). */
  private readonly uploads = new Map<string, number[]>();

  constructor(
    private readonly radio: RadioService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  private checkUploadRate(userId: string | undefined) {
    const key = userId ?? 'anon';
    const now = Date.now();
    const recent = (this.uploads.get(key) ?? []).filter((at) => now - at < UPLOAD_WINDOW_MS);
    if (recent.length >= UPLOAD_LIMIT) {
      this.uploads.set(key, recent);
      throw new HttpException('Слишком часто: можно добавить не больше 5 треков за 10 минут', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.uploads.set(key, recent);
    if (this.uploads.size > 5000) {
      for (const [k, list] of this.uploads) if (!list.some((at) => now - at < UPLOAD_WINDOW_MS)) this.uploads.delete(k);
    }
  }

  @Get('state')
  state() {
    return this.radio.getState();
  }

  @Get('recent')
  recent() {
    return this.radio.recent();
  }

  @Get('tracks')
  @UseGuards(AdminGuard)
  tracks() {
    return this.radio.listTracks();
  }

  /** Добавить трек может любой пользователь; удалять и управлять очередью - только админ. */
  @Post('tracks')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'cover', maxCount: 1 },
      ],
      { storage: memoryStorage(), limits: { fileSize: RADIO_AUDIO_MAX_BYTES, files: 2 } },
    ),
  )
  async upload(
    @UploadedFiles() files: UploadedFilesMap,
    @Body() body: { title?: unknown; artist?: unknown; durationSec?: unknown },
    @Req() req: { user?: { id?: string } },
  ) {
    if (!this.cloudinary.isReady()) {
      throw new ServiceUnavailableException('Загрузка недоступна: не настроен Cloudinary (см. backend/.env.example).');
    }
    const audio = validateRadioAudio(files?.file?.[0]);
    const cover = validateRadioCover(files?.cover?.[0]);
    const meta = parseRadioMeta(body);
    this.checkUploadRate(req.user?.id);
    try {
      const audioUrl = await this.cloudinary.uploadRadioAudio(audio.buffer, audio.originalname);
      const coverUrl = cover ? await this.cloudinary.uploadRadioCover(cover.buffer) : null;
      const row = await this.radio.addTrack({ ...meta, audioUrl, coverUrl });
      return { ok: true, id: row.id };
    } catch (err) {
      this.logger.warn('radio upload failed', err);
      throw new ServiceUnavailableException(`Не удалось загрузить трек: ${uploadErrorMessage(err)}`);
    }
  }

  @Delete('tracks/:id')
  @UseGuards(AdminGuard)
  @HttpCode(200)
  async remove(@Param('id') id: string) {
    if (!(await this.radio.deleteTrack(id))) throw new NotFoundException('Трек не найден');
    return { ok: true };
  }

  @Patch('tracks/:id/move')
  @UseGuards(AdminGuard)
  async move(@Param('id') id: string, @Body() body: { direction?: unknown }) {
    if (body?.direction !== 'up' && body?.direction !== 'down') {
      throw new BadRequestException('direction: up или down');
    }
    if (!(await this.radio.move(id, body.direction))) throw new NotFoundException('Трек не найден');
    return { ok: true };
  }

  @Post('tracks/:id/play-next')
  @UseGuards(AdminGuard)
  @HttpCode(200)
  async playNext(@Param('id') id: string) {
    if (!(await this.radio.playNext(id))) throw new NotFoundException('Трек не найден');
    return { ok: true };
  }
}
