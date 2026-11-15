// Roles and rights of a company's members: single source, shared by the API (access control of Better Auth's
// organization plugin, `exiger`) and by the front end (display only: the API remains the judge).
// No server dependency: importable in the browser (`@auto/tenancy/droits`).
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";
import { traducteurPour } from "./i18n";

export const ROLES = ["owner", "admin", "comptable", "lecture", "rh"] as const;
export type Role = (typeof ROLES)[number];

/** Business actions of the API (`auth(action, …)`). */
export type Action = "lire" | "ecrire" | "membres" | "parametres" | "rh";

export const DROITS: Record<Role, Action[]> = {
  owner: ["lire", "ecrire", "membres", "parametres", "rh"],
  admin: ["lire", "ecrire", "membres", "parametres", "rh"],
  comptable: ["lire", "ecrire"],
  lecture: ["lire"],
  rh: ["lire", "rh"],
};

/** Role labels in the language of the tag (catalogs); `LIBELLES` is the French set until the front end picks its language. */
export const libellesRoles = (locale?: string | null): Record<Role, string> => {
  const { t } = traducteurPour(locale);
  return Object.fromEntries(ROLES.map((r) => [r, t(`role.${r}`)])) as Record<Role, string>;
};

export const LIBELLES: Record<Role, string> = libellesRoles("fr");

export const estRole = (r: unknown): r is Role => typeof r === "string" && (ROLES as readonly string[]).includes(r);

export const peut = (role: Role, action: Action) => DROITS[role]?.includes(action) ?? false;

/**
 * Better Auth access control: default statements of the organization plugin (organization, members,
 * invitations), company API keys and auto business actions.
 */
export const statements = {
  ...defaultStatements,
  apiKey: ["create", "read", "update", "delete"],
  auto: ["lire", "ecrire", "membres", "parametres", "rh"],
} as const;

export const ac = createAccessControl(statements);

const gestion = {
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  apiKey: ["create", "read", "update", "delete"],
} as const;

export const roles = {
  owner: ac.newRole({ ...gestion, organization: ["update", "delete"], auto: [...DROITS.owner] }),
  admin: ac.newRole({ ...gestion, auto: [...DROITS.admin] }),
  comptable: ac.newRole({ auto: [...DROITS.comptable] }),
  lecture: ac.newRole({ auto: [...DROITS.lecture] }),
  rh: ac.newRole({ auto: [...DROITS.rh] }),
};
