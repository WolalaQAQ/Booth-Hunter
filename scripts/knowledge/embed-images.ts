import { performance } from 'node:perf_hooks';

import { createPythonEmbeddingProvider, MULTIMODAL_SHARED_SPACE, PythonRuntimeInfo } from '../../src/lib/pipeline/embed/provider';
import { filterPrimaryImageEntries } from '../../src/lib/pipeline/images/select';
import { getImageEmbedding, listAllItemImages, openPipelineDatabase, saveImageEmbedding } from '../../src/lib/pipeline/sqlite/db';
import {
  argument,
  booleanArgument,
  chunk,
  createStageProgress,
  formatDurationMs,
  numberArgument,
  type ProgressPostfixField,
} from './shared';

async function main() {
  const db = openPipelineDatabase(argument('db', 'data/raw/booth-pipeline.sqlite')!);
  const primaryOnly = booleanArgument('primary-only', false);
  const skipExisting = booleanArgument('skip-existing', true);
  const chunkSize = numberArgument('chunk-size', 32);
  const providerBatchSize = numberArgument('provider-batch-size', Number(process.env.EMBED_BATCH_SIZE || '4'));
  const attnImplementation = argument('attn-implementation', process.env.EMBED_ATTN_IMPLEMENTATION || 'flash_attention_2')!;
  const maxLength = numberArgument('max-length', Number(process.env.EMBED_MAX_LENGTH || '8192'));
  const imageMaxPixels = numberArgument('max-pixels', Number(process.env.EMBED_IMAGE_MAX_PIXELS || '1843200'));

  try {
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
    const progress = createStageProgress({ stage: 'embed-images', total: Math.max(1, total) });
    let completed = 0;
    let completedChunks = 0;
    let totalInferenceMs = 0;
    let totalSaveMs = 0;
    let currentChunkStartedAt = 0;
    let currentFirstInnerProgressMs: number | undefined;
    let firstChunkWarmupMs: number | undefined;
    let runtime: PythonRuntimeInfo = {};

    function buildPostfix(): ProgressPostfixField[] {
      const avgInferChunkMs = completedChunks > 0 ? totalInferenceMs / completedChunks : undefined;
      const avgSaveChunkMs = completedChunks > 0 ? totalSaveMs / completedChunks : undefined;
      return [
        { label: 'queued', shortLabel: 'q', value: pending.length, priority: 100 },
        { label: 'skipped', shortLabel: 'sk', value: skipped, priority: 95 },
        { label: 'chunkSize', shortLabel: 'chunk', value: chunkSize, priority: 90 },
        { label: 'providerBatchSize', shortLabel: 'pbs', value: providerBatchSize, priority: 85 },
        { label: 'maxLen', shortLabel: 'len', value: maxLength, priority: 80 },
        { label: 'maxPx', shortLabel: 'px', value: imageMaxPixels, priority: 75 },
        { label: 'primaryOnly', shortLabel: 'p0', value: primaryOnly ? 'yes' : 'no', priority: 70 },
        { label: 'prep', shortLabel: 'prep', value: formatDurationMs(prepareMs), priority: 65 },
        { label: 'warmup', shortLabel: 'warm', value: formatDurationMs(currentFirstInnerProgressMs ?? firstChunkWarmupMs), priority: 60 },
        { label: 'avgInfer', shortLabel: 'infer', value: formatDurationMs(avgInferChunkMs), priority: 55 },
        { label: 'avgSave', shortLabel: 'save', value: formatDurationMs(avgSaveChunkMs), priority: 50 },
        { label: 'requestedAttn', shortLabel: 'attn', value: attnImplementation, priority: 40 },
        { label: 'resolvedAttn', shortLabel: 'rattn', value: runtime.resolvedAttentionImplementation || '-', priority: 35 },
        { label: 'xformers', shortLabel: 'xf', value: runtime.xformersAvailable ? 'yes' : 'no', priority: 20 },
        { label: 'flashAttn', shortLabel: 'fa', value: runtime.flashAttentionAvailable ? 'yes' : 'no', priority: 20 },
      ];
    }

    const provider = createPythonEmbeddingProvider({
      batchSize: providerBatchSize,
      attnImplementation,
      maxLength,
      imageMaxPixels,
      onEmbeddingProgress: (inner) => {
        if (currentChunkStartedAt > 0 && currentFirstInnerProgressMs === undefined && inner.completed > 0) {
          currentFirstInnerProgressMs = performance.now() - currentChunkStartedAt;
          firstChunkWarmupMs = firstChunkWarmupMs ?? currentFirstInnerProgressMs;
        }
        progress.update(skipped + completed + inner.completed, buildPostfix());
      },
    });
    runtime = await provider.getRuntimeInfo();

    try {
      progress.update(skipped, buildPostfix());

      for (const batch of chunk(pending, chunkSize)) {
        currentChunkStartedAt = performance.now();
        currentFirstInnerProgressMs = undefined;
        const response = await provider.embedImages(batch.map((image) => image.sourceUrl));
        totalInferenceMs += performance.now() - currentChunkStartedAt;

        const saveStartedAt = performance.now();
        for (const [index, image] of batch.entries()) {
          saveImageEmbedding(db, {
            imageKey: image.imageKey,
            embeddingSpace: MULTIMODAL_SHARED_SPACE,
            model: response.model,
            vectorJson: JSON.stringify(response.vectors[index] || []),
            updatedAt: new Date().toISOString(),
          });
        }
        totalSaveMs += performance.now() - saveStartedAt;
        completedChunks += 1;
        completed += batch.length;
        progress.update(skipped + completed, buildPostfix());
      }

      progress.update(total, buildPostfix(), true);
    } finally {
      progress.dispose();
    }
    console.log(
      `Image embeddings completed for ${images.length} item images. processed=${completed}, skipped=${skipped}, primaryOnly=${primaryOnly}, ` +
        `chunkSize=${chunkSize}, providerBatchSize=${providerBatchSize}, requestedAttn=${attnImplementation}, resolvedAttn=${runtime.resolvedAttentionImplementation || "-"}, xformers=${runtime.xformersAvailable ? "yes" : "no"}, flashAttn=${runtime.flashAttentionAvailable ? "yes" : "no"}, maxLength=${maxLength}, maxPixels=${imageMaxPixels}, prepare=${formatDurationMs(prepareMs)}, ` +
        `firstWarmup=${formatDurationMs(firstChunkWarmupMs)}, avgInferChunk=${formatDurationMs(
          completedChunks > 0 ? totalInferenceMs / completedChunks : undefined
        )}, avgSaveChunk=${formatDurationMs(completedChunks > 0 ? totalSaveMs / completedChunks : undefined)}.`
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
