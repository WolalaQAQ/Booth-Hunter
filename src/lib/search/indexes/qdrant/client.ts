import { QdrantClient } from "@qdrant/js-client-rest";

import { loadLocalEnv } from "../../../env/local";

export type QdrantEnv = Record<string, string | undefined>;

export type QdrantConfig = {
  url: string;
  apiKey?: string;
  collections: {
    assets: string;
    items: string;
  };
};

const LOCAL_QDRANT_DEFAULTS = {
  url: "http://127.0.0.1:6333",
  apiKey: undefined,
  collections: {
    assets: "booth_assets",
    items: "booth_items",
  },
} as const;

type QdrantClientConstructor<TClient> = new (options: { url: string; apiKey?: string }) => TClient;

function required(name: keyof QdrantEnv, env: QdrantEnv): string | undefined {
  const value = env[name];
  return value?.trim() ? value.trim() : undefined;
}

export function getQdrantConfig(env: QdrantEnv = process.env): QdrantConfig {
  if (env === process.env) {
    loadLocalEnv();
  }
  if (
    env === process.env &&
    !required("QDRANT_URL", env) &&
    !required("QDRANT_COLLECTION_ASSETS", env) &&
    !required("QDRANT_COLLECTION_ITEMS", env)
  ) {
    return {
      url: LOCAL_QDRANT_DEFAULTS.url,
      apiKey: LOCAL_QDRANT_DEFAULTS.apiKey,
      collections: {
        assets: LOCAL_QDRANT_DEFAULTS.collections.assets,
        items: LOCAL_QDRANT_DEFAULTS.collections.items,
      },
    };
  }
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
