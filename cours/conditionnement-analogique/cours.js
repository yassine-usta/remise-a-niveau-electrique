/* ==========================================================================
   cours/conditionnement-analogique/cours.js
   Conditionnement analogique : poutre et pont de jauges manipulables, erreur
   de mode commun d'un soustracteur et d'un amplificateur d'instrumentation,
   amplificateur d'instrumentation vivant, filtre de Sallen et Key, budget
   d'erreur, exercices, quiz, cartes, révision espacée et auto-évaluation.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const K_JAUGE = 2;
const BETA = 1e-5;

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

function signe(api, valeur, decimales) {
  return (valeur > 0 ? "+" : "") + nb(api, valeur, decimales);
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

/** Résistance au symbole rectangulaire entre deux points. */
function resistance(x1, y1, x2, y2, L = 40, W = 13) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const n = Math.hypot(dx, dy);
  const ux = dx / n;
  const uy = dy / n;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const ax = mx - (ux * L) / 2;
  const ay = my - (uy * L) / 2;
  const bx = mx + (ux * L) / 2;
  const by = my + (uy * L) / 2;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    '<path d="M' + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + ax.toFixed(1) + " " + ay.toFixed(1) +
    "M" + bx.toFixed(1) + " " + by.toFixed(1) + "L" + x2.toFixed(1) + " " + y2.toFixed(1) + '"/>' +
    '<rect x="' + (-L / 2) + '" y="' + (-W / 2) + '" width="' + L + '" height="' + W + '" transform="translate(' + mx.toFixed(1) + " " + my.toFixed(1) + ") rotate(" + ang.toFixed(1) + ')"/>'
  );
}

function ligneH(c, repere, couleurs, y, libelle, motif = [7, 5], aGauche = false) {
  const py = repere.versY(y);
  if (!Number.isFinite(py) || py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.setLineDash(motif);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(repere.boite.x, py);
  c.lineTo(repere.boite.x + repere.boite.l, py);
  c.stroke();
  c.setLineDash([]);
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    c.textAlign = aGauche ? "left" : "right";
    c.fillText(libelle, aGauche ? repere.boite.x + 4 : repere.boite.x + repere.boite.l - 4, py - 6);
  }
  c.restore();
}

