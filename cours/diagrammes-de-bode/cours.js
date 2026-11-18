/* ==========================================================================
   cours/diagrammes-de-bode/cours.js
   Diagrammes de Bode : sinusoïde à travers un premier ordre avec point de
   fonctionnement déplaçable, constructeur de Bode asymptotique à cassures
   déplaçables, marges de la boucle de position de l'actionneur avec retard
   et réponse indicielle, Bode exact de l'exemple, exercices, quiz, cartes,
   révision et bilan.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = 2 * Math.PI;
const DEG = 180 / Math.PI;

/* Actionneur de vanne : K et R du projet, L, J et f supposés. */
const MOT = { K: 0.07, R: 1.2, L: 1.0e-3, J: 2.0e-5, f: 3.6e-5 };
const A2 = MOT.L * MOT.J;
const A1 = MOT.R * MOT.J + MOT.L * MOT.f;
const A0 = MOT.R * MOT.f + MOT.K * MOT.K;
const G0 = MOT.K / A0; /* 14,16 rad/(s.V) */
const T12 = A2 / A0; /* tau1 tau2 = 4,046e-6 s² */
const TS = A1 / A0; /* tau1 + tau2 = 4,862 ms */
const DELTA = Math.sqrt(TS * TS - 4 * T12);
const TAU1 = (TS + DELTA) / 2; /* 3,797 ms */
const TAU2 = (TS - DELTA) / 2; /* 1,066 ms */

/* --------------------------------------------------------------------------
   Outils
   -------------------------------------------------------------------------- */

