/* ==========================================================================
   cours/modelisation-des-systemes-dynamiques/cours.js
   Modélisation des systèmes dynamiques : état et réservoirs d'énergie
   (masse, ressort, amortisseur), linéarisation du couple de la pompe,
   schéma bloc animé du moteur à courant continu, réponse indicielle de
   l'actionneur de vanne, exercices, quiz, cartes, révision et bilan.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = 2 * Math.PI;

/* Pompe du projet fil rouge (inertie supposée). */
const C0 = 194.2; /* N.m à OMEGA0 */
const OMEGA0 = (1475 * TAU) / 60; /* 154,46 rad/s */
const OMEGA_S = (1250 * TAU) / 60; /* 130,90 rad/s */
const J_POMPE = 0.5; /* kg.m² */

/* Actionneur de vanne : K et R du projet, L, J et f supposés. */
const MOT = { K: 0.07, R: 1.2, L: 1.0e-3, J: 2.0e-5, f: 3.6e-5, U: 24 };

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
   Modèles
   -------------------------------------------------------------------------- */

/** Coefficients du dénominateur du moteur : a2 s² + a1 s + a0. */
function coefficientsMoteur(p) {
  return { a2: p.L * p.J, a1: p.R * p.J + p.L * p.f, a0: p.R * p.f + p.K * p.K };
}

/** Réponse exacte de la vitesse à un échelon U, pôles réels distincts. */
function vitesseExacte(t, p) {
  const { a2, a1, a0 } = coefficientsMoteur(p);
  const disc = a1 * a1 - 4 * a2 * a0;
  const r = Math.sqrt(disc);
  const s1 = (-a1 + r) / (2 * a2);
  const s2 = (-a1 - r) / (2 * a2);
  const wf = (p.K * p.U) / a0;
  return wf * (1 + (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s1 - s2));
}

/** Simulation du moteur : échelon U à t = 0, couple Cr appliqué à tCr. */
function simulerMoteur(p, Cr, tCr, tmax) {
  const h = 1e-5;
  const n = Math.round(tmax / h);
  const pas = 10;
  const res = { t: [], i: [], w: [], cr: [] };
  let x = [0, 0];
  const f = (t, s) => {
    const c = t >= tCr ? Cr : 0;
    return [(p.U - p.R * s[0] - p.K * s[1]) / p.L, (p.K * s[0] - p.f * s[1] - c) / p.J];
  };
  for (let k = 0; k <= n; k += 1) {
    const t = k * h;
    if (k % pas === 0) {
      res.t.push(t);
      res.i.push(x[0]);
      res.w.push(x[1]);
      res.cr.push(t >= tCr ? Cr : 0);
    }
    x = pasRK4(f, t, x, h);
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
  construireEtat(racine, api);
  construireLinearisation(racine, api);
  construireMoteur(racine, api);
  construireCourbeExemple(racine, api);
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
    ["#e-rlc-figure svg", 1.3],
    ["#e-algebre-figure svg", 1.5],
    ["#e-echelles-figure svg", 1.4],
    ["#f-schema-principal svg", 2.0],
    ["#i-pompe-figure svg", 1.6],
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
      id: "c1-tau-rl",
      titre: "Constante de temps d'un enroulement",
      niveau: "fondamental",
      enonce:
        "<p>Un enroulement de contacteur a une inductance de $12\\ \\mathrm{mH}$ et une résistance de $0{,}8\\ \\Omega$. " +
        "Quelle est sa constante de temps, en millisecondes ?</p>",
      valeur: 15,
      unite: "ms",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Constante de temps",
      etapes: [
        { texte: "Circuit RL du premier ordre : $\\tau = L/R$." },
        { texte: "$\\tau = 12 \\times 10^{-3}/0{,}8 = 0{,}015\\ \\mathrm{s}$." },
        { texte: "$\\tau = 15\\ \\mathrm{ms}$.", note: "Le courant atteint $63\\ \\%$ de sa valeur finale en $15\\ \\mathrm{ms}$, $95\\ \\%$ en $45\\ \\mathrm{ms}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Établissement du courant dans l'enroulement",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "courant relatif",
          yUnite: "",
          xMin: 0,
          xMax: 75,
          yMin: 0,
          yMax: 1.1,
          series: [{ id: "i", nom: "i(t) / i final", fonction: (t) => 1 - Math.exp(-t / 15) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0.632, "63 %");
            pointRepere(c, r, couleurs, 15, 0.632, "τ = 15 ms");
          },
        });
      },
    })
  );

  const b = (2 * C0 * OMEGA_S) / (OMEGA0 * OMEGA0);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-derivee",
      titre: "Pente du couple de la pompe",
      niveau: "fondamental",
      enonce:
        "<p>Le couple de la pompe vaut $C_r = C_0(\\Omega/\\Omega_0)^2$ avec $C_0 = 194{,}2\\ \\mathrm{N\\cdot m}$ et $\\Omega_0 = 154{,}46\\ \\mathrm{rad/s}$. " +
        "Quelle est la dérivée $\\mathrm{d}C_r/\\mathrm{d}\\Omega$ à $\\Omega_s = 130{,}90\\ \\mathrm{rad/s}$, en $\\mathrm{N\\cdot m\\cdot s/rad}$ ?</p>",
      valeur: b,
      unite: "N.m.s/rad",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Dérivée",
      etapes: [
        { texte: "$\\dfrac{\\mathrm{d}C_r}{\\mathrm{d}\\Omega} = \\dfrac{2C_0\\Omega}{\\Omega_0^2}$." },
        { texte: "$= 2 \\times 194{,}2 \\times 130{,}90/154{,}46^2 = 50\\,842/23\\,858$." },
        { texte: "$= 2{,}131\\ \\mathrm{N\\cdot m\\cdot s/rad}$.", note: "C'est le frottement visqueux équivalent de la pompe autour du point de service, utilisé en section E." },
      ],
      visuelCorrection: correctionEtapes(
        ["dCr/dΩ = 2 C0 Ω / Ω0²", "= 2 × 194,2 × 130,90 / 154,46²", "= 50 842 / 23 858 = 2,131 N.m.s/rad"],
        "Dérivée du couple quadratique au point de service."
      ),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c3-impedance",
      titre: "Impédance d'une inductance",
      niveau: "fondamental",
      enonce: "<p>Quel est le module de l'impédance d'une inductance de $10\\ \\mathrm{mH}$ à $50\\ \\mathrm{Hz}$, en ohms ?</p>",
      valeur: TAU * 50 * 0.01,
      unite: "Ω",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Module",
      etapes: [
        { texte: "$\\underline{Z}_L = jL\\omega$, module $L\\omega$ avec $\\omega = 2\\pi f$." },
        { texte: "$L\\omega = 0{,}01 \\times 2\\pi \\times 50 = 0{,}01 \\times 314{,}16$." },
        { texte: "$= 3{,}14\\ \\Omega$.", note: "En remplaçant $j\\omega$ par $s$, on obtient l'impédance opérationnelle $Ls$ utilisée pour les fonctions de transfert." },
      ],
      visuelCorrection: correctionEtapes(["Z_L = j L ω", "|Z_L| = L × 2π f = 0,01 × 314,16", "= 3,14 Ω ; jω → s donne Z_L = L s"], "De l'impédance complexe à l'impédance opérationnelle."),
    })
  );
}

/* --------------------------------------------------------------------------
   D. Simulation : masse, ressort, amortisseur et plan d'état
   -------------------------------------------------------------------------- */

