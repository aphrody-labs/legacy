// Installs Gemini Desktop non-interactively from the official installer (default: var/GeminiSetup.exe, outside the repository).
// GeminiSetup.exe is the Chromium Updater meta-installer (chrome/updater, "Google Installer (x86)"): payload
// compressed in the PE resource B7/UPDATER, Omaha tag (appguid, appname=Gemini, needsadmin=false) in the
// signature's dummy certificate. Surveyed on 2026-11-14 on 159.0.8140.0: `--silent` installs per user
// in %LOCALAPPDATA%\Google\Gemini, code 0, no elevation. Refuses any file not signed "Google LLC".
// Usage : bun packages/machine/src/gemini-setup.ts [chemin] [--check]   (just gemini-setup)
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC = resolve(import.meta.dir, "..", "..", "..");
const args = process.argv.slice(2);
const check = args.includes("--check");
const exe = resolve(
  args.find((a) => !a.startsWith("--")) ?? join(SRC, "var", "GeminiSetup.exe"),
);
const ps = (script: string) => {
  const r = Bun.spawnSync(
    ["pwsh", "-NoProfile", "-NonInteractive", "-c", script],
    { stdout: "pipe", stderr: "pipe" },
  );
  return r.stdout.toString().trim();
};
/** Installed version (per-user uninstall key), otherwise empty string. */
const installed = () =>
  ps(
    "(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -EA 0 | ? { $_.DisplayName -eq 'Gemini' -and $_.Publisher -match 'Google' } | select -First 1).DisplayVersion",
  );

if (process.platform !== "win32")
  throw new Error("gemini-setup : Windows seulement");
const before = installed();
if (check) {
  console.log(before ? `ok   Gemini ${before}` : "DIFF Gemini missing");
  process.exitCode = before ? 0 : 1;
} else if (before) {
  console.log(
    `ok   Gemini ${before} already installed (updates by Google Updater)`,
  );
} else {
  if (!existsSync(exe))
    throw new Error(
      `installer missing: ${exe} (https://gemini.google/desktop/)`,
    );
  const sig = ps(
    `$s = Get-AuthenticodeSignature -LiteralPath '${exe.replaceAll("'", "''")}'; "$($s.Status)|$($s.SignerCertificate.Subject)"`,
  );
  if (!/^Valid\|CN=Google LLC, O=Google LLC,/.test(sig))
    throw new Error(`signature refusée : ${sig || "aucune"}`);
  const r = Bun.spawnSync([exe, "--silent"], {
    stdout: "ignore",
    stderr: "ignore",
    timeout: 600_000,
  });
  const after = installed();
  if (r.exitCode !== 0 || !after)
    throw new Error(`installation en échec (code ${r.exitCode})`);
  console.log(`set  Gemini ${after} installé`);
}
