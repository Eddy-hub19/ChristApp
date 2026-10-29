import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { isAdminDashboardUsername } from 'src/config/admin-dashboard';
import {
  PuzzleUserImagesService,
  USER_PUZZLE_MAX_BYTES,
} from './puzzle-user-images.service';

type AuthedReq = { user: { id: string; username?: string } };

/** «Пазли»: свої картинки користувача. Тип файлу сервіс перевіряє за сигнатурою, а не за Content-Type. */
@Controller('puzzle-images')
@UseGuards(JwtAuthGuard)
export class PuzzleUserImagesController {
  constructor(private readonly images: PuzzleUserImagesService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: USER_PUZZLE_MAX_BYTES },
    }),
  )
  upload(
    @Req() req: AuthedReq,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { showAuthor?: unknown },
  ) {
    if (!file) throw new BadRequestException('no_file');
    return this.images.upload(
      req.user.id,
      file.buffer,
      !(body?.showAuthor === 'false' || body?.showAuthor === false),
    );
  }

  @Get('mine')
  mine(@Req() req: AuthedReq) {
    return this.images.listMine(req.user.id);
  }

  @Patch(':id')
  setShowAuthor(
    @Req() req: AuthedReq,
    @Param('id') id: string,
    @Body() body: { showAuthor?: unknown },
  ) {
    return this.images.setShowAuthor(req.user.id, id, body?.showAuthor === true);
  }

  /** Автор удаляет свою, админ (allowlist, как AdminGuard) - любую. */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() req: AuthedReq, @Param('id') id: string) {
    await this.images.remove(
      id,
      req.user.id,
      isAdminDashboardUsername(req.user.username),
    );
  }
}
