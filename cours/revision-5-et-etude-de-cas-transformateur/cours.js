/* ==========================================================================
   cours/revision-5-et-etude-de-cas-transformateur/cours.js
   Révision 5 et étude de cas transformateur : ampères-tours compensés,
   courant magnétisant et saturation, diagramme de Kapp, courant
   d'enclenchement, chaîne de la plaque au schéma équivalent, et fiche du
   transformateur du poste du site.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];
let compteurMarqueurs = 0;

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const RAC2 = Math.SQRT2;
const RAC3 = Math.sqrt(3);
const MU0 = 4e-7 * Math.PI;
const OMEGA = 2 * Math.PI * 50;

/* Transformateur du poste T1 : 100 kVA, 20 kV / 410 V, Dyn11, valeurs du procès-verbal. */
const T1 = {
  S: 100e3,
  U1: 20e3,
  U20: 410,
  Rcc: 29.26e-3,
  Xcc: 61.49e-3,
  i0: 0.0156,
  cos0: 0.127,
  N1: 4393,
  N2: 52,
};
T1.I2n = T1.S / (RAC3 * T1.U20);
T1.I1w = T1.S / (3 * T1.U1);
T1.V20 = T1.U20 / RAC3;

/* Enclenchement d'un enroulement haute tension de T1 : hypothèses de construction. */
const ENCL = {
  N: 4393,
  U: 20e3,
  Bn: 1.6,
  Bk: 1.9,
  R: 80.4,
  D: 0.25,
  h: 0.32,
  kN: 0.74,
  Xm: 774.5e3,
};
ENCL.lm = (RAC2 * ENCL.U) / OMEGA;
ENCL.A = ENCL.lm / (ENCL.N * ENCL.Bn);
ENCL.Lair = (MU0 * ENCL.N * ENCL.N * (Math.PI * ENCL.D * ENCL.D) / 4 * ENCL.kN) / ENCL.h;
ENCL.Lm = ENCL.Xm / OMEGA;
ENCL.lk = ENCL.N * ENCL.A * ENCL.Bk;

/* Exemple de la section H : 400 kVA. */
const EX = { S: 400e3, U20: 410, ucc: 0.04, Pcc: 4600, P0: 610, i0: 0.013, Scc: 250e6 };

/* --------------------------------------------------------------------------
   Utilitaires
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

function nouveauMarqueur(prefixe) {
  compteurMarqueurs += 1;
  return prefixe + "-" + compteurMarqueurs;
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

function segment(x0, y0, x1, y1) {
  return "M" + x0.toFixed(1) + " " + y0.toFixed(1) + "L" + x1.toFixed(1) + " " + y1.toFixed(1);
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';

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
    echantillons: 300,
    ...options,
  });
  if (traceur) ressources.push(traceur);
  return traceur;
}

/** Schéma annoté inséré dans une correction, tracé progressivement. */
function schemaCorrection(moteur, conteneur, viewBox, dessin, legende) {
  const figure = document.createElement("figure");
  figure.className = "visuel-correction";
  const svg = svgEl("svg", { viewBox, role: "img", "aria-label": legende });
  svg.innerHTML = dessin;
  figure.appendChild(svg);
  const texteLegende = document.createElement("figcaption");
  texteLegende.textContent = legende;
  figure.appendChild(texteLegende);
  conteneur.appendChild(figure);
  const trace = moteur.dessiner(svg, { duree: 1.4 });
  if (trace) ressources.push(trace);
  return figure;
}

/** Lignes de texte révélées une à une, dans un cadre. */
function dessinEtapes(lignes, largeur = 560) {
  const hauteur = 30 + lignes.length * 22;
  return (
    TRAITS + ' stroke-width="1.4"><rect x="6" y="6" width="' + (largeur - 12) + '" height="' + (hauteur - 12) + '" rx="8"/></g>' +
    ECRITS + lignes.map((ligne, i) => texte(22, 32 + i * 22, ligne)).join("") + "</g>"
  );
}

/** Barres horizontales annotées : [{ nom, valeur, max, texte }]. */
function dessinBarres(barres, options = {}) {
  const x0 = options.x0 || 190;
  const l = options.l || 300;
  let traits = "";
  let pleins = "";
  let ecrits = "";
  barres.forEach((barre, i) => {
    const y = 26 + i * 40;
    const w = Math.max(1, Math.min(1.25, Math.abs(barre.valeur) / barre.max) * l);
    pleins += '<rect x="' + x0 + '" y="' + y + '" width="' + w.toFixed(1) + '" height="18" rx="2"/>';
    traits += "M" + (x0 + l) + " " + (y - 6) + "V" + (y + 24);
    ecrits += texte(10, y + 14, barre.nom) + texte(x0 + w + 8, y + 14, barre.texte);
  });
  return (
    '<g fill="currentColor" fill-opacity="0.28" stroke="currentColor" stroke-width="1.4">' + pleins + "</g>" +
    TRAITS + ' stroke-width="1.2" stroke-dasharray="4 4"><path d="' + traits + '"/></g>' +
    ECRITS + ecrits + (options.pied ? texte(10, 26 + barres.length * 40 + 8, options.pied) : "") + "</g>"
  );
}

/**
 * Diagramme de Kapp agrandi : V2 horizontal, chute R I parallèle au courant,
 * chute X I perpendiculaire, V20 et son arc. Tensions en volts, phi en degrés.
 */
function dessinKapp(V2, RI, XI, phiDeg, options = {}) {
  const id = nouveauMarqueur("fl-kapp");
  const s = options.echelle || 12;
  const pointe = { x: options.x || 300, y: options.y || 140 };
  const O = { x: pointe.x - s * V2, y: pointe.y };
  const phi = phiDeg * DEG;
  const a = { x: pointe.x + s * RI * Math.cos(phi), y: pointe.y + s * RI * Math.sin(phi) };
  const b = { x: a.x + s * XI * Math.sin(phi), y: a.y - s * XI * Math.cos(phi) };
  const rayon = Math.hypot(b.x - O.x, b.y - O.y);
  const pente = (b.y - O.y) / (b.x - O.x);
  const yBord = O.y + pente * (20 - O.x);
  const yh = 30;
  const yb = 250;
  const xh = O.x + Math.sqrt(rayon * rayon - (yh - O.y) * (yh - O.y));
  const xb = O.x + Math.sqrt(rayon * rayon - (yb - O.y) * (yb - O.y));
  return (
    "<defs>" + marqueur(id) + "</defs>" +
    TRAITS + ' stroke-width="3"><path d="' + segment(20, pointe.y, pointe.x, pointe.y) + '" marker-end="url(#' + id + ')"/></g>' +
    TRAITS + ' stroke-width="1.6"><path d="' + segment(20, yBord, b.x, b.y) + '" marker-end="url(#' + id + ')"/></g>' +
    TRAITS + ' stroke-width="2.2"><path d="' + segment(pointe.x, pointe.y, a.x, a.y) + '" marker-end="url(#' + id + ')"/></g>' +
    TRAITS + ' stroke-width="2.2" stroke-dasharray="7 4"><path d="' + segment(a.x, a.y, b.x, b.y) + '" marker-end="url(#' + id + ')"/></g>' +
    TRAITS + ' stroke-width="1.2" stroke-dasharray="2 4"><path d="M' + xh.toFixed(1) + " " + yh + "A" + rayon.toFixed(1) + " " + rayon.toFixed(1) + " 0 0 1 " + xb.toFixed(1) + " " + yb + '"/></g>' +
    ECRITS +
    texte(40, pointe.y - 10, options.lV2 || "V2") +
    texte(40, yBord - 10, options.lV20 || "V20") +
    texte(Math.min(a.x, pointe.x) - 10, Math.max(a.y, pointe.y) + 20, options.lR || "R I") +
    texte(Math.max(a.x, b.x) + 10, (a.y + b.y) / 2, options.lX || "X I") +
    (options.pied || []).map((ligne, i) => texte(20, 274 + i * 18, ligne)).join("") +
    "</g>"
  );
}

/** Petit schéma de Kapp chiffré pour les questions de lecture de schéma. */
function dessinCircuitKapp() {
  return (
    TRAITS + ' stroke-width="2"><path d="M30 50H90M30 50V62M90 50V62M30 112V140M90 112V140M30 140H230M90 50H230M230 50V62M230 128V140"/>' +
    '<rect x="22" y="62" width="16" height="50" rx="2"/>' +
    '<path d="M90 62a8 8 0 0 1 0 12a8 8 0 0 1 0 12a8 8 0 0 1 0 12a8 8 0 0 1 0 12"/>' +
    '<path d="M230 62a9 9 0 0 1 0 16a9 9 0 0 1 0 16a9 9 0 0 1 0 16a9 9 0 0 1 0 16M262 62a9 9 0 0 0 0 16a9 9 0 0 0 0 16a9 9 0 0 0 0 16a9 9 0 0 0 0 16"/>' +
    '<path d="M242 58V132M250 58V132" stroke-width="1.5"/>' +
    '<path d="M262 50V62M262 128V140M262 50H320M370 50H400M448 50H500M262 140H500M500 50V70M500 120V140"/>' +
    '<rect x="320" y="42" width="50" height="16" rx="2"/>' +
    '<path d="M400 50a8 8 0 0 1 16 0a8 8 0 0 1 16 0a8 8 0 0 1 16 0"/>' +
    '<rect x="490" y="70" width="20" height="50" rx="2"/></g>' +
    ECRITS + texte(4, 92, "Rf") + texte(104, 92, "Xm") + texte(232, 162, "m") + texte(326, 34, "Rcc") + texte(410, 34, "Xcc") + texte(518, 100, "Z") + "</g>"
  );
}

/* --------------------------------------------------------------------------
   Modèles
   -------------------------------------------------------------------------- */

/** Tension simple en charge, résolution exacte : V20 imposée, courant I sous phi (rad, > 0 inductif). */
function v2Exacte(V20, R, X, I, phi) {
  const a = R * I * Math.cos(phi) + X * I * Math.sin(phi);
  const b = X * I * Math.cos(phi) - R * I * Math.sin(phi);
  return Math.sqrt(Math.max(0, V20 * V20 - b * b)) - a;
}

/** Courbe d'aimantation sans hystérésis du noyau de l'animation : H (A/m) en fonction de B (T). */
function champ(B) {
  return B / (MU0 * 20000) + 0.1954 * Math.pow(B, 13);
}

