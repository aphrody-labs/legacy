# Filesystems for build and monorepo workloads: XFS vs ext4 vs btrfs

Measured 2026-11-15 on fr1 (`ssh <fr1>`, kernel 7.3.0-10-generic, 12 cores, 45 GB RAM). Raw logs and scripts: `scripts/bench/fs-bench.sh`, `fs-chain.sh`.

## Verdict

- fr1 root (`/dev/sda1`) is ext4 (`rw,noatime,errors=remount-ro,commit=30`) on a non-rotational 300 GB disk; `/srv/build` and `/srv/artifacts` are btrfs (`/dev/sdb1`, zstd:1, subvol `@home`). No in-place conversion exists between filesystems.
- XFS wins where the signal is clean: git checkout (0.90 s vs 1.48 s ext4, -39 %, low sd), warm git status (113 ms vs 222 ms), and cheap target-dir clones (reflink). Cargo builds and small-file fio show no credible difference: sd is as large as the gaps.
- Verdict: do not migrate the root. Use XFS (defaults, `reflink=1`) for a new dedicated build volume (CARGO_TARGET_DIR, clones, CI workspaces); keep ext4 for root. Plan below, not executed.
- Measurement validity: fr1 load average was 40 to 100 on 12 cores for the whole session (Android emulator, GNU tests, zstd, rustc chains from other agents). All runs were pinned with `taskset -c 4,5` and `uptime` load is logged before every benchmark, but cores 4-5 and the host disk were shared. Treat means with sd above 30 % of the mean as noise. Loop devices share the host page cache with the image file; `echo 3 > /proc/sys/vm/drop_caches` before cold runs drops both layers, so cold runs hit the real SSD through the loop device. Absolute numbers are not portable; relative ones are indicative only.

## Method

- Sparse 10 GB image per variant under `/srv/bench-img` on root, `losetup -f --show`, mkfs defaults, mounted at `/mnt/fsb` with `noatime`. Image, loop device and mount removed after each variant (`losetup -a` empty at the end; no live disk touched; prd untouched).
- Variants: `ext4` (mkfs.ext4 defaults), `xfs` (mkfs.xfs 6.19.0 defaults), `xfs-tuned` (`-m bigtime=1,inobtcount=1`, mount `logbsize=256k`), `btrfs` (btrfs-progs 7.1, defaults, no compression, `ssd,discard=async,space_cache=v2` auto-selected).
- hyperfine 1.20.0, N=5 (cold) or N=10 (warm status), mean ± sd.
- Source repos: `/srv/ghidra-rust` (20 702 files, 19 087 commits) for git/untar; `/srv/upabs/tauri` (1 375 files) for cargo. `/srv/src` on fr1 was not usable: HEAD holds 12 files (sparse remnant of a partial clone). `git clone --local` needs `--no-hardlinks` across filesystems (hardlinked commit-graph fails with EXDEV).
- Cargo: `RUSTC_WRAPPER=` (no sccache), deps in shared `CARGO_HOME`, rustc 1.99.1, `cargo check -p tauri-utils --offline`.

## Results

Load average (1 min) at start of each cell is in the logs; ranges 36-95.

| Workload | ext4 | xfs | xfs-tuned | btrfs |
|---|---|---|---|---|
| W1 git clone --local (cold) | 7.29 s ± 1.89 | 4.69 s ± 1.46 | 6.78 s ± 3.93 | 6.39 s ± 5.39 |
| W2 git status (cold) | 1.00 s ± 0.62 | 645 ms ± 432 | 676 ms ± 340 | 2.39 s ± 4.03 |
| W2b git status (warm) | 222 ms ± 86 | 113 ms ± 5 | 110 ms ± 5 | 123 ms ± 12 |
| W3 git checkout 300 commits back and forth | 1.475 s ± 0.194 | 0.901 s ± 0.022 | 0.926 s ± 0.051 | 1.087 s ± 0.020 |
| W4 untar `git archive` (cold) | 2.18 s ± 0.70 | 2.11 s ± 0.94 | 5.20 s ± 4.80 | 3.51 s ± 1.39 |
| W5 fio 4x5000x4k files, end_fsync (3 runs) | 22.1 / 7.5 / 32.0 MiB/s | 5.7 / 7.4 / 9.0 MiB/s | 22.2 / 23.2 / 6.5 MiB/s | 45 / 94 / 52 MiB/s |
| W6 cargo check -p tauri-utils, cold target (3 runs) | 243 s ± 58 | 272 s ± 156 | failed (timeout 900 s under load) | failed (timeout 900 s under load) |
| W7 cargo incremental (touch lib.rs) | 25.5 s ± 14.0 | 11.9 s ± 3.4 | n/a | 9.8 s ± 7.1 |
| W8 `cp -a` of target dir (cold cache) | 1.72 s ± 0.33 | 0.50 s ± 0.13 (-71 %) | 2.38 s ± 4.72 | 0.35 s ± 0.41 |
| W8b `cp -a --reflink=always` | EOPNOTSUPP | 0.77 s ± 0.30 | 2.73 s ± 4.01 | 0.74 s ± 1.22 |

