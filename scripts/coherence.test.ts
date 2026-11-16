import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  areaOf,
  commit,
  extractRefs,
  isProtected,
  rewrite,
} from "./coherence.ts";

describe("coherence", () => {
  test("extractRefs keeps repo paths, drops placeholders and globs", () => {
    const { paths, links } = extractRefs(
      "See `docs/native/README.md`, docs/bun/*.md, packages/<name>/src and [x](../ay/NAMING.md) or https://a/b.",
      true,
    );
    expect(paths).toEqual(["docs/native/README.md"]);
    expect(links).toEqual(["../ay/NAMING.md"]);
  });

  test("rewrite replaces whole paths only, longest first", () => {
    const r = rewrite(
      "docs/linux and docs/linux/GPU.md but not docs/linux-old or docs/linux.md",
      [["docs/linux", "docs/native/linux"]],
    );
    expect(r.text).toBe(
      "docs/native/linux and docs/native/linux/GPU.md but not docs/linux-old or docs/linux.md",
    );
    expect(r.edits).toBe(2);
  });

  test("protected paths and areas", () => {
    for (const p of [
      "Cargo.toml",
      "src/ay/src/lib.rs",
      "docs/ARCHITECTURE.md",
      "scripts/scripts.just",
      ".github/workflows/ci.yml",
      "src.lock.json",
      "DEPS",
      "crates/DEPS.rules",
    ])
      expect(isProtected(p)).toBe(true);
    for (const p of ["docs/bun/BLOG.md", "scripts/coherence.ts", "tools.toml"])
      expect(isProtected(p)).toBe(false);
    expect(areaOf("docs/research/X.md")).toBe("research");
    expect(areaOf("docs/native/llvm/A.md")).toBe("native");
    expect(areaOf("docs/bun/BLOG.md")).toBe("docs");
    expect(areaOf(".agents/skills/bun/SKILL.md")).toBe("agents");
    expect(areaOf("device/fleet/x.toml")).toBe("infra");
  });

  test("commit uses a private index and leaves others' staged entries alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "coherence-"));
    const g = (...a: string[]) => {
      const r = Bun.spawnSync(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", ...a],
        { cwd: dir },
      );
      if (r.exitCode) throw new Error(r.stderr.toString());
      return r.stdout.toString().trim();
    };
    try {
      g("init", "-q", "-b", "main");
      writeFileSync(join(dir, "a.md"), "a1\n");
      writeFileSync(join(dir, "b.md"), "b1\n");
      g("add", "a.md", "b.md");
      g("commit", "-q", "-m", "init");
      writeFileSync(join(dir, "a.md"), "a2\n"); // ours, unstaged
      writeFileSync(join(dir, "b.md"), "b2\n");
      g("add", "b.md"); // another session's staged edit
      const env = {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
      };
      const saved = { ...process.env };
      Object.assign(process.env, env);
      try {
        commit("docs: a", ["a.md"], { root: dir });
      } finally {
        process.env = saved;
      }
      expect(g("show", "HEAD:a.md")).toBe("a2");
      expect(g("show", "HEAD:b.md")).toBe("b1");
      expect(g("diff", "--cached", "--name-only")).toBe("b.md"); // still staged, untouched
      expect(g("diff", "--name-only")).toBe(""); // a.md index entry moved to the new blob
      expect(() => commit("x", ["Cargo.toml"], { root: dir })).toThrow(
        /protected/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
