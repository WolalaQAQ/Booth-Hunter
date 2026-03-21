# Goals 1-3 First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First harden Booth-Hunter’s **Goal 1 text search**, **Goal 2 image similarity search**, and **Goal 3 conversational narrowing** pipelines and performance; treat **Goal 4 finished-model reverse search** as a later consumer of the same retrieval stack instead of the immediate implementation target.

**Architecture:** Keep **Appwrite** for user-facing hosted data and **SQLite** as the canonical local build store. Replace the current prototype retrieval path with a **Qdrant-centered retrieval substrate** plus lexical exact-term retrieval, then add a structured candidate-pool narrowing layer that operates over stable text/image retrieval results. Only after that foundation is strong should the project implement and optimize Goal 4 reverse search.

**Tech Stack:** TypeScript, Node, Vite, Appwrite, SQLite, Qdrant, Qdrant JS client, Qwen3-VL-Embedding-2B, optional future reranker, OpenAI-compatible/VLM APIs, focused `tsx --test` tests, local smoke/eval scripts.

---

## Context for the next session

- **Already completed:** Phase 1A / 1B / 1C local-first foundation
- **Do not treat as final retrieval core:** `src/lib/pipeline/retrieval/search.ts` and `scripts/knowledge/test-retrieval.ts`
- **Canonical roadmap source:** `AGENTS.md`
- **Primary execution priority:** Goals 1/2/3 first
- **Goal 4:** deferred until Goals 1/2/3 are stable and benchmarked

## Phase gates

Do **not** start later phases until the previous phase passes its gate.

### Gate A — before Phase 3

Phase 2 is complete only when all of the following are true:
- text retrieval and image retrieval both run through the new Qdrant-centered stack
- lexical retrieval is implemented and demonstrably improves exact-term-heavy cases
- grouped candidate ranking exists at the `item_id` level
- a repeatable benchmark/eval script exists
- the old prototype retrieval path is no longer the recommended path for Goals 1/2

### Gate B — before Phase 4

Phase 3 is complete only when all of the following are true:
- a structured search state exists
- multi-turn narrowing updates/filter/rerank existing candidate pools instead of always re-querying from scratch
- a small curated narrowing benchmark exists
- narrowing quality is stable enough that Goal 3 is useful without manual developer intervention each turn

---

## File Structure

### Phase 2 core retrieval substrate

- Modify: `package.json`
- Modify: `README.md`
- Modify: `src/lib/pipeline/sqlite/schema.ts`
- Modify: `src/lib/pipeline/sqlite/db.ts`
- Modify: `src/lib/pipeline/retrieval/search.ts`
- Create: `src/lib/search/types.ts`
- Create: `src/lib/search/retrievers/text.ts`
- Create: `src/lib/search/retrievers/image.ts`
- Create: `src/lib/search/fusion.ts`
- Create: `src/lib/search/grouping.ts`
- Create: `src/lib/search/explanations.ts`
- Create: `src/lib/search/evaluate.ts`
- Create: `src/lib/search/indexes/qdrant/client.ts`
- Create: `src/lib/search/indexes/qdrant/schema.ts`
- Create: `src/lib/search/indexes/qdrant/projectors.ts`
- Create: `src/lib/search/indexes/qdrant/indexer.ts`
- Create: `src/lib/search/indexes/lexical.ts`
- Create: `src/lib/search/**/*.test.ts`
- Create: `scripts/retrieval/bootstrap-qdrant.ts`
- Create: `scripts/retrieval/index-assets.ts`
- Create: `scripts/retrieval/query-text.ts`
- Create: `scripts/retrieval/query-image.ts`
- Create: `scripts/eval/build-goal12-benchmark.ts`
- Create: `scripts/eval/run-goal12-eval.ts`

### Phase 3 conversational narrowing

- Modify: `index.tsx`
- Modify: `api/chat.ts` only if search-state extraction truly belongs there; otherwise prefer a separate route
- Create: `api/search.ts`
- Create: `src/lib/search/session/types.ts`
- Create: `src/lib/search/session/reducer.ts`
- Create: `src/lib/search/session/constraints.ts`
- Create: `src/lib/search/session/planner.ts`
- Create: `src/lib/search/session/storage.ts`
- Create: `src/lib/search/session/prompting.ts`
- Create: `src/lib/search/session/**/*.test.ts`
- Create: `scripts/eval/build-goal3-benchmark.ts`
- Create: `scripts/eval/run-goal3-eval.ts`

