import { Injectable } from '@nestjs/common';
import { UsersRepository } from '@pocket3d/nestjs-libraries/database/prisma/users/users.repository';

@Injectable()
export class UsersService {
  constructor(private _usersRepository: UsersRepository) {}

  getCredentialsByEmail(email: string) {
    return this._usersRepository.getCredentialsByEmail(email.trim().toLowerCase());
  }

  getCredentialsById(id: string) {
    return this._usersRepository.getCredentialsById(id);
  }

  emailExists(email: string) {
    return this._usersRepository.emailExists(email.trim().toLowerCase());
  }

  count() {
    return this._usersRepository.count();
  }

  activate(id: string) {
    return this._usersRepository.activate(id);
  }

  updateName(id: string, name?: string | null) {
    return this._usersRepository.updateName(id, name?.trim() || null);
  }

  updatePassword(id: string, passwordHash: string) {
    return this._usersRepository.updatePassword(id, passwordHash);
  }

  softDelete(id: string) {
    return this._usersRepository.softDelete(id);
  }
}
