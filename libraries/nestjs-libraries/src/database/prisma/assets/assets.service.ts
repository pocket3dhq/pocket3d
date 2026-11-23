import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { VersionSource, VersionStatus } from '@prisma/client';
import {
  AssetsRepository,
  OwnerVersion,
  PublicVersion,
  StatKind,
  StoredVersionFiles,
  VersionRuleError,
} from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.repository';
import { CreateAssetDto, TITLE_MAX_LENGTH } from '@pocket3d/nestjs-libraries/dtos/assets/create.asset.dto';
import { ASSET_ID_LENGTH, isAssetId, makeId } from '@pocket3d/nestjs-libraries/services/make.id';
import { UploadFactory } from '@pocket3d/nestjs-libraries/upload/upload.factory';
import { ASSET_UPLOAD_RULES } from '@pocket3d/nestjs-libraries/upload/custom.upload.validation';
import { uploadFromUrl } from '@pocket3d/nestjs-libraries/upload/remote.fetch';
import { CreateAssetFromUrlDto } from '@pocket3d/nestjs-libraries/dtos/assets/create.asset.from.url.dto';
import { mainUrl } from '@pocket3d/nestjs-libraries/services/main.url';
import { formatBytes, storageLimitBytes } from '@pocket3d/nestjs-libraries/services/storage.limit';
import {
  cleanNote,
  MAX_VERSIONS_PER_MODEL,
  versionNumberFrom,
} from '@pocket3d/helpers/utils/versions';

// A file as the multer stream engine stored it
export interface StoredFile {
  filename: string;
  path: string;
  size: number;
  originalname?: string;
}

// Who sent a version: shown as an icon to everyone, and by name to the owner
export interface VersionOrigin {
  source: VersionSource | null;
  // the API key's or the connected app's name
  sourceName?: string | null;
}

export interface NewVersionOptions {
  note?: string | null;
  draft?: boolean;
  origin: VersionOrigin;
}

export const ASSETS_PAGE_SIZE = 24;

// Downloads the server runs at once for one account (publish_from_url and
// POST /public/v1/assets/from-url, new models and new versions alike). Each
// can take minutes, which the rate limits (they count requests) don't bound
export const MAX_DOWNLOADS_PER_ORG = 3;

