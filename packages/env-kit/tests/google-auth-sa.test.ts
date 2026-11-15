// Service-account token minting: generated RSA key only, stubbed token endpoint, no network.
import { beforeEach, expect, test } from "bun:test";
import {
  clearServiceAccountTokens,
  loadServiceAccount,
  parseServiceAccount,
  serviceAccountProject,
  serviceAccountToken,
} from "../src/google-auth.ts";

const pair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const der = Buffer.from(
  await crypto.subtle.exportKey("pkcs8", pair.privateKey),
);
const pem = `-----BEGIN PRIVATE KEY-----\n${der.toString("base64").replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----\n`;
const email = "review@example-project.iam.gserviceaccount.com";
const json = JSON.stringify({
  type: "service_account",
  project_id: "example-project",
  client_email: email,
  private_key: pem,
});

beforeEach(() => clearServiceAccountTokens());

test("parse: plain, quoted, escaped quotes and literal \\n, raw newlines in the key", () => {
  const plain = parseServiceAccount(json);
  expect(plain.client_email).toBe(email);
  expect(plain.private_key).toBe(pem.trim());
  // dotenv style: whole JSON in single quotes
  expect(parseServiceAccount(`'${json}'`).private_key).toBe(pem.trim());
  // escaped quotes (value pasted through a second JSON layer) and double quoting
  const escaped = json.replace(/"/g, '\\"');
  expect(parseServiceAccount(escaped).client_email).toBe(email);
  expect(parseServiceAccount(`"${escaped}"`).project_id).toBe(
    "example-project",
  );
  expect(parseServiceAccount(JSON.stringify(json)).client_email).toBe(email);
  // private_key with raw newlines (invalid JSON): recovered by pattern
  const raw = `{"type":"service_account","client_email":"${email}","private_key":"${pem}"}`;
  expect(parseServiceAccount(raw).private_key).toBe(pem.trim());
  expect(() => parseServiceAccount('{"a":1}')).toThrow(/client_email/);
});

test("load: JSON env, credentials file, split variables, ADC user file skipped", () => {
  const files: Record<string, string> = { "/k.json": json };
  const read = (p: string) => files[p] ?? "";
  expect(
    loadServiceAccount({ GOOGLE_SERVICE_ACCOUNT: json }, read)?.client_email,
  ).toBe(email);
  expect(
    loadServiceAccount({ GOOGLE_APPLICATION_CREDENTIALS: "/k.json" }, read)
      ?.client_email,
  ).toBe(email);
  files["/adc.json"] = '{"type":"authorized_user","refresh_token":"x"}';
  expect(
    loadServiceAccount({ GOOGLE_APPLICATION_CREDENTIALS: "/adc.json" }, read),
  ).toBeUndefined();
  const split = loadServiceAccount({
    GOOGLE_CLIENT_EMAIL: email,
    GOOGLE_PRIVATE_KEY: `"${pem.replace(/\n/g, "\\n")}"`,
  });
  expect(split?.private_key).toBe(pem.trim());
  expect(loadServiceAccount({})).toBeUndefined();
  expect(
    serviceAccountProject(parseServiceAccount(json), {
      GOOGLE_CLOUD_PROJECT: "p2",
    }),
  ).toBe("p2");
  expect(serviceAccountProject(parseServiceAccount(json), {})).toBe(
    "example-project",
  );
});

test("mint: signed RS256 assertion, cached until expiry, refreshed after, one exchange for concurrent callers", async () => {
  const account = parseServiceAccount(json);
  let calls = 0;
  let assertion = "";
  const fetcher = (async (_url: string, init: RequestInit) => {
    calls++;
    await Bun.sleep(5);
    assertion = new URLSearchParams(String(init.body)).get("assertion")!;
    expect(new URLSearchParams(String(init.body)).get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    return Response.json({ access_token: `tok${calls}`, expires_in: 3600 });
  }) as unknown as typeof fetch;
  let now = 1_800_000_000_000;
  const o = { account, fetch: fetcher, now: () => now };
  const [a, b] = await Promise.all([
    serviceAccountToken(o),
    serviceAccountToken(o),
  ]);
  expect([a, b]).toEqual(["tok1", "tok1"]);
  expect(calls).toBe(1);
  expect(await serviceAccountToken(o)).toBe("tok1");
  const [h, c, s] = assertion.split(".") as [string, string, string];
  expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({
    alg: "RS256",
    typ: "JWT",
  });
  const claims = JSON.parse(Buffer.from(c, "base64url").toString());
  expect(claims).toMatchObject({
    iss: email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now / 1000,
    exp: now / 1000 + 3600,
  });
  expect(claims.scope).toContain("cloud-platform");
  expect(
    await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      pair.publicKey,
      Buffer.from(s, "base64url"),
      new TextEncoder().encode(`${h}.${c}`),
    ),
  ).toBe(true);
  now += 3600_000 - 30_000; // inside the 60 s refresh margin
  expect(await serviceAccountToken(o)).toBe("tok2");
  expect(calls).toBe(2);
});

test("mint: endpoint error is reported without the key", async () => {
  const account = parseServiceAccount(json);
  const fetcher = (async () =>
    Response.json(
      { error: "invalid_grant", error_description: "Invalid JWT Signature." },
      { status: 400 },
    )) as unknown as typeof fetch;
  const err = await serviceAccountToken({ account, fetch: fetcher }).catch(
    (e) => String(e.message),
  );
  expect(err).toContain("HTTP 400");
  expect(err).toContain("Invalid JWT Signature");
  expect(err).not.toContain("PRIVATE KEY");
});
