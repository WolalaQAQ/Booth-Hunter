import { PipelineDatabase } from "../../pipeline/sqlite/db";
import { SearchEvidence } from "../types";

type LexicalSearchInput = {
  text: string;
  limit?: number;
};

type LexicalRow = {
  itemId: string;
  title: string;
  description: string;
  tags: string;
  normalizedText: string;
  shopName: string;
  categoryName: string;
  parentCategoryName: string;
  priceText: string;
  captionText: string;
  ocrText: string;
  parts: string;
  styles: string;
  compatibilityHints: string;
  keywordDigest: string;
  rank: number;
};

const MATCHED_FIELD_ACCESSORS: Record<string, (row: LexicalRow) => string> = {
  title: (row) => row.title,
  description: (row) => row.description,
  tags: (row) => row.tags,
  normalizedText: (row) => row.normalizedText,
  shopName: (row) => row.shopName,
  categoryName: (row) => row.categoryName,
  parentCategoryName: (row) => row.parentCategoryName,
  priceText: (row) => row.priceText,
  captionText: (row) => row.captionText,
  ocrText: (row) => row.ocrText,
  parts: (row) => row.parts,
  styles: (row) => row.styles,
  compatibilityHints: (row) => row.compatibilityHints,
  keywordDigest: (row) => row.keywordDigest,
};

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}_+-]+/u)
        .map((token) => token.trim())
        .filter(Boolean)
    )
  );
}

function escapeFtsToken(token: string): string {
  return token.replace(/"/g, "\"\"");
}

export function buildLexicalMatchQuery(text: string): string {
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return "";
  }
  return tokens.map((token) => `"${escapeFtsToken(token)}"`).join(" AND ");
}

function toScore(rank: number): number {
  const normalizedRank = Number.isFinite(rank) ? rank : 0;
  return 1 / (1 + Math.exp(normalizedRank));
}

function collectMatchedFields(row: LexicalRow, queryText: string): string[] {
  const tokens = tokenize(queryText);
  return Object.entries(MATCHED_FIELD_ACCESSORS)
    .filter(([, accessor]) => {
      const haystack = accessor(row).toLowerCase();
      return tokens.some((token) => haystack.includes(token));
    })
    .map(([field]) => field);
}

export function createSqliteLexicalSearcher(db: PipelineDatabase) {
  return {
    search(input: LexicalSearchInput): SearchEvidence[] {
      const matchQuery = buildLexicalMatchQuery(input.text);
      if (!matchQuery) {
        return [];
      }

      const rows = db.prepare(`
        SELECT
          f.item_id as itemId,
          d.title as title,
          d.description as description,
          d.tags as tags,
          d.normalized_text as normalizedText,
          d.shop_name as shopName,
          d.category_name as categoryName,
          d.parent_category_name as parentCategoryName,
          d.price_text as priceText,
          d.caption_text as captionText,
          d.ocr_text as ocrText,
          d.parts as parts,
          d.styles as styles,
          d.compatibility_hints as compatibilityHints,
          d.keyword_digest as keywordDigest,
          bm25(item_lexical_fts, 8.0, 4.0, 3.0, 3.0, 1.0, 1.0, 1.0, 1.0, 2.0, 2.5, 2.5, 2.5, 2.5, 1.5) as rank
        FROM item_lexical_fts f
        JOIN item_lexical_documents d ON d.item_id = f.item_id
        WHERE item_lexical_fts MATCH ?
        ORDER BY rank ASC, f.item_id ASC
        LIMIT ?
      `).all(matchQuery, input.limit ?? 10) as LexicalRow[];

      return rows.map((row) => ({
        itemId: row.itemId,
        assetId: `${row.itemId}:lexical`,
        score: toScore(row.rank),
        source: "lexical",
        matchedFields: collectMatchedFields(row, input.text),
        metadata: {
          rank: row.rank,
          title: row.title,
        },
      }));
    },
  };
}
