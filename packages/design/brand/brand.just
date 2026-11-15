# Brand assets (imported by the root justfile).

# Brand assets (packages/design/brand; stages in src/ui/kit/src/brand/web.rs) built on fr1 from a pushed ref: inputs resolved live
# (`ay assets brand-inputs`: latest google/fonts and google/material-design-icons commits, git blob SHA-1 verified, lock
# written), `ay brand build` twice (both manifest sha256 must match), `ay brand check`; then the outputs and the lock are
# copied back here, with the published docs/logo and docs/icons (gen/zukan and gen/themes belong to `ay assets zukan-brand` and stay).
[group('assets')]
brand ref="origin/main":
    timeout 3600 ssh fr1 'set -e; d=/srv/build/brand; [ -d $d/.git ] || git clone -q --filter=blob:none https://github.com/aphrody-labs/src.git $d; cd $d; git fetch -q origin; git reset -q --hard {{ if ref =~ '^[A-Za-z0-9._/-]+$' { ref } else { error("invalid ref") } }}; export PATH=$HOME/.cargo/bin:$HOME/.bun/bin:$HOME/.local/bin:$PATH CARGO_TARGET_DIR=/srv/build/target-brand; bun packages/assets/src/brand-inputs.ts; cargo build -q -p aphrody-ui --bin aphrody-brand --profile iteration; b=/srv/build/target-brand/iteration/aphrody-brand; $b build; cp packages/design/brand/gen/manifest.json.sha256 /tmp/brand-run1.sha256; $b build; cmp /tmp/brand-run1.sha256 packages/design/brand/gen/manifest.json.sha256; $b check'
    cd "{{root}}/packages/design/brand/gen" && rm -rf badges banner env fonts gpu icons img logo model og pet profile symbols video manifest.json manifest.json.sha256
    timeout 600 ssh fr1 'tar -C /srv/build/brand/packages/design/brand -cf - inputs.lock.json gen/badges gen/banner gen/env gen/fonts gen/gpu gen/icons gen/img gen/logo gen/model gen/og gen/pet gen/profile gen/symbols gen/video gen/manifest.json gen/manifest.json.sha256' | tar -C "{{root}}/packages/design/brand" -xf -
    rm -rf "{{root}}/docs/logo" "{{root}}/docs/icons"
    timeout 600 ssh fr1 'tar -C /srv/build/brand -cf - docs/logo docs/icons' | tar -C "{{root}}" -xf -
