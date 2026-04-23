import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { runAll, runAllHandle, type ChildHandle } from "../../src/runner/orchestrator.js";

function fakeChild(pid: number) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const emitter = new EventEmitter();
  let exitCode: number | null = null;
  const handle: ChildHandle = {
    pid,
    stdout,
    stderr,
    on: (ev, cb) => { emitter.on(ev, cb); },
    get exitCode() { return exitCode; },
  };
  return {
    handle,
    stdout,
    stderr,
    exit: (code: number) => { exitCode = code; emitter.emit("exit", code); },
  };
}

describe("orchestrator", () => {
  it("any child exit triggers shutdown of siblings with exit 1", async () => {
    const a = fakeChild(10);
    const b = fakeChild(11);
    const spawnFn = vi.fn()
      .mockReturnValueOnce(a.handle)
      .mockReturnValueOnce(b.handle);
    const killFn = vi.fn();
    const out: string[] = [];

    const donePromise = runAll({
      apps: [
        { name: "api", cmd: "cmd-a", cwd: "/apps/api", env: {} },
        { name: "web", cmd: "cmd-b", cwd: "/apps/web", env: {} },
      ],
      spawnFn,
      killFn,
      out: { write: (c: string) => { out.push(c); return true; } },
      installSignals: false,
      color: (_i) => (s) => s,
      graceMs: 10,
    });

    a.stdout.write("ready\n");
    b.stdout.write("listening\n");
    a.exit(0);  // clean exit — but still triggers shutdown of siblings
    await new Promise((r) => setTimeout(r, 5));
    b.exit(143); // simulate the SIGTERM actually killing b
    const r = await donePromise;
    expect(r.exitCode).toBe(1);
    expect(out.join("")).toContain("[api] ready\n");
    expect(out.join("")).toContain("[web] listening\n");
    expect(killFn).toHaveBeenCalledWith(11, "SIGTERM");
  });

  it("kills all children when one exits non-zero and resolves with 1", async () => {
    const a = fakeChild(20);
    const b = fakeChild(21);
    const spawnFn = vi.fn().mockReturnValueOnce(a.handle).mockReturnValueOnce(b.handle);
    const killFn = vi.fn();

    const donePromise = runAll({
      apps: [
        { name: "api", cmd: "x", cwd: "/a", env: {} },
        { name: "web", cmd: "y", cwd: "/w", env: {} },
      ],
      spawnFn,
      killFn,
      out: { write: () => true },
      installSignals: false,
      color: (_i) => (s) => s,
      graceMs: 10,
    });

    a.exit(1);
    await new Promise((r) => setTimeout(r, 5));
    b.exit(143);

    const r = await donePromise;
    expect(r.exitCode).toBe(1);
    expect(killFn).toHaveBeenCalledWith(21, "SIGTERM");
  });

  it("shutdown() from the outside sends SIGTERM then SIGKILL after grace", async () => {
    const a = fakeChild(30);
    const spawnFn = vi.fn().mockReturnValue(a.handle);
    const killFn = vi.fn();

    const handle = runAllHandle({
      apps: [{ name: "api", cmd: "x", cwd: "/a", env: {} }],
      spawnFn,
      killFn,
      out: { write: () => true },
      installSignals: false,
      color: (_i) => (s) => s,
      graceMs: 15,
    });

    handle.shutdown("SIGINT");
    expect(killFn).toHaveBeenCalledWith(30, "SIGTERM");
    await new Promise((r) => setTimeout(r, 25));
    expect(killFn).toHaveBeenCalledWith(30, "SIGKILL");
    a.exit(137);
    const r = await handle.done;
    expect(r.exitCode).toBe(130);
  });
});
