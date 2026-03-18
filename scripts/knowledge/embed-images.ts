import { embedImageLocal } from '../../src/lib/pipeline/embed/images';
import { listAllCachedImages, openPipelineDatabase, saveImageEmbedding } from '../../src/lib/pipeline/sqlite/db';

function argument(name: string, fallback: string): string {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
}

async function main() {
  const db = openPipelineDatabase(argument('db', 'data/raw/booth-pipeline.sqlite'));
  try {
    const images = listAllCachedImages(db);
    for (const image of images) {
      const vector = await embedImageLocal(image.compressedPath);
      saveImageEmbedding(db, {
        imageKey: image.cacheKey,
        model: 'local-pixel-v1',
        vectorJson: JSON.stringify(vector),
        updatedAt: new Date().toISOString(),
      });
    }
    console.log(`Image embeddings completed for ${images.length} cached images.`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
