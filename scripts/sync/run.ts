import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Client, Databases } from 'node-appwrite';

import { getServerAppwriteConfig } from '../../src/lib/appwrite/config';
import { AppwriteCatalogRepository } from '../../src/lib/repositories/catalog/appwriteCatalog';
import { fetchBrowsePage, fetchItemJson } from '../../src/lib/pipeline/booth/adapter';
import { downloadAndPrepareImage } from '../../src/lib/pipeline/images/cache';
import { normalizeBoothItem } from '../../src/lib/pipeline/normalize/catalog';
import {
  getNormalizedItem,
  listItemImagesForItem,
  openPipelineDatabase,
  upsertItemImage,
  upsertNormalizedItem,
  upsertRawItem,
} from '../../src/lib/pipeline/sqlite/db';
import { mapWithConcurrency } from '../../src/lib/utils/async';
import { createTerminalProgressReporter, type ProgressPostfixField } from '../../src/lib/utils/progress';

function argument(name: string, fallback: string): string {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
}

function booleanArgument(name: string, fallback = false): boolean {
  const value = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (!value) {
    return fallback;
  }
  return value.slice(`--${name}=`.length).toLowerCase() === 'true';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(label: string, attempts: number, task: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        break;
      }
      const backoffMs = Math.min(5000, 500 * 2 ** (attempt - 1));
      console.warn(`${label} failed on attempt ${attempt}/${attempts}: ${String(error)}. Retrying in ${backoffMs}ms.`);
      await sleep(backoffMs);
    }
  }
  throw lastError;
}

async function maybeCreateCatalogRepository() {
  const required = ['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_DATABASE_ID', 'APPWRITE_API_KEY'];
  const hasConfig = required.every((key) => !!process.env[key]);
  if (!hasConfig) return null;

  const config = getServerAppwriteConfig(process.env as Record<string, string | undefined>);
  const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId).setKey(config.apiKey);
  return new AppwriteCatalogRepository(new Databases(client) as any, config);
}

