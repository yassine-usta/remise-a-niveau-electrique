/* ==========================================================================
   cours/machine-a-courant-continu/cours.js
   Machine à courant continu : spire tournante et collecteur, forces sur les
   conducteurs, caractéristique mécanique et point de fonctionnement, cascade
   des puissances, commutation, démarrage dynamique, et actionneur de la vanne
   de refoulement de la pompe du site sur le bus 24 V secouru.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];
let compteurMarqueurs = 0;

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const VERS_TRMIN = 60 / TAU;

/* Moteur de la section H : 440 V, 52 A, 1500 tr/min, excitation séparée. */
const MH = { U: 440, In: 52, nn: 1500, R: 0.4, dUb: 2, Ue: 220, Ie: 1.8, pc: 600, L: 0.012 };
MH.Wn = (TAU * MH.nn) / 60;
MH.k = (MH.U - MH.R * MH.In - MH.dUb) / MH.Wn;
MH.Cn = MH.k * MH.In;

/* Variante série de même point nominal, saturation simplifiée. */
const SERIE = { Rt: 0.55 };
SERIE.kn = (MH.U - SERIE.Rt * MH.In - MH.dUb) / MH.Wn;

/** Induction rapportée sous les pôles : créneau arrondi, positive sous le pôle nord. */
function induction(angleDeg) {
  return Math.tanh(2.5 * Math.sin(angleDeg * DEG)) / Math.tanh(2.5);
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

function nouveauMarqueur(prefixe) {
  compteurMarqueurs += 1;
  return prefixe + "-" + compteurMarqueurs;
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

function segment(x0, y0, x1, y1) {
  return "M" + x0.toFixed(1) + " " + y0.toFixed(1) + "L" + x1.toFixed(1) + " " + y1.toFixed(1);
}

/** Point à l'angle mathématique a (degrés) et à la distance l de o. */
function pt(o, a, l) {
  return { x: o.x + l * Math.cos(a * DEG), y: o.y - l * Math.sin(a * DEG) };
}

/** Arc de cercle de centre o, de rayon r, de l'angle a0 à l'angle a1 (sens trigonométrique). */
function arc(o, r, a0, a1) {
  const p0 = pt(o, a0, r);
  const p1 = pt(o, a1, r);
  const grand = a1 - a0 > 180 ? 1 : 0;
  return "M" + p0.x.toFixed(1) + " " + p0.y.toFixed(1) + "A" + r + " " + r + " 0 " + grand + " 0 " + p1.x.toFixed(1) + " " + p1.y.toFixed(1);
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';

/** Croix ou point dans un petit cercle : sens d'un courant perpendiculaire à la page. */
function symboleCourant(x, y, signe, r = 8) {
  let dessin = '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '"/>';
  const d = r * 0.6;
  if (signe > 0) dessin += '<path d="M' + (x - d).toFixed(1) + " " + (y - d).toFixed(1) + "l" + 2 * d + " " + 2 * d + "M" + (x + d).toFixed(1) + " " + (y - d).toFixed(1) + "l" + -2 * d + " " + 2 * d + '"/>';
  else if (signe < 0) dessin += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (r * 0.3).toFixed(1) + '" fill="currentColor"/>';
  return dessin;
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
  if (px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
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

/** Schéma annoté inséré dans une correction, tracé progressivement. */
function schemaCorrection(moteur, conteneur, viewBox, dessin, legende) {
  const figure = document.createElement("figure");
  figure.className = "visuel-correction";
  const svg = svgEl("svg", { viewBox, role: "img", "aria-label": legende });
  svg.innerHTML = dessin;
  figure.appendChild(svg);
  const texteLegende = document.createElement("figcaption");
  texteLegende.textContent = legende;
  figure.appendChild(texteLegende);
  conteneur.appendChild(figure);
  const trace = moteur.dessiner(svg, { duree: 1.4 });
  if (trace) ressources.push(trace);
  return figure;
}

/** Lignes de texte révélées une à une, dans un cadre. */
function dessinEtapes(lignes, largeur = 560) {
  const hauteur = 30 + lignes.length * 22;
  return (
    TRAITS + ' stroke-width="1.4"><rect x="6" y="6" width="' + (largeur - 12) + '" height="' + (hauteur - 12) + '" rx="8"/></g>' +
    ECRITS + lignes.map((ligne, i) => texte(22, 32 + i * 22, ligne)).join("") + "</g>"
  );
}

/** Barres horizontales annotées : [{ nom, valeur, max, texte }]. */
function dessinBarres(barres, options = {}) {
  const x0 = options.x0 || 190;
  const l = options.l || 300;
  let traits = "";
  let pleins = "";
  let ecrits = "";
  barres.forEach((barre, i) => {
    const y = 26 + i * 40;
    const w = Math.max(1, Math.min(1.25, barre.valeur / barre.max) * l);
    pleins += '<rect x="' + x0 + '" y="' + y + '" width="' + w.toFixed(1) + '" height="18" rx="2"/>';
    traits += "M" + (x0 + l) + " " + (y - 6) + "V" + (y + 24);
    ecrits += texte(10, y + 14, barre.nom) + texte(x0 + w + 8, y + 14, barre.texte);
  });
  return (
    '<g fill="currentColor" fill-opacity="0.28" stroke="currentColor" stroke-width="1.4">' + pleins + "</g>" +
    TRAITS + ' stroke-width="1.2" stroke-dasharray="4 4"><path d="' + traits + '"/></g>' +
    ECRITS + ecrits + (options.pied ? texte(10, 26 + barres.length * 40 + 8, options.pied) : "") + "</g>"
  );
}

/** Schéma équivalent simplifié du moteur, réutilisé par l'exercice et le quiz. */
function dessinEquivalent(id) {
  return (
    "<defs>" + marqueur(id) + "</defs>" +
    TRAITS + ' stroke-width="2"><path d="M70 60H150M210 60H330V104M330 156V220H70"/><rect x="150" y="49" width="60" height="22" rx="3"/>' +
    '<circle cx="330" cy="130" r="26"/><path d="M330 116V144M320 126l10-10 10 10"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="70" cy="60" r="4.5"/><circle cx="70" cy="220" r="4.5"/></g>' +
    TRAITS + ' stroke-width="1.6"><path d="M44 210V70" marker-end="url(#' + id + ')"/><path d="M86 46H126" marker-end="url(#' + id + ')"/>' +
    '<path d="M372 180V90" stroke-dasharray="6 4" marker-end="url(#' + id + ')"/></g>' +
    ECRITS + texte(22, 144, "U") + texte(100, 40, "I") + texte(170, 40, "R") + texte(384, 140, "E") + texte(420, 70, "induit") + texte(420, 90, "en convention") + texte(420, 110, "récepteur") + "</g>"
  );
}

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeursAnimation = [];
  compteurMarqueurs = 0;

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireAnimCollecteur(racine, api);
  construireAnimForces(racine, api);
  construireSimCaracteristique(racine, api);
  construireAnimCascade(racine, api);
  construireAnimCommutation(racine, api);
  construireSimDemarrage(racine, api);
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
    ["#d-rails-figure svg", 1.4],
    ["#e-coupe-figure svg", 2],
    ["#e-equivalent-figure svg", 1.6],
    ["#e-excitations-figure svg", 1.6],
    ["#e-courbes-figure svg", 1.5],
    ["#e-quadrants-figure svg", 1.4],
    ["#f-schema-principal svg", 1.8],
    ["#h-donnees-figure svg", 1.4],
    ["#i-vanne-figure svg", 1.6],
  ];
  for (const [selecteur, duree] of schemas) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree }));
  }
}

/* --------------------------------------------------------------------------
   Corrections visuelles des questions de quiz

   Le quiz du moteur affiche une explication textuelle ; chaque question porte
   ici un repère caché, et un observateur ajoute sous l'explication un schéma
   tracé pas à pas dès que la réponse est validée.
   -------------------------------------------------------------------------- */

function repere(index) {
  return '<span hidden data-q="' + index + '"></span>';
}

