import test from "node:test";
import assert from "node:assert/strict";

import { createQdrantClient, getQdrantConfig } from "./client";

test("getQdrantConfig requires url and collection names", () => {
  assert.throws(
    () =>
      getQdrantConfig({
        QDRANT_URL: "https://qdrant.example",
      }),
    /QDRANT_COLLECTION_ASSETS, QDRANT_COLLECTION_ITEMS/
  );
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
