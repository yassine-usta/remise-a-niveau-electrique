/* ==========================================================================
   app.js
   Coquille du site : thème, défilement fluide, navigation, recherche,
   routage par hash et chargement des cours.

   Tous les chemins sont relatifs : le site est publié dans un sous-dossier.
   Le site reste utilisable si une bibliothèque externe manque à l'appel.
   ========================================================================== */

import { creerMoteur } from "./moteur.js";

const BASE = new URL(".", document.baseURI);
const TOTAL_JOURS = 90;
const SLUG_DEMO = "_demo";

const mouvementReduit =
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const etat = {
  sommaire: [],
  modules: [],
  progression: null,
  lus: new Set(),
  coursCourant: null,
  moduleCours: null,
  apiCours: null,
  lenis: null,
  observateurPlan: null,
  detacherScroll: null,
  chargementEnCours: null,
};

const dom = {
  coque: document.querySelector(".coque"),
  boutonMenu: document.getElementById("bouton-menu"),
  boutonTheme: document.getElementById("bouton-theme"),
  boutonRecherche: document.getElementById("bouton-recherche"),
  navigation: document.getElementById("navigation"),
  navigationListe: document.getElementById("navigation-liste"),
  navigationCompteur: document.getElementById("navigation-compteur"),
  voile: document.getElementById("voile-navigation"),
  principal: document.getElementById("principal"),
  vueAccueil: document.getElementById("vue-accueil"),
  vueCours: document.getElementById("vue-cours"),
  jauge: document.getElementById("jauge-lecture-barre"),
  palette: document.getElementById("palette"),
  paletteVoile: document.getElementById("palette-voile"),
  paletteChamp: document.getElementById("palette-champ"),
  paletteResultats: document.getElementById("palette-resultats"),
  annonce: document.getElementById("annonce"),
  grilleModules: document.getElementById("grille-modules"),
  dernierCours: document.getElementById("dernier-cours"),
  anneauArc: document.getElementById("anneau-arc"),
  anneauNombre: document.getElementById("anneau-nombre"),
  progressionPhrase: document.getElementById("progression-phrase"),
  statPublies: document.getElementById("stat-publies"),
  statModules: document.getElementById("stat-modules"),
  statLus: document.getElementById("stat-lus"),
  statDuree: document.getElementById("stat-duree"),
  boutonReprendre: document.getElementById("bouton-reprendre"),
};

/* --------------------------------------------------------------------------
   Stockage local, toujours protégé
   -------------------------------------------------------------------------- */

function lireLocal(cle, defaut) {
  try {
    const brut = localStorage.getItem("rne:" + cle);
    return brut == null ? defaut : JSON.parse(brut);
  } catch (erreur) {
    return defaut;
  }
}

function ecrireLocal(cle, valeur) {
  try {
    localStorage.setItem("rne:" + cle, JSON.stringify(valeur));
  } catch (erreur) {
    /* navigation privée ou stockage refusé : le site fonctionne sans mémoire */
  }
}

function annoncer(message) {
  if (dom.annonce) dom.annonce.textContent = message;
}

/* --------------------------------------------------------------------------
   Thème clair, sombre ou automatique
   -------------------------------------------------------------------------- */

const themes = ["auto", "light", "dark"];
const libellesThemes = { auto: "automatique", light: "clair", dark: "sombre" };

function themeEffectif() {
  const choisi = document.documentElement.dataset.theme || "auto";
  if (choisi !== "auto") return choisi;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function appliquerTheme(theme) {
  document.documentElement.dataset.theme = theme;
  ecrireLocal("theme", theme);
  if (dom.boutonTheme) {
    dom.boutonTheme.setAttribute("aria-label", "Thème " + libellesThemes[theme] + ", cliquer pour changer");
    dom.boutonTheme.title = "Thème " + libellesThemes[theme];
  }
  document.dispatchEvent(new CustomEvent("rne:theme", { detail: { theme: themeEffectif() } }));
  redessinerMermaid();
}

function initialiserTheme() {
  const memorise = lireLocal("theme", "auto");
  appliquerTheme(themes.includes(memorise) ? memorise : "auto");
  if (dom.boutonTheme) {
    dom.boutonTheme.addEventListener("click", () => {
      const courant = document.documentElement.dataset.theme || "auto";
      appliquerTheme(themes[(themes.indexOf(courant) + 1) % themes.length]);
    });
  }
  if (typeof matchMedia === "function") {
    const requete = matchMedia("(prefers-color-scheme: dark)");
    if (typeof requete.addEventListener === "function") {
      requete.addEventListener("change", () => {
        if ((document.documentElement.dataset.theme || "auto") === "auto") {
          document.dispatchEvent(new CustomEvent("rne:theme", { detail: { theme: themeEffectif() } }));
          redessinerMermaid();
        }
      });
    }
  }
}

/* --------------------------------------------------------------------------
   Défilement fluide et synchronisation avec ScrollTrigger
   -------------------------------------------------------------------------- */

function initialiserDefilement() {
  const gsap = globalThis.gsap;
  const ScrollTrigger = globalThis.ScrollTrigger;
  if (gsap && ScrollTrigger && typeof gsap.registerPlugin === "function") {
    gsap.registerPlugin(ScrollTrigger);
  }
  if (mouvementReduit) {
    document.documentElement.classList.add("sans-mouvement");
    return;
  }
  const Lenis = globalThis.Lenis;
  if (!Lenis) return;
  try {
    const lenis = new Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.4,
    });
    etat.lenis = lenis;
    if (ScrollTrigger) lenis.on("scroll", ScrollTrigger.update);
    if (gsap) {
      gsap.ticker.add((temps) => lenis.raf(temps * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const boucle = (temps) => {
        lenis.raf(temps);
        requestAnimationFrame(boucle);
      };
      requestAnimationFrame(boucle);
    }
  } catch (erreur) {
    etat.lenis = null;
  }
}

function defilerVers(cible, decalage) {
  const marge = decalage != null ? decalage : -(hauteurBarre() + 18);
  if (etat.lenis && typeof etat.lenis.scrollTo === "function") {
    etat.lenis.scrollTo(cible, { offset: marge });
    return;
  }
  const element = typeof cible === "string" ? document.querySelector(cible) : cible;
  if (element instanceof Element) {
    const haut = element.getBoundingClientRect().top + window.scrollY + marge;
    window.scrollTo({ top: haut, behavior: mouvementReduit ? "auto" : "smooth" });
  } else if (typeof cible === "number") {
    window.scrollTo({ top: cible, behavior: mouvementReduit ? "auto" : "smooth" });
  }
}

function hauteurBarre() {
  const valeur = getComputedStyle(document.documentElement).getPropertyValue("--hauteur-barre");
  const nombre = parseFloat(valeur);
  return Number.isFinite(nombre) ? nombre : 64;
}

function remonter() {
  if (etat.lenis && typeof etat.lenis.scrollTo === "function") etat.lenis.scrollTo(0, { immediate: true });
  else window.scrollTo({ top: 0, behavior: "auto" });
}

/* --------------------------------------------------------------------------
   KaTeX et Mermaid
   -------------------------------------------------------------------------- */

function rendreMaths(element) {
  const rendu = globalThis.renderMathInElement;
  if (typeof rendu !== "function" || !element) return;
  try {
    rendu(element, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true },
      ],
      throwOnError: false,
      errorColor: "#bc2338",
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"],
      ignoredClasses: ["mermaid", "ascii", "schema-ascii"],
    });
  } catch (erreur) {
    /* une formule non rendue ne doit pas interrompre l'affichage du cours */
  }
}

