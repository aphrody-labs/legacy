# Aphrody, système GNU (cible, 2026-11-14)

Ordre du propriétaire (2026-11-14) : refactoriser Aphrody en système d'exploitation GNU. Définition retenue, d'après gnu.org (`gnu/linux-and-gnu.html`, `gnu/gnu.html`) : GNU est le système entier, noyau excepté. Aphrody fournit le noyau (`src/kernel`, rôle de Linux ou de Hurd) ainsi que chaque paquet GNU, réécrit ou repris en Rust ou en C sur l'ABI `src/include/ay/sys.h`.

Revue Gemini (Carbon High, 10,5/20, archive `docs/reviews/gemini-2026-11-14-gnu-os.md`) : les corrections D1 à D9 sont acceptées et inscrites ci-dessous. Réserve : fr2 n'héberge pas de production, c'est le VPS de tests, benchmarks et recherche depuis le 2026-11-14 ; D7 reste appliquée pour protéger les secrets R2.

Sources de vérité, toutes sous `docs/research/` :

- Liste et versions : GSRC, bzr `gsrc/trunk` (434 paquets `pkg/gnu`, revno dans le champ `source`), extrait par `scripts/gsrc-gnu.ts` dans `docs/research/gsrc-gnu.json` (arbre obtenu par `uvx --from breezy brz export`).
- Recettes, entrées et phases `check` : Guix `gnu/packages/*.scm` (lus dans le dépôt guix à la demande, plus d extrait figé) ; amorçage dans `commencement.scm` (hex0 -> mes -> tcc -> gcc), référence seulement.
- Recettes de référence côté distribution : CachyOS (`docs/research/cachyos-2026-11-15.md`, PKGBUILDS clonés sur fr1 dans `/srv/research/cachyos/CachyOS-PKGBUILDS`) : drapeaux, patches et `check()` de chaque paquet GNU se lisent à côté de Guix et de GSRC.
- Descriptions : `manual/blurbs.html` (`gnu-blurbs-2026-11-14.json`).
- Inventaire et verdicts : `docs/native/gnu/gnu-packages.json` (472 entrées après `tools/gnu-index/merge.ts`). Adoption : PLAN.md.
- Registre canonique : `src/gnu/packages.toml`, généré par `scripts/gnu-packages.ts` (D3).

## Correspondance système GNU -> Aphrody

| Composant du système GNU | Aphrody | État |
| --- | --- | --- |
| noyau (Linux, Hurd) | Linux amont de référence (stable 7.3, LTS, GKI Android, ChromeOS ; `ay gnu kernel`) ; couche propre `src/kernel`, `src/arch`, `src/drivers` (C, style Linux) | suivi, existant |
| GNU libc | `src/posix` (personnalité POSIX/Linux) ; glibc de la distro sous Linux | existant, partiel |
| chaîne d'outils (gcc, binutils, gdb) | LLVM partagé avec Chromium (PLAN.md n°3, n°10) | décidé |
| paquets GNU (coreutils, findutils, diffutils, sed, grep, tar, gzip, bc, ed, m4, which, time, make...) | `src/gnu/<id GSRC>`, une unité par paquet ; `src/gnu/{which,time,bc,ed,m4}` écrits, forks uutils pinnés (PLAN.md) | en cours |
| shell (bash) | niubash puis brush (PLAN.md n°2) | en cours |
| init et services (shepherd) | systemd sur la flotte ; `ay` côté machine | hors périmètre (PLAN.md) |
| gestion de paquets et de système (Guix) | `ay up` (`tools.toml`), `ay machine`, images `infra/os` | existant |
| manuels Texinfo et info | Texinfo conservé (`.texi`, `info`) ; les `.md` de `docs/native/gnu/<id>.md` le complètent sans le remplacer ; `--help` et `--version` au format GNU (D8) | à faire |

## Règles

