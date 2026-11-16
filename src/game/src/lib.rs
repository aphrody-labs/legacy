//! Open-world vertical slice on Bevy (docs/games/PLAN.md section 6): streamed procedural terrain,
//! third-person controller (keyboard, mouse, gamepad), day/night cycle and procedural audio.
//! Multiplayer is a design note only, nothing networked exists here.

pub mod noise;
pub mod procgen;
pub mod synth;
pub mod store;
pub mod terrain_mesh;

mod ambience;
mod controls;
mod daynight;
mod player;
mod terrain;

use bevy::asset::AssetMetaCheck;
use bevy::prelude::*;
use bevy::window::WindowResolution;

/// Seed of the world: one value, same terrain on every machine.
pub const WORLD_SEED: u32 = 0x0A9F_0D17;

/// Builds and runs the game. Blocks on native; on the web the event loop is driven by the browser.
pub fn run() {
    run_with(|_| {});
}

/// Like [`run`], with `setup` applied first: plugins that must precede the render plugin (storefronts, see [`store`]) go there.
pub fn run_with(setup: impl FnOnce(&mut App)) {
    let mut app = App::new();
    setup(&mut app);
    app
        .add_plugins(
            DefaultPlugins
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "Aphrody Play".into(),
                        resolution: WindowResolution::new(1920, 1080),
                        canvas: Some("#game".into()),
                        fit_canvas_to_parent: true,
                        prevent_default_event_handling: true,
                        ..default()
                    }),
                    ..default()
                })
                .set(AssetPlugin {
                    // Standard Bevy .meta RON v1.0 sidecars (`assets/**/*.meta`) validated at build & test time.
                    meta_check: AssetMetaCheck::Always,
                    // Absolute on the web: the page is /play (no trailing slash) in some locales, so a relative
                    // "assets" fetched /assets/models/explorer.glb (404) and the player never loaded.
                    #[cfg(target_arch = "wasm32")]
                    file_path: "/play/assets".into(),
                    ..default()
                }),
        )
        .add_plugins((
            controls::ControlsPlugin,
            terrain::TerrainPlugin,
            player::PlayerPlugin,
            daynight::DayNightPlugin,
            ambience::AmbiencePlugin,
        ))
        .run();
}
