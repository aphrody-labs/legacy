# Preuve : tar 1.35 (uutils/tar)

Mesuré le 2026-11-14 sur fr1 (vps-203bea89, Ubuntu 26.10, Rust 1.99.1) : ces passes ont précédé la règle « tests sur fr2 » ; `just gnu-check` couvre les ports first-party, les forks gardent le harnais de leur amont. Amont Rust : uutils/tar, fork `aphrody-labs/tar` à 6482a734dbdd45cd6394cdb720d1f6aed44f6da0, build release.

| Mesure | Valeur |
| --- | --- |
| harnais | `util/build-gnu.sh` (GNU tar git 1.35.90, bootstrap + configure + make) puis `util/run-gnu-test.sh` (autotest de tar avec le binaire Rust) |
| tests de la suite | 266 |
| réussis / exécutés | 8 / 240 (3.3 %) |
| échecs | 232 |
| ignorés | 26 |
| binaire Rust (octets) | 2 188 040 (`tarapp`, enveloppé par `tar`) |
| durée | build GNU + uutils et tests, quelques minutes |
| hôte de build et de test | fr1 |

Échecs : 232 des 240 tests exécutés (liste complète dans `tests/testsuite.log` de fr1).

Pré-alpha : `--one-top-level`, `-C` et la plupart des options GNU ne sont pas reconnues (`unexpected argument`). bsdtar reste le choix.

Verdict (docs/native/gnu/OS.md règle 5) : non remplacé : 3.3 % < 94 % (référence : uutils coreutils).
