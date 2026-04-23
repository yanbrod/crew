import { describe, expect, it, beforeEach } from "vitest";
import { vol } from "memfs";
import { initCommand } from "../../src/commands/init.js";

const fs = vol.promises as unknown as typeof import("node:fs").promises;

describe("initCommand", () => {
  beforeEach(() => vol.reset());

  it("creates crew.yaml skeleton and adds apps/ to .gitignore when both missing", async () => {
    vol.fromJSON({ "/proj/package.json": "{}" }, "/");
    const result = await initCommand("/proj", fs);
    expect(result.created).toBe(true);
    expect(vol.readFileSync("/proj/crew.yaml", "utf8")).toContain("apps:");
    expect(vol.readFileSync("/proj/.gitignore", "utf8")).toContain("apps/");
  });

  it("is idempotent when crew.yaml already exists", async () => {
    vol.fromJSON({
      "/proj/package.json": "{}",
      "/proj/crew.yaml": "apps:\n  keep: { repo: x, install: y, run: z }\n",
    }, "/");
    const result = await initCommand("/proj", fs);
    expect(result.created).toBe(false);
    expect(vol.readFileSync("/proj/crew.yaml", "utf8")).toContain("keep");
  });
});
