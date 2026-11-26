import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AdminController } from './admin.controller';
import { ChatModule } from 'src/chat/chat.module';
import { FlockModule } from 'src/flock/flock.module';
import { PushModule } from 'src/push/push.module';
import { PuzzleUserImagesModule } from 'src/chat/puzzle/user-images/puzzle-user-images.module';
import { ServerMetricsService } from './server-metrics.service';
import { CpuBenchmarkService } from './cpu-benchmark.service';
import { DbLatencyService } from './db-latency.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ChatModule,
    FlockModule,
    PuzzleUserImagesModule,
    PushModule,
  ],
  controllers: [AdminController],
  providers: [
    ServerMetricsService,
    DbLatencyService,
    {
      provide: CpuBenchmarkService,
      useFactory: () => new CpuBenchmarkService(),
    },
  ],
})
export class AdminModule {}
