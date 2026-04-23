import { promises as realFs } from "node:fs";
import type { FsApi } from "./gitignore.js";

export class LockHeldError extends Error {
  constructor(readonly pid: number) {
    super(`another apps-cli is running (pid ${pid})`);
    this.name = "LockHeldError";
  }
}

export interface LockHandle {
  path: string;
}

export interface LockDeps {
  pid: number;
  isAlive: (pid: number) => boolean;
}

const liveCheck = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err?.code === "EPERM";
  }
};

export async function acquireLock(
  path: string,
  deps: LockDeps = { pid: process.pid, isAlive: liveCheck },
  fs: FsApi = realFs,
): Promise<LockHandle> {
  try {
    const existing = await fs.readFile(path, "utf8");
    const heldPid = Number.parseInt(existing.trim(), 10);
    if (Number.isFinite(heldPid) && deps.isAlive(heldPid)) {
      throw new LockHeldError(heldPid);
    }
  } catch (err: any) {
    if (err instanceof LockHeldError) throw err;
    if (err?.code !== "ENOENT") throw err;
  }
  await fs.writeFile(path, `${deps.pid}\n`, "utf8");
  return { path };
}

export async function releaseLock(path: string, fs: FsApi = realFs): Promise<void> {
  try {
    await fs.unlink(path);
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
  }
}
