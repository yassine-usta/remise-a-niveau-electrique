/* ==========================================================================
   cours/impedances-en-regime-sinusoidal/cours.js
   Impédances en régime sinusoïdal.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;

/* Réseau du site : 230/400 V, 50 Hz. */
const W50 = 2 * Math.PI * 50;

/* Exemple de la section H. */
const EX = { u: 230, r1: 2, r2: 20, l: 0.05, c: 100e-6 };

/* Résistivité du cuivre à 70 °C, ohm mm² par m, et réactance linéique supposée, ohm par m. */
const RHO70 = 0.01724 * (1 + 0.00393 * 50);
const XLIN = 0.08e-3;
const SECTIONS = [2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];

/* --------------------------------------------------------------------------
   Utilitaires : complexes et SVG
   -------------------------------------------------------------------------- */

function cx(re, im = 0) {
  return { re, im };
}
function add(a, b) {
  return cx(a.re + b.re, a.im + b.im);
}
function mul(a, b) {
  return cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}
function div(a, b) {
  const d = b.re * b.re + b.im * b.im;
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}
function inv(a) {
  return div(cx(1, 0), a);
}
function mod(a) {
  return Math.hypot(a.re, a.im);
}
function arg(a) {
  return Math.atan2(a.im, a.re) / DEG;
}
function polaire(module, degres) {
  return cx(module * Math.cos(degres * DEG), module * Math.sin(degres * DEG));
}
/** Rotation d'un complexe d'un angle en degrés. */
function tourner(a, degres) {
  return mul(a, polaire(1, degres));
}

/** Grandeurs de l'exemple de la section H. */
function exemple() {
  const zrl = cx(EX.r2, EX.l * W50);
  const zc = cx(0, -1 / (EX.c * W50));
  const zp = inv(add(inv(zrl), inv(zc)));
  const z = add(cx(EX.r1, 0), zp);
  const i = div(cx(EX.u, 0), z);
  const ur1 = mul(cx(EX.r1, 0), i);
  const up = mul(zp, i);
  const irl = div(up, zrl);
  const ic = div(up, zc);
  const ur2 = mul(cx(EX.r2, 0), irl);
  const ul = mul(cx(0, EX.l * W50), irl);
  return { zrl, zc, zp, z, i, ur1, up, irl, ic, ur2, ul, u: cx(EX.u, 0) };
}

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function nombre(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
}

function borner(valeur, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, valeur));
}

function marqueur(id) {
  return (
    '<marker id="' + id + '" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto-start-reverse">' +
    '<path d="M0 0 8 4 0 8Z" fill="currentColor"/></marker>'
  );
}

/** Arc de cercle, angles mathématiques en degrés (sens trigonométrique positif). */
function cheminArc(cx0, cy0, r, a1, a2) {
  if (Math.abs(a2 - a1) < 0.5) return "";
  const x1 = cx0 + r * Math.cos(a1 * DEG);
  const y1 = cy0 - r * Math.sin(a1 * DEG);
  const x2 = cx0 + r * Math.cos(a2 * DEG);
  const y2 = cy0 - r * Math.sin(a2 * DEG);
  const grand = Math.abs(a2 - a1) > 180 ? 1 : 0;
  const sens = a2 > a1 ? 0 : 1;
  return "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "A" + r + " " + r + " 0 " + grand + " " + sens + " " + x2.toFixed(1) + " " + y2.toFixed(1);
}

/** Segment raccourci au bout, pour laisser la place à la pointe de flèche. */
function segment(x1, y1, x2, y2, retrait = 3) {
  const l = Math.hypot(x2 - x1, y2 - y1);
  if (l < 0.5) return "";
  if (l < retrait + 1) return "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + x2.toFixed(1) + " " + y2.toFixed(1);
  const k = (l - retrait) / l;
  return "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + (x1 + (x2 - x1) * k).toFixed(1) + " " + (y1 + (y2 - y1) * k).toFixed(1);
}

function signeJ(api, b, decimales) {
  return (b < 0 ? " - j" : " + j") + nombre(api, Math.abs(b), decimales);
}

/** Ligne verticale en tirets sur un tracé, avec son libellé. */
function ligneV(c, repere, couleurs, x, texte) {
  const px = repere.versX(x);
  c.save();
  c.setLineDash([5, 5]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(px, repere.boite.y);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  c.setLineDash([]);
  if (texte) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.6;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(texte, px + (aGauche ? -6 : 6), repere.boite.y + 14);
  }
  c.restore();
}

/** Ligne horizontale en tirets sur un tracé, avec son libellé. */
function ligneH(c, repere, couleurs, y, texte, enDessous) {
  const py = repere.versY(y);
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.setLineDash([7, 5]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.3;
  c.beginPath();
  c.moveTo(repere.boite.x, py);
  c.lineTo(repere.boite.x + repere.boite.l, py);
  c.stroke();
  c.setLineDash([]);
  if (texte) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    c.textAlign = "right";
    c.fillText(texte, repere.boite.x + repere.boite.l - 4, py + (enDessous ? 14 : -6));
  }
  c.restore();
}

function marquerPoint(c, repere, couleurs, x, y, texte, aGauche) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.fillStyle = couleurs.texte;
  c.beginPath();
  c.arc(px, py, 4.5, 0, Math.PI * 2);
  c.fill();
  if (texte) {
    c.font = POLICE;
    const gauche = aGauche != null ? aGauche : px > repere.boite.x + repere.boite.l * 0.6;
    c.textAlign = gauche ? "right" : "left";
    c.fillText(texte, px + (gauche ? -8 : 8), py - 8);
  }
  c.restore();
}

/** Tracé de correction animé par le moteur. */
function traceCorrection(moteur, conteneur, options) {
  const traceur = moteur.sim.traceur(conteneur, {
    genre: "Correction visuelle",
    xTitre: "t",
    xUnite: "ms",
    ratio: 0.42,
    echantillons: 600,
    ...options,
  });
  if (traceur) ressources.push(traceur);
  return traceur;
}

