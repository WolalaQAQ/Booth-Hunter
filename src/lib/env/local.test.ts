import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { findUpwardFile, loadLocalEnv, parseEnvFile } from "./local";

test("findUpwardFile locates the nearest .env.local above a nested worktree path", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "booth-hunter-env-"));
  const projectRoot = path.join(tempRoot, "Booth-Hunter");
  const worktreeDir = path.join(projectRoot, ".worktrees", "phase2-qdrant-retrieval");
  fs.mkdirSync(worktreeDir, { recursive: true });
  const envPath = path.join(projectRoot, ".env.local");
  fs.writeFileSync(envPath, "EMBED_DEVICE=cuda\n", "utf8");

  assert.equal(findUpwardFile(".env.local", worktreeDir), envPath);
  assert.equal(findUpwardFile("missing.env", worktreeDir), undefined);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("parseEnvFile keeps quoted Windows paths and ignores comments", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "booth-hunter-env-"));
  const envPath = path.join(tempRoot, ".env.local");
  fs.writeFileSync(
    envPath,
    [
      "# comment",
      "EMBED_PYTHON_BIN='C:\\Users\\69546\\miniconda3\\envs\\torch\\python.exe'",
      'QWEN_VL_EMBED_MODEL_ID="D:\\models\\Qwen3-VL-Embedding-2B"',
      "EMBED_DEVICE=cuda",
      "",
    ].join("\n"),
    "utf8"
  );

  assert.deepEqual(parseEnvFile(envPath), {
    EMBED_PYTHON_BIN: "C:\\Users\\69546\\miniconda3\\envs\\torch\\python.exe",
    QWEN_VL_EMBED_MODEL_ID: "D:\\models\\Qwen3-VL-Embedding-2B",
    EMBED_DEVICE: "cuda",
  });

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("loadLocalEnv populates missing keys from the nearest .env.local without overwriting explicit env", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "booth-hunter-env-"));
  const projectRoot = path.join(tempRoot, "Booth-Hunter");
  const worktreeDir = path.join(projectRoot, ".worktrees", "phase2-qdrant-retrieval");
  fs.mkdirSync(worktreeDir, { recursive: true });
  const envPath = path.join(projectRoot, ".env.local");
  fs.writeFileSync(
    envPath,
    [
      "EMBED_PYTHON_BIN='C:\\Users\\69546\\miniconda3\\envs\\torch\\python.exe'",
      "EMBED_DEVICE=cuda",
      "QWEN_VL_EMBED_MODEL_ID=D:\\models\\Qwen3-VL-Embedding-2B",
      "QWEN_VL_RERANK_MODEL_ID=D:\\models\\Qwen3-VL-Reranker-2B",
    ].join("\n"),
    "utf8"
  );

  const env: Record<string, string | undefined> = {
    EMBED_DEVICE: "cpu",
  };

  const result = loadLocalEnv({ cwd: worktreeDir, env, fileName: ".env.local" });

  assert.equal(result.path, envPath);
  assert.deepEqual(result.loadedKeys.sort(), [
    "EMBED_PYTHON_BIN",
    "QWEN_VL_EMBED_MODEL_ID",
    "QWEN_VL_RERANK_MODEL_ID",
  ]);
  assert.equal(env.EMBED_PYTHON_BIN, "C:\\Users\\69546\\miniconda3\\envs\\torch\\python.exe");
  assert.equal(env.EMBED_DEVICE, "cpu");
  assert.equal(env.QWEN_VL_EMBED_MODEL_ID, "D:\\models\\Qwen3-VL-Embedding-2B");
  assert.equal(env.QWEN_VL_RERANK_MODEL_ID, "D:\\models\\Qwen3-VL-Reranker-2B");

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
