import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoginDto, RegisterDto } from './dto/AuthDTO';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';
import { AllowWithoutNickname } from './allow-without-nickname.decorator';
import { GoogleAuthService } from './google-auth.service';
import {
  ChooseNicknameDto,
  GoogleCodeDto,
  SetPasswordDto,
} from './dto/GoogleDTO';

@Controller()
export class AuthController {
  constructor(
    private authService: AuthService,
    private googleAuth: GoogleAuthService,
  ) {}

  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.register(dto, res, req);
  }

  @Post('login')
  @HttpCode(200)
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(dto, res, req);
  }

  @Post('auth/refresh')
  @HttpCode(200)
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.refresh(req, res);
  }

  @Post('auth/logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(req, res);
  }

  @Get('/auth/me')
  @UseGuards(JwtAuthGuard)
  @AllowWithoutNickname()
  getMe(@Req() req) {
    return req.user;
  }

  /** Публично: кнопка Google на экране входа показывается только при настроенных GOOGLE_CLIENT_ID/SECRET. */
  @Get('auth/google/config')
  googleConfig() {
    return { enabled: this.googleAuth.isConfigured() };
  }

  @Post('auth/google')
  @HttpCode(200)
  google(
    @Body() dto: GoogleCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return dto.mode === 'link'
      ? this.googleAuth.link(dto, req)
      : this.googleAuth.login(dto, res, req);
  }

  @Delete('auth/google')
  @UseGuards(JwtAuthGuard)
  unlinkGoogle(@Req() req: { user: { id: string } }) {
    return this.googleAuth.unlink(req.user.id);
  }

  @Get('auth/methods')
  @UseGuards(JwtAuthGuard)
  methods(@Req() req: { user: { id: string } }) {
    return this.googleAuth.methods(req.user.id);
  }

  @Post('auth/password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  setPassword(
    @Req() req: { user: { id: string } },
    @Body() dto: SetPasswordDto,
  ) {
    return this.googleAuth.setPassword(req.user.id, dto.password);
  }

  @Post('auth/nickname')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @AllowWithoutNickname()
  chooseNickname(
    @Req() req: { user: { id: string } },
    @Body() dto: ChooseNicknameDto,
  ) {
    return this.googleAuth.chooseNickname(req.user.id, dto);
  }

  @Get('auth/username-available')
  usernameAvailable(@Query('username') username: string, @Req() req: Request) {
    return this.googleAuth.usernameAvailable(username, req);
  }
}
