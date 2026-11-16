#!/bin/sh
. "$(git rev-parse --show-toplevel)/system/env-kit/loaders/shell/site.sh"; FR1=$(site_ssh fr1)
# Local: wait up to 9 minutes, then print the fr1 chain status and fr2 host log tail.
sleep 540
timeout 30 ssh "$FR1" sh -s < C:/aphrody/scripts/bench/chains-status.sh
timeout 30 ssh fr2 'tail -c 400 /srv/bench/host.log'
