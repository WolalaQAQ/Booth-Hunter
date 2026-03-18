# Phase 1 Local-First Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the discarded Supabase-centric Phase 1 direction with a local-first Appwrite-based Phase 1A/1B/1C implementation that is fully testable locally.

**Architecture:** User-facing auth/chat/settings move to Appwrite behind repository abstractions. A local pipeline built from manual scripts handles BOOTH ingest, SQLite raw backups, image caching/compression, knowledge extraction, embeddings, and local retrieval validation. A thin `/api/chat` proxy remains for provider compatibility while keeping user API keys out of cloud persistence.

**Tech Stack:** React, TypeScript, Vite, Appwrite SDK/REST, Node scripts, SQLite, local filesystem cache, OpenAI-compatible SDK, OCR/image utilities, Node test runner.

## Execution status

- Completed on **2026-03-19**
- All planned tasks for Phase 1A / 1B / 1C are implemented in the current branch
- Verified with local tests/build plus end-to-end local pipeline smoke runs
- Verified with a real Appwrite bootstrap and live compact catalog publish smoke test

---

## File Structure

- Modify: `package.json`
- Modify: `README.md`
- Modify: `vite.config.ts`
- Modify: `index.tsx`
- Modify: `api/chat.ts`
- Delete: `supabaseClient.ts`
- Deprecate/remove: `api/admin/*.ts` if superseded by the new low-cost scope
- Create: `src/lib/appwrite/client.ts`
- Create: `src/lib/appwrite/config.ts`
- Create: `src/lib/appwrite/models.ts`
- Create: `src/lib/repositories/auth/types.ts`
- Create: `src/lib/repositories/auth/appwriteAuth.ts`
- Create: `src/lib/repositories/chats/types.ts`
- Create: `src/lib/repositories/chats/appwriteChats.ts`
- Create: `src/lib/repositories/settings/types.ts`
- Create: `src/lib/repositories/settings/appwriteSettings.ts`
- Create: `src/lib/repositories/catalog/types.ts`
- Create: `src/lib/repositories/catalog/appwriteCatalog.ts`
- Create: `src/lib/repositories/catalog/localCatalog.ts`
- Create: `src/lib/pipeline/sqlite/schema.ts`
- Create: `src/lib/pipeline/sqlite/db.ts`
- Create: `src/lib/pipeline/images/cache.ts`
- Create: `src/lib/pipeline/images/compress.ts`
- Create: `src/lib/pipeline/booth/adapter.ts`
- Create: `src/lib/pipeline/normalize/catalog.ts`
- Create: `src/lib/pipeline/enrich/caption.ts`
- Create: `src/lib/pipeline/enrich/ocr.ts`
- Create: `src/lib/pipeline/enrich/structured.ts`
- Create: `src/lib/pipeline/embed/text.ts`
- Create: `src/lib/pipeline/embed/images.ts`
- Create: `src/lib/pipeline/retrieval/search.ts`
- Create: `scripts/sync/run.ts`
- Create: `scripts/knowledge/caption.ts`
- Create: `scripts/knowledge/ocr.ts`
- Create: `scripts/knowledge/extract.ts`
- Create: `scripts/knowledge/embed-text.ts`
- Create: `scripts/knowledge/embed-images.ts`
- Create: `scripts/knowledge/test-retrieval.ts`
- Create: `src/**/*.test.ts` for focused unit/integration coverage
- Create: `CHANGELOG.md`

### Task 1: Set up isolated workspace and baseline

**Files:**
- Create: `docs/superpowers/specs/2026-03-19-phase1-local-first-design.md`
- Create: `docs/superpowers/plans/2026-03-19-phase1-local-first-plan.md`

- [ ] **Step 1: Create a dedicated worktree branch for the implementation.**
- [ ] **Step 2: Install dependencies in the worktree.**
- [ ] **Step 3: Run the baseline build and record results before changing code.**