function svgEl(nom, attributs = {}) {
  const element = document.createElementNS(SVG_NS, nom);
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

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";

function ligneH(c, repere, couleurs, y, libelle, motif = [7, 5]) {
  const py = repere.versY(y);
  if (!Number.isFinite(py) || py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
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

function ligneV(c, repere, couleurs, x, libelle, motif = [2, 4], hauteurTexte = 14) {
  const px = repere.versX(x);
  if (!Number.isFinite(px) || px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
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
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + hauteurTexte);
  }
  c.restore();
}

function pointRepere(c, repere, couleurs, x, y, libelle, plein = true) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return;
  if (py < repere.boite.y - 2 || py > repere.boite.y + repere.boite.h + 2) return;
  c.save();
  c.fillStyle = couleurs.accent;
  c.strokeStyle = couleurs.texte;
  c.lineWidth = plein ? 1.2 : 2;
  c.beginPath();
  c.arc(px, py, plein ? 5 : 6, 0, TAU);
  if (plein) c.fill();
  c.stroke();
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

function bodeCorrection(moteurApi, conteneur, options) {
  const bode = moteurApi.sim.bode(conteneur, { genre: "Correction visuelle", ratio: 0.7, echantillons: 320, ...options });
  if (bode) ressources.push(bode);
  return bode;
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

function correctionEtapes(lignes, legende, largeur = 600) {
  return (conteneur, moteurApi) => {
    const v = etapes(lignes, legende, largeur);
    schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
  };
}

function repere(index) {
  return '<span hidden data-q="' + index + '"></span>';
}

/** Ajoute un visuel animé sous le verdict de chaque question d'un quiz. */
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

/** Un pas de Runge-Kutta d'ordre 4 pour dx/dt = f(t, x), x tableau. */
function pasRK4(f, t, x, h) {
  const k1 = f(t, x);
  const x2 = x.map((v, i) => v + (h / 2) * k1[i]);
  const k2 = f(t + h / 2, x2);
  const x3 = x.map((v, i) => v + (h / 2) * k2[i]);
  const k3 = f(t + h / 2, x3);
  const x4 = x.map((v, i) => v + h * k3[i]);
  const k4 = f(t + h, x4);
  return x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

function interpoler(ts, ys, t) {
  if (!ts.length) return 0;
  if (t <= ts[0]) return ys[0];
  const n = ts.length - 1;
  if (t >= ts[n]) return ys[n];
  const pas = ts[1] - ts[0];
  const k = Math.min(n - 1, Math.floor((t - ts[0]) / pas));
  const u = (t - ts[k]) / pas;
  return ys[k] + (ys[k + 1] - ys[k]) * u;
}

/** Recherche par dichotomie, en échelle logarithmique, du zéro d'une fonction décroissante. */
function dichotomieLog(f, wMin, wMax) {
  let a = Math.log10(wMin);
  let b = Math.log10(wMax);
  if (f(10 ** a) < 0 || f(10 ** b) > 0) return NaN;
  for (let k = 0; k < 80; k += 1) {
    const m = (a + b) / 2;
    if (f(10 ** m) > 0) a = m;
    else b = m;
  }
  return 10 ** ((a + b) / 2);
}

/* --------------------------------------------------------------------------
   Boucle de position de l'actionneur : L = Kv e^(-sT) / (s (1 + tau1 s)(1 + tau2 s))
   -------------------------------------------------------------------------- */

function gainPosition(w, Kv) {
  return 20 * Math.log10(Kv / (w * Math.hypot(1, w * TAU1) * Math.hypot(1, w * TAU2)));
}

function phasePosition(w, T) {
  return -90 - (Math.atan(w * TAU1) + Math.atan(w * TAU2) + w * T) * DEG;
}

function margesPosition(Kv, T) {
  const wc = dichotomieLog((w) => gainPosition(w, Kv), 1e-3, 1e7);
  const w180 = dichotomieLog((w) => phasePosition(w, T) + 180, 1e-3, 1e7);
  const pm = 180 + phasePosition(wc, T);
  const gm = -gainPosition(w180, Kv);
  return { wc, w180, pm, gm, tmax: pm > 0 ? (pm / DEG) / wc : 0 };
}

/** Réponse de la boucle de position à un échelon de 1 rad, retard T sur la mesure. */
function simulerPosition(Kv, T, tmax = 0.1, h = 2e-5) {
  const Kth = Kv / G0;
  const n = Math.round(tmax / h);
  const d = Math.round(T / h);
  const histoire = new Float64Array(n + 2);
  const res = { t: [], y: [] };
  let x = [0, 0, 0];
  let diverge = false;
  for (let k = 0; k <= n; k += 1) {
    histoire[k] = x[0];
    {
      res.t.push(k * h);
      res.y.push(diverge ? NaN : x[0]);
    }
    /* Sans retard, le retour est continu ; avec retard, la mesure retardée est lue dans l'historique. */
    const mesure = k - d >= 0 ? histoire[k - d] : 0;
    const f =
      d === 0
        ? (t, v) => [v[1], v[2], (G0 * Kth * (1 - v[0]) - v[1] - TS * v[2]) / T12]
        : (t, v) => [v[1], v[2], (G0 * Kth * (1 - mesure) - v[1] - TS * v[2]) / T12];
    x = pasRK4(f, k * h, x, h);
    if (!Number.isFinite(x[0]) || Math.abs(x[0]) > 50) diverge = true;
  }
  return res;
}

function indicateursEchelon(ts, ys, tol = 0.05) {
  let ymax = -Infinity;
  let tpic = NaN;
  let dernierHors = -1;
  for (let i = 0; i < ys.length; i += 1) {
    const y = ys[i];
    if (!Number.isFinite(y)) return { D: NaN, tpic: NaN, ts: NaN, ymax: NaN, diverge: true };
    if (y > ymax) {
      ymax = y;
      tpic = ts[i];
    }
    if (Math.abs(y - 1) > tol) dernierHors = i;
  }
  const tEtab = dernierHors < ys.length - 1 ? ts[dernierHors + 1] : NaN;
  return { D: Math.max(0, (ymax - 1) * 100), tpic, ts: tEtab, ymax, diverge: false };
}

/* --------------------------------------------------------------------------
   Cadre de Bode en SVG : deux panneaux, abscisse logarithmique
   -------------------------------------------------------------------------- */

/**
 * opts : { viewBox:[l, h], x0, x1, wMin, wMax, gain:{y, h, min, max, ticks}, phase:{y, h, min, max, ticks},
 *          titreGain, titrePhase, idMarqueur, aria }
 */
function creerCadreBode(opts) {
  const [largeur, hauteur] = opts.viewBox;
  const svg = svgEl("svg", { viewBox: "0 0 " + largeur + " " + hauteur, role: "img", "aria-label": opts.aria });
  const lMin = Math.log10(opts.wMin);
  const lMax = Math.log10(opts.wMax);
  const X = (w) => opts.x0 + ((opts.x1 - opts.x0) * (Math.log10(w) - lMin)) / (lMax - lMin);
  const W = (x) => 10 ** (lMin + ((x - opts.x0) * (lMax - lMin)) / (opts.x1 - opts.x0));
  const Yg = (v) => opts.gain.y + (opts.gain.h * (opts.gain.max - v)) / (opts.gain.max - opts.gain.min);
  const Yp = (v) => opts.phase.y + (opts.phase.h * (opts.phase.max - v)) / (opts.phase.max - opts.phase.min);

  let d = "<defs>" + marqueur(opts.idMarqueur) + "</defs>";
  d += TRAITS + ' stroke-width="1.2">';
  for (const p of [opts.gain, opts.phase]) {
    d += '<rect x="' + opts.x0 + '" y="' + p.y + '" width="' + (opts.x1 - opts.x0) + '" height="' + p.h + '"/>';
  }
  let grille = "";
  for (let k = Math.ceil(lMin); k <= Math.floor(lMax); k += 1) {
    const x = X(10 ** k).toFixed(1);
    grille += "M" + x + " " + opts.gain.y + "V" + (opts.gain.y + opts.gain.h) + "M" + x + " " + opts.phase.y + "V" + (opts.phase.y + opts.phase.h);
  }
  for (const v of opts.gain.ticks) grille += "M" + opts.x0 + " " + Yg(v).toFixed(1) + "H" + opts.x1;
  for (const v of opts.phase.ticks) grille += "M" + opts.x0 + " " + Yp(v).toFixed(1) + "H" + opts.x1;
  d += '<path d="' + grille + '" stroke-width="0.6" stroke-dasharray="2 4"/></g>';
  d += ECRITS.replace('font-size="12"', 'font-size="11"');
  for (const v of opts.gain.ticks) d += texte(opts.x0 - 6, Yg(v) + 4, (v > 0 ? "+" : "") + v, ' text-anchor="end"');
  for (const v of opts.phase.ticks) d += texte(opts.x0 - 6, Yp(v) + 4, String(v), ' text-anchor="end"');
  for (let k = Math.ceil(lMin); k <= Math.floor(lMax); k += 1) {
    const etiquette = k === -1 ? "0,1" : k <= 3 ? String(10 ** k) : "10⁴";
    d += texte(X(10 ** k), opts.phase.y + opts.phase.h + 15, etiquette, ' text-anchor="middle"');
  }
  d += texte(8, opts.gain.y - 6, opts.titreGain || "gain (dB)");
  d += texte(8, opts.phase.y - 6, opts.titrePhase || "phase (°)");
  d += texte(opts.x1, opts.gain.y - 6, "ω (rad/s)", ' text-anchor="end"');
  d += "</g>";
  const decor = svgEl("g");
  decor.innerHTML = d;
  svg.appendChild(decor);

  /** Chemin d'une fonction de la pulsation, interrompu hors du panneau. */
  function chemin(fonction, panneau, n = 260) {
    const Y = panneau === "gain" ? Yg : Yp;
    const p = panneau === "gain" ? opts.gain : opts.phase;
    let s = "";
    let dehors = true;
    for (let i = 0; i <= n; i += 1) {
      const w = 10 ** (lMin + ((lMax - lMin) * i) / n);
      const v = fonction(w);
      if (!Number.isFinite(v)) {
        dehors = true;
        continue;
      }
      const hors = v < p.min || v > p.max;
      const vc = Math.max(p.min, Math.min(p.max, v));
      if (hors) {
        if (!dehors) s += "L" + X(w).toFixed(1) + " " + Y(vc).toFixed(1);
        dehors = true;
      } else {
        s += (dehors ? "M" : "L") + X(w).toFixed(1) + " " + Y(v).toFixed(1);
        dehors = false;
      }
    }
    return s || "M0 0";
  }

  return { svg, decor, X, W, Yg, Yp, chemin, opts };
}

/* --------------------------------------------------------------------------
   Initialisation et nettoyage
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  detruire();
  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireSinus(racine, api);
  construireConstructeur(racine, api);
  construireMarges(racine, api);
  construireBodeExemple(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  ressources.push(api.reveler(racine.querySelectorAll(".formule-cle, .encadre, .cadre-tableau"), { decalage: 0.05 }));
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
    ["#d-boucle-figure svg", 1.4],
    ["#e-elements-figure svg", 2.0],
    ["#e-marges-figure svg", 1.8],
    ["#f-schema-principal svg", 2.6],
    ["#i-carte-figure svg", 1.6],
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
      id: "c1-decibels",
      titre: "Rapport d'amplitudes en décibels",
      niveau: "fondamental",
      enonce: "<p>Un amplificateur multiplie l'amplitude d'une tension par $50$. Quel est son gain en décibels ?</p>",
      valeur: 20 * Math.log10(50),
      unite: "dB",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Gain",
      etapes: [
        { texte: "Rapport d'amplitudes : $20\\log_{10} 50$." },
        { texte: "$\\log_{10} 50 = \\log_{10} 100 - \\log_{10} 2 = 2 - 0{,}301 = 1{,}699$." },
        { texte: "$20 \\times 1{,}699 = 33{,}98\\ \\mathrm{dB}$.", note: "Contrôle : $50 = 10 \\times 5$, soit $20 + 13{,}98\\ \\mathrm{dB}$ ; ou $100/2$, soit $40 - 6{,}02\\ \\mathrm{dB}$." },
      ],
      visuelCorrection: correctionEtapes(
        ["50 = 100 / 2", "20 log10(100) = 40 dB ; 20 log10(2) = 6,02 dB", "gain = 40 - 6,02 = 33,98 dB"],
        "Les décibels transforment un produit ou un quotient en somme ou en différence."
      ),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-argument",
      titre: "Argument d'un quotient complexe",
      niveau: "fondamental",
      enonce: "<p>Que vaut, en degrés, l'argument de $\\dfrac{1}{1 + j\\sqrt3}$ ?</p>",
      valeur: -60,
      unite: "°",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Argument",
      etapes: [
        { texte: "$\\arg(1/z) = -\\arg z$." },
        { texte: "$\\arg(1 + j\\sqrt3) = \\arctan\\sqrt3 = 60^\\circ$, partie réelle positive : pas de correction de quadrant." },
        { texte: "Argument cherché : $-60^\\circ$.", note: "Le module vaut $1/2$, soit $-6{,}02\\ \\mathrm{dB}$ : c'est un pôle du premier ordre vu à $\\sqrt3$ fois sa cassure." },
      ],
      visuelCorrection: correctionEtapes(
        ["z = 1 + j √3 : |z| = 2, arg z = arctan(√3) = 60°", "1/z : module 1/2, argument -60°", "= pôle 1/(1 + jω/ωp) pour ω = √3 ωp"],
        "Module et argument d'un inverse."
      ),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c3-module",
      titre: "Module d'un premier ordre à sa cassure",
      niveau: "fondamental",
      enonce:
        "<p>$H(s) = \\dfrac{1}{1 + \\tau s}$ avec $\\tau = 2\\ \\mathrm{ms}$. Que vaut $|H(j\\omega)|$ pour $\\omega = 500\\ \\mathrm{rad/s}$ ?</p>",
      valeur: 1 / Math.SQRT2,
      unite: "",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Module",
      etapes: [
        { texte: "$\\omega\\tau = 500 \\times 0{,}002 = 1$ : on est exactement à la cassure." },
        { texte: "$|H| = 1/\\sqrt{1 + (\\omega\\tau)^2} = 1/\\sqrt2$." },
        { texte: "$= 0{,}707$, soit $-3{,}01\\ \\mathrm{dB}$ et une phase de $-45^\\circ$." },
      ],
      visuelCorrection(conteneur, moteur) {
        bodeCorrection(moteur, conteneur, {
          titre: "Premier ordre de cassure 500 rad/s",
          fonction: (w) => ({ gain_dB: -10 * Math.log10(1 + (w * 0.002) ** 2), phase_deg: -Math.atan(w * 0.002) * DEG }),
          fMin: 10,
          fMax: 50000,
          xTitre: "Pulsation",
          xUnite: "rad/s",
          coupure: 500,
          libelleCoupure: "ω = 500 : -3 dB, -45°",
          gainMin: -40,
          gainMax: 10,
          phaseMin: -90,
          phaseMax: 0,
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Simulation : sinusoïde à travers un premier ordre
   -------------------------------------------------------------------------- */

function construireSinus(racine, api) {
  const conteneur = racine.querySelector("#d-sinus-vivant");
  if (!conteneur) return;
  const etat = { lw: 2, tau: 0.01, p: 0 };

  const cadre = creerCadreBode({
    viewBox: [720, 320],
    x0: 70,
    x1: 690,
    wMin: 1,
    wMax: 1e4,
    gain: { y: 24, h: 104, min: -40, max: 5, ticks: [-40, -20, 0] },
    phase: { y: 158, h: 96, min: -90, max: 0, ticks: [-90, -45, 0] },
    idMarqueur: "d-si-fl",
    aria:
      "Diagramme de Bode d'un premier ordre : gain et phase en fonction de la pulsation de 1 à 10 000 rad/s, courbes exactes en trait plein, asymptotes en tirets, cassure en pointillé, point de fonctionnement sur chaque courbe et poignée de choix de la pulsation sous l'axe",
  });
  const { svg, X, Yg, Yp, chemin } = cadre;
  const rail = svgEl("g");
  rail.innerHTML =
    TRAITS + ' stroke-width="1.4"><path d="M70 292H690"/></g>' +
    ECRITS.replace('font-size="12"', 'font-size="11"') + texte(70, 314, "poignée : pulsation de la sinusoïde d'entrée ; trait plein : exact ; tirets : asymptotes") + "</g>";
  svg.appendChild(rail);
  const gainExact = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.4" });
  const gainAsym = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-dasharray": "7 5" });
  const phaseExacte = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.4" });
  const phaseAsym = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-dasharray": "7 5" });
  const cassure = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "2 4" });
  const pointG = svgEl("circle", { r: "5", fill: "currentColor" });
  const pointP = svgEl("circle", { r: "5", fill: "currentColor" });
  const guide = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "1 3" });
  const infos = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(gainAsym, gainExact, phaseAsym, phaseExacte, cassure, guide, pointG, pointP, infos);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#d-sinus-valeurs", [
    { id: "w", libelle: "Pulsation ω", format: (v) => v },
    { id: "wt", libelle: "Produit ωτ", decimales: 3 },
    { id: "m", libelle: "Rapport des amplitudes |H|", decimales: 4 },
    { id: "db", libelle: "Gain", format: (v) => v },
    { id: "phi", libelle: "Déphasage φ", format: (v) => v },
    { id: "dt", libelle: "Retard entre crêtes Δt = -φ/ω", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#d-sinus-trace", {
    titre: "Entrée et sortie en régime établi, sur deux périodes",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "amplitude",
    yUnite: "",
    xMin: 0,
    xMax: 125.7,
    yMin: -1.25,
    yMax: 1.25,
    ratio: 0.36,
    series: [
      { id: "x", nom: "entrée x(t) = sin ωt", points: [] },
      { id: "y", nom: "sortie y(t) = |H| sin(ωt + φ)", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      const w = 10 ** etat.lw;
      const m = 1 / Math.hypot(1, w * etat.tau);
      const phi = -Math.atan(w * etat.tau);
      const periode = TAU / w;
      const crete1 = (periode / 4) * 1000;
      const crete2 = ((periode / 4 - phi / w) * 1000);
      ligneV(c, r, couleurs, crete1, "crête de x", [2, 4], 14);
      ligneV(c, r, couleurs, crete2, "crête de y", [6, 4], 30);
      const t = etat.p * 2 * periode;
      const y = m * Math.sin(w * t + phi);
      ligneV(c, r, couleurs, t * 1000, null, [1, 3]);
      pointRepere(c, r, couleurs, t * 1000, y, null, false);
    },
  });
  if (trace) ressources.push(trace);

  function toutRecalculer() {
    const w = 10 ** etat.lw;
    const tau = etat.tau;
    const m = 1 / Math.hypot(1, w * tau);
    const phi = -Math.atan(w * tau);
    gainExact.setAttribute("d", chemin((v) => -10 * Math.log10(1 + (v * tau) ** 2), "gain"));
    gainAsym.setAttribute("d", chemin((v) => (v * tau <= 1 ? 0 : -20 * Math.log10(v * tau)), "gain"));
    phaseExacte.setAttribute("d", chemin((v) => -Math.atan(v * tau) * DEG, "phase"));
    phaseAsym.setAttribute(
      "d",
      chemin((v) => {
        const u = Math.log10(v * tau);
        return u <= -1 ? 0 : u >= 1 ? -90 : -45 * (u + 1);
      }, "phase")
    );
    const xc = X(1 / tau).toFixed(1);
    cassure.setAttribute("d", "M" + xc + " 24V128M" + xc + " 158V254");
    const x = X(w);
    pointG.setAttribute("cx", x.toFixed(1));
    pointG.setAttribute("cy", Yg(Math.max(-40, 20 * Math.log10(m))).toFixed(1));
    pointP.setAttribute("cx", x.toFixed(1));
    pointP.setAttribute("cy", Yp(phi * DEG).toFixed(1));
    guide.setAttribute("d", "M" + x.toFixed(1) + " 24V254M" + x.toFixed(1) + " 262V292");
    infos.innerHTML =
      texte(Number(xc) - 6, 120, "1/τ = " + nb(api, 1 / tau, 1) + " rad/s", ' text-anchor="end"');
    const periode = TAU / w;
    if (trace) {
      const n = 240;
      const pts = (fn) => Array.from({ length: n + 1 }, (_, i) => {
        const t = (2 * periode * i) / n;
        return [t * 1000, fn(t)];
      });
      trace.definirPlage({ xMin: 0, xMax: 2 * periode * 1000 });
      trace.definirDonnees("x", pts((t) => Math.sin(w * t)));
      trace.definirDonnees("y", pts((t) => m * Math.sin(w * t + phi)));
    }
    if (valeurs) {
      valeurs.maj({
        w: nb(api, w, w < 10 ? 2 : w < 100 ? 1 : 0) + " rad/s (" + nb(api, w / TAU, w / TAU < 10 ? 2 : 1) + " Hz)",
        wt: w * tau,
        m,
        db: nb(api, 20 * Math.log10(m), 2) + " dB",
        phi: nb(api, phi * DEG, 1) + " °",
        dt: nb(api, (-phi / w) * 1000, 3) + " ms",
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: 70, y: 292 },
    a: { x: 690, y: 292 },
    min: 0,
    max: 4,
    pas: 0.01,
    valeur: etat.lw,
    libelle: "Pulsation de la sinusoïde d'entrée, en échelle logarithmique",
    format: (m) => nb(api, 10 ** m.valeur, 1) + " rad/s",
    rappel(m) {
      etat.lw = m.valeur;
      toutRecalculer();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-sinus-curseurs",
    [{ id: "tau", libelle: "Constante de temps τ", min: 1, max: 50, pas: 1, valeur: 10, format: (v) => v + " ms" }],
    (lues) => {
      etat.tau = lues.tau / 1000;
      toutRecalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-sinus-lecteur", {
    de: 0,
    a: 1,
    duree: 6,
    boucle: true,
    auto: false,
    libelle: "Repère temporel sur les deux périodes",
    rappel: (p) => {
      etat.p = p;
      if (trace) trace.demanderRendu();
    },
  });
  if (lecteur) ressources.push(lecteur);

  toutRecalculer();
  ressources.push(api.dessiner(cadre.decor, { declencheur: conteneur, duree: 1.2 }));
}

/* --------------------------------------------------------------------------
   E. Simulation : constructeur de Bode asymptotique
   -------------------------------------------------------------------------- */

const NATURES = ["aucun", "pôle réel", "zéro réel", "paire de pôles"];

function construireConstructeur(racine, api) {
  const conteneur = racine.querySelector("#e-constructeur-vivant");
  if (!conteneur) return;
  const etat = { kdb: 20, n: 0, la: 1, lb: 2, nature: 2, zeta: 0.1 };

  const cadre = creerCadreBode({
    viewBox: [720, 380],
    x0: 70,
    x1: 690,
    wMin: 0.1,
    wMax: 1e4,
    gain: { y: 24, h: 150, min: -80, max: 60, ticks: [-60, -40, -20, 0, 20, 40] },
    phase: { y: 204, h: 120, min: -270, max: 90, ticks: [-270, -180, -90, 0, 90] },
    idMarqueur: "e-co-fl",
    aria:
      "Constructeur de Bode : gain et phase de 0,1 à 10 000 rad/s, courbe exacte en trait plein, somme des asymptotes en tirets, cassures en pointillé, deux poignées sous l'axe pour déplacer les cassures",
  });
  const { svg, X, Yg, chemin } = cadre;
  const rail = svgEl("g");
  rail.innerHTML =
    TRAITS + ' stroke-width="1.4"><path d="M70 352H690"/></g>' +
    ECRITS.replace('font-size="12"', 'font-size="11"') + texte(70, 374, "poignées : cassures ωa (pôle réel) et ωb (second terme) ; trait plein : exact ; tirets : asymptotes") + "</g>";
  svg.appendChild(rail);
  const zero = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "0.8", d: "M70 " + Yg(0).toFixed(1) + "H690" });
  const gainExact = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.6" });
  const gainAsym = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.4", "stroke-dasharray": "7 5" });
  const phaseExacte = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.6" });
  const phaseAsym = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.4", "stroke-dasharray": "7 5" });
  const cassures = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "2 4" });
  const pentes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(zero, gainAsym, gainExact, phaseAsym, phaseExacte, cassures, pentes);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#e-constructeur-valeurs", [
    { id: "h", libelle: "Fonction construite", format: (v) => v },
    { id: "pentes", libelle: "Pentes successives", format: (v) => v },
    { id: "phi", libelle: "Phase à basse et à haute pulsation", format: (v) => v },
    { id: "ecart", libelle: "Écart maximal entre exact et asymptote", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function termes() {
    const wa = 10 ** etat.la;
    const wb = 10 ** etat.lb;
    const K = etat.kdb;
    const n = etat.n;
    const nat = etat.nature;
    const z = etat.zeta;
    const gain = (w) => {
      let g = K - 20 * n * Math.log10(w) - 10 * Math.log10(1 + (w / wa) ** 2);
      const u = w / wb;
      if (nat === 1) g -= 10 * Math.log10(1 + u * u);
      if (nat === 2) g += 10 * Math.log10(1 + u * u);
      if (nat === 3) g -= 10 * Math.log10((1 - u * u) ** 2 + (2 * z * u) ** 2);
      return g;
    };
    const phase = (w) => {
      let p = -90 * n - Math.atan(w / wa) * DEG;
      const u = w / wb;
      if (nat === 1) p -= Math.atan(u) * DEG;
      if (nat === 2) p += Math.atan(u) * DEG;
      if (nat === 3) p -= Math.atan2(2 * z * u, 1 - u * u) * DEG;
      return p;
    };
    const gainA = (w) => {
      let g = K - 20 * n * Math.log10(w);
      if (w > wa) g -= 20 * Math.log10(w / wa);
      if (w > wb) {
        if (nat === 1) g -= 20 * Math.log10(w / wb);
        if (nat === 2) g += 20 * Math.log10(w / wb);
        if (nat === 3) g -= 40 * Math.log10(w / wb);
      }
      return g;
    };
    const rampe = (w, wk) => {
      const u = Math.log10(w / wk);
      return u <= -1 ? 0 : u >= 1 ? 1 : (u + 1) / 2;
    };
    const phaseA = (w) => {
      let p = -90 * n - 90 * rampe(w, wa);
      if (nat === 1) p -= 90 * rampe(w, wb);
      if (nat === 2) p += 90 * rampe(w, wb);
      if (nat === 3) p -= w >= wb ? 180 : 0;
      return p;
    };
    return { wa, wb, gain, phase, gainA, phaseA };
  }

  function toutRecalculer() {
    const t = termes();
    gainExact.setAttribute("d", chemin(t.gain, "gain", 400));
    gainAsym.setAttribute("d", chemin(t.gainA, "gain", 400));
    phaseExacte.setAttribute("d", chemin(t.phase, "phase", 400));
    phaseAsym.setAttribute("d", chemin(t.phaseA, "phase", 400));
    const xa = X(t.wa).toFixed(1);
    const xb = X(t.wb).toFixed(1);
    cassures.setAttribute("d", "M" + xa + " 24V324M" + (etat.nature ? "" + xb + " 24V324" : "0 0"));

    /* Pentes de chaque bande, posées sur l'asymptote au milieu de la bande. */
    const bornes = [0.1, t.wa];
    if (etat.nature) bornes.push(t.wb);
    bornes.push(1e4);
    const triees = Array.from(new Set(bornes)).sort((a, b) => a - b);
    const sequence = [];
    let html = "";
    for (let i = 0; i < triees.length - 1; i += 1) {
      const a = triees[i];
      const b = triees[i + 1];
      if (b / a < 1.0001) continue;
      const milieu = Math.sqrt(a * b);
      const pente = Math.round((t.gainA(milieu * 1.01) - t.gainA(milieu / 1.01)) / (2 * Math.log10(1.01)));
      sequence.push((pente > 0 ? "+" : "") + pente);
      const g = t.gainA(milieu);
      if (g > -76 && g < 56 && Math.log10(b / a) > 0.35) {
        html += texte(X(milieu) - 14, Yg(g) - 8, (pente > 0 ? "+" : "") + pente);
      }
    }
    html += texte(Number(xa) + 4, 38, "ωa") + (etat.nature ? texte(Number(xb) + 4, etat.lb - etat.la < 0.25 && etat.lb >= etat.la ? 54 : 38, "ωb") : "");
    pentes.innerHTML = html;

    let ecart = 0;
    let wEcart = 0.1;
    for (let i = 0; i <= 500; i += 1) {
      const w = 10 ** (-1 + (5 * i) / 500);
      const e = Math.abs(t.gain(w) - t.gainA(w));
      if (e > ecart) {
        ecart = e;
        wEcart = w;
      }
    }
    if (valeurs) {
      const termeB =
        etat.nature === 1 ? " / (1 + jω/ωb)" : etat.nature === 2 ? " × (1 + jω/ωb)" : etat.nature === 3 ? " / (paire ωb, ζ = " + nb(api, etat.zeta, 2) + ")" : "";
      valeurs.maj({
        h:
          nb(api, etat.kdb, 0) + " dB" + (etat.n ? " / jω" : "") + " / (1 + jω/ωa)" + termeB +
          ", ωa = " + nb(api, t.wa, t.wa < 10 ? 2 : 0) + (etat.nature ? ", ωb = " + nb(api, t.wb, t.wb < 10 ? 2 : 0) : "") + " rad/s",
        pentes: sequence.join(" puis ") + " dB/déc",
        phi: nb(api, t.phase(0.1), 1) + " ° puis " + nb(api, t.phase(1e4), 1) + " °",
        ecart: nb(api, ecart, 2) + " dB vers " + nb(api, wEcart, wEcart < 10 ? 2 : 0) + " rad/s",
      });
    }
  }

  const poigneeA = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: 70, y: 352 },
    a: { x: 690, y: 352 },
    min: -1,
    max: 4,
    pas: 0.01,
    valeur: etat.la,
    libelle: "Cassure ωa du pôle réel",
    format: (m) => nb(api, 10 ** m.valeur, 2) + " rad/s",
    rappel(m) {
      etat.la = m.valeur;
      toutRecalculer();
    },
  });
  if (poigneeA) ressources.push(poigneeA);

  const poigneeB = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: 70, y: 352 },
    a: { x: 690, y: 352 },
    min: -1,
    max: 4,
    pas: 0.01,
    valeur: etat.lb,
    libelle: "Cassure ωb du second terme",
    format: (m) => nb(api, 10 ** m.valeur, 2) + " rad/s",
    rappel(m) {
      etat.lb = m.valeur;
      toutRecalculer();
    },
  });
  if (poigneeB) ressources.push(poigneeB);

  const curseurs = api.sim.curseurs(
    "#e-constructeur-curseurs",
    [
      { id: "kdb", libelle: "Gain K", min: -20, max: 40, pas: 1, valeur: etat.kdb, format: (v) => v + " dB" },
      { id: "n", libelle: "Intégrateur", min: 0, max: 1, pas: 1, valeur: etat.n, format: (v) => (v ? "1/s présent" : "aucun") },
      { id: "nature", libelle: "Second terme en ωb", min: 0, max: 3, pas: 1, valeur: etat.nature, format: (v) => NATURES[v] },
      { id: "zeta", libelle: "Amortissement ζ de la paire", min: 0.05, max: 1, pas: 0.05, valeur: etat.zeta, format: (v) => nb(api, v, 2) },
    ],
    (lues) => {
      etat.kdb = lues.kdb;
      etat.n = lues.n;
      etat.nature = lues.nature;
      etat.zeta = lues.zeta;
      toutRecalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  toutRecalculer();
  ressources.push(api.dessiner(cadre.decor, { declencheur: conteneur, duree: 1.2 }));
}

/* --------------------------------------------------------------------------
   E. Simulation : marges et réponse de la boucle de position
   -------------------------------------------------------------------------- */

function construireMarges(racine, api) {
  const conteneur = racine.querySelector("#e-marges-vivant");
  if (!conteneur) return;
  const etat = { lk: 2, T: 0, t: 0, res: null, ind: null, m: null };
  const TMAX = 0.1;

  const cadre = creerCadreBode({
    viewBox: [720, 352],
    x0: 70,
    x1: 690,
    wMin: 10,
    wMax: 1e4,
    gain: { y: 24, h: 130, min: -60, max: 40, ticks: [-40, -20, 0, 20] },
    phase: { y: 184, h: 130, min: -270, max: -90, ticks: [-225, -180, -135] },
    idMarqueur: "e-mr-fl",
    titreGain: "|L| (dB)",
    titrePhase: "arg L (°)",
    aria:
      "Bode de la boucle ouverte de position : gain et phase de 10 à 10 000 rad/s, 0 dB et -180 degrés en tirets, verticales en pointillé à omega c et omega 180, flèches doubles des marges de phase et de gain",
  });
  const { svg, X, Yg, Yp, chemin } = cadre;
  const references = svgEl("path", {
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.4",
    "stroke-dasharray": "9 5",
    d: "M70 " + Yg(0).toFixed(1) + "H690M70 " + Yp(-180).toFixed(1) + "H690",
  });
  const gainC = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.6" });
  const phaseC = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.6" });
  const verticales = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "3 3" });
  const flecheP = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.8", "marker-start": "url(#e-mr-fl)", "marker-end": "url(#e-mr-fl)" });
  const flecheG = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.8", "marker-start": "url(#e-mr-fl)", "marker-end": "url(#e-mr-fl)" });
  const infos = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(references, gainC, phaseC, verticales, flecheP, flecheG, infos);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#e-marges-valeurs", [
    { id: "kv", libelle: "Gain de boucle Kv", format: (v) => v },
    { id: "wc", libelle: "Coupure à 0 dB ωc", format: (v) => v },
    { id: "pm", libelle: "Marge de phase", format: (v) => v },
    { id: "w180", libelle: "Pulsation ω180", format: (v) => v },
    { id: "gm", libelle: "Marge de gain", format: (v) => v },
    { id: "tmax", libelle: "Retard supplémentaire admissible", format: (v) => v },
    { id: "D", libelle: "Dépassement indiciel", format: (v) => v },
    { id: "ts", libelle: "Temps d'établissement à 5 %", format: (v) => v },
    { id: "verdict", libelle: "Boucle fermée", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#e-marges-trace", {
    titre: "Position après un échelon de consigne de 1 rad",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "θ",
    yUnite: "rad",
    xMin: 0,
    xMax: TMAX * 1000,
    yMin: -0.5,
    yMax: 2,
    ratio: 0.38,
    series: [{ id: "y", nom: "position θ(t)", points: [] }],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 1, "consigne 1 rad", [9, 5]);
      ligneH(c, r, couleurs, 1.05, null, [3, 4]);
      ligneH(c, r, couleurs, 0.95, null, [3, 4]);
      const res = etat.res;
      if (res) {
        const y = interpoler(res.t, res.y, etat.t);
        ligneV(c, r, couleurs, etat.t * 1000, null, [1, 3]);
        if (Number.isFinite(y)) pointRepere(c, r, couleurs, etat.t * 1000, Math.max(-0.5, Math.min(2, y)), null, false);
      }
    },
  });
  if (trace) ressources.push(trace);

  function toutRecalculer() {
    const Kv = 10 ** etat.lk;
    const T = etat.T;
    const m = margesPosition(Kv, T);
    etat.m = m;
    gainC.setAttribute("d", chemin((w) => gainPosition(w, Kv), "gain"));
    phaseC.setAttribute("d", chemin((w) => phasePosition(w, T), "phase"));
    const xc = X(Math.max(10, Math.min(1e4, m.wc)));
    const x180 = X(Math.max(10, Math.min(1e4, m.w180)));
    verticales.setAttribute("d", "M" + xc.toFixed(1) + " 24V314M" + x180.toFixed(1) + " 24V314");
    const yPhase = Yp(Math.max(-270, Math.min(-90, phasePosition(m.wc, T))));
    const yGain = Yg(Math.max(-60, Math.min(40, gainPosition(m.w180, Kv))));
    const ecartP = yPhase - Yp(-180);
    const ecartG = yGain - Yg(0);
    flecheP.setAttribute("d", Math.abs(ecartP) > 8 ? "M" + (xc - 8).toFixed(1) + " " + (Yp(-180) + Math.sign(ecartP) * 3).toFixed(1) + "V" + (yPhase - Math.sign(ecartP) * 3).toFixed(1) : "M0 0");
    flecheG.setAttribute("d", Math.abs(ecartG) > 8 ? "M" + (x180 + 8).toFixed(1) + " " + (Yg(0) + Math.sign(ecartG) * 3).toFixed(1) + "V" + (yGain - Math.sign(ecartG) * 3).toFixed(1) : "M0 0");
    const aGaucheP = xc > 360;
    infos.innerHTML =
      texte(xc + (aGaucheP ? -14 : 14), Yp(-160), "MP = " + nb(api, m.pm, 1) + "°", aGaucheP ? ' text-anchor="end"' : "") +
      texte(x180 + 14, m.gm > 0 ? Yg(-8) : Yg(12), "MG = " + nb(api, m.gm, 1) + " dB") +
      texte(xc + 4, 38, "ωc") +
      texte(x180 + 4, Math.abs(x180 - xc) < 44 ? 54 : 38, "ω180") +
      texte(684, Yg(0) - 6, "0 dB", ' text-anchor="end"') +
      texte(684, Yp(-180) - 6, "-180°", ' text-anchor="end"') +
      texte(684, 346, m.pm > 0 && m.gm > 0 ? "marges positives : stable" : "marge négative : instable", ' text-anchor="end"');

    const res = simulerPosition(Kv, T, TMAX);
    etat.res = res;
    etat.ind = m.pm > 0 ? indicateursEchelon(res.t, res.y) : null;
    if (trace) {
      let sorti = false;
      trace.definirDonnees(
        "y",
        res.t.map((t, i) => {
          const v = res.y[i];
          if (sorti || !Number.isFinite(v)) return [t * 1000, NaN];
          if (v > 2 || v < -0.5) {
            sorti = true;
            return [t * 1000, Math.max(-0.5, Math.min(2, v))];
          }
          return [t * 1000, v];
        })
      );
    }
    if (valeurs) {
      const ind = etat.ind;
      valeurs.maj({
        kv: nb(api, Kv, Kv < 100 ? 1 : 0) + " s⁻¹ (Kθ = " + nb(api, Kv / G0, 2) + " V/rad), retard " + nb(api, T * 1000, 1) + " ms",
        wc: nb(api, m.wc, 1) + " rad/s (" + nb(api, m.wc / TAU, 2) + " Hz)",
        pm: nb(api, m.pm, 1) + " °",
        w180: nb(api, m.w180, 1) + " rad/s (" + nb(api, m.w180 / TAU, 2) + " Hz)",
        gm: nb(api, m.gm, 2) + " dB (facteur " + nb(api, 10 ** (m.gm / 20), 2) + ")",
        tmax: m.pm > 0 ? nb(api, m.tmax * 1000, 2) + " ms" : "aucun",
        D: ind && !ind.diverge ? nb(api, ind.D, 2) + " %" : "sans objet",
        ts: ind && !ind.diverge ? (Number.isFinite(ind.ts) ? nb(api, ind.ts * 1000, 1) + " ms" : "au-delà de 100 ms") : "sans objet",
        verdict: m.pm > 0 && m.gm > 0 ? (m.pm < 30 ? "stable mais peu amortie" : "stable") : "instable : oscillation croissante",
      });
    }
    if (trace) trace.demanderRendu();
  }

  const curseurs = api.sim.curseurs(
    "#e-marges-curseurs",
    [
      { id: "lk", libelle: "Gain de boucle Kv (échelle logarithmique)", min: 1, max: 3.2, pas: 0.01, valeur: etat.lk, format: (v) => nb(api, 10 ** v, 10 ** v < 100 ? 1 : 0) + " s⁻¹" },
      { id: "T", libelle: "Retard de mesure T", min: 0, max: 20, pas: 0.5, valeur: 0, format: (v) => nb(api, v, 1) + " ms" },
    ],
    (lues) => {
      etat.lk = lues.lk;
      etat.T = lues.T / 1000;
      toutRecalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-marges-lecteur", {
    de: 0,
    a: TMAX,
    duree: 8,
    boucle: false,
    auto: false,
    libelle: "Temps de la réponse indicielle",
    rappel: (t) => {
      etat.t = t;
      if (trace) trace.demanderRendu();
    },
  });
  if (lecteur) ressources.push(lecteur);

  if (!etat.res) toutRecalculer();
  ressources.push(api.dessiner(cadre.decor, { declencheur: conteneur, duree: 1.2 }));
}

