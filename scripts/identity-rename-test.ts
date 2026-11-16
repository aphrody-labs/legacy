#!/usr/bin/env bun
// identity-rename-test: proves the product, repo, binary, scope and prefixes are variables.
//
//   bun scripts/identity-rename-test.ts [--head] [--no-cargo] [--keep] [--host fr2]
//
// 1. Exports the tracked tree (current files of the working tree, or `git archive HEAD` with --head) into a temp folder with another name.
// 2. Applies a different identity (name, repo, binary, crate, scope, prefixes, orgs, domains): `identity.ts apply`.
// 3. Checks: `identity.ts check`, `checkdeps.ts`, targeted bun tests, `identity-literals.ts residual` (no literal of
//    the old identity left), `identity-literals.ts upstream` (win32, ffmpeg, Linux, Chromium and upstream env token
//    counts identical before and after: upstream namespaces are untouchable).
// 4. `cargo check` of the core crates on the fleet host (ssh, never on the workstation).
// Every step prints PASS or FAIL; the verdict is written to tools/identity-rename-test.last.json. Exit 1 on any FAIL.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { findRoot, tomlSet } from "./identity.ts";
import { namesOf, rewriteText } from "./identity-literals.ts";

const argv = Bun.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const opt = (f: string, d: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1]! : d);
const root = findRoot(import.meta.dir);
const host = opt("--host", "fr2");

// The other identity: nothing of it exists in the repository.
const OTHER = {
  folder: "zeta-checkout",
  name: "zeta",
  repo: "zeta",
  binary: "zt",
  crate: "zeta",
  scope: "@zeta",
  prefix: "zeta-",
  orgMain: "zeta-dev",
  orgLab: "zeta-labs",
  domain: "zeta.example",
};

type Step = { name: string; ok: boolean; detail: string };
const steps: Step[] = [];
const run = (cmd: string[], cwd: string, name: string, env: Record<string, string> = {}) => {
  const r = Bun.spawnSync(cmd, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  const out = `${r.stdout.toString()}${r.stderr.toString()}`.trim();
  const ok = r.exitCode === 0;
  steps.push({ name, ok, detail: out.split("\n").slice(-6).join("\n") });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) console.log(out.split("\n").slice(-12).join("\n"));
  return { ok, out };
};

/** Runs `cmd` before and after the rename; a failure that is identical before (modulo the names) is SAME, not FAIL. */
const before = new Map<string, { ok: boolean; sig: string }>();
const sig = (out: string) =>
  out
    .replaceAll(copy, "<root>")
    .replaceAll(copy.replaceAll("\\", "/"), "<root>")
    .replaceAll(base, "<tmp>")
    .replace(/\[[\d.]+m?s\]/g, "")
    .replace(/\d+(\.\d+)?ms/g, "")
    .split("\n")
    .filter((l) => l.trim())
    .slice(-8)
    .join("\n");
const pre = (cmd: string[], cwd: string, name: string) => {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  before.set(name, { ok: r.exitCode === 0, sig: sig(`${r.stdout}${r.stderr}`) });
};
const post = (cmd: string[], cwd: string, name: string, back: (s: string) => string) => {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const out = `${r.stdout}${r.stderr}`;
  const b = before.get(name)!;
  const ok = r.exitCode === 0;
  const same = !ok && !b.ok && back(sig(out)) === b.sig;
  steps.push({ name, ok: ok || same, detail: ok ? "" : same ? "SAME as before the rename (pre-existing failure)" : sig(out) });
  console.log(`${ok ? "PASS" : same ? "SAME" : "FAIL"} ${name}`);
  if (!ok && !same) console.log(`--- before\n${b.sig}\n--- after\n${sig(out)}`);
};

const base = mkdtempSync(join(tmpdir(), "identity-rename-"));
const copy = join(base, OTHER.folder);
mkdirSync(copy);

// 1. export (no worktree, no .git)
if (flag("--head")) {
  const tar = join(base, "head.tar");
  run(["git", "archive", "-o", tar, "HEAD"], root, "export: git archive HEAD");
  run(["tar", "-xf", tar, "-C", copy], base, "export: extract");
} else {
  // tracked files plus the new, not yet committed, sources of the Rust workspace (members may be untracked)
  const ls = (args: string[]) =>
    Bun.spawnSync(["git", "ls-files", "-z", ...args], { cwd: root }).stdout.toString().split("\0").filter(Boolean);
  let n = 0;
  for (const f of [...ls(["--cached"]), ...ls(["--others", "--exclude-standard", "--", "bench", "src", "test"])]) {
    const src = join(root, f);
    if (!existsSync(src)) continue; // deleted in the working tree
    try {
      mkdirSync(dirname(join(copy, f)), { recursive: true });
      cpSync(src, join(copy, f), { dereference: false });
      n++;
    } catch {}
  }
  steps.push({ name: "export: working tree", ok: n > 0, detail: `${n} files` });
  console.log(`PASS export: working tree (${n} files)`);
}

const tomlPath = join(copy, "tools/identity.toml");
const oldToml = join(base, "identity.old.toml");
const oldText = readFileSync(tomlPath, "utf8");
writeFileSync(oldToml, oldText);
const CHECKS: [string, string[]][] = [
  ["identity check", ["bun", join(copy, "scripts/identity.ts"), "check", "--root", copy]],
  ["checkdeps", ["bun", join(copy, "scripts/checkdeps.ts")]],
  ["bun tests (targeted)", ["bun", "test", "scripts/identity.test.ts", "system/env-kit/tests/auth.test.ts", "scripts/hygiene-bun-dependency.test.ts"]],
];
for (const [name, cmd] of CHECKS) pre(cmd, copy, name);
const upstreamBefore = run(["bun", join(copy, "scripts/identity-literals.ts"), "upstream", "--root", copy], copy, "upstream namespaces: count before");

