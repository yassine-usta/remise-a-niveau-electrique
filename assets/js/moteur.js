/* ==========================================================================
   moteur.js
   Bibliothèque partagée par tous les cours du parcours.
   Fournit l'objet api passé à la fonction init(racine, api) de chaque cours :
   exercices corrigés, quiz, cartes de mémorisation, grille d'auto-évaluation,
   tracé progressif des schémas et simulations (curseurs, traceur, oscilloscope,
   Fresnel, Bode, spectre, poignée déplaçable, lecteur, valeurs en direct).

   Aucune dépendance obligatoire. GSAP, ScrollTrigger et Lenis sont utilisés
   quand ils sont disponibles ; sinon le moteur reste pleinement fonctionnel.
   ========================================================================== */

import { icone as iconeRegistre } from "./icones.js";

const PREFIXE_STOCKAGE = "rne";
const TAU = Math.PI * 2;
const POLICE_TRACE = "'JetBrains Mono', ui-monospace, monospace";

/* --------------------------------------------------------------------------
   Utilitaires généraux
   -------------------------------------------------------------------------- */

let compteurIdentifiants = 0;
function identifiant(prefixe) {
  compteurIdentifiants += 1;
  return prefixe + "-" + compteurIdentifiants.toString(36);
}

function creer(balise, options = {}) {
  const el = document.createElement(balise);
  if (options.classe) el.className = options.classe;
  if (options.texte != null) el.textContent = String(options.texte);
  if (options.html != null) el.innerHTML = options.html;
  if (options.attributs) {
    for (const [cle, valeur] of Object.entries(options.attributs)) {
      if (valeur === false || valeur == null) continue;
      el.setAttribute(cle, valeur === true ? "" : String(valeur));
    }
  }
  if (options.enfants) {
    for (const enfant of options.enfants) {
      if (enfant) el.appendChild(enfant);
    }
  }
  return el;
}

function resoudre(cible, racine) {
  if (!cible) return null;
  if (typeof cible === "string") return (racine || document).querySelector(cible);
  return cible;
}

function resoudreListe(cibles, racine) {
  if (!cibles) return [];
  if (typeof cibles === "string") return Array.from((racine || document).querySelectorAll(cibles));
  if (cibles instanceof Element) return [cibles];
  if (typeof cibles.length === "number") return Array.from(cibles).filter((el) => el instanceof Element);
  return [];
}

/** Retire les accents et la casse pour comparer des réponses rédigées. */
function normaliser(texte) {
  return String(texte == null ? "" : texte)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%.,+/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Convertit une saisie utilisateur en nombre : virgule décimale, espaces, préfixes SI. */
function lireNombre(saisie) {
  if (typeof saisie === "number") return Number.isFinite(saisie) ? saisie : NaN;
  let texte = String(saisie == null ? "" : saisie).trim();
  if (!texte) return NaN;
  texte = texte.replace(/ | |\s/g, "").replace(",", ".");
  const prefixes = { p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };
  const avecPrefixe = texte.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([pnuµmkKMGT])$/);
  if (avecPrefixe) return parseFloat(avecPrefixe[1]) * prefixes[avecPrefixe[2]];
  const nombre = Number(texte);
  return Number.isFinite(nombre) ? nombre : NaN;
}

/** Mise en forme lisible d'un nombre, avec espace insécable comme séparateur de milliers. */
function formater(valeur, chiffres) {
  if (!Number.isFinite(valeur)) return "indéfini";
  const abs = Math.abs(valeur);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) {
    return valeur.toExponential(chiffres == null ? 2 : chiffres).replace(".", ",").replace("e", " x 10^");
  }
  const decimales = chiffres != null ? chiffres : abs >= 100 ? 1 : abs >= 10 ? 2 : abs >= 1 ? 3 : 4;
  return valeur
    .toFixed(decimales)
    .replace(/\.?0+$/, "")
    .replace(".", ",");
}

/** Accorde un nom avec son nombre : accord(2, "carte lue", "cartes lues"). */
export function accord(nombre, singulier, pluriel) {
  const forme = Math.abs(Number(nombre)) >= 2 ? pluriel || singulier + "s" : singulier;
  return nombre + " " + forme;
}

function melangerTableau(tableau) {
  const copie = tableau.slice();
  for (let i = copie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

/* Les noms internes du moteur renvoient vers le registre d'icônes du site. */
const ALIAS_ICONES = {
  juste: "coche",
  faux: "fermer",
  oeil: "oeil",
  fleche: "fleche",
  retour: "recommencer",
  melange: "melanger",
};

/* Icône associée à chaque genre de bloc, reprise dans son en-tête. */
const ICONE_GENRE = {
  "Question à choix": "liste",
  "Vrai ou faux": "coche_cercle",
  Calcul: "cible",
  "Réponse courte": "livre",
  "Lecture de schéma": "resistance",
  Quiz: "etincelle",
  Mémorisation: "ampoule",
  "Auto-évaluation": "diplome",
  Simulation: "onde",
  Oscilloscope: "onde",
  Phaseurs: "phaseur",
  "Réponse fréquentielle": "onde",
  "Analyse spectrale": "grille",
  Tracé: "onde",
  "Correction visuelle": "oeil",
};

function genreAvecIcone(genre) {
  const element = creer("span", { classe: "m-bloc-genre" });
  const nom = ICONE_GENRE[genre];
  if (nom) element.appendChild(icone(nom, { taille: 14 }));
  element.appendChild(creer("span", { texte: genre }));
  return element;
}

function icone(nom, options) {
  const reglages = typeof options === "object" && options !== null ? options : { taille: options || 16 };
  if (!reglages.taille) reglages.taille = 16;
  return iconeRegistre(ALIAS_ICONES[nom] || nom, reglages);
}

/* --------------------------------------------------------------------------
   Contexte : stockage, registre des scores, nettoyage
   -------------------------------------------------------------------------- */

function creerContexte(contexte) {
  const mouvementReduit =
    contexte.mouvementReduit != null
      ? Boolean(contexte.mouvementReduit)
      : typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ctx = {
    gsap: contexte.gsap || globalThis.gsap || null,
    ScrollTrigger: contexte.ScrollTrigger || (globalThis.ScrollTrigger || null),
    lenis: contexte.lenis || null,
    mouvementReduit,
    slug: contexte.slug || "cours",
    racine: contexte.racine || document,
    rendreMathsExterne: contexte.rendreMaths || null,
    nettoyeurs: [],
    registre: { exercices: new Map(), quiz: null, abonnes: new Set() },
    api: null,
  };
  return ctx;
}

function cleStockage(ctx, sousCle) {
  return PREFIXE_STOCKAGE + ":" + ctx.slug + ":" + sousCle;
}

function lireStockage(ctx, sousCle, defaut) {
  try {
    const brut = localStorage.getItem(cleStockage(ctx, sousCle));
    if (brut == null) return defaut;
    return JSON.parse(brut);
  } catch (erreur) {
    return defaut;
  }
}

function ecrireStockage(ctx, sousCle, valeur) {
  try {
    localStorage.setItem(cleStockage(ctx, sousCle), JSON.stringify(valeur));
    return true;
  } catch (erreur) {
    return false;
  }
}

function effacerStockage(ctx, sousCle) {
  try {
    localStorage.removeItem(cleStockage(ctx, sousCle));
    return true;
  } catch (erreur) {
    return false;
  }
}

function rendreMaths(ctx, element) {
  if (!element) return;
  if (typeof ctx.rendreMathsExterne === "function") {
    ctx.rendreMathsExterne(element);
    return;
  }
  const rendu = globalThis.renderMathInElement;
  if (typeof rendu !== "function") return;
  try {
    rendu(element, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true },
      ],
      throwOnError: false,
      ignoredClasses: ["mermaid", "ascii", "schema-ascii", "m-toile-cadre"],
    });
  } catch (erreur) {
    /* un rendu de formule manquant ne doit jamais interrompre un cours */
  }
}

function enregistrerNettoyeur(ctx, fonction) {
  if (typeof fonction === "function") ctx.nettoyeurs.push(fonction);
}

function nettoyerTout(ctx) {
  const liste = ctx.nettoyeurs.slice();
  ctx.nettoyeurs.length = 0;
  for (const nettoyeur of liste) {
    try {
      nettoyeur();
    } catch (erreur) {
      /* le nettoyage ne doit jamais empêcher le chargement du cours suivant */
    }
  }
  ctx.registre.abonnes.clear();
}

/* Registre des scores : les exercices et le quiz alimentent l'auto-évaluation. */

function signalerExercice(ctx, id, etat) {
  ctx.registre.exercices.set(id, etat);
  diffuserScores(ctx);
}

function signalerQuiz(ctx, score, total) {
  ctx.registre.quiz = { score, total };
  diffuserScores(ctx);
}

function calculerScores(ctx) {
  let tentes = 0;
  let justes = 0;
  for (const etat of ctx.registre.exercices.values()) {
    if (etat && etat.tente) tentes += 1;
    if (etat && etat.juste) justes += 1;
  }
  return {
    exercices: { total: ctx.registre.exercices.size, tentes, justes },
    quiz: ctx.registre.quiz ? { score: ctx.registre.quiz.score, total: ctx.registre.quiz.total } : null,
  };
}

function diffuserScores(ctx) {
  const scores = calculerScores(ctx);
  for (const abonne of ctx.registre.abonnes) {
    try {
      abonne(scores);
    } catch (erreur) {
      /* un afficheur défaillant ne bloque pas les autres */
    }
  }
}

/* --------------------------------------------------------------------------
   Révélation au défilement
   -------------------------------------------------------------------------- */

function reveler(ctx, cibles, options = {}) {
  const elements = resoudreListe(cibles, ctx.racine instanceof Element ? ctx.racine : document);
  if (!elements.length) return { detruire() {} };

  if (ctx.mouvementReduit || !ctx.gsap) {
    for (const el of elements) {
      el.classList.remove("a-reveler");
      el.style.opacity = "";
      el.style.transform = "";
    }
    return { detruire() {} };
  }

  const decalage = options.decalage != null ? options.decalage : 0.08;
  const duree = options.duree != null ? options.duree : 0.62;
  const depart = options.depart || "top 88%";
  const deplacement = options.y != null ? options.y : 20;
  const tweens = [];

  elements.forEach((el, index) => {
    el.classList.add("a-reveler");
    const animation = ctx.gsap.fromTo(
      el,
      { opacity: 0, y: deplacement },
      {
        opacity: 1,
        y: 0,
        duration: duree,
        delay: index * decalage,
        ease: "power2.out",
        overwrite: "auto",
        onComplete() {
          el.classList.remove("a-reveler");
          el.style.transform = "";
        },
        scrollTrigger: ctx.ScrollTrigger
          ? { trigger: el, start: depart, once: true }
          : undefined,
      }
    );
    tweens.push(animation);
  });

  const controle = {
    detruire() {
      for (const tween of tweens) {
        if (tween.scrollTrigger) tween.scrollTrigger.kill();
        tween.kill();
      }
      for (const el of elements) el.classList.remove("a-reveler");
    },
  };
  enregistrerNettoyeur(ctx, controle.detruire);
  return controle;
}

/** Anime l'apparition successive des étapes d'une correction. */
function revelerEtapes(ctx, liste) {
  const etapes = Array.from(liste.querySelectorAll(".m-etape"));
  if (!etapes.length) return;
  if (ctx.mouvementReduit || !ctx.gsap) {
    for (const etape of etapes) etape.classList.add("visible");
    return;
  }
  ctx.gsap.fromTo(
    etapes,
    { opacity: 0, y: 12 },
    {
      opacity: 1,
      y: 0,
      duration: 0.4,
      stagger: 0.16,
      ease: "power2.out",
      onComplete() {
        for (const etape of etapes) {
          etape.classList.add("visible");
          etape.style.transform = "";
        }
      },
    }
  );
}

/* --------------------------------------------------------------------------
   Tracé progressif d'un schéma

   Le schéma existe déjà dans la page, complet : api.dessiner ne fait que
   masquer ses traits puis les redessiner à l'entrée dans l'écran. La zone de
   déclenchement se termine toujours avant le centre de l'écran, de sorte
   qu'un schéma placé au centre est forcément terminé, quel que soit le mode.
   -------------------------------------------------------------------------- */

const FORMES_TRACABLES = "path, line, polyline, polygon, circle, rect, ellipse";
const APPARITIONS = "text, image, foreignObject, use";

/* Repères communs aux deux modes : départ bas dans l'écran, fin avant le centre. */
const DEPART_DESSIN = "top 80%";
const FIN_DESSIN = "center 55%";
const PART_CENTRE = 0.55;

function estFormeTracable(element) {
  return element instanceof Element && /^(path|line|polyline|polygon|circle|rect|ellipse)$/i.test(element.tagName);
}

/** Une forme rangée dans defs ou dans un marqueur est une définition, pas un tracé. */
function estDefinition(element) {
  return typeof element.closest === "function" && Boolean(element.closest("defs, clipPath, mask, marker, pattern, symbol"));
}

/** Longueur du contour d'une forme, avec un secours sur sa boîte englobante. */
function longueurForme(forme) {
  try {
    if (typeof forme.getTotalLength === "function") {
      const longueur = forme.getTotalLength();
      if (Number.isFinite(longueur) && longueur > 0) return longueur;
    }
  } catch (erreur) {
    /* une forme dégénérée ne sait pas toujours se mesurer */
  }
  try {
    const boite = forme.getBBox();
    return Math.max(1, 2 * (boite.width + boite.height));
  } catch (erreur) {
    return 1;
  }
}

function memoriserStyles(element, proprietes) {
  const sauvegarde = {};
  for (const propriete of proprietes) sauvegarde[propriete] = element.style.getPropertyValue(propriete);
  return sauvegarde;
}

function restaurerStyles(element, sauvegarde) {
  for (const [propriete, valeur] of Object.entries(sauvegarde)) {
    if (valeur) element.style.setProperty(propriete, valeur);
    else element.style.removeProperty(propriete);
  }
}

function nombreStyle(valeur, defaut) {
  const nombre = Number.parseFloat(valeur);
  return Number.isFinite(nombre) ? nombre : defaut;
}

/**
 * Trace les éléments SVG d'un schéma, puis fait apparaître textes et remplissages.
 *
 * elements : sélecteur, élément, liste d'éléments. Un conteneur est exploré,
 *            une forme est prise telle quelle.
 * options  : { declencheur, depart, duree, decalage, scrub, surFin }
 *            scrub: true suit le défilement, mais la zone se termine
 *            obligatoirement à FIN_DESSIN, jamais à la sortie du schéma.
 */
function dessiner(ctx, elements, options = {}) {
  const racine = ctx.racine instanceof Element ? ctx.racine : document;
  const racines = resoudreListe(elements, racine);
  if (!racines.length) return { detruire() {} };

  const formes = [];
  const textes = [];
  for (const element of racines) {
    if (estFormeTracable(element)) {
      formes.push(element);
      continue;
    }
    for (const forme of element.querySelectorAll(FORMES_TRACABLES)) {
      if (!estDefinition(forme)) formes.push(forme);
    }
    for (const texte of element.querySelectorAll(APPARITIONS)) {
      if (!estDefinition(texte)) textes.push(texte);
    }
  }
  if (!formes.length && !textes.length) return { detruire() {} };

  const conteneur =
    resoudre(options.declencheur, racine) ||
    (racines.length === 1 && !estFormeTracable(racines[0]) ? racines[0] : null) ||
    (formes[0] ? formes[0].ownerSVGElement || formes[0].parentElement : null) ||
    racines[0];

  /* Un trait se dessine, un aplat et un texte apparaissent. */
  const traces = [];
  const fondus = [];
  for (const forme of formes) {
    const style = getComputedStyle(forme);
    const aTrait =
      style.stroke && style.stroke !== "none" && nombreStyle(style.strokeOpacity, 1) > 0 && nombreStyle(style.strokeWidth, 1) > 0;
    const aFond = style.fill && style.fill !== "none" && nombreStyle(style.fillOpacity, 1) > 0;
    if (aTrait) traces.push({ element: forme, longueur: longueurForme(forme) });
    if (aFond) fondus.push({ element: forme, propriete: "fill-opacity", valeur: nombreStyle(style.fillOpacity, 1) });
  }
  for (const texte of textes) {
    const style = getComputedStyle(texte);
    fondus.push({ element: texte, propriete: "opacity", valeur: nombreStyle(style.opacity, 1) });
  }

  /* Mouvement réduit : le schéma reste tel quel, donc déjà complet. */
  if (ctx.mouvementReduit || !ctx.gsap) return { detruire() {} };

  const sauvegardes = new Map();
  function memoriser(element, proprietes) {
    if (!sauvegardes.has(element)) sauvegardes.set(element, memoriserStyles(element, proprietes));
  }

  for (const trace of traces) {
    memoriser(trace.element, ["stroke-dasharray", "stroke-dashoffset", "fill-opacity", "opacity"]);
    const longueur = trace.longueur + 1;
    trace.element.style.strokeDasharray = longueur + " " + longueur;
    trace.element.style.strokeDashoffset = String(longueur);
  }
  for (const fondu of fondus) {
    memoriser(fondu.element, ["stroke-dasharray", "stroke-dashoffset", "fill-opacity", "opacity"]);
    fondu.element.style.setProperty(fondu.propriete, "0");
  }

  /* Le tracé emprunte stroke-dasharray : une fois fini, il faut rendre à
     chaque trait le pointillé qu'il portait, sinon il reste plein. */
  let traitsRendus = false;
  function rendreTraits() {
    if (traitsRendus) return;
    traitsRendus = true;
    for (const trace of traces) {
      const sauvegarde = sauvegardes.get(trace.element) || {};
      trace.element.style.removeProperty("stroke-dasharray");
      trace.element.style.removeProperty("stroke-dashoffset");
      if (sauvegarde["stroke-dasharray"]) trace.element.style.setProperty("stroke-dasharray", sauvegarde["stroke-dasharray"]);
      if (sauvegarde["stroke-dashoffset"]) trace.element.style.setProperty("stroke-dashoffset", sauvegarde["stroke-dashoffset"]);
    }
  }
  function reprendreTraits() {
    if (!traitsRendus) return;
    traitsRendus = false;
    for (const trace of traces) {
      const longueur = trace.longueur + 1;
      trace.element.style.strokeDasharray = longueur + " " + longueur;
    }
  }

  const gsap = ctx.gsap;
  const duree = Math.max(0.2, options.duree != null ? Number(options.duree) : 1.2);
  const nombre = traces.length;
  const dureeTrait = duree * 0.62;
  const pas = options.decalage != null ? Number(options.decalage) : nombre > 1 ? (duree * 0.38) / (nombre - 1) : 0;
  const ligne = gsap.timeline({
    paused: true,
    onUpdate() {
      if (ligne.progress() >= 1) rendreTraits();
      else reprendreTraits();
    },
    onComplete() {
      rendreTraits();
      if (typeof options.surFin === "function") options.surFin();
    },
  });

  if (nombre) {
    ligne.to(
      traces.map((trace) => trace.element),
      { strokeDashoffset: 0, duration: dureeTrait, ease: options.scrub ? "none" : "power1.inOut", stagger: pas },
      0
    );
  }
  if (fondus.length) {
    const groupes = new Map();
    for (const fondu of fondus) {
      if (!groupes.has(fondu.propriete)) groupes.set(fondu.propriete, []);
      groupes.get(fondu.propriete).push(fondu);
    }
    for (const [propriete, liste] of groupes) {
      const cible = propriete === "opacity" ? { opacity: 1 } : { fillOpacity: 1 };
      ligne.to(
        liste.map((fondu) => fondu.element),
        { ...cible, duration: Math.max(0.24, duree * 0.34), ease: "power1.out", stagger: Math.min(0.09, duree * 0.06) },
        duree * 0.62
      );
    }
  }

  let vivant = true;
  let declencheur = null;
  let garde = null;
  let observateur = null;
  let gardeVue = null;

  function terminer() {
    if (!vivant) return;
    ligne.progress(1);
    ligne.pause();
    rendreTraits();
  }

  function centreAtteint() {
    const hauteurEcran = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!hauteurEcran || !conteneur || typeof conteneur.getBoundingClientRect !== "function") return false;
    const rect = conteneur.getBoundingClientRect();
    /* Schéma pas encore mis en page : rien à conclure. */
    if (!rect.height && !rect.width) return false;
    return rect.top + rect.height / 2 <= hauteurEcran * PART_CENTRE;
  }

  const ScrollTrigger = ctx.ScrollTrigger;
  if (ScrollTrigger && conteneur) {
    if (options.scrub) {
      declencheur = ScrollTrigger.create({
        trigger: conteneur,
        start: options.depart || "top 85%",
        end: FIN_DESSIN,
        scrub: typeof options.scrub === "number" ? options.scrub : 0.45,
        animation: ligne,
      });
    } else {
      declencheur = ScrollTrigger.create({
        trigger: conteneur,
        start: options.depart || DEPART_DESSIN,
        once: true,
        onEnter() {
          ligne.play();
        },
      });
      /* Garde-fou : au centre de l'écran, le schéma est complet quoi qu'il arrive. */
      garde = ScrollTrigger.create({ trigger: conteneur, start: FIN_DESSIN, once: true, onEnter: terminer });
    }
  } else if (typeof IntersectionObserver === "function" && conteneur) {
    observateur = new IntersectionObserver(
      (entrees) => {
        for (const entree of entrees) {
          if (!entree.isIntersecting) continue;
          ligne.play();
          if (observateur) observateur.disconnect();
          observateur = null;
        }
      },
      { threshold: 0.12 }
    );
    observateur.observe(conteneur);
    gardeVue = new IntersectionObserver(
      (entrees) => {
        for (const entree of entrees) {
          if (entree.isIntersecting) terminer();
        }
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );
    gardeVue.observe(conteneur);
  } else {
    ligne.play();
  }

  /* Cas d'un schéma déjà dépassé au chargement : rien à animer, tout à montrer. */
  const verification = requestAnimationFrame(() => {
    if (vivant && !options.scrub && centreAtteint()) terminer();
  });

  const controle = {
    conteneur,
    ligne,
    terminer,
    detruire() {
      if (!vivant) return;
      vivant = false;
      cancelAnimationFrame(verification);
      if (declencheur) declencheur.kill();
      if (garde) garde.kill();
      if (observateur) observateur.disconnect();
      if (gardeVue) gardeVue.disconnect();
      declencheur = null;
      garde = null;
      observateur = null;
      gardeVue = null;
      ligne.kill();
      for (const [element, sauvegarde] of sauvegardes) restaurerStyles(element, sauvegarde);
      sauvegardes.clear();
    },
  };

  enregistrerNettoyeur(ctx, controle.detruire);
  return controle;
}

