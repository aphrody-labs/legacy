// msindex: end-to-end recursive index of the Microsoft stack present on this machine, proven on the running system.
//   Win32 + WDK (win32metadata / wdkmetadata, ECMA-335)  system WinRT (Windows.winmd)  Windows App SDK + WinUI 3
//   (NuGet winmd + WindowsAppSDK / microsoft-ui-xaml sources)  .NET 10 and 11 (reference packs + shared runtime)
//   windows-rs (nt monorepo: crates, features, links to namespaces)  UCRT, MSVC CRT/STL, `import std`.
// Method:
//   - metadata read through the standard ECMA-335 format (Partition II) produced by MIDL, win32metadata and Roslyn;
//   - proofs through Windows mechanisms (system.ts): PEB API Sets, loader (LoadLibraryExW + GetProcAddress),
//     WinRT registry + RoGetActivationFactory, PE exports, .NET type forwarders (ExportedType);
//   - reproducibility: every input is locked (SHA-256 per file; file trees: SHA-256 of the sorted list
//     "path SHA-256", like a git tree; repositories: commit; NuGet: SHA-512 of the package checked against the
//     nuget.org catalog); sorted walks and sequential identifiers; SHA-256 fingerprint of the canonical graph.
// Outputs: target/index/msindex.sqlite (node, edge, proof, fts), docs/msindex/lock.json (entries + fingerprints), README.md.
// Usage: bun sdk/tools/msindex/main.ts --src <src root> [--verify] [--no-activate]
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { exportsOf, parsePe } from "../host/pe.ts";
import { readAssembly } from "../dotnet-ffi/ecma335.ts";
import { indexCrt, CRT_DLLS } from "./crt.ts";
import { dirs, files, isDir, repoState, sha256, slash } from "./fsx.ts";
import { Graph } from "./graph.ts";
import { indexSources } from "./idl.ts";
import {
  apiSetResolver,
  apiSetSchema,
  child,
  hklmString,
  winrtRegistry,
} from "./system.ts";
import { exposedTypes, type Import, indexWinmd } from "./winmd.ts";

if (process.platform !== "win32")
  throw new Error(
    "msindex: Windows only (proofs on the running system)",
  );
const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const srcArg = arg("--src");
if (!srcArg)
  throw new Error(
    "usage: bun sdk/tools/msindex/main.ts --src <src root> [--verify] [--no-activate]",
  );
// POSIX path of a Windows shell (/c/src, niubash or msys) -> Windows path.
const src = resolve(
  srcArg.replace(
    /^\/([a-z])(?=\/|$)/i,
    (_, d: string) => `${d.toUpperCase()}:`,
  ),
);
const verify = process.argv.includes("--verify");
const activateClasses = !process.argv.includes("--no-activate");
const nt = join(import.meta.dir, "..", "..", "..");
const METHOD: Record<string, string> = {
  "apiset-host": "PEB->ApiSetMap: the contract has a host DLL",
  "pe-export":
    "API Set contract resolved, name present in the PE export table of the host",
  loader:
    "LoadLibraryExW(DONT_RESOLVE_DLL_REFERENCES) + GetProcAddress (processus enfant)",
  "winrt-registered":
    "HKLM\\SOFTWARE\\Microsoft\\WindowsRuntime\\ActivatableClassId",
  "activation-export": "DllPath exporte DllGetActivationFactory",
  RoGetActivationFactory:
    "factory obtained (IID_IActivationFactory), in-process classes",
  "wasdk-activation":
    "appxfragment of the package -> DLL of the package exporting DllGetActivationFactory",
  "dotnet-impl":
    "reference type defined (TypeDef) by the shared runtime, ExportedType forwarders followed",
  "ucrtbase-export": "_ACRTIMP declaration exported by ucrtbase.dll",
};
const t0 = performance.now();
const log = (s: string) =>
  console.error(
    `[msindex ${((performance.now() - t0) / 1000).toFixed(1)}s] ${s}`,
  );

// ---------------------------------------------------------------- roots (no hard-coded path: environment, registry, tools)
const system32 = join(process.env.SystemRoot!, "System32");
const nuget =
  process.env.NUGET_PACKAGES ?? join(homedir(), ".nuget", "packages");
