/* ==========================================================================
   cours/revision-3-et-analyse-d-une-charge-ac/cours.js
   Révision 3 et analyse d'une charge AC.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const U = 230;
const W = TAU * 50;

/* Exemple de la section H : atelier de conditionnement. */
const EX = { pm: 4000, cm: 0.72, pf: 2000, pe: 1000, ce: 0.95, rl: 0.2, xl: 0.1 };

/* Départ de l'atelier de maintenance du site (section I). */
const SITE = { rho: 0.0206, x: 0.08e-3, ls: 0.204e-3, sections: [6, 10, 16, 25], p1: 21600, q1: 3690, sPhase: 100e3 / 3 };

function tanDe(cosinus) {
  return Math.tan(Math.acos(cosinus));
}

/** Bilan de l'atelier de l'exemple, éclairage fixe, condensateur c en farads. */
function bilanAtelier(pm, cm, pf, c) {
  const qm = pm * tanDe(cm);
  const qe = -EX.pe * tanDe(EX.ce);
  const qc = U * U * W * c;
  const p = pm + pf + EX.pe;
  const q = qm + qe - qc;
  const s = Math.hypot(p, q);
  return {
    qm,
    qe,
    qc,
    p,
    q,
    s,
    i: s / U,
    lambda: s > 0 ? p / s : 1,
    phi: Math.atan2(q, p) / DEG,
    im: { re: pm / U, im: -qm / U },
    if: { re: pf / U, im: 0 },
    ie: { re: EX.pe / U, im: -qe / U },
    ic: { re: 0, im: qc / U },
    somme: pm / (cm * U) + pf / U + EX.pe / (EX.ce * U) + qc / U,
  };
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

/** Ligne horizontale sur un tracé, avec son libellé. */
function ligneH(c, repere, couleurs, y, libelle, enDessous, tirets = [7, 5]) {
  const py = repere.versY(y);
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.setLineDash(tirets);
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

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeursAnimation = [];

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireInstallation(racine, api);
  construirePuissance(racine, api);
  construireChaine(racine, api);
  construireConstruction(racine, api);
  construireAtelier(racine, api);
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
    ["#e-installation-figure svg", 1.8],
    ["#f-schema-principal svg", 2.2],
    ["#f-triangles svg", 1.6],
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
      id: "c-ohm",
      titre: "Loi d'Ohm complexe",
      niveau: "prérequis",
      enonce: "<p>Un récepteur d'impédance $\\underline{Z} = 8 + j6\\ \\Omega$ est alimenté sous $230\\ \\mathrm{V}$. Quel est le courant efficace absorbé ?</p>",
      valeur: 23,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant $I$",
      etapes: [
        { texte: "$|\\underline{Z}| = \\sqrt{8^2 + 6^2} = 10\\ \\Omega$ ; $\\varphi = \\arctan(6/8) = 36{,}87^\\circ$, inductif." },
        { texte: "$I = U/|\\underline{Z}| = 230/10 = 23\\ \\mathrm{A}$, en retard de $36{,}87^\\circ$ sur la tension.", note: "Puissances : $P = RI^2 = 4232\\ \\mathrm{W}$, $Q = XI^2 = 3174\\ \\mathrm{var}$, $S = 5290\\ \\mathrm{VA}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Tension de référence et courant en retard",
          unite: "",
          vecteurs: [
            { id: "u", nom: "U / 10, en volts divisés par 10", amplitude: 23, phase: 0, couleur: "serie-1" },
            { id: "i", nom: "I, en ampères", amplitude: 23, phase: -36.87, couleur: "serie-5", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-condensateur",
      titre: "Réactif d'un condensateur",
      niveau: "prérequis",
      enonce: "<p>Quelle puissance réactive, en vars, fournit un condensateur de $50\\ \\mu\\mathrm{F}$ sous $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$ ? Donnez la valeur absolue.</p>",
      valeur: U * U * W * 50e-6,
      unite: "var",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Réactif $|Q_C|$",
      etapes: [
        { texte: "$X_C = 1/(C\\omega) = 1/(50 \\times 10^{-6} \\times 314{,}16) = 63{,}66\\ \\Omega$." },
        { texte: "$|Q_C| = U^2/X_C = U^2C\\omega = 52\\,900/63{,}66 = 830{,}95\\ \\mathrm{var}$, compté négatif en convention récepteur.", note: "Repère : $16{,}6\\ \\mathrm{var}$ par microfarad sous $230\\ \\mathrm{V}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réactif fourni sous 230 V en fonction de la capacité",
          xTitre: "C",
          xUnite: "µF",
          yTitre: "|QC|",
          yUnite: "var",
          xMin: 0,
          xMax: 150,
          yMin: 0,
          yMax: 2600,
          series: [{ id: "q", nom: "|QC| = U² C ω", couleur: "serie-3", epaisseur: 2.6, fonction: (c) => U * U * W * c * 1e-6 }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 50, U * U * W * 50e-6, "50 µF : 831 var", false);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-courant",
      titre: "Courant d'une charge à partir de sa plaque",
      niveau: "prérequis",
      enonce: "<p>Une charge absorbe $5\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}80$ sous $230\\ \\mathrm{V}$. Quel courant appelle-t-elle ?</p>",
      valeur: 5000 / 0.8 / U,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant $I$",
      etapes: [
        { texte: "$S = P/\\cos\\varphi = 5000/0{,}80 = 6250\\ \\mathrm{VA}$." },
        { texte: "$I = S/U = 6250/230 = 27{,}17\\ \\mathrm{A}$ ; $Q = P\\tan\\varphi = 3750\\ \\mathrm{var}$.", note: "Le courant actif ne serait que $P/U = 21{,}74\\ \\mathrm{A}$ : le réactif ajoute $25\\ \\%$." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Triangle des puissances : P, Q et S",
          unite: "",
          somme: true,
          nomSomme: "S = 6250 VA",
          vecteurs: [
            { id: "p", nom: "P, en W", amplitude: 5000, phase: 0, couleur: "serie-1" },
            { id: "q", nom: "Q, en var", amplitude: 3750, phase: 90, couleur: "serie-3", pointille: true },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Simulation : trois charges, un condensateur et le courant de ligne
   -------------------------------------------------------------------------- */

function construireInstallation(racine, api) {
  const conteneur = racine.querySelector("#d-installation");
  if (!conteneur) return;

  const O = { x: 40, y: 175 };
  const T = { x: 420, y: 235 };
  const REGLE = { x0: 60, x1: 700, y: 392, cMax: 250 };
  const versXc = (c) => REGLE.x0 + (c / REGLE.cMax) * (REGLE.x1 - REGLE.x0);

  const svg = svgEl("svg", {
    viewBox: "0 0 760 420",
    role: "img",
    "aria-label": "Phaseurs des courants du moteur, du four, de l'éclairage et du condensateur mis bout à bout avec le courant de ligne, triangle des puissances, et règle de la capacité avec sa poignée",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-d-i");
  let graduations = "";
  let textes = "";
  for (let c = 0; c <= REGLE.cMax; c += 50) {
    graduations += "M" + versXc(c).toFixed(1) + " " + (REGLE.y - 5) + "v10";
    textes += texte(versXc(c), REGLE.y + 22, String(c), ' text-anchor="middle"');
  }
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7">' +
    '<path d="M' + O.x + " " + O.y + "H360" + '" marker-end="url(#fl-d-i)"/>' +
    '<path d="M' + REGLE.x0 + " " + REGLE.y + "H" + REGLE.x1 + '"/>' +
    '<path d="' + graduations + '"/>' +
    '<path d="M390 20V360" stroke-dasharray="2 4"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="10.5" opacity="0.9">' +
    textes +
    texte(REGLE.x1 + 8, REGLE.y + 4, "C (µF)") +
    texte(356, O.y - 8, "U", ' text-anchor="end"') +
    texte(14, 20, "Courants, référence U") +
    texte(404, 20, "Puissances, Q vers le haut si inductif") +
    "</g>";
  const traits = {
    im: svgEl("path", { stroke: "currentColor", "stroke-width": 3.4, fill: "none", "marker-end": "url(#fl-d-i)" }),
    if: svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "marker-end": "url(#fl-d-i)" }),
    ie: svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", "marker-end": "url(#fl-d-i)" }),
    ic: svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "stroke-dasharray": "2 3", "marker-end": "url(#fl-d-i)" }),
    i: svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "stroke-dasharray": "11 6", "marker-end": "url(#fl-d-i)" }),
    p: svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "marker-end": "url(#fl-d-i)" }),
    q: svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "marker-end": "url(#fl-d-i)" }),
    s: svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-dasharray": "11 6", "marker-end": "url(#fl-d-i)" }),
    arc: svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none" }),
  };
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  svg.append(defs, fond, traits.im, traits.if, traits.ie, traits.ic, traits.i, traits.p, traits.q, traits.s, traits.arc, etiquettes);
  conteneur.appendChild(svg);

  const etat = { pm: EX.pm, cm: EX.cm, pf: EX.pf, c: 0 };

  const trace = api.sim.traceur("#d-installation-trace", {
    titre: "Courant de ligne en fonction de la capacité de compensation",
    genre: "Simulation",
    xTitre: "C",
    xUnite: "µF",
    yTitre: "I",
    yUnite: "A",
    xMin: 0,
    xMax: REGLE.cMax,
    yMin: 0,
    yMax: 45,
    ratio: 0.38,
    echantillons: 500,
    series: [{ id: "i", nom: "I(C), courant de ligne", couleur: "serie-1", epaisseur: 2.6 }],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, etat.c * 1e6, "C choisie");
      const b = bilanAtelier(etat.pm, etat.cm, etat.pf, 0);
      const cOpt = (b.q / (U * U * W)) * 1e6;
      if (cOpt > 0) ligneV(c, repere, couleurs, cOpt, "Q = 0", 1.4, [2, 3]);
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#d-installation-valeurs", [
    { id: "c", libelle: "Capacité C", unite: "µF", decimales: 1 },
    { id: "courants", libelle: "IM, IF, IE, IC", format: (v) => v },
    { id: "arith", libelle: "Somme arithmétique des courants", unite: "A", decimales: 2 },
    { id: "i", libelle: "Courant de ligne I", unite: "A", decimales: 2 },
    { id: "p", libelle: "P = Σ Pk", unite: "W", decimales: 0 },
    { id: "q", libelle: "Q = Σ Qk, signée", unite: "var", decimales: 0 },
    { id: "s", libelle: "S = √(P² + Q²)", unite: "VA", decimales: 0 },
    { id: "lambda", libelle: "Facteur de puissance et nature", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const b = bilanAtelier(etat.pm, etat.cm, etat.pf, etat.c);
    /* Échelle des courants adaptée aux extrémités de la chaîne */
    const p1 = { re: b.im.re, im: b.im.im };
    const p2 = { re: p1.re + b.if.re, im: p1.im };
    const p3 = { re: p2.re + b.ie.re, im: p2.im + b.ie.im };
    const p4 = { re: p3.re, im: p3.im + b.ic.im };
    const reMax = Math.max(p4.re, 1);
    const bas = Math.max(0.1, -Math.min(p1.im, p2.im, p3.im, p4.im, 0));
    const haut = Math.max(0.1, Math.max(p1.im, p2.im, p3.im, p4.im, 0));
    const k = Math.min(8, 290 / reMax, 160 / bas, 140 / haut);
    const pt = (z) => ({ x: O.x + k * z.re, y: O.y - k * z.im });
    const a1 = pt(p1);
    const a2 = pt(p2);
    const a3 = pt(p3);
    const a4 = pt(p4);
    traits.im.setAttribute("d", segment(O.x, O.y, a1.x, a1.y));
    traits.if.setAttribute("d", segment(a1.x, a1.y, a2.x, a2.y));
    traits.ie.setAttribute("d", segment(a2.x, a2.y, a3.x, a3.y));
    traits.ic.setAttribute("d", b.qc > 1 ? segment(a3.x, a3.y, a4.x, a4.y) : "");
    traits.i.setAttribute("d", segment(O.x, O.y, a4.x, a4.y));

    /* Triangle des puissances */
    const kp = Math.min(300 / b.p, b.q > 0 ? 190 / b.q : Infinity, b.q < 0 ? 115 / -b.q : Infinity);
    const tp = { x: T.x + kp * b.p, y: T.y };
    const tq = { x: tp.x, y: T.y - kp * b.q };
    traits.p.setAttribute("d", segment(T.x, T.y, tp.x, tp.y));
    traits.q.setAttribute("d", Math.abs(b.q) * kp > 4 ? segment(tp.x, tp.y, tq.x, tq.y) : "");
    traits.s.setAttribute("d", segment(T.x, T.y, tq.x, tq.y));
    const r = 54;
    const phi = Math.atan2(b.q, b.p);
    const fin = { x: T.x + r * Math.cos(phi), y: T.y - r * Math.sin(phi) };
    traits.arc.setAttribute(
      "d",
      Math.abs(phi) > 0.02 ? "M" + (T.x + r) + " " + T.y + "A" + r + " " + r + " 0 0 " + (phi > 0 ? 0 : 1) + " " + fin.x.toFixed(1) + " " + fin.y.toFixed(1) : ""
    );

    const nature = Math.abs(b.q) < 20 ? "résistif" : b.q > 0 ? "inductif" : "capacitif";
    const poignee = versXc(etat.c * 1e6);
    etiquettes.innerHTML =
      texte((O.x + a1.x) / 2 - 6, (O.y + a1.y) / 2 + 4, "IM", ' text-anchor="end"') +
      texte((a1.x + a2.x) / 2, a1.y + 18, "IF", ' text-anchor="middle"') +
      texte(a3.x + 6, a3.y + 16, "IE") +
      (b.qc > 1 ? texte(a4.x + 8, (a3.y + a4.y) / 2, "IC") : "") +
      texte((O.x + a4.x) / 2 + 6, (O.y + a4.y) / 2 - 8, "I = " + nombre(api, b.i, 2) + " A", ' font-weight="600"') +
      texte((T.x + tp.x) / 2, T.y + 18, "P = " + nombre(api, b.p / 1000, 2) + " kW", ' text-anchor="middle"') +
      (Math.abs(b.q) * kp > 14 ? texte(tp.x - 8, (tp.y + tq.y) / 2 + 4, "Q = " + nombre(api, b.q / 1000, 2) + " kvar", ' text-anchor="end"') : "") +
      texte(T.x + 20, Math.min(T.y, tq.y) - 34, "S = " + nombre(api, b.s / 1000, 2) + " kVA", ' font-weight="600"') +
      texte(T.x + r + 6, T.y - (phi > 0 ? 8 : -16), "φ = " + nombre(api, b.phi, 1) + "°", ' font-size="11"') +
      texte(404, 352, "λ = " + nombre(api, b.lambda, 3) + ", " + nature, ' font-size="11.5"') +
      texte(poignee, REGLE.y - 14, nombre(api, etat.c * 1e6, 0) + " µF", ' text-anchor="middle" font-size="11"');

    if (trace) {
      let maxi = 0;
      for (let cc = 0; cc <= REGLE.cMax; cc += 5) maxi = Math.max(maxi, bilanAtelier(etat.pm, etat.cm, etat.pf, cc * 1e-6).i);
      trace.definirPlage({ yMax: Math.ceil((maxi * 1.12) / 5) * 5 });
      trace.definirFonction("i", (cc) => bilanAtelier(etat.pm, etat.cm, etat.pf, cc * 1e-6).i);
    }
    if (valeurs) {
      valeurs.maj({
        c: etat.c * 1e6,
        courants:
          nombre(api, Math.hypot(b.im.re, b.im.im), 2) + " ; " + nombre(api, b.if.re, 2) + " ; " +
          nombre(api, Math.hypot(b.ie.re, b.ie.im), 2) + " ; " + nombre(api, b.ic.im, 2) + " A",
        arith: b.somme,
        i: b.i,
        p: b.p,
        q: b.q,
        s: b.s,
        lambda: nombre(api, b.lambda, 3) + ", " + nature + ", φ = " + nombre(api, b.phi, 1) + "°",
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: REGLE.x0, y: REGLE.y },
    a: { x: REGLE.x1, y: REGLE.y },
    min: 0,
    max: REGLE.cMax,
    pas: 0.5,
    valeur: 0,
    libelle: "Capacité du condensateur de compensation",
    format: (mesure) => "capacité " + nombre(api, mesure.valeur, 1) + " microfarads",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.c = mesure.valeur * 1e-6;
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-installation-curseurs",
    [
      { id: "pm", libelle: "Puissance absorbée par le moteur", min: 0.5, max: 8, pas: 0.1, valeur: EX.pm / 1000, unite: "kW" },
      { id: "cm", libelle: "Facteur de puissance du moteur", min: 0.5, max: 0.95, pas: 0.01, valeur: EX.cm, chiffres: 2 },
      { id: "pf", libelle: "Puissance du four", min: 0, max: 6, pas: 0.1, valeur: EX.pf / 1000, unite: "kW" },
    ],
    (lues) => {
      etat.pm = lues.pm * 1000;
      etat.cm = lues.cm;
      etat.pf = lues.pf * 1000;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   D. Animation : puissance instantanée de l'atelier
   -------------------------------------------------------------------------- */

function construirePuissance(racine, api) {
  const etat = { c: 0, t: 0 };
  const grandeurs = () => {
    const b = bilanAtelier(EX.pm, EX.cm, EX.pf, etat.c);
    const phi = b.phi * DEG;
    const um = U * Math.SQRT2;
    const imax = b.i * Math.SQRT2;
    return {
      b,
      phi,
      u: (t) => Math.cos(W * t / 1000),
      i: (t) => Math.cos(W * t / 1000 - phi),
      p: (t) => (um * Math.cos(W * t / 1000) * imax * Math.cos(W * t / 1000 - phi)) / 1000,
    };
  };

  const traceUi = api.sim.traceur("#d-puissance-trace", {
    titre: "Tension et courant de ligne, chacun rapporté à sa crête",
    genre: "Animation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "valeur réduite",
    xMin: 0,
    xMax: 40,
    yMin: -1.15,
    yMax: 1.15,
    ratio: 0.3,
    echantillons: 500,
    series: [
      { id: "u", nom: "u(t) / Umax, tension", couleur: "serie-1", epaisseur: 2.4 },
      { id: "i", nom: "i(t) / Imax, courant de ligne", couleur: "serie-5", epaisseur: 2.4 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, etat.t, "instant");
    },
  });
  if (traceUi) ressources.push(traceUi);

  const traceP = api.sim.traceur("#d-puissance-p", {
    titre: "Puissance instantanée p(t) = u(t) i(t)",
    genre: "Animation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "p",
    yUnite: "kW",
    xMin: 0,
    xMax: 40,
    yMin: -2,
    yMax: 16,
    ratio: 0.32,
    echantillons: 500,
    series: [{ id: "p", nom: "p(t), puissance instantanée", couleur: "serie-2", epaisseur: 2.6 }],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, EX.pm / 1000 + EX.pf / 1000 + EX.pe / 1000, "P = 7 kW", false);
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
      ligneV(c, repere, couleurs, etat.t, "instant");
    },
  });
  if (traceP) ressources.push(traceP);

  const valeurs = api.sim.valeurs("#d-puissance-valeurs", [
    { id: "t", libelle: "Instant t", unite: "ms", decimales: 2 },
    { id: "p", libelle: "Puissance instantanée", unite: "kW", decimales: 2 },
    { id: "moy", libelle: "Valeur moyenne P", unite: "kW", decimales: 2 },
    { id: "s", libelle: "Amplitude de l'oscillation, S", unite: "kVA", decimales: 2 },
    { id: "min", libelle: "Minimum P - S", unite: "kW", decimales: 2 },
    { id: "frac", libelle: "Part du temps où p < 0, |φ| / 180°", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const g = grandeurs();
    if (traceUi) {
      traceUi.definirFonction("u", g.u);
      traceUi.definirFonction("i", g.i);
    }
    if (traceP) traceP.definirFonction("p", g.p);
    if (valeurs) {
      valeurs.maj({
        t: etat.t,
        p: g.p(etat.t),
        moy: g.b.p / 1000,
        s: g.b.s / 1000,
        min: (g.b.p - g.b.s) / 1000,
        frac: nombre(api, (Math.abs(g.b.phi) / 180) * 100, 1) + " %" + (g.b.phi < -0.05 ? ", installation capacitive" : ""),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#d-puissance-curseurs",
    [{ id: "c", libelle: "Capacité de compensation C", min: 0, max: 250, pas: 0.5, valeur: 0, unite: "µF" }],
    (lues) => {
      etat.c = lues.c * 1e-6;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-puissance-lecteur", {
    de: 0,
    a: 40,
    duree: 14,
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
   E. Animation : vecteur tournant et projection
   -------------------------------------------------------------------------- */

function construireChaine(racine, api) {
  const conteneur = racine.querySelector("#e-chaine");
  if (!conteneur) return;

  const C = { x: 140, y: 150 };
  const R_U = 105;
  const R_I = 78;
  const G = { x0: 290, x1: 740 };
  const versXa = (a) => G.x0 + (a / 360) * (G.x1 - G.x0);

  const svg = svgEl("svg", {
    viewBox: "0 0 760 300",
    role: "img",
    "aria-label": "Cercle des phaseurs avec les vecteurs tension et courant tournant ensemble, et sinusoïdes construites par leur projection verticale en fonction de l'angle oméga t",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-c");
  let grad = "";
  let txt = "";
  for (let a = 0; a <= 360; a += 90) {
    grad += "M" + versXa(a).toFixed(1) + " " + (C.y - 4) + "v8";
    txt += texte(versXa(a), C.y + 20, a + "°", ' text-anchor="middle"');
  }
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.6">' +
    '<circle cx="' + C.x + '" cy="' + C.y + '" r="' + R_U + '"/>' +
    '<circle cx="' + C.x + '" cy="' + C.y + '" r="' + R_I + '" stroke-dasharray="2 4"/>' +
    '<path d="M' + (C.x - R_U - 12) + " " + C.y + "H" + (C.x + R_U + 12) + "M" + C.x + " " + (C.y + R_U + 12) + "V" + (C.y - R_U - 12) + '"/>' +
    '<path d="M' + G.x0 + " " + C.y + "H" + (G.x1 + 10) + '" marker-end="url(#fl-e-c)"/>' +
    '<path d="M' + G.x0 + " " + (C.y + R_U + 10) + "V" + (C.y - R_U - 14) + '" marker-end="url(#fl-e-c)"/>' +
    '<path d="' + grad + '"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="10.5" opacity="0.9">' +
    txt +
    texte(G.x1 + 10, C.y - 8, "ωt", ' text-anchor="end"') +
    texte(G.x0 + 6, C.y - R_U - 16, "valeur / crête") +
    texte(C.x, 292, "rotation : sens trigonométrique", ' text-anchor="middle"') +
    "</g>";
  const courbeU = svgEl("path", { stroke: "currentColor", "stroke-width": 2.6, fill: "none" });
  const courbeI = svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "none", "stroke-dasharray": "7 5" });
  const vu = svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "marker-end": "url(#fl-e-c)" });
  const vi = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none", "stroke-dasharray": "7 5", "marker-end": "url(#fl-e-c)" });
  const liens = svgEl("path", { stroke: "currentColor", "stroke-width": 1, fill: "none", "stroke-dasharray": "2 3", opacity: 0.8 });
  const points = svgEl("g", { fill: "currentColor", stroke: "none" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, courbeU, courbeI, liens, vu, vi, points, etiquettes);
  conteneur.appendChild(svg);

  const etat = { phi: 26.74, a: 0 };

  const valeurs = api.sim.valeurs("#e-chaine-valeurs", [
    { id: "a", libelle: "Angle ωt", unite: "°", decimales: 1 },
    { id: "t", libelle: "Instant à 50 Hz", unite: "ms", decimales: 2 },
    { id: "u", libelle: "u / Umax = cos ωt", decimales: 3 },
    { id: "i", libelle: "i / Imax = cos(ωt - φ)", decimales: 3 },
    { id: "retard", libelle: "Retard du courant sur la tension", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const phi = etat.phi * DEG;
    const th = etat.a * DEG;
    /* vecteur à l'angle ωt + 90° : projection verticale égale à cos ωt */
    const pu = { x: C.x + R_U * Math.cos(th + Math.PI / 2), y: C.y - R_U * Math.sin(th + Math.PI / 2) };
    const pi = { x: C.x + R_I * Math.cos(th - phi + Math.PI / 2), y: C.y - R_I * Math.sin(th - phi + Math.PI / 2) };
    vu.setAttribute("d", segment(C.x, C.y, pu.x, pu.y));
    vi.setAttribute("d", segment(C.x, C.y, pi.x, pi.y));
    let cu = "";
    let ci = "";
    const n = Math.max(1, Math.round(etat.a / 2));
    for (let k = 0; k <= n; k += 1) {
      const a = (etat.a * k) / n;
      cu += (k === 0 ? "M" : "L") + versXa(a).toFixed(1) + " " + (C.y - R_U * Math.cos(a * DEG)).toFixed(1);
      ci += (k === 0 ? "M" : "L") + versXa(a).toFixed(1) + " " + (C.y - R_I * Math.cos(a * DEG - phi)).toFixed(1);
    }
    courbeU.setAttribute("d", etat.a > 0.5 ? cu : "");
    courbeI.setAttribute("d", etat.a > 0.5 ? ci : "");
    const qu = { x: versXa(etat.a), y: pu.y };
    const qi = { x: versXa(etat.a), y: pi.y };
    liens.setAttribute("d", "M" + pu.x.toFixed(1) + " " + pu.y.toFixed(1) + "H" + qu.x.toFixed(1) + "M" + pi.x.toFixed(1) + " " + pi.y.toFixed(1) + "H" + qi.x.toFixed(1));
    points.innerHTML =
      '<circle cx="' + qu.x.toFixed(1) + '" cy="' + qu.y.toFixed(1) + '" r="5"/>' +
      '<circle cx="' + qi.x.toFixed(1) + '" cy="' + qi.y.toFixed(1) + '" r="4" fill="none" stroke="currentColor" stroke-width="2"/>';
    etiquettes.innerHTML =
      texte(pu.x + (pu.x >= C.x ? 8 : -8), pu.y - 6, "U", pu.x >= C.x ? ' font-weight="600"' : ' text-anchor="end" font-weight="600"') +
      texte(pi.x + (pi.x >= C.x ? 8 : -8), pi.y + 14, "I", pi.x >= C.x ? "" : ' text-anchor="end"') +
      texte(14, 22, "φ = " + nombre(api, etat.phi, 2) + "°, " + (Math.abs(etat.phi) < 0.5 ? "résistif" : etat.phi > 0 ? "inductif" : "capacitif"), ' font-size="11"') +
      texte(G.x1, 22, "U : trait plein ; I : tirets", ' text-anchor="end" font-size="11"');
    if (valeurs) {
      valeurs.maj({
        a: etat.a,
        t: (etat.a / 360) * 20,
        u: Math.cos(th),
        i: Math.cos(th - phi),
        retard: nombre(api, (etat.phi / 360) * 20, 2) + " ms" + (etat.phi < 0 ? ", donc une avance" : ""),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-chaine-curseurs",
    [{ id: "phi", libelle: "Déphasage φ de u sur i", min: -90, max: 90, pas: 0.01, valeur: 26.74, unite: "°" }],
    (lues) => {
      etat.phi = lues.phi;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-chaine-lecteur", {
    de: 0,
    a: 360,
    duree: 9,
    boucle: true,
    auto: false,
    libelle: "Faire tourner les phaseurs sur une période",
    rappel(valeur) {
      etat.a = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(120);
  } else {
    etat.a = 120;
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   H. Animation : construction des diagrammes de Fresnel de l'exemple
   -------------------------------------------------------------------------- */

function construireConstruction(racine, api) {
  const conteneur = racine.querySelector("#h-construction");
  if (!conteneur) return;

  const b = bilanAtelier(EX.pm, EX.cm, EX.pf, 0);
  const qc = b.p * (b.q / b.p - tanDe(0.98));
  const ic = qc / U;
  const KI = 7;
  const KV = 12;
  const O = { x: 40, y: 110 };
  const pt = (re, im) => ({ x: O.x + KI * re, y: O.y - KI * im });
  const a1 = pt(b.im.re, b.im.im);
  const a2 = pt(b.im.re + b.if.re, b.im.im);
  const a3 = pt(b.im.re + b.if.re + b.ie.re, b.im.im + b.ie.im);
  const a4 = pt(b.im.re + b.if.re + b.ie.re, b.im.im + b.ie.im + ic);

  /* Diagramme des tensions, U réel */
  const phi = b.phi * DEG;
  const ri = EX.rl * b.i;
  const xi = EX.xl * b.i;
  const V = { x: 440, y: 200, tip: 600 };
  const v1 = { x: V.tip + KV * ri * Math.cos(-phi), y: V.y - KV * ri * Math.sin(-phi) };
  const v2 = { x: v1.x + KV * xi * Math.cos(Math.PI / 2 - phi), y: v1.y - KV * xi * Math.sin(Math.PI / 2 - phi) };
  const e = U + (EX.rl * b.p + EX.xl * b.q) / U;

  const svg = svgEl("svg", {
    viewBox: "0 0 800 380",
    role: "img",
    "aria-label": "Construction pas à pas : à gauche somme des courants du moteur, du four, de l'éclairage, puis courant du condensateur ; à droite tension des récepteurs, chutes résistive et réactive, et force électromotrice",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-h-k");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.6">' +
    '<path d="M' + O.x + " " + O.y + 'H360" marker-end="url(#fl-h-k)"/>' +
    '<path d="M390 20V360" stroke-dasharray="2 4"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
    texte(356, O.y - 8, "direction de U", ' text-anchor="end"') +
    texte(14, 356, "courants : 7 unités par ampère") +
    texte(410, 356, "chutes : 12 unités par volt ; U raccourci") +
    "</g>";
  const tr = (largeur, tirets) =>
    svgEl("path", { stroke: "currentColor", "stroke-width": largeur, fill: "none", "marker-end": "url(#fl-h-k)", ...(tirets ? { "stroke-dasharray": tirets } : {}) });
  const t = {
    im: tr(3.4),
    if: tr(2.2),
    ie: tr(1.4),
    i: tr(3.2, "11 6"),
    ic: tr(2.2, "2 3"),
    ip: tr(1.8, "6 4"),
    u: tr(2.4),
    ri: tr(3.4),
    xi: tr(2.2),
    e: tr(3.2, "11 6"),
  };
  const coupure = svgEl("path", { stroke: "currentColor", "stroke-width": 1.6, fill: "none" });
  const reperes = svgEl("path", { stroke: "currentColor", "stroke-width": 1, fill: "none", "stroke-dasharray": "2 3", opacity: 0.8 });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  svg.append(defs, fond, coupure, reperes);
  for (const cle of Object.keys(t)) svg.append(t[cle]);
  svg.append(etiquettes);
  conteneur.appendChild(svg);

  const ETAPES = [
    "1. IM = 24,15 A, en retard de 43,95°",
    "2. + IF = 8,70 A, en phase avec U",
    "3. + IE = 4,58 A, en avance de 18,19°",
    "4. I = 34,08 A, en retard de 26,74°",
    "5. + IC = 9,15 A, en avance de 90°",
    "6. I' = 31,06 A, en retard de 11,48°",
    "7. U = 230 V, puis Rl I = 6,82 V, parallèle à I",
    "8. jXl I = 3,41 V, en avance de 90° sur I",
    "9. E = 237,62 V, chute de 7,62 V",
    "Construction terminée",
  ];

  const valeurs = api.sim.valeurs("#h-construction-valeurs", [
    { id: "etape", libelle: "Étape", format: (v) => v },
    { id: "somme", libelle: "Somme des courants tracés", format: (v) => v },
    { id: "chute", libelle: "Projection des chutes sur U", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner(s) {
    t.im.setAttribute("d", partiel(O.x, O.y, a1.x, a1.y, s));
    t.if.setAttribute("d", partiel(a1.x, a1.y, a2.x, a2.y, s - 1));
    t.ie.setAttribute("d", partiel(a2.x, a2.y, a3.x, a3.y, s - 2));
    t.i.setAttribute("d", partiel(O.x, O.y, a3.x, a3.y, s - 3));
    t.ic.setAttribute("d", partiel(a3.x, a3.y, a4.x, a4.y, s - 4));
    t.ip.setAttribute("d", partiel(O.x, O.y, a4.x, a4.y, s - 5));
    t.u.setAttribute("d", partiel(V.x, V.y, V.tip, V.y, (s - 6) * 2));
    coupure.setAttribute("d", s >= 6 ? "M470 " + (V.y - 10) + "l6 6l-6 6l6 6M480 " + (V.y - 10) + "l6 6l-6 6l6 6" : "");
    const fRi = Math.min(1, Math.max(0, (s - 6) * 2 - 1));
    t.ri.setAttribute("d", partiel(V.tip, V.y, v1.x, v1.y, fRi));
    t.xi.setAttribute("d", partiel(v1.x, v1.y, v2.x, v2.y, s - 7));
    const yE = V.y + 80;
    t.e.setAttribute("d", partiel(V.x, yE, v2.x, yE, s - 8));
    reperes.setAttribute(
      "d",
      s >= 8 ? "M" + V.x + " " + V.y + "V" + (yE + 6) + "M" + v2.x.toFixed(1) + " " + v2.y.toFixed(1) + "V" + (yE + 6) + "M" + v1.x.toFixed(1) + " " + v1.y.toFixed(1) + "V" + (yE - 30) : ""
    );

    let html = "";
    if (s >= 1) html += texte((O.x + a1.x) / 2 - 8, (O.y + a1.y) / 2 + 4, "IM", ' text-anchor="end"');
    if (s >= 2) html += texte((a1.x + a2.x) / 2, a1.y + 18, "IF", ' text-anchor="middle"');
    if (s >= 3) html += texte((a2.x + a3.x) / 2 + 6, a2.y + 18, "IE");
    if (s >= 4) html += texte(a3.x + 12, a3.y + 4, "I", ' font-weight="600"');
    if (s >= 4) html += texte(14, 300, "I = 34,08 A, en retard de 26,74° : tirets épais");
    if (s >= 5) html += texte(a4.x + 8, (a3.y + a4.y) / 2 + 4, "IC");
    if (s >= 6) html += texte(a4.x + 8, a4.y - 4, "I'", ' font-weight="600"');
    if (s >= 6) html += texte(14, 318, "I' = 31,06 A, en retard de 11,48° : tirets fins");
    if (s >= 6) html += texte(V.x + 4, V.y - 10, "U = 230 V");
    if (s >= 6.5) html += texte((V.tip + v1.x) / 2 - 6, (V.y + v1.y) / 2 + 18, "Rl I", ' text-anchor="end"');
    if (s >= 7) html += texte(v2.x + 8, (v1.y + v2.y) / 2 + 4, "jXl I");
    if (s >= 8) html += texte((V.x + v2.x) / 2, yE + 18, "E = 237,62 V", ' text-anchor="middle" font-weight="600"');
    if (s >= 8) html += texte(v2.x + 6, yE - 34, "7,62 V", ' font-size="11"');
    html += texte(790, 24, ETAPES[Math.min(9, Math.floor(s))], ' text-anchor="end" font-weight="600"');
    etiquettes.innerHTML = html;

    if (valeurs) {
      let somme = "aucun";
      if (s >= 5.999) somme = "I' = 30,43 - j6,18 A, module 31,06 A";
      else if (s >= 3.999) somme = "I = 30,43 - j15,33 A, module 34,08 A";
      else if (s >= 2.999) somme = "IM + IF + IE = 30,43 - j15,33 A";
      else if (s >= 1.999) somme = "IM + IF = 26,09 - j16,76 A";
      else if (s >= 0.999) somme = "IM = 17,39 - j16,76 A";
      valeurs.maj({
        etape: ETAPES[Math.min(9, Math.floor(s))],
        somme,
        chute:
          s >= 7.999
            ? "Rl I cos φ + Xl I sin φ = " + nombre(api, ri * Math.cos(phi), 2) + " + " + nombre(api, xi * Math.sin(phi), 2) + " = " + nombre(api, e - U, 2) + " V"
            : "à venir",
      });
    }
  }

  const lecteur = api.sim.lecteur("#h-construction-lecteur", {
    de: 0,
    a: 9.5,
    duree: 18,
    boucle: true,
    auto: false,
    libelle: "Construire les diagrammes étape par étape",
    rappel(valeur) {
      dessiner(Math.min(9, valeur));
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(9);
  } else {
    dessiner(9);
  }
}

/* --------------------------------------------------------------------------
   I. Simulation : départ de l'atelier de maintenance
   -------------------------------------------------------------------------- */

function modeleDepart(r) {
  const qm = r.pm * tanDe(r.cm);
  const qe = -600 * tanDe(0.95);
  const qc = U * U * W * r.c;
  const p = r.pch + r.pm + 600;
  const q = qm + qe - qc;
  const s = Math.hypot(p, q);
  const i = s / U;
  const chute = (longueur, section) => {
    const rc = (2 * longueur * SITE.rho) / section;
    const xc = 2 * longueur * SITE.x;
    return { du: (rc * p + xc * q) / U, rc, xc };
  };
  const c = chute(r.l, SITE.sections[r.k]);
  const lTot = SITE.ls + (2 * r.l * SITE.x) / W;
  const nr = r.c > 0 ? 1 / (W * Math.sqrt(lTot * r.c)) : Infinity;
  const pL1 = SITE.p1 + p;
  const qL1 = SITE.q1 + q;
  return { p, q, s, i, lambda: s > 0 ? p / s : 1, chute, du: c.du, pertes: c.rc * i * i, nr, iL1: Math.hypot(pL1, qL1) / U, partL1: Math.hypot(pL1, qL1) / SITE.sPhase };
}

function construireAtelier(racine, api) {
  const reglage = { l: 30, k: 1, pch: 3000, pm: 2400, cm: 0.75, c: 0 };

  const trace = api.sim.traceur("#i-atelier-trace", {
    titre: "Chute de tension du départ en fonction de la longueur, par section",
    genre: "Simulation",
    xTitre: "longueur",
    xUnite: "m",
    yTitre: "ΔU",
    yUnite: "%",
    xMin: 0,
    xMax: 100,
    yMin: 0,
    yMax: 8,
    ratio: 0.42,
    echantillons: 200,
    series: SITE.sections.map((section, rang) => ({
      id: "s" + section,
      nom: section + " mm²",
      couleur: "serie-" + (rang + 1),
      epaisseur: rang === reglage.k ? 3 : 1.8,
    })),
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 3, "objectif retenu : 3 %", false);
      ligneV(c, repere, couleurs, reglage.l, "longueur choisie");
      const m = modeleDepart(reglage);
      marquerPoint(c, repere, couleurs, reglage.l, (m.du / U) * 100, nombre(api, (m.du / U) * 100, 2) + " %", false);
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#i-atelier-valeurs", [
    { id: "section", libelle: "Câble", format: (v) => v },
    { id: "p", libelle: "P du départ", unite: "W", decimales: 0 },
    { id: "q", libelle: "Q du départ, signée", unite: "var", decimales: 0 },
    { id: "lambda", libelle: "Facteur de puissance", format: (v) => v },
    { id: "i", libelle: "Courant du départ", unite: "A", decimales: 2 },
    { id: "du", libelle: "ΔU ≈ (Rc P + Xc Q) / U", format: (v) => v },
    { id: "pertes", libelle: "Pertes Joule du câble", unite: "W", decimales: 1 },
    { id: "nr", libelle: "Rang de résonance du condensateur local", format: (v) => v },
    { id: "l1", libelle: "Phase L1 du tableau général, au fondamental", format: (v) => v },
    { id: "verdict", libelle: "Diagnostic", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const m = modeleDepart(reglage);
    if (trace) {
      let maxi = 0;
      for (const section of SITE.sections) maxi = Math.max(maxi, (m.chute(100, section).du / U) * 100);
      trace.definirPlage({ yMax: Math.max(4, Math.ceil(maxi * 1.1)) });
      SITE.sections.forEach((section, rang) => {
        const serie = trace.series && trace.series.find((element) => element.id === "s" + section);
        if (serie) serie.epaisseur = rang === reglage.k ? 3 : 1.8;
        trace.definirFonction("s" + section, (longueur) => (m.chute(longueur, section).du / U) * 100);
      });
    }
    if (!valeurs) return;
    const pourcent = (m.du / U) * 100;
    let verdict;
    if (pourcent > 3) verdict = "chute au-dessus de l'objectif : section supérieure ou départ plus court";
    else if (m.q < -50) verdict = "départ surcompensé : réduire C";
    else if (Number.isFinite(m.nr) && m.nr < 20 && [3, 5, 7, 9, 11, 13, 15, 17, 19].some((rang) => Math.abs(m.nr - rang) / rang < 0.1)) verdict = "résonance proche d'un rang impair : à éviter";
    else if (m.partL1 > 1) verdict = "phase L1 au-delà de sa part du transformateur supposé";
    else verdict = "conforme à l'objectif de chute ; déséquilibre de L1 à surveiller";
    valeurs.maj({
      section: "2 x " + SITE.sections[reglage.k] + " mm², " + nombre(api, reglage.l, 0) + " m",
      p: m.p,
      q: m.q,
      lambda: nombre(api, m.lambda, 3) + (m.q < 0 ? ", capacitif" : ", inductif"),
      i: m.i,
      du: nombre(api, m.du, 2) + " V, soit " + nombre(api, pourcent, 2) + " %",
      pertes: m.pertes,
      nr: Number.isFinite(m.nr) ? nombre(api, m.nr, 1) + ", soit " + nombre(api, m.nr * 50, 0) + " Hz" : "pas de condensateur",
      l1: nombre(api, m.iL1, 1) + " A, " + nombre(api, m.partL1 * 100, 1) + " % de 33,3 kVA",
      verdict,
    });
  }

  const curseurs = api.sim.curseurs(
    "#i-atelier-curseurs",
    [
      { id: "l", libelle: "Longueur du câble", min: 5, max: 100, pas: 1, valeur: 30, unite: "m" },
      { id: "k", libelle: "Section des conducteurs", min: 0, max: 3, pas: 1, valeur: 1, format: (v) => SITE.sections[Math.round(v)] + " mm²" },
      { id: "pch", libelle: "Puissance du chauffe-eau", min: 0, max: 4, pas: 0.1, valeur: 3, unite: "kW" },
      { id: "pm", libelle: "Puissance des machines", min: 0, max: 4, pas: 0.1, valeur: 2.4, unite: "kW" },
      { id: "cm", libelle: "Facteur de puissance des machines", min: 0.6, max: 0.95, pas: 0.01, valeur: 0.75, chiffres: 2 },
      { id: "c", libelle: "Condensateur local C", min: 0, max: 80, pas: 0.5, valeur: 0, unite: "µF" },
    ],
    (lues) => {
      reglage.l = lues.l;
      reglage.k = Math.round(lues.k);
      reglage.pch = lues.pch * 1000;
      reglage.pm = lues.pm * 1000;
      reglage.cm = lues.cm;
      reglage.c = lues.c * 1e-6;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function courantCompense(p, q, c) {
  return Math.hypot(p, q - U * U * W * c) / U;
}

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : Boucherot. */
  const qK1 = 1100 * tanDe(0.8) - 400 * tanDe(0.9);
  const sK1 = Math.hypot(3000, qK1);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-boucherot",
      titre: "Courant d'un tableau à trois récepteurs",
      niveau: "fondamental",
      enonce:
        "<p>Un tableau monophasé $230\\ \\mathrm{V}$ alimente un radiateur de $1{,}5\\ \\mathrm{kW}$, un moteur absorbant $1{,}1\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}80$ et un éclairage de $0{,}4\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}90$ capacitif. Quel est le courant de ligne ?</p>",
      valeur: sK1 / U,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant $I$",
      etapes: [
        { texte: "$Q_M = 1100 \\times 0{,}75 = 825\\ \\mathrm{var}$ ; $Q_E = -400 \\times \\tan(\\arccos 0{,}90) = -400 \\times 0{,}4843 = -193{,}7\\ \\mathrm{var}$." },
        { texte: "$P = 1500 + 1100 + 400 = 3000\\ \\mathrm{W}$ ; $Q = 825 - 193{,}7 = 631{,}3\\ \\mathrm{var}$." },
        { texte: "$S = \\sqrt{3000^2 + 631{,}3^2} = 3065{,}7\\ \\mathrm{VA}$ ; $I = 3065{,}7/230 = 13{,}33\\ \\mathrm{A}$ ; $\\lambda = 0{,}979$.", note: "Somme arithmétique des courants : $6{,}52 + 5{,}98 + 1{,}93 = 14{,}43\\ \\mathrm{A}$, $8\\ \\%$ de trop." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Puissances complexes des trois récepteurs et leur somme",
          unite: "VA",
          somme: true,
          nomSomme: "S = 3065,7 VA à 11,9°",
          vecteurs: [
            { id: "r", nom: "radiateur", amplitude: 1500, phase: 0, couleur: "serie-1" },
            { id: "m", nom: "moteur", amplitude: 1375, phase: 36.87, couleur: "serie-3" },
            { id: "e", nom: "éclairage", amplitude: 444.4, phase: -25.84, couleur: "serie-5", pointille: true },
          ],
        });
      },
    })
  );

  /* Fondamental 2 : admittances en parallèle. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-admittance",
      titre: "Deux branches en parallèle",
      niveau: "fondamental",
      enonce:
        "<p>Deux récepteurs sont branchés en parallèle sous $230\\ \\mathrm{V}$ : $\\underline{Z}_1 = 10 + j10\\ \\Omega$ et $\\underline{Z}_2 = 20\\ \\Omega$. Quel est le courant total ?</p>",
      valeur: U * Math.hypot(0.1, 0.05),
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant total $I$",
      etapes: [
        { texte: "$\\underline{Y}_1 = 1/(10 + j10) = (10 - j10)/200 = 0{,}05 - j0{,}05\\ \\mathrm{S}$ ; $\\underline{Y}_2 = 0{,}05\\ \\mathrm{S}$." },
        { texte: "$\\underline{Y} = 0{,}10 - j0{,}05\\ \\mathrm{S}$, $|\\underline{Y}| = 0{,}1118\\ \\mathrm{S}$." },
        { texte: "$I = 230 \\times 0{,}1118 = 25{,}71\\ \\mathrm{A}$, en retard de $26{,}57^\\circ$.", note: "Les courants de branche valent $16{,}26\\ \\mathrm{A}$ et $11{,}5\\ \\mathrm{A}$ ; leur somme arithmétique, $27{,}76\\ \\mathrm{A}$, est fausse." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Courants des deux branches et courant total, référence U",
          unite: "A",
          somme: true,
          nomSomme: "I = 25,71 A à -26,57°",
          vecteurs: [
            { id: "i1", nom: "I1", amplitude: 16.26, phase: -45, couleur: "serie-3" },
            { id: "i2", nom: "I2", amplitude: 11.5, phase: 0, couleur: "serie-1" },
          ],
        });
      },
    })
  );

  /* Intermédiaire 1 : compensation. */
  const qcK3 = 8000 * (tanDe(0.78) - tanDe(0.95));
  const cK3 = qcK3 / (U * U * W);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-compensation",
      titre: "Capacité pour atteindre 0,95",
      niveau: "intermédiaire",
      enonce:
        "<p>Une installation monophasée absorbe $8\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}78$ sous $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$. Quelle capacité, en microfarads, faut-il pour atteindre $\\cos\\varphi = 0{,}95$ ? De combien le courant baisse-t-il ?</p>",
      valeur: cK3 * 1e6,
      unite: "µF",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Capacité $C$",
      etapes: [
        { texte: "$\\tan\\varphi_1 = \\tan(\\arccos 0{,}78) = 0{,}8023$ ; $\\tan\\varphi_2 = 0{,}3287$." },
        { texte: "$Q_C = 8000 \\times (0{,}8023 - 0{,}3287) = 3788{,}8\\ \\mathrm{var}$." },
        { texte: "$C = 3788{,}8/(230^2 \\times 314{,}16) = 228{,}0\\ \\mu\\mathrm{F}$.", note: "Courant : $8000/(0{,}78 \\times 230) = 44{,}59\\ \\mathrm{A}$ avant, $36{,}61\\ \\mathrm{A}$ après, soit $-17{,}9\\ \\%$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const q1 = 8000 * tanDe(0.78);
        traceCorrection(moteur, conteneur, {
          titre: "Courant en fonction de la capacité : la courbe en V",
          xTitre: "C",
          xUnite: "µF",
          yTitre: "I",
          yUnite: "A",
          xMin: 0,
          xMax: 600,
          yMin: 30,
          yMax: 50,
          series: [{ id: "i", nom: "I(C) pour 8 kW à 0,78", couleur: "serie-1", epaisseur: 2.6, fonction: (c) => courantCompense(8000, q1, c * 1e-6) }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, cK3 * 1e6, 36.61, "228 µF : 36,61 A", false);
            ligneV(c, repere, couleurs, (q1 / (U * U * W)) * 1e6, "Q = 0", 1.2, [2, 3]);
          },
        });
      },
    })
  );

  /* Intermédiaire 2 : chute de tension. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-chute",
      titre: "Chute de tension d'une ligne",
      niveau: "intermédiaire",
      enonce:
        "<p>Une charge reçoit $P = 5\\ \\mathrm{kW}$ et $Q = 3\\ \\mathrm{kvar}$ sous $230\\ \\mathrm{V}$ à travers une ligne de résistance de boucle $0{,}3\\ \\Omega$ et de réactance de boucle $0{,}1\\ \\Omega$. Quelle est la chute de tension, en volts ?</p>",
      valeur: (0.3 * 5000 + 0.1 * 3000) / U,
      unite: "V",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Chute $\\Delta U$",
      etapes: [
        { texte: "Formule approchée : $\\Delta U \\approx (R_lP + X_lQ)/U = (0{,}3 \\times 5000 + 0{,}1 \\times 3000)/230 = 1800/230 = 7{,}83\\ \\mathrm{V}$, soit $3{,}40\\ \\%$." },
        { texte: "Contrôle exact : $\\underline{I} = (5000 - j3000)/230 = 21{,}74 - j13{,}04\\ \\mathrm{A}$ ; $\\underline{Z}_l\\underline{I} = 7{,}826 - j1{,}739\\ \\mathrm{V}$ ; $E = |237{,}83 - j1{,}74| = 237{,}83\\ \\mathrm{V}$." },
        { texte: "L'écart entre les deux, $0{,}006\\ \\mathrm{V}$, est négligeable : la partie imaginaire ne joue qu'au second ordre.", note: "Le terme résistif, $6{,}52\\ \\mathrm{V}$, domine : compenser ne gagnerait au plus que $1{,}30\\ \\mathrm{V}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Chute de tension en fonction de la puissance réactive, P = 5 kW",
          xTitre: "Q",
          xUnite: "var",
          yTitre: "ΔU",
          yUnite: "V",
          xMin: -4000,
          xMax: 5000,
          yMin: 0,
          yMax: 10,
          series: [{ id: "du", nom: "ΔU = (0,3 P + 0,1 Q) / U", couleur: "serie-4", epaisseur: 2.6, fonction: (q) => (0.3 * 5000 + 0.1 * q) / U }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 3000, 7.83, "Q = 3 kvar : 7,83 V", true);
            ligneV(c, repere, couleurs, 0, "Q = 0", 1.2, [2, 3]);
          },
        });
      },
    })
  );

  /* Avancé : compensation et résonance. */
  const qcK5 = 6000 * (tanDe(0.8) - tanDe(0.95));
  const cK5 = qcK5 / (U * U * W);
  const nK5 = 1 / (W * Math.sqrt(0.5e-3 * cK5));
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-resonance",
      titre: "Compenser sans créer de résonance",
      niveau: "avancé",
      enonce:
        "<p>Une installation de $6\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}80$, sous $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$, est alimentée à travers une inductance de boucle de $0{,}5\\ \\mathrm{mH}$, source comprise. Elle comporte des redresseurs monophasés qui injectent les rangs impairs. On veut $\\cos\\varphi = 0{,}95$. Calculez la capacité nécessaire, puis le rang de résonance qu'elle forme avec l'inductance amont. Est-ce acceptable avec une marge de $10\\ \\%$ autour des rangs injectés ? Sinon, que proposer ?</p>",
      valeur: nK5,
      unite: "",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Rang de résonance $n_r$",
      etapes: [
        { texte: "$Q_C = 6000 \\times (0{,}75 - 0{,}3287) = 2527{,}9\\ \\mathrm{var}$ ; $C = 2527{,}9/(230^2 \\times 314{,}16) = 152{,}1\\ \\mu\\mathrm{F}$." },
        { texte: "$f_r = 1/(2\\pi\\sqrt{0{,}5 \\times 10^{-3} \\times 152{,}1 \\times 10^{-6}}) = 577{,}1\\ \\mathrm{Hz}$, rang $11{,}54$. Contrôle : $S_{cc} = 230^2/(0{,}5 \\times 10^{-3} \\times 314{,}16) = 336{,}8\\ \\mathrm{kVA}$, $\\sqrt{336\\,800/2527{,}9} = 11{,}54$." },
        { texte: "Le rang $11{,}54$ est à $4{,}9\\ \\%$ du rang $11$ : la marge de $10\\ \\%$ n'est pas respectée, la tension de rang $11$ serait amplifiée." },
        { texte: "Solutions : une self anti-harmonique qui place l'accord sous le rang $3$ ; ou une capacité plus faible, au plus $99{,}1\\ \\mu\\mathrm{F}$ pour rester au-dessus du rang $14{,}3$, mais alors $\\lambda = 0{,}903$ seulement.", note: "La cible de facteur de puissance et la sécurité harmonique peuvent être incompatibles : c'est un compromis à arbitrer, pas un calcul isolé." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Impédance vue du tableau, amortissement supposé de 10 Ω",
          xTitre: "rang h",
          xMin: 1,
          xMax: 20,
          yTitre: "|Z|",
          yUnite: "Ω",
          yMin: 0,
          yMax: 8,
          echantillons: 900,
          series: [
            {
              id: "avec",
              nom: "avec 152,1 µF",
              couleur: "serie-5",
              epaisseur: 2.6,
              fonction: (h) => {
                const x = 0.5e-3 * W * h;
                const b = cK5 * W * h - 1 / x;
                return 1 / Math.hypot(0.1, b);
              },
            },
            { id: "sans", nom: "sans condensateur", couleur: "serie-6", epaisseur: 1.8, fonction: (h) => 1 / Math.hypot(0.1, 1 / (0.5e-3 * W * h)) },
          ],
          surDessin({ c, repere, couleurs }) {
            for (const rang of [3, 5, 7, 9, 11, 13]) ligneV(c, repere, couleurs, rang, String(rang), 1, [2, 4]);
            ligneV(c, repere, couleurs, nK5, "", 2.6, [6, 4]);
          },
        });
      },
    })
  );

  /* Diagnostic industriel. */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Une tension qui monte le soir",
      niveau: "diagnostic",
      enonce:
        "<p>Dans l'atelier de l'exemple, un électricien a raccordé le condensateur de $126{,}7\\ \\mu\\mathrm{F}$ directement au tableau, sans le commander avec le moteur. Les jours ouvrés, tout va bien. Le soir, moteur arrêté mais four et éclairage en service, l'analyseur indique un facteur de puissance de $0{,}78$ et une tension aux récepteurs supérieure à celle mesurée moteur en marche. Quelles conclusions sont justifiées ?</p>",
      options: [
        { texte: "L'atelier est surcompensé : $Q = -328{,}7 - 2105{,}3 = -2434\\ \\mathrm{var}$, et le facteur de puissance de $0{,}78$ est capacitif.", juste: true },
        { texte: "La tension monte parce que le terme $X_lQ$ de la chute de tension est devenu négatif et que la chute totale est faible.", juste: true },
        { texte: "L'analyseur est défectueux : un facteur de puissance de $0{,}78$ ne peut venir que d'un moteur." },
        { texte: "Le remède est de commander le condensateur par le contact du moteur, ou de le remplacer par une batterie automatique.", juste: true },
        { texte: "Augmenter la capacité ramènerait le facteur de puissance à $1$ le soir." },
      ],
      etapes: [
        { texte: "Moteur arrêté : $P = 3000\\ \\mathrm{W}$, $Q = -2434\\ \\mathrm{var}$, $S = 3863\\ \\mathrm{VA}$, $\\lambda = 0{,}777$ capacitif ; le courant, $16{,}8\\ \\mathrm{A}$, est plus grand que les $13{,}12\\ \\mathrm{A}$ du four et de l'éclairage seuls." },
        { texte: "$\\Delta U \\approx (0{,}20 \\times 3000 + 0{,}10 \\times (-2434))/230 = (600 - 243{,}4)/230 = 1{,}55\\ \\mathrm{V}$, contre $7{,}62\\ \\mathrm{V}$ moteur en marche : la tension remonte de plus de $6\\ \\mathrm{V}$." },
        { texte: "Un facteur de puissance n'indique pas son signe : il faut lire $Q$ ou le sens du déphasage. Ajouter de la capacité aggraverait la surcompensation.", note: "C'est exactement la raison de la commande commune du schéma de la section E." },
      ],
      visuelCorrection(conteneur, moteur) {
        const bj = bilanAtelier(EX.pm, EX.cm, EX.pf, 0);
        traceCorrection(moteur, conteneur, {
          titre: "Courant de ligne en fonction de la capacité, le jour et le soir",
          xTitre: "C",
          xUnite: "µF",
          yTitre: "I",
          yUnite: "A",
          xMin: 0,
          xMax: 250,
          yMin: 0,
          yMax: 40,
          series: [
            { id: "jour", nom: "moteur en marche", couleur: "serie-1", epaisseur: 2.6, fonction: (c) => courantCompense(bj.p, bj.q, c * 1e-6) },
            { id: "soir", nom: "moteur arrêté", couleur: "serie-5", epaisseur: 2.6, fonction: (c) => courantCompense(3000, bj.qe, c * 1e-6) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 126.7, "126,7 µF");
          },
        });
      },
    })
  );

  /* Conceptuel. */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Ce qui s'additionne et ce qui ne s'additionne pas",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi les puissances actives de plusieurs récepteurs s'additionnent toujours, pourquoi leurs puissances réactives s'additionnent avec un signe, et pourquoi ni leurs courants efficaces ni leurs puissances apparentes ne s'additionnent en général.</p>",
      motsCles: [
        ["energie", "conserv", "moyenne"],
        ["signe", "oppos", "inductif", "capacitif", "echange"],
        ["phase", "dephas", "instant", "vecteur", "phaseur", "maximum"],
        ["apparente", "efficace", "module"],
      ],
      minimum: 3,
      exemple: "Trois phrases : ce qui se conserve, ce qui s'échange avec un signe, ce qui dépend de la phase.",
      etapes: [
        { texte: "$P$ est une énergie moyenne consommée par unité de temps : par conservation de l'énergie, la source fournit la somme de ce que chacun consomme." },
        { texte: "$Q$ mesure l'énergie échangée ; une bobine et un condensateur échangent en opposition, l'un se charge quand l'autre se décharge : leurs $Q$ ont des signes opposés et se compensent." },
        { texte: "Les courants culminent à des instants différents : on additionne des phaseurs, et le module de la somme est inférieur à la somme des modules dès que les phases diffèrent ; il en va de même pour $S = UI$.", note: "L'égalité n'a lieu que si tous les récepteurs ont le même $\\varphi$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Deux courants de 10 A déphasés de 60° et leur somme",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "i",
          yUnite: "A",
          xMin: 0,
          xMax: 20,
          yMin: -26,
          yMax: 26,
          series: [
            { id: "i1", nom: "i1, 10 A efficaces", couleur: "serie-1", epaisseur: 2, fonction: (t) => 10 * Math.SQRT2 * Math.cos(W * t / 1000) },
            { id: "i2", nom: "i2, 10 A efficaces, retard 60°", couleur: "serie-3", epaisseur: 2, fonction: (t) => 10 * Math.SQRT2 * Math.cos(W * t / 1000 - 60 * DEG) },
            { id: "s", nom: "i1 + i2 : 17,32 A efficaces, pas 20 A", couleur: "serie-5", epaisseur: 2.8, fonction: (t) => 10 * Math.SQRT2 * (Math.cos(W * t / 1000) + Math.cos(W * t / 1000 - 60 * DEG)) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 20 * Math.SQRT2, "crête si en phase : 28,3 A", true);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

function dessinTrianglesQuiz(idMarqueur) {
  return (
    "<defs>" + marqueur(idMarqueur) + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.6" fill="none">' +
    '<path d="M60 280H457" marker-end="url(#' + idMarqueur + ')"/>' +
    '<path d="M460 280V203" marker-end="url(#' + idMarqueur + ')"/>' +
    '<path d="M60 280L457 51" stroke-dasharray="12 6" marker-end="url(#' + idMarqueur + ')"/>' +
    '<path d="M60 280L457 202" stroke-dasharray="3 4" marker-end="url(#' + idMarqueur + ')"/></g>' +
    '<g stroke="currentColor" stroke-width="2" fill="none"><path d="M500 50V197" marker-start="url(#' + idMarqueur + ')" marker-end="url(#' + idMarqueur + ')"/>' +
    '<path d="M460 50H504M460 200H504" stroke-dasharray="2 3"/><path d="M460 200V50" stroke-dasharray="2 3"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="15" font-weight="600">' +
    '<text x="250" y="304">a</text><text x="434" y="250">b</text><text x="514" y="130">c</text><text x="220" y="150">d</text><text x="300" y="236">e</text></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
    '<text x="60" y="330">tirets épais : avant compensation ; pointillés courts : après</text></g>'
  );
}

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Pour plusieurs récepteurs alimentés par la même source à une seule fréquence, quelles grandeurs s'additionnent directement ?</p>",
        options: ["$P$ et $Q$, avec leur signe", "$S$ et les courants efficaces", "$P$ seulement", "$S$ seulement"],
        bonnes: [0],
        explication: "Théorème de Boucherot : $P$ et $Q$ se conservent. $S$ et les courants efficaces ne s'additionnent que si tous les déphasages sont égaux.",
        resume: "Théorème de Boucherot",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Deux récepteurs en parallèle absorbant chacun $10\\ \\mathrm{A}$ font toujours circuler $20\\ \\mathrm{A}$ dans la ligne.</p>",
        reponse: false,
        explication: "Les courants s'ajoutent en phaseurs : $20\\ \\mathrm{A}$ seulement s'ils sont en phase, $17{,}3\\ \\mathrm{A}$ à $60^\\circ$, $0$ pour une bobine et un condensateur parfaitement accordés.",
        resume: "Somme des courants",
      },
      {
        type: "calcul",
        enonce: "<p>Une installation absorbe $P = 3\\ \\mathrm{kW}$ et $Q = 4\\ \\mathrm{kvar}$. Quelle est sa puissance apparente, en voltampères ?</p>",
        valeur: 5000,
        unite: "VA",
        tolerance: 0.01,
        chiffres: 0,
        explication: "$S = \\sqrt{3000^2 + 4000^2} = 5000\\ \\mathrm{VA}$ ; $\\lambda = 0{,}6$.",
        resume: "Puissance apparente",
      },
      {
        type: "calcul",
        enonce: "<p>Quel réactif, en vars, fournit un condensateur de $100\\ \\mu\\mathrm{F}$ sous $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$ ?</p>",
        valeur: U * U * W * 100e-6,
        unite: "var",
        tolerance: 0.01,
        chiffres: 0,
        explication: "$Q_C = U^2C\\omega = 52\\,900 \\times 10^{-4} \\times 314{,}16 = 1662\\ \\mathrm{var}$, soit $16{,}6\\ \\mathrm{var}$ par microfarad.",
        resume: "Réactif d'un condensateur",
      },
      {
        type: "qcm",
        enonce: "<p>Dans $\\Delta U \\approx (R_lP + X_lQ)/U$, quel terme une compensation capacitive réduit-elle ?</p>",
        options: ["$R_lP$", "$X_lQ$", "les deux", "aucun"],
        bonnes: [1],
        explication: "La compensation ne change pas $P$ ; elle réduit $Q$, donc le terme $X_lQ$. Sur un câble de faible section, où $R_l \\gg X_l$, le gain sur la tension est faible ; le gain sur le courant et les pertes reste réel.",
        resume: "Compensation et chute de tension",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi ne vise-t-on pas un facteur de puissance égal à $1$ avec un condensateur fixe ?</p>",
        motsCles: [["surcompens", "capacitif"], ["arret", "variation", "baisse de charge", "charge varie", "s'arrete"], ["tension", "monte", "surtension", "courant remonte"]],
        minimum: 2,
        explication: "Dès que la charge inductive baisse ou s'arrête, l'installation devient capacitive : le courant remonte, la tension monte en bout de ligne. On vise $0{,}93$ à $0{,}98$ et l'on commute le condensateur avec la charge.",
        resume: "Cible de compensation",
      },
      {
        type: "schema",
        enonce: "<p>Sur ces triangles des puissances avant et après compensation, quel segment représente la puissance réactive fournie par le condensateur ?</p>",
        consigne: "Cliquez sur l'étiquette du segment correspondant.",
        viewBox: "0 0 560 340",
        description: "Triangles des puissances : a horizontal, b vertical court, c cote verticale à double flèche à droite, d hypoténuse en tirets épais, e hypoténuse en pointillés courts",
        dessin: dessinTrianglesQuiz("fl-l-t"),
        zones: [
          { x: 234, y: 284, largeur: 40, hauteur: 30, etiquette: "a" },
          { x: 418, y: 230, largeur: 40, hauteur: 30, etiquette: "b" },
          { x: 504, y: 110, largeur: 40, hauteur: 30, etiquette: "c", juste: true },
          { x: 204, y: 130, largeur: 40, hauteur: 30, etiquette: "d" },
          { x: 284, y: 216, largeur: 40, hauteur: 30, etiquette: "e" },
        ],
        explication: "a est $P$, inchangée ; b est le réactif restant $Q'$ ; c, entre les deux sommets, est $Q_C = Q - Q'$ ; d est $S$ avant, e est $S'$ après.",
        resume: "Lecture du triangle des puissances",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Avec un condensateur raccordé aux bornes d'un moteur, le courant dans le câble qui alimente l'ensemble diminue.</p>",
        reponse: true,
        explication: "Le réactif est échangé entre le moteur et le condensateur, en aval du câble : le câble ne transporte plus que le courant compensé. Le courant dans les enroulements du moteur, lui, ne change pas.",
        resume: "Compensation individuelle",
      },
      {
        type: "calcul",
        enonce: "<p>Un condensateur de $4\\ \\mathrm{kvar}$ est raccordé à un nœud dont la puissance de court-circuit vaut $400\\ \\mathrm{kVA}$. À quel rang harmonique résonne-t-il ?</p>",
        valeur: 10,
        tolerance: 0.01,
        chiffres: 1,
        explication: "$n_r = \\sqrt{S_{cc}/Q_C} = \\sqrt{400/4} = 10$, soit $500\\ \\mathrm{Hz}$ : à $9\\ \\%$ du rang $11$ et à $11\\ \\%$ du rang $9$, trop près pour être tranquille.",
        resume: "Rang de résonance",
      },
      {
        type: "calcul",
        enonce: "<p>Un four purement résistif de $4\\ \\mathrm{kW}$ est alimenté sous $230\\ \\mathrm{V}$ par une ligne de résistance de boucle $0{,}1\\ \\Omega$ et de réactance $0{,}2\\ \\Omega$. Quelle est la chute de tension approchée, en volts ?</p>",
        valeur: (0.1 * 4000) / U,
        unite: "V",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$Q = 0$ : $\\Delta U \\approx R_lP/U = 0{,}1 \\times 4000/230 = 1{,}74\\ \\mathrm{V}$. La réactance ne joue pas au premier ordre ; elle produit un léger déphasage de $\\underline{E}$ sur $\\underline{U}$.",
        resume: "Chute de tension d'une charge résistive",
      },
    ],
    { titre: "Dix questions sur l'analyse d'une charge AC" }
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
      { categorie: "Phaseur", question: "Que représente le module d'un phaseur dans ce parcours ?", reponse: "La valeur efficace de la grandeur ; son argument est la phase à l'origine. La crête vaut $\\sqrt{2}$ fois plus." },
      { categorie: "Loi des nœuds", question: "À quoi s'applique la loi des nœuds en régime sinusoïdal ?", reponse: "Aux valeurs instantanées et aux phaseurs, jamais aux valeurs efficaces." },
      { categorie: "Boucherot", question: "Que dit le théorème de Boucherot ?", reponse: "À une seule fréquence, $P = \\sum P_k$ et $Q = \\sum Q_k$, avec leur signe ; $S$ ne s'additionne pas." },
      { categorie: "Signe", question: "Quel est le signe de $Q$ pour un récepteur capacitif en convention récepteur ?", reponse: "Négatif : il fournit du réactif. Un condensateur de $C$ sous $U$ apporte $-U^2C\\omega$." },
      { categorie: "Courant", question: "Comment obtenir le courant de ligne d'un tableau à plusieurs charges ?", reponse: "$I = S/U$ avec $S = \\sqrt{P^2 + Q^2}$ ; contrôle par $\\underline{I} = \\sum (P_k - jQ_k)/U$." },
      { categorie: "Ligne", question: "Quelle est la chute de tension approchée d'une ligne ?", reponse: "$\\Delta U \\approx (R_lP + X_lQ)/U$ ; exacte par $\\underline{E} = \\underline{U} + \\underline{Z}_l\\underline{I}$." },
      { categorie: "Pertes", question: "Comment varient les pertes en ligne avec le facteur de puissance, à $P$ constante ?", reponse: "Comme $1/\\lambda^2$ : passer de $0{,}80$ à $0{,}95$ les réduit de $29\\ \\%$." },
      { categorie: "Compensation", question: "Comment dimensionne-t-on un condensateur de compensation ?", reponse: "$Q_C = P(\\tan\\varphi_1 - \\tan\\varphi_2)$, puis $C = Q_C/(U^2\\omega)$ ; cible $0{,}93$ à $0{,}98$, commande avec la charge." },
      { categorie: "Résonance", question: "Où résonne un condensateur avec le réseau qui l'alimente ?", reponse: "Au rang $n_r = \\sqrt{S_{cc}/Q_C}$, en parallèle avec l'inductance amont ; à éloigner des rangs injectés." },
      {
        categorie: "Industriel",
        question: "Pourquoi n'a-t-on pas compensé le départ de l'atelier de maintenance ?",
        reponse: "Son $\\lambda$ vaut déjà $0{,}952$ : $42\\ \\mu\\mathrm{F}$ n'auraient réduit le courant que de $2{,}8\\ \\%$ et les pertes de $5\\ \\mathrm{W}$.",
        rappel: "Départ : 6 kW, 1,92 kvar, 27,4 A, 1,42 % de chute en 2 x 10 mm² sur 30 m.",
      },
    ],
    { titre: "Dix cartes sur l'analyse d'une charge AC" }
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
        enonce: "<p>Sous $230\\ \\mathrm{V}$, un moteur absorbe $2\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}80$ et un radiateur $1\\ \\mathrm{kW}$. Quel est le courant de ligne ?</p>",
        valeur: Math.hypot(3000, 1500) / U,
        unite: "A",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$P = 3000\\ \\mathrm{W}$, $Q = 2000 \\times 0{,}75 = 1500\\ \\mathrm{var}$, $S = 3354{,}1\\ \\mathrm{VA}$, $I = 14{,}58\\ \\mathrm{A}$, contre $15{,}22\\ \\mathrm{A}$ en somme arithmétique.",
        resume: "Bilan de Boucherot (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Dans un bilan de Boucherot, la puissance réactive d'un éclairage capacitif se retranche de celle d'un moteur.</p>",
        reponse: true,
        explication: "En convention récepteur, $Q &lt; 0$ pour un récepteur capacitif : les réactifs s'additionnent avec leur signe, donc se compensent en partie.",
        resume: "Signe de Q (cette séance)",
      },
      {
        type: "qcm",
        enonce: "<p>Pour un câble de faible section, quel levier réduit le plus efficacement la chute de tension ?</p>",
        options: ["Augmenter la section", "Ajouter un condensateur", "Réduire la réactance du câble", "Changer le sens du courant"],
        bonnes: [0],
        explication: "Pour un câble de faible section, $R_l \\gg X_l$ : la chute est dominée par $R_lP$, que seule une section plus forte, ou une longueur plus courte, réduit. Le condensateur n'agit que sur $X_lQ$.",
        resume: "Leviers de la chute de tension (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la fréquence de résonance, en hertz, d'une inductance de $2\\ \\mathrm{mH}$ et d'un condensateur de $50\\ \\mu\\mathrm{F}$ ?</p>",
        valeur: 1 / (TAU * Math.sqrt(2e-3 * 50e-6)),
        unite: "Hz",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$\\sqrt{LC} = \\sqrt{10^{-7}} = 3{,}162 \\times 10^{-4}\\ \\mathrm{s}$ ; $f_0 = 1/(2\\pi \\times 3{,}162 \\times 10^{-4}) = 503{,}3\\ \\mathrm{Hz}$. Révisé du cours Résonance série et parallèle.",
        resume: "Fréquence de résonance (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Un circuit RLC série a $R = 2\\ \\Omega$, $L = 10\\ \\mathrm{mH}$ et $C = 10\\ \\mu\\mathrm{F}$. Quel est son facteur de qualité ?</p>",
        valeur: Math.sqrt(10e-3 / 10e-6) / 2,
        tolerance: 0.01,
        chiffres: 2,
        explication: "$Z_0 = \\sqrt{L/C} = \\sqrt{1000} = 31{,}62\\ \\Omega$ ; $Q = Z_0/R = 15{,}81$ : sous $1\\ \\mathrm{V}$ à la résonance, le condensateur verrait $15{,}8\\ \\mathrm{V}$. Révisé du cours Résonance série et parallèle.",
        resume: "Facteur de qualité série (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Le filtre de l'interface de capteur, formé d'une résistance de $10\\ \\mathrm{k\\Omega}$ et d'un condensateur de $22\\ \\mu\\mathrm{F}$, a quelle constante de temps, en secondes ?</p>",
        valeur: 0.22,
        unite: "s",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$\\tau = RC = 10^4 \\times 22 \\times 10^{-6} = 0{,}22\\ \\mathrm{s}$ ; en régime sinusoïdal, sa fréquence de coupure vaut $1/(2\\pi\\tau) = 0{,}72\\ \\mathrm{Hz}$, ce qui explique l'atténuation du $50\\ \\mathrm{Hz}$. Révisé du cours Révision 2 et mini-projet capteur.",
        resume: "Constante de temps RC (Révision 2 et mini-projet capteur)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>La loi des nœuds s'applique aux valeurs efficaces des courants.</p>",
        reponse: false,
        explication: "Elle traduit la conservation de la charge à chaque instant : elle s'applique aux valeurs instantanées, donc aux phaseurs, mais pas aux valeurs efficaces. Révisé du cours Lois de Kirchhoff.",
        resume: "Loi des nœuds (Lois de Kirchhoff)",
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
    titre: "Où en suis-je sur l'analyse d'une charge AC ?",
  });
  if (auto) ressources.push(auto);
}