let mermaidPret = false;

function preparerMermaid() {
  const mermaid = globalThis.mermaid;
  if (!mermaid || mermaidPret) return;
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: themeEffectif() === "dark" ? "dark" : "default",
      fontFamily: "Inter, system-ui, sans-serif",
      themeVariables: { fontSize: "15px" },
      flowchart: { curve: "basis", useMaxWidth: true },
    });
    mermaidPret = true;
  } catch (erreur) {
    mermaidPret = false;
  }
}

async function rendreMermaid(element) {
  const mermaid = globalThis.mermaid;
  if (!mermaid || !element) return;
  const noeuds = Array.from(element.querySelectorAll("pre.mermaid"));
  if (!noeuds.length) return;
  preparerMermaid();
  for (const noeud of noeuds) {
    if (!noeud.dataset.source) noeud.dataset.source = noeud.textContent || "";
  }
  try {
    if (typeof mermaid.run === "function") await mermaid.run({ nodes: noeuds, suppressErrors: true });
    else if (typeof mermaid.init === "function") mermaid.init(undefined, noeuds);
  } catch (erreur) {
    for (const noeud of noeuds) {
      noeud.textContent = noeud.dataset.source || noeud.textContent;
      noeud.classList.add("ascii");
    }
  }
}

function redessinerMermaid() {
  const mermaid = globalThis.mermaid;
  if (!mermaid) return;
  const noeuds = Array.from(document.querySelectorAll("pre.mermaid[data-source]"));
  if (!noeuds.length) return;
  mermaidPret = false;
  for (const noeud of noeuds) {
    noeud.removeAttribute("data-processed");
    noeud.textContent = noeud.dataset.source;
  }
  preparerMermaid();
  try {
    if (typeof mermaid.run === "function") mermaid.run({ nodes: noeuds, suppressErrors: true });
  } catch (erreur) {
    /* le diagramme reste affiché sous forme de texte */
  }
}

/* --------------------------------------------------------------------------
   Chargement des données du parcours
   -------------------------------------------------------------------------- */

async function lireJson(chemin, secours) {
  try {
    const reponse = await fetch(new URL(chemin, BASE).href, { cache: "no-cache" });
    if (!reponse.ok) throw new Error("statut " + reponse.status);
    return await reponse.json();
  } catch (erreur) {
    return secours;
  }
}

async function chargerDonnees() {
  const [sommaire, modules, progression] = await Promise.all([
    lireJson("data/sommaire.json", []),
    lireJson("data/modules.json", []),
    lireJson("data/progression.json", null),
  ]);

  etat.modules = Array.isArray(modules) ? modules : [];
  etat.progression = progression;
  etat.sommaire = (Array.isArray(sommaire) ? sommaire : [])
    .filter((entree) => entree && entree.slug && entree.slug !== SLUG_DEMO)
    .map((entree, index) => ({
      slug: String(entree.slug),
      titre: entree.titre || entree.slug,
      module: entree.module || null,
      ordre: Number.isFinite(entree.ordre) ? Number(entree.ordre) : index + 1,
      date: entree.date || "",
      resume: entree.resume || "",
      duree_min: Number.isFinite(entree.duree_min) ? Number(entree.duree_min) : null,
    }))
    .sort((a, b) => a.ordre - b.ordre);

  const lus = lireLocal("lus", []);
  etat.lus = new Set(Array.isArray(lus) ? lus : []);
}

function moduleDe(entree) {
  if (!entree) return null;
  if (entree.module) {
    const trouve = etat.modules.find((module) => module.id === entree.module || module.titre === entree.module);
    if (trouve) return trouve;
  }
  return etat.modules.find((module) => entree.ordre >= module.jour_debut && entree.ordre <= module.jour_fin) || null;
}

function coursDuModule(module) {
  return etat.sommaire.filter((entree) => moduleDe(entree) === module);
}

function indexDe(slug) {
  return etat.sommaire.findIndex((entree) => entree.slug === slug);
}

/* --------------------------------------------------------------------------
   Page d'accueil
   -------------------------------------------------------------------------- */

