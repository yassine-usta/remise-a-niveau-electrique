/* ==========================================================================
   cours/diagnostic-initial-et-remise-a-niveau-mathematique/cours.js
   Diagnostic initial et remise à niveau mathématique.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [cle, valeur] of Object.entries(attrs)) el.setAttribute(cle, String(valeur));
  return el;
}

/* Triangle rectangle réutilisé par la question de schéma du quiz. */
const DESSIN_TRIANGLE = `
  <g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">
    <path d="M60 60 L60 190 L330 190 Z"/>
    <path d="M60 190 L60 174 L76 174 L76 190" stroke-width="1.6"/>
  </g>
  <g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">
    <text x="30" y="130">opposé</text>
    <text x="170" y="212">adjacent</text>
    <text x="165" y="115">hypoténuse</text>
    <text x="295" y="182">θ</text>
  </g>
`;

export async function init(racine, api) {
  ressources = [];
  nettoyeursAnimation = [];

  brancherRenvois(racine, api);
  construireMinitest(racine, api);
  construireTriangle(racine, api);
  construirePlanComplexe(racine, api);
  construireCercle(racine, api);
  construireSimDecomposition(racine, api);
  construireSimSomme(racine, api);
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
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.qcm("#c-minitest", {
      id: "c-qcm-notation",
      titre: "Notation scientifique normalisée",
      niveau: "diagnostic",
      enonce:
        "<p>Lequel de ces nombres est écrit en notation scientifique normalisée, avec une mantisse comprise entre 1 et 10 ?</p>",
      options: [
        { texte: "$0{,}47 \\times 10^{4}$" },
        { texte: "$4{,}7 \\times 10^{3}$", juste: true },
        { texte: "$47 \\times 10^{2}$" },
        { texte: "$4{,}7 \\times 10^{3{,}5}$" },
      ],
      etapes: [
        { texte: "La notation scientifique normalisée impose une mantisse $a$ telle que $1 \\le |a| < 10$, avec un exposant entier." },
        { texte: "$0{,}47$ est inférieur à 1 et $47$ est supérieur ou égal à 10 : ces deux écritures ne sont pas normalisées." },
        {
          texte: "$4{,}7 \\times 10^{3{,}5}$ utilise un exposant non entier, ce qui n'est pas valide non plus.",
          note: "Seule $4{,}7 \\times 10^{3}$ respecte les deux règles à la fois.",
        },
      ],
    })
  );

  ressources.push(
    api.exercice.vraiFaux("#c-minitest", {
      id: "c-vraifaux-sinus",
      titre: "Bornes du sinus",
      niveau: "diagnostic",
      enonce: "<p>Le sinus d'un angle peut dépasser 1 en valeur absolue.</p>",
      reponse: false,
      etapes: [
        { texte: "Sur le cercle trigonométrique de rayon 1, $\\sin\\theta$ est la projection verticale d'un point situé à distance 1 de l'origine." },
        { texte: "Une projection ne dépasse jamais la longueur du vecteur projeté : $-1 \\le \\sin\\theta \\le 1$ pour tout angle réel $\\theta$." },
      ],
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-num-puissances",
      titre: "Produit de puissances de dix",
      niveau: "diagnostic",
      enonce: "<p>Combien vaut $10^{3} \\times 10^{-6}$ ?</p>",
      valeur: 1e-3,
      tolerance: 0.02,
      chiffres: 4,
      libelleChamp: "Résultat",
      etapes: [
        { texte: "La loi des exposants donne $10^{m} \\times 10^{n} = 10^{m+n}$." },
        { texte: "Ici $m = 3$ et $n = -6$, donc $m+n = -3$." },
        { texte: "$10^{-3} = 0{,}001$." },
      ],
    })
  );
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
    /* Position absolue calculée depuis la page, jamais depuis l'état interne
       du défilement fluide : le renvoi tombe juste même après un saut. */
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
   F. Triangle des prérequis, tracé à l'apparition du schéma
   -------------------------------------------------------------------------- */

