import { promises as realFs } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import type { FsApi } from "../fs/gitignore.js";
import type { Config } from "../config/schema.js";
import { appsDirFor } from "../fs/paths.js";
import { runAll, type AppRun, type ChildHandle, type SpawnFn } from "../runner/orchestrator.js";
import { spawnShell } from "../runner/spawn.js";
import { RuntimeError } from "../errors.js";

export interface StartOptions {
  only?: string[];
}

const defaultSpawn: SpawnFn = (cmd, opts) => {
  const proc = spawnShell(cmd, { cwd: opts.cwd, env: opts.env, stdio: "pipe" });
  return {
    pid: (proc as any).pid,
    stdout: (proc as any).stdout,
    stderr: (proc as any).stderr,
    get exitCode() { return (proc as any).exitCode ?? null; },
    on: (ev, cb) => { (proc as any).on(ev, cb); },
  } as ChildHandle;
};

export async function startCommand(
  projectRoot: string,
  config: Config,
  opts: StartOptions = {},
  fs: FsApi = realFs,
): Promise<number> {
  const appsDir = appsDirFor(projectRoot, config.appsDir);
  const entries = Object.entries(config.apps).filter(
    ([name]) => !opts.only || opts.only.includes(name),
  );

  for (const [name] of entries) {
    const appDir = join(appsDir, name);
    try {
      await fs.readFile(join(appDir, ".git", "HEAD"), "utf8");
    } catch {
      throw new RuntimeError(`${name} not synced`, {
        hint: "run `apps-cli sync` first",
      });
    }
  }

  const apps: AppRun[] = entries.map(([name, app]) => ({
    name,
    cmd: app.run,
    cwd: app.cwd ? join(appsDir, name, app.cwd) : join(appsDir, name),
    env: app.env ?? {},
  }));

  process.stdout.write(chalk.bold(`Starting ${apps.length} app(s)\n`));
  const result = await runAll({ apps, spawnFn: defaultSpawn, installSignals: true });
  return result.exitCode;
}
