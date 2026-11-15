// router.aphrody.com: serverless Aphrody AI router.
//   GET  /                     M3 chat UI (tokens.css from packages/design, installable as a PWA)
//   GET  /v1/models            live offers: Gemini models (free tier) + Workers AI text models, plus virtual "auto:free"
//   POST /v1/chat/completions  OpenAI wire; model "auto" / "auto:free" walks every free offer until one answers
// Same contract as the relay router, so the C ABI (src/include/ay/router.h), ay-router and any OpenAI SDK work against it.
import tokens from "../../../../packages/design/tokens/tokens.css";

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai";
const json = (b, s = 200) => Response.json(b, { status: s, headers: { "access-control-allow-origin": "*" } });

let catalog = { at: 0, offers: [] };

/** Offers discovered at run time: nothing hardcoded beyond the two provider endpoints. */
async function offers(env) {
  if (Date.now() - catalog.at < 10 * 60_000 && catalog.offers.length) return catalog.offers;
  const out = [];
  if (env.GEMINI_API_KEY) {
    const r = await fetch(`${GEMINI}/models`, { headers: { authorization: `Bearer ${env.GEMINI_API_KEY}` } }).catch(() => null);
    const d = r?.ok ? await r.json() : { data: [] };
    for (const m of d.data ?? []) {
      const id = String(m.id).replace(/^models\//, "");
      if (/flash|gemma/.test(id) && !/image|tts|audio|live|embed|preview-native/.test(id)) out.push({ id: `gemini/${id}`, provider: "gemini", model: id });
    }
  }
  const w = await env.AI.models({ task: "Text Generation" }).catch(() => []);
  for (const m of w) out.push({ id: `workers-ai/${m.name}`, provider: "workers-ai", model: m.name });
  // Gemini flash first (largest free quota), then larger Workers AI models.
  out.sort((a, b) => (a.provider === b.provider ? (/flash/.test(b.model) - /flash/.test(a.model)) || (/70b|120b|large/.test(b.model) - /70b|120b|large/.test(a.model)) : a.provider === "gemini" ? -1 : 1));
  catalog = { at: Date.now(), offers: out };
  return out;
}

async function call(env, o, body) {
  if (o.provider === "gemini") {
    const r = await fetch(`${GEMINI}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.GEMINI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ ...body, model: o.model, stream: false }),
    });
    if (!r.ok) throw new Error(`${o.id}: ${r.status}`);
    const d = await r.json();
    return { ...d, model: o.id };
  }
  const r = await env.AI.run(o.model, { messages: body.messages, max_tokens: body.max_tokens ?? 1024 });
  const text = r.response ?? r.choices?.[0]?.message?.content ?? (typeof r === "string" ? r : "");
  if (!text) throw new Error(`${o.id}: empty`);
  return {
    id: crypto.randomUUID(), object: "chat.completion", created: Math.floor(Date.now() / 1000), model: o.id,
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: r.usage ?? {},
  };
}

async function chat(env, body) {
  const all = await offers(env);
  const want = body.model ?? "auto";
  const exact = all.filter((o) => o.id === want || o.model === want);
  const order = [...exact, ...all.filter((o) => !exact.includes(o))];
  const tried = [];
  for (const o of order.slice(0, 8)) {
    try {
      const r = await call(env, o, body);
      r.router = { tried, served_by: o.id };
      return json(r);
    } catch (e) {
      tried.push(String(e.message ?? e).slice(0, 120));
    }
  }
  return json({ error: { message: "every free offer failed", tried } }, 503);
}

const authorized = (req, env) => !env.ROUTER_KEY || req.headers.get("authorization") === `Bearer ${env.ROUTER_KEY}`;

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (req.method === "OPTIONS")
      return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST" } });
    if (pathname === "/" || pathname === "/index.html")
      return new Response(page(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
    if (pathname === "/manifest.webmanifest")
      return json({ name: "Aphrody AI", short_name: "AI", start_url: "/", display: "standalone", background_color: "#0C141B", theme_color: "#0C141B" });
    if (!pathname.startsWith("/v1/")) return new Response("not found", { status: 404 });
    if (!authorized(req, env)) return json({ error: { message: "Authorization: Bearer <key> required" } }, 401);
    if (pathname === "/v1/models" && req.method === "GET")
      return json({ object: "list", data: [{ id: "auto:free", object: "model", owned_by: "aphrody" }, ...(await offers(env)).map((o) => ({ id: o.id, object: "model", owned_by: o.provider }))] });
    if (pathname === "/v1/chat/completions" && req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || !Array.isArray(body.messages)) return json({ error: { message: "body must be JSON with a messages array" } }, 400);
      return chat(env, body);
    }
    return json({ error: { message: "not found" } }, 404);
  },
};

function page() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aphrody AI</title><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#0C141B">
<style>${tokens}
*{box-sizing:border-box}html,body{height:100%;margin:0}body{display:grid;grid-template-rows:64px 1fr auto;background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);font:var(--md-sys-typescale-body-large-size)/1.5 var(--md-ref-typeface-plain)}
header{display:flex;align-items:center;gap:16px;padding:0 16px}header h1{margin:0;font:400 22px var(--md-ref-typeface-brand)}
header select,header input{margin-left:auto;height:40px;border-radius:8px;border:1px solid var(--md-sys-color-outline-variant);background:var(--md-sys-color-surface-container);color:inherit;padding:0 12px;font:inherit;font-size:14px}
header input{margin-left:0;width:160px}
main{overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px;max-width:880px;width:100%;margin:0 auto}
.m{padding:12px 16px;border-radius:16px;max-width:85%;white-space:pre-wrap}.u{align-self:end;background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container)}
.a{background:var(--md-sys-color-surface-container-high)}.a small{display:block;margin-top:6px;color:var(--md-sys-color-on-surface-variant);font:12px var(--md-ref-typeface-code)}
form{display:flex;gap:8px;padding:12px 16px 20px;max-width:880px;width:100%;margin:0 auto}
textarea{flex:1;min-height:56px;max-height:200px;resize:vertical;border-radius:28px;border:0;padding:16px 20px;background:var(--md-sys-color-surface-container-highest);color:inherit;font:inherit}
button{height:56px;padding:0 24px;border:0;border-radius:9999px;background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary);font:500 14px var(--md-ref-typeface-plain);cursor:pointer}
</style></head><body>
<header><h1>Aphrody AI</h1><select id="model" aria-label="Model"><option>auto:free</option></select><input id="key" type="password" placeholder="Router key" aria-label="Router key"></header>
<main id="log" aria-live="polite"></main>
<form id="f"><textarea id="q" placeholder="Message" aria-label="Message" required></textarea><button>Send</button></form>
<script>
const $=id=>document.getElementById(id),hist=[];$("key").value=localStorage.k||"";
const H=()=>({authorization:"Bearer "+($("key").value||""),"content-type":"application/json"});
async function models(){const r=await fetch("/v1/models",{headers:H()});if(!r.ok)return;const d=await r.json();$("model").innerHTML=d.data.map(m=>"<option>"+m.id+"</option>").join("")}
$("key").onchange=()=>{localStorage.k=$("key").value;models()};models();
function add(c,t,meta){const d=document.createElement("div");d.className="m "+c;d.textContent=t;if(meta){const s=document.createElement("small");s.textContent=meta;d.append(s)}$("log").append(d);d.scrollIntoView();return d}
$("q").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("f").requestSubmit()}};
$("f").onsubmit=async e=>{e.preventDefault();const t=$("q").value.trim();if(!t)return;$("q").value="";add("u",t);hist.push({role:"user",content:t});
const w=add("a","...");const r=await fetch("/v1/chat/completions",{method:"POST",headers:H(),body:JSON.stringify({model:$("model").value,messages:hist})});
const d=await r.json();const c=d.choices?.[0]?.message?.content??(d.error?.message||"error");w.remove();add("a",c,d.model||"");if(d.choices)hist.push({role:"assistant",content:c})};
</script></body></html>`;
}
