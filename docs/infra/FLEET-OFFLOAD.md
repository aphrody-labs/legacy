# Fleet offload (fr1 load, isolation, dispatch)

Owner order 2026-11-15: offload fr1 in depth. Measured 2026-11-15 00:10-01:05 UTC, tools in `infra/fleet/bin`, apply with `just fleet-offload apply fr1|fr2` (`infra/fleet/bin/fleet-offload.sh`, idempotent, survives reboot: units are enabled, drop-ins and udev rules live in `/etc`).

## 1. Diagnosis (15 min windows, not a snapshot)

Collectors installed on fr1 (versioned): `fleet-cgsample.timer` (60 s, per-cgroup CPU/IO/PSI TSV in `/var/log/fleet/cgsample.tsv`, report `fleet-cgreport.sh`), `atop` with 30 s history (`infra/fleet/fr1/offload/atop.default`, report `fleet-atopreport.sh`), `fleet-procwindow.sh` (pidstat per command).

| Question | Evidence (fr1, 00:12-00:40 UTC) |
| --- | --- |
| Who burns the CPU | `/` 11.43 of 12 cores; `user.slice` 10.73 (94 %: agent sessions); `system.slice` 0.36 (CI runners, docker); `aphrody.slice` 0.14 (haproxy, cloudflared); nativelink-server/worker about 0 (no siso build ran). Three session scopes alone: 3.5, 2.6, 2.0 cores. |
| By class (pidstat 14 min, avg cores) | builds: rustc 4.15 (chromium-157 dependency builds, workspace builds), cc1 0.16; benches/emulator: zstd 0.46, zig 0.42, qemu-system-x86_64 0.41; git 0.19; services: haproxy 0.08, dockerd, cloudflared below 0.1 each. The rest is short-lived children (cargo/rustc helpers, `sh`) missed by pidstat sampling. Permanent services are under 3 % of the host. |
| IO pressure source | `/home` is btrfs on sdb+sdc, rotational ("ROTA 1"). atop: sdb busy avg 95 % (max 104 %), sdc 8 %, sda 25 %. iostat: sdb r_await 80 ms, 99 % util at 17 MB/s read; sda `await` 0.2-3.7 ms. cargo and sccache read 12.0 GB and 11.0 GB in 14 min (cargo home and target under `/home/ubuntu/build`, sccache cache `/home/ubuntu/.cache/sccache`), rustc 8.2 GB. |
| Swap | Not the IO source: zram0 0.1-0.3 MB/s of block IO, swapfile on sda (3 ms). Swap is 20.4 of 20.5 GB full with 25 GB free RAM (cold pages, mostly the 12 GB of `/tmp` tmpfs: `shen-probe` 2.9 GB, `android-ubuntu` 1.7 GB, `cv`, `ayt2`...); churn 24 MB/s in and out costs CPU (kswapd 0.07 core, `sy` 16 %), not disk. |
| Runaways | None found in the windows; nothing killed by this work (the 2.2 h `awk | grep` was killed before). |
| sccache | 4504 requests, 3 hits (0.08 %); see section 3. |

Conclusion: fr1 is CPU-bound by agent sessions in `user.slice` (unmanaged, weight 100 like the services) and IO-bound by one rotational btrfs where every cargo target and registry lives. Nothing was isolating the core services from either.

## 2. What already existed (checked in the repo)

- NativeLink 1.8.5 server (REAPI CAS 150 GB + AC + scheduler, `infra/fleet/fr1/orphans/systemd/nativelink-server.service`) and one worker (`infra/chromium-factory/nativelink/deploy.sh`). At 00:12 only fr1's worker was connected (`ss` on `:50061`: 1 session); fr2 and prd workers were absent.
- `infra/fleet/bin/heavy.sh`: flock slots plus a load gate, fr1 and prd only; not used by interactive agents (39 sessions).
- `packages/ai-os` orchestrator (`orch_run`: failover by host list; `fleet_status`: read-only uptime) and `fleet-health`: no PSI-based placement, no cgroup.
- `build.slice` on fr1 (MemoryHigh 34G/MemoryMax 38G); `interactive.slice` weights 1000 (nginx). `aphrody.slice` (haproxy, cloudflared) had no weight.
- `65-aphrody-vps.rules` sets every OVH disk scheduler to `none`: cgroup `io.weight` has no effect there.

## 3. Tool choice

