import { Injectable } from '@nestjs/common';
import { AuthTokenType } from '@prisma/client';
import { PrismaRepository } from '@pocket3d/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class AuthTokensRepository {
  constructor(private _authToken: PrismaRepository<'authToken'>) {}

  create(data: { userId: string; type: AuthTokenType; tokenHash: string; expiresAt: Date }) {
    return this._authToken.model.authToken.create({ data, select: { id: true } });
  }

  // Atomic: of two requests with the same link, exactly one gets the user
  async consume(type: AuthTokenType, tokenHash: string) {
    const { count } = await this._authToken.model.authToken.updateMany({
      where: { type, tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (!count) {
      return null;
    }
    return this._authToken.model.authToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });
  }

  // A new link replaces the older ones
  invalidateAll(userId: string, type: AuthTokenType) {
    return this._authToken.model.authToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });
  }
}
