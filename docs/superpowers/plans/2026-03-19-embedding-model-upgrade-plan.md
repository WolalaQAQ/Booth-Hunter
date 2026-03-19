# Phase 1 Embedding Model Upgrade Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local baseline embedding implementations with `Qwen3-VL-Embedding-2B`, so text and image share one multimodal retrieval space while preserving provider abstractions and the local-first pipeline.

**Architecture:** Add a Python-backed embedding provider layer behind the existing pipeline so Node scripts stay orchestration-focused. Store richer embedding records in SQLite, keep transient image processing, update retrieval validation so text and image both use the same Qwen multimodal space, and reserve a reranker interface for later `Qwen3-VL-Reranker-*` work.

**Tech Stack:** TypeScript, Node.js, Python 3.10+, SQLite, PyTorch CUDA, Transformers, qwen-vl-utils, Qwen3-VL-Embedding-2B.

---

## File Structure

- Modify: `package.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-03-19-phase1-local-first-design.md`
- Modify: `docs/superpowers/plans/2026-03-19-phase1-local-first-plan.md`
- Create: `docs/superpowers/plans/2026-03-19-embedding-model-upgrade-plan.md`
- Create: `requirements-ml.txt`
- Create: `scripts/ml/embed_models.py`
- Create: `src/lib/pipeline/embed/provider.ts`
- Create: `src/lib/pipeline/embed/provider.test.ts`
- Modify: `src/lib/pipeline/embed/text.ts`
- Modify: `src/lib/pipeline/embed/images.ts`
- Modify: `src/lib/pipeline/retrieval/search.ts`
- Modify: `src/lib/pipeline/retrieval/search.test.ts`
- Modify: `src/lib/pipeline/sqlite/schema.ts`
- Modify: `src/lib/pipeline/sqlite/db.ts`
- Modify: `src/lib/pipeline/sqlite/db.test.ts`
- Modify: `scripts/knowledge/embed-text.ts`
- Modify: `scripts/knowledge/embed-images.ts`
- Modify: `scripts/knowledge/test-retrieval.ts`

### Task 1: Expand SQLite embedding schema for multiple model spaces

**Files:**
- Modify: `src/lib/pipeline/sqlite/schema.ts`
- Modify: `src/lib/pipeline/sqlite/db.ts`
- Modify: `src/lib/pipeline/sqlite/db.test.ts`

- [ ] **Step 1: Write failing tests for storing multiple text/image embedding spaces per item/image.**
- [ ] **Step 2: Verify the new tests fail for the current schema helpers.**
- [ ] **Step 3: Change the schema so text embeddings are keyed by `(item_id, embedding_space)` and image embeddings are keyed by `(image_key, embedding_space)`.**
- [ ] **Step 4: Update DB helper types and queries to save/list embeddings by space and preserve model metadata.**
- [ ] **Step 5: Re-run the targeted DB tests and make sure they pass.**

### Task 2: Add a Python-backed provider abstraction for Qwen3-VL-Embedding-2B

**Files:**
- Create: `requirements-ml.txt`
- Create: `scripts/ml/embed_models.py`
- Create: `src/lib/pipeline/embed/provider.ts`
- Create: `src/lib/pipeline/embed/provider.test.ts`

- [ ] **Step 1: Write failing tests for the provider abstraction, covering command construction and parsed output.**
- [ ] **Step 2: Verify the provider tests fail before the abstraction exists.**
- [ ] **Step 3: Add Python dependency manifest with transformers, qwen-vl-utils, and related runtime requirements.**
- [ ] **Step 4: Implement `embed_models.py` with a Qwen multimodal embedding command plus a reserved reranker interface.**
- [ ] **Step 5: Implement the Node provider wrapper that shells out to Python, supports batching, and hides model-specific details behind typed interfaces.**
- [ ] **Step 6: Re-run provider tests and ensure they pass.**

### Task 3: Replace local baseline embeddings in the pipeline scripts

**Files:**
- Modify: `src/lib/pipeline/embed/text.ts`
- Modify: `src/lib/pipeline/embed/images.ts`
- Modify: `scripts/knowledge/embed-text.ts`
- Modify: `scripts/knowledge/embed-images.ts`

- [ ] **Step 1: Write failing tests for the new text/image embedding entry points so they expect provider-driven model names instead of `local-*`.**
- [ ] **Step 2: Verify those tests fail against the baseline implementation.**
- [ ] **Step 3: Update text embedding orchestration to build the item corpus and store Qwen multimodal vectors in the shared embedding space.**
- [ ] **Step 4: Update image embedding orchestration to use Qwen multimodal image embeddings in the same shared embedding space.**
- [ ] **Step 5: Keep the old local helper functions only as explicit fallback/test utilities if still needed; otherwise remove direct production use.**
- [ ] **Step 6: Re-run embed-related tests and make sure they pass.**

### Task 4: Upgrade retrieval validation to use a unified Qwen multimodal space

**Files:**
- Modify: `src/lib/pipeline/retrieval/search.ts`
- Modify: `src/lib/pipeline/retrieval/search.test.ts`
- Modify: `scripts/knowledge/test-retrieval.ts`

- [ ] **Step 1: Write failing tests for retrieval that distinguish text-only ranking from multimodal text/image query ranking.**
- [ ] **Step 2: Verify retrieval tests fail before the new query-path logic is added.**
- [ ] **Step 3: Update retrieval helpers so text and image ranking both consume the same Qwen embedding space.**
- [ ] **Step 4: Update `test-retrieval.ts` so text queries, image queries, and combined text+image queries all work through the shared multimodal space.**
- [ ] **Step 5: Re-run retrieval tests and a local validation command.**

### Task 5: Install model dependencies, run real local smoke tests, and update docs

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-03-19-phase1-local-first-design.md`
- Modify: `docs/superpowers/plans/2026-03-19-phase1-local-first-plan.md`

- [ ] **Step 1: Install Python model dependencies locally, preferring a CUDA-enabled PyTorch build that matches the machine.**
- [ ] **Step 2: Run a small direct Python smoke test to confirm Qwen3-VL-Embedding-2B loads and emits both text and image vectors.**
- [ ] **Step 3: Run the full verification suite: `npm test`, `npx tsc --noEmit`, `npm run build`.**
- [ ] **Step 4: Run end-to-end pipeline verification on a one-item SQLite DB: sync, caption, OCR, structured extraction, text embeddings, image embeddings, retrieval smoke test.**
- [ ] **Step 5: Update docs to describe the new model, Python dependency setup, GPU expectations, local model-path env vars, and the deferred reranker plan.**
- [ ] **Step 6: Review `git status` and make sure only intended files changed.**
