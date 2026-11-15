#!/bin/sh
# Local helper: launch.sh <script-name.sh> -> copy to fr1:/srv/bench and run detached; log in /srv/bench/<name>.log
N=$1
timeout 60 ssh vps "cat > /srv/bench/$N" < C:/src/scripts/bench/$N
timeout 60 ssh vps "nohup sh /srv/bench/$N > /srv/bench/${N%.sh}.log 2>&1 < /dev/null &"
echo launched $N
