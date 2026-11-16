import { ErreurApi } from "../i18n";
import { ErreurMetier } from "@auto/store";
import { segmentsDe, authentifier } from "@auto/tenancy";
import { importerFichier, cheminImport } from "@auto/services/imports-fichiers";
import type { Module, Chemins } from ".";
import { op, objet, str, uuid } from "../openapi-outils";
const MAX = 20 * 1024 * 1024 + 65536;
async function formulaire(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data;") || !req.body)
    throw new ErreurApi("multipart_required", [], 415);
  if (Number(req.headers.get("content-length") ?? 0) > MAX)
    throw new ErreurApi("file_max_20mb", [], 413);
  const reader = req.body.getReader();
  let taille = 0;
  const flux = new ReadableStream<Uint8Array>({
    async pull(c) {
      try {
        const r = await reader.read();
        if (r.done) {
          c.close();
          return;
        }
        taille += r.value.length;
        if (taille > MAX) {
          await reader.cancel();
          c.error(new ErreurApi("file_max_20mb", [], 413));
          return;
        }
        c.enqueue(r.value);
      } catch (e) {
        c.error(e);
      }
    },
    cancel(r) {
      return reader.cancel(r);
    },
  });
  try {
    return await new Response(flux, { headers: { "content-type": req.headers.get("content-type")! } }).formData();
  } catch (e) {
    if (e instanceof ErreurMetier) throw e;
    throw new ErreurApi(taille > MAX ? "file_max_20mb" : "invalid_multipart", [], taille > MAX ? 413 : 422);
  }
}
export const routes: Module = ({ sql, auth, ba }) => ({
  "/v1/imports-fichiers": {
    POST: auth("ecrire", async (req, a) => {
      const attendue = typeof ba.options.baseURL === "string" ? new URL(ba.options.baseURL).origin : null;
      const origine = req.headers.get("origin"),
        bearer = /^Bearer\s+\S+$/i.test(req.headers.get("authorization") ?? "");
      if (req.headers.get("x-auto-import") !== "1" || !attendue || (origine ? origine !== attendue : !bearer))
        throw new ErreurApi("import_origin_refused", [], 403);
      if (!origine) {
        const parJeton = await authentifier(sql, req.headers.get("authorization")!.replace(/^Bearer\s+/i, ""));
        if (!parJeton || parJeton.userId !== a.userId || parJeton.tenantId !== a.tenantId)
          throw new ErreurApi("import_token_invalid", [], 403);
      }
      const f = await formulaire(req);
      for (const k of ["fichier", "cheminRelatif", "segment", "cible"])
        if (f.getAll(k).length > 1) throw new ErreurApi("one_file_one_value");
      for (const k of f.keys())
        if (!["fichier", "cheminRelatif", "segment", "cible"].includes(k))
          throw new ErreurApi("import_field_unknown");
      const fichier = f.get("fichier"),
        s = f.get("segment"),
        cible = f.get("cible") ?? "index";
      if (!(fichier instanceof File) || !fichier.name || fichier.name.length > 255 || fichier.size > 20 * 1024 * 1024)
        throw new ErreurApi("file_required_20mb", [], 413);
      if (typeof s !== "string" || !segmentsDe(a).includes(s as never))
        throw new ErreurApi("segment_forbidden", [], 403);
      if (typeof cible !== "string") throw new ErreurApi("invalid_processing");
      const chemin = cheminImport(f.get("cheminRelatif"), fichier.name);
      return Response.json(
        await importerFichier(
          sql,
          a.tenantId,
          a.userId,
          { nom: fichier.name, chemin, segment: s, cible, contenu: await fichier.bytes() },
          req.signal,
        ),
        { status: 201 },
      );
    }),
  },
});
const entree = objet(
  {
    fichier: { type: "string", format: "binary" },
    cheminRelatif: str,
    segment: str,
    cible: { type: "string", enum: ["index", "devis", "facture"] },
  },
  ["fichier", "segment"],
);
export const openapi: Chemins = {
  "/v1/imports-fichiers": {
    post: {
      ...op({
        resume: "Import a file or a folder item, with relative path and deduplication",
        tag: "Arrivals",
        droit: "ecrire",
        succes: {
          201: objet({
            id: uuid,
            fichierId: uuid,
            nom: str,
            cheminRelatif: str,
            segment: str,
            doublon: { type: "boolean" },
            devisId: { type: ["string", "null"], format: "uuid" },
            recueId: { type: ["string", "null"], format: "uuid" },
          }),
        },
        erreurs: [401, 403, 413, 415, 422],
      }),
      requestBody: { required: true, content: { "multipart/form-data": { schema: entree } } },
      parameters: [
        { name: "x-auto-import", in: "header", required: true, schema: { type: "string", const: "1" } },
        {
          name: "Origin",
          in: "header",
          required: false,
          description: "Exact front origin for a cookie session; optional only with a valid Bearer.",
          schema: str,
        },
      ],
    },
  },
};
