import { performance } from "node:perf_hooks";

import { openPipelineDatabase, saveImageEmbedding, saveItemTextEmbedding } from "./db";

type WorkerRequest =
  | {
      id: number;
      type: "saveTextBatch";
      records: Array<{
        itemId: string;
        embeddingSpace: string;
        model: string;
        vectorJson: string;
        updatedAt: string;
      }>;
    }
  | {
      id: number;
      type: "saveImageBatch";
      records: Array<{
        imageKey: string;
        embeddingSpace: string;
        model: string;
        vectorJson: string;
        updatedAt: string;
      }>;
    }
  | {
      id: number;
      type: "dispose";
    };

function writeMessage(payload: object) {
  const raw = Buffer.from(JSON.stringify(payload), "utf8");
  process.stdout.write(Buffer.concat([Buffer.from(`${raw.length}\n`, "utf8"), raw]));
}

async function main() {
  const dbPath = process.argv[2];
  if (!dbPath) {
    throw new Error("Missing embedding writer dbPath argument.");
  }

  const db = openPipelineDatabase(dbPath);
  const saveTextBatchTx = db.transaction(
    (
      records: Array<{
        itemId: string;
        embeddingSpace: string;
        model: string;
        vectorJson: string;
        updatedAt: string;
      }>
    ) => {
      for (const record of records) {
        saveItemTextEmbedding(db, record);
      }
    }
  );
  const saveImageBatchTx = db.transaction(
    (
      records: Array<{
        imageKey: string;
        embeddingSpace: string;
        model: string;
        vectorJson: string;
        updatedAt: string;
      }>
    ) => {
      for (const record of records) {
        saveImageEmbedding(db, record);
      }
    }
  );

  let buffer = Buffer.alloc(0);
  let expectedBytes: number | undefined;

  function consume() {
    while (true) {
      if (expectedBytes === undefined) {
        const newlineIndex = buffer.indexOf(0x0a);
        if (newlineIndex < 0) {
          return;
        }
        const header = buffer.slice(0, newlineIndex).toString("utf8").trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!header) {
          continue;
        }
        expectedBytes = Number(header);
      }

      if (expectedBytes === undefined || buffer.length < expectedBytes) {
        return;
      }

      const rawRequest = buffer.slice(0, expectedBytes).toString("utf8");
      buffer = buffer.slice(expectedBytes);
      expectedBytes = undefined;

      const request = JSON.parse(rawRequest) as WorkerRequest;
      try {
        if (request.type === "dispose") {
          db.close();
          writeMessage({
            id: request.id,
            ok: true,
            savedCount: 0,
            saveMs: 0,
          });
          process.exit(0);
        }

        const startedAt = performance.now();
        if (request.type === "saveTextBatch") {
          saveTextBatchTx(request.records);
        } else {
          saveImageBatchTx(request.records);
        }
        writeMessage({
          id: request.id,
          ok: true,
          savedCount: request.records.length,
          saveMs: performance.now() - startedAt,
        });
      } catch (error) {
        writeMessage({
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    consume();
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

