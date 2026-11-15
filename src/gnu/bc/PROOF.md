# Preuve : bc 1.08.2

Généré par `just gnu-check bc` le 2026-11-14T23:39:02Z. Build : fr1 (<fr1-hostname>), tests : fr2 (<fr2-hostname>), bac à sable : bwrap --unshare-net + systemd-run scope (MemoryMax=10G TasksMax=4096). Source GNU : ftp.gnu.org/gnu/bc/bc-1.08.2.tar.*, sha256 79e31e022a84b31dd809815063d4b8ea590b409637a52c50ec9f42c2bf332711 (GSRC, docs/research/gsrc-gnu-2026-11-14.json). Crate : `aphrody-gnu-bc` (src/gnu/bc).

| Mesure | GNU 1.08.2 | Aphrody |
| --- | --- | --- |
| différentiel (même stdout et même code de sortie que GNU) | 17 / 17 (référence) | 16 / 17 |
| binaire (octets, release) | 133536 | 552760 |

Quadruplet (docs/native/gnu/OS.md règle 8) :

| Mesure | Valeur | Exigence |
| --- | --- | --- |
| pass_rate | 94.1 % | ≥ 94 % |
| max_skip_delta | +0.0 % | ≤ +1 % |
| error_count | 0 | 0 |
| critical_smoke | non mesuré | 100 % sur de vrais scripts configure |

Écarts : checklib.b

Performance (hyperfine, 15 mesures, fr2 ; GNU C en -O3 -march=x86-64-v3, Rust en -O3 x86-64-v3 ThinLTO, modèle CachyOS) : bc -l: pi at scale 300: gnu 26.20 ms, ours 10.83 ms.

Verdict : conforme sur trois mesures (pass_rate 94.1 % ≥ 94 %, max_skip_delta +0.0 % ≤ +1 %, error_count 0) ; critical_smoke non mesuré : pas de verdict définitif.