/* --------------------------------------------------------------------------
   Exercices : cadre commun
   -------------------------------------------------------------------------- */

function lireEtatsExercices(ctx) {
  const etats = lireStockage(ctx, "exercices", {});
  return etats && typeof etats === "object" ? etats : {};
}

function memoriserExercice(ctx, id, donnees) {
  const etats = lireEtatsExercices(ctx);
  etats[id] = donnees;
  ecrireStockage(ctx, "exercices", etats);
}

function oublierExercice(ctx, id) {
  const etats = lireEtatsExercices(ctx);
  delete etats[id];
  ecrireStockage(ctx, "exercices", etats);
}

function construireEtapes(etapes) {
  const liste = creer("ol", { classe: "m-etapes" });
  for (const etape of etapes || []) {
    const donnees = typeof etape === "string" ? { texte: etape } : etape || {};
    const corps = creer("div", { classe: "m-etape-corps", html: donnees.texte || "" });
    if (donnees.note) corps.appendChild(creer("span", { classe: "m-etape-note", html: donnees.note }));
    liste.appendChild(creer("li", { classe: "m-etape", enfants: [corps] }));
  }
  return liste;
}

function cadreExercice(ctx, conteneur, def, genreParDefaut) {
  const cible = resoudre(conteneur, ctx.racine instanceof Element ? ctx.racine : document);
  if (!cible) return null;

  const id = def.id || identifiant("exo");
  const genre = def.genre || genreParDefaut || "Exercice";

  const enonce = creer("div", { classe: "m-enonce", html: def.enonce || "" });
  const zoneReponse = creer("div", { classe: "m-reponse" });

  const boutonValider = creer("button", {
    classe: "m-bouton",
    attributs: { type: "button" },
    texte: def.libelleValider || "Valider",
  });
  const boutonCorrection = creer("button", {
    classe: "m-bouton secondaire",
    attributs: { type: "button" },
    texte: "Voir la correction",
  });
  boutonCorrection.prepend(icone("oeil"));
  const boutonRaz = creer("button", {
    classe: "m-bouton discret",
    attributs: { type: "button" },
    texte: "Réinitialiser",
  });

  const actions = creer("div", { classe: "m-actions", enfants: [boutonValider, boutonCorrection, boutonRaz] });
  const verdict = creer("p", { classe: "m-verdict", attributs: { hidden: true, role: "status" } });

  const etapes = construireEtapes(def.etapes);
  const visuel = creer("div", { classe: "m-visuel" });
  const correction = creer("div", {
    classe: "m-correction",
    attributs: { hidden: true },
    enfants: [
      creer("span", { classe: "m-correction-titre", texte: "Correction détaillée" }),
      def.correction ? creer("div", { classe: "m-correction-intro", html: def.correction }) : null,
      etapes,
      visuel,
    ],
  });

  const tete = creer("header", {
    classe: "m-bloc-tete",
    enfants: [
      genreAvecIcone(genre),
      def.titre ? creer("span", { classe: "m-bloc-titre", texte: def.titre }) : null,
      def.niveau ? creer("span", { classe: "pastille", texte: def.niveau }) : null,
    ],
  });

  const corps = creer("div", {
    classe: "m-bloc-corps",
    enfants: [enonce, zoneReponse, actions, verdict, correction],
  });

  const bloc = creer("section", {
    classe: "m-bloc m-exercice",
    attributs: { "data-exercice": id },
    enfants: [tete, corps],
  });
  cible.appendChild(bloc);

  let visuelConstruit = false;

  const controle = {
    id,
    bloc,
    zoneReponse,
    verdict,
    correction,
    visuel,
    boutonValider,
    boutonCorrection,
    boutonRaz,
    definirVerdict(etat, message) {
      verdict.hidden = false;
      verdict.dataset.etat = etat;
      verdict.textContent = "";
      verdict.appendChild(icone(etat === "juste" ? "juste" : etat === "faux" ? "faux" : "fleche"));
      verdict.appendChild(creer("span", { html: message }));
    },
    afficherCorrection() {
      if (!correction.hidden) return;
      correction.hidden = false;
      if (!visuelConstruit && typeof def.visuelCorrection === "function") {
        visuelConstruit = true;
        try {
          def.visuelCorrection(visuel, ctx.api);
        } catch (erreur) {
          visuel.appendChild(
            creer("p", { classe: "m-sim-note", texte: "Le visuel de correction n'a pas pu être construit." })
          );
        }
      }
      rendreMaths(ctx, correction);
      revelerEtapes(ctx, etapes);
    },
    reinitialiser() {
      correction.hidden = true;
      verdict.hidden = true;
      delete verdict.dataset.etat;
      verdict.textContent = "";
      boutonValider.disabled = false;
      oublierExercice(ctx, id);
      signalerExercice(ctx, id, { tente: false, juste: false });
    },
  };

  boutonCorrection.addEventListener("click", () => {
    const deja = ctx.registre.exercices.get(id);
    controle.afficherCorrection();
    if (!deja || !deja.tente) {
      signalerExercice(ctx, id, { tente: true, juste: false, revelee: true });
      memoriserExercice(ctx, id, { revelee: true });
    }
  });

  boutonRaz.addEventListener("click", () => {
    controle.reinitialiser();
    if (typeof controle.surReinitialisation === "function") controle.surReinitialisation();
  });

  signalerExercice(ctx, id, { tente: false, juste: false });
  rendreMaths(ctx, bloc);
  return controle;
}

/** Enchaîne validation, verdict, correction et mémorisation pour un exercice. */
function brancherValidation(ctx, controle, def, verifier, reponseCourante) {
  controle.boutonValider.addEventListener("click", () => {
    const resultat = verifier();
    if (!resultat) return;
    controle.definirVerdict(resultat.etat, resultat.message);
    controle.afficherCorrection();
    signalerExercice(ctx, controle.id, { tente: true, juste: resultat.etat === "juste" });
    memoriserExercice(ctx, controle.id, {
      reponse: typeof reponseCourante === "function" ? reponseCourante() : null,
      etat: resultat.etat,
    });
    if (def.surReponse) {
      try {
        def.surReponse(resultat, ctx.api);
      } catch (erreur) {
        /* le rappel du cours ne doit pas casser la correction */
      }
    }
  });
}

/* --------------------------------------------------------------------------
   Exercice à choix (QCM, choix multiple, vrai ou faux)
   -------------------------------------------------------------------------- */

function exoQcm(ctx, conteneur, def = {}) {
  const controle = cadreExercice(ctx, conteneur, def, "Question à choix");
  if (!controle) return null;

  const options = (def.options || []).map((option, index) =>
    typeof option === "string" ? { texte: option, juste: (def.bonnes || []).includes(index) } : option
  );
  const bonnes = new Set(
    Array.isArray(def.bonnes)
      ? def.bonnes
      : options.map((option, index) => (option.juste ? index : -1)).filter((index) => index >= 0)
  );
  const multiple = def.multiple != null ? Boolean(def.multiple) : bonnes.size > 1;
  const nomGroupe = identifiant("choix");

  const groupe = creer("fieldset", { classe: "m-options" });
  if (def.consigne || multiple) {
    groupe.appendChild(
      creer("legend", {
        texte: def.consigne || "Plusieurs réponses peuvent être exactes.",
      })
    );
  }

  const entrees = [];
  options.forEach((option, index) => {
    const entree = creer("input", {
      attributs: { type: multiple ? "checkbox" : "radio", name: nomGroupe, value: String(index) },
    });
    const etiquette = creer("label", {
      classe: "m-option",
      enfants: [entree, creer("span", { classe: "m-option-texte", html: option.texte || "" })],
    });
    entrees.push(entree);
    groupe.appendChild(etiquette);
  });
  controle.zoneReponse.appendChild(groupe);

  const memoire = lireEtatsExercices(ctx)[controle.id];
  if (memoire && Array.isArray(memoire.reponse)) {
    for (const index of memoire.reponse) if (entrees[index]) entrees[index].checked = true;
  }

  function choix() {
    return entrees.map((entree, index) => (entree.checked ? index : -1)).filter((index) => index >= 0);
  }

  function marquer(selection) {
    entrees.forEach((entree, index) => {
      const etiquette = entree.closest(".m-option");
      if (!etiquette) return;
      if (selection.includes(index)) etiquette.dataset.etat = bonnes.has(index) ? "juste" : "faux";
      else if (bonnes.has(index)) etiquette.dataset.etat = "attendu";
      else delete etiquette.dataset.etat;
      const ancienne = etiquette.querySelector(".m-option-marque");
      if (ancienne) ancienne.remove();
      if (etiquette.dataset.etat) {
        const texte =
          etiquette.dataset.etat === "juste" ? "exact" : etiquette.dataset.etat === "faux" ? "à écarter" : "attendu";
        etiquette.querySelector(".m-option-texte").appendChild(
          creer("span", { classe: "m-option-marque", texte: "[" + texte + "]" })
        );
      }
    });
  }

  brancherValidation(
    ctx,
    controle,
    def,
    () => {
      const selection = choix();
      if (!selection.length) {
        controle.definirVerdict("partiel", "Choisissez au moins une proposition avant de valider.");
        return null;
      }
      marquer(selection);
      const justes = selection.filter((index) => bonnes.has(index)).length;
      const fautes = selection.length - justes;
      if (justes === bonnes.size && fautes === 0) {
        return { etat: "juste", message: def.messageJuste || "Réponse exacte." };
      }
      if (justes > 0 && fautes === 0) {
        return {
          etat: "partiel",
          message:
            "Réponse incomplète : " +
            accord(justes, "proposition exacte", "propositions exactes") +
            " sur " + bonnes.size + ".",
        };
      }
      return { etat: "faux", message: def.messageFaux || "Réponse inexacte. Les propositions attendues sont indiquées." };
    },
    choix
  );

  controle.surReinitialisation = () => {
    for (const entree of entrees) {
      entree.checked = false;
      const etiquette = entree.closest(".m-option");
      if (etiquette) {
        delete etiquette.dataset.etat;
        const marque = etiquette.querySelector(".m-option-marque");
        if (marque) marque.remove();
      }
    }
  };

  return controle;
}

function exoVraiFaux(ctx, conteneur, def = {}) {
  return exoQcm(ctx, conteneur, {
    ...def,
    genre: def.genre || "Vrai ou faux",
    multiple: false,
    consigne: def.consigne || "Une seule réponse.",
    options: [
      { texte: def.libelleVrai || "Vrai", juste: def.reponse === true },
      { texte: def.libelleFaux || "Faux", juste: def.reponse === false },
    ],
    bonnes: undefined,
  });
}

/* --------------------------------------------------------------------------
   Exercice numérique
   -------------------------------------------------------------------------- */

function exoNumerique(ctx, conteneur, def = {}) {
  const controle = cadreExercice(ctx, conteneur, def, "Calcul");
  if (!controle) return null;

  const tolerance = def.tolerance != null ? def.tolerance : 0.02;
  const attendue = Number(def.valeur);
  const unite = def.unite || "";

  const champ = creer("input", {
    attributs: {
      type: "text",
      inputmode: "decimal",
      autocomplete: "off",
      spellcheck: "false",
      "aria-label": def.libelleChamp || "Votre résultat" + (unite ? " en " + unite : ""),
      placeholder: def.exemple || "0,00",
    },
  });
  const cadreChamp = creer("div", {
    classe: "m-champ",
    enfants: [champ, unite ? creer("span", { classe: "m-unite", texte: unite }) : null],
  });
  const saisie = creer("div", {
    classe: "m-saisie",
    enfants: [
      creer("label", { html: def.libelleChamp || "Résultat" }),
      cadreChamp,
      creer("span", {
        classe: "m-curseur-valeur",
        texte: "tolérance " + formater(tolerance * 100, 1) + " %",
      }),
    ],
  });
  saisie.querySelector("label").setAttribute("for", champ.id || (champ.id = identifiant("champ")));
  controle.zoneReponse.appendChild(saisie);

  const memoire = lireEtatsExercices(ctx)[controle.id];
  if (memoire && memoire.reponse != null) champ.value = String(memoire.reponse);

  champ.addEventListener("keydown", (evenement) => {
    if (evenement.key === "Enter") {
      evenement.preventDefault();
      controle.boutonValider.click();
    }
  });

  brancherValidation(
    ctx,
    controle,
    def,
    () => {
      const valeur = lireNombre(champ.value);
      if (!Number.isFinite(valeur)) {
        controle.definirVerdict("partiel", "Saisissez un nombre, par exemple 12,5 ou 1.25e3.");
        return null;
      }
      const ecart = Math.abs(valeur - attendue);
      const seuil = Math.abs(attendue) > 1e-12 ? Math.abs(attendue) * tolerance : Math.max(tolerance, 1e-9);
      const relatif = Math.abs(attendue) > 1e-12 ? (ecart / Math.abs(attendue)) * 100 : ecart;
      const valeurLisible = formater(attendue, def.chiffres) + (unite ? " " + unite : "");
      if (ecart <= seuil) {
        return {
          etat: "juste",
          message:
            "Exact. Valeur attendue " +
            valeurLisible +
            " (écart " +
            formater(relatif, 2) +
            " %).",
        };
      }
      const sens = valeur > attendue ? "trop grand" : "trop petit";
      return {
        etat: "faux",
        message:
          "Résultat " +
          sens +
          " de " +
          formater(relatif, 1) +
          " %. Valeur attendue " +
          valeurLisible +
          ".",
      };
    },
    () => champ.value
  );

  controle.surReinitialisation = () => {
    champ.value = "";
    champ.focus();
  };

  return controle;
}

/* --------------------------------------------------------------------------
   Exercice à réponse courte, jugé sur des mots-clés
   -------------------------------------------------------------------------- */

function exoReponseCourte(ctx, conteneur, def = {}) {
  const controle = cadreExercice(ctx, conteneur, def, "Réponse courte");
  if (!controle) return null;

  const groupes = (def.motsCles || []).map((entree) => (Array.isArray(entree) ? entree : [entree]));
  const minimum = def.minimum != null ? Math.min(def.minimum, groupes.length) : groupes.length;

  const zone = creer("textarea", {
    attributs: {
      rows: "3",
      spellcheck: "true",
      "aria-label": def.libelleChamp || "Votre réponse",
      placeholder: def.exemple || "Rédigez en une ou deux phrases.",
    },
  });
  const cadreChamp = creer("div", { classe: "m-champ m-champ-large", enfants: [zone] });
  controle.zoneReponse.appendChild(
    creer("div", { classe: "m-saisie", enfants: [cadreChamp] })
  );

  const bilan = creer("ul", { classe: "m-resultat-detail" });
  controle.correction.insertBefore(bilan, controle.visuel);

  const memoire = lireEtatsExercices(ctx)[controle.id];
  if (memoire && typeof memoire.reponse === "string") zone.value = memoire.reponse;

  function evaluer(texte) {
    const normalise = normaliser(texte);
    return groupes.map((synonymes) => ({
      synonymes,
      trouve: synonymes.some((mot) => normalise.includes(normaliser(mot))),
    }));
  }

  brancherValidation(
    ctx,
    controle,
    def,
    () => {
      if (!zone.value.trim()) {
        controle.definirVerdict("partiel", "Rédigez une réponse avant de valider.");
        return null;
      }
      const details = evaluer(zone.value);
      const trouves = details.filter((detail) => detail.trouve).length;

      bilan.textContent = "";
      details.forEach((detail, index) => {
        bilan.appendChild(
          creer("li", {
            attributs: { "data-etat": detail.trouve ? "juste" : "faux" },
            enfants: [
              creer("span", { classe: "rang", texte: String(index + 1).padStart(2, "0") }),
              creer("span", { html: detail.synonymes.join(" ou ") }),
              creer("span", { classe: "marque", texte: detail.trouve ? "présent" : "absent" }),
            ],
          })
        );
      });

      if (trouves >= minimum) {
        return {
          etat: "juste",
          message: "Les notions attendues sont présentes (" + trouves + " sur " + groupes.length + ").",
        };
      }
      if (trouves > 0) {
        return {
          etat: "partiel",
          message:
            "Réponse partielle : " +
            accord(trouves, "notion reconnue", "notions reconnues") +
            " sur " + groupes.length + ", " +
            accord(minimum, "attendue", "attendues") + ".",
        };
      }
      return { etat: "faux", message: "Aucune des notions attendues n'a été reconnue." };
    },
    () => zone.value
  );

  controle.surReinitialisation = () => {
    zone.value = "";
    bilan.textContent = "";
    zone.focus();
  };

  return controle;
}

