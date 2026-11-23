import { Injectable } from '@nestjs/common';
import { VersionSource } from '@prisma/client';
import { PrismaRepository } from '@pocket3d/nestjs-libraries/database/prisma/prisma.service';

export interface NewUploadTicket {
  organizationId: string;
  tokenHash: string;
  title?: string;
  // set: the upload becomes a new version of this model (already checked to
  // belong to organizationId)
  assetId?: string;
  draft?: boolean;
  note?: string;
  source: VersionSource;
  sourceName?: string;
  expiresAt: Date;
}

// What a used link says about the upload it allows
const ticketFields = {
  title: true,
  assetId: true,
  draft: true,
  note: true,
  source: true,
  sourceName: true,
} as const;

@Injectable()
export class UploadTicketsRepository {
  constructor(private _uploadTicket: PrismaRepository<'uploadTicket'>) {}

  create(data: NewUploadTicket) {
    return this._uploadTicket.model.uploadTicket.create({
      data: {
        organizationId: data.organizationId,
        tokenHash: data.tokenHash,
        title: data.title || null,
        assetId: data.assetId || null,
        draft: !!(data.assetId && data.draft),
        note: data.note || null,
        source: data.source,
        sourceName: data.sourceName || null,
        expiresAt: data.expiresAt,
      },
      select: { id: true, expiresAt: true },
    });
  }

  // Atomic: of two uploads with the same link, exactly one gets through
  async claim(tokenHash: string) {
    const { count } = await this._uploadTicket.model.uploadTicket.updateMany({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
        organization: { deletedAt: null },
      },
      data: { usedAt: new Date() },
    });
    if (!count) {
      return null;
    }
    return this._uploadTicket.model.uploadTicket.findUnique({
      where: { tokenHash },
      select: { ...ticketFields, organization: { select: { id: true, name: true } } },
    });
  }

  // Read-only look at a link the browser upload page is about to use: it
  // answers only while the link would still be accepted, and doesn't burn it
  findUsable(tokenHash: string) {
    return this._uploadTicket.model.uploadTicket.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
        organization: { deletedAt: null },
      },
      select: { title: true, expiresAt: true, assetId: true, draft: true, note: true, organizationId: true },
    });
  }

  // Unused links of an org stop working (account deleted)
  expireAllForOrg(organizationId: string) {
    return this._uploadTicket.model.uploadTicket.updateMany({
      where: { organizationId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  // Housekeeping: links nobody can use any more
  purgeExpired() {
    return this._uploadTicket.model.uploadTicket.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
  }
}
