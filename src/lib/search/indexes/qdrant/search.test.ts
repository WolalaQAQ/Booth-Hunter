import test from "node:test";
import assert from "node:assert/strict";

import { createQdrantAssetSearcher, createQdrantItemSearcher, buildQdrantFilter } from "./search";

test("buildQdrantFilter maps scalar and array filters into Qdrant must clauses", () => {
  assert.deepEqual(buildQdrantFilter({ isAdult: false, styles: ["maid", "gothic"], priceJpy: 2500 }), {
    must: [
      { key: "isAdult", match: { value: false } },
      { key: "styles", match: { any: ["maid", "gothic"] } },
      { key: "priceJpy", match: { value: 2500 } },
    ],
  });
});

test("item searcher uses the named item vector and maps Qdrant payloads into dense text evidence", async () => {
  const calls: Array<{ collection: string; args: Record<string, unknown> }> = [];
  const searcher = createQdrantItemSearcher({
    collectionName: "items",
    client: {
      async search(collection, args) {
        calls.push({ collection, args: args as Record<string, unknown> });
        return [
          {
            id: "item:item-1",
            score: 0.91,
            payload: {
              itemId: "item-1",
              title: "Kikyo Maid Outfit",
              itemUrl: "https://booth.pm/items/1",
            },
          },
        ];
      },
    },
  });

  const evidence = await searcher([0.1, 0.2], {
    kind: "text",
    text: "kikyo maid outfit",
    limit: 3,
    filters: { styles: ["maid"], isAdult: false },
  });

  assert.equal(calls[0]?.collection, "items");
  assert.deepEqual(calls[0]?.args.vector, { name: "item_text", vector: [0.1, 0.2] });
  assert.deepEqual(calls[0]?.args.filter, {
    must: [
      { key: "styles", match: { any: ["maid"] } },
      { key: "isAdult", match: { value: false } },
    ],
  });
  assert.equal(evidence[0]?.itemId, "item-1");
  assert.equal(evidence[0]?.assetId, "item:item-1");
  assert.equal(evidence[0]?.source, "dense_text");
  assert.equal(evidence[0]?.metadata?.title, "Kikyo Maid Outfit");
  assert.equal(evidence[0]?.metadata?.itemUrl, "https://booth.pm/items/1");
});

test("asset searcher uses the named asset vector and maps Qdrant payloads into dense image evidence", async () => {
  const calls: Array<{ collection: string; args: Record<string, unknown> }> = [];
  const searcher = createQdrantAssetSearcher({
    collectionName: "assets",
    client: {
      async search(collection, args) {
        calls.push({ collection, args: args as Record<string, unknown> });
        return [
          {
            id: "asset:item-1:0",
            score: 0.87,
            payload: {
              itemId: "item-1",
              imageKey: "item-1:0",
              imageIndex: 0,
              title: "Kikyo Maid Outfit",
              itemUrl: "https://booth.pm/items/1",
              sourceUrl: "https://example.com/item-1-0.png",
            },
          },
        ];
      },
    },
  });

  const evidence = await searcher([0.4, 0.5], {
    kind: "image",
    imagePath: "https://example.com/query.png",
    limit: 2,
    filters: { itemId: "item-1" },
  });

  assert.equal(calls[0]?.collection, "assets");
  assert.deepEqual(calls[0]?.args.vector, { name: "asset_image", vector: [0.4, 0.5] });
  assert.deepEqual(calls[0]?.args.filter, {
    must: [{ key: "itemId", match: { value: "item-1" } }],
  });
  assert.equal(evidence[0]?.itemId, "item-1");
  assert.equal(evidence[0]?.assetId, "item-1:0");
  assert.equal(evidence[0]?.source, "dense_image");
  assert.equal(evidence[0]?.metadata?.sourceUrl, "https://example.com/item-1-0.png");
  assert.equal(evidence[0]?.metadata?.imageIndex, 0);
});
