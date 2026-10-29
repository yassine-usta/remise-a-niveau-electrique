/* ==========================================================================
   cours/demarrage-des-moteurs-asynchrones/cours.js
   Démarrage des moteurs asynchrones : démarrage direct pas à pas,
   commutation étoile-triangle à transition ouverte, gradateur à thyristors,
   comparaison des modes de démarrage sur quatre machines, et démarrage du
   compresseur du site sur le transformateur ou sur le groupe électrogène.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];
let compteurMarqueurs = 0;

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;

/* --------------------------------------------------------------------------
   Nombres complexes
   -------------------------------------------------------------------------- */

const cx = (re, im = 0) => ({ re, im });
const cAdd = (a, b) => cx(a.re + b.re, a.im + b.im);
const cSub = (a, b) => cx(a.re - b.re, a.im - b.im);
const cMul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cMod = (a) => Math.hypot(a.re, a.im);
const cScal = (a, k) => cx(a.re * k, a.im * k);
function cInv(a) {
  const m = a.re * a.re + a.im * a.im;
  return m > 0 ? cx(a.re / m, -a.im / m) : cx(Infinity, 0);
}
const cDiv = (a, b) => cMul(a, cInv(b));
const polaire = (module, degres) => cx(module * Math.cos(degres * DEG), module * Math.sin(degres * DEG));

function dichotomie(fonction, bas, haut, iterations = 80) {
  let fb = fonction(bas);
  for (let i = 0; i < iterations; i += 1) {
    const milieu = (bas + haut) / 2;
    const fm = fonction(milieu);
    if (fm > 0 === fb > 0) {
      bas = milieu;
      fb = fm;
    } else {
      haut = milieu;
    }
  }
  return (bas + haut) / 2;
}

/* --------------------------------------------------------------------------
   Modèle de catalogue d'un moteur asynchrone

   Couple : Kloss à glissement critique variable, gamma(g) = g0 (1 + kappa g²),
   ajusté sur C_n au glissement nominal, C_d à l'arrêt et C_max.
   Courant : courant magnétisant réactif plus courant rotorique dont le module
   et la phase sont ajustés sur I_n, cos phi_n, I_d et cos phi_d.
   -------------------------------------------------------------------------- */

function moteur(d) {
  const M = { ...d };
  M.Ws = (TAU * d.ns) / 60;
  M.Wn = (TAU * d.nn) / 60;
  M.Cn = d.Pn / M.Wn;
  M.gn = (d.ns - d.nn) / d.ns;
  M.V1 = d.U / Math.sqrt(3);
  M.Cmax = d.kMax * M.Cn;
  M.Id = d.kI * d.In;

  const rn = (2 * M.Cmax) / M.Cn;
  const yN = (M.gn * (rn + Math.sqrt(rn * rn - 4))) / 2;
  const r1 = (2 * M.Cmax) / (d.kD * M.Cn);
  const y1 = (r1 - Math.sqrt(r1 * r1 - 4)) / 2;
  const kappa = (y1 - yN) / (yN - y1 * M.gn * M.gn);
  M.y0 = yN / (1 + kappa * M.gn * M.gn);
  M.kappa = kappa;
  M.gamma = (g) => M.y0 * (1 + M.kappa * g * g);

  let beta = 1;
  let beta1 = 1;
  const forme = (g, K0, c) => {
    const s = g / M.gamma(g);
    const Ir = (K0 * (1 + c * g * g) * s) / Math.sqrt(1 + s * s);
    const t = (beta + (beta1 - beta) * g) * s;
    const ct = 1 / Math.sqrt(1 + t * t);
    return cx(Ir * ct, -d.I0 - Ir * t * ct);
  };
  let c = 0;
  let K = dichotomie((KK) => cMod(forme(M.gn, KK, 0)) - d.In, 1, 50 * d.In);
  for (let i = 0; i < 40; i += 1) {
    beta = dichotomie((b) => {
      beta = b;
      const I = forme(M.gn, K, c);
      return I.re / cMod(I) - d.cosn;
    }, 0.05, 3);
    beta1 = dichotomie((b) => {
      beta1 = b;
      const I = forme(1, K, c);
      return d.cosd - I.re / cMod(I);
    }, 0.05, 6);
    c = dichotomie((cc) => cMod(forme(1, K, cc)) - M.Id, -0.9, 20);
    K = dichotomie((KK) => cMod(forme(M.gn, KK, c)) - d.In, 1, 50 * d.In);
  }
  M.courant = (g) => forme(Math.max(g, 1e-9), K, c);
  M.couple = (g) => {
    if (g <= 0) return 0;
    const y = M.gamma(g);
    return (2 * M.Cmax) / (g / y + y / g);
  };
  M.Z = (g) => cDiv(cx(M.V1, 0), M.courant(g));
  return M;
}

/** Moteurs étudiés : compresseur du site, pompe de la section H, convoyeur et ventilateur de la section I. */
const MOTEURS = {
  compresseur: moteur({ Pn: 18500, U: 400, In: 33.6, I0: 13.8, ns: 1500, nn: 1470, kI: 7.5, kD: 2.3, kMax: 2.9, cosn: 0.86, cosd: 0.4 }),
  pompe: moteur({ Pn: 45000, U: 400, In: 80, I0: 26, ns: 1500, nn: 1480, kI: 7.2, kD: 2.5, kMax: 2.9, cosn: 0.86, cosd: 0.35 }),
  convoyeur: moteur({ Pn: 15000, U: 400, In: 28.5, I0: 11, ns: 1500, nn: 1465, kI: 7.4, kD: 2.4, kMax: 2.9, cosn: 0.84, cosd: 0.42 }),
  ventilateur: moteur({ Pn: 90000, U: 400, In: 160, I0: 50, ns: 1500, nn: 1485, kI: 7.0, kD: 2.2, kMax: 2.8, cosn: 0.87, cosd: 0.33 }),
};
const MC = MOTEURS.compresseur;

/** Machines entraînées : couple résistant en N·m en fonction de la vitesse en tr/min. */
const MACHINES = [
  {
    id: "compresseur",
    nom: "compresseur à vis à vide, 18,5 kW",
    M: MC,
    J: 0.45,
    Scc: 2,
    charge: (n) => 0.25 * MC.Cn * (0.3 + 0.7 * Math.pow(n / MC.nn, 2)),
  },
  {
    id: "pompe",
    nom: "pompe centrifuge en charge, 45 kW",
    M: MOTEURS.pompe,
    J: 0.9,
    Scc: 3,
    charge: (n) => MOTEURS.pompe.Cn * (0.1 + 0.8 * Math.pow(n / MOTEURS.pompe.nn, 2)),
  },
  {
    id: "convoyeur",
    nom: "convoyeur chargé, 15 kW",
    M: MOTEURS.convoyeur,
    J: 0.35,
    Scc: 5,
    charge: (n) => MOTEURS.convoyeur.Cn * (n < 30 ? 1.2 - (0.3 * n) / 30 : 0.9),
  },
  {
    id: "ventilateur",
    nom: "ventilateur à forte inertie, 90 kW",
    M: MOTEURS.ventilateur,
    J: 25,
    Scc: 6,
    charge: (n) => MOTEURS.ventilateur.Cn * (0.05 + 0.85 * Math.pow(n / MOTEURS.ventilateur.nn, 2)),
  },
];

/** Puissances de court-circuit proposées, en MVA ; Infinity désigne un réseau parfait. */
const LISTE_SCC = [0.5, 1, 1.5, 2.5, 5, 10, 16.7, 25, Infinity];
const ANGLE_RESEAU = 50;

function impedanceReseau(Scc, U = 400) {
  if (!Number.isFinite(Scc)) return cx(0, 0);
  return polaire((U * U) / (Scc * 1e6), ANGLE_RESEAU);
}

/**
 * État électrique et couple à un glissement donné.
 * mode : "direct", "triangle", "etoile", "auto" (opts.k), "progressif" (opts.Ilim).
 * Zr : impédance de la source au moteur ; opts.Zamont : impédance de la source au jeu de barres.
 */
function etat(M, mode, g, Zr, opts = {}) {
  const V0 = M.V1;
  const Zd = M.Z(g);
  const Zamont = opts.Zamont || Zr;
  if (mode !== "progressif") {
    let Zvue = Zd;
    if (mode === "etoile") Zvue = cScal(Zd, 3);
    else if (mode === "auto") Zvue = cScal(Zd, 1 / (opts.k * opts.k));
    const I = cDiv(cx(V0, 0), cAdd(Zvue, Zr));
    const ub = cMod(cMul(I, Zvue)) / M.V1;
    const um = mode === "etoile" ? ub / Math.sqrt(3) : mode === "auto" ? ub * opts.k : ub;
    return { I: cMod(I), Iph: I, C: M.couple(g) * um * um, um, Vjdb: cMod(cSub(cx(V0, 0), cMul(I, Zamont))) / M.V1 };
  }
  const Iplein = cDiv(cx(V0, 0), cAdd(Zd, Zr));
  let I = Iplein;
  if (cMod(Iplein) > opts.Ilim) I = cScal(Iplein, opts.Ilim / cMod(Iplein));
  const um = (cMod(I) * cMod(Zd)) / M.V1;
  return { I: cMod(I), Iph: I, C: M.couple(g) * um * um, um, Vjdb: cMod(cSub(cx(V0, 0), cMul(I, Zamont))) / M.V1 };
}

/**
 * Démarrage intégré dans le temps (Euler explicite).
 * Commutation étoile-triangle ou autotransformateur : à l'équilibre de la première étape.
 * opts.tempsMort (s) : transition ouverte de l'étoile-triangle, pointe de reconnexion modélisée.
 */
function demarrer(M, mode, charge, J, Zr, opts = {}) {
  const dt = opts.dt || Math.max(0.0005, (J * M.Ws) / (M.Cn * 1200));
  const tMax = opts.tMax || 90;
  const trace = [];
  let W = 0;
  let t = 0;
  let Wr = 0;
  let I2t = 0;
  let phase = mode;
  let Imax = 0;
  let VjdbMin = 9;
  let nT = null;
  let Ipic = null;
  let t95 = null;
  let tCommut = null;
  let calage = false;
  let pas = 0;
  const finale = mode === "etoile" ? "triangle" : mode === "auto" ? "direct" : mode;

  while (t < tMax) {
    const n = (W * 60) / TAU;
    const g = 1 - n / M.ns;
    const Cr = charge(n);

    /* Transition ouverte : moteur déconnecté pendant le temps mort. */
    if (tCommut !== null && t < tCommut + (opts.tempsMort || 0)) {
      trace.push({ t, n, I: 0, C: 0, Cr, Vjdb: 1, phase: "ouvert" });
      W = Math.max(0, W - (Cr / J) * dt);
      t += dt;
      continue;
    }

    let e = etat(M, phase, g, Zr, opts);
    const acc = (e.C - Cr) / J;
    if ((phase === "etoile" || phase === "auto") && ((acc <= 1e-3 * (M.Cn / J) && t > 0.05) || n > 0.995 * M.ns)) {
      phase = finale;
      nT = n;
      tCommut = mode === "etoile" ? t : null;
      if (tCommut !== null && (opts.tempsMort || 0) > 0) continue;
      e = etat(M, phase, g, Zr, opts);
      Ipic = e.I;
      continue;
    }

    /* Pointe de reconnexion après le temps mort, amortie en quelques périodes. */
    let I = e.I;
    if (tCommut !== null && opts.tempsMort > 0) {
      const ecoule = t - tCommut - opts.tempsMort;
      if (Ipic === null) {
        const r = pointeReconnexion(opts.tempsMort, opts.ordre || -30, charge(nT), J, M, nT / M.ns);
        Ipic = Math.max(e.I, r * M.Id);
        opts.pointe = Ipic;
      }
      I = e.I + (Ipic - e.I) * Math.exp(-ecoule / 0.03);
    }
    const Vjdb = I === e.I ? e.Vjdb : cMod(cSub(cx(M.V1, 0), cMul(cScal(e.Iph, I / e.I), opts.Zamont || Zr))) / M.V1;

    if (t95 === null && n >= 0.95 * M.ns) t95 = t;
    if (I > Imax) Imax = I;
    if (Vjdb < VjdbMin) VjdbMin = Vjdb;
    if (pas % (opts.decimation || 1) === 0) trace.push({ t, n, I, C: e.C, Cr, Vjdb, phase });
    pas += 1;

    if (acc <= 0 && n < 0.5 * M.ns && phase === finale && t > 0.2) {
      calage = true;
      break;
    }
    Wr += e.C * M.Ws * g * dt;
    I2t += I * I * dt;
    W = Math.max(0, W + acc * dt);
    t += dt;
    if (phase === finale && Math.abs(acc) < 0.02 * (M.Cn / J) && g < 0.15 && e.I < 1.3 * M.In) break;
  }
  const dernier = trace[trace.length - 1] || { n: 0, I: 0 };
  return { calage, t, t95, trace, Imax, VjdbMin, Wr, nT, Ipic, nFin: dernier.n, IFin: dernier.I, Ieff: t > 0 ? Math.sqrt(I2t / t) : 0 };
}

