import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "./config/load.js";
import { initCommand } from "./commands/init.js";
import { syncCommand } from "./commands/sync.js";
import { startCommand } from "./commands/start.js";
import { upCommand } from "./commands/up.js";
import { statusCommand, printStatus } from "./commands/status.js";
import { AppsCliError } from "./errors.js";
import { findProjectRoot } from "./fs/paths.js";

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

async function main() {
  const program = new Command()
    .name("apps-cli")
    .description("Declarative multi-repo dev environment runner")
    .version("0.0.0");

  program
    .command("init")
    .description("create apps.yaml and ensure apps/ is gitignored")
    .action(async () => {
      try {
        const root = (await findProjectRoot(process.cwd())) ?? process.cwd();
        const r = await initCommand(root);
        process.stdout.write(r.created ? "apps.yaml created\n" : "apps.yaml already exists\n");
      } catch (err) { fail(err); }
    });

  const withConfig = async () => loadConfig(process.cwd());

  program
    .command("sync")
    .description("clone/update repos and install dependencies")
    .option("--only <names>", "comma-separated app names")
    .option("--force", "bypass install marker")
    .action(async (opts) => {
      try {
        const { projectRoot, config } = await withConfig();
        const r = await syncCommand(projectRoot, config, {
          only: parseOnly(opts.only), force: !!opts.force,
        });
        process.exit(r.failed.length === 0 ? 0 : 1);
      } catch (err) { fail(err); }
    });

  program
    .command("start")
    .description("run all apps in parallel with prefixed logs")
    .option("--only <names>", "comma-separated app names")
    .action(async (opts) => {
      try {
        const { projectRoot, config } = await withConfig();
        const code = await startCommand(projectRoot, config, { only: parseOnly(opts.only) });
        process.exit(code);
      } catch (err) { fail(err); }
    });

  program
    .command("up")
    .description("sync then start")
    .option("--only <names>", "comma-separated app names")
    .option("--force", "bypass install marker")
    .action(async (opts) => {
      try {
        const { projectRoot, config } = await withConfig();
        const code = await upCommand(projectRoot, config, {
          only: parseOnly(opts.only), force: !!opts.force,
        });
        process.exit(code);
      } catch (err) { fail(err); }
    });

  program
    .command("status")
    .description("show clone/branch/install status for each app")
    .action(async () => {
      try {
        const { projectRoot, config } = await withConfig();
        const rows = await statusCommand(projectRoot, config);
        printStatus(rows);
      } catch (err) { fail(err); }
    });

  await program.parseAsync(process.argv);
}

main();
