import { Injectable } from '@nestjs/common';
import { NewAccount, OrganizationsRepository } from '@pocket3d/nestjs-libraries/database/prisma/organizations/organizations.repository';

@Injectable()
export class OrganizationsService {
  constructor(private _organizationsRepository: OrganizationsRepository) {}

  createOrgAndUser(data: NewAccount, onlyIfFirst: boolean) {
    return this._organizationsRepository.createOrgAndUser(data, onlyIfFirst);
  }

  getOrgForUser(userId: string) {
    return this._organizationsRepository.getOrgForUser(userId);
  }

  softDelete(id: string) {
    return this._organizationsRepository.softDelete(id);
  }
}
