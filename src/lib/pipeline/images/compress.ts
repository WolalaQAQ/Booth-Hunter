import sharp from 'sharp';

export type CompressionResult = {
  buffer: Buffer;
  width: number;
  height: number;
};

export async function compressImageBuffer(buffer: Buffer, quality = 82): Promise<CompressionResult> {
  const image = sharp(buffer, { failOn: 'none' }).rotate();
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const compressed = await image.webp({ quality }).toBuffer();

  return {
    buffer: compressed,
    width,
    height,
  };
}
