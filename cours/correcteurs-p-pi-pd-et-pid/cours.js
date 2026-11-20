/* ==========================================================================
   cours/correcteurs-p-pi-pd-et-pid/cours.js
   Correcteurs P, PI, PD et PID : trois lectures d'un écart avec point
   déplaçable, effet comparé des actions sur un four, emballement de
   l'intégrale et anti-emballement avec lecteur, Bode du PID filtré, réglage
   et protection de la régulation de pression, exercices, quiz, cartes,
   révision et bilan.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = 2 * Math.PI;
const DEG = 180 / Math.PI;

/* Four de l'exemple : K en K/%, constantes de temps en secondes. */
const FOUR = { K: 2, t1: 400, t2: 40 };
/* Régulation de pression : modèle supposé du projet fil rouge. */
const PR = { Kg: 0.15, th: 1.2, tc: 0.13, T: 0.05, f0: 42.27, fMax: 50, fMin: 25, rampe: 5 };

/* --------------------------------------------------------------------------
   Outils généraux
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

function ligneV(c, repere, couleurs, x, motif = [1, 3]) {
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
  c.restore();
}

function pointRepere(c, repere, couleurs, x, y) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return;
  if (py < repere.boite.y - 2 || py > repere.boite.y + repere.boite.h + 2) return;
  c.save();
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 2;
  c.beginPath();
  c.arc(px, py, 6, 0, TAU);
  c.stroke();
  c.restore();
}

/** Courbe tronquée dès qu'elle sort de la fenêtre verticale : la suite est NaN. */
function tronquer(ts, ys, yMin, yMax) {
  let sorti = false;
  return ts.map((t, i) => {
    const v = ys[i];
    if (sorti || !Number.isFinite(v)) return [t, NaN];
    if (v > yMax || v < yMin) {
      sorti = true;
      return [t, Math.max(yMin, Math.min(yMax, v))];
    }
    return [t, v];
  });
}

