/* ==========================================================================
   cours/redresseurs-triphases/cours.js
   Redresseurs triphasés : pont à six diodes vu comme deux sélecteurs,
   étoile tournante des tensions composées, indice de pulsation,
   commutation à travers les inductances de la source, simulation du pont
   complet, exercices, quiz, cartes, révision espacée et auto-évaluation.
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
const NOMS_PHASES = ["a", "b", "c"];
const DIODE_HAUT = ["D1", "D3", "D5"];
const DIODE_BAS = ["D4", "D6", "D2"];

/* --------------------------------------------------------------------------
   Modèle physique du pont
   -------------------------------------------------------------------------- */

/** Angle d'empiètement en radians, borné au domaine du modèle (mu < 60 degrés). */
function angleEmpietement(U, Ls, Id) {
  const x = (2 * OMEGA * Ls * Id) / (RAC2 * U);
  if (x <= 0) return 0;
  return Math.acos(Math.max(0.5, 1 - x));
}

/**
 * État du pont à l'angle theta (radians), courant lissé Id, inductance Ls par
 * phase, tension composée efficace U. pd3 : pont complet, sinon montage P3.
 * Renvoie les tensions simples, les potentiels des barres, les courants de
 * ligne et les diodes passantes.
 */
function etatPont(theta, U, Ls, Id, pd3 = true) {
  const Vc = (RAC2 * U) / RAC3;
  const v = [0, 1, 2].map((k) => Vc * Math.sin(theta - (TAU * k) / 3));
  const mu = angleEmpietement(U, Ls, Id);
  const i = [0, 0, 0];
  const ih = [0, 0, 0];
  const tiers = TAU / 3;

  let phi = (((theta - Math.PI / 6) % TAU) + TAU) % TAU;
  const k = Math.floor(phi / tiers) % 3;
  let d = phi - k * tiers;
  const prec = (k + 2) % 3;
  let vP;
  const haut = [k];
  if (d < mu && mu > 0) {
    const ik = (Id * (1 - Math.cos(d))) / (1 - Math.cos(mu));
    ih[k] = ik;
    ih[prec] = Id - ik;
    vP = (v[k] + v[prec]) / 2;
    haut.push(prec);
  } else {
    ih[k] = Id;
    vP = v[k];
  }
  for (let j = 0; j < 3; j += 1) i[j] = ih[j];

  let vN = 0;
  const bas = [];
  if (pd3) {
    phi = (((theta - Math.PI / 2) % TAU) + TAU) % TAU;
    const m = Math.floor(phi / tiers) % 3;
    d = phi - m * tiers;
    const kb = (2 + m) % 3;
    const pb = (kb + 2) % 3;
    bas.push(kb);
    if (d < mu && mu > 0) {
      const ik = (Id * (1 - Math.cos(d))) / (1 - Math.cos(mu));
      i[kb] -= ik;
      i[pb] -= Id - ik;
      vN = (v[kb] + v[pb]) / 2;
      bas.push(pb);
    } else {
      i[kb] -= Id;
      vN = v[kb];
    }
  }
  return { v, vP, vN, vs: vP - vN, i, ih, haut, bas, mu };
}

