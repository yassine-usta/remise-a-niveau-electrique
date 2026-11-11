/* ==========================================================================
   cours/convertisseurs-et-moteurs/cours.js
   Convertisseurs et moteurs : chaîne redresseur, bus continu, onduleur et
   moteur ; quatre quadrants ; machine asynchrone en génératrice ; énergie de
   freinage, réserve du bus, hacheur et résistance ; ralentissement de la
   pompe du projet fil rouge.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = 2 * Math.PI;
const RAC3 = Math.sqrt(3);

/* Moteur de la pompe du projet fil rouge (hypothèses déjà retenues). */
const POMPE = {
  Cn: 194.2,
  nn: 1475,
  Pn: 30,
  R1: 0.115,
  R2: 0.076,
  X1: 0.36,
  X2: 0.48,
  Xm: 11.5,
  p: 2,
  U0: 8,
};
const W_NOM = (POMPE.nn * TAU) / 60;
const K_POMPE = POMPE.Cn / (W_NOM * W_NOM);

/* --------------------------------------------------------------------------
   Modèles physiques
   -------------------------------------------------------------------------- */

const versRad = (n) => (n * TAU) / 60;
const versTrMin = (w) => (w * 60) / TAU;

/** Couple et puissances du moteur de la pompe par le schéma équivalent, loi U/f linéaire. */
function regimeAsynchrone(n, f) {
  const ns = (60 * f) / POMPE.p;
  const g = (ns - n) / ns;
  const U = f <= 50 ? POMPE.U0 + ((400 - POMPE.U0) * f) / 50 : 400;
  const V = U / RAC3;
  const r = f / 50;
  if (Math.abs(g) < 1e-9) {
    const zr = POMPE.R1;
    const zi = (POMPE.X1 + POMPE.Xm) * r;
    const m2 = zr * zr + zi * zi;
    const ir = (V * zr) / m2;
    const ii = (-V * zi) / m2;
    return { ns, g: 0, C: 0, P1: 3 * V * ir, I1: Math.hypot(ir, ii) };
  }
  /* Z2 = R2/g + j X2 r ; Zm = j Xm r ; Z = R1 + j X1 r + Z2 Zm / (Z2 + Zm) */
  const a2 = POMPE.R2 / g;
  const b2 = POMPE.X2 * r;
  const bm = POMPE.Xm * r;
  /* produit Z2 Zm = (a2 + j b2)(j bm) = -b2 bm + j a2 bm */
  const pr = -b2 * bm;
  const pi = a2 * bm;
  /* somme Z2 + Zm = a2 + j (b2 + bm) */
  const sr = a2;
  const si = b2 + bm;
  const s2 = sr * sr + si * si;
  const qr = (pr * sr + pi * si) / s2;
  const qi = (pi * sr - pr * si) / s2;
  const zr = POMPE.R1 + qr;
  const zi = POMPE.X1 * r + qi;
  const z2 = zr * zr + zi * zi;
  const i1r = (V * zr) / z2;
  const i1i = (-V * zi) / z2;
  const I1 = Math.hypot(i1r, i1i);
  /* I2 = I1 Zm / (Z2 + Zm) : module */
  const I2 = (I1 * bm) / Math.sqrt(s2);
  const Pg = (3 * I2 * I2 * POMPE.R2) / g;
  const ws = (TAU * f) / POMPE.p;
  return { ns, g, C: Pg / ws, P1: 3 * V * i1r, I1 };
}

/**
 * Ralentissement de la pompe : équation mécanique, limite de couple et bilan
 * d'énergie du bus, intégrés par pas de 0,1 ms.
 * mode : 0 sans dispositif, 1 régulateur de surtension, 2 hacheur et résistance.
 */
function simulerFreinage(r) {
  const dt = 1e-4;
  const J = r.J;
  const C = 2.2e-3;
  const E0 = 540;
  const Eon = 760;
  const Emax = 800;
  const eta = 0.92;
  const Tlim = 1.5 * POMPE.Cn;
  const w0 = versRad(1475);
  const wc = versRad(Math.min(r.n1, 1474));
  const a = (w0 - wc) / r.Tr;
  const tFin = Math.min(9, Math.max(0.6, 1.5 * r.Tr + 0.3));
  let w = w0;
  let ref = w0;
  let E = E0;
  let t = 0;
  let declenche = null;
  let Ebus = 0;
  let ER = 0;
  let Emaxi = E0;
  let atteint = null;
  const pas = Math.max(1, Math.round(tFin / dt / 600));
  const echantillons = [];
  let k = 0;
  while (t <= tFin + 1e-12) {
    let refn = Math.max(wc, ref - a * dt);
    let Tm = (J * (refn - w)) / dt + K_POMPE * w * w;
    Tm = Math.max(-Tlim, Math.min(Tlim, Tm));
    if (declenche !== null) Tm = 0;
    let P = Tm < 0 ? -Tm * w * eta : 0;
    if (r.mode === 1 && E >= Eon && P > 0) {
      Tm = 0;
      P = 0;
      refn = w;
    }
    let PR = 0;
    if (r.mode === 2 && E >= Eon) PR = Math.min(P, (E * E) / r.R);
    /* En moteur, le bus se vide d'abord dans l'onduleur, puis le pont reprend à E0. */
    const Pconso = Tm > 0 && E > E0 ? (Tm * w) / eta : 0;
    if (P > 0 || PR > 0 || Pconso > 0) E = Math.sqrt(Math.max(E * E + (2 * (P - PR - Pconso) * dt) / C, 0));
    if (E < E0) E = E0;
    Ebus += P * dt;
    ER += PR * dt;
    if (E > Emaxi) Emaxi = E;
    if (r.mode === 0 && declenche === null && E >= Emax) declenche = t;
    if (k % pas === 0) echantillons.push({ t, n: versTrMin(w), ref: versTrMin(ref), Tm, P, E, PR });
    w += ((Tm - K_POMPE * w * w) / J) * dt;
    if (w < 0) w = 0;
    if (atteint === null && w <= wc + 1e-3) atteint = t;
    ref = refn;
    t += dt;
    k += 1;
  }
  return { echantillons, tFin, declenche, Ebus, ER, Emaxi, atteint, Wc: 0.5 * J * (w0 * w0 - wc * wc) };
}

/* --------------------------------------------------------------------------
   Utilitaires de dessin
   -------------------------------------------------------------------------- */

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function nb(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
}

function marqueur(id) {
  return (
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto-start-reverse">' +
    '<path d="M0 0 10 5 0 10Z" fill="currentColor"/></marker>'
  );
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

function fleche(x1, y1, x2, y2, id, attributs = "") {
  return '<path d="M' + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + x2.toFixed(1) + " " + y2.toFixed(1) + '" marker-end="url(#' + id + ')"' + attributs + "/>";
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';

function ligneH(c, repere, couleurs, y, libelle, motif = [7, 5]) {
  const py = repere.versY(y);
  c.save();
  c.setLineDash(motif);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.3;
  c.beginPath();
  c.moveTo(repere.boite.x, py);
  c.lineTo(repere.boite.x + repere.boite.l, py);
  c.stroke();
  c.setLineDash([]);
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
    c.textAlign = "right";
    c.fillText(libelle, repere.boite.x + repere.boite.l - 4, py - 6);
  }
  c.restore();
}

function ligneV(c, repere, couleurs, x, libelle, motif = [2, 4]) {
  const px = repere.versX(x);
  c.save();
  c.setLineDash(motif);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(px, repere.boite.y);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  c.setLineDash([]);
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
    const aGauche = px > repere.boite.x + repere.boite.l * 0.62;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

function pointRepere(c, repere, couleurs, x, y, libelle) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.fillStyle = couleurs.accent;
  c.beginPath();
  c.arc(px, py, 5, 0, TAU);
  c.fill();
  if (libelle) {
    c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
    c.fillStyle = couleurs.texte;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.62;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -9 : 9), py - 9);
  }
  c.restore();
}

function traceCorrection(moteurApi, conteneur, options) {
  const traceur = moteurApi.sim.traceur(conteneur, { genre: "Correction visuelle", ratio: 0.42, echantillons: 600, ...options });
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
function dessinEtapes(lignes, largeur = 600) {
  const hauteur = 30 + lignes.length * 22;
  return (
    TRAITS + ' stroke-width="1.4"><rect x="6" y="6" width="' + (largeur - 12) + '" height="' + (hauteur - 12) + '" rx="8"/></g>' +
    ECRITS + lignes.map((ligne, i) => texte(22, 32 + i * 22, ligne)).join("") + "</g>"
  );
}

function etapes(lignes, legende, largeur = 600) {
  return { viewBox: "0 0 " + largeur + " " + (30 + lignes.length * 22), dessin: dessinEtapes(lignes, largeur), legende };
}

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
  nettoyeurs.push(() => observateur.disconnect());
}

