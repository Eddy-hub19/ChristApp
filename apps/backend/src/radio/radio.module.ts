import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RadioController } from './radio.controller';
import { RadioGateway } from './radio.gateway';
import { RadioService } from './radio.service';

@Module({
  imports: [AuthModule, PrismaModule, CloudinaryModule],
  controllers: [RadioController],
  providers: [RadioService, RadioGateway],
})
export class RadioModule {}
