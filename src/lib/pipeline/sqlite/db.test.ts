import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import {
  upsertItemImage,
  listAllItemImages,
  openPipelineDatabase,
  upsertRawItem,
  getRawItem,
  upsertNormalizedItem,
  getNormalizedItem,
  saveImageAnalysis,
  getImageAnalysis,
  saveStructuredItem,
  getStructuredItem,
  saveItemTextEmbedding,
  getItemTextEmbedding,
  listItemTextEmbeddingsBySpace,
  getImageEmbedding,
  saveImageEmbedding,
  listImageEmbeddingsBySpace,
} from "./db";

function tempDbPath(name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "booth-hunter-db-"));
  return path.join(dir, name);
}

test("pipeline sqlite database creates schema and round-trips records", () => {
  const db = openPipelineDatabase(tempDbPath("pipeline.sqlite"));

  upsertRawItem(db, {
    itemId: "1001",
    listingPage: 1,
    sourceUrl: "https://booth.pm/en/items/1001",
    fetchedAt: "2026-03-19T00:00:00.000Z",
    rawJson: JSON.stringify({ id: 1001, name: "Test Item" }),
    rawHash: "hash-1",
  });

  assert.equal(getRawItem(db, "1001")?.rawHash, "hash-1");

  upsertItemImage(db, {
    imageKey: "1001:0",
    itemId: "1001",
    imageIndex: 0,
    sourceUrl: "https://example.com/1001.webp",
    width: 512,
    height: 512,
    sizeBytes: 2048,
    sha256: "img-hash-1",
    processedAt: "2026-03-19T00:00:30.000Z",
  });
  assert.equal(listAllItemImages(db)[0]?.sha256, "img-hash-1");

  upsertNormalizedItem(db, {
    itemId: "1001",
    normalizedJson: JSON.stringify({ title: "Test Item" }),
    contentHash: "content-1",
    updatedAt: "2026-03-19T00:01:00.000Z",
  });
  assert.equal(getNormalizedItem(db, "1001")?.contentHash, "content-1");

  saveImageAnalysis(db, {
    imageKey: "1001:0",
    itemId: "1001",
    imageIndex: 0,
    captionText: "front view of test item",
    ocrText: "VRChat",
    updatedAt: "2026-03-19T00:02:00.000Z",
  });
  assert.equal(getImageAnalysis(db, "1001:0")?.captionText, "front view of test item");

  saveStructuredItem(db, {
    itemId: "1001",
    structuredJson: JSON.stringify({ parts: ["outfit"] }),
    updatedAt: "2026-03-19T00:03:00.000Z",
  });
  assert.match(getStructuredItem(db, "1001")?.structuredJson ?? "", /outfit/);

  saveItemTextEmbedding(db, {
    itemId: "1001",
    embeddingSpace: "multimodal-shared",
    model: "Qwen/Qwen3-VL-Embedding-2B",
    vectorJson: JSON.stringify([1, 0, 0]),
    updatedAt: "2026-03-19T00:04:00.000Z",
  });
  saveItemTextEmbedding(db, {
    itemId: "1001",
    embeddingSpace: "auxiliary-space",
    model: "placeholder",
    vectorJson: JSON.stringify([0, 1, 0]),
    updatedAt: "2026-03-19T00:05:00.000Z",
  });
  assert.match(getItemTextEmbedding(db, "1001", "multimodal-shared")?.vectorJson ?? "", /1/);
  assert.match(getItemTextEmbedding(db, "1001", "auxiliary-space")?.vectorJson ?? "", /1/);
  assert.equal(listItemTextEmbeddingsBySpace(db, "multimodal-shared").length, 1);

  saveImageEmbedding(db, {
    imageKey: "1001:0",
    embeddingSpace: "multimodal-shared",
    model: "Qwen/Qwen3-VL-Embedding-2B",
    vectorJson: JSON.stringify([0.1, 0.2, 0.3]),
    updatedAt: "2026-03-19T00:06:00.000Z",
  });
  assert.match(getImageEmbedding(db, "1001:0", "multimodal-shared")?.vectorJson ?? "", /0.2/);
  assert.equal(listImageEmbeddingsBySpace(db, "multimodal-shared").length, 1);

  db.close();
});
