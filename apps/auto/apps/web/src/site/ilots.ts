// Showcase behaviours on the prerendered HTML, without React in the browser: ARIA tabs (click, arrows,
// Home/End) and hero film (replaces the capture if /media/lancement-btp.mp4 answers with a video).

function onglets(racine: ParentNode) {
  for (const liste of racine.querySelectorAll<HTMLElement>('[role="tablist"]')) {
    const tous = [...liste.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const choisir = (onglet: HTMLButtonElement, focus: boolean) => {
      for (const o of tous) {
        const actif = o === onglet;
        o.setAttribute("aria-selected", String(actif));
        o.tabIndex = actif ? 0 : -1;
        const panneau = document.getElementById(o.getAttribute("aria-controls") ?? "");
        if (panneau) panneau.hidden = !actif;
      }
      if (focus) onglet.focus();
    };
    liste.addEventListener("click", (e) => {
      const onglet = (e.target as Element).closest<HTMLButtonElement>('[role="tab"]');
      if (onglet) choisir(onglet, false);
    });
    liste.addEventListener("keydown", (e) => {
      const i = tous.indexOf(document.activeElement as HTMLButtonElement);
      if (i < 0) return;
      const cible = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tous.length - 1 }[e.key];
      if (cible === undefined) return;
      e.preventDefault();
      choisir(tous[(cible + tous.length) % tous.length]!, true);
    });
  }
}

function film(racine: ParentNode) {
  const capture = racine.querySelector<HTMLElement>(".btp-heros-capture");
  const modele = racine.querySelector<HTMLTemplateElement>("#modele-film");
  if (!capture || !modele) return;
  void fetch("/media/lancement-btp.mp4", { method: "HEAD", signal: AbortSignal.timeout(5000) })
    .then((reponse) => {
      if (!reponse.ok || !reponse.headers.get("content-type")?.startsWith("video/mp4")) return;
      // Prerendered: inert content of the <template>; React render in development: direct children.
      const source = modele.content.firstElementChild ?? modele.firstElementChild;
      if (!source) return;
      const figure = source.cloneNode(true) as HTMLElement;
      const video = figure.querySelector("video")!;
      const voile = figure.querySelector<HTMLElement>(".btp-heros-film-voile");
      const affiche = figure.querySelector<HTMLElement>(".btp-heros-film-affiche");
      // The source is set only at launch: before that, neither video nor poster is downloaded.
      const lancer = () => {
        voile?.remove();
        affiche?.remove();
        video.controls = true;
      };
      figure.querySelector(".btp-film-lancer")?.addEventListener("click", () => {
        lancer();
        if (!video.getAttribute("src")) video.src = "/media/lancement-btp.mp4";
        void video.play().catch(() => video.focus());
      });
      video.addEventListener("play", lancer);
      video.addEventListener("error", () => figure.replaceWith(capture), true);
      capture.replaceWith(figure);
    })
    .catch(() => {});
}

export function activerIlots(racine: ParentNode = document) {
  onglets(racine);
  film(racine);
}
