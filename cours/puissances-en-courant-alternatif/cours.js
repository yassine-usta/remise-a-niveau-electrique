/* ==========================================================================
   cours/puissances-en-courant-alternatif/cours.js
   Puissances en courant alternatif.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;

/* Réseau du site : 230/400 V, 50 Hz. */
const U0 = 230;
const W50 = 2 * Math.PI * 50;

/* Exemple de la section H : charges sous 230 V, ligne de 0,3 ohm. */
const EX = { rm: 12, xm: 9, pf: 2000, c: 40e-6, rl: 0.3 };

/* Départs du tableau général, par phase (cours Nombres complexes et phaseurs). */
const DEPARTS = { pompe: 47.7, compresseur: 32, cosComp: 0.8, eclairage: 16, cosEcl: 0.95, armoire: 6, cosArm: 0.9, harmoniques: 14.8 };

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
function conj(a) {
  return cx(a.re, -a.im);
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

/** Grandeurs de l'exemple de la section H, pour une capacité donnée (en farads). */
function atelier(capacite = EX.c, pm = null, qm = null) {
  const u = cx(U0, 0);
  const zm = cx(EX.rm, EX.xm);
  const im = pm == null ? div(u, zm) : conj(div(cx(pm, qm), u));
  const iF = cx(EX.pf / U0, 0);
  const ic = cx(0, W50 * capacite * U0);
  const i = add(add(im, iF), ic);
  const sm = mul(u, conj(im));
  const sf = cx(EX.pf, 0);
  const sc = mul(u, conj(ic));
  const s = mul(u, conj(i));
  return { u, im, iF, ic, i, sm, sf, sc, s, pertes: EX.rl * mod(i) ** 2 };
}

/** Bilan par phase du tableau général. */
function bilanSite(cosComp = DEPARTS.cosComp, ih = DEPARTS.harmoniques) {
  const pComp = U0 * DEPARTS.compresseur * DEPARTS.cosComp;
  const iComp = pComp / (U0 * cosComp);
  const lignes = [
    { nom: "pompe", p: U0 * DEPARTS.pompe, q: 0 },
    { nom: "compresseur", p: pComp, q: pComp * Math.tan(Math.acos(cosComp)) },
    { nom: "éclairage et prises", p: U0 * DEPARTS.eclairage * DEPARTS.cosEcl, q: U0 * DEPARTS.eclairage * Math.sin(Math.acos(DEPARTS.cosEcl)) },
    { nom: "armoire", p: U0 * DEPARTS.armoire * DEPARTS.cosArm, q: U0 * DEPARTS.armoire * Math.sin(Math.acos(DEPARTS.cosArm)) },
  ];
  const p = lignes.reduce((total, ligne) => total + ligne.p, 0);
  const q = lignes.reduce((total, ligne) => total + ligne.q, 0);
  const s1 = Math.hypot(p, q);
  const i1 = s1 / U0;
  const ieff = Math.hypot(i1, ih);
  const s = U0 * ieff;
  const iPompe = Math.hypot(DEPARTS.pompe, ih);
  const somme = U0 * (iPompe + iComp + DEPARTS.eclairage + DEPARTS.armoire);
  return { lignes, p, q, s1, i1, ieff, s, d: U0 * ih, somme, iComp };
}

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

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

/** Ligne verticale en tirets sur un tracé, avec son libellé. */
function ligneV(c, repere, couleurs, x, libelle) {
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
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.6;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -6 : 6), repere.boite.y + 14);
  }
  c.restore();
}