/* --------------------------------------------------------------------------
   Exercice d'interprétation de schéma : clic sur des zones d'un SVG
   -------------------------------------------------------------------------- */

const SVG_NS = "http://www.w3.org/2000/svg";

/** Étiquette de zone posée sur un fond discret, pour rester lisible au-dessus d'un schéma. */
function etiquetteZone(texte, x, y) {
  const groupe = document.createElementNS(SVG_NS, "g");
  const largeur = String(texte).length * 6.4 + 10;
  const fond = document.createElementNS(SVG_NS, "rect");
  fond.setAttribute("x", String(x - largeur / 2));
  fond.setAttribute("y", String(y - 11));
  fond.setAttribute("width", String(largeur));
  fond.setAttribute("height", "16");
  fond.setAttribute("rx", "4");
  fond.setAttribute("class", "m-zone-etiquette-fond");
  const libelle = document.createElementNS(SVG_NS, "text");
  libelle.setAttribute("class", "m-zone-etiquette");
  libelle.setAttribute("text-anchor", "middle");
  libelle.setAttribute("x", String(x));
  libelle.setAttribute("y", String(y));
  libelle.textContent = texte;
  groupe.append(fond, libelle);
  return groupe;
}

function exoSchema(ctx, conteneur, def = {}) {
  const controle = cadreExercice(ctx, conteneur, def, "Lecture de schéma");
  if (!controle) return null;

  const zones = def.zones || [];
  const bonnes = new Set(zones.map((zone, index) => (zone.juste ? index : -1)).filter((index) => index >= 0));
  const multiple = def.multiple != null ? Boolean(def.multiple) : bonnes.size > 1;

  const cadre = creer("div", { classe: "m-schema" });
  if (def.consigne) cadre.appendChild(creer("p", { classe: "m-schema-consigne", html: def.consigne }));

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", def.viewBox || "0 0 600 300");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", def.description || "Schéma à interpréter");
  if (def.dessin) {
    const fond = document.createElementNS(SVG_NS, "g");
    fond.setAttribute("class", "m-schema-fond");
    fond.innerHTML = String(def.dessin).replace(/<script[\s\S]*?<\/script>/gi, "");
    svg.appendChild(fond);
  }

  const selection = new Set();
  const groupesZones = [];

  zones.forEach((zone, index) => {
    const groupe = document.createElementNS(SVG_NS, "g");
    groupe.setAttribute("class", "m-zone");
    groupe.setAttribute("tabindex", "0");
    groupe.setAttribute("role", multiple ? "checkbox" : "radio");
    groupe.setAttribute("aria-checked", "false");
    groupe.setAttribute("aria-label", zone.etiquette || "Zone " + (index + 1));

    let forme;
    if (zone.forme === "cercle" || zone.r != null) {
      forme = document.createElementNS(SVG_NS, "circle");
      forme.setAttribute("cx", zone.cx);
      forme.setAttribute("cy", zone.cy);
      forme.setAttribute("r", zone.r);
    } else if (zone.points) {
      forme = document.createElementNS(SVG_NS, "polygon");
      forme.setAttribute("points", zone.points);
    } else {
      forme = document.createElementNS(SVG_NS, "rect");
      forme.setAttribute("x", zone.x);
      forme.setAttribute("y", zone.y);
      forme.setAttribute("width", zone.largeur != null ? zone.largeur : zone.w);
      forme.setAttribute("height", zone.hauteur != null ? zone.hauteur : zone.h);
      forme.setAttribute("rx", zone.rx != null ? zone.rx : 8);
    }
    forme.setAttribute("class", "m-zone-fond");
    groupe.appendChild(forme);

    if (zone.etiquette) {
      const cx = zone.r != null ? Number(zone.cx) : Number(zone.x) + Number(zone.largeur != null ? zone.largeur : zone.w) / 2;
      const cy = zone.r != null ? Number(zone.cy) + Number(zone.r) + 16 : Number(zone.y) - 8;
      groupe.appendChild(etiquetteZone(zone.etiquette, Number.isFinite(cx) ? cx : 20, Number.isFinite(cy) ? cy : 20));
    }

    function basculer() {
      if (!multiple) {
        selection.clear();
        for (const autre of groupesZones) {
          delete autre.dataset.etat;
          autre.setAttribute("aria-checked", "false");
        }
        selection.add(index);
      } else if (selection.has(index)) {
        selection.delete(index);
      } else {
        selection.add(index);
      }
      const choisi = selection.has(index);
      groupe.setAttribute("aria-checked", choisi ? "true" : "false");
      if (choisi) groupe.dataset.etat = "choisi";
      else delete groupe.dataset.etat;
    }

    groupe.addEventListener("click", basculer);
    groupe.addEventListener("keydown", (evenement) => {
      if (evenement.key === "Enter" || evenement.key === " ") {
        evenement.preventDefault();
        basculer();
      }
    });

    groupesZones.push(groupe);
    svg.appendChild(groupe);
  });

  cadre.appendChild(svg);
  controle.zoneReponse.appendChild(cadre);

  function animerCorrection() {
    groupesZones.forEach((groupe, index) => {
      if (selection.has(index)) groupe.dataset.etat = bonnes.has(index) ? "juste" : "faux";
      else if (bonnes.has(index)) groupe.dataset.etat = "juste";
      else delete groupe.dataset.etat;
    });
    const attendus = groupesZones.filter((groupe, index) => bonnes.has(index));
    if (ctx.gsap && !ctx.mouvementReduit && attendus.length) {
      ctx.gsap.fromTo(
        attendus,
        { opacity: 0.25 },
        { opacity: 1, duration: 0.45, stagger: 0.14, ease: "power2.out", repeat: 1, yoyo: true }
      );
    }
  }

  brancherValidation(
    ctx,
    controle,
    def,
    () => {
      if (!selection.size) {
        controle.definirVerdict("partiel", "Sélectionnez une zone du schéma avant de valider.");
        return null;
      }
      animerCorrection();
      const choix = Array.from(selection);
      const justes = choix.filter((index) => bonnes.has(index)).length;
      const fautes = choix.length - justes;
      if (justes === bonnes.size && fautes === 0) return { etat: "juste", message: "Zone correctement identifiée." };
      if (justes > 0 && fautes === 0) {
        return { etat: "partiel", message: "Il manque " + accord(bonnes.size - justes, "zone") + "." };
      }
      return { etat: "faux", message: "Zone inexacte. Les zones attendues sont surlignées." };
    },
    () => Array.from(selection)
  );

  controle.surReinitialisation = () => {
    selection.clear();
    for (const groupe of groupesZones) {
      delete groupe.dataset.etat;
      groupe.setAttribute("aria-checked", "false");
    }
  };

  return controle;
}

/* --------------------------------------------------------------------------
   Comparateurs partagés par le quiz
   -------------------------------------------------------------------------- */

function comparerChoix(selection, bonnes) {
  const justes = selection.filter((index) => bonnes.has(index)).length;
  const fautes = selection.length - justes;
  if (justes === bonnes.size && fautes === 0) return { etat: "juste", justes, fautes };
  if (justes > 0 && fautes === 0) return { etat: "partiel", justes, fautes };
  return { etat: "faux", justes, fautes };
}

function comparerNombre(valeur, attendue, tolerance) {
  if (!Number.isFinite(valeur)) return { etat: "vide", relatif: NaN };
  const ecart = Math.abs(valeur - attendue);
  const seuil = Math.abs(attendue) > 1e-12 ? Math.abs(attendue) * tolerance : Math.max(tolerance, 1e-9);
  const relatif = Math.abs(attendue) > 1e-12 ? (ecart / Math.abs(attendue)) * 100 : ecart;
  return { etat: ecart <= seuil ? "juste" : "faux", relatif };
}

function comparerMots(texte, groupes, minimum) {
  const normalise = normaliser(texte);
  const details = groupes.map((synonymes) => ({
    synonymes,
    trouve: synonymes.some((mot) => normalise.includes(normaliser(mot))),
  }));
  const trouves = details.filter((detail) => detail.trouve).length;
  const requis = minimum != null ? Math.min(minimum, groupes.length) : groupes.length;
  return { etat: trouves >= requis ? "juste" : trouves > 0 ? "partiel" : "faux", trouves, details };
}

/* --------------------------------------------------------------------------
   Quiz de fin de séance
   -------------------------------------------------------------------------- */

const GENRES_QUIZ = {
  qcm: "Choix multiple",
  choix: "Choix multiple",
  vraiFaux: "Vrai ou faux",
  courte: "Réponse courte",
  calcul: "Calcul rapide",
  schema: "Interprétation de schéma",
};

/** Construit la zone de réponse d'une question de quiz selon son type. */
function zoneQuestionQuiz(ctx, question) {
  const type = question.type || "qcm";

  if (type === "courte") {
    const zone = creer("textarea", {
      attributs: { rows: "3", "aria-label": "Votre réponse", placeholder: "Une ou deux phrases suffisent." },
    });
    const element = creer("div", {
      classe: "m-saisie",
      enfants: [creer("div", { classe: "m-champ m-champ-large", enfants: [zone] })],
    });
    const groupes = (question.motsCles || []).map((entree) => (Array.isArray(entree) ? entree : [entree]));
    return {
      element,
      focus: () => zone.focus(),
      verifier() {
        if (!zone.value.trim()) return { etat: "vide" };
        const bilan = comparerMots(zone.value, groupes, question.minimum);
        zone.disabled = true;
        return {
          etat: bilan.etat === "partiel" ? "faux" : bilan.etat,
          detail: accord(bilan.trouves, "notion reconnue", "notions reconnues") + " sur " + groupes.length + ".",
        };
      },
    };
  }

  if (type === "calcul") {
    const champ = creer("input", {
      attributs: { type: "text", inputmode: "decimal", autocomplete: "off", "aria-label": "Votre résultat" },
    });
    const element = creer("div", {
      classe: "m-saisie",
      enfants: [
        creer("div", {
          classe: "m-champ",
          enfants: [champ, question.unite ? creer("span", { classe: "m-unite", texte: question.unite }) : null],
        }),
      ],
    });
    const tolerance = question.tolerance != null ? question.tolerance : 0.02;
    return {
      element,
      focus: () => champ.focus(),
      verifier() {
        const valeur = lireNombre(champ.value);
        if (!Number.isFinite(valeur)) return { etat: "vide" };
        const bilan = comparerNombre(valeur, Number(question.valeur), tolerance);
        champ.disabled = true;
        return {
          etat: bilan.etat,
          detail:
            "Valeur attendue " +
            formater(Number(question.valeur), question.chiffres) +
            (question.unite ? " " + question.unite : "") +
            ".",
        };
      },
    };
  }

  if (type === "schema") {
    const conteneur = creer("div", { classe: "m-schema" });
    if (question.consigne) conteneur.appendChild(creer("p", { classe: "m-schema-consigne", html: question.consigne }));
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", question.viewBox || "0 0 600 260");
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", question.description || "Schéma de la question");
    if (question.dessin) {
      const fond = document.createElementNS(SVG_NS, "g");
      fond.innerHTML = String(question.dessin).replace(/<script[\s\S]*?<\/script>/gi, "");
      svg.appendChild(fond);
    }
    const zones = question.zones || [];
    const bonnes = new Set(zones.map((zone, index) => (zone.juste ? index : -1)).filter((index) => index >= 0));
    let choisi = -1;
    const groupes = [];
    zones.forEach((zone, index) => {
      const groupe = document.createElementNS(SVG_NS, "g");
      groupe.setAttribute("class", "m-zone");
      groupe.setAttribute("tabindex", "0");
      groupe.setAttribute("role", "radio");
      groupe.setAttribute("aria-checked", "false");
      groupe.setAttribute("aria-label", zone.etiquette || "Zone " + (index + 1));
      const forme = document.createElementNS(SVG_NS, zone.r != null ? "circle" : "rect");
      if (zone.r != null) {
        forme.setAttribute("cx", zone.cx);
        forme.setAttribute("cy", zone.cy);
        forme.setAttribute("r", zone.r);
      } else {
        forme.setAttribute("x", zone.x);
        forme.setAttribute("y", zone.y);
        forme.setAttribute("width", zone.largeur != null ? zone.largeur : zone.w);
        forme.setAttribute("height", zone.hauteur != null ? zone.hauteur : zone.h);
        forme.setAttribute("rx", "8");
      }
      forme.setAttribute("class", "m-zone-fond");
      groupe.appendChild(forme);
      if (zone.etiquette) {
        const cx = zone.r != null ? Number(zone.cx) : Number(zone.x) + Number(zone.largeur != null ? zone.largeur : zone.w) / 2;
        const cy = zone.r != null ? Number(zone.cy) + Number(zone.r) + 16 : Number(zone.y) - 8;
        groupe.appendChild(etiquetteZone(zone.etiquette, cx, cy));
      }
      function selectionner() {
        choisi = index;
        groupes.forEach((autre, rang) => {
          autre.setAttribute("aria-checked", rang === index ? "true" : "false");
          if (rang === index) autre.dataset.etat = "choisi";
          else delete autre.dataset.etat;
        });
      }
      groupe.addEventListener("click", selectionner);
      groupe.addEventListener("keydown", (evenement) => {
        if (evenement.key === "Enter" || evenement.key === " ") {
          evenement.preventDefault();
          selectionner();
        }
      });
      groupes.push(groupe);
      svg.appendChild(groupe);
    });
    conteneur.appendChild(svg);
    return {
      element: conteneur,
      verifier() {
        if (choisi < 0) return { etat: "vide" };
        groupes.forEach((groupe, index) => {
          if (index === choisi) groupe.dataset.etat = bonnes.has(index) ? "juste" : "faux";
          else if (bonnes.has(index)) groupe.dataset.etat = "juste";
        });
        return { etat: bonnes.has(choisi) ? "juste" : "faux" };
      },
    };
  }

  /* Choix multiple et vrai ou faux */
  const options =
    type === "vraiFaux"
      ? [
          { texte: "Vrai", juste: question.reponse === true },
          { texte: "Faux", juste: question.reponse === false },
        ]
      : (question.options || []).map((option, index) =>
          typeof option === "string" ? { texte: option, juste: (question.bonnes || []).includes(index) } : option
        );
  const bonnes = new Set(
    Array.isArray(question.bonnes) && type !== "vraiFaux"
      ? question.bonnes
      : options.map((option, index) => (option.juste ? index : -1)).filter((index) => index >= 0)
  );
  const multiple = question.multiple != null ? Boolean(question.multiple) : bonnes.size > 1;
  const nomGroupe = identifiant("quiz");
  const groupe = creer("fieldset", { classe: "m-options" });
  if (multiple) groupe.appendChild(creer("legend", { texte: "Plusieurs réponses peuvent être exactes." }));
  const entrees = [];
  options.forEach((option, index) => {
    const entree = creer("input", {
      attributs: { type: multiple ? "checkbox" : "radio", name: nomGroupe, value: String(index) },
    });
    entrees.push(entree);
    groupe.appendChild(
      creer("label", {
        classe: "m-option",
        enfants: [entree, creer("span", { classe: "m-option-texte", html: option.texte || "" })],
      })
    );
  });

  return {
    element: groupe,
    verifier() {
      const selection = entrees.map((entree, index) => (entree.checked ? index : -1)).filter((index) => index >= 0);
      if (!selection.length) return { etat: "vide" };
      const bilan = comparerChoix(selection, bonnes);
      entrees.forEach((entree, index) => {
        entree.disabled = true;
        const etiquette = entree.closest(".m-option");
        if (!etiquette) return;
        if (selection.includes(index)) etiquette.dataset.etat = bonnes.has(index) ? "juste" : "faux";
        else if (bonnes.has(index)) etiquette.dataset.etat = "attendu";
      });
      return { etat: bilan.etat === "partiel" ? "faux" : bilan.etat };
    },
  };
}

