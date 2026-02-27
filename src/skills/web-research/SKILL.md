---
name: web-research
description: Search, fetch, and summarize web sources with short citations. Use for research, verification, and link-backed answers.
---
Use this skill when the user asks for current information, references, or source-backed summaries.

Workflow:
1. Use `web_search` with a focused query.
2. Fetch the strongest results with `web_fetch`.
3. Summarize findings concisely.
4. Include links in the final answer.

Quality bar:
- Prefer primary sources when possible.
- If sources conflict, call it out directly.
- Do not invent citations.