1. **Un paquet = `src/gnu/<id>`**, où `<id>` est le répertoire GSRC (`coreutils`, `gcc16`). Sa table de `src/gnu/packages.toml` porte : `version`, `sha256`, `deps` (GSRC), `status` (`rust`, `c`, `fork`, `upstream`), `status_gnu`, `tier`, `license`, `provenance`, les pins (`upstream`, `fork`, `rev`) et le lien `proof`.
2. **Forks (D5).** Pour un amont Rust repris en fork (uutils coreutils, findutils, diffutils, sed, grep, tar, awk), `src/gnu/<id>` ne contient que `package.toml`, l'adaptateur, les patches et `PROOF.md`, sans copie de source. Le fork `aphrody-labs` est épinglé par rev dans `third_party/` (ARCHITECTURE.md §9.2, `[patch]` ou rev git). Les copies aplaties (`*-flat`) quittent `src/`.
3. **Deux cibles (D1).** `x86_64-unknown-linux-gnu` prouve le comportement. Une cible ultérieure `x86_64-aphrody-sys` force rustix `use_libc` au-dessus de `src/posix` puis de `sys.h`. Un binaire ne mêle jamais `src/posix` et la glibc.
4. **Toolchain C (D2).** Les builds de production utilisent clang avec un profil de drapeaux C hérité (`-std=gnu17`, extensions GNU tolérées). Un repli GCC n'est permis que pour les paquets que clang refuse (fonctions imbriquées) ; la liste est mesurée et tenue dans `packages.toml` (`cc = "gcc"`). `commencement.scm` reste une référence, pas un objectif.
5. **Registre et paliers (D3).** `packages.toml` réconcilie GSRC (434), le flux `packages/gnu` (569) et gnu.org. `status_gnu` : `active`, `decommissioned` ou `non-gnu-gsrc` (id GSRC absent de l'inventaire). `tier` : 0 amorçage (make, bash, coreutils, sed, grep, gawk, tar, gzip, findutils, diffutils, patch, m4, binutils, gcc16, glibc, gmp, mpfr, mpc, bison, texinfo, gettext, libiconv, autoconf, automake, libtool) ; 1 système interactif (ed, bc, which, time, less, readline, ncurses, nano, inetutils, cpio, groff, wget, screen, parted, shell et éditeurs) ; 2 bibliothèques et outils de développement ; 3 le reste (applications, jeux, science, multimédia, bureau). **Seuls les paliers 0 et 1 sont réécrits** ; 2 et 3 restent amont. lzip entre dans l'outillage de base de fr1.
6. **Amorçage (D4).** Un sysroot `stage0-host` figé sur fr1 (make, perl, m4, texinfo, pkg-config, lzip) casse les cycles de GSRC (gettext/libiconv, bison/m4, autoconf/automake/perl). Ordre de build : `deps` de GSRC, tranchés par ce sysroot. Builds sur fr1, tests et benchmarks sur fr2, rien sur le PC.
7. **Workspace (D5).** `src/gnu` devient un espace de travail Cargo dédié (`src/gnu/Cargo.toml`, exclu du workspace racine), avec la crate partagée `src/gnu/rt`. Bun reste hors du build de l'OS (`DEPS.rules`). `bc` livre `bc` et `dc` (arithmétique décimale). `m4` gère l'état gelé (`-F`/`-R`). Un `DEPS.rules` par paquet (couche 2).
8. **Preuve (D6).** `just gnu-check <id>` écrit `src/gnu/<id>/PROOF.md` avec le quadruplet : `pass_rate = PASS / (TOTAL - XFAIL)` ; `max_skip_delta` (part des SKIP de nos binaires moins celle du GNU C, même bac à sable) au plus +1 % ; `error_count = 0` ; `critical_smoke = 100 %` sur de vrais scripts `configure` (m4, sed, ed, make, bash). Seuils : 100 % pour m4, ed et sed, 94,0 % ailleurs (taux de l'amont Rust de référence, coreutils). Un paquet n'est « remplacé » que si les quatre mesures passent ; `critical_smoke` n'est pas encore mesuré, donc aucun verdict « remplacé » n'est définitif.
9. **Isolation (D7).** Chaque `gnu-check` exécute les tests dans un bac à sable : `bwrap --unshare-net --unshare-pid --ro-bind / / --clearenv`, scope `systemd-run` avec `MemoryMax` et `TasksMax`, `/tmp` en tmpfs, locales pré-générées, aucun identifiant R2. La phase réseau (téléchargement du tarball, sha256 GSRC, configure et make) précède le bac à sable. fr2 n'a ni `systemd-nspawn` ni `podman` : `bwrap` fait office d'équivalent rootless. Le service `aphrody-gnu` reste isolé des tests.
10. **GNU Coding Standards (D8).** Chaque binaire : `--help`, `--version`, options longues, codes de sortie. La crate `src/gnu/rt` restaure SIGPIPE à `SIG_DFL`, normalise `--help`/`--version` et fournit des E/S d'octets (bstr) : pas d'hypothèse UTF-8 sur les fichiers, `LC_COLLATE` respecté.
11. **Licence et provenance (D9).** `license` (SPDX ou texte GSRC/inventaire) et `provenance` (`clean-room`, `derived-gnu`, `third-party-fork`, `upstream-tarball`) sont consignés pour la traçabilité, jamais comme critère d'architecture (règle propriétaire : les licences ne décident de rien).
12. **Profil de build (modèle CachyOS).** C : `-O3 -march=x86-64-v3 -pipe -fno-plt`, `LDFLAGS=-Wl,-O1 -Wl,--sort-common -Wl,--as-needed -Wl,-z,relro -Wl,-z,now` (`CachyOS-PKGBUILDS/pacman/makepkg.conf`) ; Rust : `-C target-cpu=x86-64-v3`, `opt-level = 3`, ThinLTO, une unité de codegen. `just gnu-check` construit ainsi (fr1) et mesure chaque port contre le GNU C compilé avec les mêmes drapeaux (`-O3 -march=x86-64-v3`) par `hyperfine` sur fr2 ; le résultat entre dans le `PROOF.md`. Le profil `release` du workspace racine (LTO complet) reste celui qui est livré. Les drapeaux ne s'adoptent que mesurés.

## Étapes

1. Fait : `src/gnu/packages.toml` généré depuis GSRC avec gate de dérive (`just gnu-drift`).
2. Fait : crate multi-outils scindée en `src/gnu/{bc,ed,m4,time,which}` + `src/gnu/posix-re` ; `src/diffutils-flat` à retirer selon la règle 2.
3. À faire (session de layout) : `src/gnu/rt` et les crates `src/gnu/*` dans les `members` du `Cargo.toml` racine, ou `exclude` de `src/gnu` et espace de travail dédié (règle 7).
4. En cours : `just gnu-check <id>` sur fr2 (fait pour which, time, bc, ed, m4) ; PROOF.md des forks uutils mesurés sur fr1.
5. À faire : `dc` dans `src/gnu/bc`, état gelé de `m4`, `critical_smoke`, sysroot `stage0-host`, cible `x86_64-aphrody-sys`.
6. À faire : section « système GNU » dans ARCHITECTURE.md qui renvoie ici.
