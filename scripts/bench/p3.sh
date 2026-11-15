git -C /srv/src ls-tree -r HEAD --name-only | head
for d in /srv/aphrody-src /srv/src; do
echo $d
git -C $d rev-parse --is-inside-work-tree
git -C $d ls-files | wc -l
ls $d | head -30
done
ls /srv/aphrody-src/crates | head -40
git -C /srv/src rev-list --count HEAD
