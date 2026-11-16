// `just gnu-check <id>`: the GNU testsuite of package <id>, GNU binary against ours, and system/gnu/<id>/PROOF.md.
//   build on fr1 (ssh <fr1>) -> binary relayed to fr2 (ssh <fr2>) -> scripts/gnu-proof.sh on fr2 -> PROOF.md here.
// First-party ports only (system/gnu/<id>/Cargo.toml: which time bc ed m4). Rust rewrites carried as forks
// (coreutils, findutils, diffutils, sed, grep, tar, gawk) keep their upstream harness; see their PROOF.md.
// Rule (docs/native/gnu/OS.md 5): replaced only when the pass rate reaches the Rust reference (coreutils 94.0 %).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const [id] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const FR1 = "vps";
const FR2 = "cdn";
const WS = "/srv/build/gnu-rust";
const REFERENCE = 94.0;

if (!id || !existsSync(join(root, `system/gnu/${id}/Cargo.toml`))) {
  console.error("usage: bun scripts/gnu-check.ts <id>   (id: a first-party port under system/gnu/)");
  process.exit(2);
}

let tmpN = 0;
const ssh = (host: string, cmd: string, stdin?: Uint8Array | string, timeout = 600_000) => {
  let input: "ignore" | ReturnType<typeof Bun.file> = "ignore";
  if (stdin !== undefined) {
    const f = join(tmpdir(), `gnu-check-${process.pid}-${tmpN++}`);
    writeFileSync(f, stdin);
    input = Bun.file(f);
  }
  const p = Bun.spawnSync(["ssh", host, cmd], { stdin: input, timeout });
  if (p.exitCode !== 0) throw new Error(`ssh ${host} (${cmd.slice(0, 60)}): exit ${p.exitCode}\n${p.stderr.toString().slice(0, 600)}`);
  return p.stdout;
};

const pkgs = readFileSync(join(root, "system/gnu/packages.toml"), "utf8");
const pkg = (key: string) => (pkgs.match(new RegExp(`\\[package\\.${id}\\][^\\[]*?\\n${key} = "([^"]*)"`)) ?? [])[1] ?? "";
const [version, sha256] = [pkg("version"), pkg("sha256")];

// 1. fr1: sources of system/gnu + a scratch workspace root (the repo root lists members explicitly), release build of the package
const members = ["rt", "posix-re", "which", "time", "ed", "bc", "m4"].filter((m) => existsSync(join(root, `system/gnu/${m}/Cargo.toml`)));
const rootToml = `[workspace]
resolver = "3"
members = [${members.map((m) => `"system/gnu/${m}"`).join(", ")}]

[workspace.package]
version = "0.4.0"
edition = "2024"
license = "MIT OR Apache-2.0"
authors = ["aphrody-dev"]
repository = "https://github.com/aphrody-labs/ay"

[workspace.dependencies]
regex = "1.13.1"
libc = "0.2.191"

[workspace.lints.rust]
unsafe_op_in_unsafe_fn = "deny"
unused_must_use = "deny"

[workspace.lints.clippy]
all = { level = "warn", priority = -1 }

[profile.release]
opt-level = 3
lto = "thin"
codegen-units = 1
panic = "abort"
strip = "symbols"
`;
const tar = Bun.spawnSync(["tar", "-cf", "-", "-C", root, "system/gnu"]);
ssh(FR1, `mkdir -p ${WS}/ws && rm -rf ${WS}/ws/src && tar -x -C ${WS}/ws`, tar.stdout);
ssh(FR1, `cat > ${WS}/ws/Cargo.toml`, rootToml);
console.log(`fr1: build aphrody-gnu-${id}`);
// own CARGO_HOME: the shared one is locked for long stretches by the other agents' builds on fr1; pipefail so a failed build stops the check
ssh(FR1, `set -o pipefail; RUSTC_WRAPPER= CARGO_BUILD_RUSTC_WRAPPER= CARGO_HOME=${WS}/cargo-home RUSTFLAGS="-C target-cpu=x86-64-v3" CARGO_TARGET_DIR=${WS}/target/ws cargo build --release --manifest-path ${WS}/ws/Cargo.toml --workspace 2>&1 | tail -3`);
const fr1 = ssh(FR1, "hostname").toString().trim();

