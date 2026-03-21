export const ITEM_VECTOR_NAME = "item_text";
export const ASSET_VECTOR_NAME = "asset_image";
export const QDRANT_DISTANCE = "Cosine";

export type QdrantPoint<TPayload, TVectorName extends string> = {
  id: string;
  vector: Record<TVectorName, number[]>;
  payload: TPayload;
};

export type QdrantItemPayload = {
  entityType: "item";
  itemId: string;
  title: string;
  description: string;
  itemUrl: string;
  shopName: string;
  categoryName: string;
  parentCategoryName: string;
  tags: string[];
  priceJpy: number | null;
  priceText: string;
  isAdult: boolean;
  contentHash: string;
  parts: string[];
  styles: string[];
  compatibilityHints: string[];
  keywordDigest: string[];
  captions: string[];
  ocrTexts: string[];
  imageCount: number;
  embeddingSpace: string;
};

export type QdrantAssetPayload = {
  entityType: "asset";
  itemId: string;
  imageKey: string;
  imageIndex: number;
  title: string;
  itemUrl: string;
  sourceUrl: string;
  captionText?: string;
  ocrText?: string;
  parts: string[];
  styles: string[];
  compatibilityHints: string[];
  embeddingSpace: string;
};

export type QdrantItemPoint = QdrantPoint<QdrantItemPayload, typeof ITEM_VECTOR_NAME>;
export type QdrantAssetPoint = QdrantPoint<QdrantAssetPayload, typeof ASSET_VECTOR_NAME>;

export function buildItemPointId(itemId: string): string {
  return `item:${itemId}`;
}

export function buildAssetPointId(imageKey: string): string {
  return `asset:${imageKey}`;
}

export function buildItemCollectionSchema(vectorSize: number) {
  return {
    vectors: {
      [ITEM_VECTOR_NAME]: {
        size: vectorSize,
        distance: QDRANT_DISTANCE,
      },
    },
  };
}

export function buildAssetCollectionSchema(vectorSize: number) {
  return {
    vectors: {
      [ASSET_VECTOR_NAME]: {
        size: vectorSize,
        distance: QDRANT_DISTANCE,
      },
    },
  };
}
