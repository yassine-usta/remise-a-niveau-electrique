/* ==========================================================================
   cours/circuits-magnetiques/cours.js
   Circuits magnétiques : excitation, induction et flux, théorème d'Ampère,
   réluctance et loi d'Hopkinson, entrefer, inductance et énergie, saturation,
   formule de Boucherot et courant magnétisant, hystérésis, courants de
   Foucault, et dimensionnement de la self anti-harmonique du site.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const MU0 = 4 * Math.PI * 1e-7;
const RHO_FER = 7650;

/* Tôle de qualité courante : mu_r voisin de 2000 sous 1 T, coude vers 1,5 T. */
const TOLE = { a: 398, c: 7.5 };
/* Tôle de la self anti-harmonique : mu_r voisin de 4000 sous le coude. */
const TOLE_SELF = { a: 199, c: 7.5 };

/* Noyau de l'exemple numérique. */
const EX = { l: 0.4, S: 16e-4, N: 500, e: 1e-3, mur: 2000 };
/* Self anti-harmonique du projet fil rouge. */
const SELF = { L: 5.11e-3, C: 138.8e-6, S: 20e-4, l: 0.3, N: 43, e: 0.8344e-3 };

/** Excitation dans le fer, en A/m, pour une induction b en teslas (fonction impaire). */
function hFer(b, tole = TOLE) {
  return tole.a * b + tole.c * Math.pow(b, 13);
}

/** Induction dans le fer pour une excitation donnée (inverse de hFer). */
function bDeH(h, tole = TOLE) {
  const signe = h < 0 ? -1 : 1;
  const cible = Math.abs(h);
  let bas = 0;
  let haut = 3;
  for (let k = 0; k < 60; k += 1) {
    const milieu = (bas + haut) / 2;
    if (hFer(milieu, tole) < cible) bas = milieu;
    else haut = milieu;
  }
  return signe * bas;
}

/** Induction obtenue avec une force magnétomotrice ni sur un fer l et un entrefer e. */
function bCircuit(ni, l, e, tole = TOLE) {
  if (ni <= 0) return 0;
  let bas = 0;
  let haut = 3;
  for (let k = 0; k < 60; k += 1) {
    const milieu = (bas + haut) / 2;
    if (hFer(milieu, tole) * l + (milieu * e) / MU0 < ni) bas = milieu;
    else haut = milieu;
  }
  return bas;
}

/** Champ coercitif effectif du modèle, pondéré pour une aire en B crête puissance 1,6. */
function hcEffectif(hc, bCrete) {
  return hc * Math.pow(Math.abs(bCrete), 0.6);
}

/** Point du cycle à la phase theta (radians) : b = B crête sin(theta). */
function pointCycle(theta, bCrete, hc, tole = TOLE) {
  const b = bCrete * Math.sin(theta);
  const montant = Math.cos(theta) >= 0;
  const ecart = hcEffectif(hc, bCrete) * Math.sqrt(Math.max(0, 1 - Math.pow(b / bCrete, 2)));
  return { b, h: hFer(b, tole) + (montant ? ecart : -ecart), montant };
}

/** Induction rémanente du modèle : branche descendante, H nul. */
function remanente(bCrete, hc, tole = TOLE) {
  let bas = 0;
  let haut = bCrete;
  const hce = hcEffectif(hc, bCrete);
  for (let k = 0; k < 60; k += 1) {
    const milieu = (bas + haut) / 2;
    const h = hFer(milieu, tole) - hce * Math.sqrt(Math.max(0, 1 - Math.pow(milieu / bCrete, 2)));
    if (h < 0) bas = milieu;
    else haut = milieu;
  }
  return bas;
}

function pertesHysteresis(bCrete, f, hc) {
  return (f * Math.PI * hc * Math.pow(bCrete, 1.6)) / RHO_FER;
}

function pertesFoucault(bCrete, f, d, rho = 4.8e-7) {
  return (Math.PI * Math.PI * f * f * bCrete * bCrete * d * d) / (6 * rho) / RHO_FER;
}

/** Courant magnétisant du noyau de l'exemple sur une période (M points). */
function courantMagnetisant(uPourcent, e, hc = 40, M = 360) {
  const bCrete = (Math.SQRT2 * 230 * (uPourcent / 100)) / (TAU * 50 * EX.N * EX.S);
  const points = [];
  for (let k = 0; k < M; k += 1) {
    const theta = (TAU * k) / M;
    const etat = pointCycle(theta, bCrete, hc);
    const i = (etat.h * EX.l + (etat.b * e) / MU0) / EX.N;
    const lineaire = ((etat.b * EX.l) / (MU0 * EX.mur) + (etat.b * e) / MU0) / EX.N;
    points.push({ theta, b: etat.b, h: etat.h, i, lineaire });
  }
  let crete = 0;
  let carres = 0;
  let a1 = 0;
  let b1 = 0;
  let a3 = 0;
  let b3 = 0;
  for (const p of points) {
    crete = Math.max(crete, Math.abs(p.i));
    carres += p.i * p.i;
    a1 += p.i * Math.cos(p.theta);
    b1 += p.i * Math.sin(p.theta);
    a3 += p.i * Math.cos(3 * p.theta);
    b3 += p.i * Math.sin(3 * p.theta);
  }
  const efficace = Math.sqrt(carres / M);
  const fond = (2 / M) * Math.hypot(a1, b1);
  const rang3 = (2 / M) * Math.hypot(a3, b3);
  return {
    bCrete,
    points,
    crete,
    efficace,
    facteur: efficace > 0 ? crete / efficace : 0,
    rang3: fond > 0 ? rang3 / fond : 0,
    actif: ((2 / M) * a1) / Math.SQRT2,
  };
}

/* --------------------------------------------------------------------------
   Utilitaires de dessin
   -------------------------------------------------------------------------- */

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function nombre(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
}

