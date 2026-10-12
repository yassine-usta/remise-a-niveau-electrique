/* ==========================================================================
   cours/puissance-en-triphase/cours.js
   Puissance en triphasé : puissances P, Q, S et mesure par wattmètres.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const RAC3 = Math.sqrt(3);
const W50 = TAU * 50;

/* Exemple de la section H : moteur 15 kW, rendement 0,91, cos phi 0,85, 400 V. */
const EX = {
  u: 400,
  pn: 15000 / 0.91,
  inom: 15000 / 0.91 / (RAC3 * 400 * 0.85),
  p0: 900,
  i0: 11,
};

/* --------------------------------------------------------------------------
   Calcul complexe minimal
   -------------------------------------------------------------------------- */

const cx = {
  polaire: (module, degres) => ({ re: module * Math.cos(degres * DEG), im: module * Math.sin(degres * DEG) }),
  plus: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  moins: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
  fois: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  conj: (a) => ({ re: a.re, im: -a.im }),
  div: (a, b) => {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  },
  module: (a) => Math.hypot(a.re, a.im),
  argument: (a) => Math.atan2(a.im, a.re) / DEG,
};

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

/** Portion d'un segment, de son origine jusqu'à la fraction f de sa longueur. */
function partiel(x1, y1, x2, y2, f, retrait = 3) {
  const g = Math.max(0, Math.min(1, f));
  if (g <= 0) return "";
  return segment(x1, y1, x1 + (x2 - x1) * g, y1 + (y2 - y1) * g, g >= 1 ? retrait : 0.1);
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

/** Point d'angle donné, en degrés, sur un cercle de centre o, axe vertical vers le haut. */
function polairePx(o, rayon, degres) {
  return { x: o.x + rayon * Math.cos(degres * DEG), y: o.y - rayon * Math.sin(degres * DEG) };
}

/** Arc de cercle de a1 à a2 degrés, parcouru jusqu'à la fraction f. */
function arc(o, rayon, a1, a2, f = 1) {
  const g = Math.max(0, Math.min(1, f));
  const fin = a1 + (a2 - a1) * g;
  if (Math.abs(fin - a1) < 0.3) return "";
  const p1 = polairePx(o, rayon, a1);
  const p2 = polairePx(o, rayon, fin);
  const grand = Math.abs(fin - a1) > 180 ? 1 : 0;
  const sens = fin < a1 ? 1 : 0;
  return "M" + p1.x.toFixed(1) + " " + p1.y.toFixed(1) + "A" + rayon + " " + rayon + " 0 " + grand + " " + sens + " " + p2.x.toFixed(1) + " " + p2.y.toFixed(1);
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
    echantillons: 600,
    ...options,
  });
  if (traceur) ressources.push(traceur);
  return traceur;
}

/** Diagramme vectoriel figé pour une correction. */
function fresnelCorrection(moteur, conteneur, options) {
  const diagramme = moteur.sim.fresnel(conteneur, {
    genre: "Correction visuelle",
    rotation: false,
    projection: false,
    ratio: 0.5,
    ...options,
  });
  if (diagramme) ressources.push(diagramme);
  return diagramme;
}

