import { describe, expect, it, beforeEach } from "vitest";
import { vol } from "memfs";
import { loadConfig } from "../../src/config/load.js";
import { ConfigError } from "../../src/errors.js";

const fs = vol.promises as unknown as typeof import("node:fs").promises;

describe("loadConfig", () => {
  beforeEach(() => vol.reset());

  it("loads and validates a valid config", async () => {
    vol.fromJSON({
      "/proj/apps.yaml":
        "apps:\n  api:\n    repo: x\n    install: y\n    run: z\n",
    }, "/");
    const res = await loadConfig("/proj/sub", fs);
    expect(res.projectRoot).toBe("/proj");
    expect(res.config.apps.api?.run).toBe("z");
  });

  it("throws ConfigError with hint when no apps.yaml found", async () => {
    vol.fromJSON({ "/tmp/x/.keep": "" }, "/");
    await expect(loadConfig("/tmp/x", fs)).rejects.toMatchObject({
      code: "ConfigError",
      hint: expect.stringContaining("apps-cli init"),
    });
  });

  it("throws ConfigError on YAML parse failure", async () => {
    vol.fromJSON({ "/proj/apps.yaml": "apps: [::::\n" }, "/");
    await expect(loadConfig("/proj", fs)).rejects.toBeInstanceOf(ConfigError);
  });

  it("throws ConfigError with path info on schema violation", async () => {
    vol.fromJSON({
      "/proj/apps.yaml": "apps:\n  api:\n    repo: x\n    install: y\n",
    }, "/");
    await expect(loadConfig("/proj", fs)).rejects.toMatchObject({
      code: "ConfigError",
      message: expect.stringContaining("apps.api.run"),
    });
  });
});
