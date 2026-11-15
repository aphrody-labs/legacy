#!/bin/sh
# Local: on fr2, install mold, then after the host bench finishes run scen.sh variants sequentially (stable + RUSTC_BOOTSTRAP).
for f in run-variant.sh scen.sh; do
  timeout 60 ssh fr2 "cat > /srv/bench/$f" < C:/src/scripts/bench/$f
done
timeout 120 ssh fr2 'sudo -n apt-get install -y -q mold >/dev/null 2>&1; command -v mold'
timeout 60 ssh fr2 'nohup sh -c "while ! rg -q ALLDONE /srv/bench/host.log; do sleep 20; done; TC=stable JOBS=6 sh /srv/bench/scen.sh t16 t0 lld mold sgn t4; echo CHAINDONE" > /srv/bench/chain-fr2.log 2>&1 < /dev/null &'
echo launched
