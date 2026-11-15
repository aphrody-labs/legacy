import { expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { addPack, removePack, validateAfterChange } from "../src/new-pack.ts";
import { copyBundle } from "./util.ts";

const registered = (root: string) => ["bundle.toml", "index.toml", "framework-plugins.toml"].map((f) => readFileSync(join(root, f), "utf8"));

test("add wires every registration and remove undoes it exactly", () => {
  const root = copyBundle();
  try {
    const before = registered(root);
    addPack(root, "demo-pack", { summary: "A demo", requiredBinary: "demo", withCompletions: true });
    validateAfterChange(root);
    for (const p of ["packs/demo-pack/plugin.toml", "packs/demo-pack/init.niu", "plugins/demo-pack/plugin.toml", "plugins/demo-pack/demo-pack.plugin.niu", "completions/demo-pack.toml"]) {
      expect(existsSync(join(root, p))).toBe(true);
    }
    const [bundle, index, inventory] = registered(root);
    expect(bundle).toContain('"demo-pack",');
    expect(index).toContain('name = "demo-pack"');
    expect(inventory).toContain('"demo-pack",');
    removePack(root, "demo-pack");
    validateAfterChange(root);
    expect(registered(root)).toEqual(before);
    expect(existsSync(join(root, "packs", "demo-pack"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("add refuses a bad or existing name", () => {
  const root = copyBundle();
  try {
    expect(() => addPack(root, "Bad Name")).toThrow("invalid pack name");
    expect(() => addPack(root, "git")).toThrow("already exists");
    expect(() => removePack(root, "nope")).toThrow("not found");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
