
## 6. fr1 pool cutover and sharing (2026-11-16)

| Step | Result (read on the host) |
| --- | --- |
| Rescue gate | `RESCUE-COMPLETE` set on the owner order; `docs/project/restore-inventory.json` rows `vps:fr1`: 619, 618 identical to the tree, 1 cache; `/srv/artifacts` copy stopped at about 11 of 16 GB; Craft checkouts are clones of pushed `aphrody-labs/*craft*` repositories |
| First cutover attempt | Rolled back at 10:54 (fstab restored, pool remounted): `/home` stayed busy because agent sessions and builds kept reopening it. Nothing was wiped. |
| Second attempt | Login home of the admin user staged to the root disk (4.4 GB, `authorized_keys` sha256 equal), pool lines removed from fstab, runners disabled, reboot, pool free, then `fleet-pool.sh apply` |
| LVM and XFS | VG `xbuild` over sdb+sdc, one LV `data` 805 GB, `mkfs.xfs -m reflink=1 -d agcount=12`, mounted at the build mount by UUID `noatime,nofail`; `cp --reflink=always` ok |
| Data copy | rsync from the loop volume: 45.1 GB sent of 46.7 GB, exit 0 (the image was then deleted, so no sampling against the source was possible; checks after: rescue listing and the `authorized_keys` sha256 equal on both sides) |
| NativeLink | CAS and worker state bind-mounted from `<xbuild>/cas/{nativelink,worker}`; worker restarted after the bind (it had started before it and wrote to the root disk); `proof.sh`: 25 actions, 23 remote, 7 on fr2, 17 on fr1 |
| NFS | `fleet-nfs.sh server` exports `<xbuild>/shared` to fr2 (rw) and prd (ro) over the mesh; fr2 automount: a 100 MB file written on fr2 has the same sha256 on fr1 (70493563f8a2...) |
| prd mount | Not done: prd has no NFS client (`nfs-utils` absent) and a package install on that host is the risky partial-upgrade case noted in `CLUSTER.md`; left for the owner window with `prd.window.sh` |
| fr1 layout | monorepo `/srv/src` moved to `/srv/aphrody` (+ symlink), `rosegriffon` checkout to `/srv/repos/aphrody-labs/rosegriffon`, 6 unit files repointed, `ay-index-worker` restarted and runs `--root /srv/aphrody`; 3 duplicates (`/srv/ghidra`, two `ay` clones) kept (modified within 7 days); checkouts with dirty work (`/srv/scratch/forks/*`) left in place |

Not recovered by design (owner order, no long copies): the remaining part of `/srv/artifacts/assets`, the GitHub Actions runners (disabled, their directories were on the pool; re-registration needed), the NativeLink CAS content (a cache), `/opt/android-sdk` (reinstalled by `infra/android`).
