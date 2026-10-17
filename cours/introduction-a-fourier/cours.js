/* ==========================================================================
   cours/introduction-a-fourier/cours.js
   Introduction à Fourier : série de Fourier, calcul des coefficients par
   orthogonalité, symétries, spectres usuels, Parseval, phénomène de Gibbs,
   reconstruction partielle, transformée de Fourier discrète et réglage d'un
   analyseur de réseau.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;

/** Courant de ligne de la pompe : créneaux de 120 degrés, 50 A efficaces vrais. */
const I_CRENEAU = 50 * Math.sqrt(1.5);
const bPompe = (n) => (n % 2 === 1 ? ((4 * I_CRENEAU) / (n * Math.PI)) * Math.cos((n * Math.PI) / 6) : 0);
/** Rangs non nuls 6k plus ou moins 1, jusqu'au rang 199 pour l'analyseur. */
const RANGS_POMPE = [];
for (let n = 1; n <= 199; n += 2) if (n % 3 !== 0) RANGS_POMPE.push(n);

/* --------------------------------------------------------------------------
   Signaux usuels et leurs coefficients (période 1, amplitude 1)
   -------------------------------------------------------------------------- */

const centre = (x) => ((((x + 0.5) % 1) + 1) % 1) - 0.5;

const SIGNAUX = {
  1: {
    nom: "carré",
    exact: (x) => (((x % 1) + 1) % 1 < 0.5 ? 1 : -1),
    a0: () => 0,
    coef: (n) => ({ a: 0, b: n % 2 ? 4 / (n * Math.PI) : 0 }),
    efficace: () => 1,
    saut: 2,
    max: 1,
  },
  2: {
    nom: "triangle",
    exact: (x) => 1 - 4 * Math.abs(centre(x)),
    a0: () => 0,
    coef: (n) => ({ a: n % 2 ? 8 / (n * n * Math.PI * Math.PI) : 0, b: 0 }),
    efficace: () => 1 / Math.sqrt(3),
    saut: 0,
    max: 1,
  },
  3: {
    nom: "dent de scie",
    exact: (x) => 2 * centre(x),
    a0: () => 0,
    coef: (n) => ({ a: 0, b: ((2 / (n * Math.PI)) * (n % 2 ? 1 : -1)) }),
    efficace: () => 1 / Math.sqrt(3),
    saut: 2,
    max: 1,
  },
  4: {
    nom: "créneau",
    exact: (x, alpha) => (Math.abs(centre(x)) < alpha / 2 ? 1 : 0),
    a0: (alpha) => alpha,
    coef: (n, alpha) => ({ a: (2 / (n * Math.PI)) * Math.sin(n * Math.PI * alpha), b: 0 }),
    efficace: (alpha) => Math.sqrt(alpha),
    saut: 1,
    max: 1,
  },
};

/** Versions impaires utilisées par l'animation de projection (coefficients b_n). */
const SIGNAUX_IMPAIRS = {
  1: { nom: "carré", u: (x) => (((x % 1) + 1) % 1 < 0.5 ? 1 : -1), bn: (n) => (n % 2 ? 4 / (n * Math.PI) : 0) },
  2: {
    nom: "triangle",
    u: (x) => (2 / Math.PI) * Math.asin(Math.sin(TAU * x)),
    bn: (n) => (n % 2 ? (((n - 1) / 2) % 2 === 0 ? 1 : -1) * (8 / (n * n * Math.PI * Math.PI)) : 0),
  },
  3: { nom: "dent de scie", u: (x) => 2 * centre(x), bn: (n) => (2 / (n * Math.PI)) * (n % 2 ? 1 : -1) },
};

/* --------------------------------------------------------------------------
   Outils de dessin
   -------------------------------------------------------------------------- */

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function nombre(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
}

