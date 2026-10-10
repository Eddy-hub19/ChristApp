import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AdminController } from './admin.controller';
import { ChatModule } from 'src/chat/chat.module';
import { ServerMetricsService } from './server-metrics.service';
import { CpuBenchmarkService } from './cpu-benchmark.service';

@Module({
  imports: [PrismaModule, ChatModule],
  controllers: [AdminController],
  providers: [
    ServerMetricsService,
    {
      provide: CpuBenchmarkService,
      useFactory: () => new CpuBenchmarkService(),
    },
  ],
})
export class AdminModule {}
