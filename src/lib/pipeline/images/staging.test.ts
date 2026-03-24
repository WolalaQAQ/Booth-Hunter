import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

import { stageImageBatchToTempFiles } from "./staging";

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

test("stageImageBatchToTempFiles downloads images concurrently, writes temp files, and cleans them up", async () => {
  const pngBuffer = await sharp({
    create: { width: 32, height: 24, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
  const tempParentDir = await fs.mkdtemp(path.join(os.tmpdir(), "booth-hunter-stage-images-"));
  let activeDownloads = 0;
  let maxActiveDownloads = 0;
  const progressUpdates: number[] = [];

  try {
    const staged = await stageImageBatchToTempFiles(
      [0, 1, 2].map((imageIndex) => ({
        itemId: "1001",
        imageIndex,
        sourceUrl: `https://example.com/${imageIndex}.png`,
      })),
      {
        concurrency: 3,
        tempParentDir,
        onProgress(progress) {
          progressUpdates.push(progress.completed);
        },
        fetchBinary: async () => {
          activeDownloads += 1;
          maxActiveDownloads = Math.max(maxActiveDownloads, activeDownloads);
          await new Promise((resolve) => setTimeout(resolve, 20));
          activeDownloads -= 1;
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => toArrayBuffer(pngBuffer),
          } as Response;
        },
      }
    );

    assert.equal(maxActiveDownloads > 1, true);
    assert.deepEqual(progressUpdates, [1, 2, 3]);
    assert.equal(staged.images.length, 3);

    for (const image of staged.images) {
      assert.equal(image.localPath.endsWith(".webp"), true);
      const stat = await fs.stat(image.localPath);
      assert.equal(stat.isFile(), true);
    }

    await staged.dispose();
    await assert.rejects(() => fs.stat(staged.directoryPath), /ENOENT/i);
  } finally {
    await fs.rm(tempParentDir, { recursive: true, force: true });
  }
});

test("stageImageBatchToTempFiles removes partial temp files when a download fails", async () => {
  const pngBuffer = await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 0, g: 0, b: 255 } },
  })
    .png()
    .toBuffer();
  const tempParentDir = await fs.mkdtemp(path.join(os.tmpdir(), "booth-hunter-stage-images-fail-"));

  try {
    await assert.rejects(
      () =>
        stageImageBatchToTempFiles(
          [
            { itemId: "1001", imageIndex: 0, sourceUrl: "https://example.com/ok.png" },
            { itemId: "1001", imageIndex: 1, sourceUrl: "https://example.com/fail.png" },
          ],
          {
            concurrency: 2,
            tempParentDir,
            fetchBinary: async (input) => {
              const url = typeof input === "string" ? input : input.toString();
              if (url.includes("fail")) {
                return {
                  ok: false,
                  status: 503,
                  arrayBuffer: async () => toArrayBuffer(Buffer.alloc(0)),
                } as Response;
              }

              return {
                ok: true,
                status: 200,
                arrayBuffer: async () => toArrayBuffer(pngBuffer),
              } as Response;
            },
          }
        ),
      /Failed to download image/i
    );

    assert.deepEqual(await fs.readdir(tempParentDir), []);
  } finally {
    await fs.rm(tempParentDir, { recursive: true, force: true });
  }
});