function ligneV(c, repere, couleurs, x, motif = [1, 3], libelle, enBas = false) {
  const px = repere.versX(x);
  if (!Number.isFinite(px) || px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  c.save();
  c.setLineDash(motif);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.3;
  c.beginPath();
  c.moveTo(px, repere.boite.y);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  if (libelle) {
    c.setLineDash([]);
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    c.textAlign = px > repere.boite.x + repere.boite.l * 0.7 ? "right" : "left";
    c.fillText(libelle, px + (c.textAlign === "right" ? -5 : 5), enBas ? repere.boite.y + repere.boite.h - 8 : repere.boite.y + 14);
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
function dessinEtapes(lignes, largeur = 660) {
  const hauteur = 30 + lignes.length * 22;
  return (
    TRAITS + ' stroke-width="1.4"><rect x="6" y="6" width="' + (largeur - 12) + '" height="' + (hauteur - 12) + '" rx="8"/></g>' +
    ECRITS + lignes.map((ligne, i) => texte(22, 32 + i * 22, ligne)).join("") + "</g>"
  );
}

function etapes(lignes, legende, largeur = 660) {
  return { viewBox: "0 0 " + largeur + " " + (30 + lignes.length * 22), dessin: dessinEtapes(lignes, largeur), legende };
}

function correctionEtapes(lignes, legende, largeur = 660) {
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
   Modèles
   -------------------------------------------------------------------------- */

const CONFIGS = ["quart de pont", "demi-pont", "pont complet"];

/** Résistances et sortie du pont pour une configuration, une déformation, une excitation et un échauffement. */
function pont(config, eps, va, dT) {
  const R = 350;
  const x = K_JAUGE * eps * 1e-6;
  const b = BETA * dT;
  let r1 = R;
  let r2 = R * (1 + x + b);
  let r3 = R;
  let r4 = R;
  if (config >= 1) r1 = R * (1 - x + b);
  if (config === 2) {
    r3 = R * (1 + x + b);
    r4 = R * (1 - x + b);
  }
  const vA = (va * r2) / (r1 + r2);
  const vB = (va * r4) / (r3 + r4);
  return { vA, vB, vs: vA - vB, x };
}

/** Soustracteur à quatre résistances, cas le plus défavorable, déséquilibre de source sur l'entrée inverseuse. */
function soustracteur(G, t, dRs, R1 = 10e3) {
  const r1 = R1 * (1 + t) + dRs;
  const r2 = G * R1 * (1 - t);
  const r3 = R1 * (1 - t);
  const r4 = G * R1 * (1 + t);
  const k = r4 / (r3 + r4);
  const ad = 0.5 * (k * (1 + r2 / r1) + r2 / r1);
  const acm = k * (1 + r2 / r1) - r2 / r1;
  return { ad, acm };
}

const T_INTEGRE = 1e-4;
function trmcIna(G) {
  return Math.min(Math.pow(10, 130 / 20), G / (2 * T_INTEGRE));
}

/** Gain complexe d'un filtre : ordre 1 ou ordre 2 de facteur de qualité q. */
function gainFiltre(f, fc, q) {
  const u = f / fc;
  if (!q) return { re: 1 / (1 + u * u), im: -u / (1 + u * u) };
  const re = 1 - u * u;
  const im = u / q;
  const d = re * re + im * im;
  return { re: re / d, im: -im / d };
}

function moduleGain(f, fc, q) {
  const g = gainFiltre(f, fc, q);
  return Math.hypot(g.re, g.im);
}

/** Intégration numérique de la réponse d'un filtre à une entrée u(t). */
function simulerFiltre(u, fc, q, duree = 2, dt = 2e-4) {
  const w = 2 * Math.PI * fc;
  let y = 0;
  let v = 0;
  const sortie = [];
  for (let k = 0, t = 0; t <= duree + 1e-12; k += 1, t = k * dt) {
    const e = u(t);
    if (!q) {
      y += w * (e - y) * dt;
    } else {
      const a = w * w * (e - y) - (w / q) * v;
      v += a * dt;
      y += v * dt;
    }
    sortie.push([t, y]);
  }
  return sortie;
}

/* --------------------------------------------------------------------------
   Initialisation et nettoyage
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  detruire();
  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construirePoutre(racine, api);
  construireTrmc(racine, api);
  construireIna(racine, api);
  construireFiltre(racine, api);
  construireBudget(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  ressources.push(
    api.reveler(racine.querySelectorAll(".formule-cle, .encadre, #f-comparatif, #e-statut-tableau, #h-tableau, #j-tableau"), {
      decalage: 0.05,
    })
  );
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
    ["#e-pont-figure svg", 2.2],
    ["#e-aop-figure svg", 2.4],
    ["#e-ina-vivant svg", 2.4],
    ["#e-filtre-figure svg", 2],
    ["#f-schema-principal svg", 2.8],
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
      id: "c1-diviseur",
      titre: "Un diviseur légèrement déséquilibré",
      niveau: "fondamental",
      enonce:
        "<p>Un diviseur est alimenté sous $5\\ \\mathrm{V}$ ; sa résistance haute vaut $350\\ \\Omega$ et sa résistance basse passe de $350$ à $350{,}7\\ \\Omega$. De combien la tension du point milieu augmente-t-elle, en millivolts ?</p>",
      valeur: (5 * 350.7) / 700.7 * 1000 - 2500,
      unite: "mV",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Variation",
      etapes: [
        { texte: "Avant : $v = 5 \\times 350/700 = 2{,}5\\ \\mathrm{V}$." },
        { texte: "Après : $v = 5 \\times 350{,}7/700{,}7 = 2{,}502\\,50\\ \\mathrm{V}$." },
        { texte: "Variation : $2{,}4975\\ \\mathrm{mV}$ pour $0{,}2\\ \\%$ de variation de résistance, posée sur $2{,}5\\ \\mathrm{V}$.", note: "C'est exactement un quart de pont : $V_a x/4 = 5 \\times 0{,}002/4 = 2{,}5\\ \\mathrm{mV}$." },
      ],
      visuelCorrection: correctionEtapes(
        ["avant : v = 5 × 350 / 700 = 2,5 V", "après : v = 5 × 350,7 / 700,7 = 2,50250 V", "Δv = 2,4975 mV, sur un socle de 2,5 V"],
        "Un millivolt utile sur plusieurs volts communs."
      ),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-sortie",
      titre: "Résistance de sortie d'un diviseur",
      niveau: "fondamental",
      enonce: "<p>Quelle est la résistance vue du point milieu d'un diviseur formé de deux résistances de $350\\ \\Omega$, la source d'alimentation étant idéale, en ohms ?</p>",
      valeur: 175,
      unite: "Ω",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Résistance de sortie",
      etapes: [
        { texte: "On éteint la source de tension : elle devient un court-circuit." },
        { texte: "Les deux résistances se retrouvent en parallèle entre le point milieu et la masse : $350 \\parallel 350 = 175\\ \\Omega$." },
        { texte: "Pour un pont complet, chaque sortie présente $175\\ \\Omega$, soit $350\\ \\Omega$ entre les deux sorties.", note: "Un amplificateur d'entrée de quelques kilohms change déjà le gain de plusieurs pour cent." },
      ],
      visuelCorrection: correctionEtapes(
        ["source de tension éteinte : court-circuit", "R_sortie = 350 ∥ 350 = 175 Ω", "pont complet : 350 Ω entre A et B"],
        "Théorème de Thévenin appliqué au diviseur."
      ),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c3-decibels",
      titre: "Un rapport de cent mille en décibels",
      niveau: "fondamental",
      enonce: "<p>Un amplificateur amplifie $10^5$ fois plus le signal différentiel que le mode commun. Combien de décibels ce rapport représente-t-il ?</p>",
      valeur: 100,
      unite: "dB",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Rapport",
      etapes: [
        { texte: "Rapport d'amplitudes : $20\\log_{10} 10^5$." },
        { texte: "$20 \\times 5 = 100\\ \\mathrm{dB}$." },
        { texte: "Sur $2{,}5\\ \\mathrm{V}$ de mode commun, $100\\ \\mathrm{dB}$ laissent $25\\ \\mathrm{\\mu V}$ ramenés à l'entrée.", note: "Chaque tranche de $20\\ \\mathrm{dB}$ divise l'erreur par $10$." },
      ],
      visuelCorrection: correctionEtapes(["20 log10(10⁵) = 20 × 5 = 100 dB", "2,5 V / 10⁵ = 25 µV ramenés à l'entrée"], "Décibels et réjection."),
    })
  );
}

/* --------------------------------------------------------------------------
   D. Poutre et pont manipulables : poignée, curseurs, valeurs, tracé
   -------------------------------------------------------------------------- */

function construirePoutre(racine, api) {
  const conteneur = racine.querySelector("#d-poutre-vivant");
  if (!conteneur) return;
  const X0 = 50;
  const L = 320;
  const Y0 = 150;
  const E = 9;
  const etat = { eps: 500, config: 2, va: 5, dT: 0 };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 320",
    role: "img",
    "aria-label": "Poutre encastrée manipulable avec ses jauges, et pont de Wheatstone associé avec les potentiels des points milieux",
  });
  const decor = svgEl("g");
  let d = "<defs>" + marqueur("d-po-fl") + "</defs>" + TRAITS + ' stroke-width="1.7">';
  d += '<path d="M40 70V230" stroke-width="3"/>';
  for (let y = 76; y <= 226; y += 14) d += '<path d="M40 ' + y + 'l-14 12" stroke-width="1"/>';
  d += '<path d="M370 84V216" stroke-dasharray="2 5" stroke-width="1"/>';
  /* pont */
  d += resistance(590, 55, 495, 150) + resistance(590, 55, 685, 150) + resistance(495, 150, 590, 245) + resistance(685, 150, 590, 245);
  d += '<path d="M590 55V36M590 245V262M578 262H602M583 267H597M587 272H593"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  d += texte(14, 300, "point déplaçable : extrémité libre de la poutre");
  d += texte(600, 34, "+Va") + texte(608, 270, "0 V");
  d += texte(472, 146, "A") + texte(694, 146, "B");
  d += "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const corps = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linejoin": "round" });
  const jauges = svgEl("g", { stroke: "currentColor", "stroke-width": "1.3" });
  const force = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2", "marker-end": "url(#d-po-fl)" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(corps, jauges, force, libelles);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  function yCentre(x) {
    const s = (x - X0) / L;
    return Y0 + ((60 * etat.eps) / 1000) * ((s * s * (3 - s)) / 2);
  }

  const valeurs = api.sim.valeurs("#d-poutre-valeurs", [
    { id: "va", libelle: "Potentiel du point milieu A, v_A", format: (v) => v },
    { id: "vb", libelle: "Potentiel du point milieu B, v_B", format: (v) => v },
    { id: "vs", libelle: "Sortie V_s = v_A - v_B", format: (v) => v },
    { id: "vmc", libelle: "Mode commun (v_A + v_B) / 2", format: (v) => v },
    { id: "lin", libelle: "Écart à la droite n V_a x / 4", format: (v) => v },
    { id: "th", libelle: "Signal à vide dû à l'échauffement", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#d-poutre-trace", {
    titre: "Sortie du pont en fonction de la déformation",
    xTitre: "déformation de la face supérieure",
    xUnite: "µm/m",
    yTitre: "V_s",
    yUnite: "mV",
    xMin: -1000,
    xMax: 1000,
    yMin: -11,
    yMax: 11,
    ratio: 0.42,
    echantillons: 200,
    series: [
      { id: "q", nom: "quart de pont" },
      { id: "dm", nom: "demi-pont" },
      { id: "c", nom: "pont complet" },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, etat.eps, [7, 5], "ε courante");
      ligneH(c, r, couleurs, 0, "", [1, 3]);
    },
  });
  if (trace) ressources.push(trace);

  function rendre() {
    /* poutre */
    const haut = [];
    const bas = [];
    for (let k = 0; k <= 32; k += 1) {
      const x = X0 + (L * k) / 32;
      const y = yCentre(x);
      haut.push(x.toFixed(1) + " " + (y - E).toFixed(1));
      bas.push(x.toFixed(1) + " " + (y + E).toFixed(1));
    }
    corps.setAttribute("d", "M" + haut.join(" L") + " L" + bas.reverse().join(" L") + " Z");
    /* jauges */
    const actives = [[true, false, false, false], [true, true, false, false], [true, true, true, true]][etat.config];
    const places = [
      { nom: "J1", x: 78, dessus: true },
      { nom: "J2", x: 78, dessus: false },
      { nom: "J3", x: 128, dessus: true },
      { nom: "J4", x: 128, dessus: false },
    ];
    let j = "";
    let l = "";
    places.forEach((p, i) => {
      const yc = yCentre(p.x + 17);
      const y = p.dessus ? yc - E - 6 : yc + E;
      j += '<rect x="' + p.x + '" y="' + y.toFixed(1) + '" width="34" height="6" rx="1" fill="' + (actives[i] ? "currentColor" : "none") + '"' + (actives[i] ? "" : ' stroke-dasharray="3 2"') + "/>";
      l += texte(p.x + 8, p.dessus ? y - 6 : y + 18, p.nom);
    });
    jauges.innerHTML = j;
    if (Math.abs(etat.eps) > 20) {
      const yh = yCentre(260) - E - 10;
      const yb = yCentre(260) + E + 20;
      l += texte(230, yh, etat.eps > 0 ? "traction" : "compression") + texte(230, yb, etat.eps > 0 ? "compression" : "traction");
    }
    const yt = yCentre(X0 + L);
    if (Math.abs(etat.eps) > 20) {
      const sens = etat.eps > 0 ? 1 : -1;
      force.setAttribute("d", "M" + (X0 + L + 24) + " " + (yt - sens * 46).toFixed(1) + "V" + (yt - sens * 10).toFixed(1));
      l += texte(X0 + L + 32, yt - sens * 30, "F");
    } else force.setAttribute("d", "");
    /* pont */
    const p = pont(etat.config, etat.eps, etat.va, etat.dT);
    const noms = [["R", "J1", "R", "R"], ["J2", "J1", "R", "R"], ["J2", "J1", "J3", "J4"]][etat.config];
    l += texte(462, 90, "R1 " + noms[0]) + texte(664, 90, "R3 " + noms[2]) + texte(462, 228, "R2 " + noms[1]) + texte(664, 228, "R4 " + noms[3]);
    l += texte(404, 190, "vA = " + nb(api, p.vA, 4) + " V") + texte(668, 190, "vB = " + nb(api, p.vB, 4) + " V");
    l += texte(530, 300, "Vs = " + signe(api, p.vs * 1000, 3) + " mV", ' font-size="13"');
    libelles.innerHTML = l;

    if (valeurs) {
      const n = [1, 2, 4][etat.config];
      const droite = (n * etat.va * p.x) / 4;
      const p0 = pont(etat.config, 0, etat.va, etat.dT);
      const sansT = pont(etat.config, etat.eps, etat.va, 0);
      let ecart = Math.abs(droite) > 1e-12 ? ((sansT.vs - droite) / droite) * 100 : 0;
      if (Math.abs(ecart) < 5e-4) ecart = 0;
      valeurs.maj({
        va: nb(api, p.vA, 5) + " V",
        vb: nb(api, p.vB, 5) + " V",
        vs: signe(api, p.vs * 1000, 4) + " mV",
        vmc: nb(api, (p.vA + p.vB) / 2, 4) + " V",
        lin: Math.abs(etat.eps) < 1 ? "sans objet à déformation nulle" : signe(api, ecart, 3) + " %",
        th: signe(api, p0.vs * 1000, 4) + " mV, soit " + signe(api, (p0.vs / ((n * etat.va * K_JAUGE) / 4)) * 1e6, 1) + " µm/m apparents",
      });
    }
    if (trace) {
      const ymax = etat.va * 0.002 * 1000 * 1.12 + Math.abs(pont(0, 0, etat.va, etat.dT).vs * 1000);
      trace.definirPlage({ yMin: -ymax, yMax: ymax });
      trace.definirFonction("q", (e) => pont(0, e, etat.va, etat.dT).vs * 1000);
      trace.definirFonction("dm", (e) => pont(1, e, etat.va, etat.dT).vs * 1000);
      trace.definirFonction("c", (e) => pont(2, e, etat.va, etat.dT).vs * 1000);
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: 370, y: 90 },
    a: { x: 370, y: 210 },
    min: -1000,
    max: 1000,
    pas: 10,
    valeur: etat.eps,
    libelle: "Flexion de la poutre",
    format: (m) => "ε = " + nb(api, typeof m === "number" ? m : m.valeur, 0) + " µm/m",
    rappel(m) {
      etat.eps = typeof m === "number" ? m : m.valeur;
      rendre();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-poutre-curseurs",
    [
      { id: "config", libelle: "Configuration du pont", min: 0, max: 2, pas: 1, valeur: etat.config, format: (v) => CONFIGS[Math.round(v)] },
      { id: "va", libelle: "Excitation V_a", min: 1, max: 10, pas: 0.5, valeur: etat.va, unite: "V" },
      { id: "dT", libelle: "Échauffement de la poutre", min: 0, max: 40, pas: 1, valeur: etat.dT, unite: "K" },
    ],
    (v) => {
      etat.config = Math.round(v.config);
      etat.va = v.va;
      etat.dT = v.dT;
      rendre();
    }
  );
  if (curseurs) ressources.push(curseurs);
  rendre();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.6 }));
}

