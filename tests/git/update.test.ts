import { describe, expect, it, vi } from "vitest";
import { update } from "../../src/git/update.js";
import type { GitState } from "../../src/git/inspect.js";

const baseState = (over: Partial<GitState>): GitState => ({
  currentBranch: "main",
  upstream: "origin/main",
  isDirty: false,
  ahead: 0,
  behind: 0,
  ...over,
});

describe("update", () => {
  it("fetches, then merges ff-only when clean with upstream", async () => {
    const calls: string[][] = [];
    const exec = vi.fn(async (_cmd: string, args: string[]) => {
      calls.push(args);
      return { stdout: "", exitCode: 0 };
    });
    const inspect = vi.fn().mockResolvedValue(baseState({ behind: 2 }));

    const r = await update("/repo", { exec, inspect });
    expect(r.action).toBe("ff-pulled");
    expect(calls.map((a) => a.join(" "))).toEqual([
      "fetch",
      "merge --ff-only origin/main",
    ]);
  });

  it("fetches then skips when dirty", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 0 }));
    const inspect = vi.fn().mockResolvedValue(baseState({ isDirty: true }));
    const r = await update("/repo", { exec, inspect });
    expect(r.action).toBe("skipped");
    expect((r as any).reason).toMatch(/dirty/);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("fetches then skips when no upstream", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 0 }));
    const inspect = vi.fn().mockResolvedValue(baseState({ upstream: null }));
    const r = await update("/repo", { exec, inspect });
    expect(r.action).toBe("skipped");
    expect((r as any).reason).toMatch(/upstream/);
  });

  it("fetches then skips when ff is impossible (non-zero merge exit)", async () => {
    const exec = vi
      .fn<any>()
      .mockResolvedValueOnce({ stdout: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", exitCode: 128 });
    const inspect = vi.fn().mockResolvedValue(baseState({ ahead: 1, behind: 1 }));
    const r = await update("/repo", { exec, inspect });
    expect(r.action).toBe("skipped");
    expect((r as any).reason).toMatch(/non-fast-forward|non-ff/);
  });

  it("skips cleanly when already up to date (nothing to merge)", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 0 }));
    const inspect = vi.fn().mockResolvedValue(baseState({}));
    const r = await update("/repo", { exec, inspect });
    expect(r.action).toBe("up-to-date");
  });
});
