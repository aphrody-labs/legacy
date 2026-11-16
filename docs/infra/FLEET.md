# Fleet

Three hosts behave as one server. Versioned sources are in [`device/fleet/`](../../device/fleet); hosts are ssh aliases and every address comes from the manifest, never from this page.

| Role | Does |
| --- | --- |
| `fr1` | builds (Chromium, LLVM, Rust), CI runners, training, heavy agents |
| `fr2` | tests, lint, benchmarks, research; edge services (nginx vhosts, CDN, ACME) |
| `prd` | production backends only |
| workstation | edits and drives; no Rust build |

## Where things are

- Host-specific config: `device/fleet/{fr1,fr2,prd}/` (nginx, systemd units, sysctl, resilience and tuning settings); shared scripts in `device/fleet/bin/`; units in `device/fleet/systemd/`.
- Cluster data plane (haproxy, nginx, slices) is generated from `device/deploy.toml` by `device/cluster/gen.ts`.
- Certificates: [`device/fleet/ACME.md`](../../device/fleet/ACME.md). Consoles, safe reboot and reinstallation: [`device/fleet/RUNBOOK.md`](../../device/fleet/RUNBOOK.md).
- Build caches and disk: `bun device/fleet/cache.ts status`.

## Procedures

```sh
just fleet-bootstrap <role>      # toolchains from prebuilts/up/tools.toml
just fleet-setup <role>          # host configuration, idempotent
just build-all                   # on fr1: images, ay, wasm, site, artifacts
just deploy-images <prd|fr2> <sha> <profile> <services>
just ci-local                    # mirror of the workflows
```

- Each host keeps one read-only checkout of `main` (`src-checkout-update.timer` fast-forwards it); no compiler runs on `prd` or `fr2`.
- Roll back a deploy by running `deploy-images` again with the previous tag.
- Always `timeout N ssh`; exit 255 means an overloaded host.
- Hosts, tokens and keys never appear in tracked files: roles come from ssh aliases and secrets from the vault.