function construireTriangle(racine, api) {
  const conteneur = racine.querySelector("#f-triangle");
  if (!conteneur) return;

  const sommets = {
    haut: { x: 260, y: 46 },
    gauche: { x: 90, y: 270 },
    droite: { x: 430, y: 270 },
  };
  const centre = { x: 260, y: 195 };

  const svg = svgEl("svg", {
    viewBox: "0 0 520 320",
    role: "img",
    "aria-label": "Triangle des prérequis mathématiques : trigonométrie, notation scientifique, nombres complexes",
    style: "width:100%;height:auto;display:block",
  });

  const groupeTraits = svgEl("g", {
    stroke: "currentColor",
    "stroke-width": "2.4",
    fill: "none",
    "stroke-linecap": "round",
  });
  function ligne(p1, p2, pointille) {
    const chemin = svgEl("path", { d: "M" + p1.x + " " + p1.y + " L" + p2.x + " " + p2.y });
    if (pointille) chemin.setAttribute("stroke-dasharray", "6 5");
    groupeTraits.appendChild(chemin);
  }
  ligne(sommets.haut, sommets.gauche);
  ligne(sommets.gauche, sommets.droite);
  ligne(sommets.droite, sommets.haut);
  ligne(centre, sommets.haut, true);
  ligne(centre, sommets.gauche, true);
  ligne(centre, sommets.droite, true);
  svg.appendChild(groupeTraits);

  function texteMultiligne(x, y, ancrage, morceaux, gras) {
    const texte = svgEl("text", { x, y, "text-anchor": ancrage });
    if (gras) texte.setAttribute("font-weight", "600");
    morceaux.forEach((ligneTexte, index) => {
      const tspan = svgEl("tspan", { x, dy: index === 0 ? 0 : 14 });
      tspan.textContent = ligneTexte;
      texte.appendChild(tspan);
    });
    return texte;
  }

  const groupeTexte = svgEl("g", {
    fill: "currentColor",
    stroke: "none",
    "font-family": "ui-monospace, monospace",
    "font-size": "13",
  });
  groupeTexte.appendChild(texteMultiligne(260, 28, "middle", ["Trigonométrie"]));
  groupeTexte.appendChild(texteMultiligne(90, 292, "middle", ["Notation scientifique", "et préfixes SI"]));
  groupeTexte.appendChild(texteMultiligne(430, 292, "middle", ["Nombres complexes"]));
  groupeTexte.appendChild(texteMultiligne(260, 188, "middle", ["Calculs", "d'ingénierie", "électrique"], true));
  svg.appendChild(groupeTexte);

  conteneur.appendChild(svg);

  /* Le tracé se joue une fois, à l'entrée du schéma dans l'écran : il est
     terminé avant que le schéma n'atteigne le centre. */
  ressources.push(api.dessiner(svg, { duree: 1.4 }));
}

/* --------------------------------------------------------------------------
   E. Plan complexe, tracé à l'apparition du schéma
   -------------------------------------------------------------------------- */

function construirePlanComplexe(racine, api) {
  const svg = racine.querySelector("#e-plan-complexe svg");
  if (!svg) return;
  ressources.push(api.dessiner(svg, { duree: 1.3 }));
}

/* --------------------------------------------------------------------------
   E. Cercle trigonométrique manipulable

   L'angle est piloté par l'apprenant : poignée sur le cercle, curseur, clavier
   et lecteur. Aucune grandeur ne dépend de la position de défilement.
   -------------------------------------------------------------------------- */

