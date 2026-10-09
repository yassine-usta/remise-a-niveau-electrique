/* ==========================================================================
   cours/correction-du-facteur-de-puissance/cours.js
   Correction du facteur de puissance.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;

/* Réseau du site : 230/400 V, 50 Hz. */
const U0 = 230;
const W50 = 2 * Math.PI * 50;
const U2W = U0 * U0 * W50;

/* Exemple de la section H : atelier de 12 kW à cos phi 0,70, ligne de 0,15 ohm. */
const EX = { p: 12000, cos1: 0.7, cos2: 0.95, rl: 0.15 };

/* Tableau général du site, par phase (cours Puissances en courant alternatif). */
const SITE = { p: 21597, q: 6166.6, pComp: 5888, qComp: 4416, harmoniques: 14.8 };

function tanDe(cos) {
  return Math.sqrt(1 - cos * cos) / cos;
}

/** Réactif à installer pour passer de cos1 à cos2 à puissance active P. */
function reactifAInstaller(p, cos1, cos2) {
  return p * (tanDe(cos1) - tanDe(cos2));
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

/** Arc de cercle, angles mathématiques en degrés (sens trigonométrique positif). */
function cheminArc(cx0, cy0, r, a1, a2) {
  if (Math.abs(a2 - a1) < 0.5) return "";
  const x1 = cx0 + r * Math.cos(a1 * DEG);
  const y1 = cy0 - r * Math.sin(a1 * DEG);
  const x2 = cx0 + r * Math.cos(a2 * DEG);
  const y2 = cy0 - r * Math.sin(a2 * DEG);
  const grand = Math.abs(a2 - a1) > 180 ? 1 : 0;
  const sens = a2 > a1 ? 0 : 1;
  return "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "A" + r + " " + r + " 0 " + grand + " " + sens + " " + x2.toFixed(1) + " " + y2.toFixed(1);
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
function ligneV(c, repere, couleurs, x, libelle, epaisseur = 1.2) {
  const px = repere.versX(x);
  if (px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  c.save();
  c.setLineDash([5, 5]);
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

/** Triangle avant et après compensation : P, Q1 de la charge et -QC de la batterie, somme S2. */
function compensationCorrection(moteur, conteneur, titre, p, q1, qc, noms) {
  return fresnelCorrection(moteur, conteneur, {
    titre,
    unite: "",
    somme: true,
    nomSomme: noms.s,
    vecteurs: [
      { id: "p", nom: noms.p, amplitude: p, phase: 0, couleur: "serie-1" },
      { id: "q1", nom: noms.q1, amplitude: q1, phase: 90, couleur: "serie-4", pointille: true },
      { id: "qc", nom: noms.qc, amplitude: qc, phase: -90, couleur: "serie-3" },
    ],
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
  construirePhaseurs(racine, api);
  construireEnergie(racine, api);
  construireProfil(racine, api);
  construireConstruction(racine, api);
  construireSite(racine, api);
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
    ["#e-montage-figure svg", 1.6],
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
      id: "c-tangente",
      titre: "Tangente à partir du cosinus",
      niveau: "prérequis",
      enonce: "<p>Une charge a un facteur de puissance $\\cos\\varphi = 0{,}80$ inductif. Que vaut $\\tan\\varphi$ ?</p>",
      valeur: tanDe(0.8),
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "$\\tan\\varphi$",
      etapes: [
        { texte: "$\\sin\\varphi = \\sqrt{1 - 0{,}8^2} = \\sqrt{0{,}36} = 0{,}6$." },
        { texte: "$\\tan\\varphi = 0{,}6/0{,}8 = 0{,}75$ : la puissance réactive vaut les trois quarts de la puissance active.", note: "C'est cette tangente, multipliée par $P$, qui donne $Q$ : $Q = P\\tan\\varphi$." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Triangle des puissances pour P = 1 : Q = tan φ",
          unite: "",
          somme: true,
          nomSomme: "S = 1/cos φ = 1,25",
          vecteurs: [
            { id: "p", nom: "P = 1", amplitude: 1, phase: 0, couleur: "serie-1" },
            { id: "q", nom: "Q = tan φ = 0,75", amplitude: 0.75, phase: 90, couleur: "serie-4" },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-condensateur",
      titre: "Puissance réactive d'un condensateur",
      niveau: "prérequis",
      enonce:
        "<p>Quelle puissance réactive, en vars et avec son signe en convention récepteur, absorbe un condensateur de $100\\ \\mu\\mathrm{F}$ sous $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$ ?</p>",
      valeur: -100e-6 * U2W,
      unite: "var",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Puissance réactive $Q$",
      etapes: [
        { texte: "$\\underline{S}_C = U^2/\\underline{Z}_C^* = -jC\\omega U^2$." },
        { texte: "$Q = -100 \\times 10^{-6} \\times 314{,}16 \\times 230^2 = -1662\\ \\mathrm{var}$ : le condensateur fournit du réactif.", note: "Sous $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$, il faut donc environ $60\\ \\mu\\mathrm{F}$ par kilovar." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réactif fourni par le condensateur en fonction de sa capacité",
          xTitre: "C",
          xUnite: "µF",
          yTitre: "réactif fourni",
          yUnite: "var",
          xMin: 0,
          xMax: 200,
          yMin: 0,
          yMax: 3500,
          series: [{ id: "q", nom: "C ω U², sous 230 V, 50 Hz", couleur: "serie-3", epaisseur: 2.6, fonction: (c) => c * 1e-6 * U2W }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 100, 100e-6 * U2W, "100 µF : 1662 var", false);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-courant",
      titre: "Courant d'une charge",
      niveau: "prérequis",
      enonce: "<p>Une charge absorbe $4600\\ \\mathrm{W}$ sous $230\\ \\mathrm{V}$ avec $\\cos\\varphi = 0{,}80$. Quel est son courant efficace ?</p>",
      valeur: 4600 / (230 * 0.8),
      unite: "A",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Courant $I$",
      etapes: [
        { texte: "$S = P/\\cos\\varphi = 4600/0{,}8 = 5750\\ \\mathrm{VA}$." },
        { texte: "$I = S/U = 5750/230 = 25\\ \\mathrm{A}$.", note: "À $\\cos\\varphi = 1$, il suffirait de $20\\ \\mathrm{A}$ : les $5\\ \\mathrm{A}$ d'écart sont le prix du réactif transporté." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Courant de la charge et ses deux composantes",
          unite: "A",
          somme: true,
          nomSomme: "I = 25 A",
          vecteurs: [
            { id: "a", nom: "composante active 20 A", amplitude: 20, phase: 0, couleur: "serie-1" },
            { id: "r", nom: "composante réactive 15 A", amplitude: 15, phase: -90, couleur: "serie-4" },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Simulation : courants avant et après compensation
   -------------------------------------------------------------------------- */

function construirePhaseurs(racine, api) {
  const conteneur = racine.querySelector("#d-phaseurs");
  if (!conteneur) return;

  const O = { x: 150, y: 215 };
  const K = 1.8;
  const IC_MAX = 100;
  const T = { x: 430, y: 215 };
  const KP = 8;
  const svg = svgEl("svg", {
    viewBox: "0 0 720 430",
    role: "img",
    "aria-label": "Diagramme des courants : tension de référence, courant de la charge en retard, courant du condensateur réglé par une poignée sur l'axe imaginaire, courant de ligne résultant ; à droite, triangle des puissances avant et après compensation",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-d-p");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7">' +
    '<path d="M40 ' + O.y + "H330" + '" marker-end="url(#fl-d-p)"/>' +
    '<path d="M' + O.x + " 420V18" + '" marker-end="url(#fl-d-p)"/>' +
    '<path d="M' + (T.x - 20) + " " + T.y + "H700" + '" marker-end="url(#fl-d-p)"/>' +
    '<path d="M' + T.x + " 420V18" + '" marker-end="url(#fl-d-p)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="10.5" opacity="0.85">' +
    texte(328, O.y + 16, "Re", ' text-anchor="end"') +
    texte(O.x + 8, 30, "Im") +
    texte(698, T.y + 16, "P (kW)", ' text-anchor="end"') +
    texte(T.x + 8, 30, "Q (kvar)") +
    texte(14, 424, "U : trait plein épais ; IL : trait plein ; IC : flèche à poignée ; I ligne : tirets épais") +
    "</g>";
  const vu = svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-d-p)" });
  const vil = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none", "marker-end": "url(#fl-d-p)" });
  const vic = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none", "marker-end": "url(#fl-d-p)" });
  const vicCopie = svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", "stroke-dasharray": "5 4", "marker-end": "url(#fl-d-p)" });
  const vi = svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "stroke-dasharray": "11 6", "marker-end": "url(#fl-d-p)" });
  const tp = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none", "marker-end": "url(#fl-d-p)" });
  const tq1 = svgEl("path", { stroke: "currentColor", "stroke-width": 1.5, fill: "none", "stroke-dasharray": "5 4" });
  const tqc = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none", "marker-end": "url(#fl-d-p)" });
  const ts = svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "stroke-dasharray": "11 6", "marker-end": "url(#fl-d-p)" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, vu, vil, vicCopie, vic, vi, tp, tq1, tqc, ts, etiquettes);
  conteneur.appendChild(svg);

  const etat = { cos: EX.cos1, ic: reactifAInstaller(EX.p, EX.cos1, EX.cos2) / U0 };
  const grandeurs = () => {
    const ia = EX.p / U0;
    const ir = ia * tanDe(etat.cos);
    const il = Math.hypot(ia, ir);
    const reste = ir - etat.ic;
    const i = Math.hypot(ia, reste);
    return { ia, ir, il, reste, i, c: (etat.ic / (W50 * U0)) * 1e6, qc: etat.ic * U0, q1: ir * U0, i1: il };
  };

  const trace = api.sim.traceur("#d-phaseurs-trace", {
    titre: "Courant de ligne en fonction de la capacité installée",
    genre: "Simulation",
    xTitre: "C",
    xUnite: "µF",
    yTitre: "I ligne",
    yUnite: "A",
    xMin: 0,
    xMax: 1400,
    yMin: 0,
    yMax: 120,
    ratio: 0.36,
    echantillons: 400,
    series: [{ id: "i", nom: "courant de ligne I(C), en ampères", couleur: "serie-1", epaisseur: 2.6 }],
    surDessin({ c, repere, couleurs }) {
      const g = grandeurs();
      ligneH(c, repere, couleurs, g.ia, "minimum P / U", true);
      marquerPoint(c, repere, couleurs, g.c, g.i, "réglage actuel");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#d-phaseurs-valeurs", [
    { id: "il", libelle: "Courant de la charge IL", unite: "A", decimales: 2 },
    { id: "ic", libelle: "Courant du condensateur IC", unite: "A", decimales: 2 },
    { id: "c", libelle: "Capacité C = IC / (ω U)", unite: "µF", decimales: 1 },
    { id: "qc", libelle: "Réactif fourni QC = U IC", unite: "var", decimales: 0 },
    { id: "i", libelle: "Courant de ligne I", unite: "A", decimales: 2 },
    { id: "cos", libelle: "Facteur de puissance vu du réseau", format: (v) => v },
    { id: "pertes", libelle: "Pertes dans une ligne de 0,15 Ω", unite: "W", decimales: 1 },
    { id: "gain", libelle: "Pertes évitées par rapport à C = 0", unite: "W", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const g = grandeurs();
    const pil = { x: O.x + K * g.ia, y: O.y + K * g.ir };
    const pic = { x: O.x, y: O.y - K * etat.ic };
    const pi = { x: pil.x, y: pil.y - K * etat.ic };
    vu.setAttribute("d", segment(O.x, O.y, O.x + 170, O.y, 3));
    vil.setAttribute("d", segment(O.x, O.y, pil.x, pil.y, 3));
    vic.setAttribute("d", etat.ic > 1 ? segment(O.x, O.y, pic.x, pic.y, 10) : "");
    vicCopie.setAttribute("d", etat.ic > 1 ? segment(pil.x, pil.y, pi.x, pi.y, 3) : "");
    vi.setAttribute("d", segment(O.x, O.y, pi.x, pi.y, 3));

    const px = T.x + (KP * EX.p) / 1000;
    const yq1 = T.y - (KP * g.q1) / 1000;
    const yq2 = T.y - (KP * (g.q1 - g.qc)) / 1000;
    tp.setAttribute("d", segment(T.x, T.y, px, T.y, 3));
    tq1.setAttribute("d", "M" + px.toFixed(1) + " " + T.y + "V" + yq1.toFixed(1));
    tqc.setAttribute("d", g.qc > 50 ? segment(px + 14, yq1, px + 14, yq2, 3) : "");
    ts.setAttribute("d", segment(T.x, T.y, px, yq2, 3));

    const capacitif = g.reste < -0.05;
    etiquettes.innerHTML =
      texte(O.x + 166, O.y - 10, "U = 230 V", ' text-anchor="end" font-weight="600"') +
      texte(pil.x + 8, pil.y + 16, "IL = " + nombre(api, g.il, 1) + " A") +
      (etat.ic > 6 ? texte(O.x - 8, (O.y + pic.y) / 2, "IC", ' text-anchor="end"') : "") +
      texte(pi.x + 10, pi.y - 8, "I = " + nombre(api, g.i, 1) + " A", ' font-weight="600"') +
      texte((T.x + px) / 2, T.y + 18, "P = 12 kW", ' text-anchor="middle"') +
      texte(px - 6, (T.y + yq1) / 2, "QL", ' text-anchor="end" font-size="11"') +
      (g.qc > 600 ? texte(px + 20, (yq1 + yq2) / 2 + 4, "QC", ' font-size="11"') : "") +
      (capacitif ? texte(T.x + 12, T.y + 34, "réseau : capacitif", ' font-size="11"') : "") +
      texte(712, 46, "échelles : 1 A pour 1,8 unité ;", ' text-anchor="end" font-size="11"') +
      texte(712, 62, "1 kvar pour 8 unités", ' text-anchor="end" font-size="11"');
    if (trace) {
      trace.definirFonction("i", (cuf) => Math.hypot(g.ia, g.ir - cuf * 1e-6 * W50 * U0));
    }
    if (valeurs) {
      const pertes = EX.rl * g.i * g.i;
      valeurs.maj({
        il: g.il,
        ic: etat.ic,
        c: g.c,
        qc: g.qc,
        i: g.i,
        cos: nombre(api, g.ia / g.i, 3) + (Math.abs(g.reste) < 0.05 ? ", résistif" : capacitif ? ", capacitif" : ", inductif"),
        pertes,
        gain: EX.rl * g.il * g.il - pertes,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: O.x, y: O.y },
    a: { x: O.x, y: O.y - K * IC_MAX },
    min: 0,
    max: IC_MAX,
    pas: 0.5,
    valeur: etat.ic,
    libelle: "Courant du condensateur",
    format: (mesure) => "courant du condensateur " + nombre(api, mesure.valeur, 1) + " ampères",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.ic = mesure.valeur;
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-phaseurs-curseurs",
    [{ id: "cos", libelle: "Facteur de puissance de la charge seule, inductif", min: 0.5, max: 1, pas: 0.01, valeur: etat.cos, chiffres: 2 }],
    (lues) => {
      etat.cos = lues.cos;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   D. Animation : énergie échangée entre la charge et le condensateur
   -------------------------------------------------------------------------- */

function construireEnergie(racine, api) {
  const conteneur = racine.querySelector("#d-energie");
  if (!conteneur) return;

  const P = EX.p;
  const Q1 = EX.p * tanDe(EX.cos1);
  const S1 = Math.hypot(P, Q1);
  const PMAX = P + S1;

  const svg = svgEl("svg", {
    viewBox: "0 0 720 210",
    role: "img",
    "aria-label": "Échanges de puissance instantanée entre la source, la charge et le condensateur, reliés à un même nœud ; épaisseur et sens des flèches selon la puissance transportée",
  });
  const defs = svgEl("defs");
  defs.innerHTML =
    '<marker id="fl-d-e" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" refX="12" refY="7" orient="auto">' +
    '<path d="M0 0 14 7 0 14Z" fill="currentColor"/></marker>';
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="2" fill="none">' +
    '<rect x="30" y="70" width="140" height="60" rx="8"/>' +
    '<rect x="550" y="14" width="150" height="56" rx="8"/>' +
    '<rect x="550" y="134" width="150" height="56" rx="8"/></g>' +
    '<circle cx="380" cy="100" r="6" fill="currentColor"/>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    texte(100, 98, "source", ' text-anchor="middle"') +
    texte(100, 116, "réseau", ' text-anchor="middle"') +
    texte(625, 38, "charge", ' text-anchor="middle"') +
    texte(625, 56, "12 kW, cos φ 0,70", ' text-anchor="middle" font-size="11"') +
    texte(625, 158, "condensateur", ' text-anchor="middle"') +
    texte(625, 176, "batterie", ' text-anchor="middle" font-size="11"') +
    texte(380, 128, "nœud A", ' text-anchor="middle" font-size="11"') +
    "</g>";
  const fs = svgEl("path", { stroke: "currentColor", fill: "none", "stroke-linecap": "round" });
  const fl = svgEl("path", { stroke: "currentColor", fill: "none", "stroke-linecap": "round" });
  const fc = svgEl("path", { stroke: "currentColor", fill: "none", "stroke-linecap": "round" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  svg.append(defs, fond, fs, fl, fc, etiquettes);
  conteneur.appendChild(svg);

  const etat = { taux: 0, t: 0 };
  const puissances = (tms) => {
    const th = (W50 * tms) / 1000;
    const qc = etat.taux * Q1;
    const pl = P * (1 + Math.cos(2 * th)) + Q1 * Math.sin(2 * th);
    const pc = -qc * Math.sin(2 * th);
    return { pl, pc, ps: pl + pc, qc };
  };

  const trace = api.sim.traceur("#d-energie-trace", {
    titre: "Puissances instantanées reçues par la charge et le condensateur, fournie par la source",
    genre: "Animation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "p(t)",
    yUnite: "kW",
    xMin: 0,
    xMax: 40,
    yMin: -26,
    yMax: 32,
    ratio: 0.4,
    echantillons: 500,
    series: [
      { id: "pl", nom: "charge : p reçue", couleur: "serie-1", epaisseur: 2.2 },
      { id: "pc", nom: "condensateur : p reçue", couleur: "serie-3", epaisseur: 2.2 },
      { id: "ps", nom: "source : p fournie", couleur: "serie-5", epaisseur: 3 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, P / 1000, "P = 12 kW", false);
      ligneH(c, repere, couleurs, 0, "", false);
      ligneV(c, repere, couleurs, etat.t, "instant étudié");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#d-energie-valeurs", [
    { id: "qc", libelle: "Réactif fourni par le condensateur", unite: "var", decimales: 0 },
    { id: "pl", libelle: "Charge : puissance reçue à l'instant", unite: "kW", decimales: 2 },
    { id: "pc", libelle: "Condensateur : puissance reçue à l'instant", unite: "kW", decimales: 2 },
    { id: "ps", libelle: "Source : puissance fournie à l'instant", unite: "kW", decimales: 2 },
    { id: "plage", libelle: "Source : minimum et maximum", format: (v) => v },
    { id: "neg", libelle: "Part de la période où la source reçoit de l'énergie", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function fleche(element, x1, y1, x2, y2, p) {
    const largeur = 1 + 8 * Math.min(1, Math.abs(p) / PMAX);
    element.setAttribute("stroke-width", largeur.toFixed(2));
    element.removeAttribute("marker-end");
    element.removeAttribute("marker-start");
    if (Math.abs(p) < 150) {
      element.setAttribute("d", "M" + x1 + " " + y1 + "L" + x2 + " " + y2);
      element.setAttribute("stroke-dasharray", "2 5");
      return;
    }
    element.removeAttribute("stroke-dasharray");
    if (p > 0) {
      element.setAttribute("d", segment(x1, y1, x2, y2, 12));
    } else {
      element.setAttribute("d", segment(x2, y2, x1, y1, 12));
    }
    element.setAttribute("marker-end", "url(#fl-d-e)");
  }

  function dessiner() {
    const v = puissances(etat.t);
    fleche(fs, 172, 100, 372, 100, v.ps);
    fleche(fl, 386, 96, 548, 46, v.pl);
    fleche(fc, 386, 104, 548, 158, v.pc);
    etiquettes.innerHTML =
      texte(272, 86, nombre(api, Math.abs(v.ps) / 1000, 1) + " kW", ' text-anchor="middle"') +
      texte(466, 54, nombre(api, Math.abs(v.pl) / 1000, 1) + " kW", ' text-anchor="middle"') +
      texte(466, 160, nombre(api, Math.abs(v.pc) / 1000, 1) + " kW", ' text-anchor="middle"');
    if (trace) {
      trace.definirFonction("pl", (t) => puissances(t).pl / 1000);
      trace.definirFonction("pc", (t) => puissances(t).pc / 1000);
      trace.definirFonction("ps", (t) => puissances(t).ps / 1000);
    }
    if (valeurs) {
      const qNet = Q1 - v.qc;
      const s = Math.hypot(P, qNet);
      const phi = Math.abs(Math.atan2(qNet, P)) / DEG;
      valeurs.maj({
        qc: v.qc,
        pl: v.pl / 1000,
        pc: v.pc / 1000,
        ps: v.ps / 1000,
        plage: nombre(api, (P - s) / 1000, 2) + " à " + nombre(api, (P + s) / 1000, 2) + " kW",
        neg: (phi / 180) * 100,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#d-energie-curseurs",
    [
      {
        id: "taux",
        libelle: "Taux de compensation QC / QL",
        min: 0,
        max: 1.5,
        pas: 0.05,
        valeur: 0,
        format: (v) => nombre(api, v * 100, 0) + " %",
      },
    ],
    (lues) => {
      etat.taux = lues.taux;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-energie-lecteur", {
    de: 0,
    a: 40,
    duree: 14,
    boucle: true,
    auto: false,
    libelle: "Faire avancer l'instant étudié sur deux périodes",
    rappel(valeur) {
      etat.t = valeur;
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : batterie fixe ou automatique sur une journée
   -------------------------------------------------------------------------- */

/* Profil journalier de l'atelier : [heure de début, heure de fin, P en W, cos phi]. */
const PROFIL = [
  [0, 6, 3000, 0.5],
  [6, 7, 8000, 0.65],
  [7, 12, 12000, 0.7],
  [12, 13, 6000, 0.55],
  [13, 18, 12000, 0.7],
  [18, 20, 6000, 0.55],
  [20, 24, 3000, 0.5],
];

function chargeA(heure) {
  const h = Math.min(23.999, Math.max(0, heure));
  const tranche = PROFIL.find((ligne) => h >= ligne[0] && h < ligne[1]) || PROFIL[0];
  return { p: tranche[2], q: tranche[2] * tanDe(tranche[3]) };
}

/** Réactif fourni par la batterie à une charge donnée. */
function reactifBatterie(reglage, charge) {
  if (reglage.mode === 0) return reglage.qbat;
  const n = Math.max(1, Math.round(reglage.gradins));
  const pasQ = reglage.qbat / n;
  if (pasQ <= 0) return 0;
  const besoin = charge.q - charge.p * tanDe(reglage.cible);
  let k = Math.min(n, Math.max(0, Math.ceil(besoin / pasQ - 1e-9)));
  while (k > 0 && charge.q - k * pasQ < 0) k -= 1;
  return k * pasQ;
}

function bilanJournee(reglage) {
  let ea = 0;
  let erCharge = 0;
  let erAbs = 0;
  let erFournie = 0;
  let heuresCap = 0;
  for (const [debut, fin, p, cos] of PROFIL) {
    const duree = fin - debut;
    const charge = { p, q: p * tanDe(cos) };
    const qNet = charge.q - reactifBatterie(reglage, charge);
    ea += (p * duree) / 1000;
    erCharge += (charge.q * duree) / 1000;
    if (qNet >= 0) erAbs += (qNet * duree) / 1000;
    else {
      erFournie += (-qNet * duree) / 1000;
      heuresCap += duree;
    }
  }
  const pointe = { p: 12000, q: 12000 * tanDe(0.7) };
  const qPointe = pointe.q - reactifBatterie(reglage, pointe);
  return { ea, erCharge, erAbs, erFournie, heuresCap, cosPointe: pointe.p / Math.hypot(pointe.p, qPointe) };
}

function construireProfil(racine, api) {
  const reglage = { qbat: 8.3e3, mode: 0, gradins: 4, cible: 0.95 };

  const trace = api.sim.traceur("#e-profil-trace", {
    titre: "Puissances réactives de l'atelier sur une journée",
    genre: "Simulation",
    xTitre: "heure",
    xUnite: "h",
    yTitre: "Q",
    yUnite: "kvar",
    xMin: 0,
    xMax: 24,
    yMin: -8,
    yMax: 14,
    ratio: 0.42,
    echantillons: 960,
    series: [
      { id: "ql", nom: "réactif de la charge", couleur: "serie-4", epaisseur: 2 },
      { id: "qr", nom: "réactif demandé au réseau", couleur: "serie-5", epaisseur: 3 },
      { id: "qo", nom: "objectif P tan φ cible", couleur: "serie-6", epaisseur: 1.6 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 0, "Q = 0 : au-dessous, capacitif", true);
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-profil-valeurs", [
    { id: "mode", libelle: "Mode de la batterie", format: (v) => v },
    { id: "ea", libelle: "Énergie active journalière", unite: "kWh", decimales: 0 },
    { id: "erc", libelle: "Énergie réactive de la charge", unite: "kvarh", decimales: 1 },
    { id: "era", libelle: "Énergie réactive absorbée au réseau", unite: "kvarh", decimales: 1 },
    { id: "erf", libelle: "Énergie réactive renvoyée au réseau", unite: "kvarh", decimales: 1 },
    { id: "tan", libelle: "tan φ moyen absorbé, Er / Ea", decimales: 3 },
    { id: "cap", libelle: "Heures en surcompensation", unite: "h", decimales: 0 },
    { id: "cosp", libelle: "Facteur de puissance à la pointe", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    if (trace) {
      trace.definirFonction("ql", (h) => chargeA(h).q / 1000);
      trace.definirFonction("qr", (h) => {
        const charge = chargeA(h);
        return (charge.q - reactifBatterie(reglage, charge)) / 1000;
      });
      trace.definirFonction("qo", (h) => (reglage.mode === 0 ? NaN : (chargeA(h).p * tanDe(reglage.cible)) / 1000));
    }
    if (valeurs) {
      const b = bilanJournee(reglage);
      valeurs.maj({
        mode:
          reglage.mode === 0
            ? "fixe, toujours en service ; gradins et objectif sans effet"
            : "automatique, " + Math.round(reglage.gradins) + " gradins de " + nombre(api, reglage.qbat / 1000 / Math.round(reglage.gradins), 2) + " kvar",
        ea: b.ea,
        erc: b.erCharge,
        era: b.erAbs,
        erf: b.erFournie,
        tan: b.erAbs / b.ea,
        cap: b.heuresCap,
        cosp: b.cosPointe,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-profil-curseurs",
    [
      { id: "qbat", libelle: "Puissance totale de la batterie", min: 0, max: 14, pas: 0.1, valeur: 8.3, unite: "kvar" },
      { id: "mode", libelle: "Mode", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (Number(v) === 0 ? "fixe" : "automatique") },
      { id: "gradins", libelle: "Nombre de gradins, mode automatique", min: 1, max: 8, pas: 1, valeur: 4, chiffres: 0 },
      { id: "cible", libelle: "Facteur de puissance visé par le régulateur", min: 0.9, max: 1, pas: 0.01, valeur: 0.95, chiffres: 2 },
    ],
    (lues) => {
      reglage.qbat = lues.qbat * 1000;
      reglage.mode = Number(lues.mode);
      reglage.gradins = lues.gradins;
      reglage.cible = lues.cible;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   H. Animation : construction du triangle avant et après compensation
   -------------------------------------------------------------------------- */

function construireConstruction(racine, api) {
  const conteneur = racine.querySelector("#h-construction");
  if (!conteneur) return;

  const O = { x: 70, y: 330 };
  const K = 18;
  const Q1 = EX.p * tanDe(EX.cos1);
  const QC = reactifAInstaller(EX.p, EX.cos1, EX.cos2);
  const Q2 = Q1 - QC;
  const px = O.x + (K * EX.p) / 1000;
  const y1 = O.y - (K * Q1) / 1000;
  const y2 = O.y - (K * Q2) / 1000;

  const svg = svgEl("svg", {
    viewBox: "0 0 720 380",
    role: "img",
    "aria-label": "Construction du triangle des puissances de l'exemple : P de 12 kilowatts, Q1 de 12,24 kilovars, S1 de 17,14 kilovoltampères, QC de 8,30 kilovars retranché, Q2 de 3,94 kilovars et S2 de 12,63 kilovoltampères",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-h-k");
  const fond = svgEl("g");
  let graduations = "";
  let textes = "";
  for (let k = 2; k <= 14; k += 2) {
    graduations += "M" + (O.x + K * k) + " " + (O.y - 4) + "v8";
    textes += texte(O.x + K * k, O.y + 18, String(k), ' text-anchor="middle"');
  }
  for (let k = 2; k <= 16; k += 2) {
    graduations += "M" + (O.x - 4) + " " + (O.y - K * k) + "h8";
    textes += texte(O.x - 8, O.y - K * k + 4, String(k), ' text-anchor="end"');
  }
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7">' +
    '<path d="M' + (O.x - 20) + " " + O.y + "H" + 360 + '" marker-end="url(#fl-h-k)"/>' +
    '<path d="' + graduations + '"/>' +
    '<path d="M' + O.x + " " + (O.y + 20) + "V" + 22 + '" marker-end="url(#fl-h-k)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="10.5" opacity="0.85">' +
    textes +
    texte(360, O.y + 34, "P (kW)", ' text-anchor="end"') +
    texte(O.x + 8, 30, "Q (kvar)") +
    "</g>";
  const tp = svgEl("path", { stroke: "currentColor", "stroke-width": 2.6, fill: "none", "marker-end": "url(#fl-h-k)" });
  const tq1 = svgEl("path", { stroke: "currentColor", "stroke-width": 1.6, fill: "none", "stroke-dasharray": "6 5", "marker-end": "url(#fl-h-k)" });
  const ts1 = svgEl("path", { stroke: "currentColor", "stroke-width": 1.6, fill: "none", "stroke-dasharray": "6 5", "marker-end": "url(#fl-h-k)" });
  const tqc = svgEl("path", { stroke: "currentColor", "stroke-width": 2.6, fill: "none", "marker-end": "url(#fl-h-k)" });
  const tq2 = svgEl("path", { stroke: "currentColor", "stroke-width": 3.4, fill: "none", "marker-end": "url(#fl-h-k)" });
  const ts2 = svgEl("path", { stroke: "currentColor", "stroke-width": 3.4, fill: "none", "stroke-dasharray": "12 6", "marker-end": "url(#fl-h-k)" });
  const arcs = svgEl("path", { stroke: "currentColor", "stroke-width": 1.3, fill: "none" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, tp, tq1, ts1, tqc, tq2, ts2, arcs, etiquettes);
  conteneur.appendChild(svg);

  const ETAPES = [
    "1. Base P = 12 kW, inchangée",
    "2. Réactif de la charge Q1 = 12,24 kvar",
    "3. S1 = 17,14 kVA, φ1 = 45,57°",
    "4. Batterie : QC = 8,30 kvar retranché",
    "5. Reste Q2 = 3,94 kvar",
    "6. S2 = 12,63 kVA, φ2 = 18,19°",
    "Construction terminée",
  ];

  const valeurs = api.sim.valeurs("#h-construction-valeurs", [
    { id: "etape", libelle: "Étape", format: (v) => v },
    { id: "q", libelle: "Réactif vu du réseau", format: (v) => v },
    { id: "s", libelle: "Puissance apparente", format: (v) => v },
    { id: "i", libelle: "Courant de ligne S / U", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const phi1 = Math.acos(EX.cos1) / DEG;
  const phi2 = Math.acos(EX.cos2) / DEG;

  function dessiner(s) {
    tp.setAttribute("d", partiel(O.x, O.y, px, O.y, s));
    tq1.setAttribute("d", partiel(px, O.y, px, y1, s - 1));
    ts1.setAttribute("d", partiel(O.x, O.y, px, y1, s - 2));
    tqc.setAttribute("d", partiel(px + 22, y1, px + 22, y2, s - 3));
    tq2.setAttribute("d", partiel(px, O.y, px, y2, s - 4));
    ts2.setAttribute("d", partiel(O.x, O.y, px, y2, s - 5));
    arcs.setAttribute("d", (s >= 3 ? cheminArc(O.x, O.y, 60, 0, phi1) : "") + (s >= 6 ? cheminArc(O.x, O.y, 100, 0, phi2) : ""));
    etiquettes.innerHTML =
      (s >= 1 ? texte((O.x + px) / 2, O.y + 36, "P = 12 kW", ' text-anchor="middle"') : "") +
      (s >= 2 ? texte(px - 8, (O.y + y1) / 2 - 30, "Q1", ' text-anchor="end"') : "") +
      (s >= 3 ? texte((O.x + px) / 2 - 30, (O.y + y1) / 2 - 10, "S1", ' text-anchor="end"') : "") +
      (s >= 3 ? texte(O.x + 66, O.y - 30, "φ1", ' font-size="11"') : "") +
      (s >= 4 ? texte(px + 30, (y1 + y2) / 2, "QC") : "") +
      (s >= 5 ? texte(px - 8, (O.y + y2) / 2 + 4, "Q2", ' text-anchor="end" font-weight="600"') : "") +
      (s >= 6 ? texte((O.x + px) / 2 + 20, (O.y + y2) / 2 + 22, "S2", ' font-weight="600"') : "") +
      (s >= 6 ? texte(O.x + 106, O.y - 10, "φ2", ' font-size="11"') : "") +
      texte(712, 30, ETAPES[Math.min(6, Math.floor(s))], ' text-anchor="end" font-weight="600"') +
      texte(712, 48, "avant : tirets fins ; après : traits épais", ' text-anchor="end" font-size="11"');
    if (valeurs) {
      const apres = s >= 4;
      valeurs.maj({
        etape: ETAPES[Math.min(6, Math.floor(s))],
        q: s < 2 ? "à construire" : nombre(api, (apres ? Q2 : Q1) / 1000, 2) + " kvar",
        s: s < 3 ? "à construire" : nombre(api, Math.hypot(EX.p, apres && s >= 6 ? Q2 : Q1) / 1000, 2) + " kVA",
        i: s < 3 ? "à construire" : nombre(api, Math.hypot(EX.p, apres && s >= 6 ? Q2 : Q1) / U0, 2) + " A",
      });
    }
  }

  const lecteur = api.sim.lecteur("#h-construction-lecteur", {
    de: 0,
    a: 7.5,
    duree: 15,
    boucle: true,
    auto: false,
    libelle: "Construire le triangle étape par étape",
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
   I. Simulation : compensation du site et rang de résonance
   -------------------------------------------------------------------------- */

function bilanCompensationSite(qInd, qGlob, scc) {
  const q = SITE.q - qInd - qGlob;
  const s1 = Math.hypot(SITE.p, q);
  const i1 = s1 / U0;
  const ieff = Math.hypot(i1, SITE.harmoniques);
  const qTotal = 3 * (qInd + qGlob);
  const nr = qTotal > 1 ? Math.sqrt(scc / qTotal) : Infinity;
  return { q, s1, i1, ieff, cos1: SITE.p / s1, lambda: SITE.p / (U0 * ieff), sSite: 3 * U0 * ieff, qTotal, nr, iComp: Math.hypot(SITE.pComp, SITE.qComp - qInd) / U0 };
}

function construireSite(racine, api) {
  const reglage = { qInd: 2480.7, qGlob: 0, scc: 2.5e6 };
  const RANGS = [5, 7, 11, 13];

  const amplification = (h) => {
    const b = bilanCompensationSite(reglage.qInd, reglage.qGlob, reglage.scc);
    if (!Number.isFinite(b.nr)) return 1;
    const x = h / b.nr;
    return 1 / Math.sqrt((1 - x * x) ** 2 + (x / 10) ** 2);
  };

  const trace = api.sim.traceur("#i-site-trace", {
    titre: "Amplification de la tension harmonique au jeu de barres",
    genre: "Simulation",
    xTitre: "rang h",
    xMin: 1,
    xMax: 25,
    yTitre: "facteur",
    yMin: 0,
    yMax: 11,
    ratio: 0.42,
    echantillons: 600,
    series: [{ id: "a", nom: "facteur d'amplification, amortissement arbitraire", couleur: "serie-2", epaisseur: 2.6 }],
    surDessin({ c, repere, couleurs }) {
      for (const rang of RANGS) ligneV(c, repere, couleurs, rang, String(rang));
      const b = bilanCompensationSite(reglage.qInd, reglage.qGlob, reglage.scc);
      if (Number.isFinite(b.nr) && b.nr <= 25) ligneV(c, repere, couleurs, b.nr, "nr", 3);
      ligneH(c, repere, couleurs, 1, "sans batterie : 1", false);
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#i-site-valeurs", [
    { id: "comp", libelle: "Courant du départ compresseur", unite: "A", decimales: 2 },
    { id: "q", libelle: "Réactif du tableau, par phase", unite: "var", decimales: 0 },
    { id: "cos1", libelle: "Facteur de déplacement cos φ1", format: (v) => v },
    { id: "lambda", libelle: "Facteur de puissance λ, harmoniques compris", decimales: 3 },
    { id: "ieff", libelle: "Courant d'arrivée efficace vrai, par phase", unite: "A", decimales: 2 },
    { id: "s", libelle: "Puissance apparente du site", unite: "kVA", decimales: 1 },
    { id: "qt", libelle: "Batteries installées, trois phases", unite: "kvar", decimales: 2 },
    { id: "nr", libelle: "Rang de résonance nr = √(Scc / QC)", format: (v) => v },
    { id: "verdict", libelle: "Diagnostic", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    if (trace) trace.definirFonction("a", amplification);
    if (!valeurs) return;
    const b = bilanCompensationSite(reglage.qInd, reglage.qGlob, reglage.scc);
    let verdict;
    if (b.q < -1) verdict = "surcompensation : site capacitif";
    else if (!Number.isFinite(b.nr)) verdict = "pas de batterie : pas de résonance";
    else {
      const proche = RANGS.find((rang) => Math.abs(b.nr - rang) < 1.5);
      verdict = proche ? "résonance proche du rang " + proche + " : self anti-harmonique nécessaire" : b.nr < 4 ? "résonance sous le rang 5" : "résonance éloignée des rangs 5, 7, 11, 13";
    }
    valeurs.maj({
      comp: b.iComp,
      q: b.q,
      cos1: nombre(api, b.cos1, 3) + (b.q < -1 ? ", capacitif" : ""),
      lambda: b.lambda,
      ieff: b.ieff,
      s: b.sSite / 1000,
      qt: b.qTotal / 1000,
      nr: Number.isFinite(b.nr) ? nombre(api, b.nr, 1) : "aucun",
      verdict,
    });
  }

  const curseurs = api.sim.curseurs(
    "#i-site-curseurs",
    [
      { id: "qInd", libelle: "Compensation individuelle du compresseur, par phase", min: 0, max: 4.4, pas: 0.01, valeur: 2.48, unite: "kvar" },
      { id: "qGlob", libelle: "Batterie globale au tableau, par phase", min: 0, max: 6, pas: 0.05, valeur: 0, unite: "kvar" },
      { id: "scc", libelle: "Puissance de court-circuit de la source", min: 0.5, max: 5, pas: 0.1, valeur: 2.5, unite: "MVA" },
    ],
    (lues) => {
      reglage.qInd = lues.qInd * 1000;
      reglage.qGlob = lues.qGlob * 1000;
      reglage.scc = lues.scc * 1e6;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/** Dessin d'exercice : courant de ligne en fonction de la capacité, quatre points repérés. */
function dessinCourbe(idMarqueur) {
  const ia = EX.p / U0;
  const ir = ia * tanDe(EX.cos1);
  const versX = (c) => 60 + c / 3;
  const versY = (i) => 290 - 3.2 * i;
  const courant = (c) => Math.hypot(ia, ir - c * 1e-6 * W50 * U0);
  let chemin = "";
  for (let c = 0; c <= 1500; c += 25) chemin += (c === 0 ? "M" : "L") + versX(c).toFixed(1) + " " + versY(courant(c)).toFixed(1);
  const points = [
    ["A", 0],
    ["B", 499.3],
    ["C", 736.7],
    ["D", 1200],
  ];
  let marques = "";
  for (const [nom, c] of points) {
    const x = versX(c);
    const y = versY(courant(c));
    marques += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5" fill="currentColor"/>';
    marques += texte(x, y - 14, nom, ' text-anchor="middle" font-size="14" font-weight="600"');
  }
  return (
    "<defs>" + marqueur(idMarqueur) + "</defs>" +
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.65"><path d="M50 290H580" marker-end="url(#' + idMarqueur + ')"/><path d="M60 300V20" marker-end="url(#' + idMarqueur + ')"/></g>' +
    '<path d="' + chemin + '" stroke="currentColor" stroke-width="2.6" fill="none"/>' +
    '<path d="M60 ' + versY(ia).toFixed(1) + 'H560" stroke="currentColor" stroke-width="1" fill="none" stroke-dasharray="4 4" opacity="0.7"/>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace">' +
    marques +
    texte(578, 310, "C (µF)", ' text-anchor="end" font-size="11"') +
    texte(68, 30, "I ligne (A)", ' font-size="11"') +
    texte(560, versY(ia) + 16, "P / U", ' text-anchor="end" font-size="11"') +
    texte(20, 330, "courant de ligne d'une charge inductive compensée par une capacité C", ' font-size="11"') +
    "</g>"
  );
}

/** Dessin de quiz : triangle avant et après compensation, quatre segments repérés. */
function dessinAvantApres(idMarqueur) {
  return (
    "<defs>" + marqueur(idMarqueur) + "</defs>" +
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.65"><path d="M60 270H520M80 300V20"/></g>' +
    '<path d="M80 270H357" stroke="currentColor" stroke-width="2.6" fill="none" marker-end="url(#' + idMarqueur + ')"/>' +
    '<path d="M360 270V63" stroke="currentColor" stroke-width="1.6" fill="none" stroke-dasharray="6 5" marker-end="url(#' + idMarqueur + ')"/>' +
    '<path d="M386 60V190" stroke="currentColor" stroke-width="2.6" fill="none" marker-end="url(#' + idMarqueur + ')"/>' +
    '<path d="M80 270L357.2 194.8" stroke="currentColor" stroke-width="3.2" fill="none" stroke-dasharray="11 6" marker-end="url(#' + idMarqueur + ')"/>' +
    '<path d="M80 270L357.6 62" stroke="currentColor" stroke-width="1.4" fill="none" stroke-dasharray="6 5"/>' +
    '<path d="M360 60H392M360 193H392" stroke="currentColor" stroke-width="1" fill="none" stroke-dasharray="2 3"/>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="14" font-weight="600">' +
    '<text x="214" y="296">a</text><text x="340" y="150">b</text><text x="400" y="132">c</text><text x="210" y="222">d</text></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
    '<text x="20" y="324">plan des puissances : avant en tirets fins, après en traits épais</text></g>'
  );
}

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : réactif à installer. */
  const qK1 = reactifAInstaller(8000, 0.75, 0.95);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-reactif",
      titre: "Réactif à installer pour une charge",
      niveau: "fondamental",
      enonce:
        "<p>Une charge absorbe $8\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}75$ inductif. Quelle puissance réactive une batterie doit-elle fournir pour amener le facteur de puissance à $0{,}95$ ?</p>",
      valeur: qK1,
      unite: "var",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Réactif à installer $Q_C$",
      etapes: [
        { texte: "$\\tan\\varphi_1 = \\sqrt{1 - 0{,}5625}/0{,}75 = 0{,}8819$ ; $\\tan\\varphi_2 = 0{,}3287$." },
        { texte: "$Q_1 = 8000 \\times 0{,}8819 = 7055\\ \\mathrm{var}$ ; $Q_2 = 8000 \\times 0{,}3287 = 2629\\ \\mathrm{var}$." },
        { texte: "$Q_C = Q_1 - Q_2 = 8000 \\times 0{,}5532 = 4426\\ \\mathrm{var}$.", note: "Contrôle : $Q_C/P = 0{,}553\\ \\mathrm{kvar/kW}$, le coefficient des tableaux constructeurs pour $0{,}75 \\to 0{,}95$." },
      ],
      visuelCorrection(conteneur, moteur) {
        compensationCorrection(moteur, conteneur, "Triangle avant et après : P, Q1 et QC retranché", 8000, 8000 * tanDe(0.75), qK1, {
          p: "P = 8000 W",
          q1: "Q1 = 7055 var",
          qc: "- QC = - 4426 var",
          s: "S2 = 8421 VA",
        });
      },
    })
  );

  /* Fondamental 2 : capacité. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-capacite",
      titre: "Capacité d'un condensateur de compensation",
      niveau: "fondamental",
      enonce:
        "<p>Quelle capacité faut-il pour fournir $5\\ \\mathrm{kvar}$ sous $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$ ? Donnez-la en microfarads.</p>",
      valeur: (5000 / U2W) * 1e6,
      unite: "µF",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Capacité $C$",
      etapes: [
        { texte: "$Q_C = C\\omega U^2$, donc $C = Q_C/(U^2\\omega)$." },
        { texte: "$U^2\\omega = 52\\,900 \\times 314{,}16 = 16{,}62 \\times 10^6\\ \\mathrm{V^2/s}$." },
        { texte: "$C = 5000/(16{,}62 \\times 10^6) = 300{,}9\\ \\mu\\mathrm{F}$, et $I_C = 5000/230 = 21{,}7\\ \\mathrm{A}$.", note: "Ordre de grandeur : $5 \\times 60{,}2 = 301\\ \\mu\\mathrm{F}$. Entre deux phases sous $400\\ \\mathrm{V}$, il suffirait de $99{,}5\\ \\mu\\mathrm{F}$ pour le même réactif." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Capacité nécessaire en fonction de la tension, pour 5 kvar à 50 Hz",
          xTitre: "U",
          xUnite: "V",
          yTitre: "C",
          yUnite: "µF",
          xMin: 200,
          xMax: 420,
          yMin: 0,
          yMax: 420,
          series: [{ id: "c", nom: "C = QC / (U² ω), en microfarads", couleur: "serie-3", epaisseur: 2.6, fonction: (u) => (5000 / (u * u * W50)) * 1e6 }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 230, (5000 / U2W) * 1e6, "230 V : 300,9 µF", false);
            marquerPoint(c, repere, couleurs, 400, (5000 / (160000 * W50)) * 1e6, "400 V : 99,5 µF", true);
          },
        });
      },
    })
  );

  /* Intermédiaire 1 : gain sur les pertes. */
  const i1K3 = 15000 / (230 * 0.8);
  const i2K3 = 15000 / (230 * 0.95);
  const gainK3 = 0.1 * (i1K3 * i1K3 - i2K3 * i2K3);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-pertes",
      titre: "Pertes évitées sur une ligne",
      niveau: "intermédiaire",
      enonce:
        "<p>Un départ de $230\\ \\mathrm{V}$, de résistance totale $0{,}10\\ \\Omega$, alimente $15\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}80$. On compense à $0{,}95$ au bout du départ. Calculez les courants avant et après, puis les pertes évitées dans le départ, en watts.</p>",
      valeur: gainK3,
      unite: "W",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Pertes évitées",
      etapes: [
        { texte: "$I_1 = 15\\,000/(230 \\times 0{,}80) = 81{,}52\\ \\mathrm{A}$ ; $I_2 = 15\\,000/(230 \\times 0{,}95) = 68{,}65\\ \\mathrm{A}$." },
        { texte: "Pertes : $0{,}10 \\times 81{,}52^2 = 664{,}6\\ \\mathrm{W}$ avant, $0{,}10 \\times 68{,}65^2 = 471{,}3\\ \\mathrm{W}$ après." },
        { texte: "Gain : $193{,}3\\ \\mathrm{W}$, soit $1 - (0{,}80/0{,}95)^2 = 29{,}1\\ \\%$ des pertes.", note: "La batterie doit être au bout du départ : placée au tableau, elle ne soulagerait pas ce câble." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Pertes dans le départ en fonction du facteur de puissance obtenu",
          xTitre: "cos φ",
          xMin: 0.7,
          xMax: 1,
          yTitre: "pertes",
          yUnite: "W",
          yMin: 0,
          yMax: 900,
          series: [{ id: "p", nom: "R I² avec I = P / (U cos φ)", couleur: "serie-5", epaisseur: 2.6, fonction: (c) => 0.1 * (15000 / (230 * c)) ** 2 }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 0.8, 0.1 * i1K3 * i1K3, "avant : 664,6 W", false);
            marquerPoint(c, repere, couleurs, 0.95, 0.1 * i2K3 * i2K3, "après : 471,3 W", true);
          },
        });
      },
    })
  );

  /* Intermédiaire 2 : lecture de la courbe I(C). */
  ressources.push(
    api.exercice.schema(cible, {
      id: "k-courbe",
      titre: "Repérer la surcompensation sur une courbe",
      niveau: "intermédiaire",
      consigne: "Cliquez sur le point où l'installation est capacitive, puis validez.",
      enonce:
        "<p>La courbe donne le courant de ligne d'une charge inductive en fonction de la capacité placée en parallèle. Quatre réglages sont repérés. Lequel rend l'installation capacitive ?</p>",
      viewBox: "0 0 600 340",
      description: "Courbe en U du courant de ligne en fonction de la capacité, points A à capacité nulle, B en descente, C au minimum, D en remontée",
      dessin: dessinCourbe("fl-k-co"),
      zones: [
        { x: 40, y: 30, largeur: 50, hauteur: 50, etiquette: "point A" },
        { x: 200, y: 90, largeur: 56, hauteur: 50, etiquette: "point B" },
        { x: 280, y: 100, largeur: 56, hauteur: 50, etiquette: "point C" },
        { x: 432, y: 70, largeur: 56, hauteur: 50, etiquette: "point D", juste: true },
      ],
      etapes: [
        { texte: "Le minimum du courant, point C, correspond à $Q_C = Q_1$ : le réseau ne fournit plus que la composante active, $P/U$, et $\\cos\\varphi = 1$." },
        { texte: "À gauche du minimum, A et B, le condensateur fournit moins que la charge ne consomme : l'installation reste inductive." },
        { texte: "À droite, D, le condensateur fournit plus que nécessaire : l'installation est capacitive, bien que son courant, $62\\ \\mathrm{A}$, reste inférieur à celui de A.", note: "La courbe est symétrique autour de C : un courant donné peut correspondre à une sous-compensation ou à une surcompensation." },
      ],
      visuelCorrection(conteneur, moteur) {
        const ia = EX.p / U0;
        const ir = ia * tanDe(EX.cos1);
        fresnelCorrection(moteur, conteneur, {
          titre: "Au point D : le courant du condensateur dépasse la composante réactive de la charge",
          unite: "A",
          somme: true,
          nomSomme: "I ligne en avance : capacitif",
          vecteurs: [
            { id: "il", nom: "IL = 74,5 A", amplitude: Math.hypot(ia, ir), phase: -Math.atan2(ir, ia) / DEG, couleur: "serie-1" },
            { id: "ic", nom: "IC = 86,7 A", amplitude: 1200e-6 * W50 * U0, phase: 90, couleur: "serie-3" },
          ],
        });
      },
    })
  );

  /* Avancé : batterie fixe sous contraintes. */
  const qNuit = 3000 * tanDe(0.5);
  const cMax = qNuit / (253 * 253 * W50);
  const qJour = cMax * U2W;
  const qPointe = EX.p * tanDe(EX.cos1) - qJour;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-fixe",
      titre: "Batterie fixe : le dilemme pointe et creux",
      niveau: "avancé",
      enonce:
        "<p>L'atelier de la section H absorbe $12\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}70$ à la pointe, sous $230\\ \\mathrm{V}$. La nuit, il n'absorbe que $3\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}50$, et la tension peut monter à $253\\ \\mathrm{V}$ ; on suppose ces deux valeurs de charge valables sous la tension correspondante. On veut une batterie fixe qui ne rende jamais l'installation capacitive. Quelle capacité maximale peut-on installer ? Quel facteur de puissance obtient-on alors à la pointe ? Donnez la capacité maximale en microfarads.</p>",
      valeur: cMax * 1e6,
      unite: "µF",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Capacité maximale $C_{\\max}$",
      etapes: [
        { texte: "Réactif de la charge la nuit : $Q_n = 3000 \\times \\tan(\\arccos 0{,}5) = 3000 \\times 1{,}732 = 5196\\ \\mathrm{var}$." },
        { texte: "Condition la plus sévère : tension haute, car $Q_C = C\\omega U^2$. Il faut $C\\omega \\times 253^2 \\leq 5196$, soit $C \\leq 5196/(64\\,009 \\times 314{,}16) = 258{,}4\\ \\mu\\mathrm{F}$." },
        { texte: "À la pointe, sous $230\\ \\mathrm{V}$ : $Q_C = 258{,}4 \\times 10^{-6} \\times 16{,}62 \\times 10^6 = 4294\\ \\mathrm{var}$ ; $Q = 12\\,242 - 4294 = 7948\\ \\mathrm{var}$." },
        { texte: "$\\cos\\varphi = 12\\,000/\\sqrt{12\\,000^2 + 7948^2} = 0{,}834$ : très loin de $0{,}95$, qui demandait $499\\ \\mu\\mathrm{F}$.", note: "Aucune batterie fixe ne satisfait les deux contraintes : c'est la justification d'une batterie automatique, par exemple quatre gradins de $2{,}07\\ \\mathrm{kvar}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réactif net en fonction de la capacité fixe : pointe à 230 V et nuit à 253 V",
          xTitre: "C",
          xUnite: "µF",
          yTitre: "Q net",
          yUnite: "kvar",
          xMin: 0,
          xMax: 600,
          yMin: -12,
          yMax: 14,
          series: [
            { id: "j", nom: "pointe, 12 kW à 0,70, 230 V", couleur: "serie-1", epaisseur: 2.4, fonction: (c) => (EX.p * tanDe(EX.cos1) - c * 1e-6 * U2W) / 1000 },
            { id: "n", nom: "nuit, 3 kW à 0,50, 253 V", couleur: "serie-5", epaisseur: 2.4, fonction: (c) => (qNuit - c * 1e-6 * 253 * 253 * W50) / 1000 },
            { id: "o", nom: "objectif de pointe, P tan φ2 à 0,95", couleur: "serie-6", epaisseur: 1.6, fonction: () => (EX.p * tanDe(0.95)) / 1000 },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 0, "Q = 0", true);
            ligneV(c, repere, couleurs, cMax * 1e6, "Cmax = 258 µF");
            marquerPoint(c, repere, couleurs, cMax * 1e6, qPointe / 1000, "pointe : cos φ 0,834", false);
          },
        });
      },
    })
  );

  /* Diagnostic industriel. */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Une batterie qui chauffe et des fusibles qui fondent",
      niveau: "diagnostic",
      enonce:
        "<p>Dans une usine, une batterie globale automatique de $60\\ \\mathrm{kvar}$ a été installée au tableau général il y a six mois. Depuis, deux variateurs de grande puissance ont été ajoutés. On constate que les condensateurs sont chauds, que des fusibles de gradins fondent, que la tension du jeu de barres est déformée, alors que le $\\cos\\varphi$ affiché par le régulateur est correct, $0{,}96$. La puissance de court-circuit au jeu de barres est d'environ $2{,}2\\ \\mathrm{MVA}$. Quelles conclusions sont justifiées ?</p>",
      options: [
        { texte: "Avec les $60\\ \\mathrm{kvar}$ en service, $n_r = \\sqrt{2200/60} \\approx 6{,}1$ : la résonance est entre les rangs $5$ et $7$ produits par les variateurs.", juste: true },
        { texte: "Les condensateurs absorbent des courants harmoniques amplifiés : leur courant efficace dépasse nettement $C\\omega U$, d'où l'échauffement et la fusion des fusibles.", juste: true },
        { texte: "Le $\\cos\\varphi$ étant correct, la batterie est saine : il suffit de remplacer les fusibles par des calibres supérieurs." },
        { texte: "Il faut mesurer le spectre du courant de la batterie et de la tension, puis envisager des selfs anti-harmoniques ou un filtre, avec le constructeur.", juste: true },
        { texte: "Augmenter la puissance de la batterie éloignerait la résonance des rangs harmoniques." },
      ],
      etapes: [
        { texte: "$n_r = \\sqrt{S_{cc}/Q_C} = \\sqrt{2200/60} = 6{,}06$ : entre les rangs $5$ et $7$, les plus forts d'un pont à six diodes." },
        { texte: "Le régulateur ne voit que le fondamental : un bon $\\cos\\varphi$ ne dit rien des harmoniques. Les condensateurs, d'impédance faible aux rangs élevés, absorbent les courants amplifiés par la résonance." },
        { texte: "Plus de kilovars ferait descendre $n_r$, vers $5$ : c'est l'inverse de ce qu'il faut. Le remède est une self anti-harmonique par gradin ou un filtre accordé.", note: "Calibrer les fusibles plus haut supprimerait la protection sans traiter la cause." },
      ],
      visuelCorrection(conteneur, moteur) {
        const nr = Math.sqrt(2200 / 60);
        traceCorrection(moteur, conteneur, {
          titre: "Amplification au jeu de barres avec 60 kvar et 2,2 MVA",
          xTitre: "rang h",
          xMin: 1,
          xMax: 15,
          yTitre: "facteur",
          yMin: 0,
          yMax: 11,
          series: [
            {
              id: "a",
              nom: "facteur d'amplification, amortissement arbitraire",
              couleur: "serie-2",
              epaisseur: 2.6,
              fonction: (h) => {
                const x = h / nr;
                return 1 / Math.sqrt((1 - x * x) ** 2 + (x / 10) ** 2);
              },
            },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 5, "rang 5");
            ligneV(c, repere, couleurs, 7, "rang 7");
            ligneV(c, repere, couleurs, nr, "", 3);
          },
        });
      },
    })
  );

  /* Conceptuel. */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Pourquoi compenser près de la charge",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi un condensateur placé aux bornes d'un moteur réduit les pertes dans le câble qui alimente ce moteur, alors qu'il ne change ni la puissance active, ni le courant du moteur. Pourquoi une batterie placée au tableau général ne produirait-elle pas le même effet sur ce câble ?</p>",
      motsCles: [
        ["reactif", "reactive", "echange", "energie magnetique"],
        ["local", "sur place", "pres", "proximite", "bornes"],
        ["amont", "cable", "ligne", "conducteur"],
        ["courant", "intensite", "pertes", "joule"],
      ],
      minimum: 3,
      exemple: "Trois phrases : ce que fait le condensateur au réactif, où circule le courant réactif, ce qui en découle pour le câble.",
      etapes: [
        { texte: "Le réactif du moteur est un échange d'énergie à valeur moyenne nulle ; le condensateur, en quadrature avance, fait le même échange en sens opposé." },
        { texte: "Placé aux bornes du moteur, il fournit ce réactif sur place : le courant réactif circule entre le moteur et le condensateur, et le câble amont ne transporte plus que le courant actif et le réactif résiduel, d'où moins de pertes $RI^2$." },
        { texte: "Placée au tableau général, la batterie fait cet échange à travers le câble du moteur, qui transporte toujours tout le courant réactif : seul l'amont du tableau est soulagé.", note: "L'emplacement définit la frontière : seuls les conducteurs en amont du point de raccordement profitent de la compensation." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Courant dans le câble du moteur : avant et après compensation à ses bornes",
          unite: "A",
          vecteurs: [
            { id: "av", nom: "avant : IL = 32 A", amplitude: 32, phase: -36.87, couleur: "serie-1", pointille: true },
            { id: "ap", nom: "après : I = 26,95 A", amplitude: 26.95, phase: -18.19, couleur: "serie-3" },
            { id: "ic", nom: "IC = 10,79 A", amplitude: 10.79, phase: 90, couleur: "serie-4" },
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
        enonce: "<p>Que modifie un condensateur placé en parallèle aux bornes d'un moteur ?</p>",
        options: ["La puissance active absorbée par le moteur", "Le courant absorbé par le moteur", "Le courant fourni par le réseau en amont", "La tension nominale du moteur"],
        bonnes: [2],
        explication: "Le moteur garde sa tension, son courant et sa puissance active ; seul le courant en amont du point de raccordement diminue, car le réactif est fourni sur place.",
        resume: "Effet du condensateur",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Une batterie deux fois trop grosse donne toujours un courant de ligne plus grand qu'en l'absence de compensation.</p>",
        reponse: false,
        explication: "Pour le compresseur, une capacité double de $149{,}3\\ \\mu\\mathrm{F}$ donne $25{,}71\\ \\mathrm{A}$, moins que $32\\ \\mathrm{A}$ : le courant ne dépasse sa valeur initiale que si $Q_C &gt; 2Q_1$. L'installation est en revanche capacitive.",
        resume: "Surcompensation et courant",
      },
      {
        type: "calcul",
        enonce: "<p>Une charge absorbe $10\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}60$. Quelle puissance réactive faut-il installer pour atteindre $0{,}90$, en vars ?</p>",
        valeur: reactifAInstaller(10000, 0.6, 0.9),
        unite: "var",
        tolerance: 0.01,
        chiffres: 0,
        explication: "$Q_C = 10\\,000 \\times (1{,}3333 - 0{,}4843) = 8490\\ \\mathrm{var}$.",
        resume: "Formule des tangentes",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle capacité, en microfarads, fournit $2\\ \\mathrm{kvar}$ sous $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$ ?</p>",
        valeur: (2000 / U2W) * 1e6,
        unite: "µF",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$C = 2000/(230^2 \\times 314{,}16) = 120{,}3\\ \\mu\\mathrm{F}$.",
        resume: "Capacité",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi une batterie fixe dimensionnée pour la pleine charge peut-elle poser problème la nuit ?</p>",
        motsCles: [["faible charge", "creux", "nuit", "moins de", "charge reduite"], ["capacitif", "surcompens", "trop de reactif"], ["tension", "auto-excitation", "renvo", "monte"]],
        minimum: 2,
        explication:
          "Aux faibles charges, le réactif à compenser diminue mais la batterie fixe fournit toujours le même : l'installation devient capacitive, la tension monte et du réactif est renvoyé au réseau. D'où les batteries automatiques.",
        resume: "Batterie fixe au creux",
      },
      {
        type: "vraiFaux",
        enonce: "<p>La puissance réactive fournie par un condensateur est proportionnelle au carré de la tension appliquée.</p>",
        reponse: true,
        explication: "$Q_C = C\\omega U^2$ : $10\\ \\%$ de tension en plus donnent $21\\ \\%$ de réactif en plus.",
        resume: "Influence de la tension",
      },
      {
        type: "calcul",
        enonce: "<p>Une charge absorbe $40\\ \\mathrm{A}$ à $\\cos\\varphi = 0{,}70$. Compensée à $\\cos\\varphi = 1$, sous la même tension et à la même puissance active, quel courant absorbe-t-elle du réseau, en ampères ?</p>",
        valeur: 28,
        unite: "A",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$I_2 = I_1\\cos\\varphi_1/\\cos\\varphi_2 = 40 \\times 0{,}70/1 = 28\\ \\mathrm{A}$, la seule composante active.",
        resume: "Courant après compensation",
      },
      {
        type: "qcm",
        enonce: "<p>Un condensateur fournit $10\\ \\mathrm{kvar}$ à $50\\ \\mathrm{Hz}$. Combien fournit-il sous la même tension à $60\\ \\mathrm{Hz}$ ?</p>",
        options: ["$8{,}3\\ \\mathrm{kvar}$", "$10\\ \\mathrm{kvar}$", "$12\\ \\mathrm{kvar}$", "$14{,}4\\ \\mathrm{kvar}$"],
        bonnes: [2],
        explication: "$Q_C = C\\omega U^2$ est proportionnel à la fréquence : $10 \\times 60/50 = 12\\ \\mathrm{kvar}$.",
        resume: "Influence de la fréquence",
      },
      {
        type: "schema",
        enonce: "<p>Sur ce triangle avant et après compensation, quel segment représente la puissance réactive fournie par la batterie ?</p>",
        consigne: "Cliquez sur l'étiquette du segment correspondant.",
        viewBox: "0 0 600 340",
        description: "Triangle des puissances : a horizontal, b vertical en tirets fins, c flèche verticale vers le bas à côté du triangle, d en tirets épais de l'origine vers le bas de c",
        dessin: dessinAvantApres("fl-l-a"),
        zones: [
          { x: 196, y: 276, largeur: 44, hauteur: 32, etiquette: "a" },
          { x: 322, y: 130, largeur: 40, hauteur: 32, etiquette: "b" },
          { x: 392, y: 112, largeur: 40, hauteur: 32, etiquette: "c", juste: true },
          { x: 194, y: 202, largeur: 44, hauteur: 32, etiquette: "d" },
        ],
        explication: "a est $P$, b le réactif $Q_1$ de la charge, c le réactif $Q_C$ fourni par la batterie, retranché vers le bas, et d la puissance apparente $S_2$ après compensation.",
        resume: "Lecture du triangle avant et après",
      },
      {
        type: "calcul",
        enonce: "<p>Une batterie de $50\\ \\mathrm{kvar}$ est raccordée à un jeu de barres dont la puissance de court-circuit vaut $2\\ \\mathrm{MVA}$. Quel est le rang de résonance parallèle ?</p>",
        valeur: Math.sqrt(2000 / 50),
        tolerance: 0.01,
        chiffres: 2,
        explication: "$n_r = \\sqrt{S_{cc}/Q_C} = \\sqrt{2000/50} = 6{,}32$, entre les rangs $5$ et $7$ : situation à risque si des variateurs sont présents.",
        resume: "Rang de résonance",
      },
    ],
    { titre: "Dix questions sur la correction du facteur de puissance" }
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
      { categorie: "Principe", question: "Pourquoi un condensateur en parallèle réduit-il le courant fourni par le réseau ?", reponse: "Il fournit sur place le réactif de la charge : le courant réactif circule entre la charge et le condensateur, et le réseau ne fournit plus que la composante active et le réactif résiduel." },
      { categorie: "Formule", question: "Quelle puissance réactive installer pour passer de $\\cos\\varphi_1$ à $\\cos\\varphi_2$ ?", reponse: "$Q_C = P(\\tan\\varphi_1 - \\tan\\varphi_2)$, à puissance active $P$ inchangée." },
      { categorie: "Formule", question: "Comment passe-t-on du réactif à la capacité ?", reponse: "$C = Q_C/(U^2\\omega)$ avec la tension réellement appliquée à l'élément ; environ $60\\ \\mu\\mathrm{F}$ par kilovar sous $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$." },
      { categorie: "Gains", question: "Comment varient le courant et les pertes en amont ?", reponse: "$I_2/I_1 = \\cos\\varphi_1/\\cos\\varphi_2$ et pertes dans le rapport du carré ; de $0{,}70$ à $0{,}95$, $-26\\ \\%$ de courant et $-46\\ \\%$ de pertes." },
      { categorie: "Tension", question: "Quel est l'effet de la compensation sur la chute de tension ?", reponse: "$\\Delta U \\approx (RP + XQ)/U$ : réduire $Q$ réduit la chute à proportion de la réactance amont, faible sur un câble, forte derrière un transformateur." },
      { categorie: "Surcompensation", question: "Où est le minimum du courant de ligne, et que se passe-t-il au-delà ?", reponse: "À $Q_C = Q_1$, $\\cos\\varphi = 1$, $I = P/U$. Au-delà, l'installation est capacitive : tension qui monte, réactif renvoyé, risque d'auto-excitation des moteurs." },
      { categorie: "Conception", question: "Batterie fixe ou automatique ?", reponse: "Fixe pour une charge stable ou un réactif de base ; automatique à gradins, pilotée par un régulateur varmétrique, dès que la charge varie." },
      { categorie: "Emplacement", question: "Qu'est-ce qui est soulagé par une batterie ?", reponse: "Uniquement les conducteurs et matériels situés en amont de son point de raccordement." },
      { categorie: "Harmoniques", question: "Comment estime-t-on le risque de résonance d'une batterie ?", reponse: "$n_r = \\sqrt{S_{cc}/Q_C}$ ; s'il est proche de $5$, $7$, $11$ ou $13$, il faut des selfs anti-harmoniques ou un filtre." },
      {
        categorie: "Industriel",
        question: "Quelle compensation a été retenue pour le site ?",
        reponse: "Individuelle sur le compresseur : $2{,}48\\ \\mathrm{kvar}$ par phase, $49{,}8\\ \\mu\\mathrm{F}$ par branche en triangle ; $\\cos\\varphi_1$ du tableau de $0{,}962$ à $0{,}986$, résonance au rang $18{,}3$.",
        rappel: "Batterie globale de 18,5 kvar écartée : rang 11,6, entre les rangs 11 et 13.",
      },
    ],
    { titre: "Dix cartes sur la correction du facteur de puissance" }
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
        enonce: "<p>Une installation absorbe $20\\ \\mathrm{kW}$ avec $\\tan\\varphi = 1$. Quel réactif installer, en kilovars, pour ramener $\\tan\\varphi$ à $0{,}4$ ?</p>",
        valeur: 12,
        unite: "kvar",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$Q_C = P(\\tan\\varphi_1 - \\tan\\varphi_2) = 20 \\times (1 - 0{,}4) = 12\\ \\mathrm{kvar}$.",
        resume: "Réactif à installer (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Après compensation, un wattmètre placé aux bornes de la charge affiche une puissance active plus faible.</p>",
        reponse: false,
        explication: "La charge garde sa tension et son courant : sa puissance active ne change pas. Seules les pertes en amont diminuent.",
        resume: "Puissance active inchangée (cette séance)",
      },
      {
        type: "qcm",
        enonce: "<p>Pour réduire les pertes dans le câble d'un gros moteur, où placer la batterie ?</p>",
        options: ["Au tableau général", "Aux bornes du moteur, commutée avec lui", "Au poste de livraison", "Peu importe, l'effet est le même"],
        bonnes: [1],
        explication: "Seuls les conducteurs en amont du point de raccordement sont soulagés : il faut une compensation individuelle, aux bornes du moteur.",
        resume: "Emplacement (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Une charge absorbe $6\\ \\mathrm{kW}$ et $8\\ \\mathrm{kvar}$. Quelle est sa puissance apparente, en kilovoltampères ?</p>",
        valeur: 10,
        unite: "kVA",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$S = \\sqrt{6^2 + 8^2} = 10\\ \\mathrm{kVA}$, $\\cos\\varphi = 0{,}6$. Révisé du cours Puissances en courant alternatif.",
        resume: "Puissance apparente (cours précédent)",
      },
      {
        type: "qcm",
        enonce: "<p>En convention récepteur, quel est le signe de la puissance réactive d'un condensateur ?</p>",
        options: ["Positif", "Négatif", "Nul", "Il dépend de la fréquence"],
        bonnes: [1],
        explication: "$\\underline{S}_C = -jC\\omega U^2$ : $Q_C &lt; 0$, le condensateur fournit du réactif. Révisé du cours Puissances en courant alternatif.",
        resume: "Signe de Q (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la fréquence propre, en hertz, d'un circuit formé d'une inductance de $1\\ \\mathrm{mH}$ et d'un condensateur de $2{,}2\\ \\mathrm{mF}$ ?</p>",
        valeur: 1 / (2 * Math.PI * Math.sqrt(1e-3 * 2.2e-3)),
        unite: "Hz",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$f_0 = 1/(2\\pi\\sqrt{LC}) = 107{,}3\\ \\mathrm{Hz}$, la self de lissage et le bus continu du variateur. Révisé du cours Régime transitoire RLC : la même pulsation propre gouverne la résonance d'une batterie avec le réseau.",
        resume: "Pulsation propre (Régime transitoire RLC)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle énergie, en joules, reste stockée dans la batterie de $499{,}3\\ \\mu\\mathrm{F}$ de l'exemple si elle est déconnectée à la crête d'une tension de $230\\ \\mathrm{V}$ efficaces ?</p>",
        valeur: 0.5 * 499.3e-6 * (230 * Math.SQRT2) ** 2,
        unite: "J",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$W = \\tfrac{1}{2}CU_m^2 = 0{,}5 \\times 499{,}3 \\times 10^{-6} \\times 325{,}3^2 = 26{,}4\\ \\mathrm{J}$ : d'où les résistances de décharge. Révisé du cours Condensateurs et champ électrique.",
        resume: "Énergie stockée (Condensateurs et champ électrique)",
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
    titre: "Où en suis-je sur la correction du facteur de puissance ?",
  });
  if (auto) ressources.push(auto);
}
