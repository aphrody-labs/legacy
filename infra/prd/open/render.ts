// Minimal static render of the open monorepo: README.md + open.lock.json -> index.html (+ open.lock.json).
// Zero dependencies, Bun APIs only. Usage: bun render.ts <repo-dir> <out-dir>
const [src, out] = Bun.argv.slice(2);
if (!src || !out) {
  console.error("usage: bun render.ts <repo-dir> <out-dir>");
  process.exit(2);
}
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Entry = { name: string; url: string; path: string; language?: string; archived?: boolean; fork?: boolean; rev: string; license?: string };
const lock: Entry[] = await Bun.file(`${src}/open.lock.json`).json();
const readme = await Bun.file(`${src}/README.md`).text();

const rows = lock
  .map(
    (e) =>
      `<tr><td><a href="${esc(e.url)}">${esc(e.name)}</a></td><td>${esc(e.language ?? "")}</td><td><code>${esc(e.path)}</code></td><td>${esc(e.license ?? "")}</td><td><code>${esc(e.rev.slice(0, 9))}</code></td><td>${e.archived ? "archived" : ""}</td></tr>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aphrody open</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:72rem;margin:2rem auto;padding:0 1rem;color:#111;background:#fff}
pre{white-space:pre-wrap;background:#f5f5f5;padding:1rem;border-radius:6px}table{border-collapse:collapse;width:100%}
td,th{border-bottom:1px solid #ddd;padding:.25rem .5rem;text-align:left}@media(prefers-color-scheme:dark){body{color:#eee;background:#111}pre{background:#1c1c1c}td,th{border-color:#333}a{color:#8ab4f8}}</style>
</head><body>
<h1>Aphrody open</h1>
<p>${lock.length} repositories. Source: <a href="https://github.com/aphrody-labs/open">github.com/aphrody-labs/open</a>. Lock: <a href="/open.lock.json">open.lock.json</a>.</p>
<table><thead><tr><th>name</th><th>language</th><th>path</th><th>license</th><th>rev</th><th></th></tr></thead><tbody>
${rows}
</tbody></table>
<h2>README</h2>
<pre>${esc(readme)}</pre>
</body></html>
`;
await Bun.write(`${out}/index.html`, html);
await Bun.write(`${out}/open.lock.json`, Bun.file(`${src}/open.lock.json`));
console.log(`rendered ${lock.length} entries -> ${out}/index.html`);