const dotnetExe = Bun.which("dotnet");
if (!dotnetExe) throw new Error("dotnet not in PATH");
const dotnet = dirname(realpathSync(dotnetExe));
const kits = hklmString(
  "SOFTWARE\\Microsoft\\Windows Kits\\Installed Roots",
  "KitsRoot10",
).replace(/\\$/, "");
const vswhere = join(
  process.env["ProgramFiles(x86)"] ?? "",
  "Microsoft Visual Studio",
  "Installer",
  "vswhere.exe",
);
const vs = Bun.spawnSync([
  vswhere,
  "-latest",
  "-products",
  "*",
  "-requires",
  "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
  "-property",
  "installationPath",
])
  .stdout.toString()
  .trim();
const msvcVer = dirs(join(vs, "VC", "Tools", "MSVC")).at(-1)!;
const msvc = join(vs, "VC", "Tools", "MSVC", msvcVer);
const ucrtVer = dirs(join(kits, "Include"))
  .filter((v) => isDir(join(kits, "Include", v, "ucrt")))
  .at(-1)!;
const repos = {
  WindowsAppSDK: join(src, "third_party", "WindowsAppSDK"),
  "microsoft-ui-xaml": join(src, "third_party", "microsoft-ui-xaml"),
  "windows-rs": join(src, "third_party", "windows-rs"),
};
const props = await Bun.file(join(nt, "Directory.Packages.props")).text();
const wasdkVersion =
  /Include="Microsoft\.WindowsAppSDK" Version="([^"]+)"/.exec(props)![1]!;
const roots: Record<string, string> = {
  src,
  nuget,
  dotnet,
  kits,
  msvc,
  system32,
  nt,
};

// ---------------------------------------------------------------- input lock
type Input = { root: string; path: string; size: number; sha256: string };
const inputs: Input[] = [];
const rel = (p: string) => {
  for (const [k, r] of Object.entries(roots).sort(
    (a, b) => b[1].length - a[1].length,
  ))
    if (
      p.toLowerCase().startsWith(r.toLowerCase() + "\\") ||
      p.toLowerCase().startsWith(r.toLowerCase() + "/")
    )
      return { root: k, path: slash(p.slice(r.length + 1)) };
  throw new Error(`entry outside the roots: ${p}`);
};
const lock = async (p: string) => {
  const f = Bun.file(p);
  if (!(await f.exists())) return;
  inputs.push({ ...rel(p), size: f.size, sha256: await sha256(p) });
};
const lockTree = async (dir: string, re: RegExp) => {
  const h = new Bun.CryptoHasher("sha256");
  let size = 0;
  for (const f of files(dir, re)) {
    h.update(`${slash(relative(dir, f))} ${await sha256(f)}\n`);
    size += Bun.file(f).size;
  }
  inputs.push({ ...rel(dir), size, sha256: `tree:${h.digest("hex")}` });
};

// WDK metadata (NuGet Microsoft.Windows.WDK.Win32Metadata): latest version of the feed, SHA-512 checked against the catalog.
const wdkId = "microsoft.windows.wdk.win32metadata";
const prev = (await Bun.file(join(nt, "docs", "msindex", "lock.json")).exists())
  ? await Bun.file(join(nt, "docs", "msindex", "lock.json")).json()
  : null;
const wdkVersion: string =
  verify && prev
    ? prev.nuget.wdk.version
    : (
        (await (
          await fetch(
            `https://api.nuget.org/v3-flatcontainer/${wdkId}/index.json`,
          )
        ).json()) as { versions: string[] }
      ).versions.at(-1)!;
const wdkDir = join(nuget, wdkId, wdkVersion);
if (!isDir(wdkDir)) {
  const nupkg = new Uint8Array(
    await (
      await fetch(
        `https://api.nuget.org/v3-flatcontainer/${wdkId}/${wdkVersion}/${wdkId}.${wdkVersion}.nupkg`,
      )
    ).arrayBuffer(),
  );
  const reg = (await (
    await fetch(
      `https://api.nuget.org/v3/registration5-semver1/${wdkId}/${wdkVersion}.json`,
    )
  ).json()) as {
    catalogEntry: string;
  };
  const cat = (await (await fetch(reg.catalogEntry)).json()) as {
    packageHash: string;
    packageHashAlgorithm: string;
  };
  const got = new Bun.CryptoHasher("sha512").update(nupkg).digest("base64");
  if (cat.packageHashAlgorithm !== "SHA512" || got !== cat.packageHash)
    throw new Error(
      `${wdkId} ${wdkVersion} : SHA-512 ${got} != catalogue ${cat.packageHash}`,
    );
  const pkg = join(wdkDir, `${wdkId}.${wdkVersion}.nupkg`);
  await Bun.write(pkg, nupkg);
  Bun.spawnSync([join(system32, "tar.exe"), "-xf", pkg, "-C", wdkDir]);
  await Bun.write(`${pkg}.sha512`, got);
}
const wdkWinmd = files(wdkDir, /\.winmd$/i)[0]!;
log(
  `roots: dotnet ${dotnet}; MSVC ${msvcVer}; UCRT ${ucrtVer}; WDK metadata ${wdkVersion}`,
);

