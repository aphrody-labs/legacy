// Webhooks of the "aphrody" GitHub App.
// POST /github: X-Hub-Signature-256 signature (HMAC SHA-256 of the raw body, secret GITHUB_WEBHOOK_SECRET) verified in
// constant time, then the events useful to automation (red CI, push to the default branch, published release,
// security alerts, installations) go, summarized, into the Cloudflare queue `github-events`. The
// HTTP pull consumer (infra/agents/github-events.ts, prd) converts them into `ai-os orch` tasks. The rest is
// acknowledged (202) with no effect. No request data is logged.

export type GithubEvent = {
  v: 1;
  delivery: string;
  event: string;
  action?: string;
  kind: "ci_red" | "push_main" | "release" | "security" | "installation";
  repo?: string;
  ref?: string;
  sha?: string;
  /** push: base commit (payload.before), for the review range. */
  before?: string;
  url?: string;
  title?: string;
  actor?: string;
  at: string;
};

interface Env {
  GITHUB_WEBHOOK_SECRET: string;
  EVENTS: Queue<GithubEvent>;
}

const enc = new TextEncoder();

async function verify(
  secret: string,
  body: ArrayBuffer,
  header: string | null,
): Promise<boolean> {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  const hex = header.slice(7);
  if (!/^[0-9a-f]{64}$/.test(hex)) return false;
  const got = new Uint8Array(mac.length);
  for (let i = 0; i < got.length; i++)
    got[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return crypto.subtle.timingSafeEqual(mac, got);
}

/** Accounts where we installed the App: a third-party installation (public App) creates no task. */
export const OWNERS = new Set(["aphrody-labs", "yolo-rs", "aphrody-dev"]);
// workflow_run events that reflect the default branch itself (never a PR, even from a fork).
const MAIN_EVENTS = new Set([
  "push",
  "schedule",
  "workflow_dispatch",
  "merge_group",
]);
const FAIL = new Set([
  "failure",
  "timed_out",
  "startup_failure",
  "action_required",
]);
const SECURITY = new Set([
  "code_scanning_alert",
  "dependabot_alert",
  "secret_scanning_alert",
  "repository_advisory",
]);

/** Résumé d'un événement GitHub, ou null s'il ne déclenche rien. */
export function classify(
  event: string,
  delivery: string,
  p: any,
): GithubEvent | null {
  const base = {
    v: 1 as const,
    delivery,
    event,
    action: p?.action,
    repo: p?.repository?.full_name,
    actor: p?.sender?.login,
    at: new Date().toISOString(),
  };
  const main = p?.repository?.default_branch ?? "main";
  const owner = String(
    p?.repository?.owner?.login ?? p?.installation?.account?.login ?? "",
  ).toLowerCase();
  if (!OWNERS.has(owner)) return null;
  if (
    event === "workflow_run" &&
    p.action === "completed" &&
    FAIL.has(p.workflow_run?.conclusion) &&
    p.workflow_run?.head_branch === main &&
    MAIN_EVENTS.has(p.workflow_run?.event) &&
    p.workflow_run?.head_repository?.full_name === p.repository?.full_name
  )
    return {
      ...base,
      kind: "ci_red",
      ref: main,
      sha: p.workflow_run.head_sha,
      url: p.workflow_run.html_url,
      title: `${p.workflow_run.name} : ${p.workflow_run.conclusion}`,
    };
  if (
    event === "push" &&
    p.ref === `refs/heads/${main}` &&
    !p.deleted &&
    p.after &&
    !/^0+$/.test(p.after)
  )
    return {
      ...base,
      kind: "push_main",
      ref: main,
      sha: p.after,
      before: /^0+$/.test(p.before ?? "") ? undefined : p.before,
      url: p.compare,
      title: String(p.head_commit?.message ?? "")
        .split("\n")[0]!
        .slice(0, 200),
    };
  if (event === "release" && p.action === "published")
    return {
      ...base,
      kind: "release",
      ref: p.release?.tag_name,
      url: p.release?.html_url,
      title: p.release?.name ?? p.release?.tag_name,
    };
  if (
    SECURITY.has(event) &&
    ["created", "reopened", "published", "reported"].includes(p.action)
  ) {
    const a = p.alert ?? p.repository_advisory ?? {};
    const title =
      a.rule?.description ??
      a.security_advisory?.summary ??
      a.secret_type_display_name ??
      a.summary ??
      event;
    return {
      ...base,
      kind: "security",
      url: a.html_url,
      title: String(title).slice(0, 200),
    };
  }
  if (
    (event === "installation" || event === "installation_repositories") &&
    p.action
  )
    return {
      ...base,
      kind: "installation",
      repo: p.installation?.account?.login,
      title: `${event} ${p.action}`,
    };
  return null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url);
    if (u.pathname === "/health")
      return Response.json({ name: "aphrody-github", ok: true });
    if (u.pathname !== "/github") return new Response(null, { status: 404 });
    if (req.method !== "POST") return new Response(null, { status: 405 });
    const body = await req.arrayBuffer();
    if (
      !(await verify(
        env.GITHUB_WEBHOOK_SECRET,
        body,
        req.headers.get("x-hub-signature-256"),
      ))
    )
      return new Response("signature invalide", { status: 401 });
    const event = req.headers.get("x-github-event") ?? "";
    const delivery =
      req.headers.get("x-github-delivery") ?? crypto.randomUUID();
    if (event === "ping") return Response.json({ ok: true, ping: true });
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return new Response("JSON invalide", { status: 400 });
    }
    const e = classify(event, delivery, payload);
    if (e) await env.EVENTS.send(e, { contentType: "json" });
    return Response.json(
      { queued: !!e, kind: e?.kind ?? null },
      { status: 202 },
    );
  },
} satisfies ExportedHandler<Env>;
