# apps-cli — Design Spec

**Date:** 2026-04-23
**Status:** Draft, awaiting user review
**Working name:** `apps-cli` (final name TBD before publish)

## 1. Purpose

A Node.js CLI installed as a devDependency in a host project. From the project root it reads a declarative `apps.yaml` that lists external git repositories ("apps"), clones them into a gitignored `apps/` folder, installs their dependencies, keeps them up to date, and runs them all in parallel with prefixed log output. One command (`apps-cli up`) takes a fresh checkout to a fully running local dev environment.

Cross-platform: macOS and Windows. Node 18+.

## 2. Constraints and non-goals

**In scope (MVP):**
- Install as `npm i -D apps-cli`; invoked from project root.
- Config is YAML at the project root.
- Apps are heterogeneous — explicit `install` and `run` shell commands per app.
- Apps are cloned into `apps/<name>`, gitignored.
- Git auth passes through to the user's terminal; no credential management.
- Updates: always `git fetch`; fast-forward the currently-checked-out branch only if clean and upstream exists; otherwise skip with a notice.
- Run all apps in parallel, logs merged in one terminal with `[name]` prefix; Ctrl+C kills all.
- Works on macOS and Windows.

**Deliberately out of scope** (add when asked, not before):
- Dependency ordering / `depends_on` / healthchecks.
- Custom branch pinning in config (`branch: main`).
- Built-in auth/token management (keychain integration).
- Multi-terminal / TUI orchestration.
- Background / detached processes (`pm2`-style).
- Config inheritance, variable substitution, includes.
- Retries, timeouts, per-app restart policies.

## 3. Architecture

### 3.1 Package layout

Published as `apps-cli`. `package.json` declares `"bin": { "apps-cli": "dist/cli.js" }`. TypeScript source compiles to ESM for Node 18+. Users invoke via `npx apps-cli <cmd>` or an npm script.

### 3.2 Source layout

```
src/
  cli.ts                  # commander entry point; wires subcommands
  commands/
    init.ts               # create apps.yaml skeleton + .gitignore entry
    sync.ts               # clone / fetch / ff-pull / install
    start.ts              # spawn all run commands in parallel
    status.ts             # read-only inspection
    up.ts                 # sync && start
  config/
    schema.ts             # zod schema for apps.yaml
    load.ts               # locate, parse, validate
  git/
    clone.ts              # git clone with inherited stdio (for auth prompts)
    update.ts             # fetch + safe ff-pull
    inspect.ts            # branch, upstream, dirty?, ahead/behind
  runner/
    spawn.ts              # execa wrapper, shell: true
    orchestrator.ts       # parallel run, log prefixing, signal handling
  fs/
    paths.ts              # project-root resolution, apps/ path
    gitignore.ts          # idempotent `apps/` entry
  log.ts                  # prefixed, colored line formatter
  errors.ts               # ConfigError, GitError, InstallError, RuntimeError
```

### 3.3 Module boundaries

- `config/`, `git/`, `runner/`, `fs/` each have a single responsibility and a small public surface. Each is usable and testable without the others.
- `commands/` are thin glue — they compose the lower layers and handle exit codes. No business logic lives in `commands/`.
- `log.ts` is pure (no side effects beyond writing to passed-in streams). The orchestrator owns the actual stdout.

### 3.4 Dependencies

Runtime: `commander`, `execa`, `js-yaml`, `zod`, `chalk`, `tree-kill`.
Dev: `typescript`, `vitest`, `memfs`, `@types/*`, `tsup` (or equivalent bundler).

Explicitly not used: `simple-git` (direct `git` via `execa` is clearer), `concurrently` (own orchestrator for signal correctness on Windows), `inquirer` (no interactive prompts from the tool itself).

## 4. Config schema

**Filename:** `apps.yaml` at project root. The CLI walks up from cwd until it finds the file (or a `package.json` without it → error).

**Example:**

```yaml
appsDir: apps            # optional, default "apps"

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

**Per-app fields:**

| Field | Required | Meaning |
|---|---|---|
| `repo` | yes | Git URL (ssh or https — both work; auth passes through to git) |
| `install` | yes | Shell command run after clone and on install-marker mismatch |
| `run` | yes | Shell command for `start` |
| `env` | no | Map of env vars merged over `process.env` |
| `cwd` | no | Relative path inside the cloned repo for `install` and `run` (default: repo root) |

App name = the map key. It becomes both the log prefix and the folder name under `apps/`. Validated against `^[a-zA-Z0-9_-]+$`.

**Validation:** strict zod schema. Unknown fields and wrong types produce named errors with the YAML line/column when possible. All errors in a config are reported at once, not one per run.

## 5. Command surface

Every command locates `apps.yaml` first (walks upward from cwd). If missing, it prints `no apps.yaml found — run \`apps-cli init\`` and exits 1.

