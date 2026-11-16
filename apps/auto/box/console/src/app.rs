//! Console interface: sign-in, then dashboard (state of the services, models, credentials, behind the scenes).
//! Data is loaded in the browser through the server functions and refreshed at a fixed interval; lists
//! are keyed by state so that keyboard focus does not jump on every refresh. Texts come from the catalogs
//! (`locales/<tag>.json`) in the locale negotiated for the page.
use crate::i18n::{self, t};
use crate::types::*;
use leptos::prelude::*;
use leptos::task::spawn_local;
#[cfg(feature = "ssr")]
use leptos_meta::MetaTags;
use leptos_meta::{Meta, Stylesheet, Title, provide_meta_context};
use std::time::Duration;

#[cfg(feature = "ssr")]
pub fn shell(options: LeptosOptions) -> impl IntoView {
    let lang = i18n::page_locale();
    view! {
        <!DOCTYPE html>
        <html lang=lang>
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <meta name="color-scheme" content="light dark" />
                <HydrationScripts options />
                <MetaTags />
            </head>
            <body>
                <App />
            </body>
        </html>
    }
}

// Server functions

/// Error text of a server function that is not shown: the client matches it to refresh the session.
const AUTH_REQUIRED: &str = "auth_required";

/// Locale negotiated from the Accept-Language header of the current request.
#[cfg(feature = "ssr")]
async fn request_locale() -> &'static str {
    use axum::http::{HeaderMap, header};
    match leptos_axum::extract::<HeaderMap>().await {
        Ok(h) => h
            .get(header::ACCEPT_LANGUAGE)
            .and_then(|v| v.to_str().ok())
            .map(i18n::negotiate_accept)
            .unwrap_or(i18n::SOURCE),
        Err(_) => i18n::SOURCE,
    }
}

/// Error shown to the user, from a catalog key (`error.<key>`) translated for the current request.
#[cfg(feature = "ssr")]
async fn failure(key: &str, args: &[(&str, &str)]) -> ServerFnError {
    ServerFnError::new(i18n::translate(request_locale().await, &format!("error.{key}"), args))
}

/// Result of the Docker or Ollama clients: a catalog code (`docker_unreachable`) is translated, any other
/// diagnostic (HTTP status, socket path) is passed through as is.
#[cfg(feature = "ssr")]
async fn diagnostic<T>(r: Result<T, String>) -> Result<T, ServerFnError> {
    match r {
        Ok(v) => Ok(v),
        Err(e) => {
            let (locale, key) = (request_locale().await, format!("error.{e}"));
            Err(ServerFnError::new(if i18n::has(locale, &key) { i18n::translate(locale, &key, &[]) } else { e }))
        }
    }
}

#[cfg(feature = "ssr")]
async fn exiger_session() -> Result<(), ServerFnError> {
    use axum::http::{HeaderMap, header};
    use crate::serveur::{etat, session};
    let h: HeaderMap = leptos_axum::extract().await?;
    let texte = |n: header::HeaderName| h.get(n).and_then(|v| v.to_str().ok()).map(str::to_owned);
    let connecte = texte(header::COOKIE)
        .as_deref()
        .and_then(session::lire_cookie)
        .is_some_and(|c| session::valide(&etat().config.secret, c));
    if !connecte {
        return Err(ServerFnError::new(AUTH_REQUIRED));
    }
    // Request coming from another page: refused, even with the cookie (which is already SameSite=Strict).
    if let (Some(origine), Some(hote)) = (texte(header::ORIGIN), texte(header::HOST))
        && origine.split_once("://").map(|(_, h)| h) != Some(hote.as_str())
    {
        return Err(failure("origin_refused", &[]).await);
    }
    Ok(())
}

#[server]
pub async fn est_connecte() -> Result<bool, ServerFnError> {
    Ok(exiger_session().await.is_ok())
}