function construireQuiz(ctx, conteneur, questions, options = {}) {
  const cible = resoudre(conteneur, ctx.racine instanceof Element ? ctx.racine : document);
  if (!cible || !Array.isArray(questions) || !questions.length) return null;

  const total = questions.length;
  const resultats = [];
  let index = 0;

  const piste = creer("span");
  const compte = creer("span", { classe: "m-quiz-compte" });
  const barre = creer("div", {
    classe: "m-quiz-barre",
    enfants: [creer("div", { classe: "m-quiz-piste", enfants: [piste] }), compte],
  });
  const scene = creer("div", { classe: "m-quiz-question" });
  const boutonValider = creer("button", { classe: "m-bouton", attributs: { type: "button" }, texte: "Valider" });
  const boutonSuivant = creer("button", {
    classe: "m-bouton secondaire",
    attributs: { type: "button", hidden: true },
    texte: "Question suivante",
  });
  boutonSuivant.appendChild(icone("fleche"));
  const pied = creer("div", { classe: "m-quiz-pied", enfants: [boutonValider, boutonSuivant] });

  const bloc = creer("section", {
    classe: "m-bloc m-quiz",
    enfants: [
      creer("header", {
        classe: "m-bloc-tete",
        enfants: [
          genreAvecIcone("Quiz"),
          creer("span", { classe: "m-bloc-titre", texte: options.titre || "Quiz de fin de séance" }),
          creer("span", { classe: "pastille", texte: total + " questions" }),
        ],
      }),
      creer("div", { classe: "m-bloc-corps", enfants: [barre, scene, pied] }),
    ],
  });
  cible.appendChild(bloc);

  const dernier = lireStockage(ctx, "quiz", null);
  if (dernier && Number.isFinite(dernier.score)) {
    bloc.querySelector(".m-bloc-tete").appendChild(
      creer("span", {
        classe: "pastille pastille-accent",
        texte: "dernier score " + dernier.score + " sur " + dernier.total,
      })
    );
  }

  let zoneCourante = null;

  function majBarre() {
    const avance = (index / total) * 100;
    piste.style.width = avance + "%";
    compte.textContent = "Question " + Math.min(index + 1, total) + " sur " + total;
  }

  function afficherQuestion() {
    const question = questions[index];
    scene.textContent = "";
    boutonValider.hidden = false;
    boutonValider.disabled = false;
    boutonSuivant.hidden = true;

    const entete = creer("div", {
      classe: "m-bloc-tete",
      attributs: { style: "background:transparent;border:0;padding:0 0 0.6rem" },
      enfants: [creer("span", { classe: "m-bloc-genre", texte: GENRES_QUIZ[question.type || "qcm"] || "Question" })],
    });
    const enonce = creer("div", { classe: "m-enonce", html: question.enonce || "" });
    zoneCourante = zoneQuestionQuiz(ctx, question);
    scene.append(entete, enonce, zoneCourante.element);
    rendreMaths(ctx, scene);
    majBarre();
    if (ctx.gsap && !ctx.mouvementReduit) {
      ctx.gsap.fromTo(scene, { opacity: 0, x: 18 }, { opacity: 1, x: 0, duration: 0.32, ease: "power2.out" });
    }
    if (typeof zoneCourante.focus === "function") zoneCourante.focus();
  }

  function afficherBilan() {
    const score = resultats.filter((resultat) => resultat.etat === "juste").length;
    piste.style.width = "100%";
    compte.textContent = "Terminé";
    scene.textContent = "";
    boutonValider.hidden = true;
    boutonSuivant.hidden = true;

    const appreciation =
      score === total
        ? "Maîtrise complète sur cette séance."
        : score >= Math.ceil(total * 0.8)
        ? "Bonne maîtrise, quelques points à consolider."
        : score >= Math.ceil(total * 0.5)
        ? "Notions en place, la mise en oeuvre reste à affermir."
        : "Reprenez les sections concernées avant de passer à la suite.";

    const detail = creer("ul", { classe: "m-resultat-detail" });
    resultats.forEach((resultat, rang) => {
      detail.appendChild(
        creer("li", {
          attributs: { "data-etat": resultat.etat },
          enfants: [
            creer("span", { classe: "rang", texte: String(rang + 1).padStart(2, "0") }),
            creer("span", {
              enfants: [
                creer("span", { html: resultat.resume }),
                resultat.explication
                  ? creer("span", { classe: "m-etape-note", html: resultat.explication })
                  : null,
              ],
            }),
            creer("span", { classe: "marque", texte: resultat.etat === "juste" ? "exact" : "revoir" }),
          ],
        })
      );
    });

    const reprise = creer("button", {
      classe: "m-bouton secondaire",
      attributs: { type: "button" },
      texte: "Recommencer le quiz",
    });
    reprise.prepend(icone("retour"));
    reprise.addEventListener("click", () => {
      index = 0;
      resultats.length = 0;
      afficherQuestion();
    });

    const bilan = creer("div", {
      classe: "m-resultat",
      enfants: [
        creer("div", {
          classe: "m-resultat-score",
          enfants: [
            creer("strong", { texte: String(score) }),
            creer("span", { texte: "sur " + total + " bonnes réponses" }),
          ],
        }),
        creer("p", { texte: appreciation }),
        detail,
        reprise,
      ],
    });
    scene.appendChild(bilan);
    rendreMaths(ctx, scene);

    signalerQuiz(ctx, score, total);
    ecrireStockage(ctx, "quiz", { score, total, date: new Date().toISOString().slice(0, 10) });

    if (ctx.gsap && !ctx.mouvementReduit) {
      const compteur = { valeur: 0 };
      const cible = bilan.querySelector(".m-resultat-score strong");
      ctx.gsap.to(compteur, {
        valeur: score,
        duration: 0.9,
        ease: "power2.out",
        onUpdate() {
          cible.textContent = String(Math.round(compteur.valeur));
        },
      });
      ctx.gsap.fromTo(
        detail.children,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.3, stagger: 0.06, ease: "power2.out" }
      );
    }
  }

  boutonValider.addEventListener("click", () => {
    if (!zoneCourante) return;
    const resultat = zoneCourante.verifier();
    if (resultat.etat === "vide") {
      const avis = creer("p", { classe: "m-verdict", attributs: { "data-etat": "partiel" } });
      avis.appendChild(creer("span", { texte: "Répondez avant de valider." }));
      const ancien = scene.querySelector(".m-verdict");
      if (ancien) ancien.remove();
      scene.appendChild(avis);
      return;
    }
    const question = questions[index];
    const ancien = scene.querySelector(".m-verdict");
    if (ancien) ancien.remove();

    const verdict = creer("p", { classe: "m-verdict", attributs: { "data-etat": resultat.etat, role: "status" } });
    verdict.appendChild(icone(resultat.etat === "juste" ? "juste" : "faux"));
    verdict.appendChild(
      creer("span", {
        html:
          (resultat.etat === "juste" ? "Exact. " : "Inexact. ") +
          (resultat.detail ? resultat.detail + " " : "") +
          (question.explication || ""),
      })
    );
    scene.appendChild(verdict);
    rendreMaths(ctx, verdict);

    resultats.push({
      etat: resultat.etat,
      resume: question.resume || String(question.enonce || "").replace(/<[^>]*>/g, "").slice(0, 110),
      explication: question.explication || "",
    });

    boutonValider.disabled = true;
    boutonSuivant.hidden = false;
    boutonSuivant.textContent = index + 1 >= total ? "Voir le bilan" : "Question suivante";
    boutonSuivant.appendChild(icone("fleche"));
    boutonSuivant.focus();
  });

  boutonSuivant.addEventListener("click", () => {
    index += 1;
    if (index >= total) afficherBilan();
    else afficherQuestion();
  });

  afficherQuestion();
  return {
    bloc,
    detruire() {
      bloc.remove();
    },
  };
}

/* --------------------------------------------------------------------------
   Cartes question-réponse
   -------------------------------------------------------------------------- */

function construireCartes(ctx, conteneur, cartes, options = {}) {
  const cible = resoudre(conteneur, ctx.racine instanceof Element ? ctx.racine : document);
  if (!cible || !Array.isArray(cartes) || !cartes.length) return null;

  const grille = creer("div", { classe: "m-cartes-grille" });
  const compteur = creer("span", { classe: "m-quiz-compte" });
  const boutonTout = creer("button", {
    classe: "m-bouton secondaire",
    attributs: { type: "button" },
    texte: "Tout retourner",
  });
  const boutonMelange = creer("button", {
    classe: "m-bouton discret",
    attributs: { type: "button" },
    texte: "Mélanger",
  });
  boutonMelange.prepend(icone("melange"));
  const outils = creer("div", { classe: "m-cartes-outils", enfants: [boutonTout, boutonMelange, compteur] });

  const bloc = creer("section", {
    classe: "m-bloc m-cartes",
    enfants: [
      creer("header", {
        classe: "m-bloc-tete",
        enfants: [
          genreAvecIcone("Mémorisation"),
          creer("span", { classe: "m-bloc-titre", texte: options.titre || "Cartes question-réponse" }),
          creer("span", { classe: "pastille", texte: cartes.length + " cartes" }),
        ],
      }),
      creer("div", { classe: "m-bloc-corps", enfants: [grille, outils] }),
    ],
  });
  cible.appendChild(bloc);

  const vues = new Set();
  let boutons = [];

  function majCompteur() {
    compteur.textContent = accord(vues.size, "carte retournée", "cartes retournées") + " sur " + cartes.length;
  }

  function construire(liste) {
    grille.textContent = "";
    boutons = [];
    liste.forEach((carte, index) => {
      const donnees = typeof carte === "string" ? { question: carte, reponse: "" } : carte;
      const recto = creer("div", {
        classe: "m-carte-face recto",
        enfants: [
          creer("span", { classe: "m-carte-genre", texte: donnees.categorie || "Question" }),
          creer("span", { classe: "m-carte-texte", html: donnees.question || "" }),
          creer("span", { classe: "m-carte-pied", texte: "Cliquez pour voir la réponse" }),
        ],
      });
      const verso = creer("div", {
        classe: "m-carte-face verso",
        enfants: [
          creer("span", { classe: "m-carte-genre", texte: "Réponse" }),
          creer("span", { classe: "m-carte-texte", html: donnees.reponse || "" }),
          donnees.rappel ? creer("span", { classe: "m-carte-pied", html: donnees.rappel }) : null,
        ],
      });
      const bouton = creer("button", {
        classe: "m-carte",
        attributs: { type: "button", "aria-pressed": "false", "aria-label": "Carte " + (index + 1) },
        enfants: [creer("div", { classe: "m-carte-inte", enfants: [recto, verso] })],
      });
      bouton.addEventListener("click", () => {
        const retournee = bouton.getAttribute("aria-pressed") === "true";
        bouton.setAttribute("aria-pressed", retournee ? "false" : "true");
        if (!retournee) {
          vues.add(donnees.question || index);
          majCompteur();
        }
      });
      boutons.push(bouton);
      grille.appendChild(bouton);
    });
    rendreMaths(ctx, grille);
    majCompteur();
  }

  boutonTout.addEventListener("click", () => {
    const toutesRetournees = boutons.every((bouton) => bouton.getAttribute("aria-pressed") === "true");
    for (const bouton of boutons) bouton.setAttribute("aria-pressed", toutesRetournees ? "false" : "true");
    boutonTout.textContent = toutesRetournees ? "Tout retourner" : "Tout remettre";
    if (!toutesRetournees) {
      for (const carte of cartes) vues.add(typeof carte === "string" ? carte : carte.question);
      majCompteur();
    }
  });

  boutonMelange.addEventListener("click", () => {
    construire(melangerTableau(cartes));
    boutonTout.textContent = "Tout retourner";
  });

  construire(cartes);

  return {
    bloc,
    detruire() {
      bloc.remove();
    },
  };
}

/* --------------------------------------------------------------------------
   Grille d'auto-évaluation
   -------------------------------------------------------------------------- */

const CRITERES_PAR_DEFAUT = [
  { id: "physique", nom: "Compréhension physique", aide: "Expliquer le mécanisme sans formule." },
  { id: "calculs", nom: "Maîtrise des calculs", aide: "Mener le calcul jusqu'au résultat, unités comprises." },
  { id: "schemas", nom: "Lecture de schémas", aide: "Identifier les éléments, les conventions et les sens." },
  { id: "dimensionnement", nom: "Capacité de dimensionnement", aide: "Choisir des valeurs sous contraintes." },
  { id: "diagnostic", nom: "Capacité de diagnostic", aide: "Remonter d'un symptôme à sa cause probable." },
];

function construireAutoEvaluation(ctx, conteneur, criteres, options = {}) {
  const cible = resoudre(conteneur, ctx.racine instanceof Element ? ctx.racine : document);
  if (!cible) return null;

  const liste = (Array.isArray(criteres) && criteres.length ? criteres : CRITERES_PAR_DEFAUT).map((critere, index) =>
    typeof critere === "string" ? { id: "critere-" + index, nom: critere } : critere
  );

  const notes = lireStockage(ctx, "autoevaluation", {}) || {};
  const table = creer("div", { classe: "m-autoeval-table" });
  const entrees = new Map();

  for (const critere of liste) {
    const identifiantCritere = critere.id || normaliser(critere.nom).replace(/\s+/g, "-");
    const echelle = creer("div", { classe: "m-echelle", attributs: { role: "radiogroup", "aria-label": critere.nom } });
    const nomGroupe = identifiant("note");
    for (let note = 0; note <= 4; note += 1) {
      const entreeId = nomGroupe + "-" + note;
      const entree = creer("input", {
        attributs: {
          type: "radio",
          name: nomGroupe,
          id: entreeId,
          value: String(note),
          checked: notes[identifiantCritere] === note,
        },
      });
      entree.addEventListener("change", () => {
        notes[identifiantCritere] = note;
        ecrireStockage(ctx, "autoevaluation", notes);
        majBilan();
      });
      echelle.append(
        entree,
        creer("label", { attributs: { for: entreeId, title: critere.nom + " : niveau " + note }, texte: String(note) })
      );
      entrees.set(identifiantCritere + ":" + note, entree);
    }
    table.appendChild(
      creer("div", {
        classe: "m-critere",
        enfants: [
          creer("span", { classe: "m-critere-nom", texte: critere.nom }),
          echelle,
          critere.aide ? creer("p", { classe: "m-critere-aide", texte: critere.aide }) : null,
        ],
      })
    );
  }

  const caseMoyenne = creer("dd", { texte: "0 sur 4" });
  const jaugeMoyenne = creer("span");
  const caseExercices = creer("dd", { texte: "aucun exercice validé" });
  const caseQuiz = creer("dd", { texte: "quiz non passé" });

  const bilan = creer("dl", {
    classe: "m-autoeval-bilan",
    enfants: [
      creer("div", {
        classe: "m-bilan-case",
        enfants: [
          creer("dt", { texte: "Auto-évaluation moyenne" }),
          caseMoyenne,
          creer("div", { classe: "m-jauge", enfants: [jaugeMoyenne] }),
        ],
      }),
      creer("div", {
        classe: "m-bilan-case",
        enfants: [creer("dt", { texte: "Exercices du cours" }), caseExercices],
      }),
      creer("div", { classe: "m-bilan-case", enfants: [creer("dt", { texte: "Quiz du cours" }), caseQuiz] }),
    ],
  });

  const remise = creer("button", {
    classe: "m-bouton discret",
    attributs: { type: "button" },
    texte: "Effacer mes notes",
  });
  remise.addEventListener("click", () => {
    for (const critere of liste) {
      const identifiantCritere = critere.id || normaliser(critere.nom).replace(/\s+/g, "-");
      delete notes[identifiantCritere];
      for (let note = 0; note <= 4; note += 1) {
        const entree = entrees.get(identifiantCritere + ":" + note);
        if (entree) entree.checked = false;
      }
    }
    effacerStockage(ctx, "autoevaluation");
    majBilan();
  });

  const bloc = creer("section", {
    classe: "m-bloc m-autoeval",
    enfants: [
      creer("header", {
        classe: "m-bloc-tete",
        enfants: [
          genreAvecIcone("Auto-évaluation"),
          creer("span", { classe: "m-bloc-titre", texte: options.titre || "Où en suis-je après cette séance ?" }),
          creer("span", { classe: "pastille", texte: "échelle 0 à 4" }),
        ],
      }),
      creer("div", {
        classe: "m-bloc-corps",
        enfants: [
          creer("p", {
            classe: "m-sim-note",
            texte:
              options.consigne ||
              "0 : notion non acquise. 2 : acquise avec aide. 4 : acquise et réutilisable seul. Vos notes restent dans ce navigateur.",
          }),
          table,
          bilan,
          creer("div", { classe: "m-actions", enfants: [remise] }),
        ],
      }),
    ],
  });
  cible.appendChild(bloc);

  function majBilan(scores) {
    const valeurs = liste
      .map((critere) => notes[critere.id || normaliser(critere.nom).replace(/\s+/g, "-")])
      .filter((valeur) => Number.isFinite(valeur));
    const moyenne = valeurs.length ? valeurs.reduce((somme, valeur) => somme + valeur, 0) / valeurs.length : 0;
    caseMoyenne.textContent = valeurs.length
      ? formater(moyenne, 1) + " sur 4 (" + accord(valeurs.length, "critère noté", "critères notés") + ")"
      : "non renseignée";
    jaugeMoyenne.style.width = (moyenne / 4) * 100 + "%";

    const etat = scores || calculerScores(ctx);
    caseExercices.textContent = etat.exercices.tentes
      ? accord(etat.exercices.justes, "réussi") + " sur " + accord(etat.exercices.tentes, "tenté")
      : "aucun exercice validé";
    caseQuiz.textContent = etat.quiz ? etat.quiz.score + " sur " + etat.quiz.total : "quiz non passé";
  }

  ctx.registre.abonnes.add(majBilan);
  majBilan();
  rendreMaths(ctx, bloc);

  return {
    bloc,
    notes,
    detruire() {
      ctx.registre.abonnes.delete(majBilan);
      bloc.remove();
    },
  };
}

/* --------------------------------------------------------------------------
   Base commune des simulations : toile adaptative, thème, pause hors écran
   -------------------------------------------------------------------------- */

function lireCouleurs() {
  const style = getComputedStyle(document.documentElement);
  const valeur = (nom, secours) => {
    const brut = style.getPropertyValue(nom).trim();
    return brut || secours;
  };
  return {
    fond: valeur("--sim-fond", "#ffffff"),
    grille: valeur("--sim-grille", "rgba(0,0,0,0.1)"),
    axe: valeur("--sim-axe", "rgba(0,0,0,0.45)"),
    texte: valeur("--sim-texte", "#4c5878"),
    accent: valeur("--jaune", "#f3d375"),
    accent2: valeur("--lavande", "#c6c0f7"),
    series: [
      valeur("--serie-1", "#8fd2f5"),
      valeur("--serie-2", "#f3d375"),
      valeur("--serie-3", "#a6ddbe"),
      valeur("--serie-4", "#c6c0f7"),
      valeur("--serie-5", "#f5a58f"),
      valeur("--serie-6", "#9fb0bf"),
    ],
  };
}

/**
 * Résout la couleur d'une série : un nom "serie-3" renvoie vers la palette du
 * thème et suit donc la bascule clair et sombre, une valeur libre est reprise
 * telle quelle, et l'absence de valeur retombe sur le rang dans la palette.
 */
function couleurSerie(valeur, couleurs, rang) {
  if (typeof valeur === "string" && valeur) {
    const correspondance = valeur.match(/^(?:var\(--)?serie-(\d+)\)?$/);
    if (correspondance) {
      const index = (Number(correspondance[1]) - 1 + couleurs.series.length) % couleurs.series.length;
      return couleurs.series[index];
    }
    return valeur;
  }
  return couleurs.series[(rang || 0) % couleurs.series.length];
}

