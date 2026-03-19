import { createPythonEmbeddingProvider, MULTIMODAL_SHARED_SPACE } from '../../src/lib/pipeline/embed/provider';
import { getStructuredItem, listImageAnalysisForItem, listNormalizedItems, openPipelineDatabase, saveItemTextEmbedding } from '../../src/lib/pipeline/sqlite/db';

function argument(name: string, fallback: string): string {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
}

async function main() {
  const db = openPipelineDatabase(argument('db', 'data/raw/booth-pipeline.sqlite'));
  const provider = createPythonEmbeddingProvider();
  try {
    const items = listNormalizedItems(db, Number(argument('limit', '100')) || 100);
    const prepared = items.map((record) => {
      const item = JSON.parse(record.normalizedJson);
      const structured = getStructuredItem(db, item.itemId);
      const imageSignals = listImageAnalysisForItem(db, item.itemId);
      const corpus = [
        item.normalizedText,
        structured?.structuredJson || '',
        ...imageSignals.flatMap((signal) => [signal.captionText || '', signal.ocrText || '']),
      ].join('\n');
      return { itemId: item.itemId, corpus };
    });

    if (prepared.length === 0) {
      console.log('Text embeddings completed for 0 items.');
      return;
    }

    const response = await provider.embedTexts(
      prepared.map((entry) => entry.corpus)
    );
    for (const [index, entry] of prepared.entries()) {
      saveItemTextEmbedding(db, {
        itemId: entry.itemId,
        embeddingSpace: MULTIMODAL_SHARED_SPACE,
        model: response.model,
        vectorJson: JSON.stringify(response.vectors[index] || []),
        updatedAt: new Date().toISOString(),
      });
    }
    console.log(`Text embeddings completed for ${prepared.length} items.`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
