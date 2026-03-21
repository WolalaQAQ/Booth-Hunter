import test from "node:test";
import assert from "node:assert/strict";

import { ensureQdrantCollectionsSeeded, replaceQdrantCollections } from "./prepare";
import { buildAssetPointId, buildItemPointId } from "./schema";

test("ensureQdrantCollectionsSeeded skips projection and indexing when both collections already exist", async () => {
  let loadCalls = 0;
  const calls: string[] = [];
  const client = {
    async collectionExists(name: string) {
      calls.push(`exists:${name}`);
      return { exists: true };
    },
    async createCollection() {
      throw new Error("createCollection should not be called when collections already exist");
    },
    async getCollection(name: string) {
      calls.push(`get:${name}`);
      return {
        config: {
          params: {
            vectors:
              name === "booth_items"
                ? { item_text: { size: 3, distance: "Cosine" } }
                : { asset_image: { size: 2, distance: "Cosine" } },
          },
        },
      };
    },
    async recreateCollection() {
      throw new Error("recreateCollection should not be called when schemas already match");
    },
    async upsert() {
      throw new Error("upsert should not be called when collections already exist");
    },
  };

  const result = await ensureQdrantCollectionsSeeded({
    client,
    collections: {
      items: "booth_items",
      assets: "booth_assets",
    },
    loadPoints: async () => {
      loadCalls += 1;
      return {
        itemPoints: [],
        assetPoints: [],
      };
    },
  });

  assert.equal(result.seeded, false);
  assert.equal(loadCalls, 0);
  assert.deepEqual(calls, [
    "exists:booth_items",
    "exists:booth_assets",
  ]);
});

test("ensureQdrantCollectionsSeeded creates and indexes collections when they are missing", async () => {
  const calls: string[] = [];
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
      return { status: "ok" };
    },
  };

  const result = await ensureQdrantCollectionsSeeded({
    client,
    collections: {
      items: "booth_items",
      assets: "booth_assets",
    },
    loadPoints: async () => ({
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
    }),
  });

  assert.equal(result.seeded, true);
  assert.equal(result.itemPoints, 1);
  assert.equal(result.assetPoints, 1);
  assert.deepEqual(calls, [
    "exists:booth_items",
    "exists:booth_assets",
    "exists:booth_items",
    "create:booth_items:item_text:3",
    "exists:booth_assets",
    "create:booth_assets:asset_image:2",
    "upsert:booth_items:1:true",
    "upsert:booth_assets:1:true",
  ]);
});

test("replaceQdrantCollections recreates both collections and reindexes projected points", async () => {
  const calls: string[] = [];
  const client = {
    async collectionExists() {
      throw new Error("collectionExists should not be called for forced replacement");
    },
    async createCollection() {
      throw new Error("createCollection should not be called for forced replacement");
    },
    async getCollection() {
      throw new Error("getCollection should not be called for forced replacement");
    },
    async recreateCollection(name: string, schema: { vectors: Record<string, { size: number; distance: string }> }) {
      calls.push(`recreate:${name}:${Object.keys(schema.vectors)[0]}:${Object.values(schema.vectors)[0]?.size}`);
      return true;
    },
    async upsert(name: string, args: { wait?: boolean; points: unknown[] }) {
      calls.push(`upsert:${name}:${args.points.length}:${String(args.wait)}`);
      return { status: "ok" };
    },
  };

  const result = await replaceQdrantCollections({
    client,
    collections: {
      items: "booth_items",
      assets: "booth_assets",
    },
    loadPoints: async () => ({
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
    }),
  });

  assert.equal(result.seeded, true);
  assert.equal(result.itemPoints, 1);
  assert.equal(result.assetPoints, 1);
  assert.deepEqual(calls, [
    "recreate:booth_items:item_text:3",
    "recreate:booth_assets:asset_image:2",
    "upsert:booth_items:1:true",
    "upsert:booth_assets:1:true",
  ]);
});
