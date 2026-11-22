import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRepository } from '@pocket3d/nestjs-libraries/database/prisma/prisma.service';

export interface NewAccount {
  email: string;
  name: string | null;
  password: string;
  activated: boolean;
  organizationName: string;
}

export const REGISTRATION_CLOSED = 'Registration is closed on this instance';

@Injectable()
export class OrganizationsRepository {
  constructor(private _organization: PrismaRepository<'organization' | '$transaction'>) {}


  // One serializable transaction, so "is this the first account?" (for
  // DISABLE_REGISTRATION) and the new rows can't interleave with a concurrent
  // signup. Signup never takes over existing models
  createOrgAndUser(data: NewAccount, onlyIfFirst: boolean) {
    return this._organization.model.$transaction(
      async (tx) => {
        const isFirst = (await tx.user.count()) === 0;
        if (onlyIfFirst && !isFirst) {
          throw new ForbiddenException(REGISTRATION_CLOSED);
        }

        const organization = await tx.organization.create({
          data: {
            name: data.organizationName,
            users: {
              create: {
                role: 'ADMIN',
                user: {
                  create: {
                    email: data.email,
                    name: data.name,
                    password: data.password,
                    activated: data.activated,
                  },
                },
              },
            },
          },
          select: {
            id: true,
            name: true,
            users: { select: { user: { select: { id: true, email: true, name: true, activated: true } } } },
          },
        });

        return {
          organization: { id: organization.id, name: organization.name },
          user: organization.users[0].user,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  // The org a user acts as. One per user for now (teams come later)
  getOrgForUser(userId: string) {
    return this._organization.model.organization.findFirst({
      where: { deletedAt: null, users: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
  }

  softDelete(id: string) {
    return this._organization.model.organization.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
  }
}
