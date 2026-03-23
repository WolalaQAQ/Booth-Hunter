export type EmbeddingBatchPipelineState = {
  inferredCount: number;
  inferredBatches: number;
  savedCount: number;
  savedBatches: number;
  pendingSaveBatches: number;
  lastInferMs?: number;
  totalInferenceMs: number;
  lastSaveMs?: number;
  totalSaveMs: number;
};

export type EmbeddingBatchPipelineSaveResult = {
  saveMs?: number;
  savedCount?: number;
};

export type RunEmbeddingBatchPipelineOptions<T, TResult> = {
  items: T[];
  batchSize: number;
  maxPendingSaveBatches?: number;
  embedBatch: (batch: T[]) => Promise<TResult>;
  saveBatch: (batch: T[], result: TResult) => Promise<EmbeddingBatchPipelineSaveResult | void>;
  now?: () => number;
  onState?: (state: EmbeddingBatchPipelineState) => void;
};

function chunkItems<T>(items: T[], size: number): T[][] {
  const safeSize = Math.max(1, Math.floor(size) || 1);
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += safeSize) {
    batches.push(items.slice(index, index + safeSize));
  }
  return batches;
}

export async function runEmbeddingBatchPipeline<T, TResult>(
  options: RunEmbeddingBatchPipelineOptions<T, TResult>
): Promise<EmbeddingBatchPipelineState> {
  const now = options.now || (() => Date.now());
  const maxPendingSaveBatches = Math.max(1, options.maxPendingSaveBatches ?? 2);
  const state: EmbeddingBatchPipelineState = {
    inferredCount: 0,
    inferredBatches: 0,
    savedCount: 0,
    savedBatches: 0,
    pendingSaveBatches: 0,
    totalInferenceMs: 0,
    totalSaveMs: 0,
  };
  const pendingSavePromises: Promise<void>[] = [];

  function emitState() {
    options.onState?.({ ...state });
  }

  async function awaitOldestPendingSave() {
    const next = pendingSavePromises.shift();
    if (next) {
      await next;
    }
  }

  for (const batch of chunkItems(options.items, options.batchSize)) {
    const inferStartedAt = now();
    const result = await options.embedBatch(batch);
    state.lastInferMs = now() - inferStartedAt;
    state.totalInferenceMs += state.lastInferMs;
    state.inferredCount += batch.length;
    state.inferredBatches += 1;
    emitState();

    state.pendingSaveBatches += 1;
    emitState();

    const savePromise = (async () => {
      try {
        const saveResult = (await options.saveBatch(batch, result)) || {};
        state.lastSaveMs = saveResult.saveMs;
        if (saveResult.saveMs !== undefined) {
          state.totalSaveMs += saveResult.saveMs;
        }
        state.savedCount += saveResult.savedCount ?? batch.length;
        state.savedBatches += 1;
      } finally {
        state.pendingSaveBatches = Math.max(0, state.pendingSaveBatches - 1);
        emitState();
      }
    })();
    pendingSavePromises.push(savePromise);

    if (pendingSavePromises.length >= maxPendingSaveBatches) {
      await awaitOldestPendingSave();
    }
  }

  while (pendingSavePromises.length > 0) {
    await awaitOldestPendingSave();
  }

  return { ...state };
}

