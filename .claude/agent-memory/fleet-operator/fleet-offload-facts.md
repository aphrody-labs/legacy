---
name: fleet-offload-facts
description: Measured facts about fr1/fr2 load (2026-11-15) that drive fleet-run, slices and cargo advice; read before touching fleet perf
metadata:
  type: project
---

fr1 /home is btrfs on rotational sdb+sdc (95% busy, 80 ms await): cargo registry/targets there are the IO pressure source; swap (zram) is not. Disk scheduler is `none` via 65-aphrody-vps.rules, so cgroup io.weight needs the 66-fleet-bfq rule (device/fleet/fr1/offload).

Cargo's global flock CARGO_HOME/.package-cache serializes all agents; a 1-crate build blocked >10 min. fleet-run gives each class/user a private /srv/cargo-home-fleet-<class>-<user>.

sccache hits only with identical CARGO_TARGET_DIR (5/5 same dir, 0/5 other dir); fleet hit rate 0.08%, so remote sccache/R2 and sccache-dist were rejected (docs/infra/FLEET-OFFLOAD.md).

**Why:** owner order 2026-11-15 to offload fr1; yolo legacy purge needs proof of use, and `/` and `/home` are noatime so atime is not proof (use mtime within 7 d, lsof, units, repo refs).
**How to apply:** use `just fleet-run <class> <cmd>` / `ssh vps fleet-run`; keep fr1 root (SSD, 93% full) free; fr1 yolo trees kept (recent mtime), see doc section 5.
