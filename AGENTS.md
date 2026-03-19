# Repository Guidelines

## Project Structure & Module Organization
- `index.tsx` is now a **minimal Appwrite-backed frontend shell** for auth, chat history, user settings, and simple prompt testing.
- `api/chat.ts` is a **thin OpenAI-compatible proxy**. It accepts request-time provider configuration and user API keys, but must not persist those keys.
- `src/lib/appwrite/*` contains Appwrite config/models/client helpers.
- `src/lib/repositories/*` contains backend-agnostic repository interfaces plus the current Appwrite implementations.
- `src/lib/pipeline/*` contains the local knowledge-base pipeline: SQLite storage, BOOTH adapters, transient image download/compression, normalization, enrichment, embeddings, and retrieval helpers.
- `scripts/sync/*` and `scripts/knowledge/*` are the primary Phase 1 execution surface. Prefer these local scripts over adding cloud workers.
- `data/` is local pipeline output (SQLite DBs and smoke-test artifacts) and should stay ignored.
- `docs/superpowers/*` holds the approved Phase 1 local-first spec/plan.

## Build, Test, and Development Commands
- `npm install` — install dependencies.
- `npm run dev` — start the Vite frontend only.
- `npx vercel dev` — run the full app locally when `/api/chat` must be exercised end-to-end.
- `npm test` — run the current Node/TS test suite.
- `npx tsc --noEmit` — run type-check verification.
- `npm run build` — build the frontend bundle.
- `npm run appwrite:bootstrap` — create/verify Appwrite collections and attributes.
- `npm run sync:run` — manually crawl BOOTH 3D Models into the local SQLite pipeline, process image metadata transiently, and optionally publish compact catalog data to Appwrite.
- `npm run knowledge:caption|ocr|extract|embed-text|embed-images|test-retrieval` — run local Phase 1B/1C stages.
- `pip install -r requirements-ml.txt` — install the Python-side embedding dependencies when real Qwen multimodal embedding inference is needed.

## Coding Style & Naming Conventions
- Use TypeScript with 2-space indentation, semicolons, and ES module imports.
- Use `PascalCase` for React components and class-like types, `camelCase` for functions/variables, and route-aligned filenames for API handlers.
- Keep Appwrite access behind repository abstractions; do not scatter direct SDK calls through unrelated code.
- Keep Phase 1 logic split between `repositories/` (hosted data) and `pipeline/` (local knowledge-base work).

## Testing Guidelines
- The baseline verification suite is now: `npm test`, `npx tsc --noEmit`, and `npm run build`.
- For pipeline changes, also run at least one local smoke flow through `sync:run` and the relevant `knowledge:*` scripts.
- Favor focused `*.test.ts` files near the owning module.
- When a stage is local-first by design, local script validation counts as first-class verification.

## Commit & Pull Request Guidelines
- Use Conventional Commits (for example `feat: ...`, `fix(api/chat): ...`, `refactor(pipeline): ...`).
- PRs should call out changes across `frontend`, `api`, `appwrite`, and `pipeline` explicitly.
- Mention new environment variables, new local script usage, and any Appwrite bootstrap requirements.

## Security & Configuration Tips
- Keep `APPWRITE_API_KEY` server-side only. Never expose it to the browser.
- User-supplied LLM API keys must remain **browser-local by default**. They may be sent request-time to `/api/chat`, but must not be persisted in Appwrite.
- Treat local SQLite DBs as knowledge-base assets; keep them out of the repo and back them up separately if needed.
- Prefer setting `EMBED_PYTHON_BIN` explicitly so Node scripts use the intended Python / conda environment for embeddings.
- Prefer setting `QWEN_VL_EMBED_MODEL_ID` explicitly when the model is predownloaded to a local path.

## Product Direction & Long-Term Roadmap (2026-03-18)

### Product Goal
This project is evolving from a simple "BOOTH chat search assistant" into a **multimodal reverse-retrieval assistant for VRChat modding assets**.

The final product goal is to complete all four capabilities below:
1. Natural-language search that finds suitable BOOTH items based on description, semantics, and image content, not just tag matching.
2. Image-based search that finds visually similar items.
3. Multi-turn conversational narrowing that progressively filters and reranks candidates.
4. Reverse search from a finished model image to a **human-reviewable candidate set** of BOOTH assets that may have been used in the mod.

### Priority Order
Long-term, all four goals matter. For architecture and implementation sequencing, prioritize them in this order:
1. Goal 4: reverse search from finished model image to candidate assets.
2. Goal 2: image-to-item similarity search.
3. Goal 1: natural-language semantic search.
4. Goal 3: multi-turn conversational narrowing over candidate pools.

Reason: goals 1/2/3 are foundational subsystems for goal 4, which is the hardest and highest-value capability.

### Core Product Assumption
For reverse search, exact identification is often impossible because creators may heavily modify, combine, recolor, or obscure original BOOTH assets.
The system is still considered successful if it can shrink the search space to a **high-quality candidate range that a human can review**.

