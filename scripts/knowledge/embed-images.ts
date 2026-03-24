import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { buildEmbeddingProgressPostfix } from '../../src/lib/pipeline/embed/scriptProgress';
import { createPythonEmbeddingProvider, MULTIMODAL_SHARED_SPACE } from '../../src/lib/pipeline/embed/provider';
import {
  runPrepareInferSavePipeline,
  type PrepareInferSavePipelineState,
} from '../../src/lib/pipeline/embed/streamingPipeline';
import { filterPrimaryImageEntries } from '../../src/lib/pipeline/images/select';
import { stageImageBatchToTempFiles } from '../../src/lib/pipeline/images/staging';
import { getImageEmbedding, listAllItemImages, openPipelineDatabase } from '../../src/lib/pipeline/sqlite/db';
import { createEmbeddingWriter } from '../../src/lib/pipeline/sqlite/embeddingWriter';
import {
  argument,
  assertKnownArguments,
  booleanArgument,
  createStageProgress,
  formatDurationMs,
  numberArgument,
} from './shared';

function defaultProgressLogFile(stage: string): string {
  const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join('data', 'logs', `${stage}-${safeTimestamp}.log`);
}

async function main() {
  const dbPath = argument('db', 'data/raw/booth-pipeline.sqlite')!;
  assertKnownArguments([
    'db',
    'primary-only',
    'skip-existing',
    'provider-batch-size',
    'save-batch-size',
    'max-pending-save-batches',
    'max-pending-prepare-batches',
    'download-concurrency',
    'verbose-progress',
    'progress-log-file',
    'attn-implementation',
    'max-length',
    'max-pixels',
  ]);

  const db = openPipelineDatabase(dbPath);
  const primaryOnly = booleanArgument('primary-only', false);
  const skipExisting = booleanArgument('skip-existing', true);
  const providerBatchSize = numberArgument('provider-batch-size', Number(process.env.EMBED_BATCH_SIZE || '4'));
  const saveBatchSize = Math.max(1, numberArgument('save-batch-size', providerBatchSize));
  const maxPendingSaveBatches = Math.max(1, numberArgument('max-pending-save-batches', 2));
  const maxPendingPrepareBatches = Math.max(
    1,
    numberArgument('max-pending-prepare-batches', Number(process.env.EMBED_IMAGE_PREFETCH_BATCHES || '2'))
  );
  const verboseProgress = booleanArgument('verbose-progress', false);
  const progressLogFile = argument('progress-log-file', defaultProgressLogFile('embed-images'))!;
  const downloadConcurrency = Math.max(
    1,
    numberArgument('download-concurrency', Number(process.env.EMBED_IMAGE_DOWNLOAD_CONCURRENCY || '8'))
  );
  const attnImplementation = argument('attn-implementation', process.env.EMBED_ATTN_IMPLEMENTATION || 'flash_attention_2')!;
  const maxLength = numberArgument('max-length', Number(process.env.EMBED_MAX_LENGTH || '8192'));
  const imageMaxPixels = numberArgument('max-pixels', Number(process.env.EMBED_IMAGE_MAX_PIXELS || '1843200'));
  fs.mkdirSync(path.dirname(progressLogFile), { recursive: true });
  const progressLogStream = fs.createWriteStream(progressLogFile, { flags: 'a' });

  function writeProgressLogLine(message: string) {
    progressLogStream.write(message.endsWith('\n') ? message : `${message}\n`);
  }

  function writeProgressLogText(message: string) {
    progressLogStream.write(message);
  }

  try {
    writeProgressLogLine(
      `[embed-images] started db=${dbPath} primaryOnly=${primaryOnly} skipExisting=${skipExisting} ` +
        `providerBatchSize=${providerBatchSize} saveBatchSize=${saveBatchSize} maxPendingPrepareBatches=${maxPendingPrepareBatches} ` +
        `maxPendingSaveBatches=${maxPendingSaveBatches} downloadConcurrency=${downloadConcurrency} verboseProgress=${verboseProgress}`
    );
    const prepareStartedAt = performance.now();
    const images = filterPrimaryImageEntries(listAllItemImages(db), primaryOnly);
    const pending = [];
    let skipped = 0;

    for (const image of images) {
      if (skipExisting && getImageEmbedding(db, image.imageKey, MULTIMODAL_SHARED_SPACE)) {
        skipped += 1;
        continue;
      }
      pending.push(image);
    }
    const prepareMs = performance.now() - prepareStartedAt;

    const total = skipped + pending.length;
    const progress = createStageProgress(
      { stage: 'embed-images', total: Math.max(1, total) },
      {
        checkpointIntervalMs: 0,
        logWriter: writeProgressLogLine,
      }
    );
    let activeInnerCompleted = 0;
    let currentChunkStartedAt = 0;
    let currentFirstInnerProgressMs: number | undefined;
    let firstChunkWarmupMs: number | undefined;
    let lastInferMs: number | undefined;
    let lastSaveMs: number | undefined;
    const activePrepareProgress = new Map<string, { completed: number; total: number }>();
    let pipelineState: PrepareInferSavePipelineState = {
      preparedCount: 0,
      preparedBatches: 0,
      pendingPreparedBatches: 0,
      totalPrepareMs: 0,
      inferredCount: 0,
      inferredBatches: 0,
      savedCount: 0,
      savedBatches: 0,
      pendingSaveBatches: 0,
      totalInferenceMs: 0,
      totalSaveMs: 0,
    };

    function buildPostfix(mode: 'compact' | 'verbose') {
      const activePreparedCompleted = [...activePrepareProgress.values()].reduce((sum, entry) => sum + entry.completed, 0);
      const activePreparedTotal = [...activePrepareProgress.values()].reduce((sum, entry) => sum + entry.total, 0);
      return buildEmbeddingProgressPostfix({
        remaining: Math.max(0, pending.length - pipelineState.inferredCount - activeInnerCompleted),
        inferred: pipelineState.inferredCount + activeInnerCompleted,
        saved: pipelineState.savedCount,
        skipped,
        pendingSaveBatches: pipelineState.pendingSaveBatches,
        saveBatchSize,
        providerBatchSize,
        prepareMs,
        warmupMs: currentFirstInnerProgressMs ?? firstChunkWarmupMs,
        lastPrepareMs: pipelineState.lastPrepareMs,
        totalPrepareMs: pipelineState.totalPrepareMs,
        completedPrepareBatches: pipelineState.preparedBatches,
        lastInferMs: pipelineState.lastInferMs ?? lastInferMs,
        totalInferenceMs: pipelineState.totalInferenceMs,
        completedInferBatches: pipelineState.inferredBatches,
        lastSaveMs: pipelineState.lastSaveMs ?? lastSaveMs,
        totalSaveMs: pipelineState.totalSaveMs,
        completedSaveBatches: pipelineState.savedBatches,
        mode,
        extraFields: [
          { label: 'prefetchWindow', shortLabel: 'pfw', value: maxPendingPrepareBatches, priority: 89 },
          { label: 'downloadConcurrency', shortLabel: 'dlc', value: downloadConcurrency, priority: 88 },
          {
            label: 'prepared',
            shortLabel: 'prepQ',
            value: pipelineState.preparedCount + activePreparedCompleted,
            priority: 86,
          },
          {
            label: 'preparing',
            shortLabel: 'prep',
            value: activePreparedTotal > 0 ? `${activePreparedCompleted}/${activePreparedTotal}` : undefined,
            priority: 84,
          },
          { label: 'pendingPreparedBatches', shortLabel: 'pp', value: pipelineState.pendingPreparedBatches, priority: 83 },
        ],
      });
    }

    function renderProgress(completed: number, forceLog = false) {
      const verbosePostfix = buildPostfix('verbose');
      const compactPostfix = verboseProgress ? verbosePostfix : buildPostfix('compact');
      progress.update(completed, compactPostfix, forceLog, verbosePostfix);
    }

    const provider = createPythonEmbeddingProvider({
      batchSize: providerBatchSize,
      attnImplementation,
      maxLength,
      imageMaxPixels,
      stderrWriter: writeProgressLogText,
      onEmbeddingProgress: (inner) => {
        activeInnerCompleted = inner.completed;
        if (currentChunkStartedAt > 0 && currentFirstInnerProgressMs === undefined && inner.completed > 0) {
          currentFirstInnerProgressMs = performance.now() - currentChunkStartedAt;
          firstChunkWarmupMs = firstChunkWarmupMs ?? currentFirstInnerProgressMs;
        }
        renderProgress(skipped + pipelineState.inferredCount + inner.completed);
      },
    });
    const writer = createEmbeddingWriter({ dbPath });

    try {
      renderProgress(skipped);

      pipelineState = await runPrepareInferSavePipeline({
        items: pending,
        batchSize: saveBatchSize,
        maxPendingPreparedBatches: maxPendingPrepareBatches,
        maxPendingSaveBatches,
        async prepareBatch(batch) {
          const batchKey = batch.map((image) => image.imageKey).join('|');
          activePrepareProgress.set(batchKey, { completed: 0, total: batch.length });
          renderProgress(skipped + pipelineState.inferredCount + activeInnerCompleted);
          try {
            return {
              batchKey,
              stagedBatch: await stageImageBatchToTempFiles(batch, {
                concurrency: Math.min(downloadConcurrency, Math.max(1, batch.length)),
                onProgress(downloadProgress) {
                  activePrepareProgress.set(batchKey, {
                    completed: downloadProgress.completed,
                    total: downloadProgress.total,
                  });
                  renderProgress(skipped + pipelineState.inferredCount + activeInnerCompleted);
                },
              }),
            };
          } finally {
            activePrepareProgress.delete(batchKey);
          }
        },
        async inferPreparedBatch(batch, preparedBatch) {
          currentChunkStartedAt = performance.now();
          currentFirstInnerProgressMs = undefined;
          activeInnerCompleted = 0;
          const response = await provider.embedImages(preparedBatch.stagedBatch.images.map((image) => image.localPath));
          activeInnerCompleted = 0;
          return response;
        },
        async disposePreparedBatch(preparedBatch) {
          await preparedBatch.stagedBatch.dispose();
        },
        async saveBatch(batch, response) {
          const updatedAt = new Date().toISOString();
          return await writer.saveImageBatch(
            batch.map((image, index) => ({
              imageKey: image.imageKey,
              embeddingSpace: MULTIMODAL_SHARED_SPACE,
              model: response.model,
              vectorJson: JSON.stringify(response.vectors[index] || []),
              updatedAt,
            }))
          );
        },
        onState(state) {
          pipelineState = state;
          lastInferMs = state.lastInferMs ?? lastInferMs;
          lastSaveMs = state.lastSaveMs ?? lastSaveMs;
          renderProgress(skipped + state.inferredCount + activeInnerCompleted);
        },
      });

      renderProgress(total, true);
    } finally {
      progress.dispose();
      await writer.dispose();
      await provider.dispose();
    }
    const summary =
      `Image embeddings completed for ${images.length} item images. processed=${pipelineState.savedCount}, inferred=${pipelineState.inferredCount}, skipped=${skipped}, primaryOnly=${primaryOnly}, ` +
        `saveBatchSize=${saveBatchSize}, providerBatchSize=${providerBatchSize}, downloadConcurrency=${downloadConcurrency}, maxPendingPrepareBatches=${maxPendingPrepareBatches}, maxPendingSaveBatches=${maxPendingSaveBatches}, maxLength=${maxLength}, maxPixels=${imageMaxPixels}, prepare=${formatDurationMs(prepareMs)}, ` +
        `lastPrepareStage=${formatDurationMs(pipelineState.lastPrepareMs)}, avgPrepareStage=${formatDurationMs(
          pipelineState.preparedBatches > 0 ? pipelineState.totalPrepareMs / pipelineState.preparedBatches : undefined
        )}, ` +
        `firstWarmup=${formatDurationMs(firstChunkWarmupMs)}, lastInfer=${formatDurationMs(lastInferMs)}, avgInfer=${formatDurationMs(
          pipelineState.inferredBatches > 0 ? pipelineState.totalInferenceMs / pipelineState.inferredBatches : undefined
        )}, lastSave=${formatDurationMs(lastSaveMs)}, avgSave=${formatDurationMs(
          pipelineState.savedBatches > 0 ? pipelineState.totalSaveMs / pipelineState.savedBatches : undefined
        )}. progressLogFile=${progressLogFile}`;
    writeProgressLogLine(summary);
    console.log(summary);
  } catch (error) {
    writeProgressLogLine(`[embed-images] error ${(error as Error).stack || String(error)}`);
    throw error;
  } finally {
    progressLogStream.end();
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
