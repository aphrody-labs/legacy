import { createContext, useContext } from "react";
import type { Moi } from "@auto/client";
import { libellesRoles, peut as peutRole } from "@auto/tenancy/droits";
import { locale } from "./i18n";

export interface Session {
  moi: Moi;
  recharger: () => Promise<void>;
}

export const ContexteSession = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(ContexteSession);
  if (!s) throw new Error("session absente");
  return s;
}

/** Rights per role, shared with the API (`@auto/tenancy/droits`); the API alone has the final say. */
export const peut = peutRole;

/** Role labels in the language of the page. */
export const LIBELLE_ROLE = libellesRoles(locale);