### Phase 4 deferred Goal 4 MVP

- Create: `api/reverse-search.ts`
- Create: `src/lib/reverseSearch/types.ts`
- Create: `src/lib/reverseSearch/understanding.ts`
- Create: `src/lib/reverseSearch/decompose.ts`
- Create: `src/lib/reverseSearch/aggregate.ts`
- Create: `src/lib/reverseSearch/**/*.test.ts`
- Create: `scripts/eval/build-goal4-benchmark.ts`
- Create: `scripts/eval/run-goal4-eval.ts`

### Phase 5 deferred Goal 4 quality upgrades

- Modify: `src/lib/search/fusion.ts`
- Modify: `src/lib/search/explanations.ts`
- Modify: `src/lib/reverseSearch/decompose.ts`
- Create: `src/lib/search/rerank.ts`
- Create: `src/lib/search/parts/*`
- Create: `src/lib/search/rerank.test.ts`

---

## Phase 2 — Retrieval Substrate Upgrade (Goals 1/2)

### Task 1: Add Qdrant dependency and retrieval configuration surface

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Create: `src/lib/search/indexes/qdrant/client.ts`
- Test: `src/lib/search/indexes/qdrant/client.test.ts`

- [ ] **Step 1: Add the Qdrant client dependency to `package.json`.**
- [ ] **Step 2: Document required env vars in `README.md`: `QDRANT_URL`, `QDRANT_API_KEY` (optional), `QDRANT_COLLECTION_ASSETS`, `QDRANT_COLLECTION_ITEMS`.**
- [ ] **Step 3: Write a failing config test for missing/valid Qdrant settings in `src/lib/search/indexes/qdrant/client.test.ts`.**
- [ ] **Step 4: Implement `src/lib/search/indexes/qdrant/client.ts` with a typed config reader and client factory.**
- [ ] **Step 5: Run `npm test` and verify the new targeted test passes.**
- [ ] **Step 6: Commit with `feat(search): add qdrant client configuration`.**

### Task 2: Separate runtime search from offline pipeline helpers

**Files:**
- Modify: `src/lib/pipeline/retrieval/search.ts`
- Create: `src/lib/search/types.ts`
- Create: `src/lib/search/retrievers/text.ts`
- Create: `src/lib/search/retrievers/image.ts`
- Test: `src/lib/search/retrievers/text.test.ts`
- Test: `src/lib/search/retrievers/image.test.ts`

- [ ] **Step 1: Write failing tests that define the runtime query-time contracts for text and image retrieval.**
- [ ] **Step 2: Create `src/lib/search/types.ts` for query objects, candidate records, evidence records, grouped results, and evaluation outputs.**
- [ ] **Step 3: Move any reusable prototype math out of `src/lib/pipeline/retrieval/search.ts` so runtime retrieval no longer depends on pipeline-only assumptions.**
- [ ] **Step 4: Implement `src/lib/search/retrievers/text.ts` and `src/lib/search/retrievers/image.ts` as orchestrators, not scorers with hardcoded weights.**
- [ ] **Step 5: Run `npm test` and ensure the new runtime contracts are green.**
- [ ] **Step 6: Commit with `refactor(search): split runtime search from pipeline prototype helpers`.**

### Task 3: Add lexical exact-term retrieval on top of canonical SQLite data

**Files:**
- Modify: `src/lib/pipeline/sqlite/schema.ts`
- Modify: `src/lib/pipeline/sqlite/db.ts`
- Create: `src/lib/search/indexes/lexical.ts`
- Test: `src/lib/search/indexes/lexical.test.ts`

