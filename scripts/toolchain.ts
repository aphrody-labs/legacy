#!/usr/bin/env bun
// The one LLVM toolchain of src: Chromium's clang/lld/llvm-* and the rustc Chromium builds on the same
// LLVM, pinned by the `third_party/toolchain-<milestone>.toml` that rust-toolchain.toml names (docs/native/llvm/CHROMIUM-TOOLCHAIN.md).
// Downloads the host's packages from Chromium's public bucket (source_url), checks source_sha256, unpacks them
// under $AY_TOOLCHAIN_DIR (default ~/.local/share/aphrody/toolchain/<milestone>) and links the rust package as
// the rustup toolchain `chromium-<milestone>` that rust-toolchain.toml names.
//   bun scripts/toolchain.ts install   idempotent: skips packages already unpacked, replaces stale ones
//   bun scripts/toolchain.ts status    paths, clang and rustc versions checked against the manifest
//   bun scripts/toolchain.ts env       CC/CXX/AR/linker/LLVM tool lines for a shell (eval "$(...)")
//   bun scripts/toolchain.ts bin       the clang/bin directory (PATH entry: clang, ld.lld, llvm-cov, clang-tidy, ...)
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const root = join(import.meta.dir, "..");
// The generation is the one rust-toolchain.toml names (`chromium-<milestone>`): a bump is that line plus the new
// third_party/toolchain-<milestone>.toml, nothing in this script or in CI names a number.
const channel = (
  Bun.TOML.parse(await Bun.file(join(root, "rust-toolchain.toml")).text()) as {
    toolchain: { channel: string };
  }
).toolchain.channel;
const named = /^chromium-(\d+)$/.exec(channel);
if (!named) throw new Error(`rust-toolchain.toml channel "${channel}" is not chromium-<milestone>`);
const manifestName = `toolchain-${named[1]}.toml`;
const manifest = Bun.TOML.parse(
  await Bun.file(join(root, "third_party", manifestName)).text(),
) as {
  toolchain: {
    chromium: string;
    llvm_version: string;
    clang_version: string;
    rustc_version: string;
  };
  file: {
    platform: string;
    package: string;
    source_url: string;
    source_sha256: string;
  }[];
};
const milestone = manifest.toolchain.chromium.split(".")[0];
const platform =
  process.platform === "win32"
    ? "windows-x64"
    : process.platform === "linux" && process.arch === "x64"
      ? "linux-x64"
      : "";
const dir =
  process.env.AY_TOOLCHAIN_DIR ||
  join(homedir(), ".local/share/aphrody/toolchain", milestone);
const RUSTUP_NAME = channel;
const exe = process.platform === "win32" ? ".exe" : "";
const kind = (pkg: string) =>
  pkg.startsWith("rust-toolchain") ? "rust" : "clang";

