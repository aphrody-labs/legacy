#!/bin/sh
hostname
sysctl vm.dirty_bytes vm.dirty_background_bytes vm.dirty_expire_centisecs vm.vfs_cache_pressure
for d in sda vda nvme0n1; do test -e /sys/block/$d && echo $d sched=$(cat /sys/block/$d/queue/scheduler) rot=$(cat /sys/block/$d/queue/rotational) ra=$(cat /sys/block/$d/queue/read_ahead_kb) maxratio=$(cat /sys/block/$d/bdi/max_ratio 2>/dev/null) minratio=$(cat /sys/block/$d/bdi/min_ratio 2>/dev/null) strict=$(cat /sys/block/$d/bdi/strict_limit 2>/dev/null); done
ls /etc/sysctl.d /etc/udev/rules.d 2>&1 | head -30
which llvm-bolt-21 perf2bolt-21 llvm-bolt
ls /usr/lib/llvm-21/bin 2>/dev/null | rg -i bolt
findmnt -no FSTYPE,SOURCE,OPTIONS /
