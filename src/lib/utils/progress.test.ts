import test from "node:test";
import assert from "node:assert/strict";

import {
  createTerminalProgressReporter,
  formatProgressBar,
  formatTqdmProgress,
  type ProgressPostfixField,
} from "./progress";

test("formatProgressBar renders percentage and bounded fill width", () => {
  assert.equal(formatProgressBar(0, 100, 10), "[----------]   0.0%");
  assert.equal(formatProgressBar(50, 100, 10), "[#####-----]  50.0%");
  assert.equal(formatProgressBar(100, 100, 10), "[##########] 100.0%");
});

test("formatProgressBar clamps over-complete progress", () => {
  assert.equal(formatProgressBar(150, 100, 10), "[##########] 100.0%");
});

test("formatTqdmProgress renders tqdm-style core fields with elapsed, eta, and rate", () => {
  assert.equal(
    formatTqdmProgress({
      completed: 4,
      total: 10,
      elapsedSeconds: 2,
      barWidth: 10,
      postfix: [
        { label: "queued", value: 10 },
        { label: "skipped", value: 1 },
      ],
    }),
    " 40%|████------| 4/10 [00:02<00:03, 2.0 it/s] | queued 10 | skipped 1"
  );
});

test("formatTqdmProgress preserves core progress state and drops low-priority postfix first on narrow widths", () => {
  const postfix: ProgressPostfixField[] = [
    { label: "queued", shortLabel: "q", value: 1000, priority: 100 },
    { label: "skipped", shortLabel: "sk", value: 20, priority: 90 },
    { label: "providerBatchSize", shortLabel: "pbs", value: 4, priority: 10 },
  ];

  const line = formatTqdmProgress({
    completed: 4,
    total: 10,
    elapsedSeconds: 2,
    columns: 64,
    maxBarWidth: 10,
    minBarWidth: 6,
    postfix,
  });

  assert.equal(line.length <= 64, true);
  assert.match(line, /4\/10 \[00:02<00:03, 2\.0 it\/s\]/);
  assert.match(line, /\| (queued|q) 1000/);
  assert.doesNotMatch(line, /providerBatchSize|pbs/);
});

test("createTerminalProgressReporter renders fitted tty progress and logs full checkpoints", () => {
  const streamWrites: string[] = [];
  const logLines: string[] = [];
  const clearCalls: number[] = [];
  const cursorCalls: number[] = [];
  let now = 0;

  const reporter = createTerminalProgressReporter({
    isTTY: true,
    checkpointIntervalMs: 5_000,
    now: () => now,
    getColumns: () => 48,
    clearLine: (dir) => {
      clearCalls.push(dir);
    },
    cursorTo: (column) => {
      cursorCalls.push(column);
    },
    streamWriter: (message) => {
      streamWrites.push(message);
    },
    logWriter: (message) => {
      logLines.push(message);
    },
  });

  reporter.renderProgress({
    description: "embed-text",
    completed: 4,
    total: 10,
    elapsedSeconds: 2,
    postfix: [{ label: "queued", value: 10 }],
    barWidth: 10,
  });

  assert.equal(clearCalls.length, 2);
  assert.equal(cursorCalls.length, 2);
  assert.equal(streamWrites.length, 1);
  assert.equal(streamWrites[0]!.length <= 48, true);
  assert.match(streamWrites[0] || "", /^embed-text: /);
  assert.equal(logLines.length, 1);
  assert.match(logLines[0] || "", /\| queued 10/);

  now = 1_000;
  reporter.renderProgress({
    description: "embed-text",
    completed: 5,
    total: 10,
    elapsedSeconds: 3,
    postfix: [{ label: "queued", value: 10 }],
    barWidth: 10,
  });

  assert.equal(logLines.length, 1);
  assert.equal(streamWrites.length, 2);
});

test("createTerminalProgressReporter restores the active progress line after bridged console output", () => {
  const streamWrites: string[] = [];
  const clearCalls: number[] = [];
  const cursorCalls: number[] = [];
  const consoleEvents: string[] = [];

  const consoleTarget = {
    log: (...args: unknown[]) => {
      consoleEvents.push(`log:${args.join(" ")}`);
    },
    warn: (...args: unknown[]) => {
      consoleEvents.push(`warn:${args.join(" ")}`);
    },
    error: (...args: unknown[]) => {
      consoleEvents.push(`error:${args.join(" ")}`);
    },
  };

  const reporter = createTerminalProgressReporter({
    isTTY: true,
    now: () => 100,
    getColumns: () => 120,
    clearLine: (dir) => {
      clearCalls.push(dir);
    },
    cursorTo: (column) => {
      cursorCalls.push(column);
    },
    streamWriter: (message) => {
      streamWrites.push(message);
    },
    logWriter: () => undefined,
    consoleTarget,
  });

  reporter.renderProgress({
    description: "sync",
    completed: 2,
    total: 5,
    elapsedSeconds: 2,
    postfix: [{ label: "queued", value: 5 }],
    barWidth: 10,
  });

  const restoreConsole = reporter.installConsoleBridge();
  consoleTarget.warn("retrying", "page");
  consoleTarget.error("boom");
  restoreConsole();

  assert.deepEqual(consoleEvents, ["warn:retrying page", "error:boom"]);
  assert.equal(clearCalls.length, 6);
  assert.equal(cursorCalls.length, 6);
  assert.equal(streamWrites.length, 3);
  assert.equal(streamWrites[0], streamWrites[1]);
  assert.equal(streamWrites[1], streamWrites[2]);
});

test("createTerminalProgressReporter writes a final newline for completed tty progress", () => {
  const streamWrites: string[] = [];
  const logLines: string[] = [];

  const reporter = createTerminalProgressReporter({
    isTTY: true,
    now: () => 100,
    getColumns: () => 120,
    clearLine: () => undefined,
    cursorTo: () => undefined,
    streamWriter: (message) => {
      streamWrites.push(message);
    },
    logWriter: (message) => {
      logLines.push(message);
    },
  });

  reporter.renderProgress(
    {
      description: "embed-images",
      completed: 4,
      total: 4,
      elapsedSeconds: 2,
      postfix: [{ label: "queued", value: 4 }],
      barWidth: 10,
    },
    { forceLog: true, final: true }
  );

  assert.equal(streamWrites.length, 2);
  assert.equal(streamWrites[1], "\n");
  assert.equal(logLines.length, 1);
  assert.match(logLines[0] || "", /^embed-images: /);
});
