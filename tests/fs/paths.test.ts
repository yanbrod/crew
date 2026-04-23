import { describe, expect, it, beforeEach } from "vitest";
import { vol } from "memfs";
import { findProjectRoot, appsDirFor } from "../../src/fs/paths.js";

const fs = vol.promises as unknown as typeof import("node:fs").promises;

describe("paths", () => {
  beforeEach(() => vol.reset());

  it("findProjectRoot walks up until crew.yaml", async () => {
    vol.fromJSON(
      { "/proj/crew.yaml": "apps: {}\n", "/proj/sub/deep/.keep": "" },
      "/",
    );
    const root = await findProjectRoot("/proj/sub/deep", fs);
    expect(root).toBe("/proj");
  });

  it("returns null when crew.yaml is not anywhere above cwd", async () => {
    vol.fromJSON({ "/tmp/x/.keep": "" }, "/");
    const root = await findProjectRoot("/tmp/x", fs);
    expect(root).toBeNull();
  });

  it("appsDirFor returns <root>/apps by default", () => {
    expect(appsDirFor("/proj", undefined)).toBe("/proj/apps");
  });

  it("appsDirFor honors a custom appsDir config value", () => {
    expect(appsDirFor("/proj", "workspaces")).toBe("/proj/workspaces");
  });
});
