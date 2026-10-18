/* ==========================================================================
   cours/revision-4-et-mini-projet-qualite-reseau/cours.js
   Révision 4 et mini-projet qualité réseau : triphasé, courant du neutre et
   rangs homopolaires, propagation des harmoniques au jeu de barres,
   résonance de la compensation, self anti-harmonique, architecture d'un
   analyseur et stratégie de mesure et de correction du tableau général.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;

/* --------------------------------------------------------------------------
   Modèle du jeu de barres du site, rang par rang
   -------------------------------------------------------------------------- */

const V = 230;
const OMEGA = TAU * 50;
/** Réactance de source pour S_cc = 2,5 MVA sous 400 V. */
const XS_SITE = (400 * 400) / 2.5e6;
/** Compensation du compresseur : 2,48 kvar par phase. */
const Q_SITE = 2480;
/** Fondamental du courant de la pompe : créneaux de 120 degrés, 50 A efficaces vrais. */
const I1_POMPE = ((50 * Math.sqrt(1.5) * 2 * Math.sqrt(3)) / Math.PI) / Math.SQRT2;
const RANGS = [5, 7, 11, 13, 17, 19];
const CONFIG_SITE = { xs: XS_SITE, r: 10, q: Q_SITE, p: 0, r1719: 0.02 };

/** Courants harmoniques de la pompe : I1/h aux rangs 5 à 13, relevé supposé aux rangs 17 et 19. */
function courantsPompe(r1719) {
  return RANGS.map((h) => ({
    h,
    i: h >= 17 ? r1719 * I1_POMPE : I1_POMPE / h,
    signe: Math.cos((h * Math.PI) / 6) < 0 ? -1 : 1,
  }));
}

/** Réactance de la branche des condensateurs au rang h ; null sans compensation. */
function reactanceBranche(h, cfg) {
  if (!(cfg.q > 0)) return null;
  const xc = (V * V) / (cfg.q * (1 - cfg.p));
  let xb = xc * (cfg.p * h - 1 / h);
  if (Math.abs(xb) < 1e-9) xb = 1e-9;
  return xb;
}

/** Impédance vue du jeu de barres au rang h (h réel). */
function impedance(h, cfg) {
  let re = cfg.r > 0 ? 1 / cfg.r : 0;
  let im = -1 / (h * cfg.xs);
  const xb = reactanceBranche(h, cfg);
  if (xb !== null) im += -1 / xb;
  const module2 = re * re + im * im;
  return { module: 1 / Math.sqrt(module2), argument: -Math.atan2(im, re) };
}

/** Bilan harmonique complet du jeu de barres pour une configuration. */
function bilanJeuDeBarres(cfg) {
  const tensions = courantsPompe(cfg.r1719).map((rang) => {
    const z = impedance(rang.h, cfg);
    return { ...rang, z: z.module, arg: z.argument, v: z.module * rang.i };
  });
  const thd = Math.sqrt(tensions.reduce((s, t) => s + t.v * t.v, 0)) / V;
  let rapportBranche = null;
  let vc1 = null;
  if (cfg.q > 0) {
    const ib1 = cfg.q / V;
    let somme = ib1 * ib1;
    for (const t of tensions) {
      const ib = t.v / Math.abs(reactanceBranche(t.h, cfg));
      somme += ib * ib;
    }
    rapportBranche = Math.sqrt(somme) / ib1;
    vc1 = V / (1 - cfg.p);
  }
  return { tensions, thd, rapportBranche, vc1, ib1: cfg.q > 0 ? cfg.q / V : 0 };
}

/** Rang du maximum d'impédance entre 1 et 30 : la résonance parallèle. */
function rangResonance(cfg) {
  if (!(cfg.q > 0)) return null;
  let meilleur = { z: 0, h: 1 };
  for (let k = 100; k <= 3000; k += 1) {
    const h = k / 100;
    const z = impedance(h, cfg).module;
    if (z > meilleur.z) meilleur = { z, h };
  }
  return meilleur;
}

/** Tension du jeu de barres et chute harmonique à l'angle theta (radians). */
function tensionJeuDeBarres(theta, bilan) {
  const vs = V * Math.SQRT2 * Math.sin(theta);
  let chute = 0;
  for (const t of bilan.tensions) chute -= Math.SQRT2 * t.v * t.signe * Math.sin(t.h * theta + t.arg);
  return { vs, chute, vbus: vs + chute };
}

/* --------------------------------------------------------------------------
   Outils graphiques
   -------------------------------------------------------------------------- */

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function svgTexte(x, y, contenu, attributs = {}) {
  const element = svgEl("text", { x, y, ...attributs });
  element.textContent = contenu;
  return element;
}

function marqueurSvg(id) {
  const defs = svgEl("defs");
  const marker = svgEl("marker", {
    id,
    markerUnits: "userSpaceOnUse",
    markerWidth: 10,
    markerHeight: 10,
    refX: 8,
    refY: 4,
    orient: "auto-start-reverse",
  });
  marker.appendChild(svgEl("path", { d: "M0 0 9 4 0 8Z", fill: "currentColor" }));
  defs.appendChild(marker);
  return defs;
}

function nombre(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
}

/** Lignes verticales en tirets aux rangs injectés par la pompe. */
function lignesRangs(c, repere, couleurs, rangs = RANGS) {
  c.save();
  c.setLineDash([5, 5]);
  c.strokeStyle = couleurs.texte;
  c.globalAlpha = 0.55;
  c.lineWidth = 1;
  c.font = POLICE;
  c.fillStyle = couleurs.texte;
  c.textAlign = "center";
  for (const h of rangs) {
    const x = repere.versX(h);
    if (x < repere.boite.x || x > repere.boite.x + repere.boite.l) continue;
    c.beginPath();
    c.moveTo(x, repere.boite.y);
    c.lineTo(x, repere.boite.y + repere.boite.h);
    c.stroke();
    c.globalAlpha = 0.9;
    c.fillText(String(h), x, repere.boite.y + 11);
    c.globalAlpha = 0.55;
  }
  c.restore();
}

