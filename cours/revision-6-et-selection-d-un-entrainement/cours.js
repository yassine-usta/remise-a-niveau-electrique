/* ==========================================================================
   cours/revision-6-et-selection-d-un-entrainement/cours.js
   Révision 6 et sélection d'un entraînement.
   Quatre quadrants, transmission, point de fonctionnement, cycle et couple
   efficace, démarrage d'une centrifugeuse, exercices, quiz et révision.
   N'utilise que l'objet api et le DOM de la racine.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];
let compteurMarqueurs = 0;

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const TAU = 2 * Math.PI;

/* --------------------------------------------------------------------------
   Modèles physiques communs
   -------------------------------------------------------------------------- */

/** Courbe de Kloss à glissement critique variable, en multiples de C_n. */
function modeleKloss(cd, cmax, gn) {
  const s = (2 * cmax) / cd;
  const gk1 = (s - Math.sqrt(s * s - 4)) / 2;
  const couple = (g, gk0) => {
    const gk = gk0 + (gk1 - gk0) * g;
    return (2 * cmax) / (g / gk + gk / g);
  };
  let bas = gn;
  let haut = gk1;
  for (let i = 0; i < 80; i += 1) {
    const milieu = (bas + haut) / 2;
    if (couple(gn, milieu) > 1) bas = milieu;
    else haut = milieu;
  }
  const gk0 = (bas + haut) / 2;
  return (g) => (g <= 0 ? 0 : couple(Math.min(g, 1), gk0));
}

/* Centrifugeuse de la section H. */
const CENTRI = {
  Jc: 12.0,
  Jm: 0.05,
  wf: (TAU * 3000) / 60,
  Cv: 10,
  Cacc: 70,
  Cn: 15000 / ((TAU * 2940) / 60),
  tp: 180,
  tr: 120,
};
const KLOSS_15 = modeleKloss(2.4, 3.0, 0.02);

/* Moteur du convoyeur : 4 kW, quatre pôles, 1440 tr/min. */
const CONV = { Cn: 4000 / ((TAU * 1440) / 60), ns: 1500 };
const KLOSS_4 = modeleKloss(2.3, 2.8, 0.04);

function tempsAcceleration(J, C, a, w) {
  if (a <= 0) return (J * w) / C;
  if (C <= a * w * w) return Infinity;
  const r = Math.sqrt(a * C);
  return (J / (2 * r)) * Math.log((Math.sqrt(C) + Math.sqrt(a) * w) / (Math.sqrt(C) - Math.sqrt(a) * w));
}

function tempsFreinage(J, C, a, w) {
  if (a <= 0) return (J * w) / C;
  const r = Math.sqrt(a * C);
  return (J / r) * Math.atan((Math.sqrt(a) * w) / Math.sqrt(C));
}

function vitesseAcceleration(J, C, a, t) {
  if (a <= 0) return (C * t) / J;
  return Math.sqrt(C / a) * Math.tanh((Math.sqrt(a * C) * t) / J);
}

function vitesseFreinage(J, C, a, w0, t) {
  if (a <= 0) return Math.max(0, w0 - (C * t) / J);
  const k = Math.sqrt(C / a);
  return Math.max(0, k * Math.tan(Math.atan(w0 / k) - (Math.sqrt(a * C) * t) / J));
}

/** Cycle complet de la centrifugeuse pour un couple limite et des durées données. */
function cycleCentri(p) {
  const J = CENTRI.Jc + CENTRI.Jm;
  const a = CENTRI.Cv / (CENTRI.wf * CENTRI.wf);
  const ta = tempsAcceleration(J, p.C, a, CENTRI.wf);
  const tf = tempsFreinage(J, p.C, a, CENTRI.wf);
  const phases = [
    { nom: "accélération", duree: ta, couple: p.C, beta: (1 + p.b0) / 2 },
    { nom: "palier", duree: p.tp, couple: CENTRI.Cv, beta: 1 },
    { nom: "freinage", duree: tf, couple: -p.C, beta: (1 + p.b0) / 2 },
    { nom: "arrêt", duree: p.tr, couple: 0, beta: p.b0 },
  ];
  const T = phases.reduce((s, ph) => s + ph.duree, 0);
  function etat(t) {
    let debut = 0;
    for (let i = 0; i < phases.length; i += 1) {
      const ph = phases[i];
      if (t <= debut + ph.duree || i === phases.length - 1) {
        const u = Math.max(0, Math.min(ph.duree, t - debut));
        let w = 0;
        if (i === 0) w = vitesseAcceleration(J, p.C, a, u);
        else if (i === 1) w = CENTRI.wf;
        else if (i === 2) w = vitesseFreinage(J, p.C, a, CENTRI.wf, u);
        let num = 0;
        let den = 0;
        for (let j = 0; j < i; j += 1) {
          num += phases[j].couple * phases[j].couple * phases[j].duree;
          den += phases[j].beta * phases[j].duree;
        }
        num += ph.couple * ph.couple * u;
        den += ph.beta * u;
        return { phase: ph.nom, indice: i, w, C: ph.couple, ceq: den > 0 ? Math.sqrt(num / den) : 0 };
      }
      debut += ph.duree;
    }
    return null;
  }
  const num = phases.reduce((s, ph) => s + ph.couple * ph.couple * ph.duree, 0);
  const den = phases.reduce((s, ph) => s + ph.beta * ph.duree, 0);
  const denSimple = T;
  return { J, a, ta, tf, T, phases, etat, ceq: Math.sqrt(num / den), ceqSimple: Math.sqrt(num / denSimple) };
}

/* --------------------------------------------------------------------------
   Utilitaires de dessin
   -------------------------------------------------------------------------- */

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function nombre(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
}

function marqueur(id, ouvert) {
  return (
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto-start-reverse">' +
    (ouvert ? '<path d="M0 0 10 5 0 10" fill="none" stroke="currentColor" stroke-width="1.6"/>' : '<path d="M0 0 10 5 0 10Z" fill="currentColor"/>') +
    "</marker>"
  );
}

function nouveauMarqueur(prefixe) {
  compteurMarqueurs += 1;
  return prefixe + "-" + compteurMarqueurs;
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

function seg(a, b, attributs = "") {
  return '<path d="M' + a[0].toFixed(1) + " " + a[1].toFixed(1) + "L" + b[0].toFixed(1) + " " + b[1].toFixed(1) + '"' + attributs + "/>";
}

function chaine(points) {
  return points.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';

function ligneV(c, repere, couleurs, x, libelle, tirets = [5, 5]) {
  const px = repere.versX(x);
  if (px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  c.save();
  c.setLineDash(tirets);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(px, repere.boite.y);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  c.setLineDash([]);
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.7;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

function ligneH(c, repere, couleurs, y, libelle, tirets = [7, 5]) {
  const py = repere.versY(y);
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.setLineDash(tirets);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(repere.boite.x, py);
  c.lineTo(repere.boite.x + repere.boite.l, py);
  c.stroke();
  c.setLineDash([]);
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    c.textAlign = "right";
    c.fillText(libelle, repere.boite.x + repere.boite.l - 4, py - 6);
  }
  c.restore();
}

/** Étiquette posée à gauche d'une ligne horizontale, pour ne pas gêner les autres libellés. */
function etiquetteGauche(c, repere, couleurs, y, libelle) {
  const py = repere.versY(y);
  c.save();
  c.fillStyle = couleurs.texte;
  c.font = POLICE;
  c.textAlign = "left";
  c.fillText(libelle, repere.boite.x + 6, py - 6);
  c.restore();
}

function pointTrace(c, repere, couleurs, x, y, libelle, creux) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return;
  if (px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.fillStyle = couleurs.texte;
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.6;
  c.beginPath();
  c.arc(px, py, 4.5, 0, TAU);
  if (creux) c.stroke();
  else c.fill();
  if (libelle) {
    c.font = POLICE;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.62;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -8 : 8), py - 8);
  }
  c.restore();
}

function traceCorrection(moteurApi, conteneur, options) {
  const traceur = moteurApi.sim.traceur(conteneur, {
    genre: "Correction visuelle",
    ratio: 0.42,
    echantillons: 300,
    ...options,
  });
  if (traceur) ressources.push(traceur);
  return traceur;
}

/** Schéma annoté inséré dans une correction, tracé progressivement. */
function schemaCorrection(moteurApi, conteneur, viewBox, dessin, legende) {
  const figure = document.createElement("figure");
  figure.className = "visuel-correction";
  const svg = svgEl("svg", { viewBox, role: "img", "aria-label": legende });
  svg.innerHTML = dessin;
  figure.appendChild(svg);
  const texteLegende = document.createElement("figcaption");
  texteLegende.textContent = legende;
  figure.appendChild(texteLegende);
  conteneur.appendChild(figure);
  const trace = moteurApi.dessiner(svg, { duree: 1.4 });
  if (trace) ressources.push(trace);
  return figure;
}

/** Lignes de calcul révélées une à une, dans un cadre. */
function dessinEtapes(lignes, largeur = 560) {
  const hauteur = 30 + lignes.length * 22;
  return (
    TRAITS + ' stroke-width="1.4"><rect x="6" y="6" width="' + (largeur - 12) + '" height="' + (hauteur - 12) + '" rx="8"/></g>' +
    ECRITS + lignes.map((ligne, i) => texte(22, 32 + i * 22, ligne)).join("") + "</g>"
  );
}

function hauteurEtapes(n) {
  return 30 + n * 22;
}

/** Barres horizontales annotées ; une barre pleine désigne la valeur décisive. */
function dessinBarres(lignes, maximum, unite, largeur = 560, seuil = null) {
  const x0 = 230;
  const l = largeur - x0 - 120;
  let d = TRAITS + ' stroke-width="1.4"><path d="M' + x0 + " 14V" + (24 + lignes.length * 30) + '"/></g>';
  d += '<g stroke="currentColor" stroke-width="1.4">';
  lignes.forEach(([, valeur, plein], i) => {
    const w = Math.max(1, (valeur / maximum) * l);
    d += '<rect x="' + x0 + '" y="' + (20 + i * 30) + '" width="' + w.toFixed(1) + '" height="18" rx="2" fill="currentColor" stroke="none" opacity="' + (plein ? 0.45 : 0.14) + '"/>';
    d += '<rect x="' + x0 + '" y="' + (20 + i * 30) + '" width="' + w.toFixed(1) + '" height="18" rx="2" fill="none"/>';
  });
  d += "</g>";
  if (seuil) {
    const xs = x0 + (seuil.valeur / maximum) * l;
    d += TRAITS + ' stroke-width="1.6" stroke-dasharray="6 4"><path d="M' + xs.toFixed(1) + " 10V" + (28 + lignes.length * 30) + '"/></g>';
  }
  d += ECRITS;
  lignes.forEach(([nom, valeur], i) => {
    d += texte(12, 33 + i * 30, nom) + texte(x0 + Math.max(1, (valeur / maximum) * l) + 8, 33 + i * 30, String(valeur).replace(".", ",") + " " + unite);
  });
  if (seuil) d += texte(x0 + (seuil.valeur / maximum) * l + 6, 46 + lignes.length * 30, seuil.libelle);
  return d + "</g>";
}

function hauteurBarres(n, seuil) {
  return 34 + n * 30 + (seuil ? 20 : 0);
}

/** Petit plan des quatre quadrants, pour le quiz et les corrections. */
function dessinQuadrants(numeros = true, surligne = null) {
  const O = [270, 170];
  let s = "";
  if (surligne === 2) s += '<rect x="70" y="40" width="200" height="130" fill="currentColor" fill-opacity="0.14" stroke="none"/>';
  s += TRAITS + ' stroke-width="1.6">' + seg([60, O[1]], [480, O[1]]) + seg([O[0], 30], [O[0], 310]) + "</g>";
  s += ECRITS + texte(484, O[1] + 4, "C") + texte(O[0] + 8, 30, "Ω");
  if (numeros) {
    s += texte(380, 100, "1", ' font-size="16"') + texte(160, 100, "2", ' font-size="16"') + texte(160, 250, "3", ' font-size="16"') + texte(380, 250, "4", ' font-size="16"');
  }
  s += texte(20, 340, "couple en abscisse, vitesse en ordonnée, convention moteur") + "</g>";
  return s;
}

const ZONES_QUADRANTS = [
  { x: 280, y: 40, largeur: 190, hauteur: 120, etiquette: "1" },
  { x: 70, y: 40, largeur: 190, hauteur: 120, etiquette: "2" },
  { x: 70, y: 180, largeur: 190, hauteur: 120, etiquette: "3" },
  { x: 280, y: 180, largeur: 190, hauteur: 120, etiquette: "4" },
];

/** Trois lois de couple en miniature, pour une correction. */
function dessinCharges() {
  const pts = (f) => {
    const p = [];
    for (let i = 0; i <= 30; i += 1) {
      const u = i / 30;
      p.push([60 + 380 * u, 220 - 110 * f(u)]);
    }
    return chaine(p);
  };
  return (
    TRAITS + ' stroke-width="1.4"><path d="M60 230V30M50 220H460"/></g>' +
    TRAITS + ' stroke-width="2.6"><path d="M60 110H440"/></g>' +
    TRAITS + ' stroke-width="2.4" stroke-dasharray="8 5"><polyline points="' + pts((u) => u * u) + '"/></g>' +
    TRAITS + ' stroke-width="2.4" stroke-dasharray="2 5"><polyline points="' + pts((u) => Math.min(1.7, 1 / Math.max(u, 0.01))) + '"/></g>' +
    ECRITS + texte(66, 28, "C_r") + texte(466, 224, "n") +
    texte(120, 102, "convoyeur : constant") + texte(330, 196, "pompe : en n²") + texte(100, 62, "enrouleur : en 1 / n") +
    texte(20, 262, "plein : constant ; tirets : quadratique ; pointillés : puissance constante") + "</g>"
  );
}

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeursAnimation = [];
  compteurMarqueurs = 0;

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireQuadrants(racine, api);
  construireReducteur(racine, api);
  construireSimPoint(racine, api);
  construireCycle(racine, api);
  construireSimDemarrage(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  api.reveler(racine.querySelectorAll(".formule-cle, .encadre, .cadre-tableau"), { decalage: 0.05 });
}

export function detruire() {
  for (const nettoyeur of nettoyeursAnimation) {
    try {
      nettoyeur();
    } catch (erreur) {
      /* le nettoyage ne doit jamais empêcher le chargement du cours suivant */
    }
  }
  nettoyeursAnimation = [];
  for (const ressource of ressources) {
    if (ressource && typeof ressource.detruire === "function") {
      try {
        ressource.detruire();
      } catch (erreur) {
        /* le nettoyage ne doit jamais empêcher le chargement du cours suivant */
      }
    }
  }
  ressources = [];
}

/* --------------------------------------------------------------------------
   Renvois vers les schémas placés au fil du texte
   -------------------------------------------------------------------------- */

function brancherRenvois(racine, api) {
  const liens = Array.from(racine.querySelectorAll("a[data-renvoi]"));
  if (!liens.length) return;

  function surClic(evenement) {
    const cible = racine.querySelector("#" + evenement.currentTarget.dataset.renvoi);
    if (!cible) return;
    evenement.preventDefault();
    const haut = Math.max(0, cible.getBoundingClientRect().top + window.scrollY - 90);
    if (api.lenis && typeof api.lenis.scrollTo === "function") api.lenis.scrollTo(haut);
    else window.scrollTo({ top: haut, behavior: api.mouvementReduit ? "auto" : "smooth" });
    cible.setAttribute("tabindex", "-1");
    cible.focus({ preventScroll: true });
  }

  for (const lien of liens) lien.addEventListener("click", surClic);
  nettoyeursAnimation.push(() => {
    for (const lien of liens) lien.removeEventListener("click", surClic);
  });
}

/* --------------------------------------------------------------------------
   Tracé progressif des schémas statiques
   -------------------------------------------------------------------------- */

function construireDessinsStatiques(racine, api) {
  const schemas = [
    ["#d-chaine-figure svg", 1.6],
    ["#e-charges-figure svg", 1.6],
    ["#f-couples-figure svg", 1.5],
    ["#h-figure svg", 1.7],
    ["#i-site-figure svg", 1.8],
  ];
  for (const [selecteur, duree] of schemas) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree }));
  }
}

