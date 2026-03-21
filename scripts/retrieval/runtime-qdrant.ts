import fs from "node:fs";
import path from "node:path";

import { PipelineDatabase } from "../../src/lib/pipeline/sqlite/db";
import { createQdrantClient, QdrantConfig } from "../../src/lib/search/indexes/qdrant/client";
import {
  ensureQdrantAvailable,
  getDefaultQdrantRuntimeDir,
  isManagedLocalQdrantUrl,
} from "../../src/lib/search/indexes/qdrant/ensure";
import {
  ensureQdrantCollectionsSeededFromDatabase,
  EnsureQdrantCollectionsSeededResult,
  replaceQdrantCollectionsFromDatabase,
} from "../../src/lib/search/indexes/qdrant/prepare";
import { QdrantIndexerClient } from "../../src/lib/search/indexes/qdrant/indexer";
import { MULTIMODAL_SHARED_SPACE } from "../../src/lib/search/runtime";

type LocalSeedManifest = {
  url: string;
  dbPath: string;
  dbSize: number;
  dbMtimeMs: number;
  embeddingSpace: string;
  collections: {
    items: string;
    assets: string;
  };
};

function getLocalSeedManifestPath() {
  return path.join(getDefaultQdrantRuntimeDir(process.cwd()), "seed-manifest.json");
}

function readLocalSeedManifest(manifestPath: string): LocalSeedManifest | undefined {
  if (!fs.existsSync(manifestPath)) {
    return undefined;
  }

  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as LocalSeedManifest;
}

function buildLocalSeedManifest(options: {
  dbPath: string;
  embeddingSpace: string;
  qdrantConfig: QdrantConfig;
}): LocalSeedManifest {
  const absoluteDbPath = path.resolve(options.dbPath);
  const stat = fs.statSync(absoluteDbPath);

  return {
    url: options.qdrantConfig.url,
    dbPath: absoluteDbPath,
    dbSize: stat.size,
    dbMtimeMs: stat.mtimeMs,
    embeddingSpace: options.embeddingSpace,
    collections: {
      items: options.qdrantConfig.collections.items,
      assets: options.qdrantConfig.collections.assets,
    },
  };
}

function manifestMatches(left: LocalSeedManifest | undefined, right: LocalSeedManifest): boolean {
  if (!left) {
    return false;
  }

  return (
    left.url === right.url &&
    left.dbPath === right.dbPath &&
    left.dbSize === right.dbSize &&
    left.dbMtimeMs === right.dbMtimeMs &&
    left.embeddingSpace === right.embeddingSpace &&
    left.collections.items === right.collections.items &&
    left.collections.assets === right.collections.assets
  );
}

function writeLocalSeedManifest(manifestPath: string, manifest: LocalSeedManifest) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

export async function ensureRuntimeQdrantReady(options: {
  db: PipelineDatabase;
  dbPath: string;
  qdrantConfig: QdrantConfig;
  embeddingSpace?: string;
}): Promise<EnsureQdrantCollectionsSeededResult> {
  await ensureQdrantAvailable(options.qdrantConfig);
  const client = createQdrantClient(options.qdrantConfig) as unknown as QdrantIndexerClient;
  const embeddingSpace = options.embeddingSpace || MULTIMODAL_SHARED_SPACE;

  if (isManagedLocalQdrantUrl(options.qdrantConfig.url)) {
    const manifestPath = getLocalSeedManifestPath();
    const expectedManifest = buildLocalSeedManifest({
      dbPath: options.dbPath,
      embeddingSpace,
      qdrantConfig: options.qdrantConfig,
    });
    const currentManifest = readLocalSeedManifest(manifestPath);

    if (!manifestMatches(currentManifest, expectedManifest)) {
      const result = await replaceQdrantCollectionsFromDatabase({
        client,
        collections: options.qdrantConfig.collections,
        db: options.db,
        embeddingSpace,
      });
      writeLocalSeedManifest(manifestPath, expectedManifest);
      return result;
    }
  }

  const result = await ensureQdrantCollectionsSeededFromDatabase({
    client,
    collections: options.qdrantConfig.collections,
    db: options.db,
    embeddingSpace,
  });
  if (isManagedLocalQdrantUrl(options.qdrantConfig.url)) {
    const manifestPath = getLocalSeedManifestPath();
    const expectedManifest = buildLocalSeedManifest({
      dbPath: options.dbPath,
      embeddingSpace,
      qdrantConfig: options.qdrantConfig,
    });
    writeLocalSeedManifest(manifestPath, expectedManifest);
  }
  return result;
}
