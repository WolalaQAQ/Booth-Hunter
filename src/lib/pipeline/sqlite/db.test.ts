import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import {
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
    model: "local-hash-v1",
    vectorJson: JSON.stringify([1, 0, 0]),
    updatedAt: "2026-03-19T00:04:00.000Z",
  });
  assert.match(getItemTextEmbedding(db, "1001")?.vectorJson ?? "", /1/);

  db.close();
});
