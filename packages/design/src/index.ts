// @aphrody/design: Material 3 tokens generated from packages/design/design.toml (see src/build.ts).
import tokens from "../tokens/tokens.json";

export { tokens };
export type Mode = keyof typeof tokens.color;
export type Role = keyof typeof tokens.color.light;

/** Hex of an M3 role (e.g. role("primary", "dark")). */
export const role = (name: Role, mode: Mode = "light"): string =>
  tokens.color[mode][name];

/** 24-bit SGR sequence for a role (TUI), foreground or background. */
export function ansi(name: Role, mode: Mode = "dark", bg = false): string {
  const h = role(name, mode);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `\u001b[${bg ? 48 : 38};2;${r};${g};${b}m`;
}
export const RESET = "\u001b[0m";
