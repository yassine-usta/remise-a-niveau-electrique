/* ==========================================================================
   cours/associations-de-resistances-et-diviseurs/cours.js
   Associations de résistances et diviseurs.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";

/* Données de l'exemple de la section H : rapport 1/3 sous 30 V. */
const CONCEPTION = { e: 30, k: 1 / 3 };

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

function parallele(...resistances) {
  let somme = 0;
  for (const r of resistances) {
    if (r === 0) return 0;
    if (Number.isFinite(r)) somme += 1 / r;
  }
  return somme === 0 ? Infinity : 1 / somme;
}

/** Marqueur de flèche, défini une fois par schéma. */
function marqueur(id, remplissage) {
  return (
    '<marker id="' + id + '" markerWidth="9" markerHeight="9" refX="6" refY="4" orient="auto">' +
    '<path d="M0 0 8 4 0 8Z" fill="' + (remplissage || "currentColor") + '"/></marker>'
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
    c.textAlign = px > repere.boite.x + repere.boite.l * 0.6 ? "right" : "left";
    c.fillText(texte, px + (c.textAlign === "right" ? -8 : 8), py - 8);
  }
  c.restore();
}

/** Ligne horizontale en tirets sur un tracé, avec son libellé. */
function ligneHorizontale(c, repere, couleurs, y, texte) {
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
    c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
    c.textAlign = "right";
    c.fillText(texte, repere.boite.x + repere.boite.l - 4, py - 6);
  }
  c.restore();
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

