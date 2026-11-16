---
name: py2bun
description: Python to Bun TypeScript transpiler (crate src/py2bun, package system/py2bun-ts) with Ghidra script idioms. Use to convert a Python 3 or Jython-era Ghidra script to Bun TypeScript, check why a construct is unsupported, or change the transpiler or its runtime.
---

# py2bun

Parser `ruff_python_parser` 0.0.22. Emits Bun TS importing `@aphrody/py2bun/runtime` and, for Ghidra, `@aphrody/ghidra/script` (flat API) and `@aphrody/ghidra/java/*` (Java proxy, not exported yet by frameworks/re-ts/ghidra). README: `system/py2bun-ts/README.md`.

- Relay: `hub_call py2bun__py2bun_transpile {source}` returns `{ts, diagnostics, ok}`.
- CLI (build on fr1): `cargo build --release` in `src/py2bun`, then `py2bun-rs file.py -o file.ts [--async|--sync] [--json] [--strict]`. Python: `uv build` in `system/py2bun-ts`, `py2bun file.py -o file.ts`. Bun: `bun system/py2bun-ts/src/cli.ts file.py`.
- Ghidra scripts are async (every call awaited); Python 2 print/except lines are rewritten with a warning; unsupported constructs (match, decorators, multiple inheritance, unmapped modules) are error diagnostics and throw at run time.
- Tests: `cargo test` (fr1), `bun test system/py2bun-ts` (fr2, set `PY2BUN_BIN`), pytest via uv.
