/* ==========================================================================
   cours/multimetre-oscilloscope-et-sondes/cours.js
   Multimètre, oscilloscope et sondes : schéma manipulable de la pointe et de
   la pince de masse sur le variateur de la pompe, lectures des multimètres
   (valeur efficace vraie, valeur moyenne, fondamental), front vrai et front
   affiché selon la bande passante, compensation d'une sonde x 10, exercices,
   quiz, cartes, révision espacée et auto-évaluation.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const R2 = Math.SQRT2;
const W50 = 2 * Math.PI * 50;
const VM = 230 * R2;
const FF_SINUS = Math.PI / (2 * R2);

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
   Modèles physiques
   -------------------------------------------------------------------------- */

/** Porteuse triangulaire de -1 à 1. */
function triangle(t, f) {
  const ph = (((t * f) % 1) + 1) % 1;
  return ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
}

/** Tension simple de la phase k (0, 1, 2) par rapport à la terre. */
function vPhase(k, t) {
  return VM * Math.sin(W50 * t - (k * 2 * Math.PI) / 3);
}

/** Mode commun du pont à diodes : milieu entre la plus haute et la plus basse des phases. */
function vModeCommun(t) {
  const a = vPhase(0, t);
  const b = vPhase(1, t);
  const c = vPhase(2, t);
  return (Math.max(a, b, c) + Math.min(a, b, c)) / 2;
}

const VD = 540;
const M_MLI = 0.9;
const F_PORTEUSE = 4000;

/** Sortie de bras d'onduleur, modulation sinus-triangle, par rapport à la terre. */
function vBras(k, t) {
  const ref = M_MLI * Math.sin(W50 * t - (k * 2 * Math.PI) / 3);
  return vModeCommun(t) + (ref >= triangle(t, F_PORTEUSE) ? VD / 2 : -VD / 2);
}

/** Bornes de la réglette, dans l'ordre affiché. */
const BORNES = [
  { nom: "PE", v: () => 0 },
  { nom: "N", v: (t) => 3 * R2 * Math.sin(W50 * t) },
  { nom: "L1", v: (t) => vPhase(0, t) },
  { nom: "L2", v: (t) => vPhase(1, t) },
  { nom: "L3", v: (t) => vPhase(2, t) },
  { nom: "+DC", v: (t) => vModeCommun(t) + VD / 2 },
  { nom: "-DC", v: (t) => vModeCommun(t) - VD / 2 },
  { nom: "U", v: (t) => vBras(0, t) },
  { nom: "V", v: (t) => vBras(1, t) },
];

const Z_BOUCLE = 0.3;

