// Gate of the WinuxCmd corpus run through `ay applet`: a differing case fails the job only when the applet it exercises is provided by
// the WinuxCmd Rust library (`winux`). A case on an applet that WinuxCmd leaves to uutils or to its C++ build is reported with its
// provider and does not gate: that behavior is uutils' (for example `printf %.2Le` on an 80-bit long double), not this library's.
//
//   bun scripts/unixwin-corpus-gate.ts <compare output> <master-cases.json> <applets.toml>
import { readFileSync } from "node:fs";

export interface Verdict {
  id: string;
  command: string;
  provider: string;
  gates: boolean;
}

/** Case ids of the `FAIL <id>: ...` lines of master-oracle.py. */
export function failedIds(output: string): string[] {
  return [...output.matchAll(/^FAIL ([^:\s]+):/gm)].map((m) => m[1]!);
}

export function judge(output: string, cases: { id: string; command: string }[], providers: Record<string, { provider: string }>): Verdict[] {
  const command = new Map(cases.map((c) => [c.id, c.command]));
  return failedIds(output).map((id) => {
    const cmd = command.get(id) ?? "?";
    const provider = providers[cmd]?.provider ?? "unlisted";
    return { id, command: cmd, provider, gates: provider === "winux" || provider === "unlisted" };
  });
}

if (import.meta.main) {
  const [out, casesFile, tomlFile] = Bun.argv.slice(2);
  if (!out || !casesFile || !tomlFile) {
    console.error("usage: bun scripts/unixwin-corpus-gate.ts <compare output> <master-cases.json> <applets.toml>");
    process.exit(2);
  }
  const verdicts = judge(readFileSync(out, "utf8"), JSON.parse(readFileSync(casesFile, "utf8")), Bun.TOML.parse(readFileSync(tomlFile, "utf8")) as never);
  for (const v of verdicts) console.log(`${v.gates ? "GATE" : "NOTE"} ${v.id} (${v.command}: provider ${v.provider})`);
  const summary = readFileSync(out, "utf8").split("\n").filter((l) => l.startsWith("Cases:")).pop() ?? "";
  console.log(`${summary} | gating: ${verdicts.filter((v) => v.gates).length}, not gating: ${verdicts.filter((v) => !v.gates).length}`);
  process.exit(verdicts.some((v) => v.gates) ? 1 : 0);
}
