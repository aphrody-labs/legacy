// API error catalogs live next to the API (locales/<tag>.json); engine and negotiation come from @auto/i18n.
import { createTranslator, type MessageArgs, type Translator } from "@auto/i18n";
import { ErreurMetier } from "@auto/store";
import en from "../locales/en.json";
import fr from "../locales/fr.json";

export const catalogs: Readonly<Record<string, Readonly<Record<string, string>>>> = { en, fr };

/** Translator for the language the caller asked for (Accept-Language), else the source locale. */
export const traducteur = (req?: Request | null): Translator =>
  createTranslator(req?.headers.get("accept-language"), catalogs);

/**
 * Business error with a stable `code` (key `error.<code>` in the catalogs). The HTTP layer answers
 * `{ code, erreur, details }` where `erreur` is the message translated for the caller.
 */
export class ErreurApi extends ErreurMetier {
  constructor(
    readonly code: string,
    details: string[] = [],
    status = 422,
    readonly args: MessageArgs = {},
  ) {
    super(code, details, status);
  }
}

/** Body of an error answer: stable code, message in the caller's language, technical details. */
export const corpsErreur = (req: Request | null, code: string, args: MessageArgs = {}) => ({
  code,
  erreur: traducteur(req).t(`error.${code}`, args),
});

/** Error response (status + body of {@link corpsErreur}). */
export const refus = (req: Request | null, code: string, status: number, args: MessageArgs = {}): Response =>
  Response.json(corpsErreur(req, code, args), { status });

/** Thrown error to answer; any other error is logged and answered as `internal_error`. */
export function reponseErreur(e: unknown, req: Request | null): Response {
  if (e instanceof ErreurApi)
    return Response.json({ ...corpsErreur(req, e.code, e.args), details: e.details }, { status: e.status });
  if (e instanceof ErreurMetier) {
    // Message raised by another layer: its own text is the message, the code stays generic.
    return Response.json({ code: "business_error", erreur: e.message, details: e.details }, { status: e.status });
  }
  if (e instanceof SyntaxError) return refus(req, "invalid_json", 400);
  console.error(e);
  return refus(req, "internal_error", 500);
}
