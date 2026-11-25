/* ==========================================================================
   cours/capteurs-industriels/cours.js
   Capteurs industriels : plaquette de Hall manipulable, réponse d'un capteur
   thermique, erreur due aux fils d'une Pt100, compensation de soudure froide
   d'un thermocouple, codeur incrémental manipulable, exercices, quiz, cartes,
   révision espacée et auto-évaluation.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const Q = 1.602e-19;
const RHO_CU = 1.72e-8;

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
   Modèles physiques
   -------------------------------------------------------------------------- */

const CVD = { A: 3.9083e-3, B: -5.775e-7, C: -4.183e-12 };

/** Résistance d'une sonde à résistance de platine, relation de Callendar et Van Dusen. */
function rPt(t, r0 = 100) {
  const base = 1 + CVD.A * t + CVD.B * t * t;
  return t >= 0 ? r0 * base : r0 * (base + CVD.C * (t - 100) * t * t * t);
}

function sPt(t, r0 = 100) {
  return r0 * (CVD.A + 2 * CVD.B * t);
}

/** Température correspondant à une résistance, par la méthode de Newton. */
function tPt(r, r0 = 100) {
  let t = (r / r0 - 1) / CVD.A;
  for (let i = 0; i < 30; i += 1) {
    const pente = (rPt(t + 1e-4, r0) - rPt(t - 1e-4, r0)) / 2e-4;
    const pas = (rPt(t, r0) - r) / pente;
    t -= pas;
    if (Math.abs(pas) < 1e-9) break;
  }
  return t;
}

/* Polynôme de référence du thermocouple de type K, 0 à 1372 °C, en millivolts. */
const K_C = [
  -0.17600413686e-1, 0.38921204975e-1, 0.1855877003e-4, -0.99457592874e-7, 0.31840945719e-9, -0.56072844889e-12,
  0.56075059059e-15, -0.3202072e-18, 0.97151147152e-22, -0.12104721275e-25,
];
const K_A = [0.1185976, -0.1183432e-3, 126.9686];

function eK(t) {
  let somme = 0;
  let puissance = 1;
  for (const c of K_C) {
    somme += c * puissance;
    puissance *= t;
  }
  return somme + K_A[0] * Math.exp(K_A[1] * (t - K_A[2]) * (t - K_A[2]));
}

/** Température d'un type K pour une force électromotrice en millivolts ; extrapolation linéaire sous 0 °C. */
function tK(e) {
  if (e <= 0) return e / 0.0395;
  let bas = 0;
  let haut = 1372;
  for (let i = 0; i < 60; i += 1) {
    const milieu = (bas + haut) / 2;
    if (eK(milieu) < e) bas = milieu;
    else haut = milieu;
  }
  return (bas + haut) / 2;
}

/* --------------------------------------------------------------------------
   Initialisation et nettoyage
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  detruire();
  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireHall(racine, api);
  construireReponse(racine, api);
  construirePt100(racine, api);
  construireThermocouple(racine, api);
  construireCodeur(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  ressources.push(
    api.reveler(racine.querySelectorAll(".formule-cle, .encadre, #f-comparatif, #e-statut-tableau, #e-gray-tableau, #h-tableau, #i-tableau"), {
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
    ["#e-pt100-figure svg", 2.4],
    ["#e-tc-figure svg", 2],
    ["#e-tor-figure svg", 2],
    ["#e-hall-bf-figure svg", 2],
    ["#f-schema-principal svg", 2.6],
    ["#h-montage-figure svg", 2],
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
      id: "c1-fil",
      titre: "Résistance d'un câble de cuivre",
      niveau: "fondamental",
      enonce:
        "<p>Quelle est la résistance d'un conducteur de cuivre de $50\\ \\mathrm{m}$ et de $0{,}5\\ \\mathrm{mm^2}$, avec $\\rho = 1{,}72 \\times 10^{-8}\\ \\Omega \\cdot \\mathrm{m}$, en ohms ?</p>",
      valeur: (RHO_CU * 50) / 0.5e-6,
      unite: "Ω",
      tolerance: 0.02,
      chiffres: 4,
      libelleChamp: "Résistance",
      etapes: [
        { texte: "$R = \\rho L/S$, avec $S = 0{,}5 \\times 10^{-6}\\ \\mathrm{m^2}$." },
        { texte: "$R = 1{,}72 \\times 10^{-8} \\times 50/(0{,}5 \\times 10^{-6}) = 1{,}72\\ \\Omega$." },
        { texte: "Pour une Pt100, $1{,}72\\ \\Omega$ représentent $1{,}72/0{,}385 = 4{,}5\\ \\mathrm{K}$ : la résistance des fils n'est jamais négligeable.", note: "Le cuivre lui-même varie de $0{,}4\\ \\%$ par kelvin : un câble exposé au soleil change de résistance." },
      ],
      visuelCorrection: correctionEtapes(
        ["S = 0,5 mm² = 0,5 × 10⁻⁶ m²", "R = ρ L / S = 1,72 × 10⁻⁸ × 50 / 0,5 × 10⁻⁶", "R = 1,72 Ω, soit 4,5 K pour une Pt100"],
        "Résistance d'un conducteur et poids pour une sonde à résistance."
      ),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-premier-ordre",
      titre: "Temps de réponse à 95 % d'un premier ordre",
      niveau: "fondamental",
      enonce: "<p>Une sonde de température a une constante de temps $\\tau = 8\\ \\mathrm{s}$. Au bout de combien de temps atteint-elle $95\\ \\%$ d'un échelon, en secondes ?</p>",
      valeur: 8 * Math.log(20),
      unite: "s",
      tolerance: 0.02,
      chiffres: 4,
      libelleChamp: "Temps à 95 %",
      etapes: [
        { texte: "$1 - e^{-t/\\tau} = 0{,}95$, donc $e^{-t/\\tau} = 0{,}05$." },
        { texte: "$t = \\tau\\ln 20 = 2{,}996\\,\\tau$." },
        { texte: "$t = 8 \\times 2{,}996 = 23{,}97\\ \\mathrm{s}$, soit environ $3\\tau$.", note: "La règle des trois constantes de temps vient de là." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réponse indicielle d'une sonde de constante de temps 8 s",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "fraction de l'échelon",
          yUnite: "",
          xMin: 0,
          xMax: 40,
          yMin: 0,
          yMax: 1.05,
          series: [{ id: "s", nom: "réponse de la sonde", fonction: (t) => 1 - Math.exp(-t / 8) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0.95, "95 %", [2, 4]);
            ligneH(c, r, couleurs, 0.632, "63 %", [2, 4]);
            ligneV(c, r, couleurs, 8, [7, 5], "τ = 8 s", true);
            ligneV(c, r, couleurs, 8 * Math.log(20), [7, 5], "23,97 s", true);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c3-hydrostatique",
      titre: "Pression au fond d'une colonne d'eau",
      niveau: "fondamental",
      enonce: "<p>Quelle pression relative règne au fond de $5\\ \\mathrm{m}$ d'eau, $\\rho = 1000\\ \\mathrm{kg/m^3}$, $g = 9{,}81\\ \\mathrm{m/s^2}$, en bars ?</p>",
      valeur: (1000 * 9.81 * 5) / 1e5,
      unite: "bar",
      tolerance: 0.02,
      chiffres: 4,
      libelleChamp: "Pression relative",
      etapes: [
        { texte: "$p = \\rho g h = 1000 \\times 9{,}81 \\times 5 = 49\\,050\\ \\mathrm{Pa}$." },
        { texte: "$1\\ \\mathrm{bar} = 10^5\\ \\mathrm{Pa}$, donc $p = 0{,}4905\\ \\mathrm{bar}$." },
        { texte: "Repère utile : $1\\ \\mathrm{m}$ d'eau vaut $98{,}1\\ \\mathrm{mbar}$.", note: "Un capteur de niveau hydrostatique mesure cette pression, puis l'automate divise par $\\rho g$." },
      ],
      visuelCorrection: correctionEtapes(
        ["p = ρ g h = 1000 × 9,81 × 5", "p = 49 050 Pa = 0,4905 bar", "1 m d'eau ≈ 98,1 mbar"],
        "Pression hydrostatique."
      ),
    })
  );
}

/* --------------------------------------------------------------------------
   D. Plaquette de Hall : curseurs, lecteur, valeurs
   -------------------------------------------------------------------------- */

const MATERIAUX = [
  { nom: "cuivre", n: 8.5e28 },
  { nom: "semi-conducteur", n: 1e22 },
];