function construireCercle(racine, api) {
  const conteneur = racine.querySelector("#e-cercle");
  if (!conteneur) return;

  const centre = { x: 214, y: 186 };
  const rayon = 132;
  const angleDepart = 40;

  const svg = svgEl("svg", {
    viewBox: "0 0 450 344",
    "aria-label": "Cercle trigonométrique manipulable : angle, cosinus et sinus",
    style: "width:100%;height:auto;display:block",
  });

  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.5", opacity: "0.5" });
  fond.appendChild(svgEl("circle", { cx: centre.x, cy: centre.y, r: rayon }));
  fond.appendChild(svgEl("path", { d: "M" + (centre.x - rayon - 28) + " " + centre.y + "H" + (centre.x + rayon + 28) }));
  fond.appendChild(svgEl("path", { d: "M" + centre.x + " " + (centre.y - rayon - 28) + "V" + (centre.y + rayon + 28) }));
  fond.appendChild(svgEl("path", { d: "M" + (centre.x + rayon) + " " + (centre.y - 5) + "v10" }));
  fond.appendChild(svgEl("path", { d: "M" + (centre.x - rayon) + " " + (centre.y - 5) + "v10" }));
  fond.appendChild(svgEl("path", { d: "M" + (centre.x - 5) + " " + (centre.y - rayon) + "h10" }));
  fond.appendChild(svgEl("path", { d: "M" + (centre.x - 5) + " " + (centre.y + rayon) + "h10" }));
  svg.appendChild(fond);

  const reperes = svgEl("g", {
    fill: "currentColor",
    stroke: "none",
    "font-family": "ui-monospace, monospace",
    "font-size": "12",
    opacity: "0.72",
  });
  function marque(x, y, texte, ancrage) {
    const element = svgEl("text", { x, y, "text-anchor": ancrage || "middle" });
    element.textContent = texte;
    return element;
  }
  reperes.appendChild(marque(centre.x + rayon, centre.y + 20, "1"));
  reperes.appendChild(marque(centre.x - rayon, centre.y + 20, "-1"));
  reperes.appendChild(marque(centre.x - 14, centre.y - rayon + 4, "1", "end"));
  reperes.appendChild(marque(centre.x - 14, centre.y + rayon + 4, "-1", "end"));
  reperes.appendChild(marque(centre.x + rayon + 38, centre.y + 4, "cos"));
  reperes.appendChild(marque(centre.x, centre.y - rayon - 36, "sin"));
  svg.appendChild(reperes);

  const arc = svgEl("path", { fill: "none", "stroke-width": "2", style: "stroke: var(--serie-2)" });
  const guide = svgEl("path", {
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.4",
    "stroke-dasharray": "5 4",
    opacity: "0.65",
  });
  const projCos = svgEl("path", {
    fill: "none",
    "stroke-width": "3.4",
    "stroke-linecap": "round",
    style: "stroke: var(--serie-1)",
  });
  const projSin = svgEl("path", {
    fill: "none",
    "stroke-width": "3.4",
    "stroke-linecap": "round",
    style: "stroke: var(--serie-3)",
  });
  const rayonTrace = svgEl("path", {
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2.8",
    "stroke-linecap": "round",
  });
  svg.append(arc, guide, projCos, projSin, rayonTrace);

  const etiquettes = svgEl("g", {
    stroke: "none",
    "font-family": "ui-monospace, monospace",
    "font-size": "12.5",
    "font-weight": "500",
  });
  const texteCos = svgEl("text", { "text-anchor": "middle", style: "fill: var(--serie-1)" });
  const texteSin = svgEl("text", { "text-anchor": "start", style: "fill: var(--serie-3)" });
  const texteAngle = svgEl("text", { "text-anchor": "middle", style: "fill: var(--serie-2)" });
  texteAngle.textContent = "θ";
  etiquettes.append(texteCos, texteSin, texteAngle);
  svg.appendChild(etiquettes);

  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-cercle-valeurs", [
    { id: "degres", libelle: "Angle", unite: "°", decimales: 1 },
    { id: "radians", libelle: "Angle en radians", unite: "rad", decimales: 3 },
    { id: "cos", libelle: "cos θ", decimales: 3 },
    { id: "sin", libelle: "sin θ", decimales: 3 },
    { id: "tan", libelle: "tan θ", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  let synchronisation = false;
  let poignee = null;
  let curseurs = null;
  let lecteur = null;

  function tracer(degres) {
    const radians = (degres * Math.PI) / 180;
    const cosv = Math.cos(radians);
    const sinv = Math.sin(radians);
    const x = centre.x + rayon * cosv;
    const y = centre.y - rayon * sinv;

    rayonTrace.setAttribute("d", "M" + centre.x + " " + centre.y + "L" + x + " " + y);
    projCos.setAttribute("d", "M" + centre.x + " " + centre.y + "H" + x);
    projSin.setAttribute("d", "M" + x + " " + centre.y + "V" + y);
    guide.setAttribute("d", "M" + x + " " + y + "H" + centre.x + "M" + x + " " + y + "V" + centre.y);

    const rayonArc = 36;
    const grandArc = degres > 180 ? 1 : 0;
    arc.setAttribute(
      "d",
      "M" + (centre.x + rayonArc) + " " + centre.y +
        "A" + rayonArc + " " + rayonArc + " 0 " + grandArc + " 0 " +
        (centre.x + rayonArc * cosv) + " " + (centre.y - rayonArc * sinv)
    );

    const milieu = ((degres / 2) * Math.PI) / 180;
    texteAngle.setAttribute("x", String(centre.x + (rayonArc + 16) * Math.cos(milieu)));
    texteAngle.setAttribute("y", String(centre.y - (rayonArc + 16) * Math.sin(milieu) + 4));

    texteCos.textContent = "cos θ";
    texteCos.setAttribute("x", String((centre.x + x) / 2));
    texteCos.setAttribute("y", String(centre.y + (sinv >= 0 ? 20 : -10)));
    texteCos.setAttribute("opacity", Math.abs(cosv) > 0.16 ? "1" : "0");

    texteSin.textContent = "sin θ";
    texteSin.setAttribute("x", String(x + (cosv >= 0 ? 9 : -9)));
    texteSin.setAttribute("text-anchor", cosv >= 0 ? "start" : "end");
    texteSin.setAttribute("y", String((centre.y + y) / 2 + 4));
    texteSin.setAttribute("opacity", Math.abs(sinv) > 0.16 ? "1" : "0");

    if (valeurs) {
      valeurs.maj({
        degres,
        radians,
        cos: cosv,
        sin: sinv,
        /* La tangente n'existe pas là où le cosinus s'annule. */
        tan: Math.abs(cosv) < 1e-3 ? NaN : sinv / cosv,
      });
    }
  }

  /* Une seule source de vérité : les trois commandes se recopient l'une l'autre. */
  function appliquer(degres, source) {
    if (synchronisation) return;
    synchronisation = true;
    const angle = ((Number(degres) % 360) + 360) % 360;
    tracer(angle);
    if (source !== "poignee" && poignee) poignee.set(angle, false);
    if (source !== "curseur" && curseurs) curseurs.definir("angle", Math.round(angle));
    if (source !== "lecteur" && lecteur) lecteur.suivre(angle);
    synchronisation = false;
  }

  poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre,
    rayon,
    valeur: angleDepart,
    pas: 5,
    libelle: "Angle sur le cercle trigonométrique",
    diffuserAuDepart: false,
    rappel: (mesure) => appliquer(mesure.angle, "poignee"),
  });
  if (poignee) ressources.push(poignee);

  curseurs = api.sim.curseurs(
    "#e-cercle-curseur",
    [{ id: "angle", libelle: "Angle θ", min: 0, max: 360, pas: 1, valeur: angleDepart, unite: "°" }],
    (lues) => appliquer(lues.angle, "curseur")
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#e-cercle-lecteur", {
    de: 0,
    a: 360,
    duree: 9,
    boucle: true,
    auto: false,
    libelle: "Rotation du rayon",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  appliquer(angleDepart, null);
}

