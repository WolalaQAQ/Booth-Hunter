import { generateCaption } from '../../src/lib/pipeline/enrich/caption';
import { filterPrimaryImageEntries } from '../../src/lib/pipeline/images/select';
import {
  getImageAnalysis,
  listItemImagesForItem,
  listNormalizedItems,
  openPipelineDatabase,
  saveImageAnalysis,
} from '../../src/lib/pipeline/sqlite/db';
import { mapWithConcurrency } from '../../src/lib/utils/async';
import { argument, booleanArgument, createStageProgress, numberArgument, type ProgressPostfixField } from './shared';

async function main() {
  const db = openPipelineDatabase(argument('db', 'data/raw/booth-pipeline.sqlite')!);
  const limit = numberArgument('limit', 100);
  const primaryOnly = booleanArgument('primary-only', false);
  const skipExisting = booleanArgument('skip-existing', true);
  const imageConcurrency = numberArgument('image-concurrency', 16);

  try {
    const items = listNormalizedItems(db, limit);
    const tasks: Array<{
      itemId: string;
      imageKey: string;
      imageIndex: number;
      itemTitle: string;
      categoryName: string;
      tags: string[];
    }> = [];
    let skipped = 0;

    for (const record of items) {
      const item = JSON.parse(record.normalizedJson) as {
        itemId: string;
        title: string;
        categoryName: string;
        tags: string[];
      };
      const images = filterPrimaryImageEntries(listItemImagesForItem(db, item.itemId), primaryOnly);
      for (const image of images) {
        const existing = getImageAnalysis(db, image.imageKey);
        if (skipExisting && typeof existing?.captionText === 'string' && existing.captionText.trim().length > 0) {
          skipped += 1;
          continue;
        }

        tasks.push({
          itemId: item.itemId,
          imageKey: image.imageKey,
          imageIndex: image.imageIndex,
          itemTitle: item.title,
          categoryName: item.categoryName,
          tags: item.tags,
        });
      }
    }

    const total = skipped + tasks.length;
    const progress = createStageProgress({ stage: 'caption', total: Math.max(1, total) });
    const buildPostfix = (): ProgressPostfixField[] => [
      { label: 'queued', shortLabel: 'q', value: tasks.length, priority: 100 },
      { label: 'skipped', shortLabel: 'sk', value: skipped, priority: 95 },
      { label: 'concurrency', shortLabel: 'cc', value: imageConcurrency, priority: 90 },
      { label: 'primaryOnly', shortLabel: 'p0', value: primaryOnly ? 'yes' : 'no', priority: 70 },
    ];

    let completed = 0;
    try {
      progress.update(skipped, buildPostfix());
      await mapWithConcurrency(tasks, imageConcurrency, async (task) => {
        const caption = await generateCaption({
          itemTitle: task.itemTitle,
          categoryName: task.categoryName,
          tags: task.tags,
          imageIndex: task.imageIndex,
        });
        saveImageAnalysis(db, {
          imageKey: task.imageKey,
          itemId: task.itemId,
          imageIndex: task.imageIndex,
          captionText: caption,
          updatedAt: new Date().toISOString(),
        });

        completed += 1;
        progress.update(skipped + completed, buildPostfix());
        return task.imageKey;
      });

      progress.update(total, buildPostfix(), true);
    } finally {
      progress.dispose();
    }
    console.log(
      `Caption stage completed for ${items.length} items. processed=${completed}, skipped=${skipped}, primaryOnly=${primaryOnly}, imageConcurrency=${imageConcurrency}.`
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
