/* ==========================================================================
   cours/systemes-triphases-equilibres/cours.js
   Systèmes triphasés équilibrés.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const RAC3 = Math.sqrt(3);
const W = TAU * 50;

/* Exemple de la section H : câble et moteur modélisé en triangle. */
const EX = { u: 400, zl: { re: 0.5, im: 0.3 }, zd: { re: 24, im: 18 } };

/* --------------------------------------------------------------------------
   Calcul complexe minimal
   -------------------------------------------------------------------------- */

const cx = {
  polaire: (module, degres) => ({ re: module * Math.cos(degres * DEG), im: module * Math.sin(degres * DEG) }),
  plus: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  moins: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
  fois: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  div: (a, b) => {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  },
  echelle: (a, k) => ({ re: a.re * k, im: a.im * k }),
  module: (a) => Math.hypot(a.re, a.im),
  argument: (a) => Math.atan2(a.im, a.re) / DEG,
};

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

/** Pointe de flèche de taille fixe, indépendante de l'épaisseur du trait. */
function marqueur(id) {
  return (
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto-start-reverse">' +
    '<path d="M0 0 11 5 0 10Z" fill="currentColor"/></marker>'
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

/** Point d'un diagramme de Fresnel : origine, nombre complexe, échelle en pixels par unité. */
function pointPhaseur(origine, z, k) {
  return { x: origine.x + k * z.re, y: origine.y - k * z.im };
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
  construireAlternateur(racine, api);
  construirePuissance(racine, api);
  construireComposee(racine, api);
  construireNeutre(racine, api);
  construireCouplage(racine, api);
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
    ["#e-source-figure svg", 1.6],
    ["#e-etoile-tensions-figure svg", 1.8],
    ["#e-etoile-figure svg", 1.6],
    ["#e-triangle-figure svg", 1.6],
    ["#f-schema-principal svg", 2.2],
    ["#f-chronogramme svg", 2],
    ["#h-circuit-figure svg", 1.5],
    ["#i-plaque-figure svg", 1.6],
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
      id: "c-difference",
      titre: "Différence de deux phaseurs",
      niveau: "prérequis",
      enonce:
        "<p>Deux tensions de $230\\ \\mathrm{V}$ efficaces ont pour phaseurs $\\underline{V}_1 = 230\\ \\mathrm{V}$ à $0^\\circ$ et " +
        "$\\underline{V}_2 = 230\\ \\mathrm{V}$ à $-120^\\circ$. Quelle est la valeur efficace de leur différence $\\underline{V}_1 - \\underline{V}_2$ ?</p>",
      valeur: 230 * RAC3,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Module de $\\underline{V}_1 - \\underline{V}_2$",
      etapes: [
        { texte: "$\\underline{V}_2 = 230(\\cos(-120^\\circ) + j\\sin(-120^\\circ)) = -115 - j199{,}19\\ \\mathrm{V}$." },
        { texte: "$\\underline{V}_1 - \\underline{V}_2 = 230 + 115 + j199{,}19 = 345 + j199{,}19\\ \\mathrm{V}$." },
        {
          texte: "Module : $\\sqrt{345^2 + 199{,}19^2} = 398{,}37\\ \\mathrm{V}$ ; argument $\\arctan(199{,}19/345) = 30^\\circ$.",
          note: "C'est la tension composée du réseau : $\\sqrt{3} \\times 230 = 398{,}4\\ \\mathrm{V}$, en avance de $30^\\circ$ sur $\\underline{V}_1$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "V1, V2, l'opposé de V2 et leur somme",
          unite: "V",
          somme: true,
          nomSomme: "V1 - V2 = 398,4 V à 30 degrés",
          vecteurs: [
            { id: "v1", nom: "V1", amplitude: 230, phase: 0, couleur: "serie-1" },
            { id: "mv2", nom: "-V2, opposé de V2", amplitude: 230, phase: 60, couleur: "serie-4", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-ohm",
      titre: "Loi d'Ohm complexe",
      niveau: "prérequis",
      enonce: "<p>Une impédance $\\underline{Z} = 20 + j15\\ \\Omega$ est alimentée sous $230\\ \\mathrm{V}$. Quel courant efficace la traverse ?</p>",
      valeur: 230 / 25,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant $I$",
      etapes: [
        { texte: "$|\\underline{Z}| = \\sqrt{20^2 + 15^2} = 25\\ \\Omega$ ; $\\varphi = \\arctan(15/20) = 36{,}87^\\circ$, inductif." },
        { texte: "$I = 230/25 = 9{,}2\\ \\mathrm{A}$, en retard de $36{,}87^\\circ$ sur la tension.", note: "$\\cos\\varphi = 20/25 = 0{,}8$ : c'est le facteur de puissance de cette impédance." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Tension de référence et courant en retard",
          unite: "",
          vecteurs: [
            { id: "u", nom: "V / 25, en volts divisés par 25", amplitude: 9.2, phase: 0, couleur: "serie-1" },
            { id: "i", nom: "I, en ampères", amplitude: 9.2, phase: -36.87, couleur: "serie-5", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-noeud",
      titre: "Loi des nœuds en phaseurs",
      niveau: "prérequis",
      enonce:
        "<p>Trois courants arrivent dans un nœud. $\\underline{I}_1 = 10\\ \\mathrm{A}$ à $0^\\circ$ et $\\underline{I}_2 = 10\\ \\mathrm{A}$ à $-120^\\circ$. " +
        "Aucun courant ne quitte le nœud par ailleurs. Quelle est la valeur efficace du troisième courant entrant $\\underline{I}_3$ ?</p>",
      valeur: 10,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant $I_3$",
      etapes: [
        { texte: "Loi des nœuds : $\\underline{I}_1 + \\underline{I}_2 + \\underline{I}_3 = 0$, donc $\\underline{I}_3 = -(\\underline{I}_1 + \\underline{I}_2)$." },
        { texte: "$\\underline{I}_1 + \\underline{I}_2 = 10 + (-5 - j8{,}66) = 5 - j8{,}66$, soit $10\\ \\mathrm{A}$ à $-60^\\circ$." },
        {
          texte: "$\\underline{I}_3 = -5 + j8{,}66$ : $10\\ \\mathrm{A}$ à $+120^\\circ$.",
          note: "Trois courants égaux décalés de $120^\\circ$ ont une somme nulle : c'est le neutre sans courant de cette séance.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Trois courants décalés de 120 degrés, somme nulle",
          unite: "A",
          somme: true,
          nomSomme: "somme des trois courants, nulle",
          vecteurs: [
            { id: "i1", nom: "I1", amplitude: 10, phase: 0, couleur: "serie-1" },
            { id: "i2", nom: "I2", amplitude: 10, phase: -120, couleur: "serie-3" },
            { id: "i3", nom: "I3", amplitude: 10, phase: 120, couleur: "serie-4", pointille: true },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Simulation : l'alternateur et ses trois f.é.m.
   -------------------------------------------------------------------------- */

function construireAlternateur(racine, api) {
  const conteneur = racine.querySelector("#d-alternateur");
  if (!conteneur) return;

  const C = { x: 175, y: 178 };
  const R_ROTOR = 92;
  const BARRES = { x: [430, 510, 590, 690], y0: 178, h: 118 };
  const etat = { theta: 0, v: 230, sens: 1 };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 360",
    role: "img",
    "aria-label": "Alternateur élémentaire vu en coupe, rotor à deux pôles orientable par une poignée, trois repères de f.é.m. maximale, et barres des trois f.é.m. instantanées et de leur somme",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-d-a");

  let reperes = "";
  let noms = "";
  for (let k = 0; k < 3; k += 1) {
    const a = k * 120 * DEG;
    const x1 = C.x + 112 * Math.cos(a);
    const y1 = C.y - 112 * Math.sin(a);
    const x2 = C.x + 134 * Math.cos(a);
    const y2 = C.y - 134 * Math.sin(a);
    reperes += "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + x2.toFixed(1) + " " + y2.toFixed(1);
    noms += texte(C.x + 150 * Math.cos(a), C.y - 150 * Math.sin(a) + 5, String(k + 1), ' text-anchor="middle" font-weight="600"');
  }
  let barresFond = "";
  let barresNoms = "";
  const libelles = ["e1", "e2", "e3", "somme"];
  BARRES.x.forEach((x, i) => {
    barresFond += "M" + (x - 26) + " " + BARRES.y0 + "H" + (x + 26);
    barresNoms += texte(x, BARRES.y0 + BARRES.h + 40, libelles[i], ' text-anchor="middle"');
  });

  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" fill="none" stroke-width="1.6" opacity="0.75">' +
    '<circle cx="' + C.x + '" cy="' + C.y + '" r="112"/><circle cx="' + C.x + '" cy="' + C.y + '" r="134"/>' +
    '<path d="' + reperes + '" stroke-width="2.4"/></g>' +
    '<g stroke="currentColor" fill="none" stroke-width="1.2" opacity="0.6">' +
    '<path d="' + barresFond + '"/>' +
    '<path d="M' + 386 + " " + (BARRES.y0 - BARRES.h - 6) + "V" + (BARRES.y0 + BARRES.h + 6) + '" stroke-dasharray="2 4"/>' +
    '<path d="M645 ' + (BARRES.y0 - BARRES.h - 6) + "V" + (BARRES.y0 + BARRES.h + 6) + '" stroke-dasharray="2 4"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
    noms +
    barresNoms +
    texte(20, 22, "stator et rotor, vue en coupe") +
    texte(404, 22, "f.é.m. instantanées, valeur signée") +
    "</g>";

  const rotor = svgEl("path", { stroke: "currentColor", "stroke-width": 7, "stroke-linecap": "round", fill: "none" });
  const sens = svgEl("path", { stroke: "currentColor", "stroke-width": 1.6, fill: "none", "marker-end": "url(#fl-d-a)" });
  const barres = [0, 1, 2, 3].map(() =>
    svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "currentColor", "fill-opacity": 0.22 })
  );
  const dynamique = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  svg.append(defs, fond, sens, rotor, ...barres, dynamique);
  conteneur.appendChild(svg);

  const fem = (k, theta) => etat.v * Math.SQRT2 * Math.cos((theta - 120 * k) * DEG);
  const tempsDe = (theta) => {
    const th = ((theta % 360) + 360) % 360;
    return ((etat.sens > 0 ? th : (360 - th) % 360) / 360) * 20;
  };

  const trace = api.sim.traceur("#d-alternateur-trace", {
    titre: "Les trois f.é.m. en fonction du temps",
    genre: "Simulation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "e",
    yUnite: "V",
    xMin: 0,
    xMax: 20,
    yMin: -360,
    yMax: 360,
    ratio: 0.36,
    echantillons: 400,
    series: [
      { id: "e1", nom: "e1(t)", couleur: "serie-1", epaisseur: 2.6 },
      { id: "e2", nom: "e2(t)", couleur: "serie-2", epaisseur: 2.2 },
      { id: "e3", nom: "e3(t)", couleur: "serie-4", epaisseur: 2.2 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, tempsDe(etat.theta), "instant");
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#d-alternateur-valeurs", [
    { id: "theta", libelle: "Position du rotor θ", unite: "°", decimales: 1 },
    { id: "t", libelle: "Instant correspondant", unite: "ms", decimales: 2 },
    { id: "e1", libelle: "e1", unite: "V", decimales: 1 },
    { id: "e2", libelle: "e2", unite: "V", decimales: 1 },
    { id: "e3", libelle: "e3", unite: "V", decimales: 1 },
    { id: "somme", libelle: "e1 + e2 + e3", unite: "V", decimales: 1 },
    { id: "ordre", libelle: "Ordre des maxima", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const th = etat.theta * DEG;
    const nord = { x: C.x + R_ROTOR * Math.cos(th), y: C.y - R_ROTOR * Math.sin(th) };
    const sud = { x: C.x - R_ROTOR * Math.cos(th), y: C.y + R_ROTOR * Math.sin(th) };
    rotor.setAttribute("d", "M" + sud.x.toFixed(1) + " " + sud.y.toFixed(1) + "L" + nord.x.toFixed(1) + " " + nord.y.toFixed(1));

    /* Flèche courbe du sens de rotation, sur l'arc de 160 à 200 degrés, entre les repères 2 et 3. */
    const r = 150;
    const a1 = (etat.sens > 0 ? 160 : 200) * DEG;
    const a2 = (etat.sens > 0 ? 200 : 160) * DEG;
    sens.setAttribute(
      "d",
      "M" + (C.x + r * Math.cos(a1)).toFixed(1) + " " + (C.y - r * Math.sin(a1)).toFixed(1) +
        "A" + r + " " + r + " 0 0 " + (etat.sens > 0 ? 0 : 1) + " " +
        (C.x + r * Math.cos(a2)).toFixed(1) + " " + (C.y - r * Math.sin(a2)).toFixed(1)
    );

    const crete = etat.v * Math.SQRT2;
    const e = [0, 1, 2].map((k) => fem(k, etat.theta));
    const s = e[0] + e[1] + e[2];
    const hauteurs = e.concat([Math.abs(s) < 1e-9 ? 0 : s]);
    let textes = "";
    hauteurs.forEach((val, i) => {
      const x = BARRES.x[i];
      const h = (val / crete) * BARRES.h;
      barres[i].setAttribute(
        "d",
        Math.abs(h) < 0.6
          ? "M" + (x - 18) + " " + BARRES.y0 + "H" + (x + 18)
          : "M" + (x - 18) + " " + BARRES.y0 + "H" + (x + 18) + "V" + (BARRES.y0 - h).toFixed(1) + "H" + (x - 18) + "Z"
      );
      textes += texte(x, BARRES.y0 + BARRES.h + 22, nombre(api, val, 0) + " V", ' text-anchor="middle"');
    });
    textes +=
      texte(nord.x + 10 * Math.cos(th), nord.y - 10 * Math.sin(th) + 4, "N", ' font-weight="700" text-anchor="middle"') +
      texte(sud.x - 12 * Math.cos(th), sud.y + 12 * Math.sin(th) + 4, "S", ' font-weight="700" text-anchor="middle"') +
      texte(20, 346, etat.sens > 0 ? "sens direct, trigonométrique" : "sens inverse, horaire") +
      texte(404, 42, "crête : " + nombre(api, crete, 1) + " V") +
      texte(394, BARRES.y0 - BARRES.h + 8, "+", ' font-size="13"') +
      texte(394, BARRES.y0 + BARRES.h - 2, "-", ' font-size="13"');
    dynamique.innerHTML = textes;

    if (valeurs) {
      valeurs.maj({
        theta: etat.theta,
        t: tempsDe(etat.theta),
        e1: e[0],
        e2: e[1],
        e3: e[2],
        somme: Math.abs(s) < 1e-6 ? 0 : s,
        ordre: etat.sens > 0 ? "1, 2, 3 : ordre direct" : "1, 3, 2 : ordre inverse",
      });
    }
    if (trace) trace.demanderRendu();
  }

  function majCourbes() {
    if (!trace) return;
    const crete = etat.v * Math.SQRT2;
    for (let k = 0; k < 3; k += 1) {
      trace.definirFonction("e" + (k + 1), (tms) => crete * Math.cos(etat.sens * TAU * (tms / 20) - k * 120 * DEG));
    }
    const borne = Math.ceil((crete * 1.1) / 50) * 50;
    trace.definirPlage({ yMin: -borne, yMax: borne });
  }

  let synchronisation = false;
  let poignee = null;
  let lecteur = null;

  function appliquer(theta, source) {
    if (synchronisation) return;
    synchronisation = true;
    etat.theta = ((Number(theta) % 360) + 360) % 360;
    dessiner();
    if (source !== "poignee" && poignee) poignee.set(etat.theta, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(etat.sens > 0 ? etat.theta : (360 - etat.theta) % 360);
    synchronisation = false;
  }

  poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: C,
    rayon: R_ROTOR,
    valeur: 0,
    pas: 5,
    libelle: "Position angulaire du rotor",
    format: (mesure) => "rotor à " + nombre(api, mesure.valeur, 0) + " degrés",
    diffuserAuDepart: false,
    rappel(mesure) {
      appliquer(mesure.angle, "poignee");
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-alternateur-curseurs",
    [
      { id: "v", libelle: "Valeur efficace des f.é.m.", min: 50, max: 400, pas: 1, valeur: 230, unite: "V" },
      {
        id: "sens",
        libelle: "Sens de rotation du rotor",
        min: -1,
        max: 1,
        pas: 2,
        valeur: 1,
        format: (v) => (v > 0 ? "direct, trigonométrique" : "inverse, horaire"),
      },
    ],
    (lues) => {
      etat.v = lues.v;
      etat.sens = lues.sens > 0 ? 1 : -1;
      majCourbes();
      appliquer(etat.theta, null);
    }
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#d-alternateur-lecteur", {
    de: 0,
    a: 360,
    duree: 8,
    boucle: true,
    auto: false,
    libelle: "Faire tourner le rotor",
    rappel(valeur) {
      appliquer(etat.sens > 0 ? valeur : 360 - valeur, "lecteur");
    },
  });
  if (lecteur) ressources.push(lecteur);

  majCourbes();
  appliquer(0, null);
}

/* --------------------------------------------------------------------------
   D. Animation : puissance instantanée totale
   -------------------------------------------------------------------------- */

function construirePuissance(racine, api) {
  const V = 230;
  const I = 10;
  const etat = { phi: 36.87, k3: 1, t: 0 };

  const pk = (k, tms) => {
    const i = k === 2 ? I * etat.k3 : I;
    const a = W * (tms / 1000) - k * 120 * DEG;
    return (2 * V * i * Math.cos(a) * Math.cos(a - etat.phi * DEG)) / 1000;
  };
  const p = (tms) => pk(0, tms) + pk(1, tms) + pk(2, tms);

  const trace = api.sim.traceur("#d-puissance-trace", {
    titre: "Puissances instantanées des trois phases et puissance totale",
    genre: "Animation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "p",
    yUnite: "kW",
    xMin: 0,
    xMax: 40,
    yMin: -3,
    yMax: 8,
    ratio: 0.4,
    echantillons: 600,
    series: [
      { id: "p1", nom: "p1(t), phase 1", couleur: "serie-1", epaisseur: 1.8 },
      { id: "p2", nom: "p2(t), phase 2", couleur: "serie-2", epaisseur: 1.8 },
      { id: "p3", nom: "p3(t), phase 3", couleur: "serie-4", epaisseur: 1.8 },
      { id: "p", nom: "p(t) = p1 + p2 + p3", couleur: "serie-5", epaisseur: 3.2 },
    ],
    surDessin({ c, repere, couleurs }) {
      const pMoy = ((V * I * Math.cos(etat.phi * DEG)) * (2 + etat.k3)) / 1000;
      ligneH(c, repere, couleurs, pMoy, "P = " + nombre(api, pMoy, 2) + " kW", false);
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
      ligneV(c, repere, couleurs, etat.t, "instant");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#d-puissance-valeurs", [
    { id: "t", libelle: "Instant t", unite: "ms", decimales: 2 },
    { id: "p1", libelle: "p1", unite: "kW", decimales: 2 },
    { id: "p2", libelle: "p2", unite: "kW", decimales: 2 },
    { id: "p3", libelle: "p3", unite: "kW", decimales: 2 },
    { id: "p", libelle: "p = p1 + p2 + p3", unite: "kW", decimales: 3 },
    { id: "moy", libelle: "Puissance active P", unite: "kW", decimales: 3 },
    { id: "ond", libelle: "Ondulation crête à crête de p", unite: "kW", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    if (trace) {
      trace.definirFonction("p1", (tms) => pk(0, tms));
      trace.definirFonction("p2", (tms) => pk(1, tms));
      trace.definirFonction("p3", (tms) => pk(2, tms));
      trace.definirFonction("p", p);
      let haut = 0;
      let bas = 0;
      for (let tms = 0; tms <= 20; tms += 0.1) {
        haut = Math.max(haut, p(tms), pk(0, tms), pk(2, tms));
        bas = Math.min(bas, pk(0, tms), pk(2, tms), p(tms));
      }
      trace.definirPlage({ yMin: Math.floor(bas - 0.5), yMax: Math.ceil(haut + 0.8) });
    }
    if (valeurs) {
      let maxi = -Infinity;
      let mini = Infinity;
      for (let tms = 0; tms <= 10; tms += 0.02) {
        const v = p(tms);
        maxi = Math.max(maxi, v);
        mini = Math.min(mini, v);
      }
      valeurs.maj({
        t: etat.t,
        p1: pk(0, etat.t),
        p2: pk(1, etat.t),
        p3: pk(2, etat.t),
        p: p(etat.t),
        moy: (V * I * Math.cos(etat.phi * DEG) * (2 + etat.k3)) / 1000,
        ond: maxi - mini < 1e-9 ? 0 : maxi - mini,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#d-puissance-curseurs",
    [
      { id: "phi", libelle: "Déphasage φ de chaque charge", min: -90, max: 90, pas: 0.01, valeur: 36.87, unite: "°", chiffres: 2 },
      { id: "k3", libelle: "Charge de la phase 3", min: 0, max: 150, pas: 1, valeur: 100, unite: "%" },
    ],
    (lues) => {
      etat.phi = lues.phi;
      etat.k3 = lues.k3 / 100;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-puissance-lecteur", {
    de: 0,
    a: 40,
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
   E. Animation : construction de la tension composée
   -------------------------------------------------------------------------- */

function construireComposee(racine, api) {
  const conteneur = racine.querySelector("#e-composee");
  if (!conteneur) return;

  const O = { x: 250, y: 180 };
  const K = 120 / 230;
  const V = 230;
  const ETAPES = [
    "1. Tensions simples V1, V2, V3",
    "2. Opposé de V2 placé au bout de V1",
    "3. U12 = V1 + (-V2), issue de l'origine",
    "4. U12 reportée de l'extrémité de V2 à celle de V1",
    "5. Triangle des tensions composées",
    "Construction terminée",
  ];
  const etat = { s: 6, delta: 120 };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 340",
    role: "img",
    "aria-label": "Construction pas à pas de la tension composée U12 comme somme de V1 et de l'opposé de V2, puis du triangle des tensions composées",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-c");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.45"><path d="M90 180H560M250 30V320"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
    texte(546, 196, "Re") + texte(256, 40, "Im") + "</g>";
  const traits = {
    v1: svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "marker-end": "url(#fl-e-c)" }),
    v2: svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "marker-end": "url(#fl-e-c)" }),
    v3: svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "marker-end": "url(#fl-e-c)" }),
    mv2: svgEl("path", { stroke: "currentColor", "stroke-width": 1.6, fill: "none", "marker-end": "url(#fl-e-c)" }),
    u12: svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-dasharray": "10 6", "marker-end": "url(#fl-e-c)" }),
    u12r: svgEl("path", { stroke: "currentColor", "stroke-width": 1.6, fill: "none", "stroke-dasharray": "6 4", "marker-end": "url(#fl-e-c)" }),
    u23: svgEl("path", { stroke: "currentColor", "stroke-width": 1.6, fill: "none", "stroke-dasharray": "6 4", "marker-end": "url(#fl-e-c)" }),
    u31: svgEl("path", { stroke: "currentColor", "stroke-width": 1.6, fill: "none", "stroke-dasharray": "6 4", "marker-end": "url(#fl-e-c)" }),
    arc: svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none" }),
  };
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, ...Object.values(traits), etiquettes);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-composee-valeurs", [
    { id: "etape", libelle: "Étape", format: (v) => v },
    { id: "delta", libelle: "Décalage entre V1 et V2", unite: "°", decimales: 0 },
    { id: "u", libelle: "U12 = |V1 - V2|", unite: "V", decimales: 1 },
    { id: "angle", libelle: "Avance de U12 sur V1", unite: "°", decimales: 1 },
    { id: "rapport", libelle: "Rapport U / V", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const borne = (x) => Math.max(0, Math.min(1, x));

  function dessiner() {
    const v1 = cx.polaire(V, 0);
    const v2 = cx.polaire(V, -etat.delta);
    const v3 = cx.polaire(V, etat.delta);
    const u12 = cx.moins(v1, v2);
    const P = (z) => pointPhaseur(O, z, K);
    const t1 = P(v1);
    const t2 = P(v2);
    const t3 = P(v3);
    const tu = P(u12);
    const f = [0, 1, 2, 3, 4].map((i) => borne(etat.s - i));

    traits.v1.setAttribute("d", partiel(O.x, O.y, t1.x, t1.y, f[0]));
    traits.v2.setAttribute("d", partiel(O.x, O.y, t2.x, t2.y, f[0]));
    traits.v3.setAttribute("d", partiel(O.x, O.y, t3.x, t3.y, f[0]));
    traits.mv2.setAttribute("d", partiel(t1.x, t1.y, tu.x, tu.y, f[1]));
    traits.u12.setAttribute("d", partiel(O.x, O.y, tu.x, tu.y, f[2]));
    traits.u12r.setAttribute("d", partiel(t2.x, t2.y, t1.x, t1.y, f[3]));
    traits.u23.setAttribute("d", partiel(t3.x, t3.y, t2.x, t2.y, f[4]));
    traits.u31.setAttribute("d", partiel(t1.x, t1.y, t3.x, t3.y, f[4]));

    const angleU = cx.argument(u12);
    const rArc = 58;
    traits.arc.setAttribute(
      "d",
      f[2] >= 1 && angleU > 1
        ? "M" + (O.x + rArc) + " " + O.y + "A" + rArc + " " + rArc + " 0 0 0 " +
            (O.x + rArc * Math.cos(angleU * DEG)).toFixed(1) + " " + (O.y - rArc * Math.sin(angleU * DEG)).toFixed(1)
        : ""
    );

    let t = "";
    if (f[0] >= 1) {
      t += texte(t1.x + 8, t1.y + 18, "V1") + texte(t2.x - 24, t2.y + 16, "V2") + texte(t3.x - 24, t3.y - 6, "V3");
    }
    if (f[1] >= 1) t += texte((t1.x + tu.x) / 2 + 10, (t1.y + tu.y) / 2 + 4, "-V2");
    if (f[2] >= 1) {
      t += texte(tu.x + 8, tu.y - 6, "U12", ' font-weight="600"');
      t += texte(O.x + rArc + 8, O.y - (rArc * Math.sin((angleU / 2) * DEG)) + 2, nombre(api, angleU, 1) + "°", ' font-size="11"');
    }
    if (f[3] >= 1) t += texte((t1.x + t2.x) / 2 + 8, (t1.y + t2.y) / 2 + 16, "U12 reportée", ' font-size="11"');
    if (f[4] >= 1) {
      t += texte((t3.x + t2.x) / 2 - 40, (t3.y + t2.y) / 2 + 4, "U23", ' font-size="11"');
      t += texte((t1.x + t3.x) / 2 + 6, (t1.y + t3.y) / 2 - 8, "U31", ' font-size="11"');
    }
    const indice = etat.s >= 5 ? 5 : Math.min(4, Math.floor(etat.s));
    t += texte(570, 40, "étape en cours", ' font-size="11"');
    t += texte(570, 60, ETAPES[indice].split(", ")[0], ' font-weight="600" font-size="11.5"');
    if (ETAPES[indice].indexOf(", ") > 0) t += texte(570, 78, ETAPES[indice].split(", ").slice(1).join(", "), ' font-size="11.5"');
    t += texte(570, 290, "V = 230 V, échelle fixe", ' font-size="11"');
    etiquettes.innerHTML = t;

    if (valeurs) {
      valeurs.maj({
        etape: ETAPES[indice],
        delta: etat.delta,
        u: cx.module(u12),
        angle: angleU,
        rapport: cx.module(u12) / V,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-composee-curseurs",
    [{ id: "delta", libelle: "Décalage entre V1 et V2", min: 30, max: 180, pas: 1, valeur: 120, unite: "°" }],
    (lues) => {
      etat.delta = lues.delta;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-composee-lecteur", {
    de: 0,
    a: 6,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Construire pas à pas la tension composée",
    rappel(valeur) {
      etat.s = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(6);
  }
  etat.s = 6;
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : le courant du neutre
   -------------------------------------------------------------------------- */

function construireNeutre(racine, api) {
  const conteneur = racine.querySelector("#e-neutre");
  if (!conteneur) return;

  const V = 230;
  const O1 = { x: 175, y: 180 };
  const ZONE = { x0: 380, x1: 740, y0: 40, y1: 310 };
  const etat = { p: [7, 7, 7], cos: 0.89 };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 350",
    role: "img",
    "aria-label": "Tensions simples et courants des trois phases issus de l'origine, puis courants mis bout à bout dont la flèche de fermeture est le courant du neutre",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-n");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.45"><path d="M40 180H320M175 40V320"/>' +
    '<path d="M360 30V330" stroke-dasharray="2 4"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5">' +
    texte(20, 22, "tensions et courants des phases") + texte(380, 22, "courants bout à bout : I1 + I2 + I3") + "</g>";
  const traits = {
    v: [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 1.2, fill: "none", "marker-end": "url(#fl-e-n)" })),
    i: [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "marker-end": "url(#fl-e-n)" })),
    c: [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "marker-end": "url(#fl-e-n)" })),
    n: svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "stroke-dasharray": "10 6", "marker-end": "url(#fl-e-n)" }),
  };
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, ...traits.v, ...traits.i, ...traits.c, traits.n, etiquettes);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-neutre-valeurs", [
    { id: "i1", libelle: "I1", unite: "A", decimales: 2 },
    { id: "i2", libelle: "I2", unite: "A", decimales: 2 },
    { id: "i3", libelle: "I3", unite: "A", decimales: 2 },
    { id: "in", libelle: "Courant du neutre IN", unite: "A", decimales: 2 },
    { id: "rapport", libelle: "IN rapporté au plus fort courant de phase", format: (v) => v },
    { id: "p", libelle: "Puissance active totale", unite: "kW", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const phi = Math.acos(etat.cos) / DEG;
    const courants = [0, 1, 2].map((k) => cx.polaire((etat.p[k] * 1000) / (V * etat.cos), -120 * k - phi));
    const maxI = Math.max(1, ...courants.map(cx.module));
    const k = 110 / maxI;

    for (let n = 0; n < 3; n += 1) {
      const tv = pointPhaseur(O1, cx.polaire(1, -120 * n), 125);
      traits.v[n].setAttribute("d", segment(O1.x, O1.y, tv.x, tv.y));
      const ti = pointPhaseur(O1, courants[n], k);
      traits.i[n].setAttribute("d", segment(O1.x, O1.y, ti.x, ti.y));
    }

    /* Chaîne des courants, recentrée dans la zone de droite. */
    const points = [{ re: 0, im: 0 }];
    for (const courant of courants) points.push(cx.plus(points[points.length - 1], courant));
    const xs = points.map((z) => z.re * k);
    const ys = points.map((z) => -z.im * k);
    const largeur = Math.max(...xs) - Math.min(...xs);
    const hauteur = Math.max(...ys) - Math.min(...ys);
    const kc = Math.min(1, (ZONE.x1 - ZONE.x0 - 40) / Math.max(largeur, 1), (ZONE.y1 - ZONE.y0 - 40) / Math.max(hauteur, 1)) * k;
    const xsC = points.map((z) => z.re * kc);
    const ysC = points.map((z) => -z.im * kc);
    const decal = {
      x: (ZONE.x0 + ZONE.x1) / 2 - (Math.max(...xsC) + Math.min(...xsC)) / 2,
      y: (ZONE.y0 + ZONE.y1) / 2 - (Math.max(...ysC) + Math.min(...ysC)) / 2,
    };
    const Q = points.map((z, n) => ({ x: decal.x + xsC[n], y: decal.y + ysC[n] }));
    for (let n = 0; n < 3; n += 1) traits.c[n].setAttribute("d", etat.p[n] > 0 ? segment(Q[n].x, Q[n].y, Q[n + 1].x, Q[n + 1].y) : "");
    const iN = points[3];
    const moduleN = cx.module(iN);
    traits.n.setAttribute("d", moduleN * kc > 4 ? segment(Q[0].x, Q[0].y, Q[3].x, Q[3].y) : "");

    let t = "";
    ["V1", "V2", "V3"].forEach((nom, n) => {
      const tv = pointPhaseur(O1, cx.polaire(1, -120 * n), 140);
      t += texte(tv.x, tv.y + 4, nom, ' text-anchor="middle" font-size="11"');
    });
    const centre = {
      x: (Q[0].x + Q[1].x + Q[2].x + Q[3].x) / 4,
      y: (Q[0].y + Q[1].y + Q[2].y + Q[3].y) / 4,
    };
    const aCote = (m, depuis, distance) => {
      const dx = m.x - depuis.x;
      const dy = m.y - depuis.y;
      const l = Math.hypot(dx, dy) || 1;
      return { x: m.x + (distance * dx) / l, y: m.y + (distance * dy) / l + 4 };
    };
    ["I1", "I2", "I3"].forEach((nom, n) => {
      if (etat.p[n] <= 0) return;
      const ti = pointPhaseur(O1, courants[n], k);
      const pe = aCote(ti, O1, 18);
      t += texte(pe.x, pe.y, nom, ' font-weight="600" text-anchor="middle"');
      const m = { x: (Q[n].x + Q[n + 1].x) / 2, y: (Q[n].y + Q[n + 1].y) / 2 };
      const pc = aCote(m, centre, 18);
      t += texte(pc.x, pc.y, nom, ' font-weight="600" text-anchor="middle"');
    });
    if (moduleN * kc > 4) {
      t += texte(390, 336, "IN = " + nombre(api, moduleN, 1) + " A, flèche en tirets", ' font-weight="600"');
    } else {
      t += texte(390, 336, "chaîne fermée : IN = 0", ' font-weight="600"');
    }
    t += texte(Q[0].x - 4, Q[0].y - 8, "départ", ' font-size="10.5" text-anchor="end"');
    t += texte(20, 336, "échelle des courants : " + nombre(api, 50 / k, 1) + " A pour 50 px", ' font-size="11"');
    etiquettes.innerHTML = t;

    if (valeurs) {
      const mods = courants.map(cx.module);
      const plusFort = Math.max(...mods);
      valeurs.maj({
        i1: mods[0],
        i2: mods[1],
        i3: mods[2],
        in: moduleN < 1e-9 ? 0 : moduleN,
        rapport: plusFort > 0 ? nombre(api, (moduleN / plusFort) * 100, 1) + " %" : "sans objet",
        p: etat.p[0] + etat.p[1] + etat.p[2],
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-neutre-curseurs",
    [
      { id: "p1", libelle: "Puissance de la phase 1", min: 0, max: 12, pas: 0.1, valeur: 7, unite: "kW" },
      { id: "p2", libelle: "Puissance de la phase 2", min: 0, max: 12, pas: 0.1, valeur: 7, unite: "kW" },
      { id: "p3", libelle: "Puissance de la phase 3", min: 0, max: 12, pas: 0.1, valeur: 7, unite: "kW" },
      { id: "cos", libelle: "Facteur de puissance commun, inductif", min: 0.5, max: 1, pas: 0.01, valeur: 0.89, chiffres: 2 },
    ],
    (lues) => {
      etat.p = [lues.p1, lues.p2, lues.p3];
      etat.cos = lues.cos;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : la même charge en étoile puis en triangle
   -------------------------------------------------------------------------- */

function construireCouplage(racine, api) {
  const conteneur = racine.querySelector("#e-couplage");
  if (!conteneur) return;

  const O = { x: 520, y: 185 };
  const R_I = 80;
  const R_U = 150;
  const etat = { u: 400, z: 30, phi: 36.87, triangle: 0 };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 360",
    role: "img",
    "aria-label": "Couplage choisi, étoile ou triangle, et diagramme de Fresnel de la phase 1 : tension aux bornes d'une impédance, courant de phase réglable par une poignée et courant de ligne",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-k");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.45"><path d="M360 185H740M520 30V340"/>' +
    '<circle cx="' + O.x + '" cy="' + O.y + '" r="' + R_I + '" stroke-dasharray="2 5"/>' +
    '<path d="M340 20V345" stroke-dasharray="2 4"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
    texte(726, 200, "Re") + texte(526, 40, "Im") + "</g>";

  const etoile = svgEl("g", { stroke: "currentColor", "stroke-width": 2, fill: "none", "stroke-linecap": "round" });
  etoile.innerHTML =
    '<path d="M30 70H150V100M150 140V190"/>' +
    '<path d="M30 270H90L109.2 244.4M130.8 215.6L150 190L169.2 215.6M190.8 244.4L210 270M30 310H210V270"/>' +
    '<rect x="140" y="100" width="20" height="40" rx="3"/>' +
    '<rect x="102" y="222" width="36" height="16" rx="3" transform="rotate(-53.13 120 230)"/>' +
    '<rect x="162" y="222" width="36" height="16" rx="3" transform="rotate(53.13 180 230)"/>' +
    '<circle cx="150" cy="190" r="3.5" fill="currentColor"/>';
  const triangle = svgEl("g", { stroke: "currentColor", "stroke-width": 2, fill: "none", "stroke-linecap": "round" });
  triangle.innerHTML =
    '<path d="M30 70H150V90M30 270H70M30 310H230V270"/>' +
    '<path d="M150 90L118.1 161.7M101.9 198.3L70 270M70 270H130M170 270H230M230 270L198.1 198.3M181.9 161.7L150 90"/>' +
    '<rect x="90" y="172" width="40" height="16" rx="3" transform="rotate(-66.04 110 180)"/>' +
    '<rect x="130" y="262" width="40" height="16" rx="3"/>' +
    '<rect x="170" y="172" width="40" height="16" rx="3" transform="rotate(66.04 190 180)"/>' +
    '<circle cx="150" cy="90" r="3.5" fill="currentColor"/><circle cx="70" cy="270" r="3.5" fill="currentColor"/><circle cx="230" cy="270" r="3.5" fill="currentColor"/>';

  const traits = {
    vref: svgEl("path", { stroke: "currentColor", "stroke-width": 1.2, fill: "none", "stroke-dasharray": "2 4", "marker-end": "url(#fl-e-k)" }),
    v: svgEl("path", { stroke: "currentColor", "stroke-width": 1.6, fill: "none", "marker-end": "url(#fl-e-k)" }),
    j: svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "marker-end": "url(#fl-e-k)" }),
    i: svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-dasharray": "10 6", "marker-end": "url(#fl-e-k)" }),
    arc: svgEl("path", { stroke: "currentColor", "stroke-width": 1.3, fill: "none" }),
  };
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, etoile, triangle, traits.vref, traits.v, traits.i, traits.j, traits.arc, etiquettes);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-couplage-valeurs", [
    { id: "couplage", libelle: "Couplage", format: (v) => v },
    { id: "vz", libelle: "Tension aux bornes d'une impédance", unite: "V", decimales: 1 },
    { id: "j", libelle: "Courant dans une impédance", unite: "A", decimales: 2 },
    { id: "i", libelle: "Courant de ligne", unite: "A", decimales: 2 },
    { id: "p", libelle: "Puissance active totale", unite: "kW", decimales: 2 },
    { id: "q", libelle: "Puissance réactive totale", unite: "kvar", decimales: 2 },
    { id: "rapport", libelle: "Puissance rapportée à l'étoile", format: (v) => v },
    { id: "angles", libelle: "Angle (V1, I1) et angle (U12, I1)", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  let poignee = null;
  let curseurs = null;
  let synchronisation = false;

  function calculer() {
    const enTriangle = etat.triangle > 0.5;
    const vz = enTriangle ? etat.u : etat.u / RAC3;
    const j = vz / etat.z;
    const i = enTriangle ? RAC3 * j : j;
    const p = 3 * vz * j * Math.cos(etat.phi * DEG);
    const q = 3 * vz * j * Math.sin(etat.phi * DEG);
    return { enTriangle, vz, j, i, p, q, angleV: enTriangle ? 30 : 0 };
  }

  function dessiner() {
    const r = calculer();
    etoile.style.display = r.enTriangle ? "none" : "";
    triangle.style.display = r.enTriangle ? "" : "none";

    const angleJ = r.angleV - etat.phi;
    const tv = pointPhaseur(O, cx.polaire(R_U, r.angleV), 1);
    const tref = pointPhaseur(O, cx.polaire(r.enTriangle ? R_U / RAC3 : R_U, 0), 1);
    const tj = pointPhaseur(O, cx.polaire(R_I, angleJ), 1);
    const ti = pointPhaseur(O, cx.polaire(r.enTriangle ? R_I * RAC3 : R_I, -etat.phi), 1);
    traits.vref.setAttribute("d", r.enTriangle ? segment(O.x, O.y, tref.x, tref.y) : "");
    traits.v.setAttribute("d", segment(O.x, O.y, tv.x, tv.y));
    traits.j.setAttribute("d", segment(O.x, O.y, tj.x, tj.y, 12));
    traits.i.setAttribute("d", segment(O.x, O.y, ti.x, ti.y));
    const rArc = 46;
    const a1 = Math.min(r.angleV, angleJ);
    const a2 = Math.max(r.angleV, angleJ);
    traits.arc.setAttribute(
      "d",
      Math.abs(etat.phi) > 1
        ? "M" + (O.x + rArc * Math.cos(a1 * DEG)).toFixed(1) + " " + (O.y - rArc * Math.sin(a1 * DEG)).toFixed(1) +
            "A" + rArc + " " + rArc + " 0 0 0 " + (O.x + rArc * Math.cos(a2 * DEG)).toFixed(1) + " " + (O.y - rArc * Math.sin(a2 * DEG)).toFixed(1)
        : ""
    );

    const milieu = ((r.angleV + angleJ) / 2) * DEG;
    let t =
      texte(tv.x + 8, tv.y - 6, r.enTriangle ? "U12" : "V1", ' font-weight="600"') +
      texte(tj.x + (Math.cos(angleJ * DEG) >= 0 ? 12 : -40), tj.y + (Math.sin(angleJ * DEG) >= 0 ? -10 : 20), r.enTriangle ? "J12" : "J = I1", ' font-weight="600"') +
      (r.enTriangle ? texte(ti.x + 8, ti.y + 16, "I1", ' font-weight="600"') + texte(tref.x - 4, tref.y + 16, "V1", ' font-size="11" text-anchor="end"') : "") +
      (Math.abs(etat.phi) > 1 ? texte(O.x + 62 * Math.cos(milieu), O.y - 62 * Math.sin(milieu) + 4, "φ", ' font-size="12" text-anchor="middle"') : "") +
      texte(30, 40, r.enTriangle ? "couplage triangle" : "couplage étoile", ' font-weight="600"') +
      texte(30, 64, "L1", ' font-size="11"') +
      (r.enTriangle
        ? texte(30, 264, "L2", ' font-size="11"') + texte(30, 304, "L3", ' font-size="11"') +
          texte(214, 150, "Z sous U", ' font-size="11"') + texte(30, 334, nombre(api, r.vz, 1) + " V par impédance", ' font-size="11"') +
          texte(30, 350, "J = " + nombre(api, r.j, 2) + " A, I = " + nombre(api, r.i, 2) + " A", ' font-size="11"')
        : texte(30, 264, "L2", ' font-size="11"') + texte(30, 304, "L3", ' font-size="11"') + texte(160, 186, "N'", ' font-size="11"') +
          texte(168, 124, "Z sous V", ' font-size="11"') + texte(30, 334, nombre(api, r.vz, 1) + " V par impédance", ' font-size="11"') +
          texte(30, 350, "J = I = " + nombre(api, r.j, 2) + " A", ' font-size="11"')) +
      texte(360, 350, "tensions : " + nombre(api, r.vz, 0) + " V pour 150 px ; courants : " + nombre(api, r.j, 2) + " A pour 80 px", ' font-size="10.5"');
    etiquettes.innerHTML = t;

    if (valeurs) {
      const etoileP = 3 * (etat.u / RAC3) * (etat.u / RAC3 / etat.z) * Math.cos(etat.phi * DEG);
      valeurs.maj({
        couplage: r.enTriangle ? "triangle" : "étoile",
        vz: r.vz,
        j: r.j,
        i: r.i,
        p: r.p / 1000,
        q: r.q / 1000,
        rapport: Math.abs(etoileP) > 1e-9 ? nombre(api, r.p / etoileP, 2) : nombre(api, r.enTriangle ? 3 : 1, 2),
        angles: nombre(api, etat.phi, 1) + "° et " + nombre(api, etat.phi + 30, 1) + "°",
      });
    }
  }

  function appliquerPhi(phi, source) {
    if (synchronisation) return;
    synchronisation = true;
    etat.phi = Math.max(-90, Math.min(90, phi));
    dessiner();
    const r = calculer();
    if (source !== "poignee" && poignee) poignee.set(r.angleV - etat.phi, false);
    if (source !== "curseur" && curseurs) curseurs.definir("phi", Math.round(etat.phi * 100) / 100);
    synchronisation = false;
  }

  poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: O,
    rayon: R_I,
    valeur: -36.87,
    pas: 1,
    libelle: "Déphasage de l'impédance, extrémité du courant de phase",
    format: (mesure) => "courant de phase à " + nombre(api, mesure.valeur, 0) + " degrés",
    diffuserAuDepart: false,
    rappel(mesure) {
      const r = calculer();
      let phi = r.angleV - mesure.angle;
      phi = ((phi + 540) % 360) - 180;
      const borne = Math.max(-90, Math.min(90, phi));
      appliquerPhi(borne, "poignee");
      if (borne !== phi && poignee) poignee.set(r.angleV - borne, false);
    },
  });
  if (poignee) ressources.push(poignee);

  curseurs = api.sim.curseurs(
    "#e-couplage-curseurs",
    [
      { id: "u", libelle: "Tension composée du réseau U", min: 200, max: 700, pas: 1, valeur: 400, unite: "V" },
      { id: "z", libelle: "Module de l'impédance Z", min: 5, max: 100, pas: 0.5, valeur: 30, unite: "Ω" },
      { id: "phi", libelle: "Déphasage φ de l'impédance", min: -90, max: 90, pas: 0.01, valeur: 36.87, unite: "°", chiffres: 2 },
      { id: "triangle", libelle: "Couplage", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (v > 0.5 ? "triangle" : "étoile") },
    ],
    (lues) => {
      etat.u = lues.u;
      etat.z = lues.z;
      etat.triangle = lues.triangle;
      appliquerPhi(lues.phi, "curseur");
    }
  );
  if (curseurs) ressources.push(curseurs);
  appliquerPhi(etat.phi, null);
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-composee",
      titre: "Tension composée d'un réseau",
      niveau: "fondamental",
      enonce:
        "<p>Un groupe électrogène triphasé délivre des tensions simples de $127\\ \\mathrm{V}$ efficaces, en ordre direct. " +
        "Quelle tension efficace mesure-t-on entre deux de ses phases ?</p>",
      valeur: 127 * RAC3,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension composée $U$",
      etapes: [
        { texte: "Données : $V = 127\\ \\mathrm{V}$, système équilibré. Inconnue : $U$. Méthode : relation entre tension composée et tension simple." },
        { texte: "$\\underline{U}_{12} = \\underline{V}_1 - \\underline{V}_2 = V(1 - a^2)$, de module $\\sqrt{3}\\,V$." },
        {
          texte: "$U = 1{,}732 \\times 127 = 220{,}0\\ \\mathrm{V}$, en avance de $30^\\circ$ sur $\\underline{V}_1$.",
          note: "C'est l'ancien réseau $127/220\\ \\mathrm{V}$ ; contrôle : $220/127 = 1{,}732$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "U12 = V1 + (-V2)",
          unite: "V",
          somme: true,
          nomSomme: "U12 = 220 V à 30 degrés",
          vecteurs: [
            { id: "v1", nom: "V1", amplitude: 127, phase: 0, couleur: "serie-1" },
            { id: "mv2", nom: "-V2", amplitude: 127, phase: 60, couleur: "serie-4", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-etoile",
      titre: "Résistances chauffantes en étoile",
      niveau: "fondamental",
      enonce:
        "<p>Un four comporte trois résistances de $40\\ \\Omega$ couplées en étoile sur un réseau $230/400\\ \\mathrm{V}$, avec " +
        "$U = 400\\ \\mathrm{V}$. Quel est le courant de ligne ?</p>",
      valeur: 400 / RAC3 / 40,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant de ligne $I$",
      etapes: [
        { texte: "En étoile, chaque résistance est soumise à la tension simple : $V = 400/\\sqrt{3} = 230{,}9\\ \\mathrm{V}$." },
        { texte: "Courant de phase et courant de ligne sont confondus : $I = V/R = 230{,}9/40 = 5{,}77\\ \\mathrm{A}$." },
        {
          texte: "Puissance : $P = 3RI^2 = 3 \\times 40 \\times 5{,}774^2 = 4000\\ \\mathrm{W}$, ou $\\sqrt{3} \\times 400 \\times 5{,}774 \\times 1$.",
          note: "En triangle, les mêmes résistances recevraient $400\\ \\mathrm{V}$ : $I = 17{,}32\\ \\mathrm{A}$ et $P = 12\\ \\mathrm{kW}$, trois fois plus.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Courant de ligne sous 400 V selon la résistance et le couplage",
          xTitre: "R",
          xUnite: "Ω",
          yTitre: "I",
          yUnite: "A",
          xMin: 10,
          xMax: 100,
          yMin: 0,
          yMax: 40,
          series: [
            { id: "y", nom: "étoile : I = 400 / (√3 R)", couleur: "serie-1", epaisseur: 2.6, fonction: (r) => 400 / RAC3 / r },
            { id: "d", nom: "triangle : I = √3 × 400 / R", couleur: "serie-5", epaisseur: 2.2, fonction: (r) => (RAC3 * 400) / r },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 40, "R = 40 Ω");
            marquerPoint(c, repere, couleurs, 40, 400 / RAC3 / 40, "5,77 A", false);
            marquerPoint(c, repere, couleurs, 40, (RAC3 * 400) / 40, "17,32 A", false);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-triangle",
      titre: "Courant dans les enroulements d'un moteur en triangle",
      niveau: "intermédiaire",
      enonce:
        "<p>Un moteur triphasé couplé en triangle absorbe $7{,}5\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}85$ sur un réseau de " +
        "$400\\ \\mathrm{V}$ entre phases. Quel courant traverse chacun de ses enroulements ?</p>",
      valeur: 7500 / (RAC3 * 400 * 0.85) / RAC3,
      unite: "A",
      tolerance: 0.015,
      chiffres: 2,
      libelleChamp: "Courant d'enroulement $J$",
      etapes: [
        { texte: "Choix de méthode : la puissance donne le courant de ligne, le couplage donne le lien avec le courant d'enroulement." },
        { texte: "$I = \\dfrac{P}{\\sqrt{3}\\,U\\cos\\varphi} = \\dfrac{7500}{1{,}732 \\times 400 \\times 0{,}85} = 12{,}74\\ \\mathrm{A}$." },
        { texte: "En triangle, $J = I/\\sqrt{3} = 12{,}74/1{,}732 = 7{,}35\\ \\mathrm{A}$." },
        {
          texte: "Contrôle : $3UJ\\cos\\varphi = 3 \\times 400 \\times 7{,}353 \\times 0{,}85 = 7500\\ \\mathrm{W}$.",
          note: "Diviser par $3$ au lieu de $\\sqrt{3}$ donnerait $4{,}25\\ \\mathrm{A}$ : l'erreur ferait sous-dimensionner un relais réglé sur le courant d'enroulement.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const phi = Math.acos(0.85) / DEG;
        const j = 7500 / (RAC3 * 400 * 0.85) / RAC3;
        fresnelCorrection(moteur, conteneur, {
          titre: "I1 = J12 - J31 : le courant de ligne en retard de 30 degrés sur J12",
          unite: "A",
          somme: true,
          nomSomme: "I1 = 12,74 A",
          vecteurs: [
            { id: "j12", nom: "J12", amplitude: j, phase: 30 - phi, couleur: "serie-1" },
            { id: "mj31", nom: "-J31", amplitude: j, phase: 30 - phi - 60, couleur: "serie-4", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-condensateurs",
      titre: "Batterie de condensateurs en triangle",
      niveau: "intermédiaire",
      enonce:
        "<p>Trois condensateurs de $50\\ \\mu\\mathrm{F}$ sont couplés en triangle sur un réseau $400\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$. " +
        "Quel courant de ligne appellent-ils ?</p>",
      valeur: RAC3 * 400 * 50e-6 * W,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant de ligne $I$",
      etapes: [
        { texte: "Chaque condensateur est soumis à $U = 400\\ \\mathrm{V}$ : $J = UC\\omega = 400 \\times 50 \\times 10^{-6} \\times 314{,}16 = 6{,}28\\ \\mathrm{A}$." },
        { texte: "Courant de ligne : $I = \\sqrt{3}\\,J = 10{,}88\\ \\mathrm{A}$." },
        { texte: "Réactif fourni : $Q = 3U^2C\\omega = 3 \\times 160\\,000 \\times 50 \\times 10^{-6} \\times 314{,}16 = 7540\\ \\mathrm{var}$, et $\\sqrt{3} \\times 400 \\times 10{,}88 = 7540\\ \\mathrm{VA}$." },
        {
          texte: "Étoile équivalente : $\\underline{Z}_Y = \\underline{Z}_\\Delta/3$, soit une capacité trois fois plus grande, $150\\ \\mu\\mathrm{F}$ sous $230{,}9\\ \\mathrm{V}$.",
          note: "C'est la relation $C_Y = 3C_\\Delta$ qui lie les $149{,}3\\ \\mu\\mathrm{F}$ et $49{,}8\\ \\mu\\mathrm{F}$ du compresseur du site.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const j = 400 * 50e-6 * W;
        fresnelCorrection(moteur, conteneur, {
          titre: "Courants capacitifs : J12 en avance de 90 degrés sur U12",
          unite: "A",
          somme: true,
          nomSomme: "I1 = 10,88 A, en avance de 90 degrés sur V1",
          vecteurs: [
            { id: "j12", nom: "J12", amplitude: j, phase: 120, couleur: "serie-1" },
            { id: "mj31", nom: "-J31", amplitude: j, phase: 60, couleur: "serie-4", pointille: true },
          ],
        });
      },
    })
  );

  const zy = cx.div({ re: 10, im: 5 }, { re: 1, im: 0 });
  const tensionCharge = (kLigne) => {
    const zl = cx.echelle({ re: 0.2, im: 0.15 }, kLigne);
    const i = cx.div({ re: 400 / RAC3, im: 0 }, cx.plus(zl, zy));
    return RAC3 * cx.module(cx.fois(i, zy));
  };

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-ligne",
      titre: "Tension aux bornes d'une charge alimentée par un câble",
      niveau: "avancé",
      enonce:
        "<p>Un tableau impose $400\\ \\mathrm{V}$ équilibrés. Un câble dont chaque conducteur présente $\\underline{Z}_l = 0{,}2 + j0{,}15\\ \\Omega$ " +
        "alimente une charge équilibrée en étoile, $\\underline{Z}_Y = 10 + j5\\ \\Omega$ par phase. Quelle tension composée règne aux bornes de la charge ?</p>",
      valeur: tensionCharge(1),
      unite: "V",
      tolerance: 0.004,
      chiffres: 1,
      libelleChamp: "Tension composée $U_{\\text{charge}}$",
      etapes: [
        { texte: "Schéma monophasé équivalent : $\\underline{V}_1 = 230{,}94\\ \\mathrm{V}$, impédance totale $10{,}2 + j5{,}15\\ \\Omega$, de module $11{,}43\\ \\Omega$." },
        { texte: "$I = 230{,}94/11{,}43 = 20{,}21\\ \\mathrm{A}$, en retard de $26{,}79^\\circ$." },
        { texte: "$V_{\\text{charge}} = |\\underline{Z}_Y|\\,I = 11{,}18 \\times 20{,}21 = 225{,}97\\ \\mathrm{V}$." },
        { texte: "$U_{\\text{charge}} = \\sqrt{3} \\times 225{,}97 = 391{,}4\\ \\mathrm{V}$, soit une chute de $2{,}15\\ \\%$." },
        {
          texte: "Contrôles : formule approchée $\\Delta V \\approx (0{,}2 \\times 4085 + 0{,}15 \\times 2042)/225{,}97 = 4{,}97\\ \\mathrm{V}$ par phase, soit $8{,}6\\ \\mathrm{V}$ entre phases ; pertes du câble $3 \\times 0{,}2 \\times 20{,}21^2 = 245\\ \\mathrm{W}$ pour $12{,}25\\ \\mathrm{kW}$ reçus.",
          note: "L'erreur classique est d'appliquer $400\\ \\mathrm{V}$ au schéma par phase : on obtiendrait un courant $\\sqrt{3}$ fois trop grand.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Tension aux bornes de la charge selon la longueur relative du câble",
          xTitre: "longueur relative du câble",
          yTitre: "U charge",
          yUnite: "V",
          xMin: 0,
          xMax: 5,
          yMin: 340,
          yMax: 405,
          series: [{ id: "u", nom: "tension composée aux bornes de la charge", couleur: "serie-1", epaisseur: 2.6, fonction: tensionCharge }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 400, "400 V au tableau", true);
            marquerPoint(c, repere, couleurs, 1, tensionCharge(1), "câble de l'énoncé : 391,4 V", false);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Diagnostic : un compresseur qui peine",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Après remplacement de son moteur, un compresseur démarre lentement, n'atteint pas sa vitesse en charge et son relais " +
        "thermique déclenche au bout de quelques minutes. On mesure $400\\ \\mathrm{V}$ entre phases, trois courants de ligne " +
        "égaux et l'ordre direct. La plaque du nouveau moteur indique $400/690\\ \\mathrm{V}$, et une barrette relie W2, U2 et V2. " +
        "Quelles affirmations sont exactes ?</p>",
      multiple: true,
      options: [
        { texte: "Le moteur est couplé en étoile, ce qui ne laisse que $230{,}9\\ \\mathrm{V}$ à chaque enroulement.", juste: true },
        { texte: "Son couple disponible est réduit à environ un tiers du couple prévu.", juste: true },
        { texte: "Une phase est manquante, puisque le moteur peine." },
        { texte: "Il faut le coupler en triangle avec trois barrettes U1-W2, V1-U2 et W1-V2.", juste: true },
        { texte: "Il faut permuter deux phases pour corriger le défaut." },
      ],
      etapes: [
        { texte: "La barrette W2-U2-V2 est la signature du couplage étoile : chaque enroulement reçoit $400/\\sqrt{3} = 230{,}9\\ \\mathrm{V}$." },
        { texte: "La plaque $400/690\\ \\mathrm{V}$ demande $400\\ \\mathrm{V}$ par enroulement, donc le triangle sur ce réseau." },
        { texte: "Le couple d'un moteur asynchrone varie à peu près comme le carré de la tension : $(1/\\sqrt{3})^2 = 1/3$. Le moteur glisse, son courant augmente, le relais déclenche." },
        {
          texte: "Trois courants égaux écartent la phase manquante ; l'ordre direct mesuré et le bon sens de rotation écartent une permutation.",
          note: "Méthode : comparer la tension d'enroulement, déduite du couplage, à la plus petite tension de la plaque.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Couple maximal relatif en fonction de la tension appliquée à chaque enroulement",
          xTitre: "tension d'enroulement / tension assignée",
          yTitre: "couple relatif",
          xMin: 0.3,
          xMax: 1.1,
          yMin: 0,
          yMax: 1.25,
          series: [{ id: "c", nom: "couple maximal relatif, proportionnel au carré de la tension", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => x * x }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 1 / RAC3, 1 / 3, "étoile par erreur : 0,33", false);
            marquerPoint(c, repere, couleurs, 1, 1, "triangle : 1", true);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-conceptuel",
      titre: "Le neutre, inutile et indispensable",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi le neutre d'un récepteur triphasé équilibré ne transporte aucun courant, puis " +
        "pourquoi on le conserve néanmoins dans la distribution d'un bâtiment.</p>",
      motsCles: [
        ["120", "decal", "dephas", "tiers de periode"],
        ["somme", "nulle", "compense", "annul", "s'equilibr"],
        ["desequilibr", "monophas", "inegal", "differen"],
        ["harmonique", "rang 3", "tension simple", "230"],
      ],
      minimum: 3,
      exemple: "Trois ou quatre phrases : reliez le décalage des courants, leur somme, puis les récepteurs réels d'un bâtiment.",
      etapes: [
        { texte: "Les trois courants d'un récepteur équilibré ont le même module et sont décalés de $120^\\circ$ : leur somme vectorielle est nulle, $1 + a + a^2 = 0$." },
        { texte: "La loi des nœuds au point neutre donne $i_N = i_1 + i_2 + i_3 = 0$ à chaque instant : le neutre ne transporte rien." },
        { texte: "Dans un bâtiment, de nombreux récepteurs sont monophasés, alimentés sous la tension simple de $230\\ \\mathrm{V}$ entre une phase et le neutre ; ils ne sont jamais parfaitement répartis." },
        {
          texte: "Sans neutre, le point commun des récepteurs se déplacerait et certains recevraient une tension excessive. De plus, les harmoniques de rang $3$ des alimentations électroniques s'additionnent dans le neutre.",
          note: "Le neutre n'est donc inutile que pour un récepteur triphasé équilibré, comme un moteur.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Trois courants équilibrés : la somme est nulle",
          unite: "A",
          somme: true,
          nomSomme: "IN = I1 + I2 + I3 = 0",
          vecteurs: [
            { id: "i1", nom: "I1", amplitude: 20, phase: -30, couleur: "serie-1" },
            { id: "i2", nom: "I2", amplitude: 20, phase: -150, couleur: "serie-3" },
            { id: "i3", nom: "I3", amplitude: 20, phase: 90, couleur: "serie-4", pointille: true },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

function dessinPlaquesQuiz() {
  let d = '<g stroke="currentColor" stroke-width="1.6" fill="none"><rect x="30" y="40" width="220" height="150" rx="8"/><rect x="310" y="40" width="220" height="150" rx="8"/></g>';
  d += '<g stroke="currentColor" stroke-width="2" fill="none">';
  for (const x0 of [30, 310]) {
    for (const [dx, dy] of [[50, 75], [110, 75], [170, 75], [50, 145], [110, 145], [170, 145]]) {
      d += '<circle cx="' + (x0 + dx) + '" cy="' + dy + '" r="10"/>';
    }
  }
  d += "</g>";
  d += '<g stroke="currentColor" stroke-width="3" fill="none">';
  d += '<rect x="68" y="68" width="144" height="14" rx="4"/>';
  d += '<rect x="353" y="70" width="14" height="80" rx="4"/><rect x="413" y="70" width="14" height="80" rx="4"/><rect x="473" y="70" width="14" height="80" rx="4"/>';
  d += "</g>";
  d += '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">';
  for (const x0 of [30, 310]) {
    d += '<text x="' + (x0 + 38) + '" y="60">W2</text><text x="' + (x0 + 98) + '" y="60">U2</text><text x="' + (x0 + 158) + '" y="60">V2</text>';
    d += '<text x="' + (x0 + 38) + '" y="176">U1</text><text x="' + (x0 + 98) + '" y="176">V1</text><text x="' + (x0 + 158) + '" y="176">W1</text>';
  }
  d += '<text x="140" y="26" text-anchor="middle" font-size="15" font-weight="600">a</text>';
  d += '<text x="420" y="26" text-anchor="middle" font-size="15" font-weight="600">b</text>';
  d += '<text x="30" y="212">barrettes en trait épais ; L1, L2, L3 arrivent sur U1, V1, W1</text>';
  d += "</g>";
  return d;
}

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Sur un réseau $230/400\\ \\mathrm{V}$, entre quels points mesure-t-on $400\\ \\mathrm{V}$ ?</p>",
        options: ["Entre deux conducteurs de phase", "Entre une phase et le neutre", "Entre le neutre et la terre", "Entre une phase et la terre, en schéma usuel"],
        bonnes: [0],
        explication: "$400\\ \\mathrm{V}$ est la tension composée, entre deux phases ; $230\\ \\mathrm{V}$ est la tension simple, entre une phase et le neutre.",
        resume: "Tension simple et composée",
      },
      {
        type: "vraiFaux",
        enonce: "<p>En couplage étoile, le courant de ligne vaut $\\sqrt{3}$ fois le courant qui traverse chaque dipôle.</p>",
        reponse: false,
        explication: "En étoile, chaque dipôle est en série avec sa ligne : les deux courants sont identiques. Le $\\sqrt{3}$ entre courants n'existe qu'en triangle.",
        resume: "Courants en étoile",
      },
      {
        type: "calcul",
        enonce: "<p>Dans un récepteur triangle équilibré, chaque branche est parcourue par $10\\ \\mathrm{A}$. Quel est le courant de ligne ?</p>",
        valeur: 10 * RAC3,
        unite: "A",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$I = \\sqrt{3}\\,J = 17{,}32\\ \\mathrm{A}$, en retard de $30^\\circ$ sur le courant de branche de même premier indice.",
        resume: "Courant de ligne en triangle",
      },
      {
        type: "calcul",
        enonce: "<p>Un récepteur équilibré appelle $20\\ \\mathrm{A}$ par ligne sous $400\\ \\mathrm{V}$ entre phases, à $\\cos\\varphi = 0{,}85$. Quelle puissance active absorbe-t-il, en kilowatts ?</p>",
        valeur: (RAC3 * 400 * 20 * 0.85) / 1000,
        unite: "kW",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$P = \\sqrt{3}\\,UI\\cos\\varphi = 1{,}732 \\times 400 \\times 20 \\times 0{,}85 = 11{,}78\\ \\mathrm{kW}$, quel que soit le couplage.",
        resume: "Puissance active triphasée",
      },
      {
        type: "qcm",
        enonce: "<p>Trois impédances de $30\\ \\Omega$ sont couplées en triangle. Quelle est l'impédance par phase de l'étoile équivalente ?</p>",
        options: ["$10\\ \\Omega$", "$17{,}32\\ \\Omega$", "$30\\ \\Omega$", "$90\\ \\Omega$"],
        bonnes: [0],
        explication: "$\\underline{Z}_Y = \\underline{Z}_\\Delta/3 = 10\\ \\Omega$, même argument. Diviser par $\\sqrt{3}$ est l'erreur la plus fréquente.",
        resume: "Équivalence triangle-étoile",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Permuter deux conducteurs de phase à l'arrivée d'un moteur asynchrone alimenté directement inverse son sens de rotation.</p>",
        reponse: true,
        explication: "La permutation transforme l'ordre direct en ordre inverse : le champ tournant change de sens, et le rotor le suit. Les tensions, elles, gardent leurs modules et leurs décalages.",
        resume: "Ordre des phases",
      },
      {
        type: "courte",
        enonce: "<p>Un moteur dont la plaque indique $230/400\\ \\mathrm{V}$ doit être raccordé à un réseau $230/400\\ \\mathrm{V}$. Quel couplage faut-il, et pourquoi ?</p>",
        motsCles: [["etoile", "y"], ["230", "enroulement", "tension simple", "plus petite"]],
        minimum: 2,
        explication: "L'étoile : chaque enroulement est conçu pour $230\\ \\mathrm{V}$, la plus petite tension de la plaque, que l'étoile lui applique sur un réseau dont la tension composée vaut $400\\ \\mathrm{V}$.",
        resume: "Couplage d'après la plaque",
      },
      {
        type: "schema",
        enonce: "<p>Un moteur $400/690\\ \\mathrm{V}$ doit fonctionner sur un réseau $230/400\\ \\mathrm{V}$. Laquelle de ces deux plaques à bornes est correctement câblée ?</p>",
        consigne: "Cliquez sur la plaque correcte.",
        viewBox: "0 0 560 220",
        description: "Deux plaques à bornes : a, une barrette horizontale reliant W2, U2 et V2 ; b, trois barrettes verticales reliant U1 à W2, V1 à U2 et W1 à V2",
        dessin: dessinPlaquesQuiz(),
        zones: [
          { x: 30, y: 40, largeur: 220, hauteur: 150, etiquette: "a" },
          { x: 310, y: 40, largeur: 220, hauteur: 150, etiquette: "b", juste: true },
        ],
        explication: "La plaque b réalise le triangle : chaque enroulement reçoit $400\\ \\mathrm{V}$, sa tension assignée. La plaque a, en étoile, ne lui donnerait que $230{,}9\\ \\mathrm{V}$ et le tiers de son couple.",
        resume: "Lecture d'une plaque à bornes",
      },
      {
        type: "calcul",
        enonce: "<p>À un instant donné, dans un système équilibré, $v_1 = 200\\ \\mathrm{V}$ et $v_2 = -250\\ \\mathrm{V}$. Que vaut $v_3$, en volts ?</p>",
        valeur: 50,
        unite: "V",
        tolerance: 0.01,
        chiffres: 0,
        explication: "$v_1 + v_2 + v_3 = 0$ à chaque instant, donc $v_3 = -200 + 250 = 50\\ \\mathrm{V}$.",
        resume: "Somme des tensions simples",
      },
      {
        type: "qcm",
        enonce: "<p>En ordre direct, quelle est la position de $\\underline{U}_{12}$ par rapport à $\\underline{V}_1$ ?</p>",
        options: ["En avance de $30^\\circ$", "En retard de $30^\\circ$", "En avance de $120^\\circ$", "En phase"],
        bonnes: [0],
        explication: "$\\underline{U}_{12} = V(1 - a^2) = \\sqrt{3}\\,V e^{j30^\\circ}$ : avance de $30^\\circ$ et module $\\sqrt{3}\\,V$.",
        resume: "Phase de la tension composée",
      },
    ],
    { titre: "Dix questions sur les systèmes triphasés équilibrés" }
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
      { categorie: "Définition", question: "Qu'est-ce qu'un système triphasé équilibré direct ?", reponse: "Trois sinusoïdes de même fréquence et même valeur efficace, $v_2$ en retard de $120^\\circ$ sur $v_1$ et $v_3$ en retard de $120^\\circ$ sur $v_2$." },
      { categorie: "Opérateur", question: "Que vaut l'opérateur $a$ et quelle identité vérifie-t-il ?", reponse: "$a = e^{j2\\pi/3} = -\\tfrac{1}{2} + j\\tfrac{\\sqrt{3}}{2}$ ; $a^3 = 1$ et $1 + a + a^2 = 0$." },
      { categorie: "Tensions", question: "Quel lien entre tension composée et tension simple ?", reponse: "$U = \\sqrt{3}\\,V$ et $\\underline{U}_{12}$ en avance de $30^\\circ$ sur $\\underline{V}_1$ : $230 \\times 1{,}732 = 398{,}4\\ \\mathrm{V}$." },
      { categorie: "Ordre", question: "Que change la permutation de deux phases ?", reponse: "L'ordre direct devient inverse : les modules et les décalages restent, le sens de rotation des moteurs s'inverse." },
      { categorie: "Étoile", question: "Quelle tension et quel courant pour un dipôle couplé en étoile ?", reponse: "La tension simple $V$ ; son courant est le courant de ligne, $I = V/Z$." },
      { categorie: "Triangle", question: "Quelle tension et quel courant pour un dipôle couplé en triangle ?", reponse: "La tension composée $U$ ; $J = U/Z$ et $I = \\sqrt{3}\\,J$, en retard de $30^\\circ$ sur $\\underline{J}_{12}$." },
      { categorie: "Équivalence", question: "Quelle étoile équivaut à un triangle équilibré ?", reponse: "$\\underline{Z}_Y = \\underline{Z}_\\Delta/3$ ; pour des condensateurs, $C_Y = 3C_\\Delta$." },
      { categorie: "Puissance", question: "Quelle est la puissance active d'un récepteur équilibré, et quel angle y figure ?", reponse: "$P = \\sqrt{3}\\,UI\\cos\\varphi$, où $\\varphi$ est l'argument de l'impédance d'une phase ; la puissance instantanée totale est constante." },
      { categorie: "Plaque", question: "Comment choisir le couplage d'un moteur ?", reponse: "Chaque enroulement doit recevoir la plus petite tension de la plaque : $230/400\\ \\mathrm{V}$ en étoile et $400/690\\ \\mathrm{V}$ en triangle sur un réseau $400\\ \\mathrm{V}$." },
      {
        categorie: "Industriel",
        question: "Quelles décisions le site a-t-il prises pour son compresseur ?",
        reponse: "Couplage triangle, $18{,}48\\ \\mathrm{A}$ par enroulement pour $32\\ \\mathrm{A}$ en ligne, et un relais de contrôle d'ordre et de présence des phases sur son départ.",
        rappel: "Plaque supposée 400/690 V ; 21,56 ohms par branche, soit 3 x 7,19 ohms ; 17,66 kW.",
      },
    ],
    { titre: "Dix cartes sur les systèmes triphasés équilibrés" }
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
        enonce: "<p>Un réseau triphasé a une tension composée de $690\\ \\mathrm{V}$. Quelle est sa tension simple, en volts ?</p>",
        valeur: 690 / RAC3,
        unite: "V",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$V = U/\\sqrt{3} = 690/1{,}732 = 398{,}4\\ \\mathrm{V}$ : c'est le réseau $400/690\\ \\mathrm{V}$.",
        resume: "Tension simple (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>La puissance instantanée totale reçue par un récepteur triphasé équilibré pulse à $100\\ \\mathrm{Hz}$, comme en monophasé.</p>",
        reponse: false,
        explication: "Chaque phase pulse à $100\\ \\mathrm{Hz}$, mais les trois oscillations se compensent : la somme est constante, $3VI\\cos\\varphi$.",
        resume: "Puissance instantanée (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Trois résistances de $60\\ \\Omega$ sont couplées en triangle sur un réseau $400\\ \\mathrm{V}$. Quel est le courant de ligne ?</p>",
        valeur: (RAC3 * 400) / 60,
        unite: "A",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$J = 400/60 = 6{,}67\\ \\mathrm{A}$ ; $I = \\sqrt{3}\\,J = 11{,}55\\ \\mathrm{A}$ ; $P = 3 \\times 400 \\times 6{,}67 = 8\\ \\mathrm{kW}$.",
        resume: "Courant de ligne en triangle (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Une charge monophasée absorbe $5\\ \\mathrm{kW}$ et $2\\ \\mathrm{kvar}$ sous $230\\ \\mathrm{V}$, par une ligne de résistance de boucle $0{,}3\\ \\Omega$ et de réactance $0{,}1\\ \\Omega$. Quelle est la chute de tension approchée, en volts ?</p>",
        valeur: (0.3 * 5000 + 0.1 * 2000) / 230,
        unite: "V",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$\\Delta U \\approx (R_lP + X_lQ)/U = (1500 + 200)/230 = 7{,}39\\ \\mathrm{V}$, soit $3{,}2\\ \\%$. Révisé du cours Révision 3 et analyse d'une charge AC.",
        resume: "Chute de tension (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Un condensateur de compensation de $5\\ \\mathrm{kvar}$ est raccordé à un nœud de puissance de court-circuit $500\\ \\mathrm{kVA}$. À quel rang harmonique résonne-t-il avec le réseau ?</p>",
        valeur: 10,
        tolerance: 0.01,
        chiffres: 1,
        explication: "$n_r = \\sqrt{S_{cc}/Q_C} = \\sqrt{500/5} = 10$, soit $500\\ \\mathrm{Hz}$. Révisé du cours Révision 3 et analyse d'une charge AC.",
        resume: "Rang de résonance (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la valeur crête d'une tension sinusoïdale de $400\\ \\mathrm{V}$ efficaces ?</p>",
        valeur: 400 * Math.SQRT2,
        unite: "V",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$\\hat{U} = U\\sqrt{2} = 565{,}7\\ \\mathrm{V}$ : c'est la tension à vide du bus continu d'un variateur alimenté en $400\\ \\mathrm{V}$. Révisé du cours Signaux périodiques et sinusoïdes.",
        resume: "Valeur crête (Signaux périodiques et sinusoïdes)",
      },
      {
        type: "qcm",
        enonce: "<p>Au nœud $L_1$ d'un récepteur en triangle, $\\underline{I}_1$ entre, $\\underline{J}_{12}$ sort vers $L_2$ et $\\underline{J}_{31}$ arrive de $L_3$. Que donne la loi des nœuds ?</p>",
        options: ["$\\underline{I}_1 = \\underline{J}_{12} - \\underline{J}_{31}$", "$\\underline{I}_1 = \\underline{J}_{12} + \\underline{J}_{31}$", "$\\underline{I}_1 = \\underline{J}_{31} - \\underline{J}_{12}$", "$I_1 = J_{12} + J_{31}$ en valeurs efficaces"],
        bonnes: [0],
        explication: "Courants entrants égaux aux courants sortants : $\\underline{I}_1 + \\underline{J}_{31} = \\underline{J}_{12}$. La loi s'applique aux phaseurs, jamais aux valeurs efficaces. Révisé du cours Lois de Kirchhoff.",
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
    titre: "Où en suis-je sur les systèmes triphasés équilibrés ?",
  });
  if (auto) ressources.push(auto);
}
