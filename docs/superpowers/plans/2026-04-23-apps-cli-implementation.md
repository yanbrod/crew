# apps-cli Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps-cli`, a Node.js devDependency CLI that reads `apps.yaml`, clones/updates/runs external git repositories into a gitignored `apps/` folder, with merged prefixed logs and cross-platform signal handling on macOS and Windows.

**Architecture:** TypeScript, compiled to ESM for Node 18+. Subcommand CLI (`init | sync | start | up | status`) built on `commander`. Pure modules for config (`zod`), git wrappers (`execa` → `git` binary), FS utilities, and a custom orchestrator that spawns children in parallel, prefixes their output by line, and tears down the process tree on Ctrl+C via `tree-kill`.

**Tech Stack:** TypeScript, Node 18+, `commander`, `execa`, `js-yaml`, `zod`, `chalk`, `tree-kill`; `vitest` + `memfs` for tests; `tsup` for bundling; GitHub Actions matrix (ubuntu/windows/macos × Node 18/20) for CI.

**Spec:** [docs/superpowers/specs/2026-04-23-apps-cli-design.md](../specs/2026-04-23-apps-cli-design.md)

---

## File Structure

Files this plan creates. Each has one responsibility.

```
package.json                      # npm metadata, bin, scripts
tsconfig.json                     # strict TS, ES2022, NodeNext
tsup.config.ts                    # bundles src/cli.ts → dist/cli.js (ESM)
vitest.config.ts                  # vitest config (node env, coverage off)
.gitignore                        # node_modules, dist, apps
.npmignore                        # keep dist, readme; drop src, tests, configs
README.md                         # usage, config reference, platform notes
.github/workflows/ci.yml          # 3 OS × 2 Node matrix

src/
  cli.ts                          # commander entry, wires subcommands
  errors.ts                       # ConfigError | GitError | InstallError | RuntimeError
  log.ts                          # prefixLine(name, color, text); newline-buffered stream tee
  commands/
    init.ts                       # write apps.yaml skeleton, ensure .gitignore
    sync.ts                       # clone/fetch/ff-pull/install per app
    start.ts                      # orchestrator over all run commands
    status.ts                     # read-only inspection table
    up.ts                         # sync + start
  config/
    schema.ts                     # zod Schema + TS types
    load.ts                       # locate + read + parse + validate
  git/
    clone.ts                      # git clone with inherited stdio
    update.ts                     # safe fetch + ff-only merge
    inspect.ts                    # branch, upstream, dirty, ahead/behind
  runner/
    spawn.ts                      # execa wrapper, shell:true, cwd+env
    orchestrator.ts               # parallel spawn, prefix, signal teardown
  fs/
    paths.ts                      # find project root; apps dir path
    gitignore.ts                  # idempotent add of a line
    installMarker.ts              # sha256 of install cmd → file read/write/compare

tests/
  errors.test.ts
  log.test.ts
  config/
    schema.test.ts
    load.test.ts
  git/
    inspect.test.ts
    update.test.ts
  runner/
    orchestrator.test.ts
  fs/
    gitignore.test.ts
    installMarker.test.ts
    paths.test.ts
  commands/
    init.test.ts
  integration/
    fixture.ts                    # helpers: make bare repo with one commit
    sync.test.ts                  # tmpdir + bare repo + real CLI subprocess
```

---

## Testability design

Modules that touch the outside world (git, spawn, FS, signals) accept their effectful deps as parameters so unit tests can inject mocks. Example:

```typescript
// src/git/inspect.ts
export interface ExecFn {
  (cmd: string, args: string[], opts: { cwd: string }): Promise<{ stdout: string; exitCode: number }>;
}
export async function inspect(dir: string, exec: ExecFn = defaultExec): Promise<GitState> { ... }
```

This keeps unit tests fast and hermetic, and leaves one clear integration test scenario for `sync` against a real bare repo.

---

## Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `.gitignore`, `.npmignore`, `src/cli.ts` (stub)

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "apps-cli",
  "version": "0.0.0",
  "description": "Declarative runner for multi-repo local dev environments",
  "type": "module",
  "bin": { "apps-cli": "dist/cli.js" },
  "files": ["dist", "README.md"],
  "engines": { "node": ">=18" },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "chalk": "^5.3.0",
    "commander": "^12.1.0",
    "execa": "^9.4.0",
    "js-yaml": "^4.1.0",
    "tree-kill": "^1.2.2",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.14.0",
    "@types/tree-kill": "^1.2.5",
    "memfs": "^4.9.3",
    "tsup": "^8.3.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*", "tests/**/*", "*.config.ts"]
}
```

- [ ] **Step 3: Write `tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  platform: "node",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  splitting: false,
  sourcemap: true,
});
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
  },
});
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
coverage/
apps/
*.log
.DS_Store
```

- [ ] **Step 6: Write `.npmignore`**

```
src/
tests/
docs/
.github/
*.config.ts
tsconfig.json
.gitignore
coverage/
```

- [ ] **Step 7: Write `src/cli.ts` stub**

```ts
export {};
```

- [ ] **Step 8: Install deps and verify scaffold builds and tests**

Run: `npm install`
Expected: completes without errors.

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

Run: `npx vitest run`
Expected: "No test files found" is acceptable at this stage; exit code 1 is fine for now. Skip if prompt.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsup.config.ts vitest.config.ts .gitignore .npmignore src/cli.ts
git commit -m "chore: scaffold apps-cli project"
```

---

## Task 2: Typed errors

**Files:**
- Create: `src/errors.ts`
- Test: `tests/errors.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/errors.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/errors.test.ts`
Expected: FAIL — "Failed to resolve import '../src/errors.js'".

- [ ] **Step 3: Implement `src/errors.ts`**

```ts
export type ErrorCode = "ConfigError" | "GitError" | "InstallError" | "RuntimeError";

export class AppsCliError extends Error {
  readonly code: ErrorCode;
  readonly hint?: string;

  constructor(code: ErrorCode, message: string, opts: { hint?: string } = {}) {
    super(message);
    this.name = code;
    this.code = code;
    this.hint = opts.hint;
  }
}

export class ConfigError extends AppsCliError {
  constructor(message: string, opts: { hint?: string } = {}) {
    super("ConfigError", message, opts);
  }
}

export class GitError extends AppsCliError {
  constructor(message: string, opts: { hint?: string } = {}) {
    super("GitError", message, opts);
  }
}

export class InstallError extends AppsCliError {
  constructor(message: string, opts: { hint?: string } = {}) {
    super("InstallError", message, opts);
  }
}

export class RuntimeError extends AppsCliError {
  constructor(message: string, opts: { hint?: string } = {}) {
    super("RuntimeError", message, opts);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/errors.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts tests/errors.test.ts
git commit -m "feat(errors): typed AppsCliError hierarchy"
```

---

## Task 3: Log formatter with newline buffering

**Files:**
- Create: `src/log.ts`
- Test: `tests/log.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/log.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { createPrefixedTee } from "../src/log.js";

describe("createPrefixedTee", () => {
  it("prefixes complete lines with [name] and writes them to out", async () => {
    const src = new PassThrough();
    const out: string[] = [];
    const tee = createPrefixedTee({
      name: "api",
      color: (s) => s, // identity — we test content, not ANSI
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/log.test.ts`
Expected: FAIL — `'../src/log.js'` import error.

- [ ] **Step 3: Implement `src/log.ts`**

```ts
import { Writable } from "node:stream";

export interface TeeOptions {
  name: string;
  color: (text: string) => string;
  out: { write: (chunk: string) => boolean };
}

export function createPrefixedTee(opts: TeeOptions): Writable {
  let buf = "";
  const prefix = opts.color(`[${opts.name}] `);

  const emit = (line: string) => {
    opts.out.write(prefix + line + "\n");
  };

  return new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      buf += chunk.toString();
      let idx = buf.indexOf("\n");
      while (idx !== -1) {
        emit(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
        idx = buf.indexOf("\n");
      }
      cb();
    },
    final(cb) {
      if (buf.length > 0) {
        emit(buf);
        buf = "";
      }
      cb();
    },
  });
}

import chalk from "chalk";
const palette = [chalk.cyan, chalk.magenta, chalk.yellow, chalk.green, chalk.blue, chalk.red];

export function colorFor(index: number): (text: string) => string {
  const fn = palette[index % palette.length];
  return fn!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/log.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/log.ts tests/log.test.ts
git commit -m "feat(log): newline-buffered prefixed tee writable"
```