// ---------------------------------------------------------------- graphe
const g = new Graph();
const root = g.add(0, "index", "msindex", "Microsoft end to end", {});
const shippedTypes = new Map<string, number>();
const allImports: Import[] = [];

// 1. Win32, WDK, system WinRT (windows-rs: crates/libs/default) — same metadata as the crate generation.
const meta = g.add(root, "source", "metadata", "Windows metadata (ECMA-335)");
const rsDefault = join(repos["windows-rs"], "crates", "libs", "default");
for (const f of [
  join(rsDefault, "Windows.Win32.winmd"),
  wdkWinmd,
  join(rsDefault, "Windows.winmd"),
]) {
  await lock(f);
  const n = g.add(meta, "winmd", basename(f), slash(rel(f).path), {
    root: rel(f).root,
  });
  const r = await indexWinmd(g, n, f);
  for (const [k, v] of r.types) shippedTypes.set(k, v);
  allImports.push(...r.imports);
  Object.assign(g.node(n).data, {
    assembly: r.asm.name,
    version: r.asm.version,
    types: r.types.size,
    members: r.members,
    imports: r.imports.length,
  });
  log(
    `${basename(f)}: ${r.types.size} types, ${r.members} members, ${r.imports.length} imported functions`,
  );
}

// 2. Windows App SDK (NuGet packages of the pinned version) + sources.
const wasdk = g.add(
  root,
  "source",
  "Windows App SDK",
  `Microsoft.WindowsAppSDK ${wasdkVersion}`,
  { version: wasdkVersion },
);
const fragments: { pkg: string; dir: string; file: string }[] = [];
for (const id of dirs(nuget).filter((d) =>
  /^microsoft\.windowsappsdk(\.|$)/.test(d),
)) {
  const dir = join(nuget, id, wasdkVersion);
  if (!isDir(dir)) continue;
  const spec = join(dir, `${id}.nuspec`);
  await lock(spec);
  const text = await Bun.file(spec).text();
  const pid = /<id>([^<]+)<\/id>/.exec(text)?.[1] ?? id;
  const pkg = g.add(wasdk, "package", pid, `${pid} ${wasdkVersion}`, {
    description: /<description>([\s\S]*?)<\/description>/
      .exec(text)?.[1]
      ?.replace(/\s+/g, " ")
      .trim(),
    dependencies: [
      ...new Set(
        [...text.matchAll(/<dependency id="([^"]+)" version="([^"]+)"/g)].map(
          (m) => `${m[1]} ${m[2]}`,
        ),
      ),
    ].sort(),
  });
  const winmds = new Map<string, string>();
  for (const d of ["metadata", "lib"])
    for (const w of files(join(dir, d), /\.winmd$/i))
      if (!winmds.has(basename(w).toLowerCase()))
        winmds.set(basename(w).toLowerCase(), w);
  for (const w of [...winmds.values()]) {
    await lock(w);
    await lock(w.replace(/\.winmd$/i, ".xml"));
    const n = g.add(pkg, "winmd", basename(w), slash(relative(dir, w)));
    const r = await indexWinmd(g, n, w);
    for (const [k, v] of r.types) shippedTypes.set(k, v);
    Object.assign(g.node(n).data, {
      assembly: r.asm.name,
      types: r.types.size,
      members: r.members,
      documented: r.documented,
    });
  }
  for (const f of [
    join(dir, "runtimes-framework", "package.appxfragment"),
    join(dir, "build", "native", "LiftedWinRTClassRegistrations.xml"),
  ])
    if (await Bun.file(f).exists())
      (await lock(f), fragments.push({ pkg: pid, dir, file: f }));
}
const wasdkRepo = g.add(
  wasdk,
  "repo",
  "WindowsAppSDK",
  repoState(repos.WindowsAppSDK).remote,
  repoState(repos.WindowsAppSDK),
);
const muxRepo = g.add(
  wasdk,
  "repo",
  "microsoft-ui-xaml",
  repoState(repos["microsoft-ui-xaml"]).remote,
  repoState(repos["microsoft-ui-xaml"]),
);
const srcLinks = await indexSources(
  g,
  wasdkRepo,
  muxRepo,
  repos.WindowsAppSDK,
  repos["microsoft-ui-xaml"],
  shippedTypes,
);
log(
  `Windows App SDK ${wasdkVersion}: ${fragments.length} activation registrations; ${srcLinks.sourceTypes.size} IDL types; ${srcLinks.features.size} features`,
);