function construireEtat(racine, api) {
  const conteneur = racine.querySelector("#d-etat-vivant");
  if (!conteneur) return;
  const TMAX = 6;
  const etat = { m: 1, k: 100, f: 4, F0: 0, x0: 8, v0: 0, t: 0, res: null, vMax: 100 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 300",
    role: "img",
    "aria-label": "Masse reliée à un mur par un ressort et un amortisseur, à gauche ; plan d'état position, vitesse avec la trajectoire, à droite",
  });
  /* Décor fixe : mur, sol, axes du plan d'état. */
  const B = { x: 410, y: 24, l: 290, h: 240 };
  const decor = svgEl("g");
  let d = TRAITS + ' stroke-width="2"><path d="M20 50V185M20 185H350"/>';
  for (let y = 56; y <= 180; y += 14) d += '<path d="M20 ' + y + 'L10 ' + (y + 10) + '" stroke-width="1.2"/>';
  d += '<rect x="' + B.x + '" y="' + B.y + '" width="' + B.l + '" height="' + B.h + '" stroke-width="1.4"/>';
  d += '<path d="M' + B.x + " " + (B.y + B.h / 2) + "H" + (B.x + B.l) + "M" + (B.x + B.l / 2) + " " + B.y + "V" + (B.y + B.h) + '" stroke-width="1" stroke-dasharray="3 4"/>';
  d += "</g>";
  d += ECRITS.replace('font-size="12"', 'font-size="11"');
  d += texte(B.x + 6, B.y + B.h / 2 + 16, "x (cm)") + texte(B.x + B.l / 2 + 6, B.y + 12, "v (cm/s)");
  d += texte(B.x - 4, B.y + B.h + 16, "-12") + texte(B.x + B.l - 14, B.y + B.h + 16, "12") + texte(B.x + B.l / 2 - 4, B.y + B.h + 16, "0");
  d += texte(30, 290, "mur fixe") + texte(150, 290, "position de repos : x = 0");
  d += "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const echelleV = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.appendChild(echelleV);

  /* Éléments mobiles. */
  const repos = svgEl("path", { d: "M230 40V196", fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "2 5", opacity: "0.6" });
  const equilibre = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.4", "stroke-dasharray": "2 4" });
  const ressort = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linejoin": "round" });
  const amortisseur = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" });
  const masse = svgEl("rect", { y: "70", width: "60", height: "110", rx: "6", fill: "currentColor", "fill-opacity": "0.12", stroke: "currentColor", "stroke-width": "2" });
  const etiquetteMasse = svgEl("text", { y: "130", fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "13" });
  etiquetteMasse.textContent = "m";
  const vitesse = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2", "marker-end": "url(#d-etat-fl)" });
  const texteVitesse = svgEl("text", { y: "38", fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "11" });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("d-etat-fl");
  const trajectoire = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2" });
  const pointCourant = svgEl("circle", { r: "5", fill: "currentColor" });
  svg.append(defs, repos, equilibre, ressort, amortisseur, masse, etiquetteMasse, vitesse, texteVitesse, trajectoire, pointCourant);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const xPlan = (x) => B.x + ((x + 12) / 24) * B.l;
  const yPlan = (v) => B.y + B.h / 2 - (v / etat.vMax) * (B.h / 2);
  const xDe = (px) => ((px - B.x) / B.l) * 24 - 12;
  const vDe = (py) => ((B.y + B.h / 2 - py) / (B.h / 2)) * etat.vMax;

  function majEchelleV() {
    echelleV.innerHTML =
      texte(B.x + B.l / 2 + 6, B.y + 26, "+" + nb(api, etat.vMax, 0)) + texte(B.x + B.l / 2 + 6, B.y + B.h - 6, "-" + nb(api, etat.vMax, 0));
  }

  const valeurs = api.sim.valeurs("#d-etat-valeurs", [
    { id: "t", libelle: "Temps", unite: "s", decimales: 2 },
    { id: "x", libelle: "Position x", unite: "cm", decimales: 2 },
    { id: "v", libelle: "Vitesse v", unite: "cm/s", decimales: 1 },
    { id: "w0", libelle: "Pulsation propre ω0", unite: "rad/s", decimales: 2 },
    { id: "z", libelle: "Amortissement ζ", decimales: 3 },
    { id: "regime", libelle: "Régime", format: (v) => v },
    { id: "rlc", libelle: "Circuit RLC équivalent", format: (v) => v },
    { id: "E", libelle: "Énergie stockée (ressort et masse)", unite: "mJ", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#d-etat-trace", {
    titre: "Position de la masse en fonction du temps",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "position",
    yUnite: "cm",
    xMin: 0,
    xMax: TMAX,
    yMin: -12,
    yMax: 12,
    ratio: 0.34,
    series: [{ id: "x", nom: "position x(t)", points: [] }],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, etat.F0 / etat.k * 100, "équilibre F0/k", [3, 4]);
      ligneV(c, r, couleurs, etat.t, "t = " + nb(api, etat.t, 2) + " s");
    },
  });
  if (trace) ressources.push(trace);

  function recalculer() {
    const { m, k, f, F0 } = etat;
    const h = 1e-3;
    const n = Math.round(TMAX / h);
    const res = { t: [], x: [], v: [] };
    let s = [etat.x0 / 100, etat.v0 / 100];
    const fn = (t, y) => [y[1], (F0 - k * y[0] - f * y[1]) / m];
    for (let i = 0; i <= n; i += 1) {
      if (i % 5 === 0) {
        res.t.push(i * h);
        res.x.push(s[0] * 100);
        res.v.push(s[1] * 100);
      }
      s = pasRK4(fn, i * h, s, h);
    }
    etat.res = res;
    if (trace) trace.definirDonnees("x", res.t.map((t, i) => [t, Math.max(-12, Math.min(12, res.x[i]))]));
  }

  function dessinerInstant() {
    const r = etat.res;
    if (!r) return;
    const x = interpoler(r.t, r.x, etat.t);
    const v = interpoler(r.t, r.v, etat.t);
    const xc = Math.max(-12, Math.min(12, x));
    const gauche = 200 + 5 * xc;
    masse.setAttribute("x", gauche.toFixed(1));
    etiquetteMasse.setAttribute("x", (gauche + 25).toFixed(1));
    /* Ressort : zigzag de 10 spires entre le mur et la masse. */
    const y0 = 95;
    const L = gauche - 20;
    let dr = "M20 " + y0 + "H" + (20 + L * 0.1).toFixed(1);
    const spires = 10;
    for (let i = 0; i < spires; i += 1) {
      const xa = 20 + L * 0.1 + (L * 0.8 * (i + 0.25)) / spires;
      const xb = 20 + L * 0.1 + (L * 0.8 * (i + 0.75)) / spires;
      dr += "L" + xa.toFixed(1) + " " + (y0 - 10) + "L" + xb.toFixed(1) + " " + (y0 + 10);
    }
    dr += "L" + (20 + L * 0.9).toFixed(1) + " " + y0 + "H" + gauche.toFixed(1);
    ressort.setAttribute("d", dr);
    /* Amortisseur : cylindre et piston, schématiques. */
    const ya = 155;
    const pc = 20 + 0.3 * L;
    const pp = 20 + 0.45 * L;
    let da = "M20 " + ya + "H" + pp.toFixed(1) + "M" + pp.toFixed(1) + " " + (ya - 9) + "V" + (ya + 9);
    da += "M" + pc.toFixed(1) + " " + (ya - 13) + "H" + (pc + 70).toFixed(1) + "V" + (ya + 13) + "H" + pc.toFixed(1);
    da += "M" + (pc + 70).toFixed(1) + " " + ya + "H" + gauche.toFixed(1);
    amortisseur.setAttribute("d", da);
    /* Équilibre sous la force constante. */
    const xe = Math.max(-12, Math.min(12, (etat.F0 / etat.k) * 100));
    const xeq = 230 + 5 * xe;
    equilibre.setAttribute("d", "M" + xeq.toFixed(1) + " 44V196");
    /* Vitesse. */
    const centre = gauche + 30;
    const lv = Math.max(-90, Math.min(90, v * 0.6));
    if (Math.abs(lv) > 3) {
      vitesse.setAttribute("d", "M" + centre.toFixed(1) + " 56H" + (centre + lv).toFixed(1));
      vitesse.setAttribute("opacity", "1");
    } else {
      vitesse.setAttribute("opacity", "0");
    }
    texteVitesse.setAttribute("x", (centre - 40).toFixed(1));
    texteVitesse.textContent = "v = " + nb(api, v, 1) + " cm/s";
    /* Trajectoire jusqu'à l'instant courant. */
    let dt = "";
    for (let i = 0; i < r.t.length && r.t[i] <= etat.t + 1e-9; i += 1) {
      const px = xPlan(Math.max(-12, Math.min(12, r.x[i])));
      const py = Math.max(B.y, Math.min(B.y + B.h, yPlan(r.v[i])));
      dt += (i ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1);
    }
    trajectoire.setAttribute("d", dt || "M0 0");
    pointCourant.setAttribute("cx", xPlan(xc).toFixed(1));
    pointCourant.setAttribute("cy", Math.max(B.y, Math.min(B.y + B.h, yPlan(v))).toFixed(1));

    const { m, k, f } = etat;
    const w0 = Math.sqrt(k / m);
    const z = f / (2 * Math.sqrt(k * m));
    let regime;
    if (z < 1e-9) regime = "non amorti : oscillation entretenue";
    else if (z < 0.995) regime = "pseudo-périodique, pseudo-période " + nb(api, TAU / (w0 * Math.sqrt(1 - z * z)), 3) + " s";
    else if (z <= 1.005) regime = "critique";
    else regime = "apériodique";
    const E = 0.5 * k * Math.pow(x / 100 - etat.F0 / k, 2) + 0.5 * m * Math.pow(v / 100, 2);
    if (valeurs) {
      valeurs.maj({
        t: etat.t,
        x,
        v,
        w0,
        z,
        regime,
        rlc: "L = " + nb(api, m, 2) + " H, R = " + nb(api, f, 1) + " Ω, C = " + nb(api, 1000 / k, 2) + " mF",
        E: E * 1000,
      });
    }
    if (trace) trace.demanderRendu();
  }

  function majVMax() {
    const w0 = Math.sqrt(etat.k / etat.m);
    etat.vMax = Math.max(20, Math.ceil((w0 * 12) / 20) * 20);
    majEchelleV();
  }

  majVMax();

  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: B.x, y: B.y, largeur: B.l, hauteur: B.h },
    valeur: { x: xPlan(etat.x0), y: yPlan(etat.v0) },
    pas: 1,
    libelle: "État initial : position et vitesse",
    format: (mesure) => "x0 " + nb(api, xDe(mesure.x), 1) + " cm, v0 " + nb(api, vDe(mesure.y), 0) + " cm/s",
    rappel(mesure) {
      etat.x0 = Math.max(-12, Math.min(12, xDe(mesure.x)));
      etat.v0 = Math.max(-etat.vMax, Math.min(etat.vMax, vDe(mesure.y)));
      recalculer();
      dessinerInstant();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-etat-curseurs",
    [
      { id: "m", libelle: "Masse m", min: 0.5, max: 4, pas: 0.1, valeur: 1, unite: "kg" },
      { id: "k", libelle: "Raideur k", min: 25, max: 400, pas: 5, valeur: 100, unite: "N/m" },
      { id: "f", libelle: "Frottement visqueux f", min: 0, max: 40, pas: 0.5, valeur: 4, unite: "N.s/m" },
      { id: "F0", libelle: "Force constante F0 appliquée à t = 0", min: -3, max: 3, pas: 0.1, valeur: 0, unite: "N" },
    ],
    (lues) => {
      etat.m = lues.m;
      etat.k = lues.k;
      etat.f = lues.f;
      etat.F0 = lues.F0;
      const ancien = etat.vMax;
      majVMax();
      if (ancien !== etat.vMax) {
        etat.v0 = Math.max(-etat.vMax, Math.min(etat.vMax, etat.v0));
        if (poignee && typeof poignee.set === "function") poignee.set({ x: xPlan(etat.x0), y: yPlan(etat.v0) });
      }
      recalculer();
      dessinerInstant();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-etat-lecteur", {
    de: 0,
    a: TMAX,
    duree: 12,
    boucle: false,
    auto: false,
    libelle: "Temps",
    rappel: (t) => {
      etat.t = t;
      dessinerInstant();
    },
  });
  if (lecteur) ressources.push(lecteur);

  if (!etat.res) recalculer();
  dessinerInstant();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.2 }));
}

