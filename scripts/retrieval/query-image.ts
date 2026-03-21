import { getLatestImageEmbeddingModel, listAllItemImages, openPipelineDatabase } from "../../src/lib/pipeline/sqlite/db";
import { getQdrantConfig } from "../../src/lib/search/indexes/qdrant/client";
import { createRuntimeImageRetriever } from "../../src/lib/search/runtime";
import { ensureRuntimeQdrantReady } from "./runtime-qdrant";

function argument(name: string, fallback?: string): string | undefined {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
}

function booleanFlag(name: string): boolean {
  return process.argv.includes(`--${name}`) || argument(name, "false") === "true";
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
  const rerank = booleanFlag("rerank");
  const rerankTopK = Number(argument("rerank-top-k", String(limit)) || String(limit));
  const db = openPipelineDatabase(dbPath);

  try {
    const qdrantConfig = getQdrantConfig();
    await ensureRuntimeQdrantReady({
      db,
      dbPath,
      qdrantConfig,
    });
    const embedMode =
      (argument("embed-mode") as "python" | "local" | undefined) ||
      (getLatestImageEmbeddingModel(db)?.startsWith("local-pixel") ? "local" : "python");
    const retriever = createRuntimeImageRetriever({
      db,
      qdrantConfig,
      embedMode,
      enableReranker: rerank,
      rerankTopK,
    });
    const result = await retriever.search({ imagePath, text, limit });

    console.log(
      JSON.stringify(
        {
          dbPath,
          embedMode,
          rerank,
          rerankTopK,
          query: result.query,
          candidates: result.candidates.map((candidate, index) => ({
            rank: index + 1,
            itemId: candidate.itemId,
            title: candidate.title,
            itemUrl: candidate.itemUrl,
            score: Number(candidate.score.toFixed(4)),
            retrievalScore:
              typeof candidate.metadata?.retrievalScore === "number"
                ? Number(candidate.metadata.retrievalScore.toFixed(4))
                : undefined,
            rerankScore:
              typeof candidate.metadata?.rerankScore === "number"
                ? Number(candidate.metadata.rerankScore.toFixed(4))
                : undefined,
            rerankModel: typeof candidate.metadata?.rerankModel === "string" ? candidate.metadata.rerankModel : undefined,
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
