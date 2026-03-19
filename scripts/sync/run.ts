import crypto from 'node:crypto';
import { Client, Databases } from 'node-appwrite';

import { getServerAppwriteConfig } from '../../src/lib/appwrite/config';
import { AppwriteCatalogRepository } from '../../src/lib/repositories/catalog/appwriteCatalog';
import { fetchBrowsePage, fetchItemJson } from '../../src/lib/pipeline/booth/adapter';
import { downloadAndPrepareImage } from '../../src/lib/pipeline/images/cache';
import { normalizeBoothItem } from '../../src/lib/pipeline/normalize/catalog';
import {
  openPipelineDatabase,
  upsertItemImage,
  upsertNormalizedItem,
  upsertRawItem,
} from '../../src/lib/pipeline/sqlite/db';

function argument(name: string, fallback: string): string {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
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
  const db = openPipelineDatabase(dbPath);
  const publishRepo = await maybeCreateCatalogRepository();
  const publishedItems = [];
  let processed = 0;

  try {
    for (let page = 1; page <= pages; page += 1) {
      const listing = await fetchBrowsePage(page);
      for (const discovered of listing.items) {
        if (processed >= limit) break;
        const raw = await fetchItemJson(discovered.itemId);
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

        for (const image of normalized.images) {
          const prepared = await downloadAndPrepareImage({
            itemId: normalized.itemId,
            imageIndex: image.imageIndex,
            sourceUrl: image.sourceUrl,
          });
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
        }

        publishedItems.push(normalized);
        processed += 1;
      }
      if (processed >= limit) break;
    }

    if (publishRepo && publishedItems.length > 0) {
      await publishRepo.upsertItems(publishedItems);
      console.log(`Published ${publishedItems.length} compact catalog items to Appwrite.`);
    }

    console.log(`Sync complete. Processed ${processed} items into ${dbPath}.`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