/** Courbe écrêtée : les points hors fenêtre sont masqués, la courbe reprend ensuite. */
function ecreter(ts, ys, yMin, yMax) {
  return ts.map((t, i) => {
    const v = ys[i];
    return [t, Number.isFinite(v) && v >= yMin && v <= yMax ? v : NaN];
  });
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
function dessinEtapes(lignes, largeur = 640) {
  const hauteur = 30 + lignes.length * 22;
  return (
    TRAITS + ' stroke-width="1.4"><rect x="6" y="6" width="' + (largeur - 12) + '" height="' + (hauteur - 12) + '" rx="8"/></g>' +
    ECRITS + lignes.map((ligne, i) => texte(22, 32 + i * 22, ligne)).join("") + "</g>"
  );
}

function etapes(lignes, legende, largeur = 640) {
  return { viewBox: "0 0 " + largeur + " " + (30 + lignes.length * 22), dessin: dessinEtapes(lignes, largeur), legende };
}

function correctionEtapes(lignes, legende, largeur = 640) {
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

/* --------------------------------------------------------------------------
   Calcul : réponses indicielles, four avec PID, pression avec retard
   -------------------------------------------------------------------------- */

function polyMul(a, b) {
  const r = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) for (let j = 0; j < b.length; j += 1) r[i + j] += a[i] * b[j];
  return r;
}

function polyAdd(a, b) {
  const n = Math.max(a.length, b.length);
  const r = new Array(n).fill(0);
  for (let i = 0; i < a.length; i += 1) r[n - a.length + i] += a[i];
  for (let i = 0; i < b.length; i += 1) r[n - b.length + i] += b[i];
  return r;
}

/** Réponse indicielle d'une fonction de transfert strictement propre N/D (puissances décroissantes), RK4. */
function reponseIndicielle(num, den, tmax, h, pasSortie = 1) {
  const n = den.length - 1;
  const d = den.map((v) => v / den[0]);
  const nAsc = num.slice().reverse();
  const c = new Array(n).fill(0);
  for (let k = 0; k < nAsc.length && k < n; k += 1) c[k] = nAsc[k] / den[0];
  const f = (x) => {
    const dx = new Array(n);
    for (let k = 0; k < n - 1; k += 1) dx[k] = x[k + 1];
    let s = 1;
    for (let k = 0; k < n; k += 1) s -= d[n - k] * x[k];
    dx[n - 1] = s;
    return dx;
  };
  let x = new Array(n).fill(0);
  const pas = Math.round(tmax / h);
  const res = { t: [], y: [] };
  for (let i = 0; i <= pas; i += 1) {
    if (i % pasSortie === 0) {
      let y = 0;
      for (let k = 0; k < n; k += 1) y += c[k] * x[k];
      res.t.push(i * h);
      res.y.push(y);
    }
    const k1 = f(x);
    const k2 = f(x.map((v, j) => v + (h / 2) * k1[j]));
    const k3 = f(x.map((v, j) => v + (h / 2) * k2[j]));
    const k4 = f(x.map((v, j) => v + h * k3[j]));
    x = x.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
  }
  return res;
}

/** Dépassement relatif et temps d'établissement à ±bande autour de yf, sur une portion de réponse. */
function mesures(t, y, yf, bande = 0.05) {
  let max = -Infinity;
  for (const v of y) if (v > max) max = v;
  let dernier = -1;
  for (let i = 0; i < y.length; i += 1) if (Math.abs(y[i] - yf) > bande * Math.abs(yf)) dernier = i;
  const t5 = dernier < 0 ? 0 : dernier + 1 < t.length ? t[dernier + 1] : NaN;
  return { D: Math.max(0, (max - yf) / yf), t5 };
}

/**
 * Four avec PID de forme standard.
 * o : { Kc, Ti (Infinity : sans intégrale), Td, N, surMesure, r, tPorte, dPorte,
 *       uMax, uMin, aw (0 sans, 1 blocage, 2 recalcul), Tt, tmax, h, pasSortie }
 */
function simFour(o) {
  const h = o.h || 0.1;
  const n = Math.round(o.tmax / h);
  const pasSortie = o.pasSortie || 10;
  const Tf = o.Td > 0 ? o.Td / (o.N || 10) : 0;
  const af = Tf > 0 ? 1 - Math.exp(-h / Tf) : 0;
  const uMax = o.uMax != null ? o.uMax : Infinity;
  const uMin = o.uMin != null ? o.uMin : -Infinity;
  let x1 = 0;
  let x2 = 0;
  let xi = 0;
  let xf = 0;
  const res = { t: [], y: [], uc: [], us: [], xi: [] };
  for (let k = 0; k <= n; k += 1) {
    const t = k * h;
    const d = o.tPorte != null && t >= o.tPorte ? o.dPorte : 0;
    const y = x2;
    const e = o.r - y;
    const source = o.surMesure ? -y : e;
    const uD = Tf > 0 ? ((o.Kc * o.Td) / Tf) * (source - xf) : 0;
    const uc = o.Kc * e + xi + uD;
    const us = Math.min(uMax, Math.max(uMin, uc));
    if (k % pasSortie === 0) {
      res.t.push(t);
      res.y.push(y);
      res.uc.push(uc);
      res.us.push(us);
      res.xi.push(xi);
    }
    let dxi = Number.isFinite(o.Ti) ? (o.Kc / o.Ti) * e : 0;
    if (o.aw === 1 && ((uc > uMax && e > 0) || (uc < uMin && e < 0))) dxi = 0;
    if (o.aw === 2) dxi += (us - uc) / o.Tt;
    xi += h * dxi;
    if (Tf > 0) xf += af * (source - xf);
    const dx1 = (FOUR.K * (us + d) - x1) / FOUR.t1;
    const dx2 = (x1 - x2) / FOUR.t2;
    x1 += h * dx1;
    x2 += h * dx2;
  }
  return res;
}

/**
 * Pression : PI, butées et rampe du variateur, retard exact, capteur.
 * o : { Kc, Ti, r, d (fonction du temps, bar), aw, Tt, tmax, h, sature }
 */
function simPression(o) {
  const h = o.h || 1e-3;
  const n = Math.round(o.tmax / h);
  const nd = Math.round(PR.T / h);
  const uMax = o.sature === false ? Infinity : PR.fMax - PR.f0;
  const uMin = o.sature === false ? -Infinity : PR.fMin - PR.f0;
  const rampe = o.sature === false ? Infinity : PR.rampe;
  const hist = new Float64Array(n + 2);
  const pasSortie = o.pasSortie || 50;
  let y1 = 0;
  let ym = 0;
  let xi = 0;
  let ua = 0;
  const res = { t: [], y: [], uc: [], ua: [] };
  for (let k = 0; k <= n; k += 1) {
    const t = k * h;
    const r = typeof o.r === "function" ? o.r(t) : o.r || 0;
    const e = r - ym;
    const uc = o.Kc * e + xi;
    const us = Math.min(uMax, Math.max(uMin, uc));
    let du = us - ua;
    du = Math.max(-rampe * h, Math.min(rampe * h, du));
    ua += du;
    hist[k] = ua;
    const f = k >= nd ? hist[k - nd] : 0;
    if (k % pasSortie === 0) {
      res.t.push(t);
      res.y.push(y1);
      res.uc.push(uc);
      res.ua.push(ua);
    }
    let dxi = (o.Kc / o.Ti) * e;
    if (o.aw === 1 && ((uc > uMax && e > 0) || (uc < uMin && e < 0))) dxi = 0;
    if (o.aw === 2) dxi += (ua - uc) / o.Tt;
    xi += h * dxi;
    const d = o.d ? o.d(t) : 0;
    const dy1 = (PR.Kg * f - d - y1) / PR.th;
    const dym = (y1 - ym) / PR.tc;
    y1 += h * dy1;
    ym += h * dym;
  }
  return res;
}

/* Réponse harmonique exacte de la boucle de pression et marges. */
function Lpression(w, K, Ti) {
  const mod = (K * Math.hypot(1, w * Ti)) / (w * Ti * Math.hypot(1, w * PR.th) * Math.hypot(1, w * PR.tc));
  const ph = -Math.PI / 2 + Math.atan(w * Ti) - Math.atan(w * PR.th) - Math.atan(w * PR.tc) - w * PR.T;
  return { mod, ph, re: mod * Math.cos(ph), im: mod * Math.sin(ph) };
}

function margesPression(K, Ti) {
  let w180 = NaN;
  let wc = NaN;
  let mm = Infinity;
  let precedent = null;
  for (let i = 0; i <= 3000; i += 1) {
    const w = 10 ** (-3 + (6 * i) / 3000);
    const L = Lpression(w, K, Ti);
    mm = Math.min(mm, Math.hypot(1 + L.re, L.im));
    if (precedent) {
      if (!Number.isFinite(wc) && precedent.L.mod >= 1 && L.mod < 1) {
        let a = Math.log10(precedent.w);
        let b = Math.log10(w);
        for (let k = 0; k < 50; k += 1) {
          const m = (a + b) / 2;
          if (Lpression(10 ** m, K, Ti).mod >= 1) a = m;
          else b = m;
        }
        wc = 10 ** ((a + b) / 2);
      }
      if (!Number.isFinite(w180) && precedent.L.ph > -Math.PI && L.ph <= -Math.PI) {
        let a = Math.log10(precedent.w);
        let b = Math.log10(w);
        for (let k = 0; k < 50; k += 1) {
          const m = (a + b) / 2;
          if (Lpression(10 ** m, K, Ti).ph > -Math.PI) a = m;
          else b = m;
        }
        w180 = 10 ** ((a + b) / 2);
      }
    }
    precedent = { w, L };
  }
  const pm = Number.isFinite(wc) ? 180 + Lpression(wc, K, Ti).ph * DEG : NaN;
  const gm = Number.isFinite(w180) ? -20 * Math.log10(Lpression(w180, K, Ti).mod) : Infinity;
  return { wc, pm, w180, gm, mm };
}

/* Scénario de la section I : soutirage de 5 à 35 s, consigne nulle. */
function scenarioPression(Kc, Ti, aw, dAmp) {
  return simPression({
    Kc,
    Ti,
    r: 0,
    d: (t) => (t >= 5 && t < 35 ? dAmp : 0),
    aw,
    Tt: Ti / 2,
    tmax: 60,
  });
}

/* Échelon de consigne unité sans saturation : dépassement et temps d'établissement de la pression vraie. */
function consignePression(Kc, Ti) {
  const res = simPression({ Kc, Ti, r: 1, sature: false, tmax: 30, pasSortie: 5 });
  return mesures(res.t, res.y, 1);
}

/* --------------------------------------------------------------------------
   Initialisation et nettoyage
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  detruire();
  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireActions(racine, api);
  construireCompare(racine, api);
  construireWindup(racine, api);
  construireBode(racine, api);
  construireReponsesExemple(racine, api);
  construirePression(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  ressources.push(api.reveler(racine.querySelectorAll(".formule-cle, .encadre, #f-comparatif, #e-methodes"), { decalage: 0.05 }));
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
    ["#e-formes-figure svg", 2.2],
    ["#e-antiwindup-figure svg", 2.2],
    ["#f-schema-principal svg", 2.6],
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
      id: "c1-erreur",
      titre: "Erreur statique d'une boucle sans intégrateur",
      niveau: "fondamental",
      enonce: "<p>Une boucle à retour unitaire a un gain statique de boucle $L(0) = 9$. Quelle est l'erreur statique, en volts, pour un échelon de consigne de $2\\ \\mathrm{V}$ ?</p>",
      valeur: 0.2,
      unite: "V",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Erreur statique",
      etapes: [
        { texte: "Valeur finale : $\\varepsilon_\\infty = r_0/(1 + L(0))$." },
        { texte: "$\\varepsilon_\\infty = 2/(1 + 9) = 0{,}2\\ \\mathrm{V}$, soit $10\\ \\%$ de la consigne." },
        { texte: "La sortie s'établit à $1{,}8\\ \\mathrm{V}$ : il faut un écart de $0{,}2\\ \\mathrm{V}$ pour produire la commande d'équilibre.", note: "Contrôle : $L(0)\\,\\varepsilon_\\infty = 1{,}8\\ \\mathrm{V}$, la sortie." },
      ],
      visuelCorrection: correctionEtapes(["ε∞ = r0 / (1 + L(0))", "= 2 / (1 + 9)", "= 0,2 V ; sortie 1,8 V"], "Erreur statique par la valeur finale."),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-phase-pi",
      titre: "Phase d'un correcteur PI",
      niveau: "fondamental",
      enonce: "<p>Quelle est la phase, en degrés, de $C(j\\omega) = K_c\\bigl(1 + 1/(j\\omega T_i)\\bigr)$ à la pulsation $\\omega = 1/T_i$ ?</p>",
      valeur: -45,
      unite: "°",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Phase",
      etapes: [
        { texte: "$C(j\\omega) = K_c\\bigl(1 - j/(\\omega T_i)\\bigr)$." },
        { texte: "À $\\omega T_i = 1$ : $C = K_c(1 - j)$, d'argument $-45^\\circ$ et de module $K_c\\sqrt2$." },
        { texte: "Aux basses pulsations, la phase tend vers $-90^\\circ$ ; aux hautes, vers $0$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Phase du PI en fonction de ω Ti (échelle logarithmique en abscisse)",
          xTitre: "log10(ω Ti)",
          xUnite: "",
          yTitre: "phase",
          yUnite: "°",
          xMin: -2,
          xMax: 2,
          yMin: -95,
          yMax: 5,
          series: [{ id: "p", nom: "arg C", fonction: (x) => -Math.atan(1 / 10 ** x) * DEG }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, -45, "-45°", [3, 4]);
            ligneV(c, r, couleurs, 0, [6, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c3-zeta",
      titre: "Amortissement lu sur un polynôme",
      niveau: "fondamental",
      enonce: "<p>Une boucle fermée a pour polynôme caractéristique $s^2 + 4s + 16$. Quel est son amortissement $\\zeta$ ?</p>",
      valeur: 0.5,
      unite: "",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Amortissement",
      etapes: [
        { texte: "Identification avec $s^2 + 2\\zeta\\omega_0 s + \\omega_0^2$ : $\\omega_0 = 4\\ \\mathrm{rad/s}$." },
        { texte: "$2\\zeta\\omega_0 = 4$, donc $\\zeta = 0{,}5$." },
        { texte: "Dépassement indiciel $e^{-\\pi \\times 0{,}5/\\sqrt{0{,}75}} = 16{,}3\\ \\%$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const r = reponseIndicielle([16], [1, 4, 16], 4, 0.002, 5);
        traceCorrection(moteur, conteneur, {
          titre: "Réponse indicielle de 16 / (s² + 4s + 16)",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "y",
          yUnite: "",
          xMin: 0,
          xMax: 4,
          yMin: 0,
          yMax: 1.3,
          series: [{ id: "y", nom: "ζ = 0,5", points: r.t.map((t, i) => [t, r.y[i]]) }],
          surDessin({ c, repere: rr, couleurs }) {
            ligneH(c, rr, couleurs, 1, "valeur finale", [7, 5]);
            ligneH(c, rr, couleurs, 1.163, "+16,3 %", [2, 4]);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Trois lectures d'un même écart : point déplaçable sur l'axe des temps
   -------------------------------------------------------------------------- */

const ECART = {
  e: (t) => Math.exp(-0.6 * t) * Math.cos(1.5 * t),
  de: (t) => Math.exp(-0.6 * t) * (-0.6 * Math.cos(1.5 * t) - 1.5 * Math.sin(1.5 * t)),
  /* primitive exacte de e^(at) cos(bt), a = -0,6, b = 1,5 */
  aire: (t) => {
    const a = -0.6;
    const b = 1.5;
    const F = (x) => (Math.exp(a * x) * (a * Math.cos(b * x) + b * Math.sin(b * x))) / (a * a + b * b);
    return F(t) - F(0);
  },
  Td: 0.5,
};

function construireActions(racine, api) {
  const conteneur = racine.querySelector("#d-actions-vivant");
  if (!conteneur) return;
  const P = { x0: 60, x1: 690, eHaut: 1.1, eBas: -0.6, yHaut: 30, yBas: 290, tMax: 8 };
  const X = (t) => P.x0 + ((P.x1 - P.x0) * t) / P.tMax;
  const Y = (e) => P.yHaut + ((P.eHaut - e) * (P.yBas - P.yHaut)) / (P.eHaut - P.eBas);
  const RAIL = 330;
  const etat = { t: 0.7 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 360",
    role: "img",
    "aria-label": "Écart e(t) égal à e puissance moins 0,6 t fois cosinus 1,5 t, de 0 à 8 secondes ; aire hachurée sous la courbe jusqu'à l'instant choisi, tangente au point courant prolongée sur 0,5 seconde, poignée de réglage de l'instant sur un rail gradué sous le graphique",
  });
  const decor = svgEl("g");
  let d = "<defs>" + marqueur("d-ac-fl");
  d += '<pattern id="d-ac-hp" patternUnits="userSpaceOnUse" width="8" height="8"><path d="M0 8L8 0" stroke="currentColor" stroke-width="0.9"/></pattern>';
  d += '<pattern id="d-ac-hn" patternUnits="userSpaceOnUse" width="8" height="8"><path d="M0 0L8 8" stroke="currentColor" stroke-width="0.9"/></pattern>';
  d += "</defs>" + TRAITS + ' stroke-width="1.3">';
  d += '<path d="M' + P.x0 + " " + Y(0).toFixed(1) + "H" + (P.x1 + 14) + '" marker-end="url(#d-ac-fl)"/>';
  d += '<path d="M' + P.x0 + " " + P.yBas + "V" + (P.yHaut - 12) + '" marker-end="url(#d-ac-fl)"/>';
  let grad = "";
  for (let t = 1; t <= 8; t += 1) grad += "M" + X(t).toFixed(1) + " " + (Y(0) - 4).toFixed(1) + "v8";
  for (const v of [-0.5, 0.5, 1]) grad += "M" + (P.x0 - 4) + " " + Y(v).toFixed(1) + "h8";
  d += '<path d="' + grad + '"/>';
  let courbe = "";
  for (let i = 0; i <= 400; i += 1) {
    const t = (P.tMax * i) / 400;
    courbe += (i ? "L" : "M") + X(t).toFixed(1) + " " + Y(ECART.e(t)).toFixed(1);
  }
  d += '<path d="' + courbe + '" stroke-width="2.4"/>';
  d += '<path d="M' + P.x0 + " " + RAIL + "H" + P.x1 + '" stroke-width="1" stroke-dasharray="2 4"/>';
  let gradRail = "";
  for (let t = 0; t <= 8; t += 1) gradRail += "M" + X(t).toFixed(1) + " " + (RAIL - 4) + "v8";
  d += '<path d="' + gradRail + '" stroke-width="1"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  for (let t = 1; t <= 8; t += 1) d += texte(X(t), Y(0) + 16, String(t), ' text-anchor="middle"');
  for (const v of [-0.5, 0.5, 1]) d += texte(P.x0 - 8, Y(v) + 4, String(v).replace(".", ","), ' text-anchor="end"');
  d += texte(P.x1 + 14, Y(0) - 8, "t (s)", ' text-anchor="end"') + texte(P.x0 + 8, P.yHaut - 4, "e(t)");
  d += texte(P.x0, RAIL + 22, "instant t : déplacer la poignée le long du rail") + "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const airePos = svgEl("path", { fill: "url(#d-ac-hp)", stroke: "none" });
  const aireNeg = svgEl("path", { fill: "url(#d-ac-hn)", stroke: "none" });
  const verticale = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "2 4" });
  const tangente = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "4", "stroke-linecap": "round" });
  const prevision = svgEl("rect", { width: "10", height: "10", fill: "none", stroke: "currentColor", "stroke-width": "2" });
  const vraie = svgEl("circle", { r: "5", fill: "none", stroke: "currentColor", "stroke-width": "2" });
  const etiquette = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(airePos, aireNeg, verticale, tangente, prevision, vraie, etiquette);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#d-actions-valeurs", [
    { id: "t", libelle: "Instant t", format: (v) => v },
    { id: "p", libelle: "Présent : e(t), contribution P", format: (v) => v },
    { id: "i", libelle: "Passé : aire de 0 à t, contribution I", format: (v) => v },
    { id: "d", libelle: "Tendance : pente de e, contribution D", format: (v) => v },
    { id: "prev", libelle: "Prévision e(t) + Td ė(t) et valeur vraie e(t + Td)", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function aire(signe) {
    let chemin = "M" + X(0).toFixed(1) + " " + Y(0).toFixed(1);
    const pas = 160;
    for (let i = 0; i <= pas; i += 1) {
      const t = (etat.t * i) / pas;
      const e = ECART.e(t);
      const v = signe > 0 ? Math.max(0, e) : Math.min(0, e);
      chemin += "L" + X(t).toFixed(1) + " " + Y(v).toFixed(1);
    }
    return chemin + "L" + X(etat.t).toFixed(1) + " " + Y(0).toFixed(1) + "Z";
  }

  function toutRecalculer() {
    const t = etat.t;
    const e = ECART.e(t);
    const de = ECART.de(t);
    const prev = e + ECART.Td * de;
    const vrai = ECART.e(t + ECART.Td);
    airePos.setAttribute("d", aire(1));
    aireNeg.setAttribute("d", aire(-1));
    verticale.setAttribute("d", "M" + X(t).toFixed(1) + " " + Y(0).toFixed(1) + "V" + Y(e).toFixed(1) + "M" + X(t).toFixed(1) + " " + Y(0).toFixed(1) + "V" + RAIL);
    tangente.setAttribute("d", "M" + X(t).toFixed(1) + " " + Y(e).toFixed(1) + "L" + X(t + ECART.Td).toFixed(1) + " " + Y(prev).toFixed(1));
    prevision.setAttribute("x", (X(t + ECART.Td) - 5).toFixed(1));
    prevision.setAttribute("y", (Y(prev) - 5).toFixed(1));
    vraie.setAttribute("cx", X(t + ECART.Td).toFixed(1));
    vraie.setAttribute("cy", Y(vrai).toFixed(1));
    etiquette.innerHTML = texte(Math.min(X(t) + 10, 560), 22, "t = " + nb(api, t, 2) + " s");
    if (valeurs) {
      valeurs.maj({
        t: nb(api, t, 2) + " s",
        p: nb(api, e, 3),
        i: nb(api, ECART.aire(t), 3) + " s",
        d: nb(api, de, 3) + " s⁻¹",
        prev: nb(api, prev, 3) + " contre " + nb(api, vrai, 3),
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: X(0), y: RAIL },
    a: { x: X(P.tMax - ECART.Td), y: RAIL },
    min: 0,
    max: P.tMax - ECART.Td,
    pas: 0.05,
    valeur: etat.t,
    libelle: "Instant t sur l'axe des temps, en secondes",
    format: (m) => "t = " + nb(api, typeof m === "number" ? m : m.valeur, 2) + " s",
    rappel(m) {
      etat.t = typeof m === "number" ? m : m.valeur;
      toutRecalculer();
    },
  });
  if (poignee) ressources.push(poignee);

  toutRecalculer();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.6 }));
}

