import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { prepareImageBuffer, createImageKey } from "./cache";

test("prepareImageBuffer returns compressed image metadata without writing files", async () => {
  const buffer = await sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();

  const record = await prepareImageBuffer({
    itemId: "1001",
    imageIndex: 0,
    sourceUrl: "https://example.com/red.png",
    buffer,
  });

  assert.equal(record.imageKey, createImageKey("1001", 0, "https://example.com/red.png"));
  assert.equal(record.width, 32);
  assert.equal(record.height, 32);
  assert.equal(record.sizeBytes > 0, true);
  assert.equal(Buffer.isBuffer(record.buffer), true);
});
