// Builds the extension into apps/extension/dist: scripts bundled by Bun.build, static files, M3 tokens from
// @auto/ui and PNG icons from @auto/ui/icone (no binary image is versioned). `--zip` produces the Chrome Web Store
// package (dist/auto-extension-<version>.zip, without development files). `_locales/<tag>/messages.json` (manifest
// name and description) is generated from the catalogs in locales/.
import { SOURCE_LOCALE } from "@auto/i18n";
import { icone } from "@auto/ui/icone";
import { catalogs } from "../src/i18n";

const racine = new URL("..", import.meta.url);
const DIST = new URL("dist/", racine);
const chemin = (u: URL) => Bun.fileURLToPath(u);

export const TAILLES = [16, 32, 48, 128] as const;

/**
 * `hotes` adds host permissions to the manifest (end-to-end tests on 127.0.0.1 only: an optional permission
 * cannot be granted without the user).
 */
export async function construire(o: { dist?: URL; hotes?: string[] } = {}): Promise<string[]> {
  const dist = o.dist ?? DIST;
  await Bun.$`rm -rf ${chemin(dist)}`.quiet();
  const r = await Bun.build({
    entrypoints: ["service-worker.ts", "popup.ts"].map((f) => chemin(new URL(`src/${f}`, racine))),
    outdir: chemin(dist),
    target: "browser",
    format: "esm",
    naming: "[name].[ext]",
    minify: false,
  });
  if (!r.success) throw new AggregateError(r.logs, "Bun.build failed");
  for (const f of ["popup.html", "popup.css"])
    await Bun.write(new URL(f, dist), Bun.file(new URL(`static/${f}`, racine)));
  const manifeste = await Bun.file(new URL("static/manifest.json", racine)).json();
  if (o.hotes?.length) manifeste.host_permissions = [...manifeste.host_permissions, ...o.hotes];
  await Bun.write(
    new URL("manifest.json", dist),
    `${JSON.stringify({ ...manifeste, default_locale: SOURCE_LOCALE }, null, 2)}\n`,
  );
  // Chrome's own locale folders use underscores (pt_BR); one folder per catalog present.
  for (const [tag, catalogue] of Object.entries(catalogs))
    await Bun.write(
      new URL(`_locales/${tag.replace("-", "_")}/messages.json`, dist),
      `${JSON.stringify({ extName: { message: catalogue["ext.manifest.name"] }, extDescription: { message: catalogue["ext.manifest.description"] } }, null, 2)}\n`,
    );
  await Bun.write(new URL("tokens.css", dist), Bun.file(new URL("../../packages/ui/src/tokens.css", racine)));
  for (const t of TAILLES) await Bun.write(new URL(`icons/icon-${t}.png`, dist), icone(t));
  return [...new Bun.Glob("**/*").scanSync({ cwd: chemin(dist) })].sort();
}

if (import.meta.main) {
  const fichiers = await construire();
  console.log(`dist: ${fichiers.join(", ")}`);
  if (Bun.argv.includes("--zip")) {
    const { version } = (await Bun.file(new URL("static/manifest.json", racine)).json()) as { version: string };
    const contenu = Object.fromEntries(
      await Promise.all(fichiers.map(async (f) => [f, await Bun.file(new URL(f, DIST)).bytes()] as const)),
    );
    const zip = chemin(new URL(`auto-extension-${version}.zip`, DIST));
    await Bun.Archive.write(zip, contenu, { format: "zip", mtime: 0 });
    console.log(`package: ${zip}`);
  }
}
