import { promises as realFs } from "node:fs";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import chalk from "chalk";
import type { FsApi } from "../fs/gitignore.js";
import type { Config } from "../config/schema.js";
import { appsDirFor } from "../fs/paths.js";
import { clone } from "../git/clone.js";
import { update } from "../git/update.js";
import { spawnShell } from "../runner/spawn.js";
import { hashInstall, readMarker, writeMarker } from "../fs/installMarker.js";
import { InstallError } from "../errors.js";

export interface SyncOptions {
  only?: string[];
  force?: boolean;
}

export interface SyncFailure {
  name: string;
  reason: string;
}

export interface SyncResult {
  failed: SyncFailure[];
}

export async function syncCommand(
  projectRoot: string,
  config: Config,
  opts: SyncOptions = {},
  fs: FsApi = realFs,
): Promise<SyncResult> {
  const appsDir = appsDirFor(projectRoot, config.appsDir);
  await mkdir(appsDir, { recursive: true });

  const entries = Object.entries(config.apps).filter(
    ([name]) => !opts.only || opts.only.includes(name),
  );
  const failed: SyncFailure[] = [];

  for (const [name, app] of entries) {
    const appDir = join(appsDir, name);
    const workDir = app.cwd ? join(appDir, app.cwd) : appDir;
    try {
      let didClone = false;
      try {
        await fs.readFile(join(appDir, ".git", "HEAD"), "utf8");
      } catch (err: any) {
        if (err?.code !== "ENOENT") throw err;
        const cloneArgs = app.clone?.args ?? [];
        const argsLabel = cloneArgs.length > 0 ? ` (${cloneArgs.join(" ")})` : "";
        process.stdout.write(chalk.cyan(`[${name}] cloning ${app.repo}${argsLabel}\n`));
        await clone(app.repo, appDir, { args: cloneArgs });
        didClone = true;
      }

      if (!didClone) {
        const r = await update(appDir);
        if (r.action === "ff-pulled") process.stdout.write(chalk.cyan(`[${name}] fast-forwarded\n`));
        else if (r.action === "up-to-date") process.stdout.write(chalk.dim(`[${name}] up to date\n`));
        else if (r.action === "fetch-failed") process.stdout.write(chalk.yellow(`[${name}] fetch failed: ${r.reason}\n`));
        else process.stdout.write(chalk.yellow(`[${name}] skipped: ${r.reason}\n`));
      }

      const wanted = hashInstall(app.install);
      const current = await readMarker(appDir, fs);
      if (opts.force || current !== wanted) {
        process.stdout.write(chalk.cyan(`[${name}] installing (${app.install})\n`));
        const res = await spawnShell(app.install, { cwd: workDir, stdio: "inherit" });
        if (res.exitCode !== 0) {
          throw new InstallError(`install failed for ${name} (exit ${res.exitCode})`);
        }
        await writeMarker(appDir, wanted, fs);
      } else {
        process.stdout.write(chalk.dim(`[${name}] install marker up to date\n`));
      }
    } catch (err: any) {
      const reason = String(err?.message ?? err);
      process.stderr.write(chalk.red(`[${name}] ${reason}\n`));
      failed.push({ name, reason });
    }
  }

  return { failed };
}
