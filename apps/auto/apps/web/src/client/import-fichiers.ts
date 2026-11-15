import { t } from "./i18n";

export const LIMITE_FICHIERS = 5000;
export const LIMITE_FICHIER = 20 * 1024 * 1024;
export const LIMITE_LOT = 1024 * 1024 * 1024;
export interface FichierLocal {
  fichier: File;
  chemin: string;
}

/** Does not read the contents: the bytes are sent only when the file passes into the queue. */
export function selectionFichiers(fichiers: Iterable<File>): FichierLocal[] {
  return [...fichiers].map((fichier) => ({ fichier, chemin: fichier.webkitRelativePath || fichier.name }));
}
export function validerSelection(existants: FichierLocal[], ajouts: FichierLocal[]) {
  const uniques = new Map<string, FichierLocal>();
  for (const f of [...existants, ...ajouts]) {
    const chemin = f.chemin.replaceAll("\\", "/");
    if (!chemin || chemin.startsWith("/") || chemin.split("/").some((s) => !s || s === "." || s === ".."))
      throw Error(t("files.error.invalid_path"));
    uniques.set(`${chemin}\0${f.fichier.size}\0${f.fichier.lastModified}`, { ...f, chemin });
  }
  const resultat = [...uniques.values()];
  if (resultat.length > LIMITE_FICHIERS) throw Error(t("files.error.too_many", { count: LIMITE_FICHIERS }));
  if (resultat.reduce((s, f) => s + f.fichier.size, 0) > LIMITE_LOT) throw Error(t("files.error.batch_size"));
  return resultat;
}

/** Chromium readers return folders page by page: drain each reader, not only the first 100 entries. */
export async function fichiersDeposes(transfert: DataTransfer): Promise<FichierLocal[]> {
  const entrees = [...transfert.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  const simples = selectionFichiers(transfert.files);
  if (!entrees.length) return simples;
  const resultat: FichierLocal[] = [];
  const file = [...entrees];
  let visites = 0;
  while (file.length) {
    const entree = file.shift()!;
    if (++visites > 20_000) throw Error(t("files.error.folder_too_big"));
    if (entree.isFile) {
      const fichier = await new Promise<File>((ok, ko) => (entree as FileSystemFileEntry).file(ok, ko));
      resultat.push({ fichier, chemin: entree.fullPath.replace(/^\//, "") });
      if (resultat.length > LIMITE_FICHIERS) throw Error(t("files.error.too_many", { count: LIMITE_FICHIERS }));
    } else if (entree.isDirectory) {
      const lecteur = (entree as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const enfants = await new Promise<FileSystemEntry[]>((ok, ko) => lecteur.readEntries(ok, ko));
        if (!enfants.length) break;
        file.push(...enfants);
        if (file.length + visites > 20_000) throw Error(t("files.error.folder_entries"));
      }
    }
  }
  return resultat;
}
