// Public pages: the stored theme is applied before first render by each page's inline script;
// here, changes made in another tab (application or settings) are followed.
window.addEventListener("storage", (e: StorageEvent) => {
  if (e.key !== "auto-theme" && e.key !== null) return;
  const t = e.key === null ? null : e.newValue;
  const r = document.documentElement;
  r.classList.remove("dark", "light");
  if (t === "clair" || t === "sombre") {
    r.dataset.theme = t;
    r.classList.add(t === "sombre" ? "dark" : "light");
  } else delete r.dataset.theme;
});

// Development only: the HTML imports of `Bun.serve` are not localized by the server, so the `%%key%%` tokens left in
// the page are replaced on demand (dev-tokens.ts; production pages never load this chunk).
if (document.documentElement.outerHTML.includes("%%")) await import("./dev-tokens");
