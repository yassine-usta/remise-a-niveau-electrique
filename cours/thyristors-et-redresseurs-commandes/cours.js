/* ==========================================================================
   cours/thyristors-et-redresseurs-commandes/cours.js
   Thyristors et redresseurs commandés : redresseur simple alternance
   commandé manipulable, formes d'onde des ponts commandés en fonction de
   l'angle de retard, demi-cercle des puissances et marge de l'onduleur,
   désexcitation rapide du groupe électrogène, exercices, quiz, cartes,
   révision espacée et auto-évaluation.
   Le module n'utilise que l'objet api et le DOM de la racine du cours.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];
let compteurMarqueurs = 0;

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const TAU = 2 * Math.PI;
const RAC2 = Math.SQRT2;
const RAC3 = Math.sqrt(3);
const F_RESEAU = 50;
const OMEGA = TAU * F_RESEAU;
const DEG = Math.PI / 180;
const V0_PD3 = (3 * RAC2 * 400) / Math.PI;
const GARDE = 15;

/* --------------------------------------------------------------------------
   Modèles physiques des ponts, en courant lissé
   -------------------------------------------------------------------------- */

function modulo(x, m) {
  return ((x % m) + m) % m;
}

/** Empiètement en degrés pour un angle alpha (degrés), ou null en cas de raté de commutation. */
function empietement(alphaDeg, crete, Xs, Id, facteur) {
  if (Xs <= 0 || Id <= 0) return 0;
  const c2 = Math.cos(alphaDeg * DEG) - (facteur * Xs * Id) / crete;
  if (c2 <= -1) return null;
  const mu = Math.acos(c2) / DEG - alphaDeg;
  if (alphaDeg + mu >= 180) return null;
  return Math.min(mu, 59.9);
}

/**
 * Pont triphasé tout thyristors. th et alpha en degrés, U tension composée,
 * Ls en henrys, Id en ampères. Renvoie v_d, i_a, v_T1 et les thyristors passants.
 */
function etatPD3(th, alpha, U, Ls, Id) {
  const Vc = (RAC2 * U) / RAC3;
  const Xs = OMEGA * Ls;
  const mu = empietement(alpha, RAC2 * U, Xs, Id, 2);
  if (mu === null) return null;
  const v = [0, 1, 2].map((k) => Vc * Math.sin((th - 120 * k) * DEG));
  const ca = Math.cos(alpha * DEG);
  const cam = Math.cos((alpha + mu) * DEG);
  const ih = [0, 0, 0];
  const ib = [0, 0, 0];
  let phi = modulo(th - 30 - alpha, 360);
  const k = Math.floor(phi / 120) % 3;
  let d = phi - 120 * k;
  const prec = (k + 2) % 3;
  let vP;
  const haut = [k];
  if (mu > 0 && d < mu) {
    const ik = (Id * (ca - Math.cos((alpha + d) * DEG))) / (ca - cam);
    ih[k] = ik;
    ih[prec] = Id - ik;
    vP = (v[k] + v[prec]) / 2;
    haut.push(prec);
  } else {
    ih[k] = Id;
    vP = v[k];
  }
  phi = modulo(th - 90 - alpha, 360);
  const m = Math.floor(phi / 120) % 3;
  d = phi - 120 * m;
  const kb = (2 + m) % 3;
  const pb = (kb + 2) % 3;
  let vN;
  const bas = [kb];
  if (mu > 0 && d < mu) {
    const ik = (Id * (ca - Math.cos((alpha + d) * DEG))) / (ca - cam);
    ib[kb] = ik;
    ib[pb] = Id - ik;
    vN = (v[kb] + v[pb]) / 2;
    bas.push(pb);
  } else {
    ib[kb] = Id;
    vN = v[kb];
  }
  let borneA;
  if (haut.includes(0)) borneA = vP;
  else if (bas.includes(0)) borneA = vN;
  else borneA = v[0];
  return { vd: vP - vN, i: ih[0] - ib[0], vT1: borneA - vP, vref: v[0], mu, crete: Vc };
}

/** Pont monophasé tout thyristors, source V efficace entre A et B. */
function etatPD2(th, alpha, V, Ls, Id) {
  const Vc = RAC2 * V;
  const Xs = OMEGA * Ls;
  const mu = empietement(alpha, Vc, Xs, Id, 2);
  if (mu === null) return null;
  const v = Vc * Math.sin(th * DEG);
  const ca = Math.cos(alpha * DEG);
  const cam = Math.cos((alpha + mu) * DEG);
  const phi = modulo(th - alpha, 360);
  if (phi < 180) {
    if (mu > 0 && phi < mu) {
      const x = (ca - Math.cos((alpha + phi) * DEG)) / (ca - cam);
      return { vd: 0, i: -Id + 2 * Id * x, vT1: 0, vref: v, mu, crete: Vc };
    }
    return { vd: v, i: Id, vT1: 0, vref: v, mu, crete: Vc };
  }
  const p2 = phi - 180;
  if (mu > 0 && p2 < mu) {
    const x = (ca - Math.cos((alpha + p2) * DEG)) / (ca - cam);
    return { vd: 0, i: Id - 2 * Id * x, vT1: 0, vref: v, mu, crete: Vc };
  }
  return { vd: -v, i: -Id, vT1: v, vref: v, mu, crete: Vc };
}

/** Pont monophasé mixte : thyristors T1, T3 en haut, diodes D4, D2 en bas, sans inductance de source. */
function etatMixte(th, alpha, V, Id) {
  const Vc = RAC2 * V;
  const v = Vc * Math.sin(th * DEG);
  const t = modulo(th, 360);
  if (t >= alpha && t < 180) return { vd: v, i: Id, vT1: 0, vref: v, mu: 0, crete: Vc };
  if (t >= 180 && t < 180 + alpha) return { vd: 0, i: 0, vT1: 0, vref: v, mu: 0, crete: Vc };
  if (t >= 180 + alpha) return { vd: -v, i: -Id, vT1: v, vref: v, mu: 0, crete: Vc };
  return { vd: 0, i: 0, vT1: v, vref: v, mu: 0, crete: Vc };
}

/** Grandeurs de synthèse sur une période, par intégration numérique. */
function synthese(etat, triphase, Vsimple, Id, N = 1440) {
  let sV = 0;
  let sI2 = 0;
  let a1 = 0;
  let b1 = 0;
  let vmin = Infinity;
  let vmax = -Infinity;
  for (let n = 0; n < N; n += 1) {
    const th = (360 * n) / N;
    const e = etat(th);
    if (!e) return null;
    sV += e.vd;
    sI2 += e.i * e.i;
    a1 += e.i * Math.cos(th * DEG);
    b1 += e.i * Math.sin(th * DEG);
    if (e.vd < vmin) vmin = e.vd;
    if (e.vd > vmax) vmax = e.vd;
  }
  const Vmoy = sV / N;
  const Ieff = Math.sqrt(sI2 / N);
  const A = (2 * a1) / N;
  const B = (2 * b1) / N;
  const I1 = Math.hypot(A, B) / RAC2;
  const phases = triphase ? 3 : 1;
  const P = Vmoy * Id;
  const S1 = phases * Vsimple * I1;
  const Q1 = S1 > 0 ? Math.sqrt(Math.max(0, S1 * S1 - P * P)) : 0;
  const cos1 = S1 > 0 ? P / S1 : 0;
  const lambda = Ieff > 0 ? P / (phases * Vsimple * Ieff) : 0;
  return { Vmoy, Ieff, I1, P, Q1, S1, cos1, lambda, ondulation: vmax - vmin };
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
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto-start-reverse">' +
    '<path d="M0 0 10 5 0 10Z" fill="currentColor"/></marker>'
  );
}