/* --------------------------------------------------------------------------
   E. Simulation interactive : décomposition d'un phaseur
   -------------------------------------------------------------------------- */

function construireSimDecomposition(racine, api) {
  if (!racine.querySelector("#e-sim-decomposition-curseurs") || !racine.querySelector("#e-sim-decomposition-fresnel")) return;

  const depart = { amplitude: 10, angle: 30 };
  const radDepart = (depart.angle * Math.PI) / 180;

  const fresnel = api.sim.fresnel("#e-sim-decomposition-fresnel", {
    titre: "Décomposition d'un phaseur en projections",
    vecteurs: [
      {
        id: "re",
        nom: "partie réelle",
        amplitude: depart.amplitude * Math.abs(Math.cos(radDepart)),
        phase: Math.cos(radDepart) >= 0 ? 0 : 180,
        couleur: "serie-1",
      },
      {
        id: "im",
        nom: "partie imaginaire",
        amplitude: depart.amplitude * Math.abs(Math.sin(radDepart)),
        phase: Math.sin(radDepart) >= 0 ? 90 : 270,
        couleur: "serie-4",
      },
    ],
    somme: true,
    nomSomme: "Z reconstruit",
    note:
      "Le vecteur ambre, somme des deux projections, doit toujours retomber exactement sur l'amplitude et l'angle réglés par les curseurs : c'est la vérification que la décomposition est correcte.",
  });
  if (!fresnel) return;
  ressources.push(fresnel);

  const curseurs = api.sim.curseurs(
    "#e-sim-decomposition-curseurs",
    [
      { id: "amplitude", libelle: "Amplitude de Z", min: 1, max: 20, pas: 0.5, valeur: depart.amplitude, unite: "" },
      { id: "angle", libelle: "Angle θ", min: 0, max: 360, pas: 5, valeur: depart.angle, unite: "°" },
    ],
    (valeurs) => {
      const rad = (valeurs.angle * Math.PI) / 180;
      const cosv = Math.cos(rad);
      const sinv = Math.sin(rad);
      fresnel.definirVecteur("re", { amplitude: valeurs.amplitude * Math.abs(cosv), phase: cosv >= 0 ? 0 : 180 });
      fresnel.definirVecteur("im", { amplitude: valeurs.amplitude * Math.abs(sinv), phase: sinv >= 0 ? 90 : 270 });
      fresnel.definirMesures([
        { nom: "cos θ", valeur: api.util.formater(cosv, 3) },
        { nom: "sin θ", valeur: api.util.formater(sinv, 3) },
        { nom: "Partie réelle", valeur: api.util.formater(valeurs.amplitude * cosv, 2) },
        { nom: "Partie imaginaire", valeur: api.util.formater(valeurs.amplitude * sinv, 2) },
      ]);
    }
  );
  if (curseurs) ressources.push(curseurs);
}

/* --------------------------------------------------------------------------
   H. Simulation interactive : somme de deux phaseurs
   -------------------------------------------------------------------------- */

