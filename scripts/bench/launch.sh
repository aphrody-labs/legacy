#!/bin/sh
. "$(git rev-parse --show-toplevel)/system/env-kit/loaders/shell/site.sh"; FR1=$(site_ssh fr1)
# Local helper: launch.sh <script-name.sh> -> copy to fr1:/srv/bench and run detached; log in /srv/bench/<name>.log
N=$1
timeout 60 ssh "$FR1" "cat > /srv/bench/$N" < C:/aphrody/scripts/bench/$N
timeout 60 ssh "$FR1" "nohup sh /srv/bench/$N > /srv/bench/${N%.sh}.log 2>&1 < /dev/null &"
echo launched $N
