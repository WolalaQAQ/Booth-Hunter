import { createWorker } from 'tesseract.js';

export type OcrProvider = {
  recognize(imagePath: string): Promise<string>;
};

export class TesseractOcrProvider implements OcrProvider {
  async recognize(imagePath: string): Promise<string> {
    const worker = await createWorker(['eng', 'jpn']);
    try {
      const result = await worker.recognize(imagePath);
      return result.data.text.trim();
    } finally {
      await worker.terminate();
    }
  }
}

export async function extractOcrText(imagePath: string, provider: OcrProvider = new TesseractOcrProvider()): Promise<string> {
  return provider.recognize(imagePath);
}
