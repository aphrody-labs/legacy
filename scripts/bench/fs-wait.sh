while [ ! -f /tmp/fsbench/status ]; do sleep 20; done
tail -n 3 /tmp/fsbench/*.log
