import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import { IUploadProvider, UploadedStream } from './upload.interface';
import { makeId } from '@pocket3d/nestjs-libraries/services/make.id';

const ALLOWED_MIME_TYPES = new Set<string>([
  'model/gltf-binary',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

// Cloudflare R2 through its S3 API. The bucket is public through a custom
// domain (CLOUDFLARE_BUCKET_URL), so files are served by Cloudflare's CDN and
// never pass through this server again
export class CloudflareStorage implements IUploadProvider {
  private _client: S3Client;
  private _uploadUrl: string;

  constructor(
    accountId: string,
    accessKey: string,
    secretKey: string,
    private _bucketName: string,
    uploadUrl: string
  ) {
    this._uploadUrl = (uploadUrl || '').replace(/\/+$/, '');
    this._client = new S3Client({
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      // R2 doesn't need the extra checksums newer SDKs add by default
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async uploadStream(
    stream: Readable,
    mimetype: string,
    ext: string
  ): Promise<UploadedStream> {
    if (!ALLOWED_MIME_TYPES.has(mimetype)) {
      throw new Error('Unsupported file type.');
    }
    const key = `${makeId(24)}.${ext}`;

    // Multipart upload holds only a few parts in memory at a time instead
    // of the whole body, and does not need to know the length up front.
    // Keys are random and never reused, so the file can be cached forever
    const upload = new Upload({
      client: this._client,
      params: {
        Bucket: this._bucketName,
        Key: key,
        Body: stream,
        ContentType: mimetype,
        CacheControl: 'public, max-age=31536000, immutable',
      },
    });
    await upload.done();

    return { filename: key, path: `${this._uploadUrl}/${key}`, mimetype };
  }

  async removeFile(filePath: string): Promise<void> {
    const key = filePath.split('/').pop();
    if (!key) {
      return;
    }
    await this._client.send(
      new DeleteObjectCommand({ Bucket: this._bucketName, Key: key })
    );
  }
}