- [ ] **Step 1: Write a failing lexical retrieval test using avatar names, style labels, and product terms that embeddings tend to blur.**
- [ ] **Step 2: Extend `src/lib/pipeline/sqlite/schema.ts` with FTS tables/views for normalized text, OCR text, caption text, and structured fields.**
- [ ] **Step 3: Add index maintenance helpers in `src/lib/pipeline/sqlite/db.ts` so lexical state updates with normalized and enriched item data.**
- [ ] **Step 4: Implement `src/lib/search/indexes/lexical.ts` with ranked lexical lookup APIs.**
- [ ] **Step 5: Run the lexical tests and confirm exact-term-heavy queries improve versus dense-only behavior on fixtures.**
- [ ] **Step 6: Commit with `feat(search): add lexical retrieval layer`.**

### Task 4: Define Qdrant schema and export projectors from SQLite

**Files:**
- Create: `src/lib/search/indexes/qdrant/schema.ts`
- Create: `src/lib/search/indexes/qdrant/projectors.ts`
- Modify: `src/lib/pipeline/sqlite/db.ts`
- Test: `src/lib/search/indexes/qdrant/projectors.test.ts`

- [ ] **Step 1: Write a failing projector test for one normalized item with multiple images, OCR text, captions, and structured fields.**
- [ ] **Step 2: Define the Qdrant point layout in `src/lib/search/indexes/qdrant/schema.ts`, including vector names and payload shape.**
- [ ] **Step 3: Implement `src/lib/search/indexes/qdrant/projectors.ts` to export two logical entities: `item` and `asset`.**
- [ ] **Step 4: Add any missing SQLite read helpers to `src/lib/pipeline/sqlite/db.ts` so projectors can read canonical item/image/enrichment state.**
- [ ] **Step 5: Run the projector tests and verify payloads are stable and deterministic.**
- [ ] **Step 6: Commit with `feat(search): add qdrant projection layer`.**

### Task 5: Implement Qdrant bootstrap and indexing flow

**Files:**
- Create: `src/lib/search/indexes/qdrant/indexer.ts`
- Create: `scripts/retrieval/bootstrap-qdrant.ts`
- Create: `scripts/retrieval/index-assets.ts`
- Test: `src/lib/search/indexes/qdrant/indexer.test.ts`

- [ ] **Step 1: Write a failing test for collection bootstrap and point upsert payload construction.**
- [ ] **Step 2: Implement `src/lib/search/indexes/qdrant/indexer.ts` to create/update collections and upsert item/asset points.**
- [ ] **Step 3: Add `scripts/retrieval/bootstrap-qdrant.ts` to validate collection existence and schema.**
- [ ] **Step 4: Add `scripts/retrieval/index-assets.ts` to export canonical SQLite state into Qdrant.**
- [ ] **Step 5: Add package scripts for these commands in `package.json`.**
- [ ] **Step 6: Run local smoke commands: bootstrap, then index a small SQLite database.**
- [ ] **Step 7: Commit with `feat(search): add qdrant indexing scripts`.**

### Task 6: Implement grouped candidate ranking and explanation assembly

**Files:**
- Create: `src/lib/search/fusion.ts`
- Create: `src/lib/search/grouping.ts`
- Create: `src/lib/search/explanations.ts`
- Modify: `src/lib/search/retrievers/text.ts`
- Modify: `src/lib/search/retrievers/image.ts`
- Test: `src/lib/search/fusion.test.ts`
- Test: `src/lib/search/grouping.test.ts`
- Test: `src/lib/search/explanations.test.ts`

- [ ] **Step 1: Write failing tests for merging lexical + dense evidence and grouping by `item_id`.**
- [ ] **Step 2: Implement `src/lib/search/fusion.ts` so score combination is explainable and configurable rather than hardcoded inside a monolithic function.**
- [ ] **Step 3: Implement `src/lib/search/grouping.ts` to collapse multiple asset hits into grouped item candidates.**
- [ ] **Step 4: Implement `src/lib/search/explanations.ts` to emit human-readable evidence summaries.**
- [ ] **Step 5: Wire grouped ranking into the text and image retrievers.**
- [ ] **Step 6: Run `npm test` and verify grouped result ordering is stable.**
- [ ] **Step 7: Commit with `feat(search): add grouped candidate ranking`.**

### Task 7: Add direct Goal 1/2 query scripts

**Files:**
- Create: `scripts/retrieval/query-text.ts`
- Create: `scripts/retrieval/query-image.ts`
- Modify: `package.json`

