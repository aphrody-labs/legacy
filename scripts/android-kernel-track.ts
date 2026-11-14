// Tracker for an Android GKI branch (default android18-7.3) of android.googlesource.com/kernel/common.
// Runs where the blobless clone lives (fr2: /srv/research/android/common-<branch>), fetches, then emits JSON:
// head, upstream base and stable sublevel, patch classes, KMI symbol lists, toolchain pins, Rust, defconfig.
// Usage: bun scripts/android-kernel-track.ts [branch] [clone-dir] > state.json
const branch = process.argv[2] ?? "android18-7.3";
const dir = process.argv[3] ?? `/srv/research/android/common-${branch}`;
const git = (...a: string[]) => {
  const p = Bun.spawnSync(["git", "-C", dir, ...a], { stdout: "pipe", stderr: "pipe" });
  return p.exitCode === 0 ? p.stdout.toString().trim() : "";
};
const show = (path: string) => git("show", `HEAD:${path}`);
const lines = (s: string) => (s ? s.split("\n") : []);

git("fetch", "-q", "--filter=blob:none", "origin", branch);
git("reset", "-q", "--soft", "FETCH_HEAD"); // tracker clone only: move HEAD to the fetched tip

const mk = show("Makefile");
const mv = (k: string) => mk.match(new RegExp(`^${k} = (.*)$`, "m"))?.[1]?.trim() ?? "";
const kernel = `${mv("VERSION")}.${mv("PATCHLEVEL")}.${mv("SUBLEVEL")}${mv("EXTRAVERSION")}`;
const base = `v${mv("VERSION")}.${mv("PATCHLEVEL")}`;
// Upstream tags are not fetched in the blobless single-branch clone: resolve the base from the
// "Merge tag 'vX.Y' into android-mainline" commit (second parent = the tag commit).
const baseMerge = git("log", "--merges", "-n", "1", "--format=%H", `--grep=^Merge tag '${base}' into`, "HEAD");
const baseRef = git("rev-parse", "-q", "--verify", `${base}^{commit}`) || (baseMerge ? git("rev-parse", `${baseMerge}^2`) : "");
const hasBase = baseRef !== "";

const subjects = hasBase ? lines(git("log", "--no-merges", "--format=%s", `${baseRef}..HEAD`)) : [];
const classes: Record<string, number> = {};
for (const s of subjects) {
  const k = s.match(/^(ANDROID|UPSTREAM|BACKPORT|FROMGIT|FROMLIST|Revert|CHROMIUM|NOUPSTREAM)\b/)?.[1] ?? "other";
  classes[k] = (classes[k] ?? 0) + 1;
}
const stableMerges = lines(git("log", "--merges", "--format=%h %cs %s", "-n", "5", "--grep=^Merge .*7\\.[0-9]", "HEAD"));
const androidAreas: Record<string, number> = {};
if (hasBase)
  for (const f of lines(git("log", "--no-merges", "--grep=^ANDROID:", "--name-only", "--format=", `${baseRef}..HEAD`))) {
    const top = f.split("/").slice(0, 2).join("/");
    androidAreas[top] = (androidAreas[top] ?? 0) + 1;
  }
const topAreas = Object.entries(androidAreas).sort((a, b) => b[1] - a[1]).slice(0, 20);

const ls = (p: string) => lines(git("ls-tree", "--name-only", `HEAD:${p}`));
// Kleaf-only branches have no build.config.*: read pins wherever they are declared.
const constants = Object.fromEntries(
  lines(git("grep", "-h", "-E", "^(CLANG_VERSION|RUSTC_VERSION|LLVM_VERSION|KMI_GENERATION)=", "HEAD"))
    .map((l) => l.replace(/^HEAD:/, "").match(/^([A-Z_]+)="?([^"]*)"?$/))
    .filter(Boolean)
    .map((m) => [m![1], m![2]]),
);
const bazel = show("BUILD.bazel");
const defconfig = lines(show("arch/arm64/configs/gki_defconfig"));
const cfg = (k: string) => defconfig.find((l) => l.startsWith(`CONFIG_${k}=`))?.split("=")[1] ?? null;
const rustFiles = lines(git("ls-tree", "-r", "--name-only", "HEAD")).filter((f) => f.endsWith(".rs"));
const rustAreas: Record<string, number> = {};
for (const f of rustFiles) rustAreas[f.split("/").slice(0, 2).join("/")] = (rustAreas[f.split("/").slice(0, 2).join("/")] ?? 0) + 1;

console.log(
  JSON.stringify(
    {
      branch,
      fetched: new Date().toISOString(),
      head: { commit: git("rev-parse", "HEAD"), date: git("log", "-1", "--format=%cI"), subject: git("log", "-1", "--format=%s") },
      kernel,
      upstream_base: hasBase ? base : null,
      commits_since_base: subjects.length,
      patch_classes: classes,
      recent_stable_merges: stableMerges,
      android_patch_areas: Object.fromEntries(topAreas),
      kmi: {
        symbol_lists: ls("gki/aarch64/symbols").length,
        abi_files: ls("gki/aarch64").filter((f) => /\.(stg|xml)$|abi/.test(f)),
        protected_exports: lines(show("gki/aarch64/protected_exports")).filter((l) => l && !l.startsWith("[")).length,
        base_symbols: lines(show("gki/aarch64/symbols/base")).filter((l) => /^\s+\w/.test(l)).length,
        enforced: /^\s*kmi_enforced = True/m.test(bazel),
        abi_definition: /^\s*abi_definition_stg = "/m.test(bazel),
        phase: /^\s*kmi_enforced = True/m.test(bazel) ? "kmi-tracking-or-frozen" : "development",
      },
      toolchain: constants,
      defconfig: {
        lines: defconfig.length,
        RUST: cfg("RUST"),
        ANDROID_BINDER_IPC_RUST: cfg("ANDROID_BINDER_IPC_RUST"),
        ASHMEM_RUST: cfg("ASHMEM_RUST"),
        LTO_CLANG_THIN: cfg("LTO_CLANG_THIN"),
        CFI_CLANG: cfg("CFI_CLANG"),
        SHADOW_CALL_STACK: cfg("SHADOW_CALL_STACK"),
        BPF_JIT: cfg("BPF_JIT"),
        FUSE_BPF: cfg("FUSE_BPF"),
      },
      rust: { files: rustFiles.length, areas: Object.fromEntries(Object.entries(rustAreas).sort((a, b) => b[1] - a[1]).slice(0, 15)) },
    },
    null,
    1,
  ),
);
