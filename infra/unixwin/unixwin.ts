// src unixwin chain: clone pinning, niu (niubash + rubash) build from the aphrody-labs forks, on prd
// (cargo xwin for Windows, nice -n 19, 4 tasks) or by the fork CI (.github/workflows/aphrody-build.yml),
// then installation of the binary on the workstation.
// Usage (repository root):
//   bun infra/unixwin/unixwin.ts status                     fork / upstream gaps, pins, installed niu
//   bun infra/unixwin/unixwin.ts lock                       pins the unixwin clones in src.lock.json
//   bun infra/unixwin/unixwin.ts build [triple]             build on prd, binary brought back to var/unixwin/prd/<triple>
//   bun infra/unixwin/unixwin.ts fetch-ci [triple]          fork CI artifact at the pinned commit -> var/unixwin/ci/<triple>
//   bun infra/unixwin/unixwin.ts install [prd|ci] [triple]  replaces the workstation's niu.exe (and its bash.exe/sh.exe copies)
//   bun infra/unixwin/unixwin.ts test-fr1 <filter>          targeted cargo test of rubash on fr1, the factory (full suite: fork CI)
import {
  existsSync,
  readdirSync,
  rmSync,
  renameSync,
  copyFileSync,
  mkdirSync,
} from "node:fs";
import { dirname, join } from "node:path";

const repo = join(import.meta.dir, "..", "..");
const lockPath = join(repo, "src.lock.json");
const gh = (r: string) => `https://github.com/${r}.git`;

// Clones unixwin (même liste que le bloc unixwin de packages/machine/src/forks.ts).
const DIRS = [
  ...[
    "niubash",
    "rubash",
    "WinuxCmd",
    "niu-git",
    "ruline",
    "oh-my-niu",
    "shellbench",
    "diffcorpus",
    "wpm-source",
    "wpm-artifacts",
    "winuxcmd-i18n",
    "winuxsh-profiles",
    "unixwin-github",
    "unixwin-apt",
    "unixwin.dev",
    "wpm-gui",
  ].map((n) => `third_party/${n}`),
];

