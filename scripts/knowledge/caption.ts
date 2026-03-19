import { generateCaption } from '../../src/lib/pipeline/enrich/caption';
import { listItemImagesForItem, listNormalizedItems, openPipelineDatabase, saveImageAnalysis } from '../../src/lib/pipeline/sqlite/db';

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
      const itemImages = listItemImagesForItem(db, item.itemId);
      for (const image of itemImages) {
        const caption = await generateCaption({
          itemTitle: item.title,
          categoryName: item.categoryName,
          tags: item.tags,
          imageIndex: image.imageIndex,
        });
        saveImageAnalysis(db, {
          imageKey: image.imageKey,
          itemId: item.itemId,
          imageIndex: image.imageIndex,
          captionText: caption,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    console.log(`Caption stage completed for ${items.length} items.`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
