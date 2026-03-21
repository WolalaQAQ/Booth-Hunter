import fs from "node:fs";
import path from "node:path";

import { openPipelineDatabase } from "../../src/lib/pipeline/sqlite/db";
import { MULTIMODAL_SHARED_SPACE } from "../../src/lib/search/runtime";
import { buildGoal12BenchmarkScaffold } from "./goal12-benchmark-lib";

function argument(name: string, fallback?: string): string | undefined {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
}

function ensureParentDirectory(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function main() {
  const dbPath = argument("db", "data/raw/booth-pipeline.sqlite")!;
  const outputPath = argument("output", "data/eval/goal12-benchmark.json")!;
  const textCases = Number(argument("text-cases", "5") || "5");
  const imageCases = Number(argument("image-cases", "5") || "5");
  const embeddingSpace = argument("embedding-space", MULTIMODAL_SHARED_SPACE)!;
  const db = openPipelineDatabase(dbPath);

  try {
    const benchmark = buildGoal12BenchmarkScaffold({
      db,
      dbPath,
      embeddingSpace,
      textCases,
      imageCases,
    });

    ensureParentDirectory(outputPath);
    fs.writeFileSync(outputPath, JSON.stringify(benchmark, null, 2));
    console.log(JSON.stringify({ outputPath, cases: benchmark.cases.length, dbPath, embeddingSpace }, null, 2));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
