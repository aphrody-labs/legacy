#!/bin/sh
# Local: copy sccache and cargo-nextest from fr1 to fr2 /usr/local/bin (same distro and arch), check they run.
for t in sccache cargo-nextest; do
  timeout 120 ssh vps "cat /usr/local/bin/$t" | timeout 120 ssh fr2 "cat > /tmp/$t && sudo -n install -m 755 /tmp/$t /usr/local/bin/$t && rm /tmp/$t"
done
timeout 30 ssh fr2 'sccache --version; cargo-nextest nextest --version | head -1'
