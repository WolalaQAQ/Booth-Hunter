## [0.2.4] - 2026-03-23
### Features
- Reworked the local embedding pipeline so `knowledge:embed-text` and `knowledge:embed-images` now keep a single persistent Python Qwen worker alive across batches instead of respawning Python for each request.
- Split embedding inference from SQLite persistence with a dedicated writer process and a bounded pending-save queue, so inference can continue while earlier batches are being written.
- Removed the misleading `chunk-size` path and kept only explicit `provider-batch-size`, `save-batch-size`, and `max-pending-save-batches` controls for the embedding scripts.
- Simplified embedding progress output to focus on actionable pipeline state (`inferred`, `saved`, queue backlog, and timing) instead of runtime capability diagnostics.

### Design Rationale
- The previous per-call Python process model reloaded model weights repeatedly and made large runs look stalled even when the model itself was healthy.
- A separate writer process keeps the pipeline architecture clean: model throughput is constrained by GPU work, while SQLite persistence is handled independently with explicit backpressure.
- Removing compatibility knobs and failed experiment residue keeps the Phase 1 pipeline easier to reason about and avoids accreting legacy behavior around embedding execution.

### Notes & Caveats
- `--chunk-size` is no longer accepted; embedding runs must use `--save-batch-size` for persistence granularity and `--provider-batch-size` for model inference granularity.
- Verification smoke runs should continue to keep `--provider-batch-size <= 6` unless the user explicitly approves a larger batch.

## [0.2.3] - 2026-03-22
### Features
- Added shared async/progress helpers plus tqdm-style terminal progress reporting for `sync:run` and the `knowledge:*` local pipeline scripts.
- Added `skip-existing`, concurrency, chunking, primary-image filtering, and richer runtime summary options across caption/OCR/extract/text-embed/image-embed flows.
- Upgraded the Python Qwen bridge and TypeScript embedding provider to probe runtime attention support, fail fast on unsupported requested backends, and surface inner embedding progress back to the main stage progress output.
- Ignored `docs/superpowers` in the repo root `.gitignore` so temporary workflow artifacts stay out of commits.

### Design Rationale
- Long-running local Booth-Hunter jobs need visible real-time progress and resumable behavior so the user can tell whether a run is healthy before waiting on large batches.
- Attention-backend validation should happen before expensive embedding work starts, especially when `flash_attention_2` is expected in the configured Python environment.
- Shared helpers reduce duplication across the local-first pipeline surface and make future stage hardening easier.

### Notes & Caveats
- The embedding scripts now report both the requested and resolved attention backend; `--attn-implementation=auto` remains available when environment-specific fallback is needed.
- `skip-existing` progress is counted explicitly, but the exact skip/processed mix still depends on the current local SQLite state and the selected crawl limit.

## [0.2.2] - 2026-03-21
### Features
- Reprioritized the roadmap so Booth-Hunter now first hardens the **Goals 1/2/3 pipelines and performance** before treating **Goal 4 finished-model reverse search** as an active implementation target.
- Updated `AGENTS.md` and `README.md` to move Goal 4 later in the execution order while keeping it as a long-term capability.

### Design Rationale
- The user wants the first three goals to become strong and stable before spending more engineering effort on finished-model reverse search.
- Goals 1/2/3 provide the shared retrieval, ranking, and refinement substrate that Goal 4 will later reuse.

### Notes & Caveats
- Goal 4 is deferred, not removed.
- Qdrant-centered retrieval remains the approved architecture direction; only the execution priority changed.

## [0.2.1] - 2026-03-21
### Features
- Reframed Booth-Hunter in the project docs as a **reverse-search-first multimodal retrieval system** instead of a generic Booth chat/RAG app.
- Updated `AGENTS.md` and `README.md` to distinguish the **currently implemented Phase 1 foundation** from the **approved next-step retrieval architecture**.
- Recorded a **Qdrant-centered retrieval substrate** direction with lexical recall, grouped candidate ranking, and benchmark-driven evaluation as the approved next architecture step.

### Design Rationale
- The flagship task is candidate reduction from finished VRChat model images, so the architecture should optimize for retrieval quality and human-reviewable candidate sets rather than generic document-chat abstractions.
- The current local retrieval code is a valid validation prototype, but not the right long-term retrieval core.
- Dense multimodal recall, exact-term recall, grouping, and evaluation need to become explicit first-class systems before conversational narrowing work.

### Notes & Caveats
- This release records an architectural direction change in canonical project docs; the full Qdrant-centered retrieval stack is **planned**, not yet fully implemented in the current branch.
- The completed 2026-03-19 local-first foundation remains valid and is now treated as the base layer for the new retrieval architecture.

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
