import { extractStructuredSignals } from '../../src/lib/pipeline/enrich/structured';
import {
  getStructuredItem,
  listImageAnalysisForItem,
  listNormalizedItems,
  openPipelineDatabase,
  saveStructuredItem,
} from '../../src/lib/pipeline/sqlite/db';
import { mapWithConcurrency } from '../../src/lib/utils/async';
import { argument, booleanArgument, createStageProgress, numberArgument, type ProgressPostfixField } from './shared';

async function main() {
  const db = openPipelineDatabase(argument('db', 'data/raw/booth-pipeline.sqlite')!);
  const limit = numberArgument('limit', 100);
  const skipExisting = booleanArgument('skip-existing', true);
  const itemConcurrency = numberArgument('item-concurrency', 16);

  try {
    const items = listNormalizedItems(db, limit);
    const tasks = [];
    let skipped = 0;

    for (const record of items) {
      const item = JSON.parse(record.normalizedJson) as {
        itemId: string;
        title: string;
        description: string;
        tags: string[];
      };

      if (skipExisting && getStructuredItem(db, item.itemId)) {
        skipped += 1;
        continue;
      }

      tasks.push(item);
    }

    const total = skipped + tasks.length;
    const progress = createStageProgress({ stage: 'extract', total: Math.max(1, total) });
    const buildPostfix = (): ProgressPostfixField[] => [
      { label: 'queued', shortLabel: 'q', value: tasks.length, priority: 100 },
      { label: 'skipped', shortLabel: 'sk', value: skipped, priority: 95 },
      { label: 'concurrency', shortLabel: 'cc', value: itemConcurrency, priority: 90 },
    ];

    let completed = 0;
    try {
      progress.update(skipped, buildPostfix());
      await mapWithConcurrency(tasks, itemConcurrency, async (item) => {
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

        completed += 1;
        progress.update(skipped + completed, buildPostfix());
        return item.itemId;
      });

      progress.update(total, buildPostfix(), true);
    } finally {
      progress.dispose();
    }
    console.log(
      `Structured extraction completed for ${items.length} items. processed=${completed}, skipped=${skipped}, itemConcurrency=${itemConcurrency}.`
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
