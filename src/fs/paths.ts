import { promises as realFs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { FsApi } from "./gitignore.js";

const CONFIG_NAME = "crew.yaml";

export async function findProjectRoot(
  startDir: string,
  fs: FsApi = realFs,
): Promise<string | null> {
  let dir = resolve(startDir);
  while (true) {
    try {
      await fs.readFile(join(dir, CONFIG_NAME), "utf8");
      return dir;
    } catch (err: any) {
      if (err?.code !== "ENOENT") throw err;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function appsDirFor(projectRoot: string, appsDir: string | undefined): string {
  return join(projectRoot, appsDir ?? "apps");
}

export function configPath(projectRoot: string): string {
  return join(projectRoot, CONFIG_NAME);
}
