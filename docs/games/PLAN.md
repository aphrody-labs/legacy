# Games app

The games app is a [Bevy](https://github.com/bevyengine/bevy) fork integrated with Steam and Epic Games. It is one of the ecosystem apps built on the `ay` core ([roadmap](../native/ROADMAP.md)); it is not the project direction. Unreal Engine stays private and interop only.

## Goal

- A Bevy-based game runtime that ships on desktop and in the browser (WebAssembly and WebGPU), with gamepad, keyboard and mouse input.
- Steam and Epic services behind one API: login, ownership, achievements, downloads, overlay.
- The Craft Apps and the media stack (`src/tv`, FFmpeg) reused for content tools.

## What exists

| Area | Where |
| --- | --- |
| Bevy vertical slice (terrain, controller, day/night, audio) | [`src/game`](../../src/game) |
| Steam client, web API and content CDN tooling | [`src/steam`](../../src/steam) (`ay steam`), [`packages/gaming`](../../packages/gaming) (`ay gaming`) |
| Format layer from the Craft libraries | [`src/craft`](../../src/craft) |
| UI tokens and Bevy layout adapter | [`src/ui/kit`](../../src/ui/kit), feature `bevy` |
| Asset validators | [`test/assets`](../../test/assets) |
| Epic and Bevy upstream tracking | [`docs/epic/TRACKING.md`](../epic/TRACKING.md), `third_party/forks.txt` |

Versions (`bevy`, `egui`, `wgpu`, `winit`) are the pins of the root [`Cargo.toml`](../../Cargo.toml); upstream versions come from `gh api repos/bevyengine/bevy/releases/latest`.

## Not built

- The Bevy fork itself: no `third_party/bevy` checkout exists yet, and the Steam and Epic integration is not wired into a game loop.
- A CI run that measures frame rate in the browser, and a parity list per replaced engine feature.
- Multiplayer.

## Rules

- Rust builds run on fr1 or CI, never on the workstation.
- One `wgpu` and one `winit` in the workspace: check `cargo tree -d` before enabling `bevy_winit` or `egui-winit`.
- Upstream first: take the newest Bevy release candidate, flatten what must be modified, keep the rest as pinned dependencies.
- Third-party characters, mascots and logos belong to their owners; only assets whose license allows redistribution enter the public repository.
