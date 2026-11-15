for d in /srv/upabs/zed /srv/upabs/tauri /srv/ghidra-rust /srv/ghidra /srv/graph-in/gamescope /srv/build/src-images /srv/webos-c2w/src/c2w; do
echo "== $d $(git -C $d ls-files | wc -l) files, git $(du -sm $d/.git | cut -f1)MB, HEAD $(git -C $d log -1 --format=%h)"
ls $d/Cargo.toml 2>/dev/null
done
ls /srv/upabs/tauri/target /srv/upabs/zed/target 2>&1 | head -4
