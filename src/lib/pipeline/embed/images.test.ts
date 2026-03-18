import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { embedImageLocal } from "./images";
import { cosineSimilarity } from "./text";

test("embedImageLocal distinguishes very different colors", async () => {
  const red = await sharp({
    create: { width: 24, height: 24, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).png().toBuffer();
  const red2 = await sharp({
    create: { width: 24, height: 24, channels: 3, background: { r: 240, g: 10, b: 10 } },
  }).png().toBuffer();
  const blue = await sharp({
    create: { width: 24, height: 24, channels: 3, background: { r: 0, g: 0, b: 255 } },
  }).png().toBuffer();

  const redVector = await embedImageLocal(red);
  const red2Vector = await embedImageLocal(red2);
  const blueVector = await embedImageLocal(blue);

  assert.equal(cosineSimilarity(redVector, red2Vector) > cosineSimilarity(redVector, blueVector), true);
});
