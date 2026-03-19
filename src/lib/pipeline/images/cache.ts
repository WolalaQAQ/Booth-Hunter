import crypto from 'node:crypto';

import { compressImageBuffer } from './compress';

export type PrepareImageParams = {
  itemId: string;
  imageIndex: number;
  sourceUrl: string;
  buffer: Buffer;
  quality?: number;
};

export type PreparedImage = {
  imageKey: string;
  itemId: string;
  imageIndex: number;
  sourceUrl: string;
  buffer: Buffer;
  width: number;
  height: number;
  sizeBytes: number;
  sha256: string;
  processedAt: string;
};

export function createImageKey(itemId: string, imageIndex: number, sourceUrl: string): string {
  const digest = crypto.createHash('sha256').update(`${itemId}:${imageIndex}:${sourceUrl}`).digest('hex').slice(0, 16);
  return `${itemId}:${imageIndex}:${digest}`;
}

export async function prepareImageBuffer(params: PrepareImageParams): Promise<PreparedImage> {
  const imageKey = createImageKey(params.itemId, params.imageIndex, params.sourceUrl);
  const { buffer, width, height } = await compressImageBuffer(params.buffer, params.quality);

  return {
    imageKey,
    itemId: params.itemId,
    imageIndex: params.imageIndex,
    sourceUrl: params.sourceUrl,
    buffer,
    width,
    height,
    sizeBytes: buffer.byteLength,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    processedAt: new Date().toISOString(),
  };
}

export async function downloadAndPrepareImage(params: {
  itemId: string;
  imageIndex: number;
  sourceUrl: string;
  fetchBinary?: typeof fetch;
  quality?: number;
}): Promise<PreparedImage> {
  const fetcher = params.fetchBinary || fetch;
  const response = await fetcher(params.sourceUrl, {
    headers: { 'user-agent': 'Mozilla/5.0' },
  });
  if (!response.ok) {
    throw new Error(`Failed to download image ${params.sourceUrl}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return prepareImageBuffer({
    itemId: params.itemId,
    imageIndex: params.imageIndex,
    sourceUrl: params.sourceUrl,
    buffer,
    quality: params.quality,
  });
}
