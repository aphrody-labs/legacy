uptime
grep -vE 'Range|Benchmark|^ +=|^(naming|data|log|realtime|meta)' /tmp/fsbench/xfs-c2.log | tail -n 12
losetup -a
