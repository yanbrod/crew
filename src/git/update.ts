import { type ExecFn, defaultExec, inspect as defaultInspect, type GitState } from "./inspect.js";

export type UpdateResult =
  | { action: "ff-pulled" }
  | { action: "up-to-date" }
  | { action: "skipped"; reason: string };

export interface UpdateDeps {
  exec?: ExecFn;
  inspect?: (dir: string) => Promise<GitState>;
}

export async function update(dir: string, deps: UpdateDeps = {}): Promise<UpdateResult> {
  const exec = deps.exec ?? defaultExec;
  const inspect = deps.inspect ?? ((d: string) => defaultInspect(d, exec));

  await exec("git", ["fetch"], { cwd: dir });

  const state = await inspect(dir);
  if (!state.upstream) return { action: "skipped", reason: "no upstream" };
  if (state.isDirty) return { action: "skipped", reason: "working tree dirty" };
  if (state.behind === 0) return { action: "up-to-date" };

  const merge = await exec("git", ["merge", "--ff-only", state.upstream], { cwd: dir });
  if (merge.exitCode !== 0) return { action: "skipped", reason: "non-fast-forward" };
  return { action: "ff-pulled" };
}