/* --------------------------------------------------------------------------
   E. Simulation : effet comparé des actions P, I et D sur le four
   -------------------------------------------------------------------------- */

const TI_SANS = 2000;

function construireCompare(racine, api) {
  if (!racine.querySelector("#e-compare-curseurs")) return;
  const etat = { Kc: 2.55, Ti: 400, Td: 0, mesure: 1 };

  const valeurs = api.sim.valeurs("#e-compare-valeurs", [
    { id: "struct", libelle: "Structure", format: (v) => v },
    { id: "D", libelle: "Dépassement (consigne 10 K)", format: (v) => v },
    { id: "t5", libelle: "Temps d'établissement à 5 %", format: (v) => v },
    { id: "y600", libelle: "Écart avant la perturbation (t = 600 s)", format: (v) => v },
    { id: "porte", libelle: "Creux après la porte, retour dans la bande", format: (v) => v },
    { id: "u0", libelle: "Commande initiale et maximale", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const options = { xTitre: "temps", xUnite: "s", xMin: 0, xMax: 2000, ratio: 0.4 };
  const trace = api.sim.traceur("#e-compare-trace", {
    ...options,
    titre: "Écart de température du four",
    yTitre: "θ",
    yUnite: "K",
    yMin: 0,
    yMax: 14,
    series: [
      { id: "y", nom: "réglage courant", points: [] },
      { id: "p", nom: "P seul, même Kc", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 10, "consigne", [9, 5]);
      ligneH(c, r, couleurs, 10.5, "", [2, 4]);
      ligneH(c, r, couleurs, 9.5, "", [2, 4]);
      ligneV(c, r, couleurs, 600, [2, 4]);
    },
  });
  if (trace) ressources.push(trace);
  const commande = api.sim.traceur("#e-compare-commande", {
    ...options,
    titre: "Commande demandée au gradateur",
    yTitre: "u",
    yUnite: "%",
    yMin: -10,
    yMax: 120,
    series: [
      { id: "u", nom: "commande, réglage courant", points: [] },
      { id: "p", nom: "commande, P seul", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 60, "réserve +60 %", [9, 5]);
      ligneV(c, r, couleurs, 600, [2, 4]);
    },
  });
  if (commande) ressources.push(commande);

  function recalculer() {
    const Ti = etat.Ti >= TI_SANS ? Infinity : etat.Ti;
    const base = { Kc: etat.Kc, r: 10, tPorte: 600, dPorte: -10, tmax: 2000, N: 10 };
    const res = simFour({ ...base, Ti, Td: etat.Td, surMesure: etat.mesure === 1 });
    const resP = simFour({ ...base, Ti: Infinity, Td: 0 });
    if (trace) {
      trace.definirDonnees("y", ecreter(res.t, res.y, 0, 14));
      trace.definirDonnees("p", ecreter(resP.t, resP.y, 0, 14));
    }
    if (commande) {
      commande.definirDonnees("u", ecreter(res.t, res.uc, -10, 120));
      commande.definirDonnees("p", ecreter(resP.t, resP.uc, -10, 120));
    }
    if (!valeurs) return;
    const avant = res.t.map((t, i) => [t, res.y[i]]).filter((p) => p[0] < 600);
    const m = mesures(avant.map((p) => p[0]), avant.map((p) => p[1]), 10);
    const y600 = avant[avant.length - 1][1];
    let creux = Infinity;
    let dernier = -1;
    for (let i = 0; i < res.t.length; i += 1) {
      if (res.t[i] < 600) continue;
      creux = Math.min(creux, res.y[i]);
      if (Math.abs(res.y[i] - 10) > 0.5) dernier = i;
    }
    let retour;
    if (!Number.isFinite(Ti)) retour = "jamais : erreur permanente";
    else if (dernier < 0) retour = "reste dans la bande";
    else if (dernier + 1 >= res.t.length) retour = "pas encore à 2000 s";
    else retour = "en " + nb(api, res.t[dernier + 1] - 600, 0) + " s";
    let uMax = -Infinity;
    for (const v of res.uc) uMax = Math.max(uMax, v);
    const struct = (etat.Td > 0 ? (Number.isFinite(Ti) ? "PID" : "PD") : Number.isFinite(Ti) ? "PI" : "P") +
      (etat.Td > 0 ? (etat.mesure === 1 ? ", dérivée sur la mesure" : ", dérivée sur l'écart") : "");
    const erreurDurable = !Number.isFinite(Ti);
    valeurs.maj({
      struct,
      D: m.D * 100 < 0.05 ? "aucun" : nb(api, m.D * 100, 1) + " %",
      t5: erreurDurable && Math.abs(y600 - 10) > 0.5 ? "non atteint : erreur de " + nb(api, 10 - y600, 2) + " K" : Number.isFinite(m.t5) ? nb(api, m.t5, 0) + " s" : "au-delà de 600 s",
      y600: nb(api, y600, 2) + " K",
      porte: "minimum " + nb(api, creux, 2) + " K, retour " + retour,
      u0: nb(api, res.uc[1], 1) + " % au départ, " + nb(api, uMax, 1) + " % au plus" + (uMax > 60 ? " : saturerait" : ""),
    });
  }

  const curseurs = api.sim.curseurs(
    "#e-compare-curseurs",
    [
      { id: "Kc", libelle: "Gain $K_c$", min: 0.5, max: 12, pas: 0.05, valeur: etat.Kc, format: (v) => nb(api, v, 2) + " %/K" },
      { id: "Ti", libelle: "Temps d'intégrale $T_i$", min: 50, max: TI_SANS, pas: 10, valeur: etat.Ti, format: (v) => (v >= TI_SANS ? "sans action intégrale" : nb(api, v, 0) + " s") },
      { id: "Td", libelle: "Temps de dérivée $T_d$ ($N = 10$)", min: 0, max: 80, pas: 1, valeur: etat.Td, format: (v) => (v === 0 ? "sans action dérivée" : nb(api, v, 0) + " s") },
      { id: "mesure", libelle: "Dérivée appliquée à", min: 0, max: 1, pas: 1, valeur: etat.mesure, format: (v) => (v === 1 ? "la mesure" : "l'écart") },
    ],
    (v) => {
      Object.assign(etat, v);
      recalculer();
    }
  );
  if (curseurs) {
    ressources.push(curseurs);
    api.rendreMaths(curseurs.grille);
  }
  recalculer();
}

/* --------------------------------------------------------------------------
   E. Simulation : emballement de l'intégrale et anti-emballement
   -------------------------------------------------------------------------- */

const MODES_AW = ["sans protection", "intégration conditionnelle", "recalcul de l'intégrale"];

function construireWindup(racine, api) {
  if (!racine.querySelector("#e-windup-curseurs")) return;
  const etat = { reserve: 40, aw: 0, Tt: 400, t: 0, res: null };
  const TMAX = 1500;
  const lin = simFour({ Kc: 2.551, Ti: 400, Td: 0, r: 50, tmax: TMAX });
  const linM = mesures(lin.t, lin.y, 50);

  const valeurs = api.sim.valeurs("#e-windup-valeurs", [
    { id: "D", libelle: "Dépassement et temps d'établissement à 5 %", format: (v) => v },
    { id: "sat", libelle: "Fin de la saturation", format: (v) => v },
    { id: "inst", libelle: "À l'instant du lecteur : θ, uc, us, xi", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const options = { xTitre: "temps", xUnite: "s", xMin: 0, xMax: TMAX, ratio: 0.4 };
  const trace = api.sim.traceur("#e-windup-trace", {
    ...options,
    titre: "Écart de température, échelon de 50 K",
    yTitre: "θ",
    yUnite: "K",
    yMin: 0,
    yMax: 70,
    series: [
      { id: "y", nom: "avec saturation", points: [] },
      { id: "l", nom: "linéaire, sans saturation", points: lin.t.map((t, i) => [t, lin.y[i]]) },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 50, "consigne", [9, 5]);
      ligneH(c, r, couleurs, 52.5, "", [2, 4]);
      ligneH(c, r, couleurs, 47.5, "", [2, 4]);
      ligneV(c, r, couleurs, etat.t);
      if (etat.res) pointRepere(c, r, couleurs, etat.t, valeurA(etat.res.y, etat.t));
    },
  });
  if (trace) ressources.push(trace);
  const commande = api.sim.traceur("#e-windup-commande", {
    ...options,
    titre: "Commande calculée, commande appliquée et état intégral",
    yTitre: "u",
    yUnite: "%",
    yMin: -20,
    yMax: 140,
    series: [
      { id: "uc", nom: "uc calculée", points: [] },
      { id: "us", nom: "us appliquée", points: [] },
      { id: "xi", nom: "état intégral xi", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, etat.reserve, "butée", [9, 5]);
      ligneV(c, r, couleurs, etat.t);
      if (etat.res) pointRepere(c, r, couleurs, etat.t, valeurA(etat.res.xi, etat.t));
    },
  });
  if (commande) ressources.push(commande);

  function valeurA(serie, t) {
    const i = Math.max(0, Math.min(serie.length - 1, Math.round(t)));
    return serie[i];
  }

  function majInstant() {
    if (!valeurs || !etat.res) return;
    const r = etat.res;
    valeurs.maj({
      inst:
        "t = " + nb(api, etat.t, 0) + " s : θ = " + nb(api, valeurA(r.y, etat.t), 1) + " K, uc = " + nb(api, valeurA(r.uc, etat.t), 1) +
        " %, us = " + nb(api, valeurA(r.us, etat.t), 1) + " %, xi = " + nb(api, valeurA(r.xi, etat.t), 1) + " %",
    });
  }

  function recalculer() {
    const res = simFour({ Kc: 2.551, Ti: 400, Td: 0, r: 50, tmax: TMAX, uMax: etat.reserve, uMin: -40, aw: etat.aw, Tt: etat.Tt });
    etat.res = res;
    if (trace) trace.definirDonnees("y", ecreter(res.t, res.y, 0, 70));
    if (commande) {
      commande.definirDonnees("uc", ecreter(res.t, res.uc, -20, 140));
      commande.definirDonnees("us", res.t.map((t, i) => [t, res.us[i]]));
      commande.definirDonnees("xi", ecreter(res.t, res.xi, -20, 140));
    }
    if (valeurs) {
      const m = mesures(res.t, res.y, 50);
      let finSat = -1;
      for (let i = 0; i < res.t.length; i += 1) if (res.us[i] >= etat.reserve - 1e-9) finSat = res.t[i];
      valeurs.maj({
        D: (m.D * 100 < 0.05 ? "aucun dépassement" : nb(api, m.D * 100, 1) + " %") + ", " + (Number.isFinite(m.t5) ? nb(api, m.t5, 0) + " s" : "au-delà de 1500 s") + " (linéaire : " + nb(api, linM.D * 100, 1) + " %, " + nb(api, linM.t5, 0) + " s)",
        sat: finSat < 0 ? "pas de saturation" : "à " + nb(api, finSat, 0) + " s, commande en butée depuis le départ",
      });
    }
    majInstant();
  }

  const curseurs = api.sim.curseurs(
    "#e-windup-curseurs",
    [
      { id: "reserve", libelle: "Réserve de puissance (butée haute)", min: 20, max: 100, pas: 1, valeur: etat.reserve, format: (v) => "+" + nb(api, v, 0) + " %" },
      { id: "aw", libelle: "Protection de l'intégrale", min: 0, max: 2, pas: 1, valeur: etat.aw, format: (v) => MODES_AW[v] },
      { id: "Tt", libelle: "Constante de recalcul $T_t$ (recalcul seulement)", min: 20, max: 1000, pas: 10, valeur: etat.Tt, format: (v) => nb(api, v, 0) + " s" },
    ],
    (v) => {
      etat.reserve = v.reserve;
      etat.aw = v.aw;
      etat.Tt = v.Tt;
      recalculer();
      if (trace) trace.demanderRendu();
      if (commande) commande.demanderRendu();
    }
  );
  if (curseurs) {
    ressources.push(curseurs);
    api.rendreMaths(curseurs.grille);
  }

  const lecteur = api.sim.lecteur("#e-windup-lecteur", {
    de: 0,
    a: TMAX,
    duree: 15,
    boucle: true,
    auto: false,
    libelle: "Instant observé sur les deux tracés",
    rappel: (t) => {
      etat.t = t;
      majInstant();
      if (trace) trace.demanderRendu();
      if (commande) commande.demanderRendu();
    },
  });
  if (lecteur) ressources.push(lecteur);
  recalculer();
}

/* --------------------------------------------------------------------------
   E. Simulation : Bode du PID filtré
   -------------------------------------------------------------------------- */

function pidFiltre(w, Kc, Ti, Td, N) {
  /* C = Kc (1 + 1/(j w Ti) + j w Td / (1 + j w Td/N)) */
  let re = 1;
  let im = -1 / (w * Ti);
  if (Td > 0) {
    const a = w * Td;
    const b = (w * Td) / N;
    /* j a / (1 + j b) = (j a (1 - j b)) / (1 + b²) = (a b + j a) / (1 + b²) */
    re += (a * b) / (1 + b * b);
    im += a / (1 + b * b);
  }
  return { re: Kc * re, im: Kc * im };
}

function construireBode(racine, api) {
  if (!racine.querySelector("#e-bode-trace")) return;
  const etat = { Td: 2, N: 10 };
  const Kc = 1;
  const Ti = 10;
  const valeurs = api.sim.valeurs("#e-bode-valeurs", [
    { id: "hf", libelle: "Gain haute fréquence Kc (1 + N)", format: (v) => v },
    { id: "phi", libelle: "Avance maximale de la partie PD, arcsin(N / (N + 2))", format: (v) => v },
    { id: "min", libelle: "Gain minimal du PID et pulsation", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const bode = api.sim.bode("#e-bode-trace", {
    titre: "PID filtré, Kc = 1, Ti = 10 s",
    fonction: (w) => pidFiltre(w, Kc, Ti, etat.Td, etat.N),
    fMin: 0.01,
    fMax: 1000,
    xTitre: "Pulsation",
    xUnite: "rad/s",
    gainMin: -10,
    gainMax: 50,
    phaseMin: -90,
    phaseMax: 90,
    coupure: etat.N / etat.Td,
    libelleCoupure: "N / Td",
  });
  if (bode) ressources.push(bode);

  function recalculer() {
    if (bode) {
      bode.definirFonction((w) => pidFiltre(w, Kc, Ti, etat.Td, etat.N));
      bode.definirCoupure(etat.Td > 0 ? etat.N / etat.Td : null);
    }
    if (!valeurs) return;
    let gMin = Infinity;
    let wMin = NaN;
    for (let i = 0; i <= 2000; i += 1) {
      const w = 10 ** (-2 + (5 * i) / 2000);
      const c = pidFiltre(w, Kc, Ti, etat.Td, etat.N);
      const g = Math.hypot(c.re, c.im);
      if (g < gMin) {
        gMin = g;
        wMin = w;
      }
    }
    if (etat.Td === 0) {
      valeurs.maj({ hf: "Kc = 0 dB (PI : pas de dérivée)", phi: "aucune", min: "Kc atteint aux hautes pulsations" });
      return;
    }
    valeurs.maj({
      hf: nb(api, Kc * (1 + etat.N), 1) + " soit " + nb(api, 20 * Math.log10(1 + etat.N), 1) + " dB",
      phi: nb(api, Math.asin(etat.N / (etat.N + 2)) * DEG, 1) + "°",
      min: nb(api, 20 * Math.log10(gMin), 2) + " dB vers " + nb(api, wMin, 3) + " rad/s",
    });
  }

  const curseurs = api.sim.curseurs(
    "#e-bode-curseurs",
    [
      { id: "Td", libelle: "Temps de dérivée $T_d$", min: 0, max: 5, pas: 0.1, valeur: etat.Td, format: (v) => (v === 0 ? "sans action dérivée" : nb(api, v, 1) + " s") },
      { id: "N", libelle: "Facteur de filtrage $N$", min: 2, max: 30, pas: 1, valeur: etat.N, format: (v) => nb(api, v, 0) },
    ],
    (v) => {
      etat.Td = v.Td;
      etat.N = v.N;
      recalculer();
    }
  );
  if (curseurs) {
    ressources.push(curseurs);
    api.rendreMaths(curseurs.grille);
  }
  recalculer();
}

/* --------------------------------------------------------------------------
   H. Réponses du four avec les trois correcteurs
   -------------------------------------------------------------------------- */

function construireReponsesExemple(racine, api) {
  if (!racine.querySelector("#h-reponses")) return;
  const tmax = 600;
  /* P : boucle fermée 19 / (16000 s² + 440 s + 20), échelon de 10 K */
  const rP = reponseIndicielle([19], [16000, 440, 20], tmax, 0.05, 20);
  /* PI : 5,102 / (16000 s² + 400 s + 5,102) */
  const rPI = reponseIndicielle([5.102], [16000, 400, 5.102], tmax, 0.05, 20);
  /* PID série filtré : 51,02 / (1600 s² + 400 s + 51,02) */
  const rPID = reponseIndicielle([51.02], [1600, 400, 51.02], tmax, 0.05, 20);
  const fois = (r, k) => r.t.map((t, i) => [t, k * r.y[i]]);
  const trace = api.sim.traceur("#h-reponses", {
    titre: "Échelon de consigne de 10 K : température",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "θ",
    yUnite: "K",
    xMin: 0,
    xMax: tmax,
    yMin: 0,
    yMax: 14,
    ratio: 0.42,
    series: [
      { id: "p", nom: "P, Kc = 9,5 %/K", points: fois(rP, 10) },
      { id: "pi", nom: "PI, Kc = 2,55 %/K, Ti = 400 s", points: fois(rPI, 10) },
      { id: "pid", nom: "PID série, Kc' = 25,5 %/K", points: fois(rPID, 10) },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 10, "consigne", [9, 5]);
    },
  });
  if (trace) ressources.push(trace);

  /* Commandes : u = Kc e pour le P ; pour le PI, u = Kc e + intégrale ; pour le PID, idem filtré. */
  function commandes() {
    const h = 0.05;
    const n = Math.round(tmax / h);
    const out = { t: [], p: [], pi: [], pid: [] };
    const sP = simFour({ Kc: 9.5, Ti: Infinity, Td: 0, r: 10, tmax, h, pasSortie: 20 });
    const sPI = simFour({ Kc: 2.551, Ti: 400, Td: 0, r: 10, tmax, h, pasSortie: 20 });
    /* PID série filtré : C = Kc'(1 + Ti's)(1 + Td's) / (Ti's (1 + Tf s)), simulé sur l'état. */
    let x1 = 0;
    let x2 = 0;
    let z1 = 0;
    let z2 = 0;
    const Kc = 25.51;
    const Ti = 400;
    const Td = 40;
    const Tf = 4;
    for (let k = 0; k <= n; k += 1) {
      const e = 10 - x2;
      /* réalisation : C = Kc' [Td/Tf + (b1 s + b0) / (Ti s (1 + Tf s))] avec reste calculé ci-dessous */
      /* numérateur (Ti s + 1)(Td s + 1) = Ti Td s² + (Ti + Td) s + 1 ; dénominateur Ti Tf s² + Ti s */
      const a2 = Ti * Tf;
      const a1 = Ti;
      const d0 = (Ti * Td) / a2;
      const r1 = Ti + Td - d0 * a1;
      const r0 = 1;
      /* reste (r1 s + r0) / (a2 s² + a1 s) : forme compagne z1' = z2, z2' = (e - a1 z2) / a2 */
      const u = Kc * (d0 * e + r1 * z2 + r0 * z1);
      if (k % 20 === 0) {
        out.t.push(k * h);
        out.pid.push(u);
      }
      const dz1 = z2;
      const dz2 = (e - a1 * z2) / a2;
      z1 += h * dz1;
      z2 += h * dz2;
      const dx1 = (FOUR.K * u - x1) / FOUR.t1;
      const dx2 = (x1 - x2) / FOUR.t2;
      x1 += h * dx1;
      x2 += h * dx2;
    }
    out.p = sP.uc;
    out.pi = sPI.uc;
    return out;
  }
  const u = commandes();
  const cmd = api.sim.traceur("#h-commandes", {
    titre: "Échelon de consigne de 10 K : commande",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "u",
    yUnite: "%",
    xMin: 0,
    xMax: tmax,
    yMin: -40,
    yMax: 120,
    ratio: 0.42,
    series: [
      { id: "p", nom: "P", points: u.t.map((t, i) => [t, u.p[i]]) },
      { id: "pi", nom: "PI", points: u.t.map((t, i) => [t, u.pi[i]]) },
      { id: "pid", nom: "PID série (tronquée)", points: ecreter(u.t, u.pid, -40, 120) },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 60, "réserve +60 %", [9, 5]);
    },
  });
  if (cmd) ressources.push(cmd);
}

/* --------------------------------------------------------------------------
   I. Simulation : réglage et anti-emballement de la régulation de pression
   -------------------------------------------------------------------------- */

function apresSoutirage(res) {
  let pMax = -Infinity;
  let dernier = -1;
  let ucMax = -Infinity;
  for (let i = 0; i < res.t.length; i += 1) {
    ucMax = Math.max(ucMax, res.uc[i]);
    if (res.t[i] < 35) continue;
    pMax = Math.max(pMax, res.y[i]);
    if (Math.abs(res.y[i]) > 0.05) dernier = i;
  }
  const retour = dernier < 0 ? 0 : dernier + 1 < res.t.length ? res.t[dernier + 1] - 35 : NaN;
  return { pMax, retour, ucMax };
}

function construirePression(racine, api) {
  if (!racine.querySelector("#i-pression-curseurs")) return;
  const etat = { Kc: 6, Ti: 1.2, d: 1.5, aw: 0 };

  const valeurs = api.sim.valeurs("#i-pression-valeurs", [
    { id: "marges", libelle: "Coupure, marges de phase, de gain et de module", format: (v) => v },
    { id: "consigne", libelle: "Échelon de consigne : dépassement et temps d'établissement", format: (v) => v },
    { id: "plateau", libelle: "Pendant le soutirage : fréquence réelle et écart de pression", format: (v) => v },
    { id: "retour", libelle: "Après le soutirage : surpression maximale, retour dans ±0,05 bar", format: (v) => v },
    { id: "uc", libelle: "Fréquence calculée maximale", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const options = { xTitre: "temps", xUnite: "s", xMin: 0, xMax: 60, ratio: 0.4 };
  const trace = api.sim.traceur("#i-pression-trace", {
    ...options,
    titre: "Écart de pression vraie",
    yTitre: "p",
    yUnite: "bar",
    yMin: -1,
    yMax: 1.5,
    series: [{ id: "p", nom: "pression vraie", points: [] }],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 0, "consigne", [9, 5]);
      ligneV(c, r, couleurs, 5, [2, 4]);
      ligneV(c, r, couleurs, 35, [2, 4]);
    },
  });
  if (trace) ressources.push(trace);
  const frequence = api.sim.traceur("#i-pression-frequence", {
    ...options,
    titre: "Fréquences du variateur",
    yTitre: "f",
    yUnite: "Hz",
    yMin: 30,
    yMax: 70,
    series: [
      { id: "uc", nom: "fréquence calculée fc", points: [] },
      { id: "ua", nom: "fréquence réelle fr", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, PR.fMax, "butée 50 Hz", [9, 5]);
      ligneV(c, r, couleurs, 5, [2, 4]);
      ligneV(c, r, couleurs, 35, [2, 4]);
    },
  });
  if (frequence) ressources.push(frequence);

  function recalculer() {
    const res = scenarioPression(etat.Kc, etat.Ti, etat.aw, etat.d);
    if (trace) trace.definirDonnees("p", tronquer(res.t, res.y, -1, 1.5));
    if (frequence) {
      frequence.definirDonnees("uc", ecreter(res.t, res.uc.map((u) => u + PR.f0), 30, 70));
      frequence.definirDonnees("ua", res.t.map((t, i) => [t, res.ua[i] + PR.f0]));
    }
    if (!valeurs) return;
    const K = etat.Kc * PR.Kg;
    const m = margesPression(K, etat.Ti);
    const instable = !(m.gm > 0);
    const c = instable ? null : consignePression(etat.Kc, etat.Ti);
    const a = apresSoutirage(res);
    let plateauF = 0;
    let plateauP = 0;
    let n = 0;
    for (let i = 0; i < res.t.length; i += 1) {
      if (res.t[i] >= 30 && res.t[i] < 35) {
        plateauF += res.ua[i];
        plateauP += res.y[i];
        n += 1;
      }
    }
    valeurs.maj({
      marges: instable
        ? "boucle instable : marge de gain négative"
        : nb(api, m.wc, 3) + " rad/s ; " + nb(api, m.pm, 1) + "° ; " + (Number.isFinite(m.gm) ? nb(api, m.gm, 1) + " dB" : "infinie") + " ; " + nb(api, m.mm, 3),
      consigne: instable ? "sans objet" : (c.D * 100 < 0.05 ? "aucun dépassement" : nb(api, c.D * 100, 1) + " %") + ", " + (Number.isFinite(c.t5) ? nb(api, c.t5, 2) + " s" : "au-delà de 30 s"),
      plateau: n ? nb(api, plateauF / n + PR.f0, 2) + " Hz, " + nb(api, plateauP / n, 3) + " bar" : "",
      retour: Number.isFinite(a.pMax) ? "+" + nb(api, Math.max(0, a.pMax), 3) + " bar, " + (Number.isFinite(a.retour) ? "en " + nb(api, a.retour, 1) + " s" : "pas avant 60 s") : "",
      uc: nb(api, a.ucMax + PR.f0, 1) + " Hz" + (a.ucMax + PR.f0 > PR.fMax + 0.01 ? " (au-delà de la butée)" : ""),
    });
  }

  const curseurs = api.sim.curseurs(
    "#i-pression-curseurs",
    [
      { id: "Kc", libelle: "Gain $K_c$", min: 1, max: 20, pas: 0.1, valeur: etat.Kc, format: (v) => nb(api, v, 1) + " Hz/bar" },
      { id: "Ti", libelle: "Temps d'intégrale $T_i$", min: 0.2, max: 5, pas: 0.05, valeur: etat.Ti, format: (v) => nb(api, v, 2) + " s" },
      { id: "d", libelle: "Soutirage (chute statique équivalente)", min: 0, max: 2, pas: 0.05, valeur: etat.d, format: (v) => nb(api, v, 2) + " bar" },
      { id: "aw", libelle: "Protection de l'intégrale", min: 0, max: 2, pas: 1, valeur: etat.aw, format: (v) => MODES_AW[v] + (v === 2 ? " sur fr, Tt = Ti/2" : "") },
    ],
    (v) => {
      Object.assign(etat, v);
      recalculer();
    }
  );
  if (curseurs) {
    ressources.push(curseurs);
    api.rendreMaths(curseurs.grille);
  }
  recalculer();
}

/* --------------------------------------------------------------------------
   K. Exercices
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-erreur-p",
      titre: "Fondamental 1 : erreur d'un correcteur proportionnel",
      niveau: "fondamental",
      enonce:
        "<p>Un procédé du premier ordre $G(s) = \\dfrac{2}{1 + 10s}$ est commandé par un correcteur proportionnel $K_c = 4$, retour unitaire. Quelle est " +
        "l'erreur statique, en pour cent de la consigne, pour un échelon ? Quelle est la constante de temps de la boucle fermée ?</p>",
      valeur: 100 / 9,
      unite: "%",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Erreur statique",
      etapes: [
        { texte: "Gain statique de boucle $K_cK_0 = 4 \\times 2 = 8$." },
        { texte: "$\\varepsilon_\\infty/r_0 = 1/(1 + 8) = 0{,}111$, soit $11{,}1\\ \\%$." },
        { texte: "Boucle fermée : $\\dfrac{8}{10s + 9} = \\dfrac{0{,}889}{1 + 1{,}11s}$ : constante de temps $10/9 = 1{,}11\\ \\mathrm{s}$, neuf fois plus courte qu'en boucle ouverte.", note: "Rapidité et précision progressent ensemble avec $K_c$, mais l'erreur ne s'annule jamais." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réponse indicielle unité de la boucle fermée",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "y",
          yUnite: "",
          xMin: 0,
          xMax: 8,
          yMin: 0,
          yMax: 1.1,
          series: [{ id: "y", nom: "Kc = 4", fonction: (t) => (8 / 9) * (1 - Math.exp((-9 * t) / 10)) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 1, "consigne", [9, 5]);
            ligneH(c, r, couleurs, 8 / 9, "0,889 : erreur 11,1 %", [2, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-conversion",
      titre: "Fondamental 2 : de la forme parallèle à la forme standard",
      niveau: "fondamental",
      enonce:
        "<p>Un automate affiche un PID de forme parallèle : $K_p = 2$, $K_i = 0{,}5\\ \\mathrm{s^{-1}}$, $K_d = 0{,}8\\ \\mathrm{s}$. Quel temps d'intégrale $T_i$, " +
        "en secondes, faut-il saisir dans un régulateur de forme standard pour obtenir le même correcteur ? Donnez aussi $T_d$.</p>",
      valeur: 4,
      unite: "s",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Ti",
      etapes: [
        { texte: "Identification : $K_p + K_i/s + K_ds = K_c(1 + 1/(T_is) + T_ds)$, donc $K_c = K_p = 2$." },
        { texte: "$K_c/T_i = K_i$ : $T_i = K_p/K_i = 2/0{,}5 = 4\\ \\mathrm{s}$." },
        { texte: "$K_cT_d = K_d$ : $T_d = K_d/K_p = 0{,}8/2 = 0{,}4\\ \\mathrm{s}$.", note: "Contrôle : $T_i = 4\\ \\mathrm{s} \\ge 4T_d = 1{,}6\\ \\mathrm{s}$ : une forme série équivalente existe aussi." },
      ],
      visuelCorrection: correctionEtapes(
        ["parallèle : Kp + Ki / s + Kd s", "standard  : Kc (1 + 1/(Ti s) + Td s)", "Kc = Kp = 2", "Ti = Kp / Ki = 2 / 0,5 = 4 s", "Td = Kd / Kp = 0,8 / 2 = 0,4 s"],
        "Conversion terme à terme, unités comprises."
      ),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-pi-compensation",
      titre: "Intermédiaire 1 : régler un PI par compensation",
      niveau: "intermédiaire",
      enonce:
        "<p>Un procédé vaut $G(s) = \\dfrac{4}{(1 + 8s)(1 + 0{,}5s)}$. On choisit un PI de forme standard qui compense le pôle dominant. Quelle valeur de $K_c$ " +
        "donne un amortissement $\\zeta = 0{,}7$ en boucle fermée ?</p>",
      valeur: 1 / (1.96 * 0.5) * 8 / 4,
      unite: "",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "Kc",
      etapes: [
        { texte: "$T_i = 8\\ \\mathrm{s}$ : $L(s) = \\dfrac{4K_c}{8s(1 + 0{,}5s)}$, donc $\\tau_r = 0{,}5\\ \\mathrm{s}$." },
        { texte: "Polynôme caractéristique : $8s(1 + 0{,}5s) + 4K_c = 4s^2 + 8s + 4K_c$, soit $s^2 + 2s + K_c$ après division par $4$." },
        { texte: "Identification : $2\\zeta\\omega_0 = 2$ donne $\\omega_0 = 1/0{,}7 = 1{,}429\\ \\mathrm{rad/s}$, puis $K_c = \\omega_0^2 = 2{,}04$. Même résultat par la formule générale $K = 4K_c = T_i/(4\\zeta^2\\tau_r) = 8/(1{,}96 \\times 0{,}5) = 8{,}163$." },
        { texte: "Contrôle : marge de phase $65{,}2^\\circ$, dépassement $4{,}6\\ \\%$, temps d'établissement simulé $2{,}03\\ \\mathrm{s}$.", note: "Le polynôme $4s^2 + 8s + 8{,}163$ donne bien $\\omega_0 = 1{,}429$ et $\\zeta = 8/(2 \\times 4 \\times 1{,}429) = 0{,}70$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const r = reponseIndicielle([8.163], [4, 8, 8.163], 6, 0.002, 5);
        traceCorrection(moteur, conteneur, {
          titre: "Réponse indicielle avec Kc = 2,04 et Ti = 8 s",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "y",
          yUnite: "",
          xMin: 0,
          xMax: 6,
          yMin: 0,
          yMax: 1.2,
          series: [{ id: "y", nom: "ζ = 0,7", points: r.t.map((t, i) => [t, r.y[i]]) }],
          surDessin({ c, repere: rr, couleurs }) {
            ligneH(c, rr, couleurs, 1.05, "", [2, 4]);
            ligneH(c, rr, couleurs, 0.95, "bande de 5 %", [2, 4]);
            ligneV(c, rr, couleurs, 2.03, [6, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-recalcul",
      titre: "Intermédiaire 2 : commande calculée pendant une saturation",
      niveau: "intermédiaire",
      enonce:
        "<p>Un PI de four, $K_c = 2\\ \\%/\\mathrm{K}$ et $T_i = 400\\ \\mathrm{s}$, est protégé par recalcul de l'intégrale avec $T_t = 200\\ \\mathrm{s}$. Pendant une " +
        "longue saturation à $100\\ \\%$, l'écart reste voisin de $10\\ \\mathrm{K}$. De combien de points de pour cent la commande calculée $u_c$ dépasse-t-elle " +
        "la butée, une fois l'état intégral stabilisé ?</p>",
      valeur: 10,
      unite: "%",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "uc - us",
      etapes: [
        { texte: "$\\dot x_i = K_ce/T_i + (u_s - u_c)/T_t$ ; l'état intégral est stabilisé quand $\\dot x_i = 0$." },
        { texte: "$u_c - u_s = T_tK_ce/T_i = 200 \\times 2 \\times 10/400 = 10$ points." },
        { texte: "Sans protection, $u_c$ croîtrait de $K_ce/T_i = 0{,}05\\ \\%/\\mathrm{s}$, soit $3\\ \\%$ par minute, sans limite.", note: "Dimension : secondes fois $\\%/\\mathrm{K}$ fois kelvins sur secondes, des pour cent." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Commande calculée pendant la saturation, écart constant de 10 K",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "uc",
          yUnite: "%",
          xMin: 0,
          xMax: 1200,
          yMin: 90,
          yMax: 160,
          series: [
            { id: "s", nom: "sans protection", fonction: (t) => 100 + 0.05 * t },
            { id: "r", nom: "recalcul, Tt = 200 s", fonction: (t) => 100 + 10 * (1 - Math.exp(-t / 200)) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 100, "butée", [9, 5]);
            ligneH(c, r, couleurs, 110, "+10 points", [2, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-pid-serie",
      titre: "Avancé : PID série et petites constantes de temps",
      niveau: "avancé",
      enonce:
        "<p>Un procédé vaut $G(s) = \\dfrac{1}{(1 + 5s)(1 + s)(1 + 0{,}2s)}$. On choisit un PID série $K_c'\\dfrac{(1 + T_i's)(1 + T_d's)}{T_i's(1 + T_fs)}$ avec " +
        "$T_i' = 5\\ \\mathrm{s}$, $T_d' = 1\\ \\mathrm{s}$ et $N = 10$. En regroupant les petites constantes de temps restantes en une seule, quelle valeur de " +
        "$K_c'$ vise $\\zeta = 0{,}7$ ? Donnez ensuite la forme standard équivalente.</p>",
      valeur: 5 / (1.96 * 0.3),
      unite: "",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Kc'",
      etapes: [
        { texte: "Zéros sur $-1/5$ et $-1$ : il reste $L(s) = \\dfrac{K_c'}{5s(1 + 0{,}2s)(1 + 0{,}1s)}$, avec $T_f = T_d'/N = 0{,}1\\ \\mathrm{s}$." },
        { texte: "Somme des petites constantes : $\\tau_r \\approx 0{,}2 + 0{,}1 = 0{,}3\\ \\mathrm{s}$, approximation valable sous la coupure." },
        { texte: "$K_c' = T_i'/(4\\zeta^2\\tau_r) = 5/(1{,}96 \\times 0{,}3) = 8{,}50$." },
        { texte: "Forme standard : $K_c = 8{,}50 \\times 6/5 = 10{,}2$, $T_i = 6\\ \\mathrm{s}$, $T_d = 5 \\times 1/6 = 0{,}833\\ \\mathrm{s}$." },
        { texte: "Contrôle exact : $\\omega_c = 1{,}60\\ \\mathrm{rad/s}$, $M_\\varphi = 63{,}2^\\circ$, $M_G = 18{,}9\\ \\mathrm{dB}$, dépassement $4{,}95\\ \\%$, $t_5 = 1{,}14\\ \\mathrm{s}$.", note: "Le regroupement coûte deux degrés de marge par rapport aux $65{,}2^\\circ$ du second ordre exact." },
      ],
      visuelCorrection(conteneur, moteur) {
        const Kc = 5 / (1.96 * 0.3);
        const den = polyAdd([0.1, 1.5, 5, 0], [Kc]);
        const r = reponseIndicielle([Kc], den, 4, 0.001, 5);
        traceCorrection(moteur, conteneur, {
          titre: "Réponse indicielle de la boucle avec le PID série",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "y",
          yUnite: "",
          xMin: 0,
          xMax: 4,
          yMin: 0,
          yMax: 1.2,
          series: [{ id: "y", nom: "Kc' = 8,50", points: r.t.map((t, i) => [t, r.y[i]]) }],
          surDessin({ c, repere: rr, couleurs }) {
            ligneH(c, rr, couleurs, 1.0495, "+4,95 %", [2, 4]);
            ligneH(c, rr, couleurs, 1, "", [9, 5]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-diagnostic",
      titre: "Diagnostic industriel : surpression après un fort soutirage",
      niveau: "diagnostic",
      enonce:
        "<p>Sur la tendance de la régulation de pression, on observe : pendant un remplissage de cuve de trente secondes, variateur à $50\\ \\mathrm{Hz}$ et pression " +
        "sous la consigne ; dans le superviseur, la sortie du bloc PID affiche une consigne de fréquence de $98\\ \\mathrm{Hz}$ ; à l'arrêt du remplissage, le " +
        "variateur reste plusieurs secondes à $50\\ \\mathrm{Hz}$ et la pression dépasse la consigne de plus d'un bar. Quelles conclusions et actions sont " +
        "justifiées ?</p>",
      multiple: true,
      options: [
        { texte: "L'intégrale s'est emballée pendant la saturation : il faut activer un anti-emballement, de préférence par recalcul sur la fréquence réelle.", juste: true },
        { texte: "Une sortie de PID au-delà de la plage du variateur est en soi le signe que le bloc ne borne pas son intégrale.", juste: true },
        { texte: "Il faut réduire $T_i$ pour que l'intégrale se vide plus vite." },
        { texte: "La boucle est linéairement instable : il faut diviser $K_c$ par deux." },
        { texte: "Une partie du dépassement restera due à la rampe de décélération du variateur, même avec la protection.", juste: true },
      ],
      etapes: [
        { texte: "Symptôme typique de l'emballement : actionneur en butée, sortie du correcteur hors plage, dépassement au retour et actionneur qui reste en butée alors que l'écart a changé de signe." },
        { texte: "Réduire $T_i$ fait croître l'intégrale plus vite pendant la saturation et réduit la marge de phase : c'est l'inverse de l'effet recherché." },
        { texte: "Hors saturation, la boucle est stable et bien amortie : ce n'est pas une instabilité linéaire." },
        { texte: "Avec la protection, la surpression tombe de $1{,}16$ à environ $0{,}4\\ \\mathrm{bar}$ ; le reste vient de la rampe de $5\\ \\mathrm{Hz/s}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const a = scenarioPression(6, 1.2, 0, 1.5);
        const b = scenarioPression(6, 1.2, 2, 1.5);
        traceCorrection(moteur, conteneur, {
          titre: "Pression vraie, soutirage de 1,5 bar de 5 à 35 s",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "p",
          yUnite: "bar",
          xMin: 0,
          xMax: 60,
          yMin: -0.6,
          yMax: 1.4,
          series: [
            { id: "a", nom: "sans protection", points: a.t.map((t, i) => [t, a.y[i]]) },
            { id: "b", nom: "recalcul sur fr", points: b.t.map((t, i) => [t, b.y[i]]) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0, "consigne", [9, 5]);
            ligneV(c, r, couleurs, 35, [2, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-conceptuel",
      titre: "Question conceptuelle : ce que garantit l'intégrale",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi une action intégrale annule l'erreur statique pour un échelon de consigne ou de perturbation quel que soit son " +
        "réglage, à quelle condition, et quel prix on paie pour cette garantie.</p>",
      motsCles: [
        ["equilibre", "constant", "regime permanent", "stationnaire"],
        ["ecart nul", "erreur nulle", "e = 0", "s'arrete", "cesse", "ne varie plus"],
        ["stable", "stabilite", "converge"],
        ["phase", "retard", "-90", "depassement", "oscill", "lent", "emballement", "saturation"],
      ],
      minimum: 3,
      exemple: "Trois ou quatre phrases : équilibre, écart nul, condition de stabilité, prix en phase ou en saturation.",
      etapes: [
        { texte: "À l'équilibre, toutes les grandeurs sont constantes, donc la commande aussi." },
        { texte: "Or la commande contient l'intégrale de l'écart, qui ne reste constante que si l'écart est nul : l'équilibre impose $e = 0$, quels que soient $K_c$ et $T_i$." },
        { texte: "Condition : que la boucle converge vers un équilibre, c'est-à-dire qu'elle soit stable, et que l'actionneur ne soit pas en butée." },
        { texte: "Prix : un retard de phase jusqu'à $-90^\\circ$, donc moins de marge et plus de dépassement, et l'emballement en cas de saturation." },
      ],
      visuelCorrection: correctionEtapes(
        ["équilibre : u constante", "u contient ∫ e dt : constante seulement si e = 0", "condition : boucle stable, actionneur hors butée", "prix : phase -90° aux basses fréquences", "prix : emballement si saturation"],
        "L'intégrale ne s'arrête que sur un écart nul."
      ),
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

const COURBES_QUIZ = [
  { nom: "A", f: (t) => 0.8 * (1 - Math.exp(-t) * (Math.cos(2 * t) + 0.5 * Math.sin(2 * t))), lx: 9.2 },
  { nom: "B", f: (t) => 1 - Math.exp(-1.4 * t) * (Math.cos(1.428 * t) + 0.98 * Math.sin(1.428 * t)), lx: 7.6 },
  { nom: "C", f: (t) => 1 - Math.exp(-0.3 * t) * (Math.cos(2 * t) + 0.15 * Math.sin(2 * t)), lx: 2.6 },
];

function dessinCourbesQuiz(id) {
  const X = (t) => 60 + 52 * t;
  const Y = (y) => 260 - 130 * y;
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.4">';
  s += '<path d="M60 262V24" marker-end="url(#' + id + ')"/><path d="M58 260H588" marker-end="url(#' + id + ')"/>';
  s += '<path d="M60 ' + Y(1) + 'H580" stroke-dasharray="8 5" stroke-width="1"/>';
  const styles = ["", ' stroke-dasharray="10 5"', ' stroke-dasharray="2 4"'];
  COURBES_QUIZ.forEach((c, k) => {
    let d = "";
    for (let i = 0; i <= 200; i += 1) {
      const t = (10 * i) / 200;
      d += (i ? "L" : "M") + X(t).toFixed(1) + " " + Y(c.f(t)).toFixed(1);
    }
    s += '<path d="' + d + '" stroke-width="2.4"' + styles[k] + "/>";
  });
  s += "</g>" + ECRITS;
  s += texte(590, 276, "t", ' text-anchor="end"') + texte(66, 30, "y") + texte(52, Y(1) + 4, "1", ' text-anchor="end"');
  COURBES_QUIZ.forEach((c) => {
    s += texte(X(c.lx), Y(c.f(c.lx)) - 14, c.nom, ' font-weight="700" font-size="15" text-anchor="middle"');
  });
  s += texte(580, 292, "consigne unité en tirets fins", ' text-anchor="end" font-size="10"') + "</g>";
  return s;
}

function zonesCourbesQuiz() {
  const X = (t) => 60 + 52 * t;
  const Y = (y) => 260 - 130 * y;
  const etiquettes = ["courbe A", "courbe B", "courbe C"];
  return COURBES_QUIZ.map((c, k) => ({ cx: X(c.lx), cy: Y(c.f(c.lx)) - 18, r: 24, etiquette: etiquettes[k], juste: k === 0 }));
}

const VISUELS_QUIZ = [
  etapes(["P : erreur r0 / (1 + Kc K0), non nulle", "I : équilibre seulement si e = 0", "D : nulle en régime permanent"], "Seule l'intégrale annule l'erreur statique."),
  etapes(["échelon de consigne : e saute de r0", "dérivée de l'écart : impulsion", "dérivée filtrée : pic Kc N r0"], "Le coup de dérivée."),
  etapes(["Kc K0 = 2,25 × 4 = 9", "ε∞ = 1 / (1 + 9)", "= 0,1 V"], "Erreur d'un correcteur proportionnel."),
  etapes(["actionneur en butée : boucle ouverte", "l'intégrale continue de croître", "dépassement et retour lent au déblocage"], "Emballement de l'intégrale."),
  etapes(["|C(j∞)| = Kc (1 + N)", "= 3 × (1 + 8)", "= 27"], "Gain haute fréquence du PID filtré."),
  () => ({ viewBox: "0 0 600 300", dessin: dessinCourbesQuiz("fl-qv5"), legende: "A s'établit sous la consigne : erreur statique, signature d'un correcteur proportionnel seul." }),
  etapes(["Kc = Kc' (Ti' + Td') / Ti' = 2 × 12,5 / 10 = 2,5", "Ti = Ti' + Td' = 12,5 s", "Td = Ti' Td' / (Ti' + Td') = 2 s"], "Conversion série vers standard."),
  etapes(["Ti petit : zéro 1/Ti près de ωc", "phase retirée à ωc : marge réduite", "dépassement, puis instabilité"], "Réduire Ti n'est pas sans risque."),
  etapes(["K = Ti / (4 ζ² τr)", "= 60 / (1,96 × 5)", "= 6,12"], "Gain de boucle par compensation."),
  etapes(["sin φm = N / (N + 2) = 10 / 12", "φm = arcsin(0,8333)", "= 56,4°"], "Avance maximale de la dérivée filtrée."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Pour un procédé stable sans intégrateur, quelle action annule l'erreur statique pour un échelon de consigne ?</p>",
        options: ["l'action proportionnelle, si le gain est assez grand", "l'action intégrale", "l'action dérivée", "aucune action ne le peut"],
        bonnes: [1],
        explication: "L'équilibre exige une intégrale constante, donc un écart nul ; l'action proportionnelle réduit l'erreur à $r_0/(1 + K_cK_0)$ sans l'annuler.",
        resume: "Rôle de l'intégrale",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Une action dérivée appliquée à l'écart produit un pic de commande à chaque échelon de consigne.</p>",
        reponse: true,
        explication: "L'écart saute de $r_0$ ; sa dérivée filtrée produit un pic de hauteur $K_cNr_0$. D'où la dérivée appliquée à la mesure.",
        resume: "Coup de dérivée",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Un procédé de gain statique $K_0 = 4$ est commandé par un correcteur proportionnel $K_c = 2{,}25$. Erreur statique, en volts, pour un échelon de consigne de $1\\ \\mathrm{V}$ ?</p>",
        valeur: 0.1,
        unite: "V",
        tolerance: 0.01,
        explication: "$\\varepsilon_\\infty = 1/(1 + 2{,}25 \\times 4) = 1/10 = 0{,}1\\ \\mathrm{V}$.",
        resume: "Erreur statique",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Qu'appelle-t-on emballement de l'intégrale, et quelle en est la conséquence ?</p>",
        motsCles: [["satur", "butee", "limite"], ["integr", "croit", "accumul", "augmente"], ["depassement", "lent", "retour", "oscill"]],
        minimum: 2,
        explication: "Quand l'actionneur est en butée, l'intégrale continue de croître alors que la commande appliquée ne change plus ; au retour, il faut d'abord la vider : dépassement important et retour lent.",
        resume: "Emballement",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Un PID filtré de forme standard a $K_c = 3$ et $N = 8$. Quel est son gain en haute fréquence ?</p>",
        valeur: 27,
        unite: "",
        tolerance: 0.01,
        explication: "$|C(j\\infty)| = K_c(1 + N) = 3 \\times 9 = 27$, soit $28{,}6\\ \\mathrm{dB}$ : le bruit de mesure est amplifié neuf fois plus qu'avec le seul gain $K_c$.",
        resume: "Gain haute fréquence",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Ces trois réponses indicielles sont obtenues sur le même procédé stable, sans intégrateur. Laquelle est produite par un correcteur proportionnel seul ?</p>",
        consigne: "Cliquez sur la lettre de la courbe correspondante.",
        viewBox: "0 0 600 300",
        dessin: dessinCourbesQuiz("fl-q5"),
        zones: zonesCourbesQuiz(),
        explication: "A, en trait plein, se stabilise à $0{,}8$ : il reste une erreur statique de $20\\ \\%$, signature d'un correcteur sans intégrale. B, en tirets, et C, en pointillé, rejoignent la consigne ; C oscille longuement, intégrale trop forte.",
        resume: "Lecture de réponses",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Un PID série a $K_c' = 2$, $T_i' = 10\\ \\mathrm{s}$ et $T_d' = 2{,}5\\ \\mathrm{s}$. Quelle est la forme standard équivalente ?</p>",
        options: ["$K_c = 2$, $T_i = 10\\ \\mathrm{s}$, $T_d = 2{,}5\\ \\mathrm{s}$", "$K_c = 2{,}5$, $T_i = 12{,}5\\ \\mathrm{s}$, $T_d = 2\\ \\mathrm{s}$", "$K_c = 2{,}5$, $T_i = 7{,}5\\ \\mathrm{s}$, $T_d = 2{,}5\\ \\mathrm{s}$", "$K_c = 1{,}6$, $T_i = 12{,}5\\ \\mathrm{s}$, $T_d = 2\\ \\mathrm{s}$"],
        bonnes: [1],
        explication: "$K_c = 2 \\times 12{,}5/10 = 2{,}5$ ; $T_i = 10 + 2{,}5 = 12{,}5\\ \\mathrm{s}$ ; $T_d = 10 \\times 2{,}5/12{,}5 = 2\\ \\mathrm{s}$.",
        resume: "Conversion de forme",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Réduire le temps d'intégrale $T_i$ accélère toujours la boucle, sans risque pour la stabilité.</p>",
        reponse: false,
        explication: "Un $T_i$ petit rapproche le zéro $1/T_i$ de la coupure et retire de la phase : dépassement accru, puis instabilité. Sur la boucle de pression, $T_i = 0{,}3\\ \\mathrm{s}$ ramène la marge de phase de $82{,}3$ à $37{,}5^\\circ$.",
        resume: "Effet de Ti",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Un PI compense une constante de temps dominante de $60\\ \\mathrm{s}$ ; il reste $\\tau_r = 5\\ \\mathrm{s}$. Quel gain de boucle $K = K_cK_0$ donne $\\zeta = 0{,}7$ ?</p>",
        valeur: 60 / (1.96 * 5),
        unite: "",
        tolerance: 0.02,
        explication: "$K = T_i/(4\\zeta^2\\tau_r) = 60/(1{,}96 \\times 5) = 6{,}12$.",
        resume: "Réglage par compensation",
      },
      {
        type: "calcul",
        enonce: repere(9) + "<p>Avance de phase maximale, en degrés, apportée par la partie PD d'un correcteur à dérivée filtrée avec $N = 10$ ?</p>",
        valeur: Math.asin(10 / 12) * DEG,
        unite: "°",
        tolerance: 0.01,
        explication: "$\\sin\\varphi_m = N/(N + 2) = 10/12$, donc $\\varphi_m = 56{,}4^\\circ$, obtenue à $\\omega_m = 1/(T_f\\sqrt{1 + N})$.",
        resume: "Avance de phase",
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
      { categorie: "Proportionnel", question: "Quelle erreur statique laisse un correcteur P sur un procédé de gain $K_0$ ?", reponse: "$\\varepsilon_\\infty = r_0/(1 + K_cK_0)$ : elle diminue avec le gain sans jamais s'annuler." },
      { categorie: "Intégral", question: "Pourquoi l'intégrale annule-t-elle l'erreur statique ?", reponse: "À l'équilibre, la commande est constante ; elle contient $\\int e\\,dt$, qui ne reste constante que si $e = 0$. Condition : boucle stable et actionneur hors butée." },
      { categorie: "Intégral", question: "Que signifie physiquement $T_i$ ?", reponse: "Pour un écart constant, la contribution intégrale égale la contribution proportionnelle au bout de $T_i$. Unités : secondes, minutes, ou répétitions par minute." },
      { categorie: "Dérivé", question: "Que fait l'action dérivée ?", reponse: "Elle agit sur l'écart prévu $T_d$ secondes plus tard : $e + T_d\\dot e \\approx e(t + T_d)$. Elle apporte de l'avance de phase, donc de l'amortissement." },
      { categorie: "Dérivée filtrée", question: "Pourquoi filtrer la dérivée, et avec quel $N$ ?", reponse: "La dérivée idéale a un gain infini en haute fréquence. Filtrée par $1/(1 + T_ds/N)$, le gain plafonne à $K_c(1 + N)$ ; $N$ de $5$ à $20$." },
      { categorie: "Consigne", question: "Pourquoi dériver la mesure plutôt que l'écart ?", reponse: "Un échelon de consigne donnerait un pic de commande $K_cNr_0$. Dériver $-y_m$ garde les mêmes pôles et adoucit la réponse à la consigne." },
      { categorie: "Formes", question: "Comment passer de la forme parallèle à la forme standard ?", reponse: "$K_c = K_p$, $T_i = K_p/K_i$, $T_d = K_d/K_p$. Vérifier l'unité de $K_i$ : $\\mathrm{s^{-1}}$ ou $\\mathrm{min^{-1}}$." },
      { categorie: "Réglage", question: "Règle de réglage par compensation ?", reponse: "$T_i$ sur la constante dominante, puis $K = T_i/(4\\zeta^2\\tau_r)$ ; pour $\\zeta = 0{,}7$, $M_\\varphi \\approx 65^\\circ$ et $D = 4{,}6\\ \\%$." },
      { categorie: "Saturation", question: "Qu'est-ce que l'emballement de l'intégrale ?", reponse: "En butée, la boucle est ouverte et l'intégrale croît sans effet ; au retour, dépassement et actionneur bloqué en butée tant qu'elle ne s'est pas vidée." },
      { categorie: "Anti-emballement", question: "Comment choisir entre blocage et recalcul ?", reponse: "Blocage : simple. Recalcul $\\dot x_i = K_ce/T_i + (u_s - u_c)/T_t$, $T_t$ entre $T_d$ et $T_i$ : utilise la commande réelle, couvre rampes, limitations et passage sans à-coup." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["ẋi = 0 : uc - us = Tt Kc e / Ti", "= 1 × 4 × 0,5 / 2", "= 1"], "Écart à la butée avec recalcul."),
  etapes(["PI de Ziegler et Nichols", "Kc = 0,45 × 10 = 4,5", "Ti = Tu / 1,2 = 2 / 1,2 = 1,67 s"], "Règle de l'essai en boucle fermée."),
  etapes(["Ti = τ1 : zéro sur le pôle", "consigne : le pôle disparaît de r vers y", "perturbation d'entrée : G / (1 + L) garde 1/(1 + τ1 s)"], "Le pôle compensé reste dans la réponse aux perturbations."),
  etapes(["s³ + 2s² + 3s + K", "a2 a1 > a3 a0 : 2 × 3 > K", "K crit = 6"], "Gain critique par Routh."),
  etapes(["MG ≥ 1 / (1 - Mm) = 1 / 0,6", "= 1,667", "20 log10(1,667) = 4,44 dB"], "Marge de gain garantie par la marge de module."),
  etapes(["Tj = Ta + P (Rjc + Rch + Rha)", "= 40 + 150 × (0,12 + 0,05 + 0,18)", "= 40 + 52,5 = 92,5 °C"], "Chaîne thermique en régime permanent."),
  etapes(["ΔU ≈ I2 (Rs cos φ + Xs sin φ)", "= 800 × (0,004 × 0,8 + 0,012 × 0,6)", "= 800 × 0,0104 = 8,32 V"], "Chute de tension de Kapp."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Un PI à recalcul, $K_c = 4$, $T_i = 2\\ \\mathrm{s}$, $T_t = 1\\ \\mathrm{s}$, reste saturé avec un écart constant $e = 0{,}5$. De combien la commande calculée dépasse-t-elle la butée, une fois stabilisée ?</p>",
        valeur: 1,
        unite: "",
        tolerance: 0.01,
        explication: "$u_c - u_s = T_tK_ce/T_i = 1 \\times 4 \\times 0{,}5/2 = 1$, dans l'unité de la commande.",
        resume: "Recalcul",
      },
      {
        type: "qcm",
        enonce: repere(1) + "<p>Cette séance. Un essai donne $K_{cu} = 10$ et $T_u = 2\\ \\mathrm{s}$. Quel PI propose la règle de Ziegler et Nichols en boucle fermée ?</p>",
        options: ["$K_c = 4{,}5$, $T_i = 1{,}67\\ \\mathrm{s}$", "$K_c = 6$, $T_i = 1\\ \\mathrm{s}$", "$K_c = 5$, $T_i = 2\\ \\mathrm{s}$", "$K_c = 4{,}5$, $T_i = 2{,}4\\ \\mathrm{s}$"],
        bonnes: [0],
        explication: "$K_c = 0{,}45K_{cu} = 4{,}5$ et $T_i = T_u/1{,}2 = 1{,}67\\ \\mathrm{s}$ : réglage nerveux, à vérifier par les marges.",
        resume: "Ziegler et Nichols",
      },
      {
        type: "vraiFaux",
        enonce: repere(2) + "<p>Cette séance. Un pôle compensé par le zéro du PI disparaît aussi de la réponse à une perturbation entrant à l'entrée du procédé.</p>",
        reponse: false,
        explication: "La fonction de transfert perturbation vers sortie vaut $G/(1 + L)$ : le pôle de $G$ y reste. C'est pourquoi le four met environ $900\\ \\mathrm{s}$ à rattraper l'ouverture de sa porte.",
        resume: "Compensation et perturbations",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours précédent. Polynôme caractéristique $s^3 + 2s^2 + 3s + K$, $K &gt; 0$. Gain critique $K$ ?</p>",
        valeur: 6,
        unite: "",
        tolerance: 0.01,
        explication: "Condition du troisième degré $a_2a_1 &gt; a_3a_0$ : $6 &gt; K$. À $K = 6$, oscillation à $\\omega = \\sqrt{3} = 1{,}73\\ \\mathrm{rad/s}$.",
        resume: "Routh",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Cours précédent. Une boucle a une marge de module $M_m = 0{,}4$. Quelle marge de gain minimale, en décibels, est garantie ?</p>",
        valeur: 20 * Math.log10(1 / 0.6),
        unite: "dB",
        tolerance: 0.01,
        explication: "$M_G \\ge 1/(1 - M_m) = 1{,}667$, soit $4{,}44\\ \\mathrm{dB}$ : sous la règle usuelle de $6\\ \\mathrm{dB}$.",
        resume: "Marge de module",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours vieux d'une semaine. Un module dissipe $150\\ \\mathrm{W}$ ; $R_{jc} = 0{,}12$, $R_{ch} = 0{,}05$ et $R_{ha} = 0{,}18\\ \\mathrm{K/W}$ ; air à $40\\ ^\\circ\\mathrm{C}$. Température de jonction en régime permanent, en degrés Celsius ?</p>",
        valeur: 92.5,
        unite: "°C",
        tolerance: 0.01,
        explication: "$T_j = 40 + 150 \\times 0{,}35 = 92{,}5\\ ^\\circ\\mathrm{C}$ : les résistances thermiques en série s'additionnent.",
        resume: "Chaîne thermique",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours vieux d'un mois. Transformateur ramené au secondaire : $R_s = 4\\ \\mathrm{m\\Omega}$, $X_s = 12\\ \\mathrm{m\\Omega}$ ; charge de $800\\ \\mathrm{A}$ à $\\cos\\varphi = 0{,}8$ inductif. Chute de tension approchée de Kapp, en volts ?</p>",
        valeur: 8.32,
        unite: "V",
        tolerance: 0.01,
        explication: "$\\Delta U \\approx I_2(R_s\\cos\\varphi + X_s\\sin\\varphi) = 800 \\times (0{,}0032 + 0{,}0072) = 8{,}32\\ \\mathrm{V}$.",
        resume: "Chute de tension",
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
    titre: "Où en suis-je sur les correcteurs P, PI, PD et PID ?",
  });
  if (auto) ressources.push(auto);
}