function cadreSimulation(ctx, conteneur, options = {}) {
  const cible = resoudre(conteneur, ctx.racine instanceof Element ? ctx.racine : document);
  if (!cible) return null;

  const reglages = creer("div", { classe: "m-sim-reglages" });
  const cadreToile = creer("div", { classe: "m-toile-cadre" });
  const legende = creer("div", { classe: "m-sim-legende" });
  const mesures = creer("dl", { classe: "m-sim-mesures" });
  const corps = creer("div", { classe: "m-bloc-corps", enfants: [reglages, cadreToile, legende, mesures] });
  if (options.note) corps.appendChild(creer("p", { classe: "m-sim-note", html: options.note }));

  const bloc = creer("section", {
    classe: "m-bloc m-sim",
    enfants: [
      options.titre || options.genre
        ? creer("header", {
            classe: "m-bloc-tete",
            enfants: [
              genreAvecIcone(options.genre || "Simulation"),
              options.titre ? creer("span", { classe: "m-bloc-titre", texte: options.titre }) : null,
            ],
          })
        : null,
      corps,
    ],
  });
  cible.appendChild(bloc);

  const canvas = creer("canvas", { attributs: { role: "img", "aria-label": options.description || options.titre || "Tracé" } });
  cadreToile.appendChild(canvas);
  const c = canvas.getContext("2d");

  const etat = {
    largeur: 600,
    hauteur: 300,
    couleurs: lireCouleurs(),
    visible: true,
    vivant: true,
    temps: 0,
    enMarche: Boolean(options.anime),
  };

  let image = 0;
  let dernierHorodatage = 0;
  let rendreDemande = false;

  function dimensionner() {
    const largeurCss = Math.max(240, cadreToile.clientWidth || 600);
    const ratio = options.ratio != null ? options.ratio : 0.52;
    const hauteurCss = Math.round(
      Math.min(options.hauteurMax || 460, Math.max(options.hauteurMin || 190, largeurCss * ratio))
    );
    const dpr = Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));
    canvas.width = Math.round(largeurCss * dpr);
    canvas.height = Math.round(hauteurCss * dpr);
    canvas.style.height = hauteurCss + "px";
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    etat.largeur = largeurCss;
    etat.hauteur = hauteurCss;
  }

  function peindre(dt) {
    if (!etat.vivant) return;
    c.save();
    c.clearRect(0, 0, etat.largeur, etat.hauteur);
    c.fillStyle = etat.couleurs.fond;
    c.fillRect(0, 0, etat.largeur, etat.hauteur);
    try {
      options.dessiner({
        c,
        largeur: etat.largeur,
        hauteur: etat.hauteur,
        couleurs: etat.couleurs,
        temps: etat.temps,
        dt: dt || 0,
        api: ctx.api,
      });
    } catch (erreur) {
      c.fillStyle = etat.couleurs.texte;
      c.font = "13px " + POLICE_TRACE;
      c.fillText("Tracé indisponible.", 12, 22);
    }
    c.restore();
  }

  function rendre() {
    rendreDemande = false;
    peindre(0);
  }

  function demanderRendu() {
    if (rendreDemande || !etat.vivant) return;
    rendreDemande = true;
    requestAnimationFrame(rendre);
  }

  function boucle(horodatage) {
    if (!etat.vivant) return;
    image = requestAnimationFrame(boucle);
    if (!etat.visible || !etat.enMarche) {
      dernierHorodatage = horodatage;
      return;
    }
    const dt = dernierHorodatage ? Math.min(0.05, (horodatage - dernierHorodatage) / 1000) : 0;
    dernierHorodatage = horodatage;
    etat.temps += dt * (options.vitesse != null ? options.vitesse : 1);
    peindre(dt);
  }

  dimensionner();
  demanderRendu();

  const observateurTaille =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          dimensionner();
          demanderRendu();
        })
      : null;
  if (observateurTaille) observateurTaille.observe(cadreToile);

  const observateurVue =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entrees) => {
            for (const entree of entrees) etat.visible = entree.isIntersecting;
            if (etat.visible) demanderRendu();
          },
          { rootMargin: "120px" }
        )
      : null;
  if (observateurVue) observateurVue.observe(cadreToile);

  function surTheme() {
    etat.couleurs = lireCouleurs();
    demanderRendu();
  }
  document.addEventListener("rne:theme", surTheme);
  const requeteSombre = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  if (requeteSombre && typeof requeteSombre.addEventListener === "function") {
    requeteSombre.addEventListener("change", surTheme);
  }

  if (options.anime && !ctx.mouvementReduit) {
    image = requestAnimationFrame(boucle);
  } else if (options.anime) {
    etat.enMarche = false;
  }

  const controle = {
    bloc,
    canvas,
    contexte: c,
    etat,
    reglages,
    legende,
    mesures,
    demanderRendu,
    couleurs: () => etat.couleurs,
    marche(actif) {
      etat.enMarche = Boolean(actif);
      if (etat.enMarche && !image && etat.vivant) {
        dernierHorodatage = 0;
        image = requestAnimationFrame(boucle);
      }
      return etat.enMarche;
    },
    definirLegende(entrees) {
      legende.textContent = "";
      for (const entree of entrees || []) {
        legende.appendChild(
          creer("span", {
            attributs: { style: "color:" + entree.couleur },
            enfants: [creer("i"), creer("span", { texte: entree.nom, attributs: { style: "color:var(--encre-2)" } })],
          })
        );
      }
    },
    definirMesures(entrees) {
      mesures.textContent = "";
      for (const entree of entrees || []) {
        mesures.appendChild(
          creer("div", {
            classe: "m-mesure",
            enfants: [creer("dt", { texte: entree.nom }), creer("dd", { texte: entree.valeur })],
          })
        );
      }
    },
    detruire() {
      etat.vivant = false;
      etat.enMarche = false;
      if (image) cancelAnimationFrame(image);
      image = 0;
      if (observateurTaille) observateurTaille.disconnect();
      if (observateurVue) observateurVue.disconnect();
      document.removeEventListener("rne:theme", surTheme);
      if (requeteSombre && typeof requeteSombre.removeEventListener === "function") {
        requeteSombre.removeEventListener("change", surTheme);
      }
      bloc.remove();
    },
  };

  enregistrerNettoyeur(ctx, controle.detruire);
  return controle;
}

/* --------------------------------------------------------------------------
   Repères gradués
   -------------------------------------------------------------------------- */

function pasJoli(etendue, nombreCible) {
  if (!Number.isFinite(etendue) || etendue <= 0) return 1;
  const brut = etendue / Math.max(1, nombreCible);
  const exposant = Math.floor(Math.log10(brut));
  const base = brut / Math.pow(10, exposant);
  let facteur = 1;
  let meilleur = Infinity;
  for (const candidat of [1, 2, 2.5, 5, 10]) {
    const distance = Math.abs(Math.log(base / candidat));
    if (distance < meilleur) {
      meilleur = distance;
      facteur = candidat;
    }
  }
  return facteur * Math.pow(10, exposant);
}

function decimalesPour(pas) {
  if (!Number.isFinite(pas) || pas <= 0) return 0;
  if (pas >= 10) return 0;
  if (pas >= 1) return Number.isInteger(pas) ? 0 : 1;
  return Math.min(4, Math.ceil(-Math.log10(pas)));
}

function etiquetteGraduation(valeur, pas) {
  if (Math.abs(valeur) < pas / 1000) return "0";
  const decimales = decimalesPour(pas);
  const abs = Math.abs(valeur);
  if (abs >= 1e5 || (abs > 0 && abs < 1e-3)) return valeur.toExponential(1).replace(".", ",");
  return valeur.toFixed(decimales).replace(".", ",");
}

/**
 * Trace un repère gradué et renvoie les fonctions de conversion valeur vers pixel.
 * options : {xMin, xMax, yMin, yMax, xUnite, yUnite, xTitre, yTitre, logX, grille}
 */
function tracerRepere(c, largeur, hauteur, couleurs, options) {
  const marge = {
    gauche: options.margeGauche != null ? options.margeGauche : 56,
    droite: options.margeDroite != null ? options.margeDroite : 14,
    haut: options.margeHaut != null ? options.margeHaut : 14,
    bas: options.margeBas != null ? options.margeBas : 34,
  };
  const boite = {
    x: marge.gauche,
    y: marge.haut,
    l: Math.max(20, largeur - marge.gauche - marge.droite),
    h: Math.max(20, hauteur - marge.haut - marge.bas),
  };
  const logX = Boolean(options.logX);
  const xMin = options.xMin;
  const xMax = options.xMax;
  const yMin = options.yMin;
  const yMax = options.yMax;

  const versX = logX
    ? (valeur) => {
        const borne = Math.max(valeur, xMin);
        return boite.x + ((Math.log10(borne) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin))) * boite.l;
      }
    : (valeur) => boite.x + ((valeur - xMin) / (xMax - xMin || 1)) * boite.l;
  const versY = (valeur) => boite.y + boite.h - ((valeur - yMin) / (yMax - yMin || 1)) * boite.h;

  c.save();
  c.font = "11px " + (options.police || POLICE_TRACE);
  c.textBaseline = "middle";
  c.lineWidth = 1;

  /* Grille et graduations verticales */
  const pasY = pasJoli(yMax - yMin, options.graduationsY || 5);
  c.strokeStyle = couleurs.grille;
  c.fillStyle = couleurs.texte;
  c.textAlign = "right";
  const departY = Math.ceil(yMin / pasY) * pasY;
  for (let valeur = departY; valeur <= yMax + pasY / 1000; valeur += pasY) {
    const y = Math.round(versY(valeur)) + 0.5;
    c.beginPath();
    c.moveTo(boite.x, y);
    c.lineTo(boite.x + boite.l, y);
    c.stroke();
    c.fillText(etiquetteGraduation(valeur, pasY), boite.x - 7, y);
  }

  /* Graduations horizontales */
  c.textAlign = "center";
  if (logX) {
    const decadeMin = Math.floor(Math.log10(xMin));
    const decadeMax = Math.ceil(Math.log10(xMax));
    for (let decade = decadeMin; decade <= decadeMax; decade += 1) {
      for (let facteur = 1; facteur < 10; facteur += 1) {
        const valeur = facteur * Math.pow(10, decade);
        if (valeur < xMin || valeur > xMax) continue;
        const x = Math.round(versX(valeur)) + 0.5;
        c.strokeStyle = couleurs.grille;
        c.globalAlpha = facteur === 1 ? 1 : 0.45;
        c.beginPath();
        c.moveTo(x, boite.y);
        c.lineTo(x, boite.y + boite.h);
        c.stroke();
        c.globalAlpha = 1;
        if (facteur === 1) {
          const texte = decade >= 0 && decade <= 3 ? String(Math.pow(10, decade)) : "10^" + decade;
          c.fillText(texte, x, boite.y + boite.h + 13);
        }
      }
    }
  } else {
    const pasX = pasJoli(xMax - xMin, options.graduationsX || 6);
    const departX = Math.ceil(xMin / pasX) * pasX;
    for (let valeur = departX; valeur <= xMax + pasX / 1000; valeur += pasX) {
      const x = Math.round(versX(valeur)) + 0.5;
      c.strokeStyle = couleurs.grille;
      c.beginPath();
      c.moveTo(x, boite.y);
      c.lineTo(x, boite.y + boite.h);
      c.stroke();
      c.fillText(etiquetteGraduation(valeur, pasX), x, boite.y + boite.h + 13);
    }
  }

  /* Axes */
  c.strokeStyle = couleurs.axe;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(boite.x, boite.y);
  c.lineTo(boite.x, boite.y + boite.h);
  c.lineTo(boite.x + boite.l, boite.y + boite.h);
  c.stroke();
  if (yMin < 0 && yMax > 0) {
    const zero = Math.round(versY(0)) + 0.5;
    c.beginPath();
    c.moveTo(boite.x, zero);
    c.lineTo(boite.x + boite.l, zero);
    c.stroke();
  }

  /* Titres d'axes */
  c.fillStyle = couleurs.texte;
  c.font = "11px " + (options.police || POLICE_TRACE);
  if (options.xTitre) {
    c.textAlign = "right";
    c.fillText(options.xTitre + (options.xUnite ? " [" + options.xUnite + "]" : ""), boite.x + boite.l, hauteur - 6);
  }
  if (options.yTitre) {
    c.save();
    c.translate(12, boite.y + boite.h / 2);
    c.rotate(-Math.PI / 2);
    c.textAlign = "center";
    c.fillText(options.yTitre + (options.yUnite ? " [" + options.yUnite + "]" : ""), 0, 0);
    c.restore();
  }
  c.restore();

  return { boite, versX, versY };
}

function tracerCourbe(c, points, versX, versY, boite, couleur, epaisseur) {
  if (!points || points.length < 2) return;
  c.save();
  c.beginPath();
  c.rect(boite.x, boite.y - 1, boite.l, boite.h + 2);
  c.clip();
  c.strokeStyle = couleur;
  c.lineWidth = epaisseur || 2;
  c.lineJoin = "round";
  c.lineCap = "round";
  c.beginPath();
  let commence = false;
  for (const point of points) {
    const px = Array.isArray(point) ? point[0] : point.x;
    const py = Array.isArray(point) ? point[1] : point.y;
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      commence = false;
      continue;
    }
    const x = versX(px);
    const y = versY(py);
    if (!commence) {
      c.moveTo(x, y);
      commence = true;
    } else {
      c.lineTo(x, y);
    }
  }
  c.stroke();
  c.restore();
}

/* --------------------------------------------------------------------------
   Curseurs de paramètres
   -------------------------------------------------------------------------- */

function simCurseurs(ctx, conteneur, parametres, rappel) {
  const cible = resoudre(conteneur, ctx.racine instanceof Element ? ctx.racine : document);
  if (!cible || !Array.isArray(parametres)) return null;

  const valeurs = {};
  const affichages = new Map();
  const entrees = new Map();
  const grille = creer("div", { classe: "m-curseurs" });

  function texteValeur(parametre, valeur) {
    if (typeof parametre.format === "function") return parametre.format(valeur);
    const chiffres = parametre.chiffres != null ? parametre.chiffres : undefined;
    return formater(valeur, chiffres) + (parametre.unite ? " " + parametre.unite : "");
  }

  function diffuser() {
    if (typeof rappel === "function") {
      try {
        rappel({ ...valeurs }, controle);
      } catch (erreur) {
        /* le rappel du cours ne doit pas interrompre l'interface */
      }
    }
  }

  for (const parametre of parametres) {
    const id = parametre.id || normaliser(parametre.libelle || "p").replace(/\s+/g, "-");
    const min = Number(parametre.min != null ? parametre.min : 0);
    const max = Number(parametre.max != null ? parametre.max : 1);
    const pas = Number(parametre.pas != null ? parametre.pas : (max - min) / 100);
    const depart = Number(parametre.valeur != null ? parametre.valeur : (min + max) / 2);
    valeurs[id] = depart;

    const entreeId = identifiant("curseur");
    const affichage = creer("span", { classe: "m-curseur-valeur", texte: texteValeur(parametre, depart) });
    const entree = creer("input", {
      attributs: {
        type: "range",
        id: entreeId,
        min: String(min),
        max: String(max),
        step: String(pas),
        value: String(depart),
        "aria-describedby": affichage.id || (affichage.id = identifiant("valeur")),
      },
    });
    entree.addEventListener("input", () => {
      const valeur = Number(entree.value);
      valeurs[id] = valeur;
      affichage.textContent = texteValeur(parametre, valeur);
      diffuser();
    });
    affichages.set(id, { affichage, parametre });
    entrees.set(id, entree);

    grille.appendChild(
      creer("div", {
        classe: "m-curseur",
        enfants: [
          creer("label", {
            classe: "m-curseur-nom",
            attributs: { for: entreeId },
            html: parametre.libelle || id,
          }),
          affichage,
          entree,
        ],
      })
    );
  }

  cible.appendChild(grille);

  const controle = {
    grille,
    valeurs,
    definir(id, valeur) {
      const entree = entrees.get(id);
      if (!entree) return;
      entree.value = String(valeur);
      valeurs[id] = Number(valeur);
      const paire = affichages.get(id);
      if (paire) paire.affichage.textContent = texteValeur(paire.parametre, Number(valeur));
      diffuser();
    },
    detruire() {
      grille.remove();
    },
  };

  enregistrerNettoyeur(ctx, () => grille.remove());
  diffuser();
  return controle;
}

/* --------------------------------------------------------------------------
   Poignée déplaçable dans un schéma SVG

   Un point que l'apprenant saisit à la souris, au doigt ou au clavier. Le
   déplacement est contraint à un cercle, un segment, une courbe ou une zone,
   et chaque déplacement rappelle le cours avec la valeur correspondante.
   -------------------------------------------------------------------------- */

/* Taille minimale de la zone de saisie tactile, en pixels CSS. */
const CIBLE_TACTILE = 44;

function bornerNombre(valeur, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, valeur));
}

function degresNormalises(valeur) {
  return ((Number(valeur) % 360) + 360) % 360;
}

/** Coordonnées utilisateur du SVG correspondant à un point de l'écran. */
function pointDansSvg(svg, clientX, clientY) {
  try {
    if (typeof svg.getScreenCTM === "function" && typeof svg.createSVGPoint === "function") {
      const matrice = svg.getScreenCTM();
      if (matrice) {
        const point = svg.createSVGPoint();
        point.x = clientX;
        point.y = clientY;
        const converti = point.matrixTransform(matrice.inverse());
        return { x: converti.x, y: converti.y };
      }
    }
  } catch (erreur) {
    /* secours ci-dessous */
  }
  const rect = svg.getBoundingClientRect();
  const vue = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width
    ? svg.viewBox.baseVal
    : { x: 0, y: 0, width: rect.width || 1, height: rect.height || 1 };
  return {
    x: vue.x + ((clientX - rect.left) / (rect.width || 1)) * vue.width,
    y: vue.y + ((clientY - rect.top) / (rect.height || 1)) * vue.height,
  };
}

/**
 * Point déplaçable contraint à une géométrie.
 *
 * options : { type, centre, rayon, de, a, points, courbe, boite, valeur,
 *             min, max, pas, boucle, libelle, unite, couleur, rayonPoignee,
 *             format, rappel }
 * Renvoie { set(valeur), get(), detruire(), element }.
 */