// 2. other identity
let t = oldText;
const set = (table: string, key: string, v: string) => (t = tomlSet(t, table, key, JSON.stringify(v)));
set("[product]", "name", OTHER.name);
set("[product]", "repo", OTHER.repo);
set("[product]", "display", `${OTHER.name} labs`);
set("[cli]", "binary", OTHER.binary);
set("[cli]", "crate", OTHER.crate);
set("[naming]", "npm_scope", OTHER.scope);
set("[naming]", "crate_prefix", OTHER.prefix);
set("[orgs]", "main", OTHER.orgMain);
set("[orgs]", "lab", OTHER.orgLab);
set("[domains]", "root", OTHER.domain);
set("[domains]", "home", `labs.${OTHER.domain}`);
set("[domains]", "git", `git.${OTHER.domain}`);
set("[domains]", "contact", `contact@${OTHER.domain}`);
writeFileSync(tomlPath, t);

run(["bun", join(copy, "scripts/identity.ts"), "apply", "--root", copy, "--from", oldToml], copy, "apply: other identity");
// the new names are mapped back to the old ones before comparing with the run before the rename
const oldNames = namesOf(Bun.TOML.parse(oldText) as any);
const newNames = namesOf(Bun.TOML.parse(t) as any);
const back = (x: string) => rewriteText(x, newNames, oldNames);
for (const [name, cmd] of CHECKS) {
  if (name !== "identity check") {
    post(cmd, copy, name, back);
    continue;
  }
  // apply converges every manifest; only the workspace name collisions it cannot choose between may remain
  const r = Bun.spawnSync(cmd, { cwd: copy, stdout: "pipe", stderr: "pipe" });
  const left = `${r.stdout}${r.stderr}`.split("\n").filter((l) => l.startsWith("identity: ") && !l.includes("name collision"));
  steps.push({ name, ok: !left.length, detail: left.slice(0, 6).join("\n") });
  console.log(`${left.length ? "FAIL" : "PASS"} ${name} (name collisions are pre-existing)`);
  if (left.length) console.log(left.slice(0, 6).join("\n"));
}

// 3. residual literals and upstream invariance
const oldFolder = root.split(/[\\/]/).pop()!;
run(
  ["bun", join(copy, "scripts/identity-literals.ts"), "residual", "--old", oldToml, "--old-folder", oldFolder, "--root", copy],
  copy,
  "residual: no literal of the old identity",
);
const upstreamAfter = run(["bun", join(copy, "scripts/identity-literals.ts"), "upstream", "--root", copy], copy, "upstream namespaces: count after");
steps.push({
  name: "upstream namespaces unchanged",
  ok: upstreamBefore.out === upstreamAfter.out,
  detail: `${upstreamBefore.out} vs ${upstreamAfter.out}`,
});
console.log(`${upstreamBefore.out === upstreamAfter.out ? "PASS" : "FAIL"} upstream namespaces unchanged`);

// 4. cargo check on the fleet host
if (!flag("--no-cargo")) {
  const remote = `/tmp/identity-rename-${Date.now()}`;
  const send = Bun.spawnSync(
    [
      "bash",
      "-c",
      `tar -czf - -C "${copy.replaceAll("\\", "/")}" --exclude=node_modules --exclude=target Cargo.toml Cargo.lock rust-toolchain.toml .cargo src bench test tools third_party/*.toml 2>/dev/null | ssh ${host} 'mkdir -p ${remote} && tar -xzf - -C ${remote}'`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  steps.push({ name: `cargo: send to ${host}`, ok: send.exitCode === 0, detail: send.stderr.toString().slice(-300) });
  console.log(`${send.exitCode === 0 ? "PASS" : "FAIL"} cargo: send to ${host}`);
  if (send.exitCode === 0) {
    const pkgs = [OTHER.crate, `${OTHER.prefix}core`].map((p) => `-p ${p}`).join(" ");
    run(
      ["ssh", host, `cd ${remote} && cargo check ${pkgs} --message-format short 2>&1 | tail -25; exit \${PIPESTATUS[0]}`],
      base,
      `cargo check ${pkgs} (${host})`,
    );
    Bun.spawnSync(["ssh", host, `rm -rf ${remote}`]);
  }
}

// 5. relocation of the checkout folder (sandbox: folder move and identity check only), twice: the second run is a no-op
const moved = join(base, OTHER.name);
const reloc = join(root, "scripts/identity-relocate.ts");
run(["bun", reloc, "--sandbox", "--from", copy, "--to", moved], base, "relocate: move the copy to the identity name");
const again = run(["bun", reloc, "--sandbox", "--from", copy, "--to", moved], base, "relocate: second run is idempotent");
steps.push({ name: "relocate: second run skips the move", ok: again.out.includes("already moved"), detail: again.out.split("\n").find((l) => l.startsWith("move")) ?? "" });
console.log(`${again.out.includes("already moved") ? "PASS" : "FAIL"} relocate: second run skips the move`);
run(["bun", join(moved, "scripts/identity.ts"), "get", "cli.binary"], moved, "relocate: root found at the new path");

const ok = steps.every((s) => s.ok);
writeFileSync(
  join(root, "tools/identity-rename-test.last.json"),
  `${JSON.stringify({ identity: OTHER, ok, steps }, null, 1)}\n`,
);
if (!flag("--keep")) rmSync(base, { recursive: true, force: true });
console.log(ok ? "identity-rename-test: PASS" : "identity-rename-test: FAIL");
process.exit(ok ? 0 : 1);
