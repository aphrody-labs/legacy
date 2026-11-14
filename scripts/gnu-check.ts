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
const members = ["rt", "posix-re", "which", "time", "ed", "bc", "m4"].filter((m) => existsSync(join(root, `src/gnu/${m}/Cargo.toml`)));
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
ssh(FR1, `RUSTC_WRAPPER= CARGO_BUILD_RUSTC_WRAPPER= CARGO_TARGET_DIR=${WS}/target/ws cargo build --release --manifest-path ${WS}/ws/Cargo.toml --workspace 2>&1 | tail -3`);
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
  if (kv.ours_failed) detail += `Échecs : ${kv.ours_failed.trim()}\n`;
} else if (kv.differential) {
  const [p, t] = [num(kv.differential, "pass"), num(kv.differential, "total")];
  passRate = (100 * p) / Math.max(1, t);
  rows += `| différentiel (même stdout et même code de sortie que GNU) | ${t} / ${t} (référence) | ${p} / ${t} |\n`;
  if (kv.differential_failed?.trim()) detail += `Écarts : ${kv.differential_failed.trim()}\n`;
} else if (kv.ours_scripts_failed) {
  const [nf, nt] = (kv.ours_scripts_failed.match(/(\d+) of (\d+)/) ?? []).slice(1).map(Number);
  const lines = (kv.ours_failed_lines ?? "").trim().split(/\s+/).filter(Boolean).length;
  passRate = kv.ours_rc === "0" ? 100 : (100 * (nt - nf)) / Math.max(1, nt);
  errors = nf + lines;
  rows += `| testsuite GNU (check.sh) : scripts réussis / total | ${nt} / ${nt} (rc ${kv.gnu_rc}) | ${nt - nf} / ${nt} (rc ${kv.ours_rc}) |\n| assertions en échec de check.sh | 0 | ${lines} |\n`;
  detail += `Dernière ligne de check.sh : ${kv.ours_tail ?? ""}\n`;
} else if (kv.ours_total_checks) {
  const [tot, gsk, osk, gf, of] = [Number(kv.ours_total_checks), Number(kv.gnu_skipped_checks), Number(kv.ours_skipped_checks), Number(kv.gnu_failed_checks), Number(kv.ours_failed_checks)];
  passRate = (100 * (tot - osk - of)) / Math.max(1, tot - osk);
  skipDelta = (100 * (osk - gsk)) / tot;
  errors = of;
  rows += `| checks/ de m4 : réussis / exécutés | ${tot - gsk - gf} / ${tot - gsk} | ${tot - osk - of} / ${tot - osk} |\n| checks ignorés | ${gsk} / ${tot} | ${osk} / ${tot} |\n`;
}
const smoke = "non mesuré";
const ok = passRate >= thr && skipDelta <= 1 && errors === 0;
const fmt = (x: number) => (Number.isNaN(x) ? "?" : x.toFixed(1));
const verdict = Number.isNaN(passRate)
  ? "non évalué (aucune mesure)"
  : ok
    ? `conforme sur trois mesures (pass_rate ${fmt(passRate)} % ≥ ${thr} %, max_skip_delta ${skipDelta >= 0 ? "+" : ""}${fmt(skipDelta)} % ≤ +1 %, error_count 0) ; critical_smoke ${smoke} : pas de verdict définitif`
    : `non remplacé : pass_rate ${fmt(passRate)} % (seuil ${thr} %), max_skip_delta ${skipDelta >= 0 ? "+" : ""}${fmt(skipDelta)} % (≤ +1 %), error_count ${errors} (0 requis)`;
const md = `# Preuve : ${id} ${version}

Généré par \`just gnu-check ${id}\` le ${kv.date}. Build : fr1 (${fr1}), tests : fr2 (${kv.host}), bac à sable : ${kv.sandbox}. Source GNU : ftp.gnu.org/gnu/${id}/${id}-${version}.tar.*, sha256 ${sha256} (GSRC, docs/research/gsrc-gnu-2026-11-14.json). Crate : \`aphrody-gnu-${id}\` (src/gnu/${id}).

| Mesure | GNU ${version} | Aphrody |
| --- | --- | --- |
${rows}${bytes}
Quadruplet (docs/native/gnu/OS.md règle 8) :

| Mesure | Valeur | Exigence |
| --- | --- | --- |
| pass_rate | ${fmt(passRate)} % | ≥ ${thr} % |
| max_skip_delta | ${skipDelta >= 0 ? "+" : ""}${fmt(skipDelta)} % | ≤ +1 % |
| error_count | ${errors} | 0 |
| critical_smoke | ${smoke} | 100 % sur de vrais scripts configure |

${detail}
Verdict : ${verdict}.
`;
mkdirSync(join(root, `src/gnu/${id}`), { recursive: true });
writeFileSync(join(root, `src/gnu/${id}/PROOF.md`), md.replace(/\n{3,}/g, "\n\n"));
console.log(`src/gnu/${id}/PROOF.md: ${verdict}`);
