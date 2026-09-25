import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PushModule } from 'src/push/push.module';
import { WatchPartyController } from './watch-party.controller';
import { WatchPartyGateway } from './watch-party.gateway';
import { WatchPartyService } from './watch-party.service';
import { YoutubeSearchService } from './youtube-search.service';

@Module({
  imports: [PrismaModule, AuthModule, PushModule],
  controllers: [WatchPartyController],
  providers: [WatchPartyService, WatchPartyGateway, YoutubeSearchService],
})
export class WatchPartyModule {}
