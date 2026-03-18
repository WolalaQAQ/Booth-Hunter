import test from "node:test";
import assert from "node:assert/strict";

import { embedTextLocal, cosineSimilarity } from "./text";

test("embedTextLocal is deterministic and rewards similar text", () => {
  const a = embedTextLocal("VRChat outfit maid black dress");
  const b = embedTextLocal("maid dress for VRChat avatar");
  const c = embedTextLocal("wooden table for fantasy room");

  assert.deepEqual(a, embedTextLocal("VRChat outfit maid black dress"));
  assert.equal(cosineSimilarity(a, b) > cosineSimilarity(a, c), true);
});
