import { promises as realFs } from "node:fs";

export type FsApi = Pick<typeof realFs, "readFile" | "writeFile" | "unlink">;

export async function ensureGitignoreEntry(
  path: string,
  entry: string,
  fs: FsApi = realFs,
): Promise<void> {
  let current = "";
  try {
    current = await fs.readFile(path, "utf8");
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
  }
  const hasEntry = current
    .split(/\r?\n/)
    .some((line) => line.trim() === entry.trim());
  if (hasEntry) return;
  const needsNewline = current.length > 0 && !current.endsWith("\n");
  const next = (needsNewline ? current + "\n" : current) + entry + "\n";
  await fs.writeFile(path, next, "utf8");
}
