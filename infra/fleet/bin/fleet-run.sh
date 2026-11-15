#!/bin/bash
# Least-loaded job dispatcher + cgroup isolation for fleet hosts (docs/infra/FLEET-OFFLOAD.md).
#   fleet-run [-c class] [-H fr1|fr2|auto] [-C dir] [-n] [--] cmd args...
# class   agent (default), test, lint, research -> agents.slice ; bench -> bench.slice ; build -> build.slice (fr1 only)
# Placement: PSI of the candidate hosts (cpu some avg10/avg60, io some avg10, memory some avg10) read live, lowest score wins;
#   the local host keeps the job unless a peer is lower by HYST points (default 12). build never leaves fr1.
#   A peer is skipped when its root has < MINFREE_GB free (default 8) or when -C dir does not exist there.
# Isolation: the job runs in `systemd-run --scope --slice=<slice>` as the calling user: slice weights (CPU/IO) keep nativelink,
#   haproxy, nginx and cloudflared responsive, whatever the job does. Exit status is the job's.
# Config: /etc/fleet/run.conf (PEERS="fr2=ubuntu@<fr2-mesh-ip>"), written from infra/fleet/<host>/offload/run.conf.
set -u
class=agent host=auto dir=$PWD dry=0 local=0
while [ $# -gt 0 ]; do
  case $1 in
    -c) class=$2; shift 2;; -H) host=$2; shift 2;; -C) dir=$2; shift 2;; -n) dry=1; shift;;
    --local) local=1; shift;; --) shift; break;; -*) echo "fleet-run: unknown option $1" >&2; exit 64;; *) break;;
  esac
done
[ $# -gt 0 ] || { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 64; }
role=$(tail -n 1 /etc/aphrody/role 2>/dev/null || echo unknown)
PEERS=""; HYST=${HYST:-12}; MINFREE_GB=${MINFREE_GB:-8}
[ -f /etc/fleet/run.conf ] && . /etc/fleet/run.conf
case $class in
  build) slice=build.slice;; bench) slice=bench.slice;; agent|test|lint|research) slice=agents.slice;;
  *) echo "fleet-run: class must be agent|test|lint|research|bench|build" >&2; exit 64;;
esac
# One registry for the three hosts (infra/fleet/cluster.toml): peers = every other host allowed to run this class
# (prd has no class, so it never receives a job); run.conf PEERS stays the fallback when no registry is installed.
if [ -f /etc/fleet/cluster.toml ] && command -v fleet-registry >/dev/null 2>&1; then
  reg=$(fleet-registry peers "$class" 2>/dev/null | tr '\n' ' ') && [ "${reg// /}" != "" ] && PEERS=$reg
fi

psi() { # psi <spec> -> "score cpu10 cpu60 io10 mem10 freeGB"; spec = local | ssh target
  local cmd='for f in cpu io memory; do awk "/^some/{print \$2,\$3}" /proc/pressure/$f; done; df --output=avail -BG / | tail -n 1'
  if [ "$1" = local ]; then bash -c "$cmd"; else timeout 8 ssh -o BatchMode=yes -o ConnectTimeout=4 "$1" "$cmd" 2>/dev/null; fi |
  awk '{gsub(/[a-z0-9]+=/,"");gsub(/G/,"")} {v[NR]=$0}
       END{ split(v[1],c," "); split(v[2],i," "); split(v[3],m," "); f=v[4]+0;
            if(NR<4){exit 1}
            printf "%.1f %s %s %s %s %d\n", 0.5*c[1]+0.3*c[2]+0.5*i[1]+2*m[1], c[1], c[2], i[1], m[1], f }'
}

