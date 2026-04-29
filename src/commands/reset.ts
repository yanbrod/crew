import { promises as realFs } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import chalk from "chalk";
import type { FsApi } from "../fs/gitignore.js";
import type { Config } from "../config/schema.js";
import { appsDirFor } from "../fs/paths.js";
import { defaultExec, inspect, type ExecFn, type GitState } from "../git/inspect.js";

export interface ResetOptions {
  only?: string[];
  yes?: boolean;
}

export interface ResetTarget {
  name: string;
  appDir: string;
  state: GitState;
}

export interface ResetFailure {
  name: string;
  reason: string;
}

export interface ResetResult {
  reset: string[];
  skipped: { name: string; reason: string }[];
  failed: ResetFailure[];
  aborted: boolean;
}

export interface ResetDeps {
  fs?: FsApi;
  exec?: ExecFn;
  fetch?: (dir: string) => Promise<{ exitCode: number; stderr?: string }>;
  inspect?: (dir: string, exec: ExecFn) => Promise<GitState>;
  confirm?: (targets: ResetTarget[], out: NodeJS.WritableStream) => Promise<boolean>;
  out?: NodeJS.WritableStream;
}

const defaultFetch = async (dir: string) => {
  const r = await execa("git", ["fetch"], { cwd: dir, reject: false });
  return { exitCode: r.exitCode ?? 0, stderr: typeof r.stderr === "string" ? r.stderr : "" };
};

export async function resetCommand(
  projectRoot: string,
  config: Config,
  opts: ResetOptions = {},
  deps: ResetDeps = {},
): Promise<ResetResult> {
  const fs = deps.fs ?? realFs;
  const exec = deps.exec ?? defaultExec;
  const fetch = deps.fetch ?? defaultFetch;
  const probe = deps.inspect ?? inspect;
  const confirm = deps.confirm ?? confirmFromStdin;
  const out = deps.out ?? process.stdout;

  const appsDir = appsDirFor(projectRoot, config.appsDir);

  const entries = Object.entries(config.apps).filter(
    ([name]) => !opts.only || opts.only.includes(name),
  );

  const targets: ResetTarget[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const [name] of entries) {
    const appDir = join(appsDir, name);
    let cloned = false;
    try {
      await fs.readFile(join(appDir, ".git", "HEAD"), "utf8");
      cloned = true;
    } catch (err: any) {
      if (err?.code !== "ENOENT") throw err;
    }
    if (!cloned) {
      skipped.push({ name, reason: "not cloned" });
      continue;
    }
    const state = await probe(appDir, exec);
    if (!state.upstream) {
      skipped.push({ name, reason: "no upstream — refusing to reset" });
      continue;
    }
    targets.push({ name, appDir, state });
  }

  if (targets.length === 0) {
    out.write(chalk.yellow("Nothing to reset.\n"));
    for (const s of skipped) {
      out.write(chalk.dim(`  • ${s.name}: ${s.reason}\n`));
    }
    return { reset: [], skipped, failed: [], aborted: false };
  }

  printResetBanner(targets, out);

  if (!opts.yes) {
    const ok = await confirm(targets, out);
    if (!ok) {
      out.write(chalk.yellow("\nAborted. Nothing was changed.\n"));
      return { reset: [], skipped, failed: [], aborted: true };
    }
  } else {
    out.write(chalk.dim("\n--yes flag set — proceeding without prompt.\n\n"));
  }

  const reset: string[] = [];
  const failed: ResetFailure[] = [];

  for (const t of targets) {
    out.write(chalk.cyan(`[${t.name}] fetching\n`));
    const f = await fetch(t.appDir);
    if (f.exitCode !== 0) {
      const tail = (f.stderr ?? "").trim().split("\n").slice(-1).join(" ");
      failed.push({ name: t.name, reason: `git fetch failed${tail ? `: ${tail}` : ""}` });
      continue;
    }

    out.write(chalk.cyan(`[${t.name}] reset --hard ${t.state.upstream}\n`));
    const reset1 = await exec("git", ["reset", "--hard", t.state.upstream!], { cwd: t.appDir });
    if (reset1.exitCode !== 0) {
      failed.push({
        name: t.name,
        reason: `git reset --hard ${t.state.upstream} failed (exit ${reset1.exitCode})`,
      });
      continue;
    }

    out.write(chalk.cyan(`[${t.name}] clean -fd (untracked, non-ignored)\n`));
    const clean = await exec("git", ["clean", "-fd"], { cwd: t.appDir });
    if (clean.exitCode !== 0) {
      failed.push({
        name: t.name,
        reason: `git clean -fd failed (exit ${clean.exitCode})`,
      });
      continue;
    }

    reset.push(t.name);
    out.write(chalk.green(`[${t.name}] done\n`));
  }

  if (failed.length > 0) {
    out.write("\n");
    out.write(chalk.red.bold(`✖ ${failed.length} app(s) failed during reset:\n`));
    for (const f of failed) {
      out.write(chalk.red(`  • ${f.name}: ${f.reason}\n`));
    }
  }

  return { reset, skipped, failed, aborted: false };
}

export function printResetBanner(
  targets: ResetTarget[],
  out: NodeJS.WritableStream = process.stdout,
): void {
  const bar = "═".repeat(72);
  const lines: string[] = [];
  lines.push("");
  lines.push(chalk.red.bold(bar));
  lines.push(chalk.red.bold("⚠  CREW RESET — DESTRUCTIVE ACTION"));
  lines.push(chalk.red.bold(bar));
  lines.push("");
  lines.push(chalk.red("This will permanently DESTROY the following in each repo below:"));
  lines.push(chalk.red("  • any local commits that are not on the upstream branch"));
  lines.push(chalk.red("  • any uncommitted changes to tracked files"));
  lines.push(chalk.red("  • any untracked files NOT covered by .gitignore"));
  lines.push("");
  lines.push(chalk.green("This will be PRESERVED (kept untouched):"));
  lines.push(chalk.green("  • files matched by .gitignore (e.g. .env, node_modules, dist)"));
  lines.push("");
  lines.push(chalk.yellow.bold(`${targets.length} repo(s) will be reset:`));
  for (const t of targets) {
    const dirty = t.state.isDirty ? chalk.red(" dirty") : "";
    const ab = ` ↑${t.state.ahead} ↓${t.state.behind}`;
    lines.push(
      `  ${chalk.bold(t.name)}  ${chalk.cyan(t.state.currentBranch)} → ${chalk.cyan(t.state.upstream ?? "?")}${ab}${dirty}`,
    );
  }
  lines.push("");
  lines.push(chalk.red.bold(bar));
  out.write(lines.join("\n") + "\n");
}

export async function confirmFromStdin(
  _targets: ResetTarget[],
  out: NodeJS.WritableStream,
): Promise<boolean> {
  out.write(chalk.yellow.bold(`Type "yes" to proceed, anything else aborts: `));
  const answer = await readLineFromStdin();
  return answer.trim().toLowerCase() === "yes";
}

function readLineFromStdin(): Promise<string> {
  return new Promise((resolve) => {
    let buf = "";
    const onData = (chunk: Buffer | string) => {
      buf += chunk.toString();
      const idx = buf.indexOf("\n");
      if (idx >= 0) {
        process.stdin.off("data", onData);
        process.stdin.pause();
        resolve(buf.slice(0, idx));
      }
    };
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}
