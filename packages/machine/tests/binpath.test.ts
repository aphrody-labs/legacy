import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyManagedBlock,
  extractManagedBlock,
  scanBinDir,
  scanBunxBrokenTarget,
  scanCmdBrokenTargets,
  whichAll,
} from "../src/binpath.ts";

describe("binpath", () => {
  test("extractManagedBlock and applyManagedBlock manage Unix PATH idempotently", () => {
    const initial = "# existing\nexport FOO=bar\n";
    const once = applyManagedBlock(initial, ["/opt/bin", "/usr/local/bin"]);
    expect(extractManagedBlock(once)).toEqual(["/opt/bin", "/usr/local/bin"]);
    const twice = applyManagedBlock(once, ["/opt/bin"]);
    expect(extractManagedBlock(twice)).toEqual(["/opt/bin"]);
    expect(twice).toContain("export FOO=bar");
    const cleared = applyManagedBlock(twice, []);
    expect(extractManagedBlock(cleared)).toEqual([]);
  });

  test("scanCmdBrokenTargets detects missing .exe, .ts, and env-expanded targets", () => {
    const dir = mkdtempSync(join(tmpdir(), "binpath-cmd-"));
    try {
      const okExe = join(dir, "ok.exe");
      writeFileSync(okExe, "stub");
      expect(scanCmdBrokenTargets(`@"${okExe}" %*`, dir)).toEqual([]);
      expect(scanCmdBrokenTargets(`@"%~dp0missing.exe" %*`, dir)).toEqual([
        `${dir}\\missing.exe`,
      ]);
      expect(
        scanCmdBrokenTargets(
          `set "PYTHONHOME=${dir}\\nope"\r\n"${okExe}" %*`,
          dir,
        ),
      ).toEqual([`${dir}\\nope`]);
      expect(
        scanCmdBrokenTargets(
          `@bun "%USERPROFILE%\\.nonexistent-dir\\cli.ts" %*`,
          dir,
        ).length,
      ).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("scanBinDir detects stale backups, 0-byte files, broken shims, and broken bunx", () => {
    const dir = mkdtempSync(join(tmpdir(), "binpath-scan-"));
    try {
      writeFileSync(join(dir, "tool.exe.old"), "old");
      writeFileSync(join(dir, "bun.previous.exe"), "prev");
      writeFileSync(join(dir, "empty.exe"), "");
      writeFileSync(join(dir, "good.exe"), "ok");
      writeFileSync(
        join(dir, "broken.shim"),
        `path = "${join(dir, "missing.exe")}"\n`,
      );
      const bunxBuf = Buffer.concat([
        Buffer.from('missing-pkg\\cli.js"', "utf16le"),
        Buffer.from([0x00, 0x00, 0x30, 0xab]),
      ]);
      expect(scanBunxBrokenTarget(bunxBuf, dir)).toContain("missing-pkg");
      writeFileSync(join(dir, "bad.bunx"), bunxBuf);
      const issues = scanBinDir(dir);
      expect(issues.map((i) => i.kind).sort()).toEqual([
        "broken-cmd",
        "broken-cmd",
        "stale",
        "stale",
        "zero-byte",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("whichAll finds bun on PATH", () => {
    const hits = whichAll("bun");
    expect(hits.length).toBeGreaterThan(0);
  });
});
