#!/bin/bash
# One sample of per-cgroup CPU/IO/memory counters (cgroup v2) + host PSI, appended as TSV to /var/log/fleet/cgsample.tsv.
# Driven by fleet-cgsample.timer (60 s). Counters are cumulative: analyse deltas with fleet-cgreport.sh.
# Columns: epoch  cgroup  cpu_usec  rbytes  wbytes  cpu_psi_some_total  io_psi_some_total  mem_bytes  nr_procs
set -u
out=${FLEET_CGSAMPLE_OUT:-/var/log/fleet/cgsample.tsv}
root=/sys/fs/cgroup
mkdir -p "$(dirname "$out")"
t=$(date +%s)
{
  for d in "$root/" "$root"/*/ "$root"/*/*/ "$root"/*/*/*/; do
    [ -r "${d}cpu.stat" ] || continue
    cpu=$(awk '$1=="usage_usec"{print $2}' "${d}cpu.stat")
    rb=0; wb=0
    if [ -r "${d}io.stat" ]; then
      read -r rb wb < <(awk '{for(i=2;i<=NF;i++){split($i,a,"=");if(a[1]=="rbytes")r+=a[2];if(a[1]=="wbytes")w+=a[2]}}END{print r+0,w+0}' "${d}io.stat")
    fi
    cp=$(awk '$1=="some"{split($5,a,"=");print a[2]}' "${d}cpu.pressure" 2>/dev/null)
    ip=$(awk '$1=="some"{split($5,a,"=");print a[2]}' "${d}io.pressure" 2>/dev/null)
    mem=0; [ -r "${d}memory.current" ] && read -r mem <"${d}memory.current"
    np=$(wc -l <"${d}cgroup.procs" 2>/dev/null)
    n=${d#"$root"}; n=${n%/}; [ -n "$n" ] || n=/
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$t" "$n" "${cpu:-0}" "$rb" "$wb" "${cp:-0}" "${ip:-0}" "${mem:-0}" "${np:-0}"
  done
} >>"$out"
# keep the log bounded: 3 days at 60 s
[ "$(stat -c %s "$out")" -gt 134217728 ] && tail -n 200000 "$out" >"$out.new" && mv "$out.new" "$out"
exit 0
