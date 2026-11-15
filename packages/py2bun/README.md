# py2bun

Python 3 to Bun TypeScript transpiler, built for Ghidra (PyGhidra) scripts.

- Rust crate: `src/py2bun` (standalone workspace, parser `ruff_python_parser` 0.0.22 from crates.io).
- PyO3 module (abi3, `py2bun._py2bun`): `py2bun.transpile(source) -> str`, `py2bun.transpile_with_diagnostics(source) -> (ts, [(line, col, severity, message)])`.
- Bun runtime: `@aphrody/py2bun/runtime` (builtins, operators, `str`/`list`/`dict` methods), plus `runtime/{math,json,os,sys,re,time,string,struct,random}`.
- Bun wrapper: `import { transpile } from "@aphrody/py2bun"` shells to the Rust CLI `py2bun-rs`.

## Existing tools (searched 2026-11-15)

| Tool | Verdict |
|---|---|
| py2many 0.9 (PyPI, 1347 stars) | Targets Rust, C++, Go, Zig, Mojo, no TypeScript/Bun target; no Ghidra idioms. |
| sebastian-software/python2ts (2 stars) | TypeScript-written transpiler, not embeddable from PyO3/Rust, no Java/Ghidra mapping. |
| Transcrypt 3.9.5 (PyPI) | Python to JavaScript with its own runtime (browser oriented), Python-side tool, no Bun TypeScript, no Ghidra idioms. |
| rustpython-parser 0.4.0 | Parser only, last release 2024-08. |
| ruff_python_parser 0.0.22 | Parser only, published 2026-11-12: chosen as the front end. |

No existing tool emits Bun-runnable TypeScript with Ghidra FlatAPI and Java namespace mapping, embeddable from Rust and PyO3.

## Usage

```sh
# Rust CLI (fr1: cargo build --release in src/py2bun)
py2bun-rs script.py -o script.ts          # --json diagnostics on stderr, --strict
# Python (uv + maturin)
uv build                                   # in packages/py2bun
uv run --with ./dist/*.whl py2bun script.py -o script.ts
# Bun
bun packages/py2bun/src/cli.ts script.py -o script.ts
```

Exit status 1 when the input does not parse or an error diagnostic exists (the `.ts` is still written when it was produced; unsupported constructs are emitted as a throwing `__py.unsupported("...")`).

## Mapping

