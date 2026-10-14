/* ==========================================================================
   cours/charges-triphasees-desequilibrees/cours.js
   Charges triphasées déséquilibrées : neutre, déplacement du point étoile,
   charge triangle déséquilibrée, rupture du neutre.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const RAC3 = Math.sqrt(3);
const W50 = TAU * 50;
const VS = 230;

/* --------------------------------------------------------------------------
   Calcul complexe minimal
   -------------------------------------------------------------------------- */

const cx = {
  polaire: (module, degres) => ({ re: module * Math.cos(degres * DEG), im: module * Math.sin(degres * DEG) }),
  plus: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  moins: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
  fois: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  echelle: (a, k) => ({ re: a.re * k, im: a.im * k }),
  conj: (a) => ({ re: a.re, im: -a.im }),
  div: (a, b) => {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  },
  module: (a) => Math.hypot(a.re, a.im),
  argument: (a) => Math.atan2(a.im, a.re) / DEG,
};

const ZERO = { re: 0, im: 0 };

/** Tensions simples du réseau 230/400 V, ordre direct, référence sur V1. */
const VRES = [cx.polaire(VS, 0), cx.polaire(VS, -120), cx.polaire(VS, 120)];

/** Admittance d'un récepteur de puissance active p (W) et de facteur de puissance cosPhi sous 230 V. */
function admittance(p, cosPhi = 1, capacitif = false) {
  if (!(p > 0)) return { ...ZERO };
  const q = p * Math.tan(Math.acos(Math.min(1, Math.max(0.05, cosPhi)))) * (capacitif ? -1 : 1);
  /* Y = S* / V^2 */
  return { re: p / (VS * VS), im: -q / (VS * VS) };
}

/** Formule de Millman du point étoile, neutre d'admittance yN (siemens réels), éventuellement nulle. */
function millman(Y, yN = 0) {
  const somme = Y.reduce((acc, y) => cx.plus(acc, y), { re: yN, im: 0 });
  const num = Y.reduce((acc, y, k) => cx.plus(acc, cx.fois(y, VRES[k])), { ...ZERO });
  if (cx.module(somme) < 1e-12) return { vn: { ...ZERO }, num, somme, indetermine: true };
  return { vn: cx.div(num, somme), num, somme, indetermine: false };
}

/** Exemple de la section H : chauffage 4,6 kW, climatiseur 2,3 kW à 0,8, éclairage 1,15 kW. */
const EX_H = [admittance(4600), admittance(2300, 0.8), admittance(1150)];

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

