/* ==========================================================================
   cours/essais-a-vide-et-en-court-circuit/cours.js
   Essais à vide et en court-circuit : banc d'essais animé, phaseur du courant
   à vide, courbe à vide et choix de la tension d'essai, correction de
   température des pertes en court-circuit, identification des paramètres et
   prévision, procès-verbal du transformateur du poste du site.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const RAC3 = Math.sqrt(3);

/* Transformateur de l'exemple : 2,5 kVA, 400 V / 230 V, paramètres vrais du cours précédent. */
const EX = { V1n: 400, m: 0.575, R1: 0.9, X1: 1.1, R2: 0.3, X2: 0.36, Rf: 4600, Xm: 2000, Sn: 2500 };
EX.I1n = EX.Sn / EX.V1n;

/* Lectures du relevé de la section H. */
const LECT = { V10: 400, I10: 0.218, P10: 34.8, V20: 229.8, I1cc: 6.25, V1cc: 17.73, P1cc: 70.6, I2cc: 10.86 };

/* Transformateur du poste du site : procès-verbal supposé, grandeurs par phase côté basse tension. */
const POSTE = { Sn: 100e3, U1: 20000, U2: 410, I1n: 100e3 / (RAC3 * 20000), I2n: 100e3 / (RAC3 * 410), Pcc22: 1490, PJ22: 1339.84, ucc22: 3.95, theta: 22 };
POSTE.m2 = Math.pow(POSTE.U2 / POSTE.U1, 2);
POSTE.Padd22 = POSTE.Pcc22 - POSTE.PJ22;
POSTE.ux = Math.sqrt(POSTE.ucc22 * POSTE.ucc22 - Math.pow((100 * POSTE.Pcc22) / POSTE.Sn, 2));
/* Résistance en continu ramenée côté basse tension, à 22 °C : 26,8 ohms x m² + 11,26 milliohms. */
POSTE.Rdc22 = 26.8 * POSTE.m2 + 0.01126;

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
 * Résolution exacte du schéma en T de l'exemple pour l'un des deux essais.
 * v1 : tension appliquée au primaire, en volts ; cc : vrai pour le secondaire en court-circuit.
 */
function resoudreEssai(v1, cc) {
  const m2 = EX.m * EX.m;
  const V1 = C.n(v1);
  const Z1 = C.n(EX.R1, EX.X1);
  const Zm = C.par(C.n(EX.Rf), C.n(0, EX.Xm));
  if (!cc) {
    const I1 = C.div(V1, C.add(Z1, Zm));
    const E1 = C.sub(V1, C.mul(Z1, I1));
    return { I1, E1, I0: I1, I2p: C.n(0), I2: 0, V2: EX.m * C.abs(E1) };
  }
  const Z2p = C.n(EX.R2 / m2, EX.X2 / m2);
  const I1 = C.div(V1, C.add(Z1, C.par(Zm, Z2p)));
  const E1 = C.sub(V1, C.mul(Z1, I1));
  const I2p = C.div(E1, Z2p);
  return { I1, E1, I0: C.div(E1, Zm), I2p, I2: C.abs(I2p) / EX.m, V2: 0 };
}

/** Bilan d'un essai : puissance absorbée, pertes fer et pertes cuivre. */
function bilanEssai(v1, s) {
  const m2 = EX.m * EX.m;
  const P1 = v1 * s.I1.re;
  const Q1 = -v1 * s.I1.im;
  const pf = Math.pow(C.abs(s.E1), 2) / EX.Rf;
  const pcu = EX.R1 * Math.pow(C.abs(s.I1), 2) + (EX.R2 / m2) * Math.pow(C.abs(s.I2p), 2);
  return { P1, Q1, pf, pcu };
}

/** Identification des paramètres à partir des six lectures (V10 = 400 V). */
function identifier(l) {
  const V10 = 400;
  const S0 = V10 * l.I10;
  const P10 = Math.min(l.P10, S0);
  const If = P10 / V10;
  const Imu = Math.sqrt(Math.max(0, l.I10 * l.I10 - If * If));
  const Zs1 = l.V1cc / l.I1cc;
  const Rs1 = l.P1cc / (l.I1cc * l.I1cc);
  const Xs1 = Math.sqrt(Math.max(0, Zs1 * Zs1 - Rs1 * Rs1));
  const Pcc = Rs1 * EX.I1n * EX.I1n;
  const ucc = (Zs1 * EX.I1n) / V10;
  const ur = Pcc / EX.Sn;
  const ux = Math.sqrt(Math.max(0, ucc * ucc - ur * ur));
  return {
    m: l.V20 / V10,
    cos0: P10 / S0,
    If,
    Imu,
    Rf: P10 > 0 ? (V10 * V10) / P10 : Infinity,
    Xm: Imu > 0 ? V10 / Imu : Infinity,
    Zs1,
    Rs1,
    Xs1,
    Pcc,
    P0: P10,
    ucc,
    ur,
    ux,
    incoherent: l.P10 > S0 || Rs1 > Zs1,
  };
}

