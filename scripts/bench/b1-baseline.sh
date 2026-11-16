#!/bin/sh
TC=${TC:?the rustup toolchain named by rust-toolchain.toml}
# Probe: one clean dev build of depot-cli (time + units) under current fr1 load.
export PATH=$HOME/.cargo/bin:$PATH
S=/srv/bench/run-variant.sh
uptime
/usr/bin/time -v sh $S t16 clean
/usr/bin/time -f "wall=%e user=%U sys=%S maxrss=%MKB" sh $S t16 build 2>&1 | tail -5
/usr/bin/time -f "noop wall=%e" sh $S t16 build 2>&1 | tail -3
ls /srv/bench/t-$TC-t16/debug/deps | wc -l
dua /srv/bench/t-$TC-t16 2>/dev/null | tail -2
