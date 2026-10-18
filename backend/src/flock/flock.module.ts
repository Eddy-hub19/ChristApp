import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { FlockController } from './flock.controller';
import { FlockGateway } from './flock.gateway';
import { FlockRubiesService } from './flock.rubies.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [FlockController],
  providers: [FlockGateway, FlockRubiesService],
  exports: [FlockRubiesService, FlockGateway],
})
export class FlockModule {}
