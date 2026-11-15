# diffcorpus manifest

The per-case provenance lives in `manifest.json` (one entry per case: id, domain, original category, platform applicability and the rule that classified it, source section) and `gnu-tests-manifest.json` (the GNU bash 5.3 test files considered for the pilot partition).

- Main corpus: 306 cases in `cases/` (246 from the audit rounds, 60 from the hunt round), one file per domain (29 domains). Scripts are byte-identical to their sources.
- Pilot partition `cases-gnu/`: 6 cases converted from the GNU bash 5.3 test suite (83 files inventoried; 13 directly convertible, 58 after conversion, 12 excluded because their premise does not hold). Not loaded by default; `--include-gnu` enables it.
- Expectations are never stored: the runner takes them from the GNU bash oracle at run time.
- No id collision and no duplicate script across the sources (checked by whitespace-normalised hash and id set intersection).
