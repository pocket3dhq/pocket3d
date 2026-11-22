import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiKeysRepository } from '@pocket3d/nestjs-libraries/database/prisma/api-keys/api.keys.repository';
import { apiKeyPrefix, hashSecret, makeApiKey } from '@pocket3d/nestjs-libraries/services/secret.token';
import { AuthApiKey, AuthOrg } from '@pocket3d/nestjs-libraries/user/request.types';

export const MAX_ACTIVE_API_KEYS = 25;
const TOUCH_EVERY_MS = 60_000;

@Injectable()
export class ApiKeysService {
  constructor(private _apiKeysRepository: ApiKeysRepository) {}

  // The only time the full key exists outside the caller's machine
  async create(organizationId: string, userId: string, name: string) {
    if ((await this._apiKeysRepository.countActive(organizationId)) >= MAX_ACTIVE_API_KEYS) {
      throw new BadRequestException(`You can have up to ${MAX_ACTIVE_API_KEYS} API keys. Revoke one first.`);
    }
    const key = makeApiKey();
    const created = await this._apiKeysRepository.create({
      organizationId,
      createdById: userId,
      name: name.trim(),
      prefix: apiKeyPrefix(key),
      keyHash: hashSecret(key),
    });
    return { ...created, key };
  }

  list(organizationId: string) {
    return this._apiKeysRepository.list(organizationId);
  }

  async revoke(organizationId: string, id: string) {
    const { count } = await this._apiKeysRepository.revoke(organizationId, id);
    if (!count) {
      throw new NotFoundException('API key not found');
    }
    return { revoked: true };
  }

  revokeAllForOrg(organizationId: string) {
    return this._apiKeysRepository.revokeAllForOrg(organizationId);
  }

  async validate(key?: string): Promise<{ apiKey: AuthApiKey; org: AuthOrg } | null> {
    if (!key) {
      return null;
    }
    const found = await this._apiKeysRepository.findActiveByHash(hashSecret(key));
    if (!found) {
      return null;
    }
    if (!found.lastUsedAt || Date.now() - found.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
      await this._apiKeysRepository.touch(found.id);
    }
    return {
      apiKey: { id: found.id, name: found.name, prefix: found.prefix },
      org: found.organization,
    };
  }
}