// 3. .NET 10 and 11: Microsoft.NETCore.App.Ref reference packs (public API) and shared runtime (implementation).
const net = g.add(root, "source", ".NET", "Microsoft.NETCore.App");
const netProofs: { ref: Map<string, number>; impl: string }[] = [];
for (const ver of dirs(
  join(dotnet, "packs", "Microsoft.NETCore.App.Ref"),
).filter((v) => /^1[01]\./.test(v))) {
  const major = ver.split(".")[0];
  const refDir = join(
    dotnet,
    "packs",
    "Microsoft.NETCore.App.Ref",
    ver,
    "ref",
    `net${major}.0`,
  );
  const impl = join(dotnet, "shared", "Microsoft.NETCore.App", ver);
  const vn = g.add(
    net,
    "runtime",
    `.NET ${ver}`,
    `Microsoft.NETCore.App ${ver}`,
    {
      ref: slash(rel(refDir).path),
      shared: isDir(impl) ? slash(rel(impl).path) : undefined,
    },
  );
  await lockTree(refDir, /\.(dll|xml)$/i);
  if (isDir(impl)) await lockTree(impl, /\.dll$/i);
  const types = new Map<string, number>();
  for (const f of files(refDir, /\.dll$/i)) {
    const n = g.add(
      vn,
      "assembly",
      basename(f, ".dll"),
      `${basename(f, ".dll")} ${ver}`,
    );
    const r = await indexWinmd(g, n, f, true);
    for (const [k, v] of r.types) types.set(`${basename(f)}|${k}`, v);
    Object.assign(g.node(n).data, {
      version: r.asm.version,
      types: r.types.size,
      members: r.members,
      documented: r.documented,
    });
  }
  netProofs.push({ ref: types, impl });
  log(`.NET ${ver} : ${types.size} types publics`);
}

// 4. windows-rs (nt monorepo): workspace crates (cargo metadata), features, internal dependencies.
const rs = repoState(repos["windows-rs"]);
const rsNode = g.add(root, "source", "windows-rs", rs.remote, rs);
const cm = Bun.spawnSync(
  ["cargo", "metadata", "--no-deps", "--format-version", "1", "--offline"],
  { cwd: repos["windows-rs"] },
);
if (cm.exitCode !== 0) throw new Error(`cargo metadata: ${cm.stderr}`);
type Pkg = {
  name: string;
  version: string;
  description?: string;
  manifest_path: string;
  features: Record<string, string[]>;
  dependencies: { name: string; kind: string | null; optional: boolean }[];
};
const pkgs = (JSON.parse(cm.stdout.toString()).packages as Pkg[]).sort(
  (a, b) => (a.manifest_path < b.manifest_path ? -1 : 1),
);
const crateNode = new Map<string, number>();
const nsByName = new Map<string, number>();
for (const n of g.nodes)
  if (n.kind === "namespace" && !nsByName.has(n.full))
    nsByName.set(n.full, n.id);
// Source metadata of windows-rs (metadata/{win32,wdk}/*.rdl, produced by crates/tools/win32 from the SDK headers):
// one file per header; top-level declarations of the Win32 module linked to the types and functions of Windows.Win32.winmd.
const rdlRoot = join(repos["windows-rs"], "metadata");
const headerNode = new Map<string, number>();
const rdl = g.add(rsNode, "rdl", "metadata", "metadata/{win32,wdk}");
for (const area of ["win32", "wdk"]) {
  const an = g.add(rdl, "rdl-area", area, `metadata/${area}`);
  for (const f of files(join(rdlRoot, area), /\.rdl$/i)) {
    const text = await Bun.file(f).text();
    const names = [
      ...text.matchAll(
        /^ {8}(?:extern fn|const|type|struct|enum|interface|union)\s+([A-Za-z_]\w*)/gm,
      ),
    ].map((m) => m[1]!);
    const h = g.add(
      an,
      "header",
      `${basename(f, ".rdl")}.h`,
      `metadata/${area}/${basename(f)}`,
      { declarations: names.length },
    );
    if (area === "win32") headerNode.set(basename(f, ".rdl").toLowerCase(), h);
    if (area === "win32")
      for (const n of names)
        g.edge(h, shippedTypes.get(`Windows.Win32.${n}`) ?? 0, "declares");
  }
}
const win32Apis = new Map<string, number>();
for (const n of g.nodes)
  if (
    (n.kind === "function" || n.kind === "constant") &&
    n.full.startsWith("Windows.Win32.Apis.")
  )
    win32Apis.set(n.name, n.id);
