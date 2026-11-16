---
name: ay-monorepo-migrator
description: Audit and migrate legacy Node.js, V8, Electron, node-api-dotnet and Lua repositories with the `migrate` subcommand of depot-cli (crate `system/depot/migrate`): AST codemods, LLVM IR checks, .NET CoreCLR readiness. Use when a legacy tree must be audited or transformed; the target language follows the domain (AGENTS.md section 4).
---

# depot `migrate`

Engine: crate `depot-migrate` (`system/depot/migrate`: `rules.rs` rule tables, `transformer.rs`, `dotnet.rs`, `llvm.rs`); CLI: the `migrate` subcommand in `system/depot/cli` (`MigrateArgs`). `ay` does not route a `migrate` subcommand to it yet (`ay migrate` is not in `system/ay/src/lib.rs`); check `ay --help` before using that form. Electron apps go through `ay electron` (skill `electron-migrate`); Python scripts through `py2bun`.

Flags of `migrate <root>` (read from `MigrateArgs`, re-read `system/depot/cli/src/lib.rs` for the full list):

- `--dry-run`: report without modifying files.
- `--dotnet`: CoreCLR `hostfxr` and .NET SDK readiness.
- `--llvm`: LLVM IR compilation and vectorization pipeline inspection.

Run a dry run first and read the report before applying; the migration target is chosen per project, not imposed by this skill.
