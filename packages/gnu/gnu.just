# GNU upstream tracker (imported by the root justfile). Doc: docs/native/gnu/DISTRIBUTION.md.

# ay gnu <status|search|package|feed|diff|kernel|sync|site>: GNU upstream, Rust equivalents, Linux kernel
[group('gnu')]
gnu *args:
    bun "{{root}}/packages/gnu/src/cli.ts" {{args}}

# Tracker service on fr2 (aphrody-gnu.service): status, last cycles and feed age
[group('gnu')]
gnu-service:
    ssh cdn "systemctl is-active aphrody-gnu.service aphrody-gnu-watch.timer; journalctl -u aphrody-gnu --no-pager -n 15"

# Pull the checkout on fr2 and restart the tracker
[group('gnu')]
gnu-deploy:
    ssh cdn "git -C /srv/src fetch -q --no-recurse-submodules origin main && git -C /srv/src merge -q --ff-only FETCH_HEAD && sh /srv/src/infra/gnu/install.sh"

# Tests of the tracker package
[group('gnu')]
gnu-test:
    bun test packages/gnu
