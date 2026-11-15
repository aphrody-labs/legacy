// The ported applets (src/winux/extra) against the originals installed on the host: envsubst (gettext), look (util-linux), strings (binutils).
// `AY_BIN=<target>/debug/ay bun test test/winux-extra` on a POSIX host with those tools. dos2unix/unix2dos have no reference binary here:
// they are checked against their definition (round trip and in-place conversion).
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const AY = Bun.env.AY_BIN;
const run = async (cmd: string[], stdin = "", env: Record<string, string> = {}) => {
  const p = Bun.spawn(cmd, { stdin: new Blob([stdin]), stdout: "pipe", stderr: "pipe", env: { PATH: Bun.env.PATH!, LC_ALL: "C", ...env } });
  const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { stdout, code, stderr };
};
const ours = (applet: string, args: string[], stdin = "", env: Record<string, string> = {}) => run([AY!, "applet", applet, ...args], stdin, env);
const ref = (applet: string, args: string[], stdin = "", env: Record<string, string> = {}) => run([Bun.which(applet)!, ...args], stdin, env);

describe.skipIf(!AY || !Bun.which("envsubst"))("envsubst against gettext", () => {
  const env = { HOME: "/home/x", A: "alpha", EMPTY: "" };
  const cases: [string[], string][] = [
    [[], "hello $HOME and ${A}\n"],
    [[], "no vars here\n"],
    [[], "$UNSET|${UNSET}|$A_|${A\n"],
    [[], "$$A $1 $ {A} \\$A\n"],
    [['$A'], "$A $HOME ${A}\n"],
    [['$A $EMPTY'], "$A|$EMPTY|$HOME\n"],
    [["-v", "$A and ${HOME} $A"], ""],
    [["-v"], "$A ${B} $A\n"],
    [["-x"], "$A\n"],
  ];
  for (const [args, stdin] of cases) {
    test(`envsubst ${args.join(" ")} <<< ${JSON.stringify(stdin)}`, async () => {
      const a = await ours("envsubst", args, stdin, env);
      const b = await ref("envsubst", args, stdin, env);
      expect({ stdout: a.stdout, code: a.code }).toEqual({ stdout: b.stdout, code: b.code });
    });
  }
});

describe.skipIf(!AY || !Bun.which("look"))("look against util-linux", () => {
  const dir = mkdtempSync(join(tmpdir(), "look-"));
  // look binary-searches: the file must be sorted the way it is compared (byte order, or case-folded for -f).
  const exact = join(dir, "words");
  const folded = join(dir, "words-folded");
  writeFileSync(exact, ["Apple", "Banana split", "apple pie", "applesauce", "banana", "cherry", "cherry-pie", ""].join("\n"));
  writeFileSync(folded, ["Apple", "apple pie", "applesauce", "banana", "Banana split", "cherry", "cherry-pie", ""].join("\n"));
  const cases = [["app", exact], ["Appl", exact], ["ban", exact], ["-f", "app", folded], ["-f", "BAN", folded], ["cherry", exact], ["zzz", exact], ["-t", "p", "ap", exact]];
  for (const args of cases) {
    test(`look ${args.slice(0, -1).join(" ")}`, async () => {
      const a = await ours("look", args);
      const b = await ref("look", args);
      expect({ stdout: a.stdout, code: a.code }).toEqual({ stdout: b.stdout, code: b.code });
    });
  }
  test("cleanup", () => rmSync(dir, { recursive: true, force: true }));
});

describe.skipIf(!AY || !Bun.which("strings"))("strings against binutils", () => {
  const dir = mkdtempSync(join(tmpdir(), "strings-"));
  const file = join(dir, "blob.bin");
  const bytes = new Uint8Array(4096);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) % 251;
  bytes.set(new TextEncoder().encode("hello world"), 100);
  bytes.set(new TextEncoder().encode("abc"), 300);
  bytes.set(new TextEncoder().encode("tab\there"), 500);
  writeFileSync(file, bytes);
  const cases = [[file], ["-n3", file], ["--bytes=5", file], ["-tx", file], ["--radix=d", file], ["-6", file], ["-n", "3", file], ["-n", "8", file], ["-t", "x", file], ["-t", "d", file], ["-t", "o", file], ["-f", file]];
  for (const args of cases) {
    test(`strings ${args.slice(0, -1).join(" ")}`, async () => {
      const a = await ours("strings", args);
      const b = await ref("strings", args);
      expect({ stdout: a.stdout, code: a.code }).toEqual({ stdout: b.stdout, code: b.code });
    });
  }
  test("cleanup", () => rmSync(dir, { recursive: true, force: true }));
});

describe.skipIf(!AY)("dos2unix and unix2dos", () => {
  test("filters round-trip", async () => {
    const d = await ours("unix2dos", [], "a\nb\r\nc\n");
    expect(d.stdout).toBe("a\r\nb\r\nc\r\n");
    expect((await ours("dos2unix", [], d.stdout)).stdout).toBe("a\nb\nc\n");
    expect((await ours("d2u", [], "x\r\n")).stdout).toBe("x\n");
    expect((await ours("u2d", [], "x\n")).stdout).toBe("x\r\n");
  });
  test("in place, -n pairs and binary files left alone", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eol-"));
    try {
      const f = join(dir, "t.txt");
      writeFileSync(f, "one\r\ntwo\r\n");
      expect((await ours("dos2unix", ["-q", f])).code).toBe(0);
      expect(readFileSync(f, "utf8")).toBe("one\ntwo\n");
      const g = join(dir, "u.txt");
      expect((await ours("unix2dos", ["-q", "-n", f, g])).code).toBe(0);
      expect(readFileSync(g, "utf8")).toBe("one\r\ntwo\r\n");
      const bin = join(dir, "b.bin");
      writeFileSync(bin, new Uint8Array([97, 13, 10, 0, 98]));
      expect((await ours("dos2unix", ["-q", bin])).code).toBe(0);
      expect([...readFileSync(bin)]).toEqual([97, 13, 10, 0, 98]);
      expect((await ours("dos2unix", ["-q", "-f", bin])).code).toBe(0);
      expect([...readFileSync(bin)]).toEqual([97, 10, 0, 98]);
      expect((await ours("dos2unix", [join(dir, "missing")])).code).toBe(1);
      // No scratch file is left behind next to the converted one.
      expect(require("node:fs").readdirSync(dir).filter((n: string) => n.endsWith(".winux-new"))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
