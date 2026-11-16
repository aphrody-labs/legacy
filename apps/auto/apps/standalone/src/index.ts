// Compiled launcher: an explicit command avoids starting a service by accident.
// The WebAuthn X.509 validation uses tsyringe: initialize the metadata before the deferred imports.
import "reflect-metadata";
const dossier = new URL("./", Bun.pathToFileURL(process.execPath));
Bun.env.AUTO_FFI_LIB ??= Bun.fileURLToPath(
  new URL(process.platform === "win32" ? "auto_ffi.dll" : "libauto_ffi.so", dossier),
);
Bun.env.AUTO_MIGRATIONS_DIR ??= Bun.fileURLToPath(new URL("migrations/", dossier));
Bun.env.AUTO_PUBLIC_DIR ??= Bun.fileURLToPath(new URL("public/", dossier));
const commande = Bun.argv[2];
if (!commande || commande === "--help" || commande === "-h") {
  console.log(
    "auto <api|worker|web|migrate>\nauto <agent|mcp|tools|flows>\nConfiguration: Auto environment variables.",
  );
} else {
  switch (commande) {
    case "api":
      await import("../../api/src/index");
      break;
    case "worker":
      await import("../../worker/src/index");
      break;
    case "web":
      await import("../../web/src/index");
      break;
    case "migrate":
      await import("../../../packages/store/src/migrate");
      break;
    case "agent":
    case "mcp":
    case "tools":
    case "flows":
    case "outils":
    case "flux":
      await import("../../cli/src/cli");
      break;
    default:
      console.error(`Unknown command: ${commande}. Use auto --help.`);
      process.exitCode = 1;
  }
}