| Candidate | Decision | Evidence |
| --- | --- | --- |
| cgroup v2 slices + bfq on the rotational disks | Deployed (fr1, fr2) | `cgroup.controllers` has cpu io memory; bfq module present (`modinfo bfq`, kernel 7.3.0-10); scheduler was `none`. After apply sdb and sdc show `[bfq]`. |
| `fleet-run` least-loaded dispatcher | Deployed (fr1, fr2) | No existing tool reads PSI or joins a slice. About 100 lines of shell over `/proc/pressure` and `systemd-run --scope`; avoids a new control plane. |
| NativeLink as single REAPI | Kept as is | Already the siso backend. REAPI needs a client (siso, bazel); no agent job speaks it, so only Chromium compiles can use it. A fr2 worker was not deployed: fr2 is the edge host and its root was at 96 % (4.2 GB free) when measured; revisit with a dedicated small CAS (8 GB) when a siso build is scheduled. |
| sccache-dist | Rejected | sccache `docs/Rust.md` (mozilla/sccache, v0.19.0 2026-10-24): `bin`, `dylib`, `cdylib`, `proc-macro` crates are not cached or distributed, and incremental crates (workspace members) go uncached; `docs/Distributed.md`: builders are Linux 64-bit with bubblewrap. The jobs that load fr1 are incremental workspace builds, links and tests; fr2 would add 6 cores to 12 for non-incremental rlibs only. |
| sccache shared remote (R2, `SCCACHE_MULTILEVEL_CHAIN=disk,s3`, `docs/MultiLevel.md` and `docs/S3.md`) | Not deployed: no hits to share | `fleet-sccache-keytest.sh` on fr1 (regex dependency set, 5 compiles, identical toolchain): rebuild with another `CARGO_TARGET_DIR` 0/5 hits; another `CARGO_HOME` path 0/5; same target dir after `cargo clean` 5/5 hits. Fleet hit rate 3 of 2614 Rust compiles. The target dir path is part of the key, and agents use different ones. A remote cache only pays after pinning `CARGO_TARGET_DIR`/`CARGO_HOME` per class on all hosts. |
| distcc, icecream | Rejected | C/C++ only; Chromium goes through siso plus NativeLink, `src/` C builds take under 4 s (`CLAUDE.md`). |
| Bazel/Buck2 remote execution | Rejected | No Bazel/Buck2 graph in the repo; NativeLink is already the server siso uses. |
| Nomad, GNU parallel `--sshlogin` | Rejected | New control plane, or static slot-based placement without PSI. |

## 3b. Deployed

- fr1 (`infra/fleet/fr1/offload`): `agents.slice` (CPUWeight 50, IOWeight 50, MemoryHigh 24G), `bench.slice` (weight 10, CPUQuota 400 %, MemoryHigh 10G/Max 14G), `user.slice.d` weights 50/50 (the 39 interactive sessions), `aphrody.slice.d` weights 1000, `build.slice.d` explicit weights 100, nativelink-server moved to `interactive.slice` (top weight), nativelink-worker to `build.slice`, `66-fleet-bfq.rules` plus `modules-load.d/fleet-bfq.conf` (bfq on sdb and sdc, sorts after the `none` rule), atop 30 s, `fleet-cgsample.timer`, `/etc/fleet/run.conf` (peer fr2).
- fr2 (`infra/fleet/fr2/offload`): `agents.slice` (50, MemoryHigh 7G), `bench.slice` (10, CPUQuota 300 %, MemoryHigh 5G), sampler timer, `run.conf` (peer fr1).
- `fleet-run [-c agent|test|lint|research|bench|build] [-H fr1|fr2|auto] [-C dir] -- cmd` (installed as `/usr/local/bin/fleet-run`; `just fleet-run <class> <cmd>` from the PC): reads PSI of local and peer (score = 0.5 cpu10 + 0.3 cpu60 + 0.5 io10 + 2 mem10), the local host keeps the job unless the peer scores 12 points lower, a peer is skipped under 8 GB free root or when the directory does not exist there, `build` never leaves fr1. The job runs in `systemd-run --scope --slice=<class slice>` as the calling user with the caller's environment. Verified: `class=test -> fr2`, `/proc/self/cgroup` = `/agents.slice/...`, `-H fr1` stays local, env var passed through.
- Not touched: prd (read-only load check), every production service.

## 4. Measurements