run_local() {
  # the scope needs root to join a system slice; the job still runs as the caller (--uid/--gid) with the caller's environment
  # sudo resets the environment: re-inject the caller's exported variables with --setenv
  if [ "$(id -u)" = 0 ]; then pre=(); else pre=(sudo -n); fi
  envs=()
  while IFS= read -r -d '' kv; do
    case ${kv%%=*} in _|PWD|OLDPWD|SHLVL|SUDO_*|MAIL|LOGNAME|USER|XDG_RUNTIME_DIR|DBUS_SESSION_BUS_ADDRESS|INVOCATION_ID|JOURNAL_STREAM) ;; *) envs+=("--setenv=$kv");; esac
  done < <(env -0)
  # cargo serializes every invocation on one global flock (CARGO_HOME/.package-cache; measured 2026-11-15: 3 writers + readers on
  # /home/ubuntu/.cargo, a rotational disk, blocked a bench for over 10 min): jobs get their own SSD CARGO_HOME per class and user
  xb=$(fleet-registry layout xbuild 2>/dev/null) || xb=
  if [ -z "${CARGO_HOME:-}" ] && [ -d "$xb/cache" ]; then
    ch=$xb/cache/cargo-home-$class-$(id -un); [ -d "$ch" ] || "${pre[@]}" install -d -m 0755 -o "$(id -u)" -g "$(id -g)" "$ch" 2>/dev/null || ch=
    [ -n "$ch" ] && envs+=("--setenv=CARGO_HOME=$ch")
  fi
  # pinned target dir on the XFS build volume (same path on every host; stable path = sccache key reuse, reflink clones)
  if [ -z "${CARGO_TARGET_DIR:-}" ] && [ -n "$xb" ] && findmnt -rn -t xfs "$xb" >/dev/null 2>&1; then
    td=$xb/target/$class-$(id -un); [ -d "$td" ] || mkdir -p "$td" 2>/dev/null || td=   # target/ is 1777
    [ -n "$td" ] && envs+=("--setenv=CARGO_TARGET_DIR=$td")
  fi
  # shared sccache backend: Valkey of the single server (endpoint from the registry, password from /etc/aphrody/secrets.env).
  # Own sccache server port so a long-lived local-disk server of another session cannot ignore these variables; entries expire after
  # 7 days (Valkey runs volatile-lru: keys without a TTL would never be evicted). Same CARGO_HOME/CARGO_TARGET_DIR paths on every host
  # are what make the keys equal across hosts (docs/infra/FLEET-OFFLOAD.md section 3).
  if [ -z "${SCCACHE_REDIS_ENDPOINT:-}" ] && [ -r /etc/aphrody/secrets.env ] && command -v sccache >/dev/null 2>&1 && command -v fleet-registry >/dev/null 2>&1; then
    vk=$(fleet-registry endpoint valkey 2>/dev/null); vp=$(awk -F= '$1=="VALKEY_PASSWORD"{print substr($0,index($0,"=")+1)}' /etc/aphrody/secrets.env)
    if [ -n "$vk" ] && [ -n "$vp" ]; then
      envs+=("--setenv=SCCACHE_REDIS_ENDPOINT=redis://$vk" "--setenv=SCCACHE_REDIS_PASSWORD=$vp" "--setenv=SCCACHE_REDIS_EXPIRATION=604800"
             "--setenv=SCCACHE_REDIS_KEY_PREFIX=sccache/" "--setenv=SCCACHE_SERVER_PORT=4237")
      [ -n "${RUSTC_WRAPPER:-}" ] || envs+=("--setenv=RUSTC_WRAPPER=sccache")
    fi
  fi
  exec "${pre[@]}" systemd-run --scope --quiet --collect --slice="$slice" --uid="$(id -u)" --gid="$(id -g)" "${envs[@]}" -- \
    env -C "$dir" "$@"
}
[ "$local" = 1 ] && run_local "$@"

declare -A SC
best=local; read -r s0 c1 c2 i1 m1 f0 < <(psi local) || { s0=0; c1=0; c2=0; i1=0; m1=0; f0=99; }
SC[local]="$s0 cpu10=$c1 cpu60=$c2 io10=$i1 mem10=$m1"
myname=$role
cands=()
if [ "$class" != build ]; then
  for p in $PEERS; do
    name=${p%%=*}; tgt=${p#*=}
    [ "$host" != auto ] && [ "$host" != "$name" ] && continue
    cands+=("$name=$tgt")
  done
fi
[ "$host" != auto ] && [ "$host" != "$myname" ] && best=none
bscore=$s0
[ "$host" != auto ] && [ "$host" != "$myname" ] && bscore=1000
btgt=local
for cnd in "${cands[@]:-}"; do
  [ -n "$cnd" ] || continue
  name=${cnd%%=*}; tgt=${cnd#*=}
  out=$(psi "$tgt") || { SC[$name]="unreachable"; continue; }
  read -r s c1x c2x i1x m1x fx <<<"$out"
  SC[$name]="$s cpu10=$c1x cpu60=$c2x io10=$i1x mem10=$m1x free=${fx}G"
  [ "$fx" -lt "$MINFREE_GB" ] && { SC[$name]+=" (skipped: disk)"; continue; }
  ssh -o BatchMode=yes -o ConnectTimeout=4 "$tgt" "test -d '$dir'" 2>/dev/null || { SC[$name]+=" (skipped: no $dir)"; continue; }
  if [ "$host" != auto ] && [ "$host" = "$name" ]; then btgt=$tgt; best=$name; bscore=-1; continue; fi
  # peer must beat the local score by HYST
  if awk -v a="$s" -v b="$bscore" -v h="$HYST" 'BEGIN{exit !(a+h<b)}'; then btgt=$tgt; best=$name; bscore=$s; fi
done
if [ "$host" != auto ] && [ "$host" != "$myname" ] && [ "$btgt" = local ]; then
  echo "fleet-run: host $host unreachable or unsuitable (${SC[$host]:-unknown})" >&2; exit 69
fi
[ "$best" = local ] && best=$myname
{ echo -n "fleet-run: class=$class -> $best  ["; for k in "${!SC[@]}"; do echo -n " $k: ${SC[$k]};"; done; echo " ]"; } >&2
[ "$dry" = 1 ] && exit 0
if [ "$btgt" = local ]; then run_local "$@"; fi
q=$(printf '%q ' "$@")
exec ssh -o BatchMode=yes "$btgt" "fleet-run --local -c $class -C $(printf '%q' "$dir") -- $q"
