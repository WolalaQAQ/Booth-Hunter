import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ensureQdrantAvailable, isManagedLocalQdrantUrl } from "./ensure";

test("isManagedLocalQdrantUrl only accepts localhost/127.0.0.1 on the default Qdrant port", () => {
  assert.equal(isManagedLocalQdrantUrl("http://127.0.0.1:6333"), true);
  assert.equal(isManagedLocalQdrantUrl("http://localhost:6333"), true);
  assert.equal(isManagedLocalQdrantUrl("http://127.0.0.1:7000"), false);
  assert.equal(isManagedLocalQdrantUrl("https://qdrant.example"), false);
});

test("ensureQdrantAvailable does nothing when Qdrant is already reachable", async () => {
  let startCalls = 0;
  let downloadCalls = 0;

  const result = await ensureQdrantAvailable(
    {
      url: "http://127.0.0.1:6333",
      collections: {
        items: "booth_items",
        assets: "booth_assets",
      },
    },
    {
      checkReady: async () => true,
      startDetached: async () => {
        startCalls += 1;
      },
      downloadBinary: async () => {
        downloadCalls += 1;
      },
    }
  );

  assert.equal(result.started, false);
  assert.equal(startCalls, 0);
  assert.equal(downloadCalls, 0);
});

test("ensureQdrantAvailable auto-starts local Qdrant and downloads the binary when it is missing", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "booth-hunter-qdrant-"));
  const binaryPath = path.join(tempRoot, "qdrant.exe");
  const runtimeDir = path.join(tempRoot, "runtime");
  const calls: string[] = [];
  let readyChecks = 0;

  const result = await ensureQdrantAvailable(
    {
      url: "http://127.0.0.1:6333",
      collections: {
        items: "booth_items",
        assets: "booth_assets",
      },
    },
    {
      binaryPath,
      runtimeDir,
      platform: "win32",
      timeoutMs: 200,
      pollIntervalMs: 1,
      checkReady: async () => {
        readyChecks += 1;
        calls.push(`ready:${readyChecks}`);
        return readyChecks >= 2;
      },
      downloadBinary: async (targetPath) => {
        calls.push(`download:${targetPath}`);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, "binary");
      },
      startDetached: async (targetPath, targetRuntimeDir) => {
        calls.push(`start:${targetPath}:${targetRuntimeDir}`);
      },
    }
  );

  assert.equal(result.started, true);
  assert.equal(fs.existsSync(binaryPath), true);
  assert.deepEqual(calls, [
    "ready:1",
    `download:${binaryPath}`,
    `start:${binaryPath}:${runtimeDir}`,
    "ready:2",
  ]);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("ensureQdrantAvailable refuses to auto-start non-local Qdrant endpoints", async () => {
  await assert.rejects(
    ensureQdrantAvailable(
      {
        url: "https://qdrant.example",
        collections: {
          items: "booth_items",
          assets: "booth_assets",
        },
      },
      {
        checkReady: async () => false,
      }
    ),
    /auto-start only supports local/i
  );
});