function pointSurPolyligne(trajet, s) {
  let reste = ((s % trajet.total) + trajet.total) % trajet.total;
  for (let k = 0; k < trajet.longueurs.length; k += 1) {
    if (reste <= trajet.longueurs[k] || k === trajet.longueurs.length - 1) {
      const t = trajet.longueurs[k] === 0 ? 0 : Math.min(1, reste / trajet.longueurs[k]);
      const p0 = trajet.points[k];
      const p1 = trajet.points[k + 1];
      return { x: p0[0] + (p1[0] - p0[0]) * t, y: p0[1] + (p1[1] - p0[1]) * t };
    }
    reste -= trajet.longueurs[k];
  }
  return { x: trajet.points[0][0], y: trajet.points[0][1] };
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
  construireAssociation(racine, api);
  construireReduction(racine, api);
  construirePotentiometre(racine, api);
  construireConception(racine, api);
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
    "#d-pente-figure svg",
    "#e-serie-figure svg",
    "#e-parallele-figure svg",
    "#e-diviseur-tension-figure svg",
    "#e-diviseur-courant-figure svg",
    "#f-schema-principal svg",
    "#h-schema-figure svg",
    "#i-bus-figure svg",
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
      id: "c-ohm",
      titre: "Loi d'Ohm et préfixes",
      niveau: "diagnostic",
      enonce: "<p>Une résistance de $470\\ \\Omega$ est soumise à $12\\ \\mathrm{V}$. Quel courant la traverse, en milliampères ?</p>",
      valeur: 12 / 470 * 1000,
      unite: "mA",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "I",
      etapes: [
        { texte: "$I = U/R = 12/470$." },
        { texte: "$I = 0{,}02553\\ \\mathrm{A} = 25{,}5\\ \\mathrm{mA}$.", note: "Contrôle rapide : $12\\ \\mathrm{V}/0{,}47\\ \\mathrm{k\\Omega} \\approx 25\\ \\mathrm{mA}$, car des volts divisés par des kilohms donnent des milliampères." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Caractéristique de la résistance de 470 ohms",
          genre: "Correction visuelle",
          xTitre: "U",
          xUnite: "V",
          yTitre: "I",
          yUnite: "mA",
          xMin: 0,
          xMax: 15,
          yMin: 0,
          yMax: 32,
          ratio: 0.42,
          series: [{ id: "ohm", nom: "I = U / 470", couleur: "serie-1", fonction: (u) => (u / 470) * 1000 }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 12, (12 / 470) * 1000, "12 V ; 25,5 mA");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-maille",
      titre: "Loi des mailles dans une chaîne",
      niveau: "diagnostic",
      enonce: "<p>Deux résistances en série sont alimentées sous $24\\ \\mathrm{V}$. On mesure $9\\ \\mathrm{V}$ aux bornes de la première. Quelle tension règne aux bornes de la seconde, en volts ?</p>",
      valeur: 15,
      unite: "V",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "U2",
      etapes: [
        { texte: "Loi des mailles : $24 - U_1 - U_2 = 0$." },
        { texte: "$U_2 = 24 - 9 = 15\\ \\mathrm{V}$.", note: "C'est déjà un diviseur de tension : la seconde résistance vaut $15/9 \\approx 1{,}67$ fois la première." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 190",
          "<defs>" + marqueur("fl-c2-u", "var(--serie-2)") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M40 90H120"/><rect x="120" y="76" width="130" height="28" rx="3"/><path d="M250 90H300"/><rect x="300" y="76" width="200" height="28" rx="3"/><path d="M500 90H530"/></g>' +
            '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M245 50H125" marker-end="url(#fl-c2-u)"/><path d="M495 50H305" marker-end="url(#fl-c2-u)"/><path d="M525 150H45" marker-end="url(#fl-c2-u)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<text x="185" y="95" text-anchor="middle">R1</text><text x="400" y="95" text-anchor="middle">R2</text>' +
            '<text x="185" y="38" text-anchor="middle">U1 = 9 V</text><text x="400" y="38" text-anchor="middle" font-weight="600">U2 = 24 - 9 = 15 V</text>' +
            '<text x="285" y="176" text-anchor="middle">tension totale 24 V</text></g>',
          "Deux résistances en série sous 24 volts : 9 volts sur la première, 15 volts sur la seconde"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-inverse",
      titre: "Inverse d'une somme d'inverses",
      niveau: "diagnostic",
      enonce: "<p>Calculez $\\dfrac{1}{1/6 + 1/3}$.</p>",
      valeur: 2,
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Résultat",
      etapes: [
        { texte: "$1/6 + 1/3 = 1/6 + 2/6 = 3/6 = 1/2$." },
        { texte: "L'inverse de $1/2$ vaut $2$. Par la forme produit sur somme : $6 \\times 3/(6 + 3) = 18/9 = 2$.", note: "C'est exactement la résistance équivalente de $6\\ \\Omega$ en parallèle avec $3\\ \\Omega$ : elle est plus petite que la plus petite des deux." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 170",
          '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.7"><path d="M60 120H520"/></g>' +
            '<g stroke="currentColor" stroke-width="10" fill="none" stroke-linecap="butt">' +
            '<path d="M60 60H147" opacity="0.55"/><path d="M60 80H233" opacity="0.8"/><path d="M60 100H320"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
            '<text x="160" y="64">1/6 = 0,167 S (6 Ω)</text><text x="246" y="84">1/3 = 0,333 S (3 Ω)</text>' +
            '<text x="332" y="104" font-weight="600">somme 0,5 S, soit 2 Ω</text>' +
            '<text x="290" y="150" text-anchor="middle">les conductances, longueurs des barres, s\'additionnent</text></g>',
          "Barres de conductance : un sixième et un tiers de siemens s'additionnent en un demi-siemens, soit 2 ohms"
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Simulation : série ou parallèle
   -------------------------------------------------------------------------- */

const NOMS_MODES = ["en série", "en parallèle"];

function construireAssociation(racine, api) {
  const conteneur = racine.querySelector("#d-association");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 640 390",
    role: "img",
    "aria-label": "Source de tension alimentant deux résistances en série ou en parallèle, avec des porteurs animés dont la vitesse suit le courant",
  });
  const fond = svgEl("g");
  const groupeDisques = svgEl("g", { stroke: "currentColor", "stroke-width": 0.8 });
  const dynamiques = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  svg.append(fond, groupeDisques, dynamiques);
  conteneur.appendChild(svg);

  const etat = { mode: 0, u: 12, r1: 100, r2: 300, t: 0 };
  let trajets = [];
  let disques = [];
  let courants = [];
  const textes = {};

  const valeurs = api.sim.valeurs("#d-association-valeurs", [
    { id: "req", libelle: "Résistance équivalente vue par la source", unite: "Ω", decimales: 1 },
    { id: "i", libelle: "Courant I fourni par la source", unite: "mA", decimales: 1 },
    { id: "u1", libelle: "Tension U1 aux bornes de R1", unite: "V", decimales: 2 },
    { id: "u2", libelle: "Tension U2 aux bornes de R2", unite: "V", decimales: 2 },
    { id: "i1", libelle: "Courant I1 dans R1", unite: "mA", decimales: 1 },
    { id: "i2", libelle: "Courant I2 dans R2", unite: "mA", decimales: 1 },
    { id: "p1", libelle: "Puissance dissipée par R1", unite: "mW", decimales: 1 },
    { id: "p2", libelle: "Puissance dissipée par R2", unite: "mW", decimales: 1 },
    { id: "ps", libelle: "Puissance fournie par la source", unite: "mW", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessinerFond() {
    const serie = etat.mode === 0;
    const commun =
      "<defs>" + marqueur("fl-d-assoc") + marqueur("fl-d-assoc-u", "var(--serie-2)") + "</defs>" +
      '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
      '<path d="M100 330V236"/><circle cx="100" cy="210" r="26"/>' +
      '<path d="M310 330V344M296 344H324M302 351H318M307 358H313"/>';
    let traits;
    let fleches;
    if (serie) {
      traits =
        '<path d="M100 184V80H260"/><rect x="260" y="66" width="120" height="28" rx="3"/>' +
        '<path d="M380 80H520V150"/><rect x="506" y="150" width="28" height="100" rx="3"/><path d="M520 250V330H100"/></g>';
      fleches =
        '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M160 80H220" marker-end="url(#fl-d-assoc)"/>' +
        '<path d="M520 104V136" marker-end="url(#fl-d-assoc)"/></g>' +
        '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M375 44H265" marker-end="url(#fl-d-assoc-u)"/>' +
        '<path d="M575 245V155" marker-end="url(#fl-d-assoc-u)"/></g>';
      trajets = [preparerPolyligne([[100, 330], [100, 80], [520, 80], [520, 330], [100, 330]])];
    } else {
      traits =
        '<path d="M100 184V80H520V150"/><path d="M320 80V150"/><rect x="306" y="150" width="28" height="100" rx="3"/>' +
        '<path d="M320 250V330"/><rect x="506" y="150" width="28" height="100" rx="3"/><path d="M520 250V330H100"/></g>' +
        '<g fill="currentColor" stroke="none"><circle cx="320" cy="80" r="5"/><circle cx="320" cy="330" r="5"/></g>';
      fleches =
        '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M160 80H220" marker-end="url(#fl-d-assoc)"/>' +
        '<path d="M320 100V136" marker-end="url(#fl-d-assoc)"/><path d="M520 100V136" marker-end="url(#fl-d-assoc)"/></g>' +
        '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M375 245V155" marker-end="url(#fl-d-assoc-u)"/>' +
        '<path d="M575 245V155" marker-end="url(#fl-d-assoc-u)"/></g>';
      trajets = [
        preparerPolyligne([[100, 330], [100, 80], [320, 80], [320, 330], [100, 330]]),
        preparerPolyligne([[100, 330], [100, 80], [520, 80], [520, 330], [100, 330]]),
      ];
    }
    fond.innerHTML =
      commun + traits + fleches +
      '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
      '<text x="74" y="190" text-anchor="end" font-weight="600">+</text><text x="74" y="238" text-anchor="end" font-weight="600">-</text>' +
      '<text x="310" y="382" text-anchor="middle" font-size="11.5">référence 0 V</text>' +
      '<text x="20" y="28" font-weight="600">' + (serie ? "R1 et R2 en série : même courant" : "R1 et R2 en parallèle : même tension") + "</text></g>";

    dynamiques.textContent = "";
    textes.u = texteSvg(62, 215, "", { "text-anchor": "end" });
    textes.i = texteSvg(190, 70, "", { "text-anchor": "middle" });
    if (serie) {
      textes.r1 = texteSvg(320, 116, "", { "text-anchor": "middle" });
      textes.r2 = texteSvg(496, 205, "", { "text-anchor": "end" });
      textes.u1 = texteSvg(320, 36, "", { "text-anchor": "middle", fill: "var(--serie-2)" });
      textes.u2 = texteSvg(585, 270, "", { "text-anchor": "middle", fill: "var(--serie-2)" });
      textes.i1 = texteSvg(536, 126, "");
      textes.i2 = texteSvg(0, 0, "");
    } else {
      textes.r1 = texteSvg(296, 205, "", { "text-anchor": "end" });
      textes.r2 = texteSvg(496, 205, "", { "text-anchor": "end" });
      textes.u1 = texteSvg(375, 270, "", { "text-anchor": "middle", fill: "var(--serie-2)" });
      textes.u2 = texteSvg(585, 270, "", { "text-anchor": "middle", fill: "var(--serie-2)" });
      textes.i1 = texteSvg(334, 122, "");
      textes.i2 = texteSvg(534, 122, "");
    }
    dynamiques.append(textes.u, textes.i, textes.r1, textes.r2, textes.u1, textes.u2, textes.i1, textes.i2);

    groupeDisques.textContent = "";
    disques = trajets.map((trajet, rang) => {
      const liste = [];
      const nombreDisques = Math.max(1, Math.floor(trajet.total / 30));
      trajet.espacement = trajet.total / nombreDisques;
      for (let k = 0; k < nombreDisques; k += 1) {
        const disque = svgEl("circle", { r: 3.8, style: "fill: var(--serie-" + (rang === 0 ? 1 : 4) + ")" });
        groupeDisques.appendChild(disque);
        liste.push(disque);
      }
      return liste;
    });
  }

  function placer(t) {
    etat.t = t;
    trajets.forEach((trajet, rang) => {
      const vitesse = Math.min(420, 300 * courants[rang]);
      disques[rang].forEach((disque, k) => {
        const point = pointSurPolyligne(trajet, k * trajet.espacement + vitesse * t);
        disque.setAttribute("cx", point.x.toFixed(1));
        disque.setAttribute("cy", point.y.toFixed(1));
      });
    });
  }

  function actualiser() {
    const { u, r1, r2 } = etat;
    let req;
    let i1;
    let i2;
    let u1;
    let u2;
    if (etat.mode === 0) {
      req = r1 + r2;
      i1 = u / req;
      i2 = i1;
      u1 = r1 * i1;
      u2 = r2 * i2;
      courants = [i1];
    } else {
      req = parallele(r1, r2);
      u1 = u;
      u2 = u;
      i1 = u / r1;
      i2 = u / r2;
      courants = [i1, i2];
    }
    const i = u / req;
    textes.u.textContent = nombre(api, u, 1) + " V";
    textes.i.textContent = "I = " + nombre(api, i * 1000, 1) + " mA";
    textes.r1.textContent = "R1 = " + nombre(api, r1, 0) + " Ω";
    textes.r2.textContent = "R2 = " + nombre(api, r2, 0) + " Ω";
    textes.u1.textContent = "U1 = " + nombre(api, u1, 2) + " V";
    textes.u2.textContent = "U2 = " + nombre(api, u2, 2) + " V";
    if (etat.mode === 0) {
      textes.i1.textContent = "I1 = I2 = I";
      textes.i2.textContent = "";
    } else {
      textes.i1.textContent = "I1 = " + nombre(api, i1 * 1000, 1) + " mA";
      textes.i2.textContent = "I2 = " + nombre(api, i2 * 1000, 1) + " mA";
    }
    if (valeurs) {
      valeurs.maj({
        req,
        i: i * 1000,
        u1,
        u2,
        i1: i1 * 1000,
        i2: i2 * 1000,
        p1: u1 * i1 * 1000,
        p2: u2 * i2 * 1000,
        ps: u * i * 1000,
      });
    }
    placer(etat.t);
  }

  const lecteur = api.sim.lecteur("#d-association-lecteur", {
    de: 0,
    a: 120,
    duree: 120,
    boucle: true,
    auto: false,
    libelle: "Mouvement des charges",
    rappel: (valeur) => placer(valeur),
  });
  if (lecteur) ressources.push(lecteur);

  let modeDessine = -1;
  const curseurs = api.sim.curseurs(
    "#d-association-curseurs",
    [
      { id: "mode", libelle: "Association", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => NOMS_MODES[Math.round(v)] || NOMS_MODES[0] },
      { id: "u", libelle: "Tension de la source U", min: 1, max: 24, pas: 0.5, valeur: 12, unite: "V" },
      { id: "r1", libelle: "Résistance R1", min: 10, max: 1000, pas: 10, valeur: 100, unite: "Ω" },
      { id: "r2", libelle: "Résistance R2", min: 10, max: 1000, pas: 10, valeur: 300, unite: "Ω" },
    ],
    (lues) => {
      etat.mode = Math.round(lues.mode);
      etat.u = lues.u;
      etat.r1 = lues.r1;
      etat.r2 = lues.r2;
      if (etat.mode !== modeDessine) {
        dessinerFond();
        modeDessine = etat.mode;
      }
      actualiser();
    }
  );
  if (curseurs) ressources.push(curseurs);

  if (modeDessine < 0) {
    dessinerFond();
    modeDessine = etat.mode;
    actualiser();
  }
}

/* --------------------------------------------------------------------------
   E. Animation : réduction et remontée d'un réseau
   -------------------------------------------------------------------------- */

const ETAPES_REDUCTION = [
  {
    nom: "réseau de départ",
    operation: "Repérer un groupe réductible : R3 et R4 portent le même courant, sans nœud intermédiaire raccordé ailleurs.",
    resultat: "R3 et R4 sont en série.",
  },
  {
    nom: "R3 + R4",
    operation: "R34 = R3 + R4 = 2 + 4 = 6 Ω. R2 et R34 relient maintenant les deux mêmes nœuds A et B.",
    resultat: "R2 et R34 sont en parallèle.",
  },
  {
    nom: "R2 // R34",
    operation: "Rp = 12 × 6 / (12 + 6) = 4 Ω. Rp est traversée par le même courant que R1.",
    resultat: "R1 et Rp sont en série.",
  },
  {
    nom: "R1 + Rp",
    operation: "Req = R1 + Rp = 4 + 4 = 8 Ω, seule résistance vue par la source.",
    resultat: "I = E / Req = 24 / 8 = 3 A.",
  },
  {
    nom: "remontée : R1 et Rp",
    operation: "Diviseur de tension entre R1 et Rp : U_R1 = 4 × 3 = 12 V, U_AB = 4 × 3 = 12 V.",
    resultat: "Contrôle de maille : 12 + 12 = 24 V.",
  },
  {
    nom: "remontée : branches",
    operation: "Diviseur de courant : I2 = 12 / 12 = 1 A, I34 = 12 / 6 = 2 A ; U3 = 2 × 2 = 4 V, U4 = 4 × 2 = 8 V.",
    resultat: "Contrôles : 1 + 2 = 3 A ; puissances 36 + 12 + 8 + 16 = 72 W = 24 × 3 W.",
  },
];

function dessinReduction(etape) {
  const trait = '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">';
  const epais = '<g stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round">';
  const tirets = '<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-dasharray="6 5" opacity="0.85">';
  const texte = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">';
  const tension = '<g fill="var(--serie-2)" stroke="none" font-family="ui-monospace, monospace" font-size="12">';
  const fleche = '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round">';
  const source =
    trait + '<path d="M80 310V226"/><circle cx="80" cy="200" r="26"/><path d="M80 174V60"/>' +
    '<path d="M190 310V324M176 324H204M182 331H198M187 338H193"/></g>' +
    texte + '<text x="80" y="205" text-anchor="middle">24 V</text><text x="52" y="180" text-anchor="end" font-weight="600">+</text>' +
    '<text x="190" y="354" text-anchor="middle" font-size="11.5">référence 0 V</text></g>';
  const r1 =
    trait + '<path d="M80 60H160"/><rect x="160" y="46" width="100" height="28" rx="3"/><path d="M260 60H340"/></g>' +
    texte + '<text x="210" y="38" text-anchor="middle">R1 = 4 Ω</text></g>';
  const noeuds =
    '<g fill="currentColor" stroke="none"><circle cx="340" cy="60" r="5"/><circle cx="340" cy="310" r="5"/></g>' +
    texte + '<text x="340" y="44" text-anchor="middle" font-weight="600">A</text><text x="354" y="330" font-weight="600">B</text></g>';
  const r2 =
    trait + '<path d="M340 60V135"/><rect x="326" y="135" width="28" height="100" rx="3"/><path d="M340 235V310H80"/></g>' +
    texte + '<text x="318" y="190" text-anchor="end">R2 = 12 Ω</text></g>';
  const brancheDroite = (details) =>
    trait + '<path d="M340 60H540V95"/>' + (details ? '<rect x="526" y="95" width="28" height="70" rx="3"/><path d="M540 165V195"/><rect x="526" y="195" width="28" height="70" rx="3"/><path d="M540 265V310H340"/>' : "") + "</g>";
  const r34Details = texte + '<text x="566" y="135">R3 = 2 Ω</text><text x="566" y="235">R4 = 4 Ω</text></g>';
  const r34 =
    trait + '<path d="M340 60H540V120"/><path d="M540 240V310H340"/></g>' +
    epais + '<rect x="526" y="120" width="28" height="120" rx="3"/></g>' +
    texte + '<text x="566" y="185">R34 = 6 Ω</text></g>';
  const rp =
    trait + '<path d="M340 60V120"/><path d="M340 240V310H80"/></g>' +
    epais + '<rect x="326" y="120" width="28" height="120" rx="3"/></g>' +
    texte + '<text x="366" y="185">Rp = 4 Ω</text></g>';
  const req =
    trait + '<path d="M80 60H340V120"/><path d="M340 240V310H80"/></g>' +
    epais + '<rect x="326" y="120" width="28" height="120" rx="3"/></g>' +
    texte + '<text x="366" y="185">Req = 8 Ω</text></g>' +
    fleche + '<path d="M130 60H200" marker-end="url(#fl-e-red)"/></g>' +
    texte + '<text x="165" y="48" text-anchor="middle" font-weight="600">I = 3 A</text></g>';

  let contenu = "<defs>" + marqueur("fl-e-red") + "</defs>" + source;
  if (etape === 0) {
    contenu += r1 + r2 + brancheDroite(true) + r34Details + noeuds + tirets + '<rect x="506" y="84" width="112" height="192" rx="10"/></g>';
  } else if (etape === 1) {
    contenu += r1 + r2 + r34 + noeuds + tirets + '<rect x="300" y="108" width="330" height="146" rx="12"/></g>';
  } else if (etape === 2) {
    contenu += r1 + rp + noeuds + tirets + '<rect x="146" y="22" width="330" height="236" rx="12"/></g>';
  } else if (etape === 3) {
    contenu += req + noeuds;
  } else if (etape === 4) {
    contenu +=
      r1 + rp + noeuds +
      fleche + '<path d="M100 60H150" marker-end="url(#fl-e-red)"/><path d="M340 84V112" marker-end="url(#fl-e-red)"/></g>' +
      texte + '<text x="100" y="92" font-weight="600">I = 3 A</text></g>' +
      tension + '<text x="210" y="96" text-anchor="middle">U_R1 = 12 V</text><text x="366" y="210">U_AB = 12 V</text></g>';
  } else {
    contenu +=
      r1 + r2 + brancheDroite(true) + r34Details + noeuds +
      fleche + '<path d="M100 60H150" marker-end="url(#fl-e-red)"/><path d="M340 84V120" marker-end="url(#fl-e-red)"/><path d="M540 64V86" marker-end="url(#fl-e-red)"/></g>' +
      texte + '<text x="100" y="92" font-weight="600">I = 3 A</text><text x="318" y="110" text-anchor="end" font-weight="600">I2 = 1 A</text>' +
      '<text x="470" y="84" text-anchor="middle" font-weight="600">I34 = 2 A</text></g>' +
      tension + '<text x="318" y="208" text-anchor="end">U_AB = 12 V</text><text x="566" y="153">U3 = 4 V</text><text x="566" y="253">U4 = 8 V</text>' +
      '<text x="210" y="96" text-anchor="middle">U_R1 = 12 V</text></g>';
  }
  return contenu;
}

function construireReduction(racine, api) {
  const conteneur = racine.querySelector("#e-reduction");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 680 362",
    role: "img",
    "aria-label": "Réduction pas à pas d'un réseau série-parallèle alimenté sous 24 volts, puis remontée vers les courants de branche",
  });
  const groupe = svgEl("g");
  const titre = texteSvg(670, 28, "", { "text-anchor": "end", "font-family": "ui-monospace, monospace", "font-size": 12.5, "font-weight": 600, fill: "currentColor" });
  svg.append(groupe, titre);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-reduction-valeurs", [
    { id: "etape", libelle: "Étape", format: (v) => v },
    { id: "operation", libelle: "Opération", format: (v) => v },
    { id: "resultat", libelle: "Conclusion", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  let etapeCourante = -1;
  function afficher(etape) {
    const rang = Math.max(0, Math.min(ETAPES_REDUCTION.length - 1, Math.floor(etape)));
    if (rang === etapeCourante) return;
    etapeCourante = rang;
    groupe.innerHTML = dessinReduction(rang);
    const info = ETAPES_REDUCTION[rang];
    titre.textContent = (rang + 1) + " / " + ETAPES_REDUCTION.length + " : " + info.nom;
    if (valeurs) valeurs.maj({ etape: (rang + 1) + " sur " + ETAPES_REDUCTION.length + ", " + info.nom, operation: info.operation, resultat: info.resultat });
  }

  let curseurs = null;
  const lecteur = api.sim.lecteur("#e-reduction-lecteur", {
    de: 0,
    a: ETAPES_REDUCTION.length - 0.001,
    duree: 18,
    boucle: false,
    auto: false,
    libelle: "Enchaîner les étapes",
    rappel: (valeur) => {
      const rang = Math.floor(valeur);
      if (rang !== etapeCourante && curseurs) curseurs.definir("etape", rang);
      else afficher(valeur);
    },
  });
  if (lecteur) ressources.push(lecteur);

  curseurs = api.sim.curseurs(
    "#e-reduction-curseurs",
    [
      {
        id: "etape",
        libelle: "Étape",
        min: 0,
        max: ETAPES_REDUCTION.length - 1,
        pas: 1,
        valeur: 0,
        format: (v) => (Math.round(v) + 1) + " : " + ETAPES_REDUCTION[Math.round(v)].nom,
      },
    ],
    (lues) => {
      afficher(lues.etape);
      if (lecteur && !lecteur.enMarche()) lecteur.suivre(lues.etape);
    }
  );
  if (curseurs) ressources.push(curseurs);

  if (etapeCourante < 0) afficher(0);
}

/* --------------------------------------------------------------------------
   E. Simulation : potentiomètre à vide et chargé
   -------------------------------------------------------------------------- */

const POT = { e: 10, r: 10 };

function tensionPotentiometre(x, rl, charge) {
  if (!charge) return x * POT.e;
  return (x * POT.e) / (1 + (x * (1 - x) * POT.r) / rl);
}

function construirePotentiometre(racine, api) {
  const conteneur = racine.querySelector("#e-potentiometre");
  if (!conteneur) return;

  const bas = 270;
  const haut = 60;
  const svg = svgEl("svg", {
    viewBox: "0 0 680 330",
    role: "img",
    "aria-label": "Potentiomètre de 10 kilohms alimenté sous 10 volts, curseur déplaçable, relié à une charge réglable",
  });
  const fond = svgEl("g");
  fond.innerHTML =
    "<defs>" + marqueur("fl-e-pot") + marqueur("fl-e-pot-u", "var(--serie-2)") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
    '<path d="M80 290V189"/><circle cx="80" cy="165" r="24"/><path d="M80 141V40H300V60"/>' +
    '<rect x="286" y="60" width="28" height="210" rx="3"/><path d="M300 270V290H80"/>' +
    '<path d="M470 210V290H300"/><path d="M190 290V304M176 304H204M182 311H198M187 318H193"/></g>' +
    '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M610 282V108" marker-end="url(#fl-e-pot-u)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    '<text x="80" y="170" text-anchor="middle">10 V</text><text x="56" y="150" text-anchor="end" font-weight="600">+</text>' +
    '<text x="264" y="170" text-anchor="end">R = 10 kΩ</text><text x="264" y="54" text-anchor="end" font-size="11">x = 1</text>' +
    '<text x="264" y="282" text-anchor="end" font-size="11">x = 0</text>' +
    '<text x="622" y="200" fill="var(--serie-2)">VS</text><text x="190" y="326" text-anchor="middle" font-size="11">référence 0 V</text></g>';
  const filSortie = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "stroke-linecap": "round" });
  const filCharge = svgEl("path", { d: "M420 100H470V130", fill: "none", stroke: "currentColor", "stroke-width": 2.2, "stroke-linecap": "round" });
  const rectCharge = svgEl("rect", { x: 456, y: 130, width: 28, height: 80, rx: 3, fill: "none", stroke: "currentColor", "stroke-width": 2.2 });
  const borne = svgEl("circle", { cx: 420, cy: 100, r: 5, fill: "currentColor" });
  const dynamiques = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  const tRL = texteSvg(496, 166, "");
  const tIL = texteSvg(496, 184, "", { "font-size": 11 });
  const tVS = texteSvg(622, 218, "", { fill: "var(--serie-2)" });
  const tX = texteSvg(420, 86, "", { "text-anchor": "middle", "font-size": 11.5 });
  dynamiques.append(tRL, tIL, tVS, tX);
  svg.append(fond, filSortie, filCharge, rectCharge, borne, dynamiques);
  conteneur.appendChild(svg);

  const etat = { x: 0.5, rl: 10, charge: 1 };
  let traceur = null;

  const valeurs = api.sim.valeurs("#e-potentiometre-valeurs", [
    { id: "x", libelle: "Position du curseur x", decimales: 3 },
    { id: "vs0", libelle: "Tension à vide VS0 = x E", unite: "V", decimales: 3 },
    { id: "vs", libelle: "Tension de sortie VS", unite: "V", decimales: 3 },
    { id: "ecart", libelle: "Écart VS0 - VS", unite: "V", decimales: 3 },
    { id: "relatif", libelle: "Écart relatif", unite: "%", decimales: 2 },
    { id: "rth", libelle: "Résistance vue de la sortie x (1 - x) R", unite: "kΩ", decimales: 3 },
    { id: "il", libelle: "Courant prélevé par la charge", unite: "mA", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher() {
    const y = bas - etat.x * (bas - haut);
    filSortie.setAttribute("d", "M300 " + y.toFixed(1) + "H420V100");
    const charge = etat.charge === 1;
    for (const element of [filCharge, rectCharge]) {
      element.setAttribute("stroke-dasharray", charge ? "none" : "6 5");
      element.setAttribute("opacity", charge ? "1" : "0.5");
    }
    const vs0 = etat.x * POT.e;
    const vs = tensionPotentiometre(etat.x, etat.rl, charge);
    const il = charge ? vs / etat.rl : 0;
    tRL.textContent = "RL = " + nombre(api, etat.rl, 0) + " kΩ" + (charge ? "" : " (déconnectée)");
    tIL.textContent = charge ? "IL = " + nombre(api, il, 3) + " mA" : "IL = 0";
    tVS.textContent = nombre(api, vs, 2) + " V";
    tX.textContent = "x = " + nombre(api, etat.x, 2);
    if (valeurs) {
      valeurs.maj({
        x: etat.x,
        vs0,
        vs,
        ecart: vs0 - vs,
        relatif: vs0 > 1e-9 ? ((vs0 - vs) / vs0) * 100 : 0,
        rth: etat.x * (1 - etat.x) * POT.r,
        il,
      });
    }
    if (traceur) traceur.rafraichir();
  }

  traceur = api.sim.traceur("#e-potentiometre-trace", {
    titre: "Tension de sortie en fonction de la position du curseur",
    genre: "Simulation",
    xTitre: "x",
    yTitre: "VS",
    yUnite: "V",
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 10,
    ratio: 0.46,
    series: [
      { id: "vide", nom: "à vide : VS = x E", couleur: "serie-6", fonction: (x) => x * POT.e },
      { id: "charge", nom: "chargé par RL", couleur: "serie-1", epaisseur: 2.6, fonction: (x) => tensionPotentiometre(x, etat.rl, etat.charge === 1) },
    ],
    surDessin({ c, repere, couleurs }) {
      marquerPoint(c, repere, couleurs, etat.x, tensionPotentiometre(etat.x, etat.rl, etat.charge === 1), "position courante");
    },
  });
  if (traceur) ressources.push(traceur);

  let lecteur = null;
  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: 300, y: bas },
    a: { x: 300, y: haut },
    min: 0,
    max: 1,
    pas: 0.01,
    valeur: etat.x,
    libelle: "Curseur du potentiomètre",
    format: (mesure) => "x = " + nombre(api, mesure.valeur, 2),
    diffuserAuDepart: false,
    rappel: (mesure) => {
      etat.x = mesure.valeur;
      if (lecteur) lecteur.suivre(mesure.valeur);
      afficher();
    },
  });
  if (poignee) ressources.push(poignee);

  lecteur = api.sim.lecteur("#e-potentiometre-lecteur", {
    de: 0,
    a: 1,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Balayer la course du curseur",
    rappel: (valeur) => {
      etat.x = valeur;
      if (poignee) poignee.set(valeur, false);
      afficher();
    },
  });
  /* La création du lecteur a diffusé sa valeur de départ : on revient à mi-course. */
  etat.x = 0.5;
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.suivre(etat.x);
  }
  if (poignee) poignee.set(etat.x, false);

  const curseurs = api.sim.curseurs(
    "#e-potentiometre-curseurs",
    [
      { id: "rl", libelle: "Résistance de charge RL", min: 1, max: 200, pas: 1, valeur: 10, unite: "kΩ" },
      { id: "charge", libelle: "Charge", min: 0, max: 1, pas: 1, valeur: 1, format: (v) => (Math.round(v) === 1 ? "connectée" : "déconnectée") },
    ],
    (lues) => {
      etat.rl = lues.rl;
      etat.charge = Math.round(lues.charge);
      afficher();
    }
  );
  if (curseurs) ressources.push(curseurs);

  afficher();
}

/* --------------------------------------------------------------------------
   H. Simulation : espace de conception du pont de surveillance
   -------------------------------------------------------------------------- */

/** Dimensionne le pont pour une résistance totale donnée (kΩ) ; renvoie null si la compensation est impossible. */
function dimensionnerPont(rt, rl, compense) {
  const { k } = CONCEPTION;
  const r1 = (1 - k) * rt;
  const bas = k * rt;
  if (!compense) return { r1, r2: bas };
  if (bas >= rl * 0.98) return null;
  return { r1, r2: 1 / (1 / bas - 1 / rl) };
}

function sortiePont(pont, rl) {
  const bas = parallele(pont.r2, rl);
  return (CONCEPTION.e * bas) / (pont.r1 + bas);
}

function erreurPont(pont, rl) {
  const cible = CONCEPTION.e * CONCEPTION.k;
  return (Math.abs(sortiePont(pont, rl) - cible) / cible) * 100;
}

function construireConception(racine, api) {
  const etat = { rt: 30, pmax: 50, rl: 100, compense: 0 };
  const rMin = () => (CONCEPTION.e * CONCEPTION.e) / (etat.pmax / 1000) / 1000;

  const valeurs = api.sim.valeurs("#h-conception-valeurs", [
    { id: "r1", libelle: "R1", unite: "kΩ", decimales: 2 },
    { id: "r2", libelle: "R2", unite: "kΩ", decimales: 2 },
    { id: "vs", libelle: "VS à 30 V, entrée nominale", unite: "V", decimales: 3 },
    { id: "err", libelle: "Erreur, entrée nominale", unite: "%", decimales: 2 },
    { id: "err90", libelle: "Erreur, entrée réelle à - 10 %", unite: "%", decimales: 2 },
    { id: "rmin", libelle: "Résistance totale minimale (puissance)", unite: "kΩ", decimales: 2 },
    { id: "p", libelle: "Puissance totale à 30 V", unite: "mW", decimales: 1 },
    { id: "p1", libelle: "Puissance dans R1", unite: "mW", decimales: 1 },
    { id: "p2", libelle: "Puissance dans R2", unite: "mW", decimales: 1 },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const traceur = api.sim.traceur("#h-conception-trace", {
    titre: "Erreur de la tension de sortie en fonction de la résistance totale du pont",
    genre: "Simulation",
    xTitre: "R1 + R2",
    xUnite: "kΩ",
    yTitre: "erreur",
    yUnite: "%",
    xMin: 2,
    xMax: 60,
    yMin: 0,
    yMax: 12,
    ratio: 0.5,
    series: [
      { id: "brut", nom: "sans compensation", couleur: "serie-5", epaisseur: 2.4, fonction: (rt) => erreurPont(dimensionnerPont(rt, etat.rl, false), etat.rl) },
      {
        id: "compense",
        nom: "avec compensation, entrée réelle à - 10 %",
        couleur: "serie-1",
        epaisseur: 2.4,
        fonction: (rt) => {
          const pont = dimensionnerPont(rt, etat.rl, true);
          return pont ? erreurPont(pont, 0.9 * etat.rl) : NaN;
        },
      },
    ],
    surDessin({ c, repere, couleurs }) {
      const x0 = repere.versX(2);
      const xLim = repere.versX(Math.min(60, Math.max(2, rMin())));
      const yH = repere.boite.y;
      const yB = repere.boite.y + repere.boite.h;
      c.save();
      c.beginPath();
      c.rect(x0, yH, Math.max(0, xLim - x0), yB - yH);
      c.clip();
      c.strokeStyle = couleurs.axe;
      c.globalAlpha = 0.45;
      c.lineWidth = 1;
      for (let d = -repere.boite.h; d < xLim - x0 + repere.boite.h; d += 9) {
        c.beginPath();
        c.moveTo(x0 + d, yB);
        c.lineTo(x0 + d + (yB - yH), yH);
        c.stroke();
      }
      c.restore();
      c.save();
      c.strokeStyle = couleurs.texte;
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(xLim, yH);
      c.lineTo(xLim, yB);
      c.stroke();
      c.fillStyle = couleurs.texte;
      c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
      c.textAlign = "left";
      if (xLim - x0 > 120) c.fillText("interdit : puissance", x0 + 6, yH + 14);
      c.restore();
      ligneHorizontale(c, repere, couleurs, 1, "limite 1 %");
      const pont = dimensionnerPont(etat.rt, etat.rl, etat.compense === 1);
      if (pont) marquerPoint(c, repere, couleurs, etat.rt, Math.min(12, erreurPont(pont, etat.rl)), "réglage courant");
    },
  });
  if (traceur) ressources.push(traceur);

  function actualiser() {
    const pont = dimensionnerPont(etat.rt, etat.rl, etat.compense === 1);
    const minimum = rMin();
    if (!pont) {
      if (valeurs) valeurs.maj({ verdict: "compensation impossible : k (R1 + R2) doit rester inférieure à RL" });
      if (traceur) traceur.rafraichir();
      return;
    }
    const vs = sortiePont(pont, etat.rl);
    const bas = parallele(pont.r2, etat.rl);
    const courant = CONCEPTION.e / (pont.r1 + bas);
    const p = CONCEPTION.e * courant;
    const p1 = pont.r1 * courant * courant;
    const p2 = (vs * vs) / pont.r2;
    const err = erreurPont(pont, etat.rl);
    const err90 = erreurPont(pont, 0.9 * etat.rl);
    const rtReel = pont.r1 + bas;
    const defauts = [];
    if (rtReel < minimum - 1e-9) defauts.push("puissance dépassée");
    if (err > 1) defauts.push("erreur supérieure à 1 %");
    if (Math.max(p1, p2) > 125) defauts.push("résistance au-delà de 125 mW");
    if (valeurs) {
      valeurs.maj({
        r1: pont.r1,
        r2: pont.r2,
        vs,
        err,
        err90,
        rmin: minimum,
        p,
        p1,
        p2,
        verdict: defauts.length ? "non conforme : " + defauts.join(", ") : err90 > 1 ? "conforme en nominal, mais sensible à la dispersion de l'entrée" : "conforme",
      });
    }
    if (traceur) traceur.rafraichir();
  }

  const curseurs = api.sim.curseurs(
    "#h-conception-curseurs",
    [
      { id: "rt", libelle: "Résistance totale R1 + R2 visée", min: 2, max: 60, pas: 0.5, valeur: 30, unite: "kΩ" },
      { id: "pmax", libelle: "Puissance maximale admise", min: 20, max: 200, pas: 5, valeur: 50, unite: "mW" },
      { id: "rl", libelle: "Résistance d'entrée nominale de l'automate", min: 30, max: 500, pas: 5, valeur: 100, unite: "kΩ" },
      { id: "compense", libelle: "Compensation de R2", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (Math.round(v) === 1 ? "activée" : "désactivée") },
    ],
    (lues) => {
      etat.rt = lues.rt;
      etat.pmax = lues.pmax;
      etat.rl = lues.rl;
      etat.compense = Math.round(lues.compense);
      actualiser();
    }
  );
  if (curseurs) ressources.push(curseurs);

  actualiser();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/** Diviseur chargé annoté, pour les corrections. */
function diviseurAnnote(id, e) {
  return (
    "<defs>" + marqueur(id) + marqueur(id + "-u", "var(--serie-2)") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
    '<path d="M80 300V216"/><circle cx="80" cy="190" r="26"/><path d="M80 164V50H260V70"/>' +
    '<rect x="246" y="70" width="28" height="80" rx="3"/><path d="M260 150V190"/><rect x="246" y="190" width="28" height="80" rx="3"/>' +
    '<path d="M260 270V300H80"/><path d="M260 170H420V190"/><rect x="406" y="190" width="28" height="80" rx="3"/><path d="M420 270V300H260"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="260" cy="170" r="5"/><circle cx="260" cy="300" r="5"/></g>' +
    '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M480 292V180" marker-end="url(#' + id + '-u)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    '<text x="80" y="195" text-anchor="middle">' + e.e + '</text><text x="54" y="172" text-anchor="end" font-weight="600">+</text>' +
    '<text x="282" y="115">' + e.r1 + "</text>" +
    '<text x="238" y="235" text-anchor="end">' + e.r2 + "</text>" +
    '<text x="442" y="235">' + e.rl + "</text>" +
    '<text x="492" y="230" fill="var(--serie-2)">' + e.vs + "</text>" +
    '<text x="280" y="330" text-anchor="middle">' + (e.bas || "") + "</text>" +
    '<text x="340" y="160" text-anchor="middle" font-size="11">' + (e.milieu || "") + "</text></g>"
  );
}

function construireExercices(racine, api) {
  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-1",
      titre: "Résistance équivalente d'un réseau",
      niveau: "fondamental",
      enonce:
        "<p>Une résistance $R_1 = 100\\ \\Omega$ est en série avec l'ensemble formé de $R_2 = 300\\ \\Omega$ en parallèle avec $R_3 = 150\\ \\Omega$. Quelle résistance équivalente la source voit-elle, en ohms ?</p>",
      valeur: 200,
      unite: "Ω",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Req",
      etapes: [
        { texte: "Groupe parallèle : $R_2 /\\!/ R_3 = \\dfrac{300 \\times 150}{300 + 150} = \\dfrac{45\\,000}{450} = 100\\ \\Omega$." },
        { texte: "Série avec $R_1$ : $R_{\\text{éq}} = 100 + 100 = 200\\ \\Omega$." },
        { texte: "Contrôle : $100\\ \\Omega$ est bien inférieur à $150\\ \\Omega$, la plus petite des deux résistances en parallèle.", note: "Réduire d'abord le groupe le plus intérieur, puis remonter." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 240",
          '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
            '<path d="M30 60H80"/><rect x="80" y="46" width="90" height="28" rx="3"/><path d="M170 60H240V90"/>' +
            '<path d="M240 60H320V90"/><rect x="226" y="90" width="28" height="70" rx="3"/><rect x="306" y="90" width="28" height="70" rx="3"/>' +
            '<path d="M240 160V190H30"/><path d="M320 160V190H240"/></g>' +
            '<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-dasharray="6 5" opacity="0.85"><rect x="208" y="80" width="146" height="92" rx="10"/></g>' +
            '<g stroke="currentColor" stroke-width="4" fill="none"><rect x="460" y="60" width="28" height="100" rx="3"/></g>' +
            '<g stroke="currentColor" stroke-width="2.2" fill="none"><path d="M474 30V60M474 160V200"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
            '<text x="125" y="40" text-anchor="middle">R1 = 100 Ω</text><text x="218" y="130" text-anchor="end">300 Ω</text><text x="344" y="130">150 Ω</text>' +
            '<text x="281" y="215" text-anchor="middle">300 // 150 = 100 Ω</text>' +
            '<text x="400" y="115" text-anchor="middle">donne</text>' +
            '<text x="500" y="115">Req = 200 Ω</text><text x="500" y="135" font-size="11">100 + 100</text></g>',
          "Réseau réduit : 300 ohms en parallèle avec 150 ohms donnent 100 ohms, plus 100 ohms en série, soit 200 ohms"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-2",
      titre: "Partage d'un courant",
      niveau: "fondamental",
      enonce:
        "<p>Un courant de $60\\ \\mathrm{mA}$ arrive sur deux résistances en parallèle, $R_1 = 1\\ \\mathrm{k\\Omega}$ et $R_2 = 2\\ \\mathrm{k\\Omega}$. Quel courant traverse $R_1$, en milliampères ?</p>",
      valeur: 40,
      unite: "mA",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "I1",
      etapes: [
        { texte: "Diviseur de courant : $I_1 = I\\,\\dfrac{R_2}{R_1 + R_2}$, avec l'autre résistance au numérateur." },
        { texte: "$I_1 = 60 \\times \\dfrac{2}{3} = 40\\ \\mathrm{mA}$, et $I_2 = 60 - 40 = 20\\ \\mathrm{mA}$." },
        { texte: "Contrôle par la tension commune : $1\\ \\mathrm{k\\Omega} \\times 40\\ \\mathrm{mA} = 40\\ \\mathrm{V} = 2\\ \\mathrm{k\\Omega} \\times 20\\ \\mathrm{mA}$.", note: "La plus petite résistance reçoit le plus grand courant." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 260",
          "<defs>" + marqueur("fl-k2") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M40 50H400V100"/><path d="M220 50V100"/>' +
            '<rect x="206" y="100" width="28" height="80" rx="3"/><rect x="386" y="100" width="28" height="80" rx="3"/><path d="M220 180V220H40"/><path d="M400 180V220H220"/></g>' +
            '<g stroke="currentColor" fill="none" stroke-linecap="round"><path d="M60 50H130" stroke-width="5" marker-end="url(#fl-k2)"/>' +
            '<path d="M220 60V92" stroke-width="4" marker-end="url(#fl-k2)"/><path d="M400 60V92" stroke-width="2" marker-end="url(#fl-k2)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
            '<text x="95" y="38" text-anchor="middle">60 mA</text><text x="232" y="82">40 mA</text><text x="412" y="82">20 mA</text>' +
            '<text x="246" y="145">1 kΩ</text><text x="426" y="145">2 kΩ</text>' +
            '<text x="280" y="250" text-anchor="middle">tension commune 40 V ; épaisseur des flèches proportionnelle au courant</text></g>',
          "Diviseur de courant : 60 milliampères se partagent en 40 dans 1 kilohm et 20 dans 2 kilohms"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-1",
      titre: "Diviseur chargé",
      niveau: "intermédiaire",
      enonce:
        "<p>Un diviseur $R_1 = 2\\ \\mathrm{k\\Omega}$, $R_2 = 8\\ \\mathrm{k\\Omega}$ est alimenté sous $10\\ \\mathrm{V}$. On branche en sortie une charge $R_L = 8\\ \\mathrm{k\\Omega}$. Quelle tension de sortie obtient-on, en volts ? Comparez à la tension à vide.</p>",
      valeur: 20 / 3,
      unite: "V",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "VS en charge",
      etapes: [
        { texte: "À vide : $V_{S0} = 10 \\times 8/10 = 8\\ \\mathrm{V}$." },
        { texte: "Méthode 1 : $R_2 /\\!/ R_L = 8 \\times 8/16 = 4\\ \\mathrm{k\\Omega}$, puis $V_S = 10 \\times 4/(2 + 4) = 6{,}67\\ \\mathrm{V}$." },
        { texte: "Méthode 2 : $R_{th} = 2 /\\!/ 8 = 1{,}6\\ \\mathrm{k\\Omega}$, $V_S = 8 \\times 8/(8 + 1{,}6) = 6{,}67\\ \\mathrm{V}$." },
        { texte: "Erreur de charge : $1{,}6/9{,}6 = 16{,}7\\ \\%$.", note: "Une charge du même ordre que $R_2$ rend la formule à vide inutilisable." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 340",
          diviseurAnnote("fl-k3", { e: "10 V", r1: "R1 = 2 kΩ", r2: "R2 = 8 kΩ", rl: "RL = 8 kΩ", vs: "6,67 V", milieu: "R2 // RL = 4 kΩ", bas: "à vide 8 V ; chargé 6,67 V ; erreur 16,7 %" }),
          "Diviseur de 2 et 8 kilohms chargé par 8 kilohms sous 10 volts : 6,67 volts au lieu de 8"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-2",
      titre: "Pont sous contrainte de puissance",
      niveau: "intermédiaire",
      enonce:
        "<p>On veut ramener $24\\ \\mathrm{V}$ à $5\\ \\mathrm{V}$ par un pont diviseur à vide, en dissipant au plus $20\\ \\mathrm{mW}$ dans le pont. Quelle est la résistance totale minimale $R_1 + R_2$, en kilohms ? Proposez ensuite un couple de valeurs E24.</p>",
      valeur: 28.8,
      unite: "kΩ",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "R1 + R2 minimale",
      etapes: [
        { texte: "Puissance du pont : $P = E^2/(R_1 + R_2) \\leq 0{,}02\\ \\mathrm{W}$, donc $R_1 + R_2 \\geq 24^2/0{,}02 = 28\\,800\\ \\Omega = 28{,}8\\ \\mathrm{k\\Omega}$." },
        { texte: "Rapport : $k = 5/24 = 0{,}2083$ ; au minimum, $R_2 = 6{,}0\\ \\mathrm{k\\Omega}$ et $R_1 = 22{,}8\\ \\mathrm{k\\Omega}$, valeurs hors série E24." },
        { texte: "Couple E24 : $R_1 = 24\\ \\mathrm{k\\Omega}$, $R_2 = 6{,}2\\ \\mathrm{k\\Omega}$ ; $V_S = 24 \\times 6{,}2/30{,}2 = 4{,}93\\ \\mathrm{V}$ ($-1{,}5\\ \\%$) et $P = 576/30\\,200 = 19{,}1\\ \\mathrm{mW}$." },
        { texte: "Le couple $91\\ \\mathrm{k\\Omega}$ et $24\\ \\mathrm{k\\Omega}$ donne $5{,}01\\ \\mathrm{V}$ et $5{,}0\\ \\mathrm{mW}$, au prix d'une résistance de sortie plus élevée, $19\\ \\mathrm{k\\Omega}$.", note: "Toute la conception se joue entre ces deux tendances : peu de puissance ou peu d'erreur de charge." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Puissance du pont sous 24 V en fonction de sa résistance totale",
          genre: "Correction visuelle",
          xTitre: "R1 + R2",
          xUnite: "kΩ",
          yTitre: "P",
          yUnite: "mW",
          xMin: 5,
          xMax: 80,
          yMin: 0,
          yMax: 80,
          ratio: 0.45,
          series: [
            { id: "p", nom: "P = 576 / (R1 + R2)", couleur: "serie-1", fonction: (r) => 576 / r },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 20, "limite 20 mW");
            marquerPoint(c, repere, couleurs, 28.8, 20, "28,8 kΩ");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  const rapportCritique = 14.6;
  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-avance",
      titre: "Linéarité d'un potentiomètre de consigne",
      niveau: "avancé",
      enonce:
        "<p>Un potentiomètre de consigne de résistance $R$, alimenté sous $E$, attaque une entrée de variateur de résistance $R_L$. On exige que l'écart $xE - V_S$ reste inférieur à $1\\ \\%$ de $E$ sur toute la course. Quelle valeur minimale du rapport $R_L/R$ faut-il ? Indication : pour $R_L \\gg R$, développez l'écart au premier ordre en $R/R_L$.</p>",
      valeur: rapportCritique,
      tolerance: 0.03,
      chiffres: 1,
      libelleChamp: "R_L / R minimal",
      etapes: [
        { texte: "Écart relatif à $E$ : $e(x) = x - \\dfrac{x}{1 + a\\,x(1 - x)}$ avec $a = R/R_L$." },
        { texte: "Pour $a \\ll 1$ : $\\dfrac{1}{1 + a\\,x(1-x)} \\approx 1 - a\\,x(1 - x)$, donc $e(x) \\approx a\\,x^2(1 - x)$." },
        { texte: "Maximum : $\\dfrac{\\mathrm{d}}{\\mathrm{d}x}\\left[x^2(1 - x)\\right] = 2x - 3x^2 = 0$, soit $x = 2/3$ et $x^2(1 - x) = 4/27$." },
        { texte: "Condition : $a \\times 4/27 \\leq 0{,}01$, donc $R_L/R \\geq 400/27 = 14{,}8$ au premier ordre." },
        { texte: "Le calcul exact, par balayage numérique de $e(x)$, donne $R_L/R \\geq 14{,}6$, le maximum étant atteint vers $x = 0{,}67$.", note: "Règle de conception qui en découle : un potentiomètre de consigne doit valoir au plus environ le quinzième de l'impédance d'entrée pour une linéarité de $1\\ \\%$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const a = 1 / rapportCritique;
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Écart en pour cent de E le long de la course, pour R_L / R = 14,6",
          genre: "Correction visuelle",
          xTitre: "x",
          yTitre: "écart",
          yUnite: "% de E",
          xMin: 0,
          xMax: 1,
          yMin: 0,
          yMax: 1.4,
          ratio: 0.45,
          series: [
            { id: "exact", nom: "écart exact", couleur: "serie-1", fonction: (x) => (x - x / (1 + a * x * (1 - x))) * 100 },
            { id: "approche", nom: "approximation a x² (1 - x)", couleur: "serie-4", fonction: (x) => a * x * x * (1 - x) * 100 },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 1, "1 %");
            marquerPoint(c, repere, couleurs, 0.668, 1, "maximum vers x = 0,67");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte("#k-exercices-blocs", {
      id: "k-diagnostic",
      titre: "Mesure du bus plus basse que prévu",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Une armoire surveille son bus $24\\ \\mathrm{V}$ par un pont $R_1 = 20\\ \\mathrm{k\\Omega}$, $R_2 = 10\\ \\mathrm{k\\Omega}$, relié à une entrée analogique d'automate. L'automate, programmé avec le rapport $1/3$, affiche $22{,}5\\ \\mathrm{V}$. Le technicien débranche l'entrée et mesure au multimètre $8{,}0\\ \\mathrm{V}$ en sortie du pont, puis $24{,}0\\ \\mathrm{V}$ sur le bus. Expliquez l'écart, estimez la résistance d'entrée de l'automate et proposez une correction.</p>",
      motsCles: [
        ["charge", "impedance", "resistance d'entree", "entree"],
        ["parallele", "r2 //", "en parallele", "rth", "thevenin"],
        ["100", "100 k"],
        ["compens", "11 k", "etalonn", "calibr", "tampon", "suiveur", "rapport reel", "mise a l'echelle"],
      ],
      minimum: 3,
      exemple: "Expliquez ce que change le branchement de l'entrée, chiffrez-la, puis proposez une correction.",
      etapes: [
        { texte: "À vide, le pont donne bien $24/3 = 8{,}0\\ \\mathrm{V}$ : les résistances sont correctes. En charge, l'automate lit $22{,}5/3 = 7{,}5\\ \\mathrm{V}$ : c'est la résistance d'entrée qui charge le pont." },
        { texte: "$V_S = V_{S0}\\,R_L/(R_L + R_{th})$ avec $R_{th} = 20 /\\!/ 10 = 6{,}67\\ \\mathrm{k\\Omega}$ : $7{,}5 = 8 \\times R_L/(R_L + 6{,}67)$, d'où $R_L = 15 \\times 6{,}67 = 100\\ \\mathrm{k\\Omega}$." },
        { texte: "Corrections : compenser $R_2$ ($11{,}0\\ \\mathrm{k\\Omega}$, comme en section H), programmer le rapport réel en charge ($7{,}5/24 = 0{,}3125$) ou étalonner le gain, ou insérer un étage tampon.", note: "Un multimètre de $10\\ \\mathrm{M\\Omega}$ perturbe très peu ce pont ; c'est pourquoi la mesure à vide semblait juste." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 340",
          diviseurAnnote("fl-k6", { e: "24 V", r1: "R1 = 20 kΩ", r2: "R2 = 10 kΩ", rl: "RL = 100 kΩ", vs: "7,5 V", milieu: "Rth = 6,67 kΩ", bas: "à vide 8,0 V ; entrée branchée 7,5 V, soit 22,5 V affichés" }),
          "Pont de 20 et 10 kilohms chargé par l'entrée de 100 kilohms : 7,5 volts au lieu de 8"
        );
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte("#k-exercices-blocs", {
      id: "k-conceptuel",
      titre: "Pourquoi un pont diviseur n'est pas une alimentation",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi on n'alimente pas un module électronique de $5\\ \\mathrm{V}$, dont la consommation varie, à partir d'un bus $24\\ \\mathrm{V}$ par un simple pont diviseur.</p>",
      motsCles: [
        ["courant", "consommation", "charge"],
        ["varie", "baisse", "chute", "depend", "pas constante", "instable"],
        ["resistance de sortie", "rth", "thevenin", "resistance interne", "r1 // r2", "parallele"],
        ["pertes", "dissip", "rendement", "puissance", "chauffe"],
      ],
      minimum: 2,
      exemple: "Parlez de ce que devient la tension quand le courant prélevé change, et de l'énergie.",
      etapes: [
        { texte: "Vu de sa sortie, un pont est une source $V_{S0}$ en série avec $R_{th} = R_1 /\\!/ R_2$ : la tension baisse de $R_{th}I_L$ quand le courant prélevé augmente." },
        { texte: "Pour que cette baisse reste faible avec un courant de module de plusieurs dizaines de milliampères, il faudrait un $R_{th}$ de quelques ohms, donc un pont qui dissiperait des watts en permanence." },
        { texte: "Un régulateur ou un convertisseur maintient la tension par contre-réaction et ne consomme que ce qu'exige la charge, plus ses pertes propres.", note: "Le pont diviseur reste l'outil de la mesure, où le courant prélevé est faible et connu." },
      ],
      visuelCorrection(conteneur, moteur) {
        const vs0 = 5;
        const rth = parallele(19, 5);
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Tension de sortie en fonction du courant prélevé",
          genre: "Correction visuelle",
          xTitre: "courant prélevé",
          xUnite: "mA",
          yTitre: "VS",
          yUnite: "V",
          xMin: 0,
          xMax: 1.2,
          yMin: 0,
          yMax: 6,
          ratio: 0.42,
          series: [
            { id: "pont", nom: "pont 19 kΩ et 5 kΩ (Rth = 3,96 kΩ)", couleur: "serie-5", fonction: (i) => Math.max(0, vs0 - rth * i) },
            { id: "regulateur", nom: "régulateur 5 V idéal", couleur: "serie-3", fonction: () => 5 },
          ],
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

/* Réseau à quatre résistances pour la question d'interprétation de schéma. */
const DESSIN_RESEAU_QUIZ =
  '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
  '<circle cx="50" cy="135" r="20"/><path d="M50 115V40H110"/><rect x="110" y="28" width="80" height="24" rx="3"/>' +
  '<path d="M190 40H300"/><path d="M240 40V90"/><rect x="228" y="90" width="24" height="80" rx="3"/><path d="M240 170V230"/>' +
  '<rect x="300" y="28" width="80" height="24" rx="3"/><path d="M380 40H430V90"/><rect x="418" y="90" width="24" height="80" rx="3"/>' +
  '<path d="M430 170V230H50V155"/></g>' +
  '<g fill="currentColor" stroke="none"><circle cx="240" cy="40" r="4.5"/><circle cx="240" cy="230" r="4.5"/></g>' +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
  '<text x="30" y="120" text-anchor="end" font-weight="600">+</text><text x="50" y="140" text-anchor="middle">E</text>' +
  '<text x="150" y="45" text-anchor="middle">A</text><text x="240" y="135" text-anchor="middle">B</text>' +
  '<text x="340" y="45" text-anchor="middle">C</text><text x="430" y="135" text-anchor="middle">D</text></g>';

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Trois résistances de $30\\ \\Omega$ sont montées en parallèle. Quelle est la résistance équivalente ?</p>",
        options: ["$90\\ \\Omega$", "$30\\ \\Omega$", "$10\\ \\Omega$", "$3\\ \\Omega$"],
        bonnes: [2],
        explication: "$n$ résistances égales en parallèle donnent $R/n = 30/3 = 10\\ \\Omega$.",
        resume: "Parallèle de résistances égales",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Dans deux résistances en parallèle, c'est la plus grande qui dissipe la plus grande puissance.</p>",
        reponse: false,
        explication: "À tension commune, $P = U^2/R$ : la plus petite résistance dissipe le plus. L'affirmation est vraie en série, à courant commun.",
        resume: "Puissance en parallèle",
      },
      {
        type: "calcul",
        enonce: "<p>Un diviseur à vide $R_1 = 3{,}3\\ \\mathrm{k\\Omega}$, $R_2 = 1{,}2\\ \\mathrm{k\\Omega}$ est alimenté sous $12\\ \\mathrm{V}$. Quelle est la tension de sortie aux bornes de $R_2$, en volts ?</p>",
        valeur: 3.2,
        unite: "V",
        chiffres: 2,
        explication: "$V_S = 12 \\times 1{,}2/4{,}5 = 3{,}2\\ \\mathrm{V}$.",
        resume: "Diviseur de tension",
      },
      {
        type: "courte",
        enonce: "<p>Quelle condition la charge doit-elle remplir pour que la formule du diviseur à vide reste une bonne approximation ?</p>",
        motsCles: [["grande", "elevee", "beaucoup plus", "negligeable", "10 fois", "dix fois", "100 fois"], ["r1 // r2", "rth", "thevenin", "resistance de sortie", "courant du pont", "r2"]],
        minimum: 2,
        explication: "Sa résistance doit être grande devant $R_{th} = R_1 /\\!/ R_2$ : l'erreur vaut $R_{th}/(R_L + R_{th})$, soit environ $1\\ \\%$ pour $R_L = 99\\,R_{th}$.",
        resume: "Validité du diviseur à vide",
      },
      {
        type: "calcul",
        enonce: "<p>Que vaut $220\\ \\Omega /\\!/ 330\\ \\Omega$, en ohms ?</p>",
        valeur: 132,
        unite: "Ω",
        chiffres: 0,
        explication: "$220 \\times 330/550 = 72\\,600/550 = 132\\ \\Omega$, inférieur à $220\\ \\Omega$ comme attendu.",
        resume: "Deux résistances en parallèle",
      },
      {
        type: "qcm",
        enonce: "<p>Un pont a une résistance de sortie $R_{th} = 1\\ \\mathrm{k\\Omega}$ et alimente une charge de $99\\ \\mathrm{k\\Omega}$. Quelle est l'erreur de charge ?</p>",
        options: ["$0{,}1\\ \\%$", "$1\\ \\%$", "$9\\ \\%$", "$99\\ \\%$"],
        bonnes: [1],
        explication: "$\\varepsilon = R_{th}/(R_L + R_{th}) = 1/100 = 1\\ \\%$.",
        resume: "Erreur de charge",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Pour trois résistances en parallèle, $R_{\\text{éq}} = R_1R_2R_3/(R_1 + R_2 + R_3)$.</p>",
        reponse: false,
        explication: "Cette expression a la dimension d'une résistance au carré. Il faut additionner les conductances : $1/R_{\\text{éq}} = 1/R_1 + 1/R_2 + 1/R_3$.",
        resume: "Formule produit sur somme",
      },
      {
        type: "calcul",
        enonce: "<p>Un pont de résistance totale $12\\ \\mathrm{k\\Omega}$ est alimenté sous $24\\ \\mathrm{V}$. Quelle puissance dissipe-t-il, en milliwatts ?</p>",
        valeur: 48,
        unite: "mW",
        chiffres: 0,
        explication: "$P = E^2/(R_1 + R_2) = 576/12\\,000 = 0{,}048\\ \\mathrm{W} = 48\\ \\mathrm{mW}$.",
        resume: "Puissance d'un pont",
      },
      {
        type: "schema",
        enonce: "<p>Dans ce réseau alimenté par la source $E$, quelle résistance est soumise à la même tension que l'ensemble formé par $C$ et $D$ ?</p>",
        consigne: "Cliquez sur l'étiquette de la résistance correspondante.",
        viewBox: "0 0 470 260",
        dessin: DESSIN_RESEAU_QUIZ,
        zones: [
          { x: 120, y: 18, largeur: 60, hauteur: 44, etiquette: "résistance A" },
          { x: 210, y: 108, largeur: 60, hauteur: 44, etiquette: "résistance B", juste: true },
          { x: 310, y: 18, largeur: 60, hauteur: 44, etiquette: "résistance C" },
          { x: 400, y: 108, largeur: 60, hauteur: 44, etiquette: "résistance D" },
        ],
        explication: "$B$ relie le nœud marqué d'un point, en haut, au conducteur du bas ; la branche $C$ puis $D$ relie les deux mêmes nœuds. $B$ est donc en parallèle avec $C + D$, et l'ensemble est en série avec $A$.",
        resume: "Reconnaître un parallèle",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi fractionne-t-on la branche haute d'un pont de mesure de bus continu à $800\\ \\mathrm{V}$ en plusieurs résistances en série ?</p>",
        motsCles: [["tension"], ["maximale", "limite", "tenue", "claquage", "service"], ["repartir", "partage", "chaque", "par resistance", "divise"]],
        minimum: 2,
        explication: "Chaque résistance a une tension maximale de service ; en série, la tension se répartit au prorata des résistances, ce qui ramène chacune sous sa limite. La mise en série limite aussi le courant si l'une d'elles se met en court-circuit.",
        resume: "Tension par résistance",
      },
    ],
    { titre: "Dix questions sur les associations de résistances et les diviseurs" }
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
      { categorie: "Critère", question: "À quoi reconnaît-on deux résistances en série ?", reponse: "Elles portent le même courant : aucun nœud intermédiaire n'est raccordé à un autre élément." },
      { categorie: "Critère", question: "À quoi reconnaît-on deux résistances en parallèle ?", reponse: "Elles relient les deux mêmes nœuds, donc subissent la même tension, quelle que soit leur position sur le dessin." },
      { categorie: "Formule", question: "Résistance équivalente en série et en parallèle ?", reponse: "Série : $\\sum R_k$. Parallèle : $1/R_{\\text{éq}} = \\sum 1/R_k$, soit $R_1R_2/(R_1 + R_2)$ pour deux." },
      { categorie: "Formule", question: "Diviseur de tension à vide ?", reponse: "$V_S = E\\,R_2/(R_1 + R_2)$, à condition qu'aucun courant ne soit prélevé en sortie." },
      { categorie: "Formule", question: "Diviseur de courant ?", reponse: "$I_1 = I\\,R_2/(R_1 + R_2)$ : l'autre résistance au numérateur ; la plus petite résistance reçoit le plus grand courant." },
      { categorie: "Modèle", question: "Comment se comporte un diviseur vu de sa sortie ?", reponse: "Comme une source $V_{S0}$ en série avec $R_{th} = R_1 /\\!/ R_2$ ; en charge, $V_S = V_{S0}\\,R_L/(R_L + R_{th})$." },
      { categorie: "Règle", question: "Quelle charge minimale pour une erreur de charge de $1\\ \\%$ ?", reponse: "$R_L \\geq 99\\,R_{th}$ ; pour $10\\ \\%$, $R_L \\geq 9\\,R_{th}$." },
      { categorie: "Énergie", question: "Quelle résistance dissipe le plus, en série puis en parallèle ?", reponse: "En série, la plus grande ($RI^2$ à courant commun) ; en parallèle, la plus petite ($U^2/R$ à tension commune)." },
      { categorie: "Conception", question: "Quel conflit faut-il arbitrer en concevant un pont de mesure ?", reponse: "Des résistances faibles réduisent l'erreur de charge mais augmentent la puissance $E^2/(R_1 + R_2)$ ; on arbitre par la compensation, les valeurs normalisées ou un étage tampon." },
      {
        categorie: "Industriel",
        question: "Pourquoi plusieurs résistances en série dans la branche haute d'un pont haute tension ?",
        reponse: "Pour répartir la tension sous la tension maximale de service de chaque composant et limiter le courant si l'une d'elles se met en court-circuit.",
        rappel: "Vérifier aussi la puissance par résistance et les tolérances.",
      },
    ],
    { titre: "Dix cartes sur les associations de résistances et les diviseurs" }
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
        enonce: "<p>Quatre résistances de $1\\ \\mathrm{k\\Omega}$ sont montées en parallèle. Quelle est la résistance équivalente, en ohms ?</p>",
        valeur: 250,
        unite: "Ω",
        chiffres: 0,
        explication: "$R/n = 1000/4 = 250\\ \\Omega$.",
        resume: "Parallèle (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Dans un diviseur de courant, la plus petite résistance reçoit le plus grand courant.</p>",
        reponse: true,
        explication: "Le courant se partage au prorata des conductances : $I_1 = I\\,G_1/(G_1 + G_2)$.",
        resume: "Diviseur de courant (cette séance)",
      },
      {
        type: "qcm",
        enonce: "<p>Un diviseur est formé de deux résistances égales à $R$. Quelle résistance voit-on depuis sa sortie, source éteinte ?</p>",
        options: ["$2R$", "$R$", "$R/2$", "$R/4$"],
        bonnes: [2],
        explication: "La source éteinte est un court-circuit : $R_1$ et $R_2$ se retrouvent en parallèle, $R /\\!/ R = R/2$.",
        resume: "Résistance de sortie (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>À un nœud, $2{,}5\\ \\mathrm{A}$ arrivent par une branche et $1{,}2\\ \\mathrm{A}$ repartent par une deuxième. Quel courant repart par la troisième branche, en ampères ?</p>",
        valeur: 1.3,
        unite: "A",
        chiffres: 1,
        explication: "Loi des nœuds : $2{,}5 = 1{,}2 + I$, donc $I = 1{,}3\\ \\mathrm{A}$, révisé du cours Lois de Kirchhoff ; c'est elle qui fonde le diviseur de courant.",
        resume: "Loi des nœuds (cours précédent)",
      },
      {
        type: "qcm",
        enonce: "<p>Un circuit connexe comporte $3$ nœuds et $5$ branches. Combien d'équations aux mailles indépendantes faut-il écrire ?</p>",
        options: ["2", "3", "4", "5"],
        bonnes: [1],
        explication: "$m = b - n + 1 = 5 - 3 + 1 = 3$, révisé du cours Lois de Kirchhoff.",
        resume: "Mailles indépendantes (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la résistance à 20 °C de $100\\ \\mathrm{m}$ de conducteur de cuivre de $2{,}5\\ \\mathrm{mm^2}$, en ohms ($\\rho = 1{,}72 \\times 10^{-8}\\ \\Omega\\,\\mathrm{m}$) ?</p>",
        valeur: 1.72e-8 * 100 / 2.5e-6,
        unite: "Ω",
        tolerance: 0.02,
        chiffres: 3,
        explication: "$R = \\rho L/S = 1{,}72 \\times 10^{-8} \\times 100/(2{,}5 \\times 10^{-6}) = 0{,}688\\ \\Omega$, révisé du cours Loi d'Ohm et résistivité ; un câble aller et retour forme deux résistances en série.",
        resume: "Résistivité (Loi d'Ohm et résistivité)",
      },
      {
        type: "calcul",
        enonce: "<p>Exprimez $0{,}047\\ \\mathrm{M\\Omega}$ en kilohms.</p>",
        valeur: 47,
        unite: "kΩ",
        chiffres: 0,
        explication: "$0{,}047 \\times 10^6 = 47 \\times 10^3\\ \\Omega = 47\\ \\mathrm{k\\Omega}$, révisé du cours Diagnostic initial et remise à niveau mathématique ; c'est une valeur de la série E24.",
        resume: "Préfixes SI (cours le plus ancien)",
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
    titre: "Où en suis-je sur les associations de résistances et les diviseurs ?",
  });
  if (auto) ressources.push(auto);
}
