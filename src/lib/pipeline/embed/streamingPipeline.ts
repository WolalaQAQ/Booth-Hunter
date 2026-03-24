export type PrepareInferSavePipelineState = {
  preparedCount: number;
  preparedBatches: number;
  pendingPreparedBatches: number;
  lastPrepareMs?: number;
  totalPrepareMs: number;
  inferredCount: number;
  inferredBatches: number;
  pendingSaveBatches: number;
  lastInferMs?: number;
  totalInferenceMs: number;
  savedCount: number;
  savedBatches: number;
  lastSaveMs?: number;
  totalSaveMs: number;
};

export type PrepareInferSavePipelineSaveResult = {
  saveMs?: number;
  savedCount?: number;
};

export type RunPrepareInferSavePipelineOptions<TItem, TPrepared, TResult> = {
  items: TItem[];
  batchSize: number;
  maxPendingPreparedBatches?: number;
  maxPendingSaveBatches?: number;
  prepareBatch: (batch: TItem[]) => Promise<TPrepared>;
  inferPreparedBatch: (batch: TItem[], prepared: TPrepared) => Promise<TResult>;
  saveBatch: (batch: TItem[], result: TResult) => Promise<PrepareInferSavePipelineSaveResult | void>;
  disposePreparedBatch?: (prepared: TPrepared) => Promise<void> | void;
  now?: () => number;
  onState?: (state: PrepareInferSavePipelineState) => void;
};

function chunkItems<T>(items: T[], size: number): T[][] {
  const safeSize = Math.max(1, Math.floor(size) || 1);
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += safeSize) {
    batches.push(items.slice(index, index + safeSize));
  }
  return batches;
}

export async function runPrepareInferSavePipeline<TItem, TPrepared, TResult>(
  options: RunPrepareInferSavePipelineOptions<TItem, TPrepared, TResult>
): Promise<PrepareInferSavePipelineState> {
  const now = options.now || (() => Date.now());
  const maxPendingPreparedBatches = Math.max(1, options.maxPendingPreparedBatches ?? 2);
  const maxPendingSaveBatches = Math.max(1, options.maxPendingSaveBatches ?? 2);
  const batches = chunkItems(options.items, options.batchSize);
  const state: PrepareInferSavePipelineState = {
    preparedCount: 0,
    preparedBatches: 0,
    pendingPreparedBatches: 0,
    totalPrepareMs: 0,
    inferredCount: 0,
    inferredBatches: 0,
    pendingSaveBatches: 0,
    totalInferenceMs: 0,
    savedCount: 0,
    savedBatches: 0,
    totalSaveMs: 0,
  };
  const preparedBatchPromises = new Map<number, Promise<TPrepared>>();
  const pendingSavePromises: Promise<void>[] = [];
  let nextBatchToPrepare = 0;

  function emitState() {
    options.onState?.({ ...state });
  }

  function observePromise(promise: Promise<unknown>) {
    promise.catch(() => {});
  }

  function fillPrepareWindow() {
    while (nextBatchToPrepare < batches.length && preparedBatchPromises.size < maxPendingPreparedBatches) {
      const batchIndex = nextBatchToPrepare;
      nextBatchToPrepare += 1;
      const batch = batches[batchIndex]!;
      const prepareStartedAt = now();
      const preparePromise = (async () => {
        const prepared = await options.prepareBatch(batch);
        state.lastPrepareMs = now() - prepareStartedAt;
        state.totalPrepareMs += state.lastPrepareMs;
        state.preparedCount += batch.length;
        state.preparedBatches += 1;
        emitState();
        return prepared;
      })();
      observePromise(preparePromise);
      preparedBatchPromises.set(batchIndex, preparePromise);
      state.pendingPreparedBatches = preparedBatchPromises.size;
      emitState();
    }
  }

  async function awaitOldestPendingSave() {
    const next = pendingSavePromises.shift();
    if (next) {
      await next;
    }
  }

  async function disposePrepared(prepared: TPrepared | undefined) {
    if (prepared === undefined) {
      return;
    }
    await options.disposePreparedBatch?.(prepared);
  }

  async function cleanupPreparedBatches() {
    const pendingEntries = [...preparedBatchPromises.entries()];
    preparedBatchPromises.clear();
    state.pendingPreparedBatches = 0;
    emitState();

    for (const [, preparedPromise] of pendingEntries) {
      try {
        const prepared = await preparedPromise;
        await disposePrepared(prepared);
      } catch {
        // ignore failed prepare cleanup
      }
    }
  }

  fillPrepareWindow();

  try {
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex]!;
      const preparedPromise = preparedBatchPromises.get(batchIndex);
      if (!preparedPromise) {
        throw new Error(`Missing prepared batch promise for batch index ${batchIndex}.`);
      }

      preparedBatchPromises.delete(batchIndex);
      state.pendingPreparedBatches = preparedBatchPromises.size;
      emitState();
      fillPrepareWindow();

      const prepared = await preparedPromise;

      const inferStartedAt = now();
      let result: TResult;
      try {
        result = await options.inferPreparedBatch(batch, prepared);
      } finally {
        await disposePrepared(prepared);
      }
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
      observePromise(savePromise);
      pendingSavePromises.push(savePromise);

      if (pendingSavePromises.length >= maxPendingSaveBatches) {
        await awaitOldestPendingSave();
      }
    }

    while (pendingSavePromises.length > 0) {
      await awaitOldestPendingSave();
    }

    return { ...state };
  } catch (error) {
    await cleanupPreparedBatches();
    throw error;
  }
}
