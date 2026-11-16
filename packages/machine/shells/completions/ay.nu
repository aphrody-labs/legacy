# généré par packages/machine/src/shells.ts depuis `ay --help` — ne pas éditer
# Signatures externes : complétion native nushell des sous-commandes et options de `ay`.
export extern "ay" [
  --help(-h)  # Print help
  --version(-V)  # Print version
]
export extern "ay doctor" [
  --deps  # check the supply-chain policy (docs/deps/POLICY.md) instead
  --dups  # with --deps: list every crate resolved at several versions
  --json  # with --deps: JSON report
  --root: string  # repository root (default: $SRC_ROOT, else the nearest
  --help  # display usage information
  ...args: string
]
export extern "ay lock" [
  --root: string  # repository root (default: $SRC_ROOT, else the nearest
  --out: string  # output lockfile path (default: <root>/src.lock.json)
  --lock-only  # write src.lock.json only (no derived manifests)
  --deps  # refresh the language locks (Cargo.lock, bun.lock, uv.lock)
  --bump  # with --deps: upgrade within the declared requirements (cargo
  --breaking  # with --deps: also raise Cargo requirements across major
  --hoist  # with --deps: move inline member requirements into
  --dedupe  # with --deps: collapse duplicate crate versions where a lower
  --help  # display usage information
  ...args: string
]
export extern "ay manifests" [
  --root: string  # repository root (default: $SRC_ROOT, else the nearest
  --check  # verify instead of writing: exit 1 when a derived file or a
  --help  # display usage information
  ...args: string
]
export extern "ay git" [
  --help  # display usage information
]
export extern "ay git ingest" [
  --format(-f)  # format: markdown, xml, json (default: markdown)
  --max-tokens(-m)  # max token budget (clamps and prioritizes important files)
  --output(-o)  # output file path (defaults to stdout)
  --include(-i)  # include glob patterns
  --exclude(-e)  # exclude glob patterns
  --outline  # produce high-density symbol outline only
  --help  # display usage information
  ...args: string
]
export extern "ay git graph" [
  --help  # display usage information
]
export extern "ay git graph build" [
  --out-dir(-o)  # output directory (default: graphify-out)
  --help  # display usage information
  ...args: string
]
export extern "ay git graph query" [
  --dfs  # use DFS traversal instead of default BFS
  --budget(-b)  # max token budget for LLM context output (default: 2000)
  --help  # display usage information
  ...args: string
]
export extern "ay git graph path" [
  --help  # display usage information
  ...args: string
]
export extern "ay git graph explain" [
  --help  # display usage information
  ...args: string
]
export extern "ay git graph mcp" [
  --help  # display usage information
  ...args: string
]
export extern "ay git ast" [
  --query(-q)  # tree-sitter S-expression query (e.g. "(function_item) @fn")
  --json  # output as JSON
  --help  # display usage information
  ...args: string
]
export extern "ay git lua" [
  --help  # display usage information
]
export extern "ay git lua ast" [
  --json(-j)  # emit structured JSON output
  --help  # display usage information
  ...args: string
]
export extern "ay git lua disasm" [
  --json(-j)  # emit structured JSON output
  --help  # display usage information
  ...args: string
]
export extern "ay git lua transcode" [
  --output(-o)  # output .luac path
  --arch(-a)  # target architecture: wasm32 or x64 (default: wasm32)
  --help  # display usage information
  ...args: string
]
export extern "ay git lua migrate" [
  --write(-w)  # apply edits in-place
  --help  # display usage information
  ...args: string
]
export extern "ay git lua init" [
  --help  # display usage information
  ...args: string
]
export extern "ay git re" [
  --json  # output as JSON
  --help  # display usage information
  ...args: string
]
export extern "ay git migrate" [
  --dry-run  # dry run without modifying files on disk
  --help  # display usage information
  ...args: string
]
export extern "ay git rope" [
  --replace(-r)  # replacement specification: START_BYTE:END_BYTE:REPLACEMENT
  --help  # display usage information
  ...args: string
]
export extern "ay git just" [
  --dir(-d)  # working directory or justfile path (default: ".")
  --json  # output recipes as JSON
  --help  # display usage information
  ...args: string
]
export extern "ay git gix" [
  --commits(-c)  # commit history limit (default: 5)
  --json  # output as JSON
  --help  # display usage information
  ...args: string
]
export extern "ay git forge" [
  --help  # display usage information
]
export extern "ay git forge repo" [
  --json  # output as JSON
  --help  # display usage information
  ...args: string
]
export extern "ay git forge org" [
  --limit(-l)  # limit results (default: 30)
  --json  # output as JSON
  --help  # display usage information
  ...args: string
]
export extern "ay git analyze" [
  --help  # display usage information
  ...args: string
]
export extern "ay git worktree" [
  --help  # display usage information
]
export extern "ay git worktree list" [
  --help  # display usage information
  ...args: string
]
export extern "ay git worktree add" [
  --new(-n)  # create a new branch (-n / --new)
  --repo(-r)  # base repository path (default: ".")
  --help  # display usage information
  ...args: string
]
export extern "ay git worktree remove" [
  --force(-f)  # force removal even if untracked changes exist
  --repo(-r)  # base repository path (default: ".")
  --help  # display usage information
  ...args: string
]
export extern "ay git worktree prune" [
  --repo(-r)  # base repository path (default: ".")
  --help  # display usage information
  ...args: string
]
export extern "ay git fork" [
  --help  # display usage information
]
export extern "ay git fork status" [
  --help  # display usage information
  ...args: string
]
export extern "ay git fork set-upstream" [
  --help  # display usage information
  ...args: string
]
export extern "ay git fork sync" [
  --branch(-b)  # specific branch to sync
  --strategy(-s)  # strategy: ff, rebase, merge (default: ff)
  --help  # display usage information
  ...args: string
]
export extern "ay git slim" [
  --help  # display usage information
  ...args: string
]
export extern "ay git clone" [
  --branch(-b)  # specific branch
  --depth(-d)  # shallow clone depth
  --sparse: string  # sparse paths to include
  --help  # display usage information
  ...args: string
]
export extern "ay git artifacts" [
  --help  # display usage information
]
export extern "ay git artifacts verify" [
  --help  # display usage information
  ...args: string
]
export extern "ay git artifacts hash" [
  --help  # display usage information
  ...args: string
]
export extern "ay git artifacts init" [
  --name(-n)  # project name (default: project)
  --help  # display usage information
  ...args: string
]
export extern "ay git maintainer" [
  --root(-r)  # monorepo root path (default: C:\aphrody)
  --help  # display usage information
  ...args: string
]
export extern "ay git ignore" [
  --template(-t)  # template: rust, bun, chromium, python, llm (default: llm)
  --output(-o)  # output path (default: .gitignore)
  --help  # display usage information
  ...args: string
]
export extern "ay git info" [
  --help  # display usage information
  ...args: string
]
export extern "ay ingest" [
  --format(-f)  # format: markdown, xml, json (default: markdown)
  --max-tokens(-m)  # max token budget (clamps and prioritizes important files)
  --output(-o)  # output file path (defaults to stdout)
  --include(-i)  # include glob patterns
  --exclude(-e)  # exclude glob patterns
  --outline  # produce high-density symbol outline only
  --help  # display usage information
  ...args: string
]
export extern "ay graph" [
  --help  # display usage information
]
export extern "ay graph build" [
  --out-dir(-o)  # output directory (default: graphify-out)
  --help  # display usage information
  ...args: string
]
export extern "ay graph query" [
  --dfs  # use DFS traversal instead of default BFS
  --budget(-b)  # max token budget for LLM context output (default: 2000)
  --help  # display usage information
  ...args: string
]
export extern "ay graph path" [
  --help  # display usage information
  ...args: string
]
export extern "ay graph explain" [
  --help  # display usage information
  ...args: string
]
export extern "ay graph mcp" [
  --help  # display usage information
  ...args: string
]
export extern "ay deploy" [
  ...args: string
]
export extern "ay bench" [
  --help  # display usage information
]
export extern "ay bench run" [
  --tier: string  # tier to benchmark: all, cuda, rust, msvc, dotnet, bun
  --output: string  # output path for JSON profile
  --help  # display usage information
  ...args: string
]
export extern "ay bench pick" [
  --workload: string  # target workload: gpu-compute, compositor, systems-cli,
  --profile: string  # path to measured hardware profile
  --help  # display usage information
  ...args: string
]
export extern "ay bench zero-copy" [
  --help  # display usage information
  ...args: string
]
export extern "ay bench cold-start" [
  --help  # display usage information
  ...args: string
]
export extern "ay bench lmbench" [
  --help  # display usage information
  ...args: string
]
export extern "ay bench octane" [
  --help  # display usage information
  ...args: string
]
export extern "ay bench shell-bench" [
  --help  # display usage information
  ...args: string
]
export extern "ay bench report" [
  --help  # display usage information
  ...args: string
]
export extern "ay scope" [
  ...args: string
]
export extern "ay gaming" [
  ...args: string
]
export extern "ay upstream" [
  ...args: string
]
export extern "ay linux" [
  ...args: string
]
export extern "ay pkg" [
  ...args: string
]
export extern "ay lfs" [
  ...args: string
]
export extern "ay ssh" [
  --help(-h)  # Print help
]
export extern "ay ssh exec" [
  --accept-new  # Trust and record host keys missing from known_hosts (a mismatch is still refused)
  --timeout: string  # Connect timeout in seconds when ~/.ssh/config sets no ConnectTimeout [default: 10]
  --user(-l): string  # Remote user (overrides ~/.ssh/config)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ssh cp" [
  --accept-new  # Trust and record host keys missing from known_hosts (a mismatch is still refused)
  --timeout: string  # Connect timeout in seconds when ~/.ssh/config sets no ConnectTimeout [default: 10]
  --user(-l): string  # Remote user (overrides ~/.ssh/config)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ssh hosts" [
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ssh check" [
  --accept-new  # Trust and record host keys missing from known_hosts (a mismatch is still refused)
  --timeout: string  # Connect timeout in seconds when ~/.ssh/config sets no ConnectTimeout [default: 10]
  --user(-l): string  # Remote user (overrides ~/.ssh/config)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay rt" [
  --help(-h)  # Print help
]
export extern "ay rt ls" [
  --help(-h)  # Print help
  ...args: string
]
export extern "ay rt matrix" [
  --json  # 
  --help(-h)  # Print help
  ...args: string
]
export extern "ay rt detect" [
  --help(-h)  # Print help
  ...args: string
]
export extern "ay rt switch" [
  --runtime: string  # runtime[@version|range|lts|latest], repeatable (node, deno, bun, python)
  --engine: string  # engine id from `browser-engines engines list` (chrome@<channel>, firefox@<channel>, servo, ...)
  --gpu: string  # Require this WebGPU implementation (dawn, wgpu)
  --auto  # Take runtimes and engine from the project files, latest stable otherwise
  --no-write  # Install only; do not write version files
  --help(-h)  # Print help
  ...args: string
]
export extern "ay rt install" [
  --engine: string  # Python engine: cpython, freethreaded, pypy, graalpy, pyodide, rustpython [default: cpython]
  --from: string  # Build from this git URL or local path (forks); RustPython and Bun
  --help(-h)  # Print help
  ...args: string
]
export extern "ay rt use" [
  --engine: string  # 
  --global  # 
  --help(-h)  # Print help
  ...args: string
]
export extern "ay rt run" [
  --engine: string  # 
  --help(-h)  # Print help
  ...args: string
]
export extern "ay rt pm" [
  --help(-h)  # Print help
  ...args: string
]
export extern "ay rt torch" [
  --backend: string  # auto (detect the CUDA driver), cpu, cu130, cu129, ... [default: auto]
  --with: string  # Extra packages (torchvision, torchaudio)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay gclient" [
  --help(-h)  # Print help
]
export extern "ay gclient revinfo" [
  --deps: string  # 
  --root: string  # 
  --filter: string  # 
  --ignore-dep-type: string  # 
  --output-json: string  # 
  --help(-h)  # 
  ...args: string
]
export extern "ay gclient getdep" [
  --var: string  # 
  --revision(-r): string  # 
  --deps-file: string  # [default: DEPS]
  --help(-h)  # Print help
  ...args: string
]
export extern "ay gclient setdep" [
  --var: string  # 
  --revision(-r): string  # 
  --deps-file: string  # [default: DEPS]
  --no-gitlinks  # Do not update gitlinks for `git_dependencies = 'SYNC'` / `'SUBMODULES'`
  --help(-h)  # Print help
  ...args: string
]
export extern "ay gclient sync" [
  --deps: string  # Override the deps OS list (comma-separated, `all` for every OS), like `gclient --deps`
  --root: string  # gclient root (default: the nearest ancestor holding .gclient)
  --apply  # Execute the plan (default is a dry run)
  --jobs(-j): string  # Parallel checkouts [default: 8]
  --only: string  # Restrict to these dependency paths or path prefixes (repeatable)
  --with-solutions  # Also clone missing solutions
  --cipd  # Run `cipd ensure` for CIPD packages with the official client
  --populate-cache  # Fetch pins into the shared git cache first (`git cache populate`); checkouts then borrow the objects through alternates
  --verbose(-v)  # Show up-to-date entries too
  --help(-h)  # Print help
  ...args: string
]
export extern "ay gclient hooks" [
  --deps: string  # Override the deps OS list (comma-separated, `all` for every OS), like `gclient --deps`
  --root: string  # gclient root (default: the nearest ancestor holding .gclient)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay gclient runhooks" [
  --deps: string  # Override the deps OS list (comma-separated, `all` for every OS), like `gclient --deps`
  --root: string  # gclient root (default: the nearest ancestor holding .gclient)
  --hook: string  # Only hooks with these names (repeatable)
  --dry-run(-n)  # Print the commands without running them
  --upstream-vpython  # Run `vpython3` hooks with upstream vpython3 instead of `ay vpy`
  --help(-h)  # Print help
  ...args: string
]
export extern "ay gclient root" [
  --help(-h)  # Print help
  ...args: string
]
export extern "ay fetch" [
  --list  # List known configs
  --apply  # Write .gclient and sync
  --jobs(-j): string  # [default: 8]
  --help(-h)  # Print help
  ...args: string
]
export extern "ay vpy" [
  ...args: string
]
export extern "ay cl" [
  --help(-h)  # Print help
]
export extern "ay cl upload" [
  --reviewers(-r): string  # Reviewers, comma separated or repeated
  --cc: string  # CC, comma separated or repeated
  --title(-t): string  # Patchset title (`-t`)
  --cq-dry-run(-d)  # Commit-Queue+1 (`--cq-dry-run`, `-d`)
  --use-commit-queue(-c)  # Commit-Queue+2 (`--use-commit-queue`, `-c`)
  --wip  # Upload as work in progress
  --topic: string  # 
  --hashtag: string  # 
  --target-branch(-b): string  # Target branch (`-b`, `--target_branch`), default main
  --revision: string  # jj revset to upload (default: jj's default for `gerrit upload`)
  --dry-run  # Show what would be pushed
  --help(-h)  # Print help
  ...args: string
]
export extern "ay cl status" [
  --revision: string  # jj revset of local commits [default: trunk()..@]
  --gerrit-url: string  # Gerrit base URL (default: derived from the origin remote)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay cl issue" [
  --revision: string  # [default: @-]
  --gerrit-url: string  # 
  --help(-h)  # Print help
  ...args: string
]
export extern "ay cl land" [
  --revision: string  # 
  --target-branch(-b): string  # 
  --dry-run  # 
  --help(-h)  # Print help
  ...args: string
]
export extern "ay cipd" [
]
export extern "ay cipd version" [
  ...args: string
]
export extern "ay cipd auth-login" [
  ...args: string
]
export extern "ay cipd auth-logout" [
  ...args: string
]
export extern "ay cipd ls" [
  ...args: string
]
export extern "ay cipd search" [
  ...args: string
]
export extern "ay cipd resolve" [
  ...args: string
]
export extern "ay cipd describe" [
  ...args: string
]
export extern "ay cipd instances" [
  ...args: string
]
export extern "ay cipd create" [
  ...args: string
]
export extern "ay cipd attach" [
  ...args: string
]
export extern "ay cipd set-ref" [
  ...args: string
]
export extern "ay cipd set-tag" [
  ...args: string
]
export extern "ay cipd set-metadata" [
  ...args: string
]
export extern "ay cipd ensure" [
  ...args: string
]
export extern "ay cipd export" [
  ...args: string
]
export extern "ay cipd selfupdate" [
  ...args: string
]
export extern "ay ninja" [
  ...args: string
]
export extern "ay gn" [
  ...args: string
]
export extern "ay auth" [
  ...args: string
]
export extern "ay secret" [
  ...args: string
]
export extern "ay vault" [
  ...args: string
]
export extern "ay conformance" [
  ...args: string
]
export extern "ay build" [
  --target(-t): string  # Preset name or target triple; repeat for several targets (see --list)
  --list  # Print presets with Rust target and native toolchain status, then exit
  --release(-r)  # Build with the release profile (fat LTO)
  --dry-run  # Print the cargo commands without running them
  --dylib  # Link the musl C runtime dynamically (`-C target-feature=-crt-static`); without it cargo silently drops `cdylib` crate types on musl targets (for example a `bun:ffi` library)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay sys" [
  --json  # Full profile as JSON (schema `sys::SCHEMA_VERSION`)
  --ids  # Keep serials, UUIDs and public addresses (local use only, never agent context)
  --no-tools  # Skip probing toolchain versions
  --help(-h)  # Print help
  ...args: string
]
export extern "ay up" [
  --check  # Report only; exit 1 when a tool is missing or outdated
  --list  # List the tools in the manifest with their sources
  --setup  # Wire provider CLIs from the repository .env (never prints values)
  --bootstrap  # Also apply config files, links, local builds and clones, then run `ay doctor`
  --dry-run  # Show what would be installed without downloading
  --assets: string  # Print the content-hashed publish manifest (JSON) for a wasm/CDN build directory
  --release: string  # Release label recorded in the --assets manifest
  --manifest: string  # Manifest path (default: $AY_TOOLS_MANIFEST, <repo>/tools.toml, then the embedded copy)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay self-update" [
  --check  # Only report whether a newer release exists (exit 1 when one does)
  --version: string  # Install this version instead of the latest (`0.3.0`)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay bun" [
  --help(-h)  # Print help
]
export extern "ay bun watch" [
  --json  # Print the report as JSON
  --apply  # Also propose the version bumps (`ay bun bump`), without writing them
  --dry-run  # Do not save the state (the next run reports the same changes again)
  --state: string  # State file (default ~/.local/share/ay/bun-watch/state.json, or $AY_BUN_WATCH_STATE)
  --checkout: string  # Fork checkout (default <repo>/third_party/bun); read only, never fetched
  --install-schedule  # Register the watch as a scheduled task (Windows) or systemd user timer (Linux)
  --remove-schedule  # Remove the scheduled task or timer
  --every: string  # Hours between scheduled runs [default: 6]
  --help(-h)  # Print help
  ...args: string
]
export extern "ay bun bump" [
  --to: string  # Target version (default: the latest stable release of oven-sh/bun)
  --write  # Apply the edits (default: only list them)
  --json  # Print the proposals as JSON
  --help(-h)  # Print help
  ...args: string
]
export extern "ay bun install" [
  --fork  # The fork's build (the only source: stable and canary come from `ay rt install bun@<v>`)
  --run: string  # Workflow run id (default: the last successful run on main)
  --activate  # Copy it to ~/.bun/bin/bun, keeping the previous binary as bun.previous
  --json  # Print the result as JSON
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ai" [
  --manifest: string  # Manifest (default: $AY_AI_MANIFEST, <repo>/tools/ai/ai.toml, then the embedded copy)
  --env-file: string  # Secrets in dotenv format, repeatable (default: $AY_ENV_FILE, then <repo>/.env)
  --json  # JSON output (ls, check)
  --help(-h)  # Print help
]
export extern "ay ai ls" [
  --manifest: string  # Manifest (default: $AY_AI_MANIFEST, <repo>/tools/ai/ai.toml, then the embedded copy)
  --env-file: string  # Secrets in dotenv format, repeatable (default: $AY_ENV_FILE, then <repo>/.env)
  --json  # JSON output (ls, check)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ai install" [
  --force  # 
  --manifest: string  # Manifest (default: $AY_AI_MANIFEST, <repo>/tools/ai/ai.toml, then the embedded copy)
  --env-file: string  # Secrets in dotenv format, repeatable (default: $AY_ENV_FILE, then <repo>/.env)
  --json  # JSON output (ls, check)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ai config" [
  --manifest: string  # Manifest (default: $AY_AI_MANIFEST, <repo>/tools/ai/ai.toml, then the embedded copy)
  --env-file: string  # Secrets in dotenv format, repeatable (default: $AY_ENV_FILE, then <repo>/.env)
  --json  # JSON output (ls, check)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ai serve" [
  --manifest: string  # Manifest (default: $AY_AI_MANIFEST, <repo>/tools/ai/ai.toml, then the embedded copy)
  --env-file: string  # Secrets in dotenv format, repeatable (default: $AY_ENV_FILE, then <repo>/.env)
  --json  # JSON output (ls, check)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ai service" [
  --remove  # 
  --manifest: string  # Manifest (default: $AY_AI_MANIFEST, <repo>/tools/ai/ai.toml, then the embedded copy)
  --env-file: string  # Secrets in dotenv format, repeatable (default: $AY_ENV_FILE, then <repo>/.env)
  --json  # JSON output (ls, check)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ai restart" [
  --manifest: string  # Manifest (default: $AY_AI_MANIFEST, <repo>/tools/ai/ai.toml, then the embedded copy)
  --env-file: string  # Secrets in dotenv format, repeatable (default: $AY_ENV_FILE, then <repo>/.env)
  --json  # JSON output (ls, check)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ai pull" [
  --manifest: string  # Manifest (default: $AY_AI_MANIFEST, <repo>/tools/ai/ai.toml, then the embedded copy)
  --env-file: string  # Secrets in dotenv format, repeatable (default: $AY_ENV_FILE, then <repo>/.env)
  --json  # JSON output (ls, check)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ai check" [
  --manifest: string  # Manifest (default: $AY_AI_MANIFEST, <repo>/tools/ai/ai.toml, then the embedded copy)
  --env-file: string  # Secrets in dotenv format, repeatable (default: $AY_ENV_FILE, then <repo>/.env)
  --json  # JSON output (ls, check)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ai auth" [
  --timeout: string  # Seconds to wait for each key [default: 600]
  --force  # Ask again even when a valid key is stored
  --manifest: string  # Manifest (default: $AY_AI_MANIFEST, <repo>/tools/ai/ai.toml, then the embedded copy)
  --env-file: string  # Secrets in dotenv format, repeatable (default: $AY_ENV_FILE, then <repo>/.env)
  --json  # JSON output (ls, check)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ai up" [
  --manifest: string  # Manifest (default: $AY_AI_MANIFEST, <repo>/tools/ai/ai.toml, then the embedded copy)
  --env-file: string  # Secrets in dotenv format, repeatable (default: $AY_ENV_FILE, then <repo>/.env)
  --json  # JSON output (ls, check)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ai push" [
  --remote-env-file: string  # Dotenv file on the remote host (default: the remote `ay ai` default)
  --manifest: string  # Manifest (default: $AY_AI_MANIFEST, <repo>/tools/ai/ai.toml, then the embedded copy)
  --env-file: string  # Secrets in dotenv format, repeatable (default: $AY_ENV_FILE, then <repo>/.env)
  --json  # JSON output (ls, check)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ai import" [
  --manifest: string  # Manifest (default: $AY_AI_MANIFEST, <repo>/tools/ai/ai.toml, then the embedded copy)
  --env-file: string  # Secrets in dotenv format, repeatable (default: $AY_ENV_FILE, then <repo>/.env)
  --json  # JSON output (ls, check)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay ai fabric" [
  --manifest: string  # Manifest (default: $AY_AI_MANIFEST, <repo>/tools/ai/ai.toml, then the embedded copy)
  --env-file: string  # Secrets in dotenv format, repeatable (default: $AY_ENV_FILE, then <repo>/.env)
  --json  # JSON output (ls, check)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay docs" [
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --help(-h)  # Print help
]
export extern "ay docs sync" [
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --source(-s): string  # Only these sources: fork, upstream, skills (repeatable)
  --offline  # Do not fetch bun.com
  --json  # JSON report (schema ay-docs-sync/1)
  --quiet(-q)  # Print nothing unless a source fails
  --help(-h)  # Print help
  ...args: string
]
export extern "ay docs bun" [
  --limit(-n): string  # Maximum results [default: 8]
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --source(-s): string  # Only one source: fork, upstream, skills
  --json  # JSON (schema ay-docs-search/1)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay docs show" [
  --json  # 
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay docs stats" [
  --json  # 
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay docs schedule" [
  --every: string  # Hours between runs [default: 6]
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --remove  # Remove the schedule
  --help(-h)  # Print help
  ...args: string
]
export extern "ay flat" [
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --fork: string  # Fork checkout (default: <root>/third_party/bun)
  --help(-h)  # Print help
]
export extern "ay flat list" [
  --json  # 
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --fork: string  # Fork checkout (default: <root>/third_party/bun)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay flat sync" [
  --dry-run  # Show what would change, write nothing
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --fork: string  # Fork checkout (default: <root>/third_party/bun)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay flat check" [
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --strict  # Fail (exit 3) when the fork is not checked out instead of skipping
  --fork: string  # Fork checkout (default: <root>/third_party/bun)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay hash" [
  --seed: string  # Seed [default: 0]
  --legacy  # The legacy Wyhash11 variant instead of wyhash final4
  --json  # 
  --help(-h)  # Print help
  ...args: string
]
export extern "ay time" [
  --runs(-n): string  # Runs [default: 20]
  --warmup: string  # Unmeasured runs first [default: 1]
  --show-output  # Keep the command's stdout and stderr
  --json  # 
  --help(-h)  # Print help
  ...args: string
]
export extern "ay chromium" [
  --host: string  # Fleet node that builds Chromium [default: fr1]
  --out: string  # Output directory name under src/out (default: out_name of factory.toml)
  --dry-run  # Print the host and the script, run nothing
  --detach  # Run in the background on the host (nohup, log under the checkout root); print the log path
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --help(-h)  # Print help
]
export extern "ay chromium status" [
  --host: string  # Fleet node that builds Chromium [default: fr1]
  --out: string  # Output directory name under src/out (default: out_name of factory.toml)
  --dry-run  # Print the host and the script, run nothing
  --detach  # Run in the background on the host (nohup, log under the checkout root); print the log path
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay chromium sync" [
  --host: string  # Fleet node that builds Chromium [default: fr1]
  --no-hooks  # Skip `gclient runhooks`
  --out: string  # Output directory name under src/out (default: out_name of factory.toml)
  --dry-run  # Print the host and the script, run nothing
  --detach  # Run in the background on the host (nohup, log under the checkout root); print the log path
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay chromium gn" [
  --host: string  # Fleet node that builds Chromium [default: fr1]
  --out: string  # Output directory name under src/out (default: out_name of factory.toml)
  --dry-run  # Print the host and the script, run nothing
  --detach  # Run in the background on the host (nohup, log under the checkout root); print the log path
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay chromium build" [
  --host: string  # Fleet node that builds Chromium [default: fr1]
  --out: string  # Output directory name under src/out (default: out_name of factory.toml)
  --dry-run  # Print the host and the script, run nothing
  --detach  # Run in the background on the host (nohup, log under the checkout root); print the log path
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay chromium autoninja" [
  --host: string  # Fleet node that builds Chromium [default: fr1]
  --out: string  # Output directory name under src/out (default: out_name of factory.toml)
  --dry-run  # Print the host and the script, run nothing
  --detach  # Run in the background on the host (nohup, log under the checkout root); print the log path
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay chromium toolchain" [
  --host: string  # Fleet node that builds Chromium [default: fr1]
  --out: string  # Output directory name under src/out (default: out_name of factory.toml)
  --dry-run  # Print the host and the script, run nothing
  --detach  # Run in the background on the host (nohup, log under the checkout root); print the log path
  --root: string  # Monorepo root (default: $SRC_ROOT, else the enclosing checkout)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay engines" [
  ...args: string
]
export extern "ay agents" [
  ...args: string
]
export extern "ay steam" [
  --root: string  # Steam root (default: $STEAM_PATH, else the first installation found)
  --help(-h)  # Print help
]
export extern "ay steam root" [
  --root: string  # Steam root (default: $STEAM_PATH, else the first installation found)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay steam libraries" [
  --root: string  # Steam root (default: $STEAM_PATH, else the first installation found)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay steam apps" [
  --filter: string  # Keep apps whose id equals, or whose name contains, this text (case-insensitive)
  --root: string  # Steam root (default: $STEAM_PATH, else the first installation found)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay steam vdf" [
  --format: string  # auto (default), text, binary, appinfo [default: auto]
  --root: string  # Steam root (default: $STEAM_PATH, else the first installation found)
  --app: string  # appinfo: this app's KeyValues (default: header summary)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay steam compat" [
  --root: string  # Steam root (default: $STEAM_PATH, else the first installation found)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay steam host" [
  --root: string  # Steam root (default: $STEAM_PATH, else the first installation found)
  --help(-h)  # Print help
  ...args: string
]
export extern "ay steam env" [
  --prefix: string  # Proton prefix directory (STEAM_COMPAT_DATA_PATH; default: <library>/steamapps/compatdata/<app>)
  --root: string  # Steam root (default: $STEAM_PATH, else the first installation found)
  --install-path: string  # Game directory (default: the installed app's directory)
  --cache-root: string  # Shader caches root (<root>/dxvk, <root>/vkd3d, <root>/mesa)
  --gamemode  # Wrap with gamemoderun when installed
  --help(-h)  # Print help
  ...args: string
]