/* --------------------------------------------------------------------------
   Corrections visuelles des questions de quiz
   -------------------------------------------------------------------------- */

function repere(index) {
  return '<span hidden data-q="' + index + '"></span>';
}

function brancherVisuelsQuiz(racine, api, selecteur, visuels) {
  const bloc = racine.querySelector(selecteur);
  if (!bloc || typeof MutationObserver !== "function") return;
  const observateur = new MutationObserver(() => {
    const verdict = bloc.querySelector(".m-verdict");
    if (!verdict || verdict.dataset.visuel === "1") return;
    if (verdict.getAttribute("data-etat") === "partiel") return;
    const marque = bloc.querySelector("[data-q]");
    if (!marque) return;
    const visuel = visuels[Number(marque.getAttribute("data-q"))];
    if (!visuel) return;
    verdict.dataset.visuel = "1";
    const conteneur = document.createElement("div");
    conteneur.className = "m-visuel";
    verdict.after(conteneur);
    const v = typeof visuel === "function" ? visuel() : visuel;
    schemaCorrection(api, conteneur, v.viewBox, v.dessin, v.legende);
  });
  observateur.observe(bloc, { childList: true, subtree: true });
  nettoyeursAnimation.push(() => observateur.disconnect());
}

/* --------------------------------------------------------------------------
   Synchronisation d'une poignée, de curseurs et d'un lecteur
   -------------------------------------------------------------------------- */

