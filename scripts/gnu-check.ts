// `just gnu-check <id>`: the GNU testsuite of package <id>, GNU binary against ours, and src/gnu/<id>/PROOF.md.
//   build on fr1 (ssh vps) -> binary relayed to fr2 (ssh cdn) -> scripts/gnu-proof.sh on fr2 -> PROOF.md here.
// First-party ports only (src/gnu/<id>/Cargo.toml: which time bc ed m4). Rust rewrites carried as forks
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

if (!id || !existsSync(join(root, `src/gnu/${id}/Cargo.toml`))) {
  console.error("usage: bun scripts/gnu-check.ts <id>   (id: a first-party port under src/gnu/)");
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

const pkgs = readFileSync(join(root, "src/gnu/packages.toml"), "utf8");
const pkg = (key: string) => (pkgs.match(new RegExp(`\\[package\\.${id}\\][^\\[]*?\\n${key} = "([^"]*)"`)) ?? [])[1] ?? "";
const [version, sha256] = [pkg("version"), pkg("sha256")];

// 1. fr1: sources of src/gnu + a scratch workspace root (the repo root lists members explicitly), release build of the package
const members = ["posix-re", "which", "time", "ed", "bc", "m4"].filter((m) => existsSync(join(root, `src/gnu/${m}/Cargo.toml`)));
const rootToml = `[workspace]
resolver = "3"
members = [${members.map((m) => `"src/gnu/${m}"`).join(", ")}]

[workspace.package]
version = "0.4.0"
edition = "2024"
license = "MIT OR Apache-2.0"
authors = ["aphrody-dev"]
repository = "https://github.com/aphrody-labs/aphrody"

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
lto = "fat"
codegen-units = 1
panic = "abort"
strip = "symbols"
`;
const tar = Bun.spawnSync(["tar", "-cf", "-", "-C", root, "src/gnu"]);
ssh(FR1, `mkdir -p ${WS}/ws && rm -rf ${WS}/ws/src && tar -x -C ${WS}/ws`, tar.stdout);
ssh(FR1, `cat > ${WS}/ws/Cargo.toml`, rootToml);
console.log(`fr1: build aphrody-gnu-${id}`);
ssh(FR1, `RUSTC_WRAPPER= CARGO_BUILD_RUSTC_WRAPPER= CARGO_TARGET_DIR=${WS}/target/ws cargo build --release --manifest-path ${WS}/ws/Cargo.toml -p aphrody-gnu-${id} 2>&1 | tail -3`);
const fr1 = ssh(FR1, "hostname").toString().trim();

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

// 4. PROOF.md
const num = (s: string | undefined, k: string) => Number((s ?? "").match(new RegExp(`${k}=(\\d+)`))?.[1] ?? NaN);
let rows = "";
let rate = NaN;
const bytes = `| binaire (octets, release) | ${kv.gnu_bytes} | ${kv.ours_bytes} |\n`;
if (kv.ours?.includes("total=")) {
  const [gt, gp, gs, ot, op, os] = [num(kv.gnu, "total"), num(kv.gnu, "pass"), num(kv.gnu, "skip"), num(kv.ours, "total"), num(kv.ours, "pass"), num(kv.ours, "skip")];
  rate = (100 * op) / Math.max(1, ot - os);
  rows += `| testsuite GNU (automake) : réussis / exécutés | ${gp} / ${gt - gs} | ${op} / ${ot - os} |\n`;
  if (kv.ours_failed) rows += `\nÉchecs : ${kv.ours_failed}\n`;
} else if (kv.differential) {
  const [p, t] = [num(kv.differential, "pass"), num(kv.differential, "total")];
  rate = (100 * p) / Math.max(1, t);
  rows += `| différentiel (même stdout et même code de sortie que GNU) | ${t} / ${t} (référence) | ${p} / ${t} |\n`;
  if (kv.differential_failed?.trim()) rows += `\nÉcarts : ${kv.differential_failed.trim()}\n`;
} else {
  rows += `| testsuite GNU (${id}) | rc ${kv.gnu_rc ?? "?"} | rc ${kv.ours_rc ?? "?"} |\n`;
  rows += `\nGNU : ${kv.gnu_tail ?? kv.gnu_failed_lines ?? ""}\nAphrody : ${kv.ours_tail ?? ""} ; lignes en échec : ${kv.ours_failed_lines ?? ""}\n`;
  if (kv.gnu_rc === "0" && kv.ours_rc === "0") rate = 100;
}
const verdict = Number.isNaN(rate)
  ? "non évalué (pas de taux comparable)"
  : rate >= REFERENCE
    ? `remplacé : ${rate.toFixed(1)} % ≥ ${REFERENCE} %`
    : `non remplacé : ${rate.toFixed(1)} % < ${REFERENCE} % (référence : uutils coreutils)`;
const md = `# Preuve : ${id} ${version}

Généré par \`just gnu-check ${id}\` le ${kv.date}. Build : fr1 (${fr1}), tests : fr2 (${kv.host}). Source GNU : ftp.gnu.org/gnu/${id}/${id}-${version}.tar.*, sha256 ${sha256} (GSRC, docs/research/gsrc-gnu-2026-11-14.json). Crate : \`aphrody-gnu-${id}\` (src/gnu/${id}).

| Mesure | GNU ${version} | Aphrody |
| --- | --- | --- |
${rows.startsWith("|") ? rows.split("\n").filter((l) => l.startsWith("|")).join("\n") + "\n" : ""}${bytes}
${rows.split("\n").filter((l) => !l.startsWith("|")).join("\n").trim()}

Verdict (docs/native/gnu/OS.md règle 5) : ${verdict}.
`;
mkdirSync(join(root, `src/gnu/${id}`), { recursive: true });
writeFileSync(join(root, `src/gnu/${id}/PROOF.md`), md);
console.log(`src/gnu/${id}/PROOF.md: ${verdict}`);
