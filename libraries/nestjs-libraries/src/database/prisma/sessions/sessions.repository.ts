import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@pocket3d/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class SessionsRepository {
  constructor(private _session: PrismaRepository<'session'>) {}

  create(data: { userId: string; tokenHash: string; userAgent?: string; expiresAt: Date }) {
    return this._session.model.session.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        userAgent: data.userAgent?.slice(0, 255) || null,
        expiresAt: data.expiresAt,
      },
      select: { id: true },
    });
  }

  // A live session of a live, activated user, with the org they act as
  findValid(tokenHash: string) {
    return this._session.model.session.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: new Date() },
        user: { deletedAt: null, activated: true },
      },
      select: {
        id: true,
        lastUsedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            organizations: {
              where: { organization: { deletedAt: null } },
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: { organization: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
  }

  touch(id: string) {
    return this._session.model.session.update({
      where: { id },
      data: { lastUsedAt: new Date() },
      select: { id: true },
    });
  }

  deleteByHash(tokenHash: string) {
    return this._session.model.session.deleteMany({ where: { tokenHash } });
  }

  deleteAllForUser(userId: string, exceptId?: string) {
    return this._session.model.session.deleteMany({
      where: { userId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
  }

  purgeExpired() {
    return this._session.model.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  }
}
