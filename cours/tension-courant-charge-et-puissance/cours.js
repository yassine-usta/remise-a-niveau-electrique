/* ==========================================================================
   cours/tension-courant-charge-et-puissance/cours.js
   Tension, courant, charge et puissance.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

/* Schéma générique réutilisé par l'exercice K4 et par la question de quiz L10 :
   deux dipôles identiques, l'un en convention récepteur (courant entrant par
   la borne +), l'autre en convention générateur (courant sortant par la
   borne +). Les flèches sont dessinées à la main (triangle plein) plutôt que
   via un marqueur SVG, pour rester un simple fragment injectable en HTML. */
const DESSIN_DIPOLES = `
  <g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">
    <rect x="80" y="55" width="64" height="42" rx="5"/>
    <path d="M20 76H78"/>
    <rect x="320" y="55" width="64" height="42" rx="5"/>
    <path d="M260 76H318"/>
  </g>
  <g fill="currentColor" stroke="none">
    <polygon points="76,76 64,70 64,82"/>
    <polygon points="264,76 276,70 276,82"/>
  </g>
  <g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">
    <text x="112" y="80" text-anchor="middle">D</text>
    <text x="352" y="80" text-anchor="middle">D</text>
    <text x="84" y="48" font-weight="600">+</text>
    <text x="138" y="48" font-weight="600">-</text>
    <text x="324" y="48" font-weight="600">+</text>
    <text x="378" y="48" font-weight="600">-</text>
    <text x="112" y="118" text-anchor="middle">i entre par +</text>
    <text x="352" y="118" text-anchor="middle">i sort par +</text>
  </g>
`;
const ZONES_DIPOLES = [
  { x: 40, y: 28, largeur: 140, hauteur: 108, etiquette: "récepteur" },
  { x: 300, y: 28, largeur: 140, hauteur: 108, etiquette: "générateur" },
];
const VIEWBOX_DIPOLES = "0 0 460 140";

export async function init(racine, api) {
  ressources = [];
  nettoyeursAnimation = [];

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireSimPuissance(racine, api);
  construireSimFonctionnement(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  api.reveler(racine.querySelectorAll(".formule-cle, figure, .encadre"), { decalage: 0.05 });
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
   Animations : tracé progressif des quatre schémas statiques du cours
   -------------------------------------------------------------------------- */

function construireDessinsStatiques(racine, api) {
  const selecteurs = [
    "#e-conventions-figure svg",
    "#e-source-reelle-figure svg",
    "#f-schema-principal svg",
    "#h-schema-figure svg",
  ];
  for (const selecteur of selecteurs) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree: 1.3 }));
  }
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-num-prefixe",
      titre: "Conversion d'un préfixe SI",
      niveau: "diagnostic",
      enonce: "<p>Un courant de $250\\ \\mathrm{mA}$ correspond à combien d'ampères ?</p>",
      valeur: 0.25,
      unite: "A",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Courant en A",
      etapes: [
        { texte: "Le préfixe milli vaut $10^{-3}$." },
        { texte: "$250\\ \\mathrm{mA} = 250 \\times 10^{-3}\\ \\mathrm{A} = 0{,}25\\ \\mathrm{A}$." },
      ],
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-num-algebre",
      titre: "Isoler une inconnue dans une équation affine",
      niveau: "diagnostic",
      enonce: "<p>Si $10 = 15 - 2{,}5\\,x$, que vaut $x$ ?</p>",
      valeur: 2,
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Valeur de x",
      etapes: [
        { texte: "Isoler le terme en $x$ : $2{,}5\\,x = 15 - 10 = 5$." },
        {
          texte: "$x = 5 / 2{,}5 = 2$.",
          note: "C'est exactement le type de manipulation nécessaire pour isoler $I$ ou $U$ dans $U = E - rI$.",
        },
      ],
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-num-charge",
      titre: "Charge en coulombs et en ampères-heures",
      niveau: "diagnostic",
      enonce: "<p>Une charge de $3600\\ \\mathrm{C}$ correspond à combien d'ampères-heures (Ah) ?</p>",
      valeur: 1,
      unite: "Ah",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Charge en Ah",
      etapes: [
        { texte: "Un ampère-heure correspond à un courant de 1 A maintenu pendant 3600 s (1 heure)." },
        { texte: "$1\\ \\mathrm{Ah} = 1\\ \\mathrm{A} \\times 3600\\ \\mathrm{s} = 3600\\ \\mathrm{C}$." },
        { texte: "$3600\\ \\mathrm{C}$ correspond donc exactement à $1\\ \\mathrm{Ah}$." },
      ],
    })
  );
}

