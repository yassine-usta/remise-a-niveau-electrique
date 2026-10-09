/* ==========================================================================
   cours/resonance-serie-et-parallele/cours.js
   Résonance série et parallèle.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;

/* Exemple de la section H : 10 V, 20 ohms, 50 mH, 2,2 µF. */
const EX = { u: 10, r: 20, l: 0.05, c: 2.2e-6 };

/* Jeu de barres du site, par phase (cours Correction du facteur de puissance). */
const SITE = { u: 230, uc: 400, w: TAU * 50, i1Pompe: 47.7 };

function f0De(l, c) {
  return 1 / (TAU * Math.sqrt(l * c));
}

/** Grandeurs d'un circuit RLC série alimenté sous U efficace à la fréquence f. */
function serie(u, r, l, c, f) {
  const w = TAU * f;
  const x = l * w - 1 / (c * w);
  const z = Math.hypot(r, x);
  const i = u / z;
  return { w, x, z, i, phi: Math.atan2(x, r) / DEG, ur: r * i, ul: l * w * i, ucap: i / (c * w) };
}

/** Courbe universelle de résonance, x = f / f0. */
function gainNormalise(q, x) {
  return 1 / Math.sqrt(1 + q * q * (x - 1 / x) * (x - 1 / x));
}

/* --------------------------------------------------------------------------
   Utilitaires SVG et tracés
   -------------------------------------------------------------------------- */

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function nombre(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
}

function marqueur(id) {
  return (
    '<marker id="' + id + '" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto-start-reverse">' +
    '<path d="M0 0 8 4 0 8Z" fill="currentColor"/></marker>'
  );
}

/** Segment raccourci au bout, pour laisser la place à la pointe de flèche. */
function segment(x1, y1, x2, y2, retrait = 3) {
  const l = Math.hypot(x2 - x1, y2 - y1);
  if (l < 0.5) return "";
  if (l < retrait + 1) return "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + x2.toFixed(1) + " " + y2.toFixed(1);
  const k = (l - retrait) / l;
  return "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + (x1 + (x2 - x1) * k).toFixed(1) + " " + (y1 + (y2 - y1) * k).toFixed(1);
}

