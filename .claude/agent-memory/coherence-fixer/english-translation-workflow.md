---
name: english-translation-workflow
description: How the 2026-11-15 "English at the source" pass was run (line-number patch script, regex traps, what to leave) so a later session can continue
metadata:
  type: project
---

Owner order 2026-11-15: every Aphrody project is English at the source; French UI text goes to frameworks/i18n-ts/locales/fr.json (append keys only, another agent migrates i18n to MF2).

Method that worked: `git grep -n -I -E "[éèêàçùâîôûœ]|\b(le|la|les|des|pour|avec|dans|sur|qui|que|du|aux|sans|sous|cette|ses|introuvable|aucun|aucune|jamais|doit|sont|fichier|erreur|requête|inconnu|inconnue|absent|absente|trop)\b" -- <dir>` (accent-only misses unaccented French lines); write `@@ path:LINE` + replacement line pairs to a temp file; apply with a small bun script (full-line replace by number, keeps EOL). Then run the package tests and fix expectations tied to messages.

**Why:** the Edit tool needs a Read per file; line patching is ~5x cheaper at hundreds of lines.
**How to apply:** only replace whole lines you saw in the grep output; for continuation lines you did not see, re-grep before patching.

Left on purpose (data contracts, not translated): ai-os review statuses (conforme, à corriger, gelé, sans moteur), "## Défauts" parser and French verdict CONTRACT/prompts, docs/reviews archive, nhitl ledger.json, French regexes matching French agent output (nhitl scanners), backends.ts selector `aria-label*="Arrêter"`, generated shell env files (edit the generator system/machine-ts/src/shells.ts instead).
Traps: a comment ending line `*/` must be kept when replacing (broke oauth.ts once); `/fichier (.+?) \(/` style test regexes follow message wording; never edit .github/workflows, Cargo.toml, crates/, src/ (rules of the agent).
