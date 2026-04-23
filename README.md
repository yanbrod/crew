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
