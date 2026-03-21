# Booth Hunter

Booth Hunter 正在从单纯的 Booth 聊天搜索助手，演进为一个 **面向 VRChat 改模素材的多模态逆向检索工具**。

> **当前推荐架构（2026-03-21）**
>
> Booth-Hunter 应被视为一个 **multimodal candidate retrieval system**，而不是一个通用文档 RAG 应用。
>
> - **长期产品目标**：覆盖文本搜索、图搜相似、对话式 narrowing、成品改模图反推
> - **当前活跃实施优先级**：先把 **Goals 1/2/3** 的 pipeline 和性能打牢，再逐步迭代 **Goal 4**
> - **当前已实现基础**：Appwrite + 本地 SQLite + 本地知识提取 + Qwen embeddings
> - **当前目标架构**：在现有基础上升级为 **Qdrant-centered retrieval substrate + lexical retrieval + candidate aggregation/explanation**
>
> 当前项目级权威路线图与架构说明以 `AGENTS.md` 为准。

当前已完成的新 **Phase 1（local-first）** 基础包括：

- **Appwrite**：用户登录、聊天记录、用户设置、compact catalog 发布位
- **本地 SQLite**：BOOTH raw crawl 备份与知识库中间状态
- **临时图片处理**：按需下载商品图片，压缩后直接进入 OCR / embeddings，不长期保留本地图片备份
- **本地知识提取管线**：caption、OCR、structured extraction
- **本地 embeddings 与检索验证**：Qwen3-VL-Embedding-2B shared-space embeddings、basic retrieval smoke test
- **薄 `/api/chat` 代理**：使用用户自己提供的 LLM API key；API key 只保存在浏览器本地，不落库

---

## 当前架构

> 下文先描述 **当前已实现的系统**，然后描述 **当前批准的目标架构**。两者不要混淆。

### 云端
- Appwrite Auth
- Appwrite Database
- 前端 UI
- `/api/chat` 薄代理

### 本地
- `data/raw/*.sqlite`：raw crawl 数据、normalized items、caption/OCR/structured data、embeddings
- `scripts/sync/*`：手动同步 BOOTH 3D Models
- `scripts/knowledge/*`：本地知识提取与检索验证

## 当前已实现 vs 当前目标

### 当前已实现

- Appwrite：auth / chats / settings / compact catalog projection
- SQLite：canonical local build store
- Qwen3-VL-Embedding-2B：shared multimodal embeddings
- 本地 retrieval smoke test：用于验证数据管线与 embedding 是否跑通

### 当前目标（未完全实现）

- **Qdrant**：dense multimodal retrieval substrate
- **lexical retrieval**：补强 avatar 名称、商品术语、style 词汇等 exact-term recall
- **candidate grouping**：按 `item_id` 聚合文本、图片、未来 crop/part 证据
- **retrieval explanations**：输出可人工审查的召回理由
- **benchmark/evaluation**：持续评估 exact-source Recall@K 与 candidate usefulness@K
- **goal sequencing**：先服务文本搜索、图搜相似、candidate narrowing，Goal 4 后置

## 为什么不是“通用 RAG 框架主架构”

这个项目的旗舰任务不是“对文档做问答”，而是：

- 从文本、商品图、成品改模图里检索候选素材
- 合并同一个 BOOTH item 的多种证据
- 未来支持 part/crop 级别的召回
- 输出按 item 组织的候选集与解释

因此当前推荐做法是：

- **自研资产构建管线**
- **Qdrant-centered retrieval**
- **自定义 candidate aggregation / explanation**

而不是把 LangChain / LlamaIndex / Haystack 当系统骨架。

---

## 环境变量

### 前端（Vite）
放在 `.env.local`：

```env
VITE_APPWRITE_ENDPOINT=https://your-appwrite-endpoint/v1
VITE_APPWRITE_PROJECT_ID=your_project_id
VITE_APPWRITE_DATABASE_ID=booth_hunter
VITE_APPWRITE_CHATS_COLLECTION_ID=booth_hunter_chats
VITE_APPWRITE_CATALOG_COLLECTION_ID=booth_hunter_catalog
```

### Appwrite bootstrap / local publish（脚本）

```env
APPWRITE_ENDPOINT=https://your-appwrite-endpoint/v1
APPWRITE_PROJECT_ID=your_project_id
APPWRITE_DATABASE_ID=booth_hunter
APPWRITE_API_KEY=your_server_api_key
APPWRITE_CHATS_COLLECTION_ID=booth_hunter_chats
APPWRITE_CATALOG_COLLECTION_ID=booth_hunter_catalog
```

