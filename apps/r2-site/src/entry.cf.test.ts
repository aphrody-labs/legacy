import { expect, test } from "bun:test";
// Tests the bundle that is deployed (bun build.ts), so it needs no workspace install.
const { default: entry } = (await import("../dist/aphrody-sites.js")) as { default: { fetch(r: Request, e: unknown): Promise<Response> | Response } };

const bucket = { get: async () => null, put: async () => null };
const env = {
  ASSETS: bucket,
  DIST: bucket,
  SITES: JSON.stringify({ "a.example": { bucket: "ASSETS", prefix: "", service: "svc-a" } }),
};

test("a configured host answers /health with its own service name", async () => {
  const r = await entry.fetch(new Request("https://a.example/health"), env);
  expect(await r.json()).toMatchObject({ status: "ok", service: "svc-a", target: "cf" });
});

test("an unknown host is a 404, not a fallback to another site", async () => {
  const r = await entry.fetch(new Request("https://b.example/health"), env);
  expect(r.status).toBe(404);
});
