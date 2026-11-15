import { expect, test } from "bun:test";
import { $ } from "bun";
import { empreinteFichiers } from "./empreinte";

test("deployment fingerprint: unindexed content, stable order and deletion", async () => {
  const fichier = `.cache/empreinte-${crypto.randomUUID()}`;
  const second = `${fichier}.b`;
  try {
    await Bun.write(fichier, "avant");
    await Bun.write(second, "autre fichier");
    expect(await empreinteFichiers([fichier, second])).toBe(await empreinteFichiers([second, fichier]));
    const avant = await empreinteFichiers([fichier]);
    expect(await empreinteFichiers([fichier, fichier])).toBe(avant);
    await Bun.write(fichier, "après");
    const apres = await empreinteFichiers([fichier]);
    expect(apres).not.toBe(avant);
    await $`rm -f ${fichier}`.quiet();
    expect(await empreinteFichiers([fichier])).not.toBe(apres);
  } finally {
    await $`rm -f ${fichier}`.quiet();
    await $`rm -f ${second}`.quiet();
  }
});
