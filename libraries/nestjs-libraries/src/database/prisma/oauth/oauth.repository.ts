import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@pocket3d/nestjs-libraries/database/prisma/prisma.service';

// What the consent page and the token endpoint need. Never the secret hash
// outside verifyClientSecret
const clientFields = {
  id: true,
  clientId: true,
  name: true,
  redirectUris: true,
  tokenEndpointAuthMethod: true,
  createdAt: true,
} as const;

// "Connected apps" in the dashboard. Never a hash
const grantListFields = {
  id: true,
  createdAt: true,
  lastUsedAt: true,
  client: { select: { name: true } },
} as const;

export interface NewTokens {
  accessTokenHash: string;
  accessExpiresAt: Date;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class OAuthRepository {
  constructor(private _oauth: PrismaRepository<'oAuthClient' | 'oAuthGrant'>) {}

  createClient(data: {
    clientId: string;
    clientSecretHash?: string;
    tokenEndpointAuthMethod: string;
    name: string;
    redirectUris: string[];
  }) {
    return this._oauth.model.oAuthClient.create({ data, select: clientFields });
  }

  findClient(clientId: string) {
    return this._oauth.model.oAuthClient.findUnique({ where: { clientId }, select: clientFields });
  }

  async clientSecretHash(clientId: string) {
    const client = await this._oauth.model.oAuthClient.findUnique({
      where: { clientId },
      select: { clientSecretHash: true },
    });
    return client?.clientSecretHash ?? null;
  }

  // Registration happens before consent: clients nobody ever approved are noise
  deleteStaleClients(before: Date) {
    return this._oauth.model.oAuthClient.deleteMany({
      where: { createdAt: { lt: before }, grants: { none: {} } },
    });
  }

  createGrant(data: {
    clientId: string; // OAuthClient.id
    userId: string;
    organizationId: string;
    codeHash: string;
    codeExpiresAt: Date;
    codeChallenge: string;
    redirectUri: string;
  }) {
    return this._oauth.model.oAuthGrant.create({ data, select: { id: true } });
  }

  // Atomic: a code works once. The caller checks expiry, PKCE and the client
  // after the code is burned, so a failed attempt can't be retried
  async consumeCode(codeHash: string) {
    const grant = await this._oauth.model.oAuthGrant.findUnique({
      where: { codeHash },
      select: {
        id: true,
        codeExpiresAt: true,
        codeChallenge: true,
        redirectUri: true,
        revokedAt: true,
        client: { select: { clientId: true } },
      },
    });
    if (!grant) {
      return null;
    }
    const { count } = await this._oauth.model.oAuthGrant.updateMany({
      where: { id: grant.id, codeHash },
      data: { codeHash: null, codeExpiresAt: null },
    });
    return count ? grant : null;
  }

  setTokens(id: string, tokens: NewTokens) {
    return this._oauth.model.oAuthGrant.update({ where: { id }, data: tokens, select: { id: true } });
  }

  findByRefreshHash(refreshTokenHash: string) {
    return this._oauth.model.oAuthGrant.findUnique({
      where: { refreshTokenHash },
      select: {
        id: true,
        refreshExpiresAt: true,
        revokedAt: true,
        client: { select: { clientId: true } },
        organization: { select: { deletedAt: true } },
        user: { select: { deletedAt: true } },
      },
    });
  }

  // Atomic rotation: of two refreshes with the same token, one wins
  async rotate(id: string, oldRefreshHash: string, tokens: NewTokens) {
    const { count } = await this._oauth.model.oAuthGrant.updateMany({
      where: { id, refreshTokenHash: oldRefreshHash, revokedAt: null },
      data: tokens,
    });
    return count === 1;
  }

  findActiveByAccessHash(accessTokenHash: string) {
    return this._oauth.model.oAuthGrant.findFirst({
      where: {
        accessTokenHash,
        revokedAt: null,
        accessExpiresAt: { gt: new Date() },
        organization: { deletedAt: null },
        user: { deletedAt: null },
      },
      select: {
        id: true,
        lastUsedAt: true,
        organization: { select: { id: true, name: true } },
        client: { select: { name: true } },
      },
    });
  }

  touch(id: string) {
    return this._oauth.model.oAuthGrant.update({
      where: { id },
      data: { lastUsedAt: new Date() },
      select: { id: true },
    });
  }

  // Only grants that turned into tokens: an abandoned consent is not an app
  listForUser(userId: string, organizationId: string) {
    return this._oauth.model.oAuthGrant.findMany({
      where: { userId, organizationId, revokedAt: null, refreshTokenHash: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: grantListFields,
    });
  }

  // Scoped by user and org: an id from someone else matches nothing
  revokeForUser(userId: string, organizationId: string, id: string) {
    return this._oauth.model.oAuthGrant.updateMany({
      where: { id, userId, organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // RFC 7009: whoever holds a token may revoke it
  revokeByTokenHash(tokenHash: string) {
    return this._oauth.model.oAuthGrant.updateMany({
      where: {
        revokedAt: null,
        OR: [{ accessTokenHash: tokenHash }, { refreshTokenHash: tokenHash }],
      },
      data: { revokedAt: new Date() },
    });
  }

  revokeAllForOrg(organizationId: string) {
    return this._oauth.model.oAuthGrant.updateMany({
      where: { organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