for (const area of ["win32"])
  for (const f of files(join(rdlRoot, area), /\.rdl$/i)) {
    const h = headerNode.get(basename(f, ".rdl").toLowerCase())!;
    for (const m of (await Bun.file(f).text()).matchAll(
      /^ {8}(?:extern fn|const)\s+([A-Za-z_]\w*)/gm,
    ))
      g.edge(h, win32Apis.get(m[1]!) ?? 0, "declares");
  }
for (const p of pkgs) {
  const dir = slash(relative(repos["windows-rs"], dirname(p.manifest_path)));
  const c = g.add(rsNode, "crate", p.name, `${p.name} ${p.version}`, {
    path: dir,
    description: p.description ?? undefined,
    features: Object.keys(p.features).length,
  });
  crateNode.set(p.name, c);
  for (const [f, act] of Object.entries(p.features).sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    const fn = g.add(c, "cargo-feature", f, `${p.name}/${f}`, {
      enables: act.length ? act : undefined,
    });
    // windows / windows-sys: feature = WinRT namespace (AI_Actions) or Win32 header (aclapi).
    if (/^windows(-sys)?$/.test(p.name))
      g.edge(
        fn,
        nsByName.get(`Windows.${f.replaceAll("_", ".")}`) ??
          headerNode.get(f.toLowerCase()) ??
          0,
        "projects",
      );
  }
}
for (const p of pkgs)
  for (const d of p.dependencies)
    g.edge(
      crateNode.get(p.name)!,
      crateNode.get(d.name) ?? 0,
      d.kind ? `dep-${d.kind}` : "dep",
    );
log(`windows-rs: ${pkgs.length} crates`);

// 5. UCRT, CRT/STL MSVC, `import std`.
const crtNode = g.add(
  root,
  "source",
  "C/C++ runtime",
  `UCRT ${ucrtVer} + MSVC ${msvcVer}`,
);
for (const d of CRT_DLLS) await lock(join(system32, d));
await lockTree(join(kits, "Include", ucrtVer, "ucrt"), /\.h$/i);
await lockTree(join(msvc, "include"), /.*/);
const crt = await indexCrt(
  g,
  crtNode,
  join(kits, "Include", ucrtVer, "ucrt"),
  system32,
  msvc,
);
log(
  `CRT: ${crt.dlls} DLLs; UCRT ${crt.declared} declarations (${crt.linked} exported); import std ${crt.exported}`,
);

// ---------------------------------------------------------------- proofs on the running system
const os = {
  caption: hklmString(
    "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion",
    "DisplayVersion",
  ),
  build: `${hklmString("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", "CurrentBuild")}`,
  lab: hklmString(
    "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion",
    "BuildLabEx",
  ),
};
const schema = apiSetSchema();
const resolveDll = apiSetResolver(schema.sets);
const apisets = g.add(
  root,
  "source",
  "API Sets",
  `ApiSetSchema v${schema.version}`,
  { count: schema.count, os },
);
for (const s of schema.sets) {
  const n = g.add(apisets, "apiset", s.name, s.name, {
    hosts: s.hosts.map((h) =>
      h.importer ? `${h.importer}->${h.host}` : h.host,
    ),
    sealed: s.sealed || undefined,
  });
  g.prove(
    n,
    "apiset-host",
    s.hosts.some((h) => h.host),
    s.hosts.length ? "" : "contract without host on this edition",
  );
}