#[server]
pub async fn connecter(utilisateur: String, mot_de_passe: String) -> Result<(), ServerFnError> {
    use crate::serveur::{etat, session};
    use axum::extract::ConnectInfo;
    use axum::http::{HeaderValue, header};
    let e = etat();
    let ConnectInfo(adresse): ConnectInfo<std::net::SocketAddr> = leptos_axum::extract().await?;
    let ip = adresse.ip();
    if e.tentatives.bloquee(ip) {
        return Err(ServerFnError::new(i18n::translate(request_locale().await, "login.too_many", &[])));
    }
    let bon = session::egal(&utilisateur, &e.config.utilisateur) & session::egal(&mot_de_passe, &e.config.mot_de_passe);
    if !bon {
        e.tentatives.echec(ip);
        return Err(ServerFnError::new(i18n::translate(request_locale().await, "login.bad_credentials", &[])));
    }
    e.tentatives.reussite(ip);
    let cookie = format!(
        "{}={}; Path=/; Max-Age={}; HttpOnly; SameSite=Strict{}",
        session::COOKIE,
        session::emettre(&e.config.secret),
        session::DUREE,
        if e.config.domaine.is_some() { "; Secure" } else { "" }
    );
    let reponse = expect_context::<leptos_axum::ResponseOptions>();
    reponse.insert_header(header::SET_COOKIE, HeaderValue::from_str(&cookie).map_err(ServerFnError::new)?);
    Ok(())
}

#[server]
pub async fn deconnecter() -> Result<(), ServerFnError> {
    use axum::http::{HeaderValue, header};
    let reponse = expect_context::<leptos_axum::ResponseOptions>();
    reponse.insert_header(
        header::SET_COOKIE,
        HeaderValue::from_static("box_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"),
    );
    Ok(())
}

#[server]
pub async fn lire_etat() -> Result<EtatBoite, ServerFnError> {
    use crate::serveur::{disque, etat, services};
    use axum::http::{HeaderMap, header};
    exiger_session().await?;
    let h: HeaderMap = leptos_axum::extract().await?;
    let hote = services::nom_hote(h.get(header::HOST).and_then(|v| v.to_str().ok()).unwrap_or("localhost"));
    let e = etat();
    let locale = request_locale().await;
    let (conteneurs, info) = tokio::join!(e.docker.conteneurs(), e.docker.info());
    let conteneurs = diagnostic(conteneurs).await?;
    let vus = futures_util::future::join_all(services::SERVICES.iter().map(|s| {
        let c = conteneurs.iter().find(|c| c.service == s.conteneur).cloned();
        let hote = hote.clone();
        async move {
            let en_cours = c.as_ref().is_some_and(|c| c.etat == "running");
            let repond = match (en_cours, s.sonde) {
                (true, Some(url)) => Some(e.sondes.get(url).send().await.is_ok_and(|r| r.status().as_u16() < 500)),
                _ => None,
            };
            let etat = match &c {
                None => EtatService::Absent,
                Some(c) if c.etat != "running" => EtatService::Arret,
                Some(c) if c.sante == Some("unhealthy") => EtatService::Panne,
                Some(c) if c.sante == Some("starting") || repond == Some(false) => EtatService::Demarrage,
                Some(_) => EtatService::Marche,
            };
            ServiceVu {
                id: s.id.into(),
                nom: services::nom(locale, s),
                role: i18n::translate(locale, s.role, &[]),
                couleur: s.couleur.into(),
                technique: s.technique,
                lien: services::lien(s, e.config.domaine.as_deref(), &hote),
                etat,
                statut: c.map(|c| c.statut),
            }
        }
    }))
    .await;
    let (cpus, memoire) = info.map(|(c, m)| (Some(c), Some(m))).unwrap_or((None, None));
    let (disque_total, disque_libre) = disque("/").map(|(t, l)| (Some(t), Some(l))).unwrap_or((None, None));
    Ok(EtatBoite {
        services: vus.into_iter().filter(|s| !(s.technique && s.etat == EtatService::Absent)).collect(),
        systeme: Systeme { cpus, memoire, disque_total, disque_libre },
    })
}

