import fs from "node:fs";
import path from "node:path";

export type EnvTarget = Record<string, string | undefined>;

export type LoadLocalEnvOptions = {
  cwd?: string;
  env?: EnvTarget;
  fileName?: string;
};

export type LoadLocalEnvResult = {
  path?: string;
  loadedKeys: string[];
};

function parseEnvValue(rawValue: string): string {
  const value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseEnvFile(filePath: string): EnvTarget {
  const contents = fs.readFileSync(filePath, "utf8");
  const entries: EnvTarget = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = parseEnvValue(line.slice(separator + 1));
    if (!key) {
      continue;
    }

    entries[key] = value;
  }

  return entries;
}

export function findUpwardFile(fileName: string, startDir = process.cwd()): string | undefined {
  let current = path.resolve(startDir);

  while (true) {
    const candidate = path.join(current, fileName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function loadLocalEnv(options: LoadLocalEnvOptions = {}): LoadLocalEnvResult {
  const cwd = options.cwd || process.cwd();
  const env = options.env || (process.env as EnvTarget);
  const fileName = options.fileName || ".env.local";
  const envPath = findUpwardFile(fileName, cwd);
  if (!envPath) {
    return {
      loadedKeys: [],
    };
  }

  const parsed = parseEnvFile(envPath);
  const loadedKeys: string[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (!key || value === undefined || env[key]?.trim()) {
      continue;
    }
    env[key] = value;
    loadedKeys.push(key);
  }

  return {
    path: envPath,
    loadedKeys,
  };
}
