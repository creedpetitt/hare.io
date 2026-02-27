---
name: skill-creator
description: Autonomously define and implement new skills to extend agent capabilities. Use this to automate repetitive workflows or teach the agent new domain-specific playbooks.
---
Use this skill when you identify a repeatable workflow that isn't yet captured as a skill, or when the user explicitly asks you to "learn" or "automate" a new task.

Workflow:
1. **Identify the Need**: Determine the name, clear description, and step-by-step workflow for the new skill.
2. **Draft the Content**: Create a Markdown structure including the required frontmatter (name and description) and a clear "Workflow" section.
3. **Verify Path**: Skills must be stored in the workspace under `skills/<skill-name>/SKILL.md`.
4. **Implementation**: Use the `write_file` tool to create the directory and write the `SKILL.md` file. Ensure the skill name is kebab-case (e.g., `git-helper`).
5. **Validation**: Inform the user that the skill has been created and is available for future turns (via `/skill <name>` or auto-activation).

Quality bar:
- Names should be concise and descriptive.
- Workflows must be actionable and list specific tools if applicable.
- Frontmatter must be valid Markdown (fenced by `---`).
- Do not overwrite existing core skills without confirmation.
