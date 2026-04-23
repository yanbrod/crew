import { promises as realFs } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import type { FsApi } from "../fs/gitignore.js";
import type { Config } from "../config/schema.js";
import { inspect } from "../git/inspect.js";
import { appsDirFor } from "../fs/paths.js";
import { readMarker, hashInstall } from "../fs/installMarker.js";

export interface StatusRow {
  name: string;
  cloned: boolean;
  branch?: string;
  dirty?: boolean;
  ahead?: number;
  behind?: number;
  markerOk?: boolean;
}

export async function statusCommand(
  projectRoot: string,
  config: Config,
  fs: FsApi = realFs,
): Promise<StatusRow[]> {
  const appsDir = appsDirFor(projectRoot, config.appsDir);
  const rows: StatusRow[] = [];
  for (const [name, app] of Object.entries(config.apps)) {
    const appDir = join(appsDir, name);
    let cloned = false;
    try {
      await fs.readFile(join(appDir, ".git", "HEAD"), "utf8");
      cloned = true;
    } catch {
      cloned = false;
    }
    if (!cloned) {
      rows.push({ name, cloned: false });
      continue;
    }
    const state = await inspect(appDir);
    const marker = await readMarker(appDir, fs);
    const markerOk = marker === hashInstall(app.install);
    rows.push({
      name,
      cloned: true,
      branch: state.currentBranch,
      dirty: state.isDirty,
      ahead: state.ahead,
      behind: state.behind,
      markerOk,
    });
  }
  return rows;
}

export function printStatus(rows: StatusRow[], out = process.stdout): void {
  for (const r of rows) {
    if (!r.cloned) {
      out.write(`${chalk.yellow("•")} ${r.name}  ${chalk.dim("not cloned")}\n`);
      continue;
    }
    const dirty = r.dirty ? chalk.red(" dirty") : "";
    const ab = ` ↑${r.ahead} ↓${r.behind}`;
    const mk = r.markerOk ? chalk.dim(" installed") : chalk.yellow(" install needed");
    out.write(`${chalk.green("•")} ${r.name}  ${r.branch}${ab}${dirty}${mk}\n`);
  }
}