/** Fonction d'erreur, approximation d'Abramowitz et Stegun (erreur inférieure à 1,5e-7). */
function erf(x) {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/** Front gaussien de temps de montée tm (10 à 90 %), centré en t0. */
function frontGaussien(t, t0, tm) {
  const sigma = tm / 2.5631;
  return 0.5 * (1 + erf((t - t0) / (sigma * R2)));
}

/** Formes d'onde du simulateur de multimètres, sur une période de 20 ms. */
function formeOnde(forme, beta, m) {
  if (forme === 0) return (t) => VM * Math.sin(W50 * t);
  if (forme === 1) return (t) => (Math.sin(W50 * t) >= 0 ? 230 : -230);
  if (forme === 2) {
    const crete = 230 * Math.sqrt(3);
    return (t) => crete * triangle(t + 0.005, 50);
  }
  if (forme === 3) {
    const b = (beta * Math.PI) / 180;
    return (t) => {
      const th = (((W50 * t) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      for (const [centre, signe] of [[Math.PI / 2, 1], [(3 * Math.PI) / 2, -1]]) {
        const d = th - centre;
        if (Math.abs(d) < b / 2) return signe * 100 * Math.cos((Math.PI * d) / b) ** 2;
      }
      return 0;
    };
  }
  return (t) => {
    const p = triangle(t, F_PORTEUSE);
    const va = m * Math.sin(W50 * t) >= p ? VD / 2 : -VD / 2;
    const vb = m * Math.sin(W50 * t - (2 * Math.PI) / 3) >= p ? VD / 2 : -VD / 2;
    return va - vb;
  };
}

/** Valeur efficace, valeur moyenne redressée, crête et fondamental sur une durée donnée. */
function statistiques(f, duree, n) {
  let s2 = 0;
  let s1 = 0;
  let crete = 0;
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i += 1) {
    const t = (i * duree) / n;
    const x = f(t);
    s2 += x * x;
    s1 += Math.abs(x);
    if (Math.abs(x) > crete) crete = Math.abs(x);
    a += x * Math.cos(W50 * t);
    b += x * Math.sin(W50 * t);
  }
  const eff = Math.sqrt(s2 / n);
  const moy = s1 / n;
  const fond = (Math.hypot(a, b) * 2) / n / R2;
  return { eff, moy, lectureMoy: FF_SINUS * moy, crete, fond };
}

/* --------------------------------------------------------------------------
   Initialisation et nettoyage
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  detruire();
  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireMasse(racine, api);
  construireMultimetres(racine, api);
  construireBande(racine, api);
  construireCompensation(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  ressources.push(
    api.reveler(racine.querySelectorAll(".formule-cle, .encadre, #f-comparatif, #e-statut-tableau, #h-tableau, #i-procedure"), { decalage: 0.05 })
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
    ["#e-entree-figure svg", 2.2],
    ["#e-sonde-figure svg", 2.2],
    ["#e-diff-figure svg", 2],
    ["#f-schema-principal svg", 2.6],
    ["#h-montage-figure svg", 2.2],
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
      id: "c1-coupure",
      titre: "Fréquence de coupure d'un passe-bas RC",
      niveau: "fondamental",
      enonce: "<p>Un passe-bas du premier ordre comporte $R = 1\\ \\mathrm{k\\Omega}$ et $C = 100\\ \\mathrm{nF}$. Quelle est sa fréquence de coupure à $-3\\ \\mathrm{dB}$, en hertz ?</p>",
      valeur: 1 / (2 * Math.PI * 1e3 * 100e-9),
      unite: "Hz",
      tolerance: 0.02,
      chiffres: 4,
      libelleChamp: "Fréquence de coupure",
      etapes: [
        { texte: "$f_c = \\dfrac{1}{2\\pi RC}$, avec $RC = 10^3 \\times 10^{-7} = 10^{-4}\\ \\mathrm{s}$." },
        { texte: "$f_c = \\dfrac{1}{2\\pi \\times 10^{-4}} = 1592\\ \\mathrm{Hz}$." },
        { texte: "À cette fréquence, le gain vaut $1/\\sqrt{2}$ et la phase $-45^\\circ$.", note: "C'est la définition de la bande passante d'un oscilloscope : le point à $-3\\ \\mathrm{dB}$, pas le point de mesure exacte." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Gain du passe-bas en fonction de la fréquence",
          xTitre: "fréquence",
          xUnite: "kHz",
          yTitre: "gain",
          yUnite: "",
          xMin: 0,
          xMax: 8,
          yMin: 0,
          yMax: 1.05,
          series: [{ id: "g", nom: "gain |H|", fonction: (fk) => 1 / Math.sqrt(1 + (fk / 1.5915) ** 2) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 1 / R2, "0,707 soit -3 dB", [7, 5]);
            ligneV(c, r, couleurs, 1.5915, [2, 4], "fc = 1592 Hz");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-carre",
      titre: "Valeurs d'un signal carré",
      niveau: "fondamental",
      enonce: "<p>Un signal carré symétrique vaut alternativement $+10$ et $-10\\ \\mathrm{V}$. Un appareil mesure sa valeur moyenne redressée et la multiplie par $1{,}1107$, facteur de forme d'une sinusoïde. Qu'affiche-t-il, en volts ?</p>",
      valeur: 10 * FF_SINUS,
      unite: "V",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Valeur affichée",
      etapes: [
        { texte: "Valeur efficace du carré : $\\sqrt{\\overline{x^2}} = \\sqrt{100} = 10\\ \\mathrm{V}$." },
        { texte: "Valeur moyenne redressée : $\\overline{|x|} = 10\\ \\mathrm{V}$." },
        { texte: "Affichage : $1{,}1107 \\times 10 = 11{,}11\\ \\mathrm{V}$, soit $11{,}1\\ \\%$ de trop.", note: "Le facteur $1{,}1107 = \\pi/(2\\sqrt{2})$ n'est juste que pour une sinusoïde." },
      ],
      visuelCorrection: correctionEtapes(
        ["valeur efficace : √(10²) = 10 V", "valeur moyenne redressée : 10 V", "affiché : 1,1107 × 10 = 11,11 V (+11,1 %)"],
        "Un étalonnage en sinusoïde appliqué à un carré."
      ),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c3-montee",
      titre: "Temps de montée d'un premier ordre",
      niveau: "fondamental",
      enonce: "<p>Un premier ordre a une constante de temps $\\tau = 1\\ \\mathrm{\\mu s}$. Quel est son temps de montée de $10$ à $90\\ \\%$, en microsecondes ?</p>",
      valeur: Math.log(9),
      unite: "µs",
      tolerance: 0.02,
      chiffres: 4,
      libelleChamp: "Temps de montée",
      etapes: [
        { texte: "Réponse indicielle : $s(t) = 1 - e^{-t/\\tau}$. On cherche $t_{10}$ et $t_{90}$." },
        { texte: "$t_{10} = \\tau\\ln(1/0{,}9) = 0{,}105\\,\\tau$ et $t_{90} = \\tau\\ln 10 = 2{,}303\\,\\tau$." },
        { texte: "$t_m = t_{90} - t_{10} = \\tau\\ln 9 = 2{,}197\\ \\mathrm{\\mu s}$.", note: "Avec $B = 1/(2\\pi\\tau)$, on obtient $t_m B = \\ln 9/(2\\pi) = 0{,}35$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réponse indicielle et repères 10 et 90 %",
          xTitre: "temps",
          xUnite: "µs",
          yTitre: "sortie",
          yUnite: "",
          xMin: 0,
          xMax: 5,
          yMin: 0,
          yMax: 1.05,
          series: [{ id: "s", nom: "s(t) = 1 - exp(-t/τ)", fonction: (t) => 1 - Math.exp(-t) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0.1, "10 %", [2, 4]);
            ligneH(c, r, couleurs, 0.9, "90 %", [2, 4]);
            ligneV(c, r, couleurs, Math.log(1 / 0.9), [7, 5]);
            ligneV(c, r, couleurs, Math.log(10), [7, 5], "tm = 2,197 µs");
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Où poser la pointe et la pince de masse : poignées, curseur, tracé
   -------------------------------------------------------------------------- */

const MODES = [
  "sonde passive, oscilloscope relié à la terre",
  "sonde passive, terre de l'oscilloscope coupée (interdit)",
  "sonde différentielle, oscilloscope relié à la terre",
];

function construireMasse(racine, api) {
  const conteneur = racine.querySelector("#d-masse-vivant");
  if (!conteneur) return;

  const XB = [60, 145, 230, 315, 400, 485, 570, 655, 740];
  const Y_BORNE = 300;
  const Y_POINTE = 266;
  const Y_PINCE = 334;
  const Y_PE = 205;
  const yL = [50, 75, 100];
  const Y_N = 125;
  const Y_PLUS = 46;
  const Y_MOINS = 150;
  const yS = [70, 95, 120];
  /* Ordonnée du nœud relié à chaque borne. */
  const Y_NOEUD = [Y_PE, Y_N, yL[0], yL[1], yL[2], Y_PLUS, Y_MOINS, yS[0], yS[1]];
  const SCOPE = { x: 330, y: 376, l: 150, h: 50 };
  const DIFF = { x: 168, y: 380, l: 120, h: 42 };
  const etat = { pointe: 5, pince: 0, mode: 0 };

  const svg = svgEl("svg", {
    viewBox: "0 0 800 440",
    role: "img",
    "aria-label": "Schéma manipulable : transformateur en étoile, variateur avec pont à diodes, bus continu, onduleur et moteur, réglette de neuf points de mesure, poignée de la pointe et poignée de la pince de masse, oscilloscope relié au conducteur de protection",
  });

  const decor = svgEl("g");
  let d = "<defs>" + marqueur("d-ma-fl") + "</defs>" + TRAITS + ' stroke-width="1.7">';
  /* Transformateur, point neutre relié à la terre, PE */
  d += '<rect x="16" y="30" width="80" height="130" rx="8"/>';
  d += '<path d="M56 140L44 128M56 140L68 128M56 140V126"/>';
  d += '<path d="M56 160V' + Y_PE + '"/>';
  d += '<path d="M16 ' + Y_PE + 'H790" stroke-width="3"/>';
  d += '<path d="M30 ' + Y_PE + 'V219M22 223h16M26 229h8"/>';
  /* Phases et neutre */
  for (const y of yL) d += '<path d="M96 ' + y + 'H420"/>';
  d += '<path d="M96 ' + Y_N + 'H368" marker-end="url(#d-ma-fl)"/>';
  /* Variateur : pont, bus, condensateur, onduleur, moteur */
  d += '<rect x="408" y="24" width="244" height="150" rx="10" stroke-dasharray="3 4" stroke-width="1"/>';
  d += '<rect x="420" y="36" width="50" height="124" rx="5"/>';
  d += '<path d="M470 ' + Y_PLUS + 'H590M470 ' + Y_MOINS + 'H590"/>';
  d += '<path d="M525 ' + Y_PLUS + 'V92M511 92h28M511 101h28M525 101V' + Y_MOINS + '"/>';
  d += '<rect x="590" y="36" width="50" height="124" rx="5"/>';
  for (const y of yS) d += '<path d="M640 ' + y + 'H752"/>';
  d += '<circle cx="772" cy="95" r="18"/>';
  d += '<path d="M530 174V' + Y_PE + '"/>';
  /* Liaisons des bornes aux nœuds */
  d += "</g>" + TRAITS + ' stroke-width="1" stroke-dasharray="3 3" opacity="0.7">';
  XB.forEach((x, i) => {
    d += '<path d="M' + x + " " + Y_NOEUD[i] + "V" + (Y_BORNE - 7) + '"/>';
  });
  d += "</g>" + TRAITS + ' stroke-width="1" stroke-dasharray="1 4" opacity="0.7">';
  d += '<path d="M' + XB[0] + " " + Y_POINTE + "H" + XB[8] + '"/>';
  d += '<path d="M' + XB[0] + " " + Y_PINCE + "H" + XB[8] + '"/>';
  d += "</g>" + TRAITS + ' stroke-width="1.7">';
  XB.forEach((x) => {
    d += '<circle cx="' + x + '" cy="' + Y_BORNE + '" r="6"/>';
  });
  d += '<rect x="' + SCOPE.x + '" y="' + SCOPE.y + '" width="' + SCOPE.l + '" height="' + SCOPE.h + '" rx="6" stroke-width="2.2"/>';
  d += "</g>";
  /* Points de jonction */
  d += '<g fill="currentColor" stroke="none">';
  XB.forEach((x, i) => {
    d += '<circle cx="' + x + '" cy="' + Y_NOEUD[i] + '" r="3"/>';
  });
  d += '<circle cx="56" cy="' + Y_PE + '" r="3"/><circle cx="530" cy="' + Y_PE + '" r="3"/></g>';
  /* Libellés */
  d += ECRITS.replace('font-size="12"', 'font-size="11"');
  d += texte(22, 22, "transformateur");
  d += texte(100, 46, "L1") + texte(100, 71, "L2") + texte(100, 96, "L3") + texte(100, 121, "N");
  d += texte(300, 140, "N vers autres départs");
  d += texte(424, 172, "pont");
  d += texte(592, 172, "onduleur");
  d += texte(474, 40, "+DC") + texte(474, 166, "-DC");
  d += texte(544, 100, "C");
  d += texte(646, 64, "U") + texte(646, 89, "V") + texte(646, 114, "W");
  d += texte(766, 100, "M");
  d += texte(560, 20, "variateur");
  d += texte(590, 198, "PE, conducteur de protection");
  d += texte(22, 154, "point neutre", ' font-size="9.5"');
  XB.forEach((x, i) => {
    d += texte(x + 10, Y_BORNE - 8, BORNES[i].nom, ' font-size="11.5"');
  });
  d += texte(XB[0], Y_POINTE - 10, "pointe de la sonde : déplacer la poignée", "");
  d += texte(XB[8], Y_PINCE + 30, "pince de masse : déplacer la poignée", ' text-anchor="end"');
  d += texte(SCOPE.x + 10, SCOPE.y + 22, "oscilloscope");
  d += "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  /* Éléments dynamiques */
  const cordon = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round" });
  const coupure = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.4", "stroke-linecap": "round" });
  const cablePointe = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round" });
  const filPince = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-dasharray": "6 3" });
  const boiteDiff = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.7" });
  const defaut = svgEl("path", {
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "3.4",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-dasharray": "10 8",
    opacity: "0.9",
  });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(cordon, coupure, boiteDiff, cablePointe, filPince, defaut, etiquettes);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  /* Animation du courant de défaut : tirets qui avancent le long de la boucle. */
  let image = 0;
  let decalage = 0;
  let dernier = 0;
  let animer = false;
  function boucle(horodatage) {
    image = 0;
    if (!animer) return;
    const dt = dernier ? Math.min(0.05, (horodatage - dernier) / 1000) : 0;
    dernier = horodatage;
    decalage -= dt * 60;
    defaut.setAttribute("stroke-dashoffset", decalage.toFixed(1));
    image = requestAnimationFrame(boucle);
  }
  function lancerAnimation(actif) {
    animer = actif && !api.mouvementReduit;
    if (animer && !image) {
      dernier = 0;
      image = requestAnimationFrame(boucle);
    }
    if (!animer && image) {
      cancelAnimationFrame(image);
      image = 0;
    }
  }
  nettoyeurs.push(() => {
    animer = false;
    if (image) cancelAnimationFrame(image);
    image = 0;
  });

  /** Trajet de la boucle de défaut, de la borne touchée par la pince au point neutre. */
  function trajetDefaut(i) {
    const x = XB[i];
    let p = "M" + x + " " + Y_BORNE + "V" + Y_PINCE + "L" + (SCOPE.x + 60) + " " + SCOPE.y;
    p += "V" + (SCOPE.y + 25) + "H790V" + Y_PE + "H56V140";
    if (i === 1) p += "L96 " + Y_N + "H" + x;
    else if (i >= 2 && i <= 4) p += "L96 " + yL[i - 2] + "H" + x;
    else {
      p += "L96 " + yL[0] + "H420";
      if (i === 5) p += "L470 " + Y_PLUS + "H" + x;
      else if (i === 6) p += "L470 " + Y_MOINS + "H" + x;
      else p += "L470 " + Y_PLUS + "H590L640 " + yS[i - 7] + "H" + x;
    }
    p += "V" + (Y_BORNE - 7);
    return p;
  }

  const valeurs = api.sim.valeurs("#d-masse-valeurs", [
    { id: "affiche", libelle: "Tension affichée, crête", format: (v) => v },
    { id: "eff", libelle: "Tension affichée, valeur efficace", format: (v) => v },
    { id: "idef", libelle: "Courant dans le fil de masse, crête", format: (v) => v },
    { id: "chassis", libelle: "Potentiel du châssis, crête", format: (v) => v },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#d-masse-trace", {
    titre: "Tension affichée par l'oscilloscope",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "tension",
    yUnite: "V",
    xMin: 0,
    xMax: 40,
    yMin: -700,
    yMax: 700,
    ratio: 0.4,
    echantillons: 6000,
    series: [
      { id: "aff", nom: "tension affichée" },
      { id: "pince", nom: "potentiel de la pince par rapport à la terre" },
    ],
    note: "Modèle simplifié : bus de $540\\ \\mathrm{V}$, mode commun du pont à diodes, modulation à $4\\ \\mathrm{kHz}$ et $m = 0{,}9$.",
  });
  if (trace) ressources.push(trace);

  function maxAbs(f) {
    let m = 0;
    for (let i = 0; i < 4000; i += 1) m = Math.max(m, Math.abs(f((i * 0.04) / 4000)));
    return m;
  }

  function efficace(f) {
    let s = 0;
    const n = 8000;
    for (let i = 0; i < n; i += 1) {
      const x = f((i * 0.04) / n);
      s += x * x;
    }
    return Math.sqrt(s / n);
  }

  function toutRecalculer() {
    const ip = Math.round(etat.pointe);
    const ic = Math.round(etat.pince);
    const mode = Math.round(etat.mode);
    const vp = BORNES[ip].v;
    const vc = BORNES[ic].v;
    const xp = XB[ip];
    const xc = XB[ic];

    /* Câbles de la sonde et cordon secteur */
    const entreeX = mode === 2 ? DIFF.x + 30 : SCOPE.x + 30;
    const entreeY = mode === 2 ? DIFF.y : SCOPE.y;
    cablePointe.setAttribute("d", "M" + xp + " " + Y_POINTE + "C" + xp + " " + (Y_POINTE + 60) + " " + entreeX + " " + (entreeY - 70) + " " + entreeX + " " + entreeY);
    const masseX = mode === 2 ? DIFF.x + 90 : SCOPE.x + 60;
    filPince.setAttribute("d", "M" + xc + " " + Y_PINCE + "L" + masseX + " " + entreeY);
    cordon.setAttribute("d", "M" + (SCOPE.x + SCOPE.l) + " " + (SCOPE.y + 25) + "H790V" + Y_PE);
    coupure.setAttribute("d", mode === 1 ? "M776 300h28M782 312l16 -24" : "");
    boiteDiff.innerHTML =
      mode === 2
        ? '<rect x="' + DIFF.x + '" y="' + DIFF.y + '" width="' + DIFF.l + '" height="' + DIFF.h + '" rx="6"/><path d="M' + (DIFF.x + DIFF.l) + " " + (DIFF.y + 21) + "H" + SCOPE.x + '"/>'
        : "";

    let lib = "";
    if (mode === 2) {
      lib += texte(DIFF.x + 8, DIFF.y + 17, "sonde");
      lib += texte(DIFF.x + 8, DIFF.y + 33, "différentielle");
    }
    if (mode === 1) lib += texte(700, 330, "terre coupée", ' text-anchor="end"');
    lib += texte(SCOPE.x + SCOPE.l + 8, SCOPE.y + 42, "cordon secteur");
    etiquettes.innerHTML = lib;

    const pinceTerre = ic === 0;
    const enDefaut = mode === 0 && !pinceTerre;
    const crPince = maxAbs(vc);

    defaut.setAttribute("d", enDefaut ? trajetDefaut(ic) : "");
    lancerAnimation(enDefaut);

    /* Tension affichée */
    let fAff = null;
    if (mode === 0 && pinceTerre) fAff = vp;
    else if (mode === 0 && ic === 1) fAff = (t) => vp(t) - vc(t);
    else if (mode === 1 || mode === 2) fAff = (t) => vp(t) - vc(t);
    if (trace) {
      trace.definirFonction("aff", fAff ? (tms) => fAff(tms / 1000) : () => NaN);
      trace.definirFonction("pince", (tms) => vc(tms / 1000));
    }

    const crAff = fAff ? maxAbs(fAff) : NaN;
    const effAff = fAff ? efficace(fAff) : NaN;
    let verdict = "";
    let idef = "0 A";
    let chassis = "0 V";
    if (mode === 0) {
      if (pinceTerre) {
        verdict = ip === 0 ? "Pointe et pince sur la terre : trace nulle." : "Montage correct : potentiel de la pointe par rapport à la terre.";
      } else if (ic === 1) {
        idef = nb(api, crPince / Z_BOUCLE, 0) + " A";
        verdict = "Défaut : le neutre se referme par la terre, le dispositif différentiel déclenche. À proscrire.";
      } else {
        idef = nb(api, crPince / Z_BOUCLE, 0) + " A";
        verdict = "Court-circuit franc par le fil de masse : il fond, la protection amont est sollicitée.";
      }
    } else if (mode === 1) {
      chassis = nb(api, crPince, 0) + " V";
      verdict = pinceTerre
        ? "Terre coupée : châssis sans protection, à proscrire même pince sur le PE."
        : "Danger mortel : châssis, boutons et prises BNC portés au potentiel de la pince.";
    } else {
      verdict = ip === ic ? "Pointe et référence sur la même borne : trace nulle." : "Montage correct : tension entre la pointe et la référence, sans défaut.";
    }
    if (valeurs) {
      valeurs.maj({
        affiche: fAff ? nb(api, crAff, 0) + " V" : "sans objet, court-circuit",
        eff: fAff ? nb(api, effAff, 0) + " V" : "sans objet",
        idef,
        chassis,
        verdict,
      });
    }
  }

  const formatBorne = (m) => BORNES[Math.round(typeof m === "number" ? m : m.valeur)].nom;
  const poigneePointe = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: XB[0], y: Y_POINTE },
    a: { x: XB[8], y: Y_POINTE },
    min: 0,
    max: 8,
    pas: 1,
    valeur: etat.pointe,
    libelle: "Pointe de la sonde, borne de la réglette",
    format: (m) => "pointe sur " + formatBorne(m),
    rappel(m) {
      etat.pointe = typeof m === "number" ? m : m.valeur;
      toutRecalculer();
    },
  });
  if (poigneePointe) ressources.push(poigneePointe);

  const poigneePince = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: XB[0], y: Y_PINCE },
    a: { x: XB[8], y: Y_PINCE },
    min: 0,
    max: 8,
    pas: 1,
    valeur: etat.pince,
    libelle: "Pince de masse ou entrée de référence, borne de la réglette",
    format: (m) => "pince sur " + formatBorne(m),
    rappel(m) {
      etat.pince = typeof m === "number" ? m : m.valeur;
      toutRecalculer();
    },
  });
  if (poigneePince) ressources.push(poigneePince);

  const curseurs = api.sim.curseurs(
    "#d-masse-curseurs",
    [{ id: "mode", libelle: "Montage", min: 0, max: 2, pas: 1, valeur: 0, format: (v) => MODES[Math.round(v)] }],
    (v) => {
      etat.mode = v.mode;
      toutRecalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  toutRecalculer();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.8 }));
}

