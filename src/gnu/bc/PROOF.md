# Preuve : bc 1.08.2

Généré par `just gnu-check bc` le 2026-11-14T22:58:04Z. Build : fr1 (vps-203bea89), tests : fr2 (bunos). Source GNU : ftp.gnu.org/gnu/bc/bc-1.08.2.tar.*, sha256 79e31e022a84b31dd809815063d4b8ea590b409637a52c50ec9f42c2bf332711 (GSRC, docs/research/gsrc-gnu-2026-11-14.json). Crate : `aphrody-gnu-bc` (src/gnu/bc).

| Mesure | GNU 1.08.2 | Aphrody |
| --- | --- | --- |
| différentiel (même stdout et même code de sortie que GNU) | 17 / 17 (référence) | 0 / 17 |
| binaire (octets, release) |  | 497336 |

Écarts : array.b arrayp.b aryprm.b atan.b checklib.b div.b exp.b fact.b jn.b ln.b mul.b raise.b sine.b sqrt.b sqrt1.b sqrt2.b testfn.b

Verdict (docs/native/gnu/OS.md règle 5) : non remplacé : 0.0 % < 94 % (référence : uutils coreutils).
