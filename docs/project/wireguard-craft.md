# WireGuard and VPN, craft-anything study (2026-11-16)

Sources, read on 2026-11-16:
- Linux `drivers/net/wireguard` (third_party/linux, 7.4-rc2);
- `mullvad/gotatun` (main, release 0.10.3, 2026-11-09);
- `mullvad/mullvadvpn-app` (workspace `Cargo.toml`, `talpid-wireguard/Cargo.toml`);
- `cloudflare/boringtun`, `wg(8)` and `wg-quick(8)`.

## Decision: assemble, do not rewrite
gotatun is Mullvad's maintained fork of boringtun: userspace WireGuard in Rust, MPL-2.0 (BSD-3 before 2026-03-05). It is already pinned in `DEPS`. The Mullvad app is a Rust workspace whose `talpid-*` crates hold everything a VPN client needs around the tunnel. The Aphrody VPN is these two stacks assembled, plus our mesh control.

## gotatun code graph (70 Rust files)
- Crate `gotatun`:
  - `noise/`: handshake, session, timers, index_table, rate_limiter, errors (Noise_IK, key rotation, anti-DoS).
  - `device/`: allowed_ips, peer and peer_state, builder, configure, transports, `uapi/` (the `wg` text API) and `daita/`. DAITA is Mullvad's defence against traffic analysis, built on `maybenot`, behind the `daita` feature.
  - `udp/socket/{linux,windows,generic}`: UDP batching per OS.
  - `tun/`: async TUN device, channel, buffer, `pcap` capture.
  - `sleepyinstant/`, `task.rs`, `serialization.rs`.
- Crate `gotatun-packet`: zero-copy decode of ip, ipv4, ipv6, udp, tcp and wg, plus a buffer pool.
- Crate `gotatun-crypto`: x25519; AEAD on `aws-lc-rs` (default) or `ring`.
- Crate `gotatun-cli`: `gotatun [-f] IFACE`, configured with `wg`. It works with `wg-quick` through `WG_QUICK_USERSPACE_IMPLEMENTATION=gotatun` when the kernel module is absent.
- Dependencies: tokio, chacha20poly1305, blake2, hmac, x25519-dalek, zerocopy, parking_lot, ip_network_table, tun, socket2, tracing.
- Latest commits:
  - "noise: use the kernel WireGuard TAI64N epoch for handshake timestamps" (2026-11-04);
  - portable 64-bit atomics (2026-10-28).

## Mullvad app crate graph (what a VPN client needs around the tunnel)
- Tunnel: `talpid-wireguard` (gotatun with the features daita, device and tun), `talpid-tunnel`, `talpid-tunnel-config-client` (post-quantum key exchange with the relay), `tunnel-obfuscation` (gotatun feature).
- Network and OS:
  - routing and DNS: `talpid-routing`, `talpid-dns`, `talpid-net`, `talpid-netstack`;
  - platform: `talpid-winfw` (Windows kill switch), `talpid-windows`, `talpid-macos`, `talpid-cgroup`, `talpid-dbus`.
- Privacy:
  - `mullvad-encrypted-dns-proxy` and `mullvad-masque-proxy` (MASQUE over HTTP/3);
  - `mullvad-leak-checker` and `mullvad-exclude` (split tunnelling).
- Control:
  - `mullvad-daemon`, `mullvad-relay-selector`, `mullvad-management-interface` and `mullvad-cli`;
  - `mullvad-api`, `mullvad-tls-client` and `mullvad-update`.
- Mobile: `mullvad-jni` (Android), `mullvad-ios`.

## Target: the Aphrody VPN
| Layer | Assembled from | Ours |
|---|---|---|
| Data plane | gotatun (noise, device, udp, tun, packet, crypto) | features `device`, `tun` and `daita`, crypto on aws-lc-rs |
| Post-quantum | talpid-tunnel-config-client, Rosenpass | PSK rotated per peer by the PQ exchange |
| Client OS integration | talpid-routing, dns, winfw, net | kill switch, DNS, split tunnelling for PC, Android, servers |
| Obfuscation and censorship | tunnel-obfuscation, masque-proxy, encrypted-dns-proxy | fallback when UDP 51821 is blocked |
| Mesh control | ours (today `mesh.sh` on hub fr1) | peers, keys, ACLs, NAT traversal and direct paths (Tailscale-like), Cloudflare Mesh as fallback relay |
| Exit | fr1 `wg0` Mullvad exit (configured, inactive) | agent browsing egress through Mullvad |
| Ops | `wg` UAPI (gotatun uapi) | `mesh.sh` and `wg show` unchanged |

## Proof plan (each step proven before the next)
1. Pin gotatun 0.10.3 (crate) with the features above. Proof: `cargo tree` on fr1, no duplicate crypto stack.
2. Bring up a gotatun interface on fr2 next to the kernel one. Proof: handshake with the fr1 hub, `wg show`, ping and ssh matrix.
3. Throughput and latency against the kernel module (fr1 to fr2). Proof: iperf3 and CPU figures archived.
4. Windows: replace `wg-win` with gotatun on wintun. Proof: sshd stays reachable from fr1, fr2 and prd.
5. Android: gotatun through JNI (the `mullvad-jni` pattern). Proof: adb over the mesh from all servers.
6. Kill switch, DNS and split tunnelling from the talpid crates. Proof: `mullvad-leak-checker`-style test shows no leak.
7. Mesh control (keys, ACL, direct paths). Proof: PC to phone traffic bypasses fr1, seen with `wg show` endpoints.
