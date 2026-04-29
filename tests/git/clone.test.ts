import { describe, expect, it, vi } from "vitest";
import { clone, type CloneRunner } from "../../src/git/clone.js";
import { GitError } from "../../src/errors.js";

describe("clone", () => {
  it("invokes git clone with repo and dest when no extra args given", async () => {
    const seen: string[][] = [];
    const run: CloneRunner = vi.fn(async (args: string[]) => {
      seen.push(args);
      return { exitCode: 0 };
    });
    await clone("git@host:org/repo.git", "/dest", {}, run);
    expect(run).toHaveBeenCalledOnce();
    expect(seen[0]).toEqual([
      "clone",
      "git@host:org/repo.git",
      "/dest",
    ]);
  });

  it("passes extra args through between 'clone' and the repo URL", async () => {
    const seen: string[][] = [];
    const run: CloneRunner = vi.fn(async (args: string[]) => {
      seen.push(args);
      return { exitCode: 0 };
    });
    await clone(
      "git@host:org/repo.git",
      "/dest",
      { args: ["--recurse-submodules", "--depth=1"] },
      run,
    );
    expect(seen[0]).toEqual([
      "clone",
      "--recurse-submodules",
      "--depth=1",
      "git@host:org/repo.git",
      "/dest",
    ]);
  });

  it("throws GitError with stderr tail on non-zero exit", async () => {
    const run: CloneRunner = async () => ({
      exitCode: 128,
      stderr: "Cloning into '/dest'...\nfatal: repository not found",
    });
    await expect(
      clone("git@host:org/missing.git", "/dest", {}, run),
    ).rejects.toBeInstanceOf(GitError);
    await expect(
      clone("git@host:org/missing.git", "/dest", {}, run),
    ).rejects.toThrow(/repository not found/);
  });
});
