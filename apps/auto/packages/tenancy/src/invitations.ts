// E-mail invitations on Better Auth's organization plugin: the invitation id serves as the
// token (link /app/invitation?id=…), 7 days, single use, revocable. Invitations predating
// Better Auth keep their hash: the old link (`/invitation#<token>`) is still accepted.
import { ErreurMetier, type Sql } from "@auto/store";
import { authDe } from "./auth";
import { emailValide, hash, normaliserEmail } from "./commun";
import { ROLES, estRole, type Role } from "./droits";
import { ba } from "./erreurs";
import { auNomDe, bearer, connecter, exiger, verifierMotDePasse, type Auth, type Connexion } from "./index";

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  statut: "en_attente" | "acceptee" | "revoquee" | "expiree";
  createdAt: string;
}

interface Row {
  id: string;
  email: string;
  role: Role;
  status: string;
  expires_at: Date;
  created_at: Date;
}

const invitation = (r: Row): Invitation => ({
  id: r.id,
  email: r.email,
  role: r.role,
  expiresAt: r.expires_at.toISOString(),
  statut:
    r.status === "accepted"
      ? "acceptee"
      : r.status === "canceled" || r.status === "rejected"
        ? "revoquee"
        : r.expires_at.getTime() <= Date.now()
          ? "expiree"
          : "en_attente",
  createdAt: r.created_at.toISOString(),
});

/**
 * Invites an email with a role (mail sent by Better Auth, `sendInvitationEmail`). A pending invitation
 * for the same email is replaced; an owner can only be appointed by an owner.
 */
export async function inviter(sql: Sql, auth: Auth, emailBrut: string, role: Role): Promise<Invitation> {
  exiger(auth, "membres");
  const email = normaliserEmail(emailBrut ?? "");
  if (!emailValide(email)) throw new ErreurMetier("email invalide");
  if (!estRole(role)) throw new ErreurMetier("rôle invalide", [`attendu : ${ROLES.join(", ")}`]);
  if (role === "owner" && auth.role !== "owner") throw new ErreurMetier("seul un owner peut nommer un owner", [], 403);
  const i = await auNomDe(sql, auth, (headers) =>
    ba(authDe(sql).api.createInvitation({ headers, body: { email, role, organizationId: auth.tenantId } })),
  );
  const [r] = await sql<Row[]>`SELECT * FROM invitation WHERE id = ${i.id}`;
  return invitation(r!);
}

export async function listerInvitations(sql: Sql, auth: Auth): Promise<Invitation[]> {
  exiger(auth, "membres");
  const rows = await sql<Row[]>`SELECT * FROM invitation WHERE tenant_id = ${auth.tenantId} ORDER BY created_at DESC`;
  return rows.map(invitation);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function revoquerInvitation(sql: Sql, auth: Auth, id: string) {
  exiger(auth, "membres");
  const [r] = UUID.test(id ?? "")
    ? await sql`SELECT 1 FROM invitation WHERE id = ${id} AND tenant_id = ${auth.tenantId} AND status = 'pending'`
    : [];
  if (!r) throw new ErreurMetier("invitation introuvable ou déjà close", [], 404);
  await auNomDe(sql, auth, (headers) => ba(authDe(sql).api.cancelInvitation({ headers, body: { invitationId: id } })));
}

/** Pending invitation designated by its id (Better Auth link) or by an old token. */
async function enCours(sql: Sql, jetonOuId: string) {
  const [inv] = UUID.test(jetonOuId)
    ? await sql<{ id: string; tenant_id: string; email: string }[]>`
        SELECT id, tenant_id, email FROM invitation WHERE id = ${jetonOuId} AND status = 'pending' AND expires_at > now()`
    : await sql<{ id: string; tenant_id: string; email: string }[]>`
        SELECT id, tenant_id, email FROM invitation
        WHERE token_hash = ${hash(jetonOuId)} AND status = 'pending' AND expires_at > now()`;
  if (!inv) throw new ErreurMetier("invitation invalide, expirée ou déjà utilisée", [], 410);
  return inv;
}

/**
 * Acceptance without a session (/v1 facade): creates the account (12 characters minimum) or attaches an
 * existing account, whose password is then required (the link proves the mailbox, not the identity). Then
 * normal sign-in: the account's 2FA applies.
 */
export async function accepterInvitation(sql: Sql, jetonOuId: string, motDePasse: string): Promise<Connexion> {
  if (typeof jetonOuId !== "string" || typeof motDePasse !== "string")
    throw new ErreurMetier("jeton et mot de passe requis");
  const inv = await enCours(sql, jetonOuId);
  const api = authDe(sql).api;
  const [u] = await sql<{ id: string }[]>`SELECT id FROM app_user WHERE email = ${inv.email}`;
  let userId: string;
  if (u) {
    await verifierMotDePasse(sql, u.id, motDePasse);
    userId = u.id;
  } else {
    if (motDePasse.length < 12) throw new ErreurMetier("mot de passe : 12 caractères minimum");
    const r = await ba(
      api.signUpEmail({ body: { email: inv.email, password: motDePasse, name: inv.email.split("@")[0]! } }),
    );
    userId = r.user.id;
    await sql`DELETE FROM session WHERE token = ${r.token!}`;
  }
  // Ephemeral session of the recipient (without a company) for acceptance by Better Auth.
  const c = await authDe(sql).$context;
  const s = await c.internalAdapter.createSession(userId, true);
  try {
    await ba(api.acceptInvitation({ headers: bearer(s.token), body: { invitationId: inv.id } }));
  } finally {
    await c.internalAdapter.deleteSession(s.token);
  }
  return connecter(sql, inv.email, motDePasse, inv.tenant_id);
}
