import { Module, forwardRef } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { AuthModule } from 'src/auth/auth.module';
import { MessagesModule } from 'src/messages/messages.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PushModule } from 'src/push/push.module';
import { PuzzleUserImagesModule } from './puzzle/user-images/puzzle-user-images.module';

@Module({
  controllers: [ChatController],
  providers: [ChatGateway],
  imports: [
    PrismaModule,
    forwardRef(() => MessagesModule),
    AuthModule,
    forwardRef(() => PushModule),
    PuzzleUserImagesModule,
  ],
  exports: [ChatGateway],
})
export class ChatModule {}
