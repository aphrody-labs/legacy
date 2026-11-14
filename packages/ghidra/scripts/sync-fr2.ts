// Push packages/ghidra (+ optional extra dirs) to a remote work dir without git: bun scripts/sync-fr2.ts [host=cdn] [dest=/srv/ghidra-work]
import { $ } from "bun";
const host = process.argv[2] ?? "cdn";
const dest = process.argv[3] ?? "/srv/ghidra-work";
const root = new URL("../../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
await $`ssh ${host} ${"mkdir -p " + dest}`;
const tar = Bun.spawn(["tar", "-cf", "-", "--exclude=node_modules", "--exclude=target", "-C", root, "packages/ghidra", "src/ghidra-bun"], { stdout: "pipe" });
const un = Bun.spawn(["ssh", host, `tar -xf - -C ${dest}`], { stdin: tar.stdout, stderr: "inherit" });
console.log("sync exit", await un.exited);
