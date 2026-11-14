/* ==========================================================================
   cours/protections-des-convertisseurs/cours.js
   Protections des convertisseurs : désaturation et énergie de court-circuit,
   surtension à l'ouverture et découplage, fusibles ultrarapides et intégrale
   de Joule, précharge et décharge du bus, carte temps-courant ; choix des
   protections du bus continu du variateur de la pompe du projet fil rouge.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = 2 * Math.PI;

/* Données de la pompe (valeurs des cours précédents ou supposées). */
const C_PUCE = 2330 * 712 * 1e-4 * 120e-6; /* 0,0199 J/K : puce de 1 cm², 120 µm */
const TJ0 = 108; /* température de jonction avant le défaut, °C */
const L_SIGMA = 80e-9; /* boucle de commutation, H */
const FOSTER = { r: [0.018, 0.052, 0.11, 0.12], tau: [0.0008, 0.008, 0.06, 0.4] };
const I_NOM = 52.6;
const I_C = 1.1 * I_NOM;
const TAU_MODELE = 60 / Math.log((1.5 * I_NOM) ** 2 / ((1.5 * I_NOM) ** 2 - I_C ** 2));
const I_DSAT = (7 - 0.85) / 0.011;

/* --------------------------------------------------------------------------
   Modèles physiques
   -------------------------------------------------------------------------- */

/** Enclenchement d'un IGBT sur court-circuit : renvoie l'état à l'instant t et les instants clés. */
function modeleDesat(p) {
  const { E, L, Isat, tb, toff, mode } = p;
  const t7 = (L * Math.min(Isat, I_DSAT)) / E;
  const candidats = [];
  if (mode === 0 || mode === 2) candidats.push({ t: Math.max(tb, t7) + 0.5e-6, nom: "désaturation" });
  if ((mode === 0 || mode === 1) && Isat >= 160) candidats.push({ t: (L * 160) / E + 5e-6, nom: "seuil de 160 A" });
  candidats.sort((a, b) => a.t - b.t);
  const declenche = candidats.length ? candidats[0] : null;
  function etat(t) {
    if (declenche && t >= declenche.t) {
      const i0 = Math.min((E * declenche.t) / L, Isat);
      if (t >= declenche.t + toff) return { i: 0, v: E, phase: 3 };
      return { i: i0 * (1 - (t - declenche.t) / toff), v: E + (L_SIGMA * i0) / toff, phase: 2 };
    }
    const brut = (E * t) / L;
    const i = Math.min(brut, Isat);
    const v = brut < Isat ? 0.85 + 0.011 * i : E;
    return { i, v, phase: declenche && t >= tb ? 1 : t < tb ? 0 : 1 };
  }
  return { etat, declenche };
}

/** Intégration de l'énergie reçue sur une grille de temps régulière. */
function integrerDesat(p, T = 30e-6, N = 3000) {
  const m = modeleDesat(p);
  const dt = T / N;
  const t = [0];
  const i = [0];
  const v = [m.etat(0).v];
  const W = [0];
  let tdes = 0;
  let vmax = 0;
  let prec = m.etat(0);
  for (let k = 1; k <= N; k += 1) {
    const tk = k * dt;
    const e = m.etat(tk);
    W.push(W[k - 1] + 0.5 * (prec.i * prec.v + e.i * e.v) * dt);
    if (e.v > 7 && e.i > 0) tdes += dt;
    if (e.i > 0) vmax = Math.max(vmax, e.v);
    t.push(tk);
    i.push(e.i);
    v.push(e.v);
    prec = e;
  }
  return { t, i, v, W, tdes, vmax, declenche: m.declenche, etat: m.etat, dt };
}

/** Ouverture d'un IGBT : barres L_b, découplage C_s, module L_m, résistance série R. */
function simulerOuverture(p) {
  const { E, I, tf, Lb, Lm, Cs } = p;
  const R = 0.05;
  const t0 = 0.3e-6;
  const T = 4e-6;
  const pts = { v: [], i: [] };
  if (Cs <= 0) {
    const L = Lb + Lm;
    for (let k = 0; k <= 400; k += 1) {
      const t = (k / 400) * T;
      let is = I;
      let d = 0;
      if (t >= t0 && t < t0 + tf) {
        is = I * (1 - (t - t0) / tf);
        d = I / tf;
      } else if (t >= t0 + tf) is = 0;
      pts.v.push([t * 1e6, E - R * (t < t0 ? I : 0) + L * d]);
      pts.i.push([t * 1e6, is]);
    }
    return { pts, vmax: E + (L * I) / tf, f: null };
  }
  const dt = 0.25e-9;
  let ib = I;
  let vs = E - R * I;
  let vmax = 0;
  let prochain = 0;
  const pasEch = T / 400;
  for (let t = 0; t <= T + dt / 2; t += dt) {
    let is = I;
    let d = 0;
    if (t >= t0 && t < t0 + tf) {
      is = I * (1 - (t - t0) / tf);
      d = I / tf;
    } else if (t >= t0 + tf) is = 0;
    const vce = vs + Lm * d;
    vmax = Math.max(vmax, vce);
    if (t >= prochain - dt / 2) {
      pts.v.push([t * 1e6, vce]);
      pts.i.push([t * 1e6, is]);
      prochain += pasEch;
    }
    const dib = (E - R * ib - vs) / Lb;
    const dvs = (ib - is) / Cs;
    ib += dib * dt;
    vs += dvs * dt;
  }
  return { pts, vmax, f: 1 / (TAU * Math.sqrt(Lb * Cs)) };
}

/** Tension redressée d'un pont triphasé idéal, mise sous tension au maximum. */
function tensionRedressee(t, U) {
  const V = (U * Math.SQRT2) / Math.sqrt(3);
  const w = TAU * 50;
  const phi = Math.PI / 3;
  const a = V * Math.sin(w * t + phi);
  const b = V * Math.sin(w * t + phi - TAU / 3);
  const c = V * Math.sin(w * t + phi + TAU / 3);
  return Math.max(a, b, c) - Math.min(a, b, c);
}

/** Mise sous tension du bus : précharge, puis fermeture de KM2 au seuil. */
function simulerPrecharge(p) {
  const { Rp, U, seuil, C } = p;
  const L = 1.206e-3;
  const R = 0.198;
  const Vd = 1.7;
  const dt = 4e-6;
  const T = 1;
  const Vcrete = U * Math.SQRT2 - Vd;
  let i = 0;
  let v = 0;
  let ferme = Rp <= 0;
  let tf = null;
  let ipk1 = 0;
  let ipk2 = 0;
  let vmax = 0;
  let WR = 0;
  let I2t = 0;
  const N = 1200;
  const lt = [];
  const ii = [];
  const vv = [];
  let k = 0;
  let tProchain = Math.pow(10, -4);
  for (let t = 0; t <= T; t += dt) {
    const Rt = R + (ferme ? 0 : Rp);
    const u = tensionRedressee(t, U) - Vd;
    let i2 = i + ((u - Rt * i - v) / L) * dt;
    if (i2 < 0 || (i === 0 && u < v)) i2 = 0;
    if (!ferme) WR += Rp * i * i * dt;
    I2t += i * i * dt;
    v += (0.5 * (i + i2) * dt) / C;
    i = i2;
    if (!ferme) {
      ipk1 = Math.max(ipk1, i);
      if (v >= (seuil / 100) * Vcrete) {
        ferme = true;
        tf = t;
      }
    } else if (Rp > 0) ipk2 = Math.max(ipk2, i);
    else ipk1 = Math.max(ipk1, i);
    vmax = Math.max(vmax, v);
    while (k <= N && t >= tProchain) {
      lt.push(Math.log10(tProchain * 1000));
      ii.push(i);
      vv.push(v);
      k += 1;
      tProchain = Math.pow(10, -4 + (4 * k) / N);
    }
  }
  return { lt, ii, vv, tf, ipk1, ipk2, vmax, WR, I2t, Vcrete };
}

/** Coupure par fusible : préarc, puis arc à décroissance linéaire (I²t total = 3,5 préarc). */
function modeleFusible(IpkA, pre, ratio = 3.5) {
  const Ip = IpkA * 1000;
  const w = TAU * 50;
  const dt = 1e-6;
  let s = 0;
  let t = 0;
  while (s < pre && t < 0.01) {
    const i = Math.SQRT2 * Ip * Math.sin(w * t);
    s += i * i * dt;
    t += dt;
  }
  const tm = t;
  const im = Math.SQRT2 * Ip * Math.sin(w * tm);
  const tarc = (3 * (ratio - 1) * pre) / (im * im);
  function courant(tt) {
    if (tt <= tm) return Math.SQRT2 * Ip * Math.sin(w * tt);
    if (tt >= tm + tarc) return 0;
    return im * (1 - (tt - tm) / tarc);
  }
  function i2t(tt) {
    if (tt <= tm) return Ip * Ip * (tt - Math.sin(2 * w * tt) / (2 * w));
    const ta = Math.min(tt - tm, tarc);
    const u = ta / tarc;
    return pre + im * im * tarc * (1 - Math.pow(1 - u, 3)) / 3;
  }
  return { tm, im, tarc, total: pre * ratio, courant, i2t, Ip };
}

/** Impédance thermique de Foster jonction-dissipateur de l'IGBT (cours précédent). */
function zFoster(t) {
  let z = 0;
  for (let k = 0; k < FOSTER.r.length; k += 1) z += FOSTER.r[k] * (1 - Math.exp(-t / FOSTER.tau[k]));
  return z;
}

/** Limite de l'IGBT sur la carte temps-courant : thermique en saturation, 10 µs désaturé. */
function limiteIGBT(I) {
  if (I >= I_DSAT) return 10e-6;
  const P = 0.85 * I + 0.011 * I * I;
  if (P * 0.3 <= 42.4) return Infinity;
  let bas = 1e-8;
  let haut = 1e4;
  for (let k = 0; k < 80; k += 1) {
    const milieu = Math.sqrt(bas * haut);
    if (P * zFoster(milieu) < 42.4) bas = milieu;
    else haut = milieu;
  }
  return bas;
}

function tempsModeleThermique(I) {
  if (I <= I_C) return Infinity;
  return TAU_MODELE * Math.log((I * I) / (I * I - I_C * I_C));
}

/* --------------------------------------------------------------------------
   Utilitaires de dessin
   -------------------------------------------------------------------------- */

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function nb(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
}