function brancherVisuelsQuiz(racine, api, selecteur, visuels) {
  const bloc = racine.querySelector(selecteur);
  if (!bloc || typeof MutationObserver !== "function") return;
  const observateur = new MutationObserver(() => {
    const verdict = bloc.querySelector(".m-verdict");
    if (!verdict || verdict.dataset.visuel === "1") return;
    if (verdict.getAttribute("data-etat") === "partiel") return;
    const marque = bloc.querySelector("[data-q]");
    if (!marque) return;
    const visuel = visuels[Number(marque.getAttribute("data-q"))];
    if (!visuel) return;
    verdict.dataset.visuel = "1";
    const conteneur = document.createElement("div");
    conteneur.className = "m-visuel";
    verdict.after(conteneur);
    schemaCorrection(api, conteneur, visuel.viewBox, visuel.dessin, visuel.legende);
  });
  observateur.observe(bloc, { childList: true, subtree: true });
  nettoyeursAnimation.push(() => observateur.disconnect());
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-laplace",
      titre: "Force de Laplace sur un conducteur",
      niveau: "prérequis",
      enonce:
        "<p>Un conducteur actif de $0{,}25\\ \\mathrm{m}$, parcouru par $20\\ \\mathrm{A}$, est placé perpendiculairement à une induction de " +
        "$0{,}8\\ \\mathrm{T}$. Quelle force subit-il ?</p>",
      valeur: 0.8 * 20 * 0.25,
      unite: "N",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Force $F$",
      etapes: [
        { texte: "La force de Laplace sur un conducteur rectiligne perpendiculaire au champ vaut $F = B\\,I\\,\\ell$." },
        { texte: "$F = 0{,}8 \\times 20 \\times 0{,}25 = 4{,}0\\ \\mathrm{N}$, perpendiculaire au conducteur et au champ." },
        {
          texte: "Unités : $\\mathrm{T \\cdot A \\cdot m} = \\mathrm{(N \\cdot A^{-1} \\cdot m^{-1}) \\cdot A \\cdot m} = \\mathrm{N}$.",
          note: "Sur un induit, cette force s'exerce à quelques centimètres de l'axe : multipliée par le rayon et par le nombre de conducteurs, elle donne le couple.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const id = nouveauMarqueur("fl-c-l");
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 520 200",
          "<defs>" + marqueur(id) + "</defs>" +
            TRAITS + ' stroke-width="1.4" opacity="0.8"><path d="M60 30V170M110 30V170M210 30V170M260 30V170"/></g>' +
            TRAITS + ' stroke-width="1.6"><path d="M60 170V40M110 170V40M210 170V40M260 170V40" marker-end="url(#' + id + ')"/></g>' +
            TRAITS + ' stroke-width="2.6">' + symboleCourant(160, 100, 1, 12) + '<path d="M176 100H236" marker-end="url(#' + id + ')"/></g>' +
            ECRITS + texte(40, 194, "B = 0,8 T, vers le haut") + texte(136, 76, "I = 20 A, entrant") + texte(188, 124, "F") +
            texte(300, 60, "F = B I ℓ") + texte(300, 82, "  = 0,8 × 20 × 0,25") + texte(300, 104, "  = 4,0 N") + texte(300, 136, "perpendiculaire à B et à I") + "</g>",
          "Conducteur vu en bout, courant entrant dans la page, dans une induction verticale : la force de Laplace, flèche épaisse, est horizontale et vaut 4,0 N."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-fem",
      titre: "Force électromotrice d'un conducteur en mouvement",
      niveau: "prérequis",
      enonce:
        "<p>Le même conducteur est porté par un rotor de $0{,}20\\ \\mathrm{m}$ de diamètre qui tourne à $1500\\ \\mathrm{tr/min}$. Quelle force " +
        "électromotrice apparaît à ses bornes lorsqu'il passe sous le pôle, où $B = 0{,}8\\ \\mathrm{T}$ ?</p>",
      valeur: 0.8 * 0.25 * Math.PI * 0.2 * 25,
      unite: "V",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Force électromotrice $e$",
      etapes: [
        { texte: "Vitesse périphérique : $v = \\pi D n_s = \\pi \\times 0{,}20 \\times 1500/60 = 15{,}71\\ \\mathrm{m/s}$." },
        { texte: "Force électromotrice de mouvement : $e = B\\,\\ell\\,v = 0{,}8 \\times 0{,}25 \\times 15{,}71 = 3{,}142\\ \\mathrm{V}$." },
        {
          texte: "Unités : $\\mathrm{T \\cdot m \\cdot m/s} = \\mathrm{Wb/s} = \\mathrm{V}$.",
          note: "Une machine met des centaines de conducteurs en série pour atteindre des centaines de volts.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 540 170",
          dessinEtapes(["v = π D n / 60 = π × 0,20 × 25 = 15,71 m/s", "e = B ℓ v = 0,8 × 0,25 × 15,71", "e = 3,142 V par conducteur", "proportionnelle à B et à la vitesse"], 540),
          "Calcul révélé ligne par ligne : vitesse périphérique, puis force électromotrice d'un conducteur."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-puissance",
      titre: "Puissance transmise par un arbre",
      niveau: "prérequis",
      enonce: "<p>Un arbre transmet un couple de $100\\ \\mathrm{N \\cdot m}$ à $1500\\ \\mathrm{tr/min}$. Quelle puissance transmet-il, en kilowatts ?</p>",
      valeur: (100 * TAU * 1500) / 60 / 1000,
      unite: "kW",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Puissance $P$",
      etapes: [
        { texte: "Conversion : $\\varOmega = 2\\pi \\times 1500/60 = 157{,}08\\ \\mathrm{rad/s}$." },
        { texte: "$P = C\\,\\varOmega = 100 \\times 157{,}08 = 15\\,708\\ \\mathrm{W} = 15{,}71\\ \\mathrm{kW}$." },
        {
          texte: "Erreur classique : utiliser $1500$ au lieu de $157{,}08$ donnerait $150\\ \\mathrm{kW}$, presque dix fois trop.",
          note: "Le facteur de conversion vaut $60/(2\\pi) = 9{,}55$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 540 150",
          dessinEtapes(["Ω = 2π n / 60 = 157,08 rad/s", "P = C Ω = 100 × 157,08", "P = 15 708 W = 15,71 kW"], 540),
          "Calcul révélé ligne par ligne : conversion de la vitesse en radians par seconde, puis produit couple par vitesse."
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : spire tournante et collecteur
   -------------------------------------------------------------------------- */

/** Tension entre balais, rapportée, pour nb bobines réparties sur un pas polaire. */
function tensionBalais(theta, nb) {
  let somme = 0;
  for (let j = 0; j < nb; j += 1) somme += Math.abs(induction(theta + (j * 180) / nb));
  return somme / nb;
}

function statistiquesBalais(nb) {
  let minimum = Infinity;
  let maximum = -Infinity;
  let somme = 0;
  const n = 720;
  for (let i = 0; i < n; i += 1) {
    const u = tensionBalais((i * 360) / n, nb);
    minimum = Math.min(minimum, u);
    maximum = Math.max(maximum, u);
    somme += u;
  }
  const moyenne = somme / n;
  return { moyenne, ondulation: (100 * (maximum - minimum)) / moyenne };
}

function construireAnimCollecteur(racine, api) {
  const conteneur = racine.querySelector("#d-anim");
  if (!conteneur) return;

  const O = { x: 180, y: 190 };
  const RC = 92;
  const X0 = 400;
  const X1 = 716;
  const Y0 = 190;
  const A = 112;
  const versX = (deg) => X0 + ((X1 - X0) * deg) / 360;
  const depart = 30;
  let theta = depart;
  let nb = 1;
  let stats = statistiquesBalais(nb);

  const svg = svgEl("svg", {
    viewBox: "0 0 740 380",
    role: "img",
    "aria-label": "Machine bipolaire avec une bobine suivie, son collecteur et deux balais, et tracés de la force électromotrice de la bobine et de la tension entre balais en fonction de l'angle",
  });
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.6 });
  fond.innerHTML =
    '<rect x="125" y="22" width="110" height="38" rx="6"/><rect x="125" y="320" width="110" height="38" rx="6"/>' +
    '<circle cx="' + O.x + '" cy="' + O.y + '" r="108" stroke-dasharray="3 5" opacity="0.6"/>' +
    '<path d="M40 ' + O.y + 'H320" stroke-dasharray="2 5" opacity="0.7"/>' +
    '<path d="M' + X0 + " " + Y0 + "H" + (X1 + 6) + "M" + X0 + " " + (Y0 - A - 12) + "V" + (Y0 + A + 12) + '" stroke-width="1.1" opacity="0.6"/>';
  let graduations = "";
  for (const d of [90, 180, 270, 360]) graduations += "M" + versX(d).toFixed(1) + " " + (Y0 - 4) + "v8";
  fond.innerHTML += '<path d="' + graduations + '" stroke-width="1.1" opacity="0.6"/>';
  const balais = svgEl("g", { fill: "currentColor", stroke: "none" });
  balais.innerHTML =
    '<rect x="' + (O.x - 34 - 16) + '" y="' + (O.y - 9) + '" width="14" height="18" rx="2"/>' +
    '<rect x="' + (O.x + 36) + '" y="' + (O.y - 9) + '" width="14" height="18" rx="2"/>';
  const lames = svgEl("g", { stroke: "currentColor", "stroke-width": 1.4 });
  const autres = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.2, opacity: 0.45 });
  const bobine = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.8 });
  const courbeE = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.5 });
  const courbeU = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3.2 });
  const curseur = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, "stroke-dasharray": "3 3" });
  const points = svgEl("g", { fill: "currentColor", stroke: "none" });
  const fixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  fixes.innerHTML =
    texte(174, 46, "N") + texte(175, 344, "S") + texte(44, 182, "ligne neutre") +
    texte(O.x - 64, O.y + 30, "balai") + texte(O.x + 34, O.y + 30, "balai") +
    texte(X0, 30, "trait fin : f.é.m. de la bobine suivie") + texte(X0, 48, "trait épais : tension entre balais") +
    texte(X0 - 26, Y0 - A + 4, "+1") + texte(X0 - 26, Y0 + A + 4, "-1") + texte(X0 - 14, Y0 + 4, "0") +
    texte(versX(180) - 14, Y0 + 20, "180°") + texte(versX(360) - 16, Y0 + 20, "360°") +
    texte(X0, 352, "angle de rotation θ du côté a");
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(fond, lames, balais, autres, bobine, courbeE, courbeU, curseur, points, fixes, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-anim-valeurs", [
    { id: "angle", libelle: "Angle θ", unite: "°", decimales: 0 },
    { id: "e", libelle: "f.é.m. de la bobine suivie, rapportée", decimales: 3 },
    { id: "u", libelle: "Tension entre balais, rapportée", decimales: 3 },
    { id: "moyenne", libelle: "Valeur moyenne entre balais", decimales: 3 },
    { id: "ondulation", libelle: "Ondulation crête à crête / moyenne", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function tracerCourbes() {
    const pe = [];
    const pu = [];
    for (let i = 0; i <= 360; i += 2) {
      pe.push(versX(i).toFixed(1) + " " + (Y0 - A * induction(i)).toFixed(1));
      pu.push(versX(i).toFixed(1) + " " + (Y0 - A * tensionBalais(i, nb)).toFixed(1));
    }
    courbeE.setAttribute("d", "M" + pe.join(" L"));
    courbeU.setAttribute("d", "M" + pu.join(" L"));
  }

  function dessiner() {
    const pas = 180 / nb;
    let html = "";
    for (let j = 0; j < 2 * nb; j += 1) {
      const a0 = theta + j * pas + 2;
      const a1 = theta + (j + 1) * pas - 2;
      const plein = j === 0 || j === nb;
      const p0 = pt(O, a0, 34);
      const p1 = pt(O, a1, 34);
      const q0 = pt(O, a0, 22);
      const q1 = pt(O, a1, 22);
      const grand = a1 - a0 > 180 ? 1 : 0;
      html +=
        '<path d="M' + p0.x.toFixed(1) + " " + p0.y.toFixed(1) + "A34 34 0 " + grand + " 0 " + p1.x.toFixed(1) + " " + p1.y.toFixed(1) +
        "L" + q1.x.toFixed(1) + " " + q1.y.toFixed(1) + "A22 22 0 " + grand + " 1 " + q0.x.toFixed(1) + " " + q0.y.toFixed(1) + 'Z"' +
        (plein ? ' fill="currentColor" fill-opacity="0.55"' : ' fill="none"') + "/>";
    }
    lames.innerHTML = html;

    let html2 = "";
    for (let j = 1; j < nb; j += 1) {
      const a = theta + j * pas;
      const p = pt(O, a, RC);
      const q = pt(O, a + 180, RC);
      html2 += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="6"/><circle cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="6"/>';
    }
    autres.innerHTML = html2;

    const e = induction(theta);
    const signe = Math.abs(e) < 0.05 ? 0 : e > 0 ? 1 : -1;
    const pa = pt(O, theta, RC);
    const pb = pt(O, theta + 180, RC);
    const ra = pt(O, theta, 40);
    const rb = pt(O, theta + 180, 40);
    bobine.innerHTML =
      '<path d="' + segment(pa.x, pa.y, ra.x, ra.y) + segment(pb.x, pb.y, rb.x, rb.y) + '" stroke-dasharray="4 3"/>' +
      symboleCourant(pa.x, pa.y, signe, 10) + symboleCourant(pb.x, pb.y, -signe, 10);

    const u = tensionBalais(theta, nb);
    const x = versX(theta);
    curseur.setAttribute("d", "M" + x.toFixed(1) + " " + (Y0 - A - 8) + "V" + (Y0 + A + 8));
    points.innerHTML =
      '<circle cx="' + x.toFixed(1) + '" cy="' + (Y0 - A * e).toFixed(1) + '" r="4"/>' +
      '<rect x="' + (x - 4.5).toFixed(1) + '" y="' + (Y0 - A * u - 4.5).toFixed(1) + '" width="9" height="9"/>';
    const la = pt(O, theta, RC + 20);
    const lb = pt(O, theta + 180, RC + 20);
    libelles.innerHTML = texte(la.x - 4, la.y + 4, "a") + texte(lb.x - 4, lb.y + 4, "b");

    if (valeurs) valeurs.maj({ angle: theta, e, u, moyenne: stats.moyenne, ondulation: stats.ondulation });
  }

  let synchro = false;
  let poignee = null;
  let lecteur = null;
  function appliquer(valeur, source) {
    if (synchro) return;
    synchro = true;
    theta = ((Number(valeur) % 360) + 360) % 360;
    dessiner();
    if (source !== "poignee" && poignee) poignee.set(theta, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(theta);
    synchro = false;
  }

  const curseurs = api.sim.curseurs(
    "#d-anim-curseurs",
    [{ id: "nb", libelle: "Nombre de bobines réparties", min: 1, max: 12, pas: 1, valeur: nb, format: (v) => nombre(api, v, 0) }],
    (lues) => {
      nb = Math.round(lues.nb);
      stats = statistiquesBalais(nb);
      tracerCourbes();
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: O,
    rayon: RC,
    valeur: theta,
    pas: 2,
    libelle: "Côté a de la bobine suivie",
    diffuserAuDepart: false,
    rappel: (mesure) => appliquer(mesure.angle, "poignee"),
  });
  if (poignee) ressources.push(poignee);

  lecteur = api.sim.lecteur("#d-anim-lecteur", {
    de: 0,
    a: 360,
    duree: 8,
    boucle: true,
    auto: false,
    libelle: "Rotation du rotor sur un tour",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  tracerCourbes();
  appliquer(depart, null);
}

/* --------------------------------------------------------------------------
   E. Animation : forces sur les conducteurs et rôle du collecteur
   -------------------------------------------------------------------------- */

const NB_COND = 16;
const DECALAGE_COND = 11.25;
const ZONE_COMMUTATION = 6;

/** Distance angulaire signée à la ligne neutre la plus proche, en degrés. */
function ecartNeutre(angle) {
  const a = ((angle % 180) + 180) % 180;
  return a < 90 ? a : a - 180;
}

function courantConducteur(angle, avecCollecteur, signeFixe) {
  if (!avecCollecteur) return signeFixe;
  const ecart = ecartNeutre(angle);
  const sousNord = Math.sin(angle * DEG) > 0;
  if (Math.abs(ecart) < ZONE_COMMUTATION) {
    /* inversion linéaire dans la zone de commutation */
    const s = ecart / ZONE_COMMUTATION;
    return (sousNord ? 1 : -1) * Math.abs(s);
  }
  return sousNord ? 1 : -1;
}

function coupleTotal(theta, avecCollecteur) {
  let somme = 0;
  for (let j = 0; j < NB_COND; j += 1) {
    const a0 = DECALAGE_COND + j * (360 / NB_COND);
    const signeFixe = Math.sin(a0 * DEG) > 0 ? 1 : -1;
    const a = theta + a0;
    somme += courantConducteur(a, avecCollecteur, signeFixe) * induction(a);
  }
  return somme;
}

function construireAnimForces(racine, api) {
  const conteneur = racine.querySelector("#e-forces");
  if (!conteneur) return;

  let reference = 0;
  for (let i = 0; i < 360; i += 1) reference += coupleTotal(i, true);
  reference /= 360;

  const O = { x: 180, y: 180 };
  const RC = 94;
  const X0 = 400;
  const X1 = 716;
  const Y0 = 180;
  const A = 90;
  const versX = (deg) => X0 + ((X1 - X0) * deg) / 360;
  let theta = 0;
  let avec = 1;

  const svg = svgEl("svg", {
    viewBox: "0 0 740 370",
    role: "img",
    "aria-label": "Rotor à seize conducteurs entre deux pôles, avec le sens du courant et la force de chaque conducteur, et tracé du couple total en fonction de l'angle avec et sans collecteur",
  });
  const idm = nouveauMarqueur("fl-e-fo");
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(idm);
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.6 });
  let zones = "";
  for (const base of [0, 180]) {
    for (const s of [-ZONE_COMMUTATION, ZONE_COMMUTATION]) {
      const p = pt(O, base + s, 106);
      const q = pt(O, base + s, 118);
      zones += segment(p.x, p.y, q.x, q.y);
    }
  }
  fond.innerHTML =
    '<rect x="125" y="14" width="110" height="34" rx="6"/><rect x="125" y="312" width="110" height="34" rx="6"/>' +
    '<circle cx="' + O.x + '" cy="' + O.y + '" r="110" opacity="0.6"/>' +
    '<path d="M36 ' + O.y + 'H324" stroke-dasharray="2 5" opacity="0.7"/>' +
    '<path d="' + zones + '" stroke-width="2"/>' +
    '<path d="M' + X0 + " " + Y0 + "H" + (X1 + 6) + "M" + X0 + " " + (Y0 - A - 30) + "V" + (Y0 + A + 30) + '" stroke-width="1.1" opacity="0.6"/>';
  const courbeAutre = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.3 });
  const courbeMode = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3.2 });
  const conducteurs = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.5 });
  const forces = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round" });
  const curseur = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, "stroke-dasharray": "3 3" });
  const point = svgEl("circle", { r: 4.5, fill: "currentColor", stroke: "none" });
  const fixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  fixes.innerHTML =
    texte(174, 36, "N") + texte(175, 334, "S") + texte(138, 172, "ligne neutre") +
    texte(X0, 24, "couple total rapporté au couple moyen") + texte(X0, 42, "épais : mode choisi ; fin : autre mode") +
    texte(X0 - 26, Y0 - A + 4, "+1") + texte(X0 - 26, Y0 + A + 4, "-1") + texte(X0 - 14, Y0 + 4, "0") +
    texte(versX(180) - 14, Y0 + A + 24, "180°") + texte(versX(360) - 16, Y0 + A + 24, "360°") +
    texte(X0, 362, "angle de rotation du rotor");
  const etat = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, courbeAutre, courbeMode, conducteurs, forces, curseur, point, fixes, etat);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-forces-valeurs", [
    { id: "angle", libelle: "Angle du rotor", unite: "°", decimales: 0 },
    { id: "courant", libelle: "Courant du conducteur suivi", format: (v) => v },
    { id: "force", libelle: "Force du conducteur suivi, rapportée", decimales: 2 },
    { id: "couple", libelle: "Couple total rapporté", decimales: 3 },
    { id: "moyen", libelle: "Couple moyen sur un tour", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function chemin(mode) {
    const p = [];
    for (let i = 0; i <= 360; i += 2) p.push(versX(i).toFixed(1) + " " + (Y0 - (A * coupleTotal(i, mode)) / reference).toFixed(1));
    return "M" + p.join(" L");
  }

  function tracerCourbes() {
    courbeMode.setAttribute("d", chemin(avec === 1));
    courbeAutre.setAttribute("d", chemin(avec !== 1));
  }

  function dessiner() {
    let htmlC = "";
    let htmlF = "";
    let suivi = null;
    for (let j = 0; j < NB_COND; j += 1) {
      const a0 = DECALAGE_COND + j * (360 / NB_COND);
      const signeFixe = Math.sin(a0 * DEG) > 0 ? 1 : -1;
      const a = theta + a0;
      const i = courantConducteur(a, avec === 1, signeFixe);
      const f = i * induction(a);
      const p = pt(O, a, RC);
      const signe = Math.abs(i) < 0.15 ? 0 : i > 0 ? 1 : -1;
      htmlC += symboleCourant(p.x, p.y, signe, 7);
      if (j === 0) {
        htmlC += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="12"/>';
        suivi = { i, f, a };
      }
      if (Math.abs(f) > 0.04) {
        const l = 30 * Math.abs(f);
        const dir = f > 0 ? 1 : -1;
        const t = { x: -Math.sin(a * DEG) * dir, y: -Math.cos(a * DEG) * dir };
        const d0 = { x: p.x + t.x * 9, y: p.y + t.y * 9 };
        const d1 = { x: p.x + t.x * (9 + l), y: p.y + t.y * (9 + l) };
        htmlF += '<path d="' + segment(d0.x, d0.y, d1.x, d1.y) + '" marker-end="url(#' + idm + ')"/>';
      }
    }
    conducteurs.innerHTML = htmlC;
    forces.innerHTML = htmlF;

    const c = coupleTotal(theta, avec === 1) / reference;
    const x = versX(theta);
    curseur.setAttribute("d", "M" + x.toFixed(1) + " " + (Y0 - A - 20) + "V" + (Y0 + A + 20));
    point.setAttribute("cx", x.toFixed(1));
    point.setAttribute("cy", (Y0 - A * c).toFixed(1));
    etat.innerHTML = texte(20, 368, avec === 1 ? "mode : avec collecteur" : "mode : sans collecteur, courants figés");

    let moyen = 0;
    for (let k = 0; k < 360; k += 1) moyen += coupleTotal(k, avec === 1);
    moyen /= 360 * reference;
    let libelleCourant = "en commutation";
    if (Math.abs(suivi.i) >= 0.999) libelleCourant = suivi.i > 0 ? "entrant, + I/2a" : "sortant, - I/2a";
    if (valeurs) valeurs.maj({ angle: theta, courant: libelleCourant, force: suivi.f, couple: c, moyen });
  }

  let synchro = false;
  let poignee = null;
  let lecteur = null;
  function appliquer(valeur, source) {
    if (synchro) return;
    synchro = true;
    theta = ((Number(valeur) % 360) + 360) % 360;
    dessiner();
    if (source !== "poignee" && poignee) poignee.set(theta + DECALAGE_COND, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(theta);
    synchro = false;
  }

  const curseurs = api.sim.curseurs(
    "#e-forces-curseurs",
    [{ id: "mode", libelle: "Collecteur", min: 0, max: 1, pas: 1, valeur: avec, format: (v) => (v >= 0.5 ? "présent" : "absent, courants figés") }],
    (lues) => {
      avec = lues.mode >= 0.5 ? 1 : 0;
      tracerCourbes();
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: O,
    rayon: RC,
    valeur: theta + DECALAGE_COND,
    pas: 2,
    libelle: "Conducteur suivi",
    diffuserAuDepart: false,
    rappel: (mesure) => appliquer(mesure.angle - DECALAGE_COND, "poignee"),
  });
  if (poignee) ressources.push(poignee);

  lecteur = api.sim.lecteur("#e-forces-lecteur", {
    de: 0,
    a: 360,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Rotation du rotor sur un tour",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  tracerCourbes();
  appliquer(theta, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : caractéristique mécanique et point de fonctionnement
   -------------------------------------------------------------------------- */

function kSerie(courant) {
  const x = courant / MH.In;
  return (SERIE.kn * 1.6 * x) / (1 + 0.6 * x);
}

/** Vitesse en tr/min et courant pour un couple électromagnétique donné. */
function pointSeparee(couple, p) {
  const kp = (MH.k * p.flux) / 100;
  const courant = couple / kp;
  const E = p.U - (MH.R + p.Radd) * courant - MH.dUb * Math.sign(courant);
  return { n: (E / kp) * VERS_TRMIN, I: courant, E };
}

function pointSerie(couple, p) {
  if (couple <= 0.2) return { n: NaN, I: NaN, E: NaN };
  let bas = 0;
  let haut = 3000;
  for (let k = 0; k < 60; k += 1) {
    const milieu = (bas + haut) / 2;
    if (kSerie(milieu) * milieu < couple) bas = milieu;
    else haut = milieu;
  }
  const courant = (bas + haut) / 2;
  const E = p.U - (SERIE.Rt + p.Radd) * courant - MH.dUb;
  return { n: (E / kSerie(courant)) * VERS_TRMIN, I: courant, E };
}

function pointMode(couple, p, serie) {
  return serie ? pointSerie(couple, p) : pointSeparee(couple, p);
}

function coupleCharge(n, p) {
  return p.charge >= 0.5 ? p.Cr * Math.pow(n / 1500, 2) : p.Cr;
}

function pointFonctionnement(p) {
  const serie = p.mode >= 0.5;
  if (p.charge < 0.5) {
    const r = pointMode(p.Cr, p, serie);
    return Number.isFinite(r.n) ? { ...r, C: p.Cr } : null;
  }
  const g = (n) => {
    const r = pointMode(coupleCharge(n, p), p, serie);
    return (Number.isFinite(r.n) ? r.n : 1e9) - n;
  };
  if (g(0) <= 0) return null;
  let bas = 0;
  let haut = 6000;
  if (g(haut) > 0) return null;
  for (let k = 0; k < 60; k += 1) {
    const milieu = (bas + haut) / 2;
    if (g(milieu) > 0) bas = milieu;
    else haut = milieu;
  }
  const n = (bas + haut) / 2;
  const C = coupleCharge(n, p);
  return { ...pointMode(C, p, serie), C };
}

function construireSimCaracteristique(racine, api) {
  const p = { U: 440, flux: 100, Radd: 0, mode: 0, charge: 0, Cr: 138 };
  let point = null;

  const trace = api.sim.traceur("#e-carac-trace", {
    titre: "Vitesse en fonction du couple électromagnétique",
    xTitre: "couple C_em",
    xUnite: "N·m",
    yTitre: "vitesse n",
    yUnite: "tr/min",
    xMin: -150,
    xMax: 300,
    yMin: 0,
    yMax: 3200,
    echantillons: 500,
    series: [
      { id: "moteur", nom: "moteur choisi", couleur: "serie-1", epaisseur: 3 },
      { id: "autre", nom: "autre excitation, pour comparaison", couleur: "serie-6", epaisseur: 1.6 },
      { id: "charge", nom: "couple résistant de la charge", couleur: "serie-5", epaisseur: 2.2 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, MH.Cn, "couple nominal");
      if (p.charge < 0.5) {
        const x = repere.versX(p.Cr);
        if (x >= repere.boite.x && x <= repere.boite.x + repere.boite.l) {
          c.save();
          c.strokeStyle = couleurs.series[4];
          c.lineWidth = 2.2;
          c.beginPath();
          c.moveTo(x, repere.boite.y);
          c.lineTo(x, repere.boite.y + repere.boite.h);
          c.stroke();
          c.restore();
        }
      }
      if (point) pointTrace(c, repere, couleurs, point.C, point.n, "point de fonctionnement");
    },
  });
  if (trace) ressources.push(trace);

  const avecUnite = (decimales, unite) => (v) => (Number.isFinite(v) ? nombre(api, v, decimales) + " " + unite : "sans objet");
  const valeurs = api.sim.valeurs("#e-carac-valeurs", [
    { id: "n", libelle: "Vitesse", format: avecUnite(0, "tr/min") },
    { id: "I", libelle: "Courant d'induit", format: avecUnite(1, "A") },
    { id: "IIn", libelle: "Courant / courant nominal", format: avecUnite(0, "%") },
    { id: "C", libelle: "Couple électromagnétique", format: avecUnite(1, "N·m") },
    { id: "P", libelle: "Puissance électromagnétique E I", format: avecUnite(2, "kW") },
    { id: "regime", libelle: "Fonctionnement", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    const serie = p.mode >= 0.5;
    if (trace) {
      trace.definirFonction("moteur", (C) => pointMode(C, p, serie).n);
      trace.definirFonction("autre", (C) => pointMode(C, { ...p, flux: 100 }, !serie).n);
      trace.definirFonction("charge", (C) => {
        if (p.charge < 0.5 || Math.abs(p.Cr) < 1e-6) return NaN;
        const r = C / p.Cr;
        return r >= 0 ? 1500 * Math.sqrt(r) : NaN;
      });
    }
    point = pointFonctionnement(p);
    if (trace) trace.rafraichir();
    if (!valeurs) return;
    if (!point) {
      valeurs.maj({ n: NaN, I: NaN, IIn: NaN, C: NaN, P: NaN, regime: serie ? "pas de point : le moteur série s'emballe" : "pas de point de fonctionnement" });
      return;
    }
    let regime = point.I >= 0 ? "moteur" : "génératrice, énergie renvoyée";
    if (Math.abs(point.I) > 1.2 * MH.In) regime += ", surcharge";
    valeurs.maj({
      n: point.n,
      I: point.I,
      IIn: (100 * point.I) / MH.In,
      C: point.C,
      P: (point.E * point.I) / 1000,
      regime,
    });
  }

  const curseurs = api.sim.curseurs(
    "#e-carac-curseurs",
    [
      { id: "U", libelle: "Tension d'induit U", min: 100, max: 480, pas: 5, valeur: p.U, format: (v) => nombre(api, v, 0) + " V" },
      { id: "flux", libelle: "Flux, excitation séparée", min: 50, max: 110, pas: 1, valeur: p.flux, format: (v) => nombre(api, v, 0) + " % du nominal" },
      { id: "Radd", libelle: "Résistance additionnelle", min: 0, max: 4, pas: 0.05, valeur: p.Radd, format: (v) => nombre(api, v, 2) + " Ω" },
      { id: "mode", libelle: "Mode d'excitation", min: 0, max: 1, pas: 1, valeur: p.mode, format: (v) => (v >= 0.5 ? "série" : "séparée") },
      { id: "charge", libelle: "Type de charge", min: 0, max: 1, pas: 1, valeur: p.charge, format: (v) => (v >= 0.5 ? "pompe, couple en n²" : "couple constant") },
      { id: "Cr", libelle: "Couple résistant à 1500 tr/min", min: -150, max: 280, pas: 1, valeur: p.Cr, format: (v) => nombre(api, v, 0) + " N·m" },
    ],
    (lues) => {
      Object.assign(p, lues);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   E. Animation : la cascade des puissances
   -------------------------------------------------------------------------- */

function bilanMoteur(U, courant) {
  const E = U - MH.R * courant - MH.dUb;
  const W = E / MH.k;
  const pc = (MH.pc * W) / MH.Wn;
  const pexc = MH.Ue * MH.Ie;
  const pJ = MH.R * courant * courant;
  const pb = MH.dUb * courant;
  const Pabs = U * courant + pexc;
  const Pem = E * courant;
  const Pu = Pem - pc;
  return { E, W, pc, pexc, pJ, pb, Pabs, Pem, Pu, eta: Pu / Pabs, Cu: Pu / W };
}

function construireAnimCascade(racine, api) {
  const conteneur = racine.querySelector("#e-cascade");
  if (!conteneur) return;
  const etat = { I: MH.In, U: MH.U };
  const BASE = 268;
  const HAUT = 46;
  const PMAX = 36000;
  const echelle = (P) => ((BASE - HAUT) * P) / PMAX;
  const largeur = 62;
  const xCol = (k) => 46 + k * 98;
  const noms = [
    ["puissance", "absorbée"],
    ["excitation", "U_e I_e"],
    ["Joule", "induit R I²"],
    ["balais", "ΔU_b I"],
    ["puissance", "électromag."],
    ["pertes", "collectives"],
    ["puissance", "utile"],
  ];

  const svg = svgEl("svg", {
    viewBox: "0 0 740 320",
    role: "img",
    "aria-label": "Diagramme en cascade des puissances du moteur : puissance absorbée, pertes d'excitation, de Joule dans l'induit, de balais, puissance électromagnétique, pertes collectives et puissance utile",
  });
  const idh = nouveauMarqueur("hachure");
  const defs = svgEl("defs");
  defs.innerHTML =
    '<pattern id="' + idh + '" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">' +
    '<path d="M0 0V6" stroke="currentColor" stroke-width="1.6"/></pattern>';
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.4 });
  fond.innerHTML = '<path d="M30 ' + BASE + 'H724"/>';
  const reference = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.2, "stroke-dasharray": "7 5", opacity: 0.8 });
  const barres = svgEl("g", { stroke: "currentColor", "stroke-width": 1.4 });
  const liens = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1, "stroke-dasharray": "3 3", opacity: 0.8 });
  const ecrits = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  const fixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  let htmlNoms = "";
  noms.forEach((nom, k) => {
    htmlNoms += texte(xCol(k), BASE + 18, nom[0]) + texte(xCol(k), BASE + 34, nom[1]);
  });
  fixes.innerHTML = htmlNoms;
  svg.append(defs, fond, reference, barres, liens, ecrits, fixes);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-cascade-valeurs", [
    { id: "eta", libelle: "Rendement", unite: "%", decimales: 2 },
    { id: "n", libelle: "Vitesse", unite: "tr/min", decimales: 0 },
    { id: "Cu", libelle: "Couple utile", unite: "N·m", decimales: 1 },
    { id: "pertes", libelle: "Pertes totales", unite: "W", decimales: 0 },
    { id: "iopt", libelle: "Courant du rendement maximal, R I² = P0", unite: "A", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const formatP = (P) => (Math.abs(P) >= 1000 ? nombre(api, P / 1000, 2) + " kW" : nombre(api, P, 0) + " W");

  function dessiner() {
    const b = bilanMoteur(etat.U, etat.I);
    const L0 = b.Pabs;
    const L1 = L0 - b.pexc;
    const L2 = L1 - b.pJ;
    const L3 = L2 - b.pb;
    const L4 = b.Pu;
    const colonnes = [
      { de: 0, a: L0, plein: true, v: b.Pabs },
      { de: L1, a: L0, plein: false, v: b.pexc },
      { de: L2, a: L1, plein: false, v: b.pJ },
      { de: L3, a: L2, plein: false, v: b.pb },
      { de: 0, a: L3, plein: true, v: b.Pem },
      { de: L4, a: L3, plein: false, v: b.pc },
      { de: 0, a: L4, plein: true, v: b.Pu },
    ];
    let htmlB = "";
    let htmlL = "";
    let htmlE = "";
    colonnes.forEach((col, k) => {
      const yHaut = BASE - echelle(col.a);
      const h = Math.max(1.5, echelle(col.a - col.de));
      htmlB +=
        '<rect x="' + xCol(k) + '" y="' + yHaut.toFixed(1) + '" width="' + largeur + '" height="' + h.toFixed(1) + '"' +
        (col.plein ? ' fill="currentColor" fill-opacity="0.3"' : ' fill="url(#' + idh + ')"') + "/>";
      htmlE += texte(xCol(k), yHaut - 8, formatP(col.v));
      if (k < colonnes.length - 1) {
        const suivant = colonnes[k + 1];
        const niveau = col.plein ? col.a : col.de;
        const yN = BASE - echelle(niveau);
        if (Math.abs(niveau - suivant.a) < 1) htmlL += segment(xCol(k) + largeur, yN, xCol(k + 1), yN);
      }
    });
    barres.innerHTML = htmlB;
    liens.innerHTML = htmlL;
    const yRef = BASE - echelle(21094.4);
    reference.setAttribute("d", "M30 " + yRef.toFixed(1) + "H724");
    ecrits.innerHTML = htmlE + texte(118, yRef + 16, "P_u nominale, 21,09 kW");
    if (valeurs) {
      valeurs.maj({
        eta: 100 * b.eta,
        n: b.W * VERS_TRMIN,
        Cu: b.Cu,
        pertes: b.Pabs - b.Pu,
        iopt: Math.sqrt((b.pc + b.pexc) / MH.R),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-cascade-curseurs",
    [
      { id: "I", libelle: "Courant d'induit I", min: 2, max: 80, pas: 1, valeur: etat.I, format: (v) => nombre(api, v, 0) + " A" },
      { id: "U", libelle: "Tension d'induit U", min: 100, max: 440, pas: 5, valeur: etat.U, format: (v) => nombre(api, v, 0) + " V" },
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
   E. Animation : le courant d'une section pendant la commutation
   -------------------------------------------------------------------------- */

function commutation(tau, k, beta) {
  const delta = (1 - k) * beta;
  const t = Math.min(0.999, Math.max(0.001, tau));
  const i = 1 - 2 * t + delta * Math.sin(Math.PI * t);
  const sortie = 1 + (delta * Math.sin(Math.PI * t)) / (2 * (1 - t));
  const entree = 1 - (delta * Math.sin(Math.PI * t)) / (2 * t);
  return { i, sortie, entree, delta };
}

function construireAnimCommutation(racine, api) {
  const conteneur = racine.querySelector("#e-commut");
  if (!conteneur) return;
  const etat = { k: 0, beta: 0.6 };
  const depart = 0.35;
  let tau = depart;

  const PX0 = 50;
  const PX1 = 340;
  const PY = 292;
  const PA = 78;
  const versXp = (t) => PX0 + (PX1 - PX0) * t;
  const BB = 386;
  const BU = 80;

  const svg = svgEl("svg", {
    viewBox: "0 0 740 420",
    role: "img",
    "aria-label": "Balai recouvrant deux lames du collecteur pendant la commutation, courant de la section commutée en fonction de l'avancement, et densités de courant aux bords d'entrée et de sortie du balai",
  });
  const idm = nouveauMarqueur("fl-e-cm");
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(idm);
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.4 });
  fond.innerHTML =
    '<rect x="330" y="30" width="80" height="44" rx="3" fill="currentColor" fill-opacity="0.2"/>' +
    '<path d="M370 30V10" marker-end="url(#' + idm + ')"/>' +
    '<path d="M' + PX0 + " " + PY + "H" + (PX1 + 6) + "M" + PX0 + " " + (PY - PA - 10) + "V" + (PY + PA + 10) + '" stroke-width="1.1" opacity="0.6"/>' +
    '<path d="M' + versXp(0) + " " + (PY - PA) + "L" + versXp(1) + " " + (PY + PA) + '" stroke-width="1.4"/>' +
    '<path d="M450 ' + BB + 'H720"/>' +
    '<path d="M450 ' + (BB - 1.5 * BU) + 'H720" stroke-dasharray="7 5"/>' +
    '<path d="M450 ' + (BB - BU) + 'H720" stroke-dasharray="2 4" opacity="0.8"/>';
  const lames = svgEl("g", { stroke: "currentColor", "stroke-width": 1.4 });
  const section = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.6 });
  const courbe = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3.2 });
  const point = svgEl("circle", { r: 4.5, fill: "currentColor", stroke: "none" });
  const barres = svgEl("g", { fill: "currentColor", "fill-opacity": 0.3, stroke: "currentColor", "stroke-width": 1.4 });
  const fixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  fixes.innerHTML =
    texte(378, 16, "2 I/2a vers la borne") + texte(338, 56, "balai") +
    texte(560, 96, "défilement des lames") +
    texte(PX0, PY - PA - 16, "i / (I/2a), section commutée") + texte(PX1 - 70, PY + PA + 26, "avancement t / t_c") +
    texte(PX0 - 24, PY - PA + 4, "+1") + texte(PX0 - 24, PY + PA + 4, "-1") + texte(PX0 - 14, PY + 4, "0") +
    texte(560, BB + 18, "entrée") + texte(650, BB + 18, "sortie") +
    texte(452, BB - 1.5 * BU - 6, "seuil 1,5") + texte(452, BB - BU - 6, "moyenne 1") +
    texte(450, 212, "densité de courant aux bords du balai");
  const vivants = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, lames, section, courbe, point, barres, fixes, vivants);
  conteneur.appendChild(svg);
  const fleche = svgEl("path", { d: "M560 106H650", fill: "none", stroke: "currentColor", "stroke-width": 1.4, "marker-end": "url(#" + idm + ")" });
  svg.appendChild(fleche);

  const valeurs = api.sim.valeurs("#e-commut-valeurs", [
    { id: "tau", libelle: "Avancement t / t_c", decimales: 2 },
    { id: "i", libelle: "Courant de la section / (I/2a)", decimales: 3 },
    { id: "entree", libelle: "Densité au bord d'entrée", decimales: 2 },
    { id: "sortie", libelle: "Densité au bord de sortie", decimales: 2 },
    { id: "max", libelle: "Densité maximale sur la commutation", decimales: 2 },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function tracerCourbe() {
    const p = [];
    for (let s = 0; s <= 100; s += 1) {
      const t = s / 100;
      const r = commutation(t, etat.k, etat.beta);
      p.push(versXp(t).toFixed(1) + " " + (PY - PA * r.i).toFixed(1));
    }
    courbe.setAttribute("d", "M" + p.join(" L"));
  }

  function dessiner() {
    const r = commutation(tau, etat.k, etat.beta);
    let html = "";
    for (let k = 0; k <= 3; k += 1) {
      const gauche = 170 + 80 * k + 80 * tau;
      const x0 = Math.max(150, gauche);
      const x1 = Math.min(590, gauche + 74);
      if (x1 <= x0 + 1) continue;
      const active = k === 1 || k === 2;
      html += '<rect x="' + x0.toFixed(1) + '" y="80" width="' + (x1 - x0).toFixed(1) + '" height="22" rx="2"' + (active ? ' fill="currentColor" fill-opacity="0.5"' : ' fill="none"') + "/>";
    }
    lames.innerHTML = html;

    const xA = 287 + 80 * tau;
    const xL = 367 + 80 * tau;
    let bobine = "M" + xA.toFixed(1) + " 102V140H" + (xA + 16).toFixed(1);
    for (let s = 0; s < 4; s += 1) bobine += "a6 6 0 0 1 12 0";
    bobine += "H" + xL.toFixed(1) + "V102";
    const sens = r.i >= 0 ? 1 : -1;
    const milieu = (xA + xL) / 2;
    section.innerHTML =
      '<path d="' + bobine + '"/>' +
      (Math.abs(r.i) > 0.04 ? '<path d="' + segment(milieu - 18 * sens, 156, milieu + 18 * sens, 156) + '" marker-end="url(#' + idm + ')"/>' : "");

    point.setAttribute("cx", versXp(tau).toFixed(1));
    point.setAttribute("cy", (PY - PA * r.i).toFixed(1));

    const hIn = Math.max(0, Math.min(2.2, r.entree)) * BU;
    const hOut = Math.max(0, Math.min(2.2, r.sortie)) * BU;
    barres.innerHTML =
      '<rect x="560" y="' + (BB - hIn).toFixed(1) + '" width="50" height="' + hIn.toFixed(1) + '"/>' +
      '<rect x="650" y="' + (BB - hOut).toFixed(1) + '" width="50" height="' + hOut.toFixed(1) + '"/>';

    const courantSortie = 1 + r.i;
    const courantEntree = 1 - r.i;
    vivants.innerHTML =
      texte(150, 26, "entrée : " + nombre(api, courantEntree, 2) + " I/2a") +
      texte(500, 26, "sortie : " + nombre(api, courantSortie, 2) + " I/2a") +
      texte(milieu - 36, 178, "i = " + nombre(api, r.i, 2) + " I/2a");

    let max = 0;
    let ou = "";
    for (let s = 0; s <= 200; s += 1) {
      const q = commutation(s / 200, etat.k, etat.beta);
      if (q.sortie > max) {
        max = q.sortie;
        ou = "de sortie";
      }
      if (q.entree > max) {
        max = q.entree;
        ou = "d'entrée";
      }
    }
    let verdict = "commutation correcte";
    if (max > 1.5) verdict = "risque d'étincelles au bord " + ou;
    else if (max > 1.2) verdict = "acceptable, densité inégale au bord " + ou;
    if (valeurs) valeurs.maj({ tau, i: r.i, entree: r.entree, sortie: r.sortie, max, verdict });
  }

  let synchro = false;
  let poignee = null;
  let lecteur = null;
  function appliquer(valeur, source) {
    if (synchro) return;
    synchro = true;
    tau = Math.min(1, Math.max(0, Number(valeur)));
    dessiner();
    if (source !== "poignee" && poignee) poignee.set(tau, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(tau);
    synchro = false;
  }

  const curseurs = api.sim.curseurs(
    "#e-commut-curseurs",
    [
      { id: "k", libelle: "Compensation par les pôles de commutation", min: 0, max: 1.6, pas: 0.05, valeur: etat.k, format: (v) => nombre(api, v, 2) },
      { id: "beta", libelle: "Réactance relative de la section", min: 0, max: 0.6, pas: 0.05, valeur: etat.beta, format: (v) => nombre(api, v, 2) },
    ],
    (lues) => {
      Object.assign(etat, lues);
      tracerCourbe();
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: PX0, y: PY + PA + 8 },
    a: { x: PX1, y: PY + PA + 8 },
    min: 0,
    max: 1,
    pas: 0.01,
    valeur: tau,
    libelle: "Avancement de la commutation",
    diffuserAuDepart: false,
    rappel: (mesure) => appliquer(mesure.valeur, "poignee"),
  });
  if (poignee) ressources.push(poignee);

  lecteur = api.sim.lecteur("#e-commut-lecteur", {
    de: 0,
    a: 1,
    duree: 4,
    boucle: true,
    auto: false,
    libelle: "Déroulement de la commutation",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  tracerCourbe();
  appliquer(depart, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : démarrage et réponse dynamique
   -------------------------------------------------------------------------- */

function simulerDemarrage(p) {
  const k = MH.k;
  const L = MH.L;
  const tauE = L / (MH.R + p.Rd);
  const tauM = ((MH.R + p.Rd) * p.J) / (k * k);
  const jamais = p.tcc >= 2.999;
  let T = Math.max(0.4, 6 * Math.max(tauE, tauM), p.rampe + 1, jamais ? 0 : p.tcc + 0.8);
  T = Math.min(4.5, T);
  const dt = 1e-4;
  const pas = Math.round(T / dt);
  const f = (t, i, W) => {
    const R = MH.R + (!jamais && t >= p.tcc ? 0 : p.Rd);
    const u = p.rampe > 0 ? MH.U * Math.min(1, t / p.rampe) : MH.U;
    const di = (u - R * i - k * W) / L;
    const Ce = k * i;
    const dW = W <= 0 && Ce <= p.Cr ? 0 : (Ce - p.Cr) / p.J;
    return [di, dW];
  };
  let i = 0;
  let W = 0;
  const courant = [[0, 0]];
  const vitesse = [[0, 0]];
  const tous = [];
  const sautTrace = Math.max(1, Math.round(pas / 700));
  let pic = { v: 0, t: 0 };
  let pic2 = -Infinity;
  for (let s = 0; s < pas; s += 1) {
    const t = s * dt;
    const k1 = f(t, i, W);
    const k2 = f(t + dt / 2, i + (dt / 2) * k1[0], W + (dt / 2) * k1[1]);
    const k3 = f(t + dt / 2, i + (dt / 2) * k2[0], W + (dt / 2) * k2[1]);
    const k4 = f(t + dt, i + dt * k3[0], W + dt * k3[1]);
    i += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    W += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    if (W < 0) W = 0;
    const tn = t + dt;
    if (i > pic.v) pic = { v: i, t: tn };
    if (!jamais && tn >= p.tcc && i > pic2) pic2 = i;
    tous.push([tn, W * VERS_TRMIN]);
    if (s % sautTrace === 0 || s === pas - 1) {
      courant.push([tn, i]);
      vitesse.push([tn, W * VERS_TRMIN]);
    }
  }
  const nFin = W * VERS_TRMIN;
  let nMax = 0;
  let t95 = NaN;
  for (const [t, n] of tous) {
    if (n > nMax) nMax = n;
    if (Number.isNaN(t95) && nFin > 1 && n >= 0.95 * nFin) t95 = t;
  }
  let iMin = 0;
  for (const [, v] of courant) iMin = Math.min(iMin, v);
  return { T, courant, vitesse, pic, pic2: jamais ? NaN : pic2, nFin, nMax, t95, tauE, tauM, zeta: 0.5 * Math.sqrt(tauM / tauE), iMin, jamais };
}

function construireSimDemarrage(racine, api) {
  const p = { Rd: 0, tcc: 3, rampe: 0, J: 0.35, Cr: 0 };
  let r = null;

  const traceI = api.sim.traceur("#e-dyn-courant", {
    titre: "Courant d'induit pendant le démarrage",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "courant",
    yUnite: "A",
    xMin: 0,
    xMax: 0.4,
    yMin: -150,
    yMax: 600,
    ratio: 0.38,
    series: [{ id: "i", nom: "courant d'induit i(t)", couleur: "serie-1", epaisseur: 2.4 }],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 2 * MH.In, "2 I_n = 104 A", false);
      if (r && !r.jamais) ligneV(c, repere, couleurs, p.tcc, "court-circuit du rhéostat", [2, 3]);
    },
  });
  if (traceI) ressources.push(traceI);

  const traceN = api.sim.traceur("#e-dyn-vitesse", {
    titre: "Vitesse pendant le démarrage",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "vitesse",
    yUnite: "tr/min",
    xMin: 0,
    xMax: 0.4,
    yMin: 0,
    yMax: 2200,
    ratio: 0.38,
    series: [{ id: "n", nom: "vitesse n(t)", couleur: "serie-3", epaisseur: 2.4 }],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, MH.nn, "vitesse nominale", true);
      if (r && !r.jamais) ligneV(c, repere, couleurs, p.tcc, "", [2, 3]);
    },
  });
  if (traceN) ressources.push(traceN);

  const valeurs = api.sim.valeurs("#e-dyn-valeurs", [
    { id: "pic", libelle: "Pointe de courant", unite: "A", decimales: 1 },
    { id: "picIn", libelle: "Pointe / I_n", decimales: 2 },
    { id: "tpic", libelle: "Instant de la pointe", unite: "ms", decimales: 1 },
    { id: "pic2", libelle: "Pointe après court-circuit du rhéostat", format: (v) => (Number.isFinite(v) ? nombre(api, v, 1) + " A" : "sans objet") },
    { id: "nFin", libelle: "Vitesse finale", unite: "tr/min", decimales: 0 },
    { id: "depassement", libelle: "Dépassement de vitesse", format: (v) => (Number.isFinite(v) ? nombre(api, v, 1) + " %" : "sans objet") },
    { id: "t95", libelle: "Temps pour 95 % de la vitesse finale", format: (v) => (Number.isFinite(v) ? nombre(api, v, 3) + " s" : "sans objet") },
    { id: "tauE", libelle: "τe = L / R", unite: "ms", decimales: 2 },
    { id: "tauM", libelle: "τm = R J / (KΦ)²", unite: "ms", decimales: 1 },
    { id: "zeta", libelle: "Amortissement ζ", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    r = simulerDemarrage(p);
    let iMax = -Infinity;
    for (const [, v] of r.courant) iMax = Math.max(iMax, v);
    if (traceI) {
      traceI.definirDonnees("i", r.courant);
      traceI.definirPlage({ xMin: 0, xMax: r.T, yMin: Math.min(-20, r.iMin * 1.15), yMax: Math.max(130, iMax * 1.1) });
    }
    if (traceN) {
      traceN.definirDonnees("n", r.vitesse);
      traceN.definirPlage({ xMin: 0, xMax: r.T, yMin: 0, yMax: Math.max(1800, r.nMax * 1.1) });
    }
    if (valeurs) {
      valeurs.maj({
        pic: r.pic.v,
        picIn: r.pic.v / MH.In,
        tpic: 1000 * r.pic.t,
        pic2: r.pic2,
        nFin: r.nFin,
        depassement: r.nFin > 1 ? (100 * (r.nMax - r.nFin)) / r.nFin : NaN,
        t95: r.t95,
        tauE: 1000 * r.tauE,
        tauM: 1000 * r.tauM,
        zeta: r.zeta,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-dyn-curseurs",
    [
      { id: "Rd", libelle: "Résistance de démarrage", min: 0, max: 6, pas: 0.01, valeur: p.Rd, format: (v) => nombre(api, v, 2) + " Ω" },
      { id: "tcc", libelle: "Court-circuit du rhéostat", min: 0.1, max: 3, pas: 0.05, valeur: p.tcc, format: (v) => (v >= 2.999 ? "jamais" : "à " + nombre(api, v, 2) + " s") },
      { id: "rampe", libelle: "Durée de la rampe de tension", min: 0, max: 3, pas: 0.1, valeur: p.rampe, format: (v) => (v <= 0 ? "échelon" : nombre(api, v, 1) + " s") },
      { id: "J", libelle: "Inertie totale J", min: 0.1, max: 1.5, pas: 0.05, valeur: p.J, format: (v) => nombre(api, v, 2) + " kg·m²" },
      { id: "Cr", libelle: "Couple résistant constant", min: 0, max: 200, pas: 2, valeur: p.Cr, format: (v) => nombre(api, v, 0) + " N·m" },
    ],
    (lues) => {
      Object.assign(p, lues);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/* Machine des exercices intermédiaires : 230 V, R = 0,6 ohm, KΦ = 1,40 V·s/rad. */
const EXO = { U: 230, R: 0.6, k: 1.4, I: 30 };

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-couple",
      titre: "Couple électromagnétique à partir d'un point de mesure",
      niveau: "fondamental",
      enonce:
        "<p>Un moteur à excitation séparée absorbe $20\\ \\mathrm{A}$ sous $220\\ \\mathrm{V}$ et tourne à $1200\\ \\mathrm{tr/min}$. La résistance " +
        "d'induit vaut $0{,}5\\ \\mathrm{\\Omega}$ ; on néglige la chute aux balais. Quel est le couple électromagnétique ?</p>",
      valeur: ((220 - 0.5 * 20) / ((TAU * 1200) / 60)) * 20,
      unite: "N·m",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Couple $C_{em}$",
      etapes: [
        { texte: "Force électromotrice : $E = U - RI = 220 - 0{,}5 \\times 20 = 210\\ \\mathrm{V}$." },
        { texte: "Vitesse angulaire : $\\varOmega = 2\\pi \\times 1200/60 = 125{,}66\\ \\mathrm{rad/s}$, d'où $K\\Phi = 210/125{,}66 = 1{,}671\\ \\mathrm{V \\cdot s/rad}$." },
        { texte: "Couple : $C_{em} = K\\Phi I = 1{,}671 \\times 20 = 33{,}42\\ \\mathrm{N \\cdot m}$." },
        { texte: "Contrôle par la puissance : $E I = 4200\\ \\mathrm{W}$ et $C_{em}\\varOmega = 33{,}42 \\times 125{,}66 = 4200\\ \\mathrm{W}$.", note: "Le couple utile sera un peu plus faible, à cause des pertes collectives." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 170",
          dessinEtapes(["E = U - R I = 220 - 10 = 210 V", "Ω = 2π × 1200 / 60 = 125,66 rad/s", "KΦ = E / Ω = 1,671 V·s/rad = 1,671 N·m/A", "C_em = KΦ I = 33,42 N·m ; E I = C_em Ω = 4200 W"], 560),
          "Étapes révélées une à une : force électromotrice, vitesse angulaire, constante KΦ, couple et contrôle par la puissance."
        );
      },
    })
  );

  ressources.push(
    api.exercice.schema(cible, {
      id: "k-schema",
      titre: "Lecture du schéma équivalent",
      niveau: "fondamental",
      consigne: "Cliquez sur l'élément dont la tension est proportionnelle à la vitesse de rotation.",
      enonce: "<p>Le schéma représente l'induit d'un moteur à courant continu en régime établi, à flux constant.</p>",
      viewBox: "0 0 540 250",
      dessin: dessinEquivalent("fl-k-sc"),
      zones: [
        { x: 18, y: 64, largeur: 44, hauteur: 150, etiquette: "tension U" },
        { x: 144, y: 38, largeur: 72, hauteur: 44, etiquette: "résistance R" },
        { x: 298, y: 98, largeur: 64, hauteur: 64, etiquette: "force électromotrice E", juste: true },
      ],
      etapes: [
        { texte: "La tension $U$ est imposée par la source ; la chute $RI$ dépend du courant, donc du couple." },
        { texte: "La force électromotrice vaut $E = K\\Phi\\varOmega$ : à flux constant, elle est proportionnelle à la vitesse." },
        { texte: "C'est pourquoi une machine à courant continu à vide, $I \\approx 0$, sert de génératrice tachymétrique : sa tension mesure la vitesse.", note: "En charge, $U = E + RI$ s'écarte de $E$ de quelques pour cent." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 250",
          dessinEquivalent(nouveauMarqueur("fl-k-sc2")) + ECRITS + texte(400, 170, "E = KΦΩ") + texte(400, 190, "∝ vitesse") + texte(130, 100, "R I ∝ couple") + "</g>",
          "Schéma équivalent annoté : la force électromotrice E, flèche en tirets, est proportionnelle à la vitesse ; la chute R I est proportionnelle au courant donc au couple."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-vitesse",
      titre: "Vitesse sous une charge donnée",
      niveau: "intermédiaire",
      enonce:
        "<p>Un moteur à excitation séparée, $K\\Phi = 1{,}40\\ \\mathrm{V \\cdot s/rad}$, $R = 0{,}6\\ \\mathrm{\\Omega}$, est alimenté sous " +
        "$230\\ \\mathrm{V}$. Il entraîne une charge qui impose un couple électromagnétique de $42\\ \\mathrm{N \\cdot m}$ ; on néglige la chute aux " +
        "balais. À quelle vitesse tourne-t-il ?</p>",
      valeur: ((EXO.U - EXO.R * (42 / EXO.k)) / EXO.k) * VERS_TRMIN,
      unite: "tr/min",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Vitesse $n$",
      etapes: [
        { texte: "Méthode : partir de la grandeur imposée par la charge, le couple. $I = C_{em}/K\\Phi = 42/1{,}40 = 30\\ \\mathrm{A}$." },
        { texte: "$E = U - RI = 230 - 0{,}6 \\times 30 = 212\\ \\mathrm{V}$." },
        { texte: "$\\varOmega = E/K\\Phi = 212/1{,}40 = 151{,}4\\ \\mathrm{rad/s}$, soit $n = 151{,}4 \\times 60/(2\\pi) = 1446\\ \\mathrm{tr/min}$." },
        { texte: "Contrôle : vitesse à vide $230/1{,}40 = 164{,}3\\ \\mathrm{rad/s}$, soit $1569\\ \\mathrm{tr/min}$ ; la charge fait perdre $7{,}8\\ \\%$.", note: "Partir de la vitesse aurait demandé de connaître $E$, inconnue : le bon point d'entrée est le couple." },
      ],
      visuelCorrection(conteneur, moteur) {
        const n42 = ((EXO.U - EXO.R * 30) / EXO.k) * VERS_TRMIN;
        traceCorrection(moteur, conteneur, {
          titre: "Caractéristique mécanique et point de fonctionnement",
          xTitre: "couple C_em",
          xUnite: "N·m",
          yTitre: "vitesse",
          yUnite: "tr/min",
          xMin: 0,
          xMax: 80,
          yMin: 1200,
          yMax: 1650,
          series: [{ id: "c", nom: "n(C) sous 230 V", couleur: "serie-1", fonction: (C) => ((EXO.U - EXO.R * (C / EXO.k)) / EXO.k) * VERS_TRMIN }],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 42, "42 N·m");
            pointTrace(c, repere, couleurs, 42, n42, "1446 tr/min");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-rendement",
      titre: "Rendement au point de charge",
      niveau: "intermédiaire",
      enonce:
        "<p>Le même moteur, $230\\ \\mathrm{V}$, $30\\ \\mathrm{A}$, $R = 0{,}6\\ \\mathrm{\\Omega}$, chute aux balais négligée, a une excitation qui " +
        "consomme $150\\ \\mathrm{W}$ et des pertes collectives de $350\\ \\mathrm{W}$ à cette vitesse. Quel est son rendement, en pour cent ?</p>",
      valeur: (100 * ((EXO.U - EXO.R * EXO.I) * EXO.I - 350)) / (EXO.U * EXO.I + 150),
      unite: "%",
      tolerance: 0.005,
      chiffres: 2,
      libelleChamp: "Rendement $\\eta$",
      etapes: [
        { texte: "Puissance absorbée : $P_{abs} = 230 \\times 30 + 150 = 7050\\ \\mathrm{W}$." },
        { texte: "Pertes Joule d'induit : $RI^2 = 0{,}6 \\times 900 = 540\\ \\mathrm{W}$ ; puissance électromagnétique $E I = 212 \\times 30 = 6360\\ \\mathrm{W}$." },
        { texte: "Puissance utile : $P_u = 6360 - 350 = 6010\\ \\mathrm{W}$ ; $\\eta = 6010/7050 = 85{,}25\\ \\%$." },
        { texte: "Contrôle : $150 + 540 + 350 = 1040\\ \\mathrm{W} = 7050 - 6010$.", note: "Oublier l'excitation donnerait $87{,}1\\ \\%$ : une erreur fréquente." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 320",
          dessinBarres(
            [
              { nom: "P_abs", valeur: 7050, max: 7050, texte: "7050 W" },
              { nom: "excitation", valeur: 150, max: 7050, texte: "150 W" },
              { nom: "Joule induit", valeur: 540, max: 7050, texte: "540 W" },
              { nom: "P_em = E I", valeur: 6360, max: 7050, texte: "6360 W" },
              { nom: "collectives", valeur: 350, max: 7050, texte: "350 W" },
              { nom: "P_u", valeur: 6010, max: 7050, texte: "6010 W, η = 85,25 %" },
            ],
            { x0: 150, l: 260 }
          ),
          "Bilan en barres à l'échelle : puissance absorbée, pertes, puissance électromagnétique et puissance utile ; le trait en tirets marque la puissance absorbée."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-defluxage",
      titre: "Défluxage sous contrainte de courant",
      niveau: "avancé",
      enonce:
        "<p>On veut entraîner le même moteur, $230\\ \\mathrm{V}$, $R = 0{,}6\\ \\mathrm{\\Omega}$, $K\\Phi_n = 1{,}40\\ \\mathrm{V \\cdot s/rad}$, à " +
        "$2000\\ \\mathrm{tr/min}$, sans dépasser le courant de $30\\ \\mathrm{A}$ et sans augmenter la tension. À quel pourcentage du flux nominal faut-il " +
        "réduire le flux pour que le courant soit exactement $30\\ \\mathrm{A}$ ? La correction en déduit le couple encore disponible.</p>",
      valeur: (100 * ((EXO.U - EXO.R * EXO.I) / ((TAU * 2000) / 60))) / EXO.k,
      unite: "%",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Flux $\\Phi/\\Phi_n$",
      etapes: [
        { texte: "La tension et le courant étant fixés, $E = 230 - 0{,}6 \\times 30 = 212\\ \\mathrm{V}$ ne change pas." },
        { texte: "$\\varOmega' = 2\\pi \\times 2000/60 = 209{,}4\\ \\mathrm{rad/s}$, donc $K\\Phi' = 212/209{,}4 = 1{,}012\\ \\mathrm{V \\cdot s/rad}$." },
        { texte: "$\\Phi'/\\Phi_n = 1{,}012/1{,}40 = 72{,}3\\ \\%$." },
        { texte: "Couple disponible : $C_{em} = 1{,}012 \\times 30 = 30{,}4\\ \\mathrm{N \\cdot m}$ au lieu de $42$ ; la puissance $E I = 6360\\ \\mathrm{W}$ est conservée.", note: "C'est le fonctionnement à puissance constante : au-dessus de la vitesse de base, le couple admissible décroît comme $1/n$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const kp = (EXO.U - EXO.R * EXO.I) / ((TAU * 2000) / 60);
        traceCorrection(moteur, conteneur, {
          titre: "Caractéristiques à flux nominal et à flux réduit",
          xTitre: "couple C_em",
          xUnite: "N·m",
          yTitre: "vitesse",
          yUnite: "tr/min",
          xMin: 0,
          xMax: 60,
          yMin: 1000,
          yMax: 2400,
          series: [
            { id: "n", nom: "flux nominal", couleur: "serie-1", fonction: (C) => ((EXO.U - EXO.R * (C / EXO.k)) / EXO.k) * VERS_TRMIN },
            { id: "r", nom: "flux à 72,3 %", couleur: "serie-5", fonction: (C) => ((EXO.U - EXO.R * (C / kp)) / kp) * VERS_TRMIN },
          ],
          surDessin({ c, repere, couleurs }) {
            pointTrace(c, repere, couleurs, 42, ((EXO.U - EXO.R * 30) / EXO.k) * VERS_TRMIN, "42 N·m, 30 A");
            pointTrace(c, repere, couleurs, kp * 30, 2000, "30,4 N·m, 30 A");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Diagnostic : enrouleuse en survitesse",
      niveau: "diagnostic",
      enonce:
        "<p>Après le remplacement du câble d'excitation d'un moteur à excitation séparée d'enrouleuse, le moteur démarre normalement à vide, " +
        "puis, dès que la bande est engagée, le variateur déclenche en surintensité d'induit ; à vide, la vitesse mesurée dépasse nettement la " +
        "consigne. La tension d'induit est correcte. Quelles causes sont compatibles avec ces symptômes ?</p>",
      options: [
        { texte: "Un serrage défectueux sur le circuit d'excitation, qui réduit fortement le courant d'excitation.", juste: true },
        { texte: "Une inversion de polarité du nouveau câble d'excitation, le moteur tournant alors à l'envers." },
        { texte: "Un défaut de sélection de la consigne de courant d'excitation dans le variateur, réglée trop bas.", juste: true },
        { texte: "Une augmentation de la résistance d'induit." },
      ],
      etapes: [
        { texte: "Flux réduit : à tension donnée, $\\varOmega_0 = U/K\\Phi$ augmente, d'où la survitesse à vide." },
        { texte: "Sous charge, $I = C_{em}/K\\Phi$ : pour le même couple de bande, le courant d'induit augmente dans le rapport inverse du flux, d'où la surintensité." },
        { texte: "Une inversion de l'excitation ferait tourner à l'envers, sans survitesse ; une résistance d'induit plus forte ferait baisser la vitesse.", note: "Mesure à faire : le courant d'excitation réel, comparé à la plaque ; et la surveillance de perte d'excitation du variateur, qui doit couper l'induit." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 170",
          dessinEtapes(["Φ diminue → Ω0 = U / KΦ augmente : survitesse à vide", "même couple de bande → I = C / KΦ augmente", "surintensité d'induit dès la mise en charge", "à vérifier : I_e mesuré, réglage, serrages"], 560),
          "Raisonnement révélé ligne par ligne : une perte partielle de flux explique à la fois la survitesse à vide et la surintensité en charge."
        );
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-serie",
      titre: "Pourquoi un moteur série ne doit jamais tourner à vide",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi un moteur à excitation série ne doit jamais être démarré à vide ni accouplé à sa charge par une " +
        "courroie, et pourquoi cette même propriété en fait un bon moteur de traction.</p>",
      motsCles: [["flux", "excitation"], ["courant", "charge"], ["emball", "survitesse", "vitesse"], ["couple", "demarrage", "traction"]],
      minimum: 3,
      exemple: "Reliez le flux au courant, puis la vitesse au flux.",
      etapes: [
        { texte: "Dans un moteur série, le flux est créé par le courant d'induit : $K\\Phi \\approx \\lambda I$." },
        { texte: "À vide, le couple demandé est faible, donc le courant et le flux aussi ; or $\\varOmega \\approx U/(K\\Phi)$ : la vitesse n'est plus bornée, le moteur s'emballe jusqu'à la destruction du rotor. Une courroie qui casse produit la même situation." },
        { texte: "À l'inverse, au démarrage, un fort courant crée un fort flux : $C_{em} = \\lambda I^2$, d'où un couple de décollement élevé, recherché en traction et en levage.", note: "La caractéristique est hyperbolique : la vitesse s'adapte d'elle-même à la charge, ce qui convenait aux véhicules avant l'électronique de puissance." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Caractéristique du moteur série sous 440 V",
          xTitre: "couple C_em",
          xUnite: "N·m",
          yTitre: "vitesse",
          yUnite: "tr/min",
          xMin: 0,
          xMax: 300,
          yMin: 0,
          yMax: 4500,
          series: [{ id: "s", nom: "moteur série de la section E", couleur: "serie-5", fonction: (C) => pointSerie(C, { U: 440, Radd: 0 }).n }],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, MH.Cn, "couple nominal");
            pointTrace(c, repere, couleurs, 13.8, pointSerie(13.8, { U: 440, Radd: 0 }).n, "10 % du couple : 4210 tr/min");
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

function dessinQuadrants(id) {
  return (
    "<defs>" + marqueur(id) + "</defs>" +
    TRAITS + ' stroke-width="1.6"><path d="M40 120H480" marker-end="url(#' + id + ')"/><path d="M260 230V14" marker-end="url(#' + id + ')"/></g>' +
    ECRITS + texte(486, 124, "C") + texte(268, 20, "Ω") + texte(330, 70, "quadrant A") + texte(110, 70, "quadrant B") + texte(110, 180, "quadrant C") + texte(330, 180, "quadrant D") + "</g>"
  );
}

const VISUELS_QUIZ = [
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["E = KΦ Ω → KΦ en V/(rad/s) = V·s/rad", "C_em = KΦ I → KΦ en N·m/A", "V·s/rad = V·A·s/(A·rad) = J/(A·rad) = N·m/A"], 540),
    legende: "Analyse dimensionnelle : la même constante s'exprime en V·s/rad et en N·m/A, parce que V·A = W = N·m/s.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["C_em = KΦ I", "I → -I et Φ → -Φ : C_em → (-1)(-1) C_em = C_em", "même sens de rotation"], 540),
    legende: "Inverser le courant et le flux ensemble laisse le produit KΦ I inchangé.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["Ω = 2π × 1000 / 60 = 104,72 rad/s", "E = KΦ Ω = 2,0 × 104,72", "E = 209,4 V"], 540),
    legende: "Calcul révélé ligne par ligne de la force électromotrice à 1000 tr/min.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["à l'arrêt E = 0 : I = U / (R + R_dém)", "R + R_dém = 110 / 40 = 2,75 Ω", "R_dém = 2,75 - 0,25 = 2,50 Ω"], 540),
    legende: "Dimensionnement du rhéostat : la résistance totale fixe le courant à l'arrêt.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["séparée : C = KΦ I, proportionnel à I", "série : C = λ I², croît comme le carré", "à 2 I_n : 394 N·m en série contre 276 N·m"], 540),
    legende: "Comparaison des couples de démarrage pour un même courant limité.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["Ω = 0 → E = KΦ Ω = 0", "I_d = U / R, R de l'ordre de 1 % de U / I_n", "I_d de l'ordre de 10 à 50 fois I_n"], 540),
    legende: "À l'arrêt, la force contre-électromotrice est nulle : seule la faible résistance d'induit limite le courant.",
  },
  {
    viewBox: "0 0 520 240",
    dessin: dessinQuadrants("fl-q7") + ECRITS + texte(110, 90, "C < 0, Ω > 0 :") + texte(110, 106, "freinage avant") + "</g>",
    legende: "Plan couple-vitesse : le freinage en marche avant correspond à une vitesse positive et à un couple négatif, quadrant B.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["à vide idéale : I = 0, E = U", "Ω0 = U / KΦ = 440 / 2,656 = 165,7 rad/s", "n0 = 1582 tr/min"], 540),
    legende: "Vitesse à vide idéale du moteur de la section H.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["à vide, I ≈ 0 : E ≈ U", "Ω0 = U / KΦ", "Φ constant : Ω0 proportionnelle à U"], 540),
    legende: "À vide, la chute R I disparaît : la vitesse à vide est proportionnelle à la tension.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["pôles de commutation sur la ligne neutre", "en série avec l'induit : effet proportionnel à I", "f.é.m. opposée à la réactance de la section commutée"], 540),
    legende: "Rôle des pôles de commutation : compenser la force électromotrice de réactance à toute charge.",
  },
];

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Dans quelle unité s'exprime la constante $K\\Phi$ d'une machine à courant continu ?</p>",
        options: ["En $\\mathrm{V \\cdot s/rad}$, valeur identique en $\\mathrm{N \\cdot m/A}$", "En $\\mathrm{V/(tr/min)}$ uniquement", "En $\\mathrm{Wb/A}$", "En $\\mathrm{N \\cdot m/W}$"],
        bonnes: [0],
        explication: "$E = K\\Phi\\varOmega$ donne des $\\mathrm{V \\cdot s/rad}$ ; $C_{em} = K\\Phi I$ donne des $\\mathrm{N \\cdot m/A}$ ; les deux sont égaux car $\\mathrm{V \\cdot A} = \\mathrm{N \\cdot m/s}$.",
        resume: "Unité de KΦ",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Pour inverser le sens de rotation d'un moteur shunt, il suffit d'inverser la polarité de son alimentation.</p>",
        reponse: false,
        explication: "En shunt, l'inducteur et l'induit sont alimentés par la même source : courant et flux s'inversent ensemble, et le couple garde son signe. Il faut inverser l'un des deux seulement.",
        resume: "Inversion du sens d'un moteur shunt",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Une machine de $K\\Phi = 2{,}0\\ \\mathrm{V \\cdot s/rad}$ tourne à $1000\\ \\mathrm{tr/min}$. Quelle est sa force électromotrice, en volts ?</p>",
        valeur: (2 * TAU * 1000) / 60,
        unite: "V",
        tolerance: 0.01,
        explication: "$\\varOmega = 104{,}72\\ \\mathrm{rad/s}$, donc $E = 2{,}0 \\times 104{,}72 = 209{,}4\\ \\mathrm{V}$.",
        resume: "Force électromotrice",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Un moteur $110\\ \\mathrm{V}$ a une résistance d'induit de $0{,}25\\ \\mathrm{\\Omega}$. Quelle résistance de démarrage limite le courant à $40\\ \\mathrm{A}$ à l'arrêt, en ohms, chute aux balais négligée ?</p>",
        valeur: 110 / 40 - 0.25,
        unite: "Ω",
        tolerance: 0.01,
        explication: "À l'arrêt $E = 0$ : $R + R_{\\text{dém}} = 110/40 = 2{,}75\\ \\mathrm{\\Omega}$, donc $R_{\\text{dém}} = 2{,}50\\ \\mathrm{\\Omega}$.",
        resume: "Rhéostat de démarrage",
      },
      {
        type: "qcm",
        enonce: repere(4) + "<p>Pour un même courant de démarrage, limité à deux fois le courant nominal, quelle excitation donne le plus fort couple de démarrage ?</p>",
        options: ["L'excitation série", "L'excitation séparée", "Les aimants permanents", "Elles donnent toutes le même couple"],
        bonnes: [0],
        explication: "En série, le flux croît avec le courant : le couple croît comme $I^2$ tant que le fer n'est pas saturé, d'où $394\\ \\mathrm{N \\cdot m}$ contre $276$ dans l'exemple de la section E.",
        resume: "Couple de démarrage selon l'excitation",
      },
      {
        type: "courte",
        enonce: repere(5) + "<p>Pourquoi le courant de démarrage direct d'un moteur à courant continu est-il si élevé ?</p>",
        motsCles: [["electromotrice", "contre", "fem", "f.e.m"], ["resistance", "resistif"], ["arret", "nulle", "vitesse"]],
        minimum: 2,
        explication: "À l'arrêt, la vitesse est nulle donc la force contre-électromotrice $E = K\\Phi\\varOmega$ aussi : seule la résistance d'induit, très faible, limite le courant.",
        resume: "Courant de démarrage direct",
      },
      {
        type: "schema",
        enonce: repere(6) + "<p>Sur ce plan couple-vitesse, où se situe le freinage d'un moteur qui tourne en marche avant ?</p>",
        consigne: "Cliquez sur le quadrant correspondant.",
        viewBox: "0 0 520 240",
        dessin: dessinQuadrants("fl-q7s"),
        zones: [
          { x: 300, y: 30, largeur: 170, hauteur: 80, etiquette: "quadrant A" },
          { x: 60, y: 30, largeur: 190, hauteur: 80, etiquette: "quadrant B", juste: true },
          { x: 60, y: 140, largeur: 190, hauteur: 80, etiquette: "quadrant C" },
          { x: 300, y: 140, largeur: 170, hauteur: 80, etiquette: "quadrant D" },
        ],
        explication: "Marche avant : $\\varOmega > 0$ ; freinage : couple opposé à la vitesse, $C < 0$. C'est le quadrant en haut à gauche, où la machine fonctionne en génératrice.",
        resume: "Quadrant du freinage avant",
      },
      {
        type: "calcul",
        enonce: repere(7) + "<p>Le moteur de la section H, $K\\Phi = 2{,}656\\ \\mathrm{V \\cdot s/rad}$, est alimenté sous $440\\ \\mathrm{V}$. Quelle est sa vitesse à vide idéale, en tours par minute ?</p>",
        valeur: (440 / MH.k) * VERS_TRMIN,
        unite: "tr/min",
        tolerance: 0.01,
        explication: "$\\varOmega_0 = U/K\\Phi = 440/2{,}656 = 165{,}7\\ \\mathrm{rad/s}$, soit $1582\\ \\mathrm{tr/min}$, $5{,}5\\ \\%$ au-dessus de la vitesse nominale.",
        resume: "Vitesse à vide idéale",
      },
      {
        type: "vraiFaux",
        enonce: repere(8) + "<p>À flux constant, la vitesse à vide idéale d'un moteur à excitation séparée est proportionnelle à la tension d'induit.</p>",
        reponse: true,
        explication: "À vide idéal, $I = 0$ donc $E = U$ et $\\varOmega_0 = U/K\\Phi$. En charge, la chute $RI$ rompt la proportionnalité.",
        resume: "Vitesse à vide et tension",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Quel est le rôle des pôles de commutation ?</p>",
        options: [
          "Créer dans la section commutée une force électromotrice qui compense sa réactance, proportionnelle au courant d'induit",
          "Augmenter le flux principal pour élever le couple",
          "Réduire la vitesse à vide",
          "Supprimer les pertes fer de l'induit",
        ],
        bonnes: [0],
        explication: "Placés sur la ligne neutre et parcourus par le courant d'induit, ils accélèrent l'inversion du courant dans la section court-circuitée, à toute charge, et suppriment les étincelles.",
        resume: "Rôle des pôles de commutation",
      },
    ],
    { titre: "Dix questions de fin de séance" }
  );
  if (quiz) ressources.push(quiz);
  brancherVisuelsQuiz(racine, api, "#l-quiz-bloc", VISUELS_QUIZ);
}

/* --------------------------------------------------------------------------
   M. Cartes de mémorisation
   -------------------------------------------------------------------------- */

function construireCartesMemo(racine, api) {
  const cartes = api.cartes(
    "#m-cartes",
    [
      { categorie: "Principe", question: "D'où vient la force électromotrice d'une machine à courant continu ?", reponse: "Des conducteurs de l'induit qui coupent le flux fixe des pôles : $e = B\\ell v$ par conducteur, $E = K\\Phi\\varOmega$ entre balais." },
      { categorie: "Collecteur", question: "Quel est le rôle du collecteur ?", reponse: "Redresser mécaniquement la tension alternative des sections et garder fixe dans l'espace la répartition des courants, donc un couple de signe constant." },
      { categorie: "Couple", question: "Comment s'exprime le couple électromagnétique ?", reponse: "$C_{em} = K\\Phi I$, avec la même constante que la force électromotrice : $E I = C_{em}\\varOmega$." },
      { categorie: "Équations", question: "Quelle est l'équation de l'induit en moteur, et en génératrice ?", reponse: "Moteur : $U = E + RI + \\Delta U_b$. Génératrice : $U = E - RI - \\Delta U_b$." },
      { categorie: "Vitesse", question: "Quels sont les trois leviers de réglage de la vitesse ?", reponse: "La tension d'induit, la plus utilisée ; le flux, pour aller au-delà de la vitesse de base ; une résistance additionnelle, dissipative, réservée au démarrage." },
      { categorie: "Démarrage", question: "Pourquoi faut-il limiter le courant de démarrage, et comment ?", reponse: "À l'arrêt $E = 0$ et $I_d = U/R$, des dizaines de fois $I_n$. Rhéostat à plusieurs crans ou rampe de tension d'un convertisseur.", rappel: "Moteur de la section H : 1095 A en direct, 3,81 ohms pour 104 A." },
      { categorie: "Sens", question: "Comment inverser le sens de rotation ?", reponse: "En inversant soit le courant d'induit, soit le flux, jamais les deux ; en pratique l'induit." },
      { categorie: "Série", question: "Quelles sont les propriétés du moteur série ?", reponse: "Flux proportionnel au courant, couple en $I^2$, fort couple de démarrage, vitesse qui s'emballe à vide : jamais sans charge ni par courroie." },
      { categorie: "Bilan", question: "Quelles sont les pertes d'un moteur à courant continu ?", reponse: "Excitation $U_e I_e$, Joule d'induit $RI^2$, balais $\\Delta U_b I$, collectives : fer de l'induit et mécaniques." },
      { categorie: "Commutation", question: "Pourquoi un collecteur produit-il des étincelles, et quel est le remède ?", reponse: "La réactance de la section commutée retarde l'inversion du courant ; l'arc apparaît au bord de sortie du balai. Remède : pôles de commutation en série avec l'induit." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["à vide, I = 0 : U = E", "Ω = 2π × 1200 / 60 = 125,66 rad/s", "E = 2,656 × 125,66 = 333,8 V"], 540),
    legende: "La génératrice à vide délivre sa force électromotrice, proportionnelle à la vitesse.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["série : KΦ ≈ λ I", "C = λ I² ; Ω ≈ U / (λ I)", "faible charge → faible flux → survitesse"], 540),
    legende: "Propriétés du moteur série, étapes révélées une à une.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["η ≈ 1 - (R I² + P0) / (U I)", "minimum de R I + P0 / I : R I² = P0", "section H : I = √(996 / 0,4) = 49,9 A"], 540),
    legende: "Rendement maximal quand les pertes variables égalent les pertes constantes.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["optimum : pertes Joule = pertes fer", "S = Sn √(P0 / Pcc) = 100 × √(198 / 1740,6)", "S = 33,7 kVA"], 540),
    legende: "Charge du rendement maximal du transformateur du poste.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["fermeture au zéro de tension : flux crête doublé", "plus la rémanence de même signe", "saturation profonde : courant d'appel maximal"], 540),
    legende: "Conditions du courant d'enclenchement maximal d'un transformateur.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["fer idéal : N I = H e = B e / μ0", "N I = 0,8 × 0,002 / (4π × 10⁻⁷)", "N I = 1273 A"], 540),
    legende: "Ampères-tours d'un pôle, dominés par l'entrefer.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["E_th = 25,5 × 6 / (0,25 + 6) = 24,48 V", "R_th = 0,25 ∥ 6 = 0,24 Ω", "la charge du bus réduit la tension vue"], 540),
    legende: "Équivalent de Thévenin du bus 24 V secouru chargé par l'armoire.",
  },
];

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. La machine de la section H, excitation nominale, est entraînée à vide à $1200\\ \\mathrm{tr/min}$ en génératrice. Quelle tension lit-on entre ses bornes, en volts ?</p>",
        valeur: (MH.k * TAU * 1200) / 60,
        unite: "V",
        tolerance: 0.01,
        explication: "À vide, aucun courant ne circule : $U = E = K\\Phi\\varOmega = 2{,}656 \\times 125{,}66 = 333{,}8\\ \\mathrm{V}$.",
        resume: "Génératrice à vide",
      },
      {
        type: "qcm",
        enonce: repere(1) + "<p>Cette séance. Quelle affirmation sur le moteur série est exacte ?</p>",
        options: [
          "Sa vitesse augmente fortement quand la charge diminue",
          "Son flux est constant",
          "Son couple est proportionnel à la tension",
          "Il peut tourner à vide sans risque",
        ],
        bonnes: [0],
        explication: "Le flux suit le courant, donc la charge : à faible charge, flux faible et vitesse élevée, jusqu'à l'emballement à vide.",
        resume: "Moteur série",
      },
      {
        type: "vraiFaux",
        enonce: repere(2) + "<p>Cette séance. À tension constante, le rendement d'un moteur à courant continu est maximal quand ses pertes Joule d'induit égalent ses pertes constantes.</p>",
        reponse: true,
        explication: "C'est vrai dans le modèle où les pertes collectives et d'excitation sont constantes : $I = \\sqrt{P_0/R}$, soit environ $50\\ \\mathrm{A}$ pour le moteur de la section H.",
        resume: "Rendement maximal",
      },
      {
        type: "calcul",
        enonce:
          repere(3) + "<p>Cours <a href=\"#/cours/revision-5-et-etude-de-cas-transformateur\">Révision 5 et étude de cas transformateur</a>. Le transformateur du poste, " +
          "$100\\ \\mathrm{kVA}$, a $198\\ \\mathrm{W}$ de pertes à vide et $1740{,}6\\ \\mathrm{W}$ de pertes en court-circuit à $75\\ ^\\circ\\mathrm{C}$. À quelle puissance apparente son rendement est-il maximal, en kVA ?</p>",
        valeur: 100 * Math.sqrt(198 / 1740.6),
        unite: "kVA",
        tolerance: 0.01,
        explication: "Pertes Joule égales aux pertes fer : $S = S_n\\sqrt{P_0/P_{cc}} = 100\\sqrt{198/1740{,}6} = 33{,}7\\ \\mathrm{kVA}$, la même règle que pour le moteur à courant continu.",
        resume: "Rendement maximal du transformateur",
      },
      {
        type: "qcm",
        enonce:
          repere(4) + "<p>Cours <a href=\"#/cours/revision-5-et-etude-de-cas-transformateur\">Révision 5 et étude de cas transformateur</a>. Dans quelles conditions le courant d'enclenchement d'un transformateur est-il le plus élevé ?</p>",
        options: [
          "Fermeture au passage par zéro de la tension, avec une rémanence de même signe que le flux appelé",
          "Fermeture au maximum de la tension, noyau désaimanté",
          "Fermeture en charge nominale",
          "Fermeture sous tension réduite",
        ],
        bonnes: [0],
        explication: "Au zéro de tension, le flux doit partir de la rémanence et atteindre près de deux fois sa crête normale : le noyau sature profondément.",
        resume: "Courant d'enclenchement",
      },
      {
        type: "calcul",
        enonce:
          repere(5) + "<p>Cours <a href=\"#/cours/circuits-magnetiques\">Circuits magnétiques</a>. Le pôle d'une machine doit créer $0{,}8\\ \\mathrm{T}$ dans un entrefer de $2\\ \\mathrm{mm}$ ; le fer est supposé idéal. Combien d'ampères-tours faut-il, en ampères ?</p>",
        valeur: (0.8 * 0.002) / (4 * Math.PI * 1e-7),
        unite: "A",
        tolerance: 0.01,
        explication: "$NI = B\\,e/\\mu_0 = 0{,}8 \\times 0{,}002/(4\\pi \\times 10^{-7}) = 1273\\ \\mathrm{A}$ : l'entrefer fixe l'essentiel du courant d'excitation.",
        resume: "Ampères-tours d'entrefer",
      },
      {
        type: "calcul",
        enonce:
          repere(6) + "<p>Cours <a href=\"#/cours/theoremes-de-thevenin-norton-et-superposition\">Théorèmes de Thévenin, Norton et superposition</a>. Le bus 24 V secouru vaut $25{,}5\\ \\mathrm{V}$ et $0{,}25\\ \\mathrm{\\Omega}$ ; l'armoire de $6\\ \\mathrm{\\Omega}$ y est raccordée. Quelle est la tension de Thévenin vue par une nouvelle charge, en volts ?</p>",
        valeur: (25.5 * 6) / 6.25,
        unite: "V",
        tolerance: 0.01,
        explication: "Diviseur de tension à vide : $E_{th} = 25{,}5 \\times 6/6{,}25 = 24{,}48\\ \\mathrm{V}$, et $R_{th} = 0{,}25 \\parallel 6 = 0{,}24\\ \\mathrm{\\Omega}$ : c'est la source qui alimente l'actionneur de la vanne.",
        resume: "Thévenin du bus chargé",
      },
    ],
    { titre: "Sept questions de révision espacée" }
  );
  if (quiz) ressources.push(quiz);
  brancherVisuelsQuiz(racine, api, "#n-revision-bloc", VISUELS_REVISION);
}

/* --------------------------------------------------------------------------
   P. Auto-évaluation
   -------------------------------------------------------------------------- */

function construireAutoEval(racine, api) {
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur la machine à courant continu ?",
  });
  if (auto) ressources.push(auto);
}
