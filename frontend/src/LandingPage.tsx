// src/LandingPage.tsx
import { useNavigate, useLocation  } from "react-router-dom";
import ImageButton from "./components/ui/ImageMaskedButton";
import { useEffect, useState } from "react";
import LocalVideo from "./components/LocalVideo";
import { SiLinkedin, SiGithub } from "react-icons/si";

const APP_URL = "/identification"; // ou l’URL déployée si différente
const SUPPORTED_ROCKS = ["Granite", "Basalte", "Grès", "Calcaire", "Schiste"];

/* FEATURES — bandeaux horizontaux alternés */
type Feature = {
  title: string;
  desc: React.ReactNode;
  img: string;
  alt: string;
  reverse?: boolean;
};

const FEATURES_ROWS: Feature[] = [
  {
    title: "Prendre ou importer une photo",
    desc: (
      <>
        Ouvre l’appareil photo ou choisis une image depuis la galerie.
        L’aperçu est cadré automatiquement pour un résultat propre et immédiat.
      </>
    ),
    img: "/ui/import_photo.png",
    alt: "Écran d’accueil avec boutons Prendre/Importer",
  },
  {
    title: "Prédiction avec indice de confiance",
    desc: (
      <>
        Obtiens le nom de la roche (Top-1) avec son pourcentage et, si utile, des alternatives.
        Accède à une fiche claire : type, texture, minéraux, dureté, densité, contexte, astuces terrain.
      </>
    ),
    img: "/ui/results.png",
    alt: "Résultats de prédiction avec pourcentage de confiance",
    reverse: true
  },
  {
    title: "Géolocalisation (si disponible)",
    desc: (
      <>
        Récupère automatiquement les coordonnées depuis l’EXIF ou l’appareil.
        Sinon, saisis-les manuellement. Les champs sont validés et lisibles.
      </>
    ),
    img: "/ui/coords.png",
    alt: "Sélecteur de source GPS (EXIF, appareil, manuel)",
  },
  {
    title: "Export PDF propre",
    desc: (
      <>
        Génère un PDF net avec la photo, la roche Top-1, les coordonnées (EXIF/Appareil/Manuel)
        et tes notes — prêt pour le terrain.
      </>
    ),
    img: "/ui/Litho-SCAN_20251111-221635_Granite_page-0001.jpg",
    alt: "Aperçu de l’export PDF",
    reverse: true
  },
];