---

## Task 4: `fs/gitignore` — idempotent line add

**Files:**
- Create: `src/fs/gitignore.ts`
- Test: `tests/fs/gitignore.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/fs/gitignore.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { vol } from "memfs";
import { ensureGitignoreEntry } from "../../src/fs/gitignore.js";

// Point the function at memfs by passing fs as a dep.
const fs = vol.promises as unknown as typeof import("node:fs").promises;

describe("ensureGitignoreEntry", () => {
  beforeEach(() => vol.reset());

  it("creates .gitignore with the entry if missing", async () => {
    vol.fromJSON({}, "/proj");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fs/gitignore.test.ts`
Expected: FAIL — import error.

- [ ] **Step 3: Implement `src/fs/gitignore.ts`**

```ts
import { promises as realFs } from "node:fs";

export type FsApi = Pick<typeof realFs, "readFile" | "writeFile">;

export async function ensureGitignoreEntry(
  path: string,
  entry: string,
  fs: FsApi = realFs,
): Promise<void> {
  let current = "";
  try {
    current = await fs.readFile(path, "utf8");
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
  }
  const hasEntry = current
    .split(/\r?\n/)
    .some((line) => line.trim() === entry.trim());
  if (hasEntry) return;
  const needsNewline = current.length > 0 && !current.endsWith("\n");
  const next = (needsNewline ? current + "\n" : current) + entry + "\n";
  await fs.writeFile(path, next, "utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fs/gitignore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/fs/gitignore.ts tests/fs/gitignore.test.ts
git commit -m "feat(fs): idempotent gitignore line writer"
```

---

## Task 5: `fs/installMarker` — install-command hash marker

**Files:**
- Create: `src/fs/installMarker.ts`
- Test: `tests/fs/installMarker.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/fs/installMarker.test.ts`:

```ts
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

  it("markerPath is at <appDir>/.apps-cli-installed", () => {
    expect(markerPath("/proj/apps/api")).toBe("/proj/apps/api/.apps-cli-installed");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fs/installMarker.test.ts`
Expected: FAIL — import error.

- [ ] **Step 3: Implement `src/fs/installMarker.ts`**

```ts
import { promises as realFs } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { FsApi } from "./gitignore.js";

const MARKER = ".apps-cli-installed";

export function markerPath(appDir: string): string {
  return join(appDir, MARKER);
}

export function hashInstall(installCmd: string): string {
  return createHash("sha256").update(installCmd).digest("hex");
}

export async function readMarker(appDir: string, fs: FsApi = realFs): Promise<string | null> {
  try {
    const raw = await fs.readFile(markerPath(appDir), "utf8");
    return raw.trim();
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeMarker(appDir: string, hash: string, fs: FsApi = realFs): Promise<void> {
  await fs.writeFile(markerPath(appDir), hash + "\n", "utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fs/installMarker.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/fs/installMarker.ts tests/fs/installMarker.test.ts
git commit -m "feat(fs): install marker via sha256 of install command"
```

---

## Task 6: `fs/paths` — project root resolution

**Files:**
- Create: `src/fs/paths.ts`
- Test: `tests/fs/paths.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/fs/paths.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { vol } from "memfs";
import { findProjectRoot, appsDirFor } from "../../src/fs/paths.js";

const fs = vol.promises as unknown as typeof import("node:fs").promises;

describe("paths", () => {
  beforeEach(() => vol.reset());

  it("findProjectRoot walks up until apps.yaml", async () => {
    vol.fromJSON(
      { "/proj/apps.yaml": "apps: {}\n", "/proj/sub/deep/.keep": "" },
      "/",
    );
    const root = await findProjectRoot("/proj/sub/deep", fs);
    expect(root).toBe("/proj");
  });

  it("returns null when apps.yaml is not anywhere above cwd", async () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fs/paths.test.ts`
Expected: FAIL — import error.

- [ ] **Step 3: Implement `src/fs/paths.ts`**

```ts
import { promises as realFs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { FsApi } from "./gitignore.js";

const CONFIG_NAME = "apps.yaml";

export async function findProjectRoot(
  startDir: string,
  fs: FsApi = realFs,
): Promise<string | null> {
  let dir = resolve(startDir);
  while (true) {
    try {
      await fs.readFile(join(dir, CONFIG_NAME), "utf8");
      return dir;
    } catch (err: any) {
      if (err?.code !== "ENOENT") throw err;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function appsDirFor(projectRoot: string, appsDir: string | undefined): string {
  return join(projectRoot, appsDir ?? "apps");
}

export function configPath(projectRoot: string): string {
  return join(projectRoot, CONFIG_NAME);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fs/paths.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/fs/paths.ts tests/fs/paths.test.ts
git commit -m "feat(fs): project root and apps-dir resolution"
```

---

## Task 7: `config/schema` — zod schema

**Files:**
- Create: `src/config/schema.ts`
- Test: `tests/config/schema.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/config/schema.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/schema.test.ts`
Expected: FAIL — import error.

- [ ] **Step 3: Implement `src/config/schema.ts`**

```ts
import { z } from "zod";

const APP_NAME = /^[a-zA-Z0-9_-]+$/;

export const AppSchema = z
  .object({
    repo: z.string().min(1),
    install: z.string().min(1),
    run: z.string().min(1),
    env: z.record(z.string(), z.string()).optional(),
    cwd: z.string().optional(),
  })
  .strict();

export const ConfigSchema = z
  .object({
    appsDir: z.string().optional(),
    apps: z.record(z.string().regex(APP_NAME), AppSchema).refine(
      (v) => Object.keys(v).length > 0,
      { message: "apps must have at least one entry" },
    ),
  })
  .strict();

export type AppConfig = z.infer<typeof AppSchema>;
export type Config = z.infer<typeof ConfigSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config/schema.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config/schema.ts tests/config/schema.test.ts
git commit -m "feat(config): zod schema for apps.yaml"
```

---

## Task 8: `config/load` — locate, parse, validate

**Files:**
- Create: `src/config/load.ts`
- Test: `tests/config/load.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/config/load.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/load.test.ts`
Expected: FAIL — import error.

- [ ] **Step 3: Implement `src/config/load.ts`**

```ts
import { promises as realFs } from "node:fs";
import yaml from "js-yaml";
import { ConfigError } from "../errors.js";
import type { FsApi } from "../fs/gitignore.js";
import { configPath, findProjectRoot } from "../fs/paths.js";
import { ConfigSchema, type Config } from "./schema.js";

export interface LoadedConfig {
  projectRoot: string;
  config: Config;
}

export async function loadConfig(cwd: string, fs: FsApi = realFs): Promise<LoadedConfig> {
  const projectRoot = await findProjectRoot(cwd, fs);
  if (!projectRoot) {
    throw new ConfigError("no apps.yaml found", { hint: "run `apps-cli init`" });
  }
  const raw = await fs.readFile(configPath(projectRoot), "utf8");
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err: any) {
    throw new ConfigError(`apps.yaml parse failed: ${err?.message ?? err}`);
  }
  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new ConfigError(`apps.yaml invalid — ${issues}`);
  }
  return { projectRoot, config: result.data };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config/load.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config/load.ts tests/config/load.test.ts
git commit -m "feat(config): locate, parse, validate apps.yaml"
```

---

## Task 9: `git/inspect` — parse git state

