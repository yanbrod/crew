import { describe, expect, it } from "vitest";
import { inspect, type ExecFn } from "../../src/git/inspect.js";

const makeExec = (responses: Record<string, { stdout: string; exitCode: number }>): ExecFn =>
  async (_cmd, args) => {
    const key = args.join(" ");
    const r = responses[key];
    if (!r) throw new Error(`unexpected git args: ${key}`);
    if (r.exitCode !== 0) {
      const err: any = new Error("git failed");
      err.exitCode = r.exitCode;
      err.stderr = r.stdout;
      throw err;
    }
    return r;
  };

describe("inspect", () => {
  it("returns branch, upstream, ahead/behind, clean", async () => {
    const exec = makeExec({
      "rev-parse --abbrev-ref HEAD": { stdout: "main\n", exitCode: 0 },
      "rev-parse --abbrev-ref --symbolic-full-name @{u}": { stdout: "origin/main\n", exitCode: 0 },
      "status --porcelain": { stdout: "", exitCode: 0 },
      "rev-list --left-right --count origin/main...HEAD": { stdout: "2\t3\n", exitCode: 0 },
    });
    const r = await inspect("/repo", exec);
    expect(r).toEqual({
      currentBranch: "main",
      upstream: "origin/main",
      isDirty: false,
      behind: 2,
      ahead: 3,
    });
  });

  it("reports no upstream gracefully", async () => {
    const exec = makeExec({
      "rev-parse --abbrev-ref HEAD": { stdout: "feat-x\n", exitCode: 0 },
      "rev-parse --abbrev-ref --symbolic-full-name @{u}": { stdout: "", exitCode: 128 },
      "status --porcelain": { stdout: " M src/a.ts\n", exitCode: 0 },
    });
    const r = await inspect("/repo", exec);
    expect(r.currentBranch).toBe("feat-x");
    expect(r.upstream).toBeNull();
    expect(r.isDirty).toBe(true);
    expect(r.ahead).toBe(0);
    expect(r.behind).toBe(0);
  });
});