async function install(): Promise<number> {
  if (!platform) {
    console.error(
      `toolchain: no Chromium ${milestone} package for ${process.platform}-${process.arch}`,
    );
    return 2;
  }
  const files = manifest.file.filter((x) => x.platform === platform);
  // A kind (clang, rust) whose stamp is not the manifest's holds an older revision: wipe it before unpacking
  // (the clang dir takes three packages, so it is wiped once and every package of the kind is unpacked again).
  for (const k of ["clang", "rust"]) {
    const dest = join(dir, k);
    const stale = files
      .filter((f) => kind(f.package) === k)
      .some((f) => !existsSync(join(dest, `.${f.package}`)));
    if (stale) rmSync(dest, { recursive: true, force: true });
  }
  for (const f of files) {
    const dest = join(dir, kind(f.package));
    const stamp = join(dest, `.${f.package}`);
    if (existsSync(stamp)) continue;
    const res = await fetch(f.source_url);
    if (!res.ok) throw new Error(`${f.source_url}: HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const sha = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    if (sha !== f.source_sha256)
      throw new Error(`${f.package}: sha256 ${sha} != ${f.source_sha256}`);
    const tmp = join(tmpdir(), `${f.package}.tar.xz`);
    await Bun.write(tmp, bytes);
    mkdirSync(dest, { recursive: true });
    // Archive on stdin, cwd = dest: no drive-letter path for tar (GNU tar of Git for Windows reads `C:...`
    // as host:path, "Cannot connect to C: resolve failed", hal run 43368917150).
    await $`tar -xJf - < ${tmp}`.cwd(dest);
    rmSync(tmp, { force: true });
    writeFileSync(stamp, `${f.source_sha256}\n`);
    console.log(`installed ${f.package} -> ${dest}`);
  }
  await $`rustup toolchain link ${RUSTUP_NAME} ${join(dir, "rust")}`;
  console.log(`rustup toolchain ${RUSTUP_NAME} -> ${join(dir, "rust")}`);
  return status();
}

async function status(): Promise<number> {
  // Chromium's Windows package ships clang-cl and lld-link only (no clang driver).
  const bin = join(dir, "clang/bin");
  const lld = join(bin, process.platform === "win32" ? "lld-link.exe" : "ld.lld");
  const clang = join(
    bin,
    process.platform === "win32" ? "clang-cl.exe" : "clang",
  );
  const rustc = join(dir, "rust/bin", `rustc${exe}`);
  console.log(
    `dir ${dir}  expected ${manifest.toolchain.clang_version}; ${manifest.toolchain.rustc_version}, LLVM ${manifest.toolchain.llvm_version}`,
  );
  let ok = true;
  for (const [name, bin, args] of [
    ["clang", clang, ["--version"]],
    ["lld", lld, ["--version"]],
    ["rustc", rustc, ["-vV"]],
  ] as const) {
    if (!existsSync(bin)) {
      console.log(`${name}: missing (bun scripts/toolchain.ts install)`);
      ok = false;
      continue;
    }
    // lld-link prints its usage on --version failure paths: only the first line is kept either way.
    const out = (await $`${bin} ${args}`.nothrow().text()).split("\n");
    const line =
      name === "rustc"
        ? out.filter((l) => /^(release|LLVM version):/.test(l)).join(", ")
        : out[0];
    console.log(`${name}: ${line}`);
    const want =
      name === "clang"
        ? manifest.toolchain.clang_version.match(/llvm-project (\w{8})/)?.[1]
        : name === "rustc"
          ? manifest.toolchain.llvm_version
          : undefined;
    if (want && !out.join("\n").includes(want)) {
      console.log(`${name}: does not match the manifest (${want})`);
      ok = false;
    }
  }
  return ok ? 0 : 1;
}

function env(): number {
  const bin = join(dir, "clang/bin");
  if (process.platform === "win32") {
    // MSVC ABI: clang-cl compiles, lld-link links (LTO objects need an LLVM-aware linker, not link.exe).
    console.log(
      [
        `export CC=${join(bin, "clang-cl.exe")} CXX=${join(bin, "clang-cl.exe")}`,
        `export RUSTFLAGS="-Clinker-plugin-lto -Clinker=${join(bin, "lld-link.exe")}"`,
      ].join("\n"),
    );
    return 0;
  }
  console.log(
    [
      `export CC=${join(bin, "clang")} CXX=${join(bin, "clang++")} AR=${join(bin, "llvm-ar")}`,
      `export LLVM_PROFDATA=${join(bin, "llvm-profdata")} LLVM_COV=${join(bin, "llvm-cov")} LLVM_OBJDUMP=${join(bin, "llvm-objdump")}`,
      `export RUSTFLAGS="-Clinker-plugin-lto -Clinker=${join(bin, "clang")} -Clink-arg=-fuse-ld=lld"`,
    ].join("\n"),
  );
  return 0;
}

// `bin` prints the directory of clang, lld and the llvm-* tools: `bun scripts/toolchain.ts bin >> $GITHUB_PATH`.
const cmd = process.argv[2] ?? "status";
if (cmd === "bin") {
  console.log(join(dir, "clang/bin"));
  process.exit(0);
}
process.exit(
  cmd === "install" ? await install() : cmd === "env" ? env() : await status(),
);
