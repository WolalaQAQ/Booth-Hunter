import crypto from "node:crypto";

export const ITEM_VECTOR_NAME = "item_text" as const;
export const ASSET_VECTOR_NAME = "asset_image" as const;
export const QDRANT_DISTANCE = "Cosine" as const;

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

function buildDeterministicUuid(namespace: string, key: string): string {
  const bytes = crypto.createHash("sha1").update(`${namespace}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function buildItemPointId(itemId: string): string {
  return buildDeterministicUuid("item", itemId);
}

export function buildAssetPointId(imageKey: string): string {
  return buildDeterministicUuid("asset", imageKey);
}

export function buildItemCollectionSchema(vectorSize: number) {
  return {
    vectors: {
      [ITEM_VECTOR_NAME]: {
        size: vectorSize,
        distance: QDRANT_DISTANCE,
      },
    },
  } as const;
}

export function buildAssetCollectionSchema(vectorSize: number) {
  return {
    vectors: {
      [ASSET_VECTOR_NAME]: {
        size: vectorSize,
        distance: QDRANT_DISTANCE,
      },
    },
  } as const;
}