/** Pointe de flèche de taille fixe, indépendante de l'épaisseur du trait. */
function marqueur(id) {
  return (
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto-start-reverse">' +
    '<path d="M0 0 9 4 0 8Z" fill="currentColor"/></marker>'
  );
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

/** Ligne verticale en tirets sur un tracé, avec son libellé. */
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
    const aGauche = px > repere.boite.x + repere.boite.l * 0.72;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

/** Ligne horizontale sur un tracé, avec son libellé. */
function ligneH(c, repere, couleurs, y, libelle, enDessous, tirets = [7, 5]) {
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
    c.fillText(libelle, repere.boite.x + repere.boite.l - 4, py + (enDessous ? 14 : -6));
  }
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

/** Spectre figé pour une correction. */
function spectreCorrection(moteur, conteneur, options, barres) {
  const spectre = moteur.sim.spectre(conteneur, {
    genre: "Correction visuelle",
    ratio: 0.42,
    ...options,
  });
  if (spectre) {
    spectre.definirBarres(barres);
    ressources.push(spectre);
  }
  return spectre;
}

/** Somme partielle du courant de la pompe, theta en radians, rangs inclus jusqu'à nMax. */
function sommePompe(theta, rangs) {
  let s = 0;
  for (const n of rangs) s += bPompe(n) * Math.sin(n * theta);
  return s;
}

function creneauPompe(theta) {
  const d = ((((theta / DEG) % 360) + 360) % 360);
  if (d > 30 && d < 150) return I_CRENEAU;
  if (d > 210 && d < 330) return -I_CRENEAU;
  return 0;
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
  construirePhaseurs(racine, api);
  construireProjection(racine, api);
  construireSynthe(racine, api);
  construireReconstruction(racine, api);
  construireAnalyseur(racine, api);
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
    ["#d-somme-figure svg", 1.8],
    ["#e-symetries-figure svg", 1.6],
    ["#f-schema-principal svg", 1.8],
    ["#h-courant-figure svg", 1.8],
    ["#i-chaine-figure svg", 1.6],
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
    api.exercice.qcm("#c-minitest", {
      id: "c-orthogonalite",
      titre: "Moyenne d'un produit de sinusoïdes",
      niveau: "prérequis",
      enonce:
        "<p>Sur une période $T = 2\\pi/\\omega$, que valent les moyennes de $\\sin(3\\omega t)\\sin(5\\omega t)$ et de $\\sin^2(3\\omega t)$ ?</p>",
      options: [
        { texte: "$0$ et $1/2$", juste: true },
        { texte: "$1/2$ et $1/2$" },
        { texte: "$0$ et $0$" },
        { texte: "$1/2$ et $1$" },
      ],
      etapes: [
        { texte: "$\\sin a\\sin b = \\tfrac{1}{2}[\\cos(a - b) - \\cos(a + b)]$, donc $\\sin(3\\omega t)\\sin(5\\omega t) = \\tfrac{1}{2}[\\cos(2\\omega t) - \\cos(8\\omega t)]$." },
        { texte: "Sur une période commune, la moyenne de $\\cos(2\\omega t)$ et celle de $\\cos(8\\omega t)$ sont nulles : la moyenne du produit est $0$." },
        {
          texte: "$\\sin^2(3\\omega t) = \\tfrac{1}{2}[1 - \\cos(6\\omega t)]$, de moyenne $1/2$.",
          note: "C'est l'orthogonalité des sinusoïdes de rangs différents, base du calcul des coefficients de Fourier.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Le produit de deux rangs différents oscille autour de zéro",
          xTitre: "t / T",
          yTitre: "valeur",
          xMin: 0,
          xMax: 1,
          yMin: -1.1,
          yMax: 1.1,
          series: [
            { id: "p", nom: "sin(3ωt) sin(5ωt), moyenne 0", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => Math.sin(3 * TAU * x) * Math.sin(5 * TAU * x) },
            { id: "q", nom: "sin²(3ωt), moyenne 1/2", couleur: "serie-5", epaisseur: 1.8, fonction: (x) => Math.pow(Math.sin(3 * TAU * x), 2) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 0.5, "1/2", false);
            ligneH(c, repere, couleurs, 0, "0", true, [2, 3]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-efficace",
      titre: "Valeur efficace d'une somme",
      niveau: "prérequis",
      enonce:
        "<p>Quelle est la valeur efficace de $u(t) = 10 + 8\\sin(\\omega t)$, en volts ?</p>",
      valeur: Math.sqrt(132),
      unite: "V",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Valeur efficace $U$",
      etapes: [
        { texte: "$u^2 = 100 + 160\\sin(\\omega t) + 64\\sin^2(\\omega t)$." },
        { texte: "Moyennes : $100$, $0$ pour le terme croisé, $64/2 = 32$ pour le dernier. Donc $U^2 = 132\\ \\mathrm{V^2}$." },
        {
          texte: "$U = \\sqrt{132} = 11{,}49\\ \\mathrm{V}$, et non $10 + 8/\\sqrt{2} = 15{,}66\\ \\mathrm{V}$.",
          note: "Les carrés des valeurs efficaces s'ajoutent : c'est déjà l'identité de Parseval.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Le carré du signal et sa moyenne",
          xTitre: "t / T",
          yTitre: "u²",
          yUnite: "V²",
          xMin: 0,
          xMax: 1,
          yMin: 0,
          yMax: 340,
          series: [{ id: "u2", nom: "u²(t)", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => Math.pow(10 + 8 * Math.sin(TAU * x), 2) }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 132, "moyenne 132 V², U = 11,49 V", false);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm("#c-minitest", {
      id: "c-euler",
      titre: "Formule d'Euler",
      niveau: "prérequis",
      enonce: "<p>Quelle écriture de $\\cos\\theta$ découle de la formule d'Euler $e^{j\\theta} = \\cos\\theta + j\\sin\\theta$ ?</p>",
      options: [
        { texte: "$\\cos\\theta = \\dfrac{e^{j\\theta} + e^{-j\\theta}}{2}$", juste: true },
        { texte: "$\\cos\\theta = \\dfrac{e^{j\\theta} - e^{-j\\theta}}{2}$" },
        { texte: "$\\cos\\theta = \\dfrac{e^{j\\theta} - e^{-j\\theta}}{2j}$" },
        { texte: "$\\cos\\theta = e^{j\\theta} + e^{-j\\theta}$" },
      ],
      etapes: [
        { texte: "$e^{-j\\theta} = \\cos\\theta - j\\sin\\theta$, car le cosinus est pair et le sinus impair." },
        { texte: "En additionnant : $e^{j\\theta} + e^{-j\\theta} = 2\\cos\\theta$ ; en soustrayant : $e^{j\\theta} - e^{-j\\theta} = 2j\\sin\\theta$." },
        {
          texte: "Une sinusoïde réelle est donc la somme de deux exponentielles conjuguées, de fréquences $+f$ et $-f$.",
          note: "C'est l'origine du spectre bilatéral, où chaque amplitude se partage en deux raies de moitié.",
        },
      ],
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : phaseurs tournants en chaîne
   -------------------------------------------------------------------------- */

function construirePhaseurs(racine, api) {
  const conteneur = racine.querySelector("#d-phaseurs");
  if (!conteneur) return;

  const C = { x: 150, y: 160 };
  const K = 62;
  const R1 = (4 / Math.PI) * K;
  const X0 = 300;
  const X1 = 660;
  const versX = (deg) => X0 + ((X1 - X0) * deg) / 360;
  const versY = (v) => C.y - K * v;
  const etat = { theta: 50, termes: 3 };

  const svg = svgEl("svg", {
    viewBox: "0 0 680 330",
    role: "img",
    "aria-label": "Chaîne de phaseurs tournants des harmoniques impairs d'un carré, et somme reconstruite en fonction de l'angle",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-d-ph");
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1, opacity: 0.45 });
  fond.innerHTML =
    '<path d="M' + (C.x - 110) + " " + C.y + "H" + (X1 + 10) + '"/>' +
    '<path d="M' + C.x + " " + (C.y - 115) + "V" + (C.y + 115) + '"/>' +
    '<path d="M' + X0 + " " + (C.y - 115) + "V" + (C.y + 115) + '"/>' +
    '<path d="M' + X0 + " " + versY(1) + "h-6M" + X0 + " " + versY(-1) + 'h-6"/>';
  const carreExact = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.3, "stroke-dasharray": "6 4", opacity: 0.8 });
  carreExact.setAttribute(
    "d",
    "M" + versX(0) + " " + C.y + "V" + versY(1) + "H" + versX(180) + "V" + versY(-1) + "H" + versX(360) + "V" + C.y
  );
  const cercles = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1, opacity: 0.5 });
  const vecteurs = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round" });
  const courbe = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.8, "stroke-linejoin": "round" });
  const guide = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.2, "stroke-dasharray": "5 4", opacity: 0.8 });
  const repere = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.2, "stroke-dasharray": "3 3", opacity: 0.7 });
  const point = svgEl("circle", { r: 4.5, fill: "currentColor" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, carreExact, cercles, courbe, repere, guide, vecteurs, point, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-phaseurs-valeurs", [
    { id: "theta", libelle: "Angle ωt", unite: "°", decimales: 0 },
    { id: "rang", libelle: "Rang maximal", decimales: 0 },
    { id: "somme", libelle: "Somme, en unités de E", decimales: 3 },
    { id: "exact", libelle: "Carré exact", decimales: 0 },
    { id: "ecart", libelle: "Écart", decimales: 3 },
    { id: "max", libelle: "Crête de la somme", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const somme = (deg, termes) => {
    let s = 0;
    for (let k = 0; k < termes; k += 1) {
      const n = 2 * k + 1;
      s += (4 / (n * Math.PI)) * Math.sin(n * deg * DEG);
    }
    return s;
  };

  function tracerCourbe() {
    const pts = [];
    let max = -Infinity;
    for (let i = 0; i <= 720; i += 1) {
      const deg = i / 2;
      const v = somme(deg, etat.termes);
      if (v > max) max = v;
      pts.push(versX(deg).toFixed(1) + " " + versY(v).toFixed(1));
    }
    courbe.setAttribute("d", "M" + pts.join(" L"));
    let cer = "";
    let r = R1;
    for (let k = 0; k < etat.termes; k += 1) {
      const n = 2 * k + 1;
      r = ((4 / (n * Math.PI)) * K);
      cer += '<circle data-rang="' + n + '" r="' + r.toFixed(1) + '" cx="0" cy="0"/>';
    }
    cercles.innerHTML = cer;
    etat.max = max;
  }

  function dessiner() {
    const th = etat.theta;
    let p = { x: C.x, y: C.y };
    let vec = "";
    const cerclesListe = cercles.querySelectorAll("circle");
    for (let k = 0; k < etat.termes; k += 1) {
      const n = 2 * k + 1;
      const r = (4 / (n * Math.PI)) * K;
      if (cerclesListe[k]) {
        cerclesListe[k].setAttribute("cx", p.x.toFixed(1));
        cerclesListe[k].setAttribute("cy", p.y.toFixed(1));
      }
      const q = { x: p.x + r * Math.cos(n * th * DEG), y: p.y - r * Math.sin(n * th * DEG) };
      const epaisseur = k === 0 ? 2.6 : 1.8;
      vec +=
        '<path d="M' + p.x.toFixed(1) + " " + p.y.toFixed(1) + "L" + q.x.toFixed(1) + " " + q.y.toFixed(1) +
        '" stroke-width="' + epaisseur + '"' + (r > 9 ? ' marker-end="url(#fl-d-ph)"' : "") + "/>";
      p = q;
    }
    vecteurs.innerHTML = vec;
    const v = somme(th, etat.termes);
    const xr = versX(th);
    const yr = versY(v);
    guide.setAttribute("d", "M" + p.x.toFixed(1) + " " + p.y.toFixed(1) + "H" + xr.toFixed(1));
    repere.setAttribute("d", "M" + xr.toFixed(1) + " " + (C.y - 115) + "V" + (C.y + 115));
    point.setAttribute("cx", xr.toFixed(1));
    point.setAttribute("cy", yr.toFixed(1));
    const exact = th % 360 === 0 || th % 360 === 180 ? 0 : (th % 360) < 180 ? 1 : -1;
    libelles.innerHTML =
      texte(X0 - 26, versY(1) + 4, "+E") + texte(X0 - 26, versY(-1) + 4, "-E") +
      texte(X1 - 30, C.y + 18, "360°") + texte(versX(180) - 14, C.y + 18, "180°") +
      texte(C.x - 104, 24, "chaîne des phaseurs") + texte(X0 + 6, 24, "somme en fonction de ωt") +
      texte(C.x + 6, C.y + 112, "ωt = " + nombre(api, th, 0) + "°") +
      texte(X0 + 6, 300, "rangs 1 à " + (2 * etat.termes - 1)) +
      texte(X0 + 6, 318, "trait épais : somme ; tirets : carré exact");
    if (valeurs) {
      valeurs.maj({ theta: th, rang: 2 * etat.termes - 1, somme: v, exact, ecart: v - exact, max: etat.max });
    }
  }

  let synchro = false;
  let poignee = null;
  let lecteur = null;
  function appliquer(deg, source) {
    if (synchro) return;
    synchro = true;
    etat.theta = ((Number(deg) % 360) + 360) % 360;
    dessiner();
    if (source !== "poignee" && poignee) poignee.set(etat.theta, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(etat.theta);
    synchro = false;
  }

  tracerCourbe();

  poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: C,
    rayon: R1,
    valeur: etat.theta,
    pas: 1,
    libelle: "Angle ωt du fondamental",
    diffuserAuDepart: false,
    rappel(mesure) {
      appliquer(mesure.angle, "poignee");
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-phaseurs-curseur",
    [{ id: "termes", libelle: "Nombre d'harmoniques non nuls", min: 1, max: 10, pas: 1, valeur: etat.termes, format: (v) => v + " (rang " + (2 * v - 1) + ")" }],
    (lues) => {
      etat.termes = Math.round(lues.termes);
      tracerCourbe();
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#d-phaseurs-lecteur", {
    de: 0,
    a: 360,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Rotation de la chaîne, une période",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  /* La création du lecteur le place à son origine : on revient à l'angle de départ. */
  appliquer(50, null);
}

/* --------------------------------------------------------------------------
   E. Animation : extraction d'un coefficient par projection
   -------------------------------------------------------------------------- */

function construireProjection(racine, api) {
  const etat = { n: 1, signal: 1, t: 1 };
  const PAS = 2000;
  let cumul = [];

  function calculerCumul() {
    const sig = SIGNAUX_IMPAIRS[etat.signal];
    cumul = new Float64Array(PAS + 1);
    let s = 0;
    let precedent = sig.u(0) * Math.sin(0);
    for (let i = 1; i <= PAS; i += 1) {
      const x = i / PAS;
      const courant = sig.u(x - 1e-9) * Math.sin(TAU * etat.n * x);
      s += ((precedent + courant) / 2) * (1 / PAS);
      cumul[i] = 2 * s;
      precedent = sig.u(x + 1e-9) * Math.sin(TAU * etat.n * x);
    }
  }
  const moyenne = (t) => cumul[Math.max(0, Math.min(PAS, Math.round(t * PAS)))] || 0;
  const signal = (x) => SIGNAUX_IMPAIRS[etat.signal].u(x);
  const essai = (x) => Math.sin(TAU * etat.n * x);
  const produit = (x) => signal(x) * essai(x);

  const trace = api.sim.traceur("#e-projection-trace", {
    titre: "Projection du signal sur la sinusoïde d'essai",
    genre: "Animation",
    xTitre: "t / T",
    yTitre: "valeur",
    xMin: 0,
    xMax: 1,
    yMin: -1.3,
    yMax: 1.3,
    ratio: 0.45,
    echantillons: 800,
    series: [
      { id: "u", nom: "signal u(t)", couleur: "serie-6", epaisseur: 1.4, fonction: signal },
      { id: "s", nom: "sinusoïde d'essai sin(nωt)", couleur: "serie-4", epaisseur: 2, fonction: essai },
      { id: "p", nom: "produit u(t) sin(nωt)", couleur: "serie-1", epaisseur: 3, fonction: produit },
    ],
    surDessin({ c, repere, couleurs }) {
      const b = repere.boite;
      c.save();
      c.beginPath();
      c.moveTo(repere.versX(0), repere.versY(0));
      const fin = Math.max(0, Math.min(1, etat.t));
      for (let i = 0; i <= 400; i += 1) {
        const x = (fin * i) / 400;
        c.lineTo(repere.versX(x), repere.versY(produit(x)));
      }
      c.lineTo(repere.versX(fin), repere.versY(0));
      c.closePath();
      c.globalAlpha = 0.22;
      c.fillStyle = couleurs.texte;
      c.fill();
      c.restore();
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
      if (etat.t < 0.999) ligneV(c, repere, couleurs, etat.t, "t / T = " + nombre(api, etat.t, 2));
      c.save();
      c.fillStyle = couleurs.texte;
      c.font = POLICE;
      c.textAlign = "left";
      c.fillText("moyenne glissante (2/T) ∫ u sin(nωt) dt = " + nombre(api, moyenne(etat.t), 3), b.x + 6, b.y + b.h - 8);
      c.restore();
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-projection-valeurs", [
    { id: "signal", libelle: "Signal", format: (v) => SIGNAUX_IMPAIRS[v].nom },
    { id: "n", libelle: "Rang d'essai n", decimales: 0 },
    { id: "t", libelle: "Instant t / T", decimales: 3 },
    { id: "moy", libelle: "Moyenne glissante", decimales: 4 },
    { id: "bn", libelle: "Coefficient bn théorique", decimales: 4 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    if (trace) trace.rafraichir();
    if (valeurs) valeurs.maj({ signal: etat.signal, n: etat.n, t: etat.t, moy: moyenne(etat.t), bn: SIGNAUX_IMPAIRS[etat.signal].bn(etat.n) });
  }

  const curseurs = api.sim.curseurs(
    "#e-projection-curseurs",
    [
      { id: "n", libelle: "Rang d'essai n", min: 1, max: 8, pas: 1, valeur: 1 },
      { id: "signal", libelle: "Signal", min: 1, max: 3, pas: 1, valeur: 1, format: (v) => SIGNAUX_IMPAIRS[Math.round(v)].nom },
    ],
    (lues) => {
      etat.n = Math.round(lues.n);
      etat.signal = Math.round(lues.signal);
      calculerCumul();
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  if (!cumul.length) calculerCumul();

  const lecteur = api.sim.lecteur("#e-projection-lecteur", {
    de: 0,
    a: 1,
    duree: 8,
    boucle: false,
    auto: false,
    libelle: "Avancer l'intégration sur une période",
    rappel(valeur) {
      etat.t = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    /* La période complète reste affichée tant que l'apprenant n'a pas lancé la lecture. */
    lecteur.suivre(1);
  }
  etat.t = 1;
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : reconstruire un signal avec quelques harmoniques
   -------------------------------------------------------------------------- */

function construireSynthe(racine, api) {
  const etat = { signal: 1, N: 9, alpha: 0.25, retard: 0, phasesNulles: 0 };
  const memo = { coefs: [], a0: 0 };

  function preparer() {
    const sig = SIGNAUX[etat.signal];
    memo.a0 = sig.a0(etat.alpha);
    memo.coefs = [];
    for (let n = 1; n <= etat.N; n += 1) {
      const { a, b } = sig.coef(n, etat.alpha);
      memo.coefs.push({ n, a, b, amp: Math.hypot(a, b) });
    }
  }

  const exact = (x) => SIGNAUX[etat.signal].exact(x - etat.retard, etat.alpha);
  const partielle = (x) => {
    const xr = x - etat.retard;
    let s = memo.a0;
    for (const { n, a, b, amp } of memo.coefs) {
      if (etat.phasesNulles) s += amp * Math.cos(TAU * n * xr);
      else s += a * Math.cos(TAU * n * xr) + b * Math.sin(TAU * n * xr);
    }
    return s;
  };

  const trace = api.sim.traceur("#e-synthe-trace", {
    titre: "Signal exact et somme partielle",
    genre: "Simulation",
    xTitre: "t / T",
    yTitre: "u / E",
    xMin: 0,
    xMax: 2,
    yMin: -1.5,
    yMax: 1.5,
    ratio: 0.42,
    echantillons: 1400,
    series: [
      { id: "exact", nom: "signal exact", couleur: "serie-6", epaisseur: 1.4, fonction: exact },
      { id: "somme", nom: "somme partielle jusqu'au rang N", couleur: "serie-1", epaisseur: 2.8, fonction: partielle },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
    },
  });
  if (trace) ressources.push(trace);

  const spectre = api.sim.spectre("#e-synthe-spectre", {
    titre: "Spectre d'amplitude des rangs retenus",
    genre: "Simulation",
    xTitre: "rang n",
    yTitre: "Ûn / E",
    ratio: 0.34,
    barres: [],
  });
  if (spectre) ressources.push(spectre);

  const valeurs = api.sim.valeurs("#e-synthe-valeurs", [
    { id: "efficace", libelle: "Valeur efficace exacte U / E", decimales: 4 },
    { id: "efficaceN", libelle: "Valeur efficace reconstituée", decimales: 4 },
    { id: "part", libelle: "Part de U² reconstituée", unite: "%", decimales: 2 },
    { id: "erreur", libelle: "Erreur efficace relative", unite: "%", decimales: 2 },
    { id: "crete", libelle: "Crête de la somme partielle", decimales: 3 },
    { id: "depassement", libelle: "Dépassement, en % du saut", format: (v) => (Number.isFinite(v) ? nombre(api, v, 1) + " %" : "sans objet") },
    { id: "thd", libelle: "Distorsion sur les rangs retenus", unite: "%", decimales: 1 },
    { id: "a0", libelle: "Valeur moyenne a0 / E", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function mettreAJour() {
    preparer();
    const sig = SIGNAUX[etat.signal];
    let crete = -Infinity;
    let creux = Infinity;
    for (let i = 0; i <= 2400; i += 1) {
      const v = partielle((2 * i) / 2400);
      if (v > crete) crete = v;
      if (v < creux) creux = v;
    }
    const borne = Math.max(1.5, Math.abs(crete) * 1.12, Math.abs(creux) * 1.12);
    if (trace) trace.definirPlage({ yMin: -borne, yMax: borne });
    const U = sig.efficace(etat.alpha);
    let somme2 = memo.a0 * memo.a0;
    let h2 = 0;
    for (const { n, amp } of memo.coefs) {
      somme2 += (amp * amp) / 2;
      if (n >= 2) h2 += (amp * amp) / 2;
    }
    const u1 = memo.coefs.length ? memo.coefs[0].amp / Math.SQRT2 : 0;
    const part = Math.min(1, somme2 / (U * U));
    if (spectre) {
      spectre.definirBarres(
        memo.coefs.filter((c) => c.n <= 25).map((c) => ({ etiquette: String(c.n), valeur: c.amp }))
      );
    }
    if (valeurs) {
      valeurs.maj({
        efficace: U,
        efficaceN: Math.sqrt(somme2),
        part: 100 * part,
        erreur: 100 * Math.sqrt(Math.max(0, 1 - part)),
        crete,
        depassement: sig.saut > 0 && !etat.phasesNulles ? (100 * (crete - sig.max)) / sig.saut : NaN,
        thd: u1 > 1e-9 ? (100 * Math.sqrt(h2)) / u1 : NaN,
        a0: memo.a0,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-synthe-curseurs",
    [
      { id: "signal", libelle: "Signal", min: 1, max: 4, pas: 1, valeur: etat.signal, format: (v) => SIGNAUX[Math.round(v)].nom },
      { id: "N", libelle: "Rang maximal N", min: 1, max: 49, pas: 1, valeur: etat.N },
      { id: "alpha", libelle: "Rapport cyclique du créneau", min: 0.05, max: 0.95, pas: 0.05, valeur: etat.alpha, chiffres: 2 },
      { id: "retard", libelle: "Retard de l'origine, en fraction de T", min: 0, max: 1, pas: 0.01, valeur: etat.retard, chiffres: 2 },
      { id: "phases", libelle: "Phases", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (Math.round(v) ? "mises à zéro" : "exactes") },
    ],
    (lues) => {
      etat.signal = Math.round(lues.signal);
      etat.N = Math.round(lues.N);
      etat.alpha = lues.alpha;
      etat.retard = lues.retard;
      etat.phasesNulles = Math.round(lues.phases);
      mettreAJour();
    }
  );
  if (curseurs) ressources.push(curseurs);
  if (!memo.coefs.length) mettreAJour();
}

/* --------------------------------------------------------------------------
   H. Animation : le courant de la pompe reconstruit rang par rang
   -------------------------------------------------------------------------- */

function construireReconstruction(racine, api) {
  const LISTE = RANGS_POMPE.filter((n) => n <= 37);
  const etat = { termes: 3 };
  const rangs = () => LISTE.slice(0, etat.termes);
  const somme = (deg) => sommePompe(deg * DEG, rangs());

  const trace = api.sim.traceur("#h-reconstruction-trace", {
    titre: "Courant de ligne de la pompe, créneaux de 120 degrés",
    genre: "Animation",
    xTitre: "ωt",
    xUnite: "°",
    yTitre: "i1",
    yUnite: "A",
    xMin: 0,
    xMax: 360,
    yMin: -80,
    yMax: 80,
    ratio: 0.45,
    echantillons: 1440,
    series: [
      { id: "ideal", nom: "créneau idéal", couleur: "serie-6", epaisseur: 1.4, fonction: (deg) => creneauPompe(deg * DEG) },
      { id: "somme", nom: "somme partielle", couleur: "serie-1", epaisseur: 3, fonction: somme },
      { id: "ecart", nom: "écart, somme moins créneau", couleur: "serie-5", epaisseur: 1.8, fonction: (deg) => somme(deg) - creneauPompe(deg * DEG) },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, I_CRENEAU, "I = 61,24 A", false);
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#h-reconstruction-valeurs", [
    { id: "termes", libelle: "Nombre de termes", decimales: 0 },
    { id: "rang", libelle: "Dernier rang ajouté", decimales: 0 },
    { id: "signe", libelle: "Signe de son coefficient", format: (v) => (v > 0 ? "positif" : "négatif") },
    { id: "efficace", libelle: "Valeur efficace reconstituée", unite: "A", decimales: 2 },
    { id: "part", libelle: "Part de Ieff²", unite: "%", decimales: 2 },
    { id: "erreur", libelle: "Erreur efficace", unite: "A", decimales: 2 },
    { id: "milieu", libelle: "Somme à 90°", unite: "A", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    if (trace) trace.rafraichir();
    const r = rangs();
    const carre = r.reduce((s, n) => s + (bPompe(n) * bPompe(n)) / 2, 0);
    const dernier = r[r.length - 1];
    if (valeurs) {
      valeurs.maj({
        termes: r.length,
        rang: dernier,
        signe: bPompe(dernier),
        efficace: Math.sqrt(carre),
        part: (100 * carre) / 2500,
        erreur: Math.sqrt(Math.max(0, 2500 - carre)),
        milieu: somme(90),
      });
    }
  }

  const lecteur = api.sim.lecteur("#h-reconstruction-lecteur", {
    de: 1,
    a: LISTE.length,
    duree: 12,
    boucle: false,
    auto: false,
    libelle: "Ajouter les rangs un à un",
    rappel(valeur) {
      const termes = Math.max(1, Math.min(LISTE.length, Math.floor(valeur + 1e-6)));
      if (termes !== etat.termes) {
        etat.termes = termes;
        dessiner();
      }
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    /* Départ sur les rangs 1, 5 et 7 de l'exemple, sans lancer la lecture. */
    lecteur.suivre(3);
  }
  etat.termes = 3;
  dessiner();
}

/* --------------------------------------------------------------------------
   I. Simulation : transformée de Fourier discrète de l'analyseur
   -------------------------------------------------------------------------- */

/** Rangs 1 à 40 lus par une TFD sur le courant modélisé de la pompe. */
function analyserPompe({ f, periodes, parPeriode, hann, synchro }) {
  const fe = (synchro ? f : 50) * parPeriode;
  const N = periodes * parPeriode;
  const phase0 = 0.3;
  const x = new Float64Array(N);
  const fenetre = new Float64Array(N);
  let gain = 0;
  for (let m = 0; m < N; m += 1) {
    const theta = (TAU * f * m) / fe + phase0;
    let s = 0;
    for (const n of RANGS_POMPE) s += bPompe(n) * Math.sin(n * theta);
    x[m] = s;
    fenetre[m] = hann ? 0.5 - 0.5 * Math.cos((TAU * m) / N) : 1;
    gain += fenetre[m];
  }
  gain /= N;
  const lus = [0];
  for (let h = 1; h <= 40; h += 1) {
    const k = h * periodes;
    let re = 0;
    let im = 0;
    for (let m = 0; m < N; m += 1) {
      const a = (TAU * k * m) / N;
      const v = x[m] * fenetre[m];
      re += v * Math.cos(a);
      im -= v * Math.sin(a);
    }
    lus.push((Math.hypot(re, im) * 2) / N / gain / Math.SQRT2);
  }
  return lus;
}

function construireAnalyseur(racine, api) {
  const exact = (h) => (h % 2 === 1 && h % 3 !== 0 ? Math.abs(bPompe(h)) / Math.SQRT2 : 0);

  const spectre = api.sim.spectre("#i-tfd-spectre", {
    titre: "Harmoniques lus par l'analyseur",
    genre: "Simulation",
    xTitre: "rang",
    yTitre: "valeur efficace",
    unite: "A",
    yMax: 12,
    ratio: 0.42,
    barres: [],
  });
  if (spectre) ressources.push(spectre);

  const ecart = (lu, vrai) => (100 * (lu - vrai)) / vrai;
  const valeurs = api.sim.valeurs("#i-tfd-valeurs", [
    { id: "i1", libelle: "Fondamental lu (47,75 A)", unite: "A", decimales: 2 },
    { id: "i5", libelle: "Rang 5 lu (9,55 A)", unite: "A", decimales: 2 },
    { id: "e5", libelle: "Écart sur le rang 5", unite: "%", decimales: 1 },
    { id: "i13", libelle: "Rang 13 lu (3,67 A)", unite: "A", decimales: 2 },
    { id: "e13", libelle: "Écart sur le rang 13", unite: "%", decimales: 1 },
    { id: "i2", libelle: "Rang 2, fictif", unite: "A", decimales: 2 },
    { id: "thd", libelle: "Distorsion lue au rang 40 (29,7 %)", unite: "%", decimales: 1 },
    { id: "df", libelle: "Résolution", unite: "Hz", decimales: 2 },
    { id: "fe", libelle: "Fréquence d'échantillonnage", unite: "kHz", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const curseurs = api.sim.curseurs(
    "#i-tfd-curseurs",
    [
      { id: "f", libelle: "Fréquence réelle du réseau", min: 49.5, max: 50.5, pas: 0.05, valeur: 49.8, unite: "Hz", chiffres: 2 },
      { id: "periodes", libelle: "Périodes nominales dans la fenêtre", min: 1, max: 12, pas: 1, valeur: 10 },
      { id: "parPeriode", libelle: "Échantillons par période", min: 32, max: 256, pas: 32, valeur: 256 },
      { id: "hann", libelle: "Fenêtre de pondération", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (Math.round(v) ? "Hann" : "rectangulaire") },
      { id: "synchro", libelle: "Synchronisation sur la fréquence mesurée", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (Math.round(v) ? "oui" : "non") },
    ],
    (lues) => {
      const reglage = {
        f: lues.f,
        periodes: Math.round(lues.periodes),
        parPeriode: Math.round(lues.parPeriode),
        hann: Math.round(lues.hann) === 1,
        synchro: Math.round(lues.synchro) === 1,
      };
      const lus = analyserPompe(reglage);
      if (spectre) {
        const barres = [];
        for (let h = 2; h <= 25; h += 1) barres.push({ etiquette: String(h), valeur: lus[h] });
        spectre.definirBarres(barres);
      }
      let h2 = 0;
      for (let h = 2; h <= 40; h += 1) h2 += lus[h] * lus[h];
      const fBase = reglage.synchro ? reglage.f : 50;
      if (valeurs) {
        valeurs.maj({
          i1: lus[1],
          i5: lus[5],
          e5: ecart(lus[5], exact(5)),
          i13: lus[13],
          e13: ecart(lus[13], exact(13)),
          i2: lus[2],
          thd: (100 * Math.sqrt(h2)) / lus[1],
          df: fBase / reglage.periodes,
          fe: (fBase * reglage.parPeriode) / 1000,
        });
      }
    }
  );
  if (curseurs) ressources.push(curseurs);
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/** Trois petits spectres, a : tous les rangs en 1/n ; b : impairs en 1/n ; c : impairs en 1/n². */
function dessinTroisSpectres() {
  const panneau = (ox, titre, hauteur) => {
    let d = '<g stroke="currentColor" stroke-width="1.6" fill="none"><path d="M' + ox + ' 170H' + (ox + 160) + 'M' + ox + ' 170V40"/></g>';
    d += '<g fill="currentColor" stroke="none">';
    for (let n = 1; n <= 7; n += 1) {
      const h = hauteur(n);
      if (h > 0.5) d += '<rect x="' + (ox + n * 20 - 5) + '" y="' + (170 - h).toFixed(1) + '" width="10" height="' + h.toFixed(1) + '" rx="1.5"/>';
    }
    d += "</g>";
    d += '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';
    d += texte(ox + 4, 26, titre, ' font-weight="600"');
    for (let n = 1; n <= 7; n += 1) d += texte(ox + n * 20 - 4, 188, String(n));
    d += "</g>";
    return d;
  };
  return (
    panneau(20, "a", (n) => 120 / n) +
    panneau(200, "b", (n) => (n % 2 ? 120 / n : 0)) +
    panneau(380, "c", (n) => (n % 2 ? 120 / (n * n) : 0))
  );
}

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-carre-rang3",
      titre: "Rang 3 d'un carré",
      niveau: "fondamental",
      enonce:
        "<p>Une tension carrée alterne entre $+12\\ \\mathrm{V}$ et $-12\\ \\mathrm{V}$ avec un rapport cyclique de $0{,}5$. Quelle est l'amplitude " +
        "crête de son harmonique de rang 3 ? Donnez aussi mentalement sa valeur efficace.</p>",
      valeur: (4 * 12) / (3 * Math.PI),
      unite: "V",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Amplitude crête $\\hat{U}_3$",
      etapes: [
        { texte: "Le carré symétrique a une symétrie de demi-onde : seuls les rangs impairs existent, d'amplitude $\\hat{U}_n = 4E/(n\\pi)$." },
        { texte: "Avec $E = 12\\ \\mathrm{V}$ et $n = 3$ : $\\hat{U}_3 = 48/(3\\pi) = 5{,}093\\ \\mathrm{V}$." },
        {
          texte: "Valeur efficace : $5{,}093/\\sqrt{2} = 3{,}601\\ \\mathrm{V}$.",
          note: "Contrôle : le rang 3 vaut le tiers du fondamental, $15{,}28\\ \\mathrm{V}$ crête.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const barres = [];
        for (let n = 1; n <= 9; n += 1) barres.push({ etiquette: String(n), valeur: n % 2 ? 48 / (n * Math.PI) : 0 });
        spectreCorrection(moteur, conteneur, { titre: "Spectre du carré de 12 V", xTitre: "rang n", yTitre: "amplitude crête", unite: "V" }, barres);
      },
    })
  );

  ressources.push(
    api.exercice.schema(cible, {
      id: "k-schema-triangle",
      titre: "Reconnaître le spectre d'un triangle",
      niveau: "fondamental",
      consigne: "Cliquez sur le spectre d'un signal triangulaire symétrique.",
      enonce:
        "<p>Les trois spectres d'amplitude ci-dessous, tracés à la même échelle et normalisés par le fondamental, appartiennent à une dent de scie, " +
        "à un carré et à un triangle, dans le désordre.</p>",
      viewBox: "0 0 560 200",
      description: "Trois spectres : a, tous les rangs décroissant en 1 sur n ; b, rangs impairs en 1 sur n ; c, rangs impairs décroissant en 1 sur n au carré",
      dessin: dessinTroisSpectres(),
      zones: [
        { x: 10, y: 15, largeur: 175, hauteur: 180, etiquette: "a" },
        { x: 190, y: 15, largeur: 175, hauteur: 180, etiquette: "b" },
        { x: 370, y: 15, largeur: 175, hauteur: 180, etiquette: "c", juste: true },
      ],
      etapes: [
        { texte: "Le triangle a une symétrie de demi-onde : pas de rang pair. Cela écarte a, qui contient tous les rangs : c'est la dent de scie." },
        { texte: "Le triangle est continu, seule sa pente saute : ses coefficients décroissent en $1/n^2$. Le rang 3 vaut $1/9$ du fondamental." },
        {
          texte: "En b, le rang 3 vaut $1/3$ du fondamental : décroissance en $1/n$, c'est le carré, discontinu. Le triangle est donc c.",
          note: "Réflexe : rangs présents pour la symétrie, pente de décroissance pour la régularité.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Triangle et ses rangs 1 et 3",
          xTitre: "t / T",
          yTitre: "u / E",
          xMin: 0,
          xMax: 1,
          yMin: -1.2,
          yMax: 1.2,
          series: [
            { id: "t", nom: "triangle exact", couleur: "serie-6", epaisseur: 1.4, fonction: SIGNAUX[2].exact },
            { id: "s", nom: "rangs 1 et 3, déjà très proches", couleur: "serie-1", epaisseur: 2.8, fonction: (x) => (8 / (Math.PI * Math.PI)) * (Math.cos(TAU * x) + Math.cos(3 * TAU * x) / 9) },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-creneau",
      titre: "Fondamental d'un créneau de commande",
      niveau: "intermédiaire",
      enonce:
        "<p>Une sortie d'automate pilote un relais statique par un créneau de $0$ à $24\\ \\mathrm{V}$, de fréquence $1\\ \\mathrm{kHz}$ et de rapport " +
        "cyclique $\\alpha = 0{,}25$. Quelle est l'amplitude crête de son fondamental ? Déterminez aussi sa valeur moyenne, le premier rang nul et sa " +
        "valeur efficace.</p>",
      valeur: ((2 * 24) / Math.PI) * Math.sin(Math.PI / 4),
      unite: "V",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Amplitude crête $\\hat{U}_1$",
      etapes: [
        { texte: "Méthode : centrer le créneau sur l'origine des temps le rend pair ; seuls $a_0$ et les $a_n$ subsistent." },
        { texte: "Valeur moyenne : $a_0 = \\alpha E = 0{,}25 \\times 24 = 6\\ \\mathrm{V}$." },
        { texte: "$a_n = \\dfrac{2E}{n\\pi}\\sin(n\\pi\\alpha)$ : $a_1 = \\dfrac{48}{\\pi}\\sin 45^\\circ = 10{,}80\\ \\mathrm{V}$ crête." },
        { texte: "$a_2 = \\dfrac{48}{2\\pi}\\sin 90^\\circ = 7{,}64\\ \\mathrm{V}$ ; $a_4 = \\dfrac{48}{4\\pi}\\sin 180^\\circ = 0$ : le premier rang nul est le rang 4, soit $1/\\alpha$." },
        {
          texte: "Valeur efficace dans le temps : $E\\sqrt{\\alpha} = 24 \\times 0{,}5 = 12\\ \\mathrm{V}$.",
          note: "Contrôle par Parseval : $6^2 + 10{,}80^2/2 + 7{,}64^2/2 + 3{,}60^2/2 = 130{,}0\\ \\mathrm{V^2}$ sur trois rangs, en route vers $144\\ \\mathrm{V^2}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const barres = [{ etiquette: "a0", valeur: 6 }];
        for (let n = 1; n <= 9; n += 1) barres.push({ etiquette: String(n), valeur: Math.abs(((2 * 24) / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25)) });
        spectreCorrection(moteur, conteneur, { titre: "Spectre du créneau de rapport cyclique 0,25", xTitre: "rang n", yTitre: "amplitude crête", unite: "V" }, barres);
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-parseval",
      titre: "Erreur d'une reconstruction à trois rangs",
      niveau: "intermédiaire",
      enonce:
        "<p>Un carré de $\\pm 10\\ \\mathrm{V}$ est reconstruit avec ses rangs 1, 3 et 5. Quelle est l'erreur efficace de cette reconstruction, en " +
        "volts ? Quelle part du carré de la valeur efficace est reconstituée ?</p>",
      valeur: 10 * Math.sqrt(1 - (8 / (Math.PI * Math.PI)) * (1 + 1 / 9 + 1 / 25)),
      unite: "V",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Erreur efficace $\\varepsilon_5$",
      etapes: [
        { texte: "Valeur efficace du carré : $U = 10\\ \\mathrm{V}$, donc $U^2 = 100\\ \\mathrm{V^2}$." },
        { texte: "Rangs retenus : $U_n^2 = \\hat{U}_n^2/2 = \\dfrac{8E^2}{\\pi^2 n^2}$, soit $81{,}06$, $9{,}01$ et $3{,}24\\ \\mathrm{V^2}$ pour $n = 1, 3, 5$." },
        { texte: "Somme : $93{,}31\\ \\mathrm{V^2}$, soit $93{,}3\\ \\%$ de $U^2$." },
        {
          texte: "Erreur efficace : $\\varepsilon_5 = \\sqrt{100 - 93{,}31} = 2{,}587\\ \\mathrm{V}$, soit $25{,}9\\ \\%$ de $U$.",
          note: "Une part de $93\\ \\%$ en puissance laisse un écart efficace de $26\\ \\%$ : la racine carrée amplifie les petits restes.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const s5 = (x) => (40 / Math.PI) * (Math.sin(TAU * x) + Math.sin(3 * TAU * x) / 3 + Math.sin(5 * TAU * x) / 5);
        traceCorrection(moteur, conteneur, {
          titre: "Carré de 10 V, reconstruction et erreur",
          xTitre: "t / T",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 1,
          yMin: -13,
          yMax: 13,
          series: [
            { id: "c", nom: "carré exact", couleur: "serie-6", epaisseur: 1.4, fonction: (x) => 10 * SIGNAUX[1].exact(x) },
            { id: "s", nom: "rangs 1, 3 et 5", couleur: "serie-1", epaisseur: 2.8, fonction: s5 },
            { id: "e", nom: "erreur, efficace 2,59 V", couleur: "serie-5", epaisseur: 1.8, fonction: (x) => s5(x) - 10 * SIGNAUX[1].exact(x) },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-avance",
      titre: "Nombre de rangs utiles selon la régularité",
      niveau: "avancé",
      enonce:
        "<p>On veut reconstruire un signal triangulaire symétrique avec une erreur efficace inférieure à $1\\ \\%$ de sa valeur efficace. Quel est le " +
        "rang maximal $N$ le plus petit qui convient ? Comparez avec le carré, et concluez sur le lien entre régularité et nombre de rangs.</p>",
      valeur: 11,
      unite: "",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Rang maximal $N$",
      etapes: [
        { texte: "Triangle : $U^2 = E^2/3$ et $U_n^2 = \\dfrac{32E^2}{\\pi^4 n^4}$ ; la part du fondamental vaut $96/\\pi^4 = 98{,}55\\ \\%$." },
        { texte: "Critère : $\\varepsilon_N/U \\lt 0{,}01$, soit une part reconstituée supérieure à $1 - 10^{-4} = 99{,}99\\ \\%$." },
        { texte: "Parts cumulées : $99{,}770\\ \\%$ au rang 3, $99{,}928\\ \\%$ au rang 5, $99{,}969\\ \\%$ au rang 7, $99{,}984\\ \\%$ au rang 9, $99{,}9906\\ \\%$ au rang 11." },
        { texte: "Erreurs relatives correspondantes : $4{,}79$, $2{,}69$, $1{,}76$, $1{,}27$ puis $0{,}968\\ \\%$ : il faut $N = 11$, six termes." },
        {
          texte: "Carré : la part restante vaut environ $\\dfrac{8}{\\pi^2}\\cdot\\dfrac{1}{2N}$ ; pour $10^{-4}$, il faut $N \\approx 4053$, plus de 2000 termes.",
          note: "Une discontinuité donne une décroissance en $1/n$ et une convergence très lente ; une simple rupture de pente, en $1/n^2$, suffit à rendre quelques rangs suffisants.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const tri = [];
        const car = [];
        let st = 0;
        let sc = 0;
        for (let n = 1; n <= 25; n += 2) {
          st += 1 / Math.pow(n, 4);
          sc += 1 / (n * n);
          tri.push([n, 100 * Math.sqrt(Math.max(0, 1 - (96 / Math.pow(Math.PI, 4)) * st))]);
          car.push([n, 100 * Math.sqrt(Math.max(0, 1 - (8 / (Math.PI * Math.PI)) * sc))]);
        }
        const t = traceCorrection(moteur, conteneur, {
          titre: "Erreur efficace relative selon le rang maximal",
          xTitre: "rang maximal N",
          yTitre: "erreur",
          yUnite: "%",
          xMin: 1,
          xMax: 25,
          yMin: 0,
          yMax: 45,
          series: [
            { id: "car", nom: "carré, décroissance en 1/n", couleur: "serie-5", epaisseur: 2.2, points: car },
            { id: "tri", nom: "triangle, décroissance en 1/n²", couleur: "serie-1", epaisseur: 2.8, points: tri },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 1, "1 %", false);
            ligneV(c, repere, couleurs, 11, "N = 11");
          },
        });
        return t;
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Diagnostic d'un spectre étrange",
      niveau: "diagnostic",
      enonce:
        "<p>Un analyseur portable, branché sur le départ de la pompe alimentée par un pont de diodes, affiche un rang 2 de $0{,}3\\ \\mathrm{A}$, un rang 13 " +
        "de $2{,}3\\ \\mathrm{A}$ au lieu des $3{,}7\\ \\mathrm{A}$ attendus, et des valeurs qui fluctuent d'une mesure à l'autre. Le site est alimenté par le " +
        "réseau, dont la fréquence affichée vaut $49{,}8\\ \\mathrm{Hz}$. Quelles hypothèses sont plausibles ?</p>",
      multiple: true,
      options: [
        { texte: "La fenêtre de l'analyseur n'est pas synchronisée sur la fréquence réelle : fuite spectrale.", juste: true },
        { texte: "Une dissymétrie réelle entre alternances, par exemple une diode défaillante ; elle se distinguerait par un rang 2 stable.", juste: true },
        { texte: "Un pont de diodes sain produit naturellement des rangs pairs." },
        { texte: "La fréquence de $49{,}8\\ \\mathrm{Hz}$ prouve un défaut du variateur." },
      ],
      etapes: [
        { texte: "Un pont de diodes sain absorbe un courant à symétrie de demi-onde : aucun rang pair. Un rang 2 est donc soit réel et anormal, soit un artefact de mesure." },
        { texte: "À $49{,}8\\ \\mathrm{Hz}$, une fenêtre de $200\\ \\mathrm{ms}$ calée sur $50\\ \\mathrm{Hz}$ contient $9{,}96$ périodes : le rang 13, à $647\\ \\mathrm{Hz}$, tombe à mi-chemin entre deux cases de $5\\ \\mathrm{Hz}$ et perd $37\\ \\%$ ; des raies fictives apparaissent." },
        { texte: "La fluctuation d'une mesure à l'autre, qui suit la dérive de la fréquence, signe la fuite ; une dissymétrie réelle donnerait un rang 2 stable et des rangs impairs corrects." },
        {
          texte: "La fréquence de $49{,}8\\ \\mathrm{Hz}$ est celle du réseau et reste dans ses variations habituelles ; elle ne dit rien du variateur.",
          note: "Action : activer la synchronisation de l'analyseur, répéter la mesure, et seulement ensuite conclure sur une éventuelle dissymétrie.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const lus = analyserPompe({ f: 49.8, periodes: 10, parPeriode: 256, hann: false, synchro: false });
        const barres = [];
        for (let h = 2; h <= 15; h += 1) barres.push({ etiquette: String(h), valeur: lus[h] });
        spectreCorrection(moteur, conteneur, { titre: "Lecture non synchronisée à 49,8 Hz", xTitre: "rang", yTitre: "valeur efficace", unite: "A", yMax: 12 }, barres);
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-conceptuel",
      titre: "Fronts raides et largeur du spectre",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi un signal à fronts très raides possède un spectre qui s'étend loin vers les hautes fréquences, et quelle " +
        "conséquence cela a pour la compatibilité électromagnétique d'un variateur de vitesse.</p>",
      motsCles: [["front", "discontinu", "saut", "raide", "brusque"], ["1/n", "lent", "decroi", "rang eleve", "haute frequence", "harmonique"], ["perturb", "cem", "rayonn", "couplage", "emission", "parasite"]],
      minimum: 2,
      exemple: "Deux ou trois phrases : reliez la discontinuité à la décroissance des coefficients, puis aux perturbations.",
      etapes: [
        { texte: "Un saut brutal ne peut être reproduit que par des sinusoïdes rapides : les coefficients d'un signal discontinu décroissent seulement en $1/n$, ceux d'un signal continu à pente bornée en $1/n^2$." },
        { texte: "Un front de durée $t_r$ adoucit la décroissance au-delà d'une fréquence de l'ordre de $1/(\\pi t_r)$ : plus le front est court, plus le spectre est large." },
        {
          texte: "Les transistors d'un variateur commutent en quelques dizaines à centaines de nanosecondes : leurs tensions contiennent des composantes jusqu'à plusieurs mégahertz, qui se couplent aux câbles et rayonnent.",
          note: "Remèdes : filtres, blindage, câblage soigné, ou fronts ralentis au prix de pertes de commutation, compromis du cours Compatibilité électromagnétique.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const pente = (n, r) => {
          if (n % 2 === 0) return NaN;
          const x = n * Math.PI * r;
          const enveloppe = r > 0 ? Math.abs(Math.sin(x) / x) : 1;
          return 20 * Math.log10(Math.max(1e-6, enveloppe / n));
        };
        const carre = [];
        const trapeze = [];
        for (let n = 1; n <= 99; n += 2) {
          carre.push([n, pente(n, 0)]);
          trapeze.push([n, pente(n, 0.02)]);
        }
        traceCorrection(moteur, conteneur, {
          titre: "Amplitude des rangs, en décibels sous le fondamental",
          xTitre: "rang n",
          yTitre: "niveau",
          yUnite: "dB",
          xMin: 1,
          xMax: 99,
          yMin: -80,
          yMax: 2,
          series: [
            { id: "c", nom: "carré à fronts verticaux, en 1/n", couleur: "serie-5", epaisseur: 2.2, points: carre },
            { id: "t", nom: "fronts de 2 % de la période, en 1/n² au-delà", couleur: "serie-1", epaisseur: 2.8, points: trapeze },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

function dessinSpectreQuiz() {
  const rangs = [
    [1, 130],
    [3, 42],
    [4, 26],
    [5, 30],
    [7, 18],
  ];
  let d = '<g stroke="currentColor" stroke-width="1.6" fill="none"><path d="M40 180H500M40 180V30"/></g>';
  d += '<g fill="currentColor" stroke="none">';
  for (const [n, h] of rangs) d += '<rect x="' + (40 + n * 55 - 9) + '" y="' + (180 - h) + '" width="18" height="' + h + '" rx="2"/>';
  d += "</g>";
  d += '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';
  for (let n = 1; n <= 8; n += 1) d += texte(40 + n * 55 - 4, 198, String(n));
  d += texte(48, 28, "In") + texte(440, 214, "rang n");
  d += "</g>";
  return d;
}

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Un signal périodique a une période de $2\\ \\mathrm{ms}$. Quel est l'écart entre deux raies voisines de son spectre ?</p>",
        options: ["$500\\ \\mathrm{Hz}$", "$2\\ \\mathrm{kHz}$", "$250\\ \\mathrm{Hz}$", "$1\\ \\mathrm{kHz}$"],
        bonnes: [0],
        explication: "Les raies sont aux multiples de $f = 1/T = 500\\ \\mathrm{Hz}$.",
        resume: "Espacement des raies",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Deux signaux qui ont exactement le même spectre d'amplitude ont nécessairement la même forme.</p>",
        reponse: false,
        explication: "Les phases portent la forme : un carré dont on annule toutes les phases garde ses amplitudes et sa valeur efficace, mais devient un signal pointu.",
        resume: "Rôle des phases",
      },
      {
        type: "calcul",
        enonce: "<p>Une tension contient une composante continue de $10\\ \\mathrm{V}$, un fondamental de $8\\ \\mathrm{V}$ crête et un rang 3 de $6\\ \\mathrm{V}$ crête. Quelle est sa valeur efficace, en volts ?</p>",
        valeur: Math.sqrt(150),
        unite: "V",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$U^2 = 10^2 + 8^2/2 + 6^2/2 = 150\\ \\mathrm{V^2}$, d'où $U = 12{,}25\\ \\mathrm{V}$.",
        resume: "Parseval",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi le courant absorbé par un pont de diodes sain ne contient-il aucun harmonique de rang pair ?</p>",
        motsCles: [["symetri", "demi-onde", "alternance", "miroir"], ["pair", "oppose", "signe", "t/2", "demi-periode"]],
        minimum: 1,
        explication: "Les deux alternances sont traitées de la même façon : $i(t + T/2) = -i(t)$. Un rang pair reprend la même valeur après une demi-période et ne peut donc pas contribuer à un signal qui change de signe.",
        resume: "Symétrie de demi-onde",
      },
      {
        type: "qcm",
        enonce: "<p>Comment décroissent les coefficients de Fourier d'un signal triangulaire symétrique ?</p>",
        options: ["En $1/n^2$", "En $1/n$", "En $1/\\sqrt{n}$", "Ils ne décroissent pas"],
        bonnes: [0],
        explication: "Le triangle est continu et seule sa pente saute ; c'est l'intégrale d'un carré, dont les coefficients en $1/n$ sont divisés par $n$.",
        resume: "Régularité et décroissance",
      },
      {
        type: "schema",
        enonce: "<p>Ce spectre est annoncé comme celui d'un courant à symétrie de demi-onde. Une raie est incompatible avec cette symétrie.</p>",
        consigne: "Cliquez sur la raie incompatible.",
        viewBox: "0 0 520 220",
        description: "Spectre d'un courant : raies aux rangs 1, 3, 4, 5 et 7",
        dessin: dessinSpectreQuiz(),
        zones: [
          { x: 70, y: 40, largeur: 50, hauteur: 165, etiquette: "rang 1" },
          { x: 180, y: 120, largeur: 50, hauteur: 85, etiquette: "rang 3" },
          { x: 235, y: 130, largeur: 50, hauteur: 75, etiquette: "rang 4", juste: true },
          { x: 290, y: 130, largeur: 50, hauteur: 75, etiquette: "rang 5" },
          { x: 400, y: 140, largeur: 50, hauteur: 65, etiquette: "rang 7" },
        ],
        explication: "Une symétrie de demi-onde annule tous les rangs pairs : le rang 4 est incompatible, et trahit une dissymétrie réelle ou une erreur de mesure.",
        resume: "Lecture d'un spectre",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est le taux de distorsion harmonique d'un signal carré idéal, rapporté au fondamental, en pourcentage ?</p>",
        valeur: 100 * Math.sqrt((Math.PI * Math.PI) / 8 - 1),
        unite: "%",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$U = E$ et $U_1 = 4E/(\\pi\\sqrt{2})$, donc $\\mathrm{THD} = \\sqrt{U^2/U_1^2 - 1} = \\sqrt{\\pi^2/8 - 1} = 48{,}3\\ \\%$.",
        resume: "THD d'un carré",
      },
      {
        type: "vraiFaux",
        enonce: "<p>En gardant suffisamment d'harmoniques, on fait disparaître le dépassement de la reconstruction d'un carré près de ses fronts.</p>",
        reponse: false,
        explication: "Le phénomène de Gibbs maintient un dépassement d'environ $9\\ \\%$ du saut, soit une crête de $1{,}18\\,E$ ; seule sa largeur diminue quand $N$ augmente.",
        resume: "Phénomène de Gibbs",
      },
      {
        type: "calcul",
        enonce: "<p>Un analyseur calcule une TFD sur une fenêtre de $200\\ \\mathrm{ms}$. Quelle est sa résolution en fréquence, en hertz ?</p>",
        valeur: 5,
        unite: "Hz",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$\\Delta f = 1/T_w = 1/0{,}2 = 5\\ \\mathrm{Hz}$ : à $50\\ \\mathrm{Hz}$, chaque rang tombe sur la case $10n$ si la fenêtre est synchronisée.",
        resume: "Résolution d'une TFD",
      },
      {
        type: "qcm",
        enonce: "<p>Une tension sinusoïdale alimente une charge dont le courant est déformé. Quelles affirmations sont exactes ?</p>",
        options: [
          { texte: "Seul le fondamental du courant transporte de la puissance active.", juste: true },
          { texte: "Les harmoniques du courant augmentent sa valeur efficace et les pertes.", juste: true },
          { texte: "La puissance active vaut le produit des valeurs efficaces totales par le facteur de déplacement." },
          { texte: "Le rang 5 du courant produit de la puissance active avec le fondamental de la tension." },
        ],
        multiple: true,
        explication: "Par orthogonalité, la puissance moyenne ne contient que des produits de rangs identiques ; sous une tension sinusoïdale, seul le rang 1 compte. Les harmoniques n'ajoutent que de la valeur efficace, des pertes et de la puissance apparente.",
        resume: "Puissance et harmoniques",
      },
    ],
    { titre: "Dix questions sur la série de Fourier" }
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
      { categorie: "Définition", question: "Qu'affirme le théorème de Fourier pour un signal périodique ?", reponse: "Il s'écrit comme sa valeur moyenne plus une somme de sinusoïdes de fréquences $nf$, multiples entiers de sa fréquence $f$." },
      { categorie: "Formule", question: "Comment calcule-t-on $b_n$ ?", reponse: "$b_n = \\dfrac{2}{T}\\int_0^T u(t)\\sin(n\\omega t)\\,\\mathrm{d}t$ : projection du signal sur $\\sin(n\\omega t)$, grâce à l'orthogonalité." },
      { categorie: "Symétrie", question: "Que permet de conclure une symétrie de demi-onde, $u(t + T/2) = -u(t)$ ?", reponse: "Valeur moyenne et rangs pairs nuls : seuls les rangs impairs existent." },
      { categorie: "Parité", question: "Quels coefficients annule un signal pair ? Un signal impair ?", reponse: "Pair : tous les $b_n$, série en cosinus. Impair : $a_0$ et tous les $a_n$, série en sinus." },
      { categorie: "Spectres", question: "Amplitudes du carré et du triangle d'amplitude $E$ ?", reponse: "Carré : $4E/(n\\pi)$ ; triangle : $8E/(n^2\\pi^2)$ ; rangs impairs seuls dans les deux cas." },
      { categorie: "Régularité", question: "Que dit la vitesse de décroissance d'un spectre ?", reponse: "$1/n$ : le signal a des discontinuités ; $1/n^2$ : il est continu mais sa pente saute. Les fronts raides remplissent les rangs élevés." },
      { categorie: "Parseval", question: "Comment s'obtient la valeur efficace à partir du spectre ?", reponse: "$U^2 = a_0^2 + \\sum U_n^2$, avec $U_n = \\hat{U}_n/\\sqrt{2}$ : somme quadratique, jamais arithmétique." },
      { categorie: "Gibbs", question: "Que vaut le dépassement d'une reconstruction tronquée près d'un saut ?", reponse: "Environ $9\\ \\%$ du saut, quel que soit le nombre de rangs ; seule sa largeur diminue. Carré $\\pm E$ : crête vers $1{,}18\\,E$." },
      { categorie: "Mesure", question: "À quelles conditions une TFD donne-t-elle des rangs exacts ?", reponse: "Fenêtre synchronisée sur un nombre entier de périodes, et aucun contenu replié dans la bande, grâce à un échantillonnage rapide et un filtre anti-repliement." },
      {
        categorie: "Industriel",
        question: "Quel est le spectre du courant de ligne d'un pont de diodes triphasé idéal ?",
        reponse: "Créneaux de $120^\\circ$ : $b_n = \\dfrac{4I}{n\\pi}\\cos\\dfrac{n\\pi}{6}$, rangs $6k \\pm 1$ d'amplitude $I_1/n$, THD de $31{,}1\\ \\%$.",
        rappel: "Pour la pompe du site : $47{,}75\\ \\mathrm{A}$ au fondamental, $9{,}55\\ \\mathrm{A}$ au rang 5, pour $50\\ \\mathrm{A}$ efficaces vrais.",
      },
    ],
    { titre: "Dix cartes sur la série de Fourier" }
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
        enonce: "<p>Cette séance. Le courant de ligne d'un pont de diodes idéal est fait de créneaux de $120^\\circ$ d'amplitude $100\\ \\mathrm{A}$. Quelle est la valeur efficace de son fondamental, en ampères ?</p>",
        valeur: ((2 * Math.sqrt(3)) / Math.PI) * 100 / Math.SQRT2,
        unite: "A",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$\\hat{I}_1 = \\dfrac{4I}{\\pi}\\cos 30^\\circ = \\dfrac{2\\sqrt{3}}{\\pi} \\times 100 = 110{,}3\\ \\mathrm{A}$ crête, soit $77{,}97\\ \\mathrm{A}$ efficaces.",
        resume: "Fondamental d'un créneau de 120 degrés",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Cette séance. La série de Fourier d'un signal pair ne contient que des cosinus, avec éventuellement une valeur moyenne.</p>",
        reponse: true,
        explication: "Le produit d'un signal pair par un sinus est impair, de moyenne nulle : tous les $b_n$ s'annulent.",
        resume: "Signal pair",
      },
      {
        type: "qcm",
        enonce: "<p>Cette séance. Une TFD est calculée sur une fenêtre qui ne contient pas un nombre entier de périodes. Quel défaut apparaît ?</p>",
        options: ["La fuite spectrale", "Le phénomène de Gibbs", "Le repliement", "Aucun, si la fréquence d'échantillonnage est élevée"],
        bonnes: [0],
        explication: "Chaque raie s'étale sur les cases voisines : rangs sous-estimés et raies fictives. Le repliement, lui, vient d'un échantillonnage trop lent.",
        resume: "Fuite spectrale",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/filtres-passifs\">Filtres passifs</a>. Quel est le gain, en décibels, d'un passe-bas du premier ordre à trois fois sa fréquence de coupure ?</p>",
        valeur: -10,
        unite: "dB",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$G = 1/\\sqrt{1 + 3^2} = 1/\\sqrt{10}$, soit $-10{,}00\\ \\mathrm{dB}$. C'est le sort du rang 3 d'un carré dont le fondamental est à la coupure.",
        resume: "Gain à trois fois la coupure",
      },
      {
        type: "qcm",
        enonce: "<p>Cours <a href=\"#/cours/filtres-passifs\">Filtres passifs</a>. Un carré traverse un passe-bas $RC$ dont la coupure vaut dix fois sa fréquence. À quoi ressemble la sortie ?</p>",
        options: ["Un carré aux fronts arrondis", "Une sinusoïde pure", "Un triangle", "Un carré inchangé"],
        bonnes: [0],
        explication: "Les premiers rangs passent presque intacts, les rangs au-delà de 10 sont atténués : la forme est conservée, seuls les fronts, portés par les rangs élevés, s'arrondissent.",
        resume: "Carré filtré",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/resonance-serie-et-parallele\">Résonance série et parallèle</a>. Une branche anti-harmonique associe $2{,}06\\ \\mathrm{mH}$ et $345\\ \\mu\\mathrm{F}$ en série. Quelle est sa fréquence de résonance, en hertz ?</p>",
        valeur: 1 / (TAU * Math.sqrt(2.06e-3 * 345e-6)),
        unite: "Hz",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$f_0 = 1/(2\\pi\\sqrt{LC}) = 1/(2\\pi\\sqrt{2{,}06 \\times 10^{-3} \\times 345 \\times 10^{-6}}) = 188{,}8\\ \\mathrm{Hz}$, rang $3{,}78$ : sous le rang 5, le premier présent dans le spectre de la pompe.",
        resume: "Fréquence de résonance",
      },
      {
        type: "qcm",
        enonce: "<p>Cours <a href=\"#/cours/diagnostic-initial-et-remise-a-niveau-mathematique\">Diagnostic initial et remise à niveau mathématique</a>. Quelle identité transforme le produit $\\sin a\\sin b$ en somme ?</p>",
        options: [
          "$\\tfrac{1}{2}[\\cos(a - b) - \\cos(a + b)]$",
          "$\\tfrac{1}{2}[\\cos(a + b) - \\cos(a - b)]$",
          "$\\tfrac{1}{2}[\\sin(a + b) + \\sin(a - b)]$",
          "$\\cos(a - b)\\cos(a + b)$",
        ],
        bonnes: [0],
        explication: "$\\cos(a - b) - \\cos(a + b) = 2\\sin a\\sin b$. C'est l'identité qui rend nulle la moyenne du produit de deux rangs différents.",
        resume: "Produit de sinus",
      },
    ],
    { titre: "Sept questions de révision espacée" }
  );
  if (quiz) ressources.push(quiz);
}

/* --------------------------------------------------------------------------
   P. Auto-évaluation
   -------------------------------------------------------------------------- */

function construireAutoEval(racine, api) {
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur la série de Fourier ?",
  });
  if (auto) ressources.push(auto);
}
