import type { ProgressPostfixField } from "../../utils/progress";

export type EmbeddingProgressPostfixOptions = {
  remaining: number;
  inferred: number;
  saved: number;
  skipped: number;
  pendingSaveBatches: number;
  saveBatchSize: number;
  providerBatchSize: number;
  prepareMs: number;
  warmupMs?: number;
  lastInferMs?: number;
  totalInferenceMs: number;
  completedInferBatches: number;
  lastSaveMs?: number;
  totalSaveMs: number;
  completedSaveBatches: number;
  extraFields?: ProgressPostfixField[];
};

function formatDurationMs(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) {
    return "-";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export function buildEmbeddingProgressPostfix(options: EmbeddingProgressPostfixOptions): ProgressPostfixField[] {
  const avgInferMs = options.completedInferBatches > 0 ? options.totalInferenceMs / options.completedInferBatches : undefined;
  const avgSaveMs = options.completedSaveBatches > 0 ? options.totalSaveMs / options.completedSaveBatches : undefined;

  return [
    { label: "remaining", shortLabel: "rem", value: options.remaining, priority: 100 },
    { label: "inferred", shortLabel: "inf", value: options.inferred, priority: 98 },
    { label: "saved", shortLabel: "sv", value: options.saved, priority: 97 },
    { label: "skipped", shortLabel: "sk", value: options.skipped, priority: 95 },
    { label: "pendingSaveBatches", shortLabel: "ps", value: options.pendingSaveBatches, priority: 92 },
    { label: "saveBatchSize", shortLabel: "saveB", value: options.saveBatchSize, priority: 90 },
    { label: "providerBatchSize", shortLabel: "pbs", value: options.providerBatchSize, priority: 85 },
    ...(options.extraFields || []),
    { label: "prep", shortLabel: "prep", value: formatDurationMs(options.prepareMs), priority: 70 },
    { label: "warmup", shortLabel: "warm", value: formatDurationMs(options.warmupMs), priority: 65 },
    { label: "lastInfer", shortLabel: "linfer", value: formatDurationMs(options.lastInferMs), priority: 60 },
    { label: "avgInfer", shortLabel: "infer", value: formatDurationMs(avgInferMs), priority: 55 },
    { label: "lastSave", shortLabel: "lsave", value: formatDurationMs(options.lastSaveMs), priority: 50 },
    { label: "avgSave", shortLabel: "save", value: formatDurationMs(avgSaveMs), priority: 45 },
  ];
}
