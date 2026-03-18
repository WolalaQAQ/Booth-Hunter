import sharp from 'sharp';

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export async function embedImageLocal(input: Buffer | string): Promise<number[]> {
  const raw = await sharp(input, { failOn: 'none' })
    .resize(8, 8, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();

  const vector = Array.from(raw, (value) => value / 255);
  return normalize(vector);
}
