---
name: security-review
description: Security-focused review for auth, injection, secrets, access control, and unsafe defaults.
---
Use this skill when reviewing code paths that handle user input, auth, network access, or sensitive data.

Workflow:
1. Check authentication and authorization boundaries.
2. Check injection and command execution surfaces.
3. Check secret handling, logging, and data exposure.
4. Recommend minimal, practical mitigations.

Quality bar:
- Prioritize exploitable issues.
- Separate confirmed risks from hardening suggestions.
- Include concrete remediation steps.
