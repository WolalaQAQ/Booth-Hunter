import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import { PIPELINE_SCHEMA } from './schema';

export type PipelineDatabase = BetterSqlite3.Database;

export type RawItemRecord = {
  itemId: string;
  listingPage: number;
  sourceUrl: string;
  fetchedAt: string;
  rawJson: string;
  rawHash: string;
};

export type ItemImageRecord = {
  imageKey: string;
  itemId: string;
  imageIndex: number;
  sourceUrl: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  sha256: string;
  processedAt: string;
};

export type NormalizedItemRecord = {
  itemId: string;
  normalizedJson: string;
  contentHash: string;
  updatedAt: string;
};

export type ImageAnalysisRecord = {
  imageKey: string;
  itemId: string;
  imageIndex: number;
  captionText?: string;
  ocrText?: string;
  updatedAt: string;
};

export type StructuredItemRecord = {
  itemId: string;
  structuredJson: string;
  updatedAt: string;
};

export type LexicalDocumentRecord = {
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
};

function ensureParentDirectory(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function openPipelineDatabase(filePath: string): PipelineDatabase {
  ensureParentDirectory(filePath);
  const db = new BetterSqlite3(filePath);
  db.pragma('journal_mode = WAL');
  db.exec(PIPELINE_SCHEMA);
  const normalizedItemCount = Number(
    (db.prepare(`SELECT COUNT(*) as count FROM normalized_items`).get() as { count: number }).count || 0
  );
  const lexicalDocumentCount = Number(
    (db.prepare(`SELECT COUNT(*) as count FROM item_lexical_fts`).get() as { count: number }).count || 0
  );
  if (normalizedItemCount > 0 && lexicalDocumentCount < normalizedItemCount) {
    rebuildLexicalIndex(db);
  }
  return db;
}

export function upsertRawItem(db: PipelineDatabase, record: RawItemRecord): void {
  db.prepare(`
    INSERT INTO raw_items (item_id, listing_page, source_url, fetched_at, raw_json, raw_hash)
    VALUES (@itemId, @listingPage, @sourceUrl, @fetchedAt, @rawJson, @rawHash)
    ON CONFLICT(item_id) DO UPDATE SET
      listing_page = excluded.listing_page,
      source_url = excluded.source_url,
      fetched_at = excluded.fetched_at,
      raw_json = excluded.raw_json,
      raw_hash = excluded.raw_hash
  `).run(record);
}

export function getRawItem(db: PipelineDatabase, itemId: string): RawItemRecord | undefined {
  return db.prepare(`SELECT item_id as itemId, listing_page as listingPage, source_url as sourceUrl, fetched_at as fetchedAt, raw_json as rawJson, raw_hash as rawHash FROM raw_items WHERE item_id = ?`).get(itemId) as RawItemRecord | undefined;
}

export function listRawItems(db: PipelineDatabase, limit = 100): RawItemRecord[] {
  return db.prepare(`SELECT item_id as itemId, listing_page as listingPage, source_url as sourceUrl, fetched_at as fetchedAt, raw_json as rawJson, raw_hash as rawHash FROM raw_items ORDER BY fetched_at DESC LIMIT ?`).all(limit) as RawItemRecord[];
}

export function upsertItemImage(db: PipelineDatabase, record: ItemImageRecord): void {
  db.prepare(`
    INSERT INTO item_images (image_key, item_id, image_index, source_url, width, height, size_bytes, sha256, processed_at)
    VALUES (@imageKey, @itemId, @imageIndex, @sourceUrl, @width, @height, @sizeBytes, @sha256, @processedAt)
    ON CONFLICT(image_key) DO UPDATE SET
      width = excluded.width,
      height = excluded.height,
      size_bytes = excluded.size_bytes,
      sha256 = excluded.sha256,
      processed_at = excluded.processed_at
  `).run(record);
}

export function listItemImagesForItem(db: PipelineDatabase, itemId: string): ItemImageRecord[] {
  return db.prepare(`SELECT image_key as imageKey, item_id as itemId, image_index as imageIndex, source_url as sourceUrl, width, height, size_bytes as sizeBytes, sha256, processed_at as processedAt FROM item_images WHERE item_id = ? ORDER BY image_index ASC`).all(itemId) as ItemImageRecord[];
}

export function listAllItemImages(db: PipelineDatabase): ItemImageRecord[] {
  return db.prepare(`SELECT image_key as imageKey, item_id as itemId, image_index as imageIndex, source_url as sourceUrl, width, height, size_bytes as sizeBytes, sha256, processed_at as processedAt FROM item_images ORDER BY item_id ASC, image_index ASC`).all() as ItemImageRecord[];
}

export function upsertNormalizedItem(db: PipelineDatabase, record: NormalizedItemRecord): void {
  db.prepare(`
    INSERT INTO normalized_items (item_id, normalized_json, content_hash, updated_at)
    VALUES (@itemId, @normalizedJson, @contentHash, @updatedAt)
    ON CONFLICT(item_id) DO UPDATE SET
      normalized_json = excluded.normalized_json,
      content_hash = excluded.content_hash,
      updated_at = excluded.updated_at
  `).run(record);
  refreshLexicalIndexForItem(db, record.itemId);
}

export function getNormalizedItem(db: PipelineDatabase, itemId: string): NormalizedItemRecord | undefined {
  return db.prepare(`SELECT item_id as itemId, normalized_json as normalizedJson, content_hash as contentHash, updated_at as updatedAt FROM normalized_items WHERE item_id = ?`).get(itemId) as NormalizedItemRecord | undefined;
}

export function listNormalizedItems(db: PipelineDatabase, limit = 100): NormalizedItemRecord[] {
  return db.prepare(`SELECT item_id as itemId, normalized_json as normalizedJson, content_hash as contentHash, updated_at as updatedAt FROM normalized_items ORDER BY updated_at DESC LIMIT ?`).all(limit) as NormalizedItemRecord[];
}

export function listAllNormalizedItems(db: PipelineDatabase): NormalizedItemRecord[] {
  return db.prepare(`SELECT item_id as itemId, normalized_json as normalizedJson, content_hash as contentHash, updated_at as updatedAt FROM normalized_items ORDER BY item_id ASC`).all() as NormalizedItemRecord[];
}

export function saveImageAnalysis(db: PipelineDatabase, record: ImageAnalysisRecord): void {
  db.prepare(`
    INSERT INTO image_analysis (image_key, item_id, image_index, caption_text, ocr_text, updated_at)
    VALUES (@imageKey, @itemId, @imageIndex, @captionText, @ocrText, @updatedAt)
    ON CONFLICT(image_key) DO UPDATE SET
      caption_text = COALESCE(excluded.caption_text, image_analysis.caption_text),
      ocr_text = COALESCE(excluded.ocr_text, image_analysis.ocr_text),
      updated_at = excluded.updated_at
  `).run({
    ...record,
    captionText: record.captionText ?? null,
    ocrText: record.ocrText ?? null,
  });
  refreshLexicalIndexForItem(db, record.itemId);
}

export function getImageAnalysis(db: PipelineDatabase, imageKey: string): ImageAnalysisRecord | undefined {
  return db.prepare(`SELECT image_key as imageKey, item_id as itemId, image_index as imageIndex, caption_text as captionText, ocr_text as ocrText, updated_at as updatedAt FROM image_analysis WHERE image_key = ?`).get(imageKey) as ImageAnalysisRecord | undefined;
}

export function listImageAnalysisForItem(db: PipelineDatabase, itemId: string): ImageAnalysisRecord[] {
  return db.prepare(`SELECT image_key as imageKey, item_id as itemId, image_index as imageIndex, caption_text as captionText, ocr_text as ocrText, updated_at as updatedAt FROM image_analysis WHERE item_id = ? ORDER BY image_index ASC`).all(itemId) as ImageAnalysisRecord[];
}

export function saveStructuredItem(db: PipelineDatabase, record: StructuredItemRecord): void {
  db.prepare(`
    INSERT INTO structured_items (item_id, structured_json, updated_at)
    VALUES (@itemId, @structuredJson, @updatedAt)
    ON CONFLICT(item_id) DO UPDATE SET
      structured_json = excluded.structured_json,
      updated_at = excluded.updated_at
  `).run(record);
  refreshLexicalIndexForItem(db, record.itemId);
}

export function getStructuredItem(db: PipelineDatabase, itemId: string): StructuredItemRecord | undefined {
  return db.prepare(`SELECT item_id as itemId, structured_json as structuredJson, updated_at as updatedAt FROM structured_items WHERE item_id = ?`).get(itemId) as StructuredItemRecord | undefined;
}

export function saveItemTextEmbedding(db: PipelineDatabase, record: { itemId: string; embeddingSpace: string; model: string; vectorJson: string; updatedAt: string }): void {
  db.prepare(`
    INSERT INTO item_text_embeddings (item_id, embedding_space, model, vector_json, updated_at)
    VALUES (@itemId, @embeddingSpace, @model, @vectorJson, @updatedAt)
    ON CONFLICT(item_id, embedding_space) DO UPDATE SET
      model = excluded.model,
      vector_json = excluded.vector_json,
      updated_at = excluded.updated_at
  `).run(record);
}

export function getItemTextEmbedding(db: PipelineDatabase, itemId: string, embeddingSpace: string) {
  return db.prepare(`SELECT item_id as itemId, embedding_space as embeddingSpace, model, vector_json as vectorJson, updated_at as updatedAt FROM item_text_embeddings WHERE item_id = ? AND embedding_space = ?`).get(itemId, embeddingSpace) as { itemId: string; embeddingSpace: string; model: string; vectorJson: string; updatedAt: string } | undefined;
}

export function listItemTextEmbeddings(db: PipelineDatabase) {
  return db.prepare(`SELECT item_id as itemId, embedding_space as embeddingSpace, model, vector_json as vectorJson, updated_at as updatedAt FROM item_text_embeddings`).all() as { itemId: string; embeddingSpace: string; model: string; vectorJson: string; updatedAt: string }[];
}

export function listItemTextEmbeddingsBySpace(db: PipelineDatabase, embeddingSpace: string) {
  return db.prepare(`SELECT item_id as itemId, embedding_space as embeddingSpace, model, vector_json as vectorJson, updated_at as updatedAt FROM item_text_embeddings WHERE embedding_space = ?`).all(embeddingSpace) as { itemId: string; embeddingSpace: string; model: string; vectorJson: string; updatedAt: string }[];
}

export function saveImageEmbedding(db: PipelineDatabase, record: { imageKey: string; embeddingSpace: string; model: string; vectorJson: string; updatedAt: string }): void {
  db.prepare(`
    INSERT INTO image_embeddings (image_key, embedding_space, model, vector_json, updated_at)
    VALUES (@imageKey, @embeddingSpace, @model, @vectorJson, @updatedAt)
    ON CONFLICT(image_key, embedding_space) DO UPDATE SET
      model = excluded.model,
      vector_json = excluded.vector_json,
      updated_at = excluded.updated_at
  `).run(record);
}

export function listImageEmbeddings(db: PipelineDatabase) {
  return db.prepare(`SELECT image_key as imageKey, embedding_space as embeddingSpace, model, vector_json as vectorJson, updated_at as updatedAt FROM image_embeddings`).all() as { imageKey: string; embeddingSpace: string; model: string; vectorJson: string; updatedAt: string }[];
}

export function getImageEmbedding(db: PipelineDatabase, imageKey: string, embeddingSpace: string) {
  return db.prepare(`SELECT image_key as imageKey, embedding_space as embeddingSpace, model, vector_json as vectorJson, updated_at as updatedAt FROM image_embeddings WHERE image_key = ? AND embedding_space = ?`).get(imageKey, embeddingSpace) as { imageKey: string; embeddingSpace: string; model: string; vectorJson: string; updatedAt: string } | undefined;
}

export function listImageEmbeddingsBySpace(db: PipelineDatabase, embeddingSpace: string) {
  return db.prepare(`SELECT image_key as imageKey, embedding_space as embeddingSpace, model, vector_json as vectorJson, updated_at as updatedAt FROM image_embeddings WHERE embedding_space = ?`).all(embeddingSpace) as { imageKey: string; embeddingSpace: string; model: string; vectorJson: string; updatedAt: string }[];
}

export function getLexicalDocument(db: PipelineDatabase, itemId: string): LexicalDocumentRecord | undefined {
  return db.prepare(`
    SELECT
      item_id as itemId,
      title,
      description,
      tags,
      normalized_text as normalizedText,
      shop_name as shopName,
      category_name as categoryName,
      parent_category_name as parentCategoryName,
      price_text as priceText,
      caption_text as captionText,
      ocr_text as ocrText,
      parts,
      styles,
      compatibility_hints as compatibilityHints,
      keyword_digest as keywordDigest
    FROM item_lexical_documents
    WHERE item_id = ?
  `).get(itemId) as LexicalDocumentRecord | undefined;
}

export function listLexicalDocuments(db: PipelineDatabase): LexicalDocumentRecord[] {
  return db.prepare(`
    SELECT
      item_id as itemId,
      title,
      description,
      tags,
      normalized_text as normalizedText,
      shop_name as shopName,
      category_name as categoryName,
      parent_category_name as parentCategoryName,
      price_text as priceText,
      caption_text as captionText,
      ocr_text as ocrText,
      parts,
      styles,
      compatibility_hints as compatibilityHints,
      keyword_digest as keywordDigest
    FROM item_lexical_documents
    ORDER BY item_id ASC
  `).all() as LexicalDocumentRecord[];
}

function upsertLexicalDocument(db: PipelineDatabase, document: LexicalDocumentRecord): void {
  db.prepare(`DELETE FROM item_lexical_fts WHERE item_id = ?`).run(document.itemId);
  db.prepare(`
    INSERT INTO item_lexical_fts (
      item_id,
      title,
      description,
      tags,
      normalized_text,
      shop_name,
      category_name,
      parent_category_name,
      price_text,
      caption_text,
      ocr_text,
      parts,
      styles,
      compatibility_hints,
      keyword_digest
    ) VALUES (
      @itemId,
      @title,
      @description,
      @tags,
      @normalizedText,
      @shopName,
      @categoryName,
      @parentCategoryName,
      @priceText,
      @captionText,
      @ocrText,
      @parts,
      @styles,
      @compatibilityHints,
      @keywordDigest
    )
  `).run(document);
}

export function refreshLexicalIndexForItem(db: PipelineDatabase, itemId: string): void {
  db.prepare(`DELETE FROM item_lexical_fts WHERE item_id = ?`).run(itemId);
  const document = getLexicalDocument(db, itemId);
  if (!document) {
    return;
  }
  upsertLexicalDocument(db, document);
}

export function rebuildLexicalIndex(db: PipelineDatabase): number {
  db.prepare(`DELETE FROM item_lexical_fts`).run();
  const documents = listLexicalDocuments(db);
  for (const document of documents) {
    upsertLexicalDocument(db, document);
  }
  return documents.length;
}
