import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  forwardRef,
  Get,
  HttpStatus,
  Inject,
  Logger,
  ParseFilePipeBuilder,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MessagesService } from './messages.service';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { ChatGateway } from 'src/chat/chat.gateway';
import { voiceMessageContent } from './voice-message';
import { VoiceUploadDto } from './dto/voice-upload.dto';
import { ImageUploadDto } from './dto/image-upload.dto';
import { uploadErrorMessage } from 'src/common/upload-error-message';
import { BOOK_MIME, bookFilename, sniffBookFormat } from './book-sniff.util';
import {
  FILE_POLICY,
  IMAGE_POLICY,
  VIDEO_NOTE_POLICY,
  VOICE_POLICY,
  isMimeAllowed,
  normalizeMime,
  sanitizeFileName,
} from './upload-policy';

type AuthenticatedRequest = {
  user?: { id?: string };
};

@Controller('messages')
export class MessagesController {
  private readonly logger = new Logger(MessagesController.name);

  constructor(
    private readonly messagesService: MessagesService,
    private readonly cloudinaryService: CloudinaryService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  getGlobalMessages(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException();
    }
    const parsedLimit = Math.min(
      Math.max(parseInt(limit ?? '50', 10) || 50, 1),
      200,
    );
    const parsedSkip = Math.max(parseInt(skip ?? '0', 10) || 0, 0);
    return this.messagesService.getGlobalRoomMessages(parsedLimit, parsedSkip);
  }

  @UseGuards(JwtAuthGuard)
  @Get('room')
  async getRoomMessages(
    @Req() req: AuthenticatedRequest,
    @Query('roomId') roomId?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    const rid = (roomId ?? '').trim();
    if (!rid) {
      throw new BadRequestException('roomId обязателен');
    }

    const mayAccess = await this.messagesService.userCanPostToRoom(userId, rid);
    if (!mayAccess) {
      throw new ForbiddenException('Нет доступа к комнате');
    }

    const parsedLimit = Math.min(
      Math.max(parseInt(limit ?? '250', 10) || 250, 1),
      500,
    );
    const parsedSkip = Math.max(parseInt(skip ?? '0', 10) || 0, 0);
    return this.messagesService.getRoomMessages(rid, parsedLimit, parsedSkip);
  }

