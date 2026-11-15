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

### Storage: XFS per host, no distributed FS

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

Choice: the shared namespace is not a POSIX mount. It is (a) the same local path on every host, `/srv/xbuild/{target,cache,ci,cas,clones}`, on a local XFS volume, and (b) content-addressed sharing over the existing services: NativeLink CAS <fr1-mesh-ip>:50061 for REAPI builds and R2 for artifacts (`infra/fleet/cache.toml`). A pinned `CARGO_TARGET_DIR` under the same path on all hosts is also the precondition for sccache hits (`FLEET-OFFLOAD.md` section 3: the target path is part of the key; 3 hits in 2614 compiles before).

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
| 5 | prd XFS (xfsprogs missing, root btrfs never repartitioned), consumers on the registry (Valkey AUTH, NativeLink worker on fr2) | pending |

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
