import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { printAbortBanner } from "../../src/commands/up.js";

const drain = async (out: PassThrough): Promise<string> => {
  const chunks: string[] = [];
  out.on("data", (c) => chunks.push(c.toString()));
  out.end();
  await new Promise<void>((res) => out.on("end", () => res()));
  return chunks.join("");
};

describe("printAbortBanner", () => {
  it("prints the app names and reasons it was given", async () => {
    const out = new PassThrough();
    printAbortBanner(
      [
        { name: "ui1", reason: "git clone failed for git@x: Permission denied" },
        { name: "api", reason: "install failed for api (exit 1)" },
      ],
      out,
    );
    const text = await drain(out);
    expect(text).toContain("CREW UP ABORTED");
    expect(text).toContain("Failed to prepare 2 app(s)");
    expect(text).toContain("ui1");
    expect(text).toContain("Permission denied");
    expect(text).toContain("api");
    expect(text).toContain("exit 1");
    expect(text).toContain("Fix the issue");
  });

  it("renders multi-line reasons indented", async () => {
    const out = new PassThrough();
    printAbortBanner(
      [{ name: "ui1", reason: "line one\nline two" }],
      out,
    );
    const text = await drain(out);
    expect(text).toContain("line one");
    expect(text).toContain("line two");
  });
});