**Files:**
- Create: `src/git/inspect.ts`
- Test: `tests/git/inspect.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/git/inspect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { inspect, type ExecFn } from "../../src/git/inspect.js";

const makeExec = (responses: Record<string, { stdout: string; exitCode: number }>): ExecFn =>
  async (_cmd, args) => {
    const key = args.join(" ");
    const r = responses[key];
    if (!r) throw new Error(`unexpected git args: ${key}`);
    if (r.exitCode !== 0) {
      const err: any = new Error("git failed");
      err.exitCode = r.exitCode;
      err.stderr = r.stdout;
      throw err;
    }
    return r;
  };

describe("inspect", () => {
  it("returns branch, upstream, ahead/behind, clean", async () => {
    const exec = makeExec({
      "rev-parse --abbrev-ref HEAD": { stdout: "main\n", exitCode: 0 },
      "rev-parse --abbrev-ref --symbolic-full-name @{u}": { stdout: "origin/main\n", exitCode: 0 },
      "status --porcelain": { stdout: "", exitCode: 0 },
      "rev-list --left-right --count origin/main...HEAD": { stdout: "2\t3\n", exitCode: 0 },
    });
    const r = await inspect("/repo", exec);
    expect(r).toEqual({
      currentBranch: "main",
      upstream: "origin/main",
      isDirty: false,
      behind: 2,
      ahead: 3,
    });
  });

  it("reports no upstream gracefully", async () => {
    const exec = makeExec({
      "rev-parse --abbrev-ref HEAD": { stdout: "feat-x\n", exitCode: 0 },
      "rev-parse --abbrev-ref --symbolic-full-name @{u}": { stdout: "", exitCode: 128 },
      "status --porcelain": { stdout: " M src/a.ts\n", exitCode: 0 },
    });
    const r = await inspect("/repo", exec);
    expect(r.currentBranch).toBe("feat-x");
    expect(r.upstream).toBeNull();
    expect(r.isDirty).toBe(true);
    expect(r.ahead).toBe(0);
    expect(r.behind).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/git/inspect.test.ts`
Expected: FAIL — import error.

- [ ] **Step 3: Implement `src/git/inspect.ts`**

```ts
import { execa } from "execa";

export interface ExecResult {
  stdout: string;
  exitCode: number;
}

export interface ExecFn {
  (cmd: string, args: string[], opts: { cwd: string }): Promise<ExecResult>;
}

export const defaultExec: ExecFn = async (cmd, args, opts) => {
  const r = await execa(cmd, args, { cwd: opts.cwd, reject: false });
  return { stdout: r.stdout ?? "", exitCode: r.exitCode ?? 0 };
};

export interface GitState {
  currentBranch: string;
  upstream: string | null;
  isDirty: boolean;
  ahead: number;
  behind: number;
}

const git = (args: string[], dir: string, exec: ExecFn) =>
  exec("git", args, { cwd: dir });

export async function inspect(dir: string, exec: ExecFn = defaultExec): Promise<GitState> {
  const branchRes = await git(["rev-parse", "--abbrev-ref", "HEAD"], dir, exec);
  const currentBranch = branchRes.stdout.trim();

  let upstream: string | null = null;
  try {
    const up = await git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], dir, exec);
    if (up.exitCode === 0 && up.stdout.trim().length > 0) upstream = up.stdout.trim();
  } catch {
    upstream = null;
  }

  const status = await git(["status", "--porcelain"], dir, exec);
  const isDirty = status.stdout.trim().length > 0;

  let ahead = 0;
  let behind = 0;
  if (upstream) {
    const rl = await git(
      ["rev-list", "--left-right", "--count", `${upstream}...HEAD`],
      dir,
      exec,
    );
    const [b, a] = rl.stdout.trim().split(/\s+/).map((n) => Number.parseInt(n, 10));
    behind = Number.isFinite(b) ? b! : 0;
    ahead = Number.isFinite(a) ? a! : 0;
  }

  return { currentBranch, upstream, isDirty, ahead, behind };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/git/inspect.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/git/inspect.ts tests/git/inspect.test.ts
git commit -m "feat(git): inspect branch, upstream, dirty, ahead/behind"
```

---

## Task 10: `git/update` — safe fetch + ff-pull

**Files:**
- Create: `src/git/update.ts`
- Test: `tests/git/update.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/git/update.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { update } from "../../src/git/update.js";
import type { GitState } from "../../src/git/inspect.js";

const baseState = (over: Partial<GitState>): GitState => ({
  currentBranch: "main",
  upstream: "origin/main",
  isDirty: false,
  ahead: 0,
  behind: 0,
  ...over,
});

describe("update", () => {
  it("fetches, then merges ff-only when clean with upstream", async () => {
    const calls: string[][] = [];
    const exec = vi.fn(async (_cmd: string, args: string[]) => {
      calls.push(args);
      return { stdout: "", exitCode: 0 };
    });
    const inspect = vi.fn().mockResolvedValue(baseState({ behind: 2 }));

    const r = await update("/repo", { exec, inspect });
    expect(r.action).toBe("ff-pulled");
    expect(calls.map((a) => a.join(" "))).toEqual([
      "fetch",
      "merge --ff-only origin/main",
    ]);
  });

  it("fetches then skips when dirty", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 0 }));
    const inspect = vi.fn().mockResolvedValue(baseState({ isDirty: true }));
    const r = await update("/repo", { exec, inspect });
    expect(r.action).toBe("skipped");
    expect(r.reason).toMatch(/dirty/);
    expect(exec).toHaveBeenCalledTimes(1); // only fetch
  });

  it("fetches then skips when no upstream", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 0 }));
    const inspect = vi.fn().mockResolvedValue(baseState({ upstream: null }));
    const r = await update("/repo", { exec, inspect });
    expect(r.action).toBe("skipped");
    expect(r.reason).toMatch(/upstream/);
  });

  it("fetches then skips when ff is impossible (non-zero merge exit)", async () => {
    const exec = vi
      .fn<any>()
      .mockResolvedValueOnce({ stdout: "", exitCode: 0 }) // fetch
      .mockResolvedValueOnce({ stdout: "", exitCode: 128 }); // merge fails
    const inspect = vi.fn().mockResolvedValue(baseState({ ahead: 1, behind: 1 }));
    const r = await update("/repo", { exec, inspect });
    expect(r.action).toBe("skipped");
    expect(r.reason).toMatch(/non-fast-forward|non-ff/);
  });

  it("skips cleanly when already up to date (nothing to merge)", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 0 }));
    const inspect = vi.fn().mockResolvedValue(baseState({})); // behind=0
    const r = await update("/repo", { exec, inspect });
    expect(r.action).toBe("up-to-date");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/git/update.test.ts`
Expected: FAIL — import error.

- [ ] **Step 3: Implement `src/git/update.ts`**

```ts
import { type ExecFn, defaultExec, inspect as defaultInspect, type GitState } from "./inspect.js";

export type UpdateResult =
  | { action: "ff-pulled" }
  | { action: "up-to-date" }
  | { action: "skipped"; reason: string };

export interface UpdateDeps {
  exec?: ExecFn;
  inspect?: (dir: string) => Promise<GitState>;
}

export async function update(dir: string, deps: UpdateDeps = {}): Promise<UpdateResult> {
  const exec = deps.exec ?? defaultExec;
  const inspect = deps.inspect ?? ((d: string) => defaultInspect(d, exec));

  await exec("git", ["fetch"], { cwd: dir });

  const state = await inspect(dir);
  if (!state.upstream) return { action: "skipped", reason: "no upstream" };
  if (state.isDirty) return { action: "skipped", reason: "working tree dirty" };
  if (state.behind === 0) return { action: "up-to-date" };

  const merge = await exec("git", ["merge", "--ff-only", state.upstream], { cwd: dir });
  if (merge.exitCode !== 0) return { action: "skipped", reason: "non-fast-forward" };
  return { action: "ff-pulled" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/git/update.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/git/update.ts tests/git/update.test.ts
git commit -m "feat(git): safe fetch + ff-only update"
```

---

## Task 11: `git/clone` — thin wrapper with inherited stdio

**Files:**
- Create: `src/git/clone.ts`

No unit test — this is a 5-line pass-through. It is exercised by the integration test in Task 20.

- [ ] **Step 1: Implement `src/git/clone.ts`**

```ts
import { execa } from "execa";
import { GitError } from "../errors.js";

export async function clone(repo: string, dest: string): Promise<void> {
  try {
    await execa("git", ["clone", repo, dest], { stdio: "inherit" });
  } catch (err: any) {
    throw new GitError(`git clone failed for ${repo}`, {
      hint: "check the repo URL, your auth, and network",
    });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/git/clone.ts
git commit -m "feat(git): clone wrapper with inherited stdio"
```

