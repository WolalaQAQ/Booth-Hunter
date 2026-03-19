# Booth Hunter

Booth Hunter 正在从单纯的 Booth 聊天搜索助手，演进为一个 **面向 VRChat 改模素材的多模态逆向检索工具**。

当前已完成的新 **Phase 1（local-first）** 基础包括：

- **Appwrite**：用户登录、聊天记录、用户设置、compact catalog 发布位
- **本地 SQLite**：BOOTH raw crawl 备份与知识库中间状态
- **临时图片处理**：按需下载商品图片，压缩后直接进入 OCR / embeddings，不长期保留本地图片备份
- **本地知识提取管线**：caption、OCR、structured extraction
- **本地 embeddings 与检索验证**：Qwen3-VL-Embedding-2B shared-space embeddings、basic retrieval smoke test
- **薄 `/api/chat` 代理**：使用用户自己提供的 LLM API key；API key 只保存在浏览器本地，不落库

---

## 当前架构

### 云端
- Appwrite Auth
- Appwrite Database
- 前端 UI
- `/api/chat` 薄代理

### 本地
- `data/raw/*.sqlite`：raw crawl 数据、normalized items、caption/OCR/structured data、embeddings
- `scripts/sync/*`：手动同步 BOOTH 3D Models
- `scripts/knowledge/*`：本地知识提取与检索验证

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

---

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
- retrieval 先做 local validation，不急着上云

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
