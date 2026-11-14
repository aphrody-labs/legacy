# Preuve : sed 4.10 (uutils/sed)

Mesuré le 2026-11-14 sur fr1 (vps-203bea89, Ubuntu 26.10, Rust 1.99.1) : ces passes ont précédé la règle « tests sur fr2 » ; `just gnu-check` couvre les ports first-party, les forks gardent le harnais de leur amont. Amont Rust : uutils/sed, fork `aphrody-labs/sed` à 70960fcf16f228a2cbb828543656e92f37a06024, build release.

| Mesure | Valeur |
| --- | --- |
| harnais | `util/run-gnu-testsuite.sh` (scripts shell de la suite de sed avec la cale gnulib `init.sh`) |
| tests de la suite | 65 |
| réussis / exécutés | 23 / 55 (41.8 %) |
| échecs | 32 |
| ignorés | 10 |
| binaire Rust (octets) | 3 292 504 |
| durée | 42 s |
| hôte de build et de test | fr1 |

Échecs : 8to7, bsd-wrapper, cmd-0r, cmd-l, colon-with-no-label, comment-n, compile-errors, compile-tests, convert-number, execute-tests, follow-symlinks, follow-symlinks-stdin, help, in-place-hyphen, in-place-suffix-backup, mb-bad-delim, mb-match-slash, mb-y-translate, missing-filename, normalize-text, nulldata, posix-mode-addr, posix-mode-bad-ref, posix-mode-N, posix-mode-s, recursive-escape-c, regex-errors, sandbox, subst-mb-incomplete, subst-replacement, temp-file-cleanup, unbuffered.

Les tests multioctets ignorés dépendent des locales installées sur fr1.

Verdict (docs/native/gnu/OS.md règle 5) : non remplacé : 41.8 % < 94 % (référence : uutils coreutils).
