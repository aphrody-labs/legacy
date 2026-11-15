import { expect, test } from "bun:test";
import { fichiersDeposes, validerSelection } from "./import-fichiers";

test("local import: tree of more than 100 files, reader drained to the end", async () => {
  const pages = [
    Array.from({ length: 100 }, (_, i) => entree(`Dossier/${i}.txt`)),
    [entree("Dossier/100.txt"), entree("Dossier/101.txt")],
    [],
  ];
  let lectures = 0;
  const dossier = {
    isFile: false,
    isDirectory: true,
    createReader: () => ({
      readEntries: (ok: (e: unknown[]) => void) => {
        lectures++;
        ok(pages.shift()!);
      },
    }),
  };
  const depot = { items: [{ webkitGetAsEntry: () => dossier }], files: [] } as unknown as DataTransfer;
  const resultat = await fichiersDeposes(depot);
  expect(resultat.length).toBe(102);
  expect(resultat.at(-1)?.chemin).toBe("Dossier/101.txt");
  expect(lectures).toBe(3);
});
function entree(chemin: string) {
  return {
    isFile: true,
    isDirectory: false,
    fullPath: `/${chemin}`,
    file: (ok: (f: File) => void) => ok(new File(["preuve"], chemin.split("/").at(-1)!)),
  };
}
test("local import: repeated selection deduplicated, traversing paths and out-of-limit batches refused", () => {
  const fichier = new File(["preuve"], "preuve.txt", { lastModified: 1 });
  const f = { fichier, chemin: "Dossier/preuve.txt" };
  expect(validerSelection([f], [f])).toHaveLength(1);
  expect(() => validerSelection([], [{ ...f, chemin: "../preuve.txt" }])).toThrow("path");
  expect(() =>
    validerSelection(
      [],
      Array.from({ length: 5001 }, (_, i) => ({ ...f, chemin: `${i}.txt` })),
    ),
  ).toThrow("5,000");
  const gros = { size: 1024 * 1024 * 1024 + 1, lastModified: 1 } as File;
  expect(() => validerSelection([], [{ fichier: gros, chemin: "gros.bin" }])).toThrow("1 GB");
});
