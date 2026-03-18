import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";

import { cacheImageBuffer, createImageCacheKey } from "./cache";

test("cacheImageBuffer writes compressed image and metadata", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "booth-hunter-image-"));
  const buffer = await sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();

  const record = await cacheImageBuffer({
    itemId: "1001",
    imageIndex: 0,
    sourceUrl: "https://example.com/red.png",
    outputDir: dir,
    buffer,
  });

  assert.equal(record.cacheKey, createImageCacheKey("1001", 0, "https://example.com/red.png"));
  assert.equal(fs.existsSync(record.compressedPath), true);
  assert.equal(record.width, 32);
  assert.equal(record.height, 32);
  assert.equal(record.sizeBytes > 0, true);
});
