import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import {
  openPipelineDatabase,
  saveImageAnalysis,
  saveImageEmbedding,
  saveItemTextEmbedding,
  saveStructuredItem,
  upsertItemImage,
  upsertNormalizedItem,
} from "../../../pipeline/sqlite/db";
import { projectAssetPoints, projectItemPoint } from "./projectors";
import { MULTIMODAL_SHARED_SPACE } from "../../../pipeline/embed/provider";

function tempDbPath(name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "booth-hunter-qdrant-projectors-"));
  return path.join(dir, name);
}

test("qdrant projectors emit deterministic item and asset payloads from canonical sqlite state", () => {
  const db = openPipelineDatabase(tempDbPath("projectors.sqlite"));

  upsertNormalizedItem(db, {
    itemId: "item-1001",
    normalizedJson: JSON.stringify({
      itemId: "item-1001",
      title: "Kikyo Maid Boots",
      description: "Lace-up boots for maid-themed VRChat avatars.",
      normalizedText: "Kikyo Maid Boots lace-up boots for maid-themed VRChat avatars",
      priceText: "1200 JPY",
      priceJpy: 1200,
      shopName: "Example Shop",
      itemUrl: "https://booth.pm/items/1001",
      categoryName: "3D Models",
      parentCategoryName: "Avatar Fashion",
      tags: ["boots", "maid", "kikyo"],
      images: [
        { imageIndex: 0, sourceUrl: "https://img.example/1001-0.webp" },
        { imageIndex: 1, sourceUrl: "https://img.example/1001-1.webp" },
      ],
      isAdult: false,
      contentHash: "content-1001",
    }),
    contentHash: "content-1001",
    updatedAt: "2026-03-21T04:00:00.000Z",
  });

  upsertItemImage(db, {
    imageKey: "item-1001:0",
    itemId: "item-1001",
    imageIndex: 0,
    sourceUrl: "https://img.example/1001-0.webp",
    width: 1024,
    height: 1024,
    sizeBytes: 1000,
    sha256: "sha-0",
    processedAt: "2026-03-21T04:01:00.000Z",
  });
  upsertItemImage(db, {
    imageKey: "item-1001:1",
    itemId: "item-1001",
    imageIndex: 1,
    sourceUrl: "https://img.example/1001-1.webp",
    width: 1024,
    height: 1024,
    sizeBytes: 1001,
    sha256: "sha-1",
    processedAt: "2026-03-21T04:02:00.000Z",
  });

  saveImageAnalysis(db, {
    imageKey: "item-1001:0",
    itemId: "item-1001",
    imageIndex: 0,
    captionText: "front angle black maid boots",
    ocrText: "Kikyo",
    updatedAt: "2026-03-21T04:03:00.000Z",
  });
  saveImageAnalysis(db, {
    imageKey: "item-1001:1",
    itemId: "item-1001",
    imageIndex: 1,
    captionText: "side angle lace-up boots",
    ocrText: "VRChat",
    updatedAt: "2026-03-21T04:04:00.000Z",
  });

  saveStructuredItem(db, {
    itemId: "item-1001",
    structuredJson: JSON.stringify({
      parts: ["shoes"],
      styles: ["maid"],
      compatibilityHints: ["Kikyo", "VRChat"],
      keywordDigest: ["boots", "lace-up"],
    }),
    updatedAt: "2026-03-21T04:05:00.000Z",
  });

  saveItemTextEmbedding(db, {
    itemId: "item-1001",
    embeddingSpace: MULTIMODAL_SHARED_SPACE,
    model: "Qwen/Qwen3-VL-Embedding-2B",
    vectorJson: JSON.stringify([0.1, 0.2, 0.3]),
    updatedAt: "2026-03-21T04:06:00.000Z",
  });
  saveImageEmbedding(db, {
    imageKey: "item-1001:0",
    embeddingSpace: MULTIMODAL_SHARED_SPACE,
    model: "Qwen/Qwen3-VL-Embedding-2B",
    vectorJson: JSON.stringify([0.9, 0.1]),
    updatedAt: "2026-03-21T04:07:00.000Z",
  });
  saveImageEmbedding(db, {
    imageKey: "item-1001:1",
    embeddingSpace: MULTIMODAL_SHARED_SPACE,
    model: "Qwen/Qwen3-VL-Embedding-2B",
    vectorJson: JSON.stringify([0.8, 0.2]),
    updatedAt: "2026-03-21T04:08:00.000Z",
  });

  const itemPoint = projectItemPoint(db, "item-1001", MULTIMODAL_SHARED_SPACE);
  const assetPoints = projectAssetPoints(db, "item-1001", MULTIMODAL_SHARED_SPACE);

  assert.equal(itemPoint?.id, "item:item-1001");
  assert.deepEqual(itemPoint?.vector.item_text, [0.1, 0.2, 0.3]);
  assert.deepEqual(itemPoint?.payload, {
    entityType: "item",
    itemId: "item-1001",
    title: "Kikyo Maid Boots",
    description: "Lace-up boots for maid-themed VRChat avatars.",
    itemUrl: "https://booth.pm/items/1001",
    shopName: "Example Shop",
    categoryName: "3D Models",
    parentCategoryName: "Avatar Fashion",
    tags: ["boots", "maid", "kikyo"],
    priceJpy: 1200,
    priceText: "1200 JPY",
    isAdult: false,
    contentHash: "content-1001",
    parts: ["shoes"],
    styles: ["maid"],
    compatibilityHints: ["Kikyo", "VRChat"],
    keywordDigest: ["boots", "lace-up"],
    captions: ["front angle black maid boots", "side angle lace-up boots"],
    ocrTexts: ["Kikyo", "VRChat"],
    imageCount: 2,
    embeddingSpace: MULTIMODAL_SHARED_SPACE,
  });

  assert.equal(assetPoints.length, 2);
  assert.equal(assetPoints[0]?.id, "asset:item-1001:0");
  assert.equal(assetPoints[1]?.id, "asset:item-1001:1");
  assert.deepEqual(assetPoints[0]?.vector.asset_image, [0.9, 0.1]);
  assert.deepEqual(assetPoints[1]?.vector.asset_image, [0.8, 0.2]);
  assert.deepEqual(assetPoints[0]?.payload, {
    entityType: "asset",
    itemId: "item-1001",
    imageKey: "item-1001:0",
    imageIndex: 0,
    title: "Kikyo Maid Boots",
    itemUrl: "https://booth.pm/items/1001",
    sourceUrl: "https://img.example/1001-0.webp",
    captionText: "front angle black maid boots",
    ocrText: "Kikyo",
    parts: ["shoes"],
    styles: ["maid"],
    compatibilityHints: ["Kikyo", "VRChat"],
    embeddingSpace: MULTIMODAL_SHARED_SPACE,
  });
  assert.deepEqual(assetPoints[1]?.payload, {
    entityType: "asset",
    itemId: "item-1001",
    imageKey: "item-1001:1",
    imageIndex: 1,
    title: "Kikyo Maid Boots",
    itemUrl: "https://booth.pm/items/1001",
    sourceUrl: "https://img.example/1001-1.webp",
    captionText: "side angle lace-up boots",
    ocrText: "VRChat",
    parts: ["shoes"],
    styles: ["maid"],
    compatibilityHints: ["Kikyo", "VRChat"],
    embeddingSpace: MULTIMODAL_SHARED_SPACE,
  });

  db.close();
});
