/* ==========================================================================
   cours/lois-de-kirchhoff/cours.js
   Lois de Kirchhoff.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";

/* Géométrie commune du circuit à deux mailles (schéma principal de la section F). */
const G = { xg: 130, xm: 350, xd: 570, yh: 70, yb: 320 };

/* Valeurs par défaut de l'exemple de la section H. */
const EXEMPLE = { e1: 27, r1: 0.5, e2: 24, r2: 0.5, r3: 6 };

/* --------------------------------------------------------------------------
   Utilitaires
   -------------------------------------------------------------------------- */

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function texteSvg(x, y, contenu, attributs = {}) {
  const element = svgEl("text", { x, y, ...attributs });
  element.textContent = contenu;
  return element;
}

function nombre(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
}

/** Résolution du circuit à deux mailles par le théorème de Millman. */
function resoudreCircuit(p) {
  const va = (p.e1 / p.r1 + p.e2 / p.r2) / (1 / p.r1 + 1 / p.r2 + 1 / p.r3);
  const i1 = (p.e1 - va) / p.r1;
  const i2 = (p.e2 - va) / p.r2;
  const i3 = va / p.r3;
  return { va, i1, i2, i3 };
}

/** Marqueur de flèche, défini une fois par schéma. */
function marqueur(id, remplissage) {
  return (
    '<marker id="' + id + '" markerWidth="9" markerHeight="9" refX="6" refY="4" orient="auto">' +
    '<path d="M0 0 8 4 0 8Z" fill="' + (remplissage || "currentColor") + '"/></marker>'
  );
}

