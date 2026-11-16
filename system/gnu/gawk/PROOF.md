# Preuve : gawk 5.4.1 (uutils/awk)

Mesuré le 2026-11-14 sur fr1 (<fr1-hostname>, Ubuntu 26.10, Rust 1.99.1) : ces passes ont précédé la règle « tests sur fr2 » ; `just gnu-check` couvre les ports first-party, les forks gardent le harnais de leur amont. Amont Rust : uutils/awk, fork `aphrody-labs/awk` à 1634d71d6fd2e1c30c0927732e48d10f03026da3, build release.

| Mesure | Valeur |
| --- | --- |
| harnais | `util/run-gnu-testsuite.sh` (`make check` de gawk 5.3.2 avec le binaire Rust, correctifs quilt) |
| tests de la suite | 666 |
| réussis / exécutés | 104 / 568 (18.3 %) |
| échecs | 464 |
| ignorés | 98 |
| binaire Rust (octets) | 22 790 352 (tableau comfy-table, symboles inclus) |
| durée | 21 s |
| hôte de build et de test | fr1 |

Projet WIP sans release : on garde gawk.

Verdict (docs/native/gnu/OS.md règle 5) : non remplacé : 18.3 % < 94 % (référence : uutils coreutils).
