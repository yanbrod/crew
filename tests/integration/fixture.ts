import { execa } from "execa";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Fixture {
  tmp: string;
  bareRepo: string;
  projectRoot: string;
}

export async function makeFixture(appName = "demo"): Promise<Fixture> {
  const tmp = await mkdtemp(join(tmpdir(), "crew-"));
  const bareRepo = join(tmp, `${appName}.git`);
  const seed = join(tmp, `${appName}-seed`);
  const projectRoot = join(tmp, "project");

  await execa("git", ["init", "--bare", bareRepo]);
  await execa("git", ["init", seed]);
  await writeFile(join(seed, "README.md"), "hello\n", "utf8");
  await execa("git", ["-C", seed, "add", "."]);
  await execa("git", ["-C", seed, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"]);
  await execa("git", ["-C", seed, "branch", "-M", "main"]);
  await execa("git", ["-C", seed, "remote", "add", "origin", bareRepo]);
  await execa("git", ["-C", seed, "push", "-u", "origin", "main"]);

  await mkdir(projectRoot, { recursive: true });
  const yaml = `apps:\n  ${appName}:\n    repo: ${bareRepo}\n    install: node -e "require('fs').writeFileSync('installed.txt','ok')"\n    run: node -e "console.log('ran')"\n`;
  await writeFile(join(projectRoot, "crew.yaml"), yaml, "utf8");

  return { tmp, bareRepo, projectRoot };
}
