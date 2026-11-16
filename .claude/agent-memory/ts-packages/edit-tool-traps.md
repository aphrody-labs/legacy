---
name: edit-tool-traps
description: Windows shell traps when bulk-editing TS: sd multi-line patterns, String.replace dollar patterns, Aphrodi the character
metadata:
  type: feedback
---

`sd` with `\n` or `\s*` spanning lines silently does nothing on this PC: use the Edit tool or `bun -e` with `s.replace(a, () => b)`.

**Why:** a plain string replacement argument interprets `$&`, `` $` `` (a template with `${...}` or regex `$` duplicated a whole file once in tools/steam-index/index.ts).

**How to apply:** bulk sed-like renames of single-line tokens are fine with `sd`; anything multi-line goes through Edit; never sweep "aphrody" blindly in rosegriffon: "Aphrody/Aphrodi" is a game character (wiki components, data/aphrody-dossier.json), only `@aphrody/*`, `APHRODY_*`, `aphrody-nie-*` crate names and aphrody.com hosts are the platform.