/* --------------------------------------------------------------------------
   H. Bode exact de l'exemple résolu
   -------------------------------------------------------------------------- */

function construireBodeExemple(racine, api) {
  if (!racine.querySelector("#h-bode")) return;
  const m = margesPosition(100, 0);
  const bode = api.sim.bode("#h-bode", {
    titre: "Boucle ouverte de position, Kv = 100 s⁻¹",
    fonction: (w) => ({ gain_dB: gainPosition(w, 100), phase_deg: phasePosition(w, 0) }),
    fMin: 1,
    fMax: 1e4,
    xTitre: "Pulsation",
    xUnite: "rad/s",
    coupure: m.wc,
    libelleCoupure: "ωc = " + nb(api, m.wc, 1) + " rad/s",
    gainMin: -80,
    gainMax: 40,
    phaseMin: -270,
    phaseMax: -90,
    echantillons: 320,
  });
  if (bode) ressources.push(bode);
}

/* --------------------------------------------------------------------------
   Dessins réutilisés : asymptotes d'identification, Bode des marges
   -------------------------------------------------------------------------- */

/** Asymptotes de gain à identifier : 26 dB, cassures 20 et 500 rad/s. */
function dessinIdentification(id) {
  const X = (w) => 60 + 130 * Math.log10(w);
  const Y = (g) => 30 + (150 * (40 - g)) / 60;
  const g500 = 26 - 20 * Math.log10(25);
  const wFin = 500 * 10 ** ((g500 + 20) / 40);
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.2">';
  s += '<rect x="60" y="30" width="520" height="150"/>';
  let g = "";
  for (const w of [10, 100, 1000]) g += "M" + X(w).toFixed(1) + " 30V180";
  for (const v of [20, 0]) g += "M60 " + Y(v).toFixed(1) + "H580";
  s += '<path d="' + g + '" stroke-width="0.6" stroke-dasharray="2 4"/>';
  s +=
    '<path d="M' + X(1).toFixed(1) + " " + Y(26).toFixed(1) + "L" + X(20).toFixed(1) + " " + Y(26).toFixed(1) + "L" + X(500).toFixed(1) + " " +
    Y(g500).toFixed(1) + "L" + X(wFin).toFixed(1) + " " + Y(-20).toFixed(1) + '" stroke-width="2.6"/>';
  s += '<path d="M' + X(20).toFixed(1) + " 150V180M" + X(500).toFixed(1) + ' 150V180" stroke-width="1" stroke-dasharray="3 3"/></g>';
  s += ECRITS.replace('font-size="12"', 'font-size="11"');
  for (const v of [20, 0]) s += texte(54, Y(v) + 4, (v > 0 ? "+" : "") + v, ' text-anchor="end"');
  for (const [w, l] of [[1, "1"], [10, "10"], [100, "100"], [1000, "1000"]]) s += texte(X(w), 196, l, ' text-anchor="middle"');
  s += texte(8, 22, "gain (dB)") + texte(580, 214, "ω (rad/s)", ' text-anchor="end"');
  s += texte(X(2), Y(26) - 8, "palier à 26 dB") + texte(X(20) + 4, 172, "20") + texte(X(500) + 4, 172, "500");
  s += texte(X(60), Y(10) - 4, "-20 dB/déc") + texte(X(700) + 6, Y(-8), "-40 dB/déc") + "</g>";
  return s;
}

