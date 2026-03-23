import test from "node:test";
import assert from "node:assert/strict";

import { runEmbeddingBatchPipeline } from "./pipeline";

async function waitFor(check: () => boolean, message: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (check()) {
      return;
    }
    await Promise.resolve();
  }
  assert.fail(message);
}

test("runEmbeddingBatchPipeline can start the next inference batch before the previous save finishes", async () => {
  const events: string[] = [];
  const saveResolvers: Array<() => void> = [];

  const runPromise = runEmbeddingBatchPipeline({
    items: ["a", "b", "c", "d"],
    batchSize: 2,
    maxPendingSaveBatches: 2,
    async embedBatch(batch) {
      events.push(`embed-start:${batch.join("")}`);
      await Promise.resolve();
      events.push(`embed-done:${batch.join("")}`);
      return { batchKey: batch.join("") };
    },
    async saveBatch(batch) {
      events.push(`save-start:${batch.join("")}`);
      return await new Promise<{ saveMs: number }>((resolve) => {
        saveResolvers.push(() => {
          events.push(`save-done:${batch.join("")}`);
          resolve({ saveMs: 5 });
        });
      });
    },
  });

  await waitFor(() => events.includes("embed-start:cd"), "expected second embed batch to start");

  assert.equal(events.includes("save-done:ab"), false);
  assert.equal(events.indexOf("save-start:ab") >= 0, true);
  assert.equal(events.indexOf("embed-start:cd") > events.indexOf("save-start:ab"), true);

  saveResolvers.shift()?.();
  await waitFor(() => saveResolvers.length > 0, "expected second save batch to be queued");
  saveResolvers.shift()?.();

  const result = await runPromise;
  assert.equal(result.inferredCount, 4);
  assert.equal(result.savedCount, 4);
});

test("runEmbeddingBatchPipeline applies save backpressure when the pending queue is full", async () => {
  const events: string[] = [];
  const saveResolvers: Array<() => void> = [];

  const runPromise = runEmbeddingBatchPipeline({
    items: ["a", "b", "c", "d"],
    batchSize: 2,
    maxPendingSaveBatches: 1,
    async embedBatch(batch) {
      events.push(`embed:${batch.join("")}`);
      return { batchKey: batch.join("") };
    },
    async saveBatch(batch) {
      events.push(`save-start:${batch.join("")}`);
      return await new Promise<{ saveMs: number }>((resolve) => {
        saveResolvers.push(() => {
          events.push(`save-done:${batch.join("")}`);
          resolve({ saveMs: 7 });
        });
      });
    },
  });

  await Promise.resolve();
  assert.deepEqual(events, ["embed:ab", "save-start:ab"]);

  saveResolvers.shift()?.();
  await waitFor(() => events.includes("save-start:cd"), "expected second save batch to start after backpressure released");
  assert.equal(events.indexOf("save-done:ab") >= 0, true);
  assert.equal(events.indexOf("embed:cd") > events.indexOf("save-done:ab"), true);
  assert.equal(events.indexOf("save-start:cd") > events.indexOf("embed:cd"), true);

  saveResolvers.shift()?.();
  await runPromise;
});
