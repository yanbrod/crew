import type { Config } from "../config/schema.js";
import { syncCommand, type SyncOptions } from "./sync.js";
import { startCommand, type StartOptions } from "./start.js";

export async function upCommand(
  projectRoot: string,
  config: Config,
  opts: SyncOptions & StartOptions = {},
): Promise<number> {
  const sync = await syncCommand(projectRoot, config, opts);
  if (sync.failed.length > 0) return 1;
  return startCommand(projectRoot, config, opts);
}