#[server]
pub async fn acces_boite() -> Result<Vec<Acces>, ServerFnError> {
    exiger_session().await?;
    let locale = request_locale().await;
    let tr = |key: &str| i18n::translate(locale, key, &[]);
    let c = &crate::serveur::etat().config;
    let ligne = |service: String, identifiant: String, mot_de_passe: String| Acces { service, identifiant, mot_de_passe };
    Ok(vec![
        ligne(tr("access.console"), c.utilisateur.clone(), c.mot_de_passe.clone()),
        ligne("n8n".into(), c.val("BOX_EMAIL"), c.val("N8N_MOT_DE_PASSE")),
        ligne("Hermes".into(), "admin".into(), c.val("HERMES_MOT_DE_PASSE")),
        ligne(tr("access.hermes_api"), tr("access.key"), c.val("HERMES_CLE_API")),
        ligne("Obsidian".into(), c.utilisateur.clone(), c.val("OBSIDIAN_MOT_DE_PASSE")),
        ligne("Auto".into(), tr("access.auto"), String::new()),
    ])
}

#[cfg(feature = "ssr")]
async fn conteneur_de(id: &str) -> Result<crate::serveur::docker::Conteneur, ServerFnError> {
    use crate::serveur::{etat, services};
    let Some(s) = services::service(id) else {
        return Err(failure("service_unknown", &[("id", id)]).await);
    };
    let conteneurs = diagnostic(etat().docker.conteneurs().await).await?;
    match conteneurs.into_iter().find(|c| c.service == s.conteneur) {
        Some(c) => Ok(c),
        None => Err(failure("not_installed", &[("name", &services::nom(request_locale().await, s))]).await),
    }
}

#[server]
pub async fn lire_journal(id: String) -> Result<String, ServerFnError> {
    exiger_session().await?;
    let c = conteneur_de(&id).await?;
    diagnostic(crate::serveur::etat().docker.journal(&c.id, 400).await).await
}

#[server]
pub async fn redemarrer(id: String) -> Result<(), ServerFnError> {
    exiger_session().await?;
    let c = conteneur_de(&id).await?;
    diagnostic(crate::serveur::etat().docker.redemarrer(&c.id).await).await
}

#[server]
pub async fn lire_modeles() -> Result<Modeles, ServerFnError> {
    use crate::serveur::{etat, ollama};
    exiger_session().await?;
    let e = etat();
    let locale = request_locale().await;
    let (installes, erreur) = match e.ollama.modeles().await {
        Ok(m) => (m, None),
        Err(x) => (Vec::new(), Some(diagnostic::<()>(Err(x)).await.err().map(|e| message(&e)).unwrap_or_default())),
    };
    let en_cours = {
        let mut t = e.telechargements.lock().unwrap();
        let v: Vec<Progression> = t.values().cloned().collect();
        // A finished download is shown once, then forgotten.
        t.retain(|_, p| !p.termine);
        v
    };
    Ok(Modeles { installes, suggestions: ollama::suggestions(locale), en_cours, erreur })
}

#[server]
pub async fn installer_modele(nom: String) -> Result<(), ServerFnError> {
    use crate::serveur::{etat, ollama};
    exiger_session().await?;
    let nom = nom.trim().to_string();
    if !ollama::nom_valide(&nom) {
        return Err(failure("invalid_model_name", &[]).await);
    }
    let e = etat();
    if e.telechargements.lock().unwrap().get(&nom).is_some_and(|p| !p.termine) {
        return Err(failure("already_downloading", &[("name", &nom)]).await);
    }
    e.ollama.telecharger(nom, e.telechargements.clone());
    Ok(())
}

#[server]
pub async fn supprimer_modele(nom: String) -> Result<(), ServerFnError> {
    use crate::serveur::{etat, ollama};
    exiger_session().await?;
    if !ollama::nom_valide(&nom) {
        return Err(failure("invalid_model", &[]).await);
    }
    diagnostic(etat().ollama.supprimer(&nom).await).await
}

// Interface

