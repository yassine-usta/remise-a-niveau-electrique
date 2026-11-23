/* ==========================================================================
   cours/metrologie-electrique/cours.js
   Métrologie électrique : lectures d'un voltmètre simulé (justesse, fidélité,
   moyenne), somme de contributions rectangulaires et facteur d'élargissement,
   erreur relative selon la classe et la lecture, bilan interactif de la
   mesure de pression du site, exercices, quiz, cartes, révision et bilan.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const R3 = Math.sqrt(3);
const R12 = Math.sqrt(12);

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

function ligneV(c, repere, couleurs, x, motif = [1, 3], libelle) {
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
    c.fillText(libelle, px + (c.textAlign === "right" ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

/** Points hors de la fenêtre verticale masqués : la courbe est interrompue. */
function ecreter(points, yMin, yMax) {
  return points.map(([t, v]) => [t, Number.isFinite(v) && v >= yMin && v <= yMax ? v : NaN]);
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
   Calcul
   -------------------------------------------------------------------------- */

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function generateur(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n tirages normaux centrés réduits, par Box et Muller. */
function tiragesNormaux(n, graine) {
  const alea = generateur(graine);
  const z = [];
  while (z.length < n) {
    const u1 = Math.max(1e-12, alea());
    const u2 = alea();
    const r = Math.sqrt(-2 * Math.log(u1));
    z.push(r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2));
  }
  return z.slice(0, n);
}

/**
 * Loi de la somme d'erreurs rectangulaires indépendantes de demi-largeurs
 * données, en unités de la demi-largeur de référence, par convolution.
 * Renvoie { xs, ps } : abscisses et probabilités discrètes, de somme 1.
 */
function loiSomme(largeurs, h = 0.004) {
  let ps = null;
  for (const a of largeurs) {
    const n = Math.max(1, Math.round(a / h));
    const noyau = new Array(2 * n + 1).fill(1 / (2 * n + 1));
    if (!ps) {
      ps = noyau;
      continue;
    }
    const sortie = new Array(ps.length + noyau.length - 1).fill(0);
    for (let i = 0; i < ps.length; i += 1) {
      const pi = ps[i];
      if (!pi) continue;
      for (let j = 0; j < noyau.length; j += 1) sortie[i + j] += pi * noyau[j];
    }
    ps = sortie;
  }
  const L = (ps.length - 1) / 2;
  const xs = ps.map((_, i) => (i - L) * h);
  return { xs, ps, h };
}

/** Contributions du bilan de pression, en mbar, selon les réglages. */
function contributionsPression(r) {
  const PE = 10000;
  const etal = r.etal >= 0.5;
  return [
    etal
      ? { nom: "référence d'étalonnage", u: (0.0005 * PE) / R3 }
      : { nom: "transmetteur, erreur max.", u: ((r.tr / 100) * PE) / R3 },
    { nom: "température du transmetteur", u: (0.0015 * PE * (r.dT / 10)) / R3 },
    { nom: "dérive sur un an", u: (0.001 * PE) / R3 },
    etal
      ? { nom: "linéarité résiduelle", u: (0.0005 * PE) / R3 }
      : { nom: "entrée, erreur max.", u: ((r.mod / 100) * PE) / R3 },
    { nom: "quantification", u: PE / 2 ** r.bits / R12 },
    { nom: "gain du filtre", u: (4000 * (2.1 / 102.1) * 0.01) / R3 },
    { nom: "bruit, moyenne de 10", u: r.bruit / Math.sqrt(10) },
  ];
}

/* --------------------------------------------------------------------------
   Initialisation et nettoyage
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  detruire();
  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireCible(racine, api);
  construireSomme(racine, api);
  construireClasses(racine, api);
  construireBilan(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  ressources.push(
    api.reveler(racine.querySelectorAll(".formule-cle, .encadre, #f-comparatif, #e-statut-tableau, #h-budget, #i-budget"), { decalage: 0.05 })
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
    ["#e-quantif-figure svg", 2],
    ["#e-etalonnage-figure svg", 2],
    ["#h-montage-figure svg", 2.2],
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
  const valeursC1 = [10.02, 9.98, 10.01, 9.99];
  const sC1 = Math.sqrt(valeursC1.reduce((acc, v) => acc + (v - 10) ** 2, 0) / 3);

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c1-ecart-type",
      titre: "Écart-type expérimental de quatre lectures",
      niveau: "fondamental",
      enonce: "<p>Quatre lectures d'une tension donnent $10{,}02$, $9{,}98$, $10{,}01$ et $9{,}99\\ \\mathrm{V}$. Quel est leur écart-type expérimental $s$, en volts, avec le diviseur $n - 1$ ?</p>",
      valeur: sC1,
      unite: "V",
      tolerance: 0.02,
      chiffres: 4,
      libelleChamp: "Écart-type s",
      etapes: [
        { texte: "Moyenne : $(10{,}02 + 9{,}98 + 10{,}01 + 9{,}99)/4 = 10{,}00\\ \\mathrm{V}$." },
        { texte: "Écarts : $+0{,}02$, $-0{,}02$, $+0{,}01$, $-0{,}01$ ; somme des carrés : $0{,}0004 + 0{,}0004 + 0{,}0001 + 0{,}0001 = 0{,}0010\\ \\mathrm{V^2}$." },
        { texte: "$s = \\sqrt{0{,}0010/3} = 0{,}0183\\ \\mathrm{V}$.", note: "Avec le diviseur $n$, on trouverait $0{,}0158\\ \\mathrm{V}$ : le diviseur $n - 1$ compense l'usage de la moyenne calculée." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Les quatre lectures autour de leur moyenne",
          xTitre: "rang de la lecture",
          xUnite: "",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0.5,
          xMax: 4.5,
          yMin: 9.95,
          yMax: 10.05,
          series: [{ id: "l", nom: "lectures successives", points: valeursC1.map((v, i) => [i + 1, v]) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 10, "moyenne 10,00 V", [7, 5]);
            ligneH(c, r, couleurs, 10 + sC1, "+ s", [2, 4]);
            ligneH(c, r, couleurs, 10 - sC1, "- s", [2, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-derivee-log",
      titre: "Variation relative d'une puissance",
      niveau: "fondamental",
      enonce: "<p>La puissance dissipée dans une résistance vaut $P = U^2/R$. Si $U$ augmente de $1\\ \\%$ et que $R$ ne change pas, de combien de pour cent $P$ augmente-t-elle, au premier ordre ?</p>",
      valeur: 2,
      unite: "%",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Variation relative de P",
      etapes: [
        { texte: "Dérivée logarithmique : $dP/P = 2\\,dU/U - dR/R$." },
        { texte: "$dP/P = 2 \\times 1\\ \\% - 0 = 2\\ \\%$." },
        { texte: "Valeur exacte : $1{,}01^2 - 1 = 2{,}01\\ \\%$ ; l'écart est un terme du second ordre.", note: "C'est le mécanisme de la propagation des incertitudes relatives : l'exposant multiplie la variation relative." },
      ],
      visuelCorrection: correctionEtapes(
        ["P = U² / R", "dP/P = 2 dU/U - dR/R", "= 2 × 1 % - 0 = 2 % (exact : 2,01 %)"],
        "L'exposant multiplie la variation relative."
      ),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c3-arrondi",
      titre: "Deux chiffres significatifs",
      niveau: "fondamental",
      enonce: "<p>Arrondir $0{,}004871$ à deux chiffres significatifs.</p>",
      valeur: 0.0049,
      unite: "",
      tolerance: 0.001,
      chiffres: 4,
      libelleChamp: "Valeur arrondie",
      etapes: [
        { texte: "Les zéros de tête ne sont pas significatifs : les deux premiers chiffres significatifs sont $4$ et $8$." },
        { texte: "Le chiffre suivant, $7$, est supérieur ou égal à $5$ : on arrondit $48$ à $49$." },
        { texte: "Résultat : $0{,}0049$, soit $4{,}9 \\times 10^{-3}$.", note: "C'est la précision qu'on donne à une incertitude : un ou deux chiffres significatifs." },
      ],
      visuelCorrection: correctionEtapes(
        ["0,004871 : chiffres significatifs 4, 8, 7, 1", "garder 4 et 8, le suivant vaut 7 ≥ 5", "résultat : 0,0049 = 4,9 × 10⁻³"],
        "Arrondi à deux chiffres significatifs."
      ),
    })
  );
}

/* --------------------------------------------------------------------------
   D. Lectures d'un voltmètre simulé : poignée, curseur, lecteur
   -------------------------------------------------------------------------- */

function construireCible(racine, api) {
  const conteneur = racine.querySelector("#d-cible-vivant");
  if (!conteneur) return;
  const P = { x0: 60, x1: 680, vMin: 9.9, vMax: 10.1, base: 250, hMax: 120, rail: 336, nMax: 200 };
  const X = (v) => P.x0 + ((P.x1 - P.x0) * (v - P.vMin)) / (P.vMax - P.vMin);
  const z = tiragesNormaux(P.nMax, 64);
  const N0 = 20;
  const etat = { biais: 0.02, sigma: 0.01, n: N0 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 380",
    role: "img",
    "aria-label": "Lectures d'un voltmètre simulé autour de la valeur vraie de 10 volts : bande des lectures, histogramme, moyenne, intervalle moyenne plus ou moins deux s sur racine de n, et rail de réglage du décalage systématique",
  });
  const decor = svgEl("g");
  let d = "<defs>" + marqueur("d-ci-fl") + "</defs>" + TRAITS + ' stroke-width="1.3">';
  d += '<path d="M' + P.x0 + " " + P.base + "H" + (P.x1 + 16) + '" marker-end="url(#d-ci-fl)"/>';
  let grad = "";
  for (let i = 0; i <= 4; i += 1) grad += "M" + X(P.vMin + i * 0.05).toFixed(1) + " " + (P.base - 4) + "v8";
  d += '<path d="' + grad + '"/>';
  d += '<path d="M' + X(10).toFixed(1) + " 28V" + (P.base + 8) + '" stroke-dasharray="7 5" stroke-width="1.6"/>';
  d += '<path d="M' + X(9.95).toFixed(1) + " " + P.rail + "H" + X(10.05).toFixed(1) + '" stroke-width="1" stroke-dasharray="2 4"/>';
  let gradRail = "";
  for (const b of [-0.05, -0.025, 0, 0.025, 0.05]) gradRail += "M" + X(10 + b).toFixed(1) + " " + (P.rail - 5) + "v10";
  d += '<path d="' + gradRail + '" stroke-width="1"/>';
  d += '<path d="M' + P.x0 + ' 116H' + P.x1 + '" stroke-width="0.8" stroke-dasharray="1 4"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  for (let i = 0; i <= 4; i += 1) d += texte(X(P.vMin + i * 0.05), P.base + 18, nb(api, P.vMin + i * 0.05, 2), ' text-anchor="middle"');
  d += texte(P.x1 + 16, P.base - 8, "lecture (V)", ' text-anchor="end"');
  d += texte(X(10) + 6, 26, "valeur vraie 10,000 V (tirets)");
  d += texte(P.x0, 24, "lectures, dans l'ordre d'arrivée");
  for (const b of [-50, -25, 0, 25, 50]) d += texte(X(10 + b / 1000), P.rail + 20, (b > 0 ? "+" : "") + b, ' text-anchor="middle"');
  d += texte(P.x0, P.rail - 14, "décalage systématique (mV) : déplacer la poignée le long du rail");
  d += "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const points = svgEl("g", { fill: "currentColor", stroke: "none", opacity: "0.75" });
  const barres = svgEl("g", { fill: "currentColor", "fill-opacity": "0.28", stroke: "currentColor", "stroke-width": "1" });
  const moyenne = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "3.2" });
  const crochet = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" });
  const etiquette = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(barres, points, moyenne, crochet, etiquette);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#d-cible-valeurs", [
    { id: "n", libelle: "Nombre de lectures n", format: (v) => v },
    { id: "moy", libelle: "Moyenne des lectures", format: (v) => v },
    { id: "s", libelle: "Écart-type expérimental s", format: (v) => v },
    { id: "ua", libelle: "Incertitude-type de la moyenne s/√n", format: (v) => v },
    { id: "err", libelle: "Écart moyenne - valeur vraie", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function toutRecalculer() {
    const n = Math.max(0, Math.min(P.nMax, Math.round(etat.n)));
    const lectures = [];
    for (let i = 0; i < n; i += 1) lectures.push(10 + etat.biais + etat.sigma * z[i]);
    let pts = "";
    lectures.forEach((v, i) => {
      if (v < P.vMin || v > P.vMax) return;
      const y = 40 + ((i * 37) % 70);
      pts += '<circle cx="' + X(v).toFixed(1) + '" cy="' + y + '" r="2.6"/>';
    });
    points.innerHTML = pts;
    const classes = new Array(40).fill(0);
    for (const v of lectures) {
      const k = Math.floor((v - P.vMin) / 0.005);
      if (k >= 0 && k < 40) classes[k] += 1;
    }
    const maxi = Math.max(8, ...classes);
    let rects = "";
    classes.forEach((compte, k) => {
      if (!compte) return;
      const h = (compte / maxi) * P.hMax;
      rects += '<rect x="' + (X(P.vMin + k * 0.005) + 1).toFixed(1) + '" y="' + (P.base - h).toFixed(1) + '" width="' + (X(0.005 + P.vMin) - X(P.vMin) - 2).toFixed(1) + '" height="' + h.toFixed(1) + '"/>';
    });
    barres.innerHTML = rects;
    let lib = "";
    if (n >= 1) {
      const m = lectures.reduce((a, b) => a + b, 0) / n;
      const s = n >= 2 ? Math.sqrt(lectures.reduce((a, v) => a + (v - m) ** 2, 0) / (n - 1)) : NaN;
      const xm = X(Math.min(P.vMax, Math.max(P.vMin, m)));
      moyenne.setAttribute("d", "M" + xm.toFixed(1) + " 120V" + (P.base + 8));
      lib += texte(xm + (xm > 560 ? -6 : 6), 132, "moyenne", xm > 560 ? ' text-anchor="end"' : "");
      if (Number.isFinite(s)) {
        const ua = s / Math.sqrt(n);
        const g = X(Math.max(P.vMin, m - 2 * ua));
        const dr = X(Math.min(P.vMax, m + 2 * ua));
        crochet.setAttribute("d", "M" + g.toFixed(1) + " 272v12H" + dr.toFixed(1) + "v-12");
        lib += texte((g + dr) / 2, 302, "moyenne ± 2 s/√n", ' text-anchor="middle"');
        if (valeurs) {
          valeurs.maj({
            n: String(n),
            moy: nb(api, m, 4) + " V",
            s: nb(api, s * 1000, 1) + " mV",
            ua: nb(api, ua * 1000, 2) + " mV",
            err: (m - 10 >= 0 ? "+" : "") + nb(api, (m - 10) * 1000, 1) + " mV",
          });
        }
      } else {
        crochet.setAttribute("d", "");
        if (valeurs) valeurs.maj({ n: "1", moy: nb(api, m, 4) + " V", s: "indéfini pour n = 1", ua: "indéfini", err: nb(api, (m - 10) * 1000, 1) + " mV" });
      }
    } else {
      moyenne.setAttribute("d", "");
      crochet.setAttribute("d", "");
      if (valeurs) valeurs.maj({ n: "0", moy: "aucune lecture", s: "indéfini", ua: "indéfini", err: "indéfini" });
    }
    etiquette.innerHTML = lib;
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: X(9.95), y: P.rail },
    a: { x: X(10.05), y: P.rail },
    min: -50,
    max: 50,
    pas: 1,
    valeur: etat.biais * 1000,
    libelle: "Décalage systématique du voltmètre, en millivolts",
    format: (m) => "décalage " + nb(api, typeof m === "number" ? m : m.valeur, 0) + " mV",
    rappel(m) {
      etat.biais = (typeof m === "number" ? m : m.valeur) / 1000;
      toutRecalculer();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-cible-curseurs",
    [{ id: "sigma", libelle: "Écart-type de la dispersion", min: 1, max: 30, pas: 1, valeur: etat.sigma * 1000, unite: "mV" }],
    (v) => {
      etat.sigma = v.sigma / 1000;
      toutRecalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-cible-lecteur", {
    de: 0,
    a: P.nMax,
    duree: 20,
    boucle: false,
    auto: false,
    libelle: "Arrivée des lectures",
    rappel: (n) => {
      etat.n = n;
      toutRecalculer();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(N0);
  }
  toutRecalculer();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.4 }));
}

