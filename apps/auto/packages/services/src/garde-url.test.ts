import { describe, expect, test } from "bun:test";
import { gardeUrl } from "./automatisations";

describe("gardeUrl en production", () => {
  test("public addresses accepted", () => {
    expect(gardeUrl("https://api.example.com/v1", true, "").host).toBe("api.example.com");
  });

  test("internal addresses refused, including container names without a dot", () => {
    for (const u of [
      "http://localhost:3000",
      "http://127.0.0.1",
      "http://10.0.0.5",
      "http://box.local",
      "http://auto-api:3000/health",
      "http://postgres:5432",
      "http://[::1]/",
    ])
      expect(() => gardeUrl(u, true, ""), u).toThrow("adresse interne refusée");
  });

  test("internal hosts allowed by AUTO_HOTES_PERMIS", () => {
    expect(gardeUrl("http://ollama:11434/v1", true, "ollama, mailpit").hostname).toBe("ollama");
    expect(() => gardeUrl("http://auto-api:3000", true, "ollama")).toThrow("adresse interne refusée");
  });

  test("local network allowed only with AUTO_RESEAU_LOCAL=permis", () => {
    const avant = Bun.env.AUTO_RESEAU_LOCAL;
    try {
      Bun.env.AUTO_RESEAU_LOCAL = "permis";
      expect(gardeUrl("http://192.168.1.20:8123/api", true, "").hostname).toBe("192.168.1.20");
      Bun.env.AUTO_RESEAU_LOCAL = "oui";
      expect(() => gardeUrl("http://192.168.1.20:8123/api", true, "")).toThrow("adresse interne refusée");
    } finally {
      if (avant === undefined) delete Bun.env.AUTO_RESEAU_LOCAL;
      else Bun.env.AUTO_RESEAU_LOCAL = avant;
    }
  });

  test("hors production, tout est permis", () => {
    expect(gardeUrl("http://auto-api:3000", false, "").hostname).toBe("auto-api");
  });
});
