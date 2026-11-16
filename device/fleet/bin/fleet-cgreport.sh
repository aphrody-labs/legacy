#!/bin/bash
# Report from fleet-cgsample.tsv over a window: per cgroup CPU cores used, IO MB/s read/write, share of host PSI stall.
#   fleet-cgreport.sh [minutes=15] [topN=25]
# CPU = cores (delta usec / delta seconds / 1e6); only leaf-ish cgroups matter, parents include their children.
min=${1:-15}; top=${2:-25}
f=${FLEET_CGSAMPLE_OUT:-/var/log/fleet/cgsample.tsv}
now=$(date +%s)
awk -F'\t' -v from=$((now - min * 60)) -v top="$top" '
$1>=from { if(!($2 in t0)){t0[$2]=$1;c0[$2]=$3;r0[$2]=$4;w0[$2]=$5;p0[$2]=$6;i0[$2]=$7}
  t1[$2]=$1;c1[$2]=$3;r1[$2]=$4;w1[$2]=$5;p1[$2]=$6;i1[$2]=$7;m[$2]=$8;n[$2]=$9 }
END{ for(k in t1){ dt=t1[k]-t0[k]; if(dt<30) continue;
  printf "%.2f\t%.2f\t%.2f\t%.1f\t%.1f\t%d\t%.1f\t%s\n",(c1[k]-c0[k])/dt/1e6,(r1[k]-r0[k])/dt/1048576,(w1[k]-w0[k])/dt/1048576,(p1[k]-p0[k])/dt/1e4,(i1[k]-i0[k])/dt/1e4,n[k],m[k]/1073741824,k } }' "$f" |
  sort -rn | head -n "$top" | awk 'BEGIN{print "cores\tr_MBs\tw_MBs\tcpuPSI%\tioPSI%\tprocs\tmemGB\tcgroup"}{print}'
