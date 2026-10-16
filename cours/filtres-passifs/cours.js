/* ==========================================================================
   cours/filtres-passifs/cours.js
   Filtres passifs : premier ordre RC et RL, diagrammes de Bode, effet de la
   source et de la charge, ordre et cascade, RLC du deuxième ordre, gabarit,
   filtre d'harmonique accordé.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const W50 = TAU * 50;
const VS = 230;

/** Passe-bas de référence de la section D : R = 1 kiloohm, C = 1 microfarad. */
const FC_D = 1 / (TAU * 1e3 * 1e-6);

/** Gabarit de la mesure de pression de la section H. */
const DEMI_PAS = 10 / 4096 / 2;
const PERTURBATION = 0.5;
const F_PERTURBATION = 4000;
const F_UTILE = 2;
const GP = 0.99;

/** Jeu de barres du tableau général, repris du cours sur les harmoniques. */
const XS = 0.204e-3 * W50;
const RD = 10;
const CC = 149.3e-6;
const I1_POMPE = (50 * 3) / Math.PI;
const RANGS_POMPE = [5, 7, 11, 13, 17, 19];
const courantPompe = (h) => (h >= 17 ? 0.01 * I1_POMPE : I1_POMPE / h);

/* --------------------------------------------------------------------------
   Calcul complexe minimal
   -------------------------------------------------------------------------- */

const cx = {
  c: (re, im = 0) => ({ re, im }),
  plus: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  fois: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  inverse: (a) => {
    const d = a.re * a.re + a.im * a.im;
    return { re: a.re / d, im: -a.im / d };
  },
  div: (a, b) => cx.fois(a, cx.inverse(b)),
  module: (a) => Math.hypot(a.re, a.im),
  phase: (a) => Math.atan2(a.im, a.re) / DEG,
};

/* --------------------------------------------------------------------------
   Modèles physiques
   -------------------------------------------------------------------------- */

/** Passe-bas RC chargé : gain continu G0 et coupure calculée avec la résistance de Thévenin. */
function passeBasCharge(f, r, c, re, rs = 0) {
  const g0 = re / (rs + r + re);
  const rth = ((rs + r) * re) / (rs + r + re);
  const fc = 1 / (TAU * rth * c);
  return { h: cx.div(cx.c(g0), cx.c(1, f / fc)), g0, fc };
}

/** Passe-haut RC : condensateur série, sortie sur R en parallèle avec la charge. */
function passeHautCharge(f, r, c, re) {
  const rp = (r * re) / (r + re);
  const fc = 1 / (TAU * rp * c);
  const x = f / fc;
  return { h: cx.div(cx.c(0, x), cx.c(1, x)), fc };
}

/** Deux cellules RC en cascade, sans tampon, avec source Rs et charge Re (analyse nodale). */
function cascade(f, { rs = 0, r1, c1, r2, c2, re = Infinity }) {
  const s = TAU * f;
  const ra = rs + r1;
  const a = 1 + (Number.isFinite(re) ? r2 / re : 0);
  const b = c2 * r2;
  const cc = 1 / ra + 1 / r2;
  /* vs [ (a + jb w)(cc + j c1 w) - 1/r2 ] = ve / ra */
  const den = cx.plus(cx.fois(cx.c(a, b * s), cx.c(cc, c1 * s)), cx.c(-1 / r2));
  return cx.div(cx.c(1 / ra), den);
}

/** Fonctions de transfert du RLC série selon la sortie : 0 condensateur, 1 résistance, 2 inductance. */
function rlc(f, f0, zeta, sortie) {
  const x = f / f0;
  const den = cx.c(1 - x * x, 2 * zeta * x);
  const num = sortie === 1 ? cx.c(0, 2 * zeta * x) : sortie === 2 ? cx.c(-x * x, 0) : cx.c(1, 0);
  return cx.div(num, den);
}

/** Réponse de la tension du condensateur d'un RLC série à un échelon unité. */
function indicielleRlc(t, w0, zeta) {
  if (t <= 0) return 0;
  if (Math.abs(zeta - 1) < 1e-4) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t));
  }
  const r = Math.sqrt(zeta * zeta - 1);
  const s1 = -w0 * (zeta - r);
  const s2 = -w0 * (zeta + r);
  return 1 + (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s1 - s2);
}

/** Réponse indicielle de deux cellules RC égales sans tampon, pôles en 0,382/RC et 2,618/RC. */
function indicielleCascade(t, rc) {
  if (t <= 0) return 0;
  const p1 = -((3 - Math.sqrt(5)) / 2) / rc;
  const p2 = -((3 + Math.sqrt(5)) / 2) / rc;
  return 1 + (p2 * Math.exp(p1 * t) - p1 * Math.exp(p2 * t)) / (p1 - p2);
}

function instantAtteint(fonction, niveau, tMax) {
  let bas = 0;
  let haut = tMax;
  for (let k = 0; k < 60; k += 1) {
    const milieu = (bas + haut) / 2;
    if (fonction(milieu) >= niveau) haut = milieu;
    else bas = milieu;
  }
  return haut;
}

/** Filtre accordé : composants par phase à partir de la puissance réactive, du rang d'accord et du facteur de qualité. */
function filtreAccorde(qf, hr, q) {
  const x = (VS * VS) / qf;
  const xc = x / (1 - 1 / (hr * hr));
  const xl = xc / (hr * hr);
  return { xc, xl, r: (hr * xl) / q, c: 1 / (W50 * xc), l: xl / W50, hr };
}

function impedanceFiltre(h, filtre) {
  return cx.c(filtre.r, h * filtre.xl - filtre.xc / h);
}

function impedanceJdb(h, filtre, avecCc) {
  let y = cx.plus(cx.inverse(cx.c(0, h * XS)), cx.c(1 / RD));
  if (avecCc) y = cx.plus(y, cx.c(0, h * W50 * CC));
  if (filtre) y = cx.plus(y, cx.inverse(impedanceFiltre(h, filtre)));
  return cx.inverse(y);
}

function thdTension(filtre, avecCc) {
  let somme = 0;
  for (const h of RANGS_POMPE) somme += Math.pow(cx.module(impedanceJdb(h, filtre, avecCc)) * courantPompe(h), 2);
  return (100 * Math.sqrt(somme)) / VS;
}

function maximumImpedance(filtre, avecCc, hDe, hA) {
  let meilleur = { h: hDe, z: 0 };
  for (let h = hDe; h <= hA; h += 0.01) {
    const z = cx.module(impedanceJdb(h, filtre, avecCc));
    if (z > meilleur.z) meilleur = { h, z };
  }
  return meilleur;
}

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

/** Zone rectangulaire grisée d'un gabarit, en coordonnées du repère. */
function zoneInterdite(c, repere, couleurs, x1, x2, y1, y2, libelle) {
  const a = repere.versX(x1);
  const b = repere.versX(x2);
  const haut = repere.versY(Math.max(y1, y2));
  const bas = repere.versY(Math.min(y1, y2));
  const gauche = Math.max(repere.boite.x, Math.min(a, b));
  const droite = Math.min(repere.boite.x + repere.boite.l, Math.max(a, b));
  const sommet = Math.max(repere.boite.y, haut);
  const pied = Math.min(repere.boite.y + repere.boite.h, bas);
  if (droite <= gauche || pied <= sommet) return;
  c.save();
  c.globalAlpha = 0.16;
  c.fillStyle = couleurs.texte;
  c.fillRect(gauche, sommet, droite - gauche, pied - sommet);
  c.globalAlpha = 1;
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    c.textAlign = "right";
    c.fillText(libelle, droite - 4, sommet + 14);
  }
  c.restore();
}

/** Tracé de correction animé par le moteur. */
function traceCorrection(moteur, conteneur, options) {
  const traceur = moteur.sim.traceur(conteneur, {
    genre: "Correction visuelle",
    ratio: 0.42,
    echantillons: 400,
    ...options,
  });
  if (traceur) ressources.push(traceur);
  return traceur;
}

/** Diagramme de Bode figé pour une correction. */
function bodeCorrection(moteur, conteneur, options) {
  const bode = moteur.sim.bode(conteneur, {
    genre: "Correction visuelle",
    ratio: 0.62,
    ...options,
  });
  if (bode) ressources.push(bode);
  return bode;
}

