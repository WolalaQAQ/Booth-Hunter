import path from "node:path";
import { spawn } from "node:child_process";

import { loadLocalEnv } from "../../env/local";

export const MULTIMODAL_SHARED_SPACE = "multimodal-shared";

export type EmbeddingResponse = {
  model: string;
  embeddingSpace: string;
  vectors: number[][];
};

export type RerankRequest = {
  query: { text?: string; image?: string };
  documents: Array<{ text?: string; image?: string }>;
  instruction?: string;
};

export type RerankResponse = {
  model: string;
  scores: number[];
};

export type PythonRunnerInput = {
  command: string;
  args: string[];
  stdin: string;
};

export type PythonRunner = (input: PythonRunnerInput) => Promise<string>;

export type MultimodalInput = {
  text?: string;
  image?: string;
  instruction?: string;
};

export type PythonEmbeddingProviderOptions = {
  pythonBin?: string;
  scriptPath?: string;
  qwenEmbeddingModelId?: string;
  qwenRerankerModelId?: string;
  device?: string;
  batchSize?: number;
  runner?: PythonRunner;
};

function defaultScriptPath() {
  return path.join("scripts", "ml", "embed_models.py");
}

async function execPython(input: PythonRunnerInput): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python embedding runner failed with exit code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
    child.stdin.write(input.stdin, "utf8");
    child.stdin.end();
  });
}

function parseEmbeddingResponse(stdout: string): EmbeddingResponse {
  const parsed = JSON.parse(stdout) as EmbeddingResponse;
  if (!parsed.model || !parsed.embeddingSpace || !Array.isArray(parsed.vectors)) {
    throw new Error("Invalid embedding response payload");
  }
  return parsed;
}

function parseRerankResponse(stdout: string): RerankResponse {
  const parsed = JSON.parse(stdout) as RerankResponse;
  if (!parsed.model || !Array.isArray(parsed.scores)) {
    throw new Error("Invalid rerank response payload");
  }
  return parsed;
}

function chunkInputs<T>(inputs: T[], batchSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < inputs.length; index += batchSize) {
    chunks.push(inputs.slice(index, index + batchSize));
  }
  return chunks;
}

export function createPythonEmbeddingProvider(options: PythonEmbeddingProviderOptions = {}) {
  loadLocalEnv();
  const runner = options.runner || execPython;
  const pythonBin = options.pythonBin || process.env.EMBED_PYTHON_BIN || "python";
  const scriptPath = options.scriptPath || process.env.EMBED_SCRIPT_PATH || defaultScriptPath();
  const device = options.device || process.env.EMBED_DEVICE || "cuda";
  const qwenEmbeddingModelId = options.qwenEmbeddingModelId || process.env.QWEN_VL_EMBED_MODEL_ID || "Qwen/Qwen3-VL-Embedding-2B";
  const qwenRerankerModelId = options.qwenRerankerModelId || process.env.QWEN_VL_RERANK_MODEL_ID || "Qwen/Qwen3-VL-Reranker-2B";
  const batchSize = options.batchSize || Number(process.env.EMBED_BATCH_SIZE || "4");

  async function invoke(commandName: string, payload: Record<string, unknown>) {
    return await runner({
      command: pythonBin,
      args: [scriptPath, commandName],
      stdin: JSON.stringify(payload),
    });
  }

  async function embedInBatches(inputs: MultimodalInput[]) {
    const vectors: number[][] = [];
    let model = qwenEmbeddingModelId;
    for (const batch of chunkInputs(inputs, Math.max(1, batchSize))) {
      const response = parseEmbeddingResponse(
        await invoke("qwen-embed", {
          inputs: batch,
          modelId: qwenEmbeddingModelId,
          embeddingSpace: MULTIMODAL_SHARED_SPACE,
          device,
        })
      );
      model = response.model;
      vectors.push(...response.vectors);
    }
    return { model, embeddingSpace: MULTIMODAL_SHARED_SPACE, vectors };
  }

  return {
    async embedTexts(inputs: string[], instruction?: string) {
      return embedInBatches(inputs.map((text) => ({ text, instruction })));
    },
    async embedImages(inputs: string[], instruction?: string) {
      return embedInBatches(inputs.map((image) => ({ image, instruction })));
    },
    async embedMixed(inputs: MultimodalInput[]) {
      return embedInBatches(inputs);
    },
    async rerank(request: RerankRequest) {
      const response = parseRerankResponse(
        await invoke("qwen-rerank", {
          query: request.query,
          documents: request.documents,
          instruction: request.instruction,
          modelId: qwenRerankerModelId,
          device,
        })
      );

      if (response.scores.length !== request.documents.length) {
        throw new Error(
          `Reranker returned ${response.scores.length} scores for ${request.documents.length} documents.`
        );
      }

      return response;
    },
  };
}
