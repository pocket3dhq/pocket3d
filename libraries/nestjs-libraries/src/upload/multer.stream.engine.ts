import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { StorageEngine } from 'multer';
import { IUploadProvider } from './upload.interface';
import { UploadFactory } from './upload.factory';
import {
  ASSET_UPLOAD_RULES,
  MAX_UPLOAD_SIZE,
  UploadRule,
  uploadStreamToStorage,
} from './custom.upload.validation';

// Multer storage engine that streams each incoming file straight into
// storage instead of multer's default of buffering it whole in memory.
// The rule (allowed type, size cap) is picked by the multipart field name.
// `file.filename` / `file.path` end up as the storage key and public URL
export class MulterStreamEngine implements StorageEngine {
  constructor(
    private storage: IUploadProvider,
    private rules: Record<string, UploadRule>
  ) {}

  _handleFile(
    req: Request,
    file: Express.Multer.File,
    cb: (error?: any, info?: Partial<Express.Multer.File>) => void
  ) {
    const rule = this.rules[file.fieldname];
    if (!rule) {
      file.stream.resume();
      return cb(new BadRequestException(`Unexpected file field "${file.fieldname}".`));
    }

    uploadStreamToStorage(this.storage, file.stream, rule).then(
      (uploaded) =>
        cb(null, {
          filename: uploaded.filename,
          path: uploaded.path,
          mimetype: uploaded.mimetype,
          size: uploaded.size,
        }),
      (err) => cb(err)
    );
  }

  // Multer calls this when the request fails after the file was already
  // stored (e.g. the other file was rejected), so the orphan is dropped
  _removeFile(
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null) => void
  ) {
    this.storage.removeFile(file.path).then(
      () => cb(null),
      (err) => cb(err)
    );
  }
}

let engine: MulterStreamEngine;

// Options for FileFieldsInterceptor on POST /public/v1/assets. Multer's own
// limit sits one byte above the largest rule so the in-stream cap is what
// rejects (a clear 400) rather than multer truncating the file first
export function assetUploadOptions() {
  engine =
    engine ||
    new MulterStreamEngine(UploadFactory.createStorage(), ASSET_UPLOAD_RULES);
  return {
    storage: engine,
    limits: {
      fileSize: MAX_UPLOAD_SIZE + 1,
      files: 2,
      fields: 4,
      fieldSize: 2048,
    },
  };
}
