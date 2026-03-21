import { QdrantConfig } from "./client";
import {
  buildAssetCollectionSchema,
  buildItemCollectionSchema,
  QdrantAssetPoint,
  QdrantItemPoint,
} from "./schema";

type CollectionExistsResult = boolean | { exists: boolean };

export type QdrantIndexerClient = {
  collectionExists(collectionName: string): Promise<CollectionExistsResult>;
  createCollection(collectionName: string, schema: Record<string, unknown>): Promise<unknown>;
  getCollection(collectionName: string): Promise<Record<string, unknown>>;
  recreateCollection(collectionName: string, schema: Record<string, unknown>): Promise<unknown>;
  upsert(collectionName: string, args: { wait?: boolean; points: unknown[] }): Promise<unknown>;
};

export type QdrantIndexerCollections = QdrantConfig["collections"];

function exists(result: CollectionExistsResult): boolean {
  return typeof result === "boolean" ? result : result.exists;
}

function extractVectors(collectionInfo: Record<string, unknown>): Record<string, { size?: number; distance?: string }> {
  const config = collectionInfo.config as Record<string, unknown> | undefined;
  const params = config?.params as Record<string, unknown> | undefined;
  const vectors = params?.vectors as Record<string, { size?: number; distance?: string }> | undefined;
  return vectors || {};
}

function schemaMatches(actual: Record<string, { size?: number; distance?: string }>, expected: Record<string, { size: number; distance: string }>): boolean {
  const actualEntries = Object.entries(actual);
  const expectedEntries = Object.entries(expected);
  if (actualEntries.length !== expectedEntries.length) {
    return false;
  }

  return expectedEntries.every(([vectorName, expectedSchema]) => {
    const actualSchema = actual[vectorName];
    return actualSchema?.size === expectedSchema.size && actualSchema?.distance === expectedSchema.distance;
  });
}

async function ensureCollection(
  client: QdrantIndexerClient,
  collectionName: string,
  expectedSchema: Record<string, unknown>
) {
  if (!(await exists(await client.collectionExists(collectionName)))) {
    await client.createCollection(collectionName, expectedSchema);
    return;
  }

  const actual = extractVectors(await client.getCollection(collectionName));
  const expected = ((expectedSchema.vectors as Record<string, { size: number; distance: string }>) || {});
  if (!schemaMatches(actual, expected)) {
    await client.recreateCollection(collectionName, expectedSchema);
  }
}

export function createQdrantIndexer(options: {
  client: QdrantIndexerClient;
  collections: QdrantIndexerCollections;
}) {
  return {
    async ensureCollections(args: { itemVectorSize: number; assetVectorSize: number }) {
      await ensureCollection(options.client, options.collections.items, buildItemCollectionSchema(args.itemVectorSize));
      await ensureCollection(options.client, options.collections.assets, buildAssetCollectionSchema(args.assetVectorSize));
    },

    async upsertPoints(args: { itemPoints: QdrantItemPoint[]; assetPoints: QdrantAssetPoint[] }) {
      if (args.itemPoints.length > 0) {
        await options.client.upsert(options.collections.items, {
          wait: true,
          points: args.itemPoints,
        });
      }

      if (args.assetPoints.length > 0) {
        await options.client.upsert(options.collections.assets, {
          wait: true,
          points: args.assetPoints,
        });
      }
    },
  };
}
