import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { IsString, IsUrl } from 'class-validator';
import { MediaService } from './media.service';

class ExtractAudioDto {
  @IsString()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('api/media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('extract-audio')
  async extractAudio(@Body() dto: ExtractAudioDto) {
    return this.mediaService.extractAudio(dto.url);
  }
}
