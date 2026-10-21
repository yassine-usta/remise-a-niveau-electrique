/* ==========================================================================
   cours/transformateur-reel/cours.js
   Transformateur réel : flux commun et flux de fuite, schéma équivalent en T,
   schéma ramené au primaire, schéma de Kapp et chute de tension, pertes et
   rendement, diagramme de Fresnel complet, journée d'exploitation du
   transformateur du poste du site.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const RAC2 = Math.SQRT2;
const RAC3 = Math.sqrt(3);

/* Transformateur de l'exemple numérique : 2,5 kVA, 400 V / 230 V. */
const EX = { V1: 400, f: 50, N1: 600, N2: 345, m: 0.575, R1: 0.9, X1: 1.1, R2: 0.3, X2: 0.36, Rf: 4600, Xm: 2000, Sn: 2500 };
EX.V20 = EX.m * EX.V1;
EX.I2n = EX.Sn / EX.V20;
EX.Rs = EX.R2 + EX.m * EX.m * EX.R1;
EX.Xs = EX.X2 + EX.m * EX.m * EX.X1;
EX.P0 = (EX.V1 * EX.V1) / EX.Rf;
EX.Pcc = EX.Rs * EX.I2n * EX.I2n;
EX.ur = (100 * EX.Rs * EX.I2n) / EX.V20;
EX.ux = (100 * EX.Xs * EX.I2n) / EX.V20;

/* Transformateur du poste du site, hypothèses d'étude. */
const POSTE = { Sn: 100e3, U2n: 410, P0: 210, Pcc: 1750, ucc: 4, P: 64.8e3, Q: 11.06e3, Srms: 66.5e3 };
POSTE.ur = (100 * POSTE.Pcc) / POSTE.Sn;
POSTE.ux = Math.sqrt(POSTE.ucc * POSTE.ucc - POSTE.ur * POSTE.ur);
const PRISES = [-5, -2.5, 0, 2.5, 5];
/* Journée type, en kVA efficaces vrais, heure par heure : 66,5 kVA en pleine activité. */
const PROFIL = [22, 22, 22, 22, 22, 22, 45, 66.5, 66.5, 66.5, 66.5, 66.5, 48, 66.5, 66.5, 66.5, 66.5, 50, 50, 35, 35, 35, 22, 22].map(
  (s) => s / 66.5
);

/* --------------------------------------------------------------------------
   Nombres complexes
   -------------------------------------------------------------------------- */

const C = {
  n: (re, im = 0) => ({ re, im }),
  pol: (module, argument) => ({ re: module * Math.cos(argument), im: module * Math.sin(argument) }),
  add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
  mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  div: (a, b) => {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  },
  k: (a, k) => ({ re: a.re * k, im: a.im * k }),
  abs: (a) => Math.hypot(a.re, a.im),
  arg: (a) => Math.atan2(a.im, a.re),
  par: (a, b) => C.div(C.mul(a, b), C.add(a, b)),
};

/**
 * Résolution exacte du schéma en T de l'exemple, ramené au primaire.
 * x : taux de charge (impédance de charge 230 V / (x I2n)), phi : angle de la charge en degrés,
 * k : facteur appliqué aux impédances série et au courant à vide (1 pour l'appareil réel).
 */
function resoudreT(x, phi, k = 1) {
  const m2 = EX.m * EX.m;
  const V1 = C.n(EX.V1);
  const Z1 = C.n(k * EX.R1, k * EX.X1);
  const Zf = C.n(k * EX.R2 / m2, k * EX.X2 / m2);
  const Zm = C.k(C.par(C.n(EX.Rf), C.n(0, EX.Xm)), 1 / k);
  if (x <= 1e-6) {
    const I1 = C.div(V1, C.add(Z1, Zm));
    const E1 = C.sub(V1, C.mul(Z1, I1));
    return { V1, I1, E1, I0: I1, I2p: C.n(0), V2p: E1, I2: 0, V2: EX.m * C.abs(E1), Zf, Z1, Zm, vide: true };
  }
  const Z2p = C.pol(EX.V20 / (x * EX.I2n) / m2, phi * DEG);
  const Zb = C.add(Zf, Z2p);
  const Ze = C.add(Z1, C.par(Zm, Zb));
  const I1 = C.div(V1, Ze);
  const E1 = C.sub(V1, C.mul(Z1, I1));
  const I2p = C.div(E1, Zb);
  const I0 = C.div(E1, Zm);
  const V2p = C.mul(Z2p, I2p);
  return { V1, I1, E1, I0, I2p, V2p, I2: C.abs(I2p) / EX.m, V2: EX.m * C.abs(V2p), Zf, Z1, Zm, Z2p, vide: false };
}

/** Bilan de puissance de l'appareil réel pour une solution de resoudreT avec k = 1. */
function bilanT(s) {
  const P1 = EX.V1 * s.I1.re;
  const Q1 = -EX.V1 * s.I1.im;
  const pcu1 = EX.R1 * Math.pow(C.abs(s.I1), 2);
  const pcu2 = EX.R2 * s.I2 * s.I2;
  const pf = Math.pow(C.abs(s.E1), 2) / EX.Rf;
  const P2 = s.vide ? 0 : s.I2 * s.I2 * (s.Z2p.re * EX.m * EX.m);
  return { P1, Q1, pcu1, pcu2, pf, P2, eta: P1 > 0 ? P2 / P1 : 0 };
}

/** Tension composée du tableau général : uHta en kV, prise en %, coefficient de charge q (1 = pleine activité). */
function tensionTableau(uHta, prise, q) {
  const u20 = (POSTE.U2n * (uHta / 20)) / (1 + prise / 100);
  const chute = (q * (POSTE.ur * POSTE.P + POSTE.ux * POSTE.Q)) / POSTE.Sn / 100;
  return u20 - chute * POSTE.U2n;
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

function marqueur(id) {
  return (
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto-start-reverse">' +
    '<path d="M0 0 9 4 0 8Z" fill="currentColor"/></marker>'
  );
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

function segment(x0, y0, x1, y1) {
  return "M" + x0.toFixed(1) + " " + y0.toFixed(1) + "L" + x1.toFixed(1) + " " + y1.toFixed(1);
}

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

function pointTrace(c, repere, couleurs, x, y, libelle) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.fillStyle = couleurs.texte;
  c.beginPath();
  c.arc(px, py, 4.5, 0, TAU);
  c.fill();
  if (libelle) {
    c.font = POLICE;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.65;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -8 : 8), py - 8);
  }
  c.restore();
}

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

function barresCorrection(moteur, conteneur, options, barres) {
  const spectre = moteur.sim.spectre(conteneur, {
    genre: "Correction visuelle",
    ratio: 0.4,
    ...options,
  });
  if (spectre) {
    spectre.definirBarres(barres);
    ressources.push(spectre);
  }
  return spectre;
}

/** Schéma annoté inséré dans une correction, tracé progressivement. */
function schemaCorrection(moteur, conteneur, viewBox, dessin, legende) {
  const figure = document.createElement("figure");
  const svg = svgEl("svg", { viewBox, role: "img", "aria-label": legende });
  svg.innerHTML = dessin;
  figure.appendChild(svg);
  const texteLegende = document.createElement("figcaption");
  texteLegende.textContent = legende;
  figure.appendChild(texteLegende);
  conteneur.appendChild(figure);
  const trace = moteur.dessiner(svg, { duree: 1.4 });
  if (trace) ressources.push(trace);
}

