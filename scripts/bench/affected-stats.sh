#!/bin/sh
# Local: affected-target selection stats over recent commits (no compilation).
R=C:/aphrody
tot=$(bun $R/scripts/checkdeps.ts --root $R --affected HEAD 2>/dev/null | rg -c '^cargo')
echo "ref cargo_affected files_changed (HEAD itself: $tot)"
for n in 1 2 3 5 8 13; do
  c=$(bun $R/scripts/checkdeps.ts --root $R --affected HEAD~$n 2>/dev/null | rg -c '^cargo')
  f=$(git -C $R diff --name-only HEAD~$n HEAD | wc -l)
  echo "HEAD~$n $c $f"
done
all=$(bun $R/scripts/checkdeps.ts --root $R --all 2>/dev/null | rg -c '^cargo')
echo "all-flag cargo: $all"
