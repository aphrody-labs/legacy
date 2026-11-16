# Internationalization

English is the source language of every file in the repository; user-facing text lives in catalogs and is translated from the source locale. Nothing in this stack lists locales: a locale is supported when its catalog exists, and any CLDR locale is added by dropping `<bcp47>.json` into the locales directory or by `translate --to <bcp47>`.

## Configuration

`frameworks/i18n-ts/i18n.config.json`: `sourceLocale` (default `en`, override with `APHRODY_I18N_SOURCE`) and `format` (message format id; detected from the catalogs when absent).

## Catalogs

One set of flat JSON catalogs, `frameworks/i18n-ts/locales/<locale>.json` (key to message), read by both runtimes:

- TypeScript: `@aphrody/i18n` (`frameworks/i18n-ts`, Bun). `createTranslator(catalogs, locale).t(key, args)`, `negotiate(acceptLanguage, supported, fallback)`, `discoverLocales(dir)`.
- Rust: `frameworks/i18n` (`aphrody-i18n`) embeds the catalogs found at build time (`build.rs`) or reads a directory (`Catalogs::from_dir`). `I18n::new(locale).t_args(key, args)`, `negotiate(header)`.

The media domain (`frameworks/tv/cli`) reads its strings from the same catalogs under the `tv.` prefix (converted from the former Fluent catalogs; `tv-i18n` is gone). Locales that only hold `tv.*` keys so far (ar, de, hi, it, ko, nl, pl, pt, ru, tr, uk) fall back to the source locale for everything else; `ay i18n translate` fills them and `ay i18n check --strict` fails while keys are missing.

A key missing in a locale falls back to its base language, then to the source locale, then to the key itself.

## Message syntax: Unicode MessageFormat 2

Default engine: `messageformat` (MF2, TypeScript) and a Rust evaluator on ICU4X plurals and number formatting. Example:

```
.input {$count :number}
.match $count
0 {{No files}}
one {{{$count} file}}
* {{{$count} files}}
```

Placeholders `{$name}`, selectors `:number` `:integer` `:string`, escapes `\{ \} \\`. The Rust evaluator implements text, placeholders, `.input`, `.local`, `.match` (any number of selectors) and the three functions above, and rejects markup, other functions and function options with an error that names them. The Rust evaluator never inserts bidi isolation marks (terminal output); the TypeScript side isolates placeholders for right-to-left locales only. Locale negotiation: `Intl.Locale` likely subtags in TypeScript, ICU4X `LocaleExpander` in Rust (zh-Hans-CN matches zh-CN, zh-TW falls back to zh).

## Format adapters

`adapter.ts` defines `MessageAdapter`. Implemented: `mf2`. `detectFormat` recognises Fluent (`.ftl`), gettext (`.po`), Flutter ARB (`.arb`), XLIFF, Java properties, ICU MessageFormat 1 and i18next JSON; those ids are rejected with `UnsupportedFormatError` until an adapter is written and tested.

## Commands

```sh
ay i18n check                                  # missing/extra keys, placeholder and syntax parity against the source locale
ay i18n extract <paths...>                     # t("key") call sites; unknown and unused keys
ay i18n translate [--to pt-BR,de] [--model provider/model] [--refresh-stale] [--dry-run]
ay i18n review <locale> [key...]               # mark machine translations as human-reviewed
bun test frameworks/i18n-ts
cargo test -p aphrody-i18n                     # on fr1 or CI
```

`translate` fills the missing keys of every catalog (and creates the `--to` locales) from the source locale through the ai-os model layer: the model is the first discovered provider (local servers first), or `--model`, or `AGENT_MODEL`. The reply must parse as MF2 and use the same variables as the source, otherwise it is retried once and then reported. Machine output is recorded in `locales/_machine/<locale>.json` with the hash of the source text; a key that is in a catalog and not in the sidecar is human-reviewed and is never overwritten. `--refresh-stale` redoes machine keys whose source text changed.

`frameworks/i18n-ts/tests/fixtures/format.json` holds shared cases run by both the Bun and the Rust tests.

## Detection

`bun scripts/hygiene.ts --rule non-english` flags prose (comments, long string literals, docs) that the `eld` detector reports as a language other than the source locale, outside locale catalogs.

## Translated documents

Short versions of `README.md`, `AGENTS.md` and `docs/games/PLAN.md`: `fr/`, `zh-CN/`, `ja/`, `es/`. The English files stay authoritative.
