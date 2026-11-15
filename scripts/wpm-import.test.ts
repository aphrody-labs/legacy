import { expect, test } from "bun:test";
import { convert, toolNames } from "./wpm-import.ts";

const art = (type: string, files: { from: string; to: string }[], extra = {}) => ({ type, sha256: "ab".repeat(32), urls: ["https://example.invalid/x"], files, ...extra });
const index = {
  version: "t-1",
  packages: [
    { name: "yq", version: "4.0.0", kind: "external", commands: ["yq"], artifacts: { "windows-x64": art("zip", [{ from: "yq_windows_amd64.exe", to: "yq.exe" }]), "windows-arm64": art("zip", [{ from: "yq_windows_arm64.exe", to: "yq.exe" }]) } },
    { name: "jq", version: "1.0.0", kind: "external", commands: ["jq"], artifacts: { "windows-x64": art("exe", [{ from: "jq.exe", to: "jq.exe" }]) } },
    { name: "git", version: "2", kind: "external", alias_of: "niugit" },
    { name: "suite", version: "1", kind: "bundle" },
    { name: "tree", version: "1", kind: "external", commands: ["t"], artifacts: { "windows-x64": art("zip", [{ from: "bin/t.exe", to: "lib/t.exe" }]) } },
    { name: "msi", version: "1", kind: "external", commands: ["m"], artifacts: { "windows-x64": art("msi", []) } },
    { name: "bare", version: "1", kind: "external", commands: ["b"] },
    { name: "rg", version: "1", kind: "external", commands: ["rg"], artifacts: { "windows-x64": art("zip", []) } },
  ],
};

test("packages become url tools with per-platform assets, hashes and archive file names", () => {
  const r = convert(index, new Set(["rg"]));
  expect(r.tools).toBe(2);
  expect(r.skipped).toEqual({ alias: 1, bundle: 1, "no artifact": 1, tree: 1, "unsupported type": 1, "in tools.toml": 1 });
  expect(r.toml).toContain('name = "yq"');
  expect(r.toml).toContain('assets.windows-x86_64 = "https://example.invalid/x"');
  expect(r.toml).toContain("sha256.windows-aarch64 =");
  expect(r.toml).toContain('pick."yq@windows-x86_64" = "yq_windows_amd64.exe"');
  expect(r.toml).toContain('pick."yq@windows-aarch64" = "yq_windows_arm64.exe"');
  expect(r.toml).not.toContain("pick.jq");
  expect(r.toml).not.toContain('name = "rg"');
});

test("the generated TOML parses", () => {
  const doc = Bun.TOML.parse(convert(index).toml) as { tool: { name: string; pick?: Record<string, string> }[] };
  expect(doc.tool.map((t) => t.name).sort()).toEqual(["jq", "rg", "yq"]);
  expect(doc.tool.find((t) => t.name === "yq")!.pick).toEqual({ "yq@windows-x86_64": "yq_windows_amd64.exe", "yq@windows-aarch64": "yq_windows_arm64.exe" });
});

test("tool names of a manifest", () => {
  expect(toolNames('[[tool]]\nname = "a"\n[[tool]]\nname = "b"\n')).toEqual(new Set(["a", "b"]));
});