/* --------------------------------------------------------------------------
   E. Ce que lit chaque multimètre : curseurs, tracé, lecteur
   -------------------------------------------------------------------------- */

const FORMES = [
  "sinusoïde 230 V",
  "carré ± 230 V",
  "triangle 230 V efficaces",
  "courant d'un pont à diodes",
  "tension entre phases d'un onduleur",
];

function construireMultimetres(racine, api) {
  if (!racine.querySelector("#e-trms-trace")) return;
  const T = 0.02;
  const etat = { forme: 3, beta: 60, m: 0.9, u: 1 };
  let f = formeOnde(3, 60, 0.9);
  let stats = statistiques(f, T, 20000);

  const valeurs = api.sim.valeurs("#e-trms-valeurs", [
    { id: "eff", libelle: "Valeur efficace vraie (TRMS)", format: (v) => v },
    { id: "moy", libelle: "Lecture d'un appareil à valeur moyenne", format: (v) => v },
    { id: "fond", libelle: "Fondamental, mode filtre passe-bas", format: (v) => v },
    { id: "fc", libelle: "Facteur de crête", format: (v) => v },
    { id: "err", libelle: "Erreur de l'appareil à valeur moyenne", format: (v) => v },
    { id: "partiel", libelle: "Portion intégrée : efficace et lecture moyenne", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const unite = () => (etat.forme === 3 ? "A" : "V");

  const trace = api.sim.traceur("#e-trms-trace", {
    titre: "Une période du signal et les trois lectures",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "valeur instantanée",
    yUnite: "V ou A",
    xMin: 0,
    xMax: 20,
    yMin: -600,
    yMax: 600,
    ratio: 0.45,
    echantillons: 2400,
    series: [{ id: "x", nom: "signal x(t)" }],
    surDessin({ c, repere: r, couleurs }) {
      const x0 = r.versX(0);
      const x1 = r.versX(etat.u * 20);
      c.save();
      c.globalAlpha = 0.1;
      c.fillStyle = couleurs.texte;
      c.fillRect(x0, r.boite.y, Math.max(0, x1 - x0), r.boite.h);
      c.restore();
      const u = unite();
      ligneH(c, r, couleurs, stats.eff, "efficace vraie " + nb(api, stats.eff, 1) + " " + u, [8, 5]);
      ligneH(c, r, couleurs, stats.lectureMoy, "valeur moyenne " + nb(api, stats.lectureMoy, 1) + " " + u, [2, 4], true);
      ligneH(c, r, couleurs, -stats.fond, "fondamental " + nb(api, stats.fond, 1) + " " + u + " (reporté sous l'axe)", [10, 4, 2, 4], true);
    },
  });
  if (trace) ressources.push(trace);

  function majPartiel() {
    if (!valeurs) return;
    const u = Math.max(0.002, etat.u);
    const p = statistiques(f, T * u, Math.max(200, Math.round(20000 * u)));
    valeurs.maj({ partiel: nb(api, p.eff, 1) + " et " + nb(api, p.lectureMoy, 1) + " " + unite() + " sur " + nb(api, u * 20, 1) + " ms" });
  }

  function recalculer() {
    f = formeOnde(etat.forme, etat.beta, etat.m);
    stats = statistiques(f, T, 20000);
    const ech = etat.forme === 3 ? 120 : etat.forme === 4 ? 600 : 420;
    if (trace) {
      trace.definirPlage({ yMin: -ech, yMax: ech });
      trace.definirFonction("x", (tms) => f(tms / 1000));
    }
    if (valeurs) {
      const u = unite();
      valeurs.maj({
        eff: nb(api, stats.eff, 1) + " " + u,
        moy: nb(api, stats.lectureMoy, 1) + " " + u,
        fond: nb(api, stats.fond, 1) + " " + u,
        fc: nb(api, stats.crete / stats.eff, 2),
        err: (stats.lectureMoy >= stats.eff ? "+" : "") + nb(api, (stats.lectureMoy / stats.eff - 1) * 100, 1) + " %",
      });
    }
    majPartiel();
  }

  const curseurs = api.sim.curseurs(
    "#e-trms-curseurs",
    [
      { id: "forme", libelle: "Forme d'onde", min: 0, max: 4, pas: 1, valeur: etat.forme, format: (v) => FORMES[Math.round(v)] },
      { id: "beta", libelle: "Angle de conduction du courant de redresseur", min: 30, max: 180, pas: 5, valeur: etat.beta, unite: "°" },
      { id: "m", libelle: "Taux de modulation de l'onduleur", min: 0.1, max: 1, pas: 0.05, valeur: etat.m, chiffres: 2 },
    ],
    (v) => {
      etat.forme = Math.round(v.forme);
      etat.beta = v.beta;
      etat.m = v.m;
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-trms-lecteur", {
    de: 0,
    a: 1,
    duree: 8,
    boucle: false,
    auto: false,
    libelle: "Intégration sur une période",
    rappel: (u) => {
      etat.u = u;
      majPartiel();
      if (trace) trace.demanderRendu();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(1);
  }
  recalculer();
}

/* --------------------------------------------------------------------------
   E. Front vrai et front affiché : curseurs, tracé, lecteur
   -------------------------------------------------------------------------- */

function construireBande(racine, api) {
  if (!racine.querySelector("#e-bande-trace")) return;
  const etat = { ts: 10, bo: 50, bs: 500 };
  let synchro = false;

  function calcul() {
    const to = 350 / etat.bo;
    const tsd = 350 / etat.bs;
    const chaine = Math.hypot(to, tsd);
    const aff = Math.hypot(etat.ts, chaine);
    return { to, tsd, chaine, aff };
  }

  const valeurs = api.sim.valeurs("#e-bande-valeurs", [
    { id: "to", libelle: "Temps de montée de l'oscilloscope 0,35/B", format: (v) => v },
    { id: "ts", libelle: "Temps de montée de la sonde", format: (v) => v },
    { id: "ch", libelle: "Chaîne sonde et oscilloscope", format: (v) => v },
    { id: "aff", libelle: "Front affiché", format: (v) => v },
    { id: "err", libelle: "Erreur sur le temps de montée", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  let r = calcul();
  const trace = api.sim.traceur("#e-bande-trace", {
    titre: "Front vrai et front affiché",
    xTitre: "temps",
    xUnite: "ns",
    yTitre: "tension normalisée",
    yUnite: "",
    xMin: 0,
    xMax: 60,
    yMin: -0.05,
    yMax: 1.1,
    ratio: 0.42,
    echantillons: 500,
    series: [
      { id: "vrai", nom: "front vrai du signal" },
      { id: "aff", nom: "front affiché après sonde et oscilloscope" },
    ],
    surDessin({ c, repere: rp, couleurs }) {
      ligneH(c, rp, couleurs, 0.1, "10 %", [2, 4]);
      ligneH(c, rp, couleurs, 0.9, "90 %", [2, 4]);
    },
  });
  if (trace) ressources.push(trace);

  function recalculer() {
    r = calcul();
    const xMax = Math.max(30, 3.2 * r.aff);
    const t0 = xMax / 2;
    if (trace) {
      trace.definirPlage({ xMin: 0, xMax });
      trace.definirFonction("vrai", (t) => frontGaussien(t, t0, etat.ts));
      trace.definirFonction("aff", (t) => frontGaussien(t, t0, r.aff));
    }
    if (valeurs) {
      valeurs.maj({
        to: nb(api, r.to, 2) + " ns",
        ts: nb(api, r.tsd, 2) + " ns",
        ch: nb(api, r.chaine, 2) + " ns, soit " + nb(api, 350 / r.chaine, 0) + " MHz",
        aff: nb(api, r.aff, 2) + " ns",
        err: "+" + nb(api, (r.aff / etat.ts - 1) * 100, 1) + " %",
      });
    }
  }

  let lecteur = null;
  const curseurs = api.sim.curseurs(
    "#e-bande-curseurs",
    [
      { id: "ts", libelle: "Temps de montée du signal", min: 2, max: 100, pas: 1, valeur: etat.ts, unite: "ns" },
      { id: "bo", libelle: "Bande passante de l'oscilloscope", min: 20, max: 500, pas: 5, valeur: etat.bo, unite: "MHz" },
      { id: "bs", libelle: "Bande passante de la sonde", min: 10, max: 500, pas: 5, valeur: etat.bs, unite: "MHz" },
    ],
    (v) => {
      etat.ts = v.ts;
      etat.bo = v.bo;
      etat.bs = v.bs;
      if (!synchro && lecteur) lecteur.suivre(etat.bo);
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#e-bande-lecteur", {
    de: 20,
    a: 500,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Balayage de la bande passante de l'oscilloscope",
    rappel: (b) => {
      etat.bo = Math.round(b / 5) * 5;
      synchro = true;
      if (curseurs) curseurs.definir("bo", etat.bo);
      synchro = false;
      recalculer();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(50);
  }
  recalculer();
}

/* --------------------------------------------------------------------------
   E. Compensation d'une sonde x 10 : curseurs, tracé, lecteur
   -------------------------------------------------------------------------- */

const SONDE = { rt: 9e6, re: 1e6, ct: 10e-12, ce: 15e-12, e: 5, f: 1000 };

/** Réponse périodique établie de la sonde au carré de calibrage, ramenée à la pointe (x 10). */
function reponseSonde(ck, ccable) {
  const cs = ccable + SONDE.ce + ck;
  const a0 = SONDE.ct / (SONDE.ct + cs);
  const af = SONDE.re / (SONDE.rt + SONDE.re);
  const tau = ((SONDE.rt * SONDE.re) / (SONDE.rt + SONDE.re)) * (SONDE.ct + cs);
  const T = 1 / SONDE.f;
  const H = SONDE.e / (1 + Math.exp(-T / (2 * tau)));
  const signal = (t) => {
    const ph = (((t % T) + T) % T);
    if (ph < T / 2) return 10 * (af * SONDE.e + (a0 - af) * H * Math.exp(-ph / tau));
    return 10 * (a0 - af) * -H * Math.exp(-(ph - T / 2) / tau);
  };
  return { cs, a0, af, tau, signal, ckExacte: (SONDE.rt / SONDE.re) * SONDE.ct - ccable - SONDE.ce };
}

function construireCompensation(racine, api) {
  if (!racine.querySelector("#e-comp-trace")) return;
  const etat = { ck: 5, cc: 60 };
  let synchro = false;

  const valeurs = api.sim.valeurs("#e-comp-valeurs", [
    { id: "exact", libelle: "Ck de compensation exacte", format: (v) => v },
    { id: "cs", libelle: "Capacité côté oscilloscope Cs", format: (v) => v },
    { id: "ecart", libelle: "Écart juste après le front", format: (v) => v },
    { id: "tau", libelle: "Constante de temps", format: (v) => v },
    { id: "etat", libelle: "État de la sonde", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#e-comp-trace", {
    titre: "Carré de calibrage appliqué et carré affiché",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "tension ramenée à la pointe",
    yUnite: "V",
    xMin: 0,
    xMax: 2,
    yMin: -0.6,
    yMax: 7,
    ratio: 0.42,
    echantillons: 800,
    series: [
      { id: "vrai", nom: "carré appliqué à la pointe" },
      { id: "aff", nom: "carré affiché, ramené à la pointe" },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 5, "5 V", [2, 4]);
    },
  });
  if (trace) ressources.push(trace);

  function recalculer() {
    const r = reponseSonde(etat.ck * 1e-12, etat.cc * 1e-12);
    if (trace) {
      trace.definirFonction("vrai", (tms) => {
        const ph = (((tms / 1000) % 0.001) + 0.001) % 0.001;
        return ph < 0.0005 ? 5 : 0;
      });
      trace.definirFonction("aff", (tms) => r.signal(tms / 1000));
    }
    const ecart = (r.a0 / r.af - 1) * 100;
    let libelle = "compensée";
    if (ecart > 0.5) libelle = "surcompensée : pointes sur les fronts";
    else if (ecart < -0.5) libelle = "sous-compensée : fronts arrondis";
    if (valeurs) {
      valeurs.maj({
        exact: nb(api, r.ckExacte * 1e12, 1) + " pF",
        cs: nb(api, r.cs * 1e12, 1) + " pF",
        ecart: (ecart >= 0 ? "+" : "") + nb(api, ecart, 1) + " %",
        tau: nb(api, r.tau * 1e6, 1) + " µs",
        etat: libelle,
      });
    }
  }

  let lecteur = null;
  const curseurs = api.sim.curseurs(
    "#e-comp-curseurs",
    [
      { id: "ck", libelle: "Condensateur de compensation Ck", min: 0, max: 30, pas: 0.5, valeur: etat.ck, unite: "pF" },
      { id: "cc", libelle: "Capacité du câble", min: 40, max: 100, pas: 1, valeur: etat.cc, unite: "pF" },
    ],
    (v) => {
      etat.ck = v.ck;
      etat.cc = v.cc;
      if (!synchro && lecteur) lecteur.suivre(etat.ck);
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#e-comp-lecteur", {
    de: 0,
    a: 30,
    duree: 9,
    boucle: false,
    auto: false,
    libelle: "Rotation de la vis de compensation",
    rappel: (ck) => {
      etat.ck = Math.round(ck * 2) / 2;
      synchro = true;
      if (curseurs) curseurs.definir("ck", etat.ck);
      synchro = false;
      recalculer();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(5);
  }
  recalculer();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/** Schéma de la boucle de défaut d'une pince de masse posée sur le -DC. */
function dessinBoucleDefaut(id) {
  let d = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.7">';
  d += '<rect x="30" y="30" width="150" height="110" rx="8"/>';
  d += '<path d="M180 60H260M180 110H230"/>';
  d += '<rect x="330" y="150" width="170" height="60" rx="6" stroke-width="2.2"/>';
  d += '<path d="M260 60V150H380M230 110V170H330"/>';
  d += '<path d="M500 180H600V250H40V140"/>';
  d += '<path d="M40 250V262M32 266h16M36 272h8"/>';
  d += "</g>" + TRAITS + ' stroke-width="3" stroke-dasharray="9 6">';
  d += '<path d="M230 110V170H330M500 180H600V250H60V120H180V110" marker-end="url(#' + id + ')"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  d += texte(42, 52, "variateur") + texte(42, 70, "pont à diodes") + texte(42, 88, "référencé à la terre");
  d += texte(188, 54, "U") + texte(188, 104, "-DC ≈ -270 V");
  d += texte(266, 136, "pointe");
  d += texte(236, 190, "pince");
  d += texte(342, 176, "oscilloscope");
  d += texte(342, 194, "châssis relié au PE");
  d += texte(510, 172, "cordon, PE");
  d += texte(260, 244, "conducteur de protection et terre");
  d += texte(70, 116, "retour par le pont");
  d += texte(330, 280, "tirets : boucle du courant de défaut, quelques dixièmes d'ohm");
  d += "</g>";
  return d;
}

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : erreur d'insertion d'un ampèremètre */
  const iVraie = 24 / 48;
  const iLue = 24 / 48.1;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-amperemetre",
      titre: "Erreur d'insertion d'un ampèremètre",
      niveau: "fondamental",
      enonce:
        "<p>On mesure le courant de la bobine du contacteur KM1 du projet fil rouge, $48\\ \\Omega$ sous $24\\ \\mathrm{V}$ continus, avec un multimètre dont la résistance totale sur le calibre utilisé, shunt, fusible et cordons, vaut $R_A = 0{,}1\\ \\Omega$. Quelle est l'erreur relative d'insertion, en pour cent, signe compris ?</p>",
      valeur: (iLue / iVraie - 1) * 100,
      unite: "%",
      tolerance: 0.03,
      chiffres: 3,
      libelleChamp: "Erreur relative",
      etapes: [
        { texte: "Sans appareil : $I = 24/48 = 0{,}5000\\ \\mathrm{A}$." },
        { texte: "Avec l'appareil en série : $I_{\\mathrm{lu}} = 24/(48 + 0{,}1) = 0{,}4990\\ \\mathrm{A}$." },
        { texte: "$\\varepsilon_A = -R_A/(R + R_A) = -0{,}1/48{,}1 = -0{,}208\\ \\%$ ; tension de charge $0{,}4990 \\times 0{,}1 = 49{,}9\\ \\mathrm{mV}$.", note: "Erreur négligeable ici, mais elle devient majeure sur une maille de quelques ohms ou sur le calibre milliampère, de résistance plus élevée." },
      ],
      visuelCorrection: correctionEtapes(
        ["I = E / R = 24 / 48 = 0,5000 A", "I lu = E / (R + RA) = 24 / 48,1 = 0,4990 A", "ε = - RA / (R + RA) = - 0,1 / 48,1 = - 0,208 %", "tension de charge : 0,4990 × 0,1 = 49,9 mV"],
        "L'ampèremètre ajoute sa résistance à la maille."
      ),
    })
  );

  /* Fondamental 2 : appareil à valeur moyenne sur un carré */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-valeur-moyenne",
      titre: "Lecture d'un appareil à valeur moyenne",
      niveau: "fondamental",
      enonce:
        "<p>Un multimètre à valeur moyenne redressée, étalonné en valeur efficace d'une sinusoïde, mesure un signal carré symétrique de $\\pm 12\\ \\mathrm{V}$. Qu'affiche-t-il, en volts ?</p>",
      valeur: 12 * FF_SINUS,
      unite: "V",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Valeur affichée",
      etapes: [
        { texte: "Valeur moyenne redressée du carré : $\\overline{|x|} = 12\\ \\mathrm{V}$ ; valeur efficace vraie : $12\\ \\mathrm{V}$." },
        { texte: "Affichage : $1{,}1107 \\times 12 = 13{,}33\\ \\mathrm{V}$." },
        { texte: "Erreur : $+11{,}1\\ \\%$, puisque le facteur de forme du carré vaut $1$ au lieu de $1{,}1107$.", note: "Un appareil TRMS afficherait $12{,}00\\ \\mathrm{V}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Le carré, sa valeur efficace et la lecture à valeur moyenne",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 40,
          yMin: -16,
          yMax: 16,
          series: [{ id: "x", nom: "carré ± 12 V", fonction: (t) => (Math.sin((2 * Math.PI * t) / 20) >= 0 ? 12 : -12) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 12, "efficace vraie 12,00 V", [8, 5], true);
            ligneH(c, r, couleurs, 12 * FF_SINUS, "lecture à valeur moyenne 13,33 V", [2, 4]);
          },
        });
      },
    })
  );

  /* Intermédiaire 1 : bande passante nécessaire */
  const tmMax = Math.sqrt((1.05 * 20) ** 2 - 20 ** 2 - 0.7 ** 2);
  const bMin = 350 / tmMax;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-bande",
      titre: "Bande passante pour mesurer un front",
      niveau: "intermédiaire",
      enonce:
        "<p>On veut mesurer un front de $20\\ \\mathrm{ns}$ avec une erreur au plus de $5\\ \\%$ sur le temps de montée affiché. La sonde a une bande passante de $500\\ \\mathrm{MHz}$. Avec $t_m B = 0{,}35$ et la composition quadratique, quelle bande passante minimale faut-il à l'oscilloscope, en mégahertz ?</p>",
      valeur: bMin,
      unite: "MHz",
      tolerance: 0.03,
      chiffres: 3,
      libelleChamp: "Bande passante minimale",
      etapes: [
        { texte: "Front affiché admis : $1{,}05 \\times 20 = 21\\ \\mathrm{ns}$. Sonde : $t_{m,s} = 0{,}35/500\\ \\mathrm{MHz} = 0{,}7\\ \\mathrm{ns}$." },
        { texte: "$t_{m,o}^2 \\leq 21^2 - 20^2 - 0{,}7^2 = 441 - 400 - 0{,}49 = 40{,}51\\ \\mathrm{ns^2}$, soit $t_{m,o} \\leq 6{,}36\\ \\mathrm{ns}$." },
        { texte: "$B \\geq 0{,}35/6{,}36\\ \\mathrm{ns} = 55{,}0\\ \\mathrm{MHz}$ ; on choisit la gamme commerciale au-dessus, $100\\ \\mathrm{MHz}$.", note: "La règle simple de trois fois plus rapide que le signal donne $52{,}5\\ \\mathrm{MHz}$ : même ordre de grandeur." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Erreur sur le temps de montée selon la bande passante",
          xTitre: "bande passante de l'oscilloscope",
          xUnite: "MHz",
          yTitre: "erreur",
          yUnite: "%",
          xMin: 20,
          xMax: 300,
          yMin: 0,
          yMax: 40,
          series: [{ id: "e", nom: "erreur du front affiché", fonction: (b) => (Math.sqrt(400 + (350 / b) ** 2 + 0.49) / 20 - 1) * 100 }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 5, "5 %", [7, 5]);
            ligneV(c, r, couleurs, bMin, [2, 4], "55 MHz");
          },
        });
      },
    })
  );

  /* Intermédiaire 2 : condensateur de compensation */
  const ckK4 = 9 * 12 - 70 - 20;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-compensation",
      titre: "Réglage d'une sonde x 10",
      niveau: "intermédiaire",
      enonce:
        "<p>Une sonde $\\times 10$ a $R_t = 9\\ \\mathrm{M\\Omega}$ et $C_t = 12\\ \\mathrm{pF}$ ; son câble présente $70\\ \\mathrm{pF}$ et la voie de l'oscilloscope $1\\ \\mathrm{M\\Omega}$ et $20\\ \\mathrm{pF}$. Quelle valeur du condensateur de compensation $C_k$ rend le rapport indépendant de la fréquence, en picofarads ?</p>",
      valeur: ckK4,
      unite: "pF",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "Capacité Ck",
      etapes: [
        { texte: "Condition : $R_tC_t = R_eC_s$, d'où $C_s = (9/1) \\times 12 = 108\\ \\mathrm{pF}$." },
        { texte: "$C_k = C_s - C_{\\text{câble}} - C_e = 108 - 70 - 20 = 18\\ \\mathrm{pF}$." },
        { texte: "Constante de temps : $\\tau = 0{,}9\\ \\mathrm{M\\Omega} \\times (12 + 108)\\ \\mathrm{pF} = 108\\ \\mathrm{\\mu s}$.", note: "Sur une autre voie de $15\\ \\mathrm{pF}$, il faudrait $23\\ \\mathrm{pF}$ : on recompense en changeant de voie." },
      ],
      visuelCorrection(conteneur, moteur) {
        const rep = (ck) => {
          const cs = 70 + 20 + ck;
          const a0 = 12 / (12 + cs);
          const tau = 0.9e6 * (12 + cs) * 1e-12;
          return (tms) => 10 * 5 * (0.1 + (a0 - 0.1) * Math.exp(-tms / 1000 / tau));
        };
        traceCorrection(moteur, conteneur, {
          titre: "Réponse à un échelon de 5 V, ramenée à la pointe",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 0.5,
          yMin: 3,
          yMax: 7,
          series: [
            { id: "a", nom: "Ck = 10 pF, surcompensée", fonction: rep(10) },
            { id: "b", nom: "Ck = 18 pF, compensée", fonction: rep(18) },
            { id: "c", nom: "Ck = 26 pF, sous-compensée", fonction: rep(26) },
          ],
        });
      },
    })
  );

  /* Avancé : tension fantôme */
  const xc = 1 / (W50 * 2.4e-9);
  const v10M = (230 * 10e6) / Math.hypot(10e6, xc);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-fantome",
      titre: "Tension fantôme et mode basse impédance",
      niveau: "avancé",
      enonce:
        "<p>Un câble déconnecté chemine sur $60\\ \\mathrm{m}$ à côté d'une phase à $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$, avec une capacité de couplage de $40\\ \\mathrm{pF/m}$. On néglige sa capacité vers la terre. Quelle tension lit un voltmètre de $10\\ \\mathrm{M\\Omega}$ branché entre ce conducteur et le PE, en volts ? La correction donne aussi la lecture en mode basse impédance de $3\\ \\mathrm{k\\Omega}$ et la conclusion à en tirer.</p>",
      valeur: v10M,
      unite: "V",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Lecture à 10 MΩ",
      etapes: [
        { texte: "Capacité de couplage : $C_c = 60 \\times 40 = 2400\\ \\mathrm{pF} = 2{,}4\\ \\mathrm{nF}$ ; réactance $X_c = 1/(2\\pi \\times 50 \\times 2{,}4 \\times 10^{-9}) = 1{,}326\\ \\mathrm{M\\Omega}$." },
        { texte: "Diviseur capacitif et résistif : $V = 230\\,R_V/\\sqrt{R_V^2 + X_c^2} = 230 \\times 10/\\sqrt{100 + 1{,}759} = 228{,}0\\ \\mathrm{V}$." },
        { texte: "En basse impédance : $V = 230 \\times 3 \\times 10^3/\\sqrt{(3 \\times 10^3)^2 + X_c^2} = 0{,}52\\ \\mathrm{V}$." },
        { texte: "Conclusion : la tension s'effondre, elle est induite ; une vraie tension de source, de faible impédance, ne baisserait presque pas. Mais aucune lecture d'un voltmètre ne vaut vérification d'absence de tension.", note: "Le mode basse impédance fait circuler quelques dizaines de milliampères : jamais sur un circuit électronique sensible." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Lecture du voltmètre selon sa résistance d'entrée",
          xTitre: "logarithme décimal de la résistance d'entrée en ohms",
          xUnite: "",
          yTitre: "tension lue",
          yUnite: "V",
          xMin: 3,
          xMax: 8,
          yMin: 0,
          yMax: 240,
          series: [{ id: "v", nom: "tension lue", fonction: (lg) => (230 * 10 ** lg) / Math.hypot(10 ** lg, xc) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneV(c, r, couleurs, Math.log10(3e3), [2, 4], "3 kΩ : 0,52 V");
            ligneV(c, r, couleurs, 7, [7, 5], "10 MΩ : 228 V");
            ligneV(c, r, couleurs, Math.log10(xc), [1, 3], "Xc");
          },
        });
      },
    })
  );

  /* Diagnostic industriel */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-diagnostic",
      titre: "Claquement à la mise sous tension",
      niveau: "diagnostic",
      enonce:
        "<p>Un technicien veut observer la tension entre la sortie U du variateur de la pompe et le $-\\mathrm{DC}$ de son bus. Il branche un oscilloscope de table, alimenté par une prise ordinaire, avec une sonde passive $\\times 10$ : pointe sur U, pince de masse sur $-\\mathrm{DC}$. À la mise sous tension, un claquement, le fil de masse de la sonde fond et la protection du départ déclenche. Quelles affirmations sont exactes ?</p>",
      options: [
        { texte: "La pince de masse, reliée à la terre par l'oscilloscope, a court-circuité le $-\\mathrm{DC}$ à la terre.", juste: true },
        { texte: "Le $-\\mathrm{DC}$ est à environ $-270\\ \\mathrm{V}$ de la terre, car le bus est référencé au réseau par le pont à diodes.", juste: true },
        { texte: "La sonde n'était pas compensée, d'où une surintensité." },
        { texte: "Il aurait fallu couper la terre de l'oscilloscope." },
        { texte: "Il fallait une sonde différentielle ou un oscilloscope à voies isolées de catégorie et de tension suffisantes.", juste: true },
      ],
      etapes: [
        { texte: "La masse d'une sonde passive est reliée au châssis, donc au PE : elle est déjà à la terre." },
        { texte: "Le bus est relié au réseau TN par le pont : $-\\mathrm{DC} \\approx -270\\ \\mathrm{V}$ plus le mode commun à $150\\ \\mathrm{Hz}$. La pince relie ce point à la terre par quelques dixièmes d'ohm." },
        { texte: "La compensation n'agit que sur la forme affichée, jamais sur un courant de défaut." },
        { texte: "Couper la terre supprimerait le court-circuit mais mettrait le châssis à $-270\\ \\mathrm{V}$ : danger mortel.", note: "Solution : sonde différentielle, ou voies isolées, raccordées hors tension." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(moteur, conteneur, "0 0 640 290", dessinBoucleDefaut("k6-fl"), "Boucle de défaut : -DC, pince, fil de masse, châssis, cordon, PE, terre, puis retour par le réseau et le pont.");
      },
    })
  );

  /* Question conceptuelle */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-terre",
      titre: "Pourquoi ne jamais couper la terre de l'oscilloscope",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi il ne faut jamais couper le conducteur de protection d'un oscilloscope pour faire une mesure entre deux points qui ne sont pas à la terre, et ce qu'il faut faire à la place.</p>",
      motsCles: [
        ["chassis", "boitier", "carcasse", "masse metallique"],
        ["potentiel", "tension", "sous tension"],
        ["differentiel", "isole", "isolee", "isolees"],
        ["toucher", "contact", "electrocution", "electrisation", "danger"],
      ],
      minimum: 3,
      exemple: "Trois phrases : ce que devient le châssis, le risque, la solution.",
      etapes: [
        { texte: "La masse de toutes les voies est reliée au châssis : sans terre, le châssis prend le potentiel de la pince, plusieurs centaines de volts sur un variateur." },
        { texte: "Boutons, prises BNC et carcasse deviennent des parties actives : toute personne qui les touche en même temps qu'une masse métallique ferme le circuit." },
        { texte: "La solution est une sonde différentielle, dont les deux entrées sont de haute impédance, ou un oscilloscope à voies isolées de catégorie adaptée.", note: "La protection par la terre de l'appareil est une mesure de sécurité, pas un défaut de mesure." },
      ],
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

