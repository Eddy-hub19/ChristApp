import { Module } from '@nestjs/common';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PuzzleUserImagesController } from './puzzle-user-images.controller';
import { PuzzleUserImagesService } from './puzzle-user-images.service';

@Module({
  imports: [PrismaModule, CloudinaryModule],
  controllers: [PuzzleUserImagesController],
  providers: [PuzzleUserImagesService],
  exports: [PuzzleUserImagesService],
})
export class PuzzleUserImagesModule {}