`fleet-offload-bench.sh <label>` (TSV `/var/log/fleet/offload-bench.tsv`): PSI avg300, load, NativeLink scheduler `/status` latency (120 requests; REAPI itself needs a siso client and none ran, so this is a responsiveness proxy), and a cargo incremental rebuild of a synthetic dependency-free crate (60 modules x 300 fns, touch one module).

| Moment | cpu PSI avg300 | io PSI avg300 | load 1/5/15 | NativeLink /status | cargo incremental |
| --- | --- | --- | --- | --- | --- |
| Before (00:30 UTC) | 81.66 | 72.75 | 80.09/70.68/59.83 | p50 4.2 ms, p95 12.0 ms, max 23.5 ms | 78.7 s |
| After (default path) | AFTER_DEFAULT |
| After (via fleet-run, placed by PSI) | AFTER_FLEETRUN |

The totals only drop when work moves off fr1; the slices and bfq change who is served first under contention. The agents already running keep running in `user.slice` (weight 50 now); new jobs started through `fleet-run` are placed by PSI.

## 5. fr2 disk and legacy purge (owner order, no archive)

| Host | Path | Size | Proof it was unused | Action |
| --- | --- | --- | --- | --- |
| fr2 | `/var/lib/yolo-cache/datasets/fleet-aot-workerd-bundles.cache` | 15 GiB | `cmp` against `/dev/zero` over all 16106127360 bytes: all zero bytes; no reference in `C:\src` except docs and `fr1-r2.sh` path list; mtime 2026-11-07. A zstd copy (505 KB) was first uploaded to `r2:aphrody-archive/fr2/yolo-cache` and verified (`rclone check --download`, round-trip sha256 equal), then purged from R2 again on the later owner order. | deleted |
| fr2 | `/home/ubuntu/src/yolo-jobs` | 10.2 GB | no file changed in 3 days, 0 open files (`lsof +D`), no unit/cron referencing it, no unpushed commits in its repos, no reference in `C:\src` | deleted |
| fr2 | `/home/ubuntu/src/yolo-work` | 2.1 GB | same; only consumer was `yolo-git-sync`, which fast-forwarded these legacy checkouts (6 of 12 `fetch-failed`) | deleted |
| fr2 | user units `yolo-git-sync.{service,timer}`, `yolo-clean.{service,timer}`, `yolo-worker`, `yolo-cluster.target`, `~/.local/share/yolo-git-sync`, `~/.local/bin/yolo-clean.sh` | small | only touched the deleted trees; cleaning is covered by `fleet-clean.timer` (fleet-tune); worker already in `DISABLE_USER` (its Redis tunnel is gone) | removed, `resilience.conf` and `infra/fleet/systemd/yolo-clean.*` removed |
| fr1 | user units `yolo-worker`, `yolo-git-sync.{service,timer}` (failing: `Result: resources`, restart loop), `yolo-lightpanda` (loopback CDP :9226, no client connected, no reference in the repo), `yolo-cluster.target`, `~/.local/share/yolo-git-sync`, `~/.local/bin/lightpanda` | small | failing loop for the first two (worker listed in `DISABLE_USER` of `fr1/resilience.conf`); no consumer for lightpanda | removed |

Kept on fr1 with proof of use (rule: proof means keep and report): `/home/ubuntu/src/yolo-jobs` (non-tooling files modified within 7 days: `webos-apps/yolo-ui/zig/zig-out/lib/*.lib`, `.fx.json`), `yolo-snapshots`, `yolo-work`, `yolo-current`, `/home/ubuntu/build/yolo-{ui,web}`, `/home/ubuntu/.cache/yolo-build` (files modified within 14 days), `/home/legacy/{git,npm}` (bare repos and npm packs: not checked against GitHub remotes, so not deleted), `/var/lib/yolo-cache` (mount of the btrfs backing `/home`, not a folder). `atime` is useless as proof here: `/` and `/home` are `noatime` (RUNBOOK). The fr1 trees are the migration backlog into the aphrody layout under `/srv`.

Disk: fr2 root 92 GB used / 4.2 GB free at the start; after the dataset and the yolo trees 76 GB used / 21 GB free (-16 GB used net, with other jobs writing meanwhile). fr1 root went from 40 GB free at 00:11 to 21 GB free (93 %) at 01:00 from other sessions' writes; not caused by this work, needs attention (cargo targets on `/srv`).
