import { QdrantClient } from "@qdrant/js-client-rest";

export type QdrantEnv = Record<string, string | undefined>;

export type QdrantConfig = {
  url: string;
  apiKey?: string;
  collections: {
    assets: string;
    items: string;
  };
};

type QdrantClientConstructor<TClient> = new (options: { url: string; apiKey?: string }) => TClient;

function required(name: keyof QdrantEnv, env: QdrantEnv): string | undefined {
  const value = env[name];
  return value?.trim() ? value.trim() : undefined;
}

export function getQdrantConfig(env: QdrantEnv = process.env): QdrantConfig {
  const missing = ["QDRANT_URL", "QDRANT_COLLECTION_ASSETS", "QDRANT_COLLECTION_ITEMS"].filter(
    (name) => !required(name, env)
  );

  if (missing.length > 0) {
    throw new Error(`Missing required Qdrant environment variables: ${missing.join(", ")}`);
  }

  return {
    url: required("QDRANT_URL", env)!,
    apiKey: required("QDRANT_API_KEY", env),
    collections: {
      assets: required("QDRANT_COLLECTION_ASSETS", env)!,
      items: required("QDRANT_COLLECTION_ITEMS", env)!,
    },
  };
}

export function createQdrantClient<TClient = QdrantClient>(
  config: QdrantConfig = getQdrantConfig(),
  Client: QdrantClientConstructor<TClient> = QdrantClient as unknown as QdrantClientConstructor<TClient>
): TClient {
  return new Client({
    url: config.url,
    apiKey: config.apiKey,
  });
}
