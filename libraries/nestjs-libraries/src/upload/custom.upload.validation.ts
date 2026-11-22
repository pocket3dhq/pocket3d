import { BadRequestException } from '@nestjs/common';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream';
import { IUploadProvider } from './upload.interface';

export interface Sniffed {
  mime: string;
  ext: string;
}

export interface UploadRule {
  // what the error messages call it
  label: string;
  maxSize: number;
  // decides the real type from the first bytes; null = rejected
  sniff(head: Buffer): Sniffed | null;
}

const MB = 1024 * 1024;
// How many bytes the sniffers look at
const HEAD_BYTES = 12;

// glTF binary: magic "glTF" then a uint32 LE container version, which is 2
export const sniffGlb = (head: Buffer): Sniffed | null =>
  head.length >= 8 &&
  head.toString('latin1', 0, 4) === 'glTF' &&
  head.readUInt32LE(4) === 2
    ? { mime: 'model/gltf-binary', ext: 'glb' }
    : null;

export const sniffImage = (head: Buffer): Sniffed | null => {
  if (
    head.length >= 8 &&
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    head.length >= 12 &&
    head.toString('latin1', 0, 4) === 'RIFF' &&
    head.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
};

// Rules per multipart field of POST /public/v1/assets. 95 MB keeps a model
// under Cloudflare's 100 MB request limit in front of pocket3d.co
export const ASSET_UPLOAD_RULES: Record<string, UploadRule> = {
  file: { label: 'Model', maxSize: 95 * MB, sniff: sniffGlb },
  cover: { label: 'Cover image', maxSize: 5 * MB, sniff: sniffImage },
};

export const MAX_UPLOAD_SIZE = Math.max(
  ...Object.values(ASSET_UPLOAD_RULES).map((r) => r.maxSize)
);

// Passes bytes through, counts them, and fails once they exceed maxSize, so a
// body with a missing or lying Content-Length can't be streamed in unbounded
export function maxSizeStream(maxSize: number, label: string) {
  let total = 0;
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > maxSize) {
        return callback(
          new BadRequestException(
            `${label} is too large (max ${Math.round(maxSize / MB)} MB).`
          )
        );
      }
      callback(null, chunk);
    },
  });
  return { stream, size: () => total };
}

// Reads just enough of the stream to sniff it, then hands back a stream that
// still yields every byte (the head included)
async function peekStream(source: Readable, bytes: number) {
  const iterator = source[Symbol.asyncIterator]();
  const chunks: Buffer[] = [];
  let length = 0;
  while (length < bytes) {
    const { value, done } = await iterator.next();
    if (done) {
      break;
    }
    chunks.push(value);
    length += value.length;
  }
  const head = Buffer.concat(chunks);

  async function* rest() {
    if (head.length) {
      yield head;
    }
    for (;;) {
      const { value, done } = await iterator.next();
      if (done) {
        return;
      }
      yield value as Buffer;
    }
  }

  return {
    head,
    stream: Readable.from(rest(), { objectMode: false }),
    discard: () => iterator.return?.(),
  };
}

// Sniffs the real type from the first bytes, applies the rule's size cap and
// streams the rest into storage, so only the sniffed prefix and a few upload
// parts are ever in memory
export async function uploadStreamToStorage(
  storage: IUploadProvider,
  source: Readable,
  rule: UploadRule
) {
  let peeked: Awaited<ReturnType<typeof peekStream>>;
  try {
    peeked = await peekStream(source, HEAD_BYTES);
  } catch {
    throw new BadRequestException(`Failed to read ${rule.label.toLowerCase()}.`);
  }

  const detected = rule.sniff(peeked.head);
  if (!detected) {
    await peeked.discard();
    throw new BadRequestException(
      rule === ASSET_UPLOAD_RULES.file
        ? 'Model must be a binary glTF (.glb) file.'
        : `${rule.label} must be a PNG, JPEG or WebP image.`
    );
  }

  const counter = maxSizeStream(rule.maxSize, rule.label);
  // pipeline (not pipe) so failing the cap also tears down the source
  const body = pipeline(peeked.stream, counter.stream, () => {});

  try {
    const uploaded = await storage.uploadStream(
      body,
      detected.mime,
      detected.ext
    );
    return { ...uploaded, size: counter.size() };
  } catch (err) {
    body.destroy();
    throw err;
  }
}
