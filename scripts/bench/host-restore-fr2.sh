#!/bin/sh
# fr2: restore known original tunables (measured by probe-host.sh before any change) and drop stale env file.
sudo -n sysctl -q -w vm.swappiness=150 vm.dirty_bytes=268435456 vm.dirty_background_bytes=67108864
echo mq-deadline | sudo -n tee /sys/block/sda/queue/scheduler >/dev/null
echo madvise | sudo -n tee /sys/kernel/mm/transparent_hugepage/defrag >/dev/null
rm -f /srv/bench/host-orig.env
sysctl vm.swappiness vm.dirty_bytes vm.dirty_background_bytes vm.dirty_ratio vm.dirty_background_ratio
cat /sys/block/sda/queue/scheduler /sys/kernel/mm/transparent_hugepage/defrag
ls /srv/bench/res