fn message(e: &ServerFnError) -> String {
    match e {
        ServerFnError::ServerError(m) => m.clone(),
        autre => autre.to_string(),
    }
}

fn resume(services: &[ServiceVu]) -> String {
    let soucis: Vec<&ServiceVu> =
        services.iter().filter(|s| matches!(s.etat, EtatService::Panne | EtatService::Arret)).collect();
    let demarrent: Vec<&ServiceVu> = services.iter().filter(|s| s.etat == EtatService::Demarrage).collect();
    match (soucis.as_slice(), demarrent.as_slice()) {
        ([s], _) => {
            t(if s.etat == EtatService::Panne { "summary.down" } else { "summary.stopped" }, &[("name", &s.nom)])
        }
        ([_, ..], _) => t("summary.need_you", &[("count", &soucis.len().to_string())]),
        ([], [s]) => t("summary.starting_one", &[("name", &s.nom)]),
        ([], [_, ..]) => t("summary.starting_many", &[("count", &demarrent.len().to_string())]),
        ([], []) if services.iter().any(|s| s.etat == EtatService::Marche) => t("summary.all_ok", &[]),
        _ => t("summary.none", &[]),
    }
}

/// Calls `f` right away then every `periode`, in the browser only; stops on unmount.
fn periodique(periode: Duration, f: impl Fn() + Clone + 'static) {
    Effect::new(move |_| {
        f();
        if let Ok(h) = set_interval_with_handle(f.clone(), periode) {
            on_cleanup(move || h.clear());
        }
    });
}

#[component]
pub fn App() -> impl IntoView {
    provide_meta_context();
    provide_context(i18n::Locale(i18n::page_locale()));
    let session = Resource::new(|| (), |_| est_connecte());
    view! {
        <Stylesheet id="leptos" href="/pkg/aphrody-box.css" />
        <Title text="Aphrody Box" />
        <Meta name="robots" content="noindex" />
        <Suspense fallback=|| view! { <p class="attente">{t("loading", &[])}</p> }>
            {move || Suspend::new(async move {
                if matches!(session.await, Ok(true)) {
                    view! { <Console session /> }.into_any()
                } else {
                    view! { <Connexion session /> }.into_any()
                }
            })}
        </Suspense>
    }
}

#[component]
fn Connexion(session: Resource<Result<bool, ServerFnError>>) -> impl IntoView {
    let action = ServerAction::<Connecter>::new();
    Effect::new(move |_| {
        if let Some(Ok(())) = action.value().get() {
            session.refetch();
        }
    });
    let erreur = move || action.value().get().and_then(|r| r.err()).map(|e| message(&e));
    view! {
        <main class="connexion">
            <div class="carte-connexion">
                <p class="marque">"Aphrody Box"</p>
                <h1>{t("login.heading", &[])}</h1>
                <ActionForm action>
                    <label>
                        {t("login.username", &[])}
                        <input name="utilisateur" autocomplete="username" value="admin" required />
                    </label>
                    <label>
                        {t("login.password", &[])}
                        <input name="mot_de_passe" type="password" autocomplete="current-password" required />
                    </label>
                    <p class="erreur" role="alert">
                        {erreur}
                    </p>
                    <button class="bouton principal" type="submit" disabled=move || action.pending().get()>
                        {t("login.submit", &[])}
                    </button>
                </ActionForm>
                <p class="aide">{t("login.help", &[])}</p>
            </div>
        </main>
    }
}

