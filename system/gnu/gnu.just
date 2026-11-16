# GNU packages in Rust (docs/native/gnu/OS.md). Imported by the root justfile: recipe names stay global.

# GNU testsuite of a first-party port on fr2, GNU against ours; build on fr1, writes system/gnu/<id>/PROOF.md
[group('gnu')]
gnu-check id:
    bun "{{root}}/scripts/gnu-check.ts" {{id}}

# system/gnu/packages.toml from GSRC and gnu-packages.json
[group('gnu')]
gnu-packages:
    bun "{{root}}/scripts/gnu-packages.ts"

# Drift gate: packages.toml current, carried packages agree with the inventory
[group('gnu')]
gnu-drift:
    bun "{{root}}/scripts/gnu-packages.ts" --check
