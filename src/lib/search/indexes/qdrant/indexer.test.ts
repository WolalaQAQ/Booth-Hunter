import test from "node:test";
import assert from "node:assert/strict";

import { createQdrantIndexer } from "./indexer";
import { buildAssetPointId, buildItemPointId } from "./schema";

test("qdrant indexer bootstraps missing collections and upserts item/asset points", async () => {
  const calls: string[] = [];
  const upserts: Array<{ name: string; args: { wait?: boolean; points: unknown[] } }> = [];
  const client = {
    async collectionExists(name: string) {
      calls.push(`exists:${name}`);
      return { exists: false };
    },
    async createCollection(name: string, schema: { vectors: Record<string, { size: number; distance: string }> }) {
      calls.push(`create:${name}:${Object.keys(schema.vectors)[0]}:${Object.values(schema.vectors)[0]?.size}`);
      return true;
    },
    async getCollection() {
      throw new Error("getCollection should not be called for missing collections");
    },
    async recreateCollection() {
      throw new Error("recreateCollection should not be called for missing collections");
    },
    async upsert(name: string, args: { wait?: boolean; points: unknown[] }) {
      calls.push(`upsert:${name}:${args.points.length}:${String(args.wait)}`);
      upserts.push({ name, args });
      return { status: "ok" };
    },
  };

  const indexer = createQdrantIndexer({
    client,
    collections: {
      items: "booth_items",
      assets: "booth_assets",
    },
  });

  await indexer.ensureCollections({
    itemVectorSize: 3,
    assetVectorSize: 2,
  });

  await indexer.upsertPoints({
    itemPoints: [
      {
        id: buildItemPointId("item-1"),
        vector: { item_text: [0.1, 0.2, 0.3] },
        payload: {
          entityType: "item",
          itemId: "item-1",
          title: "Item 1",
          description: "",
          itemUrl: "",
          shopName: "",
          categoryName: "",
          parentCategoryName: "",
          tags: [],
          priceJpy: null,
          priceText: "",
          isAdult: false,
          contentHash: "hash-1",
          parts: [],
          styles: [],
          compatibilityHints: [],
          keywordDigest: [],
          captions: [],
          ocrTexts: [],
          imageCount: 1,
          embeddingSpace: "multimodal-shared",
        },
      },
    ],
    assetPoints: [
      {
        id: buildAssetPointId("item-1:0"),
        vector: { asset_image: [0.9, 0.1] },
        payload: {
          entityType: "asset",
          itemId: "item-1",
          imageKey: "item-1:0",
          imageIndex: 0,
          title: "Item 1",
          itemUrl: "",
          sourceUrl: "",
          parts: [],
          styles: [],
          compatibilityHints: [],
          embeddingSpace: "multimodal-shared",
        },
      },
    ],
  });

  assert.deepEqual(calls, [
    "exists:booth_items",
    "create:booth_items:item_text:3",
    "exists:booth_assets",
    "create:booth_assets:asset_image:2",
    "upsert:booth_items:1:true",
    "upsert:booth_assets:1:true",
  ]);
  assert.deepEqual(upserts, [
    {
      name: "booth_items",
      args: {
        wait: true,
        points: [
          {
            id: buildItemPointId("item-1"),
            vector: { item_text: [0.1, 0.2, 0.3] },
            payload: {
              entityType: "item",
              itemId: "item-1",
              title: "Item 1",
              description: "",
              itemUrl: "",
              shopName: "",
              categoryName: "",
              parentCategoryName: "",
              tags: [],
              priceJpy: null,
              priceText: "",
              isAdult: false,
              contentHash: "hash-1",
              parts: [],
              styles: [],
              compatibilityHints: [],
              keywordDigest: [],
              captions: [],
              ocrTexts: [],
              imageCount: 1,
              embeddingSpace: "multimodal-shared",
            },
          },
        ],
      },
    },
    {
      name: "booth_assets",
      args: {
        wait: true,
        points: [
          {
            id: buildAssetPointId("item-1:0"),
            vector: { asset_image: [0.9, 0.1] },
            payload: {
              entityType: "asset",
              itemId: "item-1",
              imageKey: "item-1:0",
              imageIndex: 0,
              title: "Item 1",
              itemUrl: "",
              sourceUrl: "",
              parts: [],
              styles: [],
              compatibilityHints: [],
              embeddingSpace: "multimodal-shared",
            },
          },
        ],
      },
    },
  ]);
});

test("qdrant indexer recreates collections when existing schema does not match", async () => {
  const calls: string[] = [];
  const client = {
    async collectionExists(name: string) {
      calls.push(`exists:${name}`);
      return { exists: true };
    },
    async getCollection(name: string) {
      calls.push(`get:${name}`);
      return {
        config: {
          params: {
            vectors:
              name === "booth_items"
                ? { item_text: { size: 2, distance: "Cosine" } }
                : { asset_image: { size: 1, distance: "Cosine" } },
          },
        },
      };
    },
    async createCollection() {
      throw new Error("createCollection should not be called when a mismatched collection already exists");
    },
    async recreateCollection(name: string, schema: { vectors: Record<string, { size: number; distance: string }> }) {
      calls.push(`recreate:${name}:${Object.keys(schema.vectors)[0]}:${Object.values(schema.vectors)[0]?.size}`);
      return true;
    },
    async upsert() {
      return { status: "ok" };
    },
  };

  const indexer = createQdrantIndexer({
    client,
    collections: {
      items: "booth_items",
      assets: "booth_assets",
    },
  });

  await indexer.ensureCollections({
    itemVectorSize: 3,
    assetVectorSize: 2,
  });

  assert.deepEqual(calls, [
    "exists:booth_items",
    "get:booth_items",
    "recreate:booth_items:item_text:3",
    "exists:booth_assets",
    "get:booth_assets",
    "recreate:booth_assets:asset_image:2",
  ]);
});