#[component]
fn Console(session: Resource<Result<bool, ServerFnError>>) -> impl IntoView {
    let donnees = RwSignal::new(None::<EtatBoite>);
    let erreur = RwSignal::new(None::<String>);
    let journal_de = RwSignal::new(None::<(String, String)>);
    let charger = move || {
        spawn_local(async move {
            match lire_etat().await {
                Ok(e) => {
                    donnees.set(Some(e));
                    erreur.set(None);
                }
                Err(x) if message(&x) == AUTH_REQUIRED => session.refetch(),
                Err(x) => erreur.set(Some(message(&x))),
            }
        })
    };
    periodique(Duration::from_secs(4), charger);

    let relance = ServerAction::<Redemarrer>::new();
    Effect::new(move |_| {
        if relance.version().get() > 0 {
            charger();
        }
    });
    let sortie = ServerAction::<Deconnecter>::new();
    Effect::new(move |_| {
        if let Some(Ok(())) = sortie.value().get() {
            session.refetch();
        }
    });

    let services = move || donnees.with(|d| d.as_ref().map(|e| e.services.clone()).unwrap_or_default());
    let apps = move || services().into_iter().filter(|s| !s.technique).collect::<Vec<_>>();
    let coulisses = move || services().into_iter().filter(|s| s.technique).collect::<Vec<_>>();
    let titre = move || donnees.with(|d| d.as_ref().map(|e| resume(&e.services)).unwrap_or_else(|| t("summary.reading", &[])));
    let systeme = move || donnees.with(|d| d.as_ref().map(|e| e.systeme.clone()));

    view! {
        <div class="console">
            <header class="barre">
                <span class="marque">"Aphrody Box"</span>
                <nav aria-label=t("nav.label", &[])>
                    <a href="#applications">{t("nav.apps", &[])}</a>
                    <a href="#modeles">{t("nav.models", &[])}</a>
                    <a href="#acces">{t("nav.access", &[])}</a>
                    <a href="#coulisses">{t("nav.backstage", &[])}</a>
                </nav>
                <button class="bouton discret" type="button" on:click=move |_| { sortie.dispatch(Deconnecter {}); }>
                    {t("logout", &[])}
                </button>
            </header>

            <section class="tete" aria-live="polite">
                <h1>{titre}</h1>
                <p class="doux">
                    {move || {
                        let s = services();
                        let n = s.iter().filter(|s| !s.technique).count();
                        if s.is_empty() {
                            String::new()
                        } else {
                            t("summary.counts", &[("apps", &n.to_string()), ("backstage", &(s.len() - n).to_string())])
                        }
                    }}
                </p>
                {move || erreur.get().map(|e| view! { <p class="erreur" role="alert">{e}</p> })}
                <Jauges systeme=Signal::derive(systeme) />
            </section>

            <section id="applications" aria-labelledby="t-apps">
                <h2 id="t-apps">{t("apps.title", &[])}</h2>
                <ul class="apps">
                    <For each=apps key=|s| (s.id.clone(), s.etat, s.lien.clone()) let:s>
                        <CarteApp s journal_de relance />
                    </For>
                </ul>
            </section>

            <SectionModeles />
            <SectionAcces />

            <section id="coulisses" aria-labelledby="t-coulisses">
                <h2 id="t-coulisses">{t("backstage.title", &[])}</h2>
                <p class="doux">{t("backstage.note", &[])}</p>
                <ul class="coulisses">
                    <For each=coulisses key=|s| (s.id.clone(), s.etat, s.statut.clone()) let:s>
                        <li data-etat=s.etat.classe()>
                            <Pastille etat=s.etat />
                            <strong>{s.nom.clone()}</strong>
                            <span class="doux">{s.statut.clone().unwrap_or_default()}</span>
                            <button
                                class="bouton discret"
                                type="button"
                                on:click={
                                    let (id, nom) = (s.id.clone(), s.nom.clone());
                                    move |_| journal_de.set(Some((id.clone(), nom.clone())))
                                }
                            >
                                {t("logs", &[])}
                            </button>
                        </li>
                    </For>
                </ul>
            </section>

            <Journal journal_de />
        </div>
    }
}

#[component]
fn Pastille(etat: EtatService) -> impl IntoView {
    view! {
        <span class="pastille" data-etat=etat.classe()>
            <span class="point" aria-hidden="true"></span>
            {etat.libelle()}
        </span>
    }
}