function construireAccueil() {
  const publies = etat.sommaire.length;
  const ratio = Math.min(1, publies / TOTAL_JOURS);

  if (dom.anneauNombre) dom.anneauNombre.textContent = String(publies);
  if (dom.anneauArc) {
    const circonference = 2 * Math.PI * 52;
    dom.anneauArc.style.strokeDasharray = String(circonference);
    dom.anneauArc.style.strokeDashoffset = String(circonference * (1 - ratio));
  }
  const anneau = document.getElementById("anneau-progression");
  if (anneau) anneau.setAttribute("aria-label", publies + " cours publiés sur " + TOTAL_JOURS);

  const modulesOuverts = etat.modules.filter((module) => coursDuModule(module).length > 0).length;
  const lus = etat.sommaire.filter((entree) => etat.lus.has(entree.slug));
  const minutes = lus.reduce((somme, entree) => somme + (entree.duree_min || 0), 0);

  if (dom.statPublies) dom.statPublies.textContent = publies + " sur " + TOTAL_JOURS;
  if (dom.statModules) dom.statModules.textContent = modulesOuverts + " sur " + etat.modules.length;
  if (dom.statLus) dom.statLus.textContent = String(lus.length);
  if (dom.statDuree) {
    dom.statDuree.textContent =
      minutes >= 60 ? Math.floor(minutes / 60) + " h " + (minutes % 60 ? (minutes % 60) + " min" : "") : minutes + " min";
  }
  if (dom.progressionPhrase) {
    dom.progressionPhrase.textContent = publies
      ? publies === TOTAL_JOURS
        ? "Le parcours est complet : les 90 séances sont publiées."
        : "Le parcours avance : " + publies + " séance(s) disponible(s), la suivante arrive ce soir."
      : "Le premier cours arrive ce soir.";
  }
  if (dom.navigationCompteur) {
    dom.navigationCompteur.textContent = publies
      ? publies + " cours publié" + (publies > 1 ? "s" : "")
      : "Aucun cours publié";
  }

  construireDernierCours();
  construireCartesModules();
  construireNavigation();

  if (dom.boutonReprendre) {
    const dernier = etat.sommaire[etat.sommaire.length - 1];
    const aReprendre = etat.sommaire.find((entree) => !etat.lus.has(entree.slug)) || dernier;
    if (aReprendre) {
      dom.boutonReprendre.setAttribute("href", "#/cours/" + aReprendre.slug);
      dom.boutonReprendre.textContent = etat.lus.size ? "Reprendre : " + aReprendre.titre : "Commencer : " + aReprendre.titre;
      dom.boutonReprendre.appendChild(fleche());
    }
  }
}

function fleche() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const trace = document.createElementNS("http://www.w3.org/2000/svg", "path");
  trace.setAttribute("d", "M5 12h13M13 6l6 6-6 6");
  svg.appendChild(trace);
  return svg;
}

function construireDernierCours() {
  if (!dom.dernierCours) return;
  const dernier = etat.sommaire[etat.sommaire.length - 1];
  if (!dernier) return;

  const module = moduleDe(dernier);
  const carte = document.createElement("article");
  carte.className = "carte-mise-en-avant";

  const meta = document.createElement("div");
  meta.className = "meta";
  if (module) {
    const pastilleModule = document.createElement("span");
    pastilleModule.className = "pastille pastille-accent";
    pastilleModule.textContent = module.titre;
    meta.appendChild(pastilleModule);
  }
  if (dernier.date) {
    const pastilleDate = document.createElement("span");
    pastilleDate.className = "pastille";
    pastilleDate.textContent = "publié le " + dernier.date;
    meta.appendChild(pastilleDate);
  }
  if (dernier.duree_min) {
    const pastilleDuree = document.createElement("span");
    pastilleDuree.className = "pastille";
    pastilleDuree.textContent = dernier.duree_min + " min";
    meta.appendChild(pastilleDuree);
  }
  if (etat.lus.has(dernier.slug)) {
    const pastilleLu = document.createElement("span");
    pastilleLu.className = "pastille pastille-succes";
    pastilleLu.textContent = "déjà lu";
    meta.appendChild(pastilleLu);
  }

  const titre = document.createElement("h3");
  titre.textContent = dernier.titre;

  const resume = document.createElement("p");
  resume.textContent = dernier.resume || "Ouvrez la séance pour en découvrir le contenu.";

  const lien = document.createElement("a");
  lien.className = "bouton-primaire";
  lien.href = "#/cours/" + dernier.slug;
  lien.textContent = "Ouvrir le cours";
  lien.appendChild(fleche());

  carte.append(meta, titre, resume, lien);
  dom.dernierCours.textContent = "";
  dom.dernierCours.appendChild(carte);
}

/** Supprime les ScrollTriggers attachés à des éléments sur le point d'être remplacés. */
function nettoyerDeclencheurs(conteneur) {
  const ScrollTrigger = globalThis.ScrollTrigger;
  if (!ScrollTrigger || typeof ScrollTrigger.getAll !== "function" || !conteneur) return;
  for (const declencheur of ScrollTrigger.getAll()) {
    if (declencheur.trigger && conteneur.contains(declencheur.trigger)) declencheur.kill();
  }
}

function construireCartesModules() {
  if (!dom.grilleModules) return;
  nettoyerDeclencheurs(dom.grilleModules);
  dom.grilleModules.textContent = "";

  etat.modules.forEach((module, index) => {
    const cours = coursDuModule(module);
    const attendus = Math.max(1, module.jour_fin - module.jour_debut + 1);
    const avancement = Math.min(1, cours.length / attendus);

    const carte = document.createElement("article");
    carte.className = "carte-module";
    carte.style.setProperty("--avancement", String(avancement));

    const rang = document.createElement("span");
    rang.className = "carte-module-rang";
    rang.textContent = "Module " + String(index + 1).padStart(2, "0");

    const titre = document.createElement("h3");
    titre.textContent = module.titre;

    const infoEtat = document.createElement("p");
    infoEtat.className = "carte-module-etat";
    infoEtat.textContent = cours.length
      ? cours.length + " cours sur " + attendus + " publié" + (cours.length > 1 ? "s" : "")
      : "à venir, " + attendus + " séances prévues";

    carte.append(rang, titre, infoEtat);

    if (cours.length) {
      const liste = document.createElement("ul");
      liste.className = "carte-module-liste";
      for (const entree of cours.slice(0, 4)) {
        const ligne = document.createElement("li");
        const lien = document.createElement("a");
        lien.href = "#/cours/" + entree.slug;
        lien.textContent = entree.titre;
        ligne.appendChild(lien);
        liste.appendChild(ligne);
      }
      if (cours.length > 4) {
        const surplus = document.createElement("li");
        surplus.className = "surplus";
        surplus.textContent = "et " + (cours.length - 4) + " autre(s) séance(s)";
        liste.appendChild(surplus);
      }
      carte.appendChild(liste);
    }

    dom.grilleModules.appendChild(carte);
  });
}

/* --------------------------------------------------------------------------
   Navigation latérale
   -------------------------------------------------------------------------- */

