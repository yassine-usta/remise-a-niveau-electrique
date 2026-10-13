/* ==========================================================================
   cours/charges-triphasees-desequilibrees/cours.js
   Charges triphasées déséquilibrées : courant du neutre, théorème de Millman,
   déplacement du point étoile et risques d'une rupture du neutre.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const W50 = TAU * 50;
const VS = 230;

/* --------------------------------------------------------------------------
   Calcul complexe minimal et modèle du réseau
   -------------------------------------------------------------------------- */

const cx = {
  c: (re, im = 0) => ({ re, im }),
  polaire: (module, degres) => ({ re: module * Math.cos(degres * DEG), im: module * Math.sin(degres * DEG) }),
  plus: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  moins: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
  fois: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  echelle: (a, k) => ({ re: a.re * k, im: a.im * k }),
  conj: (a) => ({ re: a.re, im: -a.im }),
  div: (a, b) => {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  },
  inverse: (a) => cx.div({ re: 1, im: 0 }, a),
  module: (a) => Math.hypot(a.re, a.im),
  argument: (a) => Math.atan2(a.im, a.re) / DEG,
  somme: (liste) => liste.reduce((acc, z) => ({ re: acc.re + z.re, im: acc.im + z.im }), { re: 0, im: 0 }),
};

/* Tensions simples de la source, ordre direct, origine des phases sur V1. */
const V = [cx.polaire(VS, 0), cx.polaire(VS, -120), cx.polaire(VS, 120)];

/** Admittance d'une charge de puissance apparente s (kVA sous 230 V) et d'argument phi (degrés). */
function admittance(sKva, phiDeg) {
  const k = (sKva * 1000) / (VS * VS);
  return { re: k * Math.cos(phiDeg * DEG), im: -k * Math.sin(phiDeg * DEG) };
}

/**
 * Théorème de Millman pour une étoile d'admittances Y, neutre d'admittance réelle yN
 * (Infinity : neutre parfait ; 0 : neutre rompu).
 */
function millman(Y, yN) {
  const num = cx.somme(Y.map((y, k) => cx.fois(y, V[k])));
  if (yN === Infinity) return { vn: cx.c(0, 0), num };
  const den = cx.plus(cx.somme(Y), cx.c(yN, 0));
  if (cx.module(den) < 1e-12) return { vn: cx.c(0, 0), num };
  return { vn: cx.div(num, den), num, den };
}

/** Tensions, courants et puissances des charges pour un état du neutre donné. */
function resoudreEtoile(Y, yN) {
  const { vn, num } = millman(Y, yN);
  const vp = V.map((v) => cx.moins(v, vn));
  const i = Y.map((y, k) => cx.fois(y, vp[k]));
  const iN = cx.somme(i);
  const s = vp.map((v, k) => cx.fois(v, cx.conj(i[k])));
  return { vn, num, vp, i, iN, s, p: cx.somme(s).re, q: cx.somme(s).im };
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

/** Position en pixels d'un phaseur z tracé depuis l'origine o à l'échelle k, axe imaginaire vers le haut. */
function px(o, k, z) {
  return { x: o.x + k * z.re, y: o.y - k * z.im };
}

/** Point décalé de d pixels depuis p dans la direction de l'angle (degrés, axe vertical vers le haut). */
function decale(p, d, degres) {
  return { x: p.x + d * Math.cos(degres * DEG), y: p.y - d * Math.sin(degres * DEG) };
}

/** Ramène un point à l'intérieur d'un cadre ; indique s'il a été rogné. */
function dansCadre(p, cadre) {
  const x = Math.max(cadre.x1, Math.min(cadre.x2, p.x));
  const y = Math.max(cadre.y1, Math.min(cadre.y2, p.y));
  return { x, y, rogne: x !== p.x || y !== p.y };
}

/** Barre verticale de hauteur h (pixels) posée sur la base y0, centrée en x. */
function barre(x, y0, h, largeur = 40) {
  if (Math.abs(h) < 0.6) return "M" + (x - largeur / 2) + " " + y0 + "H" + (x + largeur / 2);
  return "M" + (x - largeur / 2) + " " + y0 + "H" + (x + largeur / 2) + "V" + (y0 - h).toFixed(1) + "H" + (x - largeur / 2) + "Z";
}

/** Ligne verticale en tirets sur un tracé, avec son libellé. */
function ligneV(c, repere, couleurs, x, libelle, epaisseur = 1.2, tirets = [5, 5]) {
  const pxv = repere.versX(x);
  if (pxv < repere.boite.x - 1 || pxv > repere.boite.x + repere.boite.l + 1) return;
  c.save();
  c.setLineDash(tirets);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = epaisseur;
  c.beginPath();
  c.moveTo(pxv, repere.boite.y);
  c.lineTo(pxv, repere.boite.y + repere.boite.h);
  c.stroke();
  c.setLineDash([]);
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    const aGauche = pxv > repere.boite.x + repere.boite.l * 0.75;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, pxv + (aGauche ? -5 : 5), repere.boite.y + 14);
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
  const pxv = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.fillStyle = couleurs.texte;
  c.beginPath();
  c.arc(pxv, py, 4.5, 0, Math.PI * 2);
  c.fill();
  if (libelle) {
    c.font = POLICE;
    const gauche = aGauche != null ? aGauche : pxv > repere.boite.x + repere.boite.l * 0.6;
    c.textAlign = gauche ? "right" : "left";
    c.fillText(libelle, pxv + (gauche ? -8 : 8), py - 8);
  }
  c.restore();
}

