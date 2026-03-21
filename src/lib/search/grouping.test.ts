import test from "node:test";
import assert from "node:assert/strict";

import { groupSearchCandidates } from "./grouping";

test("groupSearchCandidates merges lexical and dense evidence by item id and orders grouped candidates stably", () => {
  const candidates = groupSearchCandidates(
    [
      {
        itemId: "item-1",
        assetId: "item-1:lexical",
        score: 0.6,
        source: "lexical",
        matchedFields: ["compatibilityHints"],
      },
      {
        itemId: "item-1",
        assetId: "item-1:image:0",
        score: 0.8,
        source: "dense_image",
      },
      {
        itemId: "item-2",
        assetId: "item-2:text",
        score: 0.9,
        source: "dense_text",
      },
    ],
    { limit: 5 }
  );

  assert.equal(candidates[0]?.itemId, "item-1");
  assert.equal(candidates[0]?.evidence.length, 2);
  assert.equal(candidates[1]?.itemId, "item-2");
});

test("groupSearchCandidates breaks ties deterministically by item id instead of input order", () => {
  const forward = groupSearchCandidates(
    [
      { itemId: "item-b", assetId: "item-b:text", score: 0.5, source: "dense_text" },
      { itemId: "item-a", assetId: "item-a:text", score: 0.5, source: "dense_text" },
    ],
    { limit: 5 }
  );
  const reversed = groupSearchCandidates(
    [
      { itemId: "item-a", assetId: "item-a:text", score: 0.5, source: "dense_text" },
      { itemId: "item-b", assetId: "item-b:text", score: 0.5, source: "dense_text" },
    ],
    { limit: 5 }
  );

  assert.deepEqual(
    forward.map((candidate) => candidate.itemId),
    ["item-a", "item-b"]
  );
  assert.deepEqual(
    reversed.map((candidate) => candidate.itemId),
    ["item-a", "item-b"]
  );
});
