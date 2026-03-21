import test from "node:test";
import assert from "node:assert/strict";

import { evaluateGoal12Benchmark, Goal12Benchmark } from "./evaluate";

const benchmark: Goal12Benchmark = {
  cases: [
    {
      id: "text-hit",
      kind: "text",
      query: {
        text: "kikyo maid outfit",
      },
      relevantItemIds: ["item-1"],
    },
    {
      id: "image-miss",
      kind: "image",
      query: {
        imagePath: "https://example.com/query.png",
      },
      relevantItemIds: ["item-2"],
    },
  ],
};

test("evaluateGoal12Benchmark reports top-k hit rate and candidate usefulness", async () => {
  const result = await evaluateGoal12Benchmark(
    benchmark,
    async (benchmarkCase) => {
      if (benchmarkCase.id === "text-hit") {
        return {
          query: { kind: "text", text: benchmarkCase.query.text, limit: 10 },
          evidence: [],
          candidates: [
            { itemId: "item-1", score: 0.92, evidence: [] },
            { itemId: "item-3", score: 0.55, evidence: [] },
          ],
        };
      }

      return {
        query: {
          kind: "image",
          imagePath: benchmarkCase.kind === "image" ? benchmarkCase.query.imagePath : "https://example.com/query.png",
          limit: 10,
        },
        evidence: [],
        candidates: [
          { itemId: "item-4", score: 0.88, evidence: [] },
          { itemId: "item-5", score: 0.62, evidence: [] },
        ],
      };
    },
    { ks: [1, 2] }
  );

  assert.equal(result.summary.totalCases, 2);
  assert.deepEqual(result.summary.hitRateAtK, { 1: 0.5, 2: 0.5 });
  assert.deepEqual(result.summary.candidateUsefulnessAtK, { 1: 0.5, 2: 0.25 });
  assert.equal(result.caseResults[0]?.firstRelevantRank, 1);
  assert.equal(result.caseResults[1]?.firstRelevantRank, null);
});