### Core Technical Strategy: Reverse-Search-First
Future implementation should follow a **reverse-search-first** architecture with three layers:

#### 1. Asset Knowledge Base Layer
Every BOOTH item should become a rich searchable object, not just a title/tag record.
Store and derive as much of the following as possible:
- title, description, tags, price, shop name, URL
- compatible avatars / bodies / versions
- structured attributes extracted from the description
- all available product images
- per-image captions
- OCR text extracted from images
- style labels (for example: jirai-kei, cyber, maid, gothic, cute, military, Japanese-style)
- part labels (for example: hair, head accessory, dress, sleeve, shoes, leg accessory, bag, tail, wings)

#### 2. Multimodal Retrieval Layer
Support at least three retrieval modes:
- text retrieval: query by natural language
- whole-image retrieval: query by uploaded image
- part-level retrieval: query by image crops or inferred local regions

Retrieval should use hybrid methods instead of relying on a single score source:
- dense vector retrieval for text
- dense vector retrieval for images
- full-text / keyword retrieval for exact terms such as avatar names, product terms, and known style words
- metadata filtering for price, avatar compatibility, category, NSFW flags, etc.
- reranking after recall

#### 3. Conversational Candidate-Narrowing Layer
Multi-turn chat should not only rewrite keywords. It should maintain structured search state and refine existing candidate pools.
Examples of state fields:
- target part (hair / outfit / accessories / full set)
- avatar compatibility
- style and color
- budget range
- include / exclude constraints
- reference image present or not

Each turn should prefer:
- update constraints
- filter/rerank current candidate sets
- trigger supplemental retrieval only when needed

### Goal 4 Special Strategy: Reverse Search from Finished Model Images
This is the flagship capability and should drive the overall system design.

Recommended pipeline:
1. **Finished-image understanding**
   - Use a VLM to describe the whole image in structured form.
   - Extract style, dominant colors, visible parts, likely categories, and likely modded regions.
2. **Region / part decomposition**
   - First version may use VLM-guided heuristic regions or simple crops.
   - Later versions may introduce actual detection / segmentation / parsing for higher precision.
3. **Per-part retrieval**
   - Retrieve candidates independently for hair, clothing, accessories, leg items, etc.
   - Combine text clues + whole-image similarity + local-region similarity.
4. **Aggregation and explanation**
   - Present candidates grouped by part and/or probable full combination.
   - Explain why each candidate was returned (similar silhouette, matching sleeve design, color layout, accessory shape, etc.).

The product should prefer **candidate reduction + explanation** over false certainty.

### Phase Roadmap
Implementation should proceed in four phases. The end goal is to complete all of them.

#### Phase 1 — Build the reverse-search foundation
Primary objective:
- Build the data and retrieval base that all later phases depend on.

Scope:
- crawl and store richer BOOTH item details
- store multiple product images per item
- generate image captions
- run OCR on product images
- extract structured attributes, style labels, and part labels
- build text embeddings and image embeddings
- stand up hybrid retrieval infrastructure

Expected outcome:
- strong improvement for semantic text search (goal 1)
- initial support for image similarity search (goal 2)
- required foundation for reverse search (goal 4)

#### Phase 2 — Deliver reverse-search MVP
Primary objective:
- Make goal 4 usable end-to-end, even if precision is still limited.

Scope:
- upload finished model images
- run VLM-based whole-image understanding
- derive 3-5 part-oriented subqueries or local views
- perform per-part candidate retrieval
- aggregate and display candidate groups for human review

Expected outcome:
- users can upload a finished model image and get a narrowed candidate range of likely BOOTH materials

#### Phase 3 — Upgrade to real conversational narrowing
Primary objective:
- Turn search into an iterative narrowing workflow instead of repeated fresh searches.

Scope:
- maintain structured conversation/search state
- allow narrowing by part, avatar, style, color, budget, exclusion constraints, etc.
- rerank/filter existing candidate pools across turns
- retrieve extra candidates only when necessary

Expected outcome:
- goal 3 becomes genuinely useful and stable
- goals 1/2/4 all benefit from better interactive refinement

#### Phase 4 — Improve precision and ranking quality
Primary objective:
- Push the quality ceiling of reverse search and multimodal matching.

Scope:
- better local region extraction or segmentation
- item-image part-level indexing
- combination scoring across multiple candidate parts
- stronger reranking and explanation quality
- human feedback loop for relevance tuning

Expected outcome:
- more accurate candidate sets
- better ranking of likely source assets
- improved trustworthiness for difficult modded examples

### Implementation Principles for Future Tasks
- Prefer incremental progress toward the four-phase roadmap over unrelated feature work.
- When choosing between short-term convenience and reverse-search foundation, prefer the foundation unless the user explicitly asks otherwise.
- Do not treat the LLM as the retrieval database. Use models for understanding, decomposition, explanation, and reranking; use indexes/vector search/metadata search for retrieval.
- Design all new search-related data structures so they can support text queries, image queries, and part-level queries.
- When implementing Phase 2+ features, always preserve the possibility that one finished model image may correspond to multiple combined BOOTH assets.
- Favor outputs that help human review: grouped candidates, confidence hints, and similarity explanations.
- Avoid overstating certainty in UI or API responses. Use wording like "possible materials", "likely candidates", or "may match" when appropriate.

