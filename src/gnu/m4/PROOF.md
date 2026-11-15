# Preuve : m4 1.4.21

Généré par `just gnu-check m4` le 2026-11-15T00:21:12Z. Build : fr1 (<fr1-hostname>), tests : fr2 (<fr2-hostname>), bac à sable : bwrap --unshare-net + systemd-run scope (MemoryMax=10G TasksMax=4096). Source GNU : ftp.gnu.org/gnu/m4/m4-1.4.21.tar.*, sha256 f25c6ab51548a73a75558742fb031e0625d6485fe5f9155949d6486a2408ab66 (GSRC, docs/research/gsrc-gnu-2026-11-14.json). Crate : `aphrody-gnu-m4` (src/gnu/m4).

| Mesure | GNU 1.4.21 | Aphrody |
| --- | --- | --- |
| checks/ de m4 : réussis / exécutés | 233 / 233 | 131 / 233 |
| checks ignorés | 9 / 242 | 9 / 242 |
| binaire (octets, release) | 310072 | 2008472 |

Quadruplet (docs/native/gnu/OS.md règle 8) :

| Mesure | Valeur | Exigence |
| --- | --- | --- |
| pass_rate | 56.2 % | ≥ 100 % |
| max_skip_delta | +0.0 % | ≤ +1 % |
| error_count | 102 | 0 |
| critical_smoke | non mesuré | 100 % sur de vrais scripts configure |

Performance (hyperfine, 15 mesures, fr2 ; GNU C en -O3 -march=x86-64-v3, Rust en -O3 x86-64-v3 ThinLTO, modèle CachyOS) : m4: 3000-deep recursion and eval: gnu 12.48 ms, ours 41.84 ms.

Verdict : non remplacé : pass_rate 56.2 % (seuil 100 %), max_skip_delta +0.0 % (≤ +1 %), error_count 102 (0 requis).
