// Construction-trade showcase: real captures of an isolated demo company. Every string comes from the i18n catalogs.
import { createTranslator, type Translator } from "@auto/i18n";
import { Icone, Image } from "./medias";
import { IMAGES } from "./images.gen";

const INSCRIPTION = "/app/inscription";
// DOM ids and capture names are stable identifiers; the catalog keys use English names.
const DEMONSTRATIONS = [
  { id: "chantiers", key: "sites", capture: "analytique" },
  { id: "devis", key: "quotes", capture: "devis-editeur" },
  { id: "achats", key: "purchases", capture: "achats" },
  { id: "documents", key: "documents", capture: "recherche" },
] as const;
const OFFRES = [
  { id: "free", prix: 0, quotas: [10, 2, 1], note: { count: 20 } },
  { id: "pro", prix: 14, quotas: [200, 10, 2], note: { count: 500, days: 30 } },
  { id: "business", prix: 39, quotas: [null, 50, 10], note: { count: 5000 } },
] as const;
const QUESTIONS = [1, 2, 3, 4, 5] as const;

interface Props {
  t: Translator;
}

function Fleche() {
  return <Icone nom="arrow_forward" />;
}
function Marque({ t }: Props) {
  return (
    <a className="btp-marque" href="/" aria-label={t.t("home.brand.label")}>
      <Icone nom="receipt_long" />
      <span>auto</span>
    </a>
  );
}
function Entete({ t }: Props) {
  return (
    <header className="btp-entete">
      <nav className="btp-conteneur btp-navigation" aria-label={t.t("home.nav.label")}>
        <Marque t={t} />
        <div className="btp-liens-principaux">
          <a href="#produit">{t.t("home.nav.product")}</a>
          <a href="#installation">{t.t("home.nav.install")}</a>
          <a href="/telechargements">{t.t("home.nav.apps")}</a>
          <a href="/tarifs">{t.t("home.nav.pricing")}</a>
        </div>
        <div className="btp-compte">
          <a href="/app/connexion">{t.t("home.nav.signin")}</a>
          <a className="btp-bouton btp-bouton-menthe" href={INSCRIPTION}>
            {t.t("home.nav.try")}
          </a>
        </div>
      </nav>
    </header>
  );
}
function Heros({ t }: Props) {
  return (
    <section className="btp-heros" aria-labelledby="titre">
      <Image nom="btp-plan" className="btp-heros-fond" sizes="100vw" alt="" fetchPriority="high" />
      <div className="btp-conteneur btp-heros-grille">
        <div className="btp-heros-texte">
          <h1 id="titre">
            {t.t("home.hero.line1")}
            <br />
            {t.t("home.hero.line2")}
            <br />
            <span>{t.t("home.hero.line3")}</span>
          </h1>
          <p>{t.t("home.hero.lead")}</p>
          <div className="btp-actions">
            <a className="btp-bouton btp-bouton-menthe" href={INSCRIPTION}>
              {t.t("home.cta.create")}
            </a>
            <a className="btp-lien" href="#produit">
              {t.t("home.hero.discover")} <Fleche />
            </a>
          </div>
        </div>
        <FilmHero t={t} />
      </div>
      <div className="btp-conteneur btp-rail" aria-label={t.t("home.rail.label")}>
        <span>
          <Icone nom="description" />
          {t.t("home.rail.quotes")}
        </span>
        <span>
          <Icone nom="shopping_cart" />
          {t.t("home.rail.purchases")}
        </span>
        <span>
          <Icone nom="folder_open" />
          {t.t("home.rail.sites")}
        </span>
      </div>
    </section>
  );
}
/**
 * Hero capture; the film (inert template) replaces it if /media responds (ilots.ts). Static markup: the
 * page is prerendered at build time and animated without React in the browser.
 */
function FilmHero({ t }: Props) {
  return (
    <>
      <a className="btp-heros-capture" href="#produit" aria-label={t.t("home.film.capture.label")}>
        <Image nom="btp-analytique" sizes="(min-width: 1101px) 950px, 100vw" alt={t.t("home.film.capture.alt")} />
      </a>
      <template id="modele-film">
        <figure className="btp-heros-film" id="film-lancement">
          {/* Neither poster nor source before the click (ilots.ts): nothing is downloaded until the film is started. */}
          <video
            playsInline
            preload="none"
            width={IMAGES["btp-analytique"].largeur}
            height={IMAGES["btp-analytique"].hauteur}
            aria-label={t.t("home.film.video.label")}
          >
            {t.t("home.film.unsupported")}
          </video>
          <Image
            nom="btp-analytique"
            className="btp-heros-film-affiche"
            sizes="(min-width: 1101px) 950px, 100vw"
            alt=""
            loading="lazy"
          />
          <div className="btp-heros-film-voile">
            <div className="btp-heros-film-action">
              <p>
                {t.t("home.film.title")} <span>{t.t("home.film.duration")}</span>
              </p>
              <button className="btp-film-lancer" type="button" aria-label={t.t("home.film.play.label")}>
                <Icone nom="play_arrow" />
                {t.t("home.film.play")}
              </button>
            </div>
          </div>
          <figcaption className="btp-visuellement-cache">{t.t("home.film.caption")}</figcaption>
        </figure>
      </template>
    </>
  );
}

