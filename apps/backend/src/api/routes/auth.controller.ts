import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthResult, AuthService } from '@pocket3d/nestjs-libraries/services/auth/auth.service';
import { RegisterDto } from '@pocket3d/nestjs-libraries/dtos/auth/register.dto';
import { LoginDto } from '@pocket3d/nestjs-libraries/dtos/auth/login.dto';
import { EmailDto } from '@pocket3d/nestjs-libraries/dtos/auth/email.dto';
import { TokenDto } from '@pocket3d/nestjs-libraries/dtos/auth/token.dto';
import { ResetPasswordDto } from '@pocket3d/nestjs-libraries/dtos/auth/reset.password.dto';
import {
  clearSessionCookie,
  readCookie,
  SESSION_COOKIE,
  setSessionCookie,
} from '@pocket3d/nestjs-libraries/services/cookies';
import { THROTTLE } from '@pocket3d/nestjs-libraries/throttler/throttler.provider';

// Signup, login and the emailed links. No session needed; the session comes
// back as an httpOnly cookie, never in the body
@ApiTags('Auth')
@UseGuards(ThrottlerGuard)
@Controller('/auth')
export class AuthController {
  constructor(private _authService: AuthService) {}

  private answer(res: Response, result: AuthResult) {
    if ('session' in result) {
      setSessionCookie(res, result.session);
      return { login: true };
    }
    return { activate: true };
  }

  @SkipThrottle({ ip: true, email: true })
  @Get('/can-register')
  async canRegister() {
    return {
      register: await this._authService.canRegister(),
      emailEnabled: this._authService.emailEnabled(),
    };
  }

  @Throttle(THROTTLE.register)
  @Post('/register')
  @HttpCode(200)
  async register(@Body() body: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.answer(res, await this._authService.register(body, req.headers['user-agent']));
  }

  @Throttle(THROTTLE.login)
  @Post('/login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.answer(res, await this._authService.login(body, req.headers['user-agent']));
  }

  @SkipThrottle({ ip: true, email: true })
  @Post('/logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this._authService.logout(readCookie(req, SESSION_COOKIE));
    clearSessionCookie(res);
    return { logout: true };
  }

  @Throttle(THROTTLE.link)
  @Post('/activate')
  @HttpCode(200)
  async activate(@Body() body: TokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.answer(res, await this._authService.activate(body.token, req.headers['user-agent']));
  }

  @Throttle(THROTTLE.sendEmail)
  @Post('/resend-activation')
  @HttpCode(200)
  resendActivation(@Body() body: EmailDto) {
    return this._authService.resendActivation(body.email);
  }

  @Throttle(THROTTLE.sendEmail)
  @Post('/forgot')
  @HttpCode(200)
  forgot(@Body() body: EmailDto) {
    return this._authService.forgot(body.email);
  }

  @Throttle(THROTTLE.link)
  @Post('/reset')
  @HttpCode(200)
  async reset(@Body() body: ResetPasswordDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.answer(res, await this._authService.reset(body.token, body.password, req.headers['user-agent']));
  }
}
