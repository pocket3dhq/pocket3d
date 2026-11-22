import { Injectable } from '@nestjs/common';
import { UploadTicketsRepository } from '@pocket3d/nestjs-libraries/database/prisma/upload-tickets/upload.tickets.repository';
import { hashSecret, makeUploadToken } from '@pocket3d/nestjs-libraries/services/secret.token';
import { AuthOrg } from '@pocket3d/nestjs-libraries/user/request.types';
import { mainUrl } from '@pocket3d/nestjs-libraries/services/main.url';

// Short and single use: the agent sees this URL, so it ends up in transcripts
export const UPLOAD_TICKET_TTL_MS = 10 * 60 * 1000;

// The URL an agent posts a file to with curl (MAIN_URL/api reaches the backend)
export const uploadLinkUrl = (token: string) => `${mainUrl()}/api/public/v1/uploads/${token}`;

// The same link as a page a person opens to drop the file in, for agents
// whose sandbox can't reach this server (Claude.ai, Claude Desktop)
export const uploadPageUrl = (token: string) => `${mainUrl()}/u/${token}`;

@Injectable()
export class UploadTicketsService {
  constructor(private _uploadTicketsRepository: UploadTicketsRepository) {}

  // The only time the token exists outside the caller
  async create(organizationId: string, title?: string) {
    const token = makeUploadToken();
    const ticket = await this._uploadTicketsRepository.create({
      organizationId,
      tokenHash: hashSecret(token),
      title: title?.trim() || undefined,
      expiresAt: new Date(Date.now() + UPLOAD_TICKET_TTL_MS),
    });
    return { url: uploadLinkUrl(token), page: uploadPageUrl(token), expiresAt: ticket.expiresAt };
  }

  // What the upload page shows before the file is sent (null: unknown, used
  // or expired). Doesn't burn the link
  peek(token?: string): Promise<{ title: string | null; expiresAt: Date } | null> {
    if (!token || token.length > 200) {
      return Promise.resolve(null);
    }
    return this._uploadTicketsRepository.findUsable(hashSecret(token));
  }

  // Burns the link and returns whose it is (null: unknown, used or expired)
  async claim(token?: string): Promise<{ org: AuthOrg; title: string | null } | null> {
    if (!token || token.length > 200) {
      return null;
    }
    const ticket = await this._uploadTicketsRepository.claim(hashSecret(token));
    return ticket ? { org: ticket.organization, title: ticket.title } : null;
  }

  expireAllForOrg(organizationId: string) {
    return this._uploadTicketsRepository.expireAllForOrg(organizationId);
  }

  purgeExpired() {
    return this._uploadTicketsRepository.purgeExpired();
  }
}
