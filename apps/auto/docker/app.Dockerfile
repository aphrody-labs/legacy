# Production images of auto, all on Alpine (container policy: never Debian or Ubuntu).
# Context: repository root; the Rust suite is vendored in vendor/suite.
#
#   docker build --target precompiled -t auto-app:<version> .   API and worker, native part already built (native/)
#   docker build --target web         -t auto-web:<version> .   front end, without Chromium, OCR or native part
#   docker build --target sauvegarde  -t auto-sauvegarde:<version> .   encrypted pg_dump (host cron)
#   docker build --target application -t auto-app:<version> .  reference: native part built here (Alpine rust)
#
# The native part delivered comes from `ay build -t linux-musl --release --dylib -- -p auto-ffi`, copied into native/.

ARG BUN_IMAGE=oven/bun:1.4.4-alpine

FROM rust:1.99-alpine AS natif
# hadolint ignore=DL3018
RUN apk add --no-cache musl-dev
WORKDIR /w
COPY Cargo.toml Cargo.lock rustfmt.toml ./
COPY crates crates
COPY vendor/suite vendor/suite
# cdylib on musl: without -crt-static, cargo drops the cdylib type (AY_FIELD_TEST.md).
ENV RUSTFLAGS="-C target-feature=-crt-static"
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/w/target,sharing=locked \
    cargo build --release --locked -p auto-ffi \
    && install -D target/release/libauto_ffi.so /out/libauto_ffi.so

# Runtime: official Bun Alpine image (musl). Bun.Video belongs to the fork and is absent here: the video nodes
# fail with a clear message, the rest (Bun.Image, Bun.WebView, Bun.SQL, Bun.S3Client) is present.
FROM ${BUN_IMAGE} AS runtime
# hadolint ignore=DL3018
RUN apk add --no-cache ca-certificates libgcc libstdc++ tzdata \
    && adduser -S -D -H -u 10001 -h /home/auto auto \
    && bun --version

# Front end without Chromium, OCR or Rust library.
FROM runtime AS web
WORKDIR /app
COPY package.json bun.lock bunfig.toml tsconfig.json ./
COPY apps apps
COPY packages packages
RUN bun install --frozen-lockfile --production && mkdir -p /home/auto && chown auto /home/auto
ENV HOME=/home/auto NODE_ENV=production PORT=3001
USER 10001
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s CMD ["bun", "-e", "fetch('http://127.0.0.1:'+(Bun.env.PORT??3001)+'/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["bun", "apps/web/src/index.ts"]

FROM runtime AS application-sources
# Chromium for the "Open in a browser" node (Bun.WebView, chrome backend); without the Chrome sandbox in the
# container (no user namespaces), isolation is that of the container.
# OCR of French scans and text-layer extraction of the received PDFs.
# hadolint ignore=DL3018
RUN apk add --no-cache chromium font-dejavu poppler-utils tesseract-ocr tesseract-ocr-data-fra
ENV AUTO_CHROME_ARGS="--no-sandbox --disable-dev-shm-usage"
WORKDIR /app
COPY package.json bun.lock bunfig.toml tsconfig.json ./
COPY apps apps
COPY packages packages
RUN bun install --frozen-lockfile --production
# Writable home folder (Chromium profile, caches): /app stays read-only for `auto`.
RUN mkdir -p /home/auto && chown auto /home/auto
ENV HOME=/home/auto
USER 10001
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s CMD ["bun", "-e", "fetch('http://127.0.0.1:'+(Bun.env.PORT??3000)+'/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["bun", "apps/api/src/index.ts"]

# Delivery: Linux musl library already qualified, without recompiling Rust on the server.
FROM application-sources AS precompiled
COPY native/libauto_ffi.so dist/native/linux-x64/libauto_ffi.so

# Reference build, from the pinned Rust sources.
FROM application-sources AS application
COPY --from=natif /out/libauto_ffi.so dist/native/linux-x64/libauto_ffi.so

# Nightly backup: local pg_dump 18 (AUTO_PG_LOCAL=1) then AES-256-GCM encryption with the master key.
FROM runtime AS sauvegarde
# hadolint ignore=DL3018
RUN apk add --no-cache postgresql18-client
WORKDIR /app
COPY scripts/sauvegarde.ts scripts/restauration.ts scripts/
COPY packages/tenancy/src/chiffrement.ts packages/tenancy/src/
ENV AUTO_PG_LOCAL=1 AUTO_SAUVEGARDES=/sauvegardes
USER 10001
CMD ["bun", "scripts/sauvegarde.ts"]