/** Plan couple et vitesse statique, pour les exercices et les corrections. */
function dessinPlan(id, options = {}) {
  const cx = options.cx || 200;
  const cy = options.cy || 150;
  const d = options.demi || 120;
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.8">';
  s += fleche(cx - d - 10, cy, cx + d + 14, cy, id) + fleche(cx, cy + d + 10, cx, cy - d - 14, id) + "</g>";
  s += TRAITS + ' stroke-width="1.2" stroke-dasharray="5 4" opacity="0.55">';
  s += '<rect x="' + (cx + 8) + '" y="' + (cy - d) + '" width="' + (d - 8) + '" height="' + (d - 8) + '" rx="8"/>';
  s += '<rect x="' + (cx - d) + '" y="' + (cy - d) + '" width="' + (d - 8) + '" height="' + (d - 8) + '" rx="8"/>';
  s += '<rect x="' + (cx - d) + '" y="' + (cy + 8) + '" width="' + (d - 8) + '" height="' + (d - 8) + '" rx="8"/>';
  s += '<rect x="' + (cx + 8) + '" y="' + (cy + 8) + '" width="' + (d - 8) + '" height="' + (d - 8) + '" rx="8"/></g>';
  s += ECRITS + texte(cx + d + 18, cy + 4, "C_m") + texte(cx + 8, cy - d - 16, "Ω");
  if (options.numeros !== false) {
    s += texte(cx + d / 2 - 4, cy - d / 2, "1") + texte(cx - d / 2 - 4, cy - d / 2, "2") + texte(cx - d / 2 - 4, cy + d / 2 + 8, "3") + texte(cx + d / 2 - 4, cy + d / 2 + 8, "4");
  }
  s += "</g>";
  return s;
}

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeurs = [];

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireQuadrants(racine, api);
  construireCouple(racine, api);
  construireFreinage(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  api.reveler(racine.querySelectorAll(".formule-cle, .encadre, .cadre-tableau"), { decalage: 0.05 });
}

export function detruire() {
  for (const nettoyeur of nettoyeurs) {
    try {
      nettoyeur();
    } catch (erreur) {
      /* le nettoyage ne doit jamais empêcher le chargement du cours suivant */
    }
  }
  nettoyeurs = [];
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
   Renvois et tracés statiques
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
  nettoyeurs.push(() => {
    for (const lien of liens) lien.removeEventListener("click", surClic);
  });
}

