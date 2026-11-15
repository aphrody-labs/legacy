// Bun plugin: `import svg from "m3:icon/rounded/<name>?size=24&fill=1"` returns the Material Symbols
// Rounded (Apache-2.0) SVG as a string, colored by currentColor. Single source: the output of `ay brand build`
// (assets/brand/gen/symbols/svg/, [symbols] subset of brand.toml, optimized by usvg); a name
// missing from brand.toml is a build error, not a download.
import type { BunPlugin } from "bun";
import { join } from "node:path";

const ROOT = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "assets",
  "brand",
  "gen",
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
      `symbol missing from assets/brand/gen/symbols: ${name} (add it to [symbols] in brand.toml, then ay brand build)`,
    );
  const svg = await file.text();
  return svg.replace(
    / width="\d+" height="\d+"/,
    ` width="${size}" height="${size}"`,
  );
}

/** Names of the generated symbols ([symbols] subset of brand.toml), sorted. */
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