> 注意：`APPWRITE_API_KEY` 只给本地 bootstrap / publish 脚本用，不要暴露到前端。

### Qdrant retrieval substrate（Phase 2）

```env
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=optional_api_key
QDRANT_COLLECTION_ASSETS=booth_assets
QDRANT_COLLECTION_ITEMS=booth_items
```

> 注意：`QDRANT_API_KEY` 是可选的；如果你的 Qdrant 实例没有启用鉴权，可以不设置。

---

## 安装

```bash
npm install
```

如需运行真实 embedding 模型，再安装 Python 依赖：

```bash
pip install -r requirements-ml.txt
```

推荐使用带 CUDA 的独立 Python / conda 环境，并通过环境变量显式指定：

```powershell
$env:EMBED_PYTHON_BIN='C:\path\to\python.exe'
$env:EMBED_DEVICE='cuda'
$env:QWEN_VL_EMBED_MODEL_ID='D:\models\Qwen3-VL-Embedding-2B'
```

如果没有可用 GPU，可改成：

```powershell
$env:EMBED_DEVICE='cpu'
```

---

## 初始化 Appwrite

先在 Appwrite 后台创建 project，然后配置上面的环境变量。之后执行：

```bash
npm run appwrite:bootstrap
```

它会确保存在：

- `booth_hunter_chats` collection
- `booth_hunter_catalog` collection

以及当前 Phase 1 需要的字段。

---

## 本地开发

### 前端

```bash
npm run dev
```

### 含 `/api/chat` 的本地联调

```bash
npx vercel dev
```

---

## Phase 1A：本地同步 + raw 备份 + compact catalog 发布

抓取 BOOTH `3D Models` 分类第一页的 5 条商品：

```bash
npm run sync:run -- --pages=1 --limit=5 --db=data/raw/booth-pipeline.sqlite
```

这个脚本会：

1. 抓取 BOOTH 列表与 item JSON
2. 把 raw 数据写入本地 SQLite
3. 下载并压缩图片做临时处理，记录图片元数据但不长期保留图片文件
4. 生成 normalized catalog item
5. 如果配置了 Appwrite server env，则把 compact catalog 投影发布到 Appwrite

---

## Phase 1B：本地知识提取

### Caption

```bash
npm run knowledge:caption -- --db=data/raw/booth-pipeline.sqlite
```

### OCR

默认 `noop` 模式（只跑流水线，不启用真实 OCR）：

```bash
npm run knowledge:ocr -- --db=data/raw/booth-pipeline.sqlite --mode=noop
```

真实 OCR（Tesseract）：

```bash
npm run knowledge:ocr -- --db=data/raw/booth-pipeline.sqlite --mode=tesseract
```

### Structured extraction

```bash
npm run knowledge:extract -- --db=data/raw/booth-pipeline.sqlite
```

---

## Phase 1C：本地 embeddings 与检索验证

当前正式模型组合为：

- shared multimodal embedding：`Qwen/Qwen3-VL-Embedding-2B`
- reranker：**暂未接入**，只预留接口给 `Qwen/Qwen3-VL-Reranker-2B/8B`

执行 embedding 脚本前，建议先设置 Python 解释器：

```powershell
$env:EMBED_PYTHON_BIN='C:\path\to\python.exe'
$env:QWEN_VL_EMBED_MODEL_ID='D:\models\Qwen3-VL-Embedding-2B'
```

### Text embeddings

```bash
npm run knowledge:embed-text -- --db=data/raw/booth-pipeline.sqlite
```

### Image embeddings

```bash
npm run knowledge:embed-images -- --db=data/raw/booth-pipeline.sqlite
```

### Retrieval smoke test

纯文本：

```bash
npm run knowledge:test-retrieval -- --db=data/raw/booth-pipeline.sqlite --text="VRChat pose tool"
```

文本 + 图片：

```bash
npm run knowledge:test-retrieval -- --db=data/raw/booth-pipeline.sqlite --text="VRChat pose tool" --image="C:\path\to\image.webp"
```

> 注意：这里的 `knowledge:test-retrieval` 仍然是 **Phase 1 验证脚本**。它证明本地 embedding 和基本召回逻辑可运行，但它 **不是** 当前推荐的最终检索架构。

---

## 当前批准的目标架构

### 系统分层

1. **Asset construction layer**
   - crawl / normalize / OCR / caption / structured extraction
   - 把每个 BOOTH item 变成 rich asset object
2. **Retrieval substrate**
   - Qdrant dense retrieval
   - lexical exact-term retrieval
3. **Query understanding / decomposition**
   - whole-image understanding
   - subqueries / future local crops
4. **Candidate aggregation**
   - 按 `item_id` 聚合
   - 输出 explanation