/** Courbes des deux lectures en fonction de phi, pour les corrections. */
function courbesLectures(moteur, conteneur, ui, titre, points) {
  return traceCorrection(moteur, conteneur, {
    titre,
    xTitre: "φ",
    xUnite: "°",
    yTitre: "lecture",
    yUnite: "kW",
    xMin: -90,
    xMax: 90,
    series: [
      { id: "w1", nom: "W1 = U I cos(φ - 30°)", couleur: "serie-1", epaisseur: 2.6, fonction: (p) => (ui * Math.cos((p - 30) * DEG)) / 1000 },
      { id: "w2", nom: "W2 = U I cos(φ + 30°)", couleur: "serie-5", epaisseur: 2.6, fonction: (p) => (ui * Math.cos((p + 30) * DEG)) / 1000 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
      for (const point of points) marquerPoint(c, repere, couleurs, point.x, point.y, point.libelle, point.gauche);
    },
  });
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
  construireProduit(racine, api);
  construireConstruction(racine, api);
  construireAronSim(racine, api);
  construireValidite(racine, api);
  construireTriangle(racine, api);
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
    ["#e-wattmetre-figure svg", 1.5],
    ["#e-trois-figure svg", 1.6],
    ["#e-aron-figure svg", 1.6],
    ["#f-schema-principal svg", 2.2],
    ["#f-fresnel svg", 1.8],
    ["#f-courbes svg", 2],
    ["#i-tableau-figure svg", 2],
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
      id: "c-mono",
      titre: "Puissance active monophasée",
      niveau: "prérequis",
      enonce:
        "<p>Un dipôle alimenté sous $230\\ \\mathrm{V}$ efficaces est traversé par $12\\ \\mathrm{A}$ efficaces, en retard de " +
        "$40^\\circ$ sur la tension. Quelle puissance active reçoit-il ?</p>",
      valeur: 230 * 12 * Math.cos(40 * DEG),
      unite: "W",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Puissance active $P$",
      etapes: [
        { texte: "La puissance instantanée $p = u\\,i$ a pour moyenne $P = UI\\cos\\varphi$, en convention récepteur." },
        { texte: "$UI = 230 \\times 12 = 2760\\ \\mathrm{VA}$ et $\\cos 40^\\circ = 0{,}7660$." },
        {
          texte: "$P = 2760 \\times 0{,}7660 = 2114\\ \\mathrm{W}$.",
          note: "$Q = UI\\sin\\varphi = 1774\\ \\mathrm{var}$ : le courant en retard signe un dipôle inductif, $Q > 0$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Tension et courant en retard de 40 degrés",
          unite: "",
          vecteurs: [
            { id: "u", nom: "U / 20, en volts divisés par 20", amplitude: 11.5, phase: 0, couleur: "serie-1" },
            { id: "i", nom: "I, en ampères", amplitude: 12, phase: -40, couleur: "serie-5", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-u13",
      titre: "Position de la tension composée U13",
      niveau: "prérequis",
      enonce:
        "<p>Dans un système équilibré direct, $\\underline{V}_1 = 230\\ \\mathrm{V}$ à $0^\\circ$ et $\\underline{V}_3 = 230\\ \\mathrm{V}$ à " +
        "$+120^\\circ$. Quel est l'argument, en degrés, de $\\underline{U}_{13} = \\underline{V}_1 - \\underline{V}_3$ ?</p>",
      valeur: -30,
      unite: "°",
      tolerance: 0.02,
      chiffres: 0,
      libelleChamp: "Argument de $\\underline{U}_{13}$",
      etapes: [
        { texte: "$\\underline{V}_3 = 230(\\cos 120^\\circ + j\\sin 120^\\circ) = -115 + j199{,}19\\ \\mathrm{V}$." },
        { texte: "$\\underline{U}_{13} = 230 + 115 - j199{,}19 = 345 - j199{,}19\\ \\mathrm{V}$." },
        {
          texte: "Module $398{,}4\\ \\mathrm{V}$, argument $\\arctan(-199{,}19/345) = -30^\\circ$.",
          note: "$\\underline{U}_{13} = -\\underline{U}_{31}$ : la tension composée $\\underline{U}_{31}$, à $+150^\\circ$, retournée. C'est la tension vue par le premier wattmètre de la séance.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "U13 = V1 + (-V3)",
          unite: "V",
          somme: true,
          nomSomme: "U13 = 398,4 V à -30 degrés",
          vecteurs: [
            { id: "v1", nom: "V1", amplitude: 230, phase: 0, couleur: "serie-1" },
            { id: "mv3", nom: "-V3, opposé de V3", amplitude: 230, phase: -60, couleur: "serie-4", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-complexe",
      titre: "Puissance complexe",
      niveau: "prérequis",
      enonce:
        "<p>$\\underline{V} = 230\\ \\mathrm{V}$ à $0^\\circ$ et $\\underline{I} = 10\\ \\mathrm{A}$ à $-36{,}87^\\circ$. " +
        "Quelle est la puissance réactive $Q = \\mathrm{Im}\\left(\\underline{V}\\,\\underline{I}^*\\right)$ ?</p>",
      valeur: 1380,
      unite: "var",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Puissance réactive $Q$",
      etapes: [
        { texte: "$\\underline{I}^* = 10\\ \\mathrm{A}$ à $+36{,}87^\\circ$, donc $\\underline{S} = 2300\\ \\mathrm{VA}$ à $+36{,}87^\\circ$." },
        { texte: "$\\underline{S} = 2300(0{,}8 + j0{,}6) = 1840 + j1380$." },
        { texte: "$Q = 1380\\ \\mathrm{var}$, positif : récepteur inductif.", note: "La conjugaison du courant fait apparaître $+\\varphi$ ; sans elle, le signe de $Q$ serait faux." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Triangle des puissances",
          xTitre: "P",
          xUnite: "W",
          yTitre: "Q",
          yUnite: "var",
          xMin: 0,
          xMax: 2400,
          yMin: 0,
          yMax: 1600,
          series: [{ id: "s", nom: "droite d'angle φ = 36,87° portant S", couleur: "serie-1", epaisseur: 2.4, fonction: (p) => (p <= 1840 ? p * 0.75 : NaN) }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 1840, 1380, "S = 1840 + j1380", true);
            marquerPoint(c, repere, couleurs, 1840, 0, "P = 1840 W", true);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : ce que lit un wattmètre
   -------------------------------------------------------------------------- */

function construireProduit(racine, api) {
  const U = 400;
  const I = 20;
  const etat = { phi: 45, t: 40 };

  /* v1 en cosinus d'origine, u13 en retard de 30 degrés, i1 en retard de phi. */
  const uRel = (tms) => Math.cos(W50 * (tms / 1000) - 30 * DEG);
  const iRel = (tms) => Math.cos(W50 * (tms / 1000) - etat.phi * DEG);
  const w = (tms) => (2 * U * I * uRel(tms) * iRel(tms)) / 1000;
  const wExact = () => (U * I * Math.cos((etat.phi - 30) * DEG)) / 1000;
  function moyenne(tms) {
    if (tms <= 1e-6) return w(0);
    const t = tms / 1000;
    const alpha = (30 + etat.phi) * DEG;
    const oscill = (Math.sin(2 * W50 * t - alpha) + Math.sin(alpha)) / (2 * W50 * t);
    return (U * I * (Math.cos((etat.phi - 30) * DEG) + oscill)) / 1000;
  }

  const trace1 = api.sim.traceur("#d-produit-trace", {
    titre: "Tension u13 et courant i1 vus par le wattmètre W1",
    genre: "Animation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "rapport à la crête",
    xMin: 0,
    xMax: 40,
    yMin: -1.2,
    yMax: 1.2,
    ratio: 0.3,
    echantillons: 500,
    series: [
      { id: "u", nom: "u13(t) / crête", couleur: "serie-1", epaisseur: 2.4, fonction: uRel },
      { id: "i", nom: "i1(t) / crête", couleur: "serie-5", epaisseur: 2.4, fonction: iRel },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
      ligneV(c, repere, couleurs, etat.t, "instant");
    },
  });
  if (trace1) ressources.push(trace1);

  const trace2 = api.sim.traceur("#d-produit-moyenne", {
    titre: "Produit w = u13 i1 et sa moyenne depuis t = 0",
    genre: "Animation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "w",
    yUnite: "kW",
    xMin: 0,
    xMax: 40,
    yMin: -17,
    yMax: 17,
    ratio: 0.36,
    echantillons: 500,
    series: [
      { id: "w", nom: "w(t) = u13 i1", couleur: "serie-2", epaisseur: 2.2 },
      { id: "m", nom: "moyenne de w depuis t = 0", couleur: "serie-4", epaisseur: 3.2 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
      ligneH(c, repere, couleurs, wExact(), "W1 = " + nombre(api, wExact(), 2) + " kW", wExact() > 10);
      ligneV(c, repere, couleurs, etat.t, "");
    },
  });
  if (trace2) ressources.push(trace2);

  const valeurs = api.sim.valeurs("#d-produit-valeurs", [
    { id: "t", libelle: "Instant t", unite: "ms", decimales: 2 },
    { id: "u", libelle: "u13", unite: "V", decimales: 0 },
    { id: "i", libelle: "i1", unite: "A", decimales: 2 },
    { id: "w", libelle: "Produit w = u13 i1", unite: "kW", decimales: 2 },
    { id: "m", libelle: "Moyenne depuis t = 0", unite: "kW", decimales: 3 },
    { id: "exact", libelle: "Lecture W1 = U I cos(φ - 30°)", unite: "kW", decimales: 3 },
    { id: "theta", libelle: "Angle vu par W1, φ - 30°", unite: "°", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    if (trace1) {
      trace1.definirFonction("i", iRel);
      trace1.demanderRendu();
    }
    if (trace2) {
      trace2.definirFonction("w", (tms) => (tms <= etat.t + 1e-9 ? w(tms) : NaN));
      trace2.definirFonction("m", (tms) => (tms <= etat.t + 1e-9 && tms > 0.15 ? moyenne(tms) : NaN));
      trace2.demanderRendu();
    }
    if (valeurs) {
      valeurs.maj({
        t: etat.t,
        u: U * Math.SQRT2 * uRel(etat.t),
        i: I * Math.SQRT2 * iRel(etat.t),
        w: w(etat.t),
        m: moyenne(etat.t),
        exact: wExact(),
        theta: etat.phi - 30,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#d-produit-curseurs",
    [{ id: "phi", libelle: "Déphasage φ de la charge", min: -90, max: 90, pas: 1, valeur: 45, unite: "°" }],
    (lues) => {
      etat.phi = lues.phi;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-produit-lecteur", {
    de: 0,
    a: 40,
    duree: 12,
    boucle: false,
    auto: false,
    libelle: "Faire avancer le temps sur deux périodes",
    rappel(valeur) {
      etat.t = valeur;
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);
  dessiner();
}

/* --------------------------------------------------------------------------
   Diagramme de Fresnel commun aux deux figures de la section E
   -------------------------------------------------------------------------- */

const FR = { o: { x: 230, y: 190 }, kv: 88, ki: 118 };

/** Positions des phaseurs pour un déphasage phi, en degrés. */
function geometrieFresnel(phi) {
  const o = FR.o;
  const v = [0, -120, 120].map((a) => polairePx(o, FR.kv, a));
  const u13 = polairePx(o, FR.kv * RAC3, -30);
  const u23 = polairePx(o, FR.kv * RAC3, -90);
  const angles = [-phi, -120 - phi, 120 - phi];
  const i = angles.map((a) => polairePx(o, FR.ki, a));
  const c1 = Math.cos((phi - 30) * DEG);
  const c2 = Math.cos((phi + 30) * DEG);
  const pr1 = polairePx(o, FR.ki * c1, -30);
  const pr2 = polairePx(o, FR.ki * c2, -90);
  return { o, v, u13, u23, i, angles, c1, c2, pr1, pr2 };
}

function fondFresnel(svg, idMarqueur) {
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(idMarqueur);
  const axes = svgEl("g");
  axes.innerHTML =
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.45">' +
    '<path d="M40 190H440M230 30V372"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5">' +
    texte(426, 206, "Re") + texte(236, 44, "Im") + "</g>";
  svg.append(defs, axes);
}

/* --------------------------------------------------------------------------
   E. Animation : construction des angles des deux wattmètres
   -------------------------------------------------------------------------- */

function construireConstruction(racine, api) {
  const conteneur = racine.querySelector("#e-construction");
  if (!conteneur) return;

  const ETAPES = [
    "1. Tensions simples V1, V2, V3",
    "2. Courants I1, I2, I3 en retard de φ",
    "3. U13 = V1 - V3, à -30°",
    "4. Angle vu par W1 : φ - 30°",
    "5. U23 = V2 - V3, à -90°",
    "6. Angle vu par W2 : φ + 30°",
    "7. Projections des courants : W1 et W2",
    "Construction terminée",
  ];
  const etat = { s: 7, phi: 45 };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 380",
    role: "img",
    "aria-label": "Construction pas à pas du diagramme de Fresnel de la méthode des deux wattmètres : tensions simples, courants en retard de phi, tensions composées U13 et U23, angles phi moins 30 et phi plus 30, projections des courants",
  });
  fondFresnel(svg, "fl-e-c");
  const tensionsV = [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 1.6, fill: "none", "marker-end": "url(#fl-e-c)" }));
  const courants = [0, 1].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-c)" }));
  const courant3 = svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", "stroke-dasharray": "2 4", "marker-end": "url(#fl-e-c)" });
  const composees = [0, 1].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 2.6, fill: "none", "stroke-dasharray": "9 5", "marker-end": "url(#fl-e-c)" }));
  const arcs = svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none" });
  const projections = svgEl("path", { stroke: "currentColor", "stroke-width": 6, fill: "none", "stroke-linecap": "round", opacity: 0.55 });
  const pieds = svgEl("path", { stroke: "currentColor", "stroke-width": 1.2, fill: "none", "stroke-dasharray": "3 4" });
  const renvois = svgEl("path", { stroke: "currentColor", "stroke-width": 0.9, fill: "none", opacity: 0.7 });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  svg.append(...tensionsV, courant3, ...composees, arcs, renvois, pieds, projections, ...courants, libelles);
  conteneur.appendChild(svg);

  function frac(k) {
    return Math.max(0, Math.min(1, etat.s - k));
  }

  function dessiner() {
    const g = geometrieFresnel(etat.phi);
    const o = g.o;
    g.v.forEach((p, k) => tensionsV[k].setAttribute("d", partiel(o.x, o.y, p.x, p.y, frac(0))));
    courants[0].setAttribute("d", partiel(o.x, o.y, g.i[0].x, g.i[0].y, frac(1)));
    courants[1].setAttribute("d", partiel(o.x, o.y, g.i[1].x, g.i[1].y, frac(1)));
    courant3.setAttribute("d", partiel(o.x, o.y, g.i[2].x, g.i[2].y, frac(1)));
    composees[0].setAttribute("d", partiel(o.x, o.y, g.u13.x, g.u13.y, frac(2)));
    composees[1].setAttribute("d", partiel(o.x, o.y, g.u23.x, g.u23.y, frac(4)));

    let d = arc(o, 46, 0, -etat.phi, frac(1));
    d += arc(o, 70, -30, -etat.phi, frac(3));
    d += arc(o, 58, -90, -120 - etat.phi, frac(5));
    arcs.setAttribute("d", d);

    const f7 = frac(6);
    let dp = "";
    let dpied = "";
    if (f7 > 0) {
      dp += partiel(o.x, o.y, g.pr1.x, g.pr1.y, f7, 0.1) + partiel(o.x, o.y, g.pr2.x, g.pr2.y, f7, 0.1);
      if (f7 >= 1) {
        dpied += "M" + g.i[0].x.toFixed(1) + " " + g.i[0].y.toFixed(1) + "L" + g.pr1.x.toFixed(1) + " " + g.pr1.y.toFixed(1);
        dpied += "M" + g.i[1].x.toFixed(1) + " " + g.i[1].y.toFixed(1) + "L" + g.pr2.x.toFixed(1) + " " + g.pr2.y.toFixed(1);
      }
    }
    projections.setAttribute("d", dp);
    pieds.setAttribute("d", dpied);

    let t = "";
    const etiquette = (p, nom, dx, dy) => texte(p.x + dx, p.y + dy, nom);
    if (frac(0) >= 1) {
      t += etiquette(g.v[0], "V1", 6, -6) + etiquette(g.v[1], "V2", -26, 16) + etiquette(g.v[2], "V3", -26, -6);
    }
    if (frac(1) >= 1) {
      const p1 = polairePx(o, FR.ki + 16, g.angles[0] + 10);
      const p2 = polairePx(o, FR.ki + 16, g.angles[1]);
      const p3 = polairePx(o, FR.ki + 16, g.angles[2]);
      t += texte(p1.x - 8, p1.y + 5, "I1") + texte(p2.x - 8, p2.y + 5, "I2") + texte(p3.x - 8, p3.y + 5, "I3");
      const m = polairePx(o, 54, -etat.phi / 2);
      t += texte(m.x + 2, m.y + 4, "φ", ' font-size="11.5"');
    }
    if (frac(2) >= 1) t += texte(g.u13.x + 6, g.u13.y + 14, "U13");
    let dLeader = "";
    if (frac(3) >= 1) {
      const m = polairePx(o, 70, (-30 - etat.phi) / 2);
      dLeader += "M" + m.x.toFixed(1) + " " + m.y.toFixed(1) + "L300 336";
      t += texte(292, 352, "φ - 30°", ' font-size="11.5"');
    }
    if (frac(4) >= 1) t += texte(g.u23.x + 8, g.u23.y - 4, "U23");
    if (frac(5) >= 1) {
      const m = polairePx(o, 58, (-90 - 120 - etat.phi) / 2);
      dLeader += "M" + m.x.toFixed(1) + " " + m.y.toFixed(1) + "L104 316";
      t += texte(56, 332, "φ + 30°", ' font-size="11.5"');
    }
    renvois.setAttribute("d", dLeader);
    const idx = Math.min(ETAPES.length - 1, Math.floor(etat.s + 1e-6));
    t += texte(470, 40, ETAPES[idx], ' font-weight="600"');
    t += texte(470, 80, "φ = " + nombre(api, etat.phi, 0) + "°, ordre direct");
    if (frac(3) >= 1) t += texte(470, 106, "W1 / (U I) = cos(φ - 30°) = " + nombre(api, g.c1, 3));
    if (frac(5) >= 1) t += texte(470, 132, "W2 / (U I) = cos(φ + 30°) = " + nombre(api, g.c2, 3));
    if (f7 >= 1) {
      t += texte(470, 170, "somme = √3 cos φ = " + nombre(api, g.c1 + g.c2, 3));
      t += texte(470, 196, "différence = sin φ = " + nombre(api, g.c1 - g.c2, 3));
      if (g.c2 < -1e-9) t += texte(470, 230, "projection de I2 opposée à U23 :");
      if (g.c2 < -1e-9) t += texte(470, 248, "lecture W2 négative");
      if (g.c1 < -1e-9) t += texte(470, 230, "projection de I1 opposée à U13 :");
      if (g.c1 < -1e-9) t += texte(470, 248, "lecture W1 négative");
    }
    libelles.innerHTML = t;
  }

  const curseurs = api.sim.curseurs(
    "#e-construction-curseurs",
    [{ id: "phi", libelle: "Déphasage φ de la charge", min: -90, max: 90, pas: 1, valeur: 45, unite: "°" }],
    (lues) => {
      etat.phi = lues.phi;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-construction-lecteur", {
    de: 0,
    a: 7,
    duree: 14,
    boucle: true,
    auto: false,
    libelle: "Construire le diagramme étape par étape",
    rappel(valeur) {
      etat.s = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    /* La figure s'affiche complète tant que l'apprenant n'a pas lancé la construction. */
    lecteur.suivre(7);
    etat.s = 7;
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : les deux lectures en fonction du déphasage
   -------------------------------------------------------------------------- */

function construireAronSim(racine, api) {
  const conteneur = racine.querySelector("#e-aron-sim");
  if (!conteneur) return;

  const etat = { phi: 31.79, u: 400, i: 28 };
  const BARRES = { x: [560, 660], y0: 190, h: 118 };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 380",
    role: "img",
    "aria-label": "Diagramme de Fresnel manipulable de la méthode des deux wattmètres : poignée au bout du courant I1 réglant le déphasage, tensions composées U13 et U23, projections des courants et barres des deux lectures",
  });
  fondFresnel(svg, "fl-e-s");
  const tensionsV = [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", opacity: 0.8, "marker-end": "url(#fl-e-s)" }));
  const composees = [0, 1].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 2.6, fill: "none", "stroke-dasharray": "9 5", "marker-end": "url(#fl-e-s)" }));
  const courants = [0, 1].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-s)" }));
  const projections = svgEl("path", { stroke: "currentColor", "stroke-width": 6, fill: "none", "stroke-linecap": "round", opacity: 0.55 });
  const pieds = svgEl("path", { stroke: "currentColor", "stroke-width": 1.2, fill: "none", "stroke-dasharray": "3 4" });
  const barres = [0, 1].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "currentColor", "fill-opacity": 0.22 }));
  const cadre = svgEl("g");
  cadre.innerHTML =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.6">' +
    '<path d="M520 190H700"/><path d="M610 40V340" stroke-dasharray="2 4"/></g>';
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(cadre, ...tensionsV, ...composees, pieds, projections, ...courants, ...barres, libelles);
  conteneur.appendChild(svg);

  const trace = api.sim.traceur("#e-aron-sim-trace", {
    titre: "Lectures des deux wattmètres en fonction du déphasage",
    genre: "Simulation",
    xTitre: "φ",
    xUnite: "°",
    yTitre: "lecture",
    yUnite: "kW",
    xMin: -90,
    xMax: 90,
    ratio: 0.38,
    echantillons: 360,
    series: [
      { id: "w1", nom: "W1", couleur: "serie-1", epaisseur: 2.6 },
      { id: "w2", nom: "W2", couleur: "serie-5", epaisseur: 2.6 },
      { id: "p", nom: "W1 + W2 = P", couleur: "serie-3", epaisseur: 3.2 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
      ligneV(c, repere, couleurs, etat.phi, "φ = " + nombre(api, etat.phi, 1) + "°");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-aron-sim-valeurs", [
    { id: "phi", libelle: "Déphasage φ", unite: "°", decimales: 2 },
    { id: "cos", libelle: "cos φ", decimales: 3 },
    { id: "w1", libelle: "W1 = U I cos(φ - 30°)", unite: "kW", decimales: 2 },
    { id: "w2", libelle: "W2 = U I cos(φ + 30°)", unite: "kW", decimales: 2 },
    { id: "p", libelle: "P = W1 + W2", unite: "kW", decimales: 2 },
    { id: "q", libelle: "Q = √3 (W1 - W2)", unite: "kvar", decimales: 2 },
    { id: "rapport", libelle: "Rapport W1 / W2", format: (v) => (Number.isFinite(v) ? nombre(api, v, 2) : "indéfini, W2 nul") },
  ]);
  if (valeurs) ressources.push(valeurs);

  function majCourbes() {
    if (!trace) return;
    const ui = (etat.u * etat.i) / 1000;
    trace.definirFonction("w1", (p) => ui * Math.cos((p - 30) * DEG));
    trace.definirFonction("w2", (p) => ui * Math.cos((p + 30) * DEG));
    trace.definirFonction("p", (p) => RAC3 * ui * Math.cos(p * DEG));
    const borne = Math.ceil(RAC3 * ui * 1.08);
    trace.definirPlage({ yMin: -Math.ceil(ui * 1.05), yMax: borne });
  }

  function dessiner() {
    const g = geometrieFresnel(etat.phi);
    const o = g.o;
    g.v.forEach((p, k) => tensionsV[k].setAttribute("d", segment(o.x, o.y, p.x, p.y)));
    composees[0].setAttribute("d", segment(o.x, o.y, g.u13.x, g.u13.y));
    composees[1].setAttribute("d", segment(o.x, o.y, g.u23.x, g.u23.y));
    courants[0].setAttribute("d", segment(o.x, o.y, g.i[0].x, g.i[0].y, 10));
    courants[1].setAttribute("d", segment(o.x, o.y, g.i[1].x, g.i[1].y));
    projections.setAttribute("d", partiel(o.x, o.y, g.pr1.x, g.pr1.y, 1, 0.1) + partiel(o.x, o.y, g.pr2.x, g.pr2.y, 1, 0.1));
    pieds.setAttribute(
      "d",
      "M" + g.i[0].x.toFixed(1) + " " + g.i[0].y.toFixed(1) + "L" + g.pr1.x.toFixed(1) + " " + g.pr1.y.toFixed(1) +
        "M" + g.i[1].x.toFixed(1) + " " + g.i[1].y.toFixed(1) + "L" + g.pr2.x.toFixed(1) + " " + g.pr2.y.toFixed(1)
    );

    const ui = etat.u * etat.i;
    const w1 = ui * g.c1;
    const w2 = ui * g.c2;
    [g.c1, g.c2].forEach((c, k) => {
      const x = BARRES.x[k];
      const h = c * BARRES.h;
      barres[k].setAttribute(
        "d",
        Math.abs(h) < 0.6
          ? "M" + (x - 22) + " " + BARRES.y0 + "H" + (x + 22)
          : "M" + (x - 22) + " " + BARRES.y0 + "H" + (x + 22) + "V" + (BARRES.y0 - h).toFixed(1) + "H" + (x - 22) + "Z"
      );
    });

    const p1 = polairePx(o, FR.ki + 18, g.angles[0] + 10);
    const p2 = polairePx(o, FR.ki + 18, g.angles[1]);
    let t =
      texte(g.v[0].x + 6, g.v[0].y - 6, "V1") + texte(g.v[1].x - 26, g.v[1].y + 16, "V2") + texte(g.v[2].x - 26, g.v[2].y - 6, "V3") +
      texte(g.u13.x + 6, g.u13.y + 14, "U13") + texte(g.u23.x + 8, g.u23.y - 4, "U23") +
      texte(p1.x - 8, p1.y + 5, "I1") + texte(p2.x - 8, p2.y + 5, "I2") +
      texte(BARRES.x[0], 362, "W1", ' text-anchor="middle"') + texte(BARRES.x[1], 362, "W2", ' text-anchor="middle"') +
      texte(BARRES.x[0], g.c1 >= 0 ? BARRES.y0 - g.c1 * BARRES.h - 8 : BARRES.y0 - g.c1 * BARRES.h + 16, nombre(api, w1 / 1000, 2), ' text-anchor="middle"') +
      texte(BARRES.x[1], g.c2 >= 0 ? BARRES.y0 - g.c2 * BARRES.h - 8 : BARRES.y0 - g.c2 * BARRES.h + 16, nombre(api, w2 / 1000, 2), ' text-anchor="middle"') +
      texte(524, 30, "lectures en kW") +
      texte(40, 30, etat.phi >= 0 ? "charge inductive, courants en retard" : "charge capacitive, courants en avance");
    libelles.innerHTML = t;

    if (valeurs) {
      valeurs.maj({
        phi: etat.phi,
        cos: Math.cos(etat.phi * DEG),
        w1: w1 / 1000,
        w2: w2 / 1000,
        p: (w1 + w2) / 1000,
        q: (RAC3 * (w1 - w2)) / 1000,
        rapport: Math.abs(w2) < 1e-6 * ui ? NaN : w1 / w2,
      });
    }
    if (trace) trace.demanderRendu();
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: FR.o,
    rayon: FR.ki,
    valeur: -etat.phi,
    min: -90,
    max: 90,
    boucle: false,
    pas: 1,
    libelle: "Angle du courant I1, opposé du déphasage φ",
    format: (mesure) => "courant I1 à " + nombre(api, mesure.valeur, 0) + " degrés, φ = " + nombre(api, -mesure.valeur, 0) + " degrés",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.phi = -mesure.valeur;
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-aron-sim-curseurs",
    [
      { id: "u", libelle: "Tension composée U", min: 100, max: 690, pas: 1, valeur: 400, unite: "V" },
      { id: "i", libelle: "Courant de ligne I", min: 1, max: 60, pas: 0.5, valeur: 28, unite: "A" },
    ],
    (lues) => {
      etat.u = lues.u;
      etat.i = lues.i;
      majCourbes();
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  majCourbes();
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : validité des méthodes sur une charge déséquilibrée
   -------------------------------------------------------------------------- */

/** Courants et lectures de trois charges monophasées en étoile, neutre relié ou non. */
function calculerDesequilibre(etat) {
  const V = [cx.polaire(230, 0), cx.polaire(230, -120), cx.polaire(230, 120)];
  const tanPhi = Math.tan(Math.acos(etat.cos));
  const Y = etat.p.map((pk) => ({ re: (pk * 1000) / (230 * 230), im: (-pk * 1000 * tanPhi) / (230 * 230) }));
  let vn = { re: 0, im: 0 };
  if (!etat.neutre) {
    const somme = Y.reduce((acc, y) => cx.plus(acc, y), { re: 0, im: 0 });
    if (cx.module(somme) > 1e-12) {
      const num = Y.reduce((acc, y, k) => cx.plus(acc, cx.fois(y, V[k])), { re: 0, im: 0 });
      vn = cx.div(num, somme);
    }
  }
  const I = Y.map((y, k) => cx.fois(y, cx.moins(V[k], vn)));
  const iN = I.reduce((acc, i) => cx.plus(acc, i), { re: 0, im: 0 });
  const pVrai = I.reduce((acc, i, k) => acc + cx.fois(cx.moins(V[k], vn), cx.conj(i)).re, 0);
  const p3 = I.reduce((acc, i, k) => acc + cx.fois(V[k], cx.conj(i)).re, 0);
  const r = etat.ref - 1;
  let p2 = 0;
  for (let k = 0; k < 3; k += 1) {
    if (k !== r) p2 += cx.fois(cx.moins(V[k], V[r]), cx.conj(I[k])).re;
  }
  return { I, iN, vn, pVrai, p3, p2 };
}

function construireValidite(racine, api) {
  const conteneur = racine.querySelector("#e-validite");
  if (!conteneur) return;

  const etat = { p: [6, 0, 0], cos: 0.95, neutre: true, ref: 3 };
  const X0 = 220;
  const LIGNES = [70, 140, 210];

  const svg = svgEl("svg", {
    viewBox: "0 0 760 300",
    role: "img",
    "aria-label": "Barres comparant la puissance réellement reçue par trois charges monophasées, la somme des trois wattmètres et la somme des deux wattmètres, avec le courant du neutre",
  });
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.7"><path d="M' + X0 + ' 30V250"/></g>';
  const barres = LIGNES.map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "currentColor", "fill-opacity": 0.22 }));
  const repere = svgEl("path", { stroke: "currentColor", "stroke-width": 1.3, fill: "none", "stroke-dasharray": "6 5" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  svg.append(fond, ...barres, repere, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-validite-valeurs", [
    { id: "vrai", libelle: "Puissance reçue par les charges", unite: "kW", decimales: 3 },
    { id: "p3", libelle: "Somme des trois wattmètres", unite: "kW", decimales: 3 },
    { id: "p2", libelle: "Somme des deux wattmètres", unite: "kW", decimales: 3 },
    { id: "ecart", libelle: "Écart des deux wattmètres", unite: "kW", decimales: 3 },
    { id: "in", libelle: "Courant du neutre IN", unite: "A", decimales: 2 },
    { id: "vn", libelle: "Tension du point commun par rapport au neutre", unite: "V", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const r = calculerDesequilibre(etat);
    const liste = [r.pVrai, r.p3, r.p2].map((w) => w / 1000);
    const maximum = Math.max(1, ...liste.map((w) => Math.abs(w)));
    const k = 300 / maximum;
    const noms = [
      "puissance reçue par les charges",
      "somme des trois wattmètres, tensions vers N",
      "somme des deux wattmètres, référence L" + etat.ref,
    ];
    let t = "";
    liste.forEach((w, n) => {
      const y = LIGNES[n];
      const largeur = Math.max(-200, w * k);
      barres[n].setAttribute(
        "d",
        Math.abs(largeur) < 0.6
          ? "M" + X0 + " " + (y - 14) + "V" + (y + 14)
          : "M" + X0 + " " + (y - 14) + "H" + (X0 + largeur).toFixed(1) + "V" + (y + 14) + "H" + X0 + "Z"
      );
      t += texte(X0, y - 22, noms[n]);
      let valeur = nombre(api, w, 2) + " kW";
      if (n === 2) {
        const ecart = w - liste[0];
        valeur += Math.abs(ecart) < 0.005 ? ", exacte" : ", écart " + (ecart > 0 ? "+" : "") + nombre(api, ecart, 2) + " kW";
      }
      t += texte(Math.max(X0, X0 + largeur) + 10, y + 5, valeur);
    });
    const xVrai = X0 + liste[0] * k;
    repere.setAttribute("d", "M" + xVrai.toFixed(1) + " 40V240");
    t += texte(20, 74, "réel", ' font-weight="600"');
    t += texte(20, 144, "3 W", ' font-weight="600"');
    t += texte(20, 214, "2 W", ' font-weight="600"');
    t += texte(
      20,
      280,
      etat.neutre
        ? "neutre relié : IN = " + nombre(api, cx.module(r.iN), 2) + " A"
        : "neutre non relié : IN = 0, point commun à " + nombre(api, cx.module(r.vn), 1) + " V du neutre"
    );
    libelles.innerHTML = t;

    if (valeurs) {
      valeurs.maj({
        vrai: liste[0],
        p3: liste[1],
        p2: liste[2],
        ecart: liste[2] - liste[0],
        in: cx.module(r.iN),
        vn: cx.module(r.vn),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-validite-curseurs",
    [
      { id: "p1", libelle: "Charge de la phase 1", min: 0, max: 10, pas: 0.1, valeur: 6, unite: "kW", chiffres: 1 },
      { id: "p2", libelle: "Charge de la phase 2", min: 0, max: 10, pas: 0.1, valeur: 0, unite: "kW", chiffres: 1 },
      { id: "p3", libelle: "Charge de la phase 3", min: 0, max: 10, pas: 0.1, valeur: 0, unite: "kW", chiffres: 1 },
      { id: "cos", libelle: "Facteur de puissance commun, inductif", min: 0.5, max: 1, pas: 0.01, valeur: 0.95, chiffres: 2 },
      { id: "neutre", libelle: "Point commun des charges", min: 0, max: 1, pas: 1, valeur: 1, format: (v) => (v > 0.5 ? "relié au neutre" : "non relié") },
      { id: "ref", libelle: "Référence des deux wattmètres", min: 1, max: 3, pas: 1, valeur: 3, format: (v) => "L" + Math.round(v) },
    ],
    (lues) => {
      etat.p = [lues.p1, lues.p2, lues.p3];
      etat.cos = lues.cos;
      etat.neutre = lues.neutre > 0.5;
      etat.ref = Math.round(lues.ref);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   H. Animation : triangle des puissances à partir des deux lectures
   -------------------------------------------------------------------------- */

function construireTriangle(racine, api) {
  const conteneur = racine.querySelector("#h-triangle");
  if (!conteneur) return;

  const O = { x: 110, y: 300 };
  const K = 26;
  const ETAPES = ["1. Lecture W1", "2. Lecture W2 au bout de W1", "3. P = W1 + W2", "4. Q = √3 (W1 - W2)", "5. S et φ", "Construction terminée"];
  const etat = { s: 5, charge: 100 };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 370",
    role: "img",
    "aria-label": "Construction du triangle des puissances du moteur à partir des deux lectures de wattmètres : W1 et W2 mis bout à bout donnent P, leur différence multipliée par racine de trois donne Q, puis S et l'angle phi",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-h-t");
  const axes = svgEl("g");
  axes.innerHTML =
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.45"><path d="M40 ' + O.y + 'H720M' + O.x + ' 20V360"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5">' +
    texte(690, O.y + 16, "P, kW") + texte(O.x + 6, 30, "Q, kvar") + "</g>";
  const w1 = svgEl("path", { stroke: "currentColor", "stroke-width": 5, fill: "none", "stroke-linecap": "round" });
  const w2 = svgEl("path", { stroke: "currentColor", "stroke-width": 5, fill: "none", "stroke-dasharray": "8 5" });
  const liens = svgEl("path", { stroke: "currentColor", "stroke-width": 1.2, fill: "none", "stroke-dasharray": "2 4" });
  const base = svgEl("path", { stroke: "currentColor", "stroke-width": 2.6, fill: "none", "marker-end": "url(#fl-h-t)" });
  const q = svgEl("path", { stroke: "currentColor", "stroke-width": 2.6, fill: "none", "marker-end": "url(#fl-h-t)" });
  const s = svgEl("path", { stroke: "currentColor", "stroke-width": 1.6, fill: "none", "marker-end": "url(#fl-h-t)" });
  const angle = svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  svg.append(defs, axes, liens, w1, w2, base, q, s, angle, libelles);
  conteneur.appendChild(svg);

  function point() {
    const k = etat.charge / 100;
    const p = EX.p0 + k * (EX.pn - EX.p0);
    const i = EX.i0 + k * (EX.inom - EX.i0);
    const phi = Math.acos(Math.min(1, p / (RAC3 * EX.u * i))) / DEG;
    const ui = EX.u * i;
    const l1 = ui * Math.cos((phi - 30) * DEG);
    const l2 = ui * Math.cos((phi + 30) * DEG);
    return { p, i, phi, l1, l2, q: RAC3 * (l1 - l2), s: RAC3 * ui };
  }

  const valeurs = api.sim.valeurs("#h-triangle-valeurs", [
    { id: "w1", libelle: "W1", unite: "kW", decimales: 2 },
    { id: "w2", libelle: "W2", unite: "kW", decimales: 2 },
    { id: "p", libelle: "P = W1 + W2", unite: "kW", decimales: 2 },
    { id: "q", libelle: "Q = √3 (W1 - W2)", unite: "kvar", decimales: 2 },
    { id: "s", libelle: "S", unite: "kVA", decimales: 2 },
    { id: "i", libelle: "Courant de ligne I", unite: "A", decimales: 2 },
    { id: "cos", libelle: "cos φ", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const f = (k) => Math.max(0, Math.min(1, etat.s - k));

  function dessiner() {
    const m = point();
    const yc1 = O.y + 30;
    const yc2 = O.y + 46;
    const x1 = O.x + (m.l1 / 1000) * K;
    const xP = O.x + (m.p / 1000) * K;
    const yQ = O.y - (m.q / 1000) * K;

    w1.setAttribute("d", partiel(O.x, yc1, x1, yc1, f(0), 0.1));
    w2.setAttribute("d", partiel(x1, yc2, xP, yc2, f(1), 0.1));
    let dl = "";
    if (f(1) > 0) dl += "M" + x1.toFixed(1) + " " + yc1 + "V" + yc2;
    if (f(2) > 0) dl += "M" + xP.toFixed(1) + " " + yc2 + "V" + O.y;
    liens.setAttribute("d", dl);
    base.setAttribute("d", partiel(O.x, O.y, xP, O.y, f(2)));
    q.setAttribute("d", partiel(xP, O.y, xP, yQ, f(3)));
    s.setAttribute("d", partiel(O.x, O.y, xP, yQ, f(4)));
    angle.setAttribute("d", arc(O, 64, 0, m.phi, f(4)));

    let t = texte(190, 24, ETAPES[Math.min(ETAPES.length - 1, Math.floor(etat.s + 1e-6))], ' font-weight="600"');
    t += texte(190, 44, "point de fonctionnement : " + nombre(api, etat.charge, 0) + " %");
    if (f(0) >= 1) t += texte(Math.min(x1, O.x) - 4, yc1 - 6, "W1 = " + nombre(api, m.l1 / 1000, 2) + " kW", ' text-anchor="end"');
    if (f(1) >= 1) t += texte(Math.max(x1, xP) + 8, yc2 + 5, "W2 = " + nombre(api, m.l2 / 1000, 2) + " kW" + (m.l2 < 0 ? ", vers la gauche" : ""));
    if (f(2) >= 1) t += texte(xP + 8, O.y - 8, "P = " + nombre(api, m.p / 1000, 2) + " kW");
    if (f(3) >= 1) t += texte(xP + 10, (O.y + yQ) / 2, "Q = " + nombre(api, m.q / 1000, 2) + " kvar");
    if (f(4) >= 1) {
      t += texte((O.x + xP) / 2 - 90, (O.y + yQ) / 2 - 10, "S = " + nombre(api, m.s / 1000, 2) + " kVA");
      const a = polairePx(O, 80, m.phi / 2);
      t += texte(a.x + 4, a.y + 4, "φ = " + nombre(api, m.phi, 1) + "°", ' font-size="11.5"');
    }
    libelles.innerHTML = t;

    if (valeurs) {
      valeurs.maj({
        w1: m.l1 / 1000,
        w2: m.l2 / 1000,
        p: m.p / 1000,
        q: m.q / 1000,
        s: m.s / 1000,
        i: m.i,
        cos: Math.cos(m.phi * DEG),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#h-triangle-curseurs",
    [{ id: "charge", libelle: "Point de fonctionnement, du vide (0 %) au nominal (100 %)", min: 0, max: 100, pas: 1, valeur: 100, unite: "%" }],
    (lues) => {
      etat.charge = lues.charge;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#h-triangle-lecteur", {
    de: 0,
    a: 5,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Construire le triangle des puissances",
    rappel(valeur) {
      etat.s = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    /* La figure s'affiche complète tant que l'apprenant n'a pas lancé la construction. */
    lecteur.suivre(5);
    etat.s = 5;
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-puissance",
      titre: "Puissance active d'un moteur",
      niveau: "fondamental",
      enonce:
        "<p>Un moteur triphasé équilibré appelle $18\\ \\mathrm{A}$ par ligne sur un réseau $230/400\\ \\mathrm{V}$, avec " +
        "$\\cos\\varphi = 0{,}82$. Quelle puissance active absorbe-t-il, en kilowatts ?</p>",
      valeur: (RAC3 * 400 * 18 * 0.82) / 1000,
      unite: "kW",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Puissance active $P$",
      etapes: [
        { texte: "Données : $U = 400\\ \\mathrm{V}$, $I = 18\\ \\mathrm{A}$, $\\cos\\varphi = 0{,}82$, charge équilibrée. Méthode : $P = \\sqrt{3}\\,UI\\cos\\varphi$, quel que soit le couplage." },
        { texte: "$\\sqrt{3}\\,UI = 1{,}7321 \\times 400 \\times 18 = 12\\,471\\ \\mathrm{VA}$, soit $S = 12{,}47\\ \\mathrm{kVA}$." },
        {
          texte: "$P = 12{,}471 \\times 0{,}82 = 10{,}23\\ \\mathrm{kW}$ ; $Q = S\\sin\\varphi = 12{,}471 \\times 0{,}5724 = 7{,}14\\ \\mathrm{kvar}$.",
          note: "Contrôle : $12{,}47\\ \\mathrm{kVA} \\times 1{,}443 = 18{,}0\\ \\mathrm{A}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Triangle des puissances du moteur",
          xTitre: "P",
          xUnite: "kW",
          yTitre: "Q",
          yUnite: "kvar",
          xMin: 0,
          xMax: 13,
          yMin: 0,
          yMax: 9,
          series: [{ id: "s", nom: "S = 12,47 kVA, d'angle φ = 34,92°", couleur: "serie-1", epaisseur: 2.6, fonction: (p) => (p <= 10.226 ? p * 0.698 : NaN) }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 10.226, 7.138, "P = 10,23 kW, Q = 7,14 kvar", true);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-un-wattmetre",
      titre: "Un seul wattmètre sur un four équilibré",
      niveau: "fondamental",
      enonce:
        "<p>Un four triphasé à résistances, couplé en étoile avec neutre, est réputé équilibré. Un wattmètre, circuit courant " +
        "dans $L_1$ et circuit tension entre $L_1$ et le neutre, lit $3{,}45\\ \\mathrm{kW}$. Quelle est la puissance totale du four ?</p>",
      valeur: 3 * 3.45,
      unite: "kW",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Puissance totale $P$",
      etapes: [
        { texte: "Le wattmètre mesure la moyenne de $v_1 i_1$ : la puissance de la phase 1 seule." },
        { texte: "Charge équilibrée : les trois phases reçoivent la même puissance." },
        {
          texte: "$P = 3 \\times 3{,}45 = 10{,}35\\ \\mathrm{kW}$.",
          note: "Ce raccourci suppose l'équilibre. Une résistance coupée sur une autre phase ne changerait pas la lecture, mais la puissance réelle tomberait à $6{,}90\\ \\mathrm{kW}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Trois courants identiques, en phase avec leurs tensions",
          unite: "A",
          vecteurs: [
            { id: "i1", nom: "I1, mesuré", amplitude: 15, phase: 0, couleur: "serie-1" },
            { id: "i2", nom: "I2, identique et décalé", amplitude: 15, phase: -120, couleur: "serie-3", pointille: true },
            { id: "i3", nom: "I3, identique et décalé", amplitude: 15, phase: 120, couleur: "serie-4", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-cosphi",
      titre: "Facteur de puissance tiré de deux lectures",
      niveau: "intermédiaire",
      enonce:
        "<p>Sur un moteur alimenté sous $400\\ \\mathrm{V}$ entre phases, sans neutre, la méthode des deux wattmètres donne " +
        "$W_1 = 8{,}6\\ \\mathrm{kW}$ et $W_2 = 3{,}2\\ \\mathrm{kW}$, en ordre direct. Quel est son facteur de puissance ?</p>",
      valeur: Math.cos(Math.atan((RAC3 * 5.4) / 11.8)),
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Facteur de puissance $\\cos\\varphi$",
      etapes: [
        { texte: "Stratégie : $P = W_1 + W_2$, puis $Q = \\sqrt{3}(W_1 - W_2)$, valable car un moteur sain est une charge équilibrée." },
        { texte: "$P = 8{,}6 + 3{,}2 = 11{,}8\\ \\mathrm{kW}$ ; $Q = 1{,}7321 \\times 5{,}4 = 9{,}353\\ \\mathrm{kvar}$." },
        { texte: "$\\tan\\varphi = 9{,}353/11{,}8 = 0{,}7926$, donc $\\varphi = 38{,}40^\\circ$ et $\\cos\\varphi = 0{,}784$." },
        {
          texte: "$S = \\sqrt{11{,}8^2 + 9{,}353^2} = 15{,}06\\ \\mathrm{kVA}$ et $I = S/(\\sqrt{3}\\,U) = 21{,}73\\ \\mathrm{A}$.",
          note: "Contrôle : $UI\\cos(\\varphi - 30^\\circ) = 400 \\times 21{,}73 \\times \\cos 8{,}40^\\circ = 8{,}60\\ \\mathrm{kW}$, la lecture de $W_1$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        courbesLectures(moteur, conteneur, 400 * 21.733, "Les deux lectures se placent à φ = 38,40°", [
          { x: 38.4, y: 8.6, libelle: "W1 = 8,6 kW", gauche: false },
          { x: 38.4, y: 3.2, libelle: "W2 = 3,2 kW", gauche: false },
        ]);
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-methode",
      titre: "Choisir la méthode de mesure",
      niveau: "intermédiaire",
      enonce: "<p>Parmi ces mesures de puissance active, lesquelles sont exactes, aux erreurs d'appareil près ?</p>",
      multiple: true,
      options: [
        { texte: "Deux wattmètres sur un moteur sans neutre dont un enroulement présente un défaut, ce qui déséquilibre ses courants.", juste: true },
        { texte: "Deux wattmètres à l'arrivée d'un tableau à quatre fils qui alimente de nombreuses prises monophasées." },
        { texte: "Un wattmètre multiplié par trois sur un four en étoile dont une résistance est coupée." },
        { texte: "Trois wattmètres, circuits tension vers le neutre, sur un tableau dont le neutre est chargé.", juste: true },
        { texte: "La puissance réactive $\\sqrt{3}(W_1 - W_2)$ sur le départ d'un variateur à pont de diodes." },
      ],
      etapes: [
        { texte: "Sans neutre, $i_1 + i_2 + i_3 = 0$ quel que soit le déséquilibre : deux wattmètres donnent $P$ exactement." },
        { texte: "Avec des prises monophasées, le neutre porte un courant : la méthode à deux wattmètres commet l'erreur $-\\mathrm{Re}(\\underline{V}_r\\underline{I}_N^*)$." },
        { texte: "Un four dont une résistance est coupée n'est plus équilibré : multiplier une lecture par trois est faux." },
        { texte: "Trois wattmètres vers le neutre mesurent chacun $v_k i_k$ : la somme est toujours exacte sur quatre fils." },
        {
          texte: "Les courants d'un pont de diodes sont déformés : la somme $W_1 + W_2$ reste exacte, mais la formule de $Q$, établie en sinusoïdal équilibré, ne l'est plus.",
          note: "Méthode : vérifier l'hypothèse $i_1 + i_2 + i_3 = 0$, puis l'équilibre, puis la forme d'onde.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Quatre fils, phases inégalement chargées : la somme des courants de ligne n'est pas nulle",
          unite: "A",
          somme: true,
          nomSomme: "I1 + I2 + I3 = IN, non nul",
          vecteurs: [
            { id: "i1", nom: "I1, 27,4 A", amplitude: 27.4, phase: -18.2, couleur: "serie-1" },
            { id: "i2", nom: "I2, 10 A", amplitude: 10, phase: -138.2, couleur: "serie-3" },
            { id: "i3", nom: "I3, 10 A", amplitude: 10, phase: 101.8, couleur: "serie-4" },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-compensation",
      titre: "Dimensionner une compensation à partir de deux lectures",
      niveau: "avancé",
      enonce:
        "<p>Un groupe de moteurs équilibré, alimenté sous $400\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$, sans neutre, donne " +
        "$W_1 = 9{,}8\\ \\mathrm{kW}$ et $W_2 = 2{,}6\\ \\mathrm{kW}$. On veut relever le facteur de puissance à $0{,}95$ par une " +
        "batterie de condensateurs couplée en triangle. Quelle capacité faut-il par branche, en microfarads ?</p>",
      valeur: ((12.4 * ((RAC3 * 7.2) / 12.4 - Math.tan(Math.acos(0.95)))) * 1000) / (3 * 400 * 400 * W50) * 1e6,
      unite: "µF",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Capacité par branche $C_\\Delta$",
      etapes: [
        { texte: "$P = 9{,}8 + 2{,}6 = 12{,}4\\ \\mathrm{kW}$ ; $Q = \\sqrt{3}(9{,}8 - 2{,}6) = 12{,}47\\ \\mathrm{kvar}$ ; $\\tan\\varphi = 1{,}0057$, soit $\\cos\\varphi = 0{,}705$." },
        { texte: "Cible : $\\cos\\varphi' = 0{,}95$, $\\tan\\varphi' = 0{,}3287$. À puissance active constante, $Q_c = P(\\tan\\varphi - \\tan\\varphi') = 12{,}4 \\times 0{,}6770 = 8{,}395\\ \\mathrm{kvar}$." },
        { texte: "En triangle, chaque branche fournit $Q_c/3 = 2{,}798\\ \\mathrm{kvar}$ sous $U = 400\\ \\mathrm{V}$ : $C_\\Delta = \\dfrac{Q_c}{3U^2\\omega} = \\dfrac{8395}{3 \\times 400^2 \\times 314{,}16}$." },
        {
          texte: "$C_\\Delta = 55{,}7\\ \\mu\\mathrm{F}$ par branche, soit $167\\ \\mu\\mathrm{F}$ en étoile équivalente.",
          note: "Le courant de ligne passe de $25{,}38$ à $18{,}84\\ \\mathrm{A}$ ; les nouvelles lectures seraient $W_1 = 7{,}38\\ \\mathrm{kW}$ et $W_2 = 5{,}02\\ \\mathrm{kW}$, de somme inchangée.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Triangle des puissances avant et après compensation",
          xTitre: "P",
          xUnite: "kW",
          yTitre: "Q",
          yUnite: "kvar",
          xMin: 0,
          xMax: 15,
          yMin: 0,
          yMax: 14,
          series: [
            { id: "avant", nom: "avant : tan φ = 1,006", couleur: "serie-5", epaisseur: 2.6, fonction: (p) => (p <= 12.4 ? p * 1.0057 : NaN) },
            { id: "apres", nom: "après : tan φ' = 0,329", couleur: "serie-1", epaisseur: 2.6, fonction: (p) => (p <= 12.4 ? p * 0.3287 : NaN) },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 12.4, 12.47, "Q = 12,47 kvar", true);
            marquerPoint(c, repere, couleurs, 12.4, 4.076, "Q' = 4,08 kvar", true);
            ligneV(c, repere, couleurs, 12.4, "Qc = 8,40 kvar");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Diagnostic : un compresseur qui paraît capacitif",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Une nouvelle centrale de mesure à deux éléments est posée sur le départ du compresseur, condensateurs déconnectés. Elle " +
        "affiche $W_1 = 5{,}01\\ \\mathrm{kW}$, $W_2 = 12{,}66\\ \\mathrm{kW}$, $P = 17{,}66\\ \\mathrm{kW}$ et $Q = -13{,}25\\ \\mathrm{kvar}$, " +
        "c'est-à-dire un récepteur capacitif. Le compresseur tourne dans le bon sens. Quelles affirmations sont exactes ?</p>",
      multiple: true,
      options: [
        { texte: "La puissance active affichée est juste.", juste: true },
        { texte: "Les tensions sont raccordées à la centrale en ordre inverse, ou ses deux voies de courant sont permutées.", juste: true },
        { texte: "Le moteur du compresseur est devenu capacitif." },
        { texte: "Un transformateur de courant est monté à l'envers." },
        { texte: "Rétablir l'ordre direct à l'entrée de la centrale redonne $Q = +13{,}25\\ \\mathrm{kvar}$.", juste: true },
      ],
      etapes: [
        { texte: "Attendu en ordre direct : $W_1 = UI\\cos(\\varphi - 30^\\circ) = 12{,}66\\ \\mathrm{kW}$ et $W_2 = UI\\cos(\\varphi + 30^\\circ) = 5{,}01\\ \\mathrm{kW}$, pour $\\varphi = 36{,}87^\\circ$." },
        { texte: "Les deux valeurs sont échangées : c'est la signature d'un ordre des phases inversé vu par l'appareil. La somme, $17{,}66\\ \\mathrm{kW}$, ne dépend pas de l'ordre." },
        { texte: "La centrale calcule $Q = \\sqrt{3}(W_1 - W_2) = -13{,}25\\ \\mathrm{kvar}$ : le signe est faux, pas le module. Le moteur tourne bien, l'ordre réel du départ est donc direct." },
        {
          texte: "Un transformateur de courant inversé changerait le signe d'une lecture : la somme deviendrait une différence, $7{,}65\\ \\mathrm{kW}$ en valeur absolue, très loin de la plaque.",
          note: "Méthode : comparer les lectures aux valeurs prévues, puis tester ordre des phases et polarités, charge connue en service.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        courbesLectures(moteur, conteneur, 398.37 * 32, "Lectures échangées : elles se lisent comme une charge à φ = -36,87°", [
          { x: 36.87, y: 12.66, libelle: "attendu W1", gauche: false },
          { x: 36.87, y: 5.01, libelle: "attendu W2", gauche: false },
          { x: -36.87, y: 5.01, libelle: "affiché W1", gauche: true },
          { x: -36.87, y: 12.66, libelle: "affiché W2", gauche: true },
        ]);
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-conceptuel",
      titre: "Deux wattmètres sur trois fils, trois sur quatre",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi deux wattmètres suffisent à mesurer la puissance de n'importe quel récepteur à trois " +
        "fils, même déséquilibré, alors qu'il en faut trois dès qu'un neutre parcouru par un courant s'ajoute.</p>",
      motsCles: [
        ["somme", "nulle", "noeud", "kirchhoff", "s'annul"],
        ["reference", "potentiel", "troisieme", "l3", "commun"],
        ["neutre", "quatre", "4 fils", "in "],
      ],
      minimum: 2,
      exemple: "Trois phrases : la loi des nœuds, le rôle du conducteur de référence, ce que change le neutre.",
      etapes: [
        { texte: "La puissance instantanée vaut $v_1 i_1 + v_2 i_2 + v_3 i_3$, avec des potentiels comptés depuis une origine quelconque." },
        { texte: "Sur trois fils, la loi des nœuds impose $i_1 + i_2 + i_3 = 0$ : changer l'origine des potentiels ne change pas la somme. En prenant $L_3$ pour origine, son terme disparaît et deux produits, $u_{13} i_1$ et $u_{23} i_2$, suffisent." },
        {
          texte: "Avec un neutre parcouru par un courant, $i_1 + i_2 + i_3 = i_N \\neq 0$ : le résultat dépendrait de l'origine choisie. Il faut prendre le neutre pour origine et mesurer les trois produits $v_k i_k$.",
          note: "C'est le théorème de Blondel : sur $n$ conducteurs, $n - 1$ wattmètres.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Trois courants déséquilibrés d'un récepteur à trois fils : la somme reste nulle",
          unite: "A",
          somme: true,
          nomSomme: "I1 + I2 + I3 = 0",
          vecteurs: [
            { id: "i1", nom: "I1", amplitude: 20, phase: -20 },
            { id: "i2", nom: "I2", amplitude: 12, phase: -150, couleur: "serie-3" },
            { id: "i3", nom: "I3 = -(I1 + I2)", amplitude: Math.hypot(20 * Math.cos(-20 * DEG) + 12 * Math.cos(-150 * DEG), 20 * Math.sin(-20 * DEG) + 12 * Math.sin(-150 * DEG)), phase: Math.atan2(-(20 * Math.sin(-20 * DEG) + 12 * Math.sin(-150 * DEG)), -(20 * Math.cos(-20 * DEG) + 12 * Math.cos(-150 * DEG))) / DEG, couleur: "serie-4", pointille: true },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

function dessinMontagesQuiz() {
  let d = '<g stroke="currentColor" stroke-width="1.6" fill="none"><rect x="10" y="20" width="260" height="190" rx="8"/><rect x="290" y="20" width="260" height="190" rx="8"/></g>';
  d += '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">';
  for (const x0 of [10, 290]) {
    d += '<path d="M' + (x0 + 20) + " 60H" + (x0 + 240) + "M" + (x0 + 20) + " 100H" + (x0 + 108) + "M" + (x0 + 152) + " 100H" + (x0 + 240) + "M" + (x0 + 20) + " 140H" + (x0 + 240) + "M" + (x0 + 20) + " 180H" + (x0 + 240) + '"/>';
    d += '<circle cx="' + (x0 + 130) + '" cy="100" r="22"/>';
  }
  d += '<path d="M140 122V130A10 10 0 0 1 140 150V180"/>';
  d += '<path d="M420 122V140"/>';
  d += "</g>";
  d += '<g fill="currentColor" stroke="none"><circle cx="140" cy="180" r="4"/><circle cx="420" cy="140" r="4"/></g>';
  d += '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">';
  for (const x0 of [10, 290]) {
    d += '<text x="' + (x0 + 4) + '" y="64">L1</text><text x="' + (x0 + 4) + '" y="104">L2</text><text x="' + (x0 + 4) + '" y="144">L3</text><text x="' + (x0 + 4) + '" y="184">N</text>';
    d += '<text x="' + (x0 + 120) + '" y="104" font-weight="600">W2</text>';
  }
  d += '<text x="140" y="14" text-anchor="middle" font-size="14" font-weight="600">a</text>';
  d += '<text x="420" y="14" text-anchor="middle" font-size="14" font-weight="600">b</text>';
  d += '<text x="10" y="228">W1 est déjà branché sur L1, circuit tension vers L3</text>';
  d += "</g>";
  return d;
}

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Méthode des deux wattmètres, référence $L_3$ : entre quels conducteurs branche-t-on le circuit tension du wattmètre dont le circuit courant est dans $L_1$ ?</p>",
        options: ["Entre $L_1$ et $L_3$", "Entre $L_1$ et le neutre", "Entre $L_2$ et $L_3$", "Entre $L_1$ et $L_2$"],
        bonnes: [0],
        explication: "Les deux circuits tension aboutissent au conducteur de référence, qui ne porte pas de circuit courant : $W_1$ voit $u_{13}$ et $W_2$ voit $u_{23}$.",
        resume: "Branchement des deux wattmètres",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Pour un moteur équilibré à $\\cos\\varphi = 0{,}4$, l'une des deux lectures de la méthode des deux wattmètres est négative.</p>",
        reponse: true,
        explication: "$\\varphi = 66{,}4^\\circ > 60^\\circ$ : $W_2 = UI\\cos(96{,}4^\\circ) < 0$. C'est normal, seule la somme a un sens physique.",
        resume: "Lecture négative",
      },
      {
        type: "calcul",
        enonce: "<p>Charge équilibrée, $W_1 = 7\\ \\mathrm{kW}$ et $W_2 = 3\\ \\mathrm{kW}$. Quelle est sa puissance réactive, en kilovars ?</p>",
        valeur: RAC3 * 4,
        unite: "kvar",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$Q = \\sqrt{3}(W_1 - W_2) = 1{,}732 \\times 4 = 6{,}93\\ \\mathrm{kvar}$.",
        resume: "Réactif par deux wattmètres",
      },
      {
        type: "calcul",
        enonce: "<p>Un récepteur équilibré appelle $25\\ \\mathrm{A}$ par ligne sous $400\\ \\mathrm{V}$ entre phases, à $\\cos\\varphi = 0{,}9$. Quelle puissance active reçoit-il, en kilowatts ?</p>",
        valeur: (RAC3 * 400 * 25 * 0.9) / 1000,
        unite: "kW",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$P = \\sqrt{3}\\,UI\\cos\\varphi = 1{,}732 \\times 400 \\times 25 \\times 0{,}9 = 15{,}59\\ \\mathrm{kW}$.",
        resume: "Puissance active triphasée",
      },
      {
        type: "qcm",
        enonce: "<p>Combien de wattmètres faut-il au minimum pour mesurer la puissance active d'un récepteur déséquilibré alimenté par trois phases et un neutre parcouru par un courant ?</p>",
        options: ["Un", "Deux", "Trois", "Quatre"],
        bonnes: [2],
        explication: "Quatre conducteurs : $n - 1 = 3$ wattmètres, circuits tension vers le neutre, d'après le théorème de Blondel.",
        resume: "Nombre de wattmètres sur quatre fils",
      },
      {
        type: "vraiFaux",
        enonce: "<p>La somme des lectures de deux wattmètres est exacte sur un récepteur à trois fils fortement déséquilibré.</p>",
        reponse: true,
        explication: "La démonstration n'utilise que $i_1 + i_2 + i_3 = 0$ : aucune hypothèse d'équilibre ni de forme d'onde. Seule la formule de $Q$ suppose l'équilibre.",
        resume: "Validité de la méthode d'Aron",
      },
      {
        type: "courte",
        enonce: "<p>Sur un moteur à vide, $W_2$ est négatif. Pourquoi cela ne signifie-t-il pas que le moteur renvoie de l'énergie au réseau ?</p>",
        motsCles: [["somme", "total", "w1 + w2", "w1+w2", "positive"], ["angle", "60", "cos", "dephas", "90", "moyenne"]],
        minimum: 2,
        explication: "Chaque wattmètre mesure la moyenne d'un produit choisi par le montage, avec un angle $\\varphi + 30^\\circ$ qui dépasse $90^\\circ$ au-delà de $\\varphi = 60^\\circ$. Seule la somme $W_1 + W_2$, positive, est la puissance reçue.",
        resume: "Sens d'une lecture négative",
      },
      {
        type: "schema",
        enonce: "<p>Le wattmètre $W_1$ est branché sur $L_1$ avec son circuit tension vers $L_3$. Lequel des deux montages de $W_2$ complète correctement la méthode des deux wattmètres ?</p>",
        consigne: "Cliquez sur le montage correct.",
        viewBox: "0 0 560 236",
        description: "Deux montages de W2 dans L2 : a, circuit tension descendant vers le neutre N en enjambant L3 ; b, circuit tension relié à L3",
        dessin: dessinMontagesQuiz(),
        zones: [
          { x: 10, y: 20, largeur: 260, hauteur: 190, etiquette: "a" },
          { x: 290, y: 20, largeur: 260, hauteur: 190, etiquette: "b", juste: true },
        ],
        explication: "Les deux circuits tension doivent aboutir au même conducteur de référence, $L_3$. Le montage a mélange la méthode des deux wattmètres et celle des trois wattmètres : la somme ne correspond plus à aucune puissance.",
        resume: "Référence commune des circuits tension",
      },
      {
        type: "calcul",
        enonce: "<p>Un wattmètre dont le circuit courant est dans $L_1$ et le circuit tension entre $L_2$ et $L_3$ lit $3\\ \\mathrm{kW}$ sur une charge équilibrée. Quelle est la puissance réactive totale, en kilovars ?</p>",
        valeur: RAC3 * 3,
        unite: "kvar",
        tolerance: 0.01,
        chiffres: 2,
        explication: "Le montage en quadrature lit $UI\\sin\\varphi$, donc $Q = \\sqrt{3} \\times 3 = 5{,}20\\ \\mathrm{kvar}$.",
        resume: "Wattmètre en quadrature",
      },
      {
        type: "qcm",
        enonce: "<p>Sur une charge équilibrée, les deux wattmètres affichent la même valeur. Que peut-on en conclure ?</p>",
        options: ["La charge est purement résistive, $\\varphi = 0$", "La charge est purement inductive", "Le neutre porte un courant", "L'ordre des phases est inversé"],
        bonnes: [0],
        explication: "$W_1 = W_2$ impose $\\cos(\\varphi - 30^\\circ) = \\cos(\\varphi + 30^\\circ)$, soit $\\sin\\varphi = 0$ : $Q = 0$.",
        resume: "Lectures égales",
      },
    ],
    { titre: "Dix questions sur les puissances triphasées et leur mesure" }
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
      { categorie: "Définition", question: "Quelle est la puissance complexe d'un récepteur triphasé quelconque ?", reponse: "$\\underline{S} = \\sum_k \\underline{V}_k\\,\\underline{I}_k^* = P + jQ$, tensions simples prises par rapport au neutre." },
      { categorie: "Équilibré", question: "Que valent $P$, $Q$ et $S$ d'un récepteur équilibré ?", reponse: "$P = \\sqrt{3}\\,UI\\cos\\varphi$, $Q = \\sqrt{3}\\,UI\\sin\\varphi$, $S = \\sqrt{3}\\,UI$, en étoile comme en triangle." },
      { categorie: "Wattmètre", question: "Que mesure un wattmètre ?", reponse: "La moyenne du produit de la tension vue par son circuit tension et du courant qui traverse son circuit courant : $UI\\cos\\theta$ en sinusoïdal." },
      { categorie: "Quatre fils", question: "Comment mesurer $P$ sur un réseau à quatre fils déséquilibré ?", reponse: "Trois wattmètres, circuits tension entre chaque phase et le neutre : $P = W_1 + W_2 + W_3$." },
      { categorie: "Trois fils", question: "Pourquoi deux wattmètres suffisent-ils sur trois fils ?", reponse: "$i_1 + i_2 + i_3 = 0$ : en prenant $L_3$ pour référence, $p = u_{13} i_1 + u_{23} i_2$, quel que soit l'équilibre." },
      { categorie: "Lectures", question: "Que lisent les deux wattmètres sur une charge équilibrée en ordre direct ?", reponse: "$W_1 = UI\\cos(\\varphi - 30^\\circ)$ et $W_2 = UI\\cos(\\varphi + 30^\\circ)$." },
      { categorie: "Réactif", question: "Comment tirer $Q$ et $\\tan\\varphi$ de deux lectures ?", reponse: "$Q = \\sqrt{3}(W_1 - W_2)$ et $\\tan\\varphi = \\sqrt{3}(W_1 - W_2)/(W_1 + W_2)$, si la charge est équilibrée et sinusoïdale." },
      { categorie: "Signe", question: "Quand une lecture devient-elle négative ?", reponse: "Pour $|\\varphi| > 60^\\circ$, soit $\\cos\\varphi < 0{,}5$ : $W_2$ si la charge est inductive, $W_1$ si elle est capacitive." },
      { categorie: "Diagnostic", question: "Que produit un ordre des phases inversé à l'entrée d'une centrale à deux éléments ?", reponse: "Les deux lectures s'échangent : $P$ reste juste, $Q$ change de signe et une charge inductive paraît capacitive." },
      {
        categorie: "Industriel",
        question: "Quel appareil le site a-t-il retenu à l'arrivée de son tableau général, et pourquoi ?",
        reponse: "Une centrale à trois éléments, quatre fils : le neutre porte environ $27\\ \\mathrm{A}$ de l'atelier, et deux wattmètres se tromperaient jusqu'à $6\\ \\mathrm{kW}$.",
        rappel: "Compresseur : deux éléments, 12,66 et 5,01 kW sans condensateurs, 10,51 et 7,16 kW avec.",
      },
    ],
    { titre: "Dix cartes sur la puissance en triphasé" }
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
        enonce: "<p>Cette séance. Deux wattmètres sur un moteur à faible charge lisent $W_1 = 10\\ \\mathrm{kW}$ et $W_2 = -2\\ \\mathrm{kW}$. Quelle puissance active absorbe-t-il, en kilowatts ?</p>",
        valeur: 8,
        unite: "kW",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$P = W_1 + W_2 = 10 - 2 = 8\\ \\mathrm{kW}$ : la lecture négative se retranche.",
        resume: "Somme avec une lecture négative",
      },
      {
        type: "qcm",
        enonce: "<p>Cette séance. Quelle expression donne $\\tan\\varphi$ d'une charge équilibrée à partir des deux lectures ?</p>",
        options: [
          "$\\sqrt{3}\\,(W_1 - W_2)/(W_1 + W_2)$",
          "$(W_1 - W_2)/(W_1 + W_2)$",
          "$\\sqrt{3}\\,(W_1 + W_2)/(W_1 - W_2)$",
          "$(W_1 + W_2)/\\sqrt{3}$",
        ],
        bonnes: [0],
        explication: "$Q = \\sqrt{3}(W_1 - W_2)$ et $P = W_1 + W_2$, donc $\\tan\\varphi = Q/P = \\sqrt{3}(W_1 - W_2)/(W_1 + W_2)$.",
        resume: "Tangente à partir des lectures",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Cette séance. Trois wattmètres dont les circuits tension aboutissent au neutre mesurent exactement la puissance d'un récepteur dont le neutre est parcouru par un courant.</p>",
        reponse: true,
        explication: "Chacun mesure $v_k i_k$ ; leur somme est la définition même de la puissance reçue, quel que soit le courant du neutre.",
        resume: "Validité des trois wattmètres",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/systemes-triphases-equilibres\">Systèmes triphasés équilibrés</a>. Trois résistances de $30\\ \\Omega$ sont couplées en triangle sous $400\\ \\mathrm{V}$. Quel est le courant de ligne ?</p>",
        valeur: (RAC3 * 400) / 30,
        unite: "A",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$J = 400/30 = 13{,}33\\ \\mathrm{A}$ par branche, et $I = \\sqrt{3}\\,J = 23{,}09\\ \\mathrm{A}$.",
        resume: "Courant de ligne en triangle",
      },
      {
        type: "qcm",
        enonce: "<p>Cours <a href=\"#/cours/systemes-triphases-equilibres\">Systèmes triphasés équilibrés</a>. Un moteur dont la plaque indique $400/690\\ \\mathrm{V}$ est raccordé à un réseau $230/400\\ \\mathrm{V}$. Quel couplage faut-il ?</p>",
        options: ["Triangle", "Étoile", "Étoile avec neutre relié", "Indifférent"],
        bonnes: [0],
        explication: "Chaque enroulement supporte $400\\ \\mathrm{V}$, la plus petite tension de la plaque : le triangle la lui applique sur ce réseau.",
        resume: "Couplage d'après la plaque",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/nombres-complexes-et-phaseurs\">Nombres complexes et phaseurs</a>. Quelle est la valeur efficace de la somme de deux courants de $10\\ \\mathrm{A}$, l'un à $0^\\circ$ et l'autre à $90^\\circ$ ?</p>",
        valeur: Math.hypot(10, 10),
        unite: "A",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$10 + j10$ a pour module $10\\sqrt{2} = 14{,}14\\ \\mathrm{A}$, et non $20\\ \\mathrm{A}$ : les valeurs efficaces ne s'additionnent pas.",
        resume: "Somme de phaseurs",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Cours <a href=\"#/cours/tension-courant-charge-et-puissance\">Tension, courant, charge et puissance</a>. En convention récepteur, un produit $u\\,i$ positif signifie que le dipôle reçoit de l'énergie.</p>",
        reponse: true,
        explication: "En convention récepteur, $p = u\\,i > 0$ est une puissance reçue. C'est la convention d'un wattmètre dont les bornes homologues sont du côté du réseau.",
        resume: "Convention récepteur",
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
    titre: "Où en suis-je sur la puissance en triphasé ?",
  });
  if (auto) ressources.push(auto);
}