const MG = { x0: 80, x1: 680, lMin: Math.log10(0.05), lMax: Math.log10(20) };
function margesX(w) {
  return MG.x0 + ((MG.x1 - MG.x0) * (Math.log10(w) - MG.lMin)) / (MG.lMax - MG.lMin);
}
function margesYg(v) {
  return 30 + (170 * (40 - v)) / 80;
}
function margesYp(v) {
  return 240 + (150 * (-90 - v)) / 180;
}

/** Bode de L = 1/(s(1 + s)(1 + 0,25 s)) pour la question d'interprétation. */
function dessinMarges(id) {
  const gain = (w) => -20 * Math.log10(w * Math.hypot(1, w) * Math.hypot(1, 0.25 * w));
  const phase = (w) => -90 - (Math.atan(w) + Math.atan(0.25 * w)) * DEG;
  const cheminF = (f, Y, min, max) => {
    let s = "";
    for (let i = 0; i <= 200; i += 1) {
      const w = 10 ** (MG.lMin + ((MG.lMax - MG.lMin) * i) / 200);
      const v = Math.max(min, Math.min(max, f(w)));
      s += (i ? "L" : "M") + margesX(w).toFixed(1) + " " + Y(v).toFixed(1);
    }
    return s;
  };
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.2">';
  s += '<rect x="80" y="30" width="600" height="170"/><rect x="80" y="240" width="600" height="150"/>';
  s += '<path d="' + cheminF(gain, margesYg, -40, 40) + '" stroke-width="2.6"/>';
  s += '<path d="' + cheminF(phase, margesYp, -270, -90) + '" stroke-width="2.6"/>';
  s += '<path d="M80 ' + margesYg(0).toFixed(1) + "H680M80 " + margesYp(-180).toFixed(1) + 'H680" stroke-width="1.4" stroke-dasharray="9 5"/></g>';
  s += ECRITS + texte(16, 24, "|L| (dB)") + texte(16, 234, "arg L (°)") + texte(600, 420, "ω (rad/s)");
  s += texte(74, margesYg(0) + 4, "0", ' text-anchor="end"') + texte(74, margesYp(-180) + 4, "-180", ' text-anchor="end"');
  s += texte(margesX(0.1), 408, "0,1", ' text-anchor="middle"') + texte(margesX(1), 408, "1", ' text-anchor="middle"') + texte(margesX(10), 408, "10", ' text-anchor="middle"');
  s += "</g>";
  return s;
}

