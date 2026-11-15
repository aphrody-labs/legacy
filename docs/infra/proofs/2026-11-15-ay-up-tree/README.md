# ay up tree layout proofs (2026-11-15)

Real calls, not status codes. Built from d88a10d65 (`cargo test -p aphrody-up`: 46 passed on fr1).

- servo 0.8.0 (fr1 and fr2, `servoshell -z -x -o out.png file:///...`): `servo-fr1.png`, `servo-fr2.png` are the rendered pages. fr2 first lacked libgstwebrtc (apt libgstreamer-plugins-bad1.0-0, now in infra/fleet/bootstrap/fr2.sh).
- ollama 0.40.16 (fr1 and fr2 with the ay built from d88a10d65, installed in ~/.local/bin/ay on both; fr2 file `ollama-fr2-response.json`; fr1, `ollama serve` on a private port, model qwen3:0.6b pulled at run time): `ollama-fr1-response.json`, the model answers "The capital of France is Paris." and earlier "51" for 17*3. A first run with ay 0.4.0 failed with `libllama-common.so.0: cannot open shared object file`: ay dropped the tar symlinks; fixed in `src/up/src/archive.rs` and `install.rs` (`place_link`).
- Context7 through the hub of the runner user `agent` (credential from its own credstore, never printed): `context7-agent-fr2.json`, `context7-agent-fr1.json` (library ids and the content of `query-docs` checked for `spawn`).