- [ ] **Step 1: Add `query-text` and `query-image` scripts that call the new runtime retrievers and print grouped candidates plus explanations.**
- [ ] **Step 2: Add package scripts such as `retrieval:query-text` and `retrieval:query-image`.**
- [ ] **Step 3: Run both scripts against a small indexed DB and verify they no longer depend on the old `knowledge:test-retrieval` path.**
- [ ] **Step 4: Commit with `feat(search): add direct text and image retrieval scripts`.**

### Task 8: Add Goal 1/2 benchmark and evaluation loop

**Files:**
- Create: `src/lib/search/evaluate.ts`
- Create: `scripts/eval/build-goal12-benchmark.ts`
- Create: `scripts/eval/run-goal12-eval.ts`
- Test: `src/lib/search/evaluate.test.ts`

- [ ] **Step 1: Write a failing evaluation test covering top-k hit rate and candidate usefulness.**
- [ ] **Step 2: Define benchmark case types in `src/lib/search/evaluate.ts` for text queries and image queries.**
- [ ] **Step 3: Add `scripts/eval/build-goal12-benchmark.ts` to build a curated benchmark scaffold.**
- [ ] **Step 4: Add `scripts/eval/run-goal12-eval.ts` to run batch retrieval and emit machine-readable metrics.**
- [ ] **Step 5: Add package scripts such as `eval:goal12`.**
- [ ] **Step 6: Run a small benchmark pass and record the baseline output in the working notes for the implementation session.**
- [ ] **Step 7: Commit with `feat(eval): add goal 1 and 2 benchmark loop`.**

### Phase 2 exit verification

- [ ] Run: `npm test`
- [ ] Run: `npx tsc --noEmit`
- [ ] Run: `npm run build`
- [ ] Run: `npm run retrieval:bootstrap-qdrant`
- [ ] Run: `npm run retrieval:index-assets -- --db=data/raw/smoke.sqlite`
- [ ] Run: `npm run retrieval:query-text -- --db=data/raw/smoke.sqlite --text="..."` 
- [ ] Run: `npm run retrieval:query-image -- --db=data/raw/smoke.sqlite --image="..."`
- [ ] Run: `npm run eval:goal12 -- --db=data/raw/smoke.sqlite`

---

## Phase 3 — Conversational Narrowing (Goal 3)

### Task 9: Define structured search-session state and candidate-pool model

**Files:**
- Create: `src/lib/search/session/types.ts`
- Create: `src/lib/search/session/reducer.ts`
- Test: `src/lib/search/session/reducer.test.ts`

- [ ] **Step 1: Write failing tests for creating a search session, applying new constraints, preserving candidate pools, and clearing constraints.**
- [ ] **Step 2: Define state types for target part, avatar compatibility, styles, colors, budget, include/exclude constraints, and candidate pool snapshots.**
- [ ] **Step 3: Implement `src/lib/search/session/reducer.ts` as a pure state transition layer.**
- [ ] **Step 4: Run the reducer tests and ensure transitions are deterministic.**
- [ ] **Step 5: Commit with `feat(search): add structured search session state`.**

### Task 10: Build narrowing constraint extraction and turn planner

**Files:**
- Create: `src/lib/search/session/constraints.ts`
- Create: `src/lib/search/session/planner.ts`
- Create: `src/lib/search/session/prompting.ts`
- Test: `src/lib/search/session/constraints.test.ts`
- Test: `src/lib/search/session/planner.test.ts`

- [ ] **Step 1: Write failing tests for parsing/normalizing user constraints such as avatar names, style filters, color hints, and exclusions.**
- [ ] **Step 2: Implement `constraints.ts` to normalize structured constraint updates from free-form user input.**
- [ ] **Step 3: Implement `planner.ts` to decide when to filter current candidates, rerank them, or issue supplemental retrieval.**
- [ ] **Step 4: If an LLM/VLM helper is needed for extraction, isolate prompt assembly in `prompting.ts`; keep it optional and replaceable.**
- [ ] **Step 5: Run the new tests and verify the planner favors candidate-pool refinement over full re-query when possible.**
- [ ] **Step 6: Commit with `feat(search): add narrowing planner`.**

