import { getLatestImageEmbeddingModel, listAllItemImages, openPipelineDatabase } from "../../src/lib/pipeline/sqlite/db";
import { getQdrantConfig } from "../../src/lib/search/indexes/qdrant/client";
import { createRuntimeImageRetriever } from "../../src/lib/search/runtime";

function argument(name: string, fallback?: string): string | undefined {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
}

function pickDefaultImage(dbPath: string): string | undefined {
  const db = openPipelineDatabase(dbPath);
  try {
    return listAllItemImages(db)[0]?.sourceUrl;
  } finally {
    db.close();
  }
}

async function main() {
  const dbPath = argument("db", "data/raw/booth-pipeline.sqlite")!;
  const imagePath = argument("image") || pickDefaultImage(dbPath);
  if (!imagePath) {
    throw new Error("No query image provided and no indexed source image was available in the SQLite database.");
  }

  const text = argument("text");
  const limit = Number(argument("limit", "10") || "10");
  const db = openPipelineDatabase(dbPath);

  try {
    const embedMode =
      (argument("embed-mode") as "python" | "local" | undefined) ||
      (getLatestImageEmbeddingModel(db)?.startsWith("local-pixel") ? "local" : "python");
    const retriever = createRuntimeImageRetriever({
      db,
      qdrantConfig: getQdrantConfig(),
      embedMode,
    });
    const result = await retriever.search({ imagePath, text, limit });

    console.log(
      JSON.stringify(
        {
          dbPath,
          embedMode,
          query: result.query,
          candidates: result.candidates.map((candidate, index) => ({
            rank: index + 1,
            itemId: candidate.itemId,
            title: candidate.title,
            itemUrl: candidate.itemUrl,
            score: Number(candidate.score.toFixed(4)),
            explanation: candidate.explanation,
            evidence: candidate.evidence.map((evidence) => ({
              source: evidence.source,
              assetId: evidence.assetId,
              score: Number(evidence.score.toFixed(4)),
              matchedFields: evidence.matchedFields,
            })),
          })),
        },
        null,
        2
      )
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