  /** Старша історія кімнати (для переходу до цитати, якої ще немає в завантаженому списку). */
  @UseGuards(JwtAuthGuard)
  @Get('room/older')
  async getOlderRoomMessages(
    @Req() req: AuthenticatedRequest,
    @Query('roomId') roomId?: string,
    @Query('beforeId') beforeId?: string,
    @Query('untilId') untilId?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    const rid = (roomId ?? '').trim();
    const before = (beforeId ?? '').trim();
    if (!rid || !before) {
      throw new BadRequestException('roomId и beforeId обязательны');
    }

    const mayAccess = await this.messagesService.userCanPostToRoom(userId, rid);
    if (!mayAccess) {
      throw new ForbiddenException('Нет доступа к комнате');
    }

    return this.messagesService.getRoomMessagesBefore(rid, before, {
      limit: parseInt(limit ?? '50', 10) || 50,
      untilId: (untilId ?? '').trim() || undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body('content') content: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.messagesService.createMessage(content, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('voice/:id/listen')
  async markVoiceListened(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    const result = await this.messagesService.markVoiceListened(id, userId);
    if (!result) {
      return { ok: false };
    }
    this.chatGateway.emitVoiceListened(result.roomId, id, userId);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('voice')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: VOICE_POLICY.maxBytes },
    }),
  )
  async uploadVoice(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: VoiceUploadDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    if (!this.cloudinaryService.isReady()) {
      throw new ServiceUnavailableException(
        'Загрузка голоса недоступна: задайте CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET в .env (см. backend/.env.example).',
      );
    }

    const rid = body.roomId.trim();
    if (!rid) {
      throw new BadRequestException('roomId обязателен');
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException('Нужен аудиофайл в поле file');
    }

    const mime = normalizeMime(file.mimetype);
    if (!isMimeAllowed(VOICE_POLICY, mime)) {
      throw new BadRequestException(`Неподдерживаемый тип: ${mime || '—'}`);
    }

    const mayPost = await this.messagesService.userCanPostToRoom(userId, rid);
    if (!mayPost) {
      throw new ForbiddenException('Нет доступа к комнате');
    }

    try {
      const replyTarget = await this.messagesService.resolveReplyTarget(
        rid,
        body.replyToId,
      );
      const url = await this.cloudinaryService.uploadChatVoice(file.buffer);
      const content = voiceMessageContent(url);
      const message = await this.messagesService.createRoomMessage({
        type: 'VOICE',
        content,
        voiceDuration: body.voiceDuration,
        senderId: userId,
        roomId: rid,
        replyToId: replyTarget?.id,
      });
      await this.chatGateway.broadcastNewChatMessage(rid, message, {
        repliedToUserId: replyTarget?.senderId,
      });
      return { ok: true, id: message.id, content: message.content };
    } catch (err) {
      this.logger.warn('uploadVoice failed', err);
      const reason = uploadErrorMessage(err);
      throw new ServiceUnavailableException(
        `Не удалось загрузить голос: ${reason}`,
      );
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: IMAGE_POLICY.maxBytes },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: ImageUploadDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    if (!this.cloudinaryService.isReady()) {
      throw new ServiceUnavailableException(
        'Загрузка изображений недоступна: задайте CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET в .env (см. backend/.env.example).',
      );
    }

    const rid = body.roomId.trim();
    if (!rid) {
      throw new BadRequestException('roomId обязателен');
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException('Нужен файл изображения в поле file');
    }

    const mime = normalizeMime(file.mimetype);
    if (!isMimeAllowed(IMAGE_POLICY, mime)) {
      throw new BadRequestException(
        `Ожидается изображение, получено: ${mime || '—'}`,
      );
    }

    const mayPost = await this.messagesService.userCanPostToRoom(userId, rid);
    if (!mayPost) {
      throw new ForbiddenException('Нет доступа к комнате');
    }

    try {
      const replyTarget = await this.messagesService.resolveReplyTarget(
        rid,
        body.replyToId,
      );
      const image = await this.cloudinaryService.uploadChatImage(
        file.buffer,
        mime,
      );
      const message = await this.messagesService.createRoomMessage({
        type: 'IMAGE',
        fileUrl: image.url,
        content: body.caption,
        mediaWidth: image.width,
        mediaHeight: image.height,
        senderId: userId,
        roomId: rid,
        replyToId: replyTarget?.id,
      });
      await this.chatGateway.broadcastNewChatMessage(rid, message, {
        repliedToUserId: replyTarget?.senderId,
      });
      return {
        ok: true,
        id: message.id,
        type: message.type,
        fileUrl: message.fileUrl,
        content: message.content,
      };
    } catch (err) {
      this.logger.warn('uploadImage failed', err);
      const reason = uploadErrorMessage(err);
      throw new ServiceUnavailableException(
        `Не удалось загрузить изображение: ${reason}`,
      );
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('video-note')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: VIDEO_NOTE_POLICY.maxBytes },
    }),
  )
  async uploadVideoNote(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: VIDEO_NOTE_POLICY.maxBytes })
        .addFileTypeValidator({
          // Разрешаем суффиксы кодеков, например video/webm;codecs=vp9,opus
          fileType: /^(video\/webm|video\/mp4|video\/quicktime)(;.*)?$/i,
        })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        }),
    )
    file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    if (!this.cloudinaryService.isReady()) {
      throw new ServiceUnavailableException(
        'Загрузка видео недоступна: задайте CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET в .env (см. backend/.env.example).',
      );
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException('Нужен видеофайл в поле file');
    }

    const mime = normalizeMime(file.mimetype);
    if (!isMimeAllowed(VIDEO_NOTE_POLICY, mime)) {
      throw new BadRequestException(
        `Ожидается видео, получено: ${mime || '—'}`,
      );
    }

    try {
      const secureUrl = await this.cloudinaryService.uploadVideoNote(
        file.buffer,
      );
      return { secure_url: secureUrl };
    } catch (err) {
      this.logger.warn('uploadVideoNote failed', err);
      const reason = uploadErrorMessage(err);
      throw new ServiceUnavailableException(
        `Не удалось загрузить видео: ${reason}`,
      );
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: FILE_POLICY.maxBytes },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: ImageUploadDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    if (!this.cloudinaryService.isReady()) {
      throw new ServiceUnavailableException(
        'Загрузка файлов недоступна: задайте CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET в .env (см. backend/.env.example).',
      );
    }

    const rid = body.roomId.trim();
    if (!rid) {
      throw new BadRequestException('roomId обязателен');
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException('Нужен файл в поле file');
    }

    const mime = normalizeMime(file.mimetype);
    // PDF/EPUB определяем по содержимому: заявленный клиентом тип и расширение не считаются.
    const bookFormat = sniffBookFormat(file.buffer);
    if (
      (mime === BOOK_MIME.pdf || mime === BOOK_MIME.epub) &&
      bookFormat === null
    ) {
      throw new BadRequestException('Файл не является корректным PDF или EPUB');
    }
    if (bookFormat === null && !isMimeAllowed(FILE_POLICY, mime)) {
      throw new BadRequestException(
        `Неподдерживаемый тип файла: ${mime || '—'}`,
      );
    }

    const mayPost = await this.messagesService.userCanPostToRoom(userId, rid);
    if (!mayPost) {
      throw new ForbiddenException('Нет доступа к комнате');
    }

    try {
      const sanitizedName = sanitizeFileName(file.originalname);
      const fileName = bookFormat
        ? bookFilename(sanitizedName, bookFormat)
        : sanitizedName;
      const replyTarget = await this.messagesService.resolveReplyTarget(
        rid,
        body.replyToId,
      );
      const uploaded = await this.cloudinaryService.uploadChatFile(
        file.buffer,
        fileName,
      );
      const message = await this.messagesService.createRoomMessage({
        type: 'FILE',
        content: fileName,
        fileUrl: uploaded.url,
        fileSize: uploaded.bytes ?? file.size,
        senderId: userId,
        roomId: rid,
        replyToId: replyTarget?.id,
      });
      await this.chatGateway.broadcastNewChatMessage(rid, message, {
        repliedToUserId: replyTarget?.senderId,
      });
      return {
        ok: true,
        id: message.id,
        type: message.type,
        fileUrl: message.fileUrl,
        content: message.content,
      };
    } catch (err) {
      this.logger.warn('uploadFile failed', err);
      const reason = uploadErrorMessage(err);
      throw new ServiceUnavailableException(
        `Не удалось загрузить файл: ${reason}`,
      );
    }
  }
}
