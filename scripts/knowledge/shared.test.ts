import assert from "node:assert/strict";
import test from "node:test";

import { createStageProgress } from "./shared";

test("createStageProgress emits tqdm-style checkpoint logs even when stdout is a TTY", () => {
  const ttyWrites: string[] = [];
  const logLines: string[] = [];
  const clearCalls: number[] = [];
  const cursorCalls: number[] = [];
  let now = 0;

  const progress = createStageProgress(
    { stage: "embed-text", total: 10 },
    {
      isTTY: true,
      now: () => now,
      checkpointIntervalMs: 5_000,
      streamWriter: (message) => {
        ttyWrites.push(message);
      },
      logWriter: (message) => {
        logLines.push(message);
      },
      clearLine: (dir) => {
        clearCalls.push(dir);
      },
      cursorTo: (column) => {
        cursorCalls.push(column);
      },
      columns: 120,
    }
  );

  now = 2_000;
  progress.update(2, [
    { label: "queued", value: 10, priority: 100 },
    { label: "skipped", value: 0, priority: 90 },
  ]);

  assert.equal(ttyWrites.length, 1);
  assert.match(ttyWrites[0] || "", /^embed-text:  20%\|/);
  assert.match(ttyWrites[0] || "", /2\/10 \[00:02<00:08, 1\.0 it\/s\]/);
  assert.match(ttyWrites[0] || "", /\| queued 10 \| skipped 0/);
  assert.equal(clearCalls.length, 2);
  assert.equal(cursorCalls.length, 2);
  assert.equal(logLines.length, 1);
  assert.match(logLines[0] || "", /^embed-text:  20%\|/);

  now = 4_000;
  progress.update(4, [
    { label: "queued", value: 10, priority: 100 },
    { label: "skipped", value: 0, priority: 90 },
  ]);
  assert.equal(logLines.length, 1);
  assert.equal(ttyWrites.length, 2);
});

test("createStageProgress forceLog emits a final newline and disposes the live progress state", () => {
  const ttyWrites: string[] = [];
  const logLines: string[] = [];
  const clearCalls: number[] = [];
  const cursorCalls: number[] = [];
  let now = 0;

  const progress = createStageProgress(
    { stage: "embed-images", total: 4 },
    {
      isTTY: true,
      now: () => now,
      streamWriter: (message) => {
        ttyWrites.push(message);
      },
      logWriter: (message) => {
        logLines.push(message);
      },
      clearLine: (dir) => {
        clearCalls.push(dir);
      },
      cursorTo: (column) => {
        cursorCalls.push(column);
      },
      columns: 120,
    }
  );

  now = 2_000;
  progress.update(
    4,
    [
      { label: "queued", value: 4, priority: 100 },
      { label: "skipped", value: 0, priority: 90 },
    ],
    true
  );

  assert.equal(ttyWrites.length, 2);
  assert.equal(ttyWrites[1], "\n");
  assert.equal(clearCalls.length, 2);
  assert.equal(cursorCalls.length, 2);
  assert.equal(logLines.length, 1);
  assert.match(logLines[0] || "", /^embed-images: 100%\|/);
});