// PE exports (static) of the hosts: user DLLs in System32, kernel images in System32 or System32\drivers.
const peExports = new Map<string, Set<string> | null>();
const exportsFor = async (file: string) => {
  const k = file.toLowerCase();
  if (!peExports.has(k)) {
    const p = [join(system32, file), join(system32, "drivers", file)].find(
      (x) => Bun.file(x).size > 0,
    );
    const pe = p ? parsePe(await Bun.file(p).arrayBuffer()) : null;
    peExports.set(k, pe ? new Set(exportsOf(pe)) : null);
  }
  return peExports.get(k)!;
};
const userItems: [string, string][] = [];
const userNodes: number[] = [];
for (const im of allImports) {
  const r = resolveDll(im.dll.includes(".") ? im.dll : `${im.dll}.dll`);
  const host = r.host || "";
  const ex = host ? await exportsFor(host) : null;
  g.prove(
    im.node,
    "pe-export",
    Boolean(ex?.has(im.entry)),
    !host
      ? `contract ${r.set} without host`
      : !ex
        ? `${host} absent`
        : ex.has(im.entry)
          ? host
          : `${im.entry} absent de ${host}`,
  );
  if (!/\.(sys|exe)$/i.test(im.dll) && !/^(ntoskrnl|hal)/i.test(im.dll))
    (userItems.push([
      im.dll.includes(".") ? im.dll : `${im.dll}.dll`,
      im.entry,
    ]),
      userNodes.push(im.node));
}
log(
  `PE exports: ${allImports.length} functions; loader: ${userItems.length}`,
);
// An item that crashes the proof process must not invalidate the others: batches split in two when the
// process fails until the faulty group is isolated (failed proof with the cause).
async function proveIsolated<T>(
  check: string,
  groups: T[][],
  nodeOf: (x: T) => number,
  run: (items: T[]) => Promise<[boolean, string][]>,
  batch: number,
) {
  const go = async (gs: T[][]): Promise<void> => {
    const items = gs.flat();
    try {
      (await run(items)).forEach(([ok, why], j) =>
        g.prove(nodeOf(items[j]!), check, ok, why),
      );
    } catch (e) {
      if (gs.length === 1) {
        const why = `proof process interrupted: ${/panic\([^)]*\): [^\n]*|code \d+/.exec((e as Error).message)?.[0] ?? "failure"}`;
        for (const x of items) g.prove(nodeOf(x), check, false, why);
        log(`${check}: group isolated as failed (${items.length} items)`);
        return;
      }
      await go(gs.slice(0, gs.length >> 1));
      await go(gs.slice(gs.length >> 1));
    }
  };
  for (let i = 0; i < groups.length; i += batch)
    await go(groups.slice(i, i + batch));
}
type Item = { dll: string; entry: string; node: number };
const byDll = new Map<string, Item[]>();
userItems.forEach(([dll, entry], i) => {
  const k = dll.toLowerCase();
  (byDll.get(k) ?? byDll.set(k, []).get(k)!).push({
    dll,
    entry,
    node: userNodes[i]!,
  });
});
await proveIsolated(
  "loader",
  [...byDll.keys()].sort().map((k) => byDll.get(k)!),
  (x) => x.node,
  (items) =>
    child({ kind: "loader", items: items.map((x) => [x.dll, x.entry]) }),
  64,
);

// System WinRT: registry, DLL, DllGetActivationFactory export, factory activation (in-process classes).
const reg = winrtRegistry();
const toActivate: string[] = [];
const activateNodes: number[] = [];
const winrtMeta = g.kids(meta).find((n) => n.name === "Windows.winmd")!;
for (const n of g.walk(winrtMeta.id)) {
  if (n.kind !== "class" || !(n.data.activatable || n.data.statics)) continue;
  const r = reg.get(n.full);
  g.prove(
    n.id,
    "winrt-registered",
    Boolean(r),
    r
      ? `${basename(r.dll) || "(no DllPath)"} type ${r.type}`
      : "absent de ActivatableClassId",
  );
  if (r?.dll) {
    const ex = await exportsFor(basename(r.dll));
    g.prove(
      n.id,
      "activation-export",
      Boolean(ex?.has("DllGetActivationFactory")),
      basename(r.dll),
    );
  }
  if (r && r.type === 0 && activateClasses)
    (toActivate.push(n.full), activateNodes.push(n.id));
}
// Activation grouped by host DLL: a factory that crashes the process is isolated with its DLL.
const byHost = new Map<string, { cls: string; node: number }[]>();
toActivate.forEach((cls, i) => {
  const k = reg.get(cls)!.dll.toLowerCase();
  (byHost.get(k) ?? byHost.set(k, []).get(k)!).push({
    cls,
    node: activateNodes[i]!,
  });
});
await proveIsolated(
  "RoGetActivationFactory",
  [...byHost.keys()].sort().map((k) => byHost.get(k)!),
  (x) => x.node,
  (items) => child({ kind: "activate", classes: items.map((x) => x.cls) }),
  32,
);
log(
  `WinRT: ${reg.size} classes registered; ${toActivate.length} factories activated`,
);

