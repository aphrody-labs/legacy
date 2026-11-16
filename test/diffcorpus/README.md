# diffcorpus

Differential corpus (306 cases in `cases/`, 6 GNU pilot cases in `cases-gnu/`, from unixwin/diffcorpus). Every case is a shell snippet run with `-c` by a GNU bash oracle and by the target shell; stdout, stderr, exit status and timeout are compared after normalisation. Expectations come from the oracle at run time.

```sh
bun test/diffcorpus/runner.ts --shell "target/debug/rubash"          # the engine of system/rubash
bun test/diffcorpus/runner.ts --shell /path/to/symlink-to-ay    # the engine embedded in ay (a symlink named differently from ay: exec -a and the engine respawn reach `ay -c`)
bun test/diffcorpus/runner.ts --target niubash --only trap
```

`--gnu CMD` or `GNU_BASH` selects the oracle (default: `bash` on PATH). Provenance of each case: `manifest.json`, `MANIFEST.md`. Tests: `bun test test/diffcorpus` (set `RUBASH` for the end to end run against the engine).