### `apps-cli init`
Creates `apps.yaml` skeleton (one commented example app) and ensures `apps/` is in `.gitignore` (creates the file if absent; idempotent). If `apps.yaml` already exists, prints `apps.yaml already exists` and exits 0.

### `apps-cli sync`
Brings `apps/` into alignment with the config. Processes apps **sequentially** (auth prompts from parallel clones would interleave unreadably):

1. `apps/<name>` missing → `git clone <repo> apps/<name>` with inherited stdio. On success, run `install` (§6.2) in `apps/<name>/<cwd>`.
2. `apps/<name>` present → `git fetch`, then:
   - upstream missing → skip `no upstream`
   - working tree dirty → skip `working tree has changes`
   - otherwise → `git merge --ff-only <upstream>`. Non-ff → skip `non-fast-forward`.
3. Install marker (§6.2) mismatched or missing → re-run `install`.

`sync` is idempotent. A failure on one app prints the error and continues with the rest; overall exit is `1` if any app failed, `0` otherwise.

Flags: `--only <a,b>`, `--force` (bypass install marker).

### `apps-cli start`
Runs every app's `run` command in parallel via the orchestrator (§6.3). Requires prior `sync` — if any `apps/<name>` is missing it prints `<name> not synced, run \`apps-cli sync\` first` and exits 1.

Flags: `--only <a,b>`.

### `apps-cli up`
`sync && start`. This is the primary user-facing command; `up` is what README leads with.

Flags: union of `sync` + `start`.

### `apps-cli status`
Read-only table per app: cloned?, current branch, dirty?, ahead/behind origin, install-marker valid? Exits 0.

### Common flags
- `--config <path>` — override config location (skip upward search)
- `--help`, `--version` — from commander

### Exit codes
- `0` success
- `1` any failure (validation, clone, install, runtime)
- `130` parent received SIGINT (convention)

## 6. Core behaviors

### 6.1 Git operations

All git calls go through `execa('git', [...args], { cwd })`. Pre-flight check at startup: `git --version` must succeed, otherwise fail with `git not found in PATH`.

- **`clone(repo, dest)`** — `git clone <repo> <dest>` with `stdio: 'inherit'`. Interactive prompts (password, SSH host key, credential helpers) flow straight through.
- **`inspect(dir)`** returns:
  - `currentBranch` — `git rev-parse --abbrev-ref HEAD`
  - `upstream` — `git rev-parse --abbrev-ref --symbolic-full-name @{u}` (may be absent)
  - `isDirty` — `git status --porcelain` non-empty
  - `aheadBehind` — `git rev-list --left-right --count <upstream>...HEAD` (only if upstream)
- **`update(dir)`** — `git fetch` (inherited stdio for auth), then apply the rules from §5 `sync` step 2.

### 6.2 Install and install marker

Marker file: `apps/<name>/.apps-cli-installed` containing the SHA-256 of the app's `install` field. Before running install:

- marker missing or hash differs → run `install`; on success, write new marker
- marker matches → skip

Trade-off: if the user deletes `node_modules/` by hand, `sync` won't notice. Workaround: `apps-cli sync --force` ignores the marker. This is simpler and more predictable than trying to fingerprint lockfiles across ecosystems (node/pnpm/yarn/poetry/cargo/…).

### 6.3 Orchestrator

Parallel run of all `run` commands with merged, prefixed stdout/stderr.

**Spawning:** `execa(cmd, { shell: true, cwd, env: { ...process.env, ...app.env }, stdio: ['ignore', 'pipe', 'pipe'] })`. `shell: true` lets users write commands exactly as they would in a terminal (pipes, `&&`, env expansion). macOS uses `/bin/sh`, Windows uses `cmd.exe` — `execa` picks the right one.

**Log prefixing:** each app gets a fixed color from a round-robin palette (`cyan magenta yellow green blue red`). Streams are buffered by newline and written with `[<name>] ` prefix. No interleaving within a single output line.

**Lifecycle:**
- Any child exits with a non-zero code → print `[<name>] exited with code <n>`, shut down the rest, exit 1.
- Any child exits with code 0 → treated the same as non-zero for `start` (the command is meant for long-lived dev servers). `oneShot: true` may be added later if a real need appears.
- Parent receives SIGINT/SIGTERM → graceful shutdown: `tree-kill(pid, 'SIGTERM')` per child, wait up to 5s, then `tree-kill(pid, 'SIGKILL')`. Exit 130 on SIGINT, 143 on SIGTERM.

