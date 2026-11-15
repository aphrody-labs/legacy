// Static render of the open monorepo (aphrody-labs/open) for open.aphrody.com.
// Every value comes from a source file: rows, counts and roles from <repo>/open.lock.json, scripts from
// <repo>/package.json, revision from git, colors/type/shape from packages/design/tokens/tokens.css,
// icons from assets/brand/gen/symbols/svg, monogram from assets/brand/src/mark.svg. No literal color or row.
// Layout: M3 navigation rail + top app bar + search, opencode-style TUI panes, status bar with key hints.
// Zero dependencies, Bun APIs only. Usage: bun render.ts <repo-dir> <out-dir>
import { join } from "node:path";

const [src, out] = Bun.argv.slice(2);
if (!src || !out) {
  console.error("usage: bun render.ts <repo-dir> <out-dir>");
  process.exit(2);
}
const root = join(import.meta.dir, "../../..");
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Entry = {
  name: string; url: string; path: string; rev: string; language?: string; license?: string;
  archived?: boolean; fork?: boolean; role?: string; dropped_files?: unknown[]; submodules?: unknown[];
};
const lock: Entry[] = await Bun.file(join(src, "open.lock.json")).json();
const pkg = await Bun.file(join(src, "package.json")).json().catch(() => ({}));
const git = (args: string[]) => Bun.spawnSync(["git", "-C", src, ...args]).stdout.toString().trim();
// a plain export (no .git) passes the revision through OPEN_REV
const head = git(["rev-parse", "--short=9", "HEAD"]) || (Bun.env.OPEN_REV ?? "").slice(0, 9);
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]) || "main";
const tokens = await Bun.file(join(root, "packages/design/tokens/tokens.css")).text();
const mark = await Bun.file(join(root, "assets/brand/src/mark.svg")).text();
const icon = async (n: string) =>
  (await Bun.file(join(root, "assets/brand/gen/symbols/svg", `${n}.svg`)).text()).replace("<svg ", '<svg class="i" ');

