# Preuve : which 2.25

Généré par `just gnu-check which` le 2026-11-14T23:36:03Z. Build : fr1 (<fr1-hostname>), tests : fr2 (<fr2-hostname>), bac à sable : bwrap --unshare-net + systemd-run scope (MemoryMax=10G TasksMax=4096). Source GNU : ftp.gnu.org/gnu/which/which-2.25.tar.*, sha256 1cb83e4f702e60b8211ab5ec4c2afbab1b1dec80209456a7d2faf7584ed225ea (GSRC, docs/research/gsrc-gnu-2026-11-14.json). Crate : `aphrody-gnu-which` (system/gnu/which).

| Mesure | GNU 2.25 | Aphrody |
| --- | --- | --- |
| différentiel (même stdout et même code de sortie que GNU) | 31 / 31 (référence) | 31 / 31 |
| binaire (octets, release) | 40712 | 348344 |

Quadruplet (docs/native/gnu/OS.md règle 8) :

| Mesure | Valeur | Exigence |
| --- | --- | --- |
| pass_rate | 100.0 % | ≥ 94 % |
| max_skip_delta | +0.0 % | ≤ +1 % |
| error_count | 0 | 0 |
| critical_smoke | non mesuré | 100 % sur de vrais scripts configure |

Performance (hyperfine, 15 mesures, fr2 ; GNU C en -O3 -march=x86-64-v3, Rust en -O3 x86-64-v3 ThinLTO, modèle CachyOS) : which sh: gnu 1.58 ms, ours 1.94 ms.

Verdict : conforme sur trois mesures (pass_rate 100.0 % ≥ 94 %, max_skip_delta +0.0 % ≤ +1 %, error_count 0) ; critical_smoke non mesuré : pas de verdict définitif.
