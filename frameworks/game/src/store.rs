//! Storefront services of a game: Steam through `bevy-steamworks` (aphrody-labs fork of HouraiTeahouse/bevy_steamworks over
//! `steamworks`, the Steamworks SDK bindings of Noxime/steamworks-rs) and Epic Online Services through `eos-rs`. Both are
//! upstream crates pinned in `src.lock.json`; this module only wires them into a Bevy `App` and reports their state.
//! Native only: on wasm32 both services report `Disabled`.

use bevy::prelude::*;

/// Valve's public test app (Spacewar): used when the game has no Steam app id of its own.
pub const SPACEWAR: u32 = 480;

/// State of one storefront service.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreState {
    /// The feature is not compiled in.
    Disabled,
    Ready(String),
    Failed(String),
}

#[derive(Resource, Debug, Clone)]
pub struct StoreStatus {
    pub steam: StoreState,
    pub epic: StoreState,
}

/// Adds the storefront services. Add it before the default plugins: the Steam plugin must precede the render plugin.
pub struct StorePlugin {
    pub steam_app_id: u32,
}

impl StorePlugin {
    pub fn new(steam_app_id: u32) -> Self {
        Self { steam_app_id }
    }
}

impl Plugin for StorePlugin {
    fn build(&self, app: &mut App) {
        #[cfg(all(feature = "steam", not(target_arch = "wasm32")))]
        let steam = match bevy_steamworks::SteamworksPlugin::init_app(self.steam_app_id) {
            Ok(plugin) => {
                app.add_plugins(plugin);
                StoreState::Ready(format!("app {}", self.steam_app_id))
            }
            Err(e) => StoreState::Failed(e.to_string()),
        };
        #[cfg(not(all(feature = "steam", not(target_arch = "wasm32"))))]
        let steam = StoreState::Disabled;
        app.insert_resource(StoreStatus { steam, epic: epic_state() });
        app.add_systems(Startup, log_status);
    }
}

fn epic_state() -> StoreState {
    #[cfg(all(feature = "epic", not(target_arch = "wasm32")))]
    {
        use eos_rs as _;
        StoreState::Ready("eos-rs linked; initialisation needs the product credentials of the game".into())
    }
    #[cfg(not(all(feature = "epic", not(target_arch = "wasm32"))))]
    StoreState::Disabled
}

fn log_status(status: Res<StoreStatus>) {
    info!("store: steam {:?}, epic {:?}", status.steam, status.epic);
}

/// Headless proof of the Steam integration, as one JSON line: client initialisation (needs a running Steam client) and the
/// game-server API (needs only the Steam library and the network: anonymous log-on, waits for the connection callback).
pub fn probe(app_id: u32) -> String {
    #[cfg(all(feature = "steam", not(target_arch = "wasm32")))]
    let (client, server) = (probe_client(app_id), probe_server());
    #[cfg(not(all(feature = "steam", not(target_arch = "wasm32"))))]
    let (client, server) = (StoreState::Disabled, StoreState::Disabled);
    let _ = app_id;
    format!("{{\"steam_client\":{},\"steam_server\":{},\"epic\":{}}}", json(&client), json(&server), json(&epic_state()))
}

fn json(s: &StoreState) -> String {
    match s {
        StoreState::Disabled => "\"disabled\"".into(),
        StoreState::Ready(m) => format!("{{\"ready\":{m:?}}}"),
        StoreState::Failed(m) => format!("{{\"failed\":{m:?}}}"),
    }
}

#[cfg(all(feature = "steam", not(target_arch = "wasm32")))]
fn probe_client(app_id: u32) -> StoreState {
    match steamworks::Client::init_app(app_id) {
        Ok(client) => StoreState::Ready(format!("{} ({})", client.friends().name(), client.utils().app_id().0)),
        Err(e) => StoreState::Failed(e.to_string()),
    }
}

#[cfg(all(feature = "steam", not(target_arch = "wasm32")))]
fn probe_server() -> StoreState {
    use std::sync::atomic::{AtomicU8, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant};
    let (server, _) = match steamworks::Server::init(
        std::net::Ipv4Addr::UNSPECIFIED,
        27016,
        27017,
        steamworks::ServerMode::NoAuthentication,
        "1.0.0.0",
    ) {
        Ok(s) => s,
        Err(e) => return StoreState::Failed(e.to_string()),
    };
    let state = Arc::new(AtomicU8::new(0));
    let (ok, bad) = (state.clone(), state.clone());
    let _connected = server.register_callback(move |_: steamworks::SteamServersConnected| ok.store(1, Ordering::SeqCst));
    let _failed = server.register_callback(move |_: steamworks::SteamServerConnectFailure| bad.store(2, Ordering::SeqCst));
    server.log_on_anonymous();
    let start = Instant::now();
    while state.load(Ordering::SeqCst) == 0 && start.elapsed() < Duration::from_secs(20) {
        server.run_callbacks();
        std::thread::sleep(Duration::from_millis(100));
    }
    match state.load(Ordering::SeqCst) {
        1 => StoreState::Ready(format!("anonymous log-on, steam id {}", server.steam_id().raw())),
        2 => StoreState::Failed("connection failed".into()),
        _ => StoreState::Failed("no connection callback within 20 s".into()),
    }
}
