import test from "node:test";
import assert from "node:assert/strict";

import { embedTextLocal } from "../embed/text";
import { averageVectors, rankTextMatches, rankHybridMatches, rankImageMatchesByItem } from "./search";

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

test("rankImageMatchesByItem keeps the best image score for each item", () => {
  const results = rankImageMatchesByItem(
    [1, 0, 0],
    [
      { itemId: "1", vector: [0.8, 0.2, 0] },
      { itemId: "1", vector: [1, 0, 0] },
      { itemId: "2", vector: [0, 1, 0] },
    ],
    2
  );

  assert.equal(results[0]?.itemId, "1");
  assert.equal(results[1]?.itemId, "2");
  assert.equal(results[0]?.score > results[1]?.score, true);
});

test("averageVectors returns a normalized centroid", () => {
  const result = averageVectors([
    [1, 0, 0],
    [0, 1, 0],
  ]);

  assert.equal(result.length, 3);
  assert.ok(Math.abs(result[0]! - result[1]!) < 1e-6);
  assert.ok(result[2]! === 0);
});
