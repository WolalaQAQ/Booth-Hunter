import fs from "node:fs";
import path from "node:path";

import {
  getLatestImageEmbeddingModel,
  getLatestItemTextEmbeddingModel,
  openPipelineDatabase,
} from "../../src/lib/pipeline/sqlite/db";
import { Goal12Benchmark, evaluateGoal12Benchmark } from "../../src/lib/search/evaluate";
import { getQdrantConfig } from "../../src/lib/search/indexes/qdrant/client";
import { createRuntimeImageRetriever, createRuntimeTextRetriever, MULTIMODAL_SHARED_SPACE } from "../../src/lib/search/runtime";
import { buildGoal12BenchmarkScaffold } from "./goal12-benchmark-lib";

function argument(name: string, fallback?: string): string | undefined {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
}

function booleanFlag(name: string): boolean {
  return process.argv.includes(`--${name}`) || argument(name, "false") === "true";
}

function ensureParentDirectory(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function parseKs(input?: string): number[] {
  return (input || "1,3,5,10")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function loadBenchmark(benchmarkPath: string): Goal12Benchmark | undefined {
  if (!fs.existsSync(benchmarkPath)) {
    return undefined;
  }
  return JSON.parse(fs.readFileSync(benchmarkPath, "utf8")) as Goal12Benchmark;
}

async function main() {
  const dbPath = argument("db", "data/raw/booth-pipeline.sqlite")!;
  const benchmarkPath = argument("benchmark", "data/eval/goal12-benchmark.json")!;
  const outputPath = argument("output", "data/eval/goal12-eval.json")!;
  const embeddingSpace = argument("embedding-space", MULTIMODAL_SHARED_SPACE)!;
  const ks = parseKs(argument("ks"));
  const rerank = booleanFlag("rerank");
  const rerankTopK = Number(argument("rerank-top-k", "10") || "10");
  const db = openPipelineDatabase(dbPath);

  try {
    const requestedEmbedMode = argument("embed-mode") as "python" | "local" | undefined;
    const textEmbedMode =
      requestedEmbedMode || (getLatestItemTextEmbeddingModel(db)?.startsWith("local-hash") ? "local" : "python");
    const imageEmbedMode =
      requestedEmbedMode || (getLatestImageEmbeddingModel(db)?.startsWith("local-pixel") ? "local" : "python");
    const qdrantConfig = getQdrantConfig();
    const textRetriever = createRuntimeTextRetriever({
      db,
      qdrantConfig,
      embedMode: textEmbedMode,
      enableReranker: rerank,
      rerankTopK,
    });
    const imageRetriever = createRuntimeImageRetriever({
      db,
      qdrantConfig,
      embedMode: imageEmbedMode,
      enableReranker: rerank,
      rerankTopK,
    });
    const benchmark =
      loadBenchmark(benchmarkPath) ||
      buildGoal12BenchmarkScaffold({
        db,
        dbPath,
        embeddingSpace,
        textCases: 5,
        imageCases: 5,
      });

    const evaluation = await evaluateGoal12Benchmark(
      benchmark,
      async (benchmarkCase) => {
        if (benchmarkCase.kind === "text") {
          return textRetriever.search(benchmarkCase.query);
        }
        return imageRetriever.search(benchmarkCase.query);
      },
      { ks }
    );

    const report = {
      ...evaluation,
      dataset: {
        dbPath,
        benchmarkPath: fs.existsSync(benchmarkPath) ? benchmarkPath : undefined,
        textEmbedMode,
        imageEmbedMode,
        rerank,
        rerankTopK,
      },
    };

    ensureParentDirectory(outputPath);
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
