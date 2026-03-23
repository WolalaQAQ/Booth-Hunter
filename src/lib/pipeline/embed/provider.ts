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
  onStderr?: (text: string) => void;
};

export type PythonRunner = (input: PythonRunnerInput) => Promise<string>;

export type PythonCommandName = "qwen-env" | "qwen-embed" | "qwen-rerank";

export type PythonSessionInvokeInput = {
  commandName: PythonCommandName;
  payload: Record<string, unknown>;
  onStderr?: (text: string) => void;
};

export type PythonSession = {
  invoke(input: PythonSessionInvokeInput): Promise<string>;
  dispose(): Promise<void>;
};

export type PythonSessionFactoryOptions = {
  pythonBin: string;
  scriptPath: string;
  stderrWriter: (text: string) => void;
};

export type PythonSessionFactory = (options: PythonSessionFactoryOptions) => PythonSession;

export type MultimodalInput = {
  text?: string;
  image?: string;
  instruction?: string;
};

export type PythonRuntimeInfo = {
  python?: string;
  flashAttentionAvailable?: boolean;
  cudaAvailable?: boolean;
  torchVersion?: string;
  requestedAttentionImplementation?: string;
  resolvedAttentionImplementation?: string;
  supportedAttentionImplementations?: string[];
  unsupportedAttentionReason?: string;
};

