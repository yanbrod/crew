import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { createPrefixedTee, colorFor } from "../src/log.js";

describe("createPrefixedTee", () => {
  it("prefixes complete lines with [name] and writes them to out", async () => {
    const src = new PassThrough();
    const out: string[] = [];
    const tee = createPrefixedTee({
      name: "api",
      color: (s) => s,
      out: { write: (chunk: string) => { out.push(chunk); return true; } },
    });
    src.pipe(tee);
    src.write("hello\nworld\n");
    src.end();
    await new Promise((r) => tee.once("finish", r));
    expect(out.join("")).toBe("[api] hello\n[api] world\n");
  });

  it("buffers partial lines until a newline arrives", async () => {
    const src = new PassThrough();
    const out: string[] = [];
    const tee = createPrefixedTee({
      name: "web",
      color: (s) => s,
      out: { write: (chunk: string) => { out.push(chunk); return true; } },
    });
    src.pipe(tee);
    src.write("part");
    expect(out.join("")).toBe("");
    src.write("ial\nrest");
    expect(out.join("")).toBe("[web] partial\n");
    src.write("\n");
    src.end();
    await new Promise((r) => tee.once("finish", r));
    expect(out.join("")).toBe("[web] partial\n[web] rest\n");
  });

  it("flushes a trailing unterminated line on end", async () => {
    const src = new PassThrough();
    const out: string[] = [];
    const tee = createPrefixedTee({
      name: "x",
      color: (s) => s,
      out: { write: (chunk: string) => { out.push(chunk); return true; } },
    });
    src.pipe(tee);
    src.write("no newline");
    src.end();
    await new Promise((r) => tee.once("finish", r));
    expect(out.join("")).toBe("[x] no newline\n");
  });
});

describe("colorFor", () => {
  it("handles negative indices without crashing", () => {
    const fn = colorFor(-1);
    expect(typeof fn).toBe("function");
    expect(fn("x")).toContain("x");
  });
});
