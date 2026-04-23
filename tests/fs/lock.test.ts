import { describe, expect, it, beforeEach } from "vitest";
import { vol } from "memfs";
import { acquireLock, releaseLock, LockHeldError } from "../../src/fs/lock.js";

const fs = vol.promises as unknown as typeof import("node:fs").promises;

describe("lock", () => {
  beforeEach(() => vol.reset());

  it("acquires when no lockfile exists", async () => {
    vol.fromJSON({ "/proj/apps/.keep": "" }, "/");
    const h = await acquireLock("/proj/apps/.apps-cli.lock", { pid: 123, isAlive: () => false }, fs);
    expect(h.path).toBe("/proj/apps/.apps-cli.lock");
    expect((vol.readFileSync("/proj/apps/.apps-cli.lock", "utf8") as string).trim()).toBe("123");
  });

  it("throws LockHeldError when PID in file is alive", async () => {
    vol.fromJSON({ "/proj/apps/.apps-cli.lock": "456\n" }, "/");
    await expect(
      acquireLock("/proj/apps/.apps-cli.lock", { pid: 123, isAlive: () => true }, fs),
    ).rejects.toBeInstanceOf(LockHeldError);
  });

  it("replaces stale lock when PID in file is not alive", async () => {
    vol.fromJSON({ "/proj/apps/.apps-cli.lock": "999\n" }, "/");
    const h = await acquireLock(
      "/proj/apps/.apps-cli.lock",
      { pid: 123, isAlive: () => false },
      fs,
    );
    expect((vol.readFileSync(h.path, "utf8") as string).trim()).toBe("123");
  });

  it("releaseLock removes the file", async () => {
    vol.fromJSON({ "/proj/apps/.apps-cli.lock": "123\n" }, "/");
    await releaseLock("/proj/apps/.apps-cli.lock", fs);
    expect(vol.existsSync("/proj/apps/.apps-cli.lock")).toBe(false);
  });
});
