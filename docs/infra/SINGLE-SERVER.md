# Single logical server (fr1 + fr2 + prd)

Owner order 2026-11-15: turn the three hosts into one logical server, progressively: fr2 first, then fr1, prd last with zero service interruption. fr1 = `ssh <fr1>` (factory), prd = `ssh prd` (US production, never down), fr2 = `ssh <fr2>` (test, research, edge). Single source: `infra/fleet/cluster.toml`. Every step is a repo file plus an apply step (`just fleet-offload apply fr1|fr2`), idempotent, reversible, logged at the end of this file.

## 1. State found (2026-11-15 06:35 UTC, read from the hosts)

| | fr1 `vps` | fr2 `cdn` | prd |
| --- | --- | --- | --- |
| Cores / RAM | 12 / 45 GB | 6 / 11 GB | 8 / 31 GB |
| Disks | `sda` 300 GB SSD ext4 root (83 GB free); `sdb` 500 GB + `sdc` 305 GB rotational, one btrfs `/home` (647 GB used, another agent is purging it) | `sda` 100 GB, one ext4 root, no spare device | `sda3` 400 GB btrfs root (177 GB free), no xfsprogs |
| Mesh | wg1 <fr1-mesh-ip> (hub) | wg1 <fr2-mesh-ip> | wg `vps` <prd-mesh-ip> |
| Tunnel connectors | `cloudflared-mig-prd` | `cloudflared-mig-prd`, `cloudflared-fr2` | `cloudflared-mig-prd`, `cloudflared-prod` |
| Shared services | NativeLink <fr1-mesh-ip>:50051 scheduler, :50061 CAS and workers | Valkey <fr2-mesh-ip>:6379 (mesh + loopback, `NOAUTH`: AUTH required) | loopback Valkey and Postgres (production data, not shared) |

Cloudflare (`cf tunnels list`, live): `mig-prd` healthy with 12 connections from fr1, fr2 and prd (the unified tunnel already exists, `docs/infra/CLUSTER.md`), plus `fr2` (4), `prod` (4), `auto-usa` (4), `shenron-dbfr` (8, community site, not an Aphrody product, left alone). `cf.ts plan tunnels` shows one drift: live `mig-prd` has `open-origin.aphrody.com -> 127.0.0.1:29403` that `infra/cloudflare/cloudflare.toml` lacks (added by another session; not touched here).

## 2. Research and decisions

### Storage: one XFS volume on fr1 shared over NFS was measured (decision below replaces the earlier unmeasured one)

Measured on fr2 (`scripts/bench/fs-fr2.sh`, 18 309 files, 524 MB working tree, load 3, hyperfine):

| | ext4 root | XFS loop volume | change |
| --- | --- | --- | --- |
| warm `git status` | 99.6 ms ± 24.9 | 111.4 ms ± 34.6 | none (noise) |
| `checkout HEAD~1` and back | 1.907 s ± 0.234 | 1.718 s ± 0.220 | -10 %, inside the noise |
| `cp -a` of the tree (target clone) | 5.93 s ± 3.62 | 3.33 s ± 0.19 | -44 % |
| `cp -a --reflink=always` | EOPNOTSUPP on ext4 | 3.22 s ± 0.52 | reflink works, same as `cp -a` (auto) |

The fr1 gains of `FILESYSTEMS.md` (checkout -39 %, status -49 %, clone -87 %) are not reproduced on fr2: the proof volume is a loop image on the ext4 root (two stacked filesystems, one shared disk), fr2 has 6 cores shared with edge services. Only the clone result moved. The gains need a real device; decision unchanged (XFS for build data), expectation lowered to "clone and checkout faster, status equal".

Network FS cost, measured on fr2: one warm `git status` of that tree issues 52 177 syscalls: 25 600 `newfstatat`, 8 274 `openat`, 6 430 `getdents64`. Mesh RTT from fr2 (`ping -c 8`): fr1 10.7 ms, prd 5.9 ms. Without client cache every metadata call costs one RTT: 34 000 calls x 5.9 ms is about 200 s against 0.1 s local. NFS attribute caching removes part of it, not three orders of magnitude, and any metadata-server design (JuiceFS metadata in Valkey, SeaweedFS filer, Ceph MDS, Gluster lookups) pays the same RTT per uncached operation. Not measured: an actual NFS or JuiceFS mount (no NFS server was installed on edge hosts; the bound above is the argument).

