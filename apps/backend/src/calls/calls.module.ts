import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PushModule } from 'src/push/push.module';
import { CallsController } from './calls.controller';
import { AgoraService } from './agora.service';
import { CallSignalingService } from './call-signaling.service';

@Module({
  imports: [AuthModule, PrismaModule, forwardRef(() => PushModule)],
  controllers: [CallsController],
  providers: [AgoraService, CallSignalingService],
  exports: [AgoraService, CallSignalingService],
})
export class CallsModule {}
