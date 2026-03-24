import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { mapWithConcurrency } from "../../utils/async";
import { downloadAndPrepareImage, type PrepareImageParams } from "./cache";

export type StageImageTask = Pick<PrepareImageParams, "itemId" | "imageIndex" | "sourceUrl">;

export type StagedImage = StageImageTask & {
  localPath: string;
};

export type StagedImageBatch = {
  directoryPath: string;
  images: StagedImage[];
  dispose(): Promise<void>;
};

export type StageImageBatchOptions = {
  concurrency?: number;
  tempParentDir?: string;
  fetchBinary?: typeof fetch;
  quality?: number;
  onProgress?: (progress: { completed: number; total: number }) => void;
};

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildImageFileName(task: StageImageTask): string {
  return `${sanitizeFilePart(task.itemId)}-${task.imageIndex}.webp`;
}

export async function stageImageBatchToTempFiles(
  tasks: StageImageTask[],
  options: StageImageBatchOptions = {}
): Promise<StagedImageBatch> {
  const tempParentDir = options.tempParentDir || os.tmpdir();
  const directoryPath = await fs.mkdtemp(path.join(tempParentDir, "booth-hunter-embed-images-"));
  let completed = 0;

  async function disposeDirectory() {
    await fs.rm(directoryPath, { recursive: true, force: true });
  }

  try {
    const images = await mapWithConcurrency(tasks, options.concurrency ?? Math.max(1, tasks.length), async (task) => {
      const prepared = await downloadAndPrepareImage({
        itemId: task.itemId,
        imageIndex: task.imageIndex,
        sourceUrl: task.sourceUrl,
        fetchBinary: options.fetchBinary,
        quality: options.quality,
      });
      const localPath = path.join(directoryPath, buildImageFileName(task));
      await fs.writeFile(localPath, prepared.buffer);

      completed += 1;
      options.onProgress?.({ completed, total: tasks.length });

      return {
        itemId: task.itemId,
        imageIndex: task.imageIndex,
        sourceUrl: task.sourceUrl,
        localPath,
      };
    });

    return {
      directoryPath,
      images,
      async dispose() {
        await disposeDirectory();
      },
    };
  } catch (error) {
    await disposeDirectory();
    throw error;
  }
}
