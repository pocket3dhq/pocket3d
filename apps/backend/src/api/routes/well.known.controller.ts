import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { OAuthService } from '@pocket3d/nestjs-libraries/database/prisma/oauth/oauth.service';

// Discovery for MCP clients. nginx (and the Next dev rewrites) send
// MAIN_URL/.well-known/oauth-* here: a 401 from /mcp points at the protected
// resource document, which names MAIN_URL as the authorization server
@ApiExcludeController()
@Controller('/.well-known')
export class WellKnownController {
  constructor(private _oauthService: OAuthService) {}

  @Get('/oauth-authorization-server')
  authorizationServer() {
    return this._oauthService.authorizationServerMetadata();
  }

  @Get(['/oauth-protected-resource', '/oauth-protected-resource/mcp'])
  protectedResource() {
    return this._oauthService.protectedResourceMetadata();
  }
}
