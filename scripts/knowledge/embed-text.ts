import { performance } from 'node:perf_hooks';

import { runEmbeddingBatchPipeline, type EmbeddingBatchPipelineState } from '../../src/lib/pipeline/embed/pipeline';
import { buildEmbeddingProgressPostfix } from '../../src/lib/pipeline/embed/scriptProgress';
import { createPythonEmbeddingProvider, MULTIMODAL_SHARED_SPACE } from '../../src/lib/pipeline/embed/provider';
import { createEmbeddingWriter } from '../../src/lib/pipeline/sqlite/embeddingWriter';
import {
  getItemTextEmbedding,
  getStructuredItem,
  listImageAnalysisForItem,
  listNormalizedItems,
  openPipelineDatabase,
  saveItemTextEmbedding,
} from '../../src/lib/pipeline/sqlite/db';
import {
  argument,
  assertKnownArguments,
  booleanArgument,
  createStageProgress,
  formatDurationMs,
  numberArgument,
} from './shared';

async function main() {
  const dbPath = argument('db', 'data/raw/booth-pipeline.sqlite')!;
  assertKnownArguments(['db', 'limit', 'skip-existing', 'provider-batch-size', 'save-batch-size', 'max-pending-save-batches', 'attn-implementation', 'max-length']);

  const db = openPipelineDatabase(dbPath);
  const limit = numberArgument('limit', 100);
  const skipExisting = booleanArgument('skip-existing', true);
  const providerBatchSize = numberArgument('provider-batch-size', Number(process.env.EMBED_BATCH_SIZE || '4'));
  const saveBatchSize = Math.max(1, numberArgument('save-batch-size', providerBatchSize));
  const maxPendingSaveBatches = Math.max(1, numberArgument('max-pending-save-batches', 2));
  const attnImplementation = argument('attn-implementation', process.env.EMBED_ATTN_IMPLEMENTATION || 'flash_attention_2')!;
  const maxLength = numberArgument('max-length', Number(process.env.EMBED_MAX_LENGTH || '8192'));

  try {
    const prepareStartedAt = performance.now();
    const items = listNormalizedItems(db, limit);
    const prepared = [];
    let skipped = 0;

    for (const record of items) {
      const item = JSON.parse(record.normalizedJson) as { itemId: string; normalizedText: string };
      if (skipExisting && getItemTextEmbedding(db, item.itemId, MULTIMODAL_SHARED_SPACE)) {
        skipped += 1;
        continue;
      }

      const structured = getStructuredItem(db, item.itemId);
      const imageSignals = listImageAnalysisForItem(db, item.itemId);
      const corpus = [
        item.normalizedText,
        structured?.structuredJson || '',
        ...imageSignals.flatMap((signal) => [signal.captionText || '', signal.ocrText || '']),
      ].join('\n');

      prepared.push({ itemId: item.itemId, corpus });
    }
    const prepareMs = performance.now() - prepareStartedAt;

    const total = skipped + prepared.length;
    const progress = createStageProgress({ stage: 'embed-text', total: Math.max(1, total) });
    let completed = 0;
    let completedChunks = 0;
    let activeInnerCompleted = 0;
    let totalInferenceMs = 0;
    let totalSaveMs = 0;
    let currentChunkStartedAt = 0;
    let currentFirstInnerProgressMs: number | undefined;
    let firstChunkWarmupMs: number | undefined;
    let lastInferMs: number | undefined;
    let lastSaveMs: number | undefined;
    let pipelineState: EmbeddingBatchPipelineState = {
      inferredCount: 0,
      inferredBatches: 0,
      savedCount: 0,
      savedBatches: 0,
      pendingSaveBatches: 0,
      totalInferenceMs: 0,
      totalSaveMs: 0,
    };

    function buildPostfix() {
      return buildEmbeddingProgressPostfix({
        remaining: Math.max(0, prepared.length - pipelineState.inferredCount - activeInnerCompleted),
        inferred: pipelineState.inferredCount + activeInnerCompleted,
        saved: pipelineState.savedCount,
        skipped,
        pendingSaveBatches: pipelineState.pendingSaveBatches,
        saveBatchSize,
        providerBatchSize,
        prepareMs,
        warmupMs: currentFirstInnerProgressMs ?? firstChunkWarmupMs,
        lastInferMs: pipelineState.lastInferMs ?? lastInferMs,
        totalInferenceMs: pipelineState.totalInferenceMs,
        completedInferBatches: pipelineState.inferredBatches,
        lastSaveMs: pipelineState.lastSaveMs ?? lastSaveMs,
        totalSaveMs: pipelineState.totalSaveMs,
        completedSaveBatches: pipelineState.savedBatches,
      });
    }

    const provider = createPythonEmbeddingProvider({
      batchSize: providerBatchSize,
      attnImplementation,
      maxLength,
      onEmbeddingProgress: (inner) => {
        activeInnerCompleted = inner.completed;
        if (currentChunkStartedAt > 0 && currentFirstInnerProgressMs === undefined && inner.completed > 0) {
          currentFirstInnerProgressMs = performance.now() - currentChunkStartedAt;
          firstChunkWarmupMs = firstChunkWarmupMs ?? currentFirstInnerProgressMs;
        }
        progress.update(skipped + pipelineState.inferredCount + inner.completed, buildPostfix());
      },
    });
    const writer = createEmbeddingWriter({ dbPath });
    try {
      progress.update(skipped, buildPostfix());

      pipelineState = await runEmbeddingBatchPipeline({
        items: prepared,
        batchSize: saveBatchSize,
        maxPendingSaveBatches,
        async embedBatch(batch) {
          currentChunkStartedAt = performance.now();
          currentFirstInnerProgressMs = undefined;
          activeInnerCompleted = 0;
          const response = await provider.embedTexts(batch.map((entry) => entry.corpus));
          activeInnerCompleted = 0;
          return response;
        },
        async saveBatch(batch, response) {
          const updatedAt = new Date().toISOString();
          const result = await writer.saveTextBatch(
            batch.map((entry, index) => ({
              itemId: entry.itemId,
              embeddingSpace: MULTIMODAL_SHARED_SPACE,
              model: response.model,
              vectorJson: JSON.stringify(response.vectors[index] || []),
              updatedAt,
            }))
          );
          return result;
        },
        onState(state) {
          pipelineState = state;
          lastInferMs = state.lastInferMs ?? lastInferMs;
          lastSaveMs = state.lastSaveMs ?? lastSaveMs;
          totalInferenceMs = state.totalInferenceMs;
          totalSaveMs = state.totalSaveMs;
          completedChunks = state.savedBatches;
          completed = state.savedCount;
          progress.update(skipped + state.inferredCount + activeInnerCompleted, buildPostfix());
        },
      });

      progress.update(total, buildPostfix(), true);
    } finally {
      progress.dispose();
      await writer.dispose();
      await provider.dispose();
    }
    console.log(
      `Text embeddings completed for ${items.length} items. processed=${pipelineState.savedCount}, inferred=${pipelineState.inferredCount}, skipped=${skipped}, ` +
        `saveBatchSize=${saveBatchSize}, providerBatchSize=${providerBatchSize}, maxPendingSaveBatches=${maxPendingSaveBatches}, maxLength=${maxLength}, prepare=${formatDurationMs(prepareMs)}, ` +
        `firstWarmup=${formatDurationMs(firstChunkWarmupMs)}, lastInfer=${formatDurationMs(lastInferMs)}, avgInfer=${formatDurationMs(
          pipelineState.inferredBatches > 0 ? pipelineState.totalInferenceMs / pipelineState.inferredBatches : undefined
        )}, lastSave=${formatDurationMs(lastSaveMs)}, avgSave=${formatDurationMs(
          pipelineState.savedBatches > 0 ? pipelineState.totalSaveMs / pipelineState.savedBatches : undefined
        )}.`
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
