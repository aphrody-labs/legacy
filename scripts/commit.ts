// Safe commit for the shared working tree: builds the commit in a private index from HEAD plus the listed
// paths only, refuses a tree that loses files (b38c8de7 was committed from an empty index, 2026-11-15),
// moves main with compare-and-swap, then resyncs the shared index for those paths only.
// usage: bun scripts/commit.ts -m "<msg>" [--allow-shrink N] [--push] [--content <path>=<file>]... [--gitlink <path>=<sha>]... <path>...
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = Bun.argv.slice(2);
let msg = "";
let allowShrink = 0;
let push = false;
const contents: [string, string][] = [];
const gitlinks: [string, string][] = [];
const paths: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (a === "-m") msg = argv[++i] ?? "";
  else if (a === "--allow-shrink") allowShrink = Number(argv[++i] ?? 0);
  else if (a === "--push") push = true;
  else if (a === "--content") {
    const [p, file] = (argv[++i] ?? "").split("=");
    contents.push([p!, file!]);
  }
  else if (a === "--gitlink") {
    const [p, sha] = (argv[++i] ?? "").split("=");
    gitlinks.push([p!, sha!]);
  }
  else paths.push(a);
}
if (!msg || (!paths.length && !contents.length && !gitlinks.length)) {
  console.error('usage: bun scripts/commit.ts -m "<msg>" [--allow-shrink N] [--push] [--gitlink <path>=<sha>] <path>...');
  process.exit(2);
}

const root = import.meta.dir.replace(/[\\/]scripts$/, "");
const dir = mkdtempSync(join(tmpdir(), "commit-"));
const index = join(dir, "index");
const git = (args: string[], priv = false, stdin?: string) => {
  const r = Bun.spawnSync(["git", "-C", root, ...args], {
    env: priv ? { ...process.env, GIT_INDEX_FILE: index } : process.env,
    stdin: stdin === undefined ? "ignore" : Buffer.from(stdin),
  });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString().trim()}`);
  return r.stdout.toString().trim();
};
const count = (tree: string) => git(["ls-tree", "-r", "--name-only", tree]).split("\n").filter(Boolean).length;

try {
  const old = git(["rev-parse", "HEAD"]);
  const before = count(old);
  git(["read-tree", old], true);
  const loaded = git(["ls-files"], true).split("\n").filter(Boolean).length;
  if (loaded !== before) throw new Error(`private index holds ${loaded} files, HEAD ${before}: refusing`);
  if (paths.length) git(["add", "-A", "--", ...paths], true);
  // --content <repo path>=<local file>: commit that exact content (e.g. HEAD plus one hunk), not the working copy
  for (const [p, file] of contents) {
    const blob = git(["hash-object", "-w", file]);
    git(["update-index", "--add", "--cacheinfo", `100644,${blob},${p}`], true);
  }
  // --gitlink <repo path>=<commit sha>: pin a submodule without a local checkout of it
  for (const [p, sha] of gitlinks) {
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`--gitlink ${p}: expected a full 40-hex commit sha`);
    git(["update-index", "--add", "--cacheinfo", `160000,${sha},${p}`], true);
  }
  const tree = git(["write-tree"], true);
  const after = count(tree);
  if (before - after > allowShrink)
    throw new Error(`tree would lose ${before - after} files (${before} -> ${after}); pass --allow-shrink ${before - after} if intended`);
  if (tree === git(["rev-parse", `${old}^{tree}`])) throw new Error("nothing to commit for these paths");
  const commit = git(["commit-tree", tree, "-p", old, "-F", "-"], false, msg);
  git(["update-ref", "refs/heads/main", commit, old]);
  // shared index: these paths only, to the new HEAD (other sessions' staged entries stay untouched)
  const changed = git(["diff", "--name-only", "--no-renames", old, commit]).split("\n").filter(Boolean);
  const present = new Set(git(["ls-tree", "-r", "--name-only", commit]).split("\n"));
  const keep = changed.filter((f) => present.has(f));
  const gone = changed.filter((f) => !present.has(f));
  if (keep.length) git(["restore", "--staged", "--pathspec-from-file=-"], false, keep.join("\n"));
  if (gone.length) git(["rm", "-q", "--cached", "--ignore-unmatch", "--pathspec-from-file=-"], false, gone.join("\n"));
  console.log(`${commit.slice(0, 10)} ${changed.length} files (${before} -> ${after})`);
  if (push) {
    const r = Bun.spawnSync(["git", "-C", root, "push", "-q", "aphrody", "HEAD:main"]);
    if (r.exitCode !== 0) throw new Error(`push: ${r.stderr.toString().trim()}`);
    console.log("pushed");
  }
} catch (e) {
  console.error(String((e as Error).message ?? e));
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
