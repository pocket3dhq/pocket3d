import { createReadStream, statSync } from 'fs';
import { extname, resolve, sep } from 'path';
import { Readable } from 'stream';
import { NextRequest, NextResponse } from 'next/server';

// Serves STORAGE_PROVIDER="local" files in `pnpm dev`. In the Docker image
// nginx serves /uploads/ straight from disk and this route is never reached;
// with Cloudflare storage files come from the bucket's own domain
const CONTENT_TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

export const GET = async (
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) => {
  if ((process.env.STORAGE_PROVIDER || 'local') !== 'local' || !process.env.UPLOAD_DIRECTORY) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { path } = await context.params;
  const base = resolve(process.env.UPLOAD_DIRECTORY);
  const filePath = resolve(base, (path ?? []).join('/'));
  // Confine reads to UPLOAD_DIRECTORY: resolve() collapses any `..` segments
  // (including URL-decoded ones), so this blocks every path-traversal variant
  const contentType = CONTENT_TYPES[extname(filePath).toLowerCase()];
  if (!filePath.startsWith(base + sep) || !contentType) {
    return new NextResponse('Not found', { status: 404 });
  }

  let size: number;
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