/** Portion d'un segment, de son origine jusqu'à la fraction f de sa longueur. */
function partiel(x1, y1, x2, y2, f, retrait = 3) {
  const g = Math.max(0, Math.min(1, f));
  if (g <= 0) return "";
  return segment(x1, y1, x1 + (x2 - x1) * g, y1 + (y2 - y1) * g, g >= 1 ? retrait : 0.1);
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

/** Ligne verticale en tirets sur un tracé, avec son libellé. */
function ligneV(c, repere, couleurs, x, libelle, epaisseur = 1.2, tirets = [5, 5]) {
  const px = repere.versX(x);
  if (px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  c.save();
  c.setLineDash(tirets);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = epaisseur;
  c.beginPath();
  c.moveTo(px, repere.boite.y);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  c.setLineDash([]);
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.75;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

/** Ligne horizontale en tirets sur un tracé, avec son libellé. */
function ligneH(c, repere, couleurs, y, libelle, enDessous) {
  const py = repere.versY(y);
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.setLineDash([7, 5]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.3;
  c.beginPath();
  c.moveTo(repere.boite.x, py);
  c.lineTo(repere.boite.x + repere.boite.l, py);
  c.stroke();
  c.setLineDash([]);
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    c.textAlign = "right";
    c.fillText(libelle, repere.boite.x + repere.boite.l - 4, py + (enDessous ? 14 : -6));
  }
  c.restore();
}

function marquerPoint(c, repere, couleurs, x, y, libelle, aGauche) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.fillStyle = couleurs.texte;
  c.beginPath();
  c.arc(px, py, 4.5, 0, Math.PI * 2);
  c.fill();
  if (libelle) {
    c.font = POLICE;
    const gauche = aGauche != null ? aGauche : px > repere.boite.x + repere.boite.l * 0.6;
    c.textAlign = gauche ? "right" : "left";
    c.fillText(libelle, px + (gauche ? -8 : 8), py - 8);
  }
  c.restore();
}

/** Tracé de courbe en tirets, calculé point par point, pour une enveloppe ou un repère. */
function courbeTirets(c, repere, couleurs, fonction, x1, x2, tirets = [6, 4]) {
  c.save();
  c.setLineDash(tirets);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.3;
  c.beginPath();
  let premier = true;
  const n = 300;
  for (let k = 0; k <= n; k += 1) {
    const x = x1 + ((x2 - x1) * k) / n;
    const y = fonction(x);
    if (!Number.isFinite(y)) {
      premier = true;
      continue;
    }
    const px = repere.versX(x);
    const py = Math.max(repere.boite.y, Math.min(repere.boite.y + repere.boite.h, repere.versY(y)));
    if (premier) c.moveTo(px, py);
    else c.lineTo(px, py);
    premier = false;
  }
  c.stroke();
  c.restore();
}

/** Tracé de correction animé par le moteur. */
function traceCorrection(moteur, conteneur, options) {
  const traceur = moteur.sim.traceur(conteneur, {
    genre: "Correction visuelle",
    ratio: 0.42,
    echantillons: 600,
    ...options,
  });
  if (traceur) ressources.push(traceur);
  return traceur;
}

/** Diagramme vectoriel figé pour une correction. */
function fresnelCorrection(moteur, conteneur, options) {
  const diagramme = moteur.sim.fresnel(conteneur, {
    genre: "Correction visuelle",
    rotation: false,
    projection: false,
    ratio: 0.5,
    ...options,
  });
  if (diagramme) ressources.push(diagramme);
  return diagramme;
}

/** Courbe de résonance série d'une correction : courant en fonction de la fréquence. */
function courbeSerieCorrection(moteur, conteneur, titre, u, r, l, c, fMin, fMax, reperes) {
  const f0 = f0De(l, c);
  const i0 = u / r;
  return traceCorrection(moteur, conteneur, {
    titre,
    xTitre: "f",
    xUnite: "Hz",
    yTitre: "I",
    yUnite: "A",
    xMin: fMin,
    xMax: fMax,
    yMin: 0,
    yMax: i0 * 1.15,
    series: [{ id: "i", nom: "courant efficace I(f)", couleur: "serie-1", epaisseur: 2.6, fonction: (f) => serie(u, r, l, c, f).i }],
    surDessin({ c: ctx, repere, couleurs }) {
      ligneH(ctx, repere, couleurs, i0 / Math.SQRT2, "I0 / √2", true);
      ligneV(ctx, repere, couleurs, f0, "f0");
      if (typeof reperes === "function") reperes(ctx, repere, couleurs);
    },
  });
}

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeursAnimation = [];

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireBalayage(racine, api);
  construireEnergie(racine, api);
  construireEtablissement(racine, api);
  construireBouchon(racine, api);
  construireConstruction(racine, api);
  construireJeu(racine, api);
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
    ["#e-serie-figure svg", 1.6],
    ["#e-parallele-figure svg", 1.6],
    ["#f-schema-principal svg", 2.2],
    ["#h-circuit-figure svg", 1.6],
    ["#i-unifilaire-figure svg", 1.8],
  ];
  for (const [selecteur, duree] of schemas) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree }));
  }
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-reactance",
      titre: "Réactance d'une bobine",
      niveau: "prérequis",
      enonce: "<p>Quelle est la réactance d'une bobine de $10\\ \\mathrm{mH}$ à $1\\ \\mathrm{kHz}$ ?</p>",
      valeur: 0.01 * TAU * 1000,
      unite: "Ω",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Réactance $X_L$",
      etapes: [
        { texte: "$X_L = L\\omega = L \\times 2\\pi f$." },
        { texte: "$X_L = 0{,}01 \\times 2\\pi \\times 1000 = 62{,}83\\ \\Omega$.", note: "À $50\\ \\mathrm{Hz}$, la même bobine ne présenterait que $3{,}14\\ \\Omega$ : la réactance est proportionnelle à la fréquence." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réactances d'une bobine de 10 mH et d'un condensateur de 2,53 µF",
          xTitre: "f",
          xUnite: "Hz",
          yTitre: "X",
          yUnite: "Ω",
          xMin: 100,
          xMax: 3000,
          yMin: 0,
          yMax: 200,
          series: [
            { id: "xl", nom: "XL = L ω, bobine", couleur: "serie-1", epaisseur: 2.6, fonction: (f) => 0.01 * TAU * f },
            { id: "xc", nom: "XC = 1 / (C ω), condensateur", couleur: "serie-5", epaisseur: 2.6, fonction: (f) => 1 / (2.533e-6 * TAU * f) },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 1000, 62.83, "1 kHz : 62,83 Ω", false);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-module",
      titre: "Module d'une impédance série",
      niveau: "prérequis",
      enonce:
        "<p>Un circuit série comprend $R = 30\\ \\Omega$, une réactance inductive de $70\\ \\Omega$ et une réactance capacitive de $30\\ \\Omega$. Quel est le module de son impédance ?</p>",
      valeur: 50,
      unite: "Ω",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Module $|\\underline{Z}|$",
      etapes: [
        { texte: "Les réactances se retranchent : $X = X_L - X_C = 70 - 30 = 40\\ \\Omega$, inductive." },
        { texte: "$|\\underline{Z}| = \\sqrt{30^2 + 40^2} = 50\\ \\Omega$, et $\\varphi = \\arctan(40/30) = 53{,}13^\\circ$.", note: "Si $X_L$ et $X_C$ étaient égales, il ne resterait que $R$ : c'est la résonance." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Triangle d'impédance : R, puis XL, puis -XC",
          unite: "Ω",
          somme: true,
          nomSomme: "Z = 50 Ω à 53,13°",
          vecteurs: [
            { id: "r", nom: "R = 30 Ω", amplitude: 30, phase: 0, couleur: "serie-1" },
            { id: "xl", nom: "j XL = j 70 Ω", amplitude: 70, phase: 90, couleur: "serie-3" },
            { id: "xc", nom: "- j XC = - j 30 Ω", amplitude: 30, phase: -90, couleur: "serie-5", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-propre",
      titre: "Pulsation propre d'un RLC",
      niveau: "prérequis",
      enonce:
        "<p>Rappel du cours Régime transitoire RLC : quelle est la fréquence propre, en hertz, d'un circuit formé de $L = 10\\ \\mathrm{mH}$ et $C = 1\\ \\mu\\mathrm{F}$ ?</p>",
      valeur: f0De(10e-3, 1e-6),
      unite: "Hz",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Fréquence propre $f_0$",
      etapes: [
        { texte: "$\\omega_0 = 1/\\sqrt{LC} = 1/\\sqrt{10^{-2} \\times 10^{-6}} = 1/10^{-4} = 10\\,000\\ \\mathrm{rad/s}$." },
        { texte: "$f_0 = \\omega_0/(2\\pi) = 1591{,}5\\ \\mathrm{Hz}$.", note: "Avec $R = 10\\ \\Omega$, $\\zeta = (R/2)\\sqrt{C/L} = 0{,}05$ : très peu amorti. Cette séance montre que $Q = 1/(2\\zeta) = 10$." },
      ],
      visuelCorrection(conteneur, moteur) {
        courbeSerieCorrection(moteur, conteneur, "Courbe de résonance de ce circuit avec R = 10 Ω, sous 1 V", 1, 10, 10e-3, 1e-6, 1000, 2200);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Simulation : balayage en fréquence d'un circuit série
   -------------------------------------------------------------------------- */

function construireBalayage(racine, api) {
  const conteneur = racine.querySelector("#d-balayage");
  if (!conteneur) return;

  const O = { x: 110, y: 200 };
  const PL = { x0: 420, x1: 740, y0: 300, y1: 50 };
  const FMAX = 1500;
  const FMIN = 20;
  const IMAX = 1;
  const versXf = (f) => PL.x0 + ((f - 0) / FMAX) * (PL.x1 - PL.x0);
  const versYi = (i) => PL.y0 - (Math.min(i, IMAX * 1.04) / IMAX) * (PL.y0 - PL.y1);

  const svg = svgEl("svg", {
    viewBox: "0 0 760 380",
    role: "img",
    "aria-label": "Diagramme de Fresnel des tensions d'un circuit RLC série à la fréquence choisie, et courbe du courant en fonction de la fréquence, avec une poignée sur l'axe des fréquences",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-d-b");
  let graduations = "";
  let textes = "";
  for (let f = 250; f <= FMAX; f += 250) {
    graduations += "M" + versXf(f).toFixed(1) + " " + (PL.y0 - 4) + "v8";
    textes += texte(versXf(f), PL.y0 + 18, String(f), ' text-anchor="middle"');
  }
  for (let i = 0.25; i <= 1.001; i += 0.25) {
    graduations += "M" + (PL.x0 - 4) + " " + versYi(i).toFixed(1) + "h8";
    textes += texte(PL.x0 - 8, versYi(i) + 4, nombre(api, i, 2), ' text-anchor="end"');
  }
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7">' +
    '<path d="M' + PL.x0 + " " + PL.y0 + "H" + (PL.x1 + 10) + '" marker-end="url(#fl-d-b)"/>' +
    '<path d="M' + PL.x0 + " " + (PL.y0 + 4) + "V" + (PL.y1 - 16) + '" marker-end="url(#fl-d-b)"/>' +
    '<path d="' + graduations + '"/>' +
    '<path d="M' + PL.x0 + " 344H" + PL.x1 + '" stroke-dasharray="3 4"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="10.5" opacity="0.85">' +
    textes +
    texte(PL.x1 + 10, PL.y0 - 8, "f (Hz)", ' text-anchor="end"') +
    texte(PL.x0 + 8, PL.y1 - 18, "I (A)") +
    texte(PL.x0, 368, "poignée : fréquence de la source, de 20 à 1500 Hz") +
    texte(14, 368, "Fresnel, référence I") +
    "</g>";
  const courbe = svgEl("path", { stroke: "currentColor", "stroke-width": 2.6, fill: "none" });
  const reperes = svgEl("path", { stroke: "currentColor", "stroke-width": 1.1, fill: "none", "stroke-dasharray": "5 4", opacity: 0.8 });
  const point = svgEl("circle", { r: 5, fill: "currentColor" });
  const guide = svgEl("path", { stroke: "currentColor", "stroke-width": 1, fill: "none", "stroke-dasharray": "2 3", opacity: 0.8 });
  const axeI = svgEl("path", { stroke: "currentColor", "stroke-width": 1.2, fill: "none", "marker-end": "url(#fl-d-b)", opacity: 0.8 });
  const vur = svgEl("path", { stroke: "currentColor", "stroke-width": 3.4, fill: "none", "marker-end": "url(#fl-d-b)" });
  const vul = svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "marker-end": "url(#fl-d-b)" });
  const vuc = svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "stroke-dasharray": "6 4", "marker-end": "url(#fl-d-b)" });
  const vu = svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "stroke-dasharray": "11 6", "marker-end": "url(#fl-d-b)" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, courbe, reperes, guide, point, axeI, vur, vul, vuc, vu, etiquettes);
  conteneur.appendChild(svg);

  const etat = { r: EX.r, l: EX.l, c: EX.c, f: 400 };

  const trace = api.sim.traceur("#d-balayage-trace", {
    titre: "Tensions efficaces aux bornes de R, L et C en fonction de la fréquence",
    genre: "Simulation",
    xTitre: "f",
    xUnite: "Hz",
    yTitre: "tension",
    yUnite: "V",
    xMin: FMIN,
    xMax: FMAX,
    yMin: 0,
    yMax: 90,
    ratio: 0.4,
    echantillons: 900,
    series: [
      { id: "ur", nom: "UR, tension de la résistance", couleur: "serie-1", epaisseur: 2.2 },
      { id: "ul", nom: "UL, tension de la bobine", couleur: "serie-3", epaisseur: 2.2 },
      { id: "uc", nom: "UC, tension du condensateur", couleur: "serie-5", epaisseur: 2.2 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, f0De(etat.l, etat.c), "f0");
      ligneV(c, repere, couleurs, etat.f, "", 1.6, [2, 3]);
      ligneH(c, repere, couleurs, EX.u, "U = 10 V", false);
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#d-balayage-valeurs", [
    { id: "f", libelle: "Fréquence de la source f", unite: "Hz", decimales: 1 },
    { id: "f0", libelle: "Fréquence de résonance f0", unite: "Hz", decimales: 1 },
    { id: "q", libelle: "Facteur de qualité Q = √(L/C) / R", decimales: 2 },
    { id: "df", libelle: "Bande passante Δf = f0 / Q", unite: "Hz", decimales: 1 },
    { id: "i", libelle: "Courant efficace I", unite: "A", decimales: 3 },
    { id: "phi", libelle: "Déphasage de u sur i", format: (v) => v },
    { id: "ur", libelle: "UR", unite: "V", decimales: 2 },
    { id: "ul", libelle: "UL", unite: "V", decimales: 2 },
    { id: "uc", libelle: "UC", unite: "V", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const f0 = f0De(etat.l, etat.c);
    const q = Math.sqrt(etat.l / etat.c) / etat.r;
    const g = serie(EX.u, etat.r, etat.l, etat.c, etat.f);

    /* Courbe I(f) dans le panneau de droite */
    let chemin = "";
    for (let k = 0; k <= 300; k += 1) {
      const f = FMIN + ((FMAX - FMIN) * k) / 300;
      chemin += (k === 0 ? "M" : "L") + versXf(f).toFixed(1) + " " + versYi(serie(EX.u, etat.r, etat.l, etat.c, f).i).toFixed(1);
    }
    courbe.setAttribute("d", chemin);
    const i0 = EX.u / etat.r;
    reperes.setAttribute(
      "d",
      "M" + PL.x0 + " " + versYi(i0 / Math.SQRT2).toFixed(1) + "H" + PL.x1 +
        "M" + versXf(f0).toFixed(1) + " " + PL.y0 + "V" + PL.y1
    );
    const px = versXf(etat.f);
    const py = versYi(g.i);
    point.setAttribute("cx", px.toFixed(1));
    point.setAttribute("cy", py.toFixed(1));
    guide.setAttribute("d", "M" + px.toFixed(1) + " " + py.toFixed(1) + "V344");

    /* Diagramme de Fresnel, échelle adaptée */
    const maxi = Math.max(g.ul, g.ucap, EX.u, 1e-6);
    const k = 150 / maxi;
    const pR = { x: O.x + k * g.ur, y: O.y };
    const pL = { x: pR.x, y: O.y - k * g.ul };
    const pC = { x: pR.x, y: pL.y + k * g.ucap };
    axeI.setAttribute("d", "M" + O.x + " " + O.y + "H" + (O.x + 280));
    vur.setAttribute("d", segment(O.x, O.y, pR.x, pR.y, 3));
    vul.setAttribute("d", segment(pR.x, pR.y, pL.x, pL.y, 3));
    vuc.setAttribute("d", segment(pL.x + 10, pL.y, pC.x + 10, pC.y, 3));
    vu.setAttribute("d", segment(O.x, O.y, pC.x, pC.y, 3));
    const nature = Math.abs(g.phi) < 0.5 ? "résistif" : g.phi > 0 ? "inductif" : "capacitif";
    etiquettes.innerHTML =
      texte(O.x + 276, O.y + 16, "I", ' text-anchor="end"') +
      (g.ul * k > 14 ? texte(pR.x - 8, (O.y + pL.y) / 2, "UL", ' text-anchor="end" font-size="11.5"') : "") +
      (g.ucap * k > 14 ? texte(pR.x + 22, (pL.y + pC.y) / 2, "UC", ' font-size="11.5"') : "") +
      texte(pC.x + 26, pC.y + (pC.y > O.y ? 16 : -8), "U", ' font-size="11.5" font-weight="600"') +
      texte(14, 62, "U = 10 V : tirets épais", ' font-size="11"') +
      texte(14, 30, "échelle : 1 V pour " + nombre(api, k, 2) + " unités", ' font-size="11"') +
      texte(14, 46, "circuit " + nature, ' font-size="11" font-weight="600"') +
      texte(px + (px > 650 ? -8 : 8), Math.max(py - 10, PL.y1), nombre(api, etat.f, 0) + " Hz", px > 650 ? ' text-anchor="end" font-size="11"' : ' font-size="11"');

    if (trace) {
      const umax = Math.max(q * EX.u, EX.u) * 1.15;
      trace.definirPlage({ yMax: Math.min(Math.max(12, umax), 400) });
      trace.definirFonction("ur", (f) => serie(EX.u, etat.r, etat.l, etat.c, f).ur);
      trace.definirFonction("ul", (f) => serie(EX.u, etat.r, etat.l, etat.c, f).ul);
      trace.definirFonction("uc", (f) => serie(EX.u, etat.r, etat.l, etat.c, f).ucap);
    }
    if (valeurs) {
      valeurs.maj({
        f: etat.f,
        f0,
        q,
        df: f0 / q,
        i: g.i,
        phi: nombre(api, g.phi, 1) + "°, " + nature,
        ur: g.ur,
        ul: g.ul,
        uc: g.ucap,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: versXf(FMIN), y: 344 },
    a: { x: versXf(FMAX), y: 344 },
    min: FMIN,
    max: FMAX,
    pas: 1,
    valeur: etat.f,
    libelle: "Fréquence de la source",
    format: (mesure) => "fréquence " + nombre(api, mesure.valeur, 0) + " hertz",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.f = mesure.valeur;
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-balayage-curseurs",
    [
      { id: "r", libelle: "Résistance R", min: 10, max: 200, pas: 1, valeur: EX.r, unite: "Ω" },
      { id: "l", libelle: "Inductance L", min: 20, max: 100, pas: 1, valeur: 50, unite: "mH" },
      { id: "c", libelle: "Capacité C", min: 1, max: 10, pas: 0.1, valeur: 2.2, unite: "µF" },
    ],
    (lues) => {
      etat.r = lues.r;
      etat.l = lues.l / 1000;
      etat.c = lues.c * 1e-6;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   D. Animation : énergie échangée entre la bobine et le condensateur
   -------------------------------------------------------------------------- */

function construireEnergie(racine, api) {
  const conteneur = racine.querySelector("#d-energie");
  if (!conteneur) return;

  const f0 = f0De(EX.l, EX.c);
  const svg = svgEl("svg", {
    viewBox: "0 0 720 230",
    role: "img",
    "aria-label": "Jauges des énergies stockées dans la bobine, dans le condensateur et de leur somme, et flèche d'échange avec la source",
  });
  const defs = svgEl("defs");
  defs.innerHTML =
    '<marker id="fl-d-e" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" refX="12" refY="7" orient="auto">' +
    '<path d="M0 0 14 7 0 14Z" fill="currentColor"/></marker>';
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.8" fill="none">' +
    '<rect x="60" y="30" width="80" height="160" rx="4"/>' +
    '<rect x="200" y="30" width="80" height="160" rx="4"/>' +
    '<rect x="340" y="30" width="80" height="160" rx="4"/>' +
    '<rect x="560" y="80" width="130" height="60" rx="8"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
    texte(100, 212, "bobine wL", ' text-anchor="middle"') +
    texte(240, 212, "condensateur wC", ' text-anchor="middle"') +
    texte(380, 212, "total stocké", ' text-anchor="middle"') +
    texte(625, 106, "source", ' text-anchor="middle"') +
    texte(625, 124, "10 V", ' text-anchor="middle" font-size="11"') +
    "</g>";
  const jL = svgEl("rect", { x: 64, width: 72, fill: "currentColor", opacity: 0.35 });
  const jC = svgEl("rect", { x: 204, width: 72, fill: "currentColor", opacity: 0.6 });
  const jT = svgEl("rect", { x: 344, width: 72, fill: "currentColor", opacity: 0.85 });
  const fleche = svgEl("path", { stroke: "currentColor", fill: "none", "stroke-linecap": "round" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  svg.append(defs, fond, jL, jC, jT, fleche, etiquettes);
  conteneur.appendChild(svg);

  const etat = { x: 1, t: 0 };
  const grandeurs = () => {
    const f = etat.x * f0;
    const g = serie(EX.u, EX.r, EX.l, EX.c, f);
    const w = g.w;
    const phi = g.phi * DEG;
    const im = g.i * Math.SQRT2;
    const fonctions = (tp) => {
      const th = TAU * tp;
      const i = im * Math.sin(th - phi);
      const uc = -(im / (EX.c * w)) * Math.cos(th - phi);
      const ul = EX.l * im * w * Math.cos(th - phi);
      return { wl: 0.5 * EX.l * i * i * 1000, wc: 0.5 * EX.c * uc * uc * 1000, p: i * (ul + uc) };
    };
    const wlMax = EX.l * g.i * g.i * 1000;
    const wcMax = (g.i * g.i) / (EX.c * w * w) * 1000;
    return { f, g, fonctions, wlMax, wcMax, q: g.i * g.i * g.x };
  };

  const trace = api.sim.traceur("#d-energie-trace", {
    titre: "Énergies stockées dans la bobine et le condensateur, et leur somme",
    genre: "Animation",
    xTitre: "t",
    xUnite: "périodes",
    yTitre: "énergie",
    yUnite: "mJ",
    xMin: 0,
    xMax: 2,
    yMin: 0,
    yMax: 30,
    ratio: 0.38,
    echantillons: 500,
    series: [
      { id: "wl", nom: "wL, bobine", couleur: "serie-1", epaisseur: 2.2 },
      { id: "wc", nom: "wC, condensateur", couleur: "serie-5", epaisseur: 2.2 },
      { id: "wt", nom: "wL + wC, total stocké", couleur: "serie-2", epaisseur: 3 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, etat.t, "instant étudié");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#d-energie-valeurs", [
    { id: "f", libelle: "Fréquence de la source", unite: "Hz", decimales: 1 },
    { id: "i", libelle: "Courant efficace", unite: "A", decimales: 3 },
    { id: "wl", libelle: "wL à l'instant", unite: "mJ", decimales: 2 },
    { id: "wc", libelle: "wC à l'instant", unite: "mJ", decimales: 2 },
    { id: "wt", libelle: "Total stocké à l'instant", unite: "mJ", decimales: 2 },
    { id: "plage", libelle: "Total : minimum et maximum", format: (v) => v },
    { id: "q", libelle: "Puissance réactive échangée avec la source", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const s = grandeurs();
    const v = s.fonctions(etat.t);
    let mini = Infinity;
    let maxi = -Infinity;
    for (let k = 0; k <= 200; k += 1) {
      const e = s.fonctions(k / 200);
      mini = Math.min(mini, e.wl + e.wc);
      maxi = Math.max(maxi, e.wl + e.wc);
    }
    const echelle = 1.08 * Math.max(maxi, s.wlMax, s.wcMax);
    const hauteur = (w) => (150 * Math.min(w, echelle)) / echelle;
    for (const [jauge, w] of [[jL, v.wl], [jC, v.wc], [jT, v.wl + v.wc]]) {
      const h = hauteur(w);
      jauge.setAttribute("y", (186 - h).toFixed(1));
      jauge.setAttribute("height", Math.max(0, h).toFixed(1));
    }
    const pAbs = Math.abs(v.p);
    const largeur = 1 + 8 * Math.min(1, pAbs / 2);
    fleche.setAttribute("stroke-width", largeur.toFixed(2));
    fleche.removeAttribute("marker-end");
    if (pAbs < 0.05) {
      fleche.setAttribute("d", "M440 110H552");
      fleche.setAttribute("stroke-dasharray", "2 5");
    } else {
      fleche.removeAttribute("stroke-dasharray");
      fleche.setAttribute("d", v.p > 0 ? segment(556, 110, 440, 110, 12) : segment(440, 110, 556, 110, 12));
      fleche.setAttribute("marker-end", "url(#fl-d-e)");
    }
    etiquettes.innerHTML =
      texte(100, 24, nombre(api, v.wl, 1) + " mJ", ' text-anchor="middle"') +
      texte(240, 24, nombre(api, v.wc, 1) + " mJ", ' text-anchor="middle"') +
      texte(380, 24, nombre(api, v.wl + v.wc, 1) + " mJ", ' text-anchor="middle" font-weight="600"') +
      texte(496, 96, pAbs < 0.05 ? "aucun échange" : v.p > 0 ? "vers les réserves" : "vers la source", ' text-anchor="middle" font-size="11"') +
      texte(496, 136, nombre(api, pAbs, 2) + " W à l'instant", ' text-anchor="middle" font-size="11"') +
      texte(712, 200, "x = f / f0 = " + nombre(api, etat.x, 2), ' text-anchor="end" font-weight="600"');
    if (trace) {
      trace.definirPlage({ yMax: echelle });
      trace.definirFonction("wl", (t) => s.fonctions(t).wl);
      trace.definirFonction("wc", (t) => s.fonctions(t).wc);
      trace.definirFonction("wt", (t) => s.fonctions(t).wl + s.fonctions(t).wc);
    }
    if (valeurs) {
      valeurs.maj({
        f: s.f,
        i: s.g.i,
        wl: v.wl,
        wc: v.wc,
        wt: v.wl + v.wc,
        plage: nombre(api, mini, 2) + " à " + nombre(api, maxi, 2) + " mJ",
        q: Math.abs(s.q) < 0.005 ? "nulle : résonance" : nombre(api, s.q, 2) + " var, " + (s.q > 0 ? "inductif" : "capacitif"),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#d-energie-curseurs",
    [{ id: "x", libelle: "Rapport x = f / f0", min: 0.5, max: 1.5, pas: 0.05, valeur: 1, chiffres: 2 }],
    (lues) => {
      etat.x = lues.x;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-energie-lecteur", {
    de: 0,
    a: 2,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Faire avancer le temps sur deux périodes",
    rappel(valeur) {
      etat.t = valeur;
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Animation : établissement de la résonance
   -------------------------------------------------------------------------- */

/** Intégration RK4 du circuit série alimenté par U√2 sin(ωt) depuis le repos. */
function integrerSerie(u, r, l, c, f, tMax, pas) {
  const w = TAU * f;
  const um = u * Math.SQRT2;
  const n = Math.ceil(tMax / pas);
  const courants = new Float64Array(n + 1);
  let i = 0;
  let q = 0;
  const derivees = (t, ii, qq) => [(um * Math.sin(w * t) - r * ii - qq / c) / l, ii];
  for (let k = 0; k < n; k += 1) {
    const t = k * pas;
    const k1 = derivees(t, i, q);
    const k2 = derivees(t + pas / 2, i + (pas / 2) * k1[0], q + (pas / 2) * k1[1]);
    const k3 = derivees(t + pas / 2, i + (pas / 2) * k2[0], q + (pas / 2) * k2[1]);
    const k4 = derivees(t + pas, i + pas * k3[0], q + pas * k3[1]);
    i += (pas / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    q += (pas / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    courants[k + 1] = i;
  }
  return { courants, pas, n };
}

function construireEtablissement(racine, api) {
  const TMAX = 50;
  const etat = { r: EX.r, x: 1, t: TMAX, calcul: null };
  const f0 = f0De(EX.l, EX.c);

  function recalculer() {
    etat.calcul = integrerSerie(EX.u, etat.r, EX.l, EX.c, etat.x * f0, TMAX / 1000, 1 / (f0 * 240));
  }
  function courantA(tms) {
    const calc = etat.calcul;
    if (!calc || tms > etat.t + 1e-9) return NaN;
    const k = Math.min(calc.n, Math.max(0, Math.round(tms / 1000 / calc.pas)));
    return calc.courants[k];
  }

  const trace = api.sim.traceur("#e-etablissement-trace", {
    titre: "Courant après la mise sous tension d'un circuit RLC série",
    genre: "Animation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "i(t)",
    yUnite: "A",
    xMin: 0,
    xMax: TMAX,
    yMin: -0.9,
    yMax: 0.9,
    ratio: 0.42,
    echantillons: 2400,
    series: [{ id: "i", nom: "i(t), courant calculé", couleur: "serie-1", epaisseur: 1.6 }],
    surDessin({ c, repere, couleurs }) {
      const tau = ((2 * EX.l) / etat.r) * 1000;
      const am = (EX.u / etat.r) * Math.SQRT2;
      if (Math.abs(etat.x - 1) < 0.005) {
        courbeTirets(c, repere, couleurs, (t) => (t <= etat.t ? am * (1 - Math.exp(-t / tau)) : NaN), 0, TMAX);
        courbeTirets(c, repere, couleurs, (t) => (t <= etat.t ? -am * (1 - Math.exp(-t / tau)) : NaN), 0, TMAX);
      }
      ligneV(c, repere, couleurs, tau, "τ = 2L/R");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-etablissement-valeurs", [
    { id: "q", libelle: "Facteur de qualité Q", decimales: 2 },
    { id: "tau", libelle: "Constante de l'enveloppe τ = 2L / R", unite: "ms", decimales: 2 },
    { id: "periodes", libelle: "Nombre de périodes dans τ", decimales: 2 },
    { id: "final", libelle: "Amplitude finale du courant", unite: "A", decimales: 3 },
    { id: "atteint", libelle: "Amplitude atteinte sur la dernière période tracée", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    if (trace) {
      const am = (EX.u / etat.r) * Math.SQRT2;
      const g = serie(EX.u, etat.r, EX.l, EX.c, etat.x * f0);
      const borne = 1.25 * Math.max(am, 2 * g.i * Math.SQRT2);
      trace.definirPlage({ yMin: -borne, yMax: borne });
      trace.definirFonction("i", courantA);
    }
    if (valeurs) {
      const q = Math.sqrt(EX.l / EX.c) / etat.r;
      const tau = (2 * EX.l) / etat.r;
      const g = serie(EX.u, etat.r, EX.l, EX.c, etat.x * f0);
      const finale = g.i * Math.SQRT2;
      let crete = 0;
      const periode = 1000 / (etat.x * f0);
      for (let t = Math.max(0, etat.t - periode); t <= etat.t; t += periode / 80) {
        const v = courantA(t);
        if (Number.isFinite(v)) crete = Math.max(crete, Math.abs(v));
      }
      valeurs.maj({
        q,
        tau: tau * 1000,
        periodes: tau * f0,
        final: finale,
        atteint: nombre(api, crete, 3) + " A, soit " + nombre(api, (crete / finale) * 100, 0) + " % du régime établi",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-etablissement-curseurs",
    [
      { id: "r", libelle: "Résistance R", min: 10, max: 80, pas: 1, valeur: EX.r, unite: "Ω" },
      { id: "x", libelle: "Rapport x = f / f0 de la source", min: 0.8, max: 1.2, pas: 0.01, valeur: 1, chiffres: 2 },
    ],
    (lues) => {
      etat.r = lues.r;
      etat.x = lues.x;
      recalculer();
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  if (!etat.calcul) recalculer();

  const lecteur = api.sim.lecteur("#e-etablissement-lecteur", {
    de: 0,
    a: TMAX,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Faire avancer le temps depuis la fermeture",
    rappel(valeur) {
      etat.t = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(TMAX);
  } else {
    dessiner();
  }
}

/* --------------------------------------------------------------------------
   E. Simulation : impédance d'un circuit bouchon
   -------------------------------------------------------------------------- */

function impedanceBouchon(p, f) {
  const w = TAU * f;
  /* admittance = 1/R + 1/(r + jLw) + jCw */
  const den = p.r * p.r + p.l * p.l * w * w;
  const g = 1 / p.rp + p.r / den;
  const b = p.c * w - (p.l * w) / den;
  const module = 1 / Math.hypot(g, b);
  return { module, phase: -Math.atan2(b, g) / DEG };
}

function analyseBouchon(p) {
  let fMax = 20;
  let zMax = 0;
  for (let k = 0; k <= 3000; k += 1) {
    const f = 20 + (1480 * k) / 3000;
    const z = impedanceBouchon(p, f).module;
    if (z > zMax) {
      zMax = z;
      fMax = f;
    }
  }
  let a = Math.max(1, fMax - 1);
  let b = fMax + 1;
  for (let k = 0; k < 60; k += 1) {
    const m1 = a + (b - a) / 3;
    const m2 = b - (b - a) / 3;
    if (impedanceBouchon(p, m1).module < impedanceBouchon(p, m2).module) a = m1;
    else b = m2;
  }
  fMax = (a + b) / 2;
  zMax = impedanceBouchon(p, fMax).module;
  const seuil = zMax / Math.SQRT2;
  const chercher = (debut, fin) => {
    let x1 = debut;
    let x2 = fin;
    const s1 = impedanceBouchon(p, x1).module - seuil;
    for (let k = 0; k < 80; k += 1) {
      const m = (x1 + x2) / 2;
      const sm = impedanceBouchon(p, m).module - seuil;
      if (Math.sign(sm) === Math.sign(s1)) x1 = m;
      else x2 = m;
    }
    return (x1 + x2) / 2;
  };
  const f1 = impedanceBouchon(p, 1).module < seuil ? chercher(1, fMax) : NaN;
  const f2 = impedanceBouchon(p, 1e5).module < seuil ? chercher(fMax, 1e5) : NaN;
  const radical = 1 / (p.l * p.c) - (p.r * p.r) / (p.l * p.l);
  const fPhase = radical > 0 ? Math.sqrt(radical) / TAU : NaN;
  return { fMax, zMax, f1, f2, df: f2 - f1, fPhase, icSurI: zMax * TAU * fMax * p.c };
}

function construireBouchon(racine, api) {
  const p = { rp: 2000, r: 0, l: EX.l, c: EX.c };

  const trace = api.sim.traceur("#e-bouchon-trace", {
    titre: "Module de l'impédance du circuit R // (r + L) // C",
    genre: "Simulation",
    xTitre: "f",
    xUnite: "Hz",
    yTitre: "|Z|",
    yUnite: "Ω",
    xMin: 20,
    xMax: 1500,
    yMin: 0,
    yMax: 2400,
    ratio: 0.42,
    echantillons: 1200,
    series: [{ id: "z", nom: "|Z(f)|, module de l'impédance", couleur: "serie-4", epaisseur: 2.6 }],
    surDessin({ c, repere, couleurs }) {
      const a = analyseBouchon(p);
      ligneH(c, repere, couleurs, a.zMax / Math.SQRT2, "Zmax / √2", true);
      ligneV(c, repere, couleurs, f0De(p.l, p.c), "f0");
      if (Number.isFinite(a.f1)) marquerPoint(c, repere, couleurs, a.f1, a.zMax / Math.SQRT2, "f1", true);
      if (Number.isFinite(a.f2)) marquerPoint(c, repere, couleurs, a.f2, a.zMax / Math.SQRT2, "f2", false);
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-bouchon-valeurs", [
    { id: "f0", libelle: "Fréquence propre f0 = 1 / (2π √(LC))", unite: "Hz", decimales: 1 },
    { id: "fphase", libelle: "Fréquence de phase nulle fr", format: (v) => v },
    { id: "zmax", libelle: "Impédance maximale", unite: "Ω", decimales: 0 },
    { id: "fmax", libelle: "Fréquence du maximum", unite: "Hz", decimales: 1 },
    { id: "df", libelle: "Bande passante à -3 dB", unite: "Hz", decimales: 1 },
    { id: "q", libelle: "Facteur de qualité effectif fmax / Δf", decimales: 2 },
    { id: "ic", libelle: "Courant du condensateur rapporté au courant fourni", decimales: 2 },
    { id: "rp", libelle: "Q² r, résistance parallèle équivalente de la bobine", format: (v) => v },
    { id: "nature", libelle: "Nature à f0 / 2 et à 2 f0", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const a = analyseBouchon(p);
    if (trace) {
      trace.definirPlage({ yMax: Math.max(50, a.zMax * 1.15) });
      trace.definirFonction("z", (f) => impedanceBouchon(p, f).module);
    }
    if (valeurs) {
      const f0 = f0De(p.l, p.c);
      const qb = p.r > 0 ? (p.l * TAU * f0) / p.r : Infinity;
      const bas = impedanceBouchon(p, f0 / 2).phase;
      const haut = impedanceBouchon(p, 2 * f0).phase;
      valeurs.maj({
        f0,
        fphase: Number.isFinite(a.fPhase) ? nombre(api, a.fPhase, 1) + " Hz" : "aucune",
        zmax: a.zMax,
        fmax: a.fMax,
        df: a.df,
        q: a.fMax / a.df,
        ic: a.icSurI,
        rp: Number.isFinite(qb) ? nombre(api, (qb * qb * p.r) / 1000, 2) + " kΩ" : "infinie, r = 0",
        nature: (bas > 0 ? "inductif" : "capacitif") + " puis " + (haut > 0 ? "inductif" : "capacitif"),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-bouchon-curseurs",
    [
      { id: "rp", libelle: "Résistance parallèle R", min: 0.2, max: 20, pas: 0.1, valeur: 2, unite: "kΩ" },
      { id: "r", libelle: "Résistance série de la bobine r", min: 0, max: 30, pas: 0.5, valeur: 0, unite: "Ω" },
      { id: "l", libelle: "Inductance L", min: 20, max: 100, pas: 1, valeur: 50, unite: "mH" },
      { id: "c", libelle: "Capacité C", min: 1, max: 10, pas: 0.1, valeur: 2.2, unite: "µF" },
    ],
    (lues) => {
      p.rp = lues.rp * 1000;
      p.r = lues.r;
      p.l = lues.l / 1000;
      p.c = lues.c * 1e-6;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   H. Animation : diagrammes de Fresnel à f1, f0 et f2
   -------------------------------------------------------------------------- */

function construireConstruction(racine, api) {
  const conteneur = racine.querySelector("#h-construction");
  if (!conteneur) return;

  const K = 2.5;
  const f0 = f0De(EX.l, EX.c);
  const df = EX.r / (TAU * EX.l);
  const f2 = Math.sqrt((df / 2) ** 2 + f0 * f0) + df / 2;
  const f1 = f2 - df;
  const cas = [
    { nom: "f1", f: f1, o: { x: 60, y: 240 } },
    { nom: "f0", f: f0, o: { x: 320, y: 240 } },
    { nom: "f2", f: f2, o: { x: 580, y: 240 } },
  ].map((element) => ({ ...element, g: serie(EX.u, EX.r, EX.l, EX.c, element.f) }));

  const svg = svgEl("svg", {
    viewBox: "0 0 800 470",
    role: "img",
    "aria-label": "Diagrammes de Fresnel des tensions de l'exemple à f1, f0 et f2 : tension de la résistance horizontale, tension de la bobine vers le haut, tension du condensateur vers le bas, tension de la source résultante",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-h-k");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.6">' +
    cas.map((element) => '<path d="M' + (element.o.x - 10) + " " + element.o.y + "H" + (element.o.x + 160) + '" marker-end="url(#fl-h-k)"/>').join("") +
    "</g>" +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
    cas.map((element) => texte(element.o.x + 160, element.o.y + 16, "I", ' text-anchor="end" font-size="11"')).join("") +
    cas.map((element) => texte(element.o.x + 70, 456, element.nom + " = " + nombre(api, element.f, 1) + " Hz", ' text-anchor="middle" font-weight="600"')).join("") +
    "</g>";
  const traits = [];
  for (let k = 0; k < 3; k += 1) {
    traits.push({
      ur: svgEl("path", { stroke: "currentColor", "stroke-width": 3.4, fill: "none", "marker-end": "url(#fl-h-k)" }),
      ul: svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "marker-end": "url(#fl-h-k)" }),
      uc: svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "stroke-dasharray": "6 4", "marker-end": "url(#fl-h-k)" }),
      u: svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "stroke-dasharray": "10 5", "marker-end": "url(#fl-h-k)" }),
    });
  }
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  svg.append(defs, fond);
  for (const t of traits) svg.append(t.ur, t.ul, t.uc, t.u);
  svg.append(etiquettes);
  conteneur.appendChild(svg);

  const ETAPES = [
    "1. f0 : courant de référence, 0,5 A",
    "2. f0 : UR = 10 V, en phase avec I",
    "3. f0 : UL = 75,4 V, en avance de 90°",
    "4. f0 : UC = 75,4 V, en retard de 90°",
    "5. f0 : U = UR, circuit résistif",
    "6. f1 : U en retard de 45°, capacitif",
    "7. f2 : U en avance de 45°, inductif",
    "Construction terminée",
  ];

  const valeurs = api.sim.valeurs("#h-construction-valeurs", [
    { id: "etape", libelle: "Étape", format: (v) => v },
    { id: "f", libelle: "Fréquence du diagramme en cours", format: (v) => v },
    { id: "ur", libelle: "UR", format: (v) => v },
    { id: "ul", libelle: "UL", format: (v) => v },
    { id: "uc", libelle: "UC", format: (v) => v },
    { id: "u", libelle: "U et son déphasage sur I", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  /* Avancement de chaque élément selon l'étape s. */
  function avancement(indice, s) {
    if (indice === 1) return { ur: s - 1, ul: s - 2, uc: s - 3, u: s - 4 };
    const debut = indice === 0 ? 5 : 6;
    const g = s - debut;
    return { ur: g * 4, ul: g * 4 - 1, uc: g * 4 - 2, u: g * 4 - 3 };
  }

  function dessiner(s) {
    let html = "";
    cas.forEach((element, indice) => {
      const { o, g } = element;
      const a = avancement(indice, s);
      const pR = { x: o.x + K * g.ur, y: o.y };
      const pL = { x: pR.x, y: o.y - K * g.ul };
      const pC = { x: pR.x, y: pL.y + K * g.ucap };
      const t = traits[indice];
      t.ur.setAttribute("d", partiel(o.x, o.y, pR.x, pR.y, a.ur, 3));
      t.ul.setAttribute("d", partiel(pR.x, pR.y, pL.x, pL.y, a.ul, 3));
      t.uc.setAttribute("d", partiel(pL.x + 12, pL.y, pC.x + 12, pC.y, a.uc, 3));
      t.u.setAttribute("d", partiel(o.x, o.y, pC.x, pC.y, a.u, 3));
      if (a.ur >= 1) html += texte(o.x + 2, o.y + 30, "UR = " + nombre(api, g.ur, 2), ' font-size="11"');
      if (a.ul >= 1) html += texte(pR.x - 8, (o.y + pL.y) / 2, "UL = " + nombre(api, g.ul, 1), ' text-anchor="end" font-size="11"');
      if (a.uc >= 1) html += texte(pR.x + 20, (pL.y + pC.y) / 2 + 20, "UC = " + nombre(api, g.ucap, 1), ' font-size="11"');
      if (a.u >= 1) html += texte(o.x + 2, o.y + 48, "U = 10 V, " + (Math.abs(g.phi) < 0.5 ? "0°" : nombre(api, g.phi, 0) + "°"), ' font-size="11" font-weight="600"');
    });
    const indiceEtape = Math.min(7, Math.floor(s));
    html +=
      texte(790, 24, ETAPES[indiceEtape], ' text-anchor="end" font-weight="600"') +
      texte(790, 42, "échelle : 1 V pour 2,5 unités", ' text-anchor="end" font-size="11"');
    etiquettes.innerHTML = html;
    if (valeurs) {
      const courant = s >= 6 ? cas[2] : s >= 5 ? cas[0] : cas[1];
      valeurs.maj({
        etape: ETAPES[indiceEtape],
        f: courant.nom + " = " + nombre(api, courant.f, 1) + " Hz",
        ur: nombre(api, courant.g.ur, 2) + " V",
        ul: nombre(api, courant.g.ul, 2) + " V",
        uc: nombre(api, courant.g.ucap, 2) + " V",
        u: "10 V, " + nombre(api, courant.g.phi, 1) + "°",
      });
    }
  }

  const lecteur = api.sim.lecteur("#h-construction-lecteur", {
    de: 0,
    a: 7.5,
    duree: 16,
    boucle: true,
    auto: false,
    libelle: "Construire les diagrammes étape par étape",
    rappel(valeur) {
      dessiner(Math.min(7, valeur));
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(7);
  } else {
    dessiner(7);
  }
}

/* --------------------------------------------------------------------------
   I. Simulation : impédance harmonique du jeu de barres
   -------------------------------------------------------------------------- */

function modeleJeu(reglage) {
  const xs = (SITE.uc * SITE.uc) / reglage.scc;
  const avecBatterie = reglage.q > 1;
  const xc = avecBatterie ? (SITE.u * SITE.u) / (reglage.q * (1 - reglage.p)) : Infinity;
  const xl = avecBatterie ? reglage.p * xc : 0;
  const rb = avecBatterie ? 0.005 * xc : 0;
  /* impédance complexe vue du jeu de barres au rang h */
  const impedance = (h, batterie) => {
    let g = 1 / reglage.rd;
    let b = -1 / (h * xs);
    if (batterie && avecBatterie) {
      const xb = h * xl - xc / h;
      const den = rb * rb + xb * xb;
      g += rb / den;
      b += -xb / den;
    }
    return 1 / Math.hypot(g, b);
  };
  const np = avecBatterie ? Math.sqrt(xc / (xs + xl)) : Infinity;
  const ns = avecBatterie && reglage.p > 0 ? 1 / Math.sqrt(reglage.p) : NaN;
  return {
    xs,
    ls: xs / SITE.w,
    c: avecBatterie ? 1 / (SITE.w * xc) : 0,
    l: xl / SITE.w,
    xc,
    xl,
    np,
    ns,
    uc: SITE.u / (1 - reglage.p),
    impedance,
    avecBatterie,
  };
}

function construireJeu(racine, api) {
  const reglage = { q: 6167, p: 0, scc: 2.5e6, rd: 10 };
  const RANGS = [5, 7, 11, 13];

  const trace = api.sim.traceur("#i-jeu-trace", {
    titre: "Impédance harmonique vue du jeu de barres, par phase",
    genre: "Simulation",
    xTitre: "rang h",
    xMin: 1,
    xMax: 25,
    yTitre: "|Z|",
    yUnite: "Ω",
    yMin: 0,
    yMax: 8,
    ratio: 0.42,
    echantillons: 1200,
    series: [
      { id: "avec", nom: "avec la batterie réglée", couleur: "serie-5", epaisseur: 2.6 },
      { id: "sans", nom: "source seule, sans batterie", couleur: "serie-6", epaisseur: 1.8 },
    ],
    surDessin({ c, repere, couleurs }) {
      for (const rang of RANGS) ligneV(c, repere, couleurs, rang, String(rang));
      const m = modeleJeu(reglage);
      const basDeCadre = (x, libelle) => {
        c.save();
        c.fillStyle = couleurs.texte;
        c.font = POLICE;
        c.textAlign = "left";
        c.fillText(libelle, repere.versX(x) + 5, repere.boite.y + repere.boite.h - 8);
        c.restore();
      };
      if (Number.isFinite(m.np) && m.np <= 25) {
        ligneV(c, repere, couleurs, m.np, "", 3);
        basDeCadre(m.np, "np");
      }
      if (Number.isFinite(m.ns) && m.ns <= 25) {
        ligneV(c, repere, couleurs, m.ns, "", 1.6, [2, 3]);
        c.save();
        c.fillStyle = couleurs.texte;
        c.font = POLICE;
        c.textAlign = "left";
        c.fillText("ns", repere.versX(m.ns) + 5, repere.boite.y + repere.boite.h - 24);
        c.restore();
      }
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#i-jeu-valeurs", [
    { id: "ls", libelle: "Inductance de source Ls", unite: "mH", decimales: 3 },
    { id: "c", libelle: "Capacité par phase", unite: "µF", decimales: 1 },
    { id: "l", libelle: "Self anti-harmonique par phase", unite: "mH", decimales: 2 },
    { id: "np", libelle: "Rang de résonance parallèle np", format: (v) => v },
    { id: "ns", libelle: "Rang d'accord série ns = 1 / √p", format: (v) => v },
    { id: "uc", libelle: "Tension des condensateurs", unite: "V", decimales: 1 },
    { id: "r5", libelle: "Rang 5 : |Z| avec / sans batterie", decimales: 2 },
    { id: "r11", libelle: "Rang 11 : |Z| avec / sans batterie", decimales: 2 },
    { id: "u11", libelle: "Tension de rang 11 due à la pompe", format: (v) => v },
    { id: "verdict", libelle: "Diagnostic", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const m = modeleJeu(reglage);
    if (trace) {
      let maxi = 0;
      for (let k = 0; k <= 960; k += 1) {
        const h = 1 + (24 * k) / 960;
        maxi = Math.max(maxi, m.impedance(h, true), m.impedance(h, false));
      }
      trace.definirPlage({ yMax: Math.min(60, Math.max(2, maxi * 1.12)) });
      trace.definirFonction("avec", (h) => m.impedance(h, true));
      trace.definirFonction("sans", (h) => m.impedance(h, false));
    }
    if (!valeurs) return;
    const rapport = (h) => m.impedance(h, true) / m.impedance(h, false);
    const u11 = (SITE.i1Pompe / 11) * m.impedance(11, true);
    let verdict;
    if (!m.avecBatterie) verdict = "pas de batterie : pas de résonance";
    else {
      const proche = RANGS.find((rang) => Math.abs(m.np - rang) < 1.2);
      if (proche) verdict = "résonance proche du rang " + proche + " : amplification";
      else if (m.np < 4.5) verdict = "résonance sous le rang 5 : rangs 5 à 13 protégés";
      else verdict = "résonance entre rangs harmoniques : à vérifier par mesure";
    }
    valeurs.maj({
      ls: m.ls * 1000,
      c: m.c * 1e6,
      l: m.l * 1000,
      np: Number.isFinite(m.np) ? nombre(api, m.np, 2) + ", soit " + nombre(api, m.np * 50, 0) + " Hz" : "aucun",
      ns: Number.isFinite(m.ns) ? nombre(api, m.ns, 2) + ", soit " + nombre(api, m.ns * 50, 0) + " Hz" : "pas de self",
      uc: m.avecBatterie ? m.uc : SITE.u,
      r5: rapport(5),
      r11: rapport(11),
      u11: nombre(api, u11, 1) + " V, " + nombre(api, (u11 / SITE.u) * 100, 1) + " % de 230 V",
      verdict,
    });
  }

  const curseurs = api.sim.curseurs(
    "#i-jeu-curseurs",
    [
      { id: "q", libelle: "Réactif de la batterie globale, par phase", min: 0, max: 8, pas: 0.01, valeur: 6.17, unite: "kvar" },
      { id: "p", libelle: "Taux de self p = XL / XC à 50 Hz", min: 0, max: 14, pas: 0.5, valeur: 0, unite: "%" },
      { id: "scc", libelle: "Puissance de court-circuit de la source", min: 0.5, max: 5, pas: 0.1, valeur: 2.5, unite: "MVA" },
      { id: "rd", libelle: "Amortissement : résistance équivalente des charges", min: 1, max: 100, pas: 1, valeur: 10, unite: "Ω" },
    ],
    (lues) => {
      reglage.q = lues.q * 1000;
      reglage.p = lues.p / 100;
      reglage.scc = lues.scc * 1e6;
      reglage.rd = lues.rd;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/** Dessin d'exercice : impédance d'un circuit parallèle, quatre points repérés. */
function dessinParallele(idMarqueur) {
  const versX = (x) => 60 + ((x - 0.4) / 1.4) * 500;
  const versY = (g) => 290 - 240 * g;
  let chemin = "";
  for (let k = 0; k <= 140; k += 1) {
    const x = 0.4 + (1.4 * k) / 140;
    chemin += (k === 0 ? "M" : "L") + versX(x).toFixed(1) + " " + versY(gainNormalise(5, x)).toFixed(1);
  }
  const points = [
    ["A", 0.6],
    ["B", 0.905],
    ["C", 1],
    ["D", 1.4],
  ];
  let marques = "";
  for (const [nom, x] of points) {
    const px = versX(x);
    const py = versY(gainNormalise(5, x));
    marques += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="5" fill="currentColor"/>';
    marques += texte(px + (nom === "B" ? -14 : 0), py - 14, nom, ' text-anchor="middle" font-size="14" font-weight="600"');
  }
  return (
    "<defs>" + marqueur(idMarqueur) + "</defs>" +
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.65"><path d="M50 290H580" marker-end="url(#' + idMarqueur + ')"/><path d="M60 300V20" marker-end="url(#' + idMarqueur + ')"/></g>' +
    '<path d="' + chemin + '" stroke="currentColor" stroke-width="2.6" fill="none"/>' +
    '<path d="M60 ' + versY(1 / Math.SQRT2).toFixed(1) + 'H560" stroke="currentColor" stroke-width="1" fill="none" stroke-dasharray="4 4" opacity="0.7"/>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace">' +
    marques +
    texte(578, 310, "f / f0", ' text-anchor="end" font-size="11"') +
    texte(68, 30, "|Z| / R", ' font-size="11"') +
    texte(560, versY(1 / Math.SQRT2) + 16, "0,707", ' text-anchor="end" font-size="11"') +
    texte(versX(1), 310, "1", ' text-anchor="middle" font-size="11"') +
    texte(20, 330, "impédance d'un circuit RLC parallèle idéal, Q = 5", ' font-size="11"') +
    "</g>"
  );
}

/** Dessin de quiz : diagramme de Fresnel d'un circuit série sous la résonance. */
function dessinFresnelQuiz(idMarqueur) {
  return (
    "<defs>" + marqueur(idMarqueur) + "</defs>" +
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.6"><path d="M50 160H520" marker-end="url(#' + idMarqueur + ')"/></g>' +
    '<path d="M60 160H157" stroke="currentColor" stroke-width="3.4" fill="none" marker-end="url(#' + idMarqueur + ')"/>' +
    '<path d="M160 160V63" stroke="currentColor" stroke-width="2.2" fill="none" marker-end="url(#' + idMarqueur + ')"/>' +
    '<path d="M172 60V277" stroke="currentColor" stroke-width="2.2" fill="none" stroke-dasharray="6 4" marker-end="url(#' + idMarqueur + ')"/>' +
    '<path d="M60 160L158 277.6" stroke="currentColor" stroke-width="3.2" fill="none" stroke-dasharray="10 5" marker-end="url(#' + idMarqueur + ')"/>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="14" font-weight="600">' +
    '<text x="100" y="150">a</text><text x="140" y="110">b</text><text x="184" y="180">c</text><text x="88" y="240">d</text></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
    '<text x="520" y="178" text-anchor="end">I, référence</text>' +
    '<text x="240" y="300">circuit RLC série sous la résonance</text></g>'
  );
}

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : fréquence de résonance. */
  const f0K1 = f0De(20e-3, 470e-9);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-frequence",
      titre: "Fréquence de résonance d'un circuit LC",
      niveau: "fondamental",
      enonce:
        "<p>Un circuit série comprend une bobine de $20\\ \\mathrm{mH}$ et un condensateur de $470\\ \\mathrm{nF}$. Quelle est sa fréquence de résonance, en hertz ?</p>",
      valeur: f0K1,
      unite: "Hz",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Fréquence $f_0$",
      etapes: [
        { texte: "$LC = 0{,}02 \\times 470 \\times 10^{-9} = 9{,}4 \\times 10^{-9}\\ \\mathrm{s^2}$ ; $\\sqrt{LC} = 9{,}695 \\times 10^{-5}\\ \\mathrm{s}$." },
        { texte: "$\\omega_0 = 1/\\sqrt{LC} = 10\\,314\\ \\mathrm{rad/s}$." },
        { texte: "$f_0 = \\omega_0/(2\\pi) = 1642\\ \\mathrm{Hz}$.", note: "Oublier le $2\\pi$ donnerait $10\\,314$, six fois trop : c'est l'erreur la plus fréquente." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Les deux réactances se croisent à la résonance",
          xTitre: "f",
          xUnite: "Hz",
          yTitre: "X",
          yUnite: "Ω",
          xMin: 200,
          xMax: 4000,
          yMin: 0,
          yMax: 500,
          series: [
            { id: "xl", nom: "XL = L ω", couleur: "serie-1", epaisseur: 2.6, fonction: (f) => 20e-3 * TAU * f },
            { id: "xc", nom: "XC = 1 / (C ω)", couleur: "serie-5", epaisseur: 2.6, fonction: (f) => 1 / (470e-9 * TAU * f) },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, f0K1, 20e-3 * TAU * f0K1, "f0 = 1642 Hz, X = 206 Ω", false);
          },
        });
      },
    })
  );

  /* Fondamental 2 : surtension. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-surtension",
      titre: "Surtension aux bornes du condensateur",
      niveau: "fondamental",
      enonce:
        "<p>Un circuit RLC série, $R = 5\\ \\Omega$, $L = 10\\ \\mathrm{mH}$, $C = 1\\ \\mu\\mathrm{F}$, est alimenté sous $2\\ \\mathrm{V}$ efficaces à sa fréquence de résonance. Quelle est la tension efficace aux bornes du condensateur ?</p>",
      valeur: 40,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension $U_C$",
      etapes: [
        { texte: "$Z_0 = \\sqrt{L/C} = \\sqrt{10^{-2}/10^{-6}} = 100\\ \\Omega$ ; $Q = Z_0/R = 20$." },
        { texte: "À la résonance, $I_0 = U/R = 2/5 = 0{,}4\\ \\mathrm{A}$, et $U_C = Z_0 I_0 = 100 \\times 0{,}4 = 40\\ \\mathrm{V}$." },
        { texte: "Contrôle : $U_C = QU = 20 \\times 2 = 40\\ \\mathrm{V}$, soit $56{,}6\\ \\mathrm{V}$ crête à tenir sous une source de $2{,}8\\ \\mathrm{V}$ crête.", note: "$U_L$ vaut aussi $40\\ \\mathrm{V}$, en opposition : la somme ne laisse que les $2\\ \\mathrm{V}$ de la résistance." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Tensions à la résonance, référence sur le courant",
          unite: "V",
          somme: true,
          nomSomme: "U = UR = 2 V",
          vecteurs: [
            { id: "ur", nom: "UR = 2 V", amplitude: 2, phase: 0, couleur: "serie-1" },
            { id: "ul", nom: "UL = 40 V", amplitude: 40, phase: 90, couleur: "serie-3" },
            { id: "uc", nom: "UC = 40 V", amplitude: 40, phase: -90, couleur: "serie-5", pointille: true },
          ],
        });
      },
    })
  );

  /* Intermédiaire 1 : fréquence de coupure haute. */
  const dfK3 = 8 / (TAU * 40e-3);
  const f0K3 = f0De(40e-3, 1e-6);
  const f2K3 = Math.sqrt((dfK3 / 2) ** 2 + f0K3 * f0K3) + dfK3 / 2;
  const f1K3 = f2K3 - dfK3;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-coupure",
      titre: "Bande passante et fréquence de coupure haute",
      niveau: "intermédiaire",
      enonce:
        "<p>Un circuit RLC série a $R = 8\\ \\Omega$, $L = 40\\ \\mathrm{mH}$ et $C = 1\\ \\mu\\mathrm{F}$. Calculez $f_0$, $Q$ et la bande passante, puis donnez la fréquence de coupure haute $f_2$, en hertz, avec une décimale.</p>",
      valeur: f2K3,
      unite: "Hz",
      tolerance: 0.002,
      chiffres: 1,
      libelleChamp: "Fréquence de coupure haute $f_2$",
      etapes: [
        { texte: "$f_0 = 1/(2\\pi\\sqrt{0{,}04 \\times 10^{-6}}) = 1/(2\\pi \\times 2 \\times 10^{-4}) = 795{,}8\\ \\mathrm{Hz}$." },
        { texte: "$Z_0 = \\sqrt{L/C} = 200\\ \\Omega$ ; $Q = 200/8 = 25$ ; $\\Delta f = R/(2\\pi L) = 8/(2\\pi \\times 0{,}04) = 31{,}83\\ \\mathrm{Hz}$." },
        { texte: "$\\sqrt{(\\Delta f/2)^2 + f_0^2} = \\sqrt{15{,}92^2 + 795{,}77^2} = 795{,}93\\ \\mathrm{Hz}$." },
        { texte: "$f_2 = 795{,}93 + 15{,}92 = 811{,}8\\ \\mathrm{Hz}$ et $f_1 = 780{,}0\\ \\mathrm{Hz}$.", note: "Contrôle : $\\sqrt{780{,}0 \\times 811{,}8} = 795{,}8\\ \\mathrm{Hz}$. Pour $Q = 25$, l'approximation $f_0 + \\Delta f/2 = 811{,}7\\ \\mathrm{Hz}$ est déjà excellente." },
      ],
      visuelCorrection(conteneur, moteur) {
        courbeSerieCorrection(moteur, conteneur, "Courant sous 1 V : bande passante entre f1 et f2", 1, 8, 40e-3, 1e-6, 700, 900, (c, repere, couleurs) => {
          marquerPoint(c, repere, couleurs, f1K3, 1 / 8 / Math.SQRT2, "f1 = 780,0 Hz", true);
          marquerPoint(c, repere, couleurs, f2K3, 1 / 8 / Math.SQRT2, "f2 = 811,8 Hz", false);
        });
      },
    })
  );

  /* Intermédiaire 2 : lecture d'une courbe d'impédance parallèle. */
  ressources.push(
    api.exercice.schema(cible, {
      id: "k-parallele",
      titre: "Nature d'un circuit parallèle sur sa courbe d'impédance",
      niveau: "intermédiaire",
      consigne: "Cliquez sur le point où le circuit est capacitif, puis validez.",
      enonce:
        "<p>La courbe donne l'impédance d'un circuit RLC parallèle idéal, rapportée à $R$, en fonction de $f/f_0$. Quatre points sont repérés. Lequel correspond à un fonctionnement capacitif ?</p>",
      viewBox: "0 0 600 340",
      description: "Courbe en cloche de l'impédance d'un circuit parallèle, point A loin sous la résonance, B à la coupure basse, C au sommet, D au-dessus de la résonance",
      dessin: dessinParallele("fl-k-pa"),
      zones: [
        { x: 104, y: 200, largeur: 56, hauteur: 56, etiquette: "point A" },
        { x: 210, y: 76, largeur: 56, hauteur: 52, etiquette: "point B" },
        { x: 248, y: 18, largeur: 56, hauteur: 52, etiquette: "point C" },
        { x: 390, y: 186, largeur: 56, hauteur: 52, etiquette: "point D", juste: true },
      ],
      etapes: [
        { texte: "En parallèle, l'admittance vaut $1/R + j(C\\omega - 1/(L\\omega))$ : sous $f_0$, la susceptance de la bobine l'emporte, l'admittance est inductive, et le circuit aussi." },
        { texte: "A et B sont sous $f_0$ : inductifs ; C est au sommet, $|Z| = R$, résistif." },
        { texte: "D est au-dessus de $f_0$ : le condensateur dérive le plus de courant, le circuit est capacitif, avec $|Z| = 0{,}28\\,R$ à $1{,}4\\,f_0$.", note: "C'est l'inverse du circuit série, capacitif sous la résonance." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Déphasage de la tension sur le courant d'un circuit parallèle, Q = 5",
          xTitre: "f / f0",
          xMin: 0.4,
          xMax: 1.8,
          yTitre: "φ",
          yUnite: "degrés",
          yMin: -90,
          yMax: 90,
          series: [{ id: "phi", nom: "φ = - arctan(Q (x - 1/x))", couleur: "serie-4", epaisseur: 2.6, fonction: (x) => -Math.atan(5 * (x - 1 / x)) / DEG }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 0, "φ = 0 : résistif", true);
            marquerPoint(c, repere, couleurs, 1.4, -Math.atan(5 * (1.4 - 1 / 1.4)) / DEG, "D : - 73,7°, capacitif", true);
            marquerPoint(c, repere, couleurs, 0.6, -Math.atan(5 * (0.6 - 1 / 0.6)) / DEG, "A : + 79,4°, inductif", false);
          },
        });
      },
    })
  );

  /* Avancé : filtre accordé et résonance parallèle avec la source. */
  const lK5 = 1 / ((TAU * 250) ** 2 * 300e-6);
  const fpK5 = 1 / (TAU * Math.sqrt((lK5 + 0.2e-3) * 300e-6));
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-filtre",
      titre: "Filtre accordé au rang 5 et résonance cachée",
      niveau: "avancé",
      enonce:
        "<p>On veut absorber le courant de rang $5$ d'un variateur sur un réseau $50\\ \\mathrm{Hz}$ par un filtre série $L$, $C$ accordé à $250\\ \\mathrm{Hz}$, avec $C = 300\\ \\mu\\mathrm{F}$ par phase. La source a une inductance de $0{,}2\\ \\mathrm{mH}$ par phase. Calculez l'inductance du filtre, puis la fréquence de la résonance parallèle que forme le filtre avec la source, en hertz. Concluez sur le choix de l'accord.</p>",
      valeur: fpK5,
      unite: "Hz",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Fréquence de résonance parallèle $f_p$",
      etapes: [
        { texte: "Accord série : $L = 1/(\\omega_5^2C) = 1/((2\\pi \\times 250)^2 \\times 300 \\times 10^{-6}) = 1/(2{,}467 \\times 10^6 \\times 3 \\times 10^{-4}) = 1{,}351\\ \\mathrm{mH}$." },
        { texte: "Vu d'un courant injecté au jeu de barres, la source $L_s$ est en parallèle avec la branche $L + C$ ; l'impédance est infinie quand $jL_s\\omega + jL\\omega + 1/(jC\\omega) = 0$, soit $\\omega_p^2(L_s + L)C = 1$." },
        { texte: "$f_p = 1/(2\\pi\\sqrt{(0{,}2 + 1{,}351) \\times 10^{-3} \\times 300 \\times 10^{-6}}) = 1/(2\\pi \\times 6{,}821 \\times 10^{-4}) = 233{,}3\\ \\mathrm{Hz}$, rang $4{,}67$." },
        { texte: "Le filtre est un creux d'impédance à $250\\ \\mathrm{Hz}$, mais il crée un pic à $233\\ \\mathrm{Hz}$, juste en dessous : toute dérive de $L$ ou de $C$, ou un courant interharmonique, y serait amplifié.", note: "D'où l'usage d'accorder un filtre légèrement sous le rang visé, vers $4{,}7$ par exemple, et de surveiller le vieillissement des condensateurs, dont la perte de capacité fait monter l'accord." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Impédance vue du jeu de barres : source en parallèle avec le filtre",
          xTitre: "f",
          xUnite: "Hz",
          yTitre: "|Z|",
          yUnite: "Ω",
          xMin: 100,
          xMax: 500,
          yMin: 0,
          yMax: 3,
          series: [
            {
              id: "z",
              nom: "|Z| avec filtre, faible amortissement",
              couleur: "serie-5",
              epaisseur: 2.6,
              fonction: (f) => {
                const w = TAU * f;
                const xs = 0.2e-3 * w;
                const xb = lK5 * w - 1 / (300e-6 * w);
                const g = 1 / 20 + 0.02 / (0.02 * 0.02 + xb * xb);
                const b = -1 / xs - xb / (0.02 * 0.02 + xb * xb);
                return 1 / Math.hypot(g, b);
              },
            },
            { id: "s", nom: "source seule, Ls ω", couleur: "serie-6", epaisseur: 1.8, fonction: (f) => 0.2e-3 * TAU * f },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, fpK5, "fp = 233,3 Hz");
            ligneV(c, repere, couleurs, 250, "accord 250 Hz", 1.6, [2, 3]);
          },
        });
      },
    })
  );

  /* Diagnostic industriel. */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Un variateur qui déclenche à l'enclenchement d'une batterie",
      niveau: "diagnostic",
      enonce:
        "<p>Sur un site, une batterie nue de $371\\ \\mu\\mathrm{F}$ par phase est enclenchée au tableau général, alimenté par une source de $0{,}204\\ \\mathrm{mH}$ par phase. À chaque enclenchement, un variateur voisin déclenche sur un défaut de surtension de son bus continu, et l'enregistreur montre une oscillation brève de la tension du jeu de barres. Quelles conclusions sont justifiées ?</p>",
      options: [
        { texte: "L'enclenchement excite le circuit série formé par $L_s$ et $C$, qui oscille vers $1/(2\\pi\\sqrt{L_sC}) \\approx 579\\ \\mathrm{Hz}$.", juste: true },
        { texte: "Sans amortissement, la tension transitoire peut approcher deux fois la crête du réseau, et le bus continu du variateur, alimenté par un pont de diodes, se charge à cette crête.", juste: true },
        { texte: "Le variateur est défectueux : un appareil sain ne voit pas les manœuvres du réseau." },
        { texte: "Des remèdes possibles sont une self de choc ou anti-harmonique en série avec la batterie, un enclenchement synchronisé au passage par zéro de la tension, des gradins plus petits ou une self de ligne côté variateur.", juste: true },
        { texte: "Augmenter la capacité de la batterie ferait disparaître l'oscillation." },
      ],
      etapes: [
        { texte: "À la fermeture, la batterie déchargée est en série avec $L_s$ face à la tension du réseau : c'est un échelon appliqué à un circuit LC peu amorti, étudié dans le cours Régime transitoire RLC." },
        { texte: "$f = 1/(2\\pi\\sqrt{0{,}204 \\times 10^{-3} \\times 371 \\times 10^{-6}}) = 579\\ \\mathrm{Hz}$ ; l'écart entre la tension du réseau et celle du condensateur oscille autour de sa valeur finale, avec un dépassement qui tend vers $100\\ \\%$ sans amortissement." },
        { texte: "Le pont de diodes du variateur charge son bus à la crête de la tension d'entrée : la crête transitoire passe dans le bus et déclenche la protection. Augmenter $C$ abaisserait la fréquence sans réduire l'amplitude.", note: "La même batterie est une résonance série à l'enclenchement et une résonance parallèle pour les harmoniques : c'est la façon dont elle est excitée qui décide." },
      ],
      visuelCorrection(conteneur, moteur) {
        const f = 1 / (TAU * Math.sqrt(0.20372e-3 * 371.06e-6));
        traceCorrection(moteur, conteneur, {
          titre: "Tension du condensateur après un enclenchement à la crête, rapportée à la crête du réseau",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "u / Um",
          xMin: 0,
          xMax: 10,
          yMin: -2.2,
          yMax: 2.2,
          series: [
            { id: "u", nom: "uC, amortissement faible", couleur: "serie-5", epaisseur: 2.2, fonction: (t) => Math.cos(TAU * 50 * t / 1000) - Math.cos(TAU * f * t / 1000) * Math.exp(-t / 8) },
            { id: "r", nom: "tension du réseau", couleur: "serie-6", epaisseur: 1.6, fonction: (t) => Math.cos(TAU * 50 * t / 1000) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 1, "crête du réseau", false);
          },
        });
      },
    })
  );

  /* Conceptuel. */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Une tension plus grande que celle de la source",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi la tension aux bornes du condensateur d'un circuit RLC série à la résonance peut valoir plusieurs fois la tension de la source, sans que la conservation de l'énergie soit violée. Que fournit alors la source ?</p>",
      motsCles: [
        ["oppos", "compens", "annul", "s'equilibr"],
        ["energie", "stock", "echange", "reservoir"],
        ["resistance", "pertes", "joule", "active", "dissip"],
        ["qualite", "q fois", "facteur q", "facteur de qualite"],
      ],
      minimum: 3,
      exemple: "Trois phrases : ce que font les tensions de L et C l'une par rapport à l'autre, où est l'énergie, ce que fournit la source.",
      etapes: [
        { texte: "À la résonance, $U_L$ et $U_C$ sont égales et en opposition : leur somme est nulle, et la source ne voit que la résistance." },
        { texte: "L'énergie stockée, constante, passe de la bobine au condensateur et revient ; elle a été accumulée pendant l'établissement, période après période." },
        { texte: "La source ne fournit que la puissance active $RI^2$ ; le rapport entre l'énergie stockée et celle dissipée par période fixe $Q$, donc la surtension $QU$.", note: "Aucune puissance n'est créée : une grande tension réactive ne transporte pas de puissance active." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Énergies à la résonance de l'exemple : la somme est constante",
          xTitre: "t",
          xUnite: "périodes",
          yTitre: "énergie",
          yUnite: "mJ",
          xMin: 0,
          xMax: 2,
          yMin: 0,
          yMax: 15,
          series: [
            { id: "wl", nom: "wL, bobine", couleur: "serie-1", epaisseur: 2.2, fonction: (t) => 12.5 * Math.sin(TAU * t) ** 2 },
            { id: "wc", nom: "wC, condensateur", couleur: "serie-5", epaisseur: 2.2, fonction: (t) => 12.5 * Math.cos(TAU * t) ** 2 },
            { id: "wt", nom: "somme", couleur: "serie-2", epaisseur: 3, fonction: () => 12.5 },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>À la résonance, l'impédance d'un circuit RLC série idéal est :</p>",
        options: ["nulle", "égale à $R$, minimale", "égale à $\\sqrt{L/C}$", "infinie"],
        bonnes: [1],
        explication: "Les réactances s'annulent, il ne reste que $R$ ; c'est le minimum de $|\\underline{Z}|$. $\\sqrt{L/C}$ est l'impédance caractéristique, réactance de chaque élément.",
        resume: "Impédance série à la résonance",
      },
      {
        type: "vraiFaux",
        enonce: "<p>À la résonance d'un circuit RLC parallèle idéal alimenté sous tension constante, le courant fourni par la source est maximal.</p>",
        reponse: false,
        explication: "L'impédance est maximale, égale à $R$ : le courant fourni est minimal, $U/R$, alors que la bobine et le condensateur sont parcourus par $Q_p$ fois ce courant.",
        resume: "Courant d'un circuit parallèle",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la fréquence de résonance, en hertz, de $L = 1\\ \\mathrm{mH}$ et $C = 10\\ \\mu\\mathrm{F}$ ?</p>",
        valeur: f0De(1e-3, 10e-6),
        unite: "Hz",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$\\sqrt{LC} = \\sqrt{10^{-8}} = 10^{-4}\\ \\mathrm{s}$ ; $f_0 = 1/(2\\pi \\times 10^{-4}) = 1591{,}5\\ \\mathrm{Hz}$.",
        resume: "Fréquence de résonance",
      },
      {
        type: "calcul",
        enonce: "<p>Un circuit résonne à $1\\ \\mathrm{kHz}$ avec une bande passante de $50\\ \\mathrm{Hz}$. Quel est son facteur de qualité ?</p>",
        valeur: 20,
        tolerance: 0.01,
        chiffres: 1,
        explication: "$Q = f_0/\\Delta f = 1000/50 = 20$.",
        resume: "Facteur de qualité et bande passante",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi un circuit très sélectif, de grand $Q$, met-il longtemps à atteindre son régime établi ?</p>",
        motsCles: [["energie", "stock"], ["pertes", "dissip", "amorti", "resistance"], ["periode", "constante", "2l/r", "lent", "longtemps"]],
        minimum: 2,
        explication:
          "Il stocke beaucoup d'énergie par rapport à ce qu'il dissipe par période ; cette énergie s'accumule période après période, avec une constante $\\tau = 2L/R = 2Q/\\omega_0$, soit environ $Q/\\pi$ périodes.",
        resume: "Sélectivité et lenteur",
      },
      {
        type: "vraiFaux",
        enonce: "<p>La bande passante d'un circuit RLC série, $\\Delta\\omega = R/L$, ne dépend pas de la capacité.</p>",
        reponse: true,
        explication: "$\\Delta\\omega = \\omega_0/Q = (1/\\sqrt{LC}) \\times R\\sqrt{C/L} = R/L$ : $C$ déplace la résonance mais pas la largeur absolue de la bande.",
        resume: "Bande passante série",
      },
      {
        type: "qcm",
        enonce: "<p>Au-dessus de sa fréquence de résonance, un circuit RLC série est :</p>",
        options: ["capacitif", "résistif", "inductif", "ouvert"],
        bonnes: [2],
        explication: "$L\\omega$ croît et $1/(C\\omega)$ décroît : au-dessus de $f_0$, la réactance nette est positive, le courant est en retard, le circuit est inductif.",
        resume: "Nature au-dessus de f0",
      },
      {
        type: "calcul",
        enonce: "<p>Un circuit série de facteur de qualité $Q = 4$ est alimenté sous $12\\ \\mathrm{V}$ efficaces à sa résonance. Quelle est la tension efficace aux bornes de la bobine ?</p>",
        valeur: 48,
        unite: "V",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$U_L = QU = 4 \\times 12 = 48\\ \\mathrm{V}$, autant aux bornes du condensateur.",
        resume: "Surtension série",
      },
      {
        type: "schema",
        enonce: "<p>Sur ce diagramme de Fresnel d'un circuit RLC série tracé sous la résonance, quel vecteur représente la tension du condensateur ?</p>",
        consigne: "Cliquez sur l'étiquette du vecteur correspondant.",
        viewBox: "0 0 560 320",
        description: "Diagramme de Fresnel : a horizontal épais, b vertical vers le haut, c vertical en tirets vers le bas plus long que b, d en tirets épais de l'origine vers le bas à droite",
        dessin: dessinFresnelQuiz("fl-l-f"),
        zones: [
          { x: 86, y: 128, largeur: 40, hauteur: 32, etiquette: "a" },
          { x: 126, y: 88, largeur: 40, hauteur: 32, etiquette: "b" },
          { x: 172, y: 158, largeur: 40, hauteur: 32, etiquette: "c", juste: true },
          { x: 74, y: 218, largeur: 40, hauteur: 32, etiquette: "d" },
        ],
        explication: "a est $U_R$, en phase avec le courant ; b est $U_L$, en avance de $90^\\circ$ ; c est $U_C$, en retard de $90^\\circ$ et plus grand que $U_L$ sous la résonance ; d est la tension de la source, en retard sur le courant : circuit capacitif.",
        resume: "Lecture d'un diagramme de Fresnel",
      },
      {
        type: "calcul",
        enonce: "<p>Un circuit RLC parallèle idéal a $R = 1\\ \\mathrm{k\\Omega}$, $L = 10\\ \\mathrm{mH}$ et $C = 1\\ \\mu\\mathrm{F}$. Quelle est sa bande passante, en hertz ?</p>",
        valeur: 1 / (TAU * 1000 * 1e-6),
        unite: "Hz",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$Q_p = R\\sqrt{C/L} = 1000 \\times 0{,}01 = 10$ ; $f_0 = 1591{,}5\\ \\mathrm{Hz}$ ; $\\Delta f = f_0/Q_p = 159{,}2\\ \\mathrm{Hz}$, égal à $1/(2\\pi RC)$.",
        resume: "Bande passante parallèle",
      },
    ],
    { titre: "Dix questions sur la résonance série et parallèle" }
  );
  if (quiz) ressources.push(quiz);
}

/* --------------------------------------------------------------------------
   M. Fiche de mémorisation
   -------------------------------------------------------------------------- */

function construireCartesMemo(racine, api) {
  const cartes = api.cartes(
    "#m-cartes",
    [
      { categorie: "Principe", question: "Que se passe-t-il physiquement à la résonance ?", reponse: "Les réactances de $L$ et $C$ s'annulent ; l'énergie s'échange entre la bobine et le condensateur sans passer par la source, qui ne fournit que les pertes." },
      { categorie: "Formule", question: "Quelle est la fréquence de résonance d'un circuit $L$, $C$ ?", reponse: "$f_0 = 1/(2\\pi\\sqrt{LC})$ ; $1/\\sqrt{LC}$ est une pulsation, en radians par seconde." },
      { categorie: "Série", question: "Que valent l'impédance et les tensions d'un circuit série à la résonance ?", reponse: "$\\underline{Z} = R$, minimale ; $I_0 = U/R$ ; $U_L = U_C = QU$, en opposition." },
      { categorie: "Parallèle", question: "Que valent l'impédance et les courants d'un circuit parallèle à la résonance ?", reponse: "$\\underline{Z} = R$, maximale ; $U = RI$ ; $I_L = I_C = Q_pI$, en opposition." },
      { categorie: "Qualité", question: "Comment calcule-t-on le facteur de qualité ?", reponse: "Série : $Q = \\sqrt{L/C}/R$ ; parallèle : $Q_p = R/\\sqrt{L/C}$ ; en général $Q = 2\\pi W_{\\text{stockée}}/W_{\\text{dissipée par période}}$." },
      { categorie: "Bande", question: "Que vaut la bande passante à $-3\\ \\mathrm{dB}$ ?", reponse: "$\\Delta f = f_0/Q$ ; en série exactement $R/(2\\pi L)$ ; $f_1f_2 = f_0^2$." },
      { categorie: "Nature", question: "Quelle est la nature d'un circuit sous sa résonance ?", reponse: "Série : capacitif. Parallèle : inductif. Au-dessus, c'est l'inverse." },
      { categorie: "Bouchon réel", question: "Comment traiter la résistance série $r$ d'une bobine en parallèle sur $C$ ?", reponse: "Résonance de phase à $\\omega_0\\sqrt{1 - 1/Q^2}$, impédance $L/(rC)$ ; près de la résonance, $r$ équivaut à $R_p \\approx Q^2r$ en parallèle." },
      { categorie: "Dynamique", question: "Combien de temps met une résonance à s'établir ?", reponse: "Enveloppe en $1 - e^{-t/\\tau}$ avec $\\tau = 2L/R = 2Q/\\omega_0$, soit environ $Q/\\pi$ périodes ; et $\\zeta = 1/(2Q)$." },
      {
        categorie: "Industriel",
        question: "Comment protège-t-on une batterie de condensateurs d'une résonance harmonique ?",
        reponse: "Par une self anti-harmonique en série : accord $n_s = 1/\\sqrt{p}$, $3{,}78$ pour $p = 7\\ \\%$ ; la résonance parallèle avec la source passe sous le rang $5$, au prix de $1/(1 - p)$ de tension sur les condensateurs.",
        rappel: "Site : 345 µF et 2,06 mH par phase pour 6,17 kvar ; résonance parallèle au rang 3,6.",
      },
    ],
    { titre: "Dix cartes sur la résonance série et parallèle" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: "<p>Un circuit résonne à $2\\ \\mathrm{kHz}$ avec un facteur de qualité de $25$. Quelle est sa bande passante, en hertz ?</p>",
        valeur: 80,
        unite: "Hz",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$\\Delta f = f_0/Q = 2000/25 = 80\\ \\mathrm{Hz}$.",
        resume: "Bande passante (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Sous sa fréquence de résonance, un circuit RLC parallèle est inductif.</p>",
        reponse: true,
        explication: "Sous $f_0$, $1/(L\\omega) &gt; C\\omega$ : la bobine dérive le plus de courant, la susceptance nette est inductive.",
        resume: "Nature d'un circuit parallèle (cette séance)",
      },
      {
        type: "qcm",
        enonce: "<p>Qu'est-ce qui limite le courant d'un circuit RLC série à sa résonance ?</p>",
        options: ["L'inductance", "La capacité", "La résistance", "Rien, il est infini"],
        bonnes: [2],
        explication: "Les réactances s'annulent : $I_0 = U/R$. Dans un circuit réel, $R$ regroupe la résistance du fil de la bobine, les pertes du condensateur et la résistance interne de la source.",
        resume: "Limitation du courant (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Une charge absorbe $10\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}80$. Quel réactif installer, en vars, pour atteindre $\\cos\\varphi = 1$ ?</p>",
        valeur: 7500,
        unite: "var",
        tolerance: 0.01,
        chiffres: 0,
        explication: "$Q_C = P(\\tan\\varphi_1 - \\tan\\varphi_2) = 10\\,000 \\times (0{,}75 - 0) = 7500\\ \\mathrm{var}$. Révisé du cours Correction du facteur de puissance.",
        resume: "Formule des tangentes (cours précédent)",
      },
      {
        type: "qcm",
        enonce: "<p>Une batterie de $80\\ \\mathrm{kvar}$ est raccordée à un jeu de barres de puissance de court-circuit $2\\ \\mathrm{MVA}$. Que vaut le rang de résonance parallèle, et qu'en conclure en présence de variateurs ?</p>",
        options: [
          "$n_r = 25$ : aucun risque",
          "$n_r = 5$ : résonance exactement sur le rang le plus fort d'un pont à six diodes, self anti-harmonique indispensable",
          "$n_r = 0{,}04$ : la batterie est trop petite",
          "$n_r = 12{,}5$ : entre les rangs 11 et 13",
        ],
        bonnes: [1],
        explication: "$n_r = \\sqrt{S_{cc}/Q_C} = \\sqrt{2000/80} = 5$. Révisé du cours Correction du facteur de puissance, et expliqué ici : c'est la résonance parallèle de $L_s$ et $C$.",
        resume: "Rang de résonance (cours précédent)",
      },
      {
        type: "qcm",
        enonce: "<p>Dans une analyse nodale, combien d'équations indépendantes faut-il pour un réseau de quatre nœuds sans source de tension, dont un sert de référence ?</p>",
        options: ["2", "3", "4", "6"],
        bonnes: [1],
        explication: "Une équation par nœud autre que la référence : $4 - 1 = 3$. Révisé du cours Méthodes de résolution systématique ; la même méthode, avec des admittances complexes, donne l'impédance d'un jeu de barres à chaque rang harmonique.",
        resume: "Analyse nodale (Méthodes de résolution systématique)",
      },
      {
        type: "calcul",
        enonce: "<p>Un circuit RLC série a un facteur de qualité $Q = 5$. Quel est son coefficient d'amortissement $\\zeta$ ?</p>",
        valeur: 0.1,
        tolerance: 0.01,
        chiffres: 2,
        explication: "$\\zeta = (R/2)\\sqrt{C/L} = 1/(2Q) = 0{,}1$ : régime pseudo-périodique, dépassement d'environ $73\\ \\%$. Révisé du cours Régime transitoire RLC.",
        resume: "Amortissement et qualité (Régime transitoire RLC)",
      },
    ],
    { titre: "Révision espacée : cette séance et les cours précédents" }
  );
  if (quiz) ressources.push(quiz);
}

/* --------------------------------------------------------------------------
   P. Auto-évaluation
   -------------------------------------------------------------------------- */

function construireAutoEval(racine, api) {
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur la résonance série et parallèle ?",
  });
  if (auto) ressources.push(auto);
}