async function main() {
  const dbPath = argument('db', 'data/raw/booth-pipeline.sqlite');
  const pages = Math.max(1, Number(argument('pages', '1')) || 1);
  const limit = Math.max(1, Number(argument('limit', '20')) || 20);
  const itemConcurrency = Math.max(1, Number(argument('item-concurrency', '4')) || 4);
  const imageConcurrency = Math.max(1, Number(argument('image-concurrency', '1')) || 1);
  const retryAttempts = Math.max(1, Number(argument('retry-attempts', '3')) || 3);
  const skipExisting = booleanArgument('skip-existing', false);
  const db = openPipelineDatabase(dbPath);
  const publishRepo = await maybeCreateCatalogRepository();
  const publishedItems = [];
  const initialCount = Number((db.prepare(`SELECT COUNT(*) as count FROM normalized_items`).get() as { count: number }).count || 0);
  const startedAt = Date.now();
  let processed = 0;
  let skippedExisting = 0;
  const timings = {
    pageFetchMs: 0,
    pageFetchCount: 0,
    itemJsonMs: 0,
    itemJsonCount: 0,
    imageDownloadMs: 0,
    imageDownloadCount: 0,
    itemProcessMs: 0,
    itemProcessCount: 0,
  };
  const progressReporter = createTerminalProgressReporter({ checkpointIntervalMs: 5_000 });
  const disposeConsoleBridge = progressReporter.installConsoleBridge();

  function averageMs(totalMs: number, count: number): string {
    return count > 0 ? `${Math.round(totalMs / count)}ms` : '-';
  }

  async function measure<T>(key: keyof typeof timings, countKey: keyof typeof timings, task: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try {
      return await task();
    } finally {
      const duration = performance.now() - started;
      timings[key] += duration;
      timings[countKey] += 1;
    }
  }

  function emitProgress(page: number, forceLog = false) {
    const totalNow = skipExisting ? initialCount + processed : processed;
    const elapsedSeconds = Math.max(1, (Date.now() - startedAt) / 1000);
    const avgImagesPerItem =
      timings.itemProcessCount > 0 ? (timings.imageDownloadCount / timings.itemProcessCount).toFixed(1) : '0.0';
    const postfix: ProgressPostfixField[] = [
      { label: 'new', shortLabel: 'new', value: processed, priority: 100 },
      { label: 'skipped', shortLabel: 'sk', value: skippedExisting, priority: 95 },
      { label: 'page', shortLabel: 'pg', value: `${page}/${pages}`, priority: 90 },
      { label: 'avgJson', shortLabel: 'json', value: averageMs(timings.itemJsonMs, timings.itemJsonCount), priority: 70 },
      { label: 'avgImg', shortLabel: 'img', value: averageMs(timings.imageDownloadMs, timings.imageDownloadCount), priority: 65 },
      { label: 'avgItem', shortLabel: 'item', value: averageMs(timings.itemProcessMs, timings.itemProcessCount), priority: 60 },
      { label: 'imgsPerItem', shortLabel: 'ipi', value: avgImagesPerItem, priority: 55 },
      { label: 'fanout', shortLabel: 'fan', value: `${itemConcurrency}x${imageConcurrency}`, priority: 50 },
    ];
    progressReporter.renderProgress(
      {
        description: 'sync',
        completed: totalNow,
        total: limit,
        elapsedSeconds,
        postfix,
      },
      { forceLog, final: forceLog }
    );
  }

  async function processDiscoveredItem(discovered: { itemId: string; itemUrl: string }, page: number) {
    return measure('itemProcessMs', 'itemProcessCount', async () => {
      const raw = await measure('itemJsonMs', 'itemJsonCount', () =>
        withRetry(`fetch item ${discovered.itemId}`, retryAttempts, () => fetchItemJson(discovered.itemId))
      );
      const rawJson = JSON.stringify(raw);
      const rawHash = crypto.createHash('sha256').update(rawJson).digest('hex');
      upsertRawItem(db, {
        itemId: discovered.itemId,
        listingPage: page,
        sourceUrl: discovered.itemUrl,
        fetchedAt: new Date().toISOString(),
        rawJson,
        rawHash,
      });

      const normalized = normalizeBoothItem(raw);
      upsertNormalizedItem(db, {
        itemId: normalized.itemId,
        normalizedJson: JSON.stringify(normalized),
        contentHash: normalized.contentHash,
        updatedAt: new Date().toISOString(),
      });

      await mapWithConcurrency(normalized.images, imageConcurrency, async (image) => {
        const prepared = await measure('imageDownloadMs', 'imageDownloadCount', () =>
          withRetry(`download image ${normalized.itemId}:${image.imageIndex}`, retryAttempts, () =>
            downloadAndPrepareImage({
              itemId: normalized.itemId,
              imageIndex: image.imageIndex,
              sourceUrl: image.sourceUrl,
            })
          )
        );
        upsertItemImage(db, {
          imageKey: prepared.imageKey,
          itemId: prepared.itemId,
          imageIndex: prepared.imageIndex,
          sourceUrl: prepared.sourceUrl,
          width: prepared.width,
          height: prepared.height,
          sizeBytes: prepared.sizeBytes,
          sha256: prepared.sha256,
          processedAt: prepared.processedAt,
        });
      });

      return normalized;
    });
  }

  try {
    for (let page = 1; page <= pages; page += 1) {
      const currentTotal = skipExisting ? initialCount + processed : processed;
      if (currentTotal >= limit) {
        break;
      }

      const listing = await measure('pageFetchMs', 'pageFetchCount', () =>
        withRetry(`fetch browse page ${page}`, retryAttempts, () => fetchBrowsePage(page))
      );
      const remaining = limit - currentTotal;
      const discoveredItems = listing.items.filter((item) => {
        if (!skipExisting) {
          return true;
        }
        const exists = Boolean(getNormalizedItem(db, item.itemId)) && listItemImagesForItem(db, item.itemId).length > 0;
        if (exists) {
          skippedExisting += 1;
        }
        return !exists;
      });

      const pageItems = discoveredItems.slice(0, remaining);
      const results = await mapWithConcurrency(pageItems, itemConcurrency, async (discovered) => {
        const normalized = await processDiscoveredItem(discovered, page);
        processed += 1;
        emitProgress(page);
        return normalized;
      });

      publishedItems.push(...results);
      emitProgress(page, true);
    }

    if (publishRepo && publishedItems.length > 0) {
      await publishRepo.upsertItems(publishedItems);
      console.log(`Published ${publishedItems.length} compact catalog items to Appwrite.`);
    }

    const finalCount = Number((db.prepare(`SELECT COUNT(*) as count FROM normalized_items`).get() as { count: number }).count || 0);
    console.log(
      `Sync complete. Processed ${processed} new items into ${dbPath}. ` +
        `Initial items=${initialCount}, final items=${finalCount}, skippedExisting=${skippedExisting}, ` +
        `itemConcurrency=${itemConcurrency}, imageConcurrency=${imageConcurrency}, ` +
        `avgPageFetch=${averageMs(timings.pageFetchMs, timings.pageFetchCount)}, ` +
        `avgItemJson=${averageMs(timings.itemJsonMs, timings.itemJsonCount)}, ` +
        `avgImageDownload=${averageMs(timings.imageDownloadMs, timings.imageDownloadCount)}, ` +
        `avgItemProcess=${averageMs(timings.itemProcessMs, timings.itemProcessCount)}.`
    );
  } finally {
    disposeConsoleBridge();
    progressReporter.dispose();
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
