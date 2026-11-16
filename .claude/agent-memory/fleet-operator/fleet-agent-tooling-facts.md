---
name: fleet-agent-tooling-facts
description: Traps met installing tools and agent config on fr1/fr2/prd (2026-11-15): ay version skew, yq, codex marketplace, CTX7 key path, sccache config
metadata:
  type: project
---

- Host `ay` binaries differ (PC 0.2.0, fr1/fr2 0.4.0, prd /usr/local/bin 0.2.0 root-owned); tools.toml keys newer than the host ay (`pick`) fail to parse, so keep manifest changes expressible for the oldest ay or rebuild ay on fr1. Run `ay up` from /srv/src (cwd manifest), else the embedded old one is used.
- ay `tree` layout fails for ollama and servo on Linux ("missing after unpack"): open item, needs src/up fix.
- Secrets reach hosts as systemd-creds in the ssh user's credstore (fr1/fr2 = ubuntu, prd = agent), not as env; consumers must decrypt (runner.ts CRED_NAMES). Scope in device/vault/policy.toml; prove with `env-kit vault fp NAME --host H` (BLAKE3).
- `ay up` install_archive_bin purges ~/.cargo/bin copies: a cargo config naming that path breaks cargo (fr1 sccache, fixed in common.sh).
- A codex marketplace whose root vanished makes every `codex plugin ...` fail; toolchain.ts now removes it.
- Another session was moving tools.toml to prebuilts/up/tools.toml on 2026-11-15 (uncommitted); bootstrap scripts take LOCK=path.

**Why:** each cost a debugging round. **How to apply:** check these first when a host tool install or agent sync misbehaves.
