import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@pocket3d/nestjs-libraries/database/prisma/prisma.service';

// What the account page shows
const selfFields = { id: true, email: true, name: true } as const;
// Only for checking credentials inside the server
const credentialFields = { ...selfFields, password: true, activated: true } as const;

@Injectable()
export class UsersRepository {
  constructor(private _user: PrismaRepository<'user'>) {}

  getCredentialsByEmail(email: string) {
    return this._user.model.user.findFirst({
      where: { email, deletedAt: null },
      select: credentialFields,
    });
  }

  getCredentialsById(id: string) {
    return this._user.model.user.findFirst({
      where: { id, deletedAt: null },
      select: credentialFields,
    });
  }

  emailExists(email: string) {
    return this._user.model.user
      .count({ where: { email } })
      .then((count) => count > 0);
  }

  count() {
    return this._user.model.user.count();
  }

  activate(id: string) {
    return this._user.model.user.update({
      where: { id },
      data: { activated: true },
      select: selfFields,
    });
  }

  updateName(id: string, name: string | null) {
    return this._user.model.user.update({
      where: { id },
      data: { name },
      select: selfFields,
    });
  }

  updatePassword(id: string, password: string) {
    return this._user.model.user.update({
      where: { id },
      data: { password },
      select: { id: true },
    });
  }

  // The address is freed (rewritten to a unique placeholder), so the person
  // can sign up again with it later
  softDelete(id: string) {
    return this._user.model.user.update({
      where: { id },
      data: { deletedAt: new Date(), email: `deleted-${id}@deleted.invalid`, password: '' },
      select: { id: true },
    });
  }
}
