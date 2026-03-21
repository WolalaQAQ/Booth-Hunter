import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { createSqliteLexicalSearcher } from "./lexical";
import {
  openPipelineDatabase,
  saveImageAnalysis,
  saveStructuredItem,
  upsertNormalizedItem,
} from "../../pipeline/sqlite/db";
import { embedTextLocal } from "../../pipeline/embed/text";
import { rankTextMatches } from "../../pipeline/retrieval/search";

function tempDbPath(name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "booth-hunter-lexical-"));
  return path.join(dir, name);
}

test("sqlite lexical search corrects an exact-term-heavy fixture that dense-only ranking would blur", () => {
  const db = openPipelineDatabase(tempDbPath("lexical.sqlite"));
  const kikyoNormalizedText = "Classic Short Boots leather boots for VRChat avatars";
  const genericNormalizedText = "Cute Maid Boots for many avatars";

  upsertNormalizedItem(db, {
    itemId: "item-kikyo",
    normalizedJson: JSON.stringify({
      title: "Classic Short Boots",
      description: "Leather boots for VRChat avatars.",
      normalizedText: kikyoNormalizedText,
      tags: ["boots", "footwear"],
      shopName: "Test Shop",
      categoryName: "3D Models",
      parentCategoryName: "Avatar Fashion",
      priceText: "1200 JPY",
    }),
    contentHash: "content-kikyo",
    updatedAt: "2026-03-21T01:00:00.000Z",
  });
  saveStructuredItem(db, {
    itemId: "item-kikyo",
    structuredJson: JSON.stringify({
      parts: ["shoes"],
      styles: ["maid"],
      compatibilityHints: ["Kikyo"],
      keywordDigest: ["ankle", "lace"],
    }),
    updatedAt: "2026-03-21T01:01:00.000Z",
  });
  saveImageAnalysis(db, {
    imageKey: "item-kikyo:0",
    itemId: "item-kikyo",
    imageIndex: 0,
    captionText: "maid look ankle boots",
    ocrText: "Kikyo",
    updatedAt: "2026-03-21T01:02:00.000Z",
  });

  upsertNormalizedItem(db, {
    itemId: "item-generic",
    normalizedJson: JSON.stringify({
      title: "Cute Maid Dress",
      description: "Cute maid dress for many avatars.",
      normalizedText: genericNormalizedText,
      tags: ["maid", "boots"],
      shopName: "Test Shop",
      categoryName: "3D Models",
      parentCategoryName: "Avatar Fashion",
      priceText: "1600 JPY",
    }),
    contentHash: "content-generic",
    updatedAt: "2026-03-21T01:03:00.000Z",
  });

  const denseOnly = rankTextMatches(
    embedTextLocal("Kikyo maid boots"),
    [
      { itemId: "item-kikyo", vector: embedTextLocal(kikyoNormalizedText) },
      { itemId: "item-generic", vector: embedTextLocal(genericNormalizedText) },
    ],
    5
  );
  const lexical = createSqliteLexicalSearcher(db);
  const results = lexical.search({ text: "Kikyo maid boots", limit: 5 });

  assert.equal(denseOnly[0]?.itemId, "item-generic");
  assert.equal(results[0]?.itemId, "item-kikyo");
  assert.equal(results[0]?.source, "lexical");
  assert.ok((results[0]?.matchedFields || []).includes("compatibilityHints"));
  assert.ok((results[0]?.matchedFields || []).includes("styles"));

  db.close();
});

test("sqlite lexical index refreshes when structured fields and OCR text change", () => {
  const db = openPipelineDatabase(tempDbPath("lexical-refresh.sqlite"));

  upsertNormalizedItem(db, {
    itemId: "item-refresh",
    normalizedJson: JSON.stringify({
      title: "Utility Prop",
      description: "A handheld prop for VRChat.",
      normalizedText: "Utility Prop handheld prop for VRChat",
      tags: ["prop"],
      shopName: "Test Shop",
      categoryName: "3D Models",
      parentCategoryName: "Avatar Accessories",
      priceText: "800 JPY",
    }),
    contentHash: "content-refresh",
    updatedAt: "2026-03-21T02:00:00.000Z",
  });

  const lexical = createSqliteLexicalSearcher(db);
  assert.equal(lexical.search({ text: "VCC", limit: 5 }).length, 0);

  saveStructuredItem(db, {
    itemId: "item-refresh",
    structuredJson: JSON.stringify({
      parts: ["prop"],
      styles: [],
      compatibilityHints: ["VCC"],
      keywordDigest: [],
    }),
    updatedAt: "2026-03-21T02:01:00.000Z",
  });

  saveImageAnalysis(db, {
    imageKey: "item-refresh:0",
    itemId: "item-refresh",
    imageIndex: 0,
    captionText: "utility controller prop",
    ocrText: "VCC Ready",
    updatedAt: "2026-03-21T02:02:00.000Z",
  });

  const refreshed = lexical.search({ text: "VCC", limit: 5 });
  assert.equal(refreshed[0]?.itemId, "item-refresh");
  assert.ok((refreshed[0]?.matchedFields || []).includes("compatibilityHints"));

  db.close();
});

test("opening an existing database backfills the lexical FTS table when it is empty", () => {
  const dbPath = tempDbPath("lexical-backfill.sqlite");
  const seeded = openPipelineDatabase(dbPath);

  upsertNormalizedItem(seeded, {
    itemId: "item-backfill",
    normalizedJson: JSON.stringify({
      title: "Backfill Boots",
      description: "Boots for exact lookup.",
      normalizedText: "Backfill Boots exact lookup",
      tags: ["boots"],
      shopName: "Test Shop",
      categoryName: "3D Models",
      parentCategoryName: "Avatar Fashion",
      priceText: "900 JPY",
    }),
    contentHash: "content-backfill",
    updatedAt: "2026-03-21T03:00:00.000Z",
  });
  saveStructuredItem(seeded, {
    itemId: "item-backfill",
    structuredJson: JSON.stringify({
      parts: ["shoes"],
      styles: ["military"],
      compatibilityHints: ["Kikyo"],
      keywordDigest: ["boots"],
    }),
    updatedAt: "2026-03-21T03:01:00.000Z",
  });
  seeded.prepare("DELETE FROM item_lexical_fts").run();
  seeded.close();

  const reopened = openPipelineDatabase(dbPath);
  const lexical = createSqliteLexicalSearcher(reopened);
  const results = lexical.search({ text: "Kikyo boots", limit: 5 });

  assert.equal(results[0]?.itemId, "item-backfill");

  reopened.close();
});
