import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { AssetsRepository } from '@pocket3d/nestjs-libraries/database/prisma/assets/assets.repository';
import { CreateAssetDto, TITLE_MAX_LENGTH } from '@pocket3d/nestjs-libraries/dtos/assets/create.asset.dto';
import { ASSET_ID_LENGTH, isAssetId, makeId } from '@pocket3d/nestjs-libraries/services/make.id';
import { UploadFactory } from '@pocket3d/nestjs-libraries/upload/upload.factory';
import { ASSET_UPLOAD_RULES } from '@pocket3d/nestjs-libraries/upload/custom.upload.validation';
import { uploadFromUrl } from '@pocket3d/nestjs-libraries/upload/remote.fetch';
import { CreateAssetFromUrlDto } from '@pocket3d/nestjs-libraries/dtos/assets/create.asset.from.url.dto';
import { mainUrl } from '@pocket3d/nestjs-libraries/services/main.url';
import { formatBytes, storageLimitBytes } from '@pocket3d/nestjs-libraries/services/storage.limit';

// A file as the multer stream engine stored it
export interface StoredFile {
  filename: string;
  path: string;
  size: number;
  originalname?: string;
}

export const ASSETS_PAGE_SIZE = 24;

// Downloads the server runs at once for one account (publish_from_url and
// POST /public/v1/assets/from-url both come through createFromUrl). Each can
// take minutes, which the rate limits (they count requests) don't bound
export const MAX_DOWNLOADS_PER_ORG = 3;

// Agents pass whatever they have: the id, or the share link (…/m/<id>)
export const assetIdFrom = (ref: string): string => {
  const trimmed = (ref || '').trim();
  const link = trimmed.match(/\/m\/([A-Za-z0-9]{12})(?:[/?#]|$)/);
  return link ? link[1] : trimmed;
};

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

  async createAsset(organizationId: string, body: CreateAssetDto, file?: StoredFile, cover?: StoredFile) {
    if (!file) {
      // only a cover came in; it is already stored, so drop it
      await this.removeStored(cover);
      throw new BadRequestException('No model file provided (multipart field "file").');
    }

    try {
      // Checked again now that the real sizes are known (the guard only
      // knew the org was under its limit before the upload)
      await this.assertRoomFor(organizationId, file.size + (cover?.size || 0));
      const asset = await this._assetsRepository.createAsset({
        id: makeId(ASSET_ID_LENGTH),
        organizationId,
        title: body.title || this.titleFromFileName(file.originalname),
        name: file.filename,
        path: file.path,
        fileSize: file.size,
        coverName: cover?.filename,
        coverPath: cover?.path,
        coverSize: cover?.size,
      });
      return { ...asset, url: this.shareUrl(asset.id) };
    } catch (err) {
      // the files are in storage already; without a record nothing points at them
      await this.removeStored(file);
      await this.removeStored(cover);
      throw err;
    }
  }

  // A model that is already on the web: downloaded by the server through
  // remote.fetch (public addresses only), then the same path as an upload
  async createFromUrl(organizationId: string, body: CreateAssetFromUrlDto) {
    const running = this._downloads.get(organizationId) || 0;
    if (running >= MAX_DOWNLOADS_PER_ORG) {
      throw new HttpException(
        `${MAX_DOWNLOADS_PER_ORG} downloads are already running for this account. Try again when one has finished.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    this._downloads.set(organizationId, running + 1);
    try {
      return await this.download(organizationId, body);
    } finally {
      const left = (this._downloads.get(organizationId) || 1) - 1;
      if (left > 0) {
        this._downloads.set(organizationId, left);
      } else {
        this._downloads.delete(organizationId);
      }
    }
  }

  private async download(organizationId: string, body: CreateAssetFromUrlDto) {
    await this.assertRoomFor(organizationId, 1);
    const storage = UploadFactory.createStorage();
    const userAgent = `pocket3d (+${mainUrl()})`;
    const file = await uploadFromUrl(storage, body.url, ASSET_UPLOAD_RULES.file, { userAgent });
    let cover: StoredFile | undefined;
    if (body.coverUrl) {
      try {
        cover = await uploadFromUrl(storage, body.coverUrl, ASSET_UPLOAD_RULES.cover, { userAgent });
      } catch (err) {
        await this.removeStored(file);
        throw err;
      }
    }
    return this.createAsset(organizationId, { title: body.title }, file, cover);
  }

  getPublicAsset(id: string) {
    if (!isAssetId(id)) {
      return null;
    }
    return this._assetsRepository.getPublicAsset(id);
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
          `. Delete models at ${main}/dashboard to make room.`
      );
    }
  }

  async listForOrg(organizationId: string, page = 1) {
    const current = Math.max(1, Math.floor(Number(page) || 1));
    const [assets, total] = await this._assetsRepository.listForOrg(
      organizationId,
      (current - 1) * ASSETS_PAGE_SIZE,
      ASSETS_PAGE_SIZE
    );
    return {
      assets: assets.map((asset) => ({ ...asset, url: this.shareUrl(asset.id) })),
      page: current,
      pages: Math.max(1, Math.ceil(total / ASSETS_PAGE_SIZE)),
      total,
      storage: await this.storage(organizationId),
    };
  }

  async rename(organizationId: string, ref: string, title: string) {
    const id = assetIdFrom(ref);
    const asset = isAssetId(id) ? await this._assetsRepository.rename(organizationId, id, title) : null;
    if (!asset) {
      throw new NotFoundException('Model not found');
    }
    return { ...asset, url: this.shareUrl(asset.id) };
  }

  // The link stops working at once; the files are removed from storage too
  async remove(organizationId: string, ref: string) {
    const id = assetIdFrom(ref);
    const asset = isAssetId(id) ? await this._assetsRepository.softDelete(organizationId, id) : null;
    if (!asset) {
      throw new NotFoundException('Model not found');
    }
    await this.removeFiles([asset]);
    return { deleted: true };
  }

  async removeAllForOrg(organizationId: string) {
    const assets = await this._assetsRepository.softDeleteAllForOrg(organizationId);
    await this.removeFiles(assets);
    return assets.length;
  }

  private async removeFiles(assets: { path: string; coverPath: string | null }[]) {
    for (const asset of assets) {
      await this.removeStored({ filename: asset.path, path: asset.path, size: 0 });
      if (asset.coverPath) {
        await this.removeStored({ filename: asset.coverPath, path: asset.coverPath, size: 0 });
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