function synchroniseur(dessiner, options = {}) {
  const etatSync = { poignee: null, curseurs: null, lecteur: null, idCurseur: options.idCurseur, verrou: false, valeur: null };
  etatSync.appliquer = (valeur, source) => {
    if (etatSync.verrou) return;
    etatSync.verrou = true;
    etatSync.valeur = valeur;
    dessiner(valeur);
    if (source !== "poignee" && etatSync.poignee) etatSync.poignee.set(valeur, false);
    if (source !== "curseur" && etatSync.curseurs && etatSync.idCurseur) etatSync.curseurs.definir(etatSync.idCurseur, valeur);
    if (source !== "lecteur" && etatSync.lecteur) etatSync.lecteur.suivre(valeur);
    etatSync.verrou = false;
  };
  etatSync.redessiner = () => {
    if (etatSync.valeur != null) dessiner(etatSync.valeur);
  };
  return etatSync;
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-glissement",
      titre: "Glissement d'un moteur à quatre pôles",
      niveau: "prérequis",
      enonce:
        "<p>Un moteur asynchrone à quatre pôles, alimenté à $50\\ \\mathrm{Hz}$, tourne à $1470\\ \\mathrm{tr/min}$. Quel est son glissement, en pour cent ?</p>",
      valeur: 2,
      unite: "%",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Glissement $g$",
      etapes: [
        { texte: "Quatre pôles : $p = 2$, donc $n_s = 60f/p = 60 \\times 50/2 = 1500\\ \\mathrm{tr/min}$." },
        { texte: "$g = (n_s - n)/n_s = (1500 - 1470)/1500 = 0{,}02$." },
        { texte: "Soit $g = 2\\ \\%$.", note: "Sur variateur, l'écart $n_s - n$ reste voisin de $30\\ \\mathrm{tr/min}$ au même couple, quelle que soit la fréquence." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurEtapes(3),
          dessinEtapes(["n_s = 60 × 50 / 2 = 1500 tr/min", "g = (1500 - 1470) / 1500", "g = 0,02 = 2 %"], 560),
          "Étapes révélées une à une, de la vitesse de synchronisme au glissement."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-couple",
      titre: "Couple nominal du moteur de la pompe",
      niveau: "prérequis",
      enonce:
        "<p>Le moteur de la pompe du site a pour plaque $30\\ \\mathrm{kW}$ à $1475\\ \\mathrm{tr/min}$. Quel est son couple nominal, en newtons-mètres ?</p>",
      valeur: 30000 / ((TAU * 1475) / 60),
      unite: "N·m",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Couple nominal $C_n$",
      etapes: [
        { texte: "La puissance de plaque est la puissance mécanique utile : $P_n = C_n\\varOmega_n$." },
        { texte: "$\\varOmega_n = 2\\pi \\times 1475/60 = 154{,}46\\ \\mathrm{rad/s}$." },
        { texte: "$C_n = 30\\,000/154{,}46 = 194{,}2\\ \\mathrm{N\\cdot m}$.", note: "Repère utile : à $1500\\ \\mathrm{tr/min}$, $1\\ \\mathrm{kW}$ correspond à environ $6{,}4\\ \\mathrm{N\\cdot m}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurEtapes(3),
          dessinEtapes(["Ω_n = 2π × 1475 / 60 = 154,46 rad/s", "C_n = P_n / Ω_n = 30 000 / 154,46", "C_n = 194,2 N·m"], 560),
          "De la puissance de plaque au couple nominal."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-etoile",
      titre: "Couple de démarrage en étoile",
      niveau: "prérequis",
      enonce:
        "<p>Un moteur prévu pour être couplé en triangle sur le réseau a un couple de démarrage direct de $2{,}3\\,C_n$. Quel couple de démarrage, en multiples de $C_n$, offre-t-il couplé en étoile au démarrage ?</p>",
      valeur: 2.3 / 3,
      unite: "C_n",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Couple en étoile, en multiples de $C_n$",
      etapes: [
        { texte: "En étoile, chaque enroulement reçoit $U/\\sqrt{3}$ au lieu de $U$." },
        { texte: "Le couple varie comme le carré de la tension : facteur $(1/\\sqrt{3})^2 = 1/3$." },
        { texte: "$C_{d,Y} = 2{,}3/3 = 0{,}77\\,C_n$.", note: "Le courant de ligne est lui aussi divisé par trois : le rapport couple sur courant ne change pas." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurBarres(2),
          dessinBarres([["triangle, direct", 2.3, false], ["étoile", 0.77, true]], 2.5, "C_n"),
          "Le couple de démarrage est divisé par trois en étoile."
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : plan des quatre quadrants et cycle de la centrifugeuse
   -------------------------------------------------------------------------- */

function construireQuadrants(racine, api) {
  const conteneur = racine.querySelector("#d-quadrants");
  if (!conteneur) return;
  const O = { x: 210, y: 210 };
  const SX = 100;
  const SY = 150;
  const cyc = cycleCentri({ C: CENTRI.Cacc, tp: CENTRI.tp, tr: CENTRI.tr, b0: 0.5 });
  const cAcc = CENTRI.Cacc / CENTRI.Cn;
  const cPal = CENTRI.Cv / CENTRI.Cn;
  const versSvg = (c, w) => ({ x: O.x + c * SX, y: O.y - w * SY });
  const id = nouveauMarqueur("fl-d-quad");

  const svg = svgEl("svg", {
    viewBox: "0 0 760 420",
    role: "img",
    "aria-label": "Plan des quatre quadrants couple-vitesse avec le cycle de la centrifugeuse et le sens de l'énergie dans la chaîne d'entraînement",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(id);
  const fond = svgEl("g");
  const chemin = [
    versSvg(0, 0), versSvg(cAcc, 0), versSvg(cAcc, 1), versSvg(cPal, 1), versSvg(-cAcc, 1), versSvg(-cAcc, 0), versSvg(0, 0),
  ].map((p) => [p.x, p.y]);
  let f = '<rect x="40" y="45" width="170" height="165" fill="currentColor" fill-opacity="0.08" stroke="none"/>';
  f += '<rect x="210" y="210" width="170" height="165" fill="currentColor" fill-opacity="0.08" stroke="none"/>';
  f += TRAITS + ' stroke-width="1.5">' + seg([30, O.y], [392, O.y], ' marker-end="url(#' + id + ')"') + seg([O.x, 388], [O.x, 34], ' marker-end="url(#' + id + ')"');
  for (const c of [-1.5, -1, -0.5, 0.5, 1, 1.5]) f += seg([O.x + c * SX, O.y - 4], [O.x + c * SX, O.y + 4]);
  for (const w of [-1, 1]) f += seg([O.x - 4, O.y - w * SY], [O.x + 4, O.y - w * SY]);
  f += "</g>";
  f += TRAITS + ' stroke-width="1.6" stroke-dasharray="2 4"><polyline points="' + chaine(chemin) + '"/></g>';
  f += ECRITS +
    texte(396, O.y + 4, "C / C_n") + texte(O.x + 8, 30, "Ω / Ω_ref") +
    texte(O.x + 1 * SX - 4, O.y + 20, "1") + texte(O.x - 1 * SX - 8, O.y + 20, "-1") + texte(O.x - 16, O.y - SY - 6, "1") + texte(O.x + 8, O.y + SY + 4, "-1") +
    texte(250, 46, "I : moteur, avant") + texte(46, 46, "II : frein, avant") + texte(46, 368, "III : moteur, arrière") + texte(250, 368, "IV : frein, arrière") +
    texte(440, 60, "sens de l'énergie") + texte(20, 410, "pointillés : cycle de la centrifugeuse ; zones ombrées : freinage ; Ω_ref = 3000 tr/min") + "</g>";
  f += TRAITS + ' stroke-width="1.8"><rect x="430" y="150" width="70" height="36" rx="5"/><rect x="520" y="150" width="80" height="36" rx="5"/>' +
    '<rect x="620" y="150" width="60" height="36" rx="5"/><rect x="696" y="150" width="58" height="36" rx="5"/><rect x="520" y="240" width="80" height="36" rx="5"/></g>';
  f += ECRITS + texte(465, 173, "réseau", ' text-anchor="middle"') + texte(560, 173, "variateur", ' text-anchor="middle"') +
    texte(650, 173, "moteur", ' text-anchor="middle"') + texte(725, 173, "charge", ' text-anchor="middle"') + texte(560, 263, "résistance", ' text-anchor="middle"') + "</g>";
  fond.innerHTML = f;
  const fleches = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round" });
  const lignesTexte = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, fleches, lignesTexte);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-quadrants-valeurs", [
    { id: "C", libelle: "Couple moteur", unite: "N·m", decimales: 1 },
    { id: "n", libelle: "Vitesse", unite: "tr/min", decimales: 0 },
    { id: "P", libelle: "Puissance mécanique C Ω", unite: "kW", decimales: 2 },
    { id: "quadrant", libelle: "Quadrant", format: (v) => v },
    { id: "energie", libelle: "Énergie", format: (v) => v },
    { id: "temps", libelle: "Instant du cycle", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function fleche(a, b, plein) {
    return seg(a, b, ' stroke-width="' + (plein ? 2.4 : 1.2) + '"' + (plein ? ' marker-end="url(#' + id + ')"' : ' stroke-dasharray="3 4"'));
  }

  function dessiner(c, w, instant) {
    const C = c * CENTRI.Cn;
    const omega = (w * TAU * 3000) / 60;
    const P = C * omega;
    const Pn = 15000;
    let quadrant = "sur un axe";
    if (Math.abs(c) > 0.02 && Math.abs(w) > 0.02) {
      if (c > 0 && w > 0) quadrant = "I : moteur, marche avant";
      else if (c < 0 && w > 0) quadrant = "II : frein, marche avant";
      else if (c < 0 && w < 0) quadrant = "III : moteur, marche arrière";
      else quadrant = "IV : frein, marche arrière";
    }
    let energie = "aucun échange de puissance mécanique";
    let d = "";
    const y = 168;
    if (P > 0.02 * Pn) {
      energie = "du réseau vers la charge";
      d += fleche([500, y], [518, y], true) + fleche([600, y], [618, y], true) + fleche([680, y], [694, y], true) + fleche([560, 186], [560, 238], false);
    } else if (P < -0.02 * Pn) {
      energie = "de la charge vers le bus continu, puis la résistance";
      d += fleche([696, y], [682, y], true) + fleche([620, y], [602, y], true) + fleche([560, 186], [560, 238], true) + fleche([518, y], [500, y], false);
    } else {
      d += fleche([500, y], [518, y], false) + fleche([600, y], [618, y], false) + fleche([680, y], [694, y], false) + fleche([560, 186], [560, 238], false);
    }
    fleches.innerHTML = d;
    lignesTexte.innerHTML =
      texte(430, 312, "quadrant " + quadrant) +
      texte(430, 332, "P = C Ω = " + nombre(api, P / 1000, 2) + " kW") +
      texte(430, 352, P < -0.02 * Pn ? "pont à diodes bloqué : pas de retour réseau" : P > 0.02 * Pn ? "le moteur fournit l'énergie" : "");
    if (valeurs) {
      valeurs.maj({
        C,
        n: w * 3000,
        P: P / 1000,
        quadrant,
        energie,
        temps: instant || "point libre",
      });
    }
  }

  let poignee = null;
  poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: O.x - 170, y: O.y - 165, largeur: 340, hauteur: 330 },
    valeur: versSvg(cAcc, 0.5),
    pas: 5,
    libelle: "Point de fonctionnement dans le plan couple-vitesse",
    diffuserAuDepart: false,
    rappel: (mesure) => dessiner((mesure.x - O.x) / SX, (O.y - mesure.y) / SY, null),
  });
  if (poignee) ressources.push(poignee);

  const lecteur = api.sim.lecteur("#d-quadrants-lecteur", {
    de: 0,
    a: 1,
    duree: 14,
    boucle: true,
    auto: false,
    libelle: "Parcourir le cycle de la centrifugeuse",
    rappel: (s) => {
      const t = s * cyc.T;
      const e = cyc.etat(t);
      if (!e) return;
      const c = e.C / CENTRI.Cn;
      const w = e.w / CENTRI.wf;
      if (poignee) poignee.set(versSvg(c, w), false);
      dessiner(c, w, e.phase + ", t = " + nombre(api, t, 1) + " s");
    },
  });
  if (lecteur) ressources.push(lecteur);

  if (poignee) poignee.set(versSvg(cAcc, 0.5), false);
  dessiner(cAcc, 0.5, null);
}

/* --------------------------------------------------------------------------
   E. Animation : transmission par courroie et inertie ramenée
   -------------------------------------------------------------------------- */

function construireReducteur(racine, api) {
  const conteneur = racine.querySelector("#e-reducteur");
  if (!conteneur) return;
  const M = { x: 210, y: 150 };
  const L = { x: 520, y: 150 };
  const AXE = { de: { x: 120, y: 310 }, a: { x: 640, y: 310 } };
  const reglages = { k: 1, t: 0, thetaC: 0, thetaM: 0 };
  const wc = CENTRI.wf;

  const svg = svgEl("svg", {
    viewBox: "0 0 760 340",
    role: "img",
    "aria-label": "Transmission par courroie entre un moteur et une centrifugeuse, rapport de vitesse réglable",
  });
  const fond = svgEl("g");
  let f = TRAITS + ' stroke-width="1.4">' + seg([AXE.de.x, AXE.de.y], [AXE.a.x, AXE.a.y]);
  let e = ECRITS;
  for (let k = 0.5; k <= 3.001; k += 0.5) {
    const x = AXE.de.x + ((k - 0.5) / 2.5) * (AXE.a.x - AXE.de.x);
    f += seg([x, AXE.de.y - 6], [x, AXE.de.y + 6]);
    e += texte(x, AXE.de.y + 22, String(k).replace(".", ","), ' text-anchor="middle"');
  }
  f += "</g>";
  e += texte(660, AXE.de.y + 4, "k = n_m / n_c") + "</g>";
  fond.innerHTML = f + e;
  const mobile = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round" });
  const ecrits = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(fond, mobile, ecrits);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-reducteur-valeurs", [
    { id: "k", libelle: "Rapport k = n_m / n_c", decimales: 2 },
    { id: "nm", libelle: "Vitesse du moteur", unite: "tr/min", decimales: 0 },
    { id: "J", libelle: "Inertie vue du moteur", unite: "kg·m²", decimales: 2 },
    { id: "C", libelle: "Couple moteur pour 60 s", unite: "N·m", decimales: 1 },
    { id: "P", libelle: "Puissance de pointe", unite: "kW", decimales: 2 },
    { id: "statut", libelle: "Moteur envisageable", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const k = reglages.k;
    const rm = 70 / Math.sqrt(k);
    const rc = 70 * Math.sqrt(k);
    const dist = L.x - M.x;
    const alpha = Math.asin((rc - rm) / dist);
    const haut = [
      [M.x - rm * Math.sin(alpha), M.y - rm * Math.cos(alpha)],
      [L.x - rc * Math.sin(alpha), L.y - rc * Math.cos(alpha)],
    ];
    const bas = [
      [M.x - rm * Math.sin(alpha), M.y + rm * Math.cos(alpha)],
      [L.x - rc * Math.sin(alpha), L.y + rc * Math.cos(alpha)],
    ];
    const thetaC = reglages.thetaC;
    const thetaM = reglages.thetaM;
    const rayon = (c, r, deg) => [c.x + r * Math.cos((deg * Math.PI) / 180), c.y + r * Math.sin((deg * Math.PI) / 180)];
    mobile.innerHTML =
      '<circle cx="' + M.x + '" cy="' + M.y + '" r="' + rm.toFixed(1) + '" stroke-width="2.4"/>' +
      '<circle cx="' + L.x + '" cy="' + L.y + '" r="' + rc.toFixed(1) + '" stroke-width="2.4"/>' +
      '<circle cx="' + M.x + '" cy="' + M.y + '" r="6" fill="currentColor"/>' +
      '<circle cx="' + L.x + '" cy="' + L.y + '" r="6" fill="currentColor"/>' +
      seg(haut[0], haut[1], ' stroke-width="2"') + seg(bas[0], bas[1], ' stroke-width="2"') +
      seg([M.x, M.y], rayon(M, rm - 6, thetaM), ' stroke-width="3"') +
      seg([L.x, L.y], rayon(L, rc - 6, thetaC), ' stroke-width="3"');
    const J = CENTRI.Jm + CENTRI.Jc / (k * k);
    const nm = 3000 * k;
    const C = (J * k * wc) / 60;
    const P = (C * k * wc) / 1000;
    let statut;
    if (nm <= 1550) statut = "quatre pôles à 50 Hz, ou plus de pôles";
    else if (nm <= 3100) statut = "deux pôles à 50 Hz";
    else if (nm <= 3700) statut = "deux pôles sur variateur, au-delà de 50 Hz";
    else statut = "vitesse excessive pour un moteur standard";
    ecrits.innerHTML =
      texte(M.x, 270, "moteur", ' text-anchor="middle"') + texte(M.x, 286, "n_m = " + nombre(api, nm, 0) + " tr/min", ' text-anchor="middle"') +
      texte(L.x, 286, "centrifugeuse, 3000 tr/min", ' text-anchor="middle"') + texte(20, 24, "J vu du moteur = 0,05 + 12 / k² = " + nombre(api, J, 2) + " kg·m²") +
      texte(20, 42, "couple pour 60 s = " + nombre(api, C, 1) + " N·m ; pointe = " + nombre(api, P, 1) + " kW");
    if (valeurs) valeurs.maj({ k, nm, J, C, P, statut });
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: AXE.de,
    a: AXE.a,
    min: 0.5,
    max: 3,
    pas: 0.05,
    valeur: 1,
    libelle: "Rapport de transmission k",
    diffuserAuDepart: false,
    rappel: (mesure) => {
      reglages.k = mesure.valeur;
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const lecteur = api.sim.lecteur("#e-reducteur-lecteur", {
    de: 0,
    a: 1,
    duree: 5,
    boucle: true,
    auto: false,
    libelle: "Rotation des poulies, ralentie",
    rappel: (t) => {
      let dt = t - reglages.t;
      if (dt < -0.5) dt += 1;
      if (Math.abs(dt) > 0.5) dt = 0;
      reglages.t = t;
      reglages.thetaC = (reglages.thetaC + 360 * dt) % 360;
      reglages.thetaM = (reglages.thetaM + 360 * reglages.k * dt) % 360;
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);

  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : point de fonctionnement du moteur du convoyeur
   -------------------------------------------------------------------------- */

const NOMS_CHARGES = ["", "couple constant", "quadratique", "puissance constante"];

function coupleCharge(type, C0, b, n) {
  const decol = 1 + (b - 1) * Math.exp(-n / 40);
  if (type === 1) return C0 * decol;
  if (type === 2) return C0 * (0.08 * decol + 0.92 * (n / 1440) * (n / 1440));
  return (C0 * 1440) / Math.max(n, 720);
}

function coupleMoteurConv(u, n) {
  const g = 1 - n / CONV.ns;
  return u * u * CONV.Cn * KLOSS_4(g);
}

function analysePoint(r) {
  const C0 = (r.niveau / 100) * CONV.Cn;
  const b = r.decol / 100;
  const cm0 = coupleMoteurConv(r.u, 0.001);
  const cr0 = coupleCharge(r.type, C0, b, 0);
  let minAcc = Infinity;
  let neq = null;
  let precedent = cm0 - cr0;
  if (precedent > 0) {
    for (let n = 1; n < CONV.ns; n += 1) {
      const diff = coupleMoteurConv(r.u, n) - coupleCharge(r.type, C0, b, n);
      if (diff <= 0) {
        neq = n - 1 + precedent / (precedent - diff);
        break;
      }
      if (diff < minAcc) minAcc = diff;
      precedent = diff;
    }
  }
  if (neq != null) {
    minAcc = cm0 - cr0;
    for (let n = 1; n <= 0.8 * neq; n += 1) {
      const diff = coupleMoteurConv(r.u, n) - coupleCharge(r.type, C0, b, n);
      if (diff < minAcc) minAcc = diff;
    }
  }
  return { C0, b, cm0, cr0, minAcc: Math.min(minAcc, cm0 - cr0), neq };
}

function construireSimPoint(racine, api) {
  const reglages = { type: 1, niveau: 87.3, decol: 150, u: 1 };
  let analyse = analysePoint(reglages);

  const trace = api.sim.traceur("#e-point-trace", {
    titre: "Couple du moteur et couple résistant",
    xTitre: "vitesse n",
    xUnite: "tr/min",
    yTitre: "couple",
    yUnite: "N·m",
    xMin: 0,
    xMax: 1500,
    yMin: 0,
    yMax: 80,
    ratio: 0.5,
    series: [
      { id: "m", nom: "couple du moteur", couleur: "serie-1", epaisseur: 2.8, fonction: (n) => coupleMoteurConv(reglages.u, Math.max(n, 0.001)) },
      { id: "r", nom: "couple résistant", couleur: "serie-5", epaisseur: 2.4, fonction: (n) => coupleCharge(reglages.type, analyse.C0, analyse.b, n) },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, CONV.Cn, "", [3, 5]);
      etiquetteGauche(c, repere, couleurs, CONV.Cn, "C_n = 26,5 N·m");
      if (analyse.neq != null) {
        const ceq = coupleCharge(reglages.type, analyse.C0, analyse.b, analyse.neq);
        pointTrace(c, repere, couleurs, analyse.neq, ceq, "équilibre, " + nombre(api, analyse.neq, 0) + " tr/min");
      } else {
        pointTrace(c, repere, couleurs, 0, analyse.cr0, "ne démarre pas", true);
      }
    },
  });
  if (trace) ressources.push(trace);

  const curseurs = api.sim.curseurs(
    "#e-point-curseurs",
    [
      { id: "type", libelle: "Famille de charge", min: 1, max: 3, pas: 1, valeur: 1, format: (v) => NOMS_CHARGES[Math.round(v)] || "" },
      { id: "niveau", libelle: "Couple de la charge au régime nominal", min: 20, max: 130, pas: 0.1, valeur: 87.3, unite: "% de C_n" },
      { id: "decol", libelle: "Couple de décollement", min: 100, max: 200, pas: 5, valeur: 150, unite: "% du couple de régime" },
      { id: "u", libelle: "Tension appliquée U / U_n", min: 0.5, max: 1.1, pas: 0.01, valeur: 1, format: (v) => nombre(api, v, 2) },
    ],
    (lues) => {
      reglages.type = Math.round(lues.type);
      reglages.niveau = lues.niveau;
      reglages.decol = lues.decol;
      reglages.u = lues.u;
      analyse = analysePoint(reglages);
      if (!trace) return;
      trace.definirFonction("m", (n) => coupleMoteurConv(reglages.u, Math.max(n, 0.001)));
      trace.definirFonction("r", (n) => coupleCharge(reglages.type, analyse.C0, analyse.b, n));
      const demarre = analyse.neq != null;
      const mesures = [
        { nom: "Couple moteur à l'arrêt", valeur: nombre(api, analyse.cm0, 1) + " N·m, " + nombre(api, analyse.cm0 / CONV.Cn, 2) + " C_n" },
        { nom: "Couple demandé à l'arrêt", valeur: nombre(api, analyse.cr0, 1) + " N·m, " + nombre(api, analyse.cr0 / CONV.Cn, 2) + " C_n" },
        { nom: "Démarrage", valeur: demarre ? "oui, marge " + nombre(api, (analyse.cm0 / analyse.cr0 - 1) * 100, 0) + " % à l'arrêt" : "non : couple insuffisant au décollement" },
      ];
      if (demarre) {
        const g = 1 - analyse.neq / CONV.ns;
        const ceq = coupleCharge(reglages.type, analyse.C0, analyse.b, analyse.neq);
        mesures.push(
          { nom: "Couple accélérateur minimal jusqu'à 80 % de la vitesse", valeur: nombre(api, analyse.minAcc, 1) + " N·m" },
          { nom: "Vitesse d'équilibre", valeur: nombre(api, analyse.neq, 0) + " tr/min" },
          { nom: "Glissement", valeur: nombre(api, g * 100, 1) + " %" + (g > 0.08 ? ", élevé : le rotor chauffe" : "") },
          { nom: "Puissance utile", valeur: nombre(api, (ceq * analyse.neq * TAU) / 60 / 1000, 2) + " kW" }
        );
      }
      trace.definirMesures(mesures);
    }
  );
  if (curseurs) ressources.push(curseurs);
}

/* --------------------------------------------------------------------------
   E. Animation : chronogramme du cycle et couple efficace
   -------------------------------------------------------------------------- */

function construireCycle(racine, api) {
  const conteneur = racine.querySelector("#e-cycle");
  if (!conteneur) return;
  const X0 = 70;
  const X1 = 730;
  const YN0 = 150;
  const KN = 110 / 3000;
  const YC0 = 262;
  const KC = 0.85;
  const AXE = { de: { x: X0, y: 372 }, a: { x: X1, y: 372 } };
  const reglages = { C: 70, tp: 180, tr: 120, b0: 0.5 };
  let cyc = cycleCentri(reglages);

  const svg = svgEl("svg", {
    viewBox: "0 0 760 400",
    role: "img",
    "aria-label": "Chronogramme de la vitesse et du couple de la centrifugeuse sur un cycle, avec le couple efficace",
  });
  const fond = svgEl("g");
  fond.innerHTML =
    TRAITS + ' stroke-width="1.3">' + seg([X0, 30], [X0, YN0]) + seg([X0, YN0], [X1, YN0]) + seg([X0, YC0 - 100], [X0, YC0 + 100]) + seg([X0, YC0], [X1, YC0]) + seg([AXE.de.x, AXE.de.y], [AXE.a.x, AXE.a.y]) + "</g>" +
    ECRITS + texte(16, 40, "n") + texte(16, 56, "tr/min") + texte(16, YC0 - 84, "C") + texte(16, YC0 - 68, "N·m") +
    texte(X0 - 8, YN0 - 110 + 4, "3000", ' text-anchor="end"') + texte(X0 - 8, YC0 - 85 + 4, "100", ' text-anchor="end"') +
    texte(X0 - 8, YC0 + 85 + 4, "-100", ' text-anchor="end"') + texte(X0 - 8, YC0 + 4, "0", ' text-anchor="end"') +
    texte(X1 - 140, AXE.de.y + 22, "temps du cycle") + "</g>";
  const courbes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round" });
  const curseurTemps = svgEl("g", { fill: "none", stroke: "currentColor" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(fond, courbes, curseurTemps, etiquettes);
  conteneur.appendChild(svg);

  const versX = (t) => X0 + (t / cyc.T) * (X1 - X0);
  const versYN = (w) => YN0 - ((w * 60) / TAU) * KN;
  const versYC = (C) => YC0 - C * KC;

  const valeurs = api.sim.valeurs("#e-cycle-valeurs", [
    { id: "t", libelle: "Instant", unite: "s", decimales: 1 },
    { id: "phase", libelle: "Phase", format: (v) => v },
    { id: "n", libelle: "Vitesse", unite: "tr/min", decimales: 0 },
    { id: "C", libelle: "Couple moteur", unite: "N·m", decimales: 1 },
    { id: "P", libelle: "Puissance mécanique", unite: "kW", decimales: 2 },
    { id: "ceqT", libelle: "Couple efficace cumulé", unite: "N·m", decimales: 1 },
    { id: "ceq", libelle: "Couple efficace du cycle, pondéré", unite: "N·m", decimales: 1 },
    { id: "ceqS", libelle: "Couple efficace, non pondéré", unite: "N·m", decimales: 1 },
    { id: "durees", libelle: "Accélération et freinage", format: (v) => v },
    { id: "verdict", libelle: "Moteur 15 kW et variateur", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function tracerCourbes() {
    const ptsN = [];
    const ptsC = [];
    const N = 260;
    for (let i = 0; i <= N; i += 1) {
      const t = (cyc.T * i) / N;
      const e = cyc.etat(t);
      ptsN.push([versX(t), versYN(e.w)]);
    }
    let t0 = 0;
    for (const ph of cyc.phases) {
      ptsC.push([versX(t0), versYC(ph.couple)], [versX(t0 + ph.duree), versYC(ph.couple)]);
      t0 += ph.duree;
    }
    let d = '<polyline points="' + chaine(ptsN) + '" stroke-width="2.6"/>';
    d += '<polyline points="' + chaine(ptsC) + '" stroke-width="2.6"/>';
    for (const s of [1, -1]) {
      d += seg([X0, versYC(s * cyc.ceq)], [X1, versYC(s * cyc.ceq)], ' stroke-width="1.4" stroke-dasharray="8 5"');
      d += seg([X0, versYC(s * CENTRI.Cn)], [X1, versYC(s * CENTRI.Cn)], ' stroke-width="1.2" stroke-dasharray="2 4"');
    }
    courbes.innerHTML = d;
    let e = "";
    t0 = 0;
    for (const ph of cyc.phases) {
      const xm = versX(t0 + ph.duree / 2);
      if (versX(t0 + ph.duree) - versX(t0) > 64) e += texte(xm, 24, ph.nom, ' text-anchor="middle"');
      t0 += ph.duree;
    }
    e += texte(X0 + 6, versYC(-cyc.ceq) + 16, "C_eq = " + nombre(api, cyc.ceq, 1));
    e += texte(X1 - 4, versYC(-CENTRI.Cn) + 16, "C_n = 48,7", ' text-anchor="end"');
    e += texte(X0 + 4, AXE.de.y + 22, "0") + texte(X1, AXE.de.y + 22 + 16, nombre(api, cyc.T, 0) + " s", ' text-anchor="end"');
    etiquettes.innerHTML = e;
  }

  function dessiner(s) {
    const t = s * cyc.T;
    const e = cyc.etat(t);
    const x = versX(t);
    curseurTemps.innerHTML =
      seg([x, 30], [x, AXE.de.y - 8], ' stroke-width="1.4"') +
      '<circle cx="' + x.toFixed(1) + '" cy="' + versYN(e.w).toFixed(1) + '" r="4.5" fill="currentColor"/>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + versYC(e.C).toFixed(1) + '" r="4.5" fill="currentColor"/>';
    const ok = [];
    if (cyc.ta > 60) ok.push("accélération trop lente");
    if (cyc.tf > 60) ok.push("freinage trop lent");
    if (reglages.C > 1.5 * CENTRI.Cn) ok.push("surcharge du variateur dépassée");
    if (cyc.ceq > CENTRI.Cn) ok.push("échauffement excessif");
    if (valeurs) {
      valeurs.maj({
        t,
        phase: e.phase,
        n: (e.w * 60) / TAU,
        C: e.C,
        P: (e.C * e.w) / 1000,
        ceqT: e.ceq,
        ceq: cyc.ceq,
        ceqS: cyc.ceqSimple,
        durees: nombre(api, cyc.ta, 1) + " s et " + nombre(api, cyc.tf, 1) + " s",
        verdict: ok.length ? ok.join(", ") : "conforme, C_eq = " + nombre(api, (cyc.ceq / CENTRI.Cn) * 100, 0) + " % de C_n",
      });
    }
  }

  const synchro = synchroniseur(dessiner);

  const curseurs = api.sim.curseurs(
    "#e-cycle-curseurs",
    [
      { id: "C", libelle: "Couple limite d'accélération et de freinage", min: 40, max: 100, pas: 1, valeur: 70, unite: "N·m" },
      { id: "tp", libelle: "Durée du palier", min: 60, max: 400, pas: 10, valeur: 180, unite: "s" },
      { id: "tr", libelle: "Durée de l'arrêt", min: 30, max: 300, pas: 10, valeur: 120, unite: "s" },
      { id: "b0", libelle: "Ventilation à l'arrêt β_0", min: 0.3, max: 1, pas: 0.05, valeur: 0.5, format: (v) => nombre(api, v, 2) },
    ],
    (lues) => {
      Object.assign(reglages, lues);
      cyc = cycleCentri(reglages);
      tracerCourbes();
      synchro.redessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: AXE.de,
    a: AXE.a,
    min: 0,
    max: 1,
    pas: 0.005,
    valeur: 0.1,
    libelle: "Instant dans le cycle",
    diffuserAuDepart: false,
    format: (m) => nombre(api, m.valeur * cyc.T, 0) + " s",
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  synchro.lecteur = api.sim.lecteur("#e-cycle-lecteur", {
    de: 0,
    a: 1,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Dérouler le cycle",
    rappel: (s) => synchro.appliquer(s, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);

  tracerCourbes();
  synchro.appliquer(0.1, null);
}

/* --------------------------------------------------------------------------
   H. Simulation : démarrage de la centrifugeuse, direct ou par variateur
   -------------------------------------------------------------------------- */

function simulerDemarrages(r) {
  const J = r.Jc + CENTRI.Jm;
  const wf = CENTRI.wf;
  const a = r.Cv / (wf * wf);
  const Cn = CENTRI.Cn;
  const ws = wf;
  const wn = (TAU * 2940) / 60;
  const dt = 0.005;
  const direct = [[0, 0]];
  let w = 0;
  let t = 0;
  let Er = 0;
  let tDirect = null;
  let ErDirect = null;
  const tFin = 400;
  let pas = 0;
  while (t < tFin) {
    const g = 1 - w / ws;
    const Cm = KLOSS_15(g) * Cn;
    const Cr = a * w * w;
    Er += g * Cm * ws * dt;
    w += ((Cm - Cr) / J) * dt;
    t += dt;
    pas += 1;
    if (tDirect == null && w >= wn) {
      tDirect = t;
      ErDirect = Er;
    }
    if (pas % 40 === 0) direct.push([t, (w * 60) / TAU]);
    if (tDirect != null && t > tDirect * 1.6 + 5) break;
    if (Cm - Cr < 1e-3 && t > 5) break;
  }
  const C = r.Clim;
  const tVar = tempsAcceleration(J, C, a, wf);
  const variateur = [];
  const tTrace = Number.isFinite(tVar) ? tVar : 400;
  for (let i = 0; i <= 200; i += 1) {
    const ti = (tTrace * i) / 200;
    variateur.push([ti, (Math.min(vitesseAcceleration(J, C, a, ti), wf) * 60) / TAU]);
  }
  const wGl = TAU * (C / Cn);
  return {
    J,
    a,
    direct,
    variateur,
    tDirect,
    ErDirect,
    nPlafond: (w * 60) / TAU,
    tVar,
    nEqVar: a > 0 ? (Math.sqrt(C / a) * 60) / TAU : Infinity,
    ErVar: Number.isFinite(tVar) ? C * wGl * tVar : Infinity,
    iVar: Math.sqrt(0.16 + 0.84 * (C / Cn) * (C / Cn)),
    Ec: 0.5 * J * wf * wf,
  };
}

function construireSimDemarrage(racine, api) {
  const reglages = { Jc: 12, Clim: 70, Cv: 10 };
  let res = simulerDemarrages(reglages);

  const trace = api.sim.traceur("#h-sim-trace", {
    titre: "Démarrage de la centrifugeuse : vitesse en fonction du temps",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "vitesse",
    yUnite: "tr/min",
    xMin: 0,
    xMax: 80,
    yMin: 0,
    yMax: 3300,
    ratio: 0.5,
    series: [
      { id: "d", nom: "démarrage direct", couleur: "serie-5", epaisseur: 2.4, points: res.direct },
      { id: "v", nom: "variateur à couple limité", couleur: "serie-1", epaisseur: 2.8, points: res.variateur },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 3000, "3000 tr/min", [3, 5]);
      ligneV(c, repere, couleurs, 60, "60 s");
      if (res.tDirect != null) pointTrace(c, repere, couleurs, res.tDirect, 2940, "direct : " + nombre(api, res.tDirect, 1) + " s");
      if (Number.isFinite(res.tVar)) pointTrace(c, repere, couleurs, res.tVar, 3000, "variateur : " + nombre(api, res.tVar, 1) + " s");
    },
  });
  if (trace) ressources.push(trace);

  function mettreAJour() {
    res = simulerDemarrages(reglages);
    if (!trace) return;
    const tMax = Math.min(400, Math.max(20, Math.ceil((Math.max(res.tDirect || 0, Number.isFinite(res.tVar) ? res.tVar : 120) * 1.2) / 10) * 10));
    trace.definirPlage({ xMin: 0, xMax: tMax, yMin: 0, yMax: 3300 });
    trace.definirDonnees("d", res.direct.filter((p) => p[0] <= tMax));
    trace.definirDonnees("v", res.variateur.concat([[tMax, res.variateur[res.variateur.length - 1][1]]]));
    const pourcent = (reglages.Clim / CENTRI.Cn) * 100;
    const verdictDirect =
      res.tDirect == null ? "n'atteint pas 2940 tr/min" : res.tDirect <= 15 ? "acceptable sous réserve du constructeur" : "refusé : démarrage trop long à fort courant";
    let verdictVar;
    if (!Number.isFinite(res.tVar)) verdictVar = "consigne jamais atteinte, plafond à " + nombre(api, res.nEqVar, 0) + " tr/min";
    else if (pourcent > 150.5) verdictVar = "refusé : couple au-delà de 1,5 C_n";
    else if (res.tVar > 60) verdictVar = "refusé : plus de 60 s, hors cahier des charges";
    else verdictVar = "conforme";
    trace.definirMesures([
      { nom: "Direct, durée jusqu'à 2940 tr/min", valeur: res.tDirect == null ? "non atteinte" : nombre(api, res.tDirect, 1) + " s" },
      { nom: "Direct, énergie dissipée dans le rotor", valeur: res.ErDirect == null ? "indéfinie" : nombre(api, res.ErDirect / 1000, 0) + " kJ" },
      { nom: "Direct, courant", valeur: "de 6 à 7,5 I_n pendant presque tout le démarrage, ordre de grandeur de catalogue" },
      { nom: "Verdict direct", valeur: verdictDirect },
      { nom: "Variateur, couple limite", valeur: nombre(api, reglages.Clim, 1) + " N·m, " + nombre(api, pourcent, 0) + " % de C_n" },
      { nom: "Variateur, durée jusqu'à 3000 tr/min", valeur: Number.isFinite(res.tVar) ? nombre(api, res.tVar, 1) + " s" : "infinie" },
      { nom: "Variateur, courant estimé", valeur: nombre(api, res.iVar, 2) + " I_n" },
      { nom: "Variateur, énergie dissipée dans le rotor", valeur: Number.isFinite(res.ErVar) ? nombre(api, res.ErVar / 1000, 1) + " kJ" : "croissante sans limite" },
      { nom: "Verdict variateur", valeur: verdictVar },
      { nom: "Énergie cinétique au palier", valeur: nombre(api, res.Ec / 1000, 1) + " kJ" },
    ]);
  }

  const curseurs = api.sim.curseurs(
    "#h-sim-curseurs",
    [
      { id: "Jc", libelle: "Inertie du panier chargé J_c", min: 1, max: 30, pas: 0.5, valeur: 12, unite: "kg·m²" },
      { id: "Clim", libelle: "Couple limite du variateur", min: 10, max: 74, pas: 0.5, valeur: 70, unite: "N·m" },
      { id: "Cv", libelle: "Couple de ventilation à 3000 tr/min", min: 0, max: 30, pas: 0.5, valeur: 10, unite: "N·m" },
    ],
    (lues) => {
      Object.assign(reglages, lues);
      mettreAJour();
    }
  );
  if (curseurs) ressources.push(curseurs);
  mettreAJour();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-couple-convoyeur-moteur",
      titre: "Couple nominal d'un moteur de 4 kW",
      niveau: "fondamental",
      enonce:
        "<p>Le moteur retenu pour le convoyeur a pour plaque $4\\ \\mathrm{kW}$ et $1440\\ \\mathrm{tr/min}$. Calculez son couple nominal.</p>",
      valeur: CONV.Cn,
      unite: "N·m",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Couple nominal $C_n$",
      etapes: [
        { texte: "La plaque donne la puissance mécanique utile : $C_n = P_n/\\varOmega_n$." },
        { texte: "$\\varOmega_n = 2\\pi \\times 1440/60 = 150{,}80\\ \\mathrm{rad/s}$." },
        { texte: "$C_n = 4000/150{,}80 = 26{,}53\\ \\mathrm{N\\cdot m}$.", note: "Contrôle : $1\\ \\mathrm{kW}$ vaut environ $6{,}6\\ \\mathrm{N\\cdot m}$ à $1440\\ \\mathrm{tr/min}$, et $4 \\times 6{,}6 = 26{,}5$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurEtapes(3),
          dessinEtapes(["Ω_n = 2π × 1440 / 60 = 150,80 rad/s", "C_n = 4000 / 150,80", "C_n = 26,53 N·m"], 560),
          "Du couple à la puissance : trois lignes révélées une à une."
        );
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-familles",
      titre: "Classer les charges",
      niveau: "fondamental",
      enonce: "<p>Quelles associations entre une machine entraînée et sa loi de couple sont exactes ?</p>",
      options: [
        { texte: "Pompe centrifuge sans hauteur statique : couple proportionnel au carré de la vitesse.", juste: true },
        { texte: "Convoyeur à bande chargé : couple à peu près constant.", juste: true },
        { texte: "Enrouleur à tension et vitesse de bande constantes : puissance constante.", juste: true },
        { texte: "Ventilateur : couple constant, indépendant de la vitesse." },
      ],
      etapes: [
        { texte: "Pompe et ventilateur mettent un fluide en vitesse : $H \\propto n^2$, $P \\propto n^3$, donc $C \\propto n^2$. Le ventilateur n'est pas une charge à couple constant." },
        { texte: "Le couple du convoyeur vient des frottements et de l'élévation de la matière, indépendants de la vitesse." },
        { texte: "L'enrouleur tire la bande avec une force $F$ à vitesse $v$ : $P = Fv$ constante, et le couple $F\\,r$ croît avec le rayon de la bobine pendant que la vitesse angulaire diminue.", note: "Le classement décide de la suite : couple au décollement pour la première famille, énergie pour la deuxième, couple à basse vitesse pour la troisième." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(moteurApi, conteneur, "0 0 560 270", dessinCharges(), "Les trois lois de couple, ramenées au même couple nominal.");
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-inertie",
      titre: "Inertie ramenée par une courroie multiplicatrice",
      niveau: "intermédiaire",
      enonce:
        "<p>On envisage d'entraîner la centrifugeuse de la section H, $J_c = 12\\ \\mathrm{kg\\cdot m^2}$ à $3000\\ \\mathrm{tr/min}$, par un moteur à quatre " +
        "pôles tournant à $1500\\ \\mathrm{tr/min}$ et une courroie multiplicatrice. L'inertie du rotor de ce moteur vaut $0{,}08\\ \\mathrm{kg\\cdot m^2}$. " +
        "Quelle inertie totale le moteur voit-il ?</p>",
      valeur: 0.08 + 12 * 4,
      unite: "kg·m²",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Inertie ramenée $J$",
      etapes: [
        { texte: "Rapport : $k = n_m/n_c = 1500/3000 = 0{,}5$." },
        { texte: "L'énergie cinétique se conserve : $\\tfrac{1}{2}J_c\\varOmega_c^2 = \\tfrac{1}{2}J_{eq}\\varOmega_m^2$, donc $J_{eq} = J_c/k^2 = 12/0{,}25 = 48\\ \\mathrm{kg\\cdot m^2}$." },
        { texte: "$J = J_m + J_c/k^2 = 0{,}08 + 48 = 48{,}08\\ \\mathrm{kg\\cdot m^2}$.", note: "Le couple d'accélération double, pour la même puissance : le moteur à quatre pôles devrait fournir environ $140\\ \\mathrm{N\\cdot m}$ au lieu de $70$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurBarres(2),
          dessinBarres([["prise directe, k = 1", 12.05, false], ["courroie, k = 0,5", 48.08, true]], 52, "kg·m²"),
          "L'inertie vue du moteur est multipliée par 1 / k², soit par quatre."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-convoyeur",
      titre: "Convoyeur : couple ramené et mode de démarrage",
      niveau: "intermédiaire",
      enonce:
        "<p>Le convoyeur de la section I exerce un effort de $2{,}2\\ \\mathrm{kN}$ sur un tambour de $0{,}5\\ \\mathrm{m}$ de diamètre. Le réducteur a un rapport " +
        "$25$ et un rendement de $0{,}95$. Calculez le couple résistant ramené à l'arbre du moteur en régime ; la correction en déduit le mode de démarrage, " +
        "sachant que le décollement demande $1{,}5$ fois ce couple et que le moteur a $C_n = 26{,}53\\ \\mathrm{N\\cdot m}$ et $C_d = 2{,}3\\,C_n$.</p>",
      valeur: 550 / (25 * 0.95),
      unite: "N·m",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Couple résistant ramené $C_r$",
      etapes: [
        { texte: "Couple au tambour : $C_c = F\\,D/2 = 2200 \\times 0{,}25 = 550\\ \\mathrm{N\\cdot m}$." },
        { texte: "Ramené au moteur : $C_r = C_c/(k\\eta_t) = 550/(25 \\times 0{,}95) = 23{,}16\\ \\mathrm{N\\cdot m}$, soit $0{,}87\\,C_n$." },
        { texte: "Au décollement : $1{,}5 \\times 23{,}16 = 34{,}7\\ \\mathrm{N\\cdot m} = 1{,}31\\,C_n$. En étoile : $2{,}3/3 = 0{,}77\\,C_n$, insuffisant." },
        { texte: "Démarreur progressif : il faudrait $U/U_n \\ge \\sqrt{1{,}31 \\times 1{,}15/2{,}3} = 0{,}81$, donc $5{,}7\\,I_n$ ; gain négligeable sur $7\\,I_n$.", note: "Restent le démarrage direct ou le variateur, qui offre $1{,}5\\,C_n$ sous $1{,}4\\,I_n$, soit $15\\ \\%$ de marge." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const seuil = { valeur: 1.31, libelle: "décollement : 1,31 C_n" };
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurBarres(4, seuil),
          dessinBarres([["démarrage direct", 2.3, false], ["étoile-triangle", 0.77, false], ["progressif à 3 I_n", 0.42, false], ["variateur", 1.5, true]], 2.6, "C_n", 560, seuil),
          "Couple de démarrage offert par chaque procédé face au couple de décollement, en tirets."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-efficace",
      titre: "Couple efficace et calibre du variateur",
      niveau: "avancé",
      enonce:
        "<p>Une autre centrifugeuse est équipée du même moteur de $15\\ \\mathrm{kW}$, $C_n = 48{,}72\\ \\mathrm{N\\cdot m}$. Son cycle : $80\\ \\mathrm{N\\cdot m}$ pendant " +
        "$45\\ \\mathrm{s}$ d'accélération, $12\\ \\mathrm{N\\cdot m}$ pendant $240\\ \\mathrm{s}$ de palier, $80\\ \\mathrm{N\\cdot m}$ en valeur absolue pendant $40\\ \\mathrm{s}$ " +
        "de freinage, puis $90\\ \\mathrm{s}$ d'arrêt. En supposant la ventilation constante, calculez le couple efficace ; la correction conclut sur le moteur " +
        "et sur le variateur, de surcharge $150\\ \\%$ pendant $60\\ \\mathrm{s}$.</p>",
      valeur: Math.sqrt((80 * 80 * 45 + 12 * 12 * 240 + 80 * 80 * 40) / 415),
      unite: "N·m",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Couple efficace $C_{eq}$",
      etapes: [
        { texte: "Somme des $C_i^2 t_i$ : $6400 \\times 45 + 144 \\times 240 + 6400 \\times 40 = 288\\,000 + 34\\,560 + 256\\,000 = 578\\,560\\ \\mathrm{N^2\\cdot m^2\\cdot s}$." },
        { texte: "Durée du cycle : $45 + 240 + 40 + 90 = 415\\ \\mathrm{s}$." },
        { texte: "$C_{eq} = \\sqrt{578\\,560/415} = \\sqrt{1394{,}1} = 37{,}34\\ \\mathrm{N\\cdot m}$, soit $0{,}77\\,C_n$ ; avec $\\beta_0 = 0{,}5$, $40{,}7\\ \\mathrm{N\\cdot m}$ : le moteur convient." },
        { texte: "Mais la pointe vaut $80/48{,}72 = 1{,}64\\,C_n$, au-delà des $1{,}5\\,C_n$ du variateur ; courant estimé $1{,}56\\,I_n = 41{,}6\\ \\mathrm{A}$.", note: "Décision : moteur conservé, variateur du calibre supérieur, dont $150\\ \\%$ couvrent $41{,}6\\ \\mathrm{A}$, soit au moins $27{,}8\\ \\mathrm{A}$ nominaux. Le moteur et le variateur se dimensionnent séparément." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const C = (t) => (t < 45 ? 80 : t < 285 ? 12 : t < 325 ? -80 : 0);
        traceCorrection(moteurApi, conteneur, {
          titre: "Couple moteur sur le cycle et couple efficace",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "couple",
          yUnite: "N·m",
          xMin: 0,
          xMax: 415,
          yMin: -100,
          yMax: 100,
          echantillons: 830,
          series: [{ id: "c", nom: "couple moteur", couleur: "serie-1", epaisseur: 2.6, fonction: C }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 37.34, "C_eq = 37,3 N·m");
            ligneH(c, repere, couleurs, 73.08, "1,5 C_n = 73,1 N·m", [2, 4]);
            ligneH(c, repere, couleurs, -73.08, "", [2, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-diagnostic",
      titre: "Diagnostic : défaut de surtension au freinage",
      niveau: "diagnostic",
      enonce:
        "<p>Après le remplacement de son variateur par un modèle plus récent, la centrifugeuse accélère normalement, mais le variateur se met en défaut " +
        "\"surtension du bus continu\" quelques secondes après chaque ordre de freinage, et le panier finit en roue libre. Proposez une cause et la " +
        "vérification à faire.</p>",
      motsCles: [["freinage", "ralenti", "decelera", "frein"], ["resistance", "hacheur"], ["bus", "tension", "surtension"], ["energie", "cinetique", "inertie", "renvoy", "regener"]],
      minimum: 3,
      exemple: "Trois ou quatre phrases : d'où vient l'énergie, où devrait-elle aller, que vérifier.",
      etapes: [
        { texte: "Au freinage, la machine fonctionne en génératrice, quadrant II : environ $500\\ \\mathrm{kJ}$ d'énergie cinétique remontent par l'onduleur vers le bus continu." },
        { texte: "Le pont d'entrée à diodes ne peut pas les renvoyer au réseau : sans évacuation, la tension du bus monte jusqu'au seuil de défaut, et le variateur coupe." },
        { texte: "Cause probable : la résistance de freinage n'est pas raccordée au nouveau variateur, son hacheur n'est pas activé dans les paramètres, ou la résistance est coupée ; vérifier le câblage, la valeur ohmique, au plus $29\\ \\mathrm{\\Omega}$, et le paramètre d'activation du hacheur." },
        { texte: "À défaut, une rampe de freinage beaucoup plus longue éviterait le défaut, mais le cycle ne serait plus tenu.", note: "Un défaut de surintensité à l'accélération, à l'inverse, signalerait une rampe trop courte pour l'inertie." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const id = nouveauMarqueur("fl-k-diag");
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 230",
          "<defs>" + marqueur(id) + "</defs>" +
            TRAITS + ' stroke-width="1.8"><rect x="20" y="60" width="90" height="40" rx="5"/><rect x="170" y="60" width="90" height="40" rx="5"/><rect x="320" y="60" width="90" height="40" rx="5"/><rect x="450" y="60" width="90" height="40" rx="5"/><rect x="320" y="150" width="90" height="40" rx="5" stroke-dasharray="5 4"/></g>' +
            TRAITS + ' stroke-width="2.2">' + seg([450, 80], [412, 80], ' marker-end="url(#' + id + ')"') + seg([320, 80], [262, 80], ' marker-end="url(#' + id + ')"') + seg([365, 100], [365, 148], ' marker-end="url(#' + id + ')" stroke-dasharray="6 4"') + "</g>" +
            ECRITS + texte(65, 85, "réseau", ' text-anchor="middle"') + texte(215, 85, "bus continu", ' text-anchor="middle"') + texte(365, 85, "onduleur", ' text-anchor="middle"') +
            texte(495, 85, "panier", ' text-anchor="middle"') + texte(365, 175, "résistance ?", ' text-anchor="middle"') + texte(120, 40, "pont à diodes : retour impossible") +
            texte(20, 222, "l'énergie de freinage n'a pas d'issue : U_dc monte jusqu'au défaut") + "</g>",
          "Chemin de l'énergie au freinage : sans résistance active, le bus continu se charge."
        );
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-conceptuel",
      titre: "Pourquoi la tension réduite convient à la pompe et pas au convoyeur",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi un démarreur progressif convient à une pompe centrifuge mais pas à un convoyeur qui démarre chargé, " +
        "alors que les deux moteurs ont la même puissance.</p>",
      motsCles: [["couple"], ["carre", "u2", "quadrat", "tension"], ["decollement", "demarrage", "arret", "basse vitesse"], ["pompe", "faible", "quadratique", "n2"]],
      minimum: 3,
      exemple: "Reliez la tension au couple, puis comparez ce que chaque charge demande à l'arrêt.",
      etapes: [
        { texte: "Un démarreur progressif réduit la tension ; le couple du moteur varie comme son carré : à $0{,}5\\,U_n$, il n'en reste que le quart." },
        { texte: "Une pompe centrifuge ne demande presque rien à l'arrêt, son couple croissant comme $n^2$ : le couple réduit suffit, et la tension monte avec la vitesse." },
        { texte: "Un convoyeur chargé demande dès l'arrêt plus que son couple de régime : la tension réduite le prive précisément du couple dont il a besoin au décollement.", note: "La puissance ne dit rien du démarrage : c'est la loi de couple de la charge à basse vitesse qui décide." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Couple du moteur sous tension pleine et réduite, face aux deux charges",
          xTitre: "vitesse",
          xUnite: "tr/min",
          yTitre: "couple",
          yUnite: "N·m",
          xMin: 0,
          xMax: 1500,
          yMin: 0,
          yMax: 80,
          series: [
            { id: "m1", nom: "moteur sous U_n", couleur: "serie-1", epaisseur: 2.6, fonction: (n) => coupleMoteurConv(1, Math.max(n, 0.001)) },
            { id: "m2", nom: "moteur sous 0,6 U_n", couleur: "serie-4", epaisseur: 2.2, fonction: (n) => coupleMoteurConv(0.6, Math.max(n, 0.001)) },
            { id: "c", nom: "convoyeur", couleur: "serie-5", epaisseur: 2.2, fonction: (n) => coupleCharge(1, 23.16, 1.5, n) },
            { id: "p", nom: "pompe", couleur: "serie-3", epaisseur: 2.2, fonction: (n) => coupleCharge(2, 23.16, 1.5, n) },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const VISUELS_QUIZ = [
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["pompe : Q ∝ n, H ∝ n²", "P = ρ g Q H ∝ n³", "C = P / Ω ∝ n²"], 540), legende: "La pompe centrifuge est la charge quadratique type." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["étoile : C_d / 3 = 2,3 / 3 = 0,77 C_n", "décollement demandé : 1,31 C_n", "0,77 < 1,31 : le convoyeur ne décolle pas"], 540), legende: "L'étoile-triangle divise le couple par trois." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["Ω = 2π × 1500 / 60 = 157,08 rad/s", "P = C Ω = 100 × 157,08", "P = 15,71 kW"], 540), legende: "Puissance mécanique à partir du couple et de la vitesse." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["régime établi : 3,14 kW seulement", "accélération de 12 kg·m² en 60 s : 22 kW de pointe", "taille fixée par l'inertie et le couple efficace"], 540), legende: "Ce qui dimensionne le moteur d'une centrifugeuse." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["k = n_m / n_c = 5", "J vu du moteur = J_c / k² = 5 / 25", "= 0,2 kg·m²"], 540), legende: "L'inertie se ramène avec le carré du rapport." },
  () => ({ viewBox: "0 0 540 350", dessin: dessinQuadrants(true, 2), legende: "Freinage en marche avant : vitesse positive, couple négatif, quadrant 2, ombré." }),
  { viewBox: "0 0 540 " + hauteurEtapes(4), dessin: dessinEtapes(["couple nominal dès l'arrêt sous environ I_n", "vitesse réglable en service", "freinage avec résistance ou redresseur actif", "mais courants harmoniques côté réseau"], 540), legende: "Apports et limites du variateur." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["10 Hz : ventilateur calé sur l'arbre à 20 %", "refroidissement très réduit", "déclassement ou ventilation forcée"], 540), legende: "Un moteur autoventilé chauffe à basse vitesse." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["Σ C² t = 3600 × 20 + 400 × 80 = 104 000", "Σ t = 100 s", "C_eq = √1040 = 32,25 N·m"], 540), legende: "Moyenne quadratique du couple sur le cycle." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["Ω = 2π × 3000 / 60 = 314,16 rad/s", "W = ½ J Ω² = 0,5 × 12 × 314,16²", "W = 592,2 kJ"], 540), legende: "Énergie cinétique à évacuer au freinage, sans pertes." },
];

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Laquelle de ces machines oppose un couple résistant proportionnel au carré de la vitesse ?</p>",
        options: ["Une pompe centrifuge sans hauteur statique", "Un convoyeur à bande chargé", "Un treuil de levage", "Un enrouleur à tension constante"],
        bonnes: [0],
        explication: "Les lois de similitude donnent $H \\propto n^2$ et $P \\propto n^3$ pour une pompe centrifuge, donc $C \\propto n^2$. Convoyeur et treuil sont à couple constant, l'enrouleur à puissance constante.",
        resume: "Charge quadratique",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Un démarrage étoile-triangle convient à un convoyeur qui demande $1{,}31\\,C_n$ au décollement, entraîné par un moteur dont le couple de démarrage direct vaut $2{,}3\\,C_n$.</p>",
        reponse: false,
        explication: "En étoile, le couple est divisé par trois : $0{,}77\\,C_n$, très inférieur aux $1{,}31\\,C_n$ demandés. Le convoyeur ne décolle pas.",
        resume: "Étoile-triangle et décollement",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Un moteur fournit $100\\ \\mathrm{N\\cdot m}$ à $1500\\ \\mathrm{tr/min}$. Quelle puissance mécanique fournit-il, en kilowatts ?</p>",
        valeur: (100 * TAU * 1500) / 60 / 1000,
        unite: "kW",
        tolerance: 0.01,
        explication: "$P = C\\varOmega = 100 \\times 2\\pi \\times 1500/60 = 15\\,708\\ \\mathrm{W}$.",
        resume: "Puissance mécanique",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Quelles grandeurs fixent la taille du moteur d'une centrifugeuse dont la puissance en régime établi est faible ?</p>",
        motsCles: [["inertie", "cinetique", "acceleration", "lancement"], ["efficace", "echauffement", "thermique", "cycle"]],
        minimum: 2,
        explication: "L'inertie, qui impose le couple d'accélération et la pointe de puissance, et le couple efficace du cycle, qui fixe l'échauffement. Pour la centrifugeuse de la séance : $15\\ \\mathrm{kW}$ pour $3{,}14\\ \\mathrm{kW}$ au palier.",
        resume: "Dimensionnement d'une centrifugeuse",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Une charge d'inertie $5\\ \\mathrm{kg\\cdot m^2}$ est entraînée par un réducteur de rapport $k = n_m/n_c = 5$. Quelle inertie voit le moteur, rotor non compris, en $\\mathrm{kg\\cdot m^2}$ ?</p>",
        valeur: 0.2,
        unite: "kg·m²",
        tolerance: 0.01,
        explication: "$J_c/k^2 = 5/25 = 0{,}2\\ \\mathrm{kg\\cdot m^2}$ : le réducteur divise l'inertie par le carré de son rapport.",
        resume: "Inertie ramenée",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Plan couple-vitesse, couple en abscisse, vitesse en ordonnée. Dans quel quadrant fonctionne la centrifugeuse pendant son freinage, en marche avant ?</p>",
        consigne: "Cliquez sur le quadrant correspondant.",
        viewBox: "0 0 540 350",
        dessin: dessinQuadrants(true),
        zones: ZONES_QUADRANTS.map((z) => ({ ...z, juste: z.etiquette === "2" })),
        explication: "La vitesse reste positive mais le couple s'oppose au mouvement : couple négatif, vitesse positive, quadrant 2. La puissance $C\\varOmega$ est négative : l'énergie remonte vers le variateur.",
        resume: "Quadrant du freinage",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Par rapport à un démarreur progressif, que permet un variateur de fréquence ?</p>",
        options: [
          { texte: "Fournir environ le couple nominal dès l'arrêt, pour un courant voisin de $I_n$.", juste: true },
          { texte: "Régler la vitesse en service.", juste: true },
          { texte: "Freiner une forte inertie, s'il est muni d'une résistance de freinage.", juste: true },
          { texte: "Supprimer les courants harmoniques absorbés au réseau." },
        ],
        multiple: true,
        explication: "Le variateur travaille à faible glissement à toute vitesse, d'où le couple par ampère, la variation de vitesse et le freinage par le bus continu. Son redresseur à diodes absorbe au contraire des courants harmoniques.",
        resume: "Apports du variateur",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Un moteur autoventilé alimenté par variateur peut fournir son couple nominal en permanence à $10\\ \\mathrm{Hz}$ sans risque d'échauffement.</p>",
        reponse: false,
        explication: "Son ventilateur, calé sur l'arbre, tourne cinq fois moins vite qu'à $50\\ \\mathrm{Hz}$ : le refroidissement s'effondre alors que les pertes Joule, liées au couple, restent les mêmes. Il faut la courbe de déclassement du constructeur ou une ventilation forcée.",
        resume: "Couple à basse vitesse",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Un moteur fournit $60\\ \\mathrm{N\\cdot m}$ pendant $20\\ \\mathrm{s}$ puis $20\\ \\mathrm{N\\cdot m}$ pendant $80\\ \\mathrm{s}$, en boucle. Quel est le couple efficace, ventilation supposée constante, en $\\mathrm{N\\cdot m}$ ?</p>",
        valeur: Math.sqrt((3600 * 20 + 400 * 80) / 100),
        unite: "N·m",
        tolerance: 0.01,
        explication: "$C_{eq} = \\sqrt{(60^2 \\times 20 + 20^2 \\times 80)/100} = \\sqrt{1040} = 32{,}25\\ \\mathrm{N\\cdot m}$, au-dessus de la moyenne arithmétique, $28\\ \\mathrm{N\\cdot m}$.",
        resume: "Couple efficace",
      },
      {
        type: "calcul",
        enonce: repere(9) + "<p>Quelle énergie faut-il évacuer pour arrêter, sans pertes, un panier de $12\\ \\mathrm{kg\\cdot m^2}$ tournant à $3000\\ \\mathrm{tr/min}$, en kilojoules ?</p>",
        valeur: (0.5 * 12 * CENTRI.wf * CENTRI.wf) / 1000,
        unite: "kJ",
        tolerance: 0.01,
        explication: "$W = \\tfrac{1}{2}J\\varOmega^2 = 0{,}5 \\times 12 \\times 314{,}16^2 = 592{,}2\\ \\mathrm{kJ}$ ; ventilation et rendements en retiennent une partie, d'où les $501\\ \\mathrm{kJ}$ au bus de la section H.",
        resume: "Énergie de freinage",
      },
    ],
    { titre: "Dix questions de fin de séance" }
  );
  if (quiz) ressources.push(quiz);
  brancherVisuelsQuiz(racine, api, "#l-quiz-bloc", VISUELS_QUIZ);
}

/* --------------------------------------------------------------------------
   M. Cartes de mémorisation
   -------------------------------------------------------------------------- */

function construireCartesMemo(racine, api) {
  const cartes = api.cartes(
    "#m-cartes",
    [
      { categorie: "Méthode", question: "Par quoi commence la sélection d'un entraînement ?", reponse: "Par la fiche de la charge : loi de couple, couple de décollement, inertie, plage de vitesse, cycle, quadrants, environnement et source." },
      { categorie: "Charges", question: "Quelles sont les trois familles de charges ?", reponse: "Couple constant, convoyeur ou levage ; couple quadratique, pompe ou ventilateur ; puissance constante, enrouleur ou broche." },
      { categorie: "Similitude", question: "Comment varient débit, hauteur et puissance d'une pompe centrifuge avec la vitesse ?", reponse: "$Q \\propto n$, $H \\propto n^2$, $P \\propto n^3$, sans hauteur statique et à rendement constant.", rappel: "À mi-vitesse, un huitième de la puissance." },
      { categorie: "Dynamique", question: "Quelle équation gouverne la vitesse d'un entraînement ?", reponse: "$J\\,\\mathrm{d}\\varOmega/\\mathrm{d}t = C_m - C_r$ ; équilibre là où les courbes se croisent, stable si $C_m - C_r$ décroît avec la vitesse." },
      { categorie: "Transmission", question: "Comment ramène-t-on couple et inertie à l'arbre du moteur ?", reponse: "$C_r = C_c/(k\\eta_t)$ et $J = J_m + J_c/k^2$, avec $k = n_m/n_c$ : l'inertie suit le carré du rapport." },
      { categorie: "Rotor", question: "Quelle énergie le rotor dissipe-t-il en démarrage direct à vide ?", reponse: "$\\tfrac{1}{2}J\\varOmega_s^2$, l'énergie cinétique finale, quel que soit le procédé à fréquence fixe. Seul le variateur la réduit." },
      { categorie: "Tension réduite", question: "Pourquoi l'étoile-triangle et le démarreur progressif ne démarrent-ils pas un convoyeur chargé ?", reponse: "Le couple varie comme le carré de la tension : $C_d/3$ en étoile, $0{,}42\\,C_n$ à $3\\,I_n$ en progressif, contre $1{,}31\\,C_n$ demandés." },
      { categorie: "Thermique", question: "Comment vérifie-t-on l'échauffement d'un moteur sur un cycle ?", reponse: "Par le couple efficace $\\sqrt{\\sum C_i^2 t_i/\\sum\\beta_i t_i} \\le C_n$, pondéré par la ventilation, et par la pointe face à $C_{max}$ et à la surcharge du variateur." },
      { categorie: "Freinage", question: "Comment dimensionne-t-on une résistance de freinage ?", reponse: "$R_f \\le U_{dc,max}^2/P_{pic}$, puissance moyenne sur le cycle, tenue en impulsion égale à l'énergie d'un freinage. Sur groupe, pas de retour possible." },
      { categorie: "Énergie", question: "Qu'est-ce qui rapporte le plus d'énergie sur une pompe ?", reponse: "Le procédé de réglage : sur le site, $55\\ \\mathrm{MWh}$ par an en supprimant l'étranglement, contre $2{,}1\\ \\mathrm{MWh}$ pour un moteur à aimants." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["P ∝ n³", "0,7³ = 0,343", "34,3 % de la puissance à pleine vitesse"], 540), legende: "Loi de similitude des pompes." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["tension réduite d'un facteur x", "couple réduit de x²", "le couple ne peut que baisser"], 540), legende: "Un démarreur progressif réduit le couple." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["Ω_s = 2π × 1500 / 60 = 157,08 rad/s", "W = ½ × 2 × 157,08²", "W = 24,67 kJ"], 540), legende: "Énergie rotorique d'un démarrage direct à vide." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["P = 3 V E sin δ / X_s", "= 3 × 230,9 × 350 × sin 20° / 3,2", "= 25,91 kW"], 540), legende: "Puissance d'une machine synchrone." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["surexcitée : E cos δ > V", "courant en avance sur V en récepteur", "elle fournit du réactif au réseau"], 540), legende: "Moteur synchrone surexcité." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["rendement maximal : pertes Joule = pertes fer", "S = S_n √(P0 / Pcc) = 100 √(210 / 1750)", "S = 34,64 kVA"], 540), legende: "Charge de rendement maximal d'un transformateur." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["ζ = (R / 2) √(C / L)", "= 2,5 × √(10⁻⁴ / 10⁻²) = 2,5 × 0,1", "ζ = 0,25 : pseudo-périodique"], 540), legende: "Amortissement d'un circuit RLC série." },
];

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Une pompe centrifuge sans hauteur statique est ralentie à $70\\ \\%$ de sa vitesse. Quelle fraction de sa puissance à pleine vitesse absorbe-t-elle, en pour cent ?</p>",
        valeur: 34.3,
        unite: "%",
        tolerance: 0.01,
        explication: "$P \\propto n^3$ : $0{,}7^3 = 0{,}343$, soit $34{,}3\\ \\%$, à rendement constant.",
        resume: "Similitude des pompes",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Un démarreur progressif augmente le couple de démarrage d'un moteur asynchrone par rapport au démarrage direct.</p>",
        reponse: false,
        explication: "Il réduit la tension, donc le couple comme son carré. Il réduit le courant et les à-coups, jamais le besoin de couple de la charge.",
        resume: "Démarreur progressif et couple",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Cette séance. Une charge sans couple résistant, d'inertie totale $2\\ \\mathrm{kg\\cdot m^2}$, est démarrée en direct par un moteur à quatre pôles sur un réseau à $50\\ \\mathrm{Hz}$. Quelle énergie le rotor dissipe-t-il jusqu'au synchronisme, en kilojoules ?</p>",
        valeur: (0.5 * 2 * Math.pow((TAU * 1500) / 60, 2)) / 1000,
        unite: "kJ",
        tolerance: 0.01,
        explication: "$W = \\tfrac{1}{2}J\\varOmega_s^2 = 0{,}5 \\times 2 \\times 157{,}08^2 = 24{,}67\\ \\mathrm{kJ}$, autant que l'énergie cinétique finale.",
        resume: "Énergie rotorique",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Machine synchrone. Un alternateur couplé a $V = 230{,}9\\ \\mathrm{V}$, $E = 350\\ \\mathrm{V}$, $X_s = 3{,}2\\ \\mathrm{\\Omega}$ et un angle interne de $20^\\circ$. Quelle puissance active fournit-il, en kilowatts ?</p>",
        valeur: (3 * 230.9 * 350 * Math.sin((20 * Math.PI) / 180)) / 3.2 / 1000,
        unite: "kW",
        tolerance: 0.01,
        explication: "$P = 3VE\\sin\\delta/X_s = 3 \\times 230{,}9 \\times 350 \\times 0{,}342/3{,}2 = 25{,}91\\ \\mathrm{kW}$.",
        resume: "Puissance et angle interne",
      },
      {
        type: "vraiFaux",
        enonce: repere(4) + "<p>Cours Machine synchrone. Un moteur synchrone surexcité, couplé au réseau, fournit de la puissance réactive au réseau.</p>",
        reponse: true,
        explication: "Surexcité, $E\\cos\\delta > V$ : son courant passe en avance sur la tension en convention récepteur, il absorbe un réactif négatif, c'est-à-dire qu'il en fournit, comme un condensateur.",
        resume: "Moteur synchrone surexcité",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Révision 5 et étude de cas transformateur. Un transformateur de $100\\ \\mathrm{kVA}$ a $P_0 = 210\\ \\mathrm{W}$ et $P_{cc} = 1750\\ \\mathrm{W}$. Pour quelle puissance apparente son rendement est-il maximal, en kVA ?</p>",
        valeur: 100 * Math.sqrt(210 / 1750),
        unite: "kVA",
        tolerance: 0.01,
        explication: "Le rendement est maximal quand les pertes Joule égalent les pertes fer : $S = S_n\\sqrt{P_0/P_{cc}} = 100\\sqrt{0{,}12} = 34{,}64\\ \\mathrm{kVA}$.",
        resume: "Rendement maximal",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Régime transitoire RLC. Un circuit RLC série a $R = 5\\ \\mathrm{\\Omega}$, $L = 10\\ \\mathrm{mH}$ et $C = 100\\ \\mathrm{\\mu F}$. Quel est son coefficient d'amortissement $\\zeta$ ?</p>",
        valeur: 0.25,
        unite: "",
        tolerance: 0.01,
        explication: "$\\zeta = \\dfrac{R}{2}\\sqrt{C/L} = 2{,}5 \\times 0{,}1 = 0{,}25$, avec $\\omega_0 = 1/\\sqrt{LC} = 1000\\ \\mathrm{rad/s}$ : régime pseudo-périodique. Deux inerties reliées par un accouplement élastique obéissent à la même équation : dans l'analogie couple et courant du travail pratique, les inerties jouent le rôle de capacités et la souplesse de l'accouplement celui d'une inductance.",
        resume: "Amortissement d'un second ordre",
      },
    ],
    { titre: "Sept questions de révision espacée" }
  );
  if (quiz) ressources.push(quiz);
  brancherVisuelsQuiz(racine, api, "#n-revision-bloc", VISUELS_REVISION);
}

/* --------------------------------------------------------------------------
   P. Auto-évaluation
   -------------------------------------------------------------------------- */

function construireAutoEval(racine, api) {
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur la sélection d'un entraînement ?",
  });
  if (auto) ressources.push(auto);
}
