# game

<!-- catalog:begin unit -->
| Type | Path |
| :-- | :-- |
| App | `apps/game` |

Part of Aphrody: [aphrody-labs/aphrody](../../README.md), [Catalog](../../docs/reference/catalog/app.md).
<!-- catalog:end -->

Game app: the Bevy game of `frameworks/game` with the Steam and Epic storefront services, as one binary (`aphrody-game`) and one entry point (`cli.ts`).

- Framework: `frameworks/game` (Bevy gameplay and `store`), `frameworks/steam` (Steam data: VDF, appinfo, Proton, depots), `frameworks/gaming` (steamcmd, Proton, Vulkan, DirectX).
- Upstream pins (`src.lock.json`, aphrody-labs forks): `bevy` (main), `bevy_steamworks` over `steamworks-rs`, `eos` (Epic Online Services bindings, needs the EOS SDK, feature `epic`), `legendary` (Epic Games Store CLI).

```sh
bun apps/game/cli.ts play
bun apps/game/cli.ts probe          # headless JSON: Steam client and game-server API, Epic
bun apps/game/cli.ts epic status    # legendary
bun apps/game/cli.ts steam apps     # ay steam
bun apps/game/cli.ts status         # host gaming stack (frameworks/gaming)
```
