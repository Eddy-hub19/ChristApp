import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { CreateWatchRoomDto, InviteWatchRoomDto } from './dto/watch-room.dto';
import {
  VideoPopularQueryDto,
  VideoSearchQueryDto,
} from './dto/video-search.dto';
import { WatchPartyService } from './watch-party.service';
import { YoutubeSearchService } from './youtube-search.service';

type AuthedRequest = { user: { id: string } };

@Controller('watch-rooms')
@UseGuards(JwtAuthGuard)
export class WatchPartyController {
  constructor(
    private readonly watchParty: WatchPartyService,
    private readonly youtubeSearch: YoutubeSearchService,
  ) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.watchParty.listForUser(req.user.id);
  }

  /** Перевірка ще до створення кімнати: чи існує відео і чи дозволено його вбудовувати. */
  @Get('video-check/:videoId')
  checkVideo(@Param('videoId') videoId: string) {
    return this.watchParty.checkVideo(videoId);
  }

  /** Міні-YouTube у кінозалі: пошук доступний будь-якому учаснику, не лише хосту. */
  @Get('video-search')
  searchVideos(@Query() query: VideoSearchQueryDto) {
    return this.youtubeSearch.search(query.q);
  }

  @Get('video-popular')
  popularVideos(@Query() query: VideoPopularQueryDto) {
    return this.youtubeSearch.popular(query.region);
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateWatchRoomDto) {
    return this.watchParty.createRoom(req.user.id, dto);
  }

  @Post('join/:token')
  @HttpCode(200)
  joinByToken(@Req() req: AuthedRequest, @Param('token') token: string) {
    return this.watchParty.joinByToken(token, req.user.id);
  }

  @Post(':id/invite')
  @HttpCode(200)
  invite(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteWatchRoomDto,
  ) {
    return this.watchParty.inviteUsers(id, req.user.id, dto.userIds);
  }

  @Get(':id/invite-token')
  inviteToken(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.watchParty.getInviteToken(id, req.user.id);
  }

  @Post(':id/invite-token/rotate')
  @HttpCode(200)
  rotateInviteToken(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.watchParty.rotateInviteToken(id, req.user.id);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.watchParty.acceptInvite(id, req.user.id);
  }

  @Post(':id/decline')
  @HttpCode(200)
  decline(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.watchParty.declineInvite(id, req.user.id);
  }

  @Post(':id/leave')
  @HttpCode(200)
  leave(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.watchParty.leaveRoom(id, req.user.id);
  }

  @Delete(':id')
  remove(@Req() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.watchParty.deleteRoom(id, req.user.id);
  }
}
