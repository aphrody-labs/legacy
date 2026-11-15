import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatDividerModule } from "@angular/material/divider";
import { MatToolbarModule } from "@angular/material/toolbar";

interface Target {
  title: string;
  text: string;
  label: string;
  href: string;
}

// Pure-C host of the canvas (aysys.wasm): copied next to index.html from web/public, it binds to the elements
// below by id once Angular has rendered them.
const HOST = "/m3/m3-host.js";

@Component({
  selector: "ay-root",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatDividerModule, MatToolbarModule],
  styleUrl: "./app.scss",
  templateUrl: "./app.html",
})
export class App {
  protected readonly targets: Target[] = [
    {
      title: "Pure C11 + WebAssembly 3.0 + WebGPU + WASI",
      text: "Freestanding -std=gnu11 core (aysys.wasm + ay-m3-site.wasm) sharing exact M3 tokens, spring physics, and adaptive layout.",
      label: "Open M3 Wasm Studio",
      href: "/m3/",
    },
    {
      title: "Android NDK + Jetpack Compose + Flutter M3",
      text: "Compose-first Expressive springs (damping 0.6 / stiffness 800), Theme.kt, ndk_theme.h, and aphrody_theme.dart from one seed.",
      label: "Wayland Wasm (wasm32)",
      href: "/wayland/",
    },
    {
      title: "Rust + Pure Bun + WinUI 3 + Figma & Stitch",
      text: "Zero-drift adapters for Taffy, egui, iced, libcosmic, Bevy, Leptos, Dioxus, Tauri, React, WinUI 3, DESIGN.md, and Stitch.",
      label: "GitHub Repository",
      href: "https://github.com/aphrody-labs/aphrody",
    },
  ];

  constructor() {
    afterNextRender(() => {
      const src: string = HOST;
      void import(/* @vite-ignore */ src);
    });
  }
}
