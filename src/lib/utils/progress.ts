import readline, { type Direction } from "node:readline";

export function formatProgressBar(current: number, total: number, width = 24): string {
  const safeTotal = Math.max(1, total);
  const normalized = Math.max(0, Math.min(1, current / safeTotal));
  const filled = Math.round(normalized * width);
  const bar = `${"#".repeat(filled)}${"-".repeat(Math.max(0, width - filled))}`;
  const percent = `${(normalized * 100).toFixed(1)}%`.padStart(6, " ");
  return `[${bar}] ${percent}`;
}

export type ProgressPostfixField = {
  label: string;
  value: string | number | boolean | null | undefined;
  shortLabel?: string;
  priority?: number;
};

export type TqdmProgressFormatOptions = {
  description?: string;
  completed: number;
  total: number;
  elapsedSeconds: number;
  rate?: number;
  unitLabel?: string;
  postfix?: ProgressPostfixField[];
  columns?: number;
  barWidth?: number;
  maxBarWidth?: number;
  minBarWidth?: number;
};

type NormalizedPostfixField = {
  index: number;
  label: string;
  shortLabel?: string;
  valueText: string;
  priority: number;
};

type RenderedCoreParts = {
  prefix: string;
  percent: string;
  count: string;
  stats: string;
};

export function fitTerminalLine(message: string, columns?: number): string {
  const width = typeof columns === "number" && Number.isFinite(columns) ? Math.max(1, Math.floor(columns)) : undefined;
  if (!width || message.length <= width) {
    return message;
  }

  if (width <= 3) {
    return message.slice(0, width);
  }

  return `${message.slice(0, width - 3)}...`;
}

export function formatTqdmProgress(options: TqdmProgressFormatOptions): string {
  const total = Math.max(1, options.total);
  const completed = Math.max(0, Math.min(options.completed, total));
  const elapsedSeconds = Math.max(0, options.elapsedSeconds);
  const rate = options.rate ?? (elapsedSeconds > 0 ? completed / elapsedSeconds : 0);
  const core = buildCoreParts(options.description, completed, total, elapsedSeconds, rate, options.unitLabel || "it");
  const postfix = normalizePostfixFields(options.postfix || []);
  const columns = typeof options.columns === "number" && Number.isFinite(options.columns) ? Math.max(1, Math.floor(options.columns)) : undefined;
  const barWidth = options.barWidth;
  const maxBarWidth = barWidth ?? options.maxBarWidth ?? 24;
  const minBarWidth = barWidth ?? Math.min(maxBarWidth, options.minBarWidth ?? 10);
  const subsets = buildPostfixSubsets(postfix);

  for (const subset of subsets) {
    const fixedFull = buildLine(core, completed, total, subset, {
      compactPostfix: false,
      barWidth: maxBarWidth,
    });
    if (!columns || fixedFull.length <= columns) {
      return fixedFull;
    }

    const fixedCompact = buildLine(core, completed, total, subset, {
      compactPostfix: true,
      barWidth: maxBarWidth,
    });
    if (fixedCompact.length <= columns) {
      return fixedCompact;
    }
  }

  for (const subset of subsets) {
    const compactPostfixText = renderPostfix(subset, true);
    const availableBarWidth = calculateAvailableBarWidth(core, compactPostfixText, columns, maxBarWidth);
    if (availableBarWidth >= minBarWidth) {
      return buildLine(core, completed, total, subset, {
        compactPostfix: true,
        barWidth: availableBarWidth,
      });
    }
  }

  const fallback = buildLine(core, completed, total, [], {
    compactPostfix: true,
    barWidth: minBarWidth,
  });
  return fitTerminalLine(fallback, columns);
}