function construireNavigation() {
  if (!dom.navigationListe) return;
  dom.navigationListe.textContent = "";

  if (!etat.sommaire.length) {
    const vide = document.createElement("p");
    vide.className = "navigation-vide";
    vide.textContent = "Le premier cours arrive ce soir. Le sommaire se remplira au fil des séances.";
    dom.navigationListe.appendChild(vide);
    return;
  }

  for (const module of etat.modules) {
    const cours = coursDuModule(module);
    const bloc = document.createElement("details");
    bloc.className = "navigation-module";
    bloc.dataset.module = module.id;
    bloc.dataset.vide = cours.length ? "non" : "oui";
    if (cours.length) bloc.open = true;

    const resume = document.createElement("summary");
    const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chevron.setAttribute("viewBox", "0 0 24 24");
    chevron.setAttribute("class", "chevron");
    chevron.setAttribute("aria-hidden", "true");
    const trace = document.createElementNS("http://www.w3.org/2000/svg", "path");
    trace.setAttribute("d", "M9 6l6 6-6 6");
    chevron.appendChild(trace);
    const nom = document.createElement("span");
    nom.textContent = module.titre;
    const compte = document.createElement("span");
    compte.className = "compte";
    compte.textContent = String(cours.length);
    resume.append(chevron, nom, compte);
    bloc.appendChild(resume);

    if (cours.length) {
      const liste = document.createElement("ul");
      liste.className = "navigation-cours";
      for (const entree of cours) {
        const ligne = document.createElement("li");
        const lien = document.createElement("a");
        lien.href = "#/cours/" + entree.slug;
        lien.dataset.slug = entree.slug;
        lien.textContent = entree.titre;
        if (etat.lus.has(entree.slug)) {
          const puce = document.createElement("span");
          puce.className = "puce-lu";
          puce.textContent = "lu";
          puce.setAttribute("aria-label", "cours lu");
          lien.appendChild(puce);
        }
        ligne.appendChild(lien);
        liste.appendChild(ligne);
      }
      bloc.appendChild(liste);
    } else {
      const attente = document.createElement("p");
      attente.className = "navigation-module-vide";
      attente.textContent = "séances à venir";
      bloc.appendChild(attente);
    }

    dom.navigationListe.appendChild(bloc);
  }
  marquerNavigation(etat.coursCourant);
}

function marquerNavigation(slug) {
  const liens = dom.navigationListe ? dom.navigationListe.querySelectorAll("a[data-slug]") : [];
  for (const lien of liens) {
    if (slug && lien.dataset.slug === slug) {
      lien.setAttribute("aria-current", "page");
      const bloc = lien.closest("details");
      if (bloc) bloc.open = true;
    } else {
      lien.removeAttribute("aria-current");
    }
  }
}

function navigationOuverte(ouvrir) {
  if (!dom.coque) return;
  const petitEcran = window.innerWidth <= 1024;
  if (petitEcran) {
    dom.coque.dataset.nav = ouvrir ? "ouvert" : "";
    if (dom.voile) dom.voile.hidden = !ouvrir;
  } else {
    dom.coque.dataset.nav = ouvrir ? "" : "ferme";
    if (dom.voile) dom.voile.hidden = true;
  }
  if (dom.boutonMenu) dom.boutonMenu.setAttribute("aria-expanded", ouvrir ? "true" : "false");
  ecrireLocal("navigation", ouvrir);
}

function initialiserNavigation() {
  const petitEcran = window.innerWidth <= 1024;
  const memorise = lireLocal("navigation", true);
  navigationOuverte(petitEcran ? false : memorise !== false);

  if (dom.boutonMenu) {
    dom.boutonMenu.addEventListener("click", () => {
      const ouvert = dom.boutonMenu.getAttribute("aria-expanded") === "true";
      navigationOuverte(!ouvert);
    });
  }
  if (dom.voile) {
    dom.voile.addEventListener("click", () => navigationOuverte(false));
  }
  if (dom.navigationListe) {
    dom.navigationListe.addEventListener("click", (evenement) => {
      if (evenement.target.closest("a") && window.innerWidth <= 1024) navigationOuverte(false);
    });
  }
  window.addEventListener("resize", () => {
    const etroit = window.innerWidth <= 1024;
    if (etroit && dom.coque.dataset.nav !== "ouvert") {
      dom.coque.dataset.nav = "";
      if (dom.voile) dom.voile.hidden = true;
    }
  });
}

/* --------------------------------------------------------------------------
   Palette de recherche
   -------------------------------------------------------------------------- */

const ENTREE_DEMO = {
  slug: SLUG_DEMO,
  titre: "Démonstration du moteur pédagogique",
  resume:
    "Tous les composants interactifs du parcours en fonctionnement sur un circuit RC : exercices corrigés, quiz, cartes, simulations.",
  module: null,
  ordre: 0,
  duree_min: 15,
  date: "",
  demo: true,
};

let paletteIndex = 0;
let paletteEntrees = [];
let paletteDeclencheur = null;

