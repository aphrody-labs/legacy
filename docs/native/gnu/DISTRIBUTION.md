# Distribution GNU en temps réel (2026-11-14)

Suite de [OS.md](OS.md) : suivre et distribuer chaque amont GNU, son équivalent Rust et le noyau Linux. Skill : `.agents/skills/gnu/SKILL.md`.

## Chaîne

| Élément | Emplacement |
| --- | --- |
| Tracker | `system/gnu-ts` (bun, zéro dépendance) |
| Service | fr2, `aphrody-gnu.service` (Restart=always, boucle 600 s) + `aphrody-gnu-watch.timer` (15 min) |
| Données | `/srv/gnu` : `feed.json`, `feed.atom`, `events.jsonl`, `state.json`, `site/` |
| Site | https://gnu.aphrody.com (nginx fr2, tunnel Cloudflare `fr2`, CNAME proxifié) |
| Miroir | R2 `aphrody-gnu` : `gnu/<dir>/<fichier>[.sig]`, `kernel/v<N>.x/`, `rust/<repo>/<tag>/` |
| CLI | `ay gnu ...` (route `system/gnu-ts/src/cli.ts`), `just gnu ...` |
| MCP | serveur de hub `gnu` : `gnu__gnu_status`, `_search`, `_package`, `_feed`, `_kernel` |

## Sources interrogées à chaque cycle

- GNU : `ftp.gnu.org/ls-lrRt.txt.gz` (ETag), archive `info-gnu` (mois courant et précédent), têtes git Savannah (HTTP intelligent, 120 dépôts par cycle en rotation), révision bzr GSRC, tête Guix. Inventaire : `docs/research/gsrc-gnu-*.json`, `guix-gnu-*.json`, `docs/native/gnu/gnu-packages.json`.
- Rust : releases GitHub (ETag, jeton `gh` ou `GITHUB_TOKEN` si présent) et crates.io pour les équivalents de `system/gnu-ts/src/rust.ts`.
- Noyau : `kernel.org/releases.json`, `sha256sums.asc`, arbres `git.kernel.org` (torvalds, stable, linux-next), branches gitiles Android GKI et ChromeOS, Rust for Linux (`rust/` par série, docs, `rust-next`), `google/kernel-research`, et la sortie du suivi Android GKI (`scripts/android-kernel-track.ts`, `/srv/research/android/state/<branche>/latest.json` : tête, base, classes de patchs, phase KMI, versions clang et rustc, Binder Rust ; section `kernel.android`, non dupliquée).
- `www.gnu.org/software/recent-releases.html` expire depuis tous les hôtes : non utilisé. Les pages cgit de Savannah expirent aussi.

## Feed

`feed.json` : `entries[]` (un par paquet : amont, GSRC, Guix, annonce, tête Savannah, équivalents Rust avec version et couverture, preuve, clé de miroir) et `kernel`. `feed.atom` : une entrée par paquet, la plus récente en tête. `events.json` : changements détectés (release, rust, announce, kernel).

Signatures : `sqv` avec le `gpg-keyring` GSRC du paquet. Les clés à liaisons SHA-1 sont retentées avec la politique et marquées « legacy policy » ; `invalid` seulement sur incohérence nette ; sans `sqv`, sans trousseau ou avant téléchargement : `unverified`. Noyau : `.tar.sign` vérifié sur le tar décompressé avec `/srv/gnu/kernel-keyring.pgp` (export WKD des clés kernel.org, confiance au premier usage).

## Exploitation

```sh
just gnu-service     # état du service, journal
just gnu-deploy      # pull de /srv/src sur fr2 + device/gnu/install.sh
ay gnu status        # fraîcheur du feed (stale si > 60 min)
```

## Limites connues

- Téléchargements via `ftpmirror.gnu.org` : `ftp.gnu.org` a bloqué fr2 (2026-11-14) après un miroir trop rapide ; seul le listing `ls-lrRt.txt.gz` reste sur `ftp.gnu.org` (copie en cache si le serveur ne répond pas). 8 tarballs par cycle (plafond 400 Mo), rattrapage sur plusieurs heures. Un fichier sans `.sig` ou sans trousseau GSRC reste `missing` ou `unverified`.
- La couverture Rust n'est affichée que si elle est mesurée (coreutils : 94,0 %, PLAN.md) ; `proof` reste `none` tant que `src/gnu/<id>/PROOF.md` n'existe pas.
- `ay gnu` exige un `ay` reconstruit (sinon `just gnu` ou `bun system/gnu-ts/src/cli.ts`).
