/* ==========================================================================
   cours/criteres-de-stabilite/cours.js
   Critères de stabilité : pôle déplaçable et mode temporel, lieu des pôles
   de la boucle de position avec tableau de Routh en direct, diagramme de
   Nyquist avec gain et retard, réponses autour du gain critique, domaine de
   stabilité de la régulation de pression, exercices, quiz, cartes, révision
   et bilan.
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
const T12 = A2 / A0; /* tau1 tau2 = 4,046e-6 s² */
const TS = A1 / A0; /* tau1 + tau2 = 4,862 ms */
const DELTA = Math.sqrt(TS * TS - 4 * T12);
const TAU1 = (TS + DELTA) / 2; /* 3,797 ms */
const TAU2 = (TS - DELTA) / 2; /* 1,066 ms */
const KV_CRIT = TS / T12; /* 1201,8 s^-1 */

/* Régulation de pression : modèle supposé du projet. */
const PR = { Kg: 0.15, th: 1.2, tc: 0.13, T: 0.05 };

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

const EXPOSANTS = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };

/** Écriture scientifique lisible : 4,046 × 10⁻⁶. */
function sci(api, v, chiffres = 4) {
  if (!Number.isFinite(v)) return "indéfini";
  if (v === 0) return "0";
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e <= 4) {
    const dec = Math.max(0, Math.min(6, chiffres - 1 - e));
    return nb(api, v, dec);
  }
  const m = v / 10 ** e;
  const exposant = String(e).split("").map((c) => EXPOSANTS[c]).join("");
  return nb(api, m, chiffres - 1) + " × 10" + exposant;
}

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
  c.fillStyle = couleurs.accent;
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 2;
  c.beginPath();
  c.arc(px, py, 6, 0, TAU);
  c.stroke();
  c.restore();
}

