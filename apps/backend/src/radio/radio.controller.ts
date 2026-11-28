import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
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

@Controller('api/radio')
@UseGuards(JwtAuthGuard)
export class RadioController {
  private readonly logger = new Logger(RadioController.name);

  constructor(
    private readonly radio: RadioService,
    private readonly cloudinary: CloudinaryService,
  ) {}

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

  @Post('tracks')
  @UseGuards(AdminGuard)
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
  ) {
    if (!this.cloudinary.isReady()) {
      throw new ServiceUnavailableException('Загрузка недоступна: не настроен Cloudinary (см. backend/.env.example).');
    }
    const audio = validateRadioAudio(files?.file?.[0]);
    const cover = validateRadioCover(files?.cover?.[0]);
    const meta = parseRadioMeta(body);
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
