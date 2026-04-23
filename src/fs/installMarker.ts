import { promises as realFs } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { FsApi } from "./gitignore.js";

const MARKER = ".crew-installed";

export function markerPath(appDir: string): string {
  return join(appDir, MARKER);
}

export function hashInstall(installCmd: string): string {
  return createHash("sha256").update(installCmd).digest("hex");
}

export async function readMarker(appDir: string, fs: FsApi = realFs): Promise<string | null> {
  try {
    const raw = await fs.readFile(markerPath(appDir), "utf8");
    return raw.trim();
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeMarker(appDir: string, hash: string, fs: FsApi = realFs): Promise<void> {
  await fs.writeFile(markerPath(appDir), hash + "\n", "utf8");
}