/* --------------------------------------------------------------------------
   Reconnexion étoile-triangle : modèle simplifié de la section E
   -------------------------------------------------------------------------- */

const TAU_R = (16.2 + 0.53) / (TAU * 50 * 0.148);
const E0_TRANSITION = 0.56;

/** Pointe rapportée à I_d pour un temps mort tm (s), un décalage dc (degrés) et un couple résistant Cr. */
function pointeReconnexion(tm, dc, Cr, J, M = MC, x0 = 1477 / 1500) {
  const g0 = 1 - x0;
  const a = Cr / (J * M.Ws);
  const retard = TAU * 50 * (g0 * tm + (a * tm * tm) / 2);
  const e = E0_TRANSITION * Math.exp(-tm / TAU_R);
  return cMod(cSub(polaire(1, dc), polaire(e, -retard / DEG)));
}

function transition(tm, dc, Cr) {
  const g0 = 1 - 1477 / 1500;
  const a = Cr / (0.45 * MC.Ws);
  const retard = (TAU * 50 * (g0 * tm + (a * tm * tm) / 2)) / DEG;
  const e = E0_TRANSITION * Math.exp(-tm / TAU_R);
  const r = cMod(cSub(polaire(1, dc), polaire(e, -retard)));
  return { retard, e, r };
}

/* --------------------------------------------------------------------------
   Gradateur monophasé équivalent sur charge R-L
   -------------------------------------------------------------------------- */

const PHI_D = Math.acos(0.4);

/** Courant rapporté à V_max/Z pour un angle d'amorçage alpha (rad) ; renvoie la fonction et l'extinction. */
function gradateur(alpha, phi = PHI_D) {
  if (alpha <= phi) {
    return { continu: true, beta: alpha + Math.PI, i: (th) => Math.sin(th - phi) };
  }
  const tp = Math.tan(phi);
  const k = Math.sin(alpha - phi);
  const f = (th) => Math.sin(th - phi) - k * Math.exp(-(th - alpha) / tp);
  let th = alpha + 1e-4;
  while (th < alpha + Math.PI && f(th) > 0) th += 0.002;
  const beta = dichotomie((x) => f(x), th - 0.002, th, 40);
  return { continu: false, beta, i: f };
}

/** Courant instantané sur une période pour l'angle alpha, theta dans [0, 2 pi). */
function courantGradateur(G, alpha, theta) {
  if (G.continu) return Math.sin(theta - PHI_D);
  for (const t2 of [theta, theta + TAU, theta - TAU]) {
    if (t2 >= alpha && t2 <= G.beta) return G.i(t2);
    if (t2 >= alpha + Math.PI && t2 <= G.beta + Math.PI) return -G.i(t2 - Math.PI);
  }
  return 0;
}

function mesuresGradateur(alpha) {
  const G = gradateur(alpha);
  const N = 1440;
  let s1 = 0;
  let c1 = 0;
  let carre = 0;
  for (let k = 0; k < N; k += 1) {
    const th = (TAU * k) / N;
    const i = courantGradateur(G, alpha, th);
    s1 += i * Math.sin(th);
    c1 += i * Math.cos(th);
    carre += i * i;
  }
  const I1 = Math.hypot((2 * s1) / N, (2 * c1) / N);
  const Ieff = Math.sqrt((2 * carre) / N);
  return {
    G,
    I1,
    Ieff,
    conduction: G.continu ? 180 : (G.beta - alpha) / DEG,
    thd: I1 > 1e-6 ? (Math.sqrt(Math.max(0, Ieff * Ieff - I1 * I1)) / I1) * 100 : NaN,
  };
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

function nouveauMarqueur(prefixe) {
  compteurMarqueurs += 1;
  return prefixe + "-" + compteurMarqueurs;
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
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
    const aGauche = px > repere.boite.x + repere.boite.l * 0.7;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

function ligneH(c, repere, couleurs, y, libelle, tirets = [7, 5]) {
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
    c.fillText(libelle, repere.boite.x + repere.boite.l - 4, py - 6);
  }
  c.restore();
}

function pointTrace(c, repere, couleurs, x, y, libelle, creux) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  if (px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.fillStyle = couleurs.texte;
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.6;
  c.beginPath();
  c.arc(px, py, 4.5, 0, TAU);
  if (creux) c.stroke();
  else c.fill();
  if (libelle) {
    c.font = POLICE;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.62;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -8 : 8), py - 8);
  }
  c.restore();
}

function traceCorrection(moteurApi, conteneur, options) {
  const traceur = moteurApi.sim.traceur(conteneur, {
    genre: "Correction visuelle",
    ratio: 0.42,
    echantillons: 300,
    ...options,
  });
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

/** Lignes de texte révélées une à une, dans un cadre. */
function dessinEtapes(lignes, largeur = 560) {
  const hauteur = 30 + lignes.length * 22;
  return (
    TRAITS + ' stroke-width="1.4"><rect x="6" y="6" width="' + (largeur - 12) + '" height="' + (hauteur - 12) + '" rx="8"/></g>' +
    ECRITS + lignes.map((ligne, i) => texte(22, 32 + i * 22, ligne)).join("") + "</g>"
  );
}

function hauteurEtapes(n) {
  return 30 + n * 22;
}

/** Barres horizontales annotées, pour comparer des courants ou des couples dans une correction. */
function dessinBarres(lignes, maximum, unite, largeur = 560) {
  const x0 = 200;
  const l = largeur - x0 - 90;
  let d = TRAITS + ' stroke-width="1.4"><path d="M' + x0 + " 14V" + (24 + lignes.length * 30) + '"/></g>';
  d += '<g stroke="currentColor" stroke-width="1.4">';
  lignes.forEach(([, valeur, plein], i) => {
    const w = Math.max(1, (valeur / maximum) * l);
    d += '<rect x="' + x0 + '" y="' + (20 + i * 30) + '" width="' + w.toFixed(1) + '" height="18" rx="2" fill="currentColor" fill-opacity="' + (plein ? 0.45 : 0.12) + '"/>';
  });
  d += "</g>" + ECRITS;
  lignes.forEach(([nom, valeur], i) => {
    d += texte(12, 33 + i * 30, nom) + texte(x0 + Math.max(1, (valeur / maximum) * l) + 8, 33 + i * 30, String(valeur).replace(".", ",") + " " + unite);
  });
  return d + "</g>";
}

function hauteurBarres(n) {
  return 34 + n * 30;
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
  construireAnimDirect(racine, api);
  construireAnimTransition(racine, api);
  construireAnimGradateur(racine, api);
  construireComparateur(racine, api);
  construireSimCompresseur(racine, api);
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
    ["#d-reseau-figure svg", 1.5],
    ["#e-direct-figure svg", 1.3],
    ["#e-etoile-figure svg", 1.7],
    ["#e-auto-figure svg", 1.5],
    ["#e-progressif-figure svg", 1.5],
    ["#f-schema-principal svg", 1.8],
    ["#h-figure svg", 1.6],
    ["#i-compresseur-figure svg", 1.7],
  ];
  for (const [selecteur, duree] of schemas) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree }));
  }
}

/* --------------------------------------------------------------------------
   Corrections visuelles des questions de quiz

   Le quiz du moteur affiche une explication textuelle ; chaque question porte
   ici un repère caché, et un observateur ajoute sous l'explication un schéma
   tracé pas à pas dès que la réponse est validée.
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
   Synchronisation d'une poignée, d'un curseur et d'un lecteur
   -------------------------------------------------------------------------- */