function construireHall(racine, api) {
  const conteneur = racine.querySelector("#d-hall-vivant");
  if (!conteneur) return;
  const T = 10e-6;
  const W = 1e-3;
  const IMAX = 10e-3;
  const BMAX = 0.2;
  const P = { x: 150, y: 90, l: 420, h: 160 };
  const etat = { i: 5e-3, b: 0.1, mat: 1 };
  let niveau = 0;
  let cible = 0;

  const svg = svgEl("svg", {
    viewBox: "0 0 760 340",
    role: "img",
    "aria-label": "Plaquette de Hall manipulable : courant de gauche à droite, électrons de droite à gauche, induction perpendiculaire au plan, charges accumulées sur les bords haut et bas et tension de Hall entre les bornes",
  });
  const decor = svgEl("g");
  let d = "<defs>" + marqueur("d-ha-fl") + "</defs>" + TRAITS + ' stroke-width="1.8">';
  d += '<rect x="' + P.x + '" y="' + P.y + '" width="' + P.l + '" height="' + P.h + '" rx="4" stroke-width="2.2"/>';
  d += '<path d="M40 170H' + P.x + "M" + (P.x + P.l) + ' 170H690"/>';
  d += '<circle cx="36" cy="170" r="4"/><circle cx="694" cy="170" r="4"/>';
  d += '<path d="M360 ' + P.y + "V62H730M360 " + (P.y + P.h) + 'V278H730"/>';
  d += '<circle cx="730" cy="62" r="4"/><circle cx="730" cy="278" r="4"/>';
  d += '<path d="M280 312H460" marker-end="url(#d-ha-fl)" stroke-width="1.4"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  d += texte(20, 160, "entrée I") + texte(640, 160, "sortie I");
  d += texte(286, 334, "I, courant conventionnel");
  d += texte(368, 56, "borne de Hall haute") + texte(368, 296, "borne de Hall basse, référence");
  d += texte(P.x + 6, P.y + P.h + 18, "plaquette : t = 10 µm, w = 1 mm");
  d += "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const grille = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1", opacity: "0.35" });
  const symboleB = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.8" });
  const charges = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "15" });
  const electrons = svgEl("g", { fill: "currentColor", stroke: "none" });
  const forces = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round" });
  const fleche = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.6", "marker-end": "url(#d-ha-fl)" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(grille, symboleB, charges, electrons, forces, fleche, libelles);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  /* Électrons : position initiale aléatoire sur la plaquette. */
  const NE = 34;
  const pointsE = [];
  for (let k = 0; k < NE; k += 1) {
    const cercle = svgEl("circle", { r: "3.4" });
    electrons.appendChild(cercle);
    pointsE.push({ x: P.x + 8 + Math.random() * (P.l - 16), y: P.y + 12 + Math.random() * (P.h - 24), el: cercle });
  }
  function placer() {
    for (const p of pointsE) {
      p.el.setAttribute("cx", p.x.toFixed(1));
      p.el.setAttribute("cy", p.y.toFixed(1));
    }
  }
  placer();

  const valeurs = api.sim.valeurs("#d-hall-valeurs", [
    { id: "vh", libelle: "Tension de Hall V_H = v_haut - v_bas", format: (v) => v },
    { id: "v", libelle: "Vitesse de dérive des électrons", format: (v) => v },
    { id: "eh", libelle: "Champ de Hall E_H = v B", format: (v) => v },
    { id: "sens", libelle: "Sensibilité 1 / (n q t)", format: (v) => v },
    { id: "bord", libelle: "Bord chargé négativement", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function grandeurs() {
    const n = MATERIAUX[etat.mat].n;
    const v = etat.i / (n * Q * W * T);
    const vh = (etat.i * etat.b) / (n * Q * T);
    return { n, v, vh, eh: v * etat.b, s: 1 / (n * Q * T) };
  }

  function formatTension(vh) {
    const a = Math.abs(vh);
    if (a === 0) return "0 V";
    if (a >= 1e-3) return signe(api, vh * 1e3, 2) + " mV";
    if (a >= 1e-6) return signe(api, vh * 1e6, 2) + " µV";
    return signe(api, vh * 1e9, 2) + " nV";
  }

  function formatVitesse(v) {
    if (v >= 1) return nb(api, v, 1) + " m/s";
    if (v >= 1e-3) return nb(api, v * 1e3, 2) + " mm/s";
    return nb(api, v * 1e6, 1) + " µm/s";
  }

  function dessinerChamp() {
    let g = "";
    let s = "";
    const b = etat.b;
    for (let ix = 0; ix < 7; ix += 1) {
      for (let iy = 0; iy < 3; iy += 1) {
        const x = P.x + 30 + ix * 60;
        const y = P.y + 30 + iy * 50;
        if (Math.abs(b) < 1e-9) continue;
        g += '<circle cx="' + x + '" cy="' + y + '" r="5"/>';
        g += b > 0 ? '<circle cx="' + x + '" cy="' + y + '" r="1.2" fill="currentColor"/>' : '<path d="M' + (x - 3) + " " + (y - 3) + "l6 6m0 -6l-6 6" + '"/>';
      }
    }
    grille.innerHTML = g;
    s += '<circle cx="80" cy="60" r="16"/>';
    if (b > 0) s += '<circle cx="80" cy="60" r="3.5" fill="currentColor"/>';
    else if (b < 0) s += '<path d="M70 50l20 20m0 -20l-20 20"/>';
    symboleB.innerHTML = s;
  }

  let dernierNombre = -1;
  let dernierSigne = 0;
  function dessinerCharges() {
    const nombre = Math.min(12, Math.round(Math.abs(niveau) * 12));
    const sg = Math.sign(niveau);
    if (nombre === dernierNombre && sg === dernierSigne) return;
    dernierNombre = nombre;
    dernierSigne = sg;
    let c = "";
    for (let k = 0; k < nombre; k += 1) {
      const x = P.x + 20 + (k * (P.l - 40)) / 11;
      c += texte(x - 4, P.y - 6, sg > 0 ? "+" : "-");
      c += texte(x - 4, P.y + P.h + 34, sg > 0 ? "-" : "+");
    }
    charges.innerHTML = c;
  }

  function longueur(f) {
    if (Math.abs(f) < 0.004) return 0;
    return Math.sign(f) * (18 + 52 * Math.min(1, Math.abs(f)));
  }

  function dessinerForces() {
    const x = 470;
    const y = 170;
    const lb = longueur(cible);
    const le = longueur(niveau);
    let f = '<circle cx="' + x + '" cy="' + y + '" r="6.5" fill="currentColor" stroke="none"/>';
    if (lb) f += '<path d="M' + (x - 10) + " " + y + "v" + lb.toFixed(1) + '" stroke-width="2.2" marker-end="url(#d-ha-fl)"/>';
    if (le) f += '<path d="M' + (x + 10) + " " + y + "v" + (-le).toFixed(1) + '" stroke-width="2.2" stroke-dasharray="5 3" marker-end="url(#d-ha-fl)"/>';
    forces.innerHTML = f;
    let l = "";
    if (lb) l += texte(x - 112, y + lb * 0.55 + 4, "F magnétique");
    if (le) l += texte(x + 18, y - le * 0.55 + 4, "F électrique");
    l += texte(x + 16, y + (le > 0 ? 22 : -14), "électron");
    const g = grandeurs();
    l += texte(100, 56, "B = " + nb(api, etat.b, 2) + " T") + texte(60, 92, Math.abs(etat.b) < 1e-9 ? "" : etat.b > 0 ? "vers le lecteur" : "s'éloigne");
    l += texte(736, 176, "V_H", ' font-size="12"');
    l += texte(600, 196, formatTension(g.vh));
    libelles.innerHTML = l;
    if (Math.abs(g.vh) < 1e-12) fleche.setAttribute("d", "");
    else fleche.setAttribute("d", g.vh > 0 ? "M720 266V74" : "M720 74V266");
  }

  function majValeurs() {
    const g = grandeurs();
    if (!valeurs) return;
    valeurs.maj({
      vh: formatTension(g.vh),
      v: formatVitesse(g.v),
      eh: Math.abs(g.eh) >= 1 ? signe(api, g.eh, 1) + " V/m" : Math.abs(g.eh) >= 1e-3 ? signe(api, g.eh * 1e3, 2) + " mV/m" : signe(api, g.eh * 1e6, 2) + " µV/m",
      sens: g.s >= 1 ? nb(api, g.s, 1) + " V/(A.T)" : nb(api, g.s * 1e6, 2) + " µV/(A.T)",
      bord: Math.abs(g.vh) < 1e-15 ? "aucun" : g.vh > 0 ? "bord bas, électrons déviés vers le bas" : "bord haut, électrons déviés vers le haut",
    });
  }

  let enLecture = false;
  function recalculer() {
    const visible = etat.mat === 1 ? 1 : 0;
    cible = visible * ((etat.i / IMAX) * (etat.b / BMAX));
    if (!enLecture) niveau = cible;
    dessinerChamp();
    dessinerCharges();
    dessinerForces();
    majValeurs();
  }

  const curseurs = api.sim.curseurs(
    "#d-hall-curseurs",
    [
      { id: "i", libelle: "Courant d'alimentation I", min: 0, max: 10, pas: 0.5, valeur: 5, unite: "mA" },
      { id: "b", libelle: "Induction B, positive vers le lecteur", min: -0.2, max: 0.2, pas: 0.01, valeur: 0.1, unite: "T", chiffres: 2 },
      { id: "mat", libelle: "Matériau de la plaquette", min: 0, max: 1, pas: 1, valeur: 1, format: (v) => MATERIAUX[Math.round(v)].nom + ", n = " + (Math.round(v) ? "10²² m⁻³" : "8,5 × 10²⁸ m⁻³") },
    ],
    (v) => {
      etat.i = v.i * 1e-3;
      etat.b = v.b;
      etat.mat = Math.round(v.mat);
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  let precedent = 0;
  const DUREE = 10;
  const lecteur = api.sim.lecteur("#d-hall-lecteur", {
    de: 0,
    a: 1,
    duree: DUREE,
    boucle: true,
    auto: false,
    libelle: "Mouvement des électrons",
    rappel: (u, info) => {
      let dp = u - precedent;
      precedent = u;
      if (dp < -0.5) dp += 1;
      enLecture = Boolean(info && info.enMarche);
      if (!enLecture || dp <= 0) return;
      const dt = Math.min(0.1, dp * DUREE);
      const g = grandeurs();
      const vitesse = etat.mat === 1 ? 70 * (etat.i / 5e-3) : 70 * (etat.i / 5e-3) * (g.v / 312.1);
      niveau += ((cible - niveau) * dt) / 0.9;
      const vy = 140 * (cible - niveau) * (etat.mat === 1 ? 1 : 0);
      for (const p of pointsE) {
        p.x -= vitesse * dt;
        p.y += vy * dt;
        if (p.x < P.x + 6 || p.y < P.y + 6 || p.y > P.y + P.h - 6) {
          p.x = P.x + P.l - 6 - Math.random() * 10;
          p.y = P.y + 12 + Math.random() * (P.h - 24);
        }
      }
      placer();
      dessinerCharges();
      dessinerForces();
    },
  });
  if (lecteur) ressources.push(lecteur);

  recalculer();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.6 }));
}

/* --------------------------------------------------------------------------
   E. Réponse d'un capteur thermique : curseurs, tracé, valeurs
   -------------------------------------------------------------------------- */

function construireReponse(racine, api) {
  if (!racine.querySelector("#e-reponse-trace")) return;
  const T0 = 40;
  const etat = { tau: 30, tf: 90, seuil: 85 };

  const valeurs = api.sim.valeurs("#e-reponse-valeurs", [
    { id: "t63", libelle: "Instant à 63 % de l'échelon", format: (v) => v },
    { id: "t95", libelle: "Instant à 95 % de l'échelon", format: (v) => v },
    { id: "alarme", libelle: "Retard d'alarme", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function tAlarme() {
    if (etat.seuil <= T0 || etat.seuil >= etat.tf) return NaN;
    return etat.tau * Math.log((etat.tf - T0) / (etat.tf - etat.seuil));
  }

  const trace = api.sim.traceur("#e-reponse-trace", {
    titre: "Échelon de température du procédé et température mesurée",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "température",
    yUnite: "°C",
    xMin: -10,
    xMax: 150,
    yMin: 30,
    yMax: 160,
    ratio: 0.42,
    echantillons: 600,
    series: [
      { id: "p", nom: "température du procédé" },
      { id: "m", nom: "température mesurée" },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, etat.seuil, "seuil d'alarme " + nb(api, etat.seuil, 0) + " °C", [7, 5]);
      const ta = tAlarme();
      if (Number.isFinite(ta)) ligneV(c, r, couleurs, ta, [2, 4], "alarme à " + nb(api, ta, 1) + " s", true);
    },
  });
  if (trace) ressources.push(trace);

  function recalculer() {
    const xMax = Math.max(30, 5 * etat.tau);
    if (trace) {
      trace.definirPlage({ xMin: -0.08 * xMax, xMax });
      trace.definirFonction("p", (t) => (t < 0 ? T0 : etat.tf));
      trace.definirFonction("m", (t) => (t < 0 ? T0 : etat.tf - (etat.tf - T0) * Math.exp(-t / etat.tau)));
    }
    if (valeurs) {
      const ta = tAlarme();
      valeurs.maj({
        t63: nb(api, etat.tau, 1) + " s, mesure à " + nb(api, T0 + 0.632 * (etat.tf - T0), 1) + " °C",
        t95: nb(api, etat.tau * Math.log(20), 1) + " s",
        alarme: Number.isFinite(ta) ? nb(api, ta, 1) + " s, soit " + nb(api, ta / etat.tau, 2) + " τ" : "seuil jamais franchi par l'échelon choisi",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-reponse-curseurs",
    [
      { id: "tau", libelle: "Constante de temps de la sonde montée", min: 1, max: 120, pas: 1, valeur: etat.tau, unite: "s" },
      { id: "tf", libelle: "Température finale du procédé", min: 50, max: 150, pas: 1, valeur: etat.tf, unite: "°C" },
      { id: "seuil", libelle: "Seuil d'alarme", min: 45, max: 150, pas: 1, valeur: etat.seuil, unite: "°C" },
    ],
    (v) => {
      etat.tau = v.tau;
      etat.tf = v.tf;
      etat.seuil = v.seuil;
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);
  recalculer();
}

/* --------------------------------------------------------------------------
   E. Erreur due aux fils d'une Pt100 : curseurs, tracé, valeurs
   -------------------------------------------------------------------------- */

const SECTIONS = [0.25, 0.5, 0.75, 1, 1.5];
const MONTAGES = ["2 fils", "3 fils", "4 fils"];

function construirePt100(racine, api) {
  if (!racine.querySelector("#e-pt100-trace")) return;
  const etat = { t: 80, l: 60, s: 1, d: 2, rc: 0, m: 1, zoom: 0 };

  function erreurs(l) {
    const rf = (RHO_CU * l) / (SECTIONS[etat.s] * 1e-6);
    const rt = rPt(etat.t);
    const r2 = rt + 2 * rf + etat.rc;
    const r3 = rt + (etat.d / 100) * rf + etat.rc;
    return { rf, rt, r2, r3, r4: rt, e2: tPt(r2) - etat.t, e3: tPt(r3) - etat.t, e4: 0 };
  }

  const valeurs = api.sim.valeurs("#e-pt100-valeurs", [
    { id: "rt", libelle: "Résistance de la sonde R_T", format: (v) => v },
    { id: "rf", libelle: "Résistance d'un fil R_f", format: (v) => v },
    { id: "rm", libelle: "Résistance vue par le transmetteur", format: (v) => v },
    { id: "tl", libelle: "Température lue", format: (v) => v },
    { id: "err", libelle: "Erreurs en 2, 3 et 4 fils", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#e-pt100-trace", {
    titre: "Erreur de température selon la longueur du câble",
    xTitre: "longueur du câble",
    xUnite: "m",
    yTitre: "erreur",
    yUnite: "K",
    xMin: 0,
    xMax: 200,
    yMin: -2,
    yMax: 40,
    ratio: 0.42,
    echantillons: 200,
    series: [
      { id: "e2", nom: "2 fils" },
      { id: "e3", nom: "3 fils" },
      { id: "e4", nom: "4 fils" },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, etat.l, [2, 4], nb(api, etat.l, 0) + " m");
    },
  });
  if (trace) ressources.push(trace);

  function recalculer() {
    if (trace) {
      trace.definirFonction("e2", (l) => erreurs(l).e2);
      trace.definirFonction("e3", (l) => erreurs(l).e3);
      trace.definirFonction("e4", () => 0);
      if (etat.zoom) trace.definirPlage({ yMin: -1.5, yMax: 1.5 });
      else {
        const haut = Math.max(2, erreurs(200).e2 * 1.08);
        trace.definirPlage({ yMin: -0.06 * haut, yMax: haut });
      }
    }
    const e = erreurs(etat.l);
    const rm = [e.r2, e.r3, e.r4][etat.m];
    if (valeurs) {
      valeurs.maj({
        rt: nb(api, e.rt, 3) + " Ω, S = " + nb(api, sPt(etat.t), 4) + " Ω/K",
        rf: nb(api, e.rf, 3) + " Ω",
        rm: nb(api, rm, 3) + " Ω en " + MONTAGES[etat.m],
        tl: nb(api, tPt(rm), 2) + " °C pour " + nb(api, etat.t, 0) + " °C",
        err: signe(api, e.e2, 2) + " K ; " + signe(api, e.e3, 3) + " K ; 0 K",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-pt100-curseurs",
    [
      { id: "t", libelle: "Température de la sonde", min: -50, max: 250, pas: 1, valeur: etat.t, unite: "°C" },
      { id: "l", libelle: "Longueur du câble", min: 1, max: 200, pas: 1, valeur: etat.l, unite: "m" },
      { id: "s", libelle: "Section des conducteurs", min: 0, max: 4, pas: 1, valeur: etat.s, format: (v) => nb(api, SECTIONS[Math.round(v)], 2) + " mm²" },
      { id: "d", libelle: "Déséquilibre des fils en 3 fils, (Rf1 - Rf2) / Rf", min: -10, max: 10, pas: 0.5, valeur: etat.d, unite: "%" },
      { id: "rc", libelle: "Connexion défectueuse sur le fil 1", min: 0, max: 1, pas: 0.05, valeur: etat.rc, unite: "Ω", chiffres: 2 },
      { id: "m", libelle: "Montage détaillé dans le panneau", min: 0, max: 2, pas: 1, valeur: etat.m, format: (v) => MONTAGES[Math.round(v)] },
      { id: "zoom", libelle: "Échelle verticale", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (Math.round(v) ? "loupe ±1,5 K" : "complète") },
    ],
    (v) => {
      etat.t = v.t;
      etat.l = v.l;
      etat.s = Math.round(v.s);
      etat.d = v.d;
      etat.rc = v.rc;
      etat.m = Math.round(v.m);
      etat.zoom = Math.round(v.zoom);
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);
  recalculer();
}

/* --------------------------------------------------------------------------
   E. Thermocouple et soudure froide : curseurs, lecteur, tracé, valeurs
   -------------------------------------------------------------------------- */

const CABLAGES = ["compensation correcte", "compensation désactivée", "câble cuivre de la tête au bornier"];

function construireThermocouple(racine, api) {
  if (!racine.querySelector("#e-tc-trace")) return;
  const etat = { tc: 600, tt: 90, tf: 35, mode: 0 };
  let synchro = false;
  let res = null;

  function calcul() {
    const vraie = eK(etat.tc);
    const e = etat.mode === 2 ? vraie - eK(etat.tt) : vraie - eK(etat.tf);
    const ajout = etat.mode === 1 ? 0 : eK(etat.tf);
    const recon = e + ajout;
    const lue = tK(recon);
    return { vraie, e, ajout, recon, lue };
  }

  const valeurs = api.sim.valeurs("#e-tc-valeurs", [
    { id: "e", libelle: "Tension e aux bornes du transmetteur", format: (v) => v },
    { id: "aj", libelle: "Compensation ajoutée", format: (v) => v },
    { id: "rec", libelle: "Force électromotrice reconstituée", format: (v) => v },
    { id: "lue", libelle: "Température lue", format: (v) => v },
    { id: "err", libelle: "Erreur", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#e-tc-trace", {
    titre: "Caractéristique E(T) du type K et lecture du transmetteur",
    xTitre: "température",
    xUnite: "°C",
    yTitre: "force électromotrice",
    yUnite: "mV",
    xMin: 0,
    xMax: 1300,
    yMin: -2,
    yMax: 56,
    ratio: 0.45,
    echantillons: 260,
    series: [
      { id: "e", nom: "E(T), type K", fonction: eK },
      { id: "lin", nom: "droite à 41 µV/K", fonction: (t) => 0.041 * t },
    ],
    surDessin({ c, repere: r, couleurs }) {
      if (!res) return;
      ligneH(c, r, couleurs, res.vraie, "E(Tc) vraie " + nb(api, res.vraie, 3) + " mV", [], true);
      ligneH(c, r, couleurs, res.recon, "reconstituée " + nb(api, res.recon, 3) + " mV", [7, 5]);
      ligneV(c, r, couleurs, etat.tc, [], "Tc", true);
      ligneV(c, r, couleurs, res.lue, [7, 5], "lue", false);
    },
  });
  if (trace) ressources.push(trace);

  function recalculer() {
    res = calcul();
    if (trace) trace.demanderRendu();
    if (valeurs) {
      valeurs.maj({
        e: nb(api, res.e, 3) + " mV",
        aj: etat.mode === 1 ? "aucune" : "E(" + nb(api, etat.tf, 0) + " °C) = " + nb(api, res.ajout, 3) + " mV",
        rec: nb(api, res.recon, 3) + " mV pour " + nb(api, res.vraie, 3) + " mV vrais",
        lue: nb(api, res.lue, 1) + " °C",
        err: signe(api, res.lue - etat.tc, 1) + " K",
      });
    }
  }

  let lecteur = null;
  const curseurs = api.sim.curseurs(
    "#e-tc-curseurs",
    [
      { id: "tc", libelle: "Température du four Tc", min: 50, max: 1200, pas: 5, valeur: etat.tc, unite: "°C" },
      { id: "tt", libelle: "Température de la tête de sonde", min: 0, max: 150, pas: 1, valeur: etat.tt, unite: "°C" },
      { id: "tf", libelle: "Température du bornier Tf", min: 0, max: 60, pas: 1, valeur: etat.tf, unite: "°C" },
      { id: "mode", libelle: "Câblage et compensation", min: 0, max: 2, pas: 1, valeur: 0, format: (v) => CABLAGES[Math.round(v)] },
    ],
    (v) => {
      etat.tc = v.tc;
      etat.tt = v.tt;
      etat.tf = v.tf;
      etat.mode = Math.round(v.mode);
      if (!synchro && lecteur) lecteur.suivre(etat.tc);
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#e-tc-lecteur", {
    de: 50,
    a: 1200,
    duree: 12,
    boucle: false,
    auto: false,
    libelle: "Balayage de la température du four",
    rappel: (t) => {
      etat.tc = Math.round(t / 5) * 5;
      synchro = true;
      if (curseurs) curseurs.definir("tc", etat.tc);
      synchro = false;
      recalculer();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(600);
  }
  recalculer();
}

/* --------------------------------------------------------------------------
   E. Codeur incrémental : poignée, curseurs, lecteur, tracé, valeurs
   -------------------------------------------------------------------------- */

const DECODAGES = [1, 2, 4];

function frac(x) {
  return x - Math.floor(x);
}

function construireCodeur(racine, api) {
  const conteneur = racine.querySelector("#e-codeur-vivant");
  if (!conteneur) return;
  const CX = 170;
  const CY = 170;
  const R1 = 92;
  const R2 = 122;
  const RS = 107;
  const etat = { n: 8, k: 2, sens: 0 };
  let theta = 0;

  const svg = svgEl("svg", {
    viewBox: "0 0 760 340",
    role: "img",
    "aria-label": "Codeur incrémental manipulable : disque à fenêtres vu de face, poignée de rotation sur sa périphérie, capteurs des voies A et B décalés d'un quart de pas, état logique des voies et compteur",
  });
  const decor = svgEl("g");
  let d = "<defs>" + marqueur("e-co-fl") + "</defs>" + TRAITS + ' stroke-width="1.6">';
  d += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (R2 + 6) + '"/>';
  d += '<circle cx="' + CX + '" cy="' + CY + '" r="10"/>';
  d += '<circle cx="' + CX + '" cy="' + CY + '" r="140" stroke-dasharray="2 5" stroke-width="1"/>';
  d += '<path d="M352 60H740M352 160H740" stroke-width="1" stroke-dasharray="2 4"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  d += texte(16, 330, "rail de la poignée : faire tourner le disque");
  d += texte(360, 50, "état des voies");
  d += texte(360, 150, "compteur");
  d += "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const barres = svgEl("path", { fill: "currentColor", stroke: "none", opacity: "0.55" });
  const repereRadial = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "2.4", "stroke-linecap": "round" });
  const capteurs = svgEl("g", { stroke: "currentColor", "stroke-width": "1.8" });
  const etats = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "13" });
  const sensFleche = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.6", "marker-end": "url(#e-co-fl)" });
  svg.append(barres, repereRadial, capteurs, sensFleche, etats);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  function point(r, deg) {
    const a = (deg * Math.PI) / 180;
    return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
  }

  function secteur(a1, a2) {
    const p1 = point(R2, a1);
    const p2 = point(R2, a2);
    const p3 = point(R1, a2);
    const p4 = point(R1, a1);
    return (
      "M" + p1.x.toFixed(2) + " " + p1.y.toFixed(2) +
      "A" + R2 + " " + R2 + " 0 0 0 " + p2.x.toFixed(2) + " " + p2.y.toFixed(2) +
      "L" + p3.x.toFixed(2) + " " + p3.y.toFixed(2) +
      "A" + R1 + " " + R1 + " 0 0 1 " + p4.x.toFixed(2) + " " + p4.y.toFixed(2) + "Z"
    );
  }

  function voies(th) {
    const u = (th * etat.n) / 360;
    return { a: frac(u) < 0.5 ? 1 : 0, b: frac(u - 0.25) < 0.5 ? 1 : 0, u };
  }

  function compteur(th) {
    return Math.floor((th * etat.n * DECODAGES[etat.k]) / 360);
  }

  const valeurs = api.sim.valeurs("#e-codeur-valeurs", [
    { id: "angle", libelle: "Angle cumulé du disque", format: (v) => v },
    { id: "cpt", libelle: "Compteur", format: (v) => v },
    { id: "pos", libelle: "Position déduite du compteur et erreur", format: (v) => v },
    { id: "res", libelle: "Résolution 360 / (k N)", format: (v) => v },
    { id: "ab", libelle: "Voies A et B", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#e-codeur-trace", {
    titre: "Chronogramme des voies A et B en fonction de l'angle",
    xTitre: "angle mécanique",
    xUnite: "°",
    yTitre: "niveau logique",
    yUnite: "",
    xMin: -60,
    xMax: 60,
    yMin: -0.4,
    yMax: 3.2,
    ratio: 0.36,
    echantillons: 900,
    series: [
      { id: "a", nom: "voie A" },
      { id: "b", nom: "voie B, décalée vers le bas" },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, theta, [7, 5], "position courante");
    },
  });
  if (trace) ressources.push(trace);

  let dernierSens = 1;
  function rendre() {
    const pas = 360 / etat.n;
    let chemin = "";
    for (let k = 0; k < etat.n; k += 1) {
      const a2 = 90 + theta - (k + 0.5) * pas;
      const a1 = 90 + theta - (k + 1) * pas;
      chemin += secteur(a1, a2);
    }
    barres.setAttribute("d", chemin);
    const p = point(R1 - 6, theta);
    repereRadial.setAttribute("d", "M" + CX + " " + CY + "L" + p.x.toFixed(1) + " " + p.y.toFixed(1));

    const v = voies(theta);
    const sigmaA = 90;
    const sigmaB = 90 + 90 / etat.n;
    let cap = "";
    for (const [sigma, actif, nom] of [[sigmaA, v.a, "A"], [sigmaB, v.b, "B"]]) {
      const q = point(RS, sigma);
      cap += '<rect x="' + (q.x - 6).toFixed(1) + '" y="' + (q.y - 6).toFixed(1) + '" width="12" height="12" rx="2" fill="' + (actif ? "currentColor" : "none") + '"/>';
      const l = point(RS - 26, sigma);
      cap += '<text x="' + (l.x - 4).toFixed(1) + '" y="' + (l.y + 4).toFixed(1) + '" stroke="none" fill="currentColor" font-family="ui-monospace, monospace" font-size="12">' + nom + "</text>";
    }
    capteurs.innerHTML = cap;

    const c = compteur(theta);
    const kk = DECODAGES[etat.k];
    let t = "";
    t += texte(372, 84, "A = " + v.a + "   " + (v.a ? "fenêtre vue" : "barre vue"));
    t += texte(372, 108, "B = " + v.b + "   " + (v.b ? "fenêtre vue" : "barre vue"));
    t += texte(372, 132, "sens : " + (dernierSens > 0 ? "trigonométrique, comptage" : "horaire, décomptage"), ' font-size="11"');
    t += texte(372, 186, "x " + kk + " : " + c + " fronts");
    t += texte(372, 210, "position : " + nb(api, (c * 360) / (kk * etat.n), 2) + " °");
    t += texte(372, 234, "angle vrai : " + nb(api, theta, 2) + " °");
    t += texte(372, 266, nb(api, kk * etat.n, 0) + " fronts par tour, " + etat.n + " fenêtres", ' font-size="11"');
    t += texte(372, 286, "B = " + (dernierSens > 0 ? "0" : "1") + " au front montant de A dans ce sens", ' font-size="11"');
    etats.innerHTML = t;
    const s1 = point(150, theta + (dernierSens > 0 ? 8 : -8));
    const s2 = point(150, theta + (dernierSens > 0 ? 26 : -26));
    sensFleche.setAttribute("d", "M" + s1.x.toFixed(1) + " " + s1.y.toFixed(1) + "A150 150 0 0 " + (dernierSens > 0 ? 0 : 1) + " " + s2.x.toFixed(1) + " " + s2.y.toFixed(1));

    if (trace) {
      const demi = 1.5 * pas;
      trace.definirPlage({ xMin: theta - demi, xMax: theta + demi });
      trace.definirFonction("a", (x) => (frac((x * etat.n) / 360) < 0.5 ? 2.8 : 1.8));
      trace.definirFonction("b", (x) => (frac((x * etat.n) / 360 - 0.25) < 0.5 ? 1 : 0));
    }
    if (valeurs) {
      const pos = (c * 360) / (kk * etat.n);
      valeurs.maj({
        angle: nb(api, theta, 2) + " °",
        cpt: c + " en décodage x " + kk,
        pos: nb(api, pos, 2) + " °, écart " + nb(api, theta - pos, 2) + " °",
        res: nb(api, 360 / (kk * etat.n), 3) + " °",
        ab: "A = " + v.a + ", B = " + v.b,
      });
    }
  }

  let poignee = null;
  function deplacer(delta) {
    if (Math.abs(delta) > 1e-9) dernierSens = delta > 0 ? 1 : -1;
    theta += delta;
    if (poignee) poignee.set(((theta % 360) + 360) % 360, false);
    rendre();
  }

  poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: { x: CX, y: CY },
    rayon: 140,
    min: 0,
    max: 360,
    pas: 0.5,
    valeur: 0,
    libelle: "Rotation du disque du codeur",
    format: (m) => "angle " + nb(api, typeof m === "number" ? m : m.valeur, 1) + " °",
    rappel(m) {
      const cibleAngle = typeof m === "number" ? m : m.valeur;
      const actuel = ((theta % 360) + 360) % 360;
      let delta = cibleAngle - actuel;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      if (Math.abs(delta) < 1e-9) return;
      dernierSens = delta > 0 ? 1 : -1;
      theta += delta;
      rendre();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-codeur-curseurs",
    [
      { id: "n", libelle: "Fenêtres par tour N", min: 4, max: 32, pas: 4, valeur: etat.n },
      { id: "k", libelle: "Décodage", min: 0, max: 2, pas: 1, valeur: etat.k, format: (v) => "x " + DECODAGES[Math.round(v)] },
      { id: "sens", libelle: "Sens de rotation du lecteur", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (Math.round(v) ? "horaire" : "trigonométrique") },
    ],
    (v) => {
      etat.n = Math.round(v.n);
      etat.k = Math.round(v.k);
      etat.sens = Math.round(v.sens);
      rendre();
    }
  );
  if (curseurs) ressources.push(curseurs);

  let precedent = 0;
  const lecteur = api.sim.lecteur("#e-codeur-lecteur", {
    de: 0,
    a: 1,
    duree: 16,
    boucle: true,
    auto: false,
    libelle: "Rotation continue du disque",
    rappel: (u, info) => {
      let dp = u - precedent;
      precedent = u;
      const marche = Boolean(info && info.enMarche);
      if (!marche && u === 0) {
        theta = 0;
        dernierSens = 1;
        if (poignee) poignee.set(0, false);
        rendre();
        return;
      }
      if (!marche) return;
      if (dp < -0.5) dp += 1;
      if (dp <= 0) return;
      deplacer((etat.sens ? -1 : 1) * dp * 360);
    },
  });
  if (lecteur) ressources.push(lecteur);

  rendre();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.4 }));
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/** Portées d'un détecteur inductif selon la cible, pour le diagnostic de la came. */
function dessinPortees(id) {
  const x0 = 60;
  const ech = 60;
  let d = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.6">';
  d += '<rect x="20" y="40" width="36" height="160" rx="4"/>';
  d += '<path d="M' + x0 + " 220H" + (x0 + 9 * ech) + '"/>';
  for (let mm = 0; mm <= 9; mm += 1) d += '<path d="M' + (x0 + mm * ech) + " 216V224" + '"/>';
  d += '<path d="M' + x0 + " 60H" + (x0 + 8 * ech) + '" stroke-width="5"/>';
  d += '<path d="M' + x0 + " 100H" + (x0 + 6.4 * ech) + '" stroke-width="5" stroke-dasharray="10 5"/>';
  d += '<path d="M' + x0 + " 140H" + (x0 + 2.4 * ech) + '" stroke-width="5"/>';
  d += '<path d="M' + (x0 + 2.4 * ech) + " 140H" + (x0 + 3.6 * ech) + '" stroke-width="5" stroke-dasharray="3 4"/>';
  d += '<path d="M' + (x0 + 5 * ech) + " 30V200" + '" stroke-width="2.2"/>';
  d += '<rect x="' + (x0 + 5 * ech) + '" y="150" width="40" height="50" rx="3"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  d += texte(14, 32, "détecteur");
  for (let mm = 0; mm <= 9; mm += 1) d += texte(x0 + mm * ech - 4, 240, String(mm));
  d += texte(x0 + 9 * ech - 30, 258, "distance en mm");
  d += texte(x0 + 8 * ech + 8, 64, "Sn = 8 mm, acier doux");
  d += texte(x0 + 6.4 * ech + 8, 104, "0,8 Sn = 6,4 mm");
  d += texte(x0 + 3.6 * ech + 8, 144, "aluminium : 2,4 à 3,6 mm");
  d += texte(x0 + 5 * ech + 8, 176, "came à 5 mm");
  d += texte(x0 + 5 * ech + 8, 192, "aluminium : hors portée");
  d += "</g>";
  return d;
}

/** Position de la soudure froide selon le câble utilisé entre la tête et le bornier. */
function dessinSoudures() {
  let d = TRAITS + ' stroke-width="1.6">';
  for (const [y, xj] of [[60, 470], [180, 230]]) {
    d += '<path d="M40 ' + y + "L80 " + (y - 18) + "H" + xj + '" stroke-width="3"/>';
    d += '<path d="M40 ' + y + "L80 " + (y + 18) + "H" + xj + '" stroke-width="1.2"/>';
    d += '<path d="M' + xj + " " + (y - 18) + "H600M" + xj + " " + (y + 18) + 'H600" stroke-dasharray="2 4"/>';
    d += '<rect x="210" y="' + (y - 34) + '" width="44" height="68" rx="6" stroke-dasharray="4 3" stroke-width="1"/>';
    d += '<rect x="450" y="' + (y - 34) + '" width="44" height="68" rx="6" stroke-dasharray="4 3" stroke-width="1"/>';
    d += '<rect x="600" y="' + (y - 30) + '" width="86" height="60" rx="6"/>';
  }
  d += "</g>" + '<g fill="currentColor" stroke="none">';
  for (const [y, xj] of [[60, 470], [180, 230]]) {
    d += '<circle cx="40" cy="' + y + '" r="4.5"/>';
    d += '<circle cx="' + xj + '" cy="' + (y - 18) + '" r="3.5"/><circle cx="' + xj + '" cy="' + (y + 18) + '" r="3.5"/>';
  }
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="10.5"');
  d += texte(14, 20, "câble de compensation jusqu'au bornier") + texte(14, 140, "câble de cuivre depuis la tête");
  for (const y of [60, 180]) {
    d += texte(200, y + 50, "tête") + texte(440, y + 50, "bornier Tf");
    d += texte(606, y - 6, "ajoute") + texte(606, y + 8, "E(Tf)");
    d += texte(20, y + 34, "Tc");
  }
  d += texte(300, 30, "soudure froide au bornier : juste");
  d += texte(262, 150, "soudure froide dans la tête : fausse");
  d += texte(14, 244, "Trait épais : fil positif. Trait fin : fil négatif. Pointillés : cuivre. Disques : jonctions.");
  d += "</g>";
  return d;
}

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : Callendar et Van Dusen */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-pt100",
      titre: "Résistance d'une Pt100 à 150 °C",
      niveau: "fondamental",
      enonce:
        "<p>Le refoulement du compresseur du site atteint $150\\ ^\\circ\\mathrm{C}$. Quelle est la résistance d'une Pt100 à cette température, avec $A = 3{,}9083 \\times 10^{-3}\\ \\mathrm{K^{-1}}$ et $B = -5{,}775 \\times 10^{-7}\\ \\mathrm{K^{-2}}$, en ohms ?</p>",
      valeur: rPt(150),
      unite: "Ω",
      tolerance: 0.002,
      chiffres: 5,
      libelleChamp: "Résistance R150",
      etapes: [
        { texte: "$AT = 3{,}9083 \\times 10^{-3} \\times 150 = 0{,}586245$." },
        { texte: "$BT^2 = -5{,}775 \\times 10^{-7} \\times 22\\,500 = -0{,}012994$." },
        { texte: "$R_{150} = 100\\,(1 + 0{,}586245 - 0{,}012994) = 157{,}325\\ \\Omega$.", note: "Avec la droite à $0{,}385\\ \\Omega/\\mathrm{K}$ : $157{,}75\\ \\Omega$, soit $1{,}1\\ \\mathrm{K}$ d'écart. La tolérance est serrée exprès : il faut le terme en $B$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Caractéristique de la Pt100 et droite à 0,385 Ω/K",
          xTitre: "température",
          xUnite: "°C",
          yTitre: "résistance",
          yUnite: "Ω",
          xMin: 0,
          xMax: 300,
          yMin: 95,
          yMax: 220,
          series: [
            { id: "r", nom: "Callendar et Van Dusen", fonction: (t) => rPt(t) },
            { id: "d", nom: "droite 100 (1 + 0,00385 T)", fonction: (t) => 100 * (1 + 0.00385 * t) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneV(c, r, couleurs, 150, [2, 4], "150 °C");
            ligneH(c, r, couleurs, rPt(150), "157,325 Ω", [7, 5], true);
          },
        });
      },
    })
  );

  /* Fondamental 2 : fréquence d'un codeur */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-codeur",
      titre: "Fréquence de la voie A d'un codeur",
      niveau: "fondamental",
      enonce:
        "<p>Un codeur incrémental de $1024$ points par tour est monté sur un moteur qui tourne à $1500\\ \\mathrm{tr/min}$. Quelle est la fréquence de sa voie $A$, en kilohertz ? La correction donne aussi la fréquence des fronts en décodage $\\times 4$.</p>",
      valeur: (1024 * 1500) / 60 / 1000,
      unite: "kHz",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Fréquence de A",
      etapes: [
        { texte: "$n/60 = 25\\ \\mathrm{tr/s}$ ; chaque tour produit $N = 1024$ périodes de $A$." },
        { texte: "$f_A = N n/60 = 1024 \\times 25 = 25\\,600\\ \\mathrm{Hz} = 25{,}6\\ \\mathrm{kHz}$, période $39{,}1\\ \\mathrm{\\mu s}$." },
        { texte: "En $\\times 4$ : $f_{\\text{fronts}} = 102{,}4\\ \\mathrm{kHz}$, un front toutes les $9{,}8\\ \\mathrm{\\mu s}$.", note: "Une entrée tout ou rien filtrée à $3\\ \\mathrm{ms}$ ne peut suivre que quelques dizaines de hertz." },
      ],
      visuelCorrection(conteneur, moteur) {
        const per = 1e6 / 25600;
        traceCorrection(moteur, conteneur, {
          titre: "Voies A et B sur deux périodes, à 1500 tr/min",
          xTitre: "temps",
          xUnite: "µs",
          yTitre: "niveau",
          yUnite: "",
          xMin: 0,
          xMax: 2 * per,
          yMin: -0.3,
          yMax: 3.1,
          echantillons: 800,
          series: [
            { id: "a", nom: "voie A", fonction: (t) => (frac(t / per) < 0.5 ? 2.8 : 1.8) },
            { id: "b", nom: "voie B, décalée vers le bas", fonction: (t) => (frac(t / per - 0.25) < 0.5 ? 1 : 0) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneV(c, r, couleurs, per, [7, 5], "39,1 µs");
          },
        });
      },
    })
  );

  /* Intermédiaire 1 : soudure froide */
  const eK3 = eK(400) - eK(30);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-thermocouple",
      titre: "Température d'un four par thermocouple",
      niveau: "intermédiaire",
      enonce:
        "<p>Un thermocouple de type K est raccordé par câble de compensation à un bornier à $30\\ ^\\circ\\mathrm{C}$. Le transmetteur lit $e = 15{,}194\\ \\mathrm{mV}$. Extraits de la table : $E(30) = 1{,}203\\ \\mathrm{mV}$, $E(390) = 15{,}975\\ \\mathrm{mV}$, $E(400) = 16{,}397\\ \\mathrm{mV}$, $E(410) = 16{,}820\\ \\mathrm{mV}$. Quelle est la température du four, en degrés Celsius ? La correction donne aussi la lecture sans compensation.</p>",
      valeur: 400,
      unite: "°C",
      tolerance: 0.005,
      chiffres: 4,
      libelleChamp: "Température Tc",
      etapes: [
        { texte: "Loi des températures intermédiaires : $E(T_c) = e + E(T_f) = 15{,}194 + 1{,}203 = 16{,}397\\ \\mathrm{mV}$." },
        { texte: "La table donne exactement $E(400) = 16{,}397\\ \\mathrm{mV}$ : $T_c = 400\\ ^\\circ\\mathrm{C}$." },
        { texte: "Sans compensation, on lirait $E^{-1}(15{,}194)$ : entre $E(370) = 15{,}133$ et $E(380) = 15{,}554\\ \\mathrm{mV}$, soit $371{,}5\\ ^\\circ\\mathrm{C}$, $28{,}5\\ \\mathrm{K}$ trop bas.", note: "L'erreur n'est pas exactement $30\\ \\mathrm{K}$, car la pente vaut $40{,}7\\ \\mathrm{\\mu V/K}$ vers $30\\ ^\\circ\\mathrm{C}$ et $42{,}2\\ \\mathrm{\\mu V/K}$ vers $400\\ ^\\circ\\mathrm{C}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Reconstitution de E(Tc) et lecture sur la caractéristique",
          xTitre: "température",
          xUnite: "°C",
          yTitre: "force électromotrice",
          yUnite: "mV",
          xMin: 0,
          xMax: 500,
          yMin: -1,
          yMax: 22,
          series: [{ id: "e", nom: "E(T), type K", fonction: eK }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, eK3, "e lue 15,194 mV", [2, 4], true);
            ligneH(c, r, couleurs, eK(400), "e + E(30) = 16,397 mV", [7, 5], true);
            ligneV(c, r, couleurs, tK(eK3), [2, 4], "371,5 °C", true);
            ligneV(c, r, couleurs, 400, [7, 5], "400 °C");
          },
        });
      },
    })
  );

  /* Intermédiaire 2 : capteur de Hall en boucle fermée */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-boucle-fermee",
      titre: "Résistance de mesure d'un capteur de Hall en boucle fermée",
      niveau: "intermédiaire",
      enonce:
        "<p>Un capteur de courant à effet Hall en boucle fermée a $N_2 = 1000$ spires secondaires de résistance $R_s = 30\\ \\Omega$, pour un conducteur primaire passant une fois. Il est alimenté en $\\pm 15\\ \\mathrm{V}$ et son étage de sortie perd $2{,}5\\ \\mathrm{V}$. Quelle résistance de mesure maximale $R_M$ permet de mesurer $50\\ \\mathrm{A}$ crête sans saturer, en ohms ?</p>",
      valeur: (15 - 2.5) / 0.05 - 30,
      unite: "Ω",
      tolerance: 0.02,
      chiffres: 4,
      libelleChamp: "R_M maximale",
      etapes: [
        { texte: "Équilibre des forces magnétomotrices : $I_s = N_p I_p/N_2 = 50/1000 = 50\\ \\mathrm{mA}$ crête." },
        { texte: "Tension disponible : $15 - 2{,}5 = 12{,}5\\ \\mathrm{V}$, qui doit couvrir $I_s(R_s + R_M)$." },
        { texte: "$R_M \\leq 12{,}5/0{,}05 - 30 = 250 - 30 = 220\\ \\Omega$.", note: "Avec $R_M = 100\\ \\Omega$, $25\\ \\mathrm{A}$ donnent $2{,}5\\ \\mathrm{V}$, et la marge reste confortable même pour $50\\ \\mathrm{A}$." },
      ],
      visuelCorrection: correctionEtapes(
        ["Is = Np Ip / N2 = 50 / 1000 = 50 mA", "tension disponible : 15 - 2,5 = 12,5 V", "Is (Rs + RM) ≤ 12,5 V", "RM ≤ 12,5 / 0,05 - 30 = 220 Ω", "au-delà : saturation, mesure écrêtée sans alarme"],
        "Bilan de tension de l'étage de sortie du capteur."
      ),
    })
  );

  /* Avancé : résolution et durée de comptage */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-comptage",
      titre: "Durée de comptage pour une résolution de vitesse",
      niveau: "avancé",
      enonce:
        "<p>Le codeur du convoyeur donne $4096$ fronts par tour après décodage $\\times 4$. On veut mesurer $30\\ \\mathrm{tr/min}$ avec une résolution de $1\\ \\%$ par la méthode de comptage. Quelle durée de comptage minimale faut-il, en millisecondes ? La correction compare avec la tâche de $5\\ \\mathrm{ms}$ et avec la mesure de période.</p>",
      valeur: (60 / (4096 * 0.3)) * 1000,
      unite: "ms",
      tolerance: 0.02,
      chiffres: 4,
      libelleChamp: "Durée minimale",
      etapes: [
        { texte: "Résolution voulue : $\\delta n = 0{,}01 \\times 30 = 0{,}3\\ \\mathrm{tr/min}$." },
        { texte: "Un front de plus ou de moins pendant $T_e$ vaut $\\delta n = 60/(kN\\,T_e)$, d'où $T_e \\geq 60/(4096 \\times 0{,}3) = 48{,}8\\ \\mathrm{ms}$." },
        { texte: "Avec $T_e = 5\\ \\mathrm{ms}$ : $\\delta n = 2{,}93\\ \\mathrm{tr/min}$, presque $10\\ \\%$ de $30\\ \\mathrm{tr/min}$, et environ $10$ fronts comptés seulement." },
        { texte: "Compromis : $48{,}8\\ \\mathrm{ms}$ de moyenne ajoutent environ $24\\ \\mathrm{ms}$ de retard dans la boucle. Mesure de période : à $30\\ \\mathrm{tr/min}$, $2048$ fronts par seconde, soit $488\\ \\mathrm{\\mu s}$ entre fronts, $4883$ coups d'une horloge de $10\\ \\mathrm{MHz}$ : résolution de $0{,}02\\ \\%$ sans retard notable.", note: "Les modules de comptage combinent souvent les deux méthodes : comptage à grande vitesse, période à basse vitesse." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Résolution de vitesse par comptage selon la durée de comptage",
          xTitre: "durée de comptage",
          xUnite: "ms",
          yTitre: "résolution",
          yUnite: "tr/min",
          xMin: 2,
          xMax: 100,
          yMin: 0,
          yMax: 4,
          series: [{ id: "r", nom: "δn = 60 / (4096 Te)", fonction: (te) => 60 / (4096 * te * 1e-3) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0.3, "1 % de 30 tr/min", [7, 5]);
            ligneV(c, r, couleurs, 48.83, [2, 4], "48,8 ms", true);
            ligneV(c, r, couleurs, 5, [1, 3], "5 ms");
          },
        });
      },
    })
  );

  /* Diagnostic industriel */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-came",
      titre: "Fin de course jamais atteinte",
      niveau: "diagnostic",
      enonce:
        "<p>Sur l'actionneur de la vanne de refoulement, la came en acier du fin de course \"vanne ouverte\" a été remplacée par une came usinée en aluminium, montée à $5\\ \\mathrm{mm}$ d'un détecteur inductif PNP de portée nominale $S_n = 8\\ \\mathrm{mm}$. Depuis, l'automate signale à chaque ouverture le défaut \"manœuvre trop longue\" au bout de $25\\ \\mathrm{s}$, et le voyant du détecteur ne s'allume jamais. Le fin de course \"vanne fermée\", même détecteur, came en acier à $5\\ \\mathrm{mm}$, fonctionne. Quelles affirmations sont exactes ?</p>",
      options: [
        { texte: "La came en aluminium n'est pas vue : avec un facteur de réduction de $0{,}3$ à $0{,}45$, la portée réelle n'est que de $2{,}4$ à $3{,}6\\ \\mathrm{mm}$.", juste: true },
        { texte: "Le voyant éteint montre que le détecteur lui-même ne détecte pas : le câblage de l'entrée n'est pas en cause.", juste: true },
        { texte: "Le détecteur est probablement de type NPN, d'où l'absence de signal." },
        { texte: "Solution : revenir à une came en acier, ou rapprocher la came à moins de $0{,}8$ fois la portée réelle, soit environ $2\\ \\mathrm{mm}$, ce qui est mécaniquement délicat.", juste: true },
        { texte: "Allonger à $40\\ \\mathrm{s}$ le temps de manœuvre autorisé règle le problème." },
      ],
      etapes: [
        { texte: "La portée nominale est définie sur l'acier doux ; l'aluminium, très conducteur et non magnétique, absorbe moins d'énergie de l'oscillateur : portée réduite." },
        { texte: "$0{,}3 \\times 8 = 2{,}4\\ \\mathrm{mm}$ et $0{,}45 \\times 8 = 3{,}6\\ \\mathrm{mm}$, tous deux inférieurs aux $5\\ \\mathrm{mm}$ de montage." },
        { texte: "Le voyant est commandé par le comparateur interne : éteint, il prouve que l'oscillateur n'est pas amorti. Un problème PNP ou NPN laisserait le voyant allumé et l'entrée muette ; et le détecteur identique de l'autre came fonctionne." },
        { texte: "Allonger le temps autorisé masquerait le symptôme : la vanne s'arrêterait en butée sur la limitation de courant sans jamais confirmer sa position.", note: "Facteurs de réduction : donnée du constructeur, à lire sur la fiche du détecteur retenu." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(moteur, conteneur, "0 0 720 270", dessinPortees("k6-fl"), "Portées du détecteur : 8 mm sur acier, 6,4 mm de portée de travail, 2,4 à 3,6 mm sur aluminium ; la came à 5 mm est hors de portée.");
      },
    })
  );

  /* Question conceptuelle */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-difference",
      titre: "Ce que mesure vraiment un thermocouple",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi un thermocouple ne mesure pas une température mais une différence de températures, ce que cela impose au raccordement et au transmetteur, et pourquoi un câble de cuivre entre la tête et le bornier fausse la mesure.</p>",
      motsCles: [
        ["difference", "ecart", "deux temperatures"],
        ["soudure froide", "jonction froide", "reference", "bornier"],
        ["compens"],
        ["cuivre", "tete", "deplace"],
      ],
      minimum: 3,
      exemple: "Trois ou quatre phrases : origine de la tension, rôle de la soudure froide, compensation, effet du cuivre.",
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(moteur, conteneur, "0 0 700 250", dessinSoudures(), "En haut, câble de compensation : la soudure froide est au bornier, la compensation est juste. En bas, câble de cuivre : la soudure froide passe dans la tête.");
      },
      etapes: [
        { texte: "La force électromotrice naît le long des fils, là où règne un gradient de température ; avec deux alliages différents, la tension disponible ne dépend que des températures des deux extrémités : $e = E(T_c) - E(T_f)$." },
        { texte: "Il faut donc connaître $T_f$, la température de la jonction avec le cuivre, et ajouter $E(T_f)$ : c'est la compensation de soudure froide, faite au bornier du transmetteur." },
        { texte: "Un câble de cuivre déplace la jonction dans la tête : le transmetteur compense une température qui n'est plus celle de la soudure froide, et la mesure suit la température de la tête.", note: "D'où le câble de compensation, de mêmes propriétés thermoélectriques que le thermocouple, jusqu'au bornier." },
      ],
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