### Task 2: Add dependencies and project scaffolding

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json` if needed
- Modify: `README.md`

- [ ] **Step 1: Add Appwrite, SQLite, image-processing, OCR, and test-runner dependencies.**
- [ ] **Step 2: Add scripts for tests, local sync, local knowledge extraction, embeddings, and retrieval validation.**
- [ ] **Step 3: Add/update README environment variables for Appwrite and local pipeline paths.**
- [ ] **Step 4: Run install and verify the dependency graph resolves.**

### Task 3: Build Appwrite abstraction layer and migrate frontend auth/chat/settings

**Files:**
- Delete: `supabaseClient.ts`
- Create: `src/lib/appwrite/config.ts`
- Create: `src/lib/appwrite/client.ts`
- Create: `src/lib/appwrite/models.ts`
- Create: `src/lib/repositories/auth/types.ts`
- Create: `src/lib/repositories/auth/appwriteAuth.ts`
- Create: `src/lib/repositories/chats/types.ts`
- Create: `src/lib/repositories/chats/appwriteChats.ts`
- Create: `src/lib/repositories/settings/types.ts`
- Create: `src/lib/repositories/settings/appwriteSettings.ts`
- Modify: `index.tsx`
- Modify: `vite.config.ts`

- [ ] **Step 1: Write failing tests for Appwrite config parsing and repository interfaces.**
- [ ] **Step 2: Implement Appwrite config/client wrappers.**
- [ ] **Step 3: Implement auth/chat/settings repositories behind interfaces.**
- [ ] **Step 4: Replace Supabase usage in `index.tsx` with Appwrite-backed flows.**
- [ ] **Step 5: Remove obsolete Supabase client imports/usages.**
- [ ] **Step 6: Run targeted tests plus a build to verify the migration compiles.**

### Task 4: Simplify the API layer into a thin `/api/chat` proxy

**Files:**
- Modify: `api/chat.ts`
- Remove or de-emphasize: `api/admin/chats.ts`, `api/admin/settings.ts`, `api/admin/users.ts`

- [ ] **Step 1: Write failing tests for proxy request validation and provider configuration handling.**
- [ ] **Step 2: Remove Supabase turn-count / admin coupling from the chat API.**
- [ ] **Step 3: Accept user-supplied provider config and request-time API key without persisting it.**
- [ ] **Step 4: Keep search behavior working while making the API thin and backend-agnostic.**
- [ ] **Step 5: Run API-focused tests and build verification.**

### Task 5: Implement the local SQLite raw store and image cache (Phase 1A core)

**Files:**
- Create: `src/lib/pipeline/sqlite/schema.ts`
- Create: `src/lib/pipeline/sqlite/db.ts`
- Create: `src/lib/pipeline/images/cache.ts`
- Create: `src/lib/pipeline/images/compress.ts`
- Create: `src/lib/pipeline/booth/adapter.ts`
- Create: `src/lib/pipeline/normalize/catalog.ts`
- Create: `scripts/sync/run.ts`
- Create: tests for SQLite, image cache, and normalization

- [ ] **Step 1: Write failing tests for SQLite schema creation, raw item persistence, image cache bookkeeping, and normalization output.**
- [ ] **Step 2: Implement local SQLite schema and DB helpers.**
- [ ] **Step 3: Implement image download + compression + cache metadata helpers.**
- [ ] **Step 4: Implement Booth adapter wrapper and normalization helpers.**
- [ ] **Step 5: Implement manual `scripts/sync/run.ts` to fetch, backup, normalize, and cache images.**
- [ ] **Step 6: Run unit tests and a scripted sample sync fixture test.**

### Task 6: Publish compact catalog data to Appwrite (remaining Phase 1A)

**Files:**
- Create: `src/lib/repositories/catalog/types.ts`
- Create: `src/lib/repositories/catalog/appwriteCatalog.ts`
- Create: `src/lib/repositories/catalog/localCatalog.ts`
- Modify: `scripts/sync/run.ts`
- Create: tests for publish behavior

- [ ] **Step 1: Write failing tests for catalog projection and Appwrite publish/upsert behavior.**
- [ ] **Step 2: Implement local catalog repository and compact Appwrite catalog repository.**
- [ ] **Step 3: Extend sync script to publish normalized records to Appwrite.**
- [ ] **Step 4: Add a verification script/test that checks SQLite + image cache + Appwrite projection consistency.**
- [ ] **Step 5: Run tests and build.**

### Task 7: Implement local knowledge extraction pipeline (Phase 1B)

**Files:**
- Create: `src/lib/pipeline/enrich/caption.ts`
- Create: `src/lib/pipeline/enrich/ocr.ts`
- Create: `src/lib/pipeline/enrich/structured.ts`
- Create: `scripts/knowledge/caption.ts`
- Create: `scripts/knowledge/ocr.ts`
- Create: `scripts/knowledge/extract.ts`
- Create: tests for caption/OCR/structured extraction orchestration

- [ ] **Step 1: Write failing tests for enrichment record creation and local persistence.**
- [ ] **Step 2: Implement caption pipeline with provider abstraction and local persistence.**
- [ ] **Step 3: Implement OCR pipeline and local persistence.**
- [ ] **Step 4: Implement structured extraction pipeline combining text + OCR/caption signals.**
- [ ] **Step 5: Add runnable scripts for each enrichment stage.**
- [ ] **Step 6: Run targeted tests and a fixture-based end-to-end local enrichment pass.**

### Task 8: Implement embeddings and local retrieval validation (Phase 1C)

**Files:**
- Create: `src/lib/pipeline/embed/text.ts`
- Create: `src/lib/pipeline/embed/images.ts`
- Create: `src/lib/pipeline/retrieval/search.ts`
- Create: `scripts/knowledge/embed-text.ts`
- Create: `scripts/knowledge/embed-images.ts`
- Create: `scripts/knowledge/test-retrieval.ts`
- Create: tests for embedding orchestration and retrieval scoring

- [ ] **Step 1: Write failing tests for embedding persistence and retrieval ranking behavior.**
- [ ] **Step 2: Implement text embedding generation and local persistence.**
- [ ] **Step 3: Implement image embedding generation and local persistence.**
- [ ] **Step 4: Implement a simple local retrieval engine for text/image queries.**
- [ ] **Step 5: Add a retrieval validation script that prints human-reviewable candidate results.**
- [ ] **Step 6: Run tests, build, and local retrieval validation.**

### Task 9: Documentation, changelog, and final verification

**Files:**
- Modify: `README.md`
- Create: `CHANGELOG.md`
- Modify: `AGENTS.md` if implementation requires further durable memory updates

- [ ] **Step 1: Update README with Appwrite setup, local pipeline usage, and validation commands.**
- [ ] **Step 2: Add a CHANGELOG entry describing the architectural reset and Phase 1A/1B/1C implementation.**
- [ ] **Step 3: Run the full verification suite: tests, build, and the local pipeline validation scripts.**
- [ ] **Step 4: Review git status/diff and ensure no discarded-direction artifacts remain.**