/** Ligne horizontale en tirets sur un tracé, avec son libellé. */
function ligneH(c, repere, couleurs, y, libelle, enDessous) {
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
    xTitre: "t",
    xUnite: "ms",
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

/** Triangle des puissances d'une charge sous forme de vecteurs P, jQ et S. */
function triangleCorrection(moteur, conteneur, titre, p, q, noms) {
  return fresnelCorrection(moteur, conteneur, {
    titre,
    unite: "",
    somme: true,
    nomSomme: noms.s,
    vecteurs: [
      { id: "p", nom: noms.p, amplitude: p, phase: 0, couleur: "serie-1" },
      { id: "q", nom: noms.q, amplitude: Math.abs(q), phase: q >= 0 ? 90 : -90, couleur: "serie-3" },
    ],
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
  construireInstant(racine, api);
  construirePassage(racine, api);
  construireBoucherot(racine, api);
  construireChaine(racine, api);
  construireBilan(racine, api);
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
    ["#e-mesure-figure svg", 1.6],
    ["#f-schema-principal svg", 2.2],
    ["#h-circuit-figure svg", 1.8],
    ["#i-tableau-figure svg", 1.8],
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
      id: "c-moyenne",
      titre: "Valeur moyenne d'un cosinus au carré",
      niveau: "prérequis",
      enonce: "<p>Quelle est la valeur moyenne, sur une période, de $\\cos^2(\\omega t)$ ?</p>",
      valeur: 0.5,
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Valeur moyenne",
      etapes: [
        { texte: "$\\cos^2(\\omega t) = \\tfrac{1}{2}\\left[1 + \\cos(2\\omega t)\\right]$." },
        { texte: "Le terme en $\\cos(2\\omega t)$ a une moyenne nulle sur une période : il reste $\\tfrac{1}{2}$.", note: "C'est le facteur qui fait apparaître les valeurs efficaces : la moyenne de $u_m\\cos \\cdot i_m\\cos$ vaut $\\tfrac{1}{2}U_mI_m = UI$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "cos² oscille deux fois plus vite, autour de 1/2",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "valeur",
          xMin: 0,
          xMax: 20,
          yMin: -1.1,
          yMax: 1.1,
          series: [
            { id: "c", nom: "cos(ωt)", couleur: "serie-4", epaisseur: 1.8, fonction: (t) => Math.cos((W50 * t) / 1000) },
            { id: "c2", nom: "cos²(ωt)", couleur: "serie-1", epaisseur: 2.8, fonction: (t) => Math.cos((W50 * t) / 1000) ** 2 },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 0.5, "moyenne 1/2", false);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-conjugue",
      titre: "Un complexe multiplié par son conjugué",
      niveau: "prérequis",
      enonce: "<p>Calculez $(3 + j4)(3 + j4)^*$.</p>",
      valeur: 25,
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Résultat",
      etapes: [
        { texte: "Le conjugué de $3 + j4$ est $3 - j4$." },
        { texte: "$(3 + j4)(3 - j4) = 9 - j12 + j12 - j^2 16 = 9 + 16 = 25$, réel positif.", note: "En général $\\underline{z}\\,\\underline{z}^* = |\\underline{z}|^2$ : c'est ce qui donnera $\\underline{S} = \\underline{Z}\\,\\underline{I}\\,\\underline{I}^* = \\underline{Z}I^2$." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Un complexe et son conjugué, symétriques par rapport à l'axe réel",
          vecteurs: [
            { id: "z", nom: "3 + j4 = 5 ∠ 53,13°", amplitude: 5, phase: 53.13, couleur: "serie-1" },
            { id: "zc", nom: "3 - j4 = 5 ∠ -53,13°", amplitude: 5, phase: -53.13, couleur: "serie-4", pointille: true },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-argument",
      titre: "Argument d'une impédance",
      niveau: "prérequis",
      enonce: "<p>Quel est l'argument, en degrés, de l'impédance $\\underline{Z} = 5{,}75 + j4{,}31\\ \\Omega$ ?</p>",
      valeur: Math.atan2(4.3125, 5.75) / DEG,
      unite: "°",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Argument $\\varphi$",
      etapes: [
        { texte: "Partie réelle positive : l'arc tangente suffit, $\\varphi = \\arctan(4{,}31/5{,}75) = \\arctan 0{,}75$." },
        { texte: "$\\varphi = 36{,}87^\\circ$, d'où $\\cos\\varphi = 0{,}80$ et $\\sin\\varphi = 0{,}60$.", note: "C'est le déphasage du courant du compresseur sur sa tension : il fixera la répartition entre puissance active et réactive." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Triangle d'impédance du compresseur",
          unite: "Ω",
          somme: true,
          nomSomme: "Z = 7,19 Ω à 36,87°",
          vecteurs: [
            { id: "r", nom: "R = 5,75 Ω", amplitude: 5.75, phase: 0, couleur: "serie-4" },
            { id: "x", nom: "X = 4,31 Ω", amplitude: 4.3125, phase: 90, couleur: "serie-3" },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Simulation : puissance instantanée d'une charge
   -------------------------------------------------------------------------- */

function construireInstant(racine, api) {
  const conteneur = racine.querySelector("#d-instant");
  if (!conteneur) return;

  const O = { x: 130, y: 165 };
  const R = 110;
  const T = { x: 430, y: 165 };
  const K = 140 / 3680;
  const svg = svgEl("svg", {
    viewBox: "0 0 720 330",
    role: "img",
    "aria-label": "Phaseurs de la tension et du courant d'une charge, avec une poignée qui règle la direction du courant, et triangle des puissances correspondant",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-d-i");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7">' +
    '<path d="M' + (O.x - 110) + " " + O.y + "H" + (O.x + 175) + '" marker-end="url(#fl-d-i)"/>' +
    '<path d="M' + O.x + " " + (O.y + 140) + "V" + (O.y - 145) + '" marker-end="url(#fl-d-i)"/>' +
    '<path d="M' + (T.x - 20) + " " + T.y + "H" + 700 + '" marker-end="url(#fl-d-i)"/>' +
    '<path d="M' + T.x + " " + (T.y + 150) + "V" + (T.y - 152) + '" marker-end="url(#fl-d-i)"/></g>' +
    '<path d="' + cheminArc(O.x, O.y, R, -90, 90) + '" stroke="currentColor" stroke-width="1.1" fill="none" stroke-dasharray="2 4" opacity="0.8"/>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="10.5" opacity="0.85">' +
    texte(O.x + 172, O.y + 16, "Re", ' text-anchor="end"') +
    texte(O.x + 8, O.y - 134, "Im") +
    texte(698, T.y + 16, "P (W)", ' text-anchor="end"') +
    texte(T.x + 8, T.y - 140, "Q (var)") +
    texte(16, 318, "U : trait plein épais ; I : tirets, direction seule ; P et Q : trait plein ; S : tirets épais") +
    "</g>";
  const vu = svgEl("path", { stroke: "currentColor", "stroke-width": 3.2, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-d-i)" });
  const vi = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none", "stroke-dasharray": "9 5", "marker-end": "url(#fl-d-i)" });
  const arc = svgEl("path", { stroke: "currentColor", "stroke-width": 1.3, fill: "none" });
  const tp = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none" });
  const tq = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none" });
  const ts = svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-dasharray": "11 6", "marker-end": "url(#fl-d-i)" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, vu, vi, arc, tp, tq, ts, etiquettes);
  conteneur.appendChild(svg);

  const etat = { i: 10, phiI: -36.87, t: 0 };
  const grandeurs = () => {
    const phi = -etat.phiI;
    const s = U0 * etat.i;
    return { phi, s, p: s * Math.cos(phi * DEG), q: s * Math.sin(phi * DEG) };
  };
  const pInstant = (tms) => {
    const w = (W50 * tms) / 1000;
    return 2 * U0 * etat.i * Math.cos(w) * Math.cos(w + etat.phiI * DEG);
  };

  const traceUI = api.sim.traceur("#d-instant-trace-ui", {
    titre: "Tension et courant en fonction du temps",
    genre: "Simulation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "u (V) et 10 i (A)",
    xMin: 0,
    xMax: 40,
    yMin: -400,
    yMax: 400,
    ratio: 0.34,
    echantillons: 600,
    series: [
      { id: "u", nom: "u(t), en volts", couleur: "serie-1", epaisseur: 2.6 },
      { id: "i", nom: "10 x i(t), en ampères", couleur: "serie-5", epaisseur: 2 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, etat.t, "instant étudié");
    },
  });
  if (traceUI) ressources.push(traceUI);

  const traceP = api.sim.traceur("#d-instant-trace-p", {
    titre: "Puissance instantanée reçue par la charge",
    genre: "Simulation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "p(t)",
    yUnite: "W",
    xMin: 0,
    xMax: 40,
    yMin: -1000,
    yMax: 5000,
    ratio: 0.34,
    echantillons: 600,
    series: [{ id: "p", nom: "p(t) = u(t) i(t), en watts", couleur: "serie-3", epaisseur: 2.6 }],
    surDessin({ c, repere, couleurs }) {
      const g = grandeurs();
      ligneH(c, repere, couleurs, g.p, "P, moyenne", true);
      ligneH(c, repere, couleurs, g.p + g.s, "P + S", false);
      ligneH(c, repere, couleurs, g.p - g.s, "P - S", true);
      ligneH(c, repere, couleurs, 0, "", false);
      ligneV(c, repere, couleurs, etat.t, "");
    },
  });
  if (traceP) ressources.push(traceP);

  const valeurs = api.sim.valeurs("#d-instant-valeurs", [
    { id: "phi", libelle: "Déphasage φ = φu - φi", unite: "°", decimales: 1 },
    { id: "nature", libelle: "Nature de la charge", format: (v) => ["résistive", "inductive, courant en retard", "capacitive, courant en avance"][v] },
    { id: "p", libelle: "Puissance active P = U I cos φ", unite: "W", decimales: 0 },
    { id: "q", libelle: "Puissance réactive Q = U I sin φ", unite: "var", decimales: 0 },
    { id: "s", libelle: "Puissance apparente S = U I", unite: "VA", decimales: 0 },
    { id: "cos", libelle: "Facteur de puissance cos φ", decimales: 3 },
    { id: "pt", libelle: "p(t) à l'instant étudié", unite: "W", decimales: 0 },
    { id: "neg", libelle: "Part de la période où p(t) < 0", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const g = grandeurs();
    const pu = { x: O.x + 150, y: O.y };
    const pi = { x: O.x + R * Math.cos(etat.phiI * DEG), y: O.y - R * Math.sin(etat.phiI * DEG) };
    vu.setAttribute("d", segment(O.x, O.y, pu.x, pu.y, 3));
    vi.setAttribute("d", segment(O.x, O.y, pi.x, pi.y, 10));
    arc.setAttribute("d", cheminArc(O.x, O.y, 40, 0, etat.phiI));
    const p1 = { x: T.x + K * g.p, y: T.y };
    const p2 = { x: p1.x, y: T.y - K * g.q };
    tp.setAttribute("d", "M" + T.x + " " + T.y + "H" + p1.x.toFixed(1));
    tq.setAttribute("d", "M" + p1.x.toFixed(1) + " " + T.y + "V" + p2.y.toFixed(1));
    ts.setAttribute("d", segment(T.x, T.y, p2.x, p2.y, 3));
    const bas = g.q < 0;
    etiquettes.innerHTML =
      texte(pu.x - 4, pu.y - 10, "U = 230 V", ' text-anchor="end" font-weight="600"') +
      texte(pi.x + 10, pi.y + (etat.phiI < 0 ? 16 : -6), "I = " + nombre(api, etat.i, 1) + " A", ' font-weight="600"') +
      texte(O.x + 56 * Math.cos((etat.phiI / 2) * DEG) - 3, O.y - 56 * Math.sin((etat.phiI / 2) * DEG) + 4, "φ", ' font-size="11"') +
      texte((T.x + p1.x) / 2, T.y + (bas ? -8 : 18), "P", ' text-anchor="middle"') +
      (Math.abs(g.q) > 60 ? texte(p1.x + 8, (T.y + p2.y) / 2 + 4, "Q") : "") +
      texte((T.x + p2.x) / 2 - 10, (T.y + p2.y) / 2 + (bas ? 18 : -8), "S", ' text-anchor="end" font-weight="600"') +
      texte(712, 30, "échelle : 1000 VA pour " + nombre(api, 1000 * K, 0) + " unités", ' text-anchor="end" font-size="11"');
    if (traceUI) {
      const w = W50 / 1000;
      const im = etat.i * Math.SQRT2;
      traceUI.definirFonction("u", (t) => U0 * Math.SQRT2 * Math.cos(w * t));
      traceUI.definirFonction("i", (t) => 10 * im * Math.cos(w * t + etat.phiI * DEG));
    }
    if (traceP) {
      const haut = Math.max(1000, g.p + g.s);
      const basP = Math.min(-400, g.p - g.s);
      traceP.definirPlage({ yMin: basP * 1.12, yMax: haut * 1.12 });
      traceP.definirFonction("p", pInstant);
    }
    if (valeurs) {
      valeurs.maj({
        phi: g.phi,
        nature: Math.abs(g.phi) < 0.5 ? 0 : g.phi > 0 ? 1 : 2,
        p: g.p,
        q: g.q,
        s: g.s,
        cos: Math.cos(g.phi * DEG),
        pt: pInstant(etat.t),
        neg: (Math.abs(g.phi) / 180) * 100,
      });
    }
  }

  let synchro = false;
  let poignee = null;
  let curseurs = null;

  function appliquerAngle(angle, source) {
    if (synchro) return;
    synchro = true;
    etat.phiI = Math.max(-90, Math.min(90, angle));
    if (source !== "poignee" && poignee) poignee.set(etat.phiI, false);
    if (source !== "curseur" && curseurs) curseurs.definir("phi", Math.round(-etat.phiI));
    synchro = false;
    dessiner();
  }

  poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: O,
    rayon: R,
    min: -90,
    max: 90,
    boucle: false,
    pas: 1,
    valeur: etat.phiI,
    libelle: "Direction du phaseur du courant",
    format: (mesure) => "courant à " + nombre(api, mesure.valeur, 0) + " degrés de la tension",
    diffuserAuDepart: false,
    rappel(mesure) {
      appliquerAngle(mesure.valeur, "poignee");
    },
  });
  if (poignee) ressources.push(poignee);

  curseurs = api.sim.curseurs(
    "#d-instant-curseurs",
    [
      { id: "i", libelle: "Courant efficace I", min: 1, max: 16, pas: 0.5, valeur: etat.i, unite: "A" },
      { id: "phi", libelle: "Déphasage φ, positif si le courant est en retard", min: -90, max: 90, pas: 1, valeur: 36.87, unite: "°" },
    ],
    (lues) => {
      etat.i = lues.i;
      if (Math.abs(-lues.phi - etat.phiI) > 0.6) appliquerAngle(-lues.phi, "curseur");
      else dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-instant-lecteur", {
    de: 0,
    a: 40,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Faire avancer l'instant étudié sur deux périodes",
    rappel(valeur) {
      etat.t = valeur;
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Animation : du diagramme de Fresnel au triangle des puissances
   -------------------------------------------------------------------------- */

function construirePassage(racine, api) {
  const conteneur = racine.querySelector("#e-passage");
  if (!conteneur) return;

  const O = { x: 230, y: 185 };
  const I0 = 10;
  const KI = 11;
  const KS = 190 / (U0 * I0);
  const svg = svgEl("svg", {
    viewBox: "0 0 720 370",
    role: "img",
    "aria-label": "Transformation du phaseur du courant en puissance complexe : conjugaison par réflexion sur l'axe réel, puis multiplication par la tension",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-p");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7">' +
    '<path d="M' + (O.x - 210) + " " + O.y + "H" + (O.x + 250) + '" marker-end="url(#fl-e-p)"/>' +
    '<path d="M' + O.x + " " + (O.y + 170) + "V" + (O.y - 172) + '" marker-end="url(#fl-e-p)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="10.5" opacity="0.85">' +
    texte(O.x + 248, O.y + 18, "Re", ' text-anchor="end"') +
    texte(O.x + 8, O.y - 160, "Im") +
    texte(14, 24, "courants : 1 A pour " + KI + " unités") +
    texte(14, 40, "puissances : 1000 VA pour " + nombre(api, 1000 * KS, 1) + " unités") +
    texte(14, 362, "U : trait plein épais ; grandeur transformée : tirets épais ; composantes : trait plein") +
    "</g>";
  const vu = svgEl("path", { stroke: "currentColor", "stroke-width": 3.4, fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-p)" });
  const ch = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none" });
  const cv = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none" });
  const vx = svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-dasharray": "11 6", "marker-end": "url(#fl-e-p)" });
  const arc = svgEl("path", { stroke: "currentColor", "stroke-width": 1.3, fill: "none" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, vu, ch, cv, arc, vx, etiquettes);
  conteneur.appendChild(svg);

  const etat = { phi: 36.87, s: 0 };

  const valeurs = api.sim.valeurs("#e-passage-valeurs", [
    { id: "etape", libelle: "Étape", format: (v) => v },
    { id: "i", libelle: "Courant I, en cartésien", format: (v) => v },
    { id: "ic", libelle: "Conjugué I*", format: (v) => v },
    { id: "s", libelle: "S = U I* = P + jQ", format: (v) => v },
    { id: "cos", libelle: "cos φ = P / S", decimales: 3 },
    { id: "nature", libelle: "La charge", format: (v) => ["ne fait qu'absorber du P", "absorbe du réactif, Q > 0", "fournit du réactif, Q < 0"][v] },
  ]);
  if (valeurs) ressources.push(valeurs);

  function signe(b, decimales, unite) {
    return (b < 0 ? " - j" : " + j") + nombre(api, Math.abs(b), decimales) + " " + unite;
  }

  function dessiner() {
    const phiI = -etat.phi;
    const courant = polaire(I0, phiI);
    const k1 = Math.min(1, etat.s);
    const k2 = Math.max(0, Math.min(1, etat.s - 1));
    const lissage = (x) => x * x * (3 - 2 * x);
    const reflet = 1 - 2 * lissage(k1);
    const echelle = KI + (KS * U0 - KI) * lissage(k2);
    const re = courant.re * echelle;
    const im = courant.im * reflet * echelle;
    const tip = { x: O.x + re, y: O.y - im };
    vu.setAttribute("d", segment(O.x, O.y, O.x + 120, O.y, 3));
    ch.setAttribute("d", Math.abs(re) > 1 ? "M" + O.x + " " + (O.y + 7) + "H" + tip.x.toFixed(1) : "");
    cv.setAttribute("d", Math.abs(im) > 1 ? "M" + tip.x.toFixed(1) + " " + O.y + "V" + tip.y.toFixed(1) : "");
    vx.setAttribute("d", segment(O.x, O.y, tip.x, tip.y, 3));
    const angle = Math.atan2(im, re) / DEG;
    arc.setAttribute("d", cheminArc(O.x, O.y, 46, 0, angle));
    let phase;
    let nomVecteur;
    let nomH;
    let nomV;
    if (etat.s < 0.02) {
      phase = "départ : phaseur du courant I";
      nomVecteur = "I";
      nomH = "I cos φ";
      nomV = "I sin φ";
    } else if (etat.s < 0.98) {
      phase = "conjugaison : réflexion sur l'axe réel";
      nomVecteur = "I*";
      nomH = "I cos φ";
      nomV = "";
    } else if (etat.s < 1.98) {
      phase = "multiplication par U = 230 V";
      nomVecteur = "U I*";
      nomH = "";
      nomV = "";
    } else {
      phase = "arrivée : S = U I* = P + jQ";
      nomVecteur = "S";
      nomH = "P";
      nomV = "Q";
    }
    etiquettes.innerHTML =
      texte(O.x + 118, O.y - 10, "U", ' text-anchor="end" font-weight="600"') +
      texte(tip.x + (re >= 0 ? 8 : -8), tip.y + (im >= 0 ? -8 : 18), nomVecteur, ' font-weight="600"' + (re >= 0 ? "" : ' text-anchor="end"')) +
      (nomH && Math.abs(re) > 30 ? texte((O.x + tip.x) / 2, O.y + 24, nomH, ' text-anchor="middle" font-size="11"') : "") +
      (nomV && Math.abs(im) > 24 ? texte(tip.x + 8, (O.y + tip.y) / 2 + 4, nomV, ' font-size="11"') : "") +
      texte(O.x + 62 * Math.cos((angle / 2) * DEG) - 3, O.y - 62 * Math.sin((angle / 2) * DEG) + 4, "φ", ' font-size="11"') +
      texte(706, 24, phase, ' text-anchor="end" font-size="11.5"');
    if (valeurs) {
      const sc = mul(cx(U0, 0), conj(courant));
      valeurs.maj({
        etape: phase,
        i: nombre(api, courant.re, 2) + signe(courant.im, 2, "A"),
        ic: nombre(api, courant.re, 2) + signe(-courant.im, 2, "A"),
        s: nombre(api, sc.re, 0) + signe(sc.im, 0, "VA"),
        cos: Math.cos(etat.phi * DEG),
        nature: Math.abs(etat.phi) < 0.5 ? 0 : etat.phi > 0 ? 1 : 2,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-passage-curseurs",
    [{ id: "phi", libelle: "Déphasage φ de la charge, positif si inductive", min: -90, max: 90, pas: 1, valeur: etat.phi, unite: "°" }],
    (lues) => {
      etat.phi = lues.phi;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-passage-lecteur", {
    de: 0,
    a: 2,
    duree: 8,
    boucle: false,
    auto: false,
    libelle: "Transformer le courant en puissance complexe",
    rappel(valeur) {
      etat.s = valeur;
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : bilan de Boucherot d'un atelier
   -------------------------------------------------------------------------- */

function construireBoucherot(racine, api) {
  const conteneur = racine.querySelector("#e-boucherot-plan");
  if (!conteneur) return;

  const O = { x: 60, y: 290 };
  const K = 80;
  const svg = svgEl("svg", {
    viewBox: "0 0 720 500",
    role: "img",
    "aria-label": "Plan des puissances : vecteurs du moteur, du four et du condensateur mis bout à bout, et puissance complexe totale ; le point du moteur se déplace avec une poignée",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-b");
  const fond = svgEl("g");
  let graduations = "";
  let textes = "";
  for (let k = 1; k <= 7; k += 1) {
    graduations += "M" + (O.x + K * k) + " " + (O.y - 4) + "v8";
    textes += texte(O.x + K * k, O.y + 18, String(k), ' text-anchor="middle"');
  }
  for (const k of [-2, -1, 1, 2, 3]) {
    graduations += "M" + (O.x - 4) + " " + (O.y - K * k) + "h8";
    textes += texte(O.x - 8, O.y - K * k + 4, String(k), ' text-anchor="end"');
  }
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7">' +
    '<path d="M' + (O.x - 30) + " " + O.y + "H" + 700 + '" marker-end="url(#fl-e-b)"/>' +
    '<path d="' + graduations + '"/>' +
    '<path d="M' + O.x + " " + 495 + "V" + 20 + '" marker-end="url(#fl-e-b)"/></g>' +
    '<rect x="' + O.x + '" y="' + (O.y - 3 * K) + '" width="' + 4 * K + '" height="' + 3 * K + '" stroke="currentColor" stroke-width="1" fill="none" stroke-dasharray="2 4" opacity="0.6"/>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="10.5" opacity="0.85">' +
    textes +
    texte(698, O.y + 34, "P (kW)", ' text-anchor="end"') +
    texte(O.x + 8, 30, "Q (kvar)") +
    texte(712, 44, "moteur, four : trait plein ; condensateur : tirets", ' text-anchor="end" font-size="11"') +
    texte(712, 60, "S total : tirets épais ; zone de la poignée : pointillés", ' text-anchor="end" font-size="11"') +
    "</g>";
  const vm = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none", "marker-end": "url(#fl-e-b)" });
  const vf = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none", "marker-end": "url(#fl-e-b)" });
  const vc = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none", "stroke-dasharray": "8 5", "marker-end": "url(#fl-e-b)" });
  const vs = svgEl("path", { stroke: "currentColor", "stroke-width": 3.4, fill: "none", "stroke-dasharray": "12 6", "marker-end": "url(#fl-e-b)" });
  const arc = svgEl("path", { stroke: "currentColor", "stroke-width": 1.3, fill: "none" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, vm, vf, vc, vs, arc, etiquettes);
  conteneur.appendChild(svg);

  const depart = atelier();
  const etat = { pm: depart.sm.re, qm: depart.sm.im, pf: 2, c: 40 };

  const valeurs = api.sim.valeurs("#e-boucherot-valeurs", [
    { id: "moteur", libelle: "Moteur : P, Q, cos φ", format: (v) => v },
    { id: "four", libelle: "Four : P", unite: "W", decimales: 0 },
    { id: "cond", libelle: "Condensateur : Q = -U²Cω", unite: "var", decimales: 0 },
    { id: "p", libelle: "P total = Σ Pk", unite: "W", decimales: 0 },
    { id: "q", libelle: "Q total = Σ Qk", unite: "var", decimales: 0 },
    { id: "s", libelle: "S = √(P² + Q²)", unite: "VA", decimales: 0 },
    { id: "somme", libelle: "Σ Sk, pour comparaison", unite: "VA", decimales: 0 },
    { id: "i", libelle: "Courant de ligne I = S / U", unite: "A", decimales: 2 },
    { id: "cos", libelle: "Facteur de puissance P / S", format: (v) => v },
    { id: "pertes", libelle: "Pertes dans la ligne de 0,3 Ω", unite: "W", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const qc = -U0 * U0 * W50 * etat.c * 1e-6;
    const pf = etat.pf * 1000;
    const a = { x: O.x + (K * etat.pm) / 1000, y: O.y - (K * etat.qm) / 1000 };
    const b = { x: a.x + (K * pf) / 1000, y: a.y };
    const c = { x: b.x, y: b.y - (K * qc) / 1000 };
    vm.setAttribute("d", segment(O.x, O.y, a.x, a.y, 9));
    vf.setAttribute("d", segment(a.x, a.y, b.x, b.y, 3));
    vc.setAttribute("d", segment(b.x, b.y, c.x, c.y, 3));
    vs.setAttribute("d", segment(O.x, O.y, c.x, c.y, 3));
    const p = etat.pm + pf;
    const q = etat.qm + qc;
    const s = Math.hypot(p, q);
    const angle = Math.atan2(q, p) / DEG;
    arc.setAttribute("d", p > 1 ? cheminArc(O.x, O.y, 60, 0, angle) : "");
    etiquettes.innerHTML =
      (Math.hypot(a.x - O.x, a.y - O.y) > 40 ? texte((O.x + a.x) / 2 - 10, (O.y + a.y) / 2 - 8, "SM", ' text-anchor="end"') : "") +
      (pf > 150 ? texte((a.x + b.x) / 2, a.y - 10, "SF", ' text-anchor="middle"') : "") +
      (Math.abs(qc) > 150 ? texte(b.x + 10, (b.y + c.y) / 2 + 4, "SC") : "") +
      texte((O.x + c.x) / 2 + 6, (O.y + c.y) / 2 + (q >= 0 ? 22 : -10), "S", ' font-weight="600"') +
      (p > 1 ? texte(O.x + 66, O.y + (angle >= 0 ? -10 : 24), "φ", ' font-size="11"') : "");
    if (valeurs) {
      const sm = Math.hypot(etat.pm, etat.qm);
      valeurs.maj({
        moteur:
          nombre(api, etat.pm, 0) + " W ; " + nombre(api, etat.qm, 0) + " var ; " + (sm > 1 ? nombre(api, etat.pm / sm, 3) : "indéfini"),
        four: pf,
        cond: qc,
        p,
        q,
        s,
        somme: sm + pf + Math.abs(qc),
        i: s / U0,
        cos: s > 1 ? nombre(api, p / s, 3) + (Math.abs(q) < 5 ? ", résistif" : q > 0 ? ", inductif" : ", capacitif") : "indéfini",
        pertes: EX.rl * (s / U0) ** 2,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: O.x, y: O.y - 3 * K, largeur: 4 * K, hauteur: 3 * K },
    valeur: { x: O.x + (K * etat.pm) / 1000, y: O.y - (K * etat.qm) / 1000 },
    pas: 4,
    libelle: "Point du moteur dans le plan des puissances",
    format: () => "moteur " + nombre(api, etat.pm, 0) + " watts et " + nombre(api, etat.qm, 0) + " vars",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.pm = ((mesure.x - O.x) / K) * 1000;
      etat.qm = ((O.y - mesure.y) / K) * 1000;
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-boucherot-curseurs",
    [
      { id: "pf", libelle: "Puissance du four", min: 0, max: 3, pas: 0.1, valeur: etat.pf, unite: "kW" },
      { id: "c", libelle: "Capacité du condensateur", min: 0, max: 150, pas: 5, valeur: etat.c, unite: "µF" },
    ],
    (lues) => {
      etat.pf = lues.pf;
      etat.c = lues.c;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   H. Animation : chaînes de courants et de puissances de l'exemple
   -------------------------------------------------------------------------- */

function construireChaine(racine, api) {
  const conteneur = racine.querySelector("#h-chaine");
  if (!conteneur) return;
  const g = atelier();

  const OI = { x: 40, y: 130 };
  const KI = 13;
  const OS = { x: 390, y: 270 };
  const KS = 300 / 4821.3;
  const svg = svgEl("svg", {
    viewBox: "0 0 720 340",
    role: "img",
    "aria-label": "À gauche, somme des phaseurs des courants du moteur, du four et du condensateur ; à droite, somme des puissances complexes des mêmes charges",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-h-ch");
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.1" fill="none" opacity="0.65">' +
    '<path d="M' + (OI.x - 20) + " " + OI.y + "H" + 340 + '" marker-end="url(#fl-h-ch)"/>' +
    '<path d="M' + OI.x + " " + 300 + "V" + 40 + '" marker-end="url(#fl-h-ch)"/>' +
    '<path d="M' + (OS.x - 20) + " " + OS.y + "H" + 712 + '" marker-end="url(#fl-h-ch)"/>' +
    '<path d="M' + OS.x + " " + 320 + "V" + 60 + '" marker-end="url(#fl-h-ch)"/></g>' +
    '<path d="M' + OI.x + " " + OI.y + "H" + (OI.x + 120) + '" stroke="currentColor" stroke-width="1.6" fill="none" marker-end="url(#fl-h-ch)"/>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="10.5" opacity="0.85">' +
    texte(OI.x - 20, 22, "courants : 1 A pour " + KI + " unités") +
    texte(OS.x - 20, 22, "puissances : 1000 VA pour " + nombre(api, 1000 * KS, 1) + " unités") +
    texte(338, OI.y + 16, "Re", ' text-anchor="end"') +
    texte(OI.x + 6, 50, "Im") +
    texte(710, OS.y + 16, "P", ' text-anchor="end"') +
    texte(OS.x + 6, 70, "Q") +
    texte(OI.x + 118, OI.y - 8, "U", ' text-anchor="end"') +
    texte(16, 334, "charges : trait plein ; sommes I et S : tirets épais") +
    "</g>";
  const couche = svgEl("g", { stroke: "currentColor", fill: "none" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, couche, etiquettes);
  conteneur.appendChild(svg);

  const charges = [
    { nom: "moteur", i: g.im, s: g.sm, ni: "IM", ns: "SM" },
    { nom: "four", i: g.iF, s: g.sf, ni: "IF", ns: "SF" },
    { nom: "condensateur", i: g.ic, s: g.sc, ni: "IC", ns: "SC" },
  ];

  const valeurs = api.sim.valeurs("#h-chaine-valeurs", [
    { id: "etape", libelle: "Étape", format: (v) => v },
    { id: "i", libelle: "Somme des courants déjà placés", format: (v) => v },
    { id: "arith", libelle: "Somme arithmétique de leurs valeurs efficaces", unite: "A", decimales: 2 },
    { id: "p", libelle: "P cumulée", unite: "W", decimales: 1 },
    { id: "q", libelle: "Q cumulée", unite: "var", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  let avancement = 0;

  function dessiner() {
    let traits = "";
    let textes = "";
    let ci = cx(0, 0);
    let cs = cx(0, 0);
    let arith = 0;
    charges.forEach((charge, rang) => {
      const part = Math.max(0, Math.min(1, avancement - rang));
      if (part <= 0) return;
      const di = cx(charge.i.re * part, charge.i.im * part);
      const ds = cx(charge.s.re * part, charge.s.im * part);
      const a1 = { x: OI.x + KI * ci.re, y: OI.y - KI * ci.im };
      const a2 = { x: a1.x + KI * di.re, y: a1.y - KI * di.im };
      const b1 = { x: OS.x + KS * cs.re, y: OS.y - KS * cs.im };
      const b2 = { x: b1.x + KS * ds.re, y: b1.y - KS * ds.im };
      traits += '<path d="' + segment(a1.x, a1.y, a2.x, a2.y, 3) + '" stroke-width="2.2" marker-end="url(#fl-h-ch)"/>';
      traits += '<path d="' + segment(b1.x, b1.y, b2.x, b2.y, 3) + '" stroke-width="2.2" marker-end="url(#fl-h-ch)"/>';
      if (part > 0.6) {
        const dxI = rang === 2 ? 8 : rang === 1 ? 0 : -6;
        const dyI = rang === 2 ? 4 : rang === 1 ? 18 : 6;
        textes += texte((a1.x + a2.x) / 2 + dxI, (a1.y + a2.y) / 2 + dyI, charge.ni, rang === 0 ? ' text-anchor="end"' : rang === 1 ? ' text-anchor="middle"' : "");
        const dxS = rang === 2 ? 8 : rang === 1 ? 0 : 6;
        const dyS = rang === 2 ? 4 : rang === 1 ? -8 : 18;
        textes += texte((b1.x + b2.x) / 2 + dxS, (b1.y + b2.y) / 2 + dyS, charge.ns, rang === 1 ? ' text-anchor="middle"' : "");
      }
      ci = add(ci, di);
      cs = add(cs, ds);
      arith += mod(charge.i) * part;
    });
    const fin = Math.max(0, Math.min(1, avancement - 3));
    if (fin > 0) {
      const ti = { x: OI.x + KI * g.i.re * fin, y: OI.y - KI * g.i.im * fin };
      const ts = { x: OS.x + KS * g.s.re * fin, y: OS.y - KS * g.s.im * fin };
      traits += '<path d="' + segment(OI.x, OI.y, ti.x, ti.y, 3) + '" stroke-width="3.2" stroke-dasharray="11 6" marker-end="url(#fl-h-ch)"/>';
      traits += '<path d="' + segment(OS.x, OS.y, ts.x, ts.y, 3) + '" stroke-width="3.2" stroke-dasharray="11 6" marker-end="url(#fl-h-ch)"/>';
      if (fin > 0.6) {
        textes += texte((OI.x + ti.x) / 2 - 4, (OI.y + ti.y) / 2 + 22, "I", ' font-weight="600"');
        textes += texte((OS.x + ts.x) / 2 - 10, (OS.y + ts.y) / 2 - 10, "S", ' font-weight="600"');
      }
    }
    couche.innerHTML = traits;
    etiquettes.innerHTML = textes;
    if (valeurs) {
      const etapes = ["départ : aucune charge", "moteur", "four", "condensateur", "sommes I et S"];
      valeurs.maj({
        etape: etapes[Math.min(4, Math.ceil(avancement - 1e-6))] || etapes[0],
        i: nombre(api, mod(ci), 3) + " A à " + nombre(api, mod(ci) > 1e-6 ? arg(ci) : 0, 2) + "°",
        arith,
        p: cs.re,
        q: cs.im,
      });
    }
  }

  const lecteur = api.sim.lecteur("#h-chaine-lecteur", {
    de: 0,
    a: 4,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Ajouter les charges une à une, puis tracer les sommes",
    rappel(valeur) {
      avancement = valeur;
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(4);
  } else {
    avancement = 4;
  }
  dessiner();
}

/* --------------------------------------------------------------------------
   I. Simulation : bilan de puissance du site
   -------------------------------------------------------------------------- */

function construireBilan(racine, api) {
  const conteneur = racine.querySelector("#i-bilan");
  if (!conteneur) return;

  const O = { x: 30, y: 300 };
  const K = 13.5 / 1000;
  const B = { x: 440, l: 200 / 27000 };
  const svg = svgEl("svg", {
    viewBox: "0 0 720 340",
    role: "img",
    "aria-label": "Bilan de puissance du tableau général par phase : chaîne de Boucherot des quatre départs et barres comparant P, S1, S et la somme arithmétique",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-i-b");
  const fond = svgEl("g");
  let graduations = "";
  let textes = "";
  for (const k of [5, 10, 15, 20]) {
    graduations += "M" + (O.x + K * k * 1000) + " " + (O.y - 4) + "v8";
    textes += texte(O.x + K * k * 1000, O.y + 18, String(k), ' text-anchor="middle"');
  }
  for (const k of [5, 10]) {
    graduations += "M" + (O.x - 4) + " " + (O.y - K * k * 1000) + "h8";
    textes += texte(O.x + 8, O.y - K * k * 1000 + 4, String(k));
  }
  let graduationsB = "";
  for (const k of [0, 5, 10, 15, 20, 25]) {
    graduationsB += "M" + (B.x + B.l * k * 1000) + " 286v8";
    textes += texte(B.x + B.l * k * 1000, 310, String(k), ' text-anchor="middle"');
  }
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7">' +
    '<path d="M' + (O.x - 10) + " " + O.y + "H" + 360 + '" marker-end="url(#fl-i-b)"/>' +
    '<path d="' + graduations + '"/>' +
    '<path d="M' + O.x + " " + (O.y + 10) + "V" + 40 + '" marker-end="url(#fl-i-b)"/>' +
    '<path d="M' + B.x + " 290H" + 700 + graduationsB + '"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="10.5" opacity="0.85">' +
    textes +
    texte(358, O.y + 34, "P (kW)", ' text-anchor="end"') +
    texte(O.x + 8, 50, "Q (kvar)") +
    texte(700, 328, "kVA par phase", ' text-anchor="end"') +
    texte(B.x, 30, "départs : trait plein ; S1 : tirets épais") +
    "</g>";
  const couche = svgEl("g", { stroke: "currentColor", fill: "none" });
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  svg.append(defs, fond, couche, etiquettes);
  conteneur.appendChild(svg);

  const etat = { cos: DEPARTS.cosComp, ih: DEPARTS.harmoniques };

  const valeurs = api.sim.valeurs("#i-bilan-valeurs", [
    { id: "p", libelle: "P par phase", unite: "kW", decimales: 2 },
    { id: "q", libelle: "Q par phase", unite: "kvar", decimales: 2 },
    { id: "s1", libelle: "S1 = √(P² + Q²), fondamental", unite: "kVA", decimales: 2 },
    { id: "d", libelle: "Puissance déformante D = U Ih", unite: "kVA", decimales: 2 },
    { id: "s", libelle: "S = U I, courant efficace vrai", unite: "kVA", decimales: 2 },
    { id: "cos1", libelle: "Facteur de déplacement cos φ1", decimales: 3 },
    { id: "lambda", libelle: "Facteur de puissance λ = P / S", decimales: 3 },
    { id: "i", libelle: "Courant d'arrivée : fondamental ; efficace vrai", format: (v) => v },
    { id: "site", libelle: "Site, trois phases : P ; Q ; S", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const r = bilanSite(etat.cos, etat.ih);
    let traits = "";
    let textes = "";
    let pt = { x: O.x, y: O.y };
    const noms = ["pompe", "compresseur", "éclairage", "armoire"];
    r.lignes.forEach((ligne, rang) => {
      const fin = { x: pt.x + K * ligne.p, y: pt.y - K * ligne.q };
      traits += '<path d="' + segment(pt.x, pt.y, fin.x, fin.y, 3) + '" stroke-width="2.2" marker-end="url(#fl-i-b)"/>';
      const milieu = { x: (pt.x + fin.x) / 2, y: (pt.y + fin.y) / 2 };
      if (rang === 0) textes += texte(milieu.x, milieu.y - 8, noms[rang], ' text-anchor="middle"');
      else if (rang === 1) textes += texte(milieu.x + 8, milieu.y + 12, noms[rang]);
      else if (rang === 2) textes += texte(milieu.x - 6, milieu.y - 6, noms[rang], ' text-anchor="end"');
      else textes += texte(fin.x - 4, fin.y - 18, noms[rang], ' text-anchor="end"');
      pt = fin;
    });
    traits += '<path d="' + segment(O.x, O.y, pt.x, pt.y, 3) + '" stroke-width="3.2" stroke-dasharray="11 6" marker-end="url(#fl-i-b)"/>';
    textes += texte(pt.x + 8, pt.y - 4, "S1", ' font-weight="600"');
    const barres = [
      { nom: "P", v: r.p, y: 70, plein: false },
      { nom: "S1", v: r.s1, y: 120, plein: false },
      { nom: "S", v: r.s, y: 170, plein: true },
      { nom: "U Σ Ik", v: r.somme, y: 220, plein: false },
    ];
    for (const barre of barres) {
      const l = B.l * barre.v;
      traits +=
        '<rect x="' + B.x + '" y="' + barre.y + '" width="' + l.toFixed(1) + '" height="30" stroke-width="' + (barre.plein ? 3 : 1.6) + '"' +
        (barre.plein ? ' fill="currentColor" fill-opacity="0.28"' : "") + "/>";
      textes += texte(B.x - 8, barre.y + 20, barre.nom, ' text-anchor="end" font-weight="600"');
      textes += texte(B.x + l + 8, barre.y + 20, nombre(api, barre.v / 1000, 2));
    }
    couche.innerHTML = traits;
    etiquettes.innerHTML = textes;
    if (valeurs) {
      valeurs.maj({
        p: r.p / 1000,
        q: r.q / 1000,
        s1: r.s1 / 1000,
        d: r.d / 1000,
        s: r.s / 1000,
        cos1: r.p / r.s1,
        lambda: r.p / r.s,
        i: nombre(api, r.i1, 2) + " A ; " + nombre(api, r.ieff, 2) + " A",
        site: nombre(api, (3 * r.p) / 1000, 1) + " kW ; " + nombre(api, (3 * r.q) / 1000, 1) + " kvar ; " + nombre(api, (3 * r.s) / 1000, 1) + " kVA",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-bilan-curseurs",
    [
      { id: "cos", libelle: "cos φ du compresseur, puissance active constante", min: 0.6, max: 1, pas: 0.01, valeur: etat.cos, chiffres: 2 },
      { id: "ih", libelle: "Courant harmonique de la pompe", min: 0, max: 30, pas: 0.2, valeur: etat.ih, unite: "A" },
    ],
    (lues) => {
      etat.cos = lues.cos;
      etat.ih = lues.ih;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/** Dessin d'exercice et de quiz : chaîne de Boucherot de trois charges et leur somme. */
function dessinChaine(idMarqueur) {
  const o = { x: 60, y: 220 };
  const a = { x: 260, y: 90 };
  const b = { x: 420, y: 90 };
  const c = { x: 420, y: 160 };
  return (
    "<defs>" + marqueur(idMarqueur) + "</defs>" +
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.65"><path d="M40 220H560M60 300V30"/></g>' +
    '<g stroke="currentColor" stroke-width="2.4" fill="none">' +
    '<path d="' + segment(o.x, o.y, a.x, a.y, 3) + '" marker-end="url(#' + idMarqueur + ')"/>' +
    '<path d="' + segment(a.x, a.y, b.x, b.y, 3) + '" marker-end="url(#' + idMarqueur + ')"/>' +
    '<path d="' + segment(b.x, b.y, c.x, c.y, 3) + '" marker-end="url(#' + idMarqueur + ')"/></g>' +
    '<path d="' + segment(o.x, o.y, c.x, c.y, 3) + '" stroke="currentColor" stroke-width="3.2" fill="none" stroke-dasharray="11 6" marker-end="url(#' + idMarqueur + ')"/>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="14" font-weight="600">' +
    '<text x="140" y="140">A</text><text x="334" y="78">B</text><text x="432" y="130">C</text><text x="250" y="214">D</text></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
    '<text x="558" y="238" text-anchor="end">P</text><text x="68" y="40">Q</text>' +
    '<text x="20" y="320">plan des puissances d\'un atelier : trois charges bout à bout et leur somme en tirets</text></g>'
  );
}

/** Dessin de quiz : triangle des puissances d'une charge, trois côtés repérés. */
function dessinTriangle(idMarqueur) {
  return (
    "<defs>" + marqueur(idMarqueur) + "</defs>" +
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.65"><path d="M60 250H560M80 290V30"/></g>' +
    '<g stroke="currentColor" stroke-width="2.6" fill="none">' +
    '<path d="M80 250H437" marker-end="url(#' + idMarqueur + ')"/>' +
    '<path d="M440 250V93" marker-end="url(#' + idMarqueur + ')"/></g>' +
    '<path d="M80 250L437.6 91.6" stroke="currentColor" stroke-width="3.2" fill="none" stroke-dasharray="11 6" marker-end="url(#' + idMarqueur + ')"/>' +
    '<path d="M430 250v-10h10" stroke="currentColor" stroke-width="1.2" fill="none"/>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="14" font-weight="600">' +
    '<text x="250" y="276">a</text><text x="456" y="176">b</text><text x="226" y="150">c</text></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
    '<text x="20" y="316">triangle des puissances d\'une charge inductive, angle droit marqué par le petit carré</text></g>'
  );
}

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : puissances à partir des mesures. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-mesures",
      titre: "Puissances d'une charge mesurée",
      niveau: "fondamental",
      enonce:
        "<p>Une charge inductive alimentée sous $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$, absorbe $10\\ \\mathrm{A}$ efficaces, en retard de $30^\\circ$ sur la tension. Calculez $S$, $P$ et $Q$. Donnez la puissance active.</p>",
      valeur: 2300 * Math.cos(30 * DEG),
      unite: "W",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Puissance active $P$",
      etapes: [
        { texte: "$S = UI = 230 \\times 10 = 2300\\ \\mathrm{VA}$." },
        { texte: "$P = S\\cos\\varphi = 2300 \\times 0{,}8660 = 1991{,}9\\ \\mathrm{W}$." },
        { texte: "$Q = S\\sin\\varphi = 2300 \\times 0{,}5 = 1150\\ \\mathrm{var}$, positive car la charge est inductive.", note: "Contrôle : $\\sqrt{1991{,}9^2 + 1150^2} = 2300\\ \\mathrm{VA}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        triangleCorrection(moteur, conteneur, "Triangle des puissances de la charge", 2300 * Math.cos(30 * DEG), 1150, {
          p: "P = 1991,9 W",
          q: "Q = 1150 var",
          s: "S = 2300 VA",
        });
      },
    })
  );

  /* Fondamental 2 : puissances à partir de l'impédance. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-impedance",
      titre: "Puissance réactive d'une impédance",
      niveau: "fondamental",
      enonce:
        "<p>Une impédance $\\underline{Z} = 8 + j6\\ \\Omega$ est alimentée sous $230\\ \\mathrm{V}$. Calculez le courant, puis la puissance réactive absorbée.</p>",
      valeur: 6 * 23 * 23,
      unite: "var",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Puissance réactive $Q$",
      etapes: [
        { texte: "$Z = \\sqrt{8^2 + 6^2} = 10\\ \\Omega$, donc $I = 230/10 = 23\\ \\mathrm{A}$." },
        { texte: "$\\underline{S} = \\underline{Z}I^2 = (8 + j6) \\times 529 = 4232 + j3174\\ \\mathrm{VA}$." },
        { texte: "$Q = 3174\\ \\mathrm{var}$ ; $P = 4232\\ \\mathrm{W}$ ; $S = 5290\\ \\mathrm{VA} = UI$ ; $\\cos\\varphi = 0{,}8$.", note: "Autre voie : $\\underline{S} = U^2/\\underline{Z}^* = 52\\,900/(8 - j6) = 4232 + j3174\\ \\mathrm{VA}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const phi = Math.atan2(6, 8);
        traceCorrection(moteur, conteneur, {
          titre: "p(t) oscille entre P - S et P + S autour de P = 4232 W",
          yTitre: "p(t)",
          yUnite: "W",
          xMin: 0,
          xMax: 20,
          yMin: -1500,
          yMax: 10000,
          series: [
            {
              id: "p",
              nom: "p(t), en watts",
              couleur: "serie-3",
              epaisseur: 2.6,
              fonction: (t) => 2 * 230 * 23 * Math.cos((W50 * t) / 1000) * Math.cos((W50 * t) / 1000 - phi),
            },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 4232, "P = 4232 W", true);
            ligneH(c, repere, couleurs, 4232 + 5290, "P + S = 9522 W", false);
            ligneH(c, repere, couleurs, 4232 - 5290, "P - S = -1058 W", true);
          },
        });
      },
    })
  );

  /* Intermédiaire 1 : bilan de Boucherot. */
  const pI = 3000 + 1500 + 800;
  const qI = 3000 * Math.tan(Math.acos(0.75)) - 800 * Math.tan(Math.acos(0.9));
  const sI = Math.hypot(pI, qI);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-boucherot",
      titre: "Courant d'un départ alimentant trois charges",
      niveau: "intermédiaire",
      enonce:
        "<p>Un départ monophasé $230\\ \\mathrm{V}$ alimente un moteur de $3\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}75$ inductif, un radiateur de $1{,}5\\ \\mathrm{kW}$ et un ensemble de luminaires à LED de $0{,}8\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}90$ capacitif. Calculez le courant du départ et son facteur de puissance. Donnez le courant.</p>",
      valeur: sI / 230,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant du départ $I$",
      etapes: [
        { texte: "Moteur : $Q_M = P\\tan\\varphi = 3000 \\times 0{,}8819 = 2645{,}8\\ \\mathrm{var}$. Radiateur : $Q = 0$. Luminaires : $Q_L = -800 \\times 0{,}4843 = -387{,}5\\ \\mathrm{var}$, négatif car capacitifs." },
        { texte: "Boucherot : $P = 3000 + 1500 + 800 = 5300\\ \\mathrm{W}$ ; $Q = 2645{,}8 - 387{,}5 = 2258{,}3\\ \\mathrm{var}$." },
        { texte: "$S = \\sqrt{5300^2 + 2258{,}3^2} = 5761{,}1\\ \\mathrm{VA}$ ; $I = 5761{,}1/230 = 25{,}05\\ \\mathrm{A}$ ; $\\cos\\varphi = 5300/5761{,}1 = 0{,}920$.", note: "La somme des courants des charges, $17{,}39 + 6{,}52 + 3{,}86 = 27{,}78\\ \\mathrm{A}$, surestime le courant du départ de $11\\ \\%$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const qm = 3000 * Math.tan(Math.acos(0.75));
        const ql = -800 * Math.tan(Math.acos(0.9));
        fresnelCorrection(moteur, conteneur, {
          titre: "Chaîne de Boucherot du départ, en voltampères",
          unite: "VA",
          somme: true,
          nomSomme: "S = 5761 VA",
          vecteurs: [
            { id: "m", nom: "moteur 3000 + j2646", amplitude: Math.hypot(3000, qm), phase: Math.atan2(qm, 3000) / DEG, couleur: "serie-4" },
            { id: "r", nom: "radiateur 1500", amplitude: 1500, phase: 0, couleur: "serie-3" },
            { id: "l", nom: "LED 800 - j388", amplitude: Math.hypot(800, ql), phase: Math.atan2(ql, 800) / DEG, couleur: "serie-5" },
          ],
        });
      },
    })
  );

  /* Intermédiaire 2 : lecture d'une chaîne de Boucherot. */
  ressources.push(
    api.exercice.schema(cible, {
      id: "k-chaine",
      titre: "Reconnaître le condensateur dans un bilan",
      niveau: "intermédiaire",
      consigne: "Cliquez sur le vecteur qui représente le condensateur, puis validez.",
      enonce:
        "<p>Le diagramme ci-dessous est le bilan de Boucherot d'un atelier, dans le plan des puissances, en convention récepteur. Trois charges sont mises bout à bout, puis leur somme est tracée en tirets. Quel vecteur représente une batterie de condensateurs ?</p>",
      viewBox: "0 0 600 340",
      description: "Chaîne de trois vecteurs A montant vers la droite, B horizontal, C descendant, et somme D en tirets",
      dessin: dessinChaine("fl-k-ch"),
      zones: [
        { x: 120, y: 110, largeur: 70, hauteur: 60, etiquette: "vecteur A" },
        { x: 300, y: 62, largeur: 80, hauteur: 46, etiquette: "vecteur B" },
        { x: 404, y: 100, largeur: 60, hauteur: 70, etiquette: "vecteur C", juste: true },
        { x: 220, y: 180, largeur: 80, hauteur: 50, etiquette: "vecteur D" },
      ],
      etapes: [
        { texte: "Un condensateur ne consomme pas de puissance active : son vecteur est vertical." },
        { texte: "En convention récepteur, il fournit du réactif : $Q_C = -C\\omega U^2 &lt; 0$, le vecteur descend. C'est C." },
        { texte: "A, qui monte vers la droite, est une charge inductive comme un moteur ; B, horizontal, une charge résistive ; D est la somme, pas une charge.", note: "Dans le plan des courants, le même condensateur monterait : la conjugaison inverse le sens vertical." },
      ],
      visuelCorrection(conteneur, moteur) {
        fresnelCorrection(moteur, conteneur, {
          titre: "Les trois charges et leur somme",
          unite: "VA",
          somme: true,
          nomSomme: "somme D",
          vecteurs: [
            { id: "a", nom: "A : inductive", amplitude: Math.hypot(200, 130), phase: Math.atan2(130, 200) / DEG, couleur: "serie-4" },
            { id: "b", nom: "B : résistive", amplitude: 160, phase: 0, couleur: "serie-3" },
            { id: "c", nom: "C : condensateur", amplitude: 70, phase: -90, couleur: "serie-5" },
          ],
        });
      },
    })
  );

  /* Avancé : identification par trois appareils. */
  const qAv = Math.sqrt(2300 * 2300 - 1800 * 1800);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-identification",
      titre: "Identifier une charge avec trois appareils",
      niveau: "avancé",
      enonce:
        "<p>Sur un moteur monophasé, on relève $230\\ \\mathrm{V}$ au voltmètre, $10\\ \\mathrm{A}$ à l'ampèremètre et $1800\\ \\mathrm{W}$ au wattmètre, tous efficaces vrais, le courant étant sinusoïdal. Calculez $Q$, le facteur de puissance, puis la résistance $R$ et la réactance $X$ du modèle série. Donnez $X$.</p>",
      valeur: qAv / 100,
      unite: "Ω",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Réactance série $X$",
      etapes: [
        { texte: "$S = UI = 2300\\ \\mathrm{VA}$ ; $\\cos\\varphi = P/S = 1800/2300 = 0{,}783$, soit $\\varphi = 38{,}5^\\circ$." },
        { texte: "$Q = \\sqrt{S^2 - P^2} = \\sqrt{2300^2 - 1800^2} = 1431{,}8\\ \\mathrm{var}$. Les mesures ne donnent pas le signe : c'est la nature de la charge, un moteur, qui le fixe positif." },
        { texte: "Modèle série : $R = P/I^2 = 1800/100 = 18\\ \\Omega$ et $X = Q/I^2 = 1431{,}8/100 = 14{,}32\\ \\Omega$, soit $L = X/\\omega = 45{,}6\\ \\mathrm{mH}$." },
        { texte: "Contrôle : $\\sqrt{18^2 + 14{,}32^2} = 23{,}0\\ \\Omega = U/I$.", note: "Limite : ce modèle ne vaut qu'au point de mesure ; à une autre charge mécanique, le moteur aurait un autre $R$ et un autre $X$." },
      ],
      visuelCorrection(conteneur, moteur) {
        triangleCorrection(moteur, conteneur, "Triangle des puissances déduit des trois mesures", 1800, qAv, {
          p: "P = 1800 W, wattmètre",
          q: "Q = 1431,8 var, déduite",
          s: "S = 2300 VA, voltmètre et ampèremètre",
        });
      },
    })
  );

  /* Diagnostic industriel : facteur de puissance d'un variateur. */
  const q1 = 40 * Math.tan(Math.acos(0.98));
  const s1 = Math.hypot(40, q1);
  const dD = Math.sqrt(50 * 50 - s1 * s1);
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Un facteur de puissance trop faible sur un départ variateur",
      niveau: "diagnostic",
      enonce:
        "<p>Sur le départ d'un gros variateur à pont de diodes, l'analyseur de réseau affiche, par phase, $P = 40\\ \\mathrm{kW}$, $S = 50\\ \\mathrm{kVA}$, donc $\\lambda = 0{,}80$, et un facteur de déplacement $\\cos\\varphi_1 = 0{,}98$. Le responsable propose d'installer des condensateurs pour remonter $\\lambda$. Quelles conclusions sont justifiées ?</p>",
      options: [
        { texte: "Au fondamental, $Q_1 = P\\tan\\varphi_1 \\approx 8{,}1\\ \\mathrm{kvar}$ et $S_1 \\approx 40{,}8\\ \\mathrm{kVA}$ : l'essentiel de l'écart avec $50\\ \\mathrm{kVA}$ ne vient pas du réactif.", juste: true },
        { texte: "La puissance déformante vaut environ $\\sqrt{50^2 - 40{,}8^2} \\approx 28{,}9\\ \\mathrm{kVA}$ : ce sont les harmoniques du courant qui dégradent $\\lambda$.", juste: true },
        { texte: "Des condensateurs ramèneraient $\\lambda$ à $1$ en compensant les $8{,}1\\ \\mathrm{kvar}$." },
        { texte: "Des condensateurs placés sur ce départ risquent de surchauffer et de résonner avec le réseau aux fréquences harmoniques.", juste: true },
        { texte: "Les remèdes adaptés sont une self de ligne, un filtre d'harmoniques ou un redresseur à absorption sinusoïdale, à étudier avec le constructeur.", juste: true },
      ],
      etapes: [
        { texte: "$\\tan\\varphi_1 = \\tan(\\arccos 0{,}98) = 0{,}203$, donc $Q_1 = 40 \\times 0{,}203 = 8{,}12\\ \\mathrm{kvar}$ et $S_1 = \\sqrt{40^2 + 8{,}12^2} = 40{,}82\\ \\mathrm{kVA}$." },
        { texte: "$D = \\sqrt{S^2 - S_1^2} = \\sqrt{50^2 - 40{,}82^2} = 28{,}88\\ \\mathrm{kVA}$ : bien plus que $Q_1$." },
        { texte: "Compenser parfaitement $Q_1$ donnerait au mieux $\\lambda = 40/\\sqrt{40^2 + 28{,}88^2} = 0{,}81$ : le gain est négligeable, et un condensateur absorbe un courant harmonique proportionnel au rang.", note: "Ce mécanisme a été vu dans le cours Impédances en régime sinusoïdal ; la résonance sera traitée dans le cours Résonance série et parallèle." },
      ],
      visuelCorrection(conteneur, moteur) {
        const spectre = moteur.sim.spectre(conteneur, {
          titre: "Décomposition de la puissance apparente, en kVA",
          genre: "Correction visuelle",
          xTitre: "grandeur",
          yTitre: "valeur",
          unite: "kVA",
          barres: [
            { etiquette: "P (kW)", valeur: 40 },
            { etiquette: "Q1 (kvar)", valeur: q1 },
            { etiquette: "D", valeur: dD },
            { etiquette: "S", valeur: 50 },
          ],
          mesures: [
            { nom: "S1 au fondamental", valeur: nombre(moteur, s1, 2) + " kVA" },
            { nom: "λ maximal après compensation de Q1", valeur: nombre(moteur, 40 / Math.hypot(40, dD), 3) },
          ],
        });
        if (spectre) ressources.push(spectre);
      },
    })
  );

  /* Conceptuel : pourquoi la puissance réactive coûte. */
  const ia = 5888 / 230;
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Une puissance de moyenne nulle qui coûte",
      niveau: "conceptuel",
      enonce:
        "<p>La puissance réactive a une valeur moyenne nulle : aucune énergie n'est consommée par elle. Expliquez, sans calcul long, pourquoi un distributeur d'électricité et un exploitant ont pourtant intérêt à la limiter.</p>",
      motsCles: [
        ["courant", "intensite"],
        ["perte", "joule", "ri2", "echauff"],
        ["cable", "transformateur", "ligne", "conducteur", "dimension"],
        ["chute de tension", "tension", "capacite", "kva"],
      ],
      minimum: 3,
      exemple: "Trois phrases : ce que fait le réactif au courant, ce que le courant fait aux conducteurs, ce que cela coûte.",
      etapes: [
        { texte: "À puissance active et tension données, le courant vaut $I = P/(U\\cos\\varphi)$ : plus il y a de réactif, plus le courant est grand." },
        { texte: "Ce courant provoque des pertes Joule $RI^2$, de la puissance active bien réelle, dans les câbles et les transformateurs, ainsi que des chutes de tension." },
        { texte: "Il occupe aussi la capacité du matériel, dimensionné en courant donc en kilovoltampères : une partie du transformateur sert à faire circuler de l'énergie qui ne travaille pas.", note: "D'où l'intérêt de produire le réactif près des charges, par des condensateurs : c'est le sujet du cours Correction du facteur de puissance." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Même puissance active, 5888 W : courant à cos φ = 1 et à cos φ = 0,8",
          yTitre: "i(t)",
          yUnite: "A",
          xMin: 0,
          xMax: 20,
          yMin: -50,
          yMax: 50,
          series: [
            { id: "a", nom: "cos φ = 1 : 25,6 A efficaces", couleur: "serie-3", epaisseur: 2.2, fonction: (t) => ia * Math.SQRT2 * Math.cos((W50 * t) / 1000) },
            { id: "b", nom: "cos φ = 0,8 : 32 A efficaces, pertes x 1,56", couleur: "serie-5", epaisseur: 2.6, fonction: (t) => 32 * Math.SQRT2 * Math.cos((W50 * t) / 1000 - 36.87 * DEG) },
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
        enonce: "<p>Dans quelle unité exprime-t-on la puissance réactive ?</p>",
        options: ["Le watt", "Le voltampère réactif", "Le voltampère", "Le joule"],
        bonnes: [1],
        explication: "$Q$ s'exprime en $\\mathrm{var}$ ; $P$ en watts, $S$ en voltampères. Les trois ont la même dimension, $\\mathrm{V \\cdot A}$.",
        resume: "Unité de Q",
      },
      {
        type: "vraiFaux",
        enonce: "<p>La puissance apparente d'une installation est la somme des puissances apparentes de ses charges.</p>",
        reponse: false,
        explication: "Boucherot additionne les $P$ et les $Q$ ; $S = \\sqrt{P^2 + Q^2}$ est en général inférieure à $\\sum S_k$, sauf si toutes les charges ont le même $\\varphi$.",
        resume: "Additivité de S",
      },
      {
        type: "calcul",
        enonce: "<p>Une charge absorbe $5\\ \\mathrm{A}$ sous $230\\ \\mathrm{V}$ avec $\\cos\\varphi = 0{,}6$. Quelle est sa puissance active, en watts ?</p>",
        valeur: 230 * 5 * 0.6,
        unite: "W",
        tolerance: 0.01,
        chiffres: 0,
        explication: "$P = UI\\cos\\varphi = 230 \\times 5 \\times 0{,}6 = 690\\ \\mathrm{W}$, pour $S = 1150\\ \\mathrm{VA}$.",
        resume: "Puissance active",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la puissance réactive, avec son signe, en convention récepteur, d'un condensateur de $20\\ \\mu\\mathrm{F}$ sous $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$, en vars ?</p>",
        valeur: -230 * 230 * W50 * 20e-6,
        unite: "var",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$Q_C = -C\\omega U^2 = -20 \\times 10^{-6} \\times 314{,}16 \\times 230^2 = -332{,}4\\ \\mathrm{var}$ : le condensateur fournit du réactif.",
        resume: "Réactif d'un condensateur",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi la puissance complexe s'écrit-elle $\\underline{U}\\,\\underline{I}^*$ et non $\\underline{U}\\,\\underline{I}$ ?</p>",
        motsCles: [["argument", "phase", "angle", "dephas"], ["difference", "phi u - phi i", "soustr", "moins"], ["reference", "origine", "independ"]],
        minimum: 2,
        explication:
          "Le conjugué soustrait les phases : l'argument de $\\underline{U}\\,\\underline{I}^*$ est $\\varphi_u - \\varphi_i = \\varphi$, indépendant de l'origine des temps, alors que $\\underline{U}\\,\\underline{I}$ aurait l'argument $\\varphi_u + \\varphi_i$, qui n'a pas de sens physique.",
        resume: "Rôle du conjugué",
      },
      {
        type: "calcul",
        enonce: "<p>Une installation absorbe $3\\ \\mathrm{kW}$ et $4\\ \\mathrm{kvar}$. Quelle est sa puissance apparente, en kilovoltampères ?</p>",
        valeur: 5,
        unite: "kVA",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$S = \\sqrt{3^2 + 4^2} = 5\\ \\mathrm{kVA}$, et $\\cos\\varphi = 0{,}6$.",
        resume: "Puissance apparente",
      },
      {
        type: "vraiFaux",
        enonce: "<p>En présence d'harmoniques de courant, le facteur de puissance $\\lambda$ est égal au facteur de déplacement $\\cos\\varphi_1$.</p>",
        reponse: false,
        explication: "$\\lambda = (I_1/I)\\cos\\varphi_1$ est plus petit que $\\cos\\varphi_1$ dès que le courant contient des harmoniques, car $I &gt; I_1$.",
        resume: "Facteur de puissance et harmoniques",
      },
      {
        type: "qcm",
        enonce: "<p>Sur un réseau à $50\\ \\mathrm{Hz}$, à quelle fréquence oscille la puissance instantanée d'une charge linéaire ?</p>",
        options: ["$25\\ \\mathrm{Hz}$", "$50\\ \\mathrm{Hz}$", "$100\\ \\mathrm{Hz}$", "Elle n'oscille pas"],
        bonnes: [2],
        explication: "$p(t) = UI\\cos\\varphi + UI\\cos(2\\omega t + \\varphi_u + \\varphi_i)$ : le terme variable est à $2\\omega$, soit $100\\ \\mathrm{Hz}$.",
        resume: "Fréquence de p(t)",
      },
      {
        type: "schema",
        enonce: "<p>Sur ce triangle des puissances, quel côté représente la grandeur affichée par un wattmètre ?</p>",
        consigne: "Cliquez sur l'étiquette du côté correspondant.",
        viewBox: "0 0 600 330",
        description: "Triangle rectangle : côté a horizontal, côté b vertical, côté c en tirets reliant l'origine au sommet",
        dessin: dessinTriangle("fl-l-t"),
        zones: [
          { x: 230, y: 254, largeur: 50, hauteur: 34, etiquette: "a", juste: true },
          { x: 444, y: 156, largeur: 40, hauteur: 34, etiquette: "b" },
          { x: 206, y: 128, largeur: 44, hauteur: 34, etiquette: "c" },
        ],
        explication: "Le wattmètre mesure la moyenne de $u\\,i$, la puissance active $P$ : le côté horizontal a. Le côté b est $Q$, l'hypoténuse c est $S$.",
        resume: "Lecture du triangle des puissances",
      },
      {
        type: "calcul",
        enonce: "<p>Un départ monophasé de $230\\ \\mathrm{V}$ transporte $45\\ \\mathrm{A}$ efficaces vrais pour $9\\ \\mathrm{kW}$. Quel est son facteur de puissance ?</p>",
        valeur: 9000 / (230 * 45),
        tolerance: 0.01,
        chiffres: 3,
        explication: "$\\lambda = P/S = 9000/(230 \\times 45) = 9000/10\\,350 = 0{,}870$.",
        resume: "Facteur de puissance",
      },
    ],
    { titre: "Dix questions sur les puissances en courant alternatif" }
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
      { categorie: "Définition", question: "Qu'est-ce que la puissance active ?", reponse: "La valeur moyenne de $p(t) = u(t)\\,i(t)$ : $P = UI\\cos\\varphi$, en watts. C'est la seule qui produit travail et chaleur." },
      { categorie: "Définition", question: "Que mesure la puissance réactive ?", reponse: "L'amplitude de la composante de $p(t)$ à valeur moyenne nulle : $Q = UI\\sin\\varphi$, en vars ; $Q = 2\\omega(\\overline{W_m} - \\overline{W_e})$." },
      { categorie: "Signe", question: "Quel est le signe de $Q$ pour un moteur et pour un condensateur ?", reponse: "En convention récepteur : $Q &gt; 0$ pour une charge inductive, $Q &lt; 0$ pour un condensateur, qui fournit du réactif." },
      { categorie: "Formule", question: "Comment calcule-t-on la puissance complexe ?", reponse: "$\\underline{S} = \\underline{U}\\,\\underline{I}^* = P + jQ$, avec des phaseurs efficaces ; aussi $\\underline{Z}I^2$ et $U^2/\\underline{Z}^*$." },
      { categorie: "Triangle", question: "Quelles relations lient $P$, $Q$ et $S$ ?", reponse: "$S^2 = P^2 + Q^2$, $\\cos\\varphi = P/S$, $\\tan\\varphi = Q/P$ : triangle rectangle d'angle $\\varphi$." },
      { categorie: "Boucherot", question: "Que dit le théorème de Boucherot ?", reponse: "Les puissances actives et réactives de toutes les charges s'additionnent, avec leur signe ; les puissances apparentes ne s'additionnent pas." },
      { categorie: "Instantané", question: "Entre quelles valeurs oscille $p(t)$, et à quelle fréquence ?", reponse: "Entre $P - S$ et $P + S$, à deux fois la fréquence du réseau ; elle est négative pendant une fraction $\\varphi/180^\\circ$ de la période." },
      { categorie: "Harmoniques", question: "Que devient le facteur de puissance avec un courant déformé ?", reponse: "$\\lambda = P/S = (I_1/I)\\cos\\varphi_1$, plus petit que le facteur de déplacement ; $S^2 = P^2 + Q^2 + D^2$." },
      { categorie: "Conception", question: "Sur quelle puissance dimensionne-t-on une source ou un câble ?", reponse: "Sur la puissance apparente et le courant efficace vrai, qui fixent l'échauffement, pas sur la puissance active." },
      {
        categorie: "Industriel",
        question: "Quel est le bilan par phase du tableau général du site ?",
        reponse: "$P = 21{,}6\\ \\mathrm{kW}$, $Q = 6{,}17\\ \\mathrm{kvar}$, $\\cos\\varphi_1 = 0{,}962$, $\\lambda = 0{,}951$ ; le compresseur porte $72\\ \\%$ du réactif.",
        rappel: "Site complet : 64,8 kW, 18,5 kvar, 68,1 kVA.",
      },
    ],
    { titre: "Dix cartes sur les puissances en courant alternatif" }
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
        enonce: "<p>Quelle est la puissance réactive absorbée par $\\underline{Z} = 10 + j10\\ \\Omega$ sous $230\\ \\mathrm{V}$, en vars ?</p>",
        valeur: (230 * 230 * 10) / 200,
        unite: "var",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$\\underline{S} = U^2/\\underline{Z}^* = 52\\,900/(10 - j10) = 2645 + j2645\\ \\mathrm{VA}$ : $Q = 2645\\ \\mathrm{var}$.",
        resume: "Puissance complexe (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>En convention récepteur, un condensateur a une puissance réactive négative.</p>",
        reponse: true,
        explication: "$\\underline{S}_C = U^2/\\underline{Z}_C^* = -jC\\omega U^2$ : $Q_C &lt; 0$, il fournit du réactif.",
        resume: "Signe de Q (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Pour une charge déphasée de $\\varphi = 60^\\circ$, pendant quel pourcentage de la période la puissance instantanée est-elle négative ?</p>",
        valeur: (60 / 180) * 100,
        unite: "%",
        tolerance: 0.01,
        chiffres: 1,
        explication: "La fraction vaut $\\varphi/180^\\circ = 60/180 = 33{,}3\\ \\%$ : un tiers de la période, l'énergie revient vers la source.",
        resume: "Puissance instantanée (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est le module de l'impédance d'une résistance de $30\\ \\Omega$ en série avec une réactance inductive de $40\\ \\Omega$, en ohms ?</p>",
        valeur: 50,
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$|30 + j40| = \\sqrt{900 + 1600} = 50\\ \\Omega$. Révisé du cours Impédances en régime sinusoïdal.",
        resume: "Module d'impédance (cours précédent)",
      },
      {
        type: "qcm",
        enonce: "<p>Quelle est l'impédance d'un condensateur idéal de capacité $C$ à la pulsation $\\omega$ ?</p>",
        options: ["$jC\\omega$", "$-j/(C\\omega)$", "$j/(C\\omega)$", "$1/(C\\omega)$"],
        bonnes: [1],
        explication: "$\\underline{Z}_C = 1/(jC\\omega) = -j/(C\\omega)$, sous l'axe réel. $jC\\omega$ est son admittance. Révisé du cours Impédances en régime sinusoïdal.",
        resume: "Impédance du condensateur (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>La bobine du contacteur KM1 a $L = 1{,}2\\ \\mathrm{H}$ et $R = 48\\ \\Omega$. Quelle est sa constante de temps, en millisecondes ?</p>",
        valeur: (1.2 / 48) * 1000,
        unite: "ms",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$\\tau = L/R = 1{,}2/48 = 25\\ \\mathrm{ms}$. Révisé du cours Régime transitoire RL : pendant ce régime, ni l'impédance ni la puissance complexe ne s'appliquent.",
        resume: "Constante de temps RL (Régime transitoire RL)",
      },
      {
        type: "qcm",
        enonce: "<p>Un dipôle est fléché en convention générateur et le produit $u\\,i$ est positif. Que fait-il ?</p>",
        options: ["Il reçoit de la puissance", "Il fournit de la puissance", "On ne peut pas conclure", "Il ne consomme que du réactif"],
        bonnes: [1],
        explication: "En convention générateur, $p = ui &gt; 0$ signifie puissance fournie. Révisé du cours Tension, courant, charge et puissance : c'est la même convention qui fixe le signe de $P$ et de $Q$ ici.",
        resume: "Conventions (Tension, courant, charge et puissance)",
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
    titre: "Où en suis-je sur les puissances en courant alternatif ?",
  });
  if (auto) ressources.push(auto);
}
