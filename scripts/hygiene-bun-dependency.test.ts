import { expect, test } from "bun:test";
import { bunDependencyHits } from "./hygiene.ts";

const pkg = (o: object) => JSON.stringify(o, null, 2);

test("flags dependencies Bun replaces, in every section", () => {
  const hits = bunDependencyHits(
    "x/package.json",
    pkg({ dependencies: { uuid: "^9" }, devDependencies: { vitest: "^3", zod: "^4" } }),
  );
  expect(hits.map((h) => h.text.split(" ")[0]).sort()).toEqual(["uuid", "vitest"]);
  expect(hits[0]!.line).toBeGreaterThan(0);
});

test("a written reason in bunExceptions is the only exception", () => {
  const base = { dependencies: { ws: "^8", semver: "^7" } };
  const hits = bunDependencyHits(
    "x/package.json",
    pkg({ ...base, bunExceptions: { ws: "needs permessage-deflate tuning, measured 2x faster than Bun.serve in bench/ws", semver: "ok" } }),
  );
  expect(hits.map((h) => h.text.split(" ")[0])).toEqual(["semver"]);
});