### Task 11: Add session storage and narrow-query orchestration

**Files:**
- Create: `src/lib/search/session/storage.ts`
- Create: `api/search.ts`
- Test: `src/lib/search/session/storage.test.ts`
- Test: `api/search.test.ts`

- [ ] **Step 1: Write a failing storage test for saving/loading search session state.**
- [ ] **Step 2: Implement `storage.ts` with a clear interface; start with browser-local persistence if fastest, but keep the adapter replaceable.**
- [ ] **Step 3: Write a failing API test for text query, image query, and follow-up narrowing turns.**
- [ ] **Step 4: Implement `api/search.ts` as the runtime route for Goal 1/2/3 retrieval and narrowing.**
- [ ] **Step 5: Make sure `api/search.ts` calls the Phase 2 retrievers and the search-session planner instead of duplicating retrieval logic.**
- [ ] **Step 6: Run API and storage tests.**
- [ ] **Step 7: Commit with `feat(api): add search session route`.**

### Task 12: Add minimal UI for search + narrowing without bloating the current shell

**Files:**
- Modify: `index.tsx`
- Test: `index.search.test.tsx` if a focused UI test is practical; otherwise keep verification to type/build/manual smoke

- [ ] **Step 1: Split the current single chat-only workflow so the UI has a clear search flow for text/image retrieval and follow-up narrowing.**
- [ ] **Step 2: Add a candidate result panel that shows grouped items and explanation snippets.**
- [ ] **Step 3: Add follow-up controls for narrowing constraints instead of only free-form chat.**
- [ ] **Step 4: Keep the UI minimal; avoid major polish work until the search quality is stable.**
- [ ] **Step 5: Run `npx tsc --noEmit` and `npm run build` and manually verify a local search+narrowing flow.**
- [ ] **Step 6: Commit with `feat(ui): add minimal search narrowing workflow`.**

### Task 13: Add Goal 3 benchmark and evaluation loop

**Files:**
- Create: `scripts/eval/build-goal3-benchmark.ts`
- Create: `scripts/eval/run-goal3-eval.ts`
- Modify: `src/lib/search/evaluate.ts`
- Test: `src/lib/search/evaluate.goal3.test.ts`

- [ ] **Step 1: Write a failing evaluation test for multi-turn narrowing quality.**
- [ ] **Step 2: Extend evaluation logic so it measures candidate retention, pool shrinkage, and post-narrowing quality.**
- [ ] **Step 3: Add `build-goal3-benchmark.ts` with curated multi-turn cases.**
- [ ] **Step 4: Add `run-goal3-eval.ts` to run the narrowing flow in batch.**
- [ ] **Step 5: Add package scripts such as `eval:goal3`.**
- [ ] **Step 6: Run the Goal 3 eval script and record the baseline.**
- [ ] **Step 7: Commit with `feat(eval): add goal 3 narrowing benchmark`.**

### Phase 3 exit verification

- [ ] Run: `npm test`
- [ ] Run: `npx tsc --noEmit`
- [ ] Run: `npm run build`
- [ ] Run: `npm run eval:goal12`
- [ ] Run: `npm run eval:goal3`
- [ ] Manual smoke: text search -> image search -> two narrowing turns -> candidate pool remains stable and explainable

---

## Phase 4 — Deferred Goal 4 Reverse Search MVP

> **Do not start before Gate B passes.**

### Task 14: Add finished-image understanding and query decomposition

**Files:**
- Create: `src/lib/reverseSearch/types.ts`
- Create: `src/lib/reverseSearch/understanding.ts`
- Create: `src/lib/reverseSearch/decompose.ts`
- Test: `src/lib/reverseSearch/understanding.test.ts`
- Test: `src/lib/reverseSearch/decompose.test.ts`

- [ ] **Step 1: Write failing tests for whole-image understanding output shape and subquery generation.**
- [ ] **Step 2: Implement `understanding.ts` to derive structured clues from a finished model image.**
- [ ] **Step 3: Implement `decompose.ts` to emit 3-5 text/image/part-oriented subqueries.**
- [ ] **Step 4: Reuse Phase 2/3 retrievers; do not create a separate retrieval stack.**
- [ ] **Step 5: Commit with `feat(reverse-search): add image understanding and decomposition`.**

