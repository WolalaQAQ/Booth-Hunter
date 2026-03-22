import { extractOcrText, OcrProvider, TesseractOcrProvider } from '../../src/lib/pipeline/enrich/ocr';
import { downloadAndPrepareImage } from '../../src/lib/pipeline/images/cache';
import { filterPrimaryImageEntries } from '../../src/lib/pipeline/images/select';
import { getImageAnalysis, listAllItemImages, openPipelineDatabase, saveImageAnalysis } from '../../src/lib/pipeline/sqlite/db';
import { mapWithConcurrency } from '../../src/lib/utils/async';
import { argument, booleanArgument, createStageProgress, numberArgument, type ProgressPostfixField } from './shared';

class NoopOcrProvider implements OcrProvider {
  async recognize(): Promise<string> {
    return '';
  }
}

async function main() {
  const db = openPipelineDatabase(argument('db', 'data/raw/booth-pipeline.sqlite')!);
  const enabled = argument('mode', 'noop') === 'tesseract';
  const primaryOnly = booleanArgument('primary-only', false);
  const skipExisting = booleanArgument('skip-existing', true);
  const imageConcurrency = numberArgument('image-concurrency', enabled ? 2 : 8);
  const provider = enabled ? new TesseractOcrProvider() : new NoopOcrProvider();

  try {
    const images = filterPrimaryImageEntries(listAllItemImages(db), primaryOnly);
    const tasks = [];
    let skipped = 0;

    for (const image of images) {
      const existing = getImageAnalysis(db, image.imageKey);
      if (skipExisting && existing?.ocrText !== undefined) {
        skipped += 1;
        continue;
      }
      tasks.push(image);
    }

    const total = skipped + tasks.length;
    const progress = createStageProgress({ stage: 'ocr', total: Math.max(1, total) });
    const buildPostfix = (): ProgressPostfixField[] => [
      { label: 'queued', shortLabel: 'q', value: tasks.length, priority: 100 },
      { label: 'skipped', shortLabel: 'sk', value: skipped, priority: 95 },
      { label: 'concurrency', shortLabel: 'cc', value: imageConcurrency, priority: 90 },
      { label: 'primaryOnly', shortLabel: 'p0', value: primaryOnly ? 'yes' : 'no', priority: 80 },
      { label: 'mode', shortLabel: 'mode', value: enabled ? 'tesseract' : 'noop', priority: 70 },
    ];

    let completed = 0;
    try {
      progress.update(skipped, buildPostfix());
      await mapWithConcurrency(tasks, imageConcurrency, async (image) => {
        const prepared = await downloadAndPrepareImage({
          itemId: image.itemId,
          imageIndex: image.imageIndex,
          sourceUrl: image.sourceUrl,
        });
        const text = await extractOcrText(prepared.buffer, provider);
        saveImageAnalysis(db, {
          imageKey: image.imageKey,
          itemId: image.itemId,
          imageIndex: image.imageIndex,
          ocrText: text,
          updatedAt: new Date().toISOString(),
        });

        completed += 1;
        progress.update(skipped + completed, buildPostfix());
        return image.imageKey;
      });

      progress.update(total, buildPostfix(), true);
    } finally {
      progress.dispose();
    }
    console.log(
      `OCR stage completed for ${images.length} item images. processed=${completed}, skipped=${skipped}, primaryOnly=${primaryOnly}, imageConcurrency=${imageConcurrency}.`
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
