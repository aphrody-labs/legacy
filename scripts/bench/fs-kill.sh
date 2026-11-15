sudo -n pkill -f fs-bench.sh
sudo -n pkill -f /mnt/fsb
sleep 3
sudo -n umount /mnt/fsb || sudo -n umount -l /mnt/fsb
sudo -n losetup -D
sudo -n rm -rf /srv/bench-img
losetup -a
mount | grep fsb
export RUSTC_WRAPPER= CARGO_HOME=/tmp/bench-cargo-home CARGO_TARGET_DIR=/tmp/cv/target
cd /tmp/cv/t && cargo check -p tauri --offline -q 2>&1 | tail -8
git status -s | head -3
