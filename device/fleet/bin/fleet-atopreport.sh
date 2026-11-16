#!/bin/bash
# Per-process accounting window from the atop history (30 s samples, /var/log/atop): CPU seconds, disk MB per command name.
#   fleet-atopreport.sh [HH:MM start] [HH:MM end] [topN=15]     default: last 15 min
# PRC (utime+stime) is per interval, summed per command; PRD is cumulative per pid: delta last-first, summed per command.
b=${1:-$(date -d '15 min ago' +%H:%M)}; e=${2:-$(date +%H:%M)}; n=${3:-15}
f=/var/log/atop/atop_$(date +%Y%m%d)
echo "window $b-$e  file $f"
echo "== CPU seconds (user+sys) by command"
atop -r "$f" -b "$b" -e "$e" -PPRC 2>/dev/null | awk '
  /^PRC [^|]/ && NF>=12 { c=$8; gsub(/[()]/,"",c); hz=$10+0; if(hz<=0) next; t[c]+=($11+$12)/hz }
  END{ for(c in t) printf "%.0f\t%s\n", t[c], c }' | sort -rn | head -n "$n"
echo "== disk MB (read, write) by command"
atop -r "$f" -b "$b" -e "$e" -PPRD 2>/dev/null | awk '
  /^PRD [^|]/ && NF>=15 && $11=="y" { p=$7; c=$8; gsub(/[()]/,"",c); r=$13*512/1048576; w=$15*512/1048576
    if(!(p in fr)){ fr[p]=r; fw[p]=w; nm[p]=c } lr[p]=r; lw[p]=w }
  END{ for(p in lr){ R[nm[p]]+=lr[p]-fr[p]; W[nm[p]]+=lw[p]-fw[p] } for(c in R) if(R[c]+W[c]>1) printf "%.0f\t%.0f\t%s\n", R[c], W[c], c }' | sort -k2,2rn | head -n "$n" | awk 'BEGIN{print "readMB\twriteMB\tcommand"}{print}'
echo "== disk busy (avg % and max) per device"
atop -r "$f" -b "$b" -e "$e" -PDSK 2>/dev/null | awk '/^DSK \|/ { dev=$3; for(i=1;i<=NF;i++) if($i=="busy"){ v=$(i+1); gsub(/%/,"",v); s[dev]+=v; c[dev]++; if(v+0>m[dev]) m[dev]=v+0 } }
  END{ for(d in s) printf "%s avg %.0f%% max %d%%\n", d, s[d]/c[d], m[d] }'
