import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { FlockGateway } from './flock.gateway';

@Module({
  imports: [AuthModule, PrismaModule],
  providers: [FlockGateway],
})
export class FlockModule {}
