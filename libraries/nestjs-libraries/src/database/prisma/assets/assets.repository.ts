import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRepository } from '@pocket3d/nestjs-libraries/database/prisma/prisma.service';

export interface NewAsset {
  id: string;
  organizationId: string;
  title: string;
  name: string;
  path: string;
  fileSize: number;
  coverName?: string;
  coverPath?: string;
  coverSize?: number;
}

// What anyone holding the link may see; storage keys stay internal
const publicFields = {
  id: true,
  title: true,
  path: true,
  coverPath: true,
  fileSize: true,
  createdAt: true,
} as const;

// Only for removing the files when a model is deleted
const storageFields = { id: true, path: true, coverPath: true } as const;

@Injectable()
export class AssetsRepository {
  constructor(private _asset: PrismaRepository<'asset'>) {}

  createAsset(data: NewAsset) {
    return this._asset.model.asset.create({
      data: {
        id: data.id,
        organizationId: data.organizationId,
        title: data.title,
        name: data.name,
        path: data.path,
        fileSize: data.fileSize,
        coverName: data.coverName || null,
        coverPath: data.coverPath || null,
        coverSize: data.coverSize ?? null,
      },
      select: publicFields,
    });
  }

  getPublicAsset(id: string) {
    return this._asset.model.asset.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: publicFields,
    });
  }

  // Bytes stored for the org's live models (model files + covers)
  async storageUsed(organizationId: string) {
    const { _sum } = await this._asset.model.asset.aggregate({
      where: { organizationId, deletedAt: null },
      _sum: { fileSize: true, coverSize: true },
    });
    return (_sum.fileSize || 0) + (_sum.coverSize || 0);
  }

  // Everything below is scoped by organizationId: an id from another org
  // matches nothing
  listForOrg(organizationId: string, skip: number, take: number) {
    const where: Prisma.AssetWhereInput = { organizationId, deletedAt: null };
    return Promise.all([
      this._asset.model.asset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: publicFields,
      }),
      this._asset.model.asset.count({ where }),
    ]);
  }

  async rename(organizationId: string, id: string, title: string) {
    const { count } = await this._asset.model.asset.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: { title },
    });
    return count ? this.getPublicAsset(id) : null;
  }

  async softDelete(organizationId: string, id: string) {
    const asset = await this._asset.model.asset.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: storageFields,
    });
    if (!asset) {
      return null;
    }
    await this._asset.model.asset.update({ where: { id }, data: { deletedAt: new Date() } });
    return asset;
  }

  async softDeleteAllForOrg(organizationId: string) {
    const where: Prisma.AssetWhereInput = { organizationId, deletedAt: null };
    const assets = await this._asset.model.asset.findMany({ where, select: storageFields });
    await this._asset.model.asset.updateMany({ where, data: { deletedAt: new Date() } });
    return assets;
  }
}
