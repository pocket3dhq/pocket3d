import { Injectable } from '@nestjs/common';
import { AuthTokenType } from '@prisma/client';
import { AuthTokensRepository } from '@pocket3d/nestjs-libraries/database/prisma/auth-tokens/auth.tokens.repository';
import { hashSecret, makeToken } from '@pocket3d/nestjs-libraries/services/secret.token';

export const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  ACTIVATE: 48 * 60 * 60 * 1000,
  RESET: 30 * 60 * 1000,
};

@Injectable()
export class AuthTokensService {
  constructor(private _authTokensRepository: AuthTokensRepository) {}

  // Returns the secret for the email link; only its hash is stored
  async issue(userId: string, type: AuthTokenType) {
    await this._authTokensRepository.invalidateAll(userId, type);
    const token = makeToken();
    await this._authTokensRepository.create({
      userId,
      type,
      tokenHash: hashSecret(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]),
    });
    return token;
  }

  async consume(type: AuthTokenType, token: string) {
    const found = await this._authTokensRepository.consume(type, hashSecret(token));
    return found?.userId ?? null;
  }
}
