export type AppwriteClientConfig = {
  endpoint: string;
  projectId: string;
  databaseId: string;
  chatsCollectionId: string;
  catalogCollectionId: string;
};

export type AppwriteServerConfig = AppwriteClientConfig & {
  apiKey: string;
};

function requireValue(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

function withDefaults(config: Omit<AppwriteClientConfig, 'chatsCollectionId' | 'catalogCollectionId'> & {
  chatsCollectionId?: string;
  catalogCollectionId?: string;
}): AppwriteClientConfig {
  return {
    ...config,
    chatsCollectionId: config.chatsCollectionId || 'booth_hunter_chats',
    catalogCollectionId: config.catalogCollectionId || 'booth_hunter_catalog',
  };
}

export function getBrowserAppwriteConfig(env: Record<string, string | undefined>): AppwriteClientConfig {
  return withDefaults({
    endpoint: requireValue(env, 'VITE_APPWRITE_ENDPOINT'),
    projectId: requireValue(env, 'VITE_APPWRITE_PROJECT_ID'),
    databaseId: requireValue(env, 'VITE_APPWRITE_DATABASE_ID'),
    chatsCollectionId: env.VITE_APPWRITE_CHATS_COLLECTION_ID,
    catalogCollectionId: env.VITE_APPWRITE_CATALOG_COLLECTION_ID,
  });
}

export function getServerAppwriteConfig(env: Record<string, string | undefined>): AppwriteServerConfig {
  return {
    ...withDefaults({
      endpoint: requireValue(env, 'APPWRITE_ENDPOINT'),
      projectId: requireValue(env, 'APPWRITE_PROJECT_ID'),
      databaseId: requireValue(env, 'APPWRITE_DATABASE_ID'),
      chatsCollectionId: env.APPWRITE_CHATS_COLLECTION_ID,
      catalogCollectionId: env.APPWRITE_CATALOG_COLLECTION_ID,
    }),
    apiKey: requireValue(env, 'APPWRITE_API_KEY'),
  };
}