/* --------------------------------------------------------------------------
   E. Simulation : linéarisation du couple de la pompe
   -------------------------------------------------------------------------- */

function construireLinearisation(racine, api) {
  const conteneur = racine.querySelector("#e-lin-vivant");
  if (!conteneur) return;
  const TMAX = 4;
  const B = { x: 70, y: 20, l: 540, h: 220 };
  const xW = (w) => B.x + (w / 160) * B.l;
  const yC = (c) => B.y + B.h - (c / 240) * B.h;
  const Cr = (w) => C0 * Math.pow(w / OMEGA0, 2);
  const etat = { Ws: OMEGA_S, p: 10, t: 0, res: null };

  const svg = svgEl("svg", {
    viewBox: "0 0 640 290",
    role: "img",
    "aria-label": "Couple résistant de la pompe en fonction de la vitesse, parabole en trait plein, tangente au point de fonctionnement en tirets, point déplaçable sur la courbe",
  });
  const axes = svgEl("g");
  let a = TRAITS + ' stroke-width="1.5"><rect x="' + B.x + '" y="' + B.y + '" width="' + B.l + '" height="' + B.h + '"/>';
  for (const w of [40, 80, 120]) a += '<path d="M' + xW(w).toFixed(1) + " " + B.y + "V" + (B.y + B.h) + '" stroke-dasharray="1 4" stroke-width="1"/>';
  for (const c of [60, 120, 180]) a += '<path d="M' + B.x + " " + yC(c).toFixed(1) + "H" + (B.x + B.l) + '" stroke-dasharray="1 4" stroke-width="1"/>';
  a += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  for (const w of [0, 40, 80, 120, 160]) a += texte(xW(w) - 8, B.y + B.h + 16, String(w));
  for (const c of [0, 60, 120, 180, 240]) a += texte(B.x - 30, yC(c) + 4, String(c));
  a += texte(B.x + B.l - 150, B.y + B.h + 32, "vitesse Ω (rad/s)") + texte(8, B.y - 6, "couple (N.m)") + "</g>";
  axes.innerHTML = a;
  svg.appendChild(axes);

  const courbe = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.4" });
  let dc = "";
  const echantillons = [];
  for (let w = 0; w <= 160.001; w += 2) dc += (w ? "L" : "M") + xW(w).toFixed(1) + " " + yC(Cr(w)).toFixed(1);
  for (let w = 40; w <= 155.001; w += 0.5) echantillons.push({ x: xW(w), y: yC(Cr(w)) });
  courbe.setAttribute("d", dc);
  const tangente = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-dasharray": "8 5" });
  const niveau = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.2", "stroke-dasharray": "2 4" });
  const pointNL = svgEl("circle", { r: "5", fill: "currentColor" });
  const pointL = svgEl("rect", { width: "9", height: "9", fill: "none", stroke: "currentColor", "stroke-width": "2" });
  const legende = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(courbe, tangente, niveau, pointNL, pointL, legende);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#e-lin-valeurs", [
    { id: "ws", libelle: "Point de fonctionnement", format: (v) => v },
    { id: "cm0", libelle: "Couple d'équilibre Cm0", unite: "N.m", decimales: 2 },
    { id: "b", libelle: "Pente b = dCr/dΩ", unite: "N.m.s/rad", decimales: 3 },
    { id: "tau", libelle: "Constante de temps J/b", unite: "s", decimales: 3 },
    { id: "g", libelle: "Gain 1/b", unite: "rad/s par N.m", decimales: 3 },
    { id: "dl", libelle: "δΩ final, modèle linéarisé", unite: "rad/s", decimales: 2 },
    { id: "dn", libelle: "δΩ final, modèle non linéaire", unite: "rad/s", decimales: 2 },
    { id: "err", libelle: "Écart du modèle linéarisé", format: (v) => v },
    { id: "t", libelle: "Instant du lecteur", unite: "s", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#e-lin-trace", {
    titre: "Variation de vitesse après l'échelon de couple",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "δΩ",
    yUnite: "rad/s",
    xMin: 0,
    xMax: TMAX,
    yMin: -1,
    yMax: 1,
    ratio: 0.36,
    series: [
      { id: "nl", nom: "modèle non linéaire", points: [] },
      { id: "l", nom: "modèle linéarisé", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, etat.t, "t = " + nb(api, etat.t, 2) + " s");
    },
  });
  if (trace) ressources.push(trace);

  function recalculer() {
    const Ws = etat.Ws;
    const Cm0 = Cr(Ws);
    const b = (2 * C0 * Ws) / (OMEGA0 * OMEGA0);
    const dC = (etat.p / 100) * Cm0;
    const h = 2e-3;
    const n = Math.round(TMAX / h);
    const res = { t: [], nl: [], l: [] };
    let w = Ws;
    const fn = (t, y) => [(Cm0 + dC - Cr(y[0])) / J_POMPE];
    for (let i = 0; i <= n; i += 1) {
      const t = i * h;
      if (i % 5 === 0) {
        res.t.push(t);
        res.nl.push(w - Ws);
        res.l.push((dC / b) * (1 - Math.exp((-b * t) / J_POMPE)));
      }
      w = pasRK4(fn, t, [w], h)[0];
    }
    etat.res = res;
    etat.b = b;
    etat.Cm0 = Cm0;
    etat.dC = dC;
    const wfn = OMEGA0 * Math.sqrt(Math.max(0, (Cm0 + dC) / C0)) - Ws;
    etat.dn = wfn;
    etat.dl = dC / b;
    const borne = Math.max(1, 1.45 * Math.max(Math.abs(wfn), Math.abs(dC / b)));
    if (trace) {
      trace.definirPlage({ yMin: -borne, yMax: borne });
      trace.definirDonnees("nl", res.t.map((t, i) => [t, res.nl[i]]));
      trace.definirDonnees("l", res.t.map((t, i) => [t, res.l[i]]));
    }
    /* Tangente sur une largeur de 60 rad/s de part et d'autre. */
    const w1 = Math.max(0, Ws - 60);
    const w2 = Math.min(160, Ws + 60);
    tangente.setAttribute(
      "d",
      "M" + xW(w1).toFixed(1) + " " + yC(Cm0 + b * (w1 - Ws)).toFixed(1) + "L" + xW(w2).toFixed(1) + " " + yC(Cm0 + b * (w2 - Ws)).toFixed(1)
    );
    const yN = yC(Cm0 + dC);
    niveau.setAttribute("d", "M" + B.x + " " + yN.toFixed(1) + "H" + (B.x + B.l));
    legende.innerHTML =
      texte(B.x + 8, yN - 6, "Cm0 + δCm = " + nb(api, Cm0 + dC, 1) + " N.m") +
      texte(B.x + 8, B.y + 16, "trait plein : Cr(Ω) ; tirets : tangente") +
      texte(B.x + 8, B.y + 32, "cercle : non linéaire ; carré : linéarisé");
  }

  function dessinerInstant() {
    const r = etat.res;
    if (!r) return;
    const dn = interpoler(r.t, r.nl, etat.t);
    const dl = interpoler(r.t, r.l, etat.t);
    const wn = etat.Ws + dn;
    const wl = etat.Ws + dl;
    pointNL.setAttribute("cx", xW(wn).toFixed(1));
    pointNL.setAttribute("cy", yC(Cr(wn)).toFixed(1));
    pointL.setAttribute("x", (xW(wl) - 4.5).toFixed(1));
    pointL.setAttribute("y", (yC(etat.Cm0 + etat.b * dl) - 4.5).toFixed(1));
    if (valeurs) {
      const ecart = Math.abs(etat.dn) > 1e-6 ? ((etat.dl - etat.dn) / etat.dn) * 100 : 0;
      valeurs.maj({
        ws: nb(api, etat.Ws, 2) + " rad/s, soit " + nb(api, (etat.Ws * 60) / TAU, 0) + " tr/min",
        cm0: etat.Cm0,
        b: etat.b,
        tau: J_POMPE / etat.b,
        g: 1 / etat.b,
        dl: etat.dl,
        dn: etat.dn,
        err: Math.abs(etat.dn) > 1e-6 ? (ecart >= 0 ? "+" : "") + nb(api, ecart, 1) + " %" : "aucun échelon",
        t: etat.t,
      });
    }
    if (trace) trace.demanderRendu();
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "courbe",
    points: echantillons,
    min: 40,
    max: 155,
    pas: 0.5,
    valeur: OMEGA_S,
    libelle: "Point de fonctionnement sur la courbe de la pompe",
    format: (mesure) => nb(api, mesure.valeur, 1) + " rad/s",
    rappel(mesure) {
      etat.Ws = mesure.valeur;
      recalculer();
      dessinerInstant();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-lin-curseurs",
    [{ id: "p", libelle: "Échelon de couple δCm", min: -30, max: 30, pas: 1, valeur: 10, unite: "% de Cm0" }],
    (lues) => {
      etat.p = lues.p;
      recalculer();
      dessinerInstant();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-lin-lecteur", {
    de: 0,
    a: TMAX,
    duree: 8,
    boucle: false,
    auto: false,
    libelle: "Temps après l'échelon",
    rappel: (t) => {
      etat.t = t;
      dessinerInstant();
    },
  });
  if (lecteur) ressources.push(lecteur);

  if (!etat.res) recalculer();
  dessinerInstant();
  ressources.push(api.dessiner([axes, courbe, tangente], { declencheur: conteneur, duree: 1.2 }));
}