/** Ligne verticale en tirets avec libellé. */
function ligneV(c, repere, couleurs, x, libelle) {
  const px = repere.versX(x);
  if (px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
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
    const aGauche = px > repere.boite.x + repere.boite.l * 0.7;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

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

function spectreCorrection(moteur, conteneur, options, barres) {
  const spectre = moteur.sim.spectre(conteneur, { genre: "Correction visuelle", ratio: 0.42, ...options });
  if (spectre) {
    spectre.definirBarres(barres);
    ressources.push(spectre);
  }
  return spectre;
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
  construireTensionDeformee(racine, api);
  construireEtoile(racine, api);
  construireNeutre(racine, api);
  construireImpedance(racine, api);
  construireSemaine(racine, api);
  construireJeuDeBarres(racine, api);
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
    ["#d-chemin-figure svg", 1.8],
    ["#e-modele-figure svg", 1.6],
    ["#f-schema-principal svg", 2],
    ["#h-unifilaire-figure svg", 1.8],
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
    api.exercice.qcm("#c-minitest", {
      id: "c-puissance-triphasee",
      titre: "Puissance d'une charge triphasée",
      niveau: "prérequis",
      enonce:
        "<p>Une charge triphasée équilibrée absorbe $32\\ \\mathrm{A}$ en ligne sous $400\\ \\mathrm{V}$ entre phases, avec $\\cos\\varphi = 0{,}80$. Quelle est sa puissance active ?</p>",
      options: [
        { texte: "$17{,}7\\ \\mathrm{kW}$", juste: true },
        { texte: "$30{,}7\\ \\mathrm{kW}$" },
        { texte: "$10{,}2\\ \\mathrm{kW}$" },
        { texte: "$5{,}9\\ \\mathrm{kW}$" },
      ],
      etapes: [
        { texte: "$P = \\sqrt{3}\\,UI\\cos\\varphi$ avec $U$ tension composée et $I$ courant de ligne." },
        { texte: "$P = 1{,}732 \\times 400 \\times 32 \\times 0{,}80 = 17\\,736\\ \\mathrm{W} = 17{,}7\\ \\mathrm{kW}$." },
        {
          texte: "Les autres réponses oublient $\\sqrt{3}$ ($10{,}2$), le comptent deux fois ($30{,}7$) ou n'utilisent qu'une phase ($5{,}9$).",
          note: "Contrôle : $3VI\\cos\\varphi = 3 \\times 230 \\times 32 \\times 0{,}8 = 17{,}7\\ \\mathrm{kW}$, même résultat.",
        },
      ],
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-parseval",
      titre: "Valeur efficace vraie d'un courant déformé",
      niveau: "prérequis",
      enonce:
        "<p>Un courant contient un fondamental de $40\\ \\mathrm{A}$, un rang 5 de $8\\ \\mathrm{A}$ et un rang 7 de $6\\ \\mathrm{A}$, en valeurs efficaces. Quelle est sa valeur efficace vraie ?</p>",
      valeur: Math.sqrt(1600 + 64 + 36),
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Valeur efficace vraie",
      etapes: [
        { texte: "Parseval : $I^2 = I_1^2 + I_5^2 + I_7^2 = 1600 + 64 + 36 = 1700\\ \\mathrm{A^2}$." },
        { texte: "$I = \\sqrt{1700} = 41{,}23\\ \\mathrm{A}$, et $\\mathrm{THD}_I = \\sqrt{64 + 36}/40 = 25\\ \\%$." },
        { texte: "Contrôle : $I_1\\sqrt{1 + 0{,}25^2} = 40 \\times 1{,}0308 = 41{,}23\\ \\mathrm{A}$.", note: "La somme arithmétique, $54\\ \\mathrm{A}$, n'a aucun sens physique." },
      ],
      visuelCorrection(conteneur, moteur) {
        spectreCorrection(
          moteur,
          conteneur,
          { titre: "Spectre du courant", xTitre: "rang", yTitre: "valeur efficace", unite: "A" },
          [
            { etiquette: "H1", valeur: 40 },
            { etiquette: "H5", valeur: 8 },
            { etiquette: "H7", valeur: 6 },
            { etiquette: "TRMS", valeur: Math.sqrt(1700), couleur: "serie-5" },
          ]
        );
      },
    })
  );

  ressources.push(
    api.exercice.qcm("#c-minitest", {
      id: "c-passe-bas",
      titre: "Atténuation d'un passe-bas",
      niveau: "prérequis",
      enonce:
        "<p>Un passe-bas du premier ordre a une coupure de $50\\ \\mathrm{Hz}$. Quel est son gain, en rapport de tensions, à $250\\ \\mathrm{Hz}$ ?</p>",
      options: [
        { texte: "$0{,}196$", juste: true },
        { texte: "$0{,}707$" },
        { texte: "$0{,}200$, exactement $50/250$" },
        { texte: "$0{,}040$" },
      ],
      etapes: [
        { texte: "$G = 1/\\sqrt{1 + (f/f_c)^2} = 1/\\sqrt{1 + 25} = 1/\\sqrt{26}$." },
        { texte: "$G = 0{,}196$, soit $-14{,}1\\ \\mathrm{dB}$." },
        { texte: "$0{,}200$ est l'asymptote $f_c/f$, très proche ici car $f = 5f_c$ ; $0{,}707$ est le gain à la coupure." },
      ],
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : la tension déformée du jeu de barres
   -------------------------------------------------------------------------- */

function construireTensionDeformee(racine, api) {
  const conteneur = racine.querySelector("#d-tension");
  if (!conteneur) return;

  const x0 = 60;
  const x1 = 620;
  const y0 = 165;
  const ky = 125 / 360;
  const yPiste = 314;
  const versX = (deg) => x0 + ((x1 - x0) * deg) / 360;
  const versY = (v) => y0 - v * ky;

  const svg = svgEl("svg", {
    viewBox: "0 0 660 350",
    role: "img",
    "aria-label": "Tension de la source, tension du jeu de barres et chute harmonique sur une période, instant réglable",
  });

  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.3", opacity: "0.6" });
  fond.appendChild(svgEl("path", { d: "M" + x0 + " " + y0 + "H" + x1 }));
  fond.appendChild(svgEl("path", { d: "M" + x0 + " 36V294" }));
  fond.appendChild(svgEl("path", { d: "M" + x0 + " " + yPiste + "H" + x1 }));
  for (const deg of [0, 90, 180, 270, 360]) fond.appendChild(svgEl("path", { d: "M" + versX(deg) + " " + (yPiste - 5) + "v10" }));
  for (const v of [325.3, -325.3]) fond.appendChild(svgEl("path", { d: "M" + (x0 - 5) + " " + versY(v) + "h10" }));
  svg.appendChild(fond);

  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "12" });
  etiquettes.appendChild(svgTexte(x0 + 6, 30, "tension par rapport à N (V)"));
  etiquettes.appendChild(svgTexte(x0 - 8, versY(325.3) + 4, "325", { "text-anchor": "end" }));
  etiquettes.appendChild(svgTexte(x0 - 8, versY(-325.3) + 4, "-325", { "text-anchor": "end" }));
  etiquettes.appendChild(svgTexte(x0 - 8, y0 + 4, "0", { "text-anchor": "end" }));
  for (const deg of [0, 90, 180, 270, 360]) etiquettes.appendChild(svgTexte(versX(deg), yPiste + 22, String(deg), { "text-anchor": "middle" }));
  etiquettes.appendChild(svgTexte(x1, yPiste - 10, "ωt (degrés)", { "text-anchor": "end" }));
  svg.appendChild(etiquettes);

  const courbeSource = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-dasharray": "7 5", opacity: "0.8" });
  const courbeChute = svgEl("path", { fill: "none", "stroke-width": "1.4", style: "stroke: var(--serie-5)" });
  const courbeBus = svgEl("path", { fill: "none", "stroke-width": "3", "stroke-linejoin": "round", style: "stroke: var(--serie-1)" });
  const curseurTemps = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.2", "stroke-dasharray": "2 4" });
  svg.append(courbeSource, courbeChute, courbeBus, curseurTemps);

  const legende = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11.5" });
  legende.appendChild(svgTexte(x1 - 4, 48, "tirets : v_s ; trait épais : v_bus", { "text-anchor": "end" }));
  legende.appendChild(svgTexte(x1 - 4, 64, "trait fin : (v_bus - v_s) x 5", { "text-anchor": "end" }));
  svg.appendChild(legende);

  conteneur.appendChild(svg);
  ressources.push(api.dessiner([fond, etiquettes], { duree: 1 }));

  /* Tension de source : fixe */
  const pointsSource = [];
  for (let i = 0; i <= 360; i += 2) pointsSource.push((i ? "L" : "M") + versX(i).toFixed(1) + " " + versY(V * Math.SQRT2 * Math.sin(i * DEG)).toFixed(1));
  courbeSource.setAttribute("d", pointsSource.join(" "));

  const valeurs = api.sim.valeurs("#d-tension-valeurs", [
    { id: "angle", libelle: "Angle ωt", unite: "°", decimales: 0 },
    { id: "temps", libelle: "Instant", unite: "ms", decimales: 2 },
    { id: "vs", libelle: "v_s", unite: "V", decimales: 1 },
    { id: "vbus", libelle: "v_bus", unite: "V", decimales: 1 },
    { id: "chute", libelle: "Chute harmonique", unite: "V", decimales: 1 },
    { id: "thd", libelle: "THD de v_bus", unite: "%", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const etat = { angle: 75, condensateurs: 1, r: 10 };
  let bilan = bilanJeuDeBarres({ ...CONFIG_SITE });
  let poignee = null;
  let lecteur = null;
  let synchro = false;

  function tracerCourbes() {
    const bus = [];
    const chute = [];
    for (let i = 0; i <= 720; i += 1) {
      const deg = i / 2;
      const t = tensionJeuDeBarres(deg * DEG, bilan);
      bus.push((i ? "L" : "M") + versX(deg).toFixed(1) + " " + versY(t.vbus).toFixed(1));
      chute.push((i ? "L" : "M") + versX(deg).toFixed(1) + " " + versY(5 * t.chute).toFixed(1));
    }
    courbeBus.setAttribute("d", bus.join(" "));
    courbeChute.setAttribute("d", chute.join(" "));
  }

  function majInstant() {
    const t = tensionJeuDeBarres(etat.angle * DEG, bilan);
    curseurTemps.setAttribute("d", "M" + versX(etat.angle).toFixed(1) + " 36V" + yPiste);
    if (valeurs) {
      valeurs.maj({
        angle: etat.angle,
        temps: (etat.angle / 360) * 20,
        vs: t.vs,
        vbus: t.vbus,
        chute: t.chute,
        thd: bilan.thd * 100,
      });
    }
  }

  function recalculer() {
    bilan = bilanJeuDeBarres({ ...CONFIG_SITE, r: etat.r, q: etat.condensateurs ? Q_SITE : 0 });
    tracerCourbes();
    majInstant();
  }

  function appliquerAngle(valeur, source) {
    if (synchro) return;
    synchro = true;
    etat.angle = Math.max(0, Math.min(360, Number(valeur)));
    majInstant();
    if (source !== "poignee" && poignee) poignee.set(etat.angle, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(etat.angle);
    synchro = false;
  }

  poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: x0, y: yPiste },
    a: { x: x1, y: yPiste },
    min: 0,
    max: 360,
    pas: 5,
    valeur: etat.angle,
    unite: "°",
    libelle: "Instant observé sur la période",
    diffuserAuDepart: false,
    rappel: (mesure) => appliquerAngle(mesure.valeur, "poignee"),
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-tension-curseurs",
    [
      {
        id: "condensateurs",
        libelle: "Condensateurs du compresseur",
        min: 0,
        max: 1,
        pas: 1,
        valeur: 1,
        format: (v) => (v >= 0.5 ? "en service" : "hors service"),
      },
      { id: "r", libelle: "Amortissement R", min: 5, max: 60, pas: 1, valeur: 10, unite: "Ω" },
    ],
    (lues) => {
      etat.condensateurs = lues.condensateurs >= 0.5 ? 1 : 0;
      etat.r = lues.r;
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#d-tension-lecteur", {
    de: 0,
    a: 360,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Parcours de la période",
    rappel: (valeur) => appliquerAngle(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  recalculer();
  appliquerAngle(etat.angle, null);
}

/* --------------------------------------------------------------------------
   E. Animation : l'étoile des courants du départ atelier
   -------------------------------------------------------------------------- */

const COURANTS_ATELIER = [
  { nom: "I1", module: 3000 / 230, phase: 0, couleur: "var(--serie-1)" },
  { nom: "I2", module: 2400 / (230 * 0.75), phase: -120 - Math.acos(0.75) / DEG, couleur: "var(--serie-3)" },
  { nom: "I3", module: 600 / (230 * 0.95), phase: 120 + Math.acos(0.95) / DEG, couleur: "var(--serie-4)" },
];

function construireEtoile(racine, api) {
  const conteneur = racine.querySelector("#e-etoile");
  if (!conteneur) return;

  const centre = { x: 220, y: 190 };
  const k = 10;
  const rayon = 168;
  const xAxe = 470;

  const svg = svgEl("svg", {
    viewBox: "0 0 640 380",
    role: "img",
    "aria-label": "Phaseurs tournants des trois courants du départ atelier et de leur somme, le courant du neutre",
  });
  svg.appendChild(marqueurSvg("fl-e-etoile"));

  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.2", opacity: "0.5" });
  fond.appendChild(svgEl("circle", { cx: centre.x, cy: centre.y, r: rayon }));
  fond.appendChild(svgEl("path", { d: "M" + (centre.x - rayon - 20) + " " + centre.y + "H" + (centre.x + rayon + 20) }));
  fond.appendChild(svgEl("path", { d: "M" + centre.x + " " + (centre.y - rayon - 14) + "V" + (centre.y + rayon + 14) }));
  fond.appendChild(svgEl("path", { d: "M" + xAxe + " 30V350" }));
  fond.appendChild(svgEl("path", { d: "M" + (xAxe - 6) + " " + centre.y + "h12" }));
  svg.appendChild(fond);

  const textesFond = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "12" });
  textesFond.appendChild(svgTexte(xAxe + 8, 34, "projection verticale"));
  textesFond.appendChild(svgTexte(xAxe + 8, 50, "(A efficaces x sin)"));
  textesFond.appendChild(svgTexte(xAxe - 10, centre.y - 6, "0", { "text-anchor": "end" }));
  textesFond.appendChild(svgTexte(20, 24, "échelle : 10 px par ampère efficace"));
  svg.appendChild(textesFond);

  const tension = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.2", opacity: "0.75" });
  const texteTension = svgTexte(0, 0, "V1", { fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "12" });
  svg.append(tension, texteTension);

  const phaseurs = COURANTS_ATELIER.map((courant) => {
    const trait = svgEl("path", {
      fill: "none",
      "stroke-width": "2.2",
      "stroke-linecap": "round",
      "marker-end": "url(#fl-e-etoile)",
      style: "stroke: " + courant.couleur,
    });
    const chaine = svgEl("path", { fill: "none", "stroke-width": "1.6", "stroke-dasharray": "6 4", style: "stroke: " + courant.couleur });
    const etiquette = svgTexte(0, 0, courant.nom, {
      "font-family": "ui-monospace, monospace",
      "font-size": "12.5",
      "font-weight": "600",
      style: "fill: " + courant.couleur,
    });
    const projection = svgEl("path", { fill: "none", "stroke-width": "1", "stroke-dasharray": "2 4", style: "stroke: " + courant.couleur });
    const repere = svgEl("circle", { r: 4, style: "fill: " + courant.couleur });
    const texteRepere = svgTexte(0, 0, courant.nom, {
      "font-family": "ui-monospace, monospace",
      "font-size": "11.5",
      style: "fill: " + courant.couleur,
    });
    svg.append(chaine, trait, etiquette, projection, repere, texteRepere);
    return { ...courant, trait, chaine, etiquette, projection, repere, texteRepere };
  });

  const neutre = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "3.6", "stroke-linecap": "round", "marker-end": "url(#fl-e-etoile)" });
  const texteNeutre = svgTexte(0, 0, "IN", { fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "12.5", "font-weight": "700" });
  const projectionNeutre = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "2 4" });
  const repereNeutre = svgEl("rect", { width: 9, height: 9, fill: "currentColor" });
  const texteRepereNeutre = svgTexte(0, 0, "IN", { fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "11.5", "font-weight": "700" });
  svg.append(neutre, texteNeutre, projectionNeutre, repereNeutre, texteRepereNeutre);

  conteneur.appendChild(svg);
  ressources.push(api.dessiner([fond, textesFond], { duree: 0.9 }));

  const somme = COURANTS_ATELIER.reduce(
    (acc, c) => ({ re: acc.re + c.module * Math.cos(c.phase * DEG), im: acc.im + c.module * Math.sin(c.phase * DEG) }),
    { re: 0, im: 0 }
  );
  const moduleNeutre = Math.hypot(somme.re, somme.im);
  const phaseNeutre = Math.atan2(somme.im, somme.re) / DEG;

  const valeurs = api.sim.valeurs("#e-etoile-valeurs", [
    { id: "alpha", libelle: "Angle ωt", unite: "°", decimales: 0 },
    { id: "i1", libelle: "i1", unite: "A", decimales: 2 },
    { id: "i2", libelle: "i2", unite: "A", decimales: 2 },
    { id: "i3", libelle: "i3", unite: "A", decimales: 2 },
    { id: "somme", libelle: "i1 + i2 + i3", unite: "A", decimales: 2 },
    { id: "iN", libelle: "iN, phaseur IN", unite: "A", decimales: 2 },
    { id: "modN", libelle: "IN efficace", unite: "A", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const point = (module, angle, origine = centre) => ({
    x: origine.x + k * module * Math.cos(angle * DEG),
    y: origine.y - k * module * Math.sin(angle * DEG),
  });

  let poignee = null;
  let lecteur = null;
  let synchro = false;

  function tracer(alpha) {
    const bout = point(15.2, alpha);
    tension.setAttribute("d", "M" + centre.x + " " + centre.y + "L" + bout.x.toFixed(1) + " " + bout.y.toFixed(1));
    const bt = point(16.2, alpha);
    texteTension.setAttribute("x", bt.x.toFixed(1));
    texteTension.setAttribute("y", (bt.y + 4).toFixed(1));

    let origine = { ...centre };
    const instantanes = {};
    phaseurs.forEach((p, index) => {
      const angle = p.phase + alpha;
      const fin = point(p.module, angle);
      p.trait.setAttribute("d", "M" + centre.x + " " + centre.y + "L" + fin.x.toFixed(1) + " " + fin.y.toFixed(1));
      const lib = point(p.module + 1.4, angle);
      p.etiquette.setAttribute("x", (lib.x - 8).toFixed(1));
      p.etiquette.setAttribute("y", (lib.y + 4).toFixed(1));
      const finChaine = point(p.module, angle, origine);
      p.chaine.setAttribute("d", index === 0 ? "" : "M" + origine.x.toFixed(1) + " " + origine.y.toFixed(1) + "L" + finChaine.x.toFixed(1) + " " + finChaine.y.toFixed(1));
      origine = index === 0 ? fin : finChaine;
      p.projection.setAttribute("d", "M" + fin.x.toFixed(1) + " " + fin.y.toFixed(1) + "H" + xAxe);
      p.repere.setAttribute("cx", String(xAxe));
      p.repere.setAttribute("cy", fin.y.toFixed(1));
      p.texteRepere.setAttribute("x", String(xAxe + 12 + index * 26));
      p.texteRepere.setAttribute("y", (fin.y + 4).toFixed(1));
      instantanes["i" + (index + 1)] = Math.SQRT2 * p.module * Math.sin(angle * DEG);
    });

    const angleN = phaseNeutre + alpha;
    const finN = point(moduleNeutre, angleN);
    neutre.setAttribute("d", "M" + centre.x + " " + centre.y + "L" + finN.x.toFixed(1) + " " + finN.y.toFixed(1));
    const libN = point(moduleNeutre + 2.2, angleN);
    texteNeutre.setAttribute("x", (libN.x - 8).toFixed(1));
    texteNeutre.setAttribute("y", (libN.y + 4).toFixed(1));
    projectionNeutre.setAttribute("d", "M" + finN.x.toFixed(1) + " " + finN.y.toFixed(1) + "H" + xAxe);
    repereNeutre.setAttribute("x", String(xAxe - 4.5));
    repereNeutre.setAttribute("y", (finN.y - 4.5).toFixed(1));
    texteRepereNeutre.setAttribute("x", String(xAxe + 92));
    texteRepereNeutre.setAttribute("y", (finN.y + 4).toFixed(1));

    if (valeurs) {
      valeurs.maj({
        alpha,
        i1: instantanes.i1,
        i2: instantanes.i2,
        i3: instantanes.i3,
        somme: instantanes.i1 + instantanes.i2 + instantanes.i3,
        iN: Math.SQRT2 * moduleNeutre * Math.sin(angleN * DEG),
        modN: moduleNeutre,
      });
    }
  }

  function appliquer(valeur, source) {
    if (synchro) return;
    synchro = true;
    const alpha = ((Number(valeur) % 360) + 360) % 360;
    tracer(alpha);
    if (source !== "poignee" && poignee) poignee.set(alpha, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(alpha);
    synchro = false;
  }

  poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre,
    rayon,
    valeur: 30,
    pas: 5,
    libelle: "Angle de rotation ωt de l'étoile des courants",
    diffuserAuDepart: false,
    rappel: (mesure) => appliquer(mesure.angle, "poignee"),
  });
  if (poignee) ressources.push(poignee);

  lecteur = api.sim.lecteur("#e-etoile-lecteur", {
    de: 0,
    a: 360,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Rotation de l'étoile",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  appliquer(30, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : courant du neutre avec rang 3
   -------------------------------------------------------------------------- */

function courantPhase(theta, k, i1, r3) {
  const decale = theta - (k * 2 * Math.PI) / 3;
  return Math.SQRT2 * i1 * (Math.sin(decale) - r3 * Math.sin(3 * decale));
}

function bilanNeutre(courants, r3) {
  let re = 0;
  let im = 0;
  courants.forEach((i, k) => {
    re += i * Math.cos((-120 * k) * DEG);
    im += i * Math.sin((-120 * k) * DEG);
  });
  const fond = Math.hypot(re, im);
  const rang3 = r3 * courants.reduce((s, i) => s + i, 0);
  const phaseMax = Math.max(...courants) * Math.sqrt(1 + r3 * r3);
  return { fond, rang3, neutre: Math.hypot(fond, rang3), phaseMax };
}

function construireNeutre(racine, api) {
  if (!racine.querySelector("#e-neutre-trace")) return;
  const trace = api.sim.traceur("#e-neutre-trace", {
    titre: "Courants de phase et courant du neutre",
    xTitre: "ωt",
    xUnite: "degrés",
    yTitre: "courant",
    yUnite: "A",
    xMin: 0,
    xMax: 360,
    yMin: -40,
    yMax: 40,
    echantillons: 720,
    series: [
      { id: "i1", nom: "i1, phase L1, trait fin", couleur: "serie-1", epaisseur: 1.3 },
      { id: "i2", nom: "i2, phase L2, trait fin", couleur: "serie-3", epaisseur: 1.3 },
      { id: "i3", nom: "i3, phase L3, trait fin", couleur: "serie-4", epaisseur: 1.3 },
      { id: "iN", nom: "iN, neutre, trait épais", couleur: "serie-5", epaisseur: 3 },
    ],
    note: "Le courant du neutre ondule à trois fois la fréquence du réseau dès que le rang 3 domine : c'est la signature des rangs homopolaires.",
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-neutre-valeurs", [
    { id: "fond", libelle: "Neutre, fondamental", unite: "A", decimales: 2 },
    { id: "rang3", libelle: "Neutre, rang 3", unite: "A", decimales: 2 },
    { id: "neutre", libelle: "Neutre, efficace vrai", unite: "A", decimales: 2 },
    { id: "phase", libelle: "Phase la plus chargée", unite: "A", decimales: 2 },
    { id: "rapport", libelle: "Neutre / phase", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const curseurs = api.sim.curseurs(
    "#e-neutre-curseurs",
    [
      { id: "i1", libelle: "Fondamental L1", min: 0, max: 30, pas: 0.5, valeur: 16, unite: "A" },
      { id: "i2", libelle: "Fondamental L2", min: 0, max: 30, pas: 0.5, valeur: 16, unite: "A" },
      { id: "i3", libelle: "Fondamental L3", min: 0, max: 30, pas: 0.5, valeur: 16, unite: "A" },
      { id: "r3", libelle: "Taux de rang 3", min: 0, max: 60, pas: 1, valeur: 35, unite: "%" },
    ],
    (lues) => {
      const r3 = lues.r3 / 100;
      const courants = [lues.i1, lues.i2, lues.i3];
      const b = bilanNeutre(courants, r3);
      if (trace) {
        const crete = Math.max(5, ...courants.map((i) => Math.SQRT2 * i * (1 + r3)), Math.SQRT2 * b.neutre * 1.6);
        trace.definirPlage({ yMin: -crete * 1.1, yMax: crete * 1.1 });
        courants.forEach((i, k) => trace.definirFonction("i" + (k + 1), (deg) => courantPhase(deg * DEG, k, i, r3)));
        trace.definirFonction("iN", (deg) => courants.reduce((s, i, k) => s + courantPhase(deg * DEG, k, i, r3), 0));
        trace.definirMesures([
          { nom: "Neutre efficace vrai", valeur: nombre(api, b.neutre, 2) + " A" },
          { nom: "Phase la plus chargée", valeur: nombre(api, b.phaseMax, 2) + " A" },
        ]);
      }
      if (valeurs) {
        valeurs.maj({
          fond: b.fond,
          rang3: b.rang3,
          neutre: b.neutre,
          phase: b.phaseMax,
          rapport: b.phaseMax > 0 ? b.neutre / b.phaseMax : NaN,
        });
      }
    }
  );
  if (curseurs) ressources.push(curseurs);
}

/* --------------------------------------------------------------------------
   H. Impédance du jeu de barres avant et après correction
   -------------------------------------------------------------------------- */

const CONFIG_SOURCE = { ...CONFIG_SITE, q: 0 };
const CONFIG_SELF = { ...CONFIG_SITE, p: 0.07 };

function construireImpedance(racine, api) {
  if (!racine.querySelector("#h-impedance-trace")) return;
  const trace = api.sim.traceur("#h-impedance-trace", {
    titre: "Impédance vue du jeu de barres, en journée",
    genre: "Tracé",
    xTitre: "rang h",
    yTitre: "|Z|",
    yUnite: "Ω",
    xMin: 1,
    xMax: 25,
    yMin: 0,
    yMax: 11,
    echantillons: 1200,
    series: [
      { id: "source", nom: "source seule", couleur: "serie-6", epaisseur: 1.6, fonction: (h) => impedance(h, CONFIG_SOURCE).module },
      { id: "nue", nom: "compensation nue, 149,2 µF", couleur: "serie-5", epaisseur: 2.6, fonction: (h) => impedance(h, CONFIG_SITE).module },
      { id: "self", nom: "compensation avec self à 7 %", couleur: "serie-1", epaisseur: 2.6, fonction: (h) => impedance(h, CONFIG_SELF).module },
    ],
    surDessin({ c, repere, couleurs }) {
      lignesRangs(c, repere, couleurs);
    },
  });
  if (trace) {
    trace.definirMesures([
      { nom: "Résonance, compensation nue", valeur: "rang " + nombre(api, rangResonance(CONFIG_SITE).h, 2) },
      { nom: "Résonance, avec self", valeur: "rang " + nombre(api, rangResonance(CONFIG_SELF).h, 2) },
    ]);
    ressources.push(trace);
  }
}

/* --------------------------------------------------------------------------
   I. Animation : une semaine de campagne de mesure
   -------------------------------------------------------------------------- */

const JOURS_SEMAINE = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

function etatSemaine(t) {
  const indice = Math.min(6, Math.floor(t / 24));
  const heure = t - indice * 24;
  const ouvre = indice < 5;
  const compresseur = ouvre && heure >= 6 && heure < 22;
  const r = ouvre && heure >= 7 && heure < 19 ? 10 : 40;
  return { indice, heure, compresseur, r };
}

const CACHE_SEMAINE = new Map();
function thdSemaine(t, corrige) {
  const e = etatSemaine(t);
  const cle = (corrige ? "c" : "o") + (e.compresseur ? 1 : 0) + "-" + e.r;
  if (!CACHE_SEMAINE.has(cle)) {
    const cfg = { ...CONFIG_SITE, r: e.r, q: e.compresseur ? Q_SITE : 0, p: corrige ? 0.07 : 0 };
    CACHE_SEMAINE.set(cle, bilanJeuDeBarres(cfg));
  }
  return CACHE_SEMAINE.get(cle);
}

function libelleMoment(t) {
  const e = etatSemaine(Math.min(167.999, Math.max(0, t)));
  const h = Math.floor(e.heure);
  const m = Math.round((e.heure - h) * 60);
  return JOURS_SEMAINE[e.indice] + " " + h + " h " + String(m).padStart(2, "0");
}

function construireSemaine(racine, api) {
  const conteneur = racine.querySelector("#i-semaine");
  if (!conteneur) return;

  const x0 = 70;
  const x1 = 650;
  const yZero = 250;
  const kPct = 25;
  const versX = (t) => x0 + ((x1 - x0) * t) / 168;
  const versY = (pct) => yZero - pct * kPct;

  const svg = svgEl("svg", {
    viewBox: "0 0 680 300",
    role: "img",
    "aria-label": "Taux de distorsion de tension au jeu de barres sur une semaine, avant et après pose de la self anti-harmonique",
  });

  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.2", opacity: "0.55" });
  fond.appendChild(svgEl("path", { d: "M" + x0 + " " + yZero + "H" + x1 }));
  fond.appendChild(svgEl("path", { d: "M" + x0 + " " + yZero + "V" + versY(8.4) }));
  for (let j = 0; j <= 7; j += 1) fond.appendChild(svgEl("path", { d: "M" + versX(24 * j) + " " + yZero + "v6", opacity: "1" }));
  for (const pct of [2, 4, 6, 8]) fond.appendChild(svgEl("path", { d: "M" + (x0 - 5) + " " + versY(pct) + "h5" }));
  fond.appendChild(svgEl("path", { d: "M" + x0 + " " + versY(5) + "H" + x1, "stroke-width": "0.8" }));
  svg.appendChild(fond);

  const textes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11.5" });
  textes.appendChild(svgTexte(x0 + 6, 22, "THD de tension au jeu de barres (%)"));
  for (const pct of [0, 2, 4, 6, 8]) textes.appendChild(svgTexte(x0 - 9, versY(pct) + 4, String(pct), { "text-anchor": "end" }));
  JOURS_SEMAINE.forEach((jour, j) => textes.appendChild(svgTexte(versX(24 * j + 12), yZero + 20, jour.slice(0, 3) + ".", { "text-anchor": "middle" })));
  textes.appendChild(svgTexte(x1, versY(5) - 5, "repère 5 %", { "text-anchor": "end" }));
  textes.appendChild(svgTexte(x0, 292, "trait épais : installation d'origine ; tirets : avec self anti-harmonique"));
  svg.appendChild(textes);

  const pointsOrigine = [];
  const pointsCorrige = [];
  for (let i = 0; i <= 168 * 8; i += 1) {
    const t = i / 8;
    const tt = Math.min(t, 167.999);
    pointsOrigine.push((i ? "L" : "M") + versX(t).toFixed(1) + " " + versY(thdSemaine(tt, false).thd * 100).toFixed(1));
    pointsCorrige.push((i ? "L" : "M") + versX(t).toFixed(1) + " " + versY(thdSemaine(tt, true).thd * 100).toFixed(1));
  }
  const courbes = svgEl("g", { fill: "none", "stroke-linejoin": "round" });
  courbes.appendChild(svgEl("path", { d: pointsCorrige.join(" "), "stroke-width": "1.8", "stroke-dasharray": "6 4", style: "stroke: var(--serie-3)" }));
  courbes.appendChild(svgEl("path", { d: pointsOrigine.join(" "), "stroke-width": "2.8", style: "stroke: var(--serie-5)" }));
  svg.appendChild(courbes);

  const curseurTemps = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.2", "stroke-dasharray": "2 4" });
  svg.appendChild(curseurTemps);
  conteneur.appendChild(svg);
  ressources.push(api.dessiner([fond, textes, courbes], { duree: 1.6 }));

  const valeurs = api.sim.valeurs("#i-semaine-valeurs", [
    { id: "moment", libelle: "Moment", format: libelleMoment },
    { id: "compresseur", libelle: "Compresseur et condensateurs", format: (v) => (v ? "en service" : "arrêtés") },
    { id: "r", libelle: "Amortissement", unite: "Ω", decimales: 0 },
    { id: "origine", libelle: "THD d'origine", unite: "%", decimales: 2 },
    { id: "corrige", libelle: "THD avec self", unite: "%", decimales: 2 },
    { id: "ic", libelle: "Condensateurs, I / I assigné", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  let poignee = null;
  let lecteur = null;
  let synchro = false;

  function appliquer(valeur, source) {
    if (synchro) return;
    synchro = true;
    const t = Math.max(0, Math.min(168, Number(valeur)));
    const tt = Math.min(t, 167.999);
    const e = etatSemaine(tt);
    const origine = thdSemaine(tt, false);
    const corrige = thdSemaine(tt, true);
    curseurTemps.setAttribute("d", "M" + versX(t).toFixed(1) + " " + versY(8.4) + "V" + yZero);
    if (valeurs) {
      valeurs.maj({
        moment: t,
        compresseur: e.compresseur ? 1 : 0,
        r: e.r,
        origine: origine.thd * 100,
        corrige: corrige.thd * 100,
        ic: origine.rapportBranche === null ? NaN : origine.rapportBranche,
      });
    }
    if (source !== "poignee" && poignee) poignee.set(t, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(t);
    synchro = false;
  }

  poignee = api.sim.poignee(conteneur, {
    type: "courbe",
    courbe: (u) => {
      const t = Math.min(167.999, 168 * u);
      return { x: versX(168 * u), y: versY(thdSemaine(t, false).thd * 100) };
    },
    echantillons: 1344,
    min: 0,
    max: 168,
    pas: 0.5,
    valeur: 34,
    unite: "h",
    libelle: "Instant de la semaine sur la courbe d'origine",
    diffuserAuDepart: false,
    rappel: (mesure) => appliquer(mesure.valeur, "poignee"),
  });
  if (poignee) ressources.push(poignee);

  lecteur = api.sim.lecteur("#i-semaine-lecteur", {
    de: 0,
    a: 168,
    duree: 28,
    boucle: true,
    auto: false,
    libelle: "Parcours de la semaine",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  appliquer(34, null);
}

/* --------------------------------------------------------------------------
   I. Simulation : choisir la correction au jeu de barres
   -------------------------------------------------------------------------- */

function construireJeuDeBarres(racine, api) {
  if (!racine.querySelector("#i-jdb-trace")) return;
  let cfg = { ...CONFIG_SITE };

  const trace = api.sim.traceur("#i-jdb-trace", {
    titre: "Impédance du jeu de barres selon la configuration",
    xTitre: "rang h",
    yTitre: "|Z|",
    yUnite: "Ω",
    xMin: 1,
    xMax: 25,
    yMin: 0,
    yMax: 11,
    echantillons: 1200,
    series: [
      { id: "source", nom: "source seule, sans compensation", couleur: "serie-6", epaisseur: 1.5 },
      { id: "config", nom: "configuration réglée", couleur: "serie-1", epaisseur: 2.8 },
    ],
    surDessin({ c, repere, couleurs }) {
      lignesRangs(c, repere, couleurs);
    },
  });
  if (trace) ressources.push(trace);

  const spectre = api.sim.spectre("#i-jdb-spectre", {
    titre: "Tensions harmoniques du jeu de barres",
    xTitre: "rang",
    yTitre: "V_h / V_1",
    unite: "%",
    barres: [],
  });
  if (spectre) ressources.push(spectre);

  const valeurs = api.sim.valeurs("#i-jdb-valeurs", [
    { id: "hr", libelle: "Rang de résonance", decimales: 2 },
    { id: "zmax", libelle: "|Z| à la résonance", unite: "Ω", decimales: 2 },
    { id: "thd", libelle: "THD de tension", unite: "%", decimales: 2 },
    { id: "ic", libelle: "Condensateurs, I / I assigné", decimales: 3 },
    { id: "vc", libelle: "Tension des condensateurs", unite: "V", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const curseurs = api.sim.curseurs(
    "#i-jdb-curseurs",
    [
      { id: "scc", libelle: "Puissance de court-circuit S_cc", min: 0.5, max: 10, pas: 0.1, valeur: 2.5, unite: "MVA" },
      { id: "q", libelle: "Compensation par phase", min: 0, max: 8, pas: 0.01, valeur: 2.48, unite: "kvar" },
      { id: "p", libelle: "Taux de self p", min: 0, max: 14, pas: 0.1, valeur: 0, unite: "%" },
      { id: "r", libelle: "Amortissement R", min: 2, max: 100, pas: 1, valeur: 10, unite: "Ω" },
      { id: "r1719", libelle: "Rangs 17 et 19 de la pompe", min: 0, max: 6, pas: 0.1, valeur: 2, unite: "% de I1" },
    ],
    (lues) => {
      cfg = { xs: (400 * 400) / (lues.scc * 1e6), r: lues.r, q: lues.q * 1000, p: lues.p / 100, r1719: lues.r1719 / 100 };
      const bilan = bilanJeuDeBarres(cfg);
      const resonance = rangResonance(cfg);
      const source = { ...cfg, q: 0 };
      if (trace) {
        let zmax = 1;
        for (let h = 1; h <= 25; h += 0.05) zmax = Math.max(zmax, impedance(h, cfg).module, impedance(h, source).module);
        if (resonance && resonance.h <= 25) zmax = Math.max(zmax, resonance.z);
        trace.definirPlage({ yMin: 0, yMax: zmax * 1.12 });
        trace.definirFonction("source", (h) => impedance(h, source).module);
        trace.definirFonction("config", (h) => impedance(h, cfg).module);
        trace.definirMesures([
          { nom: "Rang de résonance", valeur: resonance ? nombre(api, resonance.h, 2) : "aucun" },
          { nom: "Résonance théorique nue", valeur: cfg.q > 0 ? nombre(api, Math.sqrt((V * V) / cfg.q / cfg.xs), 2) : "aucune" },
        ]);
      }
      if (spectre) {
        spectre.definirBarres(bilan.tensions.map((t) => ({ etiquette: "H" + t.h, valeur: (t.v / V) * 100 })));
        spectre.definirMesures([
          { nom: "THD de tension", valeur: nombre(api, bilan.thd * 100, 2) + " %" },
          { nom: "Courant des condensateurs", valeur: bilan.rapportBranche === null ? "sans objet" : nombre(api, bilan.rapportBranche, 3) + " x I assigné" },
        ]);
      }
      if (valeurs) {
        valeurs.maj({
          hr: resonance ? resonance.h : NaN,
          zmax: resonance ? resonance.z : NaN,
          thd: bilan.thd * 100,
          ic: bilan.rapportBranche === null ? NaN : bilan.rapportBranche,
          vc: bilan.vc1 === null ? NaN : bilan.vc1,
        });
      }
    }
  );
  if (curseurs) ressources.push(curseurs);
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";
  if (!racine.querySelector(cible)) return;

  const P_ARON = 10.51 + 7.16;
  const PHI_ARON = Math.atan((Math.sqrt(3) * (10.51 - 7.16)) / P_ARON);
  const UI_ARON = P_ARON / (Math.sqrt(3) * Math.cos(PHI_ARON));

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-aron",
      titre: "Réactif d'un compresseur par la méthode des deux wattmètres",
      niveau: "fondamental",
      enonce:
        "<p>Le départ du compresseur, sans neutre, est mesuré par deux wattmètres, référence L3. Après pose de la compensation, ils lisent " +
        "$W_1 = 10{,}51\\ \\mathrm{kW}$ et $W_2 = 7{,}16\\ \\mathrm{kW}$. La charge est supposée équilibrée et sinusoïdale. " +
        "Quelle est sa puissance réactive, en kvar ?</p>",
      valeur: Math.sqrt(3) * (10.51 - 7.16),
      unite: "kvar",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Puissance réactive Q",
      etapes: [
        { texte: "$P = W_1 + W_2 = 10{,}51 + 7{,}16 = 17{,}67\\ \\mathrm{kW}$." },
        { texte: "$Q = \\sqrt{3}\\,(W_1 - W_2) = 1{,}732 \\times 3{,}35 = 5{,}80\\ \\mathrm{kvar}$." },
        { texte: "$\\tan\\varphi = 5{,}80/17{,}67 = 0{,}328$, soit $\\varphi = 18{,}2^\\circ$ et $\\cos\\varphi = 0{,}950$ : c'est la cible de la compensation." },
        {
          texte: "Contrôle : sans compensation, les lectures étaient $12{,}66$ et $5{,}01\\ \\mathrm{kW}$, d'où $13{,}25\\ \\mathrm{kvar}$ ; l'écart réduit des deux lectures signale bien la compensation en service.",
          note: "Hypothèse indispensable : charge équilibrée et sinusoïdale. Avec des harmoniques importants, seule la somme reste juste.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Lectures des deux wattmètres selon le déphasage",
          xTitre: "φ",
          xUnite: "degrés",
          yTitre: "lecture",
          yUnite: "kW",
          xMin: -90,
          xMax: 90,
          yMin: -12,
          yMax: 22,
          series: [
            { id: "w1", nom: "W1 = UI cos(30° - φ)", couleur: "serie-1", epaisseur: 2.4, fonction: (d) => UI_ARON * Math.cos((30 - d) * DEG) },
            { id: "w2", nom: "W2 = UI cos(30° + φ)", couleur: "serie-3", epaisseur: 2.4, fonction: (d) => UI_ARON * Math.cos((30 + d) * DEG) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, PHI_ARON / DEG, "φ = 18,2°");
          },
        });
      },
    })
  );

  const pompe = courantsPompe(0.02);
  const harmoniques = Math.sqrt(pompe.reduce((s, r) => s + r.i * r.i, 0));
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-thd-pompe",
      titre: "Taux de distorsion du courant relevé sur la pompe",
      niveau: "fondamental",
      enonce:
        "<p>Le relevé M4 du courant de la pompe donne, en valeurs efficaces : $I_1 = 47{,}75\\ \\mathrm{A}$, $I_5 = 9{,}55$, $I_7 = 6{,}82$, " +
        "$I_{11} = 4{,}34$, $I_{13} = 3{,}67$, $I_{17} = I_{19} = 0{,}955\\ \\mathrm{A}$. Quel est son taux de distorsion, en pourcentage du fondamental ?</p>",
      valeur: (harmoniques / I1_POMPE) * 100,
      unite: "%",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "THD du courant",
      etapes: [
        { texte: "Somme des carrés des rangs : $9{,}55^2 + 6{,}82^2 + 4{,}34^2 + 3{,}67^2 + 2 \\times 0{,}955^2 = 171{,}9\\ \\mathrm{A^2}$." },
        { texte: "$I_H = \\sqrt{171{,}9} = 13{,}11\\ \\mathrm{A}$, d'où $\\mathrm{THD}_I = 13{,}11/47{,}75 = 27{,}5\\ \\%$." },
        { texte: "Valeur efficace vraie : $47{,}75\\sqrt{1 + 0{,}275^2} = 49{,}51\\ \\mathrm{A}$ ; facteur de puissance $\\lambda = 1/\\sqrt{1{,}0754} = 0{,}964$." },
        { texte: "Contrôle : le modèle idéal donne $31{,}1\\ \\%$ ; la différence vient des rangs 17 et 19 relevés plus faibles et des rangs supérieurs non comptés.", note: "Un taux se donne toujours avec son rang maximal de calcul, ici 19." },
      ],
      visuelCorrection(conteneur, moteur) {
        spectreCorrection(
          moteur,
          conteneur,
          { titre: "Spectre relevé du courant de la pompe", xTitre: "rang", yTitre: "valeur efficace", unite: "A" },
          [{ etiquette: "H1", valeur: I1_POMPE }].concat(pompe.map((r) => ({ etiquette: "H" + r.h, valeur: r.i })))
        );
      },
    })
  );

  const CONFIG_GLOBALE = { ...CONFIG_SITE, q: 6170 };
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-resonance-globale",
      titre: "Résonance d'une batterie globale",
      niveau: "intermédiaire",
      enonce:
        "<p>Au lieu de la compensation individuelle du compresseur, on étudie une batterie globale nue de $18{,}51\\ \\mathrm{kvar}$ au tableau général, " +
        "pour $S_{cc} = 2{,}5\\ \\mathrm{MVA}$. À quel rang se situe sa résonance parallèle avec la source ?</p>",
      valeur: Math.sqrt(2.5e6 / 18510),
      unite: "",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Rang de résonance",
      etapes: [
        { texte: "$h_r = \\sqrt{S_{cc}/Q_c} = \\sqrt{2\\,500/18{,}51} = \\sqrt{135{,}1} = 11{,}62$." },
        { texte: "Le rang 11 de la pompe, $4{,}34\\ \\mathrm{A}$, et le rang 13, $3{,}67\\ \\mathrm{A}$, encadrent la résonance : bien plus chargés que les rangs 17 et 19." },
        {
          texte: "Conclusion : une batterie globale nue serait plus dangereuse que la compensation individuelle ; elle exige une self anti-harmonique.",
          note: "Plus la compensation est puissante, plus la résonance descend vers les rangs chargés : $h_r$ varie comme $1/\\sqrt{Q_c}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Impédance du jeu de barres avec la batterie globale",
          xTitre: "rang h",
          yTitre: "|Z|",
          yUnite: "Ω",
          xMin: 1,
          xMax: 25,
          yMin: 0,
          yMax: 11,
          echantillons: 1200,
          series: [
            { id: "s", nom: "source seule", couleur: "serie-6", epaisseur: 1.5, fonction: (h) => impedance(h, CONFIG_SOURCE).module },
            { id: "g", nom: "batterie globale nue, 18,51 kvar", couleur: "serie-5", epaisseur: 2.6, fonction: (h) => impedance(h, CONFIG_GLOBALE).module },
          ],
          surDessin({ c, repere, couleurs }) {
            lignesRangs(c, repere, couleurs);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-neutre",
      titre: "Neutre d'un départ d'alimentations électroniques",
      niveau: "intermédiaire",
      enonce:
        "<p>Un départ de postes informatiques est équilibré : $20\\ \\mathrm{A}$ de fondamental par phase, en phase avec les tensions, et $40\\ \\%$ de rang 3 " +
        "dans chaque phase. On néglige les autres rangs. Quel courant efficace porte le neutre ?</p>",
      valeur: 24,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant du neutre",
      etapes: [
        { texte: "Fondamentaux : trois phaseurs égaux décalés de $120^\\circ$, somme nulle." },
        { texte: "Rangs 3 : $3\\theta_k$ vaut $0$, $-360^\\circ$, $+360^\\circ$ ; les trois rangs 3 sont en phase et s'additionnent : $I_N = 3 \\times 0{,}40 \\times 20 = 24{,}0\\ \\mathrm{A}$." },
        { texte: "Courant de phase : $20\\sqrt{1 + 0{,}4^2} = 21{,}54\\ \\mathrm{A}$. Le neutre porte $1{,}114$ fois la phase." },
        { texte: "Contrôle par la formule : $3r_3/\\sqrt{1 + r_3^2} = 1{,}2/1{,}077 = 1{,}114$, supérieur à 1 car $r_3 = 40\\ \\%$ dépasse $35{,}4\\ \\%$.", note: "Un neutre de section réduite serait ici surchargé." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Courants de phase et du neutre sur une période",
          xTitre: "ωt",
          xUnite: "degrés",
          yTitre: "courant",
          yUnite: "A",
          xMin: 0,
          xMax: 360,
          yMin: -45,
          yMax: 45,
          echantillons: 720,
          series: [
            { id: "a", nom: "i1, trait fin", couleur: "serie-1", epaisseur: 1.3, fonction: (d) => courantPhase(d * DEG, 0, 20, 0.4) },
            { id: "b", nom: "i2, trait fin", couleur: "serie-3", epaisseur: 1.3, fonction: (d) => courantPhase(d * DEG, 1, 20, 0.4) },
            { id: "c", nom: "i3, trait fin", couleur: "serie-4", epaisseur: 1.3, fonction: (d) => courantPhase(d * DEG, 2, 20, 0.4) },
            { id: "n", nom: "iN, neutre, trait épais", couleur: "serie-5", epaisseur: 3, fonction: (d) => [0, 1, 2].reduce((s, k) => s + courantPhase(d * DEG, k, 20, 0.4), 0) },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-self",
      titre: "Dimensionner la self anti-harmonique",
      niveau: "avancé",
      enonce:
        "<p>La compensation du compresseur doit fournir $2{,}48\\ \\mathrm{kvar}$ par phase sous $230\\ \\mathrm{V}$, en étoile équivalente, avec une self " +
        "anti-harmonique de rapport $p = 7\\ \\%$. Quelle inductance par phase faut-il, en millihenrys ? Calculez aussi, pour la correction, la capacité, " +
        "la fréquence d'accord et la tension du condensateur.</p>",
      valeur: (0.07 * (V * V) / (Q_SITE * 0.93)) / OMEGA * 1000,
      unite: "mH",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Inductance L",
      etapes: [
        { texte: "Puissance réactive de la branche : $Q = V^2/(X_{C1}(1 - p))$, d'où $X_{C1} = 230^2/(2480 \\times 0{,}93) = 22{,}94\\ \\Omega$." },
        { texte: "$C = 1/(X_{C1}\\omega) = 1/(22{,}94 \\times 314{,}16) = 138{,}8\\ \\mu\\mathrm{F}$, au lieu de $149{,}2\\ \\mu\\mathrm{F}$ sans self." },
        { texte: "$X_L = pX_{C1} = 0{,}07 \\times 22{,}94 = 1{,}606\\ \\Omega$, donc $L = 1{,}606/314{,}16 = 5{,}11\\ \\mathrm{mH}$." },
        { texte: "Accord : $f_a = 50/\\sqrt{0{,}07} = 189\\ \\mathrm{Hz}$, rang $3{,}78$ ; vérification : $1/(2\\pi\\sqrt{5{,}11 \\times 10^{-3} \\times 138{,}8 \\times 10^{-6}}) = 189\\ \\mathrm{Hz}$." },
        {
          texte: "Tension du condensateur : $V/(1 - p) = 247{,}3\\ \\mathrm{V}$ en étoile, $430\\ \\mathrm{V}$ en triangle sous $400\\ \\mathrm{V}$.",
          note: "Contrôle de dimension : $L = X_L/\\omega$ en $\\Omega \\cdot \\mathrm{s} = \\mathrm{H}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réactance de la branche corrigée selon le rang",
          xTitre: "rang h",
          yTitre: "X_b",
          yUnite: "Ω",
          xMin: 1,
          xMax: 20,
          yMin: -25,
          yMax: 30,
          series: [
            { id: "x", nom: "X_b = X_C1 (p h - 1/h), self à 7 %", couleur: "serie-1", epaisseur: 2.6, fonction: (h) => 22.936 * (0.07 * h - 1 / h) },
            { id: "c", nom: "condensateur seul, -X_C1/h", couleur: "serie-5", epaisseur: 1.6, fonction: (h) => -21.33 / h },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 1 / Math.sqrt(0.07), "accord, rang 3,78");
            lignesRangs(c, repere, couleurs);
          },
        });
      },
    })
  );

  const CONFIG_SOIR = { ...CONFIG_SITE, r: 40 };
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Diagnostic : des fusibles qui fondent le soir",
      niveau: "diagnostic",
      enonce:
        "<p>Sur un autre site, les fusibles d'une batterie de condensateurs nue fondent surtout entre 19 h et 22 h. Le taux de distorsion de tension passe " +
        "de $3\\ \\%$ à $8\\ \\%$ quand la batterie s'enclenche, et le spectre de la tension montre surtout les rangs 11 et 13. La nuit, batterie arrêtée, tout est calme. " +
        "Quelles conclusions et actions sont justifiées ?</p>",
      multiple: true,
      options: [
        { texte: "La batterie résonne avec la source près des rangs 11 et 13 ; la résonance est moins amortie le soir, quand les charges résistives sont arrêtées.", juste: true },
        { texte: "Mesurer le courant efficace vrai et le spectre de la branche des condensateurs sur une semaine, avec l'état des charges.", juste: true },
        { texte: "Remplacer les fusibles par des fusibles de calibre double." },
        { texte: "Équiper la batterie d'une self anti-harmonique, ou la mettre hors service en attendant.", juste: true },
        { texte: "Ajouter des condensateurs pour mieux filtrer les rangs 11 et 13." },
      ],
      etapes: [
        { texte: "L'enclenchement de la batterie multiplie la distorsion : signature d'une résonance parallèle source-condensateurs, ici vers les rangs 11 à 13." },
        { texte: "Le soir, l'amortissement baisse : le pic d'impédance monte, comme le montre le tracé, et le courant des condensateurs aussi." },
        { texte: "Surdimensionner les fusibles supprime la protection sans traiter la cause ; ajouter des condensateurs abaisse encore le rang de résonance, vers des rangs plus chargés." },
        { texte: "Actions justifiées : mesurer pour confirmer, puis désaccorder la batterie par une self, ou la retirer provisoirement.", note: "Sécurité d'abord : un condensateur en surcharge thermique peut se dégrader." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Effet de l'amortissement sur la résonance, exemple du site",
          xTitre: "rang h",
          yTitre: "|Z|",
          yUnite: "Ω",
          xMin: 1,
          xMax: 25,
          yMin: 0,
          yMax: 42,
          echantillons: 1200,
          series: [
            { id: "j", nom: "journée, R = 10 Ω", couleur: "serie-1", epaisseur: 2.2, fonction: (h) => impedance(h, CONFIG_SITE).module },
            { id: "s", nom: "soir, R = 40 Ω", couleur: "serie-5", epaisseur: 2.6, fonction: (h) => impedance(h, CONFIG_SOIR).module },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-campagne",
      titre: "Pourquoi une semaine de mesure ?",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi une campagne de qualité de l'énergie doit couvrir au moins une semaine d'exploitation et conserver les maxima, " +
        "au lieu d'un relevé ponctuel moyenné.</p>",
      motsCles: [
        ["charge", "amortissement", "etat", "fonctionnement", "exploitation"],
        ["soir", "nuit", "week", "fin de semaine", "cycle", "heure"],
        ["maxim", "pointe", "crete", "pire"],
        ["condensateur", "commut", "enclench", "compresseur", "resonance"],
      ],
      minimum: 2,
      exemple: "Trois phrases : ce qui varie dans le temps, ce qu'une moyenne cache, ce que l'on cherche.",
      etapes: [
        { texte: "Les perturbations dépendent de l'état des charges : pollueurs en marche, condensateurs commutés, amortissement apporté par les charges résistives." },
        { texte: "Ces états suivent un cycle journalier et hebdomadaire : jours ouvrés, soirées, nuits, fins de semaine. Une semaine couvre un cycle complet." },
        {
          texte: "Une moyenne lisse les pointes alors que ce sont elles qui détruisent, comme les $7{,}7\\ \\%$ du soir sur le site ; il faut conserver les maxima et les relier à l'état des équipements.",
          note: "Corollaire : noter le journal de marche des équipements pendant la campagne.",
        },
      ],
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const DESSIN_QUIZ = `
  <g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">
    <path d="M30 50H490" stroke-width="4"/>
    <path d="M60 6V50"/>
    <path d="M200 50V110"/><path d="M150 110H270"/>
    <path d="M150 110V160"/><circle cx="150" cy="178" r="16"/>
    <path d="M270 110V160"/><path d="M252 160H288" stroke-width="3"/><path d="M252 168H288" stroke-width="3"/><path d="M270 168V186"/>
    <path d="M400 50V170"/><rect x="370" y="170" width="60" height="30" rx="6"/>
  </g>
  <g stroke="currentColor" stroke-width="1.5" fill="none" stroke-dasharray="5 4"><path d="M420 50V170"/></g>
  <g stroke="currentColor" stroke-width="2.4" fill="none">
    <circle cx="60" cy="28" r="8"/><circle cx="200" cy="80" r="8"/><circle cx="270" cy="134" r="8"/><circle cx="420" cy="120" r="8"/>
  </g>
  <g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">
    <text x="74" y="24">arrivée</text>
    <text x="212" y="76">départ compresseur</text>
    <text x="144" y="183">M</text>
    <text x="286" y="138">branche</text>
    <text x="286" y="152">condensateurs</text>
    <text x="432" y="116">neutre</text>
    <text x="432" y="130">éclairage</text>
    <text x="30" y="214">cercles : emplacements possibles d'un capteur de courant</text>
  </g>
`;

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Sur un réseau 230/400 V, quelle tension mesure-t-on entre deux phases ?</p>",
        options: ["$400\\ \\mathrm{V}$, soit $\\sqrt{3} \\times 230$", "$460\\ \\mathrm{V}$, soit $2 \\times 230$", "$230\\ \\mathrm{V}$", "$325\\ \\mathrm{V}$, la crête de 230"],
        bonnes: [0],
        explication: "$u_{12} = v_1 - v_2$ : deux vecteurs de $230\\ \\mathrm{V}$ à $120^\\circ$ donnent $230\\sqrt{3} = 398{,}4 \\approx 400\\ \\mathrm{V}$.",
        resume: "Tension composée",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Sur un départ équilibré d'alimentations électroniques, le neutre peut porter plus de courant que chaque phase.</p>",
        reponse: true,
        explication: "Les rangs 3 s'additionnent dans le neutre : au-delà de $35{,}4\\ \\%$ de rang 3, $I_N$ dépasse le courant de phase.",
        resume: "Neutre et rang 3",
      },
      {
        type: "calcul",
        enonce: "<p>Un analyseur affiche $98{,}8\\ \\mathrm{A}$ efficaces vrais et un fondamental de $97{,}7\\ \\mathrm{A}$. Quel est le taux de distorsion du courant, en pourcentage ?</p>",
        valeur: (Math.sqrt(98.8 * 98.8 - 97.7 * 97.7) / 97.7) * 100,
        unite: "%",
        tolerance: 0.02,
        chiffres: 1,
        explication: "$I_H = \\sqrt{98{,}8^2 - 97{,}7^2} = 14{,}70\\ \\mathrm{A}$, $\\mathrm{THD}_I = 14{,}70/97{,}7 = 15{,}0\\ \\%$.",
        resume: "THD par Parseval",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi une self anti-harmonique à $7\\ \\%$ empêche-t-elle la batterie de résonner avec la source aux rangs 5 et au-delà ?</p>",
        motsCles: [["inductif", "inductive", "self", "inductance"], ["accord", "3,7", "3,78", "189", "sous le rang 5", "en dessous", "au-dessus"]],
        minimum: 2,
        explication: "La branche est accordée au rang $3{,}78$ ; au-dessus, elle est inductive, comme la source, et deux inductances en parallèle ne résonnent pas. La seule résonance, vers le rang $3{,}7$, tombe où le variateur n'injecte rien.",
        resume: "Rôle de la self",
      },
      {
        type: "calcul",
        enonce: "<p>Une charge a un facteur de déplacement $\\cos\\varphi_1 = 0{,}96$ et un courant de taux de distorsion $30\\ \\%$, sous tension sinusoïdale. Quel est son facteur de puissance ?</p>",
        valeur: 0.96 / Math.sqrt(1.09),
        unite: "",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$\\lambda = \\cos\\varphi_1/\\sqrt{1 + \\mathrm{THD}^2} = 0{,}96/\\sqrt{1{,}09} = 0{,}920$.",
        resume: "Facteur de puissance",
      },
      {
        type: "qcm",
        enonce: "<p>Quelles caractéristiques l'analyseur de la campagne doit-il posséder ?</p>",
        options: [
          { texte: "Mesure en valeur efficace vraie", juste: true },
          { texte: "Échantillonnage synchronisé sur la fréquence mesurée", juste: true },
          { texte: "Filtre anti-repliement avant la conversion", juste: true },
          { texte: "Calcul du spectre sur une seule période non synchronisée, pour la rapidité" },
          { texte: "Enregistrement des maxima sur la durée de la campagne", juste: true },
        ],
        multiple: true,
        explication: "Efficace vrai, synchronisation, anti-repliement et maxima sont les quatre exigences ; une fenêtre non synchronisée crée de la fuite spectrale.",
        resume: "Exigences de l'analyseur",
      },
      {
        type: "schema",
        enonce: "<p>On veut mesurer directement la surcharge des condensateurs du compresseur, harmoniques compris.</p>",
        consigne: "Cliquez sur l'emplacement du capteur de courant.",
        viewBox: "0 0 520 220",
        description: "Unifilaire simplifié : arrivée, départ compresseur, branche condensateurs, neutre du départ éclairage, avec quatre emplacements de capteur",
        dessin: DESSIN_QUIZ,
        zones: [
          { x: 40, y: 8, largeur: 40, hauteur: 40, etiquette: "arrivée" },
          { x: 180, y: 60, largeur: 40, hauteur: 40, etiquette: "départ compresseur" },
          { x: 250, y: 114, largeur: 40, hauteur: 40, etiquette: "branche condensateurs", juste: true },
          { x: 400, y: 100, largeur: 40, hauteur: 40, etiquette: "neutre éclairage" },
        ],
        explication: "Seul le capteur sur la branche des condensateurs mesure leur courant ; au départ du compresseur, il se mélange au courant du moteur, dont la composante réactive est de signe opposé.",
        resume: "Point de mesure M2",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Dans un analyseur, le filtre anti-repliement se place après le convertisseur analogique-numérique.</p>",
        reponse: false,
        explication: "Une fois l'échantillonnage fait, le repliement est irréversible : le filtre est analogique et précède la conversion.",
        resume: "Position du filtre",
      },
      {
        type: "calcul",
        enonce: "<p>Au jeu de barres, le rang 19 de tension vaut $3{,}43\\ \\%$ de $230\\ \\mathrm{V}$. Les condensateurs ont un courant assigné de $10{,}78\\ \\mathrm{A}$. Quel courant de rang 19 les traverse, en ampères ?</p>",
        valeur: 19 * 0.0343 * 10.78,
        unite: "A",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$I_{C,19} = h\\,(V_{19}/V_1)\\,I_{C1} = 19 \\times 0{,}0343 \\times 10{,}78 = 7{,}03\\ \\mathrm{A}$ : les deux tiers du courant assigné, pour $3\\ \\%$ de tension.",
        resume: "Courant harmonique d'un condensateur",
      },
      {
        type: "qcm",
        enonce: "<p>Une compensation nue de $Q_c$ résonne au rang 18 avec la source. Le site passe sur un groupe électrogène de puissance de court-circuit cinq fois plus faible. Où se place la résonance ?</p>",
        options: ["Vers le rang 8", "Vers le rang 40", "Toujours au rang 18", "Vers le rang 3,6"],
        bonnes: [0],
        explication: "$h_r = \\sqrt{S_{cc}/Q_c}$ est divisé par $\\sqrt{5} = 2{,}24$ : $18/2{,}24 = 8{,}0$, près des rangs 7 et 11, très chargés.",
        resume: "Résonance en mode dégradé",
      },
    ],
    { titre: "Dix questions sur la qualité de l'énergie" }
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
      { categorie: "Triphasé", question: "Comment s'écrit la puissance active d'une charge triphasée équilibrée ?", reponse: "$P = \\sqrt{3}\\,UI\\cos\\varphi = 3VI\\cos\\varphi$, avec $U$ composée, $V$ simple, $I$ de ligne." },
      { categorie: "Mesure", question: "Que donnent les deux wattmètres de la méthode d'Aron ?", reponse: "$P = W_1 + W_2$ pour toute charge à trois fils ; $Q = \\sqrt{3}(W_1 - W_2)$ seulement en équilibré sinusoïdal." },
      { categorie: "Neutre", question: "Pourquoi les rangs 3 s'additionnent-ils dans le neutre ?", reponse: "Décalés de $3 \\times 120^\\circ = 360^\\circ$, les rangs 3 des trois phases sont en phase : ils s'ajoutent arithmétiquement." },
      { categorie: "Neutre", question: "À partir de quel taux de rang 3 le neutre d'un départ équilibré dépasse-t-il les phases ?", reponse: "$r_3 = 1/\\sqrt{8} = 35{,}4\\ \\%$, car $I_N/I_{\\text{phase}} = 3r_3/\\sqrt{1 + r_3^2}$." },
      { categorie: "Harmoniques", question: "Comment un courant harmonique devient-il une tension harmonique ?", reponse: "Par l'impédance vue du jeu de barres : $V_h = |\\underline{Z}_h|I_h$, avec $hX_s$ pour la source seule." },
      { categorie: "Résonance", question: "Où résonne une batterie nue avec la source ?", reponse: "Au rang $h_r = \\sqrt{S_{cc}/Q_c}$ ; l'impédance y est limitée par l'amortissement seul.", rappel: "Site : $18{,}3$ avec $2{,}48\\ \\mathrm{kvar}$ par phase et $2{,}5\\ \\mathrm{MVA}$." },
      { categorie: "Condensateurs", question: "Quel courant harmonique traverse un condensateur soumis à $V_h$ ?", reponse: "$I_{C,h} = hV_h/X_{C1}$ : un rang 19 à $3\\ \\%$ apporte $57\\ \\%$ du courant assigné." },
      { categorie: "Correction", question: "Que fait une self anti-harmonique à $p = 7\\ \\%$ ?", reponse: "Elle accorde la branche à $h_a = 1/\\sqrt{p} = 3{,}78$, la rend inductive au-delà et élève la tension du condensateur de $1/(1 - p)$, soit $7{,}5\\ \\%$." },
      { categorie: "Analyseur", question: "Quelles sont les exigences d'un analyseur de qualité de l'énergie ?", reponse: "Valeur efficace vraie, bande passante capteurs compris, filtre anti-repliement, synchronisation sur la fréquence mesurée, enregistrement des maxima." },
      { categorie: "Stratégie", question: "Quelles sont les étapes d'une stratégie de qualité de l'énergie ?", reponse: "Symptômes, inventaire, prédiction par le modèle, campagne d'une semaine, contrôle de cohérence, correction hiérarchisée, nouvelle campagne." },
    ],
    { titre: "Dix cartes de révision du module" }
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
        enonce: "<p>Cette séance. Une compensation nue de $7{,}44\\ \\mathrm{kvar}$ est raccordée à un jeu de barres de $S_{cc} = 2{,}5\\ \\mathrm{MVA}$. À quel rang résonne-t-elle ?</p>",
        valeur: Math.sqrt(2.5e6 / 7440),
        unite: "",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$h_r = \\sqrt{2\\,500/7{,}44} = \\sqrt{336{,}0} = 18{,}33$, entre les rangs 17 et 19 de la pompe.",
        resume: "Rang de résonance",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Cette séance. Avec une self anti-harmonique à $7\\ \\%$, la tension aux bornes des condensateurs augmente d'environ $7{,}5\\ \\%$.</p>",
        reponse: true,
        explication: "$V_{C1} = V/(1 - p) = V/0{,}93 = 1{,}075\\,V$ : il faut des condensateurs de tension assignée suffisante.",
        resume: "Tension des condensateurs",
      },
      {
        type: "qcm",
        enonce: "<p>Cette séance. Où placer un capteur pour vérifier que le neutre d'un départ d'éclairage électronique n'est pas surchargé ?</p>",
        options: ["Sur le conducteur neutre du départ", "Sur la phase L1 du départ", "À l'arrivée du tableau, sur L1", "Sur le conducteur de protection"],
        bonnes: [0],
        explication: "Le courant du neutre se mesure sur le neutre lui-même, ou se calcule par la somme instantanée des trois courants de phase, jamais par une phase seule.",
        resume: "Mesure du neutre",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/introduction-a-fourier\">Introduction à Fourier</a>. Un carré de $\\pm 10\\ \\mathrm{V}$ a un rang 3 de quelle amplitude crête, en volts ?</p>",
        valeur: 40 / (3 * Math.PI),
        unite: "V",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$b_3 = 4E/(3\\pi) = 40/(3\\pi) = 4{,}244\\ \\mathrm{V}$ crête.",
        resume: "Rang 3 d'un carré",
      },
      {
        type: "qcm",
        enonce: "<p>Cours <a href=\"#/cours/introduction-a-fourier\">Introduction à Fourier</a>. Un analyseur non synchronisé affiche un rang 2 fictif sur le courant d'un pont de diodes sain. Quelle en est la cause ?</p>",
        options: ["La fuite spectrale d'une fenêtre qui ne contient pas un nombre entier de périodes", "Une dissymétrie réelle des alternances", "Le phénomène de Gibbs", "Un filtre anti-repliement trop sélectif"],
        bonnes: [0],
        explication: "Le pont sain a une symétrie de demi-onde, sans rang pair ; la raie vient de l'étalement des rangs voisins par une fenêtre non synchronisée.",
        resume: "Fuite spectrale",
      },
      {
        type: "calcul",
        enonce: "<p>Cours <a href=\"#/cours/revision-3-et-analyse-d-une-charge-ac\">Révision 3 et analyse d'une charge AC</a>. Un départ monophasé absorbe $P = 6\\ \\mathrm{kW}$ et $Q = 1{,}92\\ \\mathrm{kvar}$. Quelle est sa puissance apparente, en kVA ?</p>",
        valeur: Math.hypot(6, 1.92),
        unite: "kVA",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$S = \\sqrt{6^2 + 1{,}92^2} = 6{,}30\\ \\mathrm{kVA}$ : les puissances actives et réactives s'additionnent (Boucherot), pas les apparentes.",
        resume: "Puissance apparente",
      },
      {
        type: "qcm",
        enonce: "<p>Cours <a href=\"#/cours/tension-courant-charge-et-puissance\">Tension, courant, charge et puissance</a>. Une centrale de mesure, capteur orienté en convention récepteur, affiche une puissance négative sur le départ d'un moteur. Que faut-il soupçonner d'abord ?</p>",
        options: ["Un capteur de courant inversé ou une tension mal référencée", "Le moteur fournit de l'énergie au réseau en permanence", "Un taux de distorsion élevé", "Un neutre surchargé"],
        bonnes: [0],
        explication: "En convention récepteur, un moteur entraînant une charge reçoit une puissance positive ; un signe négatif signale d'abord une erreur d'orientation ou de câblage de la mesure.",
        resume: "Conventions de signe",
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
    titre: "Où en suis-je au jalon du module triphasé et qualité de l'énergie ?",
  });
  if (auto) ressources.push(auto);
}