/** Grandeurs de synthèse sur une période, par intégration numérique. */
function synthesePont(U, Ls, Id, pd3, N = 1440) {
  const V = U / RAC3;
  const points = [];
  let sV = 0;
  let sI2 = 0;
  let sI = 0;
  let a1 = 0;
  let b1 = 0;
  let sD = 0;
  let sD2 = 0;
  let vmin = Infinity;
  let vmax = -Infinity;
  let mu = 0;
  for (let n = 0; n <= N; n += 1) {
    const th = (TAU * n) / N;
    const e = etatPont(th, U, Ls, Id, pd3);
    mu = e.mu;
    const diode = e.ih[0];
    points.push({ t: (n / N) * 20, th: th / DEG, vs: e.vs, ia: e.i[0], iD1: diode });
    if (n === N) break;
    sV += e.vs;
    sI2 += e.i[0] * e.i[0];
    sI += e.i[0];
    a1 += e.i[0] * Math.cos(th);
    b1 += e.i[0] * Math.sin(th);
    sD += diode;
    sD2 += diode * diode;
    if (e.vs < vmin) vmin = e.vs;
    if (e.vs > vmax) vmax = e.vs;
  }
  const Vmoy = sV / N;
  const Ieff = Math.sqrt(sI2 / N);
  const I0 = sI / N;
  const I1 = Math.hypot((2 * a1) / N, (2 * b1) / N) / RAC2;
  const P = Vmoy * Id;
  const cos1 = I1 > 0 ? Math.min(1, P / (3 * V * I1)) : 0;
  const lambda = Ieff > 0 ? P / (3 * V * Ieff) : 0;
  const thd = I1 > 0 ? Math.sqrt(Math.max(0, Ieff * Ieff - I1 * I1 - I0 * I0)) / I1 : 0;
  return { points, Vmoy, vmin, vmax, Ieff, I0, I1, cos1, lambda, thd, IDmoy: sD / N, IDeff: Math.sqrt(sD2 / N), mu };
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

function marqueur(id, ouvert) {
  return (
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto-start-reverse">' +
    (ouvert ? '<path d="M0 0 10 5 0 10" fill="none" stroke="currentColor" stroke-width="1.6"/>' : '<path d="M0 0 10 5 0 10Z" fill="currentColor"/>') +
    "</marker>"
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
function diodeHaut(x, yb, yh, s = 9) {
  const m = (yb + yh) / 2;
  const a = m + s * 0.7;
  const b = m - s * 0.7;
  return (
    '<path d="M' + x + " " + yb + "V" + a + "M" + x + " " + b + "V" + yh + '"/>' +
    '<path d="M' + (x - s) + " " + a + "L" + x + " " + b + "L" + (x + s) + " " + a + 'Z"/>' +
    '<path d="M' + (x - s) + " " + b + "H" + (x + s) + '"/>'
  );
}

function source(cx, cy, r = 15) {
  return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/><path d="M' + (cx - 10) + " " + cy + 'c3.5 -9 7 -9 10 0s7 9 10 0"/>';
}

/** Fil horizontal qui enjambe d'autres fils par des demi-cercles. */
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

/* Géométrie commune du pont : jambes, barres, nœuds et sources. */
const PONT = {
  X: [300, 380, 460],
  Y: [130, 150, 170],
  YS: [80, 150, 220],
  P: 50,
  N: 250,
  XC: 600,
};

function filPhase(k) {
  const { X, Y, YS } = PONT;
  const croisements = X.filter((x, j) => j < k);
  return '<path d="M92 ' + YS[k] + "H140V" + Y[k] + '"/>' + filEnjambant(Y[k], 140, X[k], croisements);
}

/** Pont complet, sans inductance de source, chargé par L et R. */
function dessinPont(avecEtiquettes = true) {
  const { X, Y, YS, P, N, XC } = PONT;
  let s = TRAITS + ' stroke-width="1.6">';
  s += '<path d="M40 80V220" stroke-dasharray="5 4"/>';
  for (let k = 0; k < 3; k += 1) s += '<path d="M40 ' + YS[k] + 'H62"/>' + source(77, YS[k]) + filPhase(k);
  for (let k = 0; k < 3; k += 1) s += diodeHaut(X[k], Y[k], P) + diodeHaut(X[k], N, Y[k]);
  s += '<path d="M' + X[0] + " " + P + "H" + XC + "V70M" + X[0] + " " + N + "H" + XC + 'V202"/>';
  s += bobineVerticale(XC, 70, 4, 7) + '<path d="M' + XC + ' 126V146"/><rect x="' + (XC - 8) + '" y="146" width="16" height="56" rx="2"/>';
  s += "</g>";
  s += '<g fill="currentColor" stroke="none">';
  for (let k = 0; k < 3; k += 1) s += '<circle cx="' + X[k] + '" cy="' + Y[k] + '" r="3"/>';
  s += '<circle cx="380" cy="50" r="3"/><circle cx="460" cy="50" r="3"/><circle cx="380" cy="250" r="3"/><circle cx="460" cy="250" r="3"/></g>';
  if (avecEtiquettes) {
    s += ECRITS + texte(28, 74, "n") + texte(52, 64, "v_a") + texte(52, 134, "v_b") + texte(52, 204, "v_c");
    s += texte(146, 124, "a") + texte(146, 146, "b") + texte(146, 190, "c");
    const pos = [[314, 92, "D1"], [394, 104, "D3"], [474, 114, "D5"], [314, 212, "D4"], [394, 222, "D6"], [474, 232, "D2"]];
    for (const [x, y, nom] of pos) s += texte(x, y, nom);
    s += texte(284, 42, "P") + texte(284, 270, "N") + texte(616, 100, "L") + texte(616, 178, "R") + "</g>";
  }
  return s;
}

/** Chemin du courant, en trait épais, pour la diode du haut kh et celle du bas kb. */
function cheminPont(kh, kb, idM) {
  const { X, Y, YS, P, N, XC } = PONT;
  let s = TRAITS + ' stroke-width="3.6">';
  s += filPhase(kh) + filPhase(kb);
  s += '<path d="M40 ' + Math.min(YS[kh], YS[kb]) + "V" + Math.max(YS[kh], YS[kb]) + '" stroke-dasharray="5 4"/>';
  s += '<path d="M40 ' + YS[kh] + 'H62M40 ' + YS[kb] + 'H62"/>' + source(77, YS[kh]) + source(77, YS[kb]);
  s += diodeHaut(X[kh], Y[kh], P) + diodeHaut(X[kb], N, Y[kb]);
  s += '<path d="M' + X[kh] + " " + P + "H" + XC + "V70M" + XC + " " + N + "H" + X[kb] + '"/>';
  s += bobineVerticale(XC, 70, 4, 7) + '<path d="M' + XC + " 126V146M" + XC + " 202V" + N + '"/><rect x="' + (XC - 8) + '" y="146" width="16" height="56" rx="2"/>';
  s += "</g>";
  s += TRAITS + ' stroke-width="1.8">';
  s += seg([236, Y[kh] - 10], [266, Y[kh] - 10], ' marker-end="url(#' + idM + ')"');
  s += seg([266, Y[kb] + 12], [236, Y[kb] + 12], ' marker-end="url(#' + idM + ')"');
  s += seg([510, P - 12], [550, P - 12], ' marker-end="url(#' + idM + ')"');
  s += seg([XC + 26, 150], [XC + 26, 196], ' marker-end="url(#' + idM + ')"');
  s += seg([550, N + 12], [510, N + 12], ' marker-end="url(#' + idM + ')"');
  s += "</g>";
  return s;
}

function ligneV(c, repere, couleurs, x, libelle) {
  const px = repere.versX(x);
  c.save();
  c.setLineDash([4, 4]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.1;
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
  c.setLineDash([2, 4]);
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

/** Courbe tracée avec un style de trait, à partir de points {abscisse, cle}. */
function courbeStylee(c, repere, couleurs, points, cle, tirets, epaisseur, abscisse = "t") {
  c.save();
  c.setLineDash(tirets);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = epaisseur;
  c.beginPath();
  let premier = true;
  for (const q of points) {
    const px = repere.versX(q[abscisse]);
    const py = Math.max(repere.boite.y, Math.min(repere.boite.y + repere.boite.h, repere.versY(q[cle])));
    if (premier) c.moveTo(px, py);
    else c.lineTo(px, py);
    premier = false;
  }
  c.stroke();
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

/** Petit histogramme de spectre, rangs et pourcentages. */
function dessinSpectre(rangs, valeurs, titre) {
  const B0 = 60;
  const B1 = 560;
  const base = 200;
  const haut = 50;
  const l = (B1 - B0) / rangs.length;
  const vmax = Math.max(...valeurs);
  const idH = nouveauMarqueur("hach-k-sp");
  let s = '<defs><pattern id="' + idH + '" patternUnits="userSpaceOnUse" width="6" height="6"><path d="M0 6L6 0" stroke="currentColor" stroke-width="1.1"/></pattern></defs>';
  s += TRAITS + ' stroke-width="1.2"><path d="M' + B0 + " " + base + "H" + B1 + "M" + B0 + " " + base + "V" + (haut - 10) + '"/></g>';
  s += '<g fill="url(#' + idH + ')" stroke="currentColor" stroke-width="1.2">';
  let e = "";
  rangs.forEach((n, i) => {
    const h = ((base - haut) * valeurs[i]) / vmax;
    const x = B0 + i * l + l * 0.25;
    s += '<rect x="' + x.toFixed(1) + '" y="' + (base - h).toFixed(1) + '" width="' + (l * 0.5).toFixed(1) + '" height="' + h.toFixed(1) + '"/>';
    e += texte(x + l * 0.25 - (n < 10 ? 4 : 8), base + 18, String(n));
    e += texte(x - 4, base - h - 6, valeurs[i].toFixed(2).replace(".", ","));
  });
  s += "</g>" + ECRITS + e + texte(B0, 28, titre) + texte(B0, base + 40, "rang n") + "</g>";
  return s;
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
  construireEnveloppe(racine, api);
  construireEtoile(racine, api);
  construirePulsations(racine, api);
  construireCommutation(racine, api);
  construireSimulationPont(racine, api);
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
    ["#e-p3-figure svg", 1.5],
    ["#e-deco-figure svg", 1.5],
    ["#e-spectre-figure svg", 1.3],
    ["#f-schema-principal svg", 2.0],
    ["#h-figure svg", 1.4],
    ["#i-variateur-figure svg", 1.7],
  ];
  for (const [selecteur, duree] of schemas) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree }));
  }
}

/* --------------------------------------------------------------------------
   Corrections visuelles des questions de quiz
   -------------------------------------------------------------------------- */

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
    if (source !== "poignee" && etat.poignee) etat.poignee.set(options.versPoignee ? options.versPoignee(valeur) : valeur, false);
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
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-crete-composee",
      titre: "Crête de la tension composée",
      niveau: "prérequis",
      enonce: "<p>Sur un réseau $230/400\\ \\mathrm{V}$, quelle est la valeur de crête $\\hat U$ de la tension entre deux phases, en volts ?</p>",
      valeur: RAC2 * 400,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Crête $\\hat U$",
      etapes: [
        { texte: "La valeur efficace entre phases vaut $U = \\sqrt{3} \\times 230 \\approx 400\\ \\mathrm{V}$." },
        { texte: "La crête d'une sinusoïde vaut $\\sqrt{2}$ fois sa valeur efficace : $\\hat U = \\sqrt{2} \\times 400 = 565{,}7\\ \\mathrm{V}$." },
        { texte: "C'est aussi $\\sqrt{3}\\,\\hat V = \\sqrt{3} \\times 325{,}3$.", note: "C'est la tension inverse maximale des diodes d'un pont triphasé." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension simple et tension composée",
          xTitre: "angle",
          xUnite: "°",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 360,
          yMin: -600,
          yMax: 600,
          series: [
            { id: "uab", nom: "u_ab, crête 565,7 V (trait épais)", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => RAC2 * 400 * Math.sin((x + 30) * DEG) },
            { id: "va", nom: "v_a, crête 325,3 V (trait fin)", couleur: "serie-2", epaisseur: 1.4, fonction: (x) => RAC2 * 230 * Math.sin(x * DEG) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, RAC2 * 400, "Û = 565,7 V");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-moyenne-cos",
      titre: "Valeur moyenne d'un sommet de sinusoïde",
      niveau: "prérequis",
      enonce: "<p>Quelle est la valeur moyenne de $\\cos\\varphi$ sur l'intervalle $[-30^\\circ, +30^\\circ]$ ? Donnez un nombre sans unité.</p>",
      valeur: 3 / Math.PI,
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Valeur moyenne",
      etapes: [
        { texte: "Longueur de l'intervalle : $\\pi/3$. Intégrale : $\\int_{-\\pi/6}^{\\pi/6}\\cos\\varphi\\,\\mathrm{d}\\varphi = 2\\sin(\\pi/6) = 1$." },
        { texte: "Moyenne : $1/(\\pi/3) = 3/\\pi = 0{,}955$." },
        { texte: "C'est exactement le rapport $V_{d0}/\\hat U$ du pont triphasé.", note: "Le pont prend chaque morceau au sommet d'une tension composée, entre -30 et +30 degrés." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Sommet d'un cosinus et sa moyenne",
          xTitre: "angle",
          xUnite: "°",
          yTitre: "valeur",
          xMin: -60,
          xMax: 60,
          yMin: 0.4,
          yMax: 1.05,
          series: [{ id: "c", nom: "cos φ (trait plein)", couleur: "serie-1", epaisseur: 2.4, fonction: (x) => Math.cos(x * DEG) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 3 / Math.PI, "moyenne 0,955 sur ±30°");
            ligneV(c, r, couleurs, -30, "");
            ligneV(c, r, couleurs, 30, "");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-inductance",
      titre: "Tension aux bornes d'une inductance",
      niveau: "prérequis",
      enonce: "<p>Le courant d'une inductance de $0{,}5\\ \\mathrm{mH}$ passe de $0$ à $50\\ \\mathrm{A}$ en $1\\ \\mathrm{ms}$, à vitesse constante. Quelle tension supporte-t-elle, en volts ?</p>",
      valeur: 25,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension $v_L$",
      etapes: [
        { texte: "$\\mathrm{d}i/\\mathrm{d}t = 50/0{,}001 = 50\\,000\\ \\mathrm{A/s}$." },
        { texte: "$v = L\\,\\mathrm{d}i/\\mathrm{d}t = 0{,}0005 \\times 50\\,000 = 25\\ \\mathrm{V}$." },
        { texte: "Surface de tension : $25\\ \\mathrm{V} \\times 1\\ \\mathrm{ms} = 25\\ \\mathrm{mV.s} = L\\,\\Delta i$.", note: "C'est cette surface qui manque à la tension redressée à chaque commutation." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["di/dt = 50 A / 1 ms = 50 000 A/s", "v = L di/dt = 0,5 mH × 50 000 A/s", "v = 25 V ; surface 25 V × 1 ms = L Δi"], "Tension et surface de tension d'une inductance.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : deux aiguillages et les enveloppes
   -------------------------------------------------------------------------- */

function construireEnveloppe(racine, api) {
  const conteneur = racine.querySelector("#d-enveloppe");
  if (!conteneur) return;
  const U = 400;
  const Vc = (RAC2 * U) / RAC3;
  const TX0 = 90;
  const TX1 = 690;
  const CY = 380;
  const AMP = 66;
  const AXE = 476;
  const versX = (th) => TX0 + ((TX1 - TX0) * th) / 360;
  const id = nouveauMarqueur("fl-d-en");

  const svg = svgEl("svg", {
    viewBox: "0 0 760 530",
    role: "img",
    "aria-label": "Pont à six diodes : diodes passantes et chemin du courant à l'angle choisi, avec les trois tensions simples et les deux enveloppes sur une période",
  });
  let fond = "<defs>" + marqueur(id) + "</defs>" + dessinPont(true);
  fond += TRAITS + ' stroke-width="1.1"><path d="M' + TX0 + " " + CY + "H" + TX1 + "M" + TX0 + " " + AXE + "H" + TX1 + '"/>';
  let ecr = "";
  for (let th = 0; th <= 360; th += 60) {
    fond += '<path d="M' + versX(th).toFixed(1) + " " + (AXE - 5) + 'v10"/>';
    ecr += texte(versX(th) - 10, AXE + 22, th + "°");
  }
  fond += "</g>";
  fond += '<g fill="none" stroke="currentColor" stroke-width="0.8" stroke-dasharray="2 4">';
  for (let th = 30; th < 360; th += 60) fond += '<path d="M' + versX(th).toFixed(1) + " " + (CY - AMP - 6) + "V" + (CY + AMP + 6) + '"/>';
  fond += "</g>";
  const styles = ["", ' stroke-dasharray="7 5"', ' stroke-dasharray="2 4"'];
  for (let k = 0; k < 3; k += 1) {
    const pts = [];
    for (let th = 0; th <= 360; th += 3) pts.push([versX(th), CY - AMP * Math.sin(th * DEG - (TAU * k) / 3)]);
    fond += '<polyline fill="none" stroke="currentColor" stroke-width="1.2"' + styles[k] + ' points="' + chaine(pts) + '"/>';
  }
  const pMax = [];
  const pMin = [];
  for (let th = 0; th <= 360; th += 2) {
    const v = [0, 1, 2].map((k) => Math.sin(th * DEG - (TAU * k) / 3));
    pMax.push([versX(th), CY - AMP * Math.max(...v)]);
    pMin.push([versX(th), CY - AMP * Math.min(...v)]);
  }
  fond += '<polyline fill="none" stroke="currentColor" stroke-width="2.8" points="' + chaine(pMax) + '"/>';
  fond += '<polyline fill="none" stroke="currentColor" stroke-width="2.8" points="' + chaine(pMin) + '"/>';
  ecr += texte(TX1 + 6, CY - AMP + 4, "v_P") + texte(TX1 + 6, CY + AMP + 4, "v_N") + texte(12, CY - 40, "v_a plein") + texte(12, CY - 24, "v_b tirets") + texte(12, CY - 8, "v_c points");
  ecr += texte(TX0, AXE + 44, "angle θ : poignée ronde sur cet axe");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecr + "</g>";
  const actif = svgEl("g");
  const curseur = svgEl("g");
  svg.append(groupeFond, actif, curseur);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-enveloppe-valeurs", [
    { id: "th", libelle: "Angle θ", unite: "°", decimales: 0 },
    { id: "va", libelle: "v_a", unite: "V", decimales: 0 },
    { id: "vb", libelle: "v_b", unite: "V", decimales: 0 },
    { id: "vc", libelle: "v_c", unite: "V", decimales: 0 },
    { id: "vP", libelle: "v_P = max", unite: "V", decimales: 0 },
    { id: "vN", libelle: "v_N = min", unite: "V", decimales: 0 },
    { id: "vPN", libelle: "v_PN", unite: "V", decimales: 0 },
    { id: "paire", libelle: "Diodes passantes", format: (x) => x },
    { id: "u", libelle: "Tension composée appliquée", format: (x) => x },
    { id: "vD1", libelle: "v_D1 = v_a - v_P", unite: "V", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner(th) {
    const e = etatPont(th * DEG, U, 0, 1, true);
    const kh = e.haut[0];
    const kb = e.bas[0];
    actif.innerHTML = cheminPont(kh, kb, id);
    const x = versX(th);
    curseur.innerHTML =
      TRAITS + ' stroke-width="1" stroke-dasharray="3 4"><path d="M' + x.toFixed(1) + " " + (CY - AMP - 10) + "V" + AXE + '"/></g>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + (CY - (AMP * e.vP) / Vc).toFixed(1) + '" r="5" fill="currentColor"/>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + (CY - (AMP * e.vN) / Vc).toFixed(1) + '" r="5" fill="currentColor"/>';
    if (valeurs) {
      valeurs.maj({
        th,
        va: e.v[0],
        vb: e.v[1],
        vc: e.v[2],
        vP: e.vP,
        vN: e.vN,
        vPN: e.vs,
        paire: DIODE_HAUT[kh] + " et " + DIODE_BAS[kb],
        u: "u_" + NOMS_PHASES[kh] + NOMS_PHASES[kb],
        vD1: e.v[0] - e.vP,
      });
    }
  }

  const trace = api.dessiner(groupeFond, { declencheur: conteneur, duree: 1.6 });
  if (trace) ressources.push(trace);
  const synchro = synchroniseur(dessiner);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: TX0, y: AXE },
    a: { x: TX1, y: AXE },
    min: 0,
    max: 360,
    pas: 1,
    valeur: 45,
    unite: "°",
    libelle: "Angle d'observation",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);
  synchro.lecteur = api.sim.lecteur("#d-enveloppe-lecteur", {
    de: 0,
    a: 360,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Lecture sur une période",
    rappel: (th) => synchro.appliquer(th, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  synchro.appliquer(45, null);
}

/* --------------------------------------------------------------------------
   D. Animation : l'étoile des six tensions composées
   -------------------------------------------------------------------------- */

const ETOILE = [
  { nom: "u_ab", decalage: 0, paire: "D1 et D6" },
  { nom: "u_ac", decalage: -60, paire: "D1 et D2" },
  { nom: "u_bc", decalage: -120, paire: "D3 et D2" },
  { nom: "u_ba", decalage: -180, paire: "D3 et D4" },
  { nom: "u_ca", decalage: -240, paire: "D5 et D4" },
  { nom: "u_cb", decalage: -300, paire: "D5 et D6" },
];

function construireEtoile(racine, api) {
  const conteneur = racine.querySelector("#d-etoile");
  if (!conteneur) return;
  const CX = 190;
  const CY = 200;
  const RAY = 140;
  const GX0 = 410;
  const GX1 = 730;
  const versGX = (th) => GX0 + ((GX1 - GX0) * th) / 360;
  const versGY = (v) => 340 - ((v - 0.5) / 0.5) * 280;
  const idM = nouveauMarqueur("fl-d-et");
  const svg = svgEl("svg", {
    viewBox: "0 0 760 390",
    role: "img",
    "aria-label": "Étoile tournante des six tensions composées, secteur de conduction de plus ou moins 30 degrés autour de la verticale, et tension redressée correspondante",
  });
  const a1 = 60 * DEG;
  const a2 = 120 * DEG;
  const secteur = svgEl("g");
  secteur.innerHTML =
    '<path d="M' + CX + " " + CY + "L" + (CX + RAY * Math.cos(a1)).toFixed(1) + " " + (CY - RAY * Math.sin(a1)).toFixed(1) +
    "A" + RAY + " " + RAY + " 0 0 0 " + (CX + RAY * Math.cos(a2)).toFixed(1) + " " + (CY - RAY * Math.sin(a2)).toFixed(1) + 'Z" fill="currentColor" fill-opacity="0.12" stroke="none"/>';
  let fond = "<defs>" + marqueur(idM) + "</defs>";
  fond += TRAITS + ' stroke-width="1"><circle cx="' + CX + '" cy="' + CY + '" r="' + RAY + '" stroke-dasharray="3 5"/><path d="M' + CX + " " + (CY + RAY + 14) + "V" + (CY - RAY - 18) + "M" + (CX - RAY - 14) + " " + CY + "H" + (CX + RAY + 14) + '"/>';
  fond += '<path d="M' + GX0 + " " + versGY(0.5) + "H" + GX1 + "M" + GX0 + " " + versGY(0.5) + "V" + versGY(1.02) + '"/></g>';
  fond += '<g fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 4"><path d="M' + GX0 + " " + versGY(Math.cos(30 * DEG)).toFixed(1) + "H" + GX1 + '"/></g>';
  for (const ph of ETOILE) {
    const pts = [];
    for (let th = 0; th <= 360; th += 3) {
      const v = Math.sin((th + 30 + ph.decalage) * DEG);
      if (v >= 0.5) pts.push([versGX(th), versGY(v)]);
      else if (pts.length) {
        fond += '<polyline fill="none" stroke="currentColor" stroke-width="0.9" points="' + chaine(pts) + '"/>';
        pts.length = 0;
      }
    }
    if (pts.length > 1) fond += '<polyline fill="none" stroke="currentColor" stroke-width="0.9" points="' + chaine(pts) + '"/>';
  }
  const env = [];
  for (let th = 0; th <= 360; th += 1) env.push([versGX(th), versGY(Math.max(...ETOILE.map((ph) => Math.sin((th + 30 + ph.decalage) * DEG))))]);
  fond += '<polyline fill="none" stroke="currentColor" stroke-width="2.6" points="' + chaine(env) + '"/>';
  let ecr = texte(CX - 30, CY - RAY - 24, "axe de projection") + texte(CX + 54, CY - RAY + 6, "secteur ±30°");
  ecr += texte(GX0, 26, "v_PN / Û sur une période") + texte(GX0 - 28, versGY(1) + 4, "1") + texte(GX0 - 36, versGY(0.5) + 4, "0,5") + texte(GX1 - 50, versGY(0.866) + 16, "0,866");
  for (let th = 0; th <= 360; th += 90) ecr += texte(versGX(th) - 10, versGY(0.5) + 20, th + "°");
  ecr += texte(GX0, versGY(0.5) + 40, "angle θ, avec v_a = V̂ sin θ");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecr + "</g>";
  const mobile = svgEl("g");
  svg.append(secteur, groupeFond, mobile);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-etoile-valeurs", [
    { id: "th", libelle: "Angle θ", unite: "°", decimales: 0 },
    { id: "nom", libelle: "Vecteur dans le secteur", format: (x) => x },
    { id: "ecart", libelle: "Écart à la verticale", unite: "°", decimales: 0 },
    { id: "v", libelle: "v_PN / Û", decimales: 3 },
    { id: "vPN", libelle: "v_PN sous 400 V", unite: "V", decimales: 0 },
    { id: "paire", libelle: "Diodes passantes", format: (x) => x },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner(beta) {
    const th = (((beta - 30) % 360) + 360) % 360;
    let actifIndex = 0;
    let meilleur = -2;
    ETOILE.forEach((ph, i) => {
      const v = Math.sin((beta + ph.decalage) * DEG);
      if (v > meilleur) {
        meilleur = v;
        actifIndex = i;
      }
    });
    let s = "";
    ETOILE.forEach((ph, i) => {
      const a = (beta + ph.decalage) * DEG;
      const x = CX + RAY * Math.cos(a);
      const y = CY - RAY * Math.sin(a);
      const epais = i === actifIndex;
      s += TRAITS + ' stroke-width="' + (epais ? 3.2 : 1.4) + '">' + seg([CX, CY], [x, y], ' marker-end="url(#' + idM + ')"') + "</g>";
      const xl = CX + (RAY + 22) * Math.cos(a) - 14;
      const yl = CY - (RAY + 16) * Math.sin(a) + 4;
      s += ECRITS + texte(xl, yl, ph.nom, epais ? ' font-weight="700"' : "") + "</g>";
    });
    const aA = (beta + ETOILE[actifIndex].decalage) * DEG;
    const xa = CX + RAY * Math.cos(aA);
    const ya = CY - RAY * Math.sin(aA);
    s += '<g fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 4"><path d="M' + xa.toFixed(1) + " " + ya.toFixed(1) + "H" + CX + '"/></g>';
    s += '<circle cx="' + CX + '" cy="' + ya.toFixed(1) + '" r="4" fill="currentColor"/>';
    s += '<circle cx="' + versGX(th).toFixed(1) + '" cy="' + versGY(meilleur).toFixed(1) + '" r="5" fill="currentColor"/>';
    s += TRAITS + ' stroke-width="1" stroke-dasharray="3 4"><path d="M' + versGX(th).toFixed(1) + " " + versGY(0.5) + "V" + versGY(1.02) + '"/></g>';
    mobile.innerHTML = s;
    if (valeurs) {
      const angle = ((((beta + ETOILE[actifIndex].decalage) % 360) + 360) % 360) - 90;
      valeurs.maj({
        th,
        nom: ETOILE[actifIndex].nom,
        ecart: angle,
        v: meilleur,
        vPN: meilleur * RAC2 * 400,
        paire: ETOILE[actifIndex].paire,
      });
    }
  }

  const trace = api.dessiner(groupeFond, { declencheur: conteneur, duree: 1.5 });
  if (trace) ressources.push(trace);
  const synchro = synchroniseur(dessiner, { versPoignee: (beta) => beta });
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: { x: CX, y: CY },
    rayon: RAY,
    valeur: 75,
    pas: 1,
    unite: "°",
    libelle: "Position du vecteur u_ab",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);
  synchro.lecteur = api.sim.lecteur("#d-etoile-lecteur", {
    de: 30,
    a: 390,
    duree: 14,
    boucle: true,
    auto: false,
    libelle: "Rotation sur une période",
    rappel: (beta) => synchro.appliquer(beta % 360, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  synchro.appliquer(75, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : indice de pulsation
   -------------------------------------------------------------------------- */

const MONTAGES_P = [
  { p: 2, nom: "pont monophasé PD2", lambda: 0.9 },
  { p: 3, nom: "trois impulsions P3", lambda: 0.675 },
  { p: 6, nom: "pont triphasé PD3", lambda: 0.955 },
  { p: 12, nom: "douze impulsions", lambda: 0.989 },
];

function enveloppeP(thDeg, p) {
  const largeur = 360 / p;
  const x = (((thDeg % largeur) + largeur) % largeur) - largeur / 2;
  return Math.cos(x * DEG);
}

function construirePulsations(racine, api) {
  if (!racine.querySelector("#e-pulsations")) return;
  let choix = MONTAGES_P[2];
  const moyenne = (p) => (p / Math.PI) * Math.sin(Math.PI / p);
  const traceur = api.sim.traceur("#e-pulsations", {
    titre: "Tension redressée normalisée",
    xTitre: "angle",
    xUnite: "°",
    yTitre: "v / Û_c",
    xMin: 0,
    xMax: 360,
    yMin: 0,
    yMax: 1.08,
    ratio: 0.42,
    echantillons: 720,
    series: [{ id: "v", nom: "montage choisi (trait plein)", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => enveloppeP(x, choix.p) }],
    note: "Tirets : pont monophasé, p = 2. Pointillés horizontaux : moyenne du montage choisi.",
    surDessin({ c, repere: r, couleurs }) {
      const pts = [];
      for (let th = 0; th <= 360; th += 2) pts.push({ th, v: enveloppeP(th, 2) });
      courbeStylee(c, r, couleurs, pts, "v", [7, 5], 1.4, "th");
      ligneH(c, r, couleurs, moyenne(choix.p), "moyenne " + nombre(api, moyenne(choix.p), 3));
    },
  });
  if (traceur) ressources.push(traceur);
  const valeurs = api.sim.valeurs("#e-pulsations-valeurs", [
    { id: "nom", libelle: "Montage", format: (x) => x },
    { id: "p", libelle: "Indice de pulsation p", decimales: 0 },
    { id: "f", libelle: "Fréquence d'ondulation", unite: "Hz", decimales: 0 },
    { id: "moy", libelle: "V_d0 / Û_c", decimales: 3 },
    { id: "ond", libelle: "Ondulation crête à crête / Û_c", unite: "%", decimales: 1 },
    { id: "h", libelle: "Premier harmonique / V_d0", unite: "%", decimales: 2 },
    { id: "lambda", libelle: "λ en courant lissé", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);
  function maj() {
    const p = choix.p;
    if (traceur) traceur.rafraichir();
    if (valeurs) {
      valeurs.maj({
        nom: choix.nom,
        p,
        f: p * F_RESEAU,
        moy: moyenne(p),
        ond: (1 - Math.cos(Math.PI / p)) * 100,
        h: 200 / (p * p - 1),
        lambda: choix.lambda,
      });
    }
  }
  const curseurs = api.sim.curseurs(
    "#e-pulsations-curseurs",
    [{ id: "rang", libelle: "Montage : 1 PD2, 2 P3, 3 PD3, 4 douze impulsions", min: 1, max: 4, pas: 1, valeur: 3, format: (x) => "p = " + MONTAGES_P[Math.round(x) - 1].p }],
    (lues) => {
      choix = MONTAGES_P[Math.round(lues.rang) - 1];
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   E. Animation : les commutations
   -------------------------------------------------------------------------- */

function construireCommutation(racine, api) {
  const conteneur = racine.querySelector("#e-commut");
  if (!conteneur) return;
  const U = 400;
  const Vc = (RAC2 * U) / RAC3;
  const reglages = { Ls: 0.5e-3, Id: 100 };
  const TH0 = 120;
  const TH1 = 240;
  const TX0 = 90;
  const TX1 = 690;
  const VY = 165;
  const VA = 120;
  const IY = 380;
  const IA = 52;
  const AXE = 456;
  const versX = (th) => TX0 + ((TX1 - TX0) * (th - TH0)) / (TH1 - TH0);
  const versV = (v) => VY - (VA * v) / Vc;
  const versI = (i) => IY - (IA * i) / reglages.Id;

  const svg = svgEl("svg", {
    viewBox: "0 0 760 510",
    role: "img",
    "aria-label": "Commutations du pont entre 120 et 240 degrés : potentiels des barres P et N, surfaces de tension perdues pendant l'empiètement et courants de ligne",
  });
  let fond = TRAITS + ' stroke-width="1.1"><path d="M' + TX0 + " " + VY + "H" + TX1 + "M" + TX0 + " " + IY + "H" + TX1 + "M" + TX0 + " " + AXE + "H" + TX1 + '"/>';
  let ecr = "";
  for (let th = TH0; th <= TH1; th += 30) {
    fond += '<path d="M' + versX(th).toFixed(1) + " " + (AXE - 5) + 'v10"/>';
    ecr += texte(versX(th) - 12, AXE + 22, th + "°");
  }
  fond += "</g>";
  fond += '<g fill="none" stroke="currentColor" stroke-width="0.8" stroke-dasharray="2 4">';
  for (const th of [150, 210]) fond += '<path d="M' + versX(th).toFixed(1) + " " + (VY - VA - 10) + "V" + (IY + IA + 8) + '"/>';
  fond += "</g>";
  ecr += texte(12, VY - VA + 4, "V̂") + texte(12, VY + 4, "0") + texte(12, VY + VA + 4, "-V̂") + texte(12, IY - IA + 4, "+I_d") + texte(12, IY + 4, "0") + texte(12, IY + IA + 4, "-I_d");
  ecr += texte(versX(150) - 70, VY - VA - 16, "commutation a vers b") + texte(versX(210) - 50, VY - VA - 16, "c vers a, en bas");
  ecr += texte(TX0, AXE + 44, "angle θ : poignée ronde sur cet axe") + texte(TX1 - 160, IY - IA - 8, "courants de ligne");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecr + "</g>";
  const courbes = svgEl("g");
  const mobile = svgEl("g");
  svg.append(courbes, groupeFond, mobile);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-commut-valeurs", [
    { id: "mu", libelle: "Angle d'empiètement μ", unite: "°", decimales: 1 },
    { id: "muMs", libelle: "Durée de l'empiètement", unite: "ms", decimales: 2 },
    { id: "dV", libelle: "Chute moyenne 6 f L_s I_d", unite: "V", decimales: 1 },
    { id: "Vd", libelle: "V_d = 540,2 V - chute", unite: "V", decimales: 1 },
    { id: "th", libelle: "Angle θ", unite: "°", decimales: 1 },
    { id: "vP", libelle: "v_P", unite: "V", decimales: 0 },
    { id: "vN", libelle: "v_N", unite: "V", decimales: 0 },
    { id: "ia", libelle: "i_a", unite: "A", decimales: 1 },
    { id: "ib", libelle: "i_b", unite: "A", decimales: 1 },
    { id: "ic", libelle: "i_c", unite: "A", decimales: 1 },
    { id: "etat", libelle: "Diodes passantes", format: (x) => x },
  ]);
  if (valeurs) ressources.push(valeurs);

  function calculer() {
    const pv = [[], [], []];
    const pP = [];
    const pN = [];
    const pi = [[], [], []];
    let zones = "";
    const mu = angleEmpietement(U, reglages.Ls, reglages.Id) / DEG;
    for (let th = TH0; th <= TH1 + 1e-9; th += 0.5) {
      const e = etatPont(th * DEG, U, reglages.Ls, reglages.Id, true);
      for (let k = 0; k < 3; k += 1) {
        pv[k].push([versX(th), versV(e.v[k])]);
        pi[k].push([versX(th), versI(e.i[k])]);
      }
      pP.push([versX(th), versV(e.vP)]);
      pN.push([versX(th), versV(e.vN)]);
    }
    if (mu > 0) {
      const haut = [];
      const bas = [];
      for (let th = 150; th <= 150 + mu + 1e-9; th += 0.5) haut.push([versX(th), versV(Vc * Math.sin(th * DEG - TAU / 3))]);
      for (let th = 150 + mu; th >= 150 - 1e-9; th -= 0.5) haut.push([versX(th), versV(etatPont(th * DEG, U, reglages.Ls, reglages.Id).vP)]);
      for (let th = 210; th <= 210 + mu + 1e-9; th += 0.5) bas.push([versX(th), versV(Vc * Math.sin(th * DEG))]);
      for (let th = 210 + mu; th >= 210 - 1e-9; th -= 0.5) bas.push([versX(th), versV(etatPont(th * DEG, U, reglages.Ls, reglages.Id).vN)]);
      zones += '<polygon points="' + chaine(haut) + '" fill="currentColor" fill-opacity="0.22" stroke="none"/>';
      zones += '<polygon points="' + chaine(bas) + '" fill="currentColor" fill-opacity="0.22" stroke="none"/>';
    }
    const styles = ["", ' stroke-dasharray="7 5"', ' stroke-dasharray="2 4"'];
    let s = zones;
    for (let k = 0; k < 3; k += 1) s += '<polyline fill="none" stroke="currentColor" stroke-width="1.1"' + styles[k] + ' points="' + chaine(pv[k]) + '"/>';
    s += '<polyline fill="none" stroke="currentColor" stroke-width="2.8" points="' + chaine(pP) + '"/>';
    s += '<polyline fill="none" stroke="currentColor" stroke-width="2.8" stroke-dasharray="9 5" points="' + chaine(pN) + '"/>';
    const stylesI = [' stroke-width="2.8"', ' stroke-width="1.8" stroke-dasharray="7 5"', ' stroke-width="1.8" stroke-dasharray="2 4"'];
    for (let k = 0; k < 3; k += 1) s += '<polyline fill="none" stroke="currentColor"' + stylesI[k] + ' points="' + chaine(pi[k]) + '"/>';
    s += ECRITS + texte(TX1 + 6, versV(Vc * 0.9), "v_P") + texte(TX1 + 6, versV(-Vc * 0.9), "v_N") + "</g>";
    courbes.innerHTML = s;
  }

  function dessiner(th) {
    const e = etatPont(th * DEG, U, reglages.Ls, reglages.Id, true);
    const x = versX(th);
    mobile.innerHTML =
      TRAITS + ' stroke-width="1" stroke-dasharray="3 4"><path d="M' + x.toFixed(1) + " " + (VY - VA - 8) + "V" + AXE + '"/></g>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + versV(e.vP).toFixed(1) + '" r="5" fill="currentColor"/>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + versV(e.vN).toFixed(1) + '" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + versI(e.i[0]).toFixed(1) + '" r="4.5" fill="currentColor"/>';
    const passantes = e.haut.map((k) => DIODE_HAUT[k]).concat(e.bas.map((k) => DIODE_BAS[k]));
    const mu = e.mu / DEG;
    if (valeurs) {
      const dV = 6 * F_RESEAU * reglages.Ls * reglages.Id;
      valeurs.maj({
        mu,
        muMs: (mu / 360) * 20,
        dV,
        Vd: (3 * RAC2 * U) / Math.PI - dV,
        th,
        vP: e.vP,
        vN: e.vN,
        ia: e.i[0],
        ib: e.i[1],
        ic: e.i[2],
        etat: passantes.join(", ") + (passantes.length > 2 ? " : empiètement" : ""),
      });
    }
  }

  const trace = api.dessiner(groupeFond, { declencheur: conteneur, duree: 1.2 });
  if (trace) ressources.push(trace);
  const synchro = synchroniseur(dessiner);
  const curseurs = api.sim.curseurs(
    "#e-commut-curseurs",
    [
      { id: "Ls", libelle: "Inductance de source par phase L_s", min: 0, max: 2, pas: 0.05, valeur: 0.5, unite: "mH" },
      { id: "Id", libelle: "Courant continu lissé I_d", min: 10, max: 150, pas: 5, valeur: 100, unite: "A" },
    ],
    (lues) => {
      const Ls = lues.Ls / 1000;
      if (Ls !== reglages.Ls || lues.Id !== reglages.Id) {
        reglages.Ls = Ls;
        reglages.Id = lues.Id;
        calculer();
        synchro.redessiner();
      }
    }
  );
  if (curseurs) ressources.push(curseurs);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: TX0, y: AXE },
    a: { x: TX1, y: AXE },
    min: TH0,
    max: TH1,
    pas: 0.5,
    valeur: 158,
    unite: "°",
    libelle: "Angle d'observation",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);
  synchro.lecteur = api.sim.lecteur("#e-commut-lecteur", {
    de: TH0,
    a: TH1,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Lecture de 120 à 240 degrés",
    rappel: (th) => synchro.appliquer(th, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  calculer();
  synchro.appliquer(158, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : le pont complet
   -------------------------------------------------------------------------- */

function construireSimulationPont(racine, api) {
  if (!racine.querySelector("#e-pont-tensions")) return;
  const reglages = { pd3: true, U: 400, Ls: 0, Id: 100 };
  let resultat = null;
  let instant = 5;

  const tensions = api.sim.traceur("#e-pont-tensions", {
    titre: "Tension redressée sur une période",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "tension",
    yUnite: "V",
    xMin: 0,
    xMax: 20,
    yMin: 0,
    yMax: 600,
    ratio: 0.42,
    series: [{ id: "v", nom: "tension redressée (trait plein)", couleur: "serie-1", epaisseur: 2.6 }],
    note: "Pointillés horizontaux : valeur moyenne. Trait vertical : instant observé.",
    surDessin({ c, repere: r, couleurs }) {
      if (!resultat) return;
      ligneH(c, r, couleurs, resultat.Vmoy, "moyenne " + nombre(api, resultat.Vmoy, 1) + " V");
      ligneV(c, r, couleurs, instant, "t = " + nombre(api, instant, 1) + " ms");
    },
  });
  if (tensions) ressources.push(tensions);
  const courants = api.sim.traceur("#e-pont-courants", {
    titre: "Courant de ligne et courant d'une diode",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "courant",
    yUnite: "A",
    xMin: 0,
    xMax: 20,
    yMin: -120,
    yMax: 120,
    ratio: 0.38,
    series: [{ id: "ia", nom: "i_a, courant de ligne (trait plein)", couleur: "serie-3", epaisseur: 2.4 }],
    note: "Tirets : courant de la diode D1.",
    surDessin({ c, repere: r, couleurs }) {
      if (!resultat) return;
      courbeStylee(c, r, couleurs, resultat.points, "iD1", [7, 5], 1.6);
      ligneV(c, r, couleurs, instant, "");
    },
  });
  if (courants) ressources.push(courants);

  const valeurs = api.sim.valeurs("#e-pont-valeurs", [
    { id: "montage", libelle: "Montage", format: (x) => x },
    { id: "Vmoy", libelle: "Tension moyenne simulée", unite: "V", decimales: 1 },
    { id: "Vform", libelle: "Formule V_d0 - chute de commutation", unite: "V", decimales: 1 },
    { id: "dV", libelle: "Ondulation crête à crête", unite: "V", decimales: 1 },
    { id: "f", libelle: "Fréquence d'ondulation", unite: "Hz", decimales: 0 },
    { id: "mu", libelle: "Empiètement μ", unite: "°", decimales: 1 },
    { id: "IDmoy", libelle: "Diode : courant moyen", unite: "A", decimales: 1 },
    { id: "IDeff", libelle: "Diode : courant efficace", unite: "A", decimales: 1 },
    { id: "Vinv", libelle: "Diode : tension inverse maximale", unite: "V", decimales: 0 },
    { id: "Ieff", libelle: "Ligne : courant efficace", unite: "A", decimales: 1 },
    { id: "I0", libelle: "Ligne : composante continue", unite: "A", decimales: 1 },
    { id: "I1", libelle: "Ligne : fondamental", unite: "A", decimales: 1 },
    { id: "cos1", libelle: "cos φ1", decimales: 3 },
    { id: "thd", libelle: "Taux de distorsion du courant", unite: "%", decimales: 1 },
    { id: "lambda", libelle: "Facteur de puissance λ", decimales: 3 },
    { id: "vt", libelle: "Tension à l'instant t", unite: "V", decimales: 0 },
    { id: "it", libelle: "i_a à l'instant t", unite: "A", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function calculer() {
    resultat = synthesePont(reglages.U, reglages.Ls, reglages.Id, reglages.pd3, 1440);
    const crete = RAC2 * reglages.U;
    if (tensions) {
      tensions.definirPlage({ yMin: 0, yMax: 1.1 * (reglages.pd3 ? crete : crete / RAC3) });
      tensions.definirDonnees("v", resultat.points.map((q) => [q.t, q.vs]));
    }
    if (courants) {
      const m = 1.15 * reglages.Id;
      courants.definirPlage({ yMin: -m, yMax: m });
      courants.definirDonnees("ia", resultat.points.map((q) => [q.t, q.ia]));
    }
  }

  function majValeurs() {
    if (!resultat || !valeurs) return;
    const pts = resultat.points;
    const k = Math.max(0, Math.min(pts.length - 1, Math.round((instant / 20) * (pts.length - 1))));
    const U = reglages.U;
    const Vd0 = reglages.pd3 ? (3 * RAC2 * U) / Math.PI : ((3 * RAC3) / (2 * Math.PI)) * ((RAC2 * U) / RAC3);
    const chute = (reglages.pd3 ? 6 : 3) * F_RESEAU * reglages.Ls * reglages.Id;
    valeurs.maj({
      montage: reglages.pd3 ? "PD3, six impulsions" : "P3, trois impulsions",
      Vmoy: resultat.Vmoy,
      Vform: Vd0 - chute,
      dV: resultat.vmax - resultat.vmin,
      f: (reglages.pd3 ? 6 : 3) * F_RESEAU,
      mu: resultat.mu / DEG,
      IDmoy: resultat.IDmoy,
      IDeff: resultat.IDeff,
      Vinv: RAC2 * U,
      Ieff: resultat.Ieff,
      I0: resultat.I0,
      I1: resultat.I1,
      cos1: resultat.cos1,
      thd: resultat.thd * 100,
      lambda: resultat.lambda,
      vt: pts[k].vs,
      it: pts[k].ia,
    });
  }

  function placerInstant(t) {
    instant = t;
    if (tensions) tensions.demanderRendu();
    if (courants) courants.demanderRendu();
    majValeurs();
  }

  const synchro = synchroniseur(placerInstant, { idCurseur: "t" });
  synchro.curseurs = api.sim.curseurs(
    "#e-pont-curseurs",
    [
      { id: "montage", libelle: "Montage : 1 P3, 2 PD3", min: 1, max: 2, pas: 1, valeur: 2, format: (x) => (Math.round(x) === 1 ? "P3" : "PD3") },
      { id: "U", libelle: "Tension composée du réseau U", min: 230, max: 690, pas: 10, valeur: 400, unite: "V" },
      { id: "Ls", libelle: "Inductance de source par phase L_s", min: 0, max: 1.5, pas: 0.05, valeur: 0, unite: "mH" },
      { id: "Id", libelle: "Courant continu lissé I_d", min: 5, max: 150, pas: 5, valeur: 100, unite: "A" },
      { id: "t", libelle: "Instant d'observation t", min: 0, max: 20, pas: 0.05, valeur: 5, unite: "ms" },
    ],
    (lues) => {
      const nouveaux = { pd3: Math.round(lues.montage) === 2, U: lues.U, Ls: lues.Ls / 1000, Id: lues.Id };
      const change = Object.keys(nouveaux).some((cle) => nouveaux[cle] !== reglages[cle]);
      if (change) {
        Object.assign(reglages, nouveaux);
        calculer();
      }
      synchro.appliquer(lues.t, "curseur");
    }
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);
  synchro.lecteur = api.sim.lecteur("#e-pont-lecteur", {
    de: 0,
    a: 20,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Instant d'observation sur une période",
    rappel: (t) => synchro.appliquer(t, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  calculer();
  synchro.appliquer(5, null);
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function dessinPontQuiz(idM) {
  return "<defs>" + marqueur(idM) + "</defs>" + dessinPont(true) + ECRITS + texte(20, 296, "θ = 120° : v_a la plus haute ; D1 conduit") + "</g>";
}

const ZONES_PONT = [
  { x: 278, y: 66, largeur: 44, hauteur: 48, etiquette: "D1" },
  { x: 358, y: 76, largeur: 44, hauteur: 48, etiquette: "D3" },
  { x: 438, y: 86, largeur: 44, hauteur: 48, etiquette: "D5" },
  { x: 278, y: 168, largeur: 44, hauteur: 46, etiquette: "D4" },
  { x: 358, y: 178, largeur: 44, hauteur: 46, etiquette: "D6" },
  { x: 438, y: 188, largeur: 44, hauteur: 46, etiquette: "D2", juste: true },
];

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* 1. Fondamental */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-pd3-690",
      titre: "Tension moyenne d'un pont sur réseau 690 V",
      niveau: "fondamental",
      enonce: "<p>Un pont à six diodes idéales est alimenté par un réseau de $690\\ \\mathrm{V}$ entre phases et débite un courant lissé. Quelle est sa tension moyenne, en volts ?</p>",
      valeur: (3 * RAC2 * 690) / Math.PI,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension moyenne $V_{d0}$",
      etapes: [
        { texte: "La formule s'applique à la tension composée : $V_{d0} = \\frac{3\\sqrt{2}}{\\pi}U$." },
        { texte: "$V_{d0} = 1{,}3505 \\times 690 = 931{,}8\\ \\mathrm{V}$." },
        { texte: "Contrôle : $\\hat U = 975{,}8\\ \\mathrm{V}$ et $V_{d0}/\\hat U = 0{,}955$.", note: "Les diodes doivent tenir au moins deux fois 1073 V, crête au réseau haut : un calibre de 2200 V ou plus." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const crete = RAC2 * 690;
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension redressée sous 690 V",
          xTitre: "angle",
          xUnite: "°",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 360,
          yMin: 800,
          yMax: 1000,
          series: [{ id: "v", nom: "v_PN (trait plein)", couleur: "serie-1", epaisseur: 2.4, fonction: (x) => crete * enveloppeP(x, 6) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, (3 * crete) / Math.PI, "moyenne 931,8 V");
          },
        });
      },
    })
  );

  /* 2. Fondamental */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-diode-eff",
      titre: "Courant efficace d'une diode",
      niveau: "fondamental",
      enonce: "<p>Un pont à six diodes débite $I_d = 90\\ \\mathrm{A}$ parfaitement lissés. Quel est le courant efficace dans une diode, en ampères ? Donnez aussi, pour vous, son courant moyen.</p>",
      valeur: 90 / RAC3,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant efficace $I_{D,eff}$",
      etapes: [
        { texte: "Chaque diode conduit $I_d$ pendant $120^\\circ$ sur $360^\\circ$, soit un tiers du temps." },
        { texte: "Moyenne : $I_d/3 = 30\\ \\mathrm{A}$. Valeur efficace : $\\sqrt{I_d^2/3} = I_d/\\sqrt{3} = 51{,}96\\ \\mathrm{A}$." },
        { texte: "Pertes avec $V_{F0} = 0{,}85\\ \\mathrm{V}$ et $r_F = 5\\ \\mathrm{m\\Omega}$ : $0{,}85 \\times 30 + 0{,}005 \\times 51{,}96^2 = 39{,}0\\ \\mathrm{W}$.", note: "Ne pas confondre la valeur efficace d'une diode avec celle de la ligne, 0,816 I_d." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Courant de la diode D1 sur une période",
          xTitre: "angle",
          xUnite: "°",
          yTitre: "courant",
          yUnite: "A",
          xMin: 0,
          xMax: 360,
          yMin: -10,
          yMax: 110,
          series: [{ id: "i", nom: "i_D1 (trait plein)", couleur: "serie-1", epaisseur: 2.4, fonction: (x) => (x > 30 && x < 150 ? 90 : 0) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 30, "moyenne 30 A");
            ligneH(c, r, couleurs, 90 / RAC3, "efficace 51,96 A");
          },
        });
      },
    })
  );

  /* 3. Intermédiaire */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-commutation",
      titre: "Tension en charge avec empiètement",
      niveau: "intermédiaire",
      enonce:
        "<p>Un pont à diodes idéales est alimenté sous $400\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$, à travers une inductance de $0{,}5\\ \\mathrm{mH}$ par phase, sans résistance. Il débite $I_d = 100\\ \\mathrm{A}$ lissés. Quelle est la tension moyenne en charge, en volts ? Calculez aussi l'angle d'empiètement.</p>",
      valeur: (3 * RAC2 * 400) / Math.PI - 15,
      unite: "V",
      tolerance: 0.005,
      chiffres: 1,
      libelleChamp: "Tension moyenne $V_d$",
      etapes: [
        { texte: "Tension idéale : $V_{d0} = 1{,}3505 \\times 400 = 540{,}2\\ \\mathrm{V}$." },
        { texte: "Chute de commutation : $\\Delta V_x = 6fL_sI_d = 6 \\times 50 \\times 0{,}0005 \\times 100 = 15{,}0\\ \\mathrm{V}$, d'où $V_d = 525{,}2\\ \\mathrm{V}$." },
        { texte: "Empiètement : $\\cos\\mu = 1 - 2 \\times 0{,}157 \\times 100/565{,}7 = 0{,}9445$, $\\mu = 19{,}2^\\circ$.", note: "Méthode : la chute est une surface de tension X_s I_d répétée six fois par période." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const pts = [];
        for (let th = 0; th <= 120; th += 0.5) pts.push([th, etatPont(th * DEG, 400, 0.5e-3, 100).vs]);
        const traceur = traceCorrection(moteurApi, conteneur, {
          titre: "Tension redressée avec empiètement, deux sixièmes de période",
          xTitre: "angle",
          xUnite: "°",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 120,
          yMin: 440,
          yMax: 580,
          series: [{ id: "v", nom: "v_PN avec L_s = 0,5 mH (trait plein)", couleur: "serie-1", epaisseur: 2.4, points: pts }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 525.19, "moyenne 525,2 V");
            ligneV(c, r, couleurs, 30, "");
            ligneV(c, r, couleurs, 49.2, "fin de μ");
          },
        });
        if (traceur && traceur.definirDonnees) traceur.definirDonnees("v", pts);
      },
    })
  );

  /* 4. Intermédiaire */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-harmonique-5",
      titre: "Harmonique de rang 5 du courant de ligne",
      niveau: "intermédiaire",
      enonce:
        "<p>Un pont triphasé débite $I_d = 60\\ \\mathrm{A}$ lissés, sans empiètement. Choisissez la bonne méthode pour obtenir la valeur efficace de l'harmonique de rang 5 du courant de ligne, en ampères.</p>",
      valeur: ((Math.sqrt(6) / Math.PI) * 60) / 5,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Harmonique $I_5$",
      etapes: [
        { texte: "Le courant de ligne est un créneau de $120^\\circ$ : $I_1 = \\frac{\\sqrt{6}}{\\pi}I_d = 0{,}7797 \\times 60 = 46{,}78\\ \\mathrm{A}$." },
        { texte: "Pour ce créneau, $I_n = I_1/n$ aux rangs $6k \\pm 1$ : $I_5 = 46{,}78/5 = 9{,}36\\ \\mathrm{A}$, et $I_7 = 6{,}68\\ \\mathrm{A}$." },
        { texte: "Contrôle : $I_{eff} = \\sqrt{2/3} \\times 60 = 48{,}99\\ \\mathrm{A}$, à peine plus que $I_1$.", note: "Partir de I_d et non de I_eff : la loi en 1/n porte sur le fondamental." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const I1 = (Math.sqrt(6) / Math.PI) * 60;
        const rangs = [1, 5, 7, 11, 13];
        schemaCorrection(moteurApi, conteneur, "0 0 620 250", dessinSpectre(rangs, rangs.map((n) => I1 / n), "I_n en ampères pour I_d = 60 A"), "Spectre du courant de ligne : I_5 = 9,36 A.");
      },
    })
  );

  /* 5. Avancé */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-dimensionnement",
      titre: "Choisir la tension secondaire d'un redresseur",
      niveau: "avancé",
      enonce:
        "<p>Une charge exige $110\\ \\mathrm{V}$ continus sous $120\\ \\mathrm{A}$ lissés, même quand le réseau est à $-10\\ \\%$. Le pont est alimenté par un transformateur dont on connaît, par phase côté secondaire, $X_s = 25\\ \\mathrm{m\\Omega}$ et $R_s = 8\\ \\mathrm{m\\Omega}$ ; diodes $V_{F0} = 0{,}8\\ \\mathrm{V}$ et $r_F = 3\\ \\mathrm{m\\Omega}$. Quelle tension composée secondaire nominale faut-il prévoir, en volts ? On suppose $X_s$ et $R_s$ indépendants de ce choix.</p>",
      valeur: ((110 + (3 * 0.025 / Math.PI + 0.016 + 0.006) * 120 + 1.6) * Math.PI) / (3 * RAC2) / 0.9,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension secondaire nominale $U$",
      etapes: [
        { texte: "Résistance équivalente : $R_{eq} = 3 \\times 0{,}025/\\pi + 2 \\times 0{,}008 + 2 \\times 0{,}003 = 0{,}0239 + 0{,}016 + 0{,}006 = 0{,}0459\\ \\Omega$." },
        { texte: "Tension idéale nécessaire au réseau bas : $V_{d0} = 110 + 0{,}0459 \\times 120 + 2 \\times 0{,}8 = 110 + 5{,}50 + 1{,}60 = 117{,}10\\ \\mathrm{V}$." },
        { texte: "$U_{bas} = 117{,}10/1{,}3505 = 86{,}71\\ \\mathrm{V}$, d'où $U_{nom} = 86{,}71/0{,}9 = 96{,}35\\ \\mathrm{V}$." },
        { texte: "Contrôle de l'empiètement au réseau bas : $\\cos\\mu = 1 - 2 \\times 0{,}025 \\times 120/(\\sqrt{2} \\times 86{,}71) = 0{,}951$, $\\mu = 18{,}0^\\circ$.", note: "On choisirait un secondaire normalisé juste au-dessus, puis on vérifierait le courant et la tension au réseau haut." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const Req = (3 * 0.025) / Math.PI + 0.022;
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension en charge selon la tension secondaire réelle",
          xTitre: "tension secondaire réelle",
          xUnite: "V",
          yTitre: "V_d sous 120 A",
          yUnite: "V",
          xMin: 70,
          xMax: 110,
          yMin: 80,
          yMax: 150,
          series: [{ id: "vd", nom: "V_d = 1,3505 U - 1,6 - 0,0459 × 120 (trait plein)", couleur: "serie-1", epaisseur: 2.4, fonction: (u) => 1.3505 * u - 1.6 - Req * 120 }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 110, "110 V exigés");
            ligneV(c, r, couleurs, 86.71, "réseau bas 86,7 V");
            ligneV(c, r, couleurs, 96.35, "nominal 96,3 V");
          },
        });
      },
    })
  );

  /* 6. Diagnostic industriel */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Variateur arrêté en défaut d'ondulation du bus",
      niveau: "diagnostic",
      enonce:
        "<p>Le variateur de la pompe s'arrête sur un défaut d'ondulation du bus continu. L'enregistrement, fait avec une sonde différentielle, montre une ondulation de près de $60\\ \\mathrm{V}$ crête à crête qui se répète toutes les $10\\ \\mathrm{ms}$ ; la pince ampèremétrique indique un courant nul sur L3 et des courants égaux et opposés sur L1 et L2. Quelle est la cause la plus probable ?</p>",
      options: [
        "Une diode du pont est coupée",
        "Les condensateurs du bus ont perdu une partie de leur capacité",
        "Une phase est perdue en amont du pont, par exemple un fusible de L3 fondu",
        "Le réseau est légèrement déséquilibré",
      ],
      bonnes: [2],
      etapes: [
        { texte: "Une ondulation toutes les $10\\ \\mathrm{ms}$, c'est $100\\ \\mathrm{Hz}$ : le pont fonctionne comme un pont monophasé, alimenté par la seule tension $u_{12}$." },
        { texte: "Courant nul sur L3 et courants opposés sur L1 et L2 : la phase L3 n'est plus raccordée." },
        { texte: "Une diode coupée laisserait passer du courant sur les trois phases, avec un motif à $50\\ \\mathrm{Hz}$ ; des condensateurs vieillis augmenteraient l'ondulation à $300\\ \\mathrm{Hz}$ ; un léger déséquilibre ne donnerait qu'une petite composante à $100\\ \\mathrm{Hz}$.", note: "Contrôler les fusibles et le contacteur d'entrée avant tout remplacement du variateur." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const crete = RAC2 * 400;
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension redressée saine et avec une phase perdue, sans condensateur",
          xTitre: "angle",
          xUnite: "°",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 360,
          yMin: 0,
          yMax: 620,
          series: [
            { id: "sain", nom: "pont sain, 300 Hz (trait fin)", couleur: "serie-2", epaisseur: 1.6, fonction: (x) => crete * enveloppeP(x, 6) },
            { id: "def", nom: "phase L3 perdue, 100 Hz (trait épais)", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => crete * Math.abs(Math.sin((x + 30) * DEG)) },
          ],
        });
      },
    })
  );

  /* 7. Conceptuel */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Une chute de tension qui ne chauffe rien",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi l'inductance de la source fait baisser la tension moyenne d'un pont à diodes alors qu'elle ne dissipe aucune énergie, et ce que devient la puissance correspondante.</p>",
      motsCles: [["empietement", "commutation", "deux diodes", "court-circuit", "simultane"], ["moyenne", "surface", "volts", "demi-somme", "milieu"], ["dissipe", "pertes", "chauffe", "joule", "energie"], ["dephasage", "reactive", "retard", "cos", "facteur"]],
      minimum: 3,
      exemple: "Trois phrases : ce qui se passe pendant la commutation, ce que perd la tension, où passe la puissance.",
      etapes: [
        { texte: "Pendant l'empiètement, deux diodes du même groupe conduisent : deux phases sont en court-circuit à travers leurs inductances et la barre prend la demi-somme de leurs tensions." },
        { texte: "La tension redressée perd une surface $X_sI_d$ à chaque commutation, six fois par période : $\\Delta V = 3X_sI_d/\\pi$." },
        { texte: "L'inductance stocke puis restitue son énergie sans la dissiper ; le pont prend moins de puissance active parce que le courant de ligne s'est décalé de $\\mu/2$ environ : c'est de la puissance réactive, pas une perte.", note: "Une résistance, elle, ferait chuter la tension et chaufferait." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["empiètement : deux phases en court-circuit derrière L_s", "barre P = demi-somme : surface perdue X_s I_d", "six commutations : ΔV = 3 X_s I_d / π", "pas de pertes : courant décalé, cos φ1 < 1"], "Pourquoi la commutation fait chuter la tension sans dissiper.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const VISUELS_QUIZ = [
  etapes(["six morceaux de sinusoïde par période", "f_ondulation = 6 × 50 = 300 Hz", "P3 : 150 Hz ; pont monophasé : 100 Hz"], "Fréquence de l'ondulation d'un pont triphasé."),
  etapes(["chaque diode est la plus haute (ou la plus basse)", "pendant un tiers de période", "120° sur 360°, avec deux partenaires successifs"], "Durée de conduction d'une diode."),
  etapes(["V_d0 = 3 √2 U / π", "= 1,3505 × 400", "= 540,2 V"], "Tension moyenne idéale du pont."),
  etapes(["créneaux de 120° : symétrie de demi-onde", "rangs pairs nuls ; largeur de 120° : rangs 3k nuls", "trois fils : pas de courant homopolaire"], "Pourquoi il n'y a pas de rang 3."),
  etapes(["ΔV_x = 6 f L_s I_d", "= 6 × 50 × 0,0002 × 200", "= 12 V"], "Chute de commutation."),
  () => ({ viewBox: "0 0 680 310", dessin: dessinPontQuiz(nouveauMarqueur("fl-l-pq-c")) + ECRITS + texte(330, 296, "v_c la plus basse : D2 conduit avec D1") + "</g>", legende: "Entre 90 et 150 degrés, v_c est la plus basse : D2 conduit avec D1." }),
  etapes(["I_1 = √6 / π × I_d ; I_eff = √(2/3) × I_d", "λ = I_1 / I_eff = 3 / π", "= 0,955, avec cos φ1 = 1"], "Facteur de puissance d'un pont à courant lissé."),
  etapes(["pendant μ : deux phases en court-circuit derrière L_s", "énergie stockée puis restituée", "chute de tension sans pertes Joule"], "La commutation ne dissipe pas."),
  etapes(["tension inverse maximale = crête de U", "√2 × 440 V (réseau + 10 %)", "= 622,3 V"], "Tension inverse au réseau haut."),
  etapes(["créneau de 120° sans composante continue", "rangs 6k ± 1 : 5, 7, 11, 13", "amplitudes I_1 / n"], "Rangs harmoniques du courant de ligne."),
];

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Un pont à six diodes est alimenté par le réseau à $50\\ \\mathrm{Hz}$. À quelle fréquence la tension redressée ondule-t-elle ?</p>",
        options: ["$100\\ \\mathrm{Hz}$", "$150\\ \\mathrm{Hz}$", "$300\\ \\mathrm{Hz}$", "$600\\ \\mathrm{Hz}$"],
        bonnes: [2],
        explication: "Six morceaux de sinusoïde par période : $6f = 300\\ \\mathrm{Hz}$. Le P3 ondule à $150\\ \\mathrm{Hz}$, le douze impulsions à $600\\ \\mathrm{Hz}$.",
        resume: "Fréquence d'ondulation",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Dans un pont à six diodes en courant lissé, chaque diode conduit pendant $120^\\circ$ par période.</p>",
        reponse: true,
        explication: "Une phase est la plus haute pendant un tiers de période : $D_1$ conduit de $30$ à $150^\\circ$, d'abord avec $D_6$ puis avec $D_2$.",
        resume: "Durée de conduction",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Tension moyenne d'un pont à six diodes idéales sur un réseau de $400\\ \\mathrm{V}$ entre phases, en volts ?</p>",
        valeur: (3 * RAC2 * 400) / Math.PI,
        unite: "V",
        tolerance: 0.01,
        explication: "$V_{d0} = 3\\sqrt{2} \\times 400/\\pi = 540{,}2\\ \\mathrm{V}$.",
        resume: "Tension moyenne",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi le courant de ligne d'un pont triphasé à courant lissé ne contient-il pas d'harmonique de rang 3 ?</p>",
        motsCles: [["120", "tiers", "largeur", "creneau"], ["trois fils", "neutre", "homopolaire", "somme nulle"], ["symetrie", "annule", "nul", "absent"]],
        minimum: 2,
        explication: "Le créneau dure exactement $120^\\circ$, largeur qui annule les rangs multiples de 3 ; physiquement, sans neutre, la somme des trois courants est nulle et aucun courant homopolaire ne peut circuler.",
        resume: "Absence de rang 3",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Un pont débite $200\\ \\mathrm{A}$ lissés à $50\\ \\mathrm{Hz}$ ; l'inductance de la source vaut $0{,}2\\ \\mathrm{mH}$ par phase. Chute de tension moyenne due à la commutation, en volts ?</p>",
        valeur: 12,
        unite: "V",
        tolerance: 0.01,
        explication: "$\\Delta V_x = 6fL_sI_d = 300 \\times 0{,}0002 \\times 200 = 12\\ \\mathrm{V}$.",
        resume: "Chute de commutation",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>À $\\theta = 120^\\circ$, $v_a$ est la plus haute des trois tensions et $D_1$ conduit. Quelle diode du groupe du bas conduit en même temps ?</p>",
        consigne: "Cliquez sur la diode correspondante.",
        viewBox: "0 0 680 310",
        dessin: dessinPontQuiz("fl-l-pq"),
        zones: ZONES_PONT,
        explication: "À $120^\\circ$, $v_c = \\hat V\\sin(-120^\\circ)$ est la plus basse : la diode du bas de la phase $c$, $D_2$, conduit. La charge reçoit $u_{ac}$.",
        resume: "Lecture du pont",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Quel est le facteur de puissance d'un pont à six diodes en courant parfaitement lissé, sans empiètement ?</p>",
        options: ["$1{,}000$", "$0{,}955$", "$0{,}900$", "$0{,}827$"],
        bonnes: [1],
        explication: "$\\lambda = I_1/I_{eff} = (\\sqrt{6}/\\pi)/\\sqrt{2/3} = 3/\\pi = 0{,}955$, avec un fondamental en phase.",
        resume: "Facteur de puissance",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>La chute de tension due à la commutation correspond à des pertes Joule dans les inductances de la source.</p>",
        reponse: false,
        explication: "Une inductance ne dissipe rien : l'énergie stockée est restituée. La chute traduit un déphasage du courant, donc de la puissance réactive.",
        resume: "Commutation sans pertes",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Tension inverse maximale d'une diode d'un pont triphasé au réseau haut, $440\\ \\mathrm{V}$ entre phases, en volts ?</p>",
        valeur: RAC2 * 440,
        unite: "V",
        tolerance: 0.01,
        explication: "Une diode bloquée voit toute la tension redressée : $\\hat U = \\sqrt{2} \\times 440 = 622{,}3\\ \\mathrm{V}$.",
        resume: "Tension inverse",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Quels rangs harmoniques contient le courant de ligne d'un pont à six diodes en courant lissé ?</p>",
        options: ["$3, 5, 7, 9$", "$2, 4, 6, 8$", "$5, 7, 11, 13$", "$6, 12, 18$"],
        bonnes: [2],
        explication: "Rangs $6k \\pm 1$, d'amplitude $I_1/n$. Les rangs multiples de 6 sont ceux de la tension redressée, pas du courant de ligne.",
        resume: "Rangs harmoniques",
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
      { categorie: "Principe", question: "Que font les deux groupes de diodes d'un pont triphasé ?", reponse: "Le groupe du haut porte P à la plus haute des trois tensions, celui du bas porte N à la plus basse : la charge reçoit la plus grande des six tensions composées." },
      { categorie: "Formule", question: "Tension moyenne d'un pont à six diodes ?", reponse: "$V_{d0} = \\frac{3\\sqrt{2}}{\\pi}U = 1{,}35\\,U = 2{,}34\\,V$ : $540{,}2\\ \\mathrm{V}$ sur un réseau de $400\\ \\mathrm{V}$." },
      { categorie: "Formule", question: "Tension moyenne d'un montage à trois impulsions ?", reponse: "$V_{d0} = \\frac{3\\sqrt{3}}{2\\pi}\\hat V = 1{,}17\\,V$, avec un courant de phase unidirectionnel." },
      { categorie: "Ondulation", question: "Ondulation d'un pont triphasé ?", reponse: "À $6f = 300\\ \\mathrm{Hz}$, entre $\\hat U\\cos 30^\\circ$ et $\\hat U$ : $13{,}4\\ \\%$ de la crête ; rang 6 à $5{,}7\\ \\%$ de la moyenne." },
      { categorie: "Diodes", question: "Contraintes d'une diode du pont ?", reponse: "Conduction $120^\\circ$ ; $I_d/3$ moyens, $I_d/\\sqrt{3}$ efficaces ; tension inverse $\\hat U = \\sqrt{2}\\,U$, à prendre au réseau haut avec une marge." },
      { categorie: "Réseau", question: "Courant de ligne en courant lissé ?", reponse: "Créneau de $120^\\circ$ : $I_{eff} = 0{,}816\\,I_d$, $I_1 = 0{,}780\\,I_d$, rangs $6k \\pm 1$ en $1/n$, $\\lambda = 3/\\pi = 0{,}955$." },
      { categorie: "Commutation", question: "Qu'est-ce que l'empiètement ?", reponse: "L'intervalle $\\mu$ pendant lequel deux diodes d'un même groupe conduisent : deux phases en court-circuit derrière $L_s$, barre à la demi-somme.", rappel: "$\\cos\\mu = 1 - 2X_sI_d/\\hat U$." },
      { categorie: "Commutation", question: "Chute de tension due à la commutation ?", reponse: "$\\Delta V_x = 3X_sI_d/\\pi = 6fL_sI_d$ : surface $X_sI_d$ perdue six fois par période, sans pertes Joule." },
      { categorie: "Modèle", question: "Modèle de Thévenin du pont chargé ?", reponse: "$V_d = 1{,}35\\,U - 2V_{F0} - (3X_s/\\pi + 2R_s + 2r_F)\\,I_d$." },
      { categorie: "Diagnostic", question: "Que signale une ondulation du bus à 100 Hz ?", reponse: "Une perte de phase : le pont fonctionne en monophasé. Un motif à $50\\ \\mathrm{Hz}$ signale plutôt une diode coupée." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["Û = √2 × 400 = 565,7 V", "creux = Û cos 30° = 489,9 V", "Δv = 565,7 - 489,9 = 75,8 V"], "Ondulation crête à crête du pont."),
  etapes(["v_P = max(v_a, v_b, v_c) ; v_N = min", "creux de v_P et de v_N décalés de 60°", "v_PN = v_P - v_N : six impulsions"], "Le pont comme deux montages P3."),
  etapes(["L_s plus grande : μ plus grand", "ΔV_x = 6 f L_s I_d plus grande", "encoches amont moins profondes"], "Effet d'une self de ligne."),
  etapes(["C = I / (2 f ΔV)", "= 3 / (2 × 50 × 2)", "= 15 mF"], "Capacité de filtrage d'un pont monophasé."),
  etapes(["créneau ± I_d : I_eff = I_d", "I_1 = 2√2 / π × I_d", "λ = 0,900"], "Facteur de puissance du pont monophasé à courant lissé."),
  etapes(["P_jr = g P_tr", "= 0,02 × 20 000", "= 400 W"], "Pertes Joule au rotor."),
  etapes(["V_eff² = V_0² + V_6²/2", "= 540,19² + 30,87² / 2", "V_eff = 540,63 V"], "Valeur efficace d'un signal composé."),
];

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Ondulation crête à crête de la tension d'un pont à six diodes idéales, réseau de $400\\ \\mathrm{V}$, sans condensateur, en volts ?</p>",
        valeur: RAC2 * 400 * (1 - Math.cos(Math.PI / 6)),
        unite: "V",
        tolerance: 0.01,
        explication: "$\\Delta v = \\hat U(1 - \\cos 30^\\circ) = 565{,}7 \\times 0{,}134 = 75{,}8\\ \\mathrm{V}$.",
        resume: "Ondulation du pont",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Un pont à six diodes équivaut à deux montages à trois impulsions en série, dont les creux sont décalés de $60^\\circ$.</p>",
        reponse: true,
        explication: "$v_P$ suit la plus haute des tensions simples, $v_N$ la plus basse ; leurs creux sont décalés de $60^\\circ$, d'où six impulsions par période.",
        resume: "Deux montages P3",
      },
      {
        type: "qcm",
        enonce: repere(2) + "<p>Cette séance. On ajoute une self de ligne devant le pont d'un variateur. Quel ensemble d'effets est juste ?</p>",
        options: [
          "Empiètement plus long, tension moyenne plus basse, encoches au tableau moins profondes",
          "Empiètement plus court, tension moyenne plus haute, encoches plus profondes",
          "Aucun effet sur la tension, seulement sur les harmoniques",
          "Pertes Joule égales à la chute de commutation multipliée par le courant",
        ],
        bonnes: [0],
        explication: "$L_s$ augmente : $\\mu$ et $6fL_sI_d$ augmentent ; la part de l'inductance en amont du tableau, $L_T/L_s$, diminue, donc les encoches vues au tableau sont moins profondes.",
        resume: "Effet d'une self de ligne",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Redresseurs monophasés. Un pont de Graetz à $50\\ \\mathrm{Hz}$ alimente $3\\ \\mathrm{A}$ constants ; capacité, en millifarads, pour une ondulation de $2\\ \\mathrm{V}$ selon la formule simplifiée ?</p>",
        valeur: 15,
        unite: "mF",
        tolerance: 0.01,
        explication: "$C = I/(2f\\Delta V) = 3/(100 \\times 2) = 15\\ \\mathrm{mF}$.",
        resume: "Capacité de filtrage",
      },
      {
        type: "vraiFaux",
        enonce: repere(4) + "<p>Cours Redresseurs monophasés. Un pont de Graetz monophasé qui débite un courant parfaitement lissé a un facteur de puissance de $0{,}90$.</p>",
        reponse: true,
        explication: "Courant de source en créneaux $\\pm I_d$ : $I_1 = 2\\sqrt{2}I_d/\\pi$, $I_{eff} = I_d$, $\\lambda = 0{,}900$, contre $0{,}955$ pour le pont triphasé.",
        resume: "Facteur de puissance monophasé",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Schéma équivalent du moteur asynchrone. La puissance transmise au rotor vaut $20\\ \\mathrm{kW}$ et le glissement $2\\ \\%$. Pertes Joule au rotor, en watts ?</p>",
        valeur: 400,
        unite: "W",
        tolerance: 0.01,
        explication: "Le découpage de $R_2'/g$ donne $P_{jr} = g\\,P_{tr} = 0{,}02 \\times 20\\,000 = 400\\ \\mathrm{W}$.",
        resume: "Pertes rotoriques",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Signaux périodiques et sinusoïdes. Une tension se compose d'une valeur moyenne de $540{,}19\\ \\mathrm{V}$ et d'une sinusoïde de $30{,}87\\ \\mathrm{V}$ d'amplitude à $300\\ \\mathrm{Hz}$. Valeur efficace, en volts ?</p>",
        valeur: Math.sqrt(540.19 * 540.19 + (30.87 * 30.87) / 2),
        unite: "V",
        tolerance: 0.0005,
        explication: "Les carrés s'ajoutent : $V_{eff} = \\sqrt{540{,}19^2 + 30{,}87^2/2} = 540{,}63\\ \\mathrm{V}$, à peine plus que la moyenne : c'est la tension d'un pont triphasé réduite à son rang 6.",
        resume: "Valeur efficace composée",
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
    titre: "Où en suis-je sur les redresseurs triphasés ?",
  });
  if (auto) ressources.push(auto);
}
