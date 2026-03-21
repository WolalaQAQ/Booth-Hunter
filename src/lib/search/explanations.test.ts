import test from "node:test";
import assert from "node:assert/strict";

import { buildCandidateExplanation } from "./explanations";

test("buildCandidateExplanation summarizes lexical and dense evidence in human-readable form", () => {
  const explanation = buildCandidateExplanation({
    itemId: "item-1",
    score: 1.8,
    evidence: [
      {
        itemId: "item-1",
        assetId: "item-1:lexical",
        score: 0.7,
        source: "lexical",
        matchedFields: ["compatibilityHints", "styles"],
      },
      {
        itemId: "item-1",
        assetId: "item-1:image:0",
        score: 0.8,
        source: "dense_image",
      },
    ],
  });

  assert.match(explanation, /exact-term/i);
  assert.match(explanation, /compatibility/i);
  assert.match(explanation, /visual/i);
});
