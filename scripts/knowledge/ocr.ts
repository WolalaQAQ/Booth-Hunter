import { extractOcrText, OcrProvider, TesseractOcrProvider } from '../../src/lib/pipeline/enrich/ocr';
import { listAllCachedImages, openPipelineDatabase, saveImageAnalysis } from '../../src/lib/pipeline/sqlite/db';

function argument(name: string, fallback: string): string {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
}

class NoopOcrProvider implements OcrProvider {
  async recognize(): Promise<string> {
    return '';
  }
}

async function main() {
  const db = openPipelineDatabase(argument('db', 'data/raw/booth-pipeline.sqlite'));
  const enabled = argument('mode', 'noop') === 'tesseract';
  const provider = enabled ? new TesseractOcrProvider() : new NoopOcrProvider();

  try {
    const images = listAllCachedImages(db);
    for (const image of images) {
      const text = await extractOcrText(image.compressedPath, provider);
      saveImageAnalysis(db, {
        imageKey: image.cacheKey,
        itemId: image.itemId,
        imageIndex: image.imageIndex,
        ocrText: text,
        updatedAt: new Date().toISOString(),
      });
    }
    console.log(`OCR stage completed for ${images.length} cached images.`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
