import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ApiKeysService } from '@pocket3d/nestjs-libraries/database/prisma/api-keys/api.keys.service';

// The key the CLI and agents send. Accepts "Authorization: <key>" and
// "Authorization: Bearer <key>"
export const readKey = (req: Pick<Request, 'headers'>) => {
  const header = (req.headers.authorization || '').trim();
  return header.replace(/^Bearer\s+/i, '');
};

// Keys are looked up by their sha256 (a unique index), so there's no
// comparison loop to time
@Injectable()
export class PublicAuthMiddleware implements NestMiddleware {
  constructor(private _apiKeysService: ApiKeysService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const key = readKey(req);
    if (!key) {
      res.status(HttpStatus.UNAUTHORIZED).json({ msg: 'No API Key found' });
      return;
    }

    const found = await this._apiKeysService.validate(key);
    if (!found) {
      res.status(HttpStatus.UNAUTHORIZED).json({ msg: 'Invalid API key' });
      return;
    }

    // read back with @GetOrgFromRequest / @GetApiKeyFromRequest
    Object.assign(req, { org: found.org, apiKey: found.apiKey });
    next();
  }
}
