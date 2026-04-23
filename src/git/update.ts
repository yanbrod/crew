import { execa } from "execa";
import { type ExecFn, defaultExec, inspect as defaultInspect, type GitState } from "./inspect.js";

export type UpdateResult =
  | { action: "ff-pulled" }
  | { action: "up-to-date" }
  | { action: "skipped"; reason: string }
  | { action: "fetch-failed"; reason: string };

export interface UpdateDeps {
  exec?: ExecFn;
  inspect?: (dir: string) => Promise<GitState>;
  fetch?: (dir: string) => Promise<{ exitCode: number }>;
}

const defaultFetch = async (dir: string): Promise<{ exitCode: number }> => {
  const r = await execa("git", ["fetch"], { cwd: dir, stdio: "inherit", reject: false });
  return { exitCode: r.exitCode ?? 0 };
};

export async function update(dir: string, deps: UpdateDeps = {}): Promise<UpdateResult> {
  const exec = deps.exec ?? defaultExec;
  const inspect = deps.inspect ?? ((d: string) => defaultInspect(d, exec));
  const fetch = deps.fetch ?? defaultFetch;

  const fetchResult = await fetch(dir);
  if (fetchResult.exitCode !== 0) {
    return { action: "fetch-failed", reason: `git fetch exited with code ${fetchResult.exitCode}` };
  }

  const state = await inspect(dir);
  if (!state.upstream) return { action: "skipped", reason: "no upstream" };
  if (state.isDirty) return { action: "skipped", reason: "working tree dirty" };
  if (state.behind === 0) return { action: "up-to-date" };

  const merge = await exec("git", ["merge", "--ff-only", state.upstream], { cwd: dir });
  if (merge.exitCode !== 0) return { action: "skipped", reason: "non-fast-forward" };
  return { action: "ff-pulled" };
}