/** Intégration de l'enclenchement d'un enroulement : dlambda/dt = v - R i(lambda). */
function simulerEnclenchement(alphaDeg, br, duree = 1, dt = 5e-5) {
  const alpha = alphaDeg * DEG;
  let lambda = br * ENCL.N * ENCL.A * ENCL.Bn;
  const n = Math.round(duree / dt);
  const parPeriode = Math.round(0.02 / dt);
  const t = [];
  const b = [];
  const i = [];
  const cretes = [];
  let crete = 0;
  let bMax = Math.abs(lambda) / (ENCL.N * ENCL.A);
  for (let k = 0; k < n; k += 1) {
    const temps = k * dt;
    const v = RAC2 * ENCL.U * Math.sin(OMEGA * temps + alpha);
    const al = Math.abs(lambda);
    const courant = lambda / ENCL.Lm + (al > ENCL.lk ? Math.sign(lambda) * (al - ENCL.lk) / ENCL.Lair : 0);
    if (temps <= 0.2 + 1e-9 && k % 2 === 0) {
      t.push(temps * 1000);
      b.push(lambda / (ENCL.N * ENCL.A));
      i.push(courant);
    }
    if (k < parPeriode) bMax = Math.max(bMax, Math.abs(lambda) / (ENCL.N * ENCL.A));
    crete = Math.max(crete, Math.abs(courant));
    if ((k + 1) % parPeriode === 0) {
      cretes.push(crete);
      crete = 0;
    }
    lambda += (v - ENCL.R * courant) * dt;
  }
  /* Harmonique 2 sur la première période, transformée discrète. */
  let re1 = 0;
  let im1 = 0;
  let re2 = 0;
  let im2 = 0;
  const pas = 2;
  const m = parPeriode / pas;
  for (let j = 0; j < m; j += 1) {
    const x = i[j];
    const angle = (TAU * j) / m;
    re1 += x * Math.cos(angle);
    im1 += x * Math.sin(angle);
    re2 += x * Math.cos(2 * angle);
    im2 += x * Math.sin(2 * angle);
  }
  const h1 = Math.hypot(re1, im1);
  const h2 = Math.hypot(re2, im2);
  return { t, b, i, cretes, bMax, h2: h1 > 1e-9 ? h2 / h1 : 0 };
}

/** Modèle complet d'un transformateur de distribution à partir de valeurs relatives. */
function modeleTransfo(p) {
  const S = p.S;
  const U = 410;
  const I2n = S / (RAC3 * U);
  const Zb = (U * U) / S;
  const Zcc = p.ucc * Zb;
  const ur = p.pcc;
  const ux = Math.sqrt(Math.max(0, p.ucc * p.ucc - ur * ur));
  const Rcc = ur * Zb;
  const Xcc = ux * Zb;
  const P0 = p.p0 * S;
  const Pcc = p.pcc * S;
  const S0 = p.i0 * S;
  const Q0 = Math.sqrt(Math.max(1e-9, S0 * S0 - P0 * P0));
  const Rf = (U * U) / P0;
  const Xm = (U * U) / Q0;
  const Xa = (U * U) / EX.Scc;
  const Ik = U / (RAC3 * Math.hypot(Rcc, Xcc + Xa));
  const bopt = Math.sqrt(P0 / Pcc);
  return { S, U, I2n, Zb, Zcc, ur, ux, Rcc, Xcc, P0, Pcc, Rf, Xm, Ik, bopt };
}

function rendement(m, beta, cosphi) {
  const P2 = beta * m.S * cosphi;
  if (P2 <= 0) return 0;
  return P2 / (P2 + m.P0 + beta * beta * m.Pcc);
}