// Agents pass whatever they have: the id, or the share link (…/m/<id>,
// …/m/<id>?v=3, or the dashboard's …/dashboard/m/<id>)
export const assetIdFrom = (ref: string): string => {
  const trimmed = (ref || '').trim();
  const link = trimmed.match(/\/m\/([A-Za-z0-9]{12})(?:[/?#]|$)/);
  return link ? link[1] : trimmed;
};

const STATUS_LABEL = { [VersionStatus.DRAFT]: 'draft', [VersionStatus.PUBLISHED]: 'published' } as const;
const SOURCE_LABEL = { [VersionSource.DASHBOARD]: 'dashboard', [VersionSource.API]: 'api', [VersionSource.MCP]: 'mcp' } as const;
const sourceLabel = (source: VersionSource | null) => (source ? SOURCE_LABEL[source] : null);

// The newest cover among published versions up to `number`, so a version
// published without a cover keeps the link preview of the one before it.
// `versions` are newest first
const coverFor = (versions: { number: number; coverPath: string | null }[], number: number) =>
  versions.find((version) => version.number <= number && version.coverPath)?.coverPath ?? null;

// The owner's "last 7 days" counts: today and the 6 days before (UTC)
export const RECENT_STAT_DAYS = 7;

// Midnight UTC of the day `at` falls in (the stats are kept per UTC day)
export const utcDay = (at: Date = new Date()) =>
  new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));

@Injectable()
export class AssetsService {
  private readonly _logger = new Logger(AssetsService.name);
  // org id → downloads running (one backend process, like the rate limits)
  private readonly _downloads = new Map<string, number>();

  constructor(private _assetsRepository: AssetsRepository) {}

  // The link people open: MAIN_URL/m/<id>
  shareUrl(id: string) {
    return `${mainUrl()}/m/${id}`;
  }

  // A link that keeps showing this version after newer ones go live
  versionUrl(id: string, number: number) {
    return `${this.shareUrl(id)}?v=${number}`;
  }

  // Where the owner looks at a version (the only place a draft can be seen)
  previewUrl(id: string, number: number) {
    return `${mainUrl()}/dashboard/m/${id}?v=${number}`;
  }

  async createAsset(
    organizationId: string,
    body: CreateAssetDto,
    file?: StoredFile,
    cover?: StoredFile,
    origin: VersionOrigin = { source: null }
  ) {
    if (!file) {
      // only a cover came in; it is already stored, so drop it
      await this.removeStored(cover);
      throw new BadRequestException('No model file provided (multipart field "file").');
    }

    try {
      if (body.draft) {
        // refused rather than ignored: the caller meant to keep it private
        throw new BadRequestException(
          "A new model can't be a draft: its link has to show something. Publish it, then add drafts to it (POST /public/v1/assets/{id}/versions with draft=true)."
        );
      }
      // Checked again now that the real sizes are known (the guard only
      // knew the org was under its limit before the upload)
      await this.assertRoomFor(organizationId, file.size + (cover?.size || 0));
      const { asset, version } = await this._assetsRepository.createAsset({
        id: makeId(ASSET_ID_LENGTH),
        organizationId,
        title: body.title || this.titleFromFileName(file.originalname),
        name: file.filename,
        path: file.path,
        fileSize: file.size,
        coverName: cover?.filename,
        coverPath: cover?.path,
        coverSize: cover?.size,
        note: cleanNote(body.note) || null,
        source: origin.source,
        sourceName: origin.sourceName,
      });
      return {
        id: asset.id,
        title: asset.title,
        path: version.path,
        coverPath: version.coverPath,
        fileSize: version.fileSize,
        createdAt: asset.createdAt,
        url: this.shareUrl(asset.id),
        version: version.number,
        status: STATUS_LABEL[version.status],
      };
    } catch (err) {
      // the files are in storage already; without a record nothing points at them
      await this.removeStored(file);
      await this.removeStored(cover);
      throw err;
    }
  }

  // A model that is already on the web: downloaded by the server through
  // remote.fetch (public addresses only), then the same path as an upload
  createFromUrl(organizationId: string, body: CreateAssetFromUrlDto, origin: VersionOrigin = { source: null }) {
    return this.withDownloadSlot(organizationId, async () => {
      await this.assertRoomFor(organizationId, 1);
      const { file, cover } = await this.download(body.url, body.coverUrl);
      return this.createAsset(organizationId, { title: body.title, note: body.note }, file, cover, origin);
    });
  }

  // The org's model a new version will go to, checked before any byte of it
  // is stored or downloaded: 404 when the org doesn't own it (another org's,
  // ownerless or deleted), 409 when it keeps the most versions it can. The
  // transaction that adds the version checks again
  async checkVersionTarget(organizationId: string, ref: string) {
    const id = assetIdFrom(ref);
    const found = isAssetId(id) ? await this._assetsRepository.findForNewVersion(organizationId, id) : null;
    if (!found) {
      throw new NotFoundException('Model not found');
    }
    if (found.kept >= MAX_VERSIONS_PER_MODEL) {
      throw this.httpError(new VersionRuleError('full'));
    }
    return { id: found.id, title: found.title, url: this.shareUrl(found.id) };
  }

  // A new version of a model the org owns. Published (the default) it goes
  // live at once; a draft stays private until it is published
  async addVersion(
    organizationId: string,
    ref: string,
    files: { file?: StoredFile; cover?: StoredFile },
    options: NewVersionOptions
  ) {
    const { file, cover } = files;
    if (!file) {
      await this.removeStored(cover);
      throw new BadRequestException('No model file provided (multipart field "file").');
    }
    try {
      const id = assetIdFrom(ref);
      if (!isAssetId(id)) {
        throw new NotFoundException('Model not found');
      }
      await this.assertRoomFor(organizationId, file.size + (cover?.size || 0));
      const { asset, version, live } = await this._assetsRepository.addVersion(
        organizationId,
        id,
        {
          name: file.filename,
          path: file.path,
          fileSize: file.size,
          coverName: cover?.filename,
          coverPath: cover?.path,
          coverSize: cover?.size,
        },
        {
          note: cleanNote(options.note) || null,
          draft: !!options.draft,
          source: options.origin.source,
          sourceName: options.origin.sourceName,
        }
      );
      const draft = version.status === VersionStatus.DRAFT;
      return {
        id: asset.id,
        title: asset.title,
        url: this.shareUrl(asset.id),
        version: version.number,
        status: STATUS_LABEL[version.status],
        live,
        ...(draft
          ? { previewUrl: this.previewUrl(asset.id, version.number) }
          : { versionUrl: this.versionUrl(asset.id, version.number) }),
        path: version.path,
        coverPath: version.coverPath,
        fileSize: version.fileSize,
        note: version.note,
        createdAt: version.createdAt,
      };
    } catch (err) {
      // stored already; nothing will point at them
      await this.removeStored(file);
      await this.removeStored(cover);
      throw this.httpError(err);
    }
  }

  // A new version from a .glb on the web. The model is checked before the
  // download starts, so a wrong id costs nothing
  async addVersionFromUrl(
    organizationId: string,
    ref: string,
    body: { url: string; coverUrl?: string; note?: string; draft?: boolean },
    origin: VersionOrigin
  ) {
    const target = await this.checkVersionTarget(organizationId, ref);
    return this.withDownloadSlot(organizationId, async () => {
      await this.assertRoomFor(organizationId, 1);
      const { file, cover } = await this.download(body.url, body.coverUrl);
      return this.addVersion(organizationId, target.id, { file, cover }, { note: body.note, draft: body.draft, origin });
    });
  }

  // A draft becomes part of the public history; with `live`, also what the
  // link shows
  async publishDraft(organizationId: string, ref: string, versionRef: unknown, live = false) {
    const id = this.ownedId(ref);
    const number = this.versionNumber(versionRef);
    await this._assetsRepository.publishDraft(organizationId, id, number, live).catch((err) => {
      throw this.httpError(err);
    });
    return this.versionState(organizationId, id, number);
  }

  // Which published version the link shows (rolling back is this too)
  async setLive(organizationId: string, ref: string, versionRef: unknown) {
    const id = this.ownedId(ref);
    const number = this.versionNumber(versionRef);
    await this._assetsRepository.setLive(organizationId, id, number).catch((err) => {
      throw this.httpError(err);
    });
    return this.versionState(organizationId, id, number);
  }

  // Removes one version and its files. Links pinned to it (?v=N) show the
  // live version from now on
  async deleteVersion(organizationId: string, ref: string, versionRef: unknown) {
    const id = this.ownedId(ref);
    const number = this.versionNumber(versionRef);
    const files = await this._assetsRepository.deleteVersion(organizationId, id, number).catch((err) => {
      throw this.httpError(err);
    });
    await this.removeFiles([files]);
    return { deleted: true, id, version: number };
  }

  async updateNote(organizationId: string, ref: string, versionRef: unknown, note: unknown) {
    const id = this.ownedId(ref);
    const number = this.versionNumber(versionRef);
    const updated = await this._assetsRepository.updateNote(organizationId, id, number, cleanNote(note) || null);
    if (!updated) {
      const owned = await this._assetsRepository.getOwnedAsset(organizationId, id);
      throw owned ? this.httpError(new VersionRuleError('version-not-found', number)) : new NotFoundException('Model not found');
    }
    return this.versionState(organizationId, id, number);
  }

  // The dashboard's and the API's PUT: a new title, a new live version,
  // the download switch, or any of them together
  async update(
    organizationId: string,
    ref: string,
    changes: { title?: string; liveVersion?: unknown; allowDownload?: boolean }
  ) {
    const hasTitle = typeof changes.title === 'string';
    const hasLive = changes.liveVersion !== undefined && changes.liveVersion !== null;
    const hasDownload = typeof changes.allowDownload === 'boolean';
    if (!hasTitle && !hasLive && !hasDownload) {
      throw new BadRequestException('Nothing to change: send a title, a liveVersion, allowDownload, or several.');
    }
    if (hasLive) {
      await this.setLive(organizationId, ref, changes.liveVersion);
    }
    if (hasDownload) {
      await this.setAllowDownload(organizationId, ref, changes.allowDownload as boolean);
    }
    if (hasTitle) {
      return this.rename(organizationId, ref, changes.title as string);
    }
    return this.getSummary(organizationId, ref);
  }

  // Whether the share link shows a Download button (MCP set_model_downloads,
  // the CLI's `downloads on|off`, the dashboard switch)
  async setAllowDownload(organizationId: string, ref: string, allowDownload: boolean) {
    const id = assetIdFrom(ref);
    const done = isAssetId(id) ? await this._assetsRepository.setAllowDownload(organizationId, id, allowDownload) : false;
    if (!done) {
      throw new NotFoundException('Model not found');
    }
    return this.getSummary(organizationId, id);
  }

  // A view of the share link or a click on its Download button, sent by the
  // viewer page. Counts nothing for an unknown, deleted or ownerless model,
  // for the owner's own visits (viewerOrgId: the signed-in visitor's org), or
  // for a download while downloads are off. Never throws: the caller answers
  // the same either way, so a beacon can't tell whether a model exists
  async recordStat(id: string, kind: StatKind, viewerOrgId?: string | null) {
    try {
      if (!isAssetId(id)) return false;
      const target = await this._assetsRepository.findStatTarget(id);
      if (!target?.organizationId || target.organizationId === viewerOrgId) return false;
      if (kind === 'downloads' && !target.allowDownload) return false;
      await this._assetsRepository.incrementStat(id, utcDay(), kind);
      return true;
    } catch (err) {
      this._logger.warn(`Could not count a ${kind === 'views' ? 'view' : 'download'} of ${id}: ${(err as Error).message}`);
      return false;
    }
  }

  // What /m/<id> shows to anyone with the link: published versions only.
  // `requested` (?v=N) picks one; a deleted or draft number shows the live
  // version instead, with `missing`, so a pinned link keeps working and
  // never tells whether a draft exists
  async getPublicView(id: string, requested?: number) {
    if (!isAssetId(id)) {
      return null;
    }
    const asset = await this._assetsRepository.getPublicAsset(id);
    if (!asset || !asset.versions.length) {
      return null;
    }
    const live = this.liveNumber(asset.id, asset.liveVersion, asset.versions);
    const pinned = requested ? asset.versions.find((version) => version.number === requested) : undefined;
    const shown = pinned || asset.versions.find((version) => version.number === live) || asset.versions[0];
    return {
      id: asset.id,
      title: asset.title,
      createdAt: asset.createdAt,
      allowDownload: asset.allowDownload,
      // the shown version's file (what the page loads)
      path: shown.path,
      coverPath: shown.coverPath,
      fileSize: shown.fileSize,
      live,
      shown: shown.number,
      ...(requested && !pinned ? { requested, missing: true } : {}),
      previewCoverPath: coverFor(asset.versions, shown.number),
      versions: asset.versions.map((version) => this.publicVersion(version)),
    };
  }

  // The model as its owner sees it: drafts included, who sent each version,
  // and the storage all its versions take
  async getOwnedAsset(organizationId: string, ref: string) {
    const id = this.ownedId(ref);
    const asset = await this._assetsRepository.getOwnedAsset(organizationId, id);
    if (!asset) {
      throw new NotFoundException('Model not found');
    }
    const published = asset.versions.filter((version) => version.status === VersionStatus.PUBLISHED);
    const live = this.liveNumber(asset.id, asset.liveVersion, published);
    const liveVersion = published.find((version) => version.number === live);
    const from = utcDay();
    from.setUTCDate(from.getUTCDate() - (RECENT_STAT_DAYS - 1));
    const stats = await this._assetsRepository.statsFor(asset.id, from);
    return {
      id: asset.id,
      title: asset.title,
      url: this.shareUrl(asset.id),
      createdAt: asset.createdAt,
      activityAt: asset.activityAt,
      allowDownload: asset.allowDownload,
      // share-link views and Download clicks (owner only); recent: the last
      // RECENT_STAT_DAYS days
      views: stats.views,
      downloads: stats.downloads,
      recent: { days: RECENT_STAT_DAYS, ...stats.recent },
      live,
      path: liveVersion?.path ?? null,
      coverPath: liveVersion?.coverPath ?? null,
      fileSize: liveVersion?.fileSize ?? 0,
      previewCoverPath: live === null ? null : coverFor(published, live),
      versions: published.length,
      drafts: asset.versions.length - published.length,
      storage: asset.versions.reduce((sum, version) => sum + version.fileSize + (version.coverSize || 0), 0),
      history: asset.versions.map((version) => this.ownerVersion(asset.id, version, live)),
    };
  }

  // { used, limit } in bytes; limit null = unlimited (MAX_STORAGE_PER_ORG_MB unset)
  async storage(organizationId: string) {
    return { used: await this._assetsRepository.storageUsed(organizationId), limit: storageLimitBytes() };
  }

  // Refuses when the org's models would go over MAX_STORAGE_PER_ORG_MB.
  // Two uploads racing can each pass; the overshoot is bounded by one upload
  async assertRoomFor(organizationId: string, incomingBytes: number) {
    const limit = storageLimitBytes();
    if (limit === null) {
      return;
    }
    const used = await this._assetsRepository.storageUsed(organizationId);
    if (used + incomingBytes > limit) {
      const main = (process.env.MAIN_URL || '').replace(/\/+$/, '');
      throw new PayloadTooLargeException(
        `Storage limit reached: ${formatBytes(used)} of ${formatBytes(limit)} used` +
          (incomingBytes > 1 ? `, this upload needs ${formatBytes(incomingBytes)}` : '') +
          `. Delete models or old versions at ${main}/dashboard to make room.`
      );
    }
  }

  async listForOrg(organizationId: string, page = 1) {
    const current = Math.max(1, Math.floor(Number(page) || 1));
    const { assets, total, counts, covers, stats } = await this._assetsRepository.listForOrg(
      organizationId,
      (current - 1) * ASSETS_PAGE_SIZE,
      ASSETS_PAGE_SIZE
    );
    const count = (assetId: string, status: VersionStatus) =>
      counts.find((row) => row.assetId === assetId && row.status === status)?._count._all ?? 0;
    return {
      assets: assets.map((asset) => {
        const live = asset.liveVersion;
        return {
          id: asset.id,
          title: asset.title,
          path: live?.path ?? null,
          coverPath: live ? coverFor(covers.filter((cover) => cover.assetId === asset.id), live.number) : null,
          fileSize: live?.fileSize ?? 0,
          createdAt: asset.createdAt,
          activityAt: asset.activityAt,
          url: this.shareUrl(asset.id),
          version: live?.number ?? null,
          versions: count(asset.id, VersionStatus.PUBLISHED),
          drafts: count(asset.id, VersionStatus.DRAFT),
          allowDownload: asset.allowDownload,
          views: stats.get(asset.id)?.views ?? 0,
          downloads: stats.get(asset.id)?.downloads ?? 0,
        };
      }),
      page: current,
      pages: Math.max(1, Math.ceil(total / ASSETS_PAGE_SIZE)),
      total,
      storage: await this.storage(organizationId),
    };
  }

  async rename(organizationId: string, ref: string, title: string) {
    const id = assetIdFrom(ref);
    const renamed = isAssetId(id) ? await this._assetsRepository.rename(organizationId, id, title) : false;
    if (!renamed) {
      throw new NotFoundException('Model not found');
    }
    return this.getSummary(organizationId, id);
  }

  // The link stops working at once; the files of every version are removed too
  async remove(organizationId: string, ref: string) {
    const id = assetIdFrom(ref);
    const files = isAssetId(id) ? await this._assetsRepository.softDelete(organizationId, id) : null;
    if (!files) {
      throw new NotFoundException('Model not found');
    }
    await this.removeFiles(files);
    return { deleted: true };
  }

  async removeAllForOrg(organizationId: string) {
    const files = await this._assetsRepository.softDeleteAllForOrg(organizationId);
    await this.removeFiles(files);
    return files.length;
  }

  // Runs a download within the org's limit of downloads at once
  async withDownloadSlot<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
    const running = this._downloads.get(organizationId) || 0;
    if (running >= MAX_DOWNLOADS_PER_ORG) {
      throw new HttpException(
        `${MAX_DOWNLOADS_PER_ORG} downloads are already running for this account. Try again when one has finished.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    this._downloads.set(organizationId, running + 1);
    try {
      return await fn();
    } finally {
      const left = (this._downloads.get(organizationId) || 1) - 1;
      if (left > 0) {
        this._downloads.set(organizationId, left);
      } else {
        this._downloads.delete(organizationId);
      }
    }
  }

  private async download(url: string, coverUrl?: string) {
    const storage = UploadFactory.createStorage();
    const userAgent = `pocket3d (+${mainUrl()})`;
    const file = await uploadFromUrl(storage, url, ASSET_UPLOAD_RULES.file, { userAgent });
    let cover: StoredFile | undefined;
    if (coverUrl) {
      try {
        cover = await uploadFromUrl(storage, coverUrl, ASSET_UPLOAD_RULES.cover, { userAgent });
      } catch (err) {
        await this.removeStored(file);
        throw err;
      }
    }
    return { file, cover };
  }

  // A list item: the model with its live version's file
  private async getSummary(organizationId: string, ref: string) {
    const owned = await this.getOwnedAsset(organizationId, ref);
    return {
      id: owned.id,
      title: owned.title,
      path: owned.path,
      coverPath: owned.previewCoverPath,
      fileSize: owned.fileSize,
      createdAt: owned.createdAt,
      activityAt: owned.activityAt,
      url: owned.url,
      version: owned.live,
      versions: owned.versions,
      drafts: owned.drafts,
      allowDownload: owned.allowDownload,
      views: owned.views,
      downloads: owned.downloads,
    };
  }

  // After a change to one version: the model's live number and that version
  private async versionState(organizationId: string, id: string, number: number) {
    const owned = await this.getOwnedAsset(organizationId, id);
    const version = owned.history.find((item) => item.number === number);
    return { id: owned.id, title: owned.title, url: owned.url, live: owned.live, version };
  }

  // The live version's number. It is always a published, non-deleted
  // version (the transactions keep it so); if that were ever broken, the
  // newest published version stands in rather than the page failing
  private liveNumber(
    id: string,
    live: { number: number; status: VersionStatus; deletedAt: Date | null } | null,
    published: { number: number }[]
  ) {
    if (live && !live.deletedAt && live.status === VersionStatus.PUBLISHED) {
      return live.number;
    }
    if (published.length) {
      this._logger.warn(`Model ${id} has no valid live version; showing v${published[0].number}`);
      return published[0].number;
    }
    return null;
  }

  private publicVersion(version: PublicVersion) {
    return {
      number: version.number,
      path: version.path,
      coverPath: version.coverPath,
      fileSize: version.fileSize,
      note: version.note,
      source: sourceLabel(version.source),
      createdAt: version.createdAt,
      publishedAt: version.publishedAt,
    };
  }

  private ownerVersion(id: string, version: OwnerVersion, live: number | null) {
    const published = version.status === VersionStatus.PUBLISHED;
    return {
      ...this.publicVersion(version),
      status: STATUS_LABEL[version.status],
      live: published && version.number === live,
      sourceName: version.sourceName,
      coverSize: version.coverSize,
      // the public pinned link exists only once published
      url: published ? this.versionUrl(id, version.number) : null,
      previewUrl: this.previewUrl(id, version.number),
    };
  }

  private ownedId(ref: string) {
    const id = assetIdFrom(ref);
    if (!isAssetId(id)) {
      throw new NotFoundException('Model not found');
    }
    return id;
  }

  private versionNumber(ref: unknown) {
    const number = versionNumberFrom(ref);
    if (!number) {
      throw new BadRequestException(`Not a version number: "${String(ref).slice(0, 20)}" (use 3 or v3)`);
    }
    return number;
  }

  // Rules broken inside a transaction, as the answer the caller reads
  private httpError(err: unknown) {
    if (!(err instanceof VersionRuleError)) {
      return err;
    }
    const v = `v${err.number}`;
    switch (err.rule) {
      case 'model-not-found':
        return new NotFoundException('Model not found');
      case 'version-not-found':
        return new NotFoundException(`This model has no ${v} (it was deleted, or never existed).`);
      case 'full':
        return new ConflictException(
          `This model keeps ${MAX_VERSIONS_PER_MODEL} versions, the most it can. Delete old versions or drafts to add new ones.`
        );
      case 'live':
        return new ConflictException(`${v} is the live version: make another version live first.`);
      case 'last':
        return new ConflictException(`${v} is the only published version: delete the model instead.`);
      case 'draft':
        return new ConflictException(`${v} is a draft: publish it first.`);
    }
  }

  private async removeFiles(files: StoredVersionFiles[]) {
    for (const file of files) {
      await this.removeStored({ filename: file.path, path: file.path, size: 0 });
      if (file.coverPath) {
        await this.removeStored({ filename: file.coverPath, path: file.coverPath, size: 0 });
      }
    }
  }

  private titleFromFileName(name?: string) {
    const base = (name || '').replace(/\.[^./\\]*$/, '').replace(/[_-]+/g, ' ').trim();
    return (base || 'Untitled model').slice(0, TITLE_MAX_LENGTH);
  }

  private async removeStored(file?: StoredFile) {
    if (!file) {
      return;
    }
    try {
      await UploadFactory.createStorage().removeFile(file.path);
    } catch (err) {
      this._logger.warn(`Could not remove orphaned upload ${file.filename}: ${err}`);
    }
  }
}
