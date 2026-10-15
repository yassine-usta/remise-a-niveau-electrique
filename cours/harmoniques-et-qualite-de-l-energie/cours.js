/* ==========================================================================
   cours/harmoniques-et-qualite-de-l-energie/cours.js
   Harmoniques et qualité de l'énergie : décomposition, valeur efficace vraie,
   THD, facteur de crête, séquences des rangs, neutre, distorsion de tension.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const W50 = TAU * 50;
const VS = 230;

/** Courant de la pompe, modèle en créneaux de 120 degrés : 50 A efficaces vrais. */
const POMPE_I = 50;
const POMPE_CRETE = POMPE_I * Math.sqrt(1.5);
const POMPE_I1 = (POMPE_I * 3) / Math.PI;

/** Rangs 6k +/- 1 et signe de leur terme de Fourier pour un créneau de 120 degrés centré sur 90 degrés. */
const RANGS_POMPE = [1, 5, 7, 11, 13, 17, 19, 23, 25];
const signePompe = (h) => (h % 12 === 1 || h % 12 === 11 ? 1 : -1);

/** Spectre par phase de l'exemple de la section H. */
const SPECTRE_H = [
  { h: 1, i: 20 },
  { h: 3, i: 12 },
  { h: 5, i: 7 },
  { h: 7, i: 3.6 },
  { h: 9, i: 1.8 },
  { h: 11, i: 1.0 },
];

/* --------------------------------------------------------------------------
   Calcul complexe minimal
   -------------------------------------------------------------------------- */

const cx = {
  polaire: (module, degres) => ({ re: module * Math.cos(degres * DEG), im: module * Math.sin(degres * DEG) }),
  plus: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  module: (a) => Math.hypot(a.re, a.im),
  inverse: (a) => {
    const d = a.re * a.re + a.im * a.im;
    return { re: a.re / d, im: -a.im / d };
  },
};

/* --------------------------------------------------------------------------
   Modèles physiques
   -------------------------------------------------------------------------- */

/**
 * Redresseur monophasé à condensateur alimentant un convertisseur à puissance constante.
 * Intégration d'Euler sur quatorze périodes, puis analyse de la dernière, en régime établi.
 */
function simulerRedresseur({ C, P, Ls, Rs = 0.8 }) {
  const N = 2000;
  const PERIODES = 14;
  const vm = VS * Math.SQRT2;
  const dt = 1 / (50 * N);
  let i = 0;
  let vc = 0.9 * vm;
  const temps = [];
  const v = [];
  const vC = [];
  const iL = [];
  for (let n = 0; n < PERIODES * N; n += 1) {
    const t = n * dt;
    const vs = vm * Math.sin(W50 * t);
    const va = Math.abs(vs);
    if (Ls > 1e-7) {
      if (i > 0 || va > vc) i = Math.max(0, i + ((va - Rs * i - vc) / Ls) * dt);
    } else {
      i = Math.max(0, (va - vc) / Rs);
    }
    vc += ((i - P / Math.max(vc, 30)) / C) * dt;
    if (n >= (PERIODES - 1) * N) {
      temps.push((n - (PERIODES - 1) * N) * dt * 1000);
      v.push(vs);
      vC.push(vc);
      iL.push(vs >= 0 ? i : -i);
    }
  }
  let somme2 = 0;
  let pIn = 0;
  let crete = 0;
  let conduction = 0;
  for (let k = 0; k < N; k += 1) {
    somme2 += iL[k] * iL[k];
    pIn += iL[k] * v[k];
    crete = Math.max(crete, Math.abs(iL[k]));
    if (Math.abs(iL[k]) > 1e-3) conduction += 1;
  }
  const ieff = Math.sqrt(somme2 / N);
  const rangs = {};
  for (let h = 1; h <= 39; h += 2) {
    let a = 0;
    let b = 0;
    for (let k = 0; k < N; k += 1) {
      a += iL[k] * Math.cos((TAU * h * k) / N);
      b += iL[k] * Math.sin((TAU * h * k) / N);
    }
    rangs[h] = { eff: Math.hypot((2 * a) / N, (2 * b) / N) / Math.SQRT2, phase: Math.atan2(a, b) };
  }
  let harm2 = 0;
  for (let h = 3; h <= 39; h += 2) harm2 += rangs[h].eff * rangs[h].eff;
  return {
    temps,
    v,
    vC,
    iL,
    ieff,
    i1: rangs[1].eff,
    thd: Math.sqrt(harm2) / rangs[1].eff,
    crete,
    fc: crete / ieff,
    cosPhi1: Math.cos(rangs[1].phase),
    lambda: pIn / N / (VS * ieff),
    p: pIn / N,
    vcMax: Math.max(...vC),
    vcMin: Math.min(...vC),
    conduction: conduction / N,
    rangs,
  };
}

/** Somme partielle de Fourier du créneau de 120 degrés, jusqu'au rang d'indice n de RANGS_POMPE. */
function sommePompe(thetaDeg, n) {
  let s = 0;
  for (let k = 0; k <= n; k += 1) {
    const h = RANGS_POMPE[k];
    s += ((signePompe(h) * Math.SQRT2 * POMPE_I1) / h) * Math.sin(h * thetaDeg * DEG);
  }
  return s;
}

function creneauPompe(thetaDeg) {
  const t = ((thetaDeg % 360) + 360) % 360;
  if (t > 30 && t < 150) return POMPE_CRETE;
  if (t > 210 && t < 330) return -POMPE_CRETE;
  if (Math.abs(t - 30) < 1e-9 || Math.abs(t - 150) < 1e-9 || Math.abs(t - 210) < 1e-9 || Math.abs(t - 330) < 1e-9) {
    return t < 180 ? POMPE_CRETE / 2 : -POMPE_CRETE / 2;
  }
  return 0;
}

/** Impédance du jeu de barres au rang h : source inductive, condensateurs et amortissement en parallèle. */
function impedanceJdb(h, { scc, avecC, rd }) {
  const ls = (400 * 400) / (scc * 1e6) / W50;
  const c = avecC ? 149.3e-6 : 0;
  let y = { re: 0, im: -1 / (h * W50 * ls) };
  y = cx.plus(y, { re: 0, im: h * W50 * c });
  if (rd > 0) y = cx.plus(y, { re: 1 / rd, im: 0 });
  return { z: cx.inverse(y), ls };
}

const RANGS_JDB = [5, 7, 11, 13, 17, 19];

function calculerJdb(etat) {
  const lignes = RANGS_JDB.map((h) => {
    const ih = h < 17 ? POMPE_I1 / h : etat.taux * POMPE_I1;
    const { z, ls } = impedanceJdb(h, etat);
    const vh = cx.module(z) * ih;
    return { h, ih, z: cx.module(z), vh, ls };
  });
  const thd = Math.sqrt(lignes.reduce((a, l) => a + l.vh * l.vh, 0)) / VS;
  const ls = lignes[0].ls;
  const c = 149.3e-6;
  const ic1 = VS * W50 * c;
  const ic = etat.avecC ? Math.sqrt(ic1 * ic1 + lignes.reduce((a, l) => a + Math.pow(l.vh * l.h * W50 * c, 2), 0)) : 0;
  const hr = etat.avecC ? 1 / (TAU * Math.sqrt(ls * c)) / 50 : NaN;
  return { lignes, thd, ic, ic1, hr };
}

/* --------------------------------------------------------------------------
   Utilitaires SVG et tracés
   -------------------------------------------------------------------------- */

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function nombre(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
}

/** Pointe de flèche de taille fixe, indépendante de l'épaisseur du trait. */
function marqueur(id) {
  return (
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto-start-reverse">' +
    '<path d="M0 0 11 5 0 10Z" fill="currentColor"/></marker>'
  );
}

