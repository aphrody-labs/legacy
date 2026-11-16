//! Administration console of the Aphrody Box: Leptos interface rendered by the server then hydrated in
//! WebAssembly; server functions for the state of the services (Docker engine, HTTP probes), the logs, the
//! restart, the Ollama models and the credentials. The binary also carries the preparer (`aphrody-box preparer`).

#![recursion_limit = "512"]

pub mod app;
pub mod i18n;
pub mod types;

#[cfg(feature = "ssr")]
pub mod serveur;

#[cfg(feature = "hydrate")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn hydrate() {
    console_error_panic_hook::set_once();
    leptos::mount::hydrate_body(app::App);
}
