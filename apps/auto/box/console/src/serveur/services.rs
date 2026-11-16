//! Catalog of the box services: what the administrator sees, where the service answers in the compose network
//! (probe) and where it opens from the browser (published port, or subdomain when BOX_DOMAINE is set).

pub struct Service {
    pub id: &'static str,
    pub nom: &'static str,
    /// Catalog key of the description (`service.<id>.role`).
    pub role: &'static str,
    /// Compose service (label com.docker.compose.service).
    pub conteneur: &'static str,
    /// Internal URL probed; an answer < 500 counts as "answering".
    pub sonde: Option<&'static str>,
    pub port: Option<u16>,
    pub https: bool,
    pub sous: Option<&'static str>,
    pub couleur: &'static str,
    pub technique: bool,
}

const fn app(
    id: &'static str,
    nom: &'static str,
    role: &'static str,
    conteneur: &'static str,
    sonde: &'static str,
    port: u16,
    sous: &'static str,
    couleur: &'static str,
) -> Service {
    Service {
        id,
        nom,
        role,
        conteneur,
        sonde: Some(sonde),
        port: Some(port),
        https: false,
        sous: Some(sous),
        couleur,
        technique: false,
    }
}

const fn coulisse(
    id: &'static str,
    nom: &'static str,
    role: &'static str,
    conteneur: &'static str,
    sonde: Option<&'static str>,
) -> Service {
    Service { id, nom, role, conteneur, sonde, port: None, https: false, sous: None, couleur: "#334155", technique: true }
}

pub const SERVICES: &[Service] = &[
    app(
        "auto",
        "Auto",
        "service.auto.role",
        "auto-web",
        "http://auto-web:3001/",
        8081,
        "auto",
        "#0f766e",
    ),
    app(
        "n8n",
        "n8n",
        "service.n8n.role",
        "n8n",
        "http://n8n:5678/healthz",
        5678,
        "n8n",
        "#c2255c",
    ),
    app(
        "hermes",
        "Hermes",
        "service.hermes.role",
        "hermes",
        "http://hermes:9119/",
        9119,
        "agent",
        "#a16207",
    ),
    Service {
        https: true,
        ..app(
            "obsidian",
            "Obsidian",
            "service.obsidian.role",
            "obsidian",
            "http://obsidian:3000/",
            3001,
            "notes",
            "#6d28d9",
        )
    },
    app(
        "courrier",
        "Mail",
        "service.courrier.role",
        "mailpit",
        "http://mailpit:8025/",
        8025,
        "courrier",
        "#1d4ed8",
    ),
    coulisse("ollama", "Ollama", "service.ollama.role", "ollama", Some("http://ollama:11434/api/version")),
    coulisse("api", "Auto API", "service.api.role", "auto-api", Some("http://auto-api:3000/health")),
    coulisse("worker", "Auto tasks", "service.worker.role", "auto-worker", None),
    coulisse("postgres", "Database", "service.postgres.role", "postgres", None),
    coulisse("caddy", "HTTPS", "service.caddy.role", "caddy", None),
];

pub fn service(id: &str) -> Option<&'static Service> {
    SERVICES.iter().find(|s| s.id == id)
}

/// Name shown for the service: the catalog entry `service.<id>.name` when the locale has one, else the name above.
pub fn nom(locale: &str, s: &Service) -> String {
    let key = format!("service.{}.name", s.id);
    if crate::i18n::has(locale, &key) { crate::i18n::translate(locale, &key, &[]) } else { s.nom.to_owned() }
}

/// "Open" link: HTTPS subdomain behind Caddy, otherwise the published port on the request host.
pub fn lien(s: &Service, domaine: Option<&str>, hote: &str) -> Option<String> {
    match (domaine, s.sous, s.port) {
        (Some(d), Some(sous), _) => Some(format!("https://{sous}.{d}")),
        (_, _, Some(port)) => Some(format!("{}://{hote}:{port}", if s.https { "https" } else { "http" })),
        _ => None,
    }
}

/// Host name of a Host header ("192.168.1.20:8080", "[::1]:8080"); only host characters pass.
pub fn nom_hote(host: &str) -> String {
    let h = if host.starts_with('[') {
        host.split_once(']').map(|(a, _)| format!("{a}]")).unwrap_or_default()
    } else {
        host.split(':').next().unwrap_or_default().to_string()
    };
    if !h.is_empty() && h.chars().all(|c| c.is_ascii_alphanumeric() || ".-[]:".contains(c)) { h } else { "localhost".into() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_and_roles_come_from_the_catalog() {
        let courrier = service("courrier").unwrap();
        assert_eq!(nom("en", courrier), "Mail");
        assert_eq!(nom("fr", courrier), "Courrier");
        assert_eq!(nom("fr", service("n8n").unwrap()), "n8n");
        for s in SERVICES {
            assert!(crate::i18n::has("en", s.role), "{}", s.role);
        }
    }

    #[test]
    fn liens() {
        let n8n = service("n8n").unwrap();
        assert_eq!(lien(n8n, None, "192.168.1.20").as_deref(), Some("http://192.168.1.20:5678"));
        assert_eq!(lien(n8n, Some("maboite.fr"), "x").as_deref(), Some("https://n8n.maboite.fr"));
        assert_eq!(lien(service("obsidian").unwrap(), None, "h").as_deref(), Some("https://h:3001"));
        assert_eq!(lien(service("postgres").unwrap(), None, "h"), None);
    }

    #[test]
    fn hotes() {
        assert_eq!(nom_hote("192.168.1.20:8080"), "192.168.1.20");
        assert_eq!(nom_hote("[::1]:8080"), "[::1]");
        assert_eq!(nom_hote("box.local"), "box.local");
        assert_eq!(nom_hote("evil\"><script>"), "localhost");
    }

    #[test]
    fn identifiants_uniques() {
        let mut ids: Vec<_> = SERVICES.iter().map(|s| s.id).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), SERVICES.len());
    }
}
