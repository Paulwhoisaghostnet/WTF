# @wtfos/cli

Native terminal client for [wtfOS](https://wtfos.app). Install globally and use the same safe, allowlisted command kernel as the in-browser Terminal and full-screen `/cli` shell.

## Install

```bash
npm install -g @wtfos/cli
```

From this monorepo during development:

```bash
npm run wtfos:cli:build
npm install -g ./packages/wtfos-cli
```

Both `wtfos` and `wtf` bin names are provided.

## Quick start

```bash
# Public diagnostics (no login required)
wtfos health
wtfos routes

# Point at local dev
export WTFOS_URL=http://localhost:3000
wtfos health

# Sign in for whoami and session-scoped routes
wtfos login
wtfos whoami

# Interactive shell
wtfos
wtf> banner
wtf> theme tezos
wtf> open /mission-control
wtf> exit
```

## Configuration

Files live in `~/.config/wtfos/` (mode `700` for the directory, `600` for files):

| File | Purpose |
| --- | --- |
| `config.json` | `baseUrl`, `theme` |
| `session.json` | Browser session cookie after `wtfos login` |

Environment overrides:

- `WTFOS_URL` or `WTFOS_BASE_URL` — deployment origin (default `https://wtfos.app`)

```bash
wtfos config set baseUrl http://localhost:3000
wtfos config set theme tezos
wtfos config get baseUrl
```

## Auth model

The native CLI uses the same **browser session cookie** (`connect.sid`) as the web app after `wtfos login`. It does not execute shell commands on the server and does not bypass wtfOS access boundaries.

For agent/automation workflows, use MCP bearer tokens on `/mcp` instead of this CLI.

## Safety

- Allowlisted commands only — same kernel as `/terminal` and `/cli` in the browser
- `open /path` and quick-launch commands call the server gate (`/api/cli/can-open`) before printing a URL
- `routes` lists only paths your session may open — same gates as the web UI
- No arbitrary server shell, no code execution, no privilege escalation beyond the browser

### Security notes

- **Session file** — `~/.config/wtfos/session.json` holds your browser cookie (mode `600`). Treat the directory like `~/.ssh`.
- **Login** — prefer interactive `wtfos login` without flags. `--password` warns because argv is visible in process lists.
- **baseUrl** — production hosts (`wtfos.app`, `wtfgameshow.app`) require `https`. Local dev may use `http://localhost:3000`. Set `WTFOS_ALLOW_INSECURE=1` only for trusted non-production overrides.
- **Errors** — the CLI shows short API error messages only; HTML/stack traces from misconfigured origins are not echoed verbatim.

## Commands

Run `wtfos help` or start the REPL and type `help`.

Core commands: `health`, `status`, `jobs`, `access`, `routes`, `mcp`, `whoami`, `theme`, `banner`, `motd`, `open`, `echo`, and quick-launch aliases (`wallet`, `rewards`, `settings`, `recovery`, `commands`).

Top-level only: `login`, `logout`, `whoami`, `config`, `shell`.
