import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Спільне тіло multipart для /messages/image та /messages/file. */
export class ImageUploadDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsString()
  @IsOptional()
  replyToId?: string;

  /** Підпис до фото. */
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  caption?: string;
}
