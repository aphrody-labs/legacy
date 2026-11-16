// Restore tool: copy the tracked files of a repo (GitHub, depth 1) or of a directory into the monorepo.
// Never overwrites: identical files are skipped, differing files are reported as conflicts (the monorepo copy is kept).
// Gate: gitleaks on the source tree first; files with findings are not copied (reported by path and rule, never by value).
// --overwrite replaces differing files (only for directories created by the same restore run).
// Usage: bun scripts/restore-import.ts --repo owner/name --to packages/x [--from sub] [--skip regex] [--dry] [--ref branch]
//        bun scripts/restore-import.ts --dir <path> --to <dest> ...
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const argv = Bun.argv.slice(2);
const opt = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const all = (k: string) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
const repo = opt("--repo");
const dir = opt("--dir");
const to = opt("--to")!;
const from = (opt("--from") ?? "").replace(/^\/|\/$/g, "");
const skip = all("--skip").map((r) => new RegExp(r));
const dry = argv.includes("--dry");
const overwrite = argv.includes("--overwrite"); // history copies are newer than archived repo copies: replace differing files
const ref = opt("--ref");
const root = join(import.meta.dir, "..").replace(/\\/g, "/");
const tmp = join(process.env.TEMP ?? "/tmp", "restore", "full");
mkdirSync(tmp, { recursive: true });

let src: string;
if (repo) {
  src = join(tmp, repo.replace("/", "__"));
  if (!existsSync(join(src, ".git"))) {
    const r = await Bun.$`bash ${process.env.HOME}/.local/bin/gh repo clone ${repo} ${src} -- --depth 1 -q ${ref ? ["-b", ref] : []}`.nothrow().quiet();
    if (r.exitCode) { console.error(`clone failed: ${r.stderr.toString().slice(0, 200)}`); process.exit(2); }
  }
} else if (dir) src = dir;
else { console.error("need --repo or --dir"); process.exit(2); }

const files = repo
  ? (await Bun.$`git -C ${src} ls-files -z`.quiet().text()).split("\0").filter(Boolean)
  : [...new Bun.Glob("**/*").scanSync({ cwd: src, dot: true, onlyFiles: true })].map((p) => p.replace(/\\/g, "/")).filter((f) => !/(^|\/)(node_modules|target|\.git)\//.test(f));
const picked = files.filter((f) => (!from || f.startsWith(`${from}/`)) && !skip.some((r) => r.test(f)));

// Secret gate on the source tree.
const leakFiles = new Map<string, string>();
const report = join(tmp, `${(repo ?? "dir").replace("/", "__")}.leaks.json`);
const gl = await Bun.$`gitleaks dir ${from ? join(src, from) : src} --no-banner --redact=100 -f json -r ${report} --exit-code 0`.nothrow().quiet();
if (existsSync(report)) {
  for (const f of JSON.parse(readFileSync(report, "utf8")) as { File: string; RuleID: string }[]) {
    const rel = f.File.replace(/\\/g, "/").replace(`${(from ? join(src, from) : src).replace(/\\/g, "/")}/`, "");
    leakFiles.set(from ? `${from}/${rel}` : rel, f.RuleID);
  }
}

const res = { source: repo ?? dir, to, written: 0, identical: 0, conflicts: [] as string[], secrets: [...leakFiles].map(([f, r]) => `${f} (${r})`), skippedLarge: [] as string[] };
for (const f of picked) {
  if (leakFiles.has(f)) continue;
  const abs = join(src, f);
  const st = statSync(abs);
  if (!st.isFile()) continue; // gitlinks (submodules) are not copied
  if (st.size > 3_000_000) { res.skippedLarge.push(f); continue; }
  const rel = from ? f.slice(from.length + 1) : f;
  const dest = join(root, to, rel);
  const data = readFileSync(abs);
  if (existsSync(dest)) {
    if (Buffer.compare(readFileSync(dest), data) === 0) { res.identical++; continue; }
    if (!overwrite) { res.conflicts.push(rel); continue; }
    if (!dry) await Bun.write(dest, data);
    res.written++;
    continue;
  }
  if (!dry) { mkdirSync(dirname(dest), { recursive: true }); await Bun.write(dest, data); }
  res.written++;
}
console.log(JSON.stringify(res, null, 1));
