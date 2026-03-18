import { extractStructuredSignals } from '../../src/lib/pipeline/enrich/structured';
import { listImageAnalysisForItem, listNormalizedItems, openPipelineDatabase, saveStructuredItem } from '../../src/lib/pipeline/sqlite/db';

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
      const imageSignals = listImageAnalysisForItem(db, item.itemId);
      const structured = extractStructuredSignals({
        title: item.title,
        description: item.description,
        tags: item.tags,
        captions: imageSignals.map((signal) => signal.captionText || '').filter(Boolean),
        ocrTexts: imageSignals.map((signal) => signal.ocrText || '').filter(Boolean),
      });
      saveStructuredItem(db, {
        itemId: item.itemId,
        structuredJson: JSON.stringify(structured),
        updatedAt: new Date().toISOString(),
      });
    }
    console.log(`Structured extraction completed for ${items.length} items.`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
