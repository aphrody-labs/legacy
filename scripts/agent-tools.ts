#!/usr/bin/env bun
// Rust and C/C++ tools coding agents use on a build host: language servers (Claude Code's LSP plugins
// rust-analyzer-lsp and clangd-lsp start them), test runner, linkers, caches, compile database, lint and search.
//   bun scripts/agent-tools.ts status [host...]    what each host has (default hosts: fr1 fr2)
//   bun scripts/agent-tools.ts install [host...]   install what is missing: crates with cargo-binstall (prebuilt),
//                                                  LLVM tools from the newest versioned apt package the host offers
// Hosts are ssh aliases; "local" runs on this machine. Versions are whatever the registries serve now.
import { $ } from "bun";

type Tool = { bin: string; crate?: string; apt?: string; why: string };

const tools: Tool[] = [
  { bin: "rust-analyzer", why: "Rust LSP (rustup component)" },
  { bin: "cargo-nextest", crate: "cargo-nextest", why: "parallel test runner" },
  { bin: "bacon", crate: "bacon", why: "background check/clippy loop" },
  { bin: "sccache", crate: "sccache", why: "Rust and C/C++ compile cache" },
  { bin: "mold", apt: "mold", why: "fast ELF linker" },
  { bin: "wild", crate: "wild-linker", why: "incremental-first ELF linker" },
  { bin: "cargo-deny", crate: "cargo-deny", why: "dependency policy" },
  { bin: "cargo-machete", crate: "cargo-machete", why: "unused dependencies" },
  { bin: "ast-grep", crate: "ast-grep", why: "structural search and rewrite" },
  { bin: "clangd", apt: "clangd", why: "C/C++ LSP" },
  { bin: "clang-tidy", apt: "clang-tidy", why: "C/C++ lint" },
  { bin: "ccache", apt: "ccache", why: "C/C++ compile cache" },
  { bin: "bear", apt: "bear", why: "compile_commands.json for clangd" },
];

const [cmd = "status", ...args] = process.argv.slice(2);
const hosts = args.length ? args : ["fr1", "fr2"];

async function sh(host: string, script: string, check = true): Promise<string> {
  const argv =
    host === "local"
      ? ["bash", "-lc", script]
      : ["timeout", "900", "ssh", host, `bash -lc ${JSON.stringify(script)}`];
  const p = Bun.spawn(argv, {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (check && code !== 0)
    throw new Error(
      `${host}: ${script.slice(0, 80)}: ${err.trim() || `exit ${code}`}`,
    );
  return out.trim();
}

async function missing(host: string): Promise<Tool[]> {
  const have = await sh(
    host,
    tools
      .map((t) => `command -v ${t.bin} >/dev/null && echo ${t.bin}`)
      .join("; "),
    false,
  );
  const set = new Set(have.split("\n"));
  return tools.filter((t) => !set.has(t.bin));
}

/**
 * The newest installable package for a tool: for LLVM tools the versioned names (`clangd-23`, `clangd-22`, ...)
 * highest first, then the plain name; the first one apt can resolve (a dry run) wins.
 */
async function aptName(host: string, pkg: string): Promise<string> {
  if (!["clangd", "clang-tidy"].includes(pkg)) return pkg;
  const names = await sh(
    host,
    `apt-cache pkgnames ${pkg}- | grep -E '^${pkg}-[0-9]+$' || true`,
    false,
  );
  const versioned = names
    .split("\n")
    .filter(Boolean)
    .sort((a, b) => Number(b.split("-").pop()) - Number(a.split("-").pop()));
  for (const name of [...versioned, pkg]) {
    if (
      (await sh(
        host,
        `apt-get install -s -qq ${name} >/dev/null 2>&1 && echo ok`,
        false,
      )) === "ok"
    )
      return name;
  }
  return pkg;
}

async function install(host: string): Promise<void> {
  const todo = await missing(host);
  const crates = todo.filter((t) => t.crate).map((t) => t.crate!);
  const apt = await Promise.all(
    todo.filter((t) => t.apt).map((t) => aptName(host, t.apt!)),
  );
  if (todo.some((t) => t.bin === "rust-analyzer"))
    await sh(host, "rustup component add rust-analyzer");
  if (crates.length)
    await sh(host, `cargo binstall -y --disable-telemetry ${crates.join(" ")}`);
  if (apt.length) {
    await sh(
      host,
      `sudo -n DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ${apt.join(" ")}`,
    );
    // Versioned LLVM packages install clangd-N / clang-tidy-N; link the plain names the LSP plugins start.
    for (const name of apt.filter((n) => /-\d+$/.test(n))) {
      const plain = name.replace(/-\d+$/, "");
      await sh(
        host,
        `command -v ${plain} >/dev/null || sudo -n ln -sf "$(command -v ${name})" /usr/local/bin/${plain}`,
      );
    }
  }
}

async function status(host: string): Promise<string> {
  const lack = new Set((await missing(host)).map((t) => t.bin));
  return `${host}: ${tools.map((t) => `${lack.has(t.bin) ? "--" : "ok"} ${t.bin}`).join("  ")}`;
}

if (cmd === "install") await Promise.all(hosts.map(install));
else if (cmd !== "status") {
  console.error("usage: agent-tools.ts status|install [host...]");
  process.exit(2);
}
for (const line of await Promise.all(hosts.map(status))) console.log(line);
