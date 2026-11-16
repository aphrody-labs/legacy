# Design system

- Tokens: [`packages/design`](../../packages/design) generates them from `design.toml` (seed, variant, typeface) with Material Color Utilities: CSS, JSON, Rust, Zig, themes and the Figma sync files in `tokens/`. Rules for the generator: [`DESIGN.md`](../../packages/design/DESIGN.md).
- Rust core: [`src/ui/kit`](../../src/ui/kit), one crate with `color`, `components` (Material 3 contracts), `layout` (CSS and Tailwind lowered to `taffy`), `fusion` (shared UI kinds rendered to every target), `react`, `next` and `shared`. The feature list is in its `Cargo.toml`.
- Icons: Material Symbols subset in [`packages/design/symbols`](../../packages/design/symbols).
- The UI framework is free; the criteria are rendering quality, performance and function. Tokens stay the single source whatever the framework.
- Skills: `ui-system` (rules before any interface work), `material-3`, `vercel-geist`, `web-quality`, `webgpu-wasm-ui`.
