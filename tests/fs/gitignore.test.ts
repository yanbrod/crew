import { describe, expect, it, beforeEach } from "vitest";
import { vol } from "memfs";
import { ensureGitignoreEntry } from "../../src/fs/gitignore.js";

const fs = vol.promises as unknown as typeof import("node:fs").promises;

describe("ensureGitignoreEntry", () => {
  beforeEach(() => vol.reset());

  it("creates .gitignore with the entry if missing", async () => {
    vol.fromJSON({ "/proj": null }, "/");
    await ensureGitignoreEntry("/proj/.gitignore", "apps/", fs);
    expect(vol.readFileSync("/proj/.gitignore", "utf8")).toBe("apps/\n");
  });

  it("appends the entry if file exists but does not contain it", async () => {
    vol.fromJSON({ "/proj/.gitignore": "node_modules\n" }, "/");
    await ensureGitignoreEntry("/proj/.gitignore", "apps/", fs);
    expect(vol.readFileSync("/proj/.gitignore", "utf8")).toBe("node_modules\napps/\n");
  });

  it("is idempotent if the entry already exists", async () => {
    vol.fromJSON({ "/proj/.gitignore": "node_modules\napps/\n" }, "/");
    await ensureGitignoreEntry("/proj/.gitignore", "apps/", fs);
    expect(vol.readFileSync("/proj/.gitignore", "utf8")).toBe("node_modules\napps/\n");
  });

  it("ignores whitespace when matching", async () => {
    vol.fromJSON({ "/proj/.gitignore": "  apps/  \n" }, "/");
    await ensureGitignoreEntry("/proj/.gitignore", "apps/", fs);
    expect(vol.readFileSync("/proj/.gitignore", "utf8")).toBe("  apps/  \n");
  });
});