/** Diagramme de phaseurs figé pour une correction. */
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

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeursAnimation = [];

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireComposants(racine, api);
  construireAdmittance(racine, api);
  construirePlan(racine, api);
  construireFresnelExemple(racine, api);
  construireChute(racine, api);
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
    ["#e-triangle-figure svg", 1.6],
    ["#f-schema-principal svg", 2.2],
    ["#h-circuit-figure svg", 1.8],
    ["#i-depart-figure svg", 1.8],
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
      id: "c-quotient",
      titre: "Quotient en forme polaire",
      niveau: "prérequis",
      enonce: "<p>Calculez $\\dfrac{4\\angle 30^\\circ}{2\\angle -20^\\circ}$. Quel est l'argument du résultat, en degrés ?</p>",
      valeur: 50,
      unite: "°",
      tolerance: 0.01,
      libelleChamp: "Argument",
      etapes: [
        { texte: "En polaire, on divise les modules : $4/2 = 2$." },
        { texte: "On retranche les arguments : $30^\\circ - (-20^\\circ) = 50^\\circ$. Résultat : $2\\angle 50^\\circ$.", note: "C'est exactement le calcul d'une impédance : une tension divisée par un courant." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Numérateur, dénominateur et quotient",
          vecteurs: [
            { id: "n", nom: "4 ∠ 30°", amplitude: 4, phase: 30, couleur: "serie-4" },
            { id: "d", nom: "2 ∠ -20°", amplitude: 2, phase: -20, couleur: "serie-3", pointille: true },
            { id: "q", nom: "quotient 2 ∠ 50°", amplitude: 2, phase: 50, couleur: "serie-1" },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-inverse",
      titre: "Inverse d'un imaginaire pur",
      niveau: "prérequis",
      enonce: "<p>Quel est l'argument, en degrés, de $\\dfrac{1}{2j}$ ? Pensez à $1/j$.</p>",
      valeur: -90,
      unite: "°",
      tolerance: 0.01,
      libelleChamp: "Argument",
      etapes: [
        { texte: "$\\dfrac{1}{j} = \\dfrac{j}{j^2} = -j$." },
        { texte: "Donc $\\dfrac{1}{2j} = -0{,}5j = 0{,}5\\angle -90^\\circ$ : argument $-90^\\circ$.", note: "Diviser par $j$ fait tourner de $-90^\\circ$ : c'est pourquoi l'impédance d'un condensateur, $1/(jC\\omega)$, pointe vers le bas." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "2j et son inverse",
          vecteurs: [
            { id: "z", nom: "2j = 2 ∠ 90°", amplitude: 2, phase: 90, couleur: "serie-4" },
            { id: "y", nom: "1 / (2j) = 0,5 ∠ -90°", amplitude: 0.5, phase: -90, couleur: "serie-1" },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-parallele",
      titre: "Deux résistances en parallèle",
      niveau: "prérequis",
      enonce: "<p>Quelle est la résistance équivalente de $10\\ \\Omega$ en parallèle avec $15\\ \\Omega$ ?</p>",
      valeur: 6,
      unite: "Ω",
      tolerance: 0.01,
      libelleChamp: "Résistance équivalente",
      etapes: [
        { texte: "En parallèle, les conductances s'ajoutent : $1/10 + 1/15 = 0{,}1 + 0{,}0667 = 0{,}1667\\ \\mathrm{S}$." },
        { texte: "$R = 1/0{,}1667 = 6\\ \\Omega$, ou directement $10 \\times 15/(10 + 15) = 6\\ \\Omega$.", note: "La même règle, appliquée aux admittances complexes, donnera l'association parallèle d'impédances." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Courants des deux branches et courant total en fonction de la tension",
          xTitre: "u",
          xUnite: "V",
          yTitre: "i",
          yUnite: "A",
          xMin: 0,
          xMax: 30,
          yMin: 0,
          yMax: 5.5,
          series: [
            { id: "a", nom: "10 Ω : i = u / 10", couleur: "serie-4", epaisseur: 1.8, fonction: (u) => u / 10 },
            { id: "b", nom: "15 Ω : i = u / 15", couleur: "serie-3", epaisseur: 1.8, fonction: (u) => u / 15 },
            { id: "t", nom: "total : i = u / 6", couleur: "serie-1", epaisseur: 2.8, fonction: (u) => u / 6 },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 24, 4, "24 V : 2,4 + 1,6 = 4 A", true);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Simulation : tension et courant dans R, L et C
   -------------------------------------------------------------------------- */

const COMPOSANTS = {
  1: { nom: "résistance R = 50 Ω", z: () => cx(50, 0) },
  2: { nom: "inductance L = 159,2 mH", z: (f) => cx(0, 2 * Math.PI * f * (50 / W50)) },
  3: { nom: "condensateur C = 63,66 µF", z: (f) => cx(0, -1 / (2 * Math.PI * f * (1 / (50 * W50)))) },
};

function construireComposants(racine, api) {
  const conteneur = racine.querySelector("#d-composants");
  if (!conteneur) return;

  const O = { x: 520, y: 150 };
  const KU = 110 / 230;
  const svg = svgEl("svg", {
    viewBox: "0 0 720 300",
    role: "img",
    "aria-label": "Montage d'un composant alimenté par une source sinusoïdale et plan complexe des phaseurs de la tension et du courant à l'instant étudié",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-d-c");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
    '<circle cx="70" cy="150" r="26"/><path d="M57 150C62 139 67 139 70 150S78 161 83 150"/>' +
    '<path d="M70 124V50H250V100M250 200V250H70V176"/></g>' +
    '<g stroke="currentColor" stroke-width="1.8" fill="none">' +
    '<path d="M110 50H160" marker-end="url(#fl-d-c)"/>' +
    '<path d="M24 230V80" marker-end="url(#fl-d-c)"/>' +
    '<path d="M300 230V80" marker-end="url(#fl-d-c)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
    '<text x="134" y="40" text-anchor="middle">i</text><text x="12" y="160">u</text><text x="308" y="160">u</text>' +
    '<text x="96" y="146">230 V</text><text x="70" y="276">neutre : référence</text></g>' +
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7">' +
    '<path d="M' + (O.x - 150) + " " + O.y + "H" + (O.x + 160) + '" marker-end="url(#fl-d-c)"/>' +
    '<path d="M' + O.x + " " + (O.y + 140) + "V" + (O.y - 142) + '" marker-end="url(#fl-d-c)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11" opacity="0.85">' +
    '<text x="' + (O.x + 158) + '" y="' + (O.y + 16) + '" text-anchor="end">Re</text>' +
    '<text x="' + (O.x + 8) + '" y="' + (O.y - 130) + '">Im</text></g>';
  const symbole = svgEl("g", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "stroke-linecap": "round" });
  const proj = svgEl("path", { stroke: "currentColor", "stroke-width": 1.1, fill: "none", "stroke-dasharray": "2 4", opacity: 0.85 });
  const arc = svgEl("path", { stroke: "currentColor", "stroke-width": 1.3, fill: "none" });
  const vu = svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-d-c)" });
  const vi = svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "stroke-dasharray": "8 5", "marker-end": "url(#fl-d-c)" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, symbole, proj, arc, vu, vi, etiquettes);
  conteneur.appendChild(svg);

  const etat = { el: 2, f: 50, t: 2 };

  function grandeurs() {
    const z = COMPOSANTS[etat.el].z(etat.f);
    const i = div(cx(230, 0), z);
    return { z, i };
  }

  const traceur = api.sim.traceur("#d-composants-trace", {
    titre: "Tension et courant en fonction du temps",
    genre: "Simulation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "u (V) et 50 i (A)",
    xMin: 0,
    xMax: 40,
    yMin: -500,
    yMax: 500,
    ratio: 0.4,
    echantillons: 700,
    series: [
      { id: "u", nom: "u(t), en volts", couleur: "serie-1", epaisseur: 2.8 },
      { id: "i", nom: "50 x i(t), en ampères", couleur: "serie-5", epaisseur: 2 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, etat.t, "instant étudié");
    },
  });
  if (traceur) ressources.push(traceur);

  const valeurs = api.sim.valeurs("#d-composants-valeurs", [
    { id: "comp", libelle: "Composant", format: (v) => COMPOSANTS[v].nom },
    { id: "z", libelle: "Module de l'impédance Z", unite: "Ω", decimales: 2 },
    { id: "x", libelle: "Réactance X, avec son signe", unite: "Ω", decimales: 2 },
    { id: "i", libelle: "Courant efficace I = 230 / Z", unite: "A", decimales: 3 },
    { id: "phi", libelle: "Déphasage φ = φu - φi", unite: "°", decimales: 0 },
    { id: "nature", libelle: "Courant par rapport à la tension", format: (v) => ["en phase", "en retard de 90°", "en avance de 90°"][v] },
    { id: "ut", libelle: "u(t) à l'instant étudié", unite: "V", decimales: 1 },
    { id: "it", libelle: "i(t) à l'instant étudié", unite: "A", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const g = grandeurs();
    const w = 2 * Math.PI * etat.f;
    const theta = (w * etat.t) / 1000 / DEG;
    if (etat.el === 1) {
      symbole.innerHTML = '<path d="M250 100V112M250 188V200"/><rect x="236" y="112" width="28" height="76"/>';
    } else if (etat.el === 2) {
      symbole.innerHTML = '<path d="M250 100V102a12 12 0 0 1 0 24a12 12 0 0 1 0 24a12 12 0 0 1 0 24a12 12 0 0 1 0 24V200"/>';
    } else {
      symbole.innerHTML = '<path d="M250 100V143M250 157V200"/><path d="M226 143H274M226 157H274" stroke-width="3"/>';
    }
    const I = mod(g.i);
    const KI = Math.min(80 / 4.6, 130 / Math.max(I, 1e-6));
    const pu = tourner(cx(230, 0), theta);
    const pi = tourner(g.i, theta);
    const xu = O.x + KU * pu.re;
    const yu = O.y - KU * pu.im;
    const xi = O.x + KI * pi.re;
    const yi = O.y - KI * pi.im;
    vu.setAttribute("d", segment(O.x, O.y, xu, yu, 3));
    vi.setAttribute("d", segment(O.x, O.y, xi, yi, 3));
    proj.setAttribute("d", "M" + xu.toFixed(1) + " " + yu.toFixed(1) + "V" + O.y + "M" + xi.toFixed(1) + " " + yi.toFixed(1) + "V" + O.y);
    const au = arg(pu);
    const ai = arg(pi);
    let a2 = ai;
    while (a2 - au > 180) a2 -= 360;
    while (a2 - au < -180) a2 += 360;
    arc.setAttribute("d", cheminArc(O.x, O.y, 34, au, a2));
    const phi = Math.round(arg(g.z));
    etiquettes.innerHTML =
      '<text x="250" y="226" text-anchor="middle" font-size="11">' + ["", "R", "L", "C"][etat.el] + "</text>" +
      '<text x="' + (xu + 6).toFixed(1) + '" y="' + (yu - 6).toFixed(1) + '" font-weight="600">U</text>' +
      '<text x="' + (xi + 6).toFixed(1) + '" y="' + (yi + 14).toFixed(1) + '" font-weight="600">I</text>' +
      '<text x="360" y="22" font-size="11">U : trait plein épais ; I : tirets</text>' +
      '<text x="360" y="292" font-size="11">échelle : 230 V pour 110 ; ' + nombre(api, I, 2) + " A pour " + nombre(api, KI * I, 0) + "</text>";
    if (traceur) {
      const Im = I * Math.SQRT2;
      const fi = arg(g.i) * DEG;
      traceur.definirPlage({ yMin: -Math.max(500, 55 * Im), yMax: Math.max(500, 55 * Im) });
      traceur.definirFonction("u", (t) => 230 * Math.SQRT2 * Math.cos((w * t) / 1000));
      traceur.definirFonction("i", (t) => 50 * Im * Math.cos((w * t) / 1000 + fi));
    }
    if (valeurs) {
      valeurs.maj({
        comp: etat.el,
        z: mod(g.z),
        x: g.z.im,
        i: I,
        phi,
        nature: phi > 45 ? 1 : phi < -45 ? 2 : 0,
        ut: 230 * Math.SQRT2 * Math.cos((w * etat.t) / 1000),
        it: I * Math.SQRT2 * Math.cos((w * etat.t) / 1000 + arg(g.i) * DEG),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#d-composants-curseurs",
    [
      { id: "el", libelle: "Composant alimenté", min: 1, max: 3, pas: 1, valeur: etat.el, format: (v) => ["résistance", "inductance", "condensateur"][Math.round(v) - 1] },
      { id: "f", libelle: "Fréquence de la source", min: 10, max: 200, pas: 5, valeur: etat.f, unite: "Hz" },
    ],
    (lues) => {
      etat.el = Math.round(lues.el);
      etat.f = lues.f;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-composants-lecteur", {
    de: 0,
    a: 40,
    duree: 14,
    boucle: true,
    auto: false,
    libelle: "Faire tourner les phaseurs et avancer l'instant étudié",
    rappel(valeur) {
      etat.t = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(2);
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Animation : de l'impédance à l'admittance
   -------------------------------------------------------------------------- */

function construireAdmittance(racine, api) {
  const conteneur = racine.querySelector("#e-admittance");
  if (!conteneur) return;

  const OZ = { x: 50, y: 180 };
  const KZ = 2.5;
  const OY = { x: 380, y: 180 };
  const KY = 3;
  const svg = svgEl("svg", {
    viewBox: "0 0 720 380",
    role: "img",
    "aria-label": "Plan des impédances avec un point déplaçable sur la droite de partie réelle R, et plan des admittances où l'inverse décrit un cercle de diamètre 1 sur R",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-a");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7">' +
    '<path d="M' + (OZ.x - 20) + " " + OZ.y + "H" + (OZ.x + 220) + '" marker-end="url(#fl-e-a)"/>' +
    '<path d="M' + OZ.x + " " + (OZ.y + 165) + "V" + (OZ.y - 168) + '" marker-end="url(#fl-e-a)"/>' +
    '<path d="M' + (OY.x - 20) + " " + OY.y + "H" + (OY.x + 320) + '" marker-end="url(#fl-e-a)"/>' +
    '<path d="M' + OY.x + " " + (OY.y + 165) + "V" + (OY.y - 168) + '" marker-end="url(#fl-e-a)"/>' +
    '<path d="M' + (OZ.x - 4) + " " + (OZ.y - 25 * KZ) + "h8M" + (OZ.x - 4) + " " + (OZ.y - 50 * KZ) + "h8M" + (OZ.x - 4) + " " + (OZ.y + 25 * KZ) + "h8M" + (OZ.x - 4) + " " + (OZ.y + 50 * KZ) + "h8" +
    "M" + (OY.x + 25 * KY) + " " + (OY.y - 4) + "v8M" + (OY.x + 50 * KY) + " " + (OY.y - 4) + "v8M" + (OY.x + 75 * KY) + " " + (OY.y - 4) + "v8M" + (OY.x + 100 * KY) + " " + (OY.y - 4) + 'v8"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="10.5" opacity="0.85">' +
    '<text x="' + (OZ.x + 218) + '" y="' + (OZ.y + 16) + '" text-anchor="end">R (Ω)</text>' +
    '<text x="' + (OZ.x + 8) + '" y="' + (OZ.y - 156) + '">X (Ω)</text>' +
    '<text x="' + (OZ.x - 8) + '" y="' + (OZ.y - 50 * KZ + 4) + '" text-anchor="end">50</text>' +
    '<text x="' + (OZ.x - 8) + '" y="' + (OZ.y + 50 * KZ + 4) + '" text-anchor="end">-50</text>' +
    '<text x="' + (OY.x + 318) + '" y="' + (OY.y + 30) + '" text-anchor="end">G (mS)</text>' +
    '<text x="' + (OY.x + 8) + '" y="' + (OY.y - 156) + '">B (mS)</text>' +
    '<text x="' + (OY.x + 50 * KY) + '" y="' + (OY.y + 16) + '" text-anchor="middle">50</text>' +
    '<text x="' + (OY.x + 100 * KY) + '" y="' + (OY.y + 16) + '" text-anchor="middle">100</text>' +
    '<text x="20" y="372">Z : trait plein épais ; Y = 1 / Z : tirets épais ; chemin parcouru : trait fin</text></g>';
  const droite = svgEl("path", { stroke: "currentColor", "stroke-width": 1.1, fill: "none", "stroke-dasharray": "2 4", opacity: 0.85 });
  const cercle = svgEl("circle", { stroke: "currentColor", "stroke-width": 1.1, fill: "none", "stroke-dasharray": "2 4", opacity: 0.85 });
  const chemin = svgEl("path", { stroke: "currentColor", "stroke-width": 1.6, fill: "none" });
  const vz = svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-a)" });
  const vy = svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-dasharray": "10 6", "marker-end": "url(#fl-e-a)" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, droite, cercle, chemin, vz, vy, etiquettes);
  conteneur.appendChild(svg);

  const etat = { r: 20, x: 30 };
  let poignee = null;
  let synchro = false;

  const valeurs = api.sim.valeurs("#e-admittance-valeurs", [
    { id: "z", libelle: "Impédance Z = R + jX", format: (v) => v },
    { id: "zm", libelle: "Module Z", unite: "Ω", decimales: 2 },
    { id: "phi", libelle: "Argument de Z", unite: "°", decimales: 1 },
    { id: "g", libelle: "Conductance G", unite: "mS", decimales: 2 },
    { id: "b", libelle: "Susceptance B", unite: "mS", decimales: 2 },
    { id: "inv", libelle: "1 / R, pour comparaison avec G", unite: "mS", decimales: 2 },
    { id: "ym", libelle: "Module Y = 1 / Z", unite: "mS", decimales: 2 },
    { id: "nature", libelle: "Nature du dipôle", format: (v) => ["résistif", "inductif", "capacitif"][v] },
  ]);
  if (valeurs) ressources.push(valeurs);

  function pointY(r, x) {
    const y = inv(cx(r, x));
    return { x: OY.x + KY * 1000 * y.re, y: OY.y - KY * 1000 * y.im };
  }

  function dessiner() {
    const xz = OZ.x + KZ * etat.r;
    droite.setAttribute("d", "M" + xz + " " + (OZ.y - 160) + "V" + (OZ.y + 160));
    const d = 1000 / etat.r;
    cercle.setAttribute("cx", (OY.x + (KY * d) / 2).toFixed(1));
    cercle.setAttribute("cy", OY.y);
    cercle.setAttribute("r", ((KY * d) / 2).toFixed(1));
    let trace = "";
    const n = Math.max(2, Math.round((etat.x + 60) / 1.5));
    for (let k = 0; k <= n; k += 1) {
      const p = pointY(etat.r, -60 + ((etat.x + 60) * k) / n);
      trace += (k ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1);
    }
    chemin.setAttribute("d", trace);
    const yz = OZ.y - KZ * etat.x;
    vz.setAttribute("d", segment(OZ.x, OZ.y, xz, yz, 9));
    const py = pointY(etat.r, etat.x);
    vy.setAttribute("d", segment(OY.x, OY.y, py.x, py.y, 3));
    const y = inv(cx(etat.r, etat.x));
    etiquettes.innerHTML =
      '<text x="' + (xz + 10) + '" y="' + (yz - 8) + '" font-weight="600">Z</text>' +
      '<text x="' + (py.x + 8).toFixed(1) + '" y="' + (py.y + (etat.x > 0 ? 18 : -8)).toFixed(1) + '" font-weight="600">Y</text>' +
      '<text x="' + (OY.x + KY * d + 4).toFixed(1) + '" y="' + (OY.y - 8) + '" font-size="11">1/R</text>' +
      '<text x="' + (xz + 6) + '" y="' + (OZ.y + 158) + '" font-size="11">Re Z = R</text>';
    if (valeurs) {
      const z = cx(etat.r, etat.x);
      valeurs.maj({
        z: nombre(api, etat.r, 0) + signeJ(api, etat.x, 0) + " Ω",
        zm: mod(z),
        phi: arg(z),
        g: 1000 * y.re,
        b: 1000 * y.im,
        inv: 1000 / etat.r,
        ym: 1000 * mod(y),
        nature: Math.abs(etat.x) < 0.5 ? 0 : etat.x > 0 ? 1 : 2,
      });
    }
  }

  poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: OZ.x, y: OZ.y - 60 * KZ, largeur: 60 * KZ, hauteur: 120 * KZ },
    valeur: { x: OZ.x + KZ * etat.r, y: OZ.y - KZ * etat.x },
    pas: 2.5,
    libelle: "Réactance X du point Z",
    format: () => "X " + nombre(api, etat.x, 0) + " ohms",
    diffuserAuDepart: false,
    rappel(mesure, controle) {
      if (synchro) return;
      etat.x = Math.round((OZ.y - mesure.y) / KZ);
      const xz = OZ.x + KZ * etat.r;
      if (Math.abs(mesure.x - xz) > 0.5 && controle) {
        synchro = true;
        controle.set({ x: xz, y: OZ.y - KZ * etat.x }, false);
        synchro = false;
      }
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  function placer() {
    if (!poignee) return;
    synchro = true;
    poignee.set({ x: OZ.x + KZ * etat.r, y: OZ.y - KZ * etat.x }, false);
    synchro = false;
  }

  const curseurs = api.sim.curseurs(
    "#e-admittance-curseurs",
    [{ id: "r", libelle: "Résistance R", min: 10, max: 60, pas: 1, valeur: etat.r, unite: "Ω" }],
    (lues) => {
      etat.r = lues.r;
      placer();
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-admittance-lecteur", {
    de: -60,
    a: 60,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Balayer la réactance de -60 à +60 ohms",
    rappel(valeur) {
      etat.x = Math.round(valeur);
      placer();
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(30);
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : plan complexe des impédances d'un circuit RLC série
   -------------------------------------------------------------------------- */

function construirePlan(racine, api) {
  const conteneur = racine.querySelector("#e-plan");
  if (!conteneur) return;

  const O = { x: 190, y: 190 };
  const F = { x0: 60, x1: 660, y: 372, fmin: 5, fmax: 200 };
  const versXf = (f) => F.x0 + ((f - F.fmin) / (F.fmax - F.fmin)) * (F.x1 - F.x0);
  const svg = svgEl("svg", {
    viewBox: "0 0 720 400",
    role: "img",
    "aria-label": "Construction de l'impédance d'un circuit RLC série dans le plan complexe : R, puis j L omega, puis moins j sur C omega, et leur somme Z ; échelle des fréquences avec une poignée",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-p");
  const fond = svgEl("g");
  let graduations = "";
  let textes = "";
  for (const f of [5, 50, 100, 150, 200]) {
    graduations += "M" + versXf(f).toFixed(1) + " " + (F.y - 5) + "v10";
    textes += '<text x="' + versXf(f).toFixed(1) + '" y="' + (F.y + 22) + '" text-anchor="middle">' + f + " Hz</text>";
  }
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7">' +
    '<path d="M' + (O.x - 30) + " " + O.y + "H" + 700 + '" marker-end="url(#fl-e-p)"/>' +
    '<path d="M' + O.x + " " + 345 + "V" + 10 + '" marker-end="url(#fl-e-p)"/>' +
    '<path d="M' + F.x0 + " " + F.y + "H" + F.x1 + graduations + '"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="10.5" opacity="0.85">' +
    '<text x="698" y="' + (O.y + 16) + '" text-anchor="end">Re Z (Ω)</text>' +
    '<text x="' + (O.x + 8) + '" y="22">Im Z (Ω)</text>' + textes + "</g>";
  const repereF0 = svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none" });
  const vr = svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "marker-end": "url(#fl-e-p)" });
  const vl = svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "marker-end": "url(#fl-e-p)" });
  const vc = svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "stroke-dasharray": "8 5", "marker-end": "url(#fl-e-p)" });
  const vz = svgEl("path", { stroke: "currentColor", "stroke-width": 3.6, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-p)" });
  const liens = svgEl("path", { stroke: "currentColor", "stroke-width": 1.1, fill: "none", "stroke-dasharray": "2 3", opacity: 0.8 });
  const arc = svgEl("path", { stroke: "currentColor", "stroke-width": 1.3, fill: "none" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, repereF0, liens, vr, vl, vc, vz, arc, etiquettes);
  conteneur.appendChild(svg);

  const etat = { r: 10, l: 100, c: 220, f: 50 };
  const reactances = (f) => ({ xl: 2 * Math.PI * f * etat.l * 1e-3, xc: 1 / (2 * Math.PI * f * etat.c * 1e-6) });
  const f0 = () => 1 / (2 * Math.PI * Math.sqrt(etat.l * 1e-3 * etat.c * 1e-6));

  const traceur = api.sim.traceur("#e-plan-trace", {
    titre: "Réactances et module de l'impédance en fonction de la fréquence",
    genre: "Simulation",
    xTitre: "f",
    xUnite: "Hz",
    yTitre: "ohms",
    yUnite: "Ω",
    xMin: 5,
    xMax: 200,
    yMin: 0,
    yMax: 150,
    ratio: 0.42,
    echantillons: 400,
    series: [
      { id: "xl", nom: "Lω", couleur: "serie-3", epaisseur: 1.8 },
      { id: "xc", nom: "1 / (Cω)", couleur: "serie-4", epaisseur: 1.8 },
      { id: "z", nom: "|Z|", couleur: "serie-1", epaisseur: 3 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, etat.f, "f choisie");
      const fr = f0();
      if (fr > 5 && fr < 200) marquerPoint(c, repere, couleurs, fr, etat.r, "f0, |Z| = R", false);
    },
  });
  if (traceur) ressources.push(traceur);

  const valeurs = api.sim.valeurs("#e-plan-valeurs", [
    { id: "f", libelle: "Fréquence f", unite: "Hz", decimales: 1 },
    { id: "xl", libelle: "Lω", unite: "Ω", decimales: 2 },
    { id: "xc", libelle: "1 / (Cω)", unite: "Ω", decimales: 2 },
    { id: "z", libelle: "Impédance Z", format: (v) => v },
    { id: "zm", libelle: "Module |Z|", unite: "Ω", decimales: 2 },
    { id: "phi", libelle: "Argument φ", unite: "°", decimales: 1 },
    { id: "nature", libelle: "Nature à cette fréquence", format: (v) => ["résistive", "inductive", "capacitive"][v] },
    { id: "f0", libelle: "f0 = 1 / (2π √(LC))", unite: "Hz", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const { xl, xc } = reactances(etat.f);
    const x = xl - xc;
    const K = Math.min(8, 170 / Math.max(xl, 1), 150 / Math.max(xc - xl, 1), 480 / Math.max(etat.r, 1));
    const pR = { x: O.x + K * etat.r, y: O.y };
    const pL = { x: pR.x, y: O.y - K * xl };
    const pC = { x: pR.x, y: pL.y + K * xc };
    vr.setAttribute("d", segment(O.x, O.y, pR.x, pR.y, 3));
    vl.setAttribute("d", segment(pR.x, pR.y, pL.x, pL.y, 3));
    vc.setAttribute("d", segment(pL.x + 18, pL.y, pC.x + 18, pC.y, 3));
    liens.setAttribute("d", "M" + pL.x.toFixed(1) + " " + pL.y.toFixed(1) + "h18M" + (pC.x + 18).toFixed(1) + " " + pC.y.toFixed(1) + "h-18");
    vz.setAttribute("d", segment(O.x, O.y, pC.x, pC.y, 3));
    const phi = arg(cx(etat.r, x));
    arc.setAttribute("d", cheminArc(O.x, O.y, 46, 0, phi));
    const fr = f0();
    repereF0.setAttribute("d", fr >= F.fmin && fr <= F.fmax ? "M" + versXf(fr).toFixed(1) + " " + (F.y - 14) + "v28" : "");
    etiquettes.innerHTML =
      '<text x="' + ((O.x + pR.x) / 2).toFixed(1) + '" y="' + (O.y + 18) + '" text-anchor="middle">R</text>' +
      '<text x="' + (pL.x - 8).toFixed(1) + '" y="' + (pL.y + 12).toFixed(1) + '" text-anchor="end">jLω</text>' +
      '<text x="' + (pL.x + 26).toFixed(1) + '" y="' + ((pL.y + pC.y) / 2 + 4).toFixed(1) + '">-j/(Cω)</text>' +
      '<text x="' + (pC.x - 10).toFixed(1) + '" y="' + (pC.y + (x >= 0 ? -6 : 18)).toFixed(1) + '" text-anchor="end" font-weight="600">Z</text>' +
      '<text x="' + (O.x + 52) + '" y="' + (O.y + (phi >= 0 ? -8 : 20)) + '" font-size="11">φ</text>' +
      (fr >= F.fmin && fr <= F.fmax ? '<text x="' + versXf(fr).toFixed(1) + '" y="' + (F.y - 18) + '" text-anchor="middle" font-size="11">f0</text>' : "") +
      '<text x="460" y="30" font-size="11">R, jLω : trait plein ; -j/(Cω) : tirets</text>' +
      '<text x="460" y="46" font-size="11">Z : trait épais</text>' +
      '<text x="460" y="62" font-size="11">échelle : 10 Ω pour ' + nombre(api, 10 * K, 0) + " unités</text>";
    if (traceur) {
      const zmax = Math.max(60, 1.1 * Math.max(Math.hypot(etat.r, 2 * Math.PI * 200 * etat.l * 1e-3 - 1 / (2 * Math.PI * 200 * etat.c * 1e-6)), 2 * Math.PI * 200 * etat.l * 1e-3));
      traceur.definirPlage({ yMin: 0, yMax: Math.min(zmax, 400) });
      traceur.definirFonction("xl", (f) => reactances(f).xl);
      traceur.definirFonction("xc", (f) => reactances(f).xc);
      traceur.definirFonction("z", (f) => {
        const r = reactances(f);
        return Math.hypot(etat.r, r.xl - r.xc);
      });
    }
    if (valeurs) {
      valeurs.maj({
        f: etat.f,
        xl,
        xc,
        z: nombre(api, etat.r, 1) + signeJ(api, x, 2) + " Ω",
        zm: Math.hypot(etat.r, x),
        phi,
        nature: Math.abs(x) < 0.05 ? 0 : x > 0 ? 1 : 2,
        f0: fr,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: F.x0, y: F.y },
    a: { x: F.x1, y: F.y },
    min: F.fmin,
    max: F.fmax,
    pas: 1,
    valeur: etat.f,
    libelle: "Fréquence de la source",
    unite: "Hz",
    format: (v) => nombre(api, v, 0) + " hertz",
    rappel(mesure) {
      etat.f = Math.round(mesure.valeur);
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-plan-curseurs",
    [
      { id: "r", libelle: "Résistance R", min: 1, max: 50, pas: 1, valeur: etat.r, unite: "Ω" },
      { id: "l", libelle: "Inductance L", min: 10, max: 200, pas: 5, valeur: etat.l, unite: "mH" },
      { id: "c", libelle: "Capacité C", min: 20, max: 500, pas: 10, valeur: etat.c, unite: "µF" },
    ],
    (lues) => {
      etat.r = lues.r;
      etat.l = lues.l;
      etat.c = lues.c;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   H. Animation : construction de Fresnel de l'exemple
   -------------------------------------------------------------------------- */

function construireFresnelExemple(racine, api) {
  const conteneur = racine.querySelector("#h-fresnel");
  if (!conteneur) return;
  const g = exemple();

  const OU = { x: 180, y: 180 };
  const KU = 150 / 230;
  const OI = { x: 540, y: 180 };
  const KI = 150 / 8.6;
  const svg = svgEl("svg", {
    viewBox: "0 0 720 370",
    role: "img",
    "aria-label": "Diagrammes de Fresnel de l'exemple : à gauche les tensions UR1, Up et U, à droite les courants IRL, IC et I, tournés de l'angle omega t",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-h-f");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.1" fill="none" opacity="0.65">' +
    '<path d="M' + (OU.x - 170) + " " + OU.y + "H" + (OU.x + 174) + '" marker-end="url(#fl-h-f)"/>' +
    '<path d="M' + OU.x + " " + (OU.y + 165) + "V" + (OU.y - 168) + '" marker-end="url(#fl-h-f)"/>' +
    '<path d="M' + (OI.x - 170) + " " + OI.y + "H" + (OI.x + 174) + '" marker-end="url(#fl-h-f)"/>' +
    '<path d="M' + OI.x + " " + (OI.y + 165) + "V" + (OI.y - 168) + '" marker-end="url(#fl-h-f)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="10.5" opacity="0.85">' +
    '<text x="' + (OU.x - 170) + '" y="20">tensions, 230 V pour 150 unités</text>' +
    '<text x="' + (OI.x - 170) + '" y="20">courants, 8,6 A pour 150 unités</text>' +
    '<text x="10" y="362">composantes : trait plein ; sommes : tirets épais ; décomposition de Up : pointillés</text></g>';
  const couche = svgEl("g", { stroke: "currentColor", fill: "none" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, couche, etiquettes);
  conteneur.appendChild(svg);

  const etat = { etape: 4, theta: 0 };

  const valeurs = api.sim.valeurs("#h-fresnel-valeurs", [
    { id: "t", libelle: "Instant t à 50 Hz", unite: "ms", decimales: 2 },
    { id: "u", libelle: "u(t), source", unite: "V", decimales: 1 },
    { id: "us", libelle: "uR1(t) + up(t)", unite: "V", decimales: 1 },
    { id: "i", libelle: "i(t), ligne", unite: "A", decimales: 3 },
    { id: "is", libelle: "iRL(t) + iC(t)", unite: "A", decimales: 3 },
    { id: "ib", libelle: "Valeurs efficaces I, IRL, IC", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function fleche(o, k, depart, z, style, epaisseur) {
    const a = tourner(depart, etat.theta);
    const b = tourner(add(depart, z), etat.theta);
    const x1 = o.x + k * a.re;
    const y1 = o.y - k * a.im;
    const x2 = o.x + k * b.re;
    const y2 = o.y - k * b.im;
    const tirets = style === "somme" ? ' stroke-dasharray="11 6"' : style === "detail" ? ' stroke-dasharray="2 4"' : "";
    return {
      svg: '<path d="' + segment(x1, y1, x2, y2, 3) + '" stroke-width="' + epaisseur + '"' + tirets + ' marker-end="url(#fl-h-f)"/>',
      milieu: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
      bout: { x: x2, y: y2 },
    };
  }

  function texte(p, t, dx, dy, gras) {
    return '<text x="' + (p.x + dx).toFixed(1) + '" y="' + (p.y + dy).toFixed(1) + '"' + (gras ? ' font-weight="600"' : "") + ">" + t + "</text>";
  }

  function dessiner() {
    const zero = cx(0, 0);
    let traits = "";
    let textes = "";
    const fu = fleche(OU, KU, zero, g.u, "somme", 3.2);
    const fi = fleche(OI, KI, zero, g.i, "somme", 3.2);
    traits += fu.svg + fi.svg;
    textes += texte(fu.bout, "U", 8, -8, true) + texte(fi.bout, "I", 8, -8, true);
    if (etat.etape >= 2) {
      const a = fleche(OU, KU, zero, g.ur1, "plein", 2.2);
      const b = fleche(OU, KU, g.ur1, g.up, "plein", 2.2);
      traits += a.svg + b.svg;
      textes += texte(a.bout, "UR1", -10, -10, false) + texte(b.milieu, "Up", 0, 18, false);
    }
    if (etat.etape >= 3) {
      const a = fleche(OI, KI, zero, g.irl, "plein", 2.2);
      const b = fleche(OI, KI, g.irl, g.ic, "plein", 2.2);
      traits += a.svg + b.svg;
      textes += texte(a.milieu, "IRL", -34, 6, false) + texte(b.milieu, "IC", 8, 4, false);
    }
    if (etat.etape >= 4) {
      const a = fleche(OU, KU, g.ur1, g.ur2, "detail", 1.6);
      const b = fleche(OU, KU, add(g.ur1, g.ur2), g.ul, "detail", 1.6);
      traits += a.svg + b.svg;
      textes += texte(a.milieu, "UR2", -36, 6, false) + texte(b.milieu, "UL", 8, 4, false);
    }
    couche.innerHTML = traits;
    etiquettes.innerHTML = textes;

    const t = (etat.theta / 360) * 20;
    const inst = (z) => mod(z) * Math.SQRT2 * Math.cos((etat.theta + arg(z)) * DEG);
    if (valeurs) {
      valeurs.maj({
        t,
        u: inst(g.u),
        us: inst(g.ur1) + inst(g.up),
        i: inst(g.i),
        is: inst(g.irl) + inst(g.ic),
        ib: nombre(api, mod(g.i), 3) + " A ; " + nombre(api, mod(g.irl), 3) + " A ; " + nombre(api, mod(g.ic), 3) + " A",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#h-fresnel-curseurs",
    [
      {
        id: "etape",
        libelle: "Étape de la construction",
        min: 1,
        max: 4,
        pas: 1,
        valeur: etat.etape,
        format: (v) => ["1 : U et I seuls", "2 : loi des mailles", "3 : loi des nœuds", "4 : tensions de la bobine"][Math.round(v) - 1],
      },
    ],
    (lues) => {
      etat.etape = Math.round(lues.etape);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#h-fresnel-lecteur", {
    de: 0,
    a: 360,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Faire tourner les phaseurs sur une période",
    rappel(valeur) {
      etat.theta = valeur;
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);
  dessiner();
}

/* --------------------------------------------------------------------------
   I. Simulation : chute de tension du départ compresseur
   -------------------------------------------------------------------------- */

function chuteDepart(cosphi, longueur, section) {
  const i = (32 * 0.8) / cosphi;
  const phi = Math.acos(cosphi) / DEG;
  const zc = cx((RHO70 * longueur) / section, XLIN * longueur);
  const courant = polaire(i, -phi);
  const dz = mul(zc, courant);
  const ut = add(cx(230, 0), dz);
  return { i, phi, zc, courant, dz, ut, approx: (zc.re * cosphi + zc.im * Math.sin(phi * DEG)) * i };
}

function construireChute(racine, api) {
  const conteneur = racine.querySelector("#i-chute");
  if (!conteneur) return;

  const O = { x: 40, y: 150 };
  const KU = 2;
  const svg = svgEl("svg", {
    viewBox: "0 0 720 320",
    role: "img",
    "aria-label": "Diagramme de Fresnel du départ compresseur : tension du moteur sur l'axe réel, chute résistive parallèle au courant et chute réactive perpendiculaire, agrandies, et direction du courant",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-i-c");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.1" fill="none" opacity="0.65">' +
    '<path d="M' + (O.x - 20) + " " + O.y + "H" + 710 + '" marker-end="url(#fl-i-c)"/>' +
    '<path d="M' + O.x + " " + 300 + "V" + 10 + '" marker-end="url(#fl-i-c)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="10.5" opacity="0.85">' +
    '<text x="708" y="' + (O.y + 16) + '" text-anchor="end">Re (V)</text>' +
    '<text x="' + (O.x + 8) + '" y="22">Im (V)</text></g>';
  const vu = svgEl("path", { stroke: "currentColor", "stroke-width": 3.4, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-i-c)" });
  const vi = svgEl("path", { stroke: "currentColor", "stroke-width": 1.6, fill: "none", "stroke-dasharray": "2 4", "marker-end": "url(#fl-i-c)" });
  const vr = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none", "marker-end": "url(#fl-i-c)" });
  const vx = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none", "stroke-dasharray": "8 5", "marker-end": "url(#fl-i-c)" });
  const arc = svgEl("path", { stroke: "currentColor", "stroke-width": 1.3, fill: "none" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, vu, vi, arc, vr, vx, etiquettes);
  conteneur.appendChild(svg);

  const etat = { cos: 0.8, l: 30, s: 3 };

  const valeurs = api.sim.valeurs("#i-chute-valeurs", [
    { id: "i", libelle: "Courant du moteur, puissance active constante", unite: "A", decimales: 1 },
    { id: "rc", libelle: "Résistance du câble Rc", unite: "mΩ", decimales: 2 },
    { id: "xc", libelle: "Réactance du câble Xc", unite: "mΩ", decimales: 2 },
    { id: "rapport", libelle: "Rapport Rc / Xc", decimales: 1 },
    { id: "du", libelle: "Chute exacte Ut - Um", unite: "V", decimales: 3 },
    { id: "approx", libelle: "Chute approchée (Rc cos φ + Xc sin φ) I", unite: "V", decimales: 3 },
    { id: "pct", libelle: "Chute relative", unite: "%", decimales: 2 },
    { id: "ut", libelle: "Tension en tête Ut", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const section = SECTIONS[etat.s];
    const r = chuteDepart(etat.cos, etat.l, section);
    const mod1 = mod(r.dz);
    let facteur = 10;
    for (const candidat of [10, 20, 50, 100, 200, 500]) if (mod1 * KU * candidat <= 150) facteur = candidat;
    const pU = { x: O.x + KU * 230, y: O.y };
    const dR = mul(cx(r.zc.re, 0), r.courant);
    const dX = mul(cx(0, r.zc.im), r.courant);
    const k = KU * facteur;
    const p1 = { x: pU.x + k * dR.re, y: pU.y - k * dR.im };
    const p2 = { x: p1.x + k * dX.re, y: p1.y - k * dX.im };
    vu.setAttribute("d", segment(O.x, O.y, pU.x, pU.y, 3));
    vr.setAttribute("d", segment(pU.x, pU.y, p1.x, p1.y, 3));
    vx.setAttribute("d", segment(p1.x, p1.y, p2.x, p2.y, 3));
    const li = 150;
    vi.setAttribute("d", segment(O.x, O.y, O.x + li * Math.cos(-r.phi * DEG), O.y - li * Math.sin(-r.phi * DEG), 3));
    arc.setAttribute("d", cheminArc(O.x, O.y, 70, -r.phi, 0));
    etiquettes.innerHTML =
      '<text x="' + ((O.x + pU.x) / 2) + '" y="' + (O.y - 10) + '" text-anchor="middle" font-weight="600">Um = 230 V</text>' +
      '<text x="' + ((pU.x + p1.x) / 2 - 8).toFixed(1) + '" y="' + ((pU.y + p1.y) / 2 + 20).toFixed(1) + '" text-anchor="end">Rc I</text>' +
      '<text x="' + (p2.x + 8).toFixed(1) + '" y="' + (p2.y - 4).toFixed(1) + '">jXc I</text>' +
      '<text x="' + (O.x + li * Math.cos(-r.phi * DEG) + 6).toFixed(1) + '" y="' + (O.y - li * Math.sin(-r.phi * DEG) + 14).toFixed(1) + '">direction de I</text>' +
      '<text x="' + (O.x + 76) + '" y="' + (O.y + 22) + '" font-size="11">φ</text>' +
      '<text x="380" y="250" font-size="11">Um : trait plein épais ; Rc I : trait plein ;</text>' +
      '<text x="380" y="266" font-size="11">jXc I : tirets ; direction de I : pointillés</text>' +
      '<text x="380" y="282" font-size="11">chutes agrandies ' + facteur + " fois</text>" +
      '<text x="380" y="298" font-size="11">câble ' + etat.l + " m, " + nombre(api, section, section < 10 ? 1 : 0) + " mm²</text>";
    if (valeurs) {
      valeurs.maj({
        i: r.i,
        rc: 1000 * r.zc.re,
        xc: 1000 * r.zc.im,
        rapport: r.zc.re / r.zc.im,
        du: mod(r.ut) - 230,
        approx: r.approx,
        pct: ((mod(r.ut) - 230) / 230) * 100,
        ut: nombre(api, mod(r.ut), 2) + " V à " + nombre(api, arg(r.ut), 2) + "°",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-chute-curseurs",
    [
      { id: "cos", libelle: "Facteur de déplacement du moteur cos φ", min: 0.6, max: 1, pas: 0.01, valeur: etat.cos, chiffres: 2 },
      { id: "l", libelle: "Longueur du câble", min: 10, max: 100, pas: 5, valeur: etat.l, unite: "m" },
      {
        id: "s",
        libelle: "Section du câble",
        min: 0,
        max: SECTIONS.length - 1,
        pas: 1,
        valeur: etat.s,
        format: (v) => String(SECTIONS[Math.round(v)]).replace(".", ",") + " mm²",
      },
    ],
    (lues) => {
      etat.cos = lues.cos;
      etat.l = lues.l;
      etat.s = Math.round(lues.s);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/** Dessin d'exercice et de quiz : quatre points du plan des impédances. */
function dessinPlanQuatrePoints(idMarqueur) {
  const o = { x: 300, y: 170 };
  const k = 3;
  const p = (re, im) => ({ x: o.x + k * re, y: o.y - k * im });
  const A = p(40, 30);
  const B = p(40, -30);
  const C = p(0, -30);
  const D = p(-40, -30);
  const point = (q) => '<circle cx="' + q.x + '" cy="' + q.y + '" r="5"/>';
  return (
    "<defs>" + marqueur(idMarqueur) + "</defs>" +
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.65"><path d="M120 170H480M300 310V30" /></g>' +
    '<g stroke="currentColor" stroke-width="1" fill="none" stroke-dasharray="2 4" opacity="0.7">' +
    '<path d="M' + A.x + " " + o.y + "V" + A.y + "M" + B.x + " " + o.y + "V" + B.y + "M" + D.x + " " + o.y + "V" + D.y + '"/></g>' +
    '<g fill="currentColor" stroke="none">' + point(A) + point(B) + point(C) + point(D) + "</g>" +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="14" font-weight="600">' +
    '<text x="' + (A.x + 10) + '" y="' + (A.y - 6) + '">A</text><text x="' + (B.x + 10) + '" y="' + (B.y + 18) + '">B</text>' +
    '<text x="' + (C.x + 10) + '" y="' + (C.y + 18) + '">C</text><text x="' + (D.x - 22) + '" y="' + (D.y + 18) + '">D</text></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
    '<text x="482" y="186">Re Z</text><text x="306" y="38">Im Z</text>' +
    '<text x="' + A.x + '" y="186" text-anchor="middle">40</text><text x="' + D.x + '" y="160" text-anchor="middle">-40</text>' +
    '<text x="292" y="' + (A.y + 4) + '" text-anchor="end">30</text><text x="292" y="' + (B.y + 4) + '" text-anchor="end">-30</text>' +
    '<text x="20" y="330">plan des impédances, graduations en ohms ; projections en pointillés</text></g>'
  );
}

/* Tensions harmoniques relevées (en fraction du fondamental) pour l'exercice de diagnostic. */
const HARMONIQUES = [
  { rang: 5, taux: 0.06 },
  { rang: 7, taux: 0.05 },
  { rang: 11, taux: 0.035 },
  { rang: 13, taux: 0.03 },
];

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : courant d'une inductance. */
  const xl1 = 0.2 * W50;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-inductance",
      titre: "Courant dans une inductance",
      niveau: "fondamental",
      enonce:
        "<p>Une inductance idéale de $0{,}2\\ \\mathrm{H}$ est alimentée par le réseau $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$. Calculez sa réactance, puis la valeur efficace du courant. Le courant est-il en avance ou en retard sur la tension ?</p>",
      valeur: 230 / xl1,
      unite: "A",
      tolerance: 0.01,
      libelleChamp: "Courant efficace $I$",
      etapes: [
        { texte: "$\\omega = 2\\pi \\times 50 = 314{,}16\\ \\mathrm{rad/s}$ ; $X_L = L\\omega = 0{,}2 \\times 314{,}16 = 62{,}83\\ \\Omega$." },
        { texte: "$\\underline{Z}_L = j62{,}83\\ \\Omega = 62{,}83\\angle 90^\\circ\\ \\Omega$." },
        { texte: "$\\underline{I} = \\underline{U}/\\underline{Z}_L = 230\\angle 0^\\circ / 62{,}83\\angle 90^\\circ = 3{,}661\\angle -90^\\circ\\ \\mathrm{A}$ : $I = 3{,}66\\ \\mathrm{A}$, en retard de $90^\\circ$.", note: "Contrôle d'ordre de grandeur : $1\\ \\mathrm{mH}$ vaut $0{,}314\\ \\Omega$ à $50\\ \\mathrm{Hz}$, donc $200\\ \\mathrm{mH}$ valent $62{,}8\\ \\Omega$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Le courant atteint son maximum 5 ms après la tension",
          yTitre: "u (V) et 50 i (A)",
          xMin: 0,
          xMax: 40,
          yMin: -360,
          yMax: 360,
          series: [
            { id: "u", nom: "u(t), en volts", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => 325.27 * Math.cos((W50 * t) / 1000) },
            { id: "i", nom: "50 x i(t), en ampères", couleur: "serie-5", epaisseur: 2, fonction: (t) => 50 * (230 / xl1) * Math.SQRT2 * Math.sin((W50 * t) / 1000) },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 5, 50 * (230 / xl1) * Math.SQRT2, "maximum de i à 5 ms", false);
          },
        });
      },
    })
  );

  /* Fondamental 2 : condensateur et fréquence. */
  const xc50 = 1 / (47e-6 * W50);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-condensateur",
      titre: "Condensateur à 50 et à 150 Hz",
      niveau: "fondamental",
      enonce:
        "<p>Un condensateur de $47\\ \\mu\\mathrm{F}$ est soumis à $230\\ \\mathrm{V}$ efficaces. Calculez le courant à $50\\ \\mathrm{Hz}$, puis le courant qu'il absorberait sous la même tension efficace à $150\\ \\mathrm{Hz}$. Donnez ce second courant.</p>",
      valeur: 230 / (xc50 / 3),
      unite: "A",
      tolerance: 0.01,
      libelleChamp: "Courant à $150\\ \\mathrm{Hz}$",
      etapes: [
        { texte: "À $50\\ \\mathrm{Hz}$ : $1/(C\\omega) = 1/(47 \\times 10^{-6} \\times 314{,}16) = 67{,}73\\ \\Omega$, d'où $I = 230/67{,}73 = 3{,}396\\ \\mathrm{A}$, en avance de $90^\\circ$." },
        { texte: "À $150\\ \\mathrm{Hz}$, la pulsation est triplée : la réactance est divisée par trois, $22{,}58\\ \\Omega$." },
        { texte: "$I = 230/22{,}58 = 10{,}19\\ \\mathrm{A}$, trois fois plus.", note: "C'est le mécanisme qui fait souffrir les condensateurs en présence d'harmoniques : à tension harmonique égale, le courant croît comme le rang." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Courant du condensateur sous 230 V en fonction de la fréquence",
          xTitre: "f",
          xUnite: "Hz",
          yTitre: "I",
          yUnite: "A",
          xMin: 0,
          xMax: 200,
          yMin: 0,
          yMax: 15,
          series: [{ id: "i", nom: "I = 230 x 2πfC", couleur: "serie-1", epaisseur: 2.8, fonction: (f) => 230 * 2 * Math.PI * f * 47e-6 }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 50, 230 / xc50, "50 Hz : 3,40 A", false);
            marquerPoint(c, repere, couleurs, 150, (3 * 230) / xc50, "150 Hz : 10,19 A", true);
          },
        });
      },
    })
  );

  /* Intermédiaire 1 : bobine réelle RL série. */
  const z3 = cx(30, 0.1 * W50);
  const i3 = 230 / mod(z3);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-rl",
      titre: "Tensions d'un circuit RL série",
      niveau: "intermédiaire",
      enonce:
        "<p>Une résistance de $30\\ \\Omega$ et une inductance de $0{,}1\\ \\mathrm{H}$ sont en série sous $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$. Calculez l'impédance, le courant, puis la tension efficace aux bornes de l'inductance. Comparez $U_R + U_L$ à $230\\ \\mathrm{V}$.</p>",
      valeur: 0.1 * W50 * i3,
      unite: "V",
      tolerance: 0.01,
      libelleChamp: "Tension $U_L$",
      etapes: [
        { texte: "$X_L = 0{,}1 \\times 314{,}16 = 31{,}42\\ \\Omega$ ; $\\underline{Z} = 30 + j31{,}42 = 43{,}44\\angle 46{,}32^\\circ\\ \\Omega$." },
        { texte: "$I = 230/43{,}44 = 5{,}295\\ \\mathrm{A}$, en retard de $46{,}32^\\circ$." },
        { texte: "$U_R = 30 \\times 5{,}295 = 158{,}8\\ \\mathrm{V}$ et $U_L = 31{,}42 \\times 5{,}295 = 166{,}3\\ \\mathrm{V}$." },
        { texte: "$U_R + U_L = 325{,}2\\ \\mathrm{V} &gt; 230\\ \\mathrm{V}$ : normal, les deux tensions sont en quadrature, $\\sqrt{158{,}8^2 + 166{,}3^2} = 230\\ \\mathrm{V}$.", note: "La loi des mailles porte sur les phaseurs, pas sur les valeurs efficaces." },
      ],
      visuelCorrection(conteneur, moteur) {
        const phi = arg(z3);
        fresnelCorrection(moteur, conteneur, {
          titre: "UR et UL en quadrature, leur somme vaut 230 V",
          unite: "V",
          somme: true,
          nomSomme: "U = 230 V",
          vecteurs: [
            { id: "ur", nom: "UR = 158,8 V", amplitude: 30 * i3, phase: -phi, couleur: "serie-4" },
            { id: "ul", nom: "UL = 166,3 V", amplitude: 0.1 * W50 * i3, phase: 90 - phi, couleur: "serie-3" },
          ],
        });
      },
    })
  );

  /* Intermédiaire 2 : lecture du plan des impédances. */
  ressources.push(
    api.exercice.schema(cible, {
      id: "k-plan",
      titre: "Reconnaître un dipôle RC série",
      niveau: "intermédiaire",
      consigne: "Cliquez sur le point qui représente le dipôle, puis validez.",
      enonce:
        "<p>Une résistance de $40\\ \\Omega$ est en série avec un condensateur dont la réactance vaut $30\\ \\Omega$ en valeur absolue à la fréquence d'étude. Quel point du plan représente l'impédance du dipôle ?</p>",
      viewBox: "0 0 600 340",
      description: "Quatre points du plan des impédances : A à 40 plus j30, B à 40 moins j30, C à moins j30, D à moins 40 moins j30",
      dessin: dessinPlanQuatrePoints("fl-k-p"),
      zones: [
        { x: 410, y: 60, largeur: 44, hauteur: 34, etiquette: "point A" },
        { x: 410, y: 240, largeur: 44, hauteur: 34, etiquette: "point B", juste: true },
        { x: 290, y: 240, largeur: 44, hauteur: 34, etiquette: "point C" },
        { x: 156, y: 240, largeur: 44, hauteur: 34, etiquette: "point D" },
      ],
      etapes: [
        { texte: "Série : $\\underline{Z} = R + \\underline{Z}_C = 40 - j30\\ \\Omega$." },
        { texte: "Partie réelle positive, partie imaginaire négative : quatrième quadrant, point B, $50\\angle -36{,}87^\\circ\\ \\Omega$." },
        { texte: "A est le dipôle RL de même module ; C serait le condensateur seul ; D, de partie réelle négative, est impossible pour un dipôle passif.", note: "Le module $50\\ \\Omega$ et non $70\\ \\Omega$ : les impédances s'ajoutent comme des complexes." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "R, réactance du condensateur et impédance du dipôle",
          unite: "Ω",
          somme: true,
          nomSomme: "Z = 50 Ω à -36,87°",
          vecteurs: [
            { id: "r", nom: "R = 40 Ω", amplitude: 40, phase: 0, couleur: "serie-4" },
            { id: "c", nom: "ZC = -j30 Ω", amplitude: 30, phase: -90, couleur: "serie-3" },
          ],
        });
      },
    })
  );

  /* Avancé : identifier une bobine réelle par deux mesures. */
  const xb = Math.sqrt(115 * 115 - 30 * 30);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-bobine-reelle",
      titre: "Identifier une bobine par deux mesures",
      niveau: "avancé",
      enonce:
        "<p>On veut le modèle série d'une bobine de contacteur alternatif, supposée linéaire. Sous $12\\ \\mathrm{V}$ continus, elle absorbe $0{,}4\\ \\mathrm{A}$. Sous $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$, elle absorbe $2{,}0\\ \\mathrm{A}$ efficaces. Calculez son inductance, en henrys, ainsi que son facteur de déplacement.</p>",
      valeur: xb / W50,
      unite: "H",
      tolerance: 0.01,
      libelleChamp: "Inductance $L$",
      etapes: [
        { texte: "En continu, l'inductance est un court-circuit : $R = 12/0{,}4 = 30\\ \\Omega$." },
        { texte: "En alternatif, $Z = U/I = 230/2 = 115\\ \\Omega$, module de $R + jL\\omega$." },
        { texte: "$X = \\sqrt{Z^2 - R^2} = \\sqrt{115^2 - 30^2} = 111{,}0\\ \\Omega$, d'où $L = 111{,}0/314{,}16 = 0{,}3534\\ \\mathrm{H}$." },
        { texte: "$\\cos\\varphi = R/Z = 30/115 = 0{,}261$, soit $\\varphi = 74{,}9^\\circ$.", note: "Limite : une bobine à noyau de fer a aussi des pertes fer, qui augmentent la résistance apparente en alternatif, et une inductance qui dépend de la position de l'armature. Le modèle n'est valable qu'au point de mesure." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Triangle d'impédance de la bobine",
          unite: "Ω",
          somme: true,
          nomSomme: "Z = 115 Ω",
          vecteurs: [
            { id: "r", nom: "R = 30 Ω, mesure en continu", amplitude: 30, phase: 0, couleur: "serie-4" },
            { id: "x", nom: "X = 111,0 Ω, déduite", amplitude: xb, phase: 90, couleur: "serie-3" },
          ],
        });
      },
    })
  );

  /* Diagnostic industriel : condensateur et harmoniques. */
  const ic50 = 230 * W50 * 100e-6;
  const facteurCourant = Math.sqrt(1 + HARMONIQUES.reduce((s, h) => s + (h.rang * h.taux) ** 2, 0));
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Un condensateur qui chauffe",
      niveau: "diagnostic",
      enonce:
        "<p>Dans l'armoire d'un atelier équipé de plusieurs variateurs, un condensateur de $100\\ \\mu\\mathrm{F}$ branché entre phase et neutre chauffe anormalement. Le calcul donne $230 \\times 314{,}16 \\times 100 \\times 10^{-6} = 7{,}23\\ \\mathrm{A}$ ; la pince TRMS mesure $8{,}9\\ \\mathrm{A}$, alors que la tension efficace vraie vaut $230{,}9\\ \\mathrm{V}$. L'analyseur indique des tensions harmoniques de $6\\ \\%$ au rang $5$, $5\\ \\%$ au rang $7$, $3{,}5\\ \\%$ au rang $11$ et $3\\ \\%$ au rang $13$. Quelles conclusions sont justifiées ?</p>",
      options: [
        { texte: "L'impédance du condensateur est inversement proportionnelle à la fréquence : chaque tension harmonique produit un courant amplifié par son rang.", juste: true },
        { texte: "Le courant attendu vaut $7{,}23\\sqrt{1 + 0{,}30^2 + 0{,}35^2 + 0{,}385^2 + 0{,}39^2} \\approx 8{,}9\\ \\mathrm{A}$ : la mesure est cohérente.", juste: true },
        { texte: "Le condensateur a perdu de la capacité en vieillissant." },
        { texte: "La tension efficace étant presque nominale, l'écart vient forcément de la pince." },
        { texte: "Il faut relever le spectre du courant rang par rang et vérifier la tenue en courant du condensateur, puis envisager une self de protection ou un filtre.", juste: true },
      ],
      etapes: [
        { texte: "Au rang $h$, $|\\underline{Z}_C| = 1/(hC\\omega)$ : pour une tension harmonique $U_h$, le courant vaut $I_h = hC\\omega U_h$, soit, rapporté au fondamental, $h\\,U_h/U_1$." },
        { texte: "Rapports : $5 \\times 0{,}06 = 0{,}30$ ; $7 \\times 0{,}05 = 0{,}35$ ; $11 \\times 0{,}035 = 0{,}385$ ; $13 \\times 0{,}03 = 0{,}39$." },
        { texte: "Valeur efficace vraie : $7{,}23\\sqrt{1 + 0{,}09 + 0{,}1225 + 0{,}1482 + 0{,}1521} = 7{,}23 \\times 1{,}230 = 8{,}89\\ \\mathrm{A}$, alors que la tension n'a augmenté que de $0{,}4\\ \\%$." },
        { texte: "Les pertes, proportionnelles au carré du courant, augmentent d'environ $51\\ \\%$. Une perte de capacité ferait au contraire baisser le courant.", note: "Ce mécanisme sera repris, avec le risque de résonance, dans les cours Résonance série et parallèle et Harmoniques et qualité de l'énergie." },
      ],
      visuelCorrection(conteneur, moteur) {
        const spectre = moteur.sim.spectre(conteneur, {
          titre: "Courant du condensateur rang par rang, en ampères",
          genre: "Correction visuelle",
          xTitre: "rang harmonique",
          yTitre: "courant",
          unite: "A",
          barres: [{ etiquette: "1", valeur: ic50 }].concat(HARMONIQUES.map((h) => ({ etiquette: String(h.rang), valeur: ic50 * h.rang * h.taux }))),
          mesures: [
            { nom: "Fondamental", valeur: nombre(moteur, ic50, 2) + " A" },
            { nom: "Valeur efficace vraie", valeur: nombre(moteur, ic50 * facteurCourant, 2) + " A" },
          ],
        });
        if (spectre) ressources.push(spectre);
      },
    })
  );

  /* Conceptuel : l'impédance n'est pas un phaseur. */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Une impédance n'est pas une sinusoïde",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi une impédance n'a pas d'expression temporelle $z(t)$, alors qu'une tension et un courant en ont une. Pourquoi le rapport $u(t)/i(t)$ des valeurs instantanées ne peut-il pas servir d'impédance ?</p>",
      motsCles: [
        ["rapport", "quotient", "divis"],
        ["ne tourne pas", "constant", "independant du temps", "fixe", "pas une sinusoide", "pas une grandeur"],
        ["infini", "zero", "s annule", "varie", "dephas"],
        ["frequence", "operateur", "regime permanent"],
      ],
      minimum: 3,
      exemple: "Trois phrases : ce qu'est une impédance, pourquoi elle ne dépend pas du temps, et ce que devient u(t)/i(t) quand le courant passe par zéro.",
      etapes: [
        { texte: "Une tension et un courant sinusoïdaux sont des grandeurs qui varient dans le temps ; leurs phaseurs sont les photographies de vecteurs qui tournent ensemble." },
        { texte: "L'impédance est le quotient de deux phaseurs : la rotation commune $e^{j\\omega t}$ se simplifie, il reste un nombre complexe fixe, qui dépend de la fréquence mais pas du temps. C'est un opérateur, pas une grandeur sinusoïdale." },
        { texte: "Le rapport instantané $u(t)/i(t)$ varie sans cesse dès qu'il y a un déphasage : il devient infini quand le courant s'annule et s'annule avec la tension. Il ne vaut $R$ constamment que pour une résistance pure.", note: "L'impédance compare les amplitudes et les phases, pas les valeurs instantanées." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Le rapport u(t) / i(t) n'est pas constant",
          yTitre: "valeur",
          xMin: 0,
          xMax: 40,
          yMin: -120,
          yMax: 120,
          series: [
            { id: "u", nom: "u(t) / 3,25, en volts", couleur: "serie-1", epaisseur: 2, fonction: (t) => 100 * Math.cos((W50 * t) / 1000) },
            { id: "i", nom: "i(t) x 10, en ampères, retard 60°", couleur: "serie-4", epaisseur: 2, fonction: (t) => 100 * Math.cos((W50 * t) / 1000 - 60 * DEG) },
            {
              id: "r",
              nom: "u(t) / i(t), en ohms, borné à ±110",
              couleur: "serie-5",
              epaisseur: 2.6,
              fonction: (t) => {
                const i = Math.cos((W50 * t) / 1000 - 60 * DEG);
                const v = (32.5 * Math.cos((W50 * t) / 1000)) / i;
                return Math.abs(i) < 1e-3 ? NaN : borner(v, -110, 110);
              },
            },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 32.5, "|Z| = 32,5 Ω", false);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>La fréquence appliquée à un condensateur double. Que devient le module de son impédance ?</p>",
        options: ["Il double", "Il est divisé par deux", "Il ne change pas", "Il est divisé par quatre"],
        bonnes: [1],
        explication: "$|\\underline{Z}_C| = 1/(C\\omega)$ est inversement proportionnel à la fréquence : il est divisé par deux, et le courant double.",
        resume: "Condensateur et fréquence",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Pour $\\underline{Z} = 3 + j4\\ \\Omega$, la conductance vaut $1/3\\ \\mathrm{S}$.</p>",
        reponse: false,
        explication: "$\\underline{Y} = 1/(3 + j4) = (3 - j4)/25 = 0{,}12 - j0{,}16\\ \\mathrm{S}$ : $G = 0{,}12\\ \\mathrm{S}$. On inverse le complexe entier.",
        resume: "Conductance",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la réactance d'une inductance de $10\\ \\mathrm{mH}$ à $1\\ \\mathrm{kHz}$, en ohms ?</p>",
        valeur: 2 * Math.PI * 1000 * 0.01,
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$L\\omega = 0{,}01 \\times 2\\pi \\times 1000 = 62{,}83\\ \\Omega$.",
        resume: "Réactance inductive",
      },
      {
        type: "calcul",
        enonce: "<p>Une résistance de $40\\ \\Omega$ est en série avec un condensateur de réactance $-30\\ \\Omega$. Quel est le module de l'impédance, en ohms ?</p>",
        valeur: 50,
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$|40 - j30| = \\sqrt{1600 + 900} = 50\\ \\Omega$, et non $70\\ \\Omega$.",
        resume: "Module d'une association série",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi une inductance se comporte-t-elle comme un court-circuit en continu et comme un circuit ouvert aux fréquences très élevées ?</p>",
        motsCles: [["reactance", "proportionnel", "frequence", "omega"], ["nul", "zero", "court-circuit", "continu"], ["infini", "ouvert", "eleve", "grand"]],
        minimum: 2,
        explication:
          "Sa réactance $L\\omega$ est proportionnelle à la fréquence : nulle pour $\\omega = 0$, où la tension $L\\,\\mathrm{d}i/\\mathrm{d}t$ s'annule, et de plus en plus grande quand $\\omega$ croît, au point de bloquer le courant.",
        resume: "Inductance aux fréquences extrêmes",
      },
      {
        type: "calcul",
        enonce: "<p>Une résistance de $10\\ \\Omega$ est en parallèle avec une réactance inductive de $10\\ \\Omega$. Quel est l'argument de l'impédance équivalente, en degrés ?</p>",
        valeur: 45,
        unite: "°",
        tolerance: 0.01,
        chiffres: 0,
        explication: "$\\dfrac{10 \\times j10}{10 + j10} = \\dfrac{100\\angle 90^\\circ}{14{,}14\\angle 45^\\circ} = 7{,}07\\angle 45^\\circ = 5 + j5\\ \\Omega$.",
        resume: "Association parallèle",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Dans un circuit RLC série alimenté sous $230\\ \\mathrm{V}$, la tension aux bornes du condensateur peut dépasser $230\\ \\mathrm{V}$.</p>",
        reponse: true,
        explication: "Les tensions de $L$ et de $C$ sont en opposition de phase et se compensent en partie ; chacune peut être bien plus grande que la tension de la source, surtout près de $\\omega_0$.",
        resume: "Surtension partielle",
      },
      {
        type: "qcm",
        enonce: "<p>L'impédance d'un dipôle a pour argument $-30^\\circ$. Que peut-on dire ?</p>",
        options: ["Il est inductif, courant en retard de $30^\\circ$", "Il est capacitif, courant en avance de $30^\\circ$", "Il est purement résistif", "Il fournit de l'énergie active"],
        bonnes: [1],
        explication: "$\\varphi = \\varphi_u - \\varphi_i = -30^\\circ$ : le courant a une phase plus grande que la tension, il est en avance. Réactance négative : comportement capacitif.",
        resume: "Signe de l'argument",
      },
      {
        type: "schema",
        enonce: "<p>Quel point du plan des impédances représente un dipôle passif dont le courant est en avance sur la tension et qui dissipe de l'énergie ?</p>",
        consigne: "Cliquez sur l'étiquette du point correspondant.",
        viewBox: "0 0 600 340",
        description: "Quatre points du plan des impédances : A à 40 plus j30, B à 40 moins j30, C à moins j30, D à moins 40 moins j30",
        dessin: dessinPlanQuatrePoints("fl-l-p"),
        zones: [
          { x: 410, y: 60, largeur: 44, hauteur: 34, etiquette: "A" },
          { x: 410, y: 240, largeur: 44, hauteur: 34, etiquette: "B", juste: true },
          { x: 290, y: 240, largeur: 44, hauteur: 34, etiquette: "C" },
          { x: 156, y: 240, largeur: 44, hauteur: 34, etiquette: "D" },
        ],
        explication:
          "Courant en avance : réactance négative, sous l'axe réel. Dissipation : partie réelle strictement positive. Seul B convient ; C ne dissipe rien, D n'est pas passif, A est inductif.",
        resume: "Lecture du plan des impédances",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la fréquence $f_0$ d'un circuit RLC série avec $L = 10\\ \\mathrm{mH}$ et $C = 10\\ \\mu\\mathrm{F}$, en hertz ?</p>",
        valeur: 1 / (2 * Math.PI * Math.sqrt(0.01 * 10e-6)),
        unite: "Hz",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$f_0 = 1/(2\\pi\\sqrt{LC}) = 1/(2\\pi\\sqrt{10^{-7}}) = 503{,}3\\ \\mathrm{Hz}$ : en dessous, le circuit est capacitif ; au-dessus, inductif.",
        resume: "Fréquence où la réactance s'annule",
      },
    ],
    { titre: "Dix questions sur les impédances en régime sinusoïdal" }
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
      { categorie: "Définition", question: "Qu'est-ce que l'impédance complexe d'un dipôle ?", reponse: "$\\underline{Z} = \\underline{U}/\\underline{I} = R + jX$ en convention récepteur : module $U/I$, argument $\\varphi = \\varphi_u - \\varphi_i$." },
      { categorie: "Formule", question: "Impédances de $R$, $L$ et $C$ ?", reponse: "$R$ ; $jL\\omega$ ; $1/(jC\\omega) = -j/(C\\omega)$." },
      { categorie: "Déphasage", question: "Où est le courant par rapport à la tension dans $L$ et dans $C$ ?", reponse: "Inductance : courant en retard de $90^\\circ$. Condensateur : courant en avance de $90^\\circ$." },
      { categorie: "Fréquence", question: "Comment varient les réactances avec la fréquence ?", reponse: "$L\\omega$ croît comme $f$ ; $1/(C\\omega)$ décroît comme $1/f$. En continu, $L$ est un court-circuit et $C$ un circuit ouvert." },
      { categorie: "Admittance", question: "Que vaut la conductance de $\\underline{Z} = R + jX$ ?", reponse: "$G = R/(R^2 + X^2)$, et $B = -X/(R^2 + X^2)$ ; $G = 1/R$ seulement si $X = 0$." },
      { categorie: "Associations", question: "Comment associer des impédances ?", reponse: "En série, somme des impédances ; en parallèle, somme des admittances, ou $\\underline{Z}_1\\underline{Z}_2/(\\underline{Z}_1 + \\underline{Z}_2)$ pour deux." },
      { categorie: "Piège", question: "Une tension partielle peut-elle dépasser la tension totale ?", reponse: "Oui : les tensions se combinent vectoriellement. Exemple : $R$ et $L$ en série, $158{,}8 + 166{,}3 = 325\\ \\mathrm{V}$ sous $230\\ \\mathrm{V}$." },
      { categorie: "RLC série", question: "Quand un circuit RLC série est-il inductif ?", reponse: "Au-dessus de $\\omega_0 = 1/\\sqrt{LC}$, où $L\\omega > 1/(C\\omega)$ ; en dessous, il est capacitif ; en $\\omega_0$, $\\underline{Z} = R$." },
      { categorie: "Contrôle", question: "Comment contrôler un calcul de circuit sinusoïdal ?", reponse: "Kirchhoff sur les phaseurs ; valeur instantanée à $t = 0$ ; $\\operatorname{Re}(\\underline{U}\\,\\underline{I}^*) = \\sum R_kI_k^2$ ; Fresnel à main levée." },
      {
        categorie: "Industriel",
        question: "Comment estimer la chute de tension simple d'un câble par phase ?",
        reponse: "$\\Delta U \\approx (R\\cos\\varphi + X\\sin\\varphi)\\,I$ ; pour les petites sections, la résistance domine.",
        rappel: "Départ compresseur : 30 m en 10 mm², 1,63 V soit 0,71 %.",
      },
    ],
    { titre: "Dix cartes sur les impédances en régime sinusoïdal" }
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
        enonce: "<p>Quel est le module de l'impédance d'un condensateur de $47\\ \\mu\\mathrm{F}$ à $50\\ \\mathrm{Hz}$, en ohms ?</p>",
        valeur: 1 / (47e-6 * W50),
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$1/(C\\omega) = 1/(47 \\times 10^{-6} \\times 314{,}16) = 67{,}73\\ \\Omega$.",
        resume: "Réactance capacitive (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la conductance de $\\underline{Z} = 6 - j8\\ \\Omega$, en siemens ?</p>",
        valeur: 0.06,
        unite: "S",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$\\underline{Y} = (6 + j8)/100 = 0{,}06 + j0{,}08\\ \\mathrm{S}$ : $G = 0{,}06\\ \\mathrm{S}$, susceptance positive, dipôle capacitif.",
        resume: "Admittance (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Deux impédances en série de modules $30\\ \\Omega$ et $40\\ \\Omega$ ont toujours une impédance équivalente de module $70\\ \\Omega$.</p>",
        reponse: false,
        explication: "Seulement si elles ont le même argument. Pour $30$ et $j40$, on trouve $50\\ \\Omega$ ; pour $j30$ et $-j40$, $10\\ \\Omega$.",
        resume: "Association série (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est l'argument de $3 - j4$, en degrés ?</p>",
        valeur: Math.atan2(-4, 3) / DEG,
        unite: "°",
        tolerance: 0.01,
        chiffres: 2,
        explication: "Quatrième quadrant : $\\operatorname{atan2}(-4, 3) = -53{,}13^\\circ$, module $5$. Révisé du cours Nombres complexes et phaseurs.",
        resume: "Forme polaire (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la phase, en degrés, du phaseur de $i(t) = 10\\sin\\omega t$, la référence étant écrite en cosinus ?</p>",
        valeur: -90,
        unite: "°",
        tolerance: 0.01,
        chiffres: 0,
        explication: "$10\\sin\\omega t = 10\\cos(\\omega t - 90^\\circ)$ : $\\underline{I} = 7{,}07\\angle -90^\\circ\\ \\mathrm{A}$. Révisé du cours Nombres complexes et phaseurs.",
        resume: "Sinus et cosinus (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>La précharge du bus continu du variateur se fait par $47\\ \\Omega$ sur $2{,}2\\ \\mathrm{mF}$. Quelle est la constante de temps, en secondes ?</p>",
        valeur: 47 * 2.2e-3,
        unite: "s",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$\\tau = RC = 47 \\times 2{,}2 \\times 10^{-3} = 0{,}103\\ \\mathrm{s}$. Révisé du cours Régime transitoire RC ; pendant cette charge, l'impédance complexe ne s'applique pas.",
        resume: "Constante de temps (Régime transitoire RC)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la résistance d'un conducteur de cuivre de $85\\ \\mathrm{m}$ et $16\\ \\mathrm{mm^2}$ à $70\\ ^\\circ\\mathrm{C}$, avec $\\rho = 0{,}02063\\ \\Omega\\cdot\\mathrm{mm^2/m}$, en ohms ?</p>",
        valeur: (RHO70 * 85) / 16,
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 4,
        explication: "$R = \\rho\\ell/S = 0{,}02063 \\times 85/16 = 0{,}1096\\ \\Omega$. Révisé du cours Loi d'Ohm et résistivité : c'est la partie réelle de l'impédance du câble.",
        resume: "Résistance d'un câble (Loi d'Ohm et résistivité)",
      },
    ],
    { titre: "Révision espacée : cette séance et les cours précédents" }
  );
  if (quiz) ressources.push(quiz);
}

/* --------------------------------------------------------------------------
   P. Auto-évaluation
   -------------------------------------------------------------------------- */

function construireAutoEval(racine, api) {
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur les impédances en régime sinusoïdal ?",
  });
  if (auto) ressources.push(auto);
}