/** Trois câblages d'un détecteur PNP vers une entrée d'automate. */
function dessinTroisCablages() {
  let d = TRAITS + ' stroke-width="1.5">';
  for (const x0 of [10, 220, 430]) {
    d += '<rect x="' + x0 + '" y="10" width="196" height="210" rx="8" stroke-dasharray="2 4" stroke-width="1"/>';
    d += '<path d="M' + (x0 + 12) + " 40H" + (x0 + 186) + "M" + (x0 + 12) + " 196H" + (x0 + 186) + '" stroke-width="2.2"/>';
    d += '<rect x="' + (x0 + 20) + '" y="70" width="60" height="90" rx="5"/>';
    d += '<path d="M' + (x0 + 36) + " 40V70M" + (x0 + 36) + ' 160V196"/>';
  }
  /* A : PNP, entrée à commun au 0 V : correct */
  d += '<path d="M80 115H120"/><rect x="120" y="95" width="70" height="70" rx="4"/>';
  d += '<path d="M150 115V125l5 3l-10 6l10 6l-10 6l5 3V196"/>';
  /* B : PNP, entrée à commun au +24 V */
  d += '<path d="M290 115H330"/><rect x="330" y="95" width="70" height="70" rx="4"/>';
  d += '<path d="M360 40V95M360 95V105l5 3l-10 6l10 6l-10 6l5 3V115"/>';
  /* C : sortie PNP reliée directement au 0 V */
  d += '<path d="M500 115H560V196"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="10.5"');
  for (const [x0, n] of [[10, "A"], [220, "B"], [430, "C"]]) {
    d += texte(x0 + 10, 30, "câblage " + n + "   +24 V");
    d += texte(x0 + 150, 212, "0 V");
    d += texte(x0 + 24, 90, "PNP");
  }
  d += texte(124, 90, "entrée") + texte(124, 182, "commun 0 V");
  d += texte(334, 90, "entrée") + texte(334, 182, "commun +24 V");
  d += texte(500, 140, "sortie au 0 V");
  d += texte(500, 156, "sans charge");
  d += "</g>";
  return d;
}

