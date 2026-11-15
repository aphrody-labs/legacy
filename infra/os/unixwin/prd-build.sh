#!/bin/sh
# Builds niu (niubash + rubash engine) on prd from the aphrody-labs forks, at the src.lock.json commits.
# Windows target: cargo xwin (MSVC CRT and Windows SDK cached in ~/.cache/cargo-xwin, lld-link); Linux target:
# cargo build. Minimum priority (nice -n 19), JOBS tasks (4 by default). Launched by infra/os/unixwin/unixwin.ts build.
# Usage : JOBS=4 sh prd-build.sh <triple> <commit niubash> <commit rubash>
# Output: one line "ARTIFACT <path> <sha256>"; the binary and SHA256SUMS in $UNIXWIN_WORK/out/<triple>/.
set -eu
[ $# -eq 3 ] || { echo "usage: prd-build.sh <triple> <niubash> <rubash>" >&2; exit 2; }
TARGET=$1 NIU=$2 RUB=$3
JOBS=${JOBS:-4}
W=${UNIXWIN_WORK:-$HOME/unixwin}
export PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR="$W/target"
mkdir -p "$W"

# Partial clone, then exactly the requested commit; niubash and rubash side by side: niubash's [patch]
# (rubash = { path = "../rubash" }) takes that rubash.
pin() {
  d="$W/$1"
  [ -d "$d/.git" ] || git clone -q --filter=blob:none --no-checkout "https://github.com/aphrody-labs/$1.git" "$d"
  git -C "$d" fetch -q --filter=blob:none origin "$2" 2>/dev/null || git -C "$d" fetch -q --filter=blob:none origin
  git -C "$d" -c advice.detachedHead=false checkout -q --force "$2"
  [ "$(git -C "$d" rev-parse HEAD)" = "$(git -C "$d" rev-parse "$2^{commit}")" ]
  [ -z "$(git -C "$d" status --porcelain --untracked-files=no)" ]
}
pin rubash "$RUB"
pin niubash "$NIU"

case $TARGET in
  *-windows-msvc) build="xwin build" exe=niu.exe ;;
  *) build="build" exe=niu ;;
esac
cd "$W/niubash"
# shellcheck disable=SC2086
nice -n 19 cargo $build --release --locked -j "$JOBS" --target "$TARGET" --bin niu

out="$W/out/$TARGET"
mkdir -p "$out"
cp "$CARGO_TARGET_DIR/$TARGET/release/$exe" "$out/$exe"
printf 'niubash %s\nrubash %s\n' "$NIU" "$RUB" > "$out/SOURCES"
(cd "$out" && sha256sum "$exe" > SHA256SUMS)
echo "ARTIFACT $out/$exe $(cut -d' ' -f1 "$out/SHA256SUMS")"
