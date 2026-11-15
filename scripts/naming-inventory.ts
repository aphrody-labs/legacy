// Name inventory: every Cargo package/bin/lib, npm package/bin, Python/Go module, just recipe, CI workflow,
// clap subcommand and long flag (static scan of the clap derive definitions), MCP tool name.
// Output: JSON on stdout (or --out <file>). Rules and table: docs/project/naming.md (scripts/naming-check.ts).
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1").replace(/\/$/, "");
const git = (...a: string[]) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8", maxBuffer: 1 << 28 }).stdout.split("\n").filter(Boolean);
const files = git("ls-files").filter(f => !f.startsWith("third_party/"));
const read = (f: string) => { try { return readFileSync(`${root}/${f}`, "utf8"); } catch { return ""; } };
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();

type Entry = { kind: string; name: string; path: string; extra?: string };
const out: Entry[] = [];
const add = (kind: string, name: string, path: string, extra?: string) => out.push({ kind, name, path, extra });

for (const f of files) {
  if (/(^|\/)Cargo\.toml$/.test(f)) {
    let t: any; try { t = Bun.TOML.parse(read(f)); } catch { continue; }
    if (t.package?.name) {
      add("cargo-package", t.package.name, f);
      if (t.lib?.name) add("cargo-lib", t.lib.name, f, t.package.name);
    }
    for (const b of t.bin ?? []) add("cargo-bin", b.name, f, t.package?.name);
  } else if (/(^|\/)package\.json$/.test(f)) {
    let j: any; try { j = JSON.parse(read(f)); } catch { continue; }
    if (j.name) add("npm-package", j.name, f);
    const bins = typeof j.bin === "string" ? { [j.name]: j.bin } : (j.bin ?? {});
    for (const b of Object.keys(bins)) add("npm-bin", b, f, j.name);
  } else if (/(^|\/)pyproject\.toml$/.test(f)) {
    let t: any; try { t = Bun.TOML.parse(read(f)); } catch { continue; }
    const n = t.project?.name ?? t.tool?.poetry?.name;
    if (n) add("python-module", n, f);
    for (const s of Object.keys(t.project?.scripts ?? {})) add("python-script", s, f, n);
  } else if (/(^|\/)go\.mod$/.test(f)) {
    const m = read(f).match(/^module\s+(\S+)/m);
    if (m) add("go-module", m[1], f);
  } else if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(f)) {
    const m = read(f).match(/^name:\s*["']?(.+?)["']?\s*$/m);
    add("ci-workflow", m?.[1] ?? "(unnamed)", f);
  } else if (/\.rs$/.test(f) && /^(src|apps|tools)\//.test(f)) {
    const s = read(f);
    // clap: enums deriving Subcommand -> variants (kebab-cased unless #[command(name = "x")]); long flags
    for (const m of s.matchAll(/derive\([^)]*Subcommand[^)]*\)\][^{]*?enum\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
      const body = m[2]; let pending: string | undefined;
      for (const line of body.split("\n")) {
        const nm = line.match(/#\[command\([^\]]*name\s*=\s*"([^"]+)"/); if (nm) pending = nm[1];
        const al = line.match(/alias(?:es)?\s*=\s*(?:\[([^\]]*)\]|"([^"]+)")/);
        if (al) add("clap-alias", (al[1] ?? al[2]).replace(/["\s]/g, ""), f, m[1]);
        const v = line.match(/^\s{4}([A-Z]\w*)\s*[({,]?/);
        if (v && !line.trim().startsWith("#") && !line.trim().startsWith("///")) { add("clap-subcommand", pending ?? kebab(v[1]), f, m[1]); pending = undefined; }
      }
    }
    for (const m of s.matchAll(/#\[command\([^\]]*\bname\s*=\s*"([^"]+)"/g)) add("clap-command-name", m[1], f);
    for (const m of s.matchAll(/#\[arg\(([^\]]*)\)\]\s*(?:pub\s+)?(\w+)\s*:/g)) {
      const a = m[1]; if (!/\blong\b/.test(a)) continue;
      const l = a.match(/long\s*=\s*"([^"]+)"/); const sh = a.match(/short\s*=\s*'(.)'/) ?? (/\bshort\b/.test(a) ? [0, m[2][0]] : null);
      add("clap-flag", "--" + (l?.[1] ?? kebab(m[2])), f, sh ? "-" + sh[1] : undefined);
    }
  } else if (/^packages\/ai-os\/src\/(relay|mcp)\/.*\.ts$/.test(f)) {
    for (const m of read(f).matchAll(/(?:name|tool)\s*:\s*["']([a-z0-9]+__[a-z0-9_]+|[a-z][a-z0-9_]*)["']\s*,\s*(?:description|title|inputSchema)/g)) add("mcp-tool", m[1], f);
  }
}

// just recipes per justfile (public ones only)
for (const jf of files.filter(f => /(^|\/)(justfile|[^/]+\.just)$/.test(f))) {
  for (const m of read(jf).matchAll(/^(?:\[[^\]]*\]\s*\n)*@?([a-z][a-z0-9_-]*)(?:\s+[^:=\n]*)?:(?!=)/gm)) add("just-recipe", m[1], jf);
}

const outIdx = process.argv.indexOf("--out");
const json = JSON.stringify(out, null, 1);
if (outIdx > 0) await Bun.write(process.argv[outIdx + 1], json); else console.log(json);
const counts: Record<string, number> = {};
for (const e of out) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
console.error(JSON.stringify(counts));
