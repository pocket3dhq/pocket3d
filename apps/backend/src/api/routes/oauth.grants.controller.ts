import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OAuthService } from '@pocket3d/nestjs-libraries/database/prisma/oauth/oauth.service';
import { ConsentDto } from '@pocket3d/nestjs-libraries/dtos/oauth/oauth.dtos';
import { GetOrgFromRequest } from '@pocket3d/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@pocket3d/nestjs-libraries/user/user.from.request';
import { AuthOrg, AuthUser } from '@pocket3d/nestjs-libraries/user/request.types';

// The signed-in side of OAuth (behind AuthMiddleware: session cookie, JSON
// bodies): the consent answer, and the apps the user connected
@ApiTags('Connected apps')
@Controller('/oauth')
export class OAuthGrantsController {
  constructor(private _oauthService: OAuthService) {}

  // Allow / Deny on MAIN_URL/oauth/authorize. Returns where the browser goes
  @Post('/authorize')
  @HttpCode(200)
  answer(@GetUserFromRequest() user: AuthUser, @GetOrgFromRequest() org: AuthOrg, @Body() body: ConsentDto) {
    const { allow, ...request } = body;
    return this._oauthService.answerConsent(user.id, org, request, allow);
  }

  @Get('/grants')
  list(@GetUserFromRequest() user: AuthUser, @GetOrgFromRequest() org: AuthOrg) {
    return this._oauthService.listGrants(user.id, org.id);
  }

  @Delete('/grants/:id')
  revoke(@GetUserFromRequest() user: AuthUser, @GetOrgFromRequest() org: AuthOrg, @Param('id') id: string) {
    return this._oauthService.revokeGrant(user.id, org.id, id);
  }
}
