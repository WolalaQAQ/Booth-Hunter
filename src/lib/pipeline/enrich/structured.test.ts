import test from "node:test";
import assert from "node:assert/strict";

import { extractStructuredSignals } from "./structured";

test("extractStructuredSignals detects parts, styles, and compatibility hints", () => {
  const structured = extractStructuredSignals({
    title: "サイバー風メイド衣装",
    description: "VRChat向けのゴシック寄りメイド服。ModularAvatar対応。",
    tags: ["VRChat", "maid", "cyber"],
    captions: ["full body maid outfit with cyber accessories"],
    ocrTexts: ["ModularAvatar lilToon"],
  });

  assert.deepEqual(structured.parts.includes("outfit"), true);
  assert.deepEqual(structured.styles.includes("maid"), true);
  assert.deepEqual(structured.styles.includes("cyber"), true);
  assert.deepEqual(structured.compatibilityHints.includes("ModularAvatar"), true);
  assert.deepEqual(structured.compatibilityHints.includes("lilToon"), true);
});
