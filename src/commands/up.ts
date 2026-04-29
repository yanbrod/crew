import chalk from "chalk";
import type { Config } from "../config/schema.js";
import { syncCommand, type SyncFailure, type SyncOptions } from "./sync.js";
import { startCommand, type StartOptions } from "./start.js";

export interface UpDeps {
  out?: NodeJS.WritableStream;
}

export async function upCommand(
  projectRoot: string,
  config: Config,
  opts: SyncOptions & StartOptions = {},
  deps: UpDeps = {},
): Promise<number> {
  const sync = await syncCommand(projectRoot, config, opts);
  if (sync.failed.length > 0) {
    printAbortBanner(sync.failed, deps.out ?? process.stderr);
    return 1;
  }
  return startCommand(projectRoot, config, opts);
}

export function printAbortBanner(
  failed: SyncFailure[],
  out: NodeJS.WritableStream = process.stderr,
): void {
  const bar = "═".repeat(72);
  const lines: string[] = [];
  lines.push("");
  lines.push(chalk.red.bold(bar));
  lines.push(chalk.red.bold("✖  CREW UP ABORTED"));
  lines.push(chalk.red.bold(bar));
  lines.push(
    chalk.red(
      `Failed to prepare ${failed.length} app(s). Dev servers were NOT started.`,
    ),
  );
  lines.push("");
  for (const f of failed) {
    lines.push(chalk.red.bold(`  ✖ ${f.name}`));
    for (const ln of f.reason.split("\n")) {
      lines.push(chalk.red(`      ${ln}`));
    }
  }
  lines.push("");
  lines.push(
    chalk.yellow(
      "Fix the issue(s) above, then run `crew up` (or `crew sync`) again.",
    ),
  );
  lines.push(chalk.red.bold(bar));
  lines.push("");
  out.write(lines.join("\n"));
}