First full pass (target of `cargo check -p tauri`, 1.04 GB, 3 301 files, load 36-57): ext4 `cp -a` 4.58 s ± 1.16 vs xfs `cp -a` 0.61 s ± 0.08 (-87 %) and xfs `--reflink=always` 0.85 s ± 0.20. Cargo full check of `tauri` there: ext4 274 s ± 108, xfs 515 s ± 393 (invalid: contention). Incremental: ext4 2.04 s ± 0.26, xfs 1.52 s ± 0.08.

Reading:

- Git metadata operations (status, checkout) favor XFS and btrfs over ext4, consistent across the passes. Relative change xfs vs ext4: checkout -39 %, warm status -49 %.
- btrfs fio is fastest (copy-on-write turns small writes into appends) but its cold status was worst and its sd is large; not conclusive.
- Cargo wall time is dominated by rustc CPU (user 64 s of 243 s wall under contention); filesystem differences are inside the noise. No migration case from cargo.
- Reflink: `cp --reflink=always` on ext4 fails with `Operation not supported` (measured). On xfs and btrfs plain `cp -a` is already as fast as `--reflink=always`, because coreutils defaults to `--reflink=auto` and uses clone ioctls; the plain-vs-always gap is noise. Clone cost is metadata only and the copy shares blocks (no extra space: xfs-tuned used 1.31 GB with two copies of a 193 MB target).
- `rm -rf target` of the whole tree: 0.05-0.20 s on all, not a differentiator.

## Sourced reference (read in this session)

- mkfs.xfs(8) (man7.org): metadata CRCs on by default; reflink on by default (reference-count btrees, requires crc=1); bigtime and inobtcount not enabled by default (inobtcount needs finobt=1); agcount "scaled automatically based on the underlying device size", minimum AG size 16 MiB, maximum just under 1 TiB; the page gives no relation to core count; log size auto-selected from fs size, minimum 512 blocks.
- Measured on a 10 GB image: `agcount=4`, `crc=1 finobt=1 sparse=1 rmapbt=1 reflink=1 bigtime=1 inobtcount=1 nrext64=1`, internal log 16384 blocks (64 MiB), `logbsize=32k`. With xfsprogs 6.19.0 bigtime and inobtcount are already on by default, so the `xfs-tuned` mkfs flags were redundant; only `logbsize=256k` differed and showed no gain.
- xfs(5) and kernel admin guide (docs.kernel.org/admin-guide/xfs.html): `logbsize` default 32768 (v2 log: max(32768, log_sunit)), valid 16k-256k, `logbufs` 2-8 default 8, `inode64` default since 3.7; V4 format deprecated, mount support removal scheduled September 2030; the page has no DAX section (DAX not applicable: no pmem on fr1). `noatime` is a generic mount(8) option.
- copy_file_range(2): fs may implement copy acceleration (reflink); cross-filesystem copy since 5.19 only for same-type fs that implements it, otherwise EXDEV; EOPNOTSUPP since 5.19.
- cp(1): `--reflink=auto` default (falls back to plain copy), `always` fails if CoW unsupported.
- btrfs docs (btrfs.readthedocs.io Reflink): reflink is a shallow copy sharing blocks, same filesystem only; across mount points of one fs fails before 5.17.
- Allocation groups vs cores: parallelism comes from independent AGs, but the man page gives no rule; at 300 GB the default agcount is small (4 at 10 GB). To raise parallel metadata throughput set `-d agcount=N` explicitly (N around core count, 12 to 16) at mkfs; not measured here.

## Migration plan (not executed)

Goal: XFS volume for build output; root stays ext4 (no in-place conversion, root holds the OS).

1. Provision a new empty block device (new cloud volume or the unused partition of `/dev/sdc` after confirming it is empty with `lsblk -f` and `blkid`); never reformat a mounted or populated device.
2. `mkfs.xfs -L build -d agcount=12 /dev/<new>` (defaults give crc=1, reflink=1, bigtime=1, inobtcount=1 on xfsprogs 6.19).
3. `/etc/fstab`: `LABEL=build /srv/xbuild xfs noatime,nofail 0 2` (log options left default; `logbsize=256k` showed no gain); `systemctl daemon-reload && mount /srv/xbuild`.
4. Point `CARGO_TARGET_DIR`, CI workspaces and `third_party` clones at `/srv/xbuild`; clone sources with `cp -a --reflink=auto` from a golden target dir for instant per-job copies (same filesystem required).
5. Keep sccache dir where it is; verify with `xfs_info /srv/xbuild | grep reflink=1` and one `cp --reflink=always` smoke test.
6. Rollback: unmount, remove fstab line, point env back; no data on root is modified.

Re-run the benchmark when fr1 load is below 4 (`scripts/bench/fs-bench.sh`, then `ONLY=1 SUF=-c2` for cargo only) before committing to the migration; the numbers above are directional only.