/* --------------------------------------------------------------------------
   E. Somme de contributions rectangulaires : curseurs et traceur
   -------------------------------------------------------------------------- */

function construireSomme(racine, api) {
  if (!racine.querySelector("#e-somme-trace")) return;
  const etat = { N: 1, r: 1 };
  let courant = null;

  function calculer() {
    const largeurs = [etat.r];
    for (let i = 1; i < etat.N; i += 1) largeurs.push(1);
    const { xs, ps, h } = loiSomme(largeurs);
    const sigma = Math.sqrt(largeurs.reduce((a, l) => a + (l * l) / 3, 0));
    const points = [];
    const pas = Math.max(1, Math.floor(xs.length / 500));
    for (let i = 0; i < xs.length; i += pas) points.push([xs[i] / sigma, (ps[i] / h) * sigma]);
    points.unshift([-4, 0], [xs[0] / sigma - 1e-6, 0]);
    points.push([xs[xs.length - 1] / sigma + 1e-6, 0], [4, 0]);
    let c1 = 0;
    let c2 = 0;
    let cumul = 0;
    let k95 = NaN;
    for (let i = 0; i < xs.length; i += 1) {
      const t = Math.abs(xs[i]) / sigma;
      if (t <= 1 + 1e-9) c1 += ps[i];
      if (t <= 2 + 1e-9) c2 += ps[i];
      cumul += ps[i];
      if (!Number.isFinite(k95) && cumul >= 0.025) k95 = -xs[i] / sigma;
    }
    courant = { points, sigma, c1, c2, k95 };
  }

  const valeurs = api.sim.valeurs("#e-somme-valeurs", [
    { id: "uc", libelle: "Incertitude-type composée uc (en demi-largeurs a)", format: (v) => v },
    { id: "c1", libelle: "Proportion couverte par ± uc", format: (v) => v },
    { id: "c2", libelle: "Proportion couverte par ± 2 uc", format: (v) => v },
    { id: "k", libelle: "Facteur k qui couvre exactement 95 %", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  calculer();
  const trace = api.sim.traceur("#e-somme-trace", {
    titre: "Loi d'une somme d'erreurs rectangulaires indépendantes",
    xTitre: "écart / uc",
    xUnite: "",
    yTitre: "densité",
    yUnite: "",
    xMin: -4,
    xMax: 4,
    yMin: 0,
    yMax: 0.5,
    echantillons: 400,
    series: [
      { id: "exacte", nom: "loi composée exacte", points: courant.points, epaisseur: 2.4 },
      { id: "normale", nom: "loi normale de même écart-type", fonction: (x) => Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI), epaisseur: 1.5 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, -1, [6, 4]);
      ligneV(c, r, couleurs, 1, [6, 4], "± uc");
      ligneV(c, r, couleurs, -2, [2, 4], "± 2 uc");
      ligneV(c, r, couleurs, 2, [2, 4]);
    },
  });
  if (trace) ressources.push(trace);

  function majValeurs() {
    if (!valeurs) return;
    valeurs.maj({
      uc: nb(api, courant.sigma, 3) + " a",
      c1: nb(api, courant.c1 * 100, 1) + " %",
      c2: nb(api, Math.min(100, courant.c2 * 100), 1) + " %",
      k: nb(api, courant.k95, 2),
    });
  }
  majValeurs();

  const curseurs = api.sim.curseurs(
    "#e-somme-curseurs",
    [
      { id: "N", libelle: "Nombre de contributions", min: 1, max: 6, pas: 1, valeur: etat.N },
      { id: "r", libelle: "Largeur de la première contribution / largeur des autres", min: 1, max: 4, pas: 0.5, valeur: etat.r, chiffres: 1 },
    ],
    (v) => {
      etat.N = Math.round(v.N);
      etat.r = v.r;
      calculer();
      if (trace) trace.definirDonnees("exacte", courant.points);
      majValeurs();
    }
  );
  if (curseurs) ressources.push(curseurs);
}

/* --------------------------------------------------------------------------
   E. Erreur relative selon la classe et la lecture
   -------------------------------------------------------------------------- */

function construireClasses(racine, api) {
  if (!racine.querySelector("#e-classes-trace")) return;
  const etat = { p: 0.5, n: 2, c: 1.5, x: 10 };
  const digit = 100 / 6000; /* valeur d'un digit en % du calibre, 6000 points */
  const numerique = (x) => (x > 0 ? etat.p + (etat.n * digit * 100) / x : NaN);
  const analogique = (x) => (x > 0 ? (etat.c * 100) / x : NaN);

  const trace = api.sim.traceur("#e-classes-trace", {
    titre: "Erreur relative maximale selon la lecture",
    xTitre: "lecture",
    xUnite: "% du calibre",
    yTitre: "erreur relative",
    yUnite: "%",
    xMin: 0,
    xMax: 100,
    yMin: 0,
    yMax: 10,
    echantillons: 400,
    series: [
      { id: "num", nom: "multimètre numérique, erreur maximale", fonction: (x) => { const v = numerique(x); return v <= 10 ? v : NaN; } },
      { id: "ana", nom: "appareil analogique, erreur maximale", fonction: (x) => { const v = analogique(x); return v <= 10 ? v : NaN; } },
      { id: "u", nom: "multimètre, incertitude-type (÷ √3)", fonction: (x) => { const v = numerique(x) / R3; return v <= 10 ? v : NaN; }, epaisseur: 1.4 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, etat.x, [7, 5], "lecture choisie");
      ligneV(c, r, couleurs, 10, [2, 4]);
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-classes-valeurs", [
    { id: "num", libelle: "Numérique : erreur relative maximale", format: (v) => v },
    { id: "u", libelle: "Numérique : incertitude-type relative", format: (v) => v },
    { id: "ana", libelle: "Analogique : erreur relative maximale", format: (v) => v },
    { id: "conseil", libelle: "Choix du calibre", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    if (trace) trace.rafraichir();
    if (!valeurs) return;
    const vn = numerique(etat.x);
    valeurs.maj({
      num: nb(api, vn, 2) + " %",
      u: nb(api, vn / R3, 2) + " %",
      ana: nb(api, analogique(etat.x), 2) + " %",
      conseil: etat.x < 10 ? "passer au calibre inférieur" : etat.x < 33 ? "calibre correct, lecture basse" : "lecture dans le dernier tiers",
    });
  }

  const curseurs = api.sim.curseurs(
    "#e-classes-curseurs",
    [
      { id: "p", libelle: "Multimètre : terme en % de la lecture", min: 0.1, max: 2, pas: 0.1, valeur: etat.p, unite: "%", chiffres: 1 },
      { id: "n", libelle: "Multimètre : nombre de digits (6000 points)", min: 0, max: 10, pas: 1, valeur: etat.n },
      { id: "c", libelle: "Appareil analogique : classe", min: 0.5, max: 2.5, pas: 0.5, valeur: etat.c, chiffres: 1 },
      { id: "x", libelle: "Lecture", min: 2, max: 100, pas: 1, valeur: etat.x, unite: "% du calibre" },
    ],
    (v) => {
      Object.assign(etat, v);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   I. Bilan interactif de la mesure de pression
   -------------------------------------------------------------------------- */

function construireBilan(racine, api) {
  const conteneur = racine.querySelector("#i-bilan-vivant");
  if (!conteneur) return;
  const P = { xb: 270, ech: 12, y0: 40, pasY: 34, lMax: 360 };
  const etat = { tr: 0.25, mod: 0.2, dT: 10, bits: 12, bruit: 6, etal: 0 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 360",
    role: "img",
    "aria-label": "Bilan d'incertitude de la mesure de pression : une barre horizontale par contribution, longueur proportionnelle à l'incertitude-type en millibars, part de variance à droite, barre épaisse de l'incertitude composée et ligne verticale de l'objectif de 10 millibars",
  });
  const decor = svgEl("g");
  const yTot = P.y0 + 7 * P.pasY + 14;
  let d = TRAITS + ' stroke-width="1.2">';
  d += '<path d="M' + P.xb + " " + (P.y0 - 22) + "V" + (yTot + 22) + '"/>';
  let grad = "";
  for (let m = 0; m <= 30; m += 5) grad += "M" + (P.xb + m * P.ech) + " " + (yTot + 22) + "v6";
  d += '<path d="' + grad + '"/>';
  d += '<path d="M' + (P.xb + 10 * P.ech) + " " + (P.y0 - 22) + "V" + (yTot + 22) + '" stroke-dasharray="7 5" stroke-width="1.5"/>';
  d += '<path d="M20 ' + (yTot - 18) + "H700" + '" stroke-dasharray="1 4" stroke-width="0.8"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  for (let m = 0; m <= 30; m += 5) d += texte(P.xb + m * P.ech, yTot + 42, String(m), ' text-anchor="middle"');
  d += texte(P.xb + 30 * P.ech, yTot + 56, "incertitude-type (mbar)", ' text-anchor="end"');
  d += texte(P.xb + 10 * P.ech + 6, P.y0 - 26, "objectif uc = 10 mbar (tirets)");
  d += "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const lignes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  const barres = svgEl("g", { fill: "currentColor", "fill-opacity": "0.3", stroke: "currentColor", "stroke-width": "1" });
  const total = svgEl("rect", { fill: "currentColor", "fill-opacity": "0.55", stroke: "currentColor", "stroke-width": "2" });
  svg.append(barres, total, lignes);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#i-bilan-valeurs", [
    { id: "uc", libelle: "Incertitude-type composée uc", format: (v) => v },
    { id: "U", libelle: "Incertitude élargie U (k = 2)", format: (v) => v },
    { id: "rel", libelle: "U rapportée à la consigne de 4,00 bar", format: (v) => v },
    { id: "dom", libelle: "Contribution dominante", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function toutRecalculer() {
    const contributions = contributionsPression(etat);
    const variance = contributions.reduce((a, c) => a + c.u * c.u, 0);
    const uc = Math.sqrt(variance);
    let rects = "";
    let ecrits = "";
    let dominante = contributions[0];
    contributions.forEach((c, i) => {
      if (c.u > dominante.u) dominante = c;
      const y = P.y0 + i * P.pasY;
      const l = Math.min(P.lMax, c.u * P.ech);
      rects += '<rect x="' + P.xb + '" y="' + (y - 9) + '" width="' + Math.max(1, l).toFixed(1) + '" height="18" rx="2"/>';
      ecrits += texte(20, y + 4, c.nom);
      ecrits += texte(P.xb + l + 8, y + 4, nb(api, c.u, 2) + " mbar, " + nb(api, (100 * c.u * c.u) / variance, (100 * c.u * c.u) / variance < 1 ? 2 : 1) + " %");
    });
    total.setAttribute("x", String(P.xb));
    total.setAttribute("y", String(yTot - 11));
    total.setAttribute("width", Math.min(P.lMax + 40, uc * P.ech).toFixed(1));
    total.setAttribute("height", "22");
    ecrits += texte(20, yTot + 4, "composée uc", ' font-weight="700"');
    ecrits += texte(P.xb + Math.min(P.lMax + 40, uc * P.ech) + 8, yTot + 4, nb(api, uc, 1) + " mbar", ' font-weight="700"');
    barres.innerHTML = rects;
    lignes.innerHTML = ecrits;
    if (valeurs) {
      valeurs.maj({
        uc: nb(api, uc, 1) + " mbar",
        U: nb(api, 2 * uc, 0) + " mbar",
        rel: nb(api, (2 * uc) / 40, 2) + " %",
        dom: dominante.nom + " (" + nb(api, (100 * dominante.u * dominante.u) / variance, 0) + " %)",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-bilan-curseurs",
    [
      { id: "tr", libelle: "Transmetteur : erreur maximale", min: 0.05, max: 1, pas: 0.05, valeur: etat.tr, unite: "% PE", chiffres: 2 },
      { id: "mod", libelle: "Entrée analogique : erreur maximale", min: 0.05, max: 0.5, pas: 0.05, valeur: etat.mod, unite: "% PE", chiffres: 2 },
      { id: "dT", libelle: "Écart de température de l'armoire", min: 0, max: 20, pas: 1, valeur: etat.dT, unite: "K" },
      { id: "bits", libelle: "Résolution de l'entrée", min: 10, max: 16, pas: 1, valeur: etat.bits, unite: "bits" },
      { id: "bruit", libelle: "Bruit d'une lecture, écart-type", min: 0, max: 20, pas: 1, valeur: etat.bruit, unite: "mbar" },
      { id: "etal", libelle: "Étalonnage sur site en deux points", min: 0, max: 1, pas: 1, valeur: etat.etal, format: (v) => (v ? "oui" : "non") },
    ],
    (v) => {
      Object.assign(etat, v);
      toutRecalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);
  toutRecalculer();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.4 }));
}

/* --------------------------------------------------------------------------
   K. Exercices
   -------------------------------------------------------------------------- */

function dessinCreneaux() {
  const X = (deg) => 60 + deg * 1.5;
  const Y = (v) => 120 - v * 70;
  let s = "<defs>" + marqueur("k-cr-fl") + "</defs>" + TRAITS + ' stroke-width="1.4">';
  s += '<path d="M60 120H620" marker-end="url(#k-cr-fl)"/><path d="M60 210V24" marker-end="url(#k-cr-fl)"/>';
  s += '<path d="M' + X(0) + " " + Y(0) + "H" + X(30) + "V" + Y(1) + "H" + X(150) + "V" + Y(0) + "H" + X(210) + "V" + Y(-1) + "H" + X(330) + "V" + Y(0) + "H" + X(360) + '" stroke-width="2.6"/>';
  s += '<path d="M60 ' + Y(0.8165) + "H" + X(360) + '" stroke-dasharray="7 5"/>';
  s += '<path d="M60 ' + Y(0.6667) + "H" + X(360) + '" stroke-dasharray="2 4"/>';
  s += "</g>" + ECRITS;
  s += texte(X(90), Y(1) - 8, "Id", ' text-anchor="middle"');
  s += texte(X(360) + 8, Y(0.8165) + 4, "efficace vraie 0,816 Id");
  s += texte(X(360) + 8, Y(0.6667) + 12, "moyenne redressée 0,667 Id");
  s += texte(620, 138, "angle (°)", ' text-anchor="end"');
  s += texte(60, 236, "appareil à valeur moyenne : 1,111 × 0,667 Id = 0,741 Id, soit 9,3 % trop bas");
  s += "</g>";
  return s;
}

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-specification",
      titre: "Incertitude-type tirée d'une spécification",
      niveau: "fondamental",
      enonce: "<p>Un multimètre affiche $12{,}34\\ \\mathrm{V}$ sur un calibre de résolution $0{,}01\\ \\mathrm{V}$. Sa spécification est $\\pm(0{,}8\\ \\% + 3\\ \\mathrm{digits})$. Quelle incertitude-type de type B, en volts, associer à cette lecture ?</p>",
      valeur: (0.008 * 12.34 + 0.03) / R3,
      unite: "V",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Incertitude-type u(U)",
      etapes: [
        { texte: "Erreur maximale : $a = 0{,}008 \\times 12{,}34 + 3 \\times 0{,}01 = 0{,}0987 + 0{,}03 = 0{,}1287\\ \\mathrm{V}$." },
        { texte: "Sans autre information, loi rectangulaire : $u = a/\\sqrt{3}$." },
        { texte: "$u = 0{,}1287/1{,}732 = 0{,}0743\\ \\mathrm{V}$, soit $0{,}60\\ \\%$ de la lecture.", note: "Ne pas ajouter séparément la résolution : elle est déjà comprise dans les digits de la spécification." },
      ],
      visuelCorrection: correctionEtapes(
        ["a = 0,8 % × 12,34 + 3 × 0,01 V", "= 0,0987 + 0,03 = 0,1287 V", "u = a / √3 = 0,0743 V (0,60 % de la lecture)"],
        "De la spécification à l'incertitude-type."
      ),
    })
  );

  const lectures = [230.4, 231.1, 229.8, 230.6, 230.9, 230.2];
  const mK2 = lectures.reduce((a, b) => a + b, 0) / 6;
  const sK2 = Math.sqrt(lectures.reduce((a, v) => a + (v - mK2) ** 2, 0) / 5);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-type-a",
      titre: "Évaluation de type A d'une tension de réseau",
      niveau: "fondamental",
      enonce: "<p>Six relevés successifs de la tension entre phase et neutre au tableau général donnent $230{,}4$, $231{,}1$, $229{,}8$, $230{,}6$, $230{,}9$ et $230{,}2\\ \\mathrm{V}$. Quelle est l'incertitude-type de type A de leur moyenne, en volts ?</p>",
      valeur: sK2 / Math.sqrt(6),
      unite: "V",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Incertitude-type de la moyenne",
      etapes: [
        { texte: "Moyenne : $1383{,}0/6 = 230{,}50\\ \\mathrm{V}$." },
        { texte: "Écarts : $-0{,}1$, $+0{,}6$, $-0{,}7$, $+0{,}1$, $+0{,}4$, $-0{,}3$ ; somme des carrés : $1{,}12\\ \\mathrm{V^2}$ ; $s = \\sqrt{1{,}12/5} = 0{,}473\\ \\mathrm{V}$." },
        { texte: "$u_A = s/\\sqrt{6} = 0{,}473/2{,}449 = 0{,}193\\ \\mathrm{V}$.", note: "Attention : la tension du réseau fluctue réellement. Ce $u_A$ caractérise la moyenne de ces six instants, pas la tension à un autre moment." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Six relevés, moyenne et bande ± s",
          xTitre: "rang du relevé",
          xUnite: "",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0.5,
          xMax: 6.5,
          yMin: 229.5,
          yMax: 231.5,
          series: [{ id: "l", nom: "relevés successifs", points: lectures.map((v, i) => [i + 1, v]) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, mK2, "moyenne 230,50 V", [7, 5]);
            ligneH(c, r, couleurs, mK2 + sK2, "+ s", [2, 4]);
            ligneH(c, r, couleurs, mK2 - sK2, "- s", [2, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-classe",
      titre: "Classe d'un ampèremètre analogique et choix du calibre",
      niveau: "intermédiaire",
      enonce: "<p>Un ampèremètre analogique de classe $1{,}5$ lit $2{,}4\\ \\mathrm{A}$ sur son calibre $10\\ \\mathrm{A}$. Quelle est l'erreur relative maximale de cette lecture, en pour cent ? Que deviendrait-elle sur le calibre $3\\ \\mathrm{A}$ ?</p>",
      valeur: 6.25,
      unite: "%",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Erreur relative maximale sur le calibre 10 A",
      etapes: [
        { texte: "Erreur maximale : $a = 1{,}5\\ \\% \\times 10 = 0{,}15\\ \\mathrm{A}$, la même partout sur l'échelle." },
        { texte: "Erreur relative : $0{,}15/2{,}4 = 6{,}25\\ \\%$." },
        { texte: "Sur le calibre $3\\ \\mathrm{A}$ : $a = 0{,}045\\ \\mathrm{A}$, soit $1{,}875\\ \\%$, plus de trois fois mieux.", note: "La lecture est alors à $80\\ \\%$ du calibre : dans le dernier tiers de l'échelle." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Erreur relative maximale d'un appareil de classe 1,5",
          xTitre: "lecture",
          xUnite: "A",
          yTitre: "erreur relative",
          yUnite: "%",
          xMin: 0,
          xMax: 3,
          yMin: 0,
          yMax: 15,
          series: [
            { id: "c10", nom: "calibre 10 A", fonction: (x) => { const v = 15 / x; return v <= 15 ? v : NaN; } },
            { id: "c3", nom: "calibre 3 A", fonction: (x) => { const v = 4.5 / x; return v <= 15 ? v : NaN; } },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneV(c, r, couleurs, 2.4, [6, 4], "2,4 A");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-puissance",
      titre: "Puissance Joule mesurée par la résistance et le courant",
      niveau: "intermédiaire",
      enonce: "<p>La puissance dissipée dans une résistance de chauffage est calculée par $P = RI^2$, avec $u_r(R) = 0{,}5\\ \\%$ et $u_r(I) = 0{,}8\\ \\%$, mesures indépendantes. Quelle est l'incertitude-type relative de $P$, en pour cent ? Faut-il plutôt mesurer $U$ et $I$ ?</p>",
      valeur: Math.hypot(0.5, 1.6),
      unite: "%",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Incertitude-type relative de P",
      etapes: [
        { texte: "Produit de puissances : $u_r^2(P) = 1^2u_r^2(R) + 2^2u_r^2(I)$." },
        { texte: "$u_r(P) = \\sqrt{0{,}5^2 + (2 \\times 0{,}8)^2} = \\sqrt{0{,}25 + 2{,}56} = 1{,}68\\ \\%$." },
        { texte: "Le courant fait $91\\ \\%$ de la variance. Avec $P = UI$ et $u_r(U) = 0{,}5\\ \\%$ : $\\sqrt{0{,}25 + 0{,}64} = 0{,}94\\ \\%$, presque deux fois mieux.", note: "Choisir la méthode, c'est choisir le modèle de mesure qui donne les plus petits exposants aux entrées les moins bien connues." },
      ],
      visuelCorrection: correctionEtapes(
        ["P = R I² : ur(P)² = ur(R)² + 4 ur(I)²", "= 0,25 + 2,56 = 2,81 ⇒ ur(P) = 1,68 %", "P = U I : 0,25 + 0,64 = 0,89 ⇒ 0,94 %"],
        "Le choix du modèle change l'incertitude."
      ),
    })
  );

  const modK5 = 10 / R3;
  const qK5 = 10000 / 4096 / R12;
  const resteK5 = Math.sqrt(100 - modK5 ** 2 - 16 - qK5 ** 2);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-dimensionnement",
      titre: "Dimensionner le transmetteur d'une mesure de pression",
      niveau: "avancé",
      enonce:
        "<p>On veut mesurer une pression de $4\\ \\mathrm{bar}$ avec une incertitude élargie d'au plus $20\\ \\mathrm{mbar}$ pour $k = 2$. Le transmetteur a une étendue de $10\\ \\mathrm{bar}$. " +
        "Les autres contributions sont : entrée analogique $\\pm 0{,}1\\ \\%\\ \\mathrm{PE}$, loi rectangulaire ; effet de température déjà évalué à $u = 4{,}0\\ \\mathrm{mbar}$ ; quantification sur $12$ bits, $10\\ \\mathrm{bar}$ pour $4096$ pas. " +
        "Quelle erreur maximale du transmetteur, en $\\%\\ \\mathrm{PE}$ et supposée rectangulaire, peut-on tolérer au plus ?</p>",
      valeur: (resteK5 * R3) / 100,
      unite: "% PE",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "Erreur maximale du transmetteur",
      etapes: [
        { texte: "Objectif : $u_c \\le 20/2 = 10\\ \\mathrm{mbar}$, soit une variance d'au plus $100\\ \\mathrm{mbar^2}$." },
        { texte: "Entrée : $10/\\sqrt{3} = 5{,}77\\ \\mathrm{mbar}$ ($33{,}3\\ \\mathrm{mbar^2}$) ; température : $16{,}0\\ \\mathrm{mbar^2}$ ; quantification : $2{,}44/\\sqrt{12} = 0{,}70\\ \\mathrm{mbar}$ ($0{,}50\\ \\mathrm{mbar^2}$)." },
        { texte: "Reste pour le transmetteur : $\\sqrt{100 - 33{,}3 - 16{,}0 - 0{,}5} = 7{,}08\\ \\mathrm{mbar}$ en incertitude-type." },
        { texte: "Borne : $a = 7{,}08\\sqrt{3} = 12{,}3\\ \\mathrm{mbar}$, soit $0{,}123\\ \\%\\ \\mathrm{PE}$ : il faut un transmetteur de $\\pm 0{,}1\\ \\%\\ \\mathrm{PE}$.", note: "Le gain par rapport à $0{,}25\\ \\%\\ \\mathrm{PE}$ se paie ; l'alternative est l'étalonnage sur site, qui retire le terme de gain et de décalage." },
      ],
      visuelCorrection: correctionEtapes(
        ["uc max = 10 mbar ⇒ variance max 100 mbar²", "entrée 33,3 + température 16,0 + quantification 0,5 = 49,8 mbar²", "reste √(100 - 49,8) = 7,08 mbar ⇒ a = 7,08 × √3 = 12,3 mbar", "= 0,123 % PE ⇒ choisir ± 0,1 % PE"],
        "Budget d'incertitude résolu à l'envers."
      ),
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-valeur-moyenne",
      titre: "Deux mesures de courant qui ne s'accordent pas",
      niveau: "diagnostic",
      enonce:
        "<p>Au départ de la pompe, en amont du variateur, la centrale de mesure à valeur efficace vraie indique $50{,}0\\ \\mathrm{A}$ par phase. Un technicien contrôle avec une pince multimètre d'entrée de gamme, de classe $1\\ \\%$, et lit $45{,}4\\ \\mathrm{A}$. " +
        "Le courant absorbé par le pont de diodes du variateur a la forme de créneaux de $120^\\circ$. Quelles affirmations sont exactes ?</p>",
      options: [
        { texte: "La pince mesure probablement la valeur moyenne redressée et l'étalonne pour une sinusoïde : sur des créneaux de 120°, elle lit environ 9 % trop bas.", juste: true },
        { texte: "Il faut contrôler avec un appareil à valeur efficace vraie, de bande passante et de facteur de crête suffisants.", juste: true },
        { texte: "La centrale est hors de sa classe, puisque l'écart dépasse 1 %." },
        { texte: "Moyenner dix lectures de la pince supprimera l'écart." },
      ],
      etapes: [
        { texte: "Créneau de hauteur $I_d$ sur $120^\\circ$ par demi-période : valeur efficace $I_d\\sqrt{2/3} = 0{,}816\\,I_d$, valeur moyenne redressée $\\frac{2}{3}I_d = 0{,}667\\,I_d$." },
        { texte: "Un appareil à valeur moyenne affiche $1{,}111 \\times 0{,}667\\,I_d = 0{,}741\\,I_d$, soit $0{,}907$ fois la valeur efficace : $50{,}0 \\times 0{,}907 = 45{,}4\\ \\mathrm{A}$." },
        { texte: "C'est une erreur de méthode, systématique : ni la classe de la pince, ni une moyenne ne la couvrent. Aucun appareil n'est défaillant.", note: "Le facteur $1{,}111 = \\pi/(2\\sqrt{2})$ est le facteur de forme d'une sinusoïde, revu dans le cours Signaux périodiques et sinusoïdes." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(moteur, conteneur, "0 0 680 250", dessinCreneaux(), "Courant en créneaux de 120° : valeur efficace vraie et valeur moyenne redressée.");
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-erreur-incertitude",
      titre: "Erreur et incertitude",
      niveau: "conceptuel",
      enonce: "<p>Expliquez sans calcul pourquoi l'erreur d'une mesure est inconnaissable alors que son incertitude se calcule, et ce que représente concrètement l'incertitude.</p>",
      motsCles: [["valeur vraie", "vraie"], ["inconnu", "inconnaissable", "ignore", "jamais"], ["dispersion", "ecart-type", "ecart type", "intervalle"], ["calcul", "estim", "evalu", "information"]],
      minimum: 2,
      exemple: "Deux phrases suffisent : partez de la définition de l'erreur, puis de ce que l'on connaît réellement.",
      etapes: [
        { texte: "L'erreur est la différence entre la valeur mesurée et la valeur vraie ; la valeur vraie n'étant jamais connue, l'erreur ne l'est pas non plus." },
        { texte: "L'incertitude se construit à partir de ce que l'on sait : dispersion observée, spécifications, certificats, résolution. C'est un écart-type, calculable." },
        { texte: "Elle définit un intervalle autour du résultat dans lequel on peut raisonnablement attribuer la valeur du mesurande, avec un niveau de confiance fixé par $k$.", note: "Si l'on connaissait l'erreur, on la corrigerait : ce qui reste après toute correction est l'incertitude." },
      ],
      visuelCorrection: correctionEtapes(
        ["erreur = valeur mesurée - valeur vraie : inconnaissable", "incertitude = écart-type construit sur l'information disponible", "résultat y ± U : intervalle crédible pour le mesurande"],
        "Erreur et incertitude."
      ),
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

function dessinCibles(id) {
  const cibles = [
    { cx: 90, lettre: "A", dx: 0, dy: 0, e: 26 },
    { cx: 250, lettre: "B", dx: 22, dy: -18, e: 6 },
    { cx: 410, lettre: "C", dx: 0, dy: 0, e: 6 },
    { cx: 570, lettre: "D", dx: 20, dy: 16, e: 26 },
  ];
  const offsets = [[0.2, 0.9], [-0.8, 0.3], [0.7, -0.6], [-0.3, -0.9], [0.9, 0.2], [-0.6, -0.2], [0.1, 0.4], [0.5, 0.7]];
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.2">';
  for (const c of cibles) {
    for (const r of [60, 40, 20]) s += '<circle cx="' + c.cx + '" cy="110" r="' + r + '"/>';
    s += '<path d="M' + (c.cx - 6) + " 110H" + (c.cx + 6) + "M" + c.cx + " 104V116" + '" stroke-width="1.6"/>';
  }
  s += '</g><g fill="currentColor" stroke="none">';
  for (const c of cibles) {
    for (const [ox, oy] of offsets) s += '<circle cx="' + (c.cx + c.dx + ox * c.e).toFixed(1) + '" cy="' + (110 + c.dy + oy * c.e).toFixed(1) + '" r="3.6"/>';
  }
  s += "</g>" + ECRITS;
  for (const c of cibles) s += texte(c.cx, 200, c.lettre, ' text-anchor="middle" font-weight="700" font-size="15"');
  s += texte(20, 230, "Croix : valeur vraie au centre ; points : lectures répétées.") + "</g>";
  return s;
}

function zonesCibles() {
  return [
    { x: 26, y: 46, largeur: 128, hauteur: 164, etiquette: "cible A" },
    { x: 186, y: 46, largeur: 128, hauteur: 164, etiquette: "cible B", juste: true },
    { x: 346, y: 46, largeur: 128, hauteur: 164, etiquette: "cible C" },
    { x: 506, y: 46, largeur: 128, hauteur: 164, etiquette: "cible D" },
  ];
}

const VISUELS_QUIZ = [
  etapes(["type A : écart-type de mesures répétées", "type B : spécification, certificat, résolution, classe", "les deux donnent un écart-type, combinable"], "Les deux évaluations."),
  etapes(["u(moyenne) = s / √n", "n × 4 ⇒ √n × 2 ⇒ u divisée par 2", "le décalage systématique reste entier"], "Effet du nombre de lectures."),
  etapes(["loi rectangulaire, a = 0,6", "u = a / √3 = 0,6 / 1,732", "= 0,346"], "Borne convertie en écart-type."),
  etapes(["résolution : plus petit pas d'affichage", "exactitude : écart possible à la valeur vraie", "6000 points ≠ 6000 points justes"], "Résolution et exactitude."),
  etapes(["a = 0,5 % × 4,00 + 2 × 0,01", "= 0,02 + 0,02", "= 0,04 V (1,0 % de la lecture)"], "Spécification au point de mesure."),
  () => ({ viewBox: "0 0 660 240", dessin: dessinCibles("fl-qv6"), legende: "B : lectures groupées mais décentrées, fidèle et non juste. A : juste, non fidèle. C : exact. D : ni l'un ni l'autre." }),
  etapes(["P = U I : ur(P)² = ur(U)² + ur(I)²", "= 0,3² + 0,4² = 0,25", "ur(P) = 0,5 %"], "Quotient ou produit : incertitudes relatives."),
  etapes(["classe 1 sur 5 A : a = 0,05 A partout", "à 0,5 A : 0,05 / 0,5", "= 10 %, non 1 %"], "La classe porte sur le calibre."),
  etapes(["U = k uc", "= 2 × 0,354 Ω", "= 0,71 Ω (arrondi vers le haut)"], "Incertitude élargie."),
  etapes(["q = 10 V / 2¹²", "= 10 / 4096 V", "= 2,441 mV"], "Quantum d'un convertisseur de 12 bits."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Lesquelles de ces informations conduisent à une évaluation de type B ?</p>",
        options: [
          { texte: "La spécification $\\pm(0{,}5\\ \\% + 2\\ \\mathrm{d})$ d'un multimètre", juste: true },
          { texte: "L'incertitude élargie d'un certificat d'étalonnage", juste: true },
          { texte: "L'écart-type de vingt lectures répétées" },
          { texte: "La résolution de l'afficheur", juste: true },
        ],
        multiple: true,
        explication: "Le type A repose sur la dispersion de mesures répétées ; tout le reste, spécification, certificat, résolution, classe, relève du type B. Les deux produisent un écart-type.",
        resume: "Types A et B",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Multiplier par quatre le nombre de lectures divise par deux l'incertitude-type de type A de leur moyenne.</p>",
        reponse: true,
        explication: "$u_A = s/\\sqrt{n}$ : $\\sqrt{4n} = 2\\sqrt{n}$. Mais l'erreur systématique, elle, ne change pas.",
        resume: "Effet de n",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Une erreur maximale de $\\pm 0{,}6\\ \\mathrm{mV}$ est donnée sans autre information. Incertitude-type correspondante, en millivolts ?</p>",
        valeur: 0.6 / R3,
        unite: "mV",
        tolerance: 0.01,
        explication: "Loi rectangulaire : $u = 0{,}6/\\sqrt{3} = 0{,}346\\ \\mathrm{mV}$.",
        resume: "Loi rectangulaire",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Quelle est la différence entre la résolution d'un appareil et son exactitude ?</p>",
        motsCles: [["resolution", "plus petit", "pas", "digit", "afficha"], ["exactitude", "valeur vraie", "erreur", "justesse"], ["different", "pas la meme", "ne garantit", "independ", "distinct"]],
        minimum: 2,
        explication: "La résolution est le plus petit pas perceptible de l'indication ; l'exactitude décrit l'écart possible à la valeur vraie. Un appareil peut afficher le millivolt et se tromper de plusieurs dizaines de millivolts.",
        resume: "Résolution et exactitude",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Un multimètre spécifié à $\\pm(0{,}5\\ \\% + 2\\ \\mathrm{d})$ lit $4{,}00\\ \\mathrm{V}$ avec une résolution de $0{,}01\\ \\mathrm{V}$. Erreur maximale, en volts ?</p>",
        valeur: 0.04,
        unite: "V",
        tolerance: 0.01,
        explication: "$a = 0{,}005 \\times 4{,}00 + 2 \\times 0{,}01 = 0{,}02 + 0{,}02 = 0{,}04\\ \\mathrm{V}$, soit $1{,}0\\ \\%$ : les digits pèsent autant que le pourcentage.",
        resume: "Spécification numérique",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Quatre appareils mesurent la même grandeur à plusieurs reprises. Lequel est fidèle mais non juste ?</p>",
        consigne: "Cliquez sur la cible correspondante.",
        viewBox: "0 0 660 240",
        dessin: dessinCibles("fl-q6"),
        zones: zonesCibles(),
        explication: "B : les lectures sont groupées, donc fidèles, mais leur centre est décalé de la valeur vraie, donc non justes. Ce décalage ne se voit que par comparaison à une référence.",
        resume: "Justesse et fidélité",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>$P = UI$ avec $u_r(U) = 0{,}3\\ \\%$ et $u_r(I) = 0{,}4\\ \\%$, indépendantes. Incertitude-type relative de $P$ ?</p>",
        options: ["$0{,}1\\ \\%$", "$0{,}5\\ \\%$", "$0{,}7\\ \\%$", "$0{,}12\\ \\%$"],
        bonnes: [1],
        explication: "$\\sqrt{0{,}3^2 + 0{,}4^2} = 0{,}5\\ \\%$ ; la somme arithmétique, $0{,}7\\ \\%$, ne vaut que pour des entrées totalement corrélées.",
        resume: "Propagation pour un produit",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Un ampèremètre analogique de classe $1$ sur le calibre $5\\ \\mathrm{A}$ mesure $0{,}5\\ \\mathrm{A}$ à $1\\ \\%$ près.</p>",
        reponse: false,
        explication: "La classe porte sur le calibre : $a = 0{,}05\\ \\mathrm{A}$ partout, soit $10\\ \\%$ à $0{,}5\\ \\mathrm{A}$. Il faut changer de calibre.",
        resume: "Classe et calibre",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>L'incertitude-type composée d'une résistance vaut $0{,}354\\ \\Omega$. Incertitude élargie pour $k = 2$, en ohms ?</p>",
        valeur: 0.708,
        unite: "Ω",
        tolerance: 0.01,
        explication: "$U = 2 \\times 0{,}354 = 0{,}708\\ \\Omega$, annoncée $0{,}71\\ \\Omega$.",
        resume: "Incertitude élargie",
      },
      {
        type: "calcul",
        enonce: repere(9) + "<p>Une entrée analogique de $12$ bits couvre $0$ à $10\\ \\mathrm{V}$. Valeur du quantum, en millivolts ?</p>",
        valeur: 10000 / 4096,
        unite: "mV",
        tolerance: 0.01,
        explication: "$q = 10/2^{12} = 10/4096 = 2{,}441\\ \\mathrm{mV}$ ; l'incertitude-type de quantification vaut $q/\\sqrt{12} = 0{,}705\\ \\mathrm{mV}$.",
        resume: "Quantum",
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
      { categorie: "Vocabulaire", question: "Quelle différence entre erreur et incertitude ?", reponse: "L'erreur, écart à la valeur vraie, est inconnaissable ; l'incertitude est un écart-type calculé sur l'information disponible." },
      { categorie: "Vocabulaire", question: "Justesse, fidélité, exactitude ?", reponse: "Justesse : moyenne proche de la valeur vraie (erreurs systématiques). Fidélité : lectures groupées (erreurs aléatoires). Exactitude : les deux." },
      { categorie: "Type A", question: "Comment évaluer l'incertitude de la moyenne de $n$ lectures ?", reponse: "$u_A = s/\\sqrt{n}$, avec $s$ l'écart-type expérimental de diviseur $n - 1$." },
      { categorie: "Type B", question: "Quelle incertitude-type pour une borne $\\pm a$ sans autre information ?", reponse: "Loi rectangulaire : $u = a/\\sqrt{3}$ ; pour une résolution $q$ : $q/\\sqrt{12}$ ; pour un certificat : $U/k$." },
      { categorie: "Propagation", question: "Comment combiner des contributions indépendantes ?", reponse: "$u_c^2 = \\sum c_i^2u^2(x_i)$, avec $c_i = \\partial f/\\partial x_i$ ; pour un produit de puissances, incertitudes relatives pondérées par les exposants." },
      { categorie: "Élargissement", question: "Que signifie $U = 2u_c$ ?", reponse: "Un intervalle qui couvre environ $95\\ \\%$ des valeurs attribuables au mesurande, si la loi composée est proche d'une loi normale." },
      { categorie: "Classes", question: "Que garantit un appareil analogique de classe $c$ ?", reponse: "Une erreur maximale de $c\\ \\%$ du calibre, partout sur l'échelle : l'erreur relative croît quand la lecture baisse." },
      { categorie: "Numérique", question: "Comment lire $\\pm(p\\ \\% + n\\ \\mathrm{d})$ ?", reponse: "$a = p\\ \\%$ de la lecture plus $n$ fois la résolution du calibre employé ; puis $u = a/\\sqrt{3}$." },
      { categorie: "Étalonnage", question: "Étalonnage, ajustage, vérification ?", reponse: "Étalonner : comparer à un étalon et établir la correction avec son incertitude. Ajuster : modifier l'appareil. Vérifier : conclure à la conformité." },
      { categorie: "Traçabilité", question: "Qu'est-ce que la traçabilité ?", reponse: "Une chaîne ininterrompue d'étalonnages documentés reliant le résultat aux unités SI, chaque maillon ajoutant son incertitude." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["q = 10 V / 65536 = 0,1526 mV", "u = q / √12", "= 0,0440 mV"], "Quantification sur 16 bits."),
  etapes(["a = p % × L + n d", "terme n d constant en valeur absolue", "erreur relative p + n d / L : croît quand L baisse"], "Erreur relative d'un multimètre."),
  etapes(["P = R I² : ur(P)² = ur(R)² + 4 ur(I)²", "le courant pèse 4 fois plus", "améliorer la mesure du courant"], "Hiérarchiser les contributions."),
  etapes(["Δφ = ωc θ", "= 10 × 0,020 rad", "= 0,2 rad = 11,46°"], "Phase retirée par un retard de 20 ms."),
  etapes(["τm = J / f", "= 0,030 / 0,0374", "= 0,802 s"], "Constante de temps mécanique."),
  etapes(["L di/dt + R i = u ⇒ I/U = (1/R) / (1 + (L/R) s)", "τ = L / R = 1,2 / 48", "= 0,025 s = 25 ms"], "Constante de temps d'une bobine."),
  etapes(["I2 = I1 × 5 / 150", "= 108,2 / 30", "= 3,607 A"], "Courant secondaire d'un TC 150/5 A."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Une entrée de $16$ bits couvre $0$ à $10\\ \\mathrm{V}$. Incertitude-type de quantification, en millivolts ?</p>",
        valeur: 10000 / 65536 / R12,
        unite: "mV",
        tolerance: 0.02,
        explication: "$q = 10/65\\,536 = 0{,}1526\\ \\mathrm{mV}$ ; $u = q/\\sqrt{12} = 0{,}0440\\ \\mathrm{mV}$.",
        resume: "Quantification",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Une spécification $\\pm(0{,}5\\ \\% + 2\\ \\mathrm{d})$ donne la même erreur relative pour toutes les lectures d'un calibre.</p>",
        reponse: false,
        explication: "Le terme en digits est constant en valeur absolue : son poids relatif croît quand la lecture diminue.",
        resume: "Spécification numérique",
      },
      {
        type: "qcm",
        enonce: repere(2) + "<p>Cette séance. Pour $P = RI^2$ avec $u_r(R) = u_r(I)$, quelle action réduit le plus l'incertitude sur $P$ ?</p>",
        options: ["Améliorer la mesure de $R$", "Améliorer la mesure de $I$", "Augmenter le nombre de chiffres affichés", "Les deux actions sont équivalentes"],
        bonnes: [1],
        explication: "$u_r^2(P) = u_r^2(R) + 4u_r^2(I)$ : le courant pèse quatre fois plus dans la variance.",
        resume: "Contribution dominante",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours précédent. La boucle de vitesse du convoyeur a une pulsation de coupure de $10\\ \\mathrm{rad/s}$ et un retard total de $20\\ \\mathrm{ms}$. Phase retirée par ce retard, en degrés ?</p>",
        valeur: 10 * 0.02 * (180 / Math.PI),
        unite: "°",
        tolerance: 0.01,
        explication: "$\\omega_c\\theta = 10 \\times 0{,}02 = 0{,}2\\ \\mathrm{rad} = 11{,}46^\\circ$.",
        resume: "Retard et phase",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Cours précédent. Inertie ramenée $J = 0{,}030\\ \\mathrm{kg.m^2}$ et frottement visqueux $f = 0{,}0374\\ \\mathrm{N.m.s/rad}$. Constante de temps mécanique, en secondes ?</p>",
        valeur: 0.03 / 0.0374,
        unite: "s",
        tolerance: 0.01,
        explication: "$\\tau_m = J/f = 0{,}030/0{,}0374 = 0{,}802\\ \\mathrm{s}$, arrondie à $0{,}8\\ \\mathrm{s}$ dans le mini-projet.",
        resume: "Constante de temps mécanique",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours vieux d'une semaine. La bobine d'un contacteur a $L = 1{,}2\\ \\mathrm{H}$ et $R = 48\\ \\Omega$. Constante de temps de sa fonction de transfert courant sur tension, en millisecondes ?</p>",
        valeur: 25,
        unite: "ms",
        tolerance: 0.01,
        explication: "$I(s)/U(s) = (1/R)/(1 + \\tau s)$ avec $\\tau = L/R = 1{,}2/48 = 25\\ \\mathrm{ms}$.",
        resume: "Fonction de transfert d'une bobine",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours vieux d'un mois. Un TC $150/5\\ \\mathrm{A}$ est traversé au primaire par $108{,}2\\ \\mathrm{A}$. Courant secondaire, en ampères ?</p>",
        valeur: (108.2 * 5) / 150,
        unite: "A",
        tolerance: 0.01,
        explication: "$I_2 = 108{,}2 \\times 5/150 = 3{,}607\\ \\mathrm{A}$, soit $72\\ \\%$ du courant assigné : la classe $0{,}5$ y garantit $0{,}587\\ \\%$.",
        resume: "Rapport d'un TC",
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
    titre: "Où en suis-je sur la métrologie électrique ?",
  });
  if (auto) ressources.push(auto);
}
