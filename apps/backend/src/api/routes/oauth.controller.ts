import { Body, Controller, Get, Headers, HttpCode, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { OAuthService } from '@pocket3d/nestjs-libraries/database/prisma/oauth/oauth.service';
import {
  AuthorizeRequestDto,
  RegisterClientDto,
  RevokeTokenDto,
  TokenRequestDto,
} from '@pocket3d/nestjs-libraries/dtos/oauth/oauth.dtos';
import { THROTTLE } from '@pocket3d/nestjs-libraries/throttler/throttler.provider';

// OAuth for MCP connectors, the parts that need no session: apps register
// themselves, the consent page checks a request, apps trade codes for tokens.
// The "Allow" itself is in OAuthGrantsController (signed in)
@ApiExcludeController()
@UseGuards(ThrottlerGuard)
@Controller('/oauth')
export class OAuthController {
  constructor(private _oauthService: OAuthService) {}

  @Throttle(THROTTLE.oauthRegister)
  @Post('/register')
  @HttpCode(201)
  register(@Body() body: RegisterClientDto, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this._oauthService.registerClient(body);
  }

  // For the consent page (server-side): who is asking, or why it can't
  @SkipThrottle({ ip: true, email: true })
  @Get('/authorize/check')
  async check(@Query() query: AuthorizeRequestDto) {
    const checked = await this._oauthService.checkAuthorizeRequest(query);
    return { client: checked.client, redirectHost: checked.redirectHost };
  }

  @Throttle(THROTTLE.oauthToken)
  @Post('/token')
  @HttpCode(200)
  token(
    @Body() body: TokenRequestDto,
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) res: Response
  ) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    return this._oauthService.token(body, authorization);
  }

  @Throttle(THROTTLE.oauthToken)
  @Post('/revoke')
  @HttpCode(200)
  revoke(@Body() body: RevokeTokenDto) {
    return this._oauthService.revokeToken(body.token);
  }
}
