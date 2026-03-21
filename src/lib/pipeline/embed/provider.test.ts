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
    runner: async ({ command, args, stdin }) => {
      calls.push({ command, args, payload: JSON.parse(stdin) });
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

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.command, "python");
  assert.equal(path.normalize(calls[0]?.args[0] || ""), path.normalize("scripts/ml/embed_models.py"));
  assert.equal(calls[0]?.args[1], "qwen-embed");
  assert.deepEqual(calls[0]?.payload, {
    inputs: [
      {
        text: "cute VRChat maid outfit",
        instruction: "Retrieve relevant BOOTH catalog items for the user's query.",
      },
    ],
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
    runner: async ({ args, stdin }) => {
      calls.push({ args, payload: JSON.parse(stdin) });
      return JSON.stringify({
        model: "Qwen/Qwen3-VL-Embedding-2B",
        embeddingSpace: MULTIMODAL_SHARED_SPACE,
        vectors: [[0.9, 0.8, 0.7]],
      });
    },
  });

  const result = await provider.embedImages(["https://example.com/item.webp"]);

  assert.equal(path.normalize(calls[0]?.args[0] || ""), path.normalize(path.join("scripts", "ml", "embed_models.py")));
  assert.equal(calls[0]?.args[1], "qwen-embed");
  assert.deepEqual(calls[0]?.payload, {
    inputs: [{ image: "https://example.com/item.webp" }],
    modelId: "Qwen/Qwen3-VL-Embedding-2B",
    embeddingSpace: MULTIMODAL_SHARED_SPACE,
    device: "cuda",
  });
  assert.equal(result.model, "Qwen/Qwen3-VL-Embedding-2B");
  assert.equal(result.embeddingSpace, MULTIMODAL_SHARED_SPACE);
});

test("python embedding provider batches multimodal requests and sends rerank requests through the configured runner", async () => {
  const seenPayloads: unknown[] = [];
  const rerankCalls: { args: string[]; payload: unknown }[] = [];
  const provider = createPythonEmbeddingProvider({
    batchSize: 2,
    qwenEmbeddingModelId: "Qwen/Qwen3-VL-Embedding-2B",
    qwenRerankerModelId: "Qwen/Qwen3-VL-Reranker-2B",
    runner: async ({ args, stdin }) => {
      const payload = JSON.parse(stdin);
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

  assert.equal(seenPayloads.length, 2);
  assert.deepEqual(result.vectors, [[1, 0, 0], [2, 0, 0], [1, 0, 0]]);

  const rerankResult = await provider.rerank({
    query: { text: "kikyo maid outfit" },
    documents: [{ text: "kikyo compatible maid dress" }],
    instruction: "Judge whether the candidate item is relevant to the BOOTH query.",
  });

  assert.equal(rerankCalls.length, 1);
  assert.equal(rerankCalls[0]?.args[1], "qwen-rerank");
  assert.deepEqual(rerankCalls[0]?.payload, {
    query: { text: "kikyo maid outfit" },
    documents: [{ text: "kikyo compatible maid dress" }],
    instruction: "Judge whether the candidate item is relevant to the BOOTH query.",
    modelId: "Qwen/Qwen3-VL-Reranker-2B",
    device: "cuda",
  });
  assert.equal(rerankResult.model, "Qwen/Qwen3-VL-Reranker-2B");
  assert.deepEqual(rerankResult.scores, [0.97]);
});

