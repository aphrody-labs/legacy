mkdir -p /srv/bench $HOME/.local/bin
if sudo -n true 2>/dev/null; then S=sudo; else S=; fi
$S apt-get install -y -qq lz4 bzip3 zpaq squashfs-tools erofs-utils dwarfs fuse3 >/tmp/apt.log 2>&1
tail -3 /tmp/apt.log
for t in lz4 bzip3 zpaq mksquashfs mkfs.erofs mkdwarfs; do printf "%s=" $t; command -v $t || echo none; done
lz4 --version
mkfs.erofs --version 2>&1 | head -1
mkdwarfs --version 2>&1 | head -1
rm -rf /tmp/snap; mkdir -p /tmp/snap/src
git -C /srv/src archive HEAD | tar -x -C /tmp/snap/src
du -sb /tmp/snap/src
find /tmp/snap/src -type f | wc -l
du -sh /srv/src/target /srv/build/craft/target 2>/dev/null
