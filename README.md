# Hare

Hare is a local-first, gateway-oriented agent runtime. It is designed to provide a persistent, stateful execution environment for AI agents while maintaining a thin, portable interface for the user.

## Architecture

Hare is split into two primary components:

1.  **The Gateway**: A long-running background process that manages WebSocket connections, LLM provider state, communication channels (Discord/Telegram), and agent memory. It serves as the "brain" and control plane.
2.  **The CLI**: A thin client that connects to the Gateway to issue commands and receive streamed responses. It can also operate in a standalone "local" mode for one-off tasks.

This decoupling allows agents to maintain long-running tasks, monitor channels, and preserve session state regardless of whether a terminal session is active.

---

## Quick Start

### 1. Installation
Clone the repository and install dependencies:
```bash
npm install
npm run build
npm install -g .
```

### 2. Configuration
Run the onboarding wizard to configure AI providers (OpenAI, Anthropic, or Gemini) and generate a Gateway security token:
```bash
hare onboard
```

### 3. Execution
Start the Gateway in the background (Linux):
```bash
hare gateway install
hare gateway start
```
Or run it in the foreground for debugging:
```bash
npm run gateway:dev
```

### 4. Interaction
Interact with the default agent:
```bash
hare "Summarize the files in this directory"
```
Or launch the interactive Text User Interface (TUI):
```bash
hare tui
```

---

## Core Concepts

### Sessions and Memory
Hare manages state through a tiered memory system:
- **Sessions**: Every conversation is tracked via a unique `sessionId`. History is stored in `.jsonl` format.
- **Compaction**: To stay within context windows, Hare periodically "compacts" history into summaries.
- **Persistent Memory**: Durable facts are extracted during compaction and stored in `MEMORY.md`, providing a long-term "soul" for the agent.

### Skills vs. Tools
- **Tools**: Low-level capabilities (e.g., `read_file`, `web_search`) defined in TypeScript.
- **Skills**: High-level "playbooks" defined in Markdown. Skills provide the agent with specific workflows, such as `code-review` or `web-research`, by injecting specialized context and instructions.

### The Gateway Protocol
The CLI and Gateway communicate over a versioned WebSocket protocol. This protocol supports:
- **Bi-directional streaming**: Real-time assistant deltas.
- **Idempotency**: Safe retries for network-sensitive operations.
- **Session Lanes**: Concurrent agent runs are serialized per-session to prevent state corruption.

---

## Documentation

For detailed information, please refer to the following guides:

- [**Setup Guide**](SETUP.md): Detailed provider and channel configuration.
- [Architecture Overview](docs/architecture.md)
- [Gateway Protocol](docs/gateway.md)
- [Workspace & Memory](docs/workspace-bootstrap.md)
- [Linux Daemon Management](docs/daemon-linux.md)
