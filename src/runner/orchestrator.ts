import { createPrefixedTee, colorFor } from "../log.js";
import treeKill from "tree-kill";

export interface ChildHandle {
  pid: number | undefined;
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  exitCode: number | null;
  on(event: "exit", listener: (code: number | null) => void): void;
}

export interface AppRun {
  name: string;
  cmd: string;
  cwd: string;
  env: Record<string, string>;
}

export interface SpawnFn {
  (cmd: string, opts: { cwd: string; env: Record<string, string> }): ChildHandle;
}

export interface KillFn {
  (pid: number, signal: "SIGTERM" | "SIGKILL"): void;
}

export interface OrchestratorOpts {
  apps: AppRun[];
  spawnFn: SpawnFn;
  killFn?: KillFn;
  out?: { write: (chunk: string) => boolean };
  installSignals?: boolean;
  color?: (index: number) => (text: string) => string;
  graceMs?: number;
}

export interface OrchestratorResult {
  exitCode: number;
}

export interface OrchestratorHandle {
  done: Promise<OrchestratorResult>;
  shutdown: (signal: "SIGINT" | "SIGTERM") => void;
}

const defaultKill: KillFn = (pid, signal) => treeKill(pid, signal);

export function runAllHandle(opts: OrchestratorOpts): OrchestratorHandle {
  const kill = opts.killFn ?? defaultKill;
  const out = opts.out ?? { write: (c: string) => process.stdout.write(c) };
  const colorPick = opts.color ?? colorFor;
  const graceMs = opts.graceMs ?? 5000;

  const children = opts.apps.map((app, i) => {
    const child = opts.spawnFn(app.cmd, { cwd: app.cwd, env: app.env });
    const color = colorPick(i);
    if (child.stdout) child.stdout.pipe(createPrefixedTee({ name: app.name, color, out }));
    if (child.stderr) child.stderr.pipe(createPrefixedTee({ name: app.name, color, out }));
    return { app, child };
  });

  let shuttingDown = false;
  // Only set when triggered externally (OS signal or handle.shutdown)
  let externalSignal: "SIGINT" | "SIGTERM" | null = null;
  let firstFailure = false;

  const alive = new Set(children);

  const done = new Promise<OrchestratorResult>((resolve) => {
    const tryFinish = () => {
      if (alive.size === 0) {
        if (externalSignal === "SIGINT") resolve({ exitCode: 130 });
        else if (externalSignal === "SIGTERM") resolve({ exitCode: 143 });
        else resolve({ exitCode: firstFailure ? 1 : 0 });
      }
    };

    for (const c of children) {
      c.child.on("exit", (code) => {
        alive.delete(c);
        const failed = (code ?? 0) !== 0;
        if (!shuttingDown) {
          out.write(`[${c.app.name}] exited with code ${code}\n`);
          if (failed) {
            firstFailure = true;
            // Internal child-exit triggered shutdown — does NOT set externalSignal
            shutdown("child-exit");
          }
        }
        tryFinish();
      });
    }
  });

  function shutdown(cause: "child-exit" | "SIGINT" | "SIGTERM") {
    if (shuttingDown) return;
    shuttingDown = true;
    // Only record signal if this is an externally triggered shutdown
    if (cause !== "child-exit") {
      externalSignal = cause;
    }
    for (const c of children) {
      if (c.child.pid !== undefined && c.child.exitCode === null) {
        kill(c.child.pid, "SIGTERM");
      }
    }
    setTimeout(() => {
      for (const c of children) {
        if (c.child.pid !== undefined && c.child.exitCode === null) {
          kill(c.child.pid, "SIGKILL");
        }
      }
    }, graceMs);
  }

  if (opts.installSignals !== false) {
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  }

  const publicShutdown = (signal: "SIGINT" | "SIGTERM") => shutdown(signal);

  return { done, shutdown: publicShutdown };
}

export async function runAll(opts: OrchestratorOpts): Promise<OrchestratorResult> {
  return runAllHandle(opts).done;
}
