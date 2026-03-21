import { readFileSync } from "node:fs";

import {
  getStructuredItem,
  listItemImagesForItem,
  listNormalizedItemIds,
  openPipelineDatabase,
  PipelineDatabase,
} from "../../src/lib/pipeline/sqlite/db";
import { Goal12Benchmark } from "../../src/lib/search/evaluate";
import { MULTIMODAL_SHARED_SPACE } from "../../src/lib/search/runtime";
import { projectAssetPoints, projectItemPoint } from "../../src/lib/search/indexes/qdrant/projectors";

type NormalizedProjection = {
  itemId: string;
  title: string;
  description: string;
  itemUrl: string;
  categoryName: string;
  parentCategoryName: string;
  tags: string[];
};

type StructuredProjection = {
  parts: string[];
  styles: string[];
  compatibilityHints: string[];
};

function tokenize(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}_+-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function parseNormalizedProjection(normalizedJson: string): NormalizedProjection {
  const parsed = JSON.parse(normalizedJson) as Record<string, unknown>;
  return {
    itemId: String(parsed.itemId || ""),
    title: String(parsed.title || ""),
    description: String(parsed.description || ""),
    itemUrl: String(parsed.itemUrl || ""),
    categoryName: String(parsed.categoryName || ""),
    parentCategoryName: String(parsed.parentCategoryName || ""),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((tag) => String(tag)) : [],
  };
}

function parseStructuredProjection(structuredJson?: string): StructuredProjection {
  if (!structuredJson) {
    return {
      parts: [],
      styles: [],
      compatibilityHints: [],
    };
  }

  const parsed = JSON.parse(structuredJson) as Record<string, unknown>;
  return {
    parts: Array.isArray(parsed.parts) ? parsed.parts.map((value) => String(value)) : [],
    styles: Array.isArray(parsed.styles) ? parsed.styles.map((value) => String(value)) : [],
    compatibilityHints: Array.isArray(parsed.compatibilityHints)
      ? parsed.compatibilityHints.map((value) => String(value))
      : [],
  };
}

function buildTextQuery(normalized: NormalizedProjection, structured: StructuredProjection): string {
  const tokens = Array.from(
    new Set(
      [
        structured.styles[0],
        structured.parts[0],
        structured.compatibilityHints[0],
        ...tokenize(normalized.title).slice(0, 2),
        ...normalized.tags.slice(0, 2),
        normalized.categoryName,
        normalized.parentCategoryName,
      ].filter(Boolean)
    )
  );

  return tokens.slice(0, 5).join(" ") || normalized.title || normalized.description;
}

function buildImageHint(normalized: NormalizedProjection, structured: StructuredProjection): string | undefined {
  const tokens = Array.from(new Set([structured.styles[0], structured.parts[0], ...normalized.tags.slice(0, 1)].filter(Boolean)));
  return tokens.length > 0 ? tokens.join(" ") : undefined;
}

export function buildGoal12BenchmarkScaffold(options: {
  db: PipelineDatabase;
  dbPath?: string;
  embeddingSpace?: string;
  textCases?: number;
  imageCases?: number;
}): Goal12Benchmark {
  const embeddingSpace = options.embeddingSpace || MULTIMODAL_SHARED_SPACE;
  const maxTextCases = Math.max(0, options.textCases ?? 5);
  const maxImageCases = Math.max(0, options.imageCases ?? 5);
  const cases: Goal12Benchmark["cases"] = [];
  let textCount = 0;
  let imageCount = 0;

  for (const itemId of listNormalizedItemIds(options.db)) {
    const normalizedRecord = options.db
      .prepare(`SELECT normalized_json as normalizedJson FROM normalized_items WHERE item_id = ?`)
      .get(itemId) as { normalizedJson: string } | undefined;
    if (!normalizedRecord) {
      continue;
    }

    const normalized = parseNormalizedProjection(normalizedRecord.normalizedJson);
    const structured = parseStructuredProjection(getStructuredItem(options.db, itemId)?.structuredJson);
    const itemPoint = projectItemPoint(options.db, itemId, embeddingSpace);
    const assetPoints = projectAssetPoints(options.db, itemId, embeddingSpace);

    if (itemPoint && textCount < maxTextCases) {
      cases.push({
        id: `text:${itemId}`,
        kind: "text",
        query: {
          text: buildTextQuery(normalized, structured),
          limit: 10,
        },
        relevantItemIds: [itemId],
        notes: normalized.title,
      });
      textCount += 1;
    }

    if (assetPoints.length > 0 && imageCount < maxImageCases) {
      const firstImage = listItemImagesForItem(options.db, itemId)[0];
      const imagePath = assetPoints[0]?.payload.sourceUrl || firstImage?.sourceUrl;
      if (imagePath) {
        cases.push({
          id: `image:${assetPoints[0]?.payload.imageKey || itemId}`,
          kind: "image",
          query: {
            imagePath,
            text: buildImageHint(normalized, structured),
            limit: 10,
          },
          relevantItemIds: [itemId],
          notes: normalized.title,
        });
        imageCount += 1;
      }
    }

    if (textCount >= maxTextCases && imageCount >= maxImageCases) {
      break;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    dataset: {
      dbPath: options.dbPath,
    },
    cases,
  };
}
