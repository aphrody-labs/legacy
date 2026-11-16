//! Updates stay in the native host: no IPC command is open to the remote site.
use crate::i18n::t;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

static EN_COURS: AtomicBool = AtomicBool::new(false);

pub fn verifier(app: tauri::AppHandle, manuel: bool) {
    if EN_COURS.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let resultat = verifier_et_installer(&app, manuel).await;
        if resultat.is_err() {
            eprintln!("Update check or installation failed");
            if manuel {
                app.dialog().message(t("update.failed", &[]))
                    .title(t("update.title", &[])).kind(MessageDialogKind::Error).show(|_| {});
            }
        }
        EN_COURS.store(false, Ordering::SeqCst);
    });
}

async fn verifier_et_installer(app: &tauri::AppHandle, manuel: bool) -> tauri_plugin_updater::Result<()> {
    let updater = app.updater_builder().timeout(Duration::from_secs(30)).build()?;
    let Some(update) = updater.check().await? else {
        if manuel {
            app.dialog().message(t("update.current", &[])).title(t("update.title", &[])).show(|_| {});
        }
        return Ok(());
    };
    let dialog = app.clone();
    let message = t("update.available", &[("version", &update.version)]);
    let accord = tauri::async_runtime::spawn_blocking(move || {
        dialog
            .dialog()
            .message(message)
            .title(t("update.title", &[]))
            .buttons(MessageDialogButtons::OkCancelCustom(t("update.install", &[]), t("update.later", &[])))
            .blocking_show()
    })
    .await
    .unwrap_or(false);
    if !accord {
        return Ok(());
    }
    // The plugin verifies the signature and its signed version before running the installer.
    update.download_and_install(|_, _| {}, || {}).await?;
    app.restart();
}
