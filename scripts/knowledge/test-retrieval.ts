import { embedImageLocal } from '../../src/lib/pipeline/embed/images';
import { embedTextLocal } from '../../src/lib/pipeline/embed/text';
import { rankHybridMatches, rankTextMatches } from '../../src/lib/pipeline/retrieval/search';
import { getNormalizedItem, listImageEmbeddings, listItemTextEmbeddings, openPipelineDatabase } from '../../src/lib/pipeline/sqlite/db';

function argument(name: string, fallback: string): string {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
}

async function main() {
  const db = openPipelineDatabase(argument('db', 'data/raw/booth-pipeline.sqlite'));
  const textQuery = argument('text', 'VRChat 3D outfit');
  const imagePath = argument('image', '');
  try {
    const textVector = embedTextLocal(textQuery);
    const textMatches = rankTextMatches(textVector, listItemTextEmbeddings(db).map((record) => ({ itemId: record.itemId, vector: JSON.parse(record.vectorJson) })), 10);

    let results = textMatches;
    if (imagePath) {
      const imageVector = await embedImageLocal(imagePath);
      const imageScores = new Map<string, number>();
      for (const record of listImageEmbeddings(db)) {
        const itemId = record.imageKey.split(':')[0];
        const vector = JSON.parse(record.vectorJson);
        const score = vector.reduce((sum: number, value: number, index: number) => sum + value * (imageVector[index] || 0), 0);
        imageScores.set(itemId, Math.max(imageScores.get(itemId) || -Infinity, score));
      }
      results = rankHybridMatches(textMatches, Array.from(imageScores.entries()).map(([itemId, score]) => ({ itemId, score })), 0.7, 0.3, 10);
    }

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
