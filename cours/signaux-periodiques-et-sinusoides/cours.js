/* ==========================================================================
   cours/signaux-periodiques-et-sinusoides/cours.js
   Signaux périodiques et sinusoïdes.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";

/* Réseau du site : 230/400 V, 50 Hz. */
const RESEAU = { f: 50, u: 230, um: 230 * Math.SQRT2 };
const W50 = 2 * Math.PI * 50;

/* Résistance chauffante de référence : 500 W sous 230 V. */
const CHAUFFE = { p: 500, r: (230 * 230) / 500 };

/* Facteur de forme de la sinusoïde, utilisé par les appareils à valeur moyenne. */
const FF_SINUS = Math.PI / (2 * Math.SQRT2);

/* --------------------------------------------------------------------------
   Utilitaires
   -------------------------------------------------------------------------- */

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function nombre(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
}

function borner(valeur, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, valeur));
}

/** Chemin SVG d'une courbe échantillonnée. */
function cheminCourbe(n, fx, fy) {
  let d = "";
  for (let k = 0; k <= n; k += 1) {
    const x = fx(k);
    const y = fy(k);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    d += (d ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
  }
  return d;
}

/** Marqueur de flèche, défini une fois par schéma. */
function marqueur(id) {
  return (
    '<marker id="' + id + '" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto-start-reverse">' +
    '<path d="M0 0 8 4 0 8Z" fill="currentColor"/></marker>'
  );
}

/** Moyenne et valeur efficace d'une fonction sur [0, duree], par la méthode du point milieu. */
function statistiques(fonction, duree, n = 2000) {
  let somme = 0;
  let sommeCarres = 0;
  let sommeAbs = 0;
  let maximum = 0;
  for (let k = 0; k < n; k += 1) {
    const v = fonction((duree * (k + 0.5)) / n);
    somme += v;
    sommeCarres += v * v;
    sommeAbs += Math.abs(v);
    maximum = Math.max(maximum, Math.abs(v));
  }
  return { moyenne: somme / n, efficace: Math.sqrt(sommeCarres / n), moyenneAbs: sommeAbs / n, crete: maximum };
}

/** Ligne horizontale sur un tracé, avec motif de tirets et libellé. */
function ligneH(c, repere, couleurs, y, texte, motif, enDessous, gauche) {
  const py = repere.versY(y);
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.setLineDash(motif || [7, 5]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(repere.boite.x, py);
  c.lineTo(repere.boite.x + repere.boite.l, py);
  c.stroke();
  c.setLineDash([]);
  if (texte) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    c.textAlign = gauche ? "left" : "right";
    c.fillText(texte, gauche ? repere.boite.x + 4 : repere.boite.x + repere.boite.l - 4, py + (enDessous ? 14 : -6));
  }
  c.restore();
}

/** Ligne verticale en tirets sur un tracé, avec son libellé. */
function ligneV(c, repere, couleurs, x, texte) {
  const px = repere.versX(x);
  c.save();
  c.setLineDash([5, 5]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(px, repere.boite.y);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  c.setLineDash([]);
  if (texte) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.6;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(texte, px + (aGauche ? -6 : 6), repere.boite.y + 14);
  }
  c.restore();
}

/** Point marqué sur un tracé, avec son libellé. */
function marquerPoint(c, repere, couleurs, x, y, texte, aGauche) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.fillStyle = couleurs.texte;
  c.beginPath();
  c.arc(px, py, 4.5, 0, Math.PI * 2);
  c.fill();
  if (texte) {
    c.font = POLICE;
    const gauche = aGauche != null ? aGauche : px > repere.boite.x + repere.boite.l * 0.6;
    c.textAlign = gauche ? "right" : "left";
    c.fillText(texte, px + (gauche ? -8 : 8), py - 8);
  }
  c.restore();
}

/** Double flèche horizontale entre deux abscisses, à une ordonnée donnée. */
function doubleFleche(c, repere, couleurs, x1, x2, y, texte) {
  const a = repere.versX(x1);
  const b = repere.versX(x2);
  const py = repere.versY(y);
  c.save();
  c.strokeStyle = couleurs.texte;
  c.fillStyle = couleurs.texte;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(a, py);
  c.lineTo(b, py);
  c.stroke();
  const sens = b > a ? 1 : -1;
  for (const [x, s] of [[a, sens], [b, -sens]]) {
    c.beginPath();
    c.moveTo(x, py);
    c.lineTo(x + 7 * s, py - 4);
    c.lineTo(x + 7 * s, py + 4);
    c.closePath();
    c.fill();
  }
  if (texte) {
    c.font = POLICE;
    c.textAlign = "center";
    c.fillText(texte, (a + b) / 2, py - 7);
  }
  c.restore();
}

/** Tracé de correction animé par le moteur. */
function traceCorrection(moteur, conteneur, options) {
  const traceur = moteur.sim.traceur(conteneur, {
    genre: "Correction visuelle",
    xTitre: "t",
    xUnite: "ms",
    ratio: 0.42,
    echantillons: 600,
    ...options,
  });
  if (traceur) ressources.push(traceur);
  return traceur;
}

/* --------------------------------------------------------------------------
   Formes d'onde
   -------------------------------------------------------------------------- */

/** Triangle symétrique d'amplitude 1, nul et croissant à x = 0, période 1. */
function triangle(x) {
  const r = (((x + 0.25) % 1) + 1) % 1;
  return 1 - 4 * Math.abs(r - 0.5);
}

/** Signaux de l'animation de la fenêtre d'intégration, période 1, amplitude 1. */
const FORMES_FENETRE = [
  { nom: "sinusoïde", f: (x) => Math.sin(2 * Math.PI * x), moyenne: 0, efficace: Math.SQRT1_2 },
  { nom: "redressée double alternance", f: (x) => Math.abs(Math.sin(2 * Math.PI * x)), moyenne: 2 / Math.PI, efficace: Math.SQRT1_2 },
  { nom: "redressée simple alternance", f: (x) => Math.max(0, Math.sin(2 * Math.PI * x)), moyenne: 1 / Math.PI, efficace: 0.5 },
  { nom: "rectangle, α = 0,3", f: (x) => ((((x % 1) + 1) % 1) < 0.3 ? 1 : 0), moyenne: 0.3, efficace: Math.sqrt(0.3) },
  { nom: "triangle", f: triangle, moyenne: 0, efficace: 1 / Math.sqrt(3) },
];

/** Courants de ligne de la simulation des appareils de mesure, angle en radians, forme non normalisée. */
function courantBrut(forme, theta, betaDeg) {
  const b = (betaDeg * Math.PI) / 180;
  const t = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (forme === 1) return Math.sin(t);
  if (forme === 2 || forme === 3) {
    const centres = [
      { c: Math.PI / 2, s: 1 },
      { c: (3 * Math.PI) / 2, s: -1 },
    ];
    for (const { c, s } of centres) {
      const ecart = t - c;
      if (Math.abs(ecart) <= b / 2) return forme === 2 ? s : s * Math.cos((Math.PI * ecart) / b);
    }
    return 0;
  }
  if (forme === 4) return triangle(t / (2 * Math.PI));
  if (forme === 5) return t < Math.PI ? 1 : -1;
  return (40 * Math.sin(t) + 12 * Math.sin(5 * t) + 8 * Math.sin(7 * t)) / 40;
}

const NOMS_COURANTS = [
  "",
  "sinusoïde pure",
  "créneaux de largeur β",
  "impulsions sinusoïdales de largeur β",
  "triangle",
  "carré",
  "fondamental et harmoniques 5 et 7",
];

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeursAnimation = [];

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireCercle(racine, api);
  construireChauffage(racine, api);
  construireFenetre(racine, api);
  construireDeux(racine, api);
  construireTrains(racine, api);
  construireAppareils(racine, api);
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
   Animations : tracé progressif des schémas statiques
   -------------------------------------------------------------------------- */