// Windows App SDK: activation registration (appxfragment) -> package DLL -> DllGetActivationFactory export.
const arch = process.arch === "arm64" ? "win-arm64" : "win-x64";
// Native DLLs of all SDK packages (a registration can target the DLL of a neighbouring package, e.g. WinUI -> dcompi.dll).
const wasdkDlls = new Map<string, string>();
for (const fr of new Set(fragments.map((f) => f.dir)))
  for (const d of ["runtimes-framework", "runtimes"])
    for (const p of files(join(fr, d, arch), /\.dll$/i))
      if (!wasdkDlls.has(basename(p).toLowerCase()))
        wasdkDlls.set(basename(p).toLowerCase(), p);
for (const id of dirs(nuget).filter((d) =>
  /^microsoft\.windowsappsdk(\.|$)/.test(d),
))
  for (const d of ["runtimes-framework", "runtimes"])
    for (const p of files(join(nuget, id, wasdkVersion, d, arch), /\.dll$/i))
      if (!wasdkDlls.has(basename(p).toLowerCase()))
        wasdkDlls.set(basename(p).toLowerCase(), p);
const factoryExport = new Map<string, boolean>();
for (const fr of fragments) {
  const xml = await Bun.file(fr.file).text();
  for (const s of xml.matchAll(
    /<InProcessServer>([\s\S]*?)<\/InProcessServer>/g,
  )) {
    const dll = /<Path>([^<]+)<\/Path>/.exec(s[1]!)?.[1]?.trim() ?? "";
    const p = wasdkDlls.get(basename(dll).toLowerCase());
    if (p && !factoryExport.has(p)) {
      const pe = parsePe(await Bun.file(p).arrayBuffer());
      factoryExport.set(
        p,
        Boolean(pe && exportsOf(pe).includes("DllGetActivationFactory")),
      );
    }
    const ok = Boolean(p && factoryExport.get(p));
    for (const c of s[1]!.matchAll(/ActivatableClassId="([^"]+)"/g)) {
      const t = shippedTypes.get(c[1]!);
      if (t)
        g.prove(
          t,
          "wasdk-activation",
          ok,
          p
            ? `${slash(relative(nuget, p))}${ok ? "" : " without DllGetActivationFactory"}`
            : `${dll} absent from the ${wasdkVersion} packages`,
        );
    }
  }
}

// .NET: every public reference type is exposed by the implementation assembly (TypeDef or resolved forwarder).
for (const { ref, impl } of netProofs) {
  if (!isDir(impl)) continue;
  const cache = new Map<string, Map<string, string>>();
  const expose = (asm: string) => {
    if (!cache.has(asm)) {
      const f = join(impl, `${asm}.dll`);
      cache.set(
        asm,
        Bun.file(f).size
          ? exposedTypes(readAssembly(readFileSync(f).buffer as ArrayBuffer))
          : new Map(),
      );
    }
    return cache.get(asm)!;
  };
  // Forwarders: followed by the enclosing type (nested types follow their enclosing type, ECMA-335 II.22.14).
  const locate = (asm0: string, type: string) => {
    const outer = type.split("+")[0]!;
    let asm = asm0;
    let how = expose(asm).get(outer);
    for (let hop = 0; how?.startsWith("forward:") && hop < 4; hop++)
      ((asm = how.slice(8)), (how = expose(asm).get(outer)));
    if (how === "typedef" && type !== outer) how = expose(asm).get(type);
    return { asm, how };
  };
  for (const [key, node] of ref) {
    const [file, type] = key.split("|") as [string, string];
    const { asm, how } = locate(basename(file, ".dll"), type);
    g.prove(
      node,
      "dotnet-impl",
      how === "typedef",
      how === "typedef" ? asm : `${how ?? "absent"} (${asm})`,
    );
  }
}
log(`proofs: ${g.proofs.length}`);

// ---------------------------------------------------------------- sorties
const graphDigest = g.digest("graph");
const proofDigest = g.digest("proofs");
const summary = new Map<string, { ok: number; total: number }>();
for (const p of g.proofs) {
  const s =
    summary.get(p.check) ??
    summary.set(p.check, { ok: 0, total: 0 }).get(p.check)!;
  s.total++;
  if (p.ok) s.ok++;
}
const kinds = Object.fromEntries(
  Object.entries(Object.groupBy(g.nodes, (n) => n.kind))
    .map(([k, v]) => [k, v!.length])
    .sort((a, b) => (b[1] as number) - (a[1] as number)),
);
const lockData = {
  schema: 1,
  date: new Date().toISOString().slice(0, 10),
  tool: {
    path: "sdk/tools/msindex",
    commit: repoState(nt).commit,
    bun: Bun.version,
  },
  machine: os,
  versions: {
    windowsAppSdk: wasdkVersion,
    msvc: msvcVer,
    ucrt: ucrtVer,
    apiSetSchema: schema.version,
  },
  nuget: {
    wdk: {
      id: wdkId,
      version: wdkVersion,
      sha512: await Bun.file(
        join(wdkDir, `${wdkId}.${wdkVersion}.nupkg.sha512`),
      )
        .text()
        .catch(() => ""),
    },
  },
  repos: Object.fromEntries(
    Object.entries(repos).map(([k, p]) => [k, repoState(p)]),
  ),
  inputs: inputs.sort((a, b) => (a.root + a.path < b.root + b.path ? -1 : 1)),
  digests: { graph: graphDigest, proofs: proofDigest },
  counts: {
    nodes: g.nodes.length,
    edges: g.edges.length,
    proofs: g.proofs.length,
    kinds,
  },
  proofs: Object.fromEntries([...summary].sort()),
};

