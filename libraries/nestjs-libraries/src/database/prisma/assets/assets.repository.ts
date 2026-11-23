import { Injectable } from '@nestjs/common';
import { Prisma, VersionSource, VersionStatus } from '@prisma/client';
import { PrismaRepository } from '@pocket3d/nestjs-libraries/database/prisma/prisma.service';
import { MAX_VERSIONS_PER_MODEL } from '@pocket3d/helpers/utils/versions';

// A stored file the version points to (the storage engine wrote it already)
export interface NewVersionFiles {
  name: string;
  path: string;
  fileSize: number;
  coverName?: string;
  coverPath?: string;
  coverSize?: number;
}

// Who sent a version, and what came with it
export interface NewVersionMeta {
  note?: string | null;
  source?: VersionSource | null;
  sourceName?: string | null;
}

export interface NewAsset extends NewVersionFiles, NewVersionMeta {
  id: string;
  organizationId: string;
  title: string;
}

// A rule a version change broke, decided inside the transaction (which it
// rolls back). AssetsService turns it into the HTTP answer
export type VersionRule = 'model-not-found' | 'version-not-found' | 'full' | 'live' | 'last' | 'draft';
export class VersionRuleError extends Error {
  constructor(public rule: VersionRule, public number?: number) {
    super(rule);
  }
}

// What anyone holding the link may see of a version. Storage keys (name,
// coverName) and who sent it (sourceName) stay internal
const publicVersionFields = {
  number: true,
  path: true,
  coverPath: true,
  fileSize: true,
  note: true,
  source: true,
  createdAt: true,
  publishedAt: true,
} as const;

// What the owner sees: the above, plus drafts and where each one came from
const ownerVersionFields = { ...publicVersionFields, status: true, sourceName: true, coverSize: true } as const;

// Only for removing files when a version or a model is deleted
const storageFields = { path: true, coverPath: true } as const;

const assetFields = { id: true, title: true, createdAt: true, activityAt: true } as const;

export type PublicVersion = Prisma.AssetVersionGetPayload<{ select: typeof publicVersionFields }>;
export type OwnerVersion = Prisma.AssetVersionGetPayload<{ select: typeof ownerVersionFields }>;
export type StoredVersionFiles = Prisma.AssetVersionGetPayload<{ select: typeof storageFields }>;

// Versions are part of the model (the asset aggregate), so this repository
// reaches both tables and runs the transactions that keep them consistent.
//
// Every change to a model's versions starts with the same statement:
// an update of the model row scoped by { id, organizationId, deletedAt: null }.
// It checks the caller's org owns the model (another org, an ownerless model
// or a deleted one matches 0 rows), and it locks the row until the
// transaction ends, so changes to one model run one after the other. That is
// what keeps the version numbers distinct and the live version always a
// published, non-deleted version of this model
@Injectable()
export class AssetsRepository {
  constructor(private _db: PrismaRepository<'asset' | 'assetVersion' | '$transaction'>) {}

  // Locks the model row for the rest of the transaction; false when the org
  // doesn't own a live model with this id
  private async lock(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
    data: Prisma.AssetUpdateManyMutationInput
  ) {
    const { count } = await tx.asset.updateMany({ where: { id, organizationId, deletedAt: null }, data });
    return count > 0;
  }

  // A new model: its file becomes v1, published and live
  createAsset(data: NewAsset) {
    return this._db.model.$transaction(async (tx) => {
      const now = new Date();
      const asset = await tx.asset.create({
        data: { id: data.id, organizationId: data.organizationId, title: data.title, lastNumber: 1, activityAt: now },
        select: assetFields,
      });
      const version = await tx.assetVersion.create({
        data: {
          assetId: data.id,
          number: 1,
          ...this.versionData(data),
          status: VersionStatus.PUBLISHED,
          publishedAt: now,
        },
        select: { id: true, ...ownerVersionFields },
      });
      await tx.asset.update({ where: { id: data.id }, data: { liveVersionId: version.id } });
      // version.id is internal: AssetsService builds its answer field by field
      return { asset, version };
    });
  }