function simPoignee(ctx, cible, options = {}) {
  const racine = ctx.racine instanceof Element ? ctx.racine : document;
  const resolu = resoudre(cible, racine);
  if (!resolu) return null;
  const svg =
    resolu.tagName && resolu.tagName.toLowerCase() === "svg" ? resolu : resolu.querySelector ? resolu.querySelector("svg") : null;
  if (!svg) return null;

  const type =
    options.type ||
    (options.centre && options.rayon != null
      ? "cercle"
      : options.de && options.a
        ? "segment"
        : options.points || options.courbe || options.chemin
          ? "courbe"
          : "zone");

  /* Géométrie : convertir un point en valeur, et une valeur en point. */
  let contrainte = null;

  if (type === "cercle") {
    const centre = options.centre || { x: 0, y: 0 };
    const rayon = Number(options.rayon != null ? options.rayon : 100);
    contrainte = {
      min: options.min != null ? Number(options.min) : 0,
      max: options.max != null ? Number(options.max) : 360,
      pas: options.pas != null ? Number(options.pas) : 5,
      boucle: options.boucle !== false,
      depuisPoint(point) {
        return (Math.atan2(centre.y - point.y, point.x - centre.x) * 180) / Math.PI;
      },
      versPoint(valeur) {
        const radians = (valeur * Math.PI) / 180;
        return { x: centre.x + rayon * Math.cos(radians), y: centre.y - rayon * Math.sin(radians) };
      },
      ranger(valeur) {
        return contrainte.boucle ? degresNormalises(valeur) : bornerNombre(valeur, contrainte.min, contrainte.max);
      },
      mesurer(valeur) {
        const radians = (valeur * Math.PI) / 180;
        const point = contrainte.versPoint(valeur);
        return { type, valeur, angle: valeur, radians, x: point.x, y: point.y };
      },
    };
  } else if (type === "segment") {
    const de = options.de || { x: 0, y: 0 };
    const a = options.a || { x: 100, y: 0 };
    const dx = a.x - de.x;
    const dy = a.y - de.y;
    const carre = dx * dx + dy * dy || 1;
    const min = options.min != null ? Number(options.min) : 0;
    const max = options.max != null ? Number(options.max) : 1;
    contrainte = {
      min,
      max,
      pas: options.pas != null ? Number(options.pas) : (max - min) / 100,
      boucle: false,
      depuisPoint(point) {
        const t = bornerNombre(((point.x - de.x) * dx + (point.y - de.y) * dy) / carre, 0, 1);
        return min + t * (max - min);
      },
      versPoint(valeur) {
        const t = (max - min) === 0 ? 0 : (valeur - min) / (max - min);
        return { x: de.x + t * dx, y: de.y + t * dy };
      },
      ranger(valeur) {
        return bornerNombre(valeur, min, max);
      },
      mesurer(valeur) {
        const point = contrainte.versPoint(valeur);
        const t = (max - min) === 0 ? 0 : (valeur - min) / (max - min);
        return { type, valeur, t, x: point.x, y: point.y };
      },
    };
  } else if (type === "courbe") {
    const min = options.min != null ? Number(options.min) : 0;
    const max = options.max != null ? Number(options.max) : 1;
    const nombre = Math.max(24, Number(options.echantillons || 240));
    const chemin = options.chemin ? resoudre(options.chemin, racine) : null;
    let echantillons = [];
    if (Array.isArray(options.points) && options.points.length > 1) {
      echantillons = options.points.map((point, index) => ({
        t: index / (options.points.length - 1),
        x: Number(point.x),
        y: Number(point.y),
      }));
    } else if (typeof options.courbe === "function") {
      for (let i = 0; i <= nombre; i += 1) {
        const t = i / nombre;
        const point = options.courbe(t) || { x: 0, y: 0 };
        echantillons.push({ t, x: Number(point.x), y: Number(point.y) });
      }
    } else if (chemin && typeof chemin.getPointAtLength === "function") {
      const longueur = longueurForme(chemin);
      for (let i = 0; i <= nombre; i += 1) {
        const t = i / nombre;
        const point = chemin.getPointAtLength(t * longueur);
        echantillons.push({ t, x: point.x, y: point.y });
      }
    }
    if (echantillons.length < 2) echantillons = [{ t: 0, x: 0, y: 0 }, { t: 1, x: 1, y: 0 }];
    contrainte = {
      min,
      max,
      pas: options.pas != null ? Number(options.pas) : (max - min) / 100,
      boucle: false,
      depuisPoint(point) {
        let meilleur = echantillons[0];
        let distance = Infinity;
        for (const candidat of echantillons) {
          const d = (candidat.x - point.x) ** 2 + (candidat.y - point.y) ** 2;
          if (d < distance) {
            distance = d;
            meilleur = candidat;
          }
        }
        return min + meilleur.t * (max - min);
      },
      versPoint(valeur) {
        const t = bornerNombre((max - min) === 0 ? 0 : (valeur - min) / (max - min), 0, 1);
        const position = t * (echantillons.length - 1);
        const rang = Math.min(echantillons.length - 2, Math.floor(position));
        const reste = position - rang;
        const un = echantillons[rang];
        const deux = echantillons[rang + 1];
        return { x: un.x + (deux.x - un.x) * reste, y: un.y + (deux.y - un.y) * reste };
      },
      ranger(valeur) {
        return bornerNombre(valeur, min, max);
      },
      mesurer(valeur) {
        const point = contrainte.versPoint(valeur);
        const t = (max - min) === 0 ? 0 : (valeur - min) / (max - min);
        return { type, valeur, t, x: point.x, y: point.y };
      },
    };
  } else {
    const boite = options.boite || { x: 0, y: 0, largeur: 100, hauteur: 100 };
    const xMin = Number(boite.x);
    const yMin = Number(boite.y);
    const xMax = xMin + Number(boite.largeur);
    const yMax = yMin + Number(boite.hauteur);
    contrainte = {
      min: xMin,
      max: xMax,
      pas: options.pas != null ? Number(options.pas) : (xMax - xMin) / 100,
      boucle: false,
      depuisPoint(point) {
        return { x: bornerNombre(point.x, xMin, xMax), y: bornerNombre(point.y, yMin, yMax) };
      },
      versPoint(valeur) {
        return { x: bornerNombre(valeur.x, xMin, xMax), y: bornerNombre(valeur.y, yMin, yMax) };
      },
      ranger(valeur) {
        const point = valeur && typeof valeur === "object" ? valeur : { x: valeur, y: yMin };
        return { x: bornerNombre(Number(point.x), xMin, xMax), y: bornerNombre(Number(point.y), yMin, yMax) };
      },
      mesurer(valeur) {
        const point = contrainte.ranger(valeur);
        return {
          type,
          valeur: point,
          x: point.x,
          y: point.y,
          u: (xMax - xMin) === 0 ? 0 : (point.x - xMin) / (xMax - xMin),
          v: (yMax - yMin) === 0 ? 0 : (point.y - yMin) / (yMax - yMin),
        };
      },
    };
  }

  function formaterAria(valeur) {
    if (valeur && typeof valeur === "object") return Math.round(Number(valeur.x) * 100) / 100;
    return Math.round(Number(valeur) * 100) / 100;
  }

  const rayonPoignee = Number(options.rayonPoignee || 7);
  const groupe = document.createElementNS(SVG_NS, "g");
  groupe.setAttribute("class", "m-poignee");
  groupe.setAttribute("tabindex", "0");
  groupe.setAttribute("role", "slider");
  groupe.setAttribute("aria-label", options.libelle || "Point déplaçable");
  groupe.setAttribute("aria-valuemin", String(formaterAria(contrainte.min)));
  groupe.setAttribute("aria-valuemax", String(formaterAria(contrainte.max)));
  if (options.couleur) groupe.setAttribute("style", "color:" + options.couleur);

  const zoneSaisie = document.createElementNS(SVG_NS, "circle");
  zoneSaisie.setAttribute("class", "m-poignee-cible");
  zoneSaisie.setAttribute("r", String(CIBLE_TACTILE / 2));
  const halo = document.createElementNS(SVG_NS, "circle");
  halo.setAttribute("class", "m-poignee-halo");
  halo.setAttribute("r", String(rayonPoignee + 5));
  const point = document.createElementNS(SVG_NS, "circle");
  point.setAttribute("class", "m-poignee-point");
  point.setAttribute("r", String(rayonPoignee));
  groupe.append(zoneSaisie, halo, point);
  const hote = (options.parent && resoudre(options.parent, racine)) || svg;
  hote.appendChild(groupe);

  /* La zone tactile est dessinée en unités utilisateur : elle suit l'échelle du SVG. */
  function ajusterCible() {
    const rect = svg.getBoundingClientRect();
    const vue = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal.width : rect.width;
    const echelle = rect.width && vue ? rect.width / vue : 1;
    /* Deux pixels de marge : la cible reste au-dessus du minimum malgré les arrondis. */
    const rayonCible = Math.max(rayonPoignee + 4, (CIBLE_TACTILE + 2) / 2 / (echelle || 1));
    zoneSaisie.setAttribute("r", String(rayonCible));
  }

  let valeurCourante = contrainte.ranger(
    options.valeur != null ? options.valeur : type === "zone" ? { x: contrainte.min, y: 0 } : contrainte.min
  );
  let vivant = true;

  function texteValeur(mesure) {
    if (typeof options.format === "function") return options.format(mesure);
    if (type === "cercle") return formater(mesure.angle, 1) + " degrés";
    if (type === "zone") return "x " + formater(mesure.x, 2) + ", y " + formater(mesure.y, 2);
    return formater(mesure.valeur, 2) + (options.unite ? " " + options.unite : "");
  }

  function appliquer(diffuser) {
    const mesure = contrainte.mesurer(valeurCourante);
    const position = { x: mesure.x, y: mesure.y };
    for (const cercle of [zoneSaisie, halo, point]) {
      cercle.setAttribute("cx", String(position.x));
      cercle.setAttribute("cy", String(position.y));
    }
    groupe.setAttribute("aria-valuenow", String(formaterAria(mesure.valeur)));
    groupe.setAttribute("aria-valuetext", texteValeur(mesure));
    if (diffuser !== false && typeof options.rappel === "function") {
      try {
        options.rappel(mesure, controle);
      } catch (erreur) {
        /* le rappel du cours ne doit pas interrompre la manipulation */
      }
    }
    return mesure;
  }

  function depuisEvenement(evenement) {
    if (!vivant) return;
    const coordonnees = pointDansSvg(svg, evenement.clientX, evenement.clientY);
    valeurCourante = contrainte.ranger(contrainte.depuisPoint(coordonnees));
    appliquer(true);
  }

  function surPointerDown(evenement) {
    if (!vivant) return;
    evenement.preventDefault();
    groupe.dataset.actif = "true";
    if (typeof groupe.setPointerCapture === "function" && evenement.pointerId != null) {
      try {
        groupe.setPointerCapture(evenement.pointerId);
      } catch (erreur) {
        /* certains navigateurs refusent la capture sur un nœud SVG */
      }
    }
    groupe.focus({ preventScroll: true });
    depuisEvenement(evenement);
  }

  function surPointerMove(evenement) {
    if (groupe.dataset.actif !== "true") return;
    evenement.preventDefault();
    depuisEvenement(evenement);
  }

  function surPointerUp(evenement) {
    if (groupe.dataset.actif !== "true") return;
    delete groupe.dataset.actif;
    if (typeof groupe.releasePointerCapture === "function" && evenement.pointerId != null) {
      try {
        groupe.releasePointerCapture(evenement.pointerId);
      } catch (erreur) {
        /* rien à libérer */
      }
    }
  }

  function deplacer(multiple, evenement, axe) {
    const pas = contrainte.pas * (evenement && evenement.shiftKey ? 0.2 : 1) * multiple;
    if (type === "zone") {
      valeurCourante = contrainte.ranger(
        axe === "y"
          ? { x: valeurCourante.x, y: valeurCourante.y - pas }
          : { x: valeurCourante.x + pas, y: valeurCourante.y }
      );
    } else {
      valeurCourante = contrainte.ranger(valeurCourante + pas);
    }
    appliquer(true);
  }

  function surClavier(evenement) {
    if (!vivant) return;
    const touche = evenement.key;
    if (touche === "ArrowRight") {
      evenement.preventDefault();
      deplacer(1, evenement, "x");
    } else if (touche === "ArrowLeft") {
      evenement.preventDefault();
      deplacer(-1, evenement, "x");
    } else if (touche === "ArrowUp") {
      evenement.preventDefault();
      deplacer(1, evenement, "y");
    } else if (touche === "ArrowDown") {
      evenement.preventDefault();
      deplacer(-1, evenement, "y");
    } else if (touche === "PageUp") {
      evenement.preventDefault();
      deplacer(5, evenement, "x");
    } else if (touche === "PageDown") {
      evenement.preventDefault();
      deplacer(-5, evenement, "x");
    } else if (touche === "Home") {
      evenement.preventDefault();
      valeurCourante = contrainte.ranger(type === "zone" ? { x: contrainte.min, y: valeurCourante.y } : contrainte.min);
      appliquer(true);
    } else if (touche === "End") {
      evenement.preventDefault();
      valeurCourante = contrainte.ranger(type === "zone" ? { x: contrainte.max, y: valeurCourante.y } : contrainte.max);
      appliquer(true);
    }
  }

  groupe.addEventListener("pointerdown", surPointerDown);
  groupe.addEventListener("pointermove", surPointerMove);
  groupe.addEventListener("pointerup", surPointerUp);
  groupe.addEventListener("pointercancel", surPointerUp);
  groupe.addEventListener("keydown", surClavier);

  const observateurTaille =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          ajusterCible();
        })
      : null;
  if (observateurTaille) observateurTaille.observe(svg);

  const controle = {
    element: groupe,
    type,
    set(valeur, diffuser) {
      if (!vivant) return null;
      valeurCourante = contrainte.ranger(valeur);
      return appliquer(diffuser !== false);
    },
    get() {
      return contrainte.mesurer(valeurCourante);
    },
    detruire() {
      if (!vivant) return;
      vivant = false;
      groupe.removeEventListener("pointerdown", surPointerDown);
      groupe.removeEventListener("pointermove", surPointerMove);
      groupe.removeEventListener("pointerup", surPointerUp);
      groupe.removeEventListener("pointercancel", surPointerUp);
      groupe.removeEventListener("keydown", surClavier);
      if (observateurTaille) observateurTaille.disconnect();
      groupe.remove();
    },
  };

  ajusterCible();
  appliquer(options.diffuserAuDepart !== false);
  enregistrerNettoyeur(ctx, controle.detruire);
  return controle;
}

/* --------------------------------------------------------------------------
   Lecteur : animation d'une grandeur dans le temps, pilotée par l'apprenant
   -------------------------------------------------------------------------- */

const VITESSES = [
  { valeur: 0.25, libelle: "x 0,25" },
  { valeur: 0.5, libelle: "x 0,5" },
  { valeur: 1, libelle: "x 1" },
  { valeur: 2, libelle: "x 2" },
];

/**
 * Lecture, pause, remise à zéro et réglage de vitesse.
 *
 * options : { de, a, duree, boucle, vitesse, auto, libelle, rappel }
 * Renvoie { detruire(), lire(), pause(), zero(), valeur(), definir(valeur) }.
 */
function simLecteur(ctx, conteneur, options = {}) {
  const racine = ctx.racine instanceof Element ? ctx.racine : document;
  const cible = resoudre(conteneur, racine);
  if (!cible) return null;

  const de = Number(options.de != null ? options.de : 0);
  const a = Number(options.a != null ? options.a : 1);
  const duree = Math.max(0.1, Number(options.duree != null ? options.duree : 6));
  const boucle = options.boucle !== false;
  /* Mouvement réduit : rien ne démarre seul, mais la lecture reste offerte. */
  const auto = options.auto != null ? Boolean(options.auto) && !ctx.mouvementReduit : !ctx.mouvementReduit;

  let vitesse = Number(options.vitesse != null ? options.vitesse : 1);
  let progression = 0;
  let enMarche = false;
  let souhaiteMarche = false;
  let visible = true;
  let image = 0;
  let dernier = 0;
  let vivant = true;

  const boutonLecture = creer("button", { classe: "m-bouton", attributs: { type: "button" }, texte: "Lecture" });
  boutonLecture.prepend(icone("lecture", { taille: 15 }));
  const boutonPause = creer("button", { classe: "m-bouton secondaire", attributs: { type: "button" }, texte: "Pause" });
  boutonPause.prepend(icone("pause", { taille: 15 }));
  const boutonZero = creer("button", { classe: "m-bouton secondaire", attributs: { type: "button" }, texte: "Remise à zéro" });
  boutonZero.prepend(icone("recommencer", { taille: 15 }));

  const choixVitesse = creer("select", { attributs: { "aria-label": "Vitesse de lecture" } });
  for (const reglage of VITESSES) {
    const option = creer("option", { texte: reglage.libelle, attributs: { value: String(reglage.valeur) } });
    if (reglage.valeur === vitesse) option.setAttribute("selected", "");
    choixVitesse.appendChild(option);
  }
  const etiquetteVitesse = creer("label", {
    classe: "m-selecteur",
    enfants: [creer("span", { texte: "Vitesse" }), choixVitesse],
  });

  const barre = creer("div", {
    classe: "m-lecteur",
    attributs: { role: "group", "aria-label": options.libelle || "Lecture de l'animation" },
    enfants: [boutonLecture, boutonPause, boutonZero, etiquetteVitesse],
  });
  cible.appendChild(barre);

  function valeurCourante() {
    return de + (a - de) * progression;
  }

  function diffuser() {
    if (typeof options.rappel !== "function") return;
    try {
      options.rappel(valeurCourante(), { progression, enMarche, controle });
    } catch (erreur) {
      /* le rappel du cours ne doit pas interrompre la lecture */
    }
  }

  function majBoutons() {
    boutonLecture.disabled = enMarche;
    boutonPause.disabled = !enMarche;
  }

  function boucleAnimation(horodatage) {
    if (!vivant) return;
    image = requestAnimationFrame(boucleAnimation);
    if (!enMarche) {
      dernier = horodatage;
      return;
    }
    const dt = dernier ? Math.min(0.05, (horodatage - dernier) / 1000) : 0;
    dernier = horodatage;
    progression += (dt * vitesse) / duree;
    if (progression >= 1) {
      if (boucle) progression -= Math.floor(progression);
      else {
        progression = 1;
        arreter();
      }
    }
    diffuser();
  }

  function demarrer() {
    if (!vivant || enMarche) return;
    enMarche = true;
    souhaiteMarche = true;
    dernier = 0;
    majBoutons();
    if (!image) image = requestAnimationFrame(boucleAnimation);
  }

  function arreter(garderSouhait) {
    if (!vivant) return;
    enMarche = false;
    if (!garderSouhait) souhaiteMarche = false;
    majBoutons();
  }

  boutonLecture.addEventListener("click", () => demarrer());
  boutonPause.addEventListener("click", () => arreter());
  boutonZero.addEventListener("click", () => {
    progression = 0;
    arreter();
    diffuser();
  });
  choixVitesse.addEventListener("change", () => {
    vitesse = Number(choixVitesse.value) || 1;
  });

  const observateurVue =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entrees) => {
            for (const entree of entrees) visible = entree.isIntersecting;
            /* Hors de l'écran, la lecture se met en pause et reprend au retour. */
            if (!visible && enMarche) arreter(true);
            else if (visible && souhaiteMarche && !enMarche) demarrer();
          },
          { rootMargin: "80px" }
        )
      : null;
  if (observateurVue) observateurVue.observe(barre);

  const controle = {
    element: barre,
    lire: demarrer,
    pause: () => arreter(),
    zero() {
      progression = 0;
      arreter();
      diffuser();
    },
    valeur: valeurCourante,
    enMarche: () => enMarche,
    definir(valeur) {
      const etendue = a - de;
      progression = etendue === 0 ? 0 : bornerNombre((Number(valeur) - de) / etendue, 0, 1);
      diffuser();
    },
    /* Positionne la lecture sans rappeler le cours, pour suivre une poignée. */
    suivre(valeur) {
      const etendue = a - de;
      progression = etendue === 0 ? 0 : bornerNombre((Number(valeur) - de) / etendue, 0, 1);
    },
    detruire() {
      if (!vivant) return;
      vivant = false;
      enMarche = false;
      souhaiteMarche = false;
      if (image) cancelAnimationFrame(image);
      image = 0;
      if (observateurVue) observateurVue.disconnect();
      barre.remove();
    },
  };

  majBoutons();
  diffuser();
  if (auto) demarrer();
  enregistrerNettoyeur(ctx, controle.detruire);
  return controle;
}

/* --------------------------------------------------------------------------
   Panneau de valeurs en direct
   -------------------------------------------------------------------------- */

/** Notation décimale française : virgule, nombre de décimales imposé. */
function formaterDecimal(valeur, decimales) {
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre)) return "indéfini";
  const chiffres = Number.isFinite(decimales) ? Math.max(0, Math.min(8, decimales)) : 2;
  const texte = (Object.is(nombre, -0) ? 0 : nombre).toFixed(chiffres);
  return texte.replace(".", ",");
}

/**
 * Panneau de grandeurs mises à jour en continu.
 *
 * champs : [{ id, libelle, unite, decimales, valeur, format }]
 * Renvoie { maj(objet), detruire() }.
 */