| Candidate | Source (read 2026-11-15) | Decision |
| --- | --- | --- |
| JuiceFS v1.4.2 (2026-10-22) | repo README: POSIX FS, data in object storage, metadata in an engine (Redis, MySQL, SQLite...), chunks of up to 64 MiB | Rejected for work trees and targets (RTT per metadata op, see above). Reconsider for cold shared datasets on R2 only |
| SeaweedFS 4.53 (2026-11-08) | repo README: small files packed in volume files, O(1) seek, filer adds directories, FUSE mount | Rejected: same network metadata path, one more control plane to run on three small hosts |
| GlusterFS v11.2 | `gh api`: last release 2025-07-02 | Rejected: stale release line |
| Ceph | `gh api releases/latest` returned no release object | Rejected: needs dedicated OSD disks and 3+ monitors, hosts have one disk each (fr2, prd) |
| Plain XFS per host + NFS over the mesh | measurements above | NFS only for cold, read-mostly trees if ever needed |

**Measured 2026-11-15, NFSv4.2 from fr2 to the XFS on fr1** (`fleet-nfs.sh`, export to the mesh peer only, `vers=4.2,nconnect=8`, RTT fr2-fr1 10.7 ms; `scripts/bench/fs-nfs.sh`; same 2 000-file tree of a git repo plus a dependency-free crate on each location; hyperfine, fr1 load 20 so its figures are pessimistic):

| Workload | fr2 ext4 | fr1 local XFS (loop on SSD) | NFS from fr2 to fr1 XFS |
| --- | --- | --- | --- |
| untar 2 000 files | 1.29 s | n/a | 128 s (98x) |
| `git status` (warm) | 18.7 ms ± 5.0 | 12.6 ms ± 0.8 | 758 ms ± 1604 (first run cold) |
| `checkout HEAD~1` and back | 267.9 ms ± 48.9 | 179.6 ms ± 8.8 | 41.7 s ± 1.7 (155x) |
| `cp -a` of the tree (target clone) | 385.8 ms ± 31.4 | 336.5 ms ± 11.9 | 432 s, one run (1 120x) |
| `cargo check` cold target, 18 000 fns, no deps | 2.56 s ± 0.19 | 2.05 s ± 0.11 | 4.35 s ± 2.02 (1.7x) |

An earlier attempt with the 18 309-file tree had to be aborted: untar over NFS took about 15 minutes (8.6 s on ext4), `git add -A` was still running after 21 minutes. Reading: every file operation is one or more 10.7 ms round trips; CPU-bound work (cargo on a few large files) loses 1.7x, file-heavy work (git, clone, untar, node_modules, a cargo target with thousands of rlibs and incremental files) loses two to three orders of magnitude. FS-Cache (`fsc`, cachefilesd) was not measured: it caches file data of repeated reads and cannot remove the per-file metadata round trips that dominate here. The export and the client were removed after the run (`fleet-nfs.sh down`); prd was never mounted.

**Decision (numbers decide):** one XFS volume owned by fr1 is the single storage pool (LVM over sdb+sdc once the pool is freed). Over NFS it is shared only for what is read as large files or written rarely: artifacts, cold datasets, release outputs, the NativeLink CAS stays on its own service. Anything that creates or stats many files (git work trees, `CARGO_TARGET_DIR`, `node_modules`, CI workspaces, clones) stays host-local, on the same `/srv/xbuild` path on every host (the fr2 loop XFS until its root is reinstalled), and is shared across hosts by content (sccache on Valkey, NativeLink CAS, R2), not by a POSIX mount.

### Scheduler: extend fleet-run, no Nomad/k3s

`FLEET-OFFLOAD.md` section 3 already rejected Nomad (new control plane, slot placement without PSI), sccache-dist and distcc, with measurements; that evidence is reused. Nomad v2.1.1 (2026-10-29) and k3s v1.37.2 (2026-11-03) exist, but placement here is two worker hosts (prd excluded by policy) on 6 and 12 cores, jobs are ad hoc shell commands launched by 39 agent sessions, and the missing piece was PSI-aware placement and a registry, not an orchestrator. Not measured: k3s/Nomad memory on fr2 (not installed). Delivered instead: `fleet-registry` (host and service registry from `cluster.toml`), `fleet-run` taking its peers from it (class allow-list per host: prd has none, so it can never receive a job), and the XFS target dir pinned by `fleet-run` when `/srv/xbuild` is XFS.

### Tunnel: mig-prd is the unified tunnel

