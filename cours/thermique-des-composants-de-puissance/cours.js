/* ==========================================================================
   cours/thermique-des-composants-de-puissance/cours.js
   Thermique des composants de puissance : chaîne jonction, boîtier,
   dissipateur et air ; conduction, convection et rayonnement ; dissipateur
   partagé ; capacités thermiques, réseaux de Cauer et de Foster, impédance
   thermique transitoire ; cycles thermiques d'un onduleur ; dimensionnement
   du dissipateur et de la ventilation du variateur de la pompe du projet
   fil rouge.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = 2 * Math.PI;

/* Modèle de Foster jonction-dissipateur supposé pour l'IGBT de la pompe. */
const FOSTER = { r: [0.018, 0.052, 0.11, 0.12], tau: [0.0008, 0.008, 0.06, 0.4] };
const RJH_IGBT = 0.3;
const RJH_DIODE = 0.5;
/* Pertes nominales de l'onduleur (cours MOSFET et IGBT) : 43,236 W par IGBT, 8,362 W par diode. */
const P_IGBT_NOM = 43.236;
const P_DIODE_NOM = 8.362;
const P_OND_NOM = 6 * (P_IGBT_NOM + P_DIODE_NOM);
const P_OND_SERVICE = 213.851;
const K_IGBT = P_IGBT_NOM / P_OND_NOM;
const K_DIODE = P_DIODE_NOM / P_OND_NOM;

/* --------------------------------------------------------------------------
   Modèles physiques
   -------------------------------------------------------------------------- */

/** Impédance thermique de Foster : somme des r_i (1 - exp(-t/τ_i)). */
function zFoster(t, modele = FOSTER) {
  let z = 0;
  for (let i = 0; i < modele.r.length; i += 1) z += modele.r[i] * (1 - Math.exp(-t / modele.tau[i]));
  return z;
}

/**
 * Réponse indicielle d'un réseau de Cauer à trois nœuds (jonction, boîtier,
 * dissipateur) pour un flux de 1 W, par Euler implicite sur une grille de
 * temps géométrique. Renvoie { t: [], j: [], c: [], h: [] } en kelvins par watt.
 */
function cauerIndicielle(R, C, tMax = 2e5) {
  const g1 = 1 / R[0];
  const g2 = 1 / R[1];
  const g3 = 1 / R[2];
  let th = [0, 0, 0];
  let t = 0;
  let h = 1e-6;
  const res = { t: [0], j: [0], c: [0], h: [0] };
  while (t < tMax) {
    const b0 = C[0] / h + g1;
    const b1 = C[1] / h + g1 + g2;
    const b2 = C[2] / h + g2 + g3;
    const d0 = (C[0] / h) * th[0] + 1;
    const d1 = (C[1] / h) * th[1];
    const d2 = (C[2] / h) * th[2];
    /* Système tridiagonal : sous-diagonale et sur-diagonale -g1, -g2. */
    const c0 = -g1 / b0;
    const e0 = d0 / b0;
    const m1 = b1 + g1 * c0;
    const c1 = -g2 / m1;
    const e1 = (d1 + g1 * e0) / m1;
    const m2 = b2 + g2 * c1;
    const x2 = (d2 + g2 * e1) / m2;
    const x1 = e1 - c1 * x2;
    const x0 = e0 - c0 * x1;
    th = [x0, x1, x2];
    t += h;
    res.t.push(t);
    res.j.push(x0);
    res.c.push(x1);
    res.h.push(x2);
    h = Math.max(1e-6, t * 0.01);
  }
  return res;
}

/** Valeur interpolée de la réponse indicielle à l'instant t (recherche dichotomique). */
function lireIndicielle(rep, t) {
  if (t <= 0) return { j: 0, c: 0, h: 0 };
  const T = rep.t;
  if (t >= T[T.length - 1]) {
    const n = T.length - 1;
    return { j: rep.j[n], c: rep.c[n], h: rep.h[n] };
  }
  let bas = 0;
  let haut = T.length - 1;
  while (haut - bas > 1) {
    const milieu = (bas + haut) >> 1;
    if (T[milieu] <= t) bas = milieu;
    else haut = milieu;
  }
  const w = (t - T[bas]) / (T[haut] - T[bas]);
  return {
    j: rep.j[bas] + w * (rep.j[haut] - rep.j[bas]),
    c: rep.c[bas] + w * (rep.c[haut] - rep.c[bas]),
    h: rep.h[bas] + w * (rep.h[haut] - rep.h[bas]),
  };
}

/** Élévations de température pour un échelon ou une impulsion de durée tp, par superposition. */
function reponseCauer(rep, t, P, impulsion, tp) {
  const a = lireIndicielle(rep, t);
  if (!impulsion || t <= tp) return { j: P * a.j, c: P * a.c, h: P * a.h };
  const b = lireIndicielle(rep, t - tp);
  return { j: P * (a.j - b.j), c: P * (a.c - b.c), h: P * (a.h - b.h) };
}

/**
 * Pertes instantanées d'un IGBT d'onduleur, moyennées sur une période de
 * découpage, à l'angle ψ du courant de phase i = Î sin ψ (modèle du cours
 * MOSFET et IGBT, paramètres à 125 °C).
 */
function pertesIGBT(psi, Ieff, m, cphi, V = 540, fd = 4000) {
  const I = Math.SQRT2 * Ieff;
  const i = I * Math.sin(psi);
  if (i <= 0) return 0;
  const phi = Math.acos(Math.min(1, Math.max(-1, cphi)));
  const d = 0.5 * (1 + m * Math.sin(psi + phi));
  return d * (0.85 * i + 0.011 * i * i) + fd * 15.5e-3 * (V / 600) * (i / 100);
}

/** Régime périodique établi de la jonction d'un IGBT (modèle de Foster), sur une période de sortie. */
function cyclesIGBT(fo, Ieff, cphi) {
  const N = 360;
  const m = Math.min(1, Math.max(0.03, fo / 50));
  const T = 1 / fo;
  const dt = T / N;
  const p = [];
  let pm = 0;
  for (let k = 0; k < N; k += 1) {
    const v = pertesIGBT((TAU * (k + 0.5)) / N, Ieff, m, cphi);
    p.push(v);
    pm += v / N;
  }
  const a = FOSTER.tau.map((tau) => Math.exp(-dt / tau));
  const th = FOSTER.r.map((r) => r * pm);
  const periodes = Math.ceil(5 * Math.max(...FOSTER.tau) * fo) + 2;
  let theta = [];
  for (let n = 0; n < periodes; n += 1) {
    theta = [];
    for (let k = 0; k < N; k += 1) {
      let s = 0;
      for (let i = 0; i < th.length; i += 1) {
        th[i] = th[i] * a[i] + FOSTER.r[i] * p[k] * (1 - a[i]);
        s += th[i];
      }
      theta.push(s);
    }
  }
  const max = Math.max(...theta);
  const min = Math.min(...theta);
  return { m, p, pm, theta, max, min, moy: pm * RJH_IGBT, ondulation: max - min, N };
}

