//! Native shell of auto (desktop and mobile): a single window loading the web front (`apps/web`) of an auto instance.
//!
//! The instance URL comes from `AUTO_URL` (default `https://auto.aphrody.com`; `http://localhost:3001` for the
//! dev front). The front stays
//! served by Bun: the shell embeds neither API nor data, exposes no IPC command to remote content, and
//! opens in the window only the instance origin (other links go to the system browser).

use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use url::Url;
#[cfg(desktop)]
mod i18n;
#[cfg(desktop)]
mod mise_a_jour;

/// Default instance: the online service. A self-hosted or dev instance is chosen with `AUTO_URL`.
pub const URL_DEFAUT: &str = match option_env!("AUTO_INSTANCE_URL") {
    Some(url) => url,
    None => "https://auto.aphrody.com",
};

/// URL of the application (`/app`) for a given instance; only `http` and `https` are accepted.
pub fn url_application(instance: &str) -> Result<Url, String> {
    let base = Url::parse(instance.trim()).map_err(|e| format!("invalid AUTO_URL: {e}"))?;
    if !matches!(base.scheme(), "http" | "https") {
        return Err(format!("AUTO_URL: scheme {} refused (http or https)", base.scheme()));
    }
    if !base.username().is_empty() || base.password().is_some() {
        return Err("AUTO_URL: credentials in the URL refused".into());
    }
    base.join("/app").map_err(|e| e.to_string())
}

/// True if `cible` stays on the instance origin (same scheme, host and port).
pub fn meme_origine(instance: &Url, cible: &Url) -> bool {
    instance.origin() == cible.origin()
}

/// The user code is public and single-use; no session token passes through this URL.
pub fn verification_appareil(instance: &Url, cible: &Url) -> bool {
    if !meme_origine(instance, cible)
        || cible.path() != "/app/verification-appareil"
        || cible.fragment().is_some()
        || !cible.username().is_empty()
        || cible.password().is_some()
    {
        return false;
    }
    let mut query = cible.query_pairs();
    match (query.next(), query.next()) {
        (Some((nom, code)), None) => {
            nom == "user_code"
                && (6..=64).contains(&code.len())
                && code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        }
        _ => false,
    }
}

#[derive(Debug, PartialEq)]
pub enum Navigation {
    Interne,
    Navigateur,
    Refuser,
}

pub fn destination(instance: &Url, cible: &Url) -> Navigation {
    if !cible.username().is_empty() || cible.password().is_some() {
        return Navigation::Refuser;
    }
    if verification_appareil(instance, cible) {
        return Navigation::Navigateur;
    }
    if meme_origine(instance, cible) {
        return Navigation::Interne;
    }
    if matches!(cible.scheme(), "https" | "http" | "mailto" | "tel") {
        Navigation::Navigateur
    } else {
        Navigation::Refuser
    }
}

/// Common entry point: `main` on desktop, library loaded by the Android or iOS application on mobile.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn lancer() {
    let instance = std::env::var("AUTO_URL").unwrap_or_else(|_| URL_DEFAUT.to_owned());
    let url = url_application(&instance).unwrap_or_else(|e| panic!("{e}"));
    let origine = url.clone();

    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .menu(|app| {
            use tauri::menu::{Menu, MenuItem, Submenu};
            let verifier =
                MenuItem::with_id(app, "auto-mise-a-jour", i18n::t("update.menu", &[]), true, None::<&str>)?;
            let sous_menu = Submenu::with_items(app, "Auto", true, &[&verifier])?;
            Menu::with_items(app, &[&sous_menu])
        })
        .on_menu_event(|app, event| {
            if event.id() == "auto-mise-a-jour" {
                mise_a_jour::verifier(app.clone(), true);
            }
        });
    builder
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .setup(move |app| {
            let handle = app.handle().clone();
            let fenetre = WebviewWindowBuilder::new(app, "principale", WebviewUrl::External(url.clone()))
                // Let the browser handle files/folders dropped in HTML5, without remote IPC.
                .disable_drag_drop_handler()
                .initialization_script(
                    "Object.defineProperty(window,'__AUTO_NATIVE__',{value:true,configurable:false});",
                )
                .on_navigation(move |cible| match destination(&origine, cible) {
                    Navigation::Interne => true,
                    Navigation::Navigateur => {
                        let handle = handle.clone();
                        let cible = cible.to_string();
                        // Never block the Android navigation thread while the system opens the link.
                        tauri::async_runtime::spawn_blocking(move || {
                            if handle.opener().open_url(cible, None::<&str>).is_err() {
                                eprintln!("Could not open the system browser");
                            }
                        });
                        false
                    }
                    Navigation::Refuser => false,
                });
            #[cfg(desktop)]
            let fenetre = fenetre.title("auto").inner_size(1280.0, 860.0).min_inner_size(375.0, 600.0);
            fenetre.build()?;
            #[cfg(desktop)]
            mise_a_jour::verifier(app.handle().clone(), false);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("auto shell failed to start");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_de_l_application() {
        assert_eq!(url_application("http://localhost:3001").unwrap().as_str(), "http://localhost:3001/app");
        assert_eq!(url_application(" https://auto.exemple.fr/ ").unwrap().as_str(), "https://auto.exemple.fr/app");
        assert!(url_application("file:///C:/app").is_err());
        assert!(url_application("not a url").is_err());
    }

    #[test]
    fn origine() {
        let i = Url::parse("https://auto.exemple.fr/app").unwrap();
        assert!(meme_origine(&i, &Url::parse("https://auto.exemple.fr/app/factures").unwrap()));
        assert!(!meme_origine(&i, &Url::parse("https://checkout.stripe.com/c/1").unwrap()));
        assert!(!meme_origine(&i, &Url::parse("http://auto.exemple.fr/app").unwrap()));
    }

    #[test]
    fn verification_native_stricte() {
        let i = Url::parse("https://auto.exemple.fr/app").unwrap();
        let verifier = |s: &str| destination(&i, &Url::parse(s).unwrap());
        assert_eq!(
            verifier("https://auto.exemple.fr/app/verification-appareil?user_code=ABCD-EFGH"),
            Navigation::Navigateur
        );
        assert!(!verification_appareil(
            &i,
            &Url::parse("https://evil.example/app/verification-appareil?user_code=ABCD-EFGH").unwrap()
        ));
        for url in [
            "https://auto.exemple.fr/app/verification-appareil?user_code=ABC&token=secret",
            "https://auto.exemple.fr/app/verification-appareil?user_code=ABCD-EFGH&user_code=AAAA-BBBB",
            "https://auto.exemple.fr/app/verification-appareil?user_code=ABCD-EFGH#fragment",
        ] {
            assert!(!verification_appareil(&i, &Url::parse(url).unwrap()));
        }
        assert_eq!(verifier("https://auto.exemple.fr/app/courrier"), Navigation::Interne);
        assert_eq!(verifier("https://accounts.google.com/"), Navigation::Navigateur);
        for url in ["file:///tmp/test", "javascript:alert(1)", "https://user:pass@auto.exemple.fr/app"] {
            assert_eq!(verifier(url), Navigation::Refuser);
        }
        assert!(url_application("https://user:pass@auto.exemple.fr").is_err());
    }
}
