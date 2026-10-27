/* ==========================================================================
   cours/moteur-asynchrone-triphase/cours.js
   Moteur asynchrone triphasé : champ tournant à partir des phaseurs des
   courants, rotor vu depuis le champ, point de fonctionnement sur une charge,
   cascade des puissances, démarrage direct, et moteur du compresseur du site.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];
let compteurMarqueurs = 0;

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;

/* Moteur de la section H : 11 kW, 230/400 V, 21,0 A, cos phi 0,84, 90 %, 1460 tr/min. */
const MH = {
  Pn: 11000,
  U: 400,
  In: 21.0,
  cos: 0.84,
  eta: 0.9,
  nn: 1460,
  ns: 1500,
  f: 50,
  kmax: 3.0,
  kd: 2.3,
  ki: 7.0,
  pm: 110,
  pjs: 410.19,
  pfs: 397.65,
  i0: 0.4,
};
MH.Wn = (TAU * MH.nn) / 60;
MH.Ws = (TAU * MH.ns) / 60;
MH.Cn = MH.Pn / MH.Wn;
MH.gn = (MH.ns - MH.nn) / MH.ns;
MH.Cf = MH.pm / MH.Wn;
MH.Ptrn = (MH.Pn + MH.pm) / (1 - MH.gn);

/* --------------------------------------------------------------------------
   Modèle de couple : formule de Kloss à glissement critique variable,
   gm(g) = gm0 (1 + a |g|), ajusté sur le point nominal et le couple de
   démarrage du catalogue. Le couple est rapporté au couple nominal.
   -------------------------------------------------------------------------- */

function kloss(g, gm0, a, kmax, kr = 1) {
  if (Math.abs(g) < 1e-9) return 0;
  const gm = kr * gm0 * (1 + a * Math.abs(g));
  return (2 * kmax) / (g / gm + gm / g);
}

function dichotomie(fonction, bas, haut, iterations = 80) {
  let fb = fonction(bas);
  for (let i = 0; i < iterations; i += 1) {
    const milieu = (bas + haut) / 2;
    const fm = fonction(milieu);
    if (fm > 0 === fb > 0) {
      bas = milieu;
      fb = fm;
    } else {
      haut = milieu;
    }
  }
  return (bas + haut) / 2;
}

function ajuster(gn, kmax, kd, rn) {
  const gm0Pour = (a) => dichotomie((x) => kloss(gn, x, a, kmax) - rn, gn * 1.0001, 3);
  const a = dichotomie((x) => kloss(1, gm0Pour(x), x, kmax) - kd, 0, 5.5);
  return { gm0: gm0Pour(a), a, kmax };
}

/* Le modèle représente le couple électromagnétique : au point nominal, il vaut
   le couple utile augmenté du couple des pertes mécaniques. */
const MODELE = ajuster(MH.gn, MH.kmax, MH.kd, (MH.Cn + MH.Cf) / MH.Cn);

function coupleMoteur(n, u = 1, kr = 1) {
  const g = (MH.ns - n) / MH.ns;
  return u * u * MH.Cn * kloss(g, MODELE.gm0, MODELE.a, MODELE.kmax, kr);
}

/** Couple résistant : frottements constants plus charge à couple constant ou en carré de la vitesse. */
function coupleCharge(n, type, niveau) {
  const forme = type >= 0.5 ? Math.pow(Math.max(0, n) / MH.nn, 2) : 1;
  return MH.Cf + niveau * MH.Cn * forme;
}

