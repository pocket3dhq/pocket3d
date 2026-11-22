import { Injectable } from '@nestjs/common';
import { SessionsRepository } from '@pocket3d/nestjs-libraries/database/prisma/sessions/sessions.repository';
import { hashSecret, makeToken } from '@pocket3d/nestjs-libraries/services/secret.token';
import { SESSION_TTL_MS } from '@pocket3d/nestjs-libraries/services/cookies';
import { AuthOrg, AuthUser } from '@pocket3d/nestjs-libraries/user/request.types';

// lastUsedAt is a hint for the people, not an audit log: one write a minute
const TOUCH_EVERY_MS = 60_000;

export interface ValidSession {
  sessionId: string;
  user: AuthUser;
  org: AuthOrg;
}

@Injectable()
export class SessionsService {
  constructor(private _sessionsRepository: SessionsRepository) {}

  // Returns the cookie value; only its hash is stored
  async create(userId: string, userAgent?: string) {
    const token = makeToken();
    await this._sessionsRepository.create({
      userId,
      tokenHash: hashSecret(token),
      userAgent,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    return token;
  }

  async validate(token?: string): Promise<ValidSession | null> {
    if (!token) {
      return null;
    }
    const session = await this._sessionsRepository.findValid(hashSecret(token));
    const org = session?.user.organizations[0]?.organization;
    if (!session || !org) {
      return null;
    }
    if (Date.now() - session.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
      await this._sessionsRepository.touch(session.id);
    }
    return {
      sessionId: session.id,
      user: { id: session.user.id, email: session.user.email, name: session.user.name },
      org,
    };
  }

  destroy(token?: string) {
    if (!token) {
      return;
    }
    return this._sessionsRepository.deleteByHash(hashSecret(token));
  }

  destroyAllForUser(userId: string, exceptSessionId?: string) {
    return this._sessionsRepository.deleteAllForUser(userId, exceptSessionId);
  }

  purgeExpired() {
    return this._sessionsRepository.purgeExpired();
  }
}
