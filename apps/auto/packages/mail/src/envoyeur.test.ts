import { expect, test } from "bun:test";
import { configRelais, envoyeurDepuisEnv } from "./envoyeur";

test("SMTP: invalid configuration refused before the first connection", () => {
  for (const port of ["0", "65536", "abc", "12.5", ""]) {
    expect(() => configRelais({ AUTO_SMTP_HOTE: "mail.example.com", AUTO_SMTP_PORT: port })).toThrow("AUTO_SMTP_PORT");
  }
  expect(() => configRelais({ AUTO_SMTP_EXPEDITEUR: "invalide" })).toThrow("adresse invalide");
  expect(() => configRelais({ AUTO_SMTP_HOTE: "mail.example.com", AUTO_SMTP_SECURITE: "invalide" })).toThrow(
    "AUTO_SMTP_SECURITE",
  );
});

test("SMTP: production requires a relay and TLS; local development allowed", () => {
  expect(() => envoyeurDepuisEnv({ NODE_ENV: "production" })).toThrow("required in production");
  expect(() =>
    configRelais({ NODE_ENV: "production", AUTO_SMTP_HOTE: "mail.example.com", AUTO_SMTP_SECURITE: "aucune" }),
  ).toThrow("TLS required");
  expect(configRelais({ AUTO_SMTP_HOTE: "localhost", AUTO_SMTP_SECURITE: "aucune" }).smtp?.securite).toBe("aucune");
  expect(
    configRelais({ NODE_ENV: "production", AUTO_SMTP_HOTE: "mail.example.com", AUTO_SMTP_SECURITE: "starttls" }).smtp
      ?.port,
  ).toBe(587);
});
