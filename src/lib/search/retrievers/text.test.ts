import test from "node:test";
import assert from "node:assert/strict";

import { createTextRetriever } from "./text";

test("text retriever embeds query, fans out to dense and lexical retrieval, then groups by item", async () => {
  const calls: string[] = [];
  const retriever = createTextRetriever({
    embedQuery: async (query) => {
      calls.push(`embed:${query.text}`);
      return [0.1, 0.2, 0.3];
    },
    denseSearch: async (vector, query) => {
      calls.push(`dense:${query.text}:${vector.length}`);
      return [
        { itemId: "item-1", assetId: "item-1:text", score: 0.9, source: "dense_text" },
        { itemId: "item-2", assetId: "item-2:text", score: 0.3, source: "dense_text" },
      ];
    },
    lexicalSearch: async (text) => {
      calls.push(`lexical:${text}`);
      return [
        { itemId: "item-1", assetId: "item-1:lexical", score: 0.6, source: "lexical" },
      ];
    },
    groupCandidates: (evidence, limit) => {
      calls.push(`group:${limit}:${evidence.length}`);
      return [
        { itemId: "item-1", score: 1.5, evidence: evidence.filter((entry) => entry.itemId === "item-1") },
        { itemId: "item-2", score: 0.3, evidence: evidence.filter((entry) => entry.itemId === "item-2") },
      ];
    },
  });

  const result = await retriever.search({ text: "kikyo maid outfit", limit: 5 });

  assert.deepEqual(calls, [
    "embed:kikyo maid outfit",
    "dense:kikyo maid outfit:3",
    "lexical:kikyo maid outfit",
    "group:5:3",
  ]);
  assert.equal(result.query.kind, "text");
  assert.equal(result.candidates[0]?.itemId, "item-1");
  assert.equal(result.candidates[0]?.evidence.length, 2);
  assert.equal(result.candidates[1]?.itemId, "item-2");
});

test("text retriever propagates filters and uses the default limit", async () => {
  const observed: { filterValue?: string; limit?: number } = {};
  const retriever = createTextRetriever({
    embedQuery: async (query) => {
      observed.filterValue = String(query.filters?.avatar);
      return [1];
    },
    denseSearch: async () => [],
    lexicalSearch: async () => [],
    groupCandidates: (_evidence, limit) => {
      observed.limit = limit;
      return [];
    },
  });

  await retriever.search({ text: "selestia dress", filters: { avatar: "Selestia" } });

  assert.equal(observed.filterValue, "Selestia");
  assert.equal(observed.limit, 10);
});
