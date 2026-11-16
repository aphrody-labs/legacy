# Deployment and rollback

Single source: [`device/deploy.toml`](../../device/deploy.toml) (`[services.*]` placement and blue/green ports, `[hosting.*]` target `cf | vercel | vps`, `[containers]` images). The per-service matrix lives there, not here. Rendering for one target: `bun system/deploy/src/deploy-target.ts <app> <cf|vercel|vps>`. Images: [`build/docker/`](../../build/docker) (Dockerfile, `docker-bake.hcl`, `compose.yaml`, `smoke.sh`) built by `.github/workflows/images.yml`. There is no in-house engine: `ay deploy <sub>` is `just docker-<sub>`.

Hosts and roles: [FLEET.md](FLEET.md). Heavy jobs run only on fr1 (`ssh <fr1> aphrody-heavy <cmd>`).

## Procedure

1. Install the toolchains: `just fleet-bootstrap <role>` (idempotent, versions from `prebuilts/up/tools.toml`).
2. Build images: a push to `main` runs `images.yml` (amd64 and arm64, shared registry cache), or `just docker-build` from the workstation.
3. Test before switching: `just docker-smoke` (healthcheck of each image), then `just docker-up core prd`. The new containers listen on the green ports on 127.0.0.1 while the current services keep the blue ports.
4. Switch: move the nginx or HAProxy upstream of the domain from the blue port to the green one (`device/cluster`), then check `https://<domain>/<health>` with `curl --resolve` and from outside.
5. Roll back: put the upstream back on the blue port, or `SRC_TAG=<previous sha> just docker-up`. Cloudflare Workers: `bunx wrangler rollback` on the rendered config.

## Rules

- No secret in an image, `compose.yaml` or the repository: hosts read `/etc/aphrody/secrets.env` (`env_file`, `required: false`); the workstation uses its credential store.
- Images run as a non-root user with `read_only`, `cap_drop: ALL`, `no-new-privileges`, a healthcheck, a bounded log and a memory limit.
- Rust images: cargo-chef and cargo-zigbuild, static musl binaries, Alpine runtime. Bun images: `bun install --frozen-lockfile` and a bundled server.
- Only pinned upstream images and the community products (shenron, rosegriffon) keep their own base.
- Vercel is a redundant target kept for portability; nothing in production is placed there.
- Pushing to GHCR outside CI needs the `write:packages` scope (`gh auth refresh -s write:packages`); `images.yml` pushes with `GITHUB_TOKEN`.
