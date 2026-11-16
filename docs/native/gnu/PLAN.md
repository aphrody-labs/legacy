# Plan : remplacement et réécriture des composants GNU (2026-11-12, mis à jour 2026-11-14)

Cohérent avec docs/native/llvm/UNIFIED-TOOLCHAIN.md, docs/native/compat/PLAN.md, docs/native/shell/MATRIX.md et [OS.md](OS.md) (cible : Aphrody comme système GNU, un paquet = `system/gnu/<id>`) :

- une seule toolchain LLVM, celle de Chromium (CLANG_REVISION), et aucun GCC ;
- réécritures Rust préférées ;
- sous Windows, aucun runtime MinGW/MSYS (cible `*-windows-gnullvm` seulement quand l'ABI MinGW est requise).
 Le critère de priorité est l'impact sur notre système de base : Linux prd/fr1/fr2 (Ubuntu 26.10 : `/etc/os-release` des trois hôtes, le poste Windows nt-03 et nos builds. Une étape est adoptée quand sa preuve (`system/gnu/<id>/PROOF.md`, suite GNU amont contre le remplaçant) atteint le taux de l'amont Rust de référence (règle 5 d'OS.md).
- sources de recettes : Guix (dépôt `git.savannah.gnu.org/git/guix.git`, phases `check`, entrées) ; versions et dépendances de build : GSRC (`docs/research/gsrc-gnu.json`) ; Guix reste un paquet « abandonné » à remplacer, cité ici comme référence de recettes seulement.

## Méthode et hôtes

Builds sur fr1 (`vps`, 12 c), tests et benchs sur fr2 (`cdn`, sans limite depuis l'ordre du 2026-11-14), prd inutilisé. Amonts clonés dans `/srv/build/gnu-rust/up` (jamais dans `third_party/`). `bun scripts/gnu-packages.ts --check` (gate de dérive, `just gnu-drift`) lie `system/gnu/packages.toml` à GSRC et à `gnu-packages.json` ; `just gnu-check <id>` rejoue la suite GNU d'un port first-party et écrit son `PROOF.md`.

## Top 10

| #   | Cible GNU                                      | Remplacement                                                                      | Où                                                                                                              | Preuve d'adoption (2026-11-14)                                                                                                                                 | Risque                                                                                           |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | coreutils                                      | uutils coreutils 0.12.0 (main `e05486ec`, 0.13.0-dev)                             | Windows natif (fin de MSYS) et Linux (`uutils-coreutils` en extra Arch, avec liens dans /usr/local/bin d'abord) | suite GNU coreutils 9.12 : 598 réussis sur 637 exécutés (93,9 %), 82 ignorés, 37 échecs, 2 erreurs ; suivi amont 94,0 % ([PROOF](../../../system/gnu/coreutils/PROOF.md)) | les 39 échecs et erreurs (liste dans le PROOF) avant de basculer `base`                          |
| 2   | bash (Windows)                                 | niubash 1.5.0 aujourd'hui, puis brush (fork aphrody-labs)                         | bash.exe de Claude, scripts                                                                                     | shell-matrix 34/34 contre 31/34 ; bloqueurs brush #1359/#1317/#1295                                                                                            | procsub, `cd` des lecteurs Windows                                                               |
| 3   | gcc + binutils                                 | clang/clang-cl + lld + llvm-ar/objcopy/strip (LLVM Chromium)                      | tous nos builds, noyau `LLVM=1`, Wine/Proton (compat/PLAN.md)                                                   | déjà décidé (UNIFIED-TOOLCHAIN)                                                                                                                                | `gcc-libs` reste dans Arch `base` (libgcc_s, libstdc++ des paquets distro) : on ne le retire pas |
| 4   | gnupg + gnutls + nettle/libgcrypt (nos usages) | sequoia sq/sqv ; rustls ou BoringSSL ; RustCrypto ; signatures minisign et b3sum  | vérification d'artefacts, TLS de nos binaires                                                                   | apt Ubuntu utilise déjà sqv                                                                                                                                    | pacman reste sur gpgme (on ne touche pas Arch)                                                   |
| 5   | findutils                                      | uutils findutils 0.11.0 (main `0db0e629`), et fd en interactif                    | Windows natif d'abord                                                                                           | suites find+xargs de findutils : 11 réussis sur 27 exécutés (40,7 %), 16 échecs, 5 ignorés ([PROOF](../../../system/gnu/findutils/PROOF.md))                       | `-exec`/`-printf` sur des chemins Windows ; taux trop bas pour remplacer                         |
| 6   | diffutils                                      | uutils diffutils v0.6.0 (main `705c953d`)                                         | Windows natif, CI                                                                                               | suite GNU diffutils 3.12 : 19 réussis sur 30 exécutés (63,3 %), 11 échecs, 3 ignorés ([PROOF](../../../system/gnu/diffutils/PROOF.md))                           | diff3/sdiff absents                                                                              |
| 7   | make + autotools + libtool + m4                | ninja/gn/cargo + just ; meson/cmake pour les dépendances tierces ; m4 en Rust     | nos dépôts (justfile déjà présent) ; `system/gnu/m4`                                                               | m4 : 56,2 % des checks de m4 1.4.21 ([PROOF](../../../system/gnu/m4/PROOF.md))                                                                                                                         | on garde make pour le noyau et les tiers autotools, sans réécrire                                |
| 8   | sed                                            | uutils sed 0.3.0 (main `70960fcf`)                                                | Windows natif                                                                                                   | suite GNU sed : 23 réussis sur 55 exécutés (41,8 %), 32 échecs, 10 ignorés ([PROOF](../../../system/gnu/sed/PROOF.md))                                            | regex GNU (`\+`, `-E`) ; taux trop bas pour remplacer                                            |
| 9   | tar + gzip + cpio                              | bsdtar/bsdcpio (libarchive) ; zstd pour nos artefacts ; zlib-rs dans nos binaires | Windows (tar.exe natif = bsdtar) et nos archives                                                                | tar : suite GNU 1.35.90 : 8 réussis sur 240 exécutés (3,3 %), 26 ignorés ([PROOF](../../../system/gnu/tar/PROOF.md))                                                                                                                      | options GNU propres (`--transform`)                                                              |
| 10  | gdb                                            | lldb (Linux) ; WinDbg (Windows)                                                   | débogage                                                                                                        | —                                                                                                                                                              | pretty-printers Rust/Chromium                                                                    |

À la suite, par ordre :

- **grep** : ripgrep en interactif ; uutils grep 0.2.0 (main `e123c369`) mesuré à 75 réussis sur 107 exécutés (70,1 %, [PROOF](../../../system/gnu/grep/PROOF.md)) ; GNU grep garde les scripts ;
- **gawk** : on le garde (Arch `base`) ; uutils awk (WIP, sans release, main `1634d71d`) : 104 réussis sur 568 exécutés (18,3 %), pas un remplaçant ;
- **groff/texinfo** : remplacés par mandoc et mdBook dans nos documentations ;
- **wget** : remplacé par curl ;
- **screen** : remplacé par zellij ;
- **grub** : remplacé par systemd-boot + UKI [NV : vérifier la configuration CachyOS de fr1/prd] ;
- **emacs, guix, hurd, shepherd** : abandonnés (Guix : recettes citées comme référence, pas porté).

## Matrice des paquets de base (amonts vérifiés avec `gh api` le 2026-11-14)

État : **fork** = fork `aphrody-labs` synchronisé et épinglé (`system/gnu/packages.toml`), **écrit** = port first-party `system/gnu/<id>`, **à absorber** = amont Rust mûr non encore consommé, **à écrire** = aucun amont viable, **garder** = amont C via la distro.

| Paquet GNU (GSRC)    | Amont Rust vérifié                                                             | État                                   | Remarque                                                                                          |
| -------------------- | ------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| coreutils 9.12       | uutils/coreutils, release 0.12.0 (2026-09-17), main `e05486ec`                 | fork                                   | `aphrody-labs/coreutils` est un fork de microsoft/coreutils ; l'amont de référence est uutils       |
| findutils 4.11.0     | uutils/findutils 0.11.0 (2026-11-02), main `0db0e629`                          | fork (`aphrody-labs/findutils`, synchro) | suite GNU 40,7 %                                                                                 |
| diffutils 3.12       | uutils/diffutils v0.6.0 (2026-10-23), main `705c953d`                          | fork (`aphrody-labs/diffutils`, synchro) | `bre.rs` consommé par `system/diffutils-flat` en attendant la règle 2 d'OS.md (fork épinglé dans `third_party/`) |
| sed 4.10             | uutils/sed 0.3.0 (2026-10-18), main `70960fcf`                                 | fork (`aphrody-labs/sed`, synchro)     | suite GNU 41,8 %                                                                                  |
| grep 3.12            | uutils/grep 0.2.0 (2026-08-27), main `e123c369` ; ripgrep 15.2.0               | fork (`aphrody-labs/grep`)             | suite GNU 70,1 %                                                                                  |
| tar 1.35             | uutils/tar (sans release), main `6482a734`                                     | fork (`aphrody-labs/tar`, créé le 2026-11-14) | pré-alpha ; bsdtar reste le choix                                                          |
| gawk 5.4.1           | uutils/awk (sans release), main `1634d71d`                                     | fork (`aphrody-labs/awk`, créé le 2026-11-14) | 18,3 % : on garde gawk                                                                      |
| bc 1.08.2            | aucun dépôt uutils (404 sur uutils/bc) ; bc_clone_rs (1 étoile)                | écrit (`system/gnu/bc`)                   | `Test/` de bc 1.08.2 : 16 cas sur 17, 94,1 % ; reste `checklib.b` ; `dc` à faire                  |
| ed 1.22.6            | aucun (uutils/red est un clone de sed)                                          | écrit (`system/gnu/ed`)                   | `testsuite/check.sh` d'ed : 13,3 % des 60 scripts ; E/S d'octets (bstr) à faire                    |
| m4 1.4.21            | aucun viable (r4d 17 étoiles, 2024)                                             | écrit (`system/gnu/m4`)                   | `checks/` de m4 : 56,2 % ; débogage `-d`, traces, `-s`, état gelé à faire                         |
| time 1.10            | hyperfine pour la mesure ; aucun clone de GNU time                              | écrit (`system/gnu/time`)                 | suite GNU de time 1.10 : 10 sur 10                                                                |
| which 2.25           | which-rs 8.0.6 (bibliothèque, pas de CLI GNU)                                   | écrit (`system/gnu/which`)                | 31 cas différentiels : 31 sur 31                                                                  |
| gzip 1.15            | pas de uutils/gzip (404) ; zlib-rs v0.6.8, flate2                               | à écrire                               | CLI fine au-dessus de zlib-rs                                                                     |
| make 4.4.1           | google/kati (Rust, master 2026-10-29, sans release : clone de GNU make pour Android) | à absorber (à évaluer)             | ninja/samurai + just restent la voie ; make gardé pour le noyau                                    |
| bash 5.3             | brush (main, 2026-11-14, pas de release GitHub), nushell 0.117.0 (non POSIX)    | en cours (niubash puis brush)          | PLAN n°2                                                                                          |
| readline 8.3         | rustyline, reedline (bibliothèques)                                             | garder (dépendance de bash)            | pas d'ABI                                                                                         |
| less 710             | aucun viable (minus, bat : pagers de bibliothèque/affichage)                    | garder                                 |                                                                                                   |
| patch 2.8.1          | diffy, patch-apply-rs (bibliothèques, 8 étoiles)                                | à écrire                               | `diffutils-flat` fournit déjà l'analyse de diff                                                    |
| wget 1.25.0          | curl / wget2 (C)                                                                | garder curl                            |                                                                                                   |
| gettext 1.0          | gettext-rs (FFI), polib (PO) ; pas de msgfmt Rust                               | garder                                 | ICU/Fluent pour nos applications                                                                  |
| binutils 2.47        | LLVM (lld, llvm-*) ; wild 0.11.0 (éditeur de liens ELF Rust)                    | décidé                                 | PLAN n°3                                                                                          |
| glibc 2.44           | redox-os/relibc (master 2026-11-14, sans release) ; musl 1.2.6                  | étude                                  | glibc hôte gardée sous Linux                                                                      |
| gcc16                | clang (LLVM Chromium)                                                           | décidé                                 |                                                                                                   |
| cpio 2.15            | 3cpio, cpio-rs (bibliothèques) ; bsdcpio                                        | garder bsdcpio                         |                                                                                                   |
| inetutils 2.8        | uutils/hostname (main `4e04a830`, sans release)                                 | à absorber (hostname seul)             | ping via iputils                                                                                  |

Hors GNU mais voisins : uutils/procps, util-linux, bsdutils, acl, shadow (0.6.0, 2026-10-13) existent ; ils ne sont pas des paquets GNU et ne passent pas par `system/gnu`.

## À garder tel quel (upstream, via la distro)

glibc (libc hôte ; musl seulement pour les outils statiques), gcc-libs côté distro, ncurses/readline (dépendances de bash), gmp/mpfr/mpc (dépendances de gcc dans la distro), gettext/libintl, libunistring, libidn2, gdbm, bash sous Linux, gawk, less, patch (tant que `system/gnu/patch` n'existe pas), bison et gperf (build-deps de tiers), gnulib (embarqué).

## Ports écrits par nous

`system/gnu/{which,time,bc,ed,m4}` (Rust, `aphrody-gnu-<id>`, un crate et un `DEPS.rules` par paquet, `system/gnu/posix-re` partagé par ed et m4). Chacun passe la suite GNU amont sur fr2 via `just gnu-check <id>` (bac à sable bwrap, build x86-64-v3 ThinLTO sur fr1, GNU C en -O3 x86-64-v3) ; résultats du 2026-11-15 :

| Port | Suite GNU | pass_rate | Seuil | hyperfine GNU contre Rust |
| --- | --- | --- | --- | --- |
| which | 31 cas différentiels | 100 % | 94 % | 1,58 ms contre 1,94 ms |
| time | suite de time 1.10 | 100 % | 94 % | 9,33 ms contre 11,56 ms |
| bc | `Test/` de bc 1.08.2 | 94,1 % | 94 % | 26,2 ms contre 10,8 ms (pi à l'échelle 300) |
| m4 | `checks/` de m4 1.4.21 | 56,2 % | 100 % | 12,5 ms contre 41,8 ms |
| ed | `check.sh` d'ed 1.22.6 | 13,3 % | 100 % | 175,7 ms contre 50,5 ms |

`critical_smoke` (règle 8 d'OS.md) n'est mesuré pour aucun : aucun verdict « remplacé » n'est définitif. Écarts connus : m4 (options `-d`, `-s`, traces, état gelé), ed (entrées/sorties d'octets : le tampon est en UTF-8 avec perte), bc (`checklib.b`, pas de `dc`).

## Étapes

1. Windows nt-03 : déposer uutils coreutils, findutils, diffutils et sed (cible `x86_64-pc-windows-msvc`, compilés avec cargo-xwin) dans `~/.local/bin`, puis faire tourner la shell-matrix et la testsuite GNU partielle.
2. Linux : installer `uutils-coreutils` en parallèle, rejouer nos scripts (justfile, `ay`), comparer avec la baseline GNU (PROOF de chaque paquet).
3. Signatures : passer les vérifications d'artefacts R2 de gpg à minisign + b3sum, et sqv pour les clés OpenPGP tierces.
4. Builds : achever la purge GCC (compat/PLAN.md, 14 éléments) ; mettre lld par défaut partout.
5. Mettre à jour la revue chaque trimestre : `bun tools/gnu-index/build.ts <raw> docs/native/gnu` régénère gnu-packages.json, PACKAGES.md et la partie générée de DISTROS.md (sources brutes : voir INDEX.md), puis `bun tools/gnu-index/merge.ts` ajoute blurbs officiels, GSRC et répertoires ftp manquants, et `bun scripts/gnu-packages.ts` régénère `system/gnu/packages.toml`.
6. Consommer les forks uutils par `system/gnu/<id>` (règle 2 d'OS.md) : épingler `aphrody-labs/{coreutils,findutils,diffutils,sed,grep,tar,awk}` dans `third_party/` (manifeste tenu par la session third_party) puis une dépendance git rev par crate `system/gnu/<id>`.
