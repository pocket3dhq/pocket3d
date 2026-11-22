import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { SessionsService } from '@pocket3d/nestjs-libraries/database/prisma/sessions/sessions.service';
import { readCookie, SESSION_COOKIE } from '@pocket3d/nestjs-libraries/services/cookies';

// The browser login (dashboard routes). The cookie is SameSite=Lax; on top
// of that, a request body must be JSON, which a cross-site <form> can't send
// (a CSRF defence that needs no token). Bodyless DELETEs pass:
// forms can't send DELETE
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private _sessionsService: SessionsService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Judged by Content-Type, not by req.is(): proxies (and some browsers)
    // send "Content-Length: 0" on a bodyless DELETE, which req.is() counts
    // as a body of unknown type
    const contentType = req.headers['content-type'];
    const json = !!contentType && !!req.is('application/json');
    if ((contentType && !json) || (BODY_METHODS.has(req.method) && !json)) {
      res.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE).json({ msg: 'Send JSON (Content-Type: application/json)' });
      return;
    }

    const session = await this._sessionsService.validate(readCookie(req, SESSION_COOKIE));
    if (!session) {
      res.status(HttpStatus.UNAUTHORIZED).json({ msg: 'Not signed in' });
      return;
    }

    // read back with @GetUserFromRequest / @GetOrgFromRequest / @GetSessionIdFromRequest
    Object.assign(req, { user: session.user, org: session.org, sessionId: session.sessionId });
    next();
  }
}