const run = (cwd: string, ...a: string[]) => {
  const p = Bun.spawnSync(a, {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    ok: p.exitCode === 0,
    out: p.stdout.toString().trim(),
    err: p.stderr.toString().trim(),
  };
};
const must = (cwd: string, ...a: string[]) => {
  const r = run(cwd, ...a);
  if (!r.ok) throw new Error(`${a.join(" ")} : ${r.err.split("\n").pop()}`);
  return r.out;
};
const sha256 = async (f: string) =>
  new Bun.CryptoHasher("sha256")
    .update(new Uint8Array(await Bun.file(f).arrayBuffer()))
    .digest("hex");

type Entry = Record<string, unknown> & { commit?: string };
const readLock = async () =>
  (await Bun.file(lockPath).json()) as { repositories: Record<string, Entry> };
const pinOf = async (rel: string) => {
  const c = (await readLock()).repositories[rel]?.commit;
  if (!c)
    throw new Error(
      `${rel} missing from src.lock.json: bun infra/unixwin/unixwin.ts lock`,
    );
  return c;
};

// Entry in src.lock.json format (version 2), relative path (LOCK-ABS rule of docs/native/deps/POLICY.md).
const entry = (rel: string): Entry => {
  const dir = join(repo, rel);
  const remotes: Record<string, string> = {};
  for (const name of must(dir, "git", "remote").split("\n").filter(Boolean))
    remotes[name] = must(dir, "git", "remote", "get-url", name);
  const sparse = run(dir, "git", "sparse-checkout", "list");
  const cfg = run(dir, "git", "config", "core.sparseCheckout");
  return {
    path: rel,
    url: remotes.origin,
    upstream_url: remotes.upstream ?? null,
    commit: must(dir, "git", "rev-parse", "HEAD"),
    branch: must(dir, "git", "rev-parse", "--abbrev-ref", "HEAD"),
    engine: "git",
    pillar: "git",
    remotes,
    sparse_paths:
      cfg.out === "true" && sparse.ok
        ? sparse.out.split("\n").filter(Boolean)
        : null,
  };
};

async function lock() {
  const text = await Bun.file(lockPath).text();
  const l = JSON.parse(text) as { repositories: Record<string, Entry> };
  for (const rel of DIRS) {
    if (!existsSync(join(repo, rel, ".git"))) {
      console.log(
        `missing  ${rel} (bun packages/machine/src/forks.ts ${rel.split("/").pop()})`,
      );
      continue;
    }
    const e = entry(rel);
    const prev = l.repositories[rel]?.commit;
    l.repositories[rel] = { ...l.repositories[rel], ...e };
    console.log(
      `${prev === e.commit ? "=" : "pin"}  ${rel} ${e.commit.slice(0, 12)}`,
    );
  }
  await Bun.write(lockPath, `${JSON.stringify(l, null, 4)}\n`);
}

async function status() {
  const l = await readLock();
  for (const rel of DIRS) {
    const e = l.repositories[rel];
    const fork = String(e?.url ?? "")
      .replace(/^https:\/\/github\.com\//, "")
      .replace(/\.git$/, "");
    const up = String(e?.upstream_url ?? "")
      .replace(/^https:\/\/github\.com\//, "")
      .replace(/\.git$/, "");
    if (!fork || !up) {
      console.log(`${rel}  not pinned`);
      continue;
    }
    const b = run(
      repo,
      "gh",
      "api",
      `repos/${fork}`,
      "--jq",
      ".default_branch",
    ).out;
    const c = run(
      repo,
      "gh",
      "api",
      `repos/${up}/compare/${up.split("/")[0]}:${b}...${fork.split("/")[0]}:${b}`,
      "--jq",
      `"avance=\\(.ahead_by) retard=\\(.behind_by)"`,
    );
    console.log(
      `${rel}  pin ${String(e.commit).slice(0, 12)}  ${fork} vs ${up} : ${c.ok ? c.out : c.err}`,
    );
  }
  const niu = installDir() && join(installDir()!, "niu.exe");
  if (niu && existsSync(niu))
    console.log(`poste  ${niu}  sha256 ${await sha256(niu)}`);
}

const TRIPLE = (a?: string) =>
  a ??
  (process.arch === "arm64"
    ? "aarch64-pc-windows-msvc"
    : "x86_64-pc-windows-msvc");
const exeName = (t: string) => (t.includes("-windows-") ? "niu.exe" : "niu");

async function build(triple: string) {
  const niu = await pinOf("third_party/niubash");
  const rub = await pinOf("third_party/rubash");
  must(
    repo,
    "ay",
    "ssh",
    "cp",
    join(repo, "infra", "unixwin", "prd-build.sh"),
    "prd:unixwin-prd-build.sh",
  );
  const p = Bun.spawn(
    [
      "ay",
      "ssh",
      "exec",
      "prd",
      "--",
      `JOBS=4 sh unixwin-prd-build.sh ${triple} ${niu} ${rub}`,
    ],
    { stdin: "ignore", stdout: "pipe", stderr: "inherit" },
  );
  const out = await new Response(p.stdout).text();
  process.stdout.write(out);
  if ((await p.exited) !== 0) throw new Error("prd build failed");
  const m = out.match(/^ARTIFACT (\S+) ([0-9a-f]{64})$/m);
  if (!m) throw new Error("ARTIFACT line missing");
  const dst = join(repo, "var", "unixwin", "prd", triple);
  mkdirSync(dst, { recursive: true });
  const remoteDir = m[1]!.slice(0, m[1]!.lastIndexOf("/"));
  for (const f of [exeName(triple), "SHA256SUMS", "SOURCES"])
    must(repo, "ay", "ssh", "cp", `prd:${remoteDir}/${f}`, join(dst, f));
  await verify(dst, triple);
  console.log(`prd -> ${dst}`);
}

async function fetchCi(triple: string) {
  const niu = await pinOf("third_party/niubash");
  const id = must(
    repo,
    "gh",
    "run",
    "list",
    "-R",
    "aphrody-labs/niubash",
    "-w",
    "aphrody build",
    "--commit",
    niu,
    "--status",
    "success",
    "-L",
    "1",
    "--json",
    "databaseId",
    "--jq",
    ".[0].databaseId // empty",
  );
  if (!id)
    throw new Error(
      `no successful "aphrody build" run for niubash@${niu.slice(0, 12)}`,
    );
  const dst = join(repo, "var", "unixwin", "ci", triple);
  rmSync(dst, { recursive: true, force: true });
  must(
    repo,
    "gh",
    "run",
    "download",
    id,
    "-R",
    "aphrody-labs/niubash",
    "-n",
    `niu-${triple}`,
    "-D",
    dst,
  );
  await verify(dst, triple);
  console.log(`ci run ${id} -> ${dst}`);
}

async function testFr1(filter: string) {
  const rub = await pinOf("third_party/rubash");
  must(
    repo,
    "ay",
    "ssh",
    "cp",
    join(repo, "infra", "unixwin", "fr1-test.sh"),
    "fr1:unixwin-fr1-test.sh",
  );
  const p = Bun.spawn(
    [
      "ay",
      "ssh",
      "exec",
      "fr1",
      "--",
      `JOBS=4 sh unixwin-fr1-test.sh ${rub} ${filter}`,
    ],
    { stdin: "ignore", stdout: "inherit", stderr: "inherit" },
  );
  process.exit(await p.exited);
}

async function verify(dir: string, triple: string) {
  const exe = exeName(triple);
  const want = (await Bun.file(join(dir, "SHA256SUMS")).text()).split(/\s+/)[0];
  const got = await sha256(join(dir, exe));
  if (want !== got)
    throw new Error(`${exe} : sha256 ${got} != SHA256SUMS ${want}`);
}

function installDir() {
  const base = process.env.LOCALAPPDATA;
  return base ? join(base, "Programs", "Niubash") : undefined;
}

// Replaces niu.exe and its identical copies (winuxcmd/bin/bash.exe, sh.exe). An executable in use cannot be
// overwritten on Windows but can be renamed: the old one becomes *.old and is deleted at the next installation.
async function install(from: string, triple: string) {
  const dir = installDir();
  if (process.platform !== "win32" || !dir || !existsSync(join(dir, "niu.exe")))
    throw new Error(
      "niubash missing from the workstation (winget install --id Unixwin.Niubash) or non-Windows host",
    );
  const src = join(repo, "var", "unixwin", from, triple);
  await verify(src, triple);
  const fresh = join(src, "niu.exe");
  const want = await sha256(fresh);
  const old = await sha256(join(dir, "niu.exe"));
  const targets = [join(dir, "niu.exe")];
  const bin = join(dir, "winuxcmd", "bin");
  for (const f of existsSync(bin) ? readdirSync(bin) : [])
    if (/^(bash|sh)\.exe$/i.test(f) && (await sha256(join(bin, f))) === old)
      targets.push(join(bin, f));
  const drop = (f: string) => {
    try {
      rmSync(f, { force: true });
    } catch {
      // still executed by an open session: deleted at the next installation
    }
  };
  // Old executables left by a previous installation (locked at the time): best-effort purge.
  for (const d of new Set(targets.map((t) => dirname(t))))
    for (const f of readdirSync(d))
      if (/\.exe\.old-\d+$/i.test(f)) drop(join(d, f));
  const stamp = Date.now();
  for (const t of targets) {
    // Complete copy, verified again alongside, then swap by renames; restore if the swap fails.
    // The old binary takes a unique name: an executable in use can be renamed but not deleted.
    const prev = `${t}.old-${stamp}`;
    copyFileSync(fresh, `${t}.new`);
    if ((await sha256(`${t}.new`)) !== want)
      throw new Error(`${t}.new: different sha256 after copy`);
    renameSync(t, prev);
    try {
      renameSync(`${t}.new`, t);
    } catch (e) {
      renameSync(prev, t);
      throw e;
    }
    drop(prev);
  }
  console.log(must(dir, join(dir, "niu.exe"), "--version").split("\n")[0]);
  console.log(
    `installed (${from}): ${targets.length} file(s), sha256 ${want}`,
  );
}

const [cmd, a1, a2] = process.argv.slice(2);
switch (cmd) {
  case "lock":
    await lock();
    break;
  case "status":
    await status();
    break;
  case "build":
    await build(TRIPLE(a1));
    break;
  case "fetch-ci":
    await fetchCi(TRIPLE(a1));
    break;
  case "test-fr1":
    if (a1 && !/^[\w:-]+$/.test(a1))
      throw new Error("filtre : identifiant de test cargo");
    if (!a1)
      throw new Error(
        "filter mandatory: the full suite runs in the fork CI (aphrody tests)",
      );
    await testFr1(a1);
    break;
  case "install":
    if (a1 && a1 !== "prd" && a1 !== "ci") throw new Error("source : prd | ci");
    await install(a1 ?? "ci", TRIPLE(a2));
    break;
  default:
    console.log(
      "usage : bun infra/unixwin/unixwin.ts status | lock | build [triple] | fetch-ci [triple] | install [prd|ci] [triple] | test-fr1 [filtre]",
    );
    process.exit(cmd ? 2 : 0);
}
