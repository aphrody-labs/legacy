# Contributing

## Environment

- [Aphrody](https://aphrody.app) runtime (Bun fork): `bun check`, `bun lint` and `bun fmt` are native.
- Dev Postgres: `docker compose up -d postgres` (port 5433), then `bun run migrate`.
- Rust: compiled and tested in the Linux container (`scripts/cargo.sh`, `scripts/cargo.ts`).

## Rules

- Code, comments, commits and documentation in English; user-facing text goes through the catalogs (see `docs/I18N.md`).
- Commits go directly on `main`; the message is in the imperative and describes the result.
- The gates pass before any push: `bun run gates`, and `bun run gates:rust` if Rust changes.
- SQL migrations: a new numbered file in `packages/store/migrations/`, never a change to an applied migration, RLS on every tenant table.
- No secret or real customer data in the repository, the tests or the issues.