function nouveauMarqueur(prefixe) {
  compteurMarqueurs += 1;
  return prefixe + "-" + compteurMarqueurs;
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

function seg(a, b, attributs = "") {
  return '<path d="M' + a[0].toFixed(1) + " " + a[1].toFixed(1) + "L" + b[0].toFixed(1) + " " + b[1].toFixed(1) + '"' + attributs + "/>";
}

function chaine(points) {
  return points.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';

/** Diode verticale, anode en bas (yb), cathode en haut (yh). */
function diodeV(x, yb, yh, s = 9) {
  const m = (yb + yh) / 2;
  const a = m + s * 0.7;
  const b = m - s * 0.7;
  return (
    '<path d="M' + x + " " + yb + "V" + a + "M" + x + " " + b + "V" + yh + '"/>' +
    '<path d="M' + (x - s) + " " + a + "L" + x + " " + b + "L" + (x + s) + " " + a + 'Z"/>' +
    '<path d="M' + (x - s) + " " + b + "H" + (x + s) + '"/>'
  );
}

/** Thyristor vertical : diode et gâchette côté cathode. */
function thyV(x, yb, yh, s = 9) {
  const m = (yb + yh) / 2;
  const b = m - s * 0.7;
  return diodeV(x, yb, yh, s) + '<path d="M' + (x + 2) + " " + (b + 3) + "L" + (x + 11) + " " + (b + 11) + "H" + (x + 16) + '"/>';
}

/** Thyristor horizontal, anode à gauche. Renvoie aussi la position du bout de gâchette. */
function thyH(xa, xk, y, s = 9) {
  const m = (xa + xk) / 2;
  const a = m - s * 0.7;
  const b = m + s * 0.7;
  return {
    dessin:
      '<path d="M' + xa + " " + y + "H" + a + "M" + b + " " + y + "H" + xk + '"/>' +
      '<path d="M' + a + " " + (y - s) + "L" + b + " " + y + "L" + a + " " + (y + s) + 'Z"/>' +
      '<path d="M' + b + " " + (y - s) + "V" + (y + s) + '"/>' +
      '<path d="M' + (b - 3) + " " + (y + 2) + "L" + (b - 11) + " " + (y + 11) + "V" + (y + 17) + '"/>',
    gachette: { x: b - 11, y: y + 17 },
  };
}

function source(cx, cy, r = 15) {
  return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/><path d="M' + (cx - 10) + " " + cy + 'c3.5 -9 7 -9 10 0s7 9 10 0"/>';
}

function filEnjambant(y, x1, x2, croisements) {
  let d = "M" + x1 + " " + y;
  for (const c of croisements.slice().sort((p, q) => p - q)) d += "H" + (c - 6) + " a6 6 0 0 1 12 0";
  d += "H" + x2;
  return '<path d="' + d + '"/>';
}

function bobineVerticale(x, y, n = 4, r = 7) {
  let d = "M" + x + " " + y;
  for (let k = 0; k < n; k += 1) d += " a" + r + " " + r + " 0 0 1 0 " + 2 * r;
  return '<path d="' + d + '"/>';
}

/* Pont triphasé tout thyristors, sans inductance de source, pour le quiz. */
const PONT = { X: [300, 380, 460], Y: [130, 150, 170], YS: [80, 150, 220], P: 50, N: 250, XC: 600 };

function dessinPontThy() {
  const { X, Y, YS, P, N, XC } = PONT;
  let s = TRAITS + ' stroke-width="1.6">';
  s += '<path d="M40 80V220" stroke-dasharray="5 4"/>';
  for (let k = 0; k < 3; k += 1) {
    const croisements = X.filter((x, j) => j < k);
    s += '<path d="M40 ' + YS[k] + 'H62"/>' + source(77, YS[k]) + '<path d="M92 ' + YS[k] + "H140V" + Y[k] + '"/>' + filEnjambant(Y[k], 140, X[k], croisements);
  }
  for (let k = 0; k < 3; k += 1) s += thyV(X[k], Y[k], P) + thyV(X[k], N, Y[k]);
  s += '<path d="M' + X[0] + " " + P + "H" + XC + "V70M" + X[0] + " " + N + "H" + XC + 'V202"/>';
  s += bobineVerticale(XC, 70, 4, 7) + '<path d="M' + XC + ' 126V146"/><rect x="' + (XC - 8) + '" y="146" width="16" height="56" rx="2"/>';
  s += "</g>";
  s += '<g fill="currentColor" stroke="none">';
  for (let k = 0; k < 3; k += 1) s += '<circle cx="' + X[k] + '" cy="' + Y[k] + '" r="3"/>';
  s += '<circle cx="380" cy="50" r="3"/><circle cx="460" cy="50" r="3"/><circle cx="380" cy="250" r="3"/><circle cx="460" cy="250" r="3"/></g>';
  s += ECRITS + texte(28, 74, "n") + texte(52, 64, "v_a") + texte(52, 134, "v_b") + texte(52, 204, "v_c");
  s += texte(146, 124, "a") + texte(146, 146, "b") + texte(146, 190, "c");
  const pos = [[318, 92, "T1"], [398, 104, "T3"], [478, 114, "T5"], [318, 212, "T4"], [398, 222, "T6"], [478, 232, "T2"]];
  for (const [x, y, nom] of pos) s += texte(x, y, nom);
  s += texte(284, 42, "P") + texte(284, 270, "N") + texte(616, 100, "L") + texte(616, 178, "R") + "</g>";
  return s;
}

const ZONES_PONT = [
  { x: 278, y: 66, largeur: 44, hauteur: 48, etiquette: "T1" },
  { x: 358, y: 76, largeur: 44, hauteur: 48, etiquette: "T3" },
  { x: 438, y: 86, largeur: 44, hauteur: 48, etiquette: "T5" },
  { x: 278, y: 168, largeur: 44, hauteur: 46, etiquette: "T4" },
  { x: 358, y: 178, largeur: 44, hauteur: 46, etiquette: "T6" },
  { x: 438, y: 188, largeur: 44, hauteur: 46, etiquette: "T2", juste: true },
];

function ligneV(c, repere, couleurs, x, libelle) {
  const px = repere.versX(x);
  c.save();
  c.setLineDash([2, 4]);
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
    const aGauche = px > repere.boite.x + repere.boite.l * 0.7;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

function ligneH(c, repere, couleurs, y, libelle) {
  const py = repere.versY(y);
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
    c.fillText(libelle, repere.boite.x + repere.boite.l - 4, py - 6);
  }
  c.restore();
}

function traceCorrection(moteurApi, conteneur, options) {
  const traceur = moteurApi.sim.traceur(conteneur, { genre: "Correction visuelle", ratio: 0.42, echantillons: 360, ...options });
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

/** Synchronise une poignée, des curseurs et un lecteur sur une même grandeur. */
function synchroniseur(dessiner, options = {}) {
  const etat = { poignee: null, curseurs: null, lecteur: null, idCurseur: options.idCurseur, verrou: false, valeur: null };
  etat.appliquer = (valeur, source) => {
    if (etat.verrou) return;
    etat.verrou = true;
    etat.valeur = valeur;
    dessiner(valeur);
    if (source !== "poignee" && etat.poignee) etat.poignee.set(valeur, false);
    if (source !== "curseur" && etat.curseurs && etat.idCurseur) etat.curseurs.definir(etat.idCurseur, valeur);
    if (source !== "lecteur" && etat.lecteur) etat.lecteur.suivre(valeur);
    etat.verrou = false;
  };
  etat.redessiner = () => {
    if (etat.valeur != null) dessiner(etat.valeur);
  };
  return etat;
}

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeurs = [];
  compteurMarqueurs = 0;

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireSimpleAlternance(racine, api);
  construireSimulationPont(racine, api);
  construirePuissances(racine, api);
  construireDesexcitation(racine, api);
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
   Renvois vers les schémas placés au fil du texte, tracés statiques
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
    ["#d-thyristor-figure svg", 1.5],
    ["#e-carac-figure svg", 1.5],
    ["#e-pd2-figure svg", 1.8],
    ["#e-mixte-figure svg", 1.8],
    ["#e-quadrants-figure svg", 1.3],
    ["#f-schema-principal svg", 2.2],
    ["#f-courbe-figure svg", 1.4],
    ["#h-figure svg", 1.5],
    ["#i-figure svg", 1.6],
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
      id: "c-moyenne-sinus",
      titre: "Valeur moyenne d'un morceau de sinusoïde",
      niveau: "prérequis",
      enonce: "<p>Quelle est la valeur moyenne de $\\sin\\theta$ sur l'intervalle $[60^\\circ, 240^\\circ]$, de largeur $180^\\circ$ ? Donnez un nombre sans unité.</p>",
      valeur: 1 / Math.PI,
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Valeur moyenne",
      etapes: [
        { texte: "Intégrale : $\\int_{\\pi/3}^{4\\pi/3}\\sin\\theta\\,\\mathrm{d}\\theta = \\cos\\frac{\\pi}{3} - \\cos\\frac{4\\pi}{3} = 0{,}5 + 0{,}5 = 1$." },
        { texte: "Largeur de l'intervalle : $\\pi$. Moyenne : $1/\\pi = 0{,}318$." },
        { texte: "En général, sur $[\\alpha, \\alpha + \\pi]$, la moyenne vaut $\\frac{2}{\\pi}\\cos\\alpha$ : ici $\\frac{2}{\\pi} \\times 0{,}5$.", note: "C'est exactement la loi du pont monophasé tout thyristors, avec $\\alpha = 60^\\circ$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Morceau de sinusoïde et sa moyenne",
          xTitre: "angle",
          xUnite: "°",
          yTitre: "valeur",
          xMin: 0,
          xMax: 360,
          yMin: -1.1,
          yMax: 1.1,
          series: [
            { id: "s", nom: "sin θ, période complète (trait fin)", couleur: "serie-2", epaisseur: 1.3, fonction: (x) => Math.sin(x * DEG) },
            { id: "m", nom: "morceau de 60 à 240° (trait épais)", couleur: "serie-1", epaisseur: 2.8, fonction: (x) => (x >= 60 && x <= 240 ? Math.sin(x * DEG) : NaN) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 1 / Math.PI, "moyenne 0,318");
            ligneV(c, r, couleurs, 60, "");
            ligneV(c, r, couleurs, 240, "");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-pont-diodes",
      titre: "Tension moyenne d'un pont à six diodes",
      niveau: "prérequis",
      enonce: "<p>Un pont à six diodes idéales est alimenté par un réseau de $400\\ \\mathrm{V}$ entre phases et débite un courant lissé. Quelle est sa tension moyenne, en volts ?</p>",
      valeur: V0_PD3,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension moyenne $V_{d0}$",
      etapes: [
        { texte: "$V_{d0} = \\frac{3\\sqrt{2}}{\\pi}U = 1{,}3505 \\times 400$." },
        { texte: "$V_{d0} = 540{,}2\\ \\mathrm{V}$." },
        { texte: "Ce sera la tension du pont à thyristors pour $\\alpha = 0$.", note: "La formule utilise la tension composée ; avec la tension simple, le coefficient est $2{,}34$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["V_d0 = 3 √2 U / π", "= 1,3505 × 400 V", "= 540,2 V, valeur à α = 0"], "Tension moyenne du pont à six diodes.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-reactif",
      titre: "Puissance réactive d'un courant en retard",
      niveau: "prérequis",
      enonce: "<p>Une charge prend une puissance apparente de $50\\ \\mathrm{kVA}$ avec un courant en retard de $60^\\circ$ sur la tension. Quelle puissance réactive absorbe-t-elle, en kilovars ?</p>",
      valeur: 50 * Math.sin(60 * DEG),
      unite: "kvar",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Puissance réactive $Q$",
      etapes: [
        { texte: "$Q = S\\sin\\varphi = 50 \\times \\sin 60^\\circ$." },
        { texte: "$Q = 50 \\times 0{,}866 = 43{,}3\\ \\mathrm{kvar}$, positive en convention récepteur pour un courant en retard." },
        { texte: "La puissance active vaut $P = 50\\cos 60^\\circ = 25\\ \\mathrm{kW}$.", note: "Un pont commandé à $\\alpha = 60^\\circ$ se trouve exactement dans ce cas : son courant est en retard de $\\alpha$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["S = 50 kVA, φ = 60° en retard", "P = S cos φ = 25,0 kW", "Q = S sin φ = 43,3 kvar, absorbés"], "Décomposition de la puissance apparente.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : redresseur simple alternance commandé
   -------------------------------------------------------------------------- */

function construireSimpleAlternance(racine, api) {
  const conteneur = racine.querySelector("#d-simple");
  if (!conteneur) return;
  const V = 230;
  const Vc = RAC2 * V;
  const reglages = { alpha: 60, R: 50 };
  const TX0 = 90;
  const TX1 = 690;
  const CY = 330;
  const AMP = 110;
  const AXE = 470;
  const versX = (th) => TX0 + ((TX1 - TX0) * th) / 720;
  const versY = (v) => CY - (AMP * v) / Vc;
  const idM = nouveauMarqueur("fl-d-si");
  const thy = thyH(200, 250, 60, 9);

  const svg = svgEl("svg", {
    viewBox: "0 0 760 520",
    role: "img",
    "aria-label": "Redresseur simple alternance commandé : circuit avec chemin du courant et formes d'onde de la source, de la résistance et du thyristor sur deux périodes",
  });
  let fond = "<defs>" + marqueur(idM) + "</defs>";
  fond += TRAITS + ' stroke-width="1.6">' + source(100, 110, 16) + '<path d="M100 94V60H200"/>' + thy.dessin;
  fond += '<path d="M250 60H420V80"/><rect x="412" y="80" width="16" height="60" rx="2"/><path d="M420 140V170H100V126"/>';
  fond += '<rect x="160" y="92" width="122" height="24" rx="5"/><path d="M' + thy.gachette.x.toFixed(1) + " " + thy.gachette.y.toFixed(1) + "V92" + '"/>';
  fond += "</g>";
  fond += TRAITS + ' stroke-width="1.5">' + seg([64, 156], [64, 70], ' marker-end="url(#' + idM + ')"') + seg([256, 36], [194, 36], ' marker-end="url(#' + idM + ')"');
  fond += seg([300, 48], [350, 48], ' marker-end="url(#' + idM + ')"') + seg([456, 150], [456, 72], ' marker-end="url(#' + idM + ')"') + "</g>";
  fond += TRAITS + ' stroke-width="1.1">' + seg([TX0, CY], [TX1 + 8, CY]) + seg([TX0, CY + AMP + 8], [TX0, CY - AMP - 8]) + seg([TX0, AXE], [TX1, AXE]) + "</g>";
  let ecr = texte(48, 116, "v") + texte(108, 88, "+") + texte(206, 30, "v_T") + texte(230, 86, "T") + texte(170, 108, "impulsion à α");
  ecr += texte(310, 40, "i") + texte(436, 116, "R") + texte(466, 116, "v_R") + texte(110, 188, "référence des potentiels");
  for (let th = 0; th <= 720; th += 90) {
    fond += TRAITS + ' stroke-width="1">' + seg([versX(th), AXE - 5], [versX(th), AXE + 5]) + "</g>";
    ecr += texte(versX(th) - 12, AXE + 22, th + "°");
  }
  ecr += texte(TX0 - 30, CY - AMP + 4, "V̂") + texte(TX0 - 30, CY + 4, "0") + texte(TX0 - 40, CY + AMP + 4, "-V̂");
  ecr += texte(TX0 + 6, CY - AMP - 14, "v trait fin, v_R trait épais, v_T tirets") + texte(TX0, AXE + 44, "angle θ : poignée ronde sur cet axe");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecr + "</g>";
  const courbes = svgEl("g");
  const actif = svgEl("g");
  const mobile = svgEl("g");
  svg.append(courbes, groupeFond, actif, mobile);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-simple-valeurs", [
    { id: "th", libelle: "Angle θ", unite: "°", decimales: 0 },
    { id: "etat", libelle: "État du thyristor", format: (x) => x },
    { id: "v", libelle: "v", unite: "V", decimales: 0 },
    { id: "vT", libelle: "v_T", unite: "V", decimales: 0 },
    { id: "vR", libelle: "v_R", unite: "V", decimales: 0 },
    { id: "i", libelle: "i", unite: "A", decimales: 2 },
    { id: "moy", libelle: "V_R moyenne", unite: "V", decimales: 1 },
    { id: "imoy", libelle: "I moyen", unite: "A", decimales: 3 },
    { id: "eff", libelle: "V_R efficace", unite: "V", decimales: 1 },
    { id: "p", libelle: "Puissance dans R", unite: "W", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function etat(th) {
    const t = modulo(th, 360);
    const v = Vc * Math.sin(th * DEG);
    if (t >= reglages.alpha && t < 180) return { v, vR: v, vT: 0, passant: true, nom: "passant" };
    if (t >= 180) return { v, vR: 0, vT: v, passant: false, nom: "bloqué en inverse" };
    return { v, vR: 0, vT: v, passant: false, nom: "bloqué en direct, attend la gâchette" };
  }

  function calculer() {
    const pV = [];
    const pR = [];
    const pT = [];
    for (let th = 0; th <= 720; th += 1) {
      const e = etat(th);
      pV.push([versX(th), versY(e.v)]);
      pR.push([versX(th), versY(e.vR)]);
      pT.push([versX(th), versY(e.vT)]);
    }
    let s = TRAITS + ' stroke-width="1.2"><polyline points="' + chaine(pV) + '"/></g>';
    s += TRAITS + ' stroke-width="1.5" stroke-dasharray="6 5"><polyline points="' + chaine(pT) + '"/></g>';
    s += TRAITS + ' stroke-width="3"><polyline points="' + chaine(pR) + '"/></g>';
    s += '<g fill="currentColor" stroke="none">';
    for (const th of [reglages.alpha, 360 + reglages.alpha]) s += '<rect x="' + (versX(th) - 3).toFixed(1) + '" y="' + (AXE - 20) + '" width="6" height="20"/>';
    s += "</g>";
    courbes.innerHTML = s;
  }

  function placer(th) {
    const e = etat(th);
    const x = versX(th);
    actif.innerHTML = e.passant
      ? TRAITS + ' stroke-width="3.6"><path d="M100 94V60H200"/>' + thy.dessin.split("</g>")[0] + '<path d="M250 60H420V80"/><path d="M420 140V170H100V126"/></g>'
      : "";
    mobile.innerHTML =
      TRAITS + ' stroke-width="1" stroke-dasharray="3 4"><path d="M' + x.toFixed(1) + " " + (CY - AMP - 6) + "V" + AXE + '"/></g>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + versY(e.vR).toFixed(1) + '" r="5" fill="currentColor"/>' +
      ECRITS + texte(300, 150, "état : " + e.nom) + "</g>";
    const a = reglages.alpha * DEG;
    const moy = (Vc / TAU) * (1 + Math.cos(a));
    const eff = (Vc / 2) * Math.sqrt(Math.max(0, 1 - a / Math.PI + Math.sin(2 * a) / TAU));
    if (valeurs) {
      valeurs.maj({
        th,
        etat: e.nom,
        v: e.v,
        vT: e.vT,
        vR: e.vR,
        i: e.vR / reglages.R,
        moy,
        imoy: moy / reglages.R,
        eff,
        p: (eff * eff) / reglages.R,
      });
    }
  }

  const trace = api.dessiner(groupeFond, { declencheur: conteneur, duree: 1.5 });
  if (trace) ressources.push(trace);
  const synchro = synchroniseur(placer);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: TX0, y: AXE },
    a: { x: TX1, y: AXE },
    min: 0,
    max: 720,
    pas: 2,
    valeur: 100,
    unite: "°",
    libelle: "Angle d'observation",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);
  const curseurs = api.sim.curseurs(
    "#d-simple-curseurs",
    [
      { id: "alpha", libelle: "Angle de retard α", min: 0, max: 180, pas: 1, valeur: 60, unite: "°" },
      { id: "R", libelle: "Résistance R", min: 10, max: 200, pas: 5, valeur: 50, unite: "Ω" },
    ],
    (lues) => {
      reglages.alpha = lues.alpha;
      reglages.R = lues.R;
      calculer();
      synchro.redessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  synchro.lecteur = api.sim.lecteur("#d-simple-lecteur", {
    de: 0,
    a: 720,
    duree: 14,
    boucle: true,
    auto: false,
    libelle: "Instant observé sur deux périodes",
    rappel: (th) => synchro.appliquer(th, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  calculer();
  synchro.appliquer(100, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : formes d'onde des ponts commandés
   -------------------------------------------------------------------------- */

const MONTAGES = [
  { nom: "pont monophasé tout thyristors, 230 V", court: "PD2" },
  { nom: "pont monophasé mixte, 230 V", court: "mixte" },
  { nom: "pont triphasé tout thyristors, 400 V", court: "PD3" },
];

function construireSimulationPont(racine, api) {
  if (!racine.querySelector("#e-pont-tensions")) return;
  const reglages = { montage: 3, alpha: 60, Ls: 0, Id: 100 };

  function etat(th, alpha) {
    if (reglages.montage === 3) return etatPD3(th, alpha, 400, reglages.Ls, reglages.Id);
    if (reglages.montage === 1) return etatPD2(th, alpha, 230, reglages.Ls, reglages.Id);
    return etatMixte(th, alpha, 230, reglages.Id);
  }
  const instantAmorcage = () => (reglages.montage === 3 ? 30 + reglages.alpha : reglages.alpha);
  let bilan = null;

  const tensions = api.sim.traceur("#e-pont-tensions", {
    titre: "Tensions sur une période",
    xTitre: "angle θ",
    xUnite: "°",
    yTitre: "tension",
    yUnite: "V",
    xMin: 0,
    xMax: 360,
    yMin: -650,
    yMax: 650,
    ratio: 0.46,
    echantillons: 720,
    series: [
      { id: "vd0", nom: "pont à diodes, α = 0 (trait fin)", couleur: "serie-2", epaisseur: 1.2, fonction: (x) => { const e = etat(x, 0); return e ? e.vd : NaN; } },
      { id: "vT1", nom: "v_T1 (trait moyen)", couleur: "serie-5", epaisseur: 1.6, fonction: (x) => { const e = etat(x, reglages.alpha); return e ? e.vT1 : NaN; } },
      { id: "vd", nom: "v_d (trait épais)", couleur: "serie-1", epaisseur: 2.8, fonction: (x) => { const e = etat(x, reglages.alpha); return e ? e.vd : NaN; } },
    ],
    surDessin({ c, repere: r, couleurs }) {
      if (!bilan) return;
      ligneH(c, r, couleurs, bilan.Vmoy, "V_d = " + nombre(api, bilan.Vmoy, 1) + " V");
      ligneV(c, r, couleurs, modulo(instantAmorcage(), 360), "impulsion de T1");
    },
  });
  if (tensions) ressources.push(tensions);

  const courants = api.sim.traceur("#e-pont-courants", {
    titre: "Courant de ligne et tension simple",
    xTitre: "angle θ",
    xUnite: "°",
    yTitre: "courant",
    yUnite: "A",
    xMin: 0,
    xMax: 360,
    yMin: -130,
    yMax: 130,
    ratio: 0.36,
    echantillons: 720,
    series: [
      { id: "v", nom: "tension simple ramenée à l'échelle de I_d (trait fin)", couleur: "serie-2", epaisseur: 1.3, fonction: (x) => { const e = etat(x, reglages.alpha); return e ? (e.vref / e.crete) * reglages.Id : NaN; } },
      { id: "i", nom: "courant de la phase a ou de la source (trait épais)", couleur: "serie-1", epaisseur: 2.8, fonction: (x) => { const e = etat(x, reglages.alpha); return e ? e.i : NaN; } },
    ],
  });
  if (courants) ressources.push(courants);

  const valeurs = api.sim.valeurs("#e-pont-valeurs", [
    { id: "nom", libelle: "Montage", format: (x) => x },
    { id: "alpha", libelle: "Angle α", unite: "°", decimales: 0 },
    { id: "mu", libelle: "Empiètement μ", unite: "°", decimales: 1 },
    { id: "gamma", libelle: "Angle d'extinction γ", unite: "°", decimales: 1 },
    { id: "Vd", libelle: "V_d calculée", unite: "V", decimales: 1 },
    { id: "rapport", libelle: "V_d / V_d0", decimales: 3 },
    { id: "ond", libelle: "Ondulation crête à crête", unite: "V", decimales: 0 },
    { id: "P", libelle: "P côté réseau", unite: "kW", decimales: 2 },
    { id: "Q", libelle: "Q_1 absorbée", unite: "kvar", decimales: 2 },
    { id: "cos", libelle: "cos φ1", decimales: 3 },
    { id: "lambda", libelle: "Facteur de puissance λ", decimales: 3 },
    { id: "mode", libelle: "Mode", format: (x) => x },
  ]);
  if (valeurs) ressources.push(valeurs);

  function majValeurs() {
    const triphase = reglages.montage === 3;
    const Vs = triphase ? 400 / RAC3 : 230;
    bilan = synthese((th) => etat(th, reglages.alpha), triphase, Vs, reglages.Id);
    const base = synthese((th) => etat(th, 0), triphase, Vs, reglages.Id);
    const e0 = etat(0, reglages.alpha);
    if (!valeurs) return;
    if (!bilan || !e0) {
      valeurs.maj({
        nom: MONTAGES[reglages.montage - 1].nom,
        alpha: reglages.alpha,
        mu: NaN,
        gamma: NaN,
        Vd: NaN,
        rapport: NaN,
        ond: NaN,
        P: NaN,
        Q: NaN,
        cos: NaN,
        lambda: NaN,
        mode: "raté de commutation : α + μ atteindrait 180°, réduire α, I_d ou L_s",
      });
      return;
    }
    const mu = e0.mu;
    const gamma = reglages.montage === 2 ? NaN : 180 - reglages.alpha - mu;
    let mode;
    if (reglages.montage === 2) mode = "redresseur seulement, roue libre pour α > 0";
    else if (reglages.alpha < 90) mode = "redresseur : le réseau fournit l'énergie";
    else if (gamma < GARDE) mode = "onduleur, garde inférieure à 15° : risque de raté";
    else mode = "onduleur : le côté continu doit fournir l'énergie";
    valeurs.maj({
      nom: MONTAGES[reglages.montage - 1].nom,
      alpha: reglages.alpha,
      mu,
      gamma,
      Vd: bilan.Vmoy,
      rapport: base && base.Vmoy ? bilan.Vmoy / (triphase ? V0_PD3 : (2 * RAC2 * 230) / Math.PI) : NaN,
      ond: bilan.ondulation,
      P: bilan.P / 1000,
      Q: bilan.Q1 / 1000,
      cos: bilan.cos1,
      lambda: bilan.lambda,
      mode,
    });
  }

  function placerAlpha(alpha) {
    reglages.alpha = alpha;
    majValeurs();
    if (tensions) tensions.rafraichir();
    if (courants) courants.rafraichir();
  }

  const synchro = synchroniseur(placerAlpha, { idCurseur: "alpha" });
  synchro.curseurs = api.sim.curseurs(
    "#e-pont-curseurs",
    [
      { id: "montage", libelle: "Montage : 1 monophasé complet, 2 mixte, 3 triphasé complet", min: 1, max: 3, pas: 1, valeur: 3, format: (x) => MONTAGES[Math.round(x) - 1].court },
      { id: "alpha", libelle: "Angle de retard α", min: 0, max: 180, pas: 1, valeur: 60, unite: "°" },
      { id: "Ls", libelle: "Inductance de source L_s, ignorée pour le pont mixte", min: 0, max: 1, pas: 0.05, valeur: 0, unite: "mH" },
      { id: "Id", libelle: "Courant continu lissé I_d", min: 10, max: 120, pas: 5, valeur: 100, unite: "A" },
    ],
    (lues) => {
      const montage = Math.round(lues.montage);
      if (montage !== reglages.montage) {
        reglages.montage = montage;
        const lim = montage === 3 ? 650 : 380;
        if (tensions) tensions.definirPlage({ yMin: -lim, yMax: lim });
      }
      reglages.Ls = lues.Ls / 1000;
      reglages.Id = lues.Id;
      if (courants) courants.definirPlage({ yMin: -1.3 * lues.Id, yMax: 1.3 * lues.Id });
      synchro.appliquer(lues.alpha, "curseur");
    }
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);
  synchro.lecteur = api.sim.lecteur("#e-pont-lecteur", {
    de: 0,
    a: 180,
    duree: 14,
    boucle: true,
    auto: false,
    libelle: "Balayage de l'angle de retard",
    rappel: (alpha) => synchro.appliquer(Math.round(alpha), "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  synchro.appliquer(60, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : demi-cercle des puissances
   -------------------------------------------------------------------------- */

function construirePuissances(racine, api) {
  const conteneur = racine.querySelector("#e-pq");
  if (!conteneur) return;
  const O = { x: 380, y: 250 };
  const R = 200;
  const reglages = { Id: 80, Ls: 0.3e-3 };
  const Uc = RAC2 * 400;
  const idM = nouveauMarqueur("fl-e-pq");
  const idH = nouveauMarqueur("hach-e-pq");
  const pt = (angle, r = R) => [O.x + r * Math.cos(angle * DEG), O.y - r * Math.sin(angle * DEG)];

  const svg = svgEl("svg", {
    viewBox: "0 0 760 500",
    role: "img",
    "aria-label": "Demi-cercle des puissances active et réactive d'un pont triphasé tout thyristors, angle de commande réglable, phaseur du courant fondamental et zone de garde",
  });
  let fond = "<defs>" + marqueur(idM) + '<pattern id="' + idH + '" patternUnits="userSpaceOnUse" width="8" height="8"><path d="M0 8L8 0" stroke="currentColor" stroke-width="1"/></pattern></defs>';
  const haut = [];
  for (let a = 0; a <= 180; a += 2) haut.push(pt(a));
  const bas = [];
  for (let a = 0; a <= 180; a += 2) bas.push(pt(-a));
  fond += TRAITS + ' stroke-width="1.3" stroke-dasharray="4 5"><polyline points="' + chaine(haut) + '"/></g>';
  fond += '<g fill="none" stroke="currentColor" stroke-width="0.8" stroke-dasharray="2 5" opacity="0.6"><polyline points="' + chaine(bas) + '"/></g>';
  fond += TRAITS + ' stroke-width="1.3">' + seg([O.x - R - 40, O.y], [O.x + R + 50, O.y], ' marker-end="url(#' + idM + ')"') + seg([O.x, O.y + 20], [O.x, O.y - R - 30], ' marker-end="url(#' + idM + ')"') + "</g>";
  let ecr = texte(O.x + R + 26, O.y + 20, "P") + texte(O.x + 8, O.y - R - 26, "Q_1");
  ecr += texte(O.x + 60, O.y + 20, "redresseur, P > 0") + texte(O.x - 220, O.y + 20, "onduleur, P < 0");
  ecr += texte(O.x + R + 4, O.y - 8, "V_a") + texte(O.x - 24, O.y + R + 34, "phaseur I_1 en tirets, sous l'axe");
  ecr += texte(O.x + R - 30, O.y - R + 10, "rayon S_1 = V_d0 I_d");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecr + "</g>";
  const zone = svgEl("g");
  const mobile = svgEl("g");
  svg.append(zone, groupeFond, mobile);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-pq-valeurs", [
    { id: "alpha", libelle: "Angle α", unite: "°", decimales: 0 },
    { id: "mu", libelle: "Empiètement μ", unite: "°", decimales: 1 },
    { id: "phi", libelle: "Déphasage φ1", unite: "°", decimales: 1 },
    { id: "gamma", libelle: "Angle d'extinction γ", unite: "°", decimales: 1 },
    { id: "tg", libelle: "Durée de γ", unite: "ms", decimales: 2 },
    { id: "amax", libelle: "α maximal pour γ ≥ 15°", unite: "°", decimales: 1 },
    { id: "Vd", libelle: "V_d", unite: "V", decimales: 1 },
    { id: "P", libelle: "P", unite: "kW", decimales: 2 },
    { id: "Q", libelle: "Q_1", unite: "kvar", decimales: 2 },
    { id: "S", libelle: "S_1", unite: "kVA", decimales: 2 },
    { id: "lambda", libelle: "λ ≈ 3/π cos φ1", decimales: 3 },
    { id: "mode", libelle: "Mode", format: (x) => x },
  ]);
  if (valeurs) ressources.push(valeurs);

  function alphaMax() {
    const Xs = OMEGA * reglages.Ls;
    const c = Math.cos((180 - GARDE) * DEG) + (2 * Xs * reglages.Id) / Uc;
    return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
  }

  function dessiner(alpha) {
    const Xs = OMEGA * reglages.Ls;
    const S1 = V0_PD3 * reglages.Id;
    const amax = alphaMax();
    const mu = empietement(alpha, Uc, Xs, reglages.Id, 2);
    const secteur = [[O.x, O.y]];
    for (let a = amax; a <= 180.01; a += 1) secteur.push(pt(a));
    zone.innerHTML = '<polygon points="' + chaine(secteur) + '" fill="url(#' + idH + ')" opacity="0.55" stroke="none"/>';
    let s = "";
    if (mu === null) {
      s += ECRITS + texte(O.x - 170, O.y - 40, "raté de commutation : α + μ atteindrait 180°") + "</g>";
      mobile.innerHTML = s;
      if (valeurs) valeurs.maj({ alpha, mu: NaN, phi: NaN, gamma: NaN, tg: NaN, amax, Vd: NaN, P: NaN, Q: NaN, S: S1 / 1000, lambda: NaN, mode: "raté de commutation" });
      return;
    }
    const cos1 = (Math.cos(alpha * DEG) + Math.cos((alpha + mu) * DEG)) / 2;
    const phi = Math.acos(cos1) / DEG;
    const P = S1 * cos1;
    const Q = S1 * Math.sin(phi * DEG);
    const p = pt(phi);
    const q = pt(-phi);
    s += TRAITS + ' stroke-width="3">' + seg([O.x, O.y], p, ' marker-end="url(#' + idM + ')"') + "</g>";
    s += TRAITS + ' stroke-width="2" stroke-dasharray="6 5">' + seg([O.x, O.y], q, ' marker-end="url(#' + idM + ')"') + "</g>";
    s += TRAITS + ' stroke-width="1.1" stroke-dasharray="3 4">' + seg(p, [p[0], O.y]) + seg(p, [O.x, p[1]]) + "</g>";
    s += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="5.5" fill="currentColor"/>';
    s += ECRITS + texte(p[0] + (p[0] > O.x ? 10 : -96), p[1] - 10, "S_1 = P + jQ_1") + texte(q[0] + (q[0] > O.x ? 8 : -40), q[1] + 18, "I_1") + "</g>";
    mobile.innerHTML = s;
    const gamma = 180 - alpha - mu;
    let mode = alpha < 90 ? "redresseur" : "onduleur assisté";
    if (alpha >= 90 && gamma < GARDE) mode = "onduleur hors garde : raté probable";
    if (valeurs) {
      valeurs.maj({
        alpha,
        mu,
        phi,
        gamma,
        tg: (gamma / 360) * 20,
        amax,
        Vd: V0_PD3 * Math.cos(alpha * DEG) - 6 * F_RESEAU * reglages.Ls * reglages.Id,
        P: P / 1000,
        Q: Q / 1000,
        S: S1 / 1000,
        lambda: (3 / Math.PI) * cos1,
        mode,
      });
    }
  }

  const trace = api.dessiner(groupeFond, { declencheur: conteneur, duree: 1.4 });
  if (trace) ressources.push(trace);
  const synchro = synchroniseur(dessiner);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "courbe",
    courbe: (t) => {
      const p = pt(t * 180);
      return { x: p[0], y: p[1] };
    },
    min: 0,
    max: 180,
    pas: 1,
    valeur: 30,
    unite: "°",
    libelle: "Angle de commande α sur le demi-cercle",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(Math.round(mesure.valeur), "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);
  const curseurs = api.sim.curseurs(
    "#e-pq-curseurs",
    [
      { id: "Id", libelle: "Courant continu I_d", min: 10, max: 150, pas: 5, valeur: 80, unite: "A" },
      { id: "Ls", libelle: "Inductance de source L_s", min: 0, max: 2, pas: 0.05, valeur: 0.3, unite: "mH" },
    ],
    (lues) => {
      reglages.Id = lues.Id;
      reglages.Ls = lues.Ls / 1000;
      synchro.redessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  synchro.lecteur = api.sim.lecteur("#e-pq-lecteur", {
    de: 0,
    a: 180,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Balayage de l'angle de commande",
    rappel: (alpha) => synchro.appliquer(Math.round(alpha), "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  synchro.appliquer(30, null);
}

/* --------------------------------------------------------------------------
   I. Simulation : désexcitation rapide
   -------------------------------------------------------------------------- */

const EXC = { V: 110, Re: 18, Le: 3, VT: 2, i0: 0.8 * 1.535, roueLibre: -1.8 };

function courantDesexcitation(t, Vd, cible) {
  const tau = EXC.Le / EXC.Re;
  const final = Vd / EXC.Re;
  const i = final + (EXC.i0 - final) * Math.exp(-t / tau);
  return Math.max(i, cible);
}

function dureeDesexcitation(Vd, cible) {
  const tau = EXC.Le / EXC.Re;
  const final = Vd / EXC.Re;
  const x = (cible - final) / (EXC.i0 - final);
  if (x <= 0 || x >= 1) return x >= 1 ? 0 : Infinity;
  return -tau * Math.log(x);
}

function construireDesexcitation(racine, api) {
  if (!racine.querySelector("#i-desex-trace")) return;
  const Vd0 = (2 * RAC2 * EXC.V) / Math.PI;
  const reglages = { alpha: 150, cible: 0.95 };
  const VdComplet = () => Vd0 * Math.cos(reglages.alpha * DEG) - EXC.VT;
  const traceur = api.sim.traceur("#i-desex-trace", {
    titre: "Courant de l'inducteur de l'excitatrice",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "i_e",
    yUnite: "A",
    xMin: 0,
    xMax: 80,
    yMin: 0,
    yMax: 1.4,
    ratio: 0.42,
    echantillons: 400,
    series: [
      { id: "mixte", nom: "pont mixte, roue libre (trait fin)", couleur: "serie-2", epaisseur: 1.6, fonction: (t) => courantDesexcitation(t / 1000, EXC.roueLibre, reglages.cible) },
      { id: "complet", nom: "pont tout thyristors en onduleur (trait épais)", couleur: "serie-1", epaisseur: 2.8, fonction: (t) => courantDesexcitation(t / 1000, VdComplet(), reglages.cible) },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, reglages.cible, "courant visé");
      const t1 = dureeDesexcitation(VdComplet(), reglages.cible) * 1000;
      const t2 = dureeDesexcitation(EXC.roueLibre, reglages.cible) * 1000;
      if (Number.isFinite(t1) && t1 < 80) ligneV(c, r, couleurs, t1, nombre(api, t1, 1) + " ms");
      if (Number.isFinite(t2) && t2 < 80) ligneV(c, r, couleurs, t2, nombre(api, t2, 1) + " ms");
    },
  });
  if (traceur) ressources.push(traceur);
  const valeurs = api.sim.valeurs("#i-desex-valeurs", [
    { id: "ve", libelle: "v_e pendant la désexcitation", unite: "V", decimales: 1 },
    { id: "t1", libelle: "Durée, pont tout thyristors", unite: "ms", decimales: 1 },
    { id: "t2", libelle: "Durée, pont mixte", unite: "ms", decimales: 1 },
    { id: "gain", libelle: "Rapport des durées", decimales: 1 },
    { id: "w", libelle: "Énergie renvoyée vers la PMG", unite: "J", decimales: 2 },
    { id: "tau", libelle: "Constante de temps τ_e", unite: "ms", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);
  const curseurs = api.sim.curseurs(
    "#i-desex-curseurs",
    [
      { id: "alpha", libelle: "Angle de désexcitation α", min: 90, max: 150, pas: 1, valeur: 150, unite: "°" },
      { id: "cible", libelle: "Courant visé après délestage", min: 0.5, max: 1.2, pas: 0.01, valeur: 0.95, unite: "A" },
    ],
    (lues) => {
      reglages.alpha = lues.alpha;
      reglages.cible = lues.cible;
      if (traceur) traceur.rafraichir();
      const t1 = dureeDesexcitation(VdComplet(), reglages.cible);
      const t2 = dureeDesexcitation(EXC.roueLibre, reglages.cible);
      if (valeurs) {
        valeurs.maj({
          ve: VdComplet(),
          t1: t1 * 1000,
          t2: t2 * 1000,
          gain: t2 / t1,
          w: 0.5 * EXC.Le * (EXC.i0 * EXC.i0 - reglages.cible * reglages.cible),
          tau: (EXC.Le / EXC.Re) * 1000,
        });
      }
    }
  );
  if (curseurs) ressources.push(curseurs);
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* 1. Fondamental */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-pd3-45",
      titre: "Tension moyenne d'un pont triphasé commandé",
      niveau: "fondamental",
      enonce: "<p>Un pont triphasé tout thyristors idéal est alimenté par un réseau de $400\\ \\mathrm{V}$ entre phases et débite un courant lissé. L'angle de retard vaut $45^\\circ$. Quelle est la tension moyenne, en volts ?</p>",
      valeur: V0_PD3 * Math.cos(45 * DEG),
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension moyenne $V_d$",
      etapes: [
        { texte: "En conduction continue, $V_d = \\frac{3\\sqrt{2}}{\\pi}U\\cos\\alpha$." },
        { texte: "$V_{d0} = 540{,}19\\ \\mathrm{V}$ et $\\cos 45^\\circ = 0{,}7071$." },
        { texte: "$V_d = 540{,}19 \\times 0{,}7071 = 382{,}0\\ \\mathrm{V}$.", note: "Contrôle : entre $467{,}8\\ \\mathrm{V}$ à $30^\\circ$ et $270{,}1\\ \\mathrm{V}$ à $60^\\circ$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension redressée à α = 45°",
          xTitre: "angle θ",
          xUnite: "°",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 360,
          yMin: -100,
          yMax: 620,
          series: [{ id: "vd", nom: "v_d (trait épais)", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => etatPD3(x, 45, 400, 0, 1).vd }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, V0_PD3 * Math.cos(45 * DEG), "V_d = 382,0 V");
            ligneV(c, r, couleurs, 75, "impulsion de T1, 30° + α");
          },
        });
      },
    })
  );

  /* 2. Fondamental */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-mixte-60",
      titre: "Pont mixte monophasé",
      niveau: "fondamental",
      enonce: "<p>Un pont mixte monophasé, deux thyristors et deux diodes, est alimenté sous $230\\ \\mathrm{V}$ et débite un courant lissé. Angle de retard : $60^\\circ$. Quelle est la tension moyenne, en volts ?</p>",
      valeur: ((RAC2 * 230) / Math.PI) * (1 + Math.cos(60 * DEG)),
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension moyenne $V_d$",
      etapes: [
        { texte: "La roue libre impose $v_d = 0$ de $180^\\circ$ à $180^\\circ + \\alpha$ : $V_d = \\frac{\\hat V}{\\pi}(1 + \\cos\\alpha)$." },
        { texte: "$\\hat V/\\pi = 325{,}27/\\pi = 103{,}54\\ \\mathrm{V}$ et $1 + \\cos 60^\\circ = 1{,}5$." },
        { texte: "$V_d = 103{,}54 \\times 1{,}5 = 155{,}3\\ \\mathrm{V}$.", note: "Un pont tout thyristors au même angle donnerait $207{,}1 \\times 0{,}5 = 103{,}5\\ \\mathrm{V}$ : la roue libre supprime la partie négative." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Pont mixte et pont tout thyristors à α = 60°",
          xTitre: "angle θ",
          xUnite: "°",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 360,
          yMin: -340,
          yMax: 340,
          series: [
            { id: "pd2", nom: "pont tout thyristors (trait fin)", couleur: "serie-2", epaisseur: 1.4, fonction: (x) => etatPD2(x, 60, 230, 0, 1).vd },
            { id: "mx", nom: "pont mixte (trait épais)", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => etatMixte(x, 60, 230, 1).vd },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 155.3, "mixte : 155,3 V");
          },
        });
      },
    })
  );

  /* 3. Intermédiaire */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-angle",
      titre: "Angle de commande pour une tension imposée",
      niveau: "intermédiaire",
      enonce: "<p>Un pont triphasé tout thyristors sur réseau $400\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$, d'inductance de source $0{,}5\\ \\mathrm{mH}$ par phase, doit fournir $300\\ \\mathrm{V}$ moyens sous $50\\ \\mathrm{A}$ lissés. Chutes des thyristors négligées. Quel angle de retard faut-il, en degrés ?</p>",
      valeur: Math.acos((300 + 6 * 50 * 0.5e-3 * 50) / V0_PD3) / DEG,
      unite: "°",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Angle $\\alpha$",
      etapes: [
        { texte: "Modèle : $V_d = V_{d0}\\cos\\alpha - 6fL_sI_d$." },
        { texte: "Chute de commutation : $6 \\times 50 \\times 0{,}5 \\times 10^{-3} \\times 50 = 7{,}5\\ \\mathrm{V}$." },
        { texte: "$\\cos\\alpha = (300 + 7{,}5)/540{,}19 = 0{,}5692$, d'où $\\alpha = 55{,}30^\\circ$.", note: "Sans tenir compte de la commutation, on trouverait $56{,}26^\\circ$ et une tension de $292{,}5\\ \\mathrm{V}$ seulement." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["chute de commutation : 6 f L_s I_d = 7,5 V", "V_d0 cos α = 300 + 7,5 = 307,5 V", "cos α = 307,5 / 540,19 = 0,5692", "α = 55,30°"], "Angle de commande pour une tension imposée.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );

  /* 4. Intermédiaire */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-reactif",
      titre: "Puissance réactive d'un pont commandé",
      niveau: "intermédiaire",
      enonce: "<p>Le pont triphasé idéal de l'exercice sur la tension moyenne, $400\\ \\mathrm{V}$ et $\\alpha = 45^\\circ$, débite $100\\ \\mathrm{A}$ lissés. Quelle puissance réactive fondamentale prend-il au réseau, en kilovars ?</p>",
      valeur: (V0_PD3 * 100 * Math.sin(45 * DEG)) / 1000,
      unite: "kvar",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Puissance réactive $Q_1$",
      etapes: [
        { texte: "Le fondamental du courant est en retard de $\\varphi_1 = \\alpha$ ; la puissance apparente fondamentale vaut $S_1 = V_{d0}I_d = 54{,}02\\ \\mathrm{kVA}$." },
        { texte: "$Q_1 = S_1\\sin\\alpha = 54{,}02 \\times 0{,}7071 = 38{,}20\\ \\mathrm{kvar}$." },
        { texte: "$P = S_1\\cos\\alpha = 38{,}20\\ \\mathrm{kW}$ : à $45^\\circ$, le pont prend autant de réactif que d'actif ; $\\lambda = 0{,}955 \\times 0{,}707 = 0{,}675$.", note: "Une batterie de condensateurs compenserait le réactif fondamental, mais attention à la résonance avec les harmoniques $6k \\pm 1$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Puissances en fonction de l'angle, 100 A",
          xTitre: "angle α",
          xUnite: "°",
          yTitre: "puissance",
          yUnite: "kW ou kvar",
          xMin: 0,
          xMax: 180,
          yMin: -60,
          yMax: 60,
          series: [
            { id: "p", nom: "P en kW (trait épais)", couleur: "serie-1", epaisseur: 2.6, fonction: (a) => (V0_PD3 * 100 * Math.cos(a * DEG)) / 1000 },
            { id: "q", nom: "Q_1 en kvar (trait fin)", couleur: "serie-3", epaisseur: 1.8, fonction: (a) => (V0_PD3 * 100 * Math.sin(a * DEG)) / 1000 },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneV(c, r, couleurs, 45, "α = 45° : 38,20 kW et 38,20 kvar");
          },
        });
      },
    })
  );

  /* 5. Avancé */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-onduleur",
      titre: "Freinage par renvoi d'énergie au réseau",
      niveau: "avancé",
      enonce:
        "<p>Une machine à courant continu entraînée par sa charge présente une force électromotrice $E = -400\\ \\mathrm{V}$ en convention récepteur, avec $R_a = 0{,}2\\ \\Omega$. Elle est reliée à un pont triphasé tout thyristors sur réseau $400\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$, d'inductance de source $0{,}4\\ \\mathrm{mH}$ par phase ; chutes des thyristors négligées. Quel angle de retard faut-il pour faire circuler $100\\ \\mathrm{A}$, en degrés ? Vérifiez ensuite l'angle d'extinction.</p>",
      valeur: Math.acos((-400 + 0.2 * 100 + 6 * 50 * 0.4e-3 * 100) / V0_PD3) / DEG,
      unite: "°",
      tolerance: 0.005,
      chiffres: 2,
      libelleChamp: "Angle $\\alpha$",
      etapes: [
        { texte: "Côté machine : $V_d = E + R_aI_d = -400 + 20 = -380\\ \\mathrm{V}$." },
        { texte: "Chute de commutation : $6fL_sI_d = 6 \\times 50 \\times 0{,}4 \\times 10^{-3} \\times 100 = 12\\ \\mathrm{V}$, donc $V_{d0}\\cos\\alpha = -380 + 12 = -368\\ \\mathrm{V}$." },
        { texte: "$\\cos\\alpha = -368/540{,}19 = -0{,}6812$, $\\alpha = 132{,}94^\\circ$." },
        { texte: "$X_s = 0{,}1257\\ \\Omega$ ; $\\cos(\\alpha + \\mu) = -0{,}6812 - 2 \\times 0{,}1257 \\times 100/565{,}69 = -0{,}7257$, $\\alpha + \\mu = 136{,}52^\\circ$ ; $\\gamma = 43{,}5^\\circ$, soit $2{,}42\\ \\mathrm{ms}$ : la garde est respectée.", note: "Le réseau reçoit $380 \\times 100 = 38{,}0\\ \\mathrm{kW}$ : la machine fournit $40\\ \\mathrm{kW}$, l'induit en dissipe $2$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension du pont et tension exigée par la machine",
          xTitre: "angle α",
          xUnite: "°",
          yTitre: "tension",
          yUnite: "V",
          xMin: 90,
          xMax: 180,
          yMin: -560,
          yMax: 50,
          series: [{ id: "vd", nom: "V_d0 cos α - 12 V (trait épais)", couleur: "serie-1", epaisseur: 2.6, fonction: (a) => V0_PD3 * Math.cos(a * DEG) - 12 }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, -380, "V_d exigée : -380 V");
            ligneV(c, r, couleurs, 132.94, "α = 132,94°");
            ligneV(c, r, couleurs, 165, "limite de garde");
          },
        });
      },
    })
  );

  /* 6. Diagnostic industriel */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Variateur à courant continu qui manque de tension",
      niveau: "diagnostic",
      enonce:
        "<p>Un variateur à thyristors pour moteur à courant continu n'atteint plus la vitesse demandée ; il sature à $\\alpha = 0$ alors qu'il travaillait vers $30^\\circ$. À l'oscilloscope, avec une sonde différentielle, la tension d'induit montre un motif qui ne se répète plus que toutes les $20\\ \\mathrm{ms}$ : une des six bosses est remplacée par un creux profond. Les trois courants de ligne sont présents, mais l'un d'eux n'a plus d'alternance positive. Quelle est la cause la plus probable ?</p>",
      options: [
        "Un fusible d'une phase est fondu en amont du pont",
        "Le thyristor du haut d'une phase ne s'amorce plus : impulsion de gâchette absente ou composant ouvert",
        "L'inductance de lissage est en court-circuit",
        "L'angle de garde est trop faible et le pont fait des ratés de commutation",
      ],
      bonnes: [1],
      etapes: [
        { texte: "Un motif à $20\\ \\mathrm{ms}$ signale un défaut qui touche un seul interrupteur une fois par période ; une perte de phase donnerait un motif à $100\\ \\mathrm{Hz}$ et un courant nul sur une phase." },
        { texte: "Si $T_1$ ne s'amorce pas, $T_5$ continue de conduire jusqu'à l'amorçage de $T_3$ : la barre P reste sur $v_c$ alors que $v_a$ est la plus haute, d'où le creux, et la phase $a$ n'a plus d'alternance positive." },
        { texte: "La tension moyenne chute d'un tiers à $\\alpha = 30^\\circ$, de $467{,}8$ à $311{,}9\\ \\mathrm{V}$ : la régulation sature à $\\alpha = 0$ pour compenser.", note: "Contrôler l'impulsion entre gâchette et cathode de $T_1$, puis le thyristor lui-même hors tension." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const manque = (x) => {
          const v = [0, 1, 2].map((k) => Math.sin((x - 120 * k) * DEG) * ((RAC2 * 400) / RAC3));
          let k = Math.floor(modulo(x - 60, 360) / 120) % 3;
          if (k === 0) k = 2;
          const kb = (2 + (Math.floor(modulo(x - 120, 360) / 120) % 3)) % 3;
          return v[k] - v[kb];
        };
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension redressée à α = 30°, saine et avec T1 non amorcé",
          xTitre: "angle θ",
          xUnite: "°",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 360,
          yMin: -320,
          yMax: 620,
          series: [
            { id: "sain", nom: "pont sain (trait fin)", couleur: "serie-2", epaisseur: 1.4, fonction: (x) => etatPD3(x, 30, 400, 0, 1).vd },
            { id: "def", nom: "T1 non amorcé (trait épais)", couleur: "serie-1", epaisseur: 2.6, fonction: manque },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 311.9, "moyenne en défaut : 311,9 V");
          },
        });
      },
    })
  );

  /* 7. Conceptuel */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Renvoyer de l'énergie sans inverser le courant",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, comment un pont à thyristors peut renvoyer de l'énergie au réseau alors que son courant ne change jamais de sens, ce qu'il faut côté continu pour que cela se produise, et pourquoi l'angle de retard ne peut pas atteindre $180^\\circ$.</p>",
      motsCles: [["tension", "signe", "negative", "inverse"], ["source", "machine", "fcem", "force electromotrice", "batterie", "generatrice"], ["commutation", "extinction", "garde", "tq", "rate"], ["puissance", "energie", "produit"]],
      minimum: 3,
      exemple: "Trois idées : le signe de la puissance, la source côté continu, la marge de commutation.",
      etapes: [
        { texte: "La puissance est $V_dI_d$ : le courant reste positif, mais au-delà de $90^\\circ$ la tension moyenne devient négative, donc la puissance reçue côté continu est négative." },
        { texte: "Il faut côté continu une source qui fournit cette énergie avec la bonne polarité : machine entraînée par sa charge, batterie, ligne continue. Sur une charge passive, le courant s'éteindrait." },
        { texte: "Chaque thyristor est éteint par le réseau : il faut que la commutation s'achève et que le thyristor sortant reste en tension inverse plus longtemps que $t_q$ avant que la tension ne se retourne. D'où $\\alpha + \\mu + \\gamma_{min} \\le 180^\\circ$.", note: "Sinon, raté de commutation : la source continue et le réseau s'additionnent, le courant s'emballe." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["P = V_d I_d : I_d > 0 toujours, V_d < 0 au-delà de 90°", "source côté continu : E < 0 en convention récepteur", "commutation par le réseau : γ = 180° - α - μ > garde", "d'où α_max ≈ 150°"], "Onduleur assisté : signes, source et marge.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

function dessinPontQuiz(idM) {
  return "<defs>" + marqueur(idM) + "</defs>" + dessinPontThy() + ECRITS + texte(20, 296, "α = 30° : T1 amorcé à θ = 60°") + "</g>";
}

const VISUELS_QUIZ = [
  etapes(["amorçage : impulsion de gâchette en tension directe", "blocage : courant sous I_H, puis tension inverse", "pendant au moins t_q"], "Comment un thyristor se bloque."),
  etapes(["la gâchette ne commande que l'amorçage", "une fois verrouillé, le thyristor ignore la gâchette", "GTO, MOSFET et IGBT sont blocables"], "La gâchette ne bloque pas."),
  etapes(["V_d = 0,9003 × 230 × cos 30°", "= 207,07 × 0,8660", "= 179,3 V"], "Pont monophasé tout thyristors."),
  etapes(["dès que v s'inverse, les diodes du bas", "referment le courant par la même jambe", "v_d = 0 au lieu de devenir négative"], "Roue libre du pont mixte."),
  etapes(["V_d = 540,19 × cos 120°", "= 540,19 × (-0,5)", "= -270,1 V : onduleur"], "Tension à 120 degrés."),
  () => ({ viewBox: "0 0 680 310", dessin: dessinPontQuiz(nouveauMarqueur("fl-l-pq-c")) + ECRITS + texte(330, 296, "T2, bas de la phase c, à θ = 120°") + "</g>", legende: "Ordre d'amorçage : T1, T2, T3, T4, T5, T6, un tous les 60 degrés." }),
  etapes(["courant de ligne : créneau de 120° décalé de α", "fondamental en retard de α sur la tension simple", "cos φ1 = cos α, sans empiètement"], "Facteur de déplacement."),
  etapes(["V_d < 0 et I_d > 0 : P côté continu < 0", "l'énergie doit venir du côté continu", "sur une résistance seule, le courant s'éteint"], "Condition de l'onduleur."),
  etapes(["Q_1 = V_d0 I_d sin α", "= 540,19 × 100 × 0,8660", "= 46,78 kvar"], "Puissance réactive à 60 degrés."),
  etapes(["γ = 180° - α - μ", "doit dépasser t_q et couvrir μ et les creux", "α_max ≈ 150°"], "Pourquoi borner l'angle."),
];

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Comment un thyristor passant se bloque-t-il ?</p>",
        options: [
          "Par une impulsion négative sur la gâchette",
          "Quand son courant descend sous le courant de maintien et qu'une tension inverse dure au moins t_q",
          "Dès que la tension anode-cathode passe par zéro, quel que soit le courant",
          "Quand l'impulsion de gâchette se termine",
        ],
        bonnes: [1],
        explication: "Le verrouillage ne cède que si le courant passe sous $I_H$ ; il faut ensuite une tension inverse pendant $t_q$ pour que les charges disparaissent.",
        resume: "Blocage du thyristor",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Un thyristor classique peut être bloqué par sa gâchette.</p>",
        reponse: false,
        explication: "La gâchette ne commande que l'amorçage. Seuls les composants blocables, GTO, MOSFET et IGBT, s'éteignent par la commande.",
        resume: "Rôle de la gâchette",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Pont monophasé tout thyristors sous $230\\ \\mathrm{V}$, courant lissé, $\\alpha = 30^\\circ$. Tension moyenne, en volts ?</p>",
        valeur: ((2 * RAC2 * 230) / Math.PI) * Math.cos(30 * DEG),
        unite: "V",
        tolerance: 0.01,
        explication: "$V_d = 0{,}9003 \\times 230 \\times \\cos 30^\\circ = 179{,}3\\ \\mathrm{V}$.",
        resume: "Pont monophasé commandé",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi un pont mixte ne peut-il pas fonctionner en onduleur ?</p>",
        motsCles: [["roue libre", "diode", "diodes"], ["negative", "inverse", "zero", "nulle", "positive"], ["jambe", "court", "referme", "boucle"]],
        minimum: 2,
        explication: "Dès que la tension de la source s'inverse, une diode du bas met la charge en roue libre par la jambe du thyristor passant : $v_d$ vaut zéro au lieu de devenir négative, donc $V_d \\ge 0$.",
        resume: "Pont mixte et onduleur",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Pont triphasé tout thyristors idéal sur $400\\ \\mathrm{V}$, courant lissé, $\\alpha = 120^\\circ$. Tension moyenne, en volts ?</p>",
        valeur: V0_PD3 * Math.cos(120 * DEG),
        unite: "V",
        tolerance: 0.01,
        explication: "$V_d = 540{,}19 \\times \\cos 120^\\circ = -270{,}1\\ \\mathrm{V}$ : tension négative, courant positif, le pont fonctionne en onduleur.",
        resume: "Tension en onduleur",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Pont triphasé tout thyristors, $\\alpha = 30^\\circ$ : $T_1$ vient d'être amorcé à $\\theta = 60^\\circ$. Quel thyristor reçoit l'impulsion suivante, $60^\\circ$ plus tard ?</p>",
        consigne: "Cliquez sur le thyristor correspondant.",
        viewBox: "0 0 680 310",
        dessin: dessinPontQuiz("fl-l-pq"),
        zones: ZONES_PONT,
        explication: "Les thyristors s'amorcent dans l'ordre de leur numéro, un tous les $60^\\circ$ : après $T_1$ vient $T_2$, thyristor du bas de la phase $c$, à $\\theta = 90^\\circ + \\alpha = 120^\\circ$.",
        resume: "Ordre d'amorçage",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Pour un pont triphasé tout thyristors en courant lissé, sans empiètement, que vaut le facteur de déplacement $\\cos\\varphi_1$ ?</p>",
        options: ["$1$, quel que soit $\\alpha$", "$\\cos\\alpha$", "$\\cos(\\alpha/2)$", "$\\frac{3}{\\pi}\\cos\\alpha$"],
        bonnes: [1],
        explication: "Le créneau de courant est décalé de $\\alpha$ : $\\varphi_1 = \\alpha$. Le facteur de puissance, lui, vaut $\\frac{3}{\\pi}\\cos\\alpha$ ; $\\cos(\\alpha/2)$ correspond au pont mixte.",
        resume: "Facteur de déplacement",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Pour fonctionner en onduleur, un pont à thyristors a besoin côté continu d'une source capable de fournir de l'énergie.</p>",
        reponse: true,
        explication: "$V_d &lt; 0$ et $I_d &gt; 0$ : la puissance vient du côté continu. Sur une charge passive, le courant s'annulerait et le pont cesserait de conduire.",
        resume: "Condition de l'onduleur",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Pont triphasé tout thyristors idéal, $400\\ \\mathrm{V}$, $\\alpha = 60^\\circ$, $I_d = 100\\ \\mathrm{A}$. Puissance réactive fondamentale absorbée, en kilovars ?</p>",
        valeur: (V0_PD3 * 100 * Math.sin(60 * DEG)) / 1000,
        unite: "kvar",
        tolerance: 0.01,
        explication: "$Q_1 = V_{d0}I_d\\sin\\alpha = 540{,}19 \\times 100 \\times 0{,}866 = 46{,}78\\ \\mathrm{kvar}$, pour seulement $27{,}0\\ \\mathrm{kW}$ actifs.",
        resume: "Puissance réactive",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Pourquoi limite-t-on l'angle de retard vers $150^\\circ$ en onduleur ?</p>",
        options: [
          "Pour limiter les pertes par conduction des thyristors",
          "Pour garder un angle d'extinction qui couvre l'empiètement, t_q et les creux de tension, et éviter le raté de commutation",
          "Parce que la tension moyenne serait positive au-delà",
          "Pour réduire les harmoniques de rang 5 et 7",
        ],
        bonnes: [1],
        explication: "$\\gamma = 180^\\circ - \\alpha - \\mu$ doit rester supérieur à la garde ; au-delà, le thyristor sortant n'a pas le temps de se bloquer avant le retournement de la tension.",
        resume: "Angle maximal",
      },
    ],
    { titre: "Dix questions de fin de séance" }
  );
  if (quiz) ressources.push(quiz);
  brancherVisuelsQuiz(racine, api, "#l-quiz-bloc", VISUELS_QUIZ);
}

/* --------------------------------------------------------------------------
   M. Cartes de mémorisation
   -------------------------------------------------------------------------- */

function construireCartesMemo(racine, api) {
  const cartes = api.cartes(
    "#m-cartes",
    [
      { categorie: "Composant", question: "Quels sont les trois états d'un thyristor ?", reponse: "Blocage inverse, comme une diode ; blocage direct, en attente de la gâchette ; état passant, verrouillé tant que le courant dépasse $I_H$." },
      { categorie: "Composant", question: "Que faut-il pour amorcer, puis pour bloquer un thyristor ?", reponse: "Amorcer : tension directe et impulsion de gâchette jusqu'à ce que le courant atteigne $I_L$. Bloquer : courant sous $I_H$, puis tension inverse pendant au moins $t_q$." },
      { categorie: "Convention", question: "D'où se compte l'angle de retard $\\alpha$ ?", reponse: "Depuis l'instant de commutation naturelle, où une diode au même endroit commencerait à conduire : $\\theta = 0$ en monophasé, $30^\\circ$ pour $T_1$ en triphasé." },
      { categorie: "Formule", question: "Tension moyenne d'un pont tout thyristors en conduction continue ?", reponse: "$V_d = V_{d0}\\cos\\alpha$ : $0{,}90\\,V\\cos\\alpha$ en monophasé, $1{,}35\\,U\\cos\\alpha$ en triphasé." },
      { categorie: "Formule", question: "Tension moyenne d'un pont mixte monophasé ?", reponse: "$V_d = 0{,}45\\,V(1 + \\cos\\alpha)$, jamais négative grâce à la roue libre ; même loi pour un pont tout thyristors sur charge résistive." },
      { categorie: "Réseau", question: "Puissances prises au réseau par un pont triphasé commandé ?", reponse: "$P = V_{d0}I_d\\cos\\alpha$, $Q_1 = V_{d0}I_d\\sin\\alpha$ : le point $(P, Q_1)$ décrit un demi-cercle de rayon $V_{d0}I_d$ ; $\\lambda = \\frac{3}{\\pi}\\cos\\alpha$." },
      { categorie: "Onduleur", question: "Que se passe-t-il pour $\\alpha &gt; 90^\\circ$ ?", reponse: "$V_d &lt; 0$ avec $I_d &gt; 0$ : si une source côté continu fournit l'énergie, le pont la renvoie au réseau. Le pont absorbe toujours du réactif." },
      { categorie: "Onduleur", question: "Qu'est-ce que le raté de commutation ?", reponse: "Le thyristor sortant n'a pas le temps de se bloquer avant le retournement de la tension : source continue et réseau s'additionnent, le courant s'emballe. On garde $\\gamma = 180^\\circ - \\alpha - \\mu$ au-dessus de la garde.", rappel: "$\\alpha_{max} \\approx 150^\\circ$." },
      { categorie: "Commutation", question: "Empiètement d'un pont commandé ?", reponse: "$\\cos(\\alpha + \\mu) = \\cos\\alpha - 2X_sI_d/\\hat U$ ; chute $\\frac{3X_s}{\\pi}I_d$ indépendante de $\\alpha$ ; $\\mu$ minimal vers $90^\\circ$, plus long vers $0$ et vers $180^\\circ$." },
      { categorie: "Diagnostic", question: "Que signale un motif de tension redressée à 50 Hz avec une bosse manquante ?", reponse: "Un thyristor qui ne s'amorce plus : impulsion de gâchette absente ou composant ouvert. Une perte de phase donnerait un motif à $100\\ \\mathrm{Hz}$." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["V_d = 540,19 × cos 75°", "= 540,19 × 0,2588", "= 139,8 V"], "Tension à 75 degrés."),
  etapes(["onduleur : V_d change de signe", "I_d garde son sens : les thyristors", "ne conduisent que de l'anode à la cathode"], "La tension s'inverse, pas le courant."),
  etapes(["à V_d = V_d0 / 2 : complet à 60°, mixte à 90°", "Q_1 complet = 0,87 S_1", "Q_1 mixte = 0,50 S_1"], "Le pont mixte prend moins de réactif."),
  etapes(["ΔV = 6 f L_s I_d", "= 6 × 50 × 0,3 mH × 80 A", "= 7,2 V"], "Chute de commutation."),
  etapes(["I_eff = √(2/3) × I_d", "= 0,8165 × 60", "= 48,99 A"], "Courant efficace de ligne."),
  etapes(["couple proportionnel au carré de la tension", "(0,5)² = 0,25", "25 % du couple en démarrage direct"], "Démarreur progressif à 50 % de tension."),
  etapes(["I = 62,4 A en retard de 33,66°", "partie active : 62,4 cos 33,66° = 51,94 A", "partie réactive : 62,4 sin 33,66° = 34,59 A"], "Décomposition d'un phaseur de courant."),
];

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Pont triphasé tout thyristors idéal sur $400\\ \\mathrm{V}$, courant lissé, $\\alpha = 75^\\circ$. Tension moyenne, en volts ?</p>",
        valeur: V0_PD3 * Math.cos(75 * DEG),
        unite: "V",
        tolerance: 0.01,
        explication: "$V_d = 540{,}19\\cos 75^\\circ = 139{,}8\\ \\mathrm{V}$.",
        resume: "Tension à 75 degrés",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. En fonctionnement onduleur, le courant continu d'un pont à thyristors change de sens.</p>",
        reponse: false,
        explication: "C'est la tension moyenne qui change de signe ; le courant ne peut circuler que dans le sens passant des thyristors.",
        resume: "Signe du courant en onduleur",
      },
      {
        type: "qcm",
        enonce: repere(2) + "<p>Cette séance. Pour une même tension moyenne égale à la moitié de $V_{d0}$, quel pont prend le moins de puissance réactive ?</p>",
        options: ["Le pont tout thyristors", "Le pont mixte", "Les deux prennent la même", "Aucun : la puissance réactive est nulle à courant lissé"],
        bonnes: [1],
        explication: "Pont tout thyristors à $60^\\circ$ : $Q_1 = 0{,}87\\,S_1$. Pont mixte à $90^\\circ$, déphasage $\\alpha/2 = 45^\\circ$ : $Q_1 = 0{,}50\\,S_1$.",
        resume: "Pont mixte et réactif",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Redresseurs triphasés. Un pont à six diodes débite $80\\ \\mathrm{A}$ lissés à $50\\ \\mathrm{Hz}$ avec $L_s = 0{,}3\\ \\mathrm{mH}$ par phase. Chute de commutation, en volts ?</p>",
        valeur: 6 * 50 * 0.3e-3 * 80,
        unite: "V",
        tolerance: 0.01,
        explication: "$\\Delta V = 6fL_sI_d = 7{,}2\\ \\mathrm{V}$, la même valeur que dans l'exemple du treuil, quel que soit $\\alpha$.",
        resume: "Chute de commutation",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Cours Redresseurs triphasés. Courant efficace de ligne d'un pont triphasé qui débite $60\\ \\mathrm{A}$ lissés, en ampères ?</p>",
        valeur: Math.sqrt(2 / 3) * 60,
        unite: "A",
        tolerance: 0.01,
        explication: "Créneau de $120^\\circ$ : $I_{eff} = \\sqrt{2/3}\\,I_d = 48{,}99\\ \\mathrm{A}$, que le pont soit à diodes ou à thyristors.",
        resume: "Courant efficace de ligne",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Démarrage des moteurs asynchrones. Un démarreur progressif, deux thyristors tête-bêche par phase, applique $50\\ \\%$ de la tension au décollage. Couple de démarrage, en pourcentage du couple en démarrage direct ?</p>",
        valeur: 25,
        unite: "%",
        tolerance: 0.01,
        explication: "Le couple d'un moteur asynchrone à glissement donné varie comme le carré de la tension : $0{,}5^2 = 25\\ \\%$.",
        resume: "Démarreur progressif",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Nombres complexes et phaseurs. Le fondamental du courant de ligne vaut $62{,}4\\ \\mathrm{A}$ en retard de $33{,}66^\\circ$ sur la tension simple prise pour origine. Module de sa partie imaginaire, la composante réactive, en ampères ?</p>",
        valeur: 62.4 * Math.sin(33.66 * DEG),
        unite: "A",
        tolerance: 0.01,
        explication: "$\\underline{I} = 62{,}4\\,e^{-j33{,}66^\\circ} = 51{,}94 - j34{,}59\\ \\mathrm{A}$ : la composante réactive vaut $34{,}59\\ \\mathrm{A}$.",
        resume: "Composante réactive d'un phaseur",
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
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur les thyristors et les redresseurs commandés ?",
  });
  if (auto) ressources.push(auto);
}
