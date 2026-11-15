#!/bin/sh
# Local: wait up to 9 minutes, then print the fr1 chain status and fr2 host log tail.
sleep 540
timeout 30 ssh vps sh -s < C:/src/scripts/bench/chains-status.sh
timeout 30 ssh fr2 'tail -c 400 /srv/bench/host.log'