/** Segment raccourci au bout, pour laisser la place à la pointe de flèche. */
function segment(x1, y1, x2, y2, retrait = 3) {
  const l = Math.hypot(x2 - x1, y2 - y1);
  if (l < 0.5) return "";
  if (l < retrait + 1) return "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + x2.toFixed(1) + " " + y2.toFixed(1);
  const k = (l - retrait) / l;
  return "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + (x1 + (x2 - x1) * k).toFixed(1) + " " + (y1 + (y2 - y1) * k).toFixed(1);
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

/** Ligne verticale en tirets sur un tracé, avec son libellé. */
function ligneV(c, repere, couleurs, x, libelle, epaisseur = 1.2, tirets = [5, 5]) {
  const px = repere.versX(x);
  if (px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  c.save();
  c.setLineDash(tirets);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = epaisseur;
  c.beginPath();
  c.moveTo(px, repere.boite.y);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  c.setLineDash([]);
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.75;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

/** Ligne horizontale sur un tracé, avec son libellé. */
function ligneH(c, repere, couleurs, y, libelle, enDessous, tirets = [7, 5]) {
  const py = repere.versY(y);
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.setLineDash(tirets);
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
    c.fillText(libelle, repere.boite.x + repere.boite.l - 4, py + (enDessous ? 14 : -6));
  }
  c.restore();
}

function marquerPoint(c, repere, couleurs, x, y, libelle, aGauche) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.fillStyle = couleurs.texte;
  c.beginPath();
  c.arc(px, py, 4.5, 0, Math.PI * 2);
  c.fill();
  if (libelle) {
    c.font = POLICE;
    const gauche = aGauche != null ? aGauche : px > repere.boite.x + repere.boite.l * 0.6;
    c.textAlign = gauche ? "right" : "left";
    c.fillText(libelle, px + (gauche ? -8 : 8), py - 8);
  }
  c.restore();
}

/** Tracé de correction animé par le moteur. */
function traceCorrection(moteur, conteneur, options) {
  const traceur = moteur.sim.traceur(conteneur, {
    genre: "Correction visuelle",
    ratio: 0.42,
    echantillons: 400,
    ...options,
  });
  if (traceur) ressources.push(traceur);
  return traceur;
}

/** Spectre figé pour une correction. */
function spectreCorrection(moteur, conteneur, options) {
  const spectre = moteur.sim.spectre(conteneur, {
    genre: "Correction visuelle",
    ratio: 0.4,
    ...options,
  });
  if (spectre) ressources.push(spectre);
  return spectre;
}

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeursAnimation = [];

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireRedresseur(racine, api);
  construireSuperposition(racine, api);
  construireComposer(racine, api);
  construireSequences(racine, api);
  construireNeutre(racine, api);
  construireTHD(racine, api);
  construireJdb(racine, api);
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
    ["#d-redresseur-figure svg", 1.8],
    ["#e-equivalent-figure svg", 1.8],
    ["#f-schema-principal svg", 2],
    ["#i-site-figure svg", 2],
  ];
  for (const [selecteur, duree] of schemas) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree }));
  }
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-efficace",
      titre: "Valeur efficace d'un courant à deux fréquences",
      niveau: "prérequis",
      enonce:
        "<p>Un courant s'écrit $i(t) = 10\\sqrt{2}\\sin(\\omega t) + 3\\sqrt{2}\\sin(5\\omega t)$, en ampères. Quelle est sa valeur " +
        "efficace ?</p>",
      valeur: Math.sqrt(100 + 9),
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Valeur efficace $I$",
      etapes: [
        { texte: "Les deux composantes ont pour valeurs efficaces $10\\ \\mathrm{A}$ et $3\\ \\mathrm{A}$." },
        { texte: "Le produit croisé $\\sin(\\omega t)\\sin(5\\omega t)$ a une valeur moyenne nulle sur une période : il ne reste que les carrés." },
        {
          texte: "$I = \\sqrt{10^2 + 3^2} = \\sqrt{109} = 10{,}44\\ \\mathrm{A}$.",
          note: "La somme des valeurs efficaces, $13\\ \\mathrm{A}$, est fausse : elle supposerait deux composantes de même fréquence et en phase.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Le courant et ses deux composantes sur une période",
          xTitre: "ωt",
          xUnite: "degrés",
          yTitre: "courant",
          yUnite: "A",
          xMin: 0,
          xMax: 360,
          yMin: -20,
          yMax: 20,
          series: [
            { id: "f", nom: "fondamental, 10 A", couleur: "serie-1", epaisseur: 1.6, fonction: (x) => 10 * Math.SQRT2 * Math.sin(x * DEG) },
            { id: "h", nom: "rang 5, 3 A", couleur: "serie-3", epaisseur: 1.6, fonction: (x) => 3 * Math.SQRT2 * Math.sin(5 * x * DEG) },
            { id: "s", nom: "somme, 10,44 A efficaces", couleur: "serie-5", epaisseur: 3, fonction: (x) => Math.SQRT2 * (10 * Math.sin(x * DEG) + 3 * Math.sin(5 * x * DEG)) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-reactance",
      titre: "Réactance d'une inductance au rang 5",
      niveau: "prérequis",
      enonce: "<p>Quelle est la réactance d'une inductance de $0{,}2\\ \\mathrm{mH}$ pour l'harmonique de rang 5 d'un réseau à $50\\ \\mathrm{Hz}$ ?</p>",
      valeur: TAU * 250 * 0.2e-3,
      unite: "Ω",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Réactance $X_5$",
      etapes: [
        { texte: "Le rang 5 a pour fréquence $5 \\times 50 = 250\\ \\mathrm{Hz}$." },
        { texte: "$X_5 = 2\\pi \\times 250 \\times 0{,}2 \\times 10^{-3} = 0{,}3142\\ \\Omega$." },
        {
          texte: "C'est cinq fois la réactance à $50\\ \\mathrm{Hz}$, $0{,}0628\\ \\Omega$.",
          note: "La réactance d'une source croît avec le rang : un courant harmonique de rang élevé y crée une tension relativement forte.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réactance de 0,2 mH en fonction du rang",
          xTitre: "rang h",
          yTitre: "réactance",
          yUnite: "Ω",
          xMin: 1,
          xMax: 13,
          yMin: 0,
          yMax: 0.9,
          series: [{ id: "x", nom: "Xh = h L ω", couleur: "serie-1", epaisseur: 2.6, fonction: (h) => h * W50 * 0.2e-3 }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 5, 0.3142, "rang 5 : 0,3142 Ω", false);
            marquerPoint(c, repere, couleurs, 1, 0.0628, "50 Hz : 0,0628 Ω", false);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm("#c-minitest", {
      id: "c-decalage",
      titre: "Décalage d'un harmonique de rang 3",
      niveau: "prérequis",
      enonce:
        "<p>Le courant de la phase 2 est celui de la phase 1 retardé de $120^\\circ$ à $50\\ \\mathrm{Hz}$, soit $6{,}67\\ \\mathrm{ms}$. " +
        "De combien la composante de rang 3 de la phase 2 est-elle décalée par rapport à celle de la phase 1 ?</p>",
      options: [
        { texte: "$0^\\circ$ : elles sont en phase", juste: true },
        { texte: "$120^\\circ$ de retard, comme le fondamental" },
        { texte: "$40^\\circ$ de retard, le tiers de $120^\\circ$" },
        { texte: "$180^\\circ$ : elles sont en opposition" },
      ],
      etapes: [
        { texte: "Un retard de $6{,}67\\ \\mathrm{ms}$ sur une sinusoïde de $150\\ \\mathrm{Hz}$, de période $6{,}67\\ \\mathrm{ms}$, vaut une période entière." },
        {
          texte: "En angle : $3 \\times 120^\\circ = 360^\\circ \\equiv 0^\\circ$. Les composantes de rang 3 des trois phases sont en phase.",
          note: "C'est l'origine du courant de rang 3 dans le neutre d'un réseau équilibré.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Composantes de rang 3 des phases 1 et 2",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "courant",
          yUnite: "A",
          xMin: 0,
          xMax: 20,
          yMin: -1.8,
          yMax: 1.8,
          series: [
            { id: "a", nom: "rang 3, phase 1", couleur: "serie-1", epaisseur: 4, fonction: (t) => Math.SQRT2 * Math.sin(3 * W50 * t / 1000) },
            { id: "b", nom: "rang 3, phase 2, retardée de 6,67 ms", couleur: "serie-5", epaisseur: 1.8, fonction: (t) => Math.SQRT2 * Math.sin(3 * W50 * (t / 1000 - 1 / 150)) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Simulation : redresseur monophasé à condensateur
   -------------------------------------------------------------------------- */

function construireRedresseur(racine, api) {
  const etat = { C: 330e-6, P: 500, Ls: 0.5e-3 };
  let resultat = simulerRedresseur(etat);

  const interpoler = (tab, tms) => {
    const n = tab.length;
    const k = Math.max(0, Math.min(n - 1, Math.round((tms / 20) * n)));
    return tab[k];
  };

  const trace = api.sim.traceur("#d-redr-trace", {
    titre: "Tension du réseau, tension du condensateur et courant de ligne",
    genre: "Simulation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "tension, courant x 10",
    yUnite: "V, A",
    xMin: 0,
    xMax: 20,
    yMin: -360,
    yMax: 360,
    ratio: 0.45,
    echantillons: 500,
    series: [
      { id: "v", nom: "v, tension du réseau", couleur: "serie-1", epaisseur: 1.8 },
      { id: "vc", nom: "vC, tension du condensateur", couleur: "serie-3", epaisseur: 2.2 },
      { id: "i", nom: "iL x 10, courant de ligne", couleur: "serie-5", epaisseur: 2.6 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
    },
  });
  if (trace) ressources.push(trace);

  const spectre = api.sim.spectre("#d-redr-spectre", {
    titre: "Spectre du courant de ligne",
    genre: "Simulation",
    xTitre: "rang",
    yTitre: "Ih / I1",
    unite: "%",
    yMax: 110,
    barres: [],
  });
  if (spectre) ressources.push(spectre);

  const valeurs = api.sim.valeurs("#d-redr-valeurs", [
    { id: "ieff", libelle: "Courant efficace vrai I", unite: "A", decimales: 2 },
    { id: "i1", libelle: "Fondamental I1", unite: "A", decimales: 2 },
    { id: "thd", libelle: "THD du courant, rapporté à I1", unite: "%", decimales: 1 },
    { id: "crete", libelle: "Crête du courant", unite: "A", decimales: 1 },
    { id: "fc", libelle: "Facteur de crête", decimales: 2 },
    { id: "lambda", libelle: "Facteur de puissance λ", decimales: 3 },
    { id: "cos", libelle: "Facteur de déplacement cos φ1", decimales: 3 },
    { id: "ond", libelle: "Ondulation de vC", unite: "V", decimales: 1 },
    { id: "cond", libelle: "Fraction de la période en conduction", unite: "%", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    resultat = simulerRedresseur(etat);
    if (trace) {
      trace.definirFonction("v", (t) => interpoler(resultat.v, t));
      trace.definirFonction("vc", (t) => interpoler(resultat.vC, t));
      trace.definirFonction("i", (t) => 10 * interpoler(resultat.iL, t));
    }
    if (spectre) {
      const barres = [];
      for (let h = 1; h <= 15; h += 2) {
        barres.push({ etiquette: String(h), valeur: (100 * resultat.rangs[h].eff) / resultat.i1, couleur: "serie-5" });
      }
      spectre.definirBarres(barres);
    }
    if (valeurs) {
      valeurs.maj({
        ieff: resultat.ieff,
        i1: resultat.i1,
        thd: 100 * resultat.thd,
        crete: resultat.crete,
        fc: resultat.fc,
        lambda: resultat.lambda,
        cos: resultat.cosPhi1,
        ond: resultat.vcMax - resultat.vcMin,
        cond: 100 * resultat.conduction,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#d-redr-curseurs",
    [
      { id: "c", libelle: "Capacité C", min: 47, max: 1000, pas: 1, valeur: 330, format: (v) => api.util.formaterDecimal(v, 0) + " µF" },
      { id: "p", libelle: "Puissance du convertisseur P", min: 100, max: 1500, pas: 10, valeur: 500, format: (v) => api.util.formaterDecimal(v, 0) + " W" },
      { id: "ls", libelle: "Inductance de ligne Ls", min: 0.05, max: 3, pas: 0.05, valeur: 0.5, unite: "mH", chiffres: 2 },
    ],
    (lues) => {
      etat.C = lues.c * 1e-6;
      etat.P = lues.p;
      etat.Ls = lues.ls * 1e-3;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   D. Animation : reconstruction du courant de la pompe rang par rang
   -------------------------------------------------------------------------- */

function construireSuperposition(racine, api) {
  const etat = { n: RANGS_POMPE.length - 1 };

  const trace = api.sim.traceur("#d-super-trace", {
    titre: "Créneau de 120 degrés et somme partielle de ses harmoniques",
    genre: "Animation",
    xTitre: "ωt",
    xUnite: "degrés",
    yTitre: "courant",
    yUnite: "A",
    xMin: 0,
    xMax: 360,
    yMin: -80,
    yMax: 80,
    ratio: 0.42,
    echantillons: 720,
    series: [
      { id: "cr", nom: "créneau de 120 degrés, 61,2 A crête", couleur: "serie-6", epaisseur: 1.4, fonction: creneauPompe },
      { id: "s", nom: "somme partielle", couleur: "serie-1", epaisseur: 3.2 },
      { id: "d", nom: "dernière sinusoïde ajoutée", couleur: "serie-5", epaisseur: 2 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#d-super-valeurs", [
    { id: "rang", libelle: "Dernier rang ajouté", decimales: 0 },
    { id: "nb", libelle: "Nombre de sinusoïdes", decimales: 0 },
    { id: "ieff", libelle: "Valeur efficace de la somme partielle", unite: "A", decimales: 2 },
    { id: "part", libelle: "Part des 50 A efficaces vrais", unite: "%", decimales: 1 },
    { id: "thd", libelle: "THD des rangs déjà ajoutés", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const n = etat.n;
    const h = RANGS_POMPE[n];
    if (trace) {
      trace.definirFonction("s", (x) => sommePompe(x, n));
      trace.definirFonction("d", (x) => ((signePompe(h) * Math.SQRT2 * POMPE_I1) / h) * Math.sin(h * x * DEG));
    }
    let s2 = 0;
    for (let k = 0; k <= n; k += 1) s2 += Math.pow(POMPE_I1 / RANGS_POMPE[k], 2);
    if (valeurs) {
      valeurs.maj({
        rang: h,
        nb: n + 1,
        ieff: Math.sqrt(s2),
        part: (100 * Math.sqrt(s2)) / POMPE_I,
        thd: (100 * Math.sqrt(s2 - POMPE_I1 * POMPE_I1)) / POMPE_I1,
      });
    }
  }

  const lecteur = api.sim.lecteur("#d-super-lecteur", {
    de: 0,
    a: RANGS_POMPE.length - 0.001,
    duree: 14,
    boucle: false,
    auto: false,
    libelle: "Ajouter les harmoniques un par un",
    rappel(valeur) {
      const n = Math.max(0, Math.min(RANGS_POMPE.length - 1, Math.floor(valeur)));
      if (n !== etat.n) {
        etat.n = n;
        dessiner();
      }
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    /* La reconstruction s'affiche complète tant que l'apprenant n'a pas lancé l'ajout des rangs. */
    lecteur.suivre(RANGS_POMPE.length - 0.001);
    etat.n = RANGS_POMPE.length - 1;
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : composer un courant, poignée sur le phaseur du rang 3
   -------------------------------------------------------------------------- */

function construireComposer(racine, api) {
  const conteneur = racine.querySelector("#e-composer");
  if (!conteneur) return;

  const O = { x: 120, y: 115 };
  const RF = 92;
  const RG = 70;
  const etat = { t3: 0.3, t5: 0, t7: 0, phi3: 180 };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 230",
    role: "img",
    "aria-label": "Phaseur du fondamental fixe et phaseur du rang 3 orientable par une poignée sur un cercle guide, avec l'angle phi 3 et le facteur de crête du courant composé",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-c");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.4"><path d="M10 115H235M120 10V220"/></g>' +
    '<circle cx="' + O.x + '" cy="' + O.y + '" r="' + RG + '" stroke="currentColor" stroke-width="1.2" fill="none" stroke-dasharray="4 5" opacity="0.7"/>';
  const fondamental = svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", "marker-end": "url(#fl-e-c)" });
  const rang3 = svgEl("path", { stroke: "currentColor", "stroke-width": 3.4, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-c)" });
  const arc = svgEl("path", { stroke: "currentColor", "stroke-width": 1.2, fill: "none" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  svg.append(defs, fond, fondamental, arc, rang3, libelles);
  conteneur.appendChild(svg);

  const signal = (x) =>
    Math.SQRT2 * 10 * (Math.sin(x * DEG) + etat.t3 * Math.sin(3 * x * DEG + etat.phi3 * DEG) + etat.t5 * Math.sin(5 * x * DEG) + etat.t7 * Math.sin(7 * x * DEG));

  const trace = api.sim.traceur("#e-composer-trace", {
    titre: "Courant composé et fondamental",
    genre: "Simulation",
    xTitre: "θ = ωt",
    xUnite: "degrés",
    yTitre: "courant",
    yUnite: "A",
    xMin: 0,
    xMax: 360,
    yMin: -26,
    yMax: 26,
    ratio: 0.4,
    echantillons: 720,
    series: [
      { id: "f", nom: "fondamental seul, 10 A", couleur: "serie-1", epaisseur: 1.4, fonction: (x) => Math.SQRT2 * 10 * Math.sin(x * DEG) },
      { id: "i", nom: "courant composé", couleur: "serie-5", epaisseur: 3, fonction: signal },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
    },
  });
  if (trace) ressources.push(trace);

  const spectre = api.sim.spectre("#e-composer-spectre", {
    titre: "Spectre en module",
    genre: "Simulation",
    xTitre: "rang",
    yTitre: "Ih / I1",
    unite: "%",
    yMax: 110,
    ratio: 0.32,
    barres: [],
  });
  if (spectre) ressources.push(spectre);

  const valeurs = api.sim.valeurs("#e-composer-valeurs", [
    { id: "phi3", libelle: "Angle φ3 du rang 3", unite: "°", decimales: 0 },
    { id: "ieff", libelle: "Valeur efficace vraie I", unite: "A", decimales: 2 },
    { id: "thd", libelle: "THD rapporté au fondamental", unite: "%", decimales: 1 },
    { id: "crete", libelle: "Crête du courant", unite: "A", decimales: 2 },
    { id: "fc", libelle: "Facteur de crête", decimales: 3 },
    { id: "sin", libelle: "Facteur de crête d'une sinusoïde", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function crete() {
    let m = 0;
    for (let k = 0; k < 1440; k += 1) m = Math.max(m, Math.abs(signal(k / 4)));
    return m;
  }

  function dessiner() {
    fondamental.setAttribute("d", segment(O.x, O.y, O.x + RF, O.y));
    const l3 = Math.min(RG + 20, (RF * etat.t3) / 0.6 + 0.0001);
    const bx = O.x + l3 * Math.cos(etat.phi3 * DEG);
    const by = O.y - l3 * Math.sin(etat.phi3 * DEG);
    rang3.setAttribute("d", etat.t3 > 0.005 ? segment(O.x, O.y, bx, by) : "");
    const ra = 26;
    const fin = { x: O.x + ra * Math.cos(etat.phi3 * DEG), y: O.y - ra * Math.sin(etat.phi3 * DEG) };
    const grand = ((etat.phi3 % 360) + 360) % 360 > 180 ? 1 : 0;
    arc.setAttribute("d", "M" + (O.x + ra) + " " + O.y + "A" + ra + " " + ra + " 0 " + grand + " 0 " + fin.x.toFixed(1) + " " + fin.y.toFixed(1));

    const ieff = 10 * Math.sqrt(1 + etat.t3 * etat.t3 + etat.t5 * etat.t5 + etat.t7 * etat.t7);
    const thd = Math.sqrt(etat.t3 * etat.t3 + etat.t5 * etat.t5 + etat.t7 * etat.t7);
    const pic = crete();
    const fc = pic / ieff;
    let t = texte(O.x + RF - 6, O.y + 18, "I1");
    t += texte(O.x + 30, O.y - 30, "φ3", ' font-size="11"');
    t += texte(250, 34, "phaseur du rang 3, longueur τ3 = " + nombre(api, 100 * etat.t3, 0) + " %", ' font-weight="600"');
    t += texte(250, 60, "φ3 = " + nombre(api, etat.phi3, 0) + " degrés, sens trigonométrique");
    t += texte(250, 86, "crête : " + nombre(api, pic, 2) + " A, facteur de crête " + nombre(api, fc, 3));
    t += texte(250, 112, "sinusoïde : facteur de crête 1,414");
    const forme = Math.abs(fc - Math.SQRT2) < 0.03 ? "proche d'une sinusoïde" : fc > Math.SQRT2 ? "pointue, crête renforcée" : "aplatie, crête creusée";
    t += texte(250, 138, "forme : " + forme);
    t += texte(250, 178, "trait fin : fondamental, référence à 0 degré");
    t += texte(250, 200, "trait épais : rang 3 ; tirets : cercle de la poignée");
    libelles.innerHTML = t;

    if (spectre) {
      spectre.definirBarres([
        { etiquette: "1", valeur: 100, couleur: "serie-5" },
        { etiquette: "3", valeur: 100 * etat.t3, couleur: "serie-5" },
        { etiquette: "5", valeur: 100 * etat.t5, couleur: "serie-5" },
        { etiquette: "7", valeur: 100 * etat.t7, couleur: "serie-5" },
      ]);
    }
    if (trace) trace.rafraichir();
    if (valeurs) {
      valeurs.maj({ phi3: etat.phi3, ieff, thd: 100 * thd, crete: pic, fc, sin: Math.SQRT2 });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: O,
    rayon: RG,
    valeur: etat.phi3,
    boucle: true,
    pas: 5,
    libelle: "Angle φ3 du phaseur du rang 3",
    format: (mesure) => "φ3 = " + nombre(api, degresPositifs(mesure.valeur), 0) + " degrés",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.phi3 = degresPositifs(mesure.valeur);
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-composer-curseurs",
    [
      { id: "t3", libelle: "Taux du rang 3, τ3", min: 0, max: 60, pas: 1, valeur: 30, format: (v) => api.util.formaterDecimal(v, 0) + " %" },
      { id: "t5", libelle: "Taux du rang 5, τ5", min: 0, max: 40, pas: 1, valeur: 0, format: (v) => api.util.formaterDecimal(v, 0) + " %" },
      { id: "t7", libelle: "Taux du rang 7, τ7", min: 0, max: 30, pas: 1, valeur: 0, format: (v) => api.util.formaterDecimal(v, 0) + " %" },
    ],
    (lues) => {
      etat.t3 = lues.t3 / 100;
      etat.t5 = lues.t5 / 100;
      etat.t7 = lues.t7 / 100;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

function degresPositifs(valeur) {
  const v = ((Number(valeur) % 360) + 360) % 360;
  return v > 359.5 ? 0 : v;
}

/* --------------------------------------------------------------------------
   E. Animation : séquences des rangs 1, 3 et 5
   -------------------------------------------------------------------------- */

function construireSequences(racine, api) {
  const conteneur = racine.querySelector("#e-sequences");
  if (!conteneur) return;

  const RANGS = [1, 3, 5];
  const CENTRES = [{ x: 130, y: 125 }, { x: 390, y: 125 }, { x: 650, y: 125 }];
  const R = 88;
  const etat = { theta: 30 };

  const svg = svgEl("svg", {
    viewBox: "0 0 780 300",
    role: "img",
    "aria-label": "Phaseurs tournants des trois phases aux rangs 1, 3 et 5 : système direct au rang 1, trois phaseurs superposés au rang 3, système inverse au rang 5, avec la somme des trois phaseurs sous chaque cadre",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-s");
  const fond = svgEl("g");
  let html = '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.35">';
  for (const o of CENTRES) {
    html += '<circle cx="' + o.x + '" cy="' + o.y + '" r="' + R + '" stroke-dasharray="3 5"/>';
    html += '<path d="M' + (o.x - R - 12) + " " + o.y + "H" + (o.x + R + 12) + "M" + o.x + " " + (o.y - R - 12) + "V" + (o.y + R + 12) + '"/>';
  }
  html += "</g>";
  fond.innerHTML = html;
  const fleches = RANGS.map(() =>
    [0, 1, 2].map((k) =>
      svgEl("path", { stroke: "currentColor", "stroke-width": k === 0 ? 3.6 : 1.8, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-s)" })
    )
  );
  const sommes = RANGS.map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-dasharray": "8 5" }));
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  svg.append(defs, fond);
  for (const groupe of fleches) svg.append(...groupe);
  svg.append(...sommes, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-sequences-valeurs", [
    { id: "theta", libelle: "Angle θ du fondamental", unite: "°", decimales: 0 },
    { id: "d1", libelle: "Rang 1 : phase 2 / phase 1", format: () => "-120°, direct" },
    { id: "d3", libelle: "Rang 3 : phase 2 / phase 1", format: () => "0°, en phase" },
    { id: "d5", libelle: "Rang 5 : phase 2 / phase 1", format: () => "+120°, inverse" },
    { id: "s3", libelle: "Somme au rang 3", format: () => "3 phaseurs" },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    let t = "";
    RANGS.forEach((h, n) => {
      const o = CENTRES[n];
      let sx = 0;
      let sy = 0;
      for (let k = 0; k < 3; k += 1) {
        const angle = (h * (etat.theta - 120 * k)) * DEG;
        const lg = R - 4 * k;
        const bx = o.x + lg * Math.cos(angle);
        const by = o.y - lg * Math.sin(angle);
        sx += Math.cos(angle);
        sy += Math.sin(angle);
        fleches[n][k].setAttribute("d", segment(o.x, o.y, bx, by, n === 0 && k === 0 ? 10 : 3));
        const ex = o.x + (R + 16 - 6 * k) * Math.cos(angle);
        const ey = o.y - (R + 16 - 6 * k) * Math.sin(angle);
        t += texte(ex - 4, ey + 4, String(k + 1), k === 0 ? ' font-weight="700"' : "");
      }
      const mod = Math.hypot(sx, sy);
      const longueur = 60 * mod;
      sommes[n].setAttribute("d", longueur > 1 ? "M" + (o.x - 90) + " 250H" + (o.x - 90 + longueur).toFixed(1) : "");
      t += texte(o.x - 90, 236, "rang " + h + (h === 1 ? ", direct" : h === 3 ? ", homopolaire" : ", inverse"), ' font-weight="600"');
      t += texte(o.x - 90, 278, mod < 0.01 ? "somme nulle" : "somme : " + nombre(api, mod, 2) + " fois un phaseur");
    });
    libelles.innerHTML = t;
    if (valeurs) valeurs.maj({ theta: etat.theta, d1: 0, d3: 0, d5: 0, s3: 0 });
  }

  let lecteur = null;
  const poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: CENTRES[0],
    rayon: R,
    valeur: etat.theta,
    boucle: true,
    pas: 5,
    libelle: "Angle θ du fondamental, au bout du phaseur de la phase 1 du rang 1",
    format: (mesure) => "θ = " + nombre(api, degresPositifs(mesure.valeur), 0) + " degrés",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.theta = degresPositifs(mesure.valeur);
      if (lecteur) lecteur.suivre(etat.theta);
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  lecteur = api.sim.lecteur("#e-sequences-lecteur", {
    de: 0,
    a: 360,
    duree: 16,
    boucle: true,
    auto: false,
    libelle: "Faire tourner le fondamental d'un tour",
    rappel(valeur) {
      etat.theta = valeur;
      if (poignee) poignee.set(valeur, false);
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.suivre(30);
    etat.theta = 30;
    if (poignee) poignee.set(30, false);
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : le neutre face aux harmoniques
   -------------------------------------------------------------------------- */

function construireNeutre(racine, api) {
  const I1 = 10;
  const etat = { t3: 0.4, t5: 0.2, t9: 0.05, d: 1, t: 20 };
  const rangs = () => [
    { h: 1, tau: 1 },
    { h: 3, tau: etat.t3 },
    { h: 5, tau: etat.t5 },
    { h: 9, tau: etat.t9 },
  ];
  const facteur = (k) => (k === 0 ? etat.d : 1);

  function courant(k, tms) {
    const wt = W50 * (tms / 1000);
    let s = 0;
    for (const r of rangs()) s += Math.SQRT2 * facteur(k) * r.tau * I1 * Math.sin(r.h * (wt - (k * TAU) / 3));
    return s;
  }
  const neutre = (tms) => courant(0, tms) + courant(1, tms) + courant(2, tms);

  function neutreRang(h, tau) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < 3; k += 1) {
      const a = -h * k * 120 * DEG;
      re += facteur(k) * tau * I1 * Math.cos(a);
      im += facteur(k) * tau * I1 * Math.sin(a);
    }
    return Math.hypot(re, im);
  }

  const trace = api.sim.traceur("#e-neutre-trace", {
    titre: "Courants de ligne et courant du neutre",
    genre: "Simulation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "courant",
    yUnite: "A",
    xMin: 0,
    xMax: 20,
    yMin: -40,
    yMax: 40,
    ratio: 0.42,
    echantillons: 600,
    series: [
      { id: "i1", nom: "i1", couleur: "serie-1", epaisseur: 1.8 },
      { id: "i2", nom: "i2", couleur: "serie-3", epaisseur: 1.8 },
      { id: "i3", nom: "i3", couleur: "serie-4", epaisseur: 1.8 },
      { id: "iN", nom: "iN = i1 + i2 + i3", couleur: "serie-5", epaisseur: 3.6 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
      ligneV(c, repere, couleurs, etat.t, "instant");
    },
  });
  if (trace) ressources.push(trace);

  const spectre = api.sim.spectre("#e-neutre-spectre", {
    titre: "Spectre du courant du neutre",
    genre: "Simulation",
    xTitre: "rang",
    yTitre: "IN,h",
    unite: "A",
    yMax: 40,
    ratio: 0.32,
    barres: [],
  });
  if (spectre) ressources.push(spectre);

  const valeurs = api.sim.valeurs("#e-neutre-valeurs", [
    { id: "t", libelle: "Instant t", unite: "ms", decimales: 2 },
    { id: "in_t", libelle: "iN(t)", unite: "A", decimales: 2 },
    { id: "i1", libelle: "Courant efficace vrai de la phase 1", unite: "A", decimales: 2 },
    { id: "i2", libelle: "Courant efficace vrai des phases 2 et 3", unite: "A", decimales: 2 },
    { id: "in", libelle: "Courant efficace vrai du neutre IN", unite: "A", decimales: 2 },
    { id: "ratio", libelle: "Rapport IN / courant de la phase 2", decimales: 2 },
    { id: "in3", libelle: "Neutre au rang 3, 150 Hz", unite: "A", decimales: 2 },
    { id: "in1", libelle: "Neutre au fondamental, 50 Hz", unite: "A", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    if (trace) {
      [0, 1, 2].forEach((k) => trace.definirFonction("i" + (k + 1), (t) => (t <= etat.t + 1e-9 ? courant(k, t) : NaN)));
      trace.definirFonction("iN", (t) => (t <= etat.t + 1e-9 ? neutre(t) : NaN));
    }
    const parRang = rangs().map((r) => ({ h: r.h, i: neutreRang(r.h, r.tau) }));
    if (spectre) spectre.definirBarres(parRang.map((r) => ({ etiquette: String(r.h), valeur: r.i, couleur: "serie-5" })));
    const somme2 = rangs().reduce((a, r) => a + r.tau * r.tau, 0);
    const iPhase2 = I1 * Math.sqrt(somme2);
    const iN = Math.sqrt(parRang.reduce((a, r) => a + r.i * r.i, 0));
    if (valeurs) {
      valeurs.maj({
        t: etat.t,
        in_t: neutre(etat.t),
        i1: etat.d * iPhase2,
        i2: iPhase2,
        in: iN,
        ratio: iN / iPhase2,
        in3: parRang[1].i,
        in1: parRang[0].i,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-neutre-curseurs",
    [
      { id: "t3", libelle: "Taux du rang 3", min: 0, max: 80, pas: 1, valeur: 40, format: (v) => api.util.formaterDecimal(v, 0) + " %" },
      { id: "t5", libelle: "Taux du rang 5", min: 0, max: 60, pas: 1, valeur: 20, format: (v) => api.util.formaterDecimal(v, 0) + " %" },
      { id: "t9", libelle: "Taux du rang 9", min: 0, max: 30, pas: 1, valeur: 5, format: (v) => api.util.formaterDecimal(v, 0) + " %" },
      { id: "d", libelle: "Charge de la phase 1, rapportée aux autres", min: 0.5, max: 2, pas: 0.05, valeur: 1, chiffres: 2 },
    ],
    (lues) => {
      etat.t3 = lues.t3 / 100;
      etat.t5 = lues.t5 / 100;
      etat.t9 = lues.t9 / 100;
      etat.d = lues.d;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-neutre-lecteur", {
    de: 0,
    a: 20,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Faire avancer le temps sur une période",
    rappel(valeur) {
      etat.t = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    /* Les courbes s'affichent complètes tant que l'apprenant n'a pas lancé la lecture. */
    lecteur.suivre(20);
    etat.t = 20;
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   H. Animation : le THD construit rang par rang
   -------------------------------------------------------------------------- */

function construireTHD(racine, api) {
  const etat = { n: SPECTRE_H.length - 1 };

  const spectre = api.sim.spectre("#h-thd-spectre", {
    titre: "Spectre du courant d'une phase du plateau de bureaux",
    genre: "Animation",
    xTitre: "rang",
    yTitre: "Ih",
    unite: "A",
    yMax: 23,
    barres: [],
  });
  if (spectre) ressources.push(spectre);

  const valeurs = api.sim.valeurs("#h-thd-valeurs", [
    { id: "rang", libelle: "Dernier rang ajouté", decimales: 0 },
    { id: "ieff", libelle: "Courant efficace vrai cumulé", unite: "A", decimales: 2 },
    { id: "thd", libelle: "THD rapporté au fondamental", unite: "%", decimales: 1 },
    { id: "thdr", libelle: "THD rapporté au total", unite: "%", decimales: 1 },
    { id: "in", libelle: "Courant du neutre cumulé", unite: "A", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const inclus = SPECTRE_H.slice(0, etat.n + 1);
    if (spectre) {
      spectre.definirBarres(
        SPECTRE_H.map((r, k) => ({ etiquette: String(r.h), valeur: k <= etat.n ? r.i : 0, couleur: "serie-1" }))
      );
    }
    const s2 = inclus.reduce((a, r) => a + r.i * r.i, 0);
    const h2 = s2 - 400;
    const tri = inclus.filter((r) => r.h % 3 === 0).reduce((a, r) => a + r.i * r.i, 0);
    if (valeurs) {
      valeurs.maj({
        rang: SPECTRE_H[etat.n].h,
        ieff: Math.sqrt(s2),
        thd: (100 * Math.sqrt(h2)) / 20,
        thdr: (100 * Math.sqrt(h2)) / Math.sqrt(s2),
        in: 3 * Math.sqrt(tri),
      });
    }
  }

  const lecteur = api.sim.lecteur("#h-thd-lecteur", {
    de: 0,
    a: SPECTRE_H.length - 0.001,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Ajouter les rangs du spectre un par un",
    rappel(valeur) {
      const n = Math.max(0, Math.min(SPECTRE_H.length - 1, Math.floor(valeur)));
      if (n !== etat.n) {
        etat.n = n;
        dessiner();
      }
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    /* Le spectre s'affiche complet tant que l'apprenant n'a pas lancé l'animation. */
    lecteur.suivre(SPECTRE_H.length - 0.001);
    etat.n = SPECTRE_H.length - 1;
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   I. Simulation : distorsion de tension du jeu de barres
   -------------------------------------------------------------------------- */

function construireJdb(racine, api) {
  const etat = { scc: 2.5, avecC: true, rd: 10, taux: 0.01 };

  const spectre = api.sim.spectre("#i-jdb-spectre", {
    titre: "Tension harmonique au jeu de barres",
    genre: "Simulation",
    xTitre: "rang",
    yTitre: "Vh / 230 V",
    unite: "%",
    barres: [],
  });
  if (spectre) ressources.push(spectre);

  const valeurs = api.sim.valeurs("#i-jdb-valeurs", [
    { id: "thd", libelle: "THD de la tension", unite: "%", decimales: 2 },
    { id: "hr", libelle: "Rang de résonance parallèle", format: (v) => (Number.isFinite(v) ? nombre(api, v, 1) : "sans condensateurs") },
    { id: "v13", libelle: "V13", unite: "V", decimales: 2 },
    { id: "v17", libelle: "V17", unite: "V", decimales: 2 },
    { id: "v19", libelle: "V19", unite: "V", decimales: 2 },
    { id: "ic", libelle: "Courant efficace vrai des condensateurs", format: (v) => (v > 0 ? nombre(api, v, 2) + " A" : "hors service") },
    { id: "icr", libelle: "Rapport au courant à 50 Hz, 10,79 A", format: (v) => (v > 0 ? nombre(api, v, 2) : "hors service") },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const r = calculerJdb(etat);
    if (spectre) {
      spectre.definirBarres(r.lignes.map((l) => ({ etiquette: String(l.h), valeur: (100 * l.vh) / VS, couleur: "serie-4" })));
    }
    if (valeurs) {
      const v = (h) => r.lignes.find((l) => l.h === h).vh;
      valeurs.maj({
        thd: 100 * r.thd,
        hr: r.hr,
        v13: v(13),
        v17: v(17),
        v19: v(19),
        ic: r.ic,
        icr: r.ic > 0 ? r.ic / r.ic1 : 0,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-jdb-curseurs",
    [
      { id: "scc", libelle: "Puissance de court-circuit de la source", min: 1, max: 10, pas: 0.1, valeur: 2.5, unite: "MVA", chiffres: 1 },
      { id: "c", libelle: "Condensateurs du compresseur", min: 0, max: 1, pas: 1, valeur: 1, format: (v) => (v > 0.5 ? "en service" : "hors service") },
      { id: "rd", libelle: "Amortissement par les charges linéaires Rd", min: 2, max: 50, pas: 1, valeur: 10, format: (v) => api.util.formaterDecimal(v, 0) + " Ω" },
      { id: "taux", libelle: "Taux réel des rangs 17 et 19", min: 0, max: 6, pas: 0.1, valeur: 1, unite: "%", chiffres: 1 },
    ],
    (lues) => {
      etat.scc = lues.scc;
      etat.avecC = lues.c > 0.5;
      etat.rd = lues.rd;
      etat.taux = lues.taux / 100;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : THD d'un spectre. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-thd",
      titre: "Taux de distorsion d'un courant de variateur",
      niveau: "fondamental",
      enonce:
        "<p>L'analyseur relève sur une phase d'un variateur : $I_1 = 40\\ \\mathrm{A}$, $I_5 = 10\\ \\mathrm{A}$, $I_7 = 6\\ \\mathrm{A}$, " +
        "$I_{11} = 3\\ \\mathrm{A}$, les autres rangs étant négligeables. Quel est le taux de distorsion rapporté au fondamental, en " +
        "pourcentage ?</p>",
      valeur: (100 * Math.sqrt(100 + 36 + 9)) / 40,
      unite: "%",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "$\\mathrm{THD}_F$",
      etapes: [
        { texte: "Harmoniques seuls : $\\sqrt{10^2 + 6^2 + 3^2} = \\sqrt{145} = 12{,}04\\ \\mathrm{A}$." },
        { texte: "$\\mathrm{THD}_F = 12{,}04/40 = 30{,}1\\ \\%$." },
        {
          texte: "Valeur efficace vraie : $I = 40\\sqrt{1 + 0{,}301^2} = 41{,}77\\ \\mathrm{A}$, à peine $4{,}4\\ \\%$ de plus que le fondamental.",
          note: "Rapporté au total, le taux vaudrait $12{,}04/41{,}77 = 28{,}8\\ \\%$ : à ce niveau de distorsion, les deux conventions sont proches.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        spectreCorrection(moteur, conteneur, {
          titre: "Spectre relevé, en ampères efficaces",
          xTitre: "rang",
          yTitre: "Ih",
          unite: "A",
          barres: [
            { etiquette: "1", valeur: 40, couleur: "serie-1" },
            { etiquette: "5", valeur: 10, couleur: "serie-1" },
            { etiquette: "7", valeur: 6, couleur: "serie-1" },
            { etiquette: "11", valeur: 3, couleur: "serie-1" },
          ],
          mesures: [
            { nom: "Harmoniques", valeur: "12,04 A" },
            { nom: "THD rapporté à I1", valeur: "30,1 %" },
          ],
        });
      },
    })
  );

  /* Fondamental 2 : courant du neutre. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-neutre",
      titre: "Courant du neutre d'un départ électronique équilibré",
      niveau: "fondamental",
      enonce:
        "<p>Trois groupes identiques d'alimentations électroniques, un par phase, appellent chacun $I_1 = 10\\ \\mathrm{A}$, " +
        "$I_3 = 4\\ \\mathrm{A}$, $I_5 = 2{,}5\\ \\mathrm{A}$ et $I_9 = 1\\ \\mathrm{A}$. Quel est le courant efficace vrai du neutre ?</p>",
      valeur: 3 * Math.sqrt(16 + 1),
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant du neutre $I_N$",
      etapes: [
        { texte: "Charges identiques : le fondamental, direct, et le rang 5, inverse, s'annulent dans le neutre." },
        { texte: "Rangs homopolaires 3 et 9 : les trois composantes sont en phase, $I_{N,3} = 12\\ \\mathrm{A}$ et $I_{N,9} = 3\\ \\mathrm{A}$." },
        {
          texte: "$I_N = \\sqrt{12^2 + 3^2} = 3\\sqrt{17} = 12{,}37\\ \\mathrm{A}$.",
          note: "Chaque phase porte $\\sqrt{100 + 16 + 6{,}25 + 1} = 11{,}07\\ \\mathrm{A}$ : le neutre porte $1{,}12$ fois le courant de phase.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const ph = (k, t) => {
          const wt = W50 * (t / 1000) - (k * TAU) / 3;
          return Math.SQRT2 * (10 * Math.sin(wt) + 4 * Math.sin(3 * wt) + 2.5 * Math.sin(5 * wt) + Math.sin(9 * wt));
        };
        traceCorrection(moteur, conteneur, {
          titre: "Courant d'une phase et courant du neutre sur une période",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "courant",
          yUnite: "A",
          xMin: 0,
          xMax: 20,
          yMin: -25,
          yMax: 25,
          echantillons: 600,
          series: [
            { id: "p", nom: "i1, 11,07 A efficaces", couleur: "serie-1", epaisseur: 1.8, fonction: (t) => ph(0, t) },
            { id: "n", nom: "iN, 12,37 A efficaces, rangs 3 et 9", couleur: "serie-5", epaisseur: 3.2, fonction: (t) => ph(0, t) + ph(1, t) + ph(2, t) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
          },
        });
      },
    })
  );

  /* Intermédiaire 1 : conversion de convention. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-convention",
      titre: "Changer de convention de THD",
      niveau: "intermédiaire",
      enonce:
        "<p>Un appareil affiche, pour un courant de $30\\ \\mathrm{A}$ efficaces vrais, un taux de distorsion de $45\\ \\%$ rapporté " +
        "à la valeur efficace totale. Un cahier des charges exprime ses limites en taux rapporté au fondamental. Quel est ce " +
        "taux, en pourcentage ? Identifiez d'abord la relation à utiliser.</p>",
      valeur: (100 * 0.45) / Math.sqrt(1 - 0.45 * 0.45),
      unite: "%",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "$\\mathrm{THD}_F$",
      etapes: [
        { texte: "Harmoniques : $\\sqrt{\\sum I_h^2} = 0{,}45 \\times 30 = 13{,}5\\ \\mathrm{A}$." },
        { texte: "Fondamental : $I_1 = \\sqrt{30^2 - 13{,}5^2} = 30\\sqrt{1 - 0{,}45^2} = 26{,}79\\ \\mathrm{A}$." },
        {
          texte: "$\\mathrm{THD}_F = 13{,}5/26{,}79 = 50{,}4\\ \\%$, soit $\\mathrm{THD}_R/\\sqrt{1 - \\mathrm{THD}_R^2}$.",
          note: "Comparer $45\\ \\%$ à une limite exprimée en $\\mathrm{THD}_F$ ferait croire à une marge de plus de cinq points qui n'existe pas.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "THD rapporté au fondamental en fonction du THD rapporté au total",
          xTitre: "THD rapporté au total",
          xUnite: "%",
          yTitre: "THD rapporté à I1",
          yUnite: "%",
          xMin: 0,
          xMax: 90,
          yMin: 0,
          yMax: 200,
          series: [
            { id: "f", nom: "THDF = THDR / racine de (1 - THDR²)", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => (100 * (x / 100)) / Math.sqrt(1 - Math.pow(x / 100, 2)) },
            { id: "e", nom: "égalité des deux taux", couleur: "serie-6", epaisseur: 1.2, fonction: (x) => x },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 45, 50.39, "45 % : 50,4 %", false);
          },
        });
      },
    })
  );

  /* Intermédiaire 2 : facteur de puissance. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-lambda",
      titre: "Facteur de puissance d'une charge déformante",
      niveau: "intermédiaire",
      enonce:
        "<p>Sous une tension sinusoïdale de $230\\ \\mathrm{V}$, une charge appelle un fondamental de $8\\ \\mathrm{A}$ à " +
        "$\\cos\\varphi_1 = 0{,}95$, avec un taux de distorsion de $60\\ \\%$ rapporté au fondamental. Quel est son facteur de " +
        "puissance ?</p>",
      valeur: 0.95 / Math.sqrt(1.36),
      unite: "",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Facteur de puissance $\\lambda$",
      etapes: [
        { texte: "Puissance active, portée par le seul fondamental : $P = 230 \\times 8 \\times 0{,}95 = 1748\\ \\mathrm{W}$." },
        { texte: "Courant efficace vrai : $I = 8\\sqrt{1 + 0{,}6^2} = 9{,}33\\ \\mathrm{A}$, donc $S = 2146\\ \\mathrm{VA}$." },
        {
          texte: "$\\lambda = 1748/2146 = 0{,}815 = 0{,}95/\\sqrt{1{,}36}$.",
          note: "Une batterie de condensateurs pourrait porter $\\cos\\varphi_1$ à $1$, mais $\\lambda$ ne dépasserait pas $1/\\sqrt{1{,}36} = 0{,}857$ : le reste est dû à la distorsion.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Facteur de puissance en fonction du THD, pour deux facteurs de déplacement",
          xTitre: "THD rapporté à I1",
          xUnite: "%",
          yTitre: "λ",
          xMin: 0,
          xMax: 150,
          yMin: 0,
          yMax: 1.05,
          series: [
            { id: "a", nom: "cos φ1 = 0,95", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => 0.95 / Math.sqrt(1 + Math.pow(x / 100, 2)) },
            { id: "b", nom: "cos φ1 = 1, compensation parfaite", couleur: "serie-3", epaisseur: 1.8, fonction: (x) => 1 / Math.sqrt(1 + Math.pow(x / 100, 2)) },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 60, 0.8146, "λ = 0,815", false);
            marquerPoint(c, repere, couleurs, 60, 0.8575, "", false);
          },
        });
      },
    })
  );

  /* Avancé : distorsion de tension avec résonance. */
  const ampli = (h) => 1 / Math.abs(1 - Math.pow(h / 6.5, 2));
  const v5 = 5 * 0.05 * 12 * ampli(5);
  const v7 = 7 * 0.05 * 8 * ampli(7);
  const thdAvec = Math.sqrt(v5 * v5 + v7 * v7) / VS;

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-resonance",
      titre: "Distorsion de tension avec une batterie de condensateurs",
      niveau: "avancé",
      enonce:
        "<p>Un jeu de barres $230/400\\ \\mathrm{V}$ est alimenté par une source de réactance $X_s = 0{,}05\\ \\Omega$ par phase à " +
        "$50\\ \\mathrm{Hz}$, purement inductive. Un variateur y injecte $I_5 = 12\\ \\mathrm{A}$ et $I_7 = 8\\ \\mathrm{A}$. On installe " +
        "une batterie de condensateurs nue qui résonne en parallèle avec la source au rang $6{,}5$. Quel est le taux de distorsion de " +
        "la tension simple, en pourcentage, sans amortissement ? Comparez au cas sans batterie.</p>",
      valeur: 100 * thdAvec,
      unite: "%",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "$\\mathrm{THD}_V$ avec la batterie",
      etapes: [
        { texte: "Sans batterie : $V_5 = 5 \\times 0{,}05 \\times 12 = 3{,}00\\ \\mathrm{V}$ et $V_7 = 7 \\times 0{,}05 \\times 8 = 2{,}80\\ \\mathrm{V}$, soit $\\mathrm{THD}_V = \\sqrt{3^2 + 2{,}8^2}/230 = 1{,}78\\ \\%$." },
        { texte: "Avec la batterie, $hX_s$ et $X_C/h$ en parallèle donnent $Z_h = hX_s / \\left|1 - (h/h_r)^2\\right|$, car $hX_s/(X_C/h) = (h/h_r)^2$." },
        { texte: "Facteurs d'amplification : $1/(1 - 0{,}5917) = 2{,}449$ au rang 5 et $1/\\left|1 - 1{,}1598\\right| = 6{,}259$ au rang 7." },
        { texte: "$V_5 = 3{,}00 \\times 2{,}449 = 7{,}35\\ \\mathrm{V}$ et $V_7 = 2{,}80 \\times 6{,}259 = 17{,}53\\ \\mathrm{V}$." },
        {
          texte: "$\\mathrm{THD}_V = \\sqrt{7{,}35^2 + 17{,}53^2}/230 = 19{,}0/230 = 8{,}26\\ \\%$, plus de quatre fois le cas sans batterie.",
          note: "Le rang 7, juste au-dessus de la résonance, est le plus amplifié. Une self anti-harmonique déplacerait la résonance sous le rang 5 ; l'amortissement des charges réelles réduirait aussi ces valeurs.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Amplification de l'impédance du jeu de barres par la batterie",
          xTitre: "rang h",
          yTitre: "Zh avec batterie / h Xs",
          xMin: 1,
          xMax: 13,
          yMin: 0,
          yMax: 10,
          echantillons: 800,
          series: [{ id: "a", nom: "1 / |1 - (h / 6,5)²|", couleur: "serie-5", epaisseur: 2.6, fonction: (h) => Math.min(12, ampli(h)) }],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 6.5, "résonance 6,5");
            ligneH(c, repere, couleurs, 1, "sans batterie : 1", true, [2, 4]);
            marquerPoint(c, repere, couleurs, 5, ampli(5), "rang 5 : x 2,45", true);
            marquerPoint(c, repere, couleurs, 7, ampli(7), "rang 7 : x 6,26", false);
          },
        });
      },
    })
  );

  /* Diagnostic industriel. */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Diagnostic : un neutre qui chauffe dans un tableau de bureaux",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Dans un tableau qui alimente des postes informatiques, la gaine du conducteur neutre a bruni près de sa borne. La pince " +
        "efficace vraie indique $22\\ \\mathrm{A}$ sur chacune des trois phases et $33\\ \\mathrm{A}$ sur le neutre ; une ancienne " +
        "pince, à valeur moyenne, n'indique que $26\\ \\mathrm{A}$ sur le neutre. Les disjoncteurs de phase, réglés à $25\\ \\mathrm{A}$, " +
        "n'ont jamais déclenché. Quelles affirmations sont exactes ?</p>",
      multiple: true,
      options: [
        { texte: "Le neutre porte surtout des courants de rang 3, issus des alimentations électroniques, qui s'additionnent au lieu de se compenser.", juste: true },
        { texte: "Les phases sont fortement déséquilibrées, ce qui explique à lui seul le courant du neutre." },
        { texte: "Il faut relever le spectre du courant du neutre à l'analyseur, puis vérifier la section du neutre et sa protection contre la surintensité.", juste: true },
        { texte: "Une batterie de condensateurs au tableau ramènerait le courant du neutre à une valeur faible." },
        { texte: "La lecture de l'ancienne pince est fausse parce que le courant du neutre n'est pas une sinusoïde à $50\\ \\mathrm{Hz}$.", juste: true },
      ],
      etapes: [
        { texte: "Trois phases à $22\\ \\mathrm{A}$ : pas de déséquilibre notable. Un neutre à $1{,}5$ fois le courant de phase est la signature des rangs homopolaires." },
        { texte: "Avec $I_N \\approx 3\\sqrt{I_3^2 + I_9^2}$, il faut environ $I_3 = 10{,}8\\ \\mathrm{A}$ par phase : une distorsion typique de postes informatiques." },
        { texte: "L'ancienne pince, étalonnée pour une sinusoïde à $50\\ \\mathrm{Hz}$, est faussée par un courant à $150\\ \\mathrm{Hz}$ ; seule la mesure efficace vraie compte." },
        {
          texte: "Les disjoncteurs de phase ne voient que $22\\ \\mathrm{A}$ : le neutre, à $33\\ \\mathrm{A}$, n'est protégé par rien. Il faut vérifier sa section et sa protection selon la norme applicable.",
          note: "Des condensateurs ne réduisent pas le rang 3 et risquent une résonance ; les remèdes sont un neutre adapté, un transformateur à enroulement en triangle en amont ou un filtre.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        spectreCorrection(moteur, conteneur, {
          titre: "Spectre plausible du courant du neutre, en ampères efficaces",
          xTitre: "rang",
          yTitre: "IN,h",
          unite: "A",
          barres: [
            { etiquette: "1", valeur: 0.5, couleur: "serie-5" },
            { etiquette: "3", valeur: 32.4, couleur: "serie-5" },
            { etiquette: "5", valeur: 0.3, couleur: "serie-5" },
            { etiquette: "9", valeur: 4.5, couleur: "serie-5" },
          ],
          mesures: [{ nom: "Efficace vrai", valeur: "32,7 A" }],
        });
      },
    })
  );

  /* Question conceptuelle. */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-conceptuel",
      titre: "Pourquoi le THD ne suffit pas à connaître la crête",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi deux courants de même fondamental et de même taux de distorsion peuvent avoir des " +
        "valeurs de crête très différentes, et pourquoi cela compte en pratique.</p>",
      motsCles: [
        ["phase", "dephasage", "decalage", "angle"],
        ["module", "efficace", "carre", "amplitude"],
        ["crete", "pointe", "maximum", "pic", "aplati"],
      ],
      minimum: 2,
      exemple: "Trois phrases : ce que mesure le THD, ce qu'il ignore, ce que cela change pour la crête.",
      etapes: [
        { texte: "Le THD et la valeur efficace ne dépendent que des modules des harmoniques, puisqu'ils s'ajoutent en carrés, indépendamment de leurs phases." },
        { texte: "La crête dépend de la façon dont les harmoniques s'ajoutent au même instant au fondamental, donc de leurs déphasages : en phase avec la crête, ils la renforcent ; en opposition, ils la creusent." },
        {
          texte: "Pratique : la crête fixe la tension continue d'un redresseur, la tenue d'un appareil de mesure par son facteur de crête admissible, et la réaction de certaines protections.",
          note: "Avec un rang 3 de $30\\ \\%$, le facteur de crête varie de $1{,}25$ à $1{,}76$ selon sa phase.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Même spectre en module, deux phases du rang 3",
          xTitre: "θ",
          xUnite: "degrés",
          yTitre: "courant",
          yUnite: "A",
          xMin: 0,
          xMax: 360,
          yMin: -20,
          yMax: 20,
          series: [
            { id: "a", nom: "φ3 = 0 : aplati, crête 13,0 A", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => 10 * Math.SQRT2 * (Math.sin(x * DEG) + 0.3 * Math.sin(3 * x * DEG)) },
            { id: "b", nom: "φ3 = 180 degrés : pointu, crête 18,4 A", couleur: "serie-5", epaisseur: 2.6, fonction: (x) => 10 * Math.SQRT2 * (Math.sin(x * DEG) - 0.3 * Math.sin(3 * x * DEG)) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

function dessinSpectreQuiz() {
  const barres = [
    { h: 1, v: 100, x: 70 },
    { h: 3, v: 70, x: 150 },
    { h: 5, v: 45, x: 230 },
    { h: 7, v: 25, x: 310 },
    { h: 9, v: 12, x: 390 },
  ];
  let d = '<g stroke="currentColor" stroke-width="1.4" fill="none"><path d="M40 30V210H460"/></g>';
  d += '<g stroke="currentColor" stroke-width="1.6" fill="currentColor" fill-opacity="0.3">';
  for (const b of barres) d += '<rect x="' + (b.x - 12) + '" y="' + (210 - 1.6 * b.v) + '" width="24" height="' + 1.6 * b.v + '" rx="2"/>';
  d += "</g>";
  d += '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';
  for (const b of barres) {
    d += texte(b.x - 4, 228, String(b.h));
    d += texte(b.x - 12, 202 - 1.6 * b.v, b.v + " %");
  }
  d += texte(40, 248, "rang du courant d'une phase, charges identiques");
  d += texte(330, 60, "Ih / I1");
  d += "</g>";
  return d;
}

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Dans un réseau triphasé équilibré, lequel de ces rangs est homopolaire ?</p>",
        options: ["Le rang 9", "Le rang 5", "Le rang 7", "Le rang 11"],
        bonnes: [0],
        explication: "Les rangs multiples de 3 sont homopolaires : $9 \\times 120^\\circ = 1080^\\circ$, multiple de $360^\\circ$. Le rang 5 et le rang 11 sont inverses, le rang 7 direct.",
        resume: "Rang homopolaire",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Sous une tension parfaitement sinusoïdale, les harmoniques du courant transportent une partie de la puissance active.</p>",
        reponse: false,
        explication: "La moyenne du produit d'une sinusoïde par une sinusoïde de fréquence différente est nulle : seul le fondamental du courant transporte de la puissance active.",
        resume: "Harmoniques et puissance active",
      },
      {
        type: "calcul",
        enonce: "<p>Un courant a un fondamental de $30\\ \\mathrm{A}$ et un taux de distorsion de $40\\ \\%$ rapporté au fondamental. Quelle est sa valeur efficace vraie, en ampères ?</p>",
        valeur: 30 * Math.sqrt(1.16),
        unite: "A",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$I = I_1\\sqrt{1 + \\mathrm{THD}_F^2} = 30\\sqrt{1{,}16} = 32{,}31\\ \\mathrm{A}$.",
        resume: "Efficace vrai à partir du THD",
      },
      {
        type: "calcul",
        enonce: "<p>Trois charges électroniques identiques, une par phase, appellent chacune $5\\ \\mathrm{A}$ de rang 3 et aucun autre rang multiple de 3. Quel courant de rang 3 circule dans le neutre, en ampères ?</p>",
        valeur: 15,
        unite: "A",
        tolerance: 0.01,
        chiffres: 1,
        explication: "Les trois composantes de rang 3 sont en phase : $3 \\times 5 = 15\\ \\mathrm{A}$.",
        resume: "Rang 3 dans le neutre",
      },
      {
        type: "qcm",
        enonce: "<p>Laquelle de ces grandeurs peut dépasser $100\\ \\%$ ?</p>",
        options: [
          "Le taux de distorsion rapporté au fondamental",
          "Le taux de distorsion rapporté à la valeur efficace totale",
          "Le facteur de puissance, en pourcentage",
          "Le facteur de distorsion $I_1/I$, en pourcentage",
        ],
        bonnes: [0],
        explication: "Quand les harmoniques pèsent plus que le fondamental, $\\sqrt{\\sum I_h^2} > I_1$ : c'est le cas des redresseurs à condensateur. Rapporté au total, le taux reste sous $100\\ \\%$.",
        resume: "Conventions de THD",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Un variateur triphasé à pont de diodes, raccordé sans neutre et alimenté par des tensions équilibrées, n'envoie pas de courant de rang 3 dans le neutre de l'installation.</p>",
        reponse: true,
        explication: "Il n'a pas de neutre, et son courant ne contient que les rangs $6k \\pm 1$ : 5, 7, 11, 13. Il pollue la tension, mais ne charge pas le neutre.",
        resume: "Variateur triphasé et neutre",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi l'installation d'une batterie de condensateurs nue peut-elle aggraver la distorsion de la tension ?</p>",
        motsCles: [["resonance", "resonne", "accord"], ["source", "inductance", "transformateur", "reseau"], ["amplif", "impedance", "augment"]],
        minimum: 2,
        explication: "Avec l'inductance de la source, la batterie forme un circuit résonant parallèle ; près du rang de résonance, l'impédance du jeu de barres devient grande et les courants harmoniques y créent des tensions amplifiées.",
        resume: "Résonance et distorsion",
      },
      {
        type: "schema",
        enonce: "<p>Le spectre ci-dessous est celui du courant de chaque phase d'un départ à charges identiques, avec neutre. Quel rang contribue le plus au courant du neutre ?</p>",
        consigne: "Cliquez sur la barre correcte.",
        viewBox: "0 0 480 260",
        description: "Spectre en barres des rangs 1, 3, 5, 7 et 9 à 100, 70, 45, 25 et 12 pour cent du fondamental",
        dessin: dessinSpectreQuiz(),
        zones: [
          { x: 50, y: 40, largeur: 40, hauteur: 175, etiquette: "1" },
          { x: 130, y: 40, largeur: 40, hauteur: 175, etiquette: "3", juste: true },
          { x: 210, y: 40, largeur: 40, hauteur: 175, etiquette: "5" },
          { x: 290, y: 40, largeur: 40, hauteur: 175, etiquette: "7" },
          { x: 370, y: 40, largeur: 40, hauteur: 175, etiquette: "9" },
        ],
        explication: "Seuls les rangs homopolaires, 3 et 9, passent dans le neutre ; le rang 3, de $70\\ \\%$, y apporte $3 \\times 70 = 210\\ \\%$ du fondamental, le rang 9 seulement $36\\ \\%$. Le fondamental, plus grand, s'annule dans le neutre.",
        resume: "Lecture d'un spectre",
      },
      {
        type: "calcul",
        enonce: "<p>Une source de réactance $0{,}05\\ \\Omega$ à $50\\ \\mathrm{Hz}$ est traversée par un courant de rang 7 de $4\\ \\mathrm{A}$. Quelle tension de rang 7 apparaît au jeu de barres, en volts, sans condensateurs ?</p>",
        valeur: 7 * 0.05 * 4,
        unite: "V",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$V_7 = 7 X_s I_7 = 7 \\times 0{,}05 \\times 4 = 1{,}40\\ \\mathrm{V}$ : la réactance est multipliée par le rang.",
        resume: "Tension harmonique",
      },
      {
        type: "calcul",
        enonce: "<p>Une charge appelle un fondamental parfaitement en phase avec la tension sinusoïdale, avec un taux de distorsion de $100\\ \\%$ rapporté au fondamental. Quel est son facteur de puissance ?</p>",
        valeur: 1 / Math.SQRT2,
        unite: "",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$\\lambda = \\cos\\varphi_1/\\sqrt{1 + \\mathrm{THD}_F^2} = 1/\\sqrt{2} = 0{,}707$, alors que $\\cos\\varphi_1 = 1$.",
        resume: "Facteur de puissance et distorsion",
      },
    ],
    { titre: "Dix questions sur les harmoniques et la qualité de l'énergie" }
  );
  if (quiz) ressources.push(quiz);
}

/* --------------------------------------------------------------------------
   M. Fiche de mémorisation
   -------------------------------------------------------------------------- */

function construireCartesMemo(racine, api) {
  const cartes = api.cartes(
    "#m-cartes",
    [
      { categorie: "Origine", question: "Qu'est-ce qu'une charge non linéaire ?", reponse: "Une charge dont le courant n'est pas proportionnel à la tension : redresseur, alimentation électronique, variateur. Sous tension sinusoïdale, elle appelle un courant déformé." },
      { categorie: "Valeur efficace", question: "Comment calculer la valeur efficace vraie d'un courant à partir de son spectre ?", reponse: "$I = \\sqrt{\\sum_h I_h^2}$ : on additionne les carrés, jamais les valeurs efficaces." },
      { categorie: "THD", question: "Quelles sont les deux conventions de taux de distorsion ?", reponse: "Rapporté au fondamental, $\\mathrm{THD}_F$, qui peut dépasser $100\\ \\%$ ; rapporté au total, $\\mathrm{THD}_R = \\mathrm{THD}_F/\\sqrt{1 + \\mathrm{THD}_F^2}$." },
      { categorie: "Crête", question: "Le THD fixe-t-il le facteur de crête ?", reponse: "Non : la crête dépend aussi des phases des harmoniques. Un rang 3 de $30\\ \\%$ donne un facteur de crête de $1{,}25$ à $1{,}76$." },
      { categorie: "Puissance", question: "Que vaut le facteur de puissance sous tension sinusoïdale ?", reponse: "$\\lambda = \\cos\\varphi_1/\\sqrt{1 + \\mathrm{THD}_F^2}$ : facteur de déplacement fois facteur de distorsion." },
      { categorie: "Séquences", question: "Quelles sont les séquences des rangs en triphasé équilibré ?", reponse: "Directs : 1, 7, 13 ; inverses : 5, 11, 17 ; homopolaires : 3, 9, 15." },
      { categorie: "Neutre", question: "Que porte le neutre de trois charges électroniques identiques ?", reponse: "La somme des rangs homopolaires : $I_N = 3\\sqrt{I_3^2 + I_9^2 + \\cdots}$, jusqu'à $\\sqrt{3}$ fois le courant de phase." },
      { categorie: "Pont triphasé", question: "Quels rangs contient le courant d'un pont de diodes triphasé ?", reponse: "Les rangs $6k \\pm 1$ : 5, 7, 11, 13, d'amplitude $I_1/h$ dans le modèle idéal ; ni rangs pairs, ni multiples de 3." },
      { categorie: "Tension", question: "Comment un courant harmonique déforme-t-il la tension ?", reponse: "En traversant l'impédance de la source : $V_h = Z_h I_h$, avec $Z_h \\approx hX_s$, amplifiée près d'une résonance avec des condensateurs." },
      {
        categorie: "Industriel",
        question: "Sur quoi repose l'acceptation de la résonance du compresseur au rang 18,3 sur le site ?",
        reponse: "Sur la faiblesse réelle des rangs 17 et 19 de la pompe : à $1\\ \\%$, $\\mathrm{THD}_V = 4{,}53\\ \\%$ ; selon le modèle idéal, $12{,}5\\ \\%$ et des condensateurs surchargés.",
        rappel: "À vérifier par une mesure à la mise en service.",
      },
    ],
    { titre: "Dix cartes sur les harmoniques et la qualité de l'énergie" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: "<p>Cette séance. Un courant contient $I_1 = 10\\ \\mathrm{A}$, $I_3 = 3\\ \\mathrm{A}$ et $I_5 = 4\\ \\mathrm{A}$. Quel est son taux de distorsion rapporté au fondamental, en pourcentage ?</p>",
        valeur: 50,
        unite: "%",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$\\sqrt{3^2 + 4^2}/10 = 5/10 = 50\\ \\%$.",
        resume: "Calcul d'un THD",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Cette séance. Le neutre d'un réseau dont les trois phases portent des charges identiques ne porte jamais plus que le courant d'une phase.</p>",
        reponse: false,
        explication: "Les rangs multiples de 3 s'y additionnent : le neutre peut porter jusqu'à $\\sqrt{3}$ fois le courant de phase.",
        resume: "Neutre et rang 3",
      },
      {
        type: "qcm",
        enonce: "<p>Cette séance. Quel rang crée dans un moteur asynchrone un champ tournant en sens inverse ?</p>",
        options: ["Le rang 5", "Le rang 7", "Le rang 3", "Le rang 13"],
        bonnes: [0],
        explication: "Le rang 5 est inverse, $5 \\times 120^\\circ = 600^\\circ \\equiv -120^\\circ$ ; il produit un couple de freinage et des pertes.",
        resume: "Rang inverse",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/charges-triphasees-desequilibrees\">Charges triphasées déséquilibrées</a>. Neutre relié, un récepteur résistif de $4{,}6\\ \\mathrm{kW}$ sous $230\\ \\mathrm{V}$ sur $L_1$, rien sur les autres phases. Quel courant porte le neutre, en ampères ?</p>",
        valeur: 20,
        unite: "A",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$I_1 = 4600/230 = 20\\ \\mathrm{A}$ et $\\underline{I}_N = \\underline{I}_1$ : une seule phase chargée, le neutre porte tout son courant.",
        resume: "Une seule phase chargée",
      },
      {
        type: "qcm",
        enonce: "<p>Cours <a href=\"#/cours/charges-triphasees-desequilibrees\">Charges triphasées déséquilibrées</a>. Après la rupture du neutre d'une étoile de récepteurs résistifs déséquilibrés, quel récepteur subit la plus forte tension ?</p>",
        options: ["Le moins chargé", "Le plus chargé", "Celui de la phase 1, toujours", "Aucun : tous gardent 230 V"],
        bonnes: [0],
        explication: "Le point commun est attiré vers le sommet de la phase la plus chargée et s'éloigne de celui de la phase la moins chargée.",
        resume: "Rupture du neutre",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/puissances-en-courant-alternatif\">Puissances en courant alternatif</a>. Une charge sinusoïdale absorbe $3\\ \\mathrm{kW}$ et $4\\ \\mathrm{kvar}$. Quelle est sa puissance apparente, en kilovoltampères ?</p>",
        valeur: 5,
        unite: "kVA",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$S = \\sqrt{P^2 + Q^2} = 5\\ \\mathrm{kVA}$ ; avec des harmoniques, il faudrait ajouter la puissance déformante, $S^2 = P^2 + Q_1^2 + D^2$.",
        resume: "Triangle des puissances",
      },
      {
        type: "qcm",
        enonce: "<p>Cours <a href=\"#/cours/diagnostic-initial-et-remise-a-niveau-mathematique\">Diagnostic initial et remise à niveau mathématique</a>. Que vaut la valeur moyenne, sur une période, de $\\sin(\\omega t)\\sin(3\\omega t)$ ?</p>",
        options: ["$0$", "$1/2$", "$-1/2$", "$1/4$"],
        bonnes: [0],
        explication: "$\\sin a \\sin b = \\tfrac12[\\cos(a - b) - \\cos(a + b)]$ : deux cosinus de pulsations $2\\omega$ et $4\\omega$, de moyenne nulle. C'est l'orthogonalité qui permet d'additionner les carrés des harmoniques.",
        resume: "Orthogonalité",
      },
    ],
    { titre: "Sept questions de révision espacée" }
  );
  if (quiz) ressources.push(quiz);
}

/* --------------------------------------------------------------------------
   P. Auto-évaluation
   -------------------------------------------------------------------------- */

function construireAutoEval(racine, api) {
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur les harmoniques et la qualité de l'énergie ?",
  });
  if (auto) ressources.push(auto);
}
