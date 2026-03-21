import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { QdrantConfig } from "./client";

const QDRANT_VERSION = "v1.16.3";
const LOCAL_QDRANT_URL = "http://127.0.0.1:6333";
const WINDOWS_QDRANT_DOWNLOAD_URL =
  `https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/qdrant-x86_64-pc-windows-msvc.zip`;

export type EnsureQdrantResult = {
  started: boolean;
  url: string;
  binaryPath?: string;
  runtimeDir?: string;
};

export type EnsureQdrantOptions = {
  binaryPath?: string;
  runtimeDir?: string;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
  pollIntervalMs?: number;
  checkReady?: (url: string) => Promise<boolean>;
  downloadBinary?: (binaryPath: string) => Promise<void>;
  startDetached?: (binaryPath: string, runtimeDir: string) => Promise<void>;
};

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function isManagedLocalQdrantUrl(url: string): boolean {
  const parsed = new URL(url);
  const isLocalHost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  const port = parsed.port || "6333";
  return isLocalHost && port === "6333";
}

export function getDefaultQdrantBinaryPath(
  cwd = process.cwd(),
  platform: NodeJS.Platform = process.platform
): string {
  if (platform === "win32") {
    return path.join(cwd, ".tools", "qdrant", QDRANT_VERSION, "qdrant.exe");
  }
  return path.join(cwd, ".tools", "qdrant", QDRANT_VERSION, "qdrant");
}

export function getDefaultQdrantRuntimeDir(cwd = process.cwd()): string {
  return path.join(cwd, ".tmp", "qdrant-local");
}

async function checkQdrantReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${normalizeBaseUrl(url)}/collections`);
    return response.ok;
  } catch {
    return false;
  }
}

function runPowerShell(script: string, cwd: string) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to execute PowerShell command.");
  }
}

async function downloadQdrantBinary(binaryPath: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  if (fs.existsSync(binaryPath)) {
    return;
  }

  if (platform !== "win32") {
    throw new Error(
      `Qdrant binary not found at ${binaryPath}. Auto-download is only implemented for Windows right now.`
    );
  }

  const installDir = path.dirname(binaryPath);
  const zipPath = path.join(installDir, "qdrant.zip");
  fs.mkdirSync(installDir, { recursive: true });
  runPowerShell(
    [
      "$ProgressPreference='SilentlyContinue'",
      `Invoke-WebRequest -Uri '${WINDOWS_QDRANT_DOWNLOAD_URL}' -OutFile '${zipPath.replace(/'/g, "''")}'`,
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${installDir.replace(/'/g, "''")}' -Force`,
    ].join("; "),
    process.cwd()
  );

  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Downloaded Qdrant archive but ${binaryPath} was still missing afterwards.`);
  }
}

async function startQdrantDetached(binaryPath: string, runtimeDir: string): Promise<void> {
  fs.mkdirSync(runtimeDir, { recursive: true });
  const stdoutPath = path.join(runtimeDir, "qdrant.stdout.log");
  const stderrPath = path.join(runtimeDir, "qdrant.stderr.log");
  const stdoutFd = fs.openSync(stdoutPath, "a");
  const stderrFd = fs.openSync(stderrPath, "a");
  const child = spawn(binaryPath, ["--disable-telemetry"], {
    cwd: runtimeDir,
    detached: true,
    stdio: ["ignore", stdoutFd, stderrFd],
    windowsHide: true,
  });
  child.unref();
}

async function waitForQdrantReady(
  url: string,
  timeoutMs: number,
  pollIntervalMs: number,
  checkReady: (url: string) => Promise<boolean>
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkReady(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Timed out waiting for local Qdrant to start at ${url}.`);
}

export async function ensureQdrantAvailable(
  config: QdrantConfig,
  options: EnsureQdrantOptions = {}
): Promise<EnsureQdrantResult> {
  const url = normalizeBaseUrl(config.url || LOCAL_QDRANT_URL);
  const checkReady = options.checkReady || checkQdrantReady;
  if (await checkReady(url)) {
    return {
      started: false,
      url,
    };
  }

  if (!isManagedLocalQdrantUrl(url)) {
    throw new Error(`Qdrant at ${url} is unavailable, and auto-start only supports local http://127.0.0.1:6333.`);
  }

  const platform = options.platform || process.platform;
  const binaryPath = options.binaryPath || getDefaultQdrantBinaryPath(process.cwd(), platform);
  const runtimeDir = options.runtimeDir || getDefaultQdrantRuntimeDir(process.cwd());
  const downloadBinary = options.downloadBinary || ((targetPath: string) => downloadQdrantBinary(targetPath, platform));
  const startDetached = options.startDetached || startQdrantDetached;

  if (!fs.existsSync(binaryPath)) {
    await downloadBinary(binaryPath);
  }

  await startDetached(binaryPath, runtimeDir);
  await waitForQdrantReady(url, options.timeoutMs ?? 30_000, options.pollIntervalMs ?? 500, checkReady);

  return {
    started: true,
    url,
    binaryPath,
    runtimeDir,
  };
}
