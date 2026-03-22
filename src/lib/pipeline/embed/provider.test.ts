import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  createPythonEmbeddingProvider,
  MULTIMODAL_SHARED_SPACE,
} from "./provider";

test("python embedding provider sends Qwen text requests through the configured runner", async () => {
  const calls: { command: string; args: string[]; payload: unknown }[] = [];
  const provider = createPythonEmbeddingProvider({
    pythonBin: "python",
    scriptPath: "scripts/ml/embed_models.py",
    qwenEmbeddingModelId: "Qwen/Qwen3-VL-Embedding-2B",
    attnImplementation: "flash_attention_2",
    runner: async ({ command, args, stdin }) => {
      calls.push({ command, args, payload: JSON.parse(stdin) });
      if (args[1] === "qwen-env") {
        return JSON.stringify({
          python: "python",
          flashAttentionAvailable: true,
          cudaAvailable: true,
          torchVersion: "2.6.0",
        });
      }
      return JSON.stringify({
        model: "Qwen/Qwen3-VL-Embedding-2B",
        embeddingSpace: MULTIMODAL_SHARED_SPACE,
        vectors: [[0.1, 0.2, 0.3]],
      });
    },
  });

  const result = await provider.embedTexts(
    ["cute VRChat maid outfit"],
    "Retrieve relevant BOOTH catalog items for the user's query."
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.command, "python");
  assert.equal(path.normalize(calls[0]?.args[0] || ""), path.normalize("scripts/ml/embed_models.py"));
  assert.equal(calls[0]?.args[1], "qwen-env");
  assert.deepEqual(calls[0]?.payload, {
    device: "cuda",
    attnImplementation: "flash_attention_2",
    maxLength: 8192,
    minPixels: 4096,
    maxPixels: 1843200,
  });
  assert.equal(calls[1]?.args[1], "qwen-embed");
  assert.deepEqual(calls[1]?.payload, {
    inputs: [
      {
        text: "cute VRChat maid outfit",
        instruction: "Retrieve relevant BOOTH catalog items for the user's query.",
      },
    ],
    batchSize: 4,
    progressLabel: "qwen-embed",
    attnImplementation: "flash_attention_2",
    maxLength: 8192,
    minPixels: 4096,
    maxPixels: 1843200,
    modelId: "Qwen/Qwen3-VL-Embedding-2B",
    embeddingSpace: MULTIMODAL_SHARED_SPACE,
    device: "cuda",
  });
  assert.equal(result.model, "Qwen/Qwen3-VL-Embedding-2B");
  assert.equal(result.embeddingSpace, MULTIMODAL_SHARED_SPACE);
  assert.deepEqual(result.vectors, [[0.1, 0.2, 0.3]]);
});

test("python embedding provider sends Qwen image requests through the configured runner", async () => {
  const calls: { args: string[]; payload: unknown }[] = [];
  const provider = createPythonEmbeddingProvider({
    qwenEmbeddingModelId: "Qwen/Qwen3-VL-Embedding-2B",
    attnImplementation: "flash_attention_2",
    runner: async ({ args, stdin }) => {
      calls.push({ args, payload: JSON.parse(stdin) });
      if (args[1] === "qwen-env") {
        return JSON.stringify({
          python: "python",
          flashAttentionAvailable: true,
          cudaAvailable: true,
          torchVersion: "2.6.0",
        });
      }
      return JSON.stringify({
        model: "Qwen/Qwen3-VL-Embedding-2B",
        embeddingSpace: MULTIMODAL_SHARED_SPACE,
        vectors: [[0.9, 0.8, 0.7]],
      });
    },
  });

  const result = await provider.embedImages(["https://example.com/item.webp"]);

  assert.equal(path.normalize(calls[1]?.args[0] || ""), path.normalize(path.join("scripts", "ml", "embed_models.py")));
  assert.equal(calls[1]?.args[1], "qwen-embed");
  assert.deepEqual(calls[1]?.payload, {
    inputs: [{ image: "https://example.com/item.webp" }],
    batchSize: 4,
    progressLabel: "qwen-embed",
    attnImplementation: "flash_attention_2",
    maxLength: 8192,
    minPixels: 4096,
    maxPixels: 1843200,
    modelId: "Qwen/Qwen3-VL-Embedding-2B",
    embeddingSpace: MULTIMODAL_SHARED_SPACE,
    device: "cuda",
  });
  assert.equal(result.model, "Qwen/Qwen3-VL-Embedding-2B");
  assert.equal(result.embeddingSpace, MULTIMODAL_SHARED_SPACE);
});

