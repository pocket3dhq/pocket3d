import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@pocket3d/nestjs-libraries/database/prisma/prisma.service';

// What the dashboard lists. Never the hash
const listFields = { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true } as const;

@Injectable()
export class ApiKeysRepository {
  constructor(private _apiKey: PrismaRepository<'apiKey'>) {}

  create(data: { organizationId: string; createdById: string; name: string; prefix: string; keyHash: string }) {
    return this._apiKey.model.apiKey.create({ data, select: listFields });
  }

  list(organizationId: string) {
    return this._apiKey.model.apiKey.findMany({
      where: { organizationId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: listFields,
    });
  }

  countActive(organizationId: string) {
    return this._apiKey.model.apiKey.count({ where: { organizationId, revokedAt: null } });
  }

  // Scoped by org: a key id from another org matches nothing
  revoke(organizationId: string, id: string) {
    return this._apiKey.model.apiKey.updateMany({
      where: { id, organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  revokeAllForOrg(organizationId: string) {
    return this._apiKey.model.apiKey.updateMany({
      where: { organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  findActiveByHash(keyHash: string) {
    return this._apiKey.model.apiKey.findFirst({
      where: {
        keyHash,
        revokedAt: null,
        organization: { deletedAt: null },
        createdBy: { deletedAt: null },
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        organization: { select: { id: true, name: true } },
      },
    });
  }

  touch(id: string) {
    return this._apiKey.model.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
      select: { id: true },
    });
  }
}
