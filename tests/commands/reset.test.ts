import { describe, expect, it, vi } from "vitest";
import { PassThrough } from "node:stream";
import {
  printResetBanner,
  resetCommand,
  type ResetTarget,
} from "../../src/commands/reset.js";
import type { GitState } from "../../src/git/inspect.js";
import type { Config } from "../../src/config/schema.js";

interface Captured {
  stream: PassThrough;
  text: () => string;
}

const capture = (): Captured => {
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on("data", (c) => chunks.push(c.toString()));
  return { stream, text: () => chunks.join("") };
};

const drain = async (s: PassThrough): Promise<string> => {
  const chunks: string[] = [];
  s.on("data", (c) => chunks.push(c.toString()));
  s.end();
  await new Promise<void>((res) => s.on("end", () => res()));
  return chunks.join("");
};

const mkState = (over: Partial<GitState> = {}): GitState => ({
  currentBranch: "main",
  upstream: "origin/main",
  isDirty: false,
  ahead: 0,
  behind: 0,
  ...over,
});

const mkConfig = (apps: Record<string, { repo?: string }> = { ui1: {} }): Config => ({
  apps: Object.fromEntries(
    Object.entries(apps).map(([n, a]) => [
      n,
      { repo: a.repo ?? "git@x:o/r.git", install: "echo i", run: "echo r" },
    ]),
  ),
}) as unknown as Config;

const toFwd = (p: string): string => p.replace(/\\/g, "/");

const mkFs = (clonedNames: string[]) =>
  ({
    readFile: vi.fn(async (path: string) => {
      const norm = toFwd(path);
      const cloned = clonedNames.some((n) => norm.includes(`/${n}/.git/HEAD`));
      if (!cloned) {
        const e: any = new Error("ENOENT");
        e.code = "ENOENT";
        throw e;
      }
      return "ref: refs/heads/main\n";
    }),
  }) as any;

describe("printResetBanner", () => {
  it("lists targets with their state, branch, ahead/behind, dirty marker", async () => {
    const out = new PassThrough();
    const targets: ResetTarget[] = [
      {
        name: "ui1",
        appDir: "/p/apps/ui1",
        state: mkState({ ahead: 2, behind: 1, isDirty: true }),
      },
      {
        name: "api",
        appDir: "/p/apps/api",
        state: mkState({ currentBranch: "develop", upstream: "origin/develop" }),
      },
    ];
    printResetBanner(targets, out);
    const text = await drain(out);
    expect(text).toContain("CREW RESET");
    expect(text).toContain("DESTRUCTIVE");
    expect(text).toContain("ui1");
    expect(text).toContain("api");
    expect(text).toContain("origin/main");
    expect(text).toContain("origin/develop");
    expect(text).toContain("dirty");
    expect(text).toContain(".gitignore");
    expect(text).toContain(".env");
    expect(text).toContain("node_modules");
  });
});

describe("resetCommand", () => {
  it("aborts when confirmation returns false and runs no destructive ops", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 0 }));
    const fetch = vi.fn(async () => ({ exitCode: 0 }));
    const inspectFn = vi.fn(async () => mkState());
    const confirm = vi.fn(async () => false);

    const cap = capture();
    const r = await resetCommand(
      "/p",
      mkConfig({ ui1: {} }),
      {},
      {
        fs: mkFs(["ui1"]),
        exec,
        fetch,
        inspect: inspectFn,
        confirm,
        out: cap.stream,
      },
    );

    expect(r.aborted).toBe(true);
    expect(r.reset).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
    expect(cap.text()).toContain("Aborted");
  });

  it("with --yes proceeds: fetches, hard-resets to upstream, runs clean -fd per app", async () => {
    const calls: string[][] = [];
    const exec = vi.fn(async (_cmd: string, args: string[]) => {
      calls.push(args);
      return { stdout: "", exitCode: 0 };
    });
    const fetch = vi.fn(async () => ({ exitCode: 0 }));
    const inspectFn = vi.fn(async () => mkState({ upstream: "origin/develop" }));

    const cap = capture();
    const r = await resetCommand(
      "/p",
      mkConfig({ ui1: {}, api: {} }),
      { yes: true },
      {
        fs: mkFs(["ui1", "api"]),
        exec,
        fetch,
        inspect: inspectFn,
        out: cap.stream,
      },
    );

    expect(r.aborted).toBe(false);
    expect(r.reset).toEqual(["ui1", "api"]);
    expect(r.failed).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([
      ["reset", "--hard", "origin/develop"],
      ["clean", "-fd"],
      ["reset", "--hard", "origin/develop"],
      ["clean", "-fd"],
    ]);
  });

  it("skips apps that are not cloned and apps without an upstream", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 0 }));
    const fetch = vi.fn(async () => ({ exitCode: 0 }));
    const inspectFn = vi.fn(async (dir: string) => {
      if (toFwd(dir).includes("/no-upstream")) return mkState({ upstream: null });
      return mkState();
    });
    const confirm = vi.fn(async () => true);

    const cap = capture();
    const r = await resetCommand(
      "/p",
      mkConfig({ ui1: {}, "no-upstream": {}, "not-cloned": {} }),
      {},
      {
        fs: mkFs(["ui1", "no-upstream"]),
        exec,
        fetch,
        inspect: inspectFn,
        confirm,
        out: cap.stream,
      },
    );

    expect(r.reset).toEqual(["ui1"]);
    const skippedNames = r.skipped.map((s) => s.name).sort();
    expect(skippedNames).toEqual(["no-upstream", "not-cloned"]);
    const noUpstream = r.skipped.find((s) => s.name === "no-upstream")!;
    expect(noUpstream.reason).toMatch(/upstream/);
  });

  it("reports failures when fetch exits non-zero and continues with the next app", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 0 }));
    const fetch = vi.fn(async (dir: string) => {
      if (toFwd(dir).includes("/ui1")) return { exitCode: 128, stderr: "fatal: bad remote" };
      return { exitCode: 0 };
    });
    const inspectFn = vi.fn(async () => mkState());

    const cap = capture();
    const r = await resetCommand(
      "/p",
      mkConfig({ ui1: {}, api: {} }),
      { yes: true },
      {
        fs: mkFs(["ui1", "api"]),
        exec,
        fetch,
        inspect: inspectFn,
        out: cap.stream,
      },
    );

    expect(r.failed.map((f) => f.name)).toEqual(["ui1"]);
    expect(r.failed[0]!.reason).toMatch(/fetch failed/);
    expect(r.reset).toEqual(["api"]);
  });

  it("respects --only", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 0 }));
    const fetch = vi.fn(async () => ({ exitCode: 0 }));
    const inspectFn = vi.fn(async () => mkState());

    const cap = capture();
    const r = await resetCommand(
      "/p",
      mkConfig({ ui1: {}, api: {} }),
      { yes: true, only: ["api"] },
      {
        fs: mkFs(["ui1", "api"]),
        exec,
        fetch,
        inspect: inspectFn,
        out: cap.stream,
      },
    );

    expect(r.reset).toEqual(["api"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