/** Courbe tronquée dès qu'elle sort de la fenêtre verticale : la suite est NaN. */
function tronquer(ts, ys, yMin, yMax, echelleT = 1) {
  let sorti = false;
  return ts.map((t, i) => {
    const v = ys[i];
    if (sorti || !Number.isFinite(v)) return [t * echelleT, NaN];
    if (v > yMax || v < yMin) {
      sorti = true;
      return [t * echelleT, Math.max(yMin, Math.min(yMax, v))];
    }
    return [t * echelleT, v];
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
   Polynômes : produit, racines, tableau de Routh (puissances décroissantes)
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

/** Racines par la méthode de Durand-Kerner, après mise à l'échelle de la variable. */
function racines(coefs) {
  let c = coefs.slice();
  while (c.length > 1 && Math.abs(c[0]) < 1e-300) c.shift();
  const n = c.length - 1;
  if (n < 1) return [];
  const a = c.map((v) => v / c[0]);
  if (n === 1) return [[-a[1], 0]];
  let R = 0;
  for (let k = 1; k <= n; k += 1) R = Math.max(R, Math.abs(a[k]) ** (1 / k));
  if (!(R > 0)) R = 1;
  const b = a.map((v, k) => v / R ** k);
  const evalP = (z) => {
    let re = 1;
    let im = 0;
    for (let k = 1; k <= n; k += 1) {
      const nr = re * z[0] - im * z[1] + b[k];
      const ni = re * z[1] + im * z[0];
      re = nr;
      im = ni;
    }
    return [re, im];
  };
  let z = [];
  for (let k = 0; k < n; k += 1) {
    const ang = (TAU * k) / n + 0.4;
    z.push([0.9 * Math.cos(ang), 0.9 * Math.sin(ang)]);
  }
  for (let it = 0; it < 500; it += 1) {
    let delta = 0;
    const nz = z.map((zi, i) => {
      const p = evalP(zi);
      let dr = 1;
      let di = 0;
      for (let j = 0; j < n; j += 1) {
        if (j === i) continue;
        const xr = zi[0] - z[j][0];
        const xi = zi[1] - z[j][1];
        const nr = dr * xr - di * xi;
        di = dr * xi + di * xr;
        dr = nr;
      }
      const m = dr * dr + di * di || 1e-300;
      const qr = (p[0] * dr + p[1] * di) / m;
      const qi = (p[1] * dr - p[0] * di) / m;
      delta = Math.max(delta, Math.hypot(qr, qi));
      return [zi[0] - qr, zi[1] - qi];
    });
    z = nz;
    if (delta < 1e-14) break;
  }
  return z.map((zi) => [zi[0] * R, Math.abs(zi[1] * R) < 1e-9 * R ? 0 : zi[1] * R]);
}

/** Tableau de Routh : lignes, première colonne, changements de signe, cas particuliers. */
function routh(coefs) {
  const n = coefs.length - 1;
  const m = Math.floor(n / 2) + 1;
  const echelle = Math.max(...coefs.map((v) => Math.abs(v))) || 1;
  const lignes = [[], []];
  for (let j = 0; j < m; j += 1) {
    lignes[0].push(coefs[2 * j] !== undefined ? coefs[2 * j] : 0);
    lignes[1].push(coefs[2 * j + 1] !== undefined ? coefs[2 * j + 1] : 0);
  }
  let ligneNulle = false;
  let epsilon = false;
  for (let i = 2; i <= n; i += 1) {
    const a = lignes[i - 2];
    let b = lignes[i - 1];
    const tol = 1e-12 * Math.max(echelle, ...a.map((v) => Math.abs(v)));
    if (b.every((v) => Math.abs(v) <= tol)) {
      ligneNulle = true;
      const ordre = n - (i - 2);
      b = a.map((v, j) => v * (ordre - 2 * j));
      lignes[i - 1] = b;
    }
    if (Math.abs(b[0]) <= tol) {
      epsilon = true;
      b = b.slice();
      b[0] = 1e-9 * (Math.abs(a[0]) || 1);
      lignes[i - 1] = b;
    }
    const ligne = [];
    for (let j = 0; j < m - 1; j += 1) ligne.push((b[0] * a[j + 1] - a[0] * b[j + 1]) / b[0]);
    ligne.push(0);
    lignes.push(ligne);
  }
  const colonne = lignes.slice(0, n + 1).map((l) => l[0]);
  let changements = 0;
  for (let i = 0; i < colonne.length - 1; i += 1) if (colonne[i] * colonne[i + 1] < 0) changements += 1;
  return { lignes: lignes.slice(0, n + 1), colonne, changements, ligneNulle, epsilon, n };
}

function tableRouth(api, resultat) {
  const { lignes, n, changements } = resultat;
  let html = "<table><thead><tr><th>Ligne</th>";
  const largeur = Math.max(...lignes.map((l) => l.length));
  for (let j = 0; j < largeur; j += 1) html += "<th>" + (j === 0 ? "1re colonne" : "colonne " + (j + 1)) + "</th>";
  html += "</tr></thead><tbody>";
  lignes.forEach((l, i) => {
    const puissance = n - i;
    html += "<tr><td>s" + String(puissance).split("").map((c) => EXPOSANTS[c]).join("") + "</td>";
    for (let j = 0; j < largeur; j += 1) {
      const v = l[j];
      const t = v === undefined || (j > 0 && v === 0) ? "" : sci(api, v);
      html += j === 0 ? "<td><strong>" + t + "</strong></td>" : "<td>" + t + "</td>";
    }
    html += "</tr>";
  });
  html +=
    "<tr><td>Bilan</td><td colspan=\"" + largeur + "\">" + changements + " changement" + (changements > 1 ? "s" : "") + " de signe : " +
    (changements === 0 ? "aucun pôle à partie réelle positive" : changements + " pôle" + (changements > 1 ? "s" : "") + " instable" + (changements > 1 ? "s" : "")) +
    "</td></tr></tbody></table>";
  return html;
}

/** Réponse indicielle d'une fonction de transfert strictement propre N/D (puissances décroissantes). */
function reponseIndicielle(num, den, tmax, h) {
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
  let diverge = false;
  for (let i = 0; i <= pas; i += 1) {
    let y = 0;
    for (let k = 0; k < n; k += 1) y += c[k] * x[k];
    res.t.push(i * h);
    res.y.push(diverge ? NaN : y);
    const k1 = f(x);
    const k2 = f(x.map((v, j) => v + (h / 2) * k1[j]));
    const k3 = f(x.map((v, j) => v + (h / 2) * k2[j]));
    const k4 = f(x.map((v, j) => v + h * k3[j]));
    x = x.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    if (!Number.isFinite(y) || Math.abs(y) > 1e3) diverge = true;
  }
  return res;
}

function sousEchantillonner(res, pasSortie) {
  const t = [];
  const y = [];
  for (let i = 0; i < res.t.length; i += pasSortie) {
    t.push(res.t[i]);
    y.push(res.y[i]);
  }
  return { t, y };
}

/* Boucle de position : polynôme et réponse. */
function polyPosition(Kv, tf) {
  let d = [T12, TS, 1, 0];
  if (tf > 0) d = polyMul(d, [tf, 1]);
  return polyAdd(d, [Kv]);
}

function reponsePosition(Kv, tf, tmax = 0.06) {
  const den = polyPosition(Kv, tf);
  const num = tf > 0 ? [Kv * tf, Kv] : [Kv];
  return sousEchantillonner(reponseIndicielle(num, den, tmax, 1e-5), 10);
}

/* --------------------------------------------------------------------------
   Régulation de pression : réponse harmonique exacte, marges, Routh de Padé
   -------------------------------------------------------------------------- */

function Lpression(w, K, Ti) {
  /* K (1 + jw Ti)/(jw Ti) e^{-jwT} / ((1 + jw th)(1 + jw tc)) */
  const mod = (K * Math.hypot(1, w * Ti)) / (w * Ti * Math.hypot(1, w * PR.th) * Math.hypot(1, w * PR.tc));
  const ph = -Math.PI / 2 + Math.atan(w * Ti) - Math.atan(w * PR.th) - Math.atan(w * PR.tc) - w * PR.T;
  return { mod, ph, re: mod * Math.cos(ph), im: mod * Math.sin(ph) };
}

function w180Pression(Ti) {
  const ph = (w) => Lpression(w, 1, Ti).ph + Math.PI;
  let precedent = 1e-3;
  for (let i = 1; i <= 600; i += 1) {
    const w = 10 ** (-3 + (6 * i) / 600);
    if (ph(precedent) > 0 && ph(w) <= 0) {
      let a = Math.log10(precedent);
      let b = Math.log10(w);
      for (let k = 0; k < 60; k += 1) {
        const mlog = (a + b) / 2;
        if (ph(10 ** mlog) > 0) a = mlog;
        else b = mlog;
      }
      return 10 ** ((a + b) / 2);
    }
    precedent = w;
  }
  return NaN;
}

function margesPression(K, Ti) {
  const w180 = w180Pression(Ti);
  const kcrit = Number.isFinite(w180) ? 1 / Lpression(w180, 1, Ti).mod : Infinity;
  let wc = NaN;
  let precedent = 1e-3;
  let mm = Infinity;
  for (let i = 1; i <= 1200; i += 1) {
    const w = 10 ** (-3 + (6 * i) / 1200);
    const L = Lpression(w, K, Ti);
    mm = Math.min(mm, Math.hypot(1 + L.re, L.im));
    if (!Number.isFinite(wc) && Lpression(precedent, K, Ti).mod >= 1 && L.mod < 1) {
      let a = Math.log10(precedent);
      let b = Math.log10(w);
      for (let k = 0; k < 50; k += 1) {
        const mlog = (a + b) / 2;
        if (Lpression(10 ** mlog, K, Ti).mod >= 1) a = mlog;
        else b = mlog;
      }
      wc = 10 ** ((a + b) / 2);
    }
    precedent = w;
  }
  const pm = Number.isFinite(wc) ? 180 + Lpression(wc, K, Ti).ph * DEG : NaN;
  const gm = 20 * Math.log10(kcrit / K);
  return { w180, kcrit, wc, pm, gm, mm };
}

function polyPressionPade(K, Ti) {
  const h = PR.T / 2;
  const a = polyMul(polyMul([Ti, 0], polyMul([PR.th, 1], [PR.tc, 1])), [h, 1]);
  const b = polyMul([K * Ti, K], [-h, 1]);
  return polyAdd(a, b);
}

function kcritPade(Ti) {
  const instable = (K) => routh(polyPressionPade(K, Ti)).changements > 0;
  let a = -3;
  let b = 3;
  if (!instable(10 ** b)) return Infinity;
  for (let k = 0; k < 50; k += 1) {
    const m = (a + b) / 2;
    if (instable(10 ** m)) b = m;
    else a = m;
  }
  return 10 ** ((a + b) / 2);
}

/** Réponse de la pression vraie à un échelon unité de consigne, retard exact sur la commande. */
function reponsePression(K, Ti, tmax = 20, h = 2e-3) {
  const Kc = K / PR.Kg;
  const n = Math.round(tmax / h);
  const d = Math.round(PR.T / h);
  const histoire = new Float64Array(n + 2);
  let y1 = 0;
  let ym = 0;
  let xi = 0;
  const res = { t: [], y: [] };
  let diverge = false;
  for (let k = 0; k <= n; k += 1) {
    const u = Kc * (1 - ym + xi / Ti);
    histoire[k] = u;
    const f = k >= d ? histoire[k - d] : 0;
    if (k % 10 === 0) {
      res.t.push(k * h);
      res.y.push(diverge ? NaN : y1);
    }
    const F = (s) => [(PR.Kg * f - s[0]) / PR.th, (s[0] - s[1]) / PR.tc, 1 - s[1]];
    const s0 = [y1, ym, xi];
    const k1 = F(s0);
    const k2 = F(s0.map((v, j) => v + (h / 2) * k1[j]));
    const k3 = F(s0.map((v, j) => v + (h / 2) * k2[j]));
    const k4 = F(s0.map((v, j) => v + h * k3[j]));
    [y1, ym, xi] = s0.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    if (!Number.isFinite(y1) || Math.abs(y1) > 50) diverge = true;
  }
  return res;
}

/* --------------------------------------------------------------------------
   Initialisation et nettoyage
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  detruire();
  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construirePlan(racine, api);
  construireLieu(racine, api);
  construireNyquist(racine, api);
  construireReponsesExemple(racine, api);
  construireDomaine(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  ressources.push(api.reveler(racine.querySelectorAll(".formule-cle, .encadre, #f-comparatif, #h-routh, #e-methodes + .cadre-tableau"), { decalage: 0.05 }));
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
    ["#d-boucle-figure svg", 1.8],
    ["#e-routh-figure svg", 2.0],
    ["#e-nyquist-figure svg", 2.2],
    ["#f-schema-principal svg", 2.6],
  ];
  for (const [selecteur, d] of schemas) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree: d }));
  }
}

/* --------------------------------------------------------------------------
   Petit plan complexe dessiné pour les corrections et le quiz
   -------------------------------------------------------------------------- */

/**
 * poles : [{ s, w, nom }] ; dessine le couple conjugué quand w n'est pas nul.
 * Plan σ de sMin à sMax, ω de -wMax à wMax, dans 600 x 300.
 */
function dessinPlanPoles(id, poles, sMin = -4, sMax = 2, wMax = 4) {
  const X = (s) => 50 + (520 * (s - sMin)) / (sMax - sMin);
  const Y = (w) => 150 - (130 * w) / wMax;
  let hach = "";
  for (let k = -300; k < 600; k += 18) {
    const x0 = Math.max(X(0), X(0) + k);
    const ya = 20 + (x0 - (X(0) + k));
    const xb = Math.min(570, X(0) + k + 260);
    const yb = 20 + (xb - (X(0) + k));
    if (xb > x0 && ya < 280) hach += "M" + x0.toFixed(0) + " " + ya.toFixed(0) + "L" + xb.toFixed(0) + " " + Math.min(280, yb).toFixed(0);
  }
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.4">';
  s += '<path d="' + hach + '" stroke-width="0.6" stroke-dasharray="1 5"/>';
  s += '<path d="M40 150H585" marker-end="url(#' + id + ')"/><path d="M' + X(0).toFixed(1) + ' 285V12" stroke-width="2.4" marker-end="url(#' + id + ')"/>';
  const croix = (x, y) => '<path d="M' + (x - 6) + " " + (y - 6) + "L" + (x + 6) + " " + (y + 6) + "M" + (x - 6) + " " + (y + 6) + "L" + (x + 6) + " " + (y - 6) + '" stroke-width="2.4"/>';
  for (const p of poles) {
    s += croix(X(p.s), Y(p.w));
    if (p.w) s += croix(X(p.s), Y(-p.w));
  }
  s += "</g>" + ECRITS;
  s += texte(588, 142, "σ", ' text-anchor="end"') + texte(X(0) + 8, 22, "ω");
  for (let v = Math.ceil(sMin); v <= sMax; v += 1) if (v !== 0) s += texte(X(v), 166, String(v), ' text-anchor="middle" font-size="10"');
  s += texte(X(0) - 6, Y(wMax / 2) + 4, String(wMax / 2), ' text-anchor="end" font-size="10"');
  for (const p of poles) if (p.nom) s += texte(X(p.s) + 10, Y(p.w) - 8, p.nom, ' font-weight="700"');
  s += texte(560, 272, "demi-plan droit hachuré", ' text-anchor="end" font-size="10"') + "</g>";
  return s;
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  if (!racine.querySelector("#c-minitest")) return;
  const cible = "#c-minitest";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c1-trinome",
      titre: "Pôles d'un second ordre",
      niveau: "fondamental",
      enonce: "<p>Une fonction de transfert a pour dénominateur $s^2 + 2s + 5$. Quelle est la partie imaginaire positive de ses pôles, en $\\mathrm{rad/s}$ ?</p>",
      valeur: 2,
      unite: "rad/s",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Partie imaginaire",
      etapes: [
        { texte: "Discriminant : $b^2 - 4ac = 4 - 20 = -16 &lt; 0$ : pôles complexes conjugués." },
        { texte: "$p = (-2 \\pm \\sqrt{-16})/2 = -1 \\pm 2j$." },
        { texte: "Partie imaginaire $2\\ \\mathrm{rad/s}$, partie réelle $-1\\ \\mathrm{s^{-1}}$ : mode $e^{-t}\\cos 2t$, stable.", note: "Contrôle : somme $-2 = -b/a$, produit $1 + 4 = 5 = c/a$." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(moteur, conteneur, "0 0 600 300", dessinPlanPoles("c1-fl", [{ s: -1, w: 2, nom: "-1 ± 2j" }]), "Les deux pôles, symétriques par rapport à l'axe réel, sont dans le demi-plan gauche.");
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-demi-vie",
      titre: "Durée de division par deux d'un mode",
      niveau: "fondamental",
      enonce: "<p>Un mode s'écrit $e^{-0{,}5t}\\cos 3t$. Au bout de combien de secondes son enveloppe est-elle divisée par deux ?</p>",
      valeur: Math.log(2) / 0.5,
      unite: "s",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Durée",
      etapes: [
        { texte: "Enveloppe $e^{-0{,}5t}$ ; on cherche $e^{-0{,}5t} = 1/2$." },
        { texte: "$0{,}5\\,t = \\ln 2 = 0{,}693$, donc $t = 1{,}386\\ \\mathrm{s}$." },
        { texte: "La pulsation $3\\ \\mathrm{rad/s}$ n'intervient pas : seule la partie réelle du pôle fixe la décroissance." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Mode e^(-0,5 t) cos 3t et son enveloppe",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "x",
          yUnite: "",
          xMin: 0,
          xMax: 6,
          yMin: -1.1,
          yMax: 1.1,
          series: [
            { id: "x", nom: "mode", fonction: (t) => Math.exp(-0.5 * t) * Math.cos(3 * t) },
            { id: "e", nom: "enveloppe", fonction: (t) => Math.exp(-0.5 * t) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0.5, "moitié", [3, 4]);
            ligneV(c, r, couleurs, Math.log(2) / 0.5, [6, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c3-boucle",
      titre: "Pôle d'une boucle fermée du premier ordre",
      niveau: "fondamental",
      enonce: "<p>Une boucle ouverte vaut $L(s) = \\dfrac{4}{s + 1}$, retour unitaire soustrait. Où est le pôle de la boucle fermée, en $\\mathrm{s^{-1}}$ ?</p>",
      valeur: -5,
      unite: "s⁻¹",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Pôle",
      etapes: [
        { texte: "$1 + L = 0 \\iff s + 1 + 4 = 0$." },
        { texte: "$s = -5\\ \\mathrm{s^{-1}}$ : le pôle de la boucle ouverte, en $-1$, a été déplacé vers la gauche par le gain." },
        { texte: "La boucle fermée est cinq fois plus rapide : constante de temps $0{,}2\\ \\mathrm{s}$ au lieu de $1\\ \\mathrm{s}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(moteur, conteneur, "0 0 600 300", dessinPlanPoles("c3-fl", [{ s: -1, w: 0, nom: "boucle ouverte" }, { s: -5, w: 0, nom: "fermée" }], -6, 2, 4), "Le gain déplace le pôle de -1 à -5 le long de l'axe réel.");
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Simulation : pôle déplaçable et mode temporel
   -------------------------------------------------------------------------- */

function construirePlan(racine, api) {
  const conteneur = racine.querySelector("#d-plan-vivant");
  if (!conteneur) return;
  const P = { x0: 60, x1: 690, y0: 20, y1: 320, sMin: -3, sMax: 1, wMax: 5 };
  const X = (s) => P.x0 + ((P.x1 - P.x0) * (s - P.sMin)) / (P.sMax - P.sMin);
  const Y = (w) => (P.y0 + P.y1) / 2 - ((P.y1 - P.y0) / 2) * (w / P.wMax);
  const S = (x) => P.sMin + ((x - P.x0) * (P.sMax - P.sMin)) / (P.x1 - P.x0);
  const W = (y) => (((P.y0 + P.y1) / 2 - y) / ((P.y1 - P.y0) / 2)) * P.wMax;
  const etat = { s: -0.5, w: 3, t: 0 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 350",
    role: "img",
    "aria-label": "Plan complexe : partie réelle sigma de -3 à 1 en abscisse, partie imaginaire omega de -5 à 5 en ordonnée, demi-plan droit hachuré, pôle déplaçable et son conjugué",
  });
  const decor = svgEl("g");
  let hach = "";
  for (let y = P.y0 - 300; y < P.y1; y += 20) {
    const xa = X(0);
    const ya = Math.max(P.y0, y);
    const xs = xa + (ya - y);
    const xb = Math.min(P.x1, xa + (P.y1 - y));
    const yb = y + (xb - xa);
    if (xb > xs) hach += "M" + xs.toFixed(0) + " " + ya.toFixed(0) + "L" + xb.toFixed(0) + " " + yb.toFixed(0);
  }
  let d = "<defs>" + marqueur("d-pl-fl") + "</defs>" + TRAITS + ' stroke-width="1.2">';
  d += '<rect x="' + P.x0 + '" y="' + P.y0 + '" width="' + (P.x1 - P.x0) + '" height="' + (P.y1 - P.y0) + '"/>';
  d += '<path d="' + hach + '" stroke-width="0.6" stroke-dasharray="1 5"/>';
  let grille = "";
  for (let v = -2; v <= 1; v += 1) if (v !== 0) grille += "M" + X(v).toFixed(1) + " " + P.y0 + "V" + P.y1;
  for (const v of [-4, -2, 2, 4]) grille += "M" + P.x0 + " " + Y(v).toFixed(1) + "H" + P.x1;
  d += '<path d="' + grille + '" stroke-width="0.5" stroke-dasharray="2 4"/>';
  d += '<path d="M' + P.x0 + " " + Y(0).toFixed(1) + "H" + P.x1 + '"/><path d="M' + X(0).toFixed(1) + " " + P.y1 + "V" + P.y0 + '" stroke-width="2.6"/>';
  /* zeta = 0,7 : sigma = -omega en coordonnées de données */
  d += '<path d="M' + X(0).toFixed(1) + " " + Y(0).toFixed(1) + "L" + X(-3).toFixed(1) + " " + Y(3).toFixed(1) + "M" + X(0).toFixed(1) + " " + Y(0).toFixed(1) + "L" + X(-3).toFixed(1) + " " + Y(-3).toFixed(1) + '" stroke-dasharray="7 5"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  for (let v = -3; v <= 1; v += 1) d += texte(X(v), P.y1 + 16, String(v), ' text-anchor="middle"');
  for (const v of [-4, -2, 2, 4]) d += texte(P.x0 - 6, Y(v) + 4, String(v), ' text-anchor="end"');
  d += texte(P.x1, P.y1 + 32, "σ (s⁻¹)", ' text-anchor="end"') + texte(P.x0 - 6, P.y0 - 6, "ω (rad/s)");
  d += texte(X(-2.95), Y(3) - 6, "ζ = 0,7") + texte(X(0.08), P.y0 + 16, "instable") + texte(X(-2.95), P.y0 + 16, "stable") + "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const arc = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "2 4" });
  const conj = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.4" });
  const etiquette = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(arc, conj, etiquette);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#d-plan-valeurs", [
    { id: "p", libelle: "Pôles : partie réelle ± partie imaginaire", format: (v) => v },
    { id: "w0", libelle: "Pulsation propre (module du pôle)", format: (v) => v },
    { id: "z", libelle: "Amortissement", format: (v) => v },
    { id: "env", libelle: "Enveloppe", format: (v) => v },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#d-plan-trace", {
    titre: "Mode x(t) = e^(σt) cos(ωt) et enveloppe",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "x",
    yUnite: "",
    xMin: 0,
    xMax: 10,
    yMin: -2.5,
    yMax: 2.5,
    ratio: 0.36,
    series: [
      { id: "x", nom: "mode x(t)", points: [] },
      { id: "e", nom: "enveloppe e^(σt)", points: [] },
      { id: "e2", nom: "enveloppe opposée", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, etat.t);
      const v = Math.exp(etat.s * etat.t) * Math.cos(etat.w * etat.t);
      pointRepere(c, r, couleurs, etat.t, Math.max(-2.5, Math.min(2.5, v)));
    },
  });
  if (trace) ressources.push(trace);

  function toutRecalculer() {
    const { s, w } = etat;
    const w0 = Math.hypot(s, w);
    conj.setAttribute("d", "M" + (X(s) - 6).toFixed(1) + " " + (Y(-w) - 6).toFixed(1) + "l12 12M" + (X(s) - 6).toFixed(1) + " " + (Y(-w) + 6).toFixed(1) + "l12 -12");
    /* arc de rayon omega0, en coordonnées de données : ellipse à l'écran */
    let a = "";
    for (let i = 0; i <= 60; i += 1) {
      const ang = Math.PI / 2 + (Math.PI * i) / 60;
      const xs = w0 * Math.cos(ang);
      const ys = w0 * Math.sin(ang);
      if (xs < P.sMin || Math.abs(ys) > P.wMax) continue;
      a += (a ? "L" : "M") + X(xs).toFixed(1) + " " + Y(ys).toFixed(1);
    }
    arc.setAttribute("d", a || "M0 0");
    etiquette.innerHTML = texte(Math.min(X(s) + 12, 600), Math.max(Y(w) - 10, 34), "p = " + nb(api, s, 2) + " + " + nb(api, w, 2) + "j");
    const pts = (fn) => Array.from({ length: 501 }, (_, i) => {
      const t = (10 * i) / 500;
      const v = fn(t);
      return [t, Number.isFinite(v) && Math.abs(v) <= 2.5 ? v : NaN];
    });
    if (trace) {
      trace.definirDonnees("x", pts((t) => Math.exp(s * t) * Math.cos(w * t)));
      trace.definirDonnees("e", pts((t) => Math.exp(s * t)));
      trace.definirDonnees("e2", pts((t) => -Math.exp(s * t)));
    }
    if (valeurs) {
      const zeta = w0 > 1e-9 ? -s / w0 : 1;
      let env;
      if (Math.abs(s) < 0.02) env = "constante : ni croissance ni décroissance";
      else if (s < 0) env = "divisée par deux toutes les " + nb(api, Math.log(2) / -s, 2) + " s";
      else env = "doublée toutes les " + nb(api, Math.log(2) / s, 2) + " s";
      valeurs.maj({
        p: nb(api, s, 2) + " ± " + nb(api, w, 2) + "j",
        w0: nb(api, w0, 3) + " rad/s",
        z: w < 0.02 ? "pôle réel : mode non oscillant" : nb(api, zeta, 3),
        env,
        verdict: Math.abs(s) < 0.02 ? "marginalement stable" : s < 0 ? (w > 0.02 && zeta < 0.2 ? "stable mais peu amorti" : "stable") : "instable",
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: P.x0, y: P.y0, largeur: P.x1 - P.x0, hauteur: Y(0) - P.y0 },
    valeur: { x: X(etat.s), y: Y(etat.w) },
    pas: 3,
    libelle: "Pôle du demi-plan supérieur, partie réelle et partie imaginaire",
    format: (m) => "σ = " + nb(api, S(m.x), 2) + ", ω = " + nb(api, W(m.y), 2),
    rappel(m) {
      etat.s = S(m.x);
      etat.w = Math.max(0, W(m.y));
      toutRecalculer();
    },
  });
  if (poignee) ressources.push(poignee);

  const lecteur = api.sim.lecteur("#d-plan-lecteur", {
    de: 0,
    a: 10,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Repère temporel le long du mode",
    rappel: (t) => {
      etat.t = t;
      if (trace) trace.demanderRendu();
    },
  });
  if (lecteur) ressources.push(lecteur);

  toutRecalculer();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.2 }));
}

/* --------------------------------------------------------------------------
   E. Simulation : lieu des pôles de la boucle de position et Routh en direct
   -------------------------------------------------------------------------- */

function construireLieu(racine, api) {
  const conteneur = racine.querySelector("#e-lieu-vivant");
  if (!conteneur) return;
  const P = { x0: 40, x1: 690, y0: 20, y1: 450, sMin: -1500, sMax: 300 };
  const k = (P.x1 - P.x0) / (P.sMax - P.sMin);
  const yc = (P.y0 + P.y1) / 2;
  const X = (s) => P.x0 + k * (s - P.sMin);
  const Y = (w) => yc - k * w;
  const RAIL = { y: 484, x0: 60, x1: 670, lMin: 0, lMax: Math.log10(3000) };
  const etat = { lk: 2, tf: 0, t: 0, res: null };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 520",
    role: "img",
    "aria-label": "Lieu des pôles de la boucle de position dans le plan complexe, de -1500 à 300 par seconde en abscisse, branches parcourues quand le gain Kv croît, pôles courants en ronds pleins, rail gradué du gain sous le plan",
  });
  const decor = svgEl("g");
  let hach = "";
  for (let y = P.y0 - 600; y < P.y1; y += 20) {
    const xa = X(0);
    const ya = Math.max(P.y0, y);
    const xs = xa + (ya - y);
    const xb = Math.min(P.x1, xa + (P.y1 - y));
    const yb = y + (xb - xa);
    if (xb > xs) hach += "M" + xs.toFixed(0) + " " + ya.toFixed(0) + "L" + xb.toFixed(0) + " " + yb.toFixed(0);
  }
  let d = '<defs><clipPath id="e-li-clip"><rect x="' + P.x0 + '" y="' + P.y0 + '" width="' + (P.x1 - P.x0) + '" height="' + (P.y1 - P.y0) + '"/></clipPath></defs>';
  d += TRAITS + ' stroke-width="1.2"><rect x="' + P.x0 + '" y="' + P.y0 + '" width="' + (P.x1 - P.x0) + '" height="' + (P.y1 - P.y0) + '"/>';
  d += '<path d="' + hach + '" stroke-width="0.6" stroke-dasharray="1 5"/>';
  let grille = "";
  for (let v = -1400; v <= 200; v += 200) if (v !== 0) grille += "M" + X(v).toFixed(1) + " " + P.y0 + "V" + P.y1;
  for (const v of [-400, -200, 200, 400]) grille += "M" + P.x0 + " " + Y(v).toFixed(1) + "H" + P.x1;
  d += '<path d="' + grille + '" stroke-width="0.5" stroke-dasharray="2 4"/>';
  d += '<path d="M' + P.x0 + " " + yc + "H" + P.x1 + '"/><path d="M' + X(0).toFixed(1) + " " + P.y1 + "V" + P.y0 + '" stroke-width="2.6"/>';
  d += '<path d="M' + RAIL.x0 + " " + RAIL.y + "H" + RAIL.x1 + '" stroke-width="1.4"/>';
  let tics = "";
  for (let e = 0; e <= 3; e += 1) {
    const x = RAIL.x0 + ((RAIL.x1 - RAIL.x0) * (e - RAIL.lMin)) / (RAIL.lMax - RAIL.lMin);
    tics += "M" + x.toFixed(1) + " " + (RAIL.y - 6) + "V" + (RAIL.y + 6);
  }
  const xCrit = RAIL.x0 + ((RAIL.x1 - RAIL.x0) * (Math.log10(KV_CRIT) - RAIL.lMin)) / (RAIL.lMax - RAIL.lMin);
  d += '<path d="' + tics + '"/></g>';
  d += ECRITS.replace('font-size="12"', 'font-size="11"');
  for (let v = -1400; v <= 200; v += 400) d += texte(X(v), yc + 16, String(v), ' text-anchor="middle"');
  for (const v of [-400, 400]) d += texte(X(0) + 6, Y(v) + 4, (v > 0 ? "+" : "") + v + "j");
  d += texte(P.x1 - 4, yc - 8, "σ (s⁻¹)", ' text-anchor="end"') + texte(X(0) + 6, P.y0 + 14, "ω (rad/s)");
  for (let e = 0; e <= 3; e += 1) {
    const x = RAIL.x0 + ((RAIL.x1 - RAIL.x0) * (e - RAIL.lMin)) / (RAIL.lMax - RAIL.lMin);
    d += texte(x, RAIL.y + 20, String(10 ** e), ' text-anchor="middle"');
  }
  d += texte(RAIL.x0, RAIL.y - 12, "Kv (s⁻¹), échelle logarithmique") + "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const repereCrit = svgEl("g");
  repereCrit.innerHTML = TRAITS + ' stroke-width="1"><path d="M' + xCrit.toFixed(1) + " " + (RAIL.y - 12) + "V" + (RAIL.y + 4) + '" stroke-dasharray="2 2"/></g>';
  const branches = svgEl("g", { "clip-path": "url(#e-li-clip)", fill: "none", stroke: "currentColor", "stroke-width": "1.2" });
  const asymptotes = svgEl("path", { "clip-path": "url(#e-li-clip)", fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "7 5" });
  const ouverts = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "2.2" });
  const fermes = svgEl("g", { "clip-path": "url(#e-li-clip)", fill: "currentColor", stroke: "none" });
  const infos = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(repereCrit, asymptotes, branches, ouverts, fermes, infos);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#e-lieu-valeurs", [
    { id: "kv", libelle: "Gain de boucle Kv", format: (v) => v },
    { id: "poles", libelle: "Pôles de la boucle fermée", format: (v) => v },
    { id: "crit", libelle: "Gain critique (Routh) et pulsation", format: (v) => v },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);
  const zoneRouth = racine.querySelector("#e-lieu-routh");

  const trace = api.sim.traceur("#e-lieu-trace", {
    titre: "Position après un échelon de consigne de 1 rad",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "θ",
    yUnite: "rad",
    xMin: 0,
    xMax: 60,
    yMin: -0.5,
    yMax: 2,
    ratio: 0.36,
    series: [{ id: "y", nom: "position θ(t)", points: [] }],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 1, "consigne 1 rad", [9, 5]);
      ligneH(c, r, couleurs, 1.05, null, [2, 4]);
      ligneH(c, r, couleurs, 0.95, null, [2, 4]);
    },
  });
  if (trace) ressources.push(trace);

  /* Branches du lieu pour un filtre donné : suivi par plus proche voisin. */
  let cleBranches = null;
  function tracerBranches(tf) {
    if (cleBranches === tf) return;
    cleBranches = tf;
    const ouv = tf > 0 ? [0, -1 / TAU1, -1 / TAU2, -1 / tf] : [0, -1 / TAU1, -1 / TAU2];
    const n = ouv.length;
    let precedent = ouv.map((p) => [p, 0]);
    const chemins = precedent.map((p) => [p]);
    for (let i = 0; i <= 420; i += 1) {
      const Kv = 10 ** (-1 + (4.5 * i) / 420);
      const r = racines(polyPosition(Kv, tf));
      const libres = r.slice();
      const suivants = precedent.map((p) => {
        let meilleur = 0;
        let dmin = Infinity;
        libres.forEach((q, j) => {
          const dd = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
          if (dd < dmin) {
            dmin = dd;
            meilleur = j;
          }
        });
        return libres.splice(meilleur, 1)[0];
      });
      suivants.forEach((q, j) => chemins[j].push(q));
      precedent = suivants;
    }
    branches.innerHTML = chemins
      .map((ch) => '<path d="' + ch.map((q, i) => (i ? "L" : "M") + X(q[0]).toFixed(1) + " " + Y(q[1]).toFixed(1)).join("") + '"/>')
      .join("");
    ouverts.innerHTML = ouv
      .map((p) => '<path d="M' + (X(p) - 6).toFixed(1) + " " + (yc - 6) + "l12 12M" + (X(p) - 6).toFixed(1) + " " + (yc + 6) + 'l12 -12"/>')
      .join("");
    const centre = ouv.reduce((a, b) => a + b, 0) / n;
    let a = "";
    for (let q = 0; q < n; q += 1) {
      const ang = ((2 * q + 1) * Math.PI) / n;
      a += "M" + X(centre).toFixed(1) + " " + yc + "L" + X(centre + 3000 * Math.cos(ang)).toFixed(1) + " " + Y(3000 * Math.sin(ang)).toFixed(1);
    }
    asymptotes.setAttribute("d", a);
  }

  function kcrit(tf) {
    const instable = (Kv) => routh(polyPosition(Kv, tf)).changements > 0;
    let lo = 0;
    let hi = 5;
    for (let q = 0; q < 50; q += 1) {
      const m = (lo + hi) / 2;
      if (instable(10 ** m)) hi = m;
      else lo = m;
    }
    const Kc = 10 ** ((lo + hi) / 2);
    const r = racines(polyPosition(Kc, tf));
    const w = Math.max(...r.map((q) => Math.abs(q[1])));
    return { Kc, w };
  }

  function toutRecalculer() {
    const Kv = 10 ** etat.lk;
    const tf = etat.tf;
    tracerBranches(tf);
    const D = polyPosition(Kv, tf);
    const r = racines(D);
    fermes.innerHTML = r.map((q) => '<circle cx="' + X(q[0]).toFixed(1) + '" cy="' + Y(q[1]).toFixed(1) + '" r="5.5"/>').join("");
    const R = routh(D);
    if (zoneRouth) zoneRouth.innerHTML = tableRouth(api, R);
    const kc = kcrit(tf);
    const hors = r.filter((q) => q[0] < P.sMin || Math.abs(q[1]) * k > (P.y1 - P.y0) / 2);
    infos.innerHTML =
      texte(P.x0 + 6, P.y1 - 8, "D(s) de degré " + (D.length - 1) + (tf > 0 ? ", filtre " + nb(api, tf * 1000, 2) + " ms" : ", sans filtre")) +
      (hors.length ? texte(P.x1 - 6, P.y1 - 8, hors.length + " pôle" + (hors.length > 1 ? "s" : "") + " hors du cadre", ' text-anchor="end"') : "");
    const res = reponsePosition(Kv, tf);
    etat.res = res;
    if (trace) trace.definirDonnees("y", tronquer(res.t, res.y, -0.5, 2, 1000));
    if (valeurs) {
      const tri = r.slice().sort((a, b) => b[0] - a[0]);
      valeurs.maj({
        kv: nb(api, Kv, Kv < 100 ? 1 : 0) + " s⁻¹",
        poles: tri
          .filter((q) => q[1] >= 0)
          .map((q) => (Math.abs(q[1]) > 1e-6 ? nb(api, q[0], 1) + " ± " + nb(api, q[1], 1) + "j" : nb(api, q[0], 1)))
          .join(" ; "),
        crit: nb(api, kc.Kc, 1) + " s⁻¹ à " + nb(api, kc.w, 1) + " rad/s",
        verdict: R.changements === 0 ? (tri[0][1] > 4 * -tri[0][0] ? "stable mais très peu amortie" : "stable") : "instable : " + R.changements + " pôles à droite",
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: RAIL.x0, y: RAIL.y },
    a: { x: RAIL.x1, y: RAIL.y },
    min: RAIL.lMin,
    max: RAIL.lMax,
    pas: 0.005,
    valeur: etat.lk,
    libelle: "Gain de boucle Kv, en échelle logarithmique",
    format: (m) => nb(api, 10 ** m.valeur, 10 ** m.valeur < 100 ? 1 : 0) + " par seconde",
    rappel(m) {
      etat.lk = m.valeur;
      toutRecalculer();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-lieu-curseurs",
    [{ id: "tf", libelle: "Filtre de mesure τf", min: 0, max: 3, pas: 0.25, valeur: 0, format: (v) => (v ? nb(api, v, 2) + " ms" : "aucun") }],
    (lues) => {
      etat.tf = lues.tf / 1000;
      toutRecalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  toutRecalculer();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.2 }));
}

/* --------------------------------------------------------------------------
   E. Simulation : Nyquist de la boucle de position
   -------------------------------------------------------------------------- */

function Lposition(w, Kv, T) {
  const mod = Kv / (w * Math.hypot(1, w * TAU1) * Math.hypot(1, w * TAU2));
  const ph = -Math.PI / 2 - Math.atan(w * TAU1) - Math.atan(w * TAU2) - w * T;
  return { mod, ph, re: mod * Math.cos(ph), im: mod * Math.sin(ph) };
}

function margesPosition(Kv, T) {
  const bis = (f, a, b) => {
    let la = Math.log10(a);
    let lb = Math.log10(b);
    for (let i = 0; i < 70; i += 1) {
      const m = (la + lb) / 2;
      if (f(10 ** m) > 0) la = m;
      else lb = m;
    }
    return 10 ** ((la + lb) / 2);
  };
  const wc = bis((w) => Lposition(w, Kv, T).mod - 1, 1e-2, 1e6);
  const w180 = bis((w) => Lposition(w, Kv, T).ph + Math.PI, 1e-2, 1e6);
  const pm = 180 + Lposition(wc, Kv, T).ph * DEG;
  const gm = -20 * Math.log10(Lposition(w180, Kv, T).mod);
  let mm = Infinity;
  for (let i = 0; i <= 1500; i += 1) {
    const w = 10 ** (0 + (5 * i) / 1500);
    const L = Lposition(w, Kv, T);
    mm = Math.min(mm, Math.hypot(1 + L.re, L.im));
  }
  return { wc, w180, pm, gm, mm };
}

function construireNyquist(racine, api) {
  const conteneur = racine.querySelector("#e-nyquist-vivant");
  if (!conteneur) return;
  const X = (re) => 110 + (re + 3.5) * 100;
  const Y = (im) => 20 + (1 - im) * 100;
  const etat = { lk: 2, T: 0, p: 0.3 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 460",
    role: "img",
    "aria-label": "Diagramme de Nyquist de la boucle de position : partie réelle de L de -3,5 à 1,5, partie imaginaire de -3,2 à 1, point critique -1, cercle unité, marges de gain, de phase et de module",
  });
  const decor = svgEl("g");
  let d = "<defs>" + marqueur("e-nq-fl") + '<clipPath id="e-nq-clip"><rect x="40" y="14" width="660" height="432"/></clipPath></defs>';
  d += TRAITS + ' stroke-width="1.2">';
  d += '<path d="M40 ' + Y(0) + "H700" + '" marker-end="url(#e-nq-fl)"/><path d="M' + X(0) + ' 446V14" marker-end="url(#e-nq-fl)"/>';
  d += '<circle cx="' + X(0) + '" cy="' + Y(0) + '" r="100" stroke-dasharray="5 5" stroke-width="1"/>';
  let grille = "";
  for (let v = -3; v <= 1; v += 1) if (v !== 0) grille += "M" + X(v) + " " + (Y(0) - 4) + "V" + (Y(0) + 4);
  for (const v of [-3, -2, -1]) grille += "M" + (X(0) - 4) + " " + Y(v) + "H" + (X(0) + 4);
  d += '<path d="' + grille + '"/>';
  d += '<path d="M' + (X(-1) - 7) + " " + (Y(0) - 7) + "l14 14M" + (X(-1) - 7) + " " + (Y(0) + 7) + 'l14 -14" stroke-width="2.6"/></g>';
  d += ECRITS.replace('font-size="12"', 'font-size="11"');
  for (let v = -3; v <= 1; v += 1) if (v !== 0 && v !== -1) d += texte(X(v), Y(0) + 16, String(v), ' text-anchor="middle"');
  d += texte(X(-1) - 4, Y(0) - 12, "-1", ' text-anchor="end"');
  for (const v of [-3, -2, -1]) d += texte(X(0) + 8, Y(v) + 4, v + "j");
  d += texte(696, Y(0) - 8, "Re L", ' text-anchor="end"') + texte(X(0) + 8, 26, "Im L") + "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const groupe = svgEl("g", { "clip-path": "url(#e-nq-clip)" });
  const miroir = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "2 4" });
  const courbe = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.8" });
  const cercleMm = svgEl("circle", { fill: "none", stroke: "currentColor", "stroke-width": "1.2", "stroke-dasharray": "10 4 2 4" });
  const arcMp = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.4" });
  const rayon = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "3 3" });
  const pointMg = svgEl("circle", { r: "4.5", fill: "currentColor" });
  const mobile = svgEl("circle", { r: "6.5", fill: "none", stroke: "currentColor", "stroke-width": "2.2" });
  groupe.append(miroir, courbe, cercleMm, arcMp, rayon, pointMg, mobile);
  const infos = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(groupe, infos);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#e-nyquist-valeurs", [
    { id: "point", libelle: "Point mobile : pulsation, module, argument", format: (v) => v },
    { id: "dist", libelle: "Distance au point critique", format: (v) => v },
    { id: "mg", libelle: "Marge de gain", format: (v) => v },
    { id: "mp", libelle: "Marge de phase", format: (v) => v },
    { id: "mm", libelle: "Marge de module", format: (v) => v },
    { id: "verdict", libelle: "Verdict (boucle ouverte stable, P = 0)", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  let marges = null;

  function majMobile() {
    const Kv = 10 ** etat.lk;
    const w = 10 ** (1.7 + 2.3 * etat.p);
    const L = Lposition(w, Kv, etat.T);
    mobile.setAttribute("cx", X(L.re).toFixed(1));
    mobile.setAttribute("cy", Y(L.im).toFixed(1));
    if (valeurs) {
      valeurs.maj({
        point: nb(api, w, w < 100 ? 1 : 0) + " rad/s ; " + nb(api, L.mod, 3) + " ; " + nb(api, L.ph * DEG, 1) + " °",
        dist: nb(api, Math.hypot(1 + L.re, L.im), 3),
      });
    }
  }

  function toutRecalculer() {
    const Kv = 10 ** etat.lk;
    const T = etat.T;
    let c = "";
    let m = "";
    for (let i = 0; i <= 900; i += 1) {
      const w = 10 ** (1 + (4 * i) / 900);
      const L = Lposition(w, Kv, T);
      const re = Math.max(-20, Math.min(20, L.re));
      const im = Math.max(-20, Math.min(20, L.im));
      c += (i ? "L" : "M") + X(re).toFixed(1) + " " + Y(im).toFixed(1);
      m += (i ? "L" : "M") + X(re).toFixed(1) + " " + Y(-im).toFixed(1);
    }
    courbe.setAttribute("d", c);
    miroir.setAttribute("d", m);
    marges = margesPosition(Kv, T);
    const Lc = Lposition(marges.wc, Kv, T);
    const L180 = Lposition(marges.w180, Kv, T);
    pointMg.setAttribute("cx", X(-L180.mod).toFixed(1));
    pointMg.setAttribute("cy", Y(0).toFixed(1));
    cercleMm.setAttribute("cx", X(-1).toFixed(1));
    cercleMm.setAttribute("cy", Y(0).toFixed(1));
    cercleMm.setAttribute("r", (Math.min(3, marges.mm) * 100).toFixed(1));
    rayon.setAttribute("d", "M" + X(0) + " " + Y(0) + "L" + X(Lc.re).toFixed(1) + " " + Y(Lc.im).toFixed(1));
    let a = "";
    const debut = -Math.PI;
    const fin = Lc.ph;
    for (let i = 0; i <= 40; i += 1) {
      const ang = debut + ((fin - debut) * i) / 40;
      a += (i ? "L" : "M") + X(0.42 * Math.cos(ang)).toFixed(1) + " " + Y(0.42 * Math.sin(ang)).toFixed(1);
    }
    arcMp.setAttribute("d", Math.abs(marges.pm) < 179 ? a : "M0 0");
    const stable = marges.gm > 0 && marges.pm > 0;
    infos.innerHTML =
      texte(X(-L180.mod), Y(0) - 14, "-1/MG", ' text-anchor="middle"') +
      texte(696, 444, stable ? "la courbe laisse -1 à gauche : stable" : "la courbe entoure -1 : instable", ' text-anchor="end"');
    if (valeurs) {
      valeurs.maj({
        mg: nb(api, marges.gm, 2) + " dB (traversée en " + nb(api, -L180.mod, 3) + ", ω180 = " + nb(api, marges.w180, 1) + " rad/s)",
        mp: nb(api, marges.pm, 1) + " ° (ωc = " + nb(api, marges.wc, 1) + " rad/s)",
        mm: nb(api, marges.mm, 3),
        verdict: stable ? (marges.mm < 0.3 ? "stable mais frôle -1" : "stable") : "instable",
      });
    }
    majMobile();
  }

  const curseurs = api.sim.curseurs(
    "#e-nyquist-curseurs",
    [
      { id: "lk", libelle: "Gain de boucle Kv (échelle logarithmique)", min: 1, max: 3.2, pas: 0.01, valeur: etat.lk, format: (v) => nb(api, 10 ** v, 10 ** v < 100 ? 1 : 0) + " s⁻¹" },
      { id: "T", libelle: "Retard pur T", min: 0, max: 15, pas: 0.5, valeur: 0, format: (v) => nb(api, v, 1) + " ms" },
    ],
    (lues) => {
      etat.lk = lues.lk;
      etat.T = lues.T / 1000;
      toutRecalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-nyquist-lecteur", {
    de: 0,
    a: 1,
    duree: 8,
    boucle: true,
    auto: false,
    libelle: "Balayage de la pulsation de 50 à 10 000 rad/s le long de la courbe",
    rappel: (p) => {
      etat.p = p;
      majMobile();
    },
  });
  if (lecteur) ressources.push(lecteur);

  toutRecalculer();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.2 }));
}