Already live with replicas on all three hosts (4 connections each). Remaining per-host tunnels and their ingress: `fr2` (`ssh-fr2`, `mcp-origin`, `gnu`), `prod` (prd), `auto-usa` (prd). Plan: for each, give its origin a cluster lb_port (`infra/deploy.toml [cluster]`, HAProxy on every member; `ssh-fr2` pinned to fr2:22), add the hostname to `[tunnels.mig-prd]` in `infra/cloudflare/cloudflare.toml` (the single ingress config), switch the DNS CNAME to `tunnel:mig-prd` (one record at a time, each with its rollback line), verify, then stop the old connector. Order: fr2 tunnel first; `prod` and `auto-usa` last, one hostname at a time, old connector kept running until every hostname is served by `mig-prd` and verified with an HTTP code plus a rendered check. Not started: needs `just cluster-deploy` on all members, and prd HAProxy is the production path.

### Valkey and NativeLink over the mesh

Registered in `cluster.toml` (`fleet-registry endpoint valkey` = <fr2-mesh-ip>:6379, NativeLink scheduler <fr1-mesh-ip>:50051, CAS :50061). Both listen on mesh addresses only; Valkey demands AUTH, so no consumer is added without the secret in `/etc/aphrody/secrets.env`. prd Valkey stays loopback (production data).

## 3. Stages and log

| Stage | Scope | State |
| --- | --- | --- |
| 0 | Inventory, research, design | done 2026-11-15 |
| 1 | fr2: `fleet-xfs.sh` volume, registry, fleet-run from registry | live on fr2 (below) |
| 2 | fr1: XFS volume. No free device (sdb/sdc are the btrfs pool /home, which still carries the NativeLink CAS and relocations; a btrfs pool cannot be shrunk in place), so a 40 GB loop image on the SSD root, same paths as fr2 (`fr1/offload/etc/fleet/xfs.conf`) | live: agcount=12, reflink=1, mounted on /srv/xbuild |
| 2b | Mesh ssh key (`fleet-mesh-key.sh`: key generated on each host, restricted to the read-only `fleet-probe` from the mesh subnet, subnet from `FLEET_MESH_FROM`, nothing in the repo) | live: `fleet-registry status` shows all three hosts from fr1 and fr2 |
| 3 | Tunnels into `mig-prd`: fr2 (ssh-fr2, mcp-origin, gnu) and prod (desktop.aphrody.app) done, hostname by hostname; old connectors stopped. `auto-usa` NOT merged: its origin is the docker name auto-web:3001 on the auto-prod network, unreachable from the host HAProxy and from fr1/fr2 replicas; needs the compose to publish a loopback port (recreate of auto-web = downtime without blue/green) | fr2 and prod done, auto-usa pending |
| 4 | Reconcile live `open-origin` ingress into cloudflare.toml | done, `cf.ts plan`: no changes |
| 5 | NFS export of the fr1 XFS and automount client on fr2 | measured then removed: unusable for trees (table above); re-enable only for artifacts |
| 6 | Free the fr1 btrfs pool, LVM over sdb+sdc, one XFS at /srv/xbuild | NOT started: owner order changed to rescue first (no source tree or git repo deleted); inventory running on fr1 (`/srv/xbuild/rescue/inventory.json`) |
| 7 | Valkey password rotated (`fleet-valkey-rotate.sh`: vault, CONFIG SET live, clients fr1 and fr2 updated, ay-index-worker restarted; old AUTH: WRONGPASS, new: PONG). Clients found: ay-index-worker on fr1 and fr2 (valkey.url); prd has its own Redis (shenron), not this Valkey | done |
| 8 | sccache on Valkey across hosts: same rustc on both (toolchain chromium-157, rustc 1.100.0-nightly 1edd55dcf, binary b3sum equal), same crate path and target dir, `fleet-run` env. fr1 first: 1 miss (stored); fr2 then: 1 hit of 1 (100 %), `Cache location redis ... prefix /sccache/` | proven |
| 9 | NativeLink worker on fr2 (2 jobs, 5 GB cache) registered to the fr1 scheduler; `proof.sh`: 24 remote actions, 7 ran on fr2 (hostname written by the action), 17 on fr1 | proven |
| 10 | fr2 backup to the shared XFS (`fleet-fr2-backup.sh`: Valkey, dbfr, relay, edge; sha256 per archive) | running at 1 MB/s through the workstation, see log |
| 11 | Pool freed, LVM over sdb+sdc, one XFS, NFS export of cold data to fr2 and prd | waits for the rescue agent (inventory still walking the pool after 1 h, nothing pushed or copied yet) and for the owner window on prd |

Log (UTC, 2026-11-15):

