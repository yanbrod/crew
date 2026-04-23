import { Command } from "commander";
import { join, dirname } from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { execa } from "execa";
import yaml from "js-yaml";
import { loadConfig, type LoadedConfig } from "./config/load.js";
import { ConfigSchema } from "./config/schema.js";
import { initCommand } from "./commands/init.js";
import { syncCommand } from "./commands/sync.js";
import { startCommand } from "./commands/start.js";
import { upCommand } from "./commands/up.js";
import { statusCommand, printStatus } from "./commands/status.js";
import { AppsCliError, ConfigError, GitError } from "./errors.js";
import { findProjectRoot, appsDirFor } from "./fs/paths.js";
import { acquireLock, releaseLock } from "./fs/lock.js";

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
) as { version: string };

function parseOnly(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function fail(err: unknown): never {
  if (err instanceof AppsCliError) {
    process.stderr.write(chalk.red(`${err.code}: ${err.message}\n`));
    if (err.hint) process.stderr.write(chalk.dim(`hint: ${err.hint}\n`));
  } else {
    process.stderr.write(chalk.red(`error: ${(err as Error)?.message ?? err}\n`));
  }
  process.exit(1);
}

async function gitPreflight(): Promise<void> {
  try {
    await execa("git", ["--version"]);
  } catch {
    throw new GitError("git not found in PATH", { hint: "install git and retry" });
  }
}

async function loadFromExplicitPath(configPath: string): Promise<LoadedConfig> {
  const raw = await readFile(configPath, "utf8");
  const parsed = yaml.load(raw);
  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ConfigError(`crew.yaml invalid — ${issues}`);
  }
  return { projectRoot: dirname(configPath), config: result.data };
}

async function getConfig(opts: { config?: string }): Promise<LoadedConfig> {
  if (opts.config) return loadFromExplicitPath(opts.config);
  return loadConfig(process.cwd());
}

async function withLockAndRun<T>(
  projectRoot: string,
  appsDirPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  await mkdir(appsDirPath, { recursive: true });
  const lockPath = join(appsDirPath, ".crew.lock");
  const lock = await acquireLock(lockPath);
  try {
    return await fn();
  } finally {
    await releaseLock(lock.path);
  }
}

async function main() {
  const program = new Command()
    .name("crew")
    .description("Declarative runner for multi-repo local dev environments — compose without containers")
    .version(pkg.version)
    .option("--config <path>", "explicit path to crew.yaml");

  program
    .command("init")
    .description("create crew.yaml and ensure apps/ is gitignored")
    .action(async () => {
      try {
        const root = (await findProjectRoot(process.cwd())) ?? process.cwd();
        const r = await initCommand(root);
        process.stdout.write(r.created ? "crew.yaml created\n" : "crew.yaml already exists\n");
      } catch (err) { fail(err); }
    });

  program
    .command("sync")
    .description("clone/update repos and install dependencies")
    .option("--only <names>", "comma-separated app names")
    .option("--force", "bypass install marker")
    .action(async (cmdOpts) => {
      const rootOpts = program.opts() as { config?: string };
      try {
        await gitPreflight();
        const { projectRoot, config } = await getConfig(rootOpts);
        const appsDir = appsDirFor(projectRoot, config.appsDir);
        const r = await withLockAndRun(projectRoot, appsDir, () =>
          syncCommand(projectRoot, config, {
            only: parseOnly(cmdOpts.only), force: !!cmdOpts.force,
          }),
        );
        process.exit(r.failed.length === 0 ? 0 : 1);
      } catch (err) { fail(err); }
    });

  program
    .command("start")
    .description("run all apps in parallel with prefixed logs")
    .option("--only <names>", "comma-separated app names")
    .action(async (cmdOpts) => {
      const rootOpts = program.opts() as { config?: string };
      try {
        await gitPreflight();
        const { projectRoot, config } = await getConfig(rootOpts);
        const appsDir = appsDirFor(projectRoot, config.appsDir);
        const code = await withLockAndRun(projectRoot, appsDir, () =>
          startCommand(projectRoot, config, { only: parseOnly(cmdOpts.only) }),
        );
        process.exit(code);
      } catch (err) { fail(err); }
    });

  program
    .command("up")
    .description("sync then start")
    .option("--only <names>", "comma-separated app names")
    .option("--force", "bypass install marker")
    .action(async (cmdOpts) => {
      const rootOpts = program.opts() as { config?: string };
      try {
        await gitPreflight();
        const { projectRoot, config } = await getConfig(rootOpts);
        const appsDir = appsDirFor(projectRoot, config.appsDir);
        const code = await withLockAndRun(projectRoot, appsDir, () =>
          upCommand(projectRoot, config, {
            only: parseOnly(cmdOpts.only), force: !!cmdOpts.force,
          }),
        );
        process.exit(code);
      } catch (err) { fail(err); }
    });

  program
    .command("status")
    .description("show clone/branch/install status for each app")
    .action(async () => {
      const rootOpts = program.opts() as { config?: string };
      try {
        await gitPreflight();
        const { projectRoot, config } = await getConfig(rootOpts);
        const rows = await statusCommand(projectRoot, config);
        printStatus(rows);
      } catch (err) { fail(err); }
    });

  await program.parseAsync(process.argv);
}

main();
