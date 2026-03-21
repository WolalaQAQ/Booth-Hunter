import test from "node:test";
import assert from "node:assert/strict";

import { createImageRetriever } from "./image";

test("image retriever embeds image query, optionally uses lexical hint text, and groups by item", async () => {
  const calls: string[] = [];
  const retriever = createImageRetriever({
    embedQuery: async (query) => {
      calls.push(`embed:${query.imagePath}`);
      return [0.4, 0.5];
    },
    denseSearch: async (vector, query) => {
      calls.push(`dense:${query.imagePath}:${vector.length}`);
      return [
        { itemId: "item-1", assetId: "item-1:image:0", score: 0.95, source: "dense_image" },
        { itemId: "item-1", assetId: "item-1:image:1", score: 0.81, source: "dense_image" },
        { itemId: "item-2", assetId: "item-2:image:0", score: 0.72, source: "dense_image" },
      ];
    },
    lexicalSearch: async (text) => {
      calls.push(`lexical:${text}`);
      return [
        { itemId: "item-2", assetId: "item-2:lexical", score: 0.88, source: "lexical" },
      ];
    },
    groupCandidates: (evidence, limit) => {
      calls.push(`group:${limit}:${evidence.length}`);
      return [
        { itemId: "item-1", score: 1.76, evidence: evidence.filter((entry) => entry.itemId === "item-1") },
        { itemId: "item-2", score: 1.6, evidence: evidence.filter((entry) => entry.itemId === "item-2") },
      ];
    },
  });

  const result = await retriever.search({ imagePath: "C:/tmp/query.png", text: "kikyo", limit: 3 });

  assert.deepEqual(calls, [
    "embed:C:/tmp/query.png",
    "dense:C:/tmp/query.png:2",
    "lexical:kikyo",
    "group:3:4",
  ]);
  assert.equal(result.query.kind, "image");
  assert.equal(result.candidates[0]?.itemId, "item-1");
  assert.equal(result.candidates[0]?.evidence.length, 2);
  assert.equal(result.candidates[1]?.itemId, "item-2");
  assert.equal(result.candidates[1]?.evidence.length, 2);
});

test("image retriever skips lexical lookup when no hint text is provided", async () => {
  let lexicalCalls = 0;
  const retriever = createImageRetriever({
    embedQuery: async (query) => {
      assert.equal(query.filters?.style, "maid");
      return [0.4];
    },
    denseSearch: async () => [],
    lexicalSearch: async () => {
      lexicalCalls += 1;
      return [];
    },
    groupCandidates: () => [],
  });

  await retriever.search({ imagePath: "C:/tmp/query.png", filters: { style: "maid" } });

  assert.equal(lexicalCalls, 0);
});
