---
name: agent-creator
description: Create and configure new isolated agents by editing hare.json and setting up their routing bindings.
---
Use this skill when the user asks to spin up, create, or configure a new agent.

Workflow:
1. **Gather Requirements**: Determine the agent's `id`, `name`, `model` (e.g. `anthropic/claude-3-haiku`), and `profile` (e.g. `full`, `coding`, `messaging`). Also determine how it should be routed (e.g. which `channel` and `peerId`).
2. **Read Config**: Use `read_file` to open `~/.hareio/hare.json`.
3. **Update Config**: Use `edit_file` to add the new agent to the `agents.list` array, and add the routing rule to the `bindings` array.
4. **Restart**: Use the `exec` tool to run `hare gateway restart` to apply the changes.
5. **Report**: Tell the user the new agent is online and ready to chat.

Quality bar:
- Ensure the JSON remains valid.
- Route bindings specifically (use `peerId` for DMs to avoid hijacking a whole channel).
- Only use standard profiles (`full`, `coding`, `messaging`, `minimal`).