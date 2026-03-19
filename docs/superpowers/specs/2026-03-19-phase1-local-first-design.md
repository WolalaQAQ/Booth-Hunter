# Phase 1 Local-First Foundation Design

**Goal:** Build a low-cost, local-first Phase 1 for Booth-Hunter: Appwrite for user-facing data, local SQLite for BOOTH ingest, transient image processing, and local knowledge extraction / embedding validation before any cloud publication.

## Status

- Implemented on **2026-03-19**
- Phase 1A / 1B / 1C are complete in the current branch
- Verified locally with tests, build, sync, enrichment, embedding, and retrieval smoke runs
- Verified against a real Appwrite project with successful bootstrap and catalog publish smoke tests

## Scope

### Phase 1A — database and sync foundation
- Replace Supabase user/data dependencies with Appwrite for auth, profile, chats, and user settings.
- Keep a thin `/api/chat` proxy; user LLM API keys stay local and are passed per request.
- Build local manual sync scripts for BOOTH 3D Models.
- Store raw crawl data in local SQLite.
- Download and compress product images transiently during processing without keeping long-term local image backups by default.
- Normalize catalog data and publish a compact projection to Appwrite.

### Phase 1B — knowledge extraction foundation
- Run local image captioning.
- Run local OCR.
- Extract structured fields from item text and image-derived text.
- Persist enrichment results locally first.

### Phase 1C — embeddings and basic retrieval
- Generate local shared text/image embeddings with **Qwen3-VL-Embedding-2B**.
- Build and test a basic local retrieval workflow before any cloud rollout.

## Architecture
- **Frontend/UI:** existing React app, updated to use Appwrite auth/chat/settings and local user-held LLM provider config.
- **Thin API:** existing `/api/chat` remains the only required online inference path; it receives a user-supplied provider config/key for the current request and does not persist the key.
- **Local pipeline:** manual Node scripts handle crawl, raw backup, transient image processing, enrichment, and retrieval tests.
- **Cloud publishing:** Appwrite stores only user-facing data and a compact catalog projection; raw payloads remain local, and image binaries are not retained by default.

## Data boundaries
- **Appwrite stores:** auth, profile, chats, settings, compact catalog rows, compact image metadata.
- **Local SQLite stores:** crawl runs, raw items, raw item images, normalized catalog, caption/OCR/structured extraction results, embeddings metadata, retrieval test runs.
- **Local filesystem stores:** optional exports only; product images are not retained by default.

## Constraints
- Prefer local-first over always-on cloud services.
- Avoid product-grade worker/job/control-plane systems.
- Do not store user third-party API keys server-side by default.
- Keep Appwrite integrations behind repository interfaces to preserve future migration flexibility.
- Keep the embedding provider behind a Python-backed abstraction so model swaps do not leak through the TypeScript pipeline.
- Text and image should prefer a **single multimodal semantic space** when possible; separate text-only/image-only spaces are a fallback, not the default direction.
- Reserve a reranker integration point, but do not let it block Phase 1C completion.
