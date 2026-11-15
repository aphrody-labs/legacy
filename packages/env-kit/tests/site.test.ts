import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { host, loadSite, sitePath, sshAlias } from "../src/site.ts";

const dir = mkdtempSync(join(tmpdir(), "site-"));
const file = join(dir, "site.toml");
writeFileSync(file, '[hosts.fr1]\nssh = "alias1"\nuser = "deploy"\n[hosts.fr2]\nhostname = "h2"\n');

test("APHRODY_SITE overrides the path", () => {
  expect(sitePath({ APHRODY_SITE: file })).toBe(file);
});
test("roles resolve to an ssh alias", () => {
  const site = loadSite(file);
  expect(sshAlias("fr1", site)).toBe("alias1");
  expect(host("fr1", site).user).toBe("deploy");
});
test("absent file gives null, unknown role throws", () => {
  expect(loadSite(join(dir, "nope.toml"))).toBeNull();
  expect(() => host("fr9", loadSite(file))).toThrow();
});
