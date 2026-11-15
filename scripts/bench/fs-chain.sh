taskset -c 4,5 sh /tmp/fs-bench.sh xfs-tuned btrfs
ONLY=1 SUF=-c2 taskset -c 4,5 sh /tmp/fs-bench.sh ext4 xfs
