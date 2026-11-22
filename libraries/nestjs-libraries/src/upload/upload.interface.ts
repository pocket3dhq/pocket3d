import { Readable } from 'stream';

export interface UploadedStream {
  // storage key (local: path under UPLOAD_DIRECTORY, cloudflare: object key)
  filename: string;
  // public URL the browser loads it from
  path: string;
  mimetype: string;
}

export interface IUploadProvider {
  // Streams the body straight into storage without buffering it. The caller
  // has already sniffed the real type from the first bytes, so it passes the
  // detected mime/ext instead of the provider trusting the client
  uploadStream(
    stream: Readable,
    mimetype: string,
    ext: string
  ): Promise<UploadedStream>;
  // Accepts the public URL or the storage key
  removeFile(filePath: string): Promise<void>;
}
