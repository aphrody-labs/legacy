# unixwin chain (imported by the root justfile): aphrody-labs forks -> prd build or fork CI -> workstation.

# Fork / upstream unixwin gaps, src.lock.json pins, installed niu
[group('unixwin')]
unixwin-status:
    bun "{{root}}/device/os/unixwin/unixwin.ts" status

# Missing unixwin clones (forks.ts), then pins in src.lock.json
[group('unixwin')]
unixwin-sync:
    bun "{{root}}/system/machine-ts/src/forks.ts" niubash rubash WinuxCmd niu-git ruline oh-my-niu shellbench diffcorpus wpm-source wpm-artifacts winuxcmd-i18n winuxsh-profiles unixwin-github unixwin-apt unixwin.dev wpm-gui
    bun "{{root}}/device/os/unixwin/unixwin.ts" lock

# niu (niubash + rubash at the pins) built on prd: nice -n 19, 4 tasks, cargo xwin for Windows
[group('unixwin')]
unixwin-build triple="x86_64-pc-windows-msvc":
    bun "{{root}}/device/os/unixwin/unixwin.ts" build {{triple}}

# Fork CI artifact (aphrody-labs/niubash, "aphrody build" workflow) at the pinned commit
[group('unixwin')]
unixwin-fetch-ci triple="x86_64-pc-windows-msvc":
    bun "{{root}}/device/os/unixwin/unixwin.ts" fetch-ci {{triple}}

# Installs the verified niu on the workstation (source ci or prd)
[group('unixwin')]
unixwin-install from="ci" triple="x86_64-pc-windows-msvc":
    bun "{{root}}/device/os/unixwin/unixwin.ts" install {{from}} {{triple}}

# Targeted Rust test of rubash on fr1, the factory (aphrody-heavy, -j 4); the full suite runs in the fork CI
[group('unixwin')]
unixwin-test-fr1 filter:
    bun "{{root}}/device/os/unixwin/unixwin.ts" test-fr1 {{filter}}

# End-to-end Bun suite (niubash, rubash, WinuxCmd) against GNU bash and uutils
[group('unixwin')]
unixwin-test:
    bun test "{{root}}/system/machine-ts/matrix/test/unixwin"
