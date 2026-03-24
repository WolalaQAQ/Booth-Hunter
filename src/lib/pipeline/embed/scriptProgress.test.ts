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
    lastPrepareMs: 220,
    totalPrepareMs: 660,
    completedPrepareBatches: 3,
    warmupMs: 2_500,
    lastInferMs: 900,
    totalInferenceMs: 2_700,
    completedInferBatches: 3,
    lastSaveMs: 80,
    totalSaveMs: 240,
    completedSaveBatches: 3,
    mode: "verbose",
  });

  assert.deepEqual(
    fields.map((field) => field.label),
    [
      "inferred",
      "saved",
      "skipped",
      "pendingSaveBatches",
      "saveBatchSize",
      "providerBatchSize",
      "prep",
      "lastPrepare",
      "avgPrepare",
      "warmup",
      "lastInfer",
      "avgInfer",
      "lastSave",
      "avgSave",
    ]
  );
  assert.equal(fields.find((field) => field.label === "avgPrepare")?.value, "220ms");
  assert.equal(fields.find((field) => field.label === "avgInfer")?.value, "900ms");
  assert.equal(fields.find((field) => field.label === "avgSave")?.value, "80ms");
  assert.equal(fields.some((field) => field.label === "requestedAttn"), false);
  assert.equal(fields.some((field) => field.label === "resolvedAttn"), false);
  assert.equal(fields.some((field) => field.label === "flashAttn"), false);
});

test("buildEmbeddingProgressPostfix can emit a compact terminal view without redundant remaining or tuning fields", () => {
  const fields = buildEmbeddingProgressPostfix({
    remaining: 12,
    inferred: 18,
    saved: 14,
    skipped: 3,
    pendingSaveBatches: 2,
    saveBatchSize: 4,
    providerBatchSize: 4,
    prepareMs: 180,
    lastPrepareMs: 220,
    totalPrepareMs: 660,
    completedPrepareBatches: 3,
    warmupMs: 2_500,
    lastInferMs: 900,
    totalInferenceMs: 2_700,
    completedInferBatches: 3,
    lastSaveMs: 80,
    totalSaveMs: 240,
    completedSaveBatches: 3,
    extraFields: [
      { label: "prepared", value: 20 },
      { label: "preparing", value: "1/2" },
      { label: "pendingPreparedBatches", value: 1 },
      { label: "prefetchWindow", value: 2 },
      { label: "downloadConcurrency", value: 8 },
    ],
    mode: "compact",
  });

  assert.deepEqual(
    fields.map((field) => field.label),
    ["inferred", "saved", "skipped", "pendingSaveBatches", "prepared", "preparing", "pendingPreparedBatches", "warmup"]
  );
  assert.equal(fields.some((field) => field.label === "remaining"), false);
  assert.equal(fields.some((field) => field.label === "saveBatchSize"), false);
  assert.equal(fields.some((field) => field.label === "providerBatchSize"), false);
  assert.equal(fields.some((field) => field.label === "prefetchWindow"), false);
  assert.equal(fields.some((field) => field.label === "downloadConcurrency"), false);
});
