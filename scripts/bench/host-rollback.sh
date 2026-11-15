#!/bin/sh
# fr2: restore the tunables recorded before the benchmark.
B=/srv/bench
. $B/host-orig.env || exit 1
sudo -n sysctl -q -w vm.swappiness=$SW vm.dirty_bytes=$DB vm.dirty_background_bytes=$DBB
echo $SCHED | sudo -n tee /sys/block/sda/queue/scheduler >/dev/null
echo $THP | sudo -n tee /sys/kernel/mm/transparent_hugepage/defrag >/dev/null
sysctl vm.swappiness vm.dirty_bytes vm.dirty_background_bytes vm.dirty_ratio
cat /sys/block/sda/queue/scheduler /sys/kernel/mm/transparent_hugepage/defrag
