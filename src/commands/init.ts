import { promises as realFs } from "node:fs";
import { join } from "node:path";
import type { FsApi } from "../fs/gitignore.js";
import { ensureGitignoreEntry } from "../fs/gitignore.js";

const SKELETON = `# crew.yaml — managed by crew
# appsDir: apps
apps:
  # example:
  #   repo: git@github.com:acme/example.git
  #   install: npm install
  #   run: npm run dev
`;

export interface InitResult {
  created: boolean;
}

export async function initCommand(projectRoot: string, fs: FsApi = realFs): Promise<InitResult> {
  const configPath = join(projectRoot, "crew.yaml");
  let exists = false;
  try {
    await fs.readFile(configPath, "utf8");
    exists = true;
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
  }
  if (!exists) {
    await fs.writeFile(configPath, SKELETON, "utf8");
  }
  await ensureGitignoreEntry(join(projectRoot, ".gitignore"), "apps/", fs);
  return { created: !exists };
}