/* --------------------------------------------------------------------------
   E. Erreur de mode commun : curseurs, lecteur, tracé, valeurs
   -------------------------------------------------------------------------- */

const GAINS = [1, 10, 100, 1000];

function construireTrmc(racine, api) {
  if (!racine.querySelector("#e-trmc-trace")) return;
  const etat = { g: 2, t: 0.1, dRs: 0, vdc: 2.5, vac: 0.5 };
  let t0 = 0;
  let res = null;

  function calcul() {
    const G = GAINS[etat.g];
    const s = soustracteur(G, etat.t / 100, etat.dRs);
    const kS = s.acm / s.ad;
    const kI = 1 / trmcIna(G);
    return { G, s, kS, kI, trmcS: 20 * Math.log10(Math.abs(s.ad / s.acm)), trmcI: 20 * Math.log10(trmcIna(G)) };
  }

  const valeurs = api.sim.valeurs("#e-trmc-valeurs", [
    { id: "ts", libelle: "TRMC du soustracteur discret", format: (v) => v },
    { id: "ti", libelle: "TRMC de l'amplificateur d'instrumentation", format: (v) => v },
    { id: "es", libelle: "Erreur du soustracteur, continue et crête à 50 Hz", format: (v) => v },
    { id: "ei", libelle: "Erreur de l'amplificateur, continue et crête à 50 Hz", format: (v) => v },
    { id: "kg", libelle: "Ondulation crête en kilogrammes, à 2,5 µV/kg", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function vmc(tms) {
    return etat.vdc + etat.vac * Math.sin(2 * Math.PI * 50 * tms * 1e-3);
  }

  const trace = api.sim.traceur("#e-trmc-trace", {
    titre: "Erreur de mode commun ramenée à l'entrée",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "erreur",
    yUnite: "µV",
    xMin: 0,
    xMax: 60,
    yMin: -10,
    yMax: 200,
    ratio: 0.4,
    echantillons: 360,
    series: [
      { id: "s", nom: "soustracteur discret" },
      { id: "i", nom: "amplificateur d'instrumentation" },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 0, "zéro", [1, 3], true);
    },
  });
  if (trace) ressources.push(trace);

  function recalculer() {
    res = calcul();
    if (trace) {
      const bornes = [res.kS * (etat.vdc + etat.vac), res.kS * (etat.vdc - etat.vac), res.kI * (etat.vdc + etat.vac), res.kI * (etat.vdc - etat.vac), 0].map((v) => v * 1e6);
      const bas = Math.min(...bornes);
      const haut = Math.max(...bornes);
      const marge = Math.max(1, (haut - bas) * 0.12);
      trace.definirPlage({ xMin: t0, xMax: t0 + 60, yMin: bas - marge, yMax: haut + marge });
      trace.definirFonction("s", (t) => res.kS * vmc(t) * 1e6);
      trace.definirFonction("i", (t) => res.kI * vmc(t) * 1e6);
    }
    if (valeurs) {
      const sDc = Math.abs(res.kS * etat.vdc) * 1e6;
      const sAc = Math.abs(res.kS * etat.vac) * 1e6;
      const iDc = Math.abs(res.kI * etat.vdc) * 1e6;
      const iAc = Math.abs(res.kI * etat.vac) * 1e6;
      valeurs.maj({
        ts: nb(api, res.trmcS, 1) + " dB",
        ti: nb(api, res.trmcI, 1) + " dB",
        es: nb(api, sDc, 1) + " µV et " + nb(api, sAc, 1) + " µV crête",
        ei: nb(api, iDc, 2) + " µV et " + nb(api, iAc, 2) + " µV crête",
        kg: nb(api, sAc / 2.5, 2) + " kg contre " + nb(api, iAc / 2.5, 3) + " kg",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-trmc-curseurs",
    [
      { id: "g", libelle: "Gain des deux montages", min: 0, max: 3, pas: 1, valeur: etat.g, format: (v) => String(GAINS[Math.round(v)]) },
      { id: "t", libelle: "Tolérance des résistances du soustracteur", min: 0.01, max: 1, pas: 0.01, valeur: etat.t, unite: "%", chiffres: 2 },
      { id: "dRs", libelle: "Déséquilibre des résistances de source", min: 0, max: 200, pas: 5, valeur: etat.dRs, unite: "Ω" },
      { id: "vdc", libelle: "Mode commun continu", min: 0, max: 5, pas: 0.1, valeur: etat.vdc, unite: "V", chiffres: 1 },
      { id: "vac", libelle: "Mode commun à 50 Hz, crête", min: 0, max: 2, pas: 0.05, valeur: etat.vac, unite: "V", chiffres: 2 },
    ],
    (v) => {
      etat.g = Math.round(v.g);
      etat.t = v.t;
      etat.dRs = v.dRs;
      etat.vdc = v.vdc;
      etat.vac = v.vac;
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-trmc-lecteur", {
    de: 0,
    a: 200,
    duree: 8,
    boucle: true,
    auto: false,
    libelle: "Défilement du temps",
    rappel: (t) => {
      t0 = t;
      recalculer();
    },
  });
  if (lecteur) ressources.push(lecteur);
  recalculer();
}

/* --------------------------------------------------------------------------
   E. Amplificateur d'instrumentation vivant : curseurs et potentiels
   -------------------------------------------------------------------------- */

const RG_VALEURS = [49.9, 499, 4990, 49900];
const RAIL = 13.5;

function construireIna(racine, api) {
  const conteneur = racine.querySelector("#e-ina-vivant");
  if (!conteneur) return;
  const champs = {};
  for (const el of conteneur.querySelectorAll("text[data-v]")) champs[el.getAttribute("data-v")] = el;
  const etat = { vmc: 0, vd: 10, rg: 1, ref: 0 };

  const valeurs = api.sim.valeurs("#e-ina-valeurs", [
    { id: "g", libelle: "Gain G1 = 1 + 49,4 kΩ / RG", format: (v) => v },
    { id: "ig", libelle: "Courant dans RG", format: (v) => v },
    { id: "o", libelle: "Sorties O1 et O2 de l'étage d'entrée", format: (v) => v },
    { id: "vs", libelle: "Sortie obtenue et sortie attendue", format: (v) => v },
    { id: "etat", libelle: "État", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function borne(v) {
    return Math.max(-RAIL, Math.min(RAIL, v));
  }

  function ecrire(id, contenu) {
    if (champs[id]) champs[id].textContent = contenu;
  }

  function recalculer() {
    const rg = RG_VALEURS[etat.rg];
    const g1 = 1 + 49400 / rg;
    const vd = etat.vd * 1e-3;
    const vp = etat.vmc + vd / 2;
    const vm = etat.vmc - vd / 2;
    const o1 = etat.vmc + (g1 * vd) / 2;
    const o2 = etat.vmc - (g1 * vd) / 2;
    const o1b = borne(o1);
    const o2b = borne(o2);
    const ideal = g1 * vd + etat.ref;
    const vs = borne(o1b - o2b + etat.ref);
    const satEntree = Math.abs(vp) > RAIL || Math.abs(vm) > RAIL;
    const satInterne = o1 !== o1b || o2 !== o2b;
    const satSortie = Math.abs(o1b - o2b + etat.ref) > RAIL;
    let message = "linéaire, sortie valable";
    if (satEntree) message = "ENTRÉES HORS PLAGE, sortie fausse";
    else if (satInterne) message = "SATURATION INTERNE, sortie fausse";
    else if (satSortie) message = "SORTIE SATURÉE, sortie fausse";
    const ig = vd / rg;
    ecrire("vp", "V+ = " + nb(api, vp, 3) + " V");
    ecrire("vm", "V- = " + nb(api, vm, 3) + " V");
    ecrire("j1", nb(api, borne(vp), 3) + " V");
    ecrire("j2", nb(api, borne(vm), 3) + " V");
    ecrire("ig", "iG = " + (Math.abs(ig) >= 1e-3 ? signe(api, ig * 1e3, 2) + " mA" : signe(api, ig * 1e6, 2) + " µA"));
    ecrire("o1", nb(api, o1b, 3) + " V" + (o1 !== o1b ? " borné" : ""));
    ecrire("o2", nb(api, o2b, 3) + " V" + (o2 !== o2b ? " borné" : ""));
    ecrire("vs", "vs = " + nb(api, vs, 3) + " V");
    ecrire("ref", nb(api, etat.ref, 1) + " V");
    ecrire("etat", message);
    if (valeurs) {
      valeurs.maj({
        g: nb(api, g1, 2) + " avec RG = " + (rg >= 1000 ? nb(api, rg / 1000, 2) + " kΩ" : nb(api, rg, 1) + " Ω"),
        ig: Math.abs(ig) >= 1e-3 ? signe(api, ig * 1e3, 3) + " mA" : signe(api, ig * 1e6, 3) + " µA",
        o: nb(api, o1, 3) + " V et " + nb(api, o2, 3) + " V demandés, excursion ±13,5 V",
        vs: nb(api, vs, 3) + " V obtenus, " + nb(api, ideal, 3) + " V attendus",
        etat: message,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-ina-curseurs",
    [
      { id: "vmc", libelle: "Mode commun V_mc", min: -12, max: 12, pas: 0.5, valeur: etat.vmc, unite: "V", chiffres: 1 },
      { id: "vd", libelle: "Tension différentielle V_d", min: -20, max: 20, pas: 0.5, valeur: etat.vd, unite: "mV", chiffres: 1 },
      { id: "rg", libelle: "Résistance de gain RG", min: 0, max: 3, pas: 1, valeur: etat.rg, format: (v) => ["49,9 Ω", "499 Ω", "4,99 kΩ", "49,9 kΩ"][Math.round(v)] },
      { id: "ref", libelle: "Tension de la borne Réf", min: -5, max: 5, pas: 0.5, valeur: etat.ref, unite: "V", chiffres: 1 },
    ],
    (v) => {
      etat.vmc = v.vmc;
      etat.vd = v.vd;
      etat.rg = Math.round(v.rg);
      etat.ref = v.ref;
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);
  recalculer();
}

/* --------------------------------------------------------------------------
   E. Filtre : curseurs, Bode, tracé temporel, valeurs
   -------------------------------------------------------------------------- */

const FILTRES = [
  { nom: "premier ordre", q: 0 },
  { nom: "second ordre, Q = 0,5", q: 0.5 },
  { nom: "Butterworth, Q = 0,707", q: Math.SQRT1_2 },
  { nom: "second ordre, Q = 1", q: 1 },
];

function construireFiltre(racine, api) {
  if (!racine.querySelector("#e-filtre-trace")) return;
  const etat = { type: 2, fc: 5, fv: 8 };
  let tEtab = NaN;

  const valeurs = api.sim.valeurs("#e-filtre-valeurs", [
    { id: "a50", libelle: "Atténuation à 50 Hz", format: (v) => v },
    { id: "av", libelle: "Atténuation à la fréquence de vibration", format: (v) => v },
    { id: "dep", libelle: "Dépassement de la réponse à l'échelon", format: (v) => v },
    { id: "etab", libelle: "Établissement à ±0,1 %", format: (v) => v },
    { id: "res", libelle: "Ondulation résiduelle à 50 Hz en sortie", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const bode = api.sim.bode("#e-filtre-bode", {
    titre: "Réponse fréquentielle du filtre choisi",
    fMin: 0.1,
    fMax: 1000,
    gainMin: -80,
    gainMax: 10,
    fonction: (f) => gainFiltre(f, etat.fc, FILTRES[etat.type].q),
    coupure: etat.fc,
  });
  if (bode) ressources.push(bode);

  const T0 = 0.1;
  const trace = api.sim.traceur("#e-filtre-trace", {
    titre: "Arrivée d'une palette : entrée et sortie du filtre",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "mesure relative",
    yUnite: "",
    xMin: 0,
    xMax: 2,
    yMin: -0.35,
    yMax: 1.6,
    ratio: 0.42,
    series: [
      { id: "e", nom: "entrée du filtre" },
      { id: "s", nom: "sortie du filtre" },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 1.001, "", [1, 3]);
      ligneH(c, r, couleurs, 0.999, "±0,1 %", [1, 3]);
      if (Number.isFinite(tEtab)) ligneV(c, r, couleurs, T0 + tEtab, [7, 5], "établi à " + nb(api, tEtab, 2) + " s", true);
    },
  });
  if (trace) ressources.push(trace);

  function entree(t) {
    if (t < T0) return 0;
    const u = t - T0;
    return 1 + 0.3 * Math.exp(-u / 0.4) * Math.sin(2 * Math.PI * etat.fv * u) + 0.2 * Math.sin(2 * Math.PI * 50 * u);
  }

  function recalculer() {
    const q = FILTRES[etat.type].q;
    const sortie = simulerFiltre(entree, etat.fc, q);
    const echelon = simulerFiltre((t) => (t < T0 ? 0 : 1), etat.fc, q, 6);
    let dernier = 0;
    let max = 0;
    for (const [t, y] of echelon) {
      if (t < T0) continue;
      if (y > max) max = y;
      if (Math.abs(y - 1) > 1e-3) dernier = t;
    }
    tEtab = dernier - T0;
    if (trace) {
      const pasE = [];
      for (let k = 0; k <= 1600; k += 1) {
        const t = (2 * k) / 1600;
        pasE.push([t, entree(t)]);
      }
      trace.definirDonnees("e", pasE);
      trace.definirDonnees("s", sortie.filter((_, i) => i % 5 === 0));
    }
    if (bode) {
      bode.definirFonction((f) => gainFiltre(f, etat.fc, q));
      bode.definirCoupure(etat.fc);
    }
    if (valeurs) {
      const a50 = moduleGain(50, etat.fc, q);
      const av = moduleGain(etat.fv, etat.fc, q);
      valeurs.maj({
        a50: nb(api, 20 * Math.log10(a50), 1) + " dB, facteur " + nb(api, 1 / a50, 0),
        av: nb(api, 20 * Math.log10(av), 1) + " dB à " + nb(api, etat.fv, 1) + " Hz",
        dep: nb(api, Math.max(0, (max - 1) * 100), 1) + " %",
        etab: nb(api, tEtab, 3) + " s après l'échelon",
        res: nb(api, 0.2 * a50 * 100, 3) + " % de la mesure, crête",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-filtre-curseurs",
    [
      { id: "type", libelle: "Type de filtre", min: 0, max: 3, pas: 1, valeur: etat.type, format: (v) => FILTRES[Math.round(v)].nom },
      { id: "fc", libelle: "Fréquence de coupure f0", min: 0.5, max: 20, pas: 0.5, valeur: etat.fc, unite: "Hz", chiffres: 1 },
      { id: "fv", libelle: "Fréquence de la vibration du tablier", min: 3, max: 20, pas: 0.5, valeur: etat.fv, unite: "Hz", chiffres: 1 },
    ],
    (v) => {
      etat.type = Math.round(v.type);
      etat.fc = v.fc;
      etat.fv = v.fv;
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);
  recalculer();
}

/* --------------------------------------------------------------------------
   H. Budget d'erreur
   -------------------------------------------------------------------------- */

function construireBudget(racine, api) {
  if (!racine.querySelector("#h-budget-barres")) return;
  const barres = api.sim.spectre("#h-budget-barres", {
    titre: "Contributions d'erreur maximales, palette de 1500 kg nets",
    genre: "Budget d'erreur",
    description: "Erreur maximale par contribution, en kilogrammes",
    yTitre: "erreur maximale",
    unite: "kg",
    xTitre: "contribution",
    barres: [
      { etiquette: "zéro", valeur: 7.5 },
      { etiquette: "câble", valeur: 4.49 },
      { etiquette: "gain", valeur: 1.88 },
      { etiquette: "capteurs", valeur: 0.8 },
      { etiquette: "réf.", valeur: 0.38 },
      { etiquette: "quantif.", valeur: 0.31 },
      { etiquette: "50 Hz", valeur: 0.08 },
    ],
  });
  if (barres) ressources.push(barres);
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/** Câble d'excitation en quatre fils et en six fils, pour le diagnostic. */
function dessinSixFils(id) {
  let d = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.6">';
  for (const y0 of [20, 150]) {
    d += '<rect x="20" y="' + (y0 + 10) + '" width="110" height="90" rx="8"/>';
    d += '<rect x="520" y="' + (y0 + 10) + '" width="120" height="90" rx="8"/>';
    d += '<path d="M130 ' + (y0 + 26) + "H520M130 " + (y0 + 94) + 'H520"/>';
    d += resistance(260, y0 + 26, 380, y0 + 26, 50, 12) + resistance(260, y0 + 94, 380, y0 + 94, 50, 12);
  }
  d += '<path d="M100 186V176H470V176M100 236V246H470" stroke-dasharray="5 4"/>';
  d += '<path d="M470 176V168H520M470 246V228H520" stroke-dasharray="5 4"/>';
  d += '<path d="M200 36H240" marker-end="url(#' + id + ')" stroke-width="1.2"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  d += texte(30, 52, "pont") + texte(30, 68, "87,5 Ω") + texte(530, 52, "source 5 V") + texte(530, 68, "aux bornes");
  d += texte(530, 84, "de la source") + texte(250, 16, "4 fils : boucle 8,26 Ω en série") + texte(280, 84, "fils d'excitation, 60 m");
  d += texte(30, 182, "pont") + texte(30, 198, "87,5 Ω") + texte(530, 182, "source réglée") + texte(530, 198, "sur Sen+ et Sen-");
  d += texte(150, 206, "lignes de détection, sans courant, tirets") + texte(250, 146, "6 fils : la chute du câble est compensée");
  d += texte(20, 284, "Une variation de 20 K du hall change la boucle de 0,65 Ω : 0,68 % du gain en 4 fils, rien en 6 fils.");
  d += "</g>";
  return d;
}

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : quart de pont */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-quart",
      titre: "Sortie d'un quart de pont",
      niveau: "fondamental",
      enonce:
        "<p>Une jauge de $350\\ \\Omega$, de facteur de jauge $K = 2$, montée en quart de pont avec trois résistances de $350\\ \\Omega$, subit une déformation de $800\\ \\mathrm{\\mu m/m}$. Le pont est alimenté sous $5\\ \\mathrm{V}$. Quelle tension différentielle sort du pont, en millivolts ? La correction compare la formule approchée et la formule exacte.</p>",
      valeur: ((5 * 0.0016) / (2 * (2 + 0.0016))) * 1000,
      unite: "mV",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "V_s",
      etapes: [
        { texte: "$x = K\\varepsilon = 2 \\times 800 \\times 10^{-6} = 1{,}6 \\times 10^{-3}$." },
        { texte: "Approximation : $V_s \\approx V_a x/4 = 5 \\times 1{,}6 \\times 10^{-3}/4 = 2{,}000\\ \\mathrm{mV}$." },
        { texte: "Exact : $V_s = V_a x/\\left(2(2 + x)\\right) = 8 \\times 10^{-3}/4{,}0032 = 1{,}9984\\ \\mathrm{mV}$, soit $-0{,}08\\ \\%$.", note: "L'écart relatif $-x/2$ reste négligeable devant la tolérance d'une jauge, mais il est systématique et grandit avec la déformation." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Quart de pont sous 5 V : formule exacte et droite",
          xTitre: "déformation",
          xUnite: "µm/m",
          yTitre: "V_s",
          yUnite: "mV",
          xMin: 0,
          xMax: 20000,
          yMin: 0,
          yMax: 52,
          series: [
            { id: "e", nom: "exacte V_a x / (2(2 + x))", fonction: (e) => ((5 * 2 * e * 1e-6) / (2 * (2 + 2 * e * 1e-6))) * 1000 },
            { id: "a", nom: "droite V_a x / 4", fonction: (e) => ((5 * 2 * e * 1e-6) / 4) * 1000 },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneV(c, r, couleurs, 800, [2, 4], "800 µm/m");
          },
        });
      },
    })
  );

  /* Fondamental 2 : résistance de gain */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-rg",
      titre: "Résistance de gain d'un amplificateur d'instrumentation",
      niveau: "fondamental",
      enonce:
        "<p>Un amplificateur d'instrumentation a pour gain $G = 1 + 49{,}4\\ \\mathrm{k\\Omega}/R_G$. Quelle résistance $R_G$ donne un gain de $250$, en ohms ?</p>",
      valeur: 49400 / 249,
      unite: "Ω",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "R_G",
      etapes: [
        { texte: "$G - 1 = 49{,}4\\ \\mathrm{k\\Omega}/R_G$, donc $R_G = 49\\,400/(G - 1)$." },
        { texte: "$R_G = 49\\,400/249 = 198{,}4\\ \\Omega$." },
        { texte: "Valeur normalisée E96 la plus proche : $196\\ \\Omega$, soit $G = 253{,}0$, ou $200\\ \\Omega$, soit $G = 248{,}0$ ; l'écart se corrige à l'étalonnage.", note: "Choisir une résistance à faible coefficient de température : sa dérive devient directement une dérive de gain." },
      ],
      visuelCorrection: correctionEtapes(
        ["G = 1 + 49,4 kΩ / RG", "RG = 49 400 / (250 - 1) = 198,4 Ω", "E96 : 196 Ω, G = 253,0 ; 200 Ω, G = 248,0"],
        "Une seule résistance fixe le gain."
      ),
    })
  );

  /* Intermédiaire 1 : TRMC d'un soustracteur */
  const k3 = soustracteur(10, 0.001, 0);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-soustracteur",
      titre: "Erreur de mode commun d'un soustracteur",
      niveau: "intermédiaire",
      enonce:
        "<p>Un soustracteur de gain nominal $10$ lit un pont dont le mode commun vaut $2{,}5\\ \\mathrm{V}$. Ses quatre résistances ont une tolérance de $0{,}1\\ \\%$, dans le cas le plus défavorable. Quelle tension d'erreur apparaît à sa sortie à cause du mode commun, en millivolts ? La correction ramène cette erreur à l'entrée.</p>",
      valeur: Math.abs(k3.acm) * 2.5 * 1000,
      unite: "mV",
      tolerance: 0.02,
      chiffres: 4,
      libelleChamp: "Erreur en sortie",
      etapes: [
        { texte: "Cas défavorable : $A_{mc} \\approx 4tG/(1 + G) = 4 \\times 0{,}001 \\times 10/11 = 3{,}64 \\times 10^{-3}$ ; le calcul exact donne $3{,}63 \\times 10^{-3}$." },
        { texte: "Erreur en sortie : $2{,}5 \\times 3{,}63 \\times 10^{-3} = 9{,}07\\ \\mathrm{mV}$." },
        { texte: "Ramenée à l'entrée : $9{,}07/10 = 0{,}91\\ \\mathrm{mV}$, soit $15\\ \\%$ des $6{,}25\\ \\mathrm{mV}$ de pleine échelle de l'exemple résolu. TRMC : $2750$, soit $68{,}8\\ \\mathrm{dB}$.", note: "La partie continue se tare, mais toute variation du mode commun, excitation ou parasites, devient une erreur de mesure." },
      ],
      visuelCorrection: correctionEtapes(
        ["Acm ≈ 4 t G / (1 + G) = 4 × 0,001 × 10 / 11 = 3,64 × 10⁻³", "erreur en sortie : 2,5 V × 3,63 × 10⁻³ = 9,07 mV", "ramenée à l'entrée : 0,91 mV, 15 % de 6,25 mV", "TRMC = (1 + G) / (4 t) = 2750, soit 68,8 dB"],
        "Le soustracteur discret et l'appariement de ses résistances."
      ),
    })
  );

  /* Intermédiaire 2 : premier ou second ordre */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-ordre",
      titre: "Premier ordre ou second ordre",
      niveau: "intermédiaire",
      enonce:
        "<p>Le $50\\ \\mathrm{Hz}$ doit être atténué d'au moins $40\\ \\mathrm{dB}$. Un second ordre de Butterworth coupé à $5\\ \\mathrm{Hz}$ y parvient. Quelle fréquence de coupure faudrait-il à un simple premier ordre pour obtenir la même atténuation, en hertz ? La correction compare les temps d'établissement à $0{,}1\\ \\%$.</p>",
      valeur: 50 / Math.sqrt(1e4 - 1),
      unite: "Hz",
      tolerance: 0.02,
      chiffres: 4,
      libelleChamp: "Coupure f_c",
      etapes: [
        { texte: "Premier ordre : $|H| = 1/\\sqrt{1 + (f/f_c)^2}$ ; $40\\ \\mathrm{dB}$ imposent $|H| = 0{,}01$, donc $1 + (50/f_c)^2 = 10^4$." },
        { texte: "$f_c = 50/\\sqrt{9999} = 0{,}500\\ \\mathrm{Hz}$." },
        { texte: "Établissement à $0{,}1\\ \\%$ : $\\ln(1000)/(2\\pi f_c) = 6{,}91/3{,}14 = 2{,}2\\ \\mathrm{s}$ pour le premier ordre, contre $0{,}33\\ \\mathrm{s}$ pour le Butterworth à $5\\ \\mathrm{Hz}$.", note: "Le premier ordre ne tiendrait pas les $2\\ \\mathrm{s}$ de stabilisation : la méthode se choisit par le compromis, pas par la seule atténuation." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Gain des deux filtres en fonction du logarithme de la fréquence",
          xTitre: "log10(f / 1 Hz)",
          xUnite: "",
          yTitre: "gain",
          yUnite: "dB",
          xMin: -1,
          xMax: 3,
          yMin: -80,
          yMax: 5,
          series: [
            { id: "p", nom: "premier ordre, 0,5 Hz", fonction: (l) => 20 * Math.log10(moduleGain(Math.pow(10, l), 0.5, 0)) },
            { id: "b", nom: "Butterworth, 5 Hz", fonction: (l) => 20 * Math.log10(moduleGain(Math.pow(10, l), 5, Math.SQRT1_2)) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneV(c, r, couleurs, Math.log10(50), [2, 4], "50 Hz");
            ligneH(c, r, couleurs, -40, "-40 dB", [7, 5], true);
          },
        });
      },
    })
  );

  /* Avancé : excitation sous deux contraintes */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-excitation",
      titre: "Excitation maximale sous deux contraintes",
      niveau: "avancé",
      enonce:
        "<p>Quatre ponts complets de $350\\ \\Omega$ sont câblés en parallèle. Le constructeur limite la puissance dissipée dans chaque jauge à $25\\ \\mathrm{mW}$ ; la source d'excitation fournit au plus $60\\ \\mathrm{mA}$. Quelle est la tension d'excitation maximale admissible, en volts ? La correction en déduit le choix final et la pleine échelle.</p>",
      valeur: 5.25,
      unite: "V",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "V_a maximale",
      etapes: [
        { texte: "Jauge : chaque bras voit $V_a/2$, d'où $P = (V_a/2)^2/R \\leq 25\\ \\mathrm{mW}$, soit $V_a \\leq 2\\sqrt{0{,}025 \\times 350} = 5{,}92\\ \\mathrm{V}$." },
        { texte: "Source : quatre ponts en parallèle font $87{,}5\\ \\Omega$, d'où $V_a \\leq 0{,}060 \\times 87{,}5 = 5{,}25\\ \\mathrm{V}$." },
        { texte: "La contrainte la plus sévère l'emporte : $5{,}25\\ \\mathrm{V}$. On retient $5{,}00\\ \\mathrm{V}$, valeur de référence courante avec $5\\ \\%$ de marge." },
        { texte: "À $2\\ \\mathrm{mV/V}$ : $10\\ \\mathrm{mV}$ à la charge nominale totale ; une excitation plus faible réduit l'échauffement et la dérive, mais aussi le signal face au décalage de l'amplificateur.", note: "C'est le compromis central : chaque volt d'excitation gagné améliore le rapport signal sur décalage, au prix de l'échauffement et du courant." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Deux limites sur l'excitation",
          xTitre: "excitation V_a",
          xUnite: "V",
          yTitre: "fraction de la limite",
          yUnite: "",
          xMin: 0,
          xMax: 8,
          yMin: 0,
          yMax: 1.8,
          series: [
            { id: "p", nom: "puissance par jauge / 25 mW", fonction: (v) => ((v / 2) ** 2 / 350) / 0.025 },
            { id: "i", nom: "courant / 60 mA", fonction: (v) => v / 87.5 / 0.06 },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 1, "limite", [1, 3], true);
            ligneV(c, r, couleurs, 5.25, [7, 5], "5,25 V", true);
            ligneV(c, r, couleurs, 5.92, [2, 4], "5,92 V");
          },
        });
      },
    })
  );

  /* Diagnostic industriel */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-cable",
      titre: "Une pesée qui suit la température du hall",
      niveau: "diagnostic",
      enonce:
        "<p>Sur un autre site, une station de pesée identique est reliée au conditionneur par $60\\ \\mathrm{m}$ de câble à quatre conducteurs de $0{,}25\\ \\mathrm{mm^2}$, sans lignes de détection, posé le long d'un mur exposé au soleil. Le matin, une palette étalon de $1500\\ \\mathrm{kg}$ est pesée juste ; l'après-midi, le hall ayant gagné $20\\ \\mathrm{K}$, elle pèse $10\\ \\mathrm{kg}$ de moins. Le zéro, station vide, reste stable à $1\\ \\mathrm{kg}$ près, et la température de l'armoire n'a presque pas changé. Quelles affirmations sont exactes ?</p>",
      options: [
        { texte: "La résistance des fils d'excitation augmente avec la température et réduit la tension appliquée au pont : erreur de gain d'environ $0{,}7\\ \\%$.", juste: true },
        { texte: "La dérive de décalage de l'amplificateur d'instrumentation explique l'écart." },
        { texte: "Un montage six fils, avec une source réglée sur les lignes de détection, ou une mesure ratiométrique de l'excitation à la boîte de jonction, supprime l'effet.", juste: true },
        { texte: "Abaisser la coupure du filtre passe-bas réduira l'écart." },
        { texte: "Une erreur proportionnelle à la charge, avec un zéro stable, désigne le gain de la chaîne et non son décalage.", juste: true },
      ],
      etapes: [
        { texte: "Chaque fil : $1{,}72 \\times 10^{-8} \\times 60/0{,}25 \\times 10^{-6} = 4{,}13\\ \\Omega$ ; boucle d'excitation : $8{,}26\\ \\Omega$ en série avec $87{,}5\\ \\Omega$." },
        { texte: "$+20\\ \\mathrm{K}$ : $\\Delta R = 8{,}26 \\times 3{,}93 \\times 10^{-3} \\times 20 = 0{,}65\\ \\Omega$, soit $0{,}65/95{,}8 = 0{,}68\\ \\%$ de tension en moins sur le pont, $10{,}2\\ \\mathrm{kg}$ sur $1500\\ \\mathrm{kg}$." },
        { texte: "Un décalage donnerait la même erreur à vide et en charge, et suivrait la température de l'armoire ; ici le zéro est stable et l'erreur proportionnelle à la charge." },
        { texte: "Le filtre agit sur les variations rapides, pas sur une erreur de gain lente.", note: "Le six fils est la réponse standard ; à défaut, raccourcir le câble ou augmenter sa section réduit l'effet sans le supprimer." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(moteur, conteneur, "0 0 680 296", dessinSixFils("k6-fl"), "En haut, quatre fils : la boucle d'excitation est en série avec le pont. En bas, six fils : la source se règle sur la tension mesurée aux bornes du pont.");
      },
    })
  );

  /* Question conceptuelle */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-ina",
      titre: "Pourquoi trois amplificateurs plutôt qu'un",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi un amplificateur d'instrumentation à trois AOP convient mieux qu'un soustracteur à un seul AOP pour lire un pont de jauges, alors que son étage de sortie est lui-même un soustracteur.</p>",
      motsCles: [
        ["impedance", "courant", "charge", "haute"],
        ["mode commun", "gain 1", "gain unitaire", "transport", "recopie"],
        ["rg", "une seule resistance", "reglage du gain"],
        ["apparie", "ajust", "integre", "laser", "garanti"],
      ],
      minimum: 3,
      exemple: "Trois ou quatre phrases : impédance d'entrée, sort du mode commun dans l'étage d'entrée, réglage du gain, appariement intégré.",
      visuelCorrection: correctionEtapes(
        [
          "entrées sur les bornes + de A1 et A2 : aucun courant, le pont n'est pas chargé",
          "étage d'entrée : Vd amplifiée par G1, mode commun transmis avec un gain 1",
          "A3 reçoit un rapport signal / mode commun déjà multiplié par G1",
          "gain réglé par RG seule, sans toucher aux Rd appariées au laser",
        ],
        "Ce que l'étage d'entrée apporte au soustracteur."
      ),
      etapes: [
        { texte: "Les entrées attaquent les entrées non inverseuses de A1 et A2 : impédance de plusieurs gigaohms, le pont n'est pas chargé et sa résistance de source ne déséquilibre rien." },
        { texte: "L'étage d'entrée amplifie la différence de $G_1$ et transmet le mode commun avec un gain $1$ : le soustracteur de sortie reçoit un signal déjà dominant, d'où un TRMC global voisin de $G_1$ fois le sien." },
        { texte: "Le gain se règle par la seule $R_G$ ; les quatre $R_d$, intégrées et ajustées, gardent leur appariement, garanti par le constructeur.", note: "Limite : les nœuds internes portent $V_{mc} \\pm G_1V_d/2$ et peuvent saturer." },
      ],
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

