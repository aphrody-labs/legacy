#!/bin/bash
# build tar inputs on tmpfs and fetch dwarfs; run after snapshot extracted
mkdir -p /srv/bench/bin
tar -cf /tmp/src.tar -C /tmp/snap/src .
ls -l /tmp/src.tar
T=/srv/build/craft/target
find $T -type f -size +0 -printf '%s %P\n' | awk 'BEGIN{lim=400*1048576} {if (s+$1<=lim){s+=$1; sub(/^[0-9]+ /,""); print}}' > /tmp/tlist.txt
tar -cf /tmp/target.tar -C $T -T /tmp/tlist.txt
ls -l /tmp/target.tar; wc -l < /tmp/tlist.txt
# dwarfs static release
cd /srv/bench/bin
U=$(curl -sL https://api.github.com/repos/mhx/dwarfs/releases/latest | grep -o 'https://[^"]*Linux-x86_64[^"]*' | grep -v -e sha -e minisig | head -3)
echo "$U"
for u in $U; do case "$u" in *universal*) curl -sL -o dwarfs-universal "$u"; chmod +x dwarfs-universal;; *.tar.xz) curl -sL -o d.tar.xz "$u"; tar -xf d.tar.xz --strip-components=1;; esac; done
ls -l /srv/bench/bin
if [ -x dwarfs-universal ]; then ln -sf dwarfs-universal mkdwarfs; ln -sf dwarfs-universal dwarfsextract; fi
ls /srv/bench/bin /srv/bench/bin/bin 2>/dev/null
