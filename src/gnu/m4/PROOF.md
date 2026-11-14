# Preuve : m4 1.4.21

Généré par `just gnu-check m4` le 2026-11-14T22:58:08Z. Build : fr1 (vps-203bea89), tests : fr2 (bunos). Source GNU : ftp.gnu.org/gnu/m4/m4-1.4.21.tar.*, sha256 f25c6ab51548a73a75558742fb031e0625d6485fe5f9155949d6486a2408ab66 (GSRC, docs/research/gsrc-gnu-2026-11-14.json). Crate : `aphrody-gnu-m4` (src/gnu/m4).

| Mesure | GNU 1.4.21 | Aphrody |
| --- | --- | --- |
| testsuite GNU (m4) | rc 1 | rc 1 |
| binaire (octets, release) | 272552 | 1924696 |

GNU :   005.command_li 006.command_li 128.changeword 129.changeword 130.changeword 131.changeword 132.changeword 133.changeword 134.changeword|Failed checks were:|  021.macro_argu:err 024.macro_argu:err 036.arguments:err 054.defn:err 055.defn:err 059.indir:err 060.indir:err 062.builtin:err 063.builtin:err
Aphrody : |Failed checks were:|  001.preprocess:status 001.preprocess:out 001.preprocess:err 002.debugging_:status 002.debugging_:out 002.debugging_:err 003.command_li:status 003.command_li:out 003.command_li:err 005.command_li:status 005.command_li:out 006.command_li:status 006.command_li:out 006.command_li: ; lignes en échec :

Verdict (docs/native/gnu/OS.md règle 5) : non évalué (pas de taux comparable).
