// Bun plugin: `import svg from "m3:icon/rounded/<name>?size=24&fill=1"` returns the Material Symbols
// Rounded (Apache-2.0) SVG as a string, colored by currentColor. Single source: packages/design/symbols/svg/; a name
// missing there is a build error, not a download.
import type { BunPlugin } from "bun";
import { join } from "node:path";

const ROOT = join(
  import.meta.dir,
  "..",
  "symbols",
  "svg",
);

export async function symbolSvg(
  style: string,
  name: string,
  size = 24,
  fill = false,
): Promise<string> {
  if (style !== "rounded" || !/^[a-z0-9_]+$/.test(name))
    throw new Error(
      `invalid symbol: ${style}/${name} (only rounded is generated)`,
    );
  const file = Bun.file(join(ROOT, `${name}${fill ? "-fill" : ""}.svg`));
  if (!(await file.exists()))
    throw new Error(
      `symbol missing from packages/design/symbols: ${name}`,
    );
  const svg = await file.text();
  return svg.replace(
    / width="\d+" height="\d+"/,
    ` width="${size}" height="${size}"`,
  );
}

/** Names of the symbols of packages/design/symbols, sorted. */
export async function generatedSymbols(): Promise<string[]> {
  const json = (await Bun.file(
    join(ROOT, "..", "symbols.json"),
  ).json()) as Record<string, unknown>;
  return Object.keys(json).sort();
}

export const symbolsPlugin: BunPlugin = {
  name: "aphrody-design-symbols",
  setup(build) {
    build.onResolve({ filter: /^m3:icon\// }, (a) => ({
      path: a.path,
      namespace: "m3-icon",
    }));
    build.onLoad({ filter: /.*/, namespace: "m3-icon" }, async (a) => {
      const [path, query = ""] = a.path.slice("m3:icon/".length).split("?");
      const [style, name] = path.split("/");
      const q = new URLSearchParams(query);
      const svg = await symbolSvg(
        style,
        name,
        Number(q.get("size") ?? 24),
        q.get("fill") === "1",
      );
      return {
        contents: `export default ${JSON.stringify(svg)};`,
        loader: "js",
      };
    });
  },
};
