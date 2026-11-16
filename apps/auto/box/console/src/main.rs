//! `aphrody-box`: console (no argument or `serve`) and preparer (`prepare <folder> [options]`).
//! The French names (`servir`, `preparer`, `sante`, `--sans-gpu`, `--domaine`, `--hote`) stay as aliases.
#![recursion_limit = "512"]

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("preparer" | "prepare") => preparer(&args[1..]),
        None | Some("servir" | "serve") => servir().await,
        Some("--version") => println!("aphrody-box {}", env!("CARGO_PKG_VERSION")),
        Some("sante" | "health") => std::process::exit(if sante().await { 0 } else { 1 }),
        Some(autre) => {
            eprintln!("unknown command: {autre}\nusage: aphrody-box [serve] | prepare <folder> [--gpu|--no-gpu] [--email a@b.com] [--domain example.com] [--host 192.168.1.20]");
            std::process::exit(2);
        }
    }
}

/// Container probe (HEALTHCHECK): `GET /sante` on the local port, without depending on curl in the image.
async fn sante() -> bool {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let port = std::env::var("LEPTOS_SITE_ADDR").ok().and_then(|a| a.rsplit(':').next()?.parse::<u16>().ok()).unwrap_or(8080);
    let essai = async {
        let mut flux = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.ok()?;
        flux.write_all(b"GET /sante HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").await.ok()?;
        let mut reponse = Vec::new();
        flux.read_to_end(&mut reponse).await.ok()?;
        Some(reponse.starts_with(b"HTTP/1.1 200"))
    };
    tokio::time::timeout(std::time::Duration::from_secs(3), essai).await.ok().flatten().unwrap_or(false)
}

fn preparer(args: &[String]) {
    use aphrody_box::serveur::preparer::{Options, preparer};
    let option = |nom: &str| args.iter().position(|a| a == nom).and_then(|i| args.get(i + 1)).cloned();
    let dossier = args
        .iter()
        .enumerate()
        .find(|(i, a)| !a.starts_with("--") && !(*i > 0 && matches!(args[i - 1].as_str(), "--email" | "--domain" | "--domaine" | "--host" | "--hote")))
        .map(|(_, a)| a.clone())
        .unwrap_or_else(|| ".".into());
    let o = Options {
        gpu: if args.iter().any(|a| a == "--gpu") {
            Some(true)
        } else if args.iter().any(|a| a == "--no-gpu" || a == "--sans-gpu") {
            Some(false)
        } else {
            None
        },
        email: option("--email"),
        domaine: option("--domain").or_else(|| option("--domaine")),
        hote: option("--host").or_else(|| option("--hote")),
        proprietaire: None,
    };
    match preparer(std::path::Path::new(&dossier), &o) {
        Ok(v) => println!(
            "Box prepared in {dossier}.\n  Console: username {}, password {}\n  The other credentials are in the console, \"Access\" section.",
            v["BOX_ADMIN_UTILISATEUR"], v["BOX_ADMIN_MOT_DE_PASSE"]
        ),
        Err(e) => {
            eprintln!("preparation failed in {dossier}: {e}");
            std::process::exit(1);
        }
    }
}

async fn servir() {
    use aphrody_box::app::{App, shell};
    use aphrody_box::serveur::{self, Config, Etat, docker::Docker, ollama::Ollama};
    use axum::Router;
    use leptos::prelude::*;
    use leptos_axum::{LeptosRoutes, generate_route_list};

    let config = Config::depuis_env().unwrap_or_else(|e| {
        eprintln!("{e}");
        std::process::exit(1);
    });
    let projet = config.env.get("BOX_PROJET").cloned().unwrap_or_else(|| "aphrody-box".into());
    let socket = config.env.get("BOX_DOCKER_SOCKET").cloned().unwrap_or_else(|| "/var/run/docker.sock".into());
    let ollama = config.env.get("BOX_OLLAMA_URL").cloned().unwrap_or_else(|| "http://ollama:11434".into());
    serveur::installer(Etat {
        docker: Docker::new(socket, projet),
        ollama: Ollama::new(ollama),
        sondes: reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_millis(2500))
            .build()
            .expect("HTTP client"),
        telechargements: Default::default(),
        tentatives: Default::default(),
        config,
    });

    let conf = get_configuration(None).expect("Leptos configuration (Cargo.toml or LEPTOS_* variables)");
    let options = conf.leptos_options;
    let adresse = options.site_addr;
    let routes = generate_route_list(App);
    let app = Router::new()
        .route("/sante", axum::routing::get(|| async { "ok" }))
        .leptos_routes(&options, routes, {
            let options = options.clone();
            move || shell(options.clone())
        })
        .fallback(leptos_axum::file_and_error_handler(shell))
        .with_state(options);

    let ecoute = tokio::net::TcpListener::bind(&adresse).await.unwrap_or_else(|e| {
        eprintln!("cannot listen on {adresse}: {e}");
        std::process::exit(1);
    });
    println!("box console: http://{adresse}");
    axum::serve(ecoute, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).await.expect("serveur");
}
