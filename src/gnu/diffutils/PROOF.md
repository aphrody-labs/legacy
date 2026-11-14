# Preuve : diffutils 3.12 (uutils/diffutils)

Mesuré le 2026-11-14 sur fr1 (vps-203bea89, Ubuntu 26.10, Rust 1.99.1) : ces passes ont précédé la règle « tests sur fr2 » ; `just gnu-check` couvre les ports first-party, les forks gardent le harnais de leur amont. Amont Rust : uutils/diffutils, fork `aphrody-labs/diffutils` à 705c953d9d0388889df21e33e257b2924853198a, build release.

| Mesure | Valeur |
| --- | --- |
| harnais | `tests/run-upstream-testsuite.sh release` (suite de diffutils 3.12, binaire release) |
| tests de la suite | 33 |
| réussis / exécutés | 19 / 30 (63.3 %) |
| échecs | 11 |
| ignorés | 3 |
| binaire Rust (octets) | 2 432 304 (`diffutils`, multicall cmp/diff) |
| durée | 14 s |
| hôte de build et de test | fr1 |

Échecs : empty-file, expand-tabs, ifdef, invalid-re, ignore-case, ignore-matching-lines, ignore-tab-expansion, no-newline-at-eof, side-by-side, side-by-side-seq, strip-trailing-cr.

Ignorés : brief-vs-stat-zero-kernel-lies, diff3, help-version (le harnais saute les commandes absentes : diff3, sdiff).

Verdict (docs/native/gnu/OS.md règle 5) : non remplacé : 63.3 % < 94 % (référence : uutils coreutils).
