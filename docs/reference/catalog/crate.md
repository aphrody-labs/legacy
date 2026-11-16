# Rust crate

A member of the Cargo workspace (src/*)

| Name | Description |
| :-- | :-- |
| [aphrody-game](../../../apps/game) | Game app: the Bevy game of frameworks/game with the Steam and Epic storefront services, as one binary |
| [stack-bench](../../../bench) | Hardware and compiler benchmark suite behind `ay bench` (Windows) |
| [agent-context](../../../frameworks/agent/context) | Native reader/writer for the agent Context store (same SQLite schema as frameworks/ai-os/src/core/context.ts), with an optional pyo3 module `agent_core` for Python. |
| [bun_analytics](../../../frameworks/analytics) | - |
| [aphrody-audio](../../../frameworks/audio) | Audio building blocks: FFT spectrum, mic bridge, Polaris indexer, Voicebox encoder, local voice loop, Jan agent tools, Rust audio catalog |
| [aphrody-factory](../../../frameworks/chromium/factory) | Chromium factory (F4): sync, gn gen, siso build over NativeLink REAPI, R2 publish, doctor, toolchain. |
| [aphrody-corelib](../../../frameworks/corelib) | Product support library for Shenron and RoseGriffon: GPU (wgpu), RE formats, emulation clock, Epic assets and Boq wire format |
| [craft-formats](../../../frameworks/craft) | Format layer: detect and read the header of SVG, WebP, EXR, PSD, TIFF and HEIF through storytold/craft-libs (Apache-2.0), pinned by rev. |
| [game](../../../frameworks/game) | Open-world vertical slice on Bevy: streamed procedural terrain, third-person controller, day/night, procedural audio |
| [aphrody-i18n](../../../frameworks/i18n) | Shared i18n catalogs (frameworks/i18n-ts/locales/*.json): Unicode MessageFormat 2 evaluator on ICU4X plurals and number formatting, ICU4X locale negotiation, locales discovered... |
| [aphrody-lore](../../../frameworks/lore) | Lore version control: lore (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-aws](../../../frameworks/lore/aws) | Lore version control: lore-aws (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-base](../../../frameworks/lore/base) | Lore version control: lore-base (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-capi](../../../frameworks/lore/capi) | Lore version control: lore-capi (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-chaos-client](../../../frameworks/lore/chaos-client) | Lore version control: lore-chaos-client (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-client](../../../frameworks/lore/client) | Lore version control: lore-client (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-credential](../../../frameworks/lore/credential) | Lore version control: lore-credential (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-error-set](../../../frameworks/lore/error-set) | Composable, traceable error handling for Rust |
| [aphrody-lore-error-set-macro](../../../frameworks/lore/error-set-macro) | Proc-macro crate for lore-error-set |
| [aphrody-lore-fuse](../../../frameworks/lore/fuse) | Lore version control: lore-fuse (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-hashicorp](../../../frameworks/lore/hashicorp) | Lore version control: lore-hashicorp (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-io](../../../frameworks/lore/io) | Lore version control: lore-io (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-macro](../../../frameworks/lore/macro) | Lore version control: lore-macro (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-notification](../../../frameworks/lore/notification) | Lore version control: lore-notification (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-proto](../../../frameworks/lore/proto) | Lore version control: lore-proto (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-revision](../../../frameworks/lore/revision) | Lore version control: lore-revision (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-server](../../../frameworks/lore/server) | Lore version control: lore-server (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-storage](../../../frameworks/lore/storage) | Lore version control: lore-storage (absorbed from Epic Games Lore, MIT) |
| [aphrody-lore-telemetry](../../../frameworks/lore/telemetry) | Telemetry and observability utilities for Lore |
| [aphrody-lore-transport](../../../frameworks/lore/transport) | Lore version control: lore-transport (absorbed from Epic Games Lore, MIT) |
| [aphrody-modele](../../../frameworks/modele) | Commercial document model (invoice, quote, lines, parties, template) as JSON, with the totals computation shared by the TypeScript and Rust sides |
| [aphrody-ocr](../../../frameworks/ocr) | Image-to-text pipeline for aphrody: drives a local vision-language model over one image or a whole directory, parses its DocTags output into markdown, and reports which pages ca... |
| [aphrody-ocr-core](../../../frameworks/ocr-core) | Portable versioned OCR result contract, provenance and quality states for aphrody. |
| [aphrody-rag-core](../../../frameworks/rag-core) | Pure, wasm32-safe core of the aphrody RAG layer: source-aware chunkers (Rust/JS-TS/Markdown/structural/prose), reciprocal-rank-fusion + MMR + vector helpers, and a bit-for-bit p... |
| [aphrody-re](../../../frameworks/re) | Unified Aphrody reverse engineering core: PE/ELF/Mach-O triage, byte-exact PE64 forge/COFF, .pdata/minidump/ASAR/Electron/Go/Android/SteamStub inspection, Ghidra P-Code/Pseudo-C... |
| [bun_safety](../../../frameworks/safety) | - |
| [steam-depot](../../../frameworks/steam) | Bun OS Steam owner: VDF text/binary parser and writer, install and library discovery, client configuration, Proton launch tuning, Remote Play state. |
| [taffy](../../../frameworks/taffy) | First-party Layer-0 UI, Wayland, terminal, and compositing layout engine (absorbed DioxusLabs/taffy) |
| [aphrody-tao](../../../frameworks/tao) | Cross-platform window manager library. |
| [aphrody-tao-macros](../../../frameworks/tao-macros) | Proc macros for tao |
| [aphrody-tauri](../../../frameworks/tauri) | Make tiny, secure apps for all desktop platforms with Tauri |
| [aphrody-tauri-build](../../../frameworks/tauri-build) | build time code to pair with https://crates.io/crates/tauri |
| [aphrody-tauri-bundler](../../../frameworks/tauri-bundler) | Wrap rust executables in OS-specific app bundles for Tauri |
| [aphrody-tauri-cli](../../../frameworks/tauri-cli) | Command line interface for building Tauri apps |
| [aphrody-tauri-cli-node](../../../frameworks/tauri-cli-node) | - |
| [aphrody-tauri-codegen](../../../frameworks/tauri-codegen) | code generation meant to be consumed inside of `tauri` through `tauri-build` or `tauri-macros` |
| [aphrody-tauri-driver](../../../frameworks/tauri-driver) | Webdriver server for Tauri applications |
| [aphrody-tauri-macos-sign](../../../frameworks/tauri-macos-sign) | Code signing utilities for macOS and iOS apps |
| [aphrody-tauri-macros](../../../frameworks/tauri-macros) | Macros for the tauri crate. |
| [aphrody-tauri-plugin](../../../frameworks/tauri-plugin) | Build script and runtime Tauri plugin definitions |
| [aphrody-tauri-plugin-autostart](../../../frameworks/tauri-plugin-autostart) | Automatically launch your application at startup. |
| [aphrody-tauri-plugin-barcode-scanner](../../../frameworks/tauri-plugin-barcode-scanner) | Scan QR codes, EAN-13 and other kinds of barcodes on Android and iOS |
| [aphrody-tauri-plugin-biometric](../../../frameworks/tauri-plugin-biometric) | Prompt the user for biometric authentication on Android and iOS. |
| [aphrody-tauri-plugin-cli](../../../frameworks/tauri-plugin-cli) | Parse arguments from your Tauri application's command line interface. |
| [aphrody-tauri-plugin-clipboard-manager](../../../frameworks/tauri-plugin-clipboard-manager) | Read and write to the system clipboard. |
| [aphrody-tauri-plugin-deep-link](../../../frameworks/tauri-plugin-deep-link) | Set your Tauri application as the default handler for an URL |
| [aphrody-tauri-plugin-dialog](../../../frameworks/tauri-plugin-dialog) | Native system dialogs for opening and saving files along with message dialogs on your Tauri application. |
| [aphrody-tauri-plugin-fs](../../../frameworks/tauri-plugin-fs) | Access the file system. |
| [aphrody-tauri-plugin-geolocation](../../../frameworks/tauri-plugin-geolocation) | Get and track the device's current position |
| [aphrody-tauri-plugin-global-shortcut](../../../frameworks/tauri-plugin-global-shortcut) | Register global hotkeys listeners on your Tauri application. |
| [aphrody-tauri-plugin-haptics](../../../frameworks/tauri-plugin-haptics) | Haptic feedback and vibrations on Android and iOS |
| [aphrody-tauri-plugin-http](../../../frameworks/tauri-plugin-http) | Access an HTTP client written in Rust. |
| [aphrody-tauri-plugin-localhost](../../../frameworks/tauri-plugin-localhost) | Expose your apps assets through a localhost server instead of the default custom protocol. |
| [aphrody-tauri-plugin-log](../../../frameworks/tauri-plugin-log) | Configurable logging for your Tauri app. |
| [aphrody-tauri-plugin-nfc](../../../frameworks/tauri-plugin-nfc) | Read and write NFC tags on Android and iOS. |
| [aphrody-tauri-plugin-notification](../../../frameworks/tauri-plugin-notification) | Send desktop and mobile notifications on your Tauri application. |
| [aphrody-tauri-plugin-opener](../../../frameworks/tauri-plugin-opener) | Open files and URLs using their default application. |
| [aphrody-tauri-plugin-os](../../../frameworks/tauri-plugin-os) | Read information about the operating system. |
| [aphrody-tauri-plugin-persisted-scope](../../../frameworks/tauri-plugin-persisted-scope) | Save filesystem and asset scopes and restore them when the app is reopened. |
| [aphrody-tauri-plugin-positioner](../../../frameworks/tauri-plugin-positioner) | Position your windows at well-known locations. |
| [aphrody-tauri-plugin-process](../../../frameworks/tauri-plugin-process) | Access the current process of your Tauri application. |
| [aphrody-tauri-plugin-shell](../../../frameworks/tauri-plugin-shell) | Access the system shell. |
| [aphrody-tauri-plugin-single-instance](../../../frameworks/tauri-plugin-single-instance) | Ensure a single instance of your tauri app is running. |
| [aphrody-tauri-plugin-store](../../../frameworks/tauri-plugin-store) | Simple, persistent key-value store. |
| [aphrody-tauri-plugin-stronghold](../../../frameworks/tauri-plugin-stronghold) | Store secrets and keys using the IOTA Stronghold secret management engine. |
| [aphrody-tauri-plugin-updater](../../../frameworks/tauri-plugin-updater) | In-app updates for Tauri applications. |
| [aphrody-tauri-plugin-upload](../../../frameworks/tauri-plugin-upload) | Upload files from disk to a remote server over HTTP. |
| [aphrody-tauri-plugin-websocket](../../../frameworks/tauri-plugin-websocket) | Expose a WebSocket server to your Tauri frontend. |
| [aphrody-tauri-plugin-window-state](../../../frameworks/tauri-plugin-window-state) | Save window positions and sizes and restore them when the app is reopened. |
| [aphrody-tauri-runtime](../../../frameworks/tauri-runtime) | Runtime for Tauri applications |
| [aphrody-tauri-runtime-cef](../../../frameworks/tauri-runtime-cef) | Tauri runtime interface for Chromium Embedded Framework |
| [aphrody-tauri-runtime-wry](../../../frameworks/tauri-runtime-wry) | Wry bindings to the Tauri runtime |
| [aphrody-tauri-schema-generator](../../../frameworks/tauri-schema-generator) | - |
| [aphrody-tauri-schema-worker](../../../frameworks/tauri-schema-worker) | - |
| [aphrody-tauri-utils](../../../frameworks/tauri-utils) | Utilities for Tauri |
| [tv-cli](../../../frameworks/tv/cli) | Interface en ligne de commande du domaine média tv. |
| [tv-core](../../../frameworks/tv/core) | Types communs du domaine média tv : rationnels, temps, flux, médias, erreurs. |
| [tv-ffmpeg](../../../frameworks/tv/ffmpeg) | Wrapper sûr au-dessus de ffmpeg-next (libav* 9.x) qui produit les types tv-core. |
| [aphrody-ui](../../../frameworks/ui/kit) | Rust core of the Aphrody design system: Material 3 color (HCT, schemes, contrast), tokens, component contracts, layout, theme presets, React/Next front ends. |
| [dx12-hal](../../../hardware/drivers/gpu/dx12) | dx12-hal: D3D12 + DirectComposition hardware layer (L2) with a C ABI, part of the Aphrody monorepo |
| [bun_aot](../../../system/aot) | - |
| [bun_aot_absent](../../../system/aot/absent) | - |
| [bun_aot_builtins](../../../system/aot/builtins) | - |
| [bun_aot_interface](../../../system/aot/interface) | - |
| [aphrody-apm](../../../system/apm) | Rust port of Microsoft APM (Agent Package Manager): apm.yml, apm.lock.yaml, resolution, install/compile for Claude Code and Copilot. |
| [bun_archive](../../../system/archive) | - |
| [bun_ast](../../../system/ast) | - |
| [bun_ast_jsc](../../../system/ast_jsc) | - |
| [aphrody](../../../system/ay) | ay: one multicall CLI for the Aphrody monorepo (lock, git, ingest, graph, deploy, bench, build) |
| [aphrody-backend](../../../system/backend) | Aphrody forensics and backend logic (Rust). |
| [bun_base64](../../../system/base64) | - |
| [bun_boringssl](../../../system/boringssl) | - |
| [bun_boringssl_sys](../../../system/boringssl_sys) | - |
| [bun_brotli](../../../system/brotli) | - |
| [bun_brotli_sys](../../../system/brotli_sys) | - |
| [bun_builtin_sources](../../../system/builtin_sources) | - |
| [bun_alloc](../../../system/bun_alloc) | - |
| [bun_core](../../../system/bun_core) | - |
| [bun_core_macros](../../../system/bun_core_macros) | - |
| [bun_output_tags](../../../system/bun_output_tags) | - |
| [bun_bundler](../../../system/bundler) | - |
| [bun_bundler_jsc](../../../system/bundler_jsc) | - |
| [bun_bunfig](../../../system/bunfig) | - |
| [bun_cares_sys](../../../system/cares_sys) | - |
| [bun_clap](../../../system/clap) | - |
| [bun_clap_macros](../../../system/clap_macros) | - |
| [bun_collections](../../../system/collections) | - |
| [aphrody-config](../../../system/config) | Codex-compatible config.toml model for aphrody: ConfigToml, model providers (managed llama-server, Ollama, LM Studio, vLLM, Antigravity, OpenAI, Anthropic, ChatGPT), layered mer... |
| [aphrody-core](../../../system/core) | Common lib: tree-sitter parsing, symbol/ref index, content hashing (BLAKE3) |
| [aphrody-core-capi](../../../system/core/capi) | One C ABI cdylib: core_* (aphrody-core), ai_os_*, depot_*, aphrody_re_* and Boq (aphrody_*), loaded by bun:ffi, Python, and Java |
| [aphrody-core-py](../../../system/core/capi/py) | Native PyO3 (ABI3) Python core extension exposing aphrody-core (Tree-sitter, BLAKE3, index) and aphrody-re (RE triage, disasm, Ghidra P-Code/Pseudo-C, MinGW-REA, Lua 5.2) |
| [aphrody-core-jni](../../../system/core/jni) | Native JNI (Java 25+) core bridge exposing aphrody-core (Tree-sitter, BLAKE3, index) and aphrody-re (RE triage, disasm, Ghidra P-Code/Pseudo-C, MinGW-REA, Lua 5.2) |
| [bun_crash_handler](../../../system/crash_handler) | - |
| [bun_csrf](../../../system/csrf) | - |
| [bun_css](../../../system/css) | - |
| [bun_css_jsc](../../../system/css_jsc) | - |
| [depot-cas](../../../system/depot/cas) | Content-addressed artifact store for depot tooling, after Lore: FastCDC v2020 fragments (32/64/256 KiB), blake3 ids, zstd, sha256 file index |
| [depot-cipd](../../../system/depot/cipd) | CIPD client in Rust: `cipd ensure` with the luci-go site root layout, instances cached in depot-cas (`ay cipd ensure`) |
| [depot-cli](../../../system/depot/cli) | depot command set (VCS, depot_tools, ingest, code graph) behind `ay git`, `ay ingest` and `ay graph` |
| [depot-core](../../../system/depot/core) | depot-core: part of the Aphrody monorepo |
| [depot-forge](../../../system/depot/forge) | depot-forge: part of the Aphrody monorepo |
| [depot-gclient](../../../system/depot/gclient) | gclient in Rust: DEPS/.gclient evaluator, revinfo, getdep/setdep, sync planner on gix (`ay gclient`, `ay fetch`) |
| [depot-graph](../../../system/depot/graph) | depot-graph: part of the Aphrody monorepo |
| [depot-ingest](../../../system/depot/ingest) | depot-ingest: part of the Aphrody monorepo |
| [depot-migrate](../../../system/depot/migrate) | depot-migrate: part of the Aphrody monorepo |
| [depot-vpython](../../../system/depot/vpython) | `ay vpy`: run Chromium vpython specs (vpython.toml + .uv.lock, PEP 723) on uv |
| [aphrody-diffutils-flat](../../../system/diffutils-flat) | POSIX basic regular expression translation from the aphrody-labs/diffutils fork (uutils), flattened by `ay flat sync --fork third_party/diffutils` |
| [bun_dispatch](../../../system/dispatch) | - |
| [bun_dns](../../../system/dns) | - |
| [aphrody-docs](../../../system/docs) | `ay docs`: imports the documentation of Bun, Linux, Chromium, ChromiumOS and Android (data-driven sources.toml: local, git, llms.txt, sitemap) into a SQLite FTS5 index and serve... |
| [bun_dotenv](../../../system/dotenv) | - |
| [aphrody-env](../../../system/env) | Zero-dependency Rust 2024 loader and SecretString redaction guard for C:/aphrody/.env |
| [bun_errno](../../../system/errno) | - |
| [bun_event_loop](../../../system/event_loop) | - |
| [bun_exe_format](../../../system/exe_format) | - |
| [bun_executable](../../../system/executable) | - |
| [bun_format](../../../system/format) | - |
| [bun_format_conformance](../../../system/format/conformance) | - |
| [bun_glob](../../../system/glob) | - |
| [aphrody-gpu-backend](../../../system/gpu-backend) | Shared wgpu instance, adapter, device and surface-configuration boundary for Aphrody and IECODE renderers, plus the process-wide GPU hub (wgpu + CUDA). |
| [bun_hash](../../../system/hash) | - |
| [bun_highway](../../../system/highway) | - |
| [bun_histogram](../../../system/histogram) | - |
| [bun_http](../../../system/http) | - |
| [bun_http_jsc](../../../system/http_jsc) | - |
| [bun_http_types](../../../system/http_types) | - |
| [bun_ini](../../../system/ini) | - |
| [bun_install](../../../system/install) | - |
| [bun_install_jsc](../../../system/install_jsc) | - |
| [bun_install_types](../../../system/install_types) | - |
| [bun_shim_impl](../../../system/install/windows-shim) | - |
| [bun_io](../../../system/io) | - |
| [bun_js_parser](../../../system/js_parser) | - |
| [bun_js_parser_jsc](../../../system/js_parser_jsc) | - |
| [bun_js_printer](../../../system/js_printer) | - |
| [bun_jsc](../../../system/jsc) | - |
| [bun_jsc_macros](../../../system/jsc_macros) | - |
| [bun_libdeflate_sys](../../../system/libdeflate_sys) | - |
| [bun_libuv_sys](../../../system/libuv_sys) | - |
| [bun_lint](../../../system/lint) | - |
| [bun_lint_conformance](../../../system/lint/conformance) | - |
| [bun_lint_driver](../../../system/lint/driver) | - |
| [bun_lint_eslint](../../../system/lint/eslint) | - |
| [bun_lint_graph](../../../system/lint/graph) | - |
| [bun_lint_jest](../../../system/lint/jest) | - |
| [bun_lint_json](../../../system/lint/json) | - |
| [bun_lint_markdown](../../../system/lint/markdown) | - |
| [bun_lint_oxlint](../../../system/lint/oxlint) | - |
| [bun_lint_plugins](../../../system/lint/plugins) | - |
| [bun_lint_react](../../../system/lint/react) | - |
| [bun_lint_react_compiler](../../../system/lint/react_compiler) | - |
| [bun_lint_typescript](../../../system/lint/typescript) | - |
| [bun_lint_unicorn](../../../system/lint/unicorn) | - |
| [bun_lsquic_sys](../../../system/lsquic_sys) | - |
| [aphrody-machine](../../../system/machine) | Low-level machine profile for `ay sys`: SMBIOS, CPUID, PCI, GPUs, storage, virtualization, toolchains |
| [bun_md](../../../system/md) | - |
| [bun_mimalloc_sys](../../../system/mimalloc_sys) | - |
| [aphrody-net](../../../system/net) | Unified network probe: DNS, TCP, TLS (rustls + platform verifier), ALPN, HTTP/1.1 and HTTP/2 with per-phase timings. |
| [niubash](../../../system/niubash) | AI-native bash-compatible shell for Windows, built on rubash + winuxcmd |
| [niubash-runtime](../../../system/niubash/runtime) | Runtime crate for niubash: rubash-backed shell REPL on Windows |
| [bun_node_path](../../../system/node_path) | - |
| [bun_opaque](../../../system/opaque) | - |
| [bun_options_types](../../../system/options_types) | - |
| [bun_output](../../../system/output) | - |
| [bun_parsers](../../../system/parsers) | - |
| [bun_patch](../../../system/patch) | - |
| [bun_patch_jsc](../../../system/patch_jsc) | - |
| [bun_paths](../../../system/paths) | - |
| [bun_perf](../../../system/perf) | - |
| [bun_picohttp](../../../system/picohttp) | - |
| [bun_platform](../../../system/platform) | - |
| [bun_png](../../../system/png) | - |
| [bun_pod](../../../system/pod) | - |
| [aphrody-omarchy](../../../system/posix/omarchy) | Unified Omarchy + CachyOS + Arch/Linux orchestration engine: hardware probe, kernel/patchsets, multi-distro recipes, Aether themes, plugins, and WSL2 bundle builder |
| [wslg-cli](../../../system/posix/wslg) | wslg-cli: part of the Aphrody monorepo |
| [bun_ptr](../../../system/ptr) | - |
| [bun_react_compiler](../../../system/react_compiler) | - |
| [aphrody-remote](../../../system/remote) | Pure-Rust SSH client for `ay ssh`: exec, sftp copy, fleet hosts and health check (russh, no OpenSSH binary) |
| [bun_resolve_builtins](../../../system/resolve_builtins) | - |
| [bun_resolver](../../../system/resolver) | - |
| [bun_router](../../../system/router) | - |
| [aphrody-rt](../../../system/rt) | Runtime manager behind `ay rt`: Python engines and versions on uv (CPython, free-threaded, PyPy, GraalPy, Pyodide, RustPython), Node, Deno and Bun versions, runtime and engine c... |
| [rubash](../../../system/rubash) | A Rust implementation of the GNU Bash shell |
| [reedline](../../../system/ruline) | A GNU readline-compatible line editor for niubash |
| [readline-abi](../../../system/ruline/readline-abi) | Clean-room GNU readline 8.x C ABI adapter for ruline |
| [bun_runtime](../../../system/runtime) | - |
| [bun_s3_signing](../../../system/s3_signing) | - |
| [bun_sema](../../../system/sema) | - |
| [bun_sema_baselines](../../../system/sema/baselines) | - |
| [bun_sema_driver](../../../system/sema/driver) | - |
| [bun_sema_parser](../../../system/sema/parser) | - |
| [bun_sema_standalone](../../../system/sema/standalone) | - |
| [bun_semver](../../../system/semver) | - |
| [bun_semver_jsc](../../../system/semver_jsc) | - |
| [bun_sha_hmac](../../../system/sha_hmac) | - |
| [bun_shell_parser](../../../system/shell_parser) | - |
| [bun_simdutf_sys](../../../system/simdutf_sys) | - |
| [bun_sort_by_number](../../../system/sort_by_number) | - |
| [bun_sourcemap](../../../system/sourcemap) | - |
| [bun_sourcemap_jsc](../../../system/sourcemap_jsc) | - |
| [bun_spawn](../../../system/spawn) | - |
| [bun_spawn_sys](../../../system/spawn_sys) | - |
| [bun_sql](../../../system/sql) | - |
| [bun_sql_jsc](../../../system/sql_jsc) | - |
| [bun_standalone_graph](../../../system/standalone_graph) | - |
| [bun_sys](../../../system/sys) | - |
| [bun_sys_jsc](../../../system/sys_jsc) | - |
| [bun_tar](../../../system/tar) | - |
| [bun_tcc_sys](../../../system/tcc_sys) | - |
| [bun_text_diff](../../../system/text_diff) | - |
| [bun_threading](../../../system/threading) | - |
| [aphrody-toolchains](../../../system/toolchains) | Unified Bun / uv / Nushell runtime layer: shell-free discovery, repo-file version pins and consistent launch environment. |
| [bun_transpiler](../../../system/transpiler) | - |
| [bun_trim](../../../system/trim) | - |
| [bun_removable_features](../../../system/trim/removable_features) | - |
| [aphrody-up](../../../system/up) | Toolchain installer and updater behind `ay up`: tools.toml manifest, GitHub release and URL sources, sha256 checks, provider setup |
| [bun_url](../../../system/url) | - |
| [bun_uws](../../../system/uws) | - |
| [bun_uws_sys](../../../system/uws_sys) | - |
| [bun_valkey](../../../system/valkey) | - |
| [aphrody-vault](../../../system/vault) | - |
| [bun_watcher](../../../system/watcher) | - |
| [cosmic-compat](../../../system/wayland/cosmic) | cosmic-compat: part of the Aphrody monorepo |
| [gamescope-cli](../../../system/wayland/gamescope/cli) | Gamescope CLI micro-compositor runtime, benchmarker, and window presenter |
| [gamescope-core](../../../system/wayland/gamescope/core) | Gamescope core micro-compositor frame pacing, scaling math, layer composition, and HDR color science |
| [gamescope-web-wasm](../../../system/wayland/gamescope/web-wasm) | Gamescope WebAssembly / WebGPU client for Chromium |
| [gamescope-wgsl](../../../system/wayland/gamescope/wgsl) | Gamescope WGSL compute shaders (FSR 1.0 EASU, RCAS, HDR Compositor) and wgpu pipeline runner |
| [smithay-wayland-wire](../../../system/wayland/smithay) | smithay-wayland-wire: part of the Aphrody monorepo |
| [hypr-tiler](../../../system/wayland/tiler) | hypr-tiler: part of the Aphrody monorepo |
| [bun_which](../../../system/which) | - |
| [bun_windows_sys](../../../system/windows_sys) | - |
| [winux-cmds](../../../system/winux/cmds) | - |
| [winux-core](../../../system/winux/core) | - |
| [winux-extra](../../../system/winux/extra) | WinuxCmd applets ported from C++ to portable Rust (same shape contract as winux-cmds: run(args, io, ctx)) |
| [winux-regex](../../../system/winux/regex) | - |
| [bun_wyhash](../../../system/wyhash) | - |
| [xtk](../../../system/xtask) | Monorepo maintenance library behind `ay doctor [--deps]`, `ay lock [--deps]`, `ay manifests` and `ay git slim --all` |
| [bun_yarr](../../../system/yarr) | - |
| [bun_zlib](../../../system/zlib) | - |
| [bun_zlib_sys](../../../system/zlib_sys) | - |
| [bun_zstd](../../../system/zstd) | - |
| [asset-test](../../../test/assets) | Asset validators for assets/library: FFmpeg (tv-ffmpeg) decode of audio, resvg render of SVG, craft-formats probe, glTF structural validation and a headless Bevy load, TTF/OTF p... |
| [aphrody-conformance](../../../test/conformance) | Fetch pinned upstream suites, run them, report JSON results. |
| [aphrody-lore-integration-tests](../../../test/lore) | Lore version control: lore-integration-tests (absorbed from Epic Games Lore, MIT) |
| [build-model](../../../tools/build-model) | Work/span model of a ninja/siso build: DAG from `siso query graph`, measured weights from siso_metrics.json, Graham/Brent bounds, list-scheduling simulation, bootstrap. |