function simValeurs(ctx, conteneur, champs) {
  const racine = ctx.racine instanceof Element ? ctx.racine : document;
  const cible = resoudre(conteneur, racine);
  if (!cible || !Array.isArray(champs)) return null;

  const liste = creer("dl", { classe: "m-valeurs" });
  const cellules = new Map();

  for (const champ of champs) {
    const id = champ.id || normaliser(champ.libelle || "valeur").replace(/\s+/g, "-");
    const nombre = creer("span", { classe: "m-valeur-nombre", texte: formaterDecimal(champ.valeur, champ.decimales) });
    const valeur = creer("dd", { enfants: [nombre] });
    if (champ.unite) valeur.appendChild(creer("span", { classe: "m-valeur-unite", texte: champ.unite }));
    liste.appendChild(
      creer("div", {
        classe: "m-valeur",
        enfants: [creer("dt", { texte: champ.libelle || id }), valeur],
      })
    );
    cellules.set(id, { nombre, champ });
  }

  cible.appendChild(liste);
  let vivant = true;

  const controle = {
    element: liste,
    maj(objet) {
      if (!vivant || !objet || typeof objet !== "object") return controle;
      for (const [id, valeur] of Object.entries(objet)) {
        const cellule = cellules.get(id);
        if (!cellule) continue;
        cellule.nombre.textContent =
          typeof cellule.champ.format === "function"
            ? String(cellule.champ.format(valeur))
            : formaterDecimal(valeur, cellule.champ.decimales);
      }
      return controle;
    },
    detruire() {
      if (!vivant) return;
      vivant = false;
      cellules.clear();
      liste.remove();
    },
  };

  enregistrerNettoyeur(ctx, controle.detruire);
  return controle;
}

/* --------------------------------------------------------------------------
   Traceur de courbes
   -------------------------------------------------------------------------- */

function simTraceur(ctx, conteneur, options = {}) {
  const series = (options.series || []).map((serie, index) => ({
    id: serie.id || "serie-" + index,
    nom: serie.nom || "Série " + (index + 1),
    couleur: serie.couleur || null,
    epaisseur: serie.epaisseur || 2,
    points: serie.points || [],
    fonction: serie.fonction || null,
  }));

  const plage = {
    xMin: options.xMin != null ? options.xMin : 0,
    xMax: options.xMax != null ? options.xMax : 1,
    yMin: options.yMin,
    yMax: options.yMax,
  };
  const autoY = options.yMin == null || options.yMax == null;
  const echantillons = options.echantillons || 320;

  function recalculer() {
    for (const serie of series) {
      if (typeof serie.fonction !== "function") continue;
      const points = [];
      for (let i = 0; i <= echantillons; i += 1) {
        const x = plage.xMin + ((plage.xMax - plage.xMin) * i) / echantillons;
        const y = serie.fonction(x);
        points.push([x, Number.isFinite(y) ? y : NaN]);
      }
      serie.points = points;
    }
    if (autoY) {
      let bas = Infinity;
      let haut = -Infinity;
      for (const serie of series) {
        for (const point of serie.points) {
          const y = Array.isArray(point) ? point[1] : point.y;
          if (!Number.isFinite(y)) continue;
          if (y < bas) bas = y;
          if (y > haut) haut = y;
        }
      }
      if (!Number.isFinite(bas) || !Number.isFinite(haut)) {
        bas = 0;
        haut = 1;
      }
      if (haut - bas < 1e-12) {
        haut = bas + 1;
        bas -= 1;
      }
      const marge = (haut - bas) * 0.12;
      plage.yMin = options.yMin != null ? options.yMin : bas - marge;
      plage.yMax = options.yMax != null ? options.yMax : haut + marge;
    }
  }

  const controle = cadreSimulation(ctx, conteneur, {
    titre: options.titre,
    genre: options.genre || "Tracé",
    note: options.note,
    description: options.description,
    ratio: options.ratio != null ? options.ratio : 0.5,
    hauteurMin: options.hauteurMin,
    hauteurMax: options.hauteurMax,
    dessiner({ c, largeur, hauteur, couleurs }) {
      const repere = tracerRepere(c, largeur, hauteur, couleurs, {
        xMin: plage.xMin,
        xMax: plage.xMax,
        yMin: plage.yMin,
        yMax: plage.yMax,
        xTitre: options.xTitre,
        yTitre: options.yTitre,
        xUnite: options.xUnite,
        yUnite: options.yUnite,
        graduationsX: options.graduationsX,
        graduationsY: options.graduationsY,
      });
      series.forEach((serie, index) => {
        const couleur = couleurSerie(serie.couleur, couleurs, index);
        tracerCourbe(c, serie.points, repere.versX, repere.versY, repere.boite, couleur, serie.epaisseur);
      });
      if (typeof options.surDessin === "function") {
        try {
          options.surDessin({ c, repere, couleurs, largeur, hauteur });
        } catch (erreur) {
          /* un décor additionnel défaillant ne doit pas effacer les courbes */
        }
      }
    },
  });
  if (!controle) return null;

  function majLegende() {
    const couleurs = controle.couleurs();
    controle.definirLegende(
      series.map((serie, index) => ({
        nom: serie.nom,
        couleur: couleurSerie(serie.couleur, couleurs, index),
      }))
    );
  }

  recalculer();
  if (options.legende !== false) majLegende();
  controle.demanderRendu();

  return {
    ...controle,
    series,
    plage,
    definirDonnees(id, points) {
      const serie = series.find((element) => element.id === id);
      if (!serie) return;
      serie.points = points || [];
      serie.fonction = null;
      recalculer();
      controle.demanderRendu();
    },
    definirFonction(id, fonction) {
      const serie = series.find((element) => element.id === id);
      if (!serie) return;
      serie.fonction = fonction;
      recalculer();
      controle.demanderRendu();
    },
    definirPlage(nouvelle) {
      Object.assign(plage, nouvelle || {});
      recalculer();
      controle.demanderRendu();
    },
    rafraichir() {
      recalculer();
      controle.demanderRendu();
    },
  };
}

/* --------------------------------------------------------------------------
   Oscilloscope : signaux temporels défilants
   -------------------------------------------------------------------------- */

function simOscilloscope(ctx, conteneur, options = {}) {
  const voies = (options.voies || []).map((voie, index) => ({
    id: voie.id || "voie-" + index,
    nom: voie.nom || "Voie " + (index + 1),
    couleur: voie.couleur || null,
    signal: typeof voie.signal === "function" ? voie.signal : () => 0,
    echelle: voie.echelle != null ? voie.echelle : 1,
    unite: voie.unite || "",
  }));

  const basesTemps = options.basesTemps || [0.001, 0.002, 0.005, 0.01, 0.02, 0.05];
  let baseTemps = options.baseTemps != null ? options.baseTemps : basesTemps[Math.floor(basesTemps.length / 2)];
  let amplitudeDiv = options.amplitudeDiv != null ? options.amplitudeDiv : 1;
  const divisionsX = options.divisionsX || 10;
  const divisionsY = options.divisionsY || 8;

  const controle = cadreSimulation(ctx, conteneur, {
    titre: options.titre || "Oscilloscope",
    genre: options.genre || "Oscilloscope",
    note: options.note,
    description: options.description || "Chronogramme défilant",
    anime: true,
    ratio: options.ratio != null ? options.ratio : 0.52,
    hauteurMin: options.hauteurMin,
    hauteurMax: options.hauteurMax,
    dessiner({ c, largeur, hauteur, couleurs, temps }) {
      const fenetre = baseTemps * divisionsX;
      const marge = { gauche: 46, droite: 12, haut: 12, bas: 28 };
      const boite = {
        x: marge.gauche,
        y: marge.haut,
        l: Math.max(20, largeur - marge.gauche - marge.droite),
        h: Math.max(20, hauteur - marge.haut - marge.bas),
      };
      const tFin = temps;
      const tDebut = tFin - fenetre;
      const versX = (t) => boite.x + ((t - tDebut) / fenetre) * boite.l;
      const pleineEchelle = amplitudeDiv * (divisionsY / 2);
      const versY = (v) => boite.y + boite.h / 2 - (v / pleineEchelle) * (boite.h / 2);

      /* Grille de l'écran */
      c.save();
      c.strokeStyle = couleurs.grille;
      c.lineWidth = 1;
      for (let i = 0; i <= divisionsX; i += 1) {
        const x = Math.round(boite.x + (boite.l * i) / divisionsX) + 0.5;
        c.beginPath();
        c.moveTo(x, boite.y);
        c.lineTo(x, boite.y + boite.h);
        c.stroke();
      }
      for (let i = 0; i <= divisionsY; i += 1) {
        const y = Math.round(boite.y + (boite.h * i) / divisionsY) + 0.5;
        c.beginPath();
        c.moveTo(boite.x, y);
        c.lineTo(boite.x + boite.l, y);
        c.stroke();
      }
      c.strokeStyle = couleurs.axe;
      c.lineWidth = 1.3;
      c.beginPath();
      c.moveTo(boite.x, Math.round(boite.y + boite.h / 2) + 0.5);
      c.lineTo(boite.x + boite.l, Math.round(boite.y + boite.h / 2) + 0.5);
      c.stroke();
      c.strokeRect(boite.x + 0.5, boite.y + 0.5, boite.l, boite.h);

      /* Étiquettes */
      c.fillStyle = couleurs.texte;
      c.font = "11px " + POLICE_TRACE;
      c.textAlign = "right";
      c.textBaseline = "middle";
      for (let i = 0; i <= divisionsY; i += 2) {
        const valeur = pleineEchelle - (i * (pleineEchelle * 2)) / divisionsY;
        c.fillText(formater(valeur, 2), boite.x - 6, boite.y + (boite.h * i) / divisionsY);
      }
      c.textAlign = "left";
      c.fillText(
        formater(baseTemps * 1000, 2) + " ms/div  |  " + formater(amplitudeDiv, 2) + " " + (voies[0] ? voies[0].unite : "") + "/div",
        boite.x,
        boite.y + boite.h + 14
      );
      c.restore();

      /* Tracés */
      const echantillons = Math.max(160, Math.round(boite.l));
      voies.forEach((voie, index) => {
        const couleur = couleurSerie(voie.couleur, couleurs, index);
        const points = [];
        for (let i = 0; i <= echantillons; i += 1) {
          const t = tDebut + (fenetre * i) / echantillons;
          let valeur = 0;
          try {
            valeur = Number(voie.signal(t)) * voie.echelle;
          } catch (erreur) {
            valeur = NaN;
          }
          points.push([t, valeur]);
        }
        tracerCourbe(c, points, versX, versY, boite, couleur, 2);
      });
    },
  });
  if (!controle) return null;

  /* Réglages : base de temps, amplitude, pause */
  const selecteurTemps = creer("select", { attributs: { "aria-label": "Base de temps" } });
  for (const base of basesTemps) {
    const option = creer("option", {
      attributs: { value: String(base), selected: Math.abs(base - baseTemps) < 1e-12 },
      texte: formater(base * 1000, 2) + " ms/div",
    });
    selecteurTemps.appendChild(option);
  }
  selecteurTemps.addEventListener("change", () => {
    baseTemps = Number(selecteurTemps.value);
    controle.demanderRendu();
  });

  const selecteurAmplitude = creer("select", { attributs: { "aria-label": "Sensibilité verticale" } });
  for (const valeur of options.amplitudesDiv || [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200]) {
    selecteurAmplitude.appendChild(
      creer("option", {
        attributs: { value: String(valeur), selected: Math.abs(valeur - amplitudeDiv) < 1e-12 },
        texte: formater(valeur, 2) + (voies[0] && voies[0].unite ? " " + voies[0].unite : "") + "/div",
      })
    );
  }
  selecteurAmplitude.addEventListener("change", () => {
    amplitudeDiv = Number(selecteurAmplitude.value);
    controle.demanderRendu();
  });

  const pause = creer("input", { attributs: { type: "checkbox", checked: ctx.mouvementReduit ? true : false } });
  pause.addEventListener("change", () => controle.marche(!pause.checked));
  controle.marche(!pause.checked);

  controle.reglages.append(
    creer("label", {
      classe: "m-selecteur",
      enfants: [creer("span", { texte: "Base de temps" }), selecteurTemps],
    }),
    creer("label", {
      classe: "m-selecteur",
      enfants: [creer("span", { texte: "Sensibilité" }), selecteurAmplitude],
    }),
    creer("label", { classe: "m-interrupteur", enfants: [pause, creer("span", { texte: "Figer l'écran" })] })
  );

  const couleurs = controle.couleurs();
  controle.definirLegende(
    voies.map((voie, index) => ({
      nom: voie.nom + (voie.unite ? " [" + voie.unite + "]" : ""),
      couleur: couleurSerie(voie.couleur, couleurs, index),
    }))
  );

  return {
    ...controle,
    voies,
    definirSignal(id, signal) {
      const voie = voies.find((element) => element.id === id);
      if (voie && typeof signal === "function") {
        voie.signal = signal;
        controle.demanderRendu();
      }
    },
    definirBaseTemps(valeur) {
      baseTemps = Number(valeur);
      selecteurTemps.value = String(baseTemps);
      controle.demanderRendu();
    },
    definirAmplitudeDiv(valeur) {
      amplitudeDiv = Number(valeur);
      selecteurAmplitude.value = String(amplitudeDiv);
      controle.demanderRendu();
    },
  };
}

/* --------------------------------------------------------------------------
   Diagramme de Fresnel
   -------------------------------------------------------------------------- */

function simFresnel(ctx, conteneur, options = {}) {
  const vecteurs = (options.vecteurs || []).map((vecteur, index) => ({
    id: vecteur.id || "vecteur-" + index,
    nom: vecteur.nom || "V" + (index + 1),
    amplitude: Number(vecteur.amplitude != null ? vecteur.amplitude : 1),
    phase: Number(vecteur.phase != null ? vecteur.phase : 0),
    couleur: vecteur.couleur || null,
    pointille: Boolean(vecteur.pointille),
    unite: vecteur.unite || options.unite || "",
  }));

  const tourne = options.rotation !== false;
  const frequenceVue = options.frequenceVue != null ? options.frequenceVue : 0.22;
  let projection = options.projection !== false;

  function amplitudeMax() {
    let maximum = 0;
    for (const vecteur of vecteurs) maximum = Math.max(maximum, Math.abs(vecteur.amplitude));
    if (options.somme) {
      let re = 0;
      let im = 0;
      for (const vecteur of vecteurs) {
        re += vecteur.amplitude * Math.cos((vecteur.phase * Math.PI) / 180);
        im += vecteur.amplitude * Math.sin((vecteur.phase * Math.PI) / 180);
      }
      maximum = Math.max(maximum, Math.hypot(re, im));
    }
    return maximum > 0 ? maximum : 1;
  }

  const controle = cadreSimulation(ctx, conteneur, {
    titre: options.titre || "Diagramme de Fresnel",
    genre: options.genre || "Phaseurs",
    note: options.note,
    description: options.description || "Vecteurs tournants et projections temporelles",
    anime: tourne,
    ratio: options.ratio != null ? options.ratio : 0.46,
    hauteurMin: options.hauteurMin || 240,
    hauteurMax: options.hauteurMax || 400,
    dessiner({ c, largeur, hauteur, couleurs, temps }) {
      const avecProjection = projection && largeur > 520;
      const largeurCadran = avecProjection ? Math.min(hauteur, largeur * 0.46) : Math.min(hauteur, largeur);
      const centre = { x: largeurCadran / 2 + 8, y: hauteur / 2 };
      const rayon = Math.max(40, Math.min(largeurCadran, hauteur) / 2 - 26);
      const echelle = rayon / amplitudeMax();
      const angle = tourne ? temps * TAU * frequenceVue : 0;

      /* Cadran */
      c.save();
      c.strokeStyle = couleurs.grille;
      c.lineWidth = 1;
      for (const fraction of [0.25, 0.5, 0.75, 1]) {
        c.beginPath();
        c.arc(centre.x, centre.y, rayon * fraction, 0, TAU);
        c.stroke();
      }
      c.strokeStyle = couleurs.axe;
      c.beginPath();
      c.moveTo(centre.x - rayon - 10, centre.y);
      c.lineTo(centre.x + rayon + 10, centre.y);
      c.moveTo(centre.x, centre.y - rayon - 10);
      c.lineTo(centre.x, centre.y + rayon + 10);
      c.stroke();
      c.fillStyle = couleurs.texte;
      c.font = "11px " + POLICE_TRACE;
      c.textAlign = "center";
      c.textBaseline = "middle";
      for (const marque of [
        { texte: "0\u00b0", x: centre.x + rayon + 18, y: centre.y },
        { texte: "90\u00b0", x: centre.x, y: centre.y - rayon - 16 },
        { texte: "180\u00b0", x: centre.x - rayon - 22, y: centre.y },
        { texte: "270\u00b0", x: centre.x, y: centre.y + rayon + 16 },
      ]) {
        c.fillText(marque.texte, marque.x, marque.y);
      }
      c.restore();

      function fleche(dx, dy, couleur, epaisseur, pointille) {
        c.save();
        c.strokeStyle = couleur;
        c.fillStyle = couleur;
        c.lineWidth = epaisseur;
        if (pointille) c.setLineDash([5, 4]);
        c.beginPath();
        c.moveTo(centre.x, centre.y);
        c.lineTo(centre.x + dx, centre.y + dy);
        c.stroke();
        c.setLineDash([]);
        const direction = Math.atan2(dy, dx);
        const pointe = 9;
        c.beginPath();
        c.moveTo(centre.x + dx, centre.y + dy);
        c.lineTo(
          centre.x + dx - pointe * Math.cos(direction - 0.4),
          centre.y + dy - pointe * Math.sin(direction - 0.4)
        );
        c.lineTo(
          centre.x + dx - pointe * Math.cos(direction + 0.4),
          centre.y + dy - pointe * Math.sin(direction + 0.4)
        );
        c.closePath();
        c.fill();
        c.restore();
      }

      let sommeRe = 0;
      let sommeIm = 0;
      vecteurs.forEach((vecteur, index) => {
        const couleur = couleurSerie(vecteur.couleur, couleurs, index);
        const theta = angle + (vecteur.phase * Math.PI) / 180;
        const dx = vecteur.amplitude * echelle * Math.cos(theta);
        const dy = -vecteur.amplitude * echelle * Math.sin(theta);
        sommeRe += vecteur.amplitude * Math.cos(theta);
        sommeIm += vecteur.amplitude * Math.sin(theta);
        fleche(dx, dy, couleur, 2.4, vecteur.pointille);
        c.save();
        c.fillStyle = couleur;
        c.font = "500 11px " + POLICE_TRACE;
        c.textAlign = dx >= 0 ? "left" : "right";
        c.textBaseline = dy >= 0 ? "top" : "bottom";
        c.fillText(vecteur.nom, centre.x + dx * 1.06 + (dx >= 0 ? 4 : -4), centre.y + dy * 1.06);
        c.restore();
      });

      if (options.somme) {
        const module = Math.hypot(sommeRe, sommeIm);
        const theta = Math.atan2(sommeIm, sommeRe);
        fleche(module * echelle * Math.cos(theta), -module * echelle * Math.sin(theta), couleurs.accent, 3, false);
        c.save();
        c.fillStyle = couleurs.accent;
        c.font = "500 11px " + POLICE_TRACE;
        c.textAlign = "left";
        c.fillText(options.nomSomme || "somme", centre.x + module * echelle * Math.cos(theta) + 5, centre.y - module * echelle * Math.sin(theta) - 8);
        c.restore();
      }

      /* Projections temporelles */
      if (avecProjection) {
        const gauche = largeurCadran + 34;
        const boite = { x: gauche, y: 18, l: Math.max(60, largeur - gauche - 12), h: hauteur - 46 };
        const maximum = amplitudeMax();
        c.save();
        c.strokeStyle = couleurs.grille;
        c.lineWidth = 1;
        c.strokeRect(boite.x + 0.5, boite.y + 0.5, boite.l, boite.h);
        c.strokeStyle = couleurs.axe;
        c.beginPath();
        c.moveTo(boite.x, boite.y + boite.h / 2);
        c.lineTo(boite.x + boite.l, boite.y + boite.h / 2);
        c.stroke();
        c.fillStyle = couleurs.texte;
        c.font = "10px " + POLICE_TRACE;
        c.textAlign = "left";
        c.textBaseline = "bottom";
        c.fillText("projections instantanées", boite.x + 4, boite.y + boite.h + 14);
        c.restore();

        const tours = 1.25;
        vecteurs.forEach((vecteur, index) => {
          const couleur = couleurSerie(vecteur.couleur, couleurs, index);
          c.save();
          c.beginPath();
          c.rect(boite.x, boite.y, boite.l, boite.h);
          c.clip();
          c.strokeStyle = couleur;
          c.lineWidth = 1.8;
          c.beginPath();
          for (let i = 0; i <= 200; i += 1) {
            const fraction = i / 200;
            const theta = angle + (vecteur.phase * Math.PI) / 180 - fraction * TAU * tours;
            const valeur = vecteur.amplitude * Math.sin(theta);
            const x = boite.x + fraction * boite.l;
            const y = boite.y + boite.h / 2 - (valeur / maximum) * (boite.h / 2 - 6);
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
          }
          c.stroke();
          c.restore();
        });
      }
    },
  });
  if (!controle) return null;

  const couleurs = controle.couleurs();
  controle.definirLegende(
    vecteurs
      .map((vecteur, index) => ({
        nom:
          vecteur.nom +
          " : " +
          formater(vecteur.amplitude, 2) +
          (vecteur.unite ? " " + vecteur.unite : "") +
          " à " +
          formater(vecteur.phase, 1) +
          " degrés",
        couleur: couleurSerie(vecteur.couleur, couleurs, index),
      }))
      .concat(options.somme ? [{ nom: options.nomSomme || "somme vectorielle", couleur: couleurs.accent }] : [])
  );

  if (tourne) {
    const pause = creer("input", { attributs: { type: "checkbox", checked: ctx.mouvementReduit } });
    pause.addEventListener("change", () => controle.marche(!pause.checked));
    controle.marche(!pause.checked);
    controle.reglages.appendChild(
      creer("label", { classe: "m-interrupteur", enfants: [pause, creer("span", { texte: "Figer la rotation" })] })
    );
  }

  return {
    ...controle,
    vecteurs,
    definirVecteur(id, valeurs) {
      const vecteur = vecteurs.find((element) => element.id === id);
      if (!vecteur) return;
      if (valeurs.amplitude != null) vecteur.amplitude = Number(valeurs.amplitude);
      if (valeurs.phase != null) vecteur.phase = Number(valeurs.phase);
      if (valeurs.nom != null) vecteur.nom = valeurs.nom;
      const couleursActuelles = controle.couleurs();
      controle.definirLegende(
        vecteurs
          .map((element, index) => ({
            nom:
              element.nom +
              " : " +
              formater(element.amplitude, 2) +
              (element.unite ? " " + element.unite : "") +
              " à " +
              formater(element.phase, 1) +
              " degrés",
            couleur: couleurSerie(element.couleur, couleursActuelles, index),
          }))
          .concat(options.somme ? [{ nom: options.nomSomme || "somme vectorielle", couleur: couleursActuelles.accent }] : [])
      );
      controle.demanderRendu();
    },
    definirProjection(actif) {
      projection = Boolean(actif);
      controle.demanderRendu();
    },
  };
}

