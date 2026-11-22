import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@pocket3d/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class UploadTicketsRepository {
  constructor(private _uploadTicket: PrismaRepository<'uploadTicket'>) {}

  create(data: { organizationId: string; tokenHash: string; title?: string; expiresAt: Date }) {
    return this._uploadTicket.model.uploadTicket.create({
      data: { ...data, title: data.title || null },
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
      select: { title: true, organization: { select: { id: true, name: true } } },
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
      select: { title: true, expiresAt: true },
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
