import { promises as realFs } from "node:fs";
import yaml from "js-yaml";
import { ConfigError } from "../errors.js";
import type { FsApi } from "../fs/gitignore.js";
import { configPath, findProjectRoot } from "../fs/paths.js";
import { ConfigSchema, type Config } from "./schema.js";

export interface LoadedConfig {
  projectRoot: string;
  config: Config;
}

export async function loadConfig(cwd: string, fs: FsApi = realFs): Promise<LoadedConfig> {
  const projectRoot = await findProjectRoot(cwd, fs);
  if (!projectRoot) {
    throw new ConfigError("no crew.yaml found", { hint: "run `crew init`" });
  }
  const raw = await fs.readFile(configPath(projectRoot), "utf8");
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err: any) {
    throw new ConfigError(`crew.yaml parse failed: ${err?.message ?? err}`);
  }
  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new ConfigError(`crew.yaml invalid — ${issues}`);
  }
  return { projectRoot, config: result.data };
}