const group = (e: Entry) => e.path.split("/")[0]!;
const tally = (f: (e: Entry) => string) => {
  const m = new Map<string, number>();
  for (const e of lock) m.set(f(e), (m.get(f(e)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
};
const groups = tally(group);
const languages = tally((e) => e.language || "other");
const core = lock.filter((e) => e.role === "core");
const scripts = Object.entries<string>(pkg.scripts ?? {});
const selected = core[0] ?? lock[0]!;

const nav = [["Catalog", "apps", "all"], ...groups.map(([g]) => [g[0]!.toUpperCase() + g.slice(1), g === "crates" ? "code" : g === "ecosystem" ? "hub" : "layers", g])];
const rail = (await Promise.all(nav.map(async ([label, ic, g], i) =>
  `<a class="dest${i ? "" : " on"}" href="#${g}" data-g="${g}"><span class="ind">${await icon(ic!)}</span><span>${esc(label)}</span></a>`))).join("");
const chips = [["all", lock.length] as const, ...groups]
  .map(([g, n], i) => `<button class="chip${i ? "" : " on"}" data-g="${esc(g)}">${esc(g)} <code>${n}</code></button>`).join("");
const rows = lock
  .map((e) => `<tr data-g="${esc(group(e))}" data-name="${esc(e.name)}"${e === selected ? ' class="on"' : ""}><td class="c">&gt;</td><td>${esc(e.name)}</td><td class="m">${esc(e.path)}</td><td class="m">${esc(e.language || "-")}</td><td class="p">${esc(e.rev.slice(0, 7))}</td><td class="m">${esc(e.license || "-")}</td></tr>`)
  .join("");
const max = languages[0]?.[1] ?? 1;
const langs = languages
  .map(([l, n]) => `<li><span>${esc(l)}</span><b>${n}</b><i style="--v:${(n / max).toFixed(3)}"></i></li>`).join("");
const cmds = scripts.map(([k, v]) => `<div class="cmd"><span>$</span> bun run ${esc(k)} <em># ${esc(v)}</em></div>`).join("");
const hints = [["/", "search"], ["tab", "pane"], ["enter", "open"], ["esc", "clear"]]
  .map(([k, l]) => `<kbd>${k}</kbd> ${l}`).join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aphrody open</title><meta name="description" content="${lock.length} upstream repositories merged into one Bun and Cargo monorepo.">
<style>${tokens}
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{display:grid;grid-template:"rail bar" 64px "rail main" 1fr "rail st" 32px/80px 1fr;background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);font:var(--md-sys-typescale-body-medium-size)/var(--md-sys-typescale-body-medium-line-height) var(--md-ref-typeface-plain)}
code,table,.m,.p,.cmd,kbd,.st,.pane>h2,.cl,.kv{font-family:var(--md-ref-typeface-code)}
.i{width:24px;height:24px;fill:currentColor}
nav{grid-area:rail;display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 0;border-right:1px solid var(--md-sys-color-outline-variant)}
nav>svg{width:40px;height:40px;margin-bottom:12px}
.dest{display:flex;flex-direction:column;align-items:center;gap:4px;width:80px;padding:6px 0;color:var(--md-sys-color-on-surface-variant);text-decoration:none;font-size:var(--md-sys-typescale-label-medium-size);font-weight:500}
.ind{display:grid;place-items:center;width:56px;height:32px;border-radius:var(--md-sys-shape-corner-full,9999px)}
.dest.on{color:var(--md-sys-color-on-surface)}.dest.on .ind{background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container)}
header{grid-area:bar;display:flex;align-items:center;gap:16px;padding:0 16px}
header h1{margin:0;font:400 var(--md-sys-typescale-title-large-size)/1 var(--md-ref-typeface-brand)}
header code{color:var(--md-sys-color-on-surface-variant)}
.search{margin-left:auto;display:flex;align-items:center;gap:12px;width:min(420px,40vw);height:48px;padding:0 16px;border-radius:9999px;background:var(--md-sys-color-surface-container-high);color:var(--md-sys-color-on-surface-variant)}
.search input{flex:1;border:0;background:none;color:var(--md-sys-color-on-surface);font:inherit;font-size:var(--md-sys-typescale-body-large-size);outline:0}
.btn{height:40px;padding:0 24px;border-radius:9999px;display:inline-grid;place-items:center;text-decoration:none;font-weight:500;background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary)}
main{grid-area:main;display:grid;grid-template-columns:1fr 400px 260px;gap:12px;padding:12px 16px;min-height:0}
.pane{position:relative;display:flex;flex-direction:column;min-height:0;border:1px solid var(--md-sys-color-outline-variant);border-radius:4px}
.pane>h2{position:absolute;top:-9px;left:12px;margin:0;padding:0 6px;background:var(--md-sys-color-surface);color:var(--md-sys-color-primary);font-size:12px;line-height:16px;font-weight:500}
.chips{display:flex;flex-wrap:wrap;gap:8px;padding:16px 12px 8px}
.chip{height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--md-sys-color-outline-variant);background:none;color:var(--md-sys-color-on-surface-variant);font:500 14px var(--md-ref-typeface-plain);cursor:pointer}
.chip.on{border-color:transparent;background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container)}
.scroll{overflow:auto;flex:1}table{width:100%;border-collapse:collapse;font-size:13px}
th{position:sticky;top:0;background:var(--md-sys-color-surface);text-align:left;font:500 11px var(--md-ref-typeface-plain);letter-spacing:.05em;text-transform:uppercase;color:var(--md-sys-color-on-surface-variant);padding:6px 8px;border-bottom:1px solid var(--md-sys-color-outline-variant)}
td{padding:6px 8px;white-space:nowrap}tr[data-name]{cursor:pointer}.m{color:var(--md-sys-color-on-surface-variant)}.p{color:var(--md-sys-color-primary)}
.c{width:16px;color:transparent}tr.on{background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container)}tr.on .c{color:var(--md-sys-color-primary)}tr.on .m{color:inherit}
.foot{display:flex;justify-content:space-between;padding:8px 12px;border-top:1px solid var(--md-sys-color-outline-variant);color:var(--md-sys-color-on-surface-variant);font:12px var(--md-ref-typeface-code)}
.detail{padding:20px 16px 16px;display:flex;flex-direction:column;gap:16px;overflow:auto;flex:1}
.detail h3{margin:0;font:400 24px/32px var(--md-ref-typeface-brand);display:flex;gap:8px;align-items:center}
.badge{font:500 11px var(--md-ref-typeface-plain);padding:2px 8px;border-radius:4px;background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container)}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.fields div{padding:10px 12px;border:1px solid var(--md-sys-color-outline-variant);border-radius:4px;background:var(--md-sys-color-surface-container-low)}
.fields small{display:block;font:500 11px var(--md-ref-typeface-plain);letter-spacing:.05em;color:var(--md-sys-color-on-surface-variant)}.fields code{overflow:hidden;text-overflow:ellipsis;display:block}
.cmd{padding:10px 12px;border:1px solid var(--md-sys-color-outline-variant);border-radius:4px;background:var(--md-sys-color-surface-container-lowest);color:var(--md-sys-color-primary);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cmd span,.cmd em{color:var(--md-sys-color-on-surface-variant);font-style:normal}
h4{margin:0;font:500 11px var(--md-ref-typeface-plain);letter-spacing:.05em;color:var(--md-sys-color-on-surface-variant)}
.cl{display:flex;gap:8px;padding:10px 12px;border-left:2px solid var(--md-sys-color-primary);background:var(--md-sys-color-surface-container-low);font-size:13px}.cl b{color:var(--md-sys-color-primary)}
.cl::after{content:"";width:8px;background:var(--md-sys-color-primary);animation:blink 1s steps(1) infinite}@keyframes blink{50%{opacity:0}}
.langs{list-style:none;margin:0;padding:20px 12px 12px;display:flex;flex-direction:column;gap:12px;overflow:auto;font:13px var(--md-ref-typeface-code)}
.langs li{display:grid;grid-template-columns:1fr auto;gap:6px}.langs i{grid-column:1/-1;height:4px;border-radius:2px;background:linear-gradient(90deg,var(--md-sys-color-primary) calc(var(--v)*100%),var(--md-sys-color-surface-container-highest) 0)}
.st{grid-area:st;display:flex;align-items:center;gap:16px;background:var(--md-sys-color-surface-container);font-size:12px}
.st .mode{align-self:stretch;display:grid;place-items:center;padding:0 12px;background:var(--md-sys-color-primary);color:var(--md-sys-color-on-primary);font-weight:500}
.st .hints{margin:0 auto;display:flex;gap:16px;color:var(--md-sys-color-on-surface-variant)}
kbd{padding:1px 6px;border:1px solid var(--md-sys-color-outline);border-radius:4px;background:var(--md-sys-color-surface-container-high);color:var(--md-sys-color-on-surface)}
.st>:last-child{padding-right:12px;color:var(--md-sys-color-on-surface-variant)}
@media (max-width:1199px){main{grid-template-columns:1fr 360px}main>.pane:last-child{display:none}}
@media (max-width:839px){body{grid-template:"bar" 64px "main" 1fr "st" 28px "rail" 80px/1fr}nav{flex-direction:row;justify-content:space-around;padding:6px 0 10px;border:0;background:var(--md-sys-color-surface-container)}nav>svg,.search,.btn,.st .hints,header code{display:none}main{grid-template-columns:1fr;padding:12px}main>.pane:nth-child(n+2){display:none}td:nth-child(2),td:nth-child(4),td:nth-child(6),th:nth-child(2),th:nth-child(4),th:nth-child(6){display:none}tr:not(.on) td:nth-child(3){color:inherit}}
</style></head><body>
<nav aria-label="Sections">${mark}${rail}</nav>
<header><h1>open</h1><code>aphrody-labs/open</code>
<label class="search">${await icon("search")}<input id="q" placeholder="Search ${lock.length} repositories" aria-label="Search"><kbd>/</kbd></label>
<a class="btn" href="https://github.com/aphrody-labs/open">GitHub</a></header>
<main>
<section class="pane"><h2>repos ${lock.length}</h2><div class="chips">${chips}</div>
<div class="scroll"><table><thead><tr><th></th><th>name</th><th>path</th><th>lang</th><th>rev</th><th>license</th></tr></thead><tbody id="rows">${rows}</tbody></table></div>
<div class="foot"><span id="count">${lock.length} of ${lock.length}</span><a class="m" href="/open.lock.json">open.lock.json</a></div></section>
<section class="pane"><h2 id="dt">${esc(selected.name)}</h2><div class="detail" id="detail"></div>
<div class="cl"><b>&gt;</b><span id="cl">${esc(selected.path)}</span></div></section>
<section class="pane"><h2>languages ${languages.length}</h2><ul class="langs">${langs}</ul></section>
</main>
<footer class="st"><span class="mode">CATALOG</span><span>${esc(branch)} @ ${esc(head)}</span><span class="hints">${hints}</span><span>${lock.length} repos  ${core.length} core</span></footer>
<script type="application/json" id="lock">${JSON.stringify(lock).replace(/</g, "\\u003c")}</script>
<script type="application/json" id="cmds">${JSON.stringify(cmds)}</script>
<script>
{const L=JSON.parse(document.getElementById("lock").textContent),C=JSON.parse(document.getElementById("cmds").textContent);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const rows=[...document.querySelectorAll("#rows tr")],q=document.getElementById("q");let g="all";
function show(name){const e=L.find(x=>x.name===name);if(!e)return;rows.forEach(r=>r.classList.toggle("on",r.dataset.name===name));
document.getElementById("dt").textContent=e.name;document.getElementById("cl").textContent=e.path;
document.getElementById("detail").innerHTML='<h3>'+esc(e.name)+(e.role?' <span class="badge">'+esc(e.role)+'</span>':'')+'</h3><code class="m">'+esc(e.url.replace("https://",""))+'</code>'
+'<div class="fields">'+[["PATH",e.path],["REVISION",e.rev.slice(0,12)],["LICENSE",e.license||"-"],["LANGUAGE",e.language||"-"]].map(([k,v])=>'<div><small>'+k+'</small><code>'+esc(v)+'</code></div>').join("")+'</div>'
+'<h4>PROVENANCE</h4><div class="kv m">archived '+!!e.archived+'  fork '+!!e.fork+'  dropped '+(e.dropped_files||[]).length+'  submodules '+(e.submodules||[]).length+'</div>'
+(C?'<h4>WORKSPACE</h4>'+C:'');}
function filter(){const t=q.value.toLowerCase();let n=0;rows.forEach(r=>{const v=(g==="all"||r.dataset.g===g)&&r.textContent.toLowerCase().includes(t);r.hidden=!v;n+=v});document.getElementById("count").textContent=n+" of "+L.length}
document.querySelectorAll(".chip,.dest").forEach(b=>b.addEventListener("click",ev=>{ev.preventDefault();g=b.dataset.g;
document.querySelectorAll(".chip,.dest").forEach(x=>x.classList.toggle("on",x.dataset.g===g));filter()}));
rows.forEach(r=>r.addEventListener("click",()=>show(r.dataset.name)));q.addEventListener("input",filter);
addEventListener("keydown",ev=>{if(ev.key==="/"&&document.activeElement!==q){ev.preventDefault();q.focus()}if(ev.key==="Escape"){q.value="";g="all";filter();q.blur()}
if(ev.key==="ArrowDown"||ev.key==="ArrowUp"){const vis=rows.filter(r=>!r.hidden),i=vis.findIndex(r=>r.classList.contains("on")),n=vis[Math.max(0,Math.min(vis.length-1,i+(ev.key==="ArrowDown"?1:-1)))];if(n){ev.preventDefault();show(n.dataset.name);n.scrollIntoView({block:"nearest"})}}});
show(${JSON.stringify(selected.name)});}
</script>
</body></html>
`;
await Bun.write(join(out, "index.html"), html);
await Bun.write(join(out, "open.lock.json"), Bun.file(join(src, "open.lock.json")));
console.log(`rendered ${lock.length} entries, ${groups.length} groups, ${languages.length} languages -> ${join(out, "index.html")}`);