/* --------------------------------------------------------------------------
   H. Réponses de l'exemple autour du gain critique
   -------------------------------------------------------------------------- */

function construireReponsesExemple(racine, api) {
  if (!racine.querySelector("#h-reponses")) return;
  const gains = [100, 600, KV_CRIT, 1400];
  const series = gains.map((Kv) => {
    const res = reponsePosition(Kv, 0, 0.06);
    return { id: "k" + Math.round(Kv), nom: "Kv = " + nb(api, Kv, Kv === KV_CRIT ? 1 : 0) + " s⁻¹", points: tronquer(res.t, res.y, -0.5, 2.5, 1000) };
  });
  const trace = api.sim.traceur("#h-reponses", {
    titre: "Boucle de position sans retard : quatre gains",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "θ",
    yUnite: "rad",
    xMin: 0,
    xMax: 60,
    yMin: -0.5,
    yMax: 2.5,
    ratio: 0.45,
    series,
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 1, "consigne", [9, 5]);
    },
  });
  if (trace) ressources.push(trace);
}

/* --------------------------------------------------------------------------
   I. Simulation : domaine de stabilité de la régulation de pression
   -------------------------------------------------------------------------- */

function construireDomaine(racine, api) {
  const conteneur = racine.querySelector("#i-domaine-vivant");
  if (!conteneur) return;
  const P = { x0: 70, x1: 690, y0: 20, y1: 360, kMin: -1.3, kMax: 1.7, tMin: -1.5, tMax: 1.3 };
  const X = (lk) => P.x0 + ((P.x1 - P.x0) * (lk - P.kMin)) / (P.kMax - P.kMin);
  const Y = (lt) => P.y1 - ((P.y1 - P.y0) * (lt - P.tMin)) / (P.tMax - P.tMin);
  const LK = (x) => P.kMin + ((x - P.x0) * (P.kMax - P.kMin)) / (P.x1 - P.x0);
  const LT = (y) => P.tMin + ((P.y1 - y) * (P.tMax - P.tMin)) / (P.y1 - P.y0);
  const etat = { K: 0.564, Ti: 1.2 };

  /* Frontières exacte et de Routh-Padé, calculées une fois. */
  const exacte = [];
  const pade = [];
  for (let i = 0; i <= 70; i += 1) {
    const lt = P.tMin + ((P.tMax - P.tMin) * i) / 70;
    const Ti = 10 ** lt;
    const w = w180Pression(Ti);
    const ke = Number.isFinite(w) ? 1 / Lpression(w, 1, Ti).mod : 1e3;
    exacte.push([Math.log10(ke), lt]);
    pade.push([Math.log10(kcritPade(Ti)), lt]);
  }
  const clampX = (lk) => X(Math.max(P.kMin - 0.2, Math.min(P.kMax + 0.2, lk)));

  const svg = svgEl("svg", {
    viewBox: "0 0 720 400",
    role: "img",
    "aria-label": "Domaine de stabilité de la régulation de pression : gain de boucle K de 0,05 à 50 en abscisse logarithmique, temps d'intégrale Ti de 0,03 à 20 secondes en ordonnée logarithmique, domaine instable hachuré à droite de la frontière exacte, frontière de Routh Padé en tirets, réglage de départ repéré par un petit cercle",
  });
  const decor = svgEl("g");
  let d = '<defs><clipPath id="i-do-clip"><rect x="' + P.x0 + '" y="' + P.y0 + '" width="' + (P.x1 - P.x0) + '" height="' + (P.y1 - P.y0) + '"/></clipPath>';
  d += '<pattern id="i-do-hach" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)"><path d="M0 0V10" stroke="currentColor" stroke-width="0.8"/></pattern></defs>';
  let poly = "M" + clampX(exacte[0][0]).toFixed(1) + " " + Y(exacte[0][1]).toFixed(1);
  for (const [lk, lt] of exacte) poly += "L" + clampX(lk).toFixed(1) + " " + Y(lt).toFixed(1);
  poly += "L" + (P.x1 + 20) + " " + (P.y0 - 20) + "L" + (P.x1 + 20) + " " + (P.y1 + 20) + "Z";
  d += '<g clip-path="url(#i-do-clip)"><path d="' + poly + '" fill="url(#i-do-hach)" fill-opacity="0.55" stroke="none"/>';
  d += TRAITS + ' stroke-width="2.4"><path d="' + exacte.map(([lk, lt], i) => (i ? "L" : "M") + clampX(lk).toFixed(1) + " " + Y(lt).toFixed(1)).join("") + '"/></g>';
  d += TRAITS + ' stroke-width="1.6" stroke-dasharray="8 5"><path d="' + pade.map(([lk, lt], i) => (i ? "L" : "M") + clampX(lk).toFixed(1) + " " + Y(lt).toFixed(1)).join("") + '"/></g></g>';
  d += TRAITS + ' stroke-width="1.2"><rect x="' + P.x0 + '" y="' + P.y0 + '" width="' + (P.x1 - P.x0) + '" height="' + (P.y1 - P.y0) + '"/>';
  let grille = "";
  for (let e = -1; e <= 1; e += 1) grille += "M" + X(e).toFixed(1) + " " + P.y0 + "V" + P.y1;
  for (let e = -1; e <= 1; e += 1) grille += "M" + P.x0 + " " + Y(e).toFixed(1) + "H" + P.x1;
  d += '<path d="' + grille + '" stroke-width="0.5" stroke-dasharray="2 4"/>';
  d += '<circle cx="' + X(Math.log10(0.564)).toFixed(1) + '" cy="' + Y(Math.log10(1.2)).toFixed(1) + '" r="11" stroke-width="1.4"/></g>';
  d += ECRITS.replace('font-size="12"', 'font-size="11"');
  for (const [v, l] of [[0.1, "0,1"], [1, "1"], [10, "10"]]) d += texte(X(Math.log10(v)), P.y1 + 16, l, ' text-anchor="middle"');
  for (const [v, l] of [[0.1, "0,1"], [1, "1"], [10, "10"]]) d += texte(P.x0 - 6, Y(Math.log10(v)) + 4, l, ' text-anchor="end"');
  d += texte(P.x1, P.y1 + 32, "gain de boucle K = Kc Kg", ' text-anchor="end"') + texte(P.x0 - 6, P.y0 - 6, "Ti (s)");
  d += texte(P.x1 - 8, P.y0 + 18, "instable", ' text-anchor="end" font-weight="700"') + texte(P.x0 + 8, P.y0 + 18, "stable", ' font-weight="700"');
  d += texte(X(Math.log10(0.564)) + 14, Y(Math.log10(1.2)) + 26, "réglage de départ") + "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#i-domaine-valeurs", [
    { id: "reglage", libelle: "Réglage K, Kc et Ti", format: (v) => v },
    { id: "routh", libelle: "Routh sur le polynôme de Padé", format: (v) => v },
    { id: "marges", libelle: "Marges exactes MG, MP, Mm", format: (v) => v },
    { id: "crit", libelle: "Gain critique exact à ce Ti", format: (v) => v },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#i-domaine-trace", {
    titre: "Pression vraie rapportée à la consigne après un échelon",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "p/pc",
    yUnite: "",
    xMin: 0,
    xMax: 20,
    yMin: -0.5,
    yMax: 2.2,
    ratio: 0.36,
    series: [{ id: "p", nom: "pression p(t)/pc", points: [] }],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 1, "consigne", [9, 5]);
      ligneH(c, r, couleurs, 1.05, null, [2, 4]);
      ligneH(c, r, couleurs, 0.95, null, [2, 4]);
    },
  });
  if (trace) ressources.push(trace);

  let attente = 0;
  function recalculerReponse() {
    attente = 0;
    const res = reponsePression(etat.K, etat.Ti);
    if (trace) trace.definirDonnees("p", tronquer(res.t, res.y, -0.5, 2.2));
  }

  function toutRecalculer() {
    const { K, Ti } = etat;
    const R = routh(polyPressionPade(K, Ti));
    const m = margesPression(K, Ti);
    const stable = Number.isFinite(m.gm) ? m.gm > 0 : true;
    if (valeurs) {
      valeurs.maj({
        reglage: "K = " + nb(api, K, 3) + " ; Kc = " + nb(api, K / PR.Kg, 2) + " Hz/bar ; Ti = " + nb(api, Ti, Ti < 1 ? 3 : 2) + " s",
        routh: R.changements === 0 ? "première colonne de même signe : stable" : R.changements + " changements de signe : instable",
        marges:
          nb(api, m.gm, 1) + " dB ; " + (Number.isFinite(m.pm) ? nb(api, m.pm, 1) + " °" : "sans coupure") + " ; " + nb(api, m.mm, 3),
        crit: "K = " + nb(api, m.kcrit, 2) + " (Kc = " + nb(api, m.kcrit / PR.Kg, 1) + " Hz/bar) à " + nb(api, m.w180, 2) + " rad/s",
        verdict: stable ? (m.pm < 30 || m.mm < 0.4 ? "stable mais marges insuffisantes" : "stable") : "instable : la pression pompe",
      });
    }
    if (!attente) attente = requestAnimationFrame(recalculerReponse);
  }
  nettoyeurs.push(() => {
    if (attente) cancelAnimationFrame(attente);
  });

  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: P.x0, y: P.y0, largeur: P.x1 - P.x0, hauteur: P.y1 - P.y0 },
    valeur: { x: X(Math.log10(etat.K)), y: Y(Math.log10(etat.Ti)) },
    pas: 4,
    libelle: "Réglage du régulateur : gain de boucle en abscisse, temps d'intégrale en ordonnée",
    format: (mesure) => "K = " + nb(api, 10 ** LK(mesure.x), 3) + ", Ti = " + nb(api, 10 ** LT(mesure.y), 3) + " s",
    rappel(mesure) {
      etat.K = 10 ** LK(mesure.x);
      etat.Ti = 10 ** LT(mesure.y);
      toutRecalculer();
    },
  });
  if (poignee) ressources.push(poignee);

  toutRecalculer();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.4 }));
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k1-condition",
      titre: "Fondamental 1 : condition nécessaire sur les coefficients",
      niveau: "fondamental",
      enonce:
        "<p>On considère cinq polynômes caractéristiques : (a) $s^3 + 4s^2 + 5s + 2$ ; (b) $s^3 + 2s^2 - 3s + 1$ ; (c) $s^3 + 5s + 2$ ; " +
        "(d) $s^2 + 3s + 7$ ; (e) $s^3 + s^2 + 2s + 8$. Quelles affirmations sont justifiées ?</p>",
      multiple: true,
      options: [
        { texte: "(b) est instable : un coefficient est de signe opposé aux autres.", juste: true },
        { texte: "(c) n'est pas asymptotiquement stable : le coefficient de $s^2$ est nul.", juste: true },
        { texte: "(d) est stable : au degré 2, des coefficients tous positifs suffisent.", juste: true },
        { texte: "(e) est stable puisque tous ses coefficients sont positifs." },
        { texte: "(a) est instable parce qu'il possède une racine double." },
      ],
      etapes: [
        { texte: "Condition nécessaire : un coefficient nul ou négatif, avec $a_n &gt; 0$, interdit la stabilité asymptotique : (b) et (c) sont écartés." },
        { texte: "Au degré 2, $s^2 + 3s + 7$ a des racines de partie réelle $-3/2$ : coefficients positifs suffisent." },
        { texte: "Au degré 3, il faut $a_2 a_1 &gt; a_3 a_0$ : (a) $4 \\times 5 = 20 &gt; 2$, stable, racines $-1$, $-1$, $-2$ ; (e) $1 \\times 2 = 2 &lt; 8$, instable.", note: "Une racine double dans le demi-plan gauche donne un terme $t\\,e^{-t}$, qui décroît : (a) est stable." },
      ],
      visuelCorrection: correctionEtapes(
        [
          "(b) s³ + 2s² - 3s + 1 : signe - => instable",
          "(c) s³ + 0 s² + 5s + 2 : coefficient nul => non stable",
          "(d) degré 2, tout positif => stable",
          "(a) Routh : 1, 4, (4×5 - 1×2)/4 = 4,5, 2 => stable",
          "(e) Routh : 1, 1, (1×2 - 1×8)/1 = -6, 8 => 2 changements",
        ],
        "Condition nécessaire, puis Routh quand elle ne suffit pas."
      ),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-gain-critique",
      titre: "Fondamental 2 : gain critique d'une boucle à trois pôles",
      niveau: "fondamental",
      enonce:
        "<p>Une boucle à retour unitaire a pour boucle ouverte $L(s) = \\dfrac{K}{(s + 1)(s + 2)(s + 3)}$, $K &gt; 0$. Pour quelle valeur de $K$ la boucle " +
        "fermée oscille-t-elle de façon entretenue ? Quelle est alors la pulsation d'oscillation ?</p>",
      valeur: 60,
      unite: "",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Gain critique K",
      etapes: [
        { texte: "$D(s) = (s + 1)(s + 2)(s + 3) + K = s^3 + 6s^2 + 11s + 6 + K$." },
        { texte: "Routh : $s^3$ : $1$, $11$ ; $s^2$ : $6$, $6 + K$ ; $s^1$ : $(66 - 6 - K)/6 = (60 - K)/6$ ; $s^0$ : $6 + K$." },
        { texte: "Stabilité : $-6 &lt; K &lt; 60$. Au gain critique $K = 60$, la ligne $s^1$ s'annule." },
        { texte: "Polynôme auxiliaire $6s^2 + 66 = 0$ : $\\omega = \\sqrt{11} = 3{,}317\\ \\mathrm{rad/s}$, période $1{,}894\\ \\mathrm{s}$.", note: "Contrôle fréquentiel : à $\\omega = \\sqrt{11}$, la phase vaut $-180^\\circ$ et $|L| = 60/60 = 1$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const den = (K) => [1, 6, 11, 6 + K];
        const r30 = sousEchantillonner(reponseIndicielle([30], den(30), 12, 2e-3), 5);
        const r60 = sousEchantillonner(reponseIndicielle([60], den(60), 12, 2e-3), 5);
        traceCorrection(moteur, conteneur, {
          titre: "Réponse indicielle de la boucle fermée",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "y",
          yUnite: "",
          xMin: 0,
          xMax: 12,
          yMin: -0.5,
          yMax: 2.2,
          series: [
            { id: "a", nom: "K = 30 : amortie", points: tronquer(r30.t, r30.y, -0.5, 2.2) },
            { id: "b", nom: "K = 60 : entretenue", points: tronquer(r60.t, r60.y, -0.5, 2.2) },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-ligne-nulle",
      titre: "Intermédiaire 1 : ligne nulle et oscillation entretenue",
      niveau: "intermediaire",
      enonce:
        "<p>Le polynôme caractéristique d'un asservissement vaut $D(s) = s^4 + s^3 + 3s^2 + 2s + 2$. Construisez le tableau de Routh. Une ligne s'annule : " +
        "quelle est la pulsation, en $\\mathrm{rad/s}$, de l'oscillation entretenue qu'elle révèle ? Le système a-t-il des pôles instables ?</p>",
      valeur: Math.SQRT2,
      unite: "rad/s",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Pulsation",
      etapes: [
        { texte: "$s^4$ : $1$, $3$, $2$ ; $s^3$ : $1$, $2$ ; $s^2$ : $(1 \\times 3 - 1 \\times 2)/1 = 1$, $(1 \\times 2 - 1 \\times 0)/1 = 2$." },
        { texte: "$s^1$ : $(1 \\times 2 - 1 \\times 2)/1 = 0$ : ligne nulle. Polynôme auxiliaire $A(s) = s^2 + 2$, dérivée $2s$ : la ligne devient $2$." },
        { texte: "$s^0$ : $2$. Première colonne $1, 1, 1, 2, 2$ : aucun changement de signe, donc aucun pôle à droite." },
        { texte: "$A(s) = 0$ donne $s = \\pm j\\sqrt2$ : pulsation $1{,}414\\ \\mathrm{rad/s}$, système marginalement stable.", note: "Vérification : $D(s) = (s^2 + 2)(s^2 + s + 1)$, le second facteur a des racines $-0{,}5 \\pm 0{,}866j$." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 600 300",
          dessinPlanPoles("k3-fl", [{ s: 0, w: Math.SQRT2, nom: "± j 1,414" }, { s: -0.5, w: 0.866, nom: "-0,5 ± 0,866j" }], -3, 1.5, 2),
          "Deux pôles sur l'axe imaginaire, révélés par la ligne nulle, et deux pôles amortis."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-instable",
      titre: "Intermédiaire 2 : stabiliser un procédé instable",
      niveau: "intermediaire",
      enonce:
        "<p>Un procédé instable, de pôle $+1\\ \\mathrm{s^{-1}}$, est bouclé par un correcteur ; la boucle ouverte vaut " +
        "$L(s) = \\dfrac{K(s + 2)}{(s - 1)(s + 5)}$, retour unitaire soustrait. Quel est le plus petit gain $K$ qui stabilise la boucle fermée ? " +
        "Pourquoi la lecture habituelle de la marge de gain serait-elle trompeuse ici ?</p>",
      valeur: 2.5,
      unite: "",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Gain minimal K",
      etapes: [
        { texte: "$D(s) = (s - 1)(s + 5) + K(s + 2) = s^2 + (4 + K)s + (2K - 5)$." },
        { texte: "Degré 2 : stable si et seulement si $4 + K &gt; 0$ et $2K - 5 &gt; 0$, soit $K &gt; 2{,}5$." },
        { texte: "La boucle ouverte a $P = 1$ pôle instable : il faut que la courbe de Nyquist entoure $-1$ une fois dans le sens trigonométrique, ce qui exige un gain suffisant, pas un gain borné.", note: "La marge se lit ici comme un facteur de réduction : à $K = 5$, on peut diviser le gain par $2$ avant l'instabilité." },
      ],
      visuelCorrection(conteneur, moteur) {
        const rep = (K) => sousEchantillonner(reponseIndicielle([K, 2 * K], [1, 4 + K, 2 * K - 5], 5, 1e-3), 5);
        const a = rep(2);
        const b = rep(4);
        traceCorrection(moteur, conteneur, {
          titre: "Réponse indicielle de la boucle fermée",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "y",
          yUnite: "",
          xMin: 0,
          xMax: 5,
          yMin: -1,
          yMax: 6,
          series: [
            { id: "a", nom: "K = 2 : divergente", points: tronquer(a.t, a.y, -1, 6) },
            { id: "b", nom: "K = 4 : stable", points: tronquer(b.t, b.y, -1, 6) },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-filtre",
      titre: "Avancé : gain critique de la boucle de position avec filtre de mesure",
      niveau: "avance",
      enonce:
        "<p>La mesure de position de l'actionneur passe par un filtre $1/(1 + \\tau_f s)$, $\\tau_f = 1\\ \\mathrm{ms}$. La boucle ouverte devient " +
        "$L(s) = K_v/\\bigl(s(1 + \\tau_1 s)(1 + \\tau_2 s)(1 + \\tau_f s)\\bigr)$ avec $\\tau_1 = 3{,}797\\ \\mathrm{ms}$ et $\\tau_2 = 1{,}066\\ \\mathrm{ms}$. " +
        "Par Routh, quel est le gain critique $K_v$, en $\\mathrm{s^{-1}}$ ? Quelle est la pulsation d'oscillation ?</p>",
      valeur: 607.1,
      unite: "s⁻¹",
      tolerance: 0.02,
      chiffres: 0,
      libelleChamp: "Gain critique Kv",
      etapes: [
        { texte: "$D(s) = a_4 s^4 + a_3 s^3 + a_2 s^2 + s + K_v$ avec $a_4 = \\tau_1\\tau_2\\tau_f = 4{,}046 \\times 10^{-9}$, $a_3 = \\tau_1\\tau_2 + (\\tau_1 + \\tau_2)\\tau_f = 8{,}908 \\times 10^{-6}$, $a_2 = \\tau_1 + \\tau_2 + \\tau_f = 5{,}862 \\times 10^{-3}$." },
        { texte: "Routh : $b_1 = a_2 - a_4/a_3 = 5{,}862 \\times 10^{-3} - 4{,}542 \\times 10^{-4} = 5{,}408 \\times 10^{-3}$, $b_2 = K_v$ ; $c_1 = 1 - a_3 K_v/b_1$." },
        { texte: "$c_1 &gt; 0 \\iff K_v &lt; b_1/a_3 = 5{,}408 \\times 10^{-3}/8{,}908 \\times 10^{-6} = 607{,}1\\ \\mathrm{s^{-1}}$." },
        { texte: "Polynôme auxiliaire $b_1 s^2 + K_v = 0$ : $\\omega = \\sqrt{607{,}1/5{,}408 \\times 10^{-3}} = 335{,}0\\ \\mathrm{rad/s}$.", note: "Un filtre plus rapide que les deux constantes du moteur divise pourtant le gain critique par deux, contre $1201{,}8\\ \\mathrm{s^{-1}}$ sans filtre." },
      ],
      visuelCorrection(conteneur, moteur) {
        const v = etapes(
          [
            "s⁴ : 4,046e-9      5,862e-3     Kv",
            "s³ : 8,908e-6      1",
            "s² : b1 = 5,408e-3  Kv",
            "s¹ : c1 = 1 - 8,908e-6 Kv / 5,408e-3",
            "s⁰ : Kv",
            "c1 = 0  =>  Kv = 607,1 s⁻¹ ;  ω = √(Kv / b1) = 335,0 rad/s",
          ],
          "Tableau de Routh littéral : seul c1 dépend du gain de façon critique."
        );
        schemaCorrection(moteur, conteneur, v.viewBox, v.dessin, v.legende);
        const a = reponsePosition(500, 0.001, 0.08);
        const b = reponsePosition(607.1, 0.001, 0.08);
        traceCorrection(moteur, conteneur, {
          titre: "Boucle de position avec filtre de 1 ms",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "θ",
          yUnite: "rad",
          xMin: 0,
          xMax: 80,
          yMin: -0.5,
          yMax: 2.2,
          series: [
            { id: "a", nom: "Kv = 500 s⁻¹", points: tronquer(a.t, a.y, -0.5, 2.2, 1000) },
            { id: "b", nom: "Kv = 607,1 s⁻¹ : entretenue", points: tronquer(b.t, b.y, -0.5, 2.2, 1000) },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-diagnostic-pression",
      titre: "Diagnostic industriel : la pression se met à pomper après un réglage",
      niveau: "diagnostic",
      enonce:
        "<p>La régulation de pression du site fonctionnait avec $K_c = 3{,}76\\ \\mathrm{Hz/bar}$ et $T_i = 1{,}2\\ \\mathrm{s}$. Un technicien a voulu " +
        "\"ralentir l'intégrale\" à $T_i = 3\\ \\mathrm{s}$ et a saisi $0{,}05$ en pensant à des minutes ; le régulateur attend des secondes. Depuis, la " +
        "pression oscille avec une période d'environ $2{,}5\\ \\mathrm{s}$ et une amplitude qui grandit jusqu'à la rampe du variateur. Modèle : " +
        "$K_g = 0{,}15\\ \\mathrm{bar/Hz}$, $\\tau_h = 1{,}2\\ \\mathrm{s}$, $\\tau_c = 0{,}13\\ \\mathrm{s}$, retard $50\\ \\mathrm{ms}$. Quelles conclusions sont " +
        "justifiées ?</p>",
      multiple: true,
      options: [
        { texte: "Avec $T_i = 0{,}05\\ \\mathrm{s}$, on est sous la limite d'environ $0{,}061\\ \\mathrm{s}$ pour ce gain : l'intégrale trop forte retire de la phase et la boucle est instable, vers $2{,}5\\ \\mathrm{rad/s}$.", juste: true },
        { texte: "La période observée, environ $2{,}5\\ \\mathrm{s}$, correspond à la pulsation où la phase de la boucle atteint $-180^\\circ$ : c'est une instabilité de boucle, pas une résonance hydraulique.", juste: true },
        { texte: "Saisir $T_i = 3\\ \\mathrm{s}$, ou revenir à $1{,}2\\ \\mathrm{s}$, rétablit une marge de gain supérieure à $30\\ \\mathrm{dB}$ ; il faut aussi borner le paramètre dans l'automate.", juste: true },
        { texte: "Augmenter $K_c$ amortirait l'oscillation, puisqu'un gain plus fort corrige plus vite." },
        { texte: "La pompe est sous-dimensionnée : une oscillation de pression vient toujours d'un manque de puissance." },
      ],
      etapes: [
        { texte: "$K = K_c K_g = 3{,}76 \\times 0{,}15 = 0{,}564$. Calcul exact : à ce gain, la limite de stabilité est $T_i = 0{,}061\\ \\mathrm{s}$, avec une oscillation à $2{,}65\\ \\mathrm{rad/s}$." },
        { texte: "À $T_i = 0{,}05\\ \\mathrm{s}$ : $\\omega_{180} = 2{,}53\\ \\mathrm{rad/s}$, soit une période de $2{,}48\\ \\mathrm{s}$, et $M_G = -2{,}5\\ \\mathrm{dB}$ : instable, conforme au symptôme." },
        { texte: "À $T_i = 3\\ \\mathrm{s}$, $M_G = 33{,}7\\ \\mathrm{dB}$ ; à $1{,}2\\ \\mathrm{s}$, $33{,}1\\ \\mathrm{dB}$. Augmenter $K_c$ rapprocherait encore la courbe de $-1$.", note: "Toujours lire l'unité de $T_i$ dans la documentation du régulateur : secondes, minutes ou répétitions par minute." },
      ],
      visuelCorrection(conteneur, moteur) {
        const a = reponsePression(0.564, 0.05, 20);
        const b = reponsePression(0.564, 1.2, 20);
        traceCorrection(moteur, conteneur, {
          titre: "Pression après un échelon de consigne",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "p/pc",
          yUnite: "",
          xMin: 0,
          xMax: 20,
          yMin: -0.5,
          yMax: 2.5,
          series: [
            { id: "a", nom: "Ti = 0,05 s : instable", points: tronquer(a.t, a.y, -0.5, 2.5) },
            { id: "b", nom: "Ti = 1,2 s : réglage de départ", points: tronquer(b.t, b.y, -0.5, 2.5) },
          ],
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
      titre: "Question conceptuelle : pourquoi le retard rend tout instable",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi la boucle $K/\\bigl((1 + \\tau_1 s)(1 + \\tau_2 s)\\bigr)$ reste stable pour tout gain $K &gt; 0$, alors que la même " +
        "boucle munie d'un retard pur, si court soit-il, devient instable au-delà d'un gain fini.</p>",
      motsCles: [
        ["phase", "dephasage", "-180", "180"],
        ["retard", "omega t", "wt", "lineaire", "sans limite", "infini", "decroit", "tourne"],
        ["deux poles", "second ordre", "-180 jamais", "n'atteint", "asymptot", "jamais"],
        ["gain", "module", "|l|", "point critique", "-1", "marge"],
      ],
      minimum: 3,
      exemple: "Trois ou quatre phrases : phase du second ordre, phase du retard, gain élevé et point -1.",
      etapes: [
        { texte: "Deux pôles réels apportent chacun au plus $-90^\\circ$ : la phase tend vers $-180^\\circ$ sans l'atteindre ; la courbe de Nyquist ne traverse jamais l'axe réel négatif." },
        { texte: "Sans traversée, aucun gain ne peut amener la courbe sur $-1$ : marge de gain infinie, stabilité pour tout $K$." },
        { texte: "Un retard ajoute $-\\omega T$, sans limite : la phase finit toujours par atteindre $-180^\\circ$ à une pulsation finie, où le gain est fini ; il suffit de multiplier $K$ par l'inverse de ce gain pour atteindre $-1$." },
        { texte: "En pratique, tout système réel contient de petits retards et des pôles négligés : une marge de gain infinie sur le papier n'existe jamais sur site." },
      ],
      visuelCorrection: correctionEtapes(
        [
          "second ordre : arg L de 0° à -180°, jamais atteint",
          "Nyquist ne coupe pas l'axe réel négatif : MG infinie",
          "retard : arg L = ... - ω T, décroît sans limite",
          "-180° atteint à ω180 finie, |L(ω180)| fini",
          "K > 1 / |L1(ω180)| : la courbe entoure -1",
        ],
        "Le retard garantit une traversée de l'axe réel négatif."
      ),
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

const POLES_QUIZ = [
  { s: -2, w: 1, nom: "A" },
  { s: -0.3, w: 3, nom: "B" },
  { s: 0.5, w: 2, nom: "C" },
  { s: -3, w: 0, nom: "D" },
];

function zonesPolesQuiz() {
  const X = (s) => 50 + (520 * (s + 4)) / 6;
  const Y = (w) => 150 - (130 * w) / 4;
  const etiquettes = ["pôle A", "pôle B", "pôle C", "pôle D"];
  return POLES_QUIZ.map((p, k) => ({ cx: X(p.s), cy: Y(p.w), r: 22, etiquette: etiquettes[k], juste: k === 1 }));
}

const VISUELS_QUIZ = [
  etapes(["p = +0,2 ± 5j : partie réelle positive", "enveloppe e^(0,2 t) croissante", "pulsation 5 rad/s : oscillation croissante"], "Pôle complexe à droite de l'axe."),
  etapes(["s³ + s² + 2s + 8 : tout positif", "Routh : 1, 1, -6, 8", "2 changements de signe : instable"], "Condition nécessaire mais non suffisante."),
  etapes(["s³ + 3s² + 3s + K", "a2 a1 > a3 a0 : 3 × 3 > K", "K < 9 ; ω = √3 = 1,732 rad/s"], "Gain critique au troisième degré."),
  etapes(["e^(-sT) n'est pas un polynôme", "équation transcendante : infinité de racines", "Padé : (1 - sT/2)/(1 + sT/2), ou Nyquist exact"], "Retard et Routh."),
  etapes(["MG ≥ 1 / (1 - Mm)", "= 1 / (1 - 0,5) = 2", "20 log10(2) = 6,02 dB"], "Marge de gain garantie par la marge de module."),
  () => ({ viewBox: "0 0 600 300", dessin: dessinPlanPoles("fl-qv6", POLES_QUIZ), legende: "B est le couple stable le plus proche de l'axe imaginaire : enveloppe e^(-0,3 t), oscillation la plus longue." }),
  etapes(["traversée de l'axe réel en -0,4", "MG = 1 / 0,4 = 2,5", "20 log10(2,5) = 7,96 dB"], "Marge de gain lue sur Nyquist."),
  etapes(["procédé de pôle +1 ; boucle K/(s - 1)", "1 + L = 0 : s - 1 + K = 0", "pôle 1 - K < 0 dès que K > 1"], "Une boucle peut stabiliser un procédé instable."),
  etapes(["Kv crit = (τ1 + τ2) / (τ1 τ2)", "= 5 ms / 4e-6 s²", "= 1250 s⁻¹"], "Gain critique de la boucle de position."),
  etapes(["p = -2 ± 2j : ω0 = √8 = 2,828", "ζ = 2 / 2,828", "= 0,707"], "Amortissement lu sur la position des pôles."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Un système possède le couple de pôles $s = +0{,}2 \\pm 5j$. Sa réponse libre est :</p>",
        options: ["une exponentielle décroissante", "une oscillation amortie", "une oscillation entretenue", "une oscillation croissante"],
        bonnes: [3],
        explication: "Partie réelle positive : l'enveloppe $e^{0{,}2t}$ croît ; partie imaginaire non nulle : oscillation à $5\\ \\mathrm{rad/s}$.",
        resume: "Pôle et mode",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Si tous les coefficients d'un polynôme caractéristique du troisième degré sont strictement positifs, le système est stable.</p>",
        reponse: false,
        explication: "La condition est nécessaire, pas suffisante au-delà du degré 2 : il faut aussi $a_2 a_1 &gt; a_3 a_0$. Contre-exemple : $s^3 + s^2 + 2s + 8$.",
        resume: "Condition nécessaire",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Polynôme caractéristique $s^3 + 3s^2 + 3s + K$. Valeur du gain critique $K$ ?</p>",
        valeur: 9,
        unite: "",
        tolerance: 0.01,
        explication: "Condition $a_2 a_1 &gt; a_3 a_0$ : $9 &gt; K$. Au gain critique, $3s^2 + 9 = 0$ donne $\\omega = \\sqrt3 = 1{,}732\\ \\mathrm{rad/s}$.",
        resume: "Gain critique",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi ne peut-on pas appliquer directement le critère de Routh à une boucle contenant un retard pur ?</p>",
        motsCles: [["polynom", "rationnel", "transcendant", "exponentiel", "e^"], ["pade", "approxim", "nyquist", "harmonique"], ["infinite", "infini", "racines"]],
        minimum: 2,
        explication: "$e^{-sT}$ n'est pas un polynôme : l'équation caractéristique devient transcendante, avec une infinité de racines. On approche le retard par Padé ou l'on travaille sur la réponse harmonique exacte, critère de Nyquist.",
        resume: "Retard et Routh",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Une boucle a une marge de module $M_m = 0{,}5$. Quelle marge de gain minimale, en décibels, est ainsi garantie ?</p>",
        valeur: 20 * Math.log10(2),
        unite: "dB",
        tolerance: 0.01,
        explication: "$M_G \\ge 1/(1 - M_m) = 2$, soit $6{,}02\\ \\mathrm{dB}$ ; la marge de phase est au moins $2\\arcsin(0{,}25) = 28{,}96^\\circ$.",
        resume: "Marge de module",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Lequel de ces pôles, ou couples de pôles, donne la réponse oscillante la plus lentement amortie, tout en restant stable ?</p>",
        consigne: "Cliquez sur le pôle correspondant, dans le demi-plan supérieur.",
        viewBox: "0 0 600 300",
        dessin: dessinPlanPoles("fl-q6", POLES_QUIZ),
        zones: zonesPolesQuiz(),
        explication: "B, en $-0{,}3 \\pm 3j$ : partie réelle négative mais petite, enveloppe divisée par deux toutes les $2{,}3\\ \\mathrm{s}$ seulement, $\\zeta = 0{,}1$. C est instable, A et D sont bien amortis.",
        resume: "Lecture du plan complexe",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Le diagramme de Nyquist d'une boucle ouverte stable coupe l'axe réel négatif en $-0{,}4$, une seule fois. La marge de gain vaut :</p>",
        options: ["$0{,}4$, soit $-7{,}96\\ \\mathrm{dB}$", "$2{,}5$, soit $7{,}96\\ \\mathrm{dB}$", "$0{,}6$, soit $-4{,}4\\ \\mathrm{dB}$", "on ne peut rien dire sans la phase"],
        bonnes: [1],
        explication: "La traversée est en $-1/M_G$ : $M_G = 1/0{,}4 = 2{,}5$, soit $20\\log_{10} 2{,}5 = 7{,}96\\ \\mathrm{dB}$.",
        resume: "Marge de gain sur Nyquist",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Une boucle ouverte instable peut donner une boucle fermée stable.</p>",
        reponse: true,
        explication: "Exemple : $L = K/(s - 1)$ donne le pôle fermé $1 - K$, stable dès que $K &gt; 1$. C'est le principe de la lévitation magnétique ou du pendule inversé asservi.",
        resume: "Boucle ouverte instable",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Une boucle de position $K_v/\\bigl(s(1 + \\tau_1 s)(1 + \\tau_2 s)\\bigr)$ a $\\tau_1 = 4\\ \\mathrm{ms}$ et $\\tau_2 = 1\\ \\mathrm{ms}$. Gain critique, en $\\mathrm{s^{-1}}$ ?</p>",
        valeur: 1250,
        unite: "s⁻¹",
        tolerance: 0.01,
        explication: "$K_{v,\\text{crit}} = (\\tau_1 + \\tau_2)/(\\tau_1\\tau_2) = 5 \\times 10^{-3}/(4 \\times 10^{-6}) = 1250\\ \\mathrm{s^{-1}}$, oscillation à $1/\\sqrt{\\tau_1\\tau_2} = 500\\ \\mathrm{rad/s}$.",
        resume: "Gain critique littéral",
      },
      {
        type: "calcul",
        enonce: repere(9) + "<p>Les pôles dominants d'une boucle fermée valent $-2 \\pm 2j$. Quel est leur amortissement $\\zeta$ ?</p>",
        valeur: 1 / Math.SQRT2,
        unite: "",
        tolerance: 0.01,
        explication: "$\\omega_0 = |p| = \\sqrt{8} = 2{,}828\\ \\mathrm{rad/s}$ et $\\zeta = -\\sigma/\\omega_0 = 2/2{,}828 = 0{,}707$ : le couple est sur la droite à $45^\\circ$.",
        resume: "Amortissement",
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
      { categorie: "Définition", question: "Quand un système linéaire est-il asymptotiquement stable ?", reponse: "Quand tous ses pôles ont une partie réelle strictement négative : chaque mode $e^{p_k t}$ s'éteint." },
      { categorie: "Modes", question: "Que fixent la partie réelle et la partie imaginaire d'un pôle ?", reponse: "La partie réelle fixe l'enveloppe $e^{\\sigma t}$, donc la stabilité et la vitesse d'extinction ; la partie imaginaire fixe la pulsation d'oscillation." },
      { categorie: "Boucle", question: "Quelle équation donne les pôles d'une boucle fermée ?", reponse: "$1 + L(s) = 0$, soit $D_L + N_L = 0$ avec $L = N_L/D_L$. Toutes les entrées partagent ce dénominateur." },
      { categorie: "Condition nécessaire", question: "Que conclure d'un coefficient nul ou négatif dans $D(s)$, avec $a_n &gt; 0$ ?", reponse: "Au moins une racine à partie réelle positive ou nulle : pas de stabilité asymptotique. Des coefficients positifs ne suffisent qu'aux degrés 1 et 2." },
      { categorie: "Routh", question: "Que compte-t-on dans le tableau de Routh ?", reponse: "Les changements de signe de la première colonne : leur nombre égale le nombre de racines à partie réelle positive." },
      { categorie: "Troisième degré", question: "Condition de stabilité de $a_3 s^3 + a_2 s^2 + a_1 s + a_0$ ?", reponse: "Tous les $a_i &gt; 0$ et $a_2 a_1 &gt; a_3 a_0$. À l'égalité, oscillation à $\\omega = \\sqrt{a_1/a_3}$." },
      { categorie: "Ligne nulle", question: "Que signifie une ligne entière nulle dans le tableau de Routh ?", reponse: "Des racines symétriques, souvent $\\pm j\\omega$ : le polynôme auxiliaire formé avec la ligne précédente les donne ; on continue avec sa dérivée." },
      { categorie: "Nyquist", question: "Énoncé du critère de Nyquist ?", reponse: "$Z = N + P$ : pôles fermés instables = tours horaires autour de $-1$ + pôles ouverts instables. Pour $P = 0$, laisser $-1$ à gauche." },
      { categorie: "Marges", question: "Que mesure la marge de module ?", reponse: "La plus petite distance entre $L(j\\omega)$ et $-1$, soit $1/\\max|S|$ ; elle garantit $M_G \\ge 1/(1 - M_m)$ et $M_\\varphi \\ge 2\\arcsin(M_m/2)$." },
      { categorie: "Retard", question: "Comment traiter un retard pur pour évaluer la stabilité ?", reponse: "Padé, $(1 - sT/2)/(1 + sT/2)$, pour garder Routh et obtenir un ordre de grandeur ; réponse harmonique exacte et Nyquist pour la valeur." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["première colonne : +, +, -, +", "changements : + vers - puis - vers +", "2 pôles à partie réelle positive"], "Compter les changements de signe."),
  etapes(["D = s(s + 1)(s + 4) + K = s³ + 5s² + 4s + K", "a2 a1 > a3 a0 : 20 > K", "K crit = 20 ; ω = √(a1 / a3) = 2 rad/s"], "Gain critique par Routh."),
  etapes(["MG = 6,02 dB : facteur 2", "gain × 2 : |L(ω180)| = 1", "courbe sur -1 : limite de stabilité"], "Marge de gain et facteur de gain."),
  etapes(["MP = 180° + arg L(jωc)", "= 180 - 150", "= 30°"], "Marge de phase."),
  etapes(["|1/(1 + j)| = 1/√2", "20 log10(0,7071)", "= -3,01 dB"], "Gain d'un pôle à sa cassure."),
  etapes(["i = C dv/dt", "= 5e-9 × 5e9 V/s", "= 25 A"], "Courant de mode commun injecté par un front."),
  etapes(["m = 410 / 20 000 = 0,0205", "Z' = Z / m² = 0,1 / 4,20e-4", "= 237,9 Ω"], "Impédance ramenée au primaire."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Cette séance. La première colonne d'un tableau de Routh est $[2 ; 5 ; -1 ; 3]$. Combien de pôles ont une partie réelle positive ?</p>",
        options: ["$0$", "$1$", "$2$", "$3$"],
        bonnes: [2],
        explication: "Deux changements de signe, de $5$ à $-1$ puis de $-1$ à $3$ : deux pôles instables.",
        resume: "Changements de signe",
      },
      {
        type: "calcul",
        enonce: repere(1) + "<p>Cette séance. Boucle ouverte $L(s) = \\dfrac{K}{s(s + 1)(s + 4)}$, retour unitaire. Gain critique $K$ ?</p>",
        valeur: 20,
        unite: "",
        tolerance: 0.01,
        explication: "$D = s^3 + 5s^2 + 4s + K$ ; $5 \\times 4 &gt; K$ : $K_{\\text{crit}} = 20$, oscillation à $\\omega = 2\\ \\mathrm{rad/s}$.",
        resume: "Gain critique",
      },
      {
        type: "vraiFaux",
        enonce: repere(2) + "<p>Cette séance. Doubler le gain d'une boucle dont la marge de gain vaut $6{,}02\\ \\mathrm{dB}$ la place à la limite de stabilité.</p>",
        reponse: true,
        explication: "$6{,}02\\ \\mathrm{dB}$ correspond à un facteur $2$ : après doublement, $|L(j\\omega_{180})| = 1$ et la courbe de Nyquist passe par $-1$.",
        resume: "Marge de gain",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours précédent. À la pulsation de coupure $\\omega_c$, $\\arg L(j\\omega_c) = -150^\\circ$. Marge de phase, en degrés ?</p>",
        valeur: 30,
        unite: "°",
        tolerance: 0.01,
        explication: "$M_\\varphi = 180 - 150 = 30^\\circ$ : insuffisant au regard de la règle usuelle de $45^\\circ$.",
        resume: "Marge de phase",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Cours précédent. Gain, en décibels, de $1/(1 + j\\omega\\tau)$ à $\\omega = 1/\\tau$ ?</p>",
        valeur: -10 * Math.log10(2),
        unite: "dB",
        tolerance: 0.01,
        explication: "$|1/(1 + j)| = 1/\\sqrt2$, soit $-3{,}01\\ \\mathrm{dB}$, avec une phase de $-45^\\circ$.",
        resume: "Pôle à la cassure",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours vieux d'une semaine. Un front de tension de $5\\ \\mathrm{kV/\\mu s}$ attaque une capacité parasite de $5\\ \\mathrm{nF}$ vers la terre. Courant de mode commun, en ampères ?</p>",
        valeur: 25,
        unite: "A",
        tolerance: 0.02,
        explication: "$i = C\\,dv/dt = 5 \\times 10^{-9} \\times 5 \\times 10^{9} = 25\\ \\mathrm{A}$ pendant le front : d'où les filtres et le retour de mode commun soigné.",
        resume: "Mode commun",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours vieux d'un mois. Transformateur idéal $20\\ \\mathrm{kV}$ / $410\\ \\mathrm{V}$. Une impédance de $0{,}1\\ \\Omega$ au secondaire, vue du primaire, vaut combien d'ohms ?</p>",
        valeur: 0.1 * (20000 / 410) ** 2,
        unite: "Ω",
        tolerance: 0.02,
        explication: "$Z' = Z/m^2$ avec $m = 410/20\\,000 = 0{,}0205$ : $Z' = 0{,}1/4{,}203 \\times 10^{-4} = 237{,}9\\ \\Omega$.",
        resume: "Impédance ramenée",
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
    titre: "Où en suis-je sur les critères de stabilité ?",
  });
  if (auto) ressources.push(auto);
}