test("python embedding provider forwards batch size to a single Python embedding call and sends rerank requests through the configured runner", async () => {
  const seenPayloads: unknown[] = [];
  const rerankCalls: { args: string[]; payload: unknown }[] = [];
  const envCalls: { args: string[]; payload: unknown }[] = [];
  const embeddingProgress: Array<{ label: string; completed: number; total: number }> = [];
  const provider = createPythonEmbeddingProvider({
    batchSize: 2,
    qwenEmbeddingModelId: "Qwen/Qwen3-VL-Embedding-2B",
    qwenRerankerModelId: "Qwen/Qwen3-VL-Reranker-2B",
    attnImplementation: "flash_attention_2",
    onEmbeddingProgress: (progress) => {
      embeddingProgress.push(progress);
    },
    runner: async ({ args, stdin }) => {
      const payload = JSON.parse(stdin);
      if (args[1] === "qwen-env") {
        envCalls.push({ args, payload });
        return JSON.stringify({
          python: "python",
          flashAttentionAvailable: true,
          cudaAvailable: true,
          torchVersion: "2.6.0",
        });
      }
      if (args[1] === "qwen-rerank") {
        rerankCalls.push({ args, payload });
        return JSON.stringify({
          model: "Qwen/Qwen3-VL-Reranker-2B",
          scores: [0.97],
        });
      }
      seenPayloads.push(payload);
      const inputs = (payload.inputs as unknown[]) || [];
      return JSON.stringify({
        model: "Qwen/Qwen3-VL-Embedding-2B",
        embeddingSpace: MULTIMODAL_SHARED_SPACE,
        vectors: inputs.map((_value, index) => [index + 1, 0, 0]),
      });
    },
  });

  const result = await provider.embedMixed([
    { text: "dress" },
    { image: "a.jpg" },
    { text: "hair", image: "b.jpg" },
  ]);

  assert.equal(seenPayloads.length, 1);
  assert.deepEqual(seenPayloads[0], {
    inputs: [
      { text: "dress" },
      { image: "a.jpg" },
      { text: "hair", image: "b.jpg" },
    ],
    batchSize: 2,
    progressLabel: "qwen-embed",
    attnImplementation: "flash_attention_2",
    maxLength: 8192,
    minPixels: 4096,
    maxPixels: 1843200,
    modelId: "Qwen/Qwen3-VL-Embedding-2B",
    embeddingSpace: MULTIMODAL_SHARED_SPACE,
    device: "cuda",
  });
  assert.deepEqual(result.vectors, [[1, 0, 0], [2, 0, 0], [3, 0, 0]]);
  assert.deepEqual(embeddingProgress, []);
  assert.equal(envCalls.length, 1);

  const rerankResult = await provider.rerank({
    query: { text: "kikyo maid outfit" },
    documents: [{ text: "kikyo compatible maid dress" }],
    instruction: "Judge whether the candidate item is relevant to the BOOTH query.",
  });

  assert.equal(rerankCalls.length, 1);
  assert.equal(envCalls.length, 1);
  assert.equal(rerankCalls[0]?.args[1], "qwen-rerank");
  assert.deepEqual(rerankCalls[0]?.payload, {
    query: { text: "kikyo maid outfit" },
    documents: [{ text: "kikyo compatible maid dress" }],
    instruction: "Judge whether the candidate item is relevant to the BOOTH query.",
    attnImplementation: "flash_attention_2",
    maxLength: 8192,
    minPixels: 4096,
    maxPixels: 1843200,
    modelId: "Qwen/Qwen3-VL-Reranker-2B",
    device: "cuda",
  });
  assert.equal(rerankResult.model, "Qwen/Qwen3-VL-Reranker-2B");
  assert.deepEqual(rerankResult.scores, [0.97]);
});

