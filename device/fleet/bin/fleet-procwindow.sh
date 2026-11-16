#!/bin/bash
# Per-process accounting window: run pidstat (CPU + disk) for N samples and aggregate per command and per uid/class.
#   fleet-procwindow.sh run [interval_s=60] [samples=15] [log=/tmp/pidstat-window.log]   collect (blocking)
#   fleet-procwindow.sh report [log=/tmp/pidstat-window.log] [topN=15]                    aggregate an existing log
# Output: average cores and disk MB read/written per command (basename of argv[0]), over the whole window.
# Classification is done by the reader from the command names (agent CLIs and bench tools vs builds vs services).
cmd=${1:-report}
case $cmd in
  run) iv=${2:-60}; n=${3:-15}; log=${4:-/tmp/pidstat-window.log}
       exec pidstat -h -H -u -d -l "$iv" "$n" > "$log" 2>&1;;
  report) log=${2:-/tmp/pidstat-window.log}; top=${3:-15}
    awk '
      $1 ~ /^[0-9]+$/ && NF>=14 { ts[$1]=1; c=$14; n=split(c,p,"/"); c=p[n]; sub(/ .*/,"",c)
        cpu[c]+=$8; rd[c]+=$10; wr[c]+=$11 }
      END{ ns=0; for(t in ts) ns++; iv=(ENVIRON["IV"]>0)?ENVIRON["IV"]:60
        printf "# samples=%d interval=%ds window=%ds\n", ns, iv, ns*iv > "/dev/stderr"
        for(c in cpu) printf "%.2f\t%.0f\t%.0f\t%s\n", cpu[c]/100/ns, rd[c]*iv/1024, wr[c]*iv/1024, c }' "$log" |
      sort -rn | head -n "$top" | awk 'BEGIN{print "avg_cores\tread_MB\twrite_MB\tcommand"}{print}';;
  *) echo "usage: $0 run [iv] [n] [log] | report [log] [top]" >&2; exit 64;;
esac
