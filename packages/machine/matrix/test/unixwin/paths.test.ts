// Path translation by niubash (rubash): MSYS (/c/...), WSL (/mnt/c/...), Cygwin (/cygdrive/c/...) dialects
// and Windows (C:\, C:/), argv of a native child (bun itself), $PWD, and /src fallback (NIU_ROOT_FALLBACK, fork
// aphrody-labs: a first component missing under NIU_ROOT but present at the root of the system drive).
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NIU, baseEnv, niu } from "./lib";

const win = process.platform === "win32" && NIU !== null;
const t = win ? test : test.skip;
const drive = (process.env.SystemDrive ?? "C:").slice(0, 1).toLowerCase();
const D = drive.toUpperCase();
// Native child that prints its argv as received; bun path in POSIX form for the shell.
const echoArgv = `"${process.execPath.replace(/\\/g, "/")}" -e 'console.log(JSON.stringify(process.argv.slice(1)))'`;

describe("dialectes de chemins", () => {
  t("cd /<lecteur> : $PWD reste POSIX", async () => {
    const r = await niu(`cd /${drive}/Windows && echo "$PWD"`);
    expect(r.out).toBe(`/${drive}/Windows\n`);
  });

  for (const [name, p] of [
    ["msys", `/${drive}/Windows`],
    ["wsl", `/mnt/${drive}/Windows`],
    ["windows-backslash", `${D}:\\\\Windows`],
    ["windows-slash", `${D}:/Windows`],
  ] as const) {
    t(`test -d ${name}`, async () => {
      const r = await niu(`test -d '${p.replace(/\\\\/g, "\\")}' && echo yes`);
      expect(r.out).toBe("yes\n");
    });
  }

  t("cygdrive: operand of an external command", async () => {
    const r = await niu(
      `ls -d /cygdrive/${drive}/Windows >/dev/null && echo yes`,
    );
    expect(r.out).toBe("yes\n");
  });

  t("argv d'un enfant natif : /<lecteur>/x devient X:\\x", async () => {
    const r = await niu(`${echoArgv} /${drive}/Windows`);
    expect(r.code).toBe(0);
    const [arg] = JSON.parse(r.out) as string[];
    expect(arg!.replace(/\//g, "\\").toLowerCase()).toBe(`${drive}:\\windows`);
  });

  t("argv of a native child: non-path data intact", async () => {
    const r = await niu(`${echoArgv} 'a/b' '--opt=/x' 's/a/b/g' 'http://h/p'`);
    expect(JSON.parse(r.out)).toEqual([
      "a/b",
      "--opt=/x",
      "s/a/b/g",
      "http://h/p",
    ]);
  });

  t("/dev/null et /tmp", async () => {
    const r = await niu(
      'echo x >/dev/null && f=$(mktemp) && test -f "$f" && rm -f "$f" && echo ok',
    );
    expect(r.out).toBe("ok\n");
  });

  t("persona uname and OSTYPE", async () => {
    const r = await niu('echo "$OSTYPE"; uname -s');
    expect(r.out).toMatch(/^msys\nMSYS_NT-/);
  });
});

describe("repli /src (NIU_ROOT_FALLBACK)", () => {
  // Real folder at the root of the system drive, missing under NIU_ROOT: C:\aphrody if it exists, otherwise Windows.
  const top = existsSync(`${D}:\\src`) ? "src" : "Windows";
  // Writes under the profile (X:\Users\<me>\AppData\Local\Temp), reached through /Users/... thanks to the fallback.
  const tmp = tmpdir();
  const viaRoot = (w: string) => `/${w.slice(3).replace(/\\/g, "/")}`;

  t("without fallback: /<top> does not reach the drive", async () => {
    const r = await niu(
      `cd /${top} 2>/dev/null && echo reached || echo blocked`,
    );
    expect(r.out).toBe("blocked\n");
  });

  t(
    "with fallback: cd /<top>, read, redirection and argv reach the drive",
    async () => {
      const env = baseEnv({ NIU_ROOT_FALLBACK: "1" });
      const dir = mkdtempSync(join(tmp, "unixwin-e2e-"));
      try {
        const v = viaRoot(dir);
        writeFileSync(join(dir, "in.txt"), "fallback\n");
        const r = await niu(
          `cd /${top} && echo "$PWD" && pwd -P; cat ${v}/in.txt; echo out >${v}/out.txt; ${echoArgv} ${v}/in.txt`,
          { env },
        );
        const lines = r.out.split("\n");
        // Logical $PWD (like /mnt/c/...: only pwd -P canonicalizes), pwd -P on the drive.
        expect(lines.slice(0, 2)).toEqual([`/${top}`, `/${drive}/${top}`]);
        lines.splice(0, 1);
        expect(lines[1]).toBe("fallback");
        expect(await Bun.file(join(dir, "out.txt")).text()).toBe("out\n");
        const [arg] = JSON.parse(lines[2]!) as string[];
        expect(arg!.replace(/\//g, "\\").toLowerCase()).toBe(
          join(dir, "in.txt").toLowerCase(),
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  t(
    "with fallback: reserved members (/tmp, /usr, /bin) stay in the shell tree",
    async () => {
      const env = baseEnv({ NIU_ROOT_FALLBACK: "1" });
      const r = await niu('cd /usr && echo "$PWD"; cd /tmp && echo "$PWD"', {
        env,
      });
      expect(r.out).toBe("/usr\n/tmp\n");
    },
  );

  t("fallback disabled by 0", async () => {
    const env = baseEnv({ NIU_ROOT_FALLBACK: "0" });
    const r = await niu(
      `cd /${top} 2>/dev/null && echo reached || echo blocked`,
      { env },
    );
    expect(r.out).toBe("blocked\n");
  });
});

// Working file outside the repository for the name-encoding tests.
describe("noms de fichiers", () => {
  t("UTF-8 name and spaces: created by niu, read by Bun", async () => {
    const dir = mkdtempSync(join(tmpdir(), "unixwin-"));
    try {
      const posix = dir.replace(/\\/g, "/");
      const r = await niu(`cd '${posix}' && printf 'é' > 'dé jà €.txt' && ls`);
      expect(r.out).toBe("dé jà €.txt\n");
      expect(await Bun.file(join(dir, "dé jà €.txt")).text()).toBe("é");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  t("CRLF in a file: preserved by cat", async () => {
    const dir = mkdtempSync(join(tmpdir(), "unixwin-"));
    try {
      writeFileSync(join(dir, "crlf.txt"), "a\r\nb\r\n");
      const r = await niu(`cat '${dir.replace(/\\/g, "/")}/crlf.txt'`);
      expect([...r.bytes]).toEqual([...new TextEncoder().encode("a\r\nb\r\n")]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
