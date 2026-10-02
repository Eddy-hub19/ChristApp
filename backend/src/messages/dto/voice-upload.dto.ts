import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class VoiceUploadDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  voiceDuration?: number;

  @IsString()
  @IsOptional()
  replyToId?: string;
}

export class VoiceListenDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;
}