---

## Task 12: `runner/spawn` — execa wrapper

**Files:**
- Create: `src/runner/spawn.ts`

No dedicated unit test; orchestrator tests and integration test exercise this.

- [ ] **Step 1: Implement `src/runner/spawn.ts`**

```ts
import { execa, type ResultPromise } from "execa";

export interface SpawnOpts {
  cwd: string;
  env?: Record<string, string>;
  stdio?: "inherit" | "pipe";
}

export function spawnShell(cmd: string, opts: SpawnOpts): ResultPromise {
  return execa(cmd, {
    shell: true,
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdio: opts.stdio ?? "pipe",
    reject: false,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/runner/spawn.ts
git commit -m "feat(runner): shell-mode execa wrapper"
```

---

## Task 13: `runner/orchestrator` — parallel spawn, prefix, signals

**Files:**
- Create: `src/runner/orchestrator.ts`
- Test: `tests/runner/orchestrator.test.ts`

This module is structured so tests can substitute `spawnFn` and `killFn`. The Node-side SIGINT handler is wired only when `installSignals` is true (production) and skipped in tests (we invoke the handler by calling the returned `shutdown()`).

- [ ] **Step 1: Write the failing test**

`tests/runner/orchestrator.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { runAll, type ChildHandle } from "../../src/runner/orchestrator.js";

function fakeChild(pid: number): ChildHandle & { stdout: PassThrough; stderr: PassThrough; emitter: EventEmitter; exit: (code: number) => void } {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const emitter = new EventEmitter();
  let exitCode: number | null = null;
  return {
    pid,
    stdout,
    stderr,
    on: (ev, cb) => { emitter.on(ev, cb); return undefined as any; },
    get exitCode() { return exitCode; },
    exit: (code: number) => { exitCode = code; emitter.emit("exit", code); },
    emitter,
  } as any;
}

describe("runAll", () => {
  it("starts all children, prefixes their lines, and resolves when all exit 0", async () => {
    const a = fakeChild(10);
    const b = fakeChild(11);
    const spawnFn = vi.fn()
      .mockReturnValueOnce(a)
      .mockReturnValueOnce(b);
    const killFn = vi.fn();
    const out: string[] = [];

    const donePromise = runAll({
      apps: [
        { name: "api", cmd: "cmd-a", cwd: "/apps/api", env: {} },
        { name: "web", cmd: "cmd-b", cwd: "/apps/web", env: {} },
      ],
      spawnFn,
      killFn,
      out: { write: (c: string) => { out.push(c); return true; } },
      installSignals: false,
      color: (_i) => (s) => s,
      graceMs: 10,
    });

    a.stdout.write("ready\n");
    b.stdout.write("listening\n");
    a.exit(0);
    b.exit(0);

    const r = await donePromise;
    expect(r.exitCode).toBe(0);
    expect(out.join("")).toContain("[api] ready\n");
    expect(out.join("")).toContain("[web] listening\n");
    expect(killFn).not.toHaveBeenCalled();
  });

  it("kills all children when one exits non-zero and resolves with 1", async () => {
    const a = fakeChild(20);
    const b = fakeChild(21);
    const spawnFn = vi.fn().mockReturnValueOnce(a).mockReturnValueOnce(b);
    const killFn = vi.fn();

    const donePromise = runAll({
      apps: [
        { name: "api", cmd: "x", cwd: "/a", env: {} },
        { name: "web", cmd: "y", cwd: "/w", env: {} },
      ],
      spawnFn,
      killFn,
      out: { write: () => true },
      installSignals: false,
      color: (_i) => (s) => s,
      graceMs: 10,
    });

    a.exit(1);
    // give killFn time to call, then simulate other child dying too
    await new Promise((r) => setTimeout(r, 5));
    b.exit(143);

    const r = await donePromise;
    expect(r.exitCode).toBe(1);
    expect(killFn).toHaveBeenCalledWith(21, "SIGTERM");
  });

  it("shutdown() from the outside sends SIGTERM then SIGKILL after grace", async () => {
    const a = fakeChild(30);
    const spawnFn = vi.fn().mockReturnValue(a);
    const killFn = vi.fn();

    const handle = runAllHandle({
      apps: [{ name: "api", cmd: "x", cwd: "/a", env: {} }],
      spawnFn,
      killFn,
      out: { write: () => true },
      installSignals: false,
      color: (_i) => (s) => s,
      graceMs: 15,
    });

    handle.shutdown("SIGINT");
    expect(killFn).toHaveBeenCalledWith(30, "SIGTERM");
    await new Promise((r) => setTimeout(r, 25));
    expect(killFn).toHaveBeenCalledWith(30, "SIGKILL");
    a.exit(137);
    const r = await handle.done;
    expect(r.exitCode).toBe(130);
  });
});

// helper that the test uses — implemented alongside runAll
import { runAllHandle } from "../../src/runner/orchestrator.js";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/runner/orchestrator.test.ts`
Expected: FAIL — import error.

- [ ] **Step 3: Implement `src/runner/orchestrator.ts`**

```ts
import { createPrefixedTee, colorFor } from "../log.js";
import treeKill from "tree-kill";

export interface ChildHandle {
  pid: number | undefined;
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  exitCode: number | null;
  on(event: "exit", listener: (code: number | null) => void): void;
}

export interface AppRun {
  name: string;
  cmd: string;
  cwd: string;
  env: Record<string, string>;
}

export interface SpawnFn {
  (cmd: string, opts: { cwd: string; env: Record<string, string> }): ChildHandle;
}

export interface KillFn {
  (pid: number, signal: "SIGTERM" | "SIGKILL"): void;
}

export interface OrchestratorOpts {
  apps: AppRun[];
  spawnFn: SpawnFn;
  killFn?: KillFn;
  out?: { write: (chunk: string) => boolean };
  installSignals?: boolean;
  color?: (index: number) => (text: string) => string;
  graceMs?: number;
}

export interface OrchestratorResult {
  exitCode: number;
}

export interface OrchestratorHandle {
  done: Promise<OrchestratorResult>;
  shutdown: (signal: "SIGINT" | "SIGTERM") => void;
}

const defaultKill: KillFn = (pid, signal) => treeKill(pid, signal);

export function runAllHandle(opts: OrchestratorOpts): OrchestratorHandle {
  const kill = opts.killFn ?? defaultKill;
  const out = opts.out ?? { write: (c: string) => process.stdout.write(c) };
  const colorPick = opts.color ?? colorFor;
  const graceMs = opts.graceMs ?? 5000;

  const children = opts.apps.map((app, i) => {
    const child = opts.spawnFn(app.cmd, { cwd: app.cwd, env: app.env });
    const color = colorPick(i);
    if (child.stdout) child.stdout.pipe(createPrefixedTee({ name: app.name, color, out }));
    if (child.stderr) child.stderr.pipe(createPrefixedTee({ name: app.name, color, out }));
    return { app, child };
  });

  let shuttingDown = false;
  let shutdownSignal: "SIGINT" | "SIGTERM" | null = null;
  let firstFailure = false;

  const alive = new Set(children);

  const done = new Promise<OrchestratorResult>((resolve) => {
    const tryFinish = () => {
      if (alive.size === 0) {
        if (shutdownSignal === "SIGINT") resolve({ exitCode: 130 });
        else if (shutdownSignal === "SIGTERM") resolve({ exitCode: 143 });
        else resolve({ exitCode: firstFailure ? 1 : 0 });
      }
    };

    for (const c of children) {
      c.child.on("exit", (code) => {
        alive.delete(c);
        const failed = (code ?? 0) !== 0;
        if (failed && !shuttingDown) {
          firstFailure = true;
          out.write(`[${c.app.name}] exited with code ${code}\n`);
        } else if (!shuttingDown) {
          out.write(`[${c.app.name}] exited with code ${code}\n`);
          firstFailure = firstFailure || failed;
        }
        if ((failed || code === 0) && !shuttingDown) {
          // any exit triggers teardown of siblings in `start` semantics
          shutdown("SIGTERM");
        }
        tryFinish();
      });
    }
  });

  function shutdown(signal: "SIGINT" | "SIGTERM") {
    if (shuttingDown) return;
    shuttingDown = true;
    shutdownSignal = signal;
    for (const c of children) {
      if (c.child.pid !== undefined && c.child.exitCode === null) {
        kill(c.child.pid, "SIGTERM");
      }
    }
    setTimeout(() => {
      for (const c of children) {
        if (c.child.pid !== undefined && c.child.exitCode === null) {
          kill(c.child.pid, "SIGKILL");
        }
      }
    }, graceMs);
  }

  if (opts.installSignals !== false) {
    const onSig = (sig: "SIGINT" | "SIGTERM") => shutdown(sig);
    process.once("SIGINT", () => onSig("SIGINT"));
    process.once("SIGTERM", () => onSig("SIGTERM"));
  }

  return { done, shutdown };
}

export async function runAll(opts: OrchestratorOpts): Promise<OrchestratorResult> {
  return runAllHandle(opts).done;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/runner/orchestrator.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/runner/orchestrator.ts tests/runner/orchestrator.test.ts
git commit -m "feat(runner): orchestrator with tree-kill teardown"
```