function synchroniseur(dessiner, options = {}) {
  const etatSync = { poignee: null, curseurs: null, lecteur: null, idCurseur: options.idCurseur, verrou: false };
  const versLecteur = options.versLecteur || ((v) => v);
  etatSync.appliquer = (valeur, source) => {
    if (etatSync.verrou) return;
    etatSync.verrou = true;
    dessiner(valeur);
    if (source !== "poignee" && etatSync.poignee) etatSync.poignee.set(valeur, false);
    if (source !== "curseur" && etatSync.curseurs) etatSync.curseurs.definir(etatSync.idCurseur, valeur);
    if (source !== "lecteur" && etatSync.lecteur) etatSync.lecteur.suivre(versLecteur(valeur));
    etatSync.verrou = false;
  };
  return etatSync;
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-couplage",
      titre: "Même impédance, deux couplages",
      niveau: "prérequis",
      enonce:
        "<p>Trois impédances identiques de $12\\ \\mathrm{\\Omega}$ sont raccordées à un réseau $230/400\\ \\mathrm{V}$. Couplées en triangle, elles " +
        "prennent un courant de ligne $I_{L\\Delta}$ ; couplées en étoile, $I_{LY}$. Que vaut le rapport $I_{L\\Delta}/I_{LY}$ ?</p>",
      valeur: 3,
      unite: "",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Rapport $I_{L\\Delta}/I_{LY}$",
      etapes: [
        { texte: "Étoile : chaque impédance reçoit $230{,}9\\ \\mathrm{V}$, $I_{LY} = 230{,}9/12 = 19{,}25\\ \\mathrm{A}$." },
        { texte: "Triangle : chaque impédance reçoit $400\\ \\mathrm{V}$, courant de branche $400/12 = 33{,}33\\ \\mathrm{A}$, courant de ligne $\\sqrt{3}$ fois plus, $57{,}74\\ \\mathrm{A}$." },
        { texte: "Rapport : $57{,}74/19{,}25 = 3{,}00$.", note: "Le facteur $3$ vient de $\\sqrt{3}$ sur la tension et de $\\sqrt{3}$ entre courant de branche et courant de ligne : c'est le facteur du démarrage étoile-triangle." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurBarres(2),
          dessinBarres([["étoile", 19.25, false], ["triangle", 57.74, true]], 60, "A", 560),
          "Courants de ligne comparés : le triangle prend trois fois le courant de l'étoile."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-couple-tension",
      titre: "Couple sous tension réduite",
      niveau: "prérequis",
      enonce:
        "<p>À l'arrêt, sous tension nominale, un moteur développe $C_d = 2{,}2\\ C_n$. On l'alimente sous $70\\ \\%$ de sa tension nominale, sans " +
        "changer la fréquence. Quel couple de démarrage obtient-on, en multiples de $C_n$ ?</p>",
      valeur: 2.2 * 0.49,
      unite: "C_n",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Couple $C$",
      etapes: [
        { texte: "À glissement fixé, le schéma équivalent est linéaire : $I_2' \\propto V$, donc $C = 3R_2'I_2'^2/(g\\varOmega_s) \\propto V^2$." },
        { texte: "$C = 0{,}7^2 \\times 2{,}2\\ C_n = 0{,}49 \\times 2{,}2 = 1{,}078\\ C_n$." },
        { texte: "Le courant, lui, ne baisse que de $30\\ \\%$ : $0{,}7\\ I_d$.", note: "Réduire la tension réduit le couple plus vite que le courant : c'est le cœur du problème de démarrage." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Courant et couple relatifs en fonction de la tension appliquée",
          xTitre: "tension relative u",
          yTitre: "rapport au démarrage direct",
          xMin: 0,
          xMax: 1,
          yMin: 0,
          yMax: 1.05,
          series: [
            { id: "i", nom: "courant I/I_d = u", couleur: "serie-1", epaisseur: 2.4, fonction: (u) => u },
            { id: "c", nom: "couple C/C_d = u²", couleur: "serie-3", epaisseur: 2.4, fonction: (u) => u * u },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 0.7, "u = 0,7");
            pointTrace(c, repere, couleurs, 0.7, 0.49, "0,49");
            pointTrace(c, repere, couleurs, 0.7, 0.7, "0,7");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-autotransfo",
      titre: "Courant d'entrée d'un autotransformateur",
      niveau: "prérequis",
      enonce:
        "<p>Un autotransformateur idéal de rapport $k = U_2/U_1 = 0{,}6$ alimente une charge qui absorbe $150\\ \\mathrm{A}$. Quel courant prend-il " +
        "au réseau ?</p>",
      valeur: 90,
      unite: "A",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Courant d'entrée $I_1$",
      etapes: [
        { texte: "Idéal : la puissance apparente se conserve, $U_1I_1 = U_2I_2$." },
        { texte: "$I_1 = (U_2/U_1)\\,I_2 = 0{,}6 \\times 150 = 90\\ \\mathrm{A}$." },
        { texte: "Si la charge est un moteur à l'arrêt, son courant vaut lui-même $0{,}6\\ I_d$ : le réseau ne fournit que $0{,}6^2 = 0{,}36$ fois $I_d$.", note: "Cette double réduction fait l'efficacité du démarrage par autotransformateur." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurEtapes(3),
          dessinEtapes(["U1 I1 = U2 I2 (transformateur idéal)", "I1 = k I2 = 0,6 × 150 = 90 A", "moteur : I2 = k I_d, donc I1 = k² I_d = 0,36 I_d"], 560),
          "Étapes révélées une à une : conservation de la puissance apparente, courant d'entrée, application au moteur."
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : un démarrage direct pas à pas
   -------------------------------------------------------------------------- */

const ZT_POSTE = cx(0.02926, 0.06149);
const Z_CABLE = cx(0.0563, 0.0024);
const ZG_GROUPE = cx(0.032, 0.3184);
const CHARGE_COMPRESSEUR = MACHINES[0].charge;

function construireAnimDirect(racine, api) {
  const conteneur = racine.querySelector("#d-direct");
  if (!conteneur) return;

  const essai = demarrer(MC, "direct", CHARGE_COMPRESSEUR, 0.45, cAdd(ZT_POSTE, Z_CABLE), { Zamont: ZT_POSTE, dt: 0.0005, tMax: 1 });
  const traj = essai.trace;
  const T_MAX = 0.45;
  const dernier = traj[traj.length - 1];
  const echantillon = (t) => {
    if (t >= dernier.t) return dernier;
    let bas = 0;
    let haut = traj.length - 1;
    while (haut - bas > 1) {
      const m = (bas + haut) >> 1;
      if (traj[m].t <= t) bas = m;
      else haut = m;
    }
    const a = traj[bas];
    const b = traj[haut];
    const f = (t - a.t) / Math.max(1e-9, b.t - a.t);
    const mix = {};
    for (const cle of ["t", "n", "I", "C", "Cr", "Vjdb"]) mix[cle] = a[cle] + (b[cle] - a[cle]) * f;
    return mix;
  };

  const G = { x0: 60, x1: 330, yb: 300, yh: 50 };
  const D = { x0: 420, x1: 690, yb: 300, yh: 50 };
  const AXE = { x0: 60, x1: 690, y: 386 };
  const xV = (P, n) => P.x0 + (n / 1600) * (P.x1 - P.x0);
  const yC = (c) => G.yb - (c / 3) * (G.yb - G.yh);
  const yI = (i) => D.yb - (i / 8) * (D.yb - D.yh);
  const xT = (t) => AXE.x0 + (t / T_MAX) * (AXE.x1 - AXE.x0);
  const id = nouveauMarqueur("fl-d-dir");
  const hach = nouveauMarqueur("hach-d-dir");

  const svg = svgEl("svg", {
    viewBox: "0 0 740 430",
    role: "img",
    "aria-label": "Démarrage direct du compresseur : couple moteur et couple résistant en fonction de la vitesse, courant de ligne en fonction de la vitesse, et point de fonctionnement qui suit le temps choisi sur l'axe du bas",
  });
  const defs = svgEl("defs");
  defs.innerHTML =
    marqueur(id) +
    '<pattern id="' + hach + '" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<path d="M0 0V7" stroke="currentColor" stroke-width="1.6" opacity="0.5"/></pattern>';

  const ptsC = traj.filter((_, i) => i % 4 === 0).map((p) => [xV(G, p.n), yC(p.C / MC.Cn)]);
  const ptsCr = traj.filter((_, i) => i % 4 === 0).map((p) => [xV(G, p.n), yC(p.Cr / MC.Cn)]);
  const ptsI = traj.filter((_, i) => i % 4 === 0).map((p) => [xV(D, p.n), yI(p.I / MC.In)]);
  const chaine = (pts) => pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const zone = chaine(ptsC) + " " + chaine(ptsCr.slice().reverse());

  let fond =
    '<polygon points="' + zone + '" fill="url(#' + hach + ')" stroke="none"/>' +
    TRAITS + ' stroke-width="1.4">' +
    '<path d="M' + G.x0 + " " + (G.yb + 6) + "V" + (G.yh - 18) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + (G.x0 - 6) + " " + G.yb + "H" + (G.x1 + 18) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + D.x0 + " " + (D.yb + 6) + "V" + (D.yh - 18) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + (D.x0 - 6) + " " + D.yb + "H" + (D.x1 + 18) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + AXE.x0 + " " + AXE.y + "H" + AXE.x1 + '"/>';
  let ecrits = "";
  for (let n = 0; n <= 1500; n += 500) {
    fond += '<path d="M' + xV(G, n).toFixed(1) + " " + G.yb + "v5M" + xV(D, n).toFixed(1) + " " + D.yb + 'v5"/>';
    ecrits += texte(xV(G, n) - 12, G.yb + 18, String(n)) + texte(xV(D, n) - 12, D.yb + 18, String(n));
  }
  for (let c = 0; c <= 3; c += 1) {
    fond += '<path d="M' + G.x0 + " " + yC(c).toFixed(1) + 'h-5"/>';
    ecrits += texte(G.x0 - 18, yC(c) + 4, String(c));
  }
  for (let i = 0; i <= 8; i += 2) {
    fond += '<path d="M' + D.x0 + " " + yI(i).toFixed(1) + 'h-5"/>';
    ecrits += texte(D.x0 - 18, yI(i) + 4, String(i));
  }
  for (let k = 0; k <= 9; k += 1) {
    const t = k * 0.05;
    fond += '<path d="M' + xT(t).toFixed(1) + " " + (AXE.y - 5) + "v10" + '"/>';
    ecrits += texte(xT(t) - 12, AXE.y + 22, nombre(api, t, 2));
  }
  fond += "</g>";
  fond +=
    '<polyline points="' + chaine(ptsCr) + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="6 4"/>' +
    '<polyline points="' + chaine(ptsC) + '" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>' +
    '<polyline points="' + chaine(ptsI) + '" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>' +
    TRAITS + ' stroke-width="1.2" stroke-dasharray="2 4"><path d="M' + D.x0 + " " + yI(1).toFixed(1) + "H" + D.x1 + '"/></g>' +
    ECRITS + ecrits +
    texte(G.x0 - 10, G.yh - 26, "couple (× C_n)") + texte(G.x1 - 30, G.yb + 36, "n (tr/min)") +
    texte(D.x0 - 10, D.yh - 26, "courant de ligne (× I_n)") + texte(D.x1 - 30, D.yb + 36, "n (tr/min)") +
    texte(D.x1 - 22, yI(1) - 6, "I_n") + texte(G.x1 - 120, yC(0.25) - 10, "couple résistant") +
    texte(AXE.x1 - 40, AXE.y - 12, "t (s)") + "</g>";
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond;
  const mobile = svgEl("g", { fill: "none", stroke: "currentColor" });
  const ecritsMobiles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, groupeFond, mobile, ecritsMobiles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-direct-valeurs", [
    { id: "t", libelle: "Instant", unite: "s", decimales: 3 },
    { id: "n", libelle: "Vitesse", unite: "tr/min", decimales: 0 },
    { id: "I", libelle: "Courant de ligne", unite: "A", decimales: 1 },
    { id: "IIn", libelle: "Courant / I_n", decimales: 2 },
    { id: "C", libelle: "Couple moteur / C_n", decimales: 2 },
    { id: "Cr", libelle: "Couple résistant / C_n", decimales: 3 },
    { id: "Ca", libelle: "Couple d'accélération / C_n", decimales: 2 },
    { id: "V", libelle: "Tension du jeu de barres", unite: "V", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner(t) {
    const p = echantillon(t);
    const xg = xV(G, p.n);
    const xd = xV(D, p.n);
    const yc = yC(p.C / MC.Cn);
    const yr = yC(p.Cr / MC.Cn);
    const yi = yI(p.I / MC.In);
    mobile.innerHTML =
      '<path d="M' + xg.toFixed(1) + " " + G.yb + "V" + yc.toFixed(1) + "M" + xd.toFixed(1) + " " + D.yb + "V" + yi.toFixed(1) + '" stroke-width="1" stroke-dasharray="3 3"/>' +
      '<path d="M' + xg.toFixed(1) + " " + yr.toFixed(1) + "V" + yc.toFixed(1) + '" stroke-width="2.4" marker-end="url(#' + id + ')"/>' +
      '<circle cx="' + xg.toFixed(1) + '" cy="' + yc.toFixed(1) + '" r="5" fill="currentColor"/>' +
      '<circle cx="' + xd.toFixed(1) + '" cy="' + yi.toFixed(1) + '" r="5" fill="currentColor"/>';
    ecritsMobiles.innerHTML =
      texte(G.x0 + 10, G.yh - 4, "t = " + nombre(api, p.t, 3) + " s ; " + nombre(api, p.n, 0) + " tr/min") +
      texte(D.x0 + 10, D.yh - 4, "I = " + nombre(api, p.I, 1) + " A ; jeu de barres " + nombre(api, p.Vjdb * 400, 1) + " V");
    if (valeurs) {
      valeurs.maj({ t: p.t, n: p.n, I: p.I, IIn: p.I / MC.In, C: p.C / MC.Cn, Cr: p.Cr / MC.Cn, Ca: (p.C - p.Cr) / MC.Cn, V: p.Vjdb * 400 });
    }
  }

  const synchro = synchroniseur(dessiner, { idCurseur: "t" });
  synchro.curseurs = api.sim.curseurs(
    "#d-direct-curseurs",
    [{ id: "t", libelle: "Instant depuis la fermeture de KM1", min: 0, max: T_MAX, pas: 0.001, valeur: 0, format: (v) => nombre(api, v, 3) + " s" }],
    (lues) => synchro.appliquer(lues.t, "curseur")
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: AXE.x0, y: AXE.y },
    a: { x: AXE.x1, y: AXE.y },
    min: 0,
    max: T_MAX,
    pas: 0.001,
    valeur: 0,
    libelle: "Instant du démarrage sur l'axe du temps",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  synchro.lecteur = api.sim.lecteur("#d-direct-lecteur", {
    de: 0,
    a: T_MAX,
    duree: 13.5,
    boucle: false,
    auto: false,
    libelle: "Démarrage direct ralenti trente fois",
    rappel: (t) => synchro.appliquer(t, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);

  synchro.appliquer(0, null);
}

/* --------------------------------------------------------------------------
   E. Animation : commutation étoile-triangle à transition ouverte
   -------------------------------------------------------------------------- */

function construireAnimTransition(racine, api) {
  const conteneur = racine.querySelector("#e-transition");
  if (!conteneur) return;

  const O = { x: 190, y: 220 };
  const R = 150;
  const P = { x0: 440, x1: 710, yb: 340, yh: 70 };
  const TM = 0.3;
  const xP = (tm) => P.x0 + (tm / TM) * (P.x1 - P.x0);
  const yP = (r) => P.yb - (r / 1.6) * (P.yb - P.yh);
  const versPoint = (module, angle) => ({ x: O.x - R * module * Math.sin(angle * DEG), y: O.y - R * module * Math.cos(angle * DEG) });
  const TM0 = 0.05;
  const reglages = { tm: TM0, ordre: 0, cr: 25 };
  const id = nouveauMarqueur("fl-e-tr");

  const svg = svgEl("svg", {
    viewBox: "0 0 740 420",
    role: "img",
    "aria-label": "Plan de Fresnel d'un enroulement à la fermeture du triangle : tension appliquée, force électromotrice résiduelle en spirale selon le temps mort, et segment proportionnel à la pointe de courant ; à droite, pointe rapportée au courant de démarrage direct en fonction du temps mort",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(id);
  let fixe =
    '<circle cx="' + O.x + '" cy="' + O.y + '" r="' + R + '" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 5" opacity="0.7"/>' +
    TRAITS + ' stroke-width="1" opacity="0.7"><path d="M' + O.x + " " + (O.y + 20) + "V" + (O.y - R - 22) + '"/></g>' +
    TRAITS + ' stroke-width="1.4">' +
    '<path d="M' + P.x0 + " " + (P.yb + 6) + "V" + (P.yh - 18) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + (P.x0 - 6) + " " + P.yb + "H" + (P.x1 + 18) + '" marker-end="url(#' + id + ')"/>';
  let ecrits = "";
  for (let k = 0; k <= 6; k += 1) {
    const tm = k * 0.05;
    fixe += '<path d="M' + xP(tm).toFixed(1) + " " + P.yb + 'v6"/>';
    ecrits += texte(xP(tm) - 10, P.yb + 22, String(Math.round(tm * 1000)));
  }
  for (let r = 0; r <= 1.5; r += 0.5) {
    fixe += '<path d="M' + P.x0 + " " + yP(r).toFixed(1) + 'h-6"/>';
    ecrits += texte(P.x0 - 30, yP(r) + 4, nombre(api, r, 1));
  }
  fixe += "</g>" + TRAITS + ' stroke-width="1.1" stroke-dasharray="7 5"><path d="M' + P.x0 + " " + yP(1).toFixed(1) + "H" + P.x1 + '"/></g>';
  fixe +=
    ECRITS + ecrits + texte(P.x0 - 10, P.yh - 30, "pointe / I_d") + texte(P.x1 - 110, P.yb + 40, "temps mort (ms)") +
    texte(P.x0 + 6, yP(1) - 6, "démarrage direct") + texte(O.x + 6, O.y - R - 10, "tension d'étoile") +
    texte(O.x - 160, O.y + R + 30, "cercle pointillé : 1, soit 400 V par enroulement") + "</g>";
  const groupeFixe = svgEl("g");
  groupeFixe.innerHTML = fixe;
  const courbes = svgEl("g", { fill: "none", stroke: "currentColor" });
  const mobile = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round" });
  const ecritsMobiles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, groupeFixe, courbes, mobile, ecritsMobiles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-transition-valeurs", [
    { id: "tm", libelle: "Temps mort", unite: "ms", decimales: 0 },
    { id: "e", libelle: "Force électromotrice résiduelle", unite: "V", decimales: 0 },
    { id: "retard", libelle: "Retard pris sur le réseau", unite: "°", decimales: 1 },
    { id: "ecart", libelle: "Écart avec la tension appliquée", unite: "°", decimales: 1 },
    { id: "r", libelle: "Pointe / I_d", decimales: 2 },
    { id: "I", libelle: "Pointe de courant de ligne", unite: "A", decimales: 0 },
    { id: "kY", libelle: "Pointe / courant en étoile (81 A)", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const decalage = () => (reglages.ordre >= 0.5 ? 30 : -30);
  const coupleR = () => (reglages.cr / 100) * MC.Cn;

  function dessinerCourbes() {
    let html = "";
    let ecr = "";
    for (const [dc, epaisseur, tirets] of [[decalage(), 3, ""], [-decalage(), 1.4, ' stroke-dasharray="5 4"']]) {
      const pts = [];
      for (let k = 0; k <= 150; k += 1) {
        const tm = (TM * k) / 150;
        pts.push(xP(tm).toFixed(1) + "," + yP(transition(tm, dc, coupleR()).r).toFixed(1));
      }
      html += '<polyline points="' + pts.join(" ") + '" stroke-width="' + epaisseur + '"' + tirets + "/>";
    }
    const spirale = [];
    for (let k = 0; k <= 150; k += 1) {
      const tm = (TM * k) / 150;
      const tr = transition(tm, 0, coupleR());
      const p = versPoint(tr.e, -tr.retard);
      spirale.push(p.x.toFixed(1) + "," + p.y.toFixed(1));
    }
    html += '<polyline points="' + spirale.join(" ") + '" stroke-width="1.2" stroke-dasharray="2 4"/>';
    ecr += texte(P.x0 - 40, P.yb + 60, "épais : ordre choisi ; tirets : autre ordre");
    courbes.innerHTML = html;
    return ecr;
  }
  let legendeCourbes = dessinerCourbes();

  function dessiner(tm) {
    reglages.tm = tm;
    const dc = decalage();
    const tr = transition(tm, dc, coupleR());
    const a = versPoint(1, dc);
    const e = versPoint(tr.e, -tr.retard);
    const ecart = Math.abs(((dc + tr.retard + 540) % 360) - 180);
    mobile.innerHTML =
      '<path d="M' + O.x + " " + O.y + "L" + a.x.toFixed(1) + " " + a.y.toFixed(1) + '" stroke-width="3.2" marker-end="url(#' + id + ')"/>' +
      '<path d="M' + O.x + " " + O.y + "L" + e.x.toFixed(1) + " " + e.y.toFixed(1) + '" stroke-width="2" stroke-dasharray="7 4" marker-end="url(#' + id + ')"/>' +
      '<path d="M' + e.x.toFixed(1) + " " + e.y.toFixed(1) + "L" + a.x.toFixed(1) + " " + a.y.toFixed(1) + '" stroke-width="5" opacity="0.55"/>' +
      '<path d="M' + xP(tm).toFixed(1) + " " + P.yb + "V" + yP(tr.r).toFixed(1) + '" stroke-width="1" stroke-dasharray="3 3"/>' +
      '<circle cx="' + xP(tm).toFixed(1) + '" cy="' + yP(tr.r).toFixed(1) + '" r="5" fill="currentColor"/>';
    const milieu = { x: (a.x + e.x) / 2, y: (a.y + e.y) / 2 };
    ecritsMobiles.innerHTML =
      legendeCourbes +
      texte(a.x + (dc > 0 ? -84 : 10), a.y - 6, "U triangle") +
      texte(e.x + 8, e.y + 16, "E résiduelle") +
      texte(milieu.x + 10, milieu.y, "∝ pointe") +
      texte(20, 30, (dc > 0 ? "ordre : triangle en avance de 30°" : "ordre : triangle en retard de 30°")) +
      texte(20, 48, "couple résistant : " + nombre(api, reglages.cr, 0) + " % de C_n");
    if (valeurs) {
      valeurs.maj({ tm: tm * 1000, e: tr.e * 400, retard: tr.retard, ecart, r: tr.r, I: tr.r * MC.Id, kY: (tr.r * MC.Id) / 81 });
    }
  }

  const synchro = synchroniseur(dessiner, { idCurseur: "tm" });
  synchro.curseurs = api.sim.curseurs(
    "#e-transition-curseurs",
    [
      { id: "tm", libelle: "Temps mort entre KM2 et KM3", min: 0, max: TM, pas: 0.001, valeur: reglages.tm, format: (v) => nombre(api, v * 1000, 0) + " ms" },
      { id: "ordre", libelle: "Ordre de raccordement du triangle", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (v >= 0.5 ? "en avance de 30°" : "en retard de 30°") },
      { id: "cr", libelle: "Couple résistant pendant le temps mort", min: 0, max: 100, pas: 5, valeur: 25, format: (v) => nombre(api, v, 0) + " % de C_n" },
    ],
    (lues) => {
      const change = lues.ordre !== reglages.ordre || lues.cr !== reglages.cr;
      reglages.ordre = lues.ordre;
      reglages.cr = lues.cr;
      if (change) legendeCourbes = dessinerCourbes();
      synchro.appliquer(lues.tm, "curseur");
      if (change) dessiner(reglages.tm);
    }
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: P.x0, y: P.yb },
    a: { x: P.x1, y: P.yb },
    min: 0,
    max: TM,
    pas: 0.001,
    valeur: reglages.tm,
    libelle: "Temps mort sur l'axe du graphe",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  synchro.lecteur = api.sim.lecteur("#e-transition-lecteur", {
    de: 0,
    a: TM,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Allongement du temps mort de 0 à 300 ms",
    rappel: (tm) => synchro.appliquer(tm, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);

  synchro.appliquer(TM0, null);
}

/* --------------------------------------------------------------------------
   E. Animation : le gradateur à thyristors
   -------------------------------------------------------------------------- */

function construireAnimGradateur(racine, api) {
  const conteneur = racine.querySelector("#e-gradateur");
  if (!conteneur) return;

  const C = { x: 140, y: 230 };
  const RC = 100;
  const W = { x0: 300, x1: 720, y: 200, a: 110 };
  const xW = (th) => W.x0 + (th / TAU) * (W.x1 - W.x0);
  const yW = (v) => W.y - v * W.a;
  const surCadran = (deg, r = RC) => ({ x: C.x + r * Math.cos(deg * DEG), y: C.y - r * Math.sin(deg * DEG) });
  const id = nouveauMarqueur("fl-e-gr");

  const svg = svgEl("svg", {
    viewBox: "0 0 740 380",
    role: "img",
    "aria-label": "Gradateur à thyristors : cadran de l'angle de retard alpha avec sa poignée et repère de l'angle de la charge, puis une période de la tension du réseau, de la tension appliquée au moteur et du courant découpé, avec les intervalles de conduction",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(id);

  const phiDeg = PHI_D / DEG;
  const pPhi = surCadran(phiDeg, RC + 16);
  const pPhi0 = surCadran(phiDeg, RC - 10);
  let fixe =
    TRAITS + ' stroke-width="1.6"><path d="M' + (C.x + RC) + " " + C.y + "A" + RC + " " + RC + " 0 0 0 " + (C.x - RC) + " " + C.y + '"/>' +
    '<path d="M' + (C.x - RC - 10) + " " + C.y + "H" + (C.x + RC + 10) + '"/></g>' +
    TRAITS + ' stroke-width="1.4"><path d="M' + pPhi0.x.toFixed(1) + " " + pPhi0.y.toFixed(1) + "L" + pPhi.x.toFixed(1) + " " + pPhi.y.toFixed(1) + '"/>';
  let ecrits = texte(pPhi.x + 4, pPhi.y - 4, "φ_d = 66,4°");
  for (let a = 0; a <= 180; a += 30) {
    const p1 = surCadran(a, RC - 6);
    const p2 = surCadran(a, RC + 6);
    fixe += '<path d="M' + p1.x.toFixed(1) + " " + p1.y.toFixed(1) + "L" + p2.x.toFixed(1) + " " + p2.y.toFixed(1) + '"/>';
    const pt = surCadran(a, RC + 22);
    if (a !== 60) ecrits += texte(pt.x - 10, pt.y + 4, String(a));
  }
  fixe += '<path d="M' + W.x0 + " " + (W.y + W.a + 16) + "V" + (W.y - W.a - 24) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + (W.x0 - 6) + " " + W.y + "H" + (W.x1 + 14) + '" marker-end="url(#' + id + ')"/>';
  for (let k = 0; k <= 4; k += 1) {
    fixe += '<path d="M' + xW((k * Math.PI) / 2).toFixed(1) + " " + (W.y - 4) + 'v8"/>';
    ecrits += texte(xW((k * Math.PI) / 2) - 10, W.y + W.a + 32, String(k * 90) + "°");
  }
  fixe += "</g>";
  const ptsV = [];
  for (let k = 0; k <= 240; k += 1) {
    const th = (TAU * k) / 240;
    ptsV.push(xW(th).toFixed(1) + "," + yW(Math.sin(th)).toFixed(1));
  }
  fixe += '<polyline points="' + ptsV.join(" ") + '" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 4"/>';
  fixe += ECRITS + ecrits + texte(C.x - 70, C.y + 30, "angle de retard α") + texte(W.x0 + 6, W.y - W.a - 28, "pointillé : réseau ; fin : moteur ; épais : courant") +
    texte(W.x1 - 20, W.y + 20, "ωt") + "</g>";
  const groupeFixe = svgEl("g");
  groupeFixe.innerHTML = fixe;
  const zones = svgEl("g", { fill: "currentColor", "fill-opacity": 0.1, stroke: "none" });
  const mobile = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linejoin": "round" });
  const ecritsMobiles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, zones, groupeFixe, mobile, ecritsMobiles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-gradateur-valeurs", [
    { id: "alpha", libelle: "Angle de retard α", unite: "°", decimales: 1 },
    { id: "cond", libelle: "Angle de conduction", unite: "°", decimales: 1 },
    { id: "I1", libelle: "Fondamental du courant / direct", decimales: 3 },
    { id: "Ieff", libelle: "Courant efficace / direct", decimales: 3 },
    { id: "thd", libelle: "Distorsion du courant", format: (v) => (Number.isFinite(v) ? nombre(api, v, 1) + " %" : "nulle") },
    { id: "C", libelle: "Couple à l'arrêt / C_d", decimales: 3 },
    { id: "IA", libelle: "Courant du compresseur à l'arrêt", unite: "A", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner(alphaDeg) {
    const alpha = alphaDeg * DEG;
    const m = mesuresGradateur(alpha);
    let zonesHtml = "";
    const intervalles = m.G.continu
      ? [[0, TAU]]
      : [[alpha, Math.min(m.G.beta, TAU)], [alpha + Math.PI, Math.min(m.G.beta + Math.PI, TAU)], [0, Math.max(0, m.G.beta + Math.PI - TAU)]];
    for (const [a, b] of intervalles) {
      if (b - a < 1e-4) continue;
      zonesHtml += '<rect x="' + xW(a).toFixed(1) + '" y="' + (W.y - W.a - 8) + '" width="' + (xW(b) - xW(a)).toFixed(1) + '" height="' + (2 * W.a + 16) + '"/>';
    }
    zones.innerHTML = zonesHtml;
    const ptsI = [];
    const ptsU = [];
    for (let k = 0; k <= 360; k += 1) {
      const th = (TAU * k) / 360;
      const i = courantGradateur(m.G, alpha, th);
      const conduit = m.G.continu || Math.abs(i) > 1e-9;
      ptsI.push(xW(th).toFixed(1) + "," + yW(i).toFixed(1));
      ptsU.push(xW(th).toFixed(1) + "," + yW(conduit ? Math.sin(th) : 0).toFixed(1));
    }
    const pa = surCadran(alphaDeg);
    mobile.innerHTML =
      '<polyline points="' + ptsU.join(" ") + '" stroke-width="1.4"/>' +
      '<polyline points="' + ptsI.join(" ") + '" stroke-width="3"/>' +
      '<path d="M' + (C.x + 40) + " " + C.y + "A40 40 0 0 0 " + (C.x + 40 * Math.cos(alpha)).toFixed(1) + " " + (C.y - 40 * Math.sin(alpha)).toFixed(1) + '" stroke-width="2.4"/>' +
      '<path d="M' + C.x + " " + C.y + "L" + pa.x.toFixed(1) + " " + pa.y.toFixed(1) + '" stroke-width="2"/>' +
      (m.G.continu ? "" : '<path d="M' + xW(alpha).toFixed(1) + " " + (W.y + W.a + 6) + "V" + (W.y - W.a - 6) + '" stroke-width="1" stroke-dasharray="3 3"/>');
    ecritsMobiles.innerHTML =
      texte(C.x - 40, C.y - RC - 40, "α = " + nombre(api, alphaDeg, 1) + "°") +
      (m.G.continu ? texte(W.x0 + 10, W.y + W.a + 50, "α ≤ φ_d : conduction continue, rien n'est découpé") : texte(W.x0 + 10, W.y + W.a + 50, "conduction : " + nombre(api, m.conduction, 1) + "° par alternance"));
    if (valeurs) {
      valeurs.maj({ alpha: alphaDeg, cond: m.conduction, I1: m.I1, Ieff: m.Ieff, thd: m.G.continu ? NaN : m.thd, C: m.I1 * m.I1, IA: m.I1 * MC.Id });
    }
  }

  const synchro = synchroniseur(dessiner, { idCurseur: "alpha", versLecteur: (v) => 150 - v });
  synchro.curseurs = api.sim.curseurs(
    "#e-gradateur-curseurs",
    [{ id: "alpha", libelle: "Angle de retard à l'amorçage", min: 0, max: 175, pas: 0.5, valeur: 117, format: (v) => nombre(api, v, 1) + "°" }],
    (lues) => synchro.appliquer(lues.alpha, "curseur")
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: C,
    rayon: RC,
    min: 0,
    max: 175,
    pas: 0.5,
    boucle: false,
    valeur: 117,
    libelle: "Angle de retard sur le cadran",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  synchro.lecteur = api.sim.lecteur("#e-gradateur-lecteur", {
    de: 0,
    a: 90,
    duree: 9,
    boucle: false,
    auto: false,
    libelle: "Rampe de démarrage : α de 150° à 60°",
    rappel: (v) => synchro.appliquer(150 - v, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);

  synchro.appliquer(117, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : comparer les modes de démarrage
   -------------------------------------------------------------------------- */

const NOMS_MODES = ["démarrage direct", "étoile-triangle", "autotransformateur", "démarreur progressif"];

function optionsMode(M, mode, reglages) {
  if (mode === 1) return { mode: "etoile", o: {} };
  if (mode === 2) return { mode: "auto", o: { k: reglages.k } };
  if (mode === 3) return { mode: "progressif", o: { Ilim: reglages.ilim * M.In } };
  return { mode: "direct", o: {} };
}

function texteScc(api, index) {
  const s = LISTE_SCC[Math.round(index)];
  return Number.isFinite(s) ? nombre(api, s, s < 10 ? 1 : 1) + " MVA" : "réseau parfait";
}

function construireComparateur(racine, api) {
  const reglages = { machine: 0, mode: 1, k: 0.65, ilim: 3, scc: MACHINES[0].Scc };
  let resultat = null;
  let verrou = false;
  let curseurs = null;

  const couple = api.sim.traceur("#e-comparateur-couple", {
    titre: "Couple disponible et couple résistant en fonction de la vitesse",
    xTitre: "vitesse n",
    xUnite: "tr/min",
    yTitre: "couple",
    yUnite: "× C_n",
    xMin: 0,
    xMax: 1550,
    yMin: 0,
    yMax: 3.2,
    echantillons: 400,
    series: [
      { id: "mode", nom: "mode choisi", couleur: "serie-1", epaisseur: 3 },
      { id: "direct", nom: "démarrage direct, tension nominale", couleur: "serie-6", epaisseur: 1.4 },
      { id: "charge", nom: "couple résistant", couleur: "serie-5", epaisseur: 2.2 },
    ],
    surDessin({ c, repere, couleurs }) {
      if (!resultat) return;
      if (resultat.nT != null && resultat.nT > 1) ligneV(c, repere, couleurs, resultat.nT, "commutation");
      else if (!resultat.calage) ligneV(c, repere, couleurs, resultat.nFin, "vitesse finale");
      if (resultat.calage) pointTrace(c, repere, couleurs, 0, resultat.Cr0, "calage", true);
    },
  });
  if (couple) ressources.push(couple);

  const courant = api.sim.traceur("#e-comparateur-courant", {
    titre: "Courant de ligne en fonction de la vitesse",
    xTitre: "vitesse n",
    xUnite: "tr/min",
    yTitre: "courant",
    yUnite: "× I_n",
    xMin: 0,
    xMax: 1550,
    yMin: 0,
    yMax: 8,
    echantillons: 400,
    series: [
      { id: "mode", nom: "mode choisi", couleur: "serie-1", epaisseur: 3 },
      { id: "direct", nom: "démarrage direct", couleur: "serie-6", epaisseur: 1.4 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 1, "I_n", [2, 4]);
      if (resultat && resultat.nT != null && resultat.nT > 1) ligneV(c, repere, couleurs, resultat.nT, "commutation");
    },
  });
  if (courant) ressources.push(courant);

  const siFini = (decimales, unite) => (v) => (Number.isFinite(v) ? nombre(api, v, decimales) + (unite ? " " + unite : "") : "sans objet");
  const valeurs = api.sim.valeurs("#e-comparateur-valeurs", [
    { id: "machine", libelle: "Machine", format: (v) => v },
    { id: "I", libelle: "Courant de ligne au démarrage", format: siFini(0, "A") },
    { id: "IIn", libelle: "Courant au démarrage / I_n", format: siFini(2, "") },
    { id: "C", libelle: "Couple au démarrage / C_n", format: siFini(2, "") },
    { id: "rend", libelle: "Rendement en couple", format: siFini(2, "") },
    { id: "creux", libelle: "Creux de tension au démarrage", format: siFini(1, "%") },
    { id: "pic", libelle: "Courant après commutation", format: siFini(0, "A") },
    { id: "t95", libelle: "Durée jusqu'à 95 % de n_s", format: siFini(2, "s") },
    { id: "Wr", libelle: "Énergie dissipée dans le rotor", format: siFini(1, "kJ") },
    { id: "rapW", libelle: "Énergie rotor / ½ J Ω_s²", format: siFini(2, "") },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    const m = MACHINES[reglages.machine];
    const M = m.M;
    const Zr = impedanceReseau(LISTE_SCC[reglages.scc]);
    const { mode, o } = optionsMode(M, reglages.mode, reglages);
    const r = demarrer(M, mode, m.charge, m.J, Zr, { ...o, decimation: 20 });
    const e0 = etat(M, mode, 1, Zr, o);
    const nT = r.nT;
    resultat = { ...r, Cr0: m.charge(0) / M.Cn };
    const gDe = (n) => Math.max(1e-6, 1 - n / M.ns);
    const finale = mode === "etoile" ? "triangle" : mode === "auto" ? "direct" : mode;
    const phaseA = (n) => (nT != null && n >= nT ? finale : mode);
    if (couple) {
      couple.definirFonction("mode", (n) => etat(M, phaseA(n), gDe(n), Zr, o).C / M.Cn);
      couple.definirFonction("direct", (n) => M.couple(gDe(n)) / M.Cn);
      couple.definirFonction("charge", (n) => m.charge(n) / M.Cn);
    }
    if (courant) {
      courant.definirFonction("mode", (n) => etat(M, phaseA(n), gDe(n), Zr, o).I / M.In);
      courant.definirFonction("direct", (n) => cMod(M.courant(gDe(n))) / M.In);
    }
    let verdict = "démarrage correct";
    if (r.calage) verdict = "calage : le couple ne dépasse pas le couple résistant";
    else if (nT != null && nT < 1) verdict = "pas de décollement à tension réduite : commutation à l'arrêt";
    else if (r.t95 != null && r.t95 > 20) verdict = "démarrage très long : échauffement du rotor à vérifier";
    else if (nT != null && r.Ipic > 0.5 * M.Id) verdict = "commutation à basse vitesse : courant proche du direct";
    if (valeurs) {
      valeurs.maj({
        machine: m.nom,
        I: e0.I,
        IIn: e0.I / M.In,
        C: e0.C / M.Cn,
        rend: e0.C / M.couple(1) / (e0.I / M.Id),
        creux: (1 - e0.Vjdb) * 100,
        pic: nT != null ? r.Ipic : NaN,
        t95: r.calage ? NaN : r.t95,
        Wr: r.calage ? NaN : r.Wr / 1000,
        rapW: r.calage ? NaN : r.Wr / (0.5 * m.J * M.Ws * M.Ws),
        verdict,
      });
    }
  }

  curseurs = api.sim.curseurs(
    "#e-comparateur-curseurs",
    [
      { id: "machine", libelle: "Machine entraînée", min: 0, max: 3, pas: 1, valeur: 0, format: (v) => MACHINES[Math.round(v)].nom },
      { id: "mode", libelle: "Mode de démarrage", min: 0, max: 3, pas: 1, valeur: 1, format: (v) => NOMS_MODES[Math.round(v)] },
      { id: "k", libelle: "Rapport de l'autotransformateur k", min: 0.5, max: 0.8, pas: 0.05, valeur: 0.65, format: (v) => nombre(api, v * 100, 0) + " %" },
      { id: "ilim", libelle: "Courant limite du démarreur progressif", min: 2, max: 5, pas: 0.5, valeur: 3, format: (v) => nombre(api, v, 1) + " I_n" },
      { id: "scc", libelle: "Puissance de court-circuit au démarreur", min: 0, max: LISTE_SCC.length - 1, pas: 1, valeur: MACHINES[0].Scc, format: (v) => texteScc(api, v) },
    ],
    (lues) => {
      if (verrou) return;
      const machine = Math.round(lues.machine);
      if (machine !== reglages.machine && curseurs) {
        reglages.machine = machine;
        verrou = true;
        curseurs.definir("scc", MACHINES[machine].Scc);
        verrou = false;
        lues = curseurs.valeurs;
      }
      reglages.machine = Math.round(lues.machine);
      reglages.mode = Math.round(lues.mode);
      reglages.k = lues.k;
      reglages.ilim = lues.ilim;
      reglages.scc = Math.round(lues.scc);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   I. Simulation : démarrage du compresseur du site dans le temps
   -------------------------------------------------------------------------- */

function construireSimCompresseur(racine, api) {
  const reglages = { source: 0, mode: 3, ilim: 2.5, tm: 50, ordre: 0 };
  let marques = null;

  const tCourant = api.sim.traceur("#i-temps-courant", {
    titre: "Courant de ligne du compresseur pendant le démarrage",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "courant",
    yUnite: "A",
    xMin: 0,
    xMax: 2.5,
    yMin: 0,
    yMax: 360,
    echantillons: 300,
    series: [{ id: "I", nom: "courant de ligne", couleur: "serie-1", epaisseur: 2.6 }],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, MC.In, "I_n = 33,6 A", [2, 4]);
      if (marques && marques.Imax) pointTrace(c, repere, couleurs, marques.tImax, marques.Imax, "maximum", true);
    },
  });
  if (tCourant) ressources.push(tCourant);

  const tTension = api.sim.traceur("#i-temps-tension", {
    titre: "Vitesse et tension du jeu de barres pendant le démarrage",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "pour cent",
    xMin: 0,
    xMax: 2.5,
    yMin: 0,
    yMax: 110,
    echantillons: 300,
    series: [
      { id: "n", nom: "vitesse, % de n_s", couleur: "serie-3", epaisseur: 2.4 },
      { id: "V", nom: "tension du jeu de barres, % de 400 V", couleur: "serie-1", epaisseur: 2.6 },
    ],
    surDessin({ c, repere, couleurs }) {
      const seuil = marques && marques.seuil ? marques.seuil : 95;
      ligneH(c, repere, couleurs, seuil, "seuil d'étude : " + seuil + " %", [6, 4]);
    },
  });
  if (tTension) ressources.push(tTension);

  const siFini = (decimales, unite) => (v) => (Number.isFinite(v) ? nombre(api, v, decimales) + (unite ? " " + unite : "") : "sans objet");
  const valeurs = api.sim.valeurs("#i-temps-valeurs", [
    { id: "Imax", libelle: "Courant maximal", format: siFini(1, "A") },
    { id: "IIn", libelle: "Courant maximal / I_n", format: siFini(2, "") },
    { id: "pic", libelle: "Pointe de commutation", format: siFini(0, "A") },
    { id: "Vmin", libelle: "Tension minimale du jeu de barres", format: siFini(1, "V") },
    { id: "creux", libelle: "Creux maximal", format: siFini(1, "%") },
    { id: "t95", libelle: "Durée jusqu'à 95 % de n_s", format: siFini(2, "s") },
    { id: "Wr", libelle: "Énergie dissipée dans le rotor", format: siFini(2, "kJ") },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    const Zs = reglages.source >= 0.5 ? ZG_GROUPE : ZT_POSTE;
    const { mode, o } = optionsMode(MC, reglages.mode, { k: 0.65, ilim: reglages.ilim });
    const opts = { ...o, Zamont: Zs, dt: 0.0005, decimation: 4, tMax: 6 };
    if (mode === "etoile") {
      opts.tempsMort = reglages.tm / 1000;
      opts.ordre = reglages.ordre >= 0.5 ? 30 : -30;
    }
    const r = demarrer(MC, mode, CHARGE_COMPRESSEUR, 0.45, cAdd(Zs, Z_CABLE), opts);
    const tFin = Math.max(0.5, Math.min(6, r.t * 1.25 + 0.1));
    let Imax = 0;
    let tImax = 0;
    for (const p of r.trace) {
      if (p.I > Imax) {
        Imax = p.I;
        tImax = p.t;
      }
    }
    const seuilCreux = reglages.source >= 0.5 ? 10 : 5;
    marques = { Imax, tImax, seuil: 100 - seuilCreux };
    const dernier = r.trace[r.trace.length - 1];
    const prolonge = r.trace.concat([{ t: tFin, n: dernier.n, I: dernier.I, Vjdb: dernier.Vjdb }]);
    if (tCourant) {
      tCourant.definirPlage({ xMax: tFin, yMax: Math.max(120, Math.ceil((Imax * 1.15) / 40) * 40) });
      tCourant.definirDonnees("I", prolonge.map((p) => [p.t, p.I]));
    }
    if (tTension) {
      tTension.definirPlage({ xMax: tFin });
      tTension.definirDonnees("n", prolonge.map((p) => [p.t, (100 * p.n) / MC.ns]));
      tTension.definirDonnees("V", prolonge.map((p) => [p.t, 100 * p.Vjdb]));
    }
    const creux = (1 - r.VjdbMin) * 100;
    let verdict = "acceptable pour les hypothèses d'étude";
    if (r.calage) verdict = "calage";
    else if (creux > seuilCreux) verdict = "creux supérieur à " + seuilCreux + " % : à refuser";
    else if (r.Ipic != null && mode === "etoile" && r.Ipic > 2 * 81) verdict = "pointe de commutation marquée";
    if (valeurs) {
      valeurs.maj({
        Imax,
        IIn: Imax / MC.In,
        pic: mode === "etoile" ? r.Ipic : NaN,
        Vmin: r.VjdbMin * 400,
        creux,
        t95: r.t95,
        Wr: r.Wr / 1000,
        verdict,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-temps-curseurs",
    [
      { id: "source", libelle: "Source", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (v >= 0.5 ? "groupe électrogène, S_cc 0,5 MVA" : "transformateur du poste, 100 kVA") },
      { id: "mode", libelle: "Mode de démarrage", min: 0, max: 3, pas: 1, valeur: 3, format: (v) => NOMS_MODES[Math.round(v)] + (Math.round(v) === 2 ? ", prise 65 %" : "") },
      { id: "ilim", libelle: "Courant limite du démarreur progressif", min: 2, max: 4, pas: 0.25, valeur: 2.5, format: (v) => nombre(api, v, 2) + " I_n" },
      { id: "tm", libelle: "Temps mort de l'étoile-triangle", min: 20, max: 200, pas: 5, valeur: 50, format: (v) => nombre(api, v, 0) + " ms" },
      { id: "ordre", libelle: "Ordre de raccordement du triangle", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (v >= 0.5 ? "en avance de 30°" : "en retard de 30°") },
    ],
    (lues) => {
      reglages.source = lues.source;
      reglages.mode = Math.round(lues.mode);
      reglages.ilim = lues.ilim;
      reglages.tm = lues.tm;
      reglages.ordre = lues.ordre;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
}

/* --------------------------------------------------------------------------
   Schéma unifilaire compact d'un étoile-triangle, réutilisé par le quiz.
   Zones utiles : KM1 (56-124, 36-74), F1 (56-124, 86-114),
   KM3 (356-424, 56-94), KM2 (356-424, 166-204).
   -------------------------------------------------------------------------- */

function dessinEtoile(id, pourZones) {
  let d = "<defs>" + marqueur(id) + "</defs>";
  d += TRAITS + ' stroke-width="2">';
  d += '<path d="M90 10V40M90 70V90M90 110V135H150M330 135H390V170M390 200V222H300M390 135V90M390 60V40H200V135"/>';
  d += '<rect x="60" y="40" width="60" height="30" rx="4"/><rect x="60" y="90" width="60" height="20" rx="4"/>';
  d += '<rect x="150" y="122" width="180" height="26" rx="4" fill="currentColor" fill-opacity="0.12"/>';
  d += '<rect x="360" y="60" width="60" height="30" rx="4"/><rect x="360" y="170" width="60" height="30" rx="4"/>';
  d += '<path d="M290 222H310M295 228H305"/>';
  d += "</g>";
  d += TRAITS + ' stroke-width="1.6"><path d="M70 20V30" marker-end="url(#' + id + ')"/></g>';
  d += ECRITS + texte(100, 22, "L, trois phases") + texte(156, 166, "enroulements U1-U2, V1-V2, W1-W2") + texte(206, 34, "vers V1, W1, U1") + texte(250, 240, "point commun") + texte(140, 116, "U1") + texte(334, 116, "U2");
  if (!pourZones) d += texte(128, 60, "KM1") + texte(128, 104, "F1") + texte(428, 80, "KM3") + texte(428, 190, "KM2");
  d += "</g>";
  return d;
}

const ZONES_ETOILE = [
  { x: 56, y: 36, largeur: 68, hauteur: 38, etiquette: "KM1" },
  { x: 56, y: 86, largeur: 68, hauteur: 28, etiquette: "F1" },
  { x: 356, y: 56, largeur: 68, hauteur: 38, etiquette: "KM3" },
  { x: 356, y: 166, largeur: 68, hauteur: 38, etiquette: "KM2" },
];

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* 1. Fondamental : application directe */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-etoile",
      titre: "Courant de ligne en étoile",
      niveau: "fondamental",
      enonce:
        "<p>Un moteur $400/690\\ \\mathrm{V}$ de $I_n = 50\\ \\mathrm{A}$, $I_d/I_n = 7$, $C_d/C_n = 2{,}2$, démarre en étoile-triangle sur un réseau " +
        "$400\\ \\mathrm{V}$ supposé parfait. Quel courant de ligne prend-il au démarrage, en étoile ?</p>",
      valeur: 350 / 3,
      unite: "A",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Courant $I_{LY}$",
      etapes: [
        { texte: "En démarrage direct, couplé en triangle : $I_d = 7 \\times 50 = 350\\ \\mathrm{A}$." },
        { texte: "En étoile, chaque enroulement reçoit $1/\\sqrt{3}$ de sa tension, et le courant de ligne n'est plus multiplié par $\\sqrt{3}$ : $I_{LY} = I_d/3 = 116{,}7\\ \\mathrm{A}$." },
        { texte: "Le couple est divisé dans le même rapport : $2{,}2/3 = 0{,}73\\ C_n$.", note: "Contrôle : $u = 1/\\sqrt{3}$, $u^2 = 1/3$ ; la transformation de tension garde un rendement en couple de $1$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurBarres(2),
          dessinBarres([["direct", 350, false], ["étoile", 116.7, true]], 360, "A", 560),
          "Courant de ligne au démarrage : l'étoile en prend le tiers."
        );
      },
    })
  );

  /* 2. Fondamental : choisir les méthodes compatibles */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-plaque",
      titre: "Ce que permet la plaque",
      niveau: "fondamental",
      enonce:
        "<p>Un moteur de $7{,}5\\ \\mathrm{kW}$ porte sur sa plaque $230/400\\ \\mathrm{V}$. Il est alimenté par un réseau $230/400\\ \\mathrm{V}$. " +
        "Quels modes de démarrage sont possibles ?</p>",
      options: [
        { texte: "Démarrage direct, couplé en étoile.", juste: true },
        { texte: "Démarrage étoile-triangle." },
        { texte: "Démarrage par autotransformateur, moteur couplé en étoile.", juste: true },
        { texte: "Démarreur progressif à thyristors, moteur couplé en étoile.", juste: true },
        { texte: "Étoile-triangle, à condition d'allonger la temporisation." },
      ],
      multiple: true,
      etapes: [
        { texte: "La plaque $230/400\\ \\mathrm{V}$ signifie : $230\\ \\mathrm{V}$ par enroulement. Sur un réseau $400\\ \\mathrm{V}$, le moteur se couple donc en étoile." },
        { texte: "L'étoile-triangle suppose un fonctionnement normal en triangle ; ici, le triangle appliquerait $400\\ \\mathrm{V}$ à des enroulements prévus pour $230\\ \\mathrm{V}$ : surexcitation et destruction. Aucune temporisation n'y change rien." },
        { texte: "Direct, autotransformateur et démarreur progressif agissent sur la tension de ligne et conviennent à un moteur couplé en étoile.", note: "Pour un étoile-triangle sur $400\\ \\mathrm{V}$, il faut une plaque $400/690\\ \\mathrm{V}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurEtapes(4),
          dessinEtapes(["plaque 230/400 V : 230 V par enroulement", "réseau 400 V : couplage étoile obligatoire", "triangle : 400 V sur 230 V, interdit", "direct, autotransformateur, progressif : possibles"], 560),
          "Raisonnement révélé ligne par ligne, de la plaque au mode de démarrage."
        );
      },
    })
  );

  /* 3. Intermédiaire : choix de la prise d'un autotransformateur */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-prise",
      titre: "Prise d'autotransformateur pour un courant imposé",
      niveau: "intermédiaire",
      enonce:
        "<p>Le gestionnaire d'un réseau limite le courant de démarrage d'un moteur à $2{,}5\\ I_n$. Le moteur a $I_d/I_n = 6{,}5$ et $C_d/C_n = 2{,}0$. " +
        "Quel rapport $k$ maximal peut-on donner à un autotransformateur idéal ? Calculez ensuite le couple obtenu.</p>",
      valeur: Math.sqrt(2.5 / 6.5),
      unite: "",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Rapport $k$",
      etapes: [
        { texte: "Courant de ligne : $I_L = k^2 I_d$. On impose $k^2 \\times 6{,}5\\ I_n \\le 2{,}5\\ I_n$." },
        { texte: "$k \\le \\sqrt{2{,}5/6{,}5} = \\sqrt{0{,}3846} = 0{,}620$ ; on choisira la prise normalisée immédiatement inférieure, ici $60\\ \\%$." },
        { texte: "Couple : $k^2 C_d = 0{,}3846 \\times 2{,}0 = 0{,}77\\ C_n$ à $k = 0{,}620$, et $0{,}36 \\times 2{,}0 = 0{,}72\\ C_n$ sur la prise de $60\\ \\%$.", note: "Un démarreur progressif limité au même courant ne donnerait que $(2{,}5/6{,}5)^2 \\times 2{,}0 = 0{,}30\\ C_n$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Couple obtenu en fonction du courant de ligne autorisé",
          xTitre: "I_L / I_d",
          yTitre: "C / C_n",
          xMin: 0,
          xMax: 1,
          yMin: 0,
          yMax: 2.1,
          series: [
            { id: "auto", nom: "autotransformateur : 2,0 × I_L/I_d", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => 2 * x },
            { id: "prog", nom: "démarreur progressif : 2,0 × (I_L/I_d)²", couleur: "serie-3", epaisseur: 2.6, fonction: (x) => 2 * x * x },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 2.5 / 6.5, "2,5 I_n");
            pointTrace(c, repere, couleurs, 2.5 / 6.5, 2 * (2.5 / 6.5), "0,77 C_n");
            pointTrace(c, repere, couleurs, 2.5 / 6.5, 2 * Math.pow(2.5 / 6.5, 2), "0,30 C_n");
          },
        });
      },
    })
  );

  /* 4. Intermédiaire : creux de tension */
  const Zt4 = 0.04 * 400 * 400 / 250000;
  const Xt4 = Math.sqrt(Zt4 * Zt4 - 0.008 * 0.008);
  const creux4 = ((0.008 * 0.35 + Xt4 * Math.sqrt(1 - 0.35 * 0.35)) * 396) / (400 / Math.sqrt(3));
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-creux",
      titre: "Creux de tension au tableau",
      niveau: "intermédiaire",
      enonce:
        "<p>Un transformateur de $250\\ \\mathrm{kVA}$, $u_{cc} = 4\\ \\%$, $R_t = 8\\ \\mathrm{m\\Omega}$ par phase, alimente un tableau $400\\ \\mathrm{V}$. On y démarre " +
        "en direct un moteur de $30\\ \\mathrm{kW}$, $I_n = 55\\ \\mathrm{A}$, $I_d/I_n = 7{,}2$, $\\cos\\varphi_d = 0{,}35$. Avec l'approximation de Kapp, quel creux " +
        "relatif obtient-on au tableau, en pour cent ?</p>",
      valeur: creux4 * 100,
      unite: "%",
      tolerance: 0.06,
      chiffres: 2,
      libelleChamp: "Creux $\\Delta U/U$",
      etapes: [
        { texte: "$Z_t = 0{,}04 \\times 400^2/250\\,000 = 25{,}6\\ \\mathrm{m\\Omega}$, $X_t = \\sqrt{25{,}6^2 - 8^2} = 24{,}32\\ \\mathrm{m\\Omega}$ ; $I_d = 7{,}2 \\times 55 = 396\\ \\mathrm{A}$ ; $\\sin\\varphi_d = 0{,}9367$." },
        { texte: "$\\Delta V \\approx (R_t\\cos\\varphi_d + X_t\\sin\\varphi_d)I_d = (0{,}0028 + 0{,}02278) \\times 396 = 10{,}13\\ \\mathrm{V}$ par phase." },
        { texte: "$\\Delta U/U = 10{,}13/230{,}94 = 4{,}39\\ \\%$.", note: "Le calcul complexe exact, qui tient compte de la baisse du courant, donne $379\\ \\mathrm{A}$ et $4{,}20\\ \\%$ : l'approximation majore légèrement, dans le sens de la sécurité." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurEtapes(4),
          dessinEtapes(["Z_t = 25,6 mΩ ; X_t = 24,32 mΩ ; I_d = 396 A", "ΔV ≈ (8 × 0,35 + 24,32 × 0,9367) mΩ × 396 A", "ΔV ≈ 10,13 V, soit 4,39 % de 230,94 V", "exact : 379 A et 4,20 %"], 560),
          "Étapes révélées une à une : impédances, chute de Kapp, creux relatif, contrôle exact."
        );
      },
    })
  );

  /* 5. Avancé : énergie rotorique d'un démarrage en charge */
  const Ws = (TAU * 1500) / 60;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-energie",
      titre: "Énergie rotorique d'un démarrage doux en charge",
      niveau: "avancé",
      enonce:
        "<p>Un moteur à quatre pôles, $50\\ \\mathrm{Hz}$, entraîne une machine de couple résistant constant $C_r = 200\\ \\mathrm{N \\cdot m}$, inertie totale " +
        "$J = 2\\ \\mathrm{kg \\cdot m^2}$. Un démarreur progressif maintient un couple moteur à peu près constant de $300\\ \\mathrm{N \\cdot m}$. Quelle énergie est " +
        "dissipée dans le rotor jusqu'au synchronisme, en kilojoules ? Comparez à un démarrage direct qui donnerait $500\\ \\mathrm{N \\cdot m}$ en moyenne.</p>",
      valeur: (0.5 * 2 * Ws * Ws * 3) / 1000,
      unite: "kJ",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Énergie $W_r$",
      etapes: [
        { texte: "$\\varOmega_s = 157{,}08\\ \\mathrm{rad/s}$ ; $\\tfrac{1}{2}J\\varOmega_s^2 = 0{,}5 \\times 2 \\times 157{,}08^2 = 24{,}67\\ \\mathrm{kJ}$." },
        { texte: "À couples constants, $W_r = \\tfrac{1}{2}J\\varOmega_s^2\\,C_m/(C_m - C_r) = 24{,}67 \\times 300/100 = 74{,}0\\ \\mathrm{kJ}$, en $t_d = J\\varOmega_s/(C_m - C_r) = 3{,}14\\ \\mathrm{s}$." },
        { texte: "En direct : $24{,}67 \\times 500/300 = 41{,}1\\ \\mathrm{kJ}$ en $1{,}05\\ \\mathrm{s}$. Le démarrage doux dissipe $80\\ \\%$ de plus dans le rotor.", note: "Le démarreur progressif ménage le réseau et la transmission, pas le rotor ; à vérifier contre le temps de démarrage admissible du constructeur." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Énergie rotorique en fonction du couple moteur, charge de 200 N·m",
          xTitre: "couple moteur C_m",
          xUnite: "N·m",
          yTitre: "W_r",
          yUnite: "kJ",
          xMin: 220,
          xMax: 600,
          yMin: 0,
          yMax: 160,
          series: [
            { id: "w", nom: "W_r = ½ J Ω_s² C_m / (C_m - C_r)", couleur: "serie-1", epaisseur: 2.6, fonction: (cm) => (0.5 * 2 * Ws * Ws * cm) / (cm - 200) / 1000 },
            { id: "min", nom: "½ J Ω_s², minimum à vide", couleur: "serie-6", epaisseur: 1.4, fonction: () => (0.5 * 2 * Ws * Ws) / 1000 },
          ],
          surDessin({ c, repere, couleurs }) {
            pointTrace(c, repere, couleurs, 300, 74.0, "progressif : 74,0 kJ");
            pointTrace(c, repere, couleurs, 500, 41.1, "direct : 41,1 kJ");
          },
        });
      },
    })
  );

  /* 6. Diagnostic industriel */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-diagnostic",
      titre: "Une pompe qui déclenche à la commutation",
      niveau: "diagnostic",
      enonce:
        "<p>Une pompe centrifuge démarrée en étoile-triangle déclenche parfois son relais de surcharge. L'enregistrement montre une vitesse qui plafonne " +
        "vers $1250\\ \\mathrm{tr/min}$ en étoile, puis, à la commutation, une pointe d'environ $6\\ I_n$ et un à-coup sur la tuyauterie. La vanne de refoulement " +
        "reste ouverte au démarrage depuis une modification récente. Expliquez l'enchaînement et proposez deux remèdes.</p>",
      motsCles: [["etoile", "tiers", "1/3"], ["equilibre", "plafonne", "couple resistant", "insuffisant"], ["vanne", "ferm", "charge"], ["commutation", "direct", "pointe"]],
      minimum: 3,
      exemple: "Quatre idées : couple en étoile, équilibre bas, commutation à basse vitesse, rôle de la vanne ; puis deux remèdes.",
      etapes: [
        { texte: "En étoile, le couple est divisé par $3$. Vanne ouverte, la pompe débite dès le départ et son couple résistant rejoint le tiers du couple moteur vers $1250\\ \\mathrm{tr/min}$ : le moteur s'arrête d'accélérer sur cet équilibre." },
        { texte: "La temporisation commute alors à basse vitesse : en triangle, le courant à $1250\\ \\mathrm{tr/min}$ est encore proche de celui du démarrage direct, auquel s'ajoute la pointe de reconnexion. Le long séjour en étoile, puis cette pointe, chauffent le moteur et font déclencher le relais." },
        { texte: "Remèdes : rétablir la fermeture de la vanne de refoulement au démarrage, avec ouverture temporisée après la commutation ; ou remplacer l'étoile-triangle par un démarreur progressif à limitation de courant, qui offre en plus l'arrêt progressif contre le coup de bélier, ou par un variateur.", note: "Vérifier aussi le temps mort et l'ordre de raccordement, qui peuvent aggraver la pointe." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const P = MOTEURS.pompe;
        const chargeOuverte = (n) => P.Cn * (0.15 + 1.05 * Math.pow(n / P.nn, 2));
        const nEq = dichotomie((n) => P.couple(1 - n / P.ns) / 3 - chargeOuverte(n), 600, 1450);
        traceCorrection(moteurApi, conteneur, {
          titre: "Couple en étoile et couple de la pompe vanne ouverte",
          xTitre: "vitesse n",
          xUnite: "tr/min",
          yTitre: "× C_n",
          xMin: 0,
          xMax: 1500,
          yMin: 0,
          yMax: 2.8,
          series: [
            { id: "y", nom: "couple moteur en étoile, C/3", couleur: "serie-1", epaisseur: 2.6, fonction: (n) => P.couple(Math.max(1e-6, 1 - n / P.ns)) / 3 / P.Cn },
            { id: "d", nom: "couple en triangle, C", couleur: "serie-6", epaisseur: 1.4, fonction: (n) => P.couple(Math.max(1e-6, 1 - n / P.ns)) / P.Cn },
            { id: "r", nom: "pompe vanne ouverte", couleur: "serie-5", epaisseur: 2.2, fonction: (n) => chargeOuverte(n) / P.Cn },
          ],
          surDessin({ c, repere, couleurs }) {
            pointTrace(c, repere, couleurs, nEq, P.couple(1 - nEq / P.ns) / 3 / P.Cn, "équilibre en étoile");
            ligneV(c, repere, couleurs, nEq, null);
          },
        });
      },
    })
  );

  /* 7. Conceptuelle */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Deux appareils, un même courant, deux couples",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi un autotransformateur réglé pour prendre $3\\ I_n$ au réseau donne à un moteur beaucoup plus de couple qu'un " +
        "démarreur progressif limité à $3\\ I_n$.</p>",
      motsCles: [["transform", "rapport k"], ["courant moteur", "plus grand", "superieur", "k fois"], ["carre", "u2", "u²", "quadratique"], ["ligne", "reseau"]],
      minimum: 3,
      exemple: "Trois phrases : ce que chaque appareil fait à la tension, au courant du moteur, puis au couple.",
      etapes: [
        { texte: "Le couple dépend du carré de la tension appliquée au moteur : $C = u^2 C_d$." },
        { texte: "Le démarreur progressif chute la tension : le courant du moteur est le courant de ligne, donc $u = I_L/I_d$ et $C/C_d = (I_L/I_d)^2$." },
        { texte: "L'autotransformateur transforme la tension : le moteur reçoit $u = k$ et un courant $kI_d$, mais le réseau ne fournit que $k$ fois ce courant, $k^2I_d$. À courant de ligne égal, $u$ est plus grand, et $C/C_d = I_L/I_d$.", note: "Pour $I_d = 7{,}5\\ I_n$ et $3\\ I_n$ : $0{,}40\\ C_d$ contre $0{,}16\\ C_d$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurBarres(2),
          dessinBarres([["autotransformateur", 0.4, true], ["progressif", 0.16, false]], 0.45, "C_d", 560),
          "Couple obtenu pour 3 I_n pris au réseau, moteur de I_d = 7,5 I_n."
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const VISUELS_QUIZ = [
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["étoile : U/√3 par enroulement", "courant de ligne : (1/√3) × (1/√3) = 1/3", "couple : (1/√3)² = 1/3"], 540), legende: "Le même facteur 3 pour le courant et le couple." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["W_r ≥ ½ J Ω_s² quel que soit le mode", "W_r = ½ J Ω_s² C_m / (C_m - C_r)", "C_m plus petit : W_r plus grand"], 540), legende: "Le démarrage doux augmente l'énergie rotorique." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["I_L = k² I_d", "= 0,7² × 600 = 0,49 × 600", "= 294 A"], 540), legende: "Courant de ligne avec un autotransformateur de 70 %." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["amorçage : échelon de tension sur la capacité", "i = C dv/dt : pointe de courant très brève", "thyristors détruits : condensateurs en amont"], 540), legende: "Pourquoi les condensateurs restent en amont du gradateur." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["ΔU/U ≈ S_d / S_cc si les angles sont égaux", "= 400 kVA / 8 MVA", "= 5 %"], 540), legende: "Creux par le rapport des puissances." },
  { viewBox: "0 0 520 250", dessin: dessinEtoile(nouveauMarqueur("fl-l-et-c"), false), legende: "KM2 relie les trois sorties U2, V2, W2 : c'est lui qui forme le point étoile." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["plaque 230/400 V : 230 V par enroulement", "réseau 400 V : étoile obligatoire", "triangle sur 400 V : interdit"], 540), legende: "Un moteur 230/400 V ne démarre pas en étoile-triangle sur 400 V." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["étoile : C/3 à toutes les vitesses", "compresseur à vide : C_r ≤ 0,25 C_n", "charges lourdes : équilibre bas ou calage"], 540), legende: "L'étoile-triangle convient aux machines démarrées à vide." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["u = I_lim / I_d = 3 / 6 = 0,5", "C = u² C_d = 0,25 × 2 C_n", "C = 0,5 C_n"], 540), legende: "Couple d'un démarreur progressif à 3 I_n." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["pointe ∝ |U triangle - E résiduelle|", "E garde le flux du rotor, en retard après le temps mort", "temps mort long et mauvais ordre : opposition"], 540), legende: "Origine de la pointe de commutation." },
];

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>En étoile-triangle, par rapport au démarrage direct, le courant de ligne et le couple de démarrage sont divisés par :</p>",
        options: ["$\\sqrt{3}$ et $3$", "$3$ et $3$", "$3$ et $\\sqrt{3}$", "$\\sqrt{3}$ et $\\sqrt{3}$"],
        bonnes: [1],
        explication: "La tension par enroulement est divisée par $\\sqrt{3}$ et le facteur $\\sqrt{3}$ entre courant de branche et courant de ligne disparaît : courant divisé par $3$ ; couple en $u^2 = 1/3$.",
        resume: "Facteur de l'étoile-triangle",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Un démarreur progressif réduit l'énergie dissipée dans le rotor pendant le démarrage.</p>",
        reponse: false,
        explication: "L'énergie rotorique vaut au moins $\\tfrac{1}{2}J\\varOmega_s^2$ et augmente quand le couple moteur se rapproche du couple résistant : un démarrage plus doux la fait croître.",
        resume: "Démarrage doux et rotor",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Un moteur de $I_d = 600\\ \\mathrm{A}$ démarre par autotransformateur sur la prise de $70\\ \\%$. Quel courant de ligne prend-il, en ampères ?</p>",
        valeur: 294,
        unite: "A",
        tolerance: 0.01,
        explication: "$I_L = k^2 I_d = 0{,}49 \\times 600 = 294\\ \\mathrm{A}$ ; le moteur reçoit lui $0{,}7 \\times 600 = 420\\ \\mathrm{A}$.",
        resume: "Courant avec autotransformateur",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi ne faut-il jamais raccorder des condensateurs de compensation en aval d'un démarreur progressif ?</p>",
        motsCles: [["thyristor", "gradateur"], ["pointe", "courant d'appel", "surintensite", "dv/dt"], ["echelon", "amorcage", "brusque"], ["detrui", "endommag", "claqu"]],
        minimum: 2,
        explication: "À chaque amorçage, le thyristor applique brusquement la tension à la capacité : $i = C\\,\\mathrm{d}v/\\mathrm{d}t$ produit une pointe de courant très brève qui détruit les thyristors. Les condensateurs se raccordent en amont, par leur propre contacteur.",
        resume: "Condensateurs et gradateur",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Un moteur a une puissance apparente de démarrage de $400\\ \\mathrm{kVA}$ ; la puissance de court-circuit au tableau vaut $8\\ \\mathrm{MVA}$, et les angles des deux impédances sont voisins. Quel creux de tension faut-il attendre, en pour cent ?</p>",
        valeur: 5,
        unite: "%",
        tolerance: 0.02,
        explication: "$\\Delta U/U \\approx S_d/S_{cc} = 0{,}4/8 = 5\\ \\%$, valeur haute puisque l'angle est le même et que le courant réel est un peu plus faible.",
        resume: "Creux par les puissances",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Sur ce schéma unifilaire d'un démarreur étoile-triangle, quel contacteur forme le point étoile ?</p>",
        consigne: "Cliquez sur le contacteur correspondant.",
        viewBox: "0 0 520 250",
        dessin: dessinEtoile(nouveauMarqueur("fl-l-et"), true),
        zones: ZONES_ETOILE.map((z) => ({ ...z, juste: z.etiquette === "KM2" })),
        explication: "KM2 relie entre elles les sorties U2, V2, W2 des enroulements : c'est le contacteur étoile. KM3 les relie aux entrées voisines pour fermer le triangle, KM1 est le contacteur de ligne, F1 le relais de surcharge.",
        resume: "Contacteur étoile",
      },
      {
        type: "vraiFaux",
        enonce: repere(6) + "<p>Un moteur dont la plaque indique $230/400\\ \\mathrm{V}$ peut démarrer en étoile-triangle sur un réseau $230/400\\ \\mathrm{V}$.</p>",
        reponse: false,
        explication: "Ses enroulements sont prévus pour $230\\ \\mathrm{V}$ : sur ce réseau, il fonctionne en étoile. Le triangle leur appliquerait $400\\ \\mathrm{V}$.",
        resume: "Plaque et étoile-triangle",
      },
      {
        type: "qcm",
        enonce: repere(7) + "<p>Pour quelle machine un démarrage étoile-triangle est-il le mieux adapté ?</p>",
        options: ["Un convoyeur redémarré bande pleine", "Un compresseur à vis démarré à vide", "Un treuil de levage en charge", "Un broyeur à boulets plein"],
        bonnes: [1],
        explication: "Le couple, divisé par $3$ à toutes les vitesses, doit rester au-dessus du couple résistant : une machine démarrée à vide le permet, une charge lourde non.",
        resume: "Choix de l'étoile-triangle",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Un moteur a $I_d = 6\\ I_n$ et $C_d = 2\\ C_n$. Un démarreur progressif le limite à $3\\ I_n$. Quel couple de démarrage obtient-on, en multiples de $C_n$ ?</p>",
        valeur: 0.5,
        unite: "C_n",
        tolerance: 0.01,
        explication: "$u = 3/6 = 0{,}5$ ; $C = 0{,}25 \\times 2 = 0{,}5\\ C_n$.",
        resume: "Couple d'un démarreur progressif",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Quels facteurs augmentent la pointe de courant d'une commutation étoile-triangle à transition ouverte ?</p>",
        options: [
          { texte: "Un temps mort qui laisse la force électromotrice résiduelle prendre un retard proche de $180^\\circ$.", juste: true },
          { texte: "Un ordre de raccordement qui décale la tension de triangle du mauvais côté.", juste: true },
          { texte: "Une commutation avant que le moteur ait atteint son équilibre en étoile.", juste: true },
          { texte: "Un relais de surcharge réglé à $I_n/\\sqrt{3}$." },
        ],
        multiple: true,
        explication:
          "La pointe dépend de l'écart entre la tension appliquée et la force électromotrice résiduelle, donc du temps mort et de l'ordre de raccordement, et du courant de régime en triangle à la vitesse de commutation. Le réglage du relais ne la modifie pas.",
        resume: "Pointe de commutation",
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
      { categorie: "Principe", question: "Comment varient courant et couple quand la tension appliquée est réduite à $u$ ?", reponse: "Le courant comme $u$, le couple comme $u^2$, à glissement donné : le schéma équivalent est linéaire et le couple est quadratique en courant." },
      { categorie: "Direct", question: "Quels sont les ordres de grandeur d'un démarrage direct ?", reponse: "$5$ à $8\\ I_n$ pendant presque tout le démarrage, $1{,}5$ à $3\\ C_n$, $\\cos\\varphi_d$ de $0{,}3$ à $0{,}45$ ; énergie rotorique minimale." },
      { categorie: "Étoile-triangle", question: "Que divise l'étoile-triangle, et à quelles conditions ?", reponse: "Courant de ligne et couple par $3$ à toutes les vitesses ; plaque $400/690\\ \\mathrm{V}$ sur réseau $400\\ \\mathrm{V}$, six conducteurs, charge faible au démarrage." },
      { categorie: "Transition", question: "D'où vient la pointe de la commutation étoile-triangle ?", reponse: "Du flux rotorique résiduel : sa force électromotrice décroît et prend du retard pendant le temps mort ; en opposition avec la tension de triangle, la pointe dépasse $I_d$." },
      { categorie: "Autotransformateur", question: "Courant moteur, courant de ligne et couple avec une prise $k$ ?", reponse: "$kI_d$ au moteur, $k^2I_d$ au réseau, $k^2C_d$ ; transition fermée en montage Korndorfer." },
      { categorie: "Progressif", question: "Pourquoi le démarreur progressif donne-t-il peu de couple par ampère ?", reponse: "Il chute la tension sans la transformer : $I_L = I_{moteur}$, donc $C/C_d = (I_L/I_d)^2$.", rappel: "Compresseur à $3\\ I_n$ : $0{,}37\\ C_n$." },
      { categorie: "Progressif", question: "Quelles précautions impose un démarreur progressif ?", reponse: "Bypass en fin de démarrage, condensateurs en amont sur leur contacteur, harmoniques sur source faible, durée de démarrage compatible avec le moteur et l'appareil." },
      { categorie: "Réseau", question: "Comment estimer le creux de tension d'un démarrage ?", reponse: "$\\Delta U/U \\approx (R_r\\cos\\varphi_d + X_r\\sin\\varphi_d)I_d/V \\approx S_d/S_{cc}$ ; calcul complexe exact si le câble ou la source sont importants." },
      { categorie: "Rotor", question: "Quelle énergie le rotor dissipe-t-il pendant un démarrage ?", reponse: "$W_r = \\tfrac{1}{2}J\\varOmega_s^2$ à vide, $\\tfrac{1}{2}J\\varOmega_s^2\\,C_m/(C_m - C_r)$ à couples constants : elle augmente quand on réduit le couple." },
      { categorie: "Choix", question: "Quel mode pour une charge lourde au démarrage ?", reponse: "Démarrage direct si le réseau l'accepte, sinon variateur de fréquence ou rotor bobiné ; les modes à tension réduite calent ou surchauffent." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["I_LY = I_d / 3", "= 600 / 3", "= 200 A"], 540), legende: "Courant de ligne en étoile." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["autotransformateur : I_L = k² I_d, C = k² C_d", "k = 1/√3 = 0,577 : k² = 1/3", "mêmes valeurs que l'étoile-triangle"], 540), legende: "Un autotransformateur à 57,7 % équivaut à l'étoile-triangle." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["Ω_s = 2π × 1500 / 60 = 157,08 rad/s", "W_r = ½ × 1,2 × 157,08²", "W_r = 14,8 kJ"], 540), legende: "Énergie rotorique d'un démarrage à vide." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["4 pôles : Ω_s = 157,08 rad/s", "C_em = P_tr / Ω_s = 12 000 / 157,08", "C_em = 76,39 N·m"], 540), legende: "Couple électromagnétique à partir de la puissance transmise." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["à l'arrêt, f_r = 50 Hz au lieu de 1 Hz", "effet de peau : R2' plus grande, X2' plus faible", "saturation des fuites : courant et couple plus forts"], 540), legende: "Pourquoi les paramètres de marche ne décrivent pas le démarrage." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["u_cc = U_cc / U_n", "= 790 V / 20 000 V", "= 3,95 %"], 540), legende: "Tension de court-circuit relative." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["W = ½ L i²", "= 0,5 × 3,4 × 10⁻³ × 115²", "= 22,5 J à dissiper dans l'arc"], 540), legende: "Énergie magnétique à l'ouverture d'un pôle." },
];

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Un moteur a un courant de démarrage direct de $600\\ \\mathrm{A}$. Quel courant de ligne prend-il en étoile, en ampères ?</p>",
        valeur: 200,
        unite: "A",
        tolerance: 0.01,
        explication: "$I_{LY} = I_d/3 = 200\\ \\mathrm{A}$, sur un réseau supposé parfait.",
        resume: "Courant en étoile",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Un autotransformateur réglé à $k = 1/\\sqrt{3}$ donne le même courant de ligne et le même couple qu'un démarrage en étoile.</p>",
        reponse: true,
        explication: "$k^2 = 1/3$ : courant de ligne et couple divisés par $3$, comme en étoile ; les deux méthodes transforment la tension.",
        resume: "Autotransformateur et étoile",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Cette séance. Un moteur à quatre pôles, $50\\ \\mathrm{Hz}$, démarre à vide avec $J = 1{,}2\\ \\mathrm{kg \\cdot m^2}$. Quelle énergie son rotor dissipe-t-il, en kilojoules ?</p>",
        valeur: (0.5 * 1.2 * Math.pow((TAU * 1500) / 60, 2)) / 1000,
        unite: "kJ",
        tolerance: 0.01,
        explication: "$W_r = \\tfrac{1}{2}J\\varOmega_s^2 = 0{,}5 \\times 1{,}2 \\times 157{,}08^2 = 14{,}8\\ \\mathrm{kJ}$, quel que soit le mode de démarrage.",
        resume: "Énergie rotorique à vide",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Schéma équivalent du moteur asynchrone. Un moteur à quatre pôles, $50\\ \\mathrm{Hz}$, reçoit $P_{tr} = 12\\ \\mathrm{kW}$ à travers l'entrefer. Quel est son couple électromagnétique, en $\\mathrm{N \\cdot m}$ ?</p>",
        valeur: 12000 / ((TAU * 1500) / 60),
        unite: "N·m",
        tolerance: 0.01,
        explication: "$C_{em} = P_{tr}/\\varOmega_s = 12\\,000/157{,}08 = 76{,}39\\ \\mathrm{N \\cdot m}$, indépendamment du glissement.",
        resume: "Couple par la puissance transmise",
      },
      {
        type: "qcm",
        enonce: repere(4) + "<p>Cours Schéma équivalent du moteur asynchrone. Pourquoi un schéma équivalent identifié au point nominal sous-estime-t-il le courant et le couple de démarrage ?</p>",
        options: [
          "Parce qu'à l'arrêt la fréquence rotorique vaut 50 Hz : l'effet de peau et la saturation des fuites modifient R2' et X2'",
          "Parce que les pertes fer deviennent nulles à l'arrêt",
          "Parce que le courant magnétisant double à l'arrêt",
          "Parce que la résistance du stator diminue à l'arrêt",
        ],
        bonnes: [0],
        explication: "En marche, les courants rotoriques sont à environ $1\\ \\mathrm{Hz}$ ; à l'arrêt, à $50\\ \\mathrm{Hz}$, l'effet de peau augmente $R_2'$ et réduit $X_2'$, et le fort courant sature les chemins de fuite.",
        resume: "Paramètres de marche et démarrage",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Essais à vide et en court-circuit. L'essai en court-circuit du transformateur du poste, $20\\ \\mathrm{kV}/410\\ \\mathrm{V}$, côté haute tension au courant assigné, a demandé $790\\ \\mathrm{V}$. Que vaut sa tension de court-circuit relative, en pour cent ?</p>",
        valeur: 3.95,
        unite: "%",
        tolerance: 0.01,
        explication: "$u_{cc} = 790/20\\,000 = 3{,}95\\ \\%$ ; c'est elle qui fixe l'impédance amont, donc le creux de tension au démarrage d'un moteur.",
        resume: "Tension de court-circuit",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Inductances et champ magnétique. À l'ouverture de KM2, l'inductance de fuite d'une phase, environ $3{,}4\\ \\mathrm{mH}$, est parcourue par une crête de $115\\ \\mathrm{A}$. Quelle énergie magnétique l'arc doit-il dissiper, en joules ?</p>",
        valeur: 0.5 * 3.4e-3 * 115 * 115,
        unite: "J",
        tolerance: 0.02,
        explication: "$W = \\tfrac{1}{2}Li^2 = 0{,}5 \\times 3{,}4 \\times 10^{-3} \\times 115^2 = 22{,}5\\ \\mathrm{J}$. Le courant d'une inductance ne peut pas s'annuler instantanément : l'arc entretient le circuit le temps de dissiper cette énergie, d'où le temps mort avant la fermeture de KM3.",
        resume: "Énergie magnétique et arc",
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
    titre: "Où en suis-je sur le démarrage des moteurs asynchrones ?",
  });
  if (auto) ressources.push(auto);
}
