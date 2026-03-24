import test from "node:test";
import assert from "node:assert/strict";

import { runPrepareInferSavePipeline } from "./streamingPipeline";

async function waitFor(check: () => boolean, message: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (check()) {
      return;
    }
    await Promise.resolve();
  }
  assert.fail(message);
}

test("runPrepareInferSavePipeline prefetches future batches while the current batch is inferring", async () => {
  const events: string[] = [];
  const prepareResolvers = new Map<string, () => void>();
  const inferResolvers = new Map<string, () => void>();

  const runPromise = runPrepareInferSavePipeline({
    items: ["a", "b", "c", "d", "e", "f"],
    batchSize: 2,
    maxPendingPreparedBatches: 2,
    maxPendingSaveBatches: 2,
    async prepareBatch(batch) {
      const batchKey = batch.join("");
      events.push(`prepare-start:${batchKey}`);
      return await new Promise<{ batchKey: string }>((resolve) => {
        prepareResolvers.set(batchKey, () => {
          events.push(`prepare-done:${batchKey}`);
          resolve({ batchKey });
        });
      });
    },
    async inferPreparedBatch(batch) {
      const batchKey = batch.join("");
      events.push(`infer-start:${batchKey}`);
      return await new Promise<{ batchKey: string }>((resolve) => {
        inferResolvers.set(batchKey, () => {
          events.push(`infer-done:${batchKey}`);
          resolve({ batchKey });
        });
      });
    },
    async saveBatch(batch) {
      events.push(`save:${batch.join("")}`);
      return { saveMs: 1 };
    },
  });

  await waitFor(
    () => events.includes("prepare-start:ab") && events.includes("prepare-start:cd"),
    "expected initial prepare window to start"
  );

  prepareResolvers.get("ab")?.();
  await waitFor(() => events.includes("infer-start:ab"), "expected first infer batch to start");
  await waitFor(() => events.includes("prepare-start:ef"), "expected third prepare batch to start while inferring first");

  assert.equal(events.includes("infer-done:ab"), false);
  assert.equal(events.includes("prepare-done:ef"), false);

  prepareResolvers.get("cd")?.();
  prepareResolvers.get("ef")?.();
  inferResolvers.get("ab")?.();
  await waitFor(() => events.includes("infer-start:cd"), "expected second infer batch to start");
  inferResolvers.get("cd")?.();
  await waitFor(() => events.includes("infer-start:ef"), "expected third infer batch to start");
  inferResolvers.get("ef")?.();

  const result = await runPromise;
  assert.equal(result.preparedCount, 6);
  assert.equal(result.inferredCount, 6);
  assert.equal(result.savedCount, 6);
});

test("runPrepareInferSavePipeline disposes prefetched batches when inference fails", async () => {
  const disposed: string[] = [];

  await assert.rejects(
    () =>
      runPrepareInferSavePipeline({
        items: ["a", "b", "c", "d"],
        batchSize: 2,
        maxPendingPreparedBatches: 2,
        async prepareBatch(batch) {
          return { batchKey: batch.join("") };
        },
        async inferPreparedBatch(batch) {
          throw new Error(`boom:${batch.join("")}`);
        },
        async saveBatch() {
          return { saveMs: 1 };
        },
        async disposePreparedBatch(prepared) {
          disposed.push(prepared.batchKey);
        },
      }),
    /boom:ab/
  );

  assert.deepEqual(disposed.sort(), ["ab", "cd"]);
});

test("runPrepareInferSavePipeline preserves save overlap while later batches continue", async () => {
  const events: string[] = [];
  const saveResolvers: Array<() => void> = [];

  const runPromise = runPrepareInferSavePipeline({
    items: ["a", "b", "c", "d"],
    batchSize: 2,
    maxPendingPreparedBatches: 2,
    maxPendingSaveBatches: 2,
    async prepareBatch(batch) {
      events.push(`prepare:${batch.join("")}`);
      return { batchKey: batch.join("") };
    },
    async inferPreparedBatch(batch) {
      events.push(`infer:${batch.join("")}`);
      return { batchKey: batch.join("") };
    },
    async saveBatch(batch) {
      events.push(`save-start:${batch.join("")}`);
      return await new Promise<{ saveMs: number }>((resolve) => {
        saveResolvers.push(() => {
          events.push(`save-done:${batch.join("")}`);
          resolve({ saveMs: 3 });
        });
      });
    },
  });

  await waitFor(() => events.includes("save-start:ab"), "expected first save batch to start");
  await waitFor(() => events.includes("infer:cd"), "expected second infer batch to start before first save completed");

  assert.equal(events.includes("save-done:ab"), false);
  assert.equal(events.indexOf("infer:cd") > events.indexOf("save-start:ab"), true);

  saveResolvers.shift()?.();
  await waitFor(() => saveResolvers.length > 0, "expected second save batch to be queued");
  saveResolvers.shift()?.();

  const result = await runPromise;
  assert.equal(result.savedCount, 4);
});