/* --------------------------------------------------------------------------
   E. Simulation : schéma bloc animé du moteur à courant continu
   -------------------------------------------------------------------------- */

function construireMoteur(racine, api) {
  const conteneur = racine.querySelector("#e-moteur-vivant");
  const svg = racine.querySelector("#e-moteur-svg");
  if (!conteneur || !svg) return;
  const TMAX = 0.03;
  const T_CR = 0.015;
  const etat = { L: MOT.L, J: MOT.J, Cr: 0, t: 0, res: null, decalage: 0 };
  ressources.push(api.dessiner(svg, { duree: 1.6 }));

  const ids = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"];
  const chemins = ids.map((id) => svg.querySelector("#e-mot-" + id));
  const groupe = svg.querySelector("#e-mot-points");
  const textes = {
    u: svg.querySelector("#e-mot-vu"),
    i: svg.querySelector("#e-mot-vi"),
    c: svg.querySelector("#e-mot-vc"),
    w: svg.querySelector("#e-mot-vw"),
    e: svg.querySelector("#e-mot-ve"),
  };
  if (!groupe || chemins.some((c) => !c)) return;
  const longueurs = chemins.map((c) => (typeof c.getTotalLength === "function" ? c.getTotalLength() : 60));
  const points = chemins.map(() => {
    const liste = [];
    for (let i = 0; i < 4; i += 1) {
      const cercle = svgEl("circle", { r: 3.4, cx: -10, cy: -10 });
      groupe.appendChild(cercle);
      liste.push(cercle);
    }
    return liste;
  });
  nettoyeurs.push(() => {
    for (const liste of points) for (const cercle of liste) cercle.remove();
  });

  const param = () => ({ ...MOT, L: etat.L, J: etat.J });

  const valeurs = api.sim.valeurs("#e-moteur-valeurs", [
    { id: "t", libelle: "Instant", unite: "ms", decimales: 2 },
    { id: "i", libelle: "Courant i", unite: "A", decimales: 2 },
    { id: "e", libelle: "Force électromotrice e", unite: "V", decimales: 2 },
    { id: "w", libelle: "Vitesse Ω", format: (v) => v },
    { id: "w0", libelle: "ω0 et ζ", format: (v) => v },
    { id: "taus", libelle: "τe, τm et rapport τe/τm", format: (v) => v },
    { id: "poles", libelle: "Pôles du modèle complet", format: (v) => v },
    { id: "final", libelle: "Vitesse finale, sans puis avec Cr", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const traceW = api.sim.traceur("#e-moteur-trace-w", {
    titre: "Vitesse après l'échelon de 24 V",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "vitesse",
    yUnite: "rad/s",
    xMin: 0,
    xMax: TMAX * 1000,
    yMin: 0,
    yMax: 450,
    ratio: 0.36,
    series: [
      { id: "w", nom: "modèle complet, ordre 2", points: [] },
      { id: "wr", nom: "modèle réduit, ordre 1", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, etat.t * 1000, "t = " + nb(api, etat.t * 1000, 1) + " ms");
      if (etat.Cr > 0) ligneV(c, r, couleurs, T_CR * 1000, "Cr appliqué", [6, 4], 30);
    },
  });
  if (traceW) ressources.push(traceW);

  const traceI = api.sim.traceur("#e-moteur-trace-i", {
    titre: "Courant après l'échelon de 24 V",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "courant",
    yUnite: "A",
    xMin: 0,
    xMax: TMAX * 1000,
    yMin: -5,
    yMax: 22,
    ratio: 0.32,
    series: [
      { id: "i", nom: "modèle complet", points: [] },
      { id: "ir", nom: "modèle réduit, courant instantané", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, etat.t * 1000, null);
      ligneH(c, r, couleurs, MOT.U / MOT.R, "U/R = 20 A", [3, 4]);
    },
  });
  if (traceI) ressources.push(traceI);

  function reduit(t, p) {
    const { a0 } = coefficientsMoteur(p);
    const tm = (p.R * p.J) / a0;
    let w = ((p.K * p.U) / a0) * (1 - Math.exp(-t / tm));
    if (t >= T_CR && etat.Cr > 0) w -= ((p.R * etat.Cr) / a0) * (1 - Math.exp(-(t - T_CR) / tm));
    return w;
  }

  function recalculer() {
    const p = param();
    etat.res = simulerMoteur(p, etat.Cr, T_CR, TMAX);
    const r = etat.res;
    const ms = r.t.map((t) => t * 1000);
    const wr = r.t.map((t) => reduit(t, p));
    const ir = r.t.map((t, k) => (p.U - p.K * wr[k]) / p.R);
    const wmax = Math.max(...r.w, ...wr);
    const imin = Math.min(...r.i, ...ir);
    if (traceW) {
      traceW.definirPlage({ yMax: Math.max(400, Math.ceil(wmax / 50) * 50 + 50) });
      traceW.definirDonnees("w", ms.map((t, k) => [t, r.w[k]]));
      traceW.definirDonnees("wr", ms.map((t, k) => [t, wr[k]]));
    }
    if (traceI) {
      traceI.definirPlage({ yMin: Math.min(-2, Math.floor(imin) - 1) });
      traceI.definirDonnees("i", ms.map((t, k) => [t, r.i[k]]));
      traceI.definirDonnees("ir", ms.map((t, k) => [t, ir[k]]));
    }
  }

  function placer() {
    const r = etat.res;
    if (!r) return;
    const p = param();
    const i = interpoler(r.t, r.i, etat.t);
    const w = interpoler(r.t, r.w, etat.t);
    const cr = etat.t >= T_CR ? etat.Cr : 0;
    const e = p.K * w;
    const cm = p.K * i;
    const signaux = [p.U / 24, (p.U - e) / 24, i / 16, cm / 1.1, cr / 0.1, cm / 1.1, w / 340, w / 340, e / 24];
    chemins.forEach((chemin, k) => {
      const intensite = Math.min(1, Math.abs(signaux[k]));
      const actifs = intensite > 0.02 ? Math.max(1, Math.round(intensite * 4)) : 0;
      const sens = signaux[k] >= 0 ? 1 : -1;
      points[k].forEach((cercle, n) => {
        if (n >= actifs) {
          cercle.setAttribute("cx", "-10");
          cercle.setAttribute("cy", "-10");
          return;
        }
        let u = (n / actifs + etat.decalage) % 1;
        if (sens < 0) u = 1 - u;
        const pt = chemin.getPointAtLength(u * longueurs[k]);
        cercle.setAttribute("cx", pt.x.toFixed(1));
        cercle.setAttribute("cy", pt.y.toFixed(1));
      });
    });
    if (textes.u) textes.u.textContent = "u = " + nb(api, p.U, 0) + " V";
    if (textes.i) textes.i.textContent = "i = " + nb(api, i, 2) + " A";
    if (textes.c) textes.c.textContent = "Cm = " + nb(api, cm, 3) + " N.m";
    if (textes.w) textes.w.textContent = "Ω = " + nb(api, w, 1) + " rad/s";
    if (textes.e) textes.e.textContent = "e = " + nb(api, e, 2) + " V";
  }

  function majInstant() {
    const r = etat.res;
    if (!r) return;
    const p = param();
    const { a2, a1, a0 } = coefficientsMoteur(p);
    const i = interpoler(r.t, r.i, etat.t);
    const w = interpoler(r.t, r.w, etat.t);
    const w0 = Math.sqrt(a0 / a2);
    const z = a1 / (2 * Math.sqrt(a2 * a0));
    const disc = a1 * a1 - 4 * a2 * a0;
    let poles;
    if (disc >= 0) {
      const s1 = (-a1 + Math.sqrt(disc)) / (2 * a2);
      const s2 = (-a1 - Math.sqrt(disc)) / (2 * a2);
      poles = nb(api, s1, 1) + " et " + nb(api, s2, 1) + " s⁻¹ ; τ1 = " + nb(api, -1000 / s1, 2) + " ms, τ2 = " + nb(api, -1000 / s2, 2) + " ms";
    } else {
      poles = nb(api, -a1 / (2 * a2), 1) + " ± j " + nb(api, Math.sqrt(-disc) / (2 * a2), 1) + " s⁻¹ : complexes, réponse oscillante";
    }
    const te = p.L / p.R;
    const tm = (p.R * p.J) / a0;
    const wf = (p.K * p.U) / a0;
    const wfc = wf - (p.R * etat.Cr) / a0;
    if (valeurs) {
      valeurs.maj({
        t: etat.t * 1000,
        i,
        e: p.K * w,
        w: nb(api, w, 1) + " rad/s, soit " + nb(api, (w * 60) / TAU, 0) + " tr/min",
        w0: nb(api, w0, 1) + " rad/s ; ζ = " + nb(api, z, 3),
        taus: nb(api, te * 1000, 3) + " ms ; " + nb(api, tm * 1000, 2) + " ms ; " + nb(api, te / tm, 3),
        poles,
        final: nb(api, wf, 1) + " rad/s" + (etat.Cr > 0 ? " ; " + nb(api, wfc, 1) + " rad/s" : " ; pas de couple de charge"),
      });
    }
    placer();
    if (traceW) traceW.demanderRendu();
    if (traceI) traceI.demanderRendu();
  }

  const curseurs = api.sim.curseurs(
    "#e-moteur-curseurs",
    [
      { id: "L", libelle: "Inductance L", min: 0.2, max: 10, pas: 0.1, valeur: MOT.L * 1000, unite: "mH" },
      { id: "J", libelle: "Inertie J", min: 0.5, max: 10, pas: 0.1, valeur: MOT.J * 1e5, unite: "× 10⁻⁵ kg.m²" },
      { id: "Cr", libelle: "Couple de charge appliqué à 15 ms", min: 0, max: 0.1, pas: 0.005, valeur: 0, unite: "N.m" },
    ],
    (lues) => {
      etat.L = lues.L / 1000;
      etat.J = lues.J * 1e-5;
      etat.Cr = lues.Cr;
      recalculer();
      majInstant();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-moteur-lecteur", {
    de: 0,
    a: TMAX * 1000,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Temps après l'échelon (ms)",
    rappel: (t) => {
      etat.t = t / 1000;
      majInstant();
    },
  });
  if (lecteur) ressources.push(lecteur);

  boucleAnimation(api, conteneur, (ecoule) => {
    etat.decalage = (etat.decalage + ecoule * 0.6) % 1;
    placer();
  });
  if (!etat.res) recalculer();
  majInstant();
}

/* --------------------------------------------------------------------------
   H. Réponse indicielle de l'actionneur : modèle complet et réduit
   -------------------------------------------------------------------------- */

function construireCourbeExemple(racine, api) {
  if (!racine.querySelector("#h-courbe")) return;
  const { a0 } = coefficientsMoteur(MOT);
  const wf = (MOT.K * MOT.U) / a0;
  const tm = (MOT.R * MOT.J) / a0;
  let bas = 0;
  let haut = 0.03;
  for (let k = 0; k < 60; k += 1) {
    const milieu = (bas + haut) / 2;
    if (vitesseExacte(milieu, MOT) < 0.632 * wf) bas = milieu;
    else haut = milieu;
  }
  const t63 = (bas + haut) / 2;
  const trace = api.sim.traceur("#h-courbe", {
    titre: "Actionneur de vanne : vitesse après un échelon de 24 V",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "vitesse",
    yUnite: "rad/s",
    xMin: 0,
    xMax: 25,
    yMin: 0,
    yMax: 380,
    ratio: 0.42,
    series: [
      { id: "ex", nom: "modèle complet, pôles -263 et -938 s⁻¹", fonction: (t) => vitesseExacte(t / 1000, MOT) },
      { id: "red", nom: "modèle réduit, τm = 4,86 ms", fonction: (t) => wf * (1 - Math.exp(-t / 1000 / tm)) },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 0.632 * wf, "63 % : 214,8 rad/s");
      ligneH(c, r, couleurs, wf, "339,9 rad/s", [2, 3]);
      ligneV(c, r, couleurs, t63 * 1000, "63 % à " + nb(api, t63 * 1000, 2) + " ms (complet) et " + nb(api, tm * 1000, 2) + " ms (réduit)", [2, 4], 50);
      ligneV(c, r, couleurs, tm * 1000, null, [2, 4]);
    },
  });
  if (trace) ressources.push(trace);
}

/* --------------------------------------------------------------------------
   Dessin du schéma bloc du moteur, pour l'exercice et le quiz
   -------------------------------------------------------------------------- */

function dessinMoteurBlocs(id) {
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.8">';
  s += '<circle cx="90" cy="90" r="14"/><rect x="140" y="66" width="110" height="48" rx="6"/><rect x="290" y="66" width="60" height="48" rx="6"/>';
  s += '<circle cx="400" cy="90" r="14"/><rect x="450" y="66" width="110" height="48" rx="6"/><rect x="310" y="176" width="60" height="44" rx="6"/>';
  const traits = ["M20 90H72", "M104 90H136", "M250 90H286", "M350 90H382", "M400 24V72", "M414 90H446", "M560 90H690", "M620 90V198H374", "M310 198H90V108"];
  for (const t of traits) s += '<path d="' + t + '" marker-end="url(#' + id + ')"/>';
  s += "</g>" + ECRITS;
  s += texte(154, 95, "1/(R + Ls)") + texte(314, 95, "K") + texte(464, 95, "1/(Js + f)") + texte(334, 203, "K");
  s += texte(66, 80, "+") + texte(98, 124, "-") + texte(376, 80, "+") + texte(408, 62, "-");
  s += texte(24, 80, "u") + texte(262, 80, "i") + texte(356, 80, "Cm") + texte(408, 34, "Cr") + texte(664, 80, "Ω") + texte(200, 190, "e");
  s += "</g>";
  return s;
}

const ZONES_MOTEUR = [
  { x: 72, y: 72, largeur: 36, hauteur: 36, etiquette: "sommateur de gauche" },
  { x: 136, y: 62, largeur: 118, hauteur: 56, etiquette: "bloc 1/(R + Ls)" },
  { x: 286, y: 62, largeur: 68, hauteur: 56, etiquette: "bloc K du haut" },
  { x: 382, y: 72, largeur: 36, hauteur: 36, etiquette: "sommateur de droite" },
  { x: 446, y: 62, largeur: 118, hauteur: 56, etiquette: "bloc 1/(Js + f)" },
  { x: 306, y: 172, largeur: 68, hauteur: 52, etiquette: "bloc K du bas" },
];

function zonesMoteur(juste) {
  return ZONES_MOTEUR.map((z, k) => (k === juste ? { ...z, juste: true } : { ...z }));
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-rlc",
      titre: "Fondamental 1 : amortissement d'un circuit RLC",
      niveau: "fondamental",
      enonce:
        "<p>Circuit RLC série, sortie aux bornes du condensateur : $R = 10\\ \\Omega$, $L = 10\\ \\mathrm{mH}$, $C = 100\\ \\mu\\mathrm{F}$. " +
        "Écrivez la fonction de transfert, puis donnez le coefficient d'amortissement $\\zeta$.</p>",
      valeur: 0.5,
      unite: "",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Amortissement ζ",
      etapes: [
        { texte: "$H(s) = \\dfrac{1}{LCs^2 + RCs + 1}$ avec $LC = 10^{-2} \\times 10^{-4} = 10^{-6}\\ \\mathrm{s^2}$ et $RC = 10^{-3}\\ \\mathrm{s}$." },
        { texte: "$\\omega_0 = 1/\\sqrt{LC} = 1000\\ \\mathrm{rad/s}$, soit $159\\ \\mathrm{Hz}$." },
        { texte: "$\\zeta = \\dfrac{R}{2}\\sqrt{\\dfrac{C}{L}} = 5 \\times \\sqrt{10^{-2}} = 0{,}5$.", note: "Contrôle : $2\\zeta/\\omega_0 = RC = 10^{-3}\\ \\mathrm{s}$. Régime pseudo-périodique, dépassement de $16{,}3\\ \\%$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const z = 0.5;
        const wd = 1000 * Math.sqrt(1 - z * z);
        traceCorrection(moteur, conteneur, {
          titre: "Réponse indicielle du circuit, ζ = 0,5",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "uC / E",
          yUnite: "",
          xMin: 0,
          xMax: 12,
          yMin: 0,
          yMax: 1.3,
          series: [
            {
              id: "u",
              nom: "uC(t) / E",
              fonction: (t) => {
                const s = t / 1000;
                return 1 - Math.exp(-z * 1000 * s) * (Math.cos(wd * s) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * s));
              },
            },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 1, "valeur finale", [2, 3]);
            pointRepere(c, r, couleurs, (Math.PI / wd) * 1000, 1.163, "dépassement 16,3 %");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-thermique",
      titre: "Fondamental 2 : modèle thermique du dissipateur",
      niveau: "fondamental",
      enonce:
        "<p>Le dissipateur du variateur a une capacité thermique $C_{th} = 3600\\ \\mathrm{J/K}$ et une résistance vers l'air $R_{ha} = 0{,}12\\ \\mathrm{K/W}$. " +
        "Entrée : la puissance $P$ ; sortie : l'échauffement $\\theta = T_h - T_a$. Établissez la fonction de transfert $\\Theta(s)/P(s)$ et donnez sa constante de temps, en secondes.</p>",
      valeur: 432,
      unite: "s",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Constante de temps",
      etapes: [
        { texte: "Bilan d'énergie, loi physique : $C_{th}\\,\\dot{\\theta} = P - \\theta/R_{ha}$. Un réservoir, donc un premier ordre." },
        { texte: "Laplace, condition initiale nulle : $\\dfrac{\\Theta(s)}{P(s)} = \\dfrac{R_{ha}}{1 + R_{ha}C_{th}\\,s}$." },
        { texte: "Gain $R_{ha} = 0{,}12\\ \\mathrm{K/W}$ ; $\\tau = R_{ha}C_{th} = 0{,}12 \\times 3600 = 432\\ \\mathrm{s}$.", note: "Analogue d'un circuit RC alimenté en courant : $P$ joue le courant, $\\theta$ la tension." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Échauffement pour un échelon de 455 W",
          xTitre: "temps",
          xUnite: "min",
          yTitre: "θ",
          yUnite: "K",
          xMin: 0,
          xMax: 40,
          yMin: 0,
          yMax: 60,
          series: [{ id: "th", nom: "θ(t)", fonction: (m) => 0.12 * 455.4 * (1 - Math.exp((-m * 60) / 432)) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0.12 * 455.4, "54,6 K", [2, 3]);
            pointRepere(c, r, couleurs, 7.2, 0.632 * 54.65, "τ = 432 s = 7,2 min");
          },
        });
      },
    })
  );

  const W1 = (1000 * TAU) / 60;
  const b1 = (2 * C0 * W1) / (OMEGA0 * OMEGA0);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-linearisation",
      titre: "Intermédiaire 1 : linéarisation à basse vitesse",
      niveau: "intermédiaire",
      enonce:
        "<p>La pompe ($J = 0{,}5\\ \\mathrm{kg\\cdot m^2}$, $C_r = C_0(\\Omega/\\Omega_0)^2$, $C_0 = 194{,}2\\ \\mathrm{N\\cdot m}$, $\\Omega_0 = 154{,}46\\ \\mathrm{rad/s}$) " +
        "tourne à $1000\\ \\mathrm{tr/min}$ avec un couple moteur imposé. Quelle est la constante de temps du modèle linéarisé $\\delta\\Omega/\\delta C_m$, en secondes ?</p>",
      valeur: J_POMPE / b1,
      unite: "s",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Constante de temps",
      etapes: [
        { texte: "Conversion : $\\Omega_1 = 1000 \\times 2\\pi/60 = 104{,}72\\ \\mathrm{rad/s}$." },
        { texte: "Pente : $b = 2C_0\\Omega_1/\\Omega_0^2 = 2 \\times 194{,}2 \\times 104{,}72/23\\,858 = 1{,}705\\ \\mathrm{N\\cdot m\\cdot s/rad}$." },
        { texte: "$\\tau = J/b = 0{,}5/1{,}705 = 0{,}293\\ \\mathrm{s}$.", note: "Contre $0{,}235\\ \\mathrm{s}$ à $1250\\ \\mathrm{tr/min}$ : $\\tau$ varie comme $1/\\Omega$, le procédé est plus lent à basse vitesse." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Constante de temps linéarisée selon la vitesse",
          xTitre: "vitesse",
          xUnite: "tr/min",
          yTitre: "τ = J/b",
          yUnite: "s",
          xMin: 400,
          xMax: 1500,
          yMin: 0,
          yMax: 0.8,
          series: [{ id: "tau", nom: "J / b(Ω)", fonction: (n) => J_POMPE / ((2 * C0 * (n * TAU) / 60) / (OMEGA0 * OMEGA0)) }],
          surDessin({ c, repere: r, couleurs }) {
            pointRepere(c, r, couleurs, 1000, J_POMPE / b1, "1000 tr/min : 0,293 s");
            pointRepere(c, r, couleurs, 1250, 0.2346, "1250 tr/min : 0,235 s");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.schema(cible, {
      id: "k4-schema-cr",
      titre: "Intermédiaire 2 : lecture de schéma bloc",
      niveau: "intermédiaire",
      consigne: "Cliquez sur l'élément où le couple de charge entre dans le modèle.",
      enonce:
        "<p>Sur le schéma bloc du moteur à courant continu, la vanne exerce un couple résistant $C_r$. Où ce couple agit-il, et pourquoi la vitesse " +
        "finale baisse-t-elle alors que la tension $u$ n'a pas changé ?</p>",
      viewBox: "0 0 720 240",
      dessin: dessinMoteurBlocs("fl-k4"),
      zones: zonesMoteur(3),
      etapes: [
        { texte: "Le couple de charge est un couple mécanique : il s'ajoute, avec le signe moins, au couple moteur dans le principe fondamental de la dynamique, au second sommateur." },
        { texte: "La vitesse baisse, donc $e = K\\Omega$ baisse, donc $u - e$ et le courant augmentent jusqu'à ce que $Ki = f\\Omega + C_r$ : la boucle de la force électromotrice compense en partie." },
        { texte: "Chute de vitesse en régime établi : $R\\,C_r/(Rf + K^2) = 242{,}8\\ \\mathrm{rad/s}$ par $\\mathrm{N\\cdot m}$ pour l'actionneur.", note: "Une perturbation entre toujours au point où elle agit physiquement, pas à l'entrée de commande." },
      ],
      visuelCorrection: correctionEtapes(
        ["Cr : couple mécanique, au sommateur de droite (signe -)", "Ω baisse → e baisse → i monte → Cm compense", "régime établi : δΩ = - R Cr / (Rf + K²)", "= - 242,8 rad/s par N.m pour l'actionneur"],
        "Où entre une perturbation dans un schéma bloc."
      ),
    })
  );

  const { a2, a1, a0 } = coefficientsMoteur(MOT);
  const s1 = (-a1 + Math.sqrt(a1 * a1 - 4 * a2 * a0)) / (2 * a2);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-poles",
      titre: "Avancé : constante de temps dominante de l'actionneur",
      niveau: "avancé",
      enonce:
        "<p>Actionneur de vanne : $K = 0{,}070\\ \\mathrm{V\\cdot s/rad}$, $R = 1{,}2\\ \\Omega$, $L = 1{,}0\\ \\mathrm{mH}$, $J = 2{,}0 \\times 10^{-5}\\ \\mathrm{kg\\cdot m^2}$, " +
        "$f = 3{,}6 \\times 10^{-5}\\ \\mathrm{N\\cdot m\\cdot s/rad}$. Calculez la constante de temps du pôle dominant du modèle complet, en millisecondes, " +
        "et comparez-la à $\\tau_m$. Le modèle réduit est-il justifié ?</p>",
      valeur: -1000 / s1,
      unite: "ms",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Constante dominante",
      etapes: [
        { texte: "Dénominateur : $LJ\\,s^2 + (RJ + Lf)\\,s + (Rf + K^2) = 2{,}0 \\times 10^{-8}\\,s^2 + 2{,}4036 \\times 10^{-5}\\,s + 4{,}9432 \\times 10^{-3}$." },
        { texte: "Discriminant $5{,}777 \\times 10^{-10} - 3{,}955 \\times 10^{-10} = 1{,}823 \\times 10^{-10}$, racine $1{,}350 \\times 10^{-5}$." },
        { texte: "$s_1 = (-2{,}4036 + 1{,}350) \\times 10^{-5}/4 \\times 10^{-8} = -263{,}4\\ \\mathrm{s^{-1}}$, d'où $\\tau_1 = 3{,}80\\ \\mathrm{ms}$ ; $s_2 = -938{,}4\\ \\mathrm{s^{-1}}$, $\\tau_2 = 1{,}07\\ \\mathrm{ms}$." },
        {
          texte: "$\\tau_m = RJ/(Rf + K^2) = 4{,}86\\ \\mathrm{ms}$, soit $\\tau_1 + \\tau_2$ à $0{,}2\\ \\%$ près : $\\tau_e/\\tau_m = 0{,}17$ dépasse la règle de $0{,}1$, l'écart est de $28\\ \\%$ sur la constante dominante.",
          note: "Le modèle réduit reste acceptable pour une estimation du temps de manœuvre ; pas pour le réglage d'une boucle de courant ou de vitesse rapide.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Pôles et constantes de temps selon l'inductance",
          xTitre: "inductance L",
          xUnite: "mH",
          yTitre: "constante",
          yUnite: "ms",
          xMin: 0.05,
          xMax: 1.4,
          yMin: 0,
          yMax: 6,
          series: [
            {
              id: "t1",
              nom: "τ1, pôle dominant",
              fonction: (l) => {
                const p = { ...MOT, L: l / 1000 };
                const c = coefficientsMoteur(p);
                const dd = c.a1 * c.a1 - 4 * c.a2 * c.a0;
                return dd < 0 ? NaN : -1000 / ((-c.a1 + Math.sqrt(dd)) / (2 * c.a2));
              },
            },
            { id: "tm", nom: "τm du modèle réduit", fonction: () => 4.855 },
            {
              id: "t2",
              nom: "τ2, pôle rapide",
              fonction: (l) => {
                const p = { ...MOT, L: l / 1000 };
                const c = coefficientsMoteur(p);
                const dd = c.a1 * c.a1 - 4 * c.a2 * c.a0;
                return dd < 0 ? NaN : -1000 / ((-c.a1 - Math.sqrt(dd)) / (2 * c.a2));
              },
            },
          ],
          surDessin({ c, repere: r, couleurs }) {
            pointRepere(c, r, couleurs, 1.0, 3.797, "L = 1 mH : 3,80 ms");
            ligneV(c, r, couleurs, 1.0, null);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-diagnostic-rampe",
      titre: "Diagnostic industriel : l'essai indiciel de la pompe",
      niveau: "diagnostic",
      enonce:
        "<p>Au point de service, sous commande U/f, on applique un échelon de consigne de $+2\\ \\mathrm{Hz}$. Le modèle linéarisé prévoyait une " +
        "exponentielle de constante $6{,}55\\ \\mathrm{ms}$. L'enregistrement montre une montée en ligne droite pendant $0{,}40\\ \\mathrm{s}$, puis une " +
        "stabilisation sans dépassement ; la variation finale vaut $97\\ \\%$ de la variation de vitesse de synchronisme. La rampe paramétrée est de " +
        "$10\\ \\mathrm{s}$ pour $50\\ \\mathrm{Hz}$. Quelles conclusions sont justifiées ?</p>",
      multiple: true,
      options: [
        { texte: "La montée linéaire de $0{,}40\\ \\mathrm{s}$ est la rampe du variateur : $10 \\times 2/50 = 0{,}40\\ \\mathrm{s}$.", juste: true },
        { texte: "Le gain mesuré confirme la pente $k_g$ tirée de la plaque, puisque $0{,}97$ est proche des $0{,}972$ prévus.", juste: true },
        { texte: "Le modèle de la future boucle doit comporter un limiteur de pente en amont du premier ordre.", juste: true },
        { texte: "L'inertie réelle est soixante fois plus grande que l'inertie supposée." },
        { texte: "Le modèle linéarisé est faux et doit être abandonné." },
      ],
      etapes: [
        { texte: "Forme linéaire, et non exponentielle : signature d'une limitation de pente, pas d'une constante de temps. $2\\ \\mathrm{Hz}$ à $5\\ \\mathrm{Hz/s}$ demandent bien $0{,}40\\ \\mathrm{s}$." },
        { texte: "Une inertie soixante fois plus grande donnerait une exponentielle de $0{,}39\\ \\mathrm{s}$ environ, de forme arrondie dès le départ : ce n'est pas ce qu'on observe." },
        { texte: "Le gain de $0{,}97$ valide $k_g/(k_g + b)$ ; le modèle linéarisé est juste mais incomplet : la rampe, non linéaire, le précède.", note: "Pour mesurer $6{,}55\\ \\mathrm{ms}$, il faudrait raccourcir la rampe pendant l'essai, avec l'accord de l'exploitant." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Échelon de consigne de 2 Hz : forme attendue",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "δΩ",
          yUnite: "rad/s",
          xMin: 0,
          xMax: 1,
          yMin: 0,
          yMax: 7,
          series: [
            { id: "r", nom: "rampe suivie du premier ordre de 6,55 ms", fonction: (t) => 0.972 * (TAU * 2 / 2) * Math.min(1, t / 0.4) },
            { id: "e", nom: "exponentielle si l'inertie était 60 fois plus grande", fonction: (t) => 0.972 * (TAU * 2 / 2) * (1 - Math.exp(-t / 0.39)) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneV(c, r, couleurs, 0.4, "0,40 s");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-conceptuel",
      titre: "Question conceptuelle : pourquoi ces variables d'état ?",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi on choisit comme variables d'état d'un circuit les tensions des condensateurs et les courants des " +
        "inductances, plutôt que les tensions des résistances.</p>",
      motsCles: [["energie", "reservoir", "stock"], ["continu", "saut", "brusque", "instantan", "discontinu"], ["memoire", "passe", "avenir", "predire", "initial"], ["resistance", "dissipe", "instantane", "aucune energie"]],
      minimum: 3,
      exemple: "Deux ou trois phrases : reliez énergie stockée, continuité et prédiction de l'avenir.",
      etapes: [
        { texte: "Un condensateur stocke $\\tfrac12 Cu^2$, une inductance $\\tfrac12 Li^2$ : ce sont les réservoirs d'énergie du circuit." },
        { texte: "Une énergie ne peut pas varier instantanément avec une puissance finie : $u_C$ et $i_L$ sont continues, et leur valeur à un instant résume tout le passé utile." },
        { texte: "La tension d'une résistance, elle, suit instantanément le courant : elle ne garde aucune mémoire et se déduit des variables d'état.", note: "D'où le nombre de variables d'état égal au nombre de réservoirs indépendants." },
      ],
      visuelCorrection: correctionEtapes(
        ["condensateur : ½ C u² → u_C continue", "inductance : ½ L i² → i_L continu", "résistance : dissipe, aucune mémoire", "état = (u_C, i_L) : il suffit à prédire l'avenir"],
        "Réservoirs d'énergie et variables d'état."
      ),
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

const VISUELS_QUIZ = [
  etapes(["ordre = nombre de réservoirs d'énergie indépendants", "RLC série : L et C → ordre 2", "deux C en parallèle : un seul réservoir"], "Ordre d'un système."),
  etapes(["H(s) = Y(s) / U(s), conditions initiales nulles", "elle ne dépend que du système", "un état initial non nul ajoute une réponse libre"], "Définition de la fonction de transfert."),
  etapes(["ω0 = 1 / √(LC)", "= 1 / √(5e-3 × 20e-6) = 1 / √(1e-7)", "= 3162 rad/s"], "Pulsation propre."),
  etapes(["équilibre : f(x0, u0) = 0, l'état ne bouge plus", "hors équilibre : un terme constant subsiste", "le modèle des écarts dérive"], "Pourquoi un point d'équilibre."),
  etapes(["valeur finale = K × amplitude", "= 5 × 3", "= 15"], "Gain statique d'un premier ordre."),
  () => ({ viewBox: "0 0 720 240", dessin: dessinMoteurBlocs("fl-qv6"), legende: "Le bloc K du bas convertit la vitesse en force électromotrice e = K Ω, retranchée à u." }),
  etapes(["ε = r - H y ; y = G ε", "y (1 + G H) = G r", "Y / R = G / (1 + G H)"], "Rétroaction négative."),
  etapes(["erreur = C0 δΩ² / Ω0²", "+10 % : 4,8 % de la variation exacte", "+20 % : 9,1 %"], "Erreur de linéarisation de la pompe."),
  etapes(["τ = R_th × C_th", "= 0,5 × 800", "= 400 s"], "Constante de temps thermique."),
  etapes(["u_C : énergie ½ C u², continue", "i_L : énergie ½ L i², continu", "état du RLC : (u_C, i)"], "Variables d'état du circuit RLC."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>L'ordre d'un système linéaire est égal :</p>",
        options: ["au nombre de résistances", "au nombre de réservoirs d'énergie indépendants", "au nombre d'entrées", "au degré du numérateur de sa fonction de transfert"],
        bonnes: [1],
        explication: "Chaque réservoir indépendant porte une variable d'état ; leur nombre est le degré du dénominateur.",
        resume: "Ordre et réservoirs",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>La fonction de transfert d'un circuit dépend de la charge initiale de ses condensateurs.</p>",
        reponse: false,
        explication: "Elle est définie à conditions initiales nulles et ne dépend que du système ; l'état initial ajoute une réponse libre à part.",
        resume: "Définition de H(s)",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Circuit LC avec $L = 5\\ \\mathrm{mH}$ et $C = 20\\ \\mu\\mathrm{F}$. Pulsation propre, en $\\mathrm{rad/s}$ ?</p>",
        valeur: 1 / Math.sqrt(5e-3 * 20e-6),
        unite: "rad/s",
        tolerance: 0.01,
        explication: "$\\omega_0 = 1/\\sqrt{10^{-7}} = 3162\\ \\mathrm{rad/s}$, soit $503\\ \\mathrm{Hz}$.",
        resume: "Pulsation propre",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi linéarise-t-on autour d'un point d'équilibre plutôt qu'autour d'un point quelconque ?</p>",
        motsCles: [["equilibre", "derivee nulle", "f(x0", "ne bouge", "constant"], ["terme constant", "derive", "derivait", "s'eloigne", "reste"], ["petit", "ecart", "variation", "autour"]],
        minimum: 2,
        explication: "À l'équilibre, $f(x_0, u_0) = 0$ : le développement ne garde que les termes en $\\delta x$ et $\\delta u$. Ailleurs, un terme constant ferait dériver l'état et le modèle ne décrirait plus de petites variations.",
        resume: "Point d'équilibre",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>$H(s) = \\dfrac{5}{1 + 0{,}2\\,s}$ reçoit un échelon d'amplitude $3$. Valeur finale de la sortie ?</p>",
        valeur: 15,
        unite: "",
        tolerance: 0.01,
        explication: "Valeur finale $= H(0) \\times 3 = 15$, atteinte à $95\\ \\%$ après $3\\tau = 0{,}6\\ \\mathrm{s}$.",
        resume: "Gain statique",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Sur ce schéma bloc du moteur, quel bloc produit la force électromotrice ?</p>",
        consigne: "Cliquez sur le bloc correspondant.",
        viewBox: "0 0 720 240",
        dessin: dessinMoteurBlocs("fl-q6"),
        zones: zonesMoteur(5),
        explication: "Le bloc $K$ du retour transforme la vitesse en $e = K\\Omega$, retranchée à $u$ au premier sommateur : c'est la rétroaction interne du moteur.",
        resume: "Rétroaction interne",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Une chaîne directe $G$ est bouclée par un retour $H$ soustrait à l'entrée. La transmittance en boucle fermée vaut :</p>",
        options: ["$G/(1 - GH)$", "$G/(1 + GH)$", "$GH/(1 + G)$", "$G + H$"],
        bonnes: [1],
        explication: "$y = G(r - Hy)$ donne $y(1 + GH) = Gr$.",
        resume: "Rétroaction",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Pour la pompe, l'erreur du modèle linéarisé reste sous $5\\ \\%$ pour une hausse de vitesse de $10\\ \\%$ autour du point de service, mais double pour $20\\ \\%$.</p>",
        reponse: true,
        explication: "L'erreur vaut $C_0\\delta\\Omega^2/\\Omega_0^2$ : $4{,}8\\ \\%$ de la variation exacte à $+10\\ \\%$, $9{,}1\\ \\%$ à $+20\\ \\%$.",
        resume: "Domaine de validité",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Un capteur de température a une résistance thermique $0{,}5\\ \\mathrm{K/W}$ vers le fluide et une capacité thermique de $800\\ \\mathrm{J/K}$. Constante de temps, en secondes ?</p>",
        valeur: 400,
        unite: "s",
        tolerance: 0.01,
        explication: "$\\tau = R_{th}C_{th} = 0{,}5 \\times 800 = 400\\ \\mathrm{s}$ : un capteur aussi lent masquerait toute dynamique plus rapide dans une boucle.",
        resume: "Premier ordre thermique",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Quel couple de variables constitue un état valable pour le circuit RLC série ?</p>",
        options: ["tension de la résistance et tension de l'inductance", "tension du condensateur et courant de l'inductance", "courant et puissance de la source", "charge du condensateur seule"],
        bonnes: [1],
        explication: "Les deux réservoirs, $C$ et $L$, imposent $u_C$ et $i$, continues. Une seule grandeur ne suffit pas pour un second ordre.",
        resume: "Choix de l'état",
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
      { categorie: "État", question: "Qu'est-ce que l'état d'un système ?", reponse: "L'ensemble minimal de grandeurs qui, avec les entrées futures, suffit à prédire tout l'avenir du système ; une variable par réservoir d'énergie indépendant." },
      { categorie: "Ordre", question: "Comment trouver l'ordre d'un système sans calcul ?", reponse: "Compter les réservoirs d'énergie indépendants : condensateurs, inductances, inerties, raideurs, masses thermiques. Deux condensateurs en parallèle comptent pour un." },
      { categorie: "Laplace", question: "Que suppose le passage de la dérivée à la multiplication par $s$ ?", reponse: "Des conditions initiales nulles : $\\mathcal{L}\\{\\dot{y}\\} = sY(s) - y(0)$." },
      { categorie: "Transfert", question: "Quelles sont les deux informations essentielles d'une fonction de transfert ?", reponse: "Le gain statique $H(0)$, valeur finale par unité d'échelon, et les pôles, racines du dénominateur, qui fixent les modes et leur durée." },
      { categorie: "Second ordre", question: "Que valent $\\omega_0$ et $\\zeta$ pour un RLC série ?", reponse: "$\\omega_0 = 1/\\sqrt{LC}$ et $\\zeta = \\tfrac{R}{2}\\sqrt{C/L}$ ; pour une masse, $\\sqrt{k/m}$ et $f/(2\\sqrt{km})$." },
      { categorie: "Linéarisation", question: "Quelles sont les deux étapes d'une linéarisation ?", reponse: "Trouver le point d'équilibre $f(x_0, u_0) = 0$, puis remplacer $f$ par ses dérivées partielles en ce point ; et noter le domaine de validité." },
      { categorie: "Pompe", question: "Quel est le modèle linéarisé de la pompe à couple imposé au point de service ?", reponse: "$b = 2C_0\\Omega_s/\\Omega_0^2 = 2{,}131\\ \\mathrm{N\\cdot m\\cdot s/rad}$ ; $\\delta\\Omega/\\delta C_m = 0{,}469/(1 + 0{,}235\\,s)$." },
      { categorie: "Boucle", question: "Quelle est la transmittance d'une rétroaction négative ?", reponse: "$G/(1 + GH)$ ; si $GH \\gg 1$, elle tend vers $1/H$." },
      { categorie: "Moteur CC", question: "Pourquoi $\\tau_m = RJ/K^2$ et non $J/f$ ?", reponse: "La force électromotrice crée une rétroaction interne : toute variation de vitesse change le courant et le couple. Le moteur agit comme un frottement équivalent $K^2/R$." },
      { categorie: "Réduction", question: "Quand peut-on négliger une constante de temps ?", reponse: "Quand elle est au moins dix fois plus petite que la plus lente qui compte, ou hors de la fenêtre de temps utile ; sinon, chiffrer l'erreur." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["τ1 + τ2 = 3,797 + 1,066", "= 4,863 ms", "≈ τm = 4,86 ms"], "Constante du modèle réduit."),
  etapes(["(u_C, i), (q, i), (u_C, du_C/dt) : tous valables", "l'ordre et les pôles, eux, ne changent pas", "la représentation d'état n'est pas unique"], "Non-unicité de l'état."),
  etapes(["bus : 0,88 ms → quasi statique", "mécanique : dans la fenêtre → état", "dissipateur : 432 s → paramètre"], "Séparation des échelles de temps."),
  etapes(["V = (V0 + √(V0² - 4 R P)) / 2", "= (538,5 + √(289 982 - 50 103)) / 2", "= (538,5 + 489,8) / 2 = 514,1 V"], "Tension du bus à pleine puissance."),
  etapes(["régulateur : refuse l'énergie au-delà de 760 V", "la pompe freine seule, plus lentement", "pas de déclenchement, mais arrêt allongé"], "Régulateur de surtension."),
  etapes(["V̂1 = m_a E = 0,8 × 400 = 320 V", "efficace = 320 / √2", "= 226,3 V"], "Fondamental d'un pont en H en modulation bipolaire."),
  etapes(["carré ± E : b_n = 4E / (nπ), n impair", "n = 3 : 4 × 10 / (3π)", "= 4,24 V"], "Harmonique 3 d'un signal carré."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Le modèle complet de l'actionneur a deux pôles de constantes $3{,}797$ et $1{,}066\\ \\mathrm{ms}$. Quelle constante de temps prend un modèle réduit du premier ordre qui conserve leur somme, en millisecondes ?</p>",
        valeur: 3.797 + 1.066,
        unite: "ms",
        tolerance: 0.01,
        explication: "$3{,}797 + 1{,}066 = 4{,}86\\ \\mathrm{ms}$, la valeur de $\\tau_m = RJ/(Rf + K^2)$.",
        resume: "Réduction d'ordre",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Un système donné admet une seule représentation d'état.</p>",
        reponse: false,
        explication: "Tout changement de variables inversible donne une autre représentation ; l'ordre et les pôles sont, eux, invariants.",
        resume: "Non-unicité",
      },
      {
        type: "qcm",
        enonce: repere(2) + "<p>Cette séance. Pour régler une boucle de vitesse de la pompe, de fenêtre $10\\ \\mathrm{ms}$ à $10\\ \\mathrm{s}$, quelle dynamique faut-il garder comme variable d'état ?</p>",
        options: ["la tension du bus, $0{,}88\\ \\mathrm{ms}$", "la vitesse de l'arbre", "la température du dissipateur, $432\\ \\mathrm{s}$", "toutes à la fois"],
        bonnes: [1],
        explication: "Le bus est quasi statique à cette échelle, le dissipateur un paramètre ; seule la mécanique et la rampe sont dans la fenêtre.",
        resume: "Échelles de temps",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours précédent. Bus de la pompe, $V_0 = 538{,}5\\ \\mathrm{V}$, $R = 0{,}389\\ \\Omega$, KM2 fermé, puissance prélevée $32{,}2\\ \\mathrm{kW}$. Tension du bus, en volts ?</p>",
        valeur: (538.5 + Math.sqrt(538.5 * 538.5 - 4 * 0.389 * 32200)) / 2,
        unite: "V",
        tolerance: 0.005,
        explication: "Racine haute de $V^2 - V_0V + RP = 0$ : $V = (538{,}5 + 489{,}8)/2 = 514{,}1\\ \\mathrm{V}$.",
        resume: "Bus à puissance constante",
      },
      {
        type: "vraiFaux",
        enonce: repere(4) + "<p>Cours précédent. Activer le régulateur de surtension du variateur raccourcit l'arrêt de la pompe.</p>",
        reponse: false,
        explication: "Il évite le déclenchement en refusant l'énergie au-delà du seuil, ce qui allonge au contraire l'arrêt.",
        resume: "Régulateur de surtension",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours vieux d'une semaine. Pont en H, bus de $400\\ \\mathrm{V}$, modulation sinusoïdale bipolaire d'indice $m_a = 0{,}8$. Valeur efficace du fondamental de la tension de sortie, en volts ?</p>",
        valeur: (0.8 * 400) / Math.SQRT2,
        unite: "V",
        tolerance: 0.01,
        explication: "Amplitude $m_aE = 320\\ \\mathrm{V}$, efficace $320/\\sqrt2 = 226{,}3\\ \\mathrm{V}$.",
        resume: "Fondamental d'un onduleur",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours vieux d'un mois. Un signal carré symétrique d'amplitude $\\pm 10\\ \\mathrm{V}$ attaque un système linéaire. Amplitude de son harmonique de rang 3, en volts ?</p>",
        valeur: 40 / (3 * Math.PI),
        unite: "V",
        tolerance: 0.01,
        explication: "$b_3 = 4E/(3\\pi) = 4{,}24\\ \\mathrm{V}$. Par superposition, le système traite chaque harmonique avec $H(j3\\omega)$, puis on additionne.",
        resume: "Série de Fourier",
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
    titre: "Où en suis-je sur la modélisation des systèmes dynamiques ?",
  });
  if (auto) ressources.push(auto);
}
