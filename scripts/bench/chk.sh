du -sb /tmp/snap/src
find /tmp/snap/src -type f | wc -l
df -h /tmp | tail -1
ls -l /tmp/src.tar /tmp/target.tar
tar -tf /tmp/src.tar | wc -l
