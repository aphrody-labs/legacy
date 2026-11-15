# Preuve : ed 1.22.6

Généré par `just gnu-check ed` le 2026-11-15T00:30:23Z. Build : fr1 (<fr1-hostname>), tests : fr2 (<fr2-hostname>), bac à sable : bwrap --unshare-net + systemd-run scope (MemoryMax=10G TasksMax=4096). Source GNU : ftp.gnu.org/gnu/ed/ed-1.22.6.tar.*, sha256 3f33b22135219c39c3c695f7b7171c2567d3e2a17c798c0a90607320cbb268f2 (GSRC, docs/research/gsrc-gnu-2026-11-14.json). Crate : `aphrody-gnu-ed` (src/gnu/ed).

| Mesure | GNU 1.22.6 | Aphrody |
| --- | --- | --- |
| testsuite GNU (check.sh) : scripts réussis / total | 90 / 90 (rc 0) | 12 / 90 (rc 127) |
| assertions en échec de check.sh | 0 | 0 |
| binaire (octets, release) | 75288 | 1931984 |

Quadruplet (docs/native/gnu/OS.md règle 8) :

| Mesure | Valeur | Exigence |
| --- | --- | --- |
| pass_rate | 13.3 % | ≥ 100 % |
| max_skip_delta | +0.0 % | ≤ +1 % |
| error_count | 78 | 0 |
| critical_smoke | non mesuré | 100 % sur de vrais scripts configure |

Dernière ligne de check.sh : Include the (compressed) contents of '/srv/build/gnu-rust/ed-obj-ours/tmp' in the report.

Performance (hyperfine, 15 mesures, fr2 ; GNU C en -O3 -march=x86-64-v3, Rust en -O3 x86-64-v3 ThinLTO, modèle CachyOS) : ed: global substitute on 20000 lines: gnu 175.65 ms, ours 50.51 ms.

Verdict : non remplacé : pass_rate 13.3 % (seuil 100 %), max_skip_delta +0.0 % (≤ +1 %), error_count 78 (0 requis).