export type PythonEmbeddingProviderOptions = {
  pythonBin?: string;
  scriptPath?: string;
  qwenEmbeddingModelId?: string;
  qwenRerankerModelId?: string;
  device?: string;
  batchSize?: number;
  attnImplementation?: string;
  maxLength?: number;
  imageMinPixels?: number;
  imageMaxPixels?: number;
  runner?: PythonRunner;
  sessionFactory?: PythonSessionFactory;
  onEmbeddingProgress?: (progress: { label: string; completed: number; total: number }) => void;
  stderrWriter?: (text: string) => void;
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
      const text = chunk.toString();
      stderr += text;
      input.onStderr?.(text);
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

function createRunnerSession(
  runner: PythonRunner,
  options: {
    pythonBin: string;
    scriptPath: string;
  }
): PythonSession {
  return {
    async invoke(input: PythonSessionInvokeInput) {
      return await runner({
        command: options.pythonBin,
        args: [options.scriptPath, input.commandName],
        stdin: JSON.stringify(input.payload),
        onStderr: input.onStderr,
      });
    },
    async dispose() {},
  };
}

function createPersistentPythonSession(options: PythonSessionFactoryOptions): PythonSession {
  let child:
    | ReturnType<typeof spawn>
    | undefined;
  let disposed = false;
  let nextRequestId = 0;
  let stdoutBuffer = Buffer.alloc(0);
  let expectedResponseBytes: number | undefined;
  const pending = new Map<
    number,
    {
      resolve: (stdout: string) => void;
      reject: (error: Error) => void;
      onStderr?: (text: string) => void;
    }
  >();
  const pendingOrder: number[] = [];

  function rejectPending(error: Error) {
    for (const requestId of pendingOrder.splice(0)) {
      const entry = pending.get(requestId);
      pending.delete(requestId);
      entry?.reject(error);
    }
  }

  function activeStderrHandler() {
    const activeRequestId = pendingOrder[0];
    if (activeRequestId === undefined) {
      return undefined;
    }
    return pending.get(activeRequestId)?.onStderr;
  }

  function handleWorkerMessage(message: {
    id?: number;
    ok?: boolean;
    result?: unknown;
    error?: { message?: string };
  }) {
    const requestId = Number(message.id);
    const entry = pending.get(requestId);
    if (!entry) {
      return;
    }
    pending.delete(requestId);
    const orderIndex = pendingOrder.indexOf(requestId);
    if (orderIndex >= 0) {
      pendingOrder.splice(orderIndex, 1);
    }

    if (message.ok) {
      entry.resolve(JSON.stringify(message.result ?? null));
      return;
    }

    entry.reject(new Error(message.error?.message || "Python worker request failed"));
  }

  function handleStdout(chunk: Buffer) {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);

    while (true) {
      if (expectedResponseBytes === undefined) {
        const newlineIndex = stdoutBuffer.indexOf(0x0a);
        if (newlineIndex < 0) {
          return;
        }
        const header = stdoutBuffer.slice(0, newlineIndex).toString("utf8").trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (!header) {
          continue;
        }
        expectedResponseBytes = Number(header);
        if (!Number.isFinite(expectedResponseBytes) || expectedResponseBytes < 0) {
          rejectPending(new Error(`Invalid Python worker frame length: ${header}`));
          expectedResponseBytes = undefined;
          return;
        }
      }

      if (stdoutBuffer.length < expectedResponseBytes) {
        return;
      }

      const rawMessage = stdoutBuffer.slice(0, expectedResponseBytes).toString("utf8");
      stdoutBuffer = stdoutBuffer.slice(expectedResponseBytes);
      expectedResponseBytes = undefined;

      try {
        handleWorkerMessage(JSON.parse(rawMessage));
      } catch (error) {
        rejectPending(new Error(`Failed to parse Python worker response: ${(error as Error).message}`));
        return;
      }
    }
  }

  function ensureChild() {
    if (disposed) {
      throw new Error("Python embedding session has already been disposed.");
    }
    if (child) {
      return child;
    }

    child = spawn(options.pythonBin, ["-u", options.scriptPath, "qwen-worker"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdout.on("data", (data) => {
      handleStdout(data as Buffer);
    });
    child.stderr.on("data", (data) => {
      const text = data.toString();
      const onStderr = activeStderrHandler();
      if (onStderr) {
        onStderr(text);
        return;
      }
      options.stderrWriter(text);
    });
    child.on("error", (error) => {
      rejectPending(error instanceof Error ? error : new Error(String(error)));
    });
    child.on("close", (code, signal) => {
      if (disposed && pending.size === 0) {
        return;
      }
      rejectPending(new Error(`Python embedding worker exited unexpectedly (code=${code}, signal=${signal || "none"}).`));
      child = undefined;
    });

    return child;
  }

  return {
    async invoke(input: PythonSessionInvokeInput) {
      const currentChild = ensureChild();
      return await new Promise<string>((resolve, reject) => {
        const requestId = nextRequestId++;
        pending.set(requestId, { resolve, reject, onStderr: input.onStderr });
        pendingOrder.push(requestId);
        const rawRequest = Buffer.from(
          JSON.stringify({
            id: requestId,
            command: input.commandName,
            payload: input.payload,
          }),
          "utf8"
        );
        currentChild.stdin.write(Buffer.concat([Buffer.from(`${rawRequest.length}\n`, "utf8"), rawRequest]));
      });
    },
    async dispose() {
      disposed = true;
      if (!child) {
        return;
      }

      const currentChild = child;
      child = undefined;
      rejectPending(new Error("Python embedding session was disposed."));

      if (currentChild.exitCode !== null) {
        return;
      }

      await new Promise<void>((resolve) => {
        currentChild.once("close", () => resolve());
        currentChild.kill();
      });
    },
  };
}

function parseRuntimeInfoResponse(stdout: string): PythonRuntimeInfo {
  const parsed = JSON.parse(stdout) as PythonRuntimeInfo;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid runtime info payload");
  }
  return parsed;
}

export function createPythonEmbeddingProvider(options: PythonEmbeddingProviderOptions = {}) {
  loadLocalEnv();
  const pythonBin = options.pythonBin || process.env.EMBED_PYTHON_BIN || "python";
  const scriptPath = options.scriptPath || process.env.EMBED_SCRIPT_PATH || defaultScriptPath();
  const device = options.device || process.env.EMBED_DEVICE || "cuda";
  const qwenEmbeddingModelId = options.qwenEmbeddingModelId || process.env.QWEN_VL_EMBED_MODEL_ID || "Qwen/Qwen3-VL-Embedding-2B";
  const qwenRerankerModelId = options.qwenRerankerModelId || process.env.QWEN_VL_RERANK_MODEL_ID || "Qwen/Qwen3-VL-Reranker-2B";
  const batchSize = options.batchSize || Number(process.env.EMBED_BATCH_SIZE || "4");
  const attnImplementation = options.attnImplementation || process.env.EMBED_ATTN_IMPLEMENTATION || "flash_attention_2";
  const maxLength = options.maxLength || Number(process.env.EMBED_MAX_LENGTH || "8192");
  const imageMinPixels = options.imageMinPixels || Number(process.env.EMBED_IMAGE_MIN_PIXELS || `${4096}`);
  const imageMaxPixels = options.imageMaxPixels || Number(process.env.EMBED_IMAGE_MAX_PIXELS || `${1843200}`);
  const stderrWriter = options.stderrWriter || ((text: string) => process.stderr.write(text));
  const session =
    options.sessionFactory?.({
      pythonBin,
      scriptPath,
      stderrWriter,
    }) ||
    (options.runner
      ? createRunnerSession(options.runner, {
          pythonBin,
          scriptPath,
        })
      : createPersistentPythonSession({
          pythonBin,
          scriptPath,
          stderrWriter,
        }));
  let runtimeInfoPromise: Promise<PythonRuntimeInfo> | undefined;

  function buildStderrHandler(commandName: string) {
    let buffer = "";

    function handleLine(rawLine: string) {
      const line = rawLine.trim();
      if (commandName === "qwen-embed") {
        const match = /^qwen-embed\s+(\d+)\/(\d+)$/.exec(line);
        if (match) {
          options.onEmbeddingProgress?.({
            label: "qwen-embed",
            completed: Number(match[1]),
            total: Number(match[2]),
          });
          return;
        }
      }

      if (rawLine) {
        stderrWriter(rawLine.endsWith("\n") ? rawLine : `${rawLine}\n`);
      }
    }

    return (text: string) => {
      buffer += text;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        handleLine(line);
        newlineIndex = buffer.indexOf("\n");
      }
    };
  }

  async function invoke(commandName: string, payload: Record<string, unknown>) {
    return await session.invoke({
      commandName: commandName as PythonCommandName,
      payload,
      onStderr: buildStderrHandler(commandName),
    });
  }

  async function getRuntimeInfo() {
    runtimeInfoPromise ||= (async () =>
      parseRuntimeInfoResponse(
        await invoke("qwen-env", {
          device,
          attnImplementation,
          maxLength,
          minPixels: imageMinPixels,
          maxPixels: imageMaxPixels,
        })
      ))();
    return await runtimeInfoPromise;
  }

  async function ensureAttentionImplementationAvailable() {
    const runtimeInfo = await getRuntimeInfo();
    if (attnImplementation === "auto") {
      return;
    }

    if (attnImplementation === "flash_attention_2" && runtimeInfo.flashAttentionAvailable) {
      return;
    }

    if (attnImplementation === "flash_attention_2") {
      const location = runtimeInfo.python ? ` in ${runtimeInfo.python}` : "";
      throw new Error(
        `Requested flash_attention_2, but flash_attn is not installed or not available${location}. ` +
          `Install flash-attn in the embedding environment or rerun with --attn-implementation=auto|sdpa.`
      );
    }

    if (
      runtimeInfo.supportedAttentionImplementations &&
      !runtimeInfo.supportedAttentionImplementations.includes(attnImplementation) &&
      attnImplementation !== "eager"
    ) {
      const supported = runtimeInfo.supportedAttentionImplementations.join(", ");
      throw new Error(`Requested ${attnImplementation}, but supported backends are: ${supported}.`);
    }

    if (runtimeInfo.resolvedAttentionImplementation) {
      return;
    }

    const location = runtimeInfo.python ? ` in ${runtimeInfo.python}` : "";
    throw new Error(runtimeInfo.unsupportedAttentionReason || `Requested ${attnImplementation}, but it is not available${location}.`);
  }

  async function embedInProcess(inputs: MultimodalInput[]) {
    await ensureAttentionImplementationAvailable();
    return parseEmbeddingResponse(
      await invoke("qwen-embed", {
        inputs,
        batchSize: Math.max(1, batchSize),
        progressLabel: "qwen-embed",
        attnImplementation,
        maxLength,
        minPixels: imageMinPixels,
        maxPixels: imageMaxPixels,
        modelId: qwenEmbeddingModelId,
        embeddingSpace: MULTIMODAL_SHARED_SPACE,
        device,
      })
    );
  }

  return {
    async getRuntimeInfo() {
      return await getRuntimeInfo();
    },
    async embedTexts(inputs: string[], instruction?: string) {
      return embedInProcess(inputs.map((text) => ({ text, instruction })));
    },
    async embedImages(inputs: string[], instruction?: string) {
      return embedInProcess(inputs.map((image) => ({ image, instruction })));
    },
    async embedMixed(inputs: MultimodalInput[]) {
      return embedInProcess(inputs);
    },
    async rerank(request: RerankRequest) {
      await ensureAttentionImplementationAvailable();
      const response = parseRerankResponse(
        await invoke("qwen-rerank", {
          query: request.query,
          documents: request.documents,
          instruction: request.instruction,
          attnImplementation,
          maxLength,
          minPixels: imageMinPixels,
          maxPixels: imageMaxPixels,
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
    async dispose() {
      await session.dispose();
    },
  };
}
