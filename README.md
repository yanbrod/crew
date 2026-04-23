# crew

[![npm](https://img.shields.io/npm/v/@ianbrode/crew?style=flat-square)](https://www.npmjs.com/package/@ianbrode/crew)
[![license](https://img.shields.io/npm/l/@ianbrode/crew?style=flat-square)](./LICENSE)
[![node](https://img.shields.io/node/v/@ianbrode/crew?style=flat-square)](https://nodejs.org)

> Run your whole polyrepo dev environment with one command. **Compose without containers.**

`crew` is a Node.js CLI that reads a `crew.yaml` at your project root, clones the listed git repositories into a local `apps/` folder, installs their dependencies, and runs them all in parallel with merged, prefixed logs. One file, one command, all your services up.

If you've ever written a bash script to `git clone` three repos, `cd` into each, `npm install`, then open three terminal tabs to `npm run dev` — this replaces it.

## When you want this

You're actively developing across several packages at once — say a backend, a frontend, and a worker — each in its own repo, each with its own hot-reload. You edit code in one, see it reflected in another through an API call, then tweak the third. This is the daily loop.

Doing this through containers is painful: file-watch across volume mounts is unreliable or slow, rebuilds invalidate caches, mounted `node_modules` fight with host `node_modules`, and attaching a debugger to a running container is a ritual. For the inner dev loop — where you're changing code every few seconds — you want processes running natively on your machine, reading from real checkouts you can edit, branch, and commit in like any other repo.

`crew` is for exactly that case: multi-repo, natively-running, all dev servers alive at once, one command to bring them up, one `Ctrl+C` to bring them down.

## Why not docker-compose?

Because you don't always want to containerize local dev. Sometimes you want:

- **Native speed** — no volume mounts, no file-watch weirdness, no Rosetta translation on Apple Silicon.
- **Real debuggers** — attach VS Code or your IDE directly to the Node/Python/whatever process, no remote-debug gymnastics.
- **Your actual repos** — work happens in `apps/my-service/` as a normal checkout you can branch, commit, and push from.
- **Heterogeneous stacks** — one repo is Node, another is Poetry, another is a Rust binary. Each gets its own `install` and `run` command; `crew` doesn't care.

`docker-compose` is great for production-shaped local environments. `crew` is for the daily dev loop.

## Install

```bash
npm install -D @ianbrode/crew
```

Package is published under the scope `@ianbrode` on npm. The CLI binary is plain `crew` — invoke as `npx crew <command>` or add it to an npm script.

Requires Node 18+ and `git` in your `PATH`.

## Quick start

```bash
npx crew init     # creates crew.yaml and adds apps/ to .gitignore
# edit crew.yaml to list your repos
npx crew up       # clone → install → start everything
```

Hit `Ctrl+C` to stop all apps at once.

## crew.yaml

```yaml
# crew.yaml
appsDir: apps         # optional, default "apps"

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

### Fields

| Field | Required | Meaning |
|---|---|---|
| `repo` | yes | Git URL (ssh or https) |
| `install` | yes | Shell command to install dependencies |
| `run` | yes | Shell command to start the app |
| `env` | no | Extra environment variables for `install` and `run` |
| `cwd` | no | Relative path inside the cloned repo to `cd` into before running commands |

App names must match `^[a-zA-Z0-9_-]+$` (they become folder names and log prefixes).

## Commands

| Command | What it does |
|---|---|
| `crew init` | Create `crew.yaml` skeleton and ensure `apps/` is in `.gitignore` |
| `crew sync` | Clone missing repos, safely pull current branch where possible, re-install when the `install` command changes |
| `crew start` | Run every `run` command in parallel with `[name]` log prefixes; `Ctrl+C` kills them all |
| `crew up` | `sync` then `start` — the primary workflow |
| `crew status` | Read-only: what's cloned, current branch, dirty state, ahead/behind, install-marker freshness |

### Flags

- `--only <a,b>` — operate on a subset of apps (`sync`, `start`, `up`)
- `--force` — rerun `install` even if the marker says it's up to date (`sync`, `up`)
- `--config <path>` — explicit path to a `crew.yaml` instead of auto-discovering by walking up from the cwd

## How updates work

`crew sync` is deliberately careful about your local work. On every repo already cloned:

1. Runs `git fetch`. Always.
2. If the current branch has an upstream **and** the working tree is clean **and** a fast-forward is possible → `git merge --ff-only`.
3. Otherwise → prints a skip notice and leaves the working tree untouched.

`crew` will **never** run `git reset --hard`, `git stash`, `git checkout --`, or anything else that could lose uncommitted work. If `sync` says "skipped: working tree dirty" — your changes are still there. If you're on a feature branch, your branch stays put; only the remote refs get refreshed.

## Auth

`crew` does not manage credentials. For private repos, authenticate git the normal way (SSH key in agent, credential helper, `gh auth login`). Interactive prompts from git — passphrase, SSH host key confirmation, credential manager — flow straight through to your terminal.

## Platform notes

- **macOS, Linux, Windows.** Tested on Node 18 and 20 across all three in CI.
- **Ctrl+C** tears down the whole process tree via `tree-kill` — `SIGTERM` + `taskkill /T /F` on Windows. Apps that spawn grandchildren (webpack, tsc --watch, python -m …) still die cleanly.
- **Shell**: commands in `install` / `run` go through `sh -c` on Unix, `cmd.exe /c` on Windows. Stick to syntax both understand, or put a wrapper script inside the repo (`run: ./scripts/dev.sh`).

## How it's different

| | docker-compose | foreman / overmind | turborepo / nx | **crew** |
|---|---|---|---|---|
| Multiple repos | ✗ (one tree) | ✗ | ✗ | ✓ |
| Containers | ✓ | ✗ | ✗ | ✗ |
| Heterogeneous langs | ✓ | ✓ | partial | ✓ |
| Cross-platform | ✓ | macOS/Linux | ✓ | ✓ |
| Native speed | ✗ | ✓ | ✓ | ✓ |
| Safe `git pull` | ✗ | ✗ | ✗ | ✓ |

If your services already share a monorepo, use `turbo` or `nx`. If you need container parity with prod locally, use `docker-compose`. If your services live in separate repos and you want a one-command local stack without containers, use `crew`.

## FAQ

**Can I use this in CI?** Not the intended use. `crew` is a dev-loop tool: interactive signals, pretty terminal output, long-running processes. CI wants reproducible single-shot scripts.

**What if two apps need to start in order?** Right now, no. All apps start in parallel. Apps that need a backend to be up should either retry, or you start them in two `crew up --only <names>` calls. Dependency ordering may come later if there's demand — open an issue.

**Can I add a repo that's already cloned outside `apps/`?** Not directly. `crew` clones into `apps/<name>/`. If you already have the repo somewhere, either symlink `apps/my-app` → your existing checkout (at your own risk with `sync`), or just `cp -r` it in.

**What about secrets / `.env` files?** Put them in the repos themselves. `crew.yaml`'s `env` field is for inline overrides (like `PORT=3001`); for anything sensitive, rely on each repo's own dotenv loading.

**Why is `Ctrl+C` so aggressive?** Because dev servers that ignore SIGTERM are common (looking at you, webpack). `crew` sends SIGTERM, waits 5 seconds, then sends SIGKILL. Adjust by running your app in a wrapper if you need graceful shutdown.

## Contributing

Issues and PRs welcome at <https://github.com/yanbrod/crew>.

```bash
git clone https://github.com/yanbrod/crew
cd crew
npm install
npm test            # vitest, 48 tests
npm run typecheck   # strict TypeScript
npm run build       # bundles to dist/cli.js
```

> The source repo is `yanbrod/crew` (my GitHub handle); the npm package is `@ianbrode/crew` (my npm handle). Same project, two different account names across the two services.

The `docs/superpowers/specs/` and `docs/superpowers/plans/` folders contain the original design spec and implementation plan (historical — they reference the old working name `apps-cli`).

## Links

- 📦 npm: [`@ianbrode/crew`](https://www.npmjs.com/package/@ianbrode/crew)
- 🔨 source: [github.com/yanbrod/crew](https://github.com/yanbrod/crew)
- 🛠 binary name: `crew` (invoke via `npx crew <cmd>` or an npm script)

## License

MIT.
