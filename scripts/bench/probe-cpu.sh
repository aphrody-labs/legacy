#!/bin/sh
# CPU feature level + bolt/hakari/pgo install feasibility.
hostname
rg -m1 'model name' /proc/cpuinfo
for f in avx2 bmi1 bmi2 fma movbe f16c lzcnt abm avx512f; do printf "%s=" $f; rg -m1 -c -w $f /proc/cpuinfo >/dev/null && echo y || echo n; done
/lib64/ld-linux-x86-64.so.2 --help 2>/dev/null | rg 'x86-64-v'
apt-cache policy bolt-21 bolt-22 llvm-bolt 2>/dev/null | rg -A1 '^bolt|^llvm'
ls /usr/lib/llvm-22/bin 2>/dev/null | rg -i 'bolt|profdata|merge'
export PATH=$HOME/.cargo/bin:$PATH
cargo search cargo-hakari --limit 1 2>&1 | head -2
cargo search cargo-pgo --limit 1 2>&1 | head -2
sysctl vm.swappiness vm.page-cluster vm.dirty_ratio vm.dirty_background_ratio kernel.nmi_watchdog
cat /sys/kernel/mm/transparent_hugepage/enabled /sys/kernel/mm/transparent_hugepage/defrag
for d in /sys/block/*/queue/scheduler; do echo $d $(cat $d); done | head -5
zramctl 2>&1 | head -3
swapon --show
uname -r
