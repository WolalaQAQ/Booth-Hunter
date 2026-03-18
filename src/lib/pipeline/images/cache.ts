import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { compressImageBuffer } from './compress';

export type CacheImageParams = {
  itemId: string;
  imageIndex: number;
  sourceUrl: string;
  outputDir: string;
  buffer: Buffer;
  quality?: number;
};

export type CachedImageFile = {
  cacheKey: string;
  itemId: string;
  imageIndex: number;
  sourceUrl: string;
  compressedPath: string;
  width: number;
  height: number;
  sizeBytes: number;
  sha256: string;
  downloadedAt: string;
};

export function createImageCacheKey(itemId: string, imageIndex: number, sourceUrl: string): string {
  const digest = crypto.createHash('sha256').update(`${itemId}:${imageIndex}:${sourceUrl}`).digest('hex').slice(0, 16);
  return `${itemId}:${imageIndex}:${digest}`;
}

export async function cacheImageBuffer(params: CacheImageParams): Promise<CachedImageFile> {
  const cacheKey = createImageCacheKey(params.itemId, params.imageIndex, params.sourceUrl);
  const { buffer, width, height } = await compressImageBuffer(params.buffer, params.quality);
  const itemDir = path.join(params.outputDir, params.itemId);
  await fs.mkdir(itemDir, { recursive: true });
  const fileName = `${String(params.imageIndex).padStart(2, '0')}-${cacheKey.split(':').at(-1)}.webp`;
  const compressedPath = path.join(itemDir, fileName);
  await fs.writeFile(compressedPath, buffer);

  return {
    cacheKey,
    itemId: params.itemId,
    imageIndex: params.imageIndex,
    sourceUrl: params.sourceUrl,
    compressedPath,
    width,
    height,
    sizeBytes: buffer.byteLength,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    downloadedAt: new Date().toISOString(),
  };
}

export async function downloadAndCacheImage(params: {
  itemId: string;
  imageIndex: number;
  sourceUrl: string;
  outputDir: string;
  fetchBinary?: typeof fetch;
  quality?: number;
}): Promise<CachedImageFile> {
  const fetcher = params.fetchBinary || fetch;
  const response = await fetcher(params.sourceUrl, {
    headers: { 'user-agent': 'Mozilla/5.0' },
  });
  if (!response.ok) {
    throw new Error(`Failed to download image ${params.sourceUrl}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return cacheImageBuffer({
    itemId: params.itemId,
    imageIndex: params.imageIndex,
    sourceUrl: params.sourceUrl,
    outputDir: params.outputDir,
    buffer,
    quality: params.quality,
  });
}