/** Point de fonctionnement stable : premier croisement en partant du synchronisme. */
function pointStable(u, kr, type, niveau) {
  const ecart = (g) => coupleMoteur(MH.ns * (1 - g), u, kr) - coupleCharge(MH.ns * (1 - g), type, niveau);
  let precedent = 1e-6;
  let fPrecedent = ecart(precedent);
  for (let i = 1; i <= 2000; i += 1) {
    const g = 1e-6 * Math.pow(1e6, i / 2000);
    const fg = ecart(g);
    if (fPrecedent < 0 && fg >= 0) {
      const gs = dichotomie(ecart, precedent, g, 60);
      const n = MH.ns * (1 - gs);
      return { g: gs, n, C: coupleMoteur(n, u, kr) };
    }
    precedent = g;
    fPrecedent = fg;
  }
  return null;
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

/** Point à l'angle mathématique a (degrés) et à la distance l de o. */
function pt(o, a, l) {
  return { x: o.x + l * Math.cos(a * DEG), y: o.y - l * Math.sin(a * DEG) };
}

function fleche(o, a, l, id) {
  const p = pt(o, a, l);
  return '<path d="M' + o.x.toFixed(1) + " " + o.y.toFixed(1) + "L" + p.x.toFixed(1) + " " + p.y.toFixed(1) + '"' + (Math.abs(l) > 6 ? ' marker-end="url(#' + id + ')"' : "") + "/>";
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';

/** Croix ou point dans un petit cercle : sens d'un courant perpendiculaire à la page. */
function symboleCourant(x, y, signe, r = 8) {
  let dessin = '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '"/>';
  const d = r * 0.6;
  if (signe > 0) dessin += '<path d="M' + (x - d).toFixed(1) + " " + (y - d).toFixed(1) + "l" + (2 * d).toFixed(1) + " " + (2 * d).toFixed(1) + "M" + (x + d).toFixed(1) + " " + (y - d).toFixed(1) + "l" + (-2 * d).toFixed(1) + " " + (2 * d).toFixed(1) + '"/>';
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
    const aGauche = px > repere.boite.x + repere.boite.l * 0.62;
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
  const l = options.l || 280;
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

/** Boîtes à bornes en étoile et en triangle, réutilisées par l'exercice et le quiz. */
function dessinBornes() {
  const boite = (x0, titre, triangle) => {
    let d = TRAITS + ' stroke-width="2"><rect x="' + x0 + '" y="40" width="220" height="140" rx="10"/>';
    for (const dx of [40, 110, 180]) {
      d += '<circle cx="' + (x0 + dx) + '" cy="76" r="10"/><circle cx="' + (x0 + dx) + '" cy="146" r="10"/>';
      d += '<path d="M' + (x0 + dx) + " 156V196" + '"/>';
    }
    d += "</g>";
    d += '<g fill="currentColor" fill-opacity="0.45" stroke="currentColor" stroke-width="1.4">';
    if (triangle) for (const dx of [40, 110, 180]) d += '<rect x="' + (x0 + dx - 5) + '" y="72" width="10" height="78" rx="3"/>';
    else d += '<rect x="' + (x0 + 36) + '" y="71" width="148" height="10" rx="3"/>';
    d += "</g>";
    d += ECRITS + texte(x0, 28, titre) + texte(x0 + 26, 64, "W2") + texte(x0 + 96, 64, "U2") + texte(x0 + 166, 64, "V2") +
      texte(x0 + 6, 172, "U1") + texte(x0 + 76, 172, "V1") + texte(x0 + 146, 172, "W1") +
      texte(x0 + 34, 212, "L1") + texte(x0 + 104, 212, "L2") + texte(x0 + 174, 212, "L3") + "</g>";
    return d;
  };
  return boite(30, "montage A", false) + boite(290, "montage B", true);
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
  construireAnimChamp(racine, api);
  construireAnimGlissement(racine, api);
  construireSimCaracteristique(racine, api);
  construireAnimCascade(racine, api);
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
    ["#d-arago-figure svg", 1.5],
    ["#e-coupe-figure svg", 1.8],
    ["#e-enroulements-figure svg", 1.6],
    ["#e-courbe-figure svg", 1.8],
    ["#e-plaque-figure svg", 1.4],
    ["#e-bornes-figure svg", 1.5],
    ["#f-schema-principal svg", 1.8],
    ["#h-donnees-figure svg", 1.4],
    ["#i-compresseur-figure svg", 1.6],
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
      id: "c-puissance",
      titre: "Puissance active d'un récepteur triphasé",
      niveau: "prérequis",
      enonce:
        "<p>Un récepteur triphasé équilibré absorbe $21{,}0\\ \\mathrm{A}$ par ligne sous $400\\ \\mathrm{V}$ composés, avec un facteur de puissance " +
        "de $0{,}84$. Quelle puissance active absorbe-t-il, en kilowatts ?</p>",
      valeur: (Math.sqrt(3) * 400 * 21 * 0.84) / 1000,
      unite: "kW",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Puissance $P$",
      etapes: [
        { texte: "Avec les grandeurs de ligne, et quel que soit le couplage : $P = \\sqrt{3}\\,U I\\cos\\varphi$." },
        { texte: "$P = 1{,}732 \\times 400 \\times 21{,}0 \\times 0{,}84 = 12\\,222\\ \\mathrm{W} = 12{,}22\\ \\mathrm{kW}$." },
        {
          texte: "Erreur classique : prendre $3\\,U I\\cos\\varphi$ avec la tension composée, soit $21{,}2\\ \\mathrm{kW}$, $\\sqrt{3}$ fois trop.",
          note: "C'est la puissance absorbée du moteur de la section H : la plaque, elle, donne la puissance utile.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 540 150",
          dessinEtapes(["P = √3 U I cos φ, grandeurs de ligne", "P = 1,732 × 400 × 21,0 × 0,84", "P = 12 222 W = 12,22 kW"], 540),
          "Calcul révélé ligne par ligne : la formule en grandeurs de ligne, l'application numérique, le résultat."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-trigo",
      titre: "Somme de trois produits de cosinus",
      niveau: "prérequis",
      enonce:
        "<p>Calculez $S = \\sum_{k=0}^{2}\\cos(a - k\\,120^\\circ)\\cos(b - k\\,120^\\circ)$ pour $a = 70^\\circ$ et $b = 40^\\circ$. On peut le faire " +
        "terme à terme à la calculatrice, puis chercher un raccourci.</p>",
      valeur: 1.5 * Math.cos(30 * DEG),
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Somme $S$",
      etapes: [
        { texte: "Terme à terme : $\\cos 70^\\circ\\cos 40^\\circ + \\cos(-50^\\circ)\\cos(-80^\\circ) + \\cos(-170^\\circ)\\cos(-200^\\circ) = 0{,}2620 + 0{,}1116 + 0{,}9254 = 1{,}299$." },
        { texte: "Raccourci : $\\cos x\\cos y = \\tfrac{1}{2}[\\cos(x - y) + \\cos(x + y)]$. Les trois termes en $x - y$ valent tous $\\cos(a - b)$." },
        { texte: "Les trois termes en $x + y$ ont pour phases $a + b$, $a + b - 240^\\circ$, $a + b - 480^\\circ$ : trois angles à $120^\\circ$, de somme nulle." },
        {
          texte: "Donc $S = \\tfrac{3}{2}\\cos(a - b) = 1{,}5 \\cos 30^\\circ = 1{,}299$.",
          note: "C'est exactement le calcul du champ tournant : $a$ joue le rôle de $\\omega t$, $b$ celui de la position $\\theta$ dans l'entrefer.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 172",
          dessinEtapes(["cos x cos y = ½ cos(x - y) + ½ cos(x + y)", "3 termes en x - y : 3 × ½ cos(a - b)", "3 termes en x + y : phases à 120°, somme nulle", "S = 1,5 cos(30°) = 1,299"], 560),
          "Étapes révélées une à une : la formule de produit, les termes qui s'ajoutent, ceux qui s'annulent, le résultat."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-couple",
      titre: "Couple transmis par un arbre",
      niveau: "prérequis",
      enonce: "<p>Un arbre transmet $5{,}5\\ \\mathrm{kW}$ à $2900\\ \\mathrm{tr/min}$. Quel couple transmet-il ?</p>",
      valeur: 5500 / ((TAU * 2900) / 60),
      unite: "N·m",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Couple $C$",
      etapes: [
        { texte: "Conversion : $\\varOmega = 2\\pi \\times 2900/60 = 303{,}69\\ \\mathrm{rad/s}$." },
        { texte: "$C = P/\\varOmega = 5500/303{,}69 = 18{,}11\\ \\mathrm{N \\cdot m}$." },
        { texte: "Avec $2900$ au lieu de $303{,}69$, on trouverait $1{,}9\\ \\mathrm{N \\cdot m}$ : le facteur $9{,}55$ est l'erreur la plus fréquente.", note: "Repère : à $3000\\ \\mathrm{tr/min}$, environ $3{,}2\\ \\mathrm{N \\cdot m}$ par kilowatt ; à $1500\\ \\mathrm{tr/min}$, le double." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 540 150",
          dessinEtapes(["Ω = 2π n / 60 = 303,69 rad/s", "C = P / Ω = 5500 / 303,69", "C = 18,11 N·m"], 540),
          "Calcul révélé ligne par ligne : conversion en radians par seconde, puis quotient de la puissance par la vitesse."
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   E. Animation : des phaseurs temporels au champ tournant
   -------------------------------------------------------------------------- */

/** Courants rapportés à Im selon le mode : 0 direct, 1 V et W permutées, 2 phase W coupée. */
function courantsChamp(wt, mode) {
  if (mode === 2) {
    const iu = (Math.sqrt(3) / 2) * Math.cos((wt + 30) * DEG);
    return { valeurs: [iu, -iu, 0], phases: [wt + 30, wt + 210, null], modules: [Math.sqrt(3) / 2, Math.sqrt(3) / 2, 0] };
  }
  const decalages = mode === 1 ? [0, 240, 120] : [0, 120, 240];
  return {
    valeurs: decalages.map((d) => Math.cos((wt - d) * DEG)),
    phases: decalages.map((d) => wt - d),
    modules: [1, 1, 1],
  };
}

function construireAnimChamp(racine, api) {
  const conteneur = racine.querySelector("#e-champ");
  if (!conteneur) return;

  const O = { x: 180, y: 185 };
  const F = { x: 540, y: 185 };
  const echelle = 80;
  const RF = 110;
  const axes = [0, 120, 240];
  const noms = ["U", "V", "W"];
  const id = nouveauMarqueur("fl-e-ch");
  let wt = 30;
  let mode = 0;

  const svg = svgEl("svg", {
    viewBox: "0 0 740 370",
    role: "img",
    "aria-label": "À gauche, stator avec les contributions des trois bobines et le champ total ; à droite, phaseurs des trois courants et leurs projections",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(id);
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.6 });
  let fondHtml =
    '<circle cx="' + O.x + '" cy="' + O.y + '" r="160"/>' +
    '<circle cx="' + O.x + '" cy="' + O.y + '" r="' + 1.5 * echelle + '" stroke-dasharray="2 5" opacity="0.7"/>' +
    '<circle cx="' + F.x + '" cy="' + F.y + '" r="' + RF + '" stroke-dasharray="2 5" opacity="0.7"/>' +
    '<path d="M' + (F.x - RF - 30) + " " + F.y + "H" + (F.x + RF + 34) + "M" + F.x + " " + (F.y - RF - 26) + "V" + (F.y + RF + 26) + '" stroke-width="1.1" opacity="0.6"/>';
  for (const a of axes) {
    const p = pt(O, a, 172);
    const q = pt(O, a + 180, 150);
    fondHtml += '<path d="M' + q.x.toFixed(1) + " " + q.y.toFixed(1) + "L" + p.x.toFixed(1) + " " + p.y.toFixed(1) + '" stroke-dasharray="6 5" stroke-width="1.1" opacity="0.55"/>';
  }
  fond.innerHTML = fondHtml;
  const contributions = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.8 });
  const total = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 4 });
  const phaseurs = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2 });
  const projections = svgEl("g", { fill: "currentColor", stroke: "none" });
  const fixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  fixes.innerHTML =
    texte(20, 362, "stator : contributions et champ total") + texte(400, 20, "phaseurs des courants") +
    texte(O.x + 162, O.y - 6, "axe U") + texte(pt(O, 120, 176).x - 52, pt(O, 120, 176).y, "axe V") + texte(pt(O, 240, 176).x - 52, pt(O, 240, 176).y + 10, "axe W") +
    texte(F.x + RF + 18, F.y + 18, "Re") + texte(F.x + 6, F.y - RF - 12, "Im") + texte(400, 362, "valeur instantanée = projection horizontale");
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, contributions, total, phaseurs, projections, fixes, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-champ-valeurs", [
    { id: "wt", libelle: "Angle ωt", unite: "°", decimales: 0 },
    { id: "iu", libelle: "i_U / Im", decimales: 3 },
    { id: "iv", libelle: "i_V / Im", decimales: 3 },
    { id: "iw", libelle: "i_W / Im", decimales: 3 },
    { id: "b", libelle: "Champ total / K Im", decimales: 3 },
    { id: "dir", libelle: "Direction du champ total", unite: "°", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const c = courantsChamp(wt, mode);
    let bx = 0;
    let by = 0;
    let html = "";
    let ecrits = "";
    c.valeurs.forEach((i, k) => {
      const l = echelle * i;
      const dir = l >= 0 ? axes[k] : axes[k] + 180;
      html += fleche(O, dir, Math.abs(l), id);
      bx += i * Math.cos(axes[k] * DEG);
      by += i * Math.sin(axes[k] * DEG);
      if (Math.abs(l) > 14) {
        const e = pt(O, dir, Math.abs(l) + 14);
        ecrits += texte(e.x - 4, e.y + 4, noms[k]);
      }
    });
    contributions.innerHTML = html;
    const module = Math.hypot(bx, by);
    const direction = ((Math.atan2(by, bx) / DEG) % 360 + 360) % 360;
    total.innerHTML = module > 0.02 ? fleche(O, direction, module * echelle, id) : "";
    if (module > 0.1) {
      const e = pt(O, direction, module * echelle + 18);
      ecrits += texte(e.x - 6, e.y + 4, "b");
    }

    let htmlP = "";
    let htmlQ = "";
    c.phases.forEach((phase, k) => {
      if (phase === null || c.modules[k] < 1e-6) return;
      const l = RF * c.modules[k];
      htmlP += fleche(F, phase, l, id);
      const bout = pt(F, phase, l);
      htmlP += '<path d="M' + bout.x.toFixed(1) + " " + bout.y.toFixed(1) + "V" + F.y + '" stroke-dasharray="3 3" stroke-width="1"/>';
      htmlQ += '<rect x="' + (bout.x - 4).toFixed(1) + '" y="' + (F.y - 4) + '" width="8" height="8"/>';
      const e = pt(F, phase, l + 18);
      ecrits += texte(e.x - 10, e.y + 4, "I_" + noms[k]);
    });
    if (mode === 2) ecrits += texte(F.x - RF, F.y + RF + 40, "I_W = 0 : phase coupée");
    phaseurs.innerHTML = htmlP;
    projections.innerHTML = htmlQ;
    libelles.innerHTML = ecrits;

    if (valeurs) valeurs.maj({ wt: ((wt % 360) + 360) % 360, iu: c.valeurs[0], iv: c.valeurs[1], iw: c.valeurs[2], b: module, dir: module > 0.02 ? direction : NaN });
  }

  let synchro = false;
  let poignee = null;
  let lecteur = null;
  function appliquer(valeur, source) {
    if (synchro) return;
    synchro = true;
    wt = ((Number(valeur) % 360) + 360) % 360;
    dessiner();
    if (source !== "poignee" && poignee) poignee.set(wt, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(wt);
    synchro = false;
  }

  const curseurs = api.sim.curseurs(
    "#e-champ-curseurs",
    [
      {
        id: "mode",
        libelle: "Alimentation",
        min: 0,
        max: 2,
        pas: 1,
        valeur: mode,
        format: (v) => (v >= 1.5 ? "phase W coupée, étoile" : v >= 0.5 ? "V et W permutées" : "ordre direct U, V, W"),
      },
    ],
    (lues) => {
      mode = Math.round(lues.mode);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: F,
    rayon: RF,
    valeur: wt,
    pas: 5,
    libelle: "Angle ωt, extrémité du phaseur de référence",
    diffuserAuDepart: false,
    rappel: (mesure) => appliquer(mesure.angle, "poignee"),
  });
  if (poignee) ressources.push(poignee);

  lecteur = api.sim.lecteur("#e-champ-lecteur", {
    de: 0,
    a: 360,
    duree: 8,
    boucle: true,
    auto: false,
    libelle: "Une période des courants",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  appliquer(wt, null);
}

/* --------------------------------------------------------------------------
   E. Animation : le rotor vu depuis le champ
   -------------------------------------------------------------------------- */

const GM_ANIM = 0.15;

function construireAnimGlissement(racine, api) {
  const conteneur = racine.querySelector("#e-glis");
  if (!conteneur) return;

  const X0 = 40;
  const X1 = 700;
  const YB = 110;
  const YR = 228;
  const A = 52;
  const versX = (deg) => X0 + ((X1 - X0) * ((((deg % 360) + 360) % 360))) / 360;
  const segment = { de: { x: 150, y: 318 }, a: { x: 610, y: 318 } };
  const NB = 12;
  const id = nouveauMarqueur("fl-e-gl");
  let g = 0.05;
  let referentiel = 0;
  let tau = 0;
  let precedent = null;

  const svg = svgEl("svg", {
    viewBox: "0 0 740 350",
    role: "img",
    "aria-label": "Entrefer déroulé sur une paire de pôles : onde d'induction du champ tournant, onde de courant des barres et barres du rotor, avec un segment gradué pour régler le glissement",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(id);
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.2, opacity: 0.6 });
  let graduations = "";
  for (const v of [-0.1, 0, 0.25, 0.5, 0.75, 1]) {
    const x = segment.de.x + ((v + 0.1) / 1.1) * (segment.a.x - segment.de.x);
    graduations += "M" + x.toFixed(1) + " " + (segment.de.y - 6) + "v12";
  }
  fond.innerHTML =
    '<path d="M' + X0 + " " + YB + "H" + X1 + "M" + X0 + " " + YR + "H" + X1 + '" stroke-dasharray="2 4"/>' +
    '<path d="M' + X0 + " " + (YB - A - 12) + "V" + (YR + 24) + "M" + X1 + " " + (YB - A - 12) + "V" + (YR + 24) + '"/>' +
    '<path d="M' + segment.de.x + " " + segment.de.y + "H" + segment.a.x + graduations + '" stroke-width="1.6" opacity="1"/>';
  const ondeB = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3 });
  const ondeI = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-dasharray": "7 5" });
  const barres = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.6 });
  const vitesses = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2 });
  const fixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  let etiquettes = "";
  for (const v of [-0.1, 0, 0.5, 1]) {
    const x = segment.de.x + ((v + 0.1) / 1.1) * (segment.a.x - segment.de.x);
    etiquettes += texte(x - 12, segment.de.y + 24, String(v).replace(".", ","));
  }
  fixes.innerHTML =
    texte(X0, 26, "induction du champ, trait plein ; courant des barres, tirets") + texte(X0, YR + 46, "barres du rotor") +
    texte(X0 - 4, YB + 4, "0") + texte(X1 - 28, YR + 46, "360°") + texte(segment.de.x - 112, segment.de.y + 4, "glissement g") + etiquettes;
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, ondeB, ondeI, barres, vitesses, fixes, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-glis-valeurs", [
    { id: "g", libelle: "Glissement", unite: "%", decimales: 1 },
    { id: "n", libelle: "Vitesse du rotor pour n_s = 1500 tr/min", unite: "tr/min", decimales: 0 },
    { id: "fr", libelle: "Fréquence des courants rotoriques à 50 Hz", unite: "Hz", decimales: 2 },
    { id: "i", libelle: "Courant rotorique / valeur à glissement infini", decimales: 3 },
    { id: "phi", libelle: "Retard de l'onde de courant φ2", unite: "°", decimales: 1 },
    { id: "c", libelle: "Couple / couple maximal", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const champ = referentiel >= 0.5 ? 0 : tau;
    const amplitude = g / Math.sqrt(g * g + GM_ANIM * GM_ANIM);
    const phi = Math.atan(g / GM_ANIM) / DEG;
    const pb = [];
    const pi = [];
    for (let k = 0; k <= 180; k += 1) {
      const deg = k * 2;
      const x = X0 + ((X1 - X0) * deg) / 360;
      pb.push(x.toFixed(1) + " " + (YB - A * Math.cos((deg - champ) * DEG)).toFixed(1));
      pi.push(x.toFixed(1) + " " + (YB - A * amplitude * Math.cos((deg - champ + phi) * DEG)).toFixed(1));
    }
    ondeB.setAttribute("d", "M" + pb.join(" L"));
    ondeI.setAttribute("d", "M" + pi.join(" L"));

    const deplacement = referentiel >= 0.5 ? -g * tau : (1 - g) * tau;
    let html = "";
    for (let j = 0; j < NB; j += 1) {
      const pos = ((j * 360) / NB + deplacement) % 360;
      const x = versX(pos);
      const courant = amplitude * Math.cos((pos - champ + phi) * DEG);
      const signe = Math.abs(courant) < 0.08 ? 0 : courant > 0 ? 1 : -1;
      html += symboleCourant(x, YR, signe, 5 + 8 * Math.abs(courant));
    }
    barres.innerHTML = html;

    const vChamp = referentiel >= 0.5 ? 0 : 1;
    const vRotor = referentiel >= 0.5 ? -g : 1 - g;
    let flechesHtml = "";
    let ecrits = "";
    const yF = 44;
    const yR = YR + 34;
    if (Math.abs(vChamp) > 0.01) flechesHtml += '<path d="M330 ' + yF + "H" + (330 + 110 * vChamp).toFixed(1) + '" marker-end="url(#' + id + ')"/>';
    ecrits += texte(460, yF + 4, vChamp ? "champ : n_s" : "champ immobile");
    if (Math.abs(vRotor) > 0.01) flechesHtml += '<path d="M330 ' + yR + "H" + (330 + 110 * vRotor).toFixed(1) + '" marker-end="url(#' + id + ')"/>';
    ecrits += texte(460, yR + 4, referentiel >= 0.5 ? "barres : -g n_s" : "barres : (1 - g) n_s");
    vitesses.innerHTML = flechesHtml;
    libelles.innerHTML = ecrits;

    if (valeurs) {
      valeurs.maj({
        g: g * 100,
        n: MH.ns * (1 - g),
        fr: g * 50,
        i: amplitude,
        phi,
        c: Math.abs(g) < 1e-9 ? 0 : 2 / (g / GM_ANIM + GM_ANIM / g),
      });
    }
  }

  let synchro = false;
  let poignee = null;
  let curseurs = null;
  function appliquerG(valeur, source) {
    if (synchro) return;
    synchro = true;
    g = Math.max(-0.1, Math.min(1, Number(valeur)));
    dessiner();
    if (source !== "poignee" && poignee) poignee.set(g, false);
    if (source !== "curseur" && curseurs) curseurs.definir("g", g);
    synchro = false;
  }

  curseurs = api.sim.curseurs(
    "#e-glis-curseurs",
    [
      { id: "g", libelle: "Glissement g", min: -0.1, max: 1, pas: 0.005, valeur: g, format: (v) => nombre(api, v * 100, 1) + " %" },
      { id: "ref", libelle: "Référentiel d'observation", min: 0, max: 1, pas: 1, valeur: referentiel, format: (v) => (v >= 0.5 ? "lié au champ" : "lié au stator") },
    ],
    (lues) => {
      referentiel = lues.ref;
      if (Math.abs(lues.g - g) > 1e-9) appliquerG(lues.g, "curseur");
      else dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: segment.de,
    a: segment.a,
    min: -0.1,
    max: 1,
    pas: 0.005,
    valeur: g,
    libelle: "Glissement du rotor",
    diffuserAuDepart: false,
    rappel: (mesure) => appliquerG(mesure.valeur, "poignee"),
  });
  if (poignee) ressources.push(poignee);

  /* Le lecteur fournit le temps ; on en accumule les accroissements pour que
     le mouvement reste continu quand il reboucle. */
  const lecteur = api.sim.lecteur("#e-glis-lecteur", {
    de: 0,
    a: 360,
    duree: 5,
    boucle: true,
    auto: false,
    libelle: "Rotation du champ",
    rappel: (valeur) => {
      const v = Number(valeur);
      if (precedent === null || v === 0) {
        if (v === 0) tau = 0;
        precedent = v;
        dessiner();
        return;
      }
      let d = v - precedent;
      if (d < -180) d += 360;
      if (d > 180) d -= 360;
      precedent = v;
      tau += d;
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);

  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : point de fonctionnement sur une charge
   -------------------------------------------------------------------------- */

function construireSimCaracteristique(racine, api) {
  const p = { u: 100, kr: 1, type: 0, niveau: 100 };
  let point = null;

  const trace = api.sim.traceur("#e-carac-trace", {
    titre: "Couple en fonction de la vitesse et point de fonctionnement",
    xTitre: "vitesse n",
    xUnite: "tr/min",
    yTitre: "couple",
    yUnite: "N·m",
    xMin: 0,
    xMax: 1600,
    yMin: -100,
    yMax: 240,
    echantillons: 640,
    series: [
      { id: "moteur", nom: "moteur, réglages choisis", couleur: "serie-1", epaisseur: 3 },
      { id: "reference", nom: "moteur sous tension nominale", couleur: "serie-6", epaisseur: 1.4 },
      { id: "charge", nom: "couple résistant de la charge", couleur: "serie-5", epaisseur: 2.2 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, MH.ns, "n_s");
      ligneH(c, repere, couleurs, MH.Cn, "C_n", false, [3, 4]);
      if (point) pointTrace(c, repere, couleurs, point.n, point.C, "point de fonctionnement");
    },
  });
  if (trace) ressources.push(trace);

  const texteSi = (decimales, unite) => (v) => (Number.isFinite(v) ? nombre(api, v, decimales) + " " + unite : "sans objet");
  const valeurs = api.sim.valeurs("#e-carac-valeurs", [
    { id: "n", libelle: "Vitesse", format: texteSi(0, "tr/min") },
    { id: "g", libelle: "Glissement", format: texteSi(2, "%") },
    { id: "C", libelle: "Couple électromagnétique", format: texteSi(1, "N·m") },
    { id: "pjr", libelle: "Pertes Joule du rotor g P_tr", format: texteSi(0, "W") },
    { id: "marge", libelle: "Couple maximal / couple demandé", format: texteSi(2, "") },
    { id: "etat", libelle: "État", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    const u = p.u / 100;
    const niveau = p.niveau / 100;
    if (trace) {
      trace.definirFonction("moteur", (n) => coupleMoteur(n, u, p.kr));
      trace.definirFonction("reference", (n) => coupleMoteur(n, 1, 1));
      trace.definirFonction("charge", (n) => coupleCharge(n, p.type, niveau));
    }
    point = pointStable(u, p.kr, p.type, niveau);
    if (trace) trace.rafraichir();
    if (!valeurs) return;
    const demarre = coupleMoteur(0, u, p.kr) > coupleCharge(0, p.type, niveau);
    if (!point) {
      valeurs.maj({ n: NaN, g: NaN, C: NaN, pjr: NaN, marge: NaN, etat: demarre ? "décrochage : la charge dépasse le couple maximal" : "le moteur ne démarre pas et ne peut pas tourner" });
      return;
    }
    const cmax = u * u * MH.kmax * MH.Cn;
    valeurs.maj({
      n: point.n,
      g: point.g * 100,
      C: point.C,
      pjr: point.g * point.C * MH.Ws,
      marge: cmax / point.C,
      etat: demarre ? "fonctionnement stable" : "stable s'il est lancé, mais ne démarre pas seul",
    });
  }

  const curseurs = api.sim.curseurs(
    "#e-carac-curseurs",
    [
      { id: "u", libelle: "Tension d'alimentation", min: 50, max: 110, pas: 1, valeur: p.u, format: (v) => nombre(api, v, 0) + " % de U_n" },
      { id: "kr", libelle: "Résistance rotorique", min: 1, max: 8, pas: 0.25, valeur: p.kr, format: (v) => "× " + nombre(api, v, 2) },
      { id: "type", libelle: "Type de charge", min: 0, max: 1, pas: 1, valeur: p.type, format: (v) => (v >= 0.5 ? "ventilateur, couple en n²" : "convoyeur, couple constant") },
      { id: "niveau", libelle: "Couple de charge à 1460 tr/min", min: 0, max: 320, pas: 5, valeur: p.niveau, format: (v) => nombre(api, v, 0) + " % de C_n" },
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

/** Bilan du moteur de la section H pour un couple utile x C_n sous la tension u U_n. */
function bilanCharge(x, u) {
  const cible = x * MH.Cn;
  const ecart = (g) => coupleMoteur(MH.ns * (1 - g), u) - (cible + MH.pm / (MH.Ws * (1 - g)));
  let g = 0;
  if (ecart(0.12) > 0) g = dichotomie(ecart, 1e-7, 0.12);
  else return null;
  const Cem = cible + MH.pm / (MH.Ws * (1 - g));
  const Ptr = Cem * MH.Ws;
  const pjr = g * Ptr;
  const Pm = Ptr - pjr;
  const Pu = Pm - MH.pm;
  const r = Ptr / MH.Ptrn;
  const actif = MH.cos;
  const fuite = Math.sqrt(1 - MH.cos * MH.cos) - MH.i0;
  const Irel = Math.sqrt(Math.pow((actif * r) / u, 2) + Math.pow(MH.i0 * u + fuite * Math.pow(r / u, 2), 2));
  const pjs = MH.pjs * Irel * Irel;
  const pfs = MH.pfs * u * u;
  const Pabs = Ptr + pjs + pfs;
  const I = MH.In * Irel;
  return { g, n: MH.ns * (1 - g), Cem, Ptr, pjr, Pm, Pu, pjs, pfs, Pabs, I, eta: Pabs > 0 ? Pu / Pabs : 0, cos: Pabs / (Math.sqrt(3) * MH.U * u * I) };
}

function construireAnimCascade(racine, api) {
  const conteneur = racine.querySelector("#e-cascade");
  if (!conteneur) return;

  const x0 = 236;
  const largeurMax = 470;
  const echelle = largeurMax / 16000;
  const loupe = 10;
  const lignes = [
    { cle: "Pabs", nom: "P_abs absorbée", perte: false },
    { cle: "pjs", nom: "p_js Joule stator", perte: true },
    { cle: "pfs", nom: "p_fs fer stator", perte: true },
    { cle: "Ptr", nom: "P_tr entrefer", perte: false },
    { cle: "pjr", nom: "p_jr = g P_tr", perte: true },
    { cle: "Pm", nom: "P_m mécanique", perte: false },
    { cle: "pm", nom: "p_m mécaniques", perte: true },
    { cle: "Pu", nom: "P_u utile", perte: false },
  ];
  const motif = nouveauMarqueur("hach");
  const svg = svgEl("svg", {
    viewBox: "0 0 740 380",
    role: "img",
    "aria-label": "Cascade des puissances du moteur : barres de puissance absorbée, transmise, mécanique et utile, et barres de pertes à échelle agrandie",
  });
  const defs = svgEl("defs");
  defs.innerHTML =
    '<pattern id="' + motif + '" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<path d="M0 0V7" stroke="currentColor" stroke-width="2.4"/></pattern>';
  const reperes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.2, "stroke-dasharray": "5 4", opacity: 0.7 });
  const xNominal = x0 + 12222 * echelle;
  reperes.innerHTML = '<path d="M' + xNominal.toFixed(1) + ' 24V32M' + xNominal.toFixed(1) + ' 340V350"/>';
  const ecritsFixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  let fixesHtml = texte(xNominal + 6, 362, "P_abs nominale") + texte(10, 18, "barres pleines : puissances, échelle 16 kW = pleine largeur ; hachures : pertes, échelle × 10");
  const rects = [];
  const valeursTexte = [];
  const barres = svgEl("g", { stroke: "currentColor", "stroke-width": 1.2 });
  const ecritsVariables = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  lignes.forEach((ligne, i) => {
    const y = 34 + i * 40;
    fixesHtml += texte(10, y + 16, ligne.nom);
    const rect = svgEl("rect", {
      x: x0,
      y,
      width: 1,
      height: 22,
      rx: 3,
      fill: ligne.perte ? "url(#" + motif + ")" : "currentColor",
      "fill-opacity": ligne.perte ? 1 : 0.35,
    });
    barres.appendChild(rect);
    rects.push(rect);
    const t = svgEl("text", { x: x0 + 8, y: y + 16 });
    ecritsVariables.appendChild(t);
    valeursTexte.push(t);
  });
  ecritsFixes.innerHTML = fixesHtml;
  svg.append(defs, reperes, barres, ecritsFixes, ecritsVariables);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-cascade-valeurs", [
    { id: "n", libelle: "Vitesse", unite: "tr/min", decimales: 0 },
    { id: "g", libelle: "Glissement", unite: "%", decimales: 2 },
    { id: "I", libelle: "Courant de ligne estimé", unite: "A", decimales: 1 },
    { id: "cos", libelle: "Facteur de puissance estimé", decimales: 2 },
    { id: "eta", libelle: "Rendement", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const gsap = api.gsap && !api.mouvementReduit ? api.gsap : null;
  if (gsap) nettoyeursAnimation.push(() => gsap.killTweensOf(rects));

  function maj(x, u) {
    const b = bilanCharge(x, u);
    if (!b) return;
    const donnees = { ...b, pm: MH.pm };
    lignes.forEach((ligne, i) => {
      const valeur = Math.max(0, donnees[ligne.cle]);
      const largeur = Math.max(1, Math.min(largeurMax, valeur * echelle * (ligne.perte ? loupe : 1)));
      if (gsap) gsap.to(rects[i], { attr: { width: largeur }, duration: 0.45, ease: "power2.out", overwrite: true });
      else rects[i].setAttribute("width", largeur.toFixed(1));
      valeursTexte[i].setAttribute("x", (x0 + largeur + 8).toFixed(1));
      valeursTexte[i].textContent = nombre(api, valeur, 0) + " W";
    });
    if (valeurs) valeurs.maj({ n: b.n, g: b.g * 100, I: b.I, cos: b.cos, eta: b.eta * 100 });
  }

  const reglages = { charge: 100, tension: 100 };
  const curseurs = api.sim.curseurs(
    "#e-cascade-curseurs",
    [
      { id: "charge", libelle: "Couple utile", min: 0, max: 125, pas: 5, valeur: reglages.charge, format: (v) => nombre(api, v, 0) + " % de C_n" },
      { id: "tension", libelle: "Tension d'alimentation", min: 85, max: 110, pas: 1, valeur: reglages.tension, format: (v) => nombre(api, v, 0) + " % de U_n" },
    ],
    (lues) => {
      Object.assign(reglages, lues);
      maj(reglages.charge / 100, reglages.tension / 100);
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj(1, 1);
}

/* --------------------------------------------------------------------------
   E. Simulation : démarrage direct et durée d'accélération
   -------------------------------------------------------------------------- */

function simulerDemarrage(p) {
  const u = p.u / 100;
  const niveau = p.niveau / 100;
  const dt = 2e-4;
  const tMax = 12;
  const vitesse = [];
  const couples = [];
  const resistant = [];
  let w = 0;
  let t = 0;
  let energie = 0;
  let pas = 0;
  if (coupleMoteur(0, u) <= coupleCharge(0, p.type, niveau)) {
    return { bloque: true, vitesse: [[0, 0], [1, 0]], couples: [[0, coupleMoteur(0, u)], [1, coupleMoteur(0, u)]], resistant: [[0, coupleCharge(0, p.type, niveau)], [1, coupleCharge(0, p.type, niveau)]], tFin: 1 };
  }
  const historique = [];
  let calme = 0;
  while (t < tMax) {
    const n = (w * 60) / TAU;
    const cm = coupleMoteur(n, u);
    const cr = coupleCharge(n, p.type, niveau);
    if (pas % 25 === 0) {
      vitesse.push([t, n]);
      couples.push([t, cm]);
      resistant.push([t, cr]);
    }
    if (pas % 5 === 0) historique.push([t, w, energie]);
    energie += (MH.Ws - w) * cm * dt;
    const dw = ((cm - cr) / p.J) * dt;
    w += dw;
    t += dt;
    pas += 1;
    calme = Math.abs(dw) < 1e-7 * MH.Ws ? calme + 1 : 0;
    if (calme > 2000 && t > 0.2) break;
  }
  const wf = w;
  let t95 = NaN;
  let e95 = NaN;
  for (const [ti, wi, ei] of historique) {
    if (wi >= 0.95 * wf) {
      t95 = ti;
      e95 = ei;
      break;
    }
  }
  return { bloque: false, vitesse, couples, resistant, nFinal: (wf * 60) / TAU, t95, e95, tFin: t };
}

function construireSimDemarrage(racine, api) {
  const p = { u: 100, J: 0.3, type: 0, niveau: 0 };
  let resultat = null;

  const traceN = api.sim.traceur("#e-dyn-vitesse", {
    titre: "Vitesse du rotor pendant le démarrage",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "vitesse",
    yUnite: "tr/min",
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1600,
    series: [{ id: "n", nom: "vitesse n(t)", couleur: "serie-1", epaisseur: 2.6 }],
    surDessin({ c, repere, couleurs }) {
      if (!resultat || resultat.bloque) return;
      ligneH(c, repere, couleurs, 0.95 * resultat.nFinal, "95 % de la vitesse finale", true, [3, 4]);
      if (Number.isFinite(resultat.t95)) ligneV(c, repere, couleurs, resultat.t95, "t95");
    },
  });
  if (traceN) ressources.push(traceN);

  const traceC = api.sim.traceur("#e-dyn-couple", {
    titre: "Couples pendant le démarrage",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "couple",
    yUnite: "N·m",
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 240,
    series: [
      { id: "cm", nom: "couple du moteur", couleur: "serie-1", epaisseur: 2.4 },
      { id: "cr", nom: "couple résistant", couleur: "serie-5", epaisseur: 2 },
    ],
  });
  if (traceC) ressources.push(traceC);

  const texteSi = (decimales, unite) => (v) => (Number.isFinite(v) ? nombre(api, v, decimales) + " " + unite : "sans objet");
  const valeurs = api.sim.valeurs("#e-dyn-valeurs", [
    { id: "t95", libelle: "Durée jusqu'à 95 % de la vitesse finale", format: texteSi(3, "s") },
    { id: "nf", libelle: "Vitesse finale", format: texteSi(0, "tr/min") },
    { id: "e95", libelle: "Énergie dissipée dans le rotor jusqu'à t95", format: texteSi(2, "kJ") },
    { id: "ec", libelle: "Référence ½ J Ω_s²", format: texteSi(2, "kJ") },
    { id: "cd", libelle: "Couple de démarrage disponible", format: texteSi(1, "N·m") },
    { id: "etat", libelle: "État", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    resultat = simulerDemarrage(p);
    const fin = resultat.bloque ? 1 : Math.min(resultat.tFin, Math.max(0.3, 2.2 * resultat.t95));
    const couper = (serie) => serie.filter((point) => point[0] <= fin);
    if (traceN) {
      traceN.definirPlage({ xMin: 0, xMax: fin });
      traceN.definirDonnees("n", couper(resultat.vitesse));
    }
    if (traceC) {
      const cmax = Math.max(240, ...couper(resultat.couples).map((point) => point[1] + 10));
      traceC.definirPlage({ xMin: 0, xMax: fin, yMin: 0, yMax: cmax });
      traceC.definirDonnees("cm", couper(resultat.couples));
      traceC.definirDonnees("cr", couper(resultat.resistant));
    }
    if (!valeurs) return;
    const ec = (0.5 * p.J * MH.Ws * MH.Ws) / 1000;
    if (resultat.bloque) {
      valeurs.maj({ t95: NaN, nf: 0, e95: NaN, ec, cd: coupleMoteur(0, p.u / 100), etat: "ne démarre pas : couple de démarrage insuffisant" });
      return;
    }
    valeurs.maj({
      t95: resultat.t95,
      nf: resultat.nFinal,
      e95: resultat.e95 / 1000,
      ec,
      cd: coupleMoteur(0, p.u / 100),
      etat: resultat.t95 > 2 ? "démarrage long : vérifier l'échauffement" : "démarrage normal",
    });
  }

  const curseurs = api.sim.curseurs(
    "#e-dyn-curseurs",
    [
      { id: "u", libelle: "Tension pendant le démarrage", min: 60, max: 110, pas: 1, valeur: p.u, format: (v) => nombre(api, v, 0) + " % de U_n" },
      { id: "J", libelle: "Moment d'inertie total", min: 0.05, max: 2, pas: 0.05, valeur: p.J, format: (v) => nombre(api, v, 2) + " kg·m²" },
      { id: "type", libelle: "Type de charge", min: 0, max: 1, pas: 1, valeur: p.type, format: (v) => (v >= 0.5 ? "ventilateur, couple en n²" : "convoyeur, couple constant") },
      { id: "niveau", libelle: "Couple de charge à 1460 tr/min", min: 0, max: 200, pas: 5, valeur: p.niveau, format: (v) => nombre(api, v, 0) + " % de C_n" },
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

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-glissement",
      titre: "Glissement à partir de la vitesse de plaque",
      niveau: "fondamental",
      enonce:
        "<p>Un moteur asynchrone alimenté sous $50\\ \\mathrm{Hz}$ porte sur sa plaque la vitesse $960\\ \\mathrm{tr/min}$. Quel est son glissement " +
        "nominal, en pour cent ?</p>",
      valeur: 4,
      unite: "%",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Glissement $g_n$",
      etapes: [
        { texte: "Valeurs possibles de $n_s = 60f/p$ à $50\\ \\mathrm{Hz}$ : $3000$, $1500$, $1000$, $750\\ \\mathrm{tr/min}$. La valeur juste au-dessus de $960$ est $1000$ : $p = 3$, six pôles." },
        { texte: "$g_n = (1000 - 960)/1000 = 0{,}040$, soit $4{,}0\\ \\%$." },
        { texte: "Fréquence des courants du rotor : $f_r = 0{,}04 \\times 50 = 2{,}0\\ \\mathrm{Hz}$.", note: "Avec $n_s = 1500$ par erreur, on trouverait $36\\ \\%$ : un glissement aussi grand en charge nominale est impossible." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 172",
          dessinEtapes(["n_s possibles : 3000, 1500, 1000, 750 tr/min", "juste au-dessus de 960 : n_s = 1000, p = 3", "g = (1000 - 960) / 1000 = 4,0 %", "f_r = g f = 2,0 Hz"], 560),
          "Étapes révélées une à une : choix de la vitesse de synchronisme, glissement, fréquence rotorique."
        );
      },
    })
  );

  ressources.push(
    api.exercice.schema(cible, {
      id: "k-couplage",
      titre: "Choix du couplage dans la boîte à bornes",
      niveau: "fondamental",
      consigne: "Cliquez sur le montage qui convient.",
      enonce:
        "<p>Le moteur du compresseur porte la mention $400/690\\ \\mathrm{V}$. Il est raccordé à un réseau $230/400\\ \\mathrm{V}$. Lequel des deux " +
        "montages de barrettes faut-il réaliser ?</p>",
      viewBox: "0 0 540 230",
      dessin: dessinBornes(),
      zones: [
        { x: 24, y: 36, largeur: 232, hauteur: 152, etiquette: "montage A, barrette horizontale" },
        { x: 284, y: 36, largeur: 232, hauteur: 152, etiquette: "montage B, barrettes verticales", juste: true },
      ],
      etapes: [
        { texte: "La plus petite tension de la plaque, $400\\ \\mathrm{V}$, est celle que doit recevoir chaque enroulement." },
        { texte: "Le réseau a une tension composée de $400\\ \\mathrm{V}$ : chaque enroulement doit être branché entre deux phases, c'est le triangle, barrettes verticales $W_2$-$U_1$, $U_2$-$V_1$, $V_2$-$W_1$." },
        { texte: "En étoile, chaque enroulement ne recevrait que $400/\\sqrt{3} = 231\\ \\mathrm{V}$ : le couple, proportionnel au carré de la tension, tomberait au tiers.", note: "Ce moteur peut donc démarrer en étoile-triangle : le couplage étoile ne sert que pendant le lancement." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 540 260",
          dessinBornes() + ECRITS + texte(30, 244, "A : étoile, 231 V par enroulement") + texte(290, 244, "B : triangle, 400 V par enroulement") + "</g>",
          "Montage A, barrette commune : étoile, 231 V par enroulement, couple au tiers. Montage B, trois barrettes verticales : triangle, 400 V par enroulement, montage correct."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-couple",
      titre: "Couple nominal d'après la plaque",
      niveau: "intermédiaire",
      enonce:
        "<p>Une plaque indique $4\\ \\mathrm{kW}$, $230/400\\ \\mathrm{V}$, $8{,}6\\ \\mathrm{A}$ sous $400\\ \\mathrm{V}$, $\\cos\\varphi = 0{,}82$, " +
        "$1440\\ \\mathrm{tr/min}$, $50\\ \\mathrm{Hz}$. Quel est le couple utile nominal ?</p>",
      valeur: 4000 / ((TAU * 1440) / 60),
      unite: "N·m",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Couple $C_n$",
      etapes: [
        { texte: "La puissance de plaque est la puissance utile : $P_n = 4000\\ \\mathrm{W}$, à $n_n = 1440\\ \\mathrm{tr/min}$." },
        { texte: "$\\varOmega_n = 2\\pi \\times 1440/60 = 150{,}80\\ \\mathrm{rad/s}$." },
        { texte: "$C_n = 4000/150{,}80 = 26{,}53\\ \\mathrm{N \\cdot m}$." },
        { texte: "Contrôle : environ $6{,}6\\ \\mathrm{N \\cdot m}$ par kilowatt, valeur repère d'un moteur à quatre pôles ; $g_n = 4\\ \\%$, plausible pour $4\\ \\mathrm{kW}$.", note: "Le courant et le facteur de puissance ne servent pas ici ; ils donneraient $P_{abs} = \\sqrt{3} \\times 400 \\times 8{,}6 \\times 0{,}82 = 4{,}89\\ \\mathrm{kW}$ et $\\eta = 81{,}9\\ \\%$." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 172",
          dessinEtapes(["P_n = 4000 W, puissance utile", "Ω_n = 2π × 1440 / 60 = 150,80 rad/s", "C_n = P_n / Ω_n = 26,53 N·m", "contrôle : 6,6 N·m/kW à 4 pôles"], 560),
          "Étapes révélées une à une : puissance utile, vitesse en radians par seconde, couple, contrôle d'ordre de grandeur."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-bilan",
      titre: "Rendement par le bilan des puissances",
      niveau: "intermédiaire",
      enonce:
        "<p>Un moteur absorbe $34{,}0\\ \\mathrm{kW}$. Ses pertes du stator, Joule et fer, valent $1{,}40\\ \\mathrm{kW}$, son glissement $2{,}5\\ \\%$, " +
        "ses pertes mécaniques $0{,}35\\ \\mathrm{kW}$. Quel est son rendement, en pour cent ?</p>",
      valeur: (100 * ((34 - 1.4) * (1 - 0.025) - 0.35)) / 34,
      unite: "%",
      tolerance: 0.003,
      chiffres: 2,
      libelleChamp: "Rendement $\\eta$",
      etapes: [
        { texte: "Puissance transmise : $P_{tr} = 34{,}0 - 1{,}40 = 32{,}60\\ \\mathrm{kW}$." },
        { texte: "Pertes Joule du rotor : $p_{jr} = g\\,P_{tr} = 0{,}025 \\times 32{,}60 = 0{,}815\\ \\mathrm{kW}$ ; puissance mécanique $P_m = 31{,}785\\ \\mathrm{kW}$." },
        { texte: "Puissance utile : $P_u = 31{,}785 - 0{,}35 = 31{,}435\\ \\mathrm{kW}$." },
        { texte: "$\\eta = 31{,}435/34{,}0 = 92{,}46\\ \\%$.", note: "Erreur fréquente : appliquer $g$ à la puissance absorbée, soit $0{,}85\\ \\mathrm{kW}$ ; il s'applique à la puissance transmise." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 200",
          dessinBarres(
            [
              { nom: "P_abs", valeur: 34, max: 34, texte: "34,00 kW" },
              { nom: "P_tr", valeur: 32.6, max: 34, texte: "32,60 kW" },
              { nom: "P_m = (1-g) P_tr", valeur: 31.785, max: 34, texte: "31,79 kW" },
              { nom: "P_u", valeur: 31.435, max: 34, texte: "31,44 kW, η = 92,46 %" },
            ],
            { x0: 170, l: 250 }
          ),
          "Cascade révélée barre par barre : chaque prélèvement réduit la puissance, et le glissement s'applique à la puissance transmise."
        );
      },
    })
  );

  const gLin = MH.gn / 0.81;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-soustension",
      titre: "Sous-tension sur un convoyeur",
      niveau: "avancé",
      enonce:
        "<p>Le moteur de la section H, $1460\\ \\mathrm{tr/min}$, $C_{max}/C_n = 3{,}0$, entraîne un convoyeur qui demande en permanence son couple " +
        "nominal. Une chute de tension durable ramène la tension à $90\\ \\%$ de sa valeur nominale. Dans la zone normale, où le couple est " +
        "proportionnel au glissement, quelle est la nouvelle vitesse ? Que deviennent les pertes Joule du rotor et la marge de décrochage ?</p>",
      valeur: MH.ns * (1 - gLin),
      unite: "tr/min",
      tolerance: 0.003,
      chiffres: 1,
      libelleChamp: "Vitesse sous tension réduite",
      etapes: [
        { texte: "À glissement donné, le couple est proportionnel à $U^2$ ; en zone normale, $C \\approx k\\,U^2 g$. À couple constant, $g' = g_n (U_n/U')^2 = 0{,}02667/0{,}81 = 0{,}03292$." },
        { texte: "$n' = 1500 \\times (1 - 0{,}03292) = 1450{,}6\\ \\mathrm{tr/min}$, contre $1460$ : moins de $0{,}7\\ \\%$ de baisse." },
        { texte: "Même couple, même $\\varOmega_s$ : $P_{tr}$ est inchangée, et $p_{jr} = g\\,P_{tr}$ augmente dans le rapport $1/0{,}81 = 1{,}235$, soit $+23{,}5\\ \\%$, de $304$ à environ $376\\ \\mathrm{W}$." },
        { texte: "Couple maximal : $3{,}0 \\times 0{,}81 = 2{,}43\\ C_n$ ; le décrochage sous $C_n$ surviendrait pour $U/U_n &lt; 1/\\sqrt{3} = 0{,}577$.", note: "Le modèle complet de la section E donne $1449\\ \\mathrm{tr/min}$ et $+27\\ \\%$ de pertes rotoriques, car la zone normale n'est pas tout à fait linéaire : l'approximation suffit pour la vitesse. Le courant du stator augmente aussi, ce qui ajoute des pertes Joule au stator." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Zone normale : couple du moteur sous 100 % et 90 % de tension",
          xTitre: "vitesse",
          xUnite: "tr/min",
          yTitre: "couple",
          yUnite: "N·m",
          xMin: 1380,
          xMax: 1500,
          yMin: 0,
          yMax: 160,
          series: [
            { id: "u1", nom: "tension nominale", couleur: "serie-1", fonction: (n) => coupleMoteur(n, 1) },
            { id: "u09", nom: "90 % de la tension", couleur: "serie-4", fonction: (n) => coupleMoteur(n, 0.9) },
            { id: "cr", nom: "convoyeur, couple constant", couleur: "serie-5", fonction: () => MH.Cn + MH.Cf },
          ],
          surDessin({ c, repere, couleurs }) {
            const p1 = pointStable(1, 1, 0, 1);
            const p2 = pointStable(0.9, 1, 0, 1);
            for (const [point, libelle, dy] of [[p1, "100 % : 1460 tr/min", -12], [p2, "90 % : 1449 tr/min", 22]]) {
              if (!point) continue;
              pointTrace(c, repere, couleurs, point.n, point.C, "");
              c.save();
              c.fillStyle = couleurs.texte;
              c.font = POLICE;
              c.textAlign = "right";
              c.fillText(libelle, repere.versX(point.n) - 8, repere.versY(point.C) + dy);
              c.restore();
            }
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Diagnostic : le compresseur ronfle sans démarrer",
      niveau: "diagnostic",
      enonce:
        "<p>Après le remplacement des fusibles du départ, le moteur du compresseur, couplé en triangle, ronfle sans tourner quand le contacteur se " +
        "ferme ; le relais thermique déclenche au bout de quelques secondes. La pince donne environ $200\\ \\mathrm{A}$ dans deux conducteurs et " +
        "$0\\ \\mathrm{A}$ dans le troisième. Si l'on lance l'arbre à la main, avec les précautions d'usage, le moteur démarre dans un sens ou dans " +
        "l'autre. Quelles causes sont compatibles ?</p>",
      options: [
        { texte: "Un fusible défectueux ou mal enfoncé sur une phase du départ.", juste: true },
        { texte: "Une permutation de deux phases lors de l'intervention." },
        { texte: "Un pôle du contacteur KM3 qui ne ferme pas.", juste: true },
        { texte: "Un couplage étoile réalisé par erreur au lieu du triangle." },
      ],
      etapes: [
        { texte: "Un courant nul dans un conducteur et deux courants égaux et opposés : le moteur est alimenté par une seule tension composée, sur deux phases." },
        { texte: "Le champ n'est plus tournant mais pulsant : ses deux composantes tournant en sens opposés produisent des couples égaux à l'arrêt, d'où l'absence de démarrage et le démarrage dans le sens du lancement." },
        { texte: "Une permutation de deux phases ferait démarrer le moteur à l'envers, normalement ; un couplage étoile donnerait des courants équilibrés, réduits, et un démarrage lent.", note: "Le relais de contrôle de présence des phases KA doit interdire la fermeture de KM3 dans ce cas ; s'il ne l'a pas fait, il faut aussi vérifier son câblage." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 172",
          dessinEtapes(["I1 = -I2 ≈ 200 A, I3 = 0 : une seule tension U12", "champ pulsant = 2 champs tournant en sens opposés", "à l'arrêt : couples opposés égaux, pas de démarrage", "chercher la phase manquante : fusible, pôle de KM3"], 560),
          "Raisonnement révélé ligne par ligne : la signature des courants désigne une marche sur deux phases."
        );
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-synchronisme",
      titre: "Pourquoi le moteur n'atteint jamais le synchronisme",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi un moteur asynchrone fonctionnant en moteur ne peut pas atteindre par lui-même la vitesse de " +
        "synchronisme, et ce qui se passerait si une charge l'entraînait au-delà.</p>",
      motsCles: [["flux", "variation", "induction"], ["courant", "f.e.m", "force electromotrice", "fem"], ["couple"], ["generat", "negatif", "renvoie"]],
      minimum: 3,
      exemple: "Reliez la vitesse relative à la force électromotrice des barres, puis au couple.",
      etapes: [
        { texte: "Les courants du rotor sont induits : ils n'existent que si les barres voient le flux du champ varier, donc si elles se déplacent par rapport à lui." },
        { texte: "Au synchronisme, la vitesse relative est nulle : plus de force électromotrice, plus de courant, plus de couple. Les frottements ralentissent alors le rotor, qui glisse juste assez pour produire le couple qu'ils demandent." },
        { texte: "Entraîné au-delà, le rotor dépasse le champ : le glissement devient négatif, les courants et le couple changent de signe, la machine freine sa charge et renvoie de la puissance active au réseau, en générateur.", note: "Elle a toujours besoin du réseau pour sa puissance réactive magnétisante." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Couple au voisinage du synchronisme",
          xTitre: "vitesse",
          xUnite: "tr/min",
          yTitre: "couple",
          yUnite: "N·m",
          xMin: 1400,
          xMax: 1600,
          yMin: -160,
          yMax: 160,
          series: [{ id: "c", nom: "moteur de la section H", couleur: "serie-1", fonction: (n) => coupleMoteur(n, 1) }],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, MH.ns, "n_s : couple nul");
            ligneH(c, repere, couleurs, 0, "", false, [2, 3]);
            pointTrace(c, repere, couleurs, 1460, coupleMoteur(1460, 1), "moteur, g > 0");
            pointTrace(c, repere, couleurs, 1540, coupleMoteur(1540, 1), "générateur, g < 0");
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

/** Courbe couple-vitesse simplifiée, pour la question d'interprétation de schéma. */
function dessinCourbeQuiz(id) {
  const X = (n) => 60 + n * 0.28;
  const Y = (c) => 190 - c * 45;
  const points = [];
  for (let n = 0; n <= 1620; n += 10) points.push(X(n).toFixed(1) + " " + Y(coupleMoteur(n, 1) / MH.Cn).toFixed(1));
  return (
    "<defs>" + marqueur(id) + "</defs>" +
    TRAITS + ' stroke-width="1.5"><path d="M40 190H520" marker-end="url(#' + id + ')"/><path d="M60 250V20" marker-end="url(#' + id + ')"/></g>' +
    TRAITS + ' stroke-width="1" stroke-dasharray="3 4"><path d="M' + X(1500).toFixed(1) + ' 30V250"/></g>' +
    TRAITS + ' stroke-width="2.6"><path d="M' + points.join(" L") + '"/></g>' +
    ECRITS + texte(524, 194, "n") + texte(68, 26, "C") + texte(X(1500) - 18, 268, "n_s") + texte(X(0) - 4, 206, "0") + "</g>"
  );
}

const VISUELS_QUIZ = [
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["n_s = 60 f / p", "4 pôles : p = 2", "n_s = 60 × 60 / 2 = 1800 tr/min"], 540),
    legende: "Vitesse de synchronisme à 60 Hz pour un moteur à quatre pôles.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["permuter V et W : α_k → -α_k", "b ∝ cos(ωt + θ) au lieu de cos(ωt - θ)", "le champ, donc le moteur, tourne en sens inverse"], 540),
    legende: "Permuter deux phases inverse le sens du champ tournant.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["2 pôles : n_s = 3000 tr/min", "g = (3000 - 2940) / 3000", "g = 2,0 %"], 540),
    legende: "Glissement d'un moteur bipolaire.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["entrefer : forte réluctance, fort courant magnétisant", "à vide : courant presque entièrement réactif", "P faible, Q élevée : cos φ ≈ 0,1 à 0,2"], 540),
    legende: "Le courant magnétisant imposé par l'entrefer domine le courant à vide.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["p_jr = g P_tr", "p_jr = 0,03 × 20 000", "p_jr = 600 W"], 540),
    legende: "Les pertes Joule du rotor sont la fraction g de la puissance transmise.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["stable si dC_moteur/dn &lt; dC_charge/dn", "entre C_max et n_s : C chute avec n", "c'est la zone de fonctionnement normal"], 540),
    legende: "Zone stable : la partie descendante de la courbe, entre le couple maximal et le synchronisme.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["C_max = 3 E20² / (2 Ω_s X20)", "R2 n'y figure pas", "R2 fixe seulement g_m = R2 / X20"], 540),
    legende: "La résistance rotorique déplace le couple maximal sans changer sa valeur.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["C ∝ U² à glissement donné", "U = 0,9 U_n : C = 0,81 C", "le couple de démarrage baisse de 19 %"], 540),
    legende: "Effet d'une tension réduite sur le couple de démarrage.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["f_r = g f", "f_r = 0,04 × 50", "f_r = 2,0 Hz"], 540),
    legende: "Fréquence des courants rotoriques.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["enroulement : 230 V", "réseau 400 V composés : étoile, 400 / √3 = 231 V", "courant de ligne : valeur inscrite face à 400 V"], 540),
    legende: "Lecture d'une plaque 230/400 V sur un réseau 400 V.",
  },
];

function construireQuiz(racine, api) {
  const idCourbe = nouveauMarqueur("fl-l-cv");
  const X = (n) => 60 + n * 0.28;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Quelle est la vitesse de synchronisme d'un moteur à quatre pôles alimenté sous $60\\ \\mathrm{Hz}$ ?</p>",
        options: ["$1500\\ \\mathrm{tr/min}$", "$1800\\ \\mathrm{tr/min}$", "$3600\\ \\mathrm{tr/min}$", "$1750\\ \\mathrm{tr/min}$"],
        bonnes: [1],
        explication: "Quatre pôles, donc $p = 2$ ; $n_s = 60 \\times 60/2 = 1800\\ \\mathrm{tr/min}$. La valeur $1750$ est une vitesse de plaque typique, pas un synchronisme.",
        resume: "Vitesse de synchronisme à 60 Hz",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Permuter deux des trois phases d'alimentation inverse le sens de rotation d'un moteur asynchrone.</p>",
        reponse: true,
        explication: "La permutation inverse l'ordre des phases, donc le sens du champ tournant ; le rotor suit le champ.",
        resume: "Inversion du sens de rotation",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Un moteur bipolaire tourne à $2940\\ \\mathrm{tr/min}$ sur un réseau à $50\\ \\mathrm{Hz}$. Quel est son glissement, en pour cent ?</p>",
        valeur: 2,
        unite: "%",
        tolerance: 0.01,
        explication: "$n_s = 3000\\ \\mathrm{tr/min}$, $g = 60/3000 = 2{,}0\\ \\%$.",
        resume: "Glissement d'un moteur bipolaire",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi le facteur de puissance d'un moteur asynchrone à vide est-il très faible ?</p>",
        motsCles: [["magnetis", "reactif"], ["entrefer"], ["actif", "pertes", "faible", "peu"]],
        minimum: 2,
        explication:
          "À vide, le moteur ne fournit que ses pertes, donc peu de puissance active ; mais il absorbe toujours le courant magnétisant, important à cause de l'entrefer. Le courant est presque purement réactif.",
        resume: "Facteur de puissance à vide",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>La puissance transmise au rotor vaut $20\\ \\mathrm{kW}$ et le glissement $3\\ \\%$. Quelles sont les pertes Joule du rotor, en watts ?</p>",
        valeur: 600,
        unite: "W",
        tolerance: 0.01,
        explication: "$p_{jr} = g\\,P_{tr} = 0{,}03 \\times 20\\,000 = 600\\ \\mathrm{W}$.",
        resume: "Pertes Joule du rotor",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Sur cette courbe couple-vitesse, où se trouve la zone de fonctionnement stable en moteur, pour une charge à couple constant ?</p>",
        consigne: "Cliquez sur la zone correspondante.",
        viewBox: "0 0 540 280",
        dessin: dessinCourbeQuiz(idCourbe),
        zones: [
          { x: X(0) + 4, y: 30, largeur: X(1150) - X(0) - 8, hauteur: 150, etiquette: "de l'arrêt au couple maximal" },
          { x: X(1190), y: 30, largeur: X(1500) - X(1190), hauteur: 150, etiquette: "du couple maximal au synchronisme", juste: true },
          { x: X(1500) + 2, y: 150, largeur: X(1620) - X(1500), hauteur: 100, etiquette: "au-delà du synchronisme" },
        ],
        explication:
          "Entre le couple maximal et le synchronisme, le couple du moteur décroît quand la vitesse augmente : toute perturbation de vitesse est corrigée. À gauche du maximum, c'est l'inverse ; au-delà du synchronisme, la machine est génératrice.",
        resume: "Zone de fonctionnement stable",
      },
      {
        type: "vraiFaux",
        enonce: repere(6) + "<p>Dans le modèle de Kloss, augmenter la résistance du rotor augmente le couple maximal.</p>",
        reponse: false,
        explication: "$C_{max} = 3E_{20}^2/(2\\varOmega_s X_{20})$ ne dépend pas de $R_2$ ; seul le glissement critique $g_m = R_2/X_{20}$ augmente, ce qui augmente le couple de démarrage.",
        resume: "Résistance rotorique et couple maximal",
      },
      {
        type: "qcm",
        enonce: repere(7) + "<p>La tension au moteur tombe à $90\\ \\%$ de sa valeur nominale pendant le démarrage. Que devient le couple de démarrage ?</p>",
        options: ["Il est multiplié par $0{,}90$", "Il est multiplié par $0{,}81$", "Il est multiplié par $0{,}73$", "Il ne change pas, seul le courant baisse"],
        bonnes: [1],
        explication: "À glissement donné, le couple est proportionnel au carré de la tension : $0{,}9^2 = 0{,}81$.",
        resume: "Couple et tension",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Un moteur glisse de $4\\ \\%$ sur un réseau à $50\\ \\mathrm{Hz}$. Quelle est la fréquence des courants de son rotor, en hertz ?</p>",
        valeur: 2,
        unite: "Hz",
        tolerance: 0.01,
        explication: "$f_r = g f = 0{,}04 \\times 50 = 2{,}0\\ \\mathrm{Hz}$.",
        resume: "Fréquence rotorique",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Une plaque porte $230/400\\ \\mathrm{V}$ et $36{,}5/21{,}0\\ \\mathrm{A}$. Le moteur est raccordé à un réseau $230/400\\ \\mathrm{V}$. Quelles affirmations sont exactes ?</p>",
        options: [
          { texte: "Il faut le coupler en étoile.", juste: true },
          { texte: "Il faut le coupler en triangle." },
          { texte: "Le courant de ligne nominal est $21{,}0\\ \\mathrm{A}$.", juste: true },
          { texte: "Le courant de ligne nominal est $36{,}5\\ \\mathrm{A}$." },
        ],
        multiple: true,
        explication: "Chaque enroulement supporte $230\\ \\mathrm{V}$ : sur $400\\ \\mathrm{V}$ composés, il faut l'étoile ; le courant de ligne est celui de la colonne $400\\ \\mathrm{V}$.",
        resume: "Lecture d'une plaque",
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
      { categorie: "Champ tournant", question: "Comment trois bobines fixes créent-elles un champ tournant ?", reponse: "Décalées de $120^\\circ$ dans l'espace et parcourues par des courants décalés de $120^\\circ$ dans le temps, elles donnent $b = \\tfrac{3}{2}KI_m\\cos(\\omega t - \\theta)$ : amplitude constante, rotation à $\\omega$." },
      { categorie: "Synchronisme", question: "Que vaut la vitesse de synchronisme ?", reponse: "$n_s = 60f/p$ en tours par minute : $3000$, $1500$, $1000$, $750\\ \\mathrm{tr/min}$ à $50\\ \\mathrm{Hz}$ pour $p = 1$ à $4$." },
      { categorie: "Glissement", question: "Comment définit-on le glissement, et quel est son ordre de grandeur ?", reponse: "$g = (n_s - n)/n_s$ ; de $1$ à $5\\ \\%$ en charge nominale, quelques millièmes à vide." },
      { categorie: "Rotor", question: "Quelle est la fréquence des courants du rotor ?", reponse: "$f_r = g f$, de l'ordre du hertz en marche normale ; elle vaut $f$ à l'arrêt." },
      { categorie: "Bilan", question: "Que valent les pertes Joule du rotor ?", reponse: "$p_{jr} = g\\,P_{tr}$, avec $P_{tr} = C_{em}\\varOmega_s$ ; la puissance mécanique vaut $(1 - g)P_{tr}$.", rappel: "Moteur de la section H : 304 W pour 11 414 W transmis." },
      { categorie: "Couple", question: "Comment le couple dépend-il du glissement et de la tension ?", reponse: "Proportionnel à $g$ en zone normale, maximal pour $g_m = R_2/X_{20}$, puis décroissant ; proportionnel à $U^2$ à glissement donné." },
      { categorie: "Résistance rotorique", question: "Quel est l'effet d'une résistance rotorique plus grande ?", reponse: "Même couple maximal, atteint à plus grand glissement ; couple de démarrage plus élevé, mais vitesse en charge plus basse et pertes rotoriques plus fortes." },
      { categorie: "Plaque", question: "Comment choisir le couplage à partir de la plaque ?", reponse: "La plus petite tension est celle d'un enroulement : triangle si le réseau a cette tension composée, étoile s'il a la plus grande." },
      { categorie: "Défaut", question: "Que se passe-t-il si une phase manque ?", reponse: "Le champ devient pulsant : pas de démarrage, ronflement, courant élevé dans deux phases ; lancé, le moteur tourne mais surchauffe." },
      { categorie: "Démarrage", question: "Quelle énergie le rotor dissipe-t-il pendant un démarrage à vide ?", reponse: "$\\tfrac{1}{2}J\\varOmega_s^2$, autant que l'énergie cinétique finale, quelle que soit la courbe de couple ; davantage avec une charge." },
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
    dessin: dessinEtapes(["8 pôles : p = 4", "n_s = 60 × 50 / 4", "n_s = 750 tr/min"], 540),
    legende: "Vitesse de synchronisme d'un moteur à huit pôles.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["à n = n_s : pas de variation de flux dans les barres", "pas de courant, pas de couple", "les frottements imposent un léger glissement"], 540),
    legende: "À vide, le rotor glisse de quelques millièmes.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["zone normale : g proportionnel au couple", "C = C_n / 2 : g = 4 % / 2 = 2 %", "n = 1000 × (1 - 0,02) = 980 tr/min"], 540),
    legende: "Vitesse à demi-couple dans la zone linéaire.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["E = U - R I = 300 - 10 = 290 V", "Ω = E / KΦ = 290 / 1,5 = 193,3 rad/s", "n = 193,3 × 60 / 2π = 1846 tr/min"], 540),
    legende: "Vitesse d'un moteur à courant continu à excitation séparée.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["courant continu : le collecteur fixe la répartition", "asynchrone : les courants triphasés la font tourner", "et le rotor la reproduit par induction"], 540),
    legende: "Deux façons d'obtenir un couple de signe constant.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["Z vue du primaire = Z2 / m²", "= 2 / 0,5² = 2 / 0,25", "= 8 Ω"], 540),
    legende: "Transfert d'impédance à travers un transformateur idéal.",
  },
  {
    viewBox: "0 0 540 130",
    dessin: dessinEtapes(["démarrage : C_d ∝ U²", "cas le plus défavorable : tension minimale", "réseau bas + chute due au courant de démarrage"], 540),
    legende: "Une vérification de démarrage se fait au cas le plus défavorable.",
  },
];

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Quelle est la vitesse de synchronisme d'un moteur à huit pôles sur un réseau à $50\\ \\mathrm{Hz}$, en tours par minute ?</p>",
        valeur: 750,
        unite: "tr/min",
        tolerance: 0.005,
        explication: "$p = 4$, donc $n_s = 3000/4 = 750\\ \\mathrm{tr/min}$.",
        resume: "Synchronisme à huit pôles",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. À vide, le rotor d'un moteur asynchrone tourne exactement à la vitesse de synchronisme.</p>",
        reponse: false,
        explication: "Il glisse de quelques millièmes : sans glissement, aucun courant ni couple ne compenserait les frottements.",
        resume: "Glissement à vide",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Cette séance. Un moteur à six pôles tourne à $960\\ \\mathrm{tr/min}$ au couple nominal. En zone normale, à quelle vitesse tourne-t-il à la moitié du couple nominal ?</p>",
        valeur: 980,
        unite: "tr/min",
        tolerance: 0.002,
        explication: "$g_n = 4\\ \\%$ ; le glissement est proportionnel au couple : $2\\ \\%$, d'où $n = 980\\ \\mathrm{tr/min}$.",
        resume: "Vitesse à demi-couple",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours précédent. Un moteur à courant continu à excitation séparée, $K\\Phi = 1{,}5\\ \\mathrm{V \\cdot s/rad}$, $R = 0{,}5\\ \\mathrm{\\Omega}$, absorbe $20\\ \\mathrm{A}$ sous $300\\ \\mathrm{V}$. Quelle est sa vitesse, en tours par minute ?</p>",
        valeur: ((300 - 0.5 * 20) / 1.5) * (60 / TAU),
        unite: "tr/min",
        tolerance: 0.005,
        explication: "$E = 300 - 10 = 290\\ \\mathrm{V}$, $\\varOmega = 290/1{,}5 = 193{,}3\\ \\mathrm{rad/s}$, soit $1846\\ \\mathrm{tr/min}$.",
        resume: "Vitesse d'un moteur à courant continu",
      },
      {
        type: "qcm",
        enonce: repere(4) + "<p>Cours précédent. Dans la machine à courant continu, quel organe maintient la répartition des courants du rotor fixe dans l'espace, et qu'est-ce qui joue un rôle comparable dans le moteur asynchrone ?</p>",
        options: [
          "Le collecteur ; dans le moteur asynchrone, les courants triphasés du stator créent un champ qui tourne, et les courants induits du rotor le suivent",
          "Les balais seuls ; dans le moteur asynchrone, des aimants fixés au rotor",
          "L'inducteur ; dans le moteur asynchrone, un collecteur à bagues",
          "Les pôles de commutation ; dans le moteur asynchrone, le glissement",
        ],
        bonnes: [0],
        explication: "Le collecteur redresse mécaniquement les courants d'induit ; le moteur asynchrone n'en a pas besoin, puisque le réseau triphasé fait tourner le champ et que le rotor s'y adapte par induction.",
        resume: "Collecteur et champ tournant",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Transformateur idéal. Une impédance de $2\\ \\mathrm{\\Omega}$ est branchée au secondaire d'un transformateur idéal de rapport $m = N_2/N_1 = 0{,}5$. Quelle impédance voit-on depuis le primaire, en ohms ?</p>",
        valeur: 8,
        unite: "Ω",
        tolerance: 0.01,
        explication: "$Z_1 = Z_2/m^2 = 2/0{,}25 = 8\\ \\mathrm{\\Omega}$. Le même transfert ramènera le rotor au stator dans le schéma équivalent du moteur.",
        resume: "Impédance ramenée",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Cours Révision 1 et étude de cas continu. Pour vérifier qu'un moteur démarrera sa charge, quelle tension faut-il retenir ?</p>",
        options: [
          "La tension minimale du réseau, diminuée de la chute due au courant de démarrage",
          "La tension nominale de la plaque",
          "La tension maximale du réseau",
          "La moyenne des tensions minimale et maximale",
        ],
        bonnes: [0],
        explication: "Le couple de démarrage varie comme $U^2$ : le cas le plus défavorable est la tension la plus basse, à laquelle s'ajoute la chute de tension causée par le courant de démarrage lui-même.",
        resume: "Cas le plus défavorable",
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
    titre: "Où en suis-je sur le moteur asynchrone triphasé ?",
  });
  if (auto) ressources.push(auto);
}
