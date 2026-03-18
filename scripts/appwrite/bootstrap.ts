import { Client, Databases } from 'node-appwrite';

import { getServerAppwriteConfig } from '../../src/lib/appwrite/config';

async function ignoreConflict<T>(task: () => Promise<T>): Promise<T | undefined> {
  try {
    return await task();
  } catch (error: any) {
    if (error?.code === 409) return undefined;
    throw error;
  }
}

async function ensureDatabase(databases: Databases, databaseId: string) {
  try {
    await databases.get(databaseId);
  } catch (error: any) {
    if (error?.code !== 404) throw error;
    await databases.create(databaseId, 'Booth Hunter');
  }
}

async function ensureCollection(databases: Databases, databaseId: string, collectionId: string, name: string) {
  try {
    await databases.getCollection(databaseId, collectionId);
  } catch (error: any) {
    if (error?.code !== 404) throw error;
    await databases.createCollection(databaseId, collectionId, name, [], true, true);
  }
}

async function ensureAttribute(databases: Databases, databaseId: string, collectionId: string, key: string, size: number, required = false) {
  await ignoreConflict(() => databases.createStringAttribute(databaseId, collectionId, key, size, required));
}

async function ensureIntAttribute(databases: Databases, databaseId: string, collectionId: string, key: string, required = false) {
  await ignoreConflict(() => databases.createIntegerAttribute(databaseId, collectionId, key, required));
}

async function ensureBoolAttribute(databases: Databases, databaseId: string, collectionId: string, key: string, required = false) {
  await ignoreConflict(() => databases.createBooleanAttribute(databaseId, collectionId, key, required));
}

async function main() {
  const config = getServerAppwriteConfig(process.env as Record<string, string | undefined>);
  const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId).setKey(config.apiKey);
  const databases = new Databases(client);

  await ensureDatabase(databases, config.databaseId);
  await ensureCollection(databases, config.databaseId, config.chatsCollectionId, 'Booth Hunter Chats');
  await ensureCollection(databases, config.databaseId, config.catalogCollectionId, 'Booth Hunter Catalog');

  await ensureAttribute(databases, config.databaseId, config.chatsCollectionId, 'userId', 64, true);
  await ensureAttribute(databases, config.databaseId, config.chatsCollectionId, 'title', 512, true);
  await ensureAttribute(databases, config.databaseId, config.chatsCollectionId, 'messagesJson', 65535, true);

  await ensureAttribute(databases, config.databaseId, config.catalogCollectionId, 'itemId', 64, true);
  await ensureAttribute(databases, config.databaseId, config.catalogCollectionId, 'title', 2048, true);
  await ensureAttribute(databases, config.databaseId, config.catalogCollectionId, 'description', 65535, false);
  await ensureAttribute(databases, config.databaseId, config.catalogCollectionId, 'normalizedText', 65535, false);
  await ensureAttribute(databases, config.databaseId, config.catalogCollectionId, 'priceText', 64, false);
  await ensureIntAttribute(databases, config.databaseId, config.catalogCollectionId, 'priceJpy', false);
  await ensureAttribute(databases, config.databaseId, config.catalogCollectionId, 'shopName', 1024, false);
  await ensureAttribute(databases, config.databaseId, config.catalogCollectionId, 'shopUrl', 2048, false);
  await ensureAttribute(databases, config.databaseId, config.catalogCollectionId, 'itemUrl', 2048, true);
  await ensureAttribute(databases, config.databaseId, config.catalogCollectionId, 'categoryName', 512, false);
  await ensureAttribute(databases, config.databaseId, config.catalogCollectionId, 'parentCategoryName', 512, false);
  await ensureAttribute(databases, config.databaseId, config.catalogCollectionId, 'tagsJson', 65535, false);
  await ensureAttribute(databases, config.databaseId, config.catalogCollectionId, 'imagesJson', 65535, false);
  await ensureBoolAttribute(databases, config.databaseId, config.catalogCollectionId, 'isAdult', false);
  await ensureAttribute(databases, config.databaseId, config.catalogCollectionId, 'publishedAt', 64, false);
  await ensureAttribute(databases, config.databaseId, config.catalogCollectionId, 'contentHash', 128, true);

  console.log('Appwrite bootstrap completed for database:', config.databaseId);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
