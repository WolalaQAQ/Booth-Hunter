import { createPythonEmbeddingProvider, MULTIMODAL_SHARED_SPACE, PythonEmbeddingProviderOptions } from "../pipeline/embed/provider";
import { embedImageLocal } from "../pipeline/embed/images";
import { embedTextLocal } from "../pipeline/embed/text";
import { PipelineDatabase } from "../pipeline/sqlite/db";
import { FusionWeights } from "./fusion";
import { createSqliteLexicalSearcher } from "./indexes/lexical";
import { createQdrantClient, QdrantConfig } from "./indexes/qdrant/client";
import { createQdrantAssetSearcher, createQdrantItemSearcher, QdrantSearchClient } from "./indexes/qdrant/search";
import { createImageRetriever } from "./retrievers/image";
import { createTextRetriever } from "./retrievers/text";

export type RuntimeRetrieverOptions = {
  db: PipelineDatabase;
  qdrantConfig?: QdrantConfig;
  qdrantClient?: QdrantSearchClient;
  embeddingSpace?: string;
  embedMode?: "python" | "local";
  lexicalRecallLimit?: number;
  denseRecallLimit?: number;
  providerOptions?: PythonEmbeddingProviderOptions;
  fusionWeights?: FusionWeights;
};

function recallLimit(finalLimit?: number, override?: number): number {
  if (override && override > 0) {
    return override;
  }
  return Math.max(10, (finalLimit ?? 10) * 3);
}

function requireVector(vector: number[] | undefined, kind: string): number[] {
  if (!vector || vector.length === 0) {
    throw new Error(`Embedding provider returned no vector for ${kind} query.`);
  }
  return vector;
}

async function loadImageInput(imagePath: string): Promise<Buffer | string> {
  if (!/^https?:\/\//i.test(imagePath)) {
    return imagePath;
  }

  const response = await fetch(imagePath);
  if (!response.ok) {
    throw new Error(`Failed to fetch remote image for local embedding: ${imagePath} (${response.status})`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function getRuntimeDependencies(options: RuntimeRetrieverOptions) {
  const provider = options.embedMode === "local" ? undefined : createPythonEmbeddingProvider(options.providerOptions);
  const qdrantConfig = options.qdrantConfig;
  const qdrantClient = options.qdrantClient || (qdrantConfig ? createQdrantClient(qdrantConfig) : undefined);
  if (!qdrantClient || !qdrantConfig) {
    throw new Error("Runtime retrievers require either qdrantClient + qdrantConfig or a fully configured Qdrant environment.");
  }

  const lexicalSearcher = createSqliteLexicalSearcher(options.db);
  const itemDenseSearch = createQdrantItemSearcher({
    client: qdrantClient,
    collectionName: qdrantConfig.collections.items,
  });
  const assetDenseSearch = createQdrantAssetSearcher({
    client: qdrantClient,
    collectionName: qdrantConfig.collections.assets,
  });

  return {
    provider,
    lexicalSearcher,
    itemDenseSearch,
    assetDenseSearch,
  };
}

export function createRuntimeTextRetriever(options: RuntimeRetrieverOptions) {
  const dependencies = getRuntimeDependencies(options);

  return createTextRetriever({
    fusionWeights: options.fusionWeights,
    embedQuery: async (query) => {
      if (options.embedMode === "local") {
        return embedTextLocal(query.text);
      }
      const response = await dependencies.provider.embedTexts(
        [query.text],
        "Retrieve relevant BOOTH catalog items for the user query."
      );
      return requireVector(response.vectors[0], "text");
    },
    denseSearch: (vector, query) =>
      dependencies.itemDenseSearch(vector, {
        ...query,
        limit: recallLimit(query.limit, options.denseRecallLimit),
      }),
    lexicalSearch: (text, query) =>
      Promise.resolve(
        dependencies.lexicalSearcher.search({
          text,
          limit: recallLimit(query.limit, options.lexicalRecallLimit),
        })
      ),
  });
}

export function createRuntimeImageRetriever(options: RuntimeRetrieverOptions) {
  const dependencies = getRuntimeDependencies(options);

  return createImageRetriever({
    fusionWeights: options.fusionWeights,
    embedQuery: async (query) => {
      if (options.embedMode === "local") {
        return embedImageLocal(await loadImageInput(query.imagePath));
      }
      const response = await dependencies.provider.embedImages(
        [query.imagePath],
        "Retrieve visually similar BOOTH product images for the user reference image."
      );
      return requireVector(response.vectors[0], "image");
    },
    denseSearch: (vector, query) =>
      dependencies.assetDenseSearch(vector, {
        ...query,
        limit: recallLimit(query.limit, options.denseRecallLimit),
      }),
    lexicalSearch: (text, query) =>
      Promise.resolve(
        dependencies.lexicalSearcher.search({
          text,
          limit: recallLimit(query.limit, options.lexicalRecallLimit),
        })
      ),
  });
}

export { MULTIMODAL_SHARED_SPACE };
