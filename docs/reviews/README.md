# Reviews

Verdicts of the ai-os review tribunal (`packages/ai-os/src/review`): `<voice>-<date>-<slug>.md` per voice (gemini, claude, judge), one row per review in `INDEX.md`, checklists distilled from past verdicts in `CHECKLISTS.md`. The judge's score is final; the gate is `threshold` in `packages/ai-os/config/review.json`.

## Headless run (first route)

```sh
bun packages/ai-os/src/review/cli.ts <paths|diff|A..B|commit> [-- paths] --voice gemini --json
bun packages/ai-os/src/review/cli.ts --bundle <file> --voice gemini --json   # `===== FILE: path =====` bundle
bun packages/ai-os/src/review/cli.ts --files "src/**/*.ts" --model "gemini-4-carbon" --thinking high --no-write
```

- Exit code: 0 score at or above the threshold, 1 below it or frozen, 2 no engine answered.
- Config and flags: the `$comment` of `review.json` lists every key; each has a flag (`--threshold`, `--temperature`, `--seed`, `--prompt`, `--include`, `--exclude`, `--lenient`, `--fresh`).
- Output is JSON validated against the schema in `src/review/schema.ts` (`score`, `verdict`, `findings[{file, line, severity, title, breaks, fix, source}]`, `to_confirm`, `summary`) and rendered to the verdict markdown; invalid, truncated or partial answers are never a passed gate. Sampling is fixed by config (temperature 0, seed), so the same input gives the same cache key (`var/review/cache.sqlite`).

## Engines and health

Order for the gemini voice: Vertex service account (`google-vertex/*`, token from `packages/env-kit/src/google-auth.ts`), Gemini API key (`google/*`), `agy`, then the `fallback` families. Each failure is classified (`orch/classify.ts`): billing off or quota exhausted is `quota`, API disabled or key blocked is `missing`, denied credentials are `auth`. An account-level failure puts the whole provider on cooldown; skipped engines appear in the JSON (`voices[].skipped`, `voices[].attempts`). `--fresh` ignores cooldowns after an owner action.

Unlocking a live Vertex run (owner): enable billing on the project of the service account, or provide a Gemini API key whose project has the Generative Language API enabled.

## Manual fallback (last)

Only when no engine answers: gemini.google.com through claude-in-chrome, route in `CLAUDE.md`. Archive the verdict in this folder like any other.
