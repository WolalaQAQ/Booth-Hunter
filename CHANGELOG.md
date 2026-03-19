## [0.2.0] - 2026-03-19
### Features
- Replaced the local hash/pixel embedding baseline with a unified `Qwen/Qwen3-VL-Embedding-2B` shared multimodal embedding pipeline.
- Added a Python-backed Qwen embedding bridge (`scripts/ml/embed_models.py`) plus `requirements-ml.txt` so the TypeScript pipeline can call real local multimodal models without hardcoding model logic into the main app.
- Expanded SQLite embedding storage to support multiple embedding spaces per item/image and updated retrieval validation so text and image signals now meet in the same embedding space.
- Reserved a reranker interface for future `Qwen/Qwen3-VL-Reranker-2B/8B` integration without enabling it yet.

### Design Rationale
- The project now has enough local-first pipeline structure to justify replacing the placeholder embedding baselines with real models.
- The user explicitly wants text and image to share one multimodal semantic space, so a unified Qwen VL embedding model fits the roadmap better than separate text-only and image-text model families.
- `Qwen3-VL-Embedding-2B` is a practical first local target on a 16 GB GPU, while keeping the door open for later reranking.
- The Python bridge keeps the Node/TypeScript side orchestration-focused and preserves future model portability.

### Notes & Caveats
- Real embedding runs require Python dependencies from `requirements-ml.txt` and should usually point `EMBED_PYTHON_BIN` at a CUDA-capable interpreter.
- `QWEN_VL_EMBED_MODEL_ID` should point to a local `Qwen3-VL-Embedding-2B` directory if the user predownloads the model manually.
- `EMBED_DEVICE=cpu` remains a fallback, but the model is much slower there.

## [0.1.0] - 2026-03-19
### Features
- Replaced the discarded Supabase-heavy Phase 1 direction with a local-first Appwrite architecture.
- Added Appwrite-backed auth, chat, and settings repositories plus a compact catalog publish target.
- Added a thin `/api/chat` proxy that accepts request-time provider config and never persists user LLM API keys.
- Added a local SQLite pipeline for raw BOOTH backups, normalized catalog storage, transient image-processing metadata, knowledge extraction state, and embeddings.
- Added manual BOOTH sync, caption, OCR, structured extraction, text embedding, image embedding, and retrieval validation scripts.
- Added automated tests for Appwrite config, chat proxy behavior, SQLite pipeline state, transient image processing, normalization, structured extraction, embeddings, and retrieval ranking.

### Design Rationale
- The project is intended to be a practical low-cost tool, so Phase 1 was reset to a local-first architecture instead of a product-grade cloud sync platform.
- Appwrite now owns only lightweight hosted data: auth, chat history, user settings, and a compact catalog projection.
- BOOTH raw data, image bodies, enrichment artifacts, and embeddings stay local first so the knowledge base can evolve without cloud quota pressure or backend lock-in.
- All Appwrite access is wrapped behind repository abstractions to preserve future portability.

### Notes & Caveats
- Caption generation currently defaults to a heuristic provider; real VLM captioning can be plugged in later.
- OCR supports both `noop` mode for fast smoke tests and `tesseract` mode for real extraction.
- The initial Phase 1 local embedding baselines were later replaced by `Qwen3-VL-Embedding-2B` in version `0.2.0`.
- Publishing normalized catalog data to Appwrite requires valid server-side Appwrite environment variables and a project API key.
- Product images no longer need persistent local backups by default; the pipeline can download, process, and discard them while keeping URLs plus derived results.
