export const PIPELINE_SCHEMA = `
CREATE TABLE IF NOT EXISTS raw_items (
  item_id TEXT PRIMARY KEY,
  listing_page INTEGER NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  raw_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_images (
  image_key TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  image_index INTEGER NOT NULL,
  source_url TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER,
  sha256 TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS normalized_items (
  item_id TEXT PRIMARY KEY,
  normalized_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS image_analysis (
  image_key TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  image_index INTEGER NOT NULL,
  caption_text TEXT,
  ocr_text TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS structured_items (
  item_id TEXT PRIMARY KEY,
  structured_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_text_embeddings (
  item_id TEXT NOT NULL,
  embedding_space TEXT NOT NULL,
  model TEXT NOT NULL,
  vector_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (item_id, embedding_space)
);

CREATE TABLE IF NOT EXISTS image_embeddings (
  image_key TEXT NOT NULL,
  embedding_space TEXT NOT NULL,
  model TEXT NOT NULL,
  vector_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (image_key, embedding_space)
);

CREATE VIEW IF NOT EXISTS item_lexical_documents AS
SELECT
  ni.item_id AS item_id,
  COALESCE(json_extract(ni.normalized_json, '$.title'), '') AS title,
  COALESCE(json_extract(ni.normalized_json, '$.description'), '') AS description,
  COALESCE((SELECT group_concat(value, ' ') FROM json_each(ni.normalized_json, '$.tags')), '') AS tags,
  COALESCE(json_extract(ni.normalized_json, '$.normalizedText'), '') AS normalized_text,
  COALESCE(json_extract(ni.normalized_json, '$.shopName'), '') AS shop_name,
  COALESCE(json_extract(ni.normalized_json, '$.categoryName'), '') AS category_name,
  COALESCE(json_extract(ni.normalized_json, '$.parentCategoryName'), '') AS parent_category_name,
  COALESCE(json_extract(ni.normalized_json, '$.priceText'), '') AS price_text,
  COALESCE((SELECT group_concat(caption_text, ' ') FROM image_analysis ia WHERE ia.item_id = ni.item_id AND ia.caption_text IS NOT NULL), '') AS caption_text,
  COALESCE((SELECT group_concat(ocr_text, ' ') FROM image_analysis ia WHERE ia.item_id = ni.item_id AND ia.ocr_text IS NOT NULL), '') AS ocr_text,
  COALESCE((SELECT group_concat(value, ' ') FROM json_each(si.structured_json, '$.parts')), '') AS parts,
  COALESCE((SELECT group_concat(value, ' ') FROM json_each(si.structured_json, '$.styles')), '') AS styles,
  COALESCE((SELECT group_concat(value, ' ') FROM json_each(si.structured_json, '$.compatibilityHints')), '') AS compatibility_hints,
  COALESCE((SELECT group_concat(value, ' ') FROM json_each(si.structured_json, '$.keywordDigest')), '') AS keyword_digest
FROM normalized_items ni
LEFT JOIN structured_items si ON si.item_id = ni.item_id;

CREATE VIRTUAL TABLE IF NOT EXISTS item_lexical_fts USING fts5(
  item_id UNINDEXED,
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
  keyword_digest,
  tokenize = 'unicode61 remove_diacritics 2'
);
`;
