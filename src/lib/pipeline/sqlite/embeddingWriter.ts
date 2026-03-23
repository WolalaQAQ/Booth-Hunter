import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export type TextEmbeddingWriteRecord = {
  itemId: string;
  embeddingSpace: string;
  model: string;
  vectorJson: string;
  updatedAt: string;
};

export type ImageEmbeddingWriteRecord = {
  imageKey: string;
  embeddingSpace: string;
  model: string;
  vectorJson: string;
  updatedAt: string;
};

export type EmbeddingWriterBatchResult = {
  savedCount: number;
  saveMs: number;
};

export type EmbeddingWriter = {
  saveTextBatch(records: TextEmbeddingWriteRecord[]): Promise<EmbeddingWriterBatchResult>;
  saveImageBatch(records: ImageEmbeddingWriteRecord[]): Promise<EmbeddingWriterBatchResult>;
  dispose(): Promise<void>;
};

function workerScriptPath() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "embeddingWriter.worker.ts");
}

export function createEmbeddingWriter(options: { dbPath: string }): EmbeddingWriter {
  const child = spawn(process.execPath, ["--import", "tsx/esm", workerScriptPath(), options.dbPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let disposed = false;
  let nextId = 0;
  let stdoutBuffer = Buffer.alloc(0);
  let expectedBytes: number | undefined;
  let stderrBuffer = "";
  const pending = new Map<
    number,
    {
      resolve: (result: EmbeddingWriterBatchResult) => void;
      reject: (error: Error) => void;
    }
  >();

  function rejectPending(error: Error) {
    for (const [id, entry] of pending.entries()) {
      pending.delete(id);
      entry.reject(error);
    }
  }

  function handleMessage(message: { id: number; ok: boolean; savedCount: number; saveMs: number; error?: string }) {
    const entry = pending.get(message.id);
    if (!entry) {
      return;
    }
    pending.delete(message.id);
    if (message.ok) {
      entry.resolve({
        savedCount: message.savedCount,
        saveMs: message.saveMs,
      });
      return;
    }
    entry.reject(new Error(message.error || "Embedding writer failed"));
  }

  function consumeStdout() {
    while (true) {
      if (expectedBytes === undefined) {
        const newlineIndex = stdoutBuffer.indexOf(0x0a);
        if (newlineIndex < 0) {
          return;
        }
        const header = stdoutBuffer.slice(0, newlineIndex).toString("utf8").trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (!header) {
          continue;
        }
        expectedBytes = Number(header);
      }

      if (expectedBytes === undefined || stdoutBuffer.length < expectedBytes) {
        return;
      }

      const raw = stdoutBuffer.slice(0, expectedBytes).toString("utf8");
      stdoutBuffer = stdoutBuffer.slice(expectedBytes);
      expectedBytes = undefined;
      handleMessage(JSON.parse(raw) as { id: number; ok: boolean; savedCount: number; saveMs: number; error?: string });
    }
  }

  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    consumeStdout();
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderrBuffer += chunk.toString();
  });

  child.on("error", (error) => {
    rejectPending(error instanceof Error ? error : new Error(String(error)));
  });

  child.on("close", (code, signal) => {
    if (disposed && pending.size === 0) {
      return;
    }
    rejectPending(
      new Error(
        stderrBuffer ||
          `Embedding writer process exited unexpectedly (code=${code ?? "null"}, signal=${signal || "none"}).`
      )
    );
  });

  function invoke(
    message:
      | { type: "saveTextBatch"; records: TextEmbeddingWriteRecord[] }
      | { type: "saveImageBatch"; records: ImageEmbeddingWriteRecord[] }
      | { type: "dispose" }
  ) {
    return new Promise<EmbeddingWriterBatchResult>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      const raw = Buffer.from(JSON.stringify({ id, ...message }), "utf8");
      child.stdin.write(Buffer.concat([Buffer.from(`${raw.length}\n`, "utf8"), raw]));
    });
  }

  return {
    async saveTextBatch(records) {
      return await invoke({ type: "saveTextBatch", records });
    },
    async saveImageBatch(records) {
      return await invoke({ type: "saveImageBatch", records });
    },
    async dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      try {
        await invoke({ type: "dispose" });
      } finally {
        child.kill();
      }
    },
  };
}
