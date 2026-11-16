#!/usr/bin/env bun
// Bundles the Workers entry into dist/aphrody-sites.js, resolving the monorepo packages from their sources
// so the build works before and without `bun install` links. Usage: bun build.ts
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..", "..")
const alias: Record<string, string> = {
  "@aphrody/runtime-adapter": resolve(root, "system/release/runtime-adapter/src/index.ts"),
}

const result = await Bun.build({
  entrypoints: [resolve(import.meta.dir, "src/entry.cf.ts")],
  outdir: resolve(import.meta.dir, "dist"),
  naming: "aphrody-sites.js",
  target: "browser",
  format: "esm",
  minify: true,
  plugins: [{
    name: "aphrody-workspace",
    setup(b) {
      b.onResolve({ filter: /^@aphrody\/runtime-adapter$/ }, () => ({ path: alias["@aphrody/runtime-adapter"]! }))
    },
  }],
})
if (!result.success) {
  for (const l of result.logs) console.error(l)
  process.exit(1)
}
console.log(result.outputs.map((o) => `${o.path} ${o.size} bytes`).join("\n"))