const dB = (module) => 20 * Math.log10(Math.max(module, 1e-12));

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeursAnimation = [];

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construirePhaseur(racine, api);
  construireHarmoniques(racine, api);
  construireSimRC(racine, api);
  construireSimRLC(racine, api);
  construireGabarit(racine, api);
  construireFiltreAccorde(racine, api);
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
    ["#d-rc-figure svg", 1.6],
    ["#e-familles-figure svg", 1.8],
    ["#e-cascade-figure svg", 1.6],
    ["#f-schema-principal svg", 2],
    ["#h-chaine-figure svg", 1.8],
    ["#i-filtre-figure svg", 1.8],
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
      id: "c-module",
      titre: "Module d'un quotient complexe",
      niveau: "prérequis",
      enonce: "<p>Quel est le module du nombre complexe $\\underline{H} = \\dfrac{1}{1 + j}$ ? Donnez aussi mentalement son argument.</p>",
      valeur: 1 / Math.SQRT2,
      unite: "",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Module $|\\underline{H}|$",
      etapes: [
        { texte: "Le module d'un quotient est le quotient des modules : $|1| / |1 + j|$." },
        { texte: "$|1 + j| = \\sqrt{1^2 + 1^2} = \\sqrt{2}$, donc $|\\underline{H}| = 1/\\sqrt{2} = 0{,}7071$." },
        {
          texte: "L'argument est $0 - \\arctan(1/1) = -45^\\circ$.",
          note: "C'est exactement le passe-bas du premier ordre à sa fréquence de coupure : $-3\\ \\mathrm{dB}$ et $-45^\\circ$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Module de 1 / (1 + jx) en fonction de x",
          xTitre: "x",
          yTitre: "module",
          xMin: 0,
          xMax: 4,
          yMin: 0,
          yMax: 1.1,
          series: [{ id: "g", nom: "|H| = 1 / racine de (1 + x²)", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => 1 / Math.sqrt(1 + x * x) }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 1, 1 / Math.SQRT2, "x = 1 : 0,7071", false);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-decibel",
      titre: "Rapport de tensions en décibels",
      niveau: "prérequis",
      enonce: "<p>Un filtre transmet $5\\ \\%$ de l'amplitude d'une perturbation. Quel est son gain en décibels à cette fréquence ?</p>",
      valeur: 20 * Math.log10(0.05),
      unite: "dB",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Gain $G_{\\mathrm{dB}}$",
      etapes: [
        { texte: "Pour un rapport de tensions, $G_{\\mathrm{dB}} = 20\\log_{10} G$." },
        { texte: "$\\log_{10} 0{,}05 = \\log_{10} 5 - 2 = 0{,}699 - 2 = -1{,}301$." },
        {
          texte: "$G_{\\mathrm{dB}} = 20 \\times (-1{,}301) = -26{,}02\\ \\mathrm{dB}$.",
          note: "Repère : $-20\\ \\mathrm{dB}$ pour un dixième, puis $-6\\ \\mathrm{dB}$ pour une moitié de plus.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Gain en décibels en fonction de log10 du rapport",
          xTitre: "log10 G",
          yTitre: "gain",
          yUnite: "dB",
          xMin: -3,
          xMax: 0,
          yMin: -62,
          yMax: 2,
          series: [{ id: "d", nom: "G_dB = 20 log10 G", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => 20 * x }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, Math.log10(0.05), 20 * Math.log10(0.05), "G = 0,05 : -26,02 dB", false);
            marquerPoint(c, repere, couleurs, -1, -20, "G = 0,1 : -20 dB", false);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm("#c-minitest", {
      id: "c-thevenin",
      titre: "Résistance vue par le condensateur",
      niveau: "prérequis",
      enonce:
        "<p>Un condensateur est relié, d'un côté, à une source idéale à travers $R = 1\\ \\mathrm{k\\Omega}$ et, de l'autre côté de ses bornes, à une " +
        "charge de $1\\ \\mathrm{k\\Omega}$ en parallèle. Quelle résistance fixe sa constante de temps ?</p>",
      options: [
        { texte: "$500\\ \\Omega$", juste: true },
        { texte: "$1\\ \\mathrm{k\\Omega}$" },
        { texte: "$2\\ \\mathrm{k\\Omega}$" },
        { texte: "Aucune : la charge ne change pas la constante de temps" },
      ],
      etapes: [
        { texte: "On éteint la source idéale : elle devient un court-circuit." },
        { texte: "Vu des bornes du condensateur, $R$ et la charge sont alors en parallèle : $1\\ \\mathrm{k\\Omega} \\parallel 1\\ \\mathrm{k\\Omega} = 500\\ \\Omega$." },
        {
          texte: "La constante de temps, donc la coupure, se calcule avec $500\\ \\Omega$ : la coupure double par rapport au filtre à vide.",
          note: "La tension de Thévenin vaut, elle, la moitié de la source : le gain en continu tombe à $0{,}5$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Gain du passe-bas, avec C = 1 µF, à vide et chargé",
          xTitre: "log10(f / 1 Hz)",
          yTitre: "gain",
          yUnite: "dB",
          xMin: 0,
          xMax: 4,
          yMin: -36,
          yMax: 3,
          series: [
            { id: "v", nom: "à vide : 1 kΩ, fc = 159 Hz", couleur: "serie-1", epaisseur: 2.4, fonction: (l) => dB(cx.module(passeBasCharge(Math.pow(10, l), 1e3, 1e-6, 1e12).h)) },
            { id: "ch", nom: "chargé : 500 Ω vus, fc = 318 Hz", couleur: "serie-5", epaisseur: 2.4, fonction: (l) => dB(cx.module(passeBasCharge(Math.pow(10, l), 1e3, 1e-6, 1e3).h)) },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, Math.log10(FC_D), -3.01, "159 Hz", true);
            marquerPoint(c, repere, couleurs, Math.log10(2 * FC_D), -9.03, "318 Hz", false);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : diviseur RC dans le plan de Fresnel
   -------------------------------------------------------------------------- */

function construirePhaseur(racine, api) {
  const conteneur = racine.querySelector("#d-phaseur");
  if (!conteneur) return;

  const O = { x: 60, y: 80 };
  const D = 400;
  const E = { x: O.x + D, y: O.y };
  const pointSortie = (l) => {
    const phi = Math.atan(Math.pow(10, l));
    return { x: O.x + D * Math.cos(phi) * Math.cos(phi), y: O.y + D * Math.cos(phi) * Math.sin(phi) };
  };

  const svg = svgEl("svg", {
    viewBox: "0 0 560 320",
    role: "img",
    "aria-label": "Diagramme de Fresnel du filtre RC : tension d'entrée Ue horizontale de O à E, tension de sortie UC de O à la poignée, tension UR de la poignée à E, demi-cercle lieu de la sortie",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-d-ph");
  const fond = svgEl("g");
  fond.innerHTML =
    '<path d="M' + O.x + " " + O.y + "A200 200 0 0 0 " + E.x + " " + E.y + '" stroke="currentColor" stroke-width="1.3" fill="none" stroke-dasharray="5 5" opacity="0.7"/>' +
    '<path d="M30 80H530" stroke="currentColor" stroke-width="1" opacity="0.35"/>';
  const ue = svgEl("path", { stroke: "currentColor", "stroke-width": 1.5, fill: "none", "marker-end": "url(#fl-d-ph)" });
  const uc = svgEl("path", { stroke: "currentColor", "stroke-width": 3.6, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-d-ph)" });
  const ur = svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-d-ph)" });
  const angleDroit = svgEl("path", { stroke: "currentColor", "stroke-width": 1.2, fill: "none" });
  const arc = svgEl("path", { stroke: "currentColor", "stroke-width": 1.2, fill: "none" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  svg.append(defs, fond, ue, arc, angleDroit, ur, uc, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-phaseur-valeurs", [
    { id: "rapport", libelle: "f / fc", decimales: 3 },
    { id: "f", libelle: "Fréquence f", unite: "Hz", decimales: 1 },
    { id: "g", libelle: "Gain |UC / Ue|", decimales: 4 },
    { id: "gdb", libelle: "Gain en décibels", unite: "dB", decimales: 2 },
    { id: "phi", libelle: "Déphasage de la sortie", unite: "°", decimales: 1 },
    { id: "ur", libelle: "|UR / Ue|", decimales: 4 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner(l) {
    const x = Math.pow(10, l);
    const phi = Math.atan(x);
    const M = pointSortie(l);
    ue.setAttribute("d", segment(O.x, O.y, E.x, E.y));
    uc.setAttribute("d", segment(O.x, O.y, M.x, M.y));
    ur.setAttribute("d", segment(M.x, M.y, E.x, E.y));
    /* Angle droit en M, entre les directions de O et de E. */
    const k = 12;
    const versO = { x: (O.x - M.x) / Math.hypot(O.x - M.x, O.y - M.y || 1e-9), y: (O.y - M.y) / Math.hypot(O.x - M.x, O.y - M.y || 1e-9) };
    const versE = { x: (E.x - M.x) / Math.hypot(E.x - M.x, E.y - M.y || 1e-9), y: (E.y - M.y) / Math.hypot(E.x - M.x, E.y - M.y || 1e-9) };
    const visible = Math.hypot(M.x - O.x, M.y - O.y) > 30 && Math.hypot(M.x - E.x, M.y - E.y) > 30;
    angleDroit.setAttribute(
      "d",
      visible
        ? "M" + (M.x + k * versO.x).toFixed(1) + " " + (M.y + k * versO.y).toFixed(1) +
            "L" + (M.x + k * versO.x + k * versE.x).toFixed(1) + " " + (M.y + k * versO.y + k * versE.y).toFixed(1) +
            "L" + (M.x + k * versE.x).toFixed(1) + " " + (M.y + k * versE.y).toFixed(1)
        : ""
    );
    const ra = 44;
    arc.setAttribute(
      "d",
      phi > 0.02 ? "M" + (O.x + ra) + " " + O.y + "A" + ra + " " + ra + " 0 0 1 " + (O.x + ra * Math.cos(phi)).toFixed(1) + " " + (O.y + ra * Math.sin(phi)).toFixed(1) : ""
    );
    let t = texte(O.x - 8, O.y - 12, "O") + texte(E.x + 4, E.y - 12, "E");
    t += texte((O.x + E.x) / 2 - 10, O.y - 12, "Ue");
    t += texte((O.x + M.x) / 2 - 34, (O.y + M.y) / 2 + 14, "UC");
    t += texte((M.x + E.x) / 2 + 8, (M.y + E.y) / 2 + 14, "UR");
    if (phi > 0.15) t += texte(O.x + ra + 6, O.y + 22, "φ");
    t += texte(300, 300, "f = " + nombre(api, x, x < 0.1 ? 3 : 2) + " fc ; φ = -" + nombre(api, phi / DEG, 1) + " degrés");
    libelles.innerHTML = t;
    if (valeurs) {
      valeurs.maj({
        rapport: x,
        f: x * FC_D,
        g: Math.cos(phi),
        gdb: dB(Math.cos(phi)),
        phi: -phi / DEG,
        ur: Math.sin(phi),
      });
    }
  }

  let synchro = false;
  let poignee = null;
  let lecteur = null;
  function appliquer(l, source) {
    if (synchro) return;
    synchro = true;
    dessiner(l);
    if (source !== "poignee" && poignee) poignee.set(l, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(l);
    synchro = false;
  }

  poignee = api.sim.poignee(conteneur, {
    type: "courbe",
    courbe: (t) => pointSortie(-2 + 4 * t),
    min: -2,
    max: 2,
    pas: 0.02,
    valeur: -0.3,
    echantillons: 400,
    libelle: "Extrémité du phaseur de sortie, fréquence de f / 100 à 100 f",
    format: (mesure) => "f / fc = " + nombre(api, Math.pow(10, mesure.valeur), 3),
    diffuserAuDepart: false,
    rappel(mesure) {
      appliquer(mesure.valeur, "poignee");
    },
  });
  if (poignee) ressources.push(poignee);

  lecteur = api.sim.lecteur("#d-phaseur-lecteur", {
    de: -2,
    a: 2,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Balayage de la fréquence, de fc / 100 à 100 fc",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  appliquer(-0.3, null);
}

/* --------------------------------------------------------------------------
   D. Animation : un signal à deux harmoniques traverse le passe-bas
   -------------------------------------------------------------------------- */

function construireHarmoniques(racine, api) {
  const TAUX5 = 0.3;
  const reponse = (f) => cx.div(cx.c(1), cx.c(1, f / FC_D));
  const h1 = reponse(50);
  const h5 = reponse(250);
  const g1 = cx.module(h1);
  const g5 = cx.module(h5);
  const p1 = Math.atan2(h1.im, h1.re);
  const p5 = Math.atan2(h5.im, h5.re);
  const etat = { t: 40 };

  const entree = (tms) => Math.sin(W50 * tms / 1000) + TAUX5 * Math.sin(5 * W50 * tms / 1000);
  const sortie = (tms) => g1 * Math.sin(W50 * tms / 1000 + p1) + TAUX5 * g5 * Math.sin(5 * W50 * tms / 1000 + p5);
  const fondamental = (tms) => g1 * Math.sin(W50 * tms / 1000 + p1);
  const jusqua = (fonction) => (tms) => (tms <= etat.t + 1e-9 ? fonction(tms) : NaN);

  const trace = api.sim.traceur("#d-harm-trace", {
    titre: "Fondamental et rang 5 à travers le passe-bas, fc = 159,2 Hz",
    genre: "Animation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "tension",
    yUnite: "V",
    xMin: 0,
    xMax: 40,
    yMin: -1.5,
    yMax: 1.5,
    ratio: 0.42,
    echantillons: 800,
    series: [
      { id: "e", nom: "entrée ue : 1 V crête + 30 % de rang 5", couleur: "serie-6", epaisseur: 1.4, fonction: jusqua(entree) },
      { id: "s", nom: "sortie us", couleur: "serie-1", epaisseur: 3.2, fonction: jusqua(sortie) },
      { id: "f", nom: "fondamental de la sortie", couleur: "serie-5", epaisseur: 2, fonction: jusqua(fondamental) },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
      if (etat.t < 39.95) ligneV(c, repere, couleurs, etat.t, "t = " + nombre(api, etat.t, 1) + " ms");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#d-harm-valeurs", [
    { id: "t", libelle: "Instant", unite: "ms", decimales: 2 },
    { id: "ue", libelle: "ue(t)", unite: "V", decimales: 3 },
    { id: "us", libelle: "us(t)", unite: "V", decimales: 3 },
    { id: "g1", libelle: "Gain à 50 Hz", decimales: 3 },
    { id: "g5", libelle: "Gain à 250 Hz", decimales: 3 },
    { id: "taux", libelle: "Rang 5 en sortie", unite: "%", decimales: 1 },
    { id: "r1", libelle: "Retard du fondamental", unite: "ms", decimales: 2 },
    { id: "r5", libelle: "Retard du rang 5", unite: "ms", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    if (trace) trace.rafraichir();
    if (valeurs) {
      valeurs.maj({
        t: etat.t,
        ue: entree(etat.t),
        us: sortie(etat.t),
        g1,
        g5,
        taux: (100 * TAUX5 * g5) / g1,
        r1: (-p1 / W50) * 1000,
        r5: (-p5 / (5 * W50)) * 1000,
      });
    }
  }

  const lecteur = api.sim.lecteur("#d-harm-lecteur", {
    de: 0,
    a: 40,
    duree: 8,
    boucle: false,
    auto: false,
    libelle: "Avancer le temps sur deux périodes",
    rappel(valeur) {
      etat.t = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    /* Les courbes s'affichent complètes tant que l'apprenant n'a pas lancé la lecture. */
    lecteur.suivre(40);
    etat.t = 40;
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : Bode d'un passe-bas et d'un passe-haut RC chargés
   -------------------------------------------------------------------------- */

function construireSimRC(racine, api) {
  const etat = { r: 1e3, c: 1e-6, re: 1e6, f: 250 };

  const bodeBas = api.sim.bode("#e-rc-bode-bas", {
    titre: "Passe-bas RC, sortie sur le condensateur",
    genre: "Simulation",
    fMin: 1,
    fMax: 100000,
    gainMin: -80,
    gainMax: 10,
    phaseMin: -90,
    phaseMax: 0,
    ratio: 0.6,
    fonction: (f) => passeBasCharge(f, etat.r, etat.c, etat.re).h,
    coupure: FC_D,
    libelleCoupure: "fc",
  });
  if (bodeBas) ressources.push(bodeBas);

  const bodeHaut = api.sim.bode("#e-rc-bode-haut", {
    titre: "Passe-haut RC, sortie sur la résistance",
    genre: "Simulation",
    fMin: 1,
    fMax: 100000,
    gainMin: -80,
    gainMax: 10,
    phaseMin: 0,
    phaseMax: 90,
    ratio: 0.6,
    fonction: (f) => passeHautCharge(f, etat.r, etat.c, etat.re).h,
    coupure: FC_D,
    libelleCoupure: "fc",
  });
  if (bodeHaut) ressources.push(bodeHaut);

  const valeurs = api.sim.valeurs("#e-rc-valeurs", [
    { id: "fcb", libelle: "Coupure du passe-bas", unite: "Hz", decimales: 1 },
    { id: "g0", libelle: "Gain continu du passe-bas", unite: "dB", decimales: 2 },
    { id: "fch", libelle: "Coupure du passe-haut", unite: "Hz", decimales: 1 },
    { id: "gb", libelle: "Passe-bas à f d'essai", unite: "dB", decimales: 2 },
    { id: "pb", libelle: "Phase du passe-bas", unite: "°", decimales: 1 },
    { id: "gh", libelle: "Passe-haut à f d'essai", unite: "dB", decimales: 2 },
    { id: "ph", libelle: "Phase du passe-haut", unite: "°", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function mettreAJour() {
    const bas = passeBasCharge(etat.f, etat.r, etat.c, etat.re);
    const haut = passeHautCharge(etat.f, etat.r, etat.c, etat.re);
    if (bodeBas) {
      bodeBas.definirFonction((f) => passeBasCharge(f, etat.r, etat.c, etat.re).h);
      bodeBas.definirCoupure(bas.fc);
    }
    if (bodeHaut) {
      bodeHaut.definirFonction((f) => passeHautCharge(f, etat.r, etat.c, etat.re).h);
      bodeHaut.definirCoupure(haut.fc);
    }
    if (valeurs) {
      valeurs.maj({
        fcb: bas.fc,
        g0: dB(bas.g0),
        fch: haut.fc,
        gb: dB(cx.module(bas.h)),
        pb: cx.phase(bas.h),
        gh: dB(cx.module(haut.h)),
        ph: cx.phase(haut.h),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-rc-curseurs",
    [
      { id: "r", libelle: "Résistance R", min: 0.1, max: 10, pas: 0.1, valeur: 1, format: (v) => nombre(api, v, 1) + " kΩ" },
      { id: "c", libelle: "Capacité C", min: 0.1, max: 10, pas: 0.1, valeur: 1, format: (v) => nombre(api, v, 1) + " µF" },
      { id: "re", libelle: "Charge Re", min: 1, max: 1000, pas: 1, valeur: 1000, format: (v) => nombre(api, v, 0) + " kΩ" },
      { id: "f", libelle: "Fréquence d'essai", min: 10, max: 5000, pas: 10, valeur: 250, format: (v) => nombre(api, v, 0) + " Hz" },
    ],
    (lues) => {
      etat.r = lues.r * 1e3;
      etat.c = lues.c * 1e-6;
      etat.re = lues.re * 1e3;
      etat.f = lues.f;
      mettreAJour();
    }
  );
  if (curseurs) ressources.push(curseurs);
  mettreAJour();
}

/* --------------------------------------------------------------------------
   E. Simulation : RLC série du deuxième ordre
   -------------------------------------------------------------------------- */

const SORTIES_RLC = ["condensateur, passe-bas", "résistance, passe-bande", "inductance, passe-haut"];

function construireSimRLC(racine, api) {
  const etat = { l: 10e-3, c: 22e-6, r: 10, sortie: 0 };
  const parametres = () => {
    const w0 = 1 / Math.sqrt(etat.l * etat.c);
    return { w0, f0: w0 / TAU, zeta: (etat.r / 2) * Math.sqrt(etat.c / etat.l) };
  };

  const p0 = parametres();
  const bode = api.sim.bode("#e-rlc-bode", {
    titre: "Bode du RLC série",
    genre: "Simulation",
    fMin: 10,
    fMax: 100000,
    gainMin: -80,
    gainMax: 20,
    phaseMin: -180,
    phaseMax: 180,
    ratio: 0.62,
    fonction: (f) => rlc(f, p0.f0, p0.zeta, etat.sortie),
    coupure: p0.f0,
    libelleCoupure: "f0",
  });
  if (bode) ressources.push(bode);

  const indicielle = api.sim.traceur("#e-rlc-indicielle", {
    titre: "Tension du condensateur après un échelon de 1 V",
    genre: "Simulation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "uC",
    yUnite: "V",
    xMin: 0,
    xMax: 20,
    yMin: 0,
    yMax: 2,
    ratio: 0.36,
    echantillons: 600,
    series: [{ id: "u", nom: "uC(t), échelon de 1 V", couleur: "serie-1", epaisseur: 2.6 }],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 1, "valeur finale", true, [2, 3]);
    },
  });
  if (indicielle) ressources.push(indicielle);

  const valeurs = api.sim.valeurs("#e-rlc-valeurs", [
    { id: "f0", libelle: "Fréquence propre f0", unite: "Hz", decimales: 1 },
    { id: "zeta", libelle: "Amortissement ζ", decimales: 3 },
    { id: "q", libelle: "Facteur de qualité Q", decimales: 2 },
    { id: "gmax", libelle: "Gain maximal, sortie choisie", unite: "dB", decimales: 2 },
    { id: "fmax", libelle: "Fréquence du maximum", unite: "Hz", decimales: 1 },
    { id: "dep", libelle: "Dépassement indiciel", unite: "%", decimales: 1 },
    { id: "rc", libelle: "R pour ζ = 0,707", unite: "Ω", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function mettreAJour() {
    const p = parametres();
    if (bode) {
      bode.definirFonction((f) => rlc(f, p.f0, p.zeta, etat.sortie));
      bode.definirCoupure(p.f0);
    }
    let gmax = -Infinity;
    let fmax = 10;
    for (let k = 0; k <= 2000; k += 1) {
      const f = Math.pow(10, 1 + (4 * k) / 2000);
      const g = dB(cx.module(rlc(f, p.f0, p.zeta, etat.sortie)));
      if (g > gmax) {
        gmax = g;
        fmax = f;
      }
    }
    const lent = p.zeta < 1 ? p.zeta * p.w0 : p.w0 * (p.zeta - Math.sqrt(p.zeta * p.zeta - 1));
    const tmax = Math.min(200, Math.max(2, (6 / lent) * 1000));
    if (indicielle) {
      indicielle.definirPlage({ xMin: 0, xMax: tmax, yMin: 0, yMax: Math.max(1.2, p.zeta < 1 ? 1 + Math.exp((-Math.PI * p.zeta) / Math.sqrt(1 - p.zeta * p.zeta)) + 0.1 : 1.2) });
      indicielle.definirFonction("u", (tms) => indicielleRlc(tms / 1000, p.w0, p.zeta));
    }
    if (valeurs) {
      valeurs.maj({
        f0: p.f0,
        zeta: p.zeta,
        q: 1 / (2 * p.zeta),
        gmax,
        fmax,
        dep: p.zeta < 1 ? 100 * Math.exp((-Math.PI * p.zeta) / Math.sqrt(1 - p.zeta * p.zeta)) : 0,
        rc: 2 * Math.SQRT1_2 * Math.sqrt(etat.l / etat.c),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-rlc-curseurs",
    [
      { id: "l", libelle: "Inductance L", min: 1, max: 50, pas: 0.5, valeur: 10, format: (v) => nombre(api, v, 1) + " mH" },
      { id: "c", libelle: "Capacité C", min: 1, max: 100, pas: 1, valeur: 22, format: (v) => nombre(api, v, 0) + " µF" },
      { id: "r", libelle: "Résistance R", min: 1, max: 100, pas: 0.5, valeur: 10, format: (v) => nombre(api, v, 1) + " Ω" },
      { id: "sortie", libelle: "Sortie observée", min: 0, max: 2, pas: 1, valeur: 0, format: (v) => SORTIES_RLC[Math.round(v)] },
    ],
    (lues) => {
      etat.l = lues.l * 1e-3;
      etat.c = lues.c * 1e-6;
      etat.r = lues.r;
      etat.sortie = Math.round(lues.sortie);
      mettreAJour();
    }
  );
  if (curseurs) ressources.push(curseurs);
  mettreAJour();
}

/* --------------------------------------------------------------------------
   H. Animation : gabarit de la mesure de pression et choix de l'ordre
   -------------------------------------------------------------------------- */

function construireGabarit(racine, api) {
  const etat = { rc: 2.2e-3 };
  const GA_DB = dB(DEMI_PAS / PERTURBATION);
  const GP_DB = dB(GP);
  const ordre1 = (f) => cx.div(cx.c(1), cx.c(1, TAU * f * etat.rc));
  const ordre2 = (f) => cascade(f, { r1: 1e3, c1: etat.rc / 1e3, r2: 1e3, c2: etat.rc / 1e3 });

  const trace = api.sim.traceur("#h-gabarit-trace", {
    titre: "Gabarit de la mesure de pression et gains des deux ordres",
    genre: "Animation",
    xTitre: "log10(f / 1 Hz)",
    yTitre: "gain",
    yUnite: "dB",
    xMin: -1,
    xMax: 4.3,
    yMin: -110,
    yMax: 10,
    ratio: 0.46,
    echantillons: 600,
    series: [
      { id: "o1", nom: "premier ordre, constante RC", couleur: "serie-5", epaisseur: 1.6, fonction: (l) => dB(cx.module(ordre1(Math.pow(10, l)))) },
      { id: "o2", nom: "deux cellules RC égales", couleur: "serie-1", epaisseur: 3.2, fonction: (l) => dB(cx.module(ordre2(Math.pow(10, l)))) },
    ],
    surDessin({ c, repere, couleurs }) {
      zoneInterdite(c, repere, couleurs, Math.log10(F_PERTURBATION), 4.3, GA_DB, 10, "interdit");
      zoneInterdite(c, repere, couleurs, -1, Math.log10(F_UTILE), -110, GP_DB, "");
      ligneV(c, repere, couleurs, Math.log10(F_UTILE), "2 Hz", 1.2, [5, 5]);
      ligneV(c, repere, couleurs, Math.log10(F_PERTURBATION), "4 kHz", 1.2, [2, 3]);
      ligneH(c, repere, couleurs, GA_DB, "-52,2 dB", true, [2, 3]);
    },
  });
  if (trace) ressources.push(trace);

  const verdict = (ok) => (ok ? "conforme" : "non conforme");
  const valeurs = api.sim.valeurs("#h-gabarit-valeurs", [
    { id: "rc", libelle: "Constante RC", unite: "ms", decimales: 2 },
    { id: "e1", libelle: "Ordre 1 : erreur à 2 Hz", unite: "%", decimales: 2 },
    { id: "r1", libelle: "Ordre 1 : résidu à 4 kHz", unite: "mV", decimales: 3 },
    { id: "v1", libelle: "Ordre 1", format: (v) => v },
    { id: "t1", libelle: "Ordre 1 : 99 % atteints en", unite: "ms", decimales: 1 },
    { id: "e2", libelle: "Ordre 2 : erreur à 2 Hz", unite: "%", decimales: 2 },
    { id: "r2", libelle: "Ordre 2 : résidu à 4 kHz", unite: "mV", decimales: 3 },
    { id: "v2", libelle: "Ordre 2", format: (v) => v },
    { id: "t2", libelle: "Ordre 2 : 99 % atteints en", unite: "ms", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    if (trace) trace.rafraichir();
    const e1 = 100 * (1 - cx.module(ordre1(F_UTILE)));
    const r1 = 1000 * PERTURBATION * cx.module(ordre1(F_PERTURBATION));
    const e2 = 100 * (1 - cx.module(ordre2(F_UTILE)));
    const r2 = 1000 * PERTURBATION * cx.module(ordre2(F_PERTURBATION));
    const seuil = 1000 * DEMI_PAS;
    const t2 = instantAtteint((t) => indicielleCascade(t, etat.rc), 0.99, 40 * etat.rc);
    if (valeurs) {
      valeurs.maj({
        rc: etat.rc * 1000,
        e1,
        r1,
        v1: verdict(e1 <= 1 && r1 <= seuil),
        t1: 1000 * etat.rc * Math.log(100),
        e2,
        r2,
        v2: verdict(e2 <= 1 && r2 <= seuil),
        t2: 1000 * t2,
      });
    }
  }

  const lecteur = api.sim.lecteur("#h-gabarit-lecteur", {
    de: -4,
    a: Math.log10(20e-3),
    duree: 12,
    boucle: false,
    auto: false,
    libelle: "Balayage de la constante RC, de 0,1 à 20 ms",
    rappel(valeur) {
      etat.rc = Math.pow(10, valeur);
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    /* Le tracé montre d'abord la solution retenue, RC = 2,2 ms. */
    lecteur.suivre(Math.log10(2.2e-3));
    etat.rc = 2.2e-3;
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   I. Simulation : filtre accordé au jeu de barres
   -------------------------------------------------------------------------- */

function construireFiltreAccorde(racine, api) {
  const etat = { hr: 4.7, qf: 3500, q: 30, avecCc: true };
  const filtre = () => filtreAccorde(etat.qf, etat.hr, etat.q);

  const trace = api.sim.traceur("#i-sim-trace", {
    titre: "Impédance du jeu de barres vue par la pompe",
    genre: "Simulation",
    xTitre: "rang h",
    yTitre: "|Z|",
    yUnite: "Ω",
    xMin: 1,
    xMax: 25,
    yMin: 0,
    yMax: 12,
    ratio: 0.46,
    echantillons: 1200,
    series: [
      { id: "sans", nom: "sans filtre", couleur: "serie-6", epaisseur: 1.6 },
      { id: "avec", nom: "avec filtre accordé", couleur: "serie-1", epaisseur: 3 },
    ],
    surDessin({ c, repere, couleurs }) {
      for (const h of RANGS_POMPE) ligneV(c, repere, couleurs, h, String(h), 1, [2, 3]);
      ligneV(c, repere, couleurs, etat.hr, "", 1.4, [6, 4]);
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#i-sim-valeurs", [
    { id: "c", libelle: "Condensateurs du filtre, par phase", unite: "µF", decimales: 1 },
    { id: "l", libelle: "Self du filtre", unite: "mH", decimales: 3 },
    { id: "part", libelle: "Part du rang 5 absorbée par le filtre", unite: "%", decimales: 1 },
    { id: "v5s", libelle: "V5 sans filtre", unite: "V", decimales: 2 },
    { id: "v5a", libelle: "V5 avec filtre", unite: "V", decimales: 2 },
    { id: "thds", libelle: "THDv sans filtre", unite: "%", decimales: 2 },
    { id: "thda", libelle: "THDv avec filtre", unite: "%", decimales: 2 },
    { id: "har", libelle: "Antirésonance basse, rang", decimales: 2 },
    { id: "hh", libelle: "Résonance haute, rang", format: (v) => (Number.isFinite(v) ? api.util.formaterDecimal(v, 2) : "aucune") },
    { id: "uc1", libelle: "Tension fondamentale des condensateurs", unite: "V", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function mettreAJour() {
    const f = filtre();
    if (trace) {
      trace.definirFonction("sans", (h) => cx.module(impedanceJdb(h, null, etat.avecCc)));
      trace.definirFonction("avec", (h) => cx.module(impedanceJdb(h, f, etat.avecCc)));
    }
    const z5 = impedanceJdb(5, f, etat.avecCc);
    const part = cx.module(cx.div(z5, impedanceFiltre(5, f)));
    const basse = maximumImpedance(f, etat.avecCc, 1.2, etat.hr);
    const haute = etat.avecCc ? maximumImpedance(f, true, etat.hr + 0.3, 25).h : NaN;
    if (valeurs) {
      valeurs.maj({
        c: f.c * 1e6,
        l: f.l * 1e3,
        part: 100 * part,
        v5s: cx.module(impedanceJdb(5, null, etat.avecCc)) * courantPompe(5),
        v5a: cx.module(z5) * courantPompe(5),
        thds: thdTension(null, etat.avecCc),
        thda: thdTension(f, etat.avecCc),
        har: basse.h,
        hh: haute,
        uc1: (VS * etat.hr * etat.hr) / (etat.hr * etat.hr - 1),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-sim-curseurs",
    [
      { id: "hr", libelle: "Rang d'accord hr", min: 4, max: 5, pas: 0.05, valeur: 4.7, format: (v) => nombre(api, v, 2) },
      { id: "qf", libelle: "Réactif du filtre, par phase", min: 1, max: 15, pas: 0.5, valeur: 3.5, format: (v) => nombre(api, v, 1) + " kvar" },
      { id: "q", libelle: "Facteur de qualité de la self", min: 10, max: 80, pas: 5, valeur: 30, format: (v) => nombre(api, v, 0) },
      { id: "cc", libelle: "Condensateurs du compresseur", min: 0, max: 1, pas: 1, valeur: 1, format: (v) => (v >= 0.5 ? "en service" : "hors service") },
    ],
    (lues) => {
      etat.hr = lues.hr;
      etat.qf = lues.qf * 1000;
      etat.q = lues.q;
      etat.avecCc = lues.cc >= 0.5;
      mettreAJour();
    }
  );
  if (curseurs) ressources.push(curseurs);
  mettreAJour();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function dessinTroisFiltres() {
  const traits = '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">';
  let d = traits;
  /* a : RC, sortie sur C */
  d += '<path d="M20 50H50"/><rect x="50" y="40" width="40" height="20" rx="3"/><path d="M90 50H150V88M150 100V140H20M150 50H170M150 140H170"/>';
  d += '<path d="M134 88H166M134 100H166" stroke-width="3"/>';
  /* b : RL, sortie sur R */
  d += '<path d="M200 50H220a8 8 0 0 1 16 0a8 8 0 0 1 16 0a8 8 0 0 1 16 0H330V70M330 110V140H200M330 50H350M330 140H350"/><rect x="320" y="70" width="20" height="40" rx="3"/>';
  /* c : RC, sortie sur R */
  d += '<path d="M380 50H419M431 50H510V70M510 110V140H380M510 50H530M510 140H530"/><path d="M419 36V64M431 36V64" stroke-width="3"/><rect x="500" y="70" width="20" height="40" rx="3"/>';
  d += "</g>";
  d += '<g fill="none" stroke="currentColor" stroke-width="1.6">';
  for (const x of [20, 170, 200, 350, 380, 530]) d += '<circle cx="' + x + '" cy="50" r="4"/><circle cx="' + x + '" cy="140" r="4"/>';
  d += "</g>";
  d += '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';
  d += texte(62, 34, "R") + texte(172, 98, "C") + texte(236, 34, "L") + texte(346, 94, "R") + texte(420, 30, "C") + texte(526, 94, "R");
  d += texte(14, 164, "entrée") + texte(150, 164, "sortie") + texte(194, 164, "entrée") + texte(330, 164, "sortie") + texte(374, 164, "entrée") + texte(510, 164, "sortie");
  d += texte(80, 186, "a") + texte(266, 186, "b") + texte(452, 186, "c");
  d += "</g>";
  return d;
}

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-coupure",
      titre: "Fréquence de coupure d'un passe-bas RC",
      niveau: "fondamental",
      enonce:
        "<p>Un passe-bas $RC$ à vide est réalisé avec $R = 4{,}7\\ \\mathrm{k\\Omega}$ et $C = 100\\ \\mathrm{nF}$. Quelle est sa fréquence de " +
        "coupure à $-3\\ \\mathrm{dB}$ ? Quel gain, en rapport, donne-t-il à $1\\ \\mathrm{kHz}$ ?</p>",
      valeur: 1 / (TAU * 4.7e3 * 100e-9),
      unite: "Hz",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Fréquence de coupure $f_c$",
      etapes: [
        { texte: "Constante de temps : $\\tau = RC = 4{,}7 \\times 10^3 \\times 100 \\times 10^{-9} = 0{,}47\\ \\mathrm{ms}$." },
        { texte: "$f_c = 1/(2\\pi\\tau) = 1/(2\\pi \\times 4{,}7 \\times 10^{-4}) = 338{,}6\\ \\mathrm{Hz}$." },
        { texte: "À $1\\ \\mathrm{kHz}$ : $f/f_c = 2{,}953$, donc $G = 1/\\sqrt{1 + 2{,}953^2} = 0{,}321$, soit $-9{,}88\\ \\mathrm{dB}$." },
        { texte: "Contrôle par l'asymptote : $f_c/f = 0{,}339$, proche de $0{,}321$ ; l'écart vient de ce qu'on n'est qu'à une demi-décade de la coupure.", note: "Unités : ohms fois farads donnent des secondes, leur inverse des hertz." },
      ],
      visuelCorrection(conteneur, moteur) {
        bodeCorrection(moteur, conteneur, {
          titre: "Bode du passe-bas 4,7 kΩ et 100 nF",
          fMin: 10,
          fMax: 100000,
          fonction: (f) => cx.div(cx.c(1), cx.c(1, f / 338.63)),
          coupure: 338.63,
          libelleCoupure: "fc = 338,6 Hz",
        });
      },
    })
  );

  ressources.push(
    api.exercice.schema(cible, {
      id: "k-schema",
      titre: "Reconnaître un passe-haut",
      niveau: "fondamental",
      consigne: "Cliquez sur le seul filtre passe-haut.",
      enonce: "<p>Les trois circuits ci-dessous sont attaqués par une tension d'entrée à gauche ; la sortie est prise à vide entre les deux bornes de droite.</p>",
      viewBox: "0 0 560 200",
      description: "Trois filtres : a, résistance série et condensateur en sortie ; b, inductance série et résistance en sortie ; c, condensateur série et résistance en sortie",
      dessin: dessinTroisFiltres(),
      zones: [
        { x: 10, y: 20, largeur: 170, hauteur: 175, etiquette: "a" },
        { x: 190, y: 20, largeur: 170, hauteur: 175, etiquette: "b" },
        { x: 370, y: 20, largeur: 170, hauteur: 175, etiquette: "c", juste: true },
      ],
      etapes: [
        { texte: "En a, la sortie est sur le condensateur, dont l'impédance s'annule à haute fréquence : passe-bas." },
        { texte: "En b, l'inductance série bloque les hautes fréquences, et la sortie sur la résistance suit le courant : passe-bas aussi." },
        {
          texte: "En c, le condensateur série bloque le continu et laisse passer les hautes fréquences vers la résistance : c'est le passe-haut.",
          note: "Réflexe : regarder ce que devient chaque composant à fréquence nulle et à fréquence infinie.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        bodeCorrection(moteur, conteneur, {
          titre: "Bode du passe-haut c, pour fc = 1 kHz",
          fMin: 10,
          fMax: 100000,
          fonction: (f) => cx.div(cx.c(0, f / 1000), cx.c(1, f / 1000)),
          coupure: 1000,
          libelleCoupure: "fc",
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-charge",
      titre: "Coupure d'un passe-bas chargé",
      niveau: "intermédiaire",
      enonce:
        "<p>Un passe-bas $RC$, $R = 10\\ \\mathrm{k\\Omega}$ et $C = 100\\ \\mathrm{nF}$, alimenté par une source idéale, débite dans une " +
        "entrée de $10\\ \\mathrm{k\\Omega}$. Quelle est sa fréquence de coupure ? Quel est son gain en continu ?</p>",
      valeur: 1 / (TAU * 5e3 * 100e-9),
      unite: "Hz",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Fréquence de coupure chargée",
      etapes: [
        { texte: "À vide, $f_c = 1/(2\\pi \\times 10^4 \\times 10^{-7}) = 159{,}2\\ \\mathrm{Hz}$." },
        { texte: "Source éteinte, le condensateur voit $R \\parallel R_e = 10\\ \\mathrm{k\\Omega} \\parallel 10\\ \\mathrm{k\\Omega} = 5\\ \\mathrm{k\\Omega}$." },
        { texte: "$f_c = 1/(2\\pi \\times 5 \\times 10^3 \\times 10^{-7}) = 318{,}3\\ \\mathrm{Hz}$ : la coupure double." },
        { texte: "Gain en continu : $G_0 = R_e/(R + R_e) = 0{,}5$, soit $-6{,}02\\ \\mathrm{dB}$.", note: "Pour une mesure, il faut $R_e$ au moins dix fois plus grand que $R$, ou une correction du gain." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Gain à vide et chargé, 10 kΩ et 100 nF",
          xTitre: "log10(f / 1 Hz)",
          yTitre: "gain",
          yUnite: "dB",
          xMin: 0,
          xMax: 4.5,
          yMin: -40,
          yMax: 3,
          series: [
            { id: "v", nom: "à vide, fc = 159,2 Hz", couleur: "serie-1", epaisseur: 2.4, fonction: (l) => dB(cx.module(passeBasCharge(Math.pow(10, l), 1e4, 1e-7, 1e12).h)) },
            { id: "c", nom: "chargé par 10 kΩ, fc = 318,3 Hz", couleur: "serie-5", epaisseur: 2.4, fonction: (l) => dB(cx.module(passeBasCharge(Math.pow(10, l), 1e4, 1e-7, 1e4).h)) },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, Math.log10(318.31), -9.03, "318,3 Hz : -9,03 dB", false);
            ligneH(c, repere, couleurs, -6.02, "gain continu chargé : -6,02 dB", true, [2, 3]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-rlc",
      titre: "Surtension d'un RLC à la résonance",
      niveau: "intermédiaire",
      enonce:
        "<p>Un filtre $RLC$ série, sortie sur le condensateur, comporte $L = 10\\ \\mathrm{mH}$, $C = 10\\ \\mu\\mathrm{F}$ et " +
        "$R = 10\\ \\Omega$. Quel est son gain, en décibels, à la fréquence propre $f_0$ ?</p>",
      valeur: 20 * Math.log10((1 / 10) * Math.sqrt(10e-3 / 10e-6)),
      unite: "dB",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Gain à $f_0$",
      etapes: [
        { texte: "$f_0 = 1/(2\\pi\\sqrt{LC}) = 1/(2\\pi\\sqrt{10^{-7}}) = 503{,}3\\ \\mathrm{Hz}$." },
        { texte: "$\\zeta = \\dfrac{R}{2}\\sqrt{C/L} = 5 \\times \\sqrt{10^{-3}} = 0{,}158$ et $Q = 1/(2\\zeta) = 3{,}16$." },
        { texte: "À $f = f_0$, le dénominateur vaut $2j\\zeta$ : $G = 1/(2\\zeta) = Q = 3{,}16$, soit $20\\log_{10} 3{,}16 = +10{,}0\\ \\mathrm{dB}$." },
        { texte: "Le maximum exact, $1/(2\\zeta\\sqrt{1 - \\zeta^2}) = 3{,}20$, soit $10{,}1\\ \\mathrm{dB}$, est atteint un peu plus bas, à $490{,}5\\ \\mathrm{Hz}$.", note: "Ce filtre amplifie d'un facteur 3 toute perturbation voisine de $500\\ \\mathrm{Hz}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const f0 = 1 / (TAU * Math.sqrt(1e-7));
        const zeta = 5 * Math.sqrt(1e-3);
        traceCorrection(moteur, conteneur, {
          titre: "Gain du RLC, 10 mH, 10 µF, 10 Ω",
          xTitre: "log10(f / 1 Hz)",
          yTitre: "gain",
          yUnite: "dB",
          xMin: 1.5,
          xMax: 4,
          yMin: -40,
          yMax: 15,
          series: [{ id: "g", nom: "gain, sortie sur C", couleur: "serie-1", epaisseur: 2.6, fonction: (l) => dB(cx.module(rlc(Math.pow(10, l), f0, zeta, 0))) }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, Math.log10(f0), 10, "f0 = 503 Hz : +10,0 dB", false);
            ligneH(c, repere, couleurs, 0, "0 dB", true, [2, 3]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-accorde",
      titre: "Dimensionner un filtre accordé",
      niveau: "avancé",
      enonce:
        "<p>On veut un filtre d'harmonique accordé au rang $4{,}7$ fournissant $2\\ \\mathrm{kvar}$ par phase sous $230\\ \\mathrm{V}$, " +
        "$50\\ \\mathrm{Hz}$, en étoile. Quelle capacité par phase faut-il ? Calculez ensuite l'inductance et le rang d'antirésonance avec une " +
        "source de réactance $X_s = 0{,}0641\\ \\Omega$.</p>",
      valeur: 1e6 / (W50 * ((VS * VS) / 2000 / (1 - 1 / (4.7 * 4.7)))),
      unite: "µF",
      tolerance: 0.015,
      chiffres: 1,
      libelleChamp: "Capacité par phase $C$",
      etapes: [
        { texte: "Réactance nette à $50\\ \\mathrm{Hz}$ : $X_C - X_L = V^2/Q_f = 230^2/2000 = 26{,}45\\ \\Omega$." },
        { texte: "Accord : $X_L = X_C/h_r^2$, donc $X_C(1 - 1/4{,}7^2) = 26{,}45$ et $X_C = 26{,}45/0{,}9547 = 27{,}70\\ \\Omega$." },
        { texte: "$C = 1/(2\\pi \\times 50 \\times 27{,}70) = 114{,}9\\ \\mu\\mathrm{F}$ ; $X_L = 27{,}70/22{,}09 = 1{,}254\\ \\Omega$, soit $L = 3{,}99\\ \\mathrm{mH}$." },
        { texte: "Antirésonance : $h_{ar} = \\sqrt{X_C/(X_L + X_s)} = \\sqrt{27{,}70/1{,}318} = 4{,}58$, sous le rang d'accord comme attendu." },
        { texte: "Tension fondamentale des condensateurs : $230 \\times 22{,}09/21{,}09 = 240{,}9\\ \\mathrm{V}$, soit $+4{,}7\\ \\%$, à couvrir par leur tension assignée.", note: "Plus la source est puissante, plus $h_{ar}$ se rapproche de $h_r$ et moins le filtre détourne de courant." },
      ],
      visuelCorrection(conteneur, moteur) {
        const f = filtreAccorde(2000, 4.7, 30);
        traceCorrection(moteur, conteneur, {
          titre: "Impédance du filtre seul et du filtre en parallèle avec la source",
          xTitre: "rang h",
          yTitre: "|Z|",
          yUnite: "Ω",
          xMin: 1,
          xMax: 10,
          yMin: 0,
          yMax: 3,
          echantillons: 900,
          series: [
            { id: "f", nom: "filtre seul, minimum au rang 4,7", couleur: "serie-5", epaisseur: 2.2, fonction: (h) => cx.module(impedanceFiltre(h, f)) },
            {
              id: "p",
              nom: "filtre et source en parallèle",
              couleur: "serie-1",
              epaisseur: 2.8,
              fonction: (h) => cx.module(cx.inverse(cx.plus(cx.inverse(impedanceFiltre(h, f)), cx.inverse(cx.c(0, h * XS))))),
            },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 4.7, "accord 4,7", 1.2, [6, 4]);
            ligneV(c, repere, couleurs, 4.58, "", 1.2, [2, 3]);
            marquerPoint(c, repere, couleurs, 4.58, 2.8, "antirésonance 4,58", true);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Diagnostic d'une mesure filtrée",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Pour supprimer un bruit, un technicien a placé un filtre $RC$ de $10\\ \\mathrm{k\\Omega}$ et $10\\ \\mu\\mathrm{F}$ devant une entrée " +
        "analogique $0$ à $10\\ \\mathrm{V}$ de $100\\ \\mathrm{k\\Omega}$. Depuis, la mesure est stable mais lit environ $9\\ \\%$ de moins que " +
        "l'indicateur local, et la boucle de régulation qu'elle alimente oscille. Quelles explications sont exactes ?</p>",
      options: [
        { texte: "Le filtre et l'entrée forment un diviseur : le gain en continu vaut $100/110 = 0{,}909$.", juste: true },
        { texte: "La constante de temps, $90{,}9\\ \\mathrm{ms}$, ajoute un retard de phase dans la boucle, qui réduit sa marge de stabilité.", juste: true },
        { texte: "Le condensateur fuit : un condensateur neuf supprimerait l'écart de $9\\ \\%$." },
        { texte: "Remède : résistance de $1\\ \\mathrm{k\\Omega}$ et condensateur adapté au besoin réel de filtrage, puis réglage de la boucle vérifié.", juste: true },
      ],
      etapes: [
        { texte: "En continu, le condensateur est ouvert : $u_s = 10 \\times 100/(10 + 100) = 9{,}09\\ \\mathrm{V}$ pour $10\\ \\mathrm{V}$, soit $-9{,}1\\ \\%$." },
        { texte: "La résistance vue par le condensateur vaut $10 \\parallel 100 = 9{,}09\\ \\mathrm{k\\Omega}$, d'où $\\tau = 90{,}9\\ \\mathrm{ms}$ et $f_c = 1{,}75\\ \\mathrm{Hz}$." },
        { texte: "Un retard de cet ordre dans une boucle rapide réduit la marge de phase : oscillations. Une fuite du condensateur donnerait un écart variable, pas un rapport exact de $100/110$." },
        { texte: "Avec $1\\ \\mathrm{k\\Omega}$, l'erreur tombe à $1\\ \\%$, que l'automate peut corriger, et la capacité se choisit d'après la fréquence du bruit, pas au plus grand.", note: "Le diagnostic se confirme en mesurant la tension à vide de la sortie du filtre." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réponse de la mesure à un échelon de 10 V",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "tension lue",
          yUnite: "V",
          xMin: 0,
          xMax: 500,
          yMin: 0,
          yMax: 11,
          series: [
            { id: "i", nom: "indicateur local", couleur: "serie-6", epaisseur: 1.6, fonction: (t) => (t > 0 ? 10 : 0) },
            { id: "m", nom: "mesure filtrée et chargée", couleur: "serie-5", epaisseur: 2.8, fonction: (t) => (10 * 100) / 110 * (1 - Math.exp(-t / 90.909)) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 9.091, "9,09 V : -9,1 %", true, [2, 3]);
            marquerPoint(c, repere, couleurs, 90.9, 9.091 * (1 - Math.exp(-1)), "τ = 90,9 ms", false);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Pourquoi deux cellules ne se multiplient pas",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi deux cellules $RC$ identiques raccordées directement n'ont pas pour fonction de transfert le carré " +
        "de celle d'une cellule, et comment on peut s'en rapprocher.</p>",
      motsCles: [["charge", "courant", "preleve", "debite"], ["tampon", "suiveur", "impedance", "dix fois", "grande"], ["premiere", "cellule", "interaction"]],
      minimum: 2,
      exemple: "Deux ou trois phrases : ce que la deuxième cellule fait à la première, puis le remède.",
      etapes: [
        { texte: "La fonction de transfert d'une cellule est calculée à vide, sans courant de sortie." },
        { texte: "La deuxième cellule prélève un courant sur la sortie de la première : elle la charge, et la première ne délivre plus sa tension à vide." },
        { texte: "Le dénominateur devient $1 + 3jx - x^2$ au lieu de $1 + 2jx - x^2$ : la coupure à $-3\\ \\mathrm{dB}$ tombe de $0{,}644$ à $0{,}374/(2\\pi RC)$." },
        { texte: "Remèdes : un étage tampon de haute impédance d'entrée entre les cellules, ou une deuxième cellule d'impédance dix fois plus grande, $10R$ et $C/10$.", note: "Les deux versions gardent la même pente finale de $-40\\ \\mathrm{dB}$ par décade." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Une cellule, deux cellules sans tampon, deux cellules avec tampon",
          xTitre: "log10(ωRC)",
          yTitre: "gain",
          yUnite: "dB",
          xMin: -2,
          xMax: 2,
          yMin: -80,
          yMax: 3,
          series: [
            { id: "u", nom: "une cellule", couleur: "serie-6", epaisseur: 1.6, fonction: (l) => dB(1 / Math.sqrt(1 + Math.pow(10, 2 * l))) },
            { id: "s", nom: "deux cellules sans tampon", couleur: "serie-5", epaisseur: 2.8, fonction: (l) => dB(cx.module(cx.inverse(cx.c(1 - Math.pow(10, 2 * l), 3 * Math.pow(10, l))))) },
            { id: "t", nom: "deux cellules avec tampon", couleur: "serie-1", epaisseur: 2.2, fonction: (l) => dB(1 / (1 + Math.pow(10, 2 * l))) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, -3.01, "-3 dB", false, [2, 3]);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

function dessinRlQuiz() {
  let d = '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">';
  d += '<circle cx="60" cy="110" r="20"/><path d="M50 110c3 -7 7 -7 10 0s7 7 10 0"/>';
  d += '<path d="M60 90V50H120"/><rect x="120" y="40" width="60" height="20" rx="3"/><path d="M180 50H300V70"/>';
  d += '<path d="M300 70a10 10 0 0 1 0 20a10 10 0 0 1 0 20a10 10 0 0 1 0 20V180H60V130"/>';
  d += "</g>";
  d += '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';
  d += texte(140, 34, "R") + texte(318, 116, "L") + texte(20, 114, "ue") + texte(72, 84, "+") + texte(60, 200, "référence");
  d += "</g>";
  return d;
}

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Quelle est la pente asymptotique du gain d'un passe-bas du deuxième ordre au-delà de sa fréquence propre ?</p>",
        options: ["$-40\\ \\mathrm{dB}$ par décade", "$-20\\ \\mathrm{dB}$ par décade", "$-6\\ \\mathrm{dB}$ par décade", "$-12\\ \\mathrm{dB}$ par décade"],
        bonnes: [0],
        explication: "$G \\approx (f_0/f)^2$ : un facteur 100 par décade, soit $-40\\ \\mathrm{dB}$. On l'écrit aussi $-12\\ \\mathrm{dB}$ par octave.",
        resume: "Pente d'un deuxième ordre",
      },
      {
        type: "vraiFaux",
        enonce: "<p>À sa fréquence de coupure, un passe-bas $RC$ du premier ordre à vide a un gain de $-3\\ \\mathrm{dB}$ et retarde la sortie de $45^\\circ$.</p>",
        reponse: true,
        explication: "$\\underline{H}(f_c) = 1/(1 + j)$ : module $1/\\sqrt{2}$, soit $-3{,}01\\ \\mathrm{dB}$, argument $-45^\\circ$.",
        resume: "Gain et phase à la coupure",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la fréquence de coupure, en hertz, d'un passe-bas $RC$ avec $R = 10\\ \\mathrm{k\\Omega}$ et $C = 10\\ \\mathrm{nF}$ ?</p>",
        valeur: 1 / (TAU * 1e4 * 1e-8),
        unite: "Hz",
        tolerance: 0.01,
        chiffres: 0,
        explication: "$f_c = 1/(2\\pi \\times 10^4 \\times 10^{-8}) = 1/(2\\pi \\times 10^{-4}) = 1592\\ \\mathrm{Hz}$.",
        resume: "Coupure d'un RC",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est, en décibels et arrondi à l'unité, le gain d'un passe-bas du premier ordre à cent fois sa fréquence de coupure ?</p>",
        valeur: -40,
        unite: "dB",
        tolerance: 0.02,
        chiffres: 0,
        explication: "$G = 1/\\sqrt{1 + 100^2} \\approx 0{,}01$, soit $-40\\ \\mathrm{dB}$ : deux décades à $-20\\ \\mathrm{dB}$ chacune.",
        resume: "Deux décades au-delà de la coupure",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi un circuit $RC$ dont la sortie est prise sur le condensateur est-il un passe-bas ?</p>",
        motsCles: [["impedance", "reactance"], ["diminue", "decroit", "faible", "court", "baisse"], ["frequence", "haute"]],
        minimum: 2,
        explication: "L'impédance du condensateur, $1/(C\\omega)$, diminue quand la fréquence augmente : à haute fréquence il court-circuite la sortie, à basse fréquence il est presque ouvert et la sortie recopie l'entrée.",
        resume: "Mécanisme du passe-bas",
      },
      {
        type: "schema",
        enonce: "<p>Sur ce circuit $RL$ série, entre quels points faut-il prendre la sortie pour obtenir un passe-haut ?</p>",
        consigne: "Cliquez sur la zone correspondante.",
        viewBox: "0 0 380 220",
        description: "Circuit RL série : source ue, résistance R en haut, inductance L à droite, retour par la référence en bas",
        dessin: dessinRlQuiz(),
        zones: [
          { x: 112, y: 26, largeur: 76, hauteur: 46, etiquette: "bornes de R" },
          { x: 280, y: 62, largeur: 64, hauteur: 80, etiquette: "bornes de L", juste: true },
        ],
        explication: "L'impédance $jL\\omega$ croît avec la fréquence : à haute fréquence presque toute la tension se retrouve aux bornes de l'inductance, à basse fréquence presque aucune. Sur $R$, on obtiendrait le passe-bas.",
        resume: "Sortie d'un passe-haut RL",
      },
      {
        type: "qcm",
        enonce: "<p>On charge la sortie d'un passe-bas $RC$ par une résistance $R_e$ égale à $R$. Que se passe-t-il ?</p>",
        options: [
          "Le gain en continu tombe à 0,5 et la coupure double",
          "Le gain en continu reste 1 et la coupure double",
          "Le gain en continu tombe à 0,5 et la coupure est divisée par deux",
          "Rien : la charge n'agit pas sur un filtre passif",
        ],
        bonnes: [0],
        explication: "Thévenin vu du condensateur : tension $\\underline{U}_e/2$ et résistance $R/2$. Le gain continu vaut $0{,}5$ et $f_c = 1/(2\\pi (R/2) C)$ double.",
        resume: "Effet de la charge",
      },
      {
        type: "calcul",
        enonce: "<p>Un passe-bas $RL$, sortie sur la résistance, a $L = 0{,}5\\ \\mathrm{H}$ et $R = 10\\ \\Omega$. Quelle est sa fréquence de coupure, en hertz ?</p>",
        valeur: 10 / (TAU * 0.5),
        unite: "Hz",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$\\tau = L/R = 50\\ \\mathrm{ms}$ et $f_c = R/(2\\pi L) = 10/\\pi = 3{,}18\\ \\mathrm{Hz}$.",
        resume: "Coupure d'un RL",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Un filtre accordé raccordé en dérivation sur un jeu de barres alimenté par une source inductive crée une antirésonance à un rang inférieur à son rang d'accord.</p>",
        reponse: true,
        explication: "Sous l'accord, le filtre est capacitif et résonne en parallèle avec l'inductance de la source : $h_{ar} = \\sqrt{X_C/(X_L + X_s)} \\lt h_r$.",
        resume: "Antirésonance d'un filtre accordé",
      },
      {
        type: "calcul",
        enonce: "<p>Un $RLC$ série comporte $L = 10\\ \\mathrm{mH}$, $C = 1\\ \\mu\\mathrm{F}$ et $R = 50\\ \\Omega$. Quel est son facteur de qualité $Q$ ?</p>",
        valeur: (1 / 50) * Math.sqrt(10e-3 / 1e-6),
        unite: "",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$Q = \\dfrac{1}{R}\\sqrt{L/C} = \\dfrac{1}{50}\\sqrt{10^4} = 2$, donc $\\zeta = 0{,}25$ : le gain culmine à environ $+6\\ \\mathrm{dB}$ près de $f_0$.",
        resume: "Facteur de qualité",
      },
    ],
    { titre: "Dix questions sur les filtres passifs" }
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
      { categorie: "Définition", question: "Qu'est-ce qu'un filtre passif ?", reponse: "Un circuit de résistances, d'inductances et de condensateurs, sans amplification, dont le gain et la phase dépendent de la fréquence." },
      { categorie: "Premier ordre", question: "Que valent gain et phase d'un passe-bas du premier ordre à sa coupure ?", reponse: "$1/\\sqrt{2}$, soit $-3\\ \\mathrm{dB}$, et $-45^\\circ$." },
      { categorie: "Formule", question: "Quelles sont les coupures d'un RC et d'un RL ?", reponse: "$f_c = 1/(2\\pi RC)$ et $f_c = R/(2\\pi L)$, soit $1/(2\\pi\\tau)$ dans les deux cas." },
      { categorie: "Décibels", question: "Combien de décibels pour un rapport de tensions de 10, de 2, de 1/√2 ?", reponse: "$+20$, $+6{,}02$ et $-3{,}01\\ \\mathrm{dB}$." },
      { categorie: "Ordre", question: "Que fixe l'ordre d'un filtre ?", reponse: "La pente finale, $20\\,n$ décibels par décade, et le déphasage final, $n \\times 90^\\circ$." },
      { categorie: "Charge", question: "Avec quelle résistance calcule-t-on la coupure d'un RC réel ?", reponse: "Avec la résistance de Thévenin vue par le condensateur : $(R_s + R) \\parallel R_e$. La charge abaisse aussi le gain continu." },
      { categorie: "Cascade", question: "Deux RC égaux raccordés directement ont-ils pour transfert $1/(1 + jx)^2$ ?", reponse: "Non : $1/(1 + 3jx - x^2)$, coupure à $0{,}374/(2\\pi RC)$, à cause du courant prélevé par la deuxième cellule." },
      { categorie: "Deuxième ordre", question: "Quand un RLC passe-bas présente-t-il une surtension ?", reponse: "Quand $\\zeta \\lt 0{,}707$ ; à $f_0$, le gain vaut $Q = 1/(2\\zeta)$." },
      { categorie: "Gabarit", question: "Que faire si les deux bornes d'un gabarit sont incompatibles au premier ordre ?", reponse: "Monter en ordre : cascade de cellules, RLC, ou filtre actif. Toute atténuation supplémentaire se paie en retard." },
      {
        categorie: "Industriel",
        question: "Pourquoi le filtre accordé au rang 4,7 a-t-il été écarté pour le tableau général du site ?",
        reponse: "Il ne détourne que $45\\ \\%$ du rang 5, la source étant puissante, ne ramène le $\\mathrm{THD}_V$ que de $4{,}53$ à $3{,}93\\ \\%$ et déplace la résonance du compresseur au rang $19{,}1$.",
        rappel: "Le levier réel est la self anti-harmonique de la compensation du compresseur.",
      },
    ],
    { titre: "Dix cartes sur les filtres passifs" }
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
        enonce: "<p>Cette séance. Quelle atténuation, en décibels et en valeur positive, un passe-bas du premier ordre apporte-t-il à dix fois sa fréquence de coupure ?</p>",
        valeur: 10 * Math.log10(101),
        unite: "dB",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$G = 1/\\sqrt{101}$, soit $10\\log_{10} 101 = 20{,}04\\ \\mathrm{dB}$ d'atténuation : l'asymptote, $20\\ \\mathrm{dB}$, est déjà presque exacte une décade après la coupure.",
        resume: "Une décade au-delà de la coupure",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Cette séance. Deux cellules $RC$ identiques raccordées directement ont la même fréquence de coupure à $-3\\ \\mathrm{dB}$ qu'une cellule seule.</p>",
        reponse: false,
        explication: "Leur coupure tombe à $0{,}374/(2\\pi RC)$, près de trois fois plus bas, à cause de l'interaction entre les cellules.",
        resume: "Coupure d'une cascade",
      },
      {
        type: "qcm",
        enonce: "<p>Cette séance. Il faut $60\\ \\mathrm{dB}$ d'atténuation à dix fois la coupure. Quel ordre minimal, en raisonnant sur les asymptotes ?</p>",
        options: ["3", "1", "2", "6"],
        bonnes: [0],
        explication: "Une décade au-delà de la coupure, un ordre $n$ apporte environ $20\\,n\\ \\mathrm{dB}$ : il faut $n = 3$. En pratique, on garde une marge, car le gain réel près de la coupure est au-dessus de l'asymptote pour une réponse sans surtension.",
        resume: "Choix de l'ordre",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/harmoniques-et-qualite-de-l-energie\">Harmoniques et qualité de l'énergie</a>. Un courant comporte $I_1 = 20\\ \\mathrm{A}$, $I_5 = 4\\ \\mathrm{A}$ et $I_7 = 3\\ \\mathrm{A}$. Quel est son taux de distorsion rapporté au fondamental, en pourcentage ?</p>",
        valeur: 25,
        unite: "%",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$\\sqrt{4^2 + 3^2}/20 = 5/20 = 25\\ \\%$.",
        resume: "Calcul d'un THD",
      },
      {
        type: "qcm",
        enonce: "<p>Cours <a href=\"#/cours/harmoniques-et-qualite-de-l-energie\">Harmoniques et qualité de l'énergie</a>. Quels rangs contient le courant d'un pont de diodes triphasé idéal ?</p>",
        options: ["5, 7, 11, 13", "3, 5, 7, 9", "2, 4, 6, 8", "3, 9, 15, 21"],
        bonnes: [0],
        explication: "Les rangs $6k \\pm 1$, d'amplitude $I_1/h$ dans le modèle idéal ; ni rangs pairs, ni multiples de 3.",
        resume: "Spectre d'un pont triphasé",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/correction-du-facteur-de-puissance\">Correction du facteur de puissance</a>. Une charge de $10\\ \\mathrm{kW}$ passe de $\\cos\\varphi = 0{,}80$ à $0{,}95$. Quelle puissance réactive de compensation faut-il, en kilovars ?</p>",
        valeur: 10 * (Math.tan(Math.acos(0.8)) - Math.tan(Math.acos(0.95))),
        unite: "kvar",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$Q_C = P(\\tan\\varphi_1 - \\tan\\varphi_2) = 10 \\times (0{,}750 - 0{,}329) = 4{,}21\\ \\mathrm{kvar}$. Un filtre accordé fournit lui aussi du réactif, à compter dans ce bilan.",
        resume: "Puissance de compensation",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/associations-de-resistances-et-diviseurs\">Associations de résistances et diviseurs</a>. Un diviseur de deux résistances de $10\\ \\mathrm{k\\Omega}$ alimenté sous $12\\ \\mathrm{V}$ est chargé par $10\\ \\mathrm{k\\Omega}$ sur sa sortie. Quelle tension de sortie, en volts ?</p>",
        valeur: 4,
        unite: "V",
        tolerance: 0.01,
        chiffres: 2,
        explication: "Le bras inférieur devient $10 \\parallel 10 = 5\\ \\mathrm{k\\Omega}$ : $u_s = 12 \\times 5/15 = 4\\ \\mathrm{V}$ au lieu de $6\\ \\mathrm{V}$. C'est le même mécanisme qui abaisse le gain continu d'un filtre chargé.",
        resume: "Diviseur chargé",
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
    titre: "Où en suis-je sur les filtres passifs ?",
  });
  if (auto) ressources.push(auto);
}