/** Pertes en court-circuit du poste ramenées à la température theta. */
function pccPoste(theta) {
  const k = (235 + theta) / (235 + POSTE.theta);
  return { k, PJ: POSTE.PJ22 * k, Padd: POSTE.Padd22 / k, Pcc: POSTE.PJ22 * k + POSTE.Padd22 / k };
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

/** Bobine verticale de n demi-arcs de hauteur h, partant de (x, y) vers le bas. */
function bobineV(x, y, n, h, versGauche) {
  let d = "M" + x + " " + y;
  for (let k = 0; k < n; k += 1) d += "a" + h / 2 + " " + h / 2 + " 0 0 " + (versGauche ? 0 : 1) + " 0 " + h;
  return d;
}

/** Bobine horizontale de n arcs de largeur l, partant de (x, y) vers la droite. */
function bobineH(x, y, n, l) {
  let d = "M" + x + " " + y;
  for (let k = 0; k < n; k += 1) d += "a" + l / 2 + " " + l / 2 + " 0 0 1 " + l + " 0";
  return d;
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
  if (px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
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

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeursAnimation = [];

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireAnimBanc(racine, api);
  construirePhaseursVide(racine, api);
  construireSimVide(racine, api);
  construireAnimTemperature(racine, api);
  construireSimIdentification(racine, api);
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
    ["#d-familles-figure svg", 1.6],
    ["#e-vide-figure svg", 1.8],
    ["#e-cc-figure svg", 1.8],
    ["#f-schema-principal svg", 1.8],
    ["#h-donnees-figure svg", 1.4],
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
      id: "c-cosphi",
      titre: "Facteur de puissance à partir de trois lectures",
      niveau: "prérequis",
      enonce:
        "<p>Un récepteur alimenté sous $400\\ \\mathrm{V}$ absorbe $0{,}218\\ \\mathrm{A}$ et un wattmètre lit $34{,}8\\ \\mathrm{W}$. " +
        "Quel est son facteur de puissance ?</p>",
      valeur: 34.8 / (400 * 0.218),
      unite: "",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Facteur de puissance $\\cos\\varphi$",
      etapes: [
        { texte: "Puissance apparente : $S = VI = 400 \\times 0{,}218 = 87{,}2\\ \\mathrm{VA}$." },
        { texte: "$\\cos\\varphi = P/S = 34{,}8/87{,}2 = 0{,}399$, soit $\\varphi = 66{,}5^\\circ$." },
        {
          texte: "Puissance réactive : $Q = \\sqrt{87{,}2^2 - 34{,}8^2} = 79{,}95\\ \\mathrm{var}$.",
          note: "Ce sont exactement les lectures de l'essai à vide de la section H : $P$ donnera $R_f$ et $Q$ donnera $X_m$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 420 220",
          "<defs>" + marqueur("fl-c-tr") + "</defs>" +
            '<g fill="none" stroke="currentColor" stroke-linecap="round">' +
            '<path d="M40 40H109" stroke-width="2.4" marker-end="url(#fl-c-tr)"/>' +
            '<path d="M109.6 40V199" stroke-width="2" stroke-dasharray="7 5" marker-end="url(#fl-c-tr)"/>' +
            '<path d="M40 40L109.2 199" stroke-width="2.8" marker-end="url(#fl-c-tr)"/>' +
            "</g>" +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
            '<text x="44" y="30">P = 34,8 W</text><text x="120" y="130">Q = 79,95 var</text><text x="4" y="160">S = 87,2 VA</text>' +
            '<text x="60" y="62">66,5°</text><text x="180" y="40">échelle : 2 px par W, var ou VA</text></g>',
          "Triangle des puissances : la puissance active en trait plein horizontal, la puissance réactive en tirets vers le bas, la puissance apparente en trait épais, l'angle de 66,5 degrés entre P et S."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-reactance",
      titre: "Réactance tirée d'un module et d'une résistance",
      niveau: "prérequis",
      enonce:
        "<p>Une impédance série a pour module $67{,}24\\ \\mathrm{m\\Omega}$ et pour résistance $29{,}42\\ \\mathrm{m\\Omega}$. " +
        "Quelle est sa réactance, en milliohms ?</p>",
      valeur: Math.sqrt(67.24 * 67.24 - 29.42 * 29.42),
      unite: "mΩ",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Réactance $X$",
      etapes: [
        { texte: "Dans le triangle des impédances, $Z^2 = R^2 + X^2$." },
        { texte: "$X = \\sqrt{67{,}24^2 - 29{,}42^2} = \\sqrt{4521{,}2 - 865{,}5} = 60{,}46\\ \\mathrm{m\\Omega}$." },
        {
          texte: "On reconnaît l'impédance de court-circuit du poste supposée au cours précédent ; l'essai en court-circuit mesure justement $Z$ et $R$.",
          note: "Une soustraction de deux carrés voisins amplifie les erreurs : si $R$ approche $Z$, $X$ devient très incertaine.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 420 230",
          "<defs>" + marqueur("fl-c-z") + "</defs>" +
            '<g fill="none" stroke="currentColor" stroke-linecap="round">' +
            '<path d="M40 200H127" stroke-width="2.6" marker-end="url(#fl-c-z)"/>' +
            '<path d="M128 200V22" stroke-width="2" stroke-dasharray="7 5" marker-end="url(#fl-c-z)"/>' +
            '<path d="M40 200L127 22" stroke-width="2.6" stroke-dasharray="2 3" marker-end="url(#fl-c-z)"/>' +
            "</g>" +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
            '<text x="50" y="220">R = 29,42 mΩ</text><text x="138" y="110">X = 60,46 mΩ</text><text x="14" y="90">Z = 67,24 mΩ</text>' +
            '<text x="220" y="40">échelle : 3 px par mΩ</text></g>',
          "Triangle des impédances : la résistance en trait plein horizontal, la réactance en tirets verticaux, le module en pointillés, hypoténuse du triangle."
        );
      },
    })
  );

  ressources.push(
    api.exercice.qcm("#c-minitest", {
      id: "c-familles",
      titre: "Ce qui dépend de la tension, ce qui dépend du courant",
      niveau: "prérequis",
      enonce:
        "<p>Dans le schéma de Kapp d'un transformateur alimenté sous tension constante, quelles grandeurs restent presque constantes " +
        "de la marche à vide à la pleine charge ?</p>",
      options: [
        { texte: "Les pertes fer dissipées dans $R_f$.", juste: true },
        { texte: "Le courant magnétisant prélevé par $X_m$.", juste: true },
        { texte: "Les pertes cuivre dissipées dans $R_s$." },
        { texte: "La chute de tension dans $X_s$." },
      ],
      etapes: [
        { texte: "La branche magnétisante est placée sous $V_1$, constante : son courant et ses pertes ne dépendent pas de la charge." },
        { texte: "L'impédance série porte le courant de charge : sa chute croît comme le courant, ses pertes comme son carré." },
        {
          texte: "D'où les deux essais : à vide pour la branche parallèle, en court-circuit pour la branche série.",
          note: "Le cours Transformateur réel a établi cette séparation ; cette séance en tire une méthode de mesure.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Pertes du transformateur de l'exemple en fonction de la charge",
          xTitre: "x = I / In",
          yTitre: "pertes",
          yUnite: "W",
          xMin: 0,
          xMax: 1.2,
          yMin: 0,
          yMax: 110,
          series: [
            { id: "f", nom: "pertes fer", couleur: "serie-1", epaisseur: 2.4, fonction: () => 34.8 },
            { id: "c", nom: "pertes cuivre", couleur: "serie-5", epaisseur: 2.4, fonction: (x) => x * x * 70.6 },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : le banc d'essais
   -------------------------------------------------------------------------- */

function construireAnimBanc(racine, api) {
  const conteneur = racine.querySelector("#d-anim");
  if (!conteneur) return;

  const CALIBRE = { vide: 460, cc: 24 };
  const DEPART = { vide: 400 / 460, cc: 17.73 / 24 };
  const etat = { cc: 0, u: DEPART.vide };
  const H = { haut: 64, bas: 236 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 430",
    role: "img",
    "aria-label": "Banc d'essais animé : autotransformateur réglable, ampèremètre, wattmètre et voltmètre au primaire, transformateur représenté par son schéma de Kapp, secondaire ouvert ou en court-circuit, et partage de la puissance absorbée entre pertes fer et pertes cuivre",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-d-banc");
  const fixe = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" });
  fixe.innerHTML =
    '<path d="M20 60H70M20 240H70"/>' +
    '<path d="' + bobineV(70, 60, 10, 18, false) + '"/>' +
    '<path d="M120 60H147M173 60H200M250 60H390M70 240H570"/>' +
    '<circle cx="160" cy="60" r="13"/>' +
    '<rect x="200" y="47" width="50" height="26" rx="3"/>' +
    '<path d="M225 73V240"/>' +
    '<path d="M290 60V137M290 163V240"/>' +
    '<circle cx="290" cy="150" r="13"/>' +
    '<path d="' + bobineV(570, 90, 6, 20, false) + '"/>' +
    '<path d="M582 86V214M588 86V214"/>' +
    '<path d="' + bobineV(600, 90, 6, 20, true) + '"/>' +
    '<path d="M536 60H570V90M570 210V240"/>' +
    '<path d="M600 90V60H640M600 210V240H640"/>';
  const bornes = svgEl("g", { fill: "currentColor", stroke: "none" });
  bornes.innerHTML =
    '<circle cx="20" cy="60" r="4"/><circle cx="20" cy="240" r="4"/><circle cx="225" cy="240" r="3"/><circle cx="290" cy="60" r="3"/>' +
    '<circle cx="290" cy="240" r="3"/><circle cx="390" cy="60" r="3"/><circle cx="390" cy="240" r="3"/><circle cx="562" cy="84" r="4"/><circle cx="608" cy="84" r="4"/>';
  const sortie = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linejoin": "round" });
  const flechePrise = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.8, "marker-end": "url(#fl-d-banc)" });
  const branche = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round" });
  branche.innerHTML =
    '<path d="M390 60V84H375V95M390 84H405V93M375 155V170H405V157M390 170V240"/>' +
    '<rect x="367" y="95" width="16" height="60" rx="2"/>' +
    '<path d="' + bobineV(405, 93, 4, 16, false) + '"/>';
  const serie = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round" });
  serie.innerHTML =
    '<path d="M390 60H420M470 60H480"/>' +
    '<rect x="420" y="52" width="50" height="16" rx="2"/>' +
    '<path d="' + bobineH(480, 60, 4, 14) + '"/>';
  const ouvert = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round" });
  ouvert.innerHTML = '<path d="M640 60H670V137M670 163V240H640"/><circle cx="670" cy="150" r="13"/>';
  const ferme = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 5, "stroke-linecap": "round", "stroke-linejoin": "round" });
  ferme.innerHTML = '<path d="M640 60H670V137M670 163V240H640"/><circle cx="670" cy="150" r="13" stroke-width="2"/>';
  const fleches = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round" });
  fleches.innerHTML =
    '<path d="M126 46H146" marker-end="url(#fl-d-banc)"/>' +
    '<path d="M312 226V74" marker-end="url(#fl-d-banc)"/>';
  const barresFond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1, opacity: 0.5 });
  barresFond.innerHTML = '<rect x="170" y="318" width="420" height="20" rx="3"/><rect x="170" y="358" width="420" height="20" rx="3"/>';
  const barreFer = svgEl("rect", { x: 170, y: 318, height: 20, rx: 3, fill: "currentColor", opacity: 0.55 });
  const barreCu = svgEl("rect", { x: 170, y: 358, height: 20, rx: 3, fill: "none", stroke: "currentColor", "stroke-width": 2.4, "stroke-dasharray": "6 3" });
  const fixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  fixes.innerHTML =
    texte(155, 64, "A") + texte(219, 64, "W") + texte(285, 154, "V") +
    texte(4, 40, "réseau") + texte(30, 270, "autotransformateur") +
    texte(152, 92, "A1") + texte(232, 190, "circuit") + texte(232, 204, "tension") + texte(318, 186, "V1") +
    texte(342, 130, "Rf") + texte(416, 130, "Xm") + texte(430, 90, "Rs1") + texte(492, 90, "Xs1") +
    texte(540, 262, "1 : m idéal") + texte(20, 306, "partage de la puissance lue par W") +
    texte(20, 332, "pertes fer") + texte(20, 372, "pertes cuivre") + texte(20, 414, "référence du primaire : fil inférieur");
  const variables = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fixe, sortie, flechePrise, branche, serie, ouvert, ferme, fleches, bornes, barresFond, barreFer, barreCu, fixes, variables);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-anim-valeurs", [
    { id: "v1", libelle: "V1 lue", unite: "V", decimales: 2 },
    { id: "i1", libelle: "I1 lue", unite: "A", decimales: 3 },
    { id: "rel", libelle: "I1 / I1n", unite: "%", decimales: 1 },
    { id: "p1", libelle: "P1 lue par W", unite: "W", decimales: 2 },
    { id: "s1", libelle: "Puissance apparente de la source", unite: "VA", decimales: 1 },
    { id: "cos", libelle: "cos φ1", decimales: 3 },
    { id: "sec", libelle: "V2 ou I2 au secondaire", decimales: 2 },
    { id: "pf", libelle: "Pertes fer", unite: "W", decimales: 3 },
    { id: "pcu", libelle: "Pertes cuivre", unite: "W", decimales: 3 },
    { id: "part", libelle: "Part du noyau dans P1", unite: "%", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const mode = etat.cc ? "cc" : "vide";
    const v1 = etat.u * CALIBRE[mode];
    const yP = H.bas - etat.u * (H.bas - H.haut);
    sortie.setAttribute("d", "M92 " + yP.toFixed(1) + "H120V60");
    flechePrise.setAttribute("d", segment(92, yP, 76, yP));
    const s = resoudreEssai(v1, Boolean(etat.cc));
    const b = bilanEssai(v1, s);
    const i0 = C.abs(s.I0);
    const i2p = C.abs(s.I2p);
    branche.setAttribute("stroke-width", (1 + 4 * Math.min(1, i0 / 0.25)).toFixed(2));
    branche.setAttribute("stroke-dasharray", i0 < 0.01 ? "2 4" : "none");
    branche.setAttribute("opacity", i0 < 0.01 ? 0.7 : 1);
    serie.setAttribute("stroke-width", (1 + 5 * Math.min(1, i2p / 8)).toFixed(2));
    serie.setAttribute("stroke-dasharray", i2p < 1e-9 ? "2 4" : "none");
    serie.setAttribute("opacity", i2p < 1e-9 ? 0.7 : 1);
    ouvert.setAttribute("display", etat.cc ? "none" : "inline");
    ferme.setAttribute("display", etat.cc ? "inline" : "none");
    const total = Math.max(1e-12, b.pf + b.pcu);
    barreFer.setAttribute("width", ((420 * b.pf) / total).toFixed(1));
    barreCu.setAttribute("width", ((420 * b.pcu) / total).toFixed(1));
    const i1 = C.abs(s.I1);
    variables.innerHTML =
      texte(4, yP + 4, nombre(api, v1, 1) + " V") +
      texte(30, 286, "calibre : 0 à " + CALIBRE[mode] + " V") +
      texte(100, 30, "I1 = " + nombre(api, i1, 3) + " A") +
      texte(318, 210, nombre(api, v1, 1) + " V") +
      texte(352, 30, etat.cc ? "court-circuit : branche série en jeu" : "à vide : branche magnétisante en jeu") +
      (etat.cc ? texte(665, 154, "A") + texte(686, 120, "A2") + texte(630, 262, "I2 = " + nombre(api, s.I2, 2) + " A") : texte(665, 154, "V") + texte(686, 120, "V2") + texte(630, 262, "V2 = " + nombre(api, s.V2, 1) + " V")) +
      texte(600, 332, nombre(api, b.pf, b.pf < 1 ? 3 : 1) + " W") +
      texte(600, 372, nombre(api, b.pcu, b.pcu < 1 ? 3 : 1) + " W");
    if (valeurs) {
      valeurs.maj({
        v1,
        i1,
        rel: (100 * i1) / EX.I1n,
        p1: b.P1,
        s1: v1 * i1,
        cos: v1 * i1 > 0 ? b.P1 / (v1 * i1) : 0,
        sec: etat.cc ? s.I2 : s.V2,
        pf: b.pf,
        pcu: b.pcu,
        part: total > 1e-9 ? (100 * b.pf) / total : 0,
      });
    }
  }

  let synchro = false;
  let poignee = null;
  let lecteur = null;
  function appliquer(u, source) {
    if (synchro) return;
    synchro = true;
    etat.u = Math.max(0, Math.min(1, Number(u)));
    dessiner();
    if (source !== "poignee" && poignee) poignee.set(etat.u, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(etat.u);
    synchro = false;
  }

  poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: 92, y: H.bas },
    a: { x: 92, y: H.haut },
    min: 0,
    max: 1,
    pas: 0.005,
    valeur: etat.u,
    libelle: "Prise de l'autotransformateur",
    diffuserAuDepart: false,
    rappel(mesure) {
      appliquer(mesure.valeur, "poignee");
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-anim-curseurs",
    [{ id: "cc", libelle: "Essai réalisé", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (v >= 0.5 ? "court-circuit, calibre 24 V" : "à vide, calibre 460 V") }],
    (lues) => {
      const cc = lues.cc >= 0.5 ? 1 : 0;
      if (cc !== etat.cc) {
        etat.cc = cc;
        appliquer(cc ? DEPART.cc : DEPART.vide, null);
      }
    }
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#d-anim-lecteur", {
    de: 0,
    a: 1,
    duree: 6,
    boucle: false,
    auto: false,
    libelle: "Montée progressive de la tension depuis zéro",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  appliquer(DEPART.vide, null);
}

/* --------------------------------------------------------------------------
   E. Animation : phaseur du courant à vide et lectures des instruments
   -------------------------------------------------------------------------- */

function construirePhaseursVide(racine, api) {
  const conteneur = racine.querySelector("#e-phaseurs");
  if (!conteneur) return;

  const O = { x: 40, y: 80 };
  const ECH = 700;
  const T0 = 400;
  const T1 = 700;
  const Y0 = 210;
  const A = 100;
  const etat = { If: LECT.P10 / LECT.V10, Imu: Math.sqrt(LECT.I10 * LECT.I10 - Math.pow(LECT.P10 / LECT.V10, 2)), phase: 60 };
  const versT = (deg) => T0 + ((T1 - T0) * deg) / 360;

  const svg = svgEl("svg", {
    viewBox: "0 0 720 400",
    role: "img",
    "aria-label": "Essai à vide : diagramme de Fresnel avec la tension de référence et le courant à vide décomposé en composantes active et magnétisante, et formes d'onde de la tension, du courant et de la puissance instantanée sur une période",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-ph");
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.55 });
  let traits = "M" + (O.x - 10) + " " + O.y + "H" + 340 + "M" + O.x + " " + (O.y - 20) + "V" + 370;
  traits += "M" + T0 + " " + Y0 + "H" + (T1 + 8) + "M" + T0 + " " + (Y0 + A + 10) + "V" + (Y0 - A - 10);
  for (const d of [90, 180, 270, 360]) traits += "M" + versT(d) + " " + (Y0 - 4) + "v8";
  fond.innerHTML = '<path d="' + traits + '"/>';
  const vecV = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "marker-end": "url(#fl-e-ph)", d: segment(O.x, O.y, 320, O.y) });
  const vecI = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3.4, "marker-end": "url(#fl-e-ph)" });
  const projections = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.4, "stroke-dasharray": "6 4" });
  const arc = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.2 });
  const courbeV = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.4 });
  const courbeI = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3 });
  const courbeP = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-dasharray": "7 5" });
  const moyenne = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.4, "stroke-dasharray": "2 3" });
  const curseurT = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.85 });
  const fixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  fixes.innerHTML =
    texte(250, O.y - 10, "V10 = 400 V") +
    texte(O.x + 4, 392, "courants : 700 px par ampère ; poignée : extrémité de I10") +
    texte(T0, Y0 - A - 38, "v fin ; i épais ; p = v i tirets") +
    texte(T0, Y0 - A - 22, "moyenne de p : pointillés") +
    texte(versT(180) - 14, Y0 + 18, "180°") +
    texte(versT(360) - 16, Y0 + 18, "360°") +
    texte(T0, Y0 + A + 30, "ωt, lecteur : instant de la période");
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, vecV, projections, arc, vecI, courbeV, courbeP, courbeI, moyenne, curseurT, fixes, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-phaseurs-valeurs", [
    { id: "i0", libelle: "I10 lue par l'ampèremètre", unite: "A", decimales: 3 },
    { id: "phi", libelle: "Retard φ0", unite: "°", decimales: 1 },
    { id: "cos", libelle: "cos φ0", decimales: 3 },
    { id: "if", libelle: "If", unite: "A", decimales: 4 },
    { id: "imu", libelle: "Iμ", unite: "A", decimales: 4 },
    { id: "p", libelle: "P10 lue par le wattmètre", unite: "W", decimales: 2 },
    { id: "q", libelle: "Q10", unite: "var", decimales: 2 },
    { id: "rf", libelle: "Rf = V² / P", unite: "Ω", decimales: 0 },
    { id: "xm", libelle: "Xm = V / Iμ", unite: "Ω", decimales: 0 },
    { id: "pinst", libelle: "p à l'instant choisi", unite: "W", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const V = LECT.V10;
  function dessiner() {
    const i0 = Math.hypot(etat.If, etat.Imu);
    const phi = Math.atan2(etat.Imu, etat.If);
    const px = O.x + etat.If * ECH;
    const py = O.y + etat.Imu * ECH;
    vecI.setAttribute("d", i0 > 1e-4 ? segment(O.x, O.y, px, py) : "");
    projections.setAttribute("d", segment(px, py, px, O.y) + segment(px, py, O.x, py));
    const r = 46;
    arc.setAttribute(
      "d",
      i0 > 0.02 ? "M" + (O.x + r) + " " + O.y + "A" + r + " " + r + " 0 0 1 " + (O.x + r * Math.cos(phi)).toFixed(1) + " " + (O.y + r * Math.sin(phi)).toFixed(1) : ""
    );
    const P = V * etat.If;
    const S = V * i0;
    const echP = Math.max(60, (P + S) * 1.1);
    const echI = Math.max(0.05, i0 * 1.1);
    const pV = [];
    const pI = [];
    const pP = [];
    for (let k = 0; k <= 180; k += 1) {
      const deg = k * 2;
      const t = deg * DEG;
      const v = Math.cos(t);
      const ii = (i0 / echI) * Math.cos(t - phi);
      const p = 2 * V * i0 * Math.cos(t) * Math.cos(t - phi);
      const x = versT(deg).toFixed(1);
      pV.push(x + " " + (Y0 - A * 0.9 * v).toFixed(1));
      pI.push(x + " " + (Y0 - A * ii).toFixed(1));
      pP.push(x + " " + (Y0 - (A * p) / echP).toFixed(1));
    }
    courbeV.setAttribute("d", "M" + pV.join(" L"));
    courbeI.setAttribute("d", "M" + pI.join(" L"));
    courbeP.setAttribute("d", "M" + pP.join(" L"));
    const yMoy = Y0 - (A * P) / echP;
    moyenne.setAttribute("d", "M" + T0 + " " + yMoy.toFixed(1) + "H" + T1);
    const xt = versT(etat.phase);
    curseurT.setAttribute("d", "M" + xt.toFixed(1) + " " + (Y0 - A - 6) + "V" + (Y0 + A + 6));
    libelles.innerHTML =
      (i0 > 0.02 ? texte(px + 10, py + 14, "I10") : "") +
      (etat.If > 0.02 ? texte(O.x + (etat.If * ECH) / 2 - 8, O.y - 8, "If") : "") +
      (etat.Imu > 0.03 ? texte(O.x - 30, O.y + (etat.Imu * ECH) / 2 + 4, "Iμ") : "") +
      (i0 > 0.02 ? texte(O.x + 30 * Math.cos(phi / 2) - 4, O.y + 30 * Math.sin(phi / 2) + 4, "φ0") : "") +
      texte(T1 - 120, yMoy - 6, "P10 = " + nombre(api, P, 1) + " W");
    if (valeurs) {
      const t = etat.phase * DEG;
      valeurs.maj({
        i0,
        phi: phi / DEG,
        cos: i0 > 0 ? etat.If / i0 : 0,
        if: etat.If,
        imu: etat.Imu,
        p: P,
        q: V * etat.Imu,
        rf: etat.If > 1e-6 ? V / etat.If : Infinity,
        xm: etat.Imu > 1e-6 ? V / etat.Imu : Infinity,
        pinst: 2 * V * i0 * Math.cos(t) * Math.cos(t - phi),
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: O.x, y: O.y, largeur: 0.35 * ECH, hauteur: 0.4 * ECH },
    valeur: { x: O.x + etat.If * ECH, y: O.y + etat.Imu * ECH },
    libelle: "Extrémité du phaseur du courant à vide",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.If = (mesure.x - O.x) / ECH;
      etat.Imu = (mesure.y - O.y) / ECH;
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const lecteur = api.sim.lecteur("#e-phaseurs-lecteur", {
    de: 0,
    a: 360,
    duree: 6,
    boucle: true,
    auto: false,
    libelle: "Une période de la tension d'essai",
    rappel: (valeur) => {
      etat.phase = Number(valeur);
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);
  etat.phase = 60;
  if (lecteur) lecteur.suivre(etat.phase);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : courbe à vide et choix de la tension d'essai
   -------------------------------------------------------------------------- */

function construireSimVide(racine, api) {
  const etat = { s: 0.25, beta: 2, um: 1 };
  const P0n = LECT.P10;
  const Ifn = LECT.P10 / LECT.V10;
  const Imun = Math.sqrt(LECT.I10 * LECT.I10 - Ifn * Ifn);
  const modele = (u) => {
    const imu = Imun * ((1 - etat.s) * u + etat.s * Math.pow(u, 9));
    const P = P0n * Math.pow(u, etat.beta);
    const V = u * LECT.V10;
    const If = V > 0 ? P / V : 0;
    return { V, imu, P, If, I0: Math.hypot(If, imu) };
  };

  const trace = api.sim.traceur("#e-sim-vide-trace", {
    titre: "Courbe à vide du transformateur de l'exemple",
    xTitre: "V / Vn",
    yTitre: "valeur / valeur sous Vn",
    xMin: 0.4,
    xMax: 1.2,
    yMin: 0,
    yMax: 3,
    series: [
      { id: "i", nom: "courant à vide I0 / I0n", couleur: "serie-1", epaisseur: 2.8, fonction: (u) => modele(u).I0 / modele(1).I0 },
      { id: "p", nom: "pertes à vide P0 / P0n", couleur: "serie-5", epaisseur: 2.2, fonction: (u) => modele(u).P / P0n },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, 1, "Vn", [2, 3]);
      ligneV(c, repere, couleurs, etat.um, null);
      const g = modele(etat.um);
      pointTrace(c, repere, couleurs, etat.um, g.I0 / modele(1).I0, null);
      pointTrace(c, repere, couleurs, etat.um, g.P / P0n, null);
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-sim-vide-valeurs", [
    { id: "v", libelle: "Tension d'essai", unite: "V", decimales: 0 },
    { id: "i0", libelle: "Courant à vide", unite: "A", decimales: 3 },
    { id: "p0", libelle: "Pertes à vide", unite: "W", decimales: 2 },
    { id: "cos", libelle: "cos φ0", decimales: 3 },
    { id: "rf", libelle: "Rf identifiée", unite: "Ω", decimales: 0 },
    { id: "drf", libelle: "Écart sur Rf", unite: "%", decimales: 1 },
    { id: "xm", libelle: "Xm identifiée", unite: "Ω", decimales: 0 },
    { id: "dxm", libelle: "Écart sur Xm", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    if (trace) trace.rafraichir();
    const g = modele(etat.um);
    const n = modele(1);
    const rf = (g.V * g.V) / g.P;
    const xm = g.V / g.imu;
    const rfn = (n.V * n.V) / n.P;
    const xmn = n.V / n.imu;
    if (valeurs) {
      valeurs.maj({
        v: g.V,
        i0: g.I0,
        p0: g.P,
        cos: g.P / (g.V * g.I0),
        rf,
        drf: 100 * (rf / rfn - 1),
        xm,
        dxm: 100 * (xm / xmn - 1),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-sim-vide-curseurs",
    [
      { id: "s", libelle: "Part de saturation dans Iμ sous Vn", min: 0, max: 0.6, pas: 0.01, valeur: etat.s, format: (v) => nombre(api, v * 100, 0) + " %" },
      { id: "beta", libelle: "Exposant β des pertes fer", min: 1.5, max: 2.5, pas: 0.05, valeur: etat.beta, format: (v) => nombre(api, v, 2) },
      { id: "um", libelle: "Tension d'essai V / Vn", min: 0.5, max: 1.15, pas: 0.01, valeur: etat.um, format: (v) => nombre(api, v * 100, 0) + " %" },
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
   E. Animation : correction de température des pertes en court-circuit
   -------------------------------------------------------------------------- */

function construireAnimTemperature(racine, api) {
  const conteneur = racine.querySelector("#e-temp");
  if (!conteneur) return;

  const G = { x0: 60, x1: 380, y0: 300, y1: 40, tMin: -40, tMax: 140, rMax: 32 };
  const versX = (t) => G.x0 + ((t - G.tMin) * (G.x1 - G.x0)) / (G.tMax - G.tMin);
  const versY = (r) => G.y0 - (r * (G.y0 - G.y1)) / G.rMax;
  const rdc = (t) => POSTE.Rdc22 * 1000 * ((235 + t) / (235 + POSTE.theta));
  const T = { x: 450, y: 300, ech: 55 };
  const etat = { theta: 75 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 360",
    role: "img",
    "aria-label": "Correction de température : droite de la résistance en continu en fonction de la température, et triangle de court-circuit à la température choisie comparé à celui de la mesure à 22 degrés",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-te");
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.55 });
  let traits = "M" + G.x0 + " " + G.y0 + "H" + (G.x1 + 6) + "M" + G.x0 + " " + G.y0 + "V" + (G.y1 - 6);
  for (const t of [-40, 0, 40, 80, 120]) traits += "M" + versX(t).toFixed(1) + " " + G.y0 + "v6";
  for (const r of [0, 10, 20, 30]) traits += "M" + G.x0 + " " + versY(r).toFixed(1) + "h-6";
  traits += "M" + T.x + " " + T.y + "H" + (T.x + 260) + "M" + T.x + " " + T.y + "V" + 50;
  fond.innerHTML = '<path d="' + traits + '"/>';
  const droite = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.4, d: segment(versX(G.tMin), versY(rdc(G.tMin)), versX(G.tMax), versY(rdc(G.tMax))) });
  const prolongement = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.4, "stroke-dasharray": "2 4", d: segment(versX(G.tMin), versY(rdc(G.tMin)), 30, versY(rdc(G.tMin)) + ((versX(G.tMin) - 30) * (versY(rdc(0)) - versY(rdc(40)))) / (versX(40) - versX(0))) });
  const ref75 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.2, "stroke-dasharray": "6 4", d: segment(versX(75), G.y0, versX(75), G.y1) });
  const carre = svgEl("rect", { x: versX(22) - 4, y: versY(rdc(22)) - 4, width: 8, height: 8, fill: "currentColor" });
  const repere = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.8 });
  const point = svgEl("circle", { r: 4.5, fill: "currentColor" });
  const triRef = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.4, "stroke-dasharray": "2 3" });
  const triUr = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3.2 });
  const triUx = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-dasharray": "7 5" });
  const triUcc = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "marker-end": "url(#fl-e-te)" });
  const fixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  fixes.innerHTML =
    texte(G.x0 + 4, G.y1 - 12, "R continu ramenée BT, mΩ") +
    [-40, 0, 40, 80, 120].map((t) => texte(versX(t) - 10, G.y0 + 20, String(t))).join("") +
    [0, 10, 20, 30].map((r) => texte(G.x0 - 30, versY(r) + 4, String(r))).join("") +
    texte(G.x1 - 30, G.y0 + 36, "θ en °C") +
    texte(versX(75) + 4, G.y1 - 12, "75 °C") +
    texte(versX(22) + 8, versY(rdc(22)) + 18, "mesure 22 °C") +
    texte(64, versY(rdc(G.tMin)) + 30, "vers -235 °C") +
    texte(T.x, 30, "triangle de court-circuit, en %") +
    texte(T.x + 4, T.y + 20, "ur") +
    texte(T.x, 352, "échelle : 1 % = 55 px");
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, prolongement, droite, ref75, carre, repere, point, triRef, triUr, triUx, triUcc, fixes, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-temp-valeurs", [
    { id: "theta", libelle: "Température", unite: "°C", decimales: 0 },
    { id: "k", libelle: "Facteur k", decimales: 4 },
    { id: "r", libelle: "R continu ramenée BT", unite: "mΩ", decimales: 2 },
    { id: "pj", libelle: "Pertes Joule", unite: "W", decimales: 1 },
    { id: "pa", libelle: "Pertes supplémentaires", unite: "W", decimales: 1 },
    { id: "pcc", libelle: "Pcc", unite: "W", decimales: 1 },
    { id: "ecart", libelle: "Écart à la mesure", unite: "%", decimales: 1 },
    { id: "ur", libelle: "ur", unite: "%", decimales: 3 },
    { id: "ucc", libelle: "ucc", unite: "%", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const ur22 = (100 * POSTE.Pcc22) / POSTE.Sn;
  triRef.setAttribute(
    "d",
    "M" + T.x + " " + T.y + "H" + (T.x + ur22 * T.ech).toFixed(1) + "V" + (T.y - POSTE.ux * T.ech).toFixed(1) + "Z"
  );

  function dessiner() {
    const t = etat.theta;
    const c = pccPoste(t);
    const ur = (100 * c.Pcc) / POSTE.Sn;
    const ucc = Math.hypot(ur, POSTE.ux);
    const x = versX(t);
    const y = versY(rdc(t));
    repere.setAttribute("d", segment(x, G.y0, x, y) + segment(x, y, G.x0, y));
    point.setAttribute("cx", x.toFixed(1));
    point.setAttribute("cy", y.toFixed(1));
    const xr = T.x + ur * T.ech;
    const yx = T.y - POSTE.ux * T.ech;
    triUr.setAttribute("d", segment(T.x, T.y, xr, T.y));
    triUx.setAttribute("d", segment(xr, T.y, xr, yx));
    triUcc.setAttribute("d", segment(T.x, T.y, xr, yx));
    libelles.innerHTML =
      texte(xr + 8, (T.y + yx) / 2, "ux = " + nombre(api, POSTE.ux, 2) + " %") +
      texte((T.x + xr) / 2 - 70, (T.y + yx) / 2 - 10, "ucc = " + nombre(api, ucc, 2) + " %") +
      texte(T.x + 30, T.y + 20, nombre(api, ur, 2) + " %") +
      texte(Math.min(x + 8, G.x1 - 120), y - 10, nombre(api, rdc(t), 2) + " mΩ") +
      texte(T.x, 332, "Pcc = " + nombre(api, c.Pcc, 1) + " W à " + nombre(api, t, 0) + " °C");
    if (valeurs) {
      valeurs.maj({
        theta: t,
        k: c.k,
        r: rdc(t),
        pj: c.PJ,
        pa: c.Padd,
        pcc: c.Pcc,
        ecart: 100 * (c.Pcc / POSTE.Pcc22 - 1),
        ur,
        ucc,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: versX(-20), y: G.y0 },
    a: { x: versX(G.tMax), y: G.y0 },
    min: -20,
    max: G.tMax,
    pas: 1,
    valeur: etat.theta,
    unite: "°C",
    libelle: "Température des enroulements",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.theta = Number(mesure.valeur);
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);
  dessiner();
}

/* --------------------------------------------------------------------------
   H. Simulation : des lectures au modèle, puis à la prévision
   -------------------------------------------------------------------------- */

function construireSimIdentification(racine, api) {
  const etat = { I10: LECT.I10, P10: LECT.P10, V20: LECT.V20, I1cc: LECT.I1cc, V1cc: LECT.V1cc, P1cc: LECT.P1cc };
  let id = identifier(etat);
  const tension = (x, cos, signe) => {
    const sin = signe * Math.sqrt(1 - cos * cos);
    return etat.V20 * (1 - x * (id.ur * cos + id.ux * sin));
  };

  const trace = api.sim.traceur("#h-sim-trace", {
    titre: "Tension secondaire prévue par le modèle identifié",
    xTitre: "x = I2 / I2n",
    yTitre: "V2",
    yUnite: "V",
    xMin: 0,
    xMax: 1.5,
    yMin: 205,
    yMax: 245,
    series: [
      { id: "ind", nom: "cos φ = 0,8 inductif", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => tension(x, 0.8, 1) },
      { id: "res", nom: "cos φ = 1", couleur: "serie-3", epaisseur: 2.2, fonction: (x) => tension(x, 1, 0) },
      { id: "cap", nom: "cos φ = 0,8 capacitif", couleur: "serie-5", epaisseur: 2.2, fonction: (x) => tension(x, 0.8, -1) },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, etat.V20, "V20 mesurée", false);
      const opt = Math.sqrt(id.P0 / id.Pcc);
      ligneV(c, repere, couleurs, opt, "optimum " + nombre(api, opt, 2), [2, 3]);
      pointTrace(c, repere, couleurs, 1, tension(1, 0.8, 1), nombre(api, tension(1, 0.8, 1), 1) + " V");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#h-sim-valeurs", [
    { id: "m", libelle: "m = V20 / V10", decimales: 4 },
    { id: "cos0", libelle: "cos φ0", decimales: 3 },
    { id: "rf", libelle: "Rf", unite: "Ω", decimales: 0 },
    { id: "xm", libelle: "Xm", unite: "Ω", decimales: 0 },
    { id: "rs", libelle: "Rs1", unite: "Ω", decimales: 3 },
    { id: "xs", libelle: "Xs1", unite: "Ω", decimales: 3 },
    { id: "ucc", libelle: "ucc", unite: "%", decimales: 2 },
    { id: "ur", libelle: "ur", unite: "%", decimales: 2 },
    { id: "ux", libelle: "ux", unite: "%", decimales: 2 },
    { id: "dv", libelle: "Chute à I2n, cos φ = 0,8 inductif", unite: "%", decimales: 2 },
    { id: "dv1", libelle: "Chute à I2n, cos φ = 1", unite: "%", decimales: 2 },
    { id: "eta", libelle: "Rendement à pleine charge, cos φ = 0,8", unite: "%", decimales: 2 },
    { id: "opt", libelle: "Charge de rendement maximal", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    id = identifier(etat);
    if (trace) trace.rafraichir();
    if (valeurs) {
      const p2 = 0.8 * EX.Sn;
      valeurs.maj({
        m: id.m,
        cos0: id.cos0,
        rf: id.Rf,
        xm: id.Xm,
        rs: id.Rs1,
        xs: id.Xs1,
        ucc: 100 * id.ucc,
        ur: 100 * id.ur,
        ux: 100 * id.ux,
        dv: 100 * (id.ur * 0.8 + id.ux * 0.6),
        dv1: 100 * id.ur,
        eta: (100 * p2) / (p2 + id.P0 + id.Pcc),
        opt: Math.sqrt(id.P0 / id.Pcc),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#h-sim-curseurs",
    [
      { id: "I10", libelle: "Essai à vide : I10 sous 400 V", min: 0.1, max: 0.4, pas: 0.001, valeur: etat.I10, format: (v) => nombre(api, v, 3) + " A" },
      { id: "P10", libelle: "Essai à vide : P10", min: 10, max: 80, pas: 0.1, valeur: etat.P10, format: (v) => nombre(api, v, 1) + " W" },
      { id: "V20", libelle: "Essai à vide : V20", min: 225, max: 235, pas: 0.1, valeur: etat.V20, format: (v) => nombre(api, v, 1) + " V" },
      { id: "I1cc", libelle: "Court-circuit : I1cc", min: 3, max: 7, pas: 0.01, valeur: etat.I1cc, format: (v) => nombre(api, v, 2) + " A" },
      { id: "V1cc", libelle: "Court-circuit : V1cc", min: 8, max: 30, pas: 0.01, valeur: etat.V1cc, format: (v) => nombre(api, v, 2) + " V" },
      { id: "P1cc", libelle: "Court-circuit : P1cc", min: 20, max: 140, pas: 0.1, valeur: etat.P1cc, format: (v) => nombre(api, v, 1) + " W" },
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
  '<text x="96" y="88">Rcc</text><text x="164" y="88">Xcc</text><text x="14" y="126">Rf</text><text x="84" y="126">Xm</text>' +
  '<text x="264" y="64">vers la charge</text></g>';

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-vide",
      titre: "Branche magnétisante à partir d'un essai à vide",
      niveau: "fondamental",
      enonce:
        "<p>Un transformateur monophasé de $1\\ \\mathrm{kVA}$, $230\\ \\mathrm{V} / 115\\ \\mathrm{V}$, est essayé à vide côté $230\\ \\mathrm{V}$ : " +
        "$V_{10} = 230\\ \\mathrm{V}$, $I_{10} = 0{,}20\\ \\mathrm{A}$, $P_{10} = 12\\ \\mathrm{W}$. Quelle est sa réactance magnétisante vue du côté " +
        "$230\\ \\mathrm{V}$, en ohms ?</p>",
      valeur: 230 / Math.sqrt(0.04 - Math.pow(12 / 230, 2)),
      unite: "Ω",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Réactance magnétisante $X_m$",
      etapes: [
        { texte: "$\\cos\\varphi_0 = 12/(230 \\times 0{,}20) = 0{,}261$ ; composante active $I_f = 12/230 = 0{,}052\\,2\\ \\mathrm{A}$." },
        { texte: "Composante magnétisante : $I_\\mu = \\sqrt{0{,}20^2 - 0{,}052\\,2^2} = 0{,}193\\,1\\ \\mathrm{A}$." },
        { texte: "$X_m = 230/0{,}193\\,1 = 1191\\ \\Omega$ ; et $R_f = 230^2/12 = 4408\\ \\Omega$." },
        {
          texte: "Piège : $V_{10}/I_{10} = 1150\\ \\Omega$ est le module de la branche, pas $X_m$ ; l'écart est de $3{,}5\\ \\%$ ici, davantage quand $\\cos\\varphi_0$ est élevé.",
          note: "Les deux éléments sont en parallèle : on décompose le courant, pas la tension.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 420 240",
          "<defs>" + marqueur("fl-k-vi") + "</defs>" +
            '<g fill="none" stroke="currentColor" stroke-linecap="round">' +
            '<path d="M40 40H380" stroke-width="2" marker-end="url(#fl-k-vi)"/>' +
            '<path d="M40 40L89.3 222.2" stroke-width="3" marker-end="url(#fl-k-vi)"/>' +
            '<path d="M89.6 223.4V40M89.6 223.4H40" stroke-width="1.4" stroke-dasharray="6 4"/>' +
            "</g>" +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
            '<text x="300" y="30">V10 = 230 V</text><text x="48" y="30">If = 0,0522 A</text><text x="100" y="150">I10 = 0,20 A</text>' +
            '<text x="10" y="140">Iμ</text><text x="200" y="200">Iμ = 0,1931 A ; Xm = 1191 Ω</text><text x="200" y="220">échelle : 950 px par A</text></g>',
          "Diagramme de Fresnel de l'essai : la tension en trait plein horizontal, le courant à vide en trait épais en retard de 74,9 degrés, et ses deux projections en tirets, If en phase et Iμ en quadrature arrière."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-cc",
      titre: "Impédance série à partir d'un essai en court-circuit",
      niveau: "fondamental",
      enonce:
        "<p>Le même transformateur de $1\\ \\mathrm{kVA}$ est essayé en court-circuit, côté $115\\ \\mathrm{V}$ fermé, en alimentant le côté " +
        "$230\\ \\mathrm{V}$ au courant assigné : $I_{1cc} = 4{,}35\\ \\mathrm{A}$, $V_{1cc} = 9{,}2\\ \\mathrm{V}$, $P_{1cc} = 26\\ \\mathrm{W}$. " +
        "Quelle est sa réactance série vue du côté $230\\ \\mathrm{V}$, en ohms ?</p>",
      valeur: Math.sqrt(Math.pow(9.2 / 4.35, 2) - Math.pow(26 / (4.35 * 4.35), 2)),
      unite: "Ω",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Réactance série $X_{s1}$",
      etapes: [
        { texte: "$Z_{s1} = 9{,}2/4{,}35 = 2{,}115\\ \\Omega$." },
        { texte: "$R_{s1} = 26/4{,}35^2 = 1{,}374\\ \\Omega$." },
        { texte: "$X_{s1} = \\sqrt{2{,}115^2 - 1{,}374^2} = 1{,}608\\ \\Omega$ ; $u_{cc} = 9{,}2/230 = 4{,}0\\ \\%$ et $u_r = 26/1000 = 2{,}6\\ \\%$." },
        {
          texte: "Sur ce petit appareil, $R_{s1}$ et $X_{s1}$ sont du même ordre : sans wattmètre, prendre $Z_{s1}$ pour $X_{s1}$ ferait une erreur de $32\\ \\%$.",
          note: "Sur un transformateur de distribution, $X$ domine nettement ; sur un transformateur de commande, ce n'est plus vrai.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        barresCorrection(
          moteur,
          conteneur,
          { titre: "Impédance série vue du côté 230 V", xTitre: "grandeur", yTitre: "valeur", unite: "Ω" },
          [
            { etiquette: "Zs1", valeur: 2.115 },
            { etiquette: "Rs1", valeur: 1.374 },
            { etiquette: "Xs1", valeur: 1.608 },
          ]
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-temperature",
      titre: "Pertes en court-circuit ramenées à 75 °C",
      niveau: "intermédiaire",
      enonce:
        "<p>Un essai en court-circuit fait à $22\\ ^\\circ\\mathrm{C}$ donne $1490\\ \\mathrm{W}$ ; les résistances mesurées en continu à la même " +
        "température correspondent à $1340\\ \\mathrm{W}$ de pertes Joule aux mêmes courants. Enroulements en cuivre. Quelles sont les pertes en " +
        "court-circuit à $75\\ ^\\circ\\mathrm{C}$, en watts ?</p>",
      valeur: 1340 * (310 / 257) + 150 / (310 / 257),
      unite: "W",
      tolerance: 0.005,
      chiffres: 1,
      libelleChamp: "Pertes $P_{cc}$ à $75\\ ^\\circ\\mathrm{C}$",
      etapes: [
        { texte: "Facteur de température : $k = (235 + 75)/(235 + 22) = 310/257 = 1{,}206\\,2$." },
        { texte: "Pertes Joule à chaud : $1340 \\times 1{,}206\\,2 = 1616{,}3\\ \\mathrm{W}$." },
        { texte: "Pertes supplémentaires : $150\\ \\mathrm{W}$ à froid, divisées par $k$ : $124{,}4\\ \\mathrm{W}$." },
        {
          texte: "$P_{cc}(75\\ ^\\circ\\mathrm{C}) = 1616{,}3 + 124{,}4 = 1740{,}7\\ \\mathrm{W}$.",
          note: "Multiplier les $1490\\ \\mathrm{W}$ par $k$ donnerait $1797\\ \\mathrm{W}$ : $3\\ \\%$ de trop.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Pertes en court-circuit selon la température",
          xTitre: "θ",
          xUnite: "°C",
          yTitre: "pertes",
          yUnite: "W",
          xMin: 0,
          xMax: 120,
          yMin: 1200,
          yMax: 2100,
          series: [
            { id: "c", nom: "séparation correcte", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => 1340 * ((235 + t) / 257) + 150 / ((235 + t) / 257) },
            { id: "f", nom: "k appliqué à tout", couleur: "serie-5", epaisseur: 2, fonction: (t) => 1490 * ((235 + t) / 257) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 75, "75 °C");
            pointTrace(c, repere, couleurs, 75, 1740.7, "1740,7 W");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-source",
      titre: "Source nécessaire pour un essai en court-circuit",
      niveau: "intermédiaire",
      enonce:
        "<p>On doit faire l'essai en court-circuit d'un transformateur triphasé de $630\\ \\mathrm{kVA}$, $20\\ \\mathrm{kV} / 410\\ \\mathrm{V}$, dont la " +
        "tension de court-circuit annoncée est $6\\ \\%$. On l'alimente côté haute tension au courant assigné. Quelle puissance apparente la " +
        "source doit-elle fournir, en kilovoltampères ?</p>",
      valeur: 37.8,
      unite: "kVA",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Puissance apparente $S_{cc}$",
      etapes: [
        { texte: "Au courant assigné, la tension d'essai vaut $u_{cc}U_n = 0{,}06 \\times 20\\,000 = 1200\\ \\mathrm{V}$ entre phases, et $I_{1n} = 630\\,000/(\\sqrt{3} \\times 20\\,000) = 18{,}19\\ \\mathrm{A}$." },
        { texte: "$S_{cc} = \\sqrt{3} \\times 1200 \\times 18{,}19 = 37{,}8\\ \\mathrm{kVA}$, c'est-à-dire $u_{cc}S_n$." },
        { texte: "La puissance active n'en est qu'une petite part, les pertes dues à la charge, de l'ordre du pour cent de $S_n$ : la source fournit surtout du réactif." },
        {
          texte: "Choisir le côté haute tension évite une liaison et une source capables de $887\\ \\mathrm{A}$ côté basse tension.",
          note: "Pour l'essai à vide côté basse tension, la source fournit $i_0S_n$, quelques kilovoltampères seulement.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        barresCorrection(
          moteur,
          conteneur,
          { titre: "Puissance apparente demandée à la source", xTitre: "situation", yTitre: "puissance", unite: "kVA" },
          [
            { etiquette: "Sn", valeur: 630 },
            { etiquette: "court-circuit", valeur: 37.8 },
            { etiquette: "à vide, i0 = 1 %", valeur: 6.3 },
          ]
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-avance",
      titre: "De l'identification au dimensionnement d'une charge",
      niveau: "avancé",
      enonce:
        "<p>Un transformateur monophasé de $10\\ \\mathrm{kVA}$, $400\\ \\mathrm{V}$ au primaire, a donné : à vide sous $400\\ \\mathrm{V}$, " +
        "$I_{10} = 0{,}75\\ \\mathrm{A}$, $P_{10} = 95\\ \\mathrm{W}$, $V_{20} = 231\\ \\mathrm{V}$ ; en court-circuit au courant assigné de " +
        "$25\\ \\mathrm{A}$, $V_{1cc} = 16{,}0\\ \\mathrm{V}$ et $P_{1cc} = 240\\ \\mathrm{W}$. Il doit alimenter un atelier de facteur de " +
        "puissance $0{,}8$ inductif sans que la tension descende sous $225\\ \\mathrm{V}$. Quelle puissance apparente maximale peut-il " +
        "fournir dans ces conditions, en kilovoltampères ?</p>",
      valeur: (10 * (231 - 225)) / (231 * 0.0384),
      unite: "kVA",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Puissance apparente maximale",
      etapes: [
        { texte: "Court-circuit : $u_{cc} = 16/400 = 4{,}0\\ \\%$, $u_r = 240/10\\,000 = 2{,}4\\ \\%$, $u_x = \\sqrt{4^2 - 2{,}4^2} = 3{,}2\\ \\%$." },
        { texte: "Chute à courant assigné sous $\\cos\\varphi = 0{,}8$ : $2{,}4 \\times 0{,}8 + 3{,}2 \\times 0{,}6 = 3{,}84\\ \\%$, soit $V_2 = 231 \\times (1 - 0{,}038\\,4) = 222{,}1\\ \\mathrm{V}$ : la contrainte n'est pas tenue à pleine charge." },
        { texte: "La chute est proportionnelle au taux de charge : $x\\,231 \\times 0{,}038\\,4 \\le 231 - 225 = 6\\ \\mathrm{V}$, d'où $x \\le 0{,}676$." },
        { texte: "Puissance maximale : $0{,}676 \\times 10 = 6{,}76\\ \\mathrm{kVA}$, soit $5{,}41\\ \\mathrm{kW}$ ; le rendement y vaut $5410/(5410 + 95 + 0{,}676^2 \\times 240) = 96{,}4\\ \\%$." },
        {
          texte: "L'essai à vide ne sert ici qu'à $V_{20}$ et au rendement ; c'est l'essai en court-circuit qui fixe la limite.",
          note: "Une prise relevant $V_{20}$ de $2{,}5\\ \\%$ permettrait la pleine charge, à vérifier sur la marge de saturation.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Tension secondaire en fonction de la charge, cos φ = 0,8 inductif",
          xTitre: "S",
          xUnite: "kVA",
          yTitre: "V2",
          yUnite: "V",
          xMin: 0,
          xMax: 12,
          yMin: 215,
          yMax: 235,
          series: [{ id: "v", nom: "V2 selon Kapp", couleur: "serie-1", epaisseur: 2.6, fonction: (s) => 231 * (1 - (s / 10) * 0.0384) }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 225, "225 V", true);
            ligneV(c, repere, couleurs, 6.764, "6,76 kVA");
            pointTrace(c, repere, couleurs, 10, 222.13, "222,1 V");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Diagnostic : des pertes en court-circuit en hausse",
      niveau: "diagnostic",
      enonce:
        "<p>Lors d'un contrôle après cinq ans de service, l'essai en court-circuit du transformateur du poste donne, ramené à $75\\ ^\\circ\\mathrm{C}$, " +
        "des pertes de $2180\\ \\mathrm{W}$ au lieu de $1741\\ \\mathrm{W}$ ; la chute réactive $u_x$ est inchangée à $0{,}02$ point près, l'essai " +
        "à vide est conforme au procès-verbal, et la résistance en continu d'une phase haute tension est $30\\ \\%$ plus forte que celle des deux " +
        "autres. Quelles conclusions sont justifiées ?</p>" +
        '<svg viewBox="0 0 360 190" role="img" aria-label="Schéma de Kapp par phase du transformateur, branche magnétisante en tête puis résistance et réactance de court-circuit" style="max-width:360px">' +
        DESSIN_DIAG +
        "</svg>",
      options: [
        { texte: "Le défaut est localisé dans la branche série, et plus précisément dans la résistance d'une phase haute tension.", juste: true },
        { texte: "Un mauvais contact au changeur de prise ou à une connexion de cette phase est l'hypothèse la plus probable.", juste: true },
        { texte: "Un défaut des tôles du noyau explique les symptômes." },
        { texte: "Une déformation des enroulements après un court-circuit explique les symptômes." },
        { texte: "Il faut mesurer les résistances sur chaque prise et inspecter les connexions avant de remettre l'appareil en pleine charge.", juste: true },
      ],
      etapes: [
        { texte: "L'essai à vide conforme écarte le noyau : $R_f$ et $X_m$ n'ont pas bougé." },
        { texte: "$u_x$ inchangé écarte une déformation des enroulements, qui modifierait le flux de fuite et donc la réactance." },
        { texte: "Pertes en hausse de $439\\ \\mathrm{W}$ et résistance d'une seule phase en hausse : une résistance de contact s'est ajoutée sur cette phase." },
        {
          texte: "Un contact dégradé chauffe localement et s'aggrave : on vérifie toutes les prises, on resserre ou l'on répare avant de recharger l'appareil.",
          note: "Comparer chaque essai au procès-verbal d'origine, ramené à la même température, est ce qui rend ce diagnostic possible.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        barresCorrection(
          moteur,
          conteneur,
          { titre: "Grandeurs mesurées rapportées au procès-verbal d'origine", xTitre: "grandeur", yTitre: "rapport", unite: "" },
          [
            { etiquette: "Pcc", valeur: 2180 / 1741 },
            { etiquette: "ux", valeur: 1 },
            { etiquette: "P0, I0", valeur: 1 },
            { etiquette: "R phase A", valeur: 1.3 },
            { etiquette: "R phases B, C", valeur: 1 },
          ]
        );
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-conceptuel",
      titre: "Pourquoi tension assignée à vide et courant assigné en court-circuit ?",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi l'essai à vide doit être fait sous la tension assignée, alors que l'essai en court-circuit doit être " +
        "fait au courant assigné et non sous une tension fixée.</p>",
      motsCles: [
        ["flux", "induction", "saturation", "noyau"],
        ["tension", "depend de la tension", "fixe par la tension"],
        ["courant", "carre du courant", "proportionnel au courant"],
        ["lineaire", "constant", "ne depend pas", "point de fonctionnement", "service"],
      ],
      minimum: 3,
      exemple: "Trois ou quatre phrases : dites de quoi dépendent les pertes fer et le courant magnétisant, puis les pertes cuivre et la chute série.",
      etapes: [
        { texte: "Les pertes fer et le courant magnétisant dépendent du flux, donc de la tension et de la fréquence, et de façon non linéaire à cause de la saturation : ils n'ont de sens qu'au flux de service." },
        { texte: "Les éléments série sont à peu près linéaires : la tension d'essai est proportionnelle au courant et la puissance à son carré." },
        { texte: "On impose donc le courant assigné, ou l'on ramène les mesures à ce courant ; la tension qui en résulte, $u_{cc}V_n$, est une caractéristique de l'appareil, pas un réglage." },
        {
          texte: "Sous cette tension réduite, le flux n'est que de quelques pour cent : la branche magnétisante ne perturbe plus la mesure.",
          note: "La simulation de la courbe à vide montrait jusqu'à $22\\ \\%$ d'écart sur $X_m$ pour un essai à $110\\ \\%$ de la tension.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Lectures relatives selon la grandeur imposée",
          xTitre: "grandeur imposée / valeur assignée",
          yTitre: "lecture relative",
          xMin: 0,
          xMax: 1.2,
          yMin: 0,
          yMax: 2.5,
          series: [
            { id: "i0", nom: "courant à vide, saturation", couleur: "serie-1", epaisseur: 2.4, fonction: (u) => 0.75 * u + 0.25 * Math.pow(u, 9) },
            { id: "vcc", nom: "tension de court-circuit, linéaire", couleur: "serie-5", epaisseur: 2.4, fonction: (u) => u },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 1, "valeur assignée");
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const DESSIN_QUIZ_BANC =
  '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="40" cy="120" r="20"/><path d="M30 120c4 -8 7 -8 10 0s6 8 10 0"/>' +
  '<path d="M40 100V50H120M146 50H180M230 50H330V70M40 140V200H330V180"/>' +
  '<circle cx="133" cy="50" r="13"/><rect x="180" y="37" width="50" height="26" rx="3"/><path d="M205 63V200"/>' +
  '<path d="M280 50V107M280 133V200"/><circle cx="280" cy="120" r="13"/>' +
  '<path d="M330 70a9 9 0 0 1 0 18a9 9 0 0 1 0 18a9 9 0 0 1 0 18a9 9 0 0 1 0 18a9 9 0 0 1 0 18a9 9 0 0 1 0 20"/>' +
  '<path d="M352 66V184M362 66V184"/>' +
  '<path d="M384 70a9 9 0 0 0 0 18a9 9 0 0 0 0 18a9 9 0 0 0 0 18a9 9 0 0 0 0 18a9 9 0 0 0 0 18a9 9 0 0 0 0 20"/>' +
  '<circle cx="480" cy="120" r="13"/></g>' +
  '<g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M384 70V50H480V107M384 180V200H480V133"/></g>' +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
  '<text x="128" y="54">A</text><text x="199" y="54">W</text><text x="275" y="124">V</text><text x="475" y="124">A</text>' +
  '<text x="126" y="30">1</text><text x="200" y="30">2</text><text x="296" y="124">3</text><text x="350" y="222">4</text><text x="500" y="124">5</text>' +
  '<text x="20" y="236">essai en court-circuit ; éléments numérotés de 1 à 5</text></g>';

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Quel essai fournit la résistance de pertes fer $R_f$ et la réactance magnétisante $X_m$ ?</p>",
        options: ["L'essai à vide sous tension assignée", "L'essai en court-circuit au courant assigné", "La mesure des résistances en continu", "Aucun : il faut ouvrir l'appareil"],
        bonnes: [0],
        explication: "À vide, seule la branche magnétisante travaille sous la tension de service : $P_{10}$ donne $R_f$, la part réactive du courant donne $X_m$.",
        resume: "Essai qui donne la branche magnétisante",
      },
      {
        type: "vraiFaux",
        enonce: "<p>On peut faire l'essai en court-circuit en appliquant directement la tension assignée, puisque le wattmètre mesure de toute façon les pertes cuivre.</p>",
        reponse: false,
        explication: "Sous la tension assignée, le courant atteindrait $1/u_{cc}$ fois le courant assigné, plus de vingt fois : on part de zéro et l'on monte jusqu'au courant assigné.",
        resume: "Tension de l'essai en court-circuit",
      },
      {
        type: "calcul",
        enonce: "<p>Un transformateur de $400\\ \\mathrm{V}$ au primaire atteint son courant assigné en court-circuit sous $17{,}73\\ \\mathrm{V}$. Quelle est sa tension de court-circuit, en pour cent ?</p>",
        valeur: (100 * 17.73) / 400,
        unite: "%",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$u_{cc} = 17{,}73/400 = 4{,}43\\ \\%$.",
        resume: "Tension de court-circuit",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi la puissance lue par le wattmètre dans l'essai à vide est-elle pratiquement égale aux pertes fer ?</p>",
        motsCles: [["courant a vide", "faible", "petit", "i0"], ["cuivre", "joule", "r1", "enroulement"], ["negligeable", "tres faible", "minime"]],
        minimum: 2,
        explication:
          "Le secondaire étant ouvert, seul le faible courant à vide traverse le primaire : ses pertes Joule $R_1I_0^2$ sont négligeables, de l'ordre de $0{,}1\\ \\%$, et toute la puissance part dans le noyau.",
        resume: "Puissance lue à vide",
      },
      {
        type: "calcul",
        enonce: "<p>En court-circuit, au courant de $6{,}25\\ \\mathrm{A}$, le wattmètre lit $70{,}6\\ \\mathrm{W}$. Quelle est la résistance série vue du côté alimenté, en ohms ?</p>",
        valeur: 70.6 / (6.25 * 6.25),
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$R_{s1} = P_{1cc}/I_{1cc}^2 = 70{,}6/39{,}06 = 1{,}807\\ \\Omega$.",
        resume: "Résistance série",
      },
      {
        type: "schema",
        enonce: "<p>Sur le montage de l'essai en court-circuit, quel élément donne directement les pertes dues à la charge ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 560 250",
        dessin: DESSIN_QUIZ_BANC,
        zones: [
          { x: 112, y: 20, largeur: 42, hauteur: 46, etiquette: "élément 1" },
          { x: 172, y: 20, largeur: 66, hauteur: 50, etiquette: "élément 2", juste: true },
          { x: 260, y: 100, largeur: 50, hauteur: 42, etiquette: "élément 3" },
          { x: 322, y: 60, largeur: 72, hauteur: 168, etiquette: "élément 4" },
          { x: 462, y: 100, largeur: 54, hauteur: 42, etiquette: "élément 5" },
        ],
        explication: "L'élément 2 est le wattmètre : il lit $P_{1cc}$, égale aux pertes dues à la charge. 1 et 5 sont les ampèremètres du primaire et du secondaire, 3 le voltmètre qui donne $V_{1cc}$, 4 le transformateur en essai.",
        resume: "Lecture du montage",
      },
      {
        type: "qcm",
        enonce: "<p>Sur un petit transformateur essayé à vide, quelles corrections peuvent être nécessaires pour obtenir $R_f$ avec précision ?</p>",
        options: [
          { texte: "Retrancher la consommation du voltmètre et du circuit tension du wattmètre branchés en aval", juste: true },
          { texte: "Retrancher les pertes Joule $R_1I_{10}^2$", juste: true },
          { texte: "Remplacer $V_{10}$ par la force électromotrice $E_1$", juste: true },
          { texte: "Multiplier $P_{10}$ par le facteur de température $k$" },
        ],
        multiple: true,
        explication: "Les trois premières corrections affinent l'essai à vide ; le facteur de température concerne les pertes Joule de l'essai en court-circuit, pas les pertes fer.",
        resume: "Corrections de l'essai à vide",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Le facteur de puissance de l'essai à vide d'un transformateur de distribution est faible, de l'ordre de $0{,}1$ à $0{,}2$.</p>",
        reponse: true,
        explication: "Magnétiser coûte surtout du réactif : pour le poste, $\\cos\\varphi_0 = 0{,}127$. Il faut un wattmètre adapté aux faibles facteurs de puissance.",
        resume: "Facteur de puissance à vide",
      },
      {
        type: "calcul",
        enonce: "<p>Une résistance d'enroulement en cuivre vaut $0{,}740\\ \\Omega$ à $20\\ ^\\circ\\mathrm{C}$. Que vaut-elle à $75\\ ^\\circ\\mathrm{C}$, en ohms ?</p>",
        valeur: (0.74 * 310) / 255,
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$R_{75} = 0{,}740 \\times (235 + 75)/(235 + 20) = 0{,}740 \\times 1{,}215\\,7 = 0{,}900\\ \\Omega$.",
        resume: "Correction de température d'une résistance",
      },
      {
        type: "calcul",
        enonce: "<p>Un transformateur triphasé essayé à vide sous $410\\ \\mathrm{V}$ entre phases absorbe $2{,}20\\ \\mathrm{A}$ par ligne et $198\\ \\mathrm{W}$ au total. Quel est son facteur de puissance à vide ?</p>",
        valeur: 198 / (RAC3 * 410 * 2.2),
        unite: "",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$\\cos\\varphi_0 = P/(\\sqrt{3}UI) = 198/(\\sqrt{3} \\times 410 \\times 2{,}20) = 198/1562 = 0{,}127$.",
        resume: "Facteur de puissance à vide en triphasé",
      },
    ],
    { titre: "Dix questions sur les essais à vide et en court-circuit" }
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
      { categorie: "Principe", question: "Pourquoi deux essais suffisent-ils à chiffrer le schéma de Kapp ?", reponse: "Chacun ne fait travailler qu'une famille d'éléments : à vide la branche parallèle, sous tension assignée ; en court-circuit la branche série, au courant assigné." },
      { categorie: "À vide", question: "Que mesure-t-on dans l'essai à vide, et sous quelle tension ?", reponse: "$V_{10}$, $I_{10}$, $P_{10}$ et $V_{20}$, sous la tension et la fréquence assignées de l'enroulement alimenté, l'autre restant ouvert." },
      { categorie: "À vide", question: "Comment obtient-on $R_f$ et $X_m$ ?", reponse: "$R_f = V_{10}^2/P_{10}$ ; $I_\\mu = \\sqrt{I_{10}^2 - (P_{10}/V_{10})^2}$ puis $X_m = V_{10}/I_\\mu$." },
      { categorie: "À vide", question: "Que donne le voltmètre du secondaire ouvert ?", reponse: "Le rapport des tensions $m \\approx V_{20}/V_{10}$, très légèrement inférieur au rapport des spires.", rappel: "Exemple : $0{,}574\\,5$ pour $0{,}575$." },
      { categorie: "Court-circuit", question: "Comment conduit-on l'essai en court-circuit ?", reponse: "Autre enroulement fermé sur une liaison de forte section ; tension montée depuis zéro jusqu'au courant assigné, soit environ $u_{cc}V_n$." },
      { categorie: "Court-circuit", question: "Comment obtient-on $R_s$ et $X_s$ ?", reponse: "$R_{s1} = P_{1cc}/I_{1cc}^2$ ; $Z_{s1} = V_{1cc}/I_{1cc}$ ; $X_{s1} = \\sqrt{Z_{s1}^2 - R_{s1}^2}$, vus du côté alimenté." },
      { categorie: "Court-circuit", question: "Pourquoi peut-on négliger le noyau en court-circuit ?", reponse: "Le flux n'est que d'environ $u_{cc}/2$ de sa valeur de service : courant à vide réduit d'autant, pertes fer réduites au carré, de l'ordre de $0{,}02\\ \\%$ de la puissance lue." },
      { categorie: "Séparation", question: "Comment sépare-t-on $R_1$ et $R_2$, $X_1$ et $X_2$ ?", reponse: "Résistances mesurées en courant continu ; réactances partagées par convention, $X_1 = X_2/m^2 = X_{s1}/2$." },
      {
        categorie: "Température",
        question: "Comment ramène-t-on $P_{cc}$ à la température de référence ?",
        reponse: "$k = (235 + \\theta_{ref})/(235 + \\theta_{mes})$ pour le cuivre ; pertes Joule multipliées par $k$, pertes supplémentaires divisées par $k$.",
        rappel: "Poste : $1490\\ \\mathrm{W}$ à $22\\ ^\\circ\\mathrm{C}$ donnent $1740{,}6\\ \\mathrm{W}$ à $75\\ ^\\circ\\mathrm{C}$.",
      },
      { categorie: "Méthode", question: "Pourquoi préférer la méthode des pertes séparées à la mesure directe du rendement ?", reponse: "Elle demande une source de quelques pour cent de $S_n$ et mesure les pertes directement, au lieu de les obtenir par différence de deux grandeurs voisines, très incertaine." },
    ],
    { titre: "Dix cartes sur les essais à vide et en court-circuit" }
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
          "<p>Cette séance. Un essai en court-circuit donne $Z_{s1} = 2{,}837\\ \\Omega$ et $R_{s1} = 1{,}807\\ \\Omega$. Quelle est la réactance série, en ohms ?</p>",
        valeur: Math.sqrt(2.837 * 2.837 - 1.807 * 1.807),
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$X_{s1} = \\sqrt{2{,}837^2 - 1{,}807^2} = 2{,}187\\ \\Omega$.",
        resume: "Réactance série",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Cette séance. La puissance mesurée dans l'essai en court-circuit comprend les pertes Joule des enroulements et des pertes supplémentaires que la mesure en continu ne fait pas apparaître.</p>",
        reponse: true,
        explication: "Le flux de fuite induit des courants de Foucault dans les conducteurs et les pièces métalliques : pour le poste, $150\\ \\mathrm{W}$ sur $1490\\ \\mathrm{W}$ à $22\\ ^\\circ\\mathrm{C}$.",
        resume: "Pertes supplémentaires",
      },
      {
        type: "qcm",
        enonce: "<p>Cette séance. Pour un transformateur $20\\ \\mathrm{kV} / 410\\ \\mathrm{V}$, quel est le choix habituel des côtés alimentés ?</p>",
        options: [
          "À vide côté basse tension, en court-circuit côté haute tension",
          "À vide côté haute tension, en court-circuit côté basse tension",
          "Les deux essais côté haute tension",
          "Les deux essais côté basse tension",
        ],
        bonnes: [0],
        explication: "À vide, il faut la tension assignée : $410\\ \\mathrm{V}$ est plus facile à produire que $20\\ \\mathrm{kV}$. En court-circuit, il faut le courant assigné : $2{,}9\\ \\mathrm{A}$ côté haute tension plutôt que $141\\ \\mathrm{A}$.",
        resume: "Côtés alimentés",
      },
      {
        type: "calcul",
        enonce:
          "<p>Cours <a href=\"#/cours/transformateur-reel\">Transformateur réel</a>. Avec $u_r = 2{,}4\\ \\%$ et $u_x = 3{,}2\\ \\%$, quelle est la chute relative à courant assigné sous $\\cos\\varphi = 0{,}8$ inductif, en pour cent ?</p>",
        valeur: 2.4 * 0.8 + 3.2 * 0.6,
        unite: "%",
        tolerance: 0.01,
        chiffres: 2,
        explication: "Formule de Kapp : $u_r\\cos\\varphi + u_x\\sin\\varphi = 1{,}92 + 1{,}92 = 3{,}84\\ \\%$.",
        resume: "Chute de Kapp",
      },
      {
        type: "calcul",
        enonce:
          "<p>Cours <a href=\"#/cours/transformateur-reel\">Transformateur réel</a>. Avec $P_0 = 198\\ \\mathrm{W}$ et $P_{cc} = 1740{,}6\\ \\mathrm{W}$, pour quel taux de charge le rendement est-il maximal ?</p>",
        valeur: Math.sqrt(198 / 1740.6),
        unite: "",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$x_{opt} = \\sqrt{P_0/P_{cc}} = \\sqrt{198/1740{,}6} = 0{,}337$ : pertes cuivre égales aux pertes fer.",
        resume: "Charge de rendement maximal",
      },
      {
        type: "calcul",
        enonce:
          "<p>Cours <a href=\"#/cours/harmoniques-et-qualite-de-l-energie\">Harmoniques et qualité de l'énergie</a>. Un courant à vide comporte un fondamental $I_1$, un rang 3 de $30\\ \\%$ et un rang 5 de $10\\ \\%$ du fondamental. Combien de fois sa valeur efficace vraie dépasse-t-elle $I_1$ ?</p>",
        valeur: Math.sqrt(1 + 0.09 + 0.01),
        unite: "",
        tolerance: 0.005,
        chiffres: 3,
        explication: "$I = I_1\\sqrt{1 + 0{,}3^2 + 0{,}1^2} = 1{,}049\\,I_1$ : seul un ampèremètre à valeur efficace vraie lit cette valeur.",
        resume: "Valeur efficace d'un courant déformé",
      },
      {
        type: "vraiFaux",
        enonce:
          "<p>Cours <a href=\"#/cours/tension-courant-charge-et-puissance\">Tension, courant, charge et puissance</a>. Un wattmètre branché en convention récepteur sur un dipôle lit $-35\\ \\mathrm{W}$ : le dipôle fournit $35\\ \\mathrm{W}$ au reste du circuit.</p>",
        reponse: true,
        explication: "En convention récepteur, $P = vi$ moyen est la puissance reçue ; une lecture négative signifie que le dipôle fournit de la puissance. Dans les deux essais, le transformateur est récepteur et le wattmètre lit une valeur positive.",
        resume: "Signe d'une lecture de wattmètre",
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
    titre: "Où en suis-je sur les essais à vide et en court-circuit ?",
  });
  if (auto) ressources.push(auto);
}
