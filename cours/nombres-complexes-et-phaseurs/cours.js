/* ==========================================================================
   cours/nombres-complexes-et-phaseurs/cours.js
   Nombres complexes et phaseurs.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;

/* Réseau du site : 230/400 V, 50 Hz. */
const W50 = 2 * Math.PI * 50;

/* Tableau du local technique, section H : courants efficaces et phases en degrés. */
const LOCAL = {
  iv: { x: 1.1 / Math.SQRT2, phi: -32.4 },
  ir: { x: 500 / 230, phi: 0 },
  il: { x: 0.8 / Math.SQRT2, phi: 30 },
};

/* Tableau général, section I : fondamental de la pompe et harmoniques. */
const POMPE = { fond: (Math.sqrt(6) / Math.PI) * (50 / Math.sqrt(2 / 3)), vrai: 50 };
POMPE.harm = Math.sqrt(POMPE.vrai ** 2 - POMPE.fond ** 2);

/* --------------------------------------------------------------------------
   Utilitaires
   -------------------------------------------------------------------------- */

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

/** Complexe depuis la forme polaire, angle en degrés. */
function polaire(module, degres) {
  return { re: module * Math.cos(degres * DEG), im: module * Math.sin(degres * DEG) };
}

function argument(z) {
  return Math.atan2(z.im, z.re) / DEG;
}

