# Preuve : findutils 4.11.0 (uutils/findutils)

Mesuré le 2026-11-14 sur fr1 (vps-203bea89, Ubuntu 26.10, Rust 1.99.1) : ces passes ont précédé la règle « tests sur fr2 » ; `just gnu-check` couvre les ports first-party, les forks gardent le harnais de leur amont. Amont Rust : uutils/findutils, fork `aphrody-labs/findutils` à 0db0e6294bc72793e1e7d85982fcbcd860c43d32, build release.

| Mesure | Valeur |
| --- | --- |
| harnais | `util/build-gnu.sh` (GNU findutils git, `make check` + `find/testsuite` + `xargs/testsuite`, résumé par `util/gnu_json_result.py`) |
| tests de la suite | 32 |
| réussis / exécutés | 11 / 27 (40.7 %) |
| échecs | 16 |
| ignorés | 5 |
| binaire Rust (octets) | find 3 917 008 ; xargs 848 920 |
| durée | build GNU + uutils et tests 744 s |
| hôte de build et de test | fr1 |

Échecs : tests/find/{arg-nan,debug-missing-arg,files0-from,ls-format-file,ls-format-symlink,name-slash,newer,operators-wrong-with-dash,opt-numeric-arg,readdir_race,used}, tests/misc/help-version, tests/xargs/{conflicting_opts,test-option-range,test-sigusr,verbose-quote}.

`locate` et `updatedb` ne sont pas dans ces suites.

Verdict (docs/native/gnu/OS.md règle 5) : non remplacé : 40.7 % < 94 % (référence : uutils coreutils).
