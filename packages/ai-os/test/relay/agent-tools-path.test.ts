import { expect, test } from "bun:test";
import { AGENT_TOOLS } from "../../src/relay/agent-tools.ts";

// mwg_audit takes a caller-chosen path: anything outside the checkout is refused (CWE-22).
const audit = AGENT_TOOLS.find((t) => t.name === "mwg_audit")!;

test("mwg_audit refuses paths outside the checkout", async () => {
  for (const path of ["../..", "/", "C:/Windows"])
    await expect(Promise.resolve().then(() => audit.run({ path, mode: "legacy-scan" } as any))).rejects.toThrow("outside the checkout");
});
