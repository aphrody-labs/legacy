rm -rf /srv/bench/repo
mkdir -p /srv/bench
timeout 1500 git clone -q --no-tags --no-checkout https://github.com/aphrody-labs/aphrody.git /srv/bench/repo 2>&1 | tail -3
git -C /srv/bench/repo count-objects -vH | tail -4
git -C /srv/bench/repo log --oneline -1 origin/HEAD
rm -rf /tmp/snap; mkdir -p /tmp/snap/src
git -C /srv/bench/repo archive origin/HEAD | tar -x -C /tmp/snap/src
du -sb /tmp/snap/src
find /tmp/snap/src -type f | wc -l
