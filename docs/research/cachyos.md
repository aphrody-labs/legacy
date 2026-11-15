# CachyOS as a performance reference (2026-11-15)

Owner directive (2026-11-15): "prends exemple sur tout CachyOS".
- Clones on fr1 at `/srv/research/cachyos/`:
  - CachyOS-Settings 9e6603a (2026-11-11)
  - linux-cachyos 13814d5 (2026-11-14)
  - CachyOS-PKGBUILDS 8a0dd4b (2026-11-14)
  - wiki 8ef9771 (2026-11-14)
- Every value below was read from those trees.

## Package build (CachyOS-PKGBUILDS/pacman/makepkg.conf)

- Compiler: `CFLAGS="-march=native -O3 -pipe -fno-plt -fexceptions ..."`. The distro repos ship x86-64-v3/v4 builds; `-march=native` is the local default.
- Linker: `LDFLAGS="-Wl,-O1 -Wl,--sort-common -Wl,--as-needed -Wl,-z,relro -Wl,-z,now ..."`.
- `LTOFLAGS="-flto=auto"`, `MAKEFLAGS="-j$(nproc)"`.
- Package compression: `COMPRESSZST=(zstd -c -T0 -9 -)`, zstd level 9 on all threads.

## Kernel (linux-cachyos/linux-cachyos/PKGBUILD defaults)

- Scheduler: `_cpusched=cachyos`. Variants exist for bore, eevdf, bmq, rt-bore, hardened and rc.
- Toolchain: `_use_llvm_lto=thin` (clang ThinLTO), with `_autofdo` and `_propeller` profile-guided options (off by default, profile-driven).
- Timer and preemption: `_HZ_ticks=1000`, `_tickrate=full`, `_preempt=full`.
- Memory and tuning: `_hugepage=always`, `_cc_harder=yes` (-O3).
- Module trimming: `_localmodcfg` via modprobed-db, to cut build time.
- Optional: `_tcp_bbr3`, `_use_kcfi`, and ZFS/NVIDIA-open modules.

## System settings (CachyOS-Settings/usr/lib)

- sysctl (`70-cachyos-settings.conf`):
  - `vm.swappiness=100` (paired with zram), `vm.vfs_cache_pressure=50`, `vm.page-cluster=0`.
  - `vm.dirty_ratio=10`, `vm.dirty_background_ratio=3`.
  - `kernel.nmi_watchdog=0`, `net.core.netdev_max_backlog=4096`, `fs.file-max=2097152`.
- zram (`zram-generator.conf`): zstd, `zram-size = ram`, swap priority 100.
- IO schedulers (`60-ioschedulers.rules`): bfq for rotational, mq-deadline for SATA SSD/mmc, kyber for NVMe.
- Writeback (`61-writeback-limits.rules`): `bdi/strict_limit=1`, `max_bytes` 256 MiB (16 MiB for USB).
- THP (`tmpfiles.d/thp.conf`): defrag `defer+madvise`, plus a THP shrinker.
- systemd: oomd per-slice defaults, journal size cap, limits and timeouts, ntsync module.

## What src adopts (each change measured before it is adopted)

| CachyOS practice | src application | Owner of the work |
| --- | --- | --- |
| -O3, -march x86-64-v3, ThinLTO, AutoFDO/Propeller | release profiles for ay, libaysys and the C core; PGO+BOLT/Propeller on fr1 | build-science agent (docs/native/BUILD-SCIENCE.md) |
| zstd -T0 -9 for packages | artifact and R2 compression defaults | compression study |
| zram zstd, swappiness 100, dirty ratios, IO schedulers, writeback limits, THP defer+madvise | fr1 and fr2 build/test hosts, measured with hyperfine before and after; prd untouched | build-science agent |
| scheduler variants (bore, eevdf, sched-ext) | candidate kernels for fr1 builds, never on prd | research only until measured |
| modprobed-db trimming | `infra/os` kernel configs | infra/os |