## Operational Scope Preference (2026-03-19)

- Treat Booth-Hunter as a practical, low-cost tool first, not a product-grade SaaS, unless the user explicitly changes that goal.
- Prefer the simplest workable architecture that preserves the reverse-search roadmap: managed auth/database is acceptable, but avoid adding product-grade control planes, job systems, or always-on infrastructure unless clearly necessary.
- For cloud deployment, prefer free or very low-cost platforms and keep the hosted surface area small.
- A valid target shape is: one managed auth/database backend plus lightweight static/frontend hosting and, only if needed, a very small API layer.
- Prefer user-supplied LLM API credentials for inference costs. By default, avoid server-side persistence of third-party LLM API keys unless the user explicitly wants secure cross-device storage and accepts the added complexity.
- If users need saved settings, prioritize storing non-secret provider configuration (provider/base URL/model/preferences) before introducing encrypted server-side secret storage.

## Phase 1 Local-First Implementation State (2026-03-19)

### Current status

- **Phase 1A completed**
- **Phase 1B completed**
- **Phase 1C completed**
- **Phase 1C embedding upgrade completed**

### Completed verification snapshot

- Local verification completed with:
  - `npm test`
  - `npx tsc --noEmit`
  - `npm run build`
  - `npm run sync:run`
  - `npm run knowledge:caption`
  - `npm run knowledge:ocr`
  - `npm run knowledge:extract`
  - `npm run knowledge:embed-text`
  - `npm run knowledge:embed-images`
  - `npm run knowledge:test-retrieval`
- Real Appwrite verification also completed:
  - `npm run appwrite:bootstrap`
  - live `sync:run` publish smoke test against the configured Appwrite project
  - direct Appwrite document listing confirmed catalog rows were created successfully
- Real embedding-model verification also completed:
  - direct Python smoke runs for `Qwen3-VL-Embedding-2B` text and image paths
  - local `knowledge:embed-text`, `knowledge:embed-images`, and `knowledge:test-retrieval` runs with the configured CUDA Python environment and local model path

### Phase 1 split

Phase 1 is intentionally split into three local-first subphases:
1. **Phase 1A — database and sync foundation**
2. **Phase 1B — knowledge extraction foundation**
3. **Phase 1C — embeddings and basic retrieval**

### Durable architecture constraints

- Phase 1 is **local-first**. Heavy crawl and knowledge-building steps run as local manual scripts.
- Appwrite is the current hosted backend for:
  - auth
  - chat history
  - user settings
  - compact catalog projection
- Appwrite access must stay behind repository/adapter abstractions so the project can migrate later.
- `/api/chat` is intentionally thin and provider-agnostic. It accepts request-time provider config and user API keys but must not persist those keys.

### Local data pipeline rules

- Current ingest scope is:
  - **BOOTH**
  - **all items in the 3D Models category**
- Raw crawl data and pipeline state live in **local SQLite**.
- Product images are downloaded **transiently** when needed, compressed in-memory, and discarded after metadata/derived results are produced.
- Do not store images as base64 in database tables by default.

### Current Phase 1 implementation choices

- Phase 1A currently uses:
  - `scripts/sync/run.ts`
  - `src/lib/pipeline/sqlite/*`
  - `src/lib/pipeline/images/*`
  - `src/lib/pipeline/booth/adapter.ts`
  - `src/lib/repositories/catalog/*`
- Phase 1B currently uses:
  - heuristic local captions by default
  - Tesseract OCR (or `noop` mode for fast smoke tests)
  - rule-based structured signal extraction
- Phase 1C currently uses:
  - `Qwen3-VL-Embedding-2B` for shared text/image embeddings
  - Python-backed provider abstraction via `scripts/ml/embed_models.py`
  - a reserved reranker interface for future `Qwen3-VL-Reranker-*` integration
  - local retrieval validation scripts before any cloud rollout

### Embedding environment rules

- Real embedding runs require a Python environment with `requirements-ml.txt` installed.
- Prefer a CUDA-capable environment when available, but allow `EMBED_DEVICE=cpu` fallback.
- Use `EMBED_PYTHON_BIN` to point Node scripts at the correct interpreter instead of assuming the default `python` on PATH.
- Use `QWEN_VL_EMBED_MODEL_ID` to point the pipeline at the downloaded `Qwen3-VL-Embedding-2B` directory when a local model mirror is available.

### Validation preference

- During Phase 1, prioritize **database construction and validation scripts** over polished user interaction.
- Favor verification that proves the local DB, transient image-processing path, and retrieval outputs are internally consistent.
- Local smoke scripts are part of the required verification surface, not optional extras.
