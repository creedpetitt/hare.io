# hare.io

Hare is a local, gateway-first agent runtime. The Gateway is the long-running
process (WebSocket control plane + agent execution). The CLI is a thin client
that connects to the Gateway to run agent turns.

This repo is intentionally early-stage. The docs below describe:

- What exists today (and how to use it)
- How the runtime is structured
- What is planned next

## Quick Start (Local)

Prereqs:

- Node 22+ (recommended)
- npm

Install deps:

```bash
npm install
```

Configure providers and gateway token:

```bash
hare setup
```

Or run quickstart onboarding:

```bash
hare onboard
```

Start the Gateway (dev mode):

```bash
npm run gateway:dev
```

Run a prompt via the Gateway:

```bash
hare "hello from gateway"
```

Stop dev Gateway:

```bash
# Ctrl+C in the gateway:dev terminal
```

## Quick Start (Daemon / systemd user)

This installs a user systemd unit and starts it immediately.

```bash
npx tsx src/cli/index.ts gateway install
```

Check status:

```bash
hare gateway status
```

Run a prompt:

```bash
hare "hello from daemon"
```

Stop / start:

```bash
hare gateway stop
hare gateway start
```

Uninstall:

```bash
hare gateway uninstall
```

Notes:

- The systemd unit is written to: `~/.config/systemd/user/hare-gateway.service`.
- For always-on across logouts, enable lingering:
  `loginctl enable-linger <your-username>`.

## Install (npm + installer script)

Packaging is set up so `hare` runs from `dist/`. You can install locally from
the repo or (when published) from npm.

From repo:

```bash
npm run build
npm install -g .
```

Dev note: during active development, prefer running the CLI from source so you
always use the latest code:

```bash
npx tsx src/cli/index.ts <command>
```

Global installs (`npm install -g .`) are best when you want to test the
packaged `dist/` build. Otherwise the global `hare` binary can lag behind your
working tree.

Installer script (macOS/Linux/WSL):

```bash
curl -fsSL https://example.com/install.sh | bash
```

After install:

```bash
hare onboard
hare "hello"
```

## Concepts

### Gateway

The Gateway is the hub. It accepts WebSocket connections and runs agent turns
on behalf of clients. It also enforces auth and protocol validation.

### CLI

The CLI is a client. It connects to the Gateway by default and sends agent
requests. Use `--local` for direct local execution (no Gateway).

### Agent Workspace (Bootstrap Files)

Each agent has a workspace under:
`~/.hareio/agents/<agentId>/workspace`

On first run, Hare seeds these files:

- `SOUL.md` – personality / tone
- `AGENTS.md` – operational rules
- `TOOLS.md` – tool usage conventions
- `IDENTITY.md` – name/version metadata
- `USER.md` – user preferences
- `MEMORY.md` – persistent memory entries

To customize behavior, edit those files directly.

### Sessions + Memory

- Session logs live in `~/.hareio/agents/<agentId>/sessions/`.
- Messages are stored as JSONL.
- A compacted summary is stored in `*.summary.md`.
- `MEMORY.md` is appended with durable facts.

## CLI Reference

### Core

- `hare` – interactive chat (Gateway by default)
- `hare <prompt>` – one-shot prompt
- `hare --local <prompt>` – run locally without Gateway
- `hare --agent <id>` – use a specific agent workspace
- `hare --profile <name>` – tool profile (`minimal`, `coding`, `full`)

### Setup + Provider Config

- `hare setup` – configure providers + generate gateway token
- `hare token rotate` – rotate gateway token
- `hare provider use <openai|anthropic>` – set default provider
- `hare provider current` – show default provider
- `hare provider model set <openai|anthropic> <model>` – set provider model

### Agent Reset

- `hare reset` – wipe memory + sessions for the current agent

### Gateway Management (Linux)

- `hare gateway install` – write unit + enable/start service
- `hare gateway uninstall` – stop/disable/remove service
- `hare gateway start|stop|restart` – service control
- `hare gateway status` – systemd status + WS readiness
- `hare gateway foreground` – run Gateway in the current terminal

Environment overrides:

- `HARE_GATEWAY_URL` – default WS URL (e.g. `ws://127.0.0.1:18789/ws`)
- `HARE_GATEWAY_TOKEN` – override token for WS auth

## Gateway Protocol (Current)

WebSocket endpoint:
`ws://127.0.0.1:18789/ws`

Handshake is mandatory and validated:

```json
{
  "type": "req",
  "id": "1",
  "method": "connect",
  "params": {
    "minProtocol": 1,
    "maxProtocol": 1,
    "client": {
      "id": "cli",
      "version": "0.1.0",
      "platform": "linux",
      "mode": "operator"
    },
    "role": "operator",
    "scopes": ["operator.read", "operator.write"],
    "auth": { "token": "<gateway-token>" }
  }
}
```

Agent request:

```json
{
  "type": "req",
  "id": "2",
  "method": "agent",
  "params": {
    "input": "Say hello from the gateway",
    "agentId": "main",
    "sessionId": "main"
  }
}
```

Responses are two-stage:

- Ack: `{ runId, status: "accepted" }`
- Final: `{ runId, status: "ok", summary }` or `{ status: "error", error }`

## Repo Layout (Key Paths)

- `src/cli/` – CLI entry + commands
- `src/gateway/` – Gateway server + protocol + client
- `src/core/` – Agent runtime, config, tools, memory
- `src/tools/` – Tool implementations
- `~/.hareio/` – user config + workspaces

## Configuration

Config file:
`~/.hareio/hare.json`

Contains:

- gateway token
- provider API keys
- default provider + model

## What Exists Today

- Gateway with full handshake + non-streaming agent runs
- CLI Gateway client + local fallback (`--local`)
- systemd user service install/start/stop/status
- Workspace bootstrap + memory compaction

## Planned / Next

- Packaging for npm (dist-based install)
- Onboarding wizard (setup + gateway + health)
- Windows service support
- Streaming responses/events
- Web tools (fetch/search)
- Channel integrations (Slack/Discord/etc.)
- Control UI / Dashboard

See `docs/roadmap.md` for detail.

## Docs

- `docs/architecture.md`
- `docs/cli.md`
- `docs/gateway.md`
- `docs/workspace-bootstrap.md`
- `docs/daemon-linux.md`
- `docs/config.md`
- `docs/install.md`
- `docs/roadmap.md`
