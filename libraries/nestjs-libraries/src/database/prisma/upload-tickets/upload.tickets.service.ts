import { BadRequestException, Injectable } from '@nestjs/common';
import { VersionSource } from '@prisma/client';
import { UploadTicketsRepository } from '@pocket3d/nestjs-libraries/database/prisma/upload-tickets/upload.tickets.repository';
import { AssetsService } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.service';
import { hashSecret, makeUploadToken } from '@pocket3d/nestjs-libraries/services/secret.token';
import { AuthOrg } from '@pocket3d/nestjs-libraries/user/request.types';
import { mainUrl } from '@pocket3d/nestjs-libraries/services/main.url';
import { cleanNote } from '@pocket3d/helpers/utils/versions';

// Short and single use: the agent sees this URL, so it ends up in transcripts
export const UPLOAD_TICKET_TTL_MS = 10 * 60 * 1000;

// The URL an agent posts a file to with curl (MAIN_URL/api reaches the backend)
export const uploadLinkUrl = (token: string) => `${mainUrl()}/api/public/v1/uploads/${token}`;

// The same link as a page a person opens to drop the file in, for agents
// whose sandbox can't reach this server (Claude.ai, Claude Desktop)
export const uploadPageUrl = (token: string) => `${mainUrl()}/u/${token}`;

export interface UploadLinkOptions {
  // a new model's title (not with `model`)
  title?: string;
  // the id or link of a model of this org: the upload becomes its next version
  model?: string;
  draft?: boolean;
  note?: string;
  source: VersionSource;
  sourceName?: string;
}

// What a used link allows: a new model, or a version of one model
export interface ClaimedTicket {
  org: AuthOrg;
  title: string | null;
  assetId: string | null;
  draft: boolean;
  note: string | null;
  source: VersionSource;
  sourceName: string | null;
}

@Injectable()
export class UploadTicketsService {
  constructor(
    private _uploadTicketsRepository: UploadTicketsRepository,
    private _assetsService: AssetsService
  ) {}

  // The only time the token exists outside the caller. A link for a new
  // version is only made for a model the org owns (checked here, and again
  // when the upload comes in)
  async create(organizationId: string, options: UploadLinkOptions) {
    const title = options.title?.trim() || undefined;
    let model: { id: string; title: string; url: string } | undefined;
    if (options.model) {
      if (title) {
        throw new BadRequestException(
          'title is for new models; a new version keeps the model title (rename it with rename_model).'
        );
      }
      model = await this._assetsService.checkVersionTarget(organizationId, options.model);
    } else if (options.draft) {
      throw new BadRequestException("A new model can't be a draft: pass the model to add a draft to.");
    }
    const token = makeUploadToken();
    const ticket = await this._uploadTicketsRepository.create({
      organizationId,
      tokenHash: hashSecret(token),
      title,
      assetId: model?.id,
      draft: !!(model && options.draft),
      note: cleanNote(options.note) || undefined,
      source: options.source,
      sourceName: options.sourceName,
      expiresAt: new Date(Date.now() + UPLOAD_TICKET_TTL_MS),
    });
    return {
      url: uploadLinkUrl(token),
      page: uploadPageUrl(token),
      expiresAt: ticket.expiresAt,
      model: model ? { id: model.id, title: model.title, url: model.url } : null,
      draft: !!(model && options.draft),
    };
  }

  // What the upload page shows before the file is sent (null: unknown, used
  // or expired). Doesn't burn the link
  async peek(token?: string) {
    if (!token || token.length > 200) {
      return null;
    }
    const ticket = await this._uploadTicketsRepository.findUsable(hashSecret(token));
    if (!ticket) {
      return null;
    }
    let model: { title: string; url: string } | null = null;
    if (ticket.assetId) {
      try {
        const target = await this._assetsService.checkVersionTarget(ticket.organizationId, ticket.assetId);
        model = { title: target.title, url: target.url };
      } catch {
        // deleted since (or full): the upload itself will say so
        model = null;
      }
    }
    return {
      title: ticket.title,
      expiresAt: ticket.expiresAt,
      model,
      forVersion: !!ticket.assetId,
      draft: ticket.draft,
      note: ticket.note,
    };
  }

  // Burns the link and returns what it allows (null: unknown, used or expired)
  async claim(token?: string): Promise<ClaimedTicket | null> {
    if (!token || token.length > 200) {
      return null;
    }
    const ticket = await this._uploadTicketsRepository.claim(hashSecret(token));
    return ticket
      ? {
          org: ticket.organization,
          title: ticket.title,
          assetId: ticket.assetId,
          draft: ticket.draft,
          note: ticket.note,
          source: ticket.source,
          sourceName: ticket.sourceName,
        }
      : null;
  }

  expireAllForOrg(organizationId: string) {
    return this._uploadTicketsRepository.expireAllForOrg(organizationId);
  }

  purgeExpired() {
    return this._uploadTicketsRepository.purgeExpired();
  }
}
