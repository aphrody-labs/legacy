# Preuve : time 1.10

Généré par `just gnu-check time` le 2026-11-14T23:36:50Z. Build : fr1 (<fr1-hostname>), tests : fr2 (<fr2-hostname>), bac à sable : bwrap --unshare-net + systemd-run scope (MemoryMax=10G TasksMax=4096). Source GNU : ftp.gnu.org/gnu/time/time-1.10.tar.*, sha256 e8c29fb4ab599d8478e41e8618f50db8aede9c90af27d0d2ef28ae50d5de09c3 (GSRC, docs/research/gsrc-gnu-2026-11-14.json). Crate : `aphrody-gnu-time` (system/gnu/time).

| Mesure | GNU 1.10 | Aphrody |
| --- | --- | --- |
| testsuite GNU (automake) : PASS / (TOTAL - XFAIL) | 10 / 10 | 10 / 10 |
| SKIP | 0 / 10 | 0 / 10 |
| binaire (octets, release) | 31448 | 432152 |

Quadruplet (docs/native/gnu/OS.md règle 8) :

| Mesure | Valeur | Exigence |
| --- | --- | --- |
| pass_rate | 100.0 % | ≥ 94 % |
| max_skip_delta | +0.0 % | ≤ +1 % |
| error_count | 0 | 0 |
| critical_smoke | non mesuré | 100 % sur de vrais scripts configure |

Performance (hyperfine, 15 mesures, fr2 ; GNU C en -O3 -march=x86-64-v3, Rust en -O3 x86-64-v3 ThinLTO, modèle CachyOS) : time true: gnu 9.33 ms, ours 11.56 ms.

Verdict : conforme sur trois mesures (pass_rate 100.0 % ≥ 94 %, max_skip_delta +0.0 % ≤ +1 %, error_count 0) ; critical_smoke non mesuré : pas de verdict définitif.
