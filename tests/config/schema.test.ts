import { describe, expect, it } from "vitest";
import { ConfigSchema } from "../../src/config/schema.js";

describe("ConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    const result = ConfigSchema.safeParse({
      apps: {
        api: { repo: "git@github.com:a/b.git", install: "npm i", run: "npm run dev" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects when apps is missing", () => {
    const result = ConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an app without required run field", () => {
    const result = ConfigSchema.safeParse({
      apps: { api: { repo: "x", install: "y" } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "apps.api.run")).toBe(true);
    }
  });

  it("rejects unknown fields on an app", () => {
    const result = ConfigSchema.safeParse({
      apps: { api: { repo: "x", install: "y", run: "z", surprise: true } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects app names with invalid characters", () => {
    const result = ConfigSchema.safeParse({
      apps: { "bad name!": { repo: "x", install: "y", run: "z" } },
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional env and cwd", () => {
    const result = ConfigSchema.safeParse({
      apps: {
        api: {
          repo: "x",
          install: "y",
          run: "z",
          env: { PORT: "3000" },
          cwd: "./src",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional top-level appsDir", () => {
    const result = ConfigSchema.safeParse({
      appsDir: "workspaces",
      apps: { api: { repo: "x", install: "y", run: "z" } },
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional clone.args", () => {
    const result = ConfigSchema.safeParse({
      apps: {
        api: {
          repo: "x",
          install: "y",
          run: "z",
          clone: { args: ["--recurse-submodules", "--depth=1"] },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown fields under clone", () => {
    const result = ConfigSchema.safeParse({
      apps: {
        api: {
          repo: "x",
          install: "y",
          run: "z",
          clone: { args: ["--depth=1"], strange: 1 },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty strings inside clone.args", () => {
    const result = ConfigSchema.safeParse({
      apps: {
        api: { repo: "x", install: "y", run: "z", clone: { args: [""] } },
      },
    });
    expect(result.success).toBe(false);
  });
});
