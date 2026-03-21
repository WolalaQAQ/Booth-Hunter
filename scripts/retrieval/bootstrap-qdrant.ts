import fs from "node:fs";

import { MULTIMODAL_SHARED_SPACE } from "../../src/lib/pipeline/embed/provider";
import { listNormalizedItemIds, openPipelineDatabase } from "../../src/lib/pipeline/sqlite/db";
import { createQdrantClient, getQdrantConfig } from "../../src/lib/search/indexes/qdrant/client";
import { createQdrantIndexer, QdrantIndexerClient } from "../../src/lib/search/indexes/qdrant/indexer";
import { projectAssetPoints, projectItemPoint } from "../../src/lib/search/indexes/qdrant/projectors";

function argument(name: string): string | undefined {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : undefined;
}

function pickDefaultDbPath(): string | undefined {
  const candidates = ["data/raw/smoke.sqlite", "data/raw/booth-pipeline.sqlite"];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function inferVectorSizes(dbPath: string, embeddingSpace: string) {
  const db = openPipelineDatabase(dbPath);
  try {
    let itemVectorSize = 0;
    let assetVectorSize = 0;

    for (const itemId of listNormalizedItemIds(db)) {
      if (!itemVectorSize) {
        const itemPoint = projectItemPoint(db, itemId, embeddingSpace);
        itemVectorSize = itemPoint?.vector.item_text.length || 0;
      }

      if (!assetVectorSize) {
        const assetPoint = projectAssetPoints(db, itemId, embeddingSpace)[0];
        assetVectorSize = assetPoint?.vector.asset_image.length || 0;
      }

      if (itemVectorSize > 0 && assetVectorSize > 0) {
        break;
      }
    }

    return { itemVectorSize, assetVectorSize };
  } finally {
    db.close();
  }
}

async function main() {
  const config = getQdrantConfig();
  const client = createQdrantClient(config) as unknown as QdrantIndexerClient;
  const indexer = createQdrantIndexer({
    client,
    collections: config.collections,
  });

  const embeddingSpace = argument("embedding-space") || MULTIMODAL_SHARED_SPACE;
  const dbPath = argument("db") || pickDefaultDbPath();
  if (!dbPath) {
    throw new Error("Unable to infer vector sizes: pass --db=<sqlite path> or create data/raw/smoke.sqlite / data/raw/booth-pipeline.sqlite first.");
  }

  const { itemVectorSize, assetVectorSize } = inferVectorSizes(dbPath, embeddingSpace);
  if (itemVectorSize <= 0 || assetVectorSize <= 0) {
    throw new Error(`Unable to infer vector sizes from ${dbPath}. itemVectorSize=${itemVectorSize}, assetVectorSize=${assetVectorSize}`);
  }

  await indexer.ensureCollections({ itemVectorSize, assetVectorSize });

  const itemsExists = await client.collectionExists(config.collections.items);
  const assetsExists = await client.collectionExists(config.collections.assets);

  console.log(
    JSON.stringify(
      {
        collections: config.collections,
        ensured: true,
        dbPath,
        embeddingSpace,
        itemVectorSize,
        assetVectorSize,
        exists: {
          items: typeof itemsExists === "boolean" ? itemsExists : itemsExists.exists,
          assets: typeof assetsExists === "boolean" ? assetsExists : assetsExists.exists,
        },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