function Produit({ t }: Props) {
  return (
    <section className="btp-section btp-produit" id="produit" aria-labelledby="titre-produit">
      <div className="btp-conteneur">
        <h2 id="titre-produit">{t.t("home.product.title")}</h2>
        <p className="btp-introduction">{t.t("home.product.lead")}</p>
        {/* ARIA tabs (keyboard and selection: ilots.ts); all panels are in the prerendered HTML. */}
        <div>
          <div className="btp-onglets" role="tablist" aria-label={t.t("home.product.tabs")}>
            {DEMONSTRATIONS.map((demo, i) => (
              <button
                key={demo.id}
                type="button"
                role="tab"
                id={`onglet-${demo.id}`}
                aria-controls={`panneau-${demo.id}`}
                aria-selected={i === 0}
                tabIndex={i === 0 ? 0 : -1}
                className="btp-onglet"
              >
                {t.t(`home.demo.${demo.key}.name`)}
              </button>
            ))}
          </div>
          {DEMONSTRATIONS.map((demo, i) => (
            <div
              key={demo.id}
              role="tabpanel"
              id={`panneau-${demo.id}`}
              aria-labelledby={`onglet-${demo.id}`}
              tabIndex={0}
              hidden={i !== 0}
              className="btp-panneau"
            >
              <figure className="btp-demonstration">
                <a
                  href={`/img/btp-${demo.capture}.webp`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t.t("home.product.enlarge.label", { name: t.t(`home.demo.${demo.key}.name`) })}
                >
                  <Image
                    nom={`btp-${demo.capture}`}
                    sizes="(min-width: 1280px) 1180px, 100vw"
                    alt={t.t(`home.demo.${demo.key}.alt`)}
                    loading="lazy"
                  />
                </a>
                <figcaption>
                  {t.t("home.product.real")}{" "}
                  <a href={`/img/btp-${demo.capture}.webp`} target="_blank" rel="noreferrer">
                    {t.t("home.product.enlarge")}
                    <span className="btp-sr">{t.t("home.product.enlarge.sr")}</span> <Icone nom="open_in_new" />
                  </a>
                </figcaption>
              </figure>
              <div className="btp-points">
                {[1, 2, 3].map((n) => (
                  <div key={n}>
                    <h3>{t.t(`home.demo.${demo.key}.p${n}.title`)}</h3>
                    <p>{t.t(`home.demo.${demo.key}.p${n}.text`)}</p>
                  </div>
                ))}
              </div>
              <p className="btp-note">{t.t(`home.demo.${demo.key}.note`)}</p>
              <details className="btp-cas">
                <summary>
                  {t.t(`home.demo.${demo.key}.title`)}
                  <Icone nom="keyboard_arrow_down" />
                </summary>
                <p>{t.t(`home.demo.${demo.key}.text`)}</p>
              </details>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
function Installation({ t }: Props) {
  const contact = `mailto:contact@aphrody.com?subject=${encodeURIComponent(t.t("home.install.local.subject"))}`;
  return (
    <section className="btp-section btp-installation" id="installation" aria-labelledby="titre-installation">
      <div className="btp-conteneur">
        <div className="btp-installation-grille">
          <div>
            <h2 id="titre-installation">
              {t.t("home.install.title1")}
              <br />
              {t.t("home.install.title2")}
            </h2>
            <p className="btp-introduction">{t.t("home.install.lead")}</p>
            <ol className="btp-etapes">
              <li>
                <h3>{t.t("home.install.s1.title")}</h3>
                <p>{t.t("home.install.s1.text")}</p>
              </li>
              <li>
                <h3>{t.t("home.install.s2.title")}</h3>
                <p>{t.t("home.install.s2.text")}</p>
              </li>
              <li>
                <h3>{t.t("home.install.s3.title")}</h3>
                <p>{t.t("home.install.s3.text")}</p>
              </li>
            </ol>
            <a className="btp-bouton btp-bouton-vert" href={INSCRIPTION}>
              {t.t("home.install.create")} <Fleche />
            </a>
            <p className="btp-note">
              <a className="btp-lien" href="/telechargements">
                {t.t("home.install.apps")} <Fleche />
              </a>
            </p>
          </div>
          <figure className="btp-appareils">
            <div className="btp-ordinateur">
              <Image
                nom="btp-tableau"
                sizes="(min-width: 1024px) 50vw, 90vw"
                alt={t.t("home.install.figure.desktop")}
                loading="lazy"
              />
            </div>
            <div className="btp-telephone">
              <Image
                nom="btp-mobile"
                sizes="(min-width: 1024px) 160px, 30vw"
                alt={t.t("home.install.figure.mobile")}
                loading="lazy"
              />
            </div>
            <figcaption>{t.t("home.install.figure.caption")}</figcaption>
          </figure>
        </div>
        <div className="btp-installation-locale">
          <Icone nom="dns" />
          <div>
            <h3>{t.t("home.install.local.title")}</h3>
            <p>{t.t("home.install.local.text")}</p>
          </div>
          <a className="btp-lien" href={contact}>
            {t.t("home.install.local.cta")} <Fleche />
          </a>
        </div>
      </div>
    </section>
  );
}
function Prix({ t }: Props) {
  return (
    <section className="btp-section btp-prix" id="offres" aria-labelledby="titre-prix">
      <div className="btp-conteneur">
        <h2 id="titre-prix">
          {t.t("home.pricing.title1")}
          <br />
          {t.t("home.pricing.title2")}
        </h2>
        <div className="btp-offres">
          {OFFRES.map((offre) => (
            <article className={`btp-offre${offre.id === "pro" ? " btp-offre-pro" : ""}`} key={offre.id}>
              <h3>{t.t(`home.plan.${offre.id}.name`)}</h3>
              <p className="btp-pour">{t.t(`home.plan.${offre.id}.for`)}</p>
              <p className="btp-montant">
                {t.currency(offre.prix, "EUR", { maximumFractionDigits: 0 })}
                <span>{t.t("home.pricing.per_month")}</span>
              </p>
              <ul>
                {offre.quotas.map((count, i) => (
                  <li key={i}>
                    <Icone nom="check" />
                    {t.t(`home.plan.${offre.id}.p${i + 1}`, { count: count ?? 0 })}
                  </li>
                ))}
              </ul>
              <p className="btp-note btp-note-offre">{t.t(`home.plan.${offre.id}.note`, offre.note)}</p>
              <a className="btp-bouton btp-bouton-vert" href={INSCRIPTION}>
                {t.t("home.cta.create")}
              </a>
            </article>
          ))}
        </div>
        <div className="btp-comparer">
          <a className="btp-lien" href="/tarifs">
            {t.t("home.pricing.compare")} <Fleche />
          </a>
          <p className="btp-note">{t.t("home.pricing.test_mode")}</p>
        </div>
      </div>
    </section>
  );
}
function Questions({ t }: Props) {
  return (
    <section className="btp-section btp-questions" id="questions" aria-labelledby="titre-questions">
      <div className="btp-conteneur">
        <h2 id="titre-questions">{t.t("home.faq.title")}</h2>
        <div className="btp-faq">
          {QUESTIONS.map((n, index) => (
            <details key={n} open={index === 0}>
              <summary>
                {t.t(`home.faq.q${n}`)}
                <Icone nom="add" />
              </summary>
              <p>{t.t(`home.faq.a${n}`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
function Pied({ t }: Props) {
  return (
    <>
      <section className="btp-appel" aria-labelledby="titre-appel">
        <div className="btp-conteneur">
          <h2 id="titre-appel">
            {t.t("home.footer.title1")}
            <br />
            {t.t("home.footer.title2")}
          </h2>
          <a className="btp-bouton btp-bouton-menthe" href={INSCRIPTION}>
            {t.t("home.cta.create")} <Fleche />
          </a>
        </div>
      </section>
      <footer className="btp-pied">
        <div className="btp-conteneur">
          <Marque t={t} />
          <nav aria-label={t.t("home.footer.links")}>
            <a href="/tarifs">{t.t("home.nav.pricing")}</a>
            <a href="/telechargements">{t.t("home.nav.apps")}</a>
            <a href="mailto:contact@aphrody.com">{t.t("home.footer.contact")}</a>
            <a href="/mentions-legales">{t.t("home.footer.legal")}</a>
            <a href="/confidentialite">{t.t("home.footer.privacy")}</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
/** Landing page in the given locale (BCP 47 tag or Accept-Language value; negotiated against the shipped catalogs). */
export function Accueil({ locale }: { locale?: string | null }) {
  const t = createTranslator(locale);
  return (
    <>
      <a className="btp-evitement" href="#contenu">
        {t.t("home.skip")}
      </a>
      <Entete t={t} />
      <main id="contenu">
        <Heros t={t} />
        <Produit t={t} />
        <Installation t={t} />
        <Prix t={t} />
        <Questions t={t} />
      </main>
      <Pied t={t} />
    </>
  );
}
