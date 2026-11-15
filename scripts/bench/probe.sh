for t in zstd lz4 brotli xz 7z 7zz bzip3 zpaq mksquashfs mkfs.erofs mkdwarfs hyperfine pigz cargo-binstall; do printf "%s=" $t; command -v $t || echo none; done
zstd --version; nproc; df -h /srv /tmp | tail -2
ls /srv/src | head -50
timeout 60 find /srv /root -maxdepth 4 -type d -name target 2>/dev/null | head
git -C /srv/src count-objects -vH