/** Traits du circuit à deux mailles : fils, sources, résistances, nœuds et masse. */
function traitsCircuit() {
  return (
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
    '<path d="M130 320V266"/><circle cx="130" cy="240" r="26"/><path d="M130 214V170"/>' +
    '<rect x="116" y="110" width="28" height="60" rx="3"/>' +
    '<path d="M130 110V70H570V110"/><rect x="556" y="110" width="28" height="60" rx="3"/>' +
    '<path d="M570 170V214"/><circle cx="570" cy="240" r="26"/><path d="M570 266V320H130"/>' +
    '<path d="M350 70V150"/><rect x="336" y="150" width="28" height="80" rx="3"/><path d="M350 230V320"/>' +
    '<path d="M350 320V340M334 340H366M340 347H360M346 354H354"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="350" cy="70" r="6"/><circle cx="350" cy="320" r="6"/></g>'
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

/** Point marqué sur un tracé de correction, avec rappels pointillés vers les axes. */
function marquerPoint(c, repere, couleurs, x, y, texte) {
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
    c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
    c.textAlign = px > repere.boite.x + repere.boite.w * 0.7 ? "right" : "left";
    c.fillText(texte, px + (c.textAlign === "right" ? -8 : 8), py - 8);
  }
  c.restore();
}

/** Position le long d'une polyligne, à l'abscisse curviligne s (repliée). */
function pointSurPolyligne(points, longueurs, total, s) {
  let reste = ((s % total) + total) % total;
  for (let k = 0; k < longueurs.length; k += 1) {
    if (reste <= longueurs[k] || k === longueurs.length - 1) {
      const t = longueurs[k] === 0 ? 0 : Math.min(1, reste / longueurs[k]);
      return {
        x: points[k][0] + (points[k + 1][0] - points[k][0]) * t,
        y: points[k][1] + (points[k + 1][1] - points[k][1]) * t,
      };
    }
    reste -= longueurs[k];
  }
  return { x: points[0][0], y: points[0][1] };
}

function preparerPolyligne(points) {
  const longueurs = [];
  let total = 0;
  for (let k = 0; k < points.length - 1; k += 1) {
    const l = Math.hypot(points[k + 1][0] - points[k][0], points[k + 1][1] - points[k][1]);
    longueurs.push(l);
    total += l;
  }
  return { points, longueurs, total };
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
  construireNoeud(racine, api);
  construireParcours(racine, api);
  construireCircuit(racine, api);
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
  const selecteurs = [
    "#e-topologie-figure svg",
    "#e-noeud-figure svg",
    "#e-maille-figure svg",
    "#f-schema-principal svg",
    "#h-schema-figure svg",
    "#i-differentiel-figure svg",
  ];
  for (const selecteur of selecteurs) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree: 1.4 }));
  }
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-ohm-signe",
      titre: "Variation de potentiel dans une résistance",
      niveau: "diagnostic",
      enonce:
        "<p>Une résistance $R = 22\\ \\Omega$ est parcourue par un courant de $0{,}5\\ \\mathrm{A}$ qui va de sa borne $P$ vers sa borne $Q$. Que vaut $V_Q - V_P$, en volts ?</p>",
      valeur: -11,
      unite: "V",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "V_Q - V_P",
      etapes: [
        { texte: "Le courant entre par $P$ : en convention récepteur, $u_{PQ} = V_P - V_Q = Ri$." },
        { texte: "$V_P - V_Q = 22 \\times 0{,}5 = 11\\ \\mathrm{V}$." },
        { texte: "Donc $V_Q - V_P = -11\\ \\mathrm{V}$ : le potentiel baisse dans le sens du courant.", note: "C'est la règle $-Ri$ qu'on appliquera à chaque résistance parcourue dans le sens de son courant." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 170",
          "<defs>" + marqueur("fl-c1") + marqueur("fl-c1-u", "var(--serie-2)") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M40 80H200"/><rect x="200" y="64" width="160" height="32" rx="3"/><path d="M360 80H520"/></g>' +
            '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M90 80H160" marker-end="url(#fl-c1)"/></g>' +
            '<g stroke="var(--serie-2)" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M355 40H205" marker-end="url(#fl-c1-u)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<text x="200" y="120" text-anchor="middle" font-weight="600">P</text><text x="360" y="120" text-anchor="middle" font-weight="600">Q</text>' +
            '<text x="280" y="85" text-anchor="middle">22 Ω</text><text x="125" y="70" text-anchor="middle">i = 0,5 A</text>' +
            '<text x="280" y="30" text-anchor="middle" fill="var(--serie-2)">u = V_P - V_Q = + 11 V</text>' +
            '<text x="280" y="150" text-anchor="middle" font-weight="600">V_Q - V_P = - 11 V : le potentiel baisse dans le sens du courant</text></g>',
          "Résistance de 22 ohms parcourue de P vers Q par 0,5 ampère : la tension de P par rapport à Q vaut 11 volts"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-chasles",
      titre: "Additivité des tensions",
      niveau: "diagnostic",
      enonce:
        "<p>On mesure $u_{AB} = 12\\ \\mathrm{V}$ et $u_{CB} = 4{,}5\\ \\mathrm{V}$. Que vaut $u_{AC}$, en volts ?</p>",
      valeur: 7.5,
      unite: "V",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "u_AC",
      etapes: [
        { texte: "$u_{AC} = V_A - V_C = (V_A - V_B) + (V_B - V_C) = u_{AB} - u_{CB}$." },
        { texte: "$u_{AC} = 12 - 4{,}5 = 7{,}5\\ \\mathrm{V}$.", note: "L'erreur classique est d'additionner $12 + 4{,}5$ : $u_{CB}$ est orientée de $B$ vers $C$, il faut l'inverser." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 200",
          '<g stroke="currentColor" stroke-width="1.6" fill="none" opacity="0.6"><path d="M80 170H500"/></g>' +
            '<g stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"><path d="M140 170V30"/><path d="M280 170V100"/></g>' +
            '<g stroke="currentColor" stroke-width="1.4" fill="none" stroke-dasharray="4 4"><path d="M140 30H470"/><path d="M280 100H470"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<circle cx="140" cy="30" r="5"/><circle cx="280" cy="100" r="5"/><circle cx="420" cy="170" r="5"/>' +
            '<text x="126" y="34" text-anchor="end">A : 12 V</text><text x="266" y="104" text-anchor="end">C : 4,5 V</text><text x="406" y="190" text-anchor="end">B : 0 V</text>' +
            '<text x="480" y="70" font-weight="600">u_AC = 7,5 V</text></g>',
          "Potentiels de A, C et B représentés comme des altitudes : A à 12 volts, C à 4,5 volts, B à 0 volt"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-systeme",
      titre: "Système de deux équations",
      niveau: "diagnostic",
      enonce: "<p>Résolvez $3x - y = 7$ et $x + 2y = 7$. Donnez $x$.</p>",
      valeur: 3,
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "x",
      etapes: [
        { texte: "Cramer : $\\Delta = 3 \\times 2 - (-1) \\times 1 = 7$." },
        { texte: "$x = (7 \\times 2 - (-1) \\times 7)/7 = 21/7 = 3$ ; $y = (3 \\times 7 - 7 \\times 1)/7 = 14/7 = 2$." },
        { texte: "Vérification : $3 \\times 3 - 2 = 7$ et $3 + 2 \\times 2 = 7$.", note: "C'est exactement la forme des systèmes de la méthode des mailles." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Les deux équations sont deux droites qui se coupent en (3 ; 2)",
          genre: "Correction visuelle",
          xTitre: "x",
          yTitre: "y",
          xMin: 0,
          xMax: 6,
          yMin: -2,
          yMax: 6,
          ratio: 0.45,
          series: [
            { id: "d1", nom: "y = 3x - 7", couleur: "serie-1", fonction: (x) => 3 * x - 7 },
            { id: "d2", nom: "y = (7 - x) / 2", couleur: "serie-4", fonction: (x) => (7 - x) / 2 },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 3, 2, "solution (3 ; 2)");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Simulation : conservation du courant à un nœud
   -------------------------------------------------------------------------- */

function construireNoeud(racine, api) {
  const conteneur = racine.querySelector("#d-noeud");
  if (!conteneur) return;

  const centre = { x: 320, y: 150 };
  const branches = [
    { nom: "I1", de: { x: 50, y: 150 }, etiquette: { x: 60, y: 134, ancre: "start" } },
    { nom: "I2", de: { x: 320, y: 16 }, etiquette: { x: 336, y: 34, ancre: "start" } },
    { nom: "I3", de: { x: 590, y: 150 }, etiquette: { x: 580, y: 134, ancre: "end" } },
    { nom: "I4", de: { x: 320, y: 284 }, etiquette: { x: 336, y: 276, ancre: "start" } },
  ];

  const svg = svgEl("svg", {
    viewBox: "0 0 640 300",
    role: "img",
    "aria-label": "Nœud relié à quatre branches dont les courants de référence sont tous entrants, avec des porteurs animés",
  });
  svg.innerHTML = "<defs>" + marqueur("fl-d-noeud") + "</defs>";

  const traits = [];
  const disques = [];
  const textes = [];
  const pas = 26;

  for (const branche of branches) {
    const longueur = Math.hypot(centre.x - branche.de.x, centre.y - branche.de.y);
    branche.longueur = longueur;
    const trait = svgEl("path", {
      d: "M" + branche.de.x + " " + branche.de.y + "L" + centre.x + " " + centre.y,
      stroke: "currentColor",
      fill: "none",
      "stroke-linecap": "round",
      "stroke-width": 2,
      opacity: 0.5,
    });
    svg.appendChild(trait);
    traits.push(trait);
  }

  /* Flèches de référence, toutes dirigées vers le nœud. */
  const fleches = svgEl("g", { stroke: "currentColor", "stroke-width": 2.6, fill: "none", "stroke-linecap": "round" });
  for (const branche of branches) {
    const ux = (centre.x - branche.de.x) / branche.longueur;
    const uy = (centre.y - branche.de.y) / branche.longueur;
    const d0 = branche.longueur * 0.55;
    const d1 = branche.longueur * 0.72;
    fleches.appendChild(
      svgEl("path", {
        d:
          "M" + (branche.de.x + ux * d0).toFixed(1) + " " + (branche.de.y + uy * d0).toFixed(1) +
          "L" + (branche.de.x + ux * d1).toFixed(1) + " " + (branche.de.y + uy * d1).toFixed(1),
        "marker-end": "url(#fl-d-noeud)",
      })
    );
  }
  svg.appendChild(fleches);

  const groupeDisques = svgEl("g", { fill: "currentColor", stroke: "none" });
  branches.forEach((branche, rang) => {
    const liste = [];
    const nombreDisques = Math.floor(branche.longueur / pas);
    for (let k = 0; k < nombreDisques; k += 1) {
      const disque = svgEl("circle", { r: 3.6, style: "fill: var(--serie-" + (rang + 1) + ")", stroke: "currentColor", "stroke-width": 0.8 });
      groupeDisques.appendChild(disque);
      liste.push(disque);
    }
    disques.push(liste);
  });
  svg.appendChild(groupeDisques);

  svg.appendChild(svgEl("circle", { cx: centre.x, cy: centre.y, r: 8, fill: "currentColor" }));
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 13 });
  libelles.appendChild(texteSvg(centre.x + 14, centre.y + 22, "N", { "font-weight": 600 }));
  for (const branche of branches) {
    const texte = texteSvg(branche.etiquette.x, branche.etiquette.y, "", { "text-anchor": branche.etiquette.ancre });
    libelles.appendChild(texte);
    textes.push(texte);
  }
  const bilan = texteSvg(630, 292, "", { "text-anchor": "end", "font-size": 12 });
  libelles.appendChild(bilan);
  svg.appendChild(libelles);
  conteneur.appendChild(svg);

  const etat = { courants: [2, -1, 0.5, -1.5], t: 0 };

  const valeurs = api.sim.valeurs("#d-noeud-valeurs", [
    { id: "i4", libelle: "I4 imposé par la loi des nœuds", unite: "A", decimales: 2 },
    { id: "sens", libelle: "Sens réel de I4", format: (v) => v },
    { id: "entrant", libelle: "Courant réellement entrant", unite: "A", decimales: 2 },
    { id: "sortant", libelle: "Courant réellement sortant", unite: "A", decimales: 2 },
    { id: "somme", libelle: "Somme algébrique I1 + I2 + I3 + I4", unite: "A", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function placer(t) {
    etat.t = t;
    branches.forEach((branche, rang) => {
      const courant = etat.courants[rang];
      const vitesse = 22 * courant;
      const ux = (centre.x - branche.de.x) / branche.longueur;
      const uy = (centre.y - branche.de.y) / branche.longueur;
      disques[rang].forEach((disque, k) => {
        let s = (k * pas + vitesse * t) % (disques[rang].length * pas);
        if (s < 0) s += disques[rang].length * pas;
        const visible = Math.abs(courant) > 1e-6 && s <= branche.longueur - 10;
        disque.setAttribute("cx", (branche.de.x + ux * s).toFixed(1));
        disque.setAttribute("cy", (branche.de.y + uy * s).toFixed(1));
        disque.setAttribute("opacity", visible ? "1" : "0");
      });
    });
  }

  function actualiser() {
    etat.courants[3] = -(etat.courants[0] + etat.courants[1] + etat.courants[2]);
    let entrant = 0;
    let sortant = 0;
    branches.forEach((branche, rang) => {
      const courant = etat.courants[rang];
      traits[rang].setAttribute("stroke-width", (2 + 1.6 * Math.abs(courant)).toFixed(1));
      textes[rang].textContent = branche.nom + " = " + nombre(api, courant, 2) + " A";
      if (courant > 0) entrant += courant;
      else sortant -= courant;
    });
    const i4 = etat.courants[3];
    bilan.textContent = "charge accumulée au nœud : 0 C";
    if (valeurs) {
      valeurs.maj({
        i4,
        sens: Math.abs(i4) < 1e-9 ? "aucun courant" : i4 > 0 ? "entre dans le nœud" : "sort du nœud",
        entrant,
        sortant,
        somme: Math.abs(etat.courants.reduce((a, b) => a + b, 0)) < 5e-4 ? 0 : etat.courants.reduce((a, b) => a + b, 0),
      });
    }
    placer(etat.t);
  }

  const lecteur = api.sim.lecteur("#d-noeud-lecteur", {
    de: 0,
    a: 60,
    duree: 60,
    boucle: true,
    auto: false,
    libelle: "Mouvement des porteurs",
    rappel: (valeur) => placer(valeur),
  });
  if (lecteur) ressources.push(lecteur);

  const curseurs = api.sim.curseurs(
    "#d-noeud-curseurs",
    [
      { id: "i1", libelle: "I1 (référence entrante)", min: -5, max: 5, pas: 0.1, valeur: 2, unite: "A" },
      { id: "i2", libelle: "I2 (référence entrante)", min: -5, max: 5, pas: 0.1, valeur: -1, unite: "A" },
      { id: "i3", libelle: "I3 (référence entrante)", min: -5, max: 5, pas: 0.1, valeur: 0.5, unite: "A" },
    ],
    (lues) => {
      etat.courants[0] = lues.i1;
      etat.courants[1] = lues.i2;
      etat.courants[2] = lues.i3;
      actualiser();
    }
  );
  if (curseurs) ressources.push(curseurs);

  actualiser();
}

/* --------------------------------------------------------------------------
   E. Simulation : parcours d'une maille et profil de potentiel
   -------------------------------------------------------------------------- */

/** Tronçons d'une branche, avec la variation de potentiel dans le sens indiqué. */
function tronconsMailles(p, c) {
  const t = (de, a, dv, nom) => ({ de, a, dv, nom: nom || null });
  const gaucheMontee = [
    t([130, 320], [130, 266], 0),
    t([130, 266], [130, 214], p.e1, "E1"),
    t([130, 214], [130, 170], 0),
    t([130, 170], [130, 110], -p.r1 * c.i1, "R1"),
    t([130, 110], [130, 70], 0),
  ];
  const centreDescente = [
    t([350, 70], [350, 150], 0),
    t([350, 150], [350, 230], -p.r3 * c.i3, "R3"),
    t([350, 230], [350, 320], 0),
  ];
  const droiteDescente = [
    t([570, 70], [570, 110], 0),
    t([570, 110], [570, 170], p.r2 * c.i2, "R2"),
    t([570, 170], [570, 214], 0),
    t([570, 214], [570, 266], -p.e2, "E2"),
    t([570, 266], [570, 320], 0),
  ];
  const inverser = (liste) => liste.slice().reverse().map((x) => t(x.a, x.de, -x.dv, x.nom));
  return {
    gauche: [t([350, 320], [130, 320], 0), ...gaucheMontee, t([130, 70], [350, 70], 0), ...centreDescente],
    droite: [...inverser(centreDescente), t([350, 70], [570, 70], 0), ...droiteDescente, t([570, 320], [350, 320], 0)],
    exterieure: [t([350, 320], [130, 320], 0), ...gaucheMontee, t([130, 70], [570, 70], 0), ...droiteDescente, t([570, 320], [350, 320], 0)],
  };
}

const NOMS_MAILLES = ["maille de gauche (J1)", "maille de droite (J2)", "maille extérieure"];
const CLES_MAILLES = ["gauche", "droite", "exterieure"];

function construireParcours(racine, api) {
  const conteneur = racine.querySelector("#e-parcours");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 650",
    role: "img",
    "aria-label": "Circuit à deux mailles avec un point déplaçable le long d'une maille et le profil de potentiel correspondant",
  });
  const contour = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 9, "stroke-linejoin": "round", opacity: 0.18 });
  svg.appendChild(contour);
  const fond = svgEl("g");
  fond.innerHTML =
    "<defs>" + marqueur("fl-e-parcours") + "</defs>" + traitsCircuit() +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
    '<text x="130" y="245" text-anchor="middle">E1</text><text x="570" y="245" text-anchor="middle">E2</text>' +
    '<text x="104" y="224" text-anchor="end" font-weight="600">+</text><text x="600" y="224" font-weight="600">+</text>' +
    '<text x="152" y="145">R1</text><text x="548" y="145" text-anchor="end">R2</text><text x="328" y="195" text-anchor="end">R3</text>' +
    '<text x="350" y="54" text-anchor="middle" font-weight="600">A</text><text x="366" y="312" font-weight="600">B</text>' +
    '<text x="350" y="376" text-anchor="middle">référence 0 V</text></g>';
  svg.appendChild(fond);

  const sensParcours = svgEl("path", {
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.6,
    "stroke-linecap": "round",
    opacity: 0.85,
    "marker-end": "url(#fl-e-parcours)",
  });
  svg.appendChild(sensParcours);

  const infos = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  const texteI = texteSvg(700 - 10, 30, "", { "text-anchor": "end" });
  const texteV = texteSvg(10, 30, "");
  infos.append(texteI, texteV);
  svg.appendChild(infos);

  /* Repère du profil de potentiel. */
  const cadre = { x0: 70, x1: 650, yh: 420, yb: 600, vMin: -3, vMax: 30 };
  const versY = (v) => cadre.yb - ((v - cadre.vMin) / (cadre.vMax - cadre.vMin)) * (cadre.yb - cadre.yh);
  const versX = (fraction) => cadre.x0 + fraction * (cadre.x1 - cadre.x0);
  const repere = svgEl("g", { stroke: "currentColor", fill: "none", "stroke-width": 1.4 });
  repere.appendChild(svgEl("path", { d: "M" + cadre.x0 + " " + versY(0) + "H" + (cadre.x1 + 10), opacity: 0.8 }));
  repere.appendChild(svgEl("path", { d: "M" + cadre.x0 + " " + (cadre.yb + 6) + "V" + (cadre.yh - 14), opacity: 0.8 }));
  for (const v of [10, 20]) {
    repere.appendChild(svgEl("path", { d: "M" + cadre.x0 + " " + versY(v) + "H" + cadre.x1, opacity: 0.15 }));
  }
  svg.appendChild(repere);
  const graduations = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  for (const v of [0, 10, 20]) graduations.appendChild(texteSvg(cadre.x0 - 8, versY(v) + 4, v + " V", { "text-anchor": "end" }));
  graduations.appendChild(texteSvg(cadre.x0 + 6, cadre.yh - 16, "potentiel par rapport à B"));
  graduations.appendChild(texteSvg(cadre.x1, cadre.yb + 36, "position le long de la maille (% du tour)", { "text-anchor": "end" }));
  svg.appendChild(graduations);
  const nomsElements = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5, "text-anchor": "middle" });
  svg.appendChild(nomsElements);

  const profilComplet = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.4, "stroke-dasharray": "5 5", opacity: 0.6 });
  const profilParcouru = svgEl("path", { fill: "none", "stroke-width": 3, "stroke-linejoin": "round", style: "stroke: var(--serie-1)" });
  const curseurProfil = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.4 });
  const pointProfil = svgEl("circle", { r: 5, fill: "currentColor" });
  svg.append(profilComplet, profilParcouru, curseurProfil, pointProfil);

  conteneur.appendChild(svg);

  const etat = { maille: 0, r3: EXEMPLE.r3, position: 0 };
  let modele = null;
  let poignee = null;

  const valeurs = api.sim.valeurs("#e-parcours-valeurs", [
    { id: "element", libelle: "Élément traversé", format: (v) => v },
    { id: "v", libelle: "Potentiel du point (référence B)", unite: "V", decimales: 2 },
    { id: "hausse", libelle: "Hausses cumulées depuis B", unite: "V", decimales: 2 },
    { id: "baisse", libelle: "Baisses cumulées depuis B", unite: "V", decimales: 2 },
    { id: "somme", libelle: "Somme algébrique des tensions traversées", unite: "V", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function construireModele() {
    const p = { ...EXEMPLE, r3: etat.r3 };
    const c = resoudreCircuit(p);
    const liste = tronconsMailles(p, c)[CLES_MAILLES[etat.maille]];
    let total = 0;
    let v = 0;
    const troncons = liste.map((tr) => {
      const longueur = Math.hypot(tr.a[0] - tr.de[0], tr.a[1] - tr.de[1]);
      const objet = { ...tr, longueur, debut: total, vDebut: v };
      total += longueur;
      v += tr.dv;
      return objet;
    });
    return { p, c, troncons, total };
  }

  function etatA(position) {
    const s = (position / 100) * modele.total;
    let hausse = 0;
    let baisse = 0;
    let element = "fil";
    let v = 0;
    for (const tr of modele.troncons) {
      const fraction = tr.longueur === 0 ? 1 : Math.max(0, Math.min(1, (s - tr.debut) / tr.longueur));
      if (s < tr.debut) break;
      const dv = tr.dv * fraction;
      if (dv > 0) hausse += dv;
      else baisse -= dv;
      v = tr.vDebut + dv;
      if (s <= tr.debut + tr.longueur) {
        element = tr.nom ? tr.nom : "conducteur (fil parfait)";
        break;
      }
    }
    return { v, hausse, baisse, element };
  }

  function dessinerProfil() {
    let complet = "";
    const nombrePoints = 240;
    for (let k = 0; k <= nombrePoints; k += 1) {
      const position = (k / nombrePoints) * 100;
      complet += (k === 0 ? "M" : "L") + versX(position / 100).toFixed(1) + " " + versY(etatA(position).v).toFixed(1);
    }
    profilComplet.setAttribute("d", complet);
    nomsElements.textContent = "";
    for (const tr of modele.troncons) {
      if (!tr.nom) continue;
      const milieu = (tr.debut + tr.longueur / 2) / modele.total;
      nomsElements.appendChild(texteSvg(versX(milieu).toFixed(1), cadre.yb + 18, tr.nom));
    }
    let chemin = "";
    modele.troncons.forEach((tr, rang) => {
      chemin += (rang === 0 ? "M" : "L") + tr.de[0] + " " + tr.de[1] + "L" + tr.a[0] + " " + tr.a[1];
    });
    contour.setAttribute("d", chemin + "Z");
    const centres = [{ x: 240, y: 195 }, { x: 460, y: 195 }, { x: 240, y: 195 }];
    const centre = centres[etat.maille];
    const r = etat.maille === 2 ? 64 : 36;
    sensParcours.setAttribute(
      "d",
      "M" + centre.x + " " + (centre.y - r) + "A" + r + " " + r + " 0 1 1 " + (centre.x - r) + " " + centre.y
    );
    texteI.textContent =
      "I1 = " + nombre(api, modele.c.i1, 2) + " A, I2 = " + nombre(api, modele.c.i2, 2) + " A, I3 = " + nombre(api, modele.c.i3, 2) + " A";
    texteV.textContent = NOMS_MAILLES[etat.maille] + ", sens horaire";
  }

  function afficher(position) {
    etat.position = position;
    const courant = etatA(position);
    let chemin = "";
    const pasPosition = 0.5;
    for (let q = 0; q <= position + 1e-9; q += pasPosition) {
      chemin += (q === 0 ? "M" : "L") + versX(q / 100).toFixed(1) + " " + versY(etatA(q).v).toFixed(1);
    }
    chemin += "L" + versX(position / 100).toFixed(1) + " " + versY(courant.v).toFixed(1);
    profilParcouru.setAttribute("d", chemin);
    const x = versX(position / 100);
    curseurProfil.setAttribute("d", "M" + x.toFixed(1) + " " + cadre.yh + "V" + cadre.yb);
    pointProfil.setAttribute("cx", x.toFixed(1));
    pointProfil.setAttribute("cy", versY(courant.v).toFixed(1));
    if (valeurs) {
      valeurs.maj({
        element: courant.element,
        v: courant.v,
        hausse: courant.hausse,
        baisse: courant.baisse,
        somme: courant.hausse - courant.baisse,
      });
    }
  }

  function creerPoignee() {
    if (poignee) {
      const rang = ressources.indexOf(poignee);
      if (rang >= 0) ressources.splice(rang, 1);
      poignee.detruire();
      poignee = null;
    }
    const points = [];
    for (const tr of modele.troncons) {
      const nombrePas = Math.max(1, Math.round(tr.longueur / 4));
      for (let k = 0; k < nombrePas; k += 1) {
        points.push({ x: tr.de[0] + ((tr.a[0] - tr.de[0]) * k) / nombrePas, y: tr.de[1] + ((tr.a[1] - tr.de[1]) * k) / nombrePas });
      }
    }
    const dernier = modele.troncons[modele.troncons.length - 1];
    points.push({ x: dernier.a[0], y: dernier.a[1] });
    poignee = api.sim.poignee(conteneur, {
      type: "courbe",
      points,
      min: 0,
      max: 100,
      pas: 0.5,
      valeur: etat.position,
      unite: "%",
      libelle: "Position du point le long de la maille",
      diffuserAuDepart: false,
      rappel: (mesure) => {
        afficher(mesure.valeur);
        if (lecteur) lecteur.definir(mesure.valeur);
      },
    });
    if (poignee) ressources.push(poignee);
  }

  function reconstruire() {
    modele = construireModele();
    dessinerProfil();
    creerPoignee();
    afficher(etat.position);
  }

  const lecteur = api.sim.lecteur("#e-parcours-lecteur", {
    de: 0,
    a: 100,
    duree: 14,
    boucle: true,
    auto: false,
    libelle: "Faire le tour de la maille",
    rappel: (valeur) => {
      if (!modele) return;
      if (poignee) poignee.set(valeur, false);
      afficher(valeur);
    },
  });
  if (lecteur) ressources.push(lecteur);

  const curseurs = api.sim.curseurs(
    "#e-parcours-curseurs",
    [
      { id: "maille", libelle: "Maille parcourue", min: 0, max: 2, pas: 1, valeur: 0, format: (v) => NOMS_MAILLES[Math.round(v)] || NOMS_MAILLES[0] },
      { id: "r3", libelle: "Résistance de charge R3", min: 1, max: 30, pas: 0.5, valeur: EXEMPLE.r3, unite: "Ω" },
    ],
    (lues) => {
      const nouvelleMaille = Math.round(lues.maille);
      const change = nouvelleMaille !== etat.maille || lues.r3 !== etat.r3 || !modele;
      etat.maille = nouvelleMaille;
      etat.r3 = lues.r3;
      if (change) reconstruire();
    }
  );
  if (curseurs) ressources.push(curseurs);

  if (!modele) reconstruire();
  nettoyeursAnimation.push(() => {
    if (poignee) poignee.detruire();
    poignee = null;
  });
}

/* --------------------------------------------------------------------------
   H. Simulation : chargeur, batterie et charge
   -------------------------------------------------------------------------- */

function construireCircuit(racine, api) {
  const conteneur = racine.querySelector("#h-circuit");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 420",
    role: "img",
    "aria-label": "Circuit chargeur, batterie et charge avec des courants animés dont le sens et la vitesse suivent les valeurs calculées",
  });
  const fond = svgEl("g");
  fond.innerHTML =
    "<defs>" + marqueur("fl-h-sim") + marqueur("fl-h-sim-u", "var(--serie-2)") + "</defs>" + traitsCircuit() +
    '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round">' +
    '<path d="M170 70H240" marker-end="url(#fl-h-sim)"/><path d="M530 70H460" marker-end="url(#fl-h-sim)"/>' +
    '<path d="M350 92V134" marker-end="url(#fl-h-sim)"/></g>' +
    '<g stroke="var(--serie-2)" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M400 226V156" marker-end="url(#fl-h-sim-u)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    '<text x="104" y="224" text-anchor="end" font-weight="600">+</text><text x="600" y="224" font-weight="600">+</text>' +
    '<text x="100" y="292" text-anchor="end" font-size="11">chargeur</text><text x="600" y="292" font-size="11">batterie</text>' +
    '<text x="350" y="54" text-anchor="middle" font-weight="600">A</text><text x="366" y="312" font-weight="600">B</text></g>';
  svg.appendChild(fond);

  const dynamiques = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  const tE1 = texteSvg(100, 262, "", { "text-anchor": "end" });
  const tE2 = texteSvg(600, 262, "");
  const tR1 = texteSvg(152, 145, "");
  const tR2 = texteSvg(548, 145, "", { "text-anchor": "end" });
  const tR3 = texteSvg(328, 195, "", { "text-anchor": "end" });
  const tI1 = texteSvg(205, 60, "", { "text-anchor": "middle" });
  const tI2 = texteSvg(495, 60, "", { "text-anchor": "middle" });
  const tI3 = texteSvg(336, 120, "", { "text-anchor": "end" });
  const tVA = texteSvg(410, 196, "", { fill: "var(--serie-2)" });
  const tEtat = texteSvg(350, 404, "", { "text-anchor": "middle", "font-weight": 600 });
  dynamiques.append(tE1, tE2, tR1, tR2, tR3, tI1, tI2, tI3, tVA, tEtat);
  svg.appendChild(dynamiques);

  const trajets = [
    preparerPolyligne([[350, 320], [130, 320], [130, 70], [350, 70]]),
    preparerPolyligne([[350, 320], [570, 320], [570, 70], [350, 70]]),
    preparerPolyligne([[350, 70], [350, 320]]),
  ];
  const pas = 28;
  const groupeDisques = svgEl("g", { stroke: "currentColor", "stroke-width": 0.8 });
  const disques = trajets.map((trajet, rang) => {
    const liste = [];
    const nombreDisques = Math.max(1, Math.floor(trajet.total / pas));
    trajet.espacement = trajet.total / nombreDisques;
    for (let k = 0; k < nombreDisques; k += 1) {
      const disque = svgEl("circle", { r: 3.8, style: "fill: var(--serie-" + [1, 3, 4][rang] + ")" });
      groupeDisques.appendChild(disque);
      liste.push(disque);
    }
    return liste;
  });
  svg.appendChild(groupeDisques);
  conteneur.appendChild(svg);

  const etat = { ...EXEMPLE, t: 0, courants: [0, 0, 0] };

  const valeurs = api.sim.valeurs("#h-circuit-valeurs", [
    { id: "va", libelle: "Tension de l'armoire V_A", unite: "V", decimales: 2 },
    { id: "i1", libelle: "I1 (chargeur, de B vers A)", unite: "A", decimales: 3 },
    { id: "i2", libelle: "I2 (batterie, de B vers A)", unite: "A", decimales: 3 },
    { id: "i3", libelle: "I3 (armoire, de A vers B)", unite: "A", decimales: 3 },
    { id: "noeud", libelle: "Contrôle I1 + I2 - I3", unite: "A", decimales: 3 },
    { id: "fournie", libelle: "Puissance fournie par les sources", unite: "W", decimales: 2 },
    { id: "recue", libelle: "Puissance reçue par les autres dipôles", unite: "W", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function placer(t) {
    etat.t = t;
    trajets.forEach((trajet, rang) => {
      const vitesse = 14 * etat.courants[rang];
      disques[rang].forEach((disque, k) => {
        const point = pointSurPolyligne(trajet.points, trajet.longueurs, trajet.total, k * trajet.espacement + vitesse * t);
        disque.setAttribute("cx", point.x.toFixed(1));
        disque.setAttribute("cy", point.y.toFixed(1));
        disque.setAttribute("opacity", Math.abs(etat.courants[rang]) < 1e-3 ? "0.25" : "1");
      });
    });
  }

  function actualiser() {
    const c = resoudreCircuit(etat);
    etat.courants = [c.i1, c.i2, c.i3];
    tE1.textContent = "E1 = " + nombre(api, etat.e1, 1) + " V";
    tE2.textContent = "E2 = " + nombre(api, etat.e2, 1) + " V";
    tR1.textContent = nombre(api, etat.r1, 2) + " Ω";
    tR2.textContent = nombre(api, etat.r2, 2) + " Ω";
    tR3.textContent = nombre(api, etat.r3, 1) + " Ω";
    tI1.textContent = "I1 = " + nombre(api, c.i1, 2) + " A";
    tI2.textContent = "I2 = " + nombre(api, c.i2, 2) + " A";
    tI3.textContent = "I3 = " + nombre(api, c.i3, 2) + " A";
    tVA.textContent = "V_A = " + nombre(api, c.va, 2) + " V";
    if (Math.abs(c.i2) < 0.005) tEtat.textContent = "batterie au repos : elle ne reçoit ni ne fournit de courant";
    else if (c.i2 < 0) tEtat.textContent = "batterie en charge : I2 < 0, le courant réel entre par sa borne +";
    else tEtat.textContent = "batterie en décharge : I2 > 0, elle alimente l'armoire";
    if (c.i1 < -0.005) tEtat.textContent += " ; courant renvoyé dans le chargeur";

    const pE1 = etat.e1 * c.i1;
    const pE2 = etat.e2 * c.i2;
    const fournie = Math.max(0, pE1) + Math.max(0, pE2);
    const recue = Math.max(0, -pE1) + Math.max(0, -pE2) + etat.r1 * c.i1 * c.i1 + etat.r2 * c.i2 * c.i2 + etat.r3 * c.i3 * c.i3;
    if (valeurs) {
      valeurs.maj({ va: c.va, i1: c.i1, i2: c.i2, i3: c.i3, noeud: Math.abs(c.i1 + c.i2 - c.i3) < 5e-4 ? 0 : c.i1 + c.i2 - c.i3, fournie, recue });
    }
    placer(etat.t);
  }

  const lecteur = api.sim.lecteur("#h-circuit-lecteur", {
    de: 0,
    a: 120,
    duree: 120,
    boucle: true,
    auto: false,
    libelle: "Mouvement des courants",
    rappel: (valeur) => placer(valeur),
  });
  if (lecteur) ressources.push(lecteur);

  const curseurs = api.sim.curseurs(
    "#h-circuit-curseurs",
    [
      { id: "e1", libelle: "F.é.m. du chargeur E1", min: 20, max: 30, pas: 0.1, valeur: EXEMPLE.e1, unite: "V" },
      { id: "r1", libelle: "Résistance R1 du chargeur", min: 0.1, max: 3, pas: 0.05, valeur: EXEMPLE.r1, unite: "Ω" },
      { id: "e2", libelle: "F.é.m. de la batterie E2", min: 20, max: 28, pas: 0.1, valeur: EXEMPLE.e2, unite: "V" },
      { id: "r2", libelle: "Résistance R2 de la batterie", min: 0.1, max: 3, pas: 0.05, valeur: EXEMPLE.r2, unite: "Ω" },
      { id: "r3", libelle: "Résistance de charge R3", min: 1, max: 50, pas: 0.5, valeur: EXEMPLE.r3, unite: "Ω" },
    ],
    (lues) => {
      Object.assign(etat, { e1: lues.e1, r1: lues.r1, e2: lues.e2, r2: lues.r2, r3: lues.r3 });
      actualiser();
    }
  );
  if (curseurs) ressources.push(curseurs);

  actualiser();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/** Circuit à deux mailles annoté pour les corrections des exercices intermédiaires. */
function circuitAnnote(id, etiquettes, supplement) {
  return (
    "<defs>" + marqueur(id) + marqueur(id + "-u", "var(--serie-2)") + "</defs>" + traitsCircuit() +
    '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round">' +
    '<path d="M170 70H240" marker-end="url(#' + id + ')"/><path d="M530 70H460" marker-end="url(#' + id + ')"/>' +
    '<path d="M350 92V134" marker-end="url(#' + id + ')"/></g>' +
    '<g stroke="var(--serie-2)" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M400 226V156" marker-end="url(#' + id + '-u)"/></g>' +
    (supplement || "") +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    '<text x="104" y="224" text-anchor="end" font-weight="600">+</text><text x="600" y="224" font-weight="600">+</text>' +
    '<text x="130" y="245" text-anchor="middle">' + etiquettes.e1 + "</text>" +
    '<text x="570" y="245" text-anchor="middle">' + etiquettes.e2 + "</text>" +
    '<text x="152" y="145">' + etiquettes.r1 + "</text>" +
    '<text x="548" y="145" text-anchor="end">' + etiquettes.r2 + "</text>" +
    '<text x="328" y="195" text-anchor="end">' + etiquettes.r3 + "</text>" +
    '<text x="205" y="60" text-anchor="middle">' + etiquettes.i1 + "</text>" +
    '<text x="495" y="60" text-anchor="middle">' + etiquettes.i2 + "</text>" +
    '<text x="336" y="120" text-anchor="end">' + etiquettes.i3 + "</text>" +
    '<text x="410" y="196" fill="var(--serie-2)">' + etiquettes.va + "</text>" +
    '<text x="350" y="54" text-anchor="middle" font-weight="600">A</text><text x="366" y="312" font-weight="600">B</text>' +
    '<text x="350" y="384" text-anchor="middle">' + (etiquettes.bas || "") + "</text></g>"
  );
}

function construireExercices(racine, api) {
  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-1",
      titre: "Courant inconnu à un nœud",
      niveau: "fondamental",
      enonce:
        "<p>Quatre branches aboutissent à un nœud. $I_1 = 3\\ \\mathrm{A}$ et $I_3 = 1{,}5\\ \\mathrm{A}$ sont repérés entrants, $I_2 = 5\\ \\mathrm{A}$ et $I_4$ sont repérés sortants. Que vaut $I_4$, en ampères, et dans quel sens circule-t-il réellement ?</p>",
      valeur: -0.5,
      unite: "A",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "I4 (référence sortante)",
      etapes: [
        { texte: "Loi des nœuds : somme des entrants égale somme des sortants, $I_1 + I_3 = I_2 + I_4$." },
        { texte: "$I_4 = I_1 + I_3 - I_2 = 3 + 1{,}5 - 5 = -0{,}5\\ \\mathrm{A}$." },
        { texte: "Le signe moins indique que $0{,}5\\ \\mathrm{A}$ entrent réellement par la branche 4, à l'opposé de sa flèche.", note: "On ne corrige pas la flèche : on interprète le signe." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 300",
          "<defs>" + marqueur("fl-k1") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M60 150H500"/><path d="M280 20V280"/></g>' +
            '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round">' +
            '<path d="M90 150H170" marker-end="url(#fl-k1)"/><path d="M280 110V50" marker-end="url(#fl-k1)"/>' +
            '<path d="M470 150H390" marker-end="url(#fl-k1)"/><path d="M280 262V200" marker-end="url(#fl-k1)"/></g>' +
            '<circle cx="280" cy="150" r="7" fill="currentColor"/>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<text x="130" y="138" text-anchor="middle">I1 = 3 A</text><text x="294" y="76">I2 = 5 A sortant</text>' +
            '<text x="430" y="138" text-anchor="middle">I3 = 1,5 A</text>' +
            '<text x="294" y="236">0,5 A entrant réellement</text><text x="294" y="254" font-size="11.5">(I4 = - 0,5 A)</text>' +
            '<text x="280" y="296" text-anchor="middle" font-weight="600">entrant réel : 3 + 1,5 + 0,5 = 5 A = sortant réel</text></g>',
          "Nœud avec les courants réels : 3, 1,5 et 0,5 ampère entrants, 5 ampères sortants"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-2",
      titre: "Tension inconnue dans une maille",
      niveau: "fondamental",
      enonce:
        "<p>On parcourt une maille dans le sens horaire. On traverse successivement une source $E_1 = 24\\ \\mathrm{V}$ de sa borne $-$ vers sa borne $+$, une résistance $R_1$ dans laquelle le potentiel baisse de $6\\ \\mathrm{V}$, une source $E_2 = 9\\ \\mathrm{V}$ de sa borne $+$ vers sa borne $-$, puis une résistance $R_2$. De combien le potentiel baisse-t-il dans $R_2$, en volts ?</p>",
      valeur: 9,
      unite: "V",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Baisse de potentiel dans R2",
      etapes: [
        { texte: "Loi des mailles : la somme des variations de potentiel sur le tour est nulle, $+24 - 6 - 9 - \\Delta V_{R_2} = 0$." },
        { texte: "$\\Delta V_{R_2} = 24 - 6 - 9 = 9\\ \\mathrm{V}$." },
        { texte: "La baisse étant positive, le courant circule dans $R_2$ dans le sens de parcours.", note: "Le profil de potentiel ci-dessous montre les quatre paliers et le retour à 0 V." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 250",
          '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.7"><path d="M60 210H520"/><path d="M60 220V20"/></g>' +
            '<g stroke="currentColor" stroke-width="3" fill="none" stroke-linejoin="round">' +
            '<path d="M60 210H90L150 50H200L260 90H310L370 150H400L460 210H520"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
            '<text x="120" y="236" text-anchor="middle">E1 : + 24</text><text x="230" y="236" text-anchor="middle">R1 : - 6</text>' +
            '<text x="340" y="236" text-anchor="middle">E2 : - 9</text><text x="430" y="236" text-anchor="middle">R2 : - 9</text>' +
            '<text x="210" y="42">24 V</text><text x="316" y="84">18 V</text><text x="406" y="144">9 V</text><text x="480" y="202">0 V</text>' +
            '<text x="70" y="24">potentiel</text></g>',
          "Profil de potentiel le long de la maille : montée de 24 volts, puis baisses de 6, 9 et 9 volts jusqu'à 0"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-1",
      titre: "Méthode des nœuds sur un circuit à deux sources",
      niveau: "intermédiaire",
      enonce:
        "<p>Dans la topologie du schéma principal (section F), on a $E_1 = 12\\ \\mathrm{V}$, $R_1 = 4\\ \\Omega$, $E_2 = 6\\ \\mathrm{V}$, $R_2 = 6\\ \\Omega$ et $R_3 = 12\\ \\Omega$. Choisissez la méthode la plus économique et calculez $V_A$, en volts.</p>",
      valeur: 8,
      unite: "V",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "V_A",
      etapes: [
        { texte: "Choix : $n = 2$, donc une seule équation aux nœuds contre deux aux mailles ; méthode des nœuds, théorème de Millman." },
        { texte: "$V_A = \\dfrac{12/4 + 6/6 + 0/12}{1/4 + 1/6 + 1/12} = \\dfrac{3 + 1}{0{,}5} = 8\\ \\mathrm{V}$." },
        { texte: "Courants : $I_1 = (12 - 8)/4 = 1\\ \\mathrm{A}$, $I_2 = (6 - 8)/6 = -0{,}333\\ \\mathrm{A}$, $I_3 = 8/12 = 0{,}667\\ \\mathrm{A}$." },
        { texte: "Contrôle : $I_1 + I_2 = 1 - 0{,}333 = 0{,}667\\ \\mathrm{A} = I_3$.", note: "$V_A$ est bien compris entre $E_2 = 6\\ \\mathrm{V}$ et $E_1 = 12\\ \\mathrm{V}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 700 400",
          circuitAnnote("fl-k3", {
            e1: "12 V",
            e2: "6 V",
            r1: "4 Ω",
            r2: "6 Ω",
            r3: "12 Ω",
            i1: "I1 = 1 A",
            i2: "I2 = - 0,333 A",
            i3: "I3 = 0,667 A",
            va: "V_A = 8 V",
            bas: "Millman : V_A = (3 + 1) / 0,5 = 8 V",
          }),
          "Circuit annoté : 12 volts et 4 ohms, 6 volts et 6 ohms, 12 ohms, tension de 8 volts au nœud A"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-2",
      titre: "Méthode des mailles et sens réel",
      niveau: "intermédiaire",
      enonce:
        "<p>Reprenez le circuit de l'exercice précédent et résolvez-le cette fois par la méthode des mailles, avec deux courants de maille orientés dans le sens horaire. Donnez le courant $I_2$ de la source $E_2$, compté de $B$ vers $A$ comme sur le schéma principal, en ampères.</p>",
      valeur: -1 / 3,
      unite: "A",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "I2",
      etapes: [
        { texte: "Système : $(4 + 12)J_1 - 12J_2 = 12$ et $-12J_1 + (6 + 12)J_2 = -6$, soit $16J_1 - 12J_2 = 12$ et $-12J_1 + 18J_2 = -6$." },
        { texte: "$\\Delta = 16 \\times 18 - 144 = 144$ ; $J_1 = (12 \\times 18 - 12 \\times 6)/144 = 144/144 = 1\\ \\mathrm{A}$." },
        { texte: "$J_2 = (16 \\times (-6) + 12 \\times 12)/144 = 48/144 = 0{,}333\\ \\mathrm{A}$." },
        { texte: "$I_2 = -J_2 = -0{,}333\\ \\mathrm{A}$ : la source $E_2$ reçoit du courant par sa borne $+$, elle fonctionne en récepteur.", note: "Deux équations au lieu d'une : la méthode des nœuds était ici plus économique, mais les deux donnent le même résultat." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 700 400",
          circuitAnnote(
            "fl-k4",
            {
              e1: "12 V",
              e2: "6 V",
              r1: "4 Ω",
              r2: "6 Ω",
              r3: "12 Ω",
              i1: "I1 = J1 = 1 A",
              i2: "I2 = - J2",
              i3: "J1 - J2",
              va: "8 V",
              bas: "J1 = 1 A, J2 = 0,333 A, I2 = - 0,333 A",
            },
            '<g stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round">' +
              '<path d="M240 158A38 38 0 1 1 202 196" marker-end="url(#fl-k4)"/><path d="M470 162A34 34 0 1 1 436 196" marker-end="url(#fl-k4)"/></g>' +
              '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5"><text x="240" y="201" text-anchor="middle">J1</text><text x="470" y="201" text-anchor="middle">J2</text></g>'
          ),
          "Circuit annoté avec les courants de maille J1 égal à 1 ampère et J2 égal à 0,333 ampère"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-avance",
      titre: "Charge maximale compatible avec la recharge",
      niveau: "avancé",
      enonce:
        "<p>Dans l'exemple de la section H ($E_1 = 27\\ \\mathrm{V}$, $R_1 = 0{,}5\\ \\Omega$, $E_2 = 24\\ \\mathrm{V}$, $R_2 = 0{,}5\\ \\Omega$), l'exploitant veut ajouter des équipements dans l'armoire sans que la batterie cesse d'être rechargée. Quelle est la plus petite résistance de charge $R_3$, en ohms, pour laquelle la batterie ne débite pas ? Quelle puissance l'armoire absorbe-t-elle alors ?</p>",
      valeur: 4,
      unite: "Ω",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "R3 minimale",
      etapes: [
        { texte: "Traduction de la contrainte : la batterie ne débite pas si $I_2 \\leq 0$, soit $V_A \\geq E_2 = 24\\ \\mathrm{V}$. La frontière est $V_A = 24\\ \\mathrm{V}$." },
        { texte: "Millman : $V_A = \\dfrac{54 + 48}{4 + 1/R_3} = \\dfrac{102}{4 + 1/R_3}$." },
        { texte: "$\\dfrac{102}{4 + 1/R_3} = 24 \\iff 4 + 1/R_3 = 4{,}25 \\iff R_3 = 4\\ \\Omega$." },
        { texte: "À cette frontière, $I_2 = 0$, tout le courant vient du chargeur : $I_1 = I_3 = 24/4 = 6\\ \\mathrm{A}$, et l'armoire absorbe $24^2/4 = 144\\ \\mathrm{W}$." },
        { texte: "Conclusion : $R_3 \\geq 4\\ \\Omega$, soit au plus $144\\ \\mathrm{W}$ ; au-delà, la batterie se décharge lentement même chargeur en marche.", note: "Le modèle suppose $E_2$ constante ; en réalité la f.é.m. d'une batterie chargée dépasse $24\\ \\mathrm{V}$, et le chargeur limite son courant : le résultat est un ordre de grandeur à confirmer avec les données du constructeur." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Courant de la batterie en fonction de la résistance de charge",
          genre: "Correction visuelle",
          xTitre: "R3",
          xUnite: "Ω",
          yTitre: "I2",
          yUnite: "A",
          xMin: 1,
          xMax: 20,
          yMin: -4,
          yMax: 8,
          ratio: 0.45,
          series: [
            { id: "i2", nom: "I2 = (24 - V_A) / 0,5", couleur: "serie-1", fonction: (r) => (24 - 102 / (4 + 1 / r)) / 0.5 },
            { id: "zero", nom: "I2 = 0", couleur: "serie-5", fonction: () => 0 },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 4, 0, "R3 = 4 Ω : I2 = 0");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte("#k-exercices-blocs", {
      id: "k-diagnostic",
      titre: "Écart entre phase et neutre",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Sur un départ monophasé qui alimente une machine, on mesure à la pince ampèremétrique $10{,}0\\ \\mathrm{A}$ sur la phase et $9{,}7\\ \\mathrm{A}$ sur le neutre. En enserrant les deux conducteurs ensemble, la pince indique $0{,}3\\ \\mathrm{A}$. Que concluez-vous, quelle loi le justifie, et quelles actions recommandez-vous ?</p>",
      motsCles: [
        ["noeud", "nœud", "kirchhoff", "conservation", "surface fermee"],
        ["fuite", "defaut", "isolement"],
        ["terre", "masse", "pe", "carcasse"],
        ["differentiel", "consign", "mesure d'isolement", "megohm", "controle", "verifier"],
      ],
      minimum: 3,
      exemple: "Appliquez la loi des nœuds à une surface fermée autour de la machine, puis proposez une action.",
      etapes: [
        { texte: "Loi des nœuds sur une surface fermée entourant la machine : tout courant entrant doit ressortir. Ici, $10{,}0 - 9{,}7 = 0{,}3\\ \\mathrm{A}$ ne revient pas par le neutre." },
        { texte: "Ces $0{,}3\\ \\mathrm{A}$ quittent la machine par un autre chemin, en général le conducteur de protection ou la terre : c'est un courant de fuite, signe d'un défaut d'isolement ou de fuites capacitives importantes." },
        { texte: "$300\\ \\mathrm{mA}$ est dix fois la sensibilité d'un différentiel de $30\\ \\mathrm{mA}$ : si le départ en est équipé et n'a pas déclenché, il faut vérifier le différentiel lui-même." },
        { texte: "Actions : consigner le départ, mesurer l'isolement de la machine et de son câble, rechercher l'origine (humidité, câble blessé, filtre défectueux), tester le différentiel.", note: "La pince enserrant les deux conducteurs réalise exactement la mesure du tore d'un différentiel." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 620 260",
          "<defs>" + marqueur("fl-k6") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M30 80H430"/><path d="M30 150H430"/><rect x="430" y="50" width="120" height="130" rx="6"/><path d="M490 180V226"/><path d="M474 226H506M480 233H500M486 240H494"/></g>' +
            '<ellipse cx="190" cy="115" rx="26" ry="62" fill="var(--serie-1)" fill-opacity="0.25" stroke="currentColor" stroke-width="2.2"/>' +
            '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M290 80H370" marker-end="url(#fl-k6)"/><path d="M370 150H290" marker-end="url(#fl-k6)"/><path d="M520 186V216" marker-end="url(#fl-k6)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
            '<text x="40" y="70">phase</text><text x="40" y="140">neutre</text>' +
            '<text x="330" y="70" text-anchor="middle">10,0 A</text><text x="330" y="140" text-anchor="middle">9,7 A</text>' +
            '<text x="190" y="200" text-anchor="middle">pince : 0,3 A</text>' +
            '<text x="490" y="120" text-anchor="middle">machine</text><text x="530" y="208">0,3 A vers la terre</text></g>',
          "Pince enserrant phase et neutre : 10 ampères aller, 9,7 ampères retour, 0,3 ampère de fuite vers la terre"
        );
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte("#k-exercices-blocs", {
      id: "k-conceptuel",
      titre: "Quand la loi des mailles cesse d'être exacte",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez sur quoi repose la loi des mailles, et dans quelle situation la somme des tensions mesurées le long d'une boucle fermée peut ne pas être nulle.</p>",
      motsCles: [
        ["potentiel", "difference de potentiel", "conservatif"],
        ["flux", "induction", "faraday", "champ magnetique"],
        ["variable", "varie", "alternatif", "frequence", "haute frequence"],
      ],
      minimum: 2,
      exemple: "Reliez tension, potentiel, puis ce qui peut empêcher le potentiel d'être défini.",
      etapes: [
        { texte: "Chaque tension est une différence de potentiels ; sur un tour fermé, la somme des différences est télescopique et vaut zéro. La loi repose donc sur l'existence d'un potentiel unique en chaque point." },
        { texte: "Ce potentiel existe si le champ électrique est conservatif le long du chemin, ce qui est faux lorsqu'un flux magnétique variable traverse la boucle : la loi de Faraday donne alors $\\sum u = -\\mathrm{d}\\Phi/\\mathrm{d}t$." },
        { texte: "Elle cesse aussi d'être exacte quand les dimensions du circuit approchent la longueur d'onde, hors de l'approximation des régimes quasi stationnaires.", note: "Les modèles de circuits rangent le flux dans les inductances, qui deviennent des dipôles, et la loi redevient exacte à l'extérieur." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 260",
                      '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"><rect x="120" y="50" width="320" height="160" rx="10"/></g>' +
            '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8">' +
            '<circle cx="230" cy="130" r="10"/><circle cx="280" cy="130" r="10"/><circle cx="330" cy="130" r="10"/>' +
            '<path d="M223 123 237 137M237 123 223 137M273 123 287 137M287 123 273 137M323 123 337 137M337 123 323 137"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<text x="280" y="176" text-anchor="middle">flux Φ(t) variable à travers la boucle</text>' +
            '<text x="280" y="36" text-anchor="middle">boucle de fils de mesure</text>' +
            '<text x="280" y="240" text-anchor="middle" font-weight="600">somme des tensions = - dΦ/dt, non nulle</text></g>',
          "Boucle traversée par un flux magnétique variable : la somme des tensions vaut moins la dérivée du flux"
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

/* Maille à quatre dipôles pour la question d'interprétation de schéma. */
const DESSIN_MAILLE_QUIZ =
  "<defs>" + marqueur("fl-l-q") + marqueur("fl-l-q-u", "var(--serie-2)") + "</defs>" +
  '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
  '<path d="M90 50H180"/><rect x="180" y="38" width="80" height="24" rx="3"/><path d="M260 50H370V100"/>' +
  '<rect x="358" y="100" width="24" height="80" rx="3"/><path d="M370 180V230H260"/>' +
  '<rect x="180" y="218" width="80" height="24" rx="3"/><path d="M180 230H90V165"/>' +
  '<rect x="78" y="85" width="24" height="80" rx="3"/><path d="M90 85V50"/></g>' +
  '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round">' +
  '<path d="M50 160V92" marker-end="url(#fl-l-q-u)"/>' +
  '<path d="M185 18H255" marker-end="url(#fl-l-q-u)"/>' +
  '<path d="M410 175V107" marker-end="url(#fl-l-q-u)"/>' +
  '<path d="M255 268H185" marker-end="url(#fl-l-q-u)"/></g>' +
  '<g stroke="currentColor" stroke-width="1.6" fill="none"><path d="M240 110A30 30 0 1 1 210 140" marker-end="url(#fl-l-q)"/></g>' +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
  '<text x="90" y="129" text-anchor="middle">A</text><text x="220" y="55" text-anchor="middle">B</text>' +
  '<text x="370" y="144" text-anchor="middle">C</text><text x="220" y="235" text-anchor="middle">D</text>' +
  '<text x="240" y="145" text-anchor="middle" font-size="11">sens</text></g>';

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Un circuit connexe comporte $n = 4$ nœuds et $b = 7$ branches. Combien d'équations aux mailles indépendantes faut-il écrire ?</p>",
        options: ["3", "4", "6", "7"],
        bonnes: [1],
        explication: "$m = b - n + 1 = 7 - 4 + 1 = 4$. Avec les $n - 1 = 3$ équations aux nœuds, on obtient bien 7 équations pour 7 courants.",
        resume: "Nombre de mailles indépendantes",
      },
      {
        type: "vraiFaux",
        enonce: "<p>La loi des nœuds exprime la conservation de l'énergie.</p>",
        reponse: false,
        explication: "Elle exprime la conservation de la charge. C'est la combinaison des deux lois de Kirchhoff qui conduit au bilan de puissance, par le théorème de Tellegen.",
        resume: "Origine de la loi des nœuds",
      },
      {
        type: "calcul",
        enonce: "<p>À un nœud arrivent $2\\ \\mathrm{A}$ et $3{,}5\\ \\mathrm{A}$ ; en repart $1{,}2\\ \\mathrm{A}$ par une troisième branche. Quel courant repart par la quatrième branche, en ampères ?</p>",
        valeur: 4.3,
        unite: "A",
        chiffres: 2,
        explication: "$2 + 3{,}5 = 1{,}2 + I$, donc $I = 4{,}3\\ \\mathrm{A}$.",
        resume: "Loi des nœuds",
      },
      {
        type: "courte",
        enonce: "<p>Que signifie un courant de branche calculé négatif ?</p>",
        motsCles: [["sens", "direction"], ["oppose", "inverse", "contraire", "fleche", "reference"]],
        minimum: 2,
        explication: "Le courant réel circule dans le sens opposé à la flèche de référence choisie. Ce n'est pas une erreur, et l'on ne modifie pas la flèche après coup.",
        resume: "Courant négatif",
      },
      {
        type: "calcul",
        enonce: "<p>Une maille comporte une source de $12\\ \\mathrm{V}$ et trois résistances en série. Les chutes de tension dans deux d'entre elles valent $4{,}5\\ \\mathrm{V}$ et $2{,}5\\ \\mathrm{V}$. Quelle est la chute dans la troisième, en volts ?</p>",
        valeur: 5,
        unite: "V",
        chiffres: 1,
        explication: "$12 - 4{,}5 - 2{,}5 - U_3 = 0$, donc $U_3 = 5\\ \\mathrm{V}$.",
        resume: "Loi des mailles",
      },
      {
        type: "qcm",
        enonce: "<p>Cinq branches, chacune formée d'une source et d'une résistance, sont toutes reliées entre les deux mêmes nœuds. Quelle méthode demande le moins d'équations ?</p>",
        options: ["La méthode des mailles", "La méthode des nœuds", "La méthode directe", "Elles demandent toutes le même nombre d'équations"],
        bonnes: [1],
        explication: "$n = 2$ : une seule équation aux nœuds (Millman), contre $b - n + 1 = 4$ aux mailles et 5 par la méthode directe.",
        resume: "Choix de la méthode",
      },
      {
        type: "vraiFaux",
        enonce: "<p>En alternatif, le courant efficace d'arrivée d'un tableau est toujours égal à la somme des courants efficaces de ses départs.</p>",
        reponse: false,
        explication: "La loi des nœuds porte sur les valeurs instantanées ou les phaseurs. La somme des valeurs efficaces n'est qu'un majorant, atteint seulement si tous les courants sont en phase.",
        resume: "Valeurs efficaces et loi des nœuds",
      },
      {
        type: "calcul",
        enonce: "<p>Un nœud $A$ est relié à la référence par une branche formée d'une source de $12\\ \\mathrm{V}$ en série avec $3\\ \\Omega$, et par une résistance seule de $6\\ \\Omega$. Que vaut $V_A$, en volts ?</p>",
        valeur: 8,
        unite: "V",
        chiffres: 1,
        explication: "Millman : $V_A = (12/3 + 0/6)/(1/3 + 1/6) = 4/0{,}5 = 8\\ \\mathrm{V}$, ce qui est aussi le diviseur de tension $12 \\times 6/9$.",
        resume: "Théorème de Millman",
      },
      {
        type: "schema",
        enonce: "<p>La maille est parcourue dans le sens horaire. Les flèches fines placées à l'extérieur sont les tensions des dipôles A, B, C et D. Quel dipôle voit sa tension comptée avec un signe moins dans la loi des mailles ?</p>",
        consigne: "Cliquez sur l'étiquette du dipôle correspondant.",
        viewBox: "0 0 460 290",
        dessin: DESSIN_MAILLE_QUIZ,
        zones: [
          { x: 60, y: 105, largeur: 60, hauteur: 44, etiquette: "dipôle A" },
          { x: 190, y: 30, largeur: 60, hauteur: 44, etiquette: "dipôle B" },
          { x: 340, y: 120, largeur: 60, hauteur: 44, etiquette: "dipôle C", juste: true },
          { x: 190, y: 210, largeur: 60, hauteur: 44, etiquette: "dipôle D" },
        ],
        explication: "Le parcours horaire monte à gauche, va vers la droite en haut, descend à droite et va vers la gauche en bas. Les flèches de A (vers le haut), B (vers la droite) et D (vers la gauche) sont dans le sens de parcours ; celle de C monte alors que le parcours descend : $u_A + u_B - u_C + u_D = 0$.",
        resume: "Signes dans une maille",
      },
      {
        type: "courte",
        enonce: "<p>En une phrase, pourquoi un disjoncteur différentiel détecte-t-il une fuite à la terre ?</p>",
        motsCles: [["somme", "difference", "compare", "noeud", "nœud"], ["fuite", "terre", "ne revient pas", "defaut"]],
        minimum: 2,
        explication: "Son tore mesure la somme algébrique des courants des conducteurs actifs ; d'après la loi des nœuds, elle n'est non nulle que si une partie du courant revient par un autre chemin, la terre.",
        resume: "Principe du différentiel",
      },
    ],
    { titre: "Dix questions sur les lois de Kirchhoff" }
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
      { categorie: "Loi", question: "Qu'exprime la loi des nœuds, et sur quelle loi physique repose-t-elle ?", reponse: "La somme algébrique des courants qui arrivent à un nœud est nulle ; elle traduit la conservation de la charge, un nœud n'accumulant pas de charge." },
      { categorie: "Loi", question: "Qu'exprime la loi des mailles, et sur quoi repose-t-elle ?", reponse: "La somme algébrique des tensions le long d'une boucle fermée est nulle ; elle traduit l'existence d'un potentiel unique en chaque point." },
      { categorie: "Hypothèse", question: "Quelle approximation commune aux deux lois faut-il garder en tête ?", reponse: "L'approximation des régimes quasi stationnaires : circuit petit devant la longueur d'onde, pas de flux magnétique variable hors des composants." },
      { categorie: "Topologie", question: "Combien d'équations indépendantes fournit un circuit de $n$ nœuds et $b$ branches ?", reponse: "$n - 1$ aux nœuds et $b - n + 1$ aux mailles, soit $b$ au total." },
      { categorie: "Signes", question: "Quel terme écrire pour une résistance parcourue dans le sens de son courant de référence ?", reponse: "$-Ri$ : le potentiel baisse dans le sens du courant. À contre-courant, $+Ri$." },
      { categorie: "Signes", question: "Que signifie un courant calculé négatif ?", reponse: "Le courant réel circule à l'opposé de la flèche de référence ; ce n'est pas une erreur." },
      { categorie: "Méthode", question: "Quand préférer la méthode des nœuds ?", reponse: "Quand $n - 1 < b - n + 1$, avec des sources de courant, ou pour un calcul par logiciel ; c'est la méthode de SPICE." },
      { categorie: "Formule", question: "Énoncez le théorème de Millman.", reponse: "$V_A = \\left(\\sum E_k/R_k\\right)/\\left(\\sum 1/R_k\\right)$ pour des branches reliant $A$ à la référence." },
      { categorie: "Contrôle", question: "Comment vérifier une résolution complète ?", reponse: "Loi des nœuds avec les valeurs trouvées, maille non utilisée, et bilan de puissance fournie égale puissance reçue." },
      {
        categorie: "Industriel",
        question: "Quel appareil matérialise la loi des nœuds généralisée ?",
        reponse: "Le disjoncteur différentiel : son tore mesure la somme des courants actifs, non nulle en cas de fuite à la terre.",
        rappel: "En alternatif, la loi porte sur les valeurs instantanées, pas sur les valeurs efficaces.",
      },
    ],
    { titre: "Dix cartes sur les lois de Kirchhoff" }
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
        enonce: "<p>Trois courants arrivent à un nœud : $I_1 = 4\\ \\mathrm{A}$, $I_2 = -1{,}5\\ \\mathrm{A}$ et $I_3$, tous repérés entrants. Que vaut $I_3$, en ampères ?</p>",
        valeur: -2.5,
        unite: "A",
        chiffres: 2,
        explication: "$4 - 1{,}5 + I_3 = 0$, donc $I_3 = -2{,}5\\ \\mathrm{A}$ : $2{,}5\\ \\mathrm{A}$ sortent réellement par cette branche.",
        resume: "Loi des nœuds (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>La loi des mailles reste exacte pour une boucle de fils traversée par un flux magnétique variable.</p>",
        reponse: false,
        explication: "La somme des tensions vaut alors $-\\mathrm{d}\\Phi/\\mathrm{d}t$ : le champ n'est plus conservatif et le potentiel n'est plus défini de façon unique.",
        resume: "Limite de la loi des mailles (cette séance)",
      },
      {
        type: "qcm",
        enonce: "<p>Pourquoi n'écrit-on que $n - 1$ lois des nœuds pour un circuit de $n$ nœuds ?</p>",
        options: [
          { texte: "Parce que la somme des $n$ équations est une identité : l'une d'elles est redondante.", juste: true },
          { texte: "Parce que le nœud de référence ne reçoit aucun courant." },
          { texte: "Parce que la loi des nœuds est fausse au nœud de référence." },
          { texte: "Par convention, sans raison mathématique." },
        ],
        explication: "Chaque courant de branche apparaît une fois entrant et une fois sortant dans l'ensemble des équations ; leur somme donne $0 = 0$.",
        resume: "Équations indépendantes (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Un conducteur de cuivre vaut $0{,}50\\ \\Omega$ à 20 °C. Que vaut sa résistance à 70 °C, en ohms ($\\alpha_{20} = 3{,}93 \\times 10^{-3}\\ \\mathrm{K^{-1}}$) ?</p>",
        valeur: 0.5 * (1 + 3.93e-3 * 50),
        unite: "Ω",
        tolerance: 0.02,
        chiffres: 3,
        explication: "$R = 0{,}50 \\times (1 + 3{,}93 \\times 10^{-3} \\times 50) = 0{,}598\\ \\Omega$, révisé du cours Loi d'Ohm et résistivité.",
        resume: "Correction de température (cours précédent)",
      },
      {
        type: "qcm",
        enonce: "<p>Un câble de résistance $R_c$ alimente une charge qui appelle le courant $I$ sous la tension de réseau $U$. Quelle expression donne les pertes dans le câble ?</p>",
        options: ["$U^2/R_c$", "$R_c\\,I^2$", "$U\\,I$", "$U\\,I - R_c\\,I^2$"],
        bonnes: [1],
        explication: "Le courant est imposé par la charge : les pertes valent $R_c I^2$. Cette séance le justifie par la loi des nœuds : le même courant traverse le câble et la charge.",
        resume: "Pertes dans un câble (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Un courant constant de $2\\ \\mathrm{A}$ circule pendant $30\\ \\mathrm{min}$. Quelle charge a traversé une section du conducteur, en coulombs ?</p>",
        valeur: 3600,
        unite: "C",
        chiffres: 0,
        explication: "$Q = I\\,t = 2 \\times 1800 = 3600\\ \\mathrm{C}$, révisé du cours Tension, courant, charge et puissance ; c'est cette charge que la loi des nœuds conserve.",
        resume: "Charge et courant (Tension, courant, charge et puissance)",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est le module du nombre complexe $3 + 4j$ ?</p>",
        valeur: 5,
        chiffres: 1,
        explication: "$|3 + 4j| = \\sqrt{9 + 16} = 5$, révisé du cours Diagnostic initial et remise à niveau mathématique ; il servira à appliquer les lois de Kirchhoff aux phaseurs.",
        resume: "Nombres complexes (cours le plus ancien)",
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
    titre: "Où en suis-je sur les lois de Kirchhoff ?",
  });
  if (auto) ressources.push(auto);
}
