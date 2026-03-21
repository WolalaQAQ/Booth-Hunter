import { MULTIMODAL_SHARED_SPACE } from "../../src/lib/pipeline/embed/provider";
import { listNormalizedItemIds, openPipelineDatabase } from "../../src/lib/pipeline/sqlite/db";
import { createQdrantClient, getQdrantConfig } from "../../src/lib/search/indexes/qdrant/client";
import { createQdrantIndexer, QdrantIndexerClient } from "../../src/lib/search/indexes/qdrant/indexer";
import { projectAssetPoints, projectItemPoint } from "../../src/lib/search/indexes/qdrant/projectors";
import { QdrantAssetPoint, QdrantItemPoint } from "../../src/lib/search/indexes/qdrant/schema";

function argument(name: string, fallback?: string): string | undefined {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function getItemVectorSize(points: QdrantItemPoint[]): number {
  return points[0]?.vector.item_text.length || 0;
}

function getAssetVectorSize(points: QdrantAssetPoint[]): number {
  return points[0]?.vector.asset_image.length || 0;
}

async function main() {
  const dbPath = argument("db", "data/raw/booth-pipeline.sqlite")!;
  const embeddingSpace = argument("embedding-space", MULTIMODAL_SHARED_SPACE)!;
  const batchSize = Number(argument("batch-size", "128") || "128");
  const db = openPipelineDatabase(dbPath);

  try {
    const config = getQdrantConfig();
    const client = createQdrantClient(config) as unknown as QdrantIndexerClient;
    const indexer = createQdrantIndexer({
      client,
      collections: config.collections,
    });

    const itemBatch: QdrantItemPoint[] = [];
    const assetBatch: QdrantAssetPoint[] = [];
    let indexedItemPoints = 0;
    let indexedAssetPoints = 0;
    let itemVectorSize = 0;
    let assetVectorSize = 0;
    let collectionsEnsured = false;

    for (const itemId of listNormalizedItemIds(db)) {
      const itemPoint = projectItemPoint(db, itemId, embeddingSpace);
      const assetPoints = projectAssetPoints(db, itemId, embeddingSpace);

      if (itemPoint) {
        itemVectorSize = itemVectorSize || itemPoint.vector.item_text.length;
        itemBatch.push(itemPoint);
      }
      if (assetPoints.length > 0) {
        assetVectorSize = assetVectorSize || assetPoints[0]!.vector.asset_image.length;
        assetBatch.push(...assetPoints);
      }

      if (!collectionsEnsured && itemVectorSize > 0 && assetVectorSize > 0) {
        await indexer.ensureCollections({ itemVectorSize, assetVectorSize });
        collectionsEnsured = true;
      }

      while (collectionsEnsured && itemBatch.length >= batchSize) {
        const batch = itemBatch.splice(0, batchSize);
        indexedItemPoints += batch.length;
        await indexer.upsertPoints({ itemPoints: batch, assetPoints: [] });
      }

      while (collectionsEnsured && assetBatch.length >= batchSize) {
        const batch = assetBatch.splice(0, batchSize);
        indexedAssetPoints += batch.length;
        await indexer.upsertPoints({ itemPoints: [], assetPoints: batch });
      }
    }

    if (!collectionsEnsured) {
      throw new Error(
        `Unable to infer vector sizes from projected points. itemVectorSize=${itemVectorSize}, assetVectorSize=${assetVectorSize}`
      );
    }

    if (itemBatch.length > 0) {
      indexedItemPoints += itemBatch.length;
      await indexer.upsertPoints({ itemPoints: itemBatch.splice(0, itemBatch.length), assetPoints: [] });
    }
    if (assetBatch.length > 0) {
      indexedAssetPoints += assetBatch.length;
      await indexer.upsertPoints({ itemPoints: [], assetPoints: assetBatch.splice(0, assetBatch.length) });
    }

    console.log(
      JSON.stringify(
        {
          dbPath,
          embeddingSpace,
          collections: config.collections,
          itemPoints: indexedItemPoints,
          assetPoints: indexedAssetPoints,
          batchSize,
          itemVectorSize,
          assetVectorSize,
        },
        null,
        2
      )
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
