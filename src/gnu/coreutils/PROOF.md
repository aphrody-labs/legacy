# Preuve : coreutils 9.12 (uutils/coreutils)

Mesuré le 2026-11-14 sur fr1 (vps-203bea89, Ubuntu 26.10, Rust 1.99.1) : ces passes ont précédé la règle « tests sur fr2 » ; `just gnu-check` couvre les ports first-party, les forks gardent le harnais de leur amont. Amont Rust : uutils/coreutils, fork `aphrody-labs/coreutils` à e05486ec1a91e5c7c6fb76ef62706cd6c9fb0a25, build release.

| Mesure | Valeur |
| --- | --- |
| harnais | `util/build-gnu.sh` (GNU coreutils 9.12 patché) puis `util/run-gnu-test.sh` |
| tests de la suite | 719 |
| réussis / exécutés | 598 / 637 (93.9 %) |
| échecs / erreurs | 37 / 2 |
| ignorés | 82 |
| binaire Rust (octets) | 13 988 832 (multicall `coreutils`, features `unix`) |
| durée | build GNU + uutils 464 s, tests 345 s |
| hôte de build et de test | fr1 |

Échecs : tests/misc/{invalid-opt,io-errors,read-errors,responsive,traversal-missing,warning-errors,write-errors,close-stdin,printenv,stdbuf,usage_vs_getopt,getopt_vs_usage,usage_vs_refs}, tests/tail/{inotify-rotate-resources,inotify-dir-recreate,pid-pipe,debug,follow-name}, tests/env/{env,env-signal-handler,env0-from,env-S}, tests/{od/od,pr/bounded-memory,pr/pr-tests,wc/wc-total,cksum/cksum-base64,comm/comm,date/date-debug,factor/factor,numfmt/numfmt,pwd/pwd-long,sort/sort-compress-proc,sort/sort-merge,uniq/uniq,dd/fail-ftruncate-fstat,dd/misc,mv/dup-source,mv/mv-special-1} (39, dont 2 erreurs).

Le suivi amont (uutils/coreutils-tracking, 2026-11-12) donne 676/719 (94,0 %) avec 12 ignorés ; ici 82 tests sont ignorés par la suite selon l'environnement de fr1 (raisons dans `tests/test-suite.log`), le taux sur les tests exécutés (93,9 %) est donc le chiffre comparable.

Verdict (docs/native/gnu/OS.md règle 5) : non remplacé : 93.9 % < 94 % (référence : uutils coreutils).