---

## Task 14: `commands/init`

**Files:**
- Create: `src/commands/init.ts`
- Test: `tests/commands/init.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/commands/init.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { vol } from "memfs";
import { initCommand } from "../../src/commands/init.js";

const fs = vol.promises as unknown as typeof import("node:fs").promises;

describe("initCommand", () => {
  beforeEach(() => vol.reset());

  it("creates apps.yaml skeleton and adds apps/ to .gitignore when both missing", async () => {
    vol.fromJSON({ "/proj/package.json": "{}" }, "/");
    const result = await initCommand("/proj", fs);
    expect(result.created).toBe(true);
    expect(vol.readFileSync("/proj/apps.yaml", "utf8")).toContain("apps:");
    expect(vol.readFileSync("/proj/.gitignore", "utf8")).toContain("apps/");
  });

  it("is idempotent when apps.yaml already exists", async () => {
    vol.fromJSON({
      "/proj/package.json": "{}",
      "/proj/apps.yaml": "apps:\n  keep: { repo: x, install: y, run: z }\n",
    }, "/");
    const result = await initCommand("/proj", fs);
    expect(result.created).toBe(false);
    expect(vol.readFileSync("/proj/apps.yaml", "utf8")).toContain("keep");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/commands/init.test.ts`
Expected: FAIL — import error.

- [ ] **Step 3: Implement `src/commands/init.ts`**

```ts
import { promises as realFs } from "node:fs";
import { join } from "node:path";
import type { FsApi } from "../fs/gitignore.js";
import { ensureGitignoreEntry } from "../fs/gitignore.js";

const SKELETON = `# apps.yaml — managed by apps-cli
# appsDir: apps
apps:
  # example:
  #   repo: git@github.com:acme/example.git
  #   install: npm install
  #   run: npm run dev
`;

export interface InitResult {
  created: boolean;
}

export async function initCommand(projectRoot: string, fs: FsApi = realFs): Promise<InitResult> {
  const configPath = join(projectRoot, "apps.yaml");
  let exists = false;
  try {
    await fs.readFile(configPath, "utf8");
    exists = true;
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
  }
  if (!exists) {
    await fs.writeFile(configPath, SKELETON, "utf8");
  }
  await ensureGitignoreEntry(join(projectRoot, ".gitignore"), "apps/", fs);
  return { created: !exists };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/commands/init.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/commands/init.ts tests/commands/init.test.ts
git commit -m "feat(commands): init writes skeleton + gitignore"
```

---

## Task 15: `commands/status`

**Files:**
- Create: `src/commands/status.ts`

Purely read-only and printed. Unit tests for `inspect` already cover the hard part. One smoke-style test through the `commands/init` pattern isn't warranted; this is exercised by integration in Task 20 indirectly and by running it manually.

- [ ] **Step 1: Implement `src/commands/status.ts`**

```ts
import { promises as realFs } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import type { FsApi } from "../fs/gitignore.js";
import type { Config } from "../config/schema.js";
import { inspect } from "../git/inspect.js";
import { appsDirFor } from "../fs/paths.js";
import { readMarker, hashInstall } from "../fs/installMarker.js";

export interface StatusRow {
  name: string;
  cloned: boolean;
  branch?: string;
  dirty?: boolean;
  ahead?: number;
  behind?: number;
  markerOk?: boolean;
}

export async function statusCommand(
  projectRoot: string,
  config: Config,
  fs: FsApi = realFs,
): Promise<StatusRow[]> {
  const appsDir = appsDirFor(projectRoot, config.appsDir);
  const rows: StatusRow[] = [];
  for (const [name, app] of Object.entries(config.apps)) {
    const appDir = join(appsDir, name);
    let cloned = false;
    try {
      await fs.readFile(join(appDir, ".git", "HEAD"), "utf8");
      cloned = true;
    } catch {
      cloned = false;
    }
    if (!cloned) {
      rows.push({ name, cloned: false });
      continue;
    }
    const state = await inspect(appDir);
    const marker = await readMarker(appDir, fs);
    const markerOk = marker === hashInstall(app.install);
    rows.push({
      name,
      cloned: true,
      branch: state.currentBranch,
      dirty: state.isDirty,
      ahead: state.ahead,
      behind: state.behind,
      markerOk,
    });
  }
  return rows;
}

export function printStatus(rows: StatusRow[], out = process.stdout): void {
  for (const r of rows) {
    if (!r.cloned) {
      out.write(`${chalk.yellow("•")} ${r.name}  ${chalk.dim("not cloned")}\n`);
      continue;
    }
    const dirty = r.dirty ? chalk.red(" dirty") : "";
    const ab = ` ↑${r.ahead} ↓${r.behind}`;
    const mk = r.markerOk ? chalk.dim(" installed") : chalk.yellow(" install needed");
    out.write(`${chalk.green("•")} ${r.name}  ${r.branch}${ab}${dirty}${mk}\n`);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/commands/status.ts
git commit -m "feat(commands): status inspection output"
```

---

## Task 16: `commands/sync`

**Files:**
- Create: `src/commands/sync.ts`

Integration-tested in Task 20. No unit test — this module is glue over already-tested `clone`, `update`, `spawnShell`, `installMarker`.

- [ ] **Step 1: Implement `src/commands/sync.ts`**

```ts
import { promises as realFs } from "node:fs";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import chalk from "chalk";
import type { FsApi } from "../fs/gitignore.js";
import type { Config } from "../config/schema.js";
import { appsDirFor } from "../fs/paths.js";
import { clone } from "../git/clone.js";
import { update } from "../git/update.js";
import { spawnShell } from "../runner/spawn.js";
import {
  hashInstall,
  readMarker,
  writeMarker,
} from "../fs/installMarker.js";
import { InstallError } from "../errors.js";

export interface SyncOptions {
  only?: string[];
  force?: boolean;
}

export interface SyncResult {
  failed: string[];
}

export async function syncCommand(
  projectRoot: string,
  config: Config,
  opts: SyncOptions = {},
  fs: FsApi = realFs,
): Promise<SyncResult> {
  const appsDir = appsDirFor(projectRoot, config.appsDir);
  await mkdir(appsDir, { recursive: true });

  const entries = Object.entries(config.apps).filter(
    ([name]) => !opts.only || opts.only.includes(name),
  );
  const failed: string[] = [];

  for (const [name, app] of entries) {
    const appDir = join(appsDir, name);
    const workDir = app.cwd ? join(appDir, app.cwd) : appDir;
    try {
      let didClone = false;
      try {
        await fs.readFile(join(appDir, ".git", "HEAD"), "utf8");
      } catch (err: any) {
        if (err?.code !== "ENOENT") throw err;
        process.stdout.write(chalk.cyan(`[${name}] cloning ${app.repo}\n`));
        await clone(app.repo, appDir);
        didClone = true;
      }

      if (!didClone) {
        const r = await update(appDir);
        if (r.action === "ff-pulled") process.stdout.write(chalk.cyan(`[${name}] fast-forwarded\n`));
        else if (r.action === "up-to-date") process.stdout.write(chalk.dim(`[${name}] up to date\n`));
        else process.stdout.write(chalk.yellow(`[${name}] skipped: ${r.reason}\n`));
      }

      const wanted = hashInstall(app.install);
      const current = await readMarker(appDir, fs);
      if (opts.force || current !== wanted) {
        process.stdout.write(chalk.cyan(`[${name}] installing (${app.install})\n`));
        const res = await spawnShell(app.install, { cwd: workDir, stdio: "inherit" });
        if (res.exitCode !== 0) {
          throw new InstallError(`install failed for ${name} (exit ${res.exitCode})`);
        }
        await writeMarker(appDir, wanted, fs);
      } else {
        process.stdout.write(chalk.dim(`[${name}] install marker up to date\n`));
      }
    } catch (err: any) {
      process.stderr.write(chalk.red(`[${name}] ${err?.message ?? err}\n`));
      failed.push(name);
    }
  }

  return { failed };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/commands/sync.ts
git commit -m "feat(commands): sync — clone/update/install loop"
```

