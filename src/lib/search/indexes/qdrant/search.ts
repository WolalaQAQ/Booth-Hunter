import { ImageSearchQuery, SearchEvidence, SearchFilters, TextSearchQuery } from "../../types";
import { ASSET_VECTOR_NAME, ITEM_VECTOR_NAME, QdrantAssetPayload, QdrantItemPayload } from "./schema";

export type QdrantFilter = {
  must: Array<{
    key: string;
    match: { value: string | number | boolean } | { any: string[] };
  }>;
};

export type QdrantScoredPoint<TPayload> = {
  id: string | number;
  score: number;
  payload?: TPayload | null;
};

export type QdrantSearchClient = {
  search(
    collectionName: string,
    args: {
      vector: { name: string; vector: number[] };
      limit: number;
      with_payload: boolean;
      filter?: QdrantFilter;
    }
  ): Promise<Array<QdrantScoredPoint<Record<string, unknown>>>>;
};

function filterEntries(filters?: SearchFilters) {
  return Object.entries(filters || {}).filter(([, value]) => value !== undefined);
}

export function buildQdrantFilter(filters?: SearchFilters): QdrantFilter | undefined {
  const must: QdrantFilter["must"] = [];

  for (const [key, value] of filterEntries(filters)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue;
      }
      must.push({
        key,
        match: { any: value.map((entry) => String(entry)) },
      });
      continue;
    }

    must.push({
      key,
      match: { value },
    });
  }

  return must.length > 0 ? { must } : undefined;
}

function deriveItemIdFromPointId(pointId: string | number): string {
  const raw = String(pointId);
  return raw.startsWith("item:") ? raw.slice("item:".length) : raw;
}

function deriveAssetImageKey(pointId: string | number): string {
  const raw = String(pointId);
  return raw.startsWith("asset:") ? raw.slice("asset:".length) : raw;
}

function deriveItemIdFromAsset(pointId: string | number, imageKey?: string): string {
  const assetKey = imageKey || deriveAssetImageKey(pointId);
  return assetKey.split(":")[0] || assetKey;
}

export function createQdrantItemSearcher(options: {
  client: QdrantSearchClient;
  collectionName: string;
}) {
  return async (vector: number[], query: TextSearchQuery): Promise<SearchEvidence[]> => {
    const results = await options.client.search(options.collectionName, {
      vector: {
        name: ITEM_VECTOR_NAME,
        vector,
      },
      limit: query.limit ?? 10,
      with_payload: true,
      filter: buildQdrantFilter(query.filters),
    });

    return results.map((point) => {
      const payload = (point.payload || {}) as Partial<QdrantItemPayload>;
      const itemId = payload.itemId || deriveItemIdFromPointId(point.id);
      return {
        itemId,
        assetId: String(point.id),
        score: point.score,
        source: "dense_text",
        metadata: {
          entityType: payload.entityType,
          title: payload.title,
          itemUrl: payload.itemUrl,
          shopName: payload.shopName,
          categoryName: payload.categoryName,
          parentCategoryName: payload.parentCategoryName,
          tags: payload.tags,
          isAdult: payload.isAdult,
        },
      } satisfies SearchEvidence;
    });
  };
}

export function createQdrantAssetSearcher(options: {
  client: QdrantSearchClient;
  collectionName: string;
}) {
  return async (vector: number[], query: ImageSearchQuery): Promise<SearchEvidence[]> => {
    const results = await options.client.search(options.collectionName, {
      vector: {
        name: ASSET_VECTOR_NAME,
        vector,
      },
      limit: query.limit ?? 10,
      with_payload: true,
      filter: buildQdrantFilter(query.filters),
    });

    return results.map((point) => {
      const payload = (point.payload || {}) as Partial<QdrantAssetPayload>;
      const assetId = payload.imageKey || deriveAssetImageKey(point.id);
      return {
        itemId: payload.itemId || deriveItemIdFromAsset(point.id, payload.imageKey),
        assetId,
        score: point.score,
        source: "dense_image",
        metadata: {
          entityType: payload.entityType,
          title: payload.title,
          itemUrl: payload.itemUrl,
          sourceUrl: payload.sourceUrl,
          imageIndex: payload.imageIndex,
          captionText: payload.captionText,
          ocrText: payload.ocrText,
          styles: payload.styles,
          parts: payload.parts,
          compatibilityHints: payload.compatibilityHints,
        },
      } satisfies SearchEvidence;
    });
  };
}