/** Tracé de correction animé par le moteur. */
function traceCorrection(moteur, conteneur, options) {
  const traceur = moteur.sim.traceur(conteneur, {
    genre: "Correction visuelle",
    ratio: 0.42,
    echantillons: 500,
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

/** Courbes des tensions des trois charges de l'exemple en fonction de l'impédance du neutre. */
function courbesNeutreExemple(moteur, conteneur, titre, marque) {
  const Y = [cx.inverse(cx.c(10, 0)), cx.inverse(cx.c(16, 12)), cx.inverse(cx.c(40, 0))];
  const tension = (k) => (zn) => cx.module(resoudreEtoile(Y, zn <= 1e-9 ? Infinity : 1 / zn).vp[k]);
  return traceCorrection(moteur, conteneur, {
    titre,
    xTitre: "impédance du neutre ZN",
    xUnite: "Ω",
    yTitre: "tension de la charge",
    yUnite: "V",
    xMin: 0,
    xMax: 20,
    yMin: 150,
    yMax: 290,
    series: [
      { id: "v1", nom: "V1', chauffage 10 Ω", couleur: "serie-1", epaisseur: 2.6, fonction: tension(0) },
      { id: "v2", nom: "V2', climatisation 16 + j12 Ω", couleur: "serie-5", epaisseur: 2.6, fonction: tension(1) },
      { id: "v3", nom: "V3', éclairage 40 Ω", couleur: "serie-3", epaisseur: 2.6, fonction: tension(2) },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 230, "230 V", false, [2, 3]);
      if (marque != null) ligneV(c, repere, couleurs, marque, "ZN = " + String(marque).replace(".", ",") + " Ω");
    },
  });
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
  construireRupture(racine, api);
  construireNeutreSim(racine, api);
  construireConstruction(racine, api);
  construirePointSim(racine, api);
  construireChrono(racine, api);
  construireRepartition(racine, api);
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
  nettoyeurs.push(() => {
    for (const lien of liens) lien.removeEventListener("click", surClic);
  });
}

/* --------------------------------------------------------------------------
   Tracé progressif des schémas statiques
   -------------------------------------------------------------------------- */

function construireDessinsStatiques(racine, api) {
  const schemas = [
    ["#e-millman-figure svg", 1.6],
    ["#e-triangle-figure svg", 1.6],
    ["#f-schema-principal svg", 2.2],
    ["#f-fresnel svg", 1.8],
    ["#i-atelier-figure svg", 2],
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
      id: "c-somme",
      titre: "Somme de deux tensions simples",
      niveau: "prérequis",
      enonce:
        "<p>Dans un système équilibré direct de $230\\ \\mathrm{V}$, quelle est la valeur efficace de la somme " +
        "$\\underline{V}_1 + \\underline{V}_2$ ?</p>",
      valeur: 230,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Module de $\\underline{V}_1 + \\underline{V}_2$",
      etapes: [
        { texte: "$\\underline{V}_1 + \\underline{V}_2 = V(1 + a^2)$, et $1 + a + a^2 = 0$ donne $1 + a^2 = -a$." },
        { texte: "Donc $\\underline{V}_1 + \\underline{V}_2 = -\\underline{V}_3$ : un phaseur de $230\\ \\mathrm{V}$ à $-60^\\circ$." },
        {
          texte: "Le module vaut $230\\ \\mathrm{V}$, et non $460\\ \\mathrm{V}$.",
          note: "C'est le calcul du courant de neutre de deux phases également chargées : il vaut le courant d'une seule phase.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "V1 + V2 = -V3",
          unite: "V",
          somme: true,
          nomSomme: "V1 + V2, 230 V à -60 degrés",
          vecteurs: [
            { id: "v1", nom: "V1", amplitude: 230, phase: 0, couleur: "serie-1" },
            { id: "v2", nom: "V2", amplitude: 230, phase: -120, couleur: "serie-3" },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-admittance",
      titre: "Conductance d'une impédance inductive",
      niveau: "prérequis",
      enonce:
        "<p>Une charge a pour impédance $\\underline{Z} = 16 + j12\\ \\Omega$. Quelle est la partie réelle $G$ de son admittance " +
        "$\\underline{Y} = 1/\\underline{Z}$, en siemens ?</p>",
      valeur: 0.04,
      unite: "S",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Conductance $G$",
      etapes: [
        { texte: "On multiplie par le conjugué : $\\underline{Y} = \\dfrac{16 - j12}{16^2 + 12^2} = \\dfrac{16 - j12}{400}$." },
        { texte: "$\\underline{Y} = 0{,}04 - j0{,}03\\ \\mathrm{S}$, de module $0{,}05\\ \\mathrm{S} = 1/20\\ \\Omega$." },
        {
          texte: "$G = 0{,}04\\ \\mathrm{S}$, qui n'est pas $1/16 = 0{,}0625\\ \\mathrm{S}$.",
          note: "L'argument de l'admittance est l'opposé de celui de l'impédance : $-36{,}87^\\circ$. C'est ce poids complexe qui entre dans Millman.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Impédance et admittance, arguments opposés",
          vecteurs: [
            { id: "z", nom: "Z, en ohms", amplitude: 20, phase: 36.87, couleur: "serie-1", unite: "Ω" },
            { id: "y", nom: "Y x 400, en siemens multipliés par 400", amplitude: 20, phase: -36.87, couleur: "serie-5", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-millman",
      titre: "Théorème de Millman en continu",
      niveau: "prérequis",
      enonce:
        "<p>Un nœud est relié par trois résistances de $1\\ \\mathrm{k\\Omega}$ à trois potentiels : $12\\ \\mathrm{V}$, $0\\ \\mathrm{V}$ " +
        "et $0\\ \\mathrm{V}$. Aucun autre courant ne sort du nœud. Quel est son potentiel ?</p>",
      valeur: 4,
      unite: "V",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Potentiel du nœud",
      etapes: [
        { texte: "Loi des nœuds : $\\sum G_k (E_k - V) = 0$, d'où $V = \\dfrac{\\sum G_k E_k}{\\sum G_k}$." },
        { texte: "$V = \\dfrac{10^{-3} \\times 12 + 0 + 0}{3 \\times 10^{-3}} = 4\\ \\mathrm{V}$." },
        { texte: "Le nœud se place au barycentre des potentiels pondérés par les conductances.", note: "Le point étoile d'une charge sans neutre obéit à la même loi, avec des phaseurs et des admittances." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Potentiel du nœud en fonction du premier potentiel",
          xTitre: "E1",
          xUnite: "V",
          yTitre: "V",
          yUnite: "V",
          xMin: 0,
          xMax: 24,
          yMin: 0,
          yMax: 9,
          series: [{ id: "v", nom: "V = E1 / 3, deux autres potentiels nuls", couleur: "serie-1", epaisseur: 2.6, fonction: (e) => e / 3 }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 12, 4, "E1 = 12 V : V = 4 V", false);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   Triangle des tensions : fond commun aux figures dynamiques
   -------------------------------------------------------------------------- */

/** Dessine le triangle des tensions composées, les sommets nommés et le neutre N. */
function fondTriangle(o, k, avecTensions, idMarqueur) {
  const s = V.map((v) => px(o, k, v));
  let d =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7"><path d="M' +
    s[0].x.toFixed(1) + " " + s[0].y.toFixed(1) + "L" + s[1].x.toFixed(1) + " " + s[1].y.toFixed(1) + "L" +
    s[2].x.toFixed(1) + " " + s[2].y.toFixed(1) + 'Z"/></g>';
  if (avecTensions) {
    d += '<g stroke="currentColor" stroke-width="1.3" fill="none" opacity="0.75">';
    for (const p of s) d += '<path d="' + segment(o.x, o.y, p.x, p.y) + '" marker-end="url(#' + idMarqueur + ')"/>';
    d += "</g>";
  }
  d += '<g fill="currentColor" stroke="none"><circle cx="' + o.x + '" cy="' + o.y + '" r="3.5"/></g>';
  d +=
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    texte(s[0].x + 8, s[0].y + 4, "V1") + texte(s[1].x - 26, s[1].y + 16, "V2") + texte(s[2].x - 26, s[2].y - 6, "V3") +
    texte(o.x - 22, o.y + 20, "N") + "</g>";
  return { html: d, sommets: s };
}

/* --------------------------------------------------------------------------
   D. Animation : un neutre qui se dégrade jusqu'à la rupture
   -------------------------------------------------------------------------- */

function construireRupture(racine, api) {
  const conteneur = racine.querySelector("#d-rupture");
  if (!conteneur) return;

  const O = { x: 220, y: 205 };
  const K = 0.5;
  const BARRES = { x: [500, 590, 680], y0: 340, k: 0.5 };
  const etat = { p: [6, 2, 1], s: 0 };

  const zn = (s) => (s >= 0.999 ? Infinity : 0.01 * Math.pow(10, 4.5 * s));
  const yn = (s) => (s >= 0.999 ? 0 : 1 / zn(s));
  const admittances = () => etat.p.map((p) => cx.c((p * 1000) / (VS * VS), 0));

  const svg = svgEl("svg", {
    viewBox: "0 0 760 390",
    role: "img",
    "aria-label": "Déplacement du point commun N' d'une charge étoile résistive déséquilibrée quand l'impédance du neutre croît jusqu'à la rupture, avec les tensions des trois charges",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-d-r");
  const fond = svgEl("g");
  const triangle = fondTriangle(O, K, false, "fl-d-r");
  fond.innerHTML =
    triangle.html +
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7"><path d="M460 ' + BARRES.y0 + 'H720"/></g>' +
    '<g stroke="currentColor" stroke-width="1.3" fill="none" stroke-dasharray="7 5"><path d="M460 ' +
    (BARRES.y0 - 230 * BARRES.k) + 'H720"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5">' +
    texte(724, BARRES.y0 - 230 * BARRES.k + 4, "230 V") +
    texte(BARRES.x[0], 360, "V1'", ' text-anchor="middle"') + texte(BARRES.x[1], 360, "V2'", ' text-anchor="middle"') +
    texte(BARRES.x[2], 360, "V3'", ' text-anchor="middle"') + "</g>";
  const trajectoire = svgEl("path", { stroke: "currentColor", "stroke-width": 1.6, fill: "none", "stroke-dasharray": "2 4" });
  const tensions = [0, 1, 2].map(() =>
    svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-d-r)" })
  );
  const point = svgEl("circle", { r: 5.5, fill: "currentColor" });
  const barres = [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "currentColor", "fill-opacity": 0.22 }));
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  svg.append(defs, fond, trajectoire, ...tensions, point, ...barres, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-rupture-valeurs", [
    { id: "zn", libelle: "Impédance du neutre ZN", format: (v) => (Number.isFinite(v) ? nombre(api, v, v < 1 ? 3 : 1) + " Ω" : "infinie, neutre rompu") },
    { id: "vn", libelle: "Tension de déplacement VN'N", unite: "V", decimales: 1 },
    { id: "v1", libelle: "V1', phase 1", unite: "V", decimales: 1 },
    { id: "v2", libelle: "V2', phase 2", unite: "V", decimales: 1 },
    { id: "v3", libelle: "V3', phase 3", unite: "V", decimales: 1 },
    { id: "in", libelle: "Courant du neutre IN", unite: "A", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function tracerTrajectoire() {
    const Y = admittances();
    let d = "";
    for (let n = 0; n <= 160; n += 1) {
      const s = n / 160;
      const r = millman(Y, yn(s));
      const p = px(O, K, r.vn);
      d += (n === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1);
    }
    trajectoire.setAttribute("d", d);
  }

  function dessiner() {
    const Y = admittances();
    const r = resoudreEtoile(Y, yn(etat.s));
    const pN = px(O, K, r.vn);
    point.setAttribute("cx", pN.x.toFixed(1));
    point.setAttribute("cy", pN.y.toFixed(1));
    triangle.sommets.forEach((p, k) => tensions[k].setAttribute("d", segment(pN.x, pN.y, p.x, p.y)));
    const modules = r.vp.map((v) => cx.module(v));
    let t = texte(pN.x + 8, pN.y - 8, "N'");
    modules.forEach((m, k) => {
      const h = Math.min(420, m) * BARRES.k;
      barres[k].setAttribute("d", barre(BARRES.x[k], BARRES.y0, h, 44));
      t += texte(BARRES.x[k], BARRES.y0 - h - 8, nombre(api, m, 0), ' text-anchor="middle" font-size="11.5"');
    });
    const z = zn(etat.s);
    const courantN = Number.isFinite(z) ? cx.module(r.vn) / z : 0;
    t += texte(440, 36, Number.isFinite(z) ? "ZN = " + nombre(api, z, z < 1 ? 3 : 1) + " Ω" : "neutre rompu, ZN infinie", ' font-weight="600"');
    t += texte(440, 60, "IN = " + nombre(api, courantN, 2) + " A");
    t += texte(440, 84, "VN'N = " + nombre(api, cx.module(r.vn), 1) + " V");
    t += texte(440, 108, "charges : " + etat.p.map((p) => nombre(api, p, 1)).join(" ; ") + " kW");
    libelles.innerHTML = t;
    if (valeurs) {
      valeurs.maj({ zn: z, vn: cx.module(r.vn), v1: modules[0], v2: modules[1], v3: modules[2], in: courantN });
    }
  }

  const curseurs = api.sim.curseurs(
    "#d-rupture-curseurs",
    [
      { id: "p1", libelle: "Charge résistive de la phase 1", min: 0, max: 10, pas: 0.1, valeur: 6, unite: "kW", chiffres: 1 },
      { id: "p2", libelle: "Charge résistive de la phase 2", min: 0, max: 10, pas: 0.1, valeur: 2, unite: "kW", chiffres: 1 },
      { id: "p3", libelle: "Charge résistive de la phase 3", min: 0, max: 10, pas: 0.1, valeur: 1, unite: "kW", chiffres: 1 },
    ],
    (lues) => {
      etat.p = [lues.p1, lues.p2, lues.p3];
      tracerTrajectoire();
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-rupture-lecteur", {
    de: 0,
    a: 1,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Faire croître l'impédance du neutre jusqu'à la rupture",
    rappel(valeur) {
      etat.s = valeur;
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);
  tracerTrajectoire();
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : construire le courant du neutre
   -------------------------------------------------------------------------- */

function construireNeutreSim(racine, api) {
  const conteneur = racine.querySelector("#e-neutre");
  if (!conteneur) return;

  const O = { x: 250, y: 200 };
  const K = 4;
  const BOITE = { x: O.x - 40 * K, y: O.y - 40 * K, largeur: 80 * K, hauteur: 80 * K };
  const etat = { i1: cx.c(20, 0), m2: 10, f2: 0, m3: 10, f3: 0 };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 400",
    role: "img",
    "aria-label": "Diagramme des trois courants de ligne et de leur somme, le courant du neutre ; l'extrémité du courant I1 est une poignée déplaçable",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-n");
  const fond = svgEl("g");
  let f = '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.35" stroke-dasharray="3 5">';
  for (const r of [10, 20, 30]) f += '<circle cx="' + O.x + '" cy="' + O.y + '" r="' + r * K + '"/>';
  f += "</g>";
  f += '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.45"><path d="M' + (O.x - 175) + " " + O.y + "H" + (O.x + 175) + "M" + O.x + " " + (O.y - 175) + "V" + (O.y + 175) + '"/></g>';
  f += '<g stroke="currentColor" stroke-width="1.2" fill="none" stroke-dasharray="6 5" opacity="0.8">';
  const directions = [0, -120, 120].map((a) => decale(O, 172, a));
  for (const p of directions) f += '<path d="M' + O.x + " " + O.y + "L" + p.x.toFixed(1) + " " + p.y.toFixed(1) + '"/>';
  f += "</g>";
  f +=
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5">' +
    texte(directions[0].x - 20, directions[0].y - 8, "V1") + texte(directions[1].x - 4, directions[1].y + 14, "V2") +
    texte(directions[2].x - 4, directions[2].y - 6, "V3") +
    texte(O.x + 5, O.y + 10 * K - 4, "10") + texte(O.x + 5, O.y + 20 * K - 4, "20") + texte(O.x + 5, O.y + 30 * K - 4, "30 A") +
    "</g>";
  fond.innerHTML = f;
  const chemin = svgEl("path", { stroke: "currentColor", "stroke-width": 1.5, fill: "none", "stroke-dasharray": "2 4" });
  const courants = [0, 1, 2].map(() =>
    svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-n)" })
  );
  const neutre = svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-dasharray": "9 5", "marker-end": "url(#fl-e-n)" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  svg.append(defs, fond, chemin, ...courants, neutre, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-neutre-valeurs", [
    { id: "m1", libelle: "I1, réglé par la poignée", unite: "A", decimales: 2 },
    { id: "f1", libelle: "Déphasage φ1 de I1 sur V1", unite: "°", decimales: 1 },
    { id: "in", libelle: "Courant du neutre IN", unite: "A", decimales: 2 },
    { id: "an", libelle: "Argument de IN", unite: "°", decimales: 1 },
    { id: "rap", libelle: "IN rapporté au plus grand courant de phase", format: (v) => (Number.isFinite(v) ? nombre(api, v, 2) : "indéfini") },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const I = [etat.i1, cx.polaire(etat.m2, -120 - etat.f2), cx.polaire(etat.m3, 120 - etat.f3)];
    const pts = I.map((i) => px(O, K, i));
    const iN = cx.somme(I);
    const pN = px(O, K, iN);
    courants[0].setAttribute("d", segment(O.x, O.y, pts[0].x, pts[0].y, 10));
    courants[1].setAttribute("d", segment(O.x, O.y, pts[1].x, pts[1].y));
    courants[2].setAttribute("d", segment(O.x, O.y, pts[2].x, pts[2].y));
    const a = px(O, K, I[0]);
    const b = px(O, K, cx.plus(I[0], I[1]));
    chemin.setAttribute(
      "d",
      "M" + a.x.toFixed(1) + " " + a.y.toFixed(1) + "L" + b.x.toFixed(1) + " " + b.y.toFixed(1) + segment(b.x, b.y, pN.x, pN.y).replace(/^M[^L]*/, "")
    );
    neutre.setAttribute("d", segment(O.x, O.y, pN.x, pN.y));

    const eti = (p, i, nom, dec) => {
      const ang = cx.argument(i);
      const q = decale(p, dec, ang);
      return texte(q.x - 8, q.y + 5, nom);
    };
    let t = "";
    if (cx.module(I[0]) > 1) t += eti(pts[0], I[0], "I1", 18);
    if (cx.module(I[1]) > 1) t += eti(pts[1], I[1], "I2", 14);
    if (cx.module(I[2]) > 1) t += eti(pts[2], I[2], "I3", 14);
    if (cx.module(iN) > 1) t += texte(pN.x + 8, pN.y + 18, "IN", ' font-weight="600"');
    const m = I.map((i) => cx.module(i));
    t += texte(470, 40, "Courants de ligne", ' font-weight="600"');
    t += texte(470, 66, "I1 = " + nombre(api, m[0], 1) + " A, φ1 = " + nombre(api, -cx.argument(I[0]), 0) + "°");
    t += texte(470, 90, "I2 = " + nombre(api, m[1], 1) + " A, φ2 = " + nombre(api, etat.f2, 0) + "°");
    t += texte(470, 114, "I3 = " + nombre(api, m[2], 1) + " A, φ3 = " + nombre(api, etat.f3, 0) + "°");
    t += texte(470, 150, "Courant du neutre", ' font-weight="600"');
    t += texte(470, 176, "IN = " + nombre(api, cx.module(iN), 2) + " A");
    const maxi = Math.max(...m);
    if (maxi > 1e-6 && cx.module(iN) > maxi * 1.001) t += texte(470, 200, "plus grand que chaque courant de phase");
    t += texte(470, 240, "φ positif : courant en retard,");
    t += texte(470, 258, "charge inductive");
    libelles.innerHTML = t;

    if (valeurs) {
      valeurs.maj({
        m1: m[0],
        f1: -cx.argument(I[0]),
        in: cx.module(iN),
        an: cx.argument(iN),
        rap: maxi > 1e-6 ? cx.module(iN) / maxi : NaN,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: BOITE,
    valeur: { x: O.x + 20 * K, y: O.y },
    pas: 4,
    libelle: "Extrémité du courant I1 : module et déphasage",
    format: (mesure) => {
      const i = cx.c((mesure.x - O.x) / K, (O.y - mesure.y) / K);
      return "I1 = " + nombre(api, cx.module(i), 1) + " ampères à " + nombre(api, cx.argument(i), 0) + " degrés";
    },
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.i1 = cx.c((mesure.x - O.x) / K, (O.y - mesure.y) / K);
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-neutre-curseurs",
    [
      { id: "m2", libelle: "Module de I2", min: 0, max: 30, pas: 0.5, valeur: 10, unite: "A", chiffres: 1 },
      { id: "f2", libelle: "Déphasage φ2 de I2 sur V2", min: -90, max: 90, pas: 1, valeur: 0, unite: "°" },
      { id: "m3", libelle: "Module de I3", min: 0, max: 30, pas: 0.5, valeur: 10, unite: "A", chiffres: 1 },
      { id: "f3", libelle: "Déphasage φ3 de I3 sur V3", min: -90, max: 90, pas: 1, valeur: 0, unite: "°" },
    ],
    (lues) => {
      etat.m2 = lues.m2;
      etat.f2 = lues.f2;
      etat.m3 = lues.m3;
      etat.f3 = lues.f3;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Animation : construction de Millman étape par étape
   -------------------------------------------------------------------------- */

function construireConstruction(racine, api) {
  const conteneur = racine.querySelector("#e-construction");
  if (!conteneur) return;

  const ETAPES = [
    "1. Tensions simples de la source",
    "2. Courants Yk Vk avec un neutre parfait",
    "3. Somme IN0 = Σ Yk Vk",
    "4. VN'N = IN0 / Σ Yk",
    "5. Tensions des charges Vk' = Vk - VN'N",
    "Construction terminée",
  ];
  const O1 = { x: 190, y: 180 };
  const O2 = { x: 570, y: 180 };
  const KV = 0.5;
  const etat = { s: 5, r1: 10, r3: 40 };

  const svg = svgEl("svg", {
    viewBox: "0 0 800 400",
    role: "img",
    "aria-label": "Construction du théorème de Millman : à gauche les courants Yk Vk et leur somme, à droite les tensions de la source, la tension de déplacement et les tensions des charges",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-c");
  const fond = svgEl("g");
  const triangle = fondTriangle(O2, KV, false, "fl-e-c");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.35" stroke-dasharray="4 5"><path d="M380 16V330"/></g>' +
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.4"><path d="M40 ' + O1.y + 'H350M' + O1.x + ' 40V320"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12" font-weight="600">' +
    texte(40, 26, "courants, en A") + texte(410, 26, "tensions, en V") + "</g>";
  const triangleG = svgEl("g");
  const tensionsV = [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", "marker-end": "url(#fl-e-c)" }));
  const courants = [0, 1, 2].map(() =>
    svgEl("path", { stroke: "currentColor", "stroke-width": 2.6, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-c)" })
  );
  const chemin = svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", "stroke-dasharray": "2 4" });
  const somme = svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-dasharray": "9 5", "marker-end": "url(#fl-e-c)" });
  const deplacement = svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-dasharray": "9 5", "marker-end": "url(#fl-e-c)" });
  const charges = [0, 1, 2].map(() =>
    svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-c)" })
  );
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, triangleG, ...tensionsV, chemin, ...courants, somme, deplacement, ...charges, libelles);
  conteneur.appendChild(svg);

  const frac = (k) => Math.max(0, Math.min(1, etat.s - k));

  function dessiner() {
    const Y = [cx.inverse(cx.c(etat.r1, 0)), cx.inverse(cx.c(16, 12)), cx.inverse(cx.c(etat.r3, 0))];
    const I = Y.map((y, k) => cx.fois(y, V[k]));
    const iN0 = cx.somme(I);
    const sY = cx.somme(Y);
    const vn = cx.div(iN0, sY);
    const vp = V.map((v) => cx.moins(v, vn));
    const maxI = Math.max(cx.module(iN0), ...I.map((i) => cx.module(i)));
    const ki = Math.min(5, 125 / Math.max(maxI, 1e-6));

    triangleG.innerHTML = frac(0) > 0 ? triangle.html : "";
    triangleG.setAttribute("opacity", String(Math.min(1, frac(0) * 1.5)));
    triangle.sommets.forEach((p, k) => tensionsV[k].setAttribute("d", partiel(O2.x, O2.y, p.x, p.y, frac(0))));

    const ptsI = I.map((i) => px(O1, ki, i));
    ptsI.forEach((p, k) => courants[k].setAttribute("d", partiel(O1.x, O1.y, p.x, p.y, frac(1))));
    const a = px(O1, ki, I[0]);
    const b = px(O1, ki, cx.plus(I[0], I[1]));
    const c = px(O1, ki, iN0);
    chemin.setAttribute(
      "d",
      frac(2) > 0
        ? "M" + a.x.toFixed(1) + " " + a.y.toFixed(1) + "L" + b.x.toFixed(1) + " " + b.y.toFixed(1) + "L" + c.x.toFixed(1) + " " + c.y.toFixed(1)
        : ""
    );
    somme.setAttribute("d", partiel(O1.x, O1.y, c.x, c.y, frac(2)));

    const pN = px(O2, KV, vn);
    deplacement.setAttribute("d", partiel(O2.x, O2.y, pN.x, pN.y, frac(3)));
    triangle.sommets.forEach((p, k) => charges[k].setAttribute("d", partiel(pN.x, pN.y, p.x, p.y, frac(4))));

    let t = "";
    if (frac(1) >= 1) {
      ptsI.forEach((p, k) => {
        const q = decale(p, 14, cx.argument(I[k]));
        t += texte(q.x - 14, q.y + 4, "Y" + (k + 1) + "V" + (k + 1));
      });
      t += texte(40, 300, "échelle : " + nombre(api, 50 / ki, 1) + " A pour 50 px", ' font-size="11"');
    }
    if (frac(2) >= 1) t += texte(c.x + 8, c.y + 16, "IN0", ' font-weight="600"');
    if (frac(3) >= 1) t += texte(pN.x + 8, pN.y - 8, "N'", ' font-weight="600"');
    const idx = Math.min(ETAPES.length - 1, Math.floor(etat.s + 1e-6));
    t += texte(40, 346, ETAPES[idx], ' font-weight="600"');
    let ligne = "R1 = " + nombre(api, etat.r1, 1) + " Ω ; Z2 = 16 + j12 Ω ; R3 = " + nombre(api, etat.r3, 1) + " Ω";
    if (frac(2) >= 1) ligne += " ; IN0 = " + nombre(api, cx.module(iN0), 2) + " A à " + nombre(api, cx.argument(iN0), 1) + "°";
    t += texte(40, 368, ligne);
    if (frac(3) >= 1) {
      let ligne2 =
        "Σ Yk = " + nombre(api, sY.re, 4) + (sY.im < 0 ? " - j" : " + j") + nombre(api, Math.abs(sY.im), 4) + " S ; VN'N = " +
        nombre(api, cx.module(vn), 1) + " V à " + nombre(api, cx.argument(vn), 1) + "°";
      if (frac(4) >= 1) ligne2 += " ; V' : " + vp.map((v) => nombre(api, cx.module(v), 1)).join(" ; ") + " V";
      t += texte(40, 390, ligne2);
    }
    libelles.innerHTML = t;
  }

  const curseurs = api.sim.curseurs(
    "#e-construction-curseurs",
    [
      { id: "r1", libelle: "Résistance R1 de la phase 1", min: 2, max: 100, pas: 1, valeur: 10, unite: "Ω" },
      { id: "r3", libelle: "Résistance R3 de la phase 3", min: 2, max: 100, pas: 1, valeur: 40, unite: "Ω" },
    ],
    (lues) => {
      etat.r1 = lues.r1;
      etat.r3 = lues.r3;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-construction-lecteur", {
    de: 0,
    a: 5,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Construire la tension de déplacement étape par étape",
    rappel(valeur) {
      etat.s = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    /* La figure s'affiche complète tant que l'apprenant n'a pas lancé la construction. */
    lecteur.suivre(5);
    etat.s = 5;
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : le point étoile et les tensions des charges
   -------------------------------------------------------------------------- */

const ETATS_NEUTRE = [
  { zn: 0, nom: "relié, impédance nulle" },
  { zn: 0.1, nom: "0,1 Ω" },
  { zn: 0.3, nom: "0,3 Ω" },
  { zn: 1, nom: "1 Ω" },
  { zn: 3, nom: "3 Ω" },
  { zn: 10, nom: "10 Ω" },
  { zn: Infinity, nom: "rompu" },
];

function construirePointSim(racine, api) {
  const conteneur = racine.querySelector("#e-point");
  if (!conteneur) return;

  const O = { x: 230, y: 200 };
  const K = 0.42;
  const CADRE = { x1: 24, y1: 22, x2: 436, y2: 382 };
  const BARRES = { x: [520, 600, 680], y0: 350, k: 0.5, max: 600 };
  const etat = { s: [5.3, 2.65, 1.3], phi: [0, 37, 0], neutre: 6 };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 400",
    role: "img",
    "aria-label": "Point commun N' d'une charge étoile déséquilibrée dans le triangle des tensions, avec les tensions des trois charges en barres",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-p");
  const fond = svgEl("g");
  const triangle = fondTriangle(O, K, true, "fl-e-p");
  const y230 = BARRES.y0 - 230 * BARRES.k;
  const y400 = BARRES.y0 - 400 * BARRES.k;
  fond.innerHTML =
    triangle.html +
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.3"><rect x="' + CADRE.x1 + '" y="' + CADRE.y1 + '" width="' +
    (CADRE.x2 - CADRE.x1) + '" height="' + (CADRE.y2 - CADRE.y1) + '" rx="8"/></g>' +
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7"><path d="M480 ' + BARRES.y0 + 'H720"/></g>' +
    '<g stroke="currentColor" stroke-width="1.3" fill="none" stroke-dasharray="7 5"><path d="M480 ' + y230 + 'H720"/></g>' +
    '<g stroke="currentColor" stroke-width="1.3" fill="none" stroke-dasharray="2 4"><path d="M480 ' + y400 + 'H720"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5">' +
    texte(724, y230 + 4, "230") + texte(724, y400 + 4, "400") +
    texte(BARRES.x[0], 370, "V1'", ' text-anchor="middle"') + texte(BARRES.x[1], 370, "V2'", ' text-anchor="middle"') +
    texte(BARRES.x[2], 370, "V3'", ' text-anchor="middle"') + texte(486, 30, "tensions des charges, V") + "</g>";
  const deplacement = svgEl("path", { stroke: "currentColor", "stroke-width": 2.6, fill: "none", "stroke-dasharray": "8 5", "marker-end": "url(#fl-e-p)" });
  const tensions = [0, 1, 2].map(() =>
    svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-p)" })
  );
  const point = svgEl("circle", { r: 5.5, fill: "currentColor" });
  const barres = [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "currentColor", "fill-opacity": 0.22 }));
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  svg.append(defs, fond, deplacement, ...tensions, point, ...barres, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-point-valeurs", [
    { id: "v1", libelle: "V1'", unite: "V", decimales: 1 },
    { id: "v2", libelle: "V2'", unite: "V", decimales: 1 },
    { id: "v3", libelle: "V3'", unite: "V", decimales: 1 },
    { id: "vn", libelle: "Tension de déplacement VN'N", unite: "V", decimales: 1 },
    { id: "in", libelle: "Courant du neutre IN", unite: "A", decimales: 2 },
    { id: "p", libelle: "Puissance active des charges", unite: "kW", decimales: 2 },
    { id: "q", libelle: "Puissance réactive des charges", unite: "kvar", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const Y = [0, 1, 2].map((k) => admittance(etat.s[k], etat.phi[k]));
    const zn = ETATS_NEUTRE[etat.neutre].zn;
    const yN = zn === 0 ? Infinity : Number.isFinite(zn) ? 1 / zn : 0;
    const r = resoudreEtoile(Y, yN);
    const brut = px(O, K, r.vn);
    const pN = dansCadre(brut, CADRE);
    point.setAttribute("cx", pN.x.toFixed(1));
    point.setAttribute("cy", pN.y.toFixed(1));
    deplacement.setAttribute("d", segment(O.x, O.y, pN.x, pN.y, pN.rogne ? 0.1 : 3));
    triangle.sommets.forEach((p, k) => tensions[k].setAttribute("d", segment(pN.x, pN.y, p.x, p.y)));

    const modules = r.vp.map((v) => cx.module(v));
    let t = texte(pN.x + 9, pN.y - 9, pN.rogne ? "N' hors cadre" : "N'", ' font-weight="600"');
    if (cx.module(r.vn) > 12 && !pN.rogne) t += texte((O.x + pN.x) / 2 + 6, (O.y + pN.y) / 2 + 16, "VN'N", ' font-size="11"');
    modules.forEach((m, k) => {
      const h = Math.min(BARRES.max, m) * BARRES.k;
      barres[k].setAttribute("d", barre(BARRES.x[k], BARRES.y0, h, 46));
      t += texte(BARRES.x[k], Math.max(44, BARRES.y0 - h - 8), nombre(api, m, 0) + (m > BARRES.max ? "+" : ""), ' text-anchor="middle" font-size="11.5"');
    });
    t += texte(30, 396, "neutre : " + ETATS_NEUTRE[etat.neutre].nom, ' font-size="11.5"');
    libelles.innerHTML = t;

    const courantN = yN === Infinity ? cx.module(r.iN) : yN * cx.module(r.vn);
    if (valeurs) {
      valeurs.maj({
        v1: modules[0],
        v2: modules[1],
        v3: modules[2],
        vn: cx.module(r.vn),
        in: courantN,
        p: r.p / 1000,
        q: r.q / 1000,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-point-curseurs",
    [
      { id: "s1", libelle: "Phase 1 : puissance apparente sous 230 V", min: 0, max: 10, pas: 0.05, valeur: 5.3, unite: "kVA", chiffres: 2 },
      { id: "f1", libelle: "Phase 1 : argument φ1 de l'impédance", min: -90, max: 90, pas: 1, valeur: 0, unite: "°" },
      { id: "s2", libelle: "Phase 2 : puissance apparente sous 230 V", min: 0, max: 10, pas: 0.05, valeur: 2.65, unite: "kVA", chiffres: 2 },
      { id: "f2", libelle: "Phase 2 : argument φ2 de l'impédance", min: -90, max: 90, pas: 1, valeur: 37, unite: "°" },
      { id: "s3", libelle: "Phase 3 : puissance apparente sous 230 V", min: 0, max: 10, pas: 0.05, valeur: 1.3, unite: "kVA", chiffres: 2 },
      { id: "f3", libelle: "Phase 3 : argument φ3 de l'impédance", min: -90, max: 90, pas: 1, valeur: 0, unite: "°" },
      { id: "neutre", libelle: "État du neutre", min: 0, max: 6, pas: 1, valeur: 6, format: (v) => ETATS_NEUTRE[Math.round(v)].nom },
    ],
    (lues) => {
      etat.s = [lues.s1, lues.s2, lues.s3];
      etat.phi = [lues.f1, lues.f2, lues.f3];
      etat.neutre = Math.round(lues.neutre);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   H. Animation : courants instantanés et courant du neutre
   -------------------------------------------------------------------------- */

function construireChrono(racine, api) {
  const Y = [cx.inverse(cx.c(10, 0)), cx.inverse(cx.c(16, 12)), cx.inverse(cx.c(40, 0))];
  const etat = { t: 40, neutre: 1 };
  let sol = resoudreEtoile(Y, Infinity);

  const inst = (z) => (tms) => Math.SQRT2 * cx.module(z) * Math.cos(W50 * (tms / 1000) + cx.argument(z) * DEG);
  const courants = () => [inst(sol.i[0]), inst(sol.i[1]), inst(sol.i[2])];

  const trace = api.sim.traceur("#h-chrono-trace", {
    titre: "Courants instantanés de l'exemple et courant du neutre",
    genre: "Animation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "courant",
    yUnite: "A",
    xMin: 0,
    xMax: 40,
    yMin: -36,
    yMax: 36,
    ratio: 0.42,
    echantillons: 500,
    series: [
      { id: "i1", nom: "i1, chauffage", couleur: "serie-1", epaisseur: 2 },
      { id: "i2", nom: "i2, climatisation", couleur: "serie-3", epaisseur: 2 },
      { id: "i3", nom: "i3, éclairage", couleur: "serie-4", epaisseur: 2 },
      { id: "in", nom: "iN = i1 + i2 + i3", couleur: "serie-5", epaisseur: 3.4 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
      ligneV(c, repere, couleurs, etat.t, "instant");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#h-chrono-valeurs", [
    { id: "t", libelle: "Instant t", unite: "ms", decimales: 2 },
    { id: "i1", libelle: "i1", unite: "A", decimales: 2 },
    { id: "i2", libelle: "i2", unite: "A", decimales: 2 },
    { id: "i3", libelle: "i3", unite: "A", decimales: 2 },
    { id: "som", libelle: "i1 + i2 + i3", unite: "A", decimales: 2 },
    { id: "in", libelle: "iN mesuré dans le neutre", unite: "A", decimales: 2 },
    { id: "eff", libelle: "IN efficace", unite: "A", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    sol = resoudreEtoile(Y, etat.neutre ? Infinity : 0);
    const f = courants();
    if (trace) {
      trace.definirFonction("i1", f[0]);
      trace.definirFonction("i2", f[1]);
      trace.definirFonction("i3", f[2]);
      trace.definirFonction("in", (tms) => (etat.neutre ? f[0](tms) + f[1](tms) + f[2](tms) : 0));
      trace.demanderRendu();
    }
    if (valeurs) {
      const a = f.map((g) => g(etat.t));
      const som = a[0] + a[1] + a[2];
      valeurs.maj({
        t: etat.t,
        i1: a[0],
        i2: a[1],
        i3: a[2],
        som,
        in: etat.neutre ? som : 0,
        eff: etat.neutre ? cx.module(sol.iN) : 0,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#h-chrono-curseurs",
    [{ id: "neutre", libelle: "État du neutre", min: 0, max: 1, pas: 1, valeur: 1, format: (v) => (v > 0.5 ? "relié" : "rompu") }],
    (lues) => {
      etat.neutre = lues.neutre > 0.5 ? 1 : 0;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#h-chrono-lecteur", {
    de: 0,
    a: 40,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Faire avancer l'instant repère sur deux périodes",
    rappel(valeur) {
      etat.t = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.suivre(5);
    etat.t = 5;
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   I. Simulation : répartition des charges monophasées de l'atelier
   -------------------------------------------------------------------------- */

const ATELIER = [
  { id: "m", nom: "machines", s: cx.c(2400, 2400 * Math.tan(Math.acos(0.75))) },
  { id: "l", nom: "éclairage LED", s: cx.c(600, -600 * Math.tan(Math.acos(0.95))) },
  { id: "c", nom: "chauffe-eau", s: cx.c(3000, 0) },
];
/* Reste du site par phase, rapporté à V1 : 21,6 kW et 3,69 kvar sous 230 V. */
const BASE_SITE = cx.conj(cx.div(cx.c(21600, 3690), cx.c(VS, 0)));
/* Éclairage et prises du site, entre phase et neutre, par phase. */
const ECLAIRAGE_SITE = cx.c(3500, 1150);
const I_ASSIGNE = 100000 / (Math.sqrt(3) * 400);

function etudeAtelier(phases) {
  const S = [cx.c(0, 0), cx.c(0, 0), cx.c(0, 0)];
  ATELIER.forEach((charge, n) => {
    S[phases[n]] = cx.plus(S[phases[n]], charge.s);
  });
  const Ia = S.map((s, k) => cx.conj(cx.div(s, V[k])));
  const iN = cx.somme(Ia);
  const rot = [cx.polaire(1, 0), cx.polaire(1, -120), cx.polaire(1, 120)];
  const It = Ia.map((i, k) => cx.plus(cx.fois(BASE_SITE, rot[k]), i));
  const Y = S.map((s) => cx.echelle(cx.conj(cx.plus(ECLAIRAGE_SITE, s)), 1 / (VS * VS)));
  const rupture = resoudreEtoile(Y, 0);
  return { iN: cx.module(iN), It: It.map((i) => cx.module(i)), vr: rupture.vp.map((v) => cx.module(v)) };
}

function construireRepartition(racine, api) {
  const conteneur = racine.querySelector("#i-repartition");
  if (!conteneur) return;

  const GAUCHE = { x: [60, 130, 200, 270], y0: 300, k: 1.4 };
  const DROITE = { x: [470, 560, 650], y0: 300, k: 0.6, max: 340 };
  const etat = { phases: [0, 1, 2] };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 350",
    role: "img",
    "aria-label": "Courants des phases et du neutre au tableau général, et tensions des charges entre phase et neutre en cas de rupture du neutre, selon la répartition des usages de l'atelier",
  });
  const yAss = GAUCHE.y0 - I_ASSIGNE * GAUCHE.k;
  const y230 = DROITE.y0 - 230 * DROITE.k;
  const y253 = DROITE.y0 - 253 * DROITE.k;
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7"><path d="M24 ' + GAUCHE.y0 + 'H310M430 ' + DROITE.y0 + 'H700"/></g>' +
    '<g stroke="currentColor" stroke-width="1.3" fill="none" stroke-dasharray="7 5"><path d="M24 ' + yAss.toFixed(1) + 'H310M430 ' + y230 + 'H700"/></g>' +
    '<g stroke="currentColor" stroke-width="1.3" fill="none" stroke-dasharray="2 4"><path d="M430 ' + y253.toFixed(1) + 'H700"/></g>' +
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.35" stroke-dasharray="4 5"><path d="M370 20V330"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5">' +
    texte(24, 28, "courants au tableau général, A", ' font-weight="600"') +
    texte(430, 28, "tensions si le neutre se rompait, V", ' font-weight="600"') +
    texte(312, yAss + 4, "144,3") + texte(704, y230 + 4, "230") + texte(704, y253 + 4, "253") +
    ["L1", "L2", "L3", "N"].map((n, k) => texte(GAUCHE.x[k], 320, n, ' text-anchor="middle"')).join("") +
    ["V1'", "V2'", "V3'"].map((n, k) => texte(DROITE.x[k], 320, n, ' text-anchor="middle"')).join("") +
    "</g>";
  const barresG = [0, 1, 2, 3].map((k) =>
    svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "currentColor", "fill-opacity": k === 3 ? 0.45 : 0.22 })
  );
  const barresD = [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "currentColor", "fill-opacity": 0.22 }));
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  svg.append(fond, ...barresG, ...barresD, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#i-repartition-valeurs", [
    { id: "in", libelle: "Courant du neutre dû à l'atelier", unite: "A", decimales: 2 },
    { id: "i1", libelle: "Phase L1 au tableau", unite: "A", decimales: 1 },
    { id: "i2", libelle: "Phase L2 au tableau", unite: "A", decimales: 1 },
    { id: "i3", libelle: "Phase L3 au tableau", unite: "A", decimales: 1 },
    { id: "taux", libelle: "Phase la plus chargée, part du courant assigné", unite: "%", decimales: 1 },
    { id: "vmax", libelle: "Plus haute tension en cas de rupture", unite: "V", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const r = etudeAtelier(etat.phases);
    const gauche = [...r.It, r.iN];
    let t = "";
    gauche.forEach((i, k) => {
      const h = i * GAUCHE.k;
      barresG[k].setAttribute("d", barre(GAUCHE.x[k], GAUCHE.y0, h, 40));
      t += texte(GAUCHE.x[k], GAUCHE.y0 - h - 6, nombre(api, i, 1), ' text-anchor="middle"');
    });
    r.vr.forEach((v, k) => {
      const h = Math.min(DROITE.max, v) * DROITE.k;
      barresD[k].setAttribute("d", barre(DROITE.x[k], DROITE.y0, h, 46));
      t += texte(DROITE.x[k], DROITE.y0 - h - 6, nombre(api, v, 1), ' text-anchor="middle"');
    });
    const noms = ATELIER.map((c, n) => c.nom + " sur L" + (etat.phases[n] + 1));
    t += texte(24, 344, "répartition : " + noms.join(", "));
    libelles.innerHTML = t;
    if (valeurs) {
      valeurs.maj({
        in: r.iN,
        i1: r.It[0],
        i2: r.It[1],
        i3: r.It[2],
        taux: (Math.max(...r.It) / I_ASSIGNE) * 100,
        vmax: Math.max(...r.vr),
      });
    }
  }

  const format = (v) => "L" + Math.round(v);
  const curseurs = api.sim.curseurs(
    "#i-repartition-curseurs",
    [
      { id: "m", libelle: "Machines d'atelier, 2,4 kW à cos φ 0,75", min: 1, max: 3, pas: 1, valeur: 1, format },
      { id: "l", libelle: "Éclairage LED, 0,6 kW à cos φ 0,95 capacitif", min: 1, max: 3, pas: 1, valeur: 2, format },
      { id: "c", libelle: "Chauffe-eau, 3 kW résistif", min: 1, max: 3, pas: 1, valeur: 3, format },
    ],
    (lues) => {
      etat.phases = [Math.round(lues.m) - 1, Math.round(lues.l) - 1, Math.round(lues.c) - 1];
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-neutre-resistif",
      titre: "Courant du neutre de trois charges résistives",
      niveau: "fondamental",
      enonce:
        "<p>Trois charges résistives sont alimentées entre phase et neutre sous $230/400\\ \\mathrm{V}$ : $4{,}6\\ \\mathrm{kW}$ sur $L_1$, " +
        "$2{,}3\\ \\mathrm{kW}$ sur $L_2$ et $2{,}3\\ \\mathrm{kW}$ sur $L_3$. Le neutre est relié et d'impédance négligeable. Quel courant " +
        "efficace circule dans le neutre ?</p>",
      valeur: 10,
      unite: "A",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Courant du neutre $I_N$",
      etapes: [
        { texte: "Neutre parfait : chaque charge reçoit $230\\ \\mathrm{V}$. Courants : $I_1 = 4600/230 = 20\\ \\mathrm{A}$, $I_2 = I_3 = 2300/230 = 10\\ \\mathrm{A}$, tous en phase avec leur tension." },
        { texte: "Même déphasage sur les trois phases : $I_N = \\sqrt{I_1^2 + I_2^2 + I_3^2 - I_1I_2 - I_2I_3 - I_3I_1} = \\sqrt{400 + 100 + 100 - 200 - 100 - 200}$." },
        {
          texte: "$I_N = \\sqrt{100} = 10\\ \\mathrm{A}$, en phase avec $\\underline{V}_1$.",
          note: "Lecture directe : $10\\ \\mathrm{A}$ sur chaque phase forment un système équilibré de somme nulle ; il ne reste que les $10\\ \\mathrm{A}$ en excès sur $L_1$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Somme des trois courants",
          unite: "A",
          somme: true,
          nomSomme: "IN = 10 A à 0 degré",
          vecteurs: [
            { id: "i1", nom: "I1", amplitude: 20, phase: 0, couleur: "serie-1" },
            { id: "i2", nom: "I2", amplitude: 10, phase: -120, couleur: "serie-3" },
            { id: "i3", nom: "I3", amplitude: 10, phase: 120, couleur: "serie-4" },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-triangle",
      titre: "Charge monophasée entre deux phases",
      niveau: "fondamental",
      enonce:
        "<p>Un four résistif de $8\\ \\mathrm{kW}$ sous $400\\ \\mathrm{V}$ est branché entre $L_1$ et $L_2$ ; rien d'autre n'est raccordé. " +
        "Quel courant efficace circule dans le conducteur $L_1$ ? On prendra $U = 400\\ \\mathrm{V}$.</p>",
      valeur: 20,
      unite: "A",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Courant de ligne $I_1$",
      etapes: [
        { texte: "C'est un triangle réduit à la seule branche $Z_{12}$ : $J_{12} = P/U = 8000/400 = 20\\ \\mathrm{A}$, en phase avec $\\underline{U}_{12}$, à $30^\\circ$." },
        { texte: "Loi des nœuds : $\\underline{I}_1 = \\underline{J}_{12} - \\underline{J}_{31} = \\underline{J}_{12}$, $\\underline{I}_2 = -\\underline{J}_{12}$, $\\underline{I}_3 = 0$." },
        {
          texte: "$I_1 = I_2 = 20\\ \\mathrm{A}$ et $I_3 = 0$ ; aucun neutre n'est concerné.",
          note: "Branché en $230\\ \\mathrm{V}$ entre $L_1$ et le neutre, le même four de $8\\ \\mathrm{kW}$ appellerait $34{,}8\\ \\mathrm{A}$ sur une seule phase et autant dans le neutre.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Courants de ligne d'une charge entre L1 et L2",
          unite: "A",
          vecteurs: [
            { id: "i1", nom: "I1 = J12", amplitude: 20, phase: 30, couleur: "serie-1" },
            { id: "i2", nom: "I2 = -J12", amplitude: 20, phase: -150, couleur: "serie-5", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-four-rompu",
      titre: "Rupture du neutre d'un four déséquilibré",
      niveau: "intermédiaire",
      enonce:
        "<p>Un four est formé de trois résistances couplées en étoile sur un réseau $230/400\\ \\mathrm{V}$ : $26{,}45\\ \\Omega$ sur $L_1$ " +
        "($2\\ \\mathrm{kW}$ sous $230\\ \\mathrm{V}$), $52{,}9\\ \\Omega$ sur $L_2$ et $52{,}9\\ \\mathrm{\\Omega}$ sur $L_3$ ($1\\ \\mathrm{kW}$ chacune). " +
        "Le neutre se rompt. Quelle tension efficace reçoit la résistance de la phase 2 ?</p>",
      valeur: 263.5,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension $V_2'$",
      etapes: [
        { texte: "Conductances : $G_1 = 2G$, $G_2 = G_3 = G$ avec $G = 1/52{,}9\\ \\mathrm{S}$. Méthode : Millman avec $\\underline{Y}_N = 0$." },
        { texte: "$\\underline{V}_{N'N} = \\dfrac{2G\\underline{V}_1 + G\\underline{V}_2 + G\\underline{V}_3}{4G} = \\dfrac{2\\underline{V}_1 - \\underline{V}_1}{4} = \\dfrac{\\underline{V}_1}{4} = 57{,}5\\ \\mathrm{V}$, puisque $\\underline{V}_2 + \\underline{V}_3 = -\\underline{V}_1$." },
        { texte: "$\\underline{V}_2' = \\underline{V}_2 - \\underline{V}_{N'N} = (-115 - 57{,}5) - j199{,}19 = -172{,}5 - j199{,}19\\ \\mathrm{V}$." },
        {
          texte: "$V_2' = \\sqrt{172{,}5^2 + 199{,}19^2} = 263{,}5\\ \\mathrm{V}$, soit $+14{,}6\\ \\%$ ; de même $V_3' = 263{,}5\\ \\mathrm{V}$ et $V_1' = 172{,}5\\ \\mathrm{V}$.",
          note: "Puissance totale : $172{,}5^2/26{,}45 + 2 \\times 263{,}5^2/52{,}9 = 1125 + 2625 = 3750\\ \\mathrm{W}$, contre $4000\\ \\mathrm{W}$ avec le neutre.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "V2' = V2 - VN'N",
          unite: "V",
          somme: true,
          nomSomme: "V2' = 263,5 V à -130,9 degrés",
          vecteurs: [
            { id: "v2", nom: "V2", amplitude: 230, phase: -120, couleur: "serie-3" },
            { id: "mvn", nom: "-VN'N, opposé du déplacement", amplitude: 57.5, phase: 180, couleur: "serie-5", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-neutre-degrade",
      titre: "Connexion de neutre dégradée",
      niveau: "intermédiaire",
      enonce:
        "<p>Le tableau de l'exemple de la section H, $\\underline{Z}_1 = 10\\ \\Omega$, $\\underline{Z}_2 = 16 + j12\\ \\Omega$, " +
        "$\\underline{Z}_3 = 40\\ \\Omega$, a une borne de neutre desserrée, modélisée par $Z_N = 1\\ \\Omega$. Avec neutre parfait, " +
        "$\\sum \\underline{Y}_k\\underline{V}_k = 9{,}549 + j0{,}462\\ \\mathrm{A}$ et $\\sum\\underline{Y}_k = 0{,}165 - j0{,}030\\ \\mathrm{S}$. " +
        "Quelles affirmations sont exactes ?</p>",
      options: [
        { texte: "La tension de déplacement vaut environ $8{,}2\\ \\mathrm{V}$.", juste: true },
        { texte: "La charge de la phase 1 ne reçoit plus que $221{,}8\\ \\mathrm{V}$ environ.", juste: true },
        { texte: "Le courant du neutre reste égal à $9{,}56\\ \\mathrm{A}$." },
        { texte: "La tension composée entre $L_1$ et $L_2$, mesurée aux bornes du tableau, diminue." },
        { texte: "La borne défectueuse dissipe environ $67\\ \\mathrm{W}$.", juste: true },
      ],
      etapes: [
        { texte: "Millman avec $\\underline{Y}_N = 1\\ \\mathrm{S}$ : $\\underline{V}_{N'N} = \\dfrac{9{,}549 + j0{,}462}{1{,}165 - j0{,}030} = 8{,}20\\ \\mathrm{V}$ à $4{,}25^\\circ$." },
        { texte: "$\\underline{V}_1' = 230 - 8{,}18 - j0{,}61$, soit $221{,}8\\ \\mathrm{V}$ ; de même $V_2' = 234{,}7\\ \\mathrm{V}$ et $V_3' = 233{,}7\\ \\mathrm{V}$." },
        { texte: "Courant du neutre : $\\underline{Y}_N\\underline{V}_{N'N}$, soit $8{,}20\\ \\mathrm{A}$, un peu moins que $9{,}56\\ \\mathrm{A}$ ; puissance dans la borne : $8{,}20^2 \\times 1 = 67\\ \\mathrm{W}$." },
        {
          texte: "Les tensions composées restent imposées par la source : seules les tensions entre phase et point commun changent.",
          note: "Une borne qui chauffe de $67\\ \\mathrm{W}$ se dégrade encore : $Z_N$ augmente, et le déplacement avec elle.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        courbesNeutreExemple(moteur, conteneur, "Tensions des charges en fonction de l'impédance du neutre", 1);
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-ordre-phases",
      titre: "Indicateur d'ordre des phases à condensateur",
      niveau: "avancé",
      enonce:
        "<p>Un indicateur d'ordre des phases est formé d'un condensateur sur $L_1$ et de deux lampes identiques sur $L_2$ et $L_3$, couplés " +
        "en étoile sans neutre. Les lampes sont modélisées par des résistances $R$ égales à la réactance $1/(C\\omega)$ du condensateur. " +
        "Le réseau $230/400\\ \\mathrm{V}$ est en ordre direct. Quelle tension efficace reçoit la lampe de la phase 2 ?</p>",
      valeur: 344.2,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension $V_2'$",
      etapes: [
        { texte: "Admittances, en unités de $G = 1/R$ : $\\underline{Y}_1 = jG$, $\\underline{Y}_2 = \\underline{Y}_3 = G$ ; neutre absent." },
        { texte: "Millman : $\\underline{V}_{N'N} = \\dfrac{j\\underline{V}_1 + \\underline{V}_2 + \\underline{V}_3}{2 + j} = \\underline{V}_1\\dfrac{-1 + j}{2 + j} = \\underline{V}_1\\dfrac{-1 + 3j}{5}$." },
        { texte: "$\\underline{V}_{N'N} = 230(-0{,}2 + j0{,}6) = -46 + j138\\ \\mathrm{V}$, soit $145{,}5\\ \\mathrm{V}$ à $108{,}4^\\circ$." },
        { texte: "$\\underline{V}_2' = (-115 + 46) - j(199{,}19 + 138) = -69 - j337{,}19$, soit $344{,}2\\ \\mathrm{V}$ ; $\\underline{V}_3' = -69 + j61{,}19$, soit $92{,}2\\ \\mathrm{V}$." },
        {
          texte: "La lampe de $L_2$, phase qui suit celle du condensateur dans l'ordre direct, brille ; celle de $L_3$ est presque éteinte, avec un rapport de puissances de $(344{,}2/92{,}2)^2 = 13{,}9$.",
          note: "Avec des lampes de $230\\ \\mathrm{V}$, la lampe brillante serait en surtension de $50\\ \\%$ : on en met deux en série par branche, ou des résistances dimensionnées pour $400\\ \\mathrm{V}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Tensions de l'indicateur d'ordre des phases",
          unite: "V",
          vecteurs: [
            { id: "vc", nom: "VC, condensateur sur L1", amplitude: 308.6, phase: -26.57, couleur: "serie-4" },
            { id: "v2", nom: "V2', lampe sur L2, brillante", amplitude: 344.2, phase: -101.57, couleur: "serie-1" },
            { id: "v3", nom: "V3', lampe sur L3, faible", amplitude: 92.2, phase: 138.43, couleur: "serie-3" },
            { id: "vn", nom: "VN'N, déplacement", amplitude: 145.5, phase: 108.43, couleur: "serie-5", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Des appareils détruits sur deux phases",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Après des travaux de voirie, les occupants d'un bâtiment signalent des alimentations de bureautique détruites sur les circuits " +
        "de $L_2$ et $L_3$ et un éclairage très faible sur $L_1$, où sont branchés les radiateurs. Au tableau, on mesure entre phase et " +
        "neutre $128$, $290$ et $299\\ \\mathrm{V}$, entre phases $399$, $398$ et $398\\ \\mathrm{V}$, et un courant de neutre nul alors que " +
        "les circuits monophasés sont en service. Quelles conclusions et actions sont justifiées ?</p>",
      options: [
        { texte: "Le neutre est interrompu en amont du tableau.", juste: true },
        { texte: "La phase $L_1$ est la plus chargée du tableau.", juste: true },
        { texte: "Le transformateur a perdu une phase." },
        { texte: "Un court-circuit entre $L_2$ et $L_3$ explique les surtensions." },
        { texte: "Il faut ouvrir les départs monophasés sensibles, puis rechercher la coupure du neutre hors tension.", juste: true },
      ],
      etapes: [
        { texte: "Les tensions composées sont normales : la source et les phases sont saines, ce qui exclut une phase perdue ou un court-circuit." },
        { texte: "Les tensions simples sont très inégales et le neutre ne porte aucun courant malgré des charges monophasées : le point commun flotte, c'est une rupture du neutre." },
        { texte: "La tension la plus basse est sur $L_1$ : le point commun s'est rapproché du sommet $V_1$, donc $L_1$ a la plus forte admittance, celle des radiateurs." },
        {
          texte: "Exemple compatible : charges de $8$, $25$ et $30\\ \\Omega$, qui donnent $127{,}7$, $290{,}4$ et $299{,}4\\ \\mathrm{V}$, avec $\\underline{V}_{N'N} = 102{,}7\\ \\mathrm{V}$.",
          note: "Mise en sécurité d'abord : les appareils encore intacts des phases en surtension sont en danger tant que le neutre n'est pas rétabli.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Tensions des charges, neutre rompu, charges de 8, 25 et 30 ohms",
          unite: "V",
          vecteurs: [
            { id: "v1", nom: "V1', radiateurs", amplitude: 127.7, phase: 3.0, couleur: "serie-1" },
            { id: "v2", nom: "V2'", amplitude: 290.4, phase: -138.48, couleur: "serie-3" },
            { id: "v3", nom: "V3'", amplitude: 299.4, phase: 136.56, couleur: "serie-4" },
            { id: "vn", nom: "VN'N, déplacement vers V1", amplitude: 102.7, phase: -3.74, couleur: "serie-5", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Pourquoi ne jamais couper le neutre seul",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi un appareil de protection ou de coupure ne doit jamais ouvrir le neutre seul en laissant " +
        "les phases sous tension, alors qu'ouvrir les phases avec le neutre ne pose pas ce problème.</p>",
      motsCles: [
        ["rupture", "coupure", "coupe", "ouvert", "interromp", "sans neutre"],
        ["deplac", "point", "barycentre", "millman", "flotte"],
        ["surtension", "monte", "400", "augmente", "superieure", "eleve"],
      ],
      minimum: 2,
      exemple: "Deux ou trois phrases : que devient le point commun, et quelles phases en souffrent ?",
      etapes: [
        { texte: "Neutre ouvert, phases fermées : les charges monophasées d'un même tableau restent alimentées, mais en étoile sans neutre." },
        { texte: "Leur point commun se place au barycentre des sommets pondérés par les admittances : il se déplace vers la phase la plus chargée." },
        { texte: "Les phases peu chargées reçoivent une tension qui peut approcher $400\\ \\mathrm{V}$, sans qu'aucun courant anormal ne fasse déclencher une protection." },
        {
          texte: "Ouvrir les phases avec le neutre supprime toute tension : il n'y a plus de point commun à déplacer.",
          note: "D'où les règles de conception courantes : neutre coupé en même temps ou après les phases, rétabli avant, jamais protégé seul ; à vérifier dans le référentiel applicable.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        courbesNeutreExemple(moteur, conteneur, "Exemple de la section H : la rupture est le cas limite d'un neutre de plus en plus impédant", null);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

function dessinPointsQuiz() {
  const O = { x: 200, y: 130 };
  const k = 0.42;
  const s = V.map((v) => px(O, k, v));
  let d = '<g stroke="currentColor" stroke-width="1.6" fill="none"><path d="M' + s[0].x.toFixed(1) + " " + s[0].y.toFixed(1) + "L" +
    s[1].x.toFixed(1) + " " + s[1].y.toFixed(1) + "L" + s[2].x.toFixed(1) + " " + s[2].y.toFixed(1) + 'Z"/></g>';
  const a = px(O, k, cx.polaire(70, 0));
  const b = px(O, k, cx.polaire(70, 180));
  const c = px(O, k, cx.polaire(70, -120));
  d += '<g fill="currentColor" stroke="none"><circle cx="' + O.x + '" cy="' + O.y + '" r="3"/>';
  for (const p of [a, b, c]) d += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="5"/>';
  d += "</g>";
  d += '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';
  d += texte(s[0].x + 8, s[0].y + 4, "V1") + texte(s[1].x - 24, s[1].y + 14, "V2") + texte(s[2].x - 24, s[2].y - 6, "V3");
  d += texte(O.x - 14, O.y + 16, "N");
  d += texte(a.x - 4, a.y - 10, "a") + texte(b.x - 4, b.y - 10, "b") + texte(c.x + 8, c.y + 4, "c");
  d += "</g>";
  return { dessin: d, a, b, c };
}

function construireQuiz(racine, api) {
  const points = dessinPointsQuiz();
  const zone = (p, etiquette, juste) => ({ x: p.x - 18, y: p.y - 18, largeur: 36, hauteur: 36, etiquette, juste });
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Trois charges résistives identiques de $16\\ \\mathrm{A}$, une par phase, sont alimentées avec neutre. Quel courant circule dans le neutre ?</p>",
        options: ["$0\\ \\mathrm{A}$", "$16\\ \\mathrm{A}$", "$27{,}7\\ \\mathrm{A}$", "$48\\ \\mathrm{A}$"],
        bonnes: [0],
        explication: "Trois phaseurs de même module décalés de $120^\\circ$ ont une somme nulle : $1 + a + a^2 = 0$.",
        resume: "Neutre d'une charge équilibrée",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Deux phases chargées à $16\\ \\mathrm{A}$ résistifs et la troisième à vide font circuler $32\\ \\mathrm{A}$ dans le neutre.</p>",
        reponse: false,
        explication: "$|1 + a^2| = 1$ : le neutre porte $16\\ \\mathrm{A}$, pas la somme des valeurs efficaces.",
        resume: "Deux phases chargées",
      },
      {
        type: "calcul",
        enonce: "<p>Avec neutre, trois charges de même facteur de puissance appellent $30$, $20$ et $20\\ \\mathrm{A}$. Quel est le courant du neutre, en ampères ?</p>",
        valeur: 10,
        unite: "A",
        tolerance: 0.02,
        chiffres: 1,
        explication: "$I_N = \\sqrt{900 + 400 + 400 - 600 - 400 - 600} = \\sqrt{100} = 10\\ \\mathrm{A}$.",
        resume: "Formule du courant du neutre",
      },
      {
        type: "calcul",
        enonce: "<p>Une charge étoile équilibrée sans neutre, sous $230/400\\ \\mathrm{V}$, perd l'impédance de sa phase 1. Quelle tension reçoit chacune des deux autres, en volts ?</p>",
        valeur: 199.2,
        unite: "V",
        tolerance: 0.01,
        chiffres: 1,
        explication: "Les deux impédances égales sont en série sous $U_{23} = 398{,}4\\ \\mathrm{V}$ : chacune reçoit $199{,}2\\ \\mathrm{V}$.",
        resume: "Phase ouverte sans neutre",
      },
      {
        type: "qcm",
        enonce: "<p>Quelle expression donne la tension de déplacement d'une étoile d'admittances $\\underline{Y}_k$ dont le neutre est rompu ?</p>",
        options: [
          "$\\dfrac{\\sum \\underline{Y}_k\\underline{V}_k}{\\sum \\underline{Y}_k}$",
          "$\\dfrac{\\sum \\underline{V}_k}{3}$",
          "$\\sum \\underline{Y}_k\\underline{V}_k$",
          "$\\dfrac{\\sum \\underline{Z}_k\\underline{V}_k}{\\sum \\underline{Z}_k}$",
        ],
        bonnes: [0],
        explication: "Loi des nœuds au point commun : $\\sum \\underline{Y}_k(\\underline{V}_k - \\underline{V}_{N'N}) = 0$. La pondération se fait par les admittances, pas par les impédances.",
        resume: "Théorème de Millman",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Dans un récepteur couplé en triangle, un déséquilibre des impédances déplace le point neutre et fait monter la tension de certaines branches.</p>",
        reponse: false,
        explication: "Chaque branche est branchée entre deux phases et reçoit la tension composée imposée par la source ; il n'y a pas de point commun.",
        resume: "Triangle déséquilibré",
      },
      {
        type: "courte",
        enonce: "<p>Le neutre d'un tableau se rompt. Que subissent les appareils branchés sur la phase la moins chargée, et pourquoi ?</p>",
        motsCles: [["surtension", "tension", "monte", "augmente", "elevee"], ["point", "deplac", "barycentre", "charge", "admittance"]],
        minimum: 2,
        explication: "Le point commun se rapproche de la phase la plus chargée, de plus forte admittance ; la phase la moins chargée en est la plus éloignée et reçoit une surtension qui peut approcher $400\\ \\mathrm{V}$.",
        resume: "Phase la moins chargée",
      },
      {
        type: "schema",
        enonce: "<p>Trois charges résistives en étoile sans neutre : la phase 1 est de loin la plus chargée. Où se trouve le point commun $N'$ ?</p>",
        consigne: "Cliquez sur la position la plus plausible.",
        viewBox: "0 0 420 260",
        description: "Triangle des tensions composées, de sommets V1, V2 et V3, avec le neutre N au centre et trois positions candidates : a vers V1, b à l'opposé de V1, c vers V2",
        dessin: points.dessin,
        zones: [zone(points.a, "a", true), zone(points.b, "b"), zone(points.c, "c")],
        explication: "Pour des charges résistives, $N'$ est le barycentre des sommets pondérés par les conductances : il se rapproche du sommet de la phase la plus chargée, ici $V_1$.",
        resume: "Position du point étoile",
      },
      {
        type: "calcul",
        enonce: "<p>Dans une étoile équilibrée sans neutre, l'impédance de la phase 1 est court-circuitée. Quelle tension reçoivent les deux autres impédances, en volts, sur un réseau $230/400\\ \\mathrm{V}$ ?</p>",
        valeur: 398.4,
        unite: "V",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$\\underline{Y}_1 \\to \\infty$ : $N'$ rejoint le sommet $V_1$ et les deux autres impédances reçoivent la tension composée, $\\sqrt{3} \\times 230 = 398{,}4\\ \\mathrm{V}$.",
        resume: "Phase en court-circuit sans neutre",
      },
      {
        type: "qcm",
        enonce: "<p>Quelle composante symétrique des courants de ligne circule dans le neutre ?</p>",
        options: ["Trois fois la composante homopolaire", "La composante directe", "La composante inverse", "La somme des composantes directe et inverse"],
        bonnes: [0],
        explication: "$\\underline{I}_0 = (\\underline{I}_1 + \\underline{I}_2 + \\underline{I}_3)/3$, donc $\\underline{I}_N = 3\\underline{I}_0$ ; les systèmes direct et inverse ont une somme nulle.",
        resume: "Neutre et composante homopolaire",
      },
    ],
    { titre: "Dix questions sur les charges triphasées déséquilibrées" }
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
      { categorie: "Neutre", question: "Que transporte le neutre d'une charge étoile alimentée avec neutre ?", reponse: "La somme vectorielle des courants de ligne, $\\underline{I}_N = \\sum \\underline{I}_k$, nulle seulement pour une charge équilibrée." },
      { categorie: "Formule", question: "Que vaut $I_N$ pour trois courants de même déphasage ?", reponse: "$I_N = \\sqrt{I_1^2 + I_2^2 + I_3^2 - I_1I_2 - I_2I_3 - I_3I_1}$." },
      { categorie: "Cas simple", question: "Deux phases à $I$ résistifs, la troisième à vide : quel courant de neutre ?", reponse: "$I$, et non $2I$, car $|1 + a^2| = 1$." },
      { categorie: "Millman", question: "Comment calcule-t-on la tension de déplacement du point étoile ?", reponse: "$\\underline{V}_{N'N} = \\sum\\underline{Y}_k\\underline{V}_k / (\\sum\\underline{Y}_k + \\underline{Y}_N)$, avec $\\underline{Y}_N = 0$ si le neutre est rompu." },
      { categorie: "Géométrie", question: "Où se place le point commun d'une étoile résistive sans neutre ?", reponse: "Au barycentre des sommets du triangle des tensions, pondérés par les conductances : vers la phase la plus chargée." },
      { categorie: "Cas limite", question: "Que reçoivent les autres charges si une phase d'une étoile sans neutre est court-circuitée ?", reponse: "La tension composée entière, $398{,}4\\ \\mathrm{V}$, soit $\\sqrt{3}$ fois leur tension nominale." },
      { categorie: "Triangle", question: "Pourquoi un triangle déséquilibré ne connaît-il pas de déplacement de point neutre ?", reponse: "Chaque branche reçoit sa tension composée, imposée par la source ; il n'y a pas de point commun." },
      { categorie: "Danger", question: "Pourquoi une rupture de neutre est-elle si destructrice ?", reponse: "Les phases peu chargées montent vers $300$ à $400\\ \\mathrm{V}$, et aucune protection contre les surintensités ne déclenche." },
      { categorie: "Réactif", question: "Que peuvent provoquer un condensateur et une inductance sur deux phases d'une étoile sans neutre ?", reponse: "Une résonance série à travers le point commun : $N'$ sort du triangle et les tensions dépassent $400\\ \\mathrm{V}$." },
      {
        categorie: "Industriel",
        question: "Quelle répartition le site a-t-il retenue pour l'atelier, et pourquoi ?",
        reponse: "Machines sur $L_1$, éclairage sur $L_2$, chauffe-eau sur $L_3$ : $3{,}40\\ \\mathrm{A}$ dans le neutre, contre $18{,}76\\ \\mathrm{A}$ pour la permutation de mêmes kilowatts.",
        rappel: "Avant : 27,4 A dans le neutre et 281 V sur L2 et L3 en cas de rupture.",
      },
    ],
    { titre: "Dix cartes sur les charges déséquilibrées" }
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
        enonce: "<p>Cette séance. Avec neutre, $25\\ \\mathrm{A}$ résistifs sur $L_1$ et rien sur les deux autres phases. Quel courant circule dans le neutre, en ampères ?</p>",
        valeur: 25,
        unite: "A",
        tolerance: 0.01,
        chiffres: 1,
        explication: "Une seule phase chargée : le neutre ramène tout son courant, $25\\ \\mathrm{A}$.",
        resume: "Une seule phase chargée",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Cette séance. Quand le point étoile d'une charge se déplace, les tensions composées mesurées aux bornes de cette charge changent aussi.</p>",
        reponse: false,
        explication: "Les tensions composées sont imposées par la source : $\\underline{V}_1' - \\underline{V}_2' = \\underline{V}_1 - \\underline{V}_2$.",
        resume: "Tensions composées inchangées",
      },
      {
        type: "qcm",
        enonce: "<p>Cette séance. Une étoile résistive sans neutre a $G_1 = 2G$ et $G_2 = G_3 = G$. Que vaut $\\underline{V}_{N'N}$ ?</p>",
        options: ["$\\underline{V}_1/4$", "$\\underline{V}_1/2$", "$0$", "$\\underline{V}_1/3$"],
        bonnes: [0],
        explication: "$(2\\underline{V}_1 + \\underline{V}_2 + \\underline{V}_3)/4 = \\underline{V}_1/4$, soit $57{,}5\\ \\mathrm{V}$.",
        resume: "Millman, cas simple",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/puissance-en-triphase\">Puissance en triphasé</a>. Deux wattmètres sur une charge à trois fils lisent $9\\ \\mathrm{kW}$ et $-1\\ \\mathrm{kW}$. Quelle puissance active reçoit-elle, en kilowatts ?</p>",
        valeur: 8,
        unite: "kW",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$P = W_1 + W_2 = 9 - 1 = 8\\ \\mathrm{kW}$, quel que soit l'équilibre, puisqu'il n'y a que trois fils.",
        resume: "Méthode des deux wattmètres",
      },
      {
        type: "qcm",
        enonce: "<p>Cours <a href=\"#/cours/puissance-en-triphase\">Puissance en triphasé</a>. Pourquoi la méthode des deux wattmètres est-elle fausse sur un départ dont le neutre porte un courant ?</p>",
        options: [
          "Parce que $i_1 + i_2 + i_3 \\neq 0$",
          "Parce que les tensions composées sont déséquilibrées",
          "Parce que les wattmètres ne mesurent que l'actif",
          "Parce que l'ordre des phases est inversé",
        ],
        bonnes: [0],
        explication: "La démonstration de Blondel suppose une somme nulle des courants de ligne ; le courant du neutre la rompt.",
        resume: "Limite de la méthode d'Aron",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/impedances-en-regime-sinusoidal\">Impédances en régime sinusoïdal</a>. Quel est le module, en ohms, de l'impédance $\\underline{Z} = 16 + j12\\ \\Omega$ ?</p>",
        valeur: 20,
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$|\\underline{Z}| = \\sqrt{16^2 + 12^2} = 20\\ \\Omega$, d'argument $36{,}87^\\circ$ ; sous $230\\ \\mathrm{V}$, elle appelle $11{,}5\\ \\mathrm{A}$.",
        resume: "Module d'une impédance",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Cours <a href=\"#/cours/lois-de-kirchhoff\">Lois de Kirchhoff</a>. La loi des nœuds exprime la conservation de la charge électrique et s'applique aux valeurs instantanées comme aux phaseurs.</p>",
        reponse: true,
        explication: "Aucune charge ne s'accumule dans un nœud : $\\sum i_k(t) = 0$ à chaque instant, donc aussi pour les phaseurs. C'est elle qui donne $\\underline{I}_N$ et le théorème de Millman.",
        resume: "Loi des nœuds",
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
    titre: "Où en suis-je sur les charges triphasées déséquilibrées ?",
  });
  if (auto) ressources.push(auto);
}