---

## Task 17: `commands/start`

**Files:**
- Create: `src/commands/start.ts`

- [ ] **Step 1: Implement `src/commands/start.ts`**

```ts
import { promises as realFs } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import type { FsApi } from "../fs/gitignore.js";
import type { Config } from "../config/schema.js";
import { appsDirFor } from "../fs/paths.js";
import { runAll, type AppRun, type ChildHandle, type SpawnFn } from "../runner/orchestrator.js";
import { spawnShell } from "../runner/spawn.js";
import { RuntimeError } from "../errors.js";

export interface StartOptions {
  only?: string[];
}

const defaultSpawn: SpawnFn = (cmd, opts) => {
  const proc = spawnShell(cmd, { cwd: opts.cwd, env: opts.env, stdio: "pipe" });
  return {
    pid: (proc as any).pid,
    stdout: (proc as any).stdout,
    stderr: (proc as any).stderr,
    get exitCode() { return (proc as any).exitCode ?? null; },
    on: (ev, cb) => { (proc as any).on(ev, cb); },
  } as ChildHandle;
};

export async function startCommand(
  projectRoot: string,
  config: Config,
  opts: StartOptions = {},
  fs: FsApi = realFs,
): Promise<number> {
  const appsDir = appsDirFor(projectRoot, config.appsDir);
  const entries = Object.entries(config.apps).filter(
    ([name]) => !opts.only || opts.only.includes(name),
  );

  for (const [name] of entries) {
    const appDir = join(appsDir, name);
    try {
      await fs.readFile(join(appDir, ".git", "HEAD"), "utf8");
    } catch {
      throw new RuntimeError(`${name} not synced`, {
        hint: "run `apps-cli sync` first",
      });
    }
  }

  const apps: AppRun[] = entries.map(([name, app]) => ({
    name,
    cmd: app.run,
    cwd: app.cwd ? join(appsDir, name, app.cwd) : join(appsDir, name),
    env: app.env ?? {},
  }));

  process.stdout.write(chalk.bold(`Starting ${apps.length} app(s)\n`));
  const result = await runAll({ apps, spawnFn: defaultSpawn, installSignals: true });
  return result.exitCode;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/commands/start.ts
git commit -m "feat(commands): start — orchestrator over run commands"
```

---

## Task 18: `commands/up`

**Files:**
- Create: `src/commands/up.ts`

- [ ] **Step 1: Implement `src/commands/up.ts`**

```ts
import type { Config } from "../config/schema.js";
import { syncCommand, type SyncOptions } from "./sync.js";
import { startCommand, type StartOptions } from "./start.js";

export async function upCommand(
  projectRoot: string,
  config: Config,
  opts: SyncOptions & StartOptions = {},
): Promise<number> {
  const sync = await syncCommand(projectRoot, config, opts);
  if (sync.failed.length > 0) return 1;
  return startCommand(projectRoot, config, opts);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/commands/up.ts
git commit -m "feat(commands): up — sync then start"
```

---

## Task 19: `cli.ts` — commander wiring

**Files:**
- Modify: `src/cli.ts` (replace stub)

- [ ] **Step 1: Implement `src/cli.ts`**

```ts
import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "./config/load.js";
import { initCommand } from "./commands/init.js";
import { syncCommand } from "./commands/sync.js";
import { startCommand } from "./commands/start.js";
import { upCommand } from "./commands/up.js";
import { statusCommand, printStatus } from "./commands/status.js";
import { AppsCliError } from "./errors.js";
import { findProjectRoot } from "./fs/paths.js";

function parseOnly(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function fail(err: unknown): never {
  if (err instanceof AppsCliError) {
    process.stderr.write(chalk.red(`${err.code}: ${err.message}\n`));
    if (err.hint) process.stderr.write(chalk.dim(`hint: ${err.hint}\n`));
  } else {
    process.stderr.write(chalk.red(`error: ${(err as Error)?.message ?? err}\n`));
  }
  process.exit(1);
}

async function main() {
  const program = new Command()
    .name("apps-cli")
    .description("Declarative multi-repo dev environment runner")
    .version("0.0.0");

  program
    .command("init")
    .description("create apps.yaml and ensure apps/ is gitignored")
    .action(async () => {
      try {
        const root = (await findProjectRoot(process.cwd())) ?? process.cwd();
        const r = await initCommand(root);
        process.stdout.write(r.created ? "apps.yaml created\n" : "apps.yaml already exists\n");
      } catch (err) { fail(err); }
    });

  const withConfig = async () => loadConfig(process.cwd());

  program
    .command("sync")
    .description("clone/update repos and install dependencies")
    .option("--only <names>", "comma-separated app names")
    .option("--force", "bypass install marker")
    .action(async (opts) => {
      try {
        const { projectRoot, config } = await withConfig();
        const r = await syncCommand(projectRoot, config, {
          only: parseOnly(opts.only), force: !!opts.force,
        });
        process.exit(r.failed.length === 0 ? 0 : 1);
      } catch (err) { fail(err); }
    });

  program
    .command("start")
    .description("run all apps in parallel with prefixed logs")
    .option("--only <names>", "comma-separated app names")
    .action(async (opts) => {
      try {
        const { projectRoot, config } = await withConfig();
        const code = await startCommand(projectRoot, config, { only: parseOnly(opts.only) });
        process.exit(code);
      } catch (err) { fail(err); }
    });

  program
    .command("up")
    .description("sync then start")
    .option("--only <names>", "comma-separated app names")
    .option("--force", "bypass install marker")
    .action(async (opts) => {
      try {
        const { projectRoot, config } = await withConfig();
        const code = await upCommand(projectRoot, config, {
          only: parseOnly(opts.only), force: !!opts.force,
        });
        process.exit(code);
      } catch (err) { fail(err); }
    });

  program
    .command("status")
    .description("show clone/branch/install status for each app")
    .action(async () => {
      try {
        const { projectRoot, config } = await withConfig();
        const rows = await statusCommand(projectRoot, config);
        printStatus(rows);
      } catch (err) { fail(err); }
    });

  await program.parseAsync(process.argv);
}

main();
```

- [ ] **Step 2: Build and typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: `dist/cli.js` exists.

- [ ] **Step 3: Sanity-run the built CLI in a fresh tmpdir**

Run:
```bash
rm -rf /tmp/apps-cli-smoke && mkdir -p /tmp/apps-cli-smoke && cd /tmp/apps-cli-smoke && node <project>/dist/cli.js init && ls -la && cat apps.yaml
```
Expected: prints "apps.yaml created", shows `apps.yaml` and `.gitignore` contents.

- [ ] **Step 4: Run all unit tests**

Run: `npx vitest run`
Expected: all tests PASS across Tasks 2–14.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): wire subcommands through commander"
```

---

## Task 20: Integration test — sync against a local bare repo

**Files:**
- Create: `tests/integration/fixture.ts`
- Create: `tests/integration/sync.test.ts`

This test uses real `git` and real spawn — it skips on CI hosts that lack git (which is essentially none; our matrix includes git on all runners).

- [ ] **Step 1: Write `tests/integration/fixture.ts`**

```ts
import { execa } from "execa";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Fixture {
  tmp: string;
  bareRepo: string;
  projectRoot: string;
}