function dessinTroisMontages() {
  let d = TRAITS + ' stroke-width="1.6">';
  for (const x0 of [10, 220, 430]) {
    d += '<rect x="' + x0 + '" y="10" width="190" height="200" rx="8" stroke-dasharray="2 4" stroke-width="1"/>';
    d += '<rect x="' + (x0 + 20) + '" y="40" width="60" height="50" rx="5"/>';
    d += '<rect x="' + (x0 + 70) + '" y="140" width="100" height="44" rx="5" stroke-width="2"/>';
    d += '<path d="M' + (x0 + 80) + " 55H" + (x0 + 120) + "V140M" + (x0 + 80) + " 78H" + (x0 + 150) + '"/>';
  }
  d += '<path d="M160 78V140" stroke-dasharray="6 3"/>';
  d += '<path d="M360 78V140" stroke-dasharray="6 3"/><path d="M290 196h40M300 204l20 -16"/>';
  d += '<rect x="540" y="96" width="50" height="30" rx="4"/><path d="M580 78V96M550 126V140"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="10.5"');
  for (const [x0, n] of [[10, "A"], [220, "B"], [430, "C"]]) {
    d += texte(x0 + 26, 30, "montage " + n);
    d += texte(x0 + 26, 68, "U, -DC");
    d += texte(x0 + 76, 166, "oscilloscope");
  }
  d += texte(84, 202, "pince sur -DC, terre");
  d += texte(294, 182, "terre coupée");
  d += texte(500, 92, "sonde diff.");
  d += texte(500, 202, "terre conservée");
  d += "</g>";
  return d;
}

