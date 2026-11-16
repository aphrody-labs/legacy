# Browser engines and Chromium trackers (imported by the root justfile).
# Engines: package @aphrody/browser-engines of aphrody-labs/open (clone in apps/open). Trackers: tools/trackers (src tree).

open_browser_engines := root / "apps/open/packages/browser-engines"

# Browser, automation and crawl engines (registry of browser-engines): idempotent install, Windows and Linux
# (usage: just browsers, just browsers chrome@beta; other subcommands: bun apps/open/packages/browser-engines/src/cli.ts engines)
[group('browser')]
browsers *ids:
    test -f "{{open_browser_engines}}/src/cli.ts" || { echo "browser-engines: apps/open/packages/browser-engines not found; clone https://github.com/aphrody-labs/open.git into apps/open" >&2; exit 127; }
    bun run --cwd "{{open_browser_engines}}" src/cli.ts engines install {{ids}}

# Chromium ecosystem trackers ([tracker.*] of third_party/ECOSYSTEM.toml): live channel and V8 versions, issue/CL/news/changelog
# links, code graph, README.chromium (usage: just trackers, just trackers refresh --only=node,electron, just trackers check)
[group('browser')]
trackers *args="all":
    bun tools/trackers/cli.ts {{args}}