export async function makeFixture(appName = "demo"): Promise<Fixture> {
  const tmp = await mkdtemp(join(tmpdir(), "apps-cli-"));
  const bareRepo = join(tmp, `${appName}.git`);
  const seed = join(tmp, `${appName}-seed`);
  const projectRoot = join(tmp, "project");

  await execa("git", ["init", "--bare", bareRepo]);
  await execa("git", ["init", seed]);
  await writeFile(join(seed, "README.md"), "hello\n", "utf8");
  await execa("git", ["-C", seed, "add", "."]);
  await execa("git", ["-C", seed, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"]);
  await execa("git", ["-C", seed, "branch", "-M", "main"]);
  await execa("git", ["-C", seed, "remote", "add", "origin", bareRepo]);
  await execa("git", ["-C", seed, "push", "-u", "origin", "main"]);

  await execa("mkdir", ["-p", projectRoot]);
  const yaml = `apps:\n  ${appName}:\n    repo: ${bareRepo}\n    install: node -e "require('fs').writeFileSync('installed.txt','ok')"\n    run: node -e "console.log('ran')"\n`;
  await writeFile(join(projectRoot, "apps.yaml"), yaml, "utf8");

  return { tmp, bareRepo, projectRoot };
}
```

- [ ] **Step 2: Write `tests/integration/sync.test.ts`**

```ts
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
```

- [ ] **Step 3: Run the integration test**

Run: `npx vitest run tests/integration/sync.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/fixture.ts tests/integration/sync.test.ts
git commit -m "test(integration): sync against a local bare repo"
```

---

## Task 21: CI matrix

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: ['18', '20']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: git config --global user.email ci@example.com
      - run: git config --global user.name ci
      - run: npm ci
      - run: npm run typecheck
      - run: npm run build
      - run: npm test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: 3 OS × Node 18/20 matrix"
```

---

## Task 22: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# apps-cli

Declarative runner for multi-repo local dev environments. Install as a devDependency, describe your repos in `apps.yaml`, and run them all with one command.

## Install

```bash
npm install -D apps-cli
```

## Quick start

```bash
npx apps-cli init     # creates apps.yaml and ensures apps/ is gitignored
# edit apps.yaml to list your repos
npx apps-cli up       # clones, installs, starts everything
```

## Config

```yaml
# apps.yaml
appsDir: apps           # optional, default "apps"

apps:
  api:
    repo: git@github.com:acme/api.git
    install: pnpm install
    run: pnpm dev

  web:
    repo: https://github.com/acme/web.git
    install: npm ci
    run: npm run dev
    env:
      PORT: "3001"

  worker:
    repo: git@github.com:acme/worker.git
    install: poetry install
    run: poetry run python -m worker
    cwd: ./src
```

Fields per app:

| Field | Required | Meaning |
|---|---|---|
| `repo` | yes | Git URL (ssh or https) |
| `install` | yes | Shell command to install dependencies |
| `run` | yes | Shell command to start the app |
| `env` | no | Extra env vars for both install and run |
| `cwd` | no | Relative path inside the cloned repo |

App names must match `^[a-zA-Z0-9_-]+$`.

## Commands

- `apps-cli init` — create `apps.yaml` skeleton and add `apps/` to `.gitignore`.
- `apps-cli sync` — clone missing repos, `git fetch` + fast-forward the current branch when safe, install dependencies when the install command changes.
- `apps-cli start` — run all apps in parallel with prefixed logs. Ctrl+C stops them all.
- `apps-cli up` — `sync` then `start`.
- `apps-cli status` — inspect what's cloned, current branch, ahead/behind, dirty state.

Flags: `--only <a,b>` to operate on a subset; `--force` on `sync`/`up` to bypass the install marker.

## How updates work

`sync` runs `git fetch` on every existing repo. It only moves your branch if:

1. The current branch has an upstream.
2. The working tree is clean.
3. The update is a fast-forward.

Otherwise it prints a skip notice and leaves your work alone. `apps-cli` never runs `reset --hard`, `stash`, or anything that touches uncommitted work.

## Auth

`apps-cli` does not manage credentials. For private repos, authenticate git the way you normally do (SSH key, credential helper, `gh auth`). Interactive prompts from git flow straight through to your terminal.

## Platform notes

- Works on macOS and Windows, Node 18+.
- On Windows, `Ctrl+C` kills the process tree via `taskkill /T /F` (through `tree-kill`). If an app spawns grandchildren that don't propagate SIGTERM, they are still killed.
- Shell commands in `install`/`run` use `/bin/sh` on Unix and `cmd.exe` on Windows. Stick to syntax both understand, or use a wrapper script in the repo.

## License

MIT (pending confirmation).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with install, config, and command reference"
```

---

## Task 23: Spec loose ends — `--config`, git preflight, concurrency lock

Spec items caught during self-review that weren't in Tasks 1–22. Grouping them here keeps the plan aligned with the spec.

**Files:**
- Modify: `src/cli.ts` — add `--config <path>` and git preflight
- Create: `src/fs/lock.ts`
- Modify: `src/commands/sync.ts`, `src/commands/start.ts`, `src/commands/up.ts` — acquire lock around mutating commands
- Test: `tests/fs/lock.test.ts`

- [ ] **Step 1: Write the failing test for lock**

`tests/fs/lock.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { vol } from "memfs";
import { acquireLock, releaseLock, LockHeldError } from "../../src/fs/lock.js";

const fs = vol.promises as unknown as typeof import("node:fs").promises;

describe("lock", () => {
  beforeEach(() => vol.reset());

  it("acquires when no lockfile exists", async () => {
    vol.fromJSON({ "/proj/apps/.keep": "" }, "/");
    const h = await acquireLock("/proj/apps/.apps-cli.lock", { pid: 123, isAlive: () => false }, fs);
    expect(h.path).toBe("/proj/apps/.apps-cli.lock");
    expect(vol.readFileSync("/proj/apps/.apps-cli.lock", "utf8").trim()).toBe("123");
  });

  it("throws LockHeldError when PID in file is alive", async () => {
    vol.fromJSON({ "/proj/apps/.apps-cli.lock": "456\n" }, "/");
    await expect(
      acquireLock("/proj/apps/.apps-cli.lock", { pid: 123, isAlive: () => true }, fs),
    ).rejects.toBeInstanceOf(LockHeldError);
  });

  it("replaces stale lock when PID in file is not alive", async () => {
    vol.fromJSON({ "/proj/apps/.apps-cli.lock": "999\n" }, "/");
    const h = await acquireLock(
      "/proj/apps/.apps-cli.lock",
      { pid: 123, isAlive: () => false },
      fs,
    );
    expect(vol.readFileSync(h.path, "utf8").trim()).toBe("123");
  });

  it("releaseLock removes the file", async () => {
    vol.fromJSON({ "/proj/apps/.apps-cli.lock": "123\n" }, "/");
    await releaseLock("/proj/apps/.apps-cli.lock", fs);
    expect(vol.existsSync("/proj/apps/.apps-cli.lock")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fs/lock.test.ts`
Expected: FAIL — import error.

- [ ] **Step 3: Implement `src/fs/lock.ts`**

```ts
import { promises as realFs } from "node:fs";
import type { FsApi } from "./gitignore.js";

export class LockHeldError extends Error {
  constructor(readonly pid: number) {
    super(`another apps-cli is running (pid ${pid})`);
    this.name = "LockHeldError";
  }
}

export interface LockHandle {
  path: string;
}

export interface LockDeps {
  pid: number;
  isAlive: (pid: number) => boolean;
}

const liveCheck = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err?.code === "EPERM";
  }
};

export async function acquireLock(
  path: string,
  deps: LockDeps = { pid: process.pid, isAlive: liveCheck },
  fs: FsApi = realFs,
): Promise<LockHandle> {
  try {
    const existing = await fs.readFile(path, "utf8");
    const heldPid = Number.parseInt(existing.trim(), 10);
    if (Number.isFinite(heldPid) && deps.isAlive(heldPid)) {
      throw new LockHeldError(heldPid);
    }
  } catch (err: any) {
    if (err instanceof LockHeldError) throw err;
    if (err?.code !== "ENOENT") throw err;
  }
  await fs.writeFile(path, `${deps.pid}\n`, "utf8");
  return { path };
}

export async function releaseLock(path: string, fs: FsApi = realFs): Promise<void> {
  try {
    // @ts-expect-error memfs exposes unlink; node fs.promises does too
    await fs.unlink(path);
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fs/lock.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire lock + preflight + `--config` into `src/cli.ts`**

Replace the `withConfig` helper, add a preflight, and have mutating commands acquire/release the lock. Show the full updated `main()`:

```ts
import { Command } from "commander";
import { join } from "node:path";
import chalk from "chalk";
import { execa } from "execa";
import { loadConfig, type LoadedConfig } from "./config/load.js";
import { initCommand } from "./commands/init.js";
import { syncCommand } from "./commands/sync.js";
import { startCommand } from "./commands/start.js";
import { upCommand } from "./commands/up.js";
import { statusCommand, printStatus } from "./commands/status.js";
import { AppsCliError, GitError } from "./errors.js";
import { findProjectRoot, appsDirFor } from "./fs/paths.js";
import { acquireLock, releaseLock, LockHeldError } from "./fs/lock.js";
import { ConfigSchema } from "./config/schema.js";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import yaml from "js-yaml";

function parseOnly(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function fail(err: unknown): never {
  if (err instanceof AppsCliError || err instanceof LockHeldError) {
    process.stderr.write(chalk.red(`${(err as any).code ?? err.name}: ${err.message}\n`));
    if ((err as AppsCliError).hint) {
      process.stderr.write(chalk.dim(`hint: ${(err as AppsCliError).hint}\n`));
    }
  } else {
    process.stderr.write(chalk.red(`error: ${(err as Error)?.message ?? err}\n`));
  }
  process.exit(1);
}

async function gitPreflight(): Promise<void> {
  try {
    await execa("git", ["--version"]);
  } catch {
    throw new GitError("git not found in PATH", { hint: "install git and retry" });
  }
}

async function loadFromExplicitPath(configPath: string): Promise<LoadedConfig> {
  const raw = await readFile(configPath, "utf8");
  const parsed = yaml.load(raw);
  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new AppsCliError("ConfigError", `apps.yaml invalid — ${issues}`);
  }
  return { projectRoot: dirname(configPath), config: result.data };
}

async function getConfig(opts: { config?: string }): Promise<LoadedConfig> {
  if (opts.config) return loadFromExplicitPath(opts.config);
  return loadConfig(process.cwd());
}

async function main() {
  const program = new Command()
    .name("apps-cli")
    .description("Declarative multi-repo dev environment runner")
    .version("0.0.0")
    .option("--config <path>", "explicit path to apps.yaml");

  program
    .command("init")
    .description("create apps.yaml and ensure apps/ is gitignored")
    .action(async () => {
      try {
        const root = (await findProjectRoot(process.cwd())) ?? process.cwd();
        const r = await initCommand(root);
        process.stdout.write(r.created ? "apps.yaml created\n" : "apps.yaml already exists\n");
      } catch (err) { fail(err); }
    });

  program
    .command("sync")
    .description("clone/update repos and install dependencies")
    .option("--only <names>", "comma-separated app names")
    .option("--force", "bypass install marker")
    .action(async (cmdOpts) => {
      const opts = { ...program.opts(), ...cmdOpts };
      try {
        await gitPreflight();
        const { projectRoot, config } = await getConfig(opts);
        const lockPath = join(appsDirFor(projectRoot, config.appsDir), ".apps-cli.lock");
        const lock = await acquireLock(lockPath);
        try {
          const r = await syncCommand(projectRoot, config, {
            only: parseOnly(cmdOpts.only), force: !!cmdOpts.force,
          });
          process.exit(r.failed.length === 0 ? 0 : 1);
        } finally { await releaseLock(lock.path); }
      } catch (err) { fail(err); }
    });

  program
    .command("start")
    .description("run all apps in parallel with prefixed logs")
    .option("--only <names>", "comma-separated app names")
    .action(async (cmdOpts) => {
      const opts = { ...program.opts(), ...cmdOpts };
      try {
        await gitPreflight();
        const { projectRoot, config } = await getConfig(opts);
        const lockPath = join(appsDirFor(projectRoot, config.appsDir), ".apps-cli.lock");
        const lock = await acquireLock(lockPath);
        try {
          const code = await startCommand(projectRoot, config, { only: parseOnly(cmdOpts.only) });
          process.exit(code);
        } finally { await releaseLock(lock.path); }
      } catch (err) { fail(err); }
    });

  program
    .command("up")
    .description("sync then start")
    .option("--only <names>", "comma-separated app names")
    .option("--force", "bypass install marker")
    .action(async (cmdOpts) => {
      const opts = { ...program.opts(), ...cmdOpts };
      try {
        await gitPreflight();
        const { projectRoot, config } = await getConfig(opts);
        const lockPath = join(appsDirFor(projectRoot, config.appsDir), ".apps-cli.lock");
        const lock = await acquireLock(lockPath);
        try {
          const code = await upCommand(projectRoot, config, {
            only: parseOnly(cmdOpts.only), force: !!cmdOpts.force,
          });
          process.exit(code);
        } finally { await releaseLock(lock.path); }
      } catch (err) { fail(err); }
    });

  program
    .command("status")
    .description("show clone/branch/install status for each app")
    .action(async () => {
      const opts = program.opts();
      try {
        const { projectRoot, config } = await getConfig(opts);
        const rows = await statusCommand(projectRoot, config);
        printStatus(rows);
      } catch (err) { fail(err); }
    });

  await program.parseAsync(process.argv);
}

main();
```

Also export `LoadedConfig` from `src/config/load.ts`:

```ts
// already exported as `LoadedConfig` — confirm the interface is `export`ed
```

- [ ] **Step 6: Typecheck and run all tests**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx vitest run`
Expected: all PASS including new lock tests and existing integration test (integration test must still pass — the integration fixture doesn't trigger the lock conflict; ensure the test also creates `apps/` before lock acquisition. `syncCommand` already does `mkdir -p`, so by the time `acquireLock` runs the directory exists — but now `acquireLock` runs **before** `syncCommand`. Fix: run `mkdir -p appsDir` in `cli.ts` right before `acquireLock`. Add that line inside each `action` block, before `acquireLock`.)

Revised snippet (apply to `sync`, `start`, `up` blocks):

```ts
const appsDir = appsDirFor(projectRoot, config.appsDir);
await (await import("node:fs/promises")).mkdir(appsDir, { recursive: true });
const lockPath = join(appsDir, ".apps-cli.lock");
const lock = await acquireLock(lockPath);
```

Re-run tests after this fix.

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts src/fs/lock.ts tests/fs/lock.test.ts
git commit -m "feat(cli): --config flag, git preflight, concurrency lock"
```

---

## Self-review notes

Checked against the spec (`docs/superpowers/specs/2026-04-23-apps-cli-design.md`):

- §3.1 package layout → Task 1
- §3.2 source layout → each file is created in Tasks 2–19, 23
- §3.3 module boundaries (DI) → all outside-world modules accept their effectful deps as parameters
- §3.4 dependencies → Task 1 `package.json`
- §4 config schema → Task 7 (schema), Task 8 (loader)
- §5 command surface: `init`→14, `sync`→16, `start`→17, `up`→18, `status`→15; `--only`/`--force` in 19; `--config` in 23
- §6.1 git operations → Tasks 9, 10, 11; preflight in Task 23
- §6.2 install marker → Task 5; `--force` wired in Task 19
- §6.3 orchestrator → Task 13
- §7 errors → Task 2 classes; each command raises the right subtype
- §7 concurrency lockfile → Task 23
- §8 testing → unit tests cover Tasks 2–14, 23; integration test in Task 20; CI matrix in Task 21

No placeholders, no "TBD", no "similar to Task N". Types and method signatures are consistent across tasks (`ExecFn`, `FsApi`, `GitState`, `AppRun`, `ChildHandle`, `SpawnFn`, `KillFn`, `LockHandle`, `LoadedConfig`).