export type TerminalProgressReporterOptions = {
  checkpointIntervalMs?: number;
  isTTY?: boolean;
  now?: () => number;
  getColumns?: () => number | undefined;
  clearLine?: (dir: Direction) => void;
  cursorTo?: (column: number) => void;
  streamWriter?: (message: string) => void;
  logWriter?: (message: string) => void;
  consoleTarget?: {
    log: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
};

export type TerminalProgressRenderOptions = {
  forceLog?: boolean;
  final?: boolean;
};

export function createTerminalProgressReporter(options: TerminalProgressReporterOptions = {}) {
  const checkpointIntervalMs = options.checkpointIntervalMs ?? 5_000;
  const isTTY = options.isTTY ?? process.stdout.isTTY;
  const now = options.now ?? (() => Date.now());
  const getColumns = options.getColumns ?? (() => process.stdout.columns);
  const clearLine =
    options.clearLine ??
    ((dir: Direction) => {
      readline.clearLine(process.stdout, dir);
    });
  const cursorTo =
    options.cursorTo ??
    ((column: number) => {
      readline.cursorTo(process.stdout, column);
    });
  const streamWriter = options.streamWriter ?? ((message: string) => process.stdout.write(message));
  const consoleTarget = options.consoleTarget ?? {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  const logWriter = options.logWriter ?? consoleTarget.log;

  let lastCheckpointAt: number | undefined;
  let activeLine = "";
  let bridgeDispose: (() => void) | undefined;

  function clearCurrentLine() {
    clearLine(0);
    cursorTo(0);
  }

  function renderLiveLine(line: string, final = false) {
    clearCurrentLine();
    streamWriter(line);
    if (final) {
      streamWriter("\n");
      activeLine = "";
      return;
    }
    activeLine = line;
  }

  function restoreActiveLine() {
    if (!activeLine) {
      return;
    }
    renderLiveLine(activeLine, false);
  }

  function installConsoleBridge() {
    if (bridgeDispose) {
      return bridgeDispose;
    }

    const originalLog = consoleTarget.log.bind(consoleTarget);
    const originalWarn = consoleTarget.warn.bind(consoleTarget);
    const originalError = consoleTarget.error.bind(consoleTarget);

    const wrap =
      (original: (...args: unknown[]) => void) =>
      (...args: unknown[]) => {
        const hadActiveLine = Boolean(isTTY && activeLine);
        if (hadActiveLine) {
          clearCurrentLine();
        }
        original(...args);
        if (hadActiveLine) {
          restoreActiveLine();
        }
      };

    consoleTarget.log = wrap(originalLog);
    consoleTarget.warn = wrap(originalWarn);
    consoleTarget.error = wrap(originalError);

    bridgeDispose = () => {
      consoleTarget.log = originalLog;
      consoleTarget.warn = originalWarn;
      consoleTarget.error = originalError;
      bridgeDispose = undefined;
    };

    return bridgeDispose;
  }

  return {
    renderProgress(snapshot: TqdmProgressFormatOptions, renderOptions: TerminalProgressRenderOptions = {}) {
      const timestamp = now();
      const fullLine = formatTqdmProgress(snapshot);
      const liveLine = formatTqdmProgress({ ...snapshot, columns: getColumns() });
      const shouldLog =
        renderOptions.forceLog ||
        lastCheckpointAt === undefined ||
        timestamp - lastCheckpointAt >= checkpointIntervalMs;

      if (isTTY) {
        if (shouldLog) {
          clearCurrentLine();
          logWriter(fullLine);
          lastCheckpointAt = timestamp;
        }
        renderLiveLine(liveLine, renderOptions.final);
        return;
      }

      if (shouldLog) {
        logWriter(fullLine);
        lastCheckpointAt = timestamp;
      }
    },
    installConsoleBridge,
    dispose() {
      bridgeDispose?.();
      activeLine = "";
    },
  };
}

function buildCoreParts(
  description: string | undefined,
  completed: number,
  total: number,
  elapsedSeconds: number,
  rate: number,
  unitLabel: string
): RenderedCoreParts {
  const normalized = Math.max(0, Math.min(1, completed / Math.max(1, total)));
  const percent = `${Math.round(normalized * 100)}`.padStart(3, " ") + "%";
  const prefix = description ? `${description}: ` : "";
  const count = `${completed}/${total}`;
  const etaSeconds = rate > 0 ? Math.max(0, (total - completed) / rate) : undefined;
  const stats = `[${formatDuration(elapsedSeconds)}<${formatDuration(etaSeconds)}, ${formatRate(rate, unitLabel)}]`;
  return { prefix, percent, count, stats };
}

function buildLine(
  core: RenderedCoreParts,
  completed: number,
  total: number,
  postfix: NormalizedPostfixField[],
  options: { compactPostfix: boolean; barWidth: number }
) {
  const bar = renderUnicodeBar(completed, total, options.barWidth);
  const base = `${core.prefix}${core.percent}|${bar}| ${core.count} ${core.stats}`;
  const postfixText = renderPostfix(postfix, options.compactPostfix);
  return postfixText ? `${base} | ${postfixText}` : base;
}

function renderUnicodeBar(current: number, total: number, width: number) {
  const safeTotal = Math.max(1, total);
  const normalized = Math.max(0, Math.min(1, current / safeTotal));
  const filled = Math.round(normalized * width);
  return `${"█".repeat(filled)}${"-".repeat(Math.max(0, width - filled))}`;
}

function renderPostfix(fields: NormalizedPostfixField[], compact: boolean) {
  return fields
    .map((field) => {
      const label = compact ? field.shortLabel || field.label : field.label;
      return `${label} ${field.valueText}`;
    })
    .join(" | ");
}

function calculateAvailableBarWidth(
  core: RenderedCoreParts,
  postfixText: string,
  columns: number | undefined,
  maxBarWidth: number
) {
  if (!columns) {
    return maxBarWidth;
  }

  const baseWithoutBar = `${core.prefix}${core.percent}|| ${core.count} ${core.stats}`;
  const postfixSuffix = postfixText ? ` | ${postfixText}` : "";
  return columns - baseWithoutBar.length - postfixSuffix.length;
}

function normalizePostfixFields(fields: ProgressPostfixField[]): NormalizedPostfixField[] {
  return fields
    .filter((field) => field.value !== undefined && field.value !== null && String(field.value).trim().length > 0)
    .map((field, index) => ({
      index,
      label: field.label,
      shortLabel: field.shortLabel,
      valueText: typeof field.value === "boolean" ? (field.value ? "yes" : "no") : String(field.value),
      priority: field.priority ?? 50,
    }));
}

function buildPostfixSubsets(fields: NormalizedPostfixField[]) {
  if (fields.length === 0) {
    return [[]];
  }

  const subsets: NormalizedPostfixField[][] = [fields];
  const remaining = new Set(fields.map((field) => field.index));
  const dropOrder = [...fields].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return right.index - left.index;
  });

  for (const field of dropOrder) {
    remaining.delete(field.index);
    subsets.push(fields.filter((entry) => remaining.has(entry.index)));
  }

  return subsets;
}

function formatDuration(seconds: number | undefined) {
  if (seconds === undefined || !Number.isFinite(seconds)) {
    return "?";
  }

  const wholeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatRate(rate: number, unitLabel: string) {
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
  return `${safeRate.toFixed(1)} ${unitLabel}/s`;
}
