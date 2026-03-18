import test from "node:test";
import assert from "node:assert/strict";

import { embedTextLocal } from "../embed/text";
import { rankTextMatches, rankHybridMatches } from "./search";

test("rankTextMatches sorts by cosine similarity", () => {
  const docs = [
    { itemId: "1", vector: embedTextLocal("maid outfit for VRChat") },
    { itemId: "2", vector: embedTextLocal("military boots and gloves") },
  ];

  const results = rankTextMatches(embedTextLocal("black maid dress"), docs, 2);
  assert.equal(results[0]?.itemId, "1");
});

test("rankHybridMatches combines text and image scores", () => {
  const results = rankHybridMatches(
    [
      { itemId: "1", score: 0.9 },
      { itemId: "2", score: 0.2 },
    ],
    [
      { itemId: "1", score: 0.1 },
      { itemId: "2", score: 0.8 },
    ],
    0.7,
    0.3,
    2
  );

  assert.equal(results[0]?.itemId, "1");
  assert.equal(results[1]?.itemId, "2");
});
