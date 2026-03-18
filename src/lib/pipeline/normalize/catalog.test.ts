import test from "node:test";
import assert from "node:assert/strict";

import { normalizeBoothItem } from "./catalog";

test("normalizeBoothItem converts booth json into compact catalog item", () => {
  const item = normalizeBoothItem({
    id: 1001,
    name: "オリジナル3D衣装",
    description: "VRChat向け衣装。ModularAvatar対応。",
    price: "1,200 JPY",
    is_adult: false,
    published_at: "2026-03-19T10:00:00.000+09:00",
    url: "https://booth.pm/en/items/1001",
    tags: [{ name: "VRChat" }, { name: "ModularAvatar" }],
    images: [{ original: "https://example.com/1.png", resized: "https://example.com/1-small.png" }],
    category: {
      name: "3D Clothing",
      parent: { name: "3D Models" },
    },
    shop: {
      name: "テストショップ",
      url: "https://example.booth.pm/",
    },
  } as any);

  assert.equal(item.itemId, "1001");
  assert.equal(item.priceJpy, 1200);
  assert.equal(item.parentCategoryName, "3D Models");
  assert.deepEqual(item.tags.slice(0, 2), ["VRChat", "ModularAvatar"]);
  assert.match(item.normalizedText, /ModularAvatar/);
});
