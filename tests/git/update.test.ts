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

const okFetch = () => vi.fn(async () => ({ exitCode: 0 }));

describe("update", () => {
  it("fetches, then merges ff-only when clean with upstream", async () => {
    const calls: string[][] = [];
    const exec = vi.fn(async (_cmd: string, args: string[]) => {
      calls.push(args);
      return { stdout: "", exitCode: 0 };
    });
    const inspect = vi.fn().mockResolvedValue(baseState({ behind: 2 }));
    const fetch = okFetch();

    const r = await update("/repo", { exec, inspect, fetch });
    expect(r.action).toBe("ff-pulled");
    expect(calls.map((a) => a.join(" "))).toEqual([
      "merge --ff-only origin/main",
    ]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("fetches then skips when dirty", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 0 }));
    const inspect = vi.fn().mockResolvedValue(baseState({ isDirty: true }));
    const r = await update("/repo", { exec, inspect, fetch: okFetch() });
    expect(r.action).toBe("skipped");
    expect((r as any).reason).toMatch(/dirty/);
    expect(exec).not.toHaveBeenCalled();
  });

  it("fetches then skips when no upstream", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 0 }));
    const inspect = vi.fn().mockResolvedValue(baseState({ upstream: null }));
    const r = await update("/repo", { exec, inspect, fetch: okFetch() });
    expect(r.action).toBe("skipped");
    expect((r as any).reason).toMatch(/upstream/);
  });

  it("fetches then skips when ff is impossible (non-zero merge exit)", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 128 }));
    const inspect = vi.fn().mockResolvedValue(baseState({ ahead: 1, behind: 1 }));
    const r = await update("/repo", { exec, inspect, fetch: okFetch() });
    expect(r.action).toBe("skipped");
    expect((r as any).reason).toMatch(/non-fast-forward|non-ff/);
  });

  it("skips cleanly when already up to date (nothing to merge)", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 0 }));
    const inspect = vi.fn().mockResolvedValue(baseState({}));
    const r = await update("/repo", { exec, inspect, fetch: okFetch() });
    expect(r.action).toBe("up-to-date");
  });

  it("returns fetch-failed when git fetch exits non-zero", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 0 }));
    const inspect = vi.fn().mockResolvedValue(baseState({}));
    const fetch = vi.fn(async () => ({ exitCode: 128 }));
    const r = await update("/repo", { exec, inspect, fetch });
    expect(r.action).toBe("fetch-failed");
    expect(inspect).not.toHaveBeenCalled();
  });
});
