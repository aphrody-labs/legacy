// Better Auth client of the front: same origin (/api/auth, relayed to the API by the web server), HttpOnly session
// cookie. Plugins aligned with the server (packages/tenancy/src/auth.ts).
import { apiKeyClient } from "@better-auth/api-key/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { ac, roles } from "@auto/tenancy/droits";
import { adminClient, magicLinkClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { t } from "./i18n";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [
    organizationClient({ ac, roles }),
    twoFactorClient(),
    passkeyClient(),
    apiKeyClient(),
    adminClient(),
    magicLinkClient(),
    // Sign-in started by an OAuth client (MCP): the signed /oauth2/authorize request is relayed.
    oauthProviderClient(),
  ],
});

/** Better Auth error codes with a catalog message (`auth.error.<code>`): stable codes, English server messages. */
const CODES = new Set([
  "ACCOUNT_NOT_LINKED",
  "FAILED_TO_UNLINK_LAST_ACCOUNT",
  "INVALID_EMAIL_OR_PASSWORD",
  "INVALID_PASSWORD",
  "INVALID_CODE",
  "INVALID_BACKUP_CODE",
  "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
  "INVALID_TWO_FACTOR_COOKIE",
  "USER_NOT_FOUND",
  "BANNED_USER",
  "PASSWORD_TOO_SHORT",
  "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION",
  "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE",
  "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER",
  "INVITATION_NOT_FOUND",
  "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
]);

export function messageAuth(e: { code?: string; message?: string; status?: number } | null | undefined) {
  if (!e) return "";
  if (e.status === 429) return t("auth.error.rate_limited");
  return (
    (e.code && CODES.has(e.code) && t(`auth.error.${e.code.toLowerCase()}`)) || e.message || t("auth.error.generic")
  );
}

/** Return of a call that continues an OAuth flow (consent, sign-in started by an MCP client). */
export function suivreRedirection(d: unknown): boolean {
  const r = d as { redirect?: boolean; url?: string } | null;
  if (r?.url && (r.redirect ?? true) && /^https?:\/\//.test(r.url)) {
    location.assign(r.url);
    return true;
  }
  return false;
}
