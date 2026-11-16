// monorepo-merge: flatten several upstream repositories (or sub-crates of one) into a single monorepo with a
// provenance lock. Layout by language: Rust -> crates/<name>, TypeScript/JS -> packages/<name>, Zig -> zig/<name>,
// anything else -> extra/<name>. A `crate` source takes one crate of a Cargo workspace plus the closure of its
// path dependencies (e.g. gpui from zed). Upstream HEAD is resolved live; nothing is pinned by hand.
//
// bun tools/monorepo-merge/merge.ts --spec sources.json --out /srv/native-ui
//   sources.json: [{ "repo": "owner/name" }, { "repo": "zed-industries/zed", "crate": "crates/gpui" }]
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values: a } = parseArgs({
  options: { spec: { type: "string" }, out: { type: "string" } },
});
if (!a.spec || !a.out) {
  console.error(
    "usage: bun tools/monorepo-merge/merge.ts --spec sources.json --out <dir>",
  );
  process.exit(2);
}
type Src = { repo: string; crate?: string };
const specs: Src[] = await Bun.file(a.spec).json();
const out = a.out;
const cache = join(out, ".upstream");
mkdirSync(cache, { recursive: true });

const sh = (cmd: string[], cwd?: string) => {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode)
    throw new Error(`${cmd.join(" ")}: ${r.stderr.toString().slice(0, 400)}`);
  return r.stdout.toString().trim();
};
const meta = async (repo: string) =>
  (
    await fetch(`https://api.github.com/repos/${repo}`, {
      headers: Bun.env.GH_TOKEN
        ? { authorization: `Bearer ${Bun.env.GH_TOKEN}` }
        : {},
    })
  ).json() as Promise<any>;

const dirFor = (lang: string | null) =>
  lang === "Rust"
    ? "crates"
    : lang === "TypeScript" || lang === "JavaScript"
      ? "packages"
      : lang === "Zig"
        ? "zig"
        : "extra";

/** Path dependencies of a crate, followed transitively (workspace = true resolved through the root manifest). */
function closure(root: string, crate: string): string[] {
  const rootToml = Bun.file(join(root, "Cargo.toml"));
  const ws = existsSync(join(root, "Cargo.toml"))
    ? (Bun.TOML.parse(
        require("node:fs").readFileSync(join(root, "Cargo.toml"), "utf8"),
      ) as any)
    : {};
  const wsDeps = ws.workspace?.dependencies ?? {};
  const seen = new Set<string>();
  const walk = (dir: string) => {
    if (seen.has(dir)) return;
    seen.add(dir);
    const t = Bun.TOML.parse(
      require("node:fs").readFileSync(join(root, dir, "Cargo.toml"), "utf8"),
    ) as any;
    // plain and platform-specific sections ([target.'cfg(...)'.dependencies] pulls gpui_linux, gpui_macos, ...)
    const tables = [t, ...Object.values<any>(t.target ?? {})];
    for (const tab of tables)
      for (const sec of ["dependencies", "dev-dependencies", "build-dependencies"])
        for (const [name, d] of Object.entries<any>(tab[sec] ?? {})) {
          const dd = d?.workspace ? wsDeps[name] : d;
          if (dd?.path)
            walk(d?.workspace ? dd.path : join(dir, dd.path).replace(/\\/g, "/"));
        }
  };
  void rootToml;
  walk(crate);
  return [...seen];
}

const lock: any[] = [];
// Two sources with the same repository name (aphrody-labs/ui and vercel-labs/ui) get an owner prefix.
const base = (s: Src) =>
  s.crate ? s.crate.split("/").pop()! : s.repo.split("/")[1]!;
const clash = (s: Src) => specs.filter((o) => base(o) === base(s)).length > 1;
for (const s of specs) {
  const m = await meta(s.repo);
  const name = clash(s) ? `${s.repo.split("/")[0]}-${base(s)}` : base(s);
  const src = join(cache, s.repo.replace("/", "__"));
  if (!existsSync(src))
    sh([
      "git",
      "clone",
      "--depth",
      "1",
      "--filter=blob:limit=50m",
      `https://github.com/${s.repo}.git`,
      src,
    ]);
  else sh(["git", "-C", src, "pull", "--ff-only", "-q"]);
  const rev = sh(["git", "-C", src, "rev-parse", "HEAD"]);
  const parts = s.crate ? closure(src, s.crate) : ["."];
  const target = join(out, dirFor(src), s.crate ? "" : name);
  for (const p of parts) {
    const dest = s.crate
      ? join(out, "crates", s.repo.split("/")[1]!, p)
      : target;
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    // git archive keeps exactly the tracked files of that path at HEAD (no .git, no build output)
    const tar = Bun.spawnSync(
      [
        "git",
        "-C",
        src,
        "archive",
        "--format=tar",
        `HEAD:${p === "." ? "" : p}`,
      ],
      { stdout: "pipe" },
    );
    Bun.spawnSync(["tar", "-x", "-C", dest], { stdin: tar.stdout });
    for (const f of ["Cargo.lock"])
      if (p !== "." && existsSync(join(dest, f))) rmSync(join(dest, f));
  }
  if (s.crate) {
    // The copied crates keep `workspace = true` dependencies: re-root the upstream workspace manifest on them.
    const root = join(out, "crates", s.repo.split("/")[1]!);
    let ws = require("node:fs").readFileSync(
      join(src, "Cargo.toml"),
      "utf8",
    ) as string;
    const members = parts.filter((p) => p !== ".").sort();
    ws = ws
      .replace(
        /members = \[[^\]]*\]/,
        `members = [\n${members.map((m) => `    "${m}",\n`).join("")}]`,
      )
      .replace(/default-members = \[[^\]]*\]\n/, "");
    await Bun.write(join(root, "Cargo.toml"), ws);
    for (const f of ["rust-toolchain.toml", "Cargo.lock"])
      if (existsSync(join(src, f)))
        await Bun.write(join(root, f), Bun.file(join(src, f)));
  }
  lock.push({
    repo: s.repo,
    crate: s.crate ?? null,
    rev,
    language: m.language,
    license: m.license?.spdx_id ?? null,
    paths: parts,
    description: m.description,
  });
  console.log(
    `${s.repo}${s.crate ? `:${s.crate}` : ""} @ ${rev.slice(0, 9)} -> ${parts.length} path(s)`,
  );
}
await Bun.write(
  join(out, "monorepo.lock.json"),
  `${JSON.stringify(lock, null, 2)}\n`,
);
console.log(`lock: ${lock.length} sources -> ${out}`);
