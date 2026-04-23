import { describe, expect, it, beforeAll } from "vitest";
import { execa } from "execa";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { makeFixture } from "./fixture.js";

const CLI = resolve("dist/cli.js");

describe("integration: sync", () => {
  beforeAll(async () => {
    await execa("npm", ["run", "build"]);
  }, 60_000);

  it("clones, installs, and is idempotent on a second run", async () => {
    const f = await makeFixture("demo");
    const r1 = await execa("node", [CLI, "sync"], { cwd: f.projectRoot, reject: false });
    expect(r1.exitCode).toBe(0);
    expect(existsSync(join(f.projectRoot, "apps", "demo", ".git"))).toBe(true);
    expect(existsSync(join(f.projectRoot, "apps", "demo", "installed.txt"))).toBe(true);

    const marker = await readFile(
      join(f.projectRoot, "apps", "demo", ".apps-cli-installed"),
      "utf8",
    );
    expect(marker.trim().length).toBeGreaterThan(0);

    const r2 = await execa("node", [CLI, "sync"], { cwd: f.projectRoot, reject: false });
    expect(r2.exitCode).toBe(0);
    expect(r2.stdout + r2.stderr).toContain("up to date");
  }, 60_000);
});