if (verify) {
  if (!prev) throw new Error("--verify: docs/msindex/lock.json missing");
  const before = new Map(
    (prev.inputs as Input[]).map((i) => [`${i.root}:${i.path}`, i.sha256]),
  );
  const drift = lockData.inputs
    .filter((i) => before.get(`${i.root}:${i.path}`) !== i.sha256)
    .map((i) => `${i.root}:${i.path}`);
  const missing = [...before.keys()].filter(
    (k) => !lockData.inputs.some((i) => `${i.root}:${i.path}` === k),
  );
  const same = prev.digests.graph === graphDigest;
  console.log(
    JSON.stringify({
      inputsDrift: drift,
      inputsMissing: missing,
      graph: same ? "identical" : `${prev.digests.graph} -> ${graphDigest}`,
      proofs:
        prev.digests.proofs === proofDigest ? "identical" : "different",
    }),
  );
  if (drift.length || missing.length || !same) process.exit(1);
} else {
  g.write(join(nt, "target", "index", "msindex.sqlite"));
  await Bun.write(
    join(nt, "docs", "msindex", "lock.json"),
    `${JSON.stringify(lockData, null, 1)}\n`,
  );
  const L = [
    "# msindex: Microsoft stack indexed and proven on this machine",
    "",
    `Generated on ${lockData.date} by \`sdk/tools/msindex\` (\`just msindex <src>\`), verifiable with \`just msindex-verify <src>\`.`,
    `Machine: Windows ${os.caption} build ${os.build} (${os.lab}). Index: \`target/index/msindex.sqlite\` (tables node, edge, proof, fts).`,
    "",
    `Graph fingerprint: \`${graphDigest}\`; proofs: \`${proofDigest}\`.`,
    "",
    "## Sources",
    "",
    `- Win32 + WDK + WinRT: Windows.Win32.winmd and Windows.winmd of windows-rs (${rs.commit.slice(0, 10)}), Windows.Wdk.winmd (NuGet ${wdkId} ${wdkVersion}, SHA-512 verified).`,
    `- Windows App SDK ${wasdkVersion}: ${g.kids(wasdk).filter((n) => n.kind === "package").length} NuGet packages; WindowsAppSDK and microsoft-ui-xaml sources (${srcLinks.sourceTypes.size} IDL types, ${srcLinks.features.size} features).`,
    `- .NET: ${g
      .kids(net)
      .map((n) => n.name)
      .join(", ")} (reference packs and shared runtime).`,
    `- windows-rs: ${pkgs.length} crates of the nt monorepo.`,
    `- C/C++: UCRT ${ucrtVer} (${crt.declared} declarations, ${crt.linked} exported by ucrtbase.dll), ${crt.dlls} CRT/STL DLLs, MSVC \`import std\` ${msvcVer} (${crt.exported} names).`,
    `- API Sets: system schema v${schema.version}, ${schema.count} contracts.`,
    "",
    "## Proofs",
    "",
    "| check | passed | total | method |",
    "|---|---|---|---|",
    ...[...summary]
      .sort()
      .map(([k, v]) => `| ${k} | ${v.ok} | ${v.total} | ${METHOD[k] ?? ""} |`),
    "",
    "## Nodes by kind",
    "",
    ...Object.entries(kinds).map(([k, v]) => `- ${k}: ${v}`),
    "",
  ];
  await Bun.write(join(nt, "docs", "msindex", "README.md"), L.join("\n"));
  console.log(
    JSON.stringify({
      graph: graphDigest,
      proofs: proofDigest,
      nodes: g.nodes.length,
      edges: g.edges.length,
      checks: Object.fromEntries(summary),
    }),
  );
}
log("done");
