#!/bin/sh
llvm-profdata --version | rg -i 'version'
ls -d /usr/lib/llvm-*/bin/llvm-profdata
llvm-bolt-21 --version | rg -i 'version|LLVM'
~/.rustup/toolchains/chromium-157/bin/rustc --version --verbose | rg 'LLVM|release'
ls ~/.rustup/toolchains/chromium-157/lib/rustlib/x86_64-unknown-linux-gnu/lib | rg -i 'profiler' | head -3
rg -c -w lbr /proc/cpuinfo | head -1
perf record -e cycles:u -j any,u -o /tmp/p.data true 2>&1 | tail -2
