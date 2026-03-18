## [0.1.0] - 2026-03-19
### Features
- Replaced the discarded Supabase-heavy Phase 1 direction with a local-first Appwrite architecture.
- Added Appwrite-backed auth, chat, and settings repositories plus a compact catalog publish target.
- Added a thin `/api/chat` proxy that accepts request-time provider config and never persists user LLM API keys.
- Added a local SQLite pipeline for raw BOOTH backups, normalized catalog storage, image cache metadata, knowledge extraction state, and embeddings.
- Added manual BOOTH sync, caption, OCR, structured extraction, text embedding, image embedding, and retrieval validation scripts.
- Added automated tests for Appwrite config, chat proxy behavior, SQLite pipeline state, image cache, normalization, structured extraction, embeddings, and retrieval ranking.

### Design Rationale
- The project is intended to be a practical low-cost tool, so Phase 1 was reset to a local-first architecture instead of a product-grade cloud sync platform.
- Appwrite now owns only lightweight hosted data: auth, chat history, user settings, and a compact catalog projection.
- BOOTH raw data, image bodies, enrichment artifacts, and embeddings stay local first so the knowledge base can evolve without cloud quota pressure or backend lock-in.
- All Appwrite access is wrapped behind repository abstractions to preserve future portability.

### Notes & Caveats
- Caption generation currently defaults to a heuristic provider; real VLM captioning can be plugged in later.
- OCR supports both `noop` mode for fast smoke tests and `tesseract` mode for real extraction.
- Local embedding models are intentionally simple (`local-hash-v1`, `local-pixel-v1`) and are meant as a Phase 1 validation baseline, not the final retrieval quality ceiling.
- Publishing normalized catalog data to Appwrite requires valid server-side Appwrite environment variables and a project API key.
