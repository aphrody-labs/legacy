// CoreCLR hosted in bun by hostfxr (IL assembly + .runtimeconfig.json). Separate process from the NativeAOT test.
import { beforeAll, describe, expect, test } from "bun:test";
import { sharedChecks } from "./checks.ts";
import { hostDotnet, openHosted } from "./hostfxr.ts";
import { type Api, type Bindings, builtHosted, load, paths } from "./interop.ts";

describe.skipIf(!builtHosted)("Nt.Interop CoreCLR (hostfxr)", () => {
  let ctx: { b: Bindings; api: Api };
  beforeAll(async () => {
    const b = await load();
    ctx = { b, api: openHosted(b, paths.il) };
  });

  test("method without EntryPoint reachable, dynamic code active", () => {
    expect(ctx.api.dynamicCode?.()).toBe(1);
    expect(hostDotnet("").init).toBeGreaterThanOrEqual(0); // same host: no reinitialization
  });

  sharedChecks("CoreCLR", () => ctx, false);
});