function marqueur(id) {
  return (
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto-start-reverse">' +
    '<path d="M0 0 9 4 0 8Z" fill="currentColor"/></marker>'
  );
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

function ligneV(c, repere, couleurs, x, libelle, tirets = [5, 5]) {
  const px = repere.versX(x);
  if (px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  c.save();
  c.setLineDash(tirets);
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
    const aGauche = px > repere.boite.x + repere.boite.l * 0.72;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

function ligneH(c, repere, couleurs, y, libelle, enDessous, tirets = [7, 5]) {
  const py = repere.versY(y);
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.setLineDash(tirets);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.2;
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

function pointTrace(c, repere, couleurs, x, y, libelle) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.fillStyle = couleurs.texte;
  c.beginPath();
  c.arc(px, py, 4.5, 0, TAU);
  c.fill();
  if (libelle) {
    c.font = POLICE;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.65;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -8 : 8), py - 8);
  }
  c.restore();
}

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

function barresCorrection(moteur, conteneur, options, barres) {
  const spectre = moteur.sim.spectre(conteneur, {
    genre: "Correction visuelle",
    ratio: 0.4,
    ...options,
  });
  if (spectre) {
    spectre.definirBarres(barres);
    ressources.push(spectre);
  }
  return spectre;
}

/** Schéma annoté inséré dans une correction, tracé progressivement. */
function schemaCorrection(moteur, conteneur, viewBox, dessin, legende) {
  const figure = document.createElement("figure");
  const svg = svgEl("svg", { viewBox, role: "img", "aria-label": legende });
  svg.innerHTML = dessin;
  figure.appendChild(svg);
  const texteLegende = document.createElement("figcaption");
  texteLegende.textContent = legende;
  figure.appendChild(texteLegende);
  conteneur.appendChild(figure);
  const trace = moteur.dessiner(svg, { duree: 1.4 });
  if (trace) ressources.push(trace);
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
  construireDomaines(racine, api);
  construireSimEntrefer(racine, api);
  construireCycle(racine, api);
  construireConstruction(racine, api);
  construireSimSelf(racine, api);
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
    ["#d-noyau-figure svg", 1.8],
    ["#e-tube-figure svg", 1.4],
    ["#e-cuirasse-figure svg", 1.8],
    ["#f-schema-principal svg", 1.8],
    ["#h-donnees-figure svg", 1.8],
    ["#i-self-figure svg", 1.8],
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
      id: "c-ampere",
      titre: "Théorème d'Ampère dans un tore",
      niveau: "prérequis",
      enonce:
        "<p>Un tore de longueur moyenne $l = 25\\ \\mathrm{cm}$ porte $N = 1000$ spires parcourues par $i = 0{,}5\\ \\mathrm{A}$. " +
        "Quelle est l'excitation $H$ sur la ligne moyenne ? Quelle induction en déduire si le tore est en matière plastique ?</p>",
      valeur: 2000,
      unite: "A/m",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Excitation $H$",
      etapes: [
        { texte: "La ligne moyenne enlace les $N$ spires une fois : $\\oint H\\,\\mathrm{d}l = Hl = Ni$." },
        { texte: "$H = Ni/l = 1000 \\times 0{,}5/0{,}25 = 2000\\ \\mathrm{A/m}$." },
        {
          texte: "Dans un matériau non magnétique, $B = \\mu_0 H = 4\\pi \\times 10^{-7} \\times 2000 = 2{,}51\\ \\mathrm{mT}$.",
          note: "Un noyau de fer de $\\mu_r = 2000$ porterait cette induction à $5\\ \\mathrm{T}$ en théorie : il saturerait bien avant.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Induction en fonction de H : air et fer",
          xTitre: "H",
          xUnite: "A/m",
          yTitre: "B",
          yUnite: "T",
          xMin: 0,
          xMax: 2500,
          yMin: 0,
          yMax: 1.8,
          series: [
            { id: "fer", nom: "tôle de qualité courante", couleur: "serie-1", epaisseur: 2.6, fonction: (h) => bDeH(h) },
            { id: "air", nom: "air, B = μ0 H", couleur: "serie-5", epaisseur: 1.8, fonction: (h) => MU0 * h },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 2000, "H = 2000 A/m");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm("#c-minitest", {
      id: "c-faraday",
      titre: "Loi de Faraday en régime sinusoïdal",
      niveau: "prérequis",
      enonce:
        "<p>Le flux dans une bobine de $N$ spires vaut $\\Phi(t) = \\hat{\\Phi}\\sin\\omega t$. Quelles affirmations sur la tension " +
        "$u = N\\,\\mathrm{d}\\Phi/\\mathrm{d}t$, en convention récepteur, sont exactes ?</p>",
      options: [
        { texte: "La tension est en avance de $90^\\circ$ sur le flux.", juste: true },
        { texte: "L'amplitude de la tension vaut $N\\omega\\hat{\\Phi}$.", juste: true },
        { texte: "La tension est en phase avec le flux." },
        { texte: "À flux crête fixé, la tension ne dépend pas de la fréquence." },
      ],
      etapes: [
        { texte: "$u = N\\omega\\hat{\\Phi}\\cos\\omega t = N\\omega\\hat{\\Phi}\\sin(\\omega t + 90^\\circ)$." },
        { texte: "La tension est donc en avance de $90^\\circ$ sur le flux, et son amplitude $N\\omega\\hat{\\Phi}$ croît avec la fréquence." },
        {
          texte: "Lu dans l'autre sens : à tension imposée, $\\hat{\\Phi} = \\hat{U}/(N\\omega)$, ce qui conduira à la formule de Boucherot.",
          note: "C'est la propriété qui rend le flux d'un transformateur indépendant de son noyau.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Flux et tension sur une période",
          xTitre: "ωt",
          xUnite: "°",
          yTitre: "valeur normalisée",
          xMin: 0,
          xMax: 360,
          yMin: -1.2,
          yMax: 1.2,
          series: [
            { id: "phi", nom: "flux Φ, en sinus", couleur: "serie-1", epaisseur: 2.6, fonction: (d) => Math.sin(d * DEG) },
            { id: "u", nom: "tension u, en cosinus", couleur: "serie-5", epaisseur: 2, fonction: (d) => Math.cos(d * DEG) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 90, "crête du flux");
            ligneV(c, repere, couleurs, 360, "crête de u", [2, 3]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-inductance",
      titre: "Inductance à partir du flux",
      niveau: "prérequis",
      enonce:
        "<p>Une bobine de $100$ spires parcourue par $4\\ \\mathrm{A}$ est traversée par un flux de $2\\ \\mathrm{mWb}$, le même pour toutes " +
        "les spires. Quelle est son inductance, en henrys ?</p>",
      valeur: 0.05,
      unite: "H",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Inductance $L$",
      etapes: [
        { texte: "Flux lié : $N\\Phi = 100 \\times 2 \\times 10^{-3} = 0{,}2\\ \\mathrm{Wb}$." },
        { texte: "$L = N\\Phi/i = 0{,}2/4 = 0{,}05\\ \\mathrm{H} = 50\\ \\mathrm{mH}$." },
        { texte: "Énergie stockée : $\\tfrac{1}{2}Li^2 = 0{,}5 \\times 0{,}05 \\times 16 = 0{,}4\\ \\mathrm{J}$.", note: "On montrera que $L = N^2/\\mathcal{R}$ : le flux dépend lui-même de $N$." },
      ],
      visuelCorrection(conteneur, moteur) {
        barresCorrection(
          moteur,
          conteneur,
          { titre: "Du flux au flux lié", xTitre: "grandeur", yTitre: "valeur", unite: "Wb" },
          [
            { etiquette: "Φ par spire", valeur: 0.002 },
            { etiquette: "NΦ, flux lié", valeur: 0.2 },
            { etiquette: "L i = NΦ", valeur: 0.05 * 4 },
          ]
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : domaines et première aimantation
   -------------------------------------------------------------------------- */

function construireDomaines(racine, api) {
  const conteneur = racine.querySelector("#d-domaines");
  if (!conteneur) return;

  const H_MAX = 3000;
  const B_MAX = 1.8;
  const X0 = 330;
  const X1 = 680;
  const Y0 = 280;
  const Y1 = 40;
  const versX = (h) => X0 + ((X1 - X0) * h) / H_MAX;
  const versY = (b) => Y0 - ((Y0 - Y1) * b) / B_MAX;
  const angles0 = [137, -62, 211, 28, -150, 95, -18, 168, -110, 250, 63, -85, 190, 12, -135, 115, -40, 225, 75, -170];

  const svg = svgEl("svg", {
    viewBox: "0 0 700 330",
    role: "img",
    "aria-label": "Domaines magnétiques orientés par l'excitation H, et courbe de première aimantation B en fonction de H",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-d-dom");
  const cadre = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1, opacity: 0.4 });
  let grille = "";
  for (let r = 0; r < 4; r += 1) {
    for (let k = 0; k < 5; k += 1) grille += '<rect x="' + (30 + k * 52) + '" y="' + (70 + r * 52) + '" width="52" height="52"/>';
  }
  cadre.innerHTML = grille;
  const fleches = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round" });
  const flecheH = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3, "marker-end": "url(#fl-d-dom)" });
  const axes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.2, opacity: 0.6 });
  let traits = "M" + X0 + " " + Y0 + "H" + (X1 + 8) + "M" + X0 + " " + Y0 + "V" + (Y1 - 8);
  for (let h = 500; h <= H_MAX; h += 500) traits += "M" + versX(h) + " " + Y0 + "v5";
  for (let b = 0.5; b <= 1.51; b += 0.5) traits += "M" + X0 + " " + versY(b) + "h-5";
  traits += "M" + X0 + " 305H" + X1;
  axes.innerHTML = '<path d="' + traits + '"/>';
  const courbe = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.6, "stroke-linejoin": "round" });
  const pts = [];
  for (let k = 0; k <= 150; k += 1) {
    const h = (H_MAX * k) / 150;
    pts.push(versX(h).toFixed(1) + " " + versY(bDeH(h)).toFixed(1));
  }
  courbe.setAttribute("d", "M" + pts.join(" L"));
  const air = svgEl("path", {
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.6,
    "stroke-dasharray": "6 4",
    d: "M" + versX(0) + " " + versY(0) + "L" + versX(H_MAX) + " " + versY(MU0 * H_MAX).toFixed(2),
  });
  const guides = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1, "stroke-dasharray": "3 3", opacity: 0.8 });
  const point = svgEl("circle", { r: 5, fill: "currentColor" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  libelles.innerHTML =
    texte(30, 24, "domaines du fer") +
    texte(X0 + 6, 30, "B (T)") +
    texte(X1 - 40, Y0 - 8, "H (A/m)") +
    texte(versX(500) - 10, Y0 + 18, "500") +
    texte(versX(1500) - 14, Y0 + 18, "1500") +
    texte(versX(2500) - 14, Y0 + 18, "2500") +
    texte(X0 - 34, versY(0.5) + 4, "0,5") +
    texte(X0 - 34, versY(1.0) + 4, "1,0") +
    texte(X0 - 34, versY(1.5) + 4, "1,5") +
    texte(versX(1700), versY(1.6) - 6, "fer") +
    texte(versX(800), Y0 - 10, "air, B = μ0 H") +
    texte(X0, 324, "poignée : excitation H");
  svg.append(defs, cadre, axes, air, courbe, guides, fleches, flecheH, point, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-domaines-valeurs", [
    { id: "h", libelle: "Excitation H", unite: "A/m", decimales: 0 },
    { id: "b", libelle: "Induction B", unite: "T", decimales: 3 },
    { id: "air", libelle: "Dans l'air, μ0 H", unite: "mT", decimales: 2 },
    { id: "mur", libelle: "μr apparent, B/(μ0 H)", decimales: 0 },
    { id: "m", libelle: "Domaines alignés", unite: "%", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner(h) {
    const b = bDeH(h);
    const m = Math.min(1, b / 1.62);
    let contenu = "";
    for (let r = 0; r < 4; r += 1) {
      for (let k = 0; k < 5; k += 1) {
        const n = r * 5 + k;
        let a0 = ((angles0[n] + 180) % 360) - 180;
        const a = a0 * (1 - m);
        const cx = 56 + k * 52;
        const cy = 96 + r * 52;
        const dx = 17 * Math.cos(a * DEG);
        const dy = -17 * Math.sin(a * DEG);
        contenu +=
          '<path d="M' + (cx - dx).toFixed(1) + " " + (cy - dy).toFixed(1) + "L" + (cx + dx).toFixed(1) + " " + (cy + dy).toFixed(1) +
          '" marker-end="url(#fl-d-dom)"/>';
      }
    }
    fleches.innerHTML = contenu;
    flecheH.setAttribute("d", "M40 50H" + (50 + (230 * h) / H_MAX).toFixed(1));
    point.setAttribute("cx", versX(h).toFixed(1));
    point.setAttribute("cy", versY(b).toFixed(1));
    guides.setAttribute("d", "M" + versX(h).toFixed(1) + " " + Y0 + "V" + versY(b).toFixed(1) + "H" + X0);
    if (valeurs) {
      valeurs.maj({ h, b, air: MU0 * h * 1000, mur: h > 0 ? b / (MU0 * h) : NaN, m: m * 100 });
    }
  }

  let synchro = false;
  let poignee = null;
  let lecteur = null;
  function appliquer(h, source) {
    if (synchro) return;
    synchro = true;
    const valeur = Math.max(0, Math.min(H_MAX, Number(h)));
    dessiner(valeur);
    if (source !== "poignee" && poignee) poignee.set(valeur, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(valeur);
    synchro = false;
  }

  poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: X0, y: 305 },
    a: { x: X1, y: 305 },
    min: 0,
    max: H_MAX,
    pas: 10,
    valeur: 300,
    unite: "A/m",
    libelle: "Excitation H appliquée au fer",
    diffuserAuDepart: false,
    rappel(mesure) {
      appliquer(mesure.valeur, "poignee");
    },
  });
  if (poignee) ressources.push(poignee);

  lecteur = api.sim.lecteur("#d-domaines-lecteur", {
    de: 0,
    a: H_MAX,
    duree: 9,
    boucle: true,
    auto: false,
    libelle: "Montée de l'excitation de 0 à 3000 A/m",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  appliquer(300, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : noyau avec entrefer
   -------------------------------------------------------------------------- */

function construireSimEntrefer(racine, api) {
  const etat = { N: 500, I: 2, e: 1, l: 0.4, S: 16 };

  const trace = api.sim.traceur("#e-sim-entrefer-trace", {
    titre: "Induction dans le fer en fonction de N i",
    xTitre: "force magnétomotrice N i",
    xUnite: "A",
    yTitre: "induction B",
    yUnite: "T",
    xMin: 0,
    xMax: 3000,
    yMin: 0,
    yMax: 1.8,
    series: [
      { id: "avec", nom: "avec l'entrefer réglé", couleur: "serie-1", epaisseur: 2.8, fonction: () => 0 },
      { id: "sans", nom: "sans entrefer", couleur: "serie-5", epaisseur: 1.8, fonction: () => 0 },
    ],
    surDessin({ c, repere, couleurs }) {
      const ni = etat.N * etat.I;
      const b = bCircuit(ni, etat.l, etat.e * 1e-3);
      ligneV(c, repere, couleurs, ni, "N i = " + nombre(api, ni, 0) + " A");
      ligneH(c, repere, couleurs, 1.5, "1,5 T", false, [2, 3]);
      pointTrace(c, repere, couleurs, ni, b, nombre(api, b, 3) + " T");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-sim-entrefer-valeurs", [
    { id: "b", libelle: "Induction B", unite: "T", decimales: 3 },
    { id: "phi", libelle: "Flux Φ", unite: "mWb", decimales: 3 },
    { id: "hfer", libelle: "H dans le fer", unite: "A/m", decimales: 0 },
    { id: "part", libelle: "Part de N i dans l'entrefer", unite: "%", decimales: 1 },
    { id: "mur", libelle: "μr apparent du fer", decimales: 0 },
    { id: "L", libelle: "Inductance apparente N Φ / i", unite: "H", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    const e = etat.e * 1e-3;
    const ni = etat.N * etat.I;
    const xMax = Math.max(3000, ni * 1.15);
    if (trace) {
      trace.definirPlage({ xMin: 0, xMax, yMin: 0, yMax: 1.8 });
      trace.definirFonction("avec", (x) => bCircuit(x, etat.l, e));
      trace.definirFonction("sans", (x) => bCircuit(x, etat.l, 0));
    }
    const b = bCircuit(ni, etat.l, e);
    const hf = hFer(b);
    const phi = b * etat.S * 1e-4;
    if (valeurs) {
      valeurs.maj({
        b,
        phi: phi * 1000,
        hfer: hf,
        part: ni > 0 ? ((b * e) / MU0 / ni) * 100 : 0,
        mur: hf > 0 ? b / (MU0 * hf) : NaN,
        L: etat.I > 0 ? (etat.N * phi) / etat.I : NaN,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-sim-entrefer-curseurs",
    [
      { id: "N", libelle: "Nombre de spires N", min: 100, max: 1000, pas: 10, valeur: etat.N, format: (v) => String(Math.round(v)) },
      { id: "I", libelle: "Courant continu i", min: 0, max: 6, pas: 0.05, valeur: etat.I, unite: "A" },
      { id: "e", libelle: "Entrefer e", min: 0, max: 3, pas: 0.05, valeur: etat.e, unite: "mm" },
      { id: "l", libelle: "Longueur moyenne du fer", min: 0.1, max: 1, pas: 0.01, valeur: etat.l, unite: "m" },
      { id: "S", libelle: "Section nette S", min: 4, max: 40, pas: 1, valeur: etat.S, unite: "cm²" },
    ],
    (lues) => {
      Object.assign(etat, lues);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   E. Animation et simulation : cycle d'hystérésis
   -------------------------------------------------------------------------- */

function construireCycle(racine, api) {
  const conteneur = racine.querySelector("#e-cycle");
  if (!conteneur) return;

  const etat = { bCrete: 1, f: 50, hc: 40, d: 0.35, phase: 30 };
  const C = { x: 250, y: 175 };
  const DEMI_L = 210;
  const DEMI_H = 140;
  const B_ECHELLE = 1.8;
  const DIAL = { x: 560, y: 175, r: 52 };
  let hEchelle = 600;
  const versX = (h) => C.x + (DEMI_L * h) / hEchelle;
  const versY = (b) => C.y - (DEMI_H * b) / B_ECHELLE;

  const svg = svgEl("svg", {
    viewBox: "0 0 660 360",
    role: "img",
    "aria-label": "Cycle d'hystérésis B en fonction de H, aire dissipée, induction rémanente, champ coercitif et cercle des phases",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-cyc");
  const axes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.55 });
  axes.innerHTML =
    '<path d="M' + (C.x - DEMI_L - 10) + " " + C.y + "H" + (C.x + DEMI_L + 10) + "M" + C.x + " " + (C.y + DEMI_H + 10) + "V" + (C.y - DEMI_H - 10) + '"/>' +
    '<circle cx="' + DIAL.x + '" cy="' + DIAL.y + '" r="' + DIAL.r + '"/>' +
    '<path d="M' + (DIAL.x - DIAL.r - 8) + " " + DIAL.y + "H" + (DIAL.x + DIAL.r + 8) + '"/>';
  const aire = svgEl("path", { fill: "currentColor", "fill-opacity": 0.12, stroke: "none" });
  const boucle = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.8, "stroke-linejoin": "round" });
  const sansHyst = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.4, "stroke-dasharray": "6 4", opacity: 0.8 });
  const croix = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.8 });
  const sens = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.6 });
  const rayon = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "marker-end": "url(#fl-e-cyc)" });
  const point = svgEl("circle", { r: 6, fill: "currentColor" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, axes, aire, sansHyst, boucle, sens, croix, rayon, point, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-cycle-valeurs", [
    { id: "phase", libelle: "Instant ωt", unite: "°", decimales: 0 },
    { id: "b", libelle: "Induction b", unite: "T", decimales: 3 },
    { id: "h", libelle: "Excitation H", unite: "A/m", decimales: 0 },
    { id: "br", libelle: "Rémanente Br", unite: "T", decimales: 3 },
    { id: "aire", libelle: "Aire du cycle", unite: "J/m³", decimales: 1 },
    { id: "ph", libelle: "Pertes par hystérésis", unite: "W/kg", decimales: 3 },
    { id: "pf", libelle: "Pertes par courants de Foucault", unite: "W/kg", decimales: 3 },
    { id: "pt", libelle: "Pertes fer totales", unite: "W/kg", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function tracerCycle() {
    const hce = hcEffectif(etat.hc, etat.bCrete);
    hEchelle = Math.max(200, (hFer(etat.bCrete) + hce) * 1.12);
    const pts = [];
    for (let k = 0; k <= 360; k += 1) {
      const p = pointCycle(k * DEG, etat.bCrete, etat.hc);
      pts.push(versX(p.h).toFixed(1) + " " + versY(p.b).toFixed(1));
    }
    const d = "M" + pts.join(" L") + "Z";
    boucle.setAttribute("d", d);
    aire.setAttribute("d", d);
    const ref = [];
    for (let k = -60; k <= 60; k += 1) {
      const b = (etat.bCrete * k) / 60;
      ref.push(versX(hFer(b)).toFixed(1) + " " + versY(b).toFixed(1));
    }
    sansHyst.setAttribute("d", "M" + ref.join(" L"));
    const br = remanente(etat.bCrete, etat.hc);
    const xHc = versX(hce);
    const yBr = versY(br);
    croix.setAttribute(
      "d",
      "M" + (C.x - 5) + " " + (yBr - 5) + "l10 10M" + (C.x + 5) + " " + (yBr - 5) + "l-10 10" +
        "M" + (xHc - 5) + " " + (C.y - 5) + "l10 10M" + (xHc + 5) + " " + (C.y - 5) + "l-10 10"
    );
    const pMontee = pointCycle(-20 * DEG, etat.bCrete, etat.hc);
    const pDescente = pointCycle(160 * DEG, etat.bCrete, etat.hc);
    sens.innerHTML =
      '<path d="M' + (versX(pMontee.h) + 14).toFixed(1) + " " + (versY(pMontee.b) + 6).toFixed(1) + "l4 -16" + '" marker-end="url(#fl-e-cyc)"/>' +
      '<path d="M' + (versX(pDescente.h) - 14).toFixed(1) + " " + (versY(pDescente.b) - 6).toFixed(1) + "l-4 16" + '" marker-end="url(#fl-e-cyc)"/>';
    libelles.innerHTML =
      texte(C.x + 6, C.y - DEMI_H - 2, "B (T)") +
      texte(C.x + DEMI_L - 50, C.y + 18, "H (A/m)") +
      texte(C.x + DEMI_L - 60, C.y - 6, "+" + nombre(api, hEchelle * 0.95, 0)) +
      texte(C.x - DEMI_L, C.y - 6, "-" + nombre(api, hEchelle * 0.95, 0)) +
      texte(C.x - 46, versY(1.5) + 4, "1,5") +
      texte(C.x - 46, versY(-1.5) + 4, "-1,5") +
      texte(C.x + 8, yBr - 8, "Br") +
      texte(xHc + 6, C.y + 18, "Hc") +
      texte(DIAL.x - 52, DIAL.y - DIAL.r - 14, "cercle des phases") +
      texte(DIAL.x + DIAL.r + 4, DIAL.y + 16, "0°") +
      texte(20, 350, "aire grisée = énergie perdue par m³ et par cycle");
    const ticks = svgEl("path", {
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1,
      d: "M" + (C.x - 5) + " " + versY(1.5) + "h10M" + (C.x - 5) + " " + versY(-1.5) + "h10M" + versX(hEchelle * 0.95) + " " + (C.y - 4) + "v8M" + versX(-hEchelle * 0.95) + " " + (C.y - 4) + "v8",
      opacity: 0.6,
    });
    libelles.appendChild(ticks);
    return br;
  }

  let br = tracerCycle();

  function dessinerPoint() {
    const theta = etat.phase * DEG;
    const p = pointCycle(theta, etat.bCrete, etat.hc);
    point.setAttribute("cx", versX(p.h).toFixed(1));
    point.setAttribute("cy", versY(p.b).toFixed(1));
    rayon.setAttribute(
      "d",
      "M" + DIAL.x + " " + DIAL.y + "L" + (DIAL.x + (DIAL.r - 8) * Math.cos(theta)).toFixed(1) + " " + (DIAL.y - (DIAL.r - 8) * Math.sin(theta)).toFixed(1)
    );
    if (valeurs) {
      const ph = pertesHysteresis(etat.bCrete, etat.f, etat.hc);
      const pf = pertesFoucault(etat.bCrete, etat.f, etat.d * 1e-3);
      valeurs.maj({
        phase: etat.phase,
        b: p.b,
        h: p.h,
        br,
        aire: Math.PI * etat.hc * Math.pow(etat.bCrete, 1.6),
        ph,
        pf,
        pt: ph + pf,
      });
    }
  }

  let synchro = false;
  let poignee = null;
  let lecteur = null;
  function appliquer(deg, source) {
    if (synchro) return;
    synchro = true;
    etat.phase = ((Number(deg) % 360) + 360) % 360;
    dessinerPoint();
    if (source !== "poignee" && poignee) poignee.set(etat.phase, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(etat.phase);
    synchro = false;
  }

  poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: { x: DIAL.x, y: DIAL.y },
    rayon: DIAL.r,
    valeur: etat.phase,
    pas: 5,
    libelle: "Instant ωt sur le cercle des phases",
    diffuserAuDepart: false,
    rappel(mesure) {
      appliquer(mesure.angle, "poignee");
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-cycle-curseurs",
    [
      { id: "bCrete", libelle: "Induction crête", min: 0.2, max: 1.7, pas: 0.05, valeur: etat.bCrete, unite: "T" },
      { id: "f", libelle: "Fréquence", min: 10, max: 400, pas: 10, valeur: etat.f, unite: "Hz" },
      { id: "hc", libelle: "Champ coercitif à 1 T", min: 10, max: 100, pas: 5, valeur: etat.hc, unite: "A/m" },
      { id: "d", libelle: "Épaisseur des tôles", min: 0.2, max: 1, pas: 0.05, valeur: etat.d, unite: "mm" },
    ],
    (lues) => {
      Object.assign(etat, lues);
      br = tracerCycle();
      dessinerPoint();
    }
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#e-cycle-lecteur", {
    de: 0,
    a: 360,
    duree: 8,
    boucle: true,
    auto: false,
    libelle: "Une période de la tension",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  appliquer(30, null);
}

/* --------------------------------------------------------------------------
   H. Animation : construction du courant magnétisant
   -------------------------------------------------------------------------- */

function construireConstruction(racine, api) {
  const conteneur = racine.querySelector("#h-construction");
  if (!conteneur) return;

  const etat = { u: 100, e: 1, phase: 60 };
  const B_ECH = 1.8;
  const CB = { x: 175, y: 130, demiL: 135, demiH: 95 };
  const T0 = 360;
  const T1 = 690;
  const YI = 345;
  const DEMI_I = 70;
  let hEch = 2000;
  let iEch = 3;
  let calcul = null;

  const versHx = (h) => CB.x + (CB.demiL * h) / hEch;
  const versBy = (b) => CB.y - (CB.demiH * b) / B_ECH;
  const versTx = (deg) => T0 + ((T1 - T0) * deg) / 360;
  const versIy = (i) => YI - (DEMI_I * i) / iEch;

  const svg = svgEl("svg", {
    viewBox: "0 0 720 440",
    role: "img",
    "aria-label": "Construction du courant magnétisant : cycle B(H), induction imposée en fonction du temps et courant magnétisant obtenu",
  });
  const axes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.55 });
  axes.innerHTML =
    '<path d="M' + (CB.x - CB.demiL - 8) + " " + CB.y + "H" + (CB.x + CB.demiL + 8) + "M" + CB.x + " " + (CB.y + CB.demiH + 8) + "V" + (CB.y - CB.demiH - 8) + '"/>' +
    '<path d="M' + T0 + " " + CB.y + "H" + (T1 + 8) + "M" + T0 + " " + (CB.y + CB.demiH + 8) + "V" + (CB.y - CB.demiH - 8) + '"/>' +
    '<path d="M' + T0 + " " + YI + "H" + (T1 + 8) + "M" + T0 + " " + (YI + DEMI_I + 8) + "V" + (YI - DEMI_I - 8) + '"/>' +
    '<path d="M' + versTx(90) + " " + (CB.y - 4) + "v8M" + versTx(180) + " " + (CB.y - 4) + "v8M" + versTx(270) + " " + (CB.y - 4) + "v8M" + versTx(360) + " " + (CB.y - 4) + "v8" +
    "M" + versTx(90) + " " + (YI - 4) + "v8M" + versTx(180) + " " + (YI - 4) + "v8M" + versTx(270) + " " + (YI - 4) + "v8M" + versTx(360) + " " + (YI - 4) + 'v8"/>';
  const cycle = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "stroke-linejoin": "round" });
  const courbeB = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linejoin": "round" });
  const courbeI = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3, "stroke-linejoin": "round" });
  const courbeLin = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.4, "stroke-dasharray": "2 3", opacity: 0.85 });
  const guides = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, "stroke-dasharray": "5 4", opacity: 0.85 });
  const pointCycleEl = svgEl("circle", { r: 5, fill: "currentColor" });
  const pointB = svgEl("circle", { r: 4, fill: "currentColor" });
  const pointI = svgEl("circle", { r: 5, fill: "currentColor" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  const graduation = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.55 });
  const piste = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1, opacity: 0.3, d: "M" + T0 + " " + (CB.y + 112) + "H" + T1 });
  svg.append(axes, graduation, piste, cycle, courbeB, courbeLin, courbeI, guides, pointCycleEl, pointB, pointI, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#h-construction-valeurs", [
    { id: "phase", libelle: "Instant ωt", unite: "°", decimales: 0 },
    { id: "b", libelle: "Induction b", unite: "T", decimales: 3 },
    { id: "h", libelle: "H dans le fer", unite: "A/m", decimales: 0 },
    { id: "i", libelle: "Courant i", unite: "A", decimales: 3 },
    { id: "bc", libelle: "Induction crête", unite: "T", decimales: 3 },
    { id: "crete", libelle: "Courant crête", unite: "A", decimales: 3 },
    { id: "eff", libelle: "Courant efficace", unite: "A", decimales: 3 },
    { id: "fc", libelle: "Facteur de crête", decimales: 2 },
    { id: "r3", libelle: "Rang 3 / fondamental", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function tracer() {
    calcul = courantMagnetisant(etat.u, etat.e * 1e-3);
    let hMax = 0;
    let iMax = 0;
    for (const p of calcul.points) {
      hMax = Math.max(hMax, Math.abs(p.h));
      iMax = Math.max(iMax, Math.abs(p.i), Math.abs(p.lineaire));
    }
    hEch = Math.max(100, hMax * 1.08);
    iEch = Math.max(0.05, iMax * 1.1);
    const ptsCycle = [];
    const ptsB = [];
    const ptsI = [];
    const ptsL = [];
    for (const p of calcul.points) {
      const deg = p.theta / DEG;
      ptsCycle.push(versHx(p.h).toFixed(1) + " " + versBy(p.b).toFixed(1));
      ptsB.push(versTx(deg).toFixed(1) + " " + versBy(p.b).toFixed(1));
      ptsI.push(versTx(deg).toFixed(1) + " " + versIy(p.i).toFixed(1));
      ptsL.push(versTx(deg).toFixed(1) + " " + versIy(p.lineaire).toFixed(1));
    }
    const premier = calcul.points[0];
    ptsB.push(versTx(360).toFixed(1) + " " + versBy(premier.b).toFixed(1));
    ptsI.push(versTx(360).toFixed(1) + " " + versIy(premier.i).toFixed(1));
    ptsL.push(versTx(360).toFixed(1) + " " + versIy(premier.lineaire).toFixed(1));
    cycle.setAttribute("d", "M" + ptsCycle.join(" L") + "Z");
    graduation.setAttribute("d", "M" + versHx(hEch * 0.9).toFixed(1) + " " + (CB.y - 4) + "v8");
    courbeB.setAttribute("d", "M" + ptsB.join(" L"));
    courbeI.setAttribute("d", "M" + ptsI.join(" L"));
    courbeLin.setAttribute("d", "M" + ptsL.join(" L"));
    libelles.innerHTML =
      texte(CB.x + 6, 22, "B (T)") +
      texte(CB.x + CB.demiL - 64, CB.y + 18, "H (A/m)") +
      texte(versHx(hEch * 0.9) - 14, CB.y + 34, nombre(api, hEch * 0.9, 0)) +
      texte(20, 252, "cycle B(H) de la tôle") +
      texte(T0 + 6, 22, "b(ωt) imposée par la tension") +
      texte(versTx(180) - 16, CB.y + 18, "180°") +
      texte(versTx(360) - 18, CB.y + 18, "360°") +
      texte(T0 - 34, versBy(1.5) + 4, "1,5") +
      texte(T0 + 6, YI - DEMI_I - 6, "i(ωt) (A) ; pointillés : fer linéaire") +
      texte(T0 - 50, versIy(iEch * 0.9) + 4, nombre(api, iEch * 0.9, 2)) +
      texte(versTx(180) - 16, YI + 18, "180°") +
      texte(196, CB.y + 116, "poignée : instant ωt") +
      texte(20, 270, "U = " + nombre(api, 230 * etat.u / 100, 0) + " V") +
      texte(20, 288, "e = " + nombre(api, etat.e, 2) + " mm") +
      texte(20, 306, "N = 500 ; S = 16 cm²") +
      texte(20, 324, "l_fer = 0,40 m ; Hc = 40 A/m");
  }

  function dessinerInstant() {
    if (!calcul) return;
    const M = calcul.points.length;
    const index = Math.round((etat.phase / 360) * M) % M;
    const p = calcul.points[index];
    const xc = versHx(p.h);
    const yb = versBy(p.b);
    const xt = versTx(etat.phase);
    const yi = versIy(p.i);
    pointCycleEl.setAttribute("cx", xc.toFixed(1));
    pointCycleEl.setAttribute("cy", yb.toFixed(1));
    pointB.setAttribute("cx", xt.toFixed(1));
    pointB.setAttribute("cy", yb.toFixed(1));
    pointI.setAttribute("cx", xt.toFixed(1));
    pointI.setAttribute("cy", yi.toFixed(1));
    guides.setAttribute(
      "d",
      "M" + xt.toFixed(1) + " " + yb.toFixed(1) + "H" + xc.toFixed(1) +
        "M" + xc.toFixed(1) + " " + yb.toFixed(1) + "V" + (CB.y + CB.demiH + 4) +
        "M" + xt.toFixed(1) + " " + (CB.y - CB.demiH) + "V" + (YI + DEMI_I)
    );
    if (valeurs) {
      valeurs.maj({
        phase: etat.phase,
        b: p.b,
        h: p.h,
        i: p.i,
        bc: calcul.bCrete,
        crete: calcul.crete,
        eff: calcul.efficace,
        fc: calcul.facteur,
        r3: calcul.rang3 * 100,
      });
    }
  }

  let synchro = false;
  let poignee = null;
  let lecteur = null;
  function appliquer(deg, source) {
    if (synchro) return;
    synchro = true;
    etat.phase = Math.max(0, Math.min(360, Number(deg)));
    dessinerInstant();
    if (source !== "poignee" && poignee) poignee.set(etat.phase, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(etat.phase);
    synchro = false;
  }

  tracer();

  poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: T0, y: CB.y + 112 },
    a: { x: T1, y: CB.y + 112 },
    min: 0,
    max: 360,
    pas: 2,
    valeur: etat.phase,
    unite: "°",
    libelle: "Instant ωt sur l'axe des temps",
    diffuserAuDepart: false,
    rappel(mesure) {
      appliquer(mesure.valeur, "poignee");
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#h-construction-curseurs",
    [
      { id: "u", libelle: "Tension, en % de 230 V", min: 50, max: 130, pas: 1, valeur: etat.u, unite: "%" },
      { id: "e", libelle: "Entrefer e", min: 0, max: 2, pas: 0.05, valeur: etat.e, unite: "mm" },
    ],
    (lues) => {
      etat.u = lues.u;
      etat.e = lues.e;
      tracer();
      dessinerInstant();
    }
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#h-construction-lecteur", {
    de: 0,
    a: 360,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Une période, construction point par point",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  appliquer(60, null);
}

/* --------------------------------------------------------------------------
   I. Simulation : inductance de la self en fonction du courant
   -------------------------------------------------------------------------- */

function inductanceSelf(N, e, iCrete) {
  const b = bCircuit(N * iCrete, SELF.l, e, TOLE_SELF);
  return { b, L: (N * b * SELF.S) / iCrete };
}

function construireSimSelf(racine, api) {
  const etat = { N: SELF.N, e: 0.834, I: 20 };

  const trace = api.sim.traceur("#i-sim-self-trace", {
    titre: "Inductance apparente de la self anti-harmonique",
    xTitre: "courant crête",
    xUnite: "A",
    yTitre: "inductance",
    yUnite: "mH",
    xMin: 0.5,
    xMax: 40,
    yMin: 0,
    yMax: 9,
    series: [{ id: "L", nom: "inductance apparente N Φ / i", couleur: "serie-1", epaisseur: 2.8, fonction: () => 0 }],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 5.11, "5,11 mH visés", false);
      const r = inductanceSelf(etat.N, etat.e * 1e-3, etat.I);
      ligneV(c, repere, couleurs, etat.I, "î = " + nombre(api, etat.I, 1) + " A", [2, 3]);
      pointTrace(c, repere, couleurs, etat.I, r.L * 1000, nombre(api, r.L * 1000, 2) + " mH");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#i-sim-self-valeurs", [
    { id: "L0", libelle: "Inductance à faible courant", unite: "mH", decimales: 3 },
    { id: "b", libelle: "Induction crête", unite: "T", decimales: 3 },
    { id: "L", libelle: "Inductance au courant réglé", unite: "mH", decimales: 3 },
    { id: "f", libelle: "Fréquence d'accord", unite: "Hz", decimales: 1 },
    { id: "rang", libelle: "Rang d'accord", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    const e = etat.e * 1e-3;
    if (trace) {
      const yMax = Math.max(9, inductanceSelf(etat.N, e, 0.5).L * 1000 * 1.15);
      trace.definirPlage({ xMin: 0.5, xMax: 40, yMin: 0, yMax });
      trace.definirFonction("L", (i) => inductanceSelf(etat.N, e, i).L * 1000);
    }
    const r = inductanceSelf(etat.N, e, etat.I);
    const f = 1 / (TAU * Math.sqrt(r.L * SELF.C));
    if (valeurs) {
      valeurs.maj({
        L0: inductanceSelf(etat.N, e, 0.5).L * 1000,
        b: r.b,
        L: r.L * 1000,
        f,
        rang: f / 50,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-sim-self-curseurs",
    [
      { id: "N", libelle: "Nombre de spires N", min: 30, max: 60, pas: 1, valeur: etat.N, format: (v) => String(Math.round(v)) },
      { id: "e", libelle: "Entrefer total e", min: 0.3, max: 1.5, pas: 0.01, valeur: etat.e, unite: "mm" },
      { id: "I", libelle: "Courant crête î", min: 1, max: 40, pas: 0.5, valeur: etat.I, unite: "A" },
    ],
    (lues) => {
      Object.assign(etat, lues);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

const DESSIN_CUIRASSE =
  '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">' +
  '<path d="M30 30H250V190H30Z M70 70V150H120V70Z M160 70V150H210V70Z"/>' +
  '<path d="M120 106H160M120 114H160" stroke-width="1.2"/>' +
  '<path d="M114 84L166 78M114 94L166 88M114 132L166 126M114 142L166 136"/>' +
  "</g>" +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
  '<text x="34" y="212">N = 250, i = 2 A</text><text x="168" y="114">entrefer</text>' +
  "</g>";

const DESSIN_NOYAU_QUIZ =
  '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">' +
  '<path d="M60 30H440V95H400V70H100V160H400V107H440V200H60Z" fill="rgba(128,128,128,0.16)"/>' +
  '<path d="M52 80L108 74M52 94L108 88M52 108L108 102M52 122L108 116M52 136L108 130M52 150L108 144"/>' +
  "</g>" +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
  '<text x="10" y="222">bobinage</text><text x="220" y="22">culasse</text><text x="452" y="105">entrefer</text>' +
  "</g>";

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-reluctance-entrefer",
      titre: "Réluctance d'un entrefer",
      niveau: "fondamental",
      enonce:
        "<p>Un entrefer de $0{,}5\\ \\mathrm{mm}$ coupe un noyau de section $25\\ \\mathrm{cm^2}$. Quelle est sa réluctance, en ampères " +
        "par weber ? Comparez-la à celle de $50\\ \\mathrm{cm}$ de fer de même section et de $\\mu_r = 3000$.</p>",
      valeur: 0.5e-3 / (MU0 * 25e-4),
      unite: "A/Wb",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Réluctance $\\mathcal{R}_e$",
      etapes: [
        { texte: "$\\mathcal{R}_e = \\dfrac{e}{\\mu_0 S} = \\dfrac{0{,}5 \\times 10^{-3}}{4\\pi \\times 10^{-7} \\times 25 \\times 10^{-4}}$." },
        { texte: "Dénominateur : $3{,}142 \\times 10^{-9}\\ \\mathrm{H \\cdot m}$ ; $\\mathcal{R}_e = 1{,}592 \\times 10^{5}\\ \\mathrm{A/Wb}$." },
        {
          texte: "Fer : $\\mathcal{R}_{\\mathrm{fer}} = 0{,}5/(3000 \\times 3{,}142 \\times 10^{-9}) = 5{,}305 \\times 10^{4}\\ \\mathrm{A/Wb}$, trois fois moins.",
          note: "Rapport $e\\mu_r/l = 0{,}5 \\times 10^{-3} \\times 3000/0{,}5 = 3$ : un demi-millimètre d'air pèse autant que $1{,}5\\ \\mathrm{m}$ de fer.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        barresCorrection(
          moteur,
          conteneur,
          { titre: "Réluctances comparées", xTitre: "tronçon", yTitre: "réluctance", unite: "kA/Wb" },
          [
            { etiquette: "fer, 50 cm", valeur: 53.05 },
            { etiquette: "entrefer, 0,5 mm", valeur: 159.15 },
          ]
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-tore",
      titre: "Induction dans un tore",
      niveau: "fondamental",
      enonce:
        "<p>Un tore de rayon moyen $5\\ \\mathrm{cm}$ et de section $4\\ \\mathrm{cm^2}$, en fer de $\\mu_r = 2500$ supposé constant, porte " +
        "$300$ spires parcourues par $0{,}2\\ \\mathrm{A}$. Quelle est l'induction dans le fer, en teslas ?</p>",
      valeur: 0.6,
      unite: "T",
      tolerance: 0.015,
      chiffres: 3,
      libelleChamp: "Induction $B$",
      etapes: [
        { texte: "Longueur moyenne : $l = 2\\pi \\times 0{,}05 = 0{,}3142\\ \\mathrm{m}$." },
        { texte: "Ampère : $H = Ni/l = 300 \\times 0{,}2/0{,}3142 = 191{,}0\\ \\mathrm{A/m}$." },
        { texte: "$B = \\mu_0\\mu_r H = 4\\pi \\times 10^{-7} \\times 2500 \\times 191{,}0 = 0{,}600\\ \\mathrm{T}$." },
        {
          texte: "Flux $\\Phi = BS = 0{,}24\\ \\mathrm{mWb}$ et inductance $L = N\\Phi/i = 0{,}36\\ \\mathrm{H}$.",
          note: "$0{,}6\\ \\mathrm{T}$ est sous le coude : l'hypothèse de $\\mu_r$ constant est acceptable.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Point de fonctionnement du tore",
          xTitre: "H",
          xUnite: "A/m",
          yTitre: "B",
          yUnite: "T",
          xMin: 0,
          xMax: 400,
          yMin: 0,
          yMax: 1.4,
          series: [{ id: "lin", nom: "fer linéaire, μr = 2500", couleur: "serie-1", epaisseur: 2.6, fonction: (h) => MU0 * 2500 * h }],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 191, "H = 191 A/m");
            pointTrace(c, repere, couleurs, 191, 0.6, "0,600 T");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-courant-entrefer",
      titre: "Courant nécessaire avec un entrefer",
      niveau: "intermédiaire",
      enonce:
        "<p>Un noyau de longueur moyenne $0{,}30\\ \\mathrm{m}$, de section $9\\ \\mathrm{cm^2}$ et de $\\mu_r = 3000$, présente un entrefer de " +
        "$0{,}6\\ \\mathrm{mm}$. Il porte $400$ spires. Quel courant continu faut-il pour obtenir $1{,}0\\ \\mathrm{T}$ dans le fer et dans " +
        "l'entrefer ?</p>",
      valeur: 557.04 / 400,
      unite: "A",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "Courant $i$",
      etapes: [
        { texte: "Méthode : l'induction est imposée, on calcule directement $H$ dans chaque tronçon, sans passer par les réluctances. La section n'intervient pas." },
        { texte: "Fer : $H_{\\mathrm{fer}} = B/(\\mu_0\\mu_r) = 1/(3{,}770 \\times 10^{-3}) = 265{,}3\\ \\mathrm{A/m}$, soit $265{,}3 \\times 0{,}30 = 79{,}6\\ \\mathrm{A}$." },
        { texte: "Entrefer : $H_e = B/\\mu_0 = 7{,}958 \\times 10^{5}\\ \\mathrm{A/m}$, soit $7{,}958 \\times 10^{5} \\times 0{,}6 \\times 10^{-3} = 477{,}5\\ \\mathrm{A}$." },
        {
          texte: "Somme : $557{,}0\\ \\mathrm{A}$, d'où $i = 557{,}0/400 = 1{,}393\\ \\mathrm{A}$.",
          note: "L'entrefer consomme $86\\ \\%$ des ampères-tours. Le négliger aurait donné $0{,}199\\ \\mathrm{A}$, sept fois trop peu.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        barresCorrection(
          moteur,
          conteneur,
          { titre: "Partage de la force magnétomotrice", xTitre: "tronçon", yTitre: "ampères-tours", unite: "A" },
          [
            { etiquette: "fer, 0,30 m", valeur: 79.58 },
            { etiquette: "entrefer, 0,6 mm", valeur: 477.46 },
            { etiquette: "total N i", valeur: 557.04 },
          ]
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-cuirasse",
      titre: "Flux dans une colonne latérale",
      niveau: "intermédiaire",
      enonce:
        "<p>Le circuit cuirassé ci-dessous porte $250$ spires parcourues par $2\\ \\mathrm{A}$ sur sa colonne centrale. La colonne centrale, " +
        "entrefer compris, présente une réluctance de $200\\ \\mathrm{kA/Wb}$ ; chaque colonne latérale, culasses comprises, " +
        "$100\\ \\mathrm{kA/Wb}$. Quel est le flux dans une colonne latérale, en milliwebers ?</p>" +
        '<svg viewBox="0 0 280 220" role="img" aria-label="Circuit cuirassé avec bobinage et entrefer sur la colonne centrale" style="max-width:280px">' +
        DESSIN_CUIRASSE +
        "</svg>",
      valeur: 1,
      unite: "mWb",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "Flux $\\Phi_l$",
      etapes: [
        { texte: "Choix de la méthode : fer supposé linéaire et courant imposé, donc réseau de réluctances, comme un circuit électrique." },
        { texte: "Les deux colonnes latérales sont en parallèle : $\\mathcal{R}_l/2 = 50\\ \\mathrm{kA/Wb}$, en série avec $\\mathcal{R}_c$ : $250\\ \\mathrm{kA/Wb}$." },
        { texte: "Flux central : $\\Phi_c = Ni/\\mathcal{R} = 500/2{,}5 \\times 10^{5} = 2{,}0\\ \\mathrm{mWb}$." },
        {
          texte: "Par symétrie, chaque colonne latérale porte $\\Phi_l = \\Phi_c/2 = 1{,}0\\ \\mathrm{mWb}$.",
          note: "Erreur classique : additionner les deux $\\mathcal{R}_l$, ce qui donne $400\\ \\mathrm{kA/Wb}$ et un flux central de $1{,}25\\ \\mathrm{mWb}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 520 220",
          '<defs>' + marqueur("fl-k-cui") + "</defs>" +
            '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">' +
            '<circle cx="70" cy="120" r="22"/><path d="M70 98V40H150"/><rect x="150" y="26" width="80" height="28" rx="3"/>' +
            '<path d="M230 40H330V70M300 70H360M300 70V90M360 70V90"/><rect x="286" y="90" width="28" height="60" rx="3"/>' +
            '<rect x="346" y="90" width="28" height="60" rx="3"/><path d="M300 150V180H360V150M330 180V200H70V142"/></g>' +
            '<g fill="none" stroke="currentColor" stroke-width="1.6"><path d="M70 128V112" marker-end="url(#fl-k-cui)"/>' +
            '<path d="M250 32H280" marker-end="url(#fl-k-cui)"/><path d="M276 100V136" marker-end="url(#fl-k-cui)"/>' +
            '<path d="M386 100V136" marker-end="url(#fl-k-cui)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
            '<text x="20" y="124">500 A</text><text x="64" y="94">+</text><text x="156" y="72">200 kA/Wb</text>' +
            '<text x="250" y="22">Φc = 2,0 mWb</text><text x="200" y="124">1,0 mWb</text><text x="396" y="124">1,0 mWb</text>' +
            '<text x="400" y="80">2 x 100 kA/Wb</text><text x="400" y="96">en parallèle :</text><text x="400" y="112">50 kA/Wb</text>' +
            '<text x="120" y="216">total 250 kA/Wb</text></g>',
          "Réseau de réluctances annoté : source de 500 ampères-tours, colonne centrale de 200 kA/Wb, deux colonnes latérales en parallèle portant chacune 1,0 mWb."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-self-lissage",
      titre: "Dimensionner une self de lissage",
      niveau: "avancé",
      enonce:
        "<p>On veut une self de lissage de $10\\ \\mathrm{mH}$ capable de porter $15\\ \\mathrm{A}$ crête sans dépasser $1{,}1\\ \\mathrm{T}$, sur " +
        "un noyau de $12\\ \\mathrm{cm^2}$ de section nette. On néglige la réluctance du fer devant celle de l'entrefer. Choisissez le " +
        "nombre entier de spires minimal, puis calculez l'entrefer total, en millimètres.</p>",
      valeur: (MU0 * 114 * 114 * 12e-4) / 0.01 * 1000,
      unite: "mm",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Entrefer total $e$",
      etapes: [
        { texte: "Contrainte de saturation : $\\hat{\\Phi} = L\\hat{I}/N \\le B_{\\max}S$, d'où $N \\ge L\\hat{I}/(B_{\\max}S) = 0{,}01 \\times 15/(1{,}1 \\times 1{,}2 \\times 10^{-3}) = 113{,}6$." },
        { texte: "On prend $N = 114$ spires, nombre entier immédiatement supérieur." },
        { texte: "Inductance imposée : $L = \\mu_0 N^2 S/e$, d'où $e = \\mu_0 N^2 S/L = 4\\pi \\times 10^{-7} \\times 12\\,996 \\times 1{,}2 \\times 10^{-3}/0{,}01$." },
        { texte: "$e = 1{,}96 \\times 10^{-3}\\ \\mathrm{m} = 1{,}96\\ \\mathrm{mm}$, par exemple deux entrefers de $0{,}98\\ \\mathrm{mm}$." },
        {
          texte: "Contrôle : $\\hat{B} = L\\hat{I}/(NS) = 0{,}15/(114 \\times 1{,}2 \\times 10^{-3}) = 1{,}097\\ \\mathrm{T} \\le 1{,}1\\ \\mathrm{T}$ ; énergie $\\tfrac{1}{2}L\\hat{I}^2 = 1{,}13\\ \\mathrm{J}$.",
          note: "Prendre plus de spires baisse l'induction mais allonge le fil et augmente l'entrefer, en $N^2$ ; c'est le compromis cuivre contre fer.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Induction crête en fonction du courant, N = 114",
          xTitre: "courant",
          xUnite: "A",
          yTitre: "B",
          yUnite: "T",
          xMin: 0,
          xMax: 20,
          yMin: 0,
          yMax: 1.6,
          series: [{ id: "b", nom: "B = L i / (N S)", couleur: "serie-1", epaisseur: 2.6, fonction: (i) => (0.01 * i) / (114 * 12e-4) }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 1.1, "B max = 1,1 T", false, [2, 3]);
            ligneV(c, repere, couleurs, 15, "15 A crête");
            pointTrace(c, repere, couleurs, 15, 1.0965, "1,097 T");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic-contacteur",
      titre: "Diagnostic : bobine de contacteur alternatif qui grille",
      niveau: "diagnostic",
      enonce:
        "<p>Un contacteur à bobine $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$ bourdonne fortement et sa bobine grille en quelques heures. On " +
        "découvre un dépôt de poussière collé entre les faces polaires, qui empêche la fermeture complète du circuit magnétique. " +
        "Quelles affirmations expliquent la panne ?</p>",
      options: [
        { texte: "Le flux crête est fixé par la tension et la fréquence ; l'entrefer accidentel ne le réduit pas.", juste: true },
        { texte: "La réluctance augmentée impose un courant magnétisant bien plus grand, d'où l'échauffement de la bobine.", juste: true },
        { texte: "L'entrefer réduit le flux, donc le courant baisse et la bobine refroidit." },
        { texte: "La force d'attraction, pulsant à 100 Hz, ne plaque plus correctement l'armature : bourdonnement.", juste: true },
        { texte: "La même poussière dans un contacteur à bobine continue de 24 V ferait aussi griller la bobine." },
      ],
      etapes: [
        { texte: "Bobine alternative : la tension impose $\\hat{\\Phi} = \\hat{U}/(N\\omega)$, quel que soit l'état du noyau (formule de Boucherot)." },
        { texte: "Le courant vaut $\\mathcal{R}\\hat{\\Phi}/N$ : un entrefer accidentel de quelques dixièmes de millimètre multiplie la réluctance, donc le courant, par un facteur de deux à dix." },
        { texte: "La bobine, dimensionnée pour le courant de maintien noyau fermé, chauffe en $Ri^2$ et grille." },
        {
          texte: "En continu, c'est l'inverse : $I = U/R$ est fixé par la résistance, comme pour la bobine de KM1 ; l'entrefer réduit le flux et la force, mais pas le courant. La bobine ne grille pas, le contacteur colle mal.",
          note: "Remède : nettoyer les faces polaires, vérifier la spire de déphasage, et mesurer le courant de maintien en valeur efficace vraie.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const ferme = (d) => {
          const b = Math.sin(d * DEG);
          return (hFer(b) * EX.l + (b * 0.05e-3) / MU0) / EX.N;
        };
        const ouvert = (d) => {
          const b = Math.sin(d * DEG);
          return (hFer(b) * EX.l + (b * 0.5e-3) / MU0) / EX.N;
        };
        traceCorrection(moteur, conteneur, {
          titre: "Courant de maintien à flux imposé, B crête = 1 T",
          xTitre: "ωt",
          xUnite: "°",
          yTitre: "courant",
          yUnite: "A",
          xMin: 0,
          xMax: 360,
          yMin: -1.3,
          yMax: 1.3,
          series: [
            { id: "f", nom: "noyau fermé, entrefer résiduel 0,05 mm", couleur: "serie-1", epaisseur: 2.4, fonction: ferme },
            { id: "o", nom: "poussière, entrefer 0,5 mm", couleur: "serie-5", epaisseur: 2.8, fonction: ouvert },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 90, "crête du flux");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-conceptuel-entrefer",
      titre: "Pourquoi un entrefer dans une self et pas dans un transformateur ?",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi une self de filtrage comporte volontairement un entrefer, alors qu'un transformateur est " +
        "construit pour en avoir le moins possible.</p>",
      motsCles: [["energie", "stock"], ["courant magnetisant", "magnetisant", "reactif"], ["lineaire", "saturation", "satur", "stable"], ["reluctance", "entrefer"]],
      minimum: 3,
      exemple: "Trois ou quatre phrases : parlez de ce que chaque appareil doit stocker, de la linéarité et du courant magnétisant.",
      etapes: [
        { texte: "Une self doit stocker de l'énergie, $\\tfrac{1}{2}Li^2$ ; à induction égale, l'air en stocke $\\mu_r$ fois plus que le fer : l'énergie d'une self est dans son entrefer." },
        { texte: "L'entrefer domine la réluctance : l'inductance $\\mu_0N^2S/e$ ne dépend plus de $\\mu_r$, elle reste stable et le fer sature plus tard en courant." },
        {
          texte: "Un transformateur doit transférer l'énergie sans la stocker : son flux est imposé par la tension, et tout entrefer ne ferait qu'augmenter le courant magnétisant et la puissance réactive absorbée à vide.",
          note: "Ordre de grandeur de l'exemple : $67\\ \\mathrm{var}$ sans entrefer, $402\\ \\mathrm{var}$ avec $1\\ \\mathrm{mm}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Le même noyau, avec et sans entrefer",
          xTitre: "N i",
          xUnite: "A",
          yTitre: "B",
          yUnite: "T",
          xMin: 0,
          xMax: 2500,
          yMin: 0,
          yMax: 1.8,
          series: [
            { id: "t", nom: "transformateur : sans entrefer, peu d'ampères-tours", couleur: "serie-5", epaisseur: 2.2, fonction: (x) => bCircuit(x, 0.4, 0) },
            { id: "s", nom: "self : entrefer de 1 mm, caractéristique linéaire", couleur: "serie-1", epaisseur: 2.8, fonction: (x) => bCircuit(x, 0.4, 1e-3) },
          ],
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
        enonce: "<p>Quelle est l'unité de la réluctance ?</p>",
        options: ["L'ampère par weber", "Le weber par ampère", "Le tesla", "L'ampère par mètre"],
        bonnes: [0],
        explication: "$\\mathcal{R} = \\mathcal{F}/\\Phi$ : des ampères divisés par des webers, soit l'inverse du henry.",
        resume: "Unité de la réluctance",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Pour un noyau dont l'entrefer domine la réluctance, doubler l'entrefer double l'inductance.</p>",
        reponse: false,
        explication: "$L \\approx \\mu_0N^2S/e$ : doubler $e$ divise l'inductance par deux environ.",
        resume: "Effet de l'entrefer sur L",
      },
      {
        type: "calcul",
        enonce: "<p>Un flux de $1{,}2\\ \\mathrm{mWb}$ traverse une colonne de $10\\ \\mathrm{cm^2}$ de section nette. Quelle est l'induction, en teslas ?</p>",
        valeur: 1.2,
        unite: "T",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$B = \\Phi/S = 1{,}2 \\times 10^{-3}/10^{-3} = 1{,}2\\ \\mathrm{T}$.",
        resume: "Induction à partir du flux",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi les noyaux des transformateurs et des moteurs sont-ils faits de tôles minces isolées entre elles ?</p>",
        motsCles: [["foucault", "courants induits", "courant induit"], ["epaisseur", "mince", "isol", "d2", "carre"]],
        minimum: 2,
        explication:
          "Pour réduire les pertes par courants de Foucault, proportionnelles au carré de l'épaisseur : l'isolation empêche ces courants de passer d'une tôle à l'autre.",
        resume: "Feuilletage",
      },
      {
        type: "calcul",
        enonce:
          "<p>Combien de spires faut-il au primaire d'un transformateur $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$, de section nette $20\\ \\mathrm{cm^2}$, pour une induction crête de $1{,}2\\ \\mathrm{T}$ ? Arrondissez au nombre entier supérieur.</p>",
        valeur: 432,
        unite: "spires",
        tolerance: 0.006,
        chiffres: 1,
        explication: "$N = U/(4{,}44\\,fS\\hat{B}) = 230/(4{,}44 \\times 50 \\times 2 \\times 10^{-3} \\times 1{,}2) = 431{,}7$, soit $432$ spires.",
        resume: "Formule de Boucherot",
      },
      {
        type: "schema",
        enonce: "<p>Sur ce noyau traversé par un flux uniforme, où l'excitation $H$ est-elle la plus forte ?</p>",
        consigne: "Cliquez sur la zone correspondante.",
        viewBox: "0 0 520 230",
        dessin: DESSIN_NOYAU_QUIZ,
        zones: [
          { x: 40, y: 60, largeur: 80, hauteur: 110, etiquette: "colonne bobinée" },
          { x: 200, y: 26, largeur: 120, hauteur: 48, etiquette: "culasse" },
          { x: 396, y: 88, largeur: 60, hauteur: 30, etiquette: "entrefer", juste: true },
        ],
        explication: "À induction égale, $H = B/\\mu_0$ dans l'air est $\\mu_r$ fois plus grand que dans le fer : c'est dans l'entrefer que se consomment les ampères-tours.",
        resume: "Lecture du schéma d'un noyau",
      },
      {
        type: "qcm",
        enonce: "<p>Quelles grandeurs augmentent les pertes par hystérésis d'un noyau ?</p>",
        options: [
          { texte: "La fréquence", juste: true },
          { texte: "L'induction crête", juste: true },
          { texte: "Le champ coercitif du matériau", juste: true },
          { texte: "L'épaisseur des tôles" },
        ],
        multiple: true,
        explication: "$P_h = f\\,V\\oint H\\,\\mathrm{d}B$ : l'aire du cycle croît avec $\\hat{B}$ et $H_c$. L'épaisseur agit sur les courants de Foucault, pas sur l'hystérésis.",
        resume: "Facteurs des pertes par hystérésis",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Sous tension sinusoïdale imposée et résistance négligée, le flux crête d'une bobine ne dépend pas de la réluctance de son noyau.</p>",
        reponse: true,
        explication: "$\\hat{\\Phi} = \\hat{U}/(N\\omega)$ ; la réluctance ne fixe que le courant magnétisant $\\mathcal{R}\\hat{\\Phi}/N$.",
        resume: "Flux imposé par la tension",
      },
      {
        type: "calcul",
        enonce: "<p>Un bobinage de $200$ spires est placé sur un circuit de réluctance totale $400\\ \\mathrm{kA/Wb}$. Quelle est son inductance, en henrys ?</p>",
        valeur: 0.1,
        unite: "H",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$L = N^2/\\mathcal{R} = 40\\,000/4 \\times 10^{5} = 0{,}1\\ \\mathrm{H}$.",
        resume: "Inductance par la réluctance",
      },
      {
        type: "qcm",
        enonce: "<p>Un transformateur sans entrefer, qui travaille à $1{,}3\\ \\mathrm{T}$ crête, est alimenté sous $10\\ \\%$ de surtension. Que devient son courant à vide crête ?</p>",
        options: ["Il augmente de bien plus de 10 %, et se déforme", "Il augmente d'exactement 10 %", "Il ne change pas", "Il diminue"],
        bonnes: [0],
        explication: "Le flux augmente de $10\\ \\%$ et entre dans le coude : dans l'exemple du cours, le courant crête passe de $0{,}58$ à $1{,}05\\ \\mathrm{A}$, $+79\\ \\%$, et devient pointu.",
        resume: "Surtension et saturation",
      },
    ],
    { titre: "Dix questions sur les circuits magnétiques" }
  );
  if (quiz) ressources.push(quiz);
}

/* --------------------------------------------------------------------------
   M. Cartes de mémorisation
   -------------------------------------------------------------------------- */

function construireCartesMemo(racine, api) {
  const cartes = api.cartes(
    "#m-cartes",
    [
      { categorie: "Loi", question: "Que dit le théorème d'Ampère appliqué à un circuit magnétique ?", reponse: "La circulation de $H$ le long de la ligne moyenne égale le courant enlacé : $\\sum H_k l_k = Ni$." },
      { categorie: "Loi", question: "Pourquoi le même flux traverse-t-il le fer et l'entrefer d'un circuit série ?", reponse: "Le flux est conservatif, $\\mathrm{div}\\,\\vec{B} = 0$ : ce qui entre dans un tronçon en ressort, aux fuites près." },
      { categorie: "Formule", question: "Réluctance d'un tronçon ?", reponse: "$\\mathcal{R} = l/(\\mu_0\\mu_r S)$, en $\\mathrm{A/Wb}$ ; loi d'Hopkinson $Ni = (\\sum \\mathcal{R}_k)\\Phi$." },
      { categorie: "Entrefer", question: "Combien de fer vaut un entrefer de 1 mm, à $\\mu_r = 2000$ ?", reponse: "Deux mètres : le rapport des réluctances est $e\\mu_r/l$. L'entrefer domine souvent tout le circuit." },
      { categorie: "Formule", question: "Inductance d'un bobinage sur noyau ?", reponse: "$L = N^2/\\mathcal{R}$, et $L \\approx \\mu_0N^2S/e$ si l'entrefer domine : stable, indépendante de $\\mu_r$." },
      { categorie: "Énergie", question: "Où est stockée l'énergie d'une self à entrefer ?", reponse: "Surtout dans l'entrefer : $w = B^2/(2\\mu)$ est $\\mu_r$ fois plus grande dans l'air à induction égale." },
      { categorie: "Saturation", question: "Que se passe-t-il au-delà du coude de la courbe $B(H)$ ?", reponse: "$\\mu_r$ chute, le courant nécessaire explose, l'inductance baisse ; la loi d'Hopkinson n'est plus valable." },
      {
        categorie: "Alternatif",
        question: "Qu'impose la formule de Boucherot ?",
        reponse: "$U = 4{,}44\\,fNS\\hat{B}$ : tension et fréquence fixent l'induction crête ; le noyau ne fixe que le courant magnétisant.",
        rappel: "Exemple du cours : $230\\ \\mathrm{V}$, $500$ spires, $16\\ \\mathrm{cm^2}$, d'où $1{,}294\\ \\mathrm{T}$.",
      },
      { categorie: "Pertes", question: "Quelles sont les deux pertes fer et leurs lois ?", reponse: "Hystérésis, aire du cycle fois $f$, environ $f\\hat{B}^{1{,}6}$ ; courants de Foucault, $\\pi^2f^2\\hat{B}^2d^2/(6\\rho)$ par $\\mathrm{m^3}$." },
      {
        categorie: "Industriel",
        question: "Que risque une self anti-harmonique qui sature ?",
        reponse: "Son inductance baisse, l'accord de la branche monte vers le rang 5 et la protection contre la résonance disparaît.",
        rappel: "Self du site : $43$ spires, $0{,}834\\ \\mathrm{mm}$, accord à $210\\ \\mathrm{Hz}$ dès $30\\ \\mathrm{A}$ crête.",
      },
    ],
    { titre: "Dix cartes sur les circuits magnétiques" }
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
        enonce: "<p>Cette séance. Quelle excitation règne dans un entrefer où l'induction vaut $1\\ \\mathrm{T}$, en kiloampères par mètre ?</p>",
        valeur: 1 / MU0 / 1000,
        unite: "kA/m",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$H = B/\\mu_0 = 1/(4\\pi \\times 10^{-7}) = 795{,}8\\ \\mathrm{kA/m}$ : un millimètre d'air consomme près de $800$ ampères-tours.",
        resume: "Excitation dans l'air",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Cette séance. Quand le noyau d'un transformateur sature, son courant magnétisant devient pointu et s'enrichit en harmonique de rang 3.</p>",
        reponse: true,
        explication: "Le flux reste sinusoïdal, imposé par la tension ; le courant suit la courbe $B(H)$, qui se redresse aux crêtes, d'où des pointes impaires.",
        resume: "Courant magnétisant saturé",
      },
      {
        type: "qcm",
        enonce: "<p>Cette séance. Comment varient avec la fréquence, à induction crête fixée, les pertes par hystérésis et par courants de Foucault ?</p>",
        options: ["Comme $f$ et comme $f^2$", "Comme $f^2$ et comme $f$", "Toutes deux comme $f$", "Elles ne dépendent pas de $f$"],
        bonnes: [0],
        explication: "Une perte fixe par cycle donne une puissance en $f$ ; les courants de Foucault, proportionnels à $\\mathrm{d}B/\\mathrm{d}t$, dissipent en $f^2$.",
        resume: "Pertes fer et fréquence",
      },
      {
        type: "calcul",
        enonce:
          "<p>Cours <a href=\"#/cours/revision-4-et-mini-projet-qualite-reseau\">Révision 4 et mini-projet qualité réseau</a>. Une self anti-harmonique a un taux $p = 7\\ \\%$. Quelle est la fréquence d'accord de la branche sur un réseau à $50\\ \\mathrm{Hz}$, en hertz ?</p>",
        valeur: 50 / Math.sqrt(0.07),
        unite: "Hz",
        tolerance: 0.01,
        chiffres: 1,
        explication: "Rang d'accord $1/\\sqrt{p} = 3{,}78$, soit $189\\ \\mathrm{Hz}$ : sous le rang 5, premier rang important du courant de la pompe.",
        resume: "Accord d'une self anti-harmonique",
      },
      {
        type: "qcm",
        enonce:
          "<p>Cours <a href=\"#/cours/revision-4-et-mini-projet-qualite-reseau\">Révision 4 et mini-projet qualité réseau</a>. Pourquoi le neutre du départ éclairage et prises est-il surveillé ?</p>",
        options: [
          "Les courants de rang 3 des trois phases s'y ajoutent au lieu de s'annuler",
          "Le neutre porte la composante continue des variateurs",
          "Le neutre ne porte jamais de courant en régime équilibré, toute mesure signale un défaut",
          "Pour mesurer la fréquence du réseau",
        ],
        bonnes: [0],
        explication: "Les rangs multiples de 3 sont homopolaires : en phase sur les trois conducteurs, ils s'additionnent dans le neutre, qui peut porter autant que les phases.",
        resume: "Rangs homopolaires dans le neutre",
      },
      {
        type: "calcul",
        enonce:
          "<p>Cours <a href=\"#/cours/systemes-triphases-equilibres\">Systèmes triphasés équilibrés</a>. Le compresseur couplé en triangle absorbe $32\\ \\mathrm{A}$ en ligne. Quel courant parcourt chaque enroulement, en ampères ?</p>",
        valeur: 32 / Math.sqrt(3),
        unite: "A",
        tolerance: 0.01,
        chiffres: 2,
        explication: "En triangle, $I_{\\mathrm{ligne}} = \\sqrt{3}\\,J$ : $J = 32/\\sqrt{3} = 18{,}48\\ \\mathrm{A}$.",
        resume: "Courant dans un enroulement en triangle",
      },
      {
        type: "calcul",
        enonce:
          "<p>Cours <a href=\"#/cours/diagnostic-initial-et-remise-a-niveau-mathematique\">Diagnostic initial et remise à niveau mathématique</a>. Calculez $\\mu = 4\\pi \\times 10^{-7} \\times 2000$, en millihenrys par mètre.</p>",
        valeur: MU0 * 2000 * 1000,
        unite: "mH/m",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$4\\pi \\times 2000 = 25\\,133$, soit $2{,}513 \\times 10^{-3}\\ \\mathrm{H/m} = 2{,}513\\ \\mathrm{mH/m}$.",
        resume: "Puissances de dix et perméabilité",
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
    titre: "Où en suis-je sur les circuits magnétiques ?",
  });
  if (auto) ressources.push(auto);
}