test("python embedding provider parses qwen progress lines and forwards non-progress stderr separately", async () => {
  const embeddingProgress: Array<{ label: string; completed: number; total: number }> = [];
  const stderrLines: string[] = [];

  const provider = createPythonEmbeddingProvider({
    onEmbeddingProgress: (progress) => {
      embeddingProgress.push(progress);
    },
    stderrWriter: (text) => {
      stderrLines.push(text);
    },
    runner: async ({ args, stdin, onStderr }) => {
      if (args[1] === "qwen-env") {
        return JSON.stringify({
          python: "python",
          flashAttentionAvailable: true,
          cudaAvailable: true,
          torchVersion: "2.6.0",
        });
      }
      const payload = JSON.parse(stdin);
      assert.equal(payload.batchSize, 4);
      onStderr?.("Loading weights...\n");
      onStderr?.("qwen-embed 4/10\nqwen-embed 8/10\n");
      onStderr?.("qwen-embed 10/10\n");
      return JSON.stringify({
        model: "Qwen/Qwen3-VL-Embedding-2B",
        embeddingSpace: MULTIMODAL_SHARED_SPACE,
        vectors: Array.from({ length: 10 }, () => [0.1, 0.2]),
      });
    },
  });

  const result = await provider.embedTexts(Array.from({ length: 10 }, (_value, index) => `text-${index}`));

  assert.equal(result.vectors.length, 10);
  assert.deepEqual(embeddingProgress, [
    { label: "qwen-embed", completed: 4, total: 10 },
    { label: "qwen-embed", completed: 8, total: 10 },
    { label: "qwen-embed", completed: 10, total: 10 },
  ]);
  assert.deepEqual(stderrLines, ["Loading weights...\n"]);
});

test("python embedding provider fails fast when flash_attention_2 is requested but unavailable", async () => {
  const calls: string[] = [];
  const provider = createPythonEmbeddingProvider({
    attnImplementation: "flash_attention_2",
    runner: async ({ args }) => {
      calls.push(args[1] || "");
      if (args[1] === "qwen-env") {
        return JSON.stringify({
          python: "C:/envs/torch/python.exe",
          flashAttentionAvailable: false,
          cudaAvailable: true,
          torchVersion: "2.6.0",
        });
      }

      return JSON.stringify({
        model: "Qwen/Qwen3-VL-Embedding-2B",
        embeddingSpace: MULTIMODAL_SHARED_SPACE,
        vectors: [[0.1, 0.2]],
      });
    },
  });

  await assert.rejects(
    () => provider.embedTexts(["test query"]),
    /flash_attention_2.*not installed|not available/i
  );
  assert.deepEqual(calls, ["qwen-env"]);
});

test("python embedding provider exposes runtime info including resolved attention backend", async () => {
  const provider = createPythonEmbeddingProvider({
    attnImplementation: "auto",
    runner: async ({ args }) => {
      assert.equal(args[1], "qwen-env");
      return JSON.stringify({
        python: "python",
        flashAttentionAvailable: false,
        xformersAvailable: true,
        cudaAvailable: true,
        torchVersion: "2.6.0",
        requestedAttentionImplementation: "auto",
        resolvedAttentionImplementation: "sdpa",
        supportedAttentionImplementations: ["eager", "sdpa", "flash_attention_2"],
      });
    },
  });

  const runtimeInfo = await provider.getRuntimeInfo();

  assert.deepEqual(runtimeInfo, {
    python: "python",
    flashAttentionAvailable: false,
    xformersAvailable: true,
    cudaAvailable: true,
    torchVersion: "2.6.0",
    requestedAttentionImplementation: "auto",
    resolvedAttentionImplementation: "sdpa",
    supportedAttentionImplementations: ["eager", "sdpa", "flash_attention_2"],
  });
});

test("python embedding provider fails fast when xformers is requested but unsupported by transformers", async () => {
  const provider = createPythonEmbeddingProvider({
    attnImplementation: "xformers",
    runner: async ({ args }) => {
      assert.equal(args[1], "qwen-env");
      return JSON.stringify({
        python: "python",
        flashAttentionAvailable: false,
        xformersAvailable: true,
        cudaAvailable: true,
        torchVersion: "2.6.0",
        requestedAttentionImplementation: "xformers",
        resolvedAttentionImplementation: undefined,
        supportedAttentionImplementations: ["eager", "sdpa", "flash_attention_2"],
        unsupportedAttentionReason:
          "xformers is installed, but current transformers/Qwen3-VL does not support it as attn_implementation.",
      });
    },
  });

  await assert.rejects(() => provider.embedTexts(["test query"]), /xformers.*not support/i);
});

