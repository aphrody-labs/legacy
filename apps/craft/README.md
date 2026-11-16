# craft

<!-- catalog:begin unit -->
| Type | Path |
| :-- | :-- |
| App | `apps/craft` |

Part of Aphrody: [aphrody-labs/aphrody](../../README.md), [Catalog](../../docs/reference/catalog/app.md).
<!-- catalog:end -->

Entry point of the Craft Apps (photocraft, pdfcraft, filmcraft, wordcraft, lightcraft, vectorcraft, effectcraft, cadcraft, gridcraft, designcraft, figcraft, deckcraft, soundcraft, anicraft, texturecraft, materialcraft, craft-anything and the launcher).

- Framework: `craft-libs` (the shared crates every app builds on), `craft-i18n`, `craft-fonts`, `craft-extensions`, `craft-ai-integrations` and `src/craft` (the format layer of this repository). Each is a pin in `src.lock.json` (`third_party/<name>`, aphrody-labs fork of `storytold/<name>`); nothing is copied.
- Apps: one entry per app in `apps.toml`; the sources are the pins of the same name.
- ArtCraft Studio and its services: pins `artcraft`, `artcraft-services`, `artcraftx`.

```sh
bun apps/craft/cli.ts list
bun apps/craft/cli.ts build photocraft     # fetch the pin, cargo build --release
bun apps/craft/cli.ts run photocraft
bun apps/craft/cli.ts shot photocraft      # Xvfb + llvmpipe capture of the real render
```

Builds run on the build host (`CRAFT_HOME`, `CRAFT_TARGET`, `CRAFT_OUT`; `CRAFT_FAST=1` turns LTO off).
