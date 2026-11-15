// Build delegate required by `cf deploy` (no other use of vite in this Worker).
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [cloudflare()] });
