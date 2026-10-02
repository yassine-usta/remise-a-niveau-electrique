/* ==========================================================================
   cours/methodes-de-resolution-systematique/cours.js
   Méthodes de résolution systématique.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const MONO = 'font-family="ui-monospace, monospace"';

/* Réseau de référence de la section E : kΩ, mS, V, mA. */
const REF = { e1: 12, is: 4, ra: 1, rb: 0.5, rc: 1, rd: 1, re: 2 };

/* Bus 24 V secouru de la section I : Ω, S, V, A. */
const BUS = { ech: 27, rch: 0.5, ra: 6, rcb: 0.05, rb: 0.5, rk: 48, seuil: 0.85 * 24 };
const SECTIONS = [1.5, 2.5, 4, 6];

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

/** Élimination de Gauss avec recherche du plus grand pivot. Renvoie null si la matrice est singulière. */
function resoudre(matrice, secondMembre) {
  const n = matrice.length;
  const m = matrice.map((ligne, i) => ligne.slice().concat([secondMembre[i]]));
  for (let k = 0; k < n; k += 1) {
    let p = k;
    for (let i = k + 1; i < n; i += 1) if (Math.abs(m[i][k]) > Math.abs(m[p][k])) p = i;
    if (Math.abs(m[p][k]) < 1e-14) return null;
    [m[k], m[p]] = [m[p], m[k]];
    for (let i = k + 1; i < n; i += 1) {
      const f = m[i][k] / m[k][k];
      for (let j = k; j <= n; j += 1) m[i][j] -= f * m[k][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = m[i][n];
    for (let j = i + 1; j < n; j += 1) s -= m[i][j] * x[j];
    x[i] = s / m[i][i];
  }
  return x;
}

function determinant3(g) {
  return (
    g[0][0] * (g[1][1] * g[2][2] - g[1][2] * g[2][1]) -
    g[0][1] * (g[1][0] * g[2][2] - g[1][2] * g[2][0]) +
    g[0][2] * (g[1][0] * g[2][1] - g[1][1] * g[2][0])
  );
}

/** Marqueur de flèche, défini une fois par schéma. */
function marqueur(id) {
  return (
    '<marker id="' + id + '" markerWidth="9" markerHeight="9" refX="6" refY="4" orient="auto">' +
    '<path d="M0 0 8 4 0 8Z" fill="currentColor"/></marker>'
  );
}

/** Schéma SVG de correction, tracé progressivement par api.dessiner. */
function visuelSvg(conteneur, api, viewBox, contenu, libelle) {
  const cadre = document.createElement("div");
  cadre.className = "schema-vivant";
  cadre.innerHTML = '<svg viewBox="' + viewBox + '" role="img" aria-label="' + libelle + '">' + contenu + "</svg>";
  conteneur.appendChild(cadre);
  const svg = cadre.querySelector("svg");
  if (svg) ressources.push(api.dessiner(svg, { duree: 1.4 }));
}

/** Point marqué sur un tracé, avec rappels pointillés vers les axes. */
function marquerPoint(c, repere, couleurs, x, y, texte, aGauche) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.setLineDash([5, 4]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(repere.boite.x, py);
  c.lineTo(px, py);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  c.setLineDash([]);
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

/** Ligne horizontale en tirets sur un tracé, avec son libellé. */
function ligneHorizontale(c, repere, couleurs, y, texte, enDessous) {
  const py = repere.versY(y);
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

/** Disques aux points calculés d'une série numérique. */
function disques(c, repere, couleur, points, rayon) {
  c.save();
  c.fillStyle = couleur;
  c.beginPath();
  c.rect(repere.boite.x, repere.boite.y - 1, repere.boite.l, repere.boite.h + 2);
  c.clip();
  for (const [x, y] of points) {
    if (!Number.isFinite(y)) continue;
    c.beginPath();
    c.arc(repere.versX(x), repere.versY(y), rayon, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** Flèche de courant horizontale ou verticale, retournée selon le signe. */
function reglerFlecheCourant(fleche, x, y, orientation, signe, demiLongueur = 12) {
  const s = signe >= 0 ? 1 : -1;
  const d =
    orientation === "h"
      ? "M" + (x - s * demiLongueur) + " " + y + "H" + (x + s * demiLongueur)
      : "M" + x + " " + (y - s * demiLongueur) + "V" + (y + s * demiLongueur);
  fleche.setAttribute("d", d);
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
  construireRelaxation(racine, api);
  construireNoeuds(racine, api);
  construireGauss(racine, api);
  construireCompagnon(racine, api);
  construirePas(racine, api);
  construireBus(racine, api);
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
  const lents = ["#e-circuit-figure svg", "#f-schema-principal svg", "#h-pont-figure svg"];
  const rapides = ["#e-mna-figure svg", "#e-mailles-figure svg", "#e-bilan-figure svg"];
  for (const selecteur of lents) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree: 2.2 }));
  }
  for (const selecteur of rapides) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree: 1.5 }));
  }
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-norton",
      titre: "Convertir une source de tension réelle en source de Norton",
      niveau: "diagnostic",
      enonce:
        "<p>Rappel du cours Théorèmes de Thévenin, Norton et superposition : une source de $12\\ \\mathrm{V}$ possède une résistance interne de $4\\ \\Omega$. Quel est le courant de la source de Norton équivalente, en ampères ?</p>",
      valeur: 3,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "I_N",
      etapes: [
        { texte: "Le courant de Norton est le courant de court-circuit : bornes reliées, seule la résistance interne limite le courant." },
        { texte: "$I_N = E/R = 12/4 = 3\\ \\mathrm{A}$, avec la même résistance de $4\\ \\Omega$, placée en parallèle." },
        {
          texte: "Contrôle à vide : $3\\ \\mathrm{A} \\times 4\\ \\Omega = 12\\ \\mathrm{V}$, la tension de Thévenin est retrouvée.",
          note: "C'est la conversion qui permet d'écrire toute source réelle dans le second membre $I$ de la méthode des nœuds.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 220",
          "<defs>" + marqueur("fl-c-norton") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<circle cx="70" cy="110" r="22"/><path d="M70 88V40H110M170 40H220M70 132V180H220"/><rect x="110" y="28" width="60" height="24" rx="3"/>' +
            '<circle cx="390" cy="110" r="22"/><path d="M390 88V40H500M390 132V180H500M450 40V80M450 140V180"/><rect x="438" y="80" width="24" height="60" rx="3"/>' +
            '<path d="M390 124V98" marker-end="url(#fl-c-norton)"/><path d="M262 110H330" marker-end="url(#fl-c-norton)"/></g>' +
            '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12.5">' +
            '<text x="70" y="106" text-anchor="middle" font-weight="600">+</text><text x="40" y="114" text-anchor="end">12 V</text>' +
            '<text x="140" y="20" text-anchor="middle">4 Ω</text><text x="296" y="100" text-anchor="middle">équivaut à</text>' +
            '<text x="360" y="114" text-anchor="end">3 A</text><text x="474" y="114">4 Ω</text>' +
            '<text x="140" y="210" text-anchor="middle">Thévenin : E, R en série</text><text x="445" y="210" text-anchor="middle">Norton : E/R, R en parallèle</text></g>',
          "Source de 12 volts en série avec 4 ohms, équivalente à une source de courant de 3 ampères en parallèle avec 4 ohms"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-determinant",
      titre: "Déterminant d'une matrice 2 x 2",
      niveau: "diagnostic",
      enonce:
        "<p>Calculez le déterminant de la matrice $\\begin{pmatrix} 3 & -1 \\\\ -1 & 2 \\end{pmatrix}$.</p>",
      valeur: 5,
      unite: "",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "det",
      etapes: [
        { texte: "Produit de la diagonale principale : $3 \\times 2 = 6$." },
        { texte: "Produit de l'autre diagonale : $(-1) \\times (-1) = 1$." },
        {
          texte: "$\\det = 6 - 1 = 5$.",
          note: "Un déterminant non nul garantit une solution unique ; c'est le cas de toute matrice de conductance dont un nœud au moins est relié à la référence.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 200",
          '<g stroke="currentColor" stroke-width="1.8" fill="none">' +
            '<path d="M70 40h-10v120h10M210 40h10v120h-10"/>' +
            '<path d="M100 75L180 135" stroke-width="2.4"/><path d="M180 75L100 135" stroke-dasharray="6 5"/></g>' +
            '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="15">' +
            '<text x="100" y="80" text-anchor="middle">3</text><text x="180" y="80" text-anchor="middle">-1</text>' +
            '<text x="100" y="140" text-anchor="middle">-1</text><text x="180" y="140" text-anchor="middle">2</text></g>' +
            '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12.5">' +
            '<text x="260" y="80">trait plein : 3 x 2 = 6</text><text x="260" y="110">tirets : (-1) x (-1) = 1</text>' +
            '<text x="260" y="140" font-weight="600">det = 6 - 1 = 5</text></g>',
          "Matrice deux par deux : produit de la diagonale en trait plein moins produit de l'anti-diagonale en tirets"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-cramer",
      titre: "Résoudre un système de deux équations",
      niveau: "diagnostic",
      enonce:
        "<p>Résolvez le système $3x - y = 5$ et $-x + 2y = 0$, de matrice celle de la question précédente. Que vaut $x$ ?</p>",
      valeur: 2,
      unite: "",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "x",
      etapes: [
        { texte: "Déterminant du système : $5$, calculé à la question précédente." },
        { texte: "Règle de Cramer : on remplace la colonne de $x$ par le second membre, $\\det\\begin{pmatrix} 5 & -1 \\\\ 0 & 2 \\end{pmatrix} = 10$." },
        { texte: "$x = 10/5 = 2$ ; de même $y = \\det\\begin{pmatrix} 3 & 5 \\\\ -1 & 0 \\end{pmatrix}/5 = 5/5 = 1$." },
        {
          texte: "Contrôle : $3 \\times 2 - 1 = 5$ et $-2 + 2 \\times 1 = 0$.",
          note: "Géométriquement, la solution est l'intersection des deux droites $y = 3x - 5$ et $y = x/2$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Deux équations, deux droites, un point commun",
          genre: "Correction visuelle",
          xTitre: "x",
          yTitre: "y",
          xMin: 0,
          xMax: 4,
          yMin: -2,
          yMax: 4,
          ratio: 0.45,
          series: [
            { id: "d1", nom: "3x - y = 5", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => 3 * x - 5 },
            { id: "d2", nom: "-x + 2y = 0", couleur: "serie-3", epaisseur: 2.6, fonction: (x) => x / 2 },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 2, 1, "solution (2 ; 1)", false);
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : relaxation de Gauss-Seidel sur le réseau de référence
   -------------------------------------------------------------------------- */

const REF_G = [
  [3, -2, 0],
  [-2, 4, -1],
  [0, -1, 1.5],
];
const REF_I = [12, 4, 0];
const REF_V = [8, 6, 4];

function etatsGaussSeidel(passages) {
  const etats = [[0, 0, 0]];
  const v = [0, 0, 0];
  for (let p = 0; p < passages; p += 1) {
    for (let k = 0; k < 3; k += 1) {
      let s = REF_I[k];
      for (let j = 0; j < 3; j += 1) if (j !== k) s -= REF_G[k][j] * v[j];
      v[k] = s / REF_G[k][k];
      etats.push(v.slice());
    }
  }
  return etats;
}

function construireRelaxation(racine, api) {
  const conteneur = racine.querySelector("#d-relax");
  if (!conteneur) return;

  const PASSAGES = 15;
  const etats = etatsGaussSeidel(PASSAGES);
  const X = [170, 330, 490];
  const Y0 = 300;
  const ECH = 20;
  const vy = (v) => Y0 - ECH * v;

  const svg = svgEl("svg", {
    viewBox: "0 0 780 370",
    role: "img",
    "aria-label": "Trois colonnes représentant les potentiels des nœuds 1, 2 et 3, mises à jour une à une par la méthode de Gauss-Seidel, avec la valeur exacte en tirets et la formule de la visite en cours",
  });
  const squelette = svgEl("g");
  let graduations = "";
  for (let v = 0; v <= 12; v += 2) {
    graduations += '<path d="M54 ' + vy(v) + 'H60"/>';
  }
  let textesAxe = "";
  for (let v = 0; v <= 12; v += 2) {
    textesAxe += '<text x="48" y="' + (vy(v) + 4) + '" text-anchor="end">' + v + "</text>";
  }
  squelette.innerHTML =
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8"><path d="M60 ' + Y0 + "V50M60 " + Y0 + 'H560"/>' + graduations + "</g>" +
    '<g stroke="currentColor" stroke-width="1.4" fill="none" stroke-dasharray="7 5">' +
    X.map((x, k) => '<path d="M' + (x - 46) + " " + vy(REF_V[k]) + "H" + (x + 46) + '"/>').join("") + "</g>" +
    '<g stroke="currentColor" stroke-width="1.6" fill="none"><path d="M205 330H235M265 330H295M365 330H395M425 330H455"/>' +
    '<rect x="235" y="324" width="30" height="12" rx="2"/><rect x="395" y="324" width="30" height="12" rx="2"/>' +
    '<path d="M170 310V330H205M295 330H330V310M330 330H365M455 330H490V310"/></g>' +
    '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="11.5">' + textesAxe +
    '<text x="60" y="40" text-anchor="middle">V</text>' +
    '<text x="250" y="356" text-anchor="middle">Rb : 2 mS</text><text x="410" y="356" text-anchor="middle">Rd : 1 mS</text>' +
    '<text x="170" y="28" text-anchor="middle" font-weight="600">nœud 1</text><text x="170" y="44" text-anchor="middle">E1 par Ra : 1 mS</text>' +
    '<text x="330" y="28" text-anchor="middle" font-weight="600">nœud 2</text><text x="330" y="44" text-anchor="middle">Is = 4 mA, Rc : 1 mS</text>' +
    '<text x="490" y="28" text-anchor="middle" font-weight="600">nœud 3</text><text x="490" y="44" text-anchor="middle">Re : 0,5 mS</text></g>';

  const barres = X.map((x) =>
    svgEl("rect", { x: x - 35, y: Y0, width: 70, height: 0, rx: 3, style: "fill: var(--serie-1)", "fill-opacity": 0.55 })
  );
  const valeursBarres = X.map((x) => svgEl("text", { x, y: Y0 - 8, "text-anchor": "middle", fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": 12 }));
  const cadreActif = svgEl("rect", { x: 0, y: 52, width: 90, height: Y0 - 52, rx: 6, fill: "none", stroke: "currentColor", "stroke-width": 3 });
  const formule = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(...barres, squelette, cadreActif, ...valeursBarres, formule);
  conteneur.appendChild(svg);
  ressources.push(api.dessiner(squelette, { duree: 1.6 }));

  const FORMULES = [
    ["V1 ← (12 + 2 V2) / 3", (v) => "(12 + 2 x " + nombre(api, v[1], 3) + ") / 3"],
    ["V2 ← (4 + 2 V1 + V3) / 4", (v) => "(4 + 2 x " + nombre(api, v[0], 3) + " + " + nombre(api, v[2], 3) + ") / 4"],
    ["V3 ← V2 / 1,5", (v) => nombre(api, v[1], 3) + " / 1,5"],
  ];

  const valeurs = api.sim.valeurs("#d-relax-valeurs", [
    { id: "passage", libelle: "Passage complet", decimales: 0 },
    { id: "v1", libelle: "V1", unite: "V", decimales: 3 },
    { id: "v2", libelle: "V2", unite: "V", decimales: 3 },
    { id: "v3", libelle: "V3", unite: "V", decimales: 3 },
    { id: "ecart", libelle: "Écart maximal à la solution", unite: "V", decimales: 4 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher(position) {
    const total = etats.length - 1;
    const p = borner(position, 0, total);
    const s = Math.min(Math.floor(p), total - 1);
    const f = p >= total ? 1 : p - s;
    const avant = etats[s];
    const apres = etats[s + 1];
    const v = avant.map((valeur, k) => valeur + (apres[k] - valeur) * f);
    const noeud = s % 3;
    barres.forEach((barre, k) => {
      barre.setAttribute("y", vy(v[k]).toFixed(1));
      barre.setAttribute("height", (ECH * v[k]).toFixed(1));
      valeursBarres[k].setAttribute("y", (vy(v[k]) - 8).toFixed(1));
      valeursBarres[k].textContent = nombre(api, v[k], 3) + " V";
    });
    cadreActif.setAttribute("x", X[noeud] - 45);
    cadreActif.setAttribute("opacity", p >= total ? 0 : 1);
    const [general, detail] = FORMULES[noeud];
    formule.innerHTML =
      '<text x="590" y="90" font-weight="600">Visite du nœud ' + (noeud + 1) + "</text>" +
      '<text x="590" y="116">' + general + "</text>" +
      '<text x="590" y="142">= ' + detail(avant) + "</text>" +
      '<text x="590" y="168">= ' + nombre(api, apres[noeud], 3) + " V</text>" +
      '<text x="590" y="214">moyenne des voisins,</text>' +
      '<text x="590" y="232">pondérée par les</text>' +
      '<text x="590" y="250">conductances, plus</text>' +
      '<text x="590" y="268">les sources du nœud</text>';
    const ecart = Math.max(...v.map((valeur, k) => Math.abs(valeur - REF_V[k])));
    if (valeurs) valeurs.maj({ passage: Math.floor(p / 3), v1: v[0], v2: v[1], v3: v[2], ecart });
  }

  const lecteur = api.sim.lecteur("#d-relax-lecteur", {
    de: 0,
    a: PASSAGES * 3,
    duree: 24,
    boucle: false,
    auto: false,
    libelle: "Visites successives des nœuds",
    rappel: (valeur) => afficher(valeur),
  });
  if (lecteur) ressources.push(lecteur);
  afficher(0);
}

/* --------------------------------------------------------------------------
   E. Simulation : matrice de conductance du réseau de référence
   -------------------------------------------------------------------------- */

/** Résout le réseau de référence ; unités kΩ, mS, V, mA, mW. */
function reseauReference(p) {
  const ga = 1 / p.ra;
  const gb = 1 / p.rb;
  const gc = 1 / p.rc;
  const gd = 1 / p.rd;
  const ge = 1 / p.re;
  const g = [
    [ga + gb, -gb, 0],
    [-gb, gb + gc + gd, -gd],
    [0, -gd, gd + ge],
  ];
  const i = [p.e1 * ga, p.is, 0];
  const v = resoudre(g, i) || [NaN, NaN, NaN];
  const ia = (p.e1 - v[0]) * ga;
  const ib = (v[0] - v[1]) * gb;
  const ic = v[1] * gc;
  const id = (v[1] - v[2]) * gd;
  const ie = v[2] * ge;
  const fournie = p.e1 * ia + v[1] * p.is;
  const absorbee = p.ra * ia * ia + p.rb * ib * ib + p.rc * ic * ic + p.rd * id * id + p.re * ie * ie;
  return { g, i, v, ia, ib, ic, id, ie, fournie, absorbee, det: determinant3(g) };
}

function construireNoeuds(racine, api) {
  const conteneur = racine.querySelector("#e-noeuds");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 820 560",
    role: "img",
    "aria-label": "Réseau de référence avec potentiels et courants recalculés, et système matriciel G V = I écrit avec les valeurs courantes",
  });
  const squelette = svgEl("g");
  squelette.innerHTML =
    "<defs>" + marqueur("fl-e-sim") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="80" cy="190" r="22"/>' +
    '<path d="M80 168V80H130M210 80H300M380 80H580M660 80H740V140M740 220V290H80V212"/>' +
    '<rect x="130" y="68" width="80" height="24" rx="3"/><rect x="300" y="68" width="80" height="24" rx="3"/>' +
    '<rect x="580" y="68" width="80" height="24" rx="3"/>' +
    '<path d="M440 80V140M440 220V290"/><rect x="428" y="140" width="24" height="80" rx="3"/>' +
    '<rect x="728" y="140" width="24" height="80" rx="3"/>' +
    '<path d="M540 80V168M540 212V290"/><circle cx="540" cy="190" r="22"/>' +
    '<path d="M540 204V178" marker-end="url(#fl-e-sim)"/>' +
    '<path d="M410 290V302M396 302H424M401 308H419M406 314H414"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="260" cy="80" r="5"/><circle cx="440" cy="80" r="5"/><circle cx="540" cy="80" r="5"/>' +
    '<circle cx="740" cy="80" r="5"/><circle cx="440" cy="290" r="5"/><circle cx="540" cy="290" r="5"/></g>' +
    '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12">' +
    '<text x="80" y="185" text-anchor="middle" font-weight="600">+</text>' +
    '<text x="170" y="60" text-anchor="middle">Ra = 1 kΩ</text><text x="620" y="60" text-anchor="middle">Rd = 1 kΩ</text>' +
    '<text x="410" y="336" text-anchor="middle">référence 0 V</text></g>' +
    '<g stroke="currentColor" stroke-width="1.6" fill="none"><path d="M80 380h-8v150h8M330 380h8v150h-8M380 380h-8v150h8M450 380h8v150h-8M540 380h-8v150h8M620 380h8v150h-8"/></g>' +
    '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12">' +
    '<text x="205" y="370" text-anchor="middle">G (mS)</text><text x="415" y="370" text-anchor="middle">V (V)</text>' +
    '<text x="580" y="370" text-anchor="middle">I (mA)</text><text x="495" y="460" text-anchor="middle" font-size="16">=</text>' +
    '<text x="355" y="460" text-anchor="middle" font-size="14">x</text></g>';

  const dynamique = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  const fleches = svgEl("g", { stroke: "currentColor", "stroke-width": 2, fill: "none" });
  const f = {};
  for (const nom of ["a", "b", "c", "d", "e"]) {
    f[nom] = svgEl("path", { "marker-end": "url(#fl-e-sim)" });
    fleches.appendChild(f[nom]);
  }
  svg.append(squelette, fleches, dynamique);
  conteneur.appendChild(svg);
  ressources.push(api.dessiner(squelette, { duree: 1.6 }));

  const etat = { ...REF };

  const valeurs = api.sim.valeurs("#e-noeuds-valeurs", [
    { id: "v1", libelle: "V1", unite: "V", decimales: 3 },
    { id: "v2", libelle: "V2", unite: "V", decimales: 3 },
    { id: "v3", libelle: "V3", unite: "V", decimales: 3 },
    { id: "ia", libelle: "Courant ia fourni par E1", unite: "mA", decimales: 3 },
    { id: "pf", libelle: "Puissance fournie par les sources", unite: "mW", decimales: 2 },
    { id: "pa", libelle: "Puissance absorbée par les résistances", unite: "mW", decimales: 2 },
    { id: "ecart", libelle: "Écart du bilan", unite: "mW", decimales: 6 },
    { id: "det", libelle: "Déterminant de G", unite: "mS³", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const s = reseauReference(etat);
    const t = (x, y, texte, ancre, gras) =>
      '<text x="' + x + '" y="' + y + '"' + (ancre ? ' text-anchor="' + ancre + '"' : "") + (gras ? ' font-weight="600"' : "") + ">" + texte + "</text>";
    const n2 = (v) => nombre(api, v, 2);
    const n3 = (v) => nombre(api, v, 3);
    let html =
      t(50, 194, "E1", "end") + t(50, 210, n2(etat.e1) + " V", "end") +
      t(340, 60, "Rb = " + n2(etat.rb) + " kΩ", "middle") +
      t(420, 176, "Rc", "end") + t(420, 192, n2(etat.rc) + " kΩ", "end") +
      t(566, 186, "Is") + t(566, 202, n2(etat.is) + " mA") +
      t(760, 176, "Re") + t(760, 192, n2(etat.re) + " kΩ") +
      t(260, 32, "V1 = " + n3(s.v[0]) + " V", "middle", true) +
      t(490, 32, "V2 = " + n3(s.v[1]) + " V", "middle", true) +
      t(740, 32, "V3 = " + n3(s.v[2]) + " V", "middle", true) +
      t(238, 112, n2(Math.abs(s.ia)) + " mA", "middle") +
      t(406, 112, n2(Math.abs(s.ib)) + " mA", "middle") +
      t(456, 262, n2(Math.abs(s.ic)) + " mA") +
      t(690, 112, n2(Math.abs(s.id)) + " mA", "middle") +
      t(756, 262, n2(Math.abs(s.ie)) + " mA");
    const colonnes = [125, 205, 285];
    for (let r = 0; r < 3; r += 1) {
      const y = 415 + 45 * r;
      for (let c = 0; c < 3; c += 1) html += t(colonnes[c], y, n3(s.g[r][c]), "middle");
      html += t(415, y, n3(s.v[r]), "middle");
      html += t(580, y, n3(s.i[r]), "middle");
    }
    dynamique.innerHTML = html;
    reglerFlecheCourant(f.a, 240, 80, "h", s.ia);
    reglerFlecheCourant(f.b, 406, 80, "h", s.ib);
    reglerFlecheCourant(f.c, 440, 250, "v", s.ic);
    reglerFlecheCourant(f.d, 690, 80, "h", s.id);
    reglerFlecheCourant(f.e, 740, 250, "v", s.ie);
    if (valeurs) {
      valeurs.maj({
        v1: s.v[0],
        v2: s.v[1],
        v3: s.v[2],
        ia: s.ia,
        pf: s.fournie,
        pa: s.absorbee,
        ecart: s.fournie - s.absorbee,
        det: s.det,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-noeuds-curseurs",
    [
      { id: "e1", libelle: "Source de tension E1", min: 0, max: 24, pas: 0.5, valeur: etat.e1, unite: "V" },
      { id: "is", libelle: "Source de courant Is", min: 0, max: 24, pas: 0.5, valeur: etat.is, unite: "mA" },
      { id: "rb", libelle: "Résistance Rb", min: 0.1, max: 5, pas: 0.1, valeur: etat.rb, unite: "kΩ", chiffres: 1 },
      { id: "rc", libelle: "Résistance Rc", min: 0.2, max: 5, pas: 0.1, valeur: etat.rc, unite: "kΩ", chiffres: 1 },
      { id: "re", libelle: "Résistance Re", min: 0.2, max: 5, pas: 0.1, valeur: etat.re, unite: "kΩ", chiffres: 1 },
    ],
    (lues) => {
      Object.assign(etat, lues);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Animation : élimination de Gauss pas à pas
   -------------------------------------------------------------------------- */

const ETAPES_GAUSS = [
  {
    m: [["3", "-2", "0", "12"], ["-2", "4", "-1", "4"], ["0", "-1", "1,5", "0"]],
    pivot: null,
    ligne: null,
    op: "Système de départ : G V = I, en mS et en mA.",
    lecture: ["Chaque ligne est la loi des nœuds", "d'un nœud ; chaque colonne", "porte un potentiel inconnu."],
    sol: [],
  },
  {
    m: [["3", "-2", "0", "12"], ["0", "8/3", "-1", "12"], ["0", "-1", "1,5", "0"]],
    pivot: [0, 0],
    ligne: 1,
    op: "L2 ← L2 + (2/3) L1 : le terme en V1 de la ligne 2 s'annule.",
    lecture: ["Le nœud 1 disparaît du schéma :", "Ra et Rb en série, 1,5 kΩ,", "soit 2/3 mS, s'ajoutent à Rc et Rd :", "8/3 = 2/3 + 1 + 1 mS ; E1 apporte", "12 V / 1,5 kΩ = 8 mA, d'où 4 + 8."],
    sol: [],
  },
  {
    m: [["3", "-2", "0", "12"], ["0", "8/3", "-1", "12"], ["0", "-1", "1,5", "0"]],
    pivot: [0, 0],
    ligne: 2,
    op: "L3 : le coefficient de V1 est déjà nul, aucune opération.",
    lecture: ["Le nœud 3 n'est pas relié au", "nœud 1 : le zéro de la matrice", "épargne un calcul. Les grands", "réseaux sont faits surtout de zéros."],
    sol: [],
  },
  {
    m: [["3", "-2", "0", "12"], ["0", "8/3", "-1", "12"], ["0", "0", "9/8", "4,5"]],
    pivot: [1, 1],
    ligne: 2,
    op: "L3 ← L3 + (3/8) L2 : le système est triangulaire.",
    lecture: ["Le nœud 2 disparaît à son tour.", "9/8 mS = 0,5 + 1/1,6 : conductance", "vue du nœud 3, sources éteintes.", "4,5 mA : courant de court-circuit", "du nœud 3, le courant de Norton."],
    sol: [],
  },
  {
    m: [["3", "-2", "0", "12"], ["0", "8/3", "-1", "12"], ["0", "0", "9/8", "4,5"]],
    pivot: [2, 2],
    ligne: 2,
    op: "Remontée : V3 = 4,5 / (9/8) = 4 V.",
    lecture: ["Norton au nœud 3 :", "V3 = 4,5 mA / 1,125 mS = 4 V."],
    sol: ["", "", "V3 = 4 V"],
  },
  {
    m: [["3", "-2", "0", "12"], ["0", "8/3", "-1", "12"], ["0", "0", "9/8", "4,5"]],
    pivot: [1, 1],
    ligne: 1,
    op: "Remontée : V2 = (12 + 1 x 4) / (8/3) = 6 V.",
    lecture: ["On réintroduit le nœud 2,", "connaissant V3."],
    sol: ["", "V2 = 6 V", "V3 = 4 V"],
  },
  {
    m: [["3", "-2", "0", "12"], ["0", "8/3", "-1", "12"], ["0", "0", "9/8", "4,5"]],
    pivot: [0, 0],
    ligne: 0,
    op: "Remontée : V1 = (12 + 2 x 6) / 3 = 8 V.",
    lecture: ["Puis le nœud 1.", "Contrôle sur la ligne d'origine :", "3 x 8 - 2 x 6 = 12 mA."],
    sol: ["V1 = 8 V", "V2 = 6 V", "V3 = 4 V"],
  },
];

function construireGauss(racine, api) {
  const conteneur = racine.querySelector("#e-gauss");
  if (!conteneur) return;

  const COL = [80, 160, 240, 330];
  const LIG = [80, 130, 180];
  const svg = svgEl("svg", {
    viewBox: "0 0 780 310",
    role: "img",
    "aria-label": "Matrice augmentée du réseau de référence transformée étape par étape par élimination de Gauss, avec l'opération en cours et sa lecture en termes de réseau",
  });
  const fondLigne = svgEl("rect", { x: 40, y: 0, width: 330, height: 40, rx: 4, fill: "currentColor", "fill-opacity": 0.1 });
  const squelette = svgEl("g");
  squelette.innerHTML =
    '<g stroke="currentColor" stroke-width="1.6" fill="none"><path d="M48 50h-8v155h8M362 50h8v155h-8M290 52V203"/></g>' +
    '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12">' +
    '<text x="80" y="36" text-anchor="middle">V1</text><text x="160" y="36" text-anchor="middle">V2</text>' +
    '<text x="240" y="36" text-anchor="middle">V3</text><text x="330" y="36" text-anchor="middle">I</text>' +
    '<text x="24" y="84" text-anchor="middle">L1</text><text x="24" y="134" text-anchor="middle">L2</text><text x="24" y="184" text-anchor="middle">L3</text></g>';
  const cadrePivot = svgEl("rect", { width: 56, height: 34, rx: 5, fill: "none", stroke: "currentColor", "stroke-width": 2.4 });
  const cellules = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 15 });
  const textes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  svg.append(fondLigne, squelette, cadrePivot, cellules, textes);
  conteneur.appendChild(svg);
  ressources.push(api.dessiner(squelette, { duree: 1.2 }));

  let courante = -1;
  function afficher(valeur) {
    const k = borner(Math.floor(valeur), 0, ETAPES_GAUSS.length - 1);
    if (k === courante) return;
    courante = k;
    const etape = ETAPES_GAUSS[k];
    let html = "";
    etape.m.forEach((ligne, r) => {
      ligne.forEach((texte, c) => {
        html += '<text x="' + COL[c] + '" y="' + (LIG[r] + 5) + '" text-anchor="middle">' + texte + "</text>";
      });
    });
    cellules.innerHTML = html;
    if (etape.ligne == null) fondLigne.setAttribute("opacity", 0);
    else {
      fondLigne.setAttribute("opacity", 1);
      fondLigne.setAttribute("y", LIG[etape.ligne] - 20);
    }
    if (etape.pivot) {
      cadrePivot.setAttribute("opacity", 1);
      cadrePivot.setAttribute("x", COL[etape.pivot[1]] - 28);
      cadrePivot.setAttribute("y", LIG[etape.pivot[0]] - 17);
    } else cadrePivot.setAttribute("opacity", 0);
    let t = '<text x="40" y="240" font-weight="600">Étape ' + k + " sur " + (ETAPES_GAUSS.length - 1) + "</text>";
    t += '<text x="40" y="264">' + etape.op + "</text>";
    etape.lecture.forEach((ligne, i) => {
      t += '<text x="420" y="' + (70 + 22 * i) + '">' + ligne + "</text>";
    });
    t += '<text x="420" y="44" font-weight="600">Lecture en termes de réseau</text>';
    const connues = etape.sol.filter(Boolean);
    if (connues.length) t += '<text x="40" y="292" font-weight="600">Connus : ' + connues.join(" ; ") + "</text>";
    textes.innerHTML = t;
  }

  const lecteur = api.sim.lecteur("#e-gauss-lecteur", {
    de: 0,
    a: ETAPES_GAUSS.length - 0.01,
    duree: 21,
    boucle: false,
    auto: false,
    libelle: "Étapes de l'élimination de Gauss",
    rappel: (valeur) => afficher(valeur),
  });
  if (lecteur) ressources.push(lecteur);
  afficher(0);
}

/* --------------------------------------------------------------------------
   E. Animation : modèle compagnon d'un condensateur (Euler implicite)
   -------------------------------------------------------------------------- */

const COMPAGNON = { e: 10, r: 1, c: 1, h: 0.25, pas: 16 };

function construireCompagnon(racine, api) {
  const conteneur = racine.querySelector("#e-compagnon");
  if (!conteneur) return;

  const gh = COMPAGNON.c / COMPAGNON.h;
  const u = [0];
  for (let k = 0; k < COMPAGNON.pas; k += 1) u.push((COMPAGNON.e / COMPAGNON.r + gh * u[k]) / (1 / COMPAGNON.r + gh));
  const exact = (t) => COMPAGNON.e * (1 - Math.exp(-t / (COMPAGNON.r * COMPAGNON.c)));

  const X0 = 400;
  const X1 = 790;
  const Y0 = 280;
  const Y1 = 50;
  const vx = (t) => X0 + ((X1 - X0) * t) / (COMPAGNON.pas * COMPAGNON.h);
  const vy = (v) => Y0 - ((Y0 - Y1) * v) / 10;

  let courbeExacte = "";
  for (let n = 0; n <= 120; n += 1) {
    const t = (COMPAGNON.pas * COMPAGNON.h * n) / 120;
    courbeExacte += (n ? "L" : "M") + vx(t).toFixed(1) + " " + vy(exact(t)).toFixed(1);
  }
  let graduations = "";
  let textesAxe = "";
  for (let t = 0; t <= 4; t += 1) {
    graduations += "M" + vx(t) + " " + Y0 + "v6";
    textesAxe += '<text x="' + vx(t) + '" y="' + (Y0 + 20) + '" text-anchor="middle">' + t + "</text>";
  }
  for (let v = 0; v <= 10; v += 2) {
    graduations += "M" + X0 + " " + vy(v) + "h-6";
    textesAxe += '<text x="' + (X0 - 10) + '" y="' + (vy(v) + 4) + '" text-anchor="end">' + v + "</text>";
  }

  const svg = svgEl("svg", {
    viewBox: "0 0 820 350",
    role: "img",
    "aria-label": "Circuit RC dont le condensateur est remplacé par sa conductance compagnon et une source de courant, et courbe de charge calculée pas à pas comparée à la solution exacte",
  });
  const squelette = svgEl("g");
  squelette.innerHTML =
    "<defs>" + marqueur("fl-e-comp") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="50" cy="170" r="22"/><path d="M50 148V70H90M160 70H290V145M290 185V260H50V192M210 70V130M210 200V260"/>' +
    '<rect x="90" y="58" width="70" height="24" rx="3"/><rect x="198" y="130" width="24" height="70" rx="3"/>' +
    '<circle cx="290" cy="165" r="20"/><path d="M290 178V154" marker-end="url(#fl-e-comp)"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="210" cy="70" r="5"/><circle cx="210" cy="260" r="5"/></g>' +
    '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12">' +
    '<text x="50" y="165" text-anchor="middle" font-weight="600">+</text><text x="62" y="222">E = 10 V</text>' +
    '<text x="125" y="50" text-anchor="middle">R = 1 kΩ</text><text x="210" y="50" text-anchor="middle" font-weight="600">nœud u</text>' +
    '<text x="190" y="160" text-anchor="end">Gh</text><text x="190" y="176" text-anchor="end">4 mS</text>' +
    '<text x="170" y="282" text-anchor="middle">référence 0 V</text></g>' +
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8"><path d="M' + X0 + " " + Y0 + "H" + (X1 + 12) + "M" + X0 + " " + Y0 + "V" + (Y1 - 12) + graduations + '"/></g>' +
    '<path d="' + courbeExacte + '" stroke="currentColor" stroke-width="1.6" fill="none" stroke-dasharray="7 5" opacity="0.85"/>' +
    '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="11.5">' + textesAxe +
    '<text x="' + (X1 + 4) + '" y="' + (Y0 + 36) + '" text-anchor="end">t (ms)</text>' +
    '<text x="' + X0 + '" y="' + (Y1 - 18) + '" text-anchor="middle">u (V)</text></g>';

  const polyligne = svgEl("path", { stroke: "currentColor", "stroke-width": 2.4, fill: "none", "stroke-linejoin": "round" });
  const points = svgEl("g", { fill: "currentColor", stroke: "none" });
  const dynamique = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(squelette, polyligne, points, dynamique);
  conteneur.appendChild(svg);
  ressources.push(api.dessiner(squelette, { duree: 1.6 }));

  const valeurs = api.sim.valeurs("#e-compagnon-valeurs", [
    { id: "k", libelle: "Pas k", decimales: 0 },
    { id: "t", libelle: "Instant t", unite: "ms", decimales: 2 },
    { id: "u", libelle: "Tension calculée", unite: "V", decimales: 3 },
    { id: "ex", libelle: "Tension exacte", unite: "V", decimales: 3 },
    { id: "err", libelle: "Écart calcul - exact", unite: "V", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  let courant = -1;
  function afficher(valeur) {
    const k = borner(Math.floor(valeur), 0, COMPAGNON.pas);
    if (k === courant) return;
    courant = k;
    let d = "";
    let disques = "";
    for (let j = 0; j <= k; j += 1) {
      const x = vx(j * COMPAGNON.h).toFixed(1);
      const y = vy(u[j]).toFixed(1);
      d += (j ? "L" : "M") + x + " " + y;
      disques += '<circle cx="' + x + '" cy="' + y + '" r="' + (j === k ? 6 : 3.5) + '"/>';
    }
    polyligne.setAttribute("d", k ? d : "");
    points.innerHTML = disques;
    const uk = k ? u[k - 1] : 0;
    const source = gh * uk;
    dynamique.innerHTML =
      '<text x="316" y="160">Gh uk</text><text x="316" y="176">' + nombre(api, source, 2) + " mA</text>" +
      '<text x="20" y="312">Pas ' + k + " : (1 + 4) u = 10 + 4 x " + nombre(api, uk, 3) + "</text>" +
      '<text x="20" y="334" font-weight="600">u = ' + nombre(api, u[k], 3) + " V à t = " + nombre(api, k * COMPAGNON.h, 2) + " ms</text>";
    if (valeurs) {
      const t = k * COMPAGNON.h;
      valeurs.maj({ k, t, u: u[k], ex: exact(t), err: u[k] - exact(t) });
    }
  }

  const lecteur = api.sim.lecteur("#e-compagnon-lecteur", {
    de: 0,
    a: COMPAGNON.pas + 0.99,
    duree: 17,
    boucle: false,
    auto: false,
    libelle: "Pas de temps successifs",
    rappel: (valeur) => afficher(valeur),
  });
  if (lecteur) ressources.push(lecteur);
  afficher(0);
}

/* --------------------------------------------------------------------------
   E. Simulation : pas de calcul et stabilité numérique
   -------------------------------------------------------------------------- */

const METHODES = ["", "Euler explicite", "Euler implicite", "trapèzes"];

function facteurAmplification(methode, h) {
  if (methode === 1) return 1 - h;
  if (methode === 2) return 1 / (1 + h);
  return (1 - h / 2) / (1 + h / 2);
}

function construirePas(racine, api) {
  if (!racine.querySelector("#e-pas")) return;
  const etat = { h: 0.5, methode: 1 };
  const T_MAX = 10;

  function calculer() {
    const g = facteurAmplification(etat.methode, etat.h);
    const pts = [[0, 0]];
    let ecartMax = 0;
    let ecart = -1;
    for (let k = 1; k * etat.h <= T_MAX + 1e-9; k += 1) {
      ecart *= g;
      const t = k * etat.h;
      const v = 1 + ecart;
      ecartMax = Math.max(ecartMax, Math.abs(v - (1 - Math.exp(-t))));
      pts.push([t, Math.abs(v) < 1e6 ? v : NaN]);
    }
    return { g, pts, ecartMax };
  }

  let dernier = calculer();
  const traceur = api.sim.traceur("#e-pas", {
    titre: "Charge d'un circuit RC calculée pas à pas",
    xTitre: "t / τ",
    yTitre: "u / E",
    xMin: 0,
    xMax: T_MAX,
    yMin: -0.6,
    yMax: 2.2,
    ratio: 0.5,
    echantillons: 400,
    series: [
      { id: "exact", nom: "solution exacte, trait fin", couleur: "serie-6", epaisseur: 1.6, fonction: (t) => 1 - Math.exp(-t) },
      { id: "num", nom: "solution numérique, trait épais et disques", couleur: "serie-1", epaisseur: 3, points: dernier.pts },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, 1, "valeur finale", true);
      disques(c, repere, couleurs.series[0], dernier.pts, 4);
    },
  });
  if (traceur) ressources.push(traceur);

  const valeurs = api.sim.valeurs("#e-pas-valeurs", [
    { id: "g", libelle: "Facteur d'amplification g", decimales: 3 },
    { id: "exact", libelle: "Facteur exact e^(-h/τ)", decimales: 3 },
    { id: "comportement", libelle: "Comportement numérique", format: (v) => ["monotone", "oscillant amorti", "divergent", "oscillation entretenue"][v] || "" },
    { id: "ecart", libelle: "Écart maximal sur 10 τ", unite: "x E", decimales: 3 },
    { id: "pas", libelle: "Nombre de pas sur 10 τ", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    dernier = calculer();
    if (traceur) traceur.definirDonnees("num", dernier.pts);
    const g = dernier.g;
    const comportement = Math.abs(Math.abs(g) - 1) < 1e-9 ? 3 : Math.abs(g) > 1 ? 2 : g < 0 ? 1 : 0;
    if (valeurs) {
      valeurs.maj({
        g,
        exact: Math.exp(-etat.h),
        comportement,
        ecart: Number.isFinite(dernier.ecartMax) && dernier.ecartMax < 1e6 ? dernier.ecartMax : Infinity,
        pas: Math.floor(T_MAX / etat.h + 1e-9),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-pas-curseurs",
    [
      { id: "h", libelle: "Pas de calcul h / τ", min: 0.05, max: 3, pas: 0.05, valeur: etat.h, chiffres: 2 },
      { id: "methode", libelle: "Méthode d'intégration", min: 1, max: 3, pas: 1, valeur: etat.methode, format: (v) => METHODES[Math.round(v)] || "" },
    ],
    (lues) => {
      etat.h = lues.h;
      etat.methode = Math.round(lues.methode);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   I. Simulation : bus 24 V secouru en fonctionnement normal et dégradé
   -------------------------------------------------------------------------- */

/** Résout le bus à trois nœuds ; Ω, S, V, A, W. */
function reseauBus(p) {
  const gch = p.chargeur ? 1 / BUS.rch : 0;
  const gl = 1 / p.rl;
  const gk = p.km1 ? 1 / BUS.rk : 0;
  const g = [
    [gch + 1 / BUS.ra + 1 / BUS.rcb + gl, -1 / BUS.rcb, -gl],
    [-1 / BUS.rcb, 1 / BUS.rcb + 1 / BUS.rb, 0],
    [-gl, 0, gl + gk],
  ];
  const i = [BUS.ech * gch, p.eb / BUS.rb, 0];
  const v = resoudre(g, i) || [NaN, NaN, NaN];
  const ich = p.chargeur ? (BUS.ech - v[0]) * gch : 0;
  const ib = (p.eb - v[1]) / BUS.rb;
  const ia = v[0] / BUS.ra;
  const ik = v[2] * gk;
  const sources = BUS.ech * ich + p.eb * ib;
  const pertes =
    (p.chargeur ? ich * ich * BUS.rch : 0) +
    ib * ib * BUS.rb +
    v[0] * ia +
    v[2] * ik +
    (v[0] - v[1]) ** 2 / BUS.rcb +
    (v[0] - v[2]) ** 2 / p.rl;
  return { v, ich, ib, ia, ik, sources, pertes };
}

function construireBus(racine, api) {
  const conteneur = racine.querySelector("#i-bus");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 820 370",
    role: "img",
    "aria-label": "Bus 24 volts secouru à trois nœuds : chargeur et armoire automate au nœud 1, batterie au nœud 2 par une liaison de 0,05 ohm, bobine de KM1 au nœud 3 par un câble de 40 mètres ; potentiels et courants recalculés",
  });
  const fixe = svgEl("g");
  fixe.innerHTML =
    "<defs>" + marqueur("fl-i-bus") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M70 222V310H700V210M230 230V310M400 237V310"/>' +
    '<path d="M230 110V160"/><rect x="218" y="160" width="24" height="70" rx="3"/>' +
    '<path d="M230 110H280M330 110H400V140M400 190V225"/><rect x="280" y="98" width="50" height="24" rx="3"/>' +
    '<rect x="388" y="140" width="24" height="50" rx="3"/>' +
    '<path d="M380 225H420" stroke-width="3"/><path d="M390 237H410" stroke-width="5"/>' +
    '<path d="M230 110V50H470M590 50H700V150"/><rect x="470" y="38" width="120" height="24" rx="3"/>' +
    '<path d="M560 310V322M546 322H574M551 328H569M556 334H564"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="230" cy="110" r="5"/><circle cx="400" cy="110" r="5"/><circle cx="700" cy="50" r="5"/>' +
    '<circle cx="230" cy="310" r="5"/><circle cx="400" cy="310" r="5"/></g>' +
    '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12">' +
    '<text x="305" y="90" text-anchor="middle">0,05 Ω</text>' +
    '<text x="206" y="190" text-anchor="end">armoire</text><text x="206" y="206" text-anchor="end">automate</text><text x="206" y="222" text-anchor="end">6 Ω</text>' +
    '<text x="372" y="230" text-anchor="end" font-weight="600">+</text><text x="372" y="250" text-anchor="end">batterie Eb</text>' +
    '<text x="420" y="170">0,5 Ω</text>' +
    '<text x="560" y="356" text-anchor="middle">0 V, référence</text></g>';

  const chargeur = svgEl("g", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "stroke-linecap": "round" });
  chargeur.innerHTML =
    '<circle cx="70" cy="200" r="22"/><path d="M70 178V110H100M160 110H230"/><rect x="100" y="98" width="60" height="24" rx="3"/>' +
    '<text x="70" y="196" text-anchor="middle" font-weight="600" fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">+</text>' +
    '<text x="130" y="90" text-anchor="middle" fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">0,5 Ω</text>' +
    '<text x="96" y="168" fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">chargeur</text>' +
    '<text x="96" y="184" fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">27 V</text>';
  const bobine = svgEl("g", { stroke: "currentColor", "stroke-width": 2.2, fill: "none" });
  bobine.innerHTML =
    '<rect x="680" y="150" width="40" height="60" rx="2"/>' +
    '<text x="732" y="176" fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">KM1</text>' +
    '<text x="732" y="192" fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">48 Ω</text>';
  const flecheBatterie = svgEl("path", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "marker-end": "url(#fl-i-bus)" });
  const dynamique = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(fixe, chargeur, bobine, flecheBatterie, dynamique);
  conteneur.appendChild(svg);
  ressources.push(api.dessiner(fixe, { duree: 1.6 }));

  const etat = { chargeur: 1, eb: 24, section: 2, km1: 1 };

  const valeurs = api.sim.valeurs("#i-bus-valeurs", [
    { id: "v1", libelle: "V1, jeu de barres", unite: "V", decimales: 3 },
    { id: "v2", libelle: "V2, bornes batterie", unite: "V", decimales: 3 },
    { id: "v3", libelle: "V3, bobine de KM1", unite: "V", decimales: 3 },
    { id: "pc", libelle: "V3 rapportée à 24 V", unite: "%", decimales: 1 },
    { id: "ib", libelle: "Courant batterie, positif en décharge", unite: "A", decimales: 3 },
    { id: "ich", libelle: "Courant du chargeur", unite: "A", decimales: 3 },
    { id: "ps", libelle: "Puissance nette des forces électromotrices", unite: "W", decimales: 2 },
    { id: "ecart", libelle: "Écart du bilan de puissance", unite: "W", decimales: 6 },
    { id: "verdict", libelle: "Fermeture de KM1 (seuil 20,4 V)", format: (v) => (v ? "garantie" : "non garantie") },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const rl = (0.018 * 80) / SECTIONS[etat.section - 1];
    const s = reseauBus({ chargeur: etat.chargeur, eb: etat.eb, rl, km1: etat.km1 });
    const avecBobine = reseauBus({ chargeur: etat.chargeur, eb: etat.eb, rl, km1: 1 });
    chargeur.setAttribute("stroke-dasharray", etat.chargeur ? "" : "6 5");
    chargeur.setAttribute("opacity", etat.chargeur ? 1 : 0.45);
    bobine.setAttribute("stroke-dasharray", etat.km1 ? "" : "6 5");
    bobine.setAttribute("opacity", etat.km1 ? 1 : 0.45);
    reglerFlecheCourant(flecheBatterie, 440, 205, "v", -s.ib, 13);
    const n = (v, d) => nombre(api, v, d);
    dynamique.innerHTML =
      '<text x="244" y="140" font-weight="600">1 : ' + n(s.v[0], 3) + " V</text>" +
      '<text x="418" y="130" font-weight="600">2 : ' + n(s.v[1], 3) + " V</text>" +
      '<text x="712" y="88" font-weight="600">3 : ' + n(s.v[2], 3) + " V</text>" +
      '<text x="530" y="28" text-anchor="middle">câble 2 x ' + n(SECTIONS[etat.section - 1], 1) + " mm², " + n(rl, 3) + " Ω</text>" +
      '<text x="530" y="82" text-anchor="middle">' + n(Math.abs(s.v[0] - s.v[2]), 3) + " V de chute</text>" +
      '<text x="456" y="200">' + (s.ib >= 0 ? "décharge" : "recharge") + "</text>" +
      '<text x="456" y="216">' + n(Math.abs(s.ib), 3) + " A</text>" +
      '<text x="456" y="250">Eb = ' + n(etat.eb, 1) + " V</text>" +
      '<text x="130" y="140" text-anchor="middle">' + (etat.chargeur ? n(s.ich, 3) + " A" : "coupé") + "</text>" +
      '<text x="726" y="232">' + (etat.km1 ? n(s.ik, 3) + " A" : "hors tension") + "</text>";
    if (valeurs) {
      valeurs.maj({
        v1: s.v[0],
        v2: s.v[1],
        v3: s.v[2],
        pc: (s.v[2] / 24) * 100,
        ib: s.ib,
        ich: s.ich,
        ps: s.sources,
        ecart: s.sources - s.pertes,
        verdict: avecBobine.v[2] >= BUS.seuil ? 1 : 0,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-bus-curseurs",
    [
      { id: "chargeur", libelle: "Chargeur", min: 0, max: 1, pas: 1, valeur: etat.chargeur, format: (v) => (v >= 0.5 ? "en service" : "coupé") },
      { id: "eb", libelle: "Force électromotrice de la batterie Eb", min: 21.6, max: 25.5, pas: 0.1, valeur: etat.eb, unite: "V", chiffres: 1 },
      { id: "section", libelle: "Section du câble vers le départ pompe", min: 1, max: 4, pas: 1, valeur: etat.section, format: (v) => nombre(api, SECTIONS[Math.round(v) - 1] || 2.5, 1) + " mm²" },
      { id: "km1", libelle: "Bobine de KM1", min: 0, max: 1, pas: 1, valeur: etat.km1, format: (v) => (v >= 0.5 ? "alimentée" : "non alimentée") },
    ],
    (lues) => {
      etat.chargeur = lues.chargeur >= 0.5 ? 1 : 0;
      etat.eb = lues.eb;
      etat.section = borner(Math.round(lues.section), 1, 4);
      etat.km1 = lues.km1 >= 0.5 ? 1 : 0;
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

  /* Fondamental 1 : écriture par inspection, deux nœuds. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-inspection",
      titre: "Écrire une matrice de conductance par inspection",
      niveau: "fondamental",
      enonce:
        "<p>Une source de $12\\ \\mathrm{V}$ de résistance interne $2\\ \\Omega$ alimente le nœud 1. Le nœud 1 est relié à la référence par $4\\ \\Omega$ et au nœud 2 par $2\\ \\Omega$ ; le nœud 2 est relié à la référence par $4\\ \\Omega$ et reçoit une source de courant de $1\\ \\mathrm{A}$. Écrivez $G$ et $I$, puis calculez $V_1$ en volts.</p>",
      valeur: 80 / 11,
      unite: "V",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "V1",
      etapes: [
        { texte: "Source réelle en Norton : $12/2 = 6\\ \\mathrm{A}$ injectés dans le nœud 1, avec $0{,}5\\ \\mathrm{S}$ vers la référence." },
        { texte: "$G_{11} = 0{,}5 + 0{,}25 + 0{,}5 = 1{,}25\\ \\mathrm{S}$, $G_{12} = G_{21} = -0{,}5\\ \\mathrm{S}$, $G_{22} = 0{,}5 + 0{,}25 = 0{,}75\\ \\mathrm{S}$ ; $I = (6 ; 1)\\ \\mathrm{A}$." },
        { texte: "$\\det G = 1{,}25 \\times 0{,}75 - 0{,}25 = 0{,}6875\\ \\mathrm{S^2}$." },
        { texte: "Cramer : $V_1 = (6 \\times 0{,}75 + 0{,}5 \\times 1)/0{,}6875 = 5/0{,}6875 = 7{,}273\\ \\mathrm{V}$ et $V_2 = (1{,}25 \\times 1 + 0{,}5 \\times 6)/0{,}6875 = 6{,}182\\ \\mathrm{V}$." },
        {
          texte: "Bilan : la source de tension fournit $12 \\times 2{,}364 = 28{,}36\\ \\mathrm{W}$, la source de courant $6{,}18\\ \\mathrm{W}$ ; les résistances absorbent $11{,}17 + 13{,}22 + 0{,}60 + 9{,}55 = 34{,}54\\ \\mathrm{W}$.",
          note: "Le bilan nul confirme les signes : un terme positif hors diagonale l'aurait déséquilibré.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 640 260",
          "<defs>" + marqueur("fl-k-insp") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<circle cx="50" cy="140" r="20"/><path d="M50 120V60H90M150 60H330M390 60H500V110M500 170V220H50V160M230 60V110M230 170V220"/>' +
            '<rect x="90" y="48" width="60" height="24" rx="3"/><rect x="330" y="48" width="60" height="24" rx="3"/>' +
            '<rect x="218" y="110" width="24" height="60" rx="3"/><rect x="488" y="110" width="24" height="60" rx="3"/>' +
            '<path d="M500 60H580V120M580 160V220H500"/><circle cx="580" cy="140" r="20"/><path d="M580 152V130" marker-end="url(#fl-k-insp)"/></g>' +
            '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12">' +
            '<circle cx="230" cy="60" r="4.5"/><circle cx="500" cy="60" r="4.5"/>' +
            '<text x="50" y="136" text-anchor="middle" font-weight="600">+</text><text x="24" y="190" text-anchor="middle">12 V</text>' +
            '<text x="120" y="40" text-anchor="middle">2 Ω</text><text x="360" y="40" text-anchor="middle">2 Ω</text>' +
            '<text x="210" y="144" text-anchor="end">4 Ω</text><text x="476" y="144" text-anchor="end">4 Ω</text><text x="606" y="144">1 A</text>' +
            '<text x="230" y="30" text-anchor="middle" font-weight="600">V1 = 7,273 V</text><text x="500" y="30" text-anchor="middle" font-weight="600">V2 = 6,182 V</text>' +
            '<text x="320" y="248" text-anchor="middle">G = [1,25 ; -0,5 / -0,5 ; 0,75] S, I = (6 ; 1) A</text></g>',
          "Circuit à deux nœuds annoté : 7,273 volts au nœud 1 et 6,182 volts au nœud 2"
        );
      },
    })
  );

  /* Fondamental 2 : comptage des équations. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-comptage",
      titre: "Compter les équations indépendantes",
      niveau: "fondamental",
      enonce:
        "<p>Le graphe d'un réseau compte $n = 6$ nœuds, référence comprise, et $b = 9$ branches. Combien d'équations indépendantes faut-il écrire avec la méthode des mailles ?</p>",
      valeur: 4,
      unite: "",
      tolerance: 0.001,
      chiffres: 0,
      libelleChamp: "mailles",
      etapes: [
        { texte: "Mailles indépendantes : $b - n + 1 = 9 - 6 + 1 = 4$." },
        { texte: "Pour comparaison, la méthode des nœuds en demande $n - 1 = 5$." },
        {
          texte: "Lecture sur le graphe : un arbre, ensemble de branches qui relie tous les nœuds sans boucle, compte $n - 1 = 5$ branches ; chacune des $4$ branches restantes ferme une maille nouvelle.",
          note: "Les deux méthodes donnent ici des systèmes de taille voisine : on choisira selon les sources présentes.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const n = [
          [100, 60],
          [260, 40],
          [420, 60],
          [100, 200],
          [260, 220],
          [420, 200],
        ];
        const arbre = [[0, 1], [1, 2], [1, 4], [3, 4], [4, 5]];
        const coarbre = [[0, 3], [2, 5], [0, 4], [2, 4]];
        const seg = (a, b) => {
          const dx = n[b][0] - n[a][0];
          const dy = n[b][1] - n[a][1];
          const l = Math.hypot(dx, dy);
          const ox = (15 * dx) / l;
          const oy = (15 * dy) / l;
          return "M" + (n[a][0] + ox).toFixed(1) + " " + (n[a][1] + oy).toFixed(1) + "L" + (n[b][0] - ox).toFixed(1) + " " + (n[b][1] - oy).toFixed(1);
        };
        visuelSvg(
          conteneur,
          moteur,
          "0 0 640 260",
          '<g stroke="currentColor" fill="none"><path d="' + arbre.map(([a, b]) => seg(a, b)).join("") + '" stroke-width="4"/>' +
            '<path d="' + coarbre.map(([a, b]) => seg(a, b)).join("") + '" stroke-width="1.8" stroke-dasharray="7 5"/></g>' +
            '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12">' +
            n.map(([x, y], k) => '<circle cx="' + x + '" cy="' + y + '" r="13" fill="none" stroke="currentColor" stroke-width="1.6"/><text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle">' + k + "</text>").join("") +
            '<text x="480" y="90">trait épais : arbre,</text><text x="480" y="108">n - 1 = 5 branches</text>' +
            '<text x="480" y="150">tirets : 4 branches</text><text x="480" y="168">qui ferment chacune</text><text x="480" y="186">une maille</text></g>',
          "Graphe à six nœuds et neuf branches : arbre de cinq branches en trait épais et quatre branches de fermeture en tirets"
        );
      },
    })
  );

  /* Intermédiaire 1 : méthode des mailles à deux mailles. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-mailles",
      titre: "Deux mailles, deux sources",
      niveau: "intermédiaire",
      enonce:
        "<p>Trois branches verticales relient un nœud haut $A$ à la référence : à gauche, une source $E_1 = 24\\ \\mathrm{V}$, borne $+$ en haut, en série avec $R_1 = 2\\ \\Omega$ ; au centre, $R_3 = 6\\ \\Omega$ ; à droite, une source $E_2 = 12\\ \\mathrm{V}$, borne $+$ en haut, en série avec $R_2 = 3\\ \\Omega$. Par la méthode des mailles, courants de maille dans le sens horaire, calculez le courant descendant dans $R_3$, en ampères.</p>",
      valeur: 8 / 3,
      unite: "A",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "i_R3",
      etapes: [
        { texte: "Maille 1 (gauche) : $(R_1 + R_3)J_1 - R_3J_2 = E_1$, soit $8J_1 - 6J_2 = 24$." },
        { texte: "Maille 2 (droite) : le sens horaire descend dans $E_2$ de sa borne $+$ vers sa borne $-$, la source s'oppose : $-R_3J_1 + (R_2 + R_3)J_2 = -E_2$, soit $-6J_1 + 9J_2 = -12$." },
        { texte: "$\\det = 72 - 36 = 36$ ; $J_1 = (24 \\times 9 - 6 \\times 12)/36 = 4\\ \\mathrm{A}$ ; $J_2 = (8 \\times (-12) + 6 \\times 24)/36 = 1{,}333\\ \\mathrm{A}$." },
        { texte: "$i_{R3} = J_1 - J_2 = 2{,}667\\ \\mathrm{A}$ vers le bas, et $V_A = 6 \\times 2{,}667 = 16\\ \\mathrm{V}$." },
        {
          texte: "Contrôle par Millman : $V_A = (24/2 + 12/3)/(1/2 + 1/6 + 1/3) = 16/1 = 16\\ \\mathrm{V}$.",
          note: "$J_2 > 0$ traverse $E_2$ de sa borne $+$ vers sa borne $-$ : la source $E_2$ absorbe $12 \\times 1{,}333 = 16\\ \\mathrm{W}$, comme une batterie en charge.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 260",
          "<defs>" + marqueur("fl-k-mail") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<path d="M80 60H500M80 220H500M80 60V90M80 110V130M80 170V220M300 60V110M300 170V220M500 60V90M500 110V130M500 170V220"/>' +
            '<rect x="68" y="90" width="24" height="20" rx="2"/><circle cx="80" cy="150" r="20"/>' +
            '<rect x="288" y="110" width="24" height="60" rx="3"/>' +
            '<rect x="488" y="90" width="24" height="20" rx="2"/><circle cx="500" cy="150" r="20"/></g>' +
            '<g stroke="currentColor" stroke-width="1.6" fill="none">' +
            '<path d="M150 180A45 45 0 1 1 230 180" marker-end="url(#fl-k-mail)"/><path d="M360 180A45 45 0 1 1 440 180" marker-end="url(#fl-k-mail)"/>' +
            '<path d="M322 128V156" marker-end="url(#fl-k-mail)"/></g>' +
            '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12">' +
            '<circle cx="300" cy="60" r="4.5"/><text x="300" y="44" text-anchor="middle" font-weight="600">A : 16 V</text>' +
            '<text x="80" y="146" text-anchor="middle" font-weight="600">+</text><text x="500" y="146" text-anchor="middle" font-weight="600">+</text>' +
            '<text x="56" y="104" text-anchor="end">2 Ω</text><text x="52" y="154" text-anchor="end">24 V</text>' +
            '<text x="524" y="104">3 Ω</text><text x="528" y="154">12 V</text><text x="276" y="144" text-anchor="end">6 Ω</text>' +
            '<text x="190" y="154" text-anchor="middle" font-weight="600">J1</text><text x="400" y="154" text-anchor="middle" font-weight="600">J2</text>' +
            '<text x="190" y="206" text-anchor="middle">J1 = 4 A</text><text x="400" y="206" text-anchor="middle">J2 = 1,333 A</text>' +
            '<text x="316" y="100" text-anchor="end">2,667 A</text><text x="290" y="248" text-anchor="middle">référence en bas ; mailles dans le sens horaire</text></g>',
          "Deux mailles : J1 égal à 4 ampères, J2 à 1,333 ampère, 2,667 ampères descendant dans la résistance centrale, nœud haut à 16 volts"
        );
      },
    })
  );

  /* Intermédiaire 2 : source de tension flottante, supernœud. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-supernoeud",
      titre: "Source de tension entre deux nœuds",
      niveau: "intermédiaire",
      enonce:
        "<p>Une source de tension idéale de $5\\ \\mathrm{V}$ relie le nœud 1, côté borne $+$, au nœud 2. Le nœud 1 est relié à la référence par $R_1 = 1\\ \\mathrm{k\\Omega}$ et reçoit une source de courant de $10\\ \\mathrm{mA}$ ; le nœud 2 est relié à la référence par $R_2 = 2\\ \\mathrm{k\\Omega}$. Quel courant $i_E$ traverse la source de sa borne $+$ vers sa borne $-$, en milliampères ?</p>",
      valeur: 5 / 3,
      unite: "mA",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "i_E",
      etapes: [
        { texte: "Supernœud autour de la source : $V_1/1 + V_2/2 = 10\\ \\mathrm{mA}$, et contrainte $V_1 - V_2 = 5\\ \\mathrm{V}$." },
        { texte: "$(V_2 + 5) + V_2/2 = 10$, donc $1{,}5V_2 = 5$ : $V_2 = 3{,}333\\ \\mathrm{V}$ et $V_1 = 8{,}333\\ \\mathrm{V}$." },
        { texte: "Loi des nœuds au nœud 2 seul : le courant qui arrive par la source repart par $R_2$, $i_E = V_2/R_2 = 1{,}667\\ \\mathrm{mA}$." },
        { texte: "Analyse nodale modifiée, même résultat : $\\begin{pmatrix} 1 & 0 & 1 \\\\ 0 & 0{,}5 & -1 \\\\ 1 & -1 & 0 \\end{pmatrix}\\begin{pmatrix} V_1 \\\\ V_2 \\\\ i_E \\end{pmatrix} = \\begin{pmatrix} 10 \\\\ 0 \\\\ 5 \\end{pmatrix}$." },
        {
          texte: "Bilan : la source de courant fournit $8{,}333 \\times 10 = 83{,}33\\ \\mathrm{mW}$ ; $R_1$ absorbe $69{,}44$, $R_2$ $5{,}56$ et la source de tension $5 \\times 1{,}667 = 8{,}33\\ \\mathrm{mW}$.",
          note: "$i_E$ positif entre par la borne $+$ : la source de tension reçoit de la puissance, ce que seul le calcul pouvait dire.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 250",
          "<defs>" + marqueur("fl-k-sn") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<path d="M120 70H260M340 70H460M120 70V110M120 170V210M460 70V110M460 170V210M40 210H460M40 70H120M40 70V125M40 155V210"/>' +
            '<circle cx="300" cy="70" r="22"/><rect x="108" y="110" width="24" height="60" rx="3"/><rect x="448" y="110" width="24" height="60" rx="3"/>' +
            '<circle cx="40" cy="140" r="15"/><path d="M40 150V130" marker-end="url(#fl-k-sn)"/>' +
            '<path d="M330 96H372" marker-end="url(#fl-k-sn)"/></g>' +
            '<path d="M95 30H490V110H95Z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-dasharray="7 5"/>' +
            '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12">' +
            '<circle cx="120" cy="70" r="4.5"/><circle cx="460" cy="70" r="4.5"/>' +
            '<text x="286" y="74" text-anchor="middle" font-weight="600">+</text><text x="314" y="74" text-anchor="middle">−</text><text x="262" y="100" text-anchor="end">E = 5 V</text>' +
            '<text x="120" y="22" text-anchor="middle" font-weight="600">V1 = 8,333 V</text><text x="460" y="22" text-anchor="middle" font-weight="600">V2 = 3,333 V</text>' +
            '<text x="96" y="144" text-anchor="end">1 kΩ</text><text x="484" y="144">2 kΩ</text><text x="50" y="194">10 mA</text>' +
            '<text x="380" y="100">iE = 1,667 mA</text><text x="290" y="140" text-anchor="middle">supernœud en tirets</text>' +
            '<text x="300" y="238" text-anchor="middle">référence en bas</text></g>',
          "Source de 5 volts entre deux nœuds entourée d'un supernœud en tirets ; potentiels 8,333 et 3,333 volts et courant de 1,667 milliampère dans la source"
        );
      },
    })
  );

  /* Avancé : échelle RC à deux cellules, valeurs propres. */
  const r5 = Math.sqrt(5);
  const u2 = (t) => 1 - 1.1708203932 * Math.exp((-(3 - r5) / 2) * t) + 0.1708203932 * Math.exp((-(3 + r5) / 2) * t);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-etat",
      titre: "Constantes de temps d'une échelle RC",
      niveau: "avancé",
      enonce:
        "<p>Une source $E$ charge, à travers $R_1 = 1\\ \\mathrm{k\\Omega}$, un condensateur $C_1 = 1\\ \\mu\\mathrm{F}$ placé au nœud 1 ; une résistance $R_2 = 1\\ \\mathrm{k\\Omega}$ relie le nœud 1 au nœud 2, où se trouve $C_2 = 1\\ \\mu\\mathrm{F}$. Les deux condensateurs sont reliés à la référence. Écrivez le système d'état en $u_1$ et $u_2$, puis donnez la plus grande des deux constantes de temps, en millisecondes.</p>",
      valeur: 2 / (3 - r5),
      unite: "ms",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "τ_lent",
      etapes: [
        { texte: "Nœud 1 : $C_1\\dot{u}_1 = (E - u_1)/R_1 - (u_1 - u_2)/R_2$ ; nœud 2 : $C_2\\dot{u}_2 = (u_1 - u_2)/R_2$." },
        { texte: "Avec $\\tau = RC = 1\\ \\mathrm{ms}$ : $A = \\dfrac{1}{\\tau}\\begin{pmatrix} -2 & 1 \\\\ 1 & -1 \\end{pmatrix}$, de trace $-3/\\tau$ et de déterminant $1/\\tau^2$." },
        { texte: "Équation caractéristique : $r^2 + 3r/\\tau + 1/\\tau^2 = 0$, d'où $r = \\dfrac{-3 \\pm \\sqrt{5}}{2\\tau}$ : $-0{,}382/\\tau$ et $-2{,}618/\\tau$." },
        { texte: "Constantes de temps : $\\tau/0{,}382 = 2{,}618\\ \\mathrm{ms}$ et $\\tau/2{,}618 = 0{,}382\\ \\mathrm{ms}$." },
        {
          texte: "Contrôles : leur produit vaut $\\tau^2 = 1\\ \\mathrm{ms^2}$ (déterminant) et la somme de leurs inverses $3/\\tau$ (trace).",
          note: "Le mode lent fixe la durée de la charge ; le mode rapide fixe le pas : Euler explicite exigerait $h \\lt 2 \\times 0{,}382 = 0{,}76\\ \\mathrm{ms}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Charge de C2 à travers l'échelle, échelon unité",
          genre: "Correction visuelle",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "u2 / E",
          xMin: 0,
          xMax: 12,
          yMin: 0,
          yMax: 1.1,
          ratio: 0.42,
          series: [
            { id: "u2", nom: "u2(t) exacte, deux modes", couleur: "serie-1", epaisseur: 2.8, fonction: (t) => u2(t) },
            { id: "lent", nom: "mode lent seul, 1 - 1,171 e^(-t/2,618 ms)", couleur: "serie-6", epaisseur: 1.6, fonction: (t) => 1 - 1.1708203932 * Math.exp(-t / 2.618034) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 1, "valeur finale E", true);
            marquerPoint(c, repere, couleurs, 2.618, u2(2.618), "t = 2,618 ms", false);
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  /* Diagnostic industriel : matrice singulière dans un simulateur. */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-singuliere",
      titre: "Le simulateur refuse de calculer le bus secouru",
      niveau: "diagnostic",
      enonce:
        "<p>Pour préparer une modification du bus $24\\ \\mathrm{V}$ secouru, un technicien saisit le réseau dans un simulateur de circuits. Le calcul du point de repos échoue avec le message \"matrice singulière\". Quelles erreurs de saisie peuvent l'expliquer ?</p>",
      options: [
        { texte: "Aucun nœud n'a été désigné comme masse du simulateur.", juste: true },
        { texte: "Le capteur de l'armoire déportée n'est relié au reste du circuit que par un condensateur de filtrage.", juste: true },
        { texte: "Le chargeur et la batterie ont été saisis comme deux sources de tension idéales, $27\\ \\mathrm{V}$ et $24\\ \\mathrm{V}$, directement en parallèle.", juste: true },
        { texte: "La liaison batterie a été saisie avec sa vraie valeur, $0{,}05\\ \\Omega$." },
        { texte: "La bobine de $KM1$ a été saisie avec sa résistance de $48\\ \\Omega$." },
      ],
      multiple: true,
      etapes: [
        { texte: "Sans masse, tous les potentiels ne sont définis qu'à une constante près : chaque ligne de la matrice a une somme nulle, le déterminant s'annule." },
        { texte: "Un nœud relié uniquement par un condensateur est flottant en continu, puisque le condensateur y est un circuit ouvert : sa ligne de la matrice est nulle, ou liée à d'autres." },
        { texte: "Deux sources de tension idéales en parallèle imposent deux valeurs à la même tension : les deux lignes de contrainte de l'analyse nodale modifiée sont incompatibles. Il faut leur donner leur résistance interne, $0{,}5\\ \\Omega$ chacune." },
        {
          texte: "Une résistance de $0{,}05\\ \\Omega$ à côté de $48\\ \\Omega$ donne un rapport de $1\\,000$ seulement : la matrice reste bien conditionnée, et une bobine de $48\\ \\Omega$ est un élément ordinaire.",
          note: "Remède général : une résistance de fuite réaliste vers la masse pour tout nœud isolé en continu, et une résistance série pour toute source de tension réelle.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 640 230",
          '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<path d="M40 60H130M150 60H300V96M300 106V190M40 190H560M130 44V76M150 44V76M282 96H318M282 106H318"/>' +
            '<path d="M300 60H440V95M440 155V190" stroke-dasharray="6 5"/><rect x="428" y="95" width="24" height="60" rx="3" stroke-dasharray="6 5"/>' +
            '<path d="M290 190V202M276 202H304M281 208H299M286 214H294"/></g>' +
            '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12">' +
            '<circle cx="300" cy="60" r="5"/><text x="240" y="40" text-anchor="middle" font-weight="600">nœud X</text>' +
            '<text x="40" y="44">reste du</text><text x="40" y="84">circuit</text>' +
            '<text x="140" y="100" text-anchor="middle">C</text><text x="270" y="106" text-anchor="end">C</text>' +
            '<text x="180" y="150" text-anchor="middle">seuls des condensateurs :</text><text x="180" y="166" text-anchor="middle">X flottant en continu</text>' +
            '<text x="462" y="120">remède, en tirets :</text><text x="462" y="136">résistance de fuite</text><text x="462" y="152">de quelques MΩ</text>' +
            '<text x="400" y="222" text-anchor="middle">masse du simulateur, nœud 0</text></g>',
          "Nœud relié uniquement par des condensateurs, flottant en continu, et remède par une résistance de fuite vers la masse"
        );
      },
    })
  );

  /* Conceptuel : symétrie et dominance. */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-conceptuel",
      titre: "Pourquoi la matrice de conductance est-elle si régulière ?",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi la matrice de conductance d'un réseau formé de résistances et de sources indépendantes est symétrique et à diagonale dominante. Quel type d'élément fait perdre la symétrie, et pourquoi ?</p>",
      motsCles: [
        ["symetr", "meme conductance", "deux nœuds", "deux noeuds", "reciproc", "les deux lignes"],
        ["diagonale", "somme", "touch", "domin"],
        ["reference", "masse", "vers la terre", "vers le zero", "fuite"],
        ["commande", "dependant", "transistor", "amplificateur", "gyrateur", "non reciproque"],
      ],
      minimum: 3,
      exemple: "Trois ou quatre phrases : que fait une résistance dans la ligne de chacun de ses deux nœuds ?",
      etapes: [
        { texte: "Une résistance de conductance $G$ entre les nœuds $k$ et $j$ apporte $+G$ en $(k, k)$ et $(j, j)$, et $-G$ en $(k, j)$ et $(j, k)$ : son motif est symétrique, et la somme de motifs symétriques l'est aussi." },
        { texte: "Chaque conductance apparaît sur la diagonale de ses nœuds et, au plus, une fois hors diagonale dans la même ligne : la diagonale égale la somme des valeurs absolues hors diagonale, plus les conductances vers la référence. D'où la dominance, stricte pour tout nœud relié à la référence." },
        { texte: "Une source commandée, comme le modèle linéaire d'un transistor ou d'un amplificateur, injecte dans un nœud un courant proportionnel à la tension d'un autre, sans effet en retour : un terme apparaît en $(k, j)$ sans son symétrique en $(j, k)$." },
        {
          texte: "Physiquement, la symétrie traduit la réciprocité d'un réseau passif : la tension créée en $j$ par un courant injecté en $k$ égale la tension créée en $k$ par le même courant injecté en $j$.",
          note: "C'est aussi pourquoi la méthode itérative de la section D converge : la dominance garantit que chaque visite rapproche le nœud de sa valeur finale.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 620 240",
          '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"><path d="M40 70H90M150 70H200"/><rect x="90" y="58" width="60" height="24" rx="3"/></g>' +
            '<g stroke="currentColor" stroke-width="1.6" fill="none"><path d="M318 40h-8v160h8M548 40h8v160h-8"/>' +
            '<rect x="342" y="74" width="64" height="32" rx="5"/><rect x="482" y="164" width="64" height="32" rx="5"/>' +
            '<rect x="342" y="164" width="64" height="32" rx="5" stroke-dasharray="5 4"/><rect x="482" y="74" width="64" height="32" rx="5" stroke-dasharray="5 4"/></g>' +
            '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="13">' +
            '<circle cx="40" cy="70" r="5"/><circle cx="200" cy="70" r="5"/><text x="40" y="52" text-anchor="middle">k</text><text x="200" y="52" text-anchor="middle">j</text>' +
            '<text x="120" y="110" text-anchor="middle">G</text>' +
            '<text x="374" y="30" text-anchor="middle">k</text><text x="444" y="30" text-anchor="middle">...</text><text x="514" y="30" text-anchor="middle">j</text>' +
            '<text x="296" y="95" text-anchor="end">k</text><text x="296" y="140" text-anchor="end">...</text><text x="296" y="185" text-anchor="end">j</text>' +
            '<text x="374" y="95" text-anchor="middle">+G</text><text x="514" y="95" text-anchor="middle">-G</text>' +
            '<text x="374" y="185" text-anchor="middle">-G</text><text x="514" y="185" text-anchor="middle">+G</text>' +
            '<text x="120" y="160" text-anchor="middle">motif d\'une résistance :</text><text x="120" y="178" text-anchor="middle">trait plein sur la diagonale,</text><text x="120" y="196" text-anchor="middle">tirets aux places croisées</text></g>',
          "Motif d'une résistance entre les nœuds k et j : plus G sur la diagonale, moins G aux deux places croisées, symétriques"
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const DESSIN_QUIZ =
  '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
  '<path d="M100 60V105M100 145V200H460V170M100 60H170M230 60H280M280 60H330M390 60H460V110M280 60V110M280 170V200"/>' +
  '<circle cx="100" cy="125" r="20"/><rect x="170" y="48" width="60" height="24" rx="3"/><rect x="330" y="48" width="60" height="24" rx="3"/>' +
  '<rect x="268" y="110" width="24" height="60" rx="3"/><rect x="448" y="110" width="24" height="60" rx="3"/>' +
  '<path d="M280 200V212M266 212H294M271 218H289M276 224H284"/></g>' +
  '<g fill="currentColor" stroke="none"><circle cx="100" cy="60" r="5"/><circle cx="280" cy="60" r="5"/><circle cx="460" cy="60" r="5"/></g>' +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
  '<text x="100" y="121" text-anchor="middle" font-weight="600">+</text><text x="70" y="130" text-anchor="end">9 V</text>' +
  '<text x="200" y="40" text-anchor="middle">2 kΩ</text><text x="360" y="40" text-anchor="middle">1 kΩ</text>' +
  '<text x="256" y="144" text-anchor="end">3 kΩ</text><text x="484" y="144">6 kΩ</text>' +
  '<text x="100" y="30" text-anchor="middle" font-weight="600">A</text><text x="280" y="30" text-anchor="middle" font-weight="600">B</text>' +
  '<text x="460" y="30" text-anchor="middle" font-weight="600">C</text>' +
  '<text x="280" y="246" text-anchor="middle" font-size="11.5">référence en bas ; source idéale, sans résistance série</text></g>';

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Un réseau compte $n$ nœuds, référence comprise, et $b$ branches. Combien d'inconnues la méthode des nœuds utilise-t-elle, sans source de tension idéale ?</p>",
        options: ["$n$", "$n - 1$", "$b - n + 1$", "$b$"],
        bonnes: [1],
        explication: "Un potentiel par nœud, sauf la référence, dont le potentiel est nul par convention : $n - 1$ inconnues. $b - n + 1$ est le nombre de mailles indépendantes.",
        resume: "Inconnues de la méthode des nœuds",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Dans la matrice de conductance, le terme $G_{12}$ vaut la somme des conductances qui relient les nœuds 1 et 2, avec un signe plus.</p>",
        reponse: false,
        explication: "Il vaut moins cette somme : le courant qui quitte le nœud 1 vers le nœud 2 est $G(V_1 - V_2)$, et $V_2$ y figure avec un signe moins.",
        resume: "Signe hors diagonale",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est le déterminant de la matrice $\\begin{pmatrix} 4 & -1 \\\\ -1 & 3 \\end{pmatrix}$ ?</p>",
        valeur: 11,
        unite: "",
        tolerance: 0.01,
        chiffres: 0,
        explication: "$4 \\times 3 - (-1)(-1) = 12 - 1 = 11$.",
        resume: "Déterminant 2 x 2",
      },
      {
        type: "courte",
        enonce: "<p>Comment appelle-t-on la frontière qui entoure une source de tension idéale et ses deux nœuds, pour écrire une seule loi des nœuds sans le courant de la source ?</p>",
        motsCles: [["supern", "super n"]],
        minimum: 1,
        explication: "Un supernœud : sa loi des nœuds fait disparaître le courant inconnu de la source, et la contrainte $V_a - V_b = E$ complète le système.",
        resume: "Supernœud",
      },
      {
        type: "calcul",
        enonce: "<p>Un nœud est relié à une source de $12\\ \\mathrm{V}$ par $2\\ \\Omega$, à une source de $6\\ \\mathrm{V}$ par $3\\ \\Omega$ et à la référence par $6\\ \\Omega$. Quel est son potentiel, en volts ?</p>",
        valeur: 8,
        unite: "V",
        tolerance: 0.01,
        chiffres: 2,
        explication: "Millman, méthode des nœuds à une inconnue : $V = (12/2 + 6/3)/(1/2 + 1/3 + 1/6) = 8/1 = 8\\ \\mathrm{V}$.",
        resume: "Millman",
      },
      {
        type: "schema",
        enonce: "<p>Dans ce réseau, quel nœud a un potentiel connu d'avance, qui sort donc des inconnues de la méthode des nœuds ?</p>",
        consigne: "Cliquez sur la lettre du nœud correspondant.",
        viewBox: "0 0 560 260",
        dessin: DESSIN_QUIZ,
        zones: [
          { x: 80, y: 10, largeur: 40, hauteur: 30, etiquette: "nœud A", juste: true },
          { x: 260, y: 10, largeur: 40, hauteur: 30, etiquette: "nœud B" },
          { x: 440, y: 10, largeur: 40, hauteur: 30, etiquette: "nœud C" },
        ],
        explication: "Le nœud A est relié à la référence par la source idéale de $9\\ \\mathrm{V}$ : $V_A = 9\\ \\mathrm{V}$. Il ne reste que $V_B$ et $V_C$ à calculer.",
        resume: "Nœud imposé par une source idéale",
      },
      {
        type: "vraiFaux",
        enonce: "<p>La méthode d'Euler explicite donne une réponse stable quel que soit le pas de temps, pourvu que le circuit simulé soit stable.</p>",
        reponse: false,
        explication: "Son facteur d'amplification $1 - h/\\tau$ dépasse $1$ en valeur absolue dès que $h \\gt 2\\tau$ : un circuit stable paraît alors diverger.",
        resume: "Stabilité d'Euler explicite",
      },
      {
        type: "calcul",
        enonce: "<p>Avec la méthode d'Euler implicite et un pas $h = 10\\ \\mu\\mathrm{s}$, quelle conductance compagnon remplace un condensateur de $10\\ \\mu\\mathrm{F}$, en siemens ?</p>",
        valeur: 1,
        unite: "S",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$G_h = C/h = 10^{-5}/10^{-5} = 1\\ \\mathrm{S}$, en parallèle avec une source de courant $G_hu_k$.",
        resume: "Conductance compagnon",
      },
      {
        type: "qcm",
        enonce: "<p>Quels contrôles valident une solution obtenue par la méthode des nœuds ?</p>",
        options: [
          { texte: "Le résidu de chaque loi des nœuds écrite sur le schéma est nul.", juste: true },
          { texte: "La puissance fournie par les sources égale la puissance absorbée.", juste: true },
          { texte: "La méthode des mailles redonne les mêmes courants.", juste: true },
          { texte: "Le résultat comporte plus de six chiffres significatifs." },
        ],
        multiple: true,
        explication: "Résidu, bilan de puissance et méthode indépendante sont trois contrôles indépendants du calcul. Le nombre de chiffres affichés ne prouve rien.",
        resume: "Contrôles de validation",
      },
      {
        type: "calcul",
        enonce: "<p>Un circuit a pour matrice d'état $A = \\begin{pmatrix} 0 & 1\\,000 \\\\ -1\\,000 & -500 \\end{pmatrix}\\ \\mathrm{s^{-1}}$. Que vaut la somme de ses deux pôles, en $\\mathrm{s^{-1}}$ ?</p>",
        valeur: -500,
        unite: "1/s",
        tolerance: 0.01,
        chiffres: 0,
        explication: "La somme des valeurs propres égale la trace : $0 + (-500) = -500\\ \\mathrm{s^{-1}}$. Leur produit est le déterminant, $10^6\\ \\mathrm{s^{-2}}$.",
        resume: "Trace et pôles",
      },
    ],
    { titre: "Dix questions sur les méthodes de résolution systématique" }
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
      { categorie: "Comptage", question: "Combien d'équations indépendantes pour un réseau de n nœuds et b branches ?", reponse: "$n - 1$ lois des nœuds et $b - n + 1$ lois des mailles ; la méthode des nœuds garde $n - 1$ inconnues, celle des mailles $b - n + 1$." },
      { categorie: "Inspection", question: "Comment écrire la matrice de conductance sans poser les équations ?", reponse: "$G_{kk}$ : somme des conductances touchant le nœud $k$ ; $G_{kj}$ : moins la conductance entre $k$ et $j$ ; $I_k$ : courants injectés par les sources." },
      { categorie: "Sources réelles", question: "Comment entre une source de tension E de résistance R dans la méthode des nœuds ?", reponse: "Par son équivalent de Norton : $E/R$ injecté dans le nœud, et $1/R$ ajouté à la diagonale." },
      { categorie: "Sources idéales", question: "Que faire d'une source de tension idéale entre deux nœuds ?", reponse: "Un supernœud à la main, ou l'analyse nodale modifiée : une inconnue $i_E$, $\\pm 1$ dans la colonne et la ligne ajoutées, $E$ au second membre." },
      { categorie: "Mailles", question: "Que faire d'une source de courant commune à deux mailles ?", reponse: "Une supermaille dont le contour l'évite, complétée par la contrainte $J_j - J_k = I_s$." },
      { categorie: "Gauss", question: "Que signifie physiquement l'élimination d'une inconnue ?", reponse: "La disparition d'un nœud du réseau, remplacé par des équivalents (série, étoile-polygone) ; la dernière ligne est un Norton vu du dernier nœud." },
      { categorie: "Validation", question: "Que dit le théorème de Tellegen ?", reponse: "$\\sum u_k i_k = 0$ en convention récepteur pour toutes les branches : la puissance fournie égale la puissance absorbée, quels que soient les dipôles." },
      { categorie: "État", question: "Quelles variables d'état choisir, et que sont les pôles ?", reponse: "Tensions des condensateurs et courants des bobines ; $\\dot{x} = Ax + Bu$, les pôles sont les valeurs propres de $A$, $\\tau_i = -1/\\operatorname{Re} r_i$." },
      { categorie: "Simulation", question: "Quelle limite de pas pour Euler explicite, et que fait un simulateur à la place ?", reponse: "$h \\lt 2\\tau_{\\min}$ pour la stabilité, $h \\leq \\tau_{\\min}$ pour la monotonie ; un simulateur emploie une méthode implicite et remplace chaque condensateur par $C/h$ en parallèle avec $(C/h)u_k$." },
      {
        categorie: "Industriel",
        question: "Pourquoi le bus 24 V secouru a-t-il été mis sous forme matricielle ?",
        reponse: "Ses charges sont réparties : il faut un nœud par point de raccordement. En secours, batterie à $21{,}6\\ \\mathrm{V}$, la bobine de $KM1$ ne reçoit que $19{,}35\\ \\mathrm{V}$.",
        rappel: "Décision : fermeture de KM1 en secours autorisée seulement si le bus dépasse 20,9 V, bobine non alimentée.",
      },
    ],
    { titre: "Dix cartes sur les méthodes de résolution systématique" }
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
        enonce: "<p>Un nœud est relié par $1\\ \\mathrm{k\\Omega}$, $2\\ \\mathrm{k\\Omega}$ et $500\\ \\Omega$ à d'autres nœuds ou à la référence. Que vaut son terme diagonal $G_{kk}$, en millisiemens ?</p>",
        valeur: 3.5,
        unite: "mS",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$1 + 0{,}5 + 2 = 3{,}5\\ \\mathrm{mS}$ : toutes les conductances qui touchent le nœud, quelle que soit leur autre extrémité.",
        resume: "Terme diagonal (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>La méthode des mailles par fenêtres s'applique directement à un réseau non planaire.</p>",
        reponse: false,
        explication: "Un réseau non planaire ne se dessine pas sans croisement : ses fenêtres ne définissent pas un jeu de mailles indépendantes. On passe à la méthode des nœuds.",
        resume: "Réseaux non planaires (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Un réseau a $4$ nœuds, référence comprise, et $6$ branches. Combien de mailles indépendantes compte-t-il ?</p>",
        valeur: 3,
        unite: "",
        tolerance: 0.001,
        chiffres: 0,
        explication: "$b - n + 1 = 6 - 4 + 1 = 3$, autant que d'inconnues de nœud, $n - 1 = 3$.",
        resume: "Nombre de mailles (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est le coefficient d'amortissement d'un circuit RLC série avec $R = 20\\ \\Omega$, $L = 10\\ \\mathrm{mH}$ et $C = 10\\ \\mu\\mathrm{F}$ ?</p>",
        valeur: 10 * Math.sqrt(1e-5 / 1e-2),
        unite: "",
        tolerance: 0.02,
        chiffres: 3,
        explication: "$\\zeta = \\tfrac{R}{2}\\sqrt{C/L} = 10 \\times \\sqrt{10^{-3}} = 0{,}316$ : régime pseudo-périodique. Révisé du cours Régime transitoire RLC.",
        resume: "Amortissement (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la fréquence propre d'un circuit avec $L = 1\\ \\mathrm{mH}$ et $C = 1\\ \\mu\\mathrm{F}$, en hertz ?</p>",
        valeur: 1 / (2 * Math.PI * Math.sqrt(1e-9)),
        unite: "Hz",
        tolerance: 0.02,
        chiffres: 0,
        explication: "$\\omega_0 = 1/\\sqrt{10^{-9}} = 31\\,623\\ \\mathrm{rad/s}$ et $f_0 = \\omega_0/(2\\pi) = 5\\,033\\ \\mathrm{Hz}$. Révisé du cours Régime transitoire RLC.",
        resume: "Fréquence propre (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Une source de $12\\ \\mathrm{V}$ alimente un diviseur formé de $6\\ \\mathrm{k\\Omega}$ côté source et $3\\ \\mathrm{k\\Omega}$ côté masse. Quelle est la résistance de Thévenin vue aux bornes de la résistance de $3\\ \\mathrm{k\\Omega}$, en kiloohms ?</p>",
        valeur: 2,
        unite: "kΩ",
        tolerance: 0.01,
        chiffres: 2,
        explication: "Source éteinte, les deux résistances sont en parallèle : $6 \\times 3/(6 + 3) = 2\\ \\mathrm{k\\Omega}$ ; la tension de Thévenin vaut $12 \\times 3/9 = 4\\ \\mathrm{V}$. Révisé du cours Théorèmes de Thévenin, Norton et superposition.",
        resume: "Résistance de Thévenin (Théorèmes de Thévenin, Norton et superposition)",
      },
      {
        type: "calcul",
        enonce: "<p>Deux courants de $3\\ \\mathrm{A}$ et $2\\ \\mathrm{A}$ entrent dans un nœud, un courant de $4\\ \\mathrm{A}$ en sort par une troisième branche. Quel courant sort par la quatrième branche, en ampères ?</p>",
        valeur: 1,
        unite: "A",
        tolerance: 0.01,
        chiffres: 1,
        explication: "Loi des nœuds : $3 + 2 = 4 + i$, donc $i = 1\\ \\mathrm{A}$ sortant. Révisé du cours Lois de Kirchhoff.",
        resume: "Loi des nœuds (Lois de Kirchhoff)",
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
    titre: "Où en suis-je sur les méthodes de résolution systématique ?",
  });
  if (auto) ressources.push(auto);
}
