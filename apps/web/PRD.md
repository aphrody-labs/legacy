# PRD: `apps/web`

1. Serve static HTML (`en`, `fr`), `sitemap*.xml`, `robots.txt`, and `.well-known/*` linked to `aphrody-labs/aphrody`.
2. Host the Pure C11 -> WASI + WebAssembly 3.0 Material 3 Expressive UI studio (`public/m3/index.html` + `public/m3/aysys.wasm`, built from `src/ui/m3.c` + `src/ui/site_wasi.c`) and the freestanding Wayland compositor (`public/wayland.wasm`, built from `src/wasm/compositor.c`) rendered over WebGPU.
3. Maintain zero npm dependencies, zero `node_modules`, and zero bundlers.
