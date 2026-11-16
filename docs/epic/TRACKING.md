# Epic/Bevy upstream tracking in src

- Forks: `third_party/forks.txt` is the only list (owners EpicGames, bevyengine and the community repos of RESOURCES.md). EpicGames/UnrealEngine and other Epic forks stay private and are never mirrored.
- Fork sync: `device/fleet/bin/fork-sync.sh` on fr1 every 6 h (`device/fleet/fr1/systemd/fork-sync.timer`, user unit, existing gh login); journal: `journalctl --user -u fork-sync.service` on fr1.
- CI: `.github/workflows/upstream-sync.yml` (every 6 h, `ubuntu-slim`) syncs the public forks with the aphrody-labs GitHub App token, then `bun system/upstream/src/upstream-recon.ts` regenerates `docs/epic/snapshot.json` and commits it on main.
- Unreal Claude Code plugin: installed from the `aphrody` marketplace (fork aphrody-labs/unreal-engine-skills-for-claude-code-plugin).
- Lore code: `frameworks/lore*`.
- History: `git log -- docs/epic`.
