cd /srv/src
git rev-parse --show-toplevel --git-dir
git ls-tree HEAD | head
git show --stat --format=%H HEAD | tail -5
git ls-remote origin main 2>&1 | head -2
git remote -v | head -2
git config --get-regexp 'sparse|partial|promisor|filter'
cat .git/info/sparse-checkout 2>/dev/null | head
git ls-tree -r origin/main --name-only | wc -l
df -h /srv/src | tail -1
ls /srv/src/src | head