/** Loi de cyclage supposée : N_f = 2e6 (40 / ΔT)^5. */
function cyclesAvantDefaillance(dT) {
  return dT > 0.01 ? 2e6 * Math.pow(40 / dT, 5) : Infinity;
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

/** Petit escalier de températures annoté, pour les corrections. */
function dessinEscalier(id, niveaux, tMin, tMax, limite) {
  const H = 220;
  const y = (T) => 190 - ((T - tMin) / (tMax - tMin)) * 170;
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.3"><path d="M60 196V14M60 196H560"/></g>';
  if (limite != null) s += TRAITS + ' stroke-width="1.2" stroke-dasharray="10 6"><path d="M60 ' + y(limite).toFixed(1) + 'H560"/></g>';
  let d = "";
  niveaux.forEach((n, k) => {
    const x0 = 80 + k * 120;
    const yy = y(n.T).toFixed(1);
    d += (k === 0 ? "M" + x0 + " " + yy : "V" + yy) + "H" + (x0 + 100);
  });
  s += TRAITS + ' stroke-width="3"><path d="' + d + '"/></g>' + ECRITS.replace('font-size="12"', 'font-size="11"');
  niveaux.forEach((n, k) => {
    s += texte(84 + k * 120, y(n.T) - 8, n.nom + " " + n.lib);
  });
  s += texte(10, y(tMin) + 4, String(tMin)) + texte(10, y(tMax) + 4, String(tMax)) + texte(10, 12, "°C");
  if (limite != null) s += texte(470, y(limite) - 6, "limite " + limite);
  s += "</g>";
  return { viewBox: "0 0 580 " + H, dessin: s };
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

/** Durée lisible : microsecondes, millisecondes, secondes ou minutes. */
function duree(api, t) {
  if (t < 1e-3) return nb(api, t * 1e6, 0) + " µs";
  if (t < 1) return nb(api, t * 1e3, t < 0.01 ? 2 : 1) + " ms";
  if (t < 120) return nb(api, t, t < 10 ? 2 : 1) + " s";
  if (t < 7200) return nb(api, t / 60, 1) + " min";
  return nb(api, t / 3600, 1) + " h";
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
  construireEscalier(racine, api);
  construireTransitoire(racine, api);
  construireCycles(racine, api);
  construireZth(racine, api);
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
    ["#d-coupe-figure svg", 1.6],
    ["#e-conduction-figure svg", 1.2],
    ["#e-commun-figure svg", 1.4],
    ["#e-reseaux-figure svg", 1.6],
    ["#f-schema-principal svg", 1.8],
    ["#h-figure svg", 1.3],
    ["#i-figure svg", 1.5],
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
      id: "c1-chaine",
      titre: "Température d'un composant",
      niveau: "fondamental",
      enonce: "<p>Un composant dissipe $20\\ \\mathrm{W}$. La résistance thermique totale entre sa jonction et l'air vaut $1{,}5\\ \\mathrm{K/W}$ et l'air est à $30\\ ^\\circ\\mathrm{C}$. Quelle est la température de la jonction, en degrés Celsius ?</p>",
      valeur: 60,
      unite: "°C",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Température de jonction",
      etapes: [
        { texte: "Écart de température : $\\Delta T = R_{th}P = 1{,}5 \\times 20 = 30\\ \\mathrm{K}$." },
        { texte: "$T_j = T_a + \\Delta T = 30 + 30 = 60\\ ^\\circ\\mathrm{C}$.", note: "C'est la loi d'Ohm transposée : la température joue le rôle du potentiel, la puissance celui du courant." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = dessinEscalier("fl-c1", [{ nom: "air", T: 30, lib: "30" }, { nom: "jonction", T: 60, lib: "60" }], 20, 80, null);
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, "Une seule marche : 1,5 K/W traversés par 20 W, soit 30 K au-dessus de l'air.");
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-capacite",
      titre: "Échauffement d'un bloc d'aluminium",
      niveau: "fondamental",
      enonce: "<p>Un bloc d'aluminium de $0{,}5\\ \\mathrm{kg}$, de capacité thermique massique $900\\ \\mathrm{J/(kg\\,K)}$, reçoit $50\\ \\mathrm{W}$ pendant $60\\ \\mathrm{s}$ sans rien céder à l'air. De combien de kelvins s'échauffe-t-il ?</p>",
      valeur: (50 * 60) / (0.5 * 900),
      unite: "K",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Échauffement",
      etapes: [
        { texte: "Énergie reçue : $W = Pt = 50 \\times 60 = 3000\\ \\mathrm{J}$." },
        { texte: "Capacité thermique : $C_{th} = mc = 0{,}5 \\times 900 = 450\\ \\mathrm{J/K}$." },
        { texte: "$\\Delta T = W/C_{th} = 3000/450 = 6{,}67\\ \\mathrm{K}$.", note: "Sans pertes vers l'air, la température monte linéairement : c'est le début de toute courbe d'échauffement, quand la capacité absorbe tout le flux." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Échauffement d'un bloc de 450 J/K sous 50 W, sans pertes",
          xTitre: "temps", xUnite: "s", yTitre: "échauffement", yUnite: "K",
          xMin: 0, xMax: 90, yMin: 0, yMax: 11,
          series: [{ id: "T", nom: "ΔT = P t / C", couleur: "serie-1", epaisseur: 2.4, fonction: (t) => (50 * t) / 450 }],
          surDessin({ c, repere: r, couleurs }) {
            pointRepere(c, r, couleurs, 60, 6.667, "6,67 K à 60 s");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c3-pertes",
      titre: "Pertes de conduction d'une diode",
      niveau: "fondamental",
      enonce: "<p>Une diode modélisée par $V_{F0} = 0{,}9\\ \\mathrm{V}$ et $r_F = 10\\ \\mathrm{m\\Omega}$ conduit un courant de valeur moyenne $10\\ \\mathrm{A}$ et de valeur efficace $15\\ \\mathrm{A}$. Quelles sont ses pertes de conduction, en watts ?</p>",
      valeur: 0.9 * 10 + 0.01 * 15 * 15,
      unite: "W",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Pertes",
      etapes: [
        { texte: "Le seuil travaille avec la valeur moyenne : $V_{F0}I_{moy} = 0{,}9 \\times 10 = 9\\ \\mathrm{W}$." },
        { texte: "La résistance travaille avec la valeur efficace : $r_FI_{eff}^2 = 0{,}01 \\times 15^2 = 2{,}25\\ \\mathrm{W}$." },
        { texte: "Total : $11{,}25\\ \\mathrm{W}$.", note: "Ces watts sont le point de départ de tout calcul thermique : une erreur sur les pertes se retrouve entière dans la température." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["seuil : V_F0 × I_moy = 0,9 × 10 = 9 W", "résistance : r_F × I_eff² = 0,01 × 225 = 2,25 W", "pertes de conduction : 11,25 W"], "Pertes de conduction : moyenne pour le seuil, valeur efficace pour la résistance.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Escalier des températures et flux de chaleur animé
   -------------------------------------------------------------------------- */

function construireEscalier(racine, api) {
  const conteneur = racine.querySelector("#d-escalier-vivant");
  if (!conteneur) return;
  const etat = { P: 43.2, Rjc: 0.22, Rch: 0.08, Rha: 1.0, Ta: 40, phase: 0 };

  const svg = svgEl("svg", {
    viewBox: "0 0 780 340",
    "aria-label": "Chaîne thermique d'un composant : jonction, boîtier, dissipateur et air reliés par trois résistances, flux de chaleur animé ; escalier des températures avec les limites de 125 et 150 °C",
  });
  /* Chaîne à gauche : quatre nœuds empilés, trois résistances. */
  const NOEUDS = [
    { id: "j", nom: "jonction j", y: 20 },
    { id: "c", nom: "boîtier c", y: 100 },
    { id: "h", nom: "dissipateur h", y: 180 },
    { id: "a", nom: "air ambiant a", y: 260 },
  ];
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" });
  let f = "";
  for (const n of NOEUDS) f += '<rect x="40" y="' + n.y + '" width="170" height="40" rx="8"/>';
  f += '<path d="M125 60V72M125 108V100M125 140V152M125 188V180M125 220V232M125 268V260"/>';
  f += '<rect x="113" y="72" width="24" height="36"/><rect x="113" y="152" width="24" height="36"/><rect x="113" y="232" width="24" height="36"/>';
  /* Repère de l'escalier à droite. */
  f += '<path d="M330 20V300H760" stroke-width="1.4"/>';
  for (let T = 20; T <= 180; T += 20) {
    const y = 300 - ((T - 20) / 160) * 280;
    f += '<path d="M326 ' + y.toFixed(1) + 'H334" stroke-width="1.2"/>';
  }
  fond.innerHTML = f;
  svg.appendChild(fond);

  const ecritsFixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "12" });
  let e = "";
  for (const n of NOEUDS) e += texte(52, n.y + 25, n.nom);
  for (let T = 20; T <= 180; T += 40) e += texte(292, 300 - ((T - 20) / 160) * 280 + 4, String(T), ' font-size="11"');
  e += texte(292, 14, "°C", ' font-size="11"') + texte(380, 330, "jonction", ' font-size="11"') + texte(490, 330, "boîtier", ' font-size="11"') +
    texte(590, 330, "dissipateur", ' font-size="11"') + texte(700, 330, "air", ' font-size="11"');
  ecritsFixes.innerHTML = e;
  svg.appendChild(ecritsFixes);

  const libR = [0, 1, 2].map((k) => {
    const t = svgEl("text", { x: 146, y: 94 + k * 80, fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "11" });
    svg.appendChild(t);
    return t;
  });
  const yT = (T) => 300 - ((Math.min(185, Math.max(15, T)) - 20) / 160) * 280;
  const limites = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.2" });
  const lim125 = svgEl("path", { "stroke-dasharray": "10 6" });
  const lim150 = svgEl("path", { "stroke-dasharray": "2 4" });
  limites.append(lim125, lim150);
  svg.appendChild(limites);
  const escalier = svgEl("path", { fill: "none", "stroke-width": "3.2", "stroke-linejoin": "round", style: "stroke: var(--serie-1)" });
  svg.appendChild(escalier);
  const libellesT = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11.5" });
  svg.appendChild(libellesT);
  const libLim = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "10.5" });
  svg.appendChild(libLim);
  const points = svgEl("g", { stroke: "none", style: "fill: var(--serie-2)" });
  const particules = [];
  for (let k = 0; k < 9; k += 1) {
    const p = svgEl("circle", { r: 3.8, cx: 125, cy: 60 });
    points.appendChild(p);
    particules.push(p);
  }
  svg.appendChild(points);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-escalier-valeurs", [
    { id: "Tj", libelle: "Température de jonction T_j", unite: "°C", decimales: 1 },
    { id: "Tc", libelle: "Température de boîtier T_c", unite: "°C", decimales: 1 },
    { id: "Th", libelle: "Température du dissipateur T_h", unite: "°C", decimales: 1 },
    { id: "marches", libelle: "Marches jonction-boîtier, boîtier-dissipateur, dissipateur-air", format: (v) => v },
    { id: "marge", libelle: "Marge sous la limite de conception de 125 °C", unite: "K", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const { P, Rjc, Rch, Rha, Ta } = etat;
    const Th = Ta + P * Rha;
    const Tc = Th + P * Rch;
    const Tj = Tc + P * Rjc;
    const niveaux = [Tj, Tc, Th, Ta];
    let d = "";
    let l = "";
    niveaux.forEach((T, k) => {
      const x0 = 350 + k * 105;
      const y = yT(T).toFixed(1);
      d += (k === 0 ? "M" + x0 + " " + y : "V" + y) + "H" + (x0 + 95);
      l += texte(x0 + 4, yT(T) - 7, nb(api, T, 1));
    });
    escalier.setAttribute("d", d);
    libellesT.innerHTML = l;
    lim125.setAttribute("d", "M330 " + yT(125).toFixed(1) + "H760");
    lim150.setAttribute("d", "M330 " + yT(150).toFixed(1) + "H760");
    libLim.innerHTML = texte(764 - 112, yT(125) + 14, "125 conception") + texte(764 - 112, yT(150) + 14, "150 catalogue");
    libR[0].textContent = "R_jc = " + nb(api, Rjc, 2) + " K/W";
    libR[1].textContent = "R_ch = " + nb(api, Rch, 2) + " K/W";
    libR[2].textContent = "R_ha = " + nb(api, Rha, 2) + " K/W";
    if (valeurs) {
      valeurs.maj({
        Tj,
        Tc,
        Th,
        marches: nb(api, P * Rjc, 1) + " ; " + nb(api, P * Rch, 1) + " ; " + nb(api, P * Rha, 1) + " K",
        marge: 125 - Tj,
      });
    }
    placerParticules();
  }

  function placerParticules() {
    particules.forEach((p, k) => {
      const u = (etat.phase + k / particules.length) % 1;
      p.setAttribute("cy", (60 + u * 200).toFixed(1));
      p.setAttribute("opacity", etat.P > 0.5 ? "1" : "0");
    });
  }

  const curseurs = api.sim.curseurs(
    "#d-escalier-curseurs",
    [
      { id: "P", libelle: "Puissance dissipée P", min: 0, max: 120, pas: 0.1, valeur: etat.P, unite: "W" },
      { id: "Rjc", libelle: "Résistance jonction-boîtier R_jc", min: 0.05, max: 1, pas: 0.01, valeur: etat.Rjc, unite: "K/W" },
      { id: "Rch", libelle: "Résistance boîtier-dissipateur R_ch", min: 0.02, max: 0.8, pas: 0.01, valeur: etat.Rch, unite: "K/W" },
      { id: "Rha", libelle: "Résistance dissipateur-air R_ha", min: 0.1, max: 2, pas: 0.05, valeur: etat.Rha, unite: "K/W" },
      { id: "Ta", libelle: "Température de l'air T_a", min: 20, max: 55, pas: 1, valeur: etat.Ta, unite: "°C" },
    ],
    (lues) => {
      Object.assign(etat, { P: lues.P, Rjc: lues.Rjc, Rch: lues.Rch, Rha: lues.Rha, Ta: lues.Ta });
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  boucleAnimation(api, conteneur, (ecoule) => {
    etat.phase = (etat.phase + ecoule * (0.02 + etat.P / 160)) % 1;
    placerParticules();
  });

  ressources.push(api.dessiner(fond, { declencheur: conteneur, duree: 1.2 }));
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Régime transitoire d'un réseau de Cauer
   -------------------------------------------------------------------------- */

function construireTransitoire(racine, api) {
  if (!racine.querySelector("#e-transitoire-trace")) return;
  const TA = 40;
  const reglages = { P: 43.2, Rha: 1.0, masse: 0.5, mode: 0, ltp: -2 };
  let rep = null;
  let lt = 0;

  const conteneur = racine.querySelector("#e-transitoire-vivant");
  let colonnes = null;
  let libCol = null;
  if (conteneur) {
    const svg = svgEl("svg", { viewBox: "0 0 640 222", "aria-label": "Trois colonnes dont la hauteur suit l'élévation de température de la jonction, du boîtier et du dissipateur à l'instant du lecteur" });
    const base = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.6" });
    base.innerHTML = '<path d="M40 170H600"/><rect x="110" y="20" width="70" height="150" rx="4" stroke-dasharray="3 4" stroke-width="1"/><rect x="285" y="20" width="70" height="150" rx="4" stroke-dasharray="3 4" stroke-width="1"/><rect x="460" y="20" width="70" height="150" rx="4" stroke-dasharray="3 4" stroke-width="1"/>';
    svg.appendChild(base);
    colonnes = [110, 285, 460].map((x) => {
      const r = svgEl("rect", { x: x + 6, y: 170, width: 58, height: 0, rx: 3, style: "fill: var(--serie-1); opacity: 0.85" });
      svg.appendChild(r);
      return r;
    });
    const ecr = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "12" });
    ecr.innerHTML = texte(112, 192, "jonction") + texte(290, 192, "boîtier") + texte(452, 192, "dissipateur") + texte(40, 216, "hauteur pleine : élévation finale de la jonction", ' font-size="10.5"');
    svg.appendChild(ecr);
    libCol = [110, 285, 460].map((x) => {
      const t = svgEl("text", { x: x + 4, y: 16, fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "11.5" });
      svg.appendChild(t);
      return t;
    });
    conteneur.appendChild(svg);
    ressources.push(api.dessiner(base, { declencheur: conteneur, duree: 1 }));
  }

  const trace = api.sim.traceur("#e-transitoire-trace", {
    titre: "Températures après l'application de la puissance",
    xTitre: "log10 du temps en s", xUnite: "", yTitre: "température", yUnite: "°C",
    xMin: -4, xMax: 4, yMin: TA, yMax: 110,
    ratio: 0.46,
    series: [
      { id: "j", nom: "jonction T_j", couleur: "serie-1", epaisseur: 2.8 },
      { id: "c", nom: "boîtier T_c", couleur: "serie-3", epaisseur: 2 },
      { id: "h", nom: "dissipateur T_h", couleur: "serie-5", epaisseur: 2 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, lt, "");
      if (reglages.mode === 1 && reglages.ltp > -4 && reglages.ltp < 4) ligneV(c, r, couleurs, reglages.ltp, "fin de l'impulsion", [8, 4]);
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-transitoire-valeurs", [
    { id: "t", libelle: "Instant", format: (v) => v },
    { id: "Tj", libelle: "Jonction T_j", unite: "°C", decimales: 1 },
    { id: "Tc", libelle: "Boîtier T_c", unite: "°C", decimales: 1 },
    { id: "Th", libelle: "Dissipateur T_h", unite: "°C", decimales: 1 },
    { id: "Z", libelle: "Impédance Z_th(t) de la jonction à l'air", unite: "K/W", decimales: 4 },
    { id: "tau", libelle: "Constante R_ha C_h du dissipateur", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function calculer() {
    const Ch = reglages.masse * 900;
    rep = cauerIndicielle([0.22, 0.08, reglages.Rha], [0.3, 20, Ch]);
  }

  function majInstant(v) {
    lt = v;
    const t = Math.pow(10, v);
    const imp = reglages.mode === 1;
    const tp = Math.pow(10, reglages.ltp);
    const r = reponseCauer(rep, t, reglages.P, imp, tp);
    const fin = reglages.P * (0.3 + reglages.Rha);
    if (colonnes) {
      [r.j, r.c, r.h].forEach((dT, k) => {
        const hgt = Math.max(0, Math.min(150, (dT / fin) * 150));
        colonnes[k].setAttribute("y", (170 - hgt).toFixed(1));
        colonnes[k].setAttribute("height", hgt.toFixed(1));
        libCol[k].textContent = "+" + nb(api, dT, 1) + " K";
      });
    }
    if (valeurs) {
      valeurs.maj({
        t: duree(api, t),
        Tj: TA + r.j,
        Tc: TA + r.c,
        Th: TA + r.h,
        Z: lireIndicielle(rep, t).j,
        tau: duree(api, reglages.Rha * reglages.masse * 900),
      });
    }
    if (trace) trace.rafraichir();
  }

  function maj() {
    calculer();
    const imp = reglages.mode === 1;
    const tp = Math.pow(10, reglages.ltp);
    const pts = { j: [], c: [], h: [] };
    let max = TA + 5;
    for (let k = 0; k <= 320; k += 1) {
      const u = -4 + (8 * k) / 320;
      const r = reponseCauer(rep, Math.pow(10, u), reglages.P, imp, tp);
      pts.j.push([u, TA + r.j]);
      pts.c.push([u, TA + r.c]);
      pts.h.push([u, TA + r.h]);
      max = Math.max(max, TA + r.j);
    }
    if (trace) {
      trace.definirPlage({ yMin: TA, yMax: Math.ceil((max + 0.08 * (max - TA)) / 5) * 5 });
      trace.definirDonnees("j", pts.j);
      trace.definirDonnees("c", pts.c);
      trace.definirDonnees("h", pts.h);
      const crete = imp ? reglages.P * lireIndicielle(rep, tp).j : null;
      trace.definirMesures([
        { nom: "Élévation finale de la jonction P (R_jh + R_ha)", valeur: nb(api, reglages.P * (0.3 + reglages.Rha), 1) + " K" },
        { nom: "Z_th à 10 ms et à 1 s", valeur: nb(api, lireIndicielle(rep, 0.01).j, 4) + " ; " + nb(api, lireIndicielle(rep, 1).j, 4) + " K/W" },
        { nom: imp ? "Crête de l'impulsion P Z_th(t_p)" : "Mode", valeur: imp ? nb(api, crete, 1) + " K en " + duree(api, tp) : "échelon de puissance" },
      ]);
    }
    majInstant(lt);
  }

  const curseurs = api.sim.curseurs(
    "#e-transitoire-curseurs",
    [
      { id: "P", libelle: "Puissance appliquée P", min: 5, max: 400, pas: 0.1, valeur: reglages.P, unite: "W" },
      { id: "Rha", libelle: "Résistance dissipateur-air R_ha", min: 0.2, max: 3, pas: 0.05, valeur: reglages.Rha, unite: "K/W" },
      { id: "masse", libelle: "Masse d'aluminium du dissipateur", min: 0.1, max: 4, pas: 0.1, valeur: reglages.masse, unite: "kg" },
      { id: "mode", libelle: "Forme de la puissance", min: 0, max: 1, pas: 1, valeur: reglages.mode, format: (x) => (Math.round(x) ? "impulsion" : "échelon") },
      { id: "ltp", libelle: "Durée de l'impulsion t_p", min: -3, max: 3, pas: 0.1, valeur: reglages.ltp, format: (x) => duree(api, Math.pow(10, x)) },
    ],
    (lues) => {
      reglages.P = lues.P;
      reglages.Rha = lues.Rha;
      reglages.masse = lues.masse;
      reglages.mode = Math.round(lues.mode);
      reglages.ltp = lues.ltp;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-transitoire-lecteur", {
    de: -4,
    a: 4,
    duree: 12,
    boucle: false,
    auto: false,
    libelle: "Temps écoulé, de 0,1 ms à 3 h, en échelle logarithmique",
    rappel: (v) => majInstant(v),
  });
  if (lecteur) ressources.push(lecteur);
  lt = -4;
  maj();
}

/* --------------------------------------------------------------------------
   E. Cycles thermiques à la fréquence de sortie
   -------------------------------------------------------------------------- */

function construireCycles(racine, api) {
  if (!racine.querySelector("#e-cycles-trace")) return;
  const reglages = { fo: 50, I: 52.6, cphi: 0.86, Th: 95 };
  let res = cyclesIGBT(reglages.fo, reglages.I, reglages.cphi);
  let angle = 0;

  function valeurA(tableau, a) {
    const k = Math.min(tableau.length - 1, Math.max(0, Math.floor((a / 360) * tableau.length)));
    return tableau[k];
  }

  const puissance = api.sim.traceur("#e-cycles-puissance", {
    titre: "Pertes instantanées de l'IGBT sur une période de sortie",
    xTitre: "angle électrique du courant", xUnite: "°", yTitre: "pertes", yUnite: "W",
    xMin: 0, xMax: 360, yMin: 0, yMax: 160,
    ratio: 0.3,
    series: [{ id: "p", nom: "pertes p(ψ)", couleur: "serie-2", epaisseur: 2.4 }],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, res.pm, "moyenne");
      ligneV(c, r, couleurs, angle, "");
      pointRepere(c, r, couleurs, angle, valeurA(res.p, angle), "");
    },
  });
  if (puissance) ressources.push(puissance);

  const trace = api.sim.traceur("#e-cycles-trace", {
    titre: "Température de jonction en régime établi",
    xTitre: "angle électrique du courant", xUnite: "°", yTitre: "T_j", yUnite: "°C",
    xMin: 0, xMax: 360, yMin: 90, yMax: 130,
    ratio: 0.34,
    series: [{ id: "T", nom: "jonction T_j", couleur: "serie-1", epaisseur: 2.8 }],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, reglages.Th + res.moy, "moyenne");
      ligneH(c, r, couleurs, reglages.Th + res.max, "crête");
      ligneV(c, r, couleurs, angle, "");
      pointRepere(c, r, couleurs, angle, reglages.Th + valeurA(res.theta, angle), "");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-cycles-valeurs", [
    { id: "a", libelle: "Angle électrique", unite: "°", decimales: 0 },
    { id: "p", libelle: "Pertes instantanées", unite: "W", decimales: 1 },
    { id: "T", libelle: "Température de jonction", unite: "°C", decimales: 1 },
    { id: "m", libelle: "Indice de modulation m = f / 50", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function majAngle(a) {
    angle = a;
    if (valeurs) valeurs.maj({ a, p: valeurA(res.p, a), T: reglages.Th + valeurA(res.theta, a), m: res.m });
    if (puissance) puissance.rafraichir();
    if (trace) trace.rafraichir();
  }

  function maj() {
    res = cyclesIGBT(reglages.fo, reglages.I, reglages.cphi);
    const pts = res.p.map((v, k) => [((k + 0.5) * 360) / res.N, v]);
    const ths = res.theta.map((v, k) => [((k + 0.5) * 360) / res.N, reglages.Th + v]);
    const pmax = Math.max(...res.p);
    if (puissance) {
      puissance.definirPlage({ yMin: 0, yMax: Math.max(20, Math.ceil((pmax * 1.15) / 10) * 10) });
      puissance.definirDonnees("p", pts);
    }
    if (trace) {
      const bas = Math.floor((reglages.Th + res.min - 2) / 5) * 5;
      const haut = Math.ceil((reglages.Th + res.max + 3) / 5) * 5;
      trace.definirPlage({ yMin: bas, yMax: haut });
      trace.definirDonnees("T", ths);
      const Nf = cyclesAvantDefaillance(res.ondulation);
      trace.definirMesures([
        { nom: "Pertes moyennes de l'IGBT", valeur: nb(api, res.pm, 1) + " W" },
        { nom: "Jonction moyenne et crête", valeur: nb(api, reglages.Th + res.moy, 1) + " ; " + nb(api, reglages.Th + res.max, 1) + " °C" },
        { nom: "Ondulation ΔT_j sur une période", valeur: nb(api, res.ondulation, 2) + " K" },
        { nom: "Cycles avant défaillance, loi supposée", valeur: Number.isFinite(Nf) ? Nf.toExponential(2).replace(".", ",") : "illimité" },
        { nom: "Durée correspondante à cette fréquence", valeur: Number.isFinite(Nf) ? duree(api, Nf / reglages.fo) : "illimitée" },
      ]);
    }
    majAngle(angle);
  }

  const curseurs = api.sim.curseurs(
    "#e-cycles-curseurs",
    [
      { id: "fo", libelle: "Fréquence de sortie", min: 0.5, max: 50, pas: 0.5, valeur: reglages.fo, unite: "Hz" },
      { id: "I", libelle: "Courant de phase efficace", min: 5, max: 80, pas: 0.1, valeur: reglages.I, unite: "A" },
      { id: "cphi", libelle: "Facteur de déplacement cos φ", min: 0.5, max: 1, pas: 0.01, valeur: reglages.cphi },
      { id: "Th", libelle: "Température du dissipateur", min: 40, max: 110, pas: 1, valeur: reglages.Th, unite: "°C" },
    ],
    (lues) => {
      reglages.fo = lues.fo;
      reglages.I = lues.I;
      reglages.cphi = lues.cphi;
      reglages.Th = lues.Th;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-cycles-lecteur", {
    de: 0,
    a: 360,
    duree: 6,
    boucle: true,
    auto: false,
    libelle: "Parcours d'une période de la fréquence de sortie",
    rappel: (a) => majAngle(a),
  });
  if (lecteur) ressources.push(lecteur);
  maj();
}

/* --------------------------------------------------------------------------
   F. Courbe d'impédance thermique de l'IGBT
   -------------------------------------------------------------------------- */

function construireZth(racine, api) {
  if (!racine.querySelector("#f-zth-trace")) return;
  const trace = api.sim.traceur("#f-zth-trace", {
    genre: "Tracé",
    titre: "Impédance thermique jonction-dissipateur de l'IGBT",
    xTitre: "log10 du temps en s", xUnite: "", yTitre: "Z_th", yUnite: "K/W",
    xMin: -4, xMax: 1, yMin: 0, yMax: 0.34,
    ratio: 0.42,
    series: [{ id: "z", nom: "Z_th,jh(t), modèle de Foster", couleur: "serie-1", epaisseur: 2.8, fonction: (u) => zFoster(Math.pow(10, u)) }],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 0.3, "R_th,jh");
      pointRepere(c, r, couleurs, -3, zFoster(1e-3), "0,021 à 1 ms");
      pointRepere(c, r, couleurs, -2, zFoster(1e-2), "0,075 à 10 ms");
      pointRepere(c, r, couleurs, -1, zFoster(0.1), "0,186 à 0,1 s");
      pointRepere(c, r, couleurs, 0, zFoster(1), "0,290 à 1 s");
    },
  });
  if (trace) ressources.push(trace);
}

/* --------------------------------------------------------------------------
   H. Carte de conception du dissipateur, point déplaçable
   -------------------------------------------------------------------------- */

function construireCarte(racine, api) {
  const conteneur = racine.querySelector("#h-carte-vivant");
  if (!conteneur) return;
  const B = { x: 80, y: 20, l: 610, h: 340 };
  const xP = (P) => B.x + (P / 600) * B.l;
  const yR = (R) => B.y + B.h - (R / 0.6) * B.h;
  const Pde = (x) => ((x - B.x) / B.l) * 600;
  const Rde = (y) => ((B.y + B.h - y) / B.h) * 0.6;
  const etat = { P: P_OND_NOM, R: 0.2, Ta: 40 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 420",
    "aria-label": "Carte de conception : pertes totales en abscisse, résistance du dissipateur en ordonnée, frontières pour une jonction à 125 et 150 °C, zone valable hachurée, point de fonctionnement déplaçable",
  });
  const defs = svgEl("defs");
  defs.innerHTML =
    '<pattern id="hach-carte" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)"><path d="M0 0V10" stroke="currentColor" stroke-width="1.2" opacity="0.35"/></pattern>';
  svg.appendChild(defs);
  const zone = svgEl("path", { fill: "url(#hach-carte)", stroke: "none" });
  svg.appendChild(zone);
  const axes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.4" });
  let a = '<path d="M' + B.x + " " + B.y + "V" + (B.y + B.h) + "H" + (B.x + B.l) + '"/>';
  for (let P = 0; P <= 600; P += 100) a += '<path d="M' + xP(P) + " " + (B.y + B.h) + "v5" + '"/>';
  for (let R = 0; R <= 0.6001; R += 0.1) a += '<path d="M' + B.x + " " + yR(R).toFixed(1) + "h-5" + '"/>';
  a += '<path d="M' + xP(P_OND_SERVICE).toFixed(1) + " " + B.y + "V" + (B.y + B.h) + '" stroke-width="0.9" opacity="0.7"/>';
  a += '<path d="M' + xP(P_OND_NOM).toFixed(1) + " " + B.y + "V" + (B.y + B.h) + '" stroke-width="0.9" opacity="0.7"/>';
  axes.innerHTML = a;
  svg.appendChild(axes);
  const ecr = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  let t = "";
  for (let P = 0; P <= 600; P += 100) t += texte(xP(P) - 10, B.y + B.h + 18, String(P));
  for (let k = 0; k <= 6; k += 1) t += texte(B.x - 36, yR(k / 10) + 4, "0," + k);
  t += texte(B.x + B.l - 150, B.y + B.h + 36, "pertes totales en W") + texte(8, 14, "R_ha en K/W");
  t += texte(xP(P_OND_SERVICE) + 4, B.y + 12, "service") + texte(xP(P_OND_NOM) + 4, B.y + 12, "nominal");
  ecr.innerHTML = t;
  svg.appendChild(ecr);
  const c125 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.6" });
  const c150 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-dasharray": "8 5" });
  svg.append(c125, c150);
  const libC = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.appendChild(libC);
  conteneur.appendChild(svg);

  function frontiere(Tlim, P) {
    return (Tlim - etat.Ta) / P - RJH_IGBT * K_IGBT;
  }

  function chemin(Tlim) {
    let d = "";
    let premier = true;
    for (let P = 20; P <= 600; P += 4) {
      const R = frontiere(Tlim, P);
      if (R > 0.6 || R < 0) continue;
      d += (premier ? "M" : "L") + xP(P).toFixed(1) + " " + yR(R).toFixed(1);
      premier = false;
    }
    return d;
  }

  const valeurs = api.sim.valeurs("#h-carte-valeurs", [
    { id: "P", libelle: "Pertes totales de l'onduleur", unite: "W", decimales: 1 },
    { id: "R", libelle: "Résistance du dissipateur R_ha", unite: "K/W", decimales: 3 },
    { id: "Th", libelle: "Température du dissipateur", unite: "°C", decimales: 1 },
    { id: "Tj", libelle: "Jonction de l'IGBT", unite: "°C", decimales: 1 },
    { id: "Td", libelle: "Jonction de la diode", unite: "°C", decimales: 1 },
    { id: "Rmax", libelle: "R_ha maximale à ces pertes pour 125 °C", unite: "K/W", decimales: 3 },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessinerCourbes() {
    const d125 = chemin(125);
    c125.setAttribute("d", d125);
    c150.setAttribute("d", chemin(150));
    let z = "";
    let premier = true;
    let dernierX = xP(20);
    let debutX = null;
    for (let P = 20; P <= 600; P += 4) {
      const R = Math.min(0.6, Math.max(0, frontiere(125, P)));
      if (debutX === null) debutX = xP(P);
      z += (premier ? "M" : "L") + xP(P).toFixed(1) + " " + yR(R).toFixed(1);
      premier = false;
      dernierX = xP(P);
    }
    z += "L" + dernierX.toFixed(1) + " " + yR(0).toFixed(1) + "L" + debutX.toFixed(1) + " " + yR(0).toFixed(1) + "Z";
    zone.setAttribute("d", z);
    const x125 = 560;
    const x150 = 520;
    libC.innerHTML =
      texte(x125, yR(Math.max(0, frontiere(125, Pde(x125)))) + 24, "T_j = 125 °C") +
      texte(x150, yR(Math.min(0.58, Math.max(0, frontiere(150, Pde(x150))))) - 10, "T_j = 150 °C");
  }

  function evaluer() {
    const { P, R, Ta } = etat;
    const Th = Ta + R * P;
    const Tj = Th + RJH_IGBT * K_IGBT * P;
    const Td = Th + RJH_DIODE * K_DIODE * P;
    const Rmax = frontiere(125, Math.max(P, 1));
    let verdict;
    if (Tj <= 125) verdict = "valable, marge " + nb(api, 125 - Tj, 1) + " K";
    else if (Tj <= 150) verdict = "sous le catalogue, mais sans marge de conception";
    else verdict = "jonction au-delà de 150 °C : refusé";
    if (valeurs) valeurs.maj({ P, R, Th, Tj, Td, Rmax: Math.max(0, Rmax), verdict });
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: B.x, y: B.y, largeur: B.l, hauteur: B.h },
    valeur: { x: xP(etat.P), y: yR(etat.R) },
    pas: 1,
    libelle: "Point de fonctionnement : pertes totales et résistance du dissipateur",
    rappel(mesure) {
      etat.P = Math.max(1, Pde(mesure.x));
      etat.R = Math.max(0, Rde(mesure.y));
      evaluer();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#h-carte-curseurs",
    [{ id: "Ta", libelle: "Température de l'air de l'armoire", min: 25, max: 55, pas: 1, valeur: etat.Ta, unite: "°C" }],
    (lues) => {
      etat.Ta = lues.Ta;
      dessinerCourbes();
      evaluer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  ressources.push(api.dessiner(axes, { declencheur: conteneur, duree: 1 }));
  dessinerCourbes();
  evaluer();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function dessinDiagnostic(id) {
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.8">';
  s += '<rect x="10" y="20" width="210" height="54" rx="8"/><rect x="250" y="20" width="210" height="54" rx="8"/><rect x="490" y="20" width="200" height="54" rx="8"/>';
  s += '<rect x="250" y="120" width="210" height="54" rx="8"/><rect x="490" y="120" width="200" height="54" rx="8"/>';
  s += fleche(220, 47, 250, 47, id) + fleche(460, 47, 490, 47, id) + fleche(355, 74, 355, 120, id) + fleche(590, 74, 590, 120, id) + "</g>";
  s += ECRITS.replace('font-size="12"', 'font-size="11"');
  s += texte(20, 42, "même charge, T_h - T_a") + texte(20, 60, "passé de 54,6 à 69,6 K");
  s += texte(260, 42, "R_ha = ΔT / ΣP :") + texte(260, 60, "0,120 → 0,153 K/W");
  s += texte(500, 42, "ailettes, filtres,") + texte(500, 60, "débit du ventilateur");
  s += texte(260, 142, "graisse sèche : T_j - T_h") + texte(260, 160, "monte, pas T_h - T_a");
  s += texte(500, 142, "nettoyer, mesurer le") + texte(500, 160, "débit, refaire l'essai");
  s += "</g>";
  return s;
}

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-chaine",
      titre: "Jonction d'un IGBT sur son dissipateur",
      niveau: "fondamental",
      enonce: "<p>Un IGBT dissipe $60\\ \\mathrm{W}$. $R_{jc} = 0{,}25\\ \\mathrm{K/W}$, $R_{ch} = 0{,}10\\ \\mathrm{K/W}$, $R_{ha} = 0{,}50\\ \\mathrm{K/W}$, air à $45\\ ^\\circ\\mathrm{C}$. Quelle est la température de sa jonction, en degrés Celsius ?</p>",
      valeur: 45 + 60 * 0.85,
      unite: "°C",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Température de jonction",
      etapes: [
        { texte: "Résistance totale : $0{,}25 + 0{,}10 + 0{,}50 = 0{,}85\\ \\mathrm{K/W}$." },
        { texte: "Marches : $15$, $6$ et $30\\ \\mathrm{K}$ ; $T_h = 75$, $T_c = 81$, $T_j = 96\\ ^\\circ\\mathrm{C}$." },
        { texte: "$T_j = 45 + 60 \\times 0{,}85 = 96\\ ^\\circ\\mathrm{C}$.", note: "Contrôle : la plus grande marche est celle du dissipateur, comme presque toujours pour un composant seul." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = dessinEscalier("fl-k1", [
          { nom: "air", T: 45, lib: "45" },
          { nom: "h", T: 75, lib: "75" },
          { nom: "c", T: 81, lib: "81" },
          { nom: "j", T: 96, lib: "96" },
        ], 40, 130, 125);
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, "Escalier de l'air à la jonction : 30 K pour le dissipateur, 6 K pour l'interface, 15 K pour le module.");
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-rha",
      titre: "Dissipateur d'un MOSFET en boîtier discret",
      niveau: "fondamental",
      enonce: "<p>Un MOSFET dissipe $25\\ \\mathrm{W}$. Sa documentation donne $R_{jc} = 0{,}5\\ \\mathrm{K/W}$ ; l'isolant silicone entre boîtier et dissipateur apporte $R_{ch} = 0{,}3\\ \\mathrm{K/W}$. L'air atteint $50\\ ^\\circ\\mathrm{C}$ et la limite de conception est $125\\ ^\\circ\\mathrm{C}$. Quelle résistance thermique maximale doit avoir le dissipateur, en $\\mathrm{K/W}$ ?</p>",
      valeur: (125 - 50) / 25 - 0.8,
      unite: "K/W",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "R_ha maximale",
      etapes: [
        { texte: "Écart disponible : $125 - 50 = 75\\ \\mathrm{K}$, soit $75/25 = 3\\ \\mathrm{K/W}$ au total." },
        { texte: "Résistance déjà consommée par le boîtier et l'isolant : $0{,}5 + 0{,}3 = 0{,}8\\ \\mathrm{K/W}$." },
        { texte: "$R_{ha} \\le 3 - 0{,}8 = 2{,}2\\ \\mathrm{K/W}$.", note: "L'isolant électrique coûte presque un tiers du budget restant : une pâte sur céramique ou un montage non isolé sur un dissipateur au potentiel du drain le réduirait." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["budget : (125 - 50) / 25 = 3,0 K/W", "R_jc + R_ch = 0,5 + 0,3 = 0,8 K/W", "R_ha ≤ 3,0 - 0,8 = 2,2 K/W"], "Budget de résistance thermique, de la limite de conception vers l'air.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-commun",
      titre: "Deux composants sur un même dissipateur",
      niveau: "intermédiaire",
      enonce: "<p>Un dissipateur porte un composant A de $40\\ \\mathrm{W}$ avec $R_{jh} = 0{,}4\\ \\mathrm{K/W}$ et un composant B de $20\\ \\mathrm{W}$ avec $R_{jh} = 1{,}0\\ \\mathrm{K/W}$. Air à $40\\ ^\\circ\\mathrm{C}$, limite de conception $125\\ ^\\circ\\mathrm{C}$ pour les deux. Quelle résistance thermique maximale doit avoir le dissipateur, en $\\mathrm{K/W}$ ?</p>",
      valeur: (105 - 40) / 60,
      unite: "K/W",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "R_ha maximale",
      etapes: [
        { texte: "Bornes de $T_h$ : A, $125 - 0{,}4 \\times 40 = 109\\ ^\\circ\\mathrm{C}$ ; B, $125 - 1{,}0 \\times 20 = 105\\ ^\\circ\\mathrm{C}$. B est limitant, bien qu'il dissipe deux fois moins." },
        { texte: "Flux dans le dissipateur : $40 + 20 = 60\\ \\mathrm{W}$." },
        { texte: "$R_{ha} \\le (105 - 40)/60 = 1{,}083\\ \\mathrm{K/W}$.", note: "Erreur classique : traiter A seul donnerait $(109 - 40)/40 = 1{,}73\\ \\mathrm{K/W}$, et la jonction de B atteindrait $40 + 1{,}73 \\times 60 + 20 = 164\\ ^\\circ\\mathrm{C}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Jonctions de A et B selon la résistance du dissipateur",
          xTitre: "R_ha", xUnite: "K/W", yTitre: "T_j", yUnite: "°C",
          xMin: 0.5, xMax: 1.8, yMin: 60, yMax: 170,
          series: [
            { id: "A", nom: "jonction de A", couleur: "serie-1", epaisseur: 2.4, fonction: (R) => 40 + 60 * R + 16 },
            { id: "B", nom: "jonction de B", couleur: "serie-3", epaisseur: 2.4, fonction: (R) => 40 + 60 * R + 20 },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 125, "limite 125 °C");
            pointRepere(c, r, couleurs, 65 / 60, 125, "B limitant : 1,083 K/W");
          },
        });
      },
    })
  );

  const zk4 = 0.05 * (1 - Math.exp(-5)) + 0.15 * (1 - Math.exp(-1 / 3));
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-impulsion",
      titre: "Impulsion de puissance et impédance thermique",
      niveau: "intermédiaire",
      enonce: "<p>Une diode, dont le dissipateur est à $80\\ ^\\circ\\mathrm{C}$, reçoit une impulsion de $300\\ \\mathrm{W}$ pendant $10\\ \\mathrm{ms}$. Son impédance thermique jonction-dissipateur est modélisée par deux cellules de Foster : $r_1 = 0{,}05\\ \\mathrm{K/W}$, $\\tau_1 = 2\\ \\mathrm{ms}$ ; $r_2 = 0{,}15\\ \\mathrm{K/W}$, $\\tau_2 = 30\\ \\mathrm{ms}$. Quelle température de jonction atteint-elle à la fin de l'impulsion, en degrés Celsius ?</p>",
      valeur: 80 + 300 * zk4,
      unite: "°C",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Température en fin d'impulsion",
      etapes: [
        { texte: "Première cellule : $0{,}05(1 - e^{-10/2}) = 0{,}05 \\times 0{,}9933 = 0{,}0497\\ \\mathrm{K/W}$." },
        { texte: "Seconde cellule : $0{,}15(1 - e^{-10/30}) = 0{,}15 \\times 0{,}2835 = 0{,}0425\\ \\mathrm{K/W}$." },
        { texte: "$Z_{th}(10\\ \\mathrm{ms}) = 0{,}0922\\ \\mathrm{K/W}$ ; $\\Delta T = 300 \\times 0{,}0922 = 27{,}7\\ \\mathrm{K}$ ; $T_j = 107{,}7\\ ^\\circ\\mathrm{C}$.", note: "Avec $R_{th} = 0{,}20\\ \\mathrm{K/W}$, on aurait trouvé $140\\ ^\\circ\\mathrm{C}$ : utiliser la résistance pour une impulsion brève surestime l'échauffement de plus du double." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Jonction pendant et après l'impulsion de 300 W",
          xTitre: "temps", xUnite: "ms", yTitre: "T_j", yUnite: "°C",
          xMin: 0, xMax: 60, yMin: 78, yMax: 115,
          series: [
            {
              id: "T", nom: "T_j(t)", couleur: "serie-1", epaisseur: 2.6,
              fonction: (tm) => {
                const z = (t) => (t <= 0 ? 0 : 0.05 * (1 - Math.exp(-t / 2)) + 0.15 * (1 - Math.exp(-t / 30)));
                return 80 + 300 * (z(tm) - z(tm - 10));
              },
            },
          ],
          surDessin({ c, repere: r, couleurs }) {
            pointRepere(c, r, couleurs, 10, 80 + 300 * zk4, "107,7 °C à 10 ms");
          },
        });
      },
    })
  );

  const Tk5 = (40 + 27 * (1 - 0.007 * 25)) / (1 - 27 * 0.007);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-boucle",
      titre: "Pertes qui dépendent de la température",
      niveau: "avancé",
      enonce: "<p>Un MOSFET conduit $30\\ \\mathrm{A}$ efficaces. $R_{DS(on)} = 10\\ \\mathrm{m\\Omega}$ à $25\\ ^\\circ\\mathrm{C}$ et croît selon $R_{DS(on)}(T) = R_{25}[1 + 0{,}007(T_j - 25)]$. La résistance thermique de la jonction à l'air vaut $3\\ \\mathrm{K/W}$, l'air est à $40\\ ^\\circ\\mathrm{C}$, et l'on néglige les pertes de commutation. Quelle est la température de jonction d'équilibre, en degrés Celsius ? Vérifiez ensuite qu'elle est stable.</p>",
      valeur: Tk5,
      unite: "°C",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Température d'équilibre",
      etapes: [
        { texte: "Pertes à $25\\ ^\\circ\\mathrm{C}$ : $P_0 = R_{25}I^2 = 0{,}01 \\times 900 = 9\\ \\mathrm{W}$." },
        { texte: "Équation : $T_j = 40 + 3 \\times 9[1 + 0{,}007(T_j - 25)] = 40 + 27 + 0{,}189(T_j - 25)$." },
        { texte: "$T_j(1 - 0{,}189) = 67 - 4{,}725$, d'où $T_j = 62{,}275/0{,}811 = 76{,}8\\ ^\\circ\\mathrm{C}$ ; pertes $9 \\times 1{,}3625 = 12{,}26\\ \\mathrm{W}$." },
        { texte: "Contrôle : $40 + 3 \\times 12{,}26 = 76{,}8\\ ^\\circ\\mathrm{C}$. Gain de boucle $aR_{th}P_0 = 0{,}007 \\times 3 \\times 9 = 0{,}189 &lt; 1$ : équilibre stable.", note: "L'emballement surviendrait pour $R_{th} \\ge 1/(0{,}007 \\times 9) = 15{,}9\\ \\mathrm{K/W}$, par exemple un boîtier sans dissipateur." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Point fixe : la température qui produit exactement ses propres pertes",
          xTitre: "T_j supposée", xUnite: "°C", yTitre: "T_j calculée", yUnite: "°C",
          xMin: 25, xMax: 125, yMin: 25, yMax: 125,
          series: [
            { id: "id", nom: "droite T calculée = T supposée", couleur: "serie-6", epaisseur: 1.6, fonction: (T) => T },
            { id: "f", nom: "40 + 3 P(T)", couleur: "serie-1", epaisseur: 2.6, fonction: (T) => 40 + 27 * (1 + 0.007 * (T - 25)) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            pointRepere(c, r, couleurs, Tk5, Tk5, "équilibre 76,8 °C");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-diagnostic",
      titre: "Variateur qui déclenche en été",
      niveau: "diagnostic",
      enonce: "<p>Le variateur de la pompe, en service depuis deux ans, déclenche en surchauffe du dissipateur les après-midi d'été. À charge identique, le capteur indiquait à la mise en service $T_h - T_a = 54{,}6\\ \\mathrm{K}$ ; il indique aujourd'hui $69{,}6\\ \\mathrm{K}$, pour environ $455\\ \\mathrm{W}$ de pertes. Le ventilateur tourne. Quelles affirmations sont justes ?</p>",
      options: [
        { texte: "La résistance $R_{ha}$ est passée d'environ $0{,}120$ à $0{,}153\\ \\mathrm{K/W}$ : le défaut est entre le dissipateur et l'air.", juste: true },
        { texte: "Des ailettes encrassées, des filtres colmatés ou un ventilateur ralenti par l'usure de ses roulements expliquent ce symptôme.", juste: true },
        { texte: "Une graisse thermique séchée sous le module expliquerait à elle seule cette hausse de $T_h - T_a$." },
        { texte: "La première action est de nettoyer, de mesurer le débit d'air et de refaire l'essai à charge connue avant toute autre modification.", juste: true },
        { texte: "Il suffit de relever le seuil de déclenchement de $10\\ \\mathrm{K}$." },
      ],
      multiple: true,
      etapes: [
        { texte: "$\\Delta(T_h - T_a) = 15\\ \\mathrm{K}$ pour $455\\ \\mathrm{W}$ : $R_{ha}$ a augmenté de $15/455 = 0{,}033\\ \\mathrm{K/W}$, de $0{,}120$ à $0{,}153\\ \\mathrm{K/W}$." },
        { texte: "Cette résistance ne dépend que de l'échange avec l'air : surface des ailettes, débit, propreté." },
        { texte: "Une graisse dégradée augmenterait $T_j - T_h$, que le capteur du dissipateur ne voit pas ; elle ne change pas $T_h - T_a$." },
        { texte: "Relever le seuil supprimerait la protection sans traiter la cause : les jonctions dépasseraient leur limite.", note: "Le plan de maintenance doit inclure le nettoyage des ailettes et des filtres, et un relevé périodique de $T_h - T_a$ à charge connue." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(moteurApi, conteneur, "0 0 700 190", dessinDiagnostic("fl-k6"), "Démarche : écart mesuré, résistance déduite, causes possibles, cause écartée, action.");
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-conceptuel",
      titre: "Pourquoi le dissipateur ne protège pas d'une impulsion",
      niveau: "conceptuel",
      enonce: "<p>Sans calcul, expliquez pourquoi un IGBT peut supporter pendant une milliseconde une puissance dix fois supérieure à celle qu'il tient en continu, et pourquoi le choix du dissipateur n'a presque aucune influence sur l'échauffement de sa jonction pendant cette milliseconde.</p>",
      motsCles: [["capacite", "inertie", "stocke", "stockee", "stockage"], ["puce", "silicium", "substrat"], ["constante de temps", "temps", "lent", "lente", "minutes"], ["impedance", "z_th", "zth"]],
      minimum: 3,
      exemple: "Trois ou quatre phrases : où va l'énergie pendant l'impulsion, ce que mesure Z_th, l'échelle de temps du dissipateur.",
      etapes: [
        { texte: "Pendant une milliseconde, la chaleur n'a pas le temps de traverser l'empilement : elle est stockée dans la capacité thermique de la puce et de son substrat, qui s'échauffent seuls." },
        { texte: "L'échauffement vaut $P\\,Z_{th}(t_p)$, et $Z_{th}$ à une milliseconde est des dizaines de fois plus petite que $R_{th}$ : c'est ce qui autorise la forte puissance." },
        { texte: "Le dissipateur a une constante de temps de plusieurs minutes : pendant l'impulsion, sa température ne bouge pas, et il n'intervient qu'en fixant le point de départ $T_h$.", note: "Inversement, une impulsion de plusieurs secondes fait travailler la semelle, et une surcharge de plusieurs minutes, le dissipateur." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Z_th de l'IGBT comparée à sa résistance en régime permanent",
          xTitre: "log10 du temps en s", xUnite: "", yTitre: "K/W", yUnite: "",
          xMin: -4, xMax: 1, yMin: 0, yMax: 0.34,
          series: [{ id: "z", nom: "Z_th(t)", couleur: "serie-1", epaisseur: 2.6, fonction: (u) => zFoster(Math.pow(10, u)) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0.3, "R_th = 0,30 K/W");
            pointRepere(c, r, couleurs, -3, zFoster(1e-3), "0,021 K/W à 1 ms");
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

function dessinChaineQuiz(id) {
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="2">';
  s += '<circle cx="60" cy="110" r="20"/><path d="M80 110H120M200 110H260M340 110H400M480 110H540"/>';
  s += '<rect x="120" y="96" width="80" height="28"/><rect x="260" y="96" width="80" height="28"/><rect x="400" y="96" width="80" height="28"/>';
  s += '<path d="M540 110V170M40 170H600"/><path d="M60 130V170"/></g>';
  s += TRAITS + ' stroke-width="1.6">' + fleche(52, 110, 68, 110, id) + fleche(420, 70, 470, 70, id) + "</g>";
  s += ECRITS.replace('font-size="12"', 'font-size="11"');
  s += texte(30, 80, "IGBT : 43 W") + texte(126, 90, "élément A") + texte(266, 90, "élément B") + texte(406, 90, "élément C");
  s += texte(126, 146, "R_jc = 0,22") + texte(266, 146, "R_ch = 0,08") + texte(406, 146, "R_ha = 0,20");
  s += texte(400, 60, "flux total : 310 W") + texte(200, 192, "référence : air de l'armoire");
  s += "</g>";
  return s;
}

const ZONES_CHAINE = [
  { x: 112, y: 88, largeur: 96, hauteur: 44, etiquette: "élément A" },
  { x: 252, y: 88, largeur: 96, hauteur: 44, etiquette: "élément B" },
  { x: 392, y: 88, largeur: 96, hauteur: 44, etiquette: "élément C", juste: true },
];

const VISUELS_QUIZ = [
  etapes(["R_th = ΔT / P", "kelvin divisé par watt", "unité : K/W"], "Unité de la résistance thermique."),
  etapes(["R_ha dépend du débit d'air", "et, en convection naturelle, de l'écart T_h - T_a", "le catalogue donne une courbe, pas une constante"], "Résistance d'un dissipateur."),
  etapes(["ΔT = 50 W × 1,2 K/W = 60 K", "T_j = 35 + 60", "= 95 °C"], "Chaîne en régime permanent."),
  etapes(["surfaces rugueuses : contact en quelques points", "le reste de l'interface est de l'air, λ = 0,026", "la graisse, λ ≈ 1, remplace l'air"], "Rôle de la graisse thermique."),
  etapes(["R = e / (λ S)", "= 0,63e-3 / (170 × 1e-4)", "= 0,0371 K/W"], "Résistance de conduction d'une céramique AlN."),
  () => ({ viewBox: "0 0 640 210", dessin: dessinChaineQuiz("fl-qv5"), legende: "Marches : A, 0,22 × 43 = 9,5 K ; B, 0,08 × 43 = 3,5 K ; C, 0,20 × 310 = 62 K, car R_ha voit toutes les pertes." }),
  etapes(["impulsion de 1 ms : seule la puce s'échauffe", "grandeur pertinente : Z_th(1 ms)", "R_th ne vaut qu'en régime permanent"], "Impédance thermique et impulsion."),
  etapes(["T_h = T_a + R_ha × (P_1 + P_2)", "loi des nœuds au dissipateur", "chaque jonction : T_h + R_jh,k P_k"], "Dissipateur partagé."),
  etapes(["C_h = 2 kg × 900 J/(kg K) = 1800 J/K", "τ = R_ha C_h = 0,25 × 1800 = 450 s", "= 7,5 min"], "Constante de temps d'un dissipateur."),
  etapes(["ondulation à basse fréquence : Z_th de la puce", "moins de courant ou de découpage : moins de pertes", "module plus gros : Z_th plus faible", "R_ha agit sur la moyenne, presque pas sur l'ondulation"], "Réduire les cycles thermiques."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Quelle est l'unité d'une résistance thermique ?</p>",
        options: ["$\\mathrm{W/K}$", "$\\mathrm{K/W}$", "$\\mathrm{W/(m\\,K)}$", "$\\mathrm{J/K}$"],
        bonnes: [1],
        explication: "$R_{th} = \\Delta T/P$ : des kelvins par watt. $\\mathrm{W/(m\\,K)}$ est l'unité de la conductivité, $\\mathrm{J/K}$ celle de la capacité.",
        resume: "Unité de R_th",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>La résistance thermique d'un dissipateur indiquée par son fabricant est une constante, indépendante du débit d'air et de l'écart de température.</p>",
        reponse: false,
        explication: "Elle dépend fortement du débit en convection forcée et, en convection naturelle, de l'écart de température ; le fabricant donne une courbe.",
        resume: "R_ha non constante",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Un composant dissipe $50\\ \\mathrm{W}$, sa résistance totale jusqu'à l'air vaut $1{,}2\\ \\mathrm{K/W}$, l'air est à $35\\ ^\\circ\\mathrm{C}$. Température de jonction, en degrés Celsius ?</p>",
        valeur: 95,
        unite: "°C",
        tolerance: 0.01,
        explication: "$35 + 50 \\times 1{,}2 = 95\\ ^\\circ\\mathrm{C}$.",
        resume: "Chaîne permanente",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi met-on de la graisse thermique entre un module et son dissipateur, alors qu'elle conduit cent fois moins bien que l'aluminium ?</p>",
        motsCles: [["air", "vides", "rugosite", "rugueuses", "points"], ["remplace", "chasse", "comble", "combler", "remplir"]],
        minimum: 2,
        explication: "Les surfaces ne se touchent qu'en quelques points : le reste de l'interface est de l'air, quarante fois moins conducteur que la graisse. La graisse comble ces vides ; elle doit rester mince.",
        resume: "Graisse thermique",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Résistance de conduction d'une céramique AlN de $0{,}63\\ \\mathrm{mm}$, $\\lambda = 170\\ \\mathrm{W/(m\\,K)}$, sous une surface de $1\\ \\mathrm{cm^2}$, en $\\mathrm{K/W}$ ?</p>",
        valeur: 0.63e-3 / (170 * 1e-4),
        unite: "K/W",
        tolerance: 0.02,
        explication: "$0{,}63 \\times 10^{-3}/(170 \\times 10^{-4}) = 0{,}0371\\ \\mathrm{K/W}$, épanouissement négligé.",
        resume: "Conduction",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>L'IGBT dissipe $43\\ \\mathrm{W}$ ; l'onduleur entier, $310\\ \\mathrm{W}$, est monté sur le même dissipateur. Aux bornes de quel élément l'écart de température est-il le plus grand ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 640 210",
        dessin: dessinChaineQuiz("fl-qz"),
        zones: ZONES_CHAINE,
        explication: "$R_{ha}$ est traversée par les $310\\ \\mathrm{W}$ de tout l'onduleur : $62\\ \\mathrm{K}$, contre $9{,}5\\ \\mathrm{K}$ pour $R_{jc}$ et $3{,}5\\ \\mathrm{K}$ pour $R_{ch}$.",
        resume: "Lecture du réseau",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Pour estimer l'échauffement d'une jonction soumise à une impulsion unique de $1\\ \\mathrm{ms}$, quelle grandeur faut-il utiliser ?</p>",
        options: ["La résistance $R_{th,ja}$", "L'impédance $Z_{th}(1\\ \\mathrm{ms})$", "La capacité du dissipateur", "La puissance moyenne sur une seconde multipliée par $R_{th}$"],
        bonnes: [1],
        explication: "$\\Delta T = P\\,Z_{th}(t_p)$ : pendant une milliseconde, seule la capacité de la puce travaille.",
        resume: "Impulsion",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Quand deux composants partagent un dissipateur, la température de celui-ci dépend de la somme de leurs pertes.</p>",
        reponse: true,
        explication: "Loi des nœuds : $T_h = T_a + R_{ha}(P_1 + P_2)$.",
        resume: "Dissipateur partagé",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Un dissipateur de $2\\ \\mathrm{kg}$ d'aluminium ($900\\ \\mathrm{J/(kg\\,K)}$) a une résistance de $0{,}25\\ \\mathrm{K/W}$. Sa constante de temps, en minutes ?</p>",
        valeur: 7.5,
        unite: "min",
        tolerance: 0.02,
        explication: "$\\tau = R_{ha}mc = 0{,}25 \\times 1800 = 450\\ \\mathrm{s} = 7{,}5\\ \\mathrm{min}$.",
        resume: "Constante de temps",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Un onduleur fonctionne longtemps à $1\\ \\mathrm{Hz}$ de sortie à fort courant. Quelles mesures réduisent l'amplitude des cycles de température de ses jonctions ?</p>",
        options: [
          { texte: "Réduire le courant admissible à basse fréquence", juste: true },
          { texte: "Réduire la fréquence de découpage", juste: true },
          { texte: "Choisir un module de calibre supérieur, à $Z_{th}$ plus faible", juste: true },
          { texte: "Remplacer seulement le dissipateur par un modèle deux fois plus gros" },
          { texte: "Augmenter la température de l'air de l'armoire" },
        ],
        multiple: true,
        explication: "L'ondulation dépend des pertes et de $Z_{th}$ de la puce à l'échelle de la demi-période. Le dissipateur, lent, abaisse la moyenne mais presque pas l'ondulation.",
        resume: "Cycles à basse fréquence",
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
      { categorie: "Analogie", question: "Quelle est l'analogie électrique de la thermique ?", reponse: "Température et potentiel, flux de chaleur et courant, résistance thermique et résistance, capacité thermique et condensateur relié à la référence ; l'air ambiant est la masse." },
      { categorie: "Chaîne", question: "Quelles sont les résistances d'un composant monté ?", reponse: "$R_{jc}$ de la jonction au boîtier, $R_{ch}$ de l'interface, $R_{ha}$ du dissipateur à l'air ; $T_j = T_a + P(R_{jc} + R_{ch} + R_{ha})$." },
      { categorie: "Conduction", question: "Que vaut la résistance d'une couche ?", reponse: "$R = e/(\\lambda S)$, comme $R = \\ell/(\\sigma S)$ ; une alumine de $0{,}38\\ \\mathrm{mm}$ sous $1\\ \\mathrm{cm^2}$ oppose $0{,}16\\ \\mathrm{K/W}$." },
      { categorie: "Convection", question: "Pourquoi les variateurs sont-ils ventilés ?", reponse: "$R_{ha} = 1/(hS)$ ; $h$ vaut $5$ à $10$ en convection naturelle et $25$ à $250$ en forcée : pour $0{,}12\\ \\mathrm{K/W}$, $1{,}4\\ \\mathrm{m^2}$ contre $0{,}2\\ \\mathrm{m^2}$." },
      { categorie: "Partage", question: "Quelle puce limite un dissipateur partagé ?", reponse: "Celle du plus grand produit $R_{jh}P$ : $T_{h,max} = \\min_k(T_{j,lim} - R_{jh,k}P_k)$. Pour la pompe, le pont d'entrée." },
      { categorie: "Marge", question: "Quelle température viser en service continu ?", reponse: "$25$ à $50\\ \\mathrm{K}$ sous la limite du catalogue, au point le plus chaud et à l'air le plus chaud : ici $125\\ ^\\circ\\mathrm{C}$ pour $150$." },
      { categorie: "Transitoire", question: "Qu'est-ce que l'impédance thermique $Z_{th}(t)$ ?", reponse: "La réponse de la jonction à un échelon de $1\\ \\mathrm{W}$ : $\\sum r_i(1 - e^{-t/\\tau_i})$, qui tend vers $R_{th}$. Impulsion : $\\Delta T = P\\,Z_{th}(t_p)$." },
      { categorie: "Échelles", question: "Quelles constantes de temps dans un variateur ?", reponse: "Puce et substrat : millisecondes ; semelle : secondes ; dissipateur : minutes. Une surcharge d'une minute fait peu monter le dissipateur, mais toute la puce." },
      { categorie: "Fiabilité", question: "Pourquoi les cycles thermiques usent-ils un module ?", reponse: "Dilatations différentes du silicium, du cuivre et de la céramique : fatigue des brasures et des fils de liaison. $N_f$ chute très vite avec $\\Delta T_j$, d'où le déclassement à basse fréquence." },
      { categorie: "Diagnostic", question: "Que signifie une hausse de $T_h - T_a$ à charge égale ?", reponse: "$R_{ha}$ a augmenté : ailettes encrassées, filtres colmatés, ventilateur ralenti. Une graisse sèche, elle, augmente $T_j - T_h$." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["T_h = 40 + 0,15 × 300 = 85 °C", "T_j = 85 + 0,9 × 20", "= 103 °C"], "Dissipateur partagé."),
  etapes(["100 µs : seule la puce travaille", "Z_th(100 µs) ne dépend pas de R_ha", "le dissipateur fixe seulement T_h de départ"], "Impulsion brève et dissipateur."),
  etapes(["dilatations : Si 2,6 ; Cu 17 ; Al 23 ppm/K", "cisaillement des brasures et des pieds de fils", "fatigue : fissures, décollements"], "Mécanisme du vieillissement par cycles."),
  etapes(["i = C dv/dt", "= 150e-12 × 8e9", "= 1,2 A"], "Courant dans une capacité parasite."),
  etapes(["tore sur les phases seules : lit i_MC", "PE dans le tore : le retour l'annule", "le conducteur de protection reste dehors"], "Tore de mode commun."),
  etapes(["P = f E_ref (V/600)(I/100)", "= 4000 × 15,5e-3 × 0,9 × 0,5", "= 27,9 W"], "Pertes de commutation mises à l'échelle."),
  etapes(["I_N = 20 + 10∠-120° + 10∠120°", "10∠-120° + 10∠120° = -10", "I_N = 10 A"], "Courant de neutre par somme de phaseurs."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Un dissipateur de $0{,}15\\ \\mathrm{K/W}$ évacue $300\\ \\mathrm{W}$ dans un air à $40\\ ^\\circ\\mathrm{C}$. Une diode montée dessus dissipe $20\\ \\mathrm{W}$ avec $R_{jh} = 0{,}9\\ \\mathrm{K/W}$. Température de sa jonction, en degrés Celsius ?</p>",
        valeur: 103,
        unite: "°C",
        tolerance: 0.01,
        explication: "$T_h = 40 + 0{,}15 \\times 300 = 85\\ ^\\circ\\mathrm{C}$ ; $T_j = 85 + 0{,}9 \\times 20 = 103\\ ^\\circ\\mathrm{C}$.",
        resume: "Dissipateur partagé",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Pour une impulsion de $100\\ \\mu\\mathrm{s}$, diviser par deux la résistance du dissipateur réduit fortement la crête de température de la jonction.</p>",
        reponse: false,
        explication: "Pendant $100\\ \\mu\\mathrm{s}$, seule la capacité de la puce travaille ; le dissipateur ne fixe que la température de départ.",
        resume: "Impulsion et dissipateur",
      },
      {
        type: "courte",
        enonce: repere(2) + "<p>Cette séance. Par quel mécanisme les cycles de température usent-ils un module de puissance ?</p>",
        motsCles: [["dilatation", "dilatent", "dilate", "coefficients"], ["brasure", "brasures", "fils", "fil", "soudure"], ["fatigue", "fissure", "fissures", "decollement", "decollent"]],
        minimum: 2,
        explication: "Les couches collées se dilatent différemment : silicium, cuivre, céramique et aluminium. Les brasures et les pieds des fils de liaison subissent des cisaillements répétés qui les fissurent ou les décollent par fatigue.",
        resume: "Vieillissement",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Compatibilité électromagnétique. Une capacité parasite de $150\\ \\mathrm{pF}$ subit une pente de $8\\ \\mathrm{kV/\\mu s}$. Courant pendant le front, en ampères ?</p>",
        valeur: 150e-12 * 8e9,
        unite: "A",
        tolerance: 0.02,
        explication: "$150 \\times 10^{-12} \\times 8 \\times 10^{9} = 1{,}2\\ \\mathrm{A}$.",
        resume: "C dv/dt",
      },
      {
        type: "vraiFaux",
        enonce: repere(4) + "<p>Cours Compatibilité électromagnétique. Un tore de mode commun en sortie de variateur doit entourer les trois phases et le conducteur de protection.</p>",
        reponse: false,
        explication: "Le retour du mode commun par le conducteur de protection annulerait le flux dans le tore : on n'y enfile que les phases.",
        resume: "Tore de mode commun",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours MOSFET et IGBT. Un IGBT commute à $4\\ \\mathrm{kHz}$ un courant constant de $50\\ \\mathrm{A}$ sous $540\\ \\mathrm{V}$. Sa documentation donne $E_{on} + E_{off} = 15{,}5\\ \\mathrm{mJ}$ sous $600\\ \\mathrm{V}$ et $100\\ \\mathrm{A}$. Pertes de commutation, en watts, par mise à l'échelle linéaire ?</p>",
        valeur: 4000 * 15.5e-3 * 0.9 * 0.5,
        unite: "W",
        tolerance: 0.02,
        explication: "$4000 \\times 15{,}5 \\times 10^{-3} \\times (540/600) \\times (50/100) = 27{,}9\\ \\mathrm{W}$.",
        resume: "Pertes de commutation",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Charges triphasées déséquilibrées. Trois charges résistives en étoile avec neutre absorbent $20$, $10$ et $10\\ \\mathrm{A}$ sur les phases 1, 2 et 3 d'un réseau direct. Courant dans le neutre, en ampères ?</p>",
        valeur: 10,
        unite: "A",
        tolerance: 0.02,
        explication: "$\\underline{I}_N = 20 + 10e^{-j2\\pi/3} + 10e^{j2\\pi/3} = 20 - 10 = 10\\ \\mathrm{A}$, en phase avec la phase 1.",
        resume: "Courant de neutre",
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
    titre: "Où en suis-je sur la thermique des composants de puissance ?",
  });
  if (auto) ressources.push(auto);
}
