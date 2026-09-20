/* ==========================================================================
   cours/_demo/cours.js
   Page de démonstration du moteur pédagogique, sur l'exemple du circuit RC.
   Ce fichier sert aussi de modèle : chaque cours du parcours expose
   init(racine, api) et detruire(), et n'utilise que l'objet api.
   ========================================================================== */

/* Ressources créées par init, libérées par detruire. */
let ressources = [];

/* Circuit de référence : R = 10 kilohms, C = 100 nanofarads, E = 12 volts. */
const DEPART = { r_kohm: 10, c_nf: 100, e_v: 12, f_hz: 100 };

function tauDe(valeurs) {
  return valeurs.r_kohm * 1e3 * valeurs.c_nf * 1e-9;
}

function gainPhase(frequence, tau) {
  const pulsation = 2 * Math.PI * frequence;
  const denominateur = 1 + Math.pow(pulsation * tau, 2);
  return {
    gain: 1 / Math.sqrt(denominateur),
    phase: -Math.atan(pulsation * tau),
    re: 1 / denominateur,
    im: (-pulsation * tau) / denominateur,
  };
}

/** Signal carré reconstitué par ses quinze premiers harmoniques impairs. */
function carre(t, frequence, amplitude) {
  let somme = 0;
  for (let rang = 1; rang <= 15; rang += 2) {
    somme += Math.sin(2 * Math.PI * rang * frequence * t) / rang;
  }
  return ((4 * amplitude) / Math.PI) * somme;
}

/** Même signal, filtré harmonique par harmonique par le passe-bas RC. */
function carreFiltre(t, frequence, amplitude, tau) {
  let somme = 0;
  for (let rang = 1; rang <= 15; rang += 2) {
    const reponse = gainPhase(rang * frequence, tau);
    somme += (reponse.gain * Math.sin(2 * Math.PI * rang * frequence * t + reponse.phase)) / rang;
  }
  return ((4 * amplitude) / Math.PI) * somme;
}

/* Schéma minimal réutilisé par l'exercice de lecture de schéma. */
const DESSIN_RC = `
  <g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.9">
    <path d="M90 60H230"/><path d="M290 60H430"/><path d="M430 60v30"/><path d="M430 130v30"/>
    <path d="M430 160H90"/><path d="M90 60v25"/><path d="M90 115v45"/>
    <circle cx="90" cy="100" r="16"/>
    <rect x="230" y="46" width="60" height="28" rx="4"/>
    <path d="M408 90h44M408 130h44" stroke-width="3"/>
    <path d="M70 160h40" stroke-width="3"/>
  </g>
  <g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">
    <text x="52" y="105">E</text><text x="256" y="96">R</text><text x="470" y="115">C</text>
  </g>
`;

