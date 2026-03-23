import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { getImageEmbedding, getItemTextEmbedding, openPipelineDatabase } from "./db";
import { createEmbeddingWriter } from "./embeddingWriter";

function tempDbPath(name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "booth-hunter-embedding-writer-"));
  return path.join(dir, name);
}

test("embedding writer persists text and image batches through its own worker", async () => {
  const dbPath = tempDbPath("writer.sqlite");
  const db = openPipelineDatabase(dbPath);
  db.close();

  const writer = createEmbeddingWriter({ dbPath });
  try {
    const textResult = await writer.saveTextBatch([
      {
        itemId: "item-1",
        embeddingSpace: "multimodal-shared",
        model: "Qwen/Qwen3-VL-Embedding-2B",
        vectorJson: JSON.stringify([1, 2, 3]),
        updatedAt: "2026-03-23T00:00:00.000Z",
      },
    ]);
    const imageResult = await writer.saveImageBatch([
      {
        imageKey: "item-1:0",
        embeddingSpace: "multimodal-shared",
        model: "Qwen/Qwen3-VL-Embedding-2B",
        vectorJson: JSON.stringify([0.1, 0.2, 0.3]),
        updatedAt: "2026-03-23T00:00:01.000Z",
      },
    ]);

    assert.equal(textResult.savedCount, 1);
    assert.equal(imageResult.savedCount, 1);
    assert.equal(typeof textResult.saveMs, "number");
    assert.equal(typeof imageResult.saveMs, "number");
  } finally {
    await writer.dispose();
  }

  const verifyDb = openPipelineDatabase(dbPath);
  try {
    assert.match(getItemTextEmbedding(verifyDb, "item-1", "multimodal-shared")?.vectorJson ?? "", /2/);
    assert.match(getImageEmbedding(verifyDb, "item-1:0", "multimodal-shared")?.vectorJson ?? "", /0.2/);
  } finally {
    verifyDb.close();
  }
});
