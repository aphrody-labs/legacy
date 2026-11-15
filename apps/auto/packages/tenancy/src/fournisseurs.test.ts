import { expect, test } from "bun:test";
import { sociaux } from "./fournisseurs";

test("OAuth: providers disabled without secrets, partial configuration refused", () => {
  expect(sociaux({})).toEqual({});
  for (const nom of ["GOOGLE", "MICROSOFT"]) {
    expect(() => sociaux({ [`AUTO_${nom}_CLIENT_ID`]: "id" })).toThrow("required together");
    expect(() => sociaux({ [`AUTO_${nom}_CLIENT_SECRET`]: "secret" })).toThrow("required together");
    expect(() => sociaux({ [`AUTO_${nom}_CLIENT_ID`]: " ", [`AUTO_${nom}_CLIENT_SECRET`]: "secret" })).toThrow();
  }
});

test("OAuth: Google and Microsoft configured, explicit Entra tenant", () => {
  const env = {
    AUTO_GOOGLE_CLIENT_ID: " google ",
    AUTO_GOOGLE_CLIENT_SECRET: "secret",
    AUTO_MICROSOFT_CLIENT_ID: "ms",
    AUTO_MICROSOFT_CLIENT_SECRET: "secret",
  };
  expect(sociaux(env)).toMatchObject({
    google: { clientId: "google", prompt: "select_account" },
    microsoft: { tenantId: "common" },
  });
  expect(sociaux({ ...env, AUTO_MICROSOFT_TENANT_ID: "tenant" })).toMatchObject({ microsoft: { tenantId: "tenant" } });
});
