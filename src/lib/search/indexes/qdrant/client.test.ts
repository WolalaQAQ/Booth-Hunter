import test from "node:test";
import assert from "node:assert/strict";

import { createQdrantClient, getQdrantConfig } from "./client";

test("getQdrantConfig requires url and collection names for explicit env objects", () => {
  assert.throws(
    () =>
      getQdrantConfig({
        QDRANT_URL: "https://qdrant.example",
      }),
    /QDRANT_COLLECTION_ASSETS, QDRANT_COLLECTION_ITEMS/
  );
});

test("getQdrantConfig falls back to local development defaults for process env", () => {
  const snapshot = {
    QDRANT_URL: process.env.QDRANT_URL,
    QDRANT_COLLECTION_ASSETS: process.env.QDRANT_COLLECTION_ASSETS,
    QDRANT_COLLECTION_ITEMS: process.env.QDRANT_COLLECTION_ITEMS,
    QDRANT_API_KEY: process.env.QDRANT_API_KEY,
  };

  delete process.env.QDRANT_URL;
  delete process.env.QDRANT_COLLECTION_ASSETS;
  delete process.env.QDRANT_COLLECTION_ITEMS;
  delete process.env.QDRANT_API_KEY;

  try {
    const config = getQdrantConfig();
    assert.equal(config.url, "http://127.0.0.1:6333");
    assert.equal(config.collections.items, "booth_items");
    assert.equal(config.collections.assets, "booth_assets");
    assert.equal(config.apiKey, undefined);
  } finally {
    if (snapshot.QDRANT_URL === undefined) delete process.env.QDRANT_URL;
    else process.env.QDRANT_URL = snapshot.QDRANT_URL;
    if (snapshot.QDRANT_COLLECTION_ASSETS === undefined) delete process.env.QDRANT_COLLECTION_ASSETS;
    else process.env.QDRANT_COLLECTION_ASSETS = snapshot.QDRANT_COLLECTION_ASSETS;
    if (snapshot.QDRANT_COLLECTION_ITEMS === undefined) delete process.env.QDRANT_COLLECTION_ITEMS;
    else process.env.QDRANT_COLLECTION_ITEMS = snapshot.QDRANT_COLLECTION_ITEMS;
    if (snapshot.QDRANT_API_KEY === undefined) delete process.env.QDRANT_API_KEY;
    else process.env.QDRANT_API_KEY = snapshot.QDRANT_API_KEY;
  }
});

test("getQdrantConfig reads valid settings and createQdrantClient forwards them", () => {
  const config = getQdrantConfig({
    QDRANT_URL: "https://qdrant.example",
    QDRANT_API_KEY: "secret",
    QDRANT_COLLECTION_ASSETS: "booth_assets",
    QDRANT_COLLECTION_ITEMS: "booth_items",
  });

  assert.equal(config.url, "https://qdrant.example");
  assert.equal(config.apiKey, "secret");
  assert.equal(config.collections.assets, "booth_assets");
  assert.equal(config.collections.items, "booth_items");

  class FakeClient {
    static lastOptions: Record<string, string | undefined> | undefined;

    constructor(options: Record<string, string | undefined>) {
      FakeClient.lastOptions = options;
    }
  }

  const client = createQdrantClient(config, FakeClient as never);
  assert.ok(client instanceof FakeClient);
  assert.deepEqual(FakeClient.lastOptions, {
    url: "https://qdrant.example",
    apiKey: "secret",
  });
});

test("getQdrantConfig allows api key to be omitted", () => {
  const config = getQdrantConfig({
    QDRANT_URL: "https://qdrant.example",
    QDRANT_COLLECTION_ASSETS: "booth_assets",
    QDRANT_COLLECTION_ITEMS: "booth_items",
  });

  assert.equal(config.apiKey, undefined);
});
