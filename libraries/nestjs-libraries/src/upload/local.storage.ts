import { createWriteStream, mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { resolve, sep } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { IUploadProvider, UploadedStream } from './upload.interface';
import { makeId } from '@pocket3d/nestjs-libraries/services/make.id';

// Only what the upload rules can produce ever lands in the publicly served
// directory, so nothing executable (html/svg) can be written on our origin
const LOCAL_STORAGE_ALLOWED_MIME = new Set<string>([
  'model/gltf-binary',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export class LocalStorage implements IUploadProvider {
  constructor(private uploadDirectory: string) {}

  private publicPrefix() {
    return (process.env.MAIN_URL || '').replace(/\/+$/, '') + '/uploads';
  }

  // Files live under /YYYY/MM/DD with a random name; creates the folder
  private newFilePath(ext: string) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');

    const innerPath = `/${year}/${month}/${day}`;
    const dir = `${this.uploadDirectory}${innerPath}`;
    mkdirSync(dir, { recursive: true });

    const filename = `${makeId(24)}.${ext}`;
    return {
      key: `${innerPath}/${filename}`.slice(1),
      filePath: `${dir}/${filename}`,
      path: `${this.publicPrefix()}${innerPath}/${filename}`,
    };
  }

  async uploadStream(
    stream: Readable,
    mimetype: string,
    ext: string
  ): Promise<UploadedStream> {
    if (!LOCAL_STORAGE_ALLOWED_MIME.has(mimetype)) {
      throw new Error('Unsupported file type.');
    }

    const { key, filePath, path } = this.newFilePath(ext);
    try {
      await pipeline(stream, createWriteStream(filePath));
    } catch (err) {
      // Don't leave a truncated file behind (size cap hit, client gone, ...)
      await unlink(filePath).catch(() => {});
      throw err;
    }

    return { filename: key, path, mimetype };
  }

  // Accepts the public URL or the key. resolve() collapses any `..`, so only
  // a file inside the upload directory can ever be deleted
  async removeFile(filePath: string): Promise<void> {
    const base = resolve(String(this.uploadDirectory));
    const prefix = this.publicPrefix();
    const relative = filePath.startsWith(prefix)
      ? filePath.slice(prefix.length)
      : filePath;
    const localPath = resolve(base, relative.replace(/^\/+/, ''));
    if (!localPath.startsWith(base + sep)) {
      throw new Error('Unsafe file path');
    }
    await unlink(localPath);
  }
}
