import { createWorker } from 'tesseract.js';

export type OcrProvider = {
  recognize(image: string | Buffer): Promise<string>;
};

export class TesseractOcrProvider implements OcrProvider {
  async recognize(image: string | Buffer): Promise<string> {
    const worker = await createWorker(['eng', 'jpn']);
    try {
      const result = await worker.recognize(image);
      return result.data.text.trim();
    } finally {
      await worker.terminate();
    }
  }
}

export async function extractOcrText(image: string | Buffer, provider: OcrProvider = new TesseractOcrProvider()): Promise<string> {
  return provider.recognize(image);
}