/* --------------------------------------------------------------------------
   E. Simulation interactive : signe de la puissance reçue ou fournie
   -------------------------------------------------------------------------- */

function construireSimPuissance(racine, api) {
  if (!racine.querySelector("#e-sim-puissance-curseurs") || !racine.querySelector("#e-sim-puissance-valeurs")) return;

  const depart = { u: 12, i: 3 };

  const valeurs = api.sim.valeurs("#e-sim-puissance-valeurs", [
    { id: "u", libelle: "Tension u", unite: "V", decimales: 2, valeur: depart.u },
    { id: "i", libelle: "Courant i", unite: "A", decimales: 2, valeur: depart.i },
    { id: "p", libelle: "Puissance p = u i", unite: "W", decimales: 2, valeur: depart.u * depart.i },
    {
      id: "sens",
      libelle: "Interprétation (convention récepteur)",
      valeur: "reçue par le dipôle",
      format: (v) => v,
    },
  ]);
  if (!valeurs) return;
  ressources.push(valeurs);

  const curseurs = api.sim.curseurs(
    "#e-sim-puissance-curseurs",
    [
      { id: "u", libelle: "Tension u aux bornes du dipôle", min: -15, max: 15, pas: 0.5, valeur: depart.u, unite: "V" },
      { id: "i", libelle: "Courant i, convention récepteur", min: -10, max: 10, pas: 0.5, valeur: depart.i, unite: "A" },
    ],
    (valeurs_curseurs) => {
      const p = valeurs_curseurs.u * valeurs_curseurs.i;
      const sens =
        Math.abs(p) < 1e-9
          ? "nulle (u ou i est nul)"
          : p > 0
          ? "reçue par le dipôle"
          : "fournie par le dipôle (p < 0 dans cette convention)";
      valeurs.maj({ u: valeurs_curseurs.u, i: valeurs_curseurs.i, p, sens });
    }
  );
  if (curseurs) ressources.push(curseurs);
}

/* --------------------------------------------------------------------------
   F. Simulation interactive : point de fonctionnement d'une source réelle
   -------------------------------------------------------------------------- */

