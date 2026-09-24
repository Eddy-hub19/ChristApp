import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PushModule } from 'src/push/push.module';
import { WatchPartyController } from './watch-party.controller';
import { WatchPartyGateway } from './watch-party.gateway';
import { WatchPartyService } from './watch-party.service';

@Module({
  imports: [PrismaModule, AuthModule, PushModule],
  controllers: [WatchPartyController],
  providers: [WatchPartyService, WatchPartyGateway],
})
export class WatchPartyModule {}