- 06:35 inventory read-only on the three hosts (`lsblk`, `df`, `wg show`, `ss`, `systemctl`, `cf tunnels list`).
- 07:05 commit 60a78cc451 (`fleet-xfs.sh`, `fleet-registry.sh`, `cluster.toml`, fleet-run changes). fr2 `/srv/src` could not fast-forward (local uncommitted `Cargo.toml`/`Cargo.lock` of another job), so the tree was shipped with `git archive 60a78cc451 infra/fleet` to `/tmp/fs` and applied with `fleet-offload.sh apply fr2`; no file of the dirty checkout was touched.
- 07:08 fr2: `fleet-xfs.sh apply`: `/var/lib/fleet/xbuild.img` 4 GB sparse, `mkfs.xfs -d agcount=6`, fstab `loop,noatime,nofail`, `/srv/xbuild` mounted, reflink smoke test ok (`xfs_info`: `agcount=6 reflink=1`). Root cost 0.5 GB (XFS metadata).
- 07:20 benchmark above (4c352b5298). Temporary trees removed by the script's trap.
- 07:30 `fleet-run -n -c test` on fr2: peers from the registry (fr1 only, prd absent). `fleet-registry status` reports prd unreachable from fr2 (no mesh ssh key for `ubuntu@<prd-mesh-ip>` from fr2; the status view is complete from the PC and from fr1 only if keys exist, to fix in stage 5).
- 08:10 fr1: `fleet-xfs apply` (40 GB image, agcount=12, reflink ok). 08:20 mesh key applied; found and fixed a prd `authorized_keys` without trailing newline (first key line glued to the next; repaired, script now newline-safe).
- 08:35 cluster deploy of lb_ports 19023/19790/19080 (then 19793) to fr2, fr1, prd. On prd `systemctl reload nginx` fails with 226/NAMESPACE (private /tmp of the running nginx removed, first seen 05:10); nginx kept serving, deploy.sh now falls back to `nginx -s reload` (HUP). A `systemctl restart nginx` on prd would fix the unit but is a blip: left for a window.
- 08:45 mig-prd ingress applied, DNS switched gnu (200 x8), mcp-origin (/health returns the relay JSON), ssh-fr2 (ssh from prd through Access returned the fr2 hostname). cloudflared-fr2 disabled on fr2.
- 09:00 desktop.aphrody.app to mig-prd (502 before and after: nothing listens on prd :8793), cloudflared-prod disabled on prd; aphrody.com and mig-test.aphrody.com 200 before and after, `cf tunnels list`: prod down, mig-prd 12 connections. A transient 530 appeared for seconds while the connector stopped, then 502 stable.
- fr1: XFS volume added; prd: listeners and the connector change only, no data or disk change.

Rollback tunnels: DNS rollback lines in cloudflare.toml, then `systemctl enable --now cloudflared-fr2` (fr2) or `cloudflared-prod` (prd). Rollback fr2: `sudo fleet-xfs down --purge` (umount, fstab line removed, image deleted); `rm /etc/fleet/cluster.toml` returns fleet-run to `run.conf` PEERS.

Open: fr2 `/srv/src` carries uncommitted work blocking fast-forward (owner of that work to commit or drop); `cloudflare.toml` lacks the live `open-origin` ingress.

## 4. fr2 and prd to XFS roots: what blocks it

`infra/fleet/reinstall/` (00-preflight to 60-hot-tier, `20-arch-install.sh` guarded by `CONFIRM=REINSTALL-<host>`) already installs a single XFS root; neither root can be converted in place (ext4 and btrfs have no in-place path to XFS, `FILESYSTEMS.md`).

- fr2 (OVH Public Cloud instance, one 100 GB disk): the rescue step is an OpenStack or OVH API call (`docs/infra/REINSTALL-PLAN.md` line 91, `openstack server rescue`) and needs the owner's OVH Public Cloud credentials, which are not in the repo. The Manager-level `/etc/aphrody/ovh.env` on fr1 was not read or tried.
- fr2 holds services other hosts now depend on: Valkey (the sccache and registry backend), `dbfr.aphrody.com` and `nie.aphrody.app` (A record to fr2, `cloudflare.toml`), the relay origin behind `mcp-origin` (reached through mig-prd but running on fr2), the gnu mirror. Valkey and the relay must be moved or restored from backup before the disk is wiped; there is no second disk to stage a backup on, so the backup goes to fr1 or R2 first.
- The reinstall script has not been rehearsed on a throwaway instance; the plan marks the Arch cloud image on OVH as unverified.
- prd (Hostinger, btrfs root 222 GB used): the API `recreate` is irreversible and deletes snapshots; it waits for the owner's downtime window together with the nginx restart and the auto-web port publish.