function construireSimFonctionnement(racine, api) {
  if (!racine.querySelector("#f-sim-fonctionnement-curseurs") || !racine.querySelector("#f-sim-fonctionnement-traceur")) return;

  const etat = { E: 12, r: 1, R: 5 };

  function pointDeFonctionnement() {
    const iOp = etat.E / (etat.r + etat.R);
    const uOp = etat.R * iOp;
    return { iOp, uOp };
  }

  const traceur = api.sim.traceur("#f-sim-fonctionnement-traceur", {
    titre: "Caractéristique de la source et droite de charge",
    xTitre: "courant I",
    xUnite: "A",
    yTitre: "tension U",
    yUnite: "V",
    xMin: 0,
    xMax: (etat.E / etat.r) * 1.05,
    yMin: 0,
    yMax: etat.E * 1.08,
    series: [
      { id: "source", nom: "source : U = E - r I", couleur: "serie-1" },
      { id: "charge", nom: "droite de charge : U = R I", couleur: "serie-4" },
    ],
    note: "Le repère ambre marque le point de fonctionnement, intersection des deux droites.",
    surDessin({ c, repere, couleurs }) {
      const { iOp, uOp } = pointDeFonctionnement();
      const x = repere.versX(iOp);
      const y = repere.versY(uOp);
      c.save();
      c.setLineDash([5, 4]);
      c.strokeStyle = couleurs.accent;
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(repere.boite.x, y);
      c.lineTo(x, y);
      c.lineTo(x, repere.boite.y + repere.boite.h);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = couleurs.accent;
      c.beginPath();
      c.arc(x, y, 4.5, 0, Math.PI * 2);
      c.fill();
      c.restore();
    },
  });
  if (!traceur) return;
  ressources.push(traceur);

  function actualiser() {
    const icc = etat.E / etat.r;
    traceur.definirPlage({ xMin: 0, xMax: icc * 1.05, yMin: 0, yMax: etat.E * 1.08 });
    traceur.definirFonction("source", (courant) => etat.E - etat.r * courant);
    traceur.definirFonction("charge", (courant) => etat.R * courant);
    const { iOp, uOp } = pointDeFonctionnement();
    const pCharge = uOp * iOp;
    const pPerte = etat.r * iOp * iOp;
    const rendement = (pCharge / (etat.E * iOp)) * 100;
    traceur.definirMesures([
      { nom: "Courant de fonctionnement", valeur: api.util.formater(iOp, 2) + " A" },
      { nom: "Tension de fonctionnement", valeur: api.util.formater(uOp, 2) + " V" },
      { nom: "Puissance reçue par la charge", valeur: api.util.formater(pCharge, 1) + " W" },
      { nom: "Puissance perdue en interne", valeur: api.util.formater(pPerte, 2) + " W" },
      { nom: "Rendement", valeur: api.util.formater(rendement, 1) + " %" },
    ]);
  }

  const curseurs = api.sim.curseurs(
    "#f-sim-fonctionnement-curseurs",
    [
      { id: "E", libelle: "F.é.m. E", min: 3, max: 24, pas: 0.5, valeur: etat.E, unite: "V" },
      { id: "r", libelle: "Résistance interne r", min: 0.1, max: 5, pas: 0.1, valeur: etat.r, unite: "Ω" },
      { id: "R", libelle: "Résistance de charge R", min: 0.5, max: 50, pas: 0.5, valeur: etat.R, unite: "Ω" },
    ],
    (valeurs_curseurs) => {
      etat.E = valeurs_curseurs.E;
      etat.r = valeurs_curseurs.r;
      etat.R = valeurs_curseurs.R;
      actualiser();
    }
  );
  if (curseurs) ressources.push(curseurs);
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-1",
      titre: "Charge transférée par un courant constant",
      niveau: "fondamental",
      enonce: "<p>Un courant constant de $3\\ \\mathrm{A}$ traverse un conducteur pendant $4\\ \\mathrm{min}$. Quelle charge, en coulombs, a traversé le conducteur ?</p>",
      valeur: 720,
      unite: "C",
      tolerance: 0.02,
      chiffres: 0,
      libelleChamp: "Charge Q",
      etapes: [
        { texte: "Le courant étant constant, $Q = I\\,t$." },
        { texte: "$t = 4\\ \\mathrm{min} = 240\\ \\mathrm{s}$." },
        { texte: "$Q = 3 \\times 240 = 720\\ \\mathrm{C}$." },
      ],
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-2",
      titre: "Puissance reçue par un dipôle",
      niveau: "fondamental",
      enonce: "<p>Un dipôle reçoit une tension de $24\\ \\mathrm{V}$ à ses bornes ; un courant de $2\\ \\mathrm{A}$ entre par sa borne +, en convention récepteur. Quelle puissance reçoit-il, en watts ?</p>",
      valeur: 48,
      unite: "W",
      tolerance: 0.02,
      chiffres: 0,
      libelleChamp: "Puissance p",
      etapes: [
        { texte: "En convention récepteur, $p = u\\,i$." },
        { texte: "$p = 24 \\times 2 = 48\\ \\mathrm{W}$." },
        { texte: "Le résultat est positif : le dipôle reçoit bien de la puissance, cohérent avec la convention utilisée.", note: "Un dipôle purement passif (résistance) ne peut recevoir, jamais fournir." },
      ],
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-1",
      titre: "Tension et puissance d'une source réelle en charge",
      niveau: "intermédiaire",
      enonce:
        "<p>Une source réelle de f.é.m. $E = 6\\ \\mathrm{V}$ et de résistance interne $r = 0{,}2\\ \\Omega$ débite un courant de $4\\ \\mathrm{A}$ dans une charge. Quelle puissance, en watts, la source fournit-elle à la charge ?</p>",
      valeur: 20.8,
      unite: "W",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Puissance reçue par la charge",
      etapes: [
        { texte: "Tension aux bornes : $U = E - rI = 6 - 0{,}2 \\times 4 = 6 - 0{,}8 = 5{,}2\\ \\mathrm{V}$." },
        { texte: "Puissance reçue par la charge : $P_{ch} = U\\,I = 5{,}2 \\times 4 = 20{,}8\\ \\mathrm{W}$." },
        {
          texte: "Contrôle : la f.é.m. fournit $EI = 6 \\times 4 = 24\\ \\mathrm{W}$ au total, dont $rI^2 = 0{,}2 \\times 16 = 3{,}2\\ \\mathrm{W}$ perdus en interne ; $24 - 3{,}2 = 20{,}8\\ \\mathrm{W}$, cohérent.",
        },
      ],
    })
  );

  ressources.push(
    api.exercice.schema("#k-exercices-blocs", {
      id: "k-inter-2",
      titre: "Reconnaître une convention sur un schéma",
      niveau: "intermédiaire",
      consigne: "Cliquez sur le dipôle dessiné en convention récepteur (le courant entre par sa borne +).",
      enonce: "<p>Les deux dipôles ci-dessous ne diffèrent que par le sens choisi pour la flèche du courant.</p>",
      viewBox: VIEWBOX_DIPOLES,
      dessin: DESSIN_DIPOLES,
      zones: ZONES_DIPOLES.map((zone) => ({ ...zone, juste: zone.etiquette === "récepteur" })),
      etapes: [
        { texte: "En convention récepteur, la flèche du courant $i$ entre dans le dipôle par la borne repérée +." },
        { texte: "C'est le dipôle de gauche : sa flèche pointe vers la borne + du schéma, donc entre dans le dipôle." },
        { texte: "Le dipôle de droite, avec un courant sortant par sa borne +, est dessiné en convention générateur.", note: "Reconnaître la convention utilisée est un préalable indispensable avant d'interpréter un signe de puissance." },
      ],
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-avance",
      titre: "Caractérisation d'une source réelle à partir de deux mesures",
      niveau: "avancé",
      enonce:
        "<p>Sur une même source réelle ($E$ et $r$ constants), un premier essai donne $I_1 = 2\\ \\mathrm{A}$ pour $U_1 = 11{,}6\\ \\mathrm{V}$, un second $I_2 = 5\\ \\mathrm{A}$ pour $U_2 = 11\\ \\mathrm{V}$. Quelle est la puissance perdue en interne, en watts, lors du second essai ?</p>",
      valeur: 5,
      unite: "W",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Puissance perdue P_r à I2",
      etapes: [
        { texte: "Deux équations : $U_1 = E - rI_1$ et $U_2 = E - rI_2$." },
        { texte: "Soustraction : $U_1 - U_2 = r(I_2 - I_1)$, soit $0{,}6 = r \\times 3$, donc $r = 0{,}2\\ \\Omega$." },
        { texte: "F.é.m. : $E = U_1 + rI_1 = 11{,}6 + 0{,}2 \\times 2 = 12{,}0\\ \\mathrm{V}$." },
        { texte: "Puissance perdue en interne au second essai : $P_r = rI_2^2 = 0{,}2 \\times 25 = 5\\ \\mathrm{W}$." },
        {
          texte: "Contrôle par bilan : $P_E = EI_2 = 12 \\times 5 = 60\\ \\mathrm{W}$, $P_{ch} = U_2 I_2 = 11 \\times 5 = 55\\ \\mathrm{W}$, et $55 + 5 = 60\\ \\mathrm{W}$, cohérent.",
          note: "Le courant de court-circuit associé, $I_{cc} = E/r = 60\\ \\mathrm{A}$, confirme qu'il ne faut jamais le mesurer directement sur une source de cette puissance.",
        },
      ],
    })
  );

  ressources.push(
    api.exercice.reponseCourte("#k-exercices-blocs", {
      id: "k-diagnostic",
      titre: "Diagnostic d'un chargeur de batteries industrielles",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Sur un chargeur de batteries industrielles, la tension à vide mesurée vaut $12{,}8\\ \\mathrm{V}$, conforme à l'attendu. Sous une charge de $20\\ \\mathrm{A}$, elle chute à $10{,}4\\ \\mathrm{V}$, alors qu'elle ne descendait qu'à $12{,}3\\ \\mathrm{V}$ pour ce même courant lors de la mise en service, un an plus tôt. Quel est le diagnostic le plus probable, et quelle grandeur du modèle a changé ?</p>",
      motsCles: [
        ["resistance interne", "resistance"],
        ["augmente", "augmentation", "accrue", "plus grande", "plus elevee"],
        ["vieillissement", "degradation", "usure", "sulfatation", "batterie usee"],
      ],
      minimum: 2,
      exemple: "Comparez la chute de tension à courant identique entre les deux dates, et nommez la grandeur en cause.",
      etapes: [
        { texte: "La tension à vide, égale à $E$, n'a pas changé : la f.é.m. de la batterie est toujours conforme." },
        { texte: "Résistance interne actuelle : $r = (12{,}8 - 10{,}4)/20 = 2{,}4/20 = 0{,}12\\ \\Omega$." },
        { texte: "Résistance interne à la mise en service : $r = (12{,}8 - 12{,}3)/20 = 0{,}5/20 = 0{,}025\\ \\Omega$." },
        {
          texte: "La résistance interne a donc été multipliée par près de 5 en un an : c'est le signe typique d'un vieillissement (sulfatation, corrosion des plaques) qui dégrade la batterie sans changer sa tension à vide.",
          note: "Ce diagnostic ne serait pas visible sur une simple mesure à vide : il exige une mesure en charge, exactement la méthode utilisée à l'exercice précédent.",
        },
      ],
    })
  );

  ressources.push(
    api.exercice.reponseCourte("#k-exercices-blocs", {
      id: "k-conceptuel",
      titre: "Un même signe de convention, deux régimes",
      niveau: "conceptuel",
      enonce:
        "<p>Une batterie est tour à tour en charge (elle reçoit de l'énergie d'un chargeur) puis en décharge (elle alimente un moteur), sans qu'aucune de ses flèches de référence ne change de sens. Sans calcul, expliquez pourquoi la puissance calculée $p = ui$ change malgré tout de signe entre ces deux phases.</p>",
      motsCles: [
        ["sens du courant", "direction du courant", "courant s'inverse", "courant change de sens"],
        ["convention", "reference", "flèche fixée", "meme convention"],
        ["signe de i", "signe du courant", "i change de signe"],
      ],
      minimum: 2,
      exemple: "Reliez le sens physique réel du courant, la flèche de référence fixée à l'avance, et le signe de i qui en résulte.",
      etapes: [
        { texte: "La flèche de référence de $i$ est choisie une fois pour toutes, par exemple entrant par la borne +." },
        { texte: "En charge, le courant physique entre réellement par cette borne : $i$ mesuré est positif, donc $p = ui > 0$." },
        {
          texte: "En décharge, le courant physique sort réellement par cette même borne : par rapport à la flèche de référence inchangée, $i$ mesuré est maintenant négatif, donc $p = ui < 0$.",
          note: "C'est le signe de $i$ qui bascule avec le sens physique réel du courant, pas la convention elle-même : la flèche de référence, dessinée une seule fois, ne bouge jamais.",
        },
      ],
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
        enonce: "<p>À quelle combinaison d'unités de base le volt est-il équivalent ?</p>",
        options: ["$\\mathrm{A/s}$", "$\\mathrm{J/C}$", "$\\mathrm{C/s}$", "$\\mathrm{W/A^2}$"],
        bonnes: [1],
        explication: "Le volt est un joule par coulomb : c'est l'énergie fournie ou reçue par unité de charge déplacée.",
        resume: "Équivalence du volt",
      },
      {
        type: "vraiFaux",
        enonce: "<p>En convention générateur, les flèches de $u$ et de $i$ sont orientées en sens opposés.</p>",
        reponse: true,
        explication: "La flèche de $i$ sort par la borne +, à l'opposé de la flèche de $u$ qui pointe toujours vers cette même borne.",
        resume: "Sens des flèches en convention générateur",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi l'énergie électrique domestique se facture-t-elle en kilowattheures plutôt qu'en joules ?</p>",
        motsCles: [["grand nombre", "trop de joules", "ordre de grandeur", "plus pratique", "plus lisible", "grande echelle"]],
        minimum: 1,
        explication: "Un joule est une quantité minuscule à l'échelle domestique : compter en kilowattheures évite de manipuler des nombres de plusieurs millions.",
        resume: "Pourquoi le kilowattheure",
      },
      {
        type: "calcul",
        enonce: "<p>Un courant de $10\\ \\mathrm{A}$ circule pendant $30\\ \\mathrm{s}$. Quelle charge, en coulombs, a été transférée ?</p>",
        valeur: 300,
        unite: "C",
        chiffres: 0,
        explication: "$Q = I t = 10 \\times 30 = 300\\ \\mathrm{C}$.",
        resume: "Charge transférée en 30 s",
      },
      {
        type: "calcul",
        enonce: "<p>Une résistance reçoit $230\\ \\mathrm{V}$ et un courant de $0{,}5\\ \\mathrm{A}$. Quelle puissance reçoit-elle, en watts ?</p>",
        valeur: 115,
        unite: "W",
        chiffres: 0,
        explication: "$p = ui = 230 \\times 0{,}5 = 115\\ \\mathrm{W}$.",
        resume: "Puissance reçue par une résistance",
      },
      {
        type: "vraiFaux",
        enonce: "<p>La tension à vide d'une source réelle est égale à sa force électromotrice $E$.</p>",
        reponse: true,
        explication: "À vide, $I = 0$, donc $U = E - r \\times 0 = E$.",
        resume: "Tension à vide d'une source réelle",
      },
      {
        type: "qcm",
        enonce: "<p>Qu'est-ce qui caractérise une source de tension idéale ?</p>",
        options: [
          { texte: "Une tension à ses bornes constante, quel que soit le courant débité.", juste: true },
          { texte: "Un courant débité constant, quelle que soit la tension." },
          { texte: "Une résistance interne infinie." },
          { texte: "Une puissance fournie toujours nulle." },
        ],
        explication: "Une source de tension idéale a une résistance interne nulle : sa tension ne dépend jamais du courant qu'elle doit fournir.",
        resume: "Caractéristique d'une source de tension idéale",
      },
      {
        type: "courte",
        enonce: "<p>En une phrase, pourquoi un générateur idéal de courant ne peut-il pas être laissé en circuit ouvert ?</p>",
        motsCles: [["tension infinie", "u infini", "aucun chemin", "circuit ouvert impossible"]],
        minimum: 1,
        explication: "Un générateur de courant idéal impose $I$ quelle que soit $U$ ; en circuit ouvert, aucun courant ne peut circuler, ce qui exigerait une tension infinie à ses bornes pour maintenir $I$ constant, ce qui est physiquement impossible.",
        resume: "Limite du générateur de courant idéal",
      },
      {
        type: "calcul",
        enonce: "<p>Une source réelle a $E = 9\\ \\mathrm{V}$, $r = 1\\ \\Omega$, et débite $I = 3\\ \\mathrm{A}$. Quelle est la tension $U$ à ses bornes, en volts ?</p>",
        valeur: 6,
        unite: "V",
        chiffres: 0,
        explication: "$U = E - rI = 9 - 1 \\times 3 = 6\\ \\mathrm{V}$.",
        resume: "Tension en charge d'une source réelle",
      },
      {
        type: "schema",
        enonce: "<p>Sur ce schéma, quel dipôle est représenté en convention générateur ?</p>",
        consigne: "Cliquez sur la zone correspondante.",
        viewBox: VIEWBOX_DIPOLES,
        dessin: DESSIN_DIPOLES,
        zones: ZONES_DIPOLES.map((zone) => ({ ...zone, juste: zone.etiquette === "générateur" })),
        explication: "Le dipôle de droite a sa flèche de courant sortant par la borne +, ce qui définit la convention générateur.",
        resume: "Identification de la convention générateur",
      },
    ],
    { titre: "Dix questions sur la tension, le courant, la charge et la puissance" }
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
      { categorie: "Définition", question: "Comment le courant est-il défini à partir de la charge ?", reponse: "$i = \\mathrm{d}q/\\mathrm{d}t$, le débit de charge à travers une section." },
      { categorie: "Définition", question: "Qu'est-ce que la tension $u_{AB}$ ?", reponse: "La différence de potentiel $V_A - V_B$ entre deux points, en volts." },
      { categorie: "Convention", question: "Que signifie la convention récepteur ?", reponse: "Le courant $i$ est compté positif lorsqu'il entre par la borne +. Alors $p = ui$ est la puissance reçue." },
      { categorie: "Convention", question: "Que signifie la convention générateur ?", reponse: "Le courant $i$ est compté positif lorsqu'il sort par la borne +. Alors $p = ui$ est la puissance fournie." },
      { categorie: "Formule", question: "Comment calcule-t-on la puissance instantanée ?", reponse: "$p = u\\,i$, en watts." },
      { categorie: "Formule", question: "Comment passe-t-on de la puissance à l'énergie ?", reponse: "$W = \\int p\\,\\mathrm{d}t$, ou $W = P\\,\\Delta t$ si $p$ est constante." },
      { categorie: "Source réelle", question: "Comment se modélise une source réelle ?", reponse: "Par une f.é.m. $E$ idéale en série avec une résistance interne $r$ : $U = E - rI$." },
      { categorie: "Source réelle", question: "Que vaut la tension à vide d'une source réelle ?", reponse: "$U = E$, car $I = 0$ annule la chute interne $rI$." },
      { categorie: "Source réelle", question: "Que vaut le courant de court-circuit ?", reponse: "$I_{cc} = E/r$, obtenu en posant $U = 0$ : à ne jamais mesurer directement sur une source puissante." },
      {
        categorie: "Vigilance",
        question: "Un signe de puissance négatif est-il une erreur ?",
        reponse: "Non : il indique un transfert d'énergie en sens inverse de la convention choisie, pas une erreur de calcul.",
        rappel: "C'est exactement ce qui distingue une batterie en charge d'une batterie en décharge.",
      },
    ],
    { titre: "Dix cartes sur la tension, le courant, la charge et la puissance" }
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
        enonce: "<p>Une charge de $0{,}8\\ \\mathrm{A}$ circule pendant $10\\ \\mathrm{min}$. Quelle charge, en coulombs, a été transférée ?</p>",
        valeur: 480,
        chiffres: 0,
        explication: "$Q = It = 0{,}8 \\times 600 = 480\\ \\mathrm{C}$.",
        resume: "Charge transférée (séance du jour)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>En convention récepteur, un courant entrant par la borne + associé à une puissance $p = ui$ positive signifie que le dipôle fournit de l'énergie.</p>",
        reponse: false,
        explication: "C'est l'inverse : $p > 0$ en convention récepteur signifie que le dipôle reçoit de l'énergie.",
        resume: "Interprétation du signe en convention récepteur (séance du jour)",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi la tension aux bornes d'une source réelle diminue-t-elle quand le courant débité augmente ?</p>",
        motsCles: [["resistance interne", "chute interne", "r i"]],
        minimum: 1,
        explication: "La chute de tension interne $rI$ augmente avec le courant, ce qui réduit d'autant la tension utile $U = E - rI$.",
        resume: "Chute de tension d'une source réelle (séance du jour)",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est le module du nombre complexe $Z = 6 + j8$ ?</p>",
        valeur: 10,
        chiffres: 0,
        explication: "$|Z| = \\sqrt{6^2+8^2} = \\sqrt{100} = 10$, révisé du cours Diagnostic initial et remise à niveau mathématique.",
        resume: "Module d'un nombre complexe (cours précédent)",
      },
      {
        type: "qcm",
        enonce: "<p>Que vaut $(3 \\times 10^{4}) \\times (2 \\times 10^{-6})$ ?</p>",
        options: ["$6 \\times 10^{-2}$", "$6 \\times 10^{2}$", "$5 \\times 10^{-2}$", "$6 \\times 10^{-3}$"],
        bonnes: [0],
        explication: "$3\\times2=6$ et $10^{4}\\times10^{-6}=10^{-2}$, soit $6\\times10^{-2}$, révisé du cours Diagnostic initial et remise à niveau mathématique.",
        resume: "Notation scientifique (cours précédent)",
      },
    ],
    { titre: "Révision espacée : trois questions sur cette séance, deux sur la séance précédente" }
  );
  if (quiz) ressources.push(quiz);
}

/* --------------------------------------------------------------------------
   P. Auto-évaluation
   -------------------------------------------------------------------------- */

function construireAutoEval(racine, api) {
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur la tension, le courant, la charge et la puissance ?",
  });
  if (auto) ressources.push(auto);
}