export async function init(racine, api) {
  ressources = [];

  /* ----------------------------------------------------------------------
     K. Exercices : les cinq types du moteur
     ---------------------------------------------------------------------- */

  api.exercice.qcm("#demo-exercices", {
    id: "demo-qcm",
    titre: "Comportement aux instants remarquables",
    niveau: "fondamental",
    enonce:
      "<p>Un condensateur déchargé est mis sous tension à travers une résistance, par un échelon $E$. " +
      "Quelles affirmations sont exactes ?</p>",
    options: [
      { texte: "À $t = 0^+$, le condensateur se comporte comme un court-circuit.", juste: true },
      { texte: "Le courant initial vaut $E/R$.", juste: true },
      { texte: "La tension aux bornes du condensateur peut varier instantanément." },
      { texte: "En régime établi, le courant dans la branche est nul.", juste: true },
    ],
    etapes: [
      {
        texte:
          "À l'instant initial, la charge accumulée est nulle donc $u_C(0) = 0$ : vu de la source, le condensateur " +
          "ne s'oppose à rien, exactement comme un court-circuit.",
      },
      { texte: "La maille donne alors $E = R\\,i(0^+)$, soit $i(0^+) = E/R$." },
      {
        texte:
          "Un saut de tension imposerait $i = C\\,\\mathrm{d}u_C/\\mathrm{d}t$ infini : impossible avec une source réelle. " +
          "La tension d'un condensateur est donc continue.",
        note: "C'est la propriété de continuité utilisée pour déterminer toutes les conditions initiales.",
      },
      { texte: "En régime établi, $u_C$ ne varie plus, donc $i = C\\,\\mathrm{d}u_C/\\mathrm{d}t = 0$ : le condensateur est un circuit ouvert." },
    ],
  });

  api.exercice.vraiFaux("#demo-exercices", {
    id: "demo-vraifaux",
    titre: "Effet de la résistance sur la bande passante",
    niveau: "fondamental",
    enonce: "<p>Doubler la résistance $R$ double la fréquence de coupure du filtre passe-bas RC.</p>",
    reponse: false,
    etapes: [
      { texte: "La fréquence de coupure vaut $f_c = \\dfrac{1}{2\\pi RC}$." },
      { texte: "$R$ figure au dénominateur : doubler $R$ divise $f_c$ par deux, et double la constante de temps $\\tau = RC$." },
      {
        texte: "Ordre de grandeur : de $10\\ \\mathrm{k\\Omega}$ à $20\\ \\mathrm{k\\Omega}$ avec $C = 100\\ \\mathrm{nF}$, $f_c$ passe de $159\\ \\mathrm{Hz}$ à $80\\ \\mathrm{Hz}$.",
        note: "Un circuit plus lent filtre davantage : les deux lectures concordent.",
      },
    ],
  });

  api.exercice.numerique("#demo-exercices", {
    id: "demo-numerique",
    titre: "Tension atteinte après deux constantes de temps",
    niveau: "intermédiaire",
    enonce:
      "<p>Avec $E = 12\\ \\mathrm{V}$, $R = 10\\ \\mathrm{k\\Omega}$ et $C = 100\\ \\mathrm{nF}$, " +
      "quelle est la tension $u_C$ à $t = 2\\ \\mathrm{ms}$, le condensateur étant initialement déchargé ?</p>",
    valeur: 12 * (1 - Math.exp(-2)),
    unite: "V",
    tolerance: 0.02,
    chiffres: 2,
    libelleChamp: "Tension $u_C(2\\ \\mathrm{ms})$",
    etapes: [
      { texte: "Constante de temps : $\\tau = RC = 10^4 \\times 10^{-7} = 1\\ \\mathrm{ms}$." },
      { texte: "L'instant demandé correspond à $t/\\tau = 2$." },
      { texte: "Loi de charge : $u_C = E\\left(1 - e^{-t/\\tau}\\right) = 12\\left(1 - e^{-2}\\right)$." },
      {
        texte: "Calcul : $e^{-2} = 0{,}1353$, donc $u_C = 12 \\times 0{,}8647 = 10{,}38\\ \\mathrm{V}$.",
        note: "Contrôle : la valeur doit se situer entre 63 % et 95 % de $E$, soit entre 7,6 et 11,4 V.",
      },
    ],
    visuelCorrection(conteneur, moteur) {
      const tau = 1e-3;
      const tracage = moteur.sim.traceur(conteneur, {
        titre: "Lecture graphique du résultat",
        genre: "Correction visuelle",
        xTitre: "temps",
        xUnite: "ms",
        yTitre: "tension",
        yUnite: "V",
        xMin: 0,
        xMax: 5,
        yMin: 0,
        yMax: 13,
        ratio: 0.42,
        series: [
          { id: "uc", nom: "u_C(t)", fonction: (tms) => 12 * (1 - Math.exp(-tms / 1000 / tau)) },
        ],
        surDessin({ c, repere, couleurs }) {
          const cible = 12 * (1 - Math.exp(-2));
          const x = repere.versX(2);
          const y = repere.versY(cible);
          c.save();
          c.setLineDash([5, 4]);
          c.strokeStyle = couleurs.accent;
          c.lineWidth = 1.5;
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
          c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
          c.textAlign = "left";
          c.fillText("10,38 V à 2 ms", x + 8, y - 8);
          c.restore();
        },
      });
      ressources.push(tracage);
    },
  });

  api.exercice.reponseCourte("#demo-exercices", {
    id: "demo-courte",
    titre: "Continuité de la tension",
    niveau: "conceptuel",
    enonce:
      "<p>Expliquez, sans calcul long, pourquoi la tension aux bornes d'un condensateur ne peut pas subir de " +
      "discontinuité dans un circuit alimenté par une source réelle.</p>",
    motsCles: [["courant"], ["infini", "borne", "fini"], ["charge", "q"], ["derivee", "variation"]],
    minimum: 3,
    exemple: "Deux phrases suffisent : reliez la tension, la charge et le courant.",
    etapes: [
      { texte: "La relation de définition est $i = C\\,\\dfrac{\\mathrm{d}u_C}{\\mathrm{d}t}$, soit $q = C\\,u_C$." },
      { texte: "Un saut de tension correspond à une dérivée infinie, donc à un courant infini." },
      {
        texte:
          "Aucune source réelle ne fournit un courant infini : la charge accumulée évolue continûment, donc $u_C$ " +
          "est continue.",
        note: "Corollaire utile : $u_C(0^+) = u_C(0^-)$, ce qui donne toujours la condition initiale.",
      },
    ],
  });

  api.exercice.schema("#demo-exercices", {
    id: "demo-schema",
    titre: "Lecture du schéma",
    niveau: "intermédiaire",
    consigne: "Cliquez sur l'élément qui fixe la valeur du courant à l'instant de la fermeture.",
    enonce: "<p>Le circuit ci-dessous est alimenté par un échelon de tension. Le condensateur est déchargé.</p>",
    viewBox: "0 0 520 200",
    dessin: DESSIN_RC,
    zones: [
      { x: 60, y: 70, largeur: 62, hauteur: 62, etiquette: "source" },
      { x: 226, y: 40, largeur: 70, hauteur: 42, etiquette: "résistance", juste: true },
      { x: 398, y: 80, largeur: 64, hauteur: 62, etiquette: "condensateur" },
    ],
    etapes: [
      { texte: "À $t = 0^+$, la tension du condensateur est nulle : il ne limite pas le courant." },
      { texte: "Toute la tension de source se retrouve aux bornes de la résistance : $i(0^+) = E/R$." },
      {
        texte: "C'est donc la résistance qui fixe le courant initial, et le condensateur qui fixe sa décroissance.",
        note: "Le produit des deux, $\\tau = RC$, gouverne la durée du régime transitoire.",
      },
    ],
  });

  /* ----------------------------------------------------------------------
     L. Quiz : un exemple de chaque type de question
     ---------------------------------------------------------------------- */

  const quiz = api.quiz("#demo-quiz", [
    {
      type: "qcm",
      enonce: "<p>Quelle est l'unité du produit $RC$ ?</p>",
      options: ["Le hertz", "La seconde", "Le volt par ampère", "Le coulomb"],
      bonnes: [1],
      explication: "$[R][C] = \\mathrm{V/A} \\times \\mathrm{C/V} = \\mathrm{C/A} = \\mathrm{s}$.",
      resume: "Unité du produit RC",
    },
    {
      type: "vraiFaux",
      enonce: "<p>À la fréquence de coupure, le gain d'un passe-bas du premier ordre vaut $-3\\ \\mathrm{dB}$.</p>",
      reponse: true,
      explication: "Le gain y vaut $1/\\sqrt{2} \\approx 0{,}707$, soit $-3{,}01\\ \\mathrm{dB}$.",
      resume: "Gain à la fréquence de coupure",
    },
    {
      type: "calcul",
      enonce:
        "<p>Pour $R = 4{,}7\\ \\mathrm{k\\Omega}$ et $C = 220\\ \\mathrm{nF}$, quelle est la constante de temps, en millisecondes ?</p>",
      valeur: 4.7e3 * 220e-9 * 1000,
      unite: "ms",
      tolerance: 0.03,
      explication: "$\\tau = 4{,}7 \\times 10^3 \\times 220 \\times 10^{-9} = 1{,}034\\ \\mathrm{ms}$.",
      resume: "Constante de temps d'un RC",
    },
    {
      type: "courte",
      enonce: "<p>Que devient l'allure de la sortie si la période du signal carré devient très courte devant $\\tau$ ?</p>",
      motsCles: [["triangul", "integr", "moyenne"], ["attenu", "amplitude", "faible"]],
      minimum: 1,
      explication:
        "Le circuit intègre : la sortie tend vers une forme triangulaire de faible amplitude, centrée sur la valeur moyenne.",
      resume: "Réponse à un carré rapide",
    },
    {
      type: "qcm",
      enonce: "<p>Quelles grandeurs restent inchangées si l'on double l'amplitude de l'échelon $E$ ?</p>",
      options: [
        { texte: "La constante de temps $\\tau$", juste: true },
        { texte: "La fréquence de coupure $f_c$", juste: true },
        { texte: "Le courant initial" },
        { texte: "L'énergie finale stockée" },
      ],
      multiple: true,
      explication:
        "$\\tau$ et $f_c$ ne dépendent que de $R$ et $C$. Le courant initial est proportionnel à $E$, et l'énergie à $E^2$.",
      resume: "Grandeurs indépendantes de l'amplitude",
    },
    {
      type: "schema",
      enonce: "<p>Sur ce circuit, où mesure-t-on la sortie d'un filtre passe-bas ?</p>",
      consigne: "Cliquez sur la zone correspondante.",
      viewBox: "0 0 520 200",
      dessin: DESSIN_RC,
      zones: [
        { x: 226, y: 40, largeur: 70, hauteur: 42, etiquette: "bornes de R" },
        { x: 398, y: 80, largeur: 64, hauteur: 62, etiquette: "bornes de C", juste: true },
      ],
      explication:
        "Aux bornes du condensateur, l'impédance décroît avec la fréquence : les composantes rapides sont atténuées.",
      resume: "Point de mesure d'un passe-bas",
    },
  ], { titre: "Six questions, une par type" });
  ressources.push(quiz);

  /* ----------------------------------------------------------------------
     M. Cartes de mémorisation
     ---------------------------------------------------------------------- */

  const cartes = api.cartes(
    "#demo-cartes",
    [
      { categorie: "Définition", question: "Que vaut la constante de temps d'un RC série ?", reponse: "$\\tau = RC$, en secondes, indépendante de l'amplitude appliquée." },
      { categorie: "Repère", question: "Quelle fraction de la valeur finale est atteinte après une constante de temps ?", reponse: "63 %, puis 86 % à $2\\tau$, 95 % à $3\\tau$ et 99,3 % à $5\\tau$." },
      { categorie: "Formule", question: "Quel est le lien entre constante de temps et fréquence de coupure ?", reponse: "$f_c = \\dfrac{1}{2\\pi RC} = \\dfrac{1}{2\\pi\\tau}$." },
      { categorie: "Propriété", question: "Quelle grandeur est continue sur un condensateur ?", reponse: "La tension, car un saut exigerait un courant infini. Sur une bobine, c'est le courant." },
      { categorie: "Énergie", question: "Quelle énergie un condensateur stocke-t-il sous la tension $U$ ?", reponse: "$W = \\tfrac{1}{2}CU^2$, en joules.", rappel: "Une capacité de 100 nF sous 12 V ne stocke que 7,2 microjoules." },
      { categorie: "Vigilance", question: "Quelle erreur revient le plus souvent sur les transitoires ?", reponse: "Utiliser la résistance du schéma au lieu de la résistance de Thévenin vue par le condensateur." },
    ],
    { titre: "Six cartes à retourner" }
  );
  ressources.push(cartes);

  /* ----------------------------------------------------------------------
     O. Simulations : créées d'abord, puis pilotées par les curseurs
     ---------------------------------------------------------------------- */

  const traceur = api.sim.traceur("#demo-traceur", {
    titre: "Charge du condensateur et tension de la résistance",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "tension",
    yUnite: "V",
    xMin: 0,
    xMax: 5,
    yMin: 0,
    yMax: 13,
    series: [
      { id: "uc", nom: "u_C(t), tension du condensateur" },
      { id: "ur", nom: "u_R(t), tension de la résistance" },
    ],
    note: "Les deux courbes se croisent à $0{,}69\\,\\tau$, où chaque élément supporte la moitié de la tension de source.",
  });
  ressources.push(traceur);

  const oscilloscope = api.sim.oscilloscope("#demo-oscilloscope", {
    titre: "Entrée carrée et sortie filtrée",
    voies: [
      { id: "entree", nom: "entrée, signal carré", unite: "V", signal: () => 0 },
      { id: "sortie", nom: "sortie, aux bornes de C", unite: "V", signal: () => 0 },
    ],
    baseTemps: 0.002,
    amplitudeDiv: 2,
    note: "Comparez la période du signal à la constante de temps : au-delà, le circuit n'a plus le temps de charger.",
  });
  ressources.push(oscilloscope);

  const fresnel = api.sim.fresnel("#demo-fresnel", {
    titre: "Tensions partielles en régime sinusoïdal",
    vecteurs: [
      { id: "ur", nom: "U_R", amplitude: 0.707, phase: 45, unite: "V", couleur: "serie-1" },
      { id: "uc", nom: "U_C", amplitude: 0.707, phase: -45, unite: "V", couleur: "serie-4" },
    ],
    somme: true,
    nomSomme: "somme",
    note: "La somme vectorielle, en ambre, reste égale à la tension d'entrée quel que soit le déphasage.",
  });
  ressources.push(fresnel);

  const bode = api.sim.bode("#demo-bode", {
    titre: "Gain et phase du passe-bas",
    fMin: 1,
    fMax: 100000,
    fonction: (frequence) => gainPhase(frequence, tauDe(DEPART)),
    coupure: 1 / (2 * Math.PI * tauDe(DEPART)),
    libelleCoupure: "fc",
    note: "La pente asymptotique vaut $-20\\ \\mathrm{dB}$ par décade, et la phase tend vers $-90$ degrés.",
  });
  ressources.push(bode);

  const spectre = api.sim.spectre("#demo-spectre", {
    titre: "Amplitude des harmoniques en sortie",
    xTitre: "rang de l'harmonique",
    yTitre: "amplitude",
    unite: "V",
    barres: [],
    note: "Les harmoniques de rang élevé sont atténués dans le rapport donné par le diagramme de Bode.",
  });
  ressources.push(spectre);

  /* Curseurs : un seul jeu de paramètres pilote les cinq tracés. */
  const curseurs = api.sim.curseurs(
    "#demo-curseurs",
    [
      { id: "r_kohm", libelle: "Résistance R", min: 1, max: 100, pas: 0.5, valeur: DEPART.r_kohm, unite: "kΩ" },
      { id: "c_nf", libelle: "Capacité C", min: 10, max: 1000, pas: 10, valeur: DEPART.c_nf, unite: "nF" },
      { id: "e_v", libelle: "Échelon de tension E", min: 1, max: 24, pas: 0.5, valeur: DEPART.e_v, unite: "V" },
      { id: "f_hz", libelle: "Fréquence du signal d'essai", min: 20, max: 2000, pas: 10, valeur: DEPART.f_hz, unite: "Hz" },
    ],
    (valeurs) => {
      const tau = tauDe(valeurs);
      const fc = 1 / (2 * Math.PI * tau);
      const amplitude = valeurs.e_v / 2;

      /* Réponse temporelle */
      traceur.definirPlage({ xMin: 0, xMax: tau * 5 * 1000, yMin: 0, yMax: valeurs.e_v * 1.08 });
      traceur.definirFonction("uc", (tms) => valeurs.e_v * (1 - Math.exp(-tms / 1000 / tau)));
      traceur.definirFonction("ur", (tms) => valeurs.e_v * Math.exp(-tms / 1000 / tau));
      traceur.definirMesures([
        { nom: "Constante de temps", valeur: api.util.formater(tau * 1000, 3) + " ms" },
        { nom: "Fréquence de coupure", valeur: api.util.formater(fc, 1) + " Hz" },
        { nom: "Énergie finale", valeur: api.util.formater(0.5 * valeurs.c_nf * 1e-9 * valeurs.e_v * valeurs.e_v * 1e6, 2) + " µJ" },
        { nom: "Courant initial", valeur: api.util.formater(valeurs.e_v / (valeurs.r_kohm * 1e3) * 1000, 3) + " mA" },
      ]);

      /* Oscilloscope */
      oscilloscope.definirSignal("entree", (t) => carre(t, valeurs.f_hz, amplitude));
      oscilloscope.definirSignal("sortie", (t) => carreFiltre(t, valeurs.f_hz, amplitude, tau));
      oscilloscope.definirMesures([
        { nom: "Période du signal", valeur: api.util.formater(1000 / valeurs.f_hz, 3) + " ms" },
        { nom: "Rapport période sur tau", valeur: api.util.formater(1 / (valeurs.f_hz * tau), 2) },
      ]);

      /* Fresnel à la fréquence d'essai */
      const reponse = gainPhase(valeurs.f_hz, tau);
      const phaseDeg = (reponse.phase * 180) / Math.PI;
      const moduleUc = amplitude * reponse.gain;
      const moduleUr = amplitude * Math.sqrt(Math.max(0, 1 - reponse.gain * reponse.gain));
      fresnel.definirVecteur("uc", { amplitude: moduleUc, phase: phaseDeg });
      fresnel.definirVecteur("ur", { amplitude: moduleUr, phase: phaseDeg + 90 });
      fresnel.definirMesures([
        { nom: "Gain à la fréquence d'essai", valeur: api.util.formater(20 * Math.log10(reponse.gain), 2) + " dB" },
        { nom: "Déphasage", valeur: api.util.formater(phaseDeg, 1) + "\u00b0" },
      ]);

      /* Bode */
      bode.definirFonction((frequence) => gainPhase(frequence, tau));
      bode.definirCoupure(fc);

      /* Spectre de sortie et taux de distorsion */
      const barres = [];
      let fondamental = 0;
      let sommeCarres = 0;
      for (let rang = 1; rang <= 15; rang += 2) {
        const gain = gainPhase(rang * valeurs.f_hz, tau).gain;
        const valeur = ((4 * amplitude) / (Math.PI * rang)) * gain;
        barres.push({ etiquette: "H" + rang, valeur });
        if (rang === 1) fondamental = valeur;
        else sommeCarres += valeur * valeur;
      }
      spectre.definirBarres(barres);
      spectre.definirMesures([
        { nom: "Fondamental", valeur: api.util.formater(fondamental, 3) + " V" },
        {
          nom: "Distorsion harmonique",
          valeur: fondamental > 0 ? api.util.formater((Math.sqrt(sommeCarres) / fondamental) * 100, 1) + " %" : "0 %",
        },
      ]);
    }
  );
  ressources.push(curseurs);

  /* ----------------------------------------------------------------------
     P. Auto-évaluation, alimentée par les scores du cours
     ---------------------------------------------------------------------- */

  const autoEvaluation = api.autoEvaluation("#demo-autoevaluation", null, {
    titre: "Où en suis-je sur les circuits du premier ordre ?",
  });
  ressources.push(autoEvaluation);

  /* Révélation au défilement des encadrés et formules de la page. */
  api.reveler(racine.querySelectorAll(".formule-cle, figure, .encadre"), { decalage: 0.04 });
}

export function detruire() {
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
