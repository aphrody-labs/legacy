# Rust crate

A member of the Cargo workspace (src/*)

| Name | Description |
| :-- | :-- |
| [aphrody-game](../../../apps/game) | Game app: the Bevy game of src/game with the Steam and Epic storefront services, as one binary |
| [stack-bench](../../../bench) | Hardware and compiler benchmark suite behind `ay bench` (Windows) |
| [agent-context](../../../src/agent/context) | Native reader/writer for the agent Context store (same SQLite schema as frameworks/ai-os/src/core/context.ts), with an optional pyo3 module `agent_core` for Python. |
| [bun_analytics](../../../src/analytics) | - |
| [bun_aot](../../../src/aot) | - |
| [bun_aot_absent](../../../src/aot/absent) | - |
| [bun_aot_builtins](../../../src/aot/builtins) | - |
| [bun_aot_interface](../../../src/aot/interface) | - |
| [aphrody-apm](../../../src/apm) | Rust port of Microsoft APM (Agent Package Manager): apm.yml, apm.lock.yaml, resolution, install/compile for Claude Code and Copilot. |
| [bun_archive](../../../src/archive) | - |
| [bun_ast](../../../src/ast) | - |
| [bun_ast_jsc](../../../src/ast_jsc) | - |
| [aphrody-audio](../../../src/audio) | Audio building blocks: FFT spectrum, mic bridge, Polaris indexer, Voicebox encoder, local voice loop, Jan agent tools, Rust audio catalog |
| [aphrody](../../../src/ay) | ay: one multicall CLI for the Aphrody monorepo (lock, git, ingest, graph, deploy, bench, build) |
| [aphrody-backend](../../../src/backend) | Aphrody forensics and backend logic (Rust). |
| [bun_base64](../../../src/base64) | - |
| [bun_boringssl](../../../src/boringssl) | - |
| [bun_boringssl_sys](../../../src/boringssl_sys) | - |
| [bun_brotli](../../../src/brotli) | - |
| [bun_brotli_sys](../../../src/brotli_sys) | - |
| [bun_builtin_sources](../../../src/builtin_sources) | - |
| [bun_alloc](../../../src/bun_alloc) | - |
| [bun_core](../../../src/bun_core) | - |
| [bun_core_macros](../../../src/bun_core_macros) | - |
| [bun_output_tags](../../../src/bun_output_tags) | - |
| [bun_bundler](../../../src/bundler) | - |
| [bun_bundler_jsc](../../../src/bundler_jsc) | - |
| [bun_bunfig](../../../src/bunfig) | - |
| [bun_cares_sys](../../../src/cares_sys) | - |
| [aphrody-factory](../../../src/chromium/factory) | Chromium factory (F4): sync, gn gen, siso build over NativeLink REAPI, R2 publish, doctor, toolchain. |
| [bun_clap](../../../src/clap) | - |
| [bun_clap_macros](../../../src/clap_macros) | - |
| [bun_collections](../../../src/collections) | - |
| [aphrody-config](../../../src/config) | Codex-compatible config.toml model for aphrody: ConfigToml, model providers (managed llama-server, Ollama, LM Studio, vLLM, Antigravity, OpenAI, Anthropic, ChatGPT), layered mer... |
| [aphrody-core](../../../src/core) | Common lib: tree-sitter parsing, symbol/ref index, content hashing (BLAKE3) |
| [aphrody-core-capi](../../../src/core/capi) | One C ABI cdylib: core_* (aphrody-core), ai_os_*, depot_*, aphrody_re_* and Boq (aphrody_*), loaded by bun:ffi, Python, and Java |
| [aphrody-core-py](../../../src/core/capi/py) | Native PyO3 (ABI3) Python core extension exposing aphrody-core (Tree-sitter, BLAKE3, index) and aphrody-re (RE triage, disasm, Ghidra P-Code/Pseudo-C, MinGW-REA, Lua 5.2) |
| [aphrody-core-jni](../../../src/core/jni) | Native JNI (Java 25+) core bridge exposing aphrody-core (Tree-sitter, BLAKE3, index) and aphrody-re (RE triage, disasm, Ghidra P-Code/Pseudo-C, MinGW-REA, Lua 5.2) |
| [aphrody-corelib](../../../src/corelib) | Product support library for Shenron and RoseGriffon: GPU (wgpu), RE formats, emulation clock, Epic assets and Boq wire format |
| [craft-formats](../../../src/craft) | Format layer: detect and read the header of SVG, WebP, EXR, PSD, TIFF and HEIF through storytold/craft-libs (Apache-2.0), pinned by rev. |
| [bun_crash_handler](../../../src/crash_handler) | - |
| [bun_csrf](../../../src/csrf) | - |
| [bun_css](../../../src/css) | - |
| [bun_css_jsc](../../../src/css_jsc) | - |
| [depot-cas](../../../src/depot/cas) | Content-addressed artifact store for depot tooling, after Lore: FastCDC v2020 fragments (32/64/256 KiB), blake3 ids, zstd, sha256 file index |
| [depot-cipd](../../../src/depot/cipd) | CIPD client in Rust: `cipd ensure` with the luci-go site root layout, instances cached in depot-cas (`ay cipd ensure`) |
| [depot-cli](../../../src/depot/cli) | depot command set (VCS, depot_tools, ingest, code graph) behind `ay git`, `ay ingest` and `ay graph` |
| [depot-core](../../../src/depot/core) | depot-core: part of the Aphrody monorepo |
| [depot-forge](../../../src/depot/forge) | depot-forge: part of the Aphrody monorepo |
| [depot-gclient](../../../src/depot/gclient) | gclient in Rust: DEPS/.gclient evaluator, revinfo, getdep/setdep, sync planner on gix (`ay gclient`, `ay fetch`) |
| [depot-graph](../../../src/depot/graph) | depot-graph: part of the Aphrody monorepo |
| [depot-ingest](../../../src/depot/ingest) | depot-ingest: part of the Aphrody monorepo |
| [depot-migrate](../../../src/depot/migrate) | depot-migrate: part of the Aphrody monorepo |
| [depot-vpython](../../../src/depot/vpython) | `ay vpy`: run Chromium vpython specs (vpython.toml + .uv.lock, PEP 723) on uv |
| [aphrody-diffutils-flat](../../../src/diffutils-flat) | POSIX basic regular expression translation from the aphrody-labs/diffutils fork (uutils), flattened by `ay flat sync --fork third_party/diffutils` |
| [bun_dispatch](../../../src/dispatch) | - |
| [bun_dns](../../../src/dns) | - |
| [aphrody-docs](../../../src/docs) | `ay docs`: imports Bun's docs (fork md/mdx, bun.com llms-full.txt, bun skills) into a SQLite FTS5 index and serves search for people and agents |
| [bun_dotenv](../../../src/dotenv) | - |
| [dx12-hal](../../../src/drivers/gpu/dx12) | dx12-hal: D3D12 + DirectComposition hardware layer (L2) with a C ABI, part of the Aphrody monorepo |
| [aphrody-env](../../../src/env) | Zero-dependency Rust 2024 loader and SecretString redaction guard for C:/aphrody/.env |
| [bun_errno](../../../src/errno) | - |
| [bun_event_loop](../../../src/event_loop) | - |
| [bun_exe_format](../../../src/exe_format) | - |
| [bun_executable](../../../src/executable) | - |
| [bun_format](../../../src/format) | - |
| [bun_format_conformance](../../../src/format/conformance) | - |
| [game](../../../src/game) | Open-world vertical slice on Bevy: streamed procedural terrain, third-person controller, day/night, procedural audio |
| [bun_glob](../../../src/glob) | - |
| [aphrody-gpu-backend](../../../src/gpu-backend) | Shared wgpu instance, adapter, device and surface-configuration boundary for Aphrody and IECODE renderers, plus the process-wide GPU hub (wgpu + CUDA). |
| [bun_hash](../../../src/hash) | - |
| [bun_highway](../../../src/highway) | - |
| [bun_histogram](../../../src/histogram) | - |
| [bun_http](../../../src/http) | - |
| [bun_http_jsc](../../../src/http_jsc) | - |
| [bun_http_types](../../../src/http_types) | - |
| [aphrody-i18n](../../../src/i18n) | Shared i18n catalogs (frameworks/i18n-ts/locales/*.json): Unicode MessageFormat 2 evaluator on ICU4X plurals and number formatting, ICU4X locale negotiation, locales discovered... |
| [bun_ini](../../../src/ini) | - |
| [bun_install](../../../src/install) | - |
| [bun_install_jsc](../../../src/install_jsc) | - |
| [bun_install_types](../../../src/install_types) | - |
| [bun_shim_impl](../../../src/install/windows-shim) | - |
| [bun_io](../../../src/io) | - |
| [bun_js_parser](../../../src/js_parser) | - |
| [bun_js_parser_jsc](../../../src/js_parser_jsc) | - |
| [bun_js_printer](../../../src/js_printer) | - |
| [bun_jsc](../../../src/jsc) | - |
| [bun_jsc_macros](../../../src/jsc_macros) | - |
| [bun_libdeflate_sys](../../../src/libdeflate_sys) | - |
| [bun_libuv_sys](../../../src/libuv_sys) | - |
| [bun_lint](../../../src/lint) | - |
| [bun_lint_conformance](../../../src/lint/conformance) | - |
| [bun_lint_driver](../../../src/lint/driver) | - |
| [bun_lint_eslint](../../../src/lint/eslint) | - |
| [bun_lint_graph](../../../src/lint/graph) | - |
| [bun_lint_jest](../../../src/lint/jest) | - |
| [bun_lint_json](../../../src/lint/json) | - |
| [bun_lint_markdown](../../../src/lint/markdown) | - |
| [bun_lint_oxlint](../../../src/lint/oxlint) | - |
| [bun_lint_plugins](../../../src/lint/plugins) | - |
| [bun_lint_react](../../../src/lint/react) | - |
| [bun_lint_react_compiler](../../../src/lint/react_compiler) | - |
| [bun_lint_typescript](../../../src/lint/typescript) | - |
| [bun_lint_unicorn](../../../src/lint/unicorn) | - |
| [aphrody-lore](../../../src/lore) | Lore version control: lore (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-aws](../../../src/lore/aws) | Lore version control: lore-aws (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-base](../../../src/lore/base) | Lore version control: lore-base (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-capi](../../../src/lore/capi) | Lore version control: lore-capi (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-chaos-client](../../../src/lore/chaos-client) | Lore version control: lore-chaos-client (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-client](../../../src/lore/client) | Lore version control: lore-client (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-credential](../../../src/lore/credential) | Lore version control: lore-credential (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-error-set](../../../src/lore/error-set) | Composable, traceable error handling for Rust |
| [aphrody-lore-error-set-macro](../../../src/lore/error-set-macro) | Proc-macro crate for lore-error-set |
| [aphrody-lore-fuse](../../../src/lore/fuse) | Lore version control: lore-fuse (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-hashicorp](../../../src/lore/hashicorp) | Lore version control: lore-hashicorp (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-io](../../../src/lore/io) | Lore version control: lore-io (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-macro](../../../src/lore/macro) | Lore version control: lore-macro (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-notification](../../../src/lore/notification) | Lore version control: lore-notification (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-proto](../../../src/lore/proto) | Lore version control: lore-proto (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-revision](../../../src/lore/revision) | Lore version control: lore-revision (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-server](../../../src/lore/server) | Lore version control: lore-server (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-storage](../../../src/lore/storage) | Lore version control: lore-storage (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-telemetry](../../../src/lore/telemetry) | Telemetry and observability utilities for Lore |
| [aphrody-lore-transport](../../../src/lore/transport) | Lore version control: lore-transport (absorbed from Epic Games Lore, MIT) |
| [bun_lsquic_sys](../../../src/lsquic_sys) | - |
| [aphrody-machine](../../../src/machine) | Low-level machine profile for `ay sys`: SMBIOS, CPUID, PCI, GPUs, storage, virtualization, toolchains |
| [bun_md](../../../src/md) | - |
| [bun_mimalloc_sys](../../../src/mimalloc_sys) | - |
| [aphrody-modele](../../../src/modele) | Commercial document model (invoice, quote, lines, parties, template) as JSON, with the totals computation shared by the TypeScript and Rust sides |
| [aphrody-net](../../../src/net) | Unified network probe: DNS, TCP, TLS (rustls + platform verifier), ALPN, HTTP/1.1 and HTTP/2 with per-phase timings. |
| [niubash](../../../src/niubash) | AI-native bash-compatible shell for Windows, built on rubash + winuxcmd |
| [niubash-runtime](../../../src/niubash/runtime) | Runtime crate for niubash: rubash-backed shell REPL on Windows |
| [bun_node_path](../../../src/node_path) | - |
| [aphrody-ocr](../../../src/ocr) | Image-to-text pipeline for aphrody: drives a local vision-language model over one image or a whole directory, parses its DocTags output into markdown, and reports which pages ca... |
| [aphrody-ocr-core](../../../src/ocr-core) | Portable versioned OCR result contract, provenance and quality states for aphrody. |
| [bun_opaque](../../../src/opaque) | - |
| [bun_options_types](../../../src/options_types) | - |
| [bun_output](../../../src/output) | - |
| [bun_parsers](../../../src/parsers) | - |
| [bun_patch](../../../src/patch) | - |
| [bun_patch_jsc](../../../src/patch_jsc) | - |
| [bun_paths](../../../src/paths) | - |
| [bun_perf](../../../src/perf) | - |
| [bun_picohttp](../../../src/picohttp) | - |
| [bun_platform](../../../src/platform) | - |
| [bun_png](../../../src/png) | - |
| [bun_pod](../../../src/pod) | - |
| [aphrody-omarchy](../../../src/posix/omarchy) | Unified Omarchy + CachyOS + Arch/Linux orchestration engine: hardware probe, kernel/patchsets, multi-distro recipes, Aether themes, plugins, and WSL2 bundle builder |
| [wslg-cli](../../../src/posix/wslg) | wslg-cli: part of the Aphrody monorepo |
| [bun_ptr](../../../src/ptr) | - |
| [aphrody-rag-core](../../../src/rag-core) | Pure, wasm32-safe core of the aphrody RAG layer: source-aware chunkers (Rust/JS-TS/Markdown/structural/prose), reciprocal-rank-fusion + MMR + vector helpers, and a bit-for-bit p... |
| [aphrody-re](../../../src/re) | Unified Aphrody reverse engineering core: PE/ELF/Mach-O triage, byte-exact PE64 forge/COFF, .pdata/minidump/ASAR/Electron/Go/Android/SteamStub inspection, Ghidra P-Code/Pseudo-C... |
| [bun_react_compiler](../../../src/react_compiler) | - |
| [aphrody-remote](../../../src/remote) | Pure-Rust SSH client for `ay ssh`: exec, sftp copy, fleet hosts and health check (russh, no OpenSSH binary) |
| [bun_resolve_builtins](../../../src/resolve_builtins) | - |
| [bun_resolver](../../../src/resolver) | - |
| [bun_router](../../../src/router) | - |
| [aphrody-rt](../../../src/rt) | Runtime manager behind `ay rt`: Python engines and versions on uv (CPython, free-threaded, PyPy, GraalPy, Pyodide, RustPython), Node, Deno and Bun versions, runtime and engine c... |
| [rubash](../../../src/rubash) | A Rust implementation of the GNU Bash shell |
| [reedline](../../../src/ruline) | A GNU readline-compatible line editor for niubash |
| [readline-abi](../../../src/ruline/readline-abi) | Clean-room GNU readline 8.x C ABI adapter for ruline |
| [bun_runtime](../../../src/runtime) | - |
| [bun_s3_signing](../../../src/s3_signing) | - |
| [bun_safety](../../../src/safety) | - |
| [bun_sema](../../../src/sema) | - |
| [bun_sema_baselines](../../../src/sema/baselines) | - |
| [bun_sema_driver](../../../src/sema/driver) | - |
| [bun_sema_parser](../../../src/sema/parser) | - |
| [bun_sema_standalone](../../../src/sema/standalone) | - |
| [bun_semver](../../../src/semver) | - |
| [bun_semver_jsc](../../../src/semver_jsc) | - |
| [bun_sha_hmac](../../../src/sha_hmac) | - |
| [bun_shell_parser](../../../src/shell_parser) | - |
| [bun_simdutf_sys](../../../src/simdutf_sys) | - |
| [bun_sort_by_number](../../../src/sort_by_number) | - |
| [bun_sourcemap](../../../src/sourcemap) | - |
| [bun_sourcemap_jsc](../../../src/sourcemap_jsc) | - |
| [bun_spawn](../../../src/spawn) | - |
| [bun_spawn_sys](../../../src/spawn_sys) | - |
| [bun_sql](../../../src/sql) | - |
| [bun_sql_jsc](../../../src/sql_jsc) | - |
| [bun_standalone_graph](../../../src/standalone_graph) | - |
| [steam-depot](../../../src/steam) | Bun OS Steam owner: VDF text/binary parser and writer, install and library discovery, client configuration, Proton launch tuning, Remote Play state. |
| [bun_sys](../../../src/sys) | - |
| [bun_sys_jsc](../../../src/sys_jsc) | - |
| [taffy](../../../src/taffy) | First-party Layer-0 UI, Wayland, terminal, and compositing layout engine (absorbed DioxusLabs/taffy) |
| [aphrody-tao](../../../src/tao) | Cross-platform window manager library. |
| [aphrody-tao-macros](../../../src/tao-macros) | Proc macros for tao |
| [bun_tar](../../../src/tar) | - |
| [aphrody-tauri](../../../src/tauri) | Make tiny, secure apps for all desktop platforms with Tauri |
| [aphrody-tauri-build](../../../src/tauri-build) | build time code to pair with https://crates.io/crates/tauri |
| [aphrody-tauri-bundler](../../../src/tauri-bundler) | Wrap rust executables in OS-specific app bundles for Tauri |
| [aphrody-tauri-cli](../../../src/tauri-cli) | Command line interface for building Tauri apps |
| [aphrody-tauri-cli-node](../../../src/tauri-cli-node) | - |
| [aphrody-tauri-codegen](../../../src/tauri-codegen) | code generation meant to be consumed inside of `tauri` through `tauri-build` or `tauri-macros` |
| [aphrody-tauri-driver](../../../src/tauri-driver) | Webdriver server for Tauri applications |
| [aphrody-tauri-macos-sign](../../../src/tauri-macos-sign) | Code signing utilities for macOS and iOS apps |
| [aphrody-tauri-macros](../../../src/tauri-macros) | Macros for the tauri crate. |
| [aphrody-tauri-plugin](../../../src/tauri-plugin) | Build script and runtime Tauri plugin definitions |
| [aphrody-tauri-plugin-autostart](../../../src/tauri-plugin-autostart) | Automatically launch your application at startup. |
| [aphrody-tauri-plugin-barcode-scanner](../../../src/tauri-plugin-barcode-scanner) | Scan QR codes, EAN-13 and other kinds of barcodes on Android and iOS |
| [aphrody-tauri-plugin-biometric](../../../src/tauri-plugin-biometric) | Prompt the user for biometric authentication on Android and iOS. |
| [aphrody-tauri-plugin-cli](../../../src/tauri-plugin-cli) | Parse arguments from your Tauri application's command line interface. |
| [aphrody-tauri-plugin-clipboard-manager](../../../src/tauri-plugin-clipboard-manager) | Read and write to the system clipboard. |
| [aphrody-tauri-plugin-deep-link](../../../src/tauri-plugin-deep-link) | Set your Tauri application as the default handler for an URL |
| [aphrody-tauri-plugin-dialog](../../../src/tauri-plugin-dialog) | Native system dialogs for opening and saving files along with message dialogs on your Tauri application. |
| [aphrody-tauri-plugin-fs](../../../src/tauri-plugin-fs) | Access the file system. |
| [aphrody-tauri-plugin-geolocation](../../../src/tauri-plugin-geolocation) | Get and track the device's current position |
| [aphrody-tauri-plugin-global-shortcut](../../../src/tauri-plugin-global-shortcut) | Register global hotkeys listeners on your Tauri application. |
| [aphrody-tauri-plugin-haptics](../../../src/tauri-plugin-haptics) | Haptic feedback and vibrations on Android and iOS |
| [aphrody-tauri-plugin-http](../../../src/tauri-plugin-http) | Access an HTTP client written in Rust. |
| [aphrody-tauri-plugin-localhost](../../../src/tauri-plugin-localhost) | Expose your apps assets through a localhost server instead of the default custom protocol. |
| [aphrody-tauri-plugin-log](../../../src/tauri-plugin-log) | Configurable logging for your Tauri app. |
| [aphrody-tauri-plugin-nfc](../../../src/tauri-plugin-nfc) | Read and write NFC tags on Android and iOS. |
| [aphrody-tauri-plugin-notification](../../../src/tauri-plugin-notification) | Send desktop and mobile notifications on your Tauri application. |
| [aphrody-tauri-plugin-opener](../../../src/tauri-plugin-opener) | Open files and URLs using their default application. |
| [aphrody-tauri-plugin-os](../../../src/tauri-plugin-os) | Read information about the operating system. |
| [aphrody-tauri-plugin-persisted-scope](../../../src/tauri-plugin-persisted-scope) | Save filesystem and asset scopes and restore them when the app is reopened. |
| [aphrody-tauri-plugin-positioner](../../../src/tauri-plugin-positioner) | Position your windows at well-known locations. |
| [aphrody-tauri-plugin-process](../../../src/tauri-plugin-process) | Access the current process of your Tauri application. |
| [aphrody-tauri-plugin-shell](../../../src/tauri-plugin-shell) | Access the system shell. |
| [aphrody-tauri-plugin-single-instance](../../../src/tauri-plugin-single-instance) | Ensure a single instance of your tauri app is running. |
| [aphrody-tauri-plugin-store](../../../src/tauri-plugin-store) | Simple, persistent key-value store. |
| [aphrody-tauri-plugin-stronghold](../../../src/tauri-plugin-stronghold) | Store secrets and keys using the IOTA Stronghold secret management engine. |
| [aphrody-tauri-plugin-updater](../../../src/tauri-plugin-updater) | In-app updates for Tauri applications. |
| [aphrody-tauri-plugin-upload](../../../src/tauri-plugin-upload) | Upload files from disk to a remote server over HTTP. |
| [aphrody-tauri-plugin-websocket](../../../src/tauri-plugin-websocket) | Expose a WebSocket server to your Tauri frontend. |
| [aphrody-tauri-plugin-window-state](../../../src/tauri-plugin-window-state) | Save window positions and sizes and restore them when the app is reopened. |
| [aphrody-tauri-runtime](../../../src/tauri-runtime) | Runtime for Tauri applications |
| [aphrody-tauri-runtime-cef](../../../src/tauri-runtime-cef) | Tauri runtime interface for Chromium Embedded Framework |
| [aphrody-tauri-runtime-wry](../../../src/tauri-runtime-wry) | Wry bindings to the Tauri runtime |
| [aphrody-tauri-schema-generator](../../../src/tauri-schema-generator) | - |
| [aphrody-tauri-schema-worker](../../../src/tauri-schema-worker) | - |
| [aphrody-tauri-utils](../../../src/tauri-utils) | Utilities for Tauri |
| [bun_tcc_sys](../../../src/tcc_sys) | - |
| [bun_text_diff](../../../src/text_diff) | - |
| [bun_threading](../../../src/threading) | - |
| [aphrody-toolchains](../../../src/toolchains) | Unified Bun / uv / Nushell runtime layer: shell-free discovery, repo-file version pins and consistent launch environment. |
| [bun_transpiler](../../../src/transpiler) | - |
| [bun_trim](../../../src/trim) | - |
| [bun_removable_features](../../../src/trim/removable_features) | - |
| [tv-cli](../../../src/tv/cli) | Interface en ligne de commande du domaine média tv. |
| [tv-core](../../../src/tv/core) | Types communs du domaine média tv : rationnels, temps, flux, médias, erreurs. |
| [tv-ffmpeg](../../../src/tv/ffmpeg) | Wrapper sûr au-dessus de ffmpeg-next (libav* 9.x) qui produit les types tv-core. |
| [aphrody-ui](../../../src/ui/kit) | Rust core of the Aphrody design system: Material 3 color (HCT, schemes, contrast), tokens, component contracts, layout, theme presets, React/Next front ends. |
| [aphrody-up](../../../src/up) | Toolchain installer and updater behind `ay up`: tools.toml manifest, GitHub release and URL sources, sha256 checks, provider setup |
| [bun_url](../../../src/url) | - |
| [bun_uws](../../../src/uws) | - |
| [bun_uws_sys](../../../src/uws_sys) | - |
| [bun_valkey](../../../src/valkey) | - |
| [aphrody-vault](../../../src/vault) | - |
| [bun_watcher](../../../src/watcher) | - |
| [cosmic-compat](../../../src/wayland/cosmic) | cosmic-compat: part of the Aphrody monorepo |
| [gamescope-cli](../../../src/wayland/gamescope/cli) | Gamescope CLI micro-compositor runtime, benchmarker, and window presenter |
| [gamescope-core](../../../src/wayland/gamescope/core) | Gamescope core micro-compositor frame pacing, scaling math, layer composition, and HDR color science |
| [gamescope-web-wasm](../../../src/wayland/gamescope/web-wasm) | Gamescope WebAssembly / WebGPU client for Chromium |
| [gamescope-wgsl](../../../src/wayland/gamescope/wgsl) | Gamescope WGSL compute shaders (FSR 1.0 EASU, RCAS, HDR Compositor) and wgpu pipeline runner |
| [smithay-wayland-wire](../../../src/wayland/smithay) | smithay-wayland-wire: part of the Aphrody monorepo |
| [hypr-tiler](../../../src/wayland/tiler) | hypr-tiler: part of the Aphrody monorepo |
| [bun_which](../../../src/which) | - |
| [bun_windows_sys](../../../src/windows_sys) | - |
| [winux-cmds](../../../src/winux/cmds) | - |
| [winux-core](../../../src/winux/core) | - |
| [winux-extra](../../../src/winux/extra) | WinuxCmd applets ported from C++ to portable Rust (same shape contract as winux-cmds: run(args, io, ctx)) |
| [winux-regex](../../../src/winux/regex) | - |
| [bun_wyhash](../../../src/wyhash) | - |
| [xtk](../../../src/xtask) | Monorepo maintenance library behind `ay doctor [--deps]`, `ay lock [--deps]`, `ay manifests` and `ay git slim --all` |
| [bun_yarr](../../../src/yarr) | - |
| [bun_zlib](../../../src/zlib) | - |
| [bun_zlib_sys](../../../src/zlib_sys) | - |
| [bun_zstd](../../../src/zstd) | - |
| [asset-test](../../../test/assets) | Asset validators for assets/library: FFmpeg (tv-ffmpeg) decode of audio, resvg render of SVG, craft-formats probe, glTF structural validation and a headless Bevy load, TTF/OTF p... |
| [aphrody-conformance](../../../test/conformance) | Fetch pinned upstream suites, run them, report JSON results. |
| [aphrody-lore-integration-tests](../../../test/lore) | Lore version control: lore-integration-tests (absorbed from Epic Games Lore, MIT) |
| [build-model](../../../tools/build-model) | Work/span model of a ninja/siso build: DAG from `siso query graph`, measured weights from siso_metrics.json, Graham/Brent bounds, list-scheduling simulation, bootstrap. |