  // The next version of a model the org owns. A published one goes live at
  // once; a draft doesn't
  addVersion(organizationId: string, assetId: string, files: NewVersionFiles, meta: NewVersionMeta & { draft: boolean }) {
    return this._db.model.$transaction(async (tx) => {
      const now = new Date();
      if (!(await this.lock(tx, organizationId, assetId, { lastNumber: { increment: 1 }, activityAt: now }))) {
        throw new VersionRuleError('model-not-found');
      }
      const kept = await tx.assetVersion.count({ where: { assetId, deletedAt: null } });
      if (kept >= MAX_VERSIONS_PER_MODEL) {
        throw new VersionRuleError('full');
      }
      const asset = await tx.asset.findUniqueOrThrow({ where: { id: assetId }, select: { ...assetFields, lastNumber: true } });
      const version = await tx.assetVersion.create({
        data: {
          assetId,
          number: asset.lastNumber,
          ...this.versionData({ ...files, ...meta }),
          status: meta.draft ? VersionStatus.DRAFT : VersionStatus.PUBLISHED,
          publishedAt: meta.draft ? null : now,
        },
        select: { id: true, ...ownerVersionFields },
      });
      if (!meta.draft) {
        await tx.asset.update({ where: { id: assetId }, data: { liveVersionId: version.id } });
      }
      const live = await this.liveNumber(tx, assetId);
      return { asset, version, live };
    });
  }

  // DRAFT → PUBLISHED (once), and optionally live too
  publishDraft(organizationId: string, assetId: string, number: number, makeLive: boolean) {
    return this._db.model.$transaction(async (tx) => {
      const now = new Date();
      if (!(await this.lock(tx, organizationId, assetId, { activityAt: now }))) {
        throw new VersionRuleError('model-not-found');
      }
      const version = await this.findVersion(tx, assetId, number);
      if (version.status === VersionStatus.DRAFT) {
        await tx.assetVersion.update({
          where: { id: version.id },
          data: { status: VersionStatus.PUBLISHED, publishedAt: now },
        });
      }
      if (makeLive) {
        await tx.asset.update({ where: { id: assetId }, data: { liveVersionId: version.id } });
      }
    });
  }

  // Which published version /m/<id> shows (a rollback is just this)
  setLive(organizationId: string, assetId: string, number: number) {
    return this._db.model.$transaction(async (tx) => {
      if (!(await this.lock(tx, organizationId, assetId, { updatedAt: new Date() }))) {
        throw new VersionRuleError('model-not-found');
      }
      const version = await this.findVersion(tx, assetId, number);
      if (version.status !== VersionStatus.PUBLISHED) {
        throw new VersionRuleError('draft', number);
      }
      await tx.asset.update({ where: { id: assetId }, data: { liveVersionId: version.id } });
    });
  }

  // Drafts can always go. A published version can't while it is live, and
  // the last published one can't (the link has to show something). Returns
  // the files to remove once the transaction is committed
  deleteVersion(organizationId: string, assetId: string, number: number): Promise<StoredVersionFiles> {
    return this._db.model.$transaction(async (tx) => {
      if (!(await this.lock(tx, organizationId, assetId, { updatedAt: new Date() }))) {
        throw new VersionRuleError('model-not-found');
      }
      const version = await this.findVersion(tx, assetId, number);
      if (version.status === VersionStatus.PUBLISHED) {
        const published = await tx.assetVersion.count({
          where: { assetId, deletedAt: null, status: VersionStatus.PUBLISHED },
        });
        if (published <= 1) {
          throw new VersionRuleError('last', number);
        }
        const { liveVersionId } = await tx.asset.findUniqueOrThrow({ where: { id: assetId }, select: { liveVersionId: true } });
        if (liveVersionId === version.id) {
          throw new VersionRuleError('live', number);
        }
      }
      await tx.assetVersion.update({ where: { id: version.id }, data: { deletedAt: new Date() } });
      return { path: version.path, coverPath: version.coverPath };
    });
  }

  // The only thing a version lets you change. Scoped through its model
  async updateNote(organizationId: string, assetId: string, number: number, note: string | null) {
    const { count } = await this._db.model.assetVersion.updateMany({
      where: { assetId, number, deletedAt: null, asset: { id: assetId, organizationId, deletedAt: null } },
      data: { note },
    });
    return count > 0;
  }

  // Inside a locked transaction: a non-deleted version of the model
  private async findVersion(tx: Prisma.TransactionClient, assetId: string, number: number) {
    const version = await tx.assetVersion.findFirst({
      where: { assetId, number, deletedAt: null },
      select: { id: true, status: true, ...storageFields },
    });
    if (!version) {
      throw new VersionRuleError('version-not-found', number);
    }
    return version;
  }

  private async liveNumber(tx: Prisma.TransactionClient, assetId: string) {
    const asset = await tx.asset.findUniqueOrThrow({
      where: { id: assetId },
      select: { liveVersion: { select: { number: true } } },
    });
    return asset.liveVersion?.number ?? null;
  }

  private versionData(data: NewVersionFiles & NewVersionMeta) {
    return {
      name: data.name,
      path: data.path,
      fileSize: data.fileSize,
      coverName: data.coverName || null,
      coverPath: data.coverPath || null,
      coverSize: data.coverSize ?? null,
      note: data.note || null,
      source: data.source ?? null,
      sourceName: data.sourceName || null,
    };
  }

