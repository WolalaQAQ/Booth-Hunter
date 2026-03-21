import {
  createPythonEmbeddingProvider,
  MULTIMODAL_SHARED_SPACE,
  PythonEmbeddingProviderOptions,
} from "../pipeline/embed/provider";
import { embedImageLocal } from "../pipeline/embed/images";
import { embedTextLocal } from "../pipeline/embed/text";
import { getLexicalDocument, listItemImagesForItem, PipelineDatabase } from "../pipeline/sqlite/db";
import { FusionWeights } from "./fusion";
import { createSqliteLexicalSearcher } from "./indexes/lexical";
import { createQdrantClient, QdrantConfig } from "./indexes/qdrant/client";
import { createQdrantAssetSearcher, createQdrantItemSearcher, QdrantSearchClient } from "./indexes/qdrant/search";
import { createImageRetriever } from "./retrievers/image";
import { createTextRetriever } from "./retrievers/text";
import { ImageSearchQuery, SearchCandidate, SearchQuery, TextSearchQuery } from "./types";

export type RuntimeRetrieverOptions = {
  db: PipelineDatabase;
  qdrantConfig?: QdrantConfig;
  qdrantClient?: QdrantSearchClient;
  embeddingSpace?: string;
  embedMode?: "python" | "local";
  enableReranker?: boolean;
  rerankTopK?: number;
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

function rerankLimit(finalLimit?: number, override?: number): number {
  if (override && override > 0) {
    return override;
  }
  return finalLimit ?? 10;
}

function collectTextSegments(values: Array<string | undefined>): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");
}

function buildRerankDocumentText(db: PipelineDatabase, candidate: SearchCandidate): string {
  const lexical = getLexicalDocument(db, candidate.itemId);
  if (lexical) {
    const lines = [
      lexical.title ? `Title: ${lexical.title}` : undefined,
      lexical.description ? `Description: ${lexical.description}` : undefined,
      lexical.tags ? `Tags: ${lexical.tags}` : undefined,
      lexical.shopName ? `Shop: ${lexical.shopName}` : undefined,
      collectTextSegments([lexical.categoryName, lexical.parentCategoryName])
        ? `Category: ${collectTextSegments([lexical.categoryName, lexical.parentCategoryName])}`
        : undefined,
      lexical.priceText ? `Price: ${lexical.priceText}` : undefined,
      lexical.parts ? `Parts: ${lexical.parts}` : undefined,
      lexical.styles ? `Styles: ${lexical.styles}` : undefined,
      lexical.compatibilityHints ? `Compatibility: ${lexical.compatibilityHints}` : undefined,
      lexical.keywordDigest ? `Keywords: ${lexical.keywordDigest}` : undefined,
      lexical.captionText ? `Captions: ${lexical.captionText}` : undefined,
      lexical.ocrText ? `OCR: ${lexical.ocrText}` : undefined,
    ];
    return lines.filter(Boolean).join("\n");
  }

  const sourceUrl = candidate.evidence
    .map((entry) => entry.metadata?.sourceUrl)
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const styles = candidate.evidence
    .flatMap((entry) => (Array.isArray(entry.metadata?.styles) ? entry.metadata.styles : []))
    .map((value) => String(value));
  const parts = candidate.evidence
    .flatMap((entry) => (Array.isArray(entry.metadata?.parts) ? entry.metadata.parts : []))
    .map((value) => String(value));

  return [
    candidate.title ? `Title: ${candidate.title}` : undefined,
    candidate.itemUrl ? `Item URL: ${candidate.itemUrl}` : undefined,
    sourceUrl ? `Image URL: ${sourceUrl}` : undefined,
    styles.length > 0 ? `Styles: ${Array.from(new Set(styles)).join(", ")}` : undefined,
    parts.length > 0 ? `Parts: ${Array.from(new Set(parts)).join(", ")}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildRerankDocumentImage(db: PipelineDatabase, candidate: SearchCandidate): string | undefined {
  for (const entry of candidate.evidence) {
    if (typeof entry.metadata?.sourceUrl === "string" && entry.metadata.sourceUrl.trim()) {
      return entry.metadata.sourceUrl;
    }
  }

  return listItemImagesForItem(db, candidate.itemId).find((image) => Boolean(image.sourceUrl.trim()))?.sourceUrl;
}

function buildRerankInstruction(query: SearchQuery): string {
  if (query.kind === "text") {
    return "Judge how well each BOOTH candidate item matches the retrieval query.";
  }
  return "Judge how well each BOOTH candidate item matches the reference image and optional text hint.";
}

async function rerankRuntimeCandidates(
  query: TextSearchQuery | ImageSearchQuery,
  candidates: SearchCandidate[],
  options: RuntimeRetrieverOptions,
  provider: ReturnType<typeof createPythonEmbeddingProvider>
): Promise<SearchCandidate[]> {
  if (!options.enableReranker || candidates.length === 0) {
    return candidates;
  }

  const headSize = Math.min(candidates.length, rerankLimit(query.limit, options.rerankTopK));
  const head = candidates.slice(0, headSize);
  const tail = candidates.slice(headSize);
  const documents = head.map((candidate) => ({
    text: buildRerankDocumentText(options.db, candidate),
    image: buildRerankDocumentImage(options.db, candidate),
  }));

  if (documents.every((document) => !document.text && !document.image)) {
    return candidates;
  }

  const rerankResult = await provider.rerank({
    query:
      query.kind === "text"
        ? { text: query.text }
        : {
            text: query.text,
            image: query.imagePath,
          },
    documents,
    instruction: buildRerankInstruction(query),
  });

  const reranked = head
    .map((candidate, index) => {
      const rerankScore = rerankResult.scores[index] ?? Number.NEGATIVE_INFINITY;
      const retrievalScore = candidate.score;
      return {
        ...candidate,
        score: rerankScore,
        metadata: {
          ...(candidate.metadata || {}),
          retrievalScore,
          rerankScore,
          rerankModel: rerankResult.model,
        },
        explanation: candidate.explanation
          ? `${candidate.explanation} Multimodal reranker score ${rerankScore.toFixed(3)}.`
          : `Multimodal reranker score ${rerankScore.toFixed(3)}.`,
      } satisfies SearchCandidate;
    })
    .sort((left, right) => {
      const rerankDelta = Number(right.metadata?.rerankScore || right.score) - Number(left.metadata?.rerankScore || left.score);
      if (rerankDelta !== 0) {
        return rerankDelta;
      }
      return Number(right.metadata?.retrievalScore || 0) - Number(left.metadata?.retrievalScore || 0);
    });

  return [...reranked, ...tail];
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
  const provider =
    options.embedMode === "local" && !options.enableReranker
      ? undefined
      : createPythonEmbeddingProvider(options.providerOptions);
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
    rerankCandidates: dependencies.provider
      ? (candidates, query) => rerankRuntimeCandidates(query, candidates, options, dependencies.provider)
      : undefined,
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
    rerankCandidates: dependencies.provider
      ? (candidates, query) => rerankRuntimeCandidates(query, candidates, options, dependencies.provider)
      : undefined,
  });
}

export { MULTIMODAL_SHARED_SPACE };