/** Amplificateur d'instrumentation simplifié pour la question de schéma. */
function dessinInaQuiz() {
  let d = TRAITS + ' stroke-width="1.5">';
  d += '<path d="M120 30L180 60L120 90Z"/><path d="M120 150L180 180L120 210Z"/><path d="M400 90L460 120L400 150Z"/>';
  d += '<path d="M30 45H120M30 195H120"/>';
  d += '<path d="M120 75H100V100M120 165H100V140"/>';
  d += resistance(100, 100, 100, 140, 26, 12);
  d += '<path d="M100 100H140"/>' + resistance(140, 100, 200, 100, 30, 12) + '<path d="M200 100V60M180 60H200"/>';
  d += '<path d="M100 140H140"/>' + resistance(140, 140, 200, 140, 30, 12) + '<path d="M200 140V180M180 180H200"/>';
  d += '<path d="M200 60H250V105"/>' + resistance(250, 105, 360, 105, 34, 12) + '<path d="M360 105H400"/>';
  d += '<path d="M200 180H250V135"/>' + resistance(250, 135, 360, 135, 34, 12) + '<path d="M360 135H400"/>';
  d += resistance(360, 105, 360, 40, 30, 12);
  d += resistance(360, 135, 360, 200, 30, 12) + '<path d="M360 200H490V120M460 120H530"/>';
  d += '<circle cx="360" cy="36" r="4"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  d += texte(10, 40, "V+") + texte(10, 190, "V-") + texte(370, 30, "Réf") + texte(510, 112, "vs");
  d += texte(140, 64, "A1") + texte(140, 184, "A2") + texte(420, 124, "A3");
  d += "</g>";
  return d;
}