- Imports: `from ghidra.x.y import A` becomes `import { A } from "@aphrody/ghidra/java/ghidra/x/y"` (roots `ghidra java javax generic docking utility db org com resources ...`); `import ghidra` becomes `import { ghidra } from "@aphrody/ghidra/java"`; `pyghidra` maps to `@aphrody/ghidra`; stdlib `math json os sys re time string struct random` map to `@aphrody/py2bun/runtime/<name>`; other modules are reported.
- Ghidra script globals (`currentProgram`, `toAddr`, `getFunctionAt`, `println`, `askString`, `monitor`, ...) are resolved to `import { ... } from "@aphrody/ghidra/script"`. The name list (`GHIDRA_FLAT` in `src/py2bun/src/names.rs`) is generated from `packages/ghidra/src/script.generated.ts` (193 functions) plus the script fields; ambiguous names (`start`, `end`, `set`, `show`, `print`, ...) never capture an unbound Python name.
- Async mode (default when the script uses Ghidra, `--async`/`--sync` to force): Ghidra calls cross a process boundary, so every `def` becomes `async`, every non-builtin call is `await`ed, `for` becomes `for await (... of __py.aiter(x))`, comprehensions are async IIFEs, `and`/`or`/`==`/`%`/`str()`/`len()`/`list()`/`sorted()`... use the `a_*` variants of `runtime/async.ts` (Java iterables go through `$list()`, Java strings through `$str()`). JS constructors (`__init__`), accessors, `toString` and lambdas cannot await: calls inside are left unawaited and reported as warnings. Java classes are constructed as `await X.new_(...)` (`new X(...)` only in sync mode) (`JClass` of `packages/ghidra`).
- Java namespaces are imported from `@aphrody/ghidra/java` (root proxy) and `@aphrody/ghidra/java/<package path>` (class proxies). These two entry points are the contract py2bun relies on; they are not exported by `packages/ghidra` yet (its `package.json` exports only `.`, `./script`, `./flat`, `./plugin`, `./preload`, `./analysis`).
- `pyghidra`: `import pyghidra` becomes `import * as pyghidra from "@aphrody/ghidra"` and attributes are camel-cased (`pyghidra.open_program` -> `pyghidra.openProgram`, per `packages/ghidra/PARITY.md`); `with pyghidra.open_program(...) as flat:` is not translated to `await using` (reported through the generic `with` path: the handle, not the flat API, is bound).
- Jython idioms: implicit package roots (`java.util.ArrayList()`, `ghidra.app...`) are imported on use; `from pkg import *` is resolved lazily name by name (`const X = await __py.starPick([...], "X")`, top-level await); `print x`, `print >>f, x`, `except A, e:` are rewritten (warning per line); `xrange unicode long raw_input unichr basestring reduce file` exist in the runtime.
- Scoping: assigned names are hoisted as `let` per function and module; classes become `class` (`self` aliased with `const self = this`); `try/except/else/finally`, `with`, `for/else`, `while/else`, comprehensions (IIFE), f-strings (template literals with `__py.format`), tuple unpacking, `*args`, keyword arguments (positional mapping for module functions, `__py.kw({...})` otherwise).
- Python 2 fallback: when a file does not parse, `print x`, `print >>f, x` and `except X, e:` lines are rewritten and a warning is emitted per line.
- Calls to Java classes imported from Java namespaces use `new`.

## Diagnostics

Errors (unsupported): `match`, `except*`, decorators other than `staticmethod`/`classmethod`/`property`/`setter`, class decorators, multiple inheritance, metaclasses, complex literals, star imports of unmapped modules, unmapped modules, `**` in dict comprehension. Matrix multiplication (`@`) emits `__py.unsupported` with an error diagnostic. Calls to `os.path` and the ignored modules in `IGNORED_MODULES` (`src/py2bun/src/names.rs`) are mapped or dropped without a diagnostic. Flags: `py2bun-rs` implements `--json --strict --async --sync`; `src/cli.ts` and `cli.py` only `-o`.
Warnings: unresolved names, class attributes emitted as `static`, eager generator expressions, keyword arguments to unresolved callees, Python 2 rewrites.

## Conversion rate on aphrody-labs/ghidra (aa800ba9, all 146 `*.py` of the repo)

| Set | Files | Transpiled, no diagnostic | No error diagnostic | Valid TS (`bun build --no-bundle`) | Executed under bun-ghidra |
|---|---|---|---|---|---|
| `*/ghidra_scripts/*.py` (Jython and PyGhidra scripts) | 25 | 3 | 21 | 25 | 0 (pending) |
| whole repo (adds PyGhidra library, debugger agents, IDA plugins) | 146 | 15 | 36 | 144 (2 inputs do not parse) | 0 (pending) |

Most remaining diagnostics on the full set are library code (decorators, third-party modules such as `comtypes`, `lldb`, class bodies). Run under bun-ghidra is pending: `@aphrody/ghidra/java` and `@aphrody/ghidra/java/*` are not exported by `packages/ghidra` yet, and a headless Ghidra run on fr2 spends minutes in import and analysis per script. Emitted TS from plain Python is executed end to end by `packages/py2bun/test/wrapper.test.ts`.

## Tests

```sh
cargo test                 # in src/py2bun (fr1)
bun test packages/py2bun   # runtime and wrapper (fr2)
uv run --with pytest pytest packages/py2bun/tests   # after maturin develop / wheel install
```
