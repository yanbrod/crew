import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { acquireLock, releaseLock, LockHeldError } from "../../src/fs/lock.js";

describe("lock", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "lock-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("acquires when no lockfile exists", async () => {
    const p = join(dir, ".apps-cli.lock");
    const h = await acquireLock(p, { pid: 123, isAlive: () => false });
    expect(h.path).toBe(p);
    expect((await readFile(p, "utf8")).trim()).toBe("123");
  });

  it("throws LockHeldError when PID in file is alive", async () => {
    const p = join(dir, ".apps-cli.lock");
    await writeFile(p, "456\n", "utf8");
    await expect(
      acquireLock(p, { pid: 123, isAlive: () => true }),
    ).rejects.toBeInstanceOf(LockHeldError);
  });

  it("replaces stale lock when PID in file is not alive", async () => {
    const p = join(dir, ".apps-cli.lock");
    await writeFile(p, "999\n", "utf8");
    const h = await acquireLock(p, { pid: 123, isAlive: () => false });
    expect((await readFile(h.path, "utf8")).trim()).toBe("123");
  });

  it("releaseLock removes the file", async () => {
    const p = join(dir, ".apps-cli.lock");
    await writeFile(p, "123\n", "utf8");
    await releaseLock(p);
    expect(existsSync(p)).toBe(false);
  });
});
