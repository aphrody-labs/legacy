#!/bin/bash
# fr1 chain: src tar codecs, directory archives, dictionaries, git tuning, then heavy codecs. Logs in /srv/bench/*.log
cd /srv/bench
tar -cf /tmp/src.tar -C /tmp/snap/src .
ls -l /tmp/src.tar > /srv/bench/chain.log
bash dict.sh > dict.log 2>&1
bash archives.sh arch /tmp/snap/src > archives.log 2>&1
bash codecs.sh src /tmp/src.tar 0 > src.log 2>&1
bash gitbench.sh > git.log 2>&1
bash codecs.sh srcheavy /tmp/src.tar 1 > srcheavy.log 2>&1
echo chain-done >> /srv/bench/chain.log
