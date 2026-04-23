import { describe, expect, it } from "vitest";
import { AppsCliError, ConfigError, GitError, InstallError, RuntimeError } from "../src/errors.js";

describe("errors", () => {
  it("ConfigError carries a code and is an AppsCliError", () => {
    const e = new ConfigError("bad schema", { hint: "run init" });
    expect(e).toBeInstanceOf(AppsCliError);
    expect(e.code).toBe("ConfigError");
    expect(e.hint).toBe("run init");
    expect(e.message).toBe("bad schema");
  });

  it("GitError, InstallError, RuntimeError all subclass AppsCliError", () => {
    expect(new GitError("x")).toBeInstanceOf(AppsCliError);
    expect(new InstallError("x")).toBeInstanceOf(AppsCliError);
    expect(new RuntimeError("x")).toBeInstanceOf(AppsCliError);
  });

  it("hint is optional", () => {
    const e = new GitError("no upstream");
    expect(e.hint).toBeUndefined();
  });
});