function marqueur(id) {
  return (
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto-start-reverse">' +
    '<path d="M0 0 10 5 0 10Z" fill="currentColor"/></marker>'
  );
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

function fleche(x1, y1, x2, y2, id, attributs = "") {
  return '<path d="M' + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + x2.toFixed(1) + " " + y2.toFixed(1) + '" marker-end="url(#' + id + ')"' + attributs + "/>";
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";

function ligneH(c, repere, couleurs, y, libelle, motif = [7, 5]) {
  const py = repere.versY(y);
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.setLineDash(motif);
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

function ligneV(c, repere, couleurs, x, libelle, motif = [2, 4]) {
  const px = repere.versX(x);
  if (px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  c.save();
  c.setLineDash(motif);
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
    const aGauche = px > repere.boite.x + repere.boite.l * 0.62;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

function pointRepere(c, repere, couleurs, x, y, libelle) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.fillStyle = couleurs.accent;
  c.beginPath();
  c.arc(px, py, 5, 0, TAU);
  c.fill();
  if (libelle) {
    c.font = POLICE;
    c.fillStyle = couleurs.texte;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.62;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -9 : 9), py - 9);
  }
  c.restore();
}

function traceCorrection(moteurApi, conteneur, options) {
  const traceur = moteurApi.sim.traceur(conteneur, { genre: "Correction visuelle", ratio: 0.42, echantillons: 400, ...options });
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

/** Boucle d'animation suspendue hors écran et arrêtée au nettoyage. */
function boucleAnimation(api, conteneur, pas) {
  if (api.mouvementReduit || typeof requestAnimationFrame !== "function") return;
  let visible = true;
  let id = 0;
  let dernier = 0;
  function image(instant) {
    id = 0;
    if (!visible) return;
    const ecoule = dernier ? Math.min(0.05, (instant - dernier) / 1000) : 0;
    dernier = instant;
    pas(ecoule);
    id = requestAnimationFrame(image);
  }
  if (typeof IntersectionObserver === "function") {
    const observateur = new IntersectionObserver((entrees) => {
      visible = entrees.some((e) => e.isIntersecting);
      if (visible && !id) {
        dernier = 0;
        id = requestAnimationFrame(image);
      }
    });
    observateur.observe(conteneur);
    nettoyeurs.push(() => observateur.disconnect());
  }
  id = requestAnimationFrame(image);
  nettoyeurs.push(() => {
    visible = false;
    if (id) cancelAnimationFrame(id);
    id = 0;
  });
}

/** Durée lisible : nanosecondes à secondes. */
function duree(api, t) {
  if (!Number.isFinite(t)) return "jamais";
  if (t < 1e-6) return nb(api, t * 1e9, 0) + " ns";
  if (t < 1e-3) return nb(api, t * 1e6, t < 1e-5 ? 2 : 1) + " µs";
  if (t < 1) return nb(api, t * 1e3, t < 0.01 ? 2 : 1) + " ms";
  if (t < 120) return nb(api, t, t < 10 ? 2 : 1) + " s";
  return nb(api, t / 60, 1) + " min";
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
  construireDesat(racine, api);
  construireOuverture(racine, api);
  construireFusible(racine, api);
  construirePrecharge(racine, api);
  construireCarte(racine, api);
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
   Renvois et tracés statiques
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
    ["#d-frise-figure svg", 1.5],
    ["#e-desat-figure svg", 1.6],
    ["#e-boucle-figure svg", 1.5],
    ["#f-schema-principal svg", 1.9],
    ["#h-figure svg", 1.3],
  ];
  for (const [selecteur, d] of schemas) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree: d }));
  }
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  if (!racine.querySelector("#c-minitest")) return;
  const cible = "#c-minitest";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c1-inductance",
      titre: "Tension aux bornes d'une inductance",
      niveau: "fondamental",
      enonce: "<p>Le courant dans une inductance de $2\\ \\mu\\mathrm{H}$ décroît linéairement de $10\\ \\mathrm{A}$ à zéro en $1\\ \\mu\\mathrm{s}$. Quelle tension, en valeur absolue, apparaît à ses bornes pendant la décroissance, en volts ?</p>",
      valeur: 20,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension",
      etapes: [
        { texte: "Pente du courant : $\\mathrm{d}i/\\mathrm{d}t = -10/10^{-6} = -10^{7}\\ \\mathrm{A/s}$." },
        { texte: "$|v_L| = L\\,|\\mathrm{d}i/\\mathrm{d}t| = 2 \\times 10^{-6} \\times 10^{7} = 20\\ \\mathrm{V}$.", note: "Le signe dépend de la convention ; ce qui compte ici, c'est que la tension existe tant que le courant varie, et qu'elle est d'autant plus grande que la coupure est rapide." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Courant décroissant et tension de l'inductance",
          xTitre: "temps", xUnite: "µs", yTitre: "A ou V", yUnite: "",
          xMin: 0, xMax: 2, yMin: 0, yMax: 24,
          series: [
            { id: "i", nom: "courant i (A)", couleur: "serie-1", epaisseur: 2.4, fonction: (t) => (t < 0.5 ? 10 : t < 1.5 ? 10 * (1.5 - t) : 0) },
            { id: "v", nom: "tension |v_L| (V)", couleur: "serie-2", epaisseur: 2.4, fonction: (t) => (t >= 0.5 && t < 1.5 ? 20 : 0) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            pointRepere(c, r, couleurs, 1, 20, "20 V pendant la descente");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-rc",
      titre: "Charge d'un condensateur à travers une résistance",
      niveau: "fondamental",
      enonce: "<p>Un condensateur de $1\\ \\mathrm{mF}$, initialement déchargé, est chargé par une source continue à travers $10\\ \\Omega$. Au bout de combien de millisecondes sa tension atteint-elle $95\\ \\%$ de la tension de la source ?</p>",
      valeur: 10 * Math.log(20),
      unite: "ms",
      tolerance: 0.03,
      chiffres: 1,
      libelleChamp: "Instant",
      etapes: [
        { texte: "Constante de temps : $\\tau = RC = 10 \\times 10^{-3} = 10\\ \\mathrm{ms}$." },
        { texte: "$1 - e^{-t/\\tau} = 0{,}95$ donne $t = \\tau\\ln 20$." },
        { texte: "$t = 10 \\times 3{,}00 = 30{,}0\\ \\mathrm{ms}$, soit environ $3\\tau$.", note: "C'est la logique de la précharge : on attend que le bus soit presque chargé avant de court-circuiter la résistance." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Charge RC, τ = 10 ms",
          xTitre: "temps", xUnite: "ms", yTitre: "v_C / V", yUnite: "",
          xMin: 0, xMax: 50, yMin: 0, yMax: 1.05,
          series: [{ id: "v", nom: "v_C / V", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => 1 - Math.exp(-t / 10) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0.95, "95 %");
            pointRepere(c, r, couleurs, 29.96, 0.95, "30 ms");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c3-adiabatique",
      titre: "Échauffement sans pertes",
      niveau: "fondamental",
      enonce: "<p>Un petit corps de capacité thermique $0{,}01\\ \\mathrm{J/K}$ reçoit $1\\ \\mathrm{J}$ en quelques microsecondes, trop vite pour céder de la chaleur. De combien de kelvins s'échauffe-t-il ?</p>",
      valeur: 100,
      unite: "K",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Échauffement",
      etapes: [
        { texte: "En adiabatique, toute l'énergie reste dans le corps : $\\Delta T = W/C_{th}$." },
        { texte: "$\\Delta T = 1/0{,}01 = 100\\ \\mathrm{K}$.", note: "Une puce de silicium d'un centimètre carré a une capacité thermique voisine de $0{,}02\\ \\mathrm{J/K}$ : quelques joules suffisent à la détruire." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["W = 1 J reçu en quelques µs", "aucune fuite : ΔT = W / C_th", "= 1 / 0,01 = 100 K"], "Échauffement adiabatique.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   E. Enclenchement sur court-circuit et désaturation
   -------------------------------------------------------------------------- */

const MODES_DESAT = ["désaturation et seuil de 160 A", "seuil de 160 A seul", "désaturation seule", "aucune protection"];

function construireDesat(racine, api) {
  if (!racine.querySelector("#e-desat-trace")) return;
  const reglages = { E: 540, lL: -1, Isat: 800, tb: 3, toff: 1, mode: 0 };
  let res = null;
  let curseurT = 0;

  const trace = api.sim.traceur("#e-desat-trace", {
    titre: "Courant de collecteur et tension collecteur-émetteur",
    xTitre: "temps", xUnite: "µs", yTitre: "A ou V", yUnite: "",
    xMin: 0, xMax: 30, yMin: 0, yMax: 1300,
    ratio: 0.42,
    series: [
      { id: "i", nom: "courant i_C (A)", couleur: "serie-1", epaisseur: 2.6 },
      { id: "v", nom: "tension v_CE (V)", couleur: "serie-2", epaisseur: 2.2 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 1200, "V_CES = 1200 V", [9, 5]);
      ligneV(c, r, couleurs, 10, "tenue 10 µs", [3, 3]);
      ligneV(c, r, couleurs, curseurT, "");
    },
  });
  if (trace) ressources.push(trace);

  const traceT = api.sim.traceur("#e-desat-temp", {
    titre: "Température de la puce, échauffement adiabatique",
    xTitre: "temps", xUnite: "µs", yTitre: "T_j", yUnite: "°C",
    xMin: 0, xMax: 30, yMin: 100, yMax: 400,
    ratio: 0.3,
    series: [{ id: "T", nom: "jonction T_j", couleur: "serie-3", epaisseur: 2.6 }],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, curseurT, "");
    },
  });
  if (traceT) ressources.push(traceT);

  /* Schéma vivant : état du driver et colonne de température. */
  const conteneur = racine.querySelector("#e-desat-vivant");
  let etats = [];
  let colonne = null;
  let libT = null;
  let libEtat = null;
  if (conteneur) {
    const svg = svgEl("svg", { viewBox: "0 0 680 170", "aria-label": "État du driver au fil du temps : masquage, surveillance, ouverture douce, bloqué ; colonne de température de la puce" });
    const base = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round" });
    const noms = ["masquage", "surveillance", "ouverture douce", "bloqué"];
    let b = "";
    noms.forEach((n, k) => {
      b += '<rect x="' + (20 + k * 130) + '" y="40" width="116" height="40" rx="8"/>';
    });
    b += '<rect x="580" y="20" width="40" height="130" rx="4"/><path d="M574 ' + (150 - ((150 - 100) / 300) * 130).toFixed(1) + 'H626" stroke-dasharray="4 3"/>';
    base.innerHTML = b;
    svg.appendChild(base);
    etats = noms.map((n, k) => {
      const r = svgEl("rect", { x: 22 + k * 130, y: 42, width: 112, height: 36, rx: 7, style: "fill: var(--serie-2); opacity: 0" });
      svg.appendChild(r);
      return r;
    });
    const ecr = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "12" });
    ecr.innerHTML = noms.map((n, k) => texte(28 + k * 130, 64, n, ' font-size="11"')).join("") + texte(20, 24, "état du driver, surligné à l'instant du lecteur", ' font-size="11"') + texte(632, 132, "150", ' font-size="10.5"') + texte(632, 154, "100", ' font-size="10.5"') + texte(632, 24, "400 °C", ' font-size="10.5"');
    svg.appendChild(ecr);
    colonne = svgEl("rect", { x: 584, y: 150, width: 32, height: 0, rx: 3, style: "fill: var(--serie-3); opacity: 0.85" });
    svg.appendChild(colonne);
    libT = svgEl("text", { x: 440, y: 110, fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "12" });
    libEtat = svgEl("text", { x: 20, y: 120, fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "12" });
    svg.append(libT, libEtat);
    conteneur.appendChild(svg);
    ressources.push(api.dessiner(base, { declencheur: conteneur, duree: 1 }));
  }

  const valeurs = api.sim.valeurs("#e-desat-valeurs", [
    { id: "t", libelle: "Instant", format: (v) => v },
    { id: "i", libelle: "Courant de collecteur", unite: "A", decimales: 0 },
    { id: "v", libelle: "Tension collecteur-émetteur", unite: "V", decimales: 1 },
    { id: "W", libelle: "Énergie reçue par la puce", unite: "J", decimales: 3 },
    { id: "Tj", libelle: "Température de jonction adiabatique", unite: "°C", decimales: 0 },
    { id: "trip", libelle: "Protection qui agit et instant", format: (v) => v },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function parametres() {
    return { E: reglages.E, L: Math.pow(10, reglages.lL) * 1e-6, Isat: reglages.Isat, tb: reglages.tb * 1e-6, toff: reglages.toff * 1e-6, mode: reglages.mode };
  }

  function majInstant(tus) {
    curseurT = tus;
    if (!res) return;
    const k = Math.min(res.t.length - 1, Math.max(0, Math.round((tus * 1e-6) / res.dt)));
    const e = res.etat(tus * 1e-6);
    const Tj = TJ0 + res.W[k] / C_PUCE;
    if (colonne) {
      const h = Math.max(0, Math.min(130, ((Tj - 100) / 300) * 130));
      colonne.setAttribute("y", (150 - h).toFixed(1));
      colonne.setAttribute("height", h.toFixed(1));
      libT.textContent = "T_j = " + nb(api, Tj, 0) + " °C";
      let phase;
      if (res.declenche && tus * 1e-6 >= res.declenche.t + reglages.toff * 1e-6) phase = 3;
      else if (res.declenche && tus * 1e-6 >= res.declenche.t) phase = 2;
      else if (tus * 1e-6 < reglages.tb * 1e-6 && reglages.mode !== 1 && reglages.mode !== 3) phase = 0;
      else phase = reglages.mode === 3 ? -1 : 1;
      etats.forEach((r, j) => r.style.setProperty("opacity", j === phase ? "0.35" : "0"));
      libEtat.textContent = reglages.mode === 3 ? "aucune protection active : le courant persiste" : e.v > 7 && e.i > 0 ? "IGBT désaturé : v_CE proche de E" : e.i > 0 ? "IGBT saturé : v_CE faible" : res.declenche && tus * 1e-6 >= res.declenche.t ? "IGBT bloqué : v_CE = E" : "enclenchement";
    }
    if (valeurs) valeurs.maj({ t: nb(api, tus, 2) + " µs", i: e.i, v: e.v, W: res.W[k], Tj });
    if (trace) trace.rafraichir();
    if (traceT) traceT.rafraichir();
  }

  function maj() {
    const p = parametres();
    res = integrerDesat(p);
    const ptsI = [];
    const ptsV = [];
    const ptsT = [];
    for (let k = 0; k < res.t.length; k += 6) {
      const tus = res.t[k] * 1e6;
      ptsI.push([tus, res.i[k]]);
      ptsV.push([tus, res.i[k] > 0 || k === 0 ? res.v[k] : p.E]);
      ptsT.push([tus, TJ0 + res.W[k] / C_PUCE]);
    }
    const Tmax = TJ0 + res.W[res.W.length - 1] / C_PUCE;
    if (trace) {
      trace.definirPlage({ yMin: 0, yMax: Math.max(1300, Math.ceil((Math.max(res.vmax, p.Isat) * 1.1) / 100) * 100) });
      trace.definirDonnees("i", ptsI);
      trace.definirDonnees("v", ptsV);
    }
    if (traceT) {
      traceT.definirPlage({ yMin: 100, yMax: Math.max(200, Math.ceil((Tmax + 20) / 50) * 50) });
      traceT.definirDonnees("T", ptsT);
    }
    const W = res.W[res.W.length - 1];
    let verdict;
    if (!res.declenche) verdict = "aucune coupure en 30 µs : destruction de l'IGBT";
    else if (res.vmax > 1200) verdict = "surtension à l'ouverture au-delà de 1200 V : destruction";
    else if (res.tdes > 10e-6) verdict = "plus de 10 µs désaturé : hors de la tenue garantie";
    else if (res.vmax > 960) verdict = "tenu, mais v_CE au-delà de la règle de 960 V";
    else verdict = "tenu : " + duree(api, res.tdes) + " désaturé, crête de v_CE " + nb(api, res.vmax, 0) + " V";
    if (valeurs) {
      valeurs.maj({
        trip: res.declenche ? res.declenche.nom + " à " + duree(api, res.declenche.t) : "aucune",
        verdict,
      });
    }
    if (trace) {
      trace.definirMesures([
        { nom: "Pente de montée E / L", valeur: nb(api, p.E / (p.L * 1e6), 0) + " A/µs" },
        { nom: "Énergie totale et échauffement", valeur: nb(api, W, 2) + " J ; " + nb(api, W / C_PUCE, 0) + " K" },
        { nom: "Durée désaturée", valeur: duree(api, res.tdes) },
      ]);
    }
    majInstant(curseurT);
  }

  const curseurs = api.sim.curseurs(
    "#e-desat-curseurs",
    [
      { id: "E", libelle: "Tension du bus E", min: 300, max: 800, pas: 10, valeur: reglages.E, unite: "V" },
      { id: "lL", libelle: "Inductance de la boucle de défaut", min: -1.7, max: 1.5, pas: 0.05, valeur: reglages.lL, format: (x) => (Math.pow(10, x) < 1 ? nb(api, Math.pow(10, x) * 1000, 0) + " nH" : nb(api, Math.pow(10, x), 1) + " µH") },
      { id: "Isat", libelle: "Courant de saturation I_sat", min: 300, max: 1000, pas: 10, valeur: reglages.Isat, unite: "A" },
      { id: "tb", libelle: "Temps de masquage t_bl", min: 0.5, max: 8, pas: 0.1, valeur: reglages.tb, unite: "µs" },
      { id: "toff", libelle: "Durée d'ouverture douce", min: 0.1, max: 3, pas: 0.1, valeur: reglages.toff, unite: "µs" },
      { id: "mode", libelle: "Protections actives", min: 0, max: 3, pas: 1, valeur: reglages.mode, format: (x) => MODES_DESAT[Math.round(x)] },
    ],
    (lues) => {
      reglages.E = lues.E;
      reglages.lL = lues.lL;
      reglages.Isat = lues.Isat;
      reglages.tb = lues.tb;
      reglages.toff = lues.toff;
      reglages.mode = Math.round(lues.mode);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-desat-lecteur", {
    de: 0,
    a: 30,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Temps écoulé depuis l'enclenchement, de 0 à 30 µs",
    rappel: (v) => majInstant(v),
  });
  if (lecteur) ressources.push(lecteur);
  maj();
}

/* --------------------------------------------------------------------------
   E. Surtension à l'ouverture
   -------------------------------------------------------------------------- */

function construireOuverture(racine, api) {
  if (!racine.querySelector("#e-ouverture-trace")) return;
  const reglages = { E: 800, I: 160, tf: 100, Lb: 60, Lm: 20, Cs: 2.2 };

  const trace = api.sim.traceur("#e-ouverture-trace", {
    titre: "Ouverture de l'IGBT : tension et courant",
    xTitre: "temps", xUnite: "µs", yTitre: "V ou A", yUnite: "",
    xMin: 0, xMax: 4, yMin: 0, yMax: 1300,
    ratio: 0.45,
    series: [
      { id: "v", nom: "tension v_CE (V)", couleur: "serie-2", epaisseur: 2.6 },
      { id: "i", nom: "courant de l'IGBT (A)", couleur: "serie-1", epaisseur: 2.2 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 1200, "V_CES = 1200 V", [10, 5]);
      ligneH(c, r, couleurs, 960, "règle : 960 V", [4, 4]);
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-ouverture-valeurs", [
    { id: "vmax", libelle: "Crête de v_CE", unite: "V", decimales: 1 },
    { id: "marge", libelle: "Marge sous la règle de 960 V", unite: "V", decimales: 1 },
    { id: "borne", libelle: "Borne E + L_m I/t_f + I √(L_b/C_s)", format: (v) => v },
    { id: "f", libelle: "Fréquence d'oscillation L_b C_s", format: (v) => v },
    { id: "energie", libelle: "Énergie des barres ½ L_b I²", unite: "mJ", decimales: 2 },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    const p = { E: reglages.E, I: reglages.I, tf: reglages.tf * 1e-9, Lb: reglages.Lb * 1e-9, Lm: reglages.Lm * 1e-9, Cs: reglages.Cs * 1e-6 };
    const res = simulerOuverture(p);
    if (trace) {
      trace.definirPlage({ yMin: 0, yMax: Math.max(1300, Math.ceil((Math.max(res.vmax, p.I) * 1.08) / 100) * 100) });
      trace.definirDonnees("v", res.pts.v);
      trace.definirDonnees("i", res.pts.i);
    }
    const borne = p.Cs > 0 ? p.E + (p.Lm * p.I) / p.tf + p.I * Math.sqrt(p.Lb / p.Cs) : p.E + ((p.Lb + p.Lm) * p.I) / p.tf;
    let verdict;
    if (res.vmax > 1200) verdict = "au-delà de V_CES : avalanche, destruction probable";
    else if (res.vmax > 960) verdict = "sous V_CES mais au-delà de la règle des 80 %";
    else verdict = "conforme à la règle des 80 %";
    if (valeurs) {
      valeurs.maj({
        vmax: res.vmax,
        marge: 960 - res.vmax,
        borne: nb(api, borne, 0) + " V",
        f: res.f ? nb(api, res.f / 1000, 0) + " kHz" : "sans découplage",
        energie: 0.5 * p.Lb * p.I * p.I * 1000,
        verdict,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-ouverture-curseurs",
    [
      { id: "E", libelle: "Tension du bus E", min: 300, max: 850, pas: 10, valeur: reglages.E, unite: "V" },
      { id: "I", libelle: "Courant coupé I", min: 20, max: 900, pas: 10, valeur: reglages.I, unite: "A" },
      { id: "tf", libelle: "Durée de descente t_f", min: 30, max: 1500, pas: 10, valeur: reglages.tf, unite: "ns" },
      { id: "Lb", libelle: "Inductance des barres L_b", min: 0, max: 200, pas: 5, valeur: reglages.Lb, unite: "nH" },
      { id: "Lm", libelle: "Inductance du module L_m", min: 5, max: 60, pas: 1, valeur: reglages.Lm, unite: "nH" },
      { id: "Cs", libelle: "Condensateur de découplage C_s", min: 0, max: 6, pas: 0.1, valeur: reglages.Cs, unite: "µF" },
    ],
    (lues) => {
      Object.assign(reglages, lues);
      if (reglages.Lb < 1) reglages.Lb = 1;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   E. Coupure par fusible ultrarapide
   -------------------------------------------------------------------------- */

function construireFusible(racine, api) {
  if (!racine.querySelector("#e-fusible-trace")) return;
  const reglages = { Ip: 10, pre: 700 };
  let fus = modeleFusible(reglages.Ip, reglages.pre);
  let curseur = 0;

  const trace = api.sim.traceur("#e-fusible-trace", {
    titre: "Courant présumé et courant coupé par le fusible",
    xTitre: "temps", xUnite: "ms", yTitre: "courant", yUnite: "kA",
    xMin: 0, xMax: 10, yMin: 0, yMax: 16,
    ratio: 0.42,
    series: [
      { id: "p", nom: "courant présumé", couleur: "serie-6", epaisseur: 1.8 },
      { id: "c", nom: "courant coupé", couleur: "serie-1", epaisseur: 2.8 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, fus.tm * 1000, "fin du préarc", [7, 4]);
      ligneV(c, r, couleurs, curseur, "");
      pointRepere(c, r, couleurs, fus.tm * 1000, fus.im / 1000, "");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-fusible-valeurs", [
    { id: "t", libelle: "Instant", unite: "ms", decimales: 2 },
    { id: "i", libelle: "Courant à cet instant", unite: "kA", decimales: 2 },
    { id: "s", libelle: "I²t accumulé", unite: "A²s", decimales: 0 },
    { id: "tm", libelle: "Fusion du ruban et courant coupé", format: (v) => v },
    { id: "tt", libelle: "Fin de la coupure", format: (v) => v },
    { id: "verdict", libelle: "I²t total face aux 5000 A²s des diodes", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function majInstant(tms) {
    curseur = tms;
    const t = tms / 1000;
    if (valeurs) valeurs.maj({ t: tms, i: Math.max(0, fus.courant(t)) / 1000, s: fus.i2t(t) });
    if (trace) trace.rafraichir();
  }

  function maj() {
    fus = modeleFusible(reglages.Ip, reglages.pre);
    const p = [];
    const c = [];
    for (let k = 0; k <= 400; k += 1) {
      const t = (k / 400) * 0.01;
      p.push([t * 1000, Math.SQRT2 * fus.Ip * Math.sin(TAU * 50 * t) / 1000]);
      c.push([t * 1000, Math.max(0, fus.courant(t)) / 1000]);
    }
    if (trace) {
      trace.definirPlage({ yMin: 0, yMax: Math.ceil((Math.SQRT2 * reglages.Ip * 1.1) / 2) * 2 });
      trace.definirDonnees("p", p);
      trace.definirDonnees("c", c);
      trace.definirMesures([
        { nom: "Crête présumée", valeur: nb(api, Math.SQRT2 * reglages.Ip, 1) + " kA à 5 ms" },
        { nom: "Courant coupé, part de la crête", valeur: nb(api, (100 * fus.im) / (Math.SQRT2 * fus.Ip), 0) + " %" },
      ]);
    }
    if (valeurs) {
      valeurs.maj({
        tm: duree(api, fus.tm) + " ; " + nb(api, fus.im / 1000, 2) + " kA",
        tt: duree(api, fus.tm + fus.tarc) + " (arc " + duree(api, fus.tarc) + ")",
        verdict: nb(api, fus.total, 0) + " A²s : " + (fus.total < 5000 ? "diodes protégées" : "diodes en danger"),
      });
    }
    majInstant(curseur);
  }

  const curseurs = api.sim.curseurs(
    "#e-fusible-curseurs",
    [
      { id: "Ip", libelle: "Courant présumé efficace", min: 1.5, max: 40, pas: 0.5, valeur: reglages.Ip, unite: "kA" },
      { id: "pre", libelle: "I²t de préarc du fusible", min: 200, max: 2000, pas: 50, valeur: reglages.pre, unite: "A²s" },
    ],
    (lues) => {
      reglages.Ip = lues.Ip;
      reglages.pre = lues.pre;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-fusible-lecteur", {
    de: 0,
    a: 10,
    duree: 8,
    boucle: false,
    auto: false,
    libelle: "Temps écoulé depuis le début du court-circuit, de 0 à 10 ms",
    rappel: (v) => majInstant(v),
  });
  if (lecteur) ressources.push(lecteur);
  maj();
}

/* --------------------------------------------------------------------------
   E. Précharge du bus, circuit animé
   -------------------------------------------------------------------------- */

function construirePrecharge(racine, api) {
  if (!racine.querySelector("#e-precharge-courant")) return;
  const reglages = { Rp: 47, U: 400, seuil: 95, C: 2.2 };
  let res = null;
  let lt = -1;
  let iInst = 0;
  let fermeInst = false;
  let phase = 0;

  /* Circuit vivant. */
  const conteneur = racine.querySelector("#e-precharge-vivant");
  let particules = [];
  let contact = null;
  let barre = null;
  let libI = null;
  let libV = null;
  const CHEMIN_RP = [[150, 60], [250, 60], [290, 100], [420, 100], [460, 60], [560, 60], [560, 200], [80, 200], [80, 60], [150, 60]];
  const CHEMIN_KM = [[150, 60], [250, 60], [290, 30], [420, 30], [460, 60], [560, 60], [560, 200], [80, 200], [80, 60], [150, 60]];
  function pointSur(chemin, u) {
    const long = [];
    let total = 0;
    for (let k = 1; k < chemin.length; k += 1) {
      const d = Math.hypot(chemin[k][0] - chemin[k - 1][0], chemin[k][1] - chemin[k - 1][1]);
      long.push(d);
      total += d;
    }
    let s = (((u % 1) + 1) % 1) * total;
    for (let k = 0; k < long.length; k += 1) {
      if (s <= long[k]) {
        const w = s / long[k];
        return [chemin[k][0] + w * (chemin[k + 1][0] - chemin[k][0]), chemin[k][1] + w * (chemin[k + 1][1] - chemin[k][1])];
      }
      s -= long[k];
    }
    return chemin[0];
  }
  if (conteneur) {
    const svg = svgEl("svg", { viewBox: "0 0 700 240", "aria-label": "Circuit de précharge animé : réseau et pont, inductance du réseau, résistance de précharge Rp en parallèle avec le contact KM2, condensateur du bus avec sa barre de charge ; points mobiles figurant le courant" });
    const base = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" });
    base.innerHTML =
      '<rect x="20" y="80" width="120" height="80" rx="8"/><path d="M140 60H150M80 80V60H150M80 160V200H560V170"/>' +
      '<path d="M150 60C158 46 172 46 180 60C188 46 202 46 210 60C218 46 232 46 240 60H250"/>' +
      '<path d="M250 60L290 100H330M380 100H420L460 60M250 60L290 30H330M392 30H420L460 60"/>' +
      '<rect x="330" y="90" width="50" height="20" rx="2"/><path d="M460 60H560V120"/>' +
      '<path d="M530 120H590M530 130H590" stroke-width="2.8"/><path d="M560 130V170"/>' +
      '<rect x="620" y="40" width="26" height="160" rx="3" stroke-width="1.4"/>';
    svg.appendChild(base);
    contact = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.4", "stroke-linecap": "round", d: "M330 30L382 14" });
    svg.appendChild(contact);
    barre = svgEl("rect", { x: 623, y: 197, width: 20, height: 0, rx: 2, style: "fill: var(--serie-2); opacity: 0.85" });
    svg.appendChild(barre);
    const pts = svgEl("g", { stroke: "none", style: "fill: var(--serie-1)" });
    for (let k = 0; k < 14; k += 1) {
      const c = svgEl("circle", { r: 4, cx: 150, cy: 60 });
      pts.appendChild(c);
      particules.push(c);
    }
    svg.appendChild(pts);
    const ecr = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "12" });
    ecr.innerHTML =
      texte(30, 110, "réseau 3~") + texte(30, 128, "et pont") + texte(160, 40, "L = 1,21 mH") + texte(336, 128, "R_p") + texte(334, 22, "KM2") +
      texte(500, 54, "+") + texte(500, 216, "- référence") + texte(596, 136, "C") + texte(610, 230, "v_C", ' font-size="11"') + texte(660, 46, "900 V", ' font-size="10.5"');
    svg.appendChild(ecr);
    libI = svgEl("text", { x: 170, y: 160, fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "12.5" });
    libV = svgEl("text", { x: 170, y: 180, fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "12.5" });
    svg.append(libI, libV);
    conteneur.appendChild(svg);
    ressources.push(api.dessiner(base, { declencheur: conteneur, duree: 1.2 }));
  }

  function placerParticules() {
    const chemin = fermeInst ? CHEMIN_KM : CHEMIN_RP;
    particules.forEach((p, k) => {
      const [x, y] = pointSur(chemin, phase + k / particules.length);
      p.setAttribute("cx", x.toFixed(1));
      p.setAttribute("cy", y.toFixed(1));
      p.setAttribute("opacity", iInst > 0.5 ? "1" : "0.15");
    });
  }

  const traceI = api.sim.traceur("#e-precharge-courant", {
    titre: "Courant de charge du bus",
    xTitre: "log10 du temps en ms", xUnite: "", yTitre: "courant", yUnite: "A",
    xMin: -1, xMax: 3, yMin: 0, yMax: 20,
    ratio: 0.32,
    series: [{ id: "i", nom: "courant i", couleur: "serie-1", epaisseur: 2.6 }],
    surDessin({ c, repere: r, couleurs }) {
      if (res && res.tf) ligneV(c, r, couleurs, Math.log10(res.tf * 1000), "KM2 fermé", [7, 4]);
      ligneV(c, r, couleurs, lt, "");
    },
  });
  if (traceI) ressources.push(traceI);

  const traceV = api.sim.traceur("#e-precharge-tension", {
    titre: "Tension du bus",
    xTitre: "log10 du temps en ms", xUnite: "", yTitre: "v_C", yUnite: "V",
    xMin: -1, xMax: 3, yMin: 0, yMax: 1000,
    ratio: 0.32,
    series: [{ id: "v", nom: "tension du bus v_C", couleur: "serie-2", epaisseur: 2.6 }],
    surDessin({ c, repere: r, couleurs }) {
      if (res) ligneH(c, r, couleurs, res.Vcrete, "crête redressée", [7, 5]);
      ligneH(c, r, couleurs, 800, "seuil de 800 V", [3, 3]);
      if (res && res.tf) ligneV(c, r, couleurs, Math.log10(res.tf * 1000), "", [7, 4]);
      ligneV(c, r, couleurs, lt, "");
    },
  });
  if (traceV) ressources.push(traceV);

  const valeurs = api.sim.valeurs("#e-precharge-valeurs", [
    { id: "t", libelle: "Instant", format: (v) => v },
    { id: "i", libelle: "Courant", unite: "A", decimales: 1 },
    { id: "v", libelle: "Tension du bus", unite: "V", decimales: 1 },
    { id: "pk", libelle: "Pointe pendant la précharge, puis à la fermeture", format: (v) => v },
    { id: "tf", libelle: "Fermeture de KM2", format: (v) => v },
    { id: "vmax", libelle: "Tension maximale du bus", unite: "V", decimales: 0 },
    { id: "W", libelle: "Énergie dissipée dans R_p et borne ½ C V̂²", format: (v) => v },
    { id: "i2t", libelle: "I²t de l'appel, face au préarc de 700 A²s", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function lire(tableau, x) {
    const k = Math.max(0, Math.min(res.lt.length - 1, Math.round(((x + 1) / 4) * (res.lt.length - 1))));
    return tableau[k];
  }

  function majInstant(x) {
    lt = x;
    if (!res) return;
    iInst = lire(res.ii, x);
    const v = lire(res.vv, x);
    const t = Math.pow(10, x) / 1000;
    fermeInst = reglages.Rp <= 0 || (res.tf !== null && t >= res.tf);
    if (contact) contact.setAttribute("d", fermeInst ? "M330 30L392 30" : "M330 30L382 14");
    if (barre) {
      const h = Math.max(0, Math.min(154, (v / 900) * 154));
      barre.setAttribute("y", (197 - h).toFixed(1));
      barre.setAttribute("height", h.toFixed(1));
    }
    if (libI) libI.textContent = "i = " + nb(api, iInst, 1) + " A";
    if (libV) libV.textContent = "v_C = " + nb(api, v, 0) + " V" + (fermeInst ? ", KM2 fermé" : ", KM2 ouvert");
    placerParticules();
    if (valeurs) valeurs.maj({ t: duree(api, t), i: iInst, v });
    if (traceI) traceI.rafraichir();
    if (traceV) traceV.rafraichir();
  }

  function maj() {
    res = simulerPrecharge({ Rp: reglages.Rp, U: reglages.U, seuil: reglages.seuil, C: reglages.C * 1e-3 });
    const ptsI = res.lt.map((x, k) => [x, res.ii[k]]);
    const ptsV = res.lt.map((x, k) => [x, res.vv[k]]);
    const imax = Math.max(res.ipk1, res.ipk2);
    if (traceI) {
      traceI.definirPlage({ yMin: 0, yMax: Math.max(10, Math.ceil((imax * 1.1) / 10) * 10) });
      traceI.definirDonnees("i", ptsI);
    }
    if (traceV) {
      traceV.definirPlage({ yMin: 0, yMax: Math.max(900, Math.ceil((res.vmax * 1.08) / 100) * 100) });
      traceV.definirDonnees("v", ptsV);
    }
    const borne = 0.5 * reglages.C * 1e-3 * res.Vcrete * res.Vcrete;
    if (valeurs) {
      valeurs.maj({
        pk: reglages.Rp <= 0 ? nb(api, res.ipk1, 0) + " A, sans précharge" : nb(api, res.ipk1, 1) + " A ; " + (res.tf ? nb(api, res.ipk2, 1) + " A" : "pas de fermeture"),
        tf: reglages.Rp <= 0 ? "sans objet" : res.tf ? duree(api, res.tf) : "seuil non atteint en 1 s",
        vmax: res.vmax,
        W: reglages.Rp <= 0 ? "sans objet" : nb(api, res.WR, 0) + " J ; " + nb(api, borne, 0) + " J",
        i2t: nb(api, res.I2t, 0) + " A²s" + (res.I2t > 700 ? " : fusibles sollicités" : ""),
      });
    }
    majInstant(lt);
  }

  const curseurs = api.sim.curseurs(
    "#e-precharge-curseurs",
    [
      { id: "Rp", libelle: "Résistance de précharge R_p", min: 0, max: 100, pas: 1, valeur: reglages.Rp, format: (x) => (x <= 0 ? "sans précharge" : nb(api, x, 0) + " Ω") },
      { id: "U", libelle: "Tension composée du réseau", min: 360, max: 440, pas: 5, valeur: reglages.U, unite: "V" },
      { id: "seuil", libelle: "Seuil de fermeture de KM2", min: 50, max: 99, pas: 1, valeur: reglages.seuil, unite: "%" },
      { id: "C", libelle: "Capacité du bus C", min: 1, max: 4.4, pas: 0.1, valeur: reglages.C, unite: "mF" },
    ],
    (lues) => {
      Object.assign(reglages, lues);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-precharge-lecteur", {
    de: -1,
    a: 3,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Temps écoulé depuis la mise sous tension, de 0,1 ms à 1 s, en échelle logarithmique",
    rappel: (v) => majInstant(v),
  });
  if (lecteur) ressources.push(lecteur);

  boucleAnimation(api, conteneur || racine, (ecoule) => {
    const vitesse = iInst > 0.5 ? 0.04 + (0.5 * Math.log10(1 + iInst)) / 3 : 0;
    phase = (phase + ecoule * vitesse) % 1;
    placerParticules();
  });
  maj();
}

/* --------------------------------------------------------------------------
   E. Carte temps-courant, point déplaçable
   -------------------------------------------------------------------------- */

const CHEMINS = ["court-circuit entre phases en sortie", "court-circuit de bras", "défaut à la terre en sortie"];

function construireCarte(racine, api) {
  const conteneur = racine.querySelector("#e-carte-vivant");
  if (!conteneur) return;
  const B = { x: 80, y: 20, l: 600, h: 360 };
  const LX0 = 1;
  const LX1 = Math.log10(2000);
  const xI = (I) => B.x + ((Math.log10(I) - LX0) / (LX1 - LX0)) * B.l;
  const yt = (t) => B.y + B.h - ((Math.log10(Math.min(1e3, Math.max(1e-6, t))) + 6) / 9) * B.h;
  const Ide = (x) => Math.pow(10, LX0 + ((x - B.x) / B.l) * (LX1 - LX0));
  const tde = (y) => Math.pow(10, ((B.y + B.h - y) / B.h) * 9 - 6);
  const etat = { I: 300, t: 1e-3, chemin: 0 };

  const PROT = [
    { id: "oc", nom: "seuil instantané de 160 A", voit: [0, 2], temps: (I) => (I >= 160 ? 5e-6 : Infinity) },
    { id: "ds", nom: "désaturation", voit: [0, 1, 2], temps: (I) => (I >= I_DSAT ? 4.5e-6 : Infinity) },
    { id: "th", nom: "modèle thermique", voit: [0, 2], temps: tempsModeleThermique },
    { id: "dt", nom: "détection de défaut terre", voit: [2], temps: (I) => (I >= 16 ? 10e-3 : Infinity) },
  ];

  const svg = svgEl("svg", {
    viewBox: "0 0 720 430",
    "aria-label": "Carte temps-courant logarithmique de l'IGBT : limite du composant en trait plein épais, courbes des protections en tirets, fusible d'entrée en pointillés, point déplaçable figurant un défaut",
  });
  const axes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.3" });
  let a = '<path d="M' + B.x + " " + B.y + "V" + (B.y + B.h) + "H" + (B.x + B.l) + '"/>';
  for (const I of [10, 100, 1000]) a += '<path d="M' + xI(I).toFixed(1) + " " + B.y + "V" + (B.y + B.h + 5) + '" stroke-width="0.6" opacity="0.5"/>';
  for (let e = -6; e <= 3; e += 1) a += '<path d="M' + (B.x - 5) + " " + yt(Math.pow(10, e)).toFixed(1) + "H" + (B.x + B.l) + '" stroke-width="0.6" opacity="0.35"/>';
  axes.innerHTML = a;
  svg.appendChild(axes);
  const ecr = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  const libT = { "-6": "1 µs", "-5": "10 µs", "-4": "100 µs", "-3": "1 ms", "-2": "10 ms", "-1": "0,1 s", 0: "1 s", 1: "10 s", 2: "100 s", 3: "1000 s" };
  let t = "";
  for (const I of [10, 100, 1000]) t += texte(xI(I) - 14, B.y + B.h + 18, I + " A");
  t += texte(xI(2000) - 30, B.y + B.h + 18, "2 kA");
  for (let e = -6; e <= 3; e += 1) t += texte(14, yt(Math.pow(10, e)) + 4, libT[e]);
  t += texte(B.x + B.l - 170, B.y + B.h + 36, "courant de défaut I") + texte(B.x + 6, B.y + 12, "durée");
  ecr.innerHTML = t;
  svg.appendChild(ecr);

  /* Limite de l'IGBT. */
  let dLim = "";
  let premier = true;
  for (let k = 0; k <= 200; k += 1) {
    const I = 81.2 * Math.pow(I_DSAT / 81.2, k / 200);
    const tl = limiteIGBT(Math.min(I, I_DSAT - 0.01));
    dLim += (premier ? "M" : "L") + xI(I).toFixed(1) + " " + yt(tl).toFixed(1);
    premier = false;
  }
  dLim += "L" + xI(I_DSAT).toFixed(1) + " " + yt(10e-6).toFixed(1) + "L" + xI(2000).toFixed(1) + " " + yt(10e-6).toFixed(1);
  const limite = svgEl("path", { d: "M" + xI(81.2).toFixed(1) + " " + yt(1e3).toFixed(1) + dLim.replace(/^M/, "L"), fill: "none", stroke: "currentColor", "stroke-width": "3.2" });
  svg.appendChild(limite);

  /* Courbes de protection. */
  function cheminProt(p) {
    if (p.id === "th") {
      let d = "";
      let pr = true;
      for (let k = 0; k <= 160; k += 1) {
        const I = I_C * 1.012 * Math.pow(2000 / (I_C * 1.012), k / 160);
        d += (pr ? "M" : "L") + xI(I).toFixed(1) + " " + yt(tempsModeleThermique(I)).toFixed(1);
        pr = false;
      }
      return d;
    }
    const seuil = { oc: 160, ds: I_DSAT, dt: 16 }[p.id];
    const tp = p.temps(seuil * 1.0001);
    return "M" + xI(seuil).toFixed(1) + " " + yt(1e3).toFixed(1) + "V" + yt(tp).toFixed(1) + "H" + xI(2000).toFixed(1);
  }
  const motifs = { oc: "9 5", ds: "4 3", th: "12 4 2 4", dt: "2 6 8 6" };
  const traits = {};
  for (const p of PROT) {
    const el = svgEl("path", { d: cheminProt(p), fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-dasharray": motifs[p.id] });
    svg.appendChild(el);
    traits[p.id] = el;
  }
  let dF = "";
  for (let k = 0; k <= 60; k += 1) {
    const I = 320 * Math.pow(2000 / 320, k / 60);
    dF += (k ? "L" : "M") + xI(I).toFixed(1) + " " + yt(2450 / (I * I)).toFixed(1);
  }
  svg.appendChild(svgEl("path", { d: dF, fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-dasharray": "1 4", "stroke-linecap": "round" }));

  const etiq = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "10.5" });
  etiq.innerHTML =
    texte(xI(95), yt(300) , "limite IGBT") +
    texte(xI(600) + 4, yt(10e-6) - 6, "tenue 10 µs") +
    texte(xI(62), yt(30), "modèle thermique", ' text-anchor="start"') +
    texte(xI(165) + 3, yt(0.3), "160 A") +
    texte(xI(I_DSAT) + 3, yt(0.03), "désat.") +
    texte(xI(17) + 3, yt(0.1), "défaut terre") +
    texte(xI(700), yt(2450 / 490000) - 8, "fusible aR") +
    texte(xI(170), yt(3e-6) + 14, "5 µs et 4,5 µs");
  svg.appendChild(etiq);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-carte-valeurs", [
    { id: "I", libelle: "Courant du défaut", unite: "A", decimales: 0 },
    { id: "t", libelle: "Durée du défaut", format: (v) => v },
    { id: "prot", libelle: "Première protection qui voit ce défaut", format: (v) => v },
    { id: "lim", libelle: "Limite de l'IGBT à ce courant", format: (v) => v },
    { id: "fus", libelle: "Fusible d'entrée, pour comparaison", format: (v) => v },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function evaluer() {
    const { I, t: td, chemin } = etat;
    let meilleure = null;
    for (const p of PROT) {
      if (!p.voit.includes(chemin)) continue;
      const tp = p.temps(I);
      if (Number.isFinite(tp) && (!meilleure || tp < meilleure.t)) meilleure = { nom: p.nom, t: tp };
    }
    const tl = limiteIGBT(I);
    const tfus = I >= 320 ? 2450 / (I * I) : Infinity;
    let verdict;
    const tp = meilleure ? meilleure.t : Infinity;
    if (td < Math.min(tp, tl)) verdict = "défaut trop bref pour toute protection, sans dommage pour l'IGBT";
    else if (tp < tl) verdict = "coupé par " + meilleure.nom + " en " + duree(api, tp) + ", avant la limite : IGBT protégé";
    else verdict = "aucune protection n'agit avant la limite : IGBT détruit si le défaut dure";
    if (valeurs) {
      valeurs.maj({
        I,
        t: duree(api, td),
        prot: meilleure ? meilleure.nom + ", " + duree(api, meilleure.t) : "aucune pour ce chemin",
        lim: Number.isFinite(tl) ? duree(api, tl) : "pas de limite thermique à ce courant",
        fus: Number.isFinite(tfus) ? duree(api, tfus) + ", si le défaut est alimenté par le réseau" : "ne fond pas",
        verdict,
      });
    }
  }

  function estomper() {
    for (const p of PROT) traits[p.id].setAttribute("opacity", p.voit.includes(etat.chemin) ? "1" : "0.22");
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: B.x, y: B.y, largeur: B.l, hauteur: B.h },
    valeur: { x: xI(etat.I), y: yt(etat.t) },
    pas: 1,
    libelle: "Défaut : courant et durée",
    rappel(mesure) {
      etat.I = Math.max(10, Math.min(2000, Ide(mesure.x)));
      etat.t = Math.max(1e-6, Math.min(1e3, tde(mesure.y)));
      evaluer();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-carte-curseurs",
    [{ id: "chemin", libelle: "Chemin du défaut", min: 0, max: 2, pas: 1, valeur: etat.chemin, format: (x) => CHEMINS[Math.round(x)] }],
    (lues) => {
      etat.chemin = Math.round(lues.chemin);
      estomper();
      evaluer();
    }
  );
  if (curseurs) ressources.push(curseurs);
  ressources.push(api.dessiner(axes, { declencheur: conteneur, duree: 1 }));
  estomper();
  evaluer();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function dessinDiagnostic(id) {
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.8">';
  s += '<rect x="10" y="20" width="210" height="58" rx="8"/><rect x="250" y="20" width="210" height="58" rx="8"/><rect x="490" y="20" width="200" height="58" rx="8"/>';
  s += '<rect x="250" y="122" width="210" height="58" rx="8"/><rect x="490" y="122" width="200" height="58" rx="8"/>';
  s += fleche(220, 49, 250, 49, id) + fleche(460, 49, 490, 49, id) + fleche(355, 78, 355, 122, id) + fleche(590, 78, 590, 122, id) + "</g>";
  s += ECRITS.replace('font-size="12"', 'font-size="11"');
  s += texte(20, 42, "claquement, 880 V affichés") + texte(20, 60, "R_p froide, fusibles fondus");
  s += texte(260, 42, "pas de précharge :") + texte(260, 60, "KM2 collé ou commandé tôt");
  s += texte(500, 42, "appel LC : 580 A,") + texte(500, 60, "bus jusqu'à 893 V");
  s += texte(260, 144, "vérifier KM2 hors tension :") + texte(260, 162, "contact ouvert au repos ?");
  s += texte(500, 144, "remplacer KM2, contrôler") + texte(500, 162, "condensateurs et diodes");
  s += "</g>";
  return s;
}

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-surtension",
      titre: "Surtension à l'ouverture d'un IGBT",
      niveau: "fondamental",
      enonce: "<p>Un IGBT coupe $120\\ \\mathrm{A}$ sous un bus de $600\\ \\mathrm{V}$, avec un temps de descente de $80\\ \\mathrm{ns}$. L'inductance de la boucle de commutation vaut $50\\ \\mathrm{nH}$ et il n'y a pas de condensateur de découplage. Quelle est la crête de $v_{CE}$, en volts ?</p>",
      valeur: 675,
      unite: "V",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Crête de v_CE",
      etapes: [
        { texte: "Pente : $I/t_f = 120/(80 \\times 10^{-9}) = 1{,}5 \\times 10^{9}\\ \\mathrm{A/s}$." },
        { texte: "Surtension : $L_\\sigma I/t_f = 50 \\times 10^{-9} \\times 1{,}5 \\times 10^{9} = 75\\ \\mathrm{V}$." },
        { texte: "$v_{CE,max} = 600 + 75 = 675\\ \\mathrm{V}$.", note: "Contrôle : moins de $80\\ \\%$ d'un IGBT de $1200\\ \\mathrm{V}$, mais l'écart grandirait vite avec le courant de défaut." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "v_CE pendant la descente du courant",
          xTitre: "temps", xUnite: "ns", yTitre: "V ou A", yUnite: "",
          xMin: 0, xMax: 300, yMin: 0, yMax: 750,
          series: [
            { id: "v", nom: "v_CE (V)", couleur: "serie-2", epaisseur: 2.6, fonction: (t) => (t >= 100 && t < 180 ? 675 : 600) },
            { id: "i", nom: "courant (A)", couleur: "serie-1", epaisseur: 2.2, fonction: (t) => (t < 100 ? 120 : t < 180 ? 120 * (1 - (t - 100) / 80) : 0) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            pointRepere(c, r, couleurs, 140, 675, "675 V");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-precharge",
      titre: "Résistance de précharge minimale",
      niveau: "fondamental",
      enonce: "<p>Un variateur raccordé au réseau $400\\ \\mathrm{V}$ possède un bus de $1{,}5\\ \\mathrm{mF}$. On veut limiter l'appel de précharge à $15\\ \\mathrm{A}$, en prenant pour tension la crête composée $\\hat{V} = 565{,}7\\ \\mathrm{V}$. Quelle résistance minimale faut-il, en ohms ?</p>",
      valeur: 565.7 / 15,
      unite: "Ω",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "R_p minimale",
      etapes: [
        { texte: "Pointe au premier instant, condensateur déchargé : $I = \\hat{V}/R_p$." },
        { texte: "$R_p \\ge 565{,}7/15 = 37{,}7\\ \\Omega$ ; on choisit la valeur normalisée $39\\ \\Omega$." },
        { texte: "Avec $39\\ \\Omega$ : $\\tau = 39 \\times 1{,}5 \\times 10^{-3} = 58{,}5\\ \\mathrm{ms}$ et $\\tfrac12 C\\hat{V}^2 = 240\\ \\mathrm{J}$ par mise sous tension.", note: "L'énergie ne dépend pas de $R_p$ : c'est elle qui fixe la tenue en impulsion de la résistance." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Courant de précharge avec 39 Ω et 1,5 mF",
          xTitre: "temps", xUnite: "ms", yTitre: "courant", yUnite: "A",
          xMin: 0, xMax: 300, yMin: 0, yMax: 16,
          series: [{ id: "i", nom: "i(t) = V̂ / R_p e^(-t/τ)", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => (565.7 / 39) * Math.exp(-t / 58.5) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 15, "limite 15 A");
            pointRepere(c, r, couleurs, 0, 565.7 / 39, "14,5 A");
            ligneV(c, r, couleurs, 58.5, "τ = 58,5 ms");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-decouplage",
      titre: "Condensateur de découplage",
      niveau: "intermédiaire",
      enonce: "<p>Les barres entre les condensateurs électrolytiques et un module présentent $40\\ \\mathrm{nH}$. Lors de l'ouverture rapide de $200\\ \\mathrm{A}$, on veut que la tension du condensateur de découplage placé aux bornes du module ne monte pas de plus de $50\\ \\mathrm{V}$. Quelle capacité minimale faut-il, en microfarads ?</p>",
      valeur: 0.64,
      unite: "µF",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "C_s minimale",
      etapes: [
        { texte: "Méthode : l'énergie des barres passe dans $C_s$ : $\\tfrac12 L_bI^2 = \\tfrac12 C_s\\Delta V^2$." },
        { texte: "$C_s \\ge L_bI^2/\\Delta V^2 = 40 \\times 10^{-9} \\times 200^2/50^2$." },
        { texte: "$C_s \\ge 1{,}6 \\times 10^{-3}/2500 = 0{,}64\\ \\mu\\mathrm{F}$ ; on retient $1\\ \\mu\\mathrm{F}$ à film.", note: "Contrôle : $\\Delta V = I\\sqrt{L_b/C_s} = 200 \\times \\sqrt{0{,}04} = 40\\ \\mathrm{V}$ avec $1\\ \\mu\\mathrm{F}$. La règle suppose une ouverture rapide devant la période d'oscillation." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["½ L_b I² = ½ × 40e-9 × 200² = 0,8 mJ", "½ C_s ΔV² = 0,8 mJ avec ΔV = 50 V", "C_s = 2 × 0,8e-3 / 2500 = 0,64 µF"], "Bilan d'énergie entre les barres et le condensateur de découplage.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-decharge",
      titre: "Résistance de décharge du bus",
      niveau: "intermédiaire",
      enonce: "<p>Un bus de $2{,}2\\ \\mathrm{mF}$ peut être chargé jusqu'à $622\\ \\mathrm{V}$, crête du réseau haut. On veut qu'il descende sous $50\\ \\mathrm{V}$ en $5\\ \\mathrm{min}$ au plus après la coupure. Quelle résistance de décharge maximale faut-il, en kiloohms ?</p>",
      valeur: 300 / (2.2e-3 * Math.log(622 / 50)) / 1000,
      unite: "kΩ",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "R_d maximale",
      etapes: [
        { texte: "Décharge exponentielle : $t_s = R_dC\\ln(V_0/V_s)$, donc $R_d \\le t_s/[C\\ln(V_0/V_s)]$." },
        { texte: "$\\ln(622/50) = \\ln 12{,}44 = 2{,}521$." },
        { texte: "$R_d \\le 300/(2{,}2 \\times 10^{-3} \\times 2{,}521) = 54{,}1\\ \\mathrm{k\\Omega}$.", note: "Coût : $540^2/54{,}1 \\times 10^{3} = 5{,}4\\ \\mathrm{W}$ dissipés en permanence en service. Et l'on vérifie toujours au voltmètre." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const tau = 54.1e3 * 2.2e-3;
        traceCorrection(moteurApi, conteneur, {
          titre: "Décharge du bus par 54,1 kΩ",
          xTitre: "temps", xUnite: "s", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 400, yMin: 0, yMax: 650,
          series: [{ id: "v", nom: "v(t) = 622 e^(-t/R_dC)", couleur: "serie-2", epaisseur: 2.6, fonction: (t) => 622 * Math.exp(-t / tau) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 50, "50 V");
            pointRepere(c, r, couleurs, 300, 50, "300 s");
          },
        });
      },
    })
  );

  const W1 = 700 * 600 * 3.5e-6;
  const W2 = (700 + (80e-9 * 600) / 1.5e-6) * 300 * 1.5e-6;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-courtcircuit",
      titre: "Échauffement d'une puce en court-circuit",
      niveau: "avancé",
      enonce: "<p>Un IGBT désature à $600\\ \\mathrm{A}$ sous $700\\ \\mathrm{V}$. Le driver détecte le défaut au bout de $3{,}5\\ \\mu\\mathrm{s}$, masquage et filtre compris, puis ouvre en $1{,}5\\ \\mu\\mathrm{s}$ avec un courant décroissant linéairement. La boucle de commutation vaut $80\\ \\mathrm{nH}$ et la puce a une capacité thermique de $0{,}02\\ \\mathrm{J/K}$. On suppose l'IGBT désaturé dès l'enclenchement. Quel est son échauffement adiabatique, en kelvins ?</p>",
      valeur: (W1 + W2) / 0.02,
      unite: "K",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Échauffement",
      etapes: [
        { texte: "Phase désaturée : $W_1 = EI_{sat}t = 700 \\times 600 \\times 3{,}5 \\times 10^{-6} = 1{,}470\\ \\mathrm{J}$." },
        { texte: "Surtension de l'ouverture douce : $80 \\times 10^{-9} \\times 600/(1{,}5 \\times 10^{-6}) = 32\\ \\mathrm{V}$, soit $732\\ \\mathrm{V}$." },
        { texte: "Phase d'ouverture : courant moyen $300\\ \\mathrm{A}$, $W_2 = 732 \\times 300 \\times 1{,}5 \\times 10^{-6} = 0{,}329\\ \\mathrm{J}$." },
        { texte: "$\\Delta T = (1{,}470 + 0{,}329)/0{,}02 = 90{,}0\\ \\mathrm{K}$.", note: "Contrôle : la tenue de $\\Delta T = 150\\ \\mathrm{K}$ serait atteinte en $150 \\times 0{,}02/(700 \\times 600) = 7{,}1\\ \\mu\\mathrm{s}$ : l'extinction à $5\\ \\mu\\mathrm{s}$ laisse une marge réelle mais étroite." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Puissance dans la puce et énergie cumulée",
          xTitre: "temps", xUnite: "µs", yTitre: "kW ou mJ / 5", yUnite: "",
          xMin: 0, xMax: 7, yMin: 0, yMax: 480,
          series: [
            { id: "p", nom: "puissance v_CE i_C (kW)", couleur: "serie-1", epaisseur: 2.4, fonction: (t) => (t < 3.5 ? 420 : t < 5 ? (732 * 600 * (1 - (t - 3.5) / 1.5)) / 1000 : 0) },
            { id: "w", nom: "énergie cumulée (mJ / 5)", couleur: "serie-3", epaisseur: 2.4, fonction: (t) => (t < 3.5 ? 420 * t : t < 5 ? 1470 + 732 * 600 * 1e-3 * ((t - 3.5) - Math.pow(t - 3.5, 2) / 3) : 1470 + 329.4) / 5 },
          ],
          surDessin({ c, repere: r, couleurs }) {
            pointRepere(c, r, couleurs, 5, 1799.4 / 5, "1,80 J, soit 90 K");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-diagnostic",
      titre: "Variateur qui claque à la mise sous tension",
      niveau: "diagnostic",
      enonce: "<p>Après le remplacement du contacteur de précharge KM2, le variateur de la pompe émet un claquement à chaque mise sous tension et affiche un défaut de surtension du bus à $880\\ \\mathrm{V}$ avant tout ordre de marche ; deux fusibles d'entrée ont déjà fondu. La résistance de précharge reste froide. Quelles affirmations sont justes ?</p>",
      options: [
        { texte: "La précharge est court-circuitée : KM2 est collé, câblé en contact fermé au repos, ou commandé dès la mise sous tension.", juste: true },
        { texte: "Le circuit LC formé par l'inductance du réseau et le bus fait dépasser la crête du réseau : la surtension vient de la mise sous tension, pas du freinage.", juste: true },
        { texte: "La cause la plus probable est une rampe de décélération trop courte." },
        { texte: "Avant de remettre sous tension, il faut vérifier hors tension l'état de KM2 et son câblage, puis contrôler les condensateurs et les diodes du pont, qui ont subi plusieurs appels de plusieurs centaines d'ampères.", juste: true },
        { texte: "Remplacer les fusibles par des calibres plus élevés règle le problème." },
      ],
      multiple: true,
      etapes: [
        { texte: "Résistance froide : aucun courant n'y passe pendant la charge, donc elle est court-circuitée." },
        { texte: "Sans précharge, le modèle donne environ $580\\ \\mathrm{A}$ et un bus à $893\\ \\mathrm{V}$ : le défaut de surtension et le claquement en découlent, et l'$I^2t$ de l'appel, environ $910\\ \\mathrm{A^2s}$, dépasse le préarc des fusibles." },
        { texte: "La rampe de décélération n'intervient qu'en marche ; ici, aucun ordre de marche n'a été donné." },
        { texte: "Des fusibles plus gros supprimeraient le symptôme visible sans traiter la cause, et ne protégeraient plus les diodes.", note: "Après plusieurs appels de ce type, contrôler la capacité et la résistance série des condensateurs, et les diodes du pont." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(moteurApi, conteneur, "0 0 700 192", dessinDiagnostic("fl-k6"), "Démarche : symptômes, cause, mécanisme, vérification, action.");
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-conceptuel",
      titre: "Le fusible et l'IGBT",
      niveau: "conceptuel",
      enonce: "<p>Sans calcul, expliquez pourquoi un fusible ultrarapide placé en amont du pont ne peut pas protéger un IGBT contre un court-circuit de bras, et pourquoi on le garde quand même.</p>",
      motsCles: [["lent", "milliseconde", "millisecondes", "ms", "trop tard", "temps"], ["microseconde", "microsecondes", "10 µs", "puce", "adiabatique"], ["condensateur", "bus", "capacite"], ["degats", "consequences", "pont", "cables", "incendie", "eclatement", "limite"]],
      minimum: 3,
      exemple: "Trois ou quatre phrases : échelle de temps du fusible et de la puce, origine du courant de défaut, rôle qui reste au fusible.",
      etapes: [
        { texte: "Le ruban d'un fusible met quelques dixièmes de milliseconde à fondre, alors que la puce est détruite en une dizaine de microsecondes : il arrive des dizaines de fois trop tard." },
        { texte: "De plus, un court-circuit de bras est d'abord alimenté par le condensateur du bus, en aval du pont : le fusible d'entrée ne voit le défaut que plus tard, quand le réseau recharge le bus." },
        { texte: "On le garde parce qu'il limite les conséquences d'un composant claqué : il protège le pont, les câbles et l'armoire contre un courant de réseau entretenu, et réduit le risque d'incendie.", note: "La protection de l'IGBT est électronique : désaturation détectée par le driver, avec ouverture douce." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["puce : destruction en ≈ 10 µs", "fusible : fusion en quelques dixièmes de ms", "défaut de bras alimenté d'abord par le bus", "fusible : protège pont, câbles, armoire"], "Échelles de temps du fusible et de la puce.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

function dessinChaineQuiz(id) {
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="2">';
  s += '<rect x="10" y="60" width="100" height="50" rx="6"/><rect x="130" y="60" width="100" height="50" rx="6"/><rect x="250" y="60" width="100" height="50" rx="6"/>';
  s += '<rect x="370" y="60" width="110" height="50" rx="6"/><rect x="500" y="60" width="120" height="50" rx="6"/>';
  s += '<rect x="370" y="150" width="110" height="44" rx="6"/><rect x="500" y="150" width="120" height="44" rx="6"/>';
  s += fleche(110, 85, 130, 85, id) + fleche(230, 85, 250, 85, id) + fleche(350, 85, 370, 85, id) + fleche(480, 85, 500, 85, id) + "</g>";
  s += ECRITS.replace('font-size="12"', 'font-size="11"');
  s += texte(18, 82, "élément A") + texte(18, 98, "fusibles aR");
  s += texte(138, 82, "élément B") + texte(138, 98, "précharge");
  s += texte(258, 82, "élément C") + texte(258, 98, "bus et seuils");
  s += texte(378, 82, "élément D") + texte(378, 98, "drivers, désat.");
  s += texte(508, 82, "élément E") + texte(508, 98, "capteurs de phase");
  s += texte(378, 172, "élément F") + texte(378, 186, "modèle therm.");
  s += texte(508, 172, "élément G") + texte(508, 186, "défaut terre");
  s += texte(10, 30, "chaîne de protections du variateur, du réseau vers le moteur");
  s += "</g>";
  return s;
}

const ZONES_CHAINE = [
  { x: 6, y: 56, largeur: 108, hauteur: 58, etiquette: "élément A" },
  { x: 126, y: 56, largeur: 108, hauteur: 58, etiquette: "élément B" },
  { x: 246, y: 56, largeur: 108, hauteur: 58, etiquette: "élément C" },
  { x: 366, y: 56, largeur: 118, hauteur: 58, etiquette: "élément D", juste: true },
  { x: 496, y: 56, largeur: 128, hauteur: 58, etiquette: "élément E" },
  { x: 366, y: 146, largeur: 118, hauteur: 52, etiquette: "élément F" },
  { x: 496, y: 146, largeur: 128, hauteur: 52, etiquette: "élément G" },
];

const VISUELS_QUIZ = [
  etapes(["court-circuit de bras : défaut en µs", "fusible : ms ; modèle thermique : s", "seuil de surtension : ne voit pas le courant", "désaturation dans le driver : 2 à 5 µs"], "Seule la désaturation est assez rapide."),
  etapes(["W_Rp = ½ C V̂², indépendante de R_p", "doubler R_p : pointe divisée par 2", "durée multipliée par 2, énergie inchangée"], "Énergie de précharge."),
  etapes(["L I / t_f = 100e-9 × 200 / 100e-9 = 200 V", "v_CE max = 600 + 200", "= 800 V"], "Surtension à l'ouverture."),
  etapes(["à la mise en conduction, v_CE part de E", "elle met jusqu'à 1 µs à tomber", "sans masquage : déclenchement à chaque commutation"], "Rôle du masquage."),
  etapes(["½ C V̂² = 0,5 × 3,3e-3 × 565,7²", "= 0,5 × 3,3e-3 × 320 017", "= 528 J"], "Énergie dissipée par la précharge."),
  () => ({ viewBox: "0 0 640 210", dessin: dessinChaineQuiz("fl-qv5"), legende: "Le court-circuit de bras ne passe ni par les fusibles en temps utile, ni par les capteurs de phase : seul l'élément D, la désaturation dans les drivers, le coupe en quelques microsecondes." }),
  etapes(["bus continu : pas de passage par zéro", "l'arc doit être éteint par le fusible seul", "tension assignée en continu explicite exigée"], "Fusible sur bus continu."),
  etapes(["C_s au plus près du module", "la commutation rapide ne voit plus que L_m", "L_b se décharge plus lentement dans C_s"], "Découplage."),
  etapes(["t = R C ln(V0/Vs)", "= 1e5 × 1e-3 × ln(600/50)", "= 100 × 2,485 = 248 s"], "Temps de décharge."),
  etapes(["surtension = L_σ I / t_f", "ouverture douce : t_f plus grand", "barres laminées : L_σ plus petite", "découplage : boucle rapide réduite à L_m"], "Réduire la surtension d'ouverture."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Quelle protection peut interrompre un court-circuit de bras avant la tenue de $10\\ \\mu\\mathrm{s}$ d'un IGBT ?</p>",
        options: ["Le fusible aR d'entrée", "La détection de désaturation dans le driver", "Le modèle thermique du variateur", "Le seuil de surtension du bus"],
        bonnes: [1],
        explication: "Le fusible agit en millisecondes, le modèle thermique en secondes, et le seuil de surtension ne mesure pas le courant. Seule la désaturation agit en quelques microsecondes.",
        resume: "Court-circuit de bras",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Doubler la résistance de précharge divise par deux l'énergie qu'elle dissipe à chaque mise sous tension.</p>",
        reponse: false,
        explication: "Elle dissipe toujours $\\tfrac12 C\\hat{V}^2$ ; doubler $R_p$ divise la pointe par deux et double la durée de charge.",
        resume: "Énergie de précharge",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Bus de $600\\ \\mathrm{V}$, boucle de $100\\ \\mathrm{nH}$ sans découplage, coupure de $200\\ \\mathrm{A}$ en $100\\ \\mathrm{ns}$. Crête de $v_{CE}$, en volts ?</p>",
        valeur: 800,
        unite: "V",
        tolerance: 0.01,
        explication: "$600 + 100 \\times 10^{-9} \\times 200/10^{-7} = 600 + 200 = 800\\ \\mathrm{V}$.",
        resume: "L di/dt",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi la détection de désaturation doit-elle être masquée pendant une à quelques microsecondes après chaque mise en conduction ?</p>",
        motsCles: [["conduction", "enclenchement", "commutation", "allumage", "amorcage"], ["tension", "v_ce", "vce", "elevee", "tombe", "descend"], ["intempestif", "faux", "declenchement", "declencherait", "erreur"]],
        minimum: 2,
        explication: "À la mise en conduction, $v_{CE}$ part de la tension du bus et met jusqu'à une microseconde à tomber : sans masquage, le comparateur verrait une tension élevée à chaque commutation et déclencherait à tort.",
        resume: "Masquage",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Énergie dissipée dans la résistance de précharge d'un bus de $3{,}3\\ \\mathrm{mF}$ chargé jusqu'à la crête de $565{,}7\\ \\mathrm{V}$, en joules ?</p>",
        valeur: 0.5 * 3.3e-3 * 565.7 * 565.7,
        unite: "J",
        tolerance: 0.02,
        explication: "$\\tfrac12 \\times 3{,}3 \\times 10^{-3} \\times 565{,}7^2 = 528\\ \\mathrm{J}$, autant que l'énergie stockée.",
        resume: "½ C V̂²",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Dans cette chaîne de protections, quel élément interrompt un court-circuit de bras en quelques microsecondes ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 640 210",
        dessin: dessinChaineQuiz("fl-qz"),
        zones: ZONES_CHAINE,
        explication: "Le court-circuit de bras se referme entre les bornes du bus : ni les capteurs de phase, ni le défaut terre, ni le modèle thermique ne le voient, et le fusible est trop lent. Les drivers détectent la désaturation.",
        resume: "Lecture de la chaîne",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Un fusible placé sur un bus continu doit avant tout :</p>",
        options: ["Avoir une tension assignée en courant continu explicite", "Avoir un $I^2t$ total supérieur à celui du composant protégé", "Être de classe gG pour couvrir les surcharges", "Avoir un préarc inférieur aux appels normaux"],
        bonnes: [0],
        explication: "Sans passage par zéro, l'arc doit être éteint par le fusible seul : la tension assignée en continu est indispensable. L'$I^2t$ total doit être inférieur, et le préarc supérieur aux appels normaux.",
        resume: "Fusible en continu",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Un condensateur de découplage placé au plus près du module réduit l'inductance vue par la commutation rapide.</p>",
        reponse: true,
        explication: "La commutation rapide ne voit plus que $L_m$ ; l'énergie de $L_b$ passe dans $C_s$, avec une élévation bornée par $I\\sqrt{L_b/C_s}$.",
        resume: "Découplage",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Un bus de $1\\ \\mathrm{mF}$ chargé à $600\\ \\mathrm{V}$ se décharge dans $100\\ \\mathrm{k\\Omega}$. Temps pour descendre à $50\\ \\mathrm{V}$, en secondes ?</p>",
        valeur: 100 * Math.log(12),
        unite: "s",
        tolerance: 0.02,
        explication: "$\\tau = 10^{5} \\times 10^{-3} = 100\\ \\mathrm{s}$ ; $t = 100\\ln 12 = 248\\ \\mathrm{s}$.",
        resume: "Décharge",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Quels moyens réduisent la surtension à l'ouverture d'un courant de court-circuit ?</p>",
        options: ["Une ouverture douce", "Des barres laminées de faible inductance", "Un condensateur de découplage au plus près du module", "Une tension de bus plus élevée", "Une ouverture plus rapide"],
        bonnes: [0, 1, 2],
        multiple: true,
        explication: "La surtension vaut $L_\\sigma I/t_f$ : on augmente $t_f$, on réduit $L_\\sigma$, ou l'on découple pour que la boucle rapide se réduise à $L_m$. Une ouverture plus rapide l'aggrave.",
        resume: "Réduire L di/dt",
      },
    ],
    { titre: "Dix questions de fin de séance" }
  );
  if (quiz) ressources.push(quiz);
  brancherVisuelsQuiz(racine, api, "#l-quiz-bloc", VISUELS_QUIZ);
}

/* --------------------------------------------------------------------------
   M. Cartes
   -------------------------------------------------------------------------- */

function construireCartesMemo(racine, api) {
  if (!racine.querySelector("#m-cartes")) return;
  const cartes = api.cartes(
    "#m-cartes",
    [
      { categorie: "Menaces", question: "Quelles sont les trois familles de menaces d'un convertisseur ?", reponse: "Surintensité, surtension, défauts lents ; chacune à son échelle de temps, des nanosecondes aux minutes." },
      { categorie: "Court-circuit", question: "Pourquoi un court-circuit doit-il être coupé en microsecondes ?", reponse: "La puce désaturée reçoit $EI_{sat}t$, $4{,}32\\ \\mathrm{J}$ en $10\\ \\mu\\mathrm{s}$ pour la pompe, sans pouvoir l'évacuer : $\\sqrt{\\alpha t} \\approx 30\\ \\mu\\mathrm{m}$, échauffement $W/C_{puce}$." },
      { categorie: "Désaturation", question: "Comment fonctionne la détection de désaturation ?", reponse: "Le driver surveille $v_{CE}$ pendant la conduction par une diode haute tension ; au-delà d'environ $7\\ \\mathrm{V}$ après le masquage, il ouvre doucement et verrouille le défaut." },
      { categorie: "Chemins", question: "Pourquoi les capteurs de phase ne suffisent-ils pas ?", reponse: "Un court-circuit de bras se referme entre les bornes du bus sans passer par les phases : seule la désaturation, ou un shunt dans le bus, le voit." },
      { categorie: "Ouverture", question: "Que vaut la surtension à l'ouverture ?", reponse: "$v_{CE,max} = E + L_\\sigma I/t_f$ ; avec découplage, $E + L_mI/t_f + I\\sqrt{L_b/C_s}$ au plus. Règle : moins de $80\\ \\%$ de $V_{CES}$." },
      { categorie: "Snubber RCD", question: "Comment dimensionne-t-on un circuit RCD d'ouverture ?", reponse: "$C_{sn} = It_f/(2E)$ pour que $v$ atteigne $E$ en fin de descente ; pertes $\\tfrac12 C_{sn}E^2f$ par interrupteur, d'où son abandon sur les IGBT modernes." },
      { categorie: "Fusible", question: "Quelle grandeur coordonne un fusible et un semi-conducteur ?", reponse: "L'intégrale de Joule $I^2t$ : $I^2t$ total du fusible inférieur à celui du composant, préarc supérieur aux appels normaux ; tension assignée en continu sur un bus." },
      { categorie: "Précharge", question: "Que retenir de la précharge ?", reponse: "$I_{max} = \\hat{V}/R_p$, $\\tau = R_pC$, énergie $\\tfrac12 C\\hat{V}^2$ indépendante de $R_p$ ; KM2 se ferme au-delà de $95\\ \\%$ de la crête." },
      { categorie: "Bus", question: "Comment s'étagent les protections en tension du bus de la pompe ?", reponse: "Régulateur dès $760\\ \\mathrm{V}$, déclenchement à $800\\ \\mathrm{V}$, condensateurs de $900\\ \\mathrm{V}$, IGBT de $1200\\ \\mathrm{V}$ ; sous-tension à $400\\ \\mathrm{V}$." },
      { categorie: "Sécurité", question: "Comment intervenir sur un bus continu ?", reponse: "Attendre au moins le délai affiché, $t_s = R_dC\\ln(V_0/V_s)$, puis vérifier l'absence de tension au voltmètre sur les bornes du bus : une résistance coupée le laisse chargé." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["W = ½ C V²", "= 0,5 × 1e-3 × 600²", "= 180 J"], "Énergie stockée, et dissipée par la précharge."),
  etapes(["court-circuit de bras : boucle + E, T haut, T bas, - E", "les phases U, V, W ne sont pas traversées", "capteurs de phase aveugles, désaturation seule"], "Chemin d'un court-circuit de bras."),
  etapes(["couper 800 A en 100 ns : L di/dt = 640 V", "en 1 µs : 64 V", "l'ouverture douce évite l'avalanche"], "Ouverture douce."),
  etapes(["ΔT = P Z_th(t_p)", "= 2000 × 0,021", "= 42 K"], "Impulsion et impédance thermique."),
  etapes(["T_h = T_a + R_ha × ΣP", "loi des nœuds au dissipateur", "chaque puce ajoute R_jh,k P_k"], "Dissipateur partagé."),
  etapes(["ΔI = (V_e - V_s) D / (L f)", "= 24 × 0,5 / (100e-6 × 5e4)", "= 2,4 A"], "Ondulation d'un hacheur abaisseur."),
  etapes(["THD = √(I5² + I7²) / I1", "= √(225 + 64) / 50 = 17 / 50", "= 34 %"], "Taux de distorsion harmonique."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Énergie dissipée dans la résistance de précharge d'un bus de $1\\ \\mathrm{mF}$ chargé jusqu'à $600\\ \\mathrm{V}$, en joules ?</p>",
        valeur: 180,
        unite: "J",
        tolerance: 0.01,
        explication: "$\\tfrac12 \\times 10^{-3} \\times 600^2 = 180\\ \\mathrm{J}$, quelle que soit la résistance.",
        resume: "Précharge",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Les capteurs de courant de phase d'un onduleur détectent un court-circuit de bras.</p>",
        reponse: false,
        explication: "Le court-circuit de bras se referme entre les bornes du bus sans passer par les phases.",
        resume: "Chemin de mesure",
      },
      {
        type: "courte",
        enonce: repere(2) + "<p>Cette séance. Pourquoi ouvre-t-on lentement un IGBT qui conduit un courant de court-circuit ?</p>",
        motsCles: [["inductance", "di/dt", "l di", "parasite", "boucle"], ["surtension", "tension", "depasse", "claquage", "avalanche", "1200"]],
        minimum: 2,
        explication: "La surtension $L_\\sigma I/t_f$ croît avec le courant : couper $800\\ \\mathrm{A}$ en $100\\ \\mathrm{ns}$ ajouterait $640\\ \\mathrm{V}$ et dépasserait la tenue ; en $1\\ \\mu\\mathrm{s}$, $64\\ \\mathrm{V}$.",
        resume: "Ouverture douce",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Thermique des composants de puissance. Une puce reçoit une impulsion de $2000\\ \\mathrm{W}$ pendant $1\\ \\mathrm{ms}$ ; son impédance thermique à $1\\ \\mathrm{ms}$ vaut $0{,}021\\ \\mathrm{K/W}$. Échauffement, en kelvins ?</p>",
        valeur: 42,
        unite: "K",
        tolerance: 0.01,
        explication: "$\\Delta T = PZ_{th}(t_p) = 2000 \\times 0{,}021 = 42\\ \\mathrm{K}$.",
        resume: "Z_th",
      },
      {
        type: "vraiFaux",
        enonce: repere(4) + "<p>Cours Thermique des composants de puissance. Sur un dissipateur commun, la résistance dissipateur-air est traversée par la somme des pertes de toutes les puces.</p>",
        reponse: true,
        explication: "Loi des nœuds au dissipateur : $T_h = T_a + R_{ha}\\sum P_k$.",
        resume: "Dissipateur partagé",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Hacheurs DC-DC. Un hacheur abaisseur passe de $48$ à $24\\ \\mathrm{V}$ à $50\\ \\mathrm{kHz}$ avec une inductance de $100\\ \\mu\\mathrm{H}$, en conduction continue. Ondulation crête à crête du courant, en ampères ?</p>",
        valeur: 2.4,
        unite: "A",
        tolerance: 0.02,
        explication: "$D = 0{,}5$ ; $\\Delta I = (48 - 24) \\times 0{,}5/(100 \\times 10^{-6} \\times 5 \\times 10^{4}) = 2{,}4\\ \\mathrm{A}$.",
        resume: "Ondulation du buck",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Harmoniques et qualité de l'énergie. Un courant a un fondamental de $50\\ \\mathrm{A}$ efficaces, un rang 5 de $15\\ \\mathrm{A}$ et un rang 7 de $8\\ \\mathrm{A}$. Taux de distorsion harmonique, en pourcentage ?</p>",
        valeur: 34,
        unite: "%",
        tolerance: 0.01,
        explication: "$\\sqrt{15^2 + 8^2}/50 = 17/50 = 34\\ \\%$.",
        resume: "THD",
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
  if (!racine.querySelector("#p-autoevaluation-grille")) return;
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur les protections des convertisseurs ?",
  });
  if (auto) ressources.push(auto);
}
