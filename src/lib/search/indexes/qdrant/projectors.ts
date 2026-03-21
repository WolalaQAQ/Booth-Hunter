import {
  getItemTextEmbedding,
  getNormalizedItem,
  getStructuredItem,
  listImageAnalysisForItem,
  listItemImagesForItem,
  getImageEmbedding,
  PipelineDatabase,
} from "../../../pipeline/sqlite/db";
import {
  ASSET_VECTOR_NAME,
  buildAssetPointId,
  buildItemPointId,
  ITEM_VECTOR_NAME,
  QdrantAssetPoint,
  QdrantItemPoint,
} from "./schema";

type NormalizedProjection = {
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
};

type StructuredProjection = {
  parts: string[];
  styles: string[];
  compatibilityHints: string[];
  keywordDigest: string[];
};

function parseNormalizedProjection(json: string): NormalizedProjection {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  return {
    itemId: String(parsed.itemId || ""),
    title: String(parsed.title || ""),
    description: String(parsed.description || ""),
    itemUrl: String(parsed.itemUrl || ""),
    shopName: String(parsed.shopName || ""),
    categoryName: String(parsed.categoryName || ""),
    parentCategoryName: String(parsed.parentCategoryName || ""),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((tag) => String(tag)) : [],
    priceJpy: typeof parsed.priceJpy === "number" ? parsed.priceJpy : null,
    priceText: String(parsed.priceText || ""),
    isAdult: Boolean(parsed.isAdult),
  };
}

function parseStructuredProjection(json?: string): StructuredProjection {
  if (!json) {
    return {
      parts: [],
      styles: [],
      compatibilityHints: [],
      keywordDigest: [],
    };
  }

  const parsed = JSON.parse(json) as Record<string, unknown>;
  return {
    parts: Array.isArray(parsed.parts) ? parsed.parts.map((value) => String(value)) : [],
    styles: Array.isArray(parsed.styles) ? parsed.styles.map((value) => String(value)) : [],
    compatibilityHints: Array.isArray(parsed.compatibilityHints)
      ? parsed.compatibilityHints.map((value) => String(value))
      : [],
    keywordDigest: Array.isArray(parsed.keywordDigest) ? parsed.keywordDigest.map((value) => String(value)) : [],
  };
}

export function projectItemPoint(
  db: PipelineDatabase,
  itemId: string,
  embeddingSpace: string
): QdrantItemPoint | undefined {
  const normalized = getNormalizedItem(db, itemId);
  const embedding = getItemTextEmbedding(db, itemId, embeddingSpace);
  if (!normalized || !embedding) {
    return undefined;
  }

  const base = parseNormalizedProjection(normalized.normalizedJson);
  const structured = parseStructuredProjection(getStructuredItem(db, itemId)?.structuredJson);
  const imageAnalysis = listImageAnalysisForItem(db, itemId);

  return {
    id: buildItemPointId(itemId),
    vector: {
      [ITEM_VECTOR_NAME]: JSON.parse(embedding.vectorJson),
    },
    payload: {
      entityType: "item",
      itemId,
      title: base.title,
      description: base.description,
      itemUrl: base.itemUrl,
      shopName: base.shopName,
      categoryName: base.categoryName,
      parentCategoryName: base.parentCategoryName,
      tags: base.tags,
      priceJpy: base.priceJpy,
      priceText: base.priceText,
      isAdult: base.isAdult,
      contentHash: normalized.contentHash,
      parts: structured.parts,
      styles: structured.styles,
      compatibilityHints: structured.compatibilityHints,
      keywordDigest: structured.keywordDigest,
      captions: imageAnalysis.map((entry) => entry.captionText).filter((value): value is string => Boolean(value)),
      ocrTexts: imageAnalysis.map((entry) => entry.ocrText).filter((value): value is string => Boolean(value)),
      imageCount: listItemImagesForItem(db, itemId).length,
      embeddingSpace,
    },
  };
}

export function projectAssetPoints(
  db: PipelineDatabase,
  itemId: string,
  embeddingSpace: string
): QdrantAssetPoint[] {
  const normalized = getNormalizedItem(db, itemId);
  if (!normalized) {
    return [];
  }

  const base = parseNormalizedProjection(normalized.normalizedJson);
  const structured = parseStructuredProjection(getStructuredItem(db, itemId)?.structuredJson);
  const analysisByImageKey = new Map(listImageAnalysisForItem(db, itemId).map((entry) => [entry.imageKey, entry]));
  const points: QdrantAssetPoint[] = [];

  for (const image of listItemImagesForItem(db, itemId)) {
    const embedding = getImageEmbedding(db, image.imageKey, embeddingSpace);
    if (!embedding) {
      continue;
    }

    const analysis = analysisByImageKey.get(image.imageKey);
    const payload: QdrantAssetPoint["payload"] = {
      entityType: "asset",
      itemId,
      imageKey: image.imageKey,
      imageIndex: image.imageIndex,
      title: base.title,
      itemUrl: base.itemUrl,
      sourceUrl: image.sourceUrl,
      parts: structured.parts,
      styles: structured.styles,
      compatibilityHints: structured.compatibilityHints,
      embeddingSpace,
    };

    if (analysis?.captionText) {
      payload.captionText = analysis.captionText;
    }
    if (analysis?.ocrText) {
      payload.ocrText = analysis.ocrText;
    }

    points.push({
      id: buildAssetPointId(image.imageKey),
      vector: {
        [ASSET_VECTOR_NAME]: JSON.parse(embedding.vectorJson),
      },
      payload,
    });
  }

  return points.sort((left, right) => left.payload.imageIndex - right.payload.imageIndex);
}
