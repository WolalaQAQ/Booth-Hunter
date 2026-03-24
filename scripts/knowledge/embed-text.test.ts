import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadLocalEnv } from "../../src/lib/env/local";
import {
  listItemTextEmbeddingsBySpace,
  openPipelineDatabase,
  saveImageAnalysis,
  saveStructuredItem,
  upsertNormalizedItem,
} from "../../src/lib/pipeline/sqlite/db";

function writeMockEmbeddingScript(filePath: string) {
  fs.writeFileSync(
    filePath,
    [
      "import json",
      "import sys",
      "",
      "def handle(command, payload):",
      "    if command == 'qwen-env':",
      "        return {",
      "            'python': sys.executable,",
      "            'flashAttentionAvailable': True,",
      "            'cudaAvailable': False,",
      "            'requestedAttentionImplementation': payload.get('attnImplementation'),",
      "            'resolvedAttentionImplementation': payload.get('attnImplementation'),",
      "            'supportedAttentionImplementations': ['eager', 'sdpa', 'flash_attention_2'],",
      "        }",
      "    if command == 'qwen-embed':",
      "        inputs = payload.get('inputs', [])",
      "        sys.stderr.write('mock-worker embed request\\n')",
      "        sys.stderr.flush()",
      "        for index, _ in enumerate(inputs, start=1):",
      "            sys.stderr.write(f'qwen-embed {index}/{len(inputs)}\\n')",
      "            sys.stderr.flush()",
      "        return {",
      "            'model': 'mock-qwen-text',",
      "            'embeddingSpace': payload['embeddingSpace'],",
      "            'vectors': [[float(index), 0.0, 1.0] for index, _ in enumerate(inputs, start=1)],",
      "        }",
      "    raise ValueError(f'unsupported command: {command}')",
      "",
      "def emit(result):",
      "    sys.stdout.write(json.dumps(result))",
      "    sys.stdout.flush()",
      "",
      "def worker():",
      "    while True:",
      "        header = sys.stdin.readline()",
      "        if not header:",
      "            break",
      "        raw = sys.stdin.read(int(header.strip()))",
      "        request = json.loads(raw)",
      "        try:",
      "            result = handle(request['command'], request['payload'])",
      "            response = {'id': request['id'], 'ok': True, 'result': result}",
      "        except Exception as error:",
      "            response = {'id': request.get('id'), 'ok': False, 'error': {'message': str(error)}}",
      "        encoded = json.dumps(response)",
      "        sys.stdout.write(f'{len(encoded.encode(\"utf-8\"))}\\n')",
      "        sys.stdout.write(encoded)",
      "        sys.stdout.flush()",
      "",
      "if __name__ == '__main__':",
      "    command = sys.argv[1]",
      "    if command == 'qwen-worker':",
      "        worker()",
      "    else:",
      "        payload = json.load(sys.stdin)",
      "        emit(handle(command, payload))",
      "",
    ].join("\n"),
    "utf8"
  );
}

async function runNodeCommand(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) {
  return await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test("embed-text supports compact terminal progress plus verbose file logging", async () => {
  loadLocalEnv();
  const rootDir = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "booth-hunter-embed-text-script-"));
  const dbPath = path.join(tempDir, "embed-text.sqlite");
  const logPath = path.join(tempDir, "embed-text-progress.log");
  const mockScriptPath = path.join(tempDir, "mock_embed.py");
  const tsxCliPath = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
  writeMockEmbeddingScript(mockScriptPath);

  const db = openPipelineDatabase(dbPath);
  try {
    upsertNormalizedItem(db, {
      itemId: "item-1",
      normalizedJson: JSON.stringify({
        itemId: "item-1",
        normalizedText: "red cyber outfit for manuka avatar",
      }),
      contentHash: "content-1",
      updatedAt: "2026-03-24T00:00:00.000Z",
    });
    saveStructuredItem(db, {
      itemId: "item-1",
      structuredJson: JSON.stringify({
        parts: ["outfit"],
        styles: ["cyber"],
        compatibilityHints: ["manuka"],
      }),
      updatedAt: "2026-03-24T00:00:01.000Z",
    });
    saveImageAnalysis(db, {
      imageKey: "item-1:0",
      itemId: "item-1",
      imageIndex: 0,
      captionText: "front view of red cyber outfit",
      ocrText: "MANUKA",
      updatedAt: "2026-03-24T00:00:02.000Z",
    });

    upsertNormalizedItem(db, {
      itemId: "item-2",
      normalizedJson: JSON.stringify({
        itemId: "item-2",
        normalizedText: "blue maid dress with apron and ribbon",
      }),
      contentHash: "content-2",
      updatedAt: "2026-03-24T00:00:03.000Z",
    });
    saveStructuredItem(db, {
      itemId: "item-2",
      structuredJson: JSON.stringify({
        parts: ["dress"],
        styles: ["maid"],
        compatibilityHints: ["generic"],
      }),
      updatedAt: "2026-03-24T00:00:04.000Z",
    });
  } finally {
    db.close();
  }

  const result = await runNodeCommand(
    process.execPath,
    [
      tsxCliPath,
      "scripts/knowledge/embed-text.ts",
      `--db=${dbPath}`,
      "--limit=10",
      "--skip-existing=true",
      "--provider-batch-size=2",
      "--save-batch-size=2",
      "--max-pending-save-batches=1",
      "--verbose-progress=false",
      `--progress-log-file=${logPath}`,
    ],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        EMBED_PYTHON_BIN: process.env.EMBED_PYTHON_BIN || "python",
        EMBED_SCRIPT_PATH: mockScriptPath,
      },
    }
  );

  assert.equal(result.code, 0, `stdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`);
  assert.match(result.stdout, /Text embeddings completed for 2 items\./);
  assert.match(result.stdout, /progressLogFile=/);
  assert.equal(fs.existsSync(logPath), true);

  const logContents = fs.readFileSync(logPath, "utf8");
  assert.match(logContents, /providerBatchSize 2/);
  assert.match(logContents, /saveBatchSize 2/);
  assert.match(logContents, /mock-worker embed request/);
  assert.doesNotMatch(logContents, /\bremaining\b/);

  const verificationDb = openPipelineDatabase(dbPath);
  try {
    assert.equal(listItemTextEmbeddingsBySpace(verificationDb, "multimodal-shared").length, 2);
  } finally {
    verificationDb.close();
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
});