function sansAccents(texte) {
  return String(texte || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function surligner(texte, requete) {
  const fragment = document.createDocumentFragment();
  if (!requete) {
    fragment.appendChild(document.createTextNode(texte));
    return fragment;
  }
  const source = sansAccents(texte);
  const cible = sansAccents(requete);
  let position = 0;
  let index = source.indexOf(cible);
  while (index >= 0 && cible.length) {
    fragment.appendChild(document.createTextNode(texte.slice(position, index)));
    const marque = document.createElement("mark");
    marque.textContent = texte.slice(index, index + cible.length);
    fragment.appendChild(marque);
    position = index + cible.length;
    index = source.indexOf(cible, position);
  }
  fragment.appendChild(document.createTextNode(texte.slice(position)));
  return fragment;
}

function rechercher(requete) {
  const base = etat.sommaire.concat([ENTREE_DEMO]);
  const terme = sansAccents(requete).trim();
  if (!terme) return base.slice(-8).reverse();
  return base
    .map((entree) => {
      const module = moduleDe(entree);
      const titre = sansAccents(entree.titre);
      const resume = sansAccents(entree.resume);
      const nomModule = sansAccents(module ? module.titre : "");
      let score = 0;
      if (titre.startsWith(terme)) score += 100;
      if (titre.includes(terme)) score += 60;
      if (resume.includes(terme)) score += 25;
      if (nomModule.includes(terme)) score += 12;
      return { entree, score };
    })
    .filter((candidat) => candidat.score > 0)
    .sort((a, b) => b.score - a.score || a.entree.ordre - b.entree.ordre)
    .slice(0, 12)
    .map((candidat) => candidat.entree);
}

function afficherResultats(requete) {
  if (!dom.paletteResultats) return;
  paletteEntrees = rechercher(requete);
  paletteIndex = 0;
  dom.paletteResultats.textContent = "";

  if (!paletteEntrees.length) {
    const vide = document.createElement("li");
    const texte = document.createElement("p");
    texte.className = "palette-vide";
    texte.textContent = etat.sommaire.length
      ? "Aucun cours ne correspond à cette recherche."
      : "Aucun cours publié pour le moment. La démonstration du moteur reste accessible.";
    vide.appendChild(texte);
    dom.paletteResultats.appendChild(vide);
    return;
  }

  paletteEntrees.forEach((entree, index) => {
    const module = moduleDe(entree);
    const ligne = document.createElement("li");
    const lien = document.createElement("a");
    lien.href = entree.demo ? "#/demo" : "#/cours/" + entree.slug;
    lien.setAttribute("role", "option");
    lien.setAttribute("aria-selected", index === 0 ? "true" : "false");

    const titre = document.createElement("span");
    titre.className = "titre";
    titre.appendChild(surligner(entree.titre, requete));

    const detail = document.createElement("span");
    detail.className = "detail";
    const morceaux = [];
    if (module) morceaux.push(module.titre);
    if (entree.duree_min) morceaux.push(entree.duree_min + " min");
    if (etat.lus.has(entree.slug)) morceaux.push("lu");
    detail.textContent = morceaux.join("  |  ") || (entree.resume ? entree.resume.slice(0, 90) : "");

    lien.append(titre, detail);
    lien.addEventListener("click", () => fermerPalette());
    ligne.appendChild(lien);
    dom.paletteResultats.appendChild(ligne);
  });
}

function majSelectionPalette() {
  const liens = dom.paletteResultats.querySelectorAll("a");
  liens.forEach((lien, index) => {
    lien.setAttribute("aria-selected", index === paletteIndex ? "true" : "false");
    if (index === paletteIndex) lien.scrollIntoView({ block: "nearest" });
  });
}

function ouvrirPalette() {
  if (!dom.palette) return;
  paletteDeclencheur = document.activeElement;
  dom.palette.hidden = false;
  dom.paletteChamp.value = "";
  afficherResultats("");
  dom.paletteChamp.focus();
  if (etat.lenis && typeof etat.lenis.stop === "function") etat.lenis.stop();
}

function fermerPalette() {
  if (!dom.palette || dom.palette.hidden) return;
  dom.palette.hidden = true;
  if (etat.lenis && typeof etat.lenis.start === "function") etat.lenis.start();
  if (paletteDeclencheur && typeof paletteDeclencheur.focus === "function") paletteDeclencheur.focus();
}

function initialiserPalette() {
  if (!dom.palette) return;
  if (dom.boutonRecherche) dom.boutonRecherche.addEventListener("click", ouvrirPalette);
  if (dom.paletteVoile) dom.paletteVoile.addEventListener("click", fermerPalette);

  dom.paletteChamp.addEventListener("input", () => afficherResultats(dom.paletteChamp.value));
  dom.paletteChamp.addEventListener("keydown", (evenement) => {
    const liens = dom.paletteResultats.querySelectorAll("a");
    if (evenement.key === "ArrowDown") {
      evenement.preventDefault();
      paletteIndex = Math.min(liens.length - 1, paletteIndex + 1);
      majSelectionPalette();
    } else if (evenement.key === "ArrowUp") {
      evenement.preventDefault();
      paletteIndex = Math.max(0, paletteIndex - 1);
      majSelectionPalette();
    } else if (evenement.key === "Enter") {
      evenement.preventDefault();
      const lien = liens[paletteIndex];
      if (lien) {
        location.hash = lien.getAttribute("href");
        fermerPalette();
      }
    }
  });

  document.addEventListener("keydown", (evenement) => {
    if (typeof evenement.key !== "string") return;
    const combinaison = (evenement.ctrlKey || evenement.metaKey) && evenement.key.toLowerCase() === "k";
    if (combinaison) {
      evenement.preventDefault();
      if (dom.palette.hidden) ouvrirPalette();
      else fermerPalette();
      return;
    }
    if (evenement.key === "Escape") {
      if (!dom.palette.hidden) {
        evenement.preventDefault();
        fermerPalette();
      } else if (window.innerWidth <= 1024 && dom.coque.dataset.nav === "ouvert") {
        navigationOuverte(false);
      }
    }
    if (evenement.key === "/" && dom.palette.hidden) {
      const actif = document.activeElement;
      const saisieActive = actif && ["INPUT", "TEXTAREA", "SELECT"].includes(actif.tagName);
      if (!saisieActive) {
        evenement.preventDefault();
        ouvrirPalette();
      }
    }
  });
}

/* --------------------------------------------------------------------------
   Lecture d'un cours : cadre, plan, suivi de lecture
   -------------------------------------------------------------------------- */

function squeletteChargement() {
  const cadre = document.createElement("div");
  cadre.className = "chargement";
  cadre.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 5; i += 1) cadre.appendChild(document.createElement("span"));
  return cadre;
}

function messageAvarie(titre, explication, detail, slug) {
  const cadre = document.createElement("div");
  cadre.className = "avarie";
  cadre.setAttribute("role", "alert");

  const entete = document.createElement("h2");
  entete.textContent = titre;
  const texte = document.createElement("p");
  texte.textContent = explication;
  cadre.append(entete, texte);

  if (detail) {
    const precision = document.createElement("p");
    const code = document.createElement("code");
    code.textContent = detail;
    precision.appendChild(code);
    cadre.appendChild(precision);
  }

  const actions = document.createElement("div");
  actions.className = "avarie-actions";
  const retour = document.createElement("a");
  retour.className = "bouton-secondaire";
  retour.href = "#/";
  retour.textContent = "Revenir à l'accueil";
  actions.appendChild(retour);
  if (slug) {
    const reessayer = document.createElement("button");
    reessayer.type = "button";
    reessayer.className = "bouton-primaire";
    reessayer.textContent = "Réessayer";
    reessayer.addEventListener("click", () => ouvrirCours(slug, true));
    actions.appendChild(reessayer);
  }
  cadre.appendChild(actions);
  return cadre;
}

async function deposerCours() {
  if (etat.moduleCours && typeof etat.moduleCours.detruire === "function") {
    try {
      etat.moduleCours.detruire();
    } catch (erreur) {
      /* un cours qui se nettoie mal ne doit pas bloquer le suivant */
    }
  }
  etat.moduleCours = null;

  if (etat.apiCours && typeof etat.apiCours.nettoyer === "function") {
    try {
      etat.apiCours.nettoyer();
    } catch (erreur) {
      /* idem */
    }
  }
  etat.apiCours = null;

  if (typeof etat.detacherScroll === "function") {
    etat.detacherScroll();
    etat.detacherScroll = null;
  }

  const ScrollTrigger = globalThis.ScrollTrigger;
  if (ScrollTrigger && typeof ScrollTrigger.getAll === "function") {
    for (const declencheur of ScrollTrigger.getAll()) {
      const cible = declencheur.trigger;
      if (cible && dom.vueCours.contains(cible)) declencheur.kill();
    }
  }

  dom.vueCours.textContent = "";
  if (dom.jauge) dom.jauge.style.width = "0%";
}

function construireCadreCours(entree, module) {
  const tete = document.createElement("header");
  tete.className = "cours-tete";

  const fil = document.createElement("p");
  fil.className = "cours-fil";
  const lienAccueil = document.createElement("a");
  lienAccueil.href = "#/";
  lienAccueil.textContent = "Parcours";
  fil.appendChild(lienAccueil);
  const separateur = document.createElement("span");
  separateur.textContent = "/";
  separateur.setAttribute("aria-hidden", "true");
  fil.appendChild(separateur);
  const nomModule = document.createElement("span");
  nomModule.textContent = module ? module.titre : entree.demo ? "Démonstration" : "Séance";
  fil.appendChild(nomModule);

  const titre = document.createElement("h1");
  titre.id = "titre-cours-courant";
  titre.textContent = entree.titre;

  tete.append(fil, titre);

  if (entree.resume) {
    const resume = document.createElement("p");
    resume.className = "cours-resume";
    resume.textContent = entree.resume;
    tete.appendChild(resume);
  }

  const meta = document.createElement("div");
  meta.className = "cours-meta";
  if (entree.duree_min) {
    const pastille = document.createElement("span");
    pastille.className = "pastille";
    pastille.textContent = entree.duree_min + " min de travail";
    meta.appendChild(pastille);
  }
  if (entree.date) {
    const pastille = document.createElement("span");
    pastille.className = "pastille";
    pastille.textContent = "publié le " + entree.date;
    meta.appendChild(pastille);
  }
  if (etat.lus.has(entree.slug)) {
    const pastille = document.createElement("span");
    pastille.className = "pastille pastille-succes";
    pastille.textContent = "marqué comme lu";
    meta.appendChild(pastille);
  }
  if (meta.childElementCount) tete.appendChild(meta);

  const cadre = document.createElement("div");
  cadre.className = "cours-cadre";

  const corps = document.createElement("div");
  corps.className = "cours-corps";
  corps.id = "cours-corps";

  const plan = document.createElement("aside");
  plan.className = "cours-plan";
  plan.setAttribute("aria-label", "Plan de la séance");

  cadre.append(corps, plan);
  dom.vueCours.append(tete, cadre);
  return { corps, plan, tete };
}

function construirePlan(article, plan, entree) {
  plan.textContent = "";
  const titre = document.createElement("p");
  titre.className = "cours-plan-titre";
  titre.textContent = "Plan de la séance";
  plan.appendChild(titre);

  const sections = Array.from(article.querySelectorAll("h2"));
  const liste = document.createElement("ol");
  const liens = [];

  sections.forEach((section, index) => {
    if (!section.id) section.id = "section-" + (index + 1);
    const ligne = document.createElement("li");
    const lien = document.createElement("a");
    lien.href = "#" + section.id;
    lien.textContent = section.textContent.trim();
    lien.dataset.cible = section.id;
    lien.addEventListener("click", (evenement) => {
      evenement.preventDefault();
      defilerVers(section);
      section.setAttribute("tabindex", "-1");
      section.focus({ preventScroll: true });
    });
    ligne.appendChild(lien);
    liste.appendChild(ligne);
    liens.push({ lien, section });
  });

  if (sections.length) plan.appendChild(liste);

  const avancement = document.createElement("p");
  avancement.className = "cours-plan-progression";
  avancement.textContent = sections.length + " sections";
  plan.appendChild(avancement);

  const outils = document.createElement("div");
  outils.className = "cours-outils";

  const boutonLu = document.createElement("button");
  boutonLu.type = "button";
  boutonLu.className = "bouton-fin";
  const lu = etat.lus.has(entree.slug);
  boutonLu.setAttribute("aria-pressed", lu ? "true" : "false");
  boutonLu.textContent = lu ? "Cours lu" : "Marquer comme lu";
  boutonLu.addEventListener("click", () => {
    const deja = etat.lus.has(entree.slug);
    if (deja) etat.lus.delete(entree.slug);
    else etat.lus.add(entree.slug);
    ecrireLocal("lus", Array.from(etat.lus));
    boutonLu.setAttribute("aria-pressed", deja ? "false" : "true");
    boutonLu.textContent = deja ? "Marquer comme lu" : "Cours lu";
    annoncer(deja ? "Cours retiré des lectures faites." : "Cours marqué comme lu.");
    construireAccueil();
  });
  outils.appendChild(boutonLu);

  const boutonHaut = document.createElement("button");
  boutonHaut.type = "button";
  boutonHaut.className = "bouton-fin";
  boutonHaut.textContent = "Revenir en haut";
  boutonHaut.addEventListener("click", () => remonter());
  outils.appendChild(boutonHaut);

  plan.appendChild(outils);
  return { liens, avancement };
}

function construirePagination(entree) {
  if (entree.demo) return;
  const index = indexDe(entree.slug);
  if (index < 0) return;
  const precedent = etat.sommaire[index - 1] || null;
  const suivant = etat.sommaire[index + 1] || null;

  const nav = document.createElement("nav");
  nav.className = "cours-pagination";
  nav.setAttribute("aria-label", "Séance précédente et suivante");

  function lienVoisin(cible, sens, libelle) {
    const element = document.createElement(cible ? "a" : "span");
    element.className = "lien-voisin " + sens + (cible ? "" : " inactif");
    if (cible) element.href = "#/cours/" + cible.slug;
    const marque = document.createElement("span");
    marque.className = "sens";
    marque.textContent = libelle;
    const titre = document.createElement("span");
    titre.className = "titre";
    titre.textContent = cible ? cible.titre : sens === "precedent" ? "Début du parcours" : "Prochaine séance à venir";
    element.append(marque, titre);
    return element;
  }

  nav.append(lienVoisin(precedent, "precedent", "Cours précédent"), lienVoisin(suivant, "suivant", "Cours suivant"));
  dom.vueCours.appendChild(nav);
}

function suivreLecture(article, infosPlan) {
  let demande = 0;
  let actif = null;

  function maj() {
    demande = 0;
    const boite = article.getBoundingClientRect();
    const hauteurVue = window.innerHeight || 800;
    const total = Math.max(1, boite.height - hauteurVue * 0.4);
    const parcouru = Math.min(Math.max(0, hauteurVue * 0.4 - boite.top), total);
    const ratio = Math.min(1, Math.max(0, parcouru / total));
    if (dom.jauge) dom.jauge.style.width = (ratio * 100).toFixed(1) + "%";

    const seuil = hauteurBarre() + 60;
    let courant = null;
    for (const paire of infosPlan.liens) {
      const haut = paire.section.getBoundingClientRect().top;
      if (haut <= seuil) courant = paire;
    }
    if (!courant && infosPlan.liens.length) courant = infosPlan.liens[0];
    if (courant !== actif) {
      for (const paire of infosPlan.liens) paire.lien.removeAttribute("aria-current");
      if (courant) courant.lien.setAttribute("aria-current", "true");
      actif = courant;
    }
    if (infosPlan.avancement && infosPlan.liens.length) {
      const rang = actif ? infosPlan.liens.indexOf(actif) + 1 : 0;
      infosPlan.avancement.textContent =
        "Section " + rang + " sur " + infosPlan.liens.length + "  |  " + Math.round(ratio * 100) + " % lu";
    }
  }

  function planifier() {
    if (demande) return;
    demande = requestAnimationFrame(maj);
  }

  window.addEventListener("scroll", planifier, { passive: true });
  window.addEventListener("resize", planifier);
  maj();

  return () => {
    window.removeEventListener("scroll", planifier);
    window.removeEventListener("resize", planifier);
    if (demande) cancelAnimationFrame(demande);
  };
}

function revelerBlocsCours(article, api) {
  const selecteur =
    ":scope > h2, :scope > h3, :scope > figure, :scope > pre, :scope > table, :scope > .cadre-tableau," +
    ":scope > .encadre, :scope > .formule-cle, :scope > .m-bloc, :scope > .grille-2, :scope > ul, :scope > ol," +
    ":scope > blockquote, :scope > .liste-objectifs";
  let blocs = [];
  try {
    blocs = Array.from(article.querySelectorAll(selecteur));
  } catch (erreur) {
    blocs = Array.from(article.children);
  }
  if (blocs.length) api.reveler(blocs, { decalage: 0, y: 16 });
}

async function ouvrirCours(slug, forcer) {
  const demo = slug === SLUG_DEMO;
  const entree = demo ? ENTREE_DEMO : etat.sommaire.find((element) => element.slug === slug);

  if (!entree) {
    await deposerCours();
    basculerVue("cours");
    dom.vueCours.appendChild(
      messageAvarie(
        "Cours introuvable",
        "Aucune séance ne correspond à cette adresse. Le sommaire du parcours reste accessible depuis l'accueil.",
        "cours/" + slug + "/",
        null
      )
    );
    document.title = "Cours introuvable | Remise à niveau en ingénierie électrique";
    return;
  }

  if (etat.coursCourant === slug && !forcer) return;

  const jeton = {};
  etat.chargementEnCours = jeton;
  await deposerCours();
  etat.coursCourant = slug;
  marquerNavigation(slug);
  basculerVue("cours");

  const { corps, plan } = construireCadreCours(entree, moduleDe(entree));
  corps.appendChild(squeletteChargement());
  remonter();

  let texte = "";
  try {
    const reponse = await fetch(new URL("cours/" + slug + "/contenu.html", BASE).href, { cache: "no-cache" });
    if (!reponse.ok) throw new Error("statut HTTP " + reponse.status);
    texte = await reponse.text();
  } catch (erreur) {
    if (etat.chargementEnCours !== jeton) return;
    corps.textContent = "";
    corps.appendChild(
      messageAvarie(
        "Ce cours n'a pas pu être chargé",
        "Le fichier de la séance est inaccessible pour le moment. Vérifiez votre connexion, puis réessayez. Le reste du site reste utilisable.",
        "cours/" + slug + "/contenu.html : " + erreur.message,
        slug
      )
    );
    document.title = entree.titre + " | Remise à niveau en ingénierie électrique";
    return;
  }

  if (etat.chargementEnCours !== jeton) return;

  corps.textContent = "";
  const support = document.createElement("div");
  support.innerHTML = String(texte).replace(/<script[\s\S]*?<\/script>/gi, "");
  let article = support.querySelector("article.cours");
  if (!article) {
    article = document.createElement("article");
    article.className = "cours";
    article.dataset.slug = slug;
    while (support.firstChild) article.appendChild(support.firstChild);
  }
  if (!article.dataset.slug) article.dataset.slug = slug;
  corps.appendChild(article);

  rendreMaths(article);
  await rendreMermaid(article);
  if (etat.chargementEnCours !== jeton) return;

  const infosPlan = construirePlan(article, plan, entree);
  construirePagination(entree);

  const api = creerMoteur({
    gsap: globalThis.gsap,
    ScrollTrigger: globalThis.ScrollTrigger,
    lenis: etat.lenis,
    mouvementReduit,
    slug,
    racine: article,
    rendreMaths,
  });
  etat.apiCours = api;

  try {
    const module = await import(new URL("cours/" + slug + "/cours.js", BASE).href);
    if (etat.chargementEnCours !== jeton) return;
    etat.moduleCours = module;
    if (typeof module.init === "function") await module.init(article, api);
  } catch (erreur) {
    const avis = document.createElement("div");
    avis.className = "encadre attention";
    const titre = document.createElement("span");
    titre.className = "encadre-titre";
    titre.textContent = "Partie interactive indisponible";
    const texteAvis = document.createElement("p");
    texteAvis.textContent =
      "Le texte de la séance est complet, mais ses exercices et simulations n'ont pas pu être chargés. Rechargez la page pour réessayer.";
    avis.append(titre, texteAvis);
    article.prepend(avis);
  }

  if (etat.chargementEnCours !== jeton) return;

  revelerBlocsCours(article, api);
  rendreMaths(article);
  etat.detacherScroll = suivreLecture(article, infosPlan);

  const ScrollTrigger = globalThis.ScrollTrigger;
  if (ScrollTrigger && typeof ScrollTrigger.refresh === "function") ScrollTrigger.refresh();

  document.title = entree.titre + " | Remise à niveau en ingénierie électrique";
  annoncer("Cours affiché : " + entree.titre);
  if (dom.principal) dom.principal.focus({ preventScroll: true });
}

/* --------------------------------------------------------------------------
   Routage par hash
   -------------------------------------------------------------------------- */

function basculerVue(nom) {
  const gsap = globalThis.gsap;
  const versCours = nom === "cours";
  const entrante = versCours ? dom.vueCours : dom.vueAccueil;
  const sortante = versCours ? dom.vueAccueil : dom.vueCours;

  sortante.hidden = true;
  entrante.hidden = false;

  if (gsap && !mouvementReduit) {
    gsap.fromTo(entrante, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.34, ease: "power2.out" });
  }
}

