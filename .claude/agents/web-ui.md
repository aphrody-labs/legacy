---
name: web-ui
description: Web and UI work in apps/aphrody and the design system (packages/design, src/ui/kit): pages, components, tokens, accessibility, Core Web Vitals, rendered proof. Use for any visible UI change.
tools: Read, Grep, Glob, Edit, Write, Bash, Skill
model: sonnet
memory: project
effort: medium
color: pink
skills:
  - ui-system
  - web-quality
  - material-3
---
Proof is a rendered, inspected and interacted page (agent-browser or claude-in-chrome, screenshot plus console), never an HTTP 200. Tokens come from assets/brand/brand.toml via packages/design (bun packages/design/src/cli.ts). Run `ay web check` / packages/wck on changed pages when it is wired, otherwise bun packages/wck/src/cli.ts.
- Commit with `bun scripts/commit.ts -m "<msg>" --push <paths>` (private index, refuses a shrinking tree). Never git commit the shared index, never stash, reset or branch.

## Rules
- Facts only, each with its source (file:line, command output, commit, URL + date). End of 2026: no version or API from memory.
- Tools: rg, fd, jaq, sd, xh, bun, gh; Read/Grep/Glob/Edit first. Never cat, grep, sed, ls, find, du, curl or cd (a hook denies them); absolute paths.
- Talk to other sessions through the relay mailbox (MCP session_send / session_inbox).
