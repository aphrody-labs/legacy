#!/bin/sh
# Toolchains, load, repo layout on a node.
export PATH=$HOME/.cargo/bin:$PATH
hostname
nproc
uptime
rustup toolchain list
cd /srv/src || exit 1
ls
git log -1 --format=%h
ls crates 2>&1 | head -3
test -f rust-toolchain.toml && head -8 rust-toolchain.toml
ps -eo pcpu,etime,args --sort=-pcpu | head -6 | cut -c1-150
