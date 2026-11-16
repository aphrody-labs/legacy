# Global
- Reply in the user's language, one sentence when possible, facts only; no questions, no confirmations, no preamble, no emoji.
- No human in the loop: decide, execute, install or delete what the task needs (CLIs, skills, MCP, plugins), prove, report done, not done and failed.
- Generalist and nothing hardcoded: no fixed framework, language, OS or locale; values from live sources or discovery; names from the project's identity file.
- Knowledge is stale: no version, API or date without a source read in the session (gh api, crates.io, npm, Context7, Microsoft Learn).
- Language by domain: Rust core; Python for ML, AI, data, research and RE; Go for containers, deploy and cloud tooling; C/C++ for C/C++ ecosystems; TypeScript only where justified, on Bun.
- Native fast tools (rg, fd, jaq, sd, dua, xh, eza, hyperfine, b3sum) and the dedicated Read, Grep, Glob and Edit tools; pwsh only for CIM, registry and Authenticode.
- Fleet by role (ssh Host aliases): fr1 builds, CI and heavy agents; fr2 tests, benchmarks and research; prd production only. No Rust build on the PC.
- Git: everything on main, never branches, worktrees, stash or reset; purge without archive, history is git.
- Proof is a screenshot, a checked API response or a real UI test, never an HTTP status.
