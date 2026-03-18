import { embedTextLocal } from '../../src/lib/pipeline/embed/text';
import { getStructuredItem, listImageAnalysisForItem, listNormalizedItems, openPipelineDatabase, saveItemTextEmbedding } from '../../src/lib/pipeline/sqlite/db';

function argument(name: string, fallback: string): string {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
}

async function main() {
  const db = openPipelineDatabase(argument('db', 'data/raw/booth-pipeline.sqlite'));
  try {
    const items = listNormalizedItems(db, Number(argument('limit', '100')) || 100);
    for (const record of items) {
      const item = JSON.parse(record.normalizedJson);
      const structured = getStructuredItem(db, item.itemId);
      const imageSignals = listImageAnalysisForItem(db, item.itemId);
      const corpus = [
        item.normalizedText,
        structured?.structuredJson || '',
        ...imageSignals.flatMap((signal) => [signal.captionText || '', signal.ocrText || '']),
      ].join('\n');
      saveItemTextEmbedding(db, {
        itemId: item.itemId,
        model: 'local-hash-v1',
        vectorJson: JSON.stringify(embedTextLocal(corpus)),
        updatedAt: new Date().toISOString(),
      });
    }
    console.log(`Text embeddings completed for ${items.length} items.`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
