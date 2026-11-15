# Browser engines and Chromium trackers (imported by the root justfile).
# The package @aphrody/chromium-bun lives in aphrody-labs/open (clone in apps/open): package apps/open/packages/chromium-bun.

open_chromium_bun := root / "apps/open/packages/chromium-bun"

# Browser, automation and crawl engines (engines facade of chromium-bun): idempotent install, Windows and Linux
# (usage: just browsers, just browsers chrome@beta; other subcommands: bun apps/open/packages/chromium-bun/src/cli.ts engines)
[group('browser')]
browsers *ids:
    test -f "{{open_chromium_bun}}/src/cli.ts" || { echo "chromium-bun: apps/open/packages/chromium-bun not found; clone https://github.com/aphrody-labs/open.git into apps/open" >&2; exit 127; }
    SRC_ROOT="{{root}}" CHROMIUM_BUN_TOPOLOGY="{{root}}/infra/deploy.toml" bun run --cwd "{{open_chromium_bun}}" src/cli.ts engines install {{ids}}

# Chromium ecosystem trackers ([tracker.*] of third_party/ECOSYSTEM.toml): live channel and V8 versions, issue/CL/news/changelog
# links, code graph, README.chromium (usage: just trackers, just trackers refresh --only=node,electron, just trackers check)
[group('browser')]
trackers *args="all":
    test -f "{{open_chromium_bun}}/src/cli.ts" || { echo "chromium-bun: apps/open/packages/chromium-bun not found; clone https://github.com/aphrody-labs/open.git into apps/open" >&2; exit 127; }
    SRC_ROOT="{{root}}" CHROMIUM_BUN_TOPOLOGY="{{root}}/infra/deploy.toml" bun run --cwd "{{open_chromium_bun}}" src/cli.ts trackers {{args}}
