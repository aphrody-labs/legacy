# Shared helpers for fr1 compression benchmarks (bash). Source, do not run.
# run SET LABEL THREADS "COMPRESS CMD" "DECOMPRESS CMD"; env IN (file or dir), OUT (file), INBYTES.
# fr1 is shared (load >> cores), so CPU seconds (user+sys) are recorded next to wall seconds; best of 3 runs when the first is < 5 s wall.
export OUT=${OUT:-/tmp/bench.out}
CSV=${CSV:-/srv/bench/results.csv}
[ -s "$CSV" ] || echo "set,label,threads,in_bytes,out_bytes,ratio,c_wall_s,c_cpu_s,c_MBps_cpu,c_rss_MB,d_wall_s,d_cpu_s,d_MBps_cpu,d_rss_MB,load1" > "$CSV"

_t() { # echo "wall rssMB cpu"
  /usr/bin/time -f "%e %M %U %S" -o /tmp/bt.out sh -c "$1" >/dev/null 2>&1
  awk 'END{printf "%s %.0f %.2f", $1, $2/1024, $3+$4}' /tmp/bt.out
}

_best() { # _best CMD PRE -> "min_wall max_rss min_cpu"
  local cmd=$1 pre=$2 i res w r c mw= mr=0 mc=
  for i in 1 2 3; do
    [ -n "$pre" ] && sh -c "$pre" >/dev/null 2>&1
    set -- $(_t "$cmd"); w=$1; r=$2; c=$3
    if [ -z "$mw" ] || awk "BEGIN{exit !($w<$mw)}"; then mw=$w; fi
    if [ -z "$mc" ] || awk "BEGIN{exit !($c<$mc)}"; then mc=$c; fi
    [ "$r" -gt "$mr" ] && mr=$r
    awk "BEGIN{exit !($w>5)}" && break
  done
  echo "$mw $mr $mc"
}

run() {
  local set=$1 label=$2 th=$3 cc=$4 dc=$5 ce de size load
  export IN OUT
  load=$(cut -d' ' -f1 /proc/loadavg)
  ce=$(_best "$cc" "rm -rf $OUT")
  size=$(stat -c %s "$OUT" 2>/dev/null || echo 0)
  if [ "$size" -le 0 ]; then echo "$set,$label,$th,$INBYTES,0,FAIL,,,,,,,,,$load" >> "$CSV"; return; fi
  de=$(_best "$dc" "rm -rf /tmp/xout")
  rm -rf /tmp/xout "$OUT"
  awk -v s="$set" -v l="$label" -v t="$th" -v i="$INBYTES" -v o="$size" -v c="$ce" -v d="$de" -v ld="$load" 'BEGIN{
    split(c,a," "); split(d,b," ");
    printf "%s,%s,%s,%d,%d,%.3f,%.2f,%.2f,%.1f,%d,%.2f,%.2f,%.1f,%d,%s\n", s,l,t,i,o,i/o,a[1],a[3],i/1048576/(a[3]>0?a[3]:0.01),a[2],b[1],b[3],i/1048576/(b[3]>0?b[3]:0.01),b[2],ld}' >> "$CSV"
  tail -1 "$CSV"
}
