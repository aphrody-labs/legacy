//! Site discovery, Rust twin of `system/env-kit/src/discover.ts` and `loaders/shell/discover.sh`: a role (`fr1`,
//! `fr2`, `prd`) is a `Host` alias of `~/.ssh/config`, and everything else (address, user, port, mesh or public
//! address) is read from there or learned from the host's own interfaces. Nothing is stored in the repository.
//! Tracked configs (`device/deploy.toml`) carry `@@hosts.<role>.<key>@@` tokens that [`expand`] fills at load time;
//! a token nothing answers stays as written.

use crate::config::SshConfig;

/// `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, loopback and link-local: not public.
pub fn is_private_v4(addr: &str) -> bool {
    let o: Vec<u8> = addr.split('.').filter_map(|p| p.parse().ok()).collect();
    match o.as_slice() {
        [10, ..] | [127, ..] | [192, 168, ..] | [169, 254, ..] => true,
        [172, b, ..] => (16..=31).contains(b),
        _ => false,
    }
}

fn is_v4(s: &str) -> bool {
    s.split('.').count() == 4 && s.split('.').all(|p| p.parse::<u8>().is_ok())
}

/// Facts about a role that `ip -o -4 addr show scope global; echo ===; ip -o link` (run on the host) reveals.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Probe {
    pub public: Option<String>,
    /// Tunnel (WireGuard, `link/none`) addresses, in interface order.
    pub mesh: Vec<String>,
}

/// Parses the output of the probe command above, whatever the tunnel interfaces are called.
pub fn parse_probe(text: &str) -> Probe {
    let (addrs, links) = text.split_once("===").unwrap_or((text, ""));
    let tunnels: Vec<&str> = links
        .lines()
        .filter(|l| l.contains("link/none"))
        .filter_map(|l| l.split_whitespace().nth(1))
        .map(|n| n.trim_end_matches(':'))
        .collect();
    let mut p = Probe::default();
    for l in addrs.lines() {
        let f: Vec<&str> = l.split_whitespace().collect();
        let (Some(ifname), Some(cidr)) = (f.get(1), f.get(3)) else { continue };
        let ip = cidr.split('/').next().unwrap_or("");
        if tunnels.contains(ifname) {
            p.mesh.push(ip.to_string());
        } else if p.public.is_none() && is_v4(ip) && !is_private_v4(ip) {
            p.public = Some(ip.to_string());
        }
    }
    p
}

/// One value of the dotted vocabulary (`hosts.<role>.<key>`) from the ssh client configuration. `ssh`, `user`,
/// `port` and `address` always answer; `public_ip` and `mesh_ip` answer when the alias points at an address of that kind.
pub fn get(cfg: &SshConfig, path: &str) -> Option<String> {
    let mut it = path.splitn(3, '.');
    let (sec, role, key) = (it.next()?, it.next()?, it.next()?);
    if sec != "hosts" {
        return None;
    }
    let h = cfg.resolve(role);
    match key {
        "ssh" => Some(role.to_string()),
        "user" => h.user,
        "port" => Some(h.port.to_string()),
        "address" => Some(h.hostname),
        "public_ip" if is_v4(&h.hostname) && !is_private_v4(&h.hostname) => Some(h.hostname),
        "mesh_ip" if is_v4(&h.hostname) && h.hostname.starts_with("10.") => Some(h.hostname),
        _ => None,
    }
}

/// Replaces every `@@a.b.c@@` token [`get`] can answer; the others stay as written.
pub fn expand(text: &str, cfg: &SshConfig) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("@@") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        match after.find("@@") {
            Some(end)
                if !after[..end].is_empty()
                    && after[..end].chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-')) =>
            {
                match get(cfg, &after[..end]) {
                    Some(v) => out.push_str(&v),
                    None => out.push_str(&rest[start..start + 2 + end + 2]),
                }
                rest = &after[end + 2..];
            }
            _ => {
                out.push_str("@@");
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn cfg() -> SshConfig {
        SshConfig::parse(
            "Host fr1 old1\n  HostName 198.51.100.1\n  User deploy\n  Port 2222\nHost fr2\n  HostName 10.9.9.3\n  User deploy\n",
            Path::new("/home/test"),
        )
    }

    #[test]
    fn private_ranges() {
        assert!(is_private_v4("10.1.2.3") && is_private_v4("172.20.0.1") && is_private_v4("192.168.1.1"));
        assert!(!is_private_v4("198.51.100.1") && !is_private_v4("172.32.0.1"));
    }

    #[test]
    fn probe_splits_public_and_tunnel() {
        let t = "2: eth0    inet 198.51.100.7/24 brd 198.51.100.255 scope global eth0\\       valid_lft forever\n3: mesh0    inet 10.9.9.5/32 scope global mesh0\\       valid_lft forever\n4: docker0    inet 172.17.0.1/16 scope global docker0\n===\n1: lo: <LOOPBACK> mtu 65536 link/loopback\n3: mesh0: <POINTOPOINT> mtu 1420 link/none \n";
        assert_eq!(
            parse_probe(t),
            Probe { public: Some("198.51.100.7".into()), mesh: vec!["10.9.9.5".into()] }
        );
    }

    #[test]
    fn values_come_from_the_ssh_config() {
        let c = cfg();
        assert_eq!(get(&c, "hosts.fr1.user").as_deref(), Some("deploy"));
        assert_eq!(get(&c, "hosts.fr1.port").as_deref(), Some("2222"));
        assert_eq!(get(&c, "hosts.fr1.public_ip").as_deref(), Some("198.51.100.1"));
        assert_eq!(get(&c, "hosts.fr1.mesh_ip"), None);
        assert_eq!(get(&c, "hosts.fr2.mesh_ip").as_deref(), Some("10.9.9.3"));
    }

    #[test]
    fn expand_fills_known_tokens_and_keeps_the_others() {
        let c = cfg();
        let s = expand("a=@@hosts.fr1.public_ip@@ b=@@hosts.fr1.mesh_ip@@ c=@@ d=x@@y", &c);
        assert_eq!(s, "a=198.51.100.1 b=@@hosts.fr1.mesh_ip@@ c=@@ d=x@@y");
    }
}