  // The model as anyone holding the link sees it: published versions only,
  // filtered here in the query so a draft can never reach the page
  getPublicAsset(id: string) {
    return this._db.model.asset.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...assetFields,
        liveVersion: { select: { number: true, status: true, deletedAt: true } },
        versions: {
          where: { deletedAt: null, status: VersionStatus.PUBLISHED },
          orderBy: { number: 'desc' },
          take: MAX_VERSIONS_PER_MODEL,
          select: publicVersionFields,
        },
      },
    });
  }

  // The model as its owner sees it: every version kept, drafts included
  getOwnedAsset(organizationId: string, id: string) {
    return this._db.model.asset.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: {
        ...assetFields,
        liveVersion: { select: { number: true, status: true, deletedAt: true } },
        versions: {
          where: { deletedAt: null },
          orderBy: { number: 'desc' },
          take: MAX_VERSIONS_PER_MODEL,
          select: ownerVersionFields,
        },
      },
    });
  }

  // Can the org add a version to this model? Its title and how many versions
  // it keeps, or null (not the org's, ownerless or deleted)
  async findForNewVersion(organizationId: string, id: string) {
    const asset = await this._db.model.asset.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!asset) {
      return null;
    }
    const kept = await this._db.model.assetVersion.count({ where: { assetId: id, deletedAt: null } });
    return { ...asset, kept };
  }

  // Bytes stored for the org's models: every version kept (drafts included),
  // model files and covers
  async storageUsed(organizationId: string) {
    const { _sum } = await this._db.model.assetVersion.aggregate({
      where: { deletedAt: null, asset: { organizationId, deletedAt: null } },
      _sum: { fileSize: true, coverSize: true },
    });
    return (_sum.fileSize || 0) + (_sum.coverSize || 0);
  }

  // One page of the org's models, recently changed first, with the live
  // version's file and the count of versions and drafts of each
  async listForOrg(organizationId: string, skip: number, take: number) {
    const where: Prisma.AssetWhereInput = { organizationId, deletedAt: null };
    const [assets, total] = await Promise.all([
      this._db.model.asset.findMany({
        where,
        orderBy: [{ activityAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
        select: {
          ...assetFields,
          liveVersion: { select: { number: true, path: true, coverPath: true, fileSize: true } },
        },
      }),
      this._db.model.asset.count({ where }),
    ]);
    const ids = assets.map((asset) => asset.id);
    const [counts, covers] = ids.length
      ? await Promise.all([
          this._db.model.assetVersion.groupBy({
            by: ['assetId', 'status'],
            where: { assetId: { in: ids }, deletedAt: null },
            _count: { _all: true },
          }),
          this.publishedCovers(ids),
        ])
      : [[], []];
    return { assets, total, counts, covers };
  }

  // Covers of published versions, newest first: a version without its own
  // cover borrows the newest one of an older published version
  publishedCovers(assetIds: string[]) {
    return this._db.model.assetVersion.findMany({
      where: {
        assetId: { in: assetIds },
        deletedAt: null,
        status: VersionStatus.PUBLISHED,
        coverPath: { not: null },
      },
      orderBy: { number: 'desc' },
      select: { assetId: true, number: true, coverPath: true },
    });
  }

  async rename(organizationId: string, id: string, title: string) {
    const { count } = await this._db.model.asset.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: { title },
    });
    return count > 0;
  }

  // The model and all its versions. Returns the files to remove once
  // committed (null: not the org's model)
  softDelete(organizationId: string, id: string): Promise<StoredVersionFiles[] | null> {
    return this._db.model.$transaction(async (tx) => {
      const now = new Date();
      if (!(await this.lock(tx, organizationId, id, { deletedAt: now }))) {
        return null;
      }
      return this.deleteVersionsOf(tx, [id], now);
    });
  }

  // Every model of the org (account deletion)
  softDeleteAllForOrg(organizationId: string): Promise<StoredVersionFiles[]> {
    return this._db.model.$transaction(async (tx) => {
      const now = new Date();
      const assets = await tx.asset.findMany({ where: { organizationId, deletedAt: null }, select: { id: true } });
      const ids = assets.map((asset) => asset.id);
      if (!ids.length) {
        return [];
      }
      // waits for any version being added to one of them (row locks), so
      // the versions read next include it
      await tx.asset.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: now } });
      return this.deleteVersionsOf(tx, ids, now);
    });
  }

  private async deleteVersionsOf(tx: Prisma.TransactionClient, assetIds: string[], now: Date) {
    const where: Prisma.AssetVersionWhereInput = { assetId: { in: assetIds }, deletedAt: null };
    const files = await tx.assetVersion.findMany({ where, select: storageFields });
    await tx.assetVersion.updateMany({ where, data: { deletedAt: now } });
    return files;
  }
}
