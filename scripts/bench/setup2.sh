if sudo -n true 2>/dev/null; then S=sudo; else S=; fi
$S apt-get install -y -qq lz4 bzip3 zpaq squashfs-tools erofs-utils fuse3 >/tmp/apt.log 2>&1
tail -3 /tmp/apt.log
for t in lz4 bzip3 zpaq mksquashfs mkfs.erofs; do printf "%s=" $t; command -v $t || echo none; done
git -C /srv/src log --oneline -1
git -C /srv/src ls-tree HEAD | head -20
git -C /srv/src status --short | wc -l
ls /tmp/snap/src
ls /srv/src/src | head -5
du -sh /srv/src/third_party /srv/src/packages /srv/src/apps 2>/dev/null
ls /srv/src/target