/** Point du plan des phaseurs (volts ou ampères) converti en pixels, axe imaginaire vers le haut. */
function versPx(o, k, z) {
  return { x: o.x + k * z.re, y: o.y - k * z.im };
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

/** Fond commun des triangles de tensions : axes, triangle en tirets, tensions simples en trait fin. */
function fondTriangle(svg, o, k, idMarqueur, avecSimples = true) {
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(idMarqueur);
  const s = VRES.map((v) => versPx(o, k, v));
  const g = svgEl("g");
  let html =
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.4">' +
    '<path d="M' + (o.x - 170) + " " + o.y + "H" + (o.x + 190) + "M" + o.x + " " + (o.y - 170) + "V" + (o.y + 170) + '"/></g>' +
    '<g stroke="currentColor" stroke-width="1.2" fill="none" stroke-dasharray="6 5"><path d="M' +
    s[0].x.toFixed(1) + " " + s[0].y.toFixed(1) + "L" + s[1].x.toFixed(1) + " " + s[1].y.toFixed(1) + "L" + s[2].x.toFixed(1) + " " + s[2].y.toFixed(1) + 'Z"/></g>';
  if (avecSimples) {
    html += '<g stroke="currentColor" stroke-width="1.3" fill="none" opacity="0.85">';
    for (const p of s) html += '<path d="' + segment(o.x, o.y, p.x, p.y) + '" marker-end="url(#' + idMarqueur + ')"/>';
    html += "</g>";
  }
  html +=
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    texte(s[0].x + 8, s[0].y + 4, "V1") + texte(s[1].x - 26, s[1].y + 16, "V2") + texte(s[2].x - 26, s[2].y - 6, "V3") +
    texte(o.x - 18, o.y + 18, "N") + '<circle cx="' + o.x + '" cy="' + o.y + '" r="3.5"/></g>';
  g.innerHTML = html;
  svg.append(defs, g);
  return s;
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
  construireSomme(racine, api);
  construireNeutreSim(racine, api);
  construireMillman(racine, api);
  construireDeplacement(racine, api);
  construireRupture(racine, api);
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
    ["#e-neutre-figure svg", 1.6],
    ["#e-sans-neutre-figure svg", 1.6],
    ["#e-barycentre-figure svg", 1.6],
    ["#e-triangle-figure svg", 1.6],
    ["#f-schema-principal svg", 2.2],
    ["#f-triangle-tensions svg", 1.8],
    ["#i-atelier-figure svg", 2],
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
      id: "c-somme",
      titre: "Somme de deux phaseurs décalés de 120 degrés",
      niveau: "prérequis",
      enonce:
        "<p>Deux courants de $10\\ \\mathrm{A}$ efficaces, l'un à $0^\\circ$, l'autre à $-120^\\circ$, se rejoignent dans un même " +
        "conducteur. Quelle est la valeur efficace du courant résultant ?</p>",
      valeur: cx.module(cx.plus(cx.polaire(10, 0), cx.polaire(10, -120))),
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant résultant",
      etapes: [
        { texte: "On additionne les phaseurs, pas les valeurs efficaces : $10 + 10(\\cos 120^\\circ - j\\sin 120^\\circ)$." },
        { texte: "$= 10 - 5 - j8{,}660 = 5 - j8{,}660\\ \\mathrm{A}$." },
        {
          texte: "Module : $\\sqrt{5^2 + 8{,}660^2} = 10\\ \\mathrm{A}$, à $-60^\\circ$.",
          note: "C'est le courant du neutre quand deux phases sur trois portent $10\\ \\mathrm{A}$ résistifs : le neutre porte autant qu'une phase.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Deux courants de 10 A décalés de 120 degrés",
          unite: "A",
          somme: true,
          nomSomme: "somme : 10 A à -60 degrés",
          vecteurs: [
            { id: "a", nom: "10 A à 0 degré", amplitude: 10, phase: 0, couleur: "serie-1" },
            { id: "b", nom: "10 A à -120 degrés", amplitude: 10, phase: -120, couleur: "serie-3" },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-millman",
      titre: "Théorème de Millman en continu",
      niveau: "prérequis",
      enonce:
        "<p>Un nœud $A$ est relié à une source de $12\\ \\mathrm{V}$ par $2\\ \\Omega$, à une source de $6\\ \\mathrm{V}$ par $4\\ \\Omega$, " +
        "et à la masse par $4\\ \\Omega$. Toutes les sources ont leur borne négative à la masse. Quel est le potentiel de $A$ ?</p>",
      valeur: (12 / 2 + 6 / 4) / (1 / 2 + 1 / 4 + 1 / 4),
      unite: "V",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Potentiel $V_A$",
      etapes: [
        { texte: "Loi des nœuds en $A$ : $\\sum G_k (E_k - V_A) = 0$, avec $E = 0$ pour la branche vers la masse." },
        { texte: "$V_A = \\dfrac{12/2 + 6/4 + 0/4}{1/2 + 1/4 + 1/4} = \\dfrac{7{,}5}{1}$." },
        {
          texte: "$V_A = 7{,}5\\ \\mathrm{V}$.",
          note: "La branche vers la masse, de potentiel nul, n'ajoute rien au numérateur mais compte au dénominateur : c'est le rôle du neutre dans la formule du point étoile.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Somme des courants entrant en A en fonction du potentiel supposé",
          xTitre: "VA",
          xUnite: "V",
          yTitre: "somme des courants",
          yUnite: "A",
          xMin: 0,
          xMax: 12,
          yMin: -6,
          yMax: 8,
          series: [{ id: "r", nom: "Σ Gk (Ek - VA)", couleur: "serie-1", epaisseur: 2.6, fonction: (v) => (12 - v) / 2 + (6 - v) / 4 - v / 4 }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
            marquerPoint(c, repere, couleurs, 7.5, 0, "VA = 7,5 V : somme nulle", true);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-admittance",
      titre: "Admittance d'une impédance",
      niveau: "prérequis",
      enonce: "<p>Quelle est la conductance $G = \\mathrm{Re}(\\underline{Y})$ de l'impédance $\\underline{Z} = 8 + j6\\ \\Omega$ ?</p>",
      valeur: 0.08,
      unite: "S",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Conductance $G$",
      etapes: [
        { texte: "$\\underline{Y} = \\dfrac{1}{8 + j6} = \\dfrac{8 - j6}{8^2 + 6^2} = \\dfrac{8 - j6}{100}$." },
        {
          texte: "$\\underline{Y} = 0{,}08 - j0{,}06\\ \\mathrm{S}$, donc $G = 0{,}08\\ \\mathrm{S}$.",
          note: "Attention : $G \\neq 1/R = 0{,}125\\ \\mathrm{S}$ dès que la réactance n'est pas nulle.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Z et Y = 1/Z dans le plan complexe, à des échelles différentes",
          unite: "",
          vecteurs: [
            { id: "z", nom: "Z / 100, soit 0,1 à +36,87 degrés", amplitude: 0.1, phase: 36.87, couleur: "serie-1" },
            { id: "y", nom: "Y = 0,1 S à -36,87 degrés", amplitude: 0.1, phase: -36.87, couleur: "serie-5", pointille: true },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : courants instantanés et courant du neutre
   -------------------------------------------------------------------------- */

function construireSomme(racine, api) {
  const etat = { p: [4.6, 2.3, 1.15], cos2: 0.8, t: 40 };

  function phaseurs() {
    const i1 = cx.polaire((etat.p[0] * 1000) / VS, 0);
    const phi2 = Math.acos(etat.cos2) / DEG;
    const i2 = cx.polaire((etat.p[1] * 1000) / (VS * etat.cos2), -120 - phi2);
    const i3 = cx.polaire((etat.p[2] * 1000) / VS, 120);
    const iN = cx.plus(cx.plus(i1, i2), i3);
    return [i1, i2, i3, iN];
  }
  const inst = (z, tms) => Math.SQRT2 * cx.module(z) * Math.cos(W50 * (tms / 1000) + cx.argument(z) * DEG);

  const trace = api.sim.traceur("#d-somme-trace", {
    titre: "Courants de ligne et courant du neutre",
    genre: "Animation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "courant",
    yUnite: "A",
    xMin: 0,
    xMax: 40,
    yMin: -32,
    yMax: 32,
    ratio: 0.42,
    echantillons: 480,
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

  const valeurs = api.sim.valeurs("#d-somme-valeurs", [
    { id: "t", libelle: "Instant t", unite: "ms", decimales: 2 },
    { id: "i1", libelle: "i1(t)", unite: "A", decimales: 2 },
    { id: "i2", libelle: "i2(t)", unite: "A", decimales: 2 },
    { id: "i3", libelle: "i3(t)", unite: "A", decimales: 2 },
    { id: "iN", libelle: "iN(t) = i1 + i2 + i3", unite: "A", decimales: 2 },
    { id: "IN", libelle: "Valeur efficace IN", unite: "A", decimales: 2 },
    { id: "som", libelle: "Somme des valeurs efficaces, sans signification", unite: "A", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const z = phaseurs();
    if (trace) {
      const crete = Math.max(2, ...z.map((v) => Math.SQRT2 * cx.module(v)));
      trace.definirPlage({ yMin: -Math.ceil(crete * 1.1), yMax: Math.ceil(crete * 1.1) });
      ["i1", "i2", "i3", "iN"].forEach((id, n) => {
        trace.definirFonction(id, (tms) => (tms <= etat.t + 1e-9 ? inst(z[n], tms) : NaN));
      });
      trace.demanderRendu();
    }
    if (valeurs) {
      valeurs.maj({
        t: etat.t,
        i1: inst(z[0], etat.t),
        i2: inst(z[1], etat.t),
        i3: inst(z[2], etat.t),
        iN: inst(z[3], etat.t),
        IN: cx.module(z[3]),
        som: cx.module(z[0]) + cx.module(z[1]) + cx.module(z[2]),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#d-somme-curseurs",
    [
      { id: "p1", libelle: "Phase 1, résistive", min: 0, max: 6, pas: 0.05, valeur: 4.6, unite: "kW", chiffres: 2 },
      { id: "p2", libelle: "Phase 2", min: 0, max: 6, pas: 0.05, valeur: 2.3, unite: "kW", chiffres: 2 },
      { id: "cos2", libelle: "cos φ2, inductif", min: 0.5, max: 1, pas: 0.01, valeur: 0.8, chiffres: 2 },
      { id: "p3", libelle: "Phase 3, résistive", min: 0, max: 6, pas: 0.05, valeur: 1.15, unite: "kW", chiffres: 2 },
    ],
    (lues) => {
      etat.p = [lues.p1, lues.p2, lues.p3];
      etat.cos2 = lues.cos2;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-somme-lecteur", {
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
  if (lecteur) {
    ressources.push(lecteur);
    /* Les courbes s'affichent complètes tant que l'apprenant n'a pas lancé la lecture. */
    lecteur.suivre(40);
    etat.t = 40;
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : le courant du neutre comme somme de phaseurs
   -------------------------------------------------------------------------- */

function construireNeutreSim(racine, api) {
  const conteneur = racine.querySelector("#e-neutre-sim");
  if (!conteneur) return;

  const O1 = { x: 190, y: 190 };
  const O2 = { x: 560, y: 190 };
  const KI = 5;
  const KV = 0.6;
  let kp = 4;
  const etat = { phi1: 0, i: [20, 12.5, 5], phi2: 36.87, phi3: 0 };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 380",
    role: "img",
    "aria-label": "Diagramme de Fresnel manipulable : trois courants de ligne d'une charge étoile avec neutre, poignée au bout de I1 réglant son déphasage, et polygone des courants mis bout à bout dont le vecteur de fermeture est le courant du neutre",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-ns");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.4">' +
    '<path d="M30 190H350M190 30V350M380 190H740"/><path d="M370 20V360" stroke-dasharray="2 4"/></g>';
  const tensions = [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 1.3, fill: "none", opacity: 0.8, "marker-end": "url(#fl-e-ns)" }));
  const courants = [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-ns)" }));
  const polygone = [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "none", "marker-end": "url(#fl-e-ns)" }));
  const neutre = svgEl("path", { stroke: "currentColor", "stroke-width": 3.4, fill: "none", "stroke-dasharray": "8 5", "marker-end": "url(#fl-e-ns)" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, ...tensions, ...courants, ...polygone, neutre, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-neutre-sim-valeurs", [
    { id: "phi1", libelle: "Déphasage φ1", unite: "°", decimales: 1 },
    { id: "in", libelle: "Courant du neutre IN", unite: "A", decimales: 2 },
    { id: "arg", libelle: "Argument de IN", unite: "°", decimales: 1 },
    { id: "max", libelle: "Plus grand courant de ligne", unite: "A", decimales: 2 },
    { id: "som", libelle: "Somme arithmétique I1 + I2 + I3", unite: "A", decimales: 2 },
    { id: "p", libelle: "Puissance active totale", unite: "kW", decimales: 2 },
    { id: "q", libelle: "Puissance réactive totale", unite: "kvar", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function phaseurs() {
    return [
      cx.polaire(etat.i[0], -etat.phi1),
      cx.polaire(etat.i[1], -120 - etat.phi2),
      cx.polaire(etat.i[2], 120 - etat.phi3),
    ];
  }

  function dessiner() {
    const I = phaseurs();
    VRES.forEach((v, k) => {
      const p = versPx(O1, KV, v);
      tensions[k].setAttribute("d", segment(O1.x, O1.y, p.x, p.y));
    });
    const bouts = I.map((z) => versPx(O1, KI, z));
    bouts.forEach((p, k) => courants[k].setAttribute("d", segment(O1.x, O1.y, p.x, p.y, k === 0 ? 10 : 3)));
    /* Échelle du polygone ajustée pour qu'il tienne dans la moitié droite. */
    let etendue = 1;
    let parcours = { ...ZERO };
    for (const z of I) {
      parcours = cx.plus(parcours, z);
      etendue = Math.max(etendue, cx.module(parcours), cx.module(z));
    }
    kp = Math.min(6, 160 / etendue);
    let cumul = { ...ZERO };
    const sommets = [versPx(O2, kp, cumul)];
    I.forEach((z, k) => {
      const debut = versPx(O2, kp, cumul);
      cumul = cx.plus(cumul, z);
      const fin = versPx(O2, kp, cumul);
      sommets.push(fin);
      polygone[k].setAttribute("d", segment(debut.x, debut.y, fin.x, fin.y));
    });
    const finN = sommets[3];
    neutre.setAttribute("d", segment(O2.x, O2.y, finN.x, finN.y));

    const iN = cumul;
    let t = "";
    t += texte(O1.x + KV * VS + 6, O1.y + 16, "V1") + texte(30, 30, "courants partant de l'origine");
    ["I1", "I2", "I3"].forEach((nom, k) => {
      const z = I[k];
      const m = Math.max(1e-9, cx.module(z));
      const p = versPx(O1, KI + 18 / m, z);
      t += texte(p.x - 8, p.y + 5, nom);
      const a = sommets[k];
      const b = sommets[k + 1];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l > 14) {
        /* Libellé décalé perpendiculairement au segment, du côté gauche du parcours. */
        const nx = (b.y - a.y) / l;
        const ny = -(b.x - a.x) / l;
        t += texte((a.x + b.x) / 2 + nx * 14 - 8, (a.y + b.y) / 2 + ny * 14 + 4, nom, ' font-size="11"');
      }
    });
    t += texte(390, 30, "mis bout à bout, " + nombre(api, kp, 1) + " px par A");
    t += texte(390, 350, "IN = " + nombre(api, cx.module(iN), 2) + " A à " + nombre(api, cx.argument(iN), 1) + "°");
    if (cx.module(iN) > 0.3) t += texte(finN.x + 8, finN.y + 16, "IN", ' font-weight="600"');
    t += texte(30, 350, "V en trait fin, I en trait épais");
    libelles.innerHTML = t;

    if (valeurs) {
      const s = I.reduce((acc, z, k) => cx.plus(acc, cx.fois(VRES[k], cx.conj(z))), { ...ZERO });
      valeurs.maj({
        phi1: etat.phi1,
        in: cx.module(iN),
        arg: cx.argument(iN),
        max: Math.max(...etat.i),
        som: etat.i[0] + etat.i[1] + etat.i[2],
        p: s.re / 1000,
        q: s.im / 1000,
      });
    }
  }

  let poignee = null;
  function creerPoignee() {
    if (poignee) {
      poignee.detruire();
      ressources = ressources.filter((r) => r !== poignee);
    }
    poignee = api.sim.poignee(conteneur, {
      type: "cercle",
      centre: O1,
      rayon: KI * etat.i[0],
      valeur: -etat.phi1,
      min: -90,
      max: 90,
      boucle: false,
      pas: 1,
      libelle: "Angle du courant I1, opposé du déphasage φ1",
      format: (mesure) => "courant I1 à " + nombre(api, mesure.valeur, 0) + " degrés, φ1 = " + nombre(api, -mesure.valeur, 0) + " degrés",
      diffuserAuDepart: false,
      rappel(mesure) {
        etat.phi1 = -mesure.valeur;
        dessiner();
      },
    });
    if (poignee) ressources.push(poignee);
  }

  const curseurs = api.sim.curseurs(
    "#e-neutre-sim-curseurs",
    [
      { id: "i1", libelle: "Courant I1", min: 2, max: 30, pas: 0.5, valeur: 20, unite: "A", chiffres: 1 },
      { id: "i2", libelle: "Courant I2", min: 0, max: 30, pas: 0.5, valeur: 12.5, unite: "A", chiffres: 1 },
      { id: "phi2", libelle: "Déphasage φ2, positif si inductif", min: -90, max: 90, pas: 0.01, valeur: 36.87, unite: "°", chiffres: 2 },
      { id: "i3", libelle: "Courant I3", min: 0, max: 30, pas: 0.5, valeur: 5, unite: "A", chiffres: 1 },
      { id: "phi3", libelle: "Déphasage φ3, positif si inductif", min: -90, max: 90, pas: 1, valeur: 0, unite: "°", chiffres: 0 },
    ],
    (lues) => {
      const changeI1 = lues.i1 !== etat.i[0];
      etat.i = [lues.i1, lues.i2, lues.i3];
      etat.phi2 = lues.phi2;
      etat.phi3 = lues.phi3;
      if (changeI1 || !poignee) creerPoignee();
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  if (!poignee) creerPoignee();
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Animation : construction de Millman
   -------------------------------------------------------------------------- */

function construireMillman(racine, api) {
  const conteneur = racine.querySelector("#e-millman");
  if (!conteneur) return;

  const O = { x: 230, y: 200 };
  const K = 0.62;
  const ETAPES = [
    "1. Tensions simples V1, V2, V3",
    "2. Poids wk = Gk / ΣG",
    "3. w1 V1 depuis N",
    "4. + w2 V2, bout à bout",
    "5. + w3 V3 : on arrive en N'",
    "6. VN' et tensions VkN'",
    "Construction terminée",
  ];
  const etat = { s: 6, p: [4.6, 2.3, 1.15] };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 400",
    role: "img",
    "aria-label": "Construction pas à pas du point étoile par la formule de Millman : vecteurs pondérés w1 V1, w2 V2, w3 V3 mis bout à bout depuis le neutre N, arrivée au point N', puis tensions appliquées aux récepteurs",
  });
  const s = fondTriangle(svg, O, K, "fl-e-m", false);
  const simples = [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 1.3, fill: "none", "marker-end": "url(#fl-e-m)" }));
  const ponderes = [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "marker-end": "url(#fl-e-m)" }));
  const vn = svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-dasharray": "7 4", "marker-end": "url(#fl-e-m)" });
  const appliquees = [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-m)" }));
  const point = svgEl("circle", { r: 5, fill: "currentColor", stroke: "none" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(...simples, ...ponderes, vn, ...appliquees, point, libelles);
  conteneur.appendChild(svg);

  const frac = (k) => Math.max(0, Math.min(1, etat.s - k));

  function dessiner() {
    const G = etat.p.map((p) => (p * 1000) / (VS * VS));
    const somme = G[0] + G[1] + G[2];
    const w = somme > 0 ? G.map((g) => g / somme) : [0, 0, 0];
    s.forEach((p, k) => simples[k].setAttribute("d", partiel(O.x, O.y, p.x, p.y, frac(0))));

    let cumul = { ...ZERO };
    const points = [versPx(O, K, cumul)];
    VRES.forEach((v, k) => {
      const debut = versPx(O, K, cumul);
      cumul = cx.plus(cumul, cx.echelle(v, w[k]));
      const fin = versPx(O, K, cumul);
      points.push(fin);
      ponderes[k].setAttribute("d", partiel(debut.x, debut.y, fin.x, fin.y, frac(2 + k)));
    });
    const pN = points[3];
    vn.setAttribute("d", partiel(O.x, O.y, pN.x, pN.y, frac(5)));
    s.forEach((p, k) => appliquees[k].setAttribute("d", partiel(pN.x, pN.y, p.x, p.y, frac(5))));
    point.setAttribute("cx", pN.x.toFixed(1));
    point.setAttribute("cy", pN.y.toFixed(1));
    point.setAttribute("opacity", frac(4) >= 1 ? 1 : 0);

    const idx = Math.min(ETAPES.length - 1, Math.floor(etat.s + 1e-6));
    let t = texte(470, 40, ETAPES[idx], ' font-weight="600"');
    t += texte(470, 70, "P = " + nombre(api, etat.p[0], 2) + " ; " + nombre(api, etat.p[1], 2) + " ; " + nombre(api, etat.p[2], 2) + " kW");
    if (somme <= 0) {
      t += texte(470, 100, "aucun récepteur : N' indéterminé");
    } else {
      if (frac(1) >= 1) {
        t += texte(470, 100, "w1 = " + nombre(api, w[0], 3) + ", w2 = " + nombre(api, w[1], 3));
        t += texte(470, 122, "w3 = " + nombre(api, w[2], 3) + ", somme = 1");
      }
      const libelleSegment = (a, b, nom, cote) => {
        const l = Math.hypot(b.x - a.x, b.y - a.y);
        if (l < 30) return "";
        const nx = (cote * (b.y - a.y)) / l;
        const ny = (-cote * (b.x - a.x)) / l;
        return texte((a.x + b.x) / 2 + nx * 16 - 14, (a.y + b.y) / 2 + ny * 16 + 4, nom, ' font-size="11"');
      };
      if (frac(2) >= 1) t += libelleSegment(points[0], points[1], "w1 V1", 1);
      if (frac(3) >= 1) t += libelleSegment(points[1], points[2], "w2 V2", 1);
      if (frac(4) >= 1) {
        t += libelleSegment(points[2], points[3], "w3 V3", -1);
        t += texte(pN.x - 6, pN.y + 24, "N'", ' font-weight="600"');
      }
      if (frac(5) >= 1) {
        t += texte(470, 160, "VN' = " + nombre(api, cx.module(cumul), 1) + " V à " + nombre(api, cx.argument(cumul), 1) + "°");
        VRES.forEach((v, k) => {
          t += texte(470, 186 + 22 * k, "V" + (k + 1) + "N' = " + nombre(api, cx.module(cx.moins(v, cumul)), 1) + " V");
        });
        t += texte(470, 270, "trait épais : tensions appliquées");
        t += texte(470, 290, "tirets épais : VN', de N vers N'");
      }
    }
    libelles.innerHTML = t;
  }

  const curseurs = api.sim.curseurs(
    "#e-millman-curseurs",
    [
      { id: "p1", libelle: "Récepteur de la phase 1", min: 0, max: 8, pas: 0.05, valeur: 4.6, unite: "kW", chiffres: 2 },
      { id: "p2", libelle: "Récepteur de la phase 2", min: 0, max: 8, pas: 0.05, valeur: 2.3, unite: "kW", chiffres: 2 },
      { id: "p3", libelle: "Récepteur de la phase 3", min: 0, max: 8, pas: 0.05, valeur: 1.15, unite: "kW", chiffres: 2 },
    ],
    (lues) => {
      etat.p = [lues.p1, lues.p2, lues.p3];
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-millman-lecteur", {
    de: 0,
    a: 6,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Construire le point étoile étape par étape",
    rappel(valeur) {
      etat.s = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    /* La figure s'affiche complète tant que l'apprenant n'a pas lancé la construction. */
    lecteur.suivre(6);
    etat.s = 6;
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : trouver le point étoile
   -------------------------------------------------------------------------- */

function construireDeplacement(racine, api) {
  const conteneur = racine.querySelector("#e-deplacement");
  if (!conteneur) return;

  const O = { x: 230, y: 200 };
  const K = 0.62;
  const KR = 3;
  const etat = { p: [4.6, 2.3, 1.15], lgRN: 2, solution: false, m: { x: O.x, y: O.y } };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 400",
    role: "img",
    "aria-label": "Triangle des tensions avec un point candidat M déplaçable, ses tensions vers les trois sommets, la flèche du courant résiduel à annuler, et la solution de Millman affichable",
  });
  const s = fondTriangle(svg, O, K, "fl-e-d", false);
  const vers = [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none" }));
  const residu = svgEl("path", { stroke: "currentColor", "stroke-width": 3.4, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-d)" });
  const croix = svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "none" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(...vers, croix, residu, libelles);
  conteneur.appendChild(svg);

  const rompu = () => etat.lgRN >= 1.999;
  const gN = () => (rompu() ? 0 : 1 / Math.pow(10, etat.lgRN));
  const G = () => etat.p.map((p) => ({ re: (p * 1000) / (VS * VS), im: 0 }));

  const valeurs = api.sim.valeurs("#e-deplacement-valeurs", [
    { id: "res", libelle: "Courant résiduel au point M", unite: "A", decimales: 2 },
    { id: "vm", libelle: "Distance de M au neutre N", unite: "V", decimales: 1 },
    { id: "v1", libelle: "V1M", unite: "V", decimales: 1 },
    { id: "v2", libelle: "V2M", unite: "V", decimales: 1 },
    { id: "v3", libelle: "V3M", unite: "V", decimales: 1 },
    { id: "vn", libelle: "Solution VN'", format: (v) => (Number.isFinite(v) ? nombre(api, v, 1) + " V" : "solution masquée") },
    { id: "tn", libelle: "Tensions des récepteurs en N'", format: (v) => (typeof v === "string" ? v : "solution masquée") },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const vM = { re: (etat.m.x - O.x) / K, im: -(etat.m.y - O.y) / K };
    const Y = G();
    const r = Y.reduce((acc, y, k) => cx.plus(acc, cx.fois(y, cx.moins(VRES[k], vM))), cx.echelle(vM, -gN()));
    s.forEach((p, k) => vers[k].setAttribute("d", "M" + etat.m.x.toFixed(1) + " " + etat.m.y.toFixed(1) + "L" + p.x.toFixed(1) + " " + p.y.toFixed(1)));
    const longueur = Math.min(150, KR * cx.module(r));
    const dir = cx.module(r) > 1e-9 ? cx.echelle(r, 1 / cx.module(r)) : ZERO;
    const bout = { x: etat.m.x + dir.re * longueur, y: etat.m.y - dir.im * longueur };
    residu.setAttribute("d", longueur > 4 ? segment(etat.m.x, etat.m.y, bout.x, bout.y, 0.1) : "");

    const sol = millman(Y, gN());
    const pS = versPx(O, K, sol.vn);
    if (etat.solution && !sol.indetermine) {
      croix.setAttribute(
        "d",
        "M" + (pS.x - 7).toFixed(1) + " " + (pS.y - 7).toFixed(1) + "L" + (pS.x + 7).toFixed(1) + " " + (pS.y + 7).toFixed(1) +
          "M" + (pS.x - 7).toFixed(1) + " " + (pS.y + 7).toFixed(1) + "L" + (pS.x + 7).toFixed(1) + " " + (pS.y - 7).toFixed(1) +
          "M" + (pS.x + 10).toFixed(1) + " " + pS.y.toFixed(1) + "A10 10 0 1 1 " + (pS.x - 10).toFixed(1) + " " + pS.y.toFixed(1) +
          "A10 10 0 1 1 " + (pS.x + 10).toFixed(1) + " " + pS.y.toFixed(1)
      );
    } else {
      croix.setAttribute("d", "");
    }

    let t = texte(460, 40, "Point candidat M", ' font-weight="600"');
    t += texte(460, 64, "neutre : " + (rompu() ? "rompu, GN = 0" : "RN = " + nombre(api, Math.pow(10, etat.lgRN), 2) + " Ω"));
    t += texte(460, 88, "résidu = Σ Gk (Vk - VM) - GN VM");
    t += texte(460, 112, "|résidu| = " + nombre(api, cx.module(r), 2) + " A");
    t += texte(460, 136, "échelle de la flèche : " + KR + " px par A");
    t += texte(460, 160, "(tronquée au-delà de 50 A)");
    t += texte(etat.m.x + 12, etat.m.y - 12, "M");
    if (cx.module(r) < 0.3) t += texte(460, 196, "résidu quasi nul : M est en N'");
    if (etat.solution && !sol.indetermine) {
      t += texte(pS.x + 14, pS.y + 20, "N'", ' font-weight="600"');
      t += texte(460, 230, "solution : VN' = " + nombre(api, cx.module(sol.vn), 1) + " V");
    }
    libelles.innerHTML = t;

    if (valeurs) {
      const tn = VRES.map((v) => nombre(api, cx.module(cx.moins(v, sol.vn)), 1)).join(" ; ") + " V";
      valeurs.maj({
        res: cx.module(r),
        vm: cx.module(vM),
        v1: cx.module(cx.moins(VRES[0], vM)),
        v2: cx.module(cx.moins(VRES[1], vM)),
        v3: cx.module(cx.moins(VRES[2], vM)),
        vn: etat.solution && !sol.indetermine ? cx.module(sol.vn) : NaN,
        tn: etat.solution && !sol.indetermine ? tn : NaN,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: 40, y: 20, largeur: 390, hauteur: 360 },
    valeur: { x: O.x, y: O.y },
    pas: 2,
    libelle: "Point candidat M dans le plan des tensions",
    format: (mesure) =>
      "M à " + nombre(api, (mesure.x - O.x) / K, 0) + " volts en réel et " + nombre(api, -(mesure.y - O.y) / K, 0) + " volts en imaginaire",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.m = { x: mesure.x, y: mesure.y };
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-deplacement-curseurs",
    [
      { id: "p1", libelle: "Récepteur résistif de la phase 1", min: 0, max: 8, pas: 0.05, valeur: 4.6, unite: "kW", chiffres: 2 },
      { id: "p2", libelle: "Récepteur résistif de la phase 2", min: 0, max: 8, pas: 0.05, valeur: 2.3, unite: "kW", chiffres: 2 },
      { id: "p3", libelle: "Récepteur résistif de la phase 3", min: 0, max: 8, pas: 0.05, valeur: 1.15, unite: "kW", chiffres: 2 },
      {
        id: "rn",
        libelle: "Résistance du neutre",
        min: -2,
        max: 2,
        pas: 0.05,
        valeur: 2,
        format: (v) => (v >= 1.999 ? "rompu" : api.util.formaterDecimal(Math.pow(10, v), Math.pow(10, v) < 1 ? 3 : 1) + " Ω"),
      },
      { id: "sol", libelle: "Solution de Millman", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (v > 0.5 ? "affichée" : "masquée") },
    ],
    (lues) => {
      etat.p = [lues.p1, lues.p2, lues.p3];
      etat.lgRN = lues.rn;
      etat.solution = lues.sol > 0.5;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   H. Animation : dégradation progressive du neutre de l'exemple
   -------------------------------------------------------------------------- */

function construireRupture(racine, api) {
  const conteneur = racine.querySelector("#h-rupture");
  if (!conteneur) return;

  const O = { x: 250, y: 190 };
  const K = 0.68;
  const ZO = { x: 560, y: 150 };
  const ZK = 3.4;
  const etat = { s: 1 };
  const rn = (s) => Math.pow(10, -2 + 5 * s);

  function calcul(s) {
    const r = rn(s);
    const m = millman(EX_H, s >= 0.9999 ? 0 : 1 / r);
    const v = VRES.map((vk) => cx.moins(vk, m.vn));
    const I = v.map((vk, k) => cx.fois(EX_H[k], vk));
    const p = I.reduce((acc, i, k) => acc + cx.fois(v[k], cx.conj(i)).re, 0);
    return { r, vn: m.vn, v, iN: s >= 0.9999 ? 0 : cx.module(m.vn) / r, p };
  }
  const trajectoire = [];
  for (let n = 0; n <= 200; n += 1) trajectoire.push(calcul(n / 200).vn);

  const svg = svgEl("svg", {
    viewBox: "0 0 760 380",
    role: "img",
    "aria-label": "Triangle des tensions de l'exemple et trajectoire du point commun N' quand la résistance du neutre croît de 0,01 à 1000 ohms, avec un agrandissement de la trajectoire autour du neutre",
  });
  const s = fondTriangle(svg, O, K, "fl-h-r", true);
  const cadreZoom = svgEl("g");
  cadreZoom.innerHTML =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7"><rect x="520" y="40" width="220" height="200" rx="6"/></g>' +
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.4"><path d="M530 ' + ZO.y + "H730M" + ZO.x + ' 50V230"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
    texte(528, 34, "agrandissement x 5 autour de N") + texte(ZO.x - 16, ZO.y + 16, "N") +
    '<circle cx="' + ZO.x + '" cy="' + ZO.y + '" r="3"/></g>';
  const trajet = svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "none" });
  const trajetZoom = svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "none" });
  const appliquees = [0, 1, 2].map(() => svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-h-r)" }));
  const point = svgEl("circle", { r: 5, fill: "currentColor", stroke: "none" });
  const pointZoom = svgEl("circle", { r: 5, fill: "currentColor", stroke: "none" });
  const finale = svgEl("circle", { r: 6, fill: "none", stroke: "currentColor", "stroke-width": 1.6 });
  const finaleZoom = svgEl("circle", { r: 6, fill: "none", stroke: "currentColor", "stroke-width": 1.6 });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(cadreZoom, trajet, trajetZoom, ...appliquees, finale, finaleZoom, point, pointZoom, libelles);
  conteneur.appendChild(svg);

  const pf = versPx(O, K, trajectoire[200]);
  const pfz = versPx(ZO, ZK, trajectoire[200]);
  finale.setAttribute("cx", pf.x.toFixed(1));
  finale.setAttribute("cy", pf.y.toFixed(1));
  finaleZoom.setAttribute("cx", pfz.x.toFixed(1));
  finaleZoom.setAttribute("cy", pfz.y.toFixed(1));

  const trace = api.sim.traceur("#h-rupture-trace", {
    titre: "Tensions appliquées aux récepteurs en fonction de la résistance du neutre",
    genre: "Animation",
    xTitre: "lg(RN / 1 Ω)",
    yTitre: "tension",
    yUnite: "V",
    xMin: -2,
    xMax: 3,
    yMin: 180,
    yMax: 265,
    ratio: 0.4,
    echantillons: 250,
    series: [
      { id: "v1", nom: "V1N', chauffage", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => cx.module(calcul((x + 2) / 5).v[0]) },
      { id: "v2", nom: "V2N', climatiseur", couleur: "serie-5", epaisseur: 2.6, fonction: (x) => cx.module(calcul((x + 2) / 5).v[1]) },
      { id: "v3", nom: "V3N', éclairage", couleur: "serie-3", epaisseur: 2.6, fonction: (x) => cx.module(calcul((x + 2) / 5).v[2]) },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 230, "230 V", true, [2, 4]);
      ligneH(c, repere, couleurs, 240, "240 V", false, [2, 4]);
      ligneV(c, repere, couleurs, -2 + 5 * etat.s, "RN atteinte");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#h-rupture-valeurs", [
    { id: "rn", libelle: "Résistance du neutre RN", format: (v) => (v >= 999 ? "1000 Ω, pratiquement rompu" : nombre(api, v, v < 1 ? 3 : 1) + " Ω") },
    { id: "vn", libelle: "Déplacement VN'", unite: "V", decimales: 2 },
    { id: "v1", libelle: "V1N', chauffage", unite: "V", decimales: 1 },
    { id: "v2", libelle: "V2N', climatiseur", unite: "V", decimales: 1 },
    { id: "v3", libelle: "V3N', éclairage", unite: "V", decimales: 1 },
    { id: "in", libelle: "Courant du neutre IN", unite: "A", decimales: 2 },
    { id: "p", libelle: "Puissance active reçue", unite: "kW", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const chemin = (o, k, n) => {
    let d = "";
    for (let i = 0; i <= n; i += 1) {
      const p = versPx(o, k, trajectoire[i]);
      d += (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1);
    }
    return d;
  };

  function dessiner() {
    const n = Math.round(etat.s * 200);
    const c = calcul(etat.s);
    trajet.setAttribute("d", chemin(O, K, n));
    trajetZoom.setAttribute("d", chemin(ZO, ZK, n));
    const p = versPx(O, K, c.vn);
    const pz = versPx(ZO, ZK, c.vn);
    point.setAttribute("cx", p.x.toFixed(1));
    point.setAttribute("cy", p.y.toFixed(1));
    pointZoom.setAttribute("cx", pz.x.toFixed(1));
    pointZoom.setAttribute("cy", pz.y.toFixed(1));
    s.forEach((sommet, k) => appliquees[k].setAttribute("d", segment(p.x, p.y, sommet.x, sommet.y)));
    let t = texte(pz.x + 8, pz.y - 8, "N'", ' font-weight="600"');
    t += texte(520, 268, "RN = " + (c.r >= 999 ? "1000 Ω" : nombre(api, c.r, c.r < 1 ? 3 : 1) + " Ω"));
    t += texte(520, 292, "VN' = " + nombre(api, cx.module(c.vn), 1) + " V");
    t += texte(520, 316, "cercle vide : neutre rompu");
    t += texte(520, 340, "trait moyen : trajectoire de N'");
    libelles.innerHTML = t;
    if (trace) trace.demanderRendu();
    if (valeurs) {
      valeurs.maj({
        rn: c.r,
        vn: cx.module(c.vn),
        v1: cx.module(c.v[0]),
        v2: cx.module(c.v[1]),
        v3: cx.module(c.v[2]),
        in: c.iN,
        p: c.p / 1000,
      });
    }
  }

  const lecteur = api.sim.lecteur("#h-rupture-lecteur", {
    de: 0,
    a: 1,
    duree: 14,
    boucle: false,
    auto: false,
    libelle: "Faire croître la résistance du neutre de 0,01 à 1000 ohms",
    rappel(valeur) {
      etat.s = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    /* La figure s'affiche complète tant que l'apprenant n'a pas lancé la dégradation. */
    lecteur.suivre(1);
    etat.s = 1;
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* Exercice fondamental 1 : trois résistances avec neutre. */
  const I3r = [cx.polaire(3000 / VS, 0), cx.polaire(2000 / VS, -120), cx.polaire(1000 / VS, 120)];
  const iN3r = I3r.reduce((acc, z) => cx.plus(acc, z), { ...ZERO });

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-neutre",
      titre: "Courant du neutre de trois récepteurs résistifs",
      niveau: "fondamental",
      enonce:
        "<p>Un réseau $230/400\\ \\mathrm{V}$ avec neutre alimente trois récepteurs résistifs couplés en étoile : $3\\ \\mathrm{kW}$ sur " +
        "$L_1$, $2\\ \\mathrm{kW}$ sur $L_2$ et $1\\ \\mathrm{kW}$ sur $L_3$, puissances données sous $230\\ \\mathrm{V}$. Quel est le " +
        "courant du neutre ?</p>",
      valeur: cx.module(iN3r),
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant du neutre $I_N$",
      etapes: [
        { texte: "Neutre parfait : chaque récepteur reçoit $230\\ \\mathrm{V}$. $I_1 = 3000/230 = 13{,}04\\ \\mathrm{A}$, $I_2 = 8{,}70\\ \\mathrm{A}$, $I_3 = 4{,}35\\ \\mathrm{A}$, en phase avec leurs tensions." },
        { texte: "Courants résistifs : $I_N^2 = I_1^2 + I_2^2 + I_3^2 - I_1 I_2 - I_2 I_3 - I_3 I_1 = 170{,}13 + 75{,}61 + 18{,}90 - 113{,}42 - 37{,}81 - 56{,}71$." },
        {
          texte: "$I_N^2 = 56{,}71\\ \\mathrm{A^2}$, soit $I_N = 7{,}53\\ \\mathrm{A}$, à $-30^\\circ$.",
          note: "Contrôle par les phaseurs : $13{,}04 + 8{,}70\\,a^2 + 4{,}35\\,a = 6{,}52 - j3{,}77\\ \\mathrm{A}$. La somme arithmétique, $26{,}1\\ \\mathrm{A}$, n'a aucun sens.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Trois courants résistifs et leur somme, le courant du neutre",
          unite: "A",
          somme: true,
          nomSomme: "IN = 7,53 A à -30 degrés",
          vecteurs: [
            { id: "i1", nom: "I1 = 13,04 A", amplitude: 13.04, phase: 0, couleur: "serie-1" },
            { id: "i2", nom: "I2 = 8,70 A", amplitude: 8.7, phase: -120, couleur: "serie-3" },
            { id: "i3", nom: "I3 = 4,35 A", amplitude: 4.35, phase: 120, couleur: "serie-4" },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-triangle",
      titre: "Triangle dont une branche est coupée",
      niveau: "fondamental",
      enonce:
        "<p>Un récepteur couplé en triangle, sous $400\\ \\mathrm{V}$ entre phases, a deux branches de $40\\ \\Omega$ résistives, entre " +
        "$L_1$ et $L_2$ et entre $L_2$ et $L_3$ ; la branche entre $L_3$ et $L_1$ est coupée. Quel est le courant de la ligne $L_2$ ?</p>",
      valeur: RAC3 * 10,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant de ligne $I_2$",
      etapes: [
        { texte: "Chaque branche reçoit sa tension composée : $J_{12} = 400/40 = 10\\ \\mathrm{A}$ en phase avec $\\underline{U}_{12}$, à $+30^\\circ$ ; $J_{23} = 10\\ \\mathrm{A}$ à $-90^\\circ$ ; $J_{31} = 0$." },
        { texte: "Loi des nœuds au sommet de $L_2$ : $\\underline{I}_2 = \\underline{J}_{23} - \\underline{J}_{12} = -j10 - (8{,}66 + j5) = -8{,}66 - j15\\ \\mathrm{A}$." },
        {
          texte: "$I_2 = \\sqrt{8{,}66^2 + 15^2} = 17{,}32\\ \\mathrm{A}$, à $-120^\\circ$.",
          note: "Les deux autres lignes ne portent qu'un courant de branche : $I_1 = J_{12} = 10\\ \\mathrm{A}$ et $I_3 = J_{23} = 10\\ \\mathrm{A}$. Le facteur $\\sqrt{3}$ n'apparaît que sur la ligne commune aux deux branches restantes.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "I2 = J23 + (-J12)",
          unite: "A",
          somme: true,
          nomSomme: "I2 = 17,32 A à -120 degrés",
          vecteurs: [
            { id: "j23", nom: "J23 = 10 A à -90 degrés", amplitude: 10, phase: -90, couleur: "serie-1" },
            { id: "mj12", nom: "-J12 = 10 A à -150 degrés", amplitude: 10, phase: -150, couleur: "serie-4", pointille: true },
          ],
        });
      },
    })
  );

  /* Exercice intermédiaire 1 : étoile sans neutre, R1 = R2 = 20, R3 = 10. */
  const solI1 = millman([{ re: 0.05, im: 0 }, { re: 0.05, im: 0 }, { re: 0.1, im: 0 }]);
  const v1I1 = cx.moins(VRES[0], solI1.vn);

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-sans-neutre",
      titre: "Tension d'un récepteur sans neutre",
      niveau: "intermédiaire",
      enonce:
        "<p>Trois résistances, $R_1 = R_2 = 20\\ \\Omega$ et $R_3 = 10\\ \\Omega$, sont couplées en étoile sur un réseau $230/400\\ \\mathrm{V}$, " +
        "sans neutre. Quelle tension reçoit la résistance $R_1$ ? Choisissez d'abord la méthode.</p>",
      valeur: cx.module(v1I1),
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension $V_{1N'}$",
      etapes: [
        { texte: "Méthode : étoile sans neutre, donc Millman. $G_1 = G_2 = 0{,}05\\ \\mathrm{S}$, $G_3 = 0{,}1\\ \\mathrm{S}$, $\\sum G = 0{,}2\\ \\mathrm{S}$." },
        { texte: "Numérateur : $0{,}05(\\underline{V}_1 + \\underline{V}_2) + 0{,}1\\,\\underline{V}_3 = 0{,}05(-\\underline{V}_3) + 0{,}1\\,\\underline{V}_3 = 0{,}05\\,\\underline{V}_3$, car $\\underline{V}_1 + \\underline{V}_2 + \\underline{V}_3 = 0$." },
        { texte: "$\\underline{V}_{N'} = 0{,}05\\,\\underline{V}_3 / 0{,}2 = 0{,}25\\,\\underline{V}_3 = 57{,}5\\ \\mathrm{V}$ à $120^\\circ$, soit $-28{,}75 + j49{,}80\\ \\mathrm{V}$." },
        {
          texte: "$\\underline{V}_{1N'} = 230 + 28{,}75 - j49{,}80 = 258{,}75 - j49{,}80$, soit $V_{1N'} = 263{,}5\\ \\mathrm{V}$.",
          note: "Par symétrie $V_{2N'} = 263{,}5\\ \\mathrm{V}$ et $V_{3N'} = 230 - 57{,}5 = 172{,}5\\ \\mathrm{V}$ : la résistance la plus faible, la phase la plus chargée, est en sous-tension, les deux autres en surtension de $14{,}6\\ \\%$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "V1N' = V1 + (-VN')",
          unite: "V",
          somme: true,
          nomSomme: "V1N' = 263,5 V",
          vecteurs: [
            { id: "v1", nom: "V1 = 230 V", amplitude: 230, phase: 0, couleur: "serie-1" },
            { id: "mvn", nom: "-VN' = 57,5 V à -60 degrés", amplitude: 57.5, phase: -60, couleur: "serie-5", pointille: true },
          ],
        });
      },
    })
  );

  /* Exercice intermédiaire 2 : neutre résistant, une seule charge. */
  const solI2 = millman([{ re: 0.1, im: 0 }, { ...ZERO }, { ...ZERO }], 2);
  const v2I2 = cx.moins(VRES[1], solI2.vn);

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-neutre-resistif",
      titre: "Un neutre résistant et une phase chargée seule",
      niveau: "intermédiaire",
      enonce:
        "<p>Sur un réseau $230/400\\ \\mathrm{V}$, un radiateur de $10\\ \\Omega$ est branché entre $L_1$ et le neutre ; le neutre, " +
        "connexion comprise, présente $0{,}5\\ \\Omega$. Les phases $L_2$ et $L_3$ ne portent que des appareils de consommation " +
        "négligeable, branchés sur le même neutre. Quelle tension reçoit un appareil branché entre $L_2$ et ce neutre ?</p>",
      valeur: cx.module(v2I2),
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension $V_{2N'}$",
      etapes: [
        { texte: "Millman avec neutre : $\\underline{V}_{N'} = \\dfrac{G_1\\,\\underline{V}_1}{G_1 + G_N} = \\dfrac{0{,}1 \\times 230}{0{,}1 + 2} = 10{,}95\\ \\mathrm{V}$, en phase avec $\\underline{V}_1$." },
        { texte: "Le radiateur reçoit $230 - 10{,}95 = 219{,}05\\ \\mathrm{V}$ : le neutre agit comme une résistance en série, diviseur $10/10{,}5$." },
        {
          texte: "$\\underline{V}_{2N'} = \\underline{V}_2 - \\underline{V}_{N'} = -115 - 10{,}95 - j199{,}19 = -125{,}95 - j199{,}19$, soit $V_{2N'} = 235{,}7\\ \\mathrm{V}$.",
          note: "Une phase chargée seule fait monter la tension des deux autres, sans aucune rupture : $+2{,}5\\ \\%$ ici, avec seulement $0{,}5\\ \\Omega$ de neutre. Le même calcul donne $V_{3N'} = 235{,}7\\ \\mathrm{V}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Tensions de la phase chargée et des phases libres en fonction de la résistance du neutre",
          xTitre: "RN",
          xUnite: "Ω",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 2,
          yMin: 180,
          yMax: 260,
          series: [
            { id: "v1", nom: "V1N', radiateur", couleur: "serie-1", epaisseur: 2.6, fonction: (r) => cx.module(cx.moins(VRES[0], millman([{ re: 0.1, im: 0 }, ZERO, ZERO], r > 0 ? 1 / r : 1e9).vn)) },
            { id: "v2", nom: "V2N', phase libre", couleur: "serie-5", epaisseur: 2.6, fonction: (r) => cx.module(cx.moins(VRES[1], millman([{ re: 0.1, im: 0 }, ZERO, ZERO], r > 0 ? 1 / r : 1e9).vn)) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 230, "230 V", true, [2, 4]);
            marquerPoint(c, repere, couleurs, 0.5, 235.67, "235,7 V", false);
            marquerPoint(c, repere, couleurs, 0.5, 219.05, "219,0 V", false);
          },
        });
      },
    })
  );

  /* Exercice avancé : résistance maximale du neutre. */
  const g1 = 6000 / (VS * VS);
  const g2 = 2000 / (VS * VS);
  const gNmin = (g1 - g2) * VS / 10 - (g1 + 2 * g2);
  const rnMax = 1 / gNmin;
  const tensionsAvance = (r) => {
    const m = millman([{ re: g1, im: 0 }, { re: g2, im: 0 }, { re: g2, im: 0 }], r > 0 ? 1 / r : 1e9);
    return [cx.module(cx.moins(VRES[0], m.vn)), cx.module(cx.moins(VRES[1], m.vn))];
  };

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-dimension",
      titre: "Résistance maximale admissible d'un neutre",
      niveau: "avancé",
      enonce:
        "<p>Un tableau divisionnaire alimente sur $L_1$ des récepteurs résistifs de $6\\ \\mathrm{kW}$, et sur $L_2$ et $L_3$ $2\\ \\mathrm{kW}$ " +
        "chacun, puissances sous $230\\ \\mathrm{V}$. La source et les conducteurs de phase sont supposés parfaits. Le cahier des " +
        "charges impose que chaque récepteur reçoive entre $220$ et $240\\ \\mathrm{V}$. Quelle résistance maximale peut présenter le " +
        "neutre, conducteur et connexions compris ?</p>",
      valeur: rnMax,
      unite: "Ω",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "Résistance maximale $R_N$",
      etapes: [
        { texte: "Conductances : $G_1 = 6000/230^2 = 0{,}11342\\ \\mathrm{S}$, $G_2 = G_3 = 0{,}03781\\ \\mathrm{S}$." },
        { texte: "Comme $G_2 = G_3$ et $\\underline{V}_2 + \\underline{V}_3 = -\\underline{V}_1$, le numérateur de Millman vaut $(G_1 - G_2)\\,230 = 17{,}39\\ \\mathrm{A}$, réel : $V_{N'} = \\dfrac{17{,}39}{G_1 + 2G_2 + G_N}$, dirigé vers $\\underline{V}_1$." },
        { texte: "Contrainte basse : $V_{1N'} = 230 - V_{N'} \\geq 220\\ \\mathrm{V}$, soit $V_{N'} \\leq 10\\ \\mathrm{V}$ et $G_N \\geq 17{,}39/10 - 0{,}18904 = 1{,}5501\\ \\mathrm{S}$." },
        { texte: "D'où $R_N \\leq 1/1{,}5501 = 0{,}645\\ \\Omega$. Vérification de la contrainte haute : $\\underline{V}_{2N'} = \\underline{V}_2 - 10$, de module $\\sqrt{125^2 + 199{,}19^2} = 235{,}2\\ \\mathrm{V} \\leq 240\\ \\mathrm{V}$." },
        {
          texte: "Résultat : $R_N \\leq 0{,}645\\ \\Omega$ ; c'est la phase chargée qui dimensionne, la contrainte de $240\\ \\mathrm{V}$ seule tolérerait $1{,}37\\ \\Omega$.",
          note: "Neutre rompu, la même installation donnerait $138\\ \\mathrm{V}$ sur $L_1$ et $287\\ \\mathrm{V}$ sur $L_2$ et $L_3$. En pratique, il faudrait ajouter la chute des conducteurs de phase et la tolérance de la source : la marge réelle est plus faible.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Tensions des récepteurs en fonction de la résistance du neutre",
          xTitre: "RN",
          xUnite: "Ω",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 2,
          yMin: 200,
          yMax: 250,
          series: [
            { id: "v1", nom: "V1N', phase de 6 kW", couleur: "serie-1", epaisseur: 2.6, fonction: (r) => tensionsAvance(r)[0] },
            { id: "v2", nom: "V2N' = V3N', phases de 2 kW", couleur: "serie-5", epaisseur: 2.6, fonction: (r) => tensionsAvance(r)[1] },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 220, "220 V", true, [2, 4]);
            ligneH(c, repere, couleurs, 240, "240 V", false, [2, 4]);
            ligneV(c, repere, couleurs, rnMax, "RN max = 0,645 Ω");
            marquerPoint(c, repere, couleurs, rnMax, 220, "", false);
          },
        });
      },
    })
  );

  /* Diagnostic : rupture du neutre du départ de l'atelier, machines arrêtées. */
  const yCE = admittance(3000);
  const yEC = admittance(600, 0.95, true);
  const diag = millman([yCE, { ...ZERO }, yEC]);
  const vDiag = VRES.map((v) => cx.moins(v, diag.vn));

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Diagnostic : des éclairages détruits dans l'atelier",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Un soir, machines arrêtées, tous les luminaires à LED de l'atelier, alimentés par $L_3$, tombent en panne et le chauffe-eau, " +
        "sur $L_1$, ne chauffe presque plus. Au bornier de l'atelier, on mesure $400\\ \\mathrm{V}$ entre phases, mais $70\\ \\mathrm{V}$ " +
        "entre $L_1$ et le neutre, $352\\ \\mathrm{V}$ entre $L_2$ et le neutre et $331\\ \\mathrm{V}$ entre $L_3$ et le neutre. Au tableau " +
        "général, les trois tensions simples valent $230\\ \\mathrm{V}$. Quelles affirmations sont exactes ?</p>",
      multiple: true,
      options: [
        { texte: "Le neutre du départ est interrompu ou très résistant entre le tableau général et l'atelier.", juste: true },
        { texte: "Un fusible de phase du départ a fondu." },
        { texte: "Le transformateur du site présente un défaut." },
        { texte: "Une tension de l'ordre de $160\\ \\mathrm{V}$ doit apparaître entre le neutre du bornier de l'atelier et le conducteur de protection.", juste: true },
        { texte: "Il suffit de remplacer les luminaires et de remettre le départ sous tension." },
      ],
      etapes: [
        { texte: "Tensions composées correctes et tensions simples à $230\\ \\mathrm{V}$ au tableau : la source et les phases sont saines. Un fusible de phase fondu ferait chuter des tensions composées." },
        { texte: "Tensions simples très différentes au bornier : le point commun des récepteurs s'est déplacé, signature d'une rupture du neutre en aval du tableau." },
        { texte: "Avec le chauffe-eau sur $L_1$ et l'éclairage sur $L_3$ seuls en service, Millman donne $V_{N'} = 163{,}6\\ \\mathrm{V}$, puis $69{,}8$, $352{,}4$ et $331{,}5\\ \\mathrm{V}$ : exactement les mesures." },
        {
          texte: "Le neutre du bornier, isolé de la source, est à environ $160\\ \\mathrm{V}$ de la terre. Remettre sous tension sans réparer le neutre détruirait les luminaires neufs.",
          note: "Méthode : comparer tensions composées et simples, en amont et en aval ; mesurer la tension entre neutre et conducteur de protection ; contrôler serrage et échauffement des connexions du neutre.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Tensions appliquées après rupture du neutre, machines arrêtées",
          unite: "V",
          vecteurs: [
            { id: "vn", nom: "VN'", amplitude: cx.module(diag.vn), phase: cx.argument(diag.vn), couleur: "serie-2", pointille: true },
            { id: "v1", nom: "V1N', chauffe-eau", amplitude: cx.module(vDiag[0]), phase: cx.argument(vDiag[0]), couleur: "serie-1" },
            { id: "v2", nom: "V2N', prise", amplitude: cx.module(vDiag[1]), phase: cx.argument(vDiag[1]), couleur: "serie-4" },
            { id: "v3", nom: "V3N', LED", amplitude: cx.module(vDiag[2]), phase: cx.argument(vDiag[2]), couleur: "serie-5" },
          ],
        });
      },
    })
  );

  const bary = millman([{ re: 3, im: 0 }, { re: 1, im: 0 }, { re: 1, im: 0 }]);

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-conceptuel",
      titre: "Pourquoi la phase la moins chargée monte",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi, après la rupture du neutre d'une étoile déséquilibrée, ce sont les récepteurs les moins " +
        "chargés qui subissent la surtension, et non le plus chargé.</p>",
      motsCles: [
        ["noeud", "somme", "nulle", "courant", "kirchhoff"],
        ["barycentre", "poids", "admittance", "conductance", "attire", "raide", "ressort"],
        ["eloign", "loin", "distance", "sommet", "rapproch", "proche"],
      ],
      minimum: 2,
      exemple: "Trois phrases : la condition au point commun, le rôle des admittances, la conséquence sur les distances aux sommets.",
      etapes: [
        { texte: "Sans neutre, aucun courant ne sort du point commun : la somme des courants des trois récepteurs y est nulle, et son potentiel s'ajuste pour qu'elle le soit." },
        { texte: "Ce potentiel est la moyenne des tensions simples pondérée par les admittances : un récepteur très chargé, de forte admittance, pèse lourd et attire le point commun vers le sommet de sa phase." },
        {
          texte: "Le point commun se rapproche du sommet de la phase chargée, dont la tension baisse, et s'éloigne des deux autres sommets, dont les tensions dépassent la tension simple.",
          note: "Pour des résistances, $\\underline{V}_{N'}$ est exactement le barycentre des sommets pondérés par les conductances.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Phase 1 trois fois plus chargée : le point commun est attiré vers V1",
          unite: "V",
          vecteurs: [
            { id: "vn", nom: "VN'", amplitude: cx.module(bary.vn), phase: cx.argument(bary.vn), couleur: "serie-2", pointille: true },
            { id: "v1", nom: "V1N'", amplitude: cx.module(cx.moins(VRES[0], bary.vn)), phase: cx.argument(cx.moins(VRES[0], bary.vn)), couleur: "serie-1" },
            { id: "v2", nom: "V2N'", amplitude: cx.module(cx.moins(VRES[1], bary.vn)), phase: cx.argument(cx.moins(VRES[1], bary.vn)), couleur: "serie-4" },
            { id: "v3", nom: "V3N'", amplitude: cx.module(cx.moins(VRES[2], bary.vn)), phase: cx.argument(cx.moins(VRES[2], bary.vn)), couleur: "serie-5" },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

function dessinTriangleQuiz() {
  const o = { x: 200, y: 130 };
  const k = 0.45;
  const s = VRES.map((v) => versPx(o, k, v));
  let d = '<g stroke="currentColor" stroke-width="1.2" fill="none" stroke-dasharray="6 5"><path d="M' +
    s[0].x.toFixed(1) + " " + s[0].y.toFixed(1) + "L" + s[1].x.toFixed(1) + " " + s[1].y.toFixed(1) + "L" + s[2].x.toFixed(1) + " " + s[2].y.toFixed(1) + 'Z"/></g>';
  d += '<g stroke="currentColor" stroke-width="1.4" fill="none">';
  for (const p of s) d += '<path d="M' + o.x + " " + o.y + "L" + p.x.toFixed(1) + " " + p.y.toFixed(1) + '"/>';
  d += "</g>";
  d += '<g fill="currentColor" stroke="none"><circle cx="' + o.x + '" cy="' + o.y + '" r="3.5"/>';
  d += '<circle cx="252" cy="130" r="6"/><circle cx="150" cy="130" r="6"/><circle cx="182" cy="76" r="6"/></g>';
  d += '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';
  d += texte(s[0].x + 8, s[0].y + 4, "V1") + texte(s[1].x - 24, s[1].y + 14, "V2") + texte(s[2].x - 24, s[2].y - 4, "V3");
  d += texte(o.x - 6, o.y + 18, "N");
  d += texte(258, 122, "a") + texte(132, 124, "b") + texte(188, 66, "c");
  d += texte(330, 60, "R1 = 10 Ω") + texte(330, 80, "R2 = R3 = 40 Ω") + texte(330, 100, "neutre rompu");
  d += "</g>";
  return d;
}

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Une charge étoile très déséquilibrée est alimentée par un réseau dont le neutre est parfait. Quelle tension reçoit le récepteur de la phase 2 ?</p>",
        options: ["La tension simple, $230\\ \\mathrm{V}$, quelle que soit la charge des autres phases", "Une tension qui dépend des autres récepteurs", "La tension composée, $400\\ \\mathrm{V}$", "Une tension nulle si la phase 1 est la plus chargée"],
        bonnes: [0],
        explication: "Avec un neutre parfait, $\\underline{V}_{N'} = 0$ : chaque phase est un circuit monophasé indépendant sous sa tension simple.",
        resume: "Rôle du neutre parfait",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Si les trois courants de ligne ont la même valeur efficace, le neutre ne porte aucun courant.</p>",
        reponse: false,
        explication: "Il faut aussi des déphasages identiques par rapport à chaque tension simple : trois courants de $10\\ \\mathrm{A}$ dont un seul déphasé de $36{,}87^\\circ$ donnent $6{,}32\\ \\mathrm{A}$ dans le neutre.",
        resume: "Intensités égales ne suffisent pas",
      },
      {
        type: "calcul",
        enonce: "<p>Neutre relié : deux récepteurs résistifs de $2\\ \\mathrm{kW}$ sous $230\\ \\mathrm{V}$ sur $L_1$ et $L_2$, rien sur $L_3$. Quel est le courant du neutre, en ampères ?</p>",
        valeur: 2000 / VS,
        unite: "A",
        tolerance: 0.01,
        chiffres: 2,
        explication: "Deux courants de $8{,}70\\ \\mathrm{A}$ décalés de $120^\\circ$ ont une somme de même module : $I_N = 8{,}70\\ \\mathrm{A}$.",
        resume: "Deux phases chargées sur trois",
      },
      {
        type: "calcul",
        enonce: "<p>Étoile sans neutre : la résistance de la phase 1 est coupée, celles des phases 2 et 3 sont égales. Quelle tension reçoit chacune d'elles sur un réseau $230/400\\ \\mathrm{V}$, en volts ?</p>",
        valeur: (RAC3 * VS) / 2,
        unite: "V",
        tolerance: 0.01,
        chiffres: 1,
        explication: "Les deux résistances sont en série sous $U_{23} = 398{,}4\\ \\mathrm{V}$ : chacune en reçoit la moitié, $199{,}2\\ \\mathrm{V}$.",
        resume: "Deux récepteurs en série",
      },
      {
        type: "qcm",
        enonce: "<p>Après la rupture du neutre d'une étoile déséquilibrée de récepteurs résistifs, quel récepteur subit la plus forte tension ?</p>",
        options: ["Le moins chargé", "Le plus chargé", "Celui de la phase 1, toujours", "Aucun : les trois reçoivent $230\\ \\mathrm{V}$"],
        bonnes: [0],
        explication: "Le point commun est attiré vers le sommet de la phase la plus chargée et s'éloigne de celui de la phase la moins chargée.",
        resume: "Surtension après rupture",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Dans une charge triangle déséquilibrée alimentée par une source parfaite, chaque branche reçoit sa tension composée, quel que soit le déséquilibre.</p>",
        reponse: true,
        explication: "Chaque branche est branchée directement entre deux phases : il n'y a pas de point commun à déplacer. Seuls les courants de ligne perdent le rapport $\\sqrt{3}$.",
        resume: "Triangle déséquilibré",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi ne faut-il jamais couper ou protéger le neutre seul, sans les phases ?</p>",
        motsCles: [["rupture", "coupure", "interromp", "ouvert"], ["surtension", "deplac", "point commun", "point etoile", "tension"]],
        minimum: 2,
        explication: "Ouvrir le neutre seul crée une rupture de neutre : le point commun des récepteurs monophasés se déplace et les phases peu chargées passent en surtension, pendant que les phases restent sous tension.",
        resume: "Ne jamais couper le neutre seul",
      },
      {
        type: "schema",
        enonce: "<p>Le neutre est rompu ; la phase 1 porte $10\\ \\Omega$, les phases 2 et 3 $40\\ \\Omega$ chacune. Lequel des trois points marqués est le point commun $N'$ ?</p>",
        consigne: "Cliquez sur le point correct.",
        viewBox: "0 0 520 260",
        description: "Triangle des tensions avec le neutre N au centre et trois points candidats : a vers le sommet V1, b vers le côté V2 V3, c vers le sommet V3",
        dessin: dessinTriangleQuiz(),
        zones: [
          { x: 232, y: 110, largeur: 40, hauteur: 40, etiquette: "a", juste: true },
          { x: 130, y: 110, largeur: 40, hauteur: 40, etiquette: "b" },
          { x: 162, y: 56, largeur: 40, hauteur: 40, etiquette: "c" },
        ],
        explication: "La phase 1, de plus forte conductance, attire le point commun vers son sommet : $\\underline{V}_{N'} = (0{,}1 - 0{,}025) \\times 230 / 0{,}15 = 115\\ \\mathrm{V}$ dans la direction de $\\underline{V}_1$.",
        resume: "Position du point commun",
      },
      {
        type: "calcul",
        enonce: "<p>Même situation : $R_1 = 10\\ \\Omega$, $R_2 = R_3 = 40\\ \\Omega$, neutre rompu, réseau $230/400\\ \\mathrm{V}$. Que vaut le déplacement $V_{N'}$ du point commun, en volts ?</p>",
        valeur: ((0.1 - 0.025) * VS) / 0.15,
        unite: "V",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$\\sum G\\,\\underline{V} = 0{,}1 \\times 230 + 0{,}025(\\underline{V}_2 + \\underline{V}_3) = (0{,}1 - 0{,}025) \\times 230 = 17{,}25\\ \\mathrm{A}$ et $\\sum G = 0{,}15\\ \\mathrm{S}$ : $V_{N'} = 115\\ \\mathrm{V}$.",
        resume: "Millman résistif",
      },
      {
        type: "qcm",
        enonce: "<p>Combien de wattmètres suffisent pour mesurer la puissance active d'une étoile déséquilibrée dont le neutre est rompu ?</p>",
        options: ["Deux", "Trois", "Un, multiplié par trois", "Aucun ne convient"],
        bonnes: [0],
        explication: "Sans neutre, $i_1 + i_2 + i_3 = 0$ : la méthode des deux wattmètres est exacte, quel que soit le déséquilibre.",
        resume: "Mesure sans neutre",
      },
    ],
    { titre: "Dix questions sur les charges triphasées déséquilibrées" }
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
      { categorie: "Neutre", question: "Que porte le conducteur neutre d'une étoile déséquilibrée ?", reponse: "La somme des phaseurs des courants de ligne, $\\underline{I}_N = \\underline{I}_1 + \\underline{I}_2 + \\underline{I}_3$, et non la somme des valeurs efficaces." },
      { categorie: "Neutre parfait", question: "Quelle tension reçoit chaque récepteur si le neutre est parfait ?", reponse: "Sa tension simple, indépendamment des autres phases : chaque phase se résout comme un circuit monophasé." },
      { categorie: "Résistif", question: "Comment calculer $I_N$ pour trois courants en phase avec leurs tensions ?", reponse: "$I_N = \\sqrt{I_1^2 + I_2^2 + I_3^2 - I_1 I_2 - I_2 I_3 - I_3 I_1}$." },
      { categorie: "Millman", question: "Où se place le point commun d'une étoile sans neutre ?", reponse: "$\\underline{V}_{N'} = \\sum\\underline{Y}_k\\underline{V}_k / \\sum\\underline{Y}_k$ ; avec un neutre résistant, on ajoute $\\underline{Y}_N$ au dénominateur seulement." },
      { categorie: "Barycentre", question: "Quelle image donne la formule de Millman pour des résistances ?", reponse: "Le barycentre des sommets du triangle des tensions, pondérés par les conductances : la phase la plus chargée attire le point commun." },
      { categorie: "Rupture", question: "Qui subit la surtension après rupture du neutre ?", reponse: "Les récepteurs les moins chargés ; le plus chargé voit sa tension baisser." },
      { categorie: "Triangle", question: "Comment obtenir les courants de ligne d'un triangle déséquilibré ?", reponse: "$\\underline{J}_{kl} = \\underline{U}_{kl}/\\underline{Z}_{kl}$, puis $\\underline{I}_1 = \\underline{J}_{12} - \\underline{J}_{31}$ et permutations ; le rapport $\\sqrt{3}$ ne vaut plus." },
      { categorie: "Puissance", question: "Pourquoi deux wattmètres suffisent-ils sur une étoile déséquilibrée sans neutre ?", reponse: "La somme des courants est nulle, donc $\\sum\\underline{V}_{kN'}\\underline{I}_k^* = \\sum\\underline{V}_k\\underline{I}_k^*$ et la méthode d'Aron reste exacte." },
      { categorie: "Diagnostic", question: "Quels symptômes signent une rupture de neutre ?", reponse: "Tensions composées normales, tensions simples très inégales en aval, appareils détruits sur une phase, appareils faibles sur une autre, tension entre neutre et terre." },
      {
        categorie: "Industriel",
        question: "Quelle répartition le site a-t-il retenue pour l'atelier de maintenance ?",
        reponse: "Chauffe-eau sur $L_1$, machines sur $L_2$, éclairage sur $L_3$ : neutre à $3{,}40\\ \\mathrm{A}$ au lieu de $27{,}4\\ \\mathrm{A}$, avec surveillance des tensions simples.",
        rappel: "Permuter machines et éclairage porterait le neutre à 18,76 A.",
      },
    ],
    { titre: "Dix cartes sur les charges triphasées déséquilibrées" }
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
        enonce: "<p>Cette séance. Neutre relié, seule la phase 1 est chargée et appelle $10\\ \\mathrm{A}$. Quel est le courant du neutre, en ampères ?</p>",
        valeur: 10,
        unite: "A",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$\\underline{I}_N = \\underline{I}_1 + 0 + 0$ : le neutre porte tout le courant de la phase, comme un départ monophasé.",
        resume: "Une seule phase chargée",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Cette séance. La rupture du neutre d'un tableau peut porter certaines prises nettement au-dessus de $230\\ \\mathrm{V}$.</p>",
        reponse: true,
        explication: "Le point commun s'éloigne des phases peu chargées, dont la tension peut approcher la tension composée.",
        resume: "Danger de la rupture du neutre",
      },
      {
        type: "qcm",
        enonce: "<p>Cette séance. Quelle expression donne le potentiel du point commun d'une étoile avec un neutre d'admittance $\\underline{Y}_N$ ?</p>",
        options: [
          "$\\sum\\underline{Y}_k\\underline{V}_k / \\left(\\sum\\underline{Y}_k + \\underline{Y}_N\\right)$",
          "$\\left(\\sum\\underline{Y}_k\\underline{V}_k + \\underline{Y}_N\\right) / \\sum\\underline{Y}_k$",
          "$\\sum\\underline{V}_k / 3$",
          "$\\sum\\underline{Z}_k\\underline{V}_k / \\sum\\underline{Z}_k$",
        ],
        bonnes: [0],
        explication: "Le neutre de la source est au potentiel nul : sa branche n'apporte rien au numérateur et ajoute $\\underline{Y}_N$ au dénominateur.",
        resume: "Formule de Millman avec neutre",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/puissance-en-triphase\">Puissance en triphasé</a>. Sur un récepteur déséquilibré à trois fils, deux wattmètres lisent $5{,}2\\ \\mathrm{kW}$ et $1{,}8\\ \\mathrm{kW}$. Quelle puissance active reçoit-il, en kilowatts ?</p>",
        valeur: 7,
        unite: "kW",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$P = W_1 + W_2 = 7\\ \\mathrm{kW}$, exact sans aucune hypothèse d'équilibre ; seul $Q = \\sqrt{3}(W_1 - W_2)$ supposerait l'équilibre.",
        resume: "Somme des deux lectures",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Cours <a href=\"#/cours/puissance-en-triphase\">Puissance en triphasé</a>. La méthode des deux wattmètres reste exacte sur un réseau à quatre fils dont le neutre porte un courant.</p>",
        reponse: false,
        explication: "Elle suppose $i_1 + i_2 + i_3 = 0$ ; avec un courant de neutre, elle commet l'erreur $-\\mathrm{Re}(\\underline{V}_r\\underline{I}_N^*)$, et il faut trois wattmètres.",
        resume: "Limite de la méthode d'Aron",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/impedances-en-regime-sinusoidal\">Impédances en régime sinusoïdal</a>. Quelle est la conductance, en siemens, de l'impédance $3 + j4\\ \\Omega$ ?</p>",
        valeur: 0.12,
        unite: "S",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$\\underline{Y} = (3 - j4)/25 = 0{,}12 - j0{,}16\\ \\mathrm{S}$ : $G = 0{,}12\\ \\mathrm{S}$, et non $1/3$.",
        resume: "Conductance d'une impédance",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/theoremes-de-thevenin-norton-et-superposition\">Théorèmes de Thévenin, Norton et superposition</a>. Un nœud est relié à $24\\ \\mathrm{V}$ par $1\\ \\Omega$, à $12\\ \\mathrm{V}$ par $1\\ \\Omega$ et à la masse par $2\\ \\Omega$. Quel est son potentiel, en volts ?</p>",
        valeur: (24 + 12) / (1 + 1 + 0.5),
        unite: "V",
        tolerance: 0.01,
        chiffres: 1,
        explication: "Millman : $(24/1 + 12/1 + 0/2)/(1 + 1 + 0{,}5) = 36/2{,}5 = 14{,}4\\ \\mathrm{V}$.",
        resume: "Millman en continu",
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
    titre: "Où en suis-je sur les charges triphasées déséquilibrées ?",
  });
  if (auto) ressources.push(auto);
}