#[component]
fn Jauges(systeme: Signal<Option<Systeme>>) -> impl IntoView {
    let valeur = move |f: fn(&Systeme) -> Option<String>| move || systeme.get().as_ref().and_then(f).unwrap_or_else(|| "–".into());
    let rempli = move || {
        systeme.get().and_then(|s| Some(1.0 - s.disque_libre? as f64 / s.disque_total.filter(|t| *t > 0)? as f64)).unwrap_or(0.0)
    };
    view! {
        <dl class="jauges">
            <div>
                <dt>{t("gauge.cpus", &[])}</dt>
                <dd>{valeur(|s| s.cpus.map(|c| c.to_string()))}</dd>
            </div>
            <div>
                <dt>{t("gauge.memory", &[])}</dt>
                <dd>{valeur(|s| s.memoire.map(octets))}</dd>
            </div>
            <div class="disque">
                <dt>{t("gauge.disk", &[])}</dt>
                <dd>
                    {valeur(|s| Some(t("gauge.disk_free", &[("free", &octets(s.disque_libre?)), ("total", &octets(s.disque_total?))])))}
                    <span class="barre-disque" aria-hidden="true">
                        <span
                            data-alerte=move || (rempli() > 0.9).to_string()
                            style=move || format!("inline-size:{:.0}%", rempli() * 100.0)
                        ></span>
                    </span>
                </dd>
            </div>
        </dl>
    }
}

#[component]
fn CarteApp(s: ServiceVu, journal_de: RwSignal<Option<(String, String)>>, relance: ServerAction<Redemarrer>) -> impl IntoView {
    let (id, nom) = (s.id.clone(), s.nom.clone());
    let en_cours = {
        let id = id.clone();
        move || relance.pending().get() && relance.input().with(|i| i.as_ref().is_some_and(|r| r.id == id))
    };
    let installe = s.etat != EtatService::Absent;
    view! {
        <li class="app" data-etat=s.etat.classe() style=format!("--couleur:{}", s.couleur)>
            <div class="entete">
                <h3>{s.nom.clone()}</h3>
                <Pastille etat=s.etat />
            </div>
            <p>{s.role.clone()}</p>
            <div class="actions">
                {s.lien.clone().filter(|_| installe).map(|l| view! {
                    <a class="bouton principal" href=l target="_blank" rel="noopener">{t("card.open", &[])}<span class="sr">{format!(" {}", s.nom)}</span></a>
                })}
                {installe.then(|| {
                    let (id_j, nom_j, id_r) = (id.clone(), nom.clone(), id.clone());
                    let (desactive, libelle) = (en_cours.clone(), en_cours.clone());
                    view! {
                        <button class="bouton discret" type="button" on:click=move |_| journal_de.set(Some((id_j.clone(), nom_j.clone())))>
                            {t("logs", &[])}
                        </button>
                        <button
                            class="bouton discret"
                            type="button"
                            disabled=desactive
                            on:click=move |_| { relance.dispatch(Redemarrer { id: id_r.clone() }); }
                        >
                            {move || if libelle() { t("card.restarting", &[]) } else { t("card.restart", &[]) }}
                        </button>
                    }
                })}
            </div>
        </li>
    }
}