const VISUELS_QUIZ = [
  etapes(["TRMS large bande : 380 V entre phases (m = 0,9)", "filtre passe-bas : fondamental 298 V = 0,612 m Vd", "le flux et le couple du moteur dépendent du fondamental"], "Tension d'un moteur sur variateur."),
  etapes(["à f = B : |H| = 1/√2 = 0,707", "erreur d'amplitude : - 29,3 %", "pour - 3 % : B ≥ 4 f environ"], "La bande passante est le point à - 3 dB."),
  etapes(["tm = 0,35 / B", "= 0,35 / 200 MHz", "= 1,75 ns"], "Temps de montée propre."),
  etapes(["× 1 : 1 MΩ et 75 à 100 pF, environ 10 MHz", "× 10 : 10 MΩ et environ 10 pF, centaines de MHz", "moins de charge capacitive, plus de bande passante"], "Sonde × 1 et sonde × 10."),
  etapes(["masse de la sonde = châssis = PE = terre", "pince sur un autre potentiel : court-circuit", "seul point admis : un point au potentiel de la terre"], "Référence d'une sonde passive."),
  () => ({ viewBox: "0 0 640 220", dessin: dessinTroisMontages(), legende: "C : sonde différentielle et terre conservée. A : court-circuit par la pince. B : châssis sous tension." }),
  etapes(["X = 1 / (2 π f C)", "= 1 / (2 π × 10⁷ × 9 × 10⁻¹²)", "= 1768 Ω"], "Charge capacitive d'une sonde × 10 à 10 MHz."),
  etapes(["catégorie de la chaîne = maillon le plus faible", "multimètre CAT III 1000 V + cordons CAT II 600 V", "= ensemble CAT II 600 V"], "Chaîne de mesure."),
  etapes(["carré : valeur moyenne redressée = 230 V", "lecture : 1,1107 × 230", "= 255,5 V (+ 11,1 %)"], "Appareil à valeur moyenne sur un carré."),
  etapes(["somme des courants dans la mâchoire", "phase + neutre : courant différentiel, la fuite", "Hall : continu et alternatif ; TC : alternatif seul"], "Pince ampèremétrique."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Pour vérifier la tension que le variateur applique au moteur, quelle lecture comparer à la loi de commande tension sur fréquence ?</p>",
        options: [
          "La valeur efficace vraie mesurée avec une large bande passante",
          "La valeur efficace du fondamental, en mode filtre passe-bas",
          "La valeur moyenne en position continu",
          "La valeur crête divisée par $\\sqrt{2}$",
        ],
        bonnes: [1],
        explication: "Le flux et le couple dépendent du fondamental : $298\\ \\mathrm{V}$ entre phases à $m = 0{,}9$ sous $540\\ \\mathrm{V}$, quand la valeur efficace vraie de la tension découpée vaut $380\\ \\mathrm{V}$.",
        resume: "Tension d'un moteur sur variateur",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Un oscilloscope de $100\\ \\mathrm{MHz}$ affiche une sinusoïde de $100\\ \\mathrm{MHz}$ avec son amplitude exacte.</p>",
        reponse: false,
        explication: "La bande passante est définie à $-3\\ \\mathrm{dB}$ : à $f = B$, l'amplitude affichée n'est plus que $70{,}7\\ \\%$ de la vraie, soit $-29{,}3\\ \\%$.",
        resume: "Définition de la bande passante",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Temps de montée propre d'une chaîne de $200\\ \\mathrm{MHz}$ de bande passante, en nanosecondes ?</p>",
        valeur: 1.75,
        unite: "ns",
        tolerance: 0.02,
        explication: "$t_m = 0{,}35/B = 0{,}35/(200 \\times 10^6) = 1{,}75\\ \\mathrm{ns}$.",
        resume: "Temps de montée et bande passante",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi préfère-t-on une sonde $\\times 10$ à une sonde $\\times 1$ pour observer un signal logique rapide ?</p>",
        motsCles: [["capacit", "charge"], ["bande", "rapide", "frequence", "front"]],
        minimum: 2,
        explication: "La sonde $\\times 10$ charge beaucoup moins le circuit, environ $10\\ \\mathrm{pF}$ au lieu de $75$ à $100\\ \\mathrm{pF}$, et sa bande passante atteint des centaines de mégahertz au lieu d'une dizaine.",
        resume: "Sonde x 1 ou x 10",
      },
      {
        type: "qcm",
        enonce: repere(4) + "<p>Avec une sonde passive sur un oscilloscope relié à la terre, où la pince de masse peut-elle être posée ?</p>",
        options: [
          "Sur un point au potentiel de la terre",
          "Sur le point le plus négatif du circuit",
          "Sur n'importe quel point, si la sonde est $\\times 10$",
          "Sur le neutre, qui est toujours à $0\\ \\mathrm{V}$",
        ],
        bonnes: [0],
        explication: "La pince est déjà à la terre par le châssis et le PE. Même le neutre, à quelques volts de la terre, ferait circuler un courant par la terre et déclencher le dispositif différentiel.",
        resume: "Où poser la pince de masse",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Trois montages pour mesurer la tension entre U et $-\\mathrm{DC}$ du variateur. Lequel est correct ?</p>",
        consigne: "Cliquez sur le montage correct.",
        viewBox: "0 0 640 220",
        dessin: dessinTroisMontages(),
        zones: [
          { x: 12, y: 12, largeur: 186, hauteur: 196, etiquette: "montage A" },
          { x: 222, y: 12, largeur: 186, hauteur: 196, etiquette: "montage B" },
          { x: 432, y: 12, largeur: 186, hauteur: 196, etiquette: "montage C", juste: true },
        ],
        explication: "C utilise une sonde différentielle avec un oscilloscope relié à la terre. A court-circuite le $-\\mathrm{DC}$ par la pince de masse ; B coupe la terre et met le châssis à environ $-270\\ \\mathrm{V}$.",
        resume: "Lecture du schéma de connexion",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Une sonde $\\times 10$ présente $9\\ \\mathrm{pF}$ vus de la pointe. Quelle est sa réactance à $10\\ \\mathrm{MHz}$, en ohms ?</p>",
        valeur: 1 / (2 * Math.PI * 1e7 * 9e-12),
        unite: "Ω",
        tolerance: 0.02,
        explication: "$X = 1/(2\\pi \\times 10^7 \\times 9 \\times 10^{-12}) = 1768\\ \\Omega$ : la sonde de $10\\ \\mathrm{M\\Omega}$ charge comme moins de deux kilohms.",
        resume: "Charge capacitive d'une sonde",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Un multimètre CAT III $1000\\ \\mathrm{V}$ utilisé avec des cordons CAT II $600\\ \\mathrm{V}$ reste utilisable en CAT III $1000\\ \\mathrm{V}$.</p>",
        reponse: false,
        explication: "La chaîne vaut son maillon le plus faible : l'ensemble n'est que CAT II $600\\ \\mathrm{V}$.",
        resume: "Catégorie d'une chaîne de mesure",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Un appareil à valeur moyenne redressée, étalonné en sinusoïde, mesure un carré de $\\pm 230\\ \\mathrm{V}$. Qu'affiche-t-il, en volts ?</p>",
        valeur: 230 * FF_SINUS,
        unite: "V",
        tolerance: 0.01,
        explication: "$1{,}1107 \\times 230 = 255{,}5\\ \\mathrm{V}$ pour $230\\ \\mathrm{V}$ efficaces vrais.",
        resume: "Valeur moyenne sur un carré",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Quelles affirmations sur les pinces ampèremétriques sont exactes ?</p>",
        options: [
          { texte: "Autour d'un câble entier, phase et neutre, elle lit le courant différentiel, c'est-à-dire la fuite.", juste: true },
          { texte: "Une pince à effet Hall mesure le courant continu, après réglage de son zéro.", juste: true },
          { texte: "Une pince à transformateur de courant mesure le courant continu." },
          { texte: "Elle ajoute une résistance série importante au circuit." },
        ],
        multiple: true,
        explication: "La pince mesure la somme des courants de sa mâchoire ; le transformateur de courant ne voit que l'alternatif ; la pince n'est insérée dans aucune maille.",
        resume: "Pince ampèremétrique",
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
      { categorie: "Insertion", question: "Quelle erreur commet un voltmètre de résistance $R_V$ sur une source de résistance $R_{\\mathrm{th}}$ ?", reponse: "$\\varepsilon_V \\approx -R_{\\mathrm{th}}/R_V$ ; un ampèremètre de résistance $R_A$ dans une maille $R$ : $\\varepsilon_A \\approx -R_A/R$." },
      { categorie: "Modes", question: "Quand un appareil à valeur moyenne redressée est-il juste ?", reponse: "Seulement sur une sinusoïde : il affiche $1{,}1107\\,\\overline{|x|}$. Carré : $+11\\ \\%$ ; courant de redresseur : $-30$ à $-50\\ \\%$." },
      { categorie: "Variateur", question: "Quelle lecture donne la tension utile d'un moteur sur variateur ?", reponse: "Le fondamental, par le mode filtre passe-bas : $0{,}612\\,m\\,V_d$ entre phases en sinus-triangle. La valeur efficace vraie est plus grande." },
      { categorie: "Basse impédance", question: "À quoi sert le mode basse impédance d'un multimètre ?", reponse: "À distinguer une tension réelle d'une tension fantôme de couplage capacitif, qui s'effondre sous quelques kilohms." },
      { categorie: "Référence", question: "Par rapport à quoi mesure un oscilloscope de table relié au secteur ?", reponse: "Par rapport à la terre : sa masse est reliée au châssis et au PE. La pince ne se pose que sur un point au potentiel de la terre." },
      { categorie: "Bande passante", question: "Que vaut l'amplitude affichée à $f = B$ ?", reponse: "$70{,}7\\ \\%$ de la vraie, $-3\\ \\mathrm{dB}$. Prendre $B$ de trois à cinq fois la fréquence utile." },
      { categorie: "Temps de montée", question: "Comment se composent les temps de montée d'une chaîne ?", reponse: "$t_{m,a} = \\sqrt{t_{m,\\mathrm{signal}}^2 + t_{m,o}^2 + t_{m,s}^2}$, avec $t_m \\approx 0{,}35/B$ pour chaque maillon." },
      { categorie: "Sonde", question: "Quelle est la condition de compensation d'une sonde $\\times 10$ ?", reponse: "$R_tC_t = R_eC_s$ : rapport indépendant de la fréquence. Surcompensée : pointes ; sous-compensée : fronts arrondis." },
      { categorie: "Fil de masse", question: "Pourquoi mesurer les fronts rapides avec l'embout de masse court ?", reponse: "Le fil de $15\\ \\mathrm{cm}$, environ $150\\ \\mathrm{nH}$, résonne avec $10\\ \\mathrm{pF}$ vers $130\\ \\mathrm{MHz}$ et capte les champs ; l'embout repousse la résonance vers $500\\ \\mathrm{MHz}$." },
      { categorie: "Sécurité", question: "Comment mesurer entre deux points qui ne sont pas à la terre ?", reponse: "Sonde différentielle ou voies isolées, de catégorie et de tension suffisantes ; jamais en coupant la terre de l'oscilloscope." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["f0 = 1 / (2 π √(L C))", "= 1 / (2 π √(100 × 10⁻⁹ × 10 × 10⁻¹²))", "= 159,2 MHz"], "Résonance du fil de masse."),
  etapes(["haute fréquence : Ct / (Ct + Cs)", "continu : Re / (Rt + Re) = 1/10, toujours", "le plateau continu reste juste"], "Compensation et tension continue."),
  etapes(["-DC = mode commun - Vd / 2", "mode commun : ± VM / 4 = ± 81 V à 150 Hz", "-DC ≈ -270 V ± 81 V par rapport à la terre"], "Potentiel du bus par rapport à la terre."),
  etapes(["a = 0,5 % × 230,0 + 2 × 0,1 = 1,15 + 0,2 = 1,35 V", "u = a / √3 = 1,35 / 1,732", "= 0,779 V"], "Spécification convertie en incertitude-type."),
  etapes(["erreur d'insertion : systématique, même signe à chaque lecture", "moyenne : réduit l'aléatoire en 1/√n", "le systématique se calcule et se corrige"], "Moyenne et erreur de méthode."),
  etapes(["tm = τ ln 9 = 2,197 τ", "= 2,197 × 5 ms", "= 10,99 ms"], "Temps de montée d'un premier ordre."),
  etapes(["I2n = Sn / (√3 U2n)", "= 100 000 / (1,732 × 410)", "= 140,8 A"], "Courant assigné basse tension du transformateur T1."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Un fil de masse de $100\\ \\mathrm{nH}$ et une capacité de pointe de $10\\ \\mathrm{pF}$ : fréquence de l'oscillation parasite, en mégahertz ?</p>",
        valeur: 1 / (2 * Math.PI * Math.sqrt(100e-9 * 10e-12)) / 1e6,
        unite: "MHz",
        tolerance: 0.02,
        explication: "$f_0 = 1/(2\\pi\\sqrt{10^{-7} \\times 10^{-11}}) = 159{,}2\\ \\mathrm{MHz}$.",
        resume: "Résonance du fil de masse",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Une sonde mal compensée fausse la mesure d'une tension continue.</p>",
        reponse: false,
        explication: "En continu, seul le rapport résistif $R_e/(R_t + R_e) = 1/10$ intervient : le plateau est juste. La compensation agit sur les fronts et les amplitudes en fréquence.",
        resume: "Compensation et continu",
      },
      {
        type: "qcm",
        enonce: repere(2) + "<p>Cette séance. Variateur alimenté par un pont à diodes sur un réseau TN, bus de $540\\ \\mathrm{V}$ : potentiel du $-\\mathrm{DC}$ par rapport à la terre ?</p>",
        options: [
          "$0\\ \\mathrm{V}$",
          "Environ $-270\\ \\mathrm{V}$, avec une ondulation de mode commun à $150\\ \\mathrm{Hz}$",
          "$-540\\ \\mathrm{V}$",
          "Indéterminé, le bus est isolé du réseau",
        ],
        bonnes: [1],
        explication: "Le pont relie le bus au réseau : $-\\mathrm{DC} \\approx -270\\ \\mathrm{V}$ et un mode commun de $\\pm 81\\ \\mathrm{V}$ à $150\\ \\mathrm{Hz}$.",
        resume: "Référence du bus continu",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours précédent. Un multimètre spécifié $\\pm(0{,}5\\ \\% + 2\\ \\mathrm{d})$ affiche $230{,}0\\ \\mathrm{V}$ avec une résolution de $0{,}1\\ \\mathrm{V}$. Incertitude-type, en volts, loi rectangulaire ?</p>",
        valeur: (0.005 * 230 + 0.2) / Math.sqrt(3),
        unite: "V",
        tolerance: 0.02,
        explication: "$a = 0{,}005 \\times 230 + 2 \\times 0{,}1 = 1{,}35\\ \\mathrm{V}$ ; $u = a/\\sqrt{3} = 0{,}779\\ \\mathrm{V}$.",
        resume: "Spécification d'un multimètre",
      },
      {
        type: "vraiFaux",
        enonce: repere(4) + "<p>Cours précédent. Moyenner un grand nombre de lectures supprime l'erreur d'insertion d'un voltmètre sur un diviseur.</p>",
        reponse: false,
        explication: "L'erreur d'insertion est systématique : la même à chaque lecture. La moyenne ne réduit que la dispersion aléatoire ; l'erreur d'insertion se calcule et se corrige.",
        resume: "Systématique et aléatoire",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours vieux d'une semaine. Temps de montée de $10$ à $90\\ \\%$ d'un premier ordre de constante de temps $5\\ \\mathrm{ms}$, en millisecondes ?</p>",
        valeur: 5 * Math.log(9),
        unite: "ms",
        tolerance: 0.02,
        explication: "$t_m = \\tau\\ln 9 = 2{,}197 \\times 5 = 10{,}99\\ \\mathrm{ms}$.",
        resume: "Temps de montée",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours vieux d'un mois. Courant assigné côté basse tension du transformateur T1 du site, $100\\ \\mathrm{kVA}$ sous $410\\ \\mathrm{V}$ entre phases, en ampères ?</p>",
        valeur: 100000 / (Math.sqrt(3) * 410),
        unite: "A",
        tolerance: 0.01,
        explication: "$I_{2n} = S_n/(\\sqrt{3}\\,U_{2n}) = 100\\,000/(1{,}732 \\times 410) = 140{,}8\\ \\mathrm{A}$.",
        resume: "Courant assigné d'un transformateur",
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
    titre: "Où en suis-je sur le multimètre, l'oscilloscope et les sondes ?",
  });
  if (auto) ressources.push(auto);
}
