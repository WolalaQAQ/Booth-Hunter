import { Permission, Query, Role } from 'appwrite';

import { AppwriteClientConfig } from '../../appwrite/config';
import { CatalogItemProjection } from '../../appwrite/models';
import { CatalogRepository } from './types';

type DocumentsLike = {
  listDocuments(databaseId: string, collectionId: string, queries?: string[]): Promise<{ documents: any[] }>;
  createDocument(databaseId: string, collectionId: string, documentId: string, data: Record<string, any>, permissions?: string[]): Promise<any>;
  updateDocument(databaseId: string, collectionId: string, documentId: string, data: Record<string, any>): Promise<any>;
};

function documentIdForItem(itemId: string): string {
  return `item_${itemId.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

function toDocument(item: CatalogItemProjection) {
  return {
    itemId: item.itemId,
    title: item.title,
    description: item.description,
    normalizedText: item.normalizedText,
    priceText: item.priceText,
    priceJpy: item.priceJpy,
    shopName: item.shopName,
    shopUrl: item.shopUrl || '',
    itemUrl: item.itemUrl,
    categoryName: item.categoryName,
    parentCategoryName: item.parentCategoryName,
    tagsJson: JSON.stringify(item.tags),
    imagesJson: JSON.stringify(item.images),
    isAdult: item.isAdult,
    publishedAt: item.publishedAt || '',
    contentHash: item.contentHash,
  };
}

function fromDocument(doc: any): CatalogItemProjection {
  return {
    itemId: doc.itemId,
    title: doc.title,
    description: doc.description,
    normalizedText: doc.normalizedText,
    priceText: doc.priceText,
    priceJpy: typeof doc.priceJpy === 'number' ? doc.priceJpy : null,
    shopName: doc.shopName,
    shopUrl: doc.shopUrl || undefined,
    itemUrl: doc.itemUrl,
    categoryName: doc.categoryName,
    parentCategoryName: doc.parentCategoryName,
    tags: JSON.parse(doc.tagsJson || '[]'),
    images: JSON.parse(doc.imagesJson || '[]'),
    isAdult: !!doc.isAdult,
    publishedAt: doc.publishedAt || undefined,
    contentHash: doc.contentHash,
  };
}

export class AppwriteCatalogRepository implements CatalogRepository {
  constructor(private readonly documents: DocumentsLike, private readonly config: AppwriteClientConfig) {}

  async upsertItems(items: CatalogItemProjection[]): Promise<void> {
    for (const item of items) {
      const documentId = documentIdForItem(item.itemId);
      const data = toDocument(item);
      const permissions = [Permission.read(Role.any())];
      try {
        await this.documents.updateDocument(this.config.databaseId, this.config.catalogCollectionId, documentId, data);
      } catch {
        await this.documents.createDocument(this.config.databaseId, this.config.catalogCollectionId, documentId, data, permissions);
      }
    }
  }

  async listItems(limit = 50): Promise<CatalogItemProjection[]> {
    const response = await this.documents.listDocuments(
      this.config.databaseId,
      this.config.catalogCollectionId,
      [Query.limit(limit)]
    );
    return response.documents.map(fromDocument);
  }
}
