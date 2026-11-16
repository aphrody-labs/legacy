# Gates driven by scripts/ (checkdeps, identity, vcs) (imported by the root justfile).

# NHITL VCS & GitHub Forge CLI via GitHub App aphrody-labs (auth|submodules|worktree|issue|pr|fork)
[group('gates')]
vcs *args:
    bun run "{{root}}/scripts/vcs.ts" {{args}}

# Hardcode and slop scan of the tracked tree (rules: scripts/hygiene.ts; --summary | --rule id | --json)
[group('gates')]
hygiene *args:
    bun "{{root}}/scripts/hygiene.ts" {{args}}

# Personal and site-specific values in tracked files (rule personal-data; also part of `just hygiene`)
[group('gates')]
personal-data:
    bun "{{root}}/scripts/hygiene.ts" --rule personal-data

# Runs bun test and fails when the output holds a secret (env or .env value, token shape); prints no value
[group('gates')]
test-guard *args:
    bun "{{root}}/scripts/test-leak-guard.ts" {{args}}

# tools/identity.toml gate / rewrite / lookup (check | apply | get <key>)
[group('gates')]
identity cmd="check" *args:
    bun "{{root}}/scripts/identity.ts" {{cmd}} {{args}} --root "{{root}}"

# Skills cli-<tool> generated from each tools.toml binary manual (--check = drift only; tool names = subset)
[group('gates')]
cli-skills *args:
    bun "{{root}}/scripts/cli-skills.ts" {{args}}

# Layered dependency gate (Chromium checkdeps analogue): DEPS.rules per directory
[group('gates')]
checkdeps *flags:
    bun "{{root}}/scripts/checkdeps.ts" --root "{{root}}" {{flags}}

# Units changed since ref plus transitive dependents (task graph filter, turbo `--filter=...[ref]` analogue)
[group('gates')]
affected ref="origin/main":
    bun "{{root}}/scripts/checkdeps.ts" --root "{{root}}" --affected "{{ref}}"

# cargo through a local sccache for a FRESH target dir (fr1/fr2/CI agents): clean depot-core 77 s -> 14 s on a warm cache (docs/native/BUILD-SCIENCE.md). Not for the PC (os error 206) nor incremental loops.
[group('gates')]
cargo-cached *args:
    RUSTC_WRAPPER=sccache CARGO_INCREMENTAL=0 cargo {{args}}

# Test only affected units: cargo -p for crates, bun test for packages. Cargo cache: local sccache (R2 remote cache: TICKET taskgraph-001)
[group('gates')]
test-affected ref="origin/main":
    #!/usr/bin/env sh
    set -eu
    out=$(bun "{{root}}/scripts/checkdeps.ts" --root "{{root}}" --affected "{{ref}}")
    pkgs=$(printf '%s\n' "$out" | awk -F'\t' '$1=="cargo" && $3 !~ /^third_party\// {printf "-p %s ", $2}')
    bunp=$(printf '%s\n' "$out" | awk -F'\t' '$1=="bun" && $3 ~ /^(frameworks|system)\// {printf "%s/%s ", "{{root}}", $3}')
    [ -z "$pkgs" ] || cargo test $pkgs
    [ -z "$bunp" ] || bun test $bunp
    pyp=$(printf '%s\n' "$out" | awk -F'\t' '$1=="uv" {printf "%s/%s ", "{{root}}", $3}')
    [ -z "$pyp" ] || uv run pytest $pyp

# Toolchain pin (one line, rust-toolchain.toml): `just toolchain` lists generations and status, `just toolchain-use <milestone>` switches and installs
[group('gates')]
toolchain:
    bun "{{root}}/scripts/toolchain.ts" list
    bun "{{root}}/scripts/toolchain.ts" status

[group('gates')]
toolchain-use milestone:
    bun "{{root}}/scripts/toolchain.ts" use {{milestone}}
