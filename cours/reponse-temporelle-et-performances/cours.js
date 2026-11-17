/* ==========================================================================
   cours/reponse-temporelle-et-performances/cours.js
   Réponse temporelle et performances : cuve du premier ordre animée, plan
   des pôles et réponse indicielle avec indicateurs, boucle de vitesse
   proportionnelle de l'actionneur de vanne, réponse du groupe de pompage
   limitée par la rampe, exercices, quiz, cartes, révision et bilan.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = 2 * Math.PI;

/* Actionneur de vanne : K et R du projet, L, J et f supposés. */
const MOT = { K: 0.07, R: 1.2, L: 1.0e-3, J: 2.0e-5, f: 3.6e-5 };
const A2 = MOT.L * MOT.J;
const A1 = MOT.R * MOT.J + MOT.L * MOT.f;
const A0 = MOT.R * MOT.f + MOT.K * MOT.K;
const G0 = MOT.K / A0; /* 14,16 rad/(s.V) */
const T12 = A2 / A0; /* tau1 tau2 = 4,046e-6 s² */
const TS = A1 / A0; /* tau1 + tau2 = 4,862 ms */
const ECHELON_W = 20; /* rad/s */
const T_CR = 0.01; /* s, instant d'application du couple de charge */

/* Groupe de pompage sous commande U/f, linéarisé au point de service. */
const TAU_P = 0.5 / 76.31;
const GAIN_P = 74.18 / 76.31;

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

function pointRepere(c, repere, couleurs, x, y, libelle) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return;
  if (py < repere.boite.y - 2 || py > repere.boite.y + repere.boite.h + 2) return;
  c.save();
  c.fillStyle = couleurs.accent;
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.2;
  c.beginPath();
  c.arc(px, py, 5, 0, TAU);
  c.fill();
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

/* --------------------------------------------------------------------------
   Modèles et indicateurs
   -------------------------------------------------------------------------- */

/** Réponse indicielle unité du second ordre canonique. */
function reponse2(z, w0, t) {
  if (t <= 0) return 0;
  if (z < 1 - 1e-9) {
    const r = Math.sqrt(1 - z * z);
    const wd = w0 * r;
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z / r) * Math.sin(wd * t));
  }
  if (z <= 1 + 1e-9) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const r = Math.sqrt(z * z - 1);
  const s1 = -w0 * (z - r);
  const s2 = -w0 * (z + r);
  return 1 + (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s1 - s2);
}

/** Indicateurs mesurés sur une réponse échantillonnée, valeur finale yf. */
function indicateurs(ts, ys, yf, tol = 0.05) {
  const res = { tr: NaN, tpic: NaN, D: 0, ts: NaN, ymax: -Infinity };
  if (!ts.length || !Number.isFinite(yf) || Math.abs(yf) < 1e-12) return res;
  let t10 = NaN;
  let t90 = NaN;
  let imax = 0;
  for (let i = 0; i < ts.length; i += 1) {
    const v = ys[i] / yf;
    if (Number.isNaN(t10) && v >= 0.1) t10 = i ? ts[i - 1] + ((0.1 - ys[i - 1] / yf) / (v - ys[i - 1] / yf)) * (ts[i] - ts[i - 1]) : ts[i];
    if (Number.isNaN(t90) && v >= 0.9) t90 = i ? ts[i - 1] + ((0.9 - ys[i - 1] / yf) / (v - ys[i - 1] / yf)) * (ts[i] - ts[i - 1]) : ts[i];
    if (ys[i] / yf > ys[imax] / yf) imax = i;
  }
  res.tr = t90 - t10;
  res.ymax = ys[imax];
  res.D = Math.max(0, (ys[imax] / yf - 1) * 100);
  res.tpic = res.D > 1e-6 ? ts[imax] : NaN;
  let dernier = -1;
  for (let i = 0; i < ts.length; i += 1) if (Math.abs(ys[i] / yf - 1) > tol) dernier = i;
  res.ts = dernier < 0 ? 0 : dernier >= ts.length - 1 ? NaN : ts[dernier + 1];
  return res;
}

/** Indicateurs du second ordre canonique, calculés sur la réponse exacte. */
function indicateursCanoniques(z, w0, tol = 0.05) {
  const tmax = Math.max(12, 45 / Math.max(z, 0.05)) / w0;
  const n = 6000;
  const ts = [];
  const ys = [];
  for (let i = 0; i <= n; i += 1) {
    const t = (tmax * i) / n;
    ts.push(t);
    ys.push(reponse2(z, w0, t));
  }
  return indicateurs(ts, ys, 1, tol);
}

function depassement(z) {
  return z < 1 ? 100 * Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z)) : 0;
}

/** Boucle de vitesse P de l'actionneur : pôles et paramètres canoniques. */
function boucleP(Kp) {
  const Kb = Kp * G0;
  const w0 = Math.sqrt((1 + Kb) / T12);
  const z = TS / (2 * Math.sqrt(T12 * (1 + Kb)));
  const disc = TS * TS - 4 * T12 * (1 + Kb);
  let poles;
  if (disc >= 0) {
    const r = Math.sqrt(disc);
    poles = [
      { re: (-TS + r) / (2 * T12), im: 0 },
      { re: (-TS - r) / (2 * T12), im: 0 },
    ];
  } else {
    const r = Math.sqrt(-disc) / (2 * T12);
    poles = [
      { re: -TS / (2 * T12), im: r },
      { re: -TS / (2 * T12), im: -r },
    ];
  }
  return { Kb, w0, z, poles, err: 1 / (1 + Kb) };
}

/** Simulation de la boucle : état (i, Omega), u = Kp (Omega_c - Omega). */
function simulerBoucle(Kp, Cr, tmax, h = 2e-6) {
  const n = Math.round(tmax / h);
  const pas = 25;
  const res = { t: [], w: [], i: [], u: [] };
  let x = [0, 0];
  const f = (t, s) => {
    const u = Kp * (ECHELON_W - s[1]);
    const c = t >= T_CR ? Cr : 0;
    return [(u - MOT.R * s[0] - MOT.K * s[1]) / MOT.L, (MOT.K * s[0] - MOT.f * s[1] - c) / MOT.J];
  };
  for (let k = 0; k <= n; k += 1) {
    const t = k * h;
    if (k % pas === 0) {
      res.t.push(t);
      res.i.push(x[0]);
      res.w.push(x[1]);
      res.u.push(Kp * (ECHELON_W - x[1]));
    }
    x = pasRK4(f, t, x, h);
  }
  return res;
}

