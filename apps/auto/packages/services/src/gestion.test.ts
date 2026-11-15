import { afterAll, beforeAll, expect, test } from "bun:test";
import { testDb, withTenant, type Sql } from "@auto/store";
import { classeurGestion, rapportGestion } from "./gestion";

let sql: Sql;
let drop: () => Promise<void>;
const TENANT = crypto.randomUUID();

beforeAll(async () => {
  ({ sql, drop } = await testDb());
});
afterAll(() => drop());

test("management workbook: sheet and column names follow the language, segments filter the sheets", async () => {
  const fr = await withTenant(sql, TENANT, (tx) => classeurGestion(tx, ["clients", "fournisseurs"], "fr"));
  expect(fr.feuilles.map((f) => f.nom)).toEqual(["Comptabilité fournisseurs", "Comptabilité clients"]);
  const en = await withTenant(sql, TENANT, (tx) => classeurGestion(tx, ["clients"], "en"));
  expect(en.feuilles.map((f) => f.nom)).toEqual(["Customer accounting"]);
  expect(en.feuilles[0]!.colonnes.map((c) => c.titre)).toContain("Reference");
  const defaut = await withTenant(sql, TENANT, (tx) => classeurGestion(tx));
  expect(defaut.feuilles).toHaveLength(5);
});

test("management report: title, empty sheets and formatted values by language", () => {
  const classeur = {
    feuilles: [
      {
        nom: "Sheet",
        colonnes: [{ titre: "Amount", type: "euros" as const }, { titre: "Progress", type: "pourcent" as const }],
        lignes: [[123456, 5000]],
      },
      { nom: "Empty", colonnes: [], lignes: [] },
    ],
  };
  expect(rapportGestion(classeur, "en").length).toBeGreaterThan(1000);
  expect(rapportGestion(classeur, "fr").length).toBeGreaterThan(1000);
});