async function router() {
  const brut = location.hash.replace(/^#/, "");
  const chemin = brut.startsWith("/") ? brut : "/";

  if (chemin === "/demo" || chemin === "/cours/" + SLUG_DEMO) {
    await ouvrirCours(SLUG_DEMO);
    return;
  }

  const correspondance = chemin.match(/^\/cours\/([^/?#]+)/);
  if (correspondance) {
    await ouvrirCours(decodeURIComponent(correspondance[1]));
    return;
  }

  await deposerCours();
  etat.coursCourant = null;
  marquerNavigation(null);
  basculerVue("accueil");
  document.title = "Remise à niveau en ingénierie électrique";
  if (!brut || chemin === "/") remonter();
}

/* --------------------------------------------------------------------------
   Animations de la page d'accueil
   -------------------------------------------------------------------------- */

function tracerSinus() {
  const trace = document.getElementById("heros-sinus");
  if (!trace) return;
  const points = [];
  const largeur = 1200;
  const milieu = 688;
  for (let x = 0; x <= largeur; x += 8) {
    const y = milieu - 32 * Math.sin((x / largeur) * Math.PI * 6);
    points.push((x === 0 ? "M" : "L") + x + " " + y.toFixed(1));
  }
  trace.setAttribute("d", points.join(" "));
}

function animerAccueil() {
  tracerSinus();
  const gsap = globalThis.gsap;
  if (!gsap || mouvementReduit) return;
  const ScrollTrigger = globalThis.ScrollTrigger;

  const ligneTemps = gsap.timeline({ defaults: { ease: "power3.out" } });
  ligneTemps
    .from("#heros-etiquette", { opacity: 0, y: 14, duration: 0.5 })
    .from(".mot-anime", { opacity: 0, y: 26, duration: 0.7, stagger: 0.09 }, "-=0.2")
    .from(".heros-texte", { opacity: 0, y: 18, duration: 0.6 }, "-=0.35")
    .from(".heros-actions > *", { opacity: 0, y: 14, duration: 0.5, stagger: 0.08 }, "-=0.3");

  const traits = document.querySelectorAll(".trait-flux");
  if (traits.length) {
    ligneTemps.to(traits, { strokeDashoffset: 0, duration: 1.5, stagger: 0.12, ease: "power2.inOut" }, 0.15);
  }

  const impulsions = document.querySelectorAll(".impulsion");
  impulsions.forEach((impulsion, index) => {
    gsap.set(impulsion, { strokeDashoffset: 1026 });
    gsap.to(impulsion, {
      strokeDashoffset: -26,
      duration: 2.6 + index * 0.35,
      repeat: -1,
      delay: 1 + index * 0.5,
      ease: "none",
    });
  });

  gsap.to("#heros-sinus", { attr: { "stroke-dashoffset": 0 }, duration: 2, ease: "none" });

  const halos = document.querySelectorAll(".halo");
  if (halos.length) {
    gsap.to(halos, { scale: 1.12, opacity: 0.4, duration: 3.4, repeat: -1, yoyo: true, ease: "sine.inOut", transformOrigin: "center" });
  }

  if (!ScrollTrigger) return;

  gsap.utils.toArray(".bloc .titre-section").forEach((titre) => {
    gsap.from(titre, {
      opacity: 0,
      x: -16,
      duration: 0.6,
      ease: "power2.out",
      scrollTrigger: { trigger: titre, start: "top 88%", once: true },
    });
  });

  const cartes = gsap.utils.toArray(".carte-module, .carte-methode");
  if (cartes.length) {
    gsap.from(cartes, {
      opacity: 0,
      y: 22,
      duration: 0.55,
      stagger: 0.05,
      ease: "power2.out",
      scrollTrigger: { trigger: dom.grilleModules || cartes[0], start: "top 86%", once: true },
    });
  }

  const cadre = document.querySelector(".progression-cadre");
  if (cadre) {
    gsap.from(cadre, {
      opacity: 0,
      y: 20,
      duration: 0.6,
      ease: "power2.out",
      scrollTrigger: { trigger: cadre, start: "top 88%", once: true },
    });
  }
}

/* --------------------------------------------------------------------------
   Démarrage
   -------------------------------------------------------------------------- */

async function demarrer() {
  initialiserTheme();
  initialiserDefilement();
  initialiserNavigation();
  initialiserPalette();
  preparerMermaid();

  await chargerDonnees();
  construireAccueil();
  animerAccueil();

  window.addEventListener("hashchange", () => {
    router().catch(() => {
      /* une route invalide ne doit pas figer le site */
    });
  });

  await router();

  const ScrollTrigger = globalThis.ScrollTrigger;
  if (ScrollTrigger && typeof ScrollTrigger.refresh === "function") {
    window.addEventListener("load", () => ScrollTrigger.refresh());
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => ScrollTrigger.refresh()).catch(() => {});
    }
  }
}

demarrer().catch((erreur) => {
  const cible = dom.vueCours || document.body;
  if (dom.vueAccueil && dom.vueCours) {
    dom.vueAccueil.hidden = true;
    dom.vueCours.hidden = false;
  }
  cible.appendChild(
    messageAvarie(
      "Le site n'a pas pu démarrer",
      "Une erreur est survenue pendant l'initialisation. Rechargez la page pour réessayer.",
      String(erreur && erreur.message ? erreur.message : erreur),
      null
    )
  );
});