const ZONES_MARGES = [
  { x: 330, y: 262, largeur: 54, hauteur: 64, etiquette: "écart entre la phase et -180° à la pulsation où le gain vaut 0 dB" },
  { x: 424, y: 100, largeur: 54, hauteur: 56, etiquette: "écart entre le gain et 0 dB à la pulsation où la phase vaut -180°" },
  { x: 96, y: 36, largeur: 90, hauteur: 50, etiquette: "gain à basse pulsation" },
  { x: 560, y: 330, largeur: 110, hauteur: 56, etiquette: "phase à haute pulsation" },
];

function zonesMarges(juste) {
  return ZONES_MARGES.map((z, k) => (k === juste ? { ...z, juste: true } : { ...z }));
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-premier-ordre",
      titre: "Fondamental 1 : gain d'un premier ordre à sa cassure",
      niveau: "fondamental",
      enonce:
        "<p>Un capteur est modélisé par $H(s) = \\dfrac{10}{1 + 0{,}01\\,s}$, en $\\mathrm{mV}$ par unité de grandeur mesurée. Quel est son gain, en " +
        "décibels, pour une grandeur mesurée sinusoïdale de pulsation $\\omega = 100\\ \\mathrm{rad/s}$ ? Quelle est la phase ?</p>",
      valeur: 20 * Math.log10(10 / Math.SQRT2),
      unite: "dB",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Gain",
      etapes: [
        { texte: "Forme canonique : gain statique $K = 10$, soit $20\\ \\mathrm{dB}$ ; cassure $\\omega_p = 1/0{,}01 = 100\\ \\mathrm{rad/s}$." },
        { texte: "À la cassure, le terme $1/(1 + j)$ vaut $1/\\sqrt2$ en module, soit $-3{,}01\\ \\mathrm{dB}$, et $-45^\\circ$ en argument." },
        { texte: "Gain : $20 - 3{,}01 = 16{,}99\\ \\mathrm{dB}$, soit $|H| = 7{,}07$ ; phase $-45^\\circ$.", note: "Le décibel dépend ici de l'unité choisie, $\\mathrm{mV}$ par unité : c'est une convention de tracé." },
      ],
      visuelCorrection(conteneur, moteur) {
        bodeCorrection(moteur, conteneur, {
          titre: "H = 10 / (1 + 0,01 s)",
          fonction: (w) => ({ gain_dB: 20 - 10 * Math.log10(1 + (w * 0.01) ** 2), phase_deg: -Math.atan(w * 0.01) * DEG }),
          fMin: 1,
          fMax: 10000,
          xTitre: "Pulsation",
          xUnite: "rad/s",
          coupure: 100,
          libelleCoupure: "ω = 100 : 16,99 dB, -45°",
          gainMin: -30,
          gainMax: 30,
          phaseMin: -90,
          phaseMax: 0,
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-filtre-rc",
      titre: "Fondamental 2 : atténuation du découpage par un filtre RC",
      niveau: "fondamental",
      enonce:
        "<p>Une entrée analogique d'automate est précédée d'un filtre RC passe-bas, $R = 10\\ \\mathrm{k\\Omega}$ et $C = 100\\ \\mathrm{nF}$, sans charge. Une " +
        "perturbation à $16\\ \\mathrm{kHz}$, fréquence de découpage d'un variateur voisin, s'ajoute au signal. De combien de décibels est-elle atténuée ? " +
        "Donnez la valeur exacte, négative.</p>",
      valeur: -10 * Math.log10(1 + (16000 * TAU * 1e4 * 100e-9) ** 2),
      unite: "dB",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Gain à 16 kHz",
      etapes: [
        { texte: "Fréquence de coupure : $f_c = 1/(2\\pi RC) = 1/(2\\pi \\times 10^4 \\times 10^{-7}) = 159{,}2\\ \\mathrm{Hz}$." },
        { texte: "$f/f_c = 16000/159{,}2 = 100{,}5$ : deux décades au-delà de la cassure ; l'asymptote donne $-20\\log_{10}(100{,}5) = -40{,}05\\ \\mathrm{dB}$." },
        { texte: "Valeur exacte : $-10\\log_{10}(1 + 100{,}5^2) = -40{,}05\\ \\mathrm{dB}$, soit un facteur $1/100{,}5$ ; phase $-89{,}4^\\circ$.", note: "Loin de la cassure, l'asymptote est exacte à mieux que $0{,}01\\ \\mathrm{dB}$. Le rapport des fréquences se calcule en hertz ou en radians par seconde, pourvu que ce soit la même unité." },
      ],
      visuelCorrection(conteneur, moteur) {
        const fc = 1 / (TAU * 1e4 * 100e-9);
        bodeCorrection(moteur, conteneur, {
          titre: "Filtre RC 10 kΩ, 100 nF",
          fonction: (f) => ({ gain_dB: -10 * Math.log10(1 + (f / fc) ** 2), phase_deg: -Math.atan(f / fc) * DEG }),
          fMin: 1,
          fMax: 100000,
          xTitre: "Fréquence",
          xUnite: "Hz",
          coupure: 16000,
          libelleCoupure: "16 kHz : -40,05 dB",
          gainMin: -60,
          gainMax: 10,
          phaseMin: -90,
          phaseMax: 0,
        });
      },
    })
  );

  const gI1 = 26 - 10 * Math.log10(1 + 25) - 10 * Math.log10(1 + 0.04);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-identification",
      titre: "Intermédiaire 1 : identifier une fonction de transfert sur ses asymptotes",
      niveau: "intermediaire",
      enonce:
        "<p>Un balayage sinusoïdal d'un procédé stable a donné les asymptotes de gain ci-dessous ; la phase part de $0^\\circ$ et tend vers $-180^\\circ$ sans " +
        "bosse visible. Écrivez la fonction de transfert, puis calculez le gain exact, en décibels, à $\\omega = 100\\ \\mathrm{rad/s}$.</p>" +
        '<figure class="visuel-enonce"><svg id="k3-svg" viewBox="0 0 600 220" role="img" aria-label="Asymptotes de gain : palier à 26 dB jusqu\'à 20 rad/s, puis pente de -20 dB par décade jusqu\'à 500 rad/s, puis -40 dB par décade">' +
        dessinIdentification("k3-fl") +
        "</svg><figcaption>Asymptotes de gain mesurées, trait plein ; abscisse logarithmique de la pulsation de $1$ à $10^4\\ \\mathrm{rad/s}$ ; " +
        "les verticales en pointillé repèrent les cassures à $20$ et $500\\ \\mathrm{rad/s}$.</figcaption></figure>",
      valeur: gI1,
      unite: "dB",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Gain à 100 rad/s",
      etapes: [
        { texte: "Palier à $26\\ \\mathrm{dB}$ : $K = 10^{26/20} = 19{,}95$, environ $20$ ; pas d'intégrateur, la pente de départ est nulle." },
        { texte: "Passage à $-20$ puis $-40\\ \\mathrm{dB}$ par décade : deux pôles réels, à $20$ et $500\\ \\mathrm{rad/s}$ ; la phase finale de $-180^\\circ$ et l'absence de bosse le confirment. $H(s) = 19{,}95/((1 + s/20)(1 + s/500))$." },
        { texte: "À $100\\ \\mathrm{rad/s}$ : $26 - 10\\log_{10}(1 + 5^2) - 10\\log_{10}(1 + 0{,}2^2) = 26 - 14{,}15 - 0{,}17$." },
        { texte: "$= 11{,}68\\ \\mathrm{dB}$, contre $12{,}04\\ \\mathrm{dB}$ sur l'asymptote.", note: "Un second ordre très amorti aurait les mêmes asymptotes lointaines ; seules la forme près des cassures et la phase permettent de trancher." },
      ],
      visuelCorrection(conteneur, moteur) {
        bodeCorrection(moteur, conteneur, {
          titre: "H = 19,95 / ((1 + s/20)(1 + s/500))",
          fonction: (w) => ({
            gain_dB: 26 - 10 * Math.log10(1 + (w / 20) ** 2) - 10 * Math.log10(1 + (w / 500) ** 2),
            phase_deg: -(Math.atan(w / 20) + Math.atan(w / 500)) * DEG,
          }),
          fMin: 1,
          fMax: 10000,
          xTitre: "Pulsation",
          xUnite: "rad/s",
          coupure: 100,
          libelleCoupure: "ω = 100 : 11,68 dB",
          gainMin: -40,
          gainMax: 40,
          phaseMin: -180,
          phaseMax: 0,
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-marge-phase",
      titre: "Intermédiaire 2 : marge de phase d'une boucle intégrale",
      niveau: "intermediaire",
      enonce:
        "<p>Une boucle ouverte vaut $L(s) = \\dfrac{10}{s(1 + 0{,}1\\,s)}$. Calculez la pulsation de coupure $\\omega_c$, puis la marge de phase, en degrés. " +
        "Que vaut la marge de gain ?</p>",
      valeur: 90 - Math.atan(0.1 * 7.861513777574232) * DEG,
      unite: "°",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Marge de phase",
      etapes: [
        { texte: "Asymptote : $10/\\omega$ coupe $0\\ \\mathrm{dB}$ à $10\\ \\mathrm{rad/s}$, exactement à la cassure : l'asymptote ne suffit pas, il faut le module exact." },
        { texte: "$\\omega\\sqrt{1 + 0{,}01\\,\\omega^2} = 10 \\iff 0{,}01\\,\\omega^4 + \\omega^2 - 100 = 0$, donc $\\omega^2 = (-1 + \\sqrt{1 + 4})/0{,}02 = 61{,}80$ et $\\omega_c = 7{,}86\\ \\mathrm{rad/s}$." },
        { texte: "$\\arg L = -90^\\circ - \\arctan(0{,}786) = -90 - 38{,}17 = -128{,}17^\\circ$." },
        { texte: "$M_\\varphi = 51{,}8^\\circ$. La phase ne descend jamais sous $-180^\\circ$ : marge de gain infinie.", note: "Cette boucle est exactement la boucle canonique avec $\\zeta = 0{,}5$ ($\\omega_0 = 10$) : on retrouve le $51{,}8^\\circ$ du tableau de la section E." },
      ],
      visuelCorrection(conteneur, moteur) {
        bodeCorrection(moteur, conteneur, {
          titre: "L = 10 / (s (1 + 0,1 s))",
          fonction: (w) => ({ gain_dB: 20 - 20 * Math.log10(w) - 10 * Math.log10(1 + (0.1 * w) ** 2), phase_deg: -90 - Math.atan(0.1 * w) * DEG }),
          fMin: 0.1,
          fMax: 1000,
          xTitre: "Pulsation",
          xUnite: "rad/s",
          coupure: 7.8615,
          libelleCoupure: "ωc = 7,86 : MP = 51,8°",
          gainMin: -60,
          gainMax: 40,
          phaseMin: -180,
          phaseMax: -90,
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-retard",
      titre: "Avancé : gain de position maximal avec un retard de calcul",
      niveau: "avance",
      enonce:
        "<p>Le correcteur de position de l'actionneur est rendu numérique ; échantillonnage et calcul introduisent un retard équivalent $T = 2\\ \\mathrm{ms}$. " +
        "La boucle ouverte devient $L(s) = K_v e^{-sT}/\\bigl(s(1 + \\tau_1 s)(1 + \\tau_2 s)\\bigr)$ avec $\\tau_1 = 3{,}797\\ \\mathrm{ms}$ et " +
        "$\\tau_2 = 1{,}066\\ \\mathrm{ms}$. Quel gain $K_v$, en $\\mathrm{s^{-1}}$, donne une marge de phase de $45^\\circ$ ? Que vaut alors la marge de gain ?</p>",
      valeur: 130.97,
      unite: "s⁻¹",
      tolerance: 0.03,
      chiffres: 0,
      libelleChamp: "Gain Kv",
      etapes: [
        { texte: "Le retard ne change pas le module : la contrainte porte sur la phase. Il faut à $\\omega_c$ : $90^\\circ - \\arctan(\\omega\\tau_1) - \\arctan(\\omega\\tau_2) - \\omega T \\cdot 180/\\pi = 45^\\circ$." },
        { texte: "Résolution numérique : à $\\omega = 118{,}5\\ \\mathrm{rad/s}$, $\\arctan(0{,}450) = 24{,}22^\\circ$, $\\arctan(0{,}126) = 7{,}20^\\circ$, $\\omega T = 0{,}237\\ \\mathrm{rad} = 13{,}58^\\circ$ ; somme $45{,}0^\\circ$." },
        { texte: "Gain qui place la coupure en $118{,}5\\ \\mathrm{rad/s}$ : $K_v = 118{,}5 \\times \\sqrt{1 + 0{,}450^2} \\times \\sqrt{1 + 0{,}126^2} = 118{,}5 \\times 1{,}0966 \\times 1{,}0079$." },
        { texte: "$K_v = 131\\ \\mathrm{s^{-1}}$, contre $220\\ \\mathrm{s^{-1}}$ sans retard.", note: "La phase atteint $-180^\\circ$ vers $260\\ \\mathrm{rad/s}$ ; la marge de gain vaut $9{,}2\\ \\mathrm{dB}$, au-dessus des $6\\ \\mathrm{dB}$ usuels. Deux millisecondes coûtent $40\\ \\%$ du gain admissible." },
      ],
      visuelCorrection(conteneur, moteur) {
        bodeCorrection(moteur, conteneur, {
          titre: "Kv = 131 s⁻¹, retard 2 ms",
          fonction: (w) => ({ gain_dB: gainPosition(w, 130.97), phase_deg: phasePosition(w, 0.002) }),
          fMin: 10,
          fMax: 3000,
          xTitre: "Pulsation",
          xUnite: "rad/s",
          coupure: 118.5,
          libelleCoupure: "ωc = 118,5 : MP = 45°",
          gainMin: -60,
          gainMax: 30,
          phaseMin: -360,
          phaseMax: -90,
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-diagnostic-bus",
      titre: "Diagnostic industriel : la vanne se met à vibrer après une modification",
      niveau: "diagnostic",
      enonce:
        "<p>La boucle de position de l'actionneur, réglée à $K_v = 100\\ \\mathrm{s^{-1}}$, fonctionnait sans défaut avec un codeur câblé directement au " +
        "positionneur. Pour simplifier le câblage, la mesure de position a été envoyée par le bus de terrain vers l'automate, qui calcule désormais la " +
        "correction : le retard total de la mesure atteint environ $15\\ \\mathrm{ms}$. Depuis, la vanne vibre à environ $13\\ \\mathrm{Hz}$ et le courant " +
        "de l'actionneur bat en limitation. Quelles conclusions sont justifiées ?</p>",
      multiple: true,
      options: [
        { texte: "Le retard a consommé la marge de phase : à $\\omega_c = 93{,}7\\ \\mathrm{rad/s}$, $15\\ \\mathrm{ms}$ retirent environ $80^\\circ$, plus que les $64{,}7^\\circ$ disponibles.", juste: true },
        { texte: "La fréquence d'oscillation, proche de la nouvelle pulsation $\\omega_{180}$ d'environ $80\\ \\mathrm{rad/s}$, confirme une instabilité de boucle et non une résonance mécanique.", juste: true },
        { texte: "Réduire $K_v$ vers $40\\ \\mathrm{s^{-1}}$ rétablirait $45^\\circ$ de marge, au prix d'une boucle environ deux fois et demie plus lente ; replacer la boucle dans le positionneur est la vraie correction.", juste: true },
        { texte: "Le gain du codeur a dû changer, puisque seul un gain trop élevé rend une boucle instable." },
        { texte: "Il suffit de filtrer davantage la mesure pour supprimer la vibration." },
      ],
      etapes: [
        { texte: "Un retard ne modifie pas le gain : $\\omega_c$ reste à $93{,}7\\ \\mathrm{rad/s}$, mais la phase y perd $\\omega_c T = 1{,}41\\ \\mathrm{rad} = 80{,}6^\\circ$ : marge de $-15{,}9^\\circ$." },
        { texte: "La phase atteint maintenant $-180^\\circ$ à $79{,}5\\ \\mathrm{rad/s}$, soit $12{,}7\\ \\mathrm{Hz}$, où le gain vaut $+1{,}6\\ \\mathrm{dB}$ : l'oscillation croît jusqu'à la limitation de courant, qui la stabilise en cycle limite." },
        { texte: "Avec $15\\ \\mathrm{ms}$, la marge de $45^\\circ$ demande $K_v = 40{,}1\\ \\mathrm{s^{-1}}$ ($\\omega_c = 39{,}6\\ \\mathrm{rad/s}$, marge de gain $6{,}4\\ \\mathrm{dB}$).", note: "Un filtre ajouterait encore du retard de phase et aggraverait l'instabilité. La bonne architecture garde les boucles rapides au plus près de l'actionneur." },
      ],
      visuelCorrection(conteneur, moteur) {
        const T = 0.015;
        bodeCorrection(moteur, conteneur, {
          titre: "Kv = 100 s⁻¹ avec 15 ms de retard",
          fonction: (w) => ({ gain_dB: gainPosition(w, 100), phase_deg: phasePosition(w, T) }),
          fMin: 10,
          fMax: 1000,
          xTitre: "Pulsation",
          xUnite: "rad/s",
          coupure: 79.5,
          libelleCoupure: "ω180 = 79,5 : gain +1,6 dB",
          gainMin: -40,
          gainMax: 30,
          phaseMin: -540,
          phaseMax: -90,
        });
        const res = simulerPosition(100, T, 0.4, 5e-5);
        traceCorrection(moteur, conteneur, {
          titre: "Réponse de la boucle avec 15 ms de retard (modèle linéaire, sans limitation)",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "θ",
          yUnite: "rad",
          xMin: 0,
          xMax: 400,
          yMin: -2,
          yMax: 4,
          series: [{ id: "y", nom: "position θ(t)", points: res.t.map((t, i) => [t * 1000, Math.max(-2, Math.min(4, res.y[i]))]) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 1, "consigne", [9, 5]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-conceptuel",
      titre: "Question conceptuelle : pourquoi faut-il une marge ?",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi une boucle dont le gain vaut $1$ à la pulsation où sa phase vaut $-180^\\circ$ peut osciller sans aucune " +
        "consigne, et pourquoi on ne se contente pas d'une boucle tout juste stable.</p>",
      motsCles: [
        ["-180", "180", "oppos", "inverse", "phase", "signe"],
        ["gain 1", "gain unite", "meme amplitude", "module 1", "0 db", "entretien", "auto"],
        ["incertitude", "variation", "derive", "vieilliss", "temperature", "retard", "marge", "robust"],
        ["amorti", "oscill", "depassement", "resonance"],
      ],
      minimum: 3,
      exemple: "Deux ou trois phrases : signal qui fait le tour, signe du sommateur, gain unité, incertitudes et amortissement.",
      etapes: [
        { texte: "Un signal qui fait le tour revient retourné de $180^\\circ$ ; le signe moins du sommateur le remet en phase : la contre-réaction devient réaction positive." },
        { texte: "Avec un gain de $1$, il revient avec la même amplitude : il s'entretient seul, sans source ; avec un gain supérieur, il croît." },
        { texte: "Le modèle est incertain et le système évolue : gain du capteur, inertie, retards, température. Une boucle tout juste stable deviendrait instable à la première dérive, et elle serait de toute façon très peu amortie.", note: "Les marges sont donc à la fois une garantie de robustesse et une mesure indirecte de l'amortissement." },
      ],
      visuelCorrection: correctionEtapes(
        [
          "tour de boucle : |L| et arg L",
          "arg L = -180° + signe - du sommateur = 360° : réaction positive",
          "|L| = 1 : auto-entretien ; |L| > 1 : divergence",
          "modèle incertain : il faut une distance au point critique",
          "marge faible = pôles proches de l'axe = réponse peu amortie",
        ],
        "Pourquoi la limite de stabilité ne suffit pas."
      ),
    })
  );

  const svgK3 = racine.querySelector("#k3-svg");
  if (svgK3) ressources.push(api.dessiner(svgK3, { duree: 1.2 }));
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

const VISUELS_QUIZ = [
  etapes(["20 log10(2) = 6,02 dB", "+6 dB ≈ amplitude × 2", "+20 dB = × 10 ; +40 dB = × 100"], "Repères de décibels."),
  etapes(["|exp(-jωT)| = 1 à toute pulsation", "gain : 0 dB ; phase : -ωT", "le retard n'agit que sur la phase"], "Retard pur."),
  etapes(["φ = -arctan(ωτ) = -arctan(10)", "= -84,3°", "asymptote : -90° à partir de 10/τ"], "Phase d'un pôle une décade après la cassure."),
  etapes(["pente -40 dB/déc durable à la coupure", "phase voisine de -180° (phase minimale)", "marge de phase faible ou nulle"], "Couper 0 dB avec une pente de -40 dB/déc."),
  etapes(["en ω0 : |H| = 1 / (2ζ)", "ζ = 0,1 : |H| = 5", "20 log10(5) = 13,98 dB"], "Gain d'un second ordre à sa pulsation propre."),
  () => ({ viewBox: "0 0 720 430", dessin: dessinMarges("fl-qv6"), legende: "La marge de phase se lit à la pulsation où le gain coupe 0 dB, entre la phase et la ligne -180°." }),
  etapes(["L = K / (s (1 + τ s)) : phase de -90° à -180°", "-180° n'est jamais atteinte", "marge de gain infinie, marge de phase finie"], "Boucle intégrale du second ordre."),
  etapes(["φ = -360° × f × T", "= -360 × 10 × 0,01", "= -36°"], "Phase d'un retard de 10 ms à 10 Hz."),
  etapes(["Kv × 2 : gain + 6,02 dB partout", "phase inchangée : ω180 fixe", "MG diminue de 6,02 dB exactement"], "Effet d'un doublement du gain."),
  etapes(["Tmax = MP (rad) / ωc", "= (50 × π / 180) / 20 = 0,873 / 20", "= 43,6 ms"], "Retard admissible."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Un gain de $+6\\ \\mathrm{dB}$ correspond à peu près à un rapport d'amplitudes de :</p>",
        options: ["$1{,}41$", "$2$", "$4$", "$6$"],
        bonnes: [1],
        explication: "$20\\log_{10}2 = 6{,}02\\ \\mathrm{dB}$. Un rapport de puissances de $4$ donne aussi $6\\ \\mathrm{dB}$, mais en $10\\log_{10}$.",
        resume: "Décibels",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Un retard pur de transmission diminue le gain d'une boucle aux hautes fréquences.</p>",
        reponse: false,
        explication: "$|e^{-j\\omega T}| = 1$ : le gain est inchangé à toute pulsation. Seule la phase est retardée, de $\\omega T$ radians.",
        resume: "Retard et gain",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Phase, en degrés, de $1/(1 + j\\omega\\tau)$ pour $\\omega = 10/\\tau$ ?</p>",
        valeur: -Math.atan(10) * DEG,
        unite: "°",
        tolerance: 0.01,
        explication: "$-\\arctan 10 = -84{,}3^\\circ$ : l'asymptote de phase donne déjà $-90^\\circ$, à $5{,}7^\\circ$ près.",
        resume: "Phase d'un pôle",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi est-il risqué qu'une boucle ouverte coupe $0\\ \\mathrm{dB}$ avec une pente de $-40\\ \\mathrm{dB}$ par décade ?</p>",
        motsCles: [["phase", "dephasage", "-180", "180"], ["marge", "stabil", "instab", "oscill", "amorti"], ["pente", "-40", "deux poles", "second ordre", "double"]],
        minimum: 2,
        explication: "Pour un système à phase minimale, une pente durable de $-40\\ \\mathrm{dB}$ par décade s'accompagne d'une phase voisine de $-180^\\circ$ : la marge de phase à la coupure est faible, la boucle peu amortie, voire instable.",
        resume: "Pente à la coupure",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Second ordre de gain statique $1$ et d'amortissement $\\zeta = 0{,}1$. Gain exact à la pulsation propre $\\omega_0$, en décibels ?</p>",
        valeur: 20 * Math.log10(5),
        unite: "dB",
        tolerance: 0.01,
        explication: "En $\\omega_0$, $|H| = 1/(2\\zeta) = 5$, soit $13{,}98\\ \\mathrm{dB}$ au-dessus de l'asymptote, qui vaut $0\\ \\mathrm{dB}$ à cet endroit.",
        resume: "Résonance",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Sur ce Bode de boucle ouverte, où lit-on la marge de phase ?</p>",
        consigne: "Cliquez sur la zone correspondante.",
        viewBox: "0 0 720 430",
        dessin: dessinMarges("fl-q6"),
        zones: zonesMarges(0),
        explication: "À la pulsation où le gain coupe $0\\ \\mathrm{dB}$, environ $0{,}78\\ \\mathrm{rad/s}$, on mesure l'écart entre la phase, $-138{,}8^\\circ$, et $-180^\\circ$ : $41{,}2^\\circ$. L'écart du gain sous $0\\ \\mathrm{dB}$ à la pulsation de phase $-180^\\circ$ est la marge de gain.",
        resume: "Lecture des marges",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>La boucle ouverte $L(s) = K/\\bigl(s(1 + \\tau s)\\bigr)$, avec $K &gt; 0$, a une marge de gain :</p>",
        options: ["nulle", "de $6\\ \\mathrm{dB}$", "infinie", "qui dépend de $\\tau$ seulement"],
        bonnes: [2],
        explication: "La phase va de $-90^\\circ$ à $-180^\\circ$ sans jamais l'atteindre : pas de $\\omega_{180}$, marge de gain infinie. La marge de phase, elle, diminue quand $K$ augmente. Un retard, toujours présent en pratique, rend la marge de gain finie.",
        resume: "Marge de gain infinie",
      },
      {
        type: "calcul",
        enonce: repere(7) + "<p>Un cycle d'automate introduit un retard de $10\\ \\mathrm{ms}$. Quelle phase, en degrés, ajoute-t-il à $10\\ \\mathrm{Hz}$ ?</p>",
        valeur: -36,
        unite: "°",
        tolerance: 0.01,
        explication: "$\\varphi = -360^\\circ \\times f \\times T = -360 \\times 10 \\times 0{,}01 = -36^\\circ$.",
        resume: "Phase d'un retard",
      },
      {
        type: "vraiFaux",
        enonce: repere(8) + "<p>Doubler le gain d'une boucle diminue sa marge de gain d'environ $6\\ \\mathrm{dB}$, mais ne déplace pas la pulsation $\\omega_{180}$.</p>",
        reponse: true,
        explication: "Un gain multiplie $|L|$ par $2$, soit $+6{,}02\\ \\mathrm{dB}$ partout, et laisse la phase intacte : $\\omega_{180}$ ne bouge pas et la marge de gain perd exactement $6{,}02\\ \\mathrm{dB}$.",
        resume: "Gain et marges",
      },
      {
        type: "calcul",
        enonce: repere(9) + "<p>Une boucle a $50^\\circ$ de marge de phase à $\\omega_c = 20\\ \\mathrm{rad/s}$. Quel retard supplémentaire, en millisecondes, la rendrait juste instable ?</p>",
        valeur: ((50 * Math.PI) / 180 / 20) * 1000,
        unite: "ms",
        tolerance: 0.01,
        explication: "$T = M_\\varphi/\\omega_c = 0{,}873/20 = 43{,}6\\ \\mathrm{ms}$ : le retard ne change pas $\\omega_c$, il retire $\\omega_c T$ de phase.",
        resume: "Retard admissible",
      },
    ],
    { titre: "Quiz : dix questions mélangées" }
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
      { categorie: "Réponse harmonique", question: "Que fait un système linéaire stable à une sinusoïde ?", reponse: "En régime établi, il la multiplie par $|H(j\\omega)|$ et la déphase de $\\arg H(j\\omega)$, sans créer d'autre fréquence." },
      { categorie: "Décibels", question: "Pourquoi $20\\log_{10}$ et non $10\\log_{10}$ ?", reponse: "Le décibel est défini sur un rapport de puissances ; la puissance varie comme le carré de l'amplitude, d'où $10\\log_{10}A^2 = 20\\log_{10}A$." },
      { categorie: "Pôle réel", question: "Que valent gain et phase de $1/(1 + j\\omega/\\omega_p)$ à la cassure et une décade après ?", reponse: "$-3{,}01\\ \\mathrm{dB}$ et $-45^\\circ$ en $\\omega_p$ ; $-20{,}04\\ \\mathrm{dB}$ et $-84{,}3^\\circ$ en $10\\,\\omega_p$." },
      { categorie: "Intégrateur", question: "Bode de $K/s$ ?", reponse: "Droite de $-20\\ \\mathrm{dB}$ par décade, qui coupe $0\\ \\mathrm{dB}$ à $\\omega = K$ ; phase constante $-90^\\circ$." },
      { categorie: "Second ordre", question: "Quand y a-t-il résonance, et de combien ?", reponse: "Si $\\zeta &lt; 0{,}707$ : $M_r = 1/(2\\zeta\\sqrt{1 - \\zeta^2})$ en $\\omega_0\\sqrt{1 - 2\\zeta^2}$ ; en $\\omega_0$, $|H| = 1/(2\\zeta)$." },
      { categorie: "Construction", question: "Comment construire un Bode asymptotique ?", reponse: "Forme canonique, asymptote de départ $K/\\omega^n$, puis changement de pente à chaque cassure par ordre croissant : $-20$ par pôle, $+20$ par zéro, $-40$ par paire de pôles." },
      { categorie: "Marge de phase", question: "Où et comment lit-on la marge de phase ?", reponse: "À $\\omega_c$, où $|L| = 1$ : $M_\\varphi = 180^\\circ + \\arg L(j\\omega_c)$." },
      { categorie: "Marge de gain", question: "Où et comment lit-on la marge de gain ?", reponse: "À $\\omega_{180}$, où $\\arg L = -180^\\circ$ : $M_G = -20\\log_{10}|L(j\\omega_{180})|$ ; infinie si la phase n'atteint jamais $-180^\\circ$." },
      { categorie: "Retard", question: "Quel est l'effet d'un retard $T$ sur une boucle ?", reponse: "Gain inchangé, phase $-\\omega T$ ; il rend la boucle instable s'il dépasse $M_\\varphi/\\omega_c$, marge de phase en radians." },
      { categorie: "Correspondances", question: "Comment relier marge de phase et amortissement ?", reponse: "$\\zeta \\approx M_\\varphi/100$ pour une boucle dominée par un intégrateur et un pôle ; règle fausse pour une boucle sans intégrateur. Viser $45$ à $60^\\circ$ et au moins $6\\ \\mathrm{dB}$." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["1/s : -20 dB/déc dès le départ", "pôle en 10 rad/s : -20 dB/déc de plus", "au-delà de 10 rad/s : -40 dB/déc"], "Pente finale d'une boucle intégrale à un pôle."),
  etapes(["MP = 180° + arg L(jωc)", "= 180 - 135", "= 45°"], "Marge de phase."),
  etapes(["gain K : translation verticale du gain", "phase indépendante de K", "ω180 inchangée"], "ω180 ne dépend pas d'un gain pur."),
  etapes(["D = exp(-π ζ / √(1 - ζ²))", "= exp(-π × 0,5 / 0,866) = exp(-1,814)", "= 16,3 %"], "Dépassement pour ζ = 0,5."),
  etapes(["classe 0 : εs = 1 / (1 + Kb)", "= 1 / (1 + 2,832)", "= 26,1 %"], "Erreur statique de la boucle de vitesse."),
  etapes(["W = C (Vmax² - V0²) / 2", "= 2,2e-3 × (800² - 540²) / 2", "= 383 J"], "Réserve d'énergie du bus continu."),
  etapes(["R = e / (μ0 S) = 1e-3 / (4π e-7 × 1e-3)", "= 7,96 × 10⁵ A/Wb", "L = N² / R = 10⁴ / 7,96e5 = 12,57 mH"], "Inductance d'un circuit à entrefer."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Cette séance. Quelle est la pente asymptotique du gain de $L(s) = \\dfrac{K}{s(1 + s/10)}$ au-delà de $10\\ \\mathrm{rad/s}$ ?</p>",
        options: ["$-20\\ \\mathrm{dB}$ par décade", "$-40\\ \\mathrm{dB}$ par décade", "$-60\\ \\mathrm{dB}$ par décade", "$0$"],
        bonnes: [1],
        explication: "L'intégrateur donne $-20\\ \\mathrm{dB}$ par décade dès le départ, le pôle en ajoute $-20$ au-delà de sa cassure.",
        resume: "Pentes",
      },
      {
        type: "calcul",
        enonce: repere(1) + "<p>Cette séance. À la coupure $\\omega_c$ d'une boucle ouverte, $\\arg L(j\\omega_c) = -135^\\circ$. Marge de phase, en degrés ?</p>",
        valeur: 45,
        unite: "°",
        tolerance: 0.01,
        explication: "$M_\\varphi = 180 - 135 = 45^\\circ$, la valeur basse de la fourchette usuelle.",
        resume: "Marge de phase",
      },
      {
        type: "vraiFaux",
        enonce: repere(2) + "<p>Cette séance. Multiplier le gain d'un correcteur proportionnel ne change pas la pulsation $\\omega_{180}$ de la boucle ouverte.</p>",
        reponse: true,
        explication: "Un gain pur décale verticalement la courbe de gain sans toucher à la phase : $\\omega_{180}$ est fixe, $\\omega_c$ se déplace.",
        resume: "ω180 et gain",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours précédent. Dépassement indiciel, en pour cent, d'un second ordre sans zéro d'amortissement $\\zeta = 0{,}5$ ?</p>",
        valeur: 100 * Math.exp((-Math.PI * 0.5) / Math.sqrt(0.75)),
        unite: "%",
        tolerance: 0.02,
        explication: "$D = e^{-\\pi\\zeta/\\sqrt{1 - \\zeta^2}} = 16{,}3\\ \\%$ ; en fréquentiel, la même paire de pôles résonne de $+1{,}25\\ \\mathrm{dB}$.",
        resume: "Dépassement",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Cours précédent. La boucle de vitesse de l'actionneur, de classe 0, a un gain de boucle $K_b = 2{,}832$. Erreur statique pour un échelon, en pour cent ?</p>",
        valeur: 100 / (1 + 2.832),
        unite: "%",
        tolerance: 0.02,
        explication: "$1/(1 + 2{,}832) = 26{,}1\\ \\%$ : c'est aussi le gain $0{,}739$ de la boucle fermée à basse pulsation sur son Bode.",
        resume: "Erreur statique",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours vieux d'une semaine. Bus continu de $2{,}2\\ \\mathrm{mF}$ à $540\\ \\mathrm{V}$, seuil de surtension à $800\\ \\mathrm{V}$. Énergie de freinage absorbable sans hacheur, en joules ?</p>",
        valeur: 0.5 * 2.2e-3 * (800 * 800 - 540 * 540),
        unite: "J",
        tolerance: 0.02,
        explication: "$W = C(V_{max}^2 - V_0^2)/2 = 1{,}1 \\times 10^{-3} \\times 348\\,400 = 383\\ \\mathrm{J}$, très peu devant l'énergie cinétique d'une pompe.",
        resume: "Réserve du bus",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours vieux d'un mois. Circuit magnétique dont le fer est supposé parfait, entrefer $e = 1\\ \\mathrm{mm}$, section $S = 10\\ \\mathrm{cm^2}$, $N = 100$ spires. Inductance, en millihenrys ?</p>",
        valeur: (100 * 100 * 4e-7 * Math.PI * 10e-4) / 1e-3 * 1000,
        unite: "mH",
        tolerance: 0.02,
        explication: "$\\mathcal{R} = e/(\\mu_0 S) = 7{,}96 \\times 10^5\\ \\mathrm{A/Wb}$, $L = N^2/\\mathcal{R} = 12{,}57\\ \\mathrm{mH}$.",
        resume: "Inductance à entrefer",
      },
    ],
    { titre: "Révision espacée : sept questions" }
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
    titre: "Où en suis-je sur les diagrammes de Bode ?",
  });
  if (auto) ressources.push(auto);
}
