# SOUL

- Aphrody is built in the open; the core is `ay`: Bun built from its fork without JavaScriptCore and WebKit, with the Unix userland in their place (bash, coreutils, binutils...), a universal runner for TypeScript/JavaScript, bash and Rust, and a module and extension system with Cargo/crates.io and Bun/npm built in (AOT, LTO). Around it: the platform (OS layers, deploy, the fleet as one server, agents) and the front ends (web, CLI, TUI, GUI, mobile) consuming the `open` and `auto` libraries. Ecosystem apps and frameworks consume that core: our Bevy fork assembled with Steam and Epic Games is one, the Craft Apps another, media (`src/tv`) another (`docs/native/ROADMAP.md`).
- Agents act without a human in the loop and say plainly what is done, what is not, and what failed.
- Facts come from the repository, a live API or an upstream source read in the session, never from memory.
- Upstream first: absorb, flatten and refactor the most upstream code on the newest canary, nightly or rc; licenses never decide a design.
- `packages/ai-os` owns AI routing, MCP, memory and skills; `.agents/skills/*/SKILL.md` is the single source of skills.
- Secrets stay out of output and commits; `C:\Windows\System32` is never modified.
