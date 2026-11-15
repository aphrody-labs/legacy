# Fast update of the production image, built on the server (scripts/prod.ts, fast path): the `auto-app:base` base
# already contains the runtime and the native library; only the TypeScript sources change.
FROM auto-app:base
USER root
WORKDIR /app
RUN rm -rf apps packages
COPY package.json bun.lock bunfig.toml tsconfig.json ./
COPY apps apps
COPY packages packages
RUN bun install --frozen-lockfile --production
# hadolint ignore=DL3018
RUN apk add --no-cache poppler-utils tesseract-ocr tesseract-ocr-data-fra
# Writable home folder (Chromium profile, caches): /app stays read-only for `auto`.
RUN mkdir -p /home/auto && chown auto /home/auto
ENV HOME=/home/auto
USER 10001
