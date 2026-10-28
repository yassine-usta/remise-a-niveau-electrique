/* ==========================================================================
   cours/schema-equivalent-du-moteur-asynchrone/cours.js
   Schéma équivalent du moteur asynchrone : rotor ramené et découpage de
   R2'/g, phaseurs et cercle du courant, couple par Thévenin et transfert
   maximal de puissance, courbes de couple et de courant, performances selon
   la charge, et modèle du moteur du compresseur du site.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];
let compteurMarqueurs = 0;

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;

/* --------------------------------------------------------------------------
   Nombres complexes
   -------------------------------------------------------------------------- */

const cx = (re, im = 0) => ({ re, im });
const cAdd = (a, b) => cx(a.re + b.re, a.im + b.im);
const cSub = (a, b) => cx(a.re - b.re, a.im - b.im);
const cMul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cMod2 = (a) => a.re * a.re + a.im * a.im;
const cMod = (a) => Math.sqrt(cMod2(a));
const cArg = (a) => Math.atan2(a.im, a.re) / DEG;
function cInv(a) {
  const m = cMod2(a);
  return m > 0 ? cx(a.re / m, -a.im / m) : cx(Infinity, 0);
}
const cDiv = (a, b) => cMul(a, cInv(b));

/* --------------------------------------------------------------------------
   Moteurs étudiés : paramètres par phase de l'étoile équivalente
   -------------------------------------------------------------------------- */

const MOTEURS = {
  h: {
    nom: "moteur de la section H, 11 kW",
    R1: 0.31, X1: 1.45, R2: 0.3, X2: 1.45, Xm: 29.0, Rf: 330.0,
    pm: 110, Pn: 11000, In: 21.0, U: 400, ns: 1500, nn: 1460,
    kI: 7.0, kD: 2.3, kMax: 3.0,
  },
  comp: {
    nom: "moteur du compresseur, 18,5 kW",
    R1: 0.165, X1: 0.53, R2: 0.148, X2: 0.53, Xm: 16.2, Rf: 330.0,
    pm: 150, Pn: 18500, In: 33.6, U: 400, ns: 1500, nn: 1470,
    kI: 7.5, kD: 2.3, kMax: 2.9,
  },
};
for (const M of Object.values(MOTEURS)) {
  M.Ws = (TAU * M.ns) / 60;
  M.Wn = (TAU * M.nn) / 60;
  M.Cn = M.Pn / M.Wn;
  M.Cf = M.pm / M.Wn;
  M.gn = (M.ns - M.nn) / M.ns;
}
const MH = MOTEURS.h;

/** Point de fonctionnement du schéma en T au glissement g. Réglages : u, kR, kX, kXm. */
function point(M, g, reglages = {}) {
  const u = reglages.u != null ? reglages.u : 1;
  const R2 = M.R2 * (reglages.kR || 1);
  const X1 = M.X1 * (reglages.kX || 1);
  const X2 = M.X2 * (reglages.kX || 1);
  const Xm = M.Xm * (reglages.kXm || 1);
  const V1 = (u * M.U) / Math.sqrt(3);
  const Ym = cx(1 / M.Rf, -1 / Xm);
  const Y2 = Math.abs(g) < 1e-12 ? cx(0, 0) : cInv(cx(R2 / g, X2));
  const Zp = cInv(cAdd(Ym, Y2));
  const Z = cAdd(cx(M.R1, X1), Zp);
  const I1 = cDiv(cx(V1, 0), Z);
  const E = cSub(cx(V1, 0), cMul(cx(M.R1, X1), I1));
  const I2 = cMul(E, Y2);
  const Im = cMul(E, Ym);
  const I = cMod(I1);
  const P = 3 * V1 * I1.re;
  const Q = -3 * V1 * I1.im;
  const Ptr = Math.abs(g) < 1e-12 ? 0 : 3 * (R2 / g) * cMod2(I2);
  const pjr = g * Ptr;
  const Pm = (1 - g) * Ptr;
  const Pu = Pm - M.pm;
  return {
    g, n: M.ns * (1 - g), V1, Z, I1, E, I2, Im, I, P, Q,
    cos: I > 0 ? P / (3 * V1 * I) : 0,
    pjs: 3 * M.R1 * I * I,
    pfs: (3 * cMod2(E)) / M.Rf,
    Ptr, pjr, Pm, Pu,
    Cem: Ptr / M.Ws,
    eta: P > 0 ? Pu / P : NaN,
  };
}

