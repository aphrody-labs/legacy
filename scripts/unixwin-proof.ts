// Proof run of `ay applet` and `ay sh`: each case runs the real binary and its output is compared with the expected bytes.
//
//   bun scripts/unixwin-proof.ts <ay binary> [--md FILE]
//
// Every line printed is evidence (`PASS|FAIL <applet> <args> -> exit N, stdout ...`); the exit status is non-zero on any mismatch.
// Cases marked `win` exercise the WinuxCmd Rust library, which is linked on Windows only; they are SKIPped elsewhere, never faked.
import { writeFileSync } from "node:fs";
import { platform } from "node:os";

export interface Case {
  name: string;
  args: string[];
  stdin?: string;
  env?: Record<string, string>;
  stdout: string;
  code?: number;
  win?: boolean;
}

const A = (n: string, ...a: string[]) => ["applet", n, ...a];

export const CASES: Case[] = [
  // WinuxCmd Rust library (Windows).
  { name: "basename", args: A("basename", "/a/b.txt", ".txt"), stdout: "b\n", win: true },
  { name: "dirname", args: A("dirname", "/a/b/c"), stdout: "/a/b\n", win: true },
  { name: "seq", args: A("seq", "3"), stdout: "1\n2\n3\n", win: true },
  { name: "echo", args: A("echo", "-n", "hi"), stdout: "hi", win: true },
  { name: "tr", args: A("tr", "a-z", "A-Z"), stdin: "abc\n", stdout: "ABC\n", win: true },
  { name: "sort", args: A("sort"), stdin: "b\na\nc\n", stdout: "a\nb\nc\n", win: true },
  { name: "cut", args: A("cut", "-d,", "-f2"), stdin: "a,b,c\n", stdout: "b\n", win: true },
  { name: "head", args: A("head", "-n1"), stdin: "x\ny\n", stdout: "x\n", win: true },
  { name: "tail", args: A("tail", "-n1"), stdin: "x\ny\n", stdout: "y\n", win: true },
  { name: "tac", args: A("tac"), stdin: "a\nb\n", stdout: "b\na\n", win: true },
  { name: "printenv", args: A("printenv", "AY_PROOF"), env: { AY_PROOF: "bar" }, stdout: "bar\n", win: true },
  { name: "true", args: A("true"), stdout: "", code: 0, win: true },
  { name: "false", args: A("false"), stdout: "", code: 1, win: true },
  // Portable ports (src/winux/extra), every host.
  { name: "unix2dos", args: A("unix2dos"), stdin: "a\nb\n", stdout: "a\r\nb\r\n" },
  { name: "dos2unix", args: A("dos2unix"), stdin: "a\r\nb\r\n", stdout: "a\nb\n" },
  { name: "envsubst", args: A("envsubst"), stdin: "v=$AY_PROOF ${AY_PROOF}\n", env: { AY_PROOF: "x" }, stdout: "v=x x\n" },
  { name: "strings", args: A("strings", "-n", "3"), stdin: "\u0000abc\u0000de\u0000hello\u0001", stdout: "abc\nhello\n" },
  // The embedded Bash engine.
  { name: "sh arithmetic", args: ["sh", "-c", "echo $((6*7))"], stdout: "42\n" },
  { name: "sh exit status", args: ["sh", "-c", "f() { return 3; }; f; exit $?"], stdout: "", code: 3 },
  { name: "sh positional", args: ["sh", "-c", 'echo "$0:$1:$2"', "name", "a", "b"], stdout: "name:a:b\n" },
  { name: "sh -c flag in $-", args: ["sh", "-c", 'case $- in *c*) echo c;; *) echo none;; esac'], stdout: "c\n" },
  { name: "sh array expansion", args: ["sh", "-c", 'x=(a b c); echo "${#x[@]} ${x[1]}"'], stdout: "3 b\n" },
];

export async function runCase(bin: string, c: Case) {
  const p = Bun.spawn([bin, ...c.args], {
    stdin: new Blob([c.stdin ?? ""]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...(Bun.env as Record<string, string>), ...c.env },
  });
  const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { stdout, stderr, code };
}

const show = (s: string) => JSON.stringify(s);

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const bin = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--md");
  if (!bin) {
    console.error("usage: bun scripts/unixwin-proof.ts <ay binary> [--md FILE]");
    process.exit(2);
  }
  const lines: string[] = [`ay: ${bin}`, `host: ${platform()}`, ""];
  let failed = 0;
  let skipped = 0;
  for (const c of CASES) {
    const label = `${c.name} [${c.args.join(" ")}]`;
    if (c.win && platform() !== "win32") {
      lines.push(`SKIP ${label} (WinuxCmd library: Windows only)`);
      skipped++;
      continue;
    }
    const r = await runCase(bin, c);
    const want = c.code ?? 0;
    const okOut = r.stdout === c.stdout;
    const okCode = r.code === want;
    if (okOut && okCode) lines.push(`PASS ${label} -> exit ${r.code}, stdout ${show(r.stdout)}`);
    else {
      failed++;
      lines.push(`FAIL ${label} -> exit ${r.code} (want ${want}), stdout ${show(r.stdout)} (want ${show(c.stdout)}), stderr ${show(r.stderr.slice(0, 200))}`);
    }
  }
  const total = CASES.length - skipped;
  lines.push("", `${total - failed}/${total} passed, ${skipped} skipped`);
  console.log(lines.join("\n"));
  const md = args.includes("--md") ? args[args.indexOf("--md") + 1] : undefined;
  if (md) writeFileSync(md, `# unixwin proof run\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`);
  process.exit(failed ? 1 : 0);
}
