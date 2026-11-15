//! Factory configuration: built-in defaults matching fr1, overridable by `factory.toml`
//! (infra/chromium-factory/factory.toml, deployed next to the binary in /srv/chromium/factory).

use std::path::{Path, PathBuf};

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Config {
    /// gclient root (contains .gclient and src/).
    pub root: PathBuf,
    /// Deployed factory dir: `args/`, `third_party/chrome-channels.toml`, `third_party/toolchain-*.toml`.
    pub factory: PathBuf,
    /// Stable out dir name under `src/out`: kept across versions so the `ThinLTO` cache
    /// (`thin_lto_enable_cache` → `$root_out_dir/thinlto-cache`) and siso state survive bumps.
    pub out_name: String,
    pub target: String,
    /// Relative to `factory`.
    pub args: PathBuf,
    /// `ay` binary (F3: revinfo/getdep/hooks/runhooks identical to gclient).
    pub ay: PathBuf,
    /// Use `ay gclient sync --apply --populate-cache --cipd` instead of gclient sync. Off until
    /// validated on a copy (F3 open item).
    pub sync_with_ay: bool,
    pub depot_tools: PathBuf,
    pub state: PathBuf,
    pub reapi: Reapi,
    pub workers: Vec<Worker>,
    pub publish: Publish,
    pub doctor: Doctor,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Reapi {
    pub enabled: bool,
    /// siso `-reapi_address` (`NativeLink` CAS/AC/execution).
    pub address: String,
    /// `NativeLink` `worker_api` + health listener.
    pub worker_api: String,
    pub instance: String,
    pub project: String,
    /// siso `-local_jobs`: local slots on fr1 next to the fr1 worker (links, local-only rules).
    pub local_jobs: u32,
    /// siso `-remote_jobs`: about 1.5x the sum of worker `max_inflight_tasks` to hide CAS latency.
    pub remote_jobs: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Worker {
    pub name: String,
    /// Mesh IP: a live worker holds an established connection to the scheduler `worker_api` port
    /// (checked with `ss` on the scheduler host; fr1 has no ssh access to prd/fr2).
    pub addr: String,
    /// Optional ssh alias for a `MemAvailable` probe; `None` = no probe (or this host if `local`).
    #[serde(default)]
    pub ssh: Option<String>,
    /// The worker runs on this host (memory read from `/proc/meminfo`).
    #[serde(default)]
    pub local: bool,
    /// Worker `max_inflight_tasks` (`NL_JOBS`): sized on RAM, ~2.5 GB per blink/v8 compile.
    pub jobs: u32,
    /// Below this `MemAvailable` the worker is reported (peak cxx RSS measured: 2.97 GB).
    pub min_mem_gb: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Publish {
    pub remote: String,
    pub bucket: String,
    pub prefix: String,
    pub zstd_level: u32,
    pub staging: PathBuf,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Doctor {
    pub min_free_gb_src: u64,
    pub min_free_gb_cas: u64,
    pub cas_path: PathBuf,
    pub min_mem_avail_gb: u64,
    /// Processes that must not run next to a build (this session: cros repo sync and a test siso
    /// build competed with the F0 build).
    pub conflicting: Vec<String>,
}

impl Default for Config {
    fn default() -> Self {
        // Per-user defaults come from $HOME (fr1 runs as the service user), never a fixed /home path.
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        Self {
            root: "/srv/chromium".into(),
            factory: "/srv/chromium/factory".into(),
            out_name: "labs_agent".into(),
            target: "headless_shell".into(),
            args: "args/labs_agent.gn".into(),
            ay: home.join("bin/ay"),
            sync_with_ay: false,
            depot_tools: home.join("depot_tools"),
            state: "/srv/chromium/factory-state.json".into(),
            reapi: Reapi::default(),
            workers: vec![
                Worker { name: "fr1".into(), addr: "192.0.2.1".into(), ssh: None, local: true, jobs: 10, min_mem_gb: 26 },
                Worker { name: "prd".into(), addr: "192.0.2.5".into(), ssh: None, local: false, jobs: 4, min_mem_gb: 10 },
                Worker { name: "fr2".into(), addr: "192.0.2.3".into(), ssh: None, local: false, jobs: 3, min_mem_gb: 8 },
            ],
            publish: Publish::default(),
            doctor: Doctor::default(),
        }
    }
}

impl Default for Reapi {
    fn default() -> Self {
        Self {
            enabled: true,
            address: "192.0.2.1:50051".into(),
            worker_api: "192.0.2.1:50061".into(),
            instance: "main".into(),
            project: "aphrody".into(),
            local_jobs: 4,
            remote_jobs: 26,
        }
    }
}

impl Default for Publish {
    fn default() -> Self {
        Self {
            remote: "r2-chromium".into(),
            bucket: "aphrody-chromium".into(),
            prefix: "labs_agent".into(),
            zstd_level: 19,
            staging: "/srv/chromium/publish".into(),
        }
    }
}

impl Default for Doctor {
    fn default() -> Self {
        Self {
            min_free_gb_src: 40,
            min_free_gb_cas: 160,
            cas_path: "/home".into(),
            min_mem_avail_gb: 16,
            conflicting: ["siso", "ninja", "autoninja", "cros_sdk", "repo", "emerge", "gclient"]
                .map(String::from)
                .to_vec(),
        }
    }
}

/// Fills `@@hosts.<role>.<key>@@` tokens (the tracked config names roles, never addresses) from `ssh -G <role>`:
/// `address`, `mesh_ip` and `public_ip` are the HostName the role's Host alias resolves to (a 10.x address is the mesh one).
/// A token nothing answers stays as written.
pub fn expand_tokens(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(i) = rest.find("@@") {
        out.push_str(&rest[..i]);
        let after = &rest[i + 2..];
        let Some(j) = after.find("@@") else {
            out.push_str(&rest[i..]);
            return out;
        };
        let key = &after[..j];
        match token_value(key) {
            Some(v) => out.push_str(&v),
            None => out.push_str(&rest[i..i + 4 + j]),
        }
        rest = &after[j + 2..];
    }
    out.push_str(rest);
    out
}

fn token_value(key: &str) -> Option<String> {
    let mut it = key.splitn(3, '.');
    let (Some("hosts"), Some(role), Some(field)) = (it.next(), it.next(), it.next()) else { return None };
    let o = std::process::Command::new("ssh").args(["-G", role]).output().ok()?;
    let text = String::from_utf8_lossy(&o.stdout);
    let get = |k: &str| text.lines().find_map(|l| l.strip_prefix(k)?.strip_prefix(' ')).map(str::to_string);
    let host = get("hostname")?;
    let private = host.starts_with("10.");
    match field {
        "address" => Some(host),
        "mesh_ip" if private => Some(host),
        "public_ip" if !private => Some(host),
        "user" => get("user"),
        "port" => get("port"),
        _ => None,
    }
}

impl Config {
    /// Defaults, then `path` if it exists.
    pub fn load(path: Option<&Path>) -> Result<Self, String> {
        let Some(p) = path else { return Ok(Self::default()) };
        match std::fs::read_to_string(p) {
            Ok(s) => Self::parse(&expand_tokens(&s)).map_err(|e| format!("{}: {e}", p.display())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(format!("{}: {e}", p.display())),
        }
    }

    pub fn parse(s: &str) -> Result<Self, String> {
        toml::from_str(s).map_err(|e| e.to_string())
    }

    pub fn src(&self) -> PathBuf {
        self.root.join("src")
    }

    pub fn out(&self) -> PathBuf {
        self.src().join("out").join(&self.out_name)
    }

    pub fn channels_file(&self) -> PathBuf {
        self.factory.join("third_party/chrome-channels.toml")
    }

    /// `third_party/toolchain-<milestone>.toml` (published with the R2 toolchain).
    pub fn toolchain_manifest(&self, milestone: &str) -> PathBuf {
        self.factory.join(format!("third_party/toolchain-{milestone}.toml"))
    }

    pub fn total_worker_jobs(&self) -> u32 {
        self.workers.iter().map(|w| w.jobs).sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expand_leaves_unknown_tokens() {
        assert_eq!(expand_tokens("a=@@nope.x@@ b=@@ c"), "a=@@nope.x@@ b=@@ c");
    }

    #[test]
    fn defaults_and_override() {
        let d = Config::default();
        assert_eq!(d.out(), PathBuf::from("/srv/chromium/src/out/labs_agent"));
        assert_eq!(d.total_worker_jobs(), 17);
        let c = Config::parse(
            "out_name = \"x\"\n[reapi]\nremote_jobs = 8\n[[workers]]\nname = \"a\"\naddr = \"10.0.0.1\"\njobs = 2\nmin_mem_gb = 1\n",
        )
        .unwrap();
        assert_eq!(c.out_name, "x");
        assert_eq!(c.reapi.remote_jobs, 8);
        assert_eq!(c.reapi.local_jobs, 4);
        assert_eq!(c.workers.len(), 1);
        assert!(Config::parse("bogus = 1").is_err());
    }

    #[test]
    fn deployed_file_matches_defaults() {
        let c = Config::parse(include_str!("../../../../infra/chromium-factory/factory.toml")).unwrap();
        let d = Config::default();
        assert_eq!((c.out(), c.total_worker_jobs(), c.reapi.remote_jobs), (d.out(), d.total_worker_jobs(), d.reapi.remote_jobs));
        assert_eq!(c.doctor.conflicting, d.doctor.conflicting);
    }
}
