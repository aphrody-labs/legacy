id -u
uname -r
df -T / /srv /tmp /srv/bench 2>&1
mount | grep -E ' / | /srv'
nproc; free -g | head -2
mkfs.xfs -V; mkfs.btrfs --version; mkfs.ext4 -V 2>&1 | head -1; fio --version; hyperfine --version; cargo --version; rustc --version
du -sh /srv/src/.git 2>/dev/null
git -C /srv/src ls-files | wc -l
losetup -a
lsblk -d -o NAME,ROTA,SIZE,TYPE 2>&1 | head
