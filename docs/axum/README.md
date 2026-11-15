# Axum, tower, tower-http

Rust HTTP stack of the Shenron TypeScript to Rust migration (`apps/shenron/crates/shenron-api`, ADR 0004 of Shenron), and of any src service built on Axum.

| Fork                      | Upstream                     | Checkout                 | Commit (synced 2026-11-15) | Version                              |
| ------------------------- | ---------------------------- | ------------------------ | -------------------------- | ------------------------------------ |
| `aphrody-labs/axum`       | `tokio-rs/axum` (main)       | `third_party/axum`       | `2449f160`                 | axum 0.8.9 released, main is 0.9-dev |
| `aphrody-labs/tower-http` | `tower-rs/tower-http` (main) | `third_party/tower-http` | `8569ec8b`                 | 0.7.1                                |
| `aphrody-labs/tower`      | `tower-rs/tower` (master)    | `third_party/tower`      | `df06d70d`                 | 0.5.3                                |

- Sync: `bun scripts/vcs.ts fork sync axum` (likewise `tower` and `tower-http`); the forks are listed in `third_party/forks.txt`.
- Code graphs: `graph/<repo>/` (`ay graph build -o <dir> third_party/<repo>`, tree-sitter). Each holds `GRAPH_REPORT.md`, `ARCHITECTURE.mermaid` and `graph.svg`. Sizes: axum 7400 nodes, 13869 edges and 620 communities; tower-http 4686 nodes, 9993 edges and 199 communities; tower 2099 nodes, 3357 edges and 188 communities. Rebuild `graph.json` locally to query it (`ay graph query`).
- Agent skill: `.agents/skills/axum/` (Vercel agent-skills layout). It holds 13 rules with impact, an incorrect and a correct example, and the source file each was checked against. `AGENTS.md` is compiled by `bun .agents/skills/axum/scripts/compile.ts`.
- Features and the plan for porting the Shenron host: [FEATURES.md](FEATURES.md).