// hyperfine for the benchmark (fr2 has none): relayed once from fr1
if (!ssh(FR2, `test -x ${WS}/hyperfine && echo y || echo n`).toString().startsWith("y")) {
  ssh(FR2, `cat > ${WS}/hyperfine && chmod +x ${WS}/hyperfine`, ssh(FR1, "cat /home/ubuntu/.cargo/bin/hyperfine"));
}

// 2. relay the binary fr1 -> fr2 (fr1 and fr2 do not reach each other: the PC pipes)
const bin = ssh(FR1, `cat ${WS}/target/ws/release/${id}`);
ssh(FR2, `mkdir -p ${WS}/target/ws/release && cat > ${WS}/target/ws/release/${id} && chmod +x ${WS}/target/ws/release/${id}`, bin);

// 3. fr2: the GNU testsuite, both binaries
console.log(`fr2: GNU ${id} ${version} testsuite`);
ssh(FR2, `cat > ${WS}/gnu-proof.sh`, readFileSync(join(root, "scripts/gnu-proof.sh")));
ssh(FR2, `bash ${WS}/gnu-proof.sh ${id} ${version} ${sha256}`, undefined, 3_600_000);
const kv: Record<string, string> = {};
for (const l of ssh(FR2, `cat ${WS}/log/proof-${id}.txt`).toString().split("\n")) {
  const i = l.indexOf("=");
  if (i > 0) kv[l.slice(0, i)] = l.slice(i + 1);
}
if (kv.error) throw new Error(kv.error);

