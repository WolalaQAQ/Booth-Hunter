import test from "node:test";
import assert from "node:assert/strict";

import { buildEmbeddingProgressPostfix } from "./scriptProgress";

test("buildEmbeddingProgressPostfix keeps only actionable timing and queue fields", () => {
  const fields = buildEmbeddingProgressPostfix({
    remaining: 12,
    inferred: 18,
    saved: 14,
    skipped: 3,
    pendingSaveBatches: 2,
    saveBatchSize: 4,
    providerBatchSize: 4,
    prepareMs: 180,
    warmupMs: 2_500,
    lastInferMs: 900,
    totalInferenceMs: 2_700,
    completedInferBatches: 3,
    lastSaveMs: 80,
    totalSaveMs: 240,
    completedSaveBatches: 3,
  });

  assert.deepEqual(
    fields.map((field) => field.label),
    ["remaining", "inferred", "saved", "skipped", "pendingSaveBatches", "saveBatchSize", "providerBatchSize", "prep", "warmup", "lastInfer", "avgInfer", "lastSave", "avgSave"]
  );
  assert.equal(fields.find((field) => field.label === "avgInfer")?.value, "900ms");
  assert.equal(fields.find((field) => field.label === "avgSave")?.value, "80ms");
  assert.equal(fields.some((field) => field.label === "requestedAttn"), false);
  assert.equal(fields.some((field) => field.label === "resolvedAttn"), false);
  assert.equal(fields.some((field) => field.label === "flashAttn"), false);
});
