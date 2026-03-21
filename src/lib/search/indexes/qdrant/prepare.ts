import { listNormalizedItemIds, PipelineDatabase } from "../../../pipeline/sqlite/db";
import { createQdrantIndexer, QdrantIndexerClient, QdrantIndexerCollections } from "./indexer";
import { projectAssetPoints, projectItemPoint } from "./projectors";
import {
  buildAssetCollectionSchema,
  buildItemCollectionSchema,
  QdrantAssetPoint,
  QdrantItemPoint,
} from "./schema";

type CollectionExistsResult = boolean | { exists: boolean };

export type EnsureQdrantCollectionsSeededResult = {
  seeded: boolean;
  itemPoints: number;
  assetPoints: number;
};

type LoadedProjectedPoints = {
  itemPoints: QdrantItemPoint[];
  assetPoints: QdrantAssetPoint[];
  emptyReason?: string;
};

function exists(result: CollectionExistsResult): boolean {
  return typeof result === "boolean" ? result : result.exists;
}

function inferItemVectorSize(points: QdrantItemPoint[]): number {
  return points[0]?.vector.item_text.length || 0;
}

function inferAssetVectorSize(points: QdrantAssetPoint[]): number {
  return points[0]?.vector.asset_image.length || 0;
}

async function loadAndValidateProjectedPoints(loadPoints: () => Promise<LoadedProjectedPoints>) {
  const { itemPoints, assetPoints, emptyReason } = await loadPoints();
  const itemVectorSize = inferItemVectorSize(itemPoints);
  const assetVectorSize = inferAssetVectorSize(assetPoints);
  if (itemVectorSize <= 0 || assetVectorSize <= 0) {
    const genericMessage =
      `Unable to seed Qdrant collections because projected points could not infer vector sizes. ` +
      `itemVectorSize=${itemVectorSize}, assetVectorSize=${assetVectorSize}`;
    throw new Error(emptyReason ? `${genericMessage}. ${emptyReason}` : genericMessage);
  }

  return {
    itemPoints,
    assetPoints,
    itemVectorSize,
    assetVectorSize,
  };
}

export async function ensureQdrantCollectionsSeeded(options: {
  client: QdrantIndexerClient;
  collections: QdrantIndexerCollections;
  loadPoints: () => Promise<LoadedProjectedPoints>;
}): Promise<EnsureQdrantCollectionsSeededResult> {
  const itemsExists = exists(await options.client.collectionExists(options.collections.items));
  const assetsExists = exists(await options.client.collectionExists(options.collections.assets));
  if (itemsExists && assetsExists) {
    return {
      seeded: false,
      itemPoints: 0,
      assetPoints: 0,
    };
  }

  const { itemPoints, assetPoints, itemVectorSize, assetVectorSize } = await loadAndValidateProjectedPoints(
    options.loadPoints
  );

  const indexer = createQdrantIndexer({
    client: options.client,
    collections: options.collections,
  });
  await indexer.ensureCollections({ itemVectorSize, assetVectorSize });
  await indexer.upsertPoints({ itemPoints, assetPoints });

  return {
    seeded: true,
    itemPoints: itemPoints.length,
    assetPoints: assetPoints.length,
  };
}

export async function replaceQdrantCollections(options: {
  client: QdrantIndexerClient;
  collections: QdrantIndexerCollections;
  loadPoints: () => Promise<LoadedProjectedPoints>;
}): Promise<EnsureQdrantCollectionsSeededResult> {
  const { itemPoints, assetPoints, itemVectorSize, assetVectorSize } = await loadAndValidateProjectedPoints(
    options.loadPoints
  );

  await options.client.recreateCollection(options.collections.items, buildItemCollectionSchema(itemVectorSize));
  await options.client.recreateCollection(options.collections.assets, buildAssetCollectionSchema(assetVectorSize));

  const indexer = createQdrantIndexer({
    client: options.client,
    collections: options.collections,
  });
  await indexer.upsertPoints({ itemPoints, assetPoints });

  return {
    seeded: true,
    itemPoints: itemPoints.length,
    assetPoints: assetPoints.length,
  };
}

export function projectQdrantPointsFromDatabase(
  db: PipelineDatabase,
  embeddingSpace: string
): {
  normalizedItemCount: number;
  itemPoints: QdrantItemPoint[];
  assetPoints: QdrantAssetPoint[];
} {
  const itemIds = listNormalizedItemIds(db);
  const itemPoints: QdrantItemPoint[] = [];
  const assetPoints: QdrantAssetPoint[] = [];

  for (const itemId of itemIds) {
    const itemPoint = projectItemPoint(db, itemId, embeddingSpace);
    if (itemPoint) {
      itemPoints.push(itemPoint);
    }

    assetPoints.push(...projectAssetPoints(db, itemId, embeddingSpace));
  }

  return {
    normalizedItemCount: itemIds.length,
    itemPoints,
    assetPoints,
  };
}

export async function ensureQdrantCollectionsSeededFromDatabase(options: {
  client: QdrantIndexerClient;
  collections: QdrantIndexerCollections;
  db: PipelineDatabase;
  embeddingSpace: string;
}): Promise<EnsureQdrantCollectionsSeededResult> {
  return ensureQdrantCollectionsSeeded({
    client: options.client,
    collections: options.collections,
    loadPoints: async () => {
      const projected = projectQdrantPointsFromDatabase(options.db, options.embeddingSpace);
      const missingSignals: string[] = [];
      if (projected.normalizedItemCount === 0) {
        missingSignals.push("SQLite contains no normalized_items rows");
      }
      if (projected.itemPoints.length === 0) {
        missingSignals.push(`no projected item text embeddings were found for embedding space "${options.embeddingSpace}"`);
      }
      if (projected.assetPoints.length === 0) {
        missingSignals.push(`no projected image embeddings were found for embedding space "${options.embeddingSpace}"`);
      }

      return {
        itemPoints: projected.itemPoints,
        assetPoints: projected.assetPoints,
        emptyReason:
          missingSignals.length > 0
            ? `Populate the SQLite pipeline first (sync/extract/embed) or point --db at a populated file. Details: ${missingSignals.join("; ")}.`
            : undefined,
      };
    },
  });
}

export async function replaceQdrantCollectionsFromDatabase(options: {
  client: QdrantIndexerClient;
  collections: QdrantIndexerCollections;
  db: PipelineDatabase;
  embeddingSpace: string;
}): Promise<EnsureQdrantCollectionsSeededResult> {
  return replaceQdrantCollections({
    client: options.client,
    collections: options.collections,
    loadPoints: async () => {
      const projected = projectQdrantPointsFromDatabase(options.db, options.embeddingSpace);
      const missingSignals: string[] = [];
      if (projected.normalizedItemCount === 0) {
        missingSignals.push("SQLite contains no normalized_items rows");
      }
      if (projected.itemPoints.length === 0) {
        missingSignals.push(`no projected item text embeddings were found for embedding space "${options.embeddingSpace}"`);
      }
      if (projected.assetPoints.length === 0) {
        missingSignals.push(`no projected image embeddings were found for embedding space "${options.embeddingSpace}"`);
      }

      return {
        itemPoints: projected.itemPoints,
        assetPoints: projected.assetPoints,
        emptyReason:
          missingSignals.length > 0
            ? `Populate the SQLite pipeline first (sync/extract/embed) or point --db at a populated file. Details: ${missingSignals.join("; ")}.`
            : undefined,
      };
    },
  });
}