**Cross-platform signaling:** `tree-kill` encapsulates the OS split — `kill` + process group on Unix, `taskkill /T /F` on Windows. This is why we don't roll our own process-tree teardown.

## 7. Errors and edge cases

All user-facing errors follow `<type>: <reason> — <actionable hint>`.

**Config (`ConfigError`)**
- `apps.yaml` not found → hint: `run \`apps-cli init\``
- YAML parse failure → include line/column from js-yaml
- Schema violation → all zod issues, each with its path (e.g. `apps.web.run: required`)
- Invalid app name (regex violation, duplicate, reserved like `.`) → explicit reject

**Git (`GitError`)**
- `git` not found in PATH → single preflight error at startup
- Clone failure (auth, network, 404) → print git's actual stderr; don't paraphrase
- Fetch failure → warn, continue to next app (network flaps shouldn't abort `sync`)
- `no upstream` / `dirty` / `non-ff` → info-level skip, not an error

**Install (`InstallError`)**
- Non-zero exit → print exit code and last ~50 lines of stderr; **do not** write the install marker (next `sync` will retry)

**Runtime (orchestrator)**
- One child exits non-zero → shut down the rest, exit 1
- One child exits 0 → same (see §6.3)
- SIGINT from user → graceful shutdown, exit 130

**Filesystem**
- Spaces or non-ASCII in project path → execa quotes args correctly; user is responsible for quoting inside their own yaml commands. Documented in README.
- Pre-existing symlink at `apps/<name>` → leave it, don't follow into it for clone.
- `.gitignore` missing at `init` → create it.
- `apps/` already in `.gitignore` → idempotent, don't duplicate.

**Concurrency**
- Two `apps-cli` runs in the same project → `apps/.apps-cli.lock` contains PID; second process fails with `another apps-cli is running (pid <n>)`. Stale lock (PID not alive) is replaced.

## 8. Testing strategy

**Framework:** `vitest`.

### Unit (bulk of tests)
- `config/schema.ts` — tabular valid/invalid cases (missing field, wrong type, unknown key, duplicate name, bad regex).
- `config/load.ts` — upward search via `memfs`; found-in-parent, not-found cases.
- `git/inspect.ts` — mock `execa` with canned git stdout; assert parsed struct.
- `git/update.ts` — table: `dirty`, `no upstream`, `clean+ff`, `non-ff` → correct skip reason or merge call.
- `runner/orchestrator.ts` — mock spawn: parallel start; newline-buffered prefixing (no cross-app line splicing); SIGINT triggers tree-kill on all children; one child failure tears down the rest.
- `fs/gitignore.ts` — empty file, non-empty without `apps/`, already contains `apps/` (idempotent).

### Integration (narrow, scenario-based)
- Create a tmpdir with a local bare repo (`git init --bare fixture.git`) and one commit.
- Write `apps.yaml` pointing to that local path.
- Run `node dist/cli.js sync` as subprocess.
- Assert: `apps/<name>/` exists with the commit; `.apps-cli-installed` written; second run does not re-clone; fetch + ff-pull behave; dirty state causes skip.

**Not tested in integration:** real GitHub/network (flaky), `start` against real dev servers (brittle). The orchestrator is fully covered by unit tests with mocked spawns.

### CI
GitHub Actions matrix: `ubuntu-latest`, `windows-latest`, `macos-latest` × Node 18, 20. All three OSes required — cross-platform is a shipped promise, it must be machine-verified.

### Pre-release
Manual smoke: `npm link` into a sibling project, run `init → sync → start → Ctrl+C` on macOS and Windows. Once before first publish and before each major.

## 9. Open questions

- Final package name (`apps-cli` is a working title). Needs npm availability check before publish.
- License (MIT assumed, pending confirmation).

---

## Appendix: summary of decisions

| Decision | Chosen | Rejected alternatives |
|---|---|---|
| Ecosystem | Node.js / npm devDependency | Python, Go/Rust binary |
| App runtime | Heterogeneous, explicit install/run | Node-only with defaults |
| Output | Merged logs with `[name]` prefix | TUI, per-terminal windows, background + log files |
| Auth | Pass stdin/stdout through to git | Token manager + keychain |
| Updates | Fetch always; ff-pull current branch if clean; else skip | Hard reset; interactive prompt; manual-only |
| Branch tracked | Currently-checked-out | Fixed in yaml; repo default HEAD |
| Startup order | Parallel, no deps | `depends_on`; linear `order:` list |
| Command surface | `init / sync / start / up / status` | Single mega-command only |
| Orchestration lib | Own orchestrator over `execa` + `tree-kill` | `concurrently` |
| Config format | YAML | JSON |
