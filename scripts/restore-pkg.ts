// Restore tool: unpack a package we published (npm tarball or crates.io crate) into the monorepo through restore-import
// (gitleaks gate, never overwrites). In-memory untar, path-sanitised; build output (dist/, *.map) and crate packaging
// leftovers (Cargo.toml.orig, .cargo_vcs_info.json) are dropped.
// Usage: bun scripts/restore-pkg.ts --npm @aphrody/google --to frameworks/google-ts [--version x] [--dry]
//        bun scripts/restore-pkg.ts --crate aphrody-google --to src/google [--version x] [--dry]
import { gunzipSync } from "bun";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const argv = Bun.argv.slice(2);
const opt = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const npm = opt("--npm");
const crate = opt("--crate");
const to = opt("--to")!;
const dry = argv.includes("--dry");
const UA = "aphrody-restore/1.0 (+https://github.com/aphrody-labs/aphrody)";
const name = (npm ?? crate)!;

let url: string; let version = opt("--version");
if (npm) {
  const pk: any = await (await fetch(`https://registry.npmjs.org/${npm.replace("/", "%2f")}`, { headers: { "user-agent": UA } })).json();
  version ??= pk["dist-tags"].latest;
  url = pk.versions[version!].dist.tarball;
} else {
  if (!version) {
    const c: any = await (await fetch(`https://crates.io/api/v1/crates/${crate}`, { headers: { "user-agent": UA } })).json();
    version = c.crate.max_version;
  }
  url = `https://crates.io/api/v1/crates/${crate}/${version}/download`;
}
const tar = gunzipSync(new Uint8Array(await (await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" })).arrayBuffer()));

const out = join(process.env.TEMP ?? "/tmp", "restore", "pkg", name.replace(/[@/]/g, "_"));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const dec = new TextDecoder();
const entries: { path: string; data: Uint8Array }[] = [];
for (let i = 0; i + 512 <= tar.length; ) {
  const h = tar.subarray(i, i + 512);
  if (h.every((x) => x === 0)) break;
  const str = (a: number, b: number) => dec.decode(h.subarray(a, b)).replace(/\0.*$/, "");
  const size = parseInt(str(124, 136).trim() || "0", 8);
  const type = String.fromCharCode(h[156] || 48);
  const prefix = str(345, 500);
  const full = (prefix ? `${prefix}/` : "") + str(0, 100);
  i += 512;
  if (type === "0") entries.push({ path: full, data: tar.subarray(i, i + size) });
  i += Math.ceil(size / 512) * 512;
}
const hasSrc = entries.some((e) => /^[^/]+\/(src|lib)\//.test(e.path) && !/\.d\.ts$/.test(e.path));
let kept = 0;
for (const e of entries) {
  const rel = e.path.split("/").slice(1).join("/");
  if (!rel || rel.split("/").some((s) => s === ".." || s === "") || /^[a-zA-Z]:|^\//.test(rel)) continue;
  if (/\.map$|(^|\/)Cargo\.toml\.orig$|(^|\/)\.cargo_vcs_info\.json$|(^|\/)Cargo\.lock$/.test(rel)) continue;
  if (npm && hasSrc && /^(dist|build)\//.test(rel)) continue;
  const dest = join(out, rel);
  mkdirSync(dirname(dest), { recursive: true });
  await Bun.write(dest, e.data);
  kept++;
}
console.error(`${name}@${version}: ${entries.length} entries, ${kept} kept -> ${out}`);
const r = await Bun.$`bun ${import.meta.dir}/restore-import.ts --dir ${out} --to ${to} ${dry ? ["--dry"] : []}`.nothrow().text();
console.log(r);
