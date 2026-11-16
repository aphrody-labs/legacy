// Applies the [[move]] rows of tools/layout.toml: renames each path, then rewrites every textual reference to it.
// usage: bun scripts/relayout.ts apply | check | table [--write]
import { existsSync, statSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(import.meta.dir, "..");
const cfg = Bun.TOML.parse(readFileSync(join(root, "tools/layout.toml"), "utf8")) as {
  area: { dir: string; role: string; why: string }[];
  move: { from: string; to: string }[];
};
const mode = Bun.argv[2] ?? "check";

const moves = [...cfg.move].sort((a, b) => b.from.length - a.from.length);
const map = new Map(moves.map((m) => [m.from, m.to]));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A path starts after a non-path char, `./`, `../`, the checkout folder or a variable; it ends before a non-path char.
const re = new RegExp(
  `(?<=^|[^\\w./\\-]|\\.\\./|(?<![\\w.])\\./|(?:(?<!\\bdocs)(?<!apps/[\\w-]+)/)|\\$\\{?\\w+\\}?/)(${moves.map((m) => esc(m.from)).join("|")})(?=$|[^\\w\\-.]|\\.(?!\\w))`,
  "gm",
);

const git = (args: string[]) => {
  const r = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  return r.stdout.toString();
};
const SKIP = [/^docs\/proofs\//, /^tools\/layout\.toml$/, /^scripts\/relayout\.ts$/, /^third_party\//, /^Cargo\.lock$/, /^bun\.lock$/, /^uv\.lock$/, /restore-inventory\.json$/, /^apps\/(rosegriffon|shenron)\//];
const files = () =>
  git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
    .split("\0")
    .filter((f) => f && !SKIP.some((s) => s.test(f)) && existsSync(join(root, f)) && statSync(join(root, f)).isFile());
const isText = (buf: Buffer) => !buf.subarray(0, 8192).includes(0);

if (mode === "table") {
  const rows = ["| Directory | Content | Why |", "| --- | --- | --- |"];
  for (const a of [...cfg.area].sort((x, y) => x.dir.localeCompare(y.dir)))
    rows.push(`| \`${a.dir}/\` | ${a.role} | ${a.why} |`);
  const table = rows.join("\n");
  if (Bun.argv.includes("--write")) {
    const p = join(root, "docs/project/layout.md");
    const doc = readFileSync(p, "utf8");
    const out = doc.replace(/(<!-- layout:begin -->\r?\n)[\s\S]*?(\r?\n<!-- layout:end -->)/, `$1${table}$2`);
    if (!doc.includes("<!-- layout:begin -->")) throw new Error("markers layout:begin/end not found in docs/project/layout.md");
    writeFileSync(p, out);
  } else console.log(table);
} else if (mode === "apply") {
  let renamed = 0;
  for (const m of cfg.move) {
    const from = join(root, m.from);
    if (!existsSync(from)) continue;
    mkdirSync(dirname(join(root, m.to)), { recursive: true });
    renameSync(from, join(root, m.to));
    renamed++;
  }
  let changed = 0;
  const touched: string[] = [];
  for (const f of files()) {
    const p = join(root, f);
    const buf = readFileSync(p);
    if (buf.length > 8_000_000 || !isText(buf)) continue;
    const src = buf.toString("utf8");
    const out = src.replace(re, (x) => map.get(x) ?? x);
    if (out !== src) {
      writeFileSync(p, out);
      changed++;
      touched.push(f);
    }
  }
  writeFileSync(join(root, "var/relayout-touched.txt"), touched.join("\n"));
  console.log(`renamed ${renamed} paths, rewrote ${changed} files (list: var/relayout-touched.txt)`);
} else {
  let bad = 0;
  for (const m of cfg.move) if (existsSync(join(root, m.from))) (console.log(`exists: ${m.from}`), bad++);
  for (const f of files()) {
    const buf = readFileSync(join(root, f));
    if (buf.length > 8_000_000 || !isText(buf)) continue;
    const src = buf.toString("utf8");
    for (const [i, line] of src.split("\n").entries()) {
      re.lastIndex = 0;
      if (re.test(line)) (console.log(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`), bad++);
    }
  }
  console.log(bad ? `${bad} stale` : "layout ok");
  process.exit(bad ? 1 : 0);
}
