# CLI tools: which one for what

The toolchain is declared in [`infra/up/tools.toml`](../../infra/up/tools.toml): `ay up --list` shows every tool with its pinned version and `ay up` installs them. Versions are never written here; read them from the manifest or `gh api repos/<repo>/releases/latest`. A skill `cli-<tool>` is generated from each binary's manual (`just cli-skills`).

Rule: Bun replaces every JavaScript tool it covers (node, npm, npx, pnpm, tsc, prettier, esbuild, swc). The tools below replace the classic Unix ones.

| Task | Use | Instead of |
| --- | --- | --- |
| Search text | [rg](https://github.com/BurntSushi/ripgrep) | grep -r |
| Find files | [fd](https://github.com/sharkdp/fd) | find |
| JSON, YAML | [jaq](https://github.com/01mf02/jaq), [yq](https://github.com/mikefarah/yq) | jq |
| Replace text | [sd](https://github.com/chmln/sd) | sed |
| Hash | [b3sum](https://github.com/BLAKE3-team/BLAKE3) | sha256sum |
| HTTP | [xh](https://github.com/ducaale/xh), [oha](https://github.com/hatoo/oha) (load) | curl |
| List, read | [eza](https://github.com/eza-community/eza), [bat](https://github.com/sharkdp/bat) | ls, cat |
| Disk usage | [dua](https://github.com/Byron/dua-cli), [dust](https://github.com/bootandy/dust) | du |
| Benchmark | [hyperfine](https://github.com/sharkdp/hyperfine) | time loops |
| Git | [gitoxide](https://github.com/GitoxideLabs/gitoxide), [jj](https://github.com/jj-vcs/jj), [delta](https://github.com/dandavison/delta), [lazygit](https://github.com/jesseduffield/lazygit) | |
| Structural code | [ast-grep](https://github.com/ast-grep/ast-grep), [difftastic](https://github.com/Wilfred/difftastic) | regex rewrites |
| Python | [uv](https://github.com/astral-sh/uv), [ruff](https://github.com/astral-sh/ruff), [ty](https://github.com/astral-sh/ty) | pip, black, mypy |
| Rust | [cargo-nextest](https://github.com/nextest-rs/nextest), [cargo-binstall](https://github.com/cargo-bins/cargo-binstall), [sccache](https://github.com/mozilla/sccache), [cargo-llvm-cov](https://github.com/taiki-e/cargo-llvm-cov) | |
| Rust hygiene | [cargo-deny](https://github.com/EmbarkStudios/cargo-deny), [cargo-audit](https://github.com/rustsec/rustsec), [cargo-hack](https://github.com/taiki-e/cargo-hack), [cargo-shear](https://github.com/Boshen/cargo-shear), [cargo-machete](https://github.com/bnjbvr/cargo-machete) | |
| Spelling | [typos](https://github.com/crate-ci/typos) | |
| Compression | [zstd](https://github.com/facebook/zstd), [ouch](https://github.com/ouch-org/ouch) | |

Language servers: clangd, rust-analyzer and the TypeScript language server.

## Rules

- Install tools through `ay up`, into `~/.local/bin`; never into `C:\Windows\System32`.
- A tool enters the manifest with a pinned version and, when upstream publishes one, a sha256.
- Measure before claiming a speedup: `hyperfine -N -w 2 -r 10 '<cmd>'`.
