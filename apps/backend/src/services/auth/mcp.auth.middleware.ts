import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ApiKeysService } from '@pocket3d/nestjs-libraries/database/prisma/api-keys/api.keys.service';
import { OAuthService } from '@pocket3d/nestjs-libraries/database/prisma/oauth/oauth.service';
import { McpCaller } from '@pocket3d/nestjs-libraries/mcp/mcp.service';
import { mainUrl } from '@pocket3d/nestjs-libraries/services/main.url';
import { readKey } from '@pocket3d/backend/services/auth/public.auth.middleware';

// /mcp accepts an OAuth access token (connectors: Claude.ai, Cursor...) or an
// API key, as "Authorization: Bearer <token>". /mcp/<api-key> is for clients
// that can't set headers. A 401 carries WWW-Authenticate with the protected
// resource metadata URL, which is what starts the OAuth flow in MCP clients
export const keyFromPath = (url: string) => {
  const match = url.split('?')[0].match(/^\/mcp\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : '';
};

@Injectable()
export class McpAuthMiddleware implements NestMiddleware {
  constructor(
    private _oauthService: OAuthService,
    private _apiKeysService: ApiKeysService
  ) {}

  private async resolve(token: string): Promise<McpCaller | null> {
    if (this._oauthService.isAccessToken(token)) {
      const found = await this._oauthService.validateAccessToken(token);
      return found ? { org: found.org, via: { kind: 'oauth', name: found.client } } : null;
    }
    const found = await this._apiKeysService.validate(token);
    return found ? { org: found.org, via: { kind: 'api-key', name: found.apiKey.name } } : null;
  }

  async use(req: Request, res: Response, next: NextFunction) {
    // CORS preflight carries no credentials
    if (req.method === 'OPTIONS') {
      next();
      return;
    }
    let token = '';
    try {
      token = readKey(req) || keyFromPath(req.originalUrl);
    } catch {
      token = '';
    }
    const caller = token ? await this.resolve(token) : null;
    if (!caller) {
      res
        .status(HttpStatus.UNAUTHORIZED)
        .setHeader(
          'WWW-Authenticate',
          `Bearer resource_metadata="${mainUrl()}/.well-known/oauth-protected-resource/mcp"` +
            (token ? ', error="invalid_token"' : '')
        )
        .json({
          error: token ? 'invalid_token' : 'unauthorized',
          error_description: token
            ? 'Invalid, expired or revoked token'
            : `Connect with OAuth, or send an API key from ${mainUrl()}/dashboard/keys as "Authorization: Bearer <key>"`,
        });
      return;
    }
    // req.auth is what toNodeHandler passes to the MCP handler as authInfo;
    // the server factory reads the caller from extra
    const auth = {
      token,
      clientId: caller.via.kind === 'oauth' ? caller.via.name : 'api-key',
      scopes: ['mcp'],
      extra: { caller },
    };
    Object.assign(req, { org: caller.org, mcpCaller: caller, auth });
    next();
  }
}