/* --------------------------------------------------------------------------
   Diagramme de Bode
   -------------------------------------------------------------------------- */

function normaliserReponse(valeur) {
  if (valeur == null) return { gain: 0, phase: 0 };
  if (Array.isArray(valeur)) {
    const module = Math.hypot(valeur[0], valeur[1]);
    return { gain: 20 * Math.log10(module > 1e-18 ? module : 1e-18), phase: (Math.atan2(valeur[1], valeur[0]) * 180) / Math.PI };
  }
  if (valeur.gain_dB != null || valeur.phase_deg != null) {
    return { gain: Number(valeur.gain_dB || 0), phase: Number(valeur.phase_deg || 0) };
  }
  if (valeur.re != null || valeur.im != null) {
    const module = Math.hypot(Number(valeur.re || 0), Number(valeur.im || 0));
    return {
      gain: 20 * Math.log10(module > 1e-18 ? module : 1e-18),
      phase: (Math.atan2(Number(valeur.im || 0), Number(valeur.re || 0)) * 180) / Math.PI,
    };
  }
  if (valeur.module != null) {
    const module = Number(valeur.module);
    return { gain: 20 * Math.log10(module > 1e-18 ? module : 1e-18), phase: Number(valeur.argument || 0) };
  }
  return { gain: Number(valeur) || 0, phase: 0 };
}

function simBode(ctx, conteneur, options = {}) {
  let fonction = typeof options.fonction === "function" ? options.fonction : () => ({ re: 1, im: 0 });
  let coupure = options.coupure != null ? Number(options.coupure) : null;
  const fMin = options.fMin != null ? options.fMin : 1;
  const fMax = options.fMax != null ? options.fMax : 100000;
  const echantillons = options.echantillons || 260;

  function calculer() {
    const gains = [];
    const phases = [];
    for (let i = 0; i <= echantillons; i += 1) {
      const f = Math.pow(10, Math.log10(fMin) + ((Math.log10(fMax) - Math.log10(fMin)) * i) / echantillons);
      const reponse = normaliserReponse(fonction(f));
      gains.push([f, reponse.gain]);
      phases.push([f, reponse.phase]);
    }
    return { gains, phases };
  }

  let courbes = calculer();

  const controle = cadreSimulation(ctx, conteneur, {
    titre: options.titre || "Diagramme de Bode",
    genre: options.genre || "Réponse fréquentielle",
    note: options.note,
    description: options.description || "Gain en décibels et phase en degrés",
    ratio: options.ratio != null ? options.ratio : 0.78,
    hauteurMin: options.hauteurMin || 300,
    hauteurMax: options.hauteurMax || 520,
    dessiner({ c, largeur, hauteur, couleurs }) {
      const hautGain = Math.round(hauteur * 0.54);
      const gainsValeurs = courbes.gains.map((point) => point[1]).filter((valeur) => Number.isFinite(valeur));
      const gainMax = options.gainMax != null ? options.gainMax : Math.ceil((Math.max(...gainsValeurs, 0) + 6) / 10) * 10;
      const gainMin = options.gainMin != null ? options.gainMin : Math.floor((Math.min(...gainsValeurs, 0) - 6) / 10) * 10;
      const phasesValeurs = courbes.phases.map((point) => point[1]).filter((valeur) => Number.isFinite(valeur));
      const phaseMax = options.phaseMax != null ? options.phaseMax : Math.ceil((Math.max(...phasesValeurs, 0) + 15) / 45) * 45;
      const phaseMin = options.phaseMin != null ? options.phaseMin : Math.floor((Math.min(...phasesValeurs, 0) - 15) / 45) * 45;

      /* Panneau du gain */
      c.save();
      const repereGain = tracerRepere(c, largeur, hautGain, couleurs, {
        logX: true,
        xMin: fMin,
        xMax: fMax,
        yMin: gainMin,
        yMax: gainMax,
        yTitre: options.gainTitre || "Gain",
        yUnite: "dB",
        graduationsY: 4,
        margeBas: 22,
      });
      tracerCourbe(c, courbes.gains, repereGain.versX, repereGain.versY, repereGain.boite, couleurs.series[0], 2.2);
      if (coupure) {
        const x = repereGain.versX(coupure);
        c.strokeStyle = couleurs.accent;
        c.setLineDash([5, 4]);
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(x, repereGain.boite.y);
        c.lineTo(x, repereGain.boite.y + repereGain.boite.h);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = couleurs.accent;
        c.font = "10px " + POLICE_TRACE;
        c.textAlign = "left";
        c.fillText(options.libelleCoupure || "fc", x + 4, repereGain.boite.y + 12);
      }
      c.restore();

      /* Panneau de la phase */
      c.save();
      c.translate(0, hautGain);
      const reperePhase = tracerRepere(c, largeur, hauteur - hautGain, couleurs, {
        logX: true,
        xMin: fMin,
        xMax: fMax,
        yMin: phaseMin,
        yMax: phaseMax,
        xTitre: options.xTitre || "Fréquence",
        xUnite: options.xUnite || "Hz",
        yTitre: options.phaseTitre || "Phase",
        yUnite: "degrés",
        graduationsY: 4,
      });
      tracerCourbe(c, courbes.phases, reperePhase.versX, reperePhase.versY, reperePhase.boite, couleurs.series[3], 2.2);
      if (coupure) {
        const x = reperePhase.versX(coupure);
        c.strokeStyle = couleurs.accent;
        c.setLineDash([5, 4]);
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(x, reperePhase.boite.y);
        c.lineTo(x, reperePhase.boite.y + reperePhase.boite.h);
        c.stroke();
        c.setLineDash([]);
      }
      c.restore();
    },
  });
  if (!controle) return null;

  const couleurs = controle.couleurs();
  controle.definirLegende([
    { nom: "Gain [dB]", couleur: couleurs.series[0] },
    { nom: "Phase [degrés]", couleur: couleurs.series[3] },
  ]);

  return {
    ...controle,
    definirFonction(nouvelle) {
      if (typeof nouvelle !== "function") return;
      fonction = nouvelle;
      courbes = calculer();
      controle.demanderRendu();
    },
    definirCoupure(valeur) {
      coupure = Number.isFinite(Number(valeur)) ? Number(valeur) : null;
      controle.demanderRendu();
    },
    rafraichir() {
      courbes = calculer();
      controle.demanderRendu();
    },
  };
}

/* --------------------------------------------------------------------------
   Spectre en barres
   -------------------------------------------------------------------------- */

function simSpectre(ctx, conteneur, options = {}) {
  let barres = (options.barres || []).map((barre, index) =>
    typeof barre === "number"
      ? { etiquette: String(index + 1), valeur: barre }
      : { etiquette: barre.etiquette || String(index + 1), valeur: Number(barre.valeur || 0), couleur: barre.couleur || null }
  );

  const controle = cadreSimulation(ctx, conteneur, {
    titre: options.titre || "Spectre",
    genre: options.genre || "Analyse spectrale",
    note: options.note,
    description: options.description || "Amplitude par rang",
    ratio: options.ratio != null ? options.ratio : 0.48,
    hauteurMin: options.hauteurMin || 210,
    hauteurMax: options.hauteurMax || 380,
    dessiner({ c, largeur, hauteur, couleurs }) {
      const maximum =
        options.yMax != null ? options.yMax : Math.max(1e-9, ...barres.map((barre) => Math.abs(barre.valeur))) * 1.15;
      const marge = { gauche: 52, droite: 14, haut: 14, bas: 40 };
      const boite = {
        x: marge.gauche,
        y: marge.haut,
        l: Math.max(20, largeur - marge.gauche - marge.droite),
        h: Math.max(20, hauteur - marge.haut - marge.bas),
      };
      const versY = (valeur) => boite.y + boite.h - (valeur / maximum) * boite.h;

      /* Grille horizontale et graduations */
      c.save();
      c.font = "11px " + POLICE_TRACE;
      c.textBaseline = "middle";
      const pas = pasJoli(maximum, 4);
      c.strokeStyle = couleurs.grille;
      c.fillStyle = couleurs.texte;
      c.textAlign = "right";
      for (let valeur = 0; valeur <= maximum + pas / 1000; valeur += pas) {
        const y = Math.round(versY(valeur)) + 0.5;
        c.beginPath();
        c.moveTo(boite.x, y);
        c.lineTo(boite.x + boite.l, y);
        c.stroke();
        c.fillText(etiquetteGraduation(valeur, pas), boite.x - 7, y);
      }
      c.strokeStyle = couleurs.axe;
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(boite.x, boite.y);
      c.lineTo(boite.x, boite.y + boite.h);
      c.lineTo(boite.x + boite.l, boite.y + boite.h);
      c.stroke();

      /* Barres */
      const nombre = Math.max(1, barres.length);
      const largeurCase = boite.l / nombre;
      const largeurBarre = Math.max(4, Math.min(38, largeurCase * 0.56));
      barres.forEach((barre, index) => {
        const couleur = couleurSerie(barre.couleur, couleurs, 0);
        const centre = boite.x + largeurCase * (index + 0.5);
        const haut = versY(Math.abs(barre.valeur));
        c.fillStyle = couleur;
        c.globalAlpha = index === 0 ? 0.95 : 0.7;
        const hauteurBarre = Math.max(0, boite.y + boite.h - haut);
        c.beginPath();
        const rayon = Math.min(4, largeurBarre / 2);
        c.moveTo(centre - largeurBarre / 2, boite.y + boite.h);
        c.lineTo(centre - largeurBarre / 2, haut + rayon);
        c.quadraticCurveTo(centre - largeurBarre / 2, haut, centre - largeurBarre / 2 + rayon, haut);
        c.lineTo(centre + largeurBarre / 2 - rayon, haut);
        c.quadraticCurveTo(centre + largeurBarre / 2, haut, centre + largeurBarre / 2, haut + rayon);
        c.lineTo(centre + largeurBarre / 2, boite.y + boite.h);
        c.closePath();
        c.fill();
        c.globalAlpha = 1;

        c.fillStyle = couleurs.texte;
        c.textAlign = "center";
        c.fillText(barre.etiquette, centre, boite.y + boite.h + 14);
        if (hauteurBarre > 18 && largeurCase > 26) {
          c.fillStyle = couleurs.texte;
          c.fillText(formater(Math.abs(barre.valeur), 2), centre, haut - 9);
        }
      });

      if (options.xTitre) {
        c.fillStyle = couleurs.texte;
        c.textAlign = "right";
        c.fillText(options.xTitre, boite.x + boite.l, hauteur - 8);
      }
      if (options.yTitre) {
        c.save();
        c.translate(12, boite.y + boite.h / 2);
        c.rotate(-Math.PI / 2);
        c.textAlign = "center";
        c.fillStyle = couleurs.texte;
        c.fillText(options.yTitre + (options.unite ? " [" + options.unite + "]" : ""), 0, 0);
        c.restore();
      }
      c.restore();
    },
  });
  if (!controle) return null;

  if (options.mesures) controle.definirMesures(options.mesures);

  return {
    ...controle,
    definirBarres(nouvelles) {
      barres = (nouvelles || []).map((barre, index) =>
        typeof barre === "number"
          ? { etiquette: String(index + 1), valeur: barre }
          : {
              etiquette: barre.etiquette || String(index + 1),
              valeur: Number(barre.valeur || 0),
              couleur: barre.couleur || null,
            }
      );
      controle.demanderRendu();
    },
  };
}

/* --------------------------------------------------------------------------
   Assemblage de l'objet api
   -------------------------------------------------------------------------- */

/**
 * Crée le moteur d'un cours. app.js appelle cette fabrique avant init(racine, api).
 * contexte : { gsap, ScrollTrigger, lenis, mouvementReduit, slug, racine, rendreMaths }
 */
export function creerMoteur(contexte = {}) {
  const ctx = creerContexte(contexte);

  const api = {
    gsap: ctx.gsap,
    ScrollTrigger: ctx.ScrollTrigger,
    lenis: ctx.lenis,
    mouvementReduit: ctx.mouvementReduit,
    slug: ctx.slug,
    racine: ctx.racine,

    reveler: (cibles, options) => reveler(ctx, cibles, options),
    dessiner: (elements, options) => dessiner(ctx, elements, options),
    rendreMaths: (element) => rendreMaths(ctx, element),

    exercice: {
      qcm: (conteneur, definition) => exoQcm(ctx, conteneur, definition),
      vraiFaux: (conteneur, definition) => exoVraiFaux(ctx, conteneur, definition),
      numerique: (conteneur, definition) => exoNumerique(ctx, conteneur, definition),
      reponseCourte: (conteneur, definition) => exoReponseCourte(ctx, conteneur, definition),
      schema: (conteneur, definition) => exoSchema(ctx, conteneur, definition),
    },

    quiz: (conteneur, questions, options) => construireQuiz(ctx, conteneur, questions, options),
    cartes: (conteneur, cartes, options) => construireCartes(ctx, conteneur, cartes, options),
    autoEvaluation: (conteneur, criteres, options) => construireAutoEvaluation(ctx, conteneur, criteres, options),

    sim: {
      curseurs: (conteneur, parametres, rappel) => simCurseurs(ctx, conteneur, parametres, rappel),
      traceur: (conteneur, options) => simTraceur(ctx, conteneur, options),
      oscilloscope: (conteneur, options) => simOscilloscope(ctx, conteneur, options),
      fresnel: (conteneur, options) => simFresnel(ctx, conteneur, options),
      bode: (conteneur, options) => simBode(ctx, conteneur, options),
      spectre: (conteneur, options) => simSpectre(ctx, conteneur, options),
      poignee: (svg, options) => simPoignee(ctx, svg, options),
      lecteur: (conteneur, options) => simLecteur(ctx, conteneur, options),
      valeurs: (conteneur, champs) => simValeurs(ctx, conteneur, champs),
    },

    stockage: {
      lire: (cle, defaut) => lireStockage(ctx, cle, defaut),
      ecrire: (cle, valeur) => ecrireStockage(ctx, cle, valeur),
      effacer: (cle) => effacerStockage(ctx, cle),
    },

    scores: () => calculerScores(ctx),
    surScores(rappel) {
      if (typeof rappel !== "function") return () => {};
      ctx.registre.abonnes.add(rappel);
      rappel(calculerScores(ctx));
      return () => ctx.registre.abonnes.delete(rappel);
    },

    util: {
      accord,
      creer,
      formater,
      lireNombre,
      normaliser,
      melanger: melangerTableau,
      formaterDecimal,
      pasJoli,
      couleurs: lireCouleurs,
      identifiant,
      icone,
    },

    surNettoyage: (fonction) => enregistrerNettoyeur(ctx, fonction),
    nettoyer: () => nettoyerTout(ctx),
  };

  ctx.api = api;
  return api;
}

export default creerMoteur;
