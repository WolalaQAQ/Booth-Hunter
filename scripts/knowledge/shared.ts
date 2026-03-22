import type { Direction } from "node:readline";

import {
  createTerminalProgressReporter,
  type ProgressPostfixField,
} from "../../src/lib/utils/progress";

export function argument(name: string, fallback?: string): string | undefined {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length) : fallback;
}

export function numberArgument(name: string, fallback: number): number {
  return Number(argument(name, String(fallback)) || String(fallback)) || fallback;
}

export function booleanArgument(name: string, fallback = false): boolean {
  const prefixed = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefixed));
  return match ? match.slice(prefixed.length).toLowerCase() === "true" : fallback;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const safeSize = Math.max(1, Math.floor(size) || 1);
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += safeSize) {
    batches.push(items.slice(index, index + safeSize));
  }
  return batches;
}

export type StageProgressOptions = {
  stage: string;
  total: number;
};

export type StageProgressRuntimeOptions = {
  checkpointIntervalMs?: number;
  isTTY?: boolean;
  now?: () => number;
  columns?: number;
  clearLine?: (dir: Direction) => void;
  cursorTo?: (column: number) => void;
  streamWriter?: (message: string) => void;
  logWriter?: (message: string) => void;
};

export function createStageProgress(options: StageProgressOptions, runtimeOptions: StageProgressRuntimeOptions = {}) {
  const now = runtimeOptions.now || (() => Date.now());
  const startedAt = now();
  const reporter = createTerminalProgressReporter({
    checkpointIntervalMs: runtimeOptions.checkpointIntervalMs,
    isTTY: runtimeOptions.isTTY,
    now,
    getColumns: runtimeOptions.columns !== undefined ? () => runtimeOptions.columns : undefined,
    clearLine: runtimeOptions.clearLine,
    cursorTo: runtimeOptions.cursorTo,
    streamWriter: runtimeOptions.streamWriter,
    logWriter: runtimeOptions.logWriter,
  });
  const disposeConsoleBridge = reporter.installConsoleBridge();

  return {
    update(completed: number, postfix: ProgressPostfixField[] = [], forceLog = false) {
      const elapsedSeconds = Math.max(0, (now() - startedAt) / 1000);
      reporter.renderProgress(
        {
          description: options.stage,
          completed,
          total: options.total,
          elapsedSeconds,
          postfix,
        },
        { forceLog, final: forceLog }
      );

      if (forceLog) {
        disposeConsoleBridge();
      }
    },
    dispose() {
      disposeConsoleBridge();
      reporter.dispose();
    },
  };
}

export function formatDurationMs(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) {
    return "-";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export type { ProgressPostfixField } from "../../src/lib/utils/progress";
