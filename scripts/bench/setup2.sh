if sudo -n true 2>/dev/null; then S=sudo; else S=; fi
$S apt-get install -y -qq lz4 bzip3 zpaq squashfs-tools erofs-utils fuse3 >/tmp/apt.log 2>&1
tail -3 /tmp/apt.log
for t in lz4 bzip3 zpaq mksquashfs mkfs.erofs; do printf "%s=" $t; command -v $t || echo none; done
# Checkout root: $REPO_ROOT, else the repository holding this script (the folder name does not matter).
R="${REPO_ROOT:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}"
git -C "$R" log --oneline -1
git -C "$R" ls-tree HEAD | head -20
git -C "$R" status --short | wc -l
ls "/tmp/snap/$(basename "$R")"
ls "$R/src" | head -5
du -sh "$R/third_party" "$R/packages" "$R/apps" 2>/dev/null
ls "$R/target"