/** Réponse du groupe de pompage à un échelon de vitesse de synchronisme dW, pente limitée. */
function reponsePompe(dW, pente, tmax, n = 3000) {
  const h = tmax / n;
  const res = { t: [], libre: [], rampe: [], sync: [] };
  let yl = 0;
  let yr = 0;
  for (let k = 0; k <= n; k += 1) {
    const t = k * h;
    const sync = pente > 0 ? Math.min(dW, pente * t) : dW;
    res.t.push(t);
    res.libre.push(yl);
    res.rampe.push(yr);
    res.sync.push(sync);
    /* Intégration exacte d'un premier ordre à entrée constante sur le pas. */
    const a = Math.exp(-h / TAU_P);
    const syncMilieu = pente > 0 ? Math.min(dW, pente * (t + h / 2)) : dW;
    yl = GAIN_P * dW + (yl - GAIN_P * dW) * a;
    yr = GAIN_P * syncMilieu + (yr - GAIN_P * syncMilieu) * a;
  }
  return res;
}

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  detruire();
  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireCuve(racine, api);
  construirePoles(racine, api);
  construireBoucle(racine, api);
  construireCourbeExemple(racine, api);
  construirePompe(racine, api);
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
    ["#e-signaux-figure svg", 1.2],
    ["#e-premier-figure svg", 1.6],
    ["#e-boucle-figure svg", 1.4],
    ["#e-boucle-svg", 1.4],
    ["#f-schema-principal svg", 2.2],
    ["#i-chaine-figure svg", 1.6],
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
      id: "c1-logarithme",
      titre: "Instant d'un passage à 90 %",
      niveau: "fondamental",
      enonce:
        "<p>Une sortie évolue comme $y(t) = 1 - e^{-t/\\tau}$ avec $\\tau = 2\\ \\mathrm{s}$. À quel instant atteint-elle $0{,}9$, en secondes ?</p>",
      valeur: 2 * Math.log(10),
      unite: "s",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Instant",
      etapes: [
        { texte: "$1 - e^{-t/\\tau} = 0{,}9 \\iff e^{-t/\\tau} = 0{,}1$." },
        { texte: "$t = \\tau\\ln 10 = 2 \\times 2{,}303$." },
        { texte: "$t = 4{,}61\\ \\mathrm{s}$.", note: "Le passage à $10\\ \\%$ a lieu en $\\tau\\ln(10/9) = 0{,}21\\ \\mathrm{s}$ : l'écart des deux est le temps de montée, $\\tau\\ln 9$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Passage à 90 % d'une exponentielle",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "y",
          yUnite: "",
          xMin: 0,
          xMax: 10,
          yMin: 0,
          yMax: 1.1,
          series: [{ id: "y", nom: "y(t) = 1 - exp(-t/2)", fonction: (t) => 1 - Math.exp(-t / 2) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0.9, "0,9");
            pointRepere(c, r, couleurs, 2 * Math.log(10), 0.9, "t = 4,61 s");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-poles",
      titre: "Pulsation propre à partir du dénominateur",
      niveau: "fondamental",
      enonce:
        "<p>Le dénominateur d'une fonction de transfert vaut $s^2 + 4s + 13$. Quels sont les pôles, et quelle est la pulsation propre $\\omega_0$, en $\\mathrm{rad/s}$ ?</p>",
      valeur: Math.sqrt(13),
      unite: "rad/s",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Pulsation propre",
      etapes: [
        { texte: "Discriminant $16 - 52 = -36$ : pôles $(-4 \\pm 6j)/2 = -2 \\pm 3j$." },
        { texte: "Identification à $s^2 + 2\\zeta\\omega_0 s + \\omega_0^2$ : $\\omega_0^2 = 13$, soit $\\omega_0 = 3{,}606\\ \\mathrm{rad/s}$, module des pôles." },
        { texte: "$2\\zeta\\omega_0 = 4$, d'où $\\zeta = 2/3{,}606 = 0{,}555$.", note: "Partie réelle $-\\sigma = -2\\ \\mathrm{s^{-1}}$, pseudo-pulsation $\\omega_d = 3\\ \\mathrm{rad/s}$." },
      ],
      visuelCorrection: correctionEtapes(
        ["s² + 4 s + 13 = 0 : Δ = 16 - 52 = -36", "pôles : -2 ± 3j", "ω0 = √13 = 3,606 rad/s = module du pôle", "ζ = 2 / 3,606 = 0,555"],
        "Des pôles à la forme canonique."
      ),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c3-valeur-finale",
      titre: "Valeur finale d'une réponse indicielle",
      niveau: "fondamental",
      enonce: "<p>$H(s) = \\dfrac{10}{s^2 + 3s + 5}$ reçoit un échelon unité. Quelle est la valeur finale de la sortie ?</p>",
      valeur: 2,
      unite: "",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Valeur finale",
      etapes: [
        { texte: "Les pôles, racines de $s^2 + 3s + 5$, ont pour partie réelle $-1{,}5$ : le système est stable, la valeur finale existe." },
        { texte: "Valeur finale $= H(0) \\times 1 = 10/5$." },
        { texte: "$= 2$.", note: "Le théorème de la valeur finale donne le même résultat : $\\lim_{s \\to 0} s \\cdot H(s)/s = H(0)$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const w0 = Math.sqrt(5);
        const z = 3 / (2 * w0);
        traceCorrection(moteur, conteneur, {
          titre: "Réponse indicielle de 10/(s² + 3s + 5)",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "y",
          yUnite: "",
          xMin: 0,
          xMax: 6,
          yMin: 0,
          yMax: 2.5,
          series: [{ id: "y", nom: "y(t)", fonction: (t) => 2 * reponse2(z, w0, t) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 2, "valeur finale 2");
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Simulation : cuve du premier ordre
   -------------------------------------------------------------------------- */

function construireCuve(racine, api) {
  const conteneur = racine.querySelector("#d-cuve-vivant");
  if (!conteneur) return;
  const etat = { Qe: 5, S: 0.5, R: 200, p: 0, tmax: 600 };
  const HMAX = 2.5;
  const FOND = 260;
  const HAUT = 50;
  const yH = (h) => FOND - (Math.min(h, HMAX) / HMAX) * (FOND - HAUT);

  const svg = svgEl("svg", {
    viewBox: "0 0 720 300",
    role: "img",
    "aria-label": "Cuve alimentée par le haut avec un débit Qe, vidée par un orifice au fond avec un débit h sur R ; jauges des deux débits à droite",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("d-cuve-fl");
  const decor = svgEl("g");
  let d = TRAITS + ' stroke-width="2.2"><path d="M80 40V' + FOND + "H280V40" + '"/>';
  d += '<path d="M20 30H150V44" stroke-width="2"/>';
  d += '<path d="M280 248H340" stroke-width="2"/><path d="M280 238H340" stroke-width="1.2"/>';
  d += '<path d="M60 ' + FOND + 'H300" stroke-width="1" stroke-dasharray="2 4"/>';
  d += '<rect x="440" y="' + HAUT + '" width="50" height="' + (FOND - HAUT) + '" stroke-width="1.4"/>';
  d += '<rect x="560" y="' + HAUT + '" width="50" height="' + (FOND - HAUT) + '" stroke-width="1.4"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  d += texte(22, 22, "alimentation Qe") + texte(292, 228, "orifice R") + texte(84, 280, "fond : h = 0, référence des hauteurs");
  d += texte(436, 282, "Qe entrant") + texte(556, 282, "qs = h/R sortant") + texte(440, 40, "débits (L/s)");
  d += "</g>";
  decor.innerHTML = d;
  const eau = svgEl("rect", { x: "82", width: "196", fill: "currentColor", "fill-opacity": "0.22", stroke: "none" });
  const surface = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2" });
  const final = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.4", "stroke-dasharray": "8 5" });
  const p95 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.2", "stroke-dasharray": "2 4" });
  const jet = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2", "marker-end": "url(#d-cuve-fl)" });
  const sortie = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2", "marker-end": "url(#d-cuve-fl)" });
  const jaugeE = svgEl("rect", { x: "442", width: "46", fill: "currentColor", "fill-opacity": "0.35" });
  const jaugeS = svgEl("rect", { x: "562", width: "46", fill: "currentColor", "fill-opacity": "0.18", stroke: "currentColor", "stroke-dasharray": "3 3" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(defs, decor, eau, surface, final, p95, jet, sortie, jaugeE, jaugeS, etiquettes);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#d-cuve-valeurs", [
    { id: "t", libelle: "Temps", unite: "s", decimales: 0 },
    { id: "h", libelle: "Hauteur h", unite: "m", decimales: 3 },
    { id: "hf", libelle: "Hauteur finale R Qe", unite: "m", decimales: 3 },
    { id: "tau", libelle: "Constante de temps R S", unite: "s", decimales: 0 },
    { id: "t5", libelle: "Temps d'établissement 3τ", unite: "s", decimales: 0 },
    { id: "pente", libelle: "Pente initiale Qe/S", unite: "mm/s", decimales: 2 },
    { id: "qs", libelle: "Débit sortant qs", unite: "L/s", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#d-cuve-trace", {
    titre: "Hauteur d'eau en fonction du temps",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "h",
    yUnite: "m",
    xMin: 0,
    xMax: etat.tmax,
    yMin: 0,
    yMax: HMAX,
    ratio: 0.36,
    series: [
      { id: "h", nom: "hauteur h(t)", points: [] },
      { id: "tg", nom: "tangente à l'origine", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      const hf = etat.R * etat.Qe / 1000;
      ligneH(c, r, couleurs, hf, "h∞ = " + nb(api, hf, 2) + " m");
      ligneH(c, r, couleurs, 0.95 * hf, null, [2, 4]);
      ligneV(c, r, couleurs, 3 * etat.R * etat.S, "3τ : 95 % (pointillé)");
      ligneV(c, r, couleurs, etat.p * etat.tmax, null, [1, 3]);
      const t = etat.p * etat.tmax;
      pointRepere(c, r, couleurs, t, hf * (1 - Math.exp(-t / (etat.R * etat.S))), null);
    },
  });
  if (trace) ressources.push(trace);

  function recalculer() {
    const tau = etat.R * etat.S;
    const hf = (etat.R * etat.Qe) / 1000;
    etat.tmax = Math.max(300, Math.ceil((6 * tau) / 100) * 100);
    const pts = [];
    for (let i = 0; i <= 300; i += 1) {
      const t = (etat.tmax * i) / 300;
      pts.push([t, hf * (1 - Math.exp(-t / tau))]);
    }
    if (trace) {
      trace.definirPlage({ xMin: 0, xMax: etat.tmax });
      trace.definirDonnees("h", pts);
      const tFin = Math.min(tau, etat.tmax);
      trace.definirDonnees("tg", [
        [0, 0],
        [tFin, (hf * tFin) / tau],
      ]);
    }
    final.setAttribute("d", "M82 " + yH(hf).toFixed(1) + "H278");
    p95.setAttribute("d", "M82 " + yH(0.95 * hf).toFixed(1) + "H278");
  }

  function dessinerInstant() {
    const tau = etat.R * etat.S;
    const hf = (etat.R * etat.Qe) / 1000;
    const t = etat.p * etat.tmax;
    const h = hf * (1 - Math.exp(-t / tau));
    const qs = (h / etat.R) * 1000;
    const y = yH(h);
    eau.setAttribute("y", y.toFixed(1));
    eau.setAttribute("height", Math.max(0, FOND - y).toFixed(1));
    surface.setAttribute("d", "M82 " + y.toFixed(1) + "H278");
    const longueurJet = Math.max(20, y - 50);
    jet.setAttribute("d", "M150 44V" + (44 + Math.min(longueurJet, 40 + etat.Qe * 6)).toFixed(1));
    jet.setAttribute("stroke-width", (1.2 + etat.Qe * 0.35).toFixed(2));
    sortie.setAttribute("d", "M300 243H" + (310 + qs * 9).toFixed(1));
    sortie.setAttribute("stroke-width", (1.2 + qs * 0.35).toFixed(2));
    const echelle = (FOND - HAUT) / 10;
    jaugeE.setAttribute("y", (FOND - etat.Qe * echelle).toFixed(1));
    jaugeE.setAttribute("height", (etat.Qe * echelle).toFixed(1));
    jaugeS.setAttribute("y", (FOND - qs * echelle).toFixed(1));
    jaugeS.setAttribute("height", Math.max(0, qs * echelle).toFixed(1));
    etiquettes.innerHTML =
      texte(286, Math.max(60, y + 4), "h = " + nb(api, h, 2) + " m") +
      texte(200, Math.max(46, yH(hf) - 5), "h∞ (tirets)") +
      texte(444, FOND - etat.Qe * echelle - 6, nb(api, etat.Qe, 1)) +
      texte(564, FOND - qs * echelle - 6, nb(api, qs, 2));
    if (valeurs) {
      valeurs.maj({ t, h, hf, tau, t5: 3 * tau, pente: (etat.Qe / etat.S), qs });
    }
    if (trace) trace.demanderRendu();
  }

  const curseurs = api.sim.curseurs(
    "#d-cuve-curseurs",
    [
      { id: "Qe", libelle: "Débit d'entrée Qe", min: 1, max: 8, pas: 0.5, valeur: 5, unite: "L/s" },
      { id: "S", libelle: "Section de la cuve S", min: 0.2, max: 1.5, pas: 0.05, valeur: 0.5, unite: "m²" },
      { id: "R", libelle: "Résistance de l'orifice R", min: 50, max: 300, pas: 10, valeur: 200, unite: "s/m²" },
    ],
    (lues) => {
      etat.Qe = lues.Qe;
      etat.S = lues.S;
      etat.R = lues.R;
      recalculer();
      dessinerInstant();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-cuve-lecteur", {
    de: 0,
    a: 1,
    duree: 12,
    boucle: false,
    auto: false,
    libelle: "Temps de remplissage",
    rappel: (p) => {
      etat.p = p;
      dessinerInstant();
    },
  });
  if (lecteur) ressources.push(lecteur);

  recalculer();
  dessinerInstant();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.2 }));
}

/* --------------------------------------------------------------------------
   E. Simulation : plan des pôles et réponse indicielle
   -------------------------------------------------------------------------- */

function construirePoles(racine, api) {
  const conteneur = racine.querySelector("#e-poles-vivant");
  if (!conteneur) return;
  const TMAX = 12;
  const U = 32.5; /* pixels par unité, mêmes échelles sur les deux axes */
  const X0 = 267.5;
  const Y0 = 150;
  const B = { x: 40, y: 20, l: 300, h: 260 };
  const xRe = (re) => X0 + re * U;
  const yIm = (im) => Y0 - im * U;
  const reDe = (px) => (px - X0) / U;
  const imDe = (py) => (Y0 - py) / U;
  const etat = { sigma: 1, wd: 2, a: 0, tol: 5, t: 0, res: null, ind: null, stable: true };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 300",
    role: "img",
    "aria-label": "Plan complexe : axe réel horizontal, axe imaginaire vertical, demi-plan droit hachuré instable, deux pôles conjugués en croix, demi-droite zeta 0,7 en tirets",
  });
  const defs = svgEl("defs");
  defs.innerHTML =
    '<pattern id="e-poles-hach" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V8" stroke="currentColor" stroke-width="1" stroke-opacity="0.35"/></pattern>';
  const decor = svgEl("g");
  let d = '<rect x="' + X0 + '" y="' + B.y + '" width="' + (B.x + B.l - X0) + '" height="' + B.h + '" fill="url(#e-poles-hach)" stroke="none"/>';
  d += TRAITS + ' stroke-width="1.4"><rect x="' + B.x + '" y="' + B.y + '" width="' + B.l + '" height="' + B.h + '"/>';
  d += '<path d="M' + B.x + " " + Y0 + "H" + (B.x + B.l) + "M" + X0 + " " + B.y + "V" + (B.y + B.h) + '"/>';
  for (let k = -6; k <= 2; k += 1) {
    if (k === 0) continue;
    d += '<path d="M' + xRe(k).toFixed(1) + " " + (Y0 - 4) + "V" + (Y0 + 4) + '" stroke-width="1"/>';
  }
  for (let k = -3; k <= 3; k += 1) {
    if (k === 0) continue;
    d += '<path d="M' + (X0 - 4) + " " + yIm(k).toFixed(1) + "H" + (X0 + 4) + '" stroke-width="1"/>';
  }
  /* Demi-droites zeta = 0,7 : angle arccos(0,7) avec l'axe réel négatif. */
  const ang = Math.acos(0.7);
  const L = 5.5;
  d +=
    '<path d="M' + X0 + " " + Y0 + "L" + xRe(-L * Math.cos(ang)).toFixed(1) + " " + yIm(L * Math.sin(ang)).toFixed(1) +
    "M" + X0 + " " + Y0 + "L" + xRe(-L * Math.cos(ang)).toFixed(1) + " " + yIm(-L * Math.sin(ang)).toFixed(1) +
    '" stroke-width="1.3" stroke-dasharray="7 5"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  for (const k of [-6, -4, -2, 2]) d += texte(xRe(k) - 6, Y0 + 16, String(k));
  for (const k of [-3, 3]) d += texte(X0 + 6, yIm(k) + 4, k > 0 ? "+" + k : String(k));
  d += texte(B.x + B.l - 52, Y0 - 6, "Re(s)") + texte(X0 + 6, B.y + 12, "Im(s)") + texte(X0 + 4, B.y + B.h - 6, "instable");
  d += texte(B.x + 6, B.y + 14, "ζ = 0,7 (tirets)");
  d += texte(370, 40, "croix : pôles conjugués") + texte(370, 58, "point déplaçable : pôle du haut");
  d += texte(370, 76, "pointillé vertical : partie réelle -σ") + texte(370, 94, "carré : troisième pôle réel");
  d += texte(370, 112, "zone hachurée : Re(s) &gt; 0, instable");
  d += "</g>";
  decor.innerHTML = d;
  const verticale = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.2", "stroke-dasharray": "2 4" });
  const croix = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.4", "stroke-linecap": "round" });
  const carre = svgEl("rect", { width: "10", height: "10", fill: "none", stroke: "currentColor", "stroke-width": "2" });
  const infos = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "12" });
  svg.append(defs, decor, verticale, croix, carre, infos);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#e-poles-valeurs", [
    { id: "poles", libelle: "Pôles dominants", format: (v) => v },
    { id: "w0", libelle: "Pulsation propre ω0", unite: "rad/s", decimales: 3 },
    { id: "z", libelle: "Amortissement ζ", format: (v) => v },
    { id: "D", libelle: "Dépassement D", format: (v) => v },
    { id: "tpic", libelle: "Temps de pic", format: (v) => v },
    { id: "tr", libelle: "Temps de montée 10 à 90 %", format: (v) => v },
    { id: "ts", libelle: "Temps d'établissement", format: (v) => v },
    { id: "approx", libelle: "Approximation 3/σ", format: (v) => v },
    { id: "verdict", libelle: "Stabilité", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#e-poles-trace", {
    titre: "Réponse à un échelon unité",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "y",
    yUnite: "",
    xMin: 0,
    xMax: TMAX,
    yMin: 0,
    yMax: 2,
    ratio: 0.38,
    series: [
      { id: "y", nom: "réponse y(t)", points: [] },
      { id: "y2", nom: "second ordre seul, sans troisième pôle", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      if (etat.stable) {
        ligneH(c, r, couleurs, 1 + etat.tol / 100, "bande ± " + etat.tol + " %", [5, 4]);
        ligneH(c, r, couleurs, 1 - etat.tol / 100, null, [5, 4]);
        const ind = etat.ind;
        if (ind && Number.isFinite(ind.ts)) ligneV(c, r, couleurs, ind.ts, "t" + etat.tol + " = " + nb(api, ind.ts, 2) + " s", [2, 4], 28);
        if (ind && Number.isFinite(ind.tpic)) pointRepere(c, r, couleurs, ind.tpic, ind.ymax, "D = " + nb(api, ind.D, 1) + " %");
      }
      const res = etat.res;
      if (res) {
        const y = interpoler(res.t, res.y, etat.t);
        ligneV(c, r, couleurs, etat.t, null, [1, 3]);
        const px = r.versX(etat.t);
        const py = r.versY(Math.max(r.plage ? r.plage.yMin : -1e9, y));
        if (Number.isFinite(px) && Number.isFinite(py) && py >= r.boite.y && py <= r.boite.y + r.boite.h) {
          c.save();
          c.strokeStyle = couleurs.texte;
          c.lineWidth = 2;
          c.beginPath();
          c.arc(px, py, 6, 0, TAU);
          c.stroke();
          c.restore();
        }
      }
    },
  });
  if (trace) ressources.push(trace);

  function simuler() {
    const s = etat.sigma;
    const wd = etat.wd;
    const w02 = s * s + wd * wd;
    const a = etat.a;
    const h = 0.004;
    const n = Math.round(TMAX / h);
    const res = { t: [], y: [], y2: [] };
    /* État : y, y', x (sortie du premier ordre a/(s + a) placé en amont). */
    let x = [0, 0, a > 0 ? 0 : 1];
    let x2 = [0, 0];
    const f = (t, v) => [v[1], w02 * v[2] - 2 * s * v[1] - w02 * v[0], a > 0 ? a * (1 - v[2]) : 0];
    const f2 = (t, v) => [v[1], w02 - 2 * s * v[1] - w02 * v[0]];
    for (let k = 0; k <= n; k += 1) {
      if (k % 2 === 0) {
        res.t.push(k * h);
        res.y.push(x[0]);
        res.y2.push(x2[0]);
      }
      x = pasRK4(f, k * h, x, h);
      x2 = pasRK4(f2, k * h, x2, h);
      if (!Number.isFinite(x[0]) || Math.abs(x[0]) > 1e6) break;
    }
    etat.res = res;
    etat.stable = s > 1e-6;
    etat.ind = etat.stable ? indicateurs(res.t, res.y, 1, etat.tol / 100) : null;
    /* Une réponse qui sort du cadre est arrêtée au bord, sans être écrêtée en palier. */
    const couper = (ys) => {
      let sorti = false;
      return res.t.map((t, i) => {
        if (sorti) return [t, NaN];
        const v = ys[i];
        if (v > 2.4 || v < -1.2) {
          sorti = true;
          return [t, Math.max(-1.2, Math.min(2.4, v))];
        }
        return [t, v];
      });
    };
    let yMax = 1.6;
    let yMin = 0;
    for (const v of res.y) {
      if (v > yMax) yMax = v;
      if (v < yMin) yMin = v;
    }
    if (trace) {
      trace.definirPlage({ yMin: Math.max(-1.2, Math.min(0, yMin * 1.05)), yMax: Math.min(2.4, Math.max(1.6, yMax * 1.05)) });
      trace.definirDonnees("y", couper(res.y));
      trace.definirDonnees("y2", a > 0 ? couper(res.y2) : []);
    }
  }

  function dessinerPoles() {
    const s = etat.sigma;
    const wd = etat.wd;
    const px = xRe(-s);
    const c1 = yIm(wd);
    const c2 = yIm(-wd);
    const k = 6;
    croix.setAttribute(
      "d",
      "M" + (px - k) + " " + (c1 - k) + "L" + (px + k) + " " + (c1 + k) + "M" + (px - k) + " " + (c1 + k) + "L" + (px + k) + " " + (c1 - k) +
        "M" + (px - k) + " " + (c2 - k) + "L" + (px + k) + " " + (c2 + k) + "M" + (px - k) + " " + (c2 + k) + "L" + (px + k) + " " + (c2 - k)
    );
    verticale.setAttribute("d", "M" + px.toFixed(1) + " " + B.y + "V" + (B.y + B.h));
    if (etat.a > 0) {
      const xa = Math.max(B.x + 2, xRe(-etat.a));
      carre.setAttribute("x", (xa - 5).toFixed(1));
      carre.setAttribute("y", (Y0 - 5).toFixed(1));
      carre.setAttribute("opacity", "1");
    } else {
      carre.setAttribute("opacity", "0");
    }
    const w0 = Math.sqrt(s * s + wd * wd);
    infos.innerHTML =
      texte(370, 150, "pôles : " + nb(api, -s, 2) + " ± " + nb(api, wd, 2) + " j") +
      texte(370, 170, "ω0 = " + nb(api, w0, 2) + " rad/s, ζ = " + (w0 > 0 ? nb(api, s / w0, 3) : "indéfini")) +
      texte(370, 190, etat.a > 0 ? "troisième pôle : " + nb(api, -etat.a, 1) + " s⁻¹" : "troisième pôle : aucun") +
      texte(370, 210, etat.a > 6.8 ? "hors cadre : carré posé au bord gauche" : "") +
      texte(370, 240, s > 1e-6 ? "stable : enveloppe décroissante" : s > -1e-6 ? "limite : oscillation entretenue" : "instable : réponse divergente");
  }

  function majValeurs() {
    const s = etat.sigma;
    const wd = etat.wd;
    const w0 = Math.sqrt(s * s + wd * wd);
    const ind = etat.ind;
    const f = (v, dec, u) => (Number.isFinite(v) ? nb(api, v, dec) + " " + u : "sans objet");
    if (!valeurs) return;
    valeurs.maj({
      poles: nb(api, -s, 2) + " ± " + nb(api, wd, 2) + " j",
      w0,
      z: w0 > 0 ? nb(api, s / w0, 3) : "indéfini",
      D: etat.stable && ind ? nb(api, ind.D, 1) + " %" : "sans objet",
      tpic: etat.stable && ind ? f(ind.tpic, 2, "s") : "sans objet",
      tr: etat.stable && ind ? f(ind.tr, 2, "s") : "sans objet",
      ts: etat.stable && ind ? (Number.isFinite(ind.ts) ? nb(api, ind.ts, 2) + " s (bande " + etat.tol + " %)" : "au-delà de 12 s") : "sans objet",
      approx: s > 1e-6 ? nb(api, (etat.tol === 5 ? 3 : 4) / s, 2) + " s" : "sans objet",
      verdict: s > 1e-6 ? "stable" : s > -1e-6 ? "limite de stabilité" : "instable",
    });
  }

  function toutRecalculer() {
    simuler();
    dessinerPoles();
    majValeurs();
    if (trace) trace.demanderRendu();
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: xRe(-6.5), y: yIm(3.9), largeur: xRe(1.5) - xRe(-6.5), hauteur: yIm(0) - yIm(3.9) },
    valeur: { x: xRe(-etat.sigma), y: yIm(etat.wd) },
    pas: 1,
    libelle: "Pôle du demi-plan supérieur : partie réelle et partie imaginaire",
    format: (m) => "Re " + nb(api, reDe(m.x), 2) + ", Im " + nb(api, imDe(m.y), 2),
    rappel(m) {
      etat.sigma = -Math.round(reDe(m.x) * 20) / 20;
      etat.wd = Math.max(0, Math.round(imDe(m.y) * 20) / 20);
      toutRecalculer();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-poles-curseurs",
    [
      {
        id: "a",
        libelle: "Troisième pôle réel en -a",
        min: 0,
        max: 30,
        pas: 0.5,
        valeur: 0,
        format: (v) => (v === 0 ? "aucun" : "-" + nb(api, v, 1) + " s⁻¹"),
      },
      { id: "tol", libelle: "Bande d'établissement", min: 2, max: 5, pas: 3, valeur: 5, format: (v) => "± " + v + " %" },
    ],
    (lues) => {
      etat.a = lues.a;
      etat.tol = lues.tol;
      toutRecalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-poles-lecteur", {
    de: 0,
    a: TMAX,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Temps de la réponse",
    rappel: (t) => {
      etat.t = t;
      if (trace) trace.demanderRendu();
    },
  });
  if (lecteur) ressources.push(lecteur);

  if (!etat.res) toutRecalculer();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.2 }));
}

/* --------------------------------------------------------------------------
   E. Simulation : boucle de vitesse proportionnelle de l'actionneur
   -------------------------------------------------------------------------- */

function construireBoucle(racine, api) {
  const conteneur = racine.querySelector("#e-boucle-vivant");
  const svg = racine.querySelector("#e-boucle-svg");
  if (!conteneur || !svg) return;
  const TMAX = 0.025;
  const etat = { Kp: 0.2, Cr: 0, t: 0, res: null };
  const plan = svg.querySelector("#e-bs-plan");
  const textes = {
    eps: svg.querySelector("#e-bs-veps"),
    u: svg.querySelector("#e-bs-vu"),
    w: svg.querySelector("#e-bs-vw"),
    i: svg.querySelector("#e-bs-vi"),
  };
  if (!plan) return;

  /* Plan des pôles : Re de -1000 à +250 sur x 500 à 700, Im de ±2800 sur y 120 ∓ 95. */
  const xP = (re) => 660 + re * 0.16;
  const yP = (im) => 120 - im * (95 / 2800);
  let chemin = "";
  for (const signe of [1, -1]) {
    let premier = true;
    for (let k = 0; k <= 400; k += 1) {
      const Kp = (2 * k * k) / (400 * 400);
      const b = boucleP(Kp);
      const p = signe > 0 ? b.poles[0] : b.poles[1];
      chemin += (premier ? "M" : "L") + xP(p.re).toFixed(1) + " " + yP(p.im).toFixed(1);
      premier = false;
    }
  }
  const lieu = svgEl("path", { d: chemin, "stroke-width": "1.2" });
  const croix = svgEl("path", { "stroke-width": "2.4", "stroke-linecap": "round" });
  const graduations = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "10" });
  graduations.innerHTML =
    texte(xP(-1000) - 4, 134, "-1000") + texte(xP(-500) - 12, 134, "-500") + texte(618, yP(2500) + 4, "2500") + texte(612, yP(-2500) + 4, "-2500");
  const reperes = svgEl("path", {
    d: "M" + xP(-1000) + " 116V124M" + xP(-500) + " 116V124M656 " + yP(2500).toFixed(1) + "H664M656 " + yP(-2500).toFixed(1) + "H664",
    "stroke-width": "1",
  });
  plan.append(lieu, reperes, croix, graduations);
  nettoyeurs.push(() => {
    lieu.remove();
    reperes.remove();
    croix.remove();
    graduations.remove();
  });

  const valeurs = api.sim.valeurs("#e-boucle-valeurs", [
    { id: "kb", libelle: "Gain de boucle Kb = Kp G0", decimales: 3 },
    { id: "w0", libelle: "Pulsation propre ω0", unite: "rad/s", decimales: 0 },
    { id: "z", libelle: "Amortissement ζ", decimales: 3 },
    { id: "err", libelle: "Erreur statique sans charge", format: (v) => v },
    { id: "D", libelle: "Dépassement", format: (v) => v },
    { id: "ts", libelle: "Temps d'établissement à 5 %", format: (v) => v },
    { id: "final", libelle: "Vitesse finale sans puis avec Cr", format: (v) => v },
    { id: "ipk", libelle: "Courant de pointe", format: (v) => v },
    { id: "t", libelle: "Instant du lecteur", unite: "ms", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#e-boucle-trace", {
    titre: "Vitesse de l'actionneur en boucle fermée",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "Ω",
    yUnite: "rad/s",
    xMin: 0,
    xMax: TMAX * 1000,
    yMin: 0,
    yMax: 32,
    ratio: 0.38,
    series: [
      { id: "w", nom: "vitesse Ω(t)", points: [] },
      { id: "c", nom: "consigne Ωc = 20 rad/s", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, etat.t * 1000, null, [1, 3]);
      if (etat.Cr > 0) ligneV(c, r, couleurs, T_CR * 1000, "Cr appliqué", [2, 4], 28);
      const res = etat.res;
      if (res) pointRepere(c, r, couleurs, etat.t * 1000, interpoler(res.t, res.w, etat.t), null);
    },
  });
  if (trace) ressources.push(trace);

  function recalculer() {
    const res = simulerBoucle(etat.Kp, etat.Cr, TMAX);
    etat.res = res;
    const b = boucleP(etat.Kp);
    etat.b = b;
    let ipk = 0;
    for (const v of res.i) if (v > ipk) ipk = v;
    etat.ipk = ipk;
    etat.ind = indicateursCanoniques(b.z, b.w0);
    if (trace) {
      trace.definirDonnees("w", res.t.map((t, i) => [t * 1000, res.w[i]]));
      trace.definirDonnees("c", [
        [0, ECHELON_W],
        [TMAX * 1000, ECHELON_W],
      ]);
    }
    let d = "";
    for (const p of b.poles) {
      const x = xP(p.re);
      const y = yP(p.im);
      d += "M" + (x - 5) + " " + (y - 5) + "L" + (x + 5) + " " + (y + 5) + "M" + (x - 5) + " " + (y + 5) + "L" + (x + 5) + " " + (y - 5);
    }
    croix.setAttribute("d", d);
  }

  function dessinerInstant() {
    const res = etat.res;
    if (!res) return;
    const w = interpoler(res.t, res.w, etat.t);
    const i = interpoler(res.t, res.i, etat.t);
    const u = etat.t > 0 ? etat.Kp * (ECHELON_W - w) : 0;
    if (textes.eps) textes.eps.textContent = "ε = " + nb(api, etat.t > 0 ? ECHELON_W - w : 0, 2);
    if (textes.u) textes.u.textContent = "u = " + nb(api, u, 2) + " V";
    if (textes.w) textes.w.textContent = "Ω = " + nb(api, w, 2);
    if (textes.i) textes.i.textContent = "i = " + nb(api, i, 2) + " A";
    const b = etat.b;
    const wSans = (etat.Kp * ECHELON_W) / (etat.Kp + A0 / MOT.K);
    const wAvec = (etat.Kp * ECHELON_W - (MOT.R * etat.Cr) / MOT.K) / (etat.Kp + A0 / MOT.K);
    if (valeurs) {
      valeurs.maj({
        kb: b.Kb,
        w0: b.w0,
        z: b.z,
        err: nb(api, b.err * 100, 1) + " %, soit " + nb(api, ECHELON_W * b.err, 2) + " rad/s",
        D: nb(api, depassement(b.z), 1) + " %",
        ts: Number.isFinite(etat.ind.ts) ? nb(api, etat.ind.ts * 1000, 2) + " ms" : "non atteint",
        final: nb(api, wSans, 2) + " puis " + nb(api, wAvec, 2) + " rad/s",
        ipk: nb(api, etat.ipk, 2) + " A" + (etat.ipk > 3 ? " : au-delà de la limitation de 3 A, hors modèle" : " : sous la limitation de 3 A"),
        t: etat.t * 1000,
      });
    }
    if (trace) trace.demanderRendu();
  }

  const curseurs = api.sim.curseurs(
    "#e-boucle-curseurs",
    [
      { id: "Kp", libelle: "Gain proportionnel Kp", min: 0.02, max: 2, pas: 0.01, valeur: 0.2, unite: "V.s/rad" },
      { id: "Cr", libelle: "Couple de charge Cr à t = 10 ms", min: 0, max: 0.05, pas: 0.005, valeur: 0, unite: "N.m" },
    ],
    (lues) => {
      etat.Kp = lues.Kp;
      etat.Cr = lues.Cr;
      recalculer();
      dessinerInstant();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-boucle-lecteur", {
    de: 0,
    a: TMAX,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Temps après l'échelon de consigne",
    rappel: (t) => {
      etat.t = t;
      dessinerInstant();
    },
  });
  if (lecteur) ressources.push(lecteur);

  if (!etat.res) recalculer();
  dessinerInstant();
}

/* --------------------------------------------------------------------------
   H. Courbe de l'exemple résolu
   -------------------------------------------------------------------------- */

function construireCourbeExemple(racine, api) {
  if (!racine.querySelector("#h-courbe")) return;
  const Kp = 0.2;
  const b = boucleP(Kp);
  const res = simulerBoucle(Kp, 0, 0.012, 1e-6);
  const wf = ECHELON_W * b.Kb / (1 + b.Kb);
  const ind = indicateurs(res.t, res.w, wf);
  const sigma = b.z * b.w0;
  const r = Math.sqrt(1 - b.z * b.z);
  const trace = api.sim.traceur("#h-courbe", {
    titre: "Boucle de vitesse, Kp = 0,2 V.s/rad, échelon de 20 rad/s",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "Ω",
    yUnite: "rad/s",
    xMin: 0,
    xMax: 12,
    yMin: 0,
    yMax: 24,
    ratio: 0.42,
    series: [
      { id: "w", nom: "vitesse simulée", points: res.t.map((t, i) => [t * 1000, res.w[i]]) },
      { id: "c", nom: "consigne", points: [[0, ECHELON_W], [12, ECHELON_W]] },
      { id: "eh", nom: "enveloppe haute", fonction: (ms) => wf * (1 + Math.exp((-sigma * ms) / 1000) / r) },
      { id: "eb", nom: "enveloppe basse", fonction: (ms) => wf * (1 - Math.exp((-sigma * ms) / 1000) / r) },
    ],
    surDessin({ c, repere: rep, couleurs }) {
      ligneH(c, rep, couleurs, wf, "Ω∞ = 14,78");
      ligneH(c, rep, couleurs, wf * 1.05, null, [3, 4]);
      ligneH(c, rep, couleurs, wf * 0.95, null, [3, 4]);
      ligneV(c, rep, couleurs, ind.tpic * 1000, "tpic = " + nb(api, ind.tpic * 1000, 2) + " ms", [2, 4], 14);
      ligneV(c, rep, couleurs, ind.ts * 1000, "t5 = " + nb(api, ind.ts * 1000, 2) + " ms", [2, 4], 30);
      pointRepere(c, rep, couleurs, ind.tpic * 1000, ind.ymax, "D = " + nb(api, ind.D, 2) + " %");
    },
  });
  if (trace) ressources.push(trace);
}

/* --------------------------------------------------------------------------
   I. Groupe de pompage : réponse limitée par la rampe
   -------------------------------------------------------------------------- */

function construirePompe(racine, api) {
  if (!racine.querySelector("#i-pompe-trace")) return;
  const etat = { hz: 2, rampe: 10 };
  const valeurs = api.sim.valeurs("#i-pompe-valeurs", [
    { id: "dw", libelle: "Échelon de vitesse de synchronisme", unite: "rad/s", decimales: 3 },
    { id: "pente", libelle: "Pente permise par la rampe", unite: "rad/s²", decimales: 2 },
    { id: "duree", libelle: "Durée de la rampe pour cet échelon", unite: "s", decimales: 3 },
    { id: "ts0", libelle: "t5 sans rampe (3τ)", unite: "ms", decimales: 1 },
    { id: "ts", libelle: "t5 avec rampe", unite: "s", decimales: 3 },
    { id: "tr", libelle: "tr avec rampe", unite: "s", decimales: 3 },
    { id: "trainage", libelle: "Traînage derrière 0,972 fois la rampe", unite: "rad/s", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);
  const resultat = { ts: NaN };
  const trace = api.sim.traceur("#i-pompe-trace", {
    titre: "Variation de vitesse du groupe de pompage",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "δΩ",
    yUnite: "rad/s",
    xMin: 0,
    xMax: 0.6,
    yMin: 0,
    yMax: 8,
    ratio: 0.4,
    series: [
      { id: "libre", nom: "sans rampe : premier ordre seul", points: [] },
      { id: "rampe", nom: "avec rampe", points: [] },
      { id: "sync", nom: "vitesse de synchronisme rampée", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      if (Number.isFinite(resultat.ts)) ligneV(c, r, couleurs, resultat.ts, "t5 = " + nb(api, resultat.ts, 3) + " s", [2, 4], 14);
    },
  });
  if (trace) ressources.push(trace);

  function recalculer() {
    const dW = (TAU * etat.hz) / 2;
    const pente = (TAU * 50) / 2 / etat.rampe;
    const duree = dW / pente;
    const tmax = Math.max(0.15, 1.5 * duree);
    const res = reponsePompe(dW, pente, tmax);
    const yf = GAIN_P * dW;
    const ind = indicateurs(res.t, res.rampe, yf);
    resultat.ts = ind.ts;
    if (trace) {
      trace.definirPlage({ xMin: 0, xMax: tmax, yMin: 0, yMax: Math.max(1, dW * 1.25) });
      trace.definirDonnees("libre", res.t.map((t, i) => [t, res.libre[i]]));
      trace.definirDonnees("rampe", res.t.map((t, i) => [t, res.rampe[i]]));
      trace.definirDonnees("sync", res.t.map((t, i) => [t, res.sync[i]]));
    }
    if (valeurs) {
      valeurs.maj({
        dw: dW,
        pente,
        duree,
        ts0: TAU_P * Math.log(20) * 1000,
        ts: ind.ts,
        tr: ind.tr,
        trainage: GAIN_P * pente * TAU_P,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-pompe-curseurs",
    [
      { id: "hz", libelle: "Échelon de consigne de fréquence", min: 0.5, max: 10, pas: 0.5, valeur: 2, unite: "Hz" },
      { id: "rampe", libelle: "Rampe du variateur, durée pour 50 Hz", min: 1, max: 20, pas: 1, valeur: 10, unite: "s" },
    ],
    (lues) => {
      etat.hz = lues.hz;
      etat.rampe = lues.rampe;
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);
  recalculer();
}

/* --------------------------------------------------------------------------
   Dessin d'une réponse annotée, pour le quiz et les corrections
   -------------------------------------------------------------------------- */

const COURBE_PRINCIPALE =
  "M70 300 L82 295.2 L94 282.3 L106 263.5 L118 241 L130 216.6 L142 192 L154 168.4 L166 147 L178 128.3 L190 112.8 L202 100.7 L214 91.9 " +
  "L226 86.3 L238 83.5 L246 83 L258 84 L270 86.7 L282 90.6 L294 95.2 L306 100.2 L318 105.3 L330 110.1 L342 114.5 L354 118.3 L366 121.5 " +
  "L378 124 L390 125.8 L402 126.9 L414 127.5 L426 127.6 L438 127.2 L450 126.6 L462 125.7 L474 124.7 L486 123.7 L498 122.7 L510 121.7 " +
  "L522 120.8 L534 120.1 L546 119.5 L558 119 L570 118.7 L582 118.5 L594 118.4 L606 118.5 L618 118.6 L630 118.7 L642 118.9 L654 119.1 L670 119.4";

function dessinReponse(id) {
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ">";
  s += '<path d="M60 300H700" stroke-width="1.4" marker-end="url(#' + id + ')"/><path d="M70 310V40" stroke-width="1.4" marker-end="url(#' + id + ')"/>';
  s += '<path d="M70 100H690" stroke-width="1.4" stroke-dasharray="9 5"/><path d="M70 120H690" stroke-width="1.2" stroke-dasharray="3 4"/>';
  s += '<path d="M250 111H690M250 129H690" stroke-width="1" stroke-dasharray="6 4"/>';
  s += '<path d="' + COURBE_PRINCIPALE + '" stroke-width="2.6"/></g>';
  s += ECRITS + texte(78, 36, "y(t)") + texte(650, 292, "t (s)") + texte(44, 104, "1") + texte(34, 124, "0,9") + texte(44, 304, "0");
  s += texte(470, 94, "consigne (tirets longs)") + texte(470, 148, "valeur finale (pointillé)") + "</g>";
  return s;
}

const ZONES_REPONSE = [
  { x: 214, y: 66, largeur: 64, hauteur: 40, etiquette: "premier maximum" },
  { x: 600, y: 92, largeur: 90, hauteur: 34, etiquette: "écart final entre consigne et valeur finale" },
  { x: 84, y: 130, largeur: 96, hauteur: 160, etiquette: "montée de 10 à 90 %" },
  { x: 312, y: 104, largeur: 44, hauteur: 34, etiquette: "entrée définitive dans la bande" },
];

function zonesReponse(juste) {
  return ZONES_REPONSE.map((z, k) => (k === juste ? { ...z, juste: true } : { ...z }));
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  const tauK1 = 36 / Math.log(20);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-sonde",
      titre: "Fondamental 1 : temps de montée d'une sonde de température",
      niveau: "fondamental",
      enonce:
        "<p>Une sonde Pt100 dans son doigt de gant, plongée brusquement dans un fluide plus chaud, atteint $95\\ \\%$ de son échauffement final en " +
        "$36\\ \\mathrm{s}$. On la modélise par un premier ordre. Quelle est sa constante de temps, puis son temps de montée de $10$ à $90\\ \\%$, en secondes ?</p>",
      valeur: tauK1 * Math.log(9),
      unite: "s",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Temps de montée",
      etapes: [
        { texte: "Premier ordre : $t_5 = \\tau\\ln 20$, donc $\\tau = 36/2{,}996 = 12{,}02\\ \\mathrm{s}$." },
        { texte: "$t_r = \\tau\\ln 9 = 12{,}02 \\times 2{,}197$." },
        { texte: "$t_r = 26{,}4\\ \\mathrm{s}$.", note: "Une boucle de température qui utilise cette sonde ne peut pas raisonnablement viser un temps d'établissement inférieur à quelques minutes." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réponse de la sonde, τ = 12,0 s",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "échauffement relatif",
          yUnite: "",
          xMin: 0,
          xMax: 60,
          yMin: 0,
          yMax: 1.1,
          series: [{ id: "y", nom: "réponse de la sonde", fonction: (t) => 1 - Math.exp(-t / tauK1) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0.95, "95 %", [2, 4]);
            pointRepere(c, r, couleurs, 36, 0.95, "36 s");
            pointRepere(c, r, couleurs, tauK1 * Math.log(10 / 9), 0.1, "10 %");
            pointRepere(c, r, couleurs, tauK1 * Math.log(10), 0.9, "90 %");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-depassement",
      titre: "Fondamental 2 : dépassement et temps de pic d'un second ordre",
      niveau: "fondamental",
      enonce:
        "<p>Un second ordre sans zéro a pour paramètres $\\omega_0 = 50\\ \\mathrm{rad/s}$ et $\\zeta = 0{,}4$. Calculez son dépassement, en pour cent de la " +
        "valeur finale, puis son temps de pic.</p>",
      valeur: depassement(0.4),
      unite: "%",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Dépassement",
      etapes: [
        { texte: "$\\sqrt{1 - \\zeta^2} = \\sqrt{0{,}84} = 0{,}9165$." },
        { texte: "$D = \\exp(-\\pi \\times 0{,}4/0{,}9165) = e^{-1{,}371} = 25{,}4\\ \\%$." },
        { texte: "$t_{pic} = \\pi/(50 \\times 0{,}9165) = 68{,}6\\ \\mathrm{ms}$.", note: "Contrôle par le tableau : $\\omega_0 t_{pic} = 3{,}43$ pour $\\zeta = 0{,}4$, soit $68{,}6\\ \\mathrm{ms}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réponse indicielle, ω0 = 50 rad/s, ζ = 0,4",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "y / y∞",
          yUnite: "",
          xMin: 0,
          xMax: 250,
          yMin: 0,
          yMax: 1.4,
          series: [{ id: "y", nom: "y(t) / y∞", fonction: (ms) => reponse2(0.4, 50, ms / 1000) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 1, "valeur finale", [2, 3]);
            pointRepere(c, r, couleurs, 68.55, 1.2538, "D = 25,4 %, tpic = 68,6 ms");
          },
        });
      },
    })
  );

  const D1 = 0.2;
  const zI1 = -Math.log(D1) / Math.sqrt(Math.PI * Math.PI + Math.log(D1) ** 2);
  const w0I1 = Math.PI / 0.15 / Math.sqrt(1 - zI1 * zI1);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-identification",
      titre: "Intermédiaire 1 : identification sur un essai",
      niveau: "intermédiaire",
      enonce:
        "<p>Un essai indiciel sur une boucle de position montre un dépassement de $20\\ \\%$ de la valeur finale, atteint $0{,}15\\ \\mathrm{s}$ après " +
        "l'échelon. On suppose un second ordre dominant sans zéro. Quelle est sa pulsation propre $\\omega_0$, en $\\mathrm{rad/s}$ ? Estimez aussi son temps d'établissement à $5\\ \\%$.</p>",
      valeur: w0I1,
      unite: "rad/s",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Pulsation propre",
      etapes: [
        { texte: "$\\ln 0{,}2 = -1{,}609$ ; $\\zeta = 1{,}609/\\sqrt{\\pi^2 + 1{,}609^2} = 1{,}609/3{,}530 = 0{,}456$." },
        { texte: "$\\omega_d = \\pi/t_{pic} = \\pi/0{,}15 = 20{,}94\\ \\mathrm{rad/s}$." },
        { texte: "$\\omega_0 = \\omega_d/\\sqrt{1 - \\zeta^2} = 20{,}94/0{,}890 = 23{,}5\\ \\mathrm{rad/s}$." },
        { texte: "$t_5 \\approx 3/(\\zeta\\omega_0) = 3/10{,}73 = 0{,}28\\ \\mathrm{s}$.", note: "Le tableau, entre $\\zeta = 0{,}4$ et $0{,}5$, donne $\\omega_0 t_5 \\approx 6{,}3$, soit $0{,}27\\ \\mathrm{s}$ : l'approximation est correcte dans cette plage." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Second ordre identifié : ζ = 0,456, ω0 = 23,5 rad/s",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "y / y∞",
          yUnite: "",
          xMin: 0,
          xMax: 0.6,
          yMin: 0,
          yMax: 1.35,
          series: [{ id: "y", nom: "modèle identifié", fonction: (t) => reponse2(zI1, w0I1, t) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 1.05, null, [3, 4]);
            ligneH(c, r, couleurs, 0.95, null, [3, 4]);
            pointRepere(c, r, couleurs, 0.15, 1.2, "D = 20 % à 0,15 s");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-four",
      titre: "Intermédiaire 2 : gain minimal pour une erreur statique imposée",
      niveau: "intermédiaire",
      enonce:
        "<p>Un four de séchage se comporte comme un premier ordre de gain $K_0 = 2\\ \\mathrm{K}$ par pour cent de puissance et de constante de temps " +
        "$600\\ \\mathrm{s}$. Il est régulé par un correcteur proportionnel $K_p$, en pour cent par kelvin, avec une mesure de gain unité. Quel gain minimal faut-il pour " +
        "une erreur statique au plus égale à $2\\ \\%$ de la consigne ? Que devient la constante de temps de la boucle fermée ?</p>",
      valeur: 24.5,
      unite: "%/K",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Gain minimal",
      etapes: [
        { texte: "Classe 0 : $\\varepsilon_s = 1/(1 + K_pK_0) \\leq 0{,}02$, donc $K_pK_0 \\geq 49$." },
        { texte: "$K_p \\geq 49/2 = 24{,}5\\ \\%/\\mathrm{K}$." },
        { texte: "Boucle fermée : $T = \\dfrac{K_pK_0}{1 + K_pK_0 + \\tau s}$, constante $\\tau/(1 + K_pK_0) = 600/50 = 12\\ \\mathrm{s}$.", note: "Mais un écart de $4\\ \\mathrm{K}$ suffit à demander $100\\ \\%$ de puissance : à la mise en chauffe, la commande sature et la réponse réelle est bien plus lente que $12\\ \\mathrm{s}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Erreur statique en fonction du gain Kp",
          xTitre: "Kp",
          xUnite: "%/K",
          yTitre: "erreur statique",
          yUnite: "%",
          xMin: 0,
          xMax: 50,
          yMin: 0,
          yMax: 30,
          series: [{ id: "e", nom: "100 / (1 + 2 Kp)", fonction: (k) => 100 / (1 + 2 * k) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 2, "2 %", [2, 4]);
            pointRepere(c, r, couleurs, 24.5, 2, "Kp = 24,5 %/K");
          },
        });
      },
    })
  );

  const zAv = 0.5911550337988976;
  const KbAv = (TS / (2 * zAv)) ** 2 / T12 - 1;
  const KpAv = KbAv / G0;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-reglage",
      titre: "Avancé : régler un correcteur proportionnel pour 10 % de dépassement",
      niveau: "avancé",
      enonce:
        "<p>Boucle de vitesse de l'actionneur de vanne : $\\Omega/U = G_0/(\\tau_1\\tau_2 s^2 + (\\tau_1 + \\tau_2)s + 1)$ avec $G_0 = 14{,}16\\ \\mathrm{rad/(s\\cdot V)}$, " +
        "$\\tau_1\\tau_2 = 4{,}046 \\times 10^{-6}\\ \\mathrm{s^2}$, $\\tau_1 + \\tau_2 = 4{,}862\\ \\mathrm{ms}$, correcteur $K_p$ et mesure de gain unité. Quel gain " +
        "$K_p$, en $\\mathrm{V\\cdot s/rad}$, donne exactement $10\\ \\%$ de dépassement ? Quelle erreur statique en résulte, et quel est le temps d'établissement à $5\\ \\%$ ?</p>",
      valeur: KpAv,
      unite: "V.s/rad",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "Gain Kp",
      etapes: [
        { texte: "$D = 10\\ \\%$ : $\\zeta = -\\ln 0{,}1/\\sqrt{\\pi^2 + \\ln^2 0{,}1} = 2{,}303/3{,}896 = 0{,}591$." },
        { texte: "$\\zeta = \\dfrac{\\tau_1 + \\tau_2}{2\\sqrt{\\tau_1\\tau_2(1 + K_b)}}$, donc $1 + K_b = \\left(\\dfrac{4{,}862 \\times 10^{-3}}{2 \\times 0{,}591}\\right)^2\\Big/4{,}046 \\times 10^{-6} = 4{,}180$." },
        { texte: "$K_b = 3{,}180$ et $K_p = 3{,}180/14{,}16 = 0{,}225\\ \\mathrm{V\\cdot s/rad}$." },
        { texte: "Erreur statique $1/4{,}180 = 23{,}9\\ \\%$ ; $\\omega_0 = \\sqrt{4{,}180/4{,}046 \\times 10^{-6}} = 1016\\ \\mathrm{rad/s}$ ; $t_5 = 5{,}17\\ \\mathrm{ms}$ par simulation.", note: "Comme $D &gt; 5\\ \\%$, le premier maximum sort de la bande : $t_5$ se lit après le premier minimum, d'où une valeur proche de $3/\\sigma = 4{,}99\\ \\mathrm{ms}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Dépassement et erreur statique en fonction de Kp",
          xTitre: "Kp",
          xUnite: "V.s/rad",
          yTitre: "pourcentage",
          yUnite: "%",
          xMin: 0.03,
          xMax: 1.5,
          yMin: 0,
          yMax: 70,
          series: [
            { id: "D", nom: "dépassement D", fonction: (k) => depassement(boucleP(k).z) },
            { id: "e", nom: "erreur statique", fonction: (k) => 100 * boucleP(k).err },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneV(c, r, couleurs, KpAv, "Kp = 0,225", [2, 4]);
            pointRepere(c, r, couleurs, KpAv, 10, "D = 10 %");
            pointRepere(c, r, couleurs, KpAv, 23.92, "εs = 23,9 %");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-diagnostic-charge",
      titre: "Diagnostic industriel : la vitesse de l'actionneur n'atteint plus sa valeur attendue",
      niveau: "diagnostic",
      enonce:
        "<p>La boucle de vitesse de l'actionneur est réglée à $K_p = 0{,}2\\ \\mathrm{V\\cdot s/rad}$. À la mise en service, un échelon de consigne de " +
        "$20\\ \\mathrm{rad/s}$ donnait $14{,}8\\ \\mathrm{rad/s}$ en régime établi, $8{,}5\\ \\%$ de dépassement et un pic à $4{,}1\\ \\mathrm{ms}$. Après une " +
        "saison, le même essai donne encore $8{,}5\\ \\%$ de dépassement et un pic à $4{,}1\\ \\mathrm{ms}$, mais la vitesse finale n'est plus que de " +
        "$12{,}0\\ \\mathrm{rad/s}$, et la tension finale du correcteur a augmenté. Quelles conclusions sont justifiées ?</p>",
      multiple: true,
      options: [
        { texte: "Un couple résistant supplémentaire, frottement de la tige ou effort de la vanne, est apparu : il abaisse la valeur finale sans modifier les pôles.", juste: true },
        { texte: "La dynamique de la boucle n'a pas changé : dépassement et temps de pic dépendent des pôles seulement, qui sont intacts.", juste: true },
        { texte: "Une action intégrale annulerait cet écart en régime établi.", juste: true },
        { texte: "La mesure de vitesse est en panne, puisque la vitesse finale est fausse." },
        { texte: "La boucle est devenue instable." },
      ],
      etapes: [
        { texte: "Dépassement et temps de pic inchangés : $\\zeta$ et $\\omega_0$ sont inchangés, donc $J$, $L$, $R$, $K$ et $K_p$ aussi. Une mesure faussée changerait le gain de boucle, donc les pôles." },
        { texte: "La boucle de classe 0 divise l'effet d'un couple de charge par $1 + K_b$ sans l'annuler : $\\delta\\Omega = -R\\,C_r/(K(K_p + (Rf + K^2)/K))$. Une baisse de $2{,}78\\ \\mathrm{rad/s}$ correspond à $C_r \\approx 0{,}044\\ \\mathrm{N\\cdot m}$." },
        { texte: "La tension finale augmente car le moteur doit fournir le couple supplémentaire : $i = (f\\Omega + C_r)/K$ passe de $0{,}008$ à $0{,}63\\ \\mathrm{A}$.", note: "Action corrective : contrôler la mécanique de la vanne ; côté réglage, un correcteur PI rejetterait cette perturbation, comme on le verra au cours Correcteurs P, PI, PD et PID." },
      ],
      visuelCorrection(conteneur, moteur) {
        const a = simulerBoucle(0.2, 0, 0.012);
        const crEq = (2.78 * (0.2 + A0 / MOT.K) * MOT.K) / MOT.R;
        const n = a.t.length;
        const b = { t: [], w: [] };
        let x = [0, 0];
        const h = 2e-6;
        const f = (t, s) => [(0.2 * (ECHELON_W - s[1]) - MOT.R * s[0] - MOT.K * s[1]) / MOT.L, (MOT.K * s[0] - MOT.f * s[1] - crEq) / MOT.J];
        for (let k = 0; k <= 6000; k += 1) {
          if (k % 25 === 0) {
            b.t.push(k * h);
            b.w.push(x[1]);
          }
          x = pasRK4(f, k * h, x, h);
        }
        traceCorrection(moteur, conteneur, {
          titre: "Même dynamique, valeur finale abaissée par un couple de charge",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "Ω",
          yUnite: "rad/s",
          xMin: 0,
          xMax: 12,
          yMin: 0,
          yMax: 20,
          series: [
            { id: "a", nom: "mise en service", points: a.t.slice(0, n).map((t, i) => [t * 1000, a.w[i]]) },
            { id: "b", nom: "après une saison, Cr ≈ 0,044 N.m", points: b.t.map((t, i) => [t * 1000, b.w[i]]) },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-conceptuel",
      titre: "Question conceptuelle : pourquoi un correcteur proportionnel laisse-t-il un écart ?",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi un correcteur proportionnel appliqué à un procédé sans intégrateur ne peut pas annuler l'erreur statique, " +
        "et pourquoi l'augmentation du gain ne résout pas complètement le problème.</p>",
      motsCles: [
        ["commande", "tension", "puissance", "action", "u ="],
        ["ecart", "erreur", "epsilon", "difference"],
        ["non nul", "necessaire", "besoin", "maintenir", "regime etabli"],
        ["gain", "amortissement", "oscill", "depassement", "instab", "satur"],
      ],
      minimum: 3,
      exemple: "Deux ou trois phrases : reliez commande nécessaire en régime établi, écart, gain et amortissement.",
      etapes: [
        { texte: "En régime établi, le procédé a besoin d'une commande non nulle pour maintenir sa sortie : tension contre la force électromotrice, puissance contre les pertes." },
        { texte: "Avec $u = K_p\\varepsilon$, cette commande n'existe que si l'écart est non nul : $\\varepsilon_s = u_\\infty/K_p$, d'où $1/(1 + K_b)$ en relatif." },
        { texte: "Augmenter $K_p$ réduit l'écart sans l'annuler, réduit l'amortissement et finit par saturer la commande.", note: "Un intégrateur, lui, peut maintenir une commande non nulle avec un écart nul : sa sortie mémorise l'écart passé." },
      ],
      visuelCorrection: correctionEtapes(
        ["régime établi : le procédé exige u∞ ≠ 0", "correcteur P : u = Kp ε → ε∞ = u∞ / Kp ≠ 0", "Kp ↑ : ε∞ ↓ mais ζ ↓ et saturation", "intégrateur : u∞ ≠ 0 avec ε∞ = 0"],
        "Origine de l'erreur statique d'un correcteur proportionnel."
      ),
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

const VISUELS_QUIZ = [
  etapes(["t10 = τ ln(10/9) = 0,105 τ", "t90 = τ ln 10 = 2,303 τ", "tr = τ ln 9 = 2,20 τ"], "Temps de montée d'un premier ordre."),
  etapes(["y = K U (1 - exp(-t/τ)) &lt; K U pour tout t", "pente toujours positive, décroissante", "aucun dépassement possible"], "Un premier ordre ne dépasse jamais."),
  etapes(["D = exp(-π ζ / √(1 - ζ²))", "= exp(-π × 0,6 / 0,8) = exp(-2,356)", "= 9,48 %"], "Dépassement pour ζ = 0,6."),
  etapes(["linéarité : réponse à A u = A × réponse à u", "même forme, amplitude multipliée", "t10, t90, t5 inchangés"], "Indicateurs indépendants de l'amplitude."),
  etapes(["t5 = τ ln 20 = 3,00 τ", "= 3,00 × 40 ms", "= 120 ms"], "Temps d'établissement d'un premier ordre."),
  () => ({ viewBox: "0 0 720 390", dessin: dessinReponse("fl-qv6"), legende: "L'erreur statique se lit entre la consigne, en tirets longs, et la valeur finale, en pointillé." }),
  etapes(["-1 ± 10j : ζ = 1/√101 = 0,0995 → D ≈ 73 %", "-5 ± 5j : ζ = 5/√50 = 0,707 → D ≈ 4,3 %", "l'angle avec l'axe réel négatif fixe ζ"], "Dépassement et position des pôles."),
  etapes(["pôle +2 : mode exp(2t)", "croît sans limite", "instable, quel que soit le reste"], "Pôle à partie réelle positive."),
  etapes(["classe 0 : εs = 1 / (1 + Kb)", "= 1 / (1 + 9)", "= 10 %"], "Erreur statique d'une boucle de classe 0."),
  etapes(["classe 1 : un intégrateur dans L(s)", "échelon : εs = 0 ; rampe a t : εs = a / Kb", "erreur de traînage finie et constante"], "Boucle de classe 1 face à une rampe."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Le temps de montée de $10$ à $90\\ \\%$ d'un premier ordre de constante de temps $\\tau$ vaut :</p>",
        options: ["$\\tau$", "$2{,}20\\,\\tau$", "$3\\,\\tau$", "$0{,}69\\,\\tau$"],
        bonnes: [1],
        explication: "$t_r = \\tau\\ln 10 - \\tau\\ln(10/9) = \\tau\\ln 9 = 2{,}20\\,\\tau$.",
        resume: "Temps de montée",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Un système du premier ordre peut dépasser sa valeur finale si son gain statique est élevé.</p>",
        reponse: false,
        explication: "$y = KU(1 - e^{-t/\\tau})$ reste toujours sous $KU$ : le gain change l'échelle, pas la forme. Il faut au moins deux réservoirs, ou un zéro, pour dépasser.",
        resume: "Premier ordre et dépassement",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Dépassement d'un second ordre sans zéro d'amortissement $\\zeta = 0{,}6$, en pour cent ?</p>",
        valeur: depassement(0.6),
        unite: "%",
        tolerance: 0.02,
        explication: "$D = \\exp(-\\pi \\times 0{,}6/0{,}8) = e^{-2{,}356} = 9{,}48\\ \\%$.",
        resume: "Dépassement",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi le temps de montée d'un système linéaire ne dépend-il pas de l'amplitude de l'échelon ?</p>",
        motsCles: [["lineaire", "linearite", "proportionnel", "superposition", "homogene"], ["forme", "meme courbe", "multipli", "echelle", "amplitude"], ["pourcentage", "relatif", "10", "valeur finale"]],
        minimum: 2,
        explication: "Par linéarité, la réponse à un échelon $A$ fois plus grand est la même courbe multipliée par $A$ : les instants où elle passe à $10\\ \\%$ et $90\\ \\%$ de sa valeur finale sont les mêmes. Une rampe ou une saturation, non linéaires, détruisent cette propriété.",
        resume: "Linéarité et indicateurs",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Premier ordre de constante de temps $40\\ \\mathrm{ms}$. Temps d'établissement à $5\\ \\%$, en millisecondes ?</p>",
        valeur: 40 * Math.log(20),
        unite: "ms",
        tolerance: 0.01,
        explication: "$t_5 = \\tau\\ln 20 = 2{,}996 \\times 40 = 120\\ \\mathrm{ms}$.",
        resume: "t5 d'un premier ordre",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Sur cette réponse indicielle, où se lit l'erreur statique ?</p>",
        consigne: "Cliquez sur la zone correspondante.",
        viewBox: "0 0 720 390",
        dessin: dessinReponse("fl-q6"),
        zones: zonesReponse(1),
        explication: "L'erreur statique est l'écart final entre la consigne et la valeur finale, ici $1 - 0{,}9 = 0{,}1$. Le premier maximum donne le dépassement, la montée le temps de montée, l'entrée dans la bande le temps d'établissement.",
        resume: "Lecture d'une réponse",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Deux systèmes du second ordre ont pour pôles $-1 \\pm 10j$ et $-5 \\pm 5j$. Lequel dépasse le plus sa valeur finale ?</p>",
        options: ["celui de pôles $-1 \\pm 10j$", "celui de pôles $-5 \\pm 5j$", "les deux dépassent autant", "aucun ne dépasse"],
        bonnes: [0],
        explication: "$\\zeta = \\sigma/\\omega_0$ : $1/\\sqrt{101} = 0{,}10$ contre $5/\\sqrt{50} = 0{,}71$. Le premier, presque sur l'axe imaginaire, dépasse d'environ $73\\ \\%$ ; le second d'environ $4{,}3\\ \\%$.",
        resume: "Pôles et dépassement",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Un système dont l'un des pôles vaut $+2\\ \\mathrm{s^{-1}}$ est instable, même si tous ses autres pôles sont très à gauche.</p>",
        reponse: true,
        explication: "Le mode $e^{2t}$ croît sans limite et finit par dominer la réponse : un seul pôle à partie réelle positive suffit.",
        resume: "Stabilité",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Boucle à retour unitaire de classe 0, gain de boucle $K_b = 9$, consigne en échelon. Erreur statique, en pour cent de la consigne ?</p>",
        valeur: 10,
        unite: "%",
        tolerance: 0.01,
        explication: "$\\varepsilon_s = 1/(1 + 9) = 10\\ \\%$, à condition que la boucle fermée soit stable.",
        resume: "Erreur statique",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Une boucle de classe 1, stable, reçoit une consigne en rampe. Son erreur en régime établi est :</p>",
        options: ["nulle", "finie et constante, égale à la pente divisée par le gain de boucle", "infinie", "oscillante"],
        bonnes: [1],
        explication: "Classe 1 : $\\varepsilon_s = a/K_b$, l'erreur de traînage. Il faudrait la classe 2 pour l'annuler.",
        resume: "Classe et rampe",
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
      { categorie: "Indicateurs", question: "Quels sont les cinq indicateurs d'une réponse indicielle ?", reponse: "Valeur finale et erreur statique (précision), temps de montée, temps de pic et temps d'établissement (rapidité), dépassement (amortissement)." },
      { categorie: "Premier ordre", question: "Que valent $t_r$, $t_5$ et $t_2$ pour un premier ordre ?", reponse: "$t_r = \\tau\\ln 9 = 2{,}20\\,\\tau$, $t_5 = \\tau\\ln 20 = 3{,}00\\,\\tau$, $t_2 = \\tau\\ln 50 = 3{,}91\\,\\tau$ ; aucun dépassement." },
      { categorie: "Identification", question: "Comment lire $\\tau$ sur un essai indiciel ?", reponse: "À l'instant où la sortie atteint $63{,}2\\ \\%$ de sa variation finale ; contrôle par $t_5/3$." },
      { categorie: "Second ordre", question: "De quoi dépend le dépassement d'un second ordre sans zéro ?", reponse: "De $\\zeta$ seul : $D = e^{-\\pi\\zeta/\\sqrt{1 - \\zeta^2}}$, soit $16{,}3\\ \\%$ à $0{,}5$ et $4{,}6\\ \\%$ à $0{,}7$." },
      { categorie: "Temps de pic", question: "Où se trouve le premier maximum ?", reponse: "En $t_{pic} = \\pi/\\omega_d$, avec $\\omega_d = \\omega_0\\sqrt{1 - \\zeta^2}$, partie imaginaire des pôles." },
      { categorie: "Établissement", question: "Quelle est la règle approchée du temps d'établissement, et sa limite ?", reponse: "$t_5 \\approx 3/(\\zeta\\omega_0)$, inverse de la partie réelle des pôles ; fausse au-delà de $\\zeta \\approx 0{,}7$, où il faut le tableau." },
      { categorie: "Optimum", question: "Pourquoi vise-t-on souvent $\\zeta \\approx 0{,}7$ ?", reponse: "Le temps d'établissement à $5\\ \\%$ y est minimal, $2{,}87/\\omega_0$ vers $\\zeta = 0{,}69$, pour un dépassement d'environ $5\\ \\%$." },
      { categorie: "Stabilité", question: "Quelle est la condition de stabilité d'un système linéaire ?", reponse: "Tous les pôles à partie réelle strictement négative. Un pôle nul ou des pôles imaginaires purs : limite de stabilité, inacceptable en boucle fermée." },
      { categorie: "Classe", question: "Quelle erreur statique pour une boucle de classe 0 et de classe 1 en échelon ?", reponse: "Classe 0 : $1/(1 + K_b)$ ; classe 1 : nulle. En rampe : infinie en classe 0, $a/K_b$ en classe 1." },
      { categorie: "Dilemme", question: "Que provoque l'augmentation du gain d'un correcteur proportionnel ?", reponse: "Une erreur statique plus faible et une boucle plus rapide, mais un amortissement plus faible, plus de dépassement, et une commande qui sature plus tôt." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["ζ = -ln D / √(π² + ln² D)", "= 2,996 / √(9,870 + 8,974)", "= 2,996 / 4,341 = 0,690"], "Amortissement pour un dépassement de 5 %."),
  etapes(["pôles dominants : parties réelles les plus faibles", "pôle 10 fois plus à gauche : mode 10 fois plus bref", "règle de conception : négligeable au-delà de 5 à 10"], "Pôles dominants."),
  etapes(["classe 1 : εs = a / Kb", "= 2 / 5", "= 0,4 unité"], "Erreur de traînage."),
  etapes(["b = 2 C0 Ωs / Ω0² = 2,131 N.m.s/rad", "τ = J / b = 0,5 / 2,131", "= 0,235 s"], "Constante de temps linéarisée de la pompe."),
  etapes(["Cm = kg (Ωsync - Ω) : il faut un glissement", "gain = kg / (kg + b) = 74,18 / 76,31", "= 0,972 &lt; 1"], "Gain du groupe de pompage sous U/f."),
  etapes(["modulation vectorielle, zone linéaire", "amplitude max de la tension simple = E / √3", "= 540 / 1,732 = 311,8 V"], "Tension maximale d'un onduleur triphasé."),
  etapes(["rang 3 : homopolaire, en phase sur les trois phases", "IN = 3 × I3", "= 3 × 12 = 36 A"], "Courant de neutre dû à l'harmonique 3."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Quel amortissement $\\zeta$ donne un dépassement de $5\\ \\%$ ?</p>",
        valeur: -Math.log(0.05) / Math.sqrt(Math.PI ** 2 + Math.log(0.05) ** 2),
        unite: "",
        tolerance: 0.01,
        explication: "$\\zeta = 2{,}996/\\sqrt{\\pi^2 + 2{,}996^2} = 0{,}690$ : c'est aussi la valeur qui minimise $t_5$.",
        resume: "Inversion de D",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Un pôle réel dix fois plus à gauche que les pôles dominants peut en général être négligé pour estimer les indicateurs.</p>",
        reponse: true,
        explication: "Son mode s'éteint dix fois plus vite ; il retarde à peine la réponse. La règle de cinq à dix est une règle de conception, à vérifier par simulation si l'enjeu l'exige.",
        resume: "Pôles dominants",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Cette séance. Boucle de classe 1, gain de boucle $K_b = 5\\ \\mathrm{s^{-1}}$, consigne en rampe de pente $2$ unités par seconde. Erreur de traînage, en unités ?</p>",
        valeur: 0.4,
        unite: "",
        tolerance: 0.01,
        explication: "$\\varepsilon_s = a/K_b = 2/5 = 0{,}4$ unité.",
        resume: "Erreur de traînage",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours précédent. Pompe à couple imposé linéarisée au point de service : $J = 0{,}5\\ \\mathrm{kg\\cdot m^2}$, $b = 2{,}131\\ \\mathrm{N\\cdot m\\cdot s/rad}$. Constante de temps, en secondes ?</p>",
        valeur: 0.5 / 2.131,
        unite: "s",
        tolerance: 0.01,
        explication: "$\\tau = J/b = 0{,}235\\ \\mathrm{s}$, d'où un temps d'établissement à $5\\ \\%$ de $0{,}70\\ \\mathrm{s}$.",
        resume: "Pompe linéarisée",
      },
      {
        type: "vraiFaux",
        enonce: repere(4) + "<p>Cours précédent. Sous commande U/f, le gain statique $0{,}972$ du groupe de pompage vient du glissement du moteur asynchrone.</p>",
        reponse: true,
        explication: "Le couple exige un glissement : $k_g/(k_g + b) = 74{,}18/76{,}31 = 0{,}972$. C'est une erreur statique de boucle ouverte de $2{,}8\\ \\%$.",
        resume: "Gain sous U/f",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours vieux d'une semaine. Onduleur triphasé sur un bus de $540\\ \\mathrm{V}$, modulation vectorielle en zone linéaire. Amplitude maximale du fondamental de la tension simple, en volts ?</p>",
        valeur: 540 / Math.sqrt(3),
        unite: "V",
        tolerance: 0.01,
        explication: "$E/\\sqrt3 = 311{,}8\\ \\mathrm{V}$ crête, soit $220{,}5\\ \\mathrm{V}$ efficaces, contre $E/2 = 270\\ \\mathrm{V}$ en sinus-triangle sans injection.",
        resume: "Onduleur triphasé",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours vieux d'un mois. Trois charges monophasées identiques, entre phase et neutre, absorbent chacune un courant d'harmonique 3 de $12\\ \\mathrm{A}$. Courant d'harmonique 3 dans le neutre, en ampères ?</p>",
        valeur: 36,
        unite: "A",
        tolerance: 0.01,
        explication: "Le rang 3 est homopolaire : les trois courants sont en phase et s'additionnent dans le neutre, $3 \\times 12 = 36\\ \\mathrm{A}$.",
        resume: "Neutre et rang 3",
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
    titre: "Où en suis-je sur la réponse temporelle et les performances ?",
  });
  if (auto) ressources.push(auto);
}
