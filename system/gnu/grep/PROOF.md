# Preuve : grep 3.12 (uutils/grep)

Mesuré le 2026-11-14 sur fr1 (<fr1-hostname>, Ubuntu 26.10, Rust 1.99.1) : ces passes ont précédé la règle « tests sur fr2 » ; `just gnu-check` couvre les ports first-party, les forks gardent le harnais de leur amont. Amont Rust : uutils/grep, fork `aphrody-labs/grep` à e123c36994124e7690c2d12e784e234f486183dd, build release.

| Mesure | Valeur |
| --- | --- |
| harnais | `util/run-gnu-testsuite.sh` (suite de grep 3.12 via `init.sh`, tests coûteux désactivés) |
| tests de la suite | 128 |
| réussis / exécutés | 75 / 107 (70.1 %) |
| échecs | 32 |
| ignorés | 21 |
| binaire Rust (octets) | 1 897 416 |
| durée | 168 s |
| hôte de build et de test | fr1 |

Échecs : backslash-s-and-repetition-operators, bre, c-locale, dfa-invalid-utf8, encoding-error, equiv-classes, ere, fgrep-infloop, filename-lineno.pl, grep-dev-null-out (timeout), hangul-syllable, help-version, high-bit-range, include-exclude, in-eq-out-infloop, invalid-multibyte-infloop, multibyte-white-space, null-byte, pcre, pcre-abort, pcre-utf8, pcre-wx-backref, posix-bracket, skip-read, spencer1, spencer1-locale, stack-overflow, symlink, utf8-bracket, write-error-msg, yesno, z-anchor-newline.


Verdict (docs/native/gnu/OS.md règle 5) : non remplacé : 70.1 % < 94 % (référence : uutils coreutils).
