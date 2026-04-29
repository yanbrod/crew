import { execa } from "execa";
import { GitError } from "../errors.js";

export interface CloneOptions {
  args?: string[];
}

export interface CloneRunner {
  (args: string[]): Promise<{ exitCode: number; stderr?: string }>;
}

const defaultRunner: CloneRunner = async (args) => {
  const r = await execa("git", args, { stdio: "inherit", reject: false });
  return { exitCode: r.exitCode ?? 0, stderr: typeof r.stderr === "string" ? r.stderr : "" };
};

export async function clone(
  repo: string,
  dest: string,
  opts: CloneOptions = {},
  run: CloneRunner = defaultRunner,
): Promise<void> {
  const extra = opts.args ?? [];
  const r = await run(["clone", ...extra, repo, dest]);
  if (r.exitCode !== 0) {
    const tail = (r.stderr ?? "").trim().split("\n").slice(-3).join(" ");
    const detail = tail.length > 0 ? `: ${tail}` : "";
    throw new GitError(`git clone failed for ${repo}${detail}`, {
      hint: "check the repo URL, your auth, network, and any clone.args",
    });
  }
}