function construireDessinsStatiques(racine, api) {
  const schemas = [
    ["#e-quadrants-figure svg", 1.4],
    ["#e-bus-figure svg", 1.6],
    ["#f-schema-principal svg", 1.7],
    ["#h-figure svg", 1.4],
    ["#i-figure svg", 1.3],
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
  if (!racine.querySelector("#c-minitest")) return;
  const cible = "#c-minitest";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c1-puissance",
      titre: "Puissance mécanique d'un arbre",
      niveau: "fondamental",
      enonce: "<p>Un moteur fournit $194{,}2\\ \\mathrm{N \\cdot m}$ à $1475\\ \\mathrm{tr/min}$. Quelle puissance mécanique transmet-il, en kilowatts ?</p>",
      valeur: (194.2 * versRad(1475)) / 1000,
      unite: "kW",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Puissance mécanique",
      etapes: [
        { texte: "Conversion : $\\Omega = 2\\pi \\times 1475/60 = 154{,}46\\ \\mathrm{rad/s}$." },
        { texte: "$P = C\\Omega = 194{,}2 \\times 154{,}46 = 29\\,996\\ \\mathrm{W} \\approx 30{,}0\\ \\mathrm{kW}$.", note: "C'est la puissance nominale du moteur de la pompe : la plaque donne la puissance utile sur l'arbre." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Puissance à couple nominal selon la vitesse",
          xTitre: "vitesse", xUnite: "tr/min", yTitre: "puissance", yUnite: "kW",
          xMin: 0, xMax: 1600, yMin: 0, yMax: 34,
          series: [{ id: "p", nom: "P = 194,2 Ω", couleur: "serie-1", epaisseur: 2.4, fonction: (n) => (194.2 * versRad(n)) / 1000 }],
          surDessin({ c, repere: r, couleurs }) {
            pointRepere(c, r, couleurs, 1475, 30, "30,0 kW à 1475 tr/min");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-energie-bus",
      titre: "Énergie stockée dans un bus continu",
      niveau: "fondamental",
      enonce: "<p>Le bus du variateur de la pompe a une capacité de $2{,}2\\ \\mathrm{mF}$. Quelle énergie stocke-t-il sous $565{,}7\\ \\mathrm{V}$, en joules ?</p>",
      valeur: 0.5 * 2.2e-3 * 565.7 * 565.7,
      unite: "J",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Énergie stockée",
      etapes: [
        { texte: "$W = \\frac{1}{2}CU^2 = 0{,}5 \\times 2{,}2 \\times 10^{-3} \\times 565{,}7^2$." },
        { texte: "$565{,}7^2 = 320\\,017$ ; $W = 1{,}1 \\times 10^{-3} \\times 320\\,017 = 352\\ \\mathrm{J}$.", note: "Ordre de grandeur : à peine l'énergie cinétique d'un adulte qui marche vite. Gardez ce chiffre en tête pour le comparer aux énergies de freinage." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Énergie du bus selon sa tension",
          xTitre: "tension", xUnite: "V", yTitre: "énergie", yUnite: "J",
          xMin: 0, xMax: 850, yMin: 0, yMax: 820,
          series: [{ id: "w", nom: "W = C U² / 2", couleur: "serie-3", epaisseur: 2.4, fonction: (u) => 0.5 * 2.2e-3 * u * u }],
          surDessin({ c, repere: r, couleurs }) {
            pointRepere(c, r, couleurs, 565.7, 352, "352 J à 565,7 V");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "c3-glissement",
      titre: "Glissement négatif",
      niveau: "fondamental",
      enonce: "<p>Un moteur asynchrone à quatre pôles, alimenté à $50\\ \\mathrm{Hz}$, tourne à $1530\\ \\mathrm{tr/min}$, entraîné par sa charge. Que peut-on affirmer ?</p>",
      options: [
        { texte: "$g = -2\\ \\%$ et la machine renvoie de la puissance active à sa source.", juste: true },
        { texte: "$g = +2\\ \\%$ et la machine est motrice." },
        { texte: "Le couple électromagnétique est nul, puisque le rotor dépasse le synchronisme." },
        { texte: "La machine ne peut fonctionner ainsi qu'avec un rotor bobiné." },
      ],
      etapes: [
        { texte: "$n_s = 60f/p = 60 \\times 50/2 = 1500\\ \\mathrm{tr/min}$." },
        { texte: "$g = (1500 - 1530)/1500 = -0{,}02$, soit $-2\\ \\%$ : le rotor tourne plus vite que le champ." },
        { texte: "Les courants rotoriques s'inversent, le couple s'oppose à la rotation et la puissance active est renvoyée au stator : fonctionnement en génératrice, possible avec un rotor à cage.", note: "C'est exactement ce que provoque un variateur qui abaisse sa fréquence plus vite que le rotor ne ralentit." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Couple du moteur de la pompe à 50 Hz",
          xTitre: "vitesse", xUnite: "tr/min", yTitre: "couple", yUnite: "N.m",
          xMin: 1300, xMax: 1700, yMin: -700, yMax: 700,
          series: [{ id: "c", nom: "couple électromagnétique", couleur: "serie-1", epaisseur: 2.4, fonction: (n) => regimeAsynchrone(n, 50).C }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0, "");
            ligneV(c, r, couleurs, 1500, "synchronisme 1500 tr/min", [8, 5]);
            pointRepere(c, r, couleurs, 1530, regimeAsynchrone(1530, 50).C, "1530 tr/min : couple négatif");
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Plan couple et vitesse et chaîne du variateur
   -------------------------------------------------------------------------- */

const BLOCS_CHAINE = [
  { id: "res", nom: "réseau", x: 360 },
  { id: "red", nom: "redresseur", x: 448 },
  { id: "bus", nom: "bus", x: 536 },
  { id: "ond", nom: "onduleur", x: 624 },
  { id: "mot", nom: "moteur", x: 712 },
  { id: "cha", nom: "charge", x: 800 },
];

function construireQuadrants(racine, api) {
  const conteneur = racine.querySelector("#d-quadrants-vivant");
  if (!conteneur) return;

  const CX = 180;
  const CY = 180;
  const ECH = 125;
  const boite = { x: 40, y: 40, largeur: 280, hauteur: 280 };
  const etat = { c: 0.8, w: 0.85, mode: 0, phase: 0 };

  const svg = svgEl("svg", {
    viewBox: "0 0 900 380",
    "aria-label": "Plan couple et vitesse manipulable et chaîne du variateur : réseau, redresseur, bus, onduleur, moteur, charge et résistance de freinage, avec le sens de la puissance dans chaque liaison",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-dq");
  svg.appendChild(defs);

  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round" });
  fond.appendChild(svgEl("rect", { x: boite.x, y: boite.y, width: boite.largeur, height: boite.hauteur, rx: 10, opacity: "0.35" }));
  fond.appendChild(svgEl("path", { d: "M" + (boite.x - 6) + " " + CY + "H" + (boite.x + boite.largeur + 14), "marker-end": "url(#fl-dq)" }));
  fond.appendChild(svgEl("path", { d: "M" + CX + " " + (boite.y + boite.hauteur + 6) + "V" + (boite.y - 14), "marker-end": "url(#fl-dq)" }));
  for (const v of [-1, 1]) {
    fond.appendChild(svgEl("path", { d: "M" + (CX + v * ECH) + " " + (CY - 5) + "v10" }));
    fond.appendChild(svgEl("path", { d: "M" + (CX - 5) + " " + (CY - v * ECH) + "h10" }));
  }
  svg.appendChild(fond);

  const ecritsPlan = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "12" });
  ecritsPlan.innerHTML =
    texte(CX + 140, CY - 8, "C_m") + texte(CX + 8, boite.y - 18, "Ω") +
    texte(CX + 70, CY - 110, "1", ' font-size="15" font-weight="600"') + texte(CX - 80, CY - 110, "2", ' font-size="15" font-weight="600"') +
    texte(CX - 80, CY + 122, "3", ' font-size="15" font-weight="600"') + texte(CX + 70, CY + 122, "4", ' font-size="15" font-weight="600"') +
    texte(CX + ECH - 6, CY + 20, "1", ' font-size="10.5"') + texte(CX - ECH - 8, CY + 20, "-1", ' font-size="10.5"') +
    texte(CX + 8, CY - ECH + 4, "1", ' font-size="10.5"') + texte(CX + 8, CY + ECH + 4, "-1", ' font-size="10.5"') +
    texte(40, 352, "grandeurs réduites : 1 = point nominal", ' font-size="10.5"');
  svg.appendChild(ecritsPlan);

  const guide = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.2", "stroke-dasharray": "4 4", opacity: "0.6" });
  svg.appendChild(guide);

  /* Chaîne du variateur */
  const chaine = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linejoin": "round" });
  const cadres = {};
  for (const bloc of BLOCS_CHAINE) {
    const rect = svgEl("rect", { x: bloc.x, y: 140, width: 70, height: 60, rx: 8 });
    chaine.appendChild(rect);
    cadres[bloc.id] = rect;
  }
  const resistance = svgEl("rect", { x: 536, y: 262, width: 70, height: 40, rx: 6 });
  chaine.appendChild(resistance);
  cadres.res2 = resistance;
  svg.appendChild(chaine);

  const ecritsChaine = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11", "text-anchor": "middle" });
  ecritsChaine.innerHTML =
    BLOCS_CHAINE.map((b) => texte(b.x + 35, 174, b.nom, "")).join("") +
    texte(571, 287, "R_f") + texte(615, 120, "sens de la puissance dans chaque liaison");
  svg.appendChild(ecritsChaine);

  const etiquetteRed = svgEl("text", { x: 483, y: 222, fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "10.5", "text-anchor": "middle" });
  const etiquetteBus = svgEl("text", { x: 571, y: 222, fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "10.5", "text-anchor": "middle" });
  svg.append(etiquetteRed, etiquetteBus);

  /* Liaisons : début, fin */
  const LIAISONS = [
    { id: "l1", de: [430, 170], a: [448, 170] },
    { id: "l2", de: [518, 170], a: [536, 170] },
    { id: "l3", de: [606, 170], a: [624, 170] },
    { id: "l4", de: [694, 170], a: [712, 170] },
    { id: "l5", de: [782, 170], a: [800, 170] },
    { id: "l6", de: [571, 200], a: [571, 262] },
  ];
  const traitsLiaisons = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "2.4", "stroke-linecap": "round" });
  const flechesLiaisons = svgEl("g", { fill: "currentColor", stroke: "none" });
  const points = svgEl("g", { stroke: "none", style: "fill: var(--serie-2)" });
  for (const l of LIAISONS) {
    l.trait = svgEl("path", { d: "M" + l.de[0] + " " + l.de[1] + "L" + l.a[0] + " " + l.a[1] });
    traitsLiaisons.appendChild(l.trait);
    l.fleche = svgEl("path", { d: "" });
    flechesLiaisons.appendChild(l.fleche);
    l.points = [0, 1, 2].map(() => {
      const p = svgEl("circle", { r: 3.4, cx: l.de[0], cy: l.de[1], opacity: "0" });
      points.appendChild(p);
      return p;
    });
    l.sens = 0;
  }
  svg.append(traitsLiaisons, flechesLiaisons, points);

  const message = svgEl("text", { x: 360, y: 340, fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "11" });
  const message2 = svgEl("text", { x: 360, y: 358, fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(message, message2);

  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-quadrants-valeurs", [
    { id: "C", libelle: "Couple C_m", unite: "N.m", decimales: 1 },
    { id: "n", libelle: "Vitesse n", unite: "tr/min", decimales: 0 },
    { id: "P", libelle: "Puissance P_m = C_m Ω", unite: "kW", decimales: 2 },
    { id: "q", libelle: "Quadrant", format: (v) => v },
    { id: "f", libelle: "Fonctionnement", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function flechePour(l) {
    if (!l.sens) return "";
    const mx = (l.de[0] + l.a[0]) / 2;
    const my = (l.de[1] + l.a[1]) / 2;
    const dx = (l.a[0] - l.de[0]) * l.sens;
    const dy = (l.a[1] - l.de[1]) * l.sens;
    const long = Math.hypot(dx, dy) || 1;
    const ux = dx / long;
    const uy = dy / long;
    const pointe = [mx + ux * 6, my + uy * 6];
    const b1 = [mx - ux * 5 - uy * 5, my - uy * 5 + ux * 5];
    const b2 = [mx - ux * 5 + uy * 5, my - uy * 5 - ux * 5];
    return "M" + pointe[0].toFixed(1) + " " + pointe[1].toFixed(1) + "L" + b1[0].toFixed(1) + " " + b1[1].toFixed(1) + "L" + b2[0].toFixed(1) + " " + b2[1].toFixed(1) + "Z";
  }

  function dessiner() {
    const Pm = etat.c * etat.w;
    const px = CX + etat.c * ECH;
    const py = CY - etat.w * ECH;
    guide.setAttribute("d", "M" + px + " " + py + "H" + CX + "M" + px + " " + py + "V" + CY);
    const faible = Math.abs(Pm) < 0.02;
    let quadrant = "sur un axe";
    if (Math.abs(etat.c) >= 0.02 && Math.abs(etat.w) >= 0.02) {
      quadrant = etat.w > 0 ? (etat.c > 0 ? "1" : "2") : etat.c > 0 ? "4" : "3";
    }
    const moteur = Pm > 0;
    const sens = faible ? 0 : moteur ? 1 : -1;
    /* l1..l5 : +1 de gauche à droite ; l6 : +1 du bus vers la résistance */
    const s = { l1: 0, l2: 0, l3: sens, l4: sens, l5: sens, l6: 0 };
    let piege = false;
    if (sens === 1) {
      s.l1 = 1;
      s.l2 = 1;
    } else if (sens === -1) {
      if (etat.mode === 0) piege = true;
      if (etat.mode === 1) s.l6 = 1;
      if (etat.mode === 2) {
        s.l1 = -1;
        s.l2 = -1;
      }
    }
    for (const l of LIAISONS) {
      l.sens = s[l.id];
      l.fleche.setAttribute("d", flechePour(l));
      l.trait.setAttribute("opacity", l.sens ? "1" : "0.3");
      l.trait.setAttribute("stroke-dasharray", l.sens ? "" : "3 4");
    }
    cadres.bus.setAttribute("stroke-width", piege ? "4.4" : "2");
    cadres.res2.setAttribute("opacity", etat.mode === 1 ? "1" : "0.35");
    etiquetteRed.textContent = etat.mode === 2 ? "redresseur actif" : "pont de diodes";
    etiquetteBus.textContent = piege ? "E monte" : "";
    let fonction = "à vide ou à l'arrêt";
    let m1 = "Puissance quasi nulle : aucun échange notable.";
    let m2 = "";
    if (!faible && moteur) {
      fonction = "moteur";
      m1 = "Quadrant " + quadrant + " : machine motrice, puissance du réseau vers la charge.";
      m2 = "Pont de diodes et bus en régime normal.";
    } else if (!faible) {
      fonction = "génératrice";
      m1 = "Quadrant " + quadrant + " : la charge entraîne la machine, puissance vers le bus.";
      m2 = etat.mode === 0
        ? "Pont de diodes seul : énergie piégée, E monte jusqu'au déclenchement."
        : etat.mode === 1
          ? "Hacheur : bus tenu à son seuil, énergie dissipée dans R_f."
          : "Redresseur actif : puissance renvoyée au réseau.";
    }
    message.textContent = m1;
    message2.textContent = m2;
    if (valeurs) {
      valeurs.maj({
        C: etat.c * POMPE.Cn,
        n: etat.w * POMPE.nn,
        P: Pm * POMPE.Pn,
        q: quadrant,
        f: fonction,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite,
    valeur: { x: CX + etat.c * ECH, y: CY - etat.w * ECH },
    pas: 4,
    libelle: "Point de fonctionnement dans le plan couple et vitesse",
    rappel(mesure) {
      etat.c = Math.max(-1.12, Math.min(1.12, (mesure.x - CX) / ECH));
      etat.w = Math.max(-1.12, Math.min(1.12, (CY - mesure.y) / ECH));
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const noms = ["pont de diodes seul", "pont de diodes et hacheur", "redresseur actif"];
  const curseurs = api.sim.curseurs(
    "#d-quadrants-curseurs",
    [{ id: "mode", libelle: "Étage d'entrée et freinage", min: 0, max: 2, pas: 1, valeur: 0, format: (x) => noms[Math.round(x)] }],
    (lues) => {
      etat.mode = Math.round(lues.mode);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  /* Points qui circulent : animation continue tant que la figure est visible. */
  let visible = true;
  let idAnimation = 0;
  let dernier = 0;
  function animer(instant) {
    idAnimation = 0;
    if (!visible) return;
    const ecoule = dernier ? Math.min(0.05, (instant - dernier) / 1000) : 0;
    dernier = instant;
    const intensite = Math.min(1.3, Math.abs(etat.c * etat.w));
    etat.phase = (etat.phase + ecoule * (0.25 + 1.2 * intensite)) % 1;
    for (const l of LIAISONS) {
      l.points.forEach((p, i) => {
        if (!l.sens) {
          p.setAttribute("opacity", "0");
          return;
        }
        let u = (etat.phase + i / 3) % 1;
        if (l.sens < 0) u = 1 - u;
        p.setAttribute("cx", (l.de[0] + u * (l.a[0] - l.de[0])).toFixed(1));
        p.setAttribute("cy", (l.de[1] + u * (l.a[1] - l.de[1])).toFixed(1));
        p.setAttribute("opacity", "1");
      });
    }
    idAnimation = requestAnimationFrame(animer);
  }
  if (!api.mouvementReduit && typeof requestAnimationFrame === "function") {
    if (typeof IntersectionObserver === "function") {
      const observateur = new IntersectionObserver((entrees) => {
        visible = entrees.some((e) => e.isIntersecting);
        if (visible && !idAnimation) {
          dernier = 0;
          idAnimation = requestAnimationFrame(animer);
        }
      });
      observateur.observe(conteneur);
      nettoyeurs.push(() => observateur.disconnect());
    }
    idAnimation = requestAnimationFrame(animer);
    nettoyeurs.push(() => {
      visible = false;
      if (idAnimation) cancelAnimationFrame(idAnimation);
      idAnimation = 0;
    });
  }

  ressources.push(api.dessiner(fond, { declencheur: conteneur, duree: 1.1 }));
  ressources.push(api.dessiner(chaine, { declencheur: conteneur, duree: 1.2 }));
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Caractéristique couple et vitesse en moteur et en génératrice
   -------------------------------------------------------------------------- */

function construireCouple(racine, api) {
  if (!racine.querySelector("#e-couple-trace")) return;
  const reglages = { f: 50, n: 1475 };

  const trace = api.sim.traceur("#e-couple-trace", {
    titre: "Couple du moteur de la pompe et couple de la pompe",
    xTitre: "vitesse du rotor", xUnite: "tr/min", yTitre: "couple", yUnite: "N.m",
    xMin: 0, xMax: 1800, yMin: -800, yMax: 800,
    echantillons: 500,
    series: [
      { id: "m", nom: "couple du moteur, loi U/f", couleur: "serie-1", epaisseur: 3 },
      { id: "p", nom: "couple de la pompe, quadratique", couleur: "serie-3", epaisseur: 1.5 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 0, "", [2, 3]);
      const ns = (60 * reglages.f) / POMPE.p;
      ligneV(c, r, couleurs, ns, "n_s = " + nb(api, ns, 0) + " tr/min", [9, 5]);
      ligneV(c, r, couleurs, reglages.n, "");
      pointRepere(c, r, couleurs, reglages.n, regimeAsynchrone(reglages.n, reglages.f).C, "point de fonctionnement");
    },
  });
  if (trace) ressources.push(trace);

  function maj() {
    if (!trace) return;
    const { f, n } = reglages;
    trace.definirFonction("m", (x) => regimeAsynchrone(x, f).C);
    trace.definirFonction("p", (x) => K_POMPE * versRad(x) * versRad(x));
    const rg = regimeAsynchrone(n, f);
    const Pm = rg.C * versRad(n);
    let mode = "synchronisme : couple nul";
    if (rg.g > 1e-6) mode = "moteur : le stator absorbe, l'arbre reçoit";
    if (rg.g < -1e-6) mode = "génératrice : l'arbre fournit, le stator renvoie";
    trace.definirMesures([
      { nom: "Vitesse de synchronisme", valeur: nb(api, rg.ns, 0) + " tr/min" },
      { nom: "Glissement", valeur: nb(api, rg.g * 100, 2) + " %" },
      { nom: "Couple", valeur: nb(api, rg.C, 1) + " N.m" },
      { nom: "Puissance mécanique C Ω", valeur: nb(api, Pm / 1000, 2) + " kW" },
      { nom: "Puissance électrique absorbée", valeur: nb(api, rg.P1 / 1000, 2) + " kW" },
      { nom: "Courant de ligne", valeur: nb(api, rg.I1, 1) + " A" },
      { nom: "Fonctionnement", valeur: mode },
    ]);
  }

  const curseurs = api.sim.curseurs(
    "#e-couple-curseurs",
    [
      { id: "f", libelle: "Fréquence imposée par l'onduleur", min: 5, max: 55, pas: 0.25, valeur: reglages.f, unite: "Hz" },
      { id: "n", libelle: "Vitesse du rotor", min: 0, max: 1800, pas: 5, valeur: reglages.n, unite: "tr/min" },
    ],
    (lues) => {
      reglages.f = lues.f;
      reglages.n = lues.n;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   I. Ralentissement de la pompe et tension du bus
   -------------------------------------------------------------------------- */

function construireFreinage(racine, api) {
  if (!racine.querySelector("#i-freinage-vitesse")) return;
  const reglages = { Tr: 0.2, n1: 737, J: 0.5, mode: 0, R: 60 };
  let resultat = simulerFreinage(reglages);
  let curseurT = 0;

  const vitesse = api.sim.traceur("#i-freinage-vitesse", {
    titre: "Consigne et vitesse de la pompe",
    xTitre: "temps", xUnite: "s", yTitre: "vitesse", yUnite: "tr/min",
    xMin: 0, xMax: resultat.tFin, yMin: 0, yMax: 1600,
    ratio: 0.36,
    series: [
      { id: "ref", nom: "consigne en rampe", couleur: "serie-6", epaisseur: 1.4 },
      { id: "n", nom: "vitesse réelle", couleur: "serie-1", epaisseur: 3 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, curseurT, "");
      if (resultat.declenche !== null) ligneV(c, r, couleurs, resultat.declenche, "déclenchement", [9, 5]);
    },
  });
  if (vitesse) ressources.push(vitesse);

  const bus = api.sim.traceur("#i-freinage-bus", {
    titre: "Tension du bus continu",
    xTitre: "temps", xUnite: "s", yTitre: "tension", yUnite: "V",
    xMin: 0, xMax: resultat.tFin, yMin: 500, yMax: 860,
    ratio: 0.36,
    series: [{ id: "E", nom: "tension du bus E", couleur: "serie-5", epaisseur: 2.8 }],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 760, "760 V, limitation et hacheur");
      ligneH(c, r, couleurs, 800, "800 V, déclenchement");
      ligneV(c, r, couleurs, curseurT, "");
    },
  });
  if (bus) ressources.push(bus);

  const valeurs = api.sim.valeurs("#i-freinage-valeurs", [
    { id: "t", libelle: "Instant", unite: "s", decimales: 3 },
    { id: "n", libelle: "Vitesse", unite: "tr/min", decimales: 0 },
    { id: "Tm", libelle: "Couple du moteur", unite: "N.m", decimales: 1 },
    { id: "P", libelle: "Puissance renvoyée au bus", unite: "kW", decimales: 2 },
    { id: "E", libelle: "Tension du bus", unite: "V", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function echantillonA(t) {
    const liste = resultat.echantillons;
    let meilleur = liste[0];
    for (const e of liste) {
      if (e.t > t) break;
      meilleur = e;
    }
    return meilleur;
  }

  function majCurseur(fraction) {
    curseurT = fraction * resultat.tFin;
    const e = echantillonA(curseurT);
    if (valeurs && e) valeurs.maj({ t: curseurT, n: e.n, Tm: e.Tm, P: e.P / 1000, E: e.E });
    if (vitesse) vitesse.rafraichir();
    if (bus) bus.rafraichir();
  }

  function maj() {
    resultat = simulerFreinage(reglages);
    const liste = resultat.echantillons;
    if (vitesse) {
      vitesse.definirPlage({ xMin: 0, xMax: resultat.tFin });
      vitesse.definirDonnees("ref", liste.map((e) => [e.t, e.ref]));
      vitesse.definirDonnees("n", liste.map((e) => [e.t, e.n]));
      vitesse.definirMesures([
        { nom: "Énergie cinétique à libérer", valeur: nb(api, resultat.Wc, 0) + " J" },
        {
          nom: "Vitesse visée atteinte à",
          valeur: resultat.atteint === null ? "non atteinte dans la fenêtre" : nb(api, resultat.atteint, 3) + " s",
        },
      ]);
    }
    if (bus) {
      bus.definirPlage({ xMin: 0, xMax: resultat.tFin });
      bus.definirDonnees("E", liste.map((e) => [e.t, e.E]));
      bus.definirMesures([
        { nom: "Tension maximale", valeur: nb(api, resultat.Emaxi, 1) + " V" },
        { nom: "Déclenchement en surtension", valeur: resultat.declenche === null ? "non" : "à " + nb(api, resultat.declenche * 1000, 1) + " ms" },
        { nom: "Énergie renvoyée au bus", valeur: nb(api, resultat.Ebus, 0) + " J" },
        { nom: "Énergie dissipée dans R_f", valeur: nb(api, resultat.ER, 0) + " J" },
        { nom: "Réserve du bus de 540 à 800 V", valeur: "383 J" },
      ]);
    }
    majCurseur(curseurT / (resultat.tFin || 1));
  }

  const noms = ["sans dispositif", "régulateur de surtension", "hacheur et résistance"];
  const curseurs = api.sim.curseurs(
    "#i-freinage-curseurs",
    [
      { id: "Tr", libelle: "Durée de la rampe", min: 0.05, max: 6, pas: 0.05, valeur: reglages.Tr, unite: "s" },
      { id: "n1", libelle: "Vitesse visée", min: 0, max: 1250, pas: 5, valeur: reglages.n1, unite: "tr/min" },
      { id: "J", libelle: "Inertie totale J", min: 0.1, max: 2, pas: 0.05, valeur: reglages.J, unite: "kg.m²" },
      { id: "mode", libelle: "Dispositif", min: 0, max: 2, pas: 1, valeur: reglages.mode, format: (x) => noms[Math.round(x)] },
      { id: "R", libelle: "Résistance de freinage R_f", min: 20, max: 200, pas: 1, valeur: reglages.R, unite: "Ω" },
    ],
    (lues) => {
      reglages.Tr = lues.Tr;
      reglages.n1 = lues.n1;
      reglages.J = lues.J;
      reglages.mode = Math.round(lues.mode);
      reglages.R = lues.R;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#i-freinage-lecteur", {
    de: 0,
    a: 1,
    duree: 8,
    boucle: false,
    auto: false,
    libelle: "Parcours du temps simulé",
    rappel: (fraction) => majCurseur(fraction),
  });
  if (lecteur) ressources.push(lecteur);
  maj();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

const ZONES_PLAN = [
  { x: 208, y: 30, largeur: 112, hauteur: 112, etiquette: "quadrant 1" },
  { x: 80, y: 30, largeur: 112, hauteur: 112, etiquette: "quadrant 2" },
  { x: 80, y: 158, largeur: 112, hauteur: 112, etiquette: "quadrant 3" },
  { x: 208, y: 158, largeur: 112, hauteur: 112, etiquette: "quadrant 4" },
];

function dessinPlanExercice(id) {
  return dessinPlan(id, { cx: 200, cy: 150, demi: 120, numeros: false }) +
    ECRITS + texte(330, 40, "abscisse : couple") + texte(330, 58, "du moteur C_m") + texte(330, 84, "ordonnée : vitesse Ω,") + texte(330, 102, "positive dans le") + texte(330, 120, "sens de rotation") + texte(330, 138, "du ventilateur") + "</g>";
}

function dessinPonts(id) {
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="2">';
  s += '<rect x="20" y="40" width="150" height="120" rx="8"/><rect x="330" y="40" width="150" height="120" rx="8"/>';
  s += '<path d="M170 70H330M170 130H330"/>';
  s += '<path d="M78 112L112 112M95 112L78 86H112Z"/><path d="M78 86H112" stroke-width="2.6"/>';
  s += '<path d="M388 112L422 112M405 112L388 86H422Z"/><path d="M388 86H422" stroke-width="2.6"/></g>';
  s += TRAITS + ' stroke-width="1.6">' + fleche(190, 56, 240, 56, id) + fleche(310, 146, 260, 146, id, ' stroke-dasharray="5 4"') + "</g>";
  s += ECRITS + texte(30, 32, "pont de diodes") + texte(340, 32, "onduleur, diodes en") + texte(340, 178, "antiparallèle des IGBT");
  s += texte(196, 48, "i_r ≥ 0") + texte(252, 166, "i_o &lt; 0 possible") + texte(250, 98, "bus") + texte(30, 190, "courant unidirectionnel :") + texte(30, 208, "aucun retour vers le réseau") + texte(330, 196, "courant de bus des deux signes") + "</g>";
  return s;
}

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-energie-cinetique",
      titre: "Énergie cinétique d'une inertie",
      niveau: "fondamental",
      enonce: "<p>Un ventilateur et son moteur ont une inertie totale de $2\\ \\mathrm{kg \\cdot m^2}$ et tournent à $1500\\ \\mathrm{tr/min}$. Quelle énergie cinétique stockent-ils, en kilojoules ?</p>",
      valeur: (0.5 * 2 * versRad(1500) * versRad(1500)) / 1000,
      unite: "kJ",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Énergie cinétique",
      etapes: [
        { texte: "$\\Omega = 2\\pi \\times 1500/60 = 157{,}08\\ \\mathrm{rad/s}$." },
        { texte: "$W_c = \\frac{1}{2}J\\Omega^2 = 0{,}5 \\times 2 \\times 157{,}08^2 = 24\\,674\\ \\mathrm{J} = 24{,}67\\ \\mathrm{kJ}$." },
        { texte: "Comparaison : un bus de $2{,}2\\ \\mathrm{mF}$ absorbe $383\\ \\mathrm{J}$ entre $540$ et $800\\ \\mathrm{V}$, soixante-quatre fois moins.", note: "L'énergie croît comme le carré de la vitesse : à mi-vitesse, il ne reste qu'un quart de l'énergie." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Énergie cinétique selon la vitesse, J = 2 kg.m²",
          xTitre: "vitesse", xUnite: "tr/min", yTitre: "énergie", yUnite: "kJ",
          xMin: 0, xMax: 1600, yMin: 0, yMax: 30,
          series: [{ id: "w", nom: "W_c = J Ω² / 2", couleur: "serie-1", epaisseur: 2.6, fonction: (n) => (0.5 * 2 * versRad(n) * versRad(n)) / 1000 }],
          surDessin({ c, repere: r, couleurs }) {
            pointRepere(c, r, couleurs, 1500, 24.674, "24,67 kJ à 1500 tr/min");
            pointRepere(c, r, couleurs, 750, 6.169, "un quart à mi-vitesse");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.schema(cible, {
      id: "k2-quadrant",
      titre: "Placer un ralentissement forcé",
      niveau: "fondamental",
      consigne: "Cliquez sur le quadrant correspondant.",
      enonce: "<p>Un ventilateur tourne dans son sens habituel, pris comme sens direct. On exige qu'il ralentisse plus vite que son ralentissement naturel. Dans quel quadrant se trouve alors le point de fonctionnement du moteur ?</p>",
      viewBox: "0 0 480 300",
      dessin: dessinPlanExercice("fl-k2"),
      zones: ZONES_PLAN.map((z, i) => ({ ...z, juste: i === 1 })),
      etapes: [
        { texte: "La vitesse reste dans le sens direct : $\\Omega \\gt 0$, moitié haute du plan." },
        { texte: "Pour décélérer plus vite que la charge seule, $C_m = C_r - Ja$ doit devenir négatif : moitié gauche." },
        { texte: "$C_m \\lt 0$ et $\\Omega \\gt 0$ : quadrant 2, la machine est génératrice et renvoie de l'énergie au bus.", note: "Avec la vitesse en abscisse, ce même point serait numéroté 4 : raisonnez sur les signes." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const id = "fl-k2c";
        let s = dessinPlan(id, { cx: 200, cy: 150, demi: 120 });
        s += TRAITS + ' stroke-width="2.6">' + fleche(260, 60, 140, 60, id) + "</g>";
        s += '<circle cx="140" cy="60" r="6" fill="currentColor"/>';
        s += ECRITS + texte(214, 48, "C_m passe de + à -") + texte(330, 210, "Ω &gt; 0, C_m &lt; 0") + texte(330, 228, "P_m &lt; 0 : génératrice") + "</g>";
        schemaCorrection(moteurApi, conteneur, "0 0 480 300", s, "Le point quitte le quadrant 1 pour le quadrant 2 quand le couple du moteur change de signe.");
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-temps-bus",
      titre: "Temps avant surtension",
      niveau: "intermédiaire",
      enonce: "<p>Un variateur sans hacheur a un bus de $1\\ \\mathrm{mF}$ à $560\\ \\mathrm{V}$. Son moteur se met à renvoyer $5\\ \\mathrm{kW}$ constants. Le seuil de déclenchement est à $800\\ \\mathrm{V}$. Au bout de combien de millisecondes le variateur déclenche-t-il ?</p>",
      valeur: (1e-3 * (800 * 800 - 560 * 560)) / (2 * 5000) * 1000,
      unite: "ms",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Temps avant déclenchement",
      etapes: [
        { texte: "Pont de diodes bloqué : $\\frac{\\mathrm{d}}{\\mathrm{d}t}\\left(\\frac{1}{2}C_\\mathrm{bus}E^2\\right) = P_g$." },
        { texte: "Réserve : $\\frac{1}{2} \\times 10^{-3} \\times (800^2 - 560^2) = 0{,}5 \\times 10^{-3} \\times 326\\,400 = 163{,}2\\ \\mathrm{J}$." },
        { texte: "$t = 163{,}2/5000 = 32{,}6\\ \\mathrm{ms}$.", note: "La tension monte comme $\\sqrt{E_0^2 + 2P_gt/C}$ : la courbe s'infléchit légèrement, car chaque volt supplémentaire coûte plus d'énergie." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Montée de la tension du bus à 5 kW",
          xTitre: "temps", xUnite: "ms", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 40, yMin: 500, yMax: 880,
          series: [{ id: "e", nom: "E(t)", couleur: "serie-5", epaisseur: 2.6, fonction: (t) => Math.sqrt(560 * 560 + (2 * 5000 * t * 1e-3) / 1e-3) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 800, "seuil de 800 V");
            pointRepere(c, r, couleurs, 32.64, 800, "32,6 ms");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-resistance",
      titre: "Valeur maximale de la résistance de freinage",
      niveau: "intermédiaire",
      enonce: "<p>Un hacheur de freinage s'enclenche à $760\\ \\mathrm{V}$. La puissance de freinage crête renvoyée au bus, marge comprise, est de $12\\ \\mathrm{kW}$. Quelle valeur maximale peut-on donner à la résistance, en ohms ?</p>",
      valeur: (760 * 760) / 12000,
      unite: "Ω",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Résistance maximale",
      etapes: [
        { texte: "Hacheur fermé en permanence ($\\alpha = 1$) au seuil : la résistance absorbe $E_\\mathrm{on}^2/R_f$." },
        { texte: "Il faut $E_\\mathrm{on}^2/R_f \\ge P_{g,\\max}$, donc $R_f \\le 760^2/12\\,000 = 577\\,600/12\\,000 = 48{,}1\\ \\Omega$." },
        { texte: "On choisit une valeur normalisée inférieure, par exemple $47\\ \\Omega$, à condition qu'elle reste au-dessus de la valeur minimale du constructeur ; courant du hacheur $760/47 = 16{,}2\\ \\mathrm{A}$.", note: "Une résistance plus forte limiterait la puissance de freinage ; une plus faible surchargerait l'interrupteur du hacheur." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["P max absorbable = E_on² / R_f", "condition : 760² / R_f ≥ 12 000 W", "R_f ≤ 577 600 / 12 000 = 48,1 Ω", "choix : 47 Ω si R_f,min ≤ 47 Ω", "courant de T_h : 760 / 47 = 16,2 A"], "Dimensionnement de la résistance de freinage, de la condition à la valeur normalisée.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );

  const w0 = versRad(1480);
  const Wc = 0.5 * 12 * w0 * w0;
  const Wl = (120 * w0 * 10) / 4;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-ventilateur",
      titre: "Énergie de freinage d'un ventilateur",
      niveau: "avancé",
      enonce: "<p>Un ventilateur d'inertie totale $12\\ \\mathrm{kg \\cdot m^2}$ tourne à $1480\\ \\mathrm{tr/min}$ ; son couple résistant est quadratique et vaut $120\\ \\mathrm{N \\cdot m}$ à cette vitesse. On l'arrête par une rampe linéaire de $10\\ \\mathrm{s}$. Le rendement de la chaîne arbre vers bus vaut $0{,}92$. Quelle énergie est renvoyée au bus pendant l'arrêt, en kilojoules ?</p>",
      valeur: (0.92 * (Wc - Wl)) / 1000,
      unite: "kJ",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Énergie renvoyée au bus",
      etapes: [
        { texte: "$\\Omega_0 = 154{,}99\\ \\mathrm{rad/s}$ ; décélération $a = 15{,}50\\ \\mathrm{rad/s^2}$, d'où $Ja = 186{,}0\\ \\mathrm{N \\cdot m}$." },
        { texte: "Test de signe : $Ja = 186{,}0 \\gt C_0 = 120\\ \\mathrm{N \\cdot m}$, donc $C_m = k\\Omega^2 - Ja \\lt 0$ pendant toute la rampe ; la formule $J^2\\Omega_0^3/(4C_0T)$ ne s'applique pas, car $\\Omega^* \\gt \\Omega_0$." },
        { texte: "Énergie cinétique : $W_c = \\frac{1}{2} \\times 12 \\times 154{,}99^2 = 144{,}1\\ \\mathrm{kJ}$." },
        { texte: "Travail de la charge pour $\\Omega = \\Omega_0(1 - t/T)$ : $\\int_0^T k\\Omega^3\\,\\mathrm{d}t = \\frac{C_0\\Omega_0T}{4} = \\frac{120 \\times 154{,}99 \\times 10}{4} = 46{,}5\\ \\mathrm{kJ}$." },
        { texte: "$W_g = 0{,}92 \\times (144{,}1 - 46{,}5) = 0{,}92 \\times 97{,}6 = 89{,}8\\ \\mathrm{kJ}$.", note: "Contrôle : bien plus que la réserve d'un bus ; il faut une rampe beaucoup plus longue ou un hacheur." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const k = 120 / (w0 * w0);
        const a = w0 / 10;
        traceCorrection(moteurApi, conteneur, {
          titre: "Puissance renvoyée au bus pendant la rampe de 10 s",
          xTitre: "temps", xUnite: "s", yTitre: "puissance", yUnite: "kW",
          xMin: 0, xMax: 10, yMin: 0, yMax: 15,
          series: [
            {
              id: "p",
              nom: "P_g = 0,92 (J a - k Ω²) Ω",
              couleur: "serie-5",
              epaisseur: 2.6,
              fonction: (t) => {
                const w = w0 * (1 - t / 10);
                return (0.92 * (12 * a - k * w * w) * w) / 1000;
              },
            },
          ],
          note: "L'aire sous la courbe vaut 89,8 kJ. La crête, environ 12,7 kW au bus, fixerait la résistance d'un hacheur.",
          surDessin({ c, repere: r, couleurs }) {
            const tMax = 10 * (1 - Math.sqrt((12 * a) / (3 * k)) / w0);
            const wM = w0 * (1 - tMax / 10);
            pointRepere(c, r, couleurs, tMax, (0.92 * (12 * a - k * wM * wM) * wM) / 1000, "crête");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-diagnostic",
      titre: "Déclenchements en surtension en fin de poste",
      niveau: "diagnostic",
      enonce: "<p>Le variateur d'un gros ventilateur d'extraction déclenche en défaut de surtension du bus, uniquement lors de l'arrêt en fin de poste, jamais en marche. Les défauts sont apparus quand la rampe de décélération a été ramenée de $60$ à $15\\ \\mathrm{s}$ pour accélérer les opérations de maintenance. Quelles affirmations sont justes ?</p>",
      options: [
        { texte: "L'énergie renvoyée pendant la rampe de $15\\ \\mathrm{s}$ dépasse ce que le bus peut absorber : la cause est mécanique et liée à la rampe.", juste: true },
        { texte: "Remettre une rampe plus longue, ou activer le régulateur de surtension, supprime les défauts sans matériel.", juste: true },
        { texte: "Si l'arrêt en $15\\ \\mathrm{s}$ est réellement exigé, il faut un hacheur et une résistance dimensionnés sur la puissance crête et l'énergie de l'arrêt.", juste: true },
        { texte: "Les condensateurs du bus sont vieillis ; les remplacer suffira." },
        { texte: "Augmenter la fréquence de découpage de l'onduleur réduira l'énergie renvoyée." },
      ],
      etapes: [
        { texte: "Le défaut n'apparaît qu'en ralentissement et depuis le raccourcissement de la rampe : il s'agit d'énergie de freinage, quadrant 2." },
        { texte: "Rampe allongée ou régulateur de surtension : la décélération redevient celle que la charge impose, et l'énergie reste dans la charge et les pertes." },
        { texte: "Si le temps d'arrêt est imposé, l'énergie doit sortir du bus : hacheur et résistance, ou redresseur actif si les arrêts sont fréquents." },
        { texte: "Des condensateurs vieillis réduisent un peu la réserve, mais ne peuvent expliquer un défaut lié au seul changement de rampe ; la fréquence de découpage ne change pas l'énergie mécanique à évacuer.", note: "Un enregistrement de la tension du bus pendant l'arrêt confirme le diagnostic en quelques minutes." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const id = "fl-k6";
        let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.8">';
        s += '<rect x="10" y="20" width="200" height="54" rx="8"/><rect x="250" y="20" width="200" height="54" rx="8"/><rect x="490" y="20" width="200" height="54" rx="8"/>';
        s += '<rect x="250" y="120" width="200" height="54" rx="8"/><rect x="490" y="120" width="200" height="54" rx="8"/>';
        s += fleche(210, 47, 250, 47, id) + fleche(450, 47, 490, 47, id) + fleche(350, 74, 350, 120, id) + fleche(590, 74, 590, 120, id) + "</g>";
        s += ECRITS.replace('font-size="12"', 'font-size="11"');
        s += texte(20, 42, "défaut à l'arrêt seul") + texte(20, 60, "depuis rampe de 15 s");
        s += texte(260, 42, "énergie de freinage") + texte(260, 60, "supérieure à la réserve");
        s += texte(500, 42, "temps d'arrêt imposé ?");
        s += texte(260, 142, "non : rampe longue ou") + texte(260, 160, "régulateur de surtension");
        s += texte(500, 142, "oui : hacheur et R_f") + texte(500, 160, "ou redresseur actif");
        s += "</g>";
        schemaCorrection(moteurApi, conteneur, "0 0 700 190", s, "Démarche de diagnostic : circonstances, origine de l'énergie, puis choix selon le temps d'arrêt exigé.");
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-conceptuel",
      titre: "Pourquoi le pont de diodes bloque l'énergie de freinage",
      niveau: "conceptuel",
      enonce: "<p>Sans calcul, expliquez pourquoi un variateur à pont de diodes ne peut pas renvoyer l'énergie de freinage au réseau, alors que son onduleur la laisse remonter du moteur jusqu'au bus sans commande particulière.</p>",
      motsCles: [["diode"], ["sens", "unidirectionnel", "positif", "un seul"], ["antiparallele", "inverse", "negatif", "deux sens", "deux signes"], ["tension", "monte", "bus", "condensateur"]],
      minimum: 3,
      exemple: "Trois ou quatre phrases : sens du courant dans chaque pont, signe de la tension du bus, conséquence.",
      etapes: [
        { texte: "La tension du bus garde toujours le même signe ; pour inverser le sens de la puissance, il faut donc inverser le sens du courant du bus." },
        { texte: "Les diodes du pont d'entrée ne conduisent que dans un sens : le courant $i_r$ ne peut que sortir du pont vers la borne positive. Aucune puissance ne peut retourner au réseau." },
        { texte: "Chaque interrupteur de l'onduleur est muni d'une diode en antiparallèle : quand le moteur est générateur, ses courants, déphasés de plus de $90$ degrés, passent par ces diodes et le courant $i_o$ du bus devient négatif.", note: "L'énergie arrive donc dans les condensateurs, dont la tension monte : il faut un hacheur, une rampe plus douce ou un étage d'entrée commandé." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(moteurApi, conteneur, "0 0 520 220", dessinPonts("fl-k7"), "Le pont de diodes n'accepte qu'un courant positif ; l'onduleur accepte les deux signes grâce à ses diodes en antiparallèle.");
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

function dessinArchitectureQuiz(id) {
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="2">';
  s += '<rect x="20" y="60" width="90" height="70" rx="8"/><rect x="150" y="60" width="90" height="70" rx="8"/><rect x="280" y="60" width="90" height="70" rx="8"/><rect x="410" y="60" width="90" height="70" rx="8"/>';
  s += '<circle cx="560" cy="95" r="30"/><rect x="280" y="170" width="90" height="40" rx="6"/>';
  s += '<path d="M110 95H150M240 95H280M370 95H410M500 95H530M325 130V170"/></g>';
  s += ECRITS.replace('font-size="12"', 'font-size="11"');
  s += texte(28, 92, "pont de") + texte(28, 108, "diodes") + texte(158, 92, "bus") + texte(158, 108, "C_bus") + texte(288, 92, "hacheur") + texte(288, 108, "T_h");
  s += texte(418, 92, "onduleur") + texte(552, 99, "M") + texte(288, 194, "élément R");
  s += "</g>";
  return s;
}

const ZONES_ARCHI = [
  { x: 15, y: 55, largeur: 100, hauteur: 80, etiquette: "pont de diodes" },
  { x: 145, y: 55, largeur: 100, hauteur: 80, etiquette: "bus" },
  { x: 275, y: 55, largeur: 100, hauteur: 80, etiquette: "hacheur" },
  { x: 405, y: 55, largeur: 100, hauteur: 80, etiquette: "onduleur" },
  { x: 525, y: 60, largeur: 70, hauteur: 70, etiquette: "moteur" },
  { x: 275, y: 165, largeur: 100, hauteur: 50, etiquette: "élément R", juste: true },
];

const VISUELS_QUIZ = [
  () => ({ viewBox: "0 0 480 300", dessin: dessinPlan("fl-qv0") + ECRITS + texte(330, 230, "descente :") + texte(330, 248, "Ω &lt; 0, C_m &gt; 0") + "</g>", legende: "Descente à vitesse constante : vitesse négative, couple de retenue positif, quadrant 4." }),
  etapes(["sortie du pont : i_r ≥ 0 quel que soit l'ordre des phases", "tension du bus de signe fixe", "aucune puissance vers le réseau"], "Pont de diodes unidirectionnel."),
  etapes(["Ω = 2π × 1475 / 60 = 154,46 rad/s", "W_c = 0,5 × 0,5 × 154,46²", "= 5965 J"], "Énergie cinétique de la pompe."),
  etapes(["pont bloqué : i_r = 0", "i_C = -i_o > 0 : le condensateur se charge", "E monte jusqu'au déclenchement en surtension"], "Bus d'un variateur à pont de diodes en freinage."),
  etapes(["n_s = 60 × 50 / 2 = 1500 tr/min", "g = (1500 - 1530) / 1500", "= -0,02, soit -2 %"], "Glissement en génératrice."),
  etapes(["redresseur actif : onduleur côté réseau", "courant d'entrée des deux signes", "seule solution qui renvoie au réseau"], "Récupération vers le réseau."),
  () => ({ viewBox: "0 0 620 230", dessin: dessinArchitectureQuiz("fl-qv6"), legende: "L'énergie de freinage est dissipée dans la résistance R_f, commandée par le hacheur T_h." }),
  etapes(["R_f ≤ E_on² / P_g,max", "= 750² / 15 000", "= 37,5 Ω"], "Résistance maximale."),
  etapes(["P = 3 V I cos φ < 0", "donc cos φ < 0", "déphasage supérieur à 90 degrés"], "Courant de phase en génératrice."),
  etapes(["rampe plus longue : moins d'énergie renvoyée", "régulateur : rampe suspendue au seuil", "hacheur : énergie dissipée", "découpage, loi quadratique : sans effet"], "Moyens contre la surtension à l'arrêt."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Avec le couple en abscisse, la vitesse en ordonnée et le sens direct à la montée, dans quel quadrant fonctionne le moteur d'un treuil qui descend une charge à vitesse constante ?</p>",
        options: ["Quadrant 1", "Quadrant 2", "Quadrant 3", "Quadrant 4"],
        bonnes: [3],
        explication: "$\\Omega \\lt 0$ en descente et $C_m \\gt 0$ pour retenir la charge : quadrant 4, génératrice.",
        resume: "Quadrant d'une descente",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Un variateur à pont de diodes peut renvoyer l'énergie de freinage au réseau si l'on inverse l'ordre de deux phases d'alimentation.</p>",
        reponse: false,
        explication: "Quel que soit l'ordre des phases, le courant de sortie d'un pont de diodes reste positif : aucune puissance ne retourne au réseau.",
        resume: "Pont de diodes",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Énergie cinétique d'une pompe d'inertie $0{,}5\\ \\mathrm{kg \\cdot m^2}$ à $1475\\ \\mathrm{tr/min}$, en joules ?</p>",
        valeur: 0.5 * 0.5 * W_NOM * W_NOM,
        unite: "J",
        tolerance: 0.02,
        explication: "$\\frac{1}{2} \\times 0{,}5 \\times 154{,}46^2 = 5965\\ \\mathrm{J}$.",
        resume: "Énergie cinétique",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Que se passe-t-il dans le bus d'un variateur à pont de diodes, sans hacheur, quand le moteur freine une forte inertie ?</p>",
        motsCles: [["tension", "monte", "augmente", "charge"], ["surtension", "declenche", "defaut", "seuil"]],
        minimum: 2,
        explication: "Le pont se bloque, le courant de l'onduleur charge les condensateurs, la tension monte jusqu'au seuil et le variateur déclenche en surtension.",
        resume: "Bus en freinage",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Moteur à quatre pôles, $50\\ \\mathrm{Hz}$, entraîné à $1530\\ \\mathrm{tr/min}$. Glissement, en pour cent ?</p>",
        valeur: -2,
        unite: "%",
        tolerance: 0.02,
        explication: "$g = (1500 - 1530)/1500 = -2\\ \\%$ : la machine est génératrice.",
        resume: "Glissement négatif",
      },
      {
        type: "qcm",
        enonce: repere(5) + "<p>Laquelle de ces solutions renvoie l'énergie de freinage au réseau ?</p>",
        options: ["Le hacheur de freinage", "Le régulateur de surtension", "Le redresseur actif", "L'injection de courant continu"],
        bonnes: [2],
        explication: "Seul un étage d'entrée commandé, comme le redresseur actif, accepte un courant de bus négatif côté réseau.",
        resume: "Récupération",
      },
      {
        type: "schema",
        enonce: repere(6) + "<p>Sur ce schéma simplifié d'un variateur, où l'énergie de freinage est-elle finalement dissipée ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 620 230",
        dessin: dessinArchitectureQuiz("fl-qz"),
        zones: ZONES_ARCHI,
        explication: "Le hacheur ne fait que commuter ; c'est la résistance qu'il commande qui transforme l'énergie en chaleur.",
        resume: "Lecture de l'architecture",
      },
      {
        type: "calcul",
        enonce: repere(7) + "<p>Hacheur enclenché à $750\\ \\mathrm{V}$, puissance de freinage crête de $15\\ \\mathrm{kW}$. Résistance maximale, en ohms ?</p>",
        valeur: 37.5,
        unite: "Ω",
        tolerance: 0.02,
        explication: "$R_f \\le 750^2/15\\,000 = 37{,}5\\ \\Omega$.",
        resume: "Résistance maximale",
      },
      {
        type: "vraiFaux",
        enonce: repere(8) + "<p>Quand la machine asynchrone fonctionne en génératrice sur un variateur, le courant de chaque phase est déphasé de plus de $90$ degrés sur la tension de la même phase.</p>",
        reponse: true,
        explication: "La puissance active $3VI\\cos\\varphi$ est négative, donc $\\cos\\varphi \\lt 0$ : le déphasage dépasse $90$ degrés.",
        resume: "Déphasage en génératrice",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Quelles mesures réduisent le risque de surtension du bus lors de l'arrêt d'une forte inertie ?</p>",
        options: [
          { texte: "Allonger la rampe de décélération", juste: true },
          { texte: "Activer le régulateur de surtension du variateur", juste: true },
          { texte: "Ajouter un hacheur et une résistance de freinage", juste: true },
          { texte: "Augmenter la fréquence de découpage" },
          { texte: "Passer la loi U/f en loi quadratique" },
        ],
        multiple: true,
        explication: "Les trois premières agissent sur l'énergie renvoyée ou sur sa destination ; la fréquence de découpage et la forme de la loi U/f ne changent pas l'énergie mécanique à évacuer.",
        resume: "Moyens contre la surtension",
      },
    ],
    { titre: "Dix questions de fin de séance" }
  );
  if (quiz) ressources.push(quiz);
  brancherVisuelsQuiz(racine, api, "#l-quiz-bloc", VISUELS_QUIZ);
}

/* --------------------------------------------------------------------------
   M. Cartes
   -------------------------------------------------------------------------- */

function construireCartesMemo(racine, api) {
  if (!racine.querySelector("#m-cartes")) return;
  const cartes = api.cartes(
    "#m-cartes",
    [
      { categorie: "Architecture", question: "Quels sont les étages d'un variateur de fréquence à redresseur à diodes ?", reponse: "Fusibles et self de ligne, pont de diodes, précharge, bus continu, hacheur de freinage, onduleur, et la carte de commande avec ses mesures." },
      { categorie: "Loi", question: "Quelle équation gouverne toute variation de vitesse ?", reponse: "$J\\,\\mathrm{d}\\Omega/\\mathrm{d}t = C_m - C_r$ ; multipliée par $\\Omega$, elle donne le bilan d'énergie de l'arbre." },
      { categorie: "Convention", question: "Comment reconnaître un fonctionnement en génératrice dans le plan couple et vitesse ?", reponse: "Couple et vitesse de signes contraires : $P_m = C_m\\Omega \\lt 0$. Quadrants 2 et 4 avec le couple en abscisse." },
      { categorie: "Machine", question: "Quand une machine asynchrone sur variateur devient-elle génératrice ?", reponse: "Dès que la fréquence imposée place le synchronisme sous la vitesse du rotor : $g \\lt 0$, couple opposé à la rotation." },
      { categorie: "Formule", question: "Couple asynchrone au voisinage du synchronisme ?", reponse: "$C_m \\approx C_n\\,(n_s - n)/(n_s - n_n)$, à flux constant, dans les deux sens de puissance." },
      { categorie: "Bus", question: "Quelle énergie un bus peut-il absorber avant déclenchement ?", reponse: "$\\frac{1}{2}C_\\mathrm{bus}(E_{\\max}^2 - E_0^2)$ : $383\\ \\mathrm{J}$ pour $2{,}2\\ \\mathrm{mF}$ de $540$ à $800\\ \\mathrm{V}$." },
      { categorie: "Énergie", question: "Quelle énergie remonte au bus lors d'un ralentissement ?", reponse: "$\\eta$ fois la variation d'énergie cinétique moins le travail de la charge ; en descente, $\\eta\\,\\eta_\\text{méca}\\,mgh$." },
      { categorie: "Dimensionnement", question: "Comment choisir la résistance de freinage ?", reponse: "$R_{f,\\min} \\le R_f \\le E_\\mathrm{on}^2/P_{g,\\max}$, puis énergie par freinage et puissance moyenne sur le cycle." },
      { categorie: "Comparaison", question: "Quelles solutions pour l'énergie de freinage ?", reponse: "Rampe allongée ou régulateur de surtension, roue libre, hacheur et résistance, bus commun, redresseur actif, freinage dans le moteur." },
      { categorie: "Diagnostic", question: "Un défaut de surtension n'apparaît qu'à l'arrêt : que vérifier ?", reponse: "La rampe de décélération, le régulateur de surtension, le hacheur et la continuité de la résistance, puis enregistrer la tension du bus." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["W = 0,5 × 2,2 mF × (800² - 540²)", "= 1,1e-3 × 348 400", "= 383 J"], "Réserve du bus de la pompe."),
  etapes(["quadrant 2 : C_m < 0, Ω > 0", "P_m = C_m Ω < 0", "la machine freine, elle ne fournit pas"], "Quadrant 2."),
  etapes(["couple quadratique : fort à haute vitesse", "la pompe freine seule la plus grande part", "seul le bas de rampe peut renvoyer un peu"], "Freinage naturel d'une pompe."),
  etapes(["i_bus moyen = P / E", "= 19 270 / 523,9", "= 36,8 A"], "Courant moyen du bus de l'onduleur."),
  etapes(["U max = E / √2 en vectorielle", "= 540 / 1,4142", "= 381,8 V"], "Limite linéaire de la modulation vectorielle."),
  etapes(["V_d0 = 3 √2 U / π", "= 1,3505 × 400", "= 540,2 V"], "Tension moyenne à vide du PD3."),
  etapes(["I = P / (√3 U cos φ)", "= 20 000 / (1,732 × 400 × 0,85)", "= 34,0 A"], "Courant de ligne d'un récepteur triphasé."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Énergie qu'un bus de $2{,}2\\ \\mathrm{mF}$ peut absorber entre $540$ et $800\\ \\mathrm{V}$, en joules ?</p>",
        valeur: 0.5 * 2.2e-3 * (800 * 800 - 540 * 540),
        unite: "J",
        tolerance: 0.02,
        explication: "$\\frac{1}{2} \\times 2{,}2 \\times 10^{-3} \\times (800^2 - 540^2) = 383\\ \\mathrm{J}$.",
        resume: "Réserve du bus",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Avec le couple en abscisse et la vitesse en ordonnée, un point du quadrant 2 correspond à une machine qui fournit de la puissance mécanique à sa charge.</p>",
        reponse: false,
        explication: "Quadrant 2 : $C_m \\lt 0$ et $\\Omega \\gt 0$, donc $P_m \\lt 0$ : la charge entraîne la machine, qui freine.",
        resume: "Quadrant 2",
      },
      {
        type: "courte",
        enonce: repere(2) + "<p>Cette séance. Pourquoi une pompe centrifuge arrêtée par une rampe de quelques secondes n'a-t-elle généralement pas besoin de résistance de freinage ?</p>",
        motsCles: [["couple", "charge", "pompe", "quadratique"], ["frein", "ralenti", "absorbe", "naturel"]],
        minimum: 2,
        explication: "Son couple résistant, quadratique, freine fortement à haute vitesse : la charge absorbe l'essentiel de l'énergie cinétique, et seul le bas de la rampe renvoie un peu d'énergie au bus.",
        resume: "Freinage naturel d'une pompe",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Onduleurs triphasés. Un onduleur absorbe $19{,}27\\ \\mathrm{kW}$ sur un bus de $523{,}9\\ \\mathrm{V}$. Courant moyen du bus, en ampères ?</p>",
        valeur: 19270 / 523.9,
        unite: "A",
        tolerance: 0.02,
        explication: "$19\\,270/523{,}9 = 36{,}8\\ \\mathrm{A}$, sans pulsation à $2f$ pour une charge équilibrée.",
        resume: "Courant de bus",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Cours Onduleurs triphasés. Tension composée efficace maximale en modulation vectorielle linéaire, pour un bus de $540\\ \\mathrm{V}$, en volts ?</p>",
        valeur: 540 / Math.SQRT2,
        unite: "V",
        tolerance: 0.01,
        explication: "$E/\\sqrt{2} = 381{,}8\\ \\mathrm{V}$.",
        resume: "Limite vectorielle",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Redresseurs triphasés. Tension moyenne à vide d'un pont PD3 à diodes sur un réseau de $400\\ \\mathrm{V}$ entre phases, en volts ?</p>",
        valeur: (3 * Math.SQRT2 * 400) / Math.PI,
        unite: "V",
        tolerance: 0.01,
        explication: "$V_{d0} = \\frac{3\\sqrt{2}}{\\pi}U = 1{,}35 \\times 400 = 540{,}2\\ \\mathrm{V}$.",
        resume: "Tension du PD3",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Systèmes triphasés équilibrés. Un récepteur triphasé équilibré absorbe $20\\ \\mathrm{kW}$ sous $400\\ \\mathrm{V}$ avec un facteur de puissance de $0{,}85$. Courant de ligne, en ampères ?</p>",
        valeur: 20000 / (RAC3 * 400 * 0.85),
        unite: "A",
        tolerance: 0.02,
        explication: "$I = P/(\\sqrt{3}U\\cos\\varphi) = 20\\,000/(1{,}732 \\times 400 \\times 0{,}85) = 34{,}0\\ \\mathrm{A}$.",
        resume: "Courant de ligne",
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
  if (!racine.querySelector("#p-autoevaluation-grille")) return;
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur les convertisseurs et les moteurs ?",
  });
  if (auto) ressources.push(auto);
}
