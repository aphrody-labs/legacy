// Security headers of the HTML pages (CSP with a report endpoint), sitemap, robots.txt and security.txt.
// The CSP allows the site scripts ('self') and inline scripts by their SHA-256 hash, computed on the HTML actually
// served (construction.tsx in production). Violations are received on /csp-rapport.

export const ORIGINE = "https://auto.aphrody.com";
/** Indexable public pages (the others are `noindex`: application, shared quotes and invoices). */
export const PAGES_PUBLIQUES = ["/", "/tarifs", "/telechargements", "/mentions-legales", "/confidentialite"] as const;

export const PLAN_DU_SITE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES_PUBLIQUES.map((p) => `  <url><loc>${ORIGINE}${p}</loc></url>`).join("\n")}
</urlset>
`;

export const ROBOTS = `User-agent: *
Allow: /

Sitemap: ${ORIGINE}/sitemap.xml
`;

/** RFC 9116: rolling 180-day expiry from startup (the file does not go stale between two deliveries). */
export function securityTxt(maintenant = new Date()): string {
  const expire = new Date(maintenant.getTime() + 180 * 86_400_000);
  expire.setUTCHours(0, 0, 0, 0);
  return `Contact: mailto:contact@aphrody.com
Expires: ${expire.toISOString()}
Preferred-Languages: fr, en
Canonical: ${ORIGINE}/.well-known/security.txt
`;
}

const texte = (corps: string, type: string, cache = "public, max-age=3600") =>
  new Response(corps, {
    headers: { "content-type": type, "cache-control": cache, "x-content-type-options": "nosniff" },
  });

export function routesReferencement() {
  const security = securityTxt();
  return {
    "/sitemap.xml": () => texte(PLAN_DU_SITE, "application/xml; charset=utf-8"),
    "/robots.txt": () => texte(ROBOTS, "text/plain; charset=utf-8"),
    "/.well-known/security.txt": () => texte(security, "text/plain; charset=utf-8"),
  };
}

/** `'sha256-…'` hashes of the inline `<script>` (without `src`) or `<style>` elements of a page. */
const BALISES = {
  script: /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
  style: /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
};
function empreintes(html: string, balise: keyof typeof BALISES): string[] {
  const resultat = new Set<string>();
  for (const m of html.matchAll(BALISES[balise])) {
    if (/\ssrc\s*=/i.test(m[1]!) || !m[2]) continue;
    resultat.add(`'sha256-${new Bun.CryptoHasher("sha256").update(m[2]).digest("base64")}'`);
  }
  return [...resultat];
}
export const empreintesScripts = (html: string) => empreintes(html, "script");
export const empreintesStyles = (html: string) => empreintes(html, "style");

export const POINT_RAPPORT = "/csp-rapport";

/**
 * Security headers of an HTML page. Enforced policy: `default-src 'self'`, scripts by hash, inline styles tolerated
 * (`style` attributes and elements injected by components). Observed policy (`Report-Only`): styles by hash only and
 * `form-action 'self'`, to measure before hardening.
 */
export function entetesSecurite(html: string): Record<string, string> {
  const scripts = ["'self'", ...empreintesScripts(html)].join(" ");
  const commun = [
    "default-src 'self'",
    `script-src ${scripts}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' https:",
    "frame-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ];
  const rapport = [`report-uri ${POINT_RAPPORT}`, "report-to csp"];
  return {
    "content-security-policy": [...commun, "style-src 'self' 'unsafe-inline'", ...rapport].join("; "),
    "content-security-policy-report-only": [
      ...commun,
      ["style-src 'self'", ...empreintesStyles(html)].join(" "),
      "form-action 'self'",
      ...rapport,
    ].join("; "),
    "reporting-endpoints": `csp="${POINT_RAPPORT}"`,
    "x-frame-options": "DENY",
    // No popup window (Google/Microsoft and Stripe sign-ins use redirects): full isolation.
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  };
}

/** HTML page served from memory, with ETag and security headers. */
export function reponsePage(req: Request, corps: string): Response {
  const etag = `"${new Bun.CryptoHasher("sha256").update(corps).digest("hex").slice(0, 16)}"`;
  const entetes = { ...entetesSecurite(corps), etag, "cache-control": "no-cache" };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: entetes });
  return new Response(corps, { headers: { ...entetes, "content-type": "text/html;charset=utf-8" } });
}

/**
 * `POST /csp-rapport`: CSP reports (`application/reports+json` of the Reporting API or `application/csp-report`).
 * Logs one line per violation (directive, blocked origin, document path without query), without IP address,
 * headers or content; nothing is stored. Rate limited to `limite` lines per minute for the whole server.
 */
export function routeRapportCsp(limite = 30, journal: (ligne: string) => void = console.warn) {
  let fenetre = 0;
  let compte = 0;
  const reduire = (u: unknown) => {
    if (typeof u !== "string" || !u) return "";
    if (!u.includes(":")) return u.slice(0, 40); // inline, eval, self…
    try {
      return new URL(u).origin;
    } catch {
      return u.split(":")[0]!.slice(0, 20);
    }
  };
  const chemin = (u: unknown) => {
    try {
      return typeof u === "string" ? new URL(u).pathname.slice(0, 120) : "";
    } catch {
      return "";
    }
  };
  return {
    POST: async (req: Request) => {
      const longueur = Number(req.headers.get("content-length") ?? 0);
      if (longueur > 64 * 1024) return new Response(null, { status: 413 });
      const maintenant = Math.floor(Date.now() / 60_000);
      if (maintenant !== fenetre) {
        fenetre = maintenant;
        compte = 0;
      }
      let corps: unknown;
      try {
        corps = JSON.parse((await req.text()).slice(0, 64 * 1024));
      } catch {
        return new Response(null, { status: 400 });
      }
      const rapports = (Array.isArray(corps) ? corps : [corps]).slice(0, 20);
      for (const r of rapports as {
        type?: unknown;
        body?: Record<string, unknown>;
        "csp-report"?: Record<string, unknown>;
      }[]) {
        const c = r?.body ?? r?.["csp-report"];
        if (!c || compte >= limite) continue;
        compte++;
        journal(
          `csp ${r?.type === "csp-violation" || r?.["csp-report"] ? "violation" : "report"} ` +
            `directive=${String(c.effectiveDirective ?? c["effective-directive"] ?? c["violated-directive"] ?? "").slice(0, 40)} ` +
            `blocked=${reduire(c.blockedURL ?? c["blocked-uri"])} ` +
            `document=${chemin(c.documentURL ?? c["document-uri"])} ` +
            `mode=${String(c.disposition ?? "").slice(0, 12)}`,
        );
      }
      return new Response(null, { status: 204 });
    },
  };
}
