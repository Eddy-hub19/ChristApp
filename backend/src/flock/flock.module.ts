import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { FlockController } from './flock.controller';
import { FlockDailyService } from './flock.daily.service';
import { FlockGateway } from './flock.gateway';
import { FlockRubiesService } from './flock.rubies.service';
import { FlockQuestsService } from './flock.quests.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [FlockController],
  providers: [FlockGateway, FlockRubiesService, FlockDailyService, FlockQuestsService],
  exports: [FlockRubiesService, FlockGateway],
})
export class FlockModule {}