function tensionEnCharge(m, beta, cosphi, signe) {
  const phi = signe * Math.acos(Math.min(1, Math.max(0, cosphi)));
  const V20 = m.U / RAC3;
  return RAC3 * v2Exacte(V20, m.Rcc, m.Xcc, beta * m.I2n, phi);
}

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeursAnimation = [];
  compteurMarqueurs = 0;

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireAnimAmperesTours(racine, api);
  construireAnimMagnetisant(racine, api);
  construireAnimKapp(racine, api);
  construireSimEnclenchement(racine, api);
  construireSimPlaque(racine, api);
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
    ["#d-noyau-figure svg", 1.7],
    ["#e-schema-figure svg", 1.9],
    ["#f-schema-principal svg", 2],
    ["#h-kapp-figure svg", 1.5],
    ["#i-poste-figure svg", 1.6],
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
    schemaCorrection(api, conteneur, visuel.viewBox, visuel.dessin, visuel.legende);
  });
  observateur.observe(bloc, { childList: true, subtree: true });
  nettoyeursAnimation.push(() => observateur.disconnect());
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  const Bm = T1.V20 / (4.44 * 50 * T1.N2 * 0.0128);
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-boucherot",
      titre: "Induction imposée par la tension",
      niveau: "prérequis",
      enonce:
        "<p>L'enroulement basse tension d'une colonne, en étoile, compte $52$ spires et porte la tension simple $236{,}7\\ \\mathrm{V}$ à " +
        "$50\\ \\mathrm{Hz}$. La section nette du fer vaut $128\\ \\mathrm{cm^2}$. Quelle est l'induction crête dans le noyau ?</p>",
      valeur: Bm,
      unite: "T",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Induction crête $B_{max}$",
      etapes: [
        { texte: "Relation de Boucherot : $V = 4{,}44\\,f\\,N\\,A\\,B_{max}$, donc $B_{max} = V/(4{,}44\\,f\\,N\\,A)$." },
        { texte: "$B_{max} = 236{,}7/(4{,}44 \\times 50 \\times 52 \\times 0{,}0128) = 236{,}7/147{,}8 = 1{,}60\\ \\mathrm{T}$." },
        { texte: "Contrôle : une induction de $1{,}5$ à $1{,}7\\ \\mathrm{T}$ est la plage usuelle des tôles à grains orientés, sous le genou de saturation.", note: "Le même noyau sous $10\\ \\%$ de surtension travaillerait à $1{,}76\\ \\mathrm{T}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 140",
          dessinEtapes(["V = 4,44 f N A Bmax", "Bmax = 236,7 / (4,44 × 50 × 52 × 0,0128)", "     = 236,7 / 147,8 = 1,60 T", "plage usuelle : 1,5 à 1,7 T"], 540),
          "Calcul de l'induction crête, étapes révélées une à une."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-impedance-ramenee",
      titre: "Impédance vue du primaire",
      niveau: "prérequis",
      enonce:
        "<p>Une impédance de $5\\ \\Omega$ par phase est branchée au secondaire d'un transformateur de rapport $m = 0{,}0205$. " +
        "Quelle impédance par phase voit le réseau haute tension, en kilohms ?</p>",
      valeur: 5 / (0.0205 * 0.0205) / 1000,
      unite: "kΩ",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Impédance vue du primaire",
      etapes: [
        { texte: "Vue du primaire, une impédance du secondaire est divisée par $m^2$." },
        { texte: "$1/m^2 = 1/0{,}0205^2 = 2380$, donc $Z' = 5 \\times 2380 = 11\\,898\\ \\Omega = 11{,}9\\ \\mathrm{k\\Omega}$." },
        { texte: "Contrôle : un abaisseur grossit les impédances basse tension vues de la haute tension ; un résultat inférieur à $5\\ \\Omega$ signalerait une division au lieu d'une multiplication." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 600 150",
          dessinBarres(
            [
              { nom: "côté BT", valeur: 5, max: 11898, texte: "5 Ω" },
              { nom: "vue de la HT", valeur: 11898, max: 11898, texte: "11,9 kΩ = 5 / m²" },
            ],
            { x0: 130, l: 320, pied: "échelle commune : la barre BT est à peine visible" }
          ),
          "Transfert d'impédance à travers un transformateur abaisseur : multiplication par 1/m² = 2380."
        );
      },
    })
  );

  ressources.push(
    api.exercice.qcm("#c-minitest", {
      id: "c-dyn11",
      titre: "Lecture du groupe Dyn11",
      niveau: "prérequis",
      enonce: "<p>Quelles affirmations sur un transformateur Dyn11 sont exactes ?</p>",
      options: [
        { texte: "L'enroulement haute tension est en triangle.", juste: true },
        { texte: "Le neutre de l'étoile basse tension est sorti.", juste: true },
        { texte: "La tension basse tension est en avance de $30$ degrés sur la tension haute tension homologue.", juste: true },
        { texte: "Le rapport des spires est égal au rapport des tensions de plaque." },
      ],
      etapes: [
        { texte: "La majuscule D désigne le triangle haute tension, la minuscule y l'étoile basse tension, et n le neutre sorti." },
        { texte: "L'indice $11$ donne un retard de $11 \\times 30 = 330$ degrés, soit une avance de $30$ degrés." },
        { texte: "Le triangle porte la tension entre phases, l'étoile la tension simple : $N_2/N_1 = m/\\sqrt{3}$, différent de $m$.", note: "C'est la première erreur de la section J." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 140",
          dessinEtapes(["D : triangle HT, porte U1 = 20 kV", "y : étoile BT, porte U20 / √3 = 236,7 V", "n : neutre BT sorti", "11 : BT en avance de 30°"], 540),
          "Lecture des lettres et de l'indice du groupe Dyn11."
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : les ampères-tours se compensent
   -------------------------------------------------------------------------- */

function construireAnimAmperesTours(racine, api) {
  const conteneur = racine.querySelector("#d-at");
  if (!conteneur) return;
  const etat = { beta: 0.65, wt: 90 };
  const phi0 = Math.acos(T1.cos0);
  const phiCharge = Math.acos(0.985);
  const AT0 = T1.N1 * T1.i0 * T1.I1w;
  const ATn = T1.N2 * T1.I2n;
  const X0 = 300;
  const ECH = 300 / 12500;
  const LOUPE = 20;

  const svg = svgEl("svg", {
    viewBox: "0 0 720 280",
    role: "img",
    "aria-label": "Ampères-tours instantanés du primaire, du secondaire changé de signe, et leur somme qui magnétise le noyau, pour le transformateur du poste",
  });
  const fixes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.2 });
  fixes.innerHTML = '<path d="M' + X0 + ' 30V250"/><path d="M' + (X0 - 300) + " 250H" + (X0 + 300) + '" stroke-dasharray="3 4"/>';
  const barres = svgEl("g", { stroke: "currentColor", "stroke-width": 1.6 });
  const hachures = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1 });
  const ecrits = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  ecrits.innerHTML =
    texte(10, 24, "N1 i1, primaire") + texte(10, 104, "- N2 i2, secondaire") + texte(10, 184, "N1 i0 = somme, agrandie 20 fois") +
    texte(X0 + 6, 268, "zéro") + texte(X0 - 300, 268, "-12 500") + texte(X0 + 240, 268, "+12 500 At");
  const valeursTexte = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(fixes, barres, hachures, ecrits, valeursTexte);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-at-valeurs", [
    { id: "beta", libelle: "Taux de charge β", decimales: 2 },
    { id: "i2", libelle: "I2, phase BT", unite: "A", decimales: 1 },
    { id: "at2", libelle: "N2 I2 efficaces", unite: "At", decimales: 0 },
    { id: "at1", libelle: "N1 I1 efficaces", unite: "At", decimales: 0 },
    { id: "at0", libelle: "N1 I0 efficaces", unite: "At", decimales: 1 },
    { id: "i1", libelle: "I1, enroulement HT", unite: "A", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function barre(y, valeur, style) {
    const w = valeur * ECH;
    const x = w >= 0 ? X0 : X0 + w;
    return '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' + Math.max(0.5, Math.abs(w)).toFixed(1) + '" height="34" rx="2" ' + style + "/>";
  }

  function dessiner() {
    const wt = etat.wt * DEG;
    const at2 = etat.beta * ATn;
    const n2i2 = RAC2 * at2 * Math.sin(wt - phiCharge);
    const n1i0 = RAC2 * AT0 * Math.sin(wt - phi0);
    const n1i1 = n2i2 + n1i0;
    barres.innerHTML =
      barre(32, n1i1, 'fill="currentColor" fill-opacity="0.35"') +
      barre(112, -n2i2, 'fill="none"') +
      barre(192, n1i0 * LOUPE, 'fill="none" stroke-dasharray="5 3"');
    const w2 = -n2i2 * ECH;
    const x2 = w2 >= 0 ? X0 : X0 + w2;
    let h = "";
    for (let x = x2 + 6; x < x2 + Math.abs(w2); x += 8) h += "M" + x.toFixed(1) + " 146L" + Math.min(x + 12, x2 + Math.abs(w2)).toFixed(1) + " 112";
    hachures.innerHTML = '<path d="' + h + '"/>';
    valeursTexte.innerHTML =
      texte(610, 54, nombre(api, n1i1, 0) + " At") +
      texte(610, 134, nombre(api, -n2i2, 0) + " At") +
      texte(610, 214, nombre(api, n1i0, 1) + " At");
    /* Phaseurs efficaces : N1 I1 = N2 I2 + N1 I0. */
    const re = at2 * Math.cos(-phiCharge) + AT0 * Math.cos(-phi0);
    const im = at2 * Math.sin(-phiCharge) + AT0 * Math.sin(-phi0);
    const at1 = Math.hypot(re, im);
    if (valeurs) {
      valeurs.maj({ beta: etat.beta, i2: etat.beta * T1.I2n, at2, at1, at0: AT0, i1: at1 / T1.N1 });
    }
  }

  const curseurs = api.sim.curseurs(
    "#d-at-curseurs",
    [{ id: "beta", libelle: "Taux de charge β = S / Sn", min: 0, max: 1.2, pas: 0.05, valeur: etat.beta, format: (v) => nombre(api, Number(v), 2) }],
    (lues) => {
      etat.beta = Number(lues.beta);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-at-lecteur", {
    de: 0,
    a: 360,
    duree: 6,
    boucle: true,
    auto: false,
    libelle: "Ampères-tours instantanés sur une période, ωt",
    rappel: (valeur) => {
      etat.wt = Number(valeur);
      dessiner();
    },
  });
  etat.wt = 90;
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.suivre(etat.wt);
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   D. Animation : courant magnétisant et saturation
   -------------------------------------------------------------------------- */

function construireAnimMagnetisant(racine, api) {
  const conteneur = racine.querySelector("#d-mag");
  if (!conteneur) return;
  const etat = { u: 1, wt: 90 };
  const Hn = champ(1.6);
  const G = { x0: 170, y0: 160, sx: 140 / 700, sy: 120 / 2 };
  const D = { x0: 380, y0: 160, l: 320, sb: 120 / 2, si: 120 / 4.5 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 320",
    role: "img",
    "aria-label": "Courbe d'aimantation du noyau avec le point de fonctionnement, et formes d'onde de l'induction et du courant magnétisant sur une période",
  });
  const axes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.2, opacity: 0.7 });
  axes.innerHTML =
    '<path d="M' + (G.x0 - 150) + " " + G.y0 + "H" + (G.x0 + 150) + "M" + G.x0 + " 30V290" + '"/>' +
    '<path d="M' + D.x0 + " " + D.y0 + "H" + (D.x0 + D.l + 10) + "M" + D.x0 + " 30V290" + '"/>';
  const courbe = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.4 });
  const pts = [];
  for (let k = 0; k <= 200; k += 1) {
    const B = -1.865 + (3.73 * k) / 200;
    pts.push((G.x0 + champ(B) * G.sx).toFixed(1) + "," + (G.y0 - B * G.sy).toFixed(1));
  }
  courbe.setAttribute("d", "M" + pts.join("L"));
  const assignee = svgEl("path", {
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.2,
    "stroke-dasharray": "6 4",
    d: "M" + (G.x0 - 150) + " " + (G.y0 - 1.6 * G.sy) + "H" + (G.x0 + 150) + "M" + (G.x0 - 150) + " " + (G.y0 + 1.6 * G.sy) + "H" + (G.x0 + 150),
  });
  const ondeB = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.4 });
  const ondeI = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3 });
  const reperes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1, "stroke-dasharray": "2 3" });
  const point = svgEl("circle", { r: 5.5, fill: "currentColor" });
  const pointT = svgEl("circle", { r: 4.5, fill: "currentColor" });
  const ecrits = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  ecrits.innerHTML =
    texte(G.x0 + 6, 40, "B (T)") + texte(G.x0 + 100, G.y0 + 18, "H (A/m)") + texte(G.x0 + 6, G.y0 - 1.6 * G.sy - 6, "1,60 T") +
    texte(G.x0 + 128, G.y0 + 34, "700") + texte(G.x0 - 150, G.y0 + 34, "-700") +
    texte(D.x0 + D.l - 30, G.y0 + 18, "ωt") + texte(20, 312, "courbe sans hystérésis, noyau hypothétique") +
    texte(D.x0 + 6, 296, "B(t) : trait fin, échelle ±2 T") + texte(D.x0 + 6, 312, "iμ / îμn : trait épais, échelle ±4,5");
  svg.append(axes, assignee, courbe, ondeB, ondeI, reperes, point, pointT, ecrits);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-mag-valeurs", [
    { id: "u", libelle: "Tension U / Un", unite: "%", decimales: 0 },
    { id: "b", libelle: "Induction crête", unite: "T", decimales: 2 },
    { id: "ic", libelle: "Courant crête relatif", decimales: 2 },
    { id: "ie", libelle: "Courant efficace relatif", decimales: 2 },
    { id: "fc", libelle: "Facteur de crête du courant", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  let efficaceNominal = 0;
  for (let k = 0; k < 360; k += 1) efficaceNominal += Math.pow(champ(1.6 * Math.sin(k * DEG)) / Hn, 2);
  efficaceNominal = Math.sqrt(efficaceNominal / 360);

  function dessiner() {
    const Bm = 1.6 * etat.u;
    let dB = "";
    let dI = "";
    let somme = 0;
    for (let k = 0; k <= 360; k += 3) {
      const B = Bm * Math.sin(k * DEG);
      const x = D.x0 + (k / 360) * D.l;
      dB += (k ? "L" : "M") + x.toFixed(1) + " " + (D.y0 - B * D.sb).toFixed(1);
      if (k <= etat.wt) {
        const r = champ(B) / Hn;
        dI += (dI ? "L" : "M") + x.toFixed(1) + " " + (D.y0 - Math.max(-4.6, Math.min(4.6, r)) * D.si).toFixed(1);
      }
    }
    for (let k = 0; k < 360; k += 1) somme += Math.pow(champ(Bm * Math.sin(k * DEG)) / Hn, 2);
    ondeB.setAttribute("d", dB);
    ondeI.setAttribute("d", dI);
    const B = Bm * Math.sin(etat.wt * DEG);
    const H = champ(B);
    const px = G.x0 + Math.max(-150, Math.min(150, H * G.sx));
    const py = G.y0 - B * G.sy;
    point.setAttribute("cx", px.toFixed(1));
    point.setAttribute("cy", py.toFixed(1));
    const tx = D.x0 + (etat.wt / 360) * D.l;
    const r = champ(B) / Hn;
    pointT.setAttribute("cx", tx.toFixed(1));
    pointT.setAttribute("cy", (D.y0 - Math.max(-4.6, Math.min(4.6, r)) * D.si).toFixed(1));
    reperes.innerHTML = '<path d="M' + px.toFixed(1) + " " + py.toFixed(1) + "H" + tx.toFixed(1) + '"/>';
    const crete = champ(Bm) / Hn;
    const efficace = Math.sqrt(somme / 360) / efficaceNominal;
    if (valeurs) {
      valeurs.maj({ u: etat.u * 100, b: Bm, ic: crete, ie: efficace, fc: crete / (Math.sqrt(somme / 360)) });
    }
  }

  const curseurs = api.sim.curseurs(
    "#d-mag-curseurs",
    [{ id: "u", libelle: "Tension d'alimentation U / Un", min: 0.8, max: 1.15, pas: 0.01, valeur: 1, format: (v) => nombre(api, Number(v) * 100, 0) + " %" }],
    (lues) => {
      etat.u = Number(lues.u);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-mag-lecteur", {
    de: 0,
    a: 360,
    duree: 6,
    boucle: true,
    auto: false,
    libelle: "Parcours d'une période, ωt",
    rappel: (valeur) => {
      etat.wt = Number(valeur);
      dessiner();
    },
  });
  etat.wt = 330;
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.suivre(etat.wt);
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Animation : diagramme de Kapp du transformateur du poste
   -------------------------------------------------------------------------- */

function construireAnimKapp(racine, api) {
  const conteneur = racine.querySelector("#e-kapp");
  if (!conteneur) return;
  const etat = { beta: 0.66, angle: -10 };
  const s = 12;
  const O = { x: -2440, y: 190 };
  const rond = { x: 70, y: 300, r: 40 };
  const V20 = T1.V20;
  const rayon = s * V20;

  const svg = svgEl("svg", {
    viewBox: "0 0 640 360",
    role: "img",
    "aria-label": "Diagramme de Kapp manipulable du transformateur du poste : tension en charge, chutes résistive et réactive, tension à vide sur son arc, direction du courant réglable",
  });
  const idm = nouveauMarqueur("fl-e-k");
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(idm);
  const yArc = (y) => O.x + Math.sqrt(rayon * rayon - (y - O.y) * (y - O.y));
  const arc = svgEl("path", {
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.2,
    "stroke-dasharray": "2 4",
    d: "M" + yArc(20).toFixed(1) + " 20A" + rayon.toFixed(1) + " " + rayon.toFixed(1) + " 0 0 1 " + yArc(250).toFixed(1) + " 250",
  });
  const cadran = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.2 });
  cadran.innerHTML =
    '<circle cx="' + rond.x + '" cy="' + rond.y + '" r="' + rond.r + '" stroke-dasharray="3 3"/>' +
    '<path d="M' + (rond.x - rond.r - 6) + " " + rond.y + "H" + (rond.x + rond.r + 10) + '"/>';
  const vecteurs = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round" });
  const ecritsFixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  ecritsFixes.innerHTML =
    texte(20, 24, "vue agrandie, 12 px par volt") + texte(480, 24, "arc de rayon V20") +
    texte(rond.x + rond.r + 14, rond.y + 4, "V2") + texte(rond.x - 40, rond.y + rond.r + 18, "direction de I2") +
    texte(150, 300, "en dessous de l'axe : inductif") + texte(150, 318, "au-dessus : capacitif");
  const ecrits = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, arc, cadran, vecteurs, ecritsFixes, ecrits);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-kapp-valeurs", [
    { id: "phi", libelle: "Déphasage φ", unite: "°", decimales: 1 },
    { id: "cos", libelle: "Facteur de puissance", format: (v) => v },
    { id: "i2", libelle: "I2", unite: "A", decimales: 1 },
    { id: "du", libelle: "ΔU exacte", unite: "%", decimales: 3 },
    { id: "dk", libelle: "ΔU, Kapp au 1er ordre", unite: "%", decimales: 3 },
    { id: "u2", libelle: "U2 entre phases", unite: "V", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const phi = -etat.angle * DEG;
    const I = etat.beta * T1.I2n;
    const V2 = v2Exacte(V20, T1.Rcc, T1.Xcc, I, phi);
    const pointe = { x: O.x + s * V2, y: O.y };
    const RI = T1.Rcc * I;
    const XI = T1.Xcc * I;
    const a = { x: pointe.x + s * RI * Math.cos(phi), y: pointe.y + s * RI * Math.sin(phi) };
    const b = { x: a.x + s * XI * Math.sin(phi), y: a.y - s * XI * Math.cos(phi) };
    const pente = (b.y - O.y) / (b.x - O.x);
    const yBord = O.y + pente * (0 - O.x);
    let html =
      '<path d="' + segment(0, pointe.y, pointe.x, pointe.y) + '" stroke-width="3.2" marker-end="url(#' + idm + ')"/>' +
      '<path d="' + segment(0, yBord, b.x, b.y) + '" stroke-width="1.5" marker-end="url(#' + idm + ')"/>';
    if (RI * s > 3) html += '<path d="' + segment(pointe.x, pointe.y, a.x, a.y) + '" stroke-width="2.4" marker-end="url(#' + idm + ')"/>';
    if (XI * s > 3) html += '<path d="' + segment(a.x, a.y, b.x, b.y) + '" stroke-width="2.4" stroke-dasharray="7 4" marker-end="url(#' + idm + ')"/>';
    const fin = { x: rond.x + rond.r * Math.cos(etat.angle * DEG), y: rond.y - rond.r * Math.sin(etat.angle * DEG) };
    html += '<path d="' + segment(rond.x, rond.y, fin.x, fin.y) + '" stroke-width="2"/>';
    vecteurs.innerHTML = html;
    ecrits.innerHTML =
      texte(40, pointe.y + 18, "V2 = " + nombre(api, V2, 2) + " V") +
      texte(40, yBord - 8, "V20 = " + nombre(api, V20, 2) + " V") +
      (RI * s > 12 ? texte((pointe.x + a.x) / 2 + 6, (pointe.y + a.y) / 2 + (phi >= 0 ? 18 : -8), "Rcc I") : "") +
      (XI * s > 12 ? texte(Math.max(a.x, b.x) + 8, (a.y + b.y) / 2, "jXcc I") : "");
    const du = ((V20 - V2) / V20) * 100;
    const ur = (T1.Rcc * T1.I2n) / V20;
    const ux = (T1.Xcc * T1.I2n) / V20;
    const dk = etat.beta * (ur * Math.cos(phi) + ux * Math.sin(phi)) * 100;
    const cosTexte = nombre(api, Math.cos(phi), 3) + (Math.abs(phi) < 0.002 ? "" : phi > 0 ? " inductif" : " capacitif");
    if (valeurs) valeurs.maj({ phi: phi / DEG, cos: cosTexte, i2: I, du, dk, u2: V2 * RAC3 });
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: { x: rond.x, y: rond.y },
    rayon: rond.r,
    min: -90,
    max: 90,
    boucle: false,
    valeur: etat.angle,
    pas: 1,
    libelle: "Direction du courant I2 par rapport à V2",
    diffuserAuDepart: false,
    rappel(mesure) {
      let angle = Number(mesure.angle);
      if (angle > 180) angle -= 360;
      etat.angle = Math.max(-90, Math.min(90, angle));
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-kapp-curseurs",
    [{ id: "beta", libelle: "Taux de charge β", min: 0, max: 1.2, pas: 0.02, valeur: etat.beta, format: (v) => nombre(api, Number(v), 2) }],
    (lues) => {
      etat.beta = Number(lues.beta);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : courant d'enclenchement
   -------------------------------------------------------------------------- */

function construireSimEnclenchement(racine, api) {
  const etat = { alpha: 0, br: 0.6 };
  let attente = 0;
  const Iw = T1.I1w * RAC2;
  const Iligne = T1.S / (RAC3 * T1.U1);

  const traceB = api.sim.traceur("#e-encl-flux", {
    titre: "Induction équivalente dans le noyau",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "λ / (N A)",
    yUnite: "T",
    xMin: 0,
    xMax: 200,
    yMin: -4.5,
    yMax: 4.5,
    ratio: 0.36,
    series: [{ id: "b", nom: "induction équivalente", couleur: "serie-1", epaisseur: 2, points: [] }],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, ENCL.Bk, "genou +1,9 T", false);
      ligneH(c, repere, couleurs, -ENCL.Bk, "genou -1,9 T", true);
    },
    note: "Hypothèses : 4393 spires, 128 cm² de fer, genou à 1,9 T, courbe à deux pentes sans hystérésis, réseau infiniment puissant.",
  });
  if (traceB) ressources.push(traceB);

  const traceI = api.sim.traceur("#e-encl-courant", {
    titre: "Courant de l'enroulement haute tension",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "i",
    yUnite: "A",
    xMin: 0,
    xMax: 200,
    yMin: -10,
    yMax: 50,
    ratio: 0.36,
    series: [{ id: "i", nom: "courant d'enclenchement", couleur: "serie-5", epaisseur: 2.2, points: [] }],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 10 * Iw, "10 fois Î assigné", false);
    },
    note: "Lair = 2,75 H pour une bobine de 0,25 m de diamètre et 0,32 m de hauteur ; résistance mesurée 80,4 Ω.",
  });
  if (traceI) ressources.push(traceI);

  const valeurs = api.sim.valeurs("#e-encl-valeurs", [
    { id: "b", libelle: "Induction équivalente crête", unite: "T", decimales: 2 },
    { id: "c1", libelle: "Première crête", unite: "A", decimales: 1 },
    { id: "rap", libelle: "Rapport au courant assigné de ligne", decimales: 1 },
    { id: "c5", libelle: "Crête de la 5e période", unite: "A", decimales: 1 },
    { id: "c25", libelle: "Crête de la 25e période", unite: "A", decimales: 2 },
    { id: "h2", libelle: "Rang 2 sur la 1re période", unite: "%", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function calculer() {
    attente = 0;
    const r = simulerEnclenchement(etat.alpha, etat.br);
    const pointsB = r.t.map((t, k) => [t, r.b[k]]);
    const pointsI = r.t.map((t, k) => [t, r.i[k]]);
    let maxI = 0;
    let minI = 0;
    for (const x of r.i) {
      if (x > maxI) maxI = x;
      if (x < minI) minI = x;
    }
    if (traceB) traceB.definirDonnees("b", pointsB);
    if (traceI) {
      const haut = Math.max(30, maxI * 1.15);
      const bas = Math.min(-0.15 * haut, minI * 1.15);
      traceI.definirPlage({ yMin: bas, yMax: haut });
      traceI.definirDonnees("i", pointsI);
    }
    if (valeurs) {
      valeurs.maj({
        b: r.bMax,
        c1: r.cretes[0],
        rap: r.cretes[0] / Iligne,
        c5: r.cretes[4],
        c25: r.cretes[24],
        h2: r.h2 * 100,
      });
    }
  }

  function planifier() {
    if (attente) return;
    if (typeof requestAnimationFrame === "function") attente = requestAnimationFrame(calculer);
    else calculer();
  }
  nettoyeursAnimation.push(() => {
    if (attente && typeof cancelAnimationFrame === "function") cancelAnimationFrame(attente);
    attente = 0;
  });

  const curseurs = api.sim.curseurs(
    "#e-encl-curseurs",
    [
      { id: "alpha", libelle: "Angle de la tension à la fermeture α", min: 0, max: 180, pas: 5, valeur: etat.alpha, unite: "°" },
      { id: "br", libelle: "Rémanence, en fraction de l'induction assignée", min: -0.8, max: 0.8, pas: 0.05, valeur: etat.br, format: (v) => nombre(api, Number(v) * 100, 0) + " %" },
    ],
    (lues) => {
      etat.alpha = Number(lues.alpha);
      etat.br = Number(lues.br);
      planifier();
    }
  );
  if (curseurs) ressources.push(curseurs);
  calculer();
}

/* --------------------------------------------------------------------------
   H. Simulation : de la plaque au modèle
   -------------------------------------------------------------------------- */

const PUISSANCES = [100, 160, 250, 315, 400, 500, 630, 800, 1000];

function construireSimPlaque(racine, api) {
  const etat = { s: 4, ucc: 0.04, pcc: 0.0115, p0: 0.001525, i0: 0.013, charge: 300, cos: 0.9, nature: 1 };
  let modele = null;

  const traceEta = api.sim.traceur("#h-sim-rendement", {
    titre: "Rendement en fonction du taux de charge",
    xTitre: "β",
    xUnite: "",
    yTitre: "η",
    yUnite: "%",
    xMin: 0,
    xMax: 1.25,
    yMin: 96,
    yMax: 100,
    ratio: 0.4,
    series: [{ id: "eta", nom: "rendement", couleur: "serie-1", epaisseur: 2.4 }],
    surDessin({ c, repere, couleurs }) {
      if (!modele) return;
      ligneV(c, repere, couleurs, modele.bopt, "β optimal");
      const beta = etat.charge / PUISSANCES[etat.s];
      pointTrace(c, repere, couleurs, beta, rendement(modele, beta, etat.cos) * 100, "point de fonctionnement");
    },
  });
  if (traceEta) ressources.push(traceEta);

  const traceU = api.sim.traceur("#h-sim-tension", {
    titre: "Tension entre phases en charge",
    xTitre: "β",
    xUnite: "",
    yTitre: "U2",
    yUnite: "V",
    xMin: 0,
    xMax: 1.25,
    yMin: 375,
    yMax: 420,
    ratio: 0.4,
    series: [
      { id: "ind", nom: "charge inductive", couleur: "serie-5", epaisseur: 2.4 },
      { id: "cap", nom: "charge capacitive", couleur: "serie-3", epaisseur: 2.4 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 410, "U20 = 410 V", false);
      if (!modele) return;
      const beta = etat.charge / PUISSANCES[etat.s];
      pointTrace(c, repere, couleurs, beta, tensionEnCharge(modele, beta, etat.cos, etat.nature), "");
    },
  });
  if (traceU) ressources.push(traceU);

  const valeurs = api.sim.valeurs("#h-sim-valeurs", [
    { id: "i2n", libelle: "I2n", unite: "A", decimales: 1 },
    { id: "zcc", libelle: "Zcc", unite: "mΩ", decimales: 2 },
    { id: "rcc", libelle: "Rcc", unite: "mΩ", decimales: 3 },
    { id: "xcc", libelle: "Xcc", unite: "mΩ", decimales: 2 },
    { id: "rf", libelle: "Rf", unite: "Ω", decimales: 1 },
    { id: "xm", libelle: "Xm", unite: "Ω", decimales: 2 },
    { id: "beta", libelle: "Taux de charge β", decimales: 3 },
    { id: "du", libelle: "ΔU exacte", unite: "%", decimales: 3 },
    { id: "u2", libelle: "U2 entre phases", unite: "V", decimales: 1 },
    { id: "pertes", libelle: "Pertes totales", unite: "W", decimales: 0 },
    { id: "eta", libelle: "Rendement", unite: "%", decimales: 2 },
    { id: "bopt", libelle: "β optimal", decimales: 3 },
    { id: "ik", libelle: "Ik aux bornes BT, réseau 250 MVA", unite: "kA", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function mettreAJour() {
    const S = PUISSANCES[etat.s] * 1e3;
    modele = modeleTransfo({ S, ucc: etat.ucc, pcc: etat.pcc, p0: etat.p0, i0: etat.i0 });
    const m = modele;
    if (traceEta) traceEta.definirFonction("eta", (beta) => rendement(m, beta, etat.cos) * 100);
    if (traceU) {
      traceU.definirFonction("ind", (beta) => tensionEnCharge(m, beta, etat.cos, 1));
      traceU.definirFonction("cap", (beta) => tensionEnCharge(m, beta, etat.cos, -1));
    }
    const beta = (etat.charge * 1e3) / S;
    const u2 = tensionEnCharge(m, beta, etat.cos, etat.nature);
    if (valeurs) {
      valeurs.maj({
        i2n: m.I2n,
        zcc: m.Zcc * 1000,
        rcc: m.Rcc * 1000,
        xcc: m.Xcc * 1000,
        rf: m.Rf,
        xm: m.Xm,
        beta,
        du: ((410 - u2) / 410) * 100,
        u2,
        pertes: m.P0 + beta * beta * m.Pcc,
        eta: rendement(m, beta, etat.cos) * 100,
        bopt: m.bopt,
        ik: m.Ik / 1000,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#h-sim-curseurs",
    [
      { id: "s", libelle: "Puissance assignée Sn", min: 0, max: PUISSANCES.length - 1, pas: 1, valeur: etat.s, format: (v) => PUISSANCES[Math.round(Number(v))] + " kVA" },
      { id: "ucc", libelle: "Tension de court-circuit ucc", min: 0.04, max: 0.06, pas: 0.005, valeur: etat.ucc, format: (v) => nombre(api, Number(v) * 100, 1) + " %" },
      { id: "pcc", libelle: "Pertes en court-circuit Pcc / Sn", min: 0.008, max: 0.018, pas: 0.0005, valeur: etat.pcc, format: (v) => nombre(api, Number(v) * 100, 2) + " %" },
      { id: "p0", libelle: "Pertes à vide P0 / Sn", min: 0.0008, max: 0.003, pas: 0.000025, valeur: etat.p0, format: (v) => nombre(api, Number(v) * 100, 4) + " %" },
      { id: "i0", libelle: "Courant à vide i0", min: 0.005, max: 0.025, pas: 0.001, valeur: etat.i0, format: (v) => nombre(api, Number(v) * 100, 1) + " %" },
      { id: "charge", libelle: "Charge appelée S", min: 0, max: 1000, pas: 10, valeur: etat.charge, unite: "kVA" },
      { id: "cos", libelle: "Facteur de puissance de la charge", min: 0.5, max: 1, pas: 0.01, valeur: etat.cos, format: (v) => nombre(api, Number(v), 2) },
      { id: "nature", libelle: "Nature de la charge", min: -1, max: 1, pas: 2, valeur: etat.nature, format: (v) => (Number(v) > 0 ? "inductive" : "capacitive") },
    ],
    (lues) => {
      etat.s = Math.round(Number(lues.s));
      etat.ucc = Number(lues.ucc);
      etat.pcc = Math.min(Number(lues.pcc), etat.ucc * 0.95);
      etat.p0 = Number(lues.p0);
      etat.i0 = Math.max(Number(lues.i0), etat.p0 * 1.05);
      etat.charge = Number(lues.charge);
      etat.cos = Number(lues.cos);
      etat.nature = Number(lues.nature) > 0 ? 1 : -1;
      mettreAJour();
    }
  );
  if (curseurs) ressources.push(curseurs);
  mettreAJour();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/* Transformateur de 250 kVA des exercices. */
const K = { S: 250e3, U20: 410, ucc: 0.04, Pcc: 3250, P0: 425 };
K.I2n = K.S / (RAC3 * K.U20);
K.Zb = (K.U20 * K.U20) / K.S;
K.ur = K.Pcc / K.S;
K.ux = Math.sqrt(K.ucc * K.ucc - K.ur * K.ur);

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-zcc",
      titre: "Impédance de court-circuit à partir de la plaque",
      niveau: "fondamental",
      enonce:
        "<p>Un transformateur de $250\\ \\mathrm{kVA}$, $20\\ \\mathrm{kV} / 410\\ \\mathrm{V}$, Dyn11, porte sur sa plaque $u_{cc} = 4\\ \\%$. " +
        "Quel est le module de son impédance de court-circuit par phase, en étoile équivalente côté basse tension, en milliohms ?</p>",
      valeur: K.ucc * K.Zb * 1000,
      unite: "mΩ",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Impédance $Z_{cc}$",
      etapes: [
        { texte: "Impédance de base côté basse tension : $Z_b = U_{20}^2/S_n = 410^2/250\\,000 = 0{,}6724\\ \\Omega$." },
        { texte: "$Z_{cc} = u_{cc}\\,Z_b = 0{,}04 \\times 0{,}6724 = 26{,}90\\ \\mathrm{m\\Omega}$." },
        { texte: "Contrôle par le courant : $I_{2n} = 352{,}1\\ \\mathrm{A}$ et $Z_{cc}I_{2n} = 9{,}47\\ \\mathrm{V}$, soit $4\\ \\%$ de $236{,}7\\ \\mathrm{V}$.", note: "La plaque suffit pour ce module ; le partage entre $R_{cc}$ et $X_{cc}$ exige $P_{cc}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 140",
          dessinEtapes(["Zb = 410² / 250 000 = 0,6724 Ω", "Zcc = 0,04 × 0,6724 = 26,90 mΩ", "contrôle : 26,90 mΩ × 352,1 A = 9,47 V", "         = 4 % de 236,7 V"], 540),
          "De la tension de court-circuit relative à l'impédance en ohms, étapes révélées une à une."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-pertes",
      titre: "Pertes à mi-charge",
      niveau: "fondamental",
      enonce:
        "<p>Le même transformateur a des pertes à vide $P_0 = 425\\ \\mathrm{W}$ et des pertes en court-circuit $P_{cc} = 3250\\ \\mathrm{W}$ à " +
        "$75\\ ^\\circ\\mathrm{C}$. Quelles sont ses pertes totales quand il débite $150\\ \\mathrm{kVA}$ ?</p>",
      valeur: K.P0 + 0.36 * K.Pcc,
      unite: "W",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Pertes totales",
      etapes: [
        { texte: "Taux de charge : $\\beta = 150/250 = 0{,}6$." },
        { texte: "Pertes cuivre : $\\beta^2 P_{cc} = 0{,}36 \\times 3250 = 1170\\ \\mathrm{W}$ ; pertes fer inchangées, $425\\ \\mathrm{W}$." },
        { texte: "Total : $1595\\ \\mathrm{W}$.", note: "À $\\beta_{opt} = \\sqrt{425/3250} = 0{,}362$, les deux pertes vaudraient $425\\ \\mathrm{W}$ chacune." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 600 190",
          dessinBarres(
            [
              { nom: "fer, P0", valeur: 425, max: 1600, texte: "425 W, fixes" },
              { nom: "cuivre, β² Pcc", valeur: 1170, max: 1600, texte: "1170 W" },
              { nom: "total", valeur: 1595, max: 1600, texte: "1595 W" },
            ],
            { x0: 150, l: 300, pied: "tirets : 1600 W" }
          ),
          "Partage des pertes à 60 % de charge : les pertes cuivre dominent, le rendement n'est pas maximal."
        );
      },
    })
  );

  const beta3 = 0.8;
  const c3 = 0.85;
  const s3 = Math.sqrt(1 - c3 * c3);
  const d3 = beta3 * (K.ur * c3 + K.ux * s3) + (beta3 * beta3 * Math.pow(K.ux * c3 - K.ur * s3, 2)) / 2;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-chute",
      titre: "Tension en charge par la formule de Kapp",
      niveau: "intermédiaire",
      enonce:
        "<p>Le transformateur de $250\\ \\mathrm{kVA}$, $u_{cc} = 4\\ \\%$, $P_{cc} = 3250\\ \\mathrm{W}$, alimenté sous sa tension assignée, débite $200\\ \\mathrm{kVA}$ " +
        "sous $\\cos\\varphi = 0{,}85$ inductif. Quelle est la tension entre phases en charge, sachant que $U_{20} = 410\\ \\mathrm{V}$ ?</p>",
      valeur: 410 * (1 - d3),
      unite: "V",
      tolerance: 0.0015,
      chiffres: 1,
      libelleChamp: "Tension $U_2$",
      etapes: [
        { texte: "$u_r = 3250/250\\,000 = 1{,}30\\ \\%$ ; $u_x = \\sqrt{4^2 - 1{,}3^2} = 3{,}783\\ \\%$ ; $\\beta = 0{,}8$ ; $\\sin\\varphi = 0{,}527$." },
        { texte: "Premier ordre : $0{,}8 \\times (1{,}30 \\times 0{,}85 + 3{,}783 \\times 0{,}527) = 0{,}8 \\times 3{,}098 = 2{,}478\\ \\%$." },
        { texte: "Second ordre : $0{,}8^2 \\times (3{,}783 \\times 0{,}85 - 1{,}30 \\times 0{,}527)^2/2 = 0{,}020\\ \\%$ ; total $2{,}499\\ \\%$." },
        { texte: "$U_2 = 410 \\times (1 - 0{,}024\\,99) = 399{,}8\\ \\mathrm{V}$.", note: "Le second ordre ne déplace le résultat que de $0{,}08\\ \\mathrm{V}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const V2 = (410 * (1 - d3)) / RAC3;
        const I = 0.8 * K.I2n;
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 320",
          dessinKapp(V2, K.ur * K.Zb * I, K.ux * K.Zb * I, Math.acos(c3) / DEG, {
            echelle: 10,
            x: 300,
            y: 150,
            lV2: "V2 = " + nombre(api, V2, 2) + " V",
            lV20: "V20 = 236,71 V",
            lR: "RI = " + nombre(api, K.ur * K.Zb * I, 2) + " V",
            lX: "XI = " + nombre(api, K.ux * K.Zb * I, 2) + " V",
            pied: ["vue agrandie, 10 px par volt ; φ = 31,8°", "ΔV = " + nombre(api, 410 / RAC3 - V2, 2) + " V par phase, soit " + nombre(api, d3 * 100, 2) + " %"],
          }),
          "Diagramme de Kapp de l'exercice : la chute réactive, en tirets, pèse plus que la chute résistive."
        );
      },
    })
  );

  const S0 = RAC3 * 410 * 4.5;
  const Q0 = Math.sqrt(S0 * S0 - 425 * 425);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-essai-vide",
      titre: "Réactance magnétisante à partir de l'essai à vide",
      niveau: "intermédiaire",
      enonce:
        "<p>À l'essai à vide côté basse tension, sous $410\\ \\mathrm{V}$ entre phases, le transformateur de $250\\ \\mathrm{kVA}$ absorbe " +
        "$4{,}5\\ \\mathrm{A}$ par phase et $425\\ \\mathrm{W}$ au total. Quelle est sa réactance magnétisante par phase de l'étoile équivalente ?</p>",
      valeur: (410 * 410) / Q0,
      unite: "Ω",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Réactance $X_m$",
      etapes: [
        { texte: "Puissance apparente à vide : $S_0 = \\sqrt{3} \\times 410 \\times 4{,}5 = 3196\\ \\mathrm{VA}$, soit $i_0 = 1{,}28\\ \\%$." },
        { texte: "Puissance réactive : $Q_0 = \\sqrt{3196^2 - 425^2} = 3167\\ \\mathrm{var}$." },
        { texte: "$X_m = U^2/Q_0 = 410^2/3167 = 53{,}07\\ \\Omega$ ; et $R_f = 410^2/425 = 395{,}5\\ \\Omega$.", note: "$\\cos\\varphi_0 = 425/3196 = 0{,}133$ : le courant à vide est presque entièrement magnétisant." },
      ],
      visuelCorrection(conteneur, moteur) {
        const id = nouveauMarqueur("fl-k-t");
        const dessin =
          "<defs>" + marqueur(id) + "</defs>" +
          TRAITS + ' stroke-width="2.2"><path d="M60 230H112" marker-end="url(#' + id + ')"/><path d="M112 230V30" marker-end="url(#' + id + ')"/>' +
          '<path d="M60 230L112 30" stroke-dasharray="7 4" marker-end="url(#' + id + ')"/></g>' +
          ECRITS + texte(50, 252, "P0 = 425 W") + texte(122, 130, "Q0 = 3167 var") + texte(20, 130, "S0") + texte(20, 146, "3196 VA") +
          texte(260, 60, "Rf = 410² / 425 = 395,5 Ω") + texte(260, 84, "Xm = 410² / 3167 = 53,07 Ω") + texte(260, 108, "cos φ0 = 0,133") + "</g>";
        schemaCorrection(moteur, conteneur, "0 0 560 270", dessin, "Triangle des puissances de l'essai à vide : la puissance réactive, verticale, fixe Xm ; la puissance active, horizontale, fixe Rf.");
      },
    })
  );

  const jourA = 24 * 0.425 + 3.25 * (8 * 0.64 + 16 * 0.0256);
  const jourB = 24 * 0.61 + 4.6 * (8 * 0.25 + 16 * 0.01);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-energie",
      titre: "Choisir entre deux transformateurs sur un profil de charge",
      niveau: "avancé",
      enonce:
        "<p>Un atelier appelle $200\\ \\mathrm{kVA}$ pendant $8\\ \\mathrm{h}$ par jour et $40\\ \\mathrm{kVA}$ le reste du temps, tous les jours. Deux " +
        "offres : A, $250\\ \\mathrm{kVA}$, $P_0 = 425\\ \\mathrm{W}$, $P_{cc} = 3250\\ \\mathrm{W}$ ; B, $400\\ \\mathrm{kVA}$, $P_0 = 610\\ \\mathrm{W}$, $P_{cc} = 4600\\ \\mathrm{W}$. " +
        "De combien de kilowattheures par an l'énergie perdue par A dépasse-t-elle celle de B ?</p>",
      valeur: (jourA - jourB) * 365,
      unite: "kWh",
      tolerance: 0.02,
      chiffres: 0,
      libelleChamp: "Écart annuel A moins B",
      etapes: [
        { texte: "Taux de charge : A, $\\beta = 0{,}8$ puis $0{,}16$ ; B, $\\beta = 0{,}5$ puis $0{,}1$." },
        { texte: "A, par jour : fer $24 \\times 0{,}425 = 10{,}20\\ \\mathrm{kWh}$ ; cuivre $3{,}25 \\times (8 \\times 0{,}64 + 16 \\times 0{,}0256) = 17{,}97\\ \\mathrm{kWh}$ ; total $28{,}17\\ \\mathrm{kWh}$." },
        { texte: "B, par jour : fer $24 \\times 0{,}61 = 14{,}64\\ \\mathrm{kWh}$ ; cuivre $4{,}6 \\times (8 \\times 0{,}25 + 16 \\times 0{,}01) = 9{,}94\\ \\mathrm{kWh}$ ; total $24{,}58\\ \\mathrm{kWh}$." },
        { texte: "Écart : $3{,}59\\ \\mathrm{kWh}$ par jour, soit $1312\\ \\mathrm{kWh}$ par an en faveur de B.", note: "B perd plus à vide mais beaucoup moins en charge ; le choix final ajoute le prix d'achat, le courant de court-circuit plus élevé de B et l'évolution prévue de la charge." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 600 230",
          dessinBarres(
            [
              { nom: "A, fer", valeur: 10.2, max: 30, texte: "10,20 kWh/j" },
              { nom: "A, cuivre", valeur: 17.97, max: 30, texte: "17,97 kWh/j, total 28,17" },
              { nom: "B, fer", valeur: 14.64, max: 30, texte: "14,64 kWh/j" },
              { nom: "B, cuivre", valeur: 9.94, max: 30, texte: "9,94 kWh/j, total 24,58" },
            ],
            { x0: 120, l: 260, pied: "tirets : 30 kWh par jour" }
          ),
          "Énergie perdue par jour par les deux offres : B perd plus à vide, mais nettement moins en charge."
        );
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Tension basse après remplacement d'un transformateur",
      niveau: "diagnostic",
      enonce:
        "<p>Après le remplacement d'un transformateur $20\\ \\mathrm{kV} / 410\\ \\mathrm{V}$ par un appareil neuf de même plaque, la tension à vide du " +
        "tableau vaut $391\\ \\mathrm{V}$ sur les trois phases, au lieu de $410\\ \\mathrm{V}$ ; le ronflement est plus faible qu'avant et le courant à vide " +
        "mesuré est inférieur à celui du procès-verbal. Quelles causes sont compatibles avec ces symptômes ?</p>",
      options: [
        { texte: "Le commutateur de prises est resté sur la prise $+5\\ \\%$.", juste: true },
        { texte: "La tension haute tension du réseau est plus basse que prévu, vers $19\\ \\mathrm{kV}$.", juste: true },
        { texte: "Un court-circuit entre spires dans l'enroulement haute tension." },
        { texte: "Le couplage réel est Yyn0 au lieu de Dyn11." },
      ],
      etapes: [
        { texte: "Prise $+5\\ \\%$ : $410/1{,}05 = 390{,}5\\ \\mathrm{V}$, et l'induction baisse de $5\\ \\%$, d'où moins de bruit et un courant magnétisant plus faible." },
        { texte: "Réseau à $19{,}1\\ \\mathrm{kV}$ : même tension à vide, même induction réduite ; les deux causes sont indiscernables par une mesure basse tension seule." },
        { texte: "Un court-circuit entre spires augmenterait le courant et les pertes à vide, et chaufferait : symptôme opposé.", note: "Un changement de groupe de couplage modifierait le déphasage, pas le module de la tension." },
        { texte: "Pour trancher : lire la position du commutateur hors tension, et demander ou mesurer la tension haute tension." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 160",
          dessinEtapes(["symptômes : U20 basse, induction basse, i0 faible", "prise +5 % : 410 / 1,05 = 390,5 V   compatible", "HT à 19,1 kV : 391 V                compatible", "spires en court-circuit : i0 et P0 en hausse   exclu", "Yyn0 : déphasage changé, module identique      exclu"], 540),
          "Arbre de diagnostic : seules les causes qui baissent l'induction expliquent les trois symptômes."
        );
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-conceptuel",
      titre: "Pourquoi les deux essais séparent les pertes",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi l'essai à vide mesure presque uniquement les pertes fer et l'essai en court-circuit presque " +
        "uniquement les pertes cuivre.</p>",
      motsCles: [["flux", "induction"], ["tension"], ["courant"], ["faible", "negligeable", "petit", "reduite"]],
      minimum: 3,
      exemple: "Trois ou quatre phrases : reliez chaque essai à la grandeur qu'il impose et à celle qu'il rend négligeable.",
      etapes: [
        { texte: "À vide, sous tension assignée, le flux est celui du service : les pertes fer sont les vraies ; le courant, de l'ordre du pour cent, rend les pertes Joule négligeables, environ $i_0^2$ fois $P_{cc}$." },
        { texte: "En court-circuit, au courant assigné, les pertes Joule sont les vraies ; la tension appliquée, $u_{cc}$ soit quelques pour cent, impose un flux réduit dans le même rapport, et les pertes fer, proportionnelles à peu près au carré de l'induction, deviennent négligeables." },
        { texte: "Chaque essai impose donc à pleine valeur la grandeur qui crée un type de pertes et rend l'autre très petite.", note: "Ordre de grandeur pour le transformateur du poste : $0{,}0156^2 \\times 1740 \\approx 0{,}4\\ \\mathrm{W}$ de pertes Joule à vide, et environ $0{,}04^2 \\times 198 \\approx 0{,}3\\ \\mathrm{W}$ de pertes fer en court-circuit." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 600 190",
          dessinBarres(
            [
              { nom: "à vide, fer", valeur: 198, max: 200, texte: "198 W, tension pleine" },
              { nom: "à vide, cuivre", valeur: 0.4, max: 200, texte: "0,4 W" },
              { nom: "en cc, cuivre", valeur: 1740, max: 1750, texte: "1740 W, courant plein" },
              { nom: "en cc, fer", valeur: 0.3, max: 1750, texte: "0,3 W" },
            ],
            { x0: 140, l: 280, pied: "chaque paire de barres est à sa propre échelle" }
          ),
          "Ce que mesure chaque essai, pour le transformateur du poste : l'autre type de pertes est négligeable."
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const VISUELS_QUIZ = [
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["ucc = Zcc / Zb", "Zcc = ucc × U20² / Sn", "P0, i0 : branche magnétisante", "indice horaire : déphasage"], 540),
    legende: "La tension de court-circuit relative donne directement le module de l'impédance série.",
  },
  {
    viewBox: "0 0 600 150",
    dessin: dessinBarres(
      [
        { nom: "pertes fer", valeur: 1, max: 1, texte: "constantes, fixées par U et f" },
        { nom: "pertes cuivre", valeur: 0.5625, max: 1, texte: "β² Pcc, ici β = 0,75" },
      ],
      { x0: 140, l: 260 }
    ),
    legende: "Les pertes fer dépendent de la tension et de la fréquence, les pertes cuivre du carré du courant.",
  },
  {
    viewBox: "0 0 560 120",
    dessin: dessinEtapes(["I2n = 630 000 / (√3 × 410)", "    = 630 000 / 710,1 = 887,2 A"], 540),
    legende: "Courant assigné secondaire d'un transformateur de 630 kVA.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["D : triangle côté haute tension", "y : étoile côté basse tension", "n : neutre basse tension sorti", "11 : BT en avance de 30°"], 540),
    legende: "Lecture des lettres du groupe Dyn11.",
  },
  {
    viewBox: "0 0 560 120",
    dessin: dessinEtapes(["β opt = √(610 / 4600) = √0,1326", "      = 0,364, soit 145,7 kVA"], 540),
    legende: "Taux de charge du rendement maximal : pertes fer égales aux pertes cuivre.",
  },
  {
    viewBox: "0 0 560 180",
    dessin: dessinCircuitKapp() + ECRITS + texte(300, 120, "Rf : pertes fer") + texte(300, 138, "Rcc : pertes cuivre") + "</g>",
    legende: "Dans le modèle de Kapp, la résistance parallèle Rf porte les pertes fer, la résistance série Rcc les pertes cuivre.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["ΔU ≈ β (ur cos φ + ux sin φ)", "charge capacitive : sin φ < 0", "si ux |sin φ| > ur cos φ : ΔU < 0", "la tension monte au-dessus de U20"], 540),
    legende: "Le signe de la variation de tension suit celui de sin φ.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["λ = λr + λm [cos α - cos(ωt + α)]", "α = 90°, λr = 0 : pas de transitoire", "α = 90°, λr = 0,6 λm : crête 1,6 λm", "le noyau sature encore : 13 A environ"], 540),
    legende: "La fermeture au maximum de la tension n'élimine le transitoire qu'en l'absence de rémanence.",
  },
  {
    viewBox: "0 0 560 120",
    dessin: dessinEtapes(["Ik = I2n / ucc = 563,3 / 0,04", "   = 14,08 kA, réseau amont infini"], 540),
    legende: "Courant de court-circuit triphasé aux bornes basse tension, borne supérieure sans le réseau amont.",
  },
  {
    viewBox: "0 0 600 150",
    dessin: dessinBarres(
      [
        { nom: "1 mΩ côté BT", valeur: 1, max: 2380, texte: "1 mΩ" },
        { nom: "vu de la HT", valeur: 2380, max: 2380, texte: "2,38 Ω = 1 mΩ / m²" },
      ],
      { x0: 140, l: 300 }
    ),
    legende: "Ramener au primaire une impédance basse tension : multiplier par 1/m² = 2380.",
  },
];

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Quelle donnée de plaque fixe le module de l'impédance de court-circuit d'un transformateur ?</p>",
        options: ["La tension de court-circuit $u_{cc}$", "Les pertes à vide $P_0$", "Le courant à vide $i_0$", "L'indice horaire"],
        bonnes: [0],
        explication: "$Z_{cc} = u_{cc}\\,U_{20}^2/S_n$. Les pertes à vide et le courant à vide caractérisent la branche magnétisante.",
        resume: "Module de Zcc",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Les pertes fer d'un transformateur augmentent avec sa charge.</p>",
        reponse: false,
        explication: "Elles dépendent de l'induction, fixée par la tension et la fréquence ; c'est le flux qui les crée, et il ne dépend pas de la charge.",
        resume: "Pertes fer et charge",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Quel est le courant assigné secondaire d'un transformateur de $630\\ \\mathrm{kVA}$ sous $410\\ \\mathrm{V}$, en ampères ?</p>",
        valeur: 630e3 / (RAC3 * 410),
        unite: "A",
        tolerance: 0.01,
        explication: "$I_{2n} = 630\\,000/(\\sqrt{3} \\times 410) = 887{,}2\\ \\mathrm{A}$.",
        resume: "Courant assigné",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Que signifient les lettres D, y et n du groupe Dyn11 ?</p>",
        motsCles: [["triangle"], ["etoile"], ["neutre"]],
        minimum: 2,
        explication: "D : enroulement haute tension en triangle ; y : enroulement basse tension en étoile ; n : neutre basse tension sorti.",
        resume: "Lettres du groupe de couplage",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Avec $P_0 = 610\\ \\mathrm{W}$ et $P_{cc} = 4600\\ \\mathrm{W}$, à quel taux de charge, en pour cent, le rendement est-il maximal ?</p>",
        valeur: Math.sqrt(610 / 4600) * 100,
        unite: "%",
        tolerance: 0.02,
        explication: "$\\beta_{opt} = \\sqrt{610/4600} = 0{,}364$, soit $36{,}4\\ \\%$, quand pertes fer et pertes cuivre sont égales.",
        resume: "Taux de charge optimal",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Sur ce modèle de Kapp par phase, quel élément représente les pertes fer ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 560 180",
        dessin: dessinCircuitKapp(),
        zones: [
          { x: 0, y: 56, largeur: 50, hauteur: 62, etiquette: "Rf", juste: true },
          { x: 84, y: 56, largeur: 50, hauteur: 62, etiquette: "Xm" },
          { x: 312, y: 20, largeur: 66, hauteur: 46, etiquette: "Rcc" },
          { x: 396, y: 20, largeur: 60, hauteur: 46, etiquette: "Xcc" },
        ],
        explication: "La résistance parallèle $R_f$, placée sous la tension, dissipe $U^2/R_f = P_0$ : ce sont les pertes fer. $R_{cc}$, en série, porte les pertes cuivre.",
        resume: "Pertes fer dans le schéma",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Que peut-il arriver à la tension d'un tableau alimenté par un transformateur dont la charge est fortement capacitive ?</p>",
        options: [
          "Elle peut dépasser la tension à vide du transformateur",
          "Elle chute toujours davantage que sous charge inductive",
          "Elle ne varie pas, car un condensateur ne consomme pas de puissance active",
          "Elle s'annule, car le transformateur sature",
        ],
        bonnes: [0],
        explication: "Avec $\\sin\\varphi < 0$, le terme $u_x\\sin\\varphi$ devient négatif et l'emporte sur $u_r\\cos\\varphi$ : la variation de tension change de signe.",
        resume: "Charge capacitive",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Fermer un transformateur au maximum de la tension supprime toujours le courant d'enclenchement.</p>",
        reponse: false,
        explication: "Seulement sans rémanence. Avec un flux rémanent, le flux part décalé : avec $60\\ \\%$ de rémanence, le modèle du poste donne encore environ $13\\ \\mathrm{A}$ crête.",
        resume: "Fermeture et rémanence",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Quel est le courant de court-circuit triphasé aux bornes basse tension d'un $400\\ \\mathrm{kVA}$, $410\\ \\mathrm{V}$, $u_{cc} = 4\\ \\%$, réseau amont supposé infiniment puissant, en kiloampères ?</p>",
        valeur: 400e3 / (RAC3 * 410) / 0.04 / 1000,
        unite: "kA",
        tolerance: 0.01,
        explication: "$I_k = I_{2n}/u_{cc} = 563{,}3/0{,}04 = 14{,}08\\ \\mathrm{kA}$ ; avec un réseau de $250\\ \\mathrm{MVA}$, il descend à $13{,}56\\ \\mathrm{kA}$.",
        resume: "Courant de court-circuit",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Une résistance de $1\\ \\mathrm{m\\Omega}$ est mesurée côté basse tension d'un transformateur de rapport $m = 0{,}0205$. Pour la ramener au primaire, il faut :</p>",
        options: ["la multiplier par $2380$", "la multiplier par $48{,}8$", "la diviser par $2380$", "la multiplier par $0{,}0205$"],
        bonnes: [0],
        explication: "Vue du primaire, une impédance du secondaire est divisée par $m^2$, donc multipliée par $1/m^2 = 2380$ : $2{,}38\\ \\Omega$.",
        resume: "Impédance ramenée",
      },
    ],
    { titre: "Dix questions sur le module" }
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
      { categorie: "Flux", question: "Qu'est-ce qui fixe l'amplitude du flux dans un transformateur en service ?", reponse: "La tension et la fréquence : $V = 4{,}44\\,f N A B_{max}$. La charge n'y change presque rien.", rappel: "Transformateur du poste : $1{,}60\\ \\mathrm{T}$." },
      { categorie: "Ampères-tours", question: "Pourquoi le courant primaire augmente-t-il avec la charge ?", reponse: "Les ampères-tours de la charge tendraient à réduire le flux ; le flux étant imposé, le primaire appelle des ampères-tours qui les compensent." },
      { categorie: "Plaque", question: "Que donne la plaque seule ?", reponse: "Les courants assignés, le rapport $m$, le couplage et donc le rapport des spires et le déphasage, le module de $Z_{cc}$ et le courant de court-circuit." },
      { categorie: "Essais", question: "Que donne l'essai à vide ?", reponse: "Sous tension assignée : $P_0$ et $i_0$, d'où $R_f = U^2/P_0$ et $X_m = U^2/Q_0$." },
      { categorie: "Essais", question: "Que donne l'essai en court-circuit ?", reponse: "Au courant assigné : $u_{cc}$ et $P_{cc}$, à ramener à $75\\ ^\\circ\\mathrm{C}$, d'où $R_{cc} = P_{cc}/(3I_{2n}^2)$ et $X_{cc}$." },
      { categorie: "Tension", question: "Quelle est la formule de Kapp ?", reponse: "$\\Delta U/U_{20} \\approx \\beta\\,(u_r\\cos\\varphi + u_x\\sin\\varphi)$, négative sous charge assez capacitive." },
      { categorie: "Rendement", question: "Quand le rendement est-il maximal ?", reponse: "Quand $\\beta^2 P_{cc} = P_0$, soit $\\beta_{opt} = \\sqrt{P_0/P_{cc}}$, souvent entre $30$ et $50\\ \\%$ en distribution." },
      { categorie: "Couplage", question: "Quel est le rapport des spires d'un Dyn11 ?", reponse: "$N_2/N_1 = m/\\sqrt{3}$ : le triangle porte la tension entre phases, l'étoile la tension simple." },
      { categorie: "Court-circuit", question: "Quel courant de court-circuit aux bornes basse tension ?", reponse: "$I_k = I_{2n}/u_{cc}$ avec un réseau amont infini, un peu moins en ajoutant son impédance.", rappel: "$400\\ \\mathrm{kVA}$, $4\\ \\%$ : $14{,}08\\ \\mathrm{kA}$." },
      { categorie: "Enclenchement", question: "Quel est le pire cas d'enclenchement ?", reponse: "Fermeture au passage par zéro de la tension avec une rémanence de même signe : flux jusqu'à $2\\lambda_m + \\lambda_r$, noyau saturé, courant de plusieurs dizaines de fois $I_n$, riche en rang $2$." },
    ],
    { titre: "Dix cartes sur le module des transformateurs" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["I2n = 160 000 / (√3 × 410) = 225,3 A", "Rcc = 2350 / (3 × 225,3²)", "    = 15,43 mΩ"], 540),
    legende: "Résistance série du transformateur de 160 kVA à partir de ses pertes en court-circuit.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["essai cc : U = ucc × Un, quelques %", "flux réduit dans le même rapport", "pertes fer ∝ B² : quasi nulles", "P mesurée ≈ pertes cuivre"], 540),
    legende: "Pourquoi l'essai en court-circuit mesure les pertes cuivre.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["branche magnétisante : Rf, Xm", "Rf = U² / P0", "Xm = U² / Q0, avec S0 = i0 Sn", "Pcc et ucc : impédance série"], 540),
    legende: "Données nécessaires à la branche magnétisante.",
  },
  {
    viewBox: "0 0 600 150",
    dessin: dessinBarres(
      [
        { nom: "conduction", valeur: 11.5, max: 20, texte: "11,5 kVA = k S" },
        { nom: "induction", valeur: 8.5, max: 20, texte: "8,5 kVA = (1 - k) S" },
      ],
      { x0: 130, l: 300, pied: "tirets : 20 kVA transmis" }
    ),
    legende: "Autotransformateur 400 / 230 V : la puissance propre vaut 42,5 % de la puissance transmise.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["longueur aller et retour : 30 m", "R = 0,0225 × 30 / 2,5 = 0,27 Ω", "S = 0,27 × 5² = 6,75 VA"], 540),
    legende: "Charge apportée par les câbles d'un TC à secondaire 5 A.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["rang 3 : trois courants en phase", "IN3 = 3 × 10 = 30 A", "côté HT d'un Dyn11 : rang 3 confiné", "dans le triangle"], 540),
    legende: "Courants de rang 3 dans le neutre, et rôle du triangle haute tension.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["R2 // RL = 10 k // 10 k = 5 kΩ", "Vs = 24 × 5 / (20 + 5) = 4,8 V", "à vide : 24 × 10 / 30 = 8,0 V", "la charge fait chuter la sortie"], 540),
    legende: "Diviseur chargé : la tension de sortie dépend de la charge, comme celle d'un transformateur.",
  },
];

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Un transformateur de $160\\ \\mathrm{kVA}$, $410\\ \\mathrm{V}$, a des pertes en court-circuit de $2350\\ \\mathrm{W}$ à $75\\ ^\\circ\\mathrm{C}$. Quelle est sa résistance série par phase côté basse tension, en milliohms ?</p>",
        valeur: (2350 / (3 * Math.pow(160e3 / (RAC3 * 410), 2))) * 1000,
        unite: "mΩ",
        tolerance: 0.01,
        explication: "$I_{2n} = 225{,}3\\ \\mathrm{A}$ ; $R_{cc} = 2350/(3 \\times 225{,}3^2) = 15{,}43\\ \\mathrm{m\\Omega}$.",
        resume: "Rcc à partir de Pcc",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. L'essai en court-circuit sous courant assigné mesure essentiellement les pertes cuivre.</p>",
        reponse: true,
        explication: "La tension appliquée ne vaut que $u_{cc}$, quelques pour cent : l'induction et donc les pertes fer sont réduites dans un rapport voisin de $u_{cc}^2$.",
        resume: "Ce que mesure l'essai en court-circuit",
      },
      {
        type: "qcm",
        enonce: repere(2) + "<p>Cette séance. Quelles données, absentes de la plupart des plaques, faut-il pour calculer la branche magnétisante ?</p>",
        options: [
          { texte: "Les pertes à vide $P_0$", juste: true },
          { texte: "Le courant à vide $i_0$", juste: true },
          { texte: "Les pertes en court-circuit $P_{cc}$" },
          { texte: "La tension de court-circuit $u_{cc}$" },
        ],
        multiple: true,
        explication: "$R_f = U^2/P_0$ et $X_m = U^2/Q_0$ avec $Q_0 = \\sqrt{(i_0S_n)^2 - P_0^2}$. $P_{cc}$ et $u_{cc}$ décrivent l'impédance série.",
        resume: "Données de la branche magnétisante",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Autotransformateurs, TC et TP. Un autotransformateur de $20\\ \\mathrm{kVA}$, $400\\ \\mathrm{V} / 230\\ \\mathrm{V}$, est à pleine charge. Quelle puissance traverse son noyau, en kilovoltampères ?</p>",
        valeur: 20 * (1 - 230 / 400),
        unite: "kVA",
        tolerance: 0.01,
        explication: "$k = 230/400 = 0{,}575$ ; $S_{propre} = (1 - k)S = 0{,}425 \\times 20 = 8{,}5\\ \\mathrm{kVA}$.",
        resume: "Puissance propre",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Cours Autotransformateurs, TC et TP. Un TC à secondaire $5\\ \\mathrm{A}$ est relié à sa centrale par deux fils de cuivre de $2{,}5\\ \\mathrm{mm^2}$ de $15\\ \\mathrm{m}$ chacun, $\\rho = 0{,}022\\,5\\ \\Omega\\,\\mathrm{mm^2/m}$. Quelle charge, en voltampères, apportent les câbles ?</p>",
        valeur: ((0.0225 * 30) / 2.5) * 25,
        unite: "VA",
        tolerance: 0.01,
        explication: "Aller et retour, $30\\ \\mathrm{m}$ : $R = 0{,}022\\,5 \\times 30/2{,}5 = 0{,}27\\ \\Omega$ ; $S = 0{,}27 \\times 25 = 6{,}75\\ \\mathrm{VA}$.",
        resume: "Charge des câbles d'un TC",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Révision 4 et mini-projet qualité réseau. Chaque phase d'un départ porte $10\\ \\mathrm{A}$ d'harmonique de rang $3$. Quel courant de rang $3$ circule dans le neutre, en ampères ?</p>",
        valeur: 30,
        unite: "A",
        tolerance: 0.01,
        explication: "Les rangs multiples de $3$ sont en phase sur les trois phases : ils s'ajoutent, $3 \\times 10 = 30\\ \\mathrm{A}$. En Dyn11, ces courants circulent dans le triangle haute tension et ne remontent pas sur le réseau.",
        resume: "Rang 3 dans le neutre",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Associations de résistances et diviseurs. Un diviseur $R_1 = 20\\ \\mathrm{k\\Omega}$, $R_2 = 10\\ \\mathrm{k\\Omega}$ alimenté sous $24\\ \\mathrm{V}$ débite dans une charge de $10\\ \\mathrm{k\\Omega}$ branchée sur $R_2$. Quelle est la tension de sortie, en volts ?</p>",
        valeur: (24 * 5) / 25,
        unite: "V",
        tolerance: 0.01,
        explication: "$R_2 \\parallel R_L = 5\\ \\mathrm{k\\Omega}$ ; $V_s = 24 \\times 5/25 = 4{,}8\\ \\mathrm{V}$ au lieu de $8{,}0\\ \\mathrm{V}$ à vide. Comme pour un transformateur, la source a une impédance interne et la charge fait chuter la tension.",
        resume: "Diviseur chargé",
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
    titre: "Où en suis-je sur le module des transformateurs ?",
  });
  if (auto) ressources.push(auto);
}
