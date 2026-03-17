# Repository Guidelines

## Project Structure & Module Organization
- `index.tsx` holds the main React UI and state; `index.css`, `i18n.ts`, and `supabaseClient.ts` provide shared client setup.
- `api/` houses Vercel functions. `api/chat.ts` powers search/chat, and `api/admin/*.ts` backs admin endpoints. Filenames map directly to deployed routes.
- `supabase/init.sql` defines profiles, chats, app settings, and RPCs. Flag data-impacting SQL changes in PRs.
- Root config and shell files include `index.html`, `metadata.json`, `vite.config.ts`, and `tsconfig.json`.

## Build, Test, and Development Commands
- `npm install` — install dependencies.
- `npx vercel dev` — run the full app locally, including `api/`. Use this for end-to-end verification.
- `npm run dev` — start the Vite frontend only.
- `npm run build` — create the production bundle and catch TypeScript/Vite regressions.
- `npm run preview` — preview the built frontend locally.

## Coding Style & Naming Conventions
- Use TypeScript with 2-space indentation, semicolons, and ES module imports.
- Follow the current naming pattern: `PascalCase` for components and types, `camelCase` for functions and variables, and route-aligned files such as `api/admin/users.ts`.
- Keep helpers near the feature that owns them; avoid drive-by refactors.
- No formatter or linter is configured, so match the surrounding file style closely.

## Testing Guidelines
- No automated test suite is configured yet. Minimum verification: `npm run build` and a manual smoke test in `npx vercel dev`.
- For chat/search changes, verify Booth search, session persistence, and error handling. For admin or database changes, retest relevant Supabase-backed flows.
- If you add tests, use `*.test.ts` or `*.test.tsx` names and add the script to `package.json`.

## Commit & Pull Request Guidelines
- Follow the existing history: `feat: ...`, `fix(api/chat): ...`, `refactor(search): ...`. Use Conventional Commits with optional scopes.
- PRs should include the purpose, touched areas (`frontend`, `api`, `supabase`), env or SQL changes, and UI screenshots or GIFs when relevant.
- Link related issues when available, and call out any new environment variables or `supabase/init.sql` changes explicitly.

## Security & Configuration Tips
- Keep secrets in `.env.local` or Vercel project settings only. Never expose `SUPABASE_SERVICE_ROLE_KEY` or model keys to the client.
- Exercise admin APIs through authenticated flows; they depend on server-side credentials and forwarded access tokens.

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

