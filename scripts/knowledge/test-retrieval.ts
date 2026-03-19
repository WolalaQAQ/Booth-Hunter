import {
  createPythonEmbeddingProvider,
  MULTIMODAL_SHARED_SPACE,
} from '../../src/lib/pipeline/embed/provider';
import {
  averageVectors,
  rankHybridMatches,
  rankImageMatchesByItem,
  rankTextMatches,
} from '../../src/lib/pipeline/retrieval/search';
import {
  getNormalizedItem,
  listImageEmbeddingsBySpace,
  listItemTextEmbeddingsBySpace,
  openPipelineDatabase,
} from '../../src/lib/pipeline/sqlite/db';

function argument(name: string, fallback: string): string {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
}

async function main() {
  const db = openPipelineDatabase(argument('db', 'data/raw/booth-pipeline.sqlite'));
  const textQuery = argument('text', 'VRChat 3D outfit');
  const imagePath = argument('image', '');
  const provider = createPythonEmbeddingProvider();
  try {
    const queryVectors: number[][] = [];

    if (textQuery) {
      const textQueryEmbedding = await provider.embedTexts(
        [textQuery],
        'Retrieve relevant BOOTH catalog items for the user query.'
      );
      queryVectors.push(textQueryEmbedding.vectors[0] || []);
    }

    if (imagePath) {
      const imageQueryEmbedding = await provider.embedImages([imagePath]);
      queryVectors.push(imageQueryEmbedding.vectors[0] || []);
    }

    const queryVector = averageVectors(queryVectors);
    const textMatches = rankTextMatches(
      queryVector,
      listItemTextEmbeddingsBySpace(db, MULTIMODAL_SHARED_SPACE).map((record) => ({
        itemId: record.itemId,
        vector: JSON.parse(record.vectorJson),
      })),
      10
    );

    const imageMatches = rankImageMatchesByItem(
      queryVector,
      listImageEmbeddingsBySpace(db, MULTIMODAL_SHARED_SPACE).map((record) => ({
        imageKey: record.imageKey,
        vector: JSON.parse(record.vectorJson),
      })),
      10
    );

    const results = rankHybridMatches(textMatches, imageMatches, 0.6, 0.4, 10);

    const printable = results.map((result) => {
      const item = getNormalizedItem(db, result.itemId);
      const parsed = item ? JSON.parse(item.normalizedJson) : null;
      return {
        itemId: result.itemId,
        score: Number(result.score.toFixed(4)),
        title: parsed?.title || '(missing title)',
        itemUrl: parsed?.itemUrl || '',
      };
    });

    console.log(JSON.stringify({ query: textQuery, imagePath: imagePath || undefined, results: printable }, null, 2));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
