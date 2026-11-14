// Push packages/ghidra and src/ghidra-bun to a remote work dir without git:
//   bun scripts/sync-fr2.ts [host=cdn] [dest=/home/ubuntu/ghidra-work]
const host = process.argv[2] ?? "cdn";
const dest = process.argv[3] ?? "/home/ubuntu/ghidra-work";
const root = new URL("../../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
Bun.spawnSync(["ssh", host, "mkdir -p " + dest]);
const tar = Bun.spawnSync(["tar", "-cf", "-", "--exclude=node_modules", "--exclude=target", "-C", root, "packages/ghidra", "src/ghidra-bun"]);
if (tar.exitCode !== 0) throw new Error(tar.stderr.toString());
const un = Bun.spawnSync(["ssh", host, `tar -xf - -C ${dest}`], { stdin: tar.stdout });
console.log("sync exit", un.exitCode, un.stderr.toString());
process.exit(un.exitCode ?? 1);