#[component]
fn Journal(journal_de: RwSignal<Option<(String, String)>>) -> impl IntoView {
    let texte = RwSignal::new(String::new());
    let fermer_ref = NodeRef::<leptos::html::Button>::new();
    let pre_ref = NodeRef::<leptos::html::Pre>::new();
    Effect::new(move |_| {
        if let Some((id, _)) = journal_de.get() {
            texte.set(t("loading", &[]));
            spawn_local(async move {
                texte.set(match lire_journal(id).await {
                    Ok(texte) if texte.is_empty() => t("logs.empty", &[]),
                    Ok(texte) => texte,
                    Err(e) => message(&e),
                })
            });
        }
    });
    // Focus on "Close" when opening, last lines visible on every load.
    Effect::new(move |_| {
        if let Some(b) = fermer_ref.get() {
            let _ = b.focus();
        }
    });
    Effect::new(move |_| {
        texte.track();
        if let Some(pre) = pre_ref.get() {
            // After the layout of the new text.
            request_animation_frame(move || pre.set_scroll_top(pre.scroll_height()));
        }
    });
    let fermer = move || journal_de.set(None);
    // Escape closes, wherever the focus is.
    Effect::new(move |_| {
        let h = window_event_listener(leptos::ev::keydown, move |e| {
            if e.key() == "Escape" && journal_de.with_untracked(Option::is_some) {
                fermer();
            }
        });
        on_cleanup(move || h.remove());
    });
    view! {
        <Show when=move || journal_de.with(Option::is_some)>
            <div class="voile" on:click=move |_| fermer()>
                <div
                    class="journal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="t-journal"
                    on:click=|e| e.stop_propagation()
                >
                    <header>
                        <h2 id="t-journal">
                            {move || journal_de.get().map(|(_, n)| t("logs.title", &[("name", &n)])).unwrap_or_default()}
                        </h2>
                        <button class="bouton discret" type="button" node_ref=fermer_ref on:click=move |_| fermer()>
                            {t("close", &[])}
                        </button>
                    </header>
                    <pre tabindex="0" node_ref=pre_ref>{move || texte.get()}</pre>
                </div>
            </div>
        </Show>
    }
}

