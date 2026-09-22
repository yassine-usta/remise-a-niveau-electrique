/* ==========================================================================
   cours/loi-d-ohm-et-resistivite/cours.js
   Loi d'Ohm et résistivité.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";

/* Constantes physiques et matériaux utilisés par les simulations. */
const T_REF_K = 293.15;
const MATERIAUX = [
  { nom: "cuivre", rho: 1.72e-8, alpha: 3.93e-3 },
  { nom: "aluminium", rho: 2.82e-8, alpha: 4.03e-3 },
  { nom: "nickel-chrome", rho: 1.1e-6, alpha: 1.0e-4 },
  { nom: "constantan", rho: 4.9e-7, alpha: 1.0e-5 },
];

/* --------------------------------------------------------------------------
   Modèle de lampe 12 V, 21 W : filament de tungstène dont la résistance croît
   avec la température, refroidi par rayonnement et par un terme de conduction.
   Calibrage : 1,75 A sous 12 V, filament à 2700 K.
   -------------------------------------------------------------------------- */

const LAMPE = (() => {
  const alpha = 4.5e-3;
  const t0 = T_REF_K;
  const tNominal = 2700;
  const gConduction = 1.5e-3;
  const r0 = (144 / 21) / (1 + alpha * (tNominal - t0));
  const k = (21 - gConduction * (tNominal - t0)) / (Math.pow(tNominal, 4) - Math.pow(t0, 4));
  return { alpha, t0, r0, k, gConduction, uNominal: 12, iNominal: 1.75, rChaud: 144 / 21 };
})();

function resoudreLampe(tension) {
  const u = Math.max(0, tension);
  if (u === 0) return { courant: 0, temperature: LAMPE.t0, resistance: LAMPE.r0 };
  let bas = LAMPE.t0;
  let haut = 4000;
  let resistance = LAMPE.r0;
  for (let i = 0; i < 70; i += 1) {
    const t = (bas + haut) / 2;
    resistance = LAMPE.r0 * (1 + LAMPE.alpha * (t - LAMPE.t0));
    const recue = (u * u) / resistance;
    const cedee = LAMPE.k * (Math.pow(t, 4) - Math.pow(LAMPE.t0, 4)) + LAMPE.gConduction * (t - LAMPE.t0);
    if (recue > cedee) bas = t;
    else haut = t;
  }
  const temperature = (bas + haut) / 2;
  resistance = LAMPE.r0 * (1 + LAMPE.alpha * (temperature - LAMPE.t0));
  return { courant: u / resistance, temperature, resistance };
}

/* Table précalculée pour tracer la caractéristique sans résoudre à chaque image. */
const TABLE_LAMPE = (() => {
  const table = [];
  for (let i = 0; i <= 700; i += 1) {
    const u = i * 0.02;
    table.push({ u, ...resoudreLampe(u) });
  }
  return table;
})();

function courantLampe(tension) {
  const position = Math.max(0, Math.min(700, tension / 0.02));
  const rang = Math.min(699, Math.floor(position));
  const reste = position - rang;
  return TABLE_LAMPE[rang].courant + (TABLE_LAMPE[rang + 1].courant - TABLE_LAMPE[rang].courant) * reste;
}

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

/** Pseudo-hasard déterministe : la remise à zéro redonne exactement la même scène. */
function alea(a, b) {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function modulo(valeur, periode) {
  return ((valeur % periode) + periode) % periode;
}

function formaterAvecPrefixe(api, valeur, unite) {
  if (!Number.isFinite(valeur)) return "indéfini";
  const absolue = Math.abs(valeur);
  let facteur = 1;
  let prefixe = "";
  if (absolue >= 1e3) {
    facteur = 1e-3;
    prefixe = "k";
  } else if (absolue > 0 && absolue < 1e-3) {
    facteur = 1e6;
    prefixe = "µ";
  } else if (absolue > 0 && absolue < 1) {
    facteur = 1e3;
    prefixe = "m";
  }
  const echelle = Math.abs(valeur * facteur);
  const decimales = echelle >= 100 ? 1 : echelle >= 10 ? 2 : 3;
  return api.util.formaterDecimal(valeur * facteur, decimales) + " " + prefixe + unite;
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

/** Schéma SVG de correction, tracé progressivement par api.dessiner. */
function visuelSvg(conteneur, api, viewBox, contenu, libelle) {
  const cadre = document.createElement("div");
  cadre.className = "schema-vivant";
  cadre.innerHTML = '<svg viewBox="' + viewBox + '" role="img" aria-label="' + libelle + '">' + contenu + "</svg>";
  conteneur.appendChild(cadre);
  const svg = cadre.querySelector("svg");
  if (svg) ressources.push(api.dessiner(svg, { duree: 1.4 }));
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
  construireDerive(racine, api);
  construireGeometrie(racine, api);
  construireCaracteristique(racine, api);
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
    "#e-conducteur-figure svg",
    "#e-ohm-figure svg",
    "#f-schema-principal svg",
    "#h-schema-figure svg",
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
      id: "c-section-m2",
      titre: "Conversion d'une section",
      niveau: "diagnostic",
      enonce: "<p>Une section de $2{,}5\\ \\mathrm{mm^2}$ vaut combien de $\\mathrm{m^2}$ ? Répondez en notation scientifique, par exemple 2,5e-6.</p>",
      valeur: 2.5e-6,
      unite: "m²",
      tolerance: 0.02,
      chiffres: 7,
      libelleChamp: "Section en m²",
      etapes: [
        { texte: "$1\\ \\mathrm{mm} = 10^{-3}\\ \\mathrm{m}$, donc $1\\ \\mathrm{mm^2} = (10^{-3})^2\\ \\mathrm{m^2} = 10^{-6}\\ \\mathrm{m^2}$." },
        { texte: "$2{,}5\\ \\mathrm{mm^2} = 2{,}5 \\times 10^{-6}\\ \\mathrm{m^2}$.", note: "L'erreur classique consiste à écrire $10^{-3}$ : l'exposant se met au carré avec l'unité." },
      ],
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-section-disque",
      titre: "Section d'un fil rond",
      niveau: "diagnostic",
      enonce: "<p>Quelle est la section, en $\\mathrm{mm^2}$, d'un fil rond de diamètre $d = 1{,}2\\ \\mathrm{mm}$ ?</p>",
      valeur: Math.PI * 0.6 * 0.6,
      unite: "mm²",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "Section S",
      etapes: [
        { texte: "$S = \\pi d^2/4 = \\pi r^2$ avec $r = d/2 = 0{,}6\\ \\mathrm{mm}$." },
        { texte: "$S = \\pi \\times 0{,}36 = 1{,}131\\ \\mathrm{mm^2}$.", note: "Avec $\\pi d^2$ par erreur, on trouverait $4{,}52\\ \\mathrm{mm^2}$, quatre fois trop." },
      ],
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-puissance-signe",
      titre: "Puissance en convention récepteur",
      niveau: "diagnostic",
      enonce: "<p>Un dipôle repéré en convention récepteur présente $u = 230\\ \\mathrm{V}$ et $i = -2\\ \\mathrm{A}$. Que vaut la puissance $p$ qu'il reçoit, en watts ?</p>",
      valeur: -460,
      unite: "W",
      tolerance: 0.02,
      chiffres: 0,
      libelleChamp: "Puissance reçue p",
      etapes: [
        { texte: "En convention récepteur, $p = ui$ est la puissance reçue." },
        { texte: "$p = 230 \\times (-2) = -460\\ \\mathrm{W}$." },
        { texte: "Le signe négatif signifie que le dipôle fournit en réalité $460\\ \\mathrm{W}$ : ce ne peut donc pas être une simple résistance, qui reçoit toujours.", note: "C'est exactement ce que montrera la formule $p = Ri^2 \\geq 0$ de cette séance." },
      ],
    })
  );
}

