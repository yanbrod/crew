import { describe, expect, it, beforeEach } from "vitest";
import { vol } from "memfs";
import {
  markerPath,
  readMarker,
  writeMarker,
  hashInstall,
} from "../../src/fs/installMarker.js";

const fs = vol.promises as unknown as typeof import("node:fs").promises;

describe("installMarker", () => {
  beforeEach(() => vol.reset());

  it("hashInstall is stable across calls and differs for different strings", () => {
    expect(hashInstall("pnpm install")).toBe(hashInstall("pnpm install"));
    expect(hashInstall("pnpm install")).not.toBe(hashInstall("npm ci"));
  });

  it("markerPath is at <appDir>/.crew-installed", () => {
    expect(markerPath("/proj/apps/api")).toBe("/proj/apps/api/.crew-installed");
  });

  it("readMarker returns null if marker missing", async () => {
    vol.fromJSON({ "/proj/apps/api/.keep": "" }, "/");
    expect(await readMarker("/proj/apps/api", fs)).toBeNull();
  });

  it("writeMarker then readMarker round-trips the hash", async () => {
    vol.fromJSON({ "/proj/apps/api/.keep": "" }, "/");
    const h = hashInstall("pnpm install");
    await writeMarker("/proj/apps/api", h, fs);
    expect(await readMarker("/proj/apps/api", fs)).toBe(h);
  });
});