#[component]
fn SectionModeles() -> impl IntoView {
    let liste = RwSignal::new(None::<Modeles>);
    let charger = move || {
        spawn_local(async move {
            if let Ok(m) = lire_modeles().await {
                liste.set(Some(m));
            }
        })
    };
    periodique(Duration::from_secs(3), charger);
    let installer = ServerAction::<InstallerModele>::new();
    let supprimer = ServerAction::<SupprimerModele>::new();
    Effect::new(move |_| {
        if installer.version().get() + supprimer.version().get() > 0 {
            charger();
        }
    });
    let erreur_action = move || {
        installer
            .value()
            .get()
            .and_then(|r| r.err())
            .or_else(|| supprimer.value().get().and_then(|r| r.err()))
            .map(|e| message(&e))
    };
    let installes = move || liste.with(|l| l.as_ref().map(|m| m.installes.clone()).unwrap_or_default());
    let en_cours = move || liste.with(|l| l.as_ref().map(|m| m.en_cours.clone()).unwrap_or_default());
    let suggestions = move || {
        liste.with(|l| {
            l.as_ref()
                .map(|m| {
                    m.suggestions
                        .iter()
                        .filter(|s| !m.installes.iter().any(|i| i.nom == s.nom || i.nom == format!("{}:latest", s.nom)))
                        .cloned()
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default()
        })
    };
    view! {
        <section id="modeles" aria-labelledby="t-modeles">
            <h2 id="t-modeles">{t("models.title", &[])}</h2>
            <p class="doux">{t("models.note", &[("url", "http://ollama:11434/v1")])}</p>
            {move || liste.with(|l| l.as_ref().and_then(|m| m.erreur.clone())).map(|e| view! { <p class="erreur" role="alert">{e}</p> })}
            <table class="table">
                <thead>
                    <tr>
                        <th scope="col">{t("models.model", &[])}</th>
                        <th scope="col" class="nombre">{t("models.size", &[])}</th>
                        <th scope="col">{t("models.details", &[])}</th>
                        <th scope="col"><span class="sr">{t("models.actions", &[])}</span></th>
                    </tr>
                </thead>
                <tbody>
                    <Show when=move || !installes().is_empty() fallback=|| view! {
                        <tr><td colspan="4" class="doux">{t("models.none", &[])}</td></tr>
                    }>
                        <For each=installes key=|m| (m.nom.clone(), m.charge) let:m>
                            <tr>
                                <th scope="row">
                                    {m.nom.clone()}
                                    {m.charge.then(|| view! { <span class="charge">{t("models.in_memory", &[])}</span> })}
                                </th>
                                <td class="nombre">{octets(m.taille)}</td>
                                <td class="doux">{m.details.clone()}</td>
                                <td>
                                    <button
                                        class="bouton discret"
                                        type="button"
                                        on:click={
                                            let nom = m.nom.clone();
                                            move |_| { supprimer.dispatch(SupprimerModele { nom: nom.clone() }); }
                                        }
                                    >
                                        {t("models.delete", &[])}<span class="sr">{format!(" {}", m.nom)}</span>
                                    </button>
                                </td>
                            </tr>
                        </For>
                    </Show>
                </tbody>
            </table>

            <div class="installer">
                <ActionForm action=installer>
                    <label for="nom-modele">{t("models.install_label", &[])}</label>
                    <div class="ligne">
                        <input id="nom-modele" name="nom" placeholder="qwen3:4b" autocomplete="off" required />
                        <button class="bouton principal" type="submit">{t("models.install", &[])}</button>
                    </div>
                </ActionForm>
                <div class="suggestions">
                    <For each=suggestions key=|s| s.nom.clone() let:s>
                        <button
                            class="suggestion"
                            type="button"
                            on:click={
                                let nom = s.nom.clone();
                                move |_| { installer.dispatch(InstallerModele { nom: nom.clone() }); }
                            }
                        >
                            <strong>{s.nom.clone()}</strong>
                            <span>{s.usage.clone()}</span>
                        </button>
                    </For>
                </div>
                {move || erreur_action().map(|e| view! { <p class="erreur" role="alert">{e}</p> })}
                <ul class="progressions" aria-live="polite">
                    <For each=en_cours key=|p| (p.nom.clone(), p.statut.clone(), p.fait, p.termine) let:p>
                        <li>
                            <span>
                                {match (&p.erreur, p.total) {
                                    (Some(e), _) => t("models.failed", &[("name", &p.nom), ("error", e)]),
                                    (None, total) if total > 0 && !p.termine => {
                                        t("models.progress", &[("name", &p.nom), ("done", &octets(p.fait)), ("total", &octets(total))])
                                    }
                                    _ => t("models.status", &[("name", &p.nom), ("status", &p.statut)]),
                                }}
                            </span>
                            <progress max="1" value=format!("{:.3}", if p.termine { 1.0 } else if p.total > 0 { p.fait as f64 / p.total as f64 } else { 0.0 })></progress>
                        </li>
                    </For>
                </ul>
            </div>
        </section>
    }
}

#[component]
fn SectionAcces() -> impl IntoView {
    let liste = RwSignal::new(Vec::<Acces>::new());
    Effect::new(move |_| {
        spawn_local(async move {
            if let Ok(a) = acces_boite().await {
                liste.set(a);
            }
        })
    });
    view! {
        <section id="acces" aria-labelledby="t-acces">
            <h2 id="t-acces">{t("access.title", &[])}</h2>
            <p class="doux">{t("access.note", &[])}</p>
            <table class="table">
                <thead>
                    <tr>
                        <th scope="col">{t("access.application", &[])}</th>
                        <th scope="col">{t("access.username", &[])}</th>
                        <th scope="col">{t("access.password", &[])}</th>
                    </tr>
                </thead>
                <tbody>
                    <For each=move || liste.get() key=|a| a.service.clone() let:a>
                        <LigneAcces a />
                    </For>
                </tbody>
            </table>
        </section>
    }
}

#[component]
fn LigneAcces(a: Acces) -> impl IntoView {
    let visible = RwSignal::new(false);
    let mdp = a.mot_de_passe.clone();
    view! {
        <tr>
            <th scope="row">{a.service.clone()}</th>
            <td>{a.identifiant.clone()}</td>
            <td>
                {if mdp.is_empty() {
                    view! { <span class="doux">"–"</span> }.into_any()
                } else {
                    view! {
                        <code class="secret">{move || if visible.get() { mdp.clone() } else { "••••••••••".into() }}</code>
                        <button class="bouton discret" type="button" aria-pressed=move || visible.get().to_string() on:click=move |_| visible.update(|v| *v = !*v)>
                            {move || if visible.get() { t("access.hide", &[]) } else { t("access.show", &[]) }}
                        </button>
                    }
                    .into_any()
                }}
            </td>
        </tr>
    }
}