function dichotomie(fonction, bas, haut, iterations = 70) {
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

/** Glissement de puissance mécanique maximale, borne de la zone utile en moteur. */
function glissementPmMax(M, reglages) {
  let meilleur = 1e-3;
  let max = -Infinity;
  for (let i = 0; i <= 240; i += 1) {
    const g = Math.pow(10, -4 + (3.7 * i) / 240);
    const pm = point(M, g, reglages).Pm;
    if (pm > max) {
      max = pm;
      meilleur = g;
    }
  }
  return meilleur;
}

/** Glissement donnant la puissance utile Pu, ou null si le moteur décroche. */
function glissementPourPu(M, Pu, reglages, gHaut) {
  const haut = gHaut || glissementPmMax(M, reglages);
  if (point(M, haut, reglages).Pu < Pu) return null;
  return dichotomie((g) => point(M, g, reglages).Pu - Pu, 1e-9, haut);
}

/** Équivalent de Thévenin vu du rotor ramené. */
function thevenin(M, reglages = {}) {
  const u = reglages.u != null ? reglages.u : 1;
  const X1 = M.X1 * (reglages.kX || 1);
  const Xm = M.Xm * (reglages.kXm || 1);
  const Z1 = cx(M.R1, X1);
  const Zm = cInv(cx(1 / M.Rf, -1 / Xm));
  const somme = cAdd(Z1, Zm);
  const Zth = cDiv(cMul(Z1, Zm), somme);
  const Vth = cMod(cDiv(cMul(cx((u * M.U) / Math.sqrt(3), 0), Zm), somme));
  return { Vth, Rth: Zth.re, Xth: Zth.im };
}

const TH = thevenin(MH);
const X_TOT = TH.Xth + MH.X2;
const R_OPT = Math.sqrt(TH.Rth * TH.Rth + X_TOT * X_TOT);

/** Puissance transmise en fonction de la résistance de charge R_L = R2'/g. */
function ptrDeRL(RL) {
  return (3 * TH.Vth * TH.Vth * RL) / ((TH.Rth + RL) * (TH.Rth + RL) + X_TOT * X_TOT);
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

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';

/** Bosses d'une réactance, horizontales ou verticales, à partir de (x, y). */
function bosses(x, y, n, r, vertical) {
  let d = "M" + x + " " + y;
  for (let i = 0; i < n; i += 1) d += vertical ? "a" + r + " " + r + " 0 0 1 0 " + 2 * r : "a" + r + " " + r + " 0 0 1 " + 2 * r + " 0";
  return '<path d="' + d + '"/>';
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

function pointTrace(c, repere, couleurs, x, y, libelle, creux) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  if (px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.fillStyle = couleurs.texte;
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.6;
  c.beginPath();
  c.arc(px, py, 4.5, 0, TAU);
  if (creux) c.stroke();
  else c.fill();
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

function hauteurEtapes(n) {
  return 30 + n * 22;
}

/**
 * Schéma en T compact, réutilisé par les exercices et le quiz.
 * Zones utiles : R1 (60-100, 38-62), branche magnétisante (165-235, 80-160),
 * X2' (255-305, 30-62), R2' (330-370, 38-62), charge (450-490, 76-164).
 */
function dessinT(id, avecValeurs, pourZones) {
  let d = "<defs>" + marqueur(id) + "</defs>";
  d += TRAITS + ' stroke-width="2">';
  d += '<path d="M24 50H60M100 50H120M160 50H260M300 50H330M370 50H470V80M470 160V200H24"/>';
  d += '<rect x="60" y="40" width="40" height="20" rx="3"/>';
  d += bosses(120, 50, 4, 5, false);
  d += '<path d="M200 50V70M185 70H215M185 70V90M185 150V170M215 70V95M215 135V170M185 170H215M200 170V200"/>';
  d += '<rect x="173" y="90" width="24" height="60" rx="3"/>';
  d += bosses(215, 95, 4, 5, true);
  d += bosses(260, 50, 4, 5, false);
  d += '<rect x="330" y="40" width="40" height="20" rx="3"/>';
  d += '<rect x="456" y="80" width="28" height="80" rx="3" fill="currentColor" fill-opacity="0.18"/>';
  d += "</g>";
  d += TRAITS + ' stroke-width="1.5"><circle cx="20" cy="50" r="4"/><circle cx="20" cy="200" r="4"/>';
  d += '<path d="M28 50H52" marker-end="url(#' + id + ')"/><path d="M8 186V64" marker-end="url(#' + id + ')"/></g>';
  /* Avec des zones cliquables, les étiquettes des zones remplacent celles des éléments. */
  d += ECRITS + texte(14, 40, "A") + texte(14, 222, "N") + texte(30, 42, "I1") + texte(126, 32, "jX1");
  if (!pourZones) {
    d += texte(70, 32, "R1") + texte(150, 126, "Rf") + texte(228, 126, "jXm") + texte(266, 32, "jX2'") + texte(338, 32, "R2'") +
      (avecValeurs ? texte(380, 120, "R2'(1-g)/g") : texte(392, 120, "charge"));
  }
  d += "</g>";
  return d;
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
  construireAnimDecoupage(racine, api);
  construireAnimCercle(racine, api);
  construireAnimTransfert(racine, api);
  construireSimCourbes(racine, api);
  construireSimCharge(racine, api);
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
    ["#d-transfo-figure svg", 1.5],
    ["#e-rotor-figure svg", 1.5],
    ["#e-schema-t-figure svg", 1.8],
    ["#e-thevenin-figure svg", 1.5],
    ["#e-approche-figure svg", 1.4],
    ["#e-essais-figure svg", 1.6],
    ["#f-schema-principal svg", 1.8],
    ["#h-donnees-figure svg", 1.6],
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
      id: "c-ramener",
      titre: "Résistance ramenée à travers un transformateur",
      niveau: "prérequis",
      enonce:
        "<p>Une résistance de $0{,}05\\ \\mathrm{\\Omega}$ est branchée au secondaire d'un transformateur idéal de rapport $m = N_2/N_1 = 0{,}4$. " +
        "Quelle résistance voit-on depuis le primaire ?</p>",
      valeur: 0.05 / 0.16,
      unite: "Ω",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Résistance ramenée $R'$",
      etapes: [
        { texte: "Une impédance secondaire est vue du primaire divisée par $m^2$ : $R' = R_2/m^2$." },
        { texte: "$m^2 = 0{,}16$, donc $R' = 0{,}05/0{,}16 = 0{,}3125\\ \\mathrm{\\Omega}$." },
        {
          texte: "Contrôle énergétique : le courant primaire vaut $m$ fois le courant secondaire, donc $R'\\,(mI_2)^2 = R_2 I_2^2$.",
          note: "Le rotor d'un moteur se ramène au stator exactement de cette façon : $R_2' = R_2/m^2$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 540 " + hauteurEtapes(3),
          dessinEtapes(["R' = R2 / m²", "m² = 0,4² = 0,16", "R' = 0,05 / 0,16 = 0,3125 Ω"], 540),
          "Calcul révélé ligne par ligne : la règle de transfert, le carré du rapport, le résultat."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-diviseur",
      titre: "Diviseur de tension complexe",
      niveau: "prérequis",
      enonce:
        "<p>Une source de $230{,}94\\ \\mathrm{V}$ alimente en série une impédance $0{,}31 + j1{,}45\\ \\mathrm{\\Omega}$ et une réactance $j29\\ \\mathrm{\\Omega}$. " +
        "Quel est le module de la tension aux bornes de la réactance $j29\\ \\mathrm{\\Omega}$ ?</p>",
      valeur: 230.94 * 29 / Math.hypot(0.31, 30.45),
      unite: "V",
      tolerance: 0.005,
      chiffres: 2,
      libelleChamp: "Tension $|\\underline{V}_{th}|$",
      etapes: [
        { texte: "Diviseur de tension en complexes : $\\underline{V} = 230{,}94 \\times \\dfrac{j29}{0{,}31 + j30{,}45}$." },
        { texte: "Module du dénominateur : $\\sqrt{0{,}31^2 + 30{,}45^2} = 30{,}452\\ \\mathrm{\\Omega}$." },
        {
          texte: "$|\\underline{V}| = 230{,}94 \\times 29/30{,}452 = 219{,}93\\ \\mathrm{V}$.",
          note: "C'est la tension de Thévenin vue du rotor ramené, si l'on néglige $R_f$ : la section E l'utilise pour le couple.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 " + hauteurEtapes(3),
          dessinEtapes(["V = 230,94 × j29 / (0,31 + j30,45)", "|0,31 + j30,45| = 30,452 Ω", "|V| = 230,94 × 29 / 30,452 = 219,93 V"], 560),
          "Étapes révélées une à une : diviseur complexe, module du dénominateur, résultat."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-pertes-rotor",
      titre: "Pertes Joule du rotor",
      niveau: "prérequis",
      enonce:
        "<p>La puissance transmise au rotor d'un moteur vaut $11\\,414\\ \\mathrm{W}$ et son glissement $2{,}67\\ \\%$. Quelles sont ses pertes " +
        "Joule rotoriques ?</p>",
      valeur: 0.0267 * 11414,
      unite: "W",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Pertes $p_{jr}$",
      etapes: [
        { texte: "Le cours précédent a établi $p_{jr} = g\\,P_{tr}$ par conservation de l'énergie." },
        { texte: "$p_{jr} = 0{,}0267 \\times 11\\,414 = 304{,}8\\ \\mathrm{W}$." },
        { texte: "La puissance mécanique vaut le reste, $(1 - g)P_{tr} = 11\\,109\\ \\mathrm{W}$.", note: "Le schéma équivalent retrouvera ce partage par le découpage de $R_2'/g$." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 540 " + hauteurEtapes(3),
          dessinEtapes(["p_jr = g P_tr", "p_jr = 0,0267 × 11 414", "p_jr = 304,8 W ; P_m = 11 109 W"], 540),
          "Calcul révélé ligne par ligne : la loi de partage, l'application numérique, le reste mécanique."
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   Synchronisation d'une poignée, d'un curseur et d'un lecteur
   -------------------------------------------------------------------------- */

/**
 * Relie les trois commandes d'une même grandeur. versCommande et
 * depuisLecteur convertissent entre la valeur affichée et celle du lecteur.
 */
function synchroniseur(dessiner, options = {}) {
  const etat = { poignee: null, curseurs: null, lecteur: null, idCurseur: options.idCurseur, verrou: false };
  const versLecteur = options.versLecteur || ((v) => v);
  etat.appliquer = (valeur, source) => {
    if (etat.verrou) return;
    etat.verrou = true;
    dessiner(valeur);
    if (source !== "poignee" && etat.poignee) etat.poignee.set(valeur, false);
    if (source !== "curseur" && etat.curseurs) etat.curseurs.definir(etat.idCurseur, valeur);
    if (source !== "lecteur" && etat.lecteur) etat.lecteur.suivre(versLecteur(valeur));
    etat.verrou = false;
  };
  return etat;
}

function formatGlissement(api, lg) {
  const g = Math.pow(10, lg);
  return g >= 0.1 ? nombre(api, g, 2) : g >= 0.01 ? nombre(api, g * 100, 2) + " %" : nombre(api, g * 100, 3) + " %";
}

/* --------------------------------------------------------------------------
   E. Animation : le rotor ramené, de l'arrêt au synchronisme
   -------------------------------------------------------------------------- */

function construireAnimDecoupage(racine, api) {
  const conteneur = racine.querySelector("#e-decoupage");
  if (!conteneur) return;

  const id = nouveauMarqueur("fl-e-dec");
  const hach = nouveauMarqueur("hach-e-dec");
  const echelle = { x0: 70, x1: 670, y: 372 };
  const xDeLg = (lg) => echelle.x0 + ((lg + 3) / 3) * (echelle.x1 - echelle.x0);
  const barre = { x0: 60, largeur: 620, max: 25000, y: 296 };

  const svg = svgEl("svg", {
    viewBox: "0 0 740 410",
    role: "img",
    "aria-label": "Schéma en T animé du moteur de 11 kilowatts : courants I1, Im et I2 prime dont l'épaisseur suit le glissement, résistance de charge, et barre de partage de la puissance transmise entre pertes Joule du rotor et puissance mécanique",
  });
  const defs = svgEl("defs");
  defs.innerHTML =
    marqueur(id) +
    '<pattern id="' + hach + '" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<path d="M0 0V7" stroke="currentColor" stroke-width="2.4"/></pattern>';

  let fixe =
    TRAITS + ' stroke-width="2">' +
    '<path d="M34 70H80M130 70H150M210 70H420M480 70H510M560 70H640V110M640 210V250H34"/>' +
    '<rect x="80" y="58" width="50" height="24" rx="3"/>' + bosses(150, 70, 4, 7.5, false) + bosses(420, 70, 4, 7.5, false) +
    '<rect x="510" y="58" width="50" height="24" rx="3"/>' +
    '<rect x="626" y="110" width="28" height="100" rx="3" fill="currentColor" fill-opacity="0.18"/>' +
    '<path d="M300 70V100M272 100H328M272 100V130M272 190V220M328 100V130M328 190V220M272 220H328M300 220V250"/>' +
    '<rect x="260" y="130" width="24" height="60" rx="3"/>' + bosses(328, 130, 4, 7.5, true) +
    "</g>" +
    TRAITS + ' stroke-width="1.5"><circle cx="30" cy="70" r="4"/><circle cx="30" cy="250" r="4"/></g>' +
    TRAITS + ' stroke-width="1.4"><path d="M' + echelle.x0 + " " + echelle.y + "H" + echelle.x1 + '"/>';
  for (let lg = -3; lg <= 0; lg += 1) fixe += '<path d="M' + xDeLg(lg).toFixed(1) + " " + (echelle.y - 7) + "V" + (echelle.y + 7) + '"/>';
  for (let lg = -3; lg < 0; lg += 1) {
    for (let k = 2; k <= 9; k += 1) {
      const x = xDeLg(lg + Math.log10(k));
      fixe += '<path d="M' + x.toFixed(1) + " " + (echelle.y - 3) + "V" + (echelle.y + 3) + '" opacity="0.6"/>';
    }
  }
  fixe += "</g>";
  const xn = xDeLg(Math.log10(MH.gn));
  const xm = xDeLg(Math.log10(MH.R2 / R_OPT));
  fixe +=
    TRAITS + ' stroke-width="1.2" stroke-dasharray="3 3"><path d="M' + xn.toFixed(1) + " " + (echelle.y - 12) + "V" + echelle.y +
    "M" + xm.toFixed(1) + " " + (echelle.y - 12) + "V" + echelle.y + '"/></g>' +
    ECRITS +
    texte(20, 60, "A") + texte(20, 270, "N") + texte(92, 50, "R1") + texte(166, 50, "jX1") + texte(238, 166, "Rf") +
    texte(342, 166, "jXm") + texte(436, 50, "jX2'") + texte(524, 50, "R2'") +
    texte(echelle.x0 - 16, echelle.y + 24, "0,001") + texte(xDeLg(-2) - 14, echelle.y + 24, "0,01") +
    texte(xDeLg(-1) - 10, echelle.y + 24, "0,1") + texte(echelle.x1 - 4, echelle.y + 24, "1") +
    texte(xn - 8, echelle.y - 16, "g_n") + texte(xm - 10, echelle.y - 16, "g_m") +
    texte(echelle.x1 + 12, echelle.y + 4, "g") +
    texte(barre.x0, barre.y - 8, "P_tr à l'échelle, 25 kW = pleine largeur ; hachures : p_jr = g P_tr ; plein : P_m") +
    "</g>" +
    TRAITS + ' stroke-width="1.2"><rect x="' + barre.x0 + '" y="' + barre.y + '" width="' + barre.largeur + '" height="24" rx="3" stroke-dasharray="4 4" opacity="0.6"/></g>';
  const groupeFixe = svgEl("g");
  groupeFixe.innerHTML = fixe;

  const fleches = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round" });
  const tension = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.5, "stroke-dasharray": "6 4" });
  tension.innerHTML = '<path d="M380 236V86" marker-end="url(#' + id + ')"/>';
  const rects = svgEl("g", { stroke: "currentColor", "stroke-width": 1.2 });
  const rectPjr = svgEl("rect", { x: barre.x0, y: barre.y, width: 1, height: 24, fill: "url(#" + hach + ")" });
  const rectPm = svgEl("rect", { x: barre.x0, y: barre.y, width: 1, height: 24, fill: "currentColor", "fill-opacity": 0.35 });
  rects.append(rectPjr, rectPm);
  const ecrits = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });

  svg.append(defs, groupeFixe, rects, fleches, tension, ecrits);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-decoupage-valeurs", [
    { id: "g", libelle: "Glissement", format: (v) => nombre(api, v * 100, 3) + " %" },
    { id: "n", libelle: "Vitesse", unite: "tr/min", decimales: 0 },
    { id: "I1", libelle: "Courant absorbé I1", unite: "A", decimales: 2 },
    { id: "Im", libelle: "Courant magnétisant Im", unite: "A", decimales: 2 },
    { id: "I2", libelle: "Courant rotorique ramené I2'", unite: "A", decimales: 2 },
    { id: "cos", libelle: "Facteur de puissance", decimales: 3 },
    { id: "Ptr", libelle: "Puissance transmise", unite: "W", decimales: 0 },
    { id: "pjr", libelle: "Pertes Joule du rotor", unite: "W", decimales: 0 },
    { id: "Pm", libelle: "Puissance mécanique", unite: "W", decimales: 0 },
    { id: "Cem", libelle: "Couple électromagnétique", unite: "N·m", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const epaisseur = (i) => (1.4 + 6 * Math.min(1, i / 80)).toFixed(2);

  function dessiner(lg) {
    const g = Math.pow(10, lg);
    const p = point(MH, g);
    const I2 = cMod(p.I2);
    const Im = cMod(p.Im);
    fleches.innerHTML =
      '<path d="M36 70H74" stroke-width="' + epaisseur(p.I) + '" marker-end="url(#' + id + ')"/>' +
      '<path d="M300 76V98" stroke-width="' + epaisseur(Im) + '" marker-end="url(#' + id + ')"/>' +
      '<path d="M334 70H396" stroke-width="' + epaisseur(I2) + '" marker-end="url(#' + id + ')"/>';
    const charge = (MH.R2 * (1 - g)) / g;
    ecrits.innerHTML =
      texte(34, 30, "I1 = " + nombre(api, p.I, 2) + " A") +
      texte(212, 94, "Im = " + nombre(api, Im, 2) + " A") +
      texte(334, 46, "I2' = " + nombre(api, I2, 2) + " A") +
      texte(386, 160, "E1 = " + nombre(api, cMod(p.E), 1) + " V") +
      texte(516, 146, "R2'(1-g)/g") +
      texte(516, 164, "= " + nombre(api, charge, charge < 10 ? 3 : charge < 100 ? 2 : 0) + " Ω") +
      texte(barre.x0, barre.y + 40, "p_jr = " + nombre(api, p.pjr, 0) + " W") +
      texte(barre.x0 + 250, barre.y + 40, "P_m = " + nombre(api, p.Pm, 0) + " W") +
      texte(barre.x0 + 450, barre.y + 40, "P_tr = " + nombre(api, p.Ptr, 0) + " W");
    const k = barre.largeur / barre.max;
    rectPjr.setAttribute("width", Math.max(0.5, p.pjr * k).toFixed(1));
    rectPm.setAttribute("x", (barre.x0 + p.pjr * k).toFixed(1));
    rectPm.setAttribute("width", Math.max(0.5, p.Pm * k).toFixed(1));
    if (valeurs) valeurs.maj({ g, n: p.n, I1: p.I, Im, I2, cos: p.cos, Ptr: p.Ptr, pjr: p.pjr, Pm: p.Pm, Cem: p.Cem });
  }

  const lgDepart = Math.log10(MH.gn);
  const synchro = synchroniseur(dessiner, { idCurseur: "lg", versLecteur: (v) => -v });

  synchro.curseurs = api.sim.curseurs(
    "#e-decoupage-curseurs",
    [{ id: "lg", libelle: "Glissement g, échelle logarithmique", min: -3, max: 0, pas: 0.01, valeur: lgDepart, format: (v) => formatGlissement(api, v) }],
    (lues) => synchro.appliquer(lues.lg, "curseur")
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: echelle.x0, y: echelle.y },
    a: { x: echelle.x1, y: echelle.y },
    min: -3,
    max: 0,
    pas: 0.01,
    valeur: lgDepart,
    libelle: "Glissement sur l'échelle logarithmique",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  synchro.lecteur = api.sim.lecteur("#e-decoupage-lecteur", {
    de: 0,
    a: 3,
    duree: 9,
    boucle: false,
    auto: false,
    libelle: "Démarrage : de l'arrêt vers le synchronisme",
    rappel: (t) => synchro.appliquer(-t, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);

  synchro.appliquer(lgDepart, null);
}

/* --------------------------------------------------------------------------
   E. Animation : phaseurs du schéma et cercle du courant
   -------------------------------------------------------------------------- */

const LG_MIN_CERCLE = -3.7;

function construireAnimCercle(racine, api) {
  const conteneur = racine.querySelector("#e-cercle");
  if (!conteneur) return;

  /* V1 verticale vers le haut, retards comptés vers la droite. */
  const O = { x: 70, y: 400 };
  const kI = 6.5;
  const kV = 1.5;
  const id = nouveauMarqueur("fl-e-cer");
  const versPoint = (z, k) => ({ x: O.x - k * z.im, y: O.y - k * z.re });
  const lieu = (lg) => versPoint(point(MH, Math.pow(10, lg)).I1, kI);

  const svg = svgEl("svg", {
    viewBox: "0 0 740 440",
    role: "img",
    "aria-label": "Plan de Fresnel du moteur de 11 kilowatts : tension V1 verticale, force électromotrice E1, courants I1, Im et I2 prime, et lieu en arc de cercle de l'extrémité de I1 quand le glissement varie",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(id);

  /* Lieu, repères et droite du meilleur facteur de puissance. */
  const pts = [];
  for (let i = 0; i <= 300; i += 1) {
    const p = lieu(LG_MIN_CERCLE + (-LG_MIN_CERCLE * i) / 300);
    pts.push(p.x.toFixed(1) + "," + p.y.toFixed(1));
  }
  let gCos = MH.gn;
  let cosMax = 0;
  for (let i = 0; i <= 600; i += 1) {
    const g = Math.pow(10, -3 + (3 * i) / 600);
    const c = point(MH, g).cos;
    if (c > cosMax) {
      cosMax = c;
      gCos = g;
    }
  }
  const pCos = lieu(Math.log10(gCos));
  const fin = { x: O.x + (pCos.x - O.x) * 1.35, y: O.y + (pCos.y - O.y) * 1.35 };
  const repereLieu = (g, libelle, dx, dy) => {
    const p = lieu(Math.log10(g));
    return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      ECRITS + texte(p.x + dx, p.y + dy, libelle) + "</g>";
  };
  const fond = svgEl("g");
  fond.innerHTML =
    TRAITS + ' stroke-width="1.1" opacity="0.6"><path d="M40 ' + O.y + "H724M" + O.x + " 430V24" + '"/></g>' +
    '<polyline points="' + pts.join(" ") + '" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="2 5"/>' +
    TRAITS + ' stroke-width="1.1" stroke-dasharray="7 5" opacity="0.8"><path d="M' + O.x + " " + O.y + "L" + fin.x.toFixed(1) + " " + fin.y.toFixed(1) + '"/></g>' +
    repereLieu(MH.gn, "nominal", 12, 18) + repereLieu(MH.R2 / R_OPT, "couple maximal", -40, -12) + repereLieu(1, "arrêt, g = 1", -36, -14) +
    ECRITS + texte(fin.x + 6, fin.y, "cos φ max") + texte(500, 40, "courants : 10 A = 65 px") + texte(500, 58, "tensions : 100 V = 150 px") +
    texte(672, 422, "retard") + "</g>";

  const dynamique = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, dynamique, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-cercle-valeurs", [
    { id: "g", libelle: "Glissement", format: (v) => nombre(api, v * 100, 3) + " %" },
    { id: "I1", libelle: "Courant I1", unite: "A", decimales: 2 },
    { id: "phi", libelle: "Déphasage φ", unite: "°", decimales: 1 },
    { id: "cos", libelle: "Facteur de puissance", decimales: 3 },
    { id: "I2", libelle: "Courant I2'", unite: "A", decimales: 2 },
    { id: "Im", libelle: "Courant Im", unite: "A", decimales: 2 },
    { id: "E", libelle: "Force électromotrice E1", unite: "V", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const segment = (a, b, largeur, tirets) =>
    '<path d="M' + a.x.toFixed(1) + " " + a.y.toFixed(1) + "L" + b.x.toFixed(1) + " " + b.y.toFixed(1) + '" stroke-width="' + largeur + '"' +
    (tirets ? ' stroke-dasharray="' + tirets + '"' : "") + (Math.hypot(b.x - a.x, b.y - a.y) > 8 ? ' marker-end="url(#' + id + ')"' : "") + "/>";

  function dessiner(lg) {
    const g = Math.pow(10, lg);
    const p = point(MH, g);
    const v1 = versPoint(cx(p.V1, 0), kV);
    const e1 = versPoint(p.E, kV);
    const i1 = versPoint(p.I1, kI);
    const im = versPoint(p.Im, kI);
    const phi = -cArg(p.I1);
    const rArc = 46;
    const arcFin = { x: O.x + rArc * Math.sin(phi * DEG), y: O.y - rArc * Math.cos(phi * DEG) };
    dynamique.innerHTML =
      segment(O, v1, 1.5) + segment(O, e1, 1.6, "7 4") + segment(O, i1, 3.4) + segment(O, im, 2.6) + segment(im, i1, 2.6) +
      '<path d="M' + O.x + " " + (O.y - rArc) + "A" + rArc + " " + rArc + " 0 0 1 " + arcFin.x.toFixed(1) + " " + arcFin.y.toFixed(1) + '" stroke-width="1.2"/>';
    const milieu = { x: (im.x + i1.x) / 2, y: (im.y + i1.y) / 2 };
    libelles.innerHTML =
      texte(v1.x - 26, v1.y + 4, "V1") + texte(e1.x + 8, e1.y + 6, "E1") + texte(i1.x - 28, i1.y - 6, "I1") +
      texte(im.x - 4, im.y + 20, "Im") + texte(milieu.x + 8, milieu.y + 4, "I2'") +
      texte(O.x + 8, O.y - rArc - 6, "φ");
    if (valeurs) valeurs.maj({ g, I1: p.I, phi, cos: p.cos, I2: cMod(p.I2), Im: cMod(p.Im), E: cMod(p.E) });
  }

  const lgDepart = Math.log10(MH.gn);
  const synchro = synchroniseur(dessiner, { idCurseur: "lg", versLecteur: (v) => -v });

  synchro.curseurs = api.sim.curseurs(
    "#e-cercle-curseurs",
    [{ id: "lg", libelle: "Glissement g, échelle logarithmique", min: LG_MIN_CERCLE, max: 0, pas: 0.01, valeur: lgDepart, format: (v) => formatGlissement(api, v) }],
    (lues) => synchro.appliquer(lues.lg, "curseur")
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "courbe",
    courbe: (t) => lieu(LG_MIN_CERCLE + -LG_MIN_CERCLE * t),
    echantillons: 400,
    min: LG_MIN_CERCLE,
    max: 0,
    pas: 0.01,
    valeur: lgDepart,
    libelle: "Extrémité du courant I1 sur son lieu",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  synchro.lecteur = api.sim.lecteur("#e-cercle-lecteur", {
    de: 0,
    a: -LG_MIN_CERCLE,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Parcours du lieu, de l'arrêt vers le synchronisme",
    rappel: (t) => synchro.appliquer(-t, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);

  synchro.appliquer(lgDepart, null);
}

/* --------------------------------------------------------------------------
   E. Animation : le couple maximal est un transfert maximal de puissance
   -------------------------------------------------------------------------- */

function construireAnimTransfert(racine, api) {
  const conteneur = racine.querySelector("#e-transfert");
  if (!conteneur) return;

  const zone = { x0: 90, x1: 680, yHaut: 70, yBas: 330 };
  const pMax = 25000;
  const X = (lr) => zone.x0 + ((lr + 1) / 4) * (zone.x1 - zone.x0);
  const Y = (p) => zone.yBas - (p / pMax) * (zone.yBas - zone.yHaut);
  const courbe = (t) => {
    const lr = -1 + 4 * t;
    return { x: X(lr), y: Y(ptrDeRL(Math.pow(10, lr))) };
  };
  let kR = 1;
  const id = nouveauMarqueur("fl-e-tr");

  const svg = svgEl("svg", {
    viewBox: "0 0 740 400",
    role: "img",
    "aria-label": "Puissance transmise au rotor et couple en fonction de la résistance de charge R2 prime sur g, en échelle logarithmique, avec le maximum pour R_L égale au module de l'impédance de Thévenin augmentée de X2 prime",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(id);
  const pts = [];
  for (let i = 0; i <= 320; i += 1) {
    const p = courbe(i / 320);
    pts.push(p.x.toFixed(1) + "," + p.y.toFixed(1));
  }
  let axes =
    TRAITS + ' stroke-width="1.4"><path d="M' + zone.x0 + " " + (zone.yBas + 10) + "V" + (zone.yHaut - 18) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + (zone.x0 - 10) + " " + zone.yBas + "H" + (zone.x1 + 22) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + zone.x1 + " " + zone.yBas + "V" + zone.yHaut + '" opacity="0.5"/>';
  let ecrits = "";
  for (let lr = -1; lr <= 3; lr += 1) {
    axes += '<path d="M' + X(lr).toFixed(1) + " " + zone.yBas + "v6" + '"/>';
    ecrits += texte(X(lr) - 12, zone.yBas + 22, ["0,1", "1", "10", "100", "1000"][lr + 1]);
  }
  for (let p = 0; p <= 25000; p += 5000) {
    axes += '<path d="M' + zone.x0 + " " + Y(p).toFixed(1) + "h-6" + '"/>';
    ecrits += texte(zone.x0 - 40, Y(p) + 4, String(p / 1000));
  }
  for (let c = 0; c <= 150; c += 50) {
    const y = Y(c * MH.Ws);
    axes += '<path d="M' + zone.x1 + " " + y.toFixed(1) + "h6" + '"/>';
    ecrits += texte(zone.x1 + 10, y + 4, String(c));
  }
  axes += "</g>";
  const xOpt = X(Math.log10(R_OPT));
  const xNom = X(Math.log10(MH.R2 / MH.gn));
  const fond = svgEl("g");
  fond.innerHTML =
    axes +
    TRAITS + ' stroke-width="1.2" stroke-dasharray="7 5"><path d="M' + xOpt.toFixed(1) + " " + zone.yBas + "V" + (zone.yHaut - 6) + '"/></g>' +
    TRAITS + ' stroke-width="1.2" stroke-dasharray="2 4"><path d="M' + xNom.toFixed(1) + " " + zone.yBas + "V" + (zone.yHaut + 20) + '"/></g>' +
    '<polyline points="' + pts.join(" ") + '" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>' +
    ECRITS + ecrits +
    texte(zone.x0 - 52, zone.yHaut - 24, "P_tr (kW)") + texte(zone.x1 - 20, zone.yHaut - 24, "C_em (N·m)") +
    texte(zone.x1 - 60, zone.yBas + 42, "R_L = R2'/g (Ω)") +
    texte(xOpt + 6, zone.yHaut + 4, "R_L = 2,85 Ω : maximum") + texte(xNom + 6, zone.yHaut + 34, "point nominal") +
    "</g>";
  const mobile = svgEl("g", { fill: "none", stroke: "currentColor" });
  const ecritsMobiles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, mobile, ecritsMobiles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-transfert-valeurs", [
    { id: "RL", libelle: "Résistance de charge R_L", unite: "Ω", decimales: 3 },
    { id: "g", libelle: "Glissement correspondant", format: (v) => (v > 1.0001 ? "au-delà de l'arrêt" : nombre(api, v * 100, 2) + " %") },
    { id: "n", libelle: "Vitesse", format: (v) => (Number.isFinite(v) ? nombre(api, v, 0) + " tr/min" : "sans objet") },
    { id: "Ptr", libelle: "Puissance transmise", unite: "W", decimales: 0 },
    { id: "C", libelle: "Couple électromagnétique", unite: "N·m", decimales: 1 },
    { id: "zone", libelle: "Zone", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const lrDepart = Math.log10(MH.R2 / MH.gn);
  let lrCourant = lrDepart;

  function dessinerEchelle() {
    const r2 = MH.R2 * kR;
    let html = '<path d="M' + zone.x0 + " " + (zone.yHaut - 40) + "H" + zone.x1 + '" stroke-width="1.2"/>';
    let ecr = texte(zone.x0, zone.yHaut - 50, "glissement pour R2' = " + nombre(api, r2, 3) + " Ω");
    for (const g of [1, 0.1, 0.01, 0.001]) {
      const lr = Math.log10(r2 / g);
      if (lr < -1 || lr > 3) continue;
      const x = X(lr);
      html += '<path d="M' + x.toFixed(1) + " " + (zone.yHaut - 46) + "v12" + '" stroke-width="1.2"/>';
      ecr += texte(x - 12, zone.yHaut - 24, String(g).replace(".", ","));
    }
    const x1 = X(Math.log10(r2));
    html += '<path d="M' + x1.toFixed(1) + " " + zone.yBas + "V" + (zone.yHaut + 50) + '" stroke-width="1.2" stroke-dasharray="2 4"/>';
    ecr += texte(x1 + 6, zone.yHaut + 64, "g = 1");
    return { html, ecr };
  }

  function dessiner(lr) {
    lrCourant = lr;
    const RL = Math.pow(10, lr);
    const ptr = ptrDeRL(RL);
    const echelleG = dessinerEchelle();
    const x = X(lr);
    const y = Y(ptr);
    mobile.innerHTML =
      echelleG.html + '<path d="M' + x.toFixed(1) + " " + y.toFixed(1) + "V" + zone.yBas + "M" + x.toFixed(1) + " " + y.toFixed(1) + "H" + zone.x0 + '" stroke-width="1" stroke-dasharray="3 3"/>';
    ecritsMobiles.innerHTML = echelleG.ecr;
    const g = (MH.R2 * kR) / RL;
    if (valeurs) {
      valeurs.maj({
        RL,
        g,
        n: g <= 1 ? MH.ns * (1 - g) : NaN,
        Ptr: ptr,
        C: ptr / MH.Ws,
        zone: g > 1 ? "freinage, rotor entraîné à l'envers" : RL > R_OPT ? "stable : entre le couple maximal et le synchronisme" : "instable avec une charge à couple constant",
      });
    }
  }

  const synchro = synchroniseur(dessiner, { idCurseur: "lr", versLecteur: (v) => v });

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "courbe",
    courbe,
    echantillons: 400,
    min: -1,
    max: 3,
    pas: 0.01,
    valeur: lrCourant,
    libelle: "Point de fonctionnement sur la courbe de puissance transmise",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  synchro.curseurs = api.sim.curseurs(
    "#e-transfert-curseurs",
    [
      { id: "lr", libelle: "Résistance de charge R_L, échelle logarithmique", min: -1, max: 3, pas: 0.01, valeur: lrCourant, format: (v) => nombre(api, Math.pow(10, v), Math.pow(10, v) < 10 ? 3 : 1) + " Ω" },
      { id: "kR", libelle: "Résistance rotorique R2'", min: 0.5, max: 4, pas: 0.25, valeur: 1, format: (v) => "× " + nombre(api, v, 2) },
    ],
    (lues) => {
      if (lues.kR !== kR) {
        kR = lues.kR;
        dessiner(lrCourant);
      }
      if (Math.abs(lues.lr - lrCourant) > 1e-9) synchro.appliquer(lues.lr, "curseur");
    }
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);

  synchro.lecteur = api.sim.lecteur("#e-transfert-lecteur", {
    de: -1,
    a: 3,
    duree: 9,
    boucle: false,
    auto: false,
    libelle: "Balayage de R_L de gauche à droite",
    rappel: (v) => synchro.appliquer(v, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);

  synchro.appliquer(lrDepart, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : courbes de couple, de courant et de facteur de puissance
   -------------------------------------------------------------------------- */

/** Couple résistant du ventilateur : frottements plus couple nominal à 1460 tr/min, en n². */
function coupleVentilateur(n) {
  return MH.Cf + MH.Cn * Math.pow(Math.max(0, n) / MH.nn, 2);
}

/** Point stable sur le ventilateur : premier croisement en partant du synchronisme. */
function pointVentilateur(reglages) {
  const ecart = (g) => point(MH, g, reglages).Cem - coupleVentilateur(MH.ns * (1 - g));
  let precedent = 1e-6;
  let fPrecedent = ecart(precedent);
  for (let i = 1; i <= 600; i += 1) {
    const g = 1e-6 * Math.pow(1e6, i / 600);
    const fg = ecart(g);
    if (fPrecedent < 0 && fg >= 0) return dichotomie(ecart, precedent, g, 50);
    precedent = g;
    fPrecedent = fg;
  }
  return null;
}

function construireSimCourbes(racine, api) {
  const reglages = { u: 1, kR: 1, kX: 1, kXm: 1 };
  let etat = null;

  const couple = api.sim.traceur("#e-courbes-couple", {
    titre: "Couple électromagnétique en fonction de la vitesse",
    xTitre: "vitesse n",
    xUnite: "tr/min",
    yTitre: "couple",
    yUnite: "N·m",
    xMin: 0,
    xMax: 1650,
    yMin: -80,
    yMax: 240,
    echantillons: 500,
    series: [
      { id: "moteur", nom: "schéma en T, réglages choisis", couleur: "serie-1", epaisseur: 3 },
      { id: "reference", nom: "paramètres identifiés, tension nominale", couleur: "serie-6", epaisseur: 1.4 },
      { id: "charge", nom: "ventilateur, couple en n²", couleur: "serie-5", epaisseur: 2.2 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, MH.ns, null);
      ligneH(c, repere, couleurs, MH.kMax * MH.Cn, "C_max catalogue", false, [3, 4]);
      pointTrace(c, repere, couleurs, 0, MH.kD * MH.Cn, "C_d catalogue", true);
      if (etat && etat.pf) pointTrace(c, repere, couleurs, etat.pf.n, etat.pf.Cem, "fonctionnement");
    },
  });
  if (couple) ressources.push(couple);

  const courant = api.sim.traceur("#e-courbes-courant", {
    titre: "Courant de ligne et facteur de puissance en fonction de la vitesse",
    xTitre: "vitesse n",
    xUnite: "tr/min",
    yTitre: "courant (A), 100 cos φ",
    xMin: 0,
    xMax: 1650,
    yMin: 0,
    yMax: 160,
    echantillons: 500,
    series: [
      { id: "courant", nom: "courant, réglages choisis", couleur: "serie-1", epaisseur: 3 },
      { id: "reference", nom: "courant, paramètres identifiés", couleur: "serie-6", epaisseur: 1.4 },
      { id: "cos", nom: "100 × |cos φ|, réglages choisis", couleur: "serie-3", epaisseur: 2 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, MH.ns, "n_s");
      pointTrace(c, repere, couleurs, 0, MH.kI * MH.In, "I_d catalogue", true);
      if (etat && etat.pf) pointTrace(c, repere, couleurs, etat.pf.n, etat.pf.I, "fonctionnement");
    },
  });
  if (courant) ressources.push(courant);

  const texteSi = (decimales, unite) => (v) => (Number.isFinite(v) ? nombre(api, v, decimales) + (unite ? " " + unite : "") : "sans objet");
  const valeurs = api.sim.valeurs("#e-courbes-valeurs", [
    { id: "Id", libelle: "Courant de démarrage / I_n", format: texteSi(2, "") },
    { id: "Cd", libelle: "Couple de démarrage / C_n", format: texteSi(2, "") },
    { id: "Cmax", libelle: "Couple maximal / C_n", format: texteSi(2, "") },
    { id: "nm", libelle: "Vitesse du couple maximal", format: texteSi(0, "tr/min") },
    { id: "I0", libelle: "Courant à vide", format: texteSi(2, "A") },
    { id: "n", libelle: "Vitesse sur le ventilateur", format: texteSi(0, "tr/min") },
    { id: "I", libelle: "Courant sur le ventilateur", format: texteSi(2, "A") },
    { id: "cos", libelle: "Facteur de puissance", format: texteSi(3, "") },
    { id: "eta", libelle: "Rendement", format: texteSi(1, "%") },
  ]);
  if (valeurs) ressources.push(valeurs);

  const gDe = (n) => (MH.ns - n) / MH.ns;

  function maj() {
    const r = { ...reglages };
    if (couple) {
      couple.definirFonction("moteur", (n) => point(MH, gDe(n), r).Cem);
      couple.definirFonction("reference", (n) => point(MH, gDe(n)).Cem);
      couple.definirFonction("charge", (n) => coupleVentilateur(n));
    }
    if (courant) {
      courant.definirFonction("courant", (n) => point(MH, gDe(n), r).I);
      courant.definirFonction("reference", (n) => point(MH, gDe(n)).I);
      courant.definirFonction("cos", (n) => (Math.abs(n - MH.ns) < 0.5 ? NaN : 100 * Math.abs(point(MH, gDe(n), r).cos)));
    }
    const th = thevenin(MH, r);
    const r2 = MH.R2 * r.kR;
    const xt = th.Xth + MH.X2 * r.kX;
    const gm = r2 / Math.sqrt(th.Rth * th.Rth + xt * xt);
    const cmax = (3 * th.Vth * th.Vth) / (2 * MH.Ws * (th.Rth + Math.sqrt(th.Rth * th.Rth + xt * xt)));
    const gs = pointVentilateur(r);
    const pf = gs != null ? point(MH, gs, r) : null;
    const g0 = dichotomie((g) => point(MH, g, r).Pm - MH.pm, 1e-10, 0.05);
    const d = point(MH, 1, r);
    etat = { pf };
    if (couple) couple.rafraichir();
    if (courant) courant.rafraichir();
    if (valeurs) {
      valeurs.maj({
        Id: d.I / MH.In,
        Cd: d.Cem / MH.Cn,
        Cmax: cmax / MH.Cn,
        nm: MH.ns * (1 - Math.min(1, gm)),
        I0: point(MH, g0, r).I,
        n: pf ? pf.n : NaN,
        I: pf ? pf.I : NaN,
        cos: pf ? pf.cos : NaN,
        eta: pf ? pf.eta * 100 : NaN,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-courbes-curseurs",
    [
      { id: "u", libelle: "Tension d'alimentation", min: 80, max: 110, pas: 1, valeur: 100, format: (v) => nombre(api, v, 0) + " % de U_n" },
      { id: "kR", libelle: "Résistance rotorique R2'", min: 0.5, max: 3, pas: 0.1, valeur: 1, format: (v) => "× " + nombre(api, v, 1) },
      { id: "kX", libelle: "Réactances de fuite X1 et X2'", min: 0.5, max: 2, pas: 0.05, valeur: 1, format: (v) => "× " + nombre(api, v, 2) },
      { id: "kXm", libelle: "Réactance magnétisante Xm", min: 0.4, max: 1.6, pas: 0.05, valeur: 1, format: (v) => "× " + nombre(api, v, 2) },
    ],
    (lues) => {
      reglages.u = lues.u / 100;
      reglages.kR = lues.kR;
      reglages.kX = lues.kX;
      reglages.kXm = lues.kXm;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   I. Simulation : performances selon la charge et la tension
   -------------------------------------------------------------------------- */

/** Performances pour une charge x (fraction de P_n) ; x = 0 désigne la marche à vide. */
function performances(M, x, reglages, gHaut) {
  let g;
  if (x <= 0) g = dichotomie((gg) => point(M, gg, reglages).Pm - M.pm, 1e-10, 0.05);
  else g = glissementPourPu(M, x * M.Pn, reglages, gHaut);
  return g == null ? null : point(M, g, reglages);
}

function construireSimCharge(racine, api) {
  const reglages = { moteur: 0, u: 100, charge: 75 };
  let marques = { charge: 75, etaMax: NaN };

  const trace = api.sim.traceur("#i-charge-trace", {
    titre: "Rendement, facteur de puissance et courant selon la charge",
    xTitre: "puissance utile",
    xUnite: "% de P_n",
    yTitre: "pour cent",
    xMin: 0,
    xMax: 125,
    yMin: 0,
    yMax: 140,
    series: [
      { id: "eta", nom: "rendement, %", couleur: "serie-1", epaisseur: 3 },
      { id: "cos", nom: "100 × facteur de puissance", couleur: "serie-3", epaisseur: 2.4 },
      { id: "I", nom: "courant, % de I_n", couleur: "serie-5", epaisseur: 2.4 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, marques.charge, "charge choisie");
      if (Number.isFinite(marques.etaMax)) {
        ligneV(c, repere, couleurs, marques.etaMax, null, [2, 4]);
        const px = repere.versX(marques.etaMax);
        c.save();
        c.fillStyle = couleurs.texte;
        c.font = POLICE;
        c.textAlign = "left";
        c.fillText("η max", px + 5, repere.boite.y + repere.boite.h - 8);
        c.restore();
      }
    },
  });
  if (trace) ressources.push(trace);

  const texteSi = (decimales, unite) => (v) => (Number.isFinite(v) ? nombre(api, v, decimales) + (unite ? " " + unite : "") : "décrochage");
  const valeurs = api.sim.valeurs("#i-charge-valeurs", [
    { id: "moteur", libelle: "Moteur", format: (v) => v },
    { id: "g", libelle: "Glissement", format: texteSi(2, "%") },
    { id: "n", libelle: "Vitesse", format: texteSi(0, "tr/min") },
    { id: "I", libelle: "Courant de ligne", format: texteSi(2, "A") },
    { id: "cos", libelle: "Facteur de puissance", format: texteSi(3, "") },
    { id: "eta", libelle: "Rendement", format: texteSi(2, "%") },
    { id: "Q", libelle: "Puissance réactive", format: texteSi(2, "kvar") },
    { id: "pertes", libelle: "Pertes totales", format: texteSi(0, "W") },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    const M = reglages.moteur >= 0.5 ? MOTEURS.comp : MOTEURS.h;
    const r = { u: reglages.u / 100 };
    const gHaut = glissementPmMax(M, r);
    const eta = [];
    const cos = [];
    const cour = [];
    let meilleur = { x: NaN, eta: -1 };
    for (let i = 0; i <= 100; i += 1) {
      const xp = (125 * i) / 100;
      const p = performances(M, xp / 100, r, gHaut);
      if (!p) {
        eta.push([xp, NaN]);
        cos.push([xp, NaN]);
        cour.push([xp, NaN]);
        continue;
      }
      const e = xp > 0 ? p.eta * 100 : 0;
      eta.push([xp, e]);
      cos.push([xp, 100 * p.cos]);
      cour.push([xp, (100 * p.I) / M.In]);
      if (e > meilleur.eta) meilleur = { x: xp, eta: e };
    }
    marques = { charge: reglages.charge, etaMax: meilleur.x };
    if (trace) {
      trace.definirDonnees("eta", eta);
      trace.definirDonnees("cos", cos);
      trace.definirDonnees("I", cour);
    }
    const p = performances(M, reglages.charge / 100, r, gHaut);
    if (valeurs) {
      valeurs.maj({
        moteur: M.nom,
        g: p ? p.g * 100 : NaN,
        n: p ? p.n : NaN,
        I: p ? p.I : NaN,
        cos: p ? p.cos : NaN,
        eta: p && reglages.charge > 0 ? p.eta * 100 : NaN,
        Q: p ? p.Q / 1000 : NaN,
        pertes: p ? p.P - Math.max(0, p.Pu) : NaN,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-charge-curseurs",
    [
      { id: "moteur", libelle: "Moteur", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (v >= 0.5 ? "compresseur, 18,5 kW" : "section H, 11 kW") },
      { id: "u", libelle: "Tension d'alimentation", min: 85, max: 110, pas: 1, valeur: 100, format: (v) => nombre(api, v, 0) + " % de U_n" },
      { id: "charge", libelle: "Charge lue dans le panneau", min: 0, max: 125, pas: 5, valeur: 75, format: (v) => nombre(api, v, 0) + " % de P_n" },
    ],
    (lues) => {
      Object.assign(reglages, lues);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

const ZONES_T = [
  { x: 56, y: 34, largeur: 48, hauteur: 32, etiquette: "R1" },
  { x: 160, y: 82, largeur: 80, hauteur: 76, etiquette: "Rf et jXm" },
  { x: 255, y: 30, largeur: 50, hauteur: 34, etiquette: "jX2'" },
  { x: 326, y: 34, largeur: 48, hauteur: 32, etiquette: "R2'" },
  { x: 448, y: 76, largeur: 44, hauteur: 88, etiquette: "charge" },
];

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* 1. Fondamental : lecture du schéma */
  ressources.push(
    api.exercice.schema(cible, {
      id: "k-lecture",
      titre: "Où se trouve la puissance mécanique ?",
      niveau: "fondamental",
      consigne: "Cliquez sur l'élément du schéma.",
      enonce:
        "<p>Sur le schéma équivalent en T ci-dessous, quel élément absorbe une puissance égale à la puissance mécanique $P_m$ convertie par le " +
        "moteur, pertes mécaniques comprises ?</p>",
      viewBox: "0 0 520 230",
      dessin: dessinT(nouveauMarqueur("fl-k-lec"), false, true),
      zones: ZONES_T.map((z) => ({ ...z, juste: z.etiquette === "charge" })),
      etapes: [
        { texte: "La branche rotorique absorbe la puissance transmise : $P_{tr} = 3(R_2'/g)I_2'^2$." },
        { texte: "On découpe $R_2'/g = R_2' + R_2'(1 - g)/g$ : la part $R_2'$ absorbe $3R_2'I_2'^2 = gP_{tr}$, les pertes Joule réelles du rotor." },
        {
          texte: "La part $R_2'(1 - g)/g$, la résistance de charge, absorbe $(1 - g)P_{tr} = P_m$ : c'est elle.",
          note: "$R_1$ représente les pertes Joule du stator, $R_f$ les pertes fer ; les réactances n'absorbent aucune puissance active.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 520 290",
          dessinT(nouveauMarqueur("fl-k-lec-c"), true) +
            ECRITS + texte(20, 250, "R1 : p_js ; Rf : p_fs ; R2' : p_jr = g P_tr") + texte(20, 272, "R2'(1-g)/g : P_m = (1 - g) P_tr = 3 R2'(1-g)/g I2'²") + "</g>",
          "Schéma en T annoté : chaque résistance et la puissance qu'elle représente ; la résistance de charge grisée porte la puissance mécanique."
        );
      },
    })
  );

  /* 2. Fondamental : couple électromagnétique */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-couple",
      titre: "Couple à partir de la puissance transmise",
      niveau: "fondamental",
      enonce:
        "<p>Un moteur à quatre pôles, alimenté à $50\\ \\mathrm{Hz}$, reçoit à travers l'entrefer $P_{tr} = 15\\ \\mathrm{kW}$ et glisse de $2{,}5\\ \\%$. " +
        "Quel est son couple électromagnétique ?</p>",
      valeur: 15000 / ((TAU * 1500) / 60),
      unite: "N·m",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Couple $C_{em}$",
      etapes: [
        { texte: "Quatre pôles : $p = 2$, $n_s = 1500\\ \\mathrm{tr/min}$, $\\varOmega_s = 2\\pi \\times 1500/60 = 157{,}08\\ \\mathrm{rad/s}$." },
        { texte: "$C_{em} = P_{tr}/\\varOmega_s = 15\\,000/157{,}08 = 95{,}49\\ \\mathrm{N \\cdot m}$ : le glissement n'intervient pas." },
        {
          texte: "Il sert pour le reste du bilan : $p_{jr} = 0{,}025 \\times 15\\,000 = 375\\ \\mathrm{W}$ et $P_m = 14\\,625\\ \\mathrm{W}$ ; contrôle : $P_m/\\varOmega = 14\\,625/153{,}15 = 95{,}49\\ \\mathrm{N \\cdot m}$.",
          note: "Diviser $P_{tr}$ par la vitesse du rotor donnerait $97{,}9\\ \\mathrm{N \\cdot m}$, trop fort de $g/(1 - g)$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 " + hauteurEtapes(4),
          dessinEtapes(["Ω_s = 2π × 1500 / 60 = 157,08 rad/s", "C_em = P_tr / Ω_s = 15 000 / 157,08 = 95,49 N·m", "p_jr = g P_tr = 375 W ; P_m = 14 625 W", "contrôle : P_m / Ω = 14 625 / 153,15 = 95,49 N·m"], 560),
          "Étapes révélées une à une : vitesse de synchronisme, couple, partage de la puissance, contrôle par la vitesse du rotor."
        );
      },
    })
  );

  /* 3. Intermédiaire : réactance magnétisante par l'essai à vide */
  const S0 = Math.sqrt(3) * 400 * 7.62;
  const Q0 = Math.sqrt(S0 * S0 - 603 * 603);
  const Qm = Q0 - 3 * 1.45 * 7.62 * 7.62;
  const E0 = 400 / Math.sqrt(3) - 1.45 * 7.62;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-essai-vide",
      titre: "Réactance magnétisante à partir de l'essai à vide",
      niveau: "intermédiaire",
      enonce:
        "<p>Essai à vide d'un moteur couplé en étoile, sous $400\\ \\mathrm{V}$ et $50\\ \\mathrm{Hz}$ : $I_0 = 7{,}62\\ \\mathrm{A}$, $P_0 = 603\\ \\mathrm{W}$. " +
        "On connaît $X_1 = 1{,}45\\ \\mathrm{\\Omega}$ par phase. En négligeant la composante active du courant dans le calcul de la chute de tension, " +
        "estimez la réactance magnétisante $X_m$ par phase.</p>",
      valeur: (3 * E0 * E0) / Qm,
      unite: "Ω",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Réactance $X_m$",
      etapes: [
        { texte: "Puissance apparente : $S_0 = \\sqrt{3} \\times 400 \\times 7{,}62 = 5279\\ \\mathrm{VA}$ ; réactive : $Q_0 = \\sqrt{5279^2 - 603^2} = 5245\\ \\mathrm{var}$." },
        { texte: "Réactif des fuites du stator : $3X_1I_0^2 = 3 \\times 1{,}45 \\times 7{,}62^2 = 253\\ \\mathrm{var}$ ; la branche magnétisante reçoit $Q_m = 4992\\ \\mathrm{var}$." },
        { texte: "Le courant à vide étant presque en quadrature, $E_0 \\approx V_1 - X_1I_0 = 230{,}94 - 11{,}05 = 219{,}89\\ \\mathrm{V}$." },
        {
          texte: "$X_m = 3E_0^2/Q_m = 3 \\times 219{,}89^2/4992 = 29{,}06\\ \\mathrm{\\Omega}$.",
          note: "En ignorant $X_1$, on trouverait $3 \\times 230{,}94^2/5245 = 30{,}5\\ \\mathrm{\\Omega}$, soit $5\\ \\%$ de trop.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 " + hauteurEtapes(5),
          dessinEtapes(["S0 = √3 × 400 × 7,62 = 5279 VA", "Q0 = √(5279² - 603²) = 5245 var", "Qm = 5245 - 3 × 1,45 × 7,62² = 4992 var", "E0 ≈ 230,94 - 1,45 × 7,62 = 219,89 V", "Xm = 3 × 219,89² / 4992 = 29,06 Ω"], 560),
          "Étapes révélées une à une : puissances à vide, réactif des fuites retranché, force électromotrice, réactance magnétisante."
        );
      },
    })
  );

  /* 4. Intermédiaire : couple par Thévenin */
  const couple2 = (() => {
    const RL = MH.R2 / 0.02;
    const z2 = (TH.Rth + RL) * (TH.Rth + RL) + X_TOT * X_TOT;
    return (3 * TH.Vth * TH.Vth * RL) / (MH.Ws * z2);
  })();
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-thevenin",
      titre: "Couple à faible glissement par l'équivalent de Thévenin",
      niveau: "intermédiaire",
      enonce:
        "<p>Pour le moteur de la section H : $V_{th} = 219{,}74\\ \\mathrm{V}$, $R_{th} = 0{,}287\\ \\mathrm{\\Omega}$, $X_{th} = 1{,}381\\ \\mathrm{\\Omega}$, " +
        "$R_2' = 0{,}30\\ \\mathrm{\\Omega}$, $X_2' = 1{,}45\\ \\mathrm{\\Omega}$, $n_s = 1500\\ \\mathrm{tr/min}$. Quel couple électromagnétique développe-t-il " +
        "à $g = 2\\ \\%$ ?</p>",
      valeur: couple2,
      unite: "N·m",
      tolerance: 0.015,
      chiffres: 2,
      libelleChamp: "Couple $C_{em}$",
      etapes: [
        { texte: "Résistance de charge : $R_2'/g = 0{,}30/0{,}02 = 15\\ \\mathrm{\\Omega}$." },
        { texte: "Impédance de la maille : $(0{,}287 + 15) + j(1{,}381 + 1{,}45)$, de module $\\sqrt{15{,}287^2 + 2{,}831^2} = 15{,}547\\ \\mathrm{\\Omega}$." },
        { texte: "Courant rotorique ramené : $I_2' = 219{,}74/15{,}547 = 14{,}13\\ \\mathrm{A}$." },
        { texte: "$P_{tr} = 3 \\times 15 \\times 14{,}13^2 = 8990\\ \\mathrm{W}$, d'où $C_{em} = 8990/157{,}08 = 57{,}2\\ \\mathrm{N \\cdot m}$." },
        { texte: "Contrôle : $0{,}80\\ C_n$ pour $0{,}75$ fois le glissement nominal, cohérent avec un couple presque proportionnel au glissement.", note: "Le calcul complet par le schéma en T donne la même valeur : Thévenin est exact, pas approché." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Couple en fonction du glissement, par Thévenin",
          xTitre: "glissement",
          xUnite: "%",
          yTitre: "couple",
          yUnite: "N·m",
          xMin: 0,
          xMax: 20,
          yMin: 0,
          yMax: 160,
          series: [{ id: "c", nom: "C_em(g), moteur de la section H", couleur: "serie-1", epaisseur: 2.6, fonction: (gp) => (gp <= 0 ? 0 : point(MH, gp / 100).Cem) }],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 2, "g = 2 %");
            pointTrace(c, repere, couleurs, 2, couple2, "57,2 N·m");
            pointTrace(c, repere, couleurs, 100 * MH.R2 / R_OPT, 147.19, "C_max", true);
          },
        });
      },
    })
  );

  /* 5. Avancé : résistance rotorique pour le couple maximal au démarrage */
  const ajout = R_OPT - MH.R2;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-rotor-bobine",
      titre: "Résistance de démarrage pour le couple maximal",
      niveau: "avancé",
      enonce:
        "<p>On envisage une version à rotor bobiné du moteur de la section H, de mêmes paramètres, pour entraîner un broyeur qui exige un fort couple " +
        "dès l'arrêt. Quelle résistance additionnelle, ramenée au stator, faut-il insérer par phase du rotor pour obtenir le couple maximal au " +
        "démarrage ? Données : $R_{th} = 0{,}287\\ \\mathrm{\\Omega}$, $X_{th} = 1{,}381\\ \\mathrm{\\Omega}$, $R_2' = 0{,}30\\ \\mathrm{\\Omega}$, $X_2' = 1{,}45\\ \\mathrm{\\Omega}$.</p>",
      valeur: ajout,
      unite: "Ω",
      tolerance: 0.015,
      chiffres: 3,
      libelleChamp: "Résistance additionnelle ramenée $R_a'$",
      etapes: [
        { texte: "Le couple est maximal quand la résistance de charge égale $\\sqrt{R_{th}^2 + (X_{th} + X_2')^2}$, soit le glissement $g_m = R_{2,tot}'/\\sqrt{\\cdots}$." },
        { texte: "On veut $g_m = 1$ : $R_{2,tot}' = \\sqrt{0{,}287^2 + 2{,}831^2} = 2{,}846\\ \\mathrm{\\Omega}$." },
        { texte: "Résistance additionnelle : $R_a' = 2{,}846 - 0{,}30 = 2{,}546\\ \\mathrm{\\Omega}$ ramenés au stator ; au rotor, elle vaut $m^2$ fois moins." },
        { texte: "Couple au démarrage : $C_{max} = 147{,}2\\ \\mathrm{N \\cdot m}$, soit $2{,}05\\ C_n$ au lieu de $33\\ \\mathrm{N \\cdot m}$ ; courant $I_2' = 219{,}74/|0{,}287 + 2{,}846 + j2{,}831| = 52{,}0\\ \\mathrm{A}$ au lieu de $76\\ \\mathrm{A}$.", note: "Le couple monte et le courant baisse : c'est l'intérêt du rotor bobiné. Les résistances sont ensuite court-circuitées par étapes, sinon le glissement en charge et les pertes rotoriques seraient énormes." },
      ],
      visuelCorrection(conteneur, moteur) {
        const k = R_OPT / MH.R2;
        traceCorrection(moteur, conteneur, {
          titre: "Couple en fonction de la vitesse, sans et avec résistance additionnelle",
          xTitre: "vitesse n",
          xUnite: "tr/min",
          yTitre: "couple",
          yUnite: "N·m",
          xMin: 0,
          xMax: 1500,
          yMin: 0,
          yMax: 160,
          series: [
            { id: "base", nom: "rotor en court-circuit, R2' = 0,30 Ω", couleur: "serie-6", epaisseur: 1.8, fonction: (n) => point(MH, (1500 - n) / 1500).Cem },
            { id: "ajout", nom: "R2' + R_a' = 2,846 Ω", couleur: "serie-1", epaisseur: 2.8, fonction: (n) => point(MH, (1500 - n) / 1500, { kR: k }).Cem },
          ],
          surDessin({ c, repere, couleurs }) {
            pointTrace(c, repere, couleurs, 0, 147.19, "C_max à l'arrêt");
            ligneH(c, repere, couleurs, MH.Cn, "C_n", true, [3, 4]);
          },
        });
      },
    })
  );

  /* 6. Diagnostic industriel */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Un moteur qui revient de rebobinage",
      niveau: "diagnostic",
      enonce:
        "<p>Le moteur de la section H revient d'un rebobinage. À vide sous $400\\ \\mathrm{V}$, il absorbe $11{,}5\\ \\mathrm{A}$ au lieu de $7{,}62\\ \\mathrm{A}$ et " +
        "$650\\ \\mathrm{W}$ au lieu de $603\\ \\mathrm{W}$. En charge nominale, son courant est de $23{,}5\\ \\mathrm{A}$, son facteur de puissance de $0{,}76$ et son " +
        "glissement de $2{,}8\\ \\%$. Quelles affirmations sont justifiées ?</p>",
      options: [
        { texte: "La réactance magnétisante a diminué d'environ un tiers : c'est la cause principale des symptômes.", juste: true },
        { texte: "Un nombre de spires réduit au rebobinage peut l'expliquer, car $X_m$ varie comme le carré du nombre de spires.", juste: true },
        { texte: "Les pertes fer ont fortement augmenté : les tôles ont été endommagées." },
        { texte: "Une barre de cage est fissurée : c'est elle qui fait monter le courant à vide." },
      ],
      etapes: [
        { texte: "Hausse des pertes à vide : $3R_1I_0^2$ passe de $54$ à $123\\ \\mathrm{W}$, ce qui explique à lui seul les $47\\ \\mathrm{W}$ de plus : pertes fer et mécaniques inchangées, les tôles ne sont pas en cause." },
        { texte: "Courant à vide multiplié par $1{,}5$, presque réactif : le modèle le reproduit avec $X_m = 18{,}7\\ \\mathrm{\\Omega}$ au lieu de $29\\ \\mathrm{\\Omega}$, et donne alors $23{,}5\\ \\mathrm{A}$ et $\\cos\\varphi = 0{,}76$ en charge nominale." },
        { texte: "Une barre fissurée augmenterait le glissement en charge et ferait osciller le courant, mais ne toucherait pas le courant à vide : $2{,}8\\ \\%$ au lieu de $2{,}6\\ \\%$ s'explique par le flux réduit." },
        { texte: "Causes possibles : spires en moins, environ $20\\ \\%$ pour un facteur $0{,}64$ sur $X_m$, couplage interne modifié, ou entrefer agrandi si le rotor a été réusiné.", note: "Avec moins de spires, l'induction augmente aussi et sature le fer, ce qui aggrave la chute de $X_m$ : il faut comparer au procès-verbal d'origine et refaire l'essai à vide sous tension variable." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 " + hauteurEtapes(5),
          dessinEtapes(["à vide : 7,62 A → 11,5 A, presque réactif", "3 R1 I0² : 54 W → 123 W, explique + 47 W", "modèle : Xm 29 Ω → 18,7 Ω reproduit tout", "en charge : 23,5 A et cos φ 0,76 calculés", "cause : spires en moins ou entrefer agrandi"], 560),
          "Raisonnement révélé ligne par ligne : symptômes à vide, séparation des pertes, paramètre en cause, vérification en charge, causes physiques."
        );
      },
    })
  );

  /* 7. Conceptuelle */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Une résistance qui ne chauffe pas",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi la puissance absorbée par la résistance $R_2'/g$ du schéma équivalent n'est pas entièrement dissipée " +
        "en chaleur, quelle part l'est, et ce que devient le reste.</p>",
      motsCles: [["transmise", "entrefer", "ptr"], ["joule", "chaleur", "chauffe"], ["mecanique", "arbre"], ["glissement", "fraction g", "g p"]],
      minimum: 3,
      exemple: "Trois phrases suffisent : ce que représente R2'/g, le découpage, l'origine de la part mécanique.",
      etapes: [
        { texte: "$R_2'/g$ représente toute la puissance qui traverse l'entrefer, la puissance transmise : elle a été introduite en divisant l'équation du rotor par $g$." },
        { texte: "La seule résistance physique du rotor est $R_2'$ : elle dissipe $3R_2'I_2'^2 = g\\,P_{tr}$, les pertes Joule réelles." },
        { texte: "Le reste, $R_2'(1 - g)/g$, n'existe pas physiquement : sa puissance $(1 - g)P_{tr}$ est le travail des forces de Laplace sur le rotor en mouvement, qui part sur l'arbre.", note: "En génératrice, $g &lt; 0$ et cette résistance devient négative : elle fournit de la puissance." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 " + hauteurEtapes(3),
          dessinEtapes(["R2'/g : toute la puissance transmise P_tr", "R2' : chaleur réelle, g P_tr", "R2'(1 - g)/g : travail mécanique, (1 - g) P_tr"], 560),
          "Les trois idées révélées une à une : sens de R2'/g, part dissipée, part mécanique."
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const VISUELS_QUIZ = [
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["R2'/g = R2' + R2'(1 - g)/g", "R2' : pertes Joule du rotor", "R2'(1 - g)/g : puissance mécanique"], 540),
    legende: "Découpage de la résistance rotorique ramenée.",
  },
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["la branche rotorique absorbe 3 (R2'/g) I2'²", "c'est tout ce qui traverse l'entrefer", "donc P_tr, et C_em = P_tr / Ω_s"], 540),
    legende: "La puissance absorbée par R2'/g est la puissance transmise.",
  },
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["R2'(1 - g)/g = 0,25 × 0,96 / 0,04", "= 0,24 / 0,04", "= 6,0 Ω"], 540),
    legende: "Résistance de charge au glissement de 4 %.",
  },
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["moteur : Im ≈ 35 % de I_n (entrefer)", "chute dans R1 + jX1 non négligeable", "déplacer la branche : + 9 % sur I1, + 10 % sur C"], 540),
    legende: "Pourquoi le schéma approché coûte cher sur un moteur.",
  },
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["6 pôles : n_s = 1000 tr/min, Ω_s = 104,72 rad/s", "C_em = P_tr / Ω_s = 9000 / 104,72", "C_em = 85,94 N·m"], 540),
    legende: "Couple électromagnétique d'un moteur à six pôles.",
  },
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["à vide : g → 0, R2'/g → infini", "branche rotorique ouverte", "le courant passe par la branche magnétisante"], 540),
    legende: "À vide, le courant absorbé est le courant de la branche magnétisante.",
  },
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["C_max = 3 Vth² / (2 Ω_s [Rth + √(Rth² + X²)])", "R2' n'y figure pas", "R2' fixe seulement g_m"], 540),
    legende: "Le couple maximal ne dépend pas de la résistance rotorique.",
  },
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["en marche : courants rotoriques à environ 1 Hz", "à 50 Hz : effet de peau, paramètres de démarrage", "essai à f/4 : paramètres de marche"], 540),
    legende: "Fréquence de l'essai à rotor bloqué.",
  },
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["p_jr = 3 R2' I2'²", "= 3 × 0,30 × 20²", "= 360 W"], 540),
    legende: "Pertes Joule du rotor à partir du courant ramené.",
  },
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["couple constant, flux réduit : I2' augmente", "pleine charge, U = 0,9 U_n : 21,0 A → 23,5 A", "faible charge : Im domine, le courant baisse"], 540),
    legende: "Effet d'une sous-tension selon la charge.",
  },
];

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Dans le schéma équivalent en T, quel élément représente la puissance mécanique ?</p>",
        options: ["$R_2'$", "$R_2'(1 - g)/g$", "$R_2'/g$", "$R_f$"],
        bonnes: [1],
        explication: "$R_2'/g = R_2' + R_2'(1 - g)/g$ : la première part chauffe le rotor, la seconde absorbe $(1 - g)P_{tr} = P_m$.",
        resume: "Élément de la puissance mécanique",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>La puissance absorbée par la résistance $R_2'/g$ est égale à la puissance transmise à travers l'entrefer.</p>",
        reponse: true,
        explication: "Toute la puissance qui franchit l'entrefer est absorbée par la branche rotorique, dont $R_2'/g$ est la seule partie résistive.",
        resume: "Puissance dans R2'/g",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>$R_2' = 0{,}25\\ \\mathrm{\\Omega}$ et $g = 4\\ \\%$. Que vaut la résistance de charge $R_2'(1 - g)/g$, en ohms ?</p>",
        valeur: 6,
        unite: "Ω",
        tolerance: 0.01,
        explication: "$0{,}25 \\times 0{,}96/0{,}04 = 6{,}0\\ \\mathrm{\\Omega}$.",
        resume: "Résistance de charge",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi déplacer la branche magnétisante aux bornes est-il beaucoup moins justifié pour un moteur que pour un transformateur ?</p>",
        motsCles: [["entrefer", "magnetis"], ["important", "eleve", "fort", "tiers", "grand"], ["chute", "r1", "x1", "erreur"]],
        minimum: 2,
        explication:
          "À cause de l'entrefer, le courant magnétisant d'un moteur vaut environ le tiers du courant nominal ; sa chute dans $R_1 + jX_1$ n'est plus négligeable, et l'erreur atteint $10\\ \\%$ sur le courant et le couple.",
        resume: "Limite du schéma approché",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Un moteur à six pôles, à $50\\ \\mathrm{Hz}$, reçoit $P_{tr} = 9\\ \\mathrm{kW}$. Quel est son couple électromagnétique, en $\\mathrm{N \\cdot m}$ ?</p>",
        valeur: 9000 / ((TAU * 1000) / 60),
        unite: "N·m",
        tolerance: 0.01,
        explication: "$n_s = 1000\\ \\mathrm{tr/min}$, $\\varOmega_s = 104{,}72\\ \\mathrm{rad/s}$, $C_{em} = 9000/104{,}72 = 85{,}94\\ \\mathrm{N \\cdot m}$.",
        resume: "Couple d'un moteur à six pôles",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Le moteur tourne à vide. Dans quelle partie du schéma passe l'essentiel du courant absorbé ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 520 230",
        dessin: dessinT(nouveauMarqueur("fl-l-t"), false, true),
        zones: ZONES_T.map((z) => ({ ...z, juste: z.etiquette === "Rf et jXm" })),
        explication:
          "À vide, $g \\to 0$ et $R_2'/g \\to \\infty$ : la branche rotorique est presque ouverte, et le courant, d'environ $36\\ \\%$ du courant nominal, traverse la branche magnétisante.",
        resume: "Courant à vide",
      },
      {
        type: "vraiFaux",
        enonce: repere(6) + "<p>Augmenter la résistance rotorique $R_2'$ augmente le couple maximal du moteur.</p>",
        reponse: false,
        explication: "Le couple maximal ne dépend que de $V_{th}$, $R_{th}$, $X_{th}$ et $X_2'$ ; $R_2'$ ne fait que déplacer le glissement critique.",
        resume: "Résistance rotorique et couple maximal",
      },
      {
        type: "qcm",
        enonce: repere(7) + "<p>Pourquoi l'essai à rotor bloqué destiné aux paramètres de marche se fait-il à fréquence réduite, vers le quart de la fréquence nominale ?</p>",
        options: [
          "Pour retrouver une fréquence rotorique proche de celle de la marche normale et éviter l'effet de peau dans les barres",
          "Pour réduire les pertes fer, qui fausseraient la mesure de $R_2'$",
          "Parce qu'à $50\\ \\mathrm{Hz}$ le courant serait trop faible pour être mesuré",
          "Pour que la branche magnétisante devienne prépondérante",
        ],
        bonnes: [0],
        explication: "En marche, $f_r = gf$ vaut environ $1\\ \\mathrm{Hz}$ ; à $50\\ \\mathrm{Hz}$ rotor bloqué, l'effet de peau augmente $R_2'$ et réduit $X_2'$ : on mesurerait les paramètres de démarrage.",
        resume: "Fréquence de l'essai à rotor bloqué",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Le courant rotorique ramené vaut $20\\ \\mathrm{A}$ et $R_2' = 0{,}30\\ \\mathrm{\\Omega}$. Quelles sont les pertes Joule du rotor, en watts, pour les trois phases ?</p>",
        valeur: 360,
        unite: "W",
        tolerance: 0.01,
        explication: "$p_{jr} = 3R_2'I_2'^2 = 3 \\times 0{,}30 \\times 400 = 360\\ \\mathrm{W}$, quel que soit le glissement.",
        resume: "Pertes Joule du rotor",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>La tension baisse de $10\\ \\%$. Pour le moteur de la section H, quelles affirmations sont exactes ?</p>",
        options: [
          { texte: "À pleine charge, le courant augmente.", juste: true },
          { texte: "Au quart de charge, le courant diminue.", juste: true },
          { texte: "Le courant diminue toujours, puisque la tension baisse." },
          { texte: "Le couple maximal ne change pas." },
        ],
        multiple: true,
        explication:
          "À pleine charge, il faut plus de courant rotorique sous un flux réduit : $21{,}0 \\to 23{,}5\\ \\mathrm{A}$. Au quart de charge, le courant magnétisant domine et baisse avec la tension : $9{,}2 \\to 8{,}9\\ \\mathrm{A}$. Le couple maximal baisse de $19\\ \\%$.",
        resume: "Sous-tension et courant",
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
      { categorie: "Rotor", question: "Pourquoi la résistance rotorique devient-elle $R_2/g$ ?", reponse: "La maille du rotor, $gE_{20} = (R_2 + jgX_{20})I_2$, divisée par $g$, décrit un rotor immobile à la fréquence $f$, fermé sur $R_2/g$, avec le même courant." },
      { categorie: "Ramener", question: "Comment ramène-t-on le rotor au stator ?", reponse: "Avec $m = E_{20}/E_1$ : $R_2' = R_2/m^2$, $X_2' = X_{20}/m^2$, $I_2' = mI_2$ ; pour une cage, seules les valeurs ramenées sont mesurables." },
      { categorie: "Schéma", question: "Quels sont les éléments du schéma en T ?", reponse: "$R_1$, $jX_1$ en série ; $R_f$ parallèle à $jX_m$ sous $E_1$ ; puis $jX_2'$ et $R_2'/g$, découpée en $R_2'$ et $R_2'(1 - g)/g$." },
      { categorie: "Puissances", question: "Que vaut la puissance transmise dans le schéma ?", reponse: "$P_{tr} = 3(R_2'/g)I_2'^2$ ; $p_{jr} = 3R_2'I_2'^2 = gP_{tr}$ ; $P_m = (1 - g)P_{tr}$.", rappel: "Section H : 11 549 W transmis, 308 W de pertes rotoriques." },
      { categorie: "Couple", question: "Comment obtenir le couple sans connaître la vitesse ?", reponse: "$C_{em} = P_{tr}/\\varOmega_s$, puisque la puissance transmise est portée par le champ qui tourne à $\\varOmega_s$." },
      { categorie: "Thévenin", question: "Que donne Thévenin vu du rotor ramené ?", reponse: "$C_{em}$ en fonction de $g$ ; $g_m = R_2'/\\sqrt{R_{th}^2 + (X_{th} + X_2')^2}$ ; $C_{max}$ indépendant de $R_2'$ : c'est un transfert maximal de puissance." },
      { categorie: "Magnétisant", question: "Pourquoi le courant magnétisant d'un moteur est-il si grand ?", reponse: "Le flux traverse deux fois l'entrefer : $X_m$ est faible, et $I_m$ vaut $25$ à $50\\ \\%$ de $I_n$, contre $1$ à $3\\ \\%$ pour un transformateur." },
      { categorie: "Approximation", question: "Que coûte le schéma approché en L sur un moteur ?", reponse: "La branche magnétisante sous $V_1$ au lieu de $E_1$ : environ $+9\\ \\%$ sur le courant et $+10\\ \\%$ sur le couple dans l'exemple. Préférer le T ou Thévenin." },
      { categorie: "Essais", question: "Quels essais identifient le schéma ?", reponse: "Résistance entre bornes, $R_1 = R_b/2$ ; essai à vide, $X_m$, $R_f$ et $p_m$ par séparation des pertes ; essai à rotor bloqué à fréquence réduite, $R_2'$ et $X_1 + X_2'$." },
      { categorie: "Limite", question: "Pourquoi les paramètres de marche ne décrivent-ils pas le démarrage ?", reponse: "À l'arrêt, la fréquence rotorique vaut $50\\ \\mathrm{Hz}$ : l'effet de peau augmente $R_2'$, la saturation réduit les fuites ; le modèle de marche sous-estime courant et couple de démarrage." },
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
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["R2'/g = 0,30 / 0,02 = 15 Ω", "P_tr = 3 × 15 × 15²", "P_tr = 10 125 W"], 540),
    legende: "Puissance transmise à partir du courant rotorique ramené.",
  },
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["transformateur : I0 ≈ 1 à 3 % de I_n", "moteur : entrefer, Im ≈ 25 à 50 % de I_n", "exemple : 7,6 A pour 21 A, soit 36 %"], 540),
    legende: "Courant à vide d'un moteur et d'un transformateur.",
  },
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["à vide : g ≈ 0, branche rotorique ouverte", "I0, P0, Q0 → Xm, Rf, p_m", "rotor bloqué : R2', X1 + X2'"], 540),
    legende: "L'essai à vide identifie la branche magnétisante.",
  },
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["4 pôles : n_s = 1500 tr/min", "g = (1500 - 1440) / 1500", "g = 4,0 %"], 540),
    legende: "Glissement d'un moteur à quatre pôles.",
  },
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["C ∝ V_th² ∝ U² à glissement donné", "U = 0,9 U_n : C × 0,81", "le schéma en T le confirme : Vth ∝ U"], 540),
    legende: "Le couple varie comme le carré de la tension.",
  },
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["ΔV ≈ (Rs cos φ + Xs sin φ) I", "= (0,03 × 0,8 + 0,06 × 0,6) × 100", "= 6,0 V"], 540),
    legende: "Chute de tension de Kapp.",
  },
  {
    viewBox: "0 0 540 " + hauteurEtapes(3),
    dessin: dessinEtapes(["U crête = 400 × √2 = 565,7 V", "W = ½ C U² = 0,5 × 50 µF × 565,7²", "W = 8,0 J"], 540),
    legende: "Énergie stockée au maximum de tension dans un condensateur.",
  },
];

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. $I_2' = 15\\ \\mathrm{A}$, $R_2' = 0{,}30\\ \\mathrm{\\Omega}$, $g = 2\\ \\%$. Quelle est la puissance transmise au rotor, en watts, pour les trois phases ?</p>",
        valeur: 10125,
        unite: "W",
        tolerance: 0.01,
        explication: "$P_{tr} = 3(R_2'/g)I_2'^2 = 3 \\times 15 \\times 225 = 10\\,125\\ \\mathrm{W}$.",
        resume: "Puissance transmise",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Comme pour un transformateur, le courant à vide d'un moteur asynchrone vaut quelques pour cent du courant nominal.</p>",
        reponse: false,
        explication: "L'entrefer impose un courant magnétisant de $25$ à $50\\ \\%$ du courant nominal : $36\\ \\%$ pour le moteur de la section H.",
        resume: "Courant à vide",
      },
      {
        type: "qcm",
        enonce: repere(2) + "<p>Cette séance. Quel essai permet d'identifier la réactance magnétisante $X_m$ ?</p>",
        options: ["L'essai à vide sous tension nominale", "L'essai à rotor bloqué à fréquence réduite", "La mesure de résistance entre bornes", "L'essai à rotor bloqué à 50 Hz"],
        bonnes: [0],
        explication: "À vide, la branche rotorique est presque ouverte : le courant absorbé traverse la branche magnétisante, dont on tire $X_m$ et $R_f$.",
        resume: "Identification de Xm",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours précédent. Un moteur à quatre pôles tourne à $1440\\ \\mathrm{tr/min}$ sous $50\\ \\mathrm{Hz}$. Quel est son glissement, en pour cent ?</p>",
        valeur: 4,
        unite: "%",
        tolerance: 0.01,
        explication: "$n_s = 1500\\ \\mathrm{tr/min}$, $g = 60/1500 = 4{,}0\\ \\%$.",
        resume: "Glissement",
      },
      {
        type: "vraiFaux",
        enonce: repere(4) + "<p>Cours précédent. À glissement donné, le couple d'un moteur asynchrone est proportionnel au carré de la tension d'alimentation.</p>",
        reponse: true,
        explication: "$V_{th}$ est proportionnelle à la tension, et le couple à $V_{th}^2$ : une tension réduite de $10\\ \\%$ réduit tous les couples de $19\\ \\%$.",
        resume: "Couple et tension",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Transformateur réel. Un transformateur a, ramenées au secondaire, $R_s = 0{,}03\\ \\mathrm{\\Omega}$ et $X_s = 0{,}06\\ \\mathrm{\\Omega}$. Il débite $100\\ \\mathrm{A}$ sous $\\cos\\varphi = 0{,}8$ inductif. Quelle chute de tension donne l'approximation de Kapp, en volts ?</p>",
        valeur: 6,
        unite: "V",
        tolerance: 0.01,
        explication: "$\\Delta V \\approx (R_s\\cos\\varphi + X_s\\sin\\varphi)I = (0{,}024 + 0{,}036) \\times 100 = 6{,}0\\ \\mathrm{V}$.",
        resume: "Chute de tension de Kapp",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Condensateurs et champ électrique. Un condensateur de compensation de $50\\ \\mathrm{\\mu F}$ est branché sous $400\\ \\mathrm{V}$ efficaces. Quelle énergie stocke-t-il au maximum de la tension, en joules ?</p>",
        valeur: 8,
        unite: "J",
        tolerance: 0.01,
        explication: "$U_{max} = 565{,}7\\ \\mathrm{V}$, $W = \\tfrac{1}{2}CU_{max}^2 = 0{,}5 \\times 50 \\times 10^{-6} \\times 565{,}7^2 = 8{,}0\\ \\mathrm{J}$. C'est cette énergie, échangée avec le champ magnétique du moteur, qui peut entretenir une auto-excitation.",
        resume: "Énergie d'un condensateur",
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
    titre: "Où en suis-je sur le schéma équivalent du moteur asynchrone ?",
  });
  if (auto) ressources.push(auto);
}