/** Cadran d'angle : cercle, horizontale et libellés, centré en (x, y). */
function cadran(x, y, r, titre) {
  return (
    '<g fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.6">' +
    '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"/>' +
    '<path d="M' + (x - r - 10) + " " + y + "H" + (x + r + 10) + '"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
    texte(x - r, y - r - 12, titre) +
    texte(x + r + 4, y + 14, "0°") +
    texte(x - 26, y + r + 18, "inductif") +
    texte(x - 28, y - r + 26, "capacitif") +
    "</g>"
  );
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
  construireAnimFuites(racine, api);
  construireFresnelKapp(racine, api);
  construireSimRendement(racine, api);
  construireFresnelComplet(racine, api);
  construireSimPoste(racine, api);
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
    ["#d-ecarts-figure svg", 1.8],
    ["#e-complet-figure svg", 1.8],
    ["#e-ramene-figure svg", 1.6],
    ["#e-kapp-figure svg", 1.6],
    ["#f-schema-principal svg", 1.8],
    ["#h-donnees-figure svg", 1.6],
    ["#i-poste-figure svg", 1.6],
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
      id: "c-ramener",
      titre: "Impédance ramenée au primaire",
      niveau: "prérequis",
      enonce:
        "<p>Une résistance de $0{,}5\\ \\Omega$ est raccordée au secondaire d'un transformateur idéal $400\\ \\mathrm{V} / 230\\ \\mathrm{V}$. " +
        "Quelle résistance voit la source raccordée au primaire, en ohms ?</p>",
      valeur: 0.5 / (0.575 * 0.575),
      unite: "Ω",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Résistance vue du primaire",
      etapes: [
        { texte: "$m = 230/400 = 0{,}575$ ; une impédance du secondaire se ramène au primaire en la divisant par $m^2 = 0{,}330\\,6$." },
        { texte: "$0{,}5/0{,}330\\,6 = 1{,}512\\ \\Omega$." },
        {
          texte: "Contrôle par la puissance : sous $230\\ \\mathrm{V}$, $0{,}5\\ \\Omega$ dissipent $105{,}8\\ \\mathrm{kW}$ ; sous $400\\ \\mathrm{V}$, $1{,}512\\ \\Omega$ aussi.",
          note: "Cette séance ramène de la même façon $R_2$ et $X_2$ au primaire : $R_2' = R_2/m^2$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Résistance vue du primaire en fonction du rapport m",
          xTitre: "m",
          yTitre: "R vue",
          yUnite: "Ω",
          xMin: 0.3,
          xMax: 1,
          yMin: 0,
          yMax: 6,
          series: [{ id: "r", nom: "0,5 / m²", couleur: "serie-1", epaisseur: 2.6, fonction: (m) => 0.5 / (m * m) }],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 0.575, "m = 0,575");
            pointTrace(c, repere, couleurs, 0.575, 1.5123, "1,512 Ω");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-magnetisant",
      titre: "Courant dans une réactance magnétisante",
      niveau: "prérequis",
      enonce:
        "<p>Un bobinage sans pertes, de réactance $2000\\ \\Omega$ à $50\\ \\mathrm{Hz}$, est alimenté sous $400\\ \\mathrm{V}$. Quel courant " +
        "efficace absorbe-t-il, en ampères ? Quelle est son inductance ?</p>",
      valeur: 0.2,
      unite: "A",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Courant $I_\\mu$",
      etapes: [
        { texte: "$I_\\mu = V/X_m = 400/2000 = 0{,}2\\ \\mathrm{A}$, en retard de $90^\\circ$ sur la tension." },
        { texte: "$L = X_m/\\omega = 2000/314{,}16 = 6{,}37\\ \\mathrm{H}$." },
        {
          texte: "Dans un transformateur, ce courant entretient le flux et existe même à vide : c'est le courant magnétisant.",
          note: "Il est fixé par la tension et le noyau, pas par la charge, comme l'a montré le cours Circuits magnétiques.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Tension et courant magnétisant sur une période",
          xTitre: "ωt",
          xUnite: "°",
          yTitre: "valeur relative",
          xMin: 0,
          xMax: 360,
          yMin: -1.2,
          yMax: 1.2,
          series: [
            { id: "v", nom: "v / V crête", couleur: "serie-1", epaisseur: 2.4, fonction: (d) => Math.cos(d * DEG) },
            { id: "i", nom: "i / I crête, en retard de 90°", couleur: "serie-5", epaisseur: 2.4, fonction: (d) => Math.sin(d * DEG) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 90, "90°");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm("#c-minitest", {
      id: "c-phaseurs",
      titre: "Tensions aux bornes de R et de X",
      niveau: "prérequis",
      enonce:
        "<p>Un courant $\\underline{I} = 10\\angle{-30^\\circ}\\ \\mathrm{A}$ traverse une résistance de $0{,}6\\ \\Omega$ en série avec une " +
        "réactance inductive de $0{,}8\\ \\Omega$. Quelles affirmations sont exactes ?</p>",
      options: [
        { texte: "La tension aux bornes de la résistance vaut $6\\angle{-30^\\circ}\\ \\mathrm{V}$.", juste: true },
        { texte: "La tension aux bornes de la réactance vaut $8\\angle 60^\\circ\\ \\mathrm{V}$.", juste: true },
        { texte: "La tension totale vaut $14\\ \\mathrm{V}$ efficaces." },
        { texte: "La tension totale vaut $10\\angle 23{,}13^\\circ\\ \\mathrm{V}$.", juste: true },
      ],
      etapes: [
        { texte: "$R\\underline{I}$ est en phase avec le courant : $6\\angle{-30^\\circ}$." },
        { texte: "$jX\\underline{I}$ est en avance de $90^\\circ$ : $8\\angle 60^\\circ$." },
        {
          texte: "Les deux sont en quadrature : module $\\sqrt{6^2 + 8^2} = 10\\ \\mathrm{V}$, argument $-30^\\circ + \\arctan(8/6) = 23{,}13^\\circ$.",
          note: "C'est le petit triangle des chutes du diagramme de Kapp : jamais une somme arithmétique.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 420 230",
          "<defs>" + marqueur("fl-c-ph") + "</defs>" +
            '<g fill="none" stroke="currentColor" stroke-width="1" opacity="0.6"><path d="M30 150H400M60 220V20"/></g>' +
            '<g fill="none" stroke="currentColor" stroke-linecap="round">' +
            '<path d="M60 150L103.3 175" stroke-width="1.2" marker-end="url(#fl-c-ph)"/>' +
            '<path d="M60 150L122.4 186" stroke-width="2.4" marker-end="url(#fl-c-ph)"/>' +
            '<path d="M122.4 186L170.4 102.9" stroke-width="2.2" stroke-dasharray="2 3" marker-end="url(#fl-c-ph)"/>' +
            '<path d="M60 150L170.4 102.9" stroke-width="2.2" stroke-dasharray="7 5" marker-end="url(#fl-c-ph)"/>' +
            "</g>" +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
            '<text x="70" y="200">I, -30°</text><text x="126" y="206">R I = 6 V</text><text x="152" y="150">X I = 8 V</text>' +
            '<text x="180" y="100">total 10 V, 23,13°</text><text x="40" y="20">échelle : 12 px par volt</text></g>',
          "Phaseurs de l'exercice : le courant en trait fin à -30 degrés, la chute R I en trait plein épais dans la même direction, la chute X I en pointillés, perpendiculaire, et la tension totale en tirets, de 10 V à 23,13 degrés."
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : flux commun et flux de fuite
   -------------------------------------------------------------------------- */

function construireAnimFuites(racine, api) {
  const conteneur = racine.querySelector("#d-anim");
  if (!conteneur) return;

  const etat = { x: 1, cos: 0.8, phase: 40 };
  const omega = TAU * EX.f;
  const phiVide = (RAC2 * C.abs(resoudreT(0, 0).E1)) / (EX.N1 * omega);
  const T0 = 400;
  const T1 = 700;
  const YH = 110;
  const DH = 62;
  const YB = 268;
  const DB = 62;
  const YP = 370;
  const versT = (deg) => T0 + ((T1 - T0) * deg) / 360;

  const svg = svgEl("svg", {
    viewBox: "0 0 720 400",
    role: "img",
    "aria-label": "Transformateur en charge : flux commun et flux de fuite autour de chaque enroulement, et formes d'onde des flux, du courant primaire et de la chute interne sur une période",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-d-anim");
  const noyau = svgEl("path", {
    d: "M60 60H300V320H60Z M110 110V270H250V110Z",
    fill: "rgba(128,128,128,0.16)",
    "fill-rule": "evenodd",
    stroke: "currentColor",
    "stroke-width": 2,
  });
  const bobinages = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round" });
  bobinages.innerHTML =
    '<path d="M50 152L120 144M50 168L120 160M50 184L120 176M50 200L120 192M50 216L120 208M50 232L120 224"/>' +
    '<path d="M50 152H24M50 232V250H24"/>' +
    '<path d="M240 144L310 152M240 160L310 168M240 176L310 184M240 192L310 200M240 208L310 216M240 224L310 232"/>' +
    '<path d="M310 152H350V168M310 232V250H350V226"/>' +
    '<rect x="340" y="168" width="20" height="58" rx="3"/>';
  const ligneMoyenne = svgEl("path", {
    d: "M85 85H275V295H85Z",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.4,
    "stroke-dasharray": "6 5",
    opacity: 0.7,
  });
  const boucles = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.4, "stroke-dasharray": "2 4" });
  const boucle1 = svgEl("path", { d: "M85 128C0 128 0 248 85 248C150 248 150 128 85 128" });
  const boucle2 = svgEl("path", { d: "M275 128C210 128 210 248 275 248C360 248 360 128 275 128" });
  boucles.append(boucle1, boucle2);
  const fluxFleches = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2.4, "stroke-linecap": "round" });
  const fuite1 = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round" });
  const fuite2 = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round" });
  const points = svgEl("g", { fill: "currentColor", stroke: "none" });
  points.innerHTML = '<circle cx="56" cy="136" r="4.5"/><circle cx="306" cy="138" r="4.5"/><circle cx="24" cy="152" r="3.5"/><circle cx="24" cy="250" r="3.5"/>';
  const axes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.55 });
  let traits = "M" + T0 + " " + YH + "H" + (T1 + 8) + "M" + T0 + " " + (YH + DH + 6) + "V" + (YH - DH - 6);
  traits += "M" + T0 + " " + YB + "H" + (T1 + 8) + "M" + T0 + " " + (YB + DB + 6) + "V" + (YB - DB - 6);
  for (const d of [90, 180, 270, 360]) traits += "M" + versT(d) + " " + (YH - 4) + "v8M" + versT(d) + " " + (YB - 4) + "v8";
  axes.innerHTML = '<path d="' + traits + '"/>';
  const piste = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1, opacity: 0.3, d: "M" + T0 + " " + YP + "H" + T1 });
  const courbePhi = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.4 });
  const courbeF1 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-dasharray": "7 5" });
  const courbeF2 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-dasharray": "2 3" });
  const courbeI1 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3 });
  const courbeChute = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-dasharray": "7 5" });
  const curseurT = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, "stroke-dasharray": "4 4", opacity: 0.85 });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  const libellesFixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  libellesFixes.innerHTML =
    texte(150, 40, "Φ commun") +
    texte(6, 120, "fuite 1") +
    texte(300, 120, "fuite 2") +
    texte(10, 345, "N1 = 600") +
    texte(10, 361, "400 V, 50 Hz") +
    texte(364, 202, "Z") +
    texte(T0 + 6, YH - DH - 10, "Φ ; x10 : fuite 1 tirets, 2 pointillés") +
    texte(T0 + 6, YB - DB - 10, "i1 épais ; v1 - e1 tirets, échelle propre") +
    texte(versT(180) - 14, YH + 18, "180°") +
    texte(versT(360) - 16, YH + 18, "360°") +
    texte(versT(180) - 14, YB + 18, "180°") +
    texte(versT(360) - 16, YB + 18, "360°") +
    texte(T0, YP + 22, "poignée : instant ωt");
  svg.append(defs, noyau, ligneMoyenne, boucles, bobinages, fluxFleches, fuite1, fuite2, points, axes, piste, courbeF2, courbeF1, courbePhi, courbeChute, courbeI1, curseurT, libellesFixes, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-anim-valeurs", [
    { id: "phase", libelle: "Instant ωt", unite: "°", decimales: 0 },
    { id: "phiC", libelle: "Flux commun crête", unite: "mWb", decimales: 3 },
    { id: "f1", libelle: "Fuite du primaire, par spire", unite: "µWb", decimales: 1 },
    { id: "f2", libelle: "Fuite du secondaire, par spire", unite: "µWb", decimales: 1 },
    { id: "rap", libelle: "Fuite 1 / flux commun", unite: "%", decimales: 2 },
    { id: "e1", libelle: "E1 efficace", unite: "V", decimales: 2 },
    { id: "chute", libelle: "|V1 - E1| efficace", unite: "V", decimales: 2 },
    { id: "i1", libelle: "I1 efficace", unite: "A", decimales: 3 },
    { id: "v2", libelle: "V2 efficace", unite: "V", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  let sol = null;
  let echI = 1;
  let echChute = 1;

  function instant(phaseur, theta) {
    return RAC2 * (phaseur.re * Math.cos(theta) - phaseur.im * Math.sin(theta));
  }

  function grandeurs(theta) {
    const phi = C.div(sol.E1, C.n(0, omega * EX.N1));
    const l1 = EX.X1 / omega;
    const l2 = EX.X2 / omega;
    const i2 = sol.vide ? C.n(0) : C.k(sol.I2p, 1 / EX.m);
    return {
      phi: instant(phi, theta),
      f1: (l1 * instant(sol.I1, theta)) / EX.N1,
      f2: (l2 * instant(i2, theta)) / EX.N2,
      i1: instant(sol.I1, theta),
      chute: instant(C.sub(sol.V1, sol.E1), theta),
    };
  }

  function tracer() {
    sol = resoudreT(etat.x, Math.acos(etat.cos) / DEG);
    echI = Math.max(0.3, RAC2 * C.abs(sol.I1) * 1.12);
    echChute = Math.max(0.5, RAC2 * C.abs(C.sub(sol.V1, sol.E1)) * 1.12);
    const echPhi = phiVide * 1.12;
    const pPhi = [];
    const pF1 = [];
    const pF2 = [];
    const pI1 = [];
    const pCh = [];
    for (let k = 0; k <= 180; k += 1) {
      const deg = k * 2;
      const g = grandeurs(deg * DEG);
      const x = versT(deg).toFixed(1);
      pPhi.push(x + " " + (YH - (DH * g.phi) / echPhi).toFixed(1));
      pF1.push(x + " " + (YH - (DH * 10 * g.f1) / echPhi).toFixed(1));
      pF2.push(x + " " + (YH - (DH * 10 * g.f2) / echPhi).toFixed(1));
      pI1.push(x + " " + (YB - (DB * g.i1) / echI).toFixed(1));
      pCh.push(x + " " + (YB - (DB * g.chute) / echChute).toFixed(1));
    }
    courbePhi.setAttribute("d", "M" + pPhi.join(" L"));
    courbeF1.setAttribute("d", "M" + pF1.join(" L"));
    courbeF2.setAttribute("d", "M" + pF2.join(" L"));
    courbeI1.setAttribute("d", "M" + pI1.join(" L"));
    courbeChute.setAttribute("d", "M" + pCh.join(" L"));
  }

  function fleche(x0, y0, x1, y1) {
    return '<path d="' + segment(x0, y0, x1, y1) + '" marker-end="url(#fl-d-anim)"/>';
  }

  /* Fuite maximale de l'animation, à 150 % de charge : sert d'échelle d'opacité. */
  const fuiteMax = (EX.X1 / omega) * RAC2 * C.abs(resoudreT(1.5, 0).I1) / EX.N1;

  function dessinerInstant() {
    const theta = etat.phase * DEG;
    const g = grandeurs(theta);
    const rel = g.phi / phiVide;
    const sens = rel >= 0 ? 1 : -1;
    fluxFleches.setAttribute("opacity", Math.max(0.08, Math.abs(rel)).toFixed(2));
    fluxFleches.innerHTML =
      fleche(85, 205 + 15 * sens, 85, 205 - 15 * sens) +
      fleche(180 - 15 * sens, 85, 180 + 15 * sens, 85) +
      fleche(275, 205 - 15 * sens, 275, 205 + 15 * sens) +
      fleche(180 + 15 * sens, 295, 180 - 15 * sens, 295);
    /* Fuite du primaire : monte dans la colonne quand i1 est positif, redescend par l'air. */
    const r1 = g.f1 / fuiteMax;
    const s1 = r1 >= 0 ? 1 : -1;
    fuite1.setAttribute("opacity", Math.max(0.05, Math.min(1, Math.abs(r1))).toFixed(2));
    fuite1.innerHTML = fleche(21, 188 - 12 * s1, 21, 188 + 12 * s1) + fleche(134, 188 - 12 * s1, 134, 188 + 12 * s1);
    /* Fuite du secondaire : i2 sortant par le point s'oppose au flux commun, donc monte dans la colonne de droite. */
    const r2 = g.f2 / fuiteMax;
    const s2 = r2 >= 0 ? 1 : -1;
    fuite2.setAttribute("opacity", Math.max(0.05, Math.min(1, Math.abs(r2))).toFixed(2));
    fuite2.innerHTML = fleche(339, 188 - 12 * s2, 339, 188 + 12 * s2) + fleche(226, 188 - 12 * s2, 226, 188 + 12 * s2);
    const xt = versT(etat.phase);
    curseurT.setAttribute("d", "M" + xt.toFixed(1) + " " + (YH - DH - 4) + "V" + (YB + DB + 4));
    libelles.innerHTML =
      texte(200, 345, "charge " + nombre(api, etat.x * 100, 0) + " %") +
      texte(200, 361, "cos φ2 = " + nombre(api, etat.cos, 2));
    if (valeurs) {
      const i2 = sol.vide ? 0 : sol.I2;
      valeurs.maj({
        phase: etat.phase,
        phiC: ((RAC2 * C.abs(sol.E1)) / (EX.N1 * omega)) * 1000,
        f1: ((EX.X1 / omega) * RAC2 * C.abs(sol.I1) * 1e6) / EX.N1,
        f2: ((EX.X2 / omega) * RAC2 * i2 * 1e6) / EX.N2,
        rap: (100 * (EX.X1 / omega) * C.abs(sol.I1) * omega) / C.abs(sol.E1),
        e1: C.abs(sol.E1),
        chute: C.abs(C.sub(sol.V1, sol.E1)),
        i1: C.abs(sol.I1),
        v2: sol.V2,
      });
    }
  }

  let synchro = false;
  let poignee = null;
  let lecteur = null;
  function appliquer(deg, source) {
    if (synchro) return;
    synchro = true;
    etat.phase = Math.max(0, Math.min(360, Number(deg)));
    dessinerInstant();
    if (source !== "poignee" && poignee) poignee.set(etat.phase, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(etat.phase);
    synchro = false;
  }

  tracer();

  poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: T0, y: YP },
    a: { x: T1, y: YP },
    min: 0,
    max: 360,
    pas: 2,
    valeur: etat.phase,
    unite: "°",
    libelle: "Instant ωt sur l'axe des temps",
    diffuserAuDepart: false,
    rappel(mesure) {
      appliquer(mesure.valeur, "poignee");
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-anim-curseurs",
    [
      { id: "x", libelle: "Charge, en fraction du courant assigné", min: 0, max: 1.5, pas: 0.05, valeur: etat.x, format: (v) => nombre(api, v * 100, 0) + " %" },
      { id: "cos", libelle: "Facteur de puissance de la charge, inductif", min: 0.3, max: 1, pas: 0.01, valeur: etat.cos, format: (v) => nombre(api, v, 2) },
    ],
    (lues) => {
      Object.assign(etat, lues);
      tracer();
      dessinerInstant();
    }
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#d-anim-lecteur", {
    de: 0,
    a: 360,
    duree: 8,
    boucle: true,
    auto: false,
    libelle: "Une période de la tension du réseau",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  appliquer(40, null);
}

/* --------------------------------------------------------------------------
   E. Animation : diagramme de Kapp vu du secondaire
   -------------------------------------------------------------------------- */

function construireFresnelKapp(racine, api) {
  const conteneur = racine.querySelector("#e-fresnel");
  if (!conteneur) return;

  const etat = { phi: 36.87, x: 1, ur: EX.ur, ux: EX.ux, k: 6 };
  const O = { x: 40, y: 330 };
  const ECH = 360 / EX.V20;
  const DIAL = { x: 630, y: 200, r: 60 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 420",
    role: "img",
    "aria-label": "Diagramme de Kapp : tension V2 de référence, chutes résistive et réactive bout à bout, tension à vide m V1 sur un cercle de rayon V20, et cadran de réglage de l'angle du courant",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-fr");
  const fond = svgEl("g", {});
  fond.innerHTML =
    '<g fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.55"><path d="M' + (O.x - 20) + " " + O.y + "H" + 500 + "M" + O.x + " " + (O.y + 60) + "V" + 30 + '"/></g>' +
    cadran(DIAL.x, DIAL.y, DIAL.r, "angle du courant I2");
  const arc = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1, opacity: 0.7 });
  const R0 = EX.V20 * ECH;
  const a0 = -12 * DEG;
  const a1 = 48 * DEG;
  arc.setAttribute(
    "d",
    "M" + (O.x + R0 * Math.cos(a0)).toFixed(1) + " " + (O.y - R0 * Math.sin(a0)).toFixed(1) +
      "A" + R0 + " " + R0 + " 0 0 0 " + (O.x + R0 * Math.cos(a1)).toFixed(1) + " " + (O.y - R0 * Math.sin(a1)).toFixed(1)
  );
  const vecV2 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "marker-end": "url(#fl-e-fr)" });
  const vecR = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-dasharray": "7 5" });
  const vecX = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-dasharray": "2 3" });
  const vecV20 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3.4, "marker-end": "url(#fl-e-fr)" });
  const vecI = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.2, "marker-end": "url(#fl-e-fr)" });
  const rayon = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "marker-end": "url(#fl-e-fr)" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  const fixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  fixes.innerHTML = texte(O.x + R0 * Math.cos(30 * DEG) + 6, O.y - R0 * Math.sin(30 * DEG), "cercle V20") + texte(500, 410, "poignée : direction de I2");
  svg.append(defs, fond, arc, vecI, vecV2, vecR, vecX, vecV20, rayon, fixes, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-fresnel-valeurs", [
    { id: "phi", libelle: "φ2 (positif : inductif)", unite: "°", decimales: 1 },
    { id: "cos", libelle: "cos φ2", decimales: 3 },
    { id: "i2", libelle: "Courant I2", unite: "A", decimales: 2 },
    { id: "v2", libelle: "V2 calculée", unite: "V", decimales: 2 },
    { id: "dv", libelle: "Chute V20 - V2", unite: "V", decimales: 2 },
    { id: "dk", libelle: "Formule de Kapp", unite: "V", decimales: 2 },
    { id: "rel", libelle: "Chute relative", unite: "%", decimales: 2 },
    { id: "max", libelle: "Retard de chute maximale", unite: "°", decimales: 1 },
    { id: "nul", libelle: "Avance de chute nulle", unite: "°", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function solution(k) {
    const rs = (etat.ur / 100) * EX.V20 / EX.I2n;
    const xs = (etat.ux / 100) * EX.V20 / EX.I2n;
    const i = etat.x * EX.I2n;
    const p = -etat.phi * DEG;
    const dr = k * i * (rs * Math.cos(p) - xs * Math.sin(p));
    const di = k * i * (rs * Math.sin(p) + xs * Math.cos(p));
    const v2 = -dr + Math.sqrt(Math.max(0, EX.V20 * EX.V20 - di * di));
    return { rs, xs, i, p, v2 };
  }

  function dessiner() {
    const reel = solution(1);
    const vue = solution(etat.k);
    const p = vue.p;
    const p2 = { x: O.x + vue.v2 * ECH, y: O.y };
    const lr = etat.k * vue.rs * vue.i * ECH;
    const lx = etat.k * vue.xs * vue.i * ECH;
    const p3 = { x: p2.x + lr * Math.cos(p), y: p2.y - lr * Math.sin(p) };
    const p4 = { x: p3.x - lx * Math.sin(p), y: p3.y - lx * Math.cos(p) };
    vecV2.setAttribute("d", segment(O.x, O.y, p2.x, p2.y));
    vecR.setAttribute("d", lr > 0.5 ? segment(p2.x, p2.y, p3.x, p3.y) : "");
    vecX.setAttribute("d", lx > 0.5 ? segment(p3.x, p3.y, p4.x, p4.y) : "");
    vecV20.setAttribute("d", segment(O.x, O.y, p4.x, p4.y));
    vecI.setAttribute("d", etat.x > 0.005 ? segment(O.x, O.y, O.x + 80 * Math.cos(p), O.y - 80 * Math.sin(p)) : "");
    const t = -etat.phi * DEG;
    rayon.setAttribute("d", segment(DIAL.x, DIAL.y, DIAL.x + (DIAL.r - 8) * Math.cos(t), DIAL.y - (DIAL.r - 8) * Math.sin(t)));
    libelles.innerHTML =
      texte((O.x + p2.x) / 2 - 10, O.y + 18, "V2 = " + nombre(api, reel.v2, 1) + " V") +
      texte((O.x + p4.x) / 2 - 60, (O.y + p4.y) / 2 - 12, "m V1 = 230 V") +
      (etat.x > 0.005 ? texte(O.x + 86 * Math.cos(p), O.y - 86 * Math.sin(p) + 4, "I2") : "") +
      (lr > 12 ? texte((p2.x + p3.x) / 2 + 8, (p2.y + p3.y) / 2 + 14, "Rs I2") : "") +
      (lx > 12 ? texte((p3.x + p4.x) / 2 + 8, (p3.y + p4.y) / 2, "j Xs I2") : "") +
      texte(40, 410, "chutes agrandies x " + nombre(api, etat.k, 0) + " (appareil " + nombre(api, etat.k, 0) + " fois plus impédant)");
    if (valeurs) {
      const c = Math.cos(etat.phi * DEG);
      const s = Math.sin(etat.phi * DEG);
      valeurs.maj({
        phi: etat.phi,
        cos: c,
        i2: reel.i,
        v2: reel.v2,
        dv: EX.V20 - reel.v2,
        dk: reel.rs * reel.i * c + reel.xs * reel.i * s,
        rel: (100 * (EX.V20 - reel.v2)) / EX.V20,
        max: Math.atan2(etat.ux, etat.ur) / DEG,
        nul: Math.atan2(etat.ur, etat.ux) / DEG,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: { x: DIAL.x, y: DIAL.y },
    rayon: DIAL.r,
    min: -90,
    max: 90,
    boucle: false,
    pas: 1,
    valeur: -etat.phi,
    libelle: "Angle du courant I2 par rapport à V2",
    diffuserAuDepart: false,
    rappel(mesure) {
      let angle = mesure.angle;
      if (angle > 180) angle -= 360;
      etat.phi = -Math.max(-90, Math.min(90, angle));
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-fresnel-curseurs",
    [
      { id: "x", libelle: "Taux de charge I2 / I2n", min: 0, max: 1.5, pas: 0.05, valeur: etat.x, format: (v) => nombre(api, v * 100, 0) + " %" },
      { id: "ur", libelle: "Chute résistive relative ur", min: 0.5, max: 6, pas: 0.01, valeur: etat.ur, format: (v) => nombre(api, v, 2) + " %" },
      { id: "ux", libelle: "Chute réactive relative ux", min: 0.5, max: 8, pas: 0.01, valeur: etat.ux, format: (v) => nombre(api, v, 2) + " %" },
      { id: "k", libelle: "Agrandissement des chutes sur le dessin", min: 1, max: 10, pas: 1, valeur: etat.k, format: (v) => "x " + nombre(api, v, 0) },
    ],
    (lues) => {
      Object.assign(etat, lues);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : rendement en fonction de la charge
   -------------------------------------------------------------------------- */

function construireSimRendement(racine, api) {
  const etat = { P0: 34.8, Pcc: 70.6, cos: 0.8, x: 1 };
  const rendement = (x, cos) => {
    const p = x * EX.Sn * cos;
    return p > 0 ? (100 * p) / (p + etat.P0 + x * x * etat.Pcc) : 0;
  };

  const trace = api.sim.traceur("#e-sim-rendement-trace", {
    titre: "Rendement du transformateur de 2,5 kVA en fonction de la charge",
    xTitre: "x = S / Sn",
    yTitre: "rendement",
    yUnite: "%",
    xMin: 0,
    xMax: 1.5,
    yMin: 80,
    yMax: 100,
    series: [
      { id: "eta", nom: "cos φ réglé", couleur: "serie-1", epaisseur: 2.8, fonction: (x) => rendement(x, etat.cos) },
      { id: "un", nom: "cos φ = 1", couleur: "serie-5", epaisseur: 2, fonction: (x) => rendement(x, 1) },
    ],
    surDessin({ c, repere, couleurs }) {
      const opt = Math.sqrt(etat.P0 / etat.Pcc);
      ligneV(c, repere, couleurs, opt, "optimum " + nombre(api, opt, 3), [2, 3]);
      ligneV(c, repere, couleurs, etat.x, null);
      const y = rendement(etat.x, etat.cos);
      if (y >= 80) pointTrace(c, repere, couleurs, etat.x, y, nombre(api, y, 2) + " %");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-sim-rendement-valeurs", [
    { id: "pf", libelle: "Pertes fer", unite: "W", decimales: 1 },
    { id: "pcu", libelle: "Pertes cuivre", unite: "W", decimales: 1 },
    { id: "p2", libelle: "Puissance utile", unite: "W", decimales: 0 },
    { id: "eta", libelle: "Rendement", unite: "%", decimales: 2 },
    { id: "opt", libelle: "Charge optimale x", decimales: 3 },
    { id: "sopt", libelle: "Puissance apparente optimale", unite: "VA", decimales: 0 },
    { id: "max", libelle: "Rendement maximal", unite: "%", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    if (trace) trace.rafraichir();
    const opt = Math.sqrt(etat.P0 / etat.Pcc);
    if (valeurs) {
      valeurs.maj({
        pf: etat.P0,
        pcu: etat.x * etat.x * etat.Pcc,
        p2: etat.x * EX.Sn * etat.cos,
        eta: rendement(etat.x, etat.cos),
        opt,
        sopt: opt * EX.Sn,
        max: rendement(opt, etat.cos),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-sim-rendement-curseurs",
    [
      { id: "P0", libelle: "Pertes à vide P0", min: 5, max: 80, pas: 0.1, valeur: etat.P0, unite: "W" },
      { id: "Pcc", libelle: "Pertes en court-circuit Pcc", min: 20, max: 150, pas: 0.1, valeur: etat.Pcc, unite: "W" },
      { id: "cos", libelle: "Facteur de puissance de la charge", min: 0.3, max: 1, pas: 0.01, valeur: etat.cos, format: (v) => nombre(api, v, 2) },
      { id: "x", libelle: "Point de fonctionnement x", min: 0, max: 1.5, pas: 0.01, valeur: etat.x, format: (v) => nombre(api, v, 2) },
    ],
    (lues) => {
      Object.assign(etat, lues);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   H. Animation : diagramme de Fresnel complet du schéma en T
   -------------------------------------------------------------------------- */

function construireFresnelComplet(racine, api) {
  const conteneur = racine.querySelector("#h-fresnel");
  if (!conteneur) return;

  /* Charge de l'exemple : 23 ohms, soit x = 230 / (23 x 10,87) = 0,92 en admittance relative. */
  const etat = { phi: 36.87, x: EX.V20 / (23 * EX.I2n), k: 8 };
  const OV = { x: 30, y: 210 };
  const SV = 0.9;
  const OI = { x: 380, y: 280 };
  const SI = 30;
  const DIAL = { x: 640, y: 90, r: 52 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 580",
    role: "img",
    "aria-label": "Diagramme de Fresnel du schéma en T ramené au primaire : tensions V2 prime, E1 et V1 avec les chutes des deux enroulements, courants I2 prime, I0 et I1, et cadran de l'angle de la charge",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-h-fr");
  const fond = svgEl("g", {});
  fond.innerHTML =
    '<g fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.55"><path d="M' + (OV.x - 10) + " " + OV.y + "H" + 430 + "M" + OV.x + " " + (OV.y + 20) + "V" + 20 +
    "M" + (OI.x - 10) + " " + OI.y + "H" + 700 + "M" + OI.x + " " + 250 + "V" + 575 + '"/></g>' +
    cadran(DIAL.x, DIAL.y, DIAL.r, "angle de la charge") +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
    texte(OV.x + 4, OV.y + 40, "tensions, référence V2'") +
    texte(OI.x + 6, OI.y - 12, "courants") +
    "</g>";
  const vV2 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "marker-end": "url(#fl-h-fr)" });
  const vChute2 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-dasharray": "7 5" });
  const vE1 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.2, "marker-end": "url(#fl-h-fr)" });
  const vChute1 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-dasharray": "2 3" });
  const vV1 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3.4, "marker-end": "url(#fl-h-fr)" });
  const vI2 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2, "marker-end": "url(#fl-h-fr)" });
  const vI0 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-dasharray": "7 5", "marker-end": "url(#fl-h-fr)" });
  const vI1 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3.4, "marker-end": "url(#fl-h-fr)" });
  const rayon = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "marker-end": "url(#fl-h-fr)" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, vChute2, vChute1, vV2, vE1, vV1, vI2, vI0, vI1, rayon, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#h-fresnel-valeurs", [
    { id: "v2", libelle: "V2", unite: "V", decimales: 2 },
    { id: "chute", libelle: "Chute 230 - V2", unite: "V", decimales: 2 },
    { id: "i1", libelle: "I1", unite: "A", decimales: 3 },
    { id: "phi1", libelle: "Retard de I1 sur V1", unite: "°", decimales: 2 },
    { id: "cos1", libelle: "cos φ1", decimales: 3 },
    { id: "i0", libelle: "I0", unite: "A", decimales: 3 },
    { id: "pcu1", libelle: "Pcu1", unite: "W", decimales: 2 },
    { id: "pcu2", libelle: "Pcu2", unite: "W", decimales: 2 },
    { id: "pf", libelle: "Pfer", unite: "W", decimales: 2 },
    { id: "p1", libelle: "P1", unite: "W", decimales: 1 },
    { id: "p2", libelle: "P2", unite: "W", decimales: 1 },
    { id: "eta", libelle: "Rendement", unite: "%", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  /* Rotation : V2' horizontal. Un phaseur z devient un vecteur à l'écran. */
  function versEcran(z, rot, origine, echelle) {
    const r = C.mul(z, C.pol(1, -rot));
    return { x: origine.x + r.re * echelle, y: origine.y - r.im * echelle };
  }

  function dessiner() {
    const reel = resoudreT(etat.x, etat.phi, 1);
    const vue = resoudreT(etat.x, etat.phi, etat.k);
    const rot = vue.vide ? C.arg(vue.E1) : C.arg(vue.V2p);
    const pV2 = versEcran(vue.V2p, rot, OV, SV);
    const pE1 = versEcran(vue.E1, rot, OV, SV);
    const pV1 = versEcran(vue.V1, rot, OV, SV);
    const chute2 = vue.vide ? null : C.mul(C.n(vue.Zf.re, 0), vue.I2p);
    const pMil2 = vue.vide ? pV2 : versEcran(C.add(vue.V2p, chute2), rot, OV, SV);
    const chute1 = C.mul(C.n(vue.Z1.re, 0), vue.I1);
    const pMil1 = versEcran(C.add(vue.E1, chute1), rot, OV, SV);
    vV2.setAttribute("d", vue.vide ? "" : segment(OV.x, OV.y, pV2.x, pV2.y));
    vChute2.setAttribute("d", vue.vide ? "" : "M" + pV2.x.toFixed(1) + " " + pV2.y.toFixed(1) + "L" + pMil2.x.toFixed(1) + " " + pMil2.y.toFixed(1) + "L" + pE1.x.toFixed(1) + " " + pE1.y.toFixed(1));
    vE1.setAttribute("d", segment(OV.x, OV.y, pE1.x, pE1.y));
    vChute1.setAttribute("d", "M" + pE1.x.toFixed(1) + " " + pE1.y.toFixed(1) + "L" + pMil1.x.toFixed(1) + " " + pMil1.y.toFixed(1) + "L" + pV1.x.toFixed(1) + " " + pV1.y.toFixed(1));
    vV1.setAttribute("d", segment(OV.x, OV.y, pV1.x, pV1.y));
    const pI2 = versEcran(vue.I2p, rot, OI, SI);
    const pI1 = versEcran(vue.I1, rot, OI, SI);
    vI2.setAttribute("d", vue.vide ? "" : segment(OI.x, OI.y, pI2.x, pI2.y));
    vI0.setAttribute("d", segment(pI2.x, pI2.y, pI1.x, pI1.y));
    vI1.setAttribute("d", segment(OI.x, OI.y, pI1.x, pI1.y));
    const t = -etat.phi * DEG;
    rayon.setAttribute("d", segment(DIAL.x, DIAL.y, DIAL.x + (DIAL.r - 8) * Math.cos(t), DIAL.y - (DIAL.r - 8) * Math.sin(t)));
    /* Étiquettes des courants : I2' du côté opposé à I1, I1 au-delà de sa pointe. */
    const li = Math.hypot(pI1.x - OI.x, pI1.y - OI.y) || 1;
    const l2 = Math.hypot(pI2.x - OI.x, pI2.y - OI.y) || 1;
    let nx = (pI2.y - OI.y) / l2;
    let ny = -(pI2.x - OI.x) / l2;
    if ((pI1.x - OI.x) * nx + (pI1.y - OI.y) * ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    libelles.innerHTML =
      (vue.vide ? "" : texte(pV2.x - 30, pV2.y + 18, "V2'")) +
      texte(pE1.x + 8, pE1.y + 12, "E1") +
      texte(pV1.x + 8, pV1.y - 4, "V1 = 400 V") +
      (vue.vide ? "" : texte((OI.x + pI2.x) / 2 + 20 * nx - 8, (OI.y + pI2.y) / 2 + 20 * ny + 4, "I2'")) +
      texte(pI1.x + (16 * (pI1.x - OI.x)) / li - 8, pI1.y + (16 * (pI1.y - OI.y)) / li + 4, "I1") +
      texte(Math.max(pI1.x, pI2.x) + 22, (pI2.y + pI1.y) / 2 + 4, "I0") +
      texte(30, 545, "agrandissement x " + nombre(api, etat.k, 0) + " des chutes et de I0 ; tensions 0,9 px/V ; courants 30 px/A") +
      texte(30, 565, "charge " + nombre(api, etat.x * 100, 0) + " % de l'admittance assignée");
    if (valeurs) {
      const b = bilanT(reel);
      const phi1 = -C.arg(reel.I1) / DEG;
      valeurs.maj({
        v2: reel.V2,
        chute: EX.V20 - reel.V2,
        i1: C.abs(reel.I1),
        phi1,
        cos1: Math.cos(phi1 * DEG),
        i0: C.abs(reel.I0),
        pcu1: b.pcu1,
        pcu2: b.pcu2,
        pf: b.pf,
        p1: b.P1,
        p2: b.P2,
        eta: b.eta * 100,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: { x: DIAL.x, y: DIAL.y },
    rayon: DIAL.r,
    min: -90,
    max: 60,
    boucle: false,
    pas: 1,
    valeur: -etat.phi,
    libelle: "Angle de l'impédance de charge",
    diffuserAuDepart: false,
    rappel(mesure) {
      let angle = mesure.angle;
      if (angle > 180) angle -= 360;
      etat.phi = -Math.max(-90, Math.min(60, angle));
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#h-fresnel-curseurs",
    [
      { id: "x", libelle: "Charge, en fraction de l'admittance assignée", min: 0, max: 1.5, pas: 0.01, valeur: etat.x, format: (v) => nombre(api, v * 100, 0) + " %" },
      { id: "k", libelle: "Agrandissement des chutes et de I0", min: 1, max: 12, pas: 1, valeur: etat.k, format: (v) => "x " + nombre(api, v, 0) },
    ],
    (lues) => {
      Object.assign(etat, lues);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  dessiner();
}

/* --------------------------------------------------------------------------
   I. Simulation : une journée d'exploitation du poste
   -------------------------------------------------------------------------- */

function construireSimPoste(racine, api) {
  const etat = { uHta: 20.8, prise: 3, pointe: 1, heure: 9.5 };
  const charge = (h) => PROFIL[Math.min(23, Math.max(0, Math.floor(h)))] * etat.pointe;

  const trace = api.sim.traceur("#i-sim-poste-trace", {
    titre: "Tension du tableau général au fil de la journée",
    xTitre: "heure",
    xUnite: "h",
    yTitre: "U2",
    yUnite: "V",
    xMin: 0,
    xMax: 24,
    yMin: 360,
    yMax: 470,
    echantillons: 480,
    series: PRISES.map((p, rang) => ({
      id: "p" + rang,
      nom: "prise " + (p > 0 ? "+" : "") + nombre(api, p, 1) + " %",
      couleur: "serie-" + (rang + 1),
      epaisseur: 2,
      fonction: (h) => tensionTableau(etat.uHta, p, charge(h)),
    })),
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 400, "400 V", false);
      ligneH(c, repere, couleurs, 390, "390 V", true, [2, 3]);
      ligneV(c, repere, couleurs, etat.heure, null, [2, 3]);
      const u = tensionTableau(etat.uHta, PRISES[etat.prise], charge(etat.heure));
      pointTrace(c, repere, couleurs, etat.heure, u, nombre(api, u, 1) + " V");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#i-sim-poste-valeurs", [
    { id: "heure", libelle: "Heure", unite: "h", decimales: 1 },
    { id: "s", libelle: "Charge efficace vraie", unite: "kVA", decimales: 1 },
    { id: "u2", libelle: "U2 sur la prise étudiée", unite: "V", decimales: 1 },
    { id: "ecart", libelle: "Écart à 400 V", unite: "%", decimales: 2 },
    { id: "pcu", libelle: "Pertes cuivre", unite: "W", decimales: 0 },
    { id: "pf", libelle: "Pertes fer", unite: "W", decimales: 0 },
    { id: "eta", libelle: "Rendement instantané", unite: "%", decimales: 2 },
    { id: "ejour", libelle: "Pertes de la journée", unite: "kWh", decimales: 2 },
    { id: "efer", libelle: "dont noyau", unite: "kWh", decimales: 2 },
    { id: "etaj", libelle: "Rendement énergétique", unite: "%", decimales: 2 },
    { id: "b", libelle: "Induction relative", unite: "%", decimales: 1 },
    { id: "umin", libelle: "U2 minimale de la journée", unite: "V", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    if (trace) trace.rafraichir();
    const p = PRISES[etat.prise];
    const b = etat.uHta / 20 / (1 + p / 100);
    const pf = POSTE.P0 * b * b;
    const q = charge(etat.heure);
    const s = q * POSTE.Srms;
    const pcu = Math.pow(s / POSTE.Sn, 2) * POSTE.Pcc;
    const putile = q * POSTE.P;
    let ecu = 0;
    let eu = 0;
    let umin = Infinity;
    for (let h = 0; h < 24; h += 1) {
      const qh = charge(h);
      ecu += Math.pow((qh * POSTE.Srms) / POSTE.Sn, 2) * POSTE.Pcc;
      eu += qh * POSTE.P;
      umin = Math.min(umin, tensionTableau(etat.uHta, p, qh));
    }
    const efer = (pf * 24) / 1000;
    const ejour = efer + ecu / 1000;
    if (valeurs) {
      const u2 = tensionTableau(etat.uHta, p, q);
      valeurs.maj({
        heure: etat.heure,
        s: s / 1000,
        u2,
        ecart: (u2 / 400 - 1) * 100,
        pcu,
        pf,
        eta: (100 * putile) / (putile + pf + pcu),
        ejour,
        efer,
        etaj: (100 * eu) / 1000 / (eu / 1000 + ejour),
        b: b * 100,
        umin,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-sim-poste-curseurs",
    [
      { id: "uHta", libelle: "Tension HTA du réseau", min: 19.5, max: 21.5, pas: 0.05, valeur: etat.uHta, unite: "kV" },
      {
        id: "prise",
        libelle: "Prise étudiée",
        min: 0,
        max: 4,
        pas: 1,
        valeur: etat.prise,
        format: (v) => {
          const p = PRISES[Math.round(v)];
          return (p > 0 ? "+" : "") + nombre(api, p, 1) + " %";
        },
      },
      { id: "pointe", libelle: "Coefficient appliqué à la pointe", min: 0.6, max: 1.5, pas: 0.05, valeur: etat.pointe, format: (v) => nombre(api, v, 2) },
    ],
    (lues) => {
      etat.uHta = lues.uHta;
      etat.prise = Math.round(lues.prise);
      etat.pointe = lues.pointe;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#i-sim-poste-lecteur", {
    de: 0,
    a: 23.99,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Heure de la journée type",
    rappel: (valeur) => {
      etat.heure = Number(valeur);
      maj();
    },
  });
  if (lecteur) ressources.push(lecteur);
  /* Le lecteur se place à son départ en se créant : on revient à l'heure de pleine activité choisie. */
  etat.heure = 9.5;
  if (lecteur) lecteur.suivre(etat.heure);
  maj();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

const DESSIN_DIAG =
  '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<path d="M30 60H90M140 60H150M206 60H260M30 170H260"/>' +
  '<rect x="90" y="52" width="50" height="16" rx="2"/>' +
  '<path d="M150 60a7 7 0 0 1 14 0a7 7 0 0 1 14 0a7 7 0 0 1 14 0a7 7 0 0 1 14 0"/>' +
  '<path d="M60 60V80H45V90M60 80H75V88M45 150V160H75V152M60 160V170"/>' +
  '<rect x="37" y="90" width="16" height="60" rx="2"/>' +
  '<path d="M75 88a8 8 0 0 1 0 16a8 8 0 0 1 0 16a8 8 0 0 1 0 16a8 8 0 0 1 0 16"/></g>' +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
  '<text x="96" y="88">Rs</text><text x="164" y="88">Xs</text><text x="14" y="126">Rf</text><text x="84" y="126">Xm</text>' +
  '<text x="264" y="64">vers la charge</text></g>';

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-resistance-serie",
      titre: "Résistance série ramenée au secondaire",
      niveau: "fondamental",
      enonce:
        "<p>Un transformateur de commande $230\\ \\mathrm{V} / 24\\ \\mathrm{V}$ a pour résistances d'enroulements $R_1 = 1{,}2\\ \\Omega$ au " +
        "primaire et $R_2 = 15\\ \\mathrm{m\\Omega}$ au secondaire. Quelle est sa résistance série ramenée au secondaire, en milliohms ?</p>",
      valeur: (0.015 + Math.pow(24 / 230, 2) * 1.2) * 1000,
      unite: "mΩ",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Résistance série $R_s$",
      etapes: [
        { texte: "$m = 24/230 = 0{,}104\\,3$ ; une impédance du primaire se ramène au secondaire en la multipliant par $m^2 = 0{,}010\\,89$." },
        { texte: "$m^2R_1 = 0{,}010\\,89 \\times 1{,}2 = 13{,}07\\ \\mathrm{m\\Omega}$." },
        {
          texte: "$R_s = R_2 + m^2R_1 = 15 + 13{,}07 = 28{,}07\\ \\mathrm{m\\Omega}$.",
          note: "Additionner directement $R_1$ et $R_2$ donnerait $1{,}215\\ \\Omega$, quarante-trois fois trop.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        barresCorrection(
          moteur,
          conteneur,
          { titre: "Contributions à la résistance série vue du secondaire", xTitre: "élément", yTitre: "résistance", unite: "mΩ" },
          [
            { etiquette: "R2", valeur: 15 },
            { etiquette: "m² R1", valeur: 13.07 },
            { etiquette: "Rs", valeur: 28.07 },
          ]
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-pertes-cuivre",
      titre: "Pertes cuivre à charge partielle",
      niveau: "fondamental",
      enonce:
        "<p>Le transformateur du poste a des pertes en court-circuit $P_{cc} = 1750\\ \\mathrm{W}$ à courant assigné. Quelles sont ses pertes " +
        "cuivre quand il débite $60\\ \\%$ de son courant assigné, en watts ? Que valent alors les pertes totales, avec $P_0 = 210\\ \\mathrm{W}$ ?</p>",
      valeur: 630,
      unite: "W",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Pertes cuivre $P_{cu}$",
      etapes: [
        { texte: "Les pertes cuivre suivent le carré du courant : $P_{cu} = x^2P_{cc}$." },
        { texte: "$0{,}6^2 \\times 1750 = 0{,}36 \\times 1750 = 630\\ \\mathrm{W}$." },
        {
          texte: "Pertes totales : $630 + 210 = 840\\ \\mathrm{W}$, les pertes fer ne dépendant pas de la charge.",
          note: "À $60\\ \\%$ de charge, les pertes cuivre ne valent que $36\\ \\%$ de leur valeur assignée.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Pertes du poste en fonction du taux de charge",
          xTitre: "x",
          yTitre: "pertes",
          yUnite: "W",
          xMin: 0,
          xMax: 1.2,
          yMin: 0,
          yMax: 2800,
          series: [
            { id: "cu", nom: "cuivre : x² Pcc", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => x * x * 1750 },
            { id: "fe", nom: "fer : P0", couleur: "serie-5", epaisseur: 2, fonction: () => 210 },
            { id: "tot", nom: "total", couleur: "serie-3", epaisseur: 2, fonction: (x) => x * x * 1750 + 210 },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 0.6, "x = 0,6");
            pointTrace(c, repere, couleurs, 0.6, 630, "630 W");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-chute-kapp",
      titre: "Tension secondaire en charge par la formule de Kapp",
      niveau: "intermédiaire",
      enonce:
        "<p>Un transformateur monophasé de $10\\ \\mathrm{kVA}$ délivre $240\\ \\mathrm{V}$ à vide. Ses chutes relatives à courant assigné, " +
        "rapportées à la tension à vide, valent $u_r = 2\\ \\%$ et $u_x = 3\\ \\%$. Quelle tension délivre-t-il à courant assigné sous " +
        "$\\cos\\varphi = 0{,}8$ inductif, en volts ?</p>",
      valeur: 240 * (1 - (2 * 0.8 + 3 * 0.6) / 100),
      unite: "V",
      tolerance: 0.002,
      chiffres: 2,
      libelleChamp: "Tension en charge $V_2$",
      etapes: [
        { texte: "Méthode : formule de Kapp, $\\Delta V/V_{20} \\approx x\\,(u_r\\cos\\varphi + u_x\\sin\\varphi)$ avec $x = 1$." },
        { texte: "$\\sin\\varphi = 0{,}6$ ; $2 \\times 0{,}8 + 3 \\times 0{,}6 = 1{,}6 + 1{,}8 = 3{,}4\\ \\%$." },
        { texte: "$\\Delta V = 0{,}034 \\times 240 = 8{,}16\\ \\mathrm{V}$, d'où $V_2 = 240 - 8{,}16 = 231{,}84\\ \\mathrm{V}$." },
        {
          texte: "Contrôle : la chute est comprise entre $u_r = 2\\ \\%$ et $u_{cc} = \\sqrt{2^2 + 3^2} = 3{,}61\\ \\%$.",
          note: "La part réactive, $1{,}8$ point, l'emporte sur la part résistive, $1{,}6$ point, bien que $\\sin\\varphi &lt; \\cos\\varphi$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Tension en charge selon l'angle de la charge, à courant assigné",
          xTitre: "φ2 (négatif : capacitif)",
          xUnite: "°",
          yTitre: "V2",
          yUnite: "V",
          xMin: -90,
          xMax: 90,
          yMin: 228,
          yMax: 250,
          series: [
            { id: "v", nom: "V2 selon Kapp", couleur: "serie-1", epaisseur: 2.6, fonction: (d) => 240 * (1 - (2 * Math.cos(d * DEG) + 3 * Math.sin(d * DEG)) / 100) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 240, "240 V à vide", false);
            ligneV(c, repere, couleurs, 36.87, "cos φ = 0,8");
            pointTrace(c, repere, couleurs, 36.87, 231.84, "231,84 V");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-rendement-max",
      titre: "Charge de rendement maximal du poste",
      niveau: "intermédiaire",
      enonce:
        "<p>Pour le transformateur du poste, $S_n = 100\\ \\mathrm{kVA}$, $P_0 = 210\\ \\mathrm{W}$ et $P_{cc} = 1750\\ \\mathrm{W}$. À quel taux " +
        "de charge, en pour cent de $S_n$, son rendement est-il maximal ? Que vaut ce rendement sous $\\cos\\varphi = 1$ ?</p>",
      valeur: 100 * Math.sqrt(210 / 1750),
      unite: "%",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Taux de charge optimal",
      etapes: [
        { texte: "Le rendement est maximal quand pertes cuivre et pertes fer sont égales : $x^2P_{cc} = P_0$." },
        { texte: "$x = \\sqrt{210/1750} = \\sqrt{0{,}12} = 0{,}346$, soit $34{,}6\\ \\%$ et $34{,}6\\ \\mathrm{kVA}$." },
        { texte: "À ce point, pertes totales $2 \\times 210 = 420\\ \\mathrm{W}$ ; sous $\\cos\\varphi = 1$, $\\eta = 34{,}64/(34{,}64 + 0{,}42) = 98{,}80\\ \\%$." },
        {
          texte: "En pleine activité du site, $66{,}5\\ \\%$ de charge, le rendement vaut $98{,}50\\ \\%$ sous $\\cos\\varphi = 0{,}986$ : la courbe est plate.",
          note: "Un appareil dimensionné pour l'extension et presque toujours chargé au tiers travaille donc près de son optimum.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Rendement du poste sous cos φ = 1",
          xTitre: "x",
          yTitre: "rendement",
          yUnite: "%",
          xMin: 0,
          xMax: 1.2,
          yMin: 96,
          yMax: 99.2,
          series: [{ id: "eta", nom: "η(x)", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => (x > 0 ? (100 * x * 100) / (x * 100 + 0.21 + x * x * 1.75) : NaN) }],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 0.3464, "x = 0,346");
            pointTrace(c, repere, couleurs, 0.3464, 98.802, "98,80 %");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-surcompensation",
      titre: "Tension de nuit avec une batterie fixe de condensateurs",
      niveau: "avancé",
      enonce:
        "<p>On étudie la variante écartée au cours Correction du facteur de puissance : une batterie globale fixe de " +
        "$18{,}5\\ \\mathrm{kvar}$ au tableau général. La nuit, le site n'absorbe plus que $10\\ \\mathrm{kW}$ sous un facteur de puissance unité, " +
        "et la batterie reste en service. Le poste est sur la prise $+2{,}5\\ \\%$ sous $21\\ \\mathrm{kV}$ : $U_{20} = 420\\ \\mathrm{V}$, " +
        "$u_r = 1{,}75\\ \\%$, $u_x = 3{,}60\\ \\%$, $S_n = 100\\ \\mathrm{kVA}$. Quelle tension composée règne au tableau général, en volts ? " +
        "Les chutes relatives sont rapportées à $410\\ \\mathrm{V}$.</p>",
      valeur: 420 - ((1.75 * 10 - POSTE.ux * 18.5) / 100 / 100) * 410,
      unite: "V",
      tolerance: 0.001,
      chiffres: 2,
      libelleChamp: "Tension $U_2$ de nuit",
      etapes: [
        { texte: "Méthode : formule de Kapp en puissances, $\\Delta U/U_{2n} \\approx (u_rP + u_xQ)/S_n$, avec $Q &lt; 0$ pour une charge globalement capacitive." },
        { texte: "Bilan au tableau : $P = 10\\ \\mathrm{kW}$, $Q = 0 - 18{,}5 = -18{,}5\\ \\mathrm{kvar}$." },
        { texte: "$(1{,}75 \\times 10 - 3{,}597 \\times 18{,}5)/100 = (17{,}5 - 66{,}5)/100 = -0{,}490\\ \\%$." },
        { texte: "$\\Delta U = -0{,}00490 \\times 410 = -2{,}01\\ \\mathrm{V}$ : la tension monte, $U_2 = 420 + 2{,}01 = 422{,}0\\ \\mathrm{V}$." },
        {
          texte: "Soit $5{,}5\\ \\%$ au-dessus de $400\\ \\mathrm{V}$, contre $419{,}3\\ \\mathrm{V}$ sans la batterie, la compensation du compresseur étant coupée avec lui.",
          note: "Une batterie fixe qui ne suit pas la charge fait monter la tension aux heures creuses : argument de plus pour la compensation commutée retenue.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Tension de nuit selon la puissance réactive de la batterie restée en service",
          xTitre: "batterie fixe",
          xUnite: "kvar",
          yTitre: "U2",
          yUnite: "V",
          xMin: 0,
          xMax: 30,
          yMin: 414,
          yMax: 426,
          series: [{ id: "u", nom: "U2 pour 10 kW", couleur: "serie-1", epaisseur: 2.6, fonction: (q) => 420 - ((1.75 * 10 - POSTE.ux * q) / 1e4) * 410 }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 420, "U20 = 420 V", true);
            ligneV(c, repere, couleurs, 18.5, "18,5 kvar");
            pointTrace(c, repere, couleurs, 18.5, 422.01, "422,0 V");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic-vide",
      titre: "Diagnostic : un transformateur qui chauffe à vide après révision",
      niveau: "diagnostic",
      enonce:
        "<p>Après une révision au cours de laquelle le noyau a été démonté puis remonté, un transformateur alimenté à vide sous sa tension " +
        "assignée absorbe un courant trois fois plus fort qu'avant et des pertes à vide doublées ; sa tension secondaire à vide est " +
        "correcte et ses résistances d'enroulements sont inchangées. Quelles hypothèses sont compatibles avec ces symptômes ?</p>" +
        '<svg viewBox="0 0 360 190" role="img" aria-label="Schéma de Kapp du transformateur avec sa branche magnétisante en tête" style="max-width:360px">' +
        DESSIN_DIAG +
        "</svg>",
      options: [
        { texte: "Les joints entre les tôles du noyau, mal resserrés, ajoutent de petits entrefers : $X_m$ a baissé.", juste: true },
        { texte: "Des bavures ou une isolation endommagée court-circuitent des tôles entre elles : les courants de Foucault et donc $P_0$ augmentent, $R_f$ a baissé.", juste: true },
        { texte: "Une spire du secondaire est en court-circuit : la tension secondaire à vide resterait alors correcte et rien ne chaufferait." },
        { texte: "La résistance $R_s$ a augmenté, d'où l'échauffement à vide." },
        { texte: "L'essai à vide du cours suivant, comparé au procès-verbal d'origine, permet de chiffrer séparément $R_f$ et $X_m$.", juste: true },
      ],
      etapes: [
        { texte: "À vide, seule la branche magnétisante travaille : courant et pertes à vide renseignent sur $X_m$ et $R_f$, pas sur $R_s$." },
        { texte: "Un courant à vide triplé signale une réluctance accrue, donc des entrefers aux joints : $I_\\mu = V/X_m$ augmente quand $X_m$ baisse." },
        { texte: "Des pertes à vide doublées signalent des courants de Foucault accrus, par exemple des tôles en contact : $P_0 = V^2/R_f$ augmente quand $R_f$ baisse." },
        {
          texte: "Une spire en court-circuit ferait au contraire circuler un courant intense dans cette spire, chaufferait localement et fausserait le rapport ; et $R_s$ n'intervient pas à vide.",
          note: "Les deux grandeurs se mesurent séparément : $P_0$ par un wattmètre, $I_0$ par un ampèremètre, d'où $R_f$ et $X_m$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        barresCorrection(
          moteur,
          conteneur,
          { titre: "Grandeurs à vide relatives à leur valeur d'origine", xTitre: "grandeur", yTitre: "rapport", unite: "" },
          [
            { etiquette: "I0", valeur: 3 },
            { etiquette: "P0", valeur: 2 },
            { etiquette: "V20", valeur: 1 },
            { etiquette: "R1, R2", valeur: 1 },
          ]
        );
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-conceptuel-kapp",
      titre: "Pourquoi peut-on déplacer la branche magnétisante ?",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi le schéma de Kapp peut placer la branche magnétisante aux bornes d'entrée sans erreur notable en " +
        "charge, alors qu'il serait faux de supprimer les impédances de fuite.</p>",
      motsCles: [
        ["courant a vide", "courant magnetisant", "i0", "quelques pour cent", "faible", "petit"],
        ["e1", "tension", "proche", "presque egale", "peu differente"],
        ["chute", "fuite", "serie", "proportionnel", "courant de charge"],
        ["second ordre", "negligeable", "erreur faible", "produit"],
      ],
      minimum: 3,
      exemple: "Trois ou quatre phrases : comparez le courant à vide au courant de charge, la tension E1 à V1, et dites ce que portent les impédances de fuite.",
      etapes: [
        { texte: "Le courant à vide ne vaut que quelques pour cent du courant de charge, et la tension $E_1$ ne diffère de $V_1$ que de quelques pour cent." },
        { texte: "Déplacer la branche revient à la soumettre à $V_1$ au lieu de $E_1$ et à retirer $I_0$ de $R_1 + jX_1$ : l'erreur est le produit de deux petites quantités, un terme du second ordre." },
        { texte: "Les impédances de fuite, elles, sont parcourues par tout le courant de charge : leur chute, proportionnelle à ce courant, est du premier ordre et fait toute la chute de tension." },
        {
          texte: "Les supprimer reviendrait au modèle idéal, sans chute en charge ni limitation du courant de court-circuit.",
          note: "Dans l'exemple, l'approximation ne coûte que $0{,}18\\ \\mathrm{V}$ sur une chute de $8{,}95\\ \\mathrm{V}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        barresCorrection(
          moteur,
          conteneur,
          { titre: "Exemple de la section H : ce qui compte et ce qui est négligé", xTitre: "grandeur", yTitre: "tension", unite: "V" },
          [
            { etiquette: "chute exacte", valeur: 8.95 },
            { etiquette: "chute de Kapp", valeur: 8.77 },
            { etiquette: "erreur de Kapp", valeur: 0.18 },
          ]
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const DESSIN_QUIZ_T =
  '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M30 60H70M120 60H130M186 60H330M386 60H400M450 60H500M30 200H500"/>' +
  '<rect x="70" y="52" width="50" height="16" rx="2"/>' +
  '<path d="M130 60a7 7 0 0 1 14 0a7 7 0 0 1 14 0a7 7 0 0 1 14 0a7 7 0 0 1 14 0"/>' +
  '<path d="M250 60V85H220V100M250 85H280V98M220 160V180H280V162M250 180V200"/>' +
  '<rect x="212" y="100" width="16" height="60" rx="2"/>' +
  '<path d="M280 98a8 8 0 0 1 0 16a8 8 0 0 1 0 16a8 8 0 0 1 0 16a8 8 0 0 1 0 16"/>' +
  '<path d="M330 60a7 7 0 0 1 14 0a7 7 0 0 1 14 0a7 7 0 0 1 14 0a7 7 0 0 1 14 0"/>' +
  '<rect x="400" y="52" width="50" height="16" rx="2"/></g>' +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
  '<text x="76" y="40">A</text><text x="150" y="40">B</text><text x="196" y="134">C</text><text x="294" y="134">D</text>' +
  '<text x="350" y="40">E</text><text x="420" y="40">F</text><text x="300" y="230">schéma ramené au primaire</text></g>';

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Dans le schéma équivalent, quel élément représente les pertes par hystérésis et par courants de Foucault ?</p>",
        options: ["La résistance $R_f$ de la branche parallèle", "La résistance $R_1$", "La réactance $X_1$", "La réactance $X_m$"],
        bonnes: [0],
        explication: "$R_f$, soumise à la tension $E_1$, dissipe $E_1^2/R_f$, égale aux pertes fer ; $X_m$ représente l'aimantation, sans pertes.",
        resume: "Élément des pertes fer",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Sous tension primaire constante, les pertes fer d'un transformateur croissent comme le carré du courant de charge.</p>",
        reponse: false,
        explication: "Les pertes fer dépendent du flux, donc de la tension et de la fréquence ; ce sont les pertes cuivre qui croissent comme le carré du courant.",
        resume: "Dépendance des pertes fer",
      },
      {
        type: "calcul",
        enonce: "<p>Un transformateur a $P_{cc} = 1750\\ \\mathrm{W}$. Quelles sont ses pertes cuivre à mi-charge, en watts ?</p>",
        valeur: 437.5,
        unite: "W",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$0{,}5^2 \\times 1750 = 437{,}5\\ \\mathrm{W}$ : le quart des pertes assignées.",
        resume: "Pertes cuivre à mi-charge",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi la tension secondaire d'un transformateur peut-elle monter quand on le charge par une charge capacitive ?</p>",
        motsCles: [["capacit", "avance"], ["reactance", "fuite", "inducti", "xs"], ["negati", "oppos", "signe", "compense", "monte"]],
        minimum: 2,
        explication:
          "Avec un courant en avance, la chute dans la réactance de fuite, $X_sI\\sin\\varphi$, devient négative et l'emporte sur la chute résistive : $\\Delta V = R_sI\\cos\\varphi + X_sI\\sin\\varphi &lt; 0$.",
        resume: "Montée de tension en capacitif",
      },
      {
        type: "calcul",
        enonce: "<p>Le poste a $u_r = 1{,}75\\ \\%$ et $u_x = 3{,}60\\ \\%$, rapportées à $410\\ \\mathrm{V}$. Quelle chute de tension composée, en volts, provoque une charge assignée sous $\\cos\\varphi = 1$ ?</p>",
        valeur: 0.0175 * 410,
        unite: "V",
        tolerance: 0.01,
        chiffres: 2,
        explication: "Sous $\\cos\\varphi = 1$, $\\sin\\varphi = 0$ : $\\Delta U = 0{,}0175 \\times 410 = 7{,}18\\ \\mathrm{V}$, la seule part résistive.",
        resume: "Chute à facteur de puissance unité",
      },
      {
        type: "schema",
        enonce: "<p>Sur le schéma ramené au primaire, quel élément représente le flux de fuite du secondaire ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 600 240",
        dessin: DESSIN_QUIZ_T,
        zones: [
          { x: 60, y: 30, largeur: 70, hauteur: 50, etiquette: "élément A" },
          { x: 130, y: 30, largeur: 60, hauteur: 50, etiquette: "élément B" },
          { x: 180, y: 95, largeur: 55, hauteur: 70, etiquette: "élément C" },
          { x: 265, y: 95, largeur: 50, hauteur: 70, etiquette: "élément D" },
          { x: 325, y: 30, largeur: 65, hauteur: 50, etiquette: "élément E", juste: true },
          { x: 395, y: 30, largeur: 65, hauteur: 50, etiquette: "élément F" },
        ],
        explication: "E est la bobine en série du côté de la charge : la réactance de fuite du secondaire ramenée, $X_2' = X_2/m^2$. B est celle du primaire, D la réactance magnétisante, C la résistance de pertes fer, A et F les résistances des enroulements.",
        resume: "Lecture du schéma en T",
      },
      {
        type: "qcm",
        enonce: "<p>La tension du réseau augmente de $10\\ \\%$, à puissance de charge inchangée. Quelles grandeurs du transformateur augmentent ?</p>",
        options: [
          { texte: "Les pertes fer", juste: true },
          { texte: "Le courant magnétisant", juste: true },
          { texte: "Les pertes cuivre" },
          { texte: "La tension de court-circuit relative $u_{cc}$" },
        ],
        multiple: true,
        explication: "Le flux croît avec la tension : pertes fer d'environ $21\\ \\%$ et courant magnétisant davantage, à cause du coude de saturation. À puissance constante, le courant de charge baisse, donc les pertes cuivre aussi ; $u_{cc}$ est une caractéristique de l'appareil.",
        resume: "Effets d'une surtension",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Le rendement d'un transformateur est maximal quand ses pertes cuivre sont égales à ses pertes fer.</p>",
        reponse: true,
        explication: "Minimiser $P_0/x + xP_{cc}$ donne $x^2P_{cc} = P_0$ ; le facteur de puissance ne déplace pas cet optimum.",
        resume: "Condition du rendement maximal",
      },
      {
        type: "calcul",
        enonce: "<p>Le site absorbe $64{,}8\\ \\mathrm{kW}$ ; le poste perd alors $210\\ \\mathrm{W}$ dans le fer et $774\\ \\mathrm{W}$ dans le cuivre. Quel est son rendement, en pour cent ?</p>",
        valeur: (100 * 64.8) / (64.8 + 0.21 + 0.774),
        unite: "%",
        tolerance: 0.0005,
        chiffres: 2,
        explication: "$\\eta = 64{,}8/(64{,}8 + 0{,}984) = 98{,}50\\ \\%$.",
        resume: "Rendement en charge",
      },
      {
        type: "qcm",
        enonce: "<p>On ramène au primaire la résistance $R_2$ d'un secondaire, avec $m = N_2/N_1$. Quelle expression est correcte ?</p>",
        options: ["$R_2' = R_2/m^2$", "$R_2' = R_2 m^2$", "$R_2' = R_2/m$", "$R_2' = R_2$"],
        bonnes: [0],
        explication: "Vers le primaire, les tensions sont divisées par $m$ et les courants multipliés par $m$ : les impédances sont divisées par $m^2$.",
        resume: "Résistance ramenée",
      },
    ],
    { titre: "Dix questions sur le transformateur réel" }
  );
  if (quiz) ressources.push(quiz);
}

/* --------------------------------------------------------------------------
   M. Cartes de mémorisation
   -------------------------------------------------------------------------- */

function construireCartesMemo(racine, api) {
  const cartes = api.cartes(
    "#m-cartes",
    [
      { categorie: "Modèle", question: "Quels sont les quatre écarts du transformateur réel au modèle idéal ?", reponse: "Résistance des enroulements, flux de fuite, courant magnétisant d'un noyau de perméabilité finie, pertes fer par hystérésis et courants de Foucault." },
      { categorie: "Modèle", question: "Que représentent $X_1$ et $X_2$ ?", reponse: "Les réactances de fuite : le flux créé par chaque enroulement qui se referme dans l'air sans traverser l'autre, proportionnel au courant." },
      { categorie: "Modèle", question: "Que représentent $R_f$ et $X_m$ ?", reponse: "La branche magnétisante : $X_m$ l'aimantation du noyau, $R_f$ les pertes fer ; leur courant total est le courant à vide $\\underline{I}_0$." },
      { categorie: "Équations", question: "Comment s'écrit le bilan des courants du transformateur réel ?", reponse: "$\\underline{I}_1 = m\\underline{I}_2 + \\underline{I}_0$ : le primaire fournit la part ramenée de la charge plus le courant à vide." },
      { categorie: "Ramener", question: "Comment ramène-t-on $R_2$ et $X_2$ au primaire ?", reponse: "En les divisant par $m^2$ ; vers le secondaire, on multiplie $R_1$ et $X_1$ par $m^2$ : $R_s = R_2 + m^2R_1$." },
      { categorie: "Kapp", question: "Quelle approximation fait le schéma de Kapp ?", reponse: "Placer la branche magnétisante aux bornes d'entrée, ce qui néglige la chute du courant à vide dans $R_1 + jX_1$ : erreur du second ordre." },
      {
        categorie: "Chute",
        question: "Que donne la formule de Kapp ?",
        reponse: "$\\Delta V \\approx R_sI\\cos\\varphi + X_sI\\sin\\varphi$, ou $x(u_r\\cos\\varphi + u_x\\sin\\varphi)$ en relatif ; négative en charge assez capacitive.",
        rappel: "Exemple : $9{,}92\\ \\mathrm{V}$, soit $4{,}31\\ \\%$, à courant assigné sous $\\cos\\varphi = 0{,}8$.",
      },
      { categorie: "ucc", question: "Que vaut la tension de court-circuit relative ?", reponse: "$u_{cc} = Z_sI_n/V_n = \\sqrt{u_r^2 + u_x^2}$, avec $u_r = P_{cc}/S_n$ : c'est la chute maximale à courant assigné, pas la chute habituelle." },
      { categorie: "Pertes", question: "Comment varient pertes fer et pertes cuivre ?", reponse: "Pertes fer : avec le carré de la tension, à fréquence fixée, indépendamment de la charge. Pertes cuivre : $x^2P_{cc}$, et avec la température." },
      {
        categorie: "Rendement",
        question: "Quand le rendement est-il maximal ?",
        reponse: "Quand pertes cuivre et pertes fer sont égales : $x_{opt} = \\sqrt{P_0/P_{cc}}$.",
        rappel: "Poste du site : $34{,}6\\ \\%$ de charge et $98{,}80\\ \\%$ sous $\\cos\\varphi = 1$.",
      },
    ],
    { titre: "Dix cartes sur le transformateur réel" }
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
        enonce:
          "<p>Cette séance. Le transformateur de l'exemple a une impédance série ramenée au primaire de $2{,}838\\ \\Omega$ et un courant primaire " +
          "assigné de $6{,}25\\ \\mathrm{A}$ sous $400\\ \\mathrm{V}$. Quelle est sa tension de court-circuit relative, en pour cent ?</p>",
        valeur: (100 * 2.838 * 6.25) / 400,
        unite: "%",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$u_{cc} = Z_{s1}I_{1n}/V_{1n} = 2{,}838 \\times 6{,}25/400 = 4{,}43\\ \\%$.",
        resume: "Tension de court-circuit",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Cette séance. Pour le poste du site, dont $u_x &gt; u_r$, la chute relative à courant assigné en charge inductive est toujours comprise entre $u_r$ et $u_{cc}$.</p>",
        reponse: true,
        explication: "$u_r\\cos\\varphi + u_x\\sin\\varphi$ vaut $u_r$ pour $\\varphi = 0$ et atteint son maximum $u_{cc}$ pour $\\tan\\varphi = u_x/u_r$ ; entre $0$ et $90^\\circ$, elle reste au moins égale à $\\min(u_r, u_x)$, ici $u_r$.",
        resume: "Encadrement de la chute",
      },
      {
        type: "qcm",
        enonce: "<p>Cette séance. Quelle mesure renseigne directement sur la branche magnétisante ?</p>",
        options: ["Le courant et la puissance absorbés à vide", "La tension secondaire en pleine charge", "La résistance des enroulements à l'ohmmètre", "Le courant de court-circuit"],
        bonnes: [0],
        explication: "À vide, seule la branche magnétisante travaille : $P_0$ donne $R_f$ et $I_0$ donne $X_m$. C'est l'essai à vide du cours suivant.",
        resume: "Mesure de la branche magnétisante",
      },
      {
        type: "calcul",
        enonce:
          "<p>Cours <a href=\"#/cours/transformateur-ideal\">Transformateur idéal</a>. Une résistance de $0{,}5\\ \\Omega$ est raccordée au secondaire d'un transformateur idéal $400\\ \\mathrm{V} / 24\\ \\mathrm{V}$. Quelle résistance voit-on du primaire, en ohms ?</p>",
        valeur: 0.5 * Math.pow(400 / 24, 2),
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$0{,}5 \\times (400/24)^2 = 0{,}5 \\times 277{,}8 = 138{,}9\\ \\Omega$.",
        resume: "Impédance ramenée",
      },
      {
        type: "vraiFaux",
        enonce:
          "<p>Cours <a href=\"#/cours/transformateur-ideal\">Transformateur idéal</a>. Deux secondaires de $230$ et $24\\ \\mathrm{V}$ reliés borne pointée contre borne non pointée fournissent $254\\ \\mathrm{V}$.</p>",
        reponse: true,
        explication: "Reliés point contre borne non marquée, les deux enroulements sont en série additive : $230 + 24 = 254\\ \\mathrm{V}$ ; dans l'autre sens, $206\\ \\mathrm{V}$.",
        resume: "Mise en série et polarité",
      },
      {
        type: "calcul",
        enonce:
          "<p>Cours <a href=\"#/cours/charges-triphasees-desequilibrees\">Charges triphasées déséquilibrées</a>. Un réseau $230/400\\ \\mathrm{V}$ équilibré alimente en étoile avec neutre deux charges résistives de $10\\ \\mathrm{A}$, sur L1 et L2, L3 étant à vide. Quel courant circule dans le neutre, en ampères ?</p>",
        valeur: 10,
        unite: "A",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$\\underline{I}_N = 10\\angle 0^\\circ + 10\\angle{-120^\\circ} = 5 - j8{,}66$, de module $10\\ \\mathrm{A}$ : autant qu'une phase.",
        resume: "Courant de neutre",
      },
      {
        type: "calcul",
        enonce:
          "<p>Cours <a href=\"#/cours/diagnostic-initial-et-remise-a-niveau-mathematique\">Diagnostic initial et remise à niveau mathématique</a>. Le site compensé a un facteur de puissance de $0{,}986$. Que vaut $\\sin\\varphi$, utile à la formule de Kapp ?</p>",
        valeur: Math.sqrt(1 - 0.986 * 0.986),
        unite: "",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$\\sin\\varphi = \\sqrt{1 - 0{,}986^2} = \\sqrt{0{,}0278} = 0{,}167$ : un facteur de puissance proche de $1$ laisse encore un sinus non négligeable.",
        resume: "Sinus à partir du cosinus",
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
    titre: "Où en suis-je sur le transformateur réel ?",
  });
  if (auto) ressources.push(auto);
}
