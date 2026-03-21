# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                    # install dependencies
npm run dev                    # Vite frontend only (port 3000)
npx vercel dev                 # full local dev including /api/chat
npm test                       # run all *.test.ts files
npx tsc --noEmit               # type-check
npm run build                  # build frontend bundle

npm run appwrite:bootstrap     # create/verify Appwrite collections

# Phase 1A — sync
npm run sync:run -- --pages=1 --limit=5 --db=data/raw/booth-pipeline.sqlite

# Phase 1B — knowledge extraction
npm run knowledge:caption  -- --db=data/raw/booth-pipeline.sqlite
npm run knowledge:ocr      -- --db=data/raw/booth-pipeline.sqlite --mode=noop   # or --mode=tesseract
npm run knowledge:extract  -- --db=data/raw/booth-pipeline.sqlite

# Phase 1C — embeddings & retrieval
npm run knowledge:embed-text    -- --db=data/raw/booth-pipeline.sqlite
npm run knowledge:embed-images  -- --db=data/raw/booth-pipeline.sqlite
npm run knowledge:test-retrieval -- --db=data/raw/booth-pipeline.sqlite --text="VRChat pose tool"
```

Python embedding dependencies (requires CUDA-capable env recommended):
```bash
pip install -r requirements-ml.txt
```

Set these env vars before running embedding scripts:
```powershell
$env:EMBED_PYTHON_BIN='C:\path\to\python.exe'
$env:EMBED_DEVICE='cuda'   # or 'cpu'
$env:QWEN_VL_EMBED_MODEL_ID='D:\models\Qwen3-VL-Embedding-2B'
```

## Architecture

Booth Hunter is a **multimodal reverse-retrieval tool for VRChat modding assets** from the BOOTH marketplace. It combines a thin cloud layer (Appwrite) with a local knowledge pipeline.

### Two Distinct Surfaces

**Cloud / Frontend** (`index.tsx`, `api/chat.ts`):
- `index.tsx` — single-file React app (auth, chat history, settings panel, minimal debug UI). All state is local React state; no global store.
- `api/chat.ts` — thin Vercel Edge Function that proxies to any OpenAI-compatible LLM. Accepts request-time API keys; never persists them.
- User LLM API keys are stored in `localStorage` only, never sent to Appwrite.

**Local Pipeline** (`scripts/`, `src/lib/pipeline/`):
- The real Phase 1 core. Runs as Node/tsx scripts against a local SQLite database.
- Images are downloaded transiently, compressed in-memory via Sharp, then discarded — never stored as blobs.

### Repository Pattern (`src/lib/repositories/`)

All Appwrite access goes through repository interfaces. Each domain has a `types.ts` interface and an `appwrite*.ts` implementation:
- `auth/` — sign up, sign in, get current user
- `chats/` — list, save, delete chat threads
- `settings/` — get/save user settings (non-sensitive; API keys excluded)
- `catalog/` — publish compact catalog projections to Appwrite; `localCatalog.ts` for local reference

### Local Pipeline (`src/lib/pipeline/`)

Stages run in order:

| Stage | Module | Script |
|-------|--------|--------|
| Crawl & store raw | `booth/adapter.ts`, `sqlite/db.ts` | `sync:run` |
| Normalize | `normalize/catalog.ts` | (part of sync) |
| Caption | `enrich/caption.ts` | `knowledge:caption` |
| OCR | `enrich/ocr.ts` | `knowledge:ocr` |
| Structured extraction | `enrich/structured.ts` | `knowledge:extract` |
| Text embeddings | `embed/text.ts`, `embed/provider.ts` | `knowledge:embed-text` |
| Image embeddings | `embed/images.ts` | `knowledge:embed-images` |
| Retrieval | `retrieval/search.ts` | `knowledge:test-retrieval` |

**SQLite schema** (`sqlite/schema.ts`): 8 tables — `raw_items`, `item_images`, `normalized_items`, `image_analysis`, `structured_items`, `item_text_embeddings`, `image_embeddings`, plus a content-hash cache table.

**Embedding model**: `Qwen3-VL-Embedding-2B` shared multimodal space for both text and image vectors. Python bridge lives in `scripts/ml/embed_models.py`. Reranker interface is reserved but not yet wired.

**Retrieval ranking** (`retrieval/search.ts`): cosine similarity, hybrid text+image scoring (70% text / 30% image weight by default).

### Environment Variables

Frontend (`.env.local`):
```
VITE_APPWRITE_ENDPOINT
VITE_APPWRITE_PROJECT_ID
VITE_APPWRITE_DATABASE_ID
VITE_APPWRITE_CHATS_COLLECTION_ID
VITE_APPWRITE_CATALOG_COLLECTION_ID
```

Server-side scripts only (never expose to browser):
```
APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_DATABASE_ID
APPWRITE_API_KEY, APPWRITE_CHATS_COLLECTION_ID, APPWRITE_CATALOG_COLLECTION_ID
EMBED_PYTHON_BIN, EMBED_DEVICE, QWEN_VL_EMBED_MODEL_ID, EMBED_BATCH_SIZE
```

### Path Alias

`@/*` maps to the repo root (configured in both `tsconfig.json` and `vite.config.ts`).

## Key Conventions

- TypeScript, 2-space indent, semicolons, ES module imports.
- `PascalCase` for React components and types; `camelCase` for functions/variables.
- Keep Appwrite SDK calls inside `repositories/`; never scatter them elsewhere.
- `data/` (SQLite DBs, pipeline artifacts) is gitignored — treat as local knowledge-base assets.
- For pipeline changes, run a smoke flow through `sync:run` + relevant `knowledge:*` scripts in addition to `npm test`.

## Product Roadmap Priority

1. Reverse search: finished model image → candidate BOOTH assets (highest value)
2. Image-to-item similarity search
3. Natural-language semantic search
4. Multi-turn conversational narrowing