5. **Evaluation**
   - benchmark
   - Recall@K
   - candidate usefulness@K

### 核心数据边界

- **Appwrite**：只存用户侧 hosted data
- **SQLite**：canonical raw/enrichment/build-state store
- **Qdrant**：retrieval-serving index

### 项目成功标准

当前执行阶段的主要目标不是“先做成品模反推”，而是先把前三个目标的 pipeline 和性能打稳。

当前阶段重点是：

- Goal 1：文本语义搜索
- Goal 2：图片相似检索
- Goal 3：对话式 narrowing / candidate pool refinement

Goal 4 仍然存在，但被延后到这些基础能力稳定之后。

长期来看，项目的逆向检索目标仍然是：

> **把几万件候选素材缩小到一批高质量、可人工审查的候选集合。**

当前推荐重点指标：

- **Goals 1/2**：retrieval relevance / candidate quality
- **Goal 3**：narrowing 后的候选池质量和稳定性
- **Goal 4**：strict exact-source item Recall@50（后续阶段研究指标）
- **Goal 4**：candidate usefulness@50（后续阶段产品指标）

在“不训练专用模型、仅使用现成 foundation model + 检索系统”的前提下，当前设计预期：

- 先优先保证 Goals 1/2/3 的性能和可用性
- Goal 4 的 Recall@50 / candidate usefulness 指标在后续阶段逐步优化

## 测试与验证

### 自动化测试

```bash
npm test
```

### Type check

```bash
npx tsc --noEmit
```

### 构建

```bash
npm run build
```

### 推荐最小验证顺序

```bash
npm test
npx tsc --noEmit
npm run build
npm run sync:run -- --pages=1 --limit=1 --db=data/raw/smoke.sqlite
npm run knowledge:caption -- --db=data/raw/smoke.sqlite
npm run knowledge:ocr -- --db=data/raw/smoke.sqlite --mode=noop
npm run knowledge:extract -- --db=data/raw/smoke.sqlite
npm run knowledge:embed-text -- --db=data/raw/smoke.sqlite
npm run knowledge:embed-images -- --db=data/raw/smoke.sqlite
npm run knowledge:test-retrieval -- --db=data/raw/smoke.sqlite --text="VRChat pose tool"
```

---

## 安全约束

- 用户自己的 LLM API key **只保存在浏览器本地**
- Appwrite 中默认只保存：
  - auth
  - chat history
  - user settings（非敏感）
  - compact catalog projection
- raw HTML / raw JSON / embeddings 主数据以本地为主，不默认上云
- 图片本体默认只做临时下载处理，不长期保留

---

## 当前 Phase 1 的实现取舍

为了优先把数据库与知识库地基搭起来，当前实现采用了以下取舍：

- caption 默认使用本地 heuristic provider，可在后续接真实 VLM
- OCR 支持 Tesseract，也支持 `noop` 模式用于快速流水线验证
- text / image 已统一升级为 `Qwen3-VL-Embedding-2B`
- reranker 目前只预留接口，暂未启用
- 图片默认不做本地持久化备份，而是按需下载处理
- retrieval 先做 local validation，不急着把原型误当成最终检索内核

这套实现偏向 **“先跑通地基，再逐步提升质量”**，而不是一上来做成复杂的产品级架构。

## Embedding 相关说明

- `Qwen3-VL-Embedding-2B` 现在同时负责：
  - text-to-item retrieval
  - text-to-image retrieval
  - image-to-image retrieval
  - image-to-item retrieval
- 文本和图片现在进入同一个 shared embedding space，而不是分别走不同模型空间。
- 当前检索脚本会把：
  - item text embeddings
  - item image embeddings
  都放进 `Qwen3-VL-Embedding-2B` 的 shared space，再做本地混合排序。
- reranker 目前只预留接口，后续再接 `Qwen3-VL-Reranker-2B/8B`。

## 新路线图（2026-03-21）

### Phase 1 — Foundation（已完成）
- local-first sync / enrich / embed 基础
- Appwrite 用户数据边界
- SQLite canonical store

### Phase 2 — Retrieval Substrate Upgrade（Goals 1/2）
- Qdrant indexing
- lexical retrieval
- grouped candidate ranking
- benchmark / evaluation

### Phase 3 — Conversational Narrowing（Goal 3）
- structured search state
- iterative refinement over candidate pools

### Phase 4 — Reverse Search MVP（Goal 4）
- whole-image understanding
- subquery decomposition
- grouped candidate output
- explanation

### Phase 5 — Goal 4 Precision Upgrades
- reranker
- better fusion
- future crop / part quality upgrades
