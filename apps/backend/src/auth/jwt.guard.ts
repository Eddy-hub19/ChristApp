import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { firstValueFrom, isObservable } from 'rxjs';
import { ALLOW_WITHOUT_NICKNAME } from './allow-without-nickname.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = super.canActivate(context);
    const allowed = isObservable(result)
      ? await firstValueFrom(result)
      : await result;
    if (!allowed) return false;

    const exempt = this.reflector.getAllAndOverride<boolean>(
      ALLOW_WITHOUT_NICKNAME,
      [context.getHandler(), context.getClass()],
    );
    if (exempt) return true;

    const user = context.switchToHttp().getRequest().user as
      | { usernameChosen?: boolean }
      | undefined;
    if (user && user.usernameChosen === false) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'NICKNAME_REQUIRED',
        message: 'Сначала выберите @username.',
      });
    }
    return true;
  }
}