// 4. PROOF.md: the quadruplet of docs/native/gnu/OS.md rule 8
const num = (s: string | undefined, k: string) => Number((s ?? "").match(new RegExp(`${k}=(\\d+)`))?.[1] ?? NaN);
const THRESHOLD: Record<string, number> = { m4: 100, ed: 100, sed: 100 };
const thr = THRESHOLD[id] ?? REFERENCE;
let rows = "";
let passRate = NaN;
let skipDelta = 0;
let errors = 0;
let detail = "";
const bytes = `| binaire (octets, release) | ${kv.gnu_bytes} | ${kv.ours_bytes} |\n`;
if (kv.ours?.includes("total=")) {
  const [gt, gs, ot, ox, os, op, oe] = [num(kv.gnu, "total"), num(kv.gnu, "skip"), num(kv.ours, "total"), num(kv.ours, "xfail"), num(kv.ours, "skip"), num(kv.ours, "pass"), num(kv.ours, "error")];
  passRate = (100 * op) / Math.max(1, ot - ox);
  skipDelta = (100 * os) / ot - (100 * gs) / gt;
  errors = oe;
  rows += `| testsuite GNU (automake) : PASS / (TOTAL - XFAIL) | ${num(kv.gnu, "pass")} / ${gt - num(kv.gnu, "xfail")} | ${op} / ${ot - ox} |\n| SKIP | ${gs} / ${gt} | ${os} / ${ot} |\n`;
  if (kv.ours_failed) detail += `Failures: ${kv.ours_failed.trim()}\n`;
} else if (kv.differential) {
  const [p, t] = [num(kv.differential, "pass"), num(kv.differential, "total")];
  passRate = (100 * p) / Math.max(1, t);
  rows += `| differential (same stdout and exit code as GNU) | ${t} / ${t} (référence) | ${p} / ${t} |\n`;
  if (kv.differential_failed?.trim()) detail += `Diffs: ${kv.differential_failed.trim()}\n`;
} else if (kv.ours_scripts_failed) {
  const [nf, nt] = (kv.ours_scripts_failed.match(/(\d+) of (\d+)/) ?? []).slice(1).map(Number);
  const lines = (kv.ours_failed_lines ?? "").trim().split(/\s+/).filter(Boolean).length;
  passRate = kv.ours_rc === "0" ? 100 : (100 * (nt - nf)) / Math.max(1, nt);
  errors = nf + lines;
  rows += `| GNU testsuite (check.sh): scripts passed / total | ${nt} / ${nt} (rc ${kv.gnu_rc}) | ${nt - nf} / ${nt} (rc ${kv.ours_rc}) |\n| failed check.sh assertions | 0 | ${lines} |\n`;
  detail += `Last line of check.sh: ${kv.ours_tail ?? ""}\n`;
} else if (kv.ours_total_checks) {
  const [tot, gsk, osk, gf, of] = [Number(kv.ours_total_checks), Number(kv.gnu_skipped_checks), Number(kv.ours_skipped_checks), Number(kv.gnu_failed_checks), Number(kv.ours_failed_checks)];
  passRate = (100 * (tot - osk - of)) / Math.max(1, tot - osk);
  skipDelta = (100 * (osk - gsk)) / tot;
  errors = of;
  rows += `| m4 checks/: passed / run | ${tot - gsk - gf} / ${tot - gsk} | ${tot - osk - of} / ${tot - osk} |\n| skipped checks | ${gsk} / ${tot} | ${osk} / ${tot} |\n`;
}
const smoke = "not measured";
const perf = kv.bench ? `\nPerformance (hyperfine, 15 runs, fr2; GNU C at -O3 -march=x86-64-v3, Rust at -O3 x86-64-v3 ThinLTO, CachyOS model) : ${kv.bench}.\n` : "";
const ok = passRate >= thr && skipDelta <= 1 && errors === 0;
const fmt = (x: number) => (Number.isNaN(x) ? "?" : x.toFixed(1));
const verdict = Number.isNaN(passRate)
  ? "not evaluated (no measurement)"
  : ok
    ? `compliant on three measurements (pass_rate ${fmt(passRate)} % ≥ ${thr} %, max_skip_delta ${skipDelta >= 0 ? "+" : ""}${fmt(skipDelta)} % ≤ +1 %, error_count 0) ; critical_smoke ${smoke} : no definitive verdict`
    : `not replaced: pass_rate ${fmt(passRate)} % (threshold ${thr} %), max_skip_delta ${skipDelta >= 0 ? "+" : ""}${fmt(skipDelta)} % (≤ +1 %), error_count ${errors} (0 required)`;
const md = `# Proof: ${id} ${version}

Generated by \`just gnu-check ${id}\` on ${kv.date}. Build: fr1 (${fr1}), tests: fr2 (${kv.host}), sandbox: ${kv.sandbox}. GNU source: ftp.gnu.org/gnu/${id}/${id}-${version}.tar.*, sha256 ${sha256} (GSRC, docs/research/gsrc-gnu.json). Crate: \`aphrody-gnu-${id}\` (system/gnu/${id}).

| Measure | GNU ${version} | Aphrody |
| --- | --- | --- |
${rows}${bytes}
Quadruplet (docs/native/gnu/OS.md rule 8):

| Measure | Value | Requirement |
| --- | --- | --- |
| pass_rate | ${fmt(passRate)} % | ≥ ${thr} % |
| max_skip_delta | ${skipDelta >= 0 ? "+" : ""}${fmt(skipDelta)} % | ≤ +1 % |
| error_count | ${errors} | 0 |
| critical_smoke | ${smoke} | 100 % on real configure scripts |

${detail}${perf}
Verdict: ${verdict}.
`;
mkdirSync(join(root, `system/gnu/${id}`), { recursive: true });
writeFileSync(join(root, `system/gnu/${id}/PROOF.md`), md.replace(/\n{3,}/g, "\n\n"));
console.log(`system/gnu/${id}/PROOF.md: ${verdict}`);