/* --------------------------------------------------------------------------
   D. Simulation : dérive des électrons et collisions (lecteur et curseurs)
   -------------------------------------------------------------------------- */

function construireDerive(racine, api) {
  const conteneur = racine.querySelector("#d-derive");
  if (!conteneur) return;

  const canal = { x0: 30, x1: 610, y0: 54, y1: 176 };
  const largeur = canal.x1 - canal.x0;
  const hauteur = canal.y1 - canal.y0;
  const vitesseThermique = 110;
  const tau20 = 0.45;
  const nombre = 20;

  const svg = svgEl("svg", {
    viewBox: "0 0 640 250",
    role: "img",
    "aria-label": "Tronçon de conducteur : ions du réseau, électrons libres en agitation et en dérive, champ électrique et sens du courant",
  });
  const defs = svgEl("defs");
  const marqueur = svgEl("marker", { id: "fl-d-derive", markerWidth: 9, markerHeight: 9, refX: 6, refY: 4, orient: "auto" });
  marqueur.appendChild(svgEl("path", { d: "M0 0 8 4 0 8Z", fill: "currentColor" }));
  defs.appendChild(marqueur);
  svg.appendChild(defs);

  svg.appendChild(
    svgEl("rect", {
      x: canal.x0,
      y: canal.y0 - 8,
      width: largeur,
      height: hauteur + 16,
      rx: 10,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.6,
      opacity: 0.55,
    })
  );

  const ions = [];
  const groupeIons = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.4, opacity: 0.5 });
  const groupeSignes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11, opacity: 0.6, "text-anchor": "middle" });
  for (let colonne = 0; colonne < 12; colonne += 1) {
    for (let rang = 0; rang < 3; rang += 1) {
      const x = canal.x0 + ((colonne + 0.5) * largeur) / 12;
      const y = canal.y0 + ((rang + 0.5) * hauteur) / 3;
      const cercle = svgEl("circle", { cx: x, cy: y, r: 9 });
      const signe = texteSvg(x, y + 4, "+");
      groupeIons.appendChild(cercle);
      groupeSignes.appendChild(signe);
      ions.push({ x, y, cercle, signe, phase: alea(colonne, rang + 50) * Math.PI * 2 });
    }
  }
  svg.append(groupeIons, groupeSignes);

  const trainee = svgEl("path", {
    fill: "none",
    "stroke-width": 1.8,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    opacity: 0.85,
    style: "stroke: var(--serie-2)",
  });
  svg.appendChild(trainee);

  const electrons = [];
  for (let k = 0; k < nombre; k += 1) {
    const suivi = k === 0;
    const cercle = svgEl("circle", {
      r: suivi ? 6 : 3.4,
      fill: suivi ? "none" : "currentColor",
      stroke: suivi ? "currentColor" : "none",
      "stroke-width": suivi ? 2.4 : 0,
      style: suivi ? "fill: var(--serie-2)" : "",
    });
    svg.appendChild(cercle);
    electrons.push(cercle);
  }

  const fleches = svgEl("g", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "stroke-linecap": "round" });
  fleches.appendChild(svgEl("path", { d: "M440 24H300", "marker-end": "url(#fl-d-derive)" }));
  fleches.appendChild(svgEl("path", { d: "M240 206H400", "marker-end": "url(#fl-d-derive)" }));
  svg.appendChild(fleches);
  const legendes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  legendes.appendChild(texteSvg(452, 28, "dérive des électrons"));
  legendes.appendChild(texteSvg(320, 232, "champ E et sens conventionnel du courant I", { "text-anchor": "middle" }));
  legendes.appendChild(texteSvg(30, 28, "électron suivi : gros disque"));
  svg.appendChild(legendes);

  conteneur.appendChild(svg);

  const etat = { champ: 1.5, theta: 20, t: 0 };

  function parametres() {
    const tk = etat.theta + 273.15;
    const tau = tau20 * (T_REF_K / tk);
    const acceleration = 70 * etat.champ;
    return { tk, tau, acceleration, vd: 0.5 * acceleration * tau };
  }

  function positionBrute(k, t, tau, acceleration) {
    let x = canal.x0 + alea(k, 1) * largeur;
    let y = canal.y0 + alea(k, 2) * hauteur;
    let debut = 0;
    let fin = alea(k, 3) * tau;
    for (let segment = 0; segment < 4000; segment += 1) {
      const angle = alea(k + 0.37, 10 + segment) * Math.PI * 2;
      const vx = vitesseThermique * Math.cos(angle);
      const vy = vitesseThermique * Math.sin(angle);
      const duree = Math.min(fin, t) - debut;
      /* Le champ pousse vers la droite ; l'électron, négatif, est accéléré vers la gauche. */
      x += vx * duree - 0.5 * acceleration * duree * duree;
      y += vy * duree;
      if (fin >= t) break;
      debut = fin;
      fin += tau;
    }
    return { x, y };
  }

  function replier(point) {
    const yRelatif = modulo(point.y - canal.y0, 2 * hauteur);
    return {
      x: canal.x0 + modulo(point.x - canal.x0, largeur),
      y: canal.y0 + (yRelatif > hauteur ? 2 * hauteur - yRelatif : yRelatif),
    };
  }

  const valeurs = api.sim.valeurs("#d-derive-valeurs", [
    { id: "champ", libelle: "Champ appliqué", unite: "u.m.", decimales: 2 },
    { id: "tau", libelle: "Temps entre collisions, relatif à 20 °C", decimales: 3 },
    { id: "vd", libelle: "Vitesse de dérive", unite: "u.m.", decimales: 1 },
    { id: "resistance", libelle: "Résistance relative à 20 °C", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function tracer(t) {
    etat.t = t;
    const { tk, tau, acceleration, vd } = parametres();
    const amplitude = 1.8 * Math.sqrt(tk / T_REF_K);
    for (const ion of ions) {
      const dx = amplitude * Math.sin(2 * Math.PI * 1.7 * t + ion.phase);
      const dy = amplitude * Math.cos(2 * Math.PI * 2.3 * t + ion.phase * 1.3);
      ion.cercle.setAttribute("cx", (ion.x + dx).toFixed(2));
      ion.cercle.setAttribute("cy", (ion.y + dy).toFixed(2));
      ion.signe.setAttribute("x", (ion.x + dx).toFixed(2));
      ion.signe.setAttribute("y", (ion.y + dy + 4).toFixed(2));
    }
    electrons.forEach((cercle, k) => {
      const point = replier(positionBrute(k, t, tau, acceleration));
      cercle.setAttribute("cx", point.x.toFixed(2));
      cercle.setAttribute("cy", point.y.toFixed(2));
    });

    let chemin = "";
    let precedent = null;
    for (let i = 40; i >= 0; i -= 1) {
      const instant = t - i * 0.04;
      if (instant < 0) continue;
      const point = replier(positionBrute(0, instant, tau, acceleration));
      const saut = precedent && (Math.abs(point.x - precedent.x) > 120 || Math.abs(point.y - precedent.y) > 60);
      chemin += (precedent === null || saut ? "M" : "L") + point.x.toFixed(1) + " " + point.y.toFixed(1);
      precedent = point;
    }
    trainee.setAttribute("d", chemin);

    if (valeurs) {
      valeurs.maj({ champ: etat.champ, tau: tau / tau20, vd, resistance: tau20 / tau });
    }
  }

  const lecteur = api.sim.lecteur("#d-derive-lecteur", {
    de: 0,
    a: 30,
    duree: 30,
    boucle: true,
    auto: false,
    libelle: "Mouvement des électrons",
    rappel: (valeur) => tracer(valeur),
  });
  if (lecteur) ressources.push(lecteur);

  const curseurs = api.sim.curseurs(
    "#d-derive-curseurs",
    [
      { id: "champ", libelle: "Champ électrique appliqué (unités du modèle)", min: 0, max: 3, pas: 0.1, valeur: etat.champ },
      { id: "theta", libelle: "Température du réseau", min: -150, max: 300, pas: 10, valeur: etat.theta, unite: "°C" },
    ],
    (lues) => {
      etat.champ = lues.champ;
      etat.theta = lues.theta;
      tracer(lecteur ? lecteur.valeur() : etat.t);
    }
  );
  if (curseurs) ressources.push(curseurs);

  tracer(lecteur ? lecteur.valeur() : 0);
}

/* --------------------------------------------------------------------------
   E. Simulation : géométrie, matériau et température (poignée et curseurs)
   -------------------------------------------------------------------------- */

function construireGeometrie(racine, api) {
  const conteneur = racine.querySelector("#e-geometrie");
  if (!conteneur) return;

  const xGauche = 70;
  const xMin = 120;
  const xMax = 580;
  const yAxe = 110;
  const lMin = 2;
  const lMax = 100;
  const etat = { l: 50, s: 2.5, theta: 20, materiau: 0, i: 16 };

  const svg = svgEl("svg", {
    viewBox: "0 0 640 230",
    role: "img",
    "aria-label": "Conducteur dont la longueur se règle au point déplaçable, avec sa section, son matériau et sa température",
  });

  const fils = svgEl("g", { stroke: "currentColor", "stroke-width": 2.2, fill: "none", "stroke-linecap": "round" });
  const filGauche = svgEl("path", { d: "M26 " + yAxe + "H" + xGauche });
  const filDroit = svgEl("path");
  fils.append(filGauche, filDroit);
  svg.appendChild(fils);

  const barre = svgEl("rect", {
    x: xGauche,
    rx: 4,
    stroke: "currentColor",
    "stroke-width": 2,
    style: "fill: var(--serie-1); fill-opacity: 0.4",
  });
  svg.appendChild(barre);

  svg.appendChild(svgEl("polygon", { points: "58," + yAxe + " 46," + (yAxe - 6) + " 46," + (yAxe + 6), fill: "currentColor" }));

  const cote = svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", opacity: 0.8 });
  svg.appendChild(cote);

  const textes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  const texteI = texteSvg(40, yAxe - 12, "I", { "text-anchor": "middle" });
  const textePlus = texteSvg(xGauche - 8, yAxe - 30, "+", { "font-weight": 600 });
  const texteMoins = texteSvg(0, yAxe - 30, "-", { "font-weight": 600 });
  const texteL = texteSvg(0, 200, "", { "text-anchor": "middle" });
  const texteS = texteSvg(xGauche, 30, "");
  const texteMateriau = texteSvg(620, 30, "", { "text-anchor": "end" });
  textes.append(texteI, textePlus, texteMoins, texteL, texteS, texteMateriau);
  svg.appendChild(textes);

  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-geometrie-valeurs", [
    { id: "rho", libelle: "Résistivité à la température choisie", format: (v) => api.util.formaterDecimal(v * 1e8, 3) + " × 10⁻⁸ Ω·m" },
    { id: "r", libelle: "Résistance R", format: (v) => formaterAvecPrefixe(api, v, "Ω") },
    { id: "rapport", libelle: "R / R à 20 °C", decimales: 3 },
    { id: "du", libelle: "Chute de tension R I", format: (v) => formaterAvecPrefixe(api, v, "V") },
    { id: "p", libelle: "Pertes Joule R I²", format: (v) => formaterAvecPrefixe(api, v, "W") },
    { id: "j", libelle: "Densité de courant I / S", unite: "A/mm²", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function xDepuisL(l) {
    return xMin + ((l - lMin) / (lMax - lMin)) * (xMax - xMin);
  }

  function tracer() {
    const materiau = MATERIAUX[etat.materiau] || MATERIAUX[0];
    const xDroit = xDepuisL(etat.l);
    const epaisseur = 6 + 5.5 * Math.sqrt(etat.s);
    barre.setAttribute("y", (yAxe - epaisseur / 2).toFixed(1));
    barre.setAttribute("height", epaisseur.toFixed(1));
    barre.setAttribute("width", (xDroit - xGauche).toFixed(1));
    filDroit.setAttribute("d", "M" + xDroit.toFixed(1) + " " + yAxe + "H" + (xDroit + 34).toFixed(1));
    cote.setAttribute(
      "d",
      "M" + xGauche + " 172V186M" + xDroit.toFixed(1) + " 172V186M" + xGauche + " 179H" + xDroit.toFixed(1)
    );
    texteMoins.setAttribute("x", (xDroit + 4).toFixed(1));
    texteL.setAttribute("x", ((xGauche + xDroit) / 2).toFixed(1));
    texteL.textContent = "L = " + api.util.formaterDecimal(etat.l, 0) + " m";
    texteS.textContent = "S = " + api.util.formaterDecimal(etat.s, 1) + " mm²";
    texteMateriau.textContent = materiau.nom + ", θ = " + api.util.formaterDecimal(etat.theta, 0) + " °C";

    const facteur = 1 + materiau.alpha * (etat.theta - 20);
    const rho = materiau.rho * facteur;
    const r = (rho * etat.l) / (etat.s * 1e-6);
    if (valeurs) {
      valeurs.maj({
        rho,
        r,
        rapport: facteur,
        du: r * etat.i,
        p: r * etat.i * etat.i,
        j: etat.i / etat.s,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: xMin, y: yAxe },
    a: { x: xMax, y: yAxe },
    min: lMin,
    max: lMax,
    pas: 1,
    valeur: etat.l,
    unite: "m",
    libelle: "Longueur du conducteur",
    rappel(mesure) {
      etat.l = Math.round(mesure.valeur);
      tracer();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-geometrie-curseurs",
    [
      { id: "s", libelle: "Section S", min: 0.5, max: 50, pas: 0.5, valeur: etat.s, unite: "mm²" },
      { id: "theta", libelle: "Température θ", min: -20, max: 150, pas: 5, valeur: etat.theta, unite: "°C" },
      { id: "materiau", libelle: "Matériau", min: 0, max: 3, pas: 1, valeur: etat.materiau, format: (v) => (MATERIAUX[v] || MATERIAUX[0]).nom },
      { id: "i", libelle: "Courant I", min: 1, max: 100, pas: 1, valeur: etat.i, unite: "A" },
    ],
    (lues) => {
      etat.s = lues.s;
      etat.theta = lues.theta;
      etat.materiau = Math.round(lues.materiau);
      etat.i = lues.i;
      tracer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  tracer();
}

/* --------------------------------------------------------------------------
   E. Simulation : caractéristique courant-tension d'une lampe
   -------------------------------------------------------------------------- */

function construireCaracteristique(racine, api) {
  const conteneur = racine.querySelector("#e-caracteristique");
  if (!conteneur) return;

  const cadre = { x0: 70, x1: 600, y0: 320, y1: 40, uMax: 14, iMax: 2.2 };
  const versX = (u) => cadre.x0 + (u / cadre.uMax) * (cadre.x1 - cadre.x0);
  const versY = (i) => cadre.y0 - (i / cadre.iMax) * (cadre.y0 - cadre.y1);

  const svg = svgEl("svg", {
    viewBox: "0 0 640 380",
    role: "img",
    "aria-label": "Caractéristique courant-tension d'une lampe à filament comparée à une résistance ohmique, avec un point déplaçable, sa corde et sa tangente",
  });
  const defs = svgEl("defs");
  const marqueur = svgEl("marker", { id: "fl-e-carac", markerWidth: 9, markerHeight: 9, refX: 6, refY: 4, orient: "auto" });
  marqueur.appendChild(svgEl("path", { d: "M0 0 8 4 0 8Z", fill: "currentColor" }));
  defs.appendChild(marqueur);
  svg.appendChild(defs);

  const grille = svgEl("g", { stroke: "currentColor", "stroke-width": 1, opacity: 0.14 });
  for (let u = 2; u <= 14; u += 2) grille.appendChild(svgEl("path", { d: "M" + versX(u) + " " + cadre.y0 + "V" + cadre.y1 }));
  for (let i = 0.5; i <= 2.01; i += 0.5) grille.appendChild(svgEl("path", { d: "M" + cadre.x0 + " " + versY(i) + "H" + cadre.x1 }));
  svg.appendChild(grille);

  const axes = svgEl("g", { stroke: "currentColor", "stroke-width": 1.6, fill: "none" });
  axes.appendChild(svgEl("path", { d: "M" + cadre.x0 + " " + cadre.y0 + "H" + (cadre.x1 + 18), "marker-end": "url(#fl-e-carac)" }));
  axes.appendChild(svgEl("path", { d: "M" + cadre.x0 + " " + cadre.y0 + "V" + (cadre.y1 - 18), "marker-end": "url(#fl-e-carac)" }));
  svg.appendChild(axes);

  const graduations = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5, opacity: 0.8 });
  for (let u = 0; u <= 14; u += 2) graduations.appendChild(texteSvg(versX(u), cadre.y0 + 18, String(u), { "text-anchor": "middle" }));
  for (let i = 0.5; i <= 2.01; i += 0.5) {
    graduations.appendChild(texteSvg(cadre.x0 - 8, versY(i) + 4, api.util.formaterDecimal(i, 1), { "text-anchor": "end" }));
  }
  graduations.appendChild(texteSvg(cadre.x1 + 10, cadre.y0 + 36, "U (V)", { "text-anchor": "end" }));
  graduations.appendChild(texteSvg(cadre.x0 + 8, cadre.y1 - 8, "I (A)"));
  svg.appendChild(graduations);

  /* Droite de la résistance ohmique de même point nominal. */
  svg.appendChild(
    svgEl("path", {
      d: "M" + versX(0) + " " + versY(0) + "L" + versX(14) + " " + versY(14 / LAMPE.rChaud),
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.8,
      "stroke-dasharray": "9 6",
      opacity: 0.85,
    })
  );
  /* Droite de la résistance à froid du filament. */
  const uFroid = cadre.iMax * LAMPE.r0;
  svg.appendChild(
    svgEl("path", {
      d: "M" + versX(0) + " " + versY(0) + "L" + versX(uFroid) + " " + versY(cadre.iMax),
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.6,
      "stroke-dasharray": "2 4",
      "stroke-linecap": "round",
    })
  );
  /* Caractéristique de la lampe. */
  let chemin = "";
  for (let u = 0; u <= 14.0001; u += 0.05) {
    chemin += (u === 0 ? "M" : "L") + versX(u).toFixed(1) + " " + versY(courantLampe(u)).toFixed(1);
  }
  svg.appendChild(
    svgEl("path", { d: chemin, fill: "none", "stroke-width": 3.2, "stroke-linejoin": "round", style: "stroke: var(--serie-1)" })
  );
  svg.appendChild(
    svgEl("circle", { cx: versX(12), cy: versY(1.75), r: 5, fill: "none", stroke: "currentColor", "stroke-width": 1.6 })
  );

  const corde = svgEl("path", { fill: "none", "stroke-width": 1.6, "stroke-dasharray": "4 4", style: "stroke: var(--serie-2)" });
  const tangente = svgEl("path", { fill: "none", "stroke-width": 2.2, "stroke-linecap": "round", style: "stroke: var(--serie-4)" });
  svg.append(corde, tangente);

  const legende = svgEl("g", { "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  const lignes = [
    { attributs: { "stroke-width": 3.2, style: "stroke: var(--serie-1)" }, texte: "lampe 12 V, 21 W (trait plein épais)" },
    { attributs: { stroke: "currentColor", "stroke-width": 1.8, "stroke-dasharray": "9 6" }, texte: "résistance ohmique 6,86 Ω (tirets longs)" },
    { attributs: { stroke: "currentColor", "stroke-width": 1.6, "stroke-dasharray": "2 4" }, texte: "filament froid 0,58 Ω (pointillé court)" },
    { attributs: { "stroke-width": 1.6, "stroke-dasharray": "4 4", style: "stroke: var(--serie-2)" }, texte: "corde : résistance statique" },
    { attributs: { "stroke-width": 2.2, style: "stroke: var(--serie-4)" }, texte: "tangente : résistance dynamique" },
  ];
  lignes.forEach((ligne, rang) => {
    const y = 214 + rang * 19;
    legende.appendChild(svgEl("path", { d: "M300 " + y + "h30", fill: "none", ...ligne.attributs }));
    legende.appendChild(texteSvg(338, y + 4, ligne.texte, { fill: "currentColor" }));
  });
  legende.appendChild(texteSvg(versX(12) - 10, versY(1.75) - 14, "point nominal", { fill: "currentColor", "text-anchor": "end" }));
  svg.appendChild(legende);

  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-caracteristique-valeurs", [
    { id: "u", libelle: "Tension U", unite: "V", decimales: 2 },
    { id: "i", libelle: "Courant I", unite: "A", decimales: 3 },
    { id: "theta", libelle: "Température du filament", unite: "°C", decimales: 0 },
    { id: "rs", libelle: "Résistance statique (corde)", unite: "Ω", decimales: 2 },
    { id: "rd", libelle: "Résistance dynamique (tangente)", unite: "Ω", decimales: 2 },
    { id: "appel", libelle: "Courant à froid sous cette tension", unite: "A", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  let synchronisation = false;
  let poignee = null;
  let curseurs = null;

  function appliquer(tension, source) {
    if (synchronisation) return;
    synchronisation = true;
    const u = Math.max(0.2, Math.min(14, Number(tension)));
    const point = resoudreLampe(u);
    const h = 0.02;
    const bas = resoudreLampe(u - h).courant;
    const haut = resoudreLampe(u + h).courant;
    const rd = (2 * h) / (haut - bas);
    const px = versX(u);
    const py = versY(point.courant);
    corde.setAttribute("d", "M" + versX(0) + " " + versY(0) + "L" + px.toFixed(1) + " " + py.toFixed(1));
    const du = 1.6;
    const pente = 1 / rd;
    tangente.setAttribute(
      "d",
      "M" + versX(u - du).toFixed(1) + " " + versY(point.courant - pente * du).toFixed(1) +
        "L" + versX(Math.min(14.8, u + du)).toFixed(1) + " " + versY(point.courant + pente * (Math.min(14.8, u + du) - u)).toFixed(1)
    );
    if (valeurs) {
      valeurs.maj({
        u,
        i: point.courant,
        theta: point.temperature - 273.15,
        rs: point.resistance,
        rd,
        appel: u / LAMPE.r0,
      });
    }
    if (source !== "poignee" && poignee) poignee.set(u, false);
    if (source !== "curseur" && curseurs) curseurs.definir("u", Math.round(u * 10) / 10);
    synchronisation = false;
  }

  poignee = api.sim.poignee(conteneur, {
    type: "courbe",
    courbe: (t) => {
      const u = 0.2 + t * 13.8;
      return { x: versX(u), y: versY(courantLampe(u)) };
    },
    min: 0.2,
    max: 14,
    pas: 0.1,
    valeur: 6,
    unite: "V",
    libelle: "Point de fonctionnement sur la caractéristique de la lampe",
    diffuserAuDepart: false,
    rappel: (mesure) => appliquer(mesure.valeur, "poignee"),
  });
  if (poignee) ressources.push(poignee);

  curseurs = api.sim.curseurs(
    "#e-caracteristique-curseur",
    [{ id: "u", libelle: "Tension appliquée U", min: 0.2, max: 14, pas: 0.1, valeur: 6, unite: "V" }],
    (lues) => appliquer(lues.u, "curseur")
  );
  if (curseurs) ressources.push(curseurs);

  appliquer(6, null);
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-1",
      titre: "Résistance d'un conducteur de cuivre",
      niveau: "fondamental",
      enonce:
        "<p>Quelle est la résistance, à 20 °C, d'un conducteur de cuivre de longueur $L = 50\\ \\mathrm{m}$ et de section $S = 1{,}5\\ \\mathrm{mm^2}$ ? On prend $\\rho_{20} = 1{,}72 \\times 10^{-8}\\ \\Omega\\cdot\\mathrm{m}$.</p>",
      valeur: (1.72e-8 * 50) / 1.5e-6,
      unite: "Ω",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "Résistance R",
      etapes: [
        { texte: "Conversion : $S = 1{,}5\\ \\mathrm{mm^2} = 1{,}5 \\times 10^{-6}\\ \\mathrm{m^2}$." },
        { texte: "$R = \\rho L/S = 1{,}72 \\times 10^{-8} \\times 50 / (1{,}5 \\times 10^{-6})$." },
        { texte: "$R = 8{,}6 \\times 10^{-7} / 1{,}5 \\times 10^{-6} = 0{,}573\\ \\Omega$." },
        { texte: "Contrôle : $17{,}2\\ \\mathrm{m\\Omega}$ par mètre pour $1\\ \\mathrm{mm^2}$, donc $17{,}2 \\times 50 / 1{,}5 = 573\\ \\mathrm{m\\Omega}$.", note: "Le schéma ci-dessous reprend les données et le résultat." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 170",
          '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<path d="M20 70H60"/><rect x="60" y="56" width="420" height="28" rx="4"/><path d="M480 70H530"/>' +
            '<path d="M60 110V124M480 110V124M60 117H480"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<text x="270" y="140" text-anchor="middle">L = 50 m</text>' +
            '<text x="60" y="44">cuivre, S = 1,5 mm² = 1,5 × 10⁻⁶ m²</text>' +
            '<text x="270" y="75" text-anchor="middle">ρ = 1,72 × 10⁻⁸ Ω·m</text>' +
            '<text x="270" y="164" text-anchor="middle" font-weight="600">R = ρ L / S = 0,573 Ω</text></g>',
          "Conducteur annoté : longueur 50 mètres, section 1,5 millimètre carré, résistance 0,573 ohm"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-2",
      titre: "Puissance dissipée par une résistance",
      niveau: "fondamental",
      enonce:
        "<p>Une résistance de $47\\ \\Omega$ est parcourue par un courant continu de $0{,}2\\ \\mathrm{A}$. Quelle puissance dissipe-t-elle, en watts ? Quelle puissance nominale faut-il au minimum choisir parmi 0,5 W, 1 W, 2 W et 3 W, sachant que le cahier des charges impose de ne pas dépasser 70 % de la puissance nominale ?</p>",
      valeur: 47 * 0.2 * 0.2,
      unite: "W",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Puissance dissipée",
      etapes: [
        { texte: "Le courant est imposé : on utilise $p = Ri^2$." },
        { texte: "$p = 47 \\times 0{,}2^2 = 47 \\times 0{,}04 = 1{,}88\\ \\mathrm{W}$." },
        { texte: "Tension aux bornes : $u = Ri = 9{,}4\\ \\mathrm{V}$ ; contrôle : $u^2/R = 88{,}36/47 = 1{,}88\\ \\mathrm{W}$, cohérent." },
        { texte: "Règle de conception : $1{,}88/0{,}7 = 2{,}69\\ \\mathrm{W}$, donc une résistance de $3\\ \\mathrm{W}$.", note: "La marge de 70 % est une règle de conception, pas une loi : elle tient compte de la température ambiante et du vieillissement, et la courbe de réduction de puissance du constructeur fait foi." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Puissance dissipée en fonction du courant",
          genre: "Correction visuelle",
          xTitre: "courant",
          xUnite: "A",
          yTitre: "puissance",
          yUnite: "W",
          xMin: 0,
          xMax: 0.3,
          yMin: 0,
          yMax: 4.5,
          ratio: 0.45,
          series: [
            { id: "p", nom: "p = 47 i²", couleur: "serie-1", fonction: (i) => 47 * i * i },
            { id: "lim", nom: "70 % de 3 W", couleur: "serie-5", fonction: () => 2.1 },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 0.2, 1.88, "1,88 W à 0,2 A");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-1",
      titre: "Température d'un bobinage par variation de résistance",
      niveau: "intermédiaire",
      enonce:
        "<p>Le bobinage en cuivre d'un moteur mesure $2{,}40\\ \\Omega$ à froid, à 20 °C. Juste après un essai en charge, on mesure $2{,}94\\ \\Omega$. Quelle est la température moyenne du bobinage, en °C ? On prend $\\alpha_{20} = 3{,}93 \\times 10^{-3}\\ \\mathrm{K^{-1}}$.</p>",
      valeur: 20 + (2.94 / 2.4 - 1) / 3.93e-3,
      unite: "°C",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Température θ",
      etapes: [
        { texte: "Méthode : isoler $\\theta$ dans $R = R_{20}[1 + \\alpha_{20}(\\theta - 20)]$." },
        { texte: "$\\theta - 20 = \\dfrac{R/R_{20} - 1}{\\alpha_{20}} = \\dfrac{2{,}94/2{,}40 - 1}{3{,}93 \\times 10^{-3}} = \\dfrac{0{,}225}{3{,}93 \\times 10^{-3}} = 57{,}3\\ \\mathrm{K}$." },
        { texte: "$\\theta = 20 + 57{,}3 = 77{,}3$ °C." },
        { texte: "Interprétation : c'est une température moyenne sur tout le bobinage ; le point le plus chaud est plus chaud encore.", note: "La mesure doit être faite très vite après l'arrêt, car le bobinage refroidit : c'est une source d'incertitude à signaler." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Résistance du bobinage en fonction de sa température",
          genre: "Correction visuelle",
          xTitre: "température",
          xUnite: "°C",
          yTitre: "résistance",
          yUnite: "Ω",
          xMin: 0,
          xMax: 120,
          yMin: 2.2,
          yMax: 3.4,
          ratio: 0.45,
          series: [{ id: "r", nom: "R(θ) = 2,40 [1 + 3,93 × 10⁻³ (θ - 20)]", couleur: "serie-1", fonction: (t) => 2.4 * (1 + 3.93e-3 * (t - 20)) }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 20, 2.4, "2,40 Ω à 20 °C");
            marquerPoint(c, repere, couleurs, 77.25, 2.94, "2,94 Ω : 77,3 °C");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-2",
      titre: "Élément chauffant sous tension réduite",
      niveau: "intermédiaire",
      enonce:
        "<p>Un élément chauffant de $600\\ \\mathrm{W}$ nominal est conçu pour $48\\ \\mathrm{V}$ continus. La tension d'alimentation chute de 10 %, à $43{,}2\\ \\mathrm{V}$. En supposant sa résistance constante, quelle puissance dissipe-t-il, en watts ? Choisissez d'abord la forme de la loi de Joule adaptée.</p>",
      valeur: (43.2 * 43.2) / ((48 * 48) / 600),
      unite: "W",
      tolerance: 0.02,
      chiffres: 0,
      libelleChamp: "Puissance sous 43,2 V",
      etapes: [
        { texte: "La tension est imposée par l'alimentation : on utilise $p = u^2/R$." },
        { texte: "Résistance de l'élément : $R = U_n^2/P_n = 48^2/600 = 2304/600 = 3{,}84\\ \\Omega$." },
        { texte: "Sous $43{,}2\\ \\mathrm{V}$ : $p = 43{,}2^2/3{,}84 = 1866{,}24/3{,}84 = 486\\ \\mathrm{W}$." },
        { texte: "Lecture : une baisse de 10 % de la tension produit une baisse de 19 % de la puissance, car $0{,}9^2 = 0{,}81$.", note: "Si l'élément refroidit un peu, sa résistance baisse légèrement et la puissance réelle est un peu supérieure : l'hypothèse de résistance constante est ici une approximation." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Puissance d'un élément de 3,84 Ω en fonction de la tension",
          genre: "Correction visuelle",
          xTitre: "tension",
          xUnite: "V",
          yTitre: "puissance",
          yUnite: "W",
          xMin: 0,
          xMax: 55,
          yMin: 0,
          yMax: 800,
          ratio: 0.45,
          series: [{ id: "p", nom: "p = u² / 3,84", couleur: "serie-1", fonction: (u) => (u * u) / 3.84 }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 48, 600, "600 W");
            marquerPoint(c, repere, couleurs, 43.2, 486, "486 W");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-avance",
      titre: "Dimensionner un fil chauffant",
      niveau: "avancé",
      enonce:
        "<p>On doit réaliser un élément chauffant de $500\\ \\mathrm{W}$ sous $48\\ \\mathrm{V}$ continus avec un fil de nickel-chrome de diamètre $1{,}0\\ \\mathrm{mm}$ ($\\rho_{20} = 1{,}10 \\times 10^{-6}\\ \\Omega\\cdot\\mathrm{m}$, $\\alpha_{20} = 1{,}0 \\times 10^{-4}\\ \\mathrm{K^{-1}}$). En service, le fil est à 420 °C. Quelle longueur de fil faut-il, en mètres ?</p>",
      valeur: ((48 * 48) / 500) * (Math.PI * 0.5e-3 * 0.5e-3) / (1.1e-6 * (1 + 1e-4 * 400)),
      unite: "m",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Longueur L",
      etapes: [
        { texte: "Résistance à chaud imposée par la puissance sous tension fixée : $R = U^2/P = 48^2/500 = 4{,}608\\ \\Omega$." },
        { texte: "Résistivité à 420 °C : $\\rho = 1{,}10 \\times 10^{-6} \\times (1 + 10^{-4} \\times 400) = 1{,}144 \\times 10^{-6}\\ \\Omega\\cdot\\mathrm{m}$." },
        { texte: "Section : $S = \\pi d^2/4 = \\pi \\times (10^{-3})^2/4 = 7{,}854 \\times 10^{-7}\\ \\mathrm{m^2}$." },
        { texte: "Longueur : $L = RS/\\rho = 4{,}608 \\times 7{,}854 \\times 10^{-7} / 1{,}144 \\times 10^{-6} = 3{,}16\\ \\mathrm{m}$." },
        { texte: "Contrôles : courant $I = P/U = 10{,}4\\ \\mathrm{A}$, densité $10{,}4/0{,}785 = 13{,}3\\ \\mathrm{A/mm^2}$, plausible pour un fil chauffant nu. À froid, $R_{20} = 4{,}608/1{,}04 = 4{,}43\\ \\Omega$ et le courant d'appel vaut $10{,}8\\ \\mathrm{A}$, seulement 4 % de plus que le nominal.", note: "C'est la raison du choix du nickel-chrome : avec un métal pur comme le tungstène, le courant d'appel serait dix fois plus grand." },
      ],
      visuelCorrection(conteneur, moteur) {
        const rho = 1.1e-6 * 1.04;
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Longueur nécessaire en fonction du diamètre du fil",
          genre: "Correction visuelle",
          xTitre: "diamètre",
          xUnite: "mm",
          yTitre: "longueur",
          yUnite: "m",
          xMin: 0.4,
          xMax: 1.6,
          yMin: 0,
          yMax: 9,
          ratio: 0.45,
          series: [{ id: "l", nom: "L = R π d² / (4 ρ)", couleur: "serie-1", fonction: (d) => (4.608 * Math.PI * Math.pow(d * 1e-3, 2)) / (4 * rho) }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 1.0, 3.164, "3,16 m pour 1,0 mm");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte("#k-exercices-blocs", {
      id: "k-diagnostic",
      titre: "Borne suspecte sur un départ de 100 A",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Sur un départ triphasé chargé à $100\\ \\mathrm{A}$ par phase, on mesure au millivoltmètre la chute de tension aux bornes de chacune des trois connexions d'arrivée : $15\\ \\mathrm{mV}$, $180\\ \\mathrm{mV}$ et $16\\ \\mathrm{mV}$. Que concluez-vous, quelle puissance est dissipée dans la connexion suspecte, et quelle action recommandez-vous ?</p>",
      motsCles: [
        ["resistance de contact", "resistance", "contact"],
        ["18 w", "18w", "18 watts", "dix-huit"],
        ["serrage", "resserrer", "desserre", "oxyd", "remplacer", "nettoy"],
        ["echauffement", "point chaud", "incendie", "thermograph", "chauffe"],
      ],
      minimum: 3,
      exemple: "Calculez la résistance et la puissance de chaque connexion, comparez, puis proposez une action.",
      etapes: [
        { texte: "Résistances de contact : $R = \\Delta U/I$, soit $0{,}15$ ; $1{,}8$ et $0{,}16\\ \\mathrm{m\\Omega}$." },
        { texte: "Puissances dissipées : $\\Delta U \\cdot I$, soit $1{,}5$ ; $18$ et $1{,}6\\ \\mathrm{W}$." },
        { texte: "La deuxième connexion présente une résistance douze fois plus forte que ses voisines : serrage insuffisant ou surface oxydée. Ses $18\\ \\mathrm{W}$ concentrés chauffent la borne et accélèrent la dégradation." },
        { texte: "Action : planifier une consignation, contrôler et refaire la connexion au couple du constructeur (remplacer la cosse si elle est altérée), puis vérifier par thermographie après remise en charge.", note: "La comparaison entre phases identiques est la clé du diagnostic : elle élimine l'incertitude sur la valeur absolue attendue." },
      ],
      visuelCorrection(conteneur, moteur) {
        const spectre = moteur.sim.spectre(conteneur, {
          titre: "Puissance dissipée dans chaque connexion",
          genre: "Correction visuelle",
          xTitre: "connexion",
          yTitre: "puissance",
          unite: "W",
          barres: [
            { etiquette: "phase 1", valeur: 1.5 },
            { etiquette: "phase 2", valeur: 18 },
            { etiquette: "phase 3", valeur: 1.6 },
          ],
        });
        if (spectre) {
          if (typeof spectre.definirBarres === "function") {
            spectre.definirBarres([
              { etiquette: "phase 1", valeur: 1.5 },
              { etiquette: "phase 2", valeur: 18 },
              { etiquette: "phase 3", valeur: 1.6 },
            ]);
          }
          ressources.push(spectre);
        }
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte("#k-exercices-blocs", {
      id: "k-conceptuel",
      titre: "Pourquoi transporter l'énergie sous tension élevée",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul détaillé, expliquez pourquoi, pour transmettre une même puissance à une charge à travers une même ligne résistive, le fait d'augmenter la tension réduit les pertes Joule dans la ligne.</p>",
      motsCles: [
        ["courant", "intensite"],
        ["diminue", "plus faible", "reduit", "baisse"],
        ["carre", "quatre", "proportionnel"],
      ],
      minimum: 2,
      exemple: "Reliez la puissance transmise, la tension, le courant, puis les pertes de la ligne.",
      etapes: [
        { texte: "La puissance transmise vaut $P = UI$ : à $P$ fixée, doubler $U$ divise le courant $I$ par deux." },
        { texte: "La ligne est traversée par ce courant, qui lui est imposé : ses pertes valent $R_{ligne}\\,I^2 = R_{ligne}\\,P^2/U^2$." },
        { texte: "Doubler la tension divise donc les pertes par quatre.", note: "L'erreur à éviter : écrire les pertes $U^2/R_{ligne}$ avec la tension de service, ce qui ferait croire l'inverse. La tension aux bornes de la ligne n'est que sa petite chute de tension." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Pertes d'une ligne de 0,2 Ω transmettant 10 kW",
          genre: "Correction visuelle",
          xTitre: "tension de transport",
          xUnite: "V",
          yTitre: "pertes",
          yUnite: "W",
          xMin: 200,
          xMax: 1000,
          yMin: 0,
          yMax: 550,
          ratio: 0.45,
          series: [{ id: "p", nom: "pertes = 0,2 × (10 000 / U)²", couleur: "serie-1", fonction: (u) => 0.2 * Math.pow(10000 / u, 2) }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 250, 320, "320 W sous 250 V");
            marquerPoint(c, repere, couleurs, 500, 80, "80 W sous 500 V");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

/* Trois caractéristiques courant-tension pour la question d'interprétation. */
const DESSIN_CARACTERISTIQUES = (() => {
  const x0 = 50;
  const y0 = 220;
  let lampe = "";
  let diode = "";
  for (let i = 0; i <= 40; i += 1) {
    const u = i / 40;
    lampe += (i === 0 ? "M" : "L") + (x0 + 350 * u).toFixed(1) + " " + (y0 - 100 * Math.pow(u, 0.55)).toFixed(1);
    const courant = (Math.exp(6 * u) - 1) / (Math.exp(6) - 1);
    diode += (i === 0 ? "M" : "L") + (x0 + 280 * u).toFixed(1) + " " + (y0 - 190 * courant).toFixed(1);
  }
  return (
    '<g stroke="currentColor" stroke-width="1.6" fill="none">' +
    '<path d="M50 220H440"/><path d="M50 220V12"/>' +
    '<path d="M434 216 440 220 434 224"/><path d="M46 18 50 12 54 18"/></g>' +
    '<g stroke="currentColor" stroke-width="2.4" fill="none" stroke-linejoin="round">' +
    '<path d="M50 220L400 60"/>' +
    '<path d="' + lampe + '"/>' +
    '<path d="' + diode + '"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
    '<text x="410" y="64" font-weight="600">A</text>' +
    '<text x="410" y="126" font-weight="600">B</text>' +
    '<text x="340" y="36" font-weight="600">C</text>' +
    '<text x="440" y="240" text-anchor="end">U</text>' +
    '<text x="60" y="22">I</text></g>'
  );
})();

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Quelle est l'unité SI de la résistivité ?</p>",
        options: ["$\\Omega$", "$\\Omega\\cdot\\mathrm{m}$", "$\\Omega/\\mathrm{m}$", "$\\mathrm{S}\\cdot\\mathrm{m}$"],
        bonnes: [1],
        explication: "$\\rho = RS/L$ s'exprime en $\\Omega \\times \\mathrm{m^2}/\\mathrm{m} = \\Omega\\cdot\\mathrm{m}$. Le $\\Omega/\\mathrm{m}$ est l'unité d'une résistance linéique, propre à un câble donné.",
        resume: "Unité de la résistivité",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Doubler le diamètre d'un fil rond, à longueur et matériau identiques, divise sa résistance par deux.</p>",
        reponse: false,
        explication: "La section varie comme le carré du diamètre : doubler $d$ multiplie $S$ par quatre et divise $R$ par quatre.",
        resume: "Effet du diamètre",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la résistance, en ohms, d'un conducteur d'aluminium de $200\\ \\mathrm{m}$ et de $35\\ \\mathrm{mm^2}$ ($\\rho = 2{,}82 \\times 10^{-8}\\ \\Omega\\cdot\\mathrm{m}$) ?</p>",
        valeur: (2.82e-8 * 200) / 35e-6,
        unite: "Ω",
        tolerance: 0.03,
        chiffres: 3,
        explication: "$R = 2{,}82 \\times 10^{-8} \\times 200 / (35 \\times 10^{-6}) = 0{,}161\\ \\Omega$.",
        resume: "Résistance d'un conducteur d'aluminium",
      },
      {
        type: "courte",
        enonce: "<p>En une phrase, pourquoi la résistance d'un métal augmente-t-elle avec la température ?</p>",
        motsCles: [["collision", "choc", "vibration", "agitation", "diffusion"]],
        minimum: 1,
        explication: "Les vibrations du réseau cristallin augmentent avec la température et multiplient les collisions des électrons : le temps moyen entre deux collisions diminue, donc la conductivité aussi.",
        resume: "Effet de la température sur un métal",
      },
      {
        type: "calcul",
        enonce: "<p>Une résistance de $100\\ \\Omega$ est parcourue par $50\\ \\mathrm{mA}$. Quelle puissance dissipe-t-elle, en watts ?</p>",
        valeur: 0.25,
        unite: "W",
        chiffres: 2,
        explication: "$p = Ri^2 = 100 \\times 0{,}05^2 = 0{,}25\\ \\mathrm{W}$.",
        resume: "Puissance dans une résistance",
      },
      {
        type: "qcm",
        enonce: "<p>Un câble de résistance $R_c$ alimente une charge sous la tension de réseau $U$ ; la charge appelle le courant $I$. Quelle expression donne les pertes dans le câble ?</p>",
        options: ["$U^2/R_c$", "$R_c\\,I^2$", "$U\\,I$", "$U^2/R_c - U\\,I$"],
        bonnes: [1],
        explication: "Le courant est imposé par la charge : les pertes valent $R_c I^2$. La formule $u^2/R$ exigerait la tension aux bornes du câble, c'est-à-dire sa chute de tension, et non $U$.",
        resume: "Pertes dans un câble",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Pour une diode, le rapport $U/I$ en un point de fonctionnement est égal à la pente de la tangente à sa caractéristique en ce point.</p>",
        reponse: false,
        explication: "$U/I$ est la résistance statique, pente de la corde depuis l'origine ; la résistance dynamique est la pente de la tangente. Elles ne coïncident que pour un dipôle ohmique.",
        resume: "Résistance statique et dynamique",
      },
      {
        type: "calcul",
        enonce: "<p>Un conducteur de cuivre vaut $1{,}000\\ \\Omega$ à 20 °C. Que vaut sa résistance à 90 °C, en ohms ($\\alpha_{20} = 3{,}93 \\times 10^{-3}\\ \\mathrm{K^{-1}}$) ?</p>",
        valeur: 1 + 3.93e-3 * 70,
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$R = 1 \\times (1 + 3{,}93 \\times 10^{-3} \\times 70) = 1{,}275\\ \\Omega$, soit 27,5 % de plus qu'à 20 °C.",
        resume: "Correction de température",
      },
      {
        type: "schema",
        enonce: "<p>Les trois courbes représentent le courant $I$ en fonction de la tension $U$ pour trois dipôles. Laquelle est la caractéristique d'un dipôle ohmique ?</p>",
        consigne: "Cliquez sur l'étiquette de la courbe correspondante.",
        viewBox: "0 0 460 250",
        dessin: DESSIN_CARACTERISTIQUES,
        zones: [
          { x: 388, y: 40, largeur: 60, hauteur: 40, etiquette: "courbe A", juste: true },
          { x: 388, y: 102, largeur: 60, hauteur: 40, etiquette: "courbe B" },
          { x: 318, y: 12, largeur: 60, hauteur: 40, etiquette: "courbe C" },
        ],
        explication: "La courbe A est une droite passant par l'origine : $U/I$ est constant, c'est un dipôle ohmique. B s'infléchit vers l'axe des tensions (lampe à filament), C reste presque nulle puis monte brutalement (diode).",
        resume: "Reconnaître une caractéristique ohmique",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi calcule-t-on la chute de tension d'une liaison bifilaire de longueur $\\ell$ avec une longueur de $2\\ell$ ?</p>",
        motsCles: [["aller", "retour", "deux conducteurs", "boucle", "deux fils"]],
        minimum: 1,
        explication: "Le courant parcourt le conducteur aller puis le conducteur retour : les deux résistances sont en série dans la boucle, soit une longueur totale de $2\\ell$.",
        resume: "Facteur deux de la liaison bifilaire",
      },
    ],
    { titre: "Dix questions sur la loi d'Ohm et la résistivité" }
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
      { categorie: "Définition", question: "Quelle différence entre résistivité et résistance ?", reponse: "La résistivité $\\rho$ ($\\Omega\\cdot\\mathrm{m}$) caractérise un matériau ; la résistance $R$ ($\\Omega$) caractérise un objet, via sa géométrie." },
      { categorie: "Formule", question: "Comment calcule-t-on la résistance d'un conducteur homogène ?", reponse: "$R = \\rho L/S$, avec $S$ en $\\mathrm{m^2}$ et $L$ la longueur réellement parcourue." },
      { categorie: "Repère", question: "Quel ordre de grandeur retenir pour le cuivre ?", reponse: "Environ $17\\ \\mathrm{m\\Omega}$ par mètre pour une section de $1\\ \\mathrm{mm^2}$, à 20 °C." },
      { categorie: "Loi locale", question: "Quelle est la forme locale de la loi d'Ohm ?", reponse: "$\\vec{j} = \\sigma\\vec{E}$, avec $\\sigma = n e^2 \\tau/m$ dans le modèle de Drude." },
      { categorie: "Ordre de grandeur", question: "À quelle vitesse dérivent les électrons dans un câble ?", reponse: "De l'ordre du millimètre par seconde ; l'énergie, elle, est transportée par le champ, presque à la vitesse de la lumière." },
      { categorie: "Température", question: "Comment varie la résistance du cuivre avec la température ?", reponse: "$R = R_{20}[1 + 3{,}93 \\times 10^{-3}(\\theta - 20)]$, soit environ $+0{,}4\\ \\%$ par degré et $+20\\ \\%$ à 70 °C." },
      { categorie: "Méthode", question: "Quand utiliser $Ri^2$ plutôt que $u^2/R$ ?", reponse: "$Ri^2$ quand le courant est imposé (câble, conducteur en série avec une charge), $u^2/R$ quand la tension est imposée (élément chauffant sur une alimentation)." },
      { categorie: "Non-linéarité", question: "Qu'est-ce qui distingue résistance statique et dynamique ?", reponse: "$R_s = U/I$ est la pente de la corde depuis l'origine, $r_d = \\mathrm{d}u/\\mathrm{d}i$ la pente de la tangente au point de fonctionnement." },
      { categorie: "Industriel", question: "Pourquoi une lampe à incandescence appelle-t-elle un fort courant à l'allumage ?", reponse: "Son filament froid a une résistance environ douze fois plus faible qu'à chaud : le courant initial est une dizaine de fois le courant nominal." },
      {
        categorie: "Vigilance",
        question: "Quelles sont les deux fautes les plus fréquentes dans un calcul de câble ?",
        reponse: "Oublier que $1\\ \\mathrm{mm^2} = 10^{-6}\\ \\mathrm{m^2}$, et oublier le conducteur retour ($2\\ell$).",
        rappel: "Ajouter la correction de température pour un dimensionnement.",
      },
    ],
    { titre: "Dix cartes sur la loi d'Ohm et la résistivité" }
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
        enonce: "<p>Quelle est la résistance, en ohms, de $100\\ \\mathrm{m}$ de conducteur de cuivre de $2{,}5\\ \\mathrm{mm^2}$ à 20 °C ?</p>",
        valeur: (1.72e-8 * 100) / 2.5e-6,
        unite: "Ω",
        tolerance: 0.03,
        chiffres: 3,
        explication: "$R = 1{,}72 \\times 10^{-8} \\times 100 / (2{,}5 \\times 10^{-6}) = 0{,}688\\ \\Omega$.",
        resume: "Résistance d'un conducteur (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Une lampe à incandescence présente la même résistance à froid et en fonctionnement.</p>",
        reponse: false,
        explication: "Le filament de tungstène passe d'environ 20 °C à plus de 2 000 °C : sa résistance est multipliée par une douzaine.",
        resume: "Résistance d'un filament (cette séance)",
      },
      {
        type: "courte",
        enonce: "<p>Pour dimensionner la section d'un câble en cuivre, pourquoi faut-il utiliser la résistivité à la température maximale de service plutôt qu'à 20 °C ?</p>",
        motsCles: [["augmente", "plus grande", "plus elevee", "hausse"], ["chute", "pertes", "securite", "majorant", "pire cas", "defavorable"]],
        minimum: 2,
        explication: "La résistivité augmente avec la température (environ 20 % entre 20 °C et 70 °C) : calculer à chaud donne la chute de tension et les pertes les plus défavorables, donc un dimensionnement sûr.",
        resume: "Température de dimensionnement (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Une source réelle de f.é.m. $E = 24\\ \\mathrm{V}$ et de résistance interne $r = 0{,}5\\ \\Omega$ débite $4\\ \\mathrm{A}$. Quelle est la tension à ses bornes, en volts ?</p>",
        valeur: 22,
        unite: "V",
        chiffres: 1,
        explication: "$U = E - rI = 24 - 0{,}5 \\times 4 = 22\\ \\mathrm{V}$, révisé du cours Tension, courant, charge et puissance. La résistance interne $r$ obéit elle-même à la loi d'Ohm.",
        resume: "Source réelle (cours précédent)",
      },
      {
        type: "qcm",
        enonce: "<p>Un dipôle repéré en convention récepteur présente une puissance $p = ui$ négative. Que peut-on en conclure ?</p>",
        options: [
          { texte: "Il fournit réellement de l'énergie au reste du circuit.", juste: true },
          { texte: "Il y a nécessairement une erreur de calcul." },
          { texte: "Il s'agit forcément d'une résistance." },
          { texte: "Il reçoit davantage d'énergie qu'en convention générateur." },
        ],
        explication: "En convention récepteur, $p < 0$ signifie que le dipôle fournit de l'énergie, révisé du cours Tension, courant, charge et puissance. Une résistance, avec $p = Ri^2 \\geq 0$, ne peut jamais être dans ce cas.",
        resume: "Signe de la puissance (cours précédent)",
      },
      {
        type: "qcm",
        enonce: "<p>Combien vaut $0{,}75\\ \\mathrm{mm^2}$ en $\\mathrm{m^2}$ ?</p>",
        options: ["$7{,}5 \\times 10^{-4}\\ \\mathrm{m^2}$", "$7{,}5 \\times 10^{-7}\\ \\mathrm{m^2}$", "$7{,}5 \\times 10^{-6}\\ \\mathrm{m^2}$", "$0{,}75 \\times 10^{-3}\\ \\mathrm{m^2}$"],
        bonnes: [1],
        explication: "$0{,}75 \\times 10^{-6} = 7{,}5 \\times 10^{-7}\\ \\mathrm{m^2}$ : préfixes et notation scientifique, révisés du cours Diagnostic initial et remise à niveau mathématique.",
        resume: "Préfixes et notation scientifique (cours le plus ancien)",
      },
    ],
    { titre: "Révision espacée : cette séance, le cours précédent et le cours le plus ancien" }
  );
  if (quiz) ressources.push(quiz);
}

/* --------------------------------------------------------------------------
   P. Auto-évaluation
   -------------------------------------------------------------------------- */

function construireAutoEval(racine, api) {
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur la loi d'Ohm et la résistivité ?",
  });
  if (auto) ressources.push(auto);
}
