import { execa, type ResultPromise } from "execa";

export interface SpawnOpts {
  cwd: string;
  env?: Record<string, string>;
  stdio?: "inherit" | "pipe";
}

export function spawnShell(cmd: string, opts: SpawnOpts): ResultPromise {
  return execa(cmd, {
    shell: true,
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdio: opts.stdio ?? "pipe",
    reject: false,
  });
}