function FeatureRow({ title, desc, img, alt, reverse = false }: Feature) {
  const [isZoomed, setIsZoomed] = useState(false);

  const imgOrder  = reverse ? "md:order-2" : "md:order-1";
  const textOrder = reverse ? "md:order-1" : "md:order-2";

  return (
    <article className="relative rounded-2xl border border-white/10 bg-white/5 p-4 md:p-6">
      <div className="grid items-center gap-6 md:gap-10 md:grid-cols-2">
        <div className={`${textOrder} space-y-3`}>
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/90" style={{ textAlign: "justify" }}>
            {desc}
          </p>
        </div>

        <div className={`${imgOrder}`}>
          <button
            type="button"
            onClick={() => setIsZoomed(true)}
            className="w-full rounded-xl overflow-hidden border border-[#17BDCD] bg-black/30"
          >
            <img
              src={img}
              alt={alt}
              className="w-full h-full object-cover aspect-[4/3]"
            />
          </button>
        </div>
      </div>

      {/* Lightbox locale */}
      {isZoomed && (
        <div
          className="
            absolute inset-0 z-20
            flex items-center justify-center
            bg-black/80 
            px-2 md:px-4
          "
        >
          <div
            className="
              relative
              w-full md:w-[min(960px,100vw)]
              max-h-[90vh]
              border border-[#17BDCD]
              rounded-xl
              bg-black/90
              p-2
            "
          >
            {/* Fermeture par croix */}
            <button
              onClick={() => setIsZoomed(false)}
              className="
                absolute -top-3 -right-3
                w-8 h-8 flex items-center justify-center
                bg-black/80 text-white border border-white/30
                rounded-full shadow-lg
              "
            >
              ×
            </button>

            <img
              src={img}
              alt={alt}
              className="
                max-h-[86vh]
                w-full
                object-contain
                rounded-lg
              "
            />
          </div>
        </div>
      )}
    </article>
  );
}


export default function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.slice(1);
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  }, [location.hash]);

  return (
    // ↑ boost global landing uniquement
    <main className="text-white text-[15.5px] sm:text-[16.5px]">
      {/* INTRO / HERO */}
      <section className="relative isolate rounded-2xl overflow-hidden">
        {/* Cover */}
        <img
          src="/ui/bg.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
          fetchPriority="high"
          decoding="async"
        />
        {/* Overlay lisibilité */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60" />

        {/* Contenu */}
        <div className="relative max-w-6xl mx-auto px-4">
          {/* Flex colonne qui remplit la hauteur et pousse le CTA en bas */}
          <div className="min-h-[60svh] sm:min-h-[56svh] pt-[max(env(safe-area-inset-top),1.25rem)] pb-[max(env(safe-area-inset-bottom),1rem)]
                          flex flex-col items-center text-center gap-6 sm:gap-4">

            {/* 1) Logo géant */}
            <img
              src="/ui/logo.png"
              alt="Litho-SCAN"
              className="w-auto h-[clamp(7rem,28vw,18rem)] drop-shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
              draggable={false}
            />

            {/* 1) Trait sous le logo (inchangé ou très léger) */}
            <div
              aria-hidden
              className="mx-auto my-2 sm:my-3 h-[2px] w-20 sm:w-28 rounded-full
                        bg-gradient-to-r from-transparent via-[#17BDCD]/80 to-transparent"
            />

            {/* 2) Bloc titre + tagline */}
            <div className="max-w-2xl space-y-4 sm:space-y-6">
              <h1 className="text-3xl sm:text-5xl font-bold">Litho-SCAN</h1>

              {/* 2ᵉ trait : PLUS D’ESPACE au-dessus et en dessous */}
              <div
                aria-hidden
                className="mx-auto mt-6 sm:mt-7 mb-4 sm:mb-6 h-[2px] w-24 sm:w-32 rounded-full
                          bg-gradient-to-r from-transparent via-[#17BDCD]/80 to-transparent"
              />

              {/* Accroche */}
              <p className="text-lg sm:text-xl font-semibold">
                Transforme chaque roche en découverte.
              </p>

              {/* Sous-texte */}
              <p className="text-base sm:text-lg text-white/90">
                Sur le terrain ou au bureau, Litho-SCAN identifie la roche, résume l’essentiel
                et exporte un PDF complet avec détection automatique des coordonnées GPS.
              </p>
            </div>

            {/* 4) Avertissement V1 + CTA centré */}
            <div className="w-full max-w-[360px] space-y-4">
              {/* Encart roches prises en charge (A+ avec badges) */}
              <div className="rounded-xl bg-black/50 border border-[#17BDCD] shadow-[0_0_25px_rgba(23,189,205,0.25)] px-4 py-3 text-center">
                <p className="text-base sm:text-lg font-semibold text-[#17BDCD]">
                  ⚠️ Litho-SCAN — Version préliminaire
                </p>

                <p className="text-sm sm:text-[15px] text-white/90 mt-2 leading-snug">
                  L’IA reconnaît actuellement <span className="font-semibold">5 types de roches</span> :
                </p>

                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  {SUPPORTED_ROCKS.map((rock) => (
                    <span
                      key={rock}
                      className="inline-flex items-center rounded-full border border-[#17BDCD] px-4 py-1
                                text-xs sm:text-[15px] font-medium text-[#17BDCD]"
                    >
                      {rock}
                    </span>
                  ))}
                </div>
                
                <p className="text-[12px] sm:text-[13px] text-white/70 mt-1">
                  De nouvelles roches seront ajoutées dans les prochaines versions.
                </p>
              </div>
              <div
                aria-hidden
                className="mx-auto mt-6 sm:mt-7 mb-4 sm:mb-6 h-[2px] w-24 sm:w-32 rounded-full
                          bg-gradient-to-r from-transparent via-[#17BDCD]/80 to-transparent"
              />
              <ImageButton
                src="/ui/btn-full.png"
                label="Lancer l’application"
                fluid
                minWidth={220}
                maxWidth={360}
                aspect={3.2}
                hoverEffect={false}
                onClick={() => navigate(APP_URL)}
              />
              <div
                aria-hidden
                className="mx-auto my-2 sm:my-3 h-[2px] w-20 sm:w-28 rounded-full
                          bg-gradient-to-r from-transparent via-[#17BDCD]/80 to-transparent"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-10">
        {/* ↑ titres de section musclés */}
        <h2 className="text-3xl font-semibold tracking-tight mb-6">Fonctionnalités clés</h2>
        <div className="space-y-6">
          {FEATURES_ROWS.map((f, i) => (
            <FeatureRow key={i} {...f} />
          ))}
        </div>
      </section>

      {/* USE CASES */}
      <section id="use-cases" className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-3xl font-semibold tracking-tight mb-6">Cas d’usage</h2>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* 1. Sorties de terrain */}
          <article className="rounded-xl border border-[#17BDCD] bg-white/5 p-4 flex gap-3">
            <div className="text-2xl leading-none">🗻</div>
            <div className="space-y-1">
              <h3 className="font-semibold">Sorties de terrain</h3>
              <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/90">
                Identifier rapidement une roche sur site, sans réseau. Ajoute des notes et exporte un PDF
                avec coordonnées pour ton carnet de terrain.
              </p>
            </div>
          </article>

          {/* 2. Cours & TP */}
          <article className="rounded-xl border border-[#17BDCD] bg-white/5 p-4 flex gap-3">
            <div className="text-2xl leading-none">🎓</div>
            <div className="space-y-1">
              <h3 className="font-semibold">Cours &amp; TP</h3>
              <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/90">
                Support pédagogique simple : prise de photo, prédiction avec confiance, fiche synthétique.
                Parfait pour illustrer les concepts en classe.
              </p>
            </div>
          </article>

          {/* 3. Musées & collections */}
          <article className="rounded-xl border border-[#17BDCD] bg-white/5 p-4 flex gap-3">
            <div className="text-2xl leading-none">🏛️</div>
            <div className="space-y-1">
              <h3 className="font-semibold">Musées &amp; collections</h3>
              <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/90">
                Pré-tri de pièces et fiches rapides. L’export PDF facilite l’archivage et le partage
                avec l’équipe.
              </p>
            </div>
          </article>

          {/* 4. BTP / carrières */}
          <article className="rounded-xl border border-[#17BDCD] bg-white/5 p-4 flex gap-3">
            <div className="text-2xl leading-none">🏗️</div>
            <div className="space-y-1">
              <h3 className="font-semibold">BTP / carrières</h3>
              <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/90">
                Repérage express sur le terrain, notes et localisation pour un compte-rendu clair auprès
                des équipes techniques.
              </p>
            </div>
          </article>

          {/* 5. Clubs rando & naturalistes */}
          <article className="rounded-xl border border-[#17BDCD] bg-white/5 p-4 flex gap-3">
            <div className="text-2xl leading-none">🥾</div>
            <div className="space-y-1">
              <h3 className="font-semibold">Clubs rando &amp; naturalistes</h3>
              <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/90">
                Curiosité en balade : identifie, apprends, garde une trace et partage facilement au retour.
              </p>
            </div>
          </article>

          {/* 6. Notes de voyage */}
          <article className="rounded-xl border border-[#17BDCD] bg-white/5 p-4 flex gap-3">
            <div className="text-2xl leading-none">✈️</div>
            <div className="space-y-1">
              <h3 className="font-semibold">Notes de voyage</h3>
              <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/90">
                Crée des fiches PDF propres avec photo, position et commentaires pour documenter tes trouvailles.
              </p>
            </div>
          </article>
        </div>
      </section>

      {/* IA OVERVIEW / LIEN VERS PAGE IA */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-3xl font-semibold tracking-tight mb-6">
          L’IA derrière Litho-SCAN
        </h2>

        <article className="rounded-xl border border-[#17BDCD] bg-white/5 p-4 flex gap-3">
          <div className="space-y-2">
            <p
              className="text-[15px] sm:text-[17px] leading-relaxed text-white/90"
              style={{ textAlign: "justify" }}
            >
              Litho-SCAN s’appuie sur un modèle de classification d’images
              entraîné sur 5 types de roches. Sur la page&nbsp;
              <span className="font-medium">Modèle IA</span>,
              tu peux explorer l’architecture, le dataset, les courbes
              d’apprentissage, la matrice de confusion et la calibration des
              incertitudes.
            </p>
          </div>
        </article>
        <div className="py-4 text-center ">
          <ImageButton
            src="/ui/btn-full.png"
            label="Explorer la page ''Modèle IA''"
            fluid
            minWidth={220}
            maxWidth={360}
            aspect={3.2}
            hoverEffect={false}
            onClick={() => navigate("IA")}
          />
        </div>
      </section>

      {/* DEMO VIDEO */}
      <section id="demo" className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-3xl font-semibold mb-4">Vidéo démo</h2>
        <div className="text-[15.5px] sm:text-[16.5px] text-white/90 mb-3">
          Une courte démonstration de bout en bout du flux d’identification et d’export.
        </div>

        <LocalVideo
          mp4="/ui/video-demo-lithoSCAN.mp4"
          title="Litho-SCAN — Démo"
        />
      </section>

      {/* COMPATIBILITE (déjà en 3xl) */}
      <section id="compat" className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="text-3xl font-semibold tracking-tight mb-6">Compatibilité</h2>
        <ul className="grid gap-4 sm:grid-cols-2 text-[15px] sm:text-[17px] leading-relaxed text-white/90">
          <li className="rounded-xl border border-[#17BDCD] bg-white/5 p-4 flex items-start gap-3">
            <span className="text-2xl leading-none">💻</span>
            <span><b>Ordinateur</b> : Chrome, Firefox, Edge, Safari récents.</span>
          </li>
          <li className="rounded-xl border border-[#17BDCD] bg-white/5 p-4 flex items-start gap-3">
            <span className="text-2xl leading-none">📱</span>
            <span><b>Smartphone</b> : Android (Chrome/Firefox) et iOS (Safari). Caméra ⇒ HTTPS requis.</span>
          </li>
          <li className="rounded-xl border border-[#17BDCD] bg-white/5 p-4 flex items-start gap-3">
            <span className="text-2xl leading-none">🖼️</span>
            <span><b>Formats</b> : JPEG/PNG/WebP. (HEIC : exporter en JPEG/PNG si nécessaire.)</span>
          </li>
          <li className="rounded-xl border border-[#17BDCD] bg-white/5 p-4 flex items-start gap-3">
            <span className="text-2xl leading-none">🧩</span>
            <span><b>Astuce Android</b> : certains sélecteurs “Aperçu” posent souci ; préfère <i>Galerie</i>.</span>
          </li>
        </ul>
      </section>

      {/* ABOUT */}
      <section id="about" className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-3xl font-semibold tracking-tight mb-4">À propos</h2>

        {/* Conteneur principal */}
        <div className="rounded-xl border border-[#17BDCD] bg-white/5 p-5 sm:p-6">
          <div
            className="
              grid gap-8 
              md:grid-cols-[1fr,0.8fr]  /* ratio stable */
              items-center
            "
          >
            {/* Colonne texte */}
            <div className="min-w-0"> 
              <div className="px-4 py-3 space-y-4 text-white/90 text-[17px] leading-relaxed">
                <p className="text-center">
                  Ancienne géologue devenue développeuse, je voulais relier ce que j’adore — 
                  la géologie — et l’informatique, en particulier l’IA vers laquelle je me 
                  réoriente. En me remémorant des vacances avec ma sœur, je me suis revue 
                  m’arrêter à chaque balade pour lui montrer le moindre caillou ou la moindre 
                  structure géologique. Je me suis dit : plutôt qu’une « Julia de poche », 
                  pourquoi ne pas créer une application claire et rapide qui identifie la roche ?
                </p>
                <p className="text-center">
                  C’est ainsi qu’est né <span className="font-medium">Litho-SCAN</span>.
                </p>
              </div>
            </div>

            {/* Colonne profil */}
            <div className="flex flex-col items-center text-center gap-4 min-w-0">
              {/* Portrait */}
              <div className="relative w-32 h-32 sm:w-56 sm:h-56">
                <div
                  className="
                    absolute inset-0 rounded-full
                    ring-1 ring-[#17BDCD] ring-offset-1 ring-offset-transparent
                    shadow-[0_0_25px_rgba(23,189,205,0.9)]
                  "
                />
                <img
                  src="/ui/photo_Julia.jpg"
                  alt="Portrait de Julia Costa De Sousa"
                  className="w-full h-full rounded-full object-cover select-none"
                />
              </div>

              {/* Infos */}
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">Julia Costa De Sousa</h3>
                <p className="text-white/70 text-sm">Full-stack &amp; IA</p>
              </div>

              {/* Social bar */}
              <div className="flex items-center gap-3 mt-1">
                <a
                  href="https://www.linkedin.com/in/julia-costa-de-sousa"
                  target="_blank"
                  rel="noreferrer"
                  className="
                    group inline-flex items-center gap-1
                    rounded-full border border-[#17BDCD]/60
                    px-3 py-1 text-xs sm:text-sm text-white/90
                    transition hover:bg-[#17BDCD]/10
                    hover:shadow-[0_0_18px_rgba(23,189,205,0.8)]
                  "
                >
                  <SiLinkedin className="w-4 h-4 text-[#17BDCD] group-hover:text-[#A5F3FC]" />
                  <span>LinkedIn</span>
                </a>

                <a
                  href="https://github.com/JuliaCostaDeSousa"
                  target="_blank"
                  rel="noreferrer"
                  className="
                    group inline-flex items-center gap-1
                    rounded-full border border-[#17BDCD]/60
                    px-3 py-1 text-xs sm:text-sm text-white/90
                    transition hover:bg-[#17BDCD]/10
                    hover:shadow-[0_0_18px_rgba(23,189,205,0.8)]
                  "
                >
                  <SiGithub className="w-4 h-4 text-[#17BDCD] group-hover:text-[#A5F3FC]" />
                  <span>GitHub</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* CTA final */}
      <section className="mx-auto max-w-6xl px-4 py-4 text-center">
        {/* Trait*/}
        <div
            aria-hidden
            className="mx-auto mt-6 sm:mt-7 mb-4 sm:mb-6 h-[2px] w-24 sm:w-32 rounded-full
                    bg-gradient-to-r from-transparent via-[#17BDCD]/80 to-transparent"
        />
        <h3 className="text-2xl font-semibold mb-3">Prêt·e à essayer ?</h3>
        <p className="text-[15px] sm:text-[17px] leading-relaxed text-white/80 mb-4">
          Ouvre l’app, fais une photo, obtiens ta fiche et exporte ton PDF !
        </p>
        <ImageButton
          src="/ui/btn-full.png"
          label="Lancer l’application"
          fluid
          minWidth={220}
          maxWidth={360}
          aspect={3.2}
          hoverEffect={false}
          onClick={() => navigate(APP_URL)}
        />
        {/* Trait*/}
        <div
            aria-hidden
            className="mx-auto mt-6 sm:mt-7 mb-4 sm:mb-6 h-[2px] w-24 sm:w-32 rounded-full
                    bg-gradient-to-r from-transparent via-[#17BDCD]/80 to-transparent"
        />
      </section>
    </main>
  );
}
