// Browser side of an upload to a single-use link (POST /public/v1/uploads/:token),
// shared by the /u/<token> page and the dashboard. The backend sniffs the real
// type and enforces the caps; these checks only catch a wrong file before the
// link is used up

// Same caps as ASSET_UPLOAD_RULES on the backend
export const MAX_MB = 95;
export const MAX_COVER_MB = 5;
export const TITLE_MAX_LENGTH = 120;

const MB = 1024 * 1024;

export const checkModel = async (
  file: File,
  notGlb: string
): Promise<string | null> => {
  if (!file.name.toLowerCase().endsWith('.glb')) {
    return notGlb;
  }
  if (file.size > MAX_MB * MB) {
    return `This file is over ${MAX_MB} MB, the most pocket3d takes.`;
  }
  const head = new DataView(await file.slice(0, 8).arrayBuffer());
  const isGlb =
    head.byteLength === 8 &&
    head.getUint32(0, false) === 0x676c5446 /* "glTF" */ &&
    head.getUint32(4, true) === 2;
  return isGlb ? null : "This file isn't a valid .glb (binary glTF 2.0) model.";
};

export const checkCover = (file: File): string | null => {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return 'The cover must be a PNG, JPEG or WebP image.';
  }
  return file.size > MAX_COVER_MB * MB
    ? `The cover is over ${MAX_COVER_MB} MB.`
    : null;
};

export type UploadResult = {
  status: number;
  body: {
    url?: string;
    title?: string;
    version?: number;
    status?: 'draft' | 'published';
    live?: number | null;
    message?: string | string[];
  } | null;
};

// XMLHttpRequest rather than fetch: it reports upload progress. `path` is
// /api/public/v1/uploads/<token> on this origin
export const sendUpload = (
  path: string,
  { file, title, note, cover }: { file: File; title?: string; note?: string; cover?: File | null },
  onProgress: (ratio: number) => void
) =>
  new Promise<UploadResult>((resolve) => {
    const data = new FormData();
    if (title) {
      data.append('title', title);
    }
    if (note) {
      data.append('note', note);
    }
    data.append('file', file);
    if (cover) {
      data.append('cover', cover);
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.upload.onprogress = (event) =>
      event.lengthComputable && onProgress(event.loaded / event.total);
    xhr.onload = () => {
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // proxy error page
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => resolve({ status: 0, body: null });
    xhr.send(data);
  });

// Why an upload failed, in words (410: the link was used or expired)
export const uploadError = ({ status, body }: UploadResult) =>
  status === 410
    ? 'This link was already used or expired.'
    : status === 0
    ? 'The upload was cut off (network error).'
    : (Array.isArray(body?.message)
        ? body?.message.join(', ')
        : body?.message) || `The upload failed (${status}).`;

export const formatSize = (bytes: number) =>
  bytes < MB
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / MB).toFixed(1)} MB`;
