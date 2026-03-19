import { embedImageLocal } from '../../src/lib/pipeline/embed/images';
import { downloadAndPrepareImage } from '../../src/lib/pipeline/images/cache';
import { listAllItemImages, openPipelineDatabase, saveImageEmbedding } from '../../src/lib/pipeline/sqlite/db';

function argument(name: string, fallback: string): string {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
}

async function main() {
  const db = openPipelineDatabase(argument('db', 'data/raw/booth-pipeline.sqlite'));
  try {
    const images = listAllItemImages(db);
    for (const image of images) {
      const prepared = await downloadAndPrepareImage({
        itemId: image.itemId,
        imageIndex: image.imageIndex,
        sourceUrl: image.sourceUrl,
      });
      const vector = await embedImageLocal(prepared.buffer);
      saveImageEmbedding(db, {
        imageKey: image.imageKey,
        model: 'local-pixel-v1',
        vectorJson: JSON.stringify(vector),
        updatedAt: new Date().toISOString(),
      });
    }
    console.log(`Image embeddings completed for ${images.length} item images.`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