function construireDessinsStatiques(racine, api) {
  const formes = racine.querySelector("#e-formes-figure svg");
  if (formes) ressources.push(api.dessiner(formes, { duree: 1.8 }));
  const principal = racine.querySelector("#f-schema-principal svg");
  if (principal) ressources.push(api.dessiner(principal, { duree: 2.2 }));
  const montage = racine.querySelector("#h-montage-figure svg");
  if (montage) ressources.push(api.dessiner(montage, { duree: 1.6 }));
  const oscillo = racine.querySelector("#h-oscillo-figure svg");
  if (oscillo) ressources.push(api.dessiner(oscillo, { duree: 2 }));
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-pulsation",
      titre: "Pulsation du réseau",
      niveau: "prérequis",
      enonce: "<p>Un tour complet vaut $2\\pi$ radians. Le réseau effectue $50$ cycles par seconde. Combien de radians sont parcourus en une seconde ?</p>",
      valeur: W50,
      unite: "rad/s",
      tolerance: 0.01,
      libelleChamp: "Pulsation $\\omega$",
      etapes: [
        { texte: "Chaque cycle correspond à un tour, soit $2\\pi$ radians." },
        { texte: "En une seconde : $\\omega = 50 \\times 2\\pi = 100\\pi$." },
        { texte: "Valeur numérique : $\\omega = 314{,}16\\ \\mathrm{rad/s}$.", note: "Confondre $50$ et $314$ est l'erreur la plus fréquente du module : un facteur $2\\pi$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Un cycle dure 20 ms et vaut 2π radians",
          yTitre: "sin ωt",
          xMin: 0,
          xMax: 40,
          yMin: -1.2,
          yMax: 1.2,
          series: [{ id: "s", nom: "sin(314,16 t)", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => Math.sin(W50 * t / 1000) }],
          surDessin({ c, repere, couleurs }) {
            doubleFleche(c, repere, couleurs, 0, 20, 1.08, "T = 20 ms : 2π rad");
            ligneV(c, repere, couleurs, 20, "");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-moyenne-carre",
      titre: "Moyenne d'un carré de sinus",
      niveau: "prérequis",
      enonce: "<p>Quelle est la valeur moyenne de $\\sin^2 x$ sur une période ? Utilisez $\\sin^2 x = \\tfrac{1}{2}(1 - \\cos 2x)$.</p>",
      valeur: 0.5,
      unite: "",
      tolerance: 0.01,
      libelleChamp: "$\\langle \\sin^2 x \\rangle$",
      etapes: [
        { texte: "Linéarisation : $\\sin^2 x = \\tfrac{1}{2} - \\tfrac{1}{2}\\cos 2x$." },
        { texte: "Le terme $\\cos 2x$ fait deux oscillations complètes par période : sa moyenne est nulle." },
        { texte: "Il reste $\\langle \\sin^2 x \\rangle = \\tfrac{1}{2}$.", note: "C'est le cœur de la valeur efficace : la puissance moyenne dans une résistance est la moitié de la puissance crête." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "sin² x oscille entre 0 et 1 autour de 1/2",
          xTitre: "x / 2π",
          xUnite: "",
          yTitre: "valeur",
          xMin: 0,
          xMax: 2,
          yMin: -1.1,
          yMax: 1.2,
          series: [
            { id: "s", nom: "sin x", couleur: "serie-4", epaisseur: 1.6, fonction: (x) => Math.sin(2 * Math.PI * x) },
            { id: "s2", nom: "sin² x", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => Math.sin(2 * Math.PI * x) ** 2 },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 0.5, "moyenne de sin² x = 0,5", [7, 5], false);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-energie",
      titre: "Énergie dissipée par effet Joule",
      niveau: "prérequis",
      enonce: "<p>Une résistance de $10\\ \\Omega$ est parcourue par un courant continu de $2\\ \\mathrm{A}$ pendant $20\\ \\mathrm{ms}$. Quelle énergie reçoit-elle ?</p>",
      valeur: 0.8,
      unite: "J",
      tolerance: 0.01,
      libelleChamp: "Énergie $W$",
      etapes: [
        { texte: "Puissance : $P = RI^2 = 10 \\times 2^2 = 40\\ \\mathrm{W}$." },
        { texte: "Énergie : $W = P\\,t = 40 \\times 0{,}020 = 0{,}8\\ \\mathrm{J}$." },
        { texte: "Contrôle d'unités : $\\mathrm{W \\cdot s} = \\mathrm{J}$.", note: "En alternatif, la puissance varie dans le temps : il faudra intégrer $Ri^2(t)$, d'où la valeur efficace." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Énergie cumulée à puissance constante",
          yTitre: "W",
          yUnite: "J",
          xMin: 0,
          xMax: 20,
          yMin: 0,
          yMax: 0.9,
          series: [{ id: "w", nom: "W(t) = 40 t", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => (40 * t) / 1000 }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 20, 0.8, "0,8 J à 20 ms", true);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : du cercle à la sinusoïde
   -------------------------------------------------------------------------- */

function construireCercle(racine, api) {
  const conteneur = racine.querySelector("#d-cercle");
  if (!conteneur) return;

  const C = { x: 140, y: 150 };
  const R = 100;
  const G = { x0: 290, x1: 690, y: 150 };
  const vx = (deg) => G.x0 + ((G.x1 - G.x0) * deg) / 360;

  const svg = svgEl("svg", {
    viewBox: "0 0 720 300",
    role: "img",
    "aria-label": "Deux rayons tournants de même longueur, décalés de l'angle phi, et leurs projections verticales reportées en fonction de l'angle parcouru",
  });
  const fond = svgEl("g");
  let graduations = "";
  let textes = "";
  for (let k = 1; k <= 4; k += 1) {
    const x = vx(90 * k);
    graduations += "M" + x + " " + (G.y - 5) + "v10";
    textes +=
      '<text x="' + x + '" y="' + (G.y + 124) + '" text-anchor="middle">' + 90 * k + "°</text>" +
      '<text x="' + x + '" y="' + (G.y + 140) + '" text-anchor="middle">' + nombre(api, 5 * k, 0) + " ms</text>";
  }
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.6">' +
    '<circle cx="' + C.x + '" cy="' + C.y + '" r="' + R + '"/>' +
    '<path d="M' + (C.x - R - 24) + " " + C.y + "H" + (C.x + R + 24) + "M" + C.x + " " + (C.y + R + 24) + "V" + (C.y - R - 24) + '"/>' +
    '<path d="M' + G.x0 + " " + G.y + "H" + (G.x1 + 16) + "M" + G.x0 + " " + (G.y + R + 10) + "V" + (G.y - R - 14) + '"/>' +
    '<path d="' + graduations + '"/>' +
    '<path d="M' + (G.x0 - 5) + " " + (G.y - R) + "h10M" + (G.x0 - 5) + " " + (G.y + R) + 'h10"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5" opacity="0.85">' +
    '<text x="' + (G.x0 - 8) + '" y="' + (G.y - R + 4) + '" text-anchor="end">Um</text>' +
    '<text x="' + (G.x0 - 8) + '" y="' + (G.y + R + 4) + '" text-anchor="end">-Um</text>' +
    '<text x="' + (G.x1 + 20) + '" y="' + (G.y - 8) + '" text-anchor="end">θ</text>' +
    '<text x="' + (C.x + R + 22) + '" y="' + (C.y + 16) + '" text-anchor="end">0°</text>' +
    textes +
    "</g>";
  const guides = svgEl("path", { stroke: "currentColor", "stroke-width": 1.1, fill: "none", "stroke-dasharray": "2 4", opacity: 0.75 });
  const curseurTemps = svgEl("path", { stroke: "currentColor", "stroke-width": 1, fill: "none", opacity: 0.5 });
  const courbeRef = svgEl("path", { stroke: "currentColor", "stroke-width": 2.8, fill: "none", "stroke-linecap": "round" });
  const courbeSec = svgEl("path", { "stroke-width": 2.4, fill: "none", "stroke-dasharray": "9 6", "stroke-linecap": "round", style: "stroke: var(--serie-4)" });
  const arcPhi = svgEl("path", { stroke: "currentColor", "stroke-width": 1.3, fill: "none", opacity: 0.8 });
  const rayonSec = svgEl("path", { "stroke-width": 2.4, fill: "none", "stroke-dasharray": "8 5", "stroke-linecap": "round", style: "stroke: var(--serie-4)" });
  const rayonRef = svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-linecap": "round" });
  const pointSec = svgEl("circle", { r: 4.5, style: "fill: var(--serie-4)" });
  const pointsCourbes = svgEl("g", { fill: "currentColor" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(fond, guides, curseurTemps, courbeRef, courbeSec, arcPhi, rayonSec, rayonRef, pointSec, pointsCourbes, etiquettes);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-cercle-valeurs", [
    { id: "theta", libelle: "Angle parcouru θ = ωt", unite: "°", decimales: 0 },
    { id: "t", libelle: "Instant t à 50 Hz", unite: "ms", decimales: 2 },
    { id: "u1", libelle: "Projection du rayon de référence, sin θ", decimales: 3 },
    { id: "u2", libelle: "Projection du second rayon, sin(θ + φ)", decimales: 3 },
    { id: "dt", libelle: "Décalage temporel Δt = |φ| / ω", unite: "ms", decimales: 2 },
    { id: "etat", libelle: "Second rayon par rapport à la référence", format: (v) => (v > 0 ? "en avance" : v < 0 ? "en retard" : "en phase") },
  ]);
  if (valeurs) ressources.push(valeurs);

  const THETA_DEPART = 60;
  let theta = THETA_DEPART;
  let phi = -45;
  let synchronisation = false;
  let poignee = null;
  let lecteur = null;

  function dessiner() {
    const rad = (theta * Math.PI) / 180;
    const radSec = ((theta + phi) * Math.PI) / 180;
    const p1 = { x: C.x + R * Math.cos(rad), y: C.y - R * Math.sin(rad) };
    const p2 = { x: C.x + R * Math.cos(radSec), y: C.y - R * Math.sin(radSec) };
    rayonRef.setAttribute("d", "M" + C.x + " " + C.y + "L" + p1.x.toFixed(1) + " " + p1.y.toFixed(1));
    rayonSec.setAttribute("d", "M" + C.x + " " + C.y + "L" + p2.x.toFixed(1) + " " + p2.y.toFixed(1));
    pointSec.setAttribute("cx", p2.x.toFixed(1));
    pointSec.setAttribute("cy", p2.y.toFixed(1));

    const n = Math.max(2, Math.round(theta / 3));
    courbeRef.setAttribute("d", cheminCourbe(n, (k) => vx((theta * k) / n), (k) => G.y - R * Math.sin((((theta * k) / n) * Math.PI) / 180)));
    courbeSec.setAttribute("d", cheminCourbe(n, (k) => vx((theta * k) / n), (k) => G.y - R * Math.sin(((((theta * k) / n) + phi) * Math.PI) / 180)));

    const xt = vx(theta);
    const y1 = G.y - R * Math.sin(rad);
    const y2 = G.y - R * Math.sin(radSec);
    curseurTemps.setAttribute("d", "M" + xt.toFixed(1) + " " + (G.y - R - 10) + "V" + (G.y + R + 10));
    guides.setAttribute(
      "d",
      "M" + p1.x.toFixed(1) + " " + p1.y.toFixed(1) + "H" + xt.toFixed(1) + "M" + p2.x.toFixed(1) + " " + p2.y.toFixed(1) + "H" + xt.toFixed(1)
    );
    pointsCourbes.innerHTML =
      '<circle cx="' + xt.toFixed(1) + '" cy="' + y1.toFixed(1) + '" r="4.5"/>' +
      '<circle cx="' + xt.toFixed(1) + '" cy="' + y2.toFixed(1) + '" r="4" style="fill: var(--serie-4)"/>';

    /* Arc de l'angle phi entre les deux rayons, au rayon 34. */
    const ra = 34;
    const a1 = { x: C.x + ra * Math.cos(rad), y: C.y - ra * Math.sin(rad) };
    const a2 = { x: C.x + ra * Math.cos(radSec), y: C.y - ra * Math.sin(radSec) };
    const balayage = phi > 0 ? 0 : 1;
    arcPhi.setAttribute(
      "d",
      Math.abs(phi) < 2 ? "" : "M" + a1.x.toFixed(1) + " " + a1.y.toFixed(1) + "A" + ra + " " + ra + " 0 0 " + balayage + " " + a2.x.toFixed(1) + " " + a2.y.toFixed(1)
    );
    const milieu = ((theta + phi / 2) * Math.PI) / 180;
    etiquettes.innerHTML =
      (Math.abs(phi) >= 8
        ? '<text x="' + (C.x + 52 * Math.cos(milieu)).toFixed(1) + '" y="' + (C.y - 52 * Math.sin(milieu) + 4).toFixed(1) + '" text-anchor="middle">φ</text>'
        : "") +
      '<text x="' + G.x0 + '" y="20">Um sin θ : trait plein ; Um sin(θ + φ) : tirets</text>';

    if (valeurs) {
      valeurs.maj({
        theta,
        t: (theta / 360) * 20,
        u1: Math.sin(rad),
        u2: Math.sin(radSec),
        dt: (Math.abs(phi) / 360) * 20,
        etat: phi,
      });
    }
  }

  function appliquer(degres, source) {
    if (synchronisation) return;
    synchronisation = true;
    theta = borner(Number(degres), 0, 360);
    dessiner();
    if (source !== "poignee" && poignee) poignee.set(theta % 360, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(theta);
    synchronisation = false;
  }

  poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: C,
    rayon: R,
    valeur: theta,
    pas: 5,
    libelle: "Angle du rayon de référence",
    diffuserAuDepart: false,
    rappel(mesure) {
      appliquer(((mesure.angle % 360) + 360) % 360, "poignee");
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-cercle-curseurs",
    [{ id: "phi", libelle: "Déphasage φ du second rayon", min: -180, max: 180, pas: 5, valeur: phi, unite: "°" }],
    (lues) => {
      phi = lues.phi;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#d-cercle-lecteur", {
    de: 0,
    a: 360,
    duree: 8,
    boucle: true,
    auto: false,
    libelle: "Faire tourner les deux rayons",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  /* Le lecteur diffuse sa valeur de départ à la création : on rétablit l'angle initial. */
  appliquer(THETA_DEPART, null);
}

/* --------------------------------------------------------------------------
   D. Animation : chauffer avec du continu ou de l'alternatif
   -------------------------------------------------------------------------- */

function construireChauffage(racine, api) {
  if (!racine.querySelector("#d-chauffage-puissance")) return;
  const um = RESEAU.um;
  const r = CHAUFFE.r;
  let tCourant = 0;
  let uContinu = 300;

  const pAc = (tms) => (um * um * Math.sin((W50 * tms) / 1000) ** 2) / r;
  const wAc = (tms) => {
    const t = tms / 1000;
    return ((um * um) / r) * (t / 2 - Math.sin(2 * W50 * t) / (4 * W50));
  };

  const traceP = api.sim.traceur("#d-chauffage-puissance", {
    titre: "Puissance instantanée reçue par chaque résistance",
    genre: "Animation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "p",
    yUnite: "W",
    xMin: 0,
    xMax: 60,
    yMin: 0,
    yMax: 1100,
    ratio: 0.36,
    echantillons: 600,
    series: [
      { id: "ac", nom: "p(t), résistance alimentée par le réseau", couleur: "serie-1", epaisseur: 2.4 },
      { id: "dc", nom: "P, résistance alimentée en continu", couleur: "serie-2", epaisseur: 2.4 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, CHAUFFE.p, "moyenne en alternatif : 500 W", [3, 4], false, true);
      if (tCourant > 0) ligneV(c, repere, couleurs, tCourant, "");
    },
  });
  if (traceP) ressources.push(traceP);

  const traceW = api.sim.traceur("#d-chauffage-energie", {
    titre: "Énergie cumulée depuis t = 0",
    genre: "Animation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "W",
    yUnite: "J",
    xMin: 0,
    xMax: 60,
    yMin: 0,
    yMax: 65,
    ratio: 0.36,
    echantillons: 600,
    series: [
      { id: "ac", nom: "énergie, résistance alimentée par le réseau", couleur: "serie-1", epaisseur: 2.4 },
      { id: "dc", nom: "énergie, résistance alimentée en continu", couleur: "serie-2", epaisseur: 2.4 },
    ],
    surDessin({ c, repere, couleurs }) {
      for (const t of [20, 40]) ligneV(c, repere, couleurs, t, t === 20 ? "fin de période" : "");
    },
  });
  if (traceW) ressources.push(traceW);

  const valeurs = api.sim.valeurs("#d-chauffage-valeurs", [
    { id: "t", libelle: "Instant t", unite: "ms", decimales: 1 },
    { id: "pac", libelle: "Puissance instantanée en alternatif", unite: "W", decimales: 0 },
    { id: "pdc", libelle: "Puissance en continu U² / R", unite: "W", decimales: 0 },
    { id: "wac", libelle: "Énergie reçue en alternatif", unite: "J", decimales: 2 },
    { id: "wdc", libelle: "Énergie reçue en continu", unite: "J", decimales: 2 },
    { id: "rapport", libelle: "Rapport U / Um", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher(tms) {
    tCourant = tms;
    const limite = (f) => (x) => (x <= tCourant + 1e-9 ? f(x) : NaN);
    const pDc = (uContinu * uContinu) / r;
    if (traceP) {
      traceP.definirFonction("ac", limite(pAc));
      traceP.definirFonction("dc", limite(() => pDc));
    }
    if (traceW) {
      traceW.definirFonction("ac", limite(wAc));
      traceW.definirFonction("dc", limite((x) => (pDc * x) / 1000));
    }
    if (valeurs) {
      valeurs.maj({ t: tms, pac: pAc(tms), pdc: pDc, wac: wAc(tms), wdc: (pDc * tms) / 1000, rapport: uContinu / um });
    }
  }

  const curseurs = api.sim.curseurs(
    "#d-chauffage-curseurs",
    [{ id: "u", libelle: "Tension continue U de la seconde résistance", min: 100, max: 330, pas: 1, valeur: uContinu, unite: "V" }],
    (lues) => {
      uContinu = lues.u;
      afficher(tCourant);
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-chauffage-lecteur", {
    de: 0,
    a: 60,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Faire avancer le temps sur trois périodes",
    rappel: (valeur) => afficher(valeur),
  });
  if (lecteur) {
    ressources.push(lecteur);
    /* Départ sur les trois périodes complètes ; la lecture repart de zéro. */
    lecteur.definir(60);
  } else {
    afficher(60);
  }
}

/* --------------------------------------------------------------------------
   E. Animation : la fenêtre d'intégration d'une mesure
   -------------------------------------------------------------------------- */

function construireFenetre(racine, api) {
  const conteneur = racine.querySelector("#e-fenetre");
  if (!conteneur) return;

  const P = { x0: 70, x1: 610, y0: 150, a: 100, yAxe: 296 };
  const vx = (tms) => P.x0 + ((P.x1 - P.x0) * tms) / 60;
  const vy = (v) => P.y0 - P.a * v;

  const svg = svgEl("svg", {
    viewBox: "0 0 680 330",
    role: "img",
    "aria-label": "Signal périodique sur trois périodes, fenêtre d'intégration grisée réglable, valeur moyenne et valeur efficace calculées sur la fenêtre",
  });
  const fond = svgEl("g");
  let textes = "";
  let traits = "";
  for (let t = 0; t <= 60; t += 10) {
    traits += "M" + vx(t) + " " + P.yAxe + "v-6";
    textes += '<text x="' + vx(t) + '" y="' + (P.yAxe + 18) + '" text-anchor="middle">' + t + "</text>";
  }
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.75">' +
    '<path d="M' + P.x0 + " " + P.y0 + "H" + (P.x1 + 10) + "M" + P.x0 + " " + (vy(-1) + 10) + "V" + (vy(1) - 14) + '"/>' +
    '<path d="M' + P.x0 + " " + P.yAxe + "H" + P.x1 + '" stroke-width="3" opacity="0.5"/>' +
    '<path d="' + traits + '"/></g>' +
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.4">' +
    '<path d="M' + vx(20) + " " + (vy(1) - 8) + "V" + (vy(-1) + 8) + "M" + vx(40) + " " + (vy(1) - 8) + "V" + (vy(-1) + 8) + "M" + vx(60) + " " + (vy(1) - 8) + "V" + (vy(-1) + 8) + '"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5">' +
    '<text x="' + (P.x0 - 8) + '" y="' + (vy(1) + 4) + '" text-anchor="end">1</text>' +
    '<text x="' + (P.x0 - 8) + '" y="' + (P.y0 + 4) + '" text-anchor="end">0</text>' +
    '<text x="' + (P.x0 - 8) + '" y="' + (vy(-1) + 4) + '" text-anchor="end">-1</text>' +
    textes +
    '<text x="' + P.x1 + '" y="' + (P.yAxe + 32) + '" text-anchor="end">t (ms)</text></g>';
  const zone = svgEl("rect", { y: vy(1) - 8, height: 2 * P.a + 16, fill: "currentColor", opacity: 0.09 });
  const bord = svgEl("path", { stroke: "currentColor", "stroke-width": 1.2, fill: "none", opacity: 0.7 });
  const courbe = svgEl("path", { stroke: "currentColor", "stroke-width": 2.8, fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round" });
  const ligneEff = svgEl("path", { "stroke-width": 1.8, fill: "none", "stroke-dasharray": "9 6", style: "stroke: var(--serie-1)" });
  const ligneMoy = svgEl("path", { "stroke-width": 2.2, fill: "none", "stroke-dasharray": "1.5 5", "stroke-linecap": "round", style: "stroke: var(--serie-5)" });
  const marques = svgEl("g", { stroke: "currentColor", "stroke-width": 1.6, fill: "none" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  svg.append(zone, fond, bord, courbe, ligneEff, ligneMoy, marques, etiquettes);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-fenetre-valeurs", [
    { id: "tw", libelle: "Durée de la fenêtre t_w", unite: "ms", decimales: 1 },
    { id: "periodes", libelle: "Nombre de périodes t_w / T", decimales: 3 },
    { id: "moy", libelle: "Moyenne calculée sur la fenêtre", decimales: 3 },
    { id: "moyExacte", libelle: "Moyenne exacte", decimales: 3 },
    { id: "eff", libelle: "Valeur efficace calculée sur la fenêtre", decimales: 3 },
    { id: "effExacte", libelle: "Valeur efficace exacte", decimales: 3 },
    { id: "erreur", libelle: "Erreur relative sur la valeur efficace", unite: "%", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const TW_DEPART = 27;
  let forme = 1;
  let tw = TW_DEPART;
  let synchronisation = false;
  let poignee = null;
  let lecteur = null;

  function dessiner() {
    const s = FORMES_FENETRE[forme - 1];
    const g = (tms) => s.f(tms / 20);
    courbe.setAttribute("d", cheminCourbe(720, (k) => vx((60 * k) / 720), (k) => vy(g((60 * k) / 720))));
    zone.setAttribute("x", P.x0);
    zone.setAttribute("width", Math.max(0, vx(tw) - P.x0).toFixed(1));
    bord.setAttribute("d", "M" + vx(tw).toFixed(1) + " " + (vy(1) - 8) + "V" + (vy(-1) + 8));
    const st = statistiques(g, tw, 2400);
    ligneEff.setAttribute("d", "M" + P.x0 + " " + vy(st.efficace).toFixed(1) + "H" + P.x1);
    ligneMoy.setAttribute("d", "M" + P.x0 + " " + vy(st.moyenne).toFixed(1) + "H" + P.x1);
    marques.innerHTML =
      '<path d="M' + (P.x1 + 4) + " " + vy(s.efficace).toFixed(1) + "h12M" + (P.x1 + 4) + " " + vy(s.moyenne).toFixed(1) + 'h12"/>';
    etiquettes.innerHTML =
      '<text x="' + (P.x1 + 20) + '" y="' + (vy(s.efficace) + 4).toFixed(1) + '">U</text>' +
      '<text x="' + (P.x1 + 20) + '" y="' + (vy(s.moyenne) + (Math.abs(s.moyenne - s.efficace) < 0.12 ? 16 : 4)).toFixed(1) + '">moy</text>' +
      '<text x="' + P.x0 + '" y="24">' + s.nom + " : efficace en tirets, moyenne en pointillés</text>";
    if (valeurs) {
      valeurs.maj({
        tw,
        periodes: tw / 20,
        moy: st.moyenne,
        moyExacte: s.moyenne,
        eff: st.efficace,
        effExacte: s.efficace,
        erreur: (st.efficace / s.efficace - 1) * 100,
      });
    }
  }

  function appliquer(valeur, source) {
    if (synchronisation) return;
    synchronisation = true;
    tw = borner(Number(valeur), 1, 60);
    dessiner();
    if (source !== "poignee" && poignee) poignee.set(tw, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(tw);
    synchronisation = false;
  }

  poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: vx(1), y: P.yAxe },
    a: { x: vx(60), y: P.yAxe },
    min: 1,
    max: 60,
    pas: 0.5,
    valeur: tw,
    unite: "ms",
    libelle: "Fin de la fenêtre d'intégration",
    diffuserAuDepart: false,
    rappel: (mesure) => appliquer(mesure.valeur, "poignee"),
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-fenetre-curseurs",
    [
      {
        id: "forme",
        libelle: "Forme du signal",
        min: 1,
        max: FORMES_FENETRE.length,
        pas: 1,
        valeur: forme,
        format: (v) => FORMES_FENETRE[Math.round(v) - 1].nom,
      },
    ],
    (lues) => {
      forme = Math.round(lues.forme);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#e-fenetre-lecteur", {
    de: 1,
    a: 60,
    duree: 14,
    boucle: true,
    auto: false,
    libelle: "Allonger la fenêtre d'intégration",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  /* Le lecteur diffuse sa valeur de départ à la création : on rétablit la fenêtre initiale. */
  appliquer(TW_DEPART, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : deux sinusoïdes déphasées
   -------------------------------------------------------------------------- */

function construireDeux(racine, api) {
  const conteneur = racine.querySelector("#e-deux");
  if (!conteneur) return;

  const P = { x0: 80, x1: 590, y0: 170, a: 110, yFleche: 312, yAxe: 350 };

  const svg = svgEl("svg", {
    viewBox: "0 0 680 390",
    role: "img",
    "aria-label": "Tension et courant sinusoïdaux de même fréquence sur deux périodes, valeur moyenne et valeur efficace de la tension, décalage temporel entre passages en montant, instant choisi par une poignée",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-deux") + '<clipPath id="clip-e-deux"><rect x="' + P.x0 + '" y="' + (P.y0 - P.a - 16) + '" width="' + (P.x1 - P.x0) + '" height="' + (2 * P.a + 32) + '"/></clipPath>';
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.75">' +
    '<path d="M' + P.x0 + " " + P.y0 + "H" + (P.x1 + 12) + "M" + P.x0 + " " + (P.y0 + P.a + 12) + "V" + (P.y0 - P.a - 14) + "M" + P.x1 + " " + (P.y0 + P.a + 12) + "V" + (P.y0 - P.a - 14) + '"/>' +
    '<path d="M' + P.x0 + " " + P.yAxe + "H" + P.x1 + '" stroke-width="3" opacity="0.5"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5">' +
    '<text x="' + (P.x0 - 8) + '" y="' + (P.y0 + 4) + '" text-anchor="end">0</text>' +
    '<text x="' + (P.x0 - 8) + '" y="' + (P.y0 - P.a - 18) + '" text-anchor="end">u (V)</text>' +
    '<text x="' + (P.x1 + 8) + '" y="' + (P.y0 - P.a - 18) + '">i (A)</text></g>';
  const echelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11 });
  const axeTemps = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11 });
  const traitsTemps = svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", opacity: 0.75 });
  const zoneCourbes = svgEl("g", { "clip-path": "url(#clip-e-deux)" });
  const ligneMoy = svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "none", "stroke-dasharray": "1.5 5", "stroke-linecap": "round", opacity: 0.85 });
  const ligneEff = svgEl("path", { stroke: "currentColor", "stroke-width": 1.2, fill: "none", "stroke-dasharray": "14 6", opacity: 0.7 });
  const courbeU = svgEl("path", { stroke: "currentColor", "stroke-width": 2.8, fill: "none", "stroke-linecap": "round" });
  const courbeI = svgEl("path", { "stroke-width": 2.4, fill: "none", "stroke-dasharray": "10 6", "stroke-linecap": "round", style: "stroke: var(--serie-1)" });
  const guide = svgEl("path", { stroke: "currentColor", "stroke-width": 1, fill: "none", opacity: 0.55 });
  const pointU = svgEl("circle", { r: 5, fill: "currentColor" });
  const pointI = svgEl("circle", { r: 4.5, style: "fill: var(--serie-1)" });
  zoneCourbes.append(ligneMoy, ligneEff, courbeU, courbeI, guide, pointU, pointI);
  const fleche = svgEl("g", { stroke: "currentColor", "stroke-width": 1.5, fill: "none" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  svg.append(defs, fond, traitsTemps, axeTemps, echelles, zoneCourbes, fleche, etiquettes);
  conteneur.appendChild(svg);

  const etat = { um: 325, im: 1.1, f: 50, phi: 32, u0: 0, instant: 0.2 };

  const valeurs = api.sim.valeurs("#e-deux-valeurs", [
    { id: "T", libelle: "Période T", unite: "ms", decimales: 2 },
    { id: "w", libelle: "Pulsation ω", unite: "rad/s", decimales: 1 },
    { id: "dt", libelle: "Décalage Δt de i après u", unite: "ms", decimales: 2 },
    { id: "phiRad", libelle: "Déphasage φ = φu - φi", unite: "rad", decimales: 3 },
    { id: "relation", libelle: "Courant par rapport à la tension", format: (v) => (v === 2 ? "en opposition" : v > 0 ? "en retard" : v < 0 ? "en avance" : "en phase") },
    { id: "ueff", libelle: "Valeur efficace de u", unite: "V", decimales: 1 },
    { id: "umoy", libelle: "Valeur moyenne de u", unite: "V", decimales: 1 },
    { id: "ucrete", libelle: "Valeur maximale de u", unite: "V", decimales: 1 },
    { id: "ieff", libelle: "Valeur efficace de i", unite: "A", decimales: 3 },
    { id: "t", libelle: "Instant choisi t", unite: "ms", decimales: 2 },
    { id: "ut", libelle: "u(t)", unite: "V", decimales: 1 },
    { id: "it", libelle: "i(t)", unite: "A", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const T = 1 / etat.f;
    const w = 2 * Math.PI * etat.f;
    const phiRad = (etat.phi * Math.PI) / 180;
    const duree = 2 * T;
    const echelleU = Math.max(1, Math.abs(etat.u0) + etat.um);
    const vx = (t) => P.x0 + ((P.x1 - P.x0) * t) / duree;
    const vyU = (u) => P.y0 - (P.a * u) / echelleU;
    const vyI = (i) => P.y0 - (P.a * i) / etat.im;
    const u = (t) => etat.u0 + etat.um * Math.cos(w * t + phiRad);
    const i = (t) => etat.im * Math.cos(w * t);
    const n = 300;

    courbeU.setAttribute("d", cheminCourbe(n, (k) => vx((duree * k) / n), (k) => vyU(u((duree * k) / n))));
    courbeI.setAttribute("d", cheminCourbe(n, (k) => vx((duree * k) / n), (k) => vyI(i((duree * k) / n))));
    const ueff = Math.sqrt(etat.u0 * etat.u0 + (etat.um * etat.um) / 2);
    ligneMoy.setAttribute("d", "M" + P.x0 + " " + vyU(etat.u0).toFixed(1) + "H" + P.x1);
    ligneEff.setAttribute("d", "M" + P.x0 + " " + vyU(ueff).toFixed(1) + "H" + P.x1);

    /* Passages en montant : i par zéro à 3T/4, u par sa moyenne à 3T/4 - phi/omega. */
    const ti = 0.75 * T;
    const tu = ti - phiRad / w;
    const xa = vx(tu);
    const xb = vx(ti);
    if (Math.abs(xb - xa) > 6) {
      fleche.innerHTML =
        '<path d="M' + xa.toFixed(1) + " " + P.y0 + "V" + (P.yFleche + 6) + "M" + xb.toFixed(1) + " " + P.y0 + "V" + (P.yFleche + 6) + '" stroke-dasharray="4 4" opacity="0.7"/>' +
        '<path d="M' + xa.toFixed(1) + " " + P.yFleche + "H" + xb.toFixed(1) + '" marker-start="url(#fl-e-deux)" marker-end="url(#fl-e-deux)"/>' +
        '<circle cx="' + xa.toFixed(1) + '" cy="' + vyU(etat.u0).toFixed(1) + '" r="3.5" fill="currentColor" stroke="none"/>' +
        '<circle cx="' + xb.toFixed(1) + '" cy="' + P.y0 + '" r="3.5" fill="currentColor" stroke="none"/>';
    } else {
      fleche.innerHTML = "";
    }

    const t = etat.instant * duree;
    const px = vx(t);
    guide.setAttribute("d", "M" + px.toFixed(1) + " " + (P.y0 - P.a - 14) + "V" + (P.y0 + P.a + 14));
    pointU.setAttribute("cx", px.toFixed(1));
    pointU.setAttribute("cy", vyU(u(t)).toFixed(1));
    pointI.setAttribute("cx", px.toFixed(1));
    pointI.setAttribute("cy", vyI(i(t)).toFixed(1));

    echelles.innerHTML =
      '<text x="' + (P.x0 - 8) + '" y="' + (P.y0 - P.a + 4) + '" text-anchor="end">' + nombre(api, echelleU, 0) + "</text>" +
      '<text x="' + (P.x0 - 8) + '" y="' + (P.y0 + P.a + 4) + '" text-anchor="end">-' + nombre(api, echelleU, 0) + "</text>" +
      '<text x="' + (P.x1 + 8) + '" y="' + (P.y0 - P.a + 4) + '">' + nombre(api, etat.im, 1) + "</text>" +
      '<text x="' + (P.x1 + 8) + '" y="' + (P.y0 + P.a + 4) + '">-' + nombre(api, etat.im, 1) + "</text>";

    const dureeMs = duree * 1000;
    const pas = api.util.pasJoli(dureeMs, 8);
    let traits = "";
    let textes = "";
    for (let v = 0; v <= dureeMs + 1e-9; v += pas) {
      const x = P.x0 + ((P.x1 - P.x0) * v) / dureeMs;
      traits += "M" + x.toFixed(1) + " " + P.yAxe + "v-6";
      const dec = pas >= 1 ? 0 : 1;
      textes += '<text x="' + x.toFixed(1) + '" y="' + (P.yAxe + 18) + '" text-anchor="middle">' + nombre(api, v, dec) + "</text>";
    }
    textes += '<text x="' + P.x1 + '" y="' + (P.yAxe + 34) + '" text-anchor="end">t (ms)</text>';
    traitsTemps.setAttribute("d", traits);
    axeTemps.innerHTML = textes;

    etiquettes.innerHTML =
      (Math.abs(xb - xa) > 6 ? '<text x="' + ((xa + xb) / 2).toFixed(1) + '" y="' + (P.yFleche - 7) + '" text-anchor="middle">Δt</text>' : "") +
      '<text x="' + P.x0 + '" y="22" font-size="10.5">u : trait plein ; i : tirets ; moyenne : pointillés ; efficace : tirets longs</text>';

    if (valeurs) {
      valeurs.maj({
        T: T * 1000,
        w,
        dt: (phiRad / w) * 1000,
        phiRad,
        relation: Math.abs(Math.abs(etat.phi) - 180) < 0.5 ? 2 : Math.sign(etat.phi),
        ueff,
        umoy: etat.u0,
        ucrete: etat.u0 >= 0 ? etat.u0 + etat.um : etat.u0 - etat.um,
        ieff: etat.im / Math.SQRT2,
        t: t * 1000,
        ut: u(t),
        it: i(t),
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: P.x0, y: P.yAxe },
    a: { x: P.x1, y: P.yAxe },
    min: 0,
    max: 1,
    pas: 0.005,
    valeur: etat.instant,
    libelle: "Instant étudié, en fraction des deux périodes affichées",
    format: (mesure) => api.util.formater(mesure.valeur * 100, 1) + " % de la fenêtre",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.instant = mesure.valeur;
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-deux-curseurs",
    [
      { id: "um", libelle: "Amplitude de la tension Um", min: 10, max: 400, pas: 5, valeur: etat.um, unite: "V" },
      { id: "im", libelle: "Amplitude du courant Im", min: 0.1, max: 5, pas: 0.1, valeur: etat.im, unite: "A", chiffres: 1 },
      { id: "f", libelle: "Fréquence f", min: 10, max: 100, pas: 1, valeur: etat.f, unite: "Hz" },
      { id: "phi", libelle: "Déphasage φ de u par rapport à i", min: -180, max: 180, pas: 1, valeur: etat.phi, unite: "°" },
      { id: "u0", libelle: "Composante continue U0 ajoutée à u", min: -200, max: 200, pas: 5, valeur: etat.u0, unite: "V" },
    ],
    (lues) => {
      Object.assign(etat, { um: lues.um, im: lues.im, f: lues.f, phi: lues.phi, u0: lues.u0 });
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   H. Tracé de la commande par trains d'alternances
   -------------------------------------------------------------------------- */

function construireTrains(racine, api) {
  if (!racine.querySelector("#h-trains-trace")) return;
  const um = RESEAU.um;
  const u = (tms) => (((tms % 100) + 100) % 100 < 60 ? um * Math.sin((W50 * tms) / 1000) : 0);
  const efficace = 230 * Math.sqrt(0.6);
  const traceur = api.sim.traceur("#h-trains-trace", {
    titre: "Trois périodes conduites sur cinq",
    genre: "Tracé",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "u",
    yUnite: "V",
    xMin: 0,
    xMax: 200,
    yMin: -380,
    yMax: 380,
    ratio: 0.4,
    echantillons: 2000,
    series: [{ id: "u", nom: "u(t), tension de la résistance", couleur: "serie-1", epaisseur: 2.2, fonction: u }],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, efficace, "U = 178,2 V", [7, 5], false);
      ligneH(c, repere, couleurs, -efficace, "", [7, 5]);
      ligneH(c, repere, couleurs, 230, "230 V pendant la conduction", [1.5, 4], false, true);
      ligneH(c, repere, couleurs, -230, "", [1.5, 4]);
    },
  });
  if (traceur) {
    ressources.push(traceur);
    traceur.definirMesures([
      { nom: "Taux de conduction", valeur: "0,6" },
      { nom: "Valeur efficace", valeur: "178,2 V" },
      { nom: "Valeur moyenne", valeur: "0 V" },
      { nom: "Puissance moyenne", valeur: "300 W" },
    ]);
  }
}

/* --------------------------------------------------------------------------
   I. Simulation : ce que voient les deux appareils de mesure
   -------------------------------------------------------------------------- */

function construireAppareils(racine, api) {
  if (!racine.querySelector("#i-appareils-trace")) return;
  const etat = { forme: 2, beta: 120, i: 50 };
  let normal = { k: 1, st: null };

  function recalculer() {
    const brut = (theta) => courantBrut(etat.forme, theta, etat.beta);
    const st = statistiques(brut, 2 * Math.PI, 7200);
    const k = st.efficace > 0 ? etat.i / st.efficace : 0;
    normal = { k, st };
  }
  recalculer();

  const courant = (tms) => normal.k * courantBrut(etat.forme, (W50 * tms) / 1000, etat.beta);

  const traceur = api.sim.traceur("#i-appareils-trace", {
    titre: "Courant de ligne et lectures des appareils",
    genre: "Simulation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "i",
    yUnite: "A",
    xMin: 0,
    xMax: 40,
    yMin: -100,
    yMax: 100,
    ratio: 0.46,
    echantillons: 1600,
    series: [{ id: "i", nom: "courant de ligne i(t)", couleur: "serie-1", epaisseur: 2.6, fonction: courant }],
    surDessin({ c, repere, couleurs }) {
      const lecture = FF_SINUS * normal.k * normal.st.moyenneAbs;
      const crete = normal.k * normal.st.crete;
      ligneH(c, repere, couleurs, etat.i, "efficace vraie", [7, 5], false);
      ligneH(c, repere, couleurs, -etat.i, "", [7, 5]);
      ligneH(c, repere, couleurs, lecture, "appareil à valeur moyenne", [1.5, 4], true, true);
      ligneH(c, repere, couleurs, -lecture, "", [1.5, 4]);
      ligneH(c, repere, couleurs, crete, "crête", [10, 4, 2, 4], false, true);
      ligneH(c, repere, couleurs, -crete, "", [10, 4, 2, 4]);
    },
  });
  if (traceur) ressources.push(traceur);

  const valeurs = api.sim.valeurs("#i-appareils-valeurs", [
    { id: "forme", libelle: "Forme du courant", format: (v) => NOMS_COURANTS[v] || "" },
    { id: "vraie", libelle: "Lecture TRMS, valeur efficace vraie", unite: "A", decimales: 1 },
    { id: "lecture", libelle: "Lecture d'un appareil à valeur moyenne", unite: "A", decimales: 1 },
    { id: "ecart", libelle: "Écart de l'appareil à valeur moyenne", unite: "%", decimales: 1 },
    { id: "crete", libelle: "Valeur crête", unite: "A", decimales: 1 },
    { id: "fc", libelle: "Facteur de crête Fc", decimales: 3 },
    { id: "ff", libelle: "Facteur de forme Ff", decimales: 3 },
    { id: "pertes", libelle: "Pertes Joule estimées avec la lecture moyenne, en part des pertes vraies", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher() {
    recalculer();
    const moyenneAbs = normal.k * normal.st.moyenneAbs;
    const crete = normal.k * normal.st.crete;
    const lecture = FF_SINUS * moyenneAbs;
    if (traceur) {
      traceur.definirPlage({ yMin: -Math.max(crete, etat.i) * 1.18, yMax: Math.max(crete, etat.i) * 1.18 });
      traceur.definirFonction("i", courant);
    }
    if (valeurs) {
      valeurs.maj({
        forme: etat.forme,
        vraie: etat.i,
        lecture,
        ecart: (lecture / etat.i - 1) * 100,
        crete,
        fc: crete / etat.i,
        ff: etat.i / moyenneAbs,
        pertes: (lecture / etat.i) ** 2 * 100,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-appareils-curseurs",
    [
      { id: "forme", libelle: "Forme du courant", min: 1, max: 6, pas: 1, valeur: etat.forme, format: (v) => NOMS_COURANTS[Math.round(v)] },
      { id: "beta", libelle: "Largeur de conduction β (créneaux et impulsions)", min: 30, max: 180, pas: 5, valeur: etat.beta, unite: "°" },
      { id: "i", libelle: "Valeur efficace vraie visée", min: 10, max: 100, pas: 1, valeur: etat.i, unite: "A" },
    ],
    (lues) => {
      etat.forme = Math.round(lues.forme);
      etat.beta = lues.beta;
      etat.i = lues.i;
      afficher();
    }
  );
  if (curseurs) ressources.push(curseurs);
  afficher();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/** Dessin de l'oscillogramme de l'exercice de lecture : u en trait plein, i en tirets, retard de 4 ms. */
function dessinOscillogramme() {
  const x = (tms) => 50 + (500 * tms) / 30;
  const w = (2 * Math.PI) / 20;
  const u = cheminCourbe(240, (k) => x((30 * k) / 240), (k) => 160 - 100 * Math.sin(w * ((30 * k) / 240)));
  const i = cheminCourbe(240, (k) => x((30 * k) / 240), (k) => 160 - 70 * Math.sin(w * ((30 * k) / 240) - (72 * Math.PI) / 180));
  return (
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.6"><path d="M50 160H560M50 270V50"/></g>' +
    '<path d="' + u + '" stroke="currentColor" stroke-width="2.6" fill="none"/>' +
    '<path d="' + i + '" stroke="currentColor" stroke-width="2.2" fill="none" stroke-dasharray="9 6"/>' +
    '<g stroke="currentColor" stroke-width="1" fill="none" stroke-dasharray="3 4" opacity="0.7">' +
    '<path d="M383.3 160V282M450 160V282"/><path d="M283.3 160V302M383.3 282V302"/><path d="M133.3 60V28M200 90V28"/></g>' +
    '<g stroke="currentColor" stroke-width="1.6" fill="none">' +
    '<path d="M383.3 276H450"/><path d="M383.3 271v10M450 271v10"/>' +
    '<path d="M283.3 298H383.3"/><path d="M283.3 293v10M383.3 293v10"/>' +
    '<path d="M133.3 30H200"/><path d="M133.3 25v10M200 25v10"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13" font-weight="600">' +
    '<text x="416.7" y="268" text-anchor="middle">A</text><text x="333.3" y="290" text-anchor="middle">B</text><text x="166.7" y="22" text-anchor="middle">C</text></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
    '<text x="58" y="250">u : trait plein ; i : tirets</text><text x="560" y="176" text-anchor="end">t</text></g>'
  );
}

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : tension crête du réseau entre phases, au réseau haut. */
  const creteHaute = 1.1 * 400 * Math.SQRT2;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-crete",
      titre: "Tension crête entre phases au réseau haut",
      niveau: "fondamental",
      enonce:
        "<p>Le réseau du site fournit $400\\ \\mathrm{V}$ efficaces entre phases, avec une tolérance de $+10\\ \\%$. Quelle est la valeur crête maximale de la tension entre phases, celle que doivent supporter les condensateurs du bus continu du variateur ?</p>",
      valeur: creteHaute,
      unite: "V",
      tolerance: 0.01,
      libelleChamp: "Valeur crête $U_{m,\\max}$",
      etapes: [
        { texte: "Tension efficace maximale : $U_{\\max} = 1{,}1 \\times 400 = 440\\ \\mathrm{V}$." },
        { texte: "La tension du réseau est sinusoïdale : $U_m = U\\sqrt{2}$." },
        { texte: "$U_{m,\\max} = 440 \\times 1{,}4142 = 622{,}3\\ \\mathrm{V}$." },
        { texte: "Contrôle : $565{,}7\\ \\mathrm{V}$ au nominal, plus $10\\ \\%$ ; c'est sous la tenue de $900\\ \\mathrm{V}$ des deux étages série du bus.", note: "Oublier $\\sqrt{2}$ ferait choisir des condensateurs de $450\\ \\mathrm{V}$ en un seul étage : ils claqueraient." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Tension entre phases au réseau haut",
          yTitre: "u",
          yUnite: "V",
          xMin: 0,
          xMax: 40,
          yMin: -700,
          yMax: 700,
          series: [{ id: "u", nom: "u(t) = 622,3 sin(314,16 t)", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => creteHaute * Math.sin((W50 * t) / 1000) }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 440, "valeur efficace 440 V", [7, 5], true, true);
            marquerPoint(c, repere, couleurs, 5, creteHaute, "crête 622,3 V", false);
          },
        });
      },
    })
  );

  /* Fondamental 2 : lecture d'une expression. */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-expression",
      titre: "Lire une expression temporelle",
      niveau: "fondamental",
      enonce: "<p>Une tension s'écrit $u(t) = 17\\cos(1\\,000\\,t - \\pi/3)$, en volts et en secondes. Quelles affirmations sont exactes ?</p>",
      options: [
        { texte: "Son amplitude vaut $17\\ \\mathrm{V}$ et sa valeur efficace $12{,}0\\ \\mathrm{V}$.", juste: true },
        { texte: "Sa fréquence vaut $1\\,000\\ \\mathrm{Hz}$." },
        { texte: "Sa période vaut $6{,}28\\ \\mathrm{ms}$.", juste: true },
        { texte: "Elle est en avance de $60^\\circ$ sur $17\\cos(1\\,000\\,t)$." },
        { texte: "Sa valeur moyenne est nulle.", juste: true },
      ],
      etapes: [
        { texte: "Amplitude : le coefficient du cosinus, $U_m = 17\\ \\mathrm{V}$ ; sinusoïde pure, donc $U = 17/\\sqrt{2} = 12{,}02\\ \\mathrm{V}$." },
        { texte: "Le coefficient de $t$ est la pulsation : $\\omega = 1\\,000\\ \\mathrm{rad/s}$, donc $f = 1\\,000/(2\\pi) = 159{,}2\\ \\mathrm{Hz}$ et non $1\\,000\\ \\mathrm{Hz}$." },
        { texte: "Période : $T = 2\\pi/\\omega = 6{,}283\\ \\mathrm{ms}$." },
        { texte: "La phase à l'origine vaut $-\\pi/3$ : la tension atteint son maximum $\\Delta t = (\\pi/3)/1\\,000 = 1{,}047\\ \\mathrm{ms}$ après la référence. Elle est en retard de $60^\\circ$, pas en avance.", note: "Signe moins dans la phase : retard." },
        { texte: "Sinusoïde sans composante continue : moyenne nulle." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "La tension et sa référence de phase nulle",
          yTitre: "u",
          yUnite: "V",
          xMin: 0,
          xMax: 12.57,
          yMin: -20,
          yMax: 22,
          series: [
            { id: "r", nom: "référence 17 cos(1000 t)", couleur: "serie-4", epaisseur: 1.8, fonction: (t) => 17 * Math.cos(t) },
            { id: "u", nom: "u(t) = 17 cos(1000 t - π/3)", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => 17 * Math.cos(t - Math.PI / 3) },
          ],
          surDessin({ c, repere, couleurs }) {
            doubleFleche(c, repere, couleurs, 6.283, 6.283 + 1.047, 19, "retard 1,05 ms");
            ligneH(c, repere, couleurs, 12.02, "U = 12,0 V", [7, 5], true, true);
          },
        });
      },
    })
  );

  /* Intermédiaire 1 : lecture de schéma, points homologues. */
  ressources.push(
    api.exercice.schema(cible, {
      id: "k-homologues",
      titre: "Mesurer un déphasage sur un oscillogramme",
      niveau: "intermédiaire",
      consigne: "Cliquez sur tous les intervalles qui permettent de mesurer correctement le décalage Δt entre u et i.",
      enonce:
        "<p>L'oscillogramme montre une tension $u$ et un courant $i$ de même fréquence, $50\\ \\mathrm{Hz}$ ; l'écran couvre $30\\ \\mathrm{ms}$ sur toute sa largeur. Trois intervalles sont proposés : $A$, $B$ et $C$. Sélectionnez ceux qui conviennent, puis validez ; la correction calcule le déphasage.</p>",
      viewBox: "0 0 600 325",
      description: "Oscillogramme : u en trait plein, i en tirets ; intervalle A entre passages par zéro en montant, intervalle B entre un passage montant de u et un passage descendant de i, intervalle C entre les maxima",
      dessin: dessinOscillogramme(),
      zones: [
        { x: 376, y: 252, largeur: 82, hauteur: 32, etiquette: "intervalle A", juste: true },
        { x: 276, y: 284, largeur: 114, hauteur: 30, etiquette: "intervalle B" },
        { x: 126, y: 8, largeur: 82, hauteur: 32, etiquette: "intervalle C", juste: true },
      ],
      etapes: [
        { texte: "Le décalage se mesure entre deux points homologues : même valeur, même sens de variation." },
        { texte: "$A$ relie deux passages par zéro en montant, de $u$ puis de $i$ : il convient, et c'est la lecture la plus précise, car les courbes y sont les plus raides." },
        { texte: "$C$ relie les deux maxima : il convient aussi, mais il est moins précis, car les courbes sont plates au sommet." },
        { texte: "$B$ relie un passage montant de $u$ à un passage descendant de $i$ : il mesure $\\Delta t + T/2$, donc un angle faux de $180^\\circ$." },
        { texte: "Sur $A$ : $\\Delta t = 4\\ \\mathrm{ms}$, donc $\\varphi = 360^\\circ \\times 4/20 = 72^\\circ$ ; $i$ passe par zéro après $u$ : courant en retard, $\\varphi > 0$.", note: "Le déphasage ne dépend pas de l'intervalle homologue choisi : $C$ donne aussi $4\\ \\mathrm{ms}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Lecture correcte : 4 ms, soit 72°",
          yTitre: "valeurs relatives",
          xMin: 0,
          xMax: 30,
          yMin: -1.25,
          yMax: 1.3,
          series: [
            { id: "u", nom: "u, référence", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => Math.sin((2 * Math.PI * t) / 20) },
            { id: "i", nom: "i, en retard de 72°", couleur: "serie-4", epaisseur: 2.2, fonction: (t) => 0.7 * Math.sin((2 * Math.PI * t) / 20 - (72 * Math.PI) / 180) },
          ],
          surDessin({ c, repere, couleurs }) {
            doubleFleche(c, repere, couleurs, 20, 24, -0.4, "Δt = 4 ms");
            doubleFleche(c, repere, couleurs, 5, 9, 1.15, "4 ms");
          },
        });
      },
    })
  );

  /* Intermédiaire 2 : valeur efficace d'une commande modulée. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-modulation",
      titre: "Résistance commandée par modulation de largeur d'impulsion",
      niveau: "intermédiaire",
      enonce:
        "<p>Un réchauffage de $11{,}52\\ \\Omega$, soit $50\\ \\mathrm{W}$ sous $24\\ \\mathrm{V}$, est commandé par un transistor qui applique $24\\ \\mathrm{V}$ pendant $25\\ \\%$ de chaque période de $1\\ \\mathrm{ms}$, et $0\\ \\mathrm{V}$ le reste du temps. Quelle est la valeur efficace de la tension appliquée ? Déduisez-en la puissance moyenne.</p>",
      valeur: 12,
      unite: "V",
      tolerance: 0.01,
      libelleChamp: "Valeur efficace $U$",
      etapes: [
        { texte: "Valeur moyenne : $\\langle u \\rangle = \\alpha U_m = 0{,}25 \\times 24 = 6\\ \\mathrm{V}$." },
        { texte: "Valeur efficace : $U^2 = \\dfrac{1}{T}\\int_0^{\\alpha T} 24^2\\,\\mathrm{d}t = \\alpha \\times 576 = 144\\ \\mathrm{V^2}$, d'où $U = \\sqrt{\\alpha}\\,U_m = 12\\ \\mathrm{V}$." },
        { texte: "Puissance moyenne : $P = U^2/R = 144/11{,}52 = 12{,}5\\ \\mathrm{W}$, soit $\\alpha \\times 50\\ \\mathrm{W}$." },
        { texte: "Le calcul faux $\\langle u \\rangle^2/R = 36/11{,}52 = 3{,}1\\ \\mathrm{W}$ sous-estime la puissance d'un facteur $4 = 1/\\alpha$.", note: "La puissance d'une commande modulée est proportionnelle au rapport cyclique, pas à son carré." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Commande modulée de rapport cyclique 0,25",
          yTitre: "u",
          yUnite: "V",
          xMin: 0,
          xMax: 3,
          yMin: -2,
          yMax: 28,
          series: [{ id: "u", nom: "u(t), 0 ou 24 V", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => ((((t % 1) + 1) % 1) < 0.25 ? 24 : 0) }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 12, "efficace 12 V", [7, 5], false);
            ligneH(c, repere, couleurs, 6, "moyenne 6 V", [1.5, 4], true);
          },
        });
      },
    })
  );

  /* Avancé : valeur efficace d'un courant composé. */
  const effCompose = Math.sqrt(40 * 40 + 12 * 12 + 8 * 8);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-compose",
      titre: "Courant composé d'un fondamental et d'harmoniques",
      niveau: "avancé",
      enonce:
        "<p>Un analyseur indique que le courant d'une ligne contient un fondamental à $50\\ \\mathrm{Hz}$ de $40\\ \\mathrm{A}$ efficaces, une composante à $250\\ \\mathrm{Hz}$ de $12\\ \\mathrm{A}$ efficaces et une composante à $350\\ \\mathrm{Hz}$ de $8\\ \\mathrm{A}$ efficaces. Quelle est la valeur efficace vraie du courant ? De combien les pertes Joule du câble dépassent-elles celles du seul fondamental ?</p>",
      valeur: effCompose,
      unite: "A",
      tolerance: 0.01,
      libelleChamp: "Valeur efficace $I$",
      etapes: [
        { texte: "Les trois composantes ont des fréquences distinctes, multiples de $50\\ \\mathrm{Hz}$ : leurs produits croisés ont une moyenne nulle sur $20\\ \\mathrm{ms}$." },
        { texte: "Somme des carrés : $I^2 = 40^2 + 12^2 + 8^2 = 1\\,600 + 144 + 64 = 1\\,808\\ \\mathrm{A^2}$." },
        { texte: "$I = \\sqrt{1\\,808} = 42{,}52\\ \\mathrm{A}$, et non $40 + 12 + 8 = 60\\ \\mathrm{A}$." },
        { texte: "Pertes : rapport $1\\,808/1\\,600 = 1{,}13$, soit $13\\ \\%$ de plus que pour le fondamental seul.", note: "La valeur crête, elle, dépend des phases des harmoniques : la valeur efficace ne suffit pas à la connaître." },
      ],
      visuelCorrection(conteneur, moteur) {
        const w = (2 * Math.PI) / 20;
        traceCorrection(moteur, conteneur, {
          titre: "Courant composé et son fondamental",
          yTitre: "i",
          yUnite: "A",
          xMin: 0,
          xMax: 40,
          yMin: -95,
          yMax: 95,
          series: [
            { id: "f", nom: "fondamental seul, 40 A efficaces", couleur: "serie-4", epaisseur: 1.8, fonction: (t) => 40 * Math.SQRT2 * Math.sin(w * t) },
            {
              id: "i",
              nom: "courant composé, 42,52 A efficaces",
              couleur: "serie-1",
              epaisseur: 2.6,
              fonction: (t) => Math.SQRT2 * (40 * Math.sin(w * t) + 12 * Math.sin(5 * w * t) + 8 * Math.sin(7 * w * t)),
            },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, effCompose, "efficace 42,5 A", [7, 5], false, true);
            ligneH(c, repere, couleurs, -effCompose, "", [7, 5]);
          },
        });
      },
    })
  );

  /* Diagnostic industriel : deux pinces en désaccord. */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Deux pinces ampèremétriques en désaccord",
      niveau: "diagnostic",
      enonce:
        "<p>Sur le câble d'arrivée du variateur de la pompe, une pince ordinaire lit $45\\ \\mathrm{A}$, une pince marquée TRMS lit $50\\ \\mathrm{A}$, sur la même phase et au même moment. Quelles conclusions sont justifiées ?</p>",
      options: [
        { texte: "Le courant n'est pas sinusoïdal ; la pince TRMS donne la valeur qui fixe l'échauffement du câble.", juste: true },
        { texte: "L'écart de $10\\ \\%$ est compatible avec un courant en créneaux de $120^\\circ$, pour lequel l'appareil à valeur moyenne lit $9{,}3\\ \\%$ trop bas.", juste: true },
        { texte: "La pince ordinaire est défectueuse et doit être remplacée." },
        { texte: "Il suffit de multiplier la lecture ordinaire par $1{,}111$ pour retrouver la valeur vraie, quelle que soit la forme d'onde." },
        { texte: "Les pertes du câble calculées avec $45\\ \\mathrm{A}$ seraient sous-estimées d'environ $19\\ \\%$.", juste: true },
      ],
      etapes: [
        { texte: "Sur une sinusoïde pure, les deux pinces seraient d'accord : leur désaccord signale une forme d'onde déformée, ce qu'absorbe un pont de diodes." },
        { texte: "Créneaux de $120^\\circ$ : $F_f = 1{,}225$, lecture moyenne $1{,}111/1{,}225 = 0{,}907$ fois la vraie, soit $45{,}3\\ \\mathrm{A}$ pour $50\\ \\mathrm{A}$." },
        { texte: "La pince ordinaire fonctionne comme prévu : elle mesure $\\langle |i| \\rangle$ et multiplie déjà par $1{,}111$ ; aucun coefficient fixe ne corrige toutes les formes, puisque l'erreur change de signe selon la forme." },
        { texte: "Pertes : $(45/50)^2 = 0{,}81$, donc $19\\ \\%$ de sous-estimation avec la lecture de $45\\ \\mathrm{A}$.", note: "Règle du site : toute mesure de courant en valeur efficace vraie." },
      ],
      visuelCorrection(conteneur, moteur) {
        const id = 50 / Math.sqrt(2 / 3);
        traceCorrection(moteur, conteneur, {
          titre: "Même valeur efficace, formes différentes",
          yTitre: "i",
          yUnite: "A",
          xMin: 0,
          xMax: 40,
          yMin: -85,
          yMax: 85,
          series: [
            { id: "s", nom: "sinusoïde de 50 A efficaces", couleur: "serie-4", epaisseur: 1.8, fonction: (t) => 50 * Math.SQRT2 * Math.sin((W50 * t) / 1000) },
            { id: "c", nom: "créneaux de 120°, 50 A efficaces", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => id * courantBrut(2, (W50 * t) / 1000, 120) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 50, "50 A efficaces", [7, 5], false, true);
            ligneH(c, repere, couleurs, 45.3, "lecture moyenne 45,3 A", [1.5, 4], true, true);
          },
        });
      },
    })
  );

  /* Conceptuel : pourquoi la valeur efficace. */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Pourquoi la valeur efficace ?",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi c'est la valeur efficace d'un courant alternatif, et non sa valeur moyenne ni sa valeur crête, qui sert à choisir la section d'un câble ou le calibre d'un fusible.</p>",
      motsCles: [
        ["echauffement", "chaleur", "joule", "thermique", "chauffe"],
        ["carre", "i2", "i²", "ri2", "ri²", "quadrat"],
        ["moyenne nulle", "nulle", "zero", "s'annule"],
        ["crete", "instant", "pointe", "bref"],
      ],
      minimum: 3,
      exemple: "Trois phrases : l'effet qui limite un câble, la grandeur qui le produit, et ce que valent moyenne et crête.",
      etapes: [
        { texte: "Ce qui limite un câble ou un fusible est l'échauffement, produit par l'effet Joule : $p = Ri^2$, toujours positif." },
        { texte: "L'échauffement moyen dépend donc de la moyenne de $i^2$, c'est-à-dire du carré de la valeur efficace : $P = RI^2$." },
        { texte: "La valeur moyenne d'un courant alternatif est nulle : elle ne dit rien de l'échauffement." },
        { texte: "La valeur crête n'est atteinte qu'un bref instant ; l'inertie thermique moyenne la puissance sur de nombreuses périodes.", note: "La crête reste décisive pour l'isolement et pour les composants à faible inertie thermique, comme les semi-conducteurs." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Le courant change de signe, sa puissance non",
          yTitre: "valeurs relatives",
          xMin: 0,
          xMax: 40,
          yMin: -1.2,
          yMax: 1.2,
          series: [
            { id: "i", nom: "i(t) / Im", couleur: "serie-4", epaisseur: 1.8, fonction: (t) => Math.sin((W50 * t) / 1000) },
            { id: "p", nom: "p(t) / (R Im²) = sin²", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => Math.sin((W50 * t) / 1000) ** 2 },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 0.5, "puissance moyenne : moitié de la crête", [7, 5], false, true);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

/** Dessin de la question de quiz : deux sinusoïdes numérotées. */
function dessinAvance() {
  const x = (tms) => 50 + (500 * tms) / 30;
  const w = (2 * Math.PI) / 20;
  const c1 = cheminCourbe(240, (k) => x((30 * k) / 240), (k) => 150 - 95 * Math.sin(w * ((30 * k) / 240) - (40 * Math.PI) / 180));
  const c2 = cheminCourbe(240, (k) => x((30 * k) / 240), (k) => 150 - 70 * Math.sin(w * ((30 * k) / 240) + (30 * Math.PI) / 180));
  return (
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.6"><path d="M50 150H560M50 255V45"/></g>' +
    '<path d="' + c1 + '" stroke="currentColor" stroke-width="2.6" fill="none"/>' +
    '<path d="' + c2 + '" stroke="currentColor" stroke-width="2.2" fill="none" stroke-dasharray="9 6"/>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
    '<text x="215" y="44" text-anchor="middle">courbe 1, trait plein</text>' +
    '<text x="105" y="270" text-anchor="middle">courbe 2, tirets</text>' +
    '<text x="560" y="166" text-anchor="end">t</text></g>'
  );
}

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Dans $u(t) = U_m\\cos(\\omega t + \\varphi)$, quelle est l'unité de $\\omega$ ?</p>",
        options: ["Le hertz", "Le radian par seconde", "La seconde", "Le degré"],
        bonnes: [1],
        explication: "$\\omega t$ doit être un angle en radians : $\\omega$ est en $\\mathrm{rad/s}$. La fréquence $f = \\omega/(2\\pi)$ est en hertz.",
        resume: "Unité de la pulsation",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Un signal carré symétrique qui vaut alternativement $+U_m$ et $-U_m$ a une valeur efficace égale à $U_m$.</p>",
        reponse: true,
        explication: "$u^2 = U_m^2$ à chaque instant, donc $\\langle u^2 \\rangle = U_m^2$ et $U = U_m$ : facteur de crête égal à $1$.",
        resume: "Efficace d'un carré",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la valeur crête de la tension d'une prise de $230\\ \\mathrm{V}$, en volts ?</p>",
        valeur: 230 * Math.SQRT2,
        unite: "V",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$U_m = 230\\sqrt{2} = 325{,}3\\ \\mathrm{V}$ : les $230\\ \\mathrm{V}$ sont une valeur efficace.",
        resume: "Crête du réseau",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la période d'un réseau à $60\\ \\mathrm{Hz}$, en millisecondes ?</p>",
        valeur: 1000 / 60,
        unite: "ms",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$T = 1/60 = 16{,}67\\ \\mathrm{ms}$.",
        resume: "Période à 60 Hz",
      },
      {
        type: "courte",
        enonce: "<p>Que mesure réellement un multimètre ordinaire, non TRMS, en position alternative, et pourquoi se trompe-t-il sur un signal déformé ?</p>",
        motsCles: [["moyenne", "redress"], ["1,11", "1.11", "facteur de forme", "sinus"], ["forme", "deform", "non sinus"]],
        minimum: 2,
        explication:
          "Il mesure la valeur moyenne redressée et la multiplie par $1{,}111$, facteur de forme de la sinusoïde : le résultat n'est juste que si le signal a ce facteur de forme.",
        resume: "Appareil à valeur moyenne",
      },
      {
        type: "qcm",
        enonce: "<p>À $50\\ \\mathrm{Hz}$, le courant passe par zéro en montant $5\\ \\mathrm{ms}$ après la tension. Comment qualifier les deux grandeurs ?</p>",
        options: ["En phase", "En quadrature, courant en retard", "En quadrature, courant en avance", "En opposition de phase"],
        bonnes: [1],
        explication: "$\\varphi = 360^\\circ \\times 5/20 = 90^\\circ$ : quadrature ; le courant vient après, il est en retard.",
        resume: "Quadrature",
      },
      {
        type: "vraiFaux",
        enonce: "<p>La valeur efficace de la somme d'une sinusoïde à $50\\ \\mathrm{Hz}$ de $10\\ \\mathrm{V}$ efficaces et d'une sinusoïde à $150\\ \\mathrm{Hz}$ de $10\\ \\mathrm{V}$ efficaces vaut $20\\ \\mathrm{V}$.</p>",
        reponse: false,
        explication: "Fréquences distinctes : $U = \\sqrt{10^2 + 10^2} = 14{,}1\\ \\mathrm{V}$. Les valeurs efficaces ne s'additionnent pas.",
        resume: "Somme de composantes",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la valeur moyenne d'une tension sinusoïdale d'amplitude $100\\ \\mathrm{V}$ redressée en double alternance, en volts ?</p>",
        valeur: 200 / Math.PI,
        unite: "V",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$\\langle u \\rangle = 2U_m/\\pi = 200/\\pi = 63{,}66\\ \\mathrm{V}$.",
        resume: "Moyenne redressée",
      },
      {
        type: "schema",
        enonce: "<p>Les deux sinusoïdes ont la même fréquence. Laquelle est en avance sur l'autre ?</p>",
        consigne: "Cliquez sur l'étiquette de la courbe en avance.",
        viewBox: "0 0 600 285",
        description: "Deux sinusoïdes de même fréquence : courbe 1 en trait plein, courbe 2 en tirets",
        dessin: dessinAvance(),
        zones: [
          { x: 130, y: 28, largeur: 170, hauteur: 24, etiquette: "courbe 1" },
          { x: 40, y: 254, largeur: 130, hauteur: 24, etiquette: "courbe 2", juste: true },
        ],
        explication:
          "La courbe 2 atteint son maximum et passe par zéro en montant avant la courbe 1 : elle est en avance, ici de $70^\\circ$, soit $3{,}9\\ \\mathrm{ms}$ à $50\\ \\mathrm{Hz}$.",
        resume: "Lecture de l'avance",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est le facteur de crête d'un signal triangulaire symétrique ?</p>",
        valeur: Math.sqrt(3),
        unite: "",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$U = U_m/\\sqrt{3}$, donc $F_c = U_m/U = \\sqrt{3} = 1{,}732$.",
        resume: "Facteur de crête du triangle",
      },
    ],
    { titre: "Dix questions sur les signaux périodiques" }
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
      { categorie: "Définition", question: "Quelles relations lient période, fréquence et pulsation ?", reponse: "$f = 1/T$ en hertz, $\\omega = 2\\pi f = 2\\pi/T$ en $\\mathrm{rad/s}$. À $50\\ \\mathrm{Hz}$ : $20\\ \\mathrm{ms}$ et $314{,}16\\ \\mathrm{rad/s}$." },
      { categorie: "Définition", question: "Comment définit-on la valeur moyenne d'un signal périodique ?", reponse: "$\\langle u \\rangle = \\tfrac{1}{T}\\int_0^T u\\,\\mathrm{d}t$ : aire algébrique sur une période divisée par $T$ ; c'est la composante continue." },
      { categorie: "Définition", question: "Comment définit-on la valeur efficace ?", reponse: "$U = \\sqrt{\\tfrac{1}{T}\\int_0^T u^2\\,\\mathrm{d}t}$ : la tension continue qui produirait le même échauffement dans une résistance." },
      { categorie: "Sinusoïde", question: "Valeur efficace, crête et moyenne redressée d'une sinusoïde d'amplitude Um ?", reponse: "$U = U_m/\\sqrt{2} = 0{,}707\\,U_m$ ; crête $U_m$ ; moyenne redressée $2U_m/\\pi = 0{,}637\\,U_m$ ; moyenne $0$." },
      { categorie: "Repère", question: "Valeurs crêtes du réseau 230/400 V ?", reponse: "$325{,}3\\ \\mathrm{V}$ entre phase et neutre, $565{,}7\\ \\mathrm{V}$ entre phases ; $357{,}8$ et $622{,}3\\ \\mathrm{V}$ au réseau $+10\\ \\%$." },
      { categorie: "Somme", question: "Valeur efficace d'une somme de composantes de fréquences différentes ?", reponse: "$U^2 = U_0^2 + U_1^2 + U_2^2 + \\dots$ : on additionne les carrés, jamais les valeurs efficaces." },
      { categorie: "Déphasage", question: "Comment mesurer un déphasage sur un oscillogramme ?", reponse: "$\\Delta t$ entre deux passages de même sens par la valeur moyenne, puis $\\varphi = 360^\\circ \\times \\Delta t/T$ ; courant après la tension : courant en retard, $\\varphi > 0$." },
      { categorie: "Forme", question: "Que sont le facteur de crête et le facteur de forme ?", reponse: "$F_c = U_{\\max}/U$ ($1{,}414$ pour la sinusoïde) et $F_f = U/\\langle |u| \\rangle$ ($1{,}111$ pour la sinusoïde)." },
      { categorie: "Modulation", question: "Valeur efficace d'un rectangle 0 ou Um de rapport cyclique α ?", reponse: "$U = \\sqrt{\\alpha}\\,U_m$ et $\\langle u \\rangle = \\alpha U_m$ : la puissance dans une résistance vaut $\\alpha U_m^2/R$." },
      {
        categorie: "Industriel",
        question: "Pourquoi mesurer le courant d'un variateur avec un appareil TRMS ?",
        reponse: "Son courant n'est pas sinusoïdal : un appareil à valeur moyenne lit $9{,}3\\ \\%$ trop bas pour des créneaux de $120^\\circ$, et plus de $40\\ \\%$ pour des impulsions étroites.",
        rappel: "Départ pompe : 50 A vrais, 45,3 A lus, pertes de câble estimées à 674 W au lieu de 820 W.",
      },
    ],
    { titre: "Dix cartes sur les signaux périodiques et sinusoïdes" }
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
        enonce: "<p>Quelle est la valeur efficace de $u(t) = 12 + 5\\sqrt{2}\\,\\sin\\omega t$, en volts ?</p>",
        valeur: 13,
        unite: "V",
        tolerance: 0.01,
        chiffres: 1,
        explication: "Composante continue $12\\ \\mathrm{V}$, sinusoïde de $5\\ \\mathrm{V}$ efficaces : $U = \\sqrt{144 + 25} = 13\\ \\mathrm{V}$.",
        resume: "Continu plus alternatif (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>À $50\\ \\mathrm{Hz}$, deux sinusoïdes sont décalées de $2{,}5\\ \\mathrm{ms}$. Quel est leur déphasage, en degrés ?</p>",
        valeur: 45,
        unite: "°",
        tolerance: 0.01,
        chiffres: 0,
        explication: "$\\varphi = 360^\\circ \\times 2{,}5/20 = 45^\\circ$.",
        resume: "Déphasage (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Un multimètre non TRMS donne la valeur efficace exacte d'une tension sinusoïdale pure.</p>",
        reponse: true,
        explication: "Il mesure $\\langle |u| \\rangle$ et multiplie par $1{,}111$, facteur de forme de la sinusoïde : exact pour elle, faux pour les autres formes.",
        resume: "Appareil à valeur moyenne (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Dans l'interface de la sonde de l'armoire déportée, la résistance fixe de $10\\ \\mathrm{k\\Omega}$ est en parallèle sur la branche série du filtre de $10\\ \\mathrm{k\\Omega}$ et de l'entrée de $100\\ \\mathrm{k\\Omega}$. Quelle est la résistance équivalente $R_p$, en kilohms ?</p>",
        valeur: (10 * 110) / 120,
        unite: "kΩ",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$R_p = 10 \\parallel 110 = 10 \\times 110/120 = 9{,}167\\ \\mathrm{k\\Omega}$. Révisé du cours Révision 2 et mini-projet capteur.",
        resume: "Résistance équivalente (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Une CTN a $R_{25} = 10\\ \\mathrm{k\\Omega}$ et $B = 3\\,950\\ \\mathrm{K}$. Quelle est sa résistance à $50\\ ^\\circ\\mathrm{C}$, en kilohms ?</p>",
        valeur: 10 * Math.exp(3950 * (1 / 323.15 - 1 / 298.15)),
        unite: "kΩ",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$R = 10\\,\\exp[3\\,950\\,(1/323{,}15 - 1/298{,}15)] = 10\\,e^{-1{,}025} = 3{,}59\\ \\mathrm{k\\Omega}$. Révisé du cours Révision 2 et mini-projet capteur.",
        resume: "Loi de la CTN (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Un condensateur de $10\\ \\mu\\mathrm{F}$ est branché sur le réseau $230\\ \\mathrm{V}$. Quelle énergie stocke-t-il à l'instant où la tension passe par sa crête, en joules ?</p>",
        valeur: 0.5 * 10e-6 * RESEAU.um * RESEAU.um,
        unite: "J",
        tolerance: 0.02,
        chiffres: 3,
        explication: "$W = \\tfrac{1}{2}CU_m^2 = 0{,}5 \\times 10^{-5} \\times 325{,}3^2 = 0{,}529\\ \\mathrm{J}$, avec la crête et non la valeur efficace. Révisé du cours Condensateurs et champ électrique.",
        resume: "Énergie électrique (Condensateurs et champ électrique)",
      },
      {
        type: "calcul",
        enonce: "<p>Convertissez un déphasage de $32{,}4^\\circ$ en radians.</p>",
        valeur: (32.4 * Math.PI) / 180,
        unite: "rad",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$32{,}4 \\times \\pi/180 = 0{,}565\\ \\mathrm{rad}$. Révisé du cours Diagnostic initial et remise à niveau mathématique.",
        resume: "Degrés et radians (Diagnostic initial)",
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
    titre: "Où en suis-je sur les signaux périodiques et sinusoïdes ?",
  });
  if (auto) ressources.push(auto);
}
