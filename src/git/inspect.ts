import { execa } from "execa";

export interface ExecResult {
  stdout: string;
  exitCode: number;
}

export interface ExecFn {
  (cmd: string, args: string[], opts: { cwd: string }): Promise<ExecResult>;
}

export const defaultExec: ExecFn = async (cmd, args, opts) => {
  const r = await execa(cmd, args, { cwd: opts.cwd, reject: false });
  return { stdout: r.stdout ?? "", exitCode: r.exitCode ?? 0 };
};

export interface GitState {
  currentBranch: string;
  upstream: string | null;
  isDirty: boolean;
  ahead: number;
  behind: number;
}

const git = (args: string[], dir: string, exec: ExecFn) =>
  exec("git", args, { cwd: dir });

export async function inspect(dir: string, exec: ExecFn = defaultExec): Promise<GitState> {
  const branchRes = await git(["rev-parse", "--abbrev-ref", "HEAD"], dir, exec);
  const currentBranch = branchRes.stdout.trim();

  let upstream: string | null = null;
  const up = await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], dir, exec);
  if (up.exitCode === 0 && up.stdout.trim().length > 0) upstream = up.stdout.trim();

  const status = await git(["status", "--porcelain"], dir, exec);
  const isDirty = status.stdout.trim().length > 0;

  let ahead = 0;
  let behind = 0;
  if (upstream) {
    const rl = await git(
      ["rev-list", "--left-right", "--count", `${upstream}...HEAD`],
      dir,
      exec,
    );
    const [b, a] = rl.stdout.trim().split(/\s+/).map((n) => Number.parseInt(n, 10));
    behind = Number.isFinite(b) ? b! : 0;
    ahead = Number.isFinite(a) ? a! : 0;
  }

  return { currentBranch, upstream, isDirty, ahead, behind };
}
