import test from "node:test";
import assert from "node:assert/strict";

import { getBrowserAppwriteConfig, getServerAppwriteConfig } from "./config";

test("getBrowserAppwriteConfig reads VITE_ variables and defaults collection ids", () => {
  const config = getBrowserAppwriteConfig({
    VITE_APPWRITE_ENDPOINT: "https://appwrite.example/v1",
    VITE_APPWRITE_PROJECT_ID: "project_123",
    VITE_APPWRITE_DATABASE_ID: "db_main",
  });

  assert.equal(config.endpoint, "https://appwrite.example/v1");
  assert.equal(config.projectId, "project_123");
  assert.equal(config.databaseId, "db_main");
  assert.equal(config.chatsCollectionId, "booth_hunter_chats");
  assert.equal(config.catalogCollectionId, "booth_hunter_catalog");
});

test("getServerAppwriteConfig requires api key", () => {
  assert.throws(
    () =>
      getServerAppwriteConfig({
        APPWRITE_ENDPOINT: "https://appwrite.example/v1",
        APPWRITE_PROJECT_ID: "project_123",
        APPWRITE_DATABASE_ID: "db_main",
      }),
    /APPWRITE_API_KEY/
  );
});