### Task 15: Add reverse-search aggregation route and benchmark

**Files:**
- Create: `src/lib/reverseSearch/aggregate.ts`
- Create: `api/reverse-search.ts`
- Create: `scripts/eval/build-goal4-benchmark.ts`
- Create: `scripts/eval/run-goal4-eval.ts`
- Test: `src/lib/reverseSearch/aggregate.test.ts`

- [ ] **Step 1: Write failing tests for aggregating multiple subquery result sets into grouped candidate outputs.**
- [ ] **Step 2: Implement `aggregate.ts` with part-aware grouping and explanation stitching.**
- [ ] **Step 3: Implement `api/reverse-search.ts` to orchestrate understanding -> decomposition -> retrieval -> aggregation.**
- [ ] **Step 4: Add a first Goal 4 benchmark and evaluation runner.**
- [ ] **Step 5: Commit with `feat(reverse-search): add reverse search MVP route`.**

---

## Phase 5 — Deferred Goal 4 Precision Upgrades

> **Only start after Phase 4 is usable and benchmarked.**

### Task 16: Add reranking, better fusion, and part-aware quality upgrades

**Files:**
- Create: `src/lib/search/rerank.ts`
- Create: `src/lib/search/parts/*`
- Modify: `src/lib/search/fusion.ts`
- Modify: `src/lib/search/explanations.ts`
- Modify: `src/lib/reverseSearch/decompose.ts`
- Test: `src/lib/search/rerank.test.ts`

- [ ] **Step 1: Add a reranker abstraction that can remain disabled cleanly when not configured.**
- [ ] **Step 2: Improve fusion so part evidence, whole-image evidence, and lexical evidence can be weighted separately.**
- [ ] **Step 3: Add part/crop-specific indexing helpers under `src/lib/search/parts/*`.**
- [ ] **Step 4: Extend explanations so they reference part-level evidence more precisely.**
- [ ] **Step 5: Add benchmark comparisons against the Phase 4 baseline before accepting any change as an improvement.**
- [ ] **Step 6: Commit with `feat(reverse-search): improve goal 4 precision`.**

---

## Commands the next session should expect to add

Add these package scripts during implementation:

- `retrieval:bootstrap-qdrant`
- `retrieval:index-assets`
- `retrieval:query-text`
- `retrieval:query-image`
- `eval:goal12`
- `eval:goal3`
- later: `eval:goal4`

---

## Expected acceptance targets

### End of Phase 2

- text retrieval is no longer driven by the old prototype-only ranking path
- image retrieval is no longer driven by the old prototype-only ranking path
- exact-term lexical retrieval exists
- grouped candidate explanations exist
- a reproducible Goal 1/2 benchmark exists

### End of Phase 3

- Goal 3 narrowing uses structured state
- narrowing reuses existing candidate pools rather than full re-query by default
- a reproducible Goal 3 benchmark exists
- the search flow for Goals 1/2/3 is usable end-to-end without touching Goal 4

### End of Phase 4

- Goal 4 reuses the mature Goal 1/2/3 retrieval stack
- reverse-search MVP works end-to-end
- Goal 4 has its own eval loop

---

## Final verification checklist for the implementation session

- [ ] `npm test`
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`
- [ ] `npm run sync:run -- --pages=1 --limit=1 --db=data/raw/smoke.sqlite`
- [ ] `npm run knowledge:caption -- --db=data/raw/smoke.sqlite`
- [ ] `npm run knowledge:ocr -- --db=data/raw/smoke.sqlite --mode=noop`
- [ ] `npm run knowledge:extract -- --db=data/raw/smoke.sqlite`
- [ ] `npm run knowledge:embed-text -- --db=data/raw/smoke.sqlite`
- [ ] `npm run knowledge:embed-images -- --db=data/raw/smoke.sqlite`
- [ ] new Qdrant bootstrap/index/query/eval commands
- [ ] Goal 3 narrowing smoke flow

## Handoff note

The next implementation session should start with:

1. reading `AGENTS.md`
2. reading this plan
3. executing **Phase 2 only**
4. not touching Goal 4 until Phase 2 and Phase 3 gates pass