const VISUELS_QUIZ = [
  etapes(["gain infini et contre-réaction négative : v+ = v-", "courants d'entrée nuls", "valable seulement hors saturation"], "Les deux règles de l'AOP idéal."),
  etapes(["quart de pont : Vs ≈ Va x / 4", "pont complet : Vs = Va x", "rapport 4 à jauges identiques"], "Nombre de jauges actives et sensibilité."),
  etapes(["G = 1 + R2 / R1", "= 1 + 47 / 1", "= 48"], "Gain d'un non inverseur."),
  etapes(["chaque point milieu ≈ Va / 2", "pont complet sous 5 V : 2,5 V de mode commun", "1000 fois le signal de pleine échelle"], "Mode commun d'un pont."),
  etapes(["G = 1 + 49,4 kΩ / RG", "= 1 + 49 400 / 1000", "= 50,4"], "Gain fixé par RG."),
  etapes(["RG relie les nœuds J1 et J2 entre A1 et A2", "Vd est recopiée à ses bornes : iG = Vd / RG", "G1 = 1 + 2R / RG"], "La résistance de gain."),
  etapes(["bande passante ≈ GBW / G", "= 1 MHz / 100", "= 10 kHz"], "Produit gain-bande."),
  etapes(["50 Hz échantillonné trop lentement : repliement", "la composante repliée tombe dans la bande utile", "filtrer avant la conversion"], "Filtre anti-repliement."),
  etapes(["erreur ramenée à l'entrée = Vmc / TRMC", "100 dB : TRMC = 10⁵", "2,5 V / 10⁵ = 25 µV"], "Mode commun et TRMC."),
  etapes(["six fils : la source se règle sur Sen+ et Sen-", "ratiométrique : la référence du convertisseur est Va", "dans les deux cas, la résistance du câble ne compte plus"], "Câble et excitation."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Pour un AOP idéal en contre-réaction négative, non saturé, quelles affirmations sont exactes ?</p>",
        options: [
          { texte: "Les potentiels des deux entrées sont égaux.", juste: true },
          { texte: "Les entrées ne prélèvent aucun courant.", juste: true },
          { texte: "La sortie est toujours nulle." },
          { texte: "Le gain du montage dépend du gain en boucle ouverte de l'AOP." },
        ],
        multiple: true,
        explication: "$v_+ = v_-$ découle du gain infini, les courants d'entrée sont nuls par hypothèse ; le gain du montage ne dépend que des résistances.",
        resume: "AOP idéal",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>À jauges, excitation et déformation identiques, un pont complet donne quatre fois plus de signal qu'un quart de pont.</p>",
        reponse: true,
        explication: "$V_s = V_a x$ pour le pont complet, environ $V_a x/4$ pour le quart de pont.",
        resume: "Sensibilité des ponts",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Gain d'un amplificateur non inverseur avec $R_2 = 47\\ \\mathrm{k\\Omega}$ et $R_1 = 1\\ \\mathrm{k\\Omega}$ ?</p>",
        valeur: 48,
        unite: "",
        tolerance: 0.01,
        explication: "$G = 1 + R_2/R_1 = 48$.",
        resume: "Non inverseur",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Que vaut, à peu près, le potentiel de chacun des points milieux d'un pont complet alimenté sous $V_a$, par rapport au $0\\ \\mathrm{V}$ d'excitation ?</p>",
        motsCles: [["va/2", "va / 2", "moitie", "demi", "2,5", "2.5"]],
        minimum: 1,
        explication: "Environ $V_a/2$ : c'est le mode commun, $2{,}5\\ \\mathrm{V}$ sous $5\\ \\mathrm{V}$, sur lequel le signal ne représente que quelques millivolts.",
        resume: "Mode commun d'un pont",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Gain d'un amplificateur d'instrumentation de relation $G = 1 + 49{,}4\\ \\mathrm{k\\Omega}/R_G$ avec $R_G = 1\\ \\mathrm{k\\Omega}$ ?</p>",
        valeur: 50.4,
        unite: "",
        tolerance: 0.01,
        explication: "$G = 1 + 49{,}4 = 50{,}4$.",
        resume: "Résistance de gain",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Sur ce schéma simplifié d'amplificateur d'instrumentation, quelle résistance fixe le gain ?</p>",
        consigne: "Cliquez sur la résistance de gain.",
        viewBox: "0 0 560 230",
        dessin: dessinInaQuiz(),
        zones: [
          { x: 86, y: 104, largeur: 28, hauteur: 32, etiquette: "résistance entre A1 et A2", juste: true },
          { x: 150, y: 88, largeur: 40, hauteur: 24, etiquette: "contre-réaction de A1" },
          { x: 286, y: 92, largeur: 48, hauteur: 26, etiquette: "résistance d'entrée de A3" },
          { x: 346, y: 52, largeur: 28, hauteur: 42, etiquette: "résistance vers Réf" },
        ],
        explication: "La résistance verticale entre les entrées inverseuses de A1 et A2 est $R_G$ : la tension différentielle y est recopiée, et son courant fixe $G_1 = 1 + 2R/R_G$.",
        resume: "Lecture d'un schéma d'amplificateur d'instrumentation",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Un AOP de produit gain-bande $1\\ \\mathrm{MHz}$ est monté en non inverseur de gain $100$. Quelle est, à peu près, la bande passante du montage ?</p>",
        options: ["$1\\ \\mathrm{MHz}$", "$100\\ \\mathrm{kHz}$", "$10\\ \\mathrm{kHz}$", "$100\\ \\mathrm{Hz}$"],
        bonnes: [2],
        explication: "$f \\approx GBW/G = 10^6/100 = 10\\ \\mathrm{kHz}$.",
        resume: "Produit gain-bande",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Un filtre numérique dans l'automate suffit toujours à éliminer une perturbation à $50\\ \\mathrm{Hz}$, quelle que soit la période d'échantillonnage.</p>",
        reponse: false,
        explication: "Échantillonné trop lentement, le $50\\ \\mathrm{Hz}$ se replie en une fausse composante basse fréquence, indiscernable du signal : il faut un filtre analogique avant la conversion.",
        resume: "Repliement",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Un amplificateur d'instrumentation a un TRMC de $100\\ \\mathrm{dB}$ ; le mode commun vaut $2{,}5\\ \\mathrm{V}$. Erreur ramenée à l'entrée, en microvolts ?</p>",
        valeur: 25,
        unite: "µV",
        tolerance: 0.02,
        explication: "$2{,}5\\ \\mathrm{V}/10^5 = 25\\ \\mathrm{\\mu V}$, soit $10\\ \\mathrm{kg}$ pour la station étudiée, constants donc tarés.",
        resume: "TRMC",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Quelles solutions rendent la mesure d'un pont insensible à la résistance de son câble d'excitation ?</p>",
        options: [
          { texte: "Un montage six fils avec source réglée sur les lignes de détection.", juste: true },
          { texte: "Une mesure ratiométrique où la référence du convertisseur est la tension d'excitation mesurée au pont.", juste: true },
          { texte: "Un gain plus élevé de l'amplificateur d'instrumentation." },
          { texte: "Un filtre passe-bas de coupure plus basse." },
        ],
        multiple: true,
        explication: "Les deux premières mesurent la tension réellement appliquée au pont ; le gain et le filtre n'y changent rien.",
        resume: "Six fils et mesure ratiométrique",
      },
    ],
    { titre: "Quiz : dix questions" }
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
      { categorie: "Pont", question: "Sortie d'un pont à $n$ jauges actives ?", reponse: "$V_s \\approx nV_aK\\varepsilon/4$ ; exacte pour $n = 2$ et $4$ avec des jauges en $\\pm x$, approchée à $-x/2$ près en quart de pont." },
      { categorie: "Mode commun", question: "Mode commun d'un pont complet ?", reponse: "$V_a/2$ sur chaque sortie : $2{,}5\\ \\mathrm{V}$ sous $5\\ \\mathrm{V}$, pour quelques millivolts de signal." },
      { categorie: "Température", question: "Pourquoi un demi-pont compense-t-il la température ?", reponse: "Deux bras adjacents qui varient dans le même rapport ne changent pas le potentiel de leur point milieu : seule la sensibilité varie, d'un facteur $1 + \\beta\\Delta T$." },
      { categorie: "AOP idéal", question: "Les deux règles de l'AOP en contre-réaction ?", reponse: "$v_+ = v_-$ et courants d'entrée nuls, tant que la sortie n'est pas saturée." },
      { categorie: "Montages", question: "Gains de l'inverseur et du non inverseur ?", reponse: "$-R_2/R_1$ avec une impédance d'entrée $R_1$ ; $1 + R_2/R_1$ avec une impédance d'entrée très élevée." },
      { categorie: "Soustracteur", question: "TRMC d'un soustracteur à résistances de tolérance $t$ ?", reponse: "Environ $(1 + G)/(4t)$ : $34\\ \\mathrm{dB}$ à gain $1$ avec $1\\ \\%$ ; la résistance de source s'ajoute à $R_1$ et $R_3$." },
      { categorie: "Instrumentation", question: "Gain et nœuds internes d'un amplificateur d'instrumentation à trois AOP ?", reponse: "$G_1 = 1 + 2R/R_G$ ; $v_{O1,O2} = V_{mc} \\pm G_1V_d/2$, à garder dans l'excursion ; $v_s = G V_d + V_{\\text{réf}}$." },
      { categorie: "AOP réel", question: "Bande passante et balayage d'un étage de gain $G$ ?", reponse: "$f \\approx GBW/G$ ; $2\\pi f V_p \\leq SR$. Le décalage est multiplié par le gain de bruit." },
      { categorie: "Filtre", question: "Fréquence propre et $Q$ d'un Sallen et Key à gain unitaire, $R_1 = R_2 = R$ ?", reponse: "$f_0 = 1/(2\\pi R\\sqrt{C_1C_2})$, $Q = \\sqrt{C_1/C_2}/2$ ; Butterworth pour $C_1 = 2C_2$." },
      { categorie: "Budget", question: "Que corrige un étalonnage en deux points, et que ne corrige-t-il pas ?", reponse: "Il corrige le gain et le zéro au moment de l'étalonnage ; pas les dérives thermiques, le câble qui chauffe, la non-linéarité, le bruit ni la quantification." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["x = K ε = 2 × 250 × 10⁻⁶ = 5 × 10⁻⁴", "Vs = Va x = 10 × 5 × 10⁻⁴", "= 5 mV"], "Pont complet."),
  etapes(["TRMC ≈ (1 + G) / (4 t) = 2 / 0,04 = 50", "20 log10 50 = 34 dB", "2,5 V de mode commun : jusqu'à 50 mV d'erreur"], "Soustracteur à gain unitaire."),
  etapes(["second ordre : - 40 dB par décade", "à 10 f0 : |H| ≈ 1 / 100", "soit - 40 dB"], "Pente d'un second ordre."),
  etapes(["ΔR = K ε R", "= 2 × 1000 × 10⁻⁶ × 350", "= 0,7 Ω"], "Variation d'une jauge."),
  etapes(["thermocouple prolongé en cuivre :", "la soudure froide passe dans la tête", "la mesure suit la température de la tête"], "Câble de compensation."),
  etapes(["s³ + 2 s² + 3 s + K", "Routh : 2 × 3 > K et K > 0", "stable pour 0 < K < 6"], "Critère de Routh au troisième ordre."),
  etapes(["ns = 60 f / p = 60 × 50 / 2 = 1500 tr/min", "g = (1500 - 1440) / 1500", "= 0,04, soit 4 %"], "Glissement d'un moteur à quatre pôles."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Pont complet de jauges de facteur $2$, alimenté sous $10\\ \\mathrm{V}$, déformation $250\\ \\mathrm{\\mu m/m}$. Tension de sortie, en millivolts ?</p>",
        valeur: 5,
        unite: "mV",
        tolerance: 0.02,
        explication: "$V_s = V_aK\\varepsilon = 10 \\times 2 \\times 250 \\times 10^{-6} = 5\\ \\mathrm{mV}$.",
        resume: "Pont complet",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Un soustracteur de gain $1$ réalisé avec des résistances à $1\\ \\%$ peut n'offrir qu'environ $34\\ \\mathrm{dB}$ de réjection du mode commun.</p>",
        reponse: true,
        explication: "$(1 + G)/(4t) = 2/0{,}04 = 50$, soit $34\\ \\mathrm{dB}$ dans le cas le plus défavorable.",
        resume: "TRMC d'un soustracteur",
      },
      {
        type: "qcm",
        enonce: repere(2) + "<p>Cette séance. De combien un passe-bas du second ordre atténue-t-il un signal de fréquence dix fois supérieure à sa fréquence propre ?</p>",
        options: ["Environ $20\\ \\mathrm{dB}$", "Environ $40\\ \\mathrm{dB}$", "Environ $3\\ \\mathrm{dB}$", "Environ $60\\ \\mathrm{dB}$"],
        bonnes: [1],
        explication: "Au-delà de $f_0$, $|H| \\approx (f_0/f)^2$ : un facteur $100$ à $10f_0$, soit $40\\ \\mathrm{dB}$.",
        resume: "Second ordre",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours précédent. Une jauge de $350\\ \\Omega$, de facteur $2$, subit $1000\\ \\mathrm{\\mu m/m}$. Variation de résistance, en ohms ?</p>",
        valeur: 0.7,
        unite: "Ω",
        tolerance: 0.02,
        explication: "$\\Delta R = K\\varepsilon R = 2 \\times 10^{-3} \\times 350 = 0{,}7\\ \\Omega$, soit $0{,}2\\ \\%$.",
        resume: "Jauge de contrainte",
      },
      {
        type: "qcm",
        enonce: repere(4) + "<p>Cours précédent. Un thermocouple est prolongé en câble de cuivre de sa tête jusqu'au transmetteur, qui compense la soudure froide à son bornier. Que mesure-t-on ?</p>",
        options: [
          "La bonne température, le cuivre n'ayant pas d'effet",
          "Une température faussée, qui suit celle de la tête de sonde",
          "Une température doublée",
          "Rien, le circuit est ouvert",
        ],
        bonnes: [1],
        explication: "La jonction avec le cuivre, donc la soudure froide, se trouve dans la tête : la compensation au bornier corrige une autre température.",
        resume: "Soudure froide",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours vieux d'une semaine. Équation caractéristique $s^3 + 2s^2 + 3s + K = 0$. Valeur maximale de $K$ pour la stabilité ?</p>",
        valeur: 6,
        unite: "",
        tolerance: 0.01,
        explication: "Pour $s^3 + a_2s^2 + a_1s + a_0$, Routh exige des coefficients positifs et $a_2a_1 > a_0$ : $K < 6$.",
        resume: "Routh-Hurwitz",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours vieux d'un mois. Moteur asynchrone à quatre pôles sur réseau de $50\\ \\mathrm{Hz}$, vitesse $1440\\ \\mathrm{tr/min}$. Glissement, en pour cent ?</p>",
        valeur: 4,
        unite: "%",
        tolerance: 0.02,
        explication: "$n_s = 1500\\ \\mathrm{tr/min}$ ; $g = (1500 - 1440)/1500 = 4\\ \\%$.",
        resume: "Glissement",
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
    titre: "Où en suis-je sur le conditionnement analogique ?",
  });
  if (auto) ressources.push(auto);
}
