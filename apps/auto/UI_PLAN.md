# UI plan of auto: native Rust and web stacks

Assessment of 2026-11-12, no rewrite. Current surfaces: `apps/web` (React, Tailwind 4, Material 3, served by
`Bun.serve`), `apps/desktop` (Tauri, WebView), `apps/extension` (Chrome MV3), Android build through Tauri. Stars and
last push read from the GitHub API the same day; local mirrors in `third_party/`: `dioxus`, `blitz`,
`dioxus-components`, `gpui-kit`, `nsh` (taffy, parley, vello and anyrender are not mirrored).

## Coverage and maturity

| Project            | Role                                        | Platforms                                                               | Version (mirror)   |  Stars | Last push  |
| ------------------ | ------------------------------------------- | ----------------------------------------------------------------------- | ------------------ | -----: | ---------- |
| dioxus             | reactive framework (RSX, signals, fullstack)| web (wasm), SSR, desktop and mobile (WebView), native through blitz     | 0.8.0-alpha.3      | 39,731 | 2026-11-11 |
| blitz              | native HTML/CSS engine (Stylo, Taffy)       | Windows, macOS, Linux, Android; iOS in progress                         | 0.3.0-beta.4       |  4,450 | 2026-11-12 |
| taffy              | flexbox, grid, block layout                 | all (pure library)                                                      | stable             |  3,774 | 2026-11-11 |
| vello              | GPU 2D rendering (wgpu, compute)            | everywhere wgpu runs, web through WebGPU                                | 0.11.0             |  4,490 | 2026-11-11 |
| parley             | text shaping and editing                    | all (pure library)                                                      | 0.12.0             |    785 | 2026-11-12 |
| anyrender          | 2D rendering abstraction (vello, skia, CPU) | all                                                                     | -                  |    119 | 2026-11-12 |
| dioxus-components  | accessible components (shadcn style)        | those of dioxus                                                         | -                  |    355 | 2026-10-24 |
| gpui-kit           | GPUI components (ex gpui-component), 75+    | Windows, macOS, Linux; web as wasm32                                    | 0.9.1              | 20,467 | 2026-11-12 |
| gpui-fast          | GPUI extracted from Zed, published alone    | Windows, macOS, Linux (Vulkan), web                                     | 0.1.14 (crates.io) |    593 | 2026-11-12 |
| nsh (Native Shell) | declarative UI rendered as native views     | iOS 15+, Android 8+, macOS 14+, Windows 10, Linux GTK 4, web, GPUI, TUI | -                  |  2,601 | 2026-11-12 |

## Fit per surface

| auto surface                  | Dioxus (web, WebView, blitz)                                                              | gpui-kit / gpui-fast                                                    | nsh                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Web dashboard                 | good: wasm + SSR, but rewrites React, Material 3 and the Craft suite (already wasm)       | weak: canvas rendering in wasm, SEO, web accessibility and links limited | medium: HTML output, young on the web side                         |
| Desktop application           | good in WebView (same code as the web); blitz still beta for dense forms                  | very good: native, fast, editors, virtualized tables, AccessKit         | medium: native views per OS, GPUI backend in development           |
| Mobile (iOS, Android)         | medium: WebView through dioxus-mobile; blitz Android usable, iOS not                      | absent                                                                  | very good: UIKit and Android views, embeddable in a native app     |
| Browser extension             | medium: wasm possible, but the current HTML popup is simpler                              | unsuitable                                                              | unsuitable                                                         |
| Automation screens (graph)    | good: vello canvas or SVG, state shared with the web                                      | very good: GPU canvas, editor performance                               | medium: canvas primitives                                          |

## Recommendation

1. Web: keep the current stack (React, Tailwind, M3); nothing is gained by rewriting the dashboard as long as the
   Rust automation engine does not exist.
2. Desktop: prototype a gpui-kit client (on gpui-fast) for the inbox, the invoices and the workflow editor, above
   the existing HTTP API; it would replace Tauri where the WebView limits (long lists, OCR).
3. Mobile: evaluate nsh for a capture app (invoice photos, notifications), the only native iOS and Android candidate.
4. Dioxus and blitz: to follow; revisit when blitz leaves beta and when dioxus 0.8 is stable. Taffy, parley and
   vello stay useful as libraries (layout and rendering of PDFs and the graph), whatever the framework.
5. Every surface follows the Design-First rule of the repository (specification and `DESIGN.md` before the code).
