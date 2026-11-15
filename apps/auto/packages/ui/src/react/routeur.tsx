// Minimal router on the History API: deep links, browser back, focus moved to the content.
import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

const abonnes = new Set<() => void>();
const notifier = () => {
  for (const f of abonnes) f();
};
if (typeof window !== "undefined") window.addEventListener("popstate", notifier);

let aFocaliser = false;

export function naviguer(vers: string, remplacer = false) {
  if (!window.dispatchEvent(new CustomEvent("auto:avant-navigation", { cancelable: true, detail: { vers } }))) return;
  if (vers === location.pathname + location.search) return;
  aFocaliser = true;
  if (remplacer) history.replaceState(null, "", vers);
  else history.pushState(null, "", vers);
  window.scrollTo({ top: 0 });
  notifier();
}

const souscrire = (f: () => void) => {
  abonnes.add(f);
  return () => abonnes.delete(f);
};

/** Current path (with the query), reactive. */
export function useChemin(): string {
  return useSyncExternalStore(
    souscrire,
    () => location.pathname + location.search,
    () => "/",
  );
}

/** Match of a pattern like `/app/documents/:id`; returns the parameters or `null`. */
export function correspond(motif: string, chemin: string): Record<string, string> | null {
  const p = motif.split("/");
  const c = chemin.split("?")[0]!.split("/");
  if (p.length !== c.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i]!.startsWith(":")) params[p[i]!.slice(1)] = decodeURIComponent(c[i]!);
    else if (p[i] !== c[i]) return null;
  }
  return params;
}

export function parametre(nom: string): string | null {
  return new URLSearchParams(location.search).get(nom);
}

export function Lien({ href, onClick, ...p }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const chemin = useChemin();
  const actif = chemin.split("?")[0] === href || (href !== "/app" && chemin.startsWith(`${href}/`));
  return (
    <a
      href={href}
      aria-current={p["aria-current"] ?? (actif ? "page" : undefined)}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (p.target === "_blank" || p.download !== undefined) return;
        e.preventDefault();
        naviguer(href);
      }}
      {...p}
    />
  );
}

/** After a page change: document title and focus on the main heading (screen readers). */
export function useTitrePage(titre: string) {
  useEffect(() => {
    document.title = `${titre} · auto`;
    const h1 = document.querySelector<HTMLElement>("main h1");
    if (h1 && aFocaliser) {
      aFocaliser = false;
      h1.tabIndex = -1;
      h1.focus({ preventScroll: true });
    }
  }, [titre]);
}
