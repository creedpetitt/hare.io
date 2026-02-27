# Setup Guide

This guide provides detailed instructions for configuring Hare providers, integrating communication channels, and managing the Gateway service.

## Prerequisites

- **Node.js**: Version 22 or higher is required.
- **Operating System**: Linux is required for native `systemd` service integration. macOS and Windows (WSL) are supported for manual execution.

---

## 1. AI Provider Configuration

Hare supports multiple LLM providers. It is recommended to configure at least one primary provider.

### OpenAI
1. Obtain an API key from the [OpenAI Dashboard](https://platform.openai.com/).
2. Run `hare setup --section llm` and select OpenAI.
3. Alternatively, set the `OPENAI_API_KEY` environment variable.

### Anthropic
1. Obtain an API key from the [Anthropic Console](https://console.anthropic.com/).
2. Run `hare setup --section llm` and select Anthropic.
3. Alternatively, set the `ANTHROPIC_API_KEY` environment variable.

### Google Gemini
1. Obtain an API key from [Google AI Studio](https://aistudio.google.com/).
2. **Note**: Hare utilizes the `v1beta` API for Gemini to support advanced tool calling.
3. Run `hare setup --section llm` and select Gemini.
4. Alternatively, set the `GEMINI_API_KEY` environment variable.

---

## 2. Search Provider Configuration

To enable the `web_search` tool, you must configure a search provider. Currently, Hare supports Brave Search.

### Brave Search
1. Sign up for the [Brave Search API](https://api.search.brave.com/app/dashboard).
2. Run `hare setup --section web`.
3. Enter your API key when prompted.

---

## 3. Communication Channels

Hare can operate as a background bot on Discord or Telegram. The Gateway manages these connections persistently.

### Telegram Integration
1. Message [@BotFather](https://t.me/botfather) on Telegram to create a new bot.
2. Copy the **Bot Token**.
3. Run `hare setup --section telegram` and paste the token.
4. Start the channel: `hare telegram start`.
5. To allow your account to interact with the bot, run `hare telegram allow-me` and follow the pairing instructions in your Telegram DM.

### Discord Integration
1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Navigate to the **Bot** tab and reset/copy the **Token**.
3. Ensure **Message Content Intent** is enabled under the "Privileged Gateway Intents" section.
4. Run `hare setup --section discord` and paste the token.
5. Start the channel: `hare discord start`.
6. Use `hare discord allow-me` to pair your Discord user ID with the agent.

---

## 4. Gateway Service Management (Linux)

For production-like stability, Hare integrates with `systemd` as a user service. This ensures the Gateway starts on boot and restarts on failure.

### Installation
```bash
hare gateway install
```
This writes a unit file to `~/.config/systemd/user/hare-gateway.service` and enables the service.

### Controlling the Service
- **Start**: `hare gateway start`
- **Stop**: `hare gateway stop`
- **Restart**: `hare gateway restart`
- **Logs**: `journalctl --user -u hare-gateway.service -f`

### Persistence Across Logouts
By default, user services stop when the last session ends. To keep the Gateway running after you log out:
```bash
loginctl enable-linger $USER
```

---

## 5. Security & Network

- **Gateway Token**: All WebSocket connections require a shared secret token. This is generated automatically during `hare setup`.
- **Listening Address**: By default, the Gateway binds to `127.0.0.1:18789`. If you intend to connect from a remote machine, you must use a secure tunnel (e.g., SSH tunneling) or a reverse proxy with TLS. Do not expose the WebSocket port directly to the internet.
