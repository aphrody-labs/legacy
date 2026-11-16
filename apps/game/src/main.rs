//! Game app: `aphrody-game` plays the game of `src/game` with the storefront services; `aphrody-game probe` prints the
//! headless Steam proof as one JSON line. The Steam app id is `STEAM_APP_ID` (default: Spacewar).
use game::store::{StorePlugin, SPACEWAR};

fn main() {
    let app_id = std::env::var("STEAM_APP_ID").ok().and_then(|v| v.parse().ok()).unwrap_or(SPACEWAR);
    match std::env::args().nth(1).as_deref() {
        Some("probe") => println!("{}", game::store::probe(app_id)),
        _ => game::run_with(|app| {
            app.add_plugins(StorePlugin::new(app_id));
        }),
    }
}
