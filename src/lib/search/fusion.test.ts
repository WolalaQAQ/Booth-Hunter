import test from "node:test";
import assert from "node:assert/strict";

import { fuseSearchEvidence } from "./fusion";

test("fuseSearchEvidence applies configurable source weights without hiding the original scores", () => {
  const fused = fuseSearchEvidence(
    [
      { itemId: "item-1", assetId: "item-1:text", score: 0.7, source: "dense_text" },
      { itemId: "item-1", assetId: "item-1:lexical", score: 0.5, source: "lexical" },
      { itemId: "item-2", assetId: "item-2:image", score: 0.8, source: "dense_image" },
    ],
    {
      dense_text: 1,
      dense_image: 0.8,
      lexical: 1.4,
    }
  );

  assert.equal(fused[0]?.source, "dense_text");
  assert.equal(fused[0]?.weightedScore, 0.7);
  assert.equal(fused[1]?.source, "lexical");
  assert.equal(fused[1]?.weightedScore, 0.7);
  assert.equal(fused[2]?.source, "dense_image");
  assert.ok(Math.abs((fused[2]?.weightedScore || 0) - 0.64) < 1e-9);
});
