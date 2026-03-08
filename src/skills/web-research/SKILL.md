---
name: web-research
description: Search, fetch, and summarize web sources with short citations. Use for research, verification, and link-backed answers.
always: true
---
Use this skill when the user asks for current information, references, or source-backed summaries.

Workflow:
1. Use `web_search` with a focused query.
2. Select the top 2-3 most relevant results.
3. Fetch those specific results with `web_fetch`.
4. Summarize findings concisely.
5. Include links in the final answer.

Quality bar:
- Prefer primary sources when possible.
- If sources conflict, call it out directly.
- Do not invent citations.
- Be selective: Fetch a maximum of 3 sources to ensure efficiency and avoid loops.
