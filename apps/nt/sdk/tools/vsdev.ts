// Runs a command in the Visual Studio 2026 developer environment (Build Tools or IDE), without a manual vcvars:
//   bun sdk/tools/vsdev.ts <command> [arguments…]      e.g. bun ../vsdev.ts cmake --workflow --preset windows
// 1. vswhere (%ProgramFiles(x86)%\Microsoft Visual Studio\Installer) finds the latest installation with MSVC;
// 2. VsDevCmd.bat -arch=<x64|arm64> -host_arch=<x64|arm64> (Learn "Use the Microsoft C++ toolset from the command line")
//    provides cl, link, the Windows SDK, VCPKG_ROOT (component Microsoft.VisualStudio.Component.Vcpkg) and VSCMD_ARG_TGT_ARCH;
// 3. The pinned CMake 4.5.0 and Ninja 1.13.2 (sdk/tools/fetch-tools.ts) come before those of VS in PATH.
// Target: NT_ARCH=arm64|x64 (default: host architecture). VCPKG_ROOT fallback: VCPKG_INSTALLATION_ROOT (GitHub runners).
import { join } from "node:path";

const [cmd, ...args] = Bun.argv.slice(2);
if (!cmd) throw new Error("usage: bun sdk/tools/vsdev.ts <command> [arguments…]");
if (process.platform !== "win32") throw new Error("vsdev.ts: Windows only");

const tools = import.meta.dir;
const host = process.arch === "arm64" ? "arm64" : "x64";
const target = process.env.NT_ARCH ?? host;
const vsArch = (a: string) => (a === "arm64" ? "arm64" : "amd64"); // valeurs de VsDevCmd -arch / -host_arch
const component = `Microsoft.VisualStudio.Component.VC.Tools.${target === "arm64" ? "ARM64" : "x86.x64"}`;

const vswhere = join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft Visual Studio", "Installer", "vswhere.exe");
const found = Bun.spawnSync([vswhere, "-latest", "-products", "*", "-requires", component, "-property", "installationPath"]);
const vs = found.stdout.toString().trim();
if (!vs) throw new Error(`vsdev.ts: no Visual Studio installation with ${component} (winget configure .config/configuration.winget)`);

// cmd /s strips the first and last quote: the line must stay verbatim.
const bat = join(vs, "Common7", "Tools", "VsDevCmd.bat");
const dump = Bun.spawnSync(["cmd.exe", "/d", "/s", "/c", `""${bat}" -arch=${vsArch(target)} -host_arch=${vsArch(host)} -no_logo && set"`], {
  windowsVerbatimArguments: true,
});
if (dump.exitCode !== 0) throw new Error(`vsdev.ts: VsDevCmd.bat failed (${dump.exitCode})\n${dump.stderr}`);

const env: Record<string, string> = {};
for (const line of dump.stdout.toString().split(/\r?\n/)) {
  const eq = line.indexOf("=");
  if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1);
}
const pathKey = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "Path";
const cmakeBin = join(tools, "cmake", `cmake-4.5.0-windows-${target === "arm64" ? "arm64" : "x86_64"}`, "bin");
env[pathKey] = [cmakeBin, join(tools, "ninja"), env[pathKey]].join(";");
env.VCPKG_ROOT ??= process.env.VCPKG_ROOT ?? process.env.VCPKG_INSTALLATION_ROOT ?? "";
if (!env.VCPKG_ROOT) console.warn("vsdev.ts: VCPKG_ROOT missing (component Microsoft.VisualStudio.Component.Vcpkg or vcpkg clone)");

const exe = Bun.which(cmd, { PATH: env[pathKey] });
if (!exe) throw new Error(`vsdev.ts: ${cmd} not found in PATH`);
const run = Bun.spawnSync([exe, ...args], {
  env,
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(run.exitCode ?? 1);
