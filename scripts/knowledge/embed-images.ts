import { createPythonEmbeddingProvider, MULTIMODAL_SHARED_SPACE } from '../../src/lib/pipeline/embed/provider';
import { listAllItemImages, openPipelineDatabase, saveImageEmbedding } from '../../src/lib/pipeline/sqlite/db';

function argument(name: string, fallback: string): string {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
}

async function main() {
  const db = openPipelineDatabase(argument('db', 'data/raw/booth-pipeline.sqlite'));
  const provider = createPythonEmbeddingProvider();
  try {
    const images = listAllItemImages(db);
    if (images.length === 0) {
      console.log('Image embeddings completed for 0 item images.');
      return;
    }

    const response = await provider.embedImages(images.map((image) => image.sourceUrl));
    for (const [index, image] of images.entries()) {
      saveImageEmbedding(db, {
        imageKey: image.imageKey,
        embeddingSpace: MULTIMODAL_SHARED_SPACE,
        model: response.model,
        vectorJson: JSON.stringify(response.vectors[index] || []),
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
