import test from "node:test";
import assert from "node:assert/strict";

import { AppwriteCatalogRepository } from "./appwriteCatalog";
import { AppwriteClientConfig } from "../../appwrite/config";
import { CatalogItemProjection } from "../../appwrite/models";

class FakeDocuments {
  public store = new Map<string, any>();

  async listDocuments(_databaseId: string, _collectionId: string) {
    return { documents: Array.from(this.store.values()) };
  }

  async createDocument(_databaseId: string, _collectionId: string, documentId: string, data: Record<string, any>) {
    const document = { $id: documentId, ...data };
    this.store.set(documentId, document);
    return document;
  }

  async updateDocument(_databaseId: string, _collectionId: string, documentId: string, data: Record<string, any>) {
    if (!this.store.has(documentId)) {
      throw new Error("missing");
    }
    const document = { ...this.store.get(documentId), ...data };
    this.store.set(documentId, document);
    return document;
  }
}

const config: AppwriteClientConfig = {
  endpoint: "https://appwrite.example/v1",
  projectId: "project",
  databaseId: "db",
  chatsCollectionId: "chats",
  catalogCollectionId: "catalog",
};

const sampleItem: CatalogItemProjection = {
  itemId: "1001",
  title: "Sample",
  description: "Sample description",
  normalizedText: "Sample description VRChat",
  priceText: "1,000 JPY",
  priceJpy: 1000,
  shopName: "Shop",
  shopUrl: "https://shop.example",
  itemUrl: "https://booth.pm/en/items/1001",
  categoryName: "3D Clothing",
  parentCategoryName: "3D Models",
  tags: ["VRChat"],
  images: [{ imageIndex: 0, sourceUrl: "https://example.com/1.png" }],
  isAdult: false,
  publishedAt: "2026-03-19T10:00:00.000Z",
  contentHash: "hash-1",
};

test("AppwriteCatalogRepository upserts and lists compact catalog items", async () => {
  const documents = new FakeDocuments();
  const repository = new AppwriteCatalogRepository(documents as any, config);

  await repository.upsertItems([sampleItem]);
  await repository.upsertItems([{ ...sampleItem, title: "Sample Updated" }]);

  const items = await repository.listItems();
  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, "Sample Updated");
  assert.deepEqual(items[0]?.tags, ["VRChat"]);
});
