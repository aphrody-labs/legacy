import { expect, test } from "bun:test";
import { clapLongs, decide, portedApplets, uutilsBinary, failureApplets, literalLongs, parseInventory, strConsts, tomlLongs, unixOnly } from "./unixwin-applets.ts";

test("inventory rows are keyed by applet", () => {
  const m = parseInventory("applet\tloc\tstate\tengine\toracle_status\nls\t9\tc++-only\tc++-1.x\taudited:clean\ncat\t3\twired\trust2\tunreviewed\n");
  expect(m.get("cat")).toEqual({ state: "wired", engine: "rust2", oracle: "unreviewed" });
});

test("clap long options resolve constants declared anywhere in the applet", () => {
  const consts = new Map<string, Set<string>>();
  strConsts('pub mod options { pub static ALL: &str = "all"; pub mod format { pub static LONG: &str = "long"; } }', consts);
  const src = 'Arg::new(options::ALL).long(options::ALL) Arg::new("x").long("zero") .long( options::format::LONG )';
  expect([...clapLongs(src, consts)].sort()).toEqual(["--all", "--long", "--zero"]);
});

test("hand-parsed applets are scanned for option literals", () => {
  expect([...literalLongs('if p == "--brief" || p == "-q" { } "--report-identical-files"')].sort()).toEqual(["--brief", "--report-identical-files"]);
});

test("completion catalogs and unix-only feature lists", () => {
  expect([...tomlLongs('[[flags]]\nshort = "-a"\nlong = "--all"\n[[subcommands.flags]]\nlong = "--x"\n')].sort()).toEqual(["--all", "--x"]);
  expect([...unixOnly('feat_require_unix_core = [\n  "chmod",\n  "id",\n]\nfeat_other = ["ls"]\nfeat_require_unix_utmpx = ["who"]\n')].sort()).toEqual(["chmod", "id", "who"]);
});

test("GNU suite failures group by applet", () => {
  const f = failureApplets("Échecs : tests/misc/{printenv,stdbuf}, tests/tail/{debug}, tests/{od/od,wc/wc-total}.");
  expect(f.get("printenv")).toEqual(["misc/printenv"]);
  expect(f.get("tail")).toEqual(["tail/debug"]);
  expect(f.get("od")).toEqual(["od/od"]);
  expect(f.get("wc")).toEqual(["wc/wc-total"]);
});

test("WinuxCmd is the base: Rust applets stay, C++ ones fall back to uutils only when uutils has them", () => {
  const w = (state: string) => ({ state, engine: "", oracle: "", pass: 0, knownDiff: 0, skip: 0, longs: new Set<string>() });
  const u = { source: "coreutils", longs: new Set<string>(), unixOnly: false, gnuFailures: [], bin: "coreutils", multicall: true };
  const native = new Set(["cat"]);
  expect(decide(w("wired"), u, native, "cat").provider).toBe("winux");
  // A state label without a registry entry is not enough (the applet would be missing at run time).
  expect(decide(w("wired"), u, native, "ls").provider).toBe("uutils");
  expect(decide(w("rust-ready"), undefined, native, "ls").provider).toBe("winux-cxx");
  expect(decide(w("c++-only"), u).provider).toBe("uutils");
  expect(decide(w("c++-only"), undefined).provider).toBe("winux-cxx");
  expect(decide(undefined, u).provider).toBe("uutils");
});

test("each uutils repository maps to its own executable, never to coreutils", () => {
  expect(uutilsBinary("coreutils", "ls")).toEqual({ bin: "coreutils", multicall: true });
  expect(uutilsBinary("procps", "ps")).toEqual({ bin: "procps", multicall: true });
  expect(uutilsBinary("util-linux", "cal")).toEqual({ bin: "util-linux", multicall: true });
  expect(uutilsBinary("shadow", "useradd")).toEqual({ bin: "shadow-rs", multicall: true });
  expect(uutilsBinary("grep", "grep")).toEqual({ bin: "grep", multicall: false });
  expect(uutilsBinary("findutils", "xargs")).toEqual({ bin: "xargs", multicall: false });
});

test("registry names come from the registry function only", () => {
  const lib = 'pub fn registry() -> Vec<(&str, F)> {\n    vec![\n        ("a", x::a),\n        ("[", x::b),\n    ]\n}\n\nfn other() { let _ = ("zzz", 1); }\n';
  expect([...portedApplets(lib)].sort()).toEqual(["[", "a"]);
});
