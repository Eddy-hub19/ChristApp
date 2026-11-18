import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { MessagesService } from 'src/messages/messages.service';
import {
  RegisterPushSubscriptionDto,
  UnsubscribePushSubscriptionDto,
} from './dto/push-subscription.dto';
import { PushService } from './push.service';
import { presence } from 'src/chat/presence.registry';
import { roomViews } from './room-view.registry';

type AuthenticatedRequest = {
  user?: {
    id?: string;
  };
  headers: Record<string, string | string[] | undefined>;
};

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(
    private readonly pushService: PushService,
    private readonly messagesService: MessagesService,
  ) {}

  @Get('public-key')
  getPublicKey() {
    return this.pushService.getPublicConfig();
  }

  /** `?endpoint=` — підписка цього пристрою: чи зареєстрована вона на сервері (екран діагностики й автосинхронізація). */
  @Get('status')
  async getStatus(
    @Req() req: AuthenticatedRequest,
    @Query('endpoint') endpoint?: string,
  ) {
    const userId = this.resolveUserId(req);
    return this.pushService.getStatus(userId, endpoint);
  }

  /** Тестове сповіщення: на цей пристрій (з endpoint) або на всі пристрої користувача. */
  @Post('test')
  async sendTest(
    @Req() req: AuthenticatedRequest,
    @Body() body: { endpoint?: unknown },
  ) {
    const userId = this.resolveUserId(req);
    return this.pushService.sendTestPush(
      userId,
      typeof body?.endpoint === 'string' ? body.endpoint : undefined,
    );
  }

  /**
   * Клієнт згортається/блокується: сокет iOS ще кілька секунд лишається «живим», тож `roomViewState`
   * по ньому не завжди встигає. Цей запит (fetch keepalive) миттєво знімає всі «перегляди» сокета
   * і так само негайно переводить цей пристрій в «away» (онлайн = застосунок видно, див. presence.registry).
   */
  @Post('view-state/clear')
  clearViewState(
    @Req() req: AuthenticatedRequest,
    @Body() body: { socketId?: unknown },
  ) {
    const userId = this.resolveUserId(req);
    const socketId = typeof body?.socketId === 'string' ? body.socketId : '';
    if (!socketId) return { ok: false };
    const clearedViews = roomViews.clearSocket(socketId, userId);
    const markedAway = presence.setActive(socketId, false, userId);
    return { ok: clearedViews || markedAway };
  }

  @Get('unread-summary')
  async getUnreadSummary(@Req() req: AuthenticatedRequest) {
    const userId = this.resolveUserId(req);
    return this.messagesService.getUnreadSummary(userId);
  }

  @Post('subscribe')
  async subscribe(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegisterPushSubscriptionDto,
  ) {
    const userId = this.resolveUserId(req);
    const userAgentHeader = req.headers['user-agent'];
    const userAgent = Array.isArray(userAgentHeader)
      ? userAgentHeader[0]
      : userAgentHeader;

    return this.pushService.upsertSubscription(userId, dto, userAgent);
  }

  @Post('unsubscribe')
  async unsubscribe(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UnsubscribePushSubscriptionDto,
  ) {
    const userId = this.resolveUserId(req);
    return this.pushService.unsubscribe(userId, dto.endpoint);
  }

  private resolveUserId(req: AuthenticatedRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Не авторизован');
    }

    return userId;
  }
}