function construireSimSomme(racine, api) {
  if (!racine.querySelector("#h-sim-somme-curseurs") || !racine.querySelector("#h-sim-somme-fresnel")) return;

  const depart = { amplitude1: 8, phase1: 50, amplitude2: 5, phase2: -20 };

  const fresnel = api.sim.fresnel("#h-sim-somme-fresnel", {
    titre: "Somme de deux phaseurs",
    vecteurs: [
      { id: "a", nom: "U1", amplitude: depart.amplitude1, phase: depart.phase1, unite: "V", couleur: "serie-1" },
      { id: "b", nom: "U2", amplitude: depart.amplitude2, phase: depart.phase2, unite: "V", couleur: "serie-3" },
    ],
    somme: true,
    nomSomme: "U1 + U2",
    note:
      "Le vecteur ambre montre la somme réelle U1 + U2 ; comparez sa longueur à la somme arithmétique des deux amplitudes, affichée dans les mesures.",
  });
  if (!fresnel) return;
  ressources.push(fresnel);

  const curseurs = api.sim.curseurs(
    "#h-sim-somme-curseurs",
    [
      { id: "amplitude1", libelle: "Amplitude U1", min: 1, max: 15, pas: 0.5, valeur: depart.amplitude1, unite: "V" },
      { id: "phase1", libelle: "Phase de U1", min: -180, max: 180, pas: 5, valeur: depart.phase1, unite: "°" },
      { id: "amplitude2", libelle: "Amplitude U2", min: 1, max: 15, pas: 0.5, valeur: depart.amplitude2, unite: "V" },
      { id: "phase2", libelle: "Phase de U2", min: -180, max: 180, pas: 5, valeur: depart.phase2, unite: "°" },
    ],
    (valeurs) => {
      fresnel.definirVecteur("a", { amplitude: valeurs.amplitude1, phase: valeurs.phase1 });
      fresnel.definirVecteur("b", { amplitude: valeurs.amplitude2, phase: valeurs.phase2 });

      const rad1 = (valeurs.phase1 * Math.PI) / 180;
      const rad2 = (valeurs.phase2 * Math.PI) / 180;
      const a = valeurs.amplitude1 * Math.cos(rad1) + valeurs.amplitude2 * Math.cos(rad2);
      const b = valeurs.amplitude1 * Math.sin(rad1) + valeurs.amplitude2 * Math.sin(rad2);
      const module = Math.hypot(a, b);
      const phase = (Math.atan2(b, a) * 180) / Math.PI;
      const sommeArithmetique = valeurs.amplitude1 + valeurs.amplitude2;
      const difference = Math.abs(valeurs.amplitude1 - valeurs.amplitude2);

      fresnel.definirMesures([
        { nom: "Module de la somme", valeur: api.util.formater(module, 3) + " V" },
        { nom: "Phase de la somme", valeur: api.util.formater(phase, 1) + " °" },
        { nom: "Somme arithmétique des modules", valeur: api.util.formater(sommeArithmetique, 2) + " V" },
        {
          nom: "Encadrement attendu",
          valeur: api.util.formater(difference, 2) + " à " + api.util.formater(sommeArithmetique, 2) + " V",
        },
      ]);
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
      titre: "Conversion d'unité avec préfixe SI",
      niveau: "fondamental",
      enonce: "<p>Un courant mesuré vaut $4700\\ \\mathrm{\\mu A}$. Exprimez-le en milliampères (mA).</p>",
      valeur: 4.7,
      unite: "mA",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Courant en mA",
      etapes: [
        { texte: "$4700\\ \\mathrm{\\mu A} = 4700 \\times 10^{-6}\\ \\mathrm{A}$." },
        { texte: "$4700 \\times 10^{-6} = 4{,}7 \\times 10^{-3}\\ \\mathrm{A}$." },
        {
          texte: "$4{,}7 \\times 10^{-3}\\ \\mathrm{A} = 4{,}7\\ \\mathrm{mA}$.",
          note: "Repasser par les ampères avant de reconvertir évite l'erreur de facteur 1000 la plus fréquente.",
        },
      ],
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-2",
      titre: "Module d'un nombre complexe",
      niveau: "fondamental",
      enonce: "<p>Calculez le module du nombre complexe $Z = 3 + j4$.</p>",
      valeur: 5,
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Module |Z|",
      etapes: [
        { texte: "$|Z| = \\sqrt{a^2+b^2}$ avec $a=3$ et $b=4$." },
        { texte: "$|Z| = \\sqrt{9+16} = \\sqrt{25}$." },
        { texte: "$|Z| = 5$.", note: "Le triplet 3, 4, 5 est le triangle rectangle le plus courant en vérification rapide." },
      ],
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-1",
      titre: "Projection trigonométrique d'un phaseur",
      niveau: "intermédiaire",
      enonce:
        "<p>Un phaseur a une amplitude de 15 et une phase de 60 degrés. Quelle est sa partie réelle, c'est-à-dire sa projection sur l'axe horizontal ?</p>",
      valeur: 7.5,
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Partie réelle",
      etapes: [
        { texte: "La partie réelle d'un phaseur d'amplitude $A$ et de phase $\\theta$ vaut $A\\cos\\theta$." },
        { texte: "$\\cos(60°) = 0{,}5$." },
        { texte: "$15 \\times 0{,}5 = 7{,}5$." },
      ],
    })
  );

  ressources.push(
    api.exercice.qcm("#k-exercices-blocs", {
      id: "k-inter-2",
      titre: "Multiplication de deux nombres complexes en forme polaire",
      niveau: "intermédiaire",
      enonce: "<p>Deux nombres complexes sont donnés en forme polaire, $(r_1, \\theta_1)$ et $(r_2, \\theta_2)$. Que vaut leur produit ?</p>",
      options: [
        { texte: "$(r_1 \\times r_2,\\ \\theta_1+\\theta_2)$", juste: true },
        { texte: "$(r_1+r_2,\\ \\theta_1 \\times \\theta_2)$" },
        { texte: "$(r_1 \\times r_2,\\ \\theta_1-\\theta_2)$" },
        { texte: "Deux formes polaires ne peuvent pas se multiplier directement." },
      ],
      etapes: [
        { texte: "En forme polaire, $r_1 e^{j\\theta_1} \\times r_2 e^{j\\theta_2} = r_1 r_2\\, e^{j(\\theta_1+\\theta_2)}$." },
        {
          texte: "Les modules se multiplient, les arguments s'additionnent : c'est tout l'intérêt de la forme polaire pour une multiplication.",
          note: "En forme cartésienne, le même produit exigerait de développer quatre termes croisés.",
        },
      ],
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-avance",
      titre: "Somme de deux phaseurs déphasés",
      niveau: "avancé",
      enonce:
        "<p>Deux phaseurs ont pour amplitude et phase $(8\\ \\mathrm{V}, 50°)$ et $(5\\ \\mathrm{V}, -20°)$. Quel est le module de leur somme, en volts ?</p>",
      valeur: 10.79,
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Module de la somme",
      etapes: [
        { texte: "Forme cartésienne du premier phaseur : $a_1 = 8\\cos(50°) = 5{,}14$, $b_1 = 8\\sin(50°) = 6{,}13$." },
        { texte: "Forme cartésienne du second phaseur : $a_2 = 5\\cos(-20°) = 4{,}70$, $b_2 = 5\\sin(-20°) = -1{,}71$." },
        { texte: "Somme terme à terme : $a = a_1+a_2 = 9{,}84$, $b = b_1+b_2 = 4{,}42$." },
        {
          texte: "Module : $|U| = \\sqrt{9{,}84^2+4{,}42^2} = 10{,}79\\ \\mathrm{V}$.",
          note: "Contrôle : l'inégalité triangulaire impose $3\\ \\mathrm{V} \\le |U| \\le 13\\ \\mathrm{V}$, ce qui est vérifié.",
        },
      ],
    })
  );

  ressources.push(
    api.exercice.reponseCourte("#k-exercices-blocs", {
      id: "k-diagnostic",
      titre: "Lecture d'un code de condensateur",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Un condensateur céramique porte le marquage \"473\". Un technicien le range avec ses condensateurs de \"473 picofarads\". Expliquez, en une ou deux phrases, l'erreur probable et donnez la valeur réelle en nanofarads.</p>",
      motsCles: [
        ["47000 pf", "47000pf", "47 nf", "47nf", "47 000 pf"],
        ["multiplicateur", "exposant", "troisieme chiffre", "puissance de dix", "facteur"],
        ["lu directement", "confond", "erreur de lecture", "sans appliquer"],
      ],
      minimum: 2,
      exemple: "Le troisième chiffre est un exposant, pas un chiffre significatif...",
      etapes: [
        { texte: "Le code à trois chiffres d'un condensateur donne deux chiffres significatifs puis un exposant en picofarads : $47 \\times 10^{3}\\ \\mathrm{pF}$." },
        { texte: "$47 \\times 10^{3}\\ \\mathrm{pF} = 47000\\ \\mathrm{pF} = 47\\ \\mathrm{nF}$." },
        {
          texte: "L'erreur consiste à lire les trois chiffres comme une valeur directe en picofarads, en oubliant que le dernier chiffre est un multiplicateur, pas une unité de plus.",
          note: "L'écart entre 473 pF et 47000 pF est un facteur proche de 100, du même ordre que les erreurs de préfixe SI vues en section E.",
        },
      ],
    })
  );

  ressources.push(
    api.exercice.reponseCourte("#k-exercices-blocs", {
      id: "k-conceptuel",
      titre: "Pourquoi le phaseur simplifie l'addition",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi représenter deux signaux sinusoïdaux de même fréquence par des phaseurs facilite leur addition, comparé à une addition directe de deux fonctions cosinus déphasées.</p>",
      motsCles: [
        ["vecteur", "vectoriel", "geometrique"],
        ["meme frequence", "frequence commune"],
        ["addition directe", "identites trigonometriques", "developpement trigonometrique"],
      ],
      minimum: 2,
      exemple: "Reliez la notion de vecteur, la fréquence commune, et les identités trigonométriques évitées.",
      etapes: [
        { texte: "Deux sinusoïdes de même fréquence ne diffèrent que par leur amplitude et leur phase : elles se comportent comme deux vecteurs tournant ensemble, à la même vitesse angulaire." },
        { texte: "Les additionner directement demanderait de développer $\\cos(\\omega t+\\varphi_1)+\\cos(\\omega t+\\varphi_2)$ avec des identités trigonométriques à chaque fois." },
        {
          texte: "En représentant chaque signal par son phaseur, l'addition devient une simple addition vectorielle, indépendante du temps, avant de revenir au signal temporel si besoin.",
          note: "C'est exactement la méthode utilisée dans l'exemple résolu de la section H.",
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
        enonce: "<p>Quel exposant correspond au préfixe \"nano\" ?</p>",
        options: ["$10^{-3}$", "$10^{-6}$", "$10^{-9}$", "$10^{-12}$"],
        bonnes: [2],
        explication: "Le préfixe nano vaut $10^{-9}$, entre micro ($10^{-6}$) et pico ($10^{-12}$).",
        resume: "Exposant du préfixe nano",
      },
      {
        type: "vraiFaux",
        enonce: "<p>300 000 s'écrit $3 \\times 10^{5}$ en notation scientifique normalisée.</p>",
        reponse: true,
        explication: "$300000 = 3 \\times 100000 = 3 \\times 10^{5}$, avec une mantisse 3 bien comprise entre 1 et 10.",
        resume: "Notation scientifique de 300 000",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi vérifie-t-on l'homogénéité dimensionnelle d'un résultat ?</p>",
        motsCles: [["erreur", "detecter"], ["unite", "dimension"], ["coherent", "coherence"]],
        minimum: 1,
        explication:
          "Un résultat aux unités incohérentes trahit presque toujours une étape de calcul oubliée ou mal posée, avant même de vérifier le chiffre lui-même.",
        resume: "Rôle de la vérification dimensionnelle",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est le module du nombre complexe $Z = 5 - j12$ ?</p>",
        valeur: 13,
        chiffres: 1,
        explication: "$|Z| = \\sqrt{5^2+12^2} = \\sqrt{169} = 13$, le triplet 5, 12, 13.",
        resume: "Module de 5 moins j12",
      },
      {
        type: "qcm",
        enonce: "<p>Lesquelles de ces égalités sont exactes ?</p>",
        options: [
          { texte: "$\\cos^2\\theta+\\sin^2\\theta = 1$", juste: true },
          { texte: "$e^{j\\theta} = \\cos\\theta+j\\sin\\theta$", juste: true },
          { texte: "$j^2 = 1$" },
          { texte: "Le produit de deux formes polaires additionne les modules." },
        ],
        multiple: true,
        explication:
          "$j^2=-1$ par définition, et un produit polaire multiplie les modules et additionne les arguments, il ne les additionne pas eux-mêmes.",
        resume: "Identités fondamentales de la séance",
      },
      {
        type: "vraiFaux",
        enonce: "<p>L'argument d'un nombre complexe s'exprime toujours en degrés dans un calcul analytique.</p>",
        reponse: false,
        explication: "Les calculs analytiques (dérivées, exponentielle complexe) exigent des radians ; les degrés ne sont qu'une convention d'affichage.",
        resume: "Unité de l'argument en calcul analytique",
      },
      {
        type: "schema",
        enonce: "<p>Sur ce triangle rectangle, cliquez sur le côté qui intervient dans le calcul de $\\cos\\theta$.</p>",
        consigne: "Une seule zone à sélectionner.",
        viewBox: "0 0 400 220",
        dessin: DESSIN_TRIANGLE,
        zones: [
          { x: 110, y: 178, largeur: 160, hauteur: 24, etiquette: "côté adjacent", juste: true },
          { x: 20, y: 90, largeur: 55, hauteur: 75, etiquette: "côté opposé" },
          { x: 150, y: 95, largeur: 110, hauteur: 45, etiquette: "hypoténuse" },
        ],
        explication: "$\\cos\\theta$ est le rapport du côté adjacent à l'hypoténuse ; le côté opposé intervient dans $\\sin\\theta$.",
        resume: "Lecture du triangle rectangle",
      },
      {
        type: "calcul",
        enonce: "<p>Convertissez $68000\\ \\Omega$ en kilo-ohms.</p>",
        valeur: 68,
        unite: "kΩ",
        chiffres: 0,
        explication: "$68000\\ \\Omega = 68 \\times 10^{3}\\ \\Omega = 68\\ \\mathrm{k\\Omega}$.",
        resume: "Conversion en kilo-ohms",
      },
      {
        type: "courte",
        enonce: "<p>Quelle différence faites-vous entre la précision et l'ordre de grandeur d'un résultat ?</p>",
        motsCles: [["chiffres significatifs", "precision"], ["puissance de dix", "echelle", "ordre de grandeur"]],
        minimum: 1,
        explication:
          "La précision est portée par les chiffres significatifs de la mantisse, l'ordre de grandeur par l'exposant de dix : deux informations indépendantes.",
        resume: "Précision contre ordre de grandeur",
      },
      {
        type: "qcm",
        enonce: "<p>Que vaut $(2\\times 10^{3}) \\times (4\\times 10^{-6})$ ?</p>",
        options: ["$8\\times 10^{-3}$", "$6\\times 10^{-3}$", "$8\\times 10^{3}$", "$2\\times 10^{-3}$"],
        bonnes: [0],
        explication: "$2\\times4=8$ et $10^{3}\\times10^{-6}=10^{-3}$, soit $8\\times10^{-3}$.",
        resume: "Produit de deux notations scientifiques",
      },
    ],
    { titre: "Dix questions sur les fondamentaux mathématiques" }
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
      { categorie: "Définition", question: "Que signifie une notation scientifique normalisée ?", reponse: "Un nombre écrit $a \\times 10^{n}$ avec $1 \\le |a| < 10$ et $n$ entier relatif." },
      { categorie: "Préfixe", question: "Quel facteur représente le préfixe kilo (k) ?", reponse: "$10^{3}$." },
      { categorie: "Préfixe", question: "Quel facteur représente le préfixe micro (µ) ?", reponse: "$10^{-6}$." },
      { categorie: "Trigonométrie", question: "Que vaut $\\cos^2\\theta + \\sin^2\\theta$ ?", reponse: "1, pour tout angle $\\theta$ : c'est l'identité fondamentale du cercle trigonométrique." },
      { categorie: "Trigonométrie", question: "Dans quelle unité un calcul analytique attend-il un angle ?", reponse: "En radians, jamais directement en degrés." },
      { categorie: "Complexe", question: "Comment calcule-t-on le module d'un nombre complexe $a+jb$ ?", reponse: "$|Z| = \\sqrt{a^{2}+b^{2}}$." },
      {
        categorie: "Complexe",
        question: "Quelle fonction donne l'argument correct, quel que soit le quadrant ?",
        reponse: "$\\operatorname{atan2}(b,a)$, jamais $\\arctan(b/a)$ utilisé seul.",
        rappel: "arctan seul confond les points opposés par rapport à l'origine.",
      },
      { categorie: "Formule", question: "Qu'énonce la formule d'Euler ?", reponse: "$e^{j\\theta} = \\cos\\theta + j\\sin\\theta$, une rotation de module 1 dans le plan complexe." },
      { categorie: "Méthode", question: "Quelle forme d'un nombre complexe facilite l'addition ?", reponse: "La forme cartésienne, $a+jb$." },
      { categorie: "Méthode", question: "Quelle forme facilite la multiplication et la rotation ?", reponse: "La forme polaire, module et argument." },
    ],
    { titre: "Dix cartes sur les fondamentaux mathématiques" }
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
        type: "vraiFaux",
        enonce: "<p>Le module de la somme de deux phaseurs peut dépasser la somme de leurs modules pris séparément.</p>",
        reponse: false,
        explication: "L'inégalité triangulaire l'interdit : le module de la somme reste toujours entre la différence et la somme des deux modules.",
        resume: "Inégalité triangulaire sur les phaseurs",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est le module du nombre complexe $Z = 6 + j8$ ?</p>",
        valeur: 10,
        chiffres: 0,
        explication: "$|Z| = \\sqrt{6^2+8^2} = \\sqrt{100} = 10$.",
        resume: "Module de 6 plus j8",
      },
      {
        type: "courte",
        enonce: "<p>En une phrase, pourquoi convertit-on toujours les angles en radians avant un calcul analytique ?</p>",
        motsCles: [["radian", "convention"], ["formule", "derivee", "analytique", "serie"]],
        minimum: 1,
        explication: "Les formules analytiques des fonctions trigonométriques et de l'exponentielle complexe sont définies pour des angles en radians.",
        resume: "Radians en calcul analytique",
      },
    ],
    { titre: "Révision espacée : trois questions sur la séance du jour" }
  );
  if (quiz) ressources.push(quiz);
}

/* --------------------------------------------------------------------------
   P. Auto-évaluation
   -------------------------------------------------------------------------- */

function construireAutoEval(racine, api) {
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur les fondamentaux mathématiques ?",
  });
  if (auto) ressources.push(auto);
}