/** Angle ramené entre -180 et +180 degrés. */
function angleCentre(degres) {
  let a = ((degres % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return a;
}

/** Chemin SVG d'une courbe échantillonnée. */
function cheminCourbe(n, fx, fy) {
  let d = "";
  for (let k = 0; k <= n; k += 1) {
    const x = fx(k);
    const y = fy(k);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    d += (d ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
  }
  return d;
}

/** Marqueur de flèche, défini une fois par schéma. */
function marqueur(id) {
  return (
    '<marker id="' + id + '" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto-start-reverse">' +
    '<path d="M0 0 8 4 0 8Z" fill="currentColor"/></marker>'
  );
}

/** Arc de cercle en coordonnées SVG, angles mathématiques en degrés (sens trigonométrique positif). */
function cheminArc(cx, cy, r, a1, a2) {
  if (Math.abs(a2 - a1) < 0.5) return "";
  const x1 = cx + r * Math.cos(a1 * DEG);
  const y1 = cy - r * Math.sin(a1 * DEG);
  const x2 = cx + r * Math.cos(a2 * DEG);
  const y2 = cy - r * Math.sin(a2 * DEG);
  const grand = Math.abs(a2 - a1) > 180 ? 1 : 0;
  const sens = a2 > a1 ? 0 : 1;
  return "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "A" + r + " " + r + " 0 " + grand + " " + sens + " " + x2.toFixed(1) + " " + y2.toFixed(1);
}

/** Segment raccourci de quelques unités au bout, pour laisser la place à la pointe de flèche. */
function segment(x1, y1, x2, y2, retrait = 3) {
  const l = Math.hypot(x2 - x1, y2 - y1);
  if (l < retrait + 1) return "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + x2.toFixed(1) + " " + y2.toFixed(1);
  const k = (l - retrait) / l;
  return "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + (x1 + (x2 - x1) * k).toFixed(1) + " " + (y1 + (y2 - y1) * k).toFixed(1);
}

/** Ligne horizontale sur un tracé, avec motif de tirets et libellé. */
function ligneH(c, repere, couleurs, y, texte, motif, enDessous, gauche) {
  const py = repere.versY(y);
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.setLineDash(motif || [7, 5]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(repere.boite.x, py);
  c.lineTo(repere.boite.x + repere.boite.l, py);
  c.stroke();
  c.setLineDash([]);
  if (texte) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    c.textAlign = gauche ? "left" : "right";
    c.fillText(texte, gauche ? repere.boite.x + 4 : repere.boite.x + repere.boite.l - 4, py + (enDessous ? 14 : -6));
  }
  c.restore();
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

/** Point marqué sur un tracé, avec son libellé. */
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

/** Diagramme de phaseurs figé pour une correction : aucune rotation, aucune projection. */
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
  construireTournant(racine, api);
  construireQuadrant(racine, api);
  construireSomme(racine, api);
  construireDerivee(racine, api);
  construireDeparts(racine, api);
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
   Animations : tracé progressif des schémas statiques
   -------------------------------------------------------------------------- */

function construireDessinsStatiques(racine, api) {
  const schemas = [
    ["#e-plan-figure svg", 1.6],
    ["#f-schema-principal svg", 2.2],
    ["#h-circuit-figure svg", 1.8],
    ["#h-fresnel-figure svg", 1.6],
    ["#i-tableau-figure svg", 1.6],
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
      id: "c-module",
      titre: "Module d'un nombre complexe",
      niveau: "prérequis",
      enonce: "<p>Quel est le module de $z = 3 + j4$ ?</p>",
      valeur: 5,
      unite: "",
      tolerance: 0.01,
      libelleChamp: "Module $|z|$",
      etapes: [
        { texte: "Le module est la distance de l'origine au point $(3, 4)$ du plan complexe." },
        { texte: "Pythagore : $|z| = \\sqrt{3^2 + 4^2} = \\sqrt{25} = 5$.", note: "Le triangle $3$, $4$, $5$ reviendra souvent : c'est un facteur de puissance de $0{,}6$ ou $0{,}8$." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Le point 3 + j4 et ses deux composantes",
          vecteurs: [
            { id: "a", nom: "partie réelle 3", amplitude: 3, phase: 0, couleur: "serie-4", pointille: true },
            { id: "b", nom: "partie imaginaire 4", amplitude: 4, phase: 90, couleur: "serie-3", pointille: true },
            { id: "z", nom: "z, module 5", amplitude: 5, phase: 53.13, couleur: "serie-1" },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-argument",
      titre: "Argument dans le deuxième quadrant",
      niveau: "prérequis",
      enonce: "<p>Quel est l'argument, en degrés, de $z = -1 + j\\sqrt{3}$ ? Placez d'abord le point dans le plan.</p>",
      valeur: 120,
      unite: "°",
      tolerance: 0.01,
      libelleChamp: "Argument $\\theta$",
      etapes: [
        { texte: "Partie réelle négative, partie imaginaire positive : le point est dans le deuxième quadrant, l'argument est entre $90^\\circ$ et $180^\\circ$." },
        { texte: "$\\arctan(\\sqrt{3}/(-1)) = \\arctan(-\\sqrt{3}) = -60^\\circ$ : c'est l'angle du point opposé." },
        { texte: "On ajoute $180^\\circ$ : $\\theta = -60^\\circ + 180^\\circ = 120^\\circ$. Module : $\\sqrt{1 + 3} = 2$.", note: "Toujours placer le point avant de conclure : $\\arctan$ ne renvoie que des angles entre $-90^\\circ$ et $+90^\\circ$." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Le point -1 + j√3 et la réponse de la touche arc tangente",
          vecteurs: [
            { id: "z", nom: "z = 2 ∠ 120°", amplitude: 2, phase: 120, couleur: "serie-1" },
            { id: "faux", nom: "angle donné par atan(b / a)", amplitude: 2, phase: -60, couleur: "serie-5", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-somme-trigo",
      titre: "Une somme de cosinus et de sinus",
      niveau: "prérequis",
      enonce:
        "<p>On cherche à écrire $3\\cos\\omega t + 4\\sin\\omega t$ sous la forme $A\\cos(\\omega t - \\alpha)$. Développez $A\\cos(\\omega t - \\alpha)$ avec la formule d'addition et identifiez. Que vaut l'amplitude $A$ ?</p>",
      valeur: 5,
      unite: "",
      tolerance: 0.01,
      libelleChamp: "Amplitude $A$",
      etapes: [
        { texte: "$A\\cos(\\omega t - \\alpha) = A\\cos\\alpha\\cos\\omega t + A\\sin\\alpha\\sin\\omega t$." },
        { texte: "Identification : $A\\cos\\alpha = 3$ et $A\\sin\\alpha = 4$." },
        { texte: "En élevant au carré et en additionnant : $A^2 = 9 + 16 = 25$, donc $A = 5$ ; et $\\tan\\alpha = 4/3$, $\\alpha = 53{,}13^\\circ$.", note: "Ce calcul est exactement celui du module et de l'argument de $3 - j4$ : c'est ce que les phaseurs vont systématiser." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "La somme est une sinusoïde d'amplitude 5",
          yTitre: "valeur",
          xMin: 0,
          xMax: 40,
          yMin: -6,
          yMax: 6,
          series: [
            { id: "c", nom: "3 cos ωt", couleur: "serie-4", epaisseur: 1.6, fonction: (t) => 3 * Math.cos((W50 * t) / 1000) },
            { id: "s", nom: "4 sin ωt", couleur: "serie-3", epaisseur: 1.6, fonction: (t) => 4 * Math.sin((W50 * t) / 1000) },
            { id: "u", nom: "somme = 5 cos(ωt - 53,13°)", couleur: "serie-1", epaisseur: 2.8, fonction: (t) => 3 * Math.cos((W50 * t) / 1000) + 4 * Math.sin((W50 * t) / 1000) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 5, "amplitude 5", [7, 5], false);
            marquerPoint(c, repere, couleurs, (53.13 / 360) * 20, 5, "maximum à 2,95 ms", false);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : le vecteur tournant et son ombre
   -------------------------------------------------------------------------- */

function construireTournant(racine, api) {
  const conteneur = racine.querySelector("#d-tournant");
  if (!conteneur) return;

  const C = { x: 190, y: 160 };
  const R = 120;
  const UMAX = 400;
  const T0 = 320;
  const T1 = 580;
  const vx = (v) => C.x + (R * v) / UMAX;
  const vt = (deg) => T0 + ((T1 - T0) * deg) / 360;

  const svg = svgEl("svg", {
    viewBox: "0 0 720 610",
    role: "img",
    "aria-label": "Plan complexe avec un phaseur figé réglable et le vecteur tournant correspondant ; en dessous, bande des temps verticale où la partie réelle du vecteur tournant trace la sinusoïde ; à droite, les écritures temporelle, polaire et cartésienne",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-d-t");
  const fond = svgEl("g");
  let traits = "";
  let textes = "";
  for (let k = 0; k <= 4; k += 1) {
    const y = vt(90 * k);
    traits += "M" + (C.x - 5) + " " + y + "h10";
    textes += '<text x="' + (C.x - R - 12) + '" y="' + (y + 4) + '" text-anchor="end">' + 5 * k + " ms</text>";
  }
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8">' +
    '<path d="M' + (C.x - R - 24) + " " + C.y + "H" + (C.x + R + 30) + '" marker-end="url(#fl-d-t)"/>' +
    '<path d="M' + C.x + " " + (C.y + R + 20) + "V" + (C.y - R - 26) + '" marker-end="url(#fl-d-t)"/>' +
    '<path d="M' + C.x + " " + (T0 - 8) + "V" + (T1 + 22) + '" marker-end="url(#fl-d-t)"/>' +
    '<path d="M' + (C.x - R) + " " + (T0 - 8) + "H" + (C.x + R) + '" opacity="0.6"/>' +
    '<path d="' + traits + '"/>' +
    '<path d="M' + (C.x - R) + " " + (T0 - 12) + "v8M" + (C.x + R) + " " + (T0 - 12) + 'v8"/></g>' +
    '<circle cx="' + C.x + '" cy="' + C.y + '" r="' + R + '" stroke="currentColor" stroke-width="1" fill="none" stroke-dasharray="3 5" opacity="0.6"/>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5" opacity="0.9">' +
    '<text x="' + (C.x + R + 32) + '" y="' + (C.y + 16) + '" text-anchor="end">Re</text>' +
    '<text x="' + (C.x + 8) + '" y="' + (C.y - R - 14) + '">Im</text>' +
    '<text x="' + (C.x + 8) + '" y="' + (T1 + 20) + '">t</text>' +
    '<text x="' + (C.x - R) + '" y="' + (T0 - 16) + '" text-anchor="middle">-400 V</text>' +
    '<text x="' + (C.x + R) + '" y="' + (T0 - 16) + '" text-anchor="middle">+400 V</text>' +
    textes +
    "</g>";
  const courbeComplete = svgEl("path", { stroke: "currentColor", "stroke-width": 1.2, fill: "none", "stroke-dasharray": "1.5 4", opacity: 0.7 });
  const courbe = svgEl("path", { stroke: "currentColor", "stroke-width": 2.8, fill: "none", "stroke-linecap": "round" });
  const instant = svgEl("path", { stroke: "currentColor", "stroke-width": 1, fill: "none", opacity: 0.45 });
  const projection = svgEl("path", { stroke: "currentColor", "stroke-width": 1.2, fill: "none", "stroke-dasharray": "2 4", opacity: 0.85 });
  const arcPhi = svgEl("path", { stroke: "currentColor", "stroke-width": 1.3, fill: "none" });
  const fige = svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "stroke-dasharray": "9 6", "marker-end": "url(#fl-d-t)" });
  const tournant = svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-d-t)" });
  const points = svgEl("g", { fill: "currentColor" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  svg.append(defs, fond, courbeComplete, courbe, instant, projection, arcPhi, fige, tournant, points, etiquettes);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-tournant-valeurs", [
    { id: "um", libelle: "Amplitude Um", unite: "V", decimales: 1 },
    { id: "u", libelle: "Valeur efficace U = Um / √2", unite: "V", decimales: 1 },
    { id: "phi", libelle: "Phase à l'origine φ", unite: "°", decimales: 0 },
    { id: "a", libelle: "Partie réelle du phaseur efficace", unite: "V", decimales: 1 },
    { id: "b", libelle: "Partie imaginaire du phaseur efficace", unite: "V", decimales: 1 },
    { id: "wt", libelle: "Angle de rotation ωt", unite: "°", decimales: 0 },
    { id: "t", libelle: "Instant t à 50 Hz", unite: "ms", decimales: 2 },
    { id: "ut", libelle: "Valeur instantanée u(t)", unite: "V", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const etat = { um: 325.3, phi: 50, theta: 60 };
  let poignee = null;

  function dessiner() {
    const p0 = { x: vx(etat.um * Math.cos(etat.phi * DEG)), y: C.y - (R * etat.um * Math.sin(etat.phi * DEG)) / UMAX };
    const ang = etat.phi + etat.theta;
    const p1 = { x: vx(etat.um * Math.cos(ang * DEG)), y: C.y - (R * etat.um * Math.sin(ang * DEG)) / UMAX };
    fige.setAttribute("d", segment(C.x, C.y, p0.x, p0.y, 9));
    tournant.setAttribute("d", segment(C.x, C.y, p1.x, p1.y, 3));
    arcPhi.setAttribute("d", cheminArc(C.x, C.y, 30, 0, etat.phi));

    const n = 180;
    courbeComplete.setAttribute("d", cheminCourbe(n, (k) => vx(etat.um * Math.cos((etat.phi + (360 * k) / n) * DEG)), (k) => vt((360 * k) / n)));
    const m = Math.max(2, Math.round(etat.theta / 2));
    courbe.setAttribute("d", cheminCourbe(m, (k) => vx(etat.um * Math.cos((etat.phi + (etat.theta * k) / m) * DEG)), (k) => vt((etat.theta * k) / m)));

    const yt = vt(etat.theta);
    instant.setAttribute("d", "M" + (C.x - R) + " " + yt.toFixed(1) + "H" + (C.x + R));
    projection.setAttribute("d", "M" + p1.x.toFixed(1) + " " + p1.y.toFixed(1) + "V" + yt.toFixed(1));
    points.innerHTML =
      '<circle cx="' + p1.x.toFixed(1) + '" cy="' + C.y + '" r="4"/>' +
      '<circle cx="' + p1.x.toFixed(1) + '" cy="' + yt.toFixed(1) + '" r="5"/>';

    const u = etat.um / Math.SQRT2;
    const a = u * Math.cos(etat.phi * DEG);
    const b = u * Math.sin(etat.phi * DEG);
    const ut = etat.um * Math.cos(ang * DEG);
    const signe = (v) => (v < 0 ? "- " : "+ ");
    const X = 370;
    etiquettes.innerHTML =
      '<text x="' + X + '" y="40" font-weight="600">Expression temporelle</text>' +
      '<text x="' + X + '" y="62">u(t) = ' + nombre(api, etat.um, 1) + " cos(ωt " + signe(etat.phi) + nombre(api, Math.abs(etat.phi), 0) + "°)</text>" +
      '<text x="' + X + '" y="100" font-weight="600">Phaseur efficace, forme polaire</text>' +
      '<text x="' + X + '" y="122">U = ' + nombre(api, u, 1) + " ∠ " + nombre(api, etat.phi, 0) + "° V</text>" +
      '<text x="' + X + '" y="160" font-weight="600">Forme cartésienne</text>' +
      '<text x="' + X + '" y="182">U = ' + nombre(api, a, 1) + " " + signe(b) + "j" + nombre(api, Math.abs(b), 1) + " V</text>" +
      '<text x="' + X + '" y="220" font-weight="600">À l\'instant courant</text>' +
      '<text x="' + X + '" y="242">ωt = ' + nombre(api, etat.theta, 0) + "°, t = " + nombre(api, (etat.theta / 360) * 20, 2) + " ms</text>" +
      '<text x="' + X + '" y="264">u(t) = Re[√2 U e^(jωt)] = ' + nombre(api, ut, 1) + " V</text>" +
      '<text x="' + X + '" y="310" font-size="11.5">phaseur figé : tirets</text>' +
      '<text x="' + X + '" y="328" font-size="11.5">vecteur tournant : trait plein</text>' +
      '<text x="' + X + '" y="346" font-size="11.5">poignée : amplitude et phase</text>' +
      '<text x="' + (C.x + 36) + '" y="' + (C.y - 6) + '" font-size="11.5">φ</text>' +
      '<text x="' + (p1.x + 6).toFixed(1) + '" y="' + (yt - 8).toFixed(1) + '" font-size="11.5">u(t)</text>';

    if (valeurs) {
      valeurs.maj({ um: etat.um, u, phi: etat.phi, a, b, wt: etat.theta, t: (etat.theta / 360) * 20, ut });
    }
  }

  poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: C.x - R, y: C.y - R, largeur: 2 * R, hauteur: 2 * R },
    valeur: { x: vx(etat.um * Math.cos(etat.phi * DEG)), y: C.y - (R * etat.um * Math.sin(etat.phi * DEG)) / UMAX },
    pas: 2,
    libelle: "Pointe du phaseur figé : amplitude et phase",
    format: () => "amplitude " + nombre(api, etat.um, 0) + " volts, phase " + nombre(api, etat.phi, 0) + " degrés",
    diffuserAuDepart: false,
    rappel(mesure, controle) {
      const dx = mesure.x - C.x;
      const dy = C.y - mesure.y;
      const r = Math.hypot(dx, dy);
      const rBorne = borner(r, (R * 20) / UMAX, R);
      etat.um = Math.round((rBorne / R) * UMAX);
      etat.phi = Math.round(Math.atan2(dy, dx) / DEG);
      if (Math.abs(r - rBorne) > 0.5 && controle) {
        controle.set({ x: C.x + rBorne * Math.cos(etat.phi * DEG), y: C.y - rBorne * Math.sin(etat.phi * DEG) }, false);
      }
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const lecteur = api.sim.lecteur("#d-tournant-lecteur", {
    de: 0,
    a: 360,
    duree: 8,
    boucle: true,
    auto: false,
    libelle: "Faire tourner le vecteur sur une période",
    rappel(valeur) {
      etat.theta = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    /* Départ à 60 degrés de rotation pour que la construction soit visible sans lancer la lecture. */
    lecteur.definir(60);
  } else {
    dessiner();
  }
}

/* --------------------------------------------------------------------------
   E. Simulation : convertir sans se tromper de quadrant
   -------------------------------------------------------------------------- */

function construireQuadrant(racine, api) {
  const conteneur = racine.querySelector("#e-quadrant");
  if (!conteneur) return;

  const C = { x: 260, y: 220 };
  const K = 40;
  const svg = svgEl("svg", {
    viewBox: "0 0 640 440",
    role: "img",
    "aria-label": "Plan complexe gradué de moins 5 à plus 5, point déplaçable, argument correct et argument donné par l'arc tangente",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-q");
  const fond = svgEl("g");
  let traits = "";
  let textes = "";
  for (let k = -5; k <= 5; k += 1) {
    if (k === 0) continue;
    traits += "M" + (C.x + K * k) + " " + (C.y - 4) + "v8M" + (C.x - 4) + " " + (C.y - K * k) + "h8";
    textes +=
      '<text x="' + (C.x + K * k) + '" y="' + (C.y + 18) + '" text-anchor="middle">' + k + "</text>" +
      '<text x="' + (C.x - 8) + '" y="' + (C.y - K * k + 4) + '" text-anchor="end">' + k + "</text>";
  }
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.3" fill="none" opacity="0.75">' +
    '<path d="M' + (C.x - 210) + " " + C.y + "H" + (C.x + 218) + '" marker-end="url(#fl-e-q)"/>' +
    '<path d="M' + C.x + " " + (C.y + 210) + "V" + (C.y - 216) + '" marker-end="url(#fl-e-q)"/>' +
    '<path d="' + traits + '"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="10.5" opacity="0.8">' + textes +
    '<text x="' + (C.x + 214) + '" y="' + (C.y - 8) + '" text-anchor="end">Re</text>' +
    '<text x="' + (C.x + 8) + '" y="' + (C.y - 204) + '">Im</text></g>';
  const proj = svgEl("path", { stroke: "currentColor", "stroke-width": 1.1, fill: "none", "stroke-dasharray": "2 4", opacity: 0.8 });
  const faux = svgEl("path", { stroke: "currentColor", "stroke-width": 1.8, fill: "none", "stroke-dasharray": "8 5", opacity: 0.85, "marker-end": "url(#fl-e-q)" });
  const arcVrai = svgEl("path", { stroke: "currentColor", "stroke-width": 1.6, fill: "none" });
  const arcFaux = svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", "stroke-dasharray": "4 3" });
  const fleche = svgEl("path", { stroke: "currentColor", "stroke-width": 2.8, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-q)" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, proj, faux, arcFaux, arcVrai, fleche, etiquettes);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-quadrant-valeurs", [
    { id: "a", libelle: "Partie réelle a", decimales: 1 },
    { id: "b", libelle: "Partie imaginaire b", decimales: 1 },
    { id: "r", libelle: "Module r", decimales: 3 },
    { id: "vrai", libelle: "Argument atan2(b, a)", unite: "°", decimales: 2 },
    { id: "atan", libelle: "Angle donné par atan(b / a)", unite: "°", decimales: 2 },
    { id: "ecart", libelle: "Écart entre les deux", unite: "°", decimales: 1 },
    { id: "quadrant", libelle: "Position du point", format: (v) => ["sur un axe ou à l'origine", "premier quadrant", "deuxième quadrant", "troisième quadrant", "quatrième quadrant"][v] },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher(a, b) {
    const x = C.x + K * a;
    const y = C.y - K * b;
    const r = Math.hypot(a, b);
    const vrai = r > 1e-9 ? Math.atan2(b, a) / DEG : 0;
    const atanBrut = a !== 0 ? Math.atan(b / a) / DEG : NaN;
    const differe = Number.isFinite(atanBrut) && Math.abs(angleCentre(vrai - atanBrut)) > 0.5;
    proj.setAttribute("d", "M" + x.toFixed(1) + " " + y.toFixed(1) + "V" + C.y + "M" + x.toFixed(1) + " " + y.toFixed(1) + "H" + C.x);
    fleche.setAttribute("d", r > 0.05 ? segment(C.x, C.y, x, y, 9) : "");
    arcVrai.setAttribute("d", r > 0.05 ? cheminArc(C.x, C.y, 34, 0, vrai) : "");
    if (differe) {
      const xf = C.x + K * r * Math.cos(atanBrut * DEG);
      const yf = C.y - K * r * Math.sin(atanBrut * DEG);
      faux.setAttribute("d", segment(C.x, C.y, xf, yf, 3));
      arcFaux.setAttribute("d", cheminArc(C.x, C.y, 52, 0, atanBrut));
    } else {
      faux.setAttribute("d", "");
      arcFaux.setAttribute("d", "");
    }
    const quadrant = a > 0 && b > 0 ? 1 : a < 0 && b > 0 ? 2 : a < 0 && b < 0 ? 3 : a > 0 && b < 0 ? 4 : 0;
    const signe = b < 0 ? " - j" : " + j";
    etiquettes.innerHTML =
      '<text x="480" y="40" font-weight="600">z = ' + nombre(api, a, 1) + signe + nombre(api, Math.abs(b), 1) + "</text>" +
      '<text x="480" y="62">= ' + nombre(api, r, 2) + " ∠ " + nombre(api, vrai, 1) + "°</text>" +
      '<text x="480" y="96" font-size="11">atan(b / a) :</text>' +
      '<text x="480" y="114" font-size="11">' + (Number.isFinite(atanBrut) ? nombre(api, atanBrut, 1) + "°" : "indéfini, a = 0") + "</text>" +
      '<text x="480" y="132" font-size="11">' + (differe ? "faux de 180°" : "correct ici") + "</text>" +
      '<text x="480" y="390" font-size="10.5">vrai : trait plein</text>' +
      '<text x="480" y="406" font-size="10.5">atan(b / a) : tirets</text>';
    if (valeurs) {
      valeurs.maj({
        a,
        b,
        r,
        vrai,
        atan: atanBrut,
        ecart: Number.isFinite(atanBrut) ? Math.abs(angleCentre(vrai - atanBrut)) : NaN,
        quadrant,
      });
    }
  }

  const depart = { a: -3, b: 2 };
  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: C.x - 5 * K, y: C.y - 5 * K, largeur: 10 * K, hauteur: 10 * K },
    valeur: { x: C.x + K * depart.a, y: C.y - K * depart.b },
    pas: 4,
    libelle: "Point z dans le plan complexe",
    format: (mesure) => "a " + nombre(api, (mesure.x - C.x) / K, 1) + ", b " + nombre(api, (C.y - mesure.y) / K, 1),
    rappel(mesure) {
      const a = Math.round(((mesure.x - C.x) / K) * 10) / 10;
      const b = Math.round(((C.y - mesure.y) / K) * 10) / 10;
      afficher(a, b);
    },
  });
  if (poignee) ressources.push(poignee);
  else afficher(depart.a, depart.b);
}

/* --------------------------------------------------------------------------
   E. Simulation : additionner deux sinusoïdes de même fréquence
   -------------------------------------------------------------------------- */

function construireSomme(racine, api) {
  const conteneur = racine.querySelector("#e-somme");
  if (!conteneur) return;

  const C = { x: 300, y: 220 };
  const K = 0.33;
  const UMAX = 300;
  const svg = svgEl("svg", {
    viewBox: "0 0 600 440",
    role: "img",
    "aria-label": "Plan complexe des phaseurs efficaces U1 et U2 réglables, parallélogramme et somme U, dessinés à l'instant choisi",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-s");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.3" fill="none" opacity="0.75">' +
    '<path d="M' + (C.x - 230) + " " + C.y + "H" + (C.x + 236) + '" marker-end="url(#fl-e-s)"/>' +
    '<path d="M' + C.x + " " + (C.y + 214) + "V" + (C.y - 214) + '" marker-end="url(#fl-e-s)"/></g>' +
    '<circle cx="' + C.x + '" cy="' + C.y + '" r="' + 400 * K + '" stroke="currentColor" stroke-width="1" fill="none" stroke-dasharray="3 5" opacity="0.55"/>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11" opacity="0.85">' +
    '<text x="' + (C.x + 232) + '" y="' + (C.y - 8) + '" text-anchor="end">Re</text>' +
    '<text x="' + (C.x + 8) + '" y="' + (C.y - 202) + '">Im</text>' +
    '<text x="' + (C.x + 400 * K + 4) + '" y="' + (C.y + 16) + '">400 V</text></g>';
  const para = svgEl("path", { stroke: "currentColor", "stroke-width": 1.1, fill: "none", "stroke-dasharray": "2 4", opacity: 0.85 });
  const v1 = svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "none", "marker-end": "url(#fl-e-s)" });
  const v2 = svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "none", "stroke-dasharray": "8 5", "marker-end": "url(#fl-e-s)" });
  const somme = svgEl("path", { stroke: "currentColor", "stroke-width": 3.6, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-s)" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  svg.append(defs, fond, para, v1, v2, somme, etiquettes);
  conteneur.appendChild(svg);

  const etat = { u1: 230, p1: 0, u2: 230, p2: -120, theta: 0 };
  let synchro = false;
  let poignee1 = null;
  let poignee2 = null;
  let curseurs = null;

  const instantanee = (u, p) => (tms) => u * Math.SQRT2 * Math.cos((W50 * tms) / 1000 + p * DEG);
  function phaseurSomme() {
    const z1 = polaire(etat.u1, etat.p1);
    const z2 = polaire(etat.u2, etat.p2);
    return { re: z1.re + z2.re, im: z1.im + z2.im };
  }

  const traceur = api.sim.traceur("#e-somme-trace", {
    titre: "Tensions instantanées sur deux périodes",
    genre: "Simulation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "u",
    yUnite: "V",
    xMin: 0,
    xMax: 40,
    yMin: -880,
    yMax: 880,
    ratio: 0.4,
    echantillons: 500,
    series: [
      { id: "u1", nom: "u1(t)", couleur: "serie-4", epaisseur: 1.8 },
      { id: "u2", nom: "u2(t)", couleur: "serie-3", epaisseur: 1.8 },
      { id: "u", nom: "u1(t) + u2(t)", couleur: "serie-1", epaisseur: 3 },
    ],
    surDessin({ c, repere, couleurs }) {
      const t = (etat.theta / 360) * 20;
      ligneV(c, repere, couleurs, t, "instant étudié");
      const s = phaseurSomme();
      const us = Math.hypot(s.re, s.im) * Math.SQRT2 * Math.cos((W50 * t) / 1000 + argument(s) * DEG);
      marquerPoint(c, repere, couleurs, t, us, "", false);
    },
  });
  if (traceur) ressources.push(traceur);

  const valeurs = api.sim.valeurs("#e-somme-valeurs", [
    { id: "u", libelle: "Valeur efficace de la somme U", unite: "V", decimales: 1 },
    { id: "phi", libelle: "Phase de la somme", unite: "°", decimales: 1 },
    { id: "a", libelle: "Partie réelle de U", unite: "V", decimales: 1 },
    { id: "b", libelle: "Partie imaginaire de U", unite: "V", decimales: 1 },
    { id: "dphi", libelle: "Déphasage φ1 - φ2", unite: "°", decimales: 0 },
    { id: "arith", libelle: "Somme arithmétique U1 + U2", unite: "V", decimales: 1 },
    { id: "diff", libelle: "Différence |U1 - U2|", unite: "V", decimales: 1 },
    { id: "t", libelle: "Instant étudié t", unite: "ms", decimales: 2 },
    { id: "inst", libelle: "u1(t) + u2(t), calcul direct", unite: "V", decimales: 1 },
    { id: "instP", libelle: "Re[√2 U e^(jωt)], par le phaseur", unite: "V", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function pointe(u, p) {
    const ang = (p + etat.theta) * DEG;
    return { x: C.x + K * u * Math.cos(ang), y: C.y - K * u * Math.sin(ang) };
  }

  function dessiner() {
    const a = pointe(etat.u1, etat.p1);
    const b = pointe(etat.u2, etat.p2);
    const s = { x: a.x + b.x - C.x, y: a.y + b.y - C.y };
    v1.setAttribute("d", segment(C.x, C.y, a.x, a.y, 9));
    v2.setAttribute("d", segment(C.x, C.y, b.x, b.y, 9));
    somme.setAttribute("d", segment(C.x, C.y, s.x, s.y, 3));
    para.setAttribute("d", "M" + a.x.toFixed(1) + " " + a.y.toFixed(1) + "L" + s.x.toFixed(1) + " " + s.y.toFixed(1) + "L" + b.x.toFixed(1) + " " + b.y.toFixed(1));
    const z = phaseurSomme();
    const u = Math.hypot(z.re, z.im);
    etiquettes.innerHTML =
      '<text x="' + (a.x + 8).toFixed(1) + '" y="' + (a.y - 6).toFixed(1) + '">U1</text>' +
      '<text x="' + (b.x + 8).toFixed(1) + '" y="' + (b.y + 16).toFixed(1) + '">U2</text>' +
      (u > 10 ? '<text x="' + (s.x + 8).toFixed(1) + '" y="' + (s.y - 8).toFixed(1) + '" font-weight="600">U</text>' : "") +
      '<text x="12" y="22" font-size="11">U1 : trait plein fin ; U2 : tirets ; U : trait épais</text>' +
      '<text x="12" y="430" font-size="11">U = ' + nombre(api, u, 1) + " ∠ " + nombre(api, u > 1e-6 ? argument(z) : 0, 1) + "° V</text>";

    const t = (etat.theta / 360) * 20;
    if (traceur) {
      traceur.definirFonction("u1", instantanee(etat.u1, etat.p1));
      traceur.definirFonction("u2", instantanee(etat.u2, etat.p2));
      traceur.definirFonction("u", (x) => instantanee(etat.u1, etat.p1)(x) + instantanee(etat.u2, etat.p2)(x));
    }
    if (valeurs) {
      valeurs.maj({
        u,
        phi: u > 1e-6 ? argument(z) : 0,
        a: z.re,
        b: z.im,
        dphi: angleCentre(etat.p1 - etat.p2),
        arith: etat.u1 + etat.u2,
        diff: Math.abs(etat.u1 - etat.u2),
        t,
        inst: instantanee(etat.u1, etat.p1)(t) + instantanee(etat.u2, etat.p2)(t),
        instP: u * Math.SQRT2 * Math.cos((W50 * t) / 1000 + argument(z) * DEG),
      });
    }
  }

  function placerPoignees() {
    if (poignee1) poignee1.set(pointe(etat.u1, etat.p1), false);
    if (poignee2) poignee2.set(pointe(etat.u2, etat.p2), false);
  }

  function depuisPoignee(mesure, controle, cle) {
    if (synchro) return;
    synchro = true;
    const dx = mesure.x - C.x;
    const dy = C.y - mesure.y;
    const r = Math.hypot(dx, dy) / K;
    const u = Math.round(borner(r, 0, UMAX) / 5) * 5;
    const p = Math.round(angleCentre(Math.atan2(dy, dx) / DEG - etat.theta));
    etat["u" + cle] = u;
    etat["p" + cle] = p;
    if (curseurs) {
      curseurs.definir("u" + cle, u);
      curseurs.definir("p" + cle, p);
    }
    if (r > UMAX + 0.5 && controle) controle.set(pointe(u, p), false);
    dessiner();
    synchro = false;
  }

  const boite = { x: C.x - K * UMAX, y: C.y - K * UMAX, largeur: 2 * K * UMAX, hauteur: 2 * K * UMAX };
  poignee1 = api.sim.poignee(conteneur, {
    type: "zone",
    boite,
    valeur: pointe(etat.u1, etat.p1),
    pas: 2,
    libelle: "Pointe du phaseur U1",
    format: () => "U1 " + nombre(api, etat.u1, 0) + " volts, phase " + nombre(api, etat.p1, 0) + " degrés",
    diffuserAuDepart: false,
    rappel: (mesure, controle) => depuisPoignee(mesure, controle, 1),
  });
  if (poignee1) ressources.push(poignee1);
  poignee2 = api.sim.poignee(conteneur, {
    type: "zone",
    boite,
    valeur: pointe(etat.u2, etat.p2),
    pas: 2,
    libelle: "Pointe du phaseur U2",
    format: () => "U2 " + nombre(api, etat.u2, 0) + " volts, phase " + nombre(api, etat.p2, 0) + " degrés",
    diffuserAuDepart: false,
    rappel: (mesure, controle) => depuisPoignee(mesure, controle, 2),
  });
  if (poignee2) ressources.push(poignee2);

  curseurs = api.sim.curseurs(
    "#e-somme-curseurs",
    [
      { id: "u1", libelle: "Valeur efficace U1", min: 0, max: UMAX, pas: 5, valeur: etat.u1, unite: "V" },
      { id: "p1", libelle: "Phase φ1", min: -180, max: 180, pas: 1, valeur: etat.p1, unite: "°" },
      { id: "u2", libelle: "Valeur efficace U2", min: 0, max: UMAX, pas: 5, valeur: etat.u2, unite: "V" },
      { id: "p2", libelle: "Phase φ2", min: -180, max: 180, pas: 1, valeur: etat.p2, unite: "°" },
    ],
    (lues) => {
      if (synchro) return;
      synchro = true;
      Object.assign(etat, { u1: lues.u1, p1: lues.p1, u2: lues.u2, p2: lues.p2 });
      placerPoignees();
      dessiner();
      synchro = false;
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-somme-lecteur", {
    de: 0,
    a: 720,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Faire tourner les phaseurs et avancer l'instant étudié",
    rappel(valeur) {
      etat.theta = valeur;
      synchro = true;
      placerPoignees();
      synchro = false;
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Animation : dériver, c'est multiplier par j omega
   -------------------------------------------------------------------------- */

function construireDerivee(racine, api) {
  const conteneurPh = racine.querySelector("#e-derivee-phaseurs");
  if (!conteneurPh || !racine.querySelector("#e-derivee-trace")) return;
  const W0 = W50;
  const etat = { f: 50, t: 4 };
  const w = () => 2 * Math.PI * etat.f;

  const traceur = api.sim.traceur("#e-derivee-trace", {
    titre: "Un courant et sa dérivée",
    genre: "Animation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "valeur",
    yUnite: "A",
    xMin: 0,
    xMax: 40,
    yMin: -1.3,
    yMax: 1.3,
    ratio: 0.4,
    echantillons: 800,
    series: [
      { id: "i", nom: "i(t) = cos ωt", couleur: "serie-1", epaisseur: 2.8 },
      { id: "d", nom: "(di/dt) / ω0", couleur: "serie-5", epaisseur: 2 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, etat.t, "instant étudié");
      marquerPoint(c, repere, couleurs, etat.t, Math.cos((w() * etat.t) / 1000), "", false);
    },
  });
  if (traceur) ressources.push(traceur);

  const C = { x: 300, y: 135 };
  const K = 55;
  const svg = svgEl("svg", {
    viewBox: "0 0 600 270",
    role: "img",
    "aria-label": "Phaseur du courant et phaseur de sa dérivée divisée par omega zéro, à angle droit, dessinés à l'instant étudié",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-d");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7">' +
    '<path d="M' + (C.x - 130) + " " + C.y + "H" + (C.x + 136) + '" marker-end="url(#fl-e-d)"/>' +
    '<path d="M' + C.x + " " + (C.y + 124) + "V" + (C.y - 126) + '" marker-end="url(#fl-e-d)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11" opacity="0.85">' +
    '<text x="' + (C.x + 134) + '" y="' + (C.y - 8) + '" text-anchor="end">Re</text>' +
    '<text x="' + (C.x + 8) + '" y="' + (C.y - 114) + '">Im</text></g>';
  const angleDroit = svgEl("path", { stroke: "currentColor", "stroke-width": 1.2, fill: "none" });
  const vi = svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "marker-end": "url(#fl-e-d)" });
  const vd = svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "stroke-dasharray": "8 5", "marker-end": "url(#fl-e-d)" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, angleDroit, vi, vd, etiquettes);
  conteneurPh.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-derivee-valeurs", [
    { id: "w", libelle: "Pulsation ω", unite: "rad/s", decimales: 1 },
    { id: "rapport", libelle: "Amplitude relative ω / ω0", decimales: 3 },
    { id: "avance", libelle: "Avance de la dérivée", unite: "°", decimales: 0 },
    { id: "dt", libelle: "Avance en temps T / 4", unite: "ms", decimales: 2 },
    { id: "i", libelle: "i(t) à l'instant étudié", unite: "A", decimales: 3 },
    { id: "num", libelle: "(di/dt) / ω0 par différence finie", decimales: 4 },
    { id: "ph", libelle: "Re[jω e^(jωt)] / ω0 par le phaseur", decimales: 4 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const om = w();
    const r = om / W0;
    const ang = (om * etat.t) / 1000;
    const pi = { x: C.x + K * Math.cos(ang), y: C.y - K * Math.sin(ang) };
    const pd = { x: C.x + K * r * Math.cos(ang + Math.PI / 2), y: C.y - K * r * Math.sin(ang + Math.PI / 2) };
    vi.setAttribute("d", segment(C.x, C.y, pi.x, pi.y, 3));
    vd.setAttribute("d", segment(C.x, C.y, pd.x, pd.y, 3));
    const e = 10;
    const u1 = { x: Math.cos(ang), y: -Math.sin(ang) };
    const u2 = { x: Math.cos(ang + Math.PI / 2), y: -Math.sin(ang + Math.PI / 2) };
    angleDroit.setAttribute(
      "d",
      "M" + (C.x + e * u1.x).toFixed(1) + " " + (C.y + e * u1.y).toFixed(1) +
        "L" + (C.x + e * u1.x + e * u2.x).toFixed(1) + " " + (C.y + e * u1.y + e * u2.y).toFixed(1) +
        "L" + (C.x + e * u2.x).toFixed(1) + " " + (C.y + e * u2.y).toFixed(1)
    );
    etiquettes.innerHTML =
      '<text x="' + (pi.x + 8 * Math.cos(ang) - 6).toFixed(1) + '" y="' + (pi.y - 10 * Math.sin(ang) + 4).toFixed(1) + '">I</text>' +
      '<text x="' + (pd.x + 10 * Math.cos(ang + Math.PI / 2) - 10).toFixed(1) + '" y="' + (pd.y - 12 * Math.sin(ang + Math.PI / 2) + 4).toFixed(1) + '">jωI/ω0</text>' +
      '<text x="12" y="22" font-size="11">I : trait plein ; jωI / ω0 : tirets</text>' +
      '<text x="12" y="260" font-size="11">f = ' + nombre(api, etat.f, 0) + " Hz ; longueur relative " + nombre(api, r, 2) + "</text>";

    if (traceur) {
      traceur.definirPlage({ yMin: -Math.max(1.3, 1.15 * r), yMax: Math.max(1.3, 1.15 * r) });
      traceur.definirFonction("i", (x) => Math.cos((om * x) / 1000));
      traceur.definirFonction("d", (x) => (-om * Math.sin((om * x) / 1000)) / W0);
    }
    const h = 1e-6;
    const ts = etat.t / 1000;
    const num = (Math.cos(om * (ts + h)) - Math.cos(om * (ts - h))) / (2 * h) / W0;
    if (valeurs) {
      valeurs.maj({
        w: om,
        rapport: r,
        avance: 90,
        dt: 250 / etat.f,
        i: Math.cos(om * ts),
        num,
        ph: (-om * Math.sin(om * ts)) / W0,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-derivee-curseurs",
    [{ id: "f", libelle: "Fréquence f du courant", min: 10, max: 100, pas: 5, valeur: etat.f, unite: "Hz" }],
    (lues) => {
      etat.f = lues.f;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-derivee-lecteur", {
    de: 0,
    a: 40,
    duree: 14,
    boucle: true,
    auto: false,
    libelle: "Faire avancer l'instant étudié",
    rappel(valeur) {
      etat.t = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(4);
  } else {
    dessiner();
  }
}

/* --------------------------------------------------------------------------
   I. Simulation : somme des courants de départs du tableau général
   -------------------------------------------------------------------------- */

function courantsDeparts(etat) {
  const ic = etat.mode === 2 ? (etat.ic * 0.8) / etat.cosc : etat.ic;
  const liste = [
    { id: "p", nom: "P", x: POMPE.fond, phi: etat.phip },
    { id: "c", nom: "C", x: ic, phi: -Math.acos(etat.cosc) / DEG },
    { id: "e", nom: "E", x: 16, phi: -Math.acos(etat.cose) / DEG },
    { id: "a", nom: "A", x: 6, phi: -Math.acos(0.9) / DEG },
  ];
  let re = 0;
  let im = 0;
  for (const d of liste) {
    const z = polaire(d.x, d.phi);
    re += z.re;
    im += z.im;
  }
  return { liste, ic, somme: { re, im } };
}

function construireDeparts(racine, api) {
  const conteneur = racine.querySelector("#i-somme");
  if (!conteneur) return;

  const O = { x: 50, y: 70 };
  const K = 5;
  const svg = svgEl("svg", {
    viewBox: "0 0 640 340",
    role: "img",
    "aria-label": "Somme vectorielle des quatre courants de départ du tableau général, pointe à la suite de l'autre, et comparaison avec la somme arithmétique",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-i-s");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7">' +
    '<path d="M' + (O.x - 20) + " " + O.y + "H" + 620 + '" marker-end="url(#fl-i-s)"/>' +
    '<path d="M' + O.x + " " + 330 + "V" + 14 + '" marker-end="url(#fl-i-s)"/>' +
    '<path d="M' + O.x + " " + (O.y - 4) + "v8M" + (O.x + 50 * K) + " " + (O.y - 4) + "v8M" + (O.x + 100 * K) + " " + (O.y - 4) + 'v8"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11" opacity="0.85">' +
    '<text x="618" y="' + (O.y + 18) + '" text-anchor="end">Re</text>' +
    '<text x="' + (O.x + 8) + '" y="22">Im</text>' +
    '<text x="' + (O.x + 50 * K) + '" y="' + (O.y + 18) + '" text-anchor="middle">50 A</text>' +
    '<text x="' + (O.x + 100 * K) + '" y="' + (O.y + 18) + '" text-anchor="middle">100 A</text></g>';
  const arith = svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", "stroke-dasharray": "2 4" });
  const chaine = svgEl("g", { stroke: "currentColor", "stroke-width": 2.2, fill: "none" });
  const somme = svgEl("path", { stroke: "currentColor", "stroke-width": 3.4, fill: "none", "stroke-dasharray": "12 6", "marker-end": "url(#fl-i-s)" });
  const arc = svgEl("path", { stroke: "currentColor", "stroke-width": 1.3, fill: "none" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, arith, chaine, somme, arc, etiquettes);
  conteneur.appendChild(svg);

  const etat = { cosc: 0.8, ic: 32, mode: 1, cose: 0.95, phip: 0 };

  const valeurs = api.sim.valeurs("#i-somme-valeurs", [
    { id: "ic", libelle: "Courant du compresseur", unite: "A", decimales: 1 },
    { id: "i1", libelle: "Courant d'arrivée au fondamental", unite: "A", decimales: 1 },
    { id: "phi", libelle: "Angle du courant d'arrivée", unite: "°", decimales: 2 },
    { id: "cos", libelle: "Facteur de déplacement global", decimales: 3 },
    { id: "vrai", libelle: "Courant efficace vrai, harmoniques de la pompe compris", unite: "A", decimales: 1 },
    { id: "arith", libelle: "Somme arithmétique des valeurs efficaces", unite: "A", decimales: 1 },
    { id: "ecart", libelle: "Surestimation par la somme arithmétique", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const r = courantsDeparts(etat);
    let x = O.x;
    let y = O.y;
    let traits = "";
    let textes = "";
    for (const d of r.liste) {
      const z = polaire(d.x, d.phi);
      const x2 = x + K * z.re;
      const y2 = y - K * z.im;
      traits += '<path d="' + segment(x, y, x2, y2, 3) + '" marker-end="url(#fl-i-s)"/>';
      if (d.x > 1) {
        const mx = (x + x2) / 2;
        const my = (y + y2) / 2;
        textes += '<text x="' + (mx + 6).toFixed(1) + '" y="' + (my - 8).toFixed(1) + '">' + d.nom + "</text>";
      }
      x = x2;
      y = y2;
    }
    chaine.innerHTML = traits;
    somme.setAttribute("d", segment(O.x, O.y, x, y, 3));
    const i1 = Math.hypot(r.somme.re, r.somme.im);
    const phi = argument(r.somme);
    arc.setAttribute("d", cheminArc(O.x, O.y, 70, 0, phi));
    const totalArith = POMPE.vrai + r.ic + 16 + 6;
    arith.setAttribute("d", "M" + O.x + " " + (O.y - 16) + "H" + (O.x + K * totalArith).toFixed(1) + "M" + (O.x + K * totalArith).toFixed(1) + " " + (O.y - 22) + "v12");
    const vrai = Math.hypot(i1, POMPE.harm);
    etiquettes.innerHTML =
      textes +
      '<text x="' + (O.x + K * totalArith - 4).toFixed(1) + '" y="' + (O.y - 26) + '" text-anchor="end" font-size="11">somme arithmétique ' + nombre(api, totalArith, 1) + " A</text>" +
      '<text x="' + (x - 6).toFixed(1) + '" y="' + (y + 22).toFixed(1) + '" text-anchor="end" font-weight="600">I1 = ' + nombre(api, i1, 1) + " ∠ " + nombre(api, phi, 1) + "° A</text>" +
      '<text x="' + (O.x + 74) + '" y="' + (O.y + 34) + '" font-size="11">' + nombre(api, phi, 1) + "°</text>" +
      '<text x="70" y="302" font-size="11">P pompe, C compresseur, E éclairage, A automate : trait plein</text>' +
      '<text x="70" y="318" font-size="11">somme I1 : tirets épais ; référence des phases V1 sur l\'axe réel</text>' +
      '<text x="70" y="334" font-size="11">échelle : 50 A pour 250 unités</text>';
    if (valeurs) {
      valeurs.maj({
        ic: r.ic,
        i1,
        phi,
        cos: Math.cos(phi * DEG),
        vrai,
        arith: totalArith,
        ecart: (totalArith / vrai - 1) * 100,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-somme-curseurs",
    [
      { id: "cosc", libelle: "Facteur de déplacement du compresseur cos φc", min: 0.5, max: 1, pas: 0.01, valeur: etat.cosc, chiffres: 2 },
      { id: "ic", libelle: "Courant du compresseur à cos φc = 0,80", min: 0, max: 40, pas: 1, valeur: etat.ic, unite: "A" },
      {
        id: "mode",
        libelle: "Hypothèse sur le compresseur",
        min: 1,
        max: 2,
        pas: 1,
        valeur: etat.mode,
        format: (v) => (Math.round(v) === 2 ? "puissance active fixée" : "courant fixé"),
      },
      { id: "cose", libelle: "Facteur de déplacement de l'éclairage cos φe", min: 0.7, max: 1, pas: 0.01, valeur: etat.cose, chiffres: 2 },
      { id: "phip", libelle: "Angle du fondamental de la pompe", min: -20, max: 10, pas: 1, valeur: etat.phip, unite: "°" },
    ],
    (lues) => {
      etat.cosc = lues.cosc;
      etat.ic = lues.ic;
      etat.mode = Math.round(lues.mode);
      etat.cose = lues.cose;
      etat.phip = lues.phip;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  else dessiner();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/** Dessin d'exercice : quatre phaseurs A, B, C, D autour d'une référence. */
function dessinQuatrePhaseurs() {
  const c = { x: 300, y: 170 };
  const r = 120;
  const fl = (deg) => {
    const x = c.x + r * Math.cos(deg * DEG);
    const y = c.y - r * Math.sin(deg * DEG);
    return segment(c.x, c.y, x, y, 8);
  };
  return (
    "<defs>" + marqueur("fl-k-q") + "</defs>" +
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.6"><path d="M150 170H460M300 320V20"/></g>' +
    '<circle cx="300" cy="170" r="120" stroke="currentColor" stroke-width="1" fill="none" stroke-dasharray="3 5" opacity="0.5"/>' +
    '<g stroke="currentColor" stroke-width="2.4" fill="none">' +
    '<path d="' + fl(30) + '" marker-end="url(#fl-k-q)"/>' +
    '<path d="' + fl(-60) + '" marker-end="url(#fl-k-q)"/>' +
    '<path d="' + fl(120) + '" marker-end="url(#fl-k-q)"/>' +
    '<path d="' + fl(-30) + '" marker-end="url(#fl-k-q)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="14" font-weight="600">' +
    '<text x="414" y="106">A</text><text x="370" y="296">B</text><text x="214" y="60">C</text><text x="414" y="248">D</text></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
    '<text x="462" y="186">Re</text><text x="306" y="28">Im</text>' +
    '<text x="20" y="330">référence des phases : cos ωt, sur l\'axe réel ; graduations de 30° en 30°</text></g>'
  );
}

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : du temps au phaseur. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-phaseur",
      titre: "Phaseur d'une tension entre phases",
      niveau: "fondamental",
      enonce:
        "<p>La tension entre deux phases du réseau s'écrit $u_{12}(t) = 565{,}7\\cos(314{,}16\\,t - \\pi/6)$, en volts et en secondes. Écrivez son phaseur efficace en forme polaire, puis en forme cartésienne. Donnez sa partie réelle.</p>",
      valeur: 400 * Math.cos(30 * DEG),
      unite: "V",
      tolerance: 0.01,
      libelleChamp: "Partie réelle de $\\underline{U}_{12}$",
      etapes: [
        { texte: "Écriture déjà en cosinus : $U_m = 565{,}7\\ \\mathrm{V}$ et $\\varphi = -\\pi/6 = -30^\\circ$." },
        { texte: "Valeur efficace : $U = 565{,}7/\\sqrt{2} = 400{,}0\\ \\mathrm{V}$ ; forme polaire $\\underline{U}_{12} = 400\\angle -30^\\circ\\ \\mathrm{V}$." },
        { texte: "Forme cartésienne : $a = 400\\cos 30^\\circ = 346{,}4\\ \\mathrm{V}$ et $b = -400\\sin 30^\\circ = -200{,}0\\ \\mathrm{V}$." },
        { texte: "$\\underline{U}_{12} = 346{,}4 - j200{,}0\\ \\mathrm{V}$. Contrôle : $\\sqrt{346{,}4^2 + 200^2} = 400{,}0$.", note: "L'angle de $-30^\\circ$ n'est pas un hasard : c'est le décalage entre tension composée et tension simple, qui sera établi dans le cours Systèmes triphasés équilibrés." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Le phaseur et ses deux composantes",
          unite: "V",
          vecteurs: [
            { id: "a", nom: "partie réelle", amplitude: 346.4, phase: 0, couleur: "serie-4", pointille: true },
            { id: "b", nom: "partie imaginaire", amplitude: 200, phase: -90, couleur: "serie-3", pointille: true },
            { id: "u", nom: "U12", amplitude: 400, phase: -30, couleur: "serie-1" },
          ],
        });
      },
    })
  );

  /* Fondamental 2 : du phaseur au temps. */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-retour",
      titre: "Du phaseur à l'expression temporelle",
      niveau: "fondamental",
      enonce: "<p>Un analyseur indique le phaseur efficace $\\underline{I} = 3 - j4\\ \\mathrm{A}$ d'un courant à $50\\ \\mathrm{Hz}$, la tension d'alimentation étant la référence. Quelles affirmations sont exactes ?</p>",
      options: [
        { texte: "La valeur efficace du courant est $5\\ \\mathrm{A}$.", juste: true },
        { texte: "Sa phase à l'origine vaut $-53{,}13^\\circ$.", juste: true },
        { texte: "$i(t) = 5\\cos(314{,}16\\,t - 53{,}13^\\circ)$." },
        { texte: "$i(t) = 7{,}071\\cos(314{,}16\\,t - 0{,}927)$, l'angle étant en radians.", juste: true },
        { texte: "Le courant est en avance sur la tension." },
      ],
      etapes: [
        { texte: "Module : $\\sqrt{3^2 + 4^2} = 5\\ \\mathrm{A}$, valeur efficace." },
        { texte: "Point dans le quatrième quadrant, $a > 0$ : $\\varphi_i = \\arctan(-4/3) = -53{,}13^\\circ = -0{,}927\\ \\mathrm{rad}$." },
        { texte: "Amplitude : $I_m = 5\\sqrt{2} = 7{,}071\\ \\mathrm{A}$ ; l'expression avec $5$ comme amplitude oublie le facteur $\\sqrt{2}$." },
        { texte: "Phase négative par rapport à la tension de référence : courant en retard, $\\varphi = \\varphi_u - \\varphi_i = +53{,}13^\\circ$.", note: "$\\cos 53{,}13^\\circ = 0{,}6$ : c'est le facteur de puissance d'une charge très inductive." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Le courant, en retard de 53,13° sur la référence",
          yTitre: "i",
          yUnite: "A",
          xMin: 0,
          xMax: 40,
          yMin: -8.5,
          yMax: 8.5,
          series: [
            { id: "r", nom: "référence de phase, même amplitude", couleur: "serie-4", epaisseur: 1.6, fonction: (t) => 7.071 * Math.cos((W50 * t) / 1000) },
            { id: "i", nom: "i(t) = 7,071 cos(314,16 t - 0,927)", couleur: "serie-1", epaisseur: 2.8, fonction: (t) => 7.071 * Math.cos((W50 * t) / 1000 - 0.9273) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 5, "efficace 5 A", [7, 5], true, true);
            marquerPoint(c, repere, couleurs, (53.13 / 360) * 20, 7.071, "maximum 2,95 ms après la référence", false);
          },
        });
      },
    })
  );

  /* Intermédiaire 1 : somme de deux tensions, chute dans un câble. */
  const tete = { re: 230 + 8 * Math.cos(60 * DEG), im: 8 * Math.sin(60 * DEG) };
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-chute",
      titre: "Tension en tête d'un câble",
      niveau: "intermédiaire",
      enonce:
        "<p>Un récepteur reçoit $\\underline{U}_r = 230\\angle 0^\\circ\\ \\mathrm{V}$. La chute de tension dans son câble d'alimentation vaut $8\\ \\mathrm{V}$ efficaces, en avance de $60^\\circ$ sur $\\underline{U}_r$. La loi des mailles donne la tension en tête du câble : $\\underline{U}_t = \\underline{U}_r + \\underline{U}_c$. Quelle est sa valeur efficace ?</p>",
      valeur: Math.hypot(tete.re, tete.im),
      unite: "V",
      tolerance: 0.002,
      libelleChamp: "Valeur efficace $U_t$",
      etapes: [
        { texte: "Chute en cartésien : $\\underline{U}_c = 8\\cos 60^\\circ + j8\\sin 60^\\circ = 4{,}00 + j6{,}93\\ \\mathrm{V}$." },
        { texte: "Somme : $\\underline{U}_t = 234{,}00 + j6{,}93\\ \\mathrm{V}$." },
        { texte: "Module : $U_t = \\sqrt{234^2 + 6{,}93^2} = 234{,}10\\ \\mathrm{V}$ ; angle $\\arctan(6{,}93/234) = 1{,}70^\\circ$." },
        { texte: "La somme arithmétique, $238\\ \\mathrm{V}$, surestime la tension de tête : seule la composante de la chute en phase avec $\\underline{U}_r$, $4\\ \\mathrm{V}$, compte au premier ordre.", note: "C'est l'origine de la formule approchée de chute de tension $\\Delta U \\approx RI\\cos\\varphi + XI\\sin\\varphi$ du cours Dimensionnement des câbles." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Tension du récepteur, chute du câble et tension de tête",
          unite: "V",
          somme: true,
          nomSomme: "Ut = 234,1 V à 1,70°",
          vecteurs: [
            { id: "ur", nom: "Ur", amplitude: 230, phase: 0, couleur: "serie-4" },
            { id: "uc", nom: "Uc, échelle réelle", amplitude: 8, phase: 60, couleur: "serie-5" },
          ],
        });
      },
    })
  );

  /* Intermédiaire 2 : lecture de schéma, sinus et cosinus. */
  ressources.push(
    api.exercice.schema(cible, {
      id: "k-diagramme",
      titre: "Placer un courant écrit en sinus",
      niveau: "intermédiaire",
      consigne: "Cliquez sur le phaseur qui représente i(t), puis validez.",
      enonce:
        "<p>Le diagramme montre quatre phaseurs de même module, la référence des phases étant $\\cos\\omega t$ sur l'axe réel. Lequel représente $i(t) = 10\\sin(\\omega t + 30^\\circ)$ ?</p>",
      viewBox: "0 0 600 340",
      description: "Quatre phaseurs de même module : A à plus 30 degrés, B à moins 60 degrés, C à plus 120 degrés, D à moins 30 degrés",
      dessin: dessinQuatrePhaseurs(),
      zones: [
        { x: 402, y: 86, largeur: 40, hauteur: 28, etiquette: "phaseur A" },
        { x: 358, y: 276, largeur: 40, hauteur: 28, etiquette: "phaseur B", juste: true },
        { x: 202, y: 40, largeur: 40, hauteur: 28, etiquette: "phaseur C" },
        { x: 402, y: 228, largeur: 40, hauteur: 28, etiquette: "phaseur D" },
      ],
      etapes: [
        { texte: "Ramener au cosinus : $\\sin x = \\cos(x - 90^\\circ)$, donc $i(t) = 10\\cos(\\omega t + 30^\\circ - 90^\\circ) = 10\\cos(\\omega t - 60^\\circ)$." },
        { texte: "Le phaseur est à $-60^\\circ$, sous l'axe réel : c'est $B$, avec $\\underline{I} = 7{,}07\\angle -60^\\circ\\ \\mathrm{A}$." },
        { texte: "$A$, à $+30^\\circ$, est l'erreur qui oublie la conversion ; $C$, à $+120^\\circ$, ajoute $90^\\circ$ au lieu de les retrancher ; $D$, à $-30^\\circ$, change seulement le signe de la phase.", note: "Contrôle instantané : à $t = 0$, $10\\sin 30^\\circ = 5\\ \\mathrm{A}$ et $10\\cos(-60^\\circ) = 5\\ \\mathrm{A}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Le sinus d'origine et le cosinus du phaseur se superposent",
          yTitre: "i",
          yUnite: "A",
          xMin: 0,
          xMax: 40,
          yMin: -12,
          yMax: 12,
          series: [
            { id: "s", nom: "10 sin(ωt + 30°)", couleur: "serie-4", epaisseur: 5, fonction: (t) => 10 * Math.sin((W50 * t) / 1000 + 30 * DEG) },
            { id: "c", nom: "10 cos(ωt - 60°), phaseur B", couleur: "serie-1", epaisseur: 2, fonction: (t) => 10 * Math.cos((W50 * t) / 1000 - 60 * DEG) },
            { id: "a", nom: "10 cos(ωt + 30°), phaseur A", couleur: "serie-5", epaisseur: 1.4, fonction: (t) => 10 * Math.cos((W50 * t) / 1000 + 30 * DEG) },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 0, 5, "i(0) = 5 A", false);
          },
        });
      },
    })
  );

  /* Avancé : méthode des trois ampèremètres. */
  const cos2 = (40 * 40 - 25 * 25 - 20 * 20) / (2 * 25 * 20);
  const phi2 = Math.acos(cos2) / DEG;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-trois-amperemetres",
      titre: "Méthode des trois ampèremètres",
      niveau: "avancé",
      enonce:
        "<p>Un départ alimente en parallèle une résistance chauffante et un moteur. Trois pinces TRMS donnent : $I = 40\\ \\mathrm{A}$ sur l'arrivée, $I_1 = 25\\ \\mathrm{A}$ dans la résistance, en phase avec la tension, et $I_2 = 20\\ \\mathrm{A}$ dans le moteur. Les courants sont supposés sinusoïdaux. Quel est le déphasage du courant du moteur par rapport à la tension, en valeur absolue et en degrés ? Quel est son signe ?</p>",
      valeur: phi2,
      unite: "°",
      tolerance: 0.01,
      libelleChamp: "Déphasage $|\\varphi_2|$",
      etapes: [
        { texte: "Loi des nœuds en phaseurs : $\\underline{I} = \\underline{I}_1 + \\underline{I}_2$, avec $\\underline{I}_1 = 25\\angle 0^\\circ$ et $\\underline{I}_2 = 20\\angle\\theta$." },
        { texte: "Module au carré : $I^2 = I_1^2 + I_2^2 + 2I_1I_2\\cos\\theta$, soit $1\\,600 = 625 + 400 + 1\\,000\\cos\\theta$." },
        { texte: "$\\cos\\theta = 575/1\\,000 = 0{,}575$, d'où $|\\theta| = 54{,}90^\\circ$." },
        { texte: "Le module seul ne fixe pas le signe : $\\pm 54{,}90^\\circ$ donnent les mêmes lectures. Un moteur asynchrone est inductif : courant en retard, $\\theta = -54{,}90^\\circ$, $\\varphi_2 = +54{,}90^\\circ$." },
        { texte: "Contrôle : $\\underline{I} = 25 + 11{,}50 - j16{,}36 = 36{,}50 - j16{,}36$, de module $40{,}0\\ \\mathrm{A}$.", note: "Trois mesures de modules donnent un angle, mais pas son signe : le diagnostic doit s'appuyer sur la nature de la charge, ou sur une mesure de phase." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Les trois courants : I1, I2 et leur somme de 40 A",
          unite: "A",
          somme: true,
          nomSomme: "I = 40 A",
          vecteurs: [
            { id: "i1", nom: "I1", amplitude: 25, phase: 0, couleur: "serie-4" },
            { id: "i2", nom: "I2", amplitude: 20, phase: -phi2, couleur: "serie-3" },
          ],
        });
      },
    })
  );

  /* Diagnostic industriel. */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Des départs plus chargés que l'arrivée",
      niveau: "diagnostic",
      enonce:
        "<p>Sur la phase $L_1$ du tableau général, un technicien relève à la pince TRMS : pompe $50\\ \\mathrm{A}$, compresseur $32\\ \\mathrm{A}$, éclairage et prises $16\\ \\mathrm{A}$, armoire $6\\ \\mathrm{A}$, soit $104\\ \\mathrm{A}$ au total ; sur l'arrivée, il lit $99\\ \\mathrm{A}$. Quelles conclusions sont justifiées ?</p>",
      options: [
        { texte: "Les courants des départs n'ont pas tous la même phase : leur somme vectorielle est plus petite que la somme des valeurs efficaces.", juste: true },
        { texte: "Une valeur proche de $99\\ \\mathrm{A}$ est attendue : $97{,}7\\ \\mathrm{A}$ au fondamental et les harmoniques de la pompe en quadrature.", juste: true },
        { texte: "La pince de l'arrivée sous-estime de $5\\ \\%$ et doit être étalonnée." },
        { texte: "Un départ renvoie de l'énergie vers le jeu de barres." },
        { texte: "Si l'arrivée avait lu nettement plus que $104\\ \\mathrm{A}$, il faudrait chercher un départ oublié, une fuite ou une erreur de mesure.", juste: true },
      ],
      etapes: [
        { texte: "La loi des nœuds porte sur les valeurs instantanées, donc sur les phaseurs, pas sur les valeurs efficaces." },
        { texte: "Calcul de la section I : $\\underline{I}_1 = 93{,}9 - j26{,}8$, soit $97{,}7\\ \\mathrm{A}$, et $\\sqrt{97{,}7^2 + 14{,}8^2} = 98{,}8\\ \\mathrm{A}$ avec les harmoniques." },
        { texte: "La lecture de $99\\ \\mathrm{A}$ est donc cohérente ; rien n'indique une pince fausse ni un départ générateur, qui aurait au contraire un phaseur proche de $180^\\circ$." },
        { texte: "La somme des valeurs efficaces est un majorant : un courant d'arrivée qui la dépasse viole la loi des nœuds et signale un défaut de mesure ou un circuit oublié.", note: "Le contrôle par majorant est un outil de diagnostic rapide, valable quelles que soient les phases." },
      ],
      visuelCorrection(conteneur, moteur) {
        const r = courantsDeparts({ cosc: 0.8, ic: 32, mode: 1, cose: 0.95, phip: 0 });
        fresnelCorrection(moteur, conteneur, {
          titre: "Les quatre départs et leur somme au fondamental",
          unite: "A",
          somme: true,
          nomSomme: "I1 = 97,7 A à -15,9°",
          vecteurs: r.liste.map((d, k) => ({
            id: d.id,
            nom: ["pompe, fondamental", "compresseur", "éclairage", "automate"][k],
            amplitude: d.x,
            phase: d.phi,
            couleur: "serie-" + (k + 2),
          })),
        });
      },
    })
  );

  /* Conceptuel. */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Quand le phaseur ne s'applique pas",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi on ne peut pas représenter par un seul phaseur le courant de précharge du bus continu du variateur à la mise sous tension, ni le courant en créneaux absorbé ensuite en régime établi. Que fait-on à la place ?</p>",
      motsCles: [
        ["transitoire", "exponentiel", "regime permanent", "permanent"],
        ["frequence", "harmonique", "plusieurs", "meme pulsation"],
        ["lineaire", "non lineaire", "diode", "pont"],
        ["fondamental", "decompos", "carres", "fourier", "temporel", "simulation"],
      ],
      minimum: 3,
      exemple: "Trois phrases : ce que suppose un phaseur, ce qui manque dans chacun des deux cas, et la méthode de remplacement.",
      etapes: [
        { texte: "Un phaseur représente une sinusoïde unique, de fréquence connue, en régime permanent, dans un circuit linéaire." },
        { texte: "La précharge est un régime transitoire : une exponentielle de constante de temps $\\tau = 0{,}103\\ \\mathrm{s}$, qui ne tourne pas ; on la traite par l'équation différentielle, comme dans le cours Régime transitoire RC." },
        { texte: "En régime établi, le pont de diodes est non linéaire et le courant en créneaux contient plusieurs fréquences : un phaseur par fréquence, et l'on combine les valeurs efficaces par la somme des carrés." },
        { texte: "Dans la pratique, on garde le phaseur du fondamental pour les bilans à $50\\ \\mathrm{Hz}$, et on traite les harmoniques à part.", note: "Ce découpage sera rendu systématique par la série de Fourier." },
      ],
      visuelCorrection(conteneur, moteur) {
        const id = 50 / Math.sqrt(2 / 3);
        traceCorrection(moteur, conteneur, {
          titre: "Courant en créneaux et son seul fondamental",
          yTitre: "i",
          yUnite: "A",
          xMin: 0,
          xMax: 40,
          yMin: -85,
          yMax: 85,
          series: [
            {
              id: "c",
              nom: "créneaux de 120°, 50 A vrais",
              couleur: "serie-4",
              epaisseur: 2,
              fonction: (t) => {
                const th = ((((W50 * t) / 1000) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                if (Math.abs(th - Math.PI / 2) <= Math.PI / 3) return id;
                if (Math.abs(th - (3 * Math.PI) / 2) <= Math.PI / 3) return -id;
                return 0;
              },
            },
            { id: "f", nom: "fondamental, 47,7 A : seul représentable par un phaseur", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => POMPE.fond * Math.SQRT2 * Math.sin((W50 * t) / 1000) },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

/** Dessin de la question de quiz : tension de référence et trois courants. */
function dessinTroisCourants() {
  const c = { x: 300, y: 150 };
  const r = 100;
  const fl = (deg, l) => segment(c.x, c.y, c.x + l * Math.cos(deg * DEG), c.y - l * Math.sin(deg * DEG), 8);
  return (
    "<defs>" + marqueur("fl-l-q") + "</defs>" +
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.6"><path d="M150 150H470M300 270V30"/></g>' +
    '<path d="' + fl(0, 150) + '" stroke="currentColor" stroke-width="3.4" fill="none" marker-end="url(#fl-l-q)"/>' +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-dasharray="8 5">' +
    '<path d="' + fl(30, r) + '" marker-end="url(#fl-l-q)"/>' +
    '<path d="' + fl(-30, r) + '" marker-end="url(#fl-l-q)"/>' +
    '<path d="' + fl(-150, r) + '" marker-end="url(#fl-l-q)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13" font-weight="600">' +
    '<text x="456" y="140">U</text><text x="392" y="96">I1</text><text x="392" y="216">I2</text><text x="186" y="216">I3</text></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
    '<text x="20" y="286">U : trait épais, référence ; courants : tirets ; angles de 30° et 150°</text></g>'
  );
}

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Quelle opération se fait le plus simplement en forme polaire ?</p>",
        options: ["L'addition", "La multiplication", "La soustraction", "Le passage à la partie réelle"],
        bonnes: [1],
        explication: "En polaire, on multiplie les modules et on ajoute les angles. Addition, soustraction et partie réelle se font en cartésien.",
        resume: "Forme adaptée au produit",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Le phaseur efficace de $i(t) = 10\\sin\\omega t$ est $7{,}07\\angle 0^\\circ\\ \\mathrm{A}$, avec la référence en cosinus.</p>",
        reponse: false,
        explication: "$10\\sin\\omega t = 10\\cos(\\omega t - 90^\\circ)$ : le phaseur est $7{,}07\\angle -90^\\circ = -j7{,}07\\ \\mathrm{A}$.",
        resume: "Sinus et cosinus",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est le module de $-6 + j8$ ?</p>",
        valeur: 10,
        unite: "",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$\\sqrt{36 + 64} = 10$. Le signe des parties ne change pas le module.",
        resume: "Module",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est l'argument de $-1 - j$, en degrés, entre $-180^\\circ$ et $+180^\\circ$ ?</p>",
        valeur: -135,
        unite: "°",
        tolerance: 0.01,
        chiffres: 0,
        explication: "Troisième quadrant : $\\arctan(1) = 45^\\circ$, moins $180^\\circ$, soit $-135^\\circ$. La réponse $45^\\circ$ désigne le point opposé $1 + j$.",
        resume: "Argument et quadrant",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi peut-on laisser de côté le facteur $e^{j\\omega t}$ et ne garder que le phaseur dans un circuit alimenté par le réseau ?</p>",
        motsCles: [["meme frequence", "meme pulsation", "commun", "toutes"], ["tourne", "rotation", "ensemble"], ["lineaire", "regime permanent", "permanent"]],
        minimum: 2,
        explication:
          "Dans un circuit linéaire en régime permanent, toutes les grandeurs ont la pulsation de la source : le facteur $e^{j\\omega t}$, commun à toutes, ne distingue rien. Seuls les modules et les angles relatifs portent l'information.",
        resume: "Rôle de la rotation commune",
      },
      {
        type: "calcul",
        enonce: "<p>Calculez $(4\\angle 20^\\circ) \\times (2\\angle -50^\\circ)$. Donnez l'argument du résultat, en degrés.</p>",
        valeur: -30,
        unite: "°",
        tolerance: 0.01,
        chiffres: 0,
        explication: "Modules multipliés, $4 \\times 2 = 8$ ; angles ajoutés, $20^\\circ - 50^\\circ = -30^\\circ$ : $8\\angle -30^\\circ$.",
        resume: "Produit en polaire",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Deux courants de $10\\ \\mathrm{A}$ efficaces, de même fréquence et en quadrature, ont une somme de $14{,}1\\ \\mathrm{A}$ efficaces.</p>",
        reponse: true,
        explication: "$|10 + j10| = 10\\sqrt{2} = 14{,}14\\ \\mathrm{A}$, et non $20\\ \\mathrm{A}$.",
        resume: "Somme en quadrature",
      },
      {
        type: "qcm",
        enonce: "<p>Que fait la multiplication d'un phaseur par $j$ ?</p>",
        options: ["Elle double son module", "Elle le fait tourner de $+90^\\circ$ sans changer son module", "Elle le fait tourner de $-90^\\circ$", "Elle donne son conjugué"],
        bonnes: [1],
        explication: "$j = 1\\angle 90^\\circ$ : module multiplié par $1$, angle augmenté de $90^\\circ$. C'est l'effet d'une dérivation, au facteur $\\omega$ près.",
        resume: "Opérateur j",
      },
      {
        type: "schema",
        enonce: "<p>La tension $\\underline{U}$ est la référence. Quel courant est en retard de $30^\\circ$ sur elle ?</p>",
        consigne: "Cliquez sur l'étiquette du courant en retard de 30°.",
        viewBox: "0 0 600 295",
        description: "Tension de référence U sur l'axe réel ; courant I1 à plus 30 degrés, I2 à moins 30 degrés, I3 à moins 150 degrés",
        dessin: dessinTroisCourants(),
        zones: [
          { x: 382, y: 78, largeur: 40, hauteur: 26, etiquette: "I1" },
          { x: 382, y: 198, largeur: 40, hauteur: 26, etiquette: "I2", juste: true },
          { x: 176, y: 198, largeur: 40, hauteur: 26, etiquette: "I3" },
        ],
        explication:
          "En retard signifie un angle plus petit, tourné dans le sens horaire depuis $\\underline{U}$ : $\\underline{I}_2$ à $-30^\\circ$. $\\underline{I}_1$ est en avance de $30^\\circ$ ; $\\underline{I}_3$ est en retard de $150^\\circ$, presque en opposition.",
        resume: "Lecture d'un diagramme",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la partie réelle du phaseur efficace de $u(t) = 311\\cos(\\omega t + 45^\\circ)$, en volts ?</p>",
        valeur: (311 / Math.SQRT2) * Math.cos(45 * DEG),
        unite: "V",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$U = 311/\\sqrt{2} = 219{,}9\\ \\mathrm{V}$, puis $a = 219{,}9\\cos 45^\\circ = 155{,}5\\ \\mathrm{V}$.",
        resume: "Composante en phase",
      },
    ],
    { titre: "Dix questions sur les nombres complexes et les phaseurs" }
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
      { categorie: "Définition", question: "Comment passe-t-on de la forme cartésienne à la forme polaire ?", reponse: "$r = \\sqrt{a^2 + b^2}$ et $\\theta = \\operatorname{atan2}(b, a)$ ; retour par $a = r\\cos\\theta$, $b = r\\sin\\theta$." },
      { categorie: "Piège", question: "Quand $\\arctan(b/a)$ donne-t-il un argument faux ?", reponse: "Dès que $a < 0$ : il se trompe de $180^\\circ$ et désigne le point opposé. Exemple : $-3 - j4 = 5\\angle -126{,}87^\\circ$, pas $53{,}13^\\circ$." },
      { categorie: "Formule", question: "Que dit la formule d'Euler et que représente $e^{j\\omega t}$ ?", reponse: "$e^{j\\theta} = \\cos\\theta + j\\sin\\theta$ ; $e^{j\\omega t}$ est un point du cercle unité qui tourne dans le sens trigonométrique, un tour par période." },
      { categorie: "Opérations", question: "Quelle forme pour quelle opération ?", reponse: "Addition et soustraction en cartésien ; produit, quotient, dérivée en polaire : modules multipliés ou divisés, angles ajoutés ou retranchés." },
      { categorie: "Définition", question: "Quel est le phaseur efficace de $x(t) = X_m\\cos(\\omega t + \\varphi)$ ?", reponse: "$\\underline{X} = (X_m/\\sqrt{2})\\angle\\varphi$, et $x(t) = \\operatorname{Re}[\\sqrt{2}\\,\\underline{X}e^{j\\omega t}]$." },
      { categorie: "Conversion", question: "Comment traiter une grandeur écrite en sinus ?", reponse: "La ramener au cosinus : $\\sin(\\omega t + \\alpha) = \\cos(\\omega t + \\alpha - 90^\\circ)$, avant d'écrire le phaseur." },
      { categorie: "Propriété", question: "Que deviennent dérivée et intégrale en phaseurs ?", reponse: "Dériver multiplie par $j\\omega$ : avance de $90^\\circ$, module $\\times\\,\\omega$. Intégrer divise par $j\\omega$ : retard de $90^\\circ$." },
      { categorie: "Hypothèses", question: "Quelles conditions exige la méthode des phaseurs ?", reponse: "Circuit linéaire, fréquence unique commune, régime permanent sinusoïdal. Harmoniques et transitoires se traitent à part." },
      { categorie: "Contrôle", question: "Comment contrôler une somme de phaseurs ?", reponse: "Fresnel à main levée ; valeur instantanée à $t = 0$ égale à la somme des termes ; module entre la différence et la somme des modules." },
      {
        categorie: "Industriel",
        question: "Pourquoi le courant d'arrivée d'un tableau est-il inférieur à la somme des courants de départs ?",
        reponse: "Les départs n'ont pas la même phase : la loi des nœuds porte sur les phaseurs, dont la somme est au plus égale à la somme des modules.",
        rappel: "Tableau général : 104 A en somme arithmétique, 97,7 A au fondamental, 98,8 A efficaces vrais.",
      },
    ],
    { titre: "Dix cartes sur les nombres complexes et les phaseurs" }
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
        enonce: "<p>Quelle est la partie imaginaire de $50\\angle -120^\\circ$ ?</p>",
        valeur: 50 * Math.sin(-120 * DEG),
        unite: "",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$b = 50\\sin(-120^\\circ) = -43{,}30$ ; la partie réelle vaut $50\\cos(-120^\\circ) = -25$.",
        resume: "Polaire vers cartésien (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Une inductance de $20\\ \\mathrm{mH}$ est parcourue par un courant sinusoïdal de $5\\ \\mathrm{A}$ efficaces à $50\\ \\mathrm{Hz}$. Avec la règle de dérivation, quelle est la valeur efficace de sa tension, en volts ?</p>",
        valeur: W50 * 0.02 * 5,
        unite: "V",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$\\underline{U} = jL\\omega\\,\\underline{I}$, donc $U = L\\omega I = 0{,}02 \\times 314{,}16 \\times 5 = 31{,}42\\ \\mathrm{V}$, en avance de $90^\\circ$.",
        resume: "Dérivée en phaseur (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>On peut additionner sur un même diagramme le phaseur d'un courant à $50\\ \\mathrm{Hz}$ et celui d'un courant à $150\\ \\mathrm{Hz}$.</p>",
        reponse: false,
        explication: "Leur angle relatif varie sans cesse ; on combine leurs valeurs efficaces par la somme des carrés.",
        resume: "Fréquence unique (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>À $50\\ \\mathrm{Hz}$, un courant passe par zéro en montant $3\\ \\mathrm{ms}$ après la tension. Quel est le déphasage, en degrés ?</p>",
        valeur: 54,
        unite: "°",
        tolerance: 0.01,
        chiffres: 0,
        explication: "$\\varphi = 360^\\circ \\times 3/20 = 54^\\circ$, courant en retard. Révisé du cours Signaux périodiques et sinusoïdes.",
        resume: "Déphasage (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la valeur crête d'une tension sinusoïdale de $400\\ \\mathrm{V}$ efficaces, en volts ?</p>",
        valeur: 400 * Math.SQRT2,
        unite: "V",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$U_m = 400\\sqrt{2} = 565{,}7\\ \\mathrm{V}$. Révisé du cours Signaux périodiques et sinusoïdes.",
        resume: "Crête et efficace (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>La bobine du contacteur KM1, de $1{,}2\\ \\mathrm{H}$, est parcourue par $0{,}5\\ \\mathrm{A}$. Quelle énergie magnétique stocke-t-elle, en joules ?</p>",
        valeur: 0.5 * 1.2 * 0.25,
        unite: "J",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$W = \\tfrac{1}{2}LI^2 = 0{,}5 \\times 1{,}2 \\times 0{,}25 = 0{,}15\\ \\mathrm{J}$. Révisé du cours Inductances et champ magnétique.",
        resume: "Énergie magnétique (Inductances et champ magnétique)",
      },
      {
        type: "calcul",
        enonce: "<p>Développez $(1 + j)^2$. Quelle est sa partie imaginaire ?</p>",
        valeur: 2,
        unite: "",
        tolerance: 0.01,
        chiffres: 0,
        explication: "$(1 + j)^2 = 1 + 2j + j^2 = 2j$ : partie réelle nulle, partie imaginaire $2$. En polaire : $(\\sqrt{2}\\angle 45^\\circ)^2 = 2\\angle 90^\\circ$. Révisé du cours Diagnostic initial et remise à niveau mathématique.",
        resume: "Calcul complexe (Diagnostic initial)",
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
    titre: "Où en suis-je sur les nombres complexes et les phaseurs ?",
  });
  if (auto) ressources.push(auto);
}
