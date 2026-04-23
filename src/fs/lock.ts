import { promises as realFs } from "node:fs";
import { AppsCliError } from "../errors.js";
import type { FsApi } from "./gitignore.js";

export class LockHeldError extends AppsCliError {
  readonly pid: number;
  constructor(pid: number) {
    super("RuntimeError", `another crew is running (pid ${pid})`, { hint: "wait for it to finish or delete the lockfile if stale" });
    this.pid = pid;
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
  const tryCreate = async () => {
    const fh = await (realFs as any).open(path, "wx");
    try {
      await fh.writeFile(`${deps.pid}\n`);
    } finally {
      await fh.close();
    }
  };

  try {
    await tryCreate();
    return { path };
  } catch (err: any) {
    if (err?.code !== "EEXIST") throw err;
  }

  // Lockfile exists — check the holder
  let holderPid = 0;
  try {
    const existing = await fs.readFile(path, "utf8");
    holderPid = Number.parseInt(existing.trim(), 10);
  } catch {
    // race: lock disappeared between our EEXIST and readFile. Try once more.
    await tryCreate();
    return { path };
  }

  if (Number.isFinite(holderPid) && deps.isAlive(holderPid)) {
    throw new LockHeldError(holderPid);
  }

  // Stale — remove and retry once
  await fs.unlink(path);
  await tryCreate();
  return { path };
}

export async function releaseLock(path: string, fs: FsApi = realFs): Promise<void> {
  try {
    await fs.unlink(path);
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
  }
}
