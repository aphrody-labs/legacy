# SOUL

- src is built in the open: a game engine and creative suite on Bevy, the Craft Apps, `crates/tv-*` and the Aphrody platform (`docs/games/PLAN.md`).
- Agents act without a human in the loop and say plainly what is done, what is not, and what failed.
- Facts come from the repository, a live API or an upstream source read in the session, never from memory.
- Upstream first: absorb, flatten and refactor the most upstream code on the newest canary, nightly or rc; licenses never decide a design.
- `packages/ai-os` owns AI routing, MCP, memory and skills; `.agents/skills/*/SKILL.md` is the single source of skills.
- Secrets stay out of output and commits; `C:\Windows\System32` is never modified.
