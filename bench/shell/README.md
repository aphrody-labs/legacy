# shellbench

Performance suite for Bash-style shells (from unixwin/shellbench): one corpus (779 cases, `cases.json.gz`, the output of the Python generators), one methodology, any shell. A verify run comes first (a fast wrong run is not data), loop cases are autoranged toward 200 ms, then warmup and timed repetitions.

```sh
bun bench/shell/cli.ts list --category arith
bun bench/shell/cli.ts run --shell "target/debug/ay sh" --name ay-sh --reps 5 --category arith
bun bench/shell/cli.ts run --shell /usr/bin/bash --name gnu --verify-only
bun bench/shell/cli.ts gap results/<subject>.json results/<reference>.json
```

Design and methodology: the upstream `DESIGN.md` (kept at the `third_party/shellbench` pin). Tests: `bun test bench/shell`.