const VISUELS_QUIZ = [
  etapes(["Pt100 : jusqu'à 600 °C environ en usage courant", "900 °C : thermocouple de type K ou N", "avec câble de compensation et soudure froide"], "Choix d'un capteur de température pour un four."),
  etapes(["3 fils : R mesurée = RT + Rf1 - Rf2", "Rf1 ≠ Rf2 : erreur (Rf1 - Rf2) / S", "0,2 Ω de différence : 0,5 K"], "Le montage trois fils compense, il ne supprime pas."),
  etapes(["p = (12,0 - 4) / 16 × 500 mbar = 250 mbar", "h = p / (ρ g) = 25 000 / (1000 × 9,81)", "h = 2,548 m"], "Niveau hydrostatique."),
  etapes(["VH = I B / (n q t)", "cuivre : n ≈ 8,5 × 10²⁸ m⁻³, VH en nanovolts", "semi-conducteur : n ≈ 10²² m⁻³, VH en millivolts"], "Densité de porteurs et tension de Hall."),
  etapes(["incrémental : position perdue à la coupure", "absolu : mot de position lu dès la mise sous tension", "pas de prise d'origine nécessaire"], "Codeur absolu."),
  () => ({ viewBox: "0 0 640 230", dessin: dessinTroisCablages(), legende: "A : la sortie PNP débite dans l'entrée à commun au 0 V. B : aucun courant possible. C : court-circuit de la sortie à chaque détection." }),
  etapes(["T ≈ (R - 100) / 0,385", "= (119,40 - 100) / 0,385", "= 50,4 °C ; la relation exacte donne 50,0 °C"], "Lecture rapide d'une Pt100."),
  etapes(["détecteur inductif : courants de Foucault dans un métal", "plastique, carton, bois : aucun effet", "pour eux : capacitif ou photoélectrique"], "Ce que voit un détecteur inductif."),
  etapes(["ΔR = K ε R", "= 2 × 500 × 10⁻⁶ × 350", "= 0,35 Ω"], "Variation de résistance d'une jauge."),
  etapes(["shunt : continu et alternatif, non isolé", "TC : alternatif seul ; Rogowski : alternatif, sans saturation", "Hall en boucle fermée : continu et alternatif, isolé"], "Capteurs de courant."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Quel capteur choisir pour mesurer la température des fumées d'un four à $900\\ ^\\circ\\mathrm{C}$ ?</p>",
        options: ["Une Pt100 classe A en quatre fils", "Un thermocouple de type K ou N", "Une thermistance à coefficient négatif", "Un détecteur inductif"],
        bonnes: [1],
        explication: "La Pt100 courante plafonne vers $600\\ ^\\circ\\mathrm{C}$ et la thermistance vers $150\\ ^\\circ\\mathrm{C}$. Le thermocouple couvre $900\\ ^\\circ\\mathrm{C}$, avec câble de compensation et soudure froide.",
        resume: "Capteur pour haute température",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Le montage trois fils annule l'erreur due aux fils d'une Pt100, quelles que soient les résistances des fils.</p>",
        reponse: false,
        explication: "Il donne $R_T + R_{f1} - R_{f2}$ : il compense des fils identiques, pas une différence de section ni une connexion oxydée.",
        resume: "Limite du montage trois fils",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Un capteur de niveau hydrostatique $0$-$500\\ \\mathrm{mbar}$ pour $4$-$20\\ \\mathrm{mA}$ délivre $12{,}0\\ \\mathrm{mA}$ dans de l'eau ($\\rho = 1000\\ \\mathrm{kg/m^3}$, $g = 9{,}81\\ \\mathrm{m/s^2}$). Hauteur d'eau, en mètres ?</p>",
        valeur: 25000 / (1000 * 9.81),
        unite: "m",
        tolerance: 0.02,
        explication: "$p = (12 - 4)/16 \\times 500 = 250\\ \\mathrm{mbar} = 25\\,000\\ \\mathrm{Pa}$ ; $h = p/(\\rho g) = 2{,}548\\ \\mathrm{m}$.",
        resume: "Niveau hydrostatique",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi les capteurs à effet Hall utilisent-ils des semi-conducteurs plutôt que du cuivre ?</p>",
        motsCles: [["densite", "porteurs", "nombre", "n "], ["tension", "vh", "signal", "sensib", "grande", "elevee"]],
        minimum: 2,
        explication: "$V_H = IB/(nqt)$ : la tension est inversement proportionnelle à la densité de porteurs. Le semi-conducteur en a des millions de fois moins que le cuivre, d'où une tension de Hall des millions de fois plus grande.",
        resume: "Effet Hall et densité de porteurs",
      },
      {
        type: "qcm",
        enonce: repere(4) + "<p>Quel est le principal avantage d'un codeur absolu sur un codeur incrémental ?</p>",
        options: [
          "Une résolution toujours plus fine",
          "La position est connue dès la mise sous tension, sans prise d'origine",
          "Il n'a pas besoin d'alimentation",
          "Il mesure directement le couple",
        ],
        bonnes: [1],
        explication: "Chaque position est codée par un mot, en code de Gray : aucune prise d'origine n'est nécessaire après une coupure. La résolution n'est pas forcément meilleure.",
        resume: "Codeur absolu",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Trois câblages d'un détecteur PNP vers une entrée d'automate. Lequel est correct ?</p>",
        consigne: "Cliquez sur le câblage correct.",
        viewBox: "0 0 640 230",
        dessin: dessinTroisCablages(),
        zones: [
          { x: 12, y: 12, largeur: 192, hauteur: 206, etiquette: "câblage A", juste: true },
          { x: 222, y: 12, largeur: 192, hauteur: 206, etiquette: "câblage B" },
          { x: 432, y: 12, largeur: 192, hauteur: 206, etiquette: "câblage C" },
        ],
        explication: "La sortie PNP se relie au $+24\\ \\mathrm{V}$ : elle doit débiter dans une entrée dont la charge revient au $0\\ \\mathrm{V}$, câblage A. En B, sortie et commun sont au $+24\\ \\mathrm{V}$, aucun courant ne circule. En C, la sortie est court-circuitée au $0\\ \\mathrm{V}$ à chaque détection.",
        resume: "Câblage d'un détecteur PNP",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Une Pt100 présente $119{,}40\\ \\Omega$. Avec la sensibilité moyenne de $0{,}385\\ \\Omega/\\mathrm{K}$, quelle température estimez-vous, en degrés Celsius ?</p>",
        valeur: (119.4 - 100) / 0.385,
        unite: "°C",
        tolerance: 0.02,
        explication: "$(119{,}40 - 100)/0{,}385 = 50{,}4\\ ^\\circ\\mathrm{C}$ ; la relation de Callendar et Van Dusen donne $50{,}0\\ ^\\circ\\mathrm{C}$ : l'estimation linéaire suffit pour un contrôle, pas pour une mesure.",
        resume: "Lecture rapide d'une Pt100",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Un détecteur inductif détecte une palette en plastique.</p>",
        reponse: false,
        explication: "Il ne voit que les métaux, par les courants de Foucault qu'il y induit. Pour le plastique : détecteur capacitif ou photoélectrique.",
        resume: "Détecteur inductif",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Une jauge de $350\\ \\Omega$, de facteur de jauge $2$, subit une déformation de $500\\ \\mathrm{\\mu m/m}$. Variation de résistance, en ohms ?</p>",
        valeur: 350 * 2 * 500e-6,
        unite: "Ω",
        tolerance: 0.02,
        explication: "$\\Delta R = K\\varepsilon R = 2 \\times 5 \\times 10^{-4} \\times 350 = 0{,}35\\ \\Omega$, soit $0{,}1\\ \\%$ : d'où le pont de Wheatstone.",
        resume: "Jauge de contrainte",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Quelles affirmations sur les capteurs de courant sont exactes ?</p>",
        options: [
          { texte: "Un shunt mesure le continu, mais n'isole pas la mesure du circuit.", juste: true },
          { texte: "Un capteur de Hall en boucle fermée mesure le continu et l'alternatif avec isolement.", juste: true },
          { texte: "Un transformateur de courant mesure le courant continu d'un bus." },
          { texte: "Une bobine de Rogowski ne sature pas, mais ne mesure pas le continu.", juste: true },
        ],
        multiple: true,
        explication: "Le transformateur de courant et la bobine de Rogowski reposent sur l'induction : ils sont aveugles au continu. Le shunt est galvanique ; le capteur de Hall à compensation est isolé et mesure le continu.",
        resume: "Capteurs de courant",
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
      { categorie: "Pt100", question: "Que valent $R_0$, $R_{100}$ et la sensibilité moyenne d'une Pt100 ?", reponse: "$100\\ \\Omega$, $138{,}51\\ \\Omega$, soit $0{,}385\\ \\Omega/\\mathrm{K}$ ; la sensibilité locale vaut $R_0(A + 2BT)$." },
      { categorie: "Montages", question: "Que voit le transmetteur en deux, trois et quatre fils ?", reponse: "$R_T + 2R_f$ ; $R_T + R_{f1} - R_{f2}$ ; $R_T$. Le trois fils compense des fils identiques, le quatre fils supprime leur effet." },
      { categorie: "Auto-échauffement", question: "Comment s'estime l'auto-échauffement d'une sonde à résistance ?", reponse: "$\\Delta T = E\\,R_T I^2$, avec $E$ en $\\mathrm{K/mW}$ donné pour un milieu ; quelques centièmes de kelvin à $1\\ \\mathrm{mA}$." },
      { categorie: "Thermocouple", question: "Quelle relation lie la tension lue et la température d'un thermocouple ?", reponse: "$E(T_c) = e + E(T_f)$ : loi des températures intermédiaires, avec $T_f$ la température de la soudure froide au bornier." },
      { categorie: "Câblage", question: "Que se passe-t-il si l'on prolonge un thermocouple en cuivre ?", reponse: "La soudure froide passe dans la tête ; la compensation au bornier devient fausse de $E(T_{\\text{tête}}) - E(T_f)$, la mesure suit la tête." },
      { categorie: "Jauges", question: "Que donne un pont complet de quatre jauges ?", reponse: "$V_s = V_a K\\varepsilon$, compensé en température : $10\\ \\mathrm{mV}$ sous $10\\ \\mathrm{V}$ pour $K = 2$ et $500\\ \\mathrm{\\mu m/m}$." },
      { categorie: "Inductif", question: "Comment obtenir la portée de travail d'un détecteur inductif ?", reponse: "$S_n$ multipliée par le facteur de réduction du métal, environ $0{,}3$ à $0{,}45$ pour l'aluminium, puis par $0{,}8$ de marge." },
      { categorie: "PNP et NPN", question: "Quel détecteur pour une entrée à commun au $0\\ \\mathrm{V}$ ?", reponse: "Un PNP : sa sortie se relie au $+24\\ \\mathrm{V}$ et débite dans l'entrée. Un NPN demande un commun au $+24\\ \\mathrm{V}$." },
      { categorie: "Codeur", question: "Résolution, fréquence et résolution de vitesse d'un codeur incrémental ?", reponse: "$360/(kN)$ degrés ; $f_A = Nn/60$ ; par comptage pendant $T_e$, $\\delta n = 60/(kN\\,T_e)$ tours par minute." },
      { categorie: "Hall", question: "Que vaut le courant secondaire d'un capteur de Hall en boucle fermée ?", reponse: "$I_s = N_p I_p/N_2$ ; mesure du continu et de l'alternatif, isolée ; $R_M$ limitée par la tension disponible." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["δθ = 360° / (k N)", "= 360 / (4 × 2500)", "= 0,036°"], "Résolution d'un codeur en décodage x 4."),
  etapes(["sans compensation : lue = E⁻¹(E(Tc) - E(Tf))", "E(300) - E(25) = 12,209 - 1,000 = 11,209 mV", "lue ≈ 275,8 °C : trop bas"], "Soudure froide oubliée."),
  etapes(["erreur ≈ 2 Rf / S", "= 2 × 1 / 0,385", "≈ 5,2 K, par excès"], "Pt100 en deux fils."),
  etapes(["tm = 0,35 / B", "= 0,35 / 100 MHz", "= 3,5 ns"], "Temps de montée d'une chaîne de mesure."),
  etapes(["masse d'une sonde passive = châssis = PE", "pince sur un autre potentiel : court-circuit", "mesure flottante : sonde différentielle"], "Pince de masse d'un oscilloscope."),
  etapes(["ω τ = 2 π × 0,1 × 10 = 6,283", "|H| = 1 / √(1 + 39,48) = 0,157", "G = 20 log 0,157 = - 16,07 dB"], "Gain d'un capteur du premier ordre."),
  etapes(["E = K Φ Ω : proportionnelle à la vitesse", "20 V pour 1000 tr/min", "à 1475 tr/min : 29,5 V"], "Génératrice tachymétrique."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Un codeur de $2500$ points par tour est lu en décodage $\\times 4$. Résolution angulaire, en degrés ?</p>",
        valeur: 360 / (4 * 2500),
        unite: "°",
        tolerance: 0.02,
        explication: "$360/(4 \\times 2500) = 0{,}036^\\circ$, soit $10\\,000$ fronts par tour.",
        resume: "Résolution d'un codeur",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Si l'on oublie la compensation de soudure froide d'un thermocouple dont le bornier est à $25\\ ^\\circ\\mathrm{C}$, la température lue est trop haute.</p>",
        reponse: false,
        explication: "Le transmetteur lit $E(T_c) - E(T_f)$ sans ajouter $E(T_f)$ : la lecture est trop basse, d'environ $24\\ \\mathrm{K}$, par exemple $275{,}8\\ ^\\circ\\mathrm{C}$ pour $300\\ ^\\circ\\mathrm{C}$.",
        resume: "Soudure froide",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Cette séance. Une Pt100 est raccordée en deux fils de $1\\ \\Omega$ chacun. Avec $0{,}385\\ \\Omega/\\mathrm{K}$, erreur de température, en kelvins ?</p>",
        valeur: 2 / 0.385,
        unite: "K",
        tolerance: 0.02,
        explication: "$2R_f/S = 2/0{,}385 = 5{,}2\\ \\mathrm{K}$, toujours par excès.",
        resume: "Pt100 en deux fils",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours précédent. Temps de montée propre d'une chaîne oscilloscope et sonde de $100\\ \\mathrm{MHz}$ de bande passante, en nanosecondes ?</p>",
        valeur: 3.5,
        unite: "ns",
        tolerance: 0.02,
        explication: "$t_m = 0{,}35/B = 0{,}35/10^8 = 3{,}5\\ \\mathrm{ns}$.",
        resume: "Temps de montée et bande passante",
      },
      {
        type: "qcm",
        enonce: repere(4) + "<p>Cours précédent. On veut observer la tension entre deux points d'un circuit dont aucun n'est au potentiel de la terre. Que faire ?</p>",
        options: [
          "Couper la terre de l'oscilloscope",
          "Poser la pince de masse de la sonde passive sur l'un des points",
          "Utiliser une sonde différentielle ou une voie isolée de catégorie suffisante",
          "Utiliser une sonde $\\times 10$ plutôt que $\\times 1$",
        ],
        bonnes: [2],
        explication: "La masse d'une sonde passive est reliée au PE : la poser ailleurs crée un court-circuit, couper la terre met le châssis sous tension.",
        resume: "Mesure flottante",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours vieux d'une semaine. Un capteur du premier ordre a $\\tau = 10\\ \\mathrm{s}$. Quel est son gain à $0{,}1\\ \\mathrm{Hz}$, en décibels ?</p>",
        valeur: 20 * Math.log10(1 / Math.sqrt(1 + (2 * Math.PI * 0.1 * 10) ** 2)),
        unite: "dB",
        tolerance: 0.02,
        explication: "$\\omega\\tau = 2\\pi \\times 0{,}1 \\times 10 = 6{,}28$ ; $|H| = 1/\\sqrt{1 + 39{,}5} = 0{,}157$, soit $-16{,}07\\ \\mathrm{dB}$ : une oscillation de température de $10\\ \\mathrm{s}$ de période est vue $6{,}4$ fois plus petite.",
        resume: "Bode d'un premier ordre",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours vieux d'un mois. Une génératrice tachymétrique à courant continu délivre $20\\ \\mathrm{V}$ à $1000\\ \\mathrm{tr/min}$. Quelle tension à $1475\\ \\mathrm{tr/min}$, à vide, en volts ?</p>",
        valeur: (20 * 1475) / 1000,
        unite: "V",
        tolerance: 0.01,
        explication: "$E = K\\Phi\\Omega$ à flux constant, aimants permanents : $E = 20 \\times 1475/1000 = 29{,}5\\ \\mathrm{V}$. C'est un capteur actif de vitesse.",
        resume: "Génératrice tachymétrique",
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
    titre: "Où en suis-je sur les capteurs industriels ?",
  });
  if (auto) ressources.push(auto);
}
