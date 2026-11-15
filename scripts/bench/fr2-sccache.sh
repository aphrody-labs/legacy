#!/bin/sh
# fr2: install the static musl sccache release (the fr1 binary segfaults on fr2) and cargo-nextest copied earlier.
set -e
D=/tmp/sccache-dl
rm -rf $D; mkdir -p $D
U=$(curl -sL https://api.github.com/repos/mozilla/sccache/releases/latest | rg -o 'https://[^"]*/sccache-v[^"]*x86_64-unknown-linux-musl\.tar\.gz' | head -1)
echo "url=$U"
curl -sL "$U" -o $D/s.tgz
tar -xzf $D/s.tgz -C $D
sudo -n install -m 755 $(ls $D/*/sccache) /usr/local/bin/sccache
sudo -n install -m 755 /tmp/cargo-nextest /usr/local/bin/cargo-nextest || true
sccache --version
cargo-nextest nextest --version | head -1
