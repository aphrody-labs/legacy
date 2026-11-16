// Generated sources of the Bun crates in src/ (build/debug-codegen/codegen): build_options.rs, the *_byte_class.rs,
// aot_schema*.rs, aot_builtin_*.rs, cpp.rs, bindgen output. The generators are Bun's own (system/codegen, scripts/build)
// and run from the pinned fork checkout third_party/bun (src.lock.json), whose src/ is the tree imported here;
// the AOT generators belong to oven-sh/WebKit (Source/JavaScriptCore/aot), a sparse clone pinned by the fork's
// WEBKIT_VERSION. Run on fr1 (Linux): `bun scripts/bun-codegen.ts`, then `cargo check --workspace`.
// docs/ARCHITECTURE.md section 9.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const fork = resolve(root, process.argv[2] ?? "third_party/bun");
const webkit = resolve(root, process.argv[3] ?? "third_party/bun/vendor/WebKit");

const run = (cmd: string[], cwd: string, env: Record<string, string> = {}) => {
  console.log(`$ ${cmd.join(" ")}  (${cwd})`);
  const r = Bun.spawnSync(cmd, { cwd, stdio: ["inherit", "inherit", "inherit"], env: { ...process.env, ...env } });
  if (r.exitCode !== 0) throw new Error(`${cmd.join(" ")} exited ${r.exitCode}`);
};
const out = (cmd: string[], cwd: string) => Bun.spawnSync(cmd, { cwd }).stdout.toString("utf8").trim();

const lock = JSON.parse(readFileSync(resolve(root, "src.lock.json"), "utf8"));
const pin: string = findPin(lock);
function findPin(v: unknown): string {
  const stack = [v];
  while (stack.length) {
    const x = stack.pop() as Record<string, unknown>;
    if (x && typeof x === "object") {
      if (x["third_party/bun"] && typeof x["third_party/bun"] === "object") return (x["third_party/bun"] as { commit: string }).commit;
      stack.push(...Object.values(x));
    }
  }
  throw new Error("third_party/bun is not in src.lock.json");
}

if (!existsSync(resolve(fork, "scripts/build.ts"))) throw new Error(`${fork} is not a Bun checkout: git clone --filter=blob:none https://github.com/aphrody-labs/bun ${fork}`);
if (out(["git", "rev-parse", "HEAD"], fork) !== pin) throw new Error(`${fork} is not at the pin ${pin}: git -C ${fork} fetch origin && git -C ${fork} checkout ${pin}`);

const webkitVersion = /WEBKIT_VERSION\s*=\s*"([0-9a-f]{40})"/.exec(readFileSync(resolve(fork, "scripts/build/deps/webkit.ts"), "utf8"))?.[1];
if (!webkitVersion) throw new Error("WEBKIT_VERSION not found in scripts/build/deps/webkit.ts");
if (!existsSync(resolve(webkit, "Source/JavaScriptCore/aot"))) {
  mkdirSync(dirname(webkit), { recursive: true });
  if (!existsSync(resolve(webkit, ".git"))) run(["git", "clone", "--filter=blob:none", "--no-checkout", "https://github.com/oven-sh/WebKit", webkit], root);
  run(["git", "sparse-checkout", "set", "--cone", "Source/JavaScriptCore"], webkit);
  run(["git", "checkout", "-q", webkitVersion], webkit);
}
const jsc = resolve(webkit, "Source/JavaScriptCore");
const codegen = resolve(fork, "build/debug-codegen/codegen");

run(["bun", "install", "--frozen-lockfile"], fork);
run(["bun", "scripts/build.ts", "--mode=codegen"], fork, { BUN_WEBKIT_PATH: webkit });

// The two AOT generators a --mode=codegen build leaves out (they need the engine's sources).
run(["bun", "run", resolve(jsc, "aot/ir/generator/index.ts"), "--schema", resolve(jsc, "aot/ir/AOTSchema.def"), "--rust-out", codegen], fork);
const crateOf = (f: string) => {
  for (let d = dirname(f); d !== dirname(d); d = dirname(d)) {
    const m = /^\s*name\s*=\s*"([^"]+)"/m.exec(existsSync(resolve(d, "Cargo.toml")) ? readFileSync(resolve(d, "Cargo.toml"), "utf8") : "");
    if (m) return m[1];
  }
  throw new Error(f);
};
const bind: string[] = [];
const walk = (d: string) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = `${d}/${e.name}`;
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".bind.ts")) bind.push(`${crateOf(p)}=${p}`);
  }
};
walk(resolve(fork, "src"));
const list = resolve(fork, "build/debug-codegen/builtins.sources");
writeFileSync(list, bind.sort().join("\n") + "\n");
run(
  [
    "bun", "run", "system/codegen/builtins/index.ts", `--codegen-path=${codegen}`, "--target=Linux", `--sources=@${list}`,
    `--engine-directory=${resolve(jsc, "aot")}`, `--javascriptcore=${jsc}`, `--engine-out=${resolve(codegen, "engine-out")}`,
  ],
  fork,
);

// Where the crates look (build.rs: BUN_CODEGEN_DIR, else <repo>/build/debug/codegen; .cargo/config.toml sets it).
const dest = resolve(root, "build/debug-codegen/codegen");
rmSync(dest, { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
cpSync(codegen, dest, { recursive: true });
console.log(`codegen -> ${dest}`);
