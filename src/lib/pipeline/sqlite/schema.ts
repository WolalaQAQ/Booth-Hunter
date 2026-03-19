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
  item_id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  vector_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS image_embeddings (
  image_key TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  vector_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
