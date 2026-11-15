#!/bin/sh
# Local: queue lto, sccache and nextest benches on fr2 after the variant chain ends.
for f in run-variant.sh lto.sh nextest.sh sccache.sh; do
  n=$f; [ $f = run-variant.sh ] && n=run-variant-b.sh
  timeout 60 ssh fr2 "cat > /srv/bench/$n" < C:/aphrody/scripts/bench/$f
done
timeout 30 ssh fr2 'command -v sccache cargo-nextest; ls ~/.cargo/bin | tr "\n" " "'
timeout 60 ssh fr2 'nohup sh -c "while ! rg -q CHAINDONE /srv/bench/chain-fr2.log; do sleep 20; done; export TC=stable; sh /srv/bench/nextest.sh > /srv/bench/nextest.log 2>&1; sh /srv/bench/sccache.sh > /srv/bench/sccache.log 2>&1; sh /srv/bench/lto.sh > /srv/bench/lto.log 2>&1; echo MOREDONE > /srv/bench/more.done" > /dev/null 2>&1 < /dev/null &'
echo queued
