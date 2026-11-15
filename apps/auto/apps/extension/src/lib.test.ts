import { expect, test } from "bun:test";
import { SOURCE_LOCALE } from "@auto/i18n";
import { catalogs, traducteur } from "./i18n";
import {
  erreurApi,
  jetonValide,
  messageDepot,
  motifHote,
  nomFichier,
  normaliserInstance,
  texteBadge,
  typeFichier,
  urlDepot,
} from "./lib";

const t = traducteur(SOURCE_LOCALE);
const other = Object.keys(catalogs).find((l) => l !== SOURCE_LOCALE)!;
const octets = (s: string) => new TextEncoder().encode(s);

test("instance: origin only, https required except localhost", () => {
  expect(normaliserInstance(" https://auto.aphrody.com/app/factures ")).toBe("https://auto.aphrody.com");
  expect(normaliserInstance("http://localhost:3001")).toBe("http://localhost:3001");
  expect(() => normaliserInstance("http://auto.exemple.fr")).toThrow(t.t("ext.error.instance_https"));
  expect(() => normaliserInstance("pas une url")).toThrow(t.t("ext.error.instance_invalid"));
  expect(motifHote("https://factures.fournisseur.fr/f/123.pdf")).toBe("https://factures.fournisseur.fr/*");
});

test("auto_ API token", () => {
  expect(jetonValide("auto_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_")).toBe(true);
  expect(jetonValide("Bearer x")).toBe(false);
});

test("file type read from the bytes, not the header", () => {
  expect(typeFichier(octets("%PDF-1.7\n..."))).toBe("application/pdf");
  expect(typeFichier(octets("﻿<?xml version='1.0'?><rsm:CrossIndustryInvoice/>"))).toBe("application/xml");
  expect(typeFichier(octets("<rsm:CrossIndustryInvoice xmlns:rsm='x'>"))).toBe("application/xml");
  expect(typeFichier(octets("<!doctype html><html>"))).toBeNull();
});

test("file name: Content-Disposition (RFC 5987), else URL, extension guaranteed", () => {
  const pdf = "application/pdf" as const;
  expect(nomFichier("https://x.fr/dl?id=1", "attachment; filename*=UTF-8''Facture%20n%C2%B07.pdf", pdf)).toBe(
    "Facture n°7.pdf",
  );
  expect(nomFichier("https://x.fr/dl", 'inline; filename="F-2026-0001.PDF"', pdf)).toBe("F-2026-0001.PDF");
  expect(nomFichier("https://x.fr/factures/F%2012", null, pdf)).toBe("F 12.pdf");
  expect(nomFichier("https://x.fr/", null, "application/xml")).toBe("invoice.xml");
  expect(nomFichier("https://x.fr/a", 'attachment; filename="../../etc/passwd"', pdf)).toBe(".._.._etc_passwd.pdf");
  expect(urlDepot("https://auto.aphrody.com", "F 1.pdf")).toBe(
    "https://auto.aphrody.com/v1/factures-recues?nom=F%201.pdf",
  );
});

test("messages: deposit, duplicate, badge, API errors", () => {
  const base = { id: "1", fournisseur: "Fournisseur SAS", numero: "F-12", ttcCents: 123456, anomalies: [] };
  const ok = messageDepot({ ...base, statut: "validee" }, "f.pdf");
  expect(ok.titre).toBe(t.t("ext.deposit.saved.title"));
  // The amount comes from Intl in the translator's locale, never a hand-written format.
  expect(ok.message).toContain(t.currency(1234.56, "EUR"));
  expect(ok.message).toContain("F-12");
  expect(messageDepot({ ...base, statut: "a_verifier", anomalies: ["a", "b"] }, "f.pdf").message).toContain(
    "2 points to check",
  );
  expect(messageDepot({ ...base, statut: "validee", doublon: true }, "f.pdf").titre).toBe(
    t.t("ext.deposit.duplicate.title"),
  );
  // Another shipped locale: same structure, its own wording and number format.
  const o = traducteur(other);
  expect(messageDepot({ ...base, statut: "validee" }, "f.pdf", o).message).toContain(o.currency(1234.56, "EUR"));
  expect(o.t("ext.badge.title", { count: 3 })).not.toBe(t.t("ext.badge.title", { count: 3 }));
  expect(t.t("ext.badge.title", { count: 1 })).toContain("1 invoice to check");
  expect([0, 7, 150].map(texteBadge)).toEqual(["", "7", "99+"]);
  expect(erreurApi(401, null)).toBe(t.t("ext.error.token_rejected"));
  expect(erreurApi(415, { erreur: "Content-Type attendu", details: ["pdf"] })).toBe("Content-Type attendu (pdf)"); // the server text is passed through as is
});
