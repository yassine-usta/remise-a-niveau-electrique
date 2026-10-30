/* ==========================================================================
   cours/variation-de-vitesse-des-moteurs-asynchrones/cours.js
   Variation de vitesse des moteurs asynchrones : flux imposé par U/f,
   écart de vitesse constant, diagramme de Fresnel de la maille statorique,
   courbes couple-vitesse sous variation de fréquence, zones de
   fonctionnement, démarrage sur rampe et consigne de la pompe du site.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];
let compteurMarqueurs = 0;

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const RAC3 = Math.sqrt(3);

/* --------------------------------------------------------------------------
   Nombres complexes
   -------------------------------------------------------------------------- */

const cx = (re, im = 0) => ({ re, im });
const cAdd = (a, b) => cx(a.re + b.re, a.im + b.im);
const cMul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cMod = (a) => Math.hypot(a.re, a.im);
const cScal = (a, k) => cx(a.re * k, a.im * k);
function cInv(a) {
  const m = a.re * a.re + a.im * a.im;
  return m > 0 ? cx(a.re / m, -a.im / m) : cx(Infinity, 0);
}
const cDiv = (a, b) => cMul(a, cInv(b));

/* --------------------------------------------------------------------------
   Modèle du moteur : schéma équivalent en T par phase de l'étoile
   équivalente, réactances données à 50 Hz et proportionnelles à f.
   -------------------------------------------------------------------------- */

function preparer(M) {
  M.Wn = (M.nn * TAU) / 60;
  M.Cn = M.Pn / M.Wn;
  M.dnn = (60 * 50) / M.p - M.nn;
  const nominal = etat(M, 50, M.Un, M.nn);
  M.EsurF = nominal.E / 50;
  M.Psin = nominal.psi;
  M.Ivide = etat(M, 50, M.Un, (60 * 50) / M.p - 1e-4).I;
  return M;
}

/** État en régime établi pour une fréquence f (Hz), une tension composée U (V) et une vitesse n (tr/min). */
function etat(M, f, U, n) {
  const fr = Math.max(f, 0.05);
  const a = fr / 50;
  const ns = (60 * fr) / M.p;
  let g = (ns - n) / ns;
  if (Math.abs(g) < 1e-7) g = g < 0 ? -1e-7 : 1e-7;
  const V = U / RAC3;
  const Z1 = cx(M.R1, M.X1 * a);
  const Zm = cx(0, M.Xm * a);
  const Z2 = cx(M.R2 / g, M.X2 * a);
  const Zp = cDiv(cMul(Zm, Z2), cAdd(Zm, Z2));
  const I1 = cDiv(cx(V, 0), cAdd(Z1, Zp));
  const Ecx = cMul(I1, Zp);
  const I2 = cDiv(Ecx, Z2);
  const Ws = (TAU * fr) / M.p;
  const I2m = cMod(I2);
  const C = (3 * M.R2 * I2m * I2m) / (g * Ws);
  const Pin = 3 * V * I1.re;
  const S = 3 * V * cMod(I1);
  const E = cMod(Ecx);
  return { I: cMod(I1), I1, I2, Ecx, E, C, Pin, cos: S > 0 ? Pin / S : 0, g, psi: E / (TAU * fr), Pm: (C * n * TAU) / 60, ns };
}

/** Couple maximal par recherche du nombre d'or sur le glissement. */
function coupleMax(M, f, U) {
  const ns = (60 * Math.max(f, 0.05)) / M.p;
  const C = (g) => etat(M, f, U, ns * (1 - g)).C;
  let a = 1e-4;
  let b = 1;
  const r = (Math.sqrt(5) - 1) / 2;
  let x1 = b - r * (b - a);
  let x2 = a + r * (b - a);
  let f1 = C(x1);
  let f2 = C(x2);
  for (let i = 0; i < 60; i += 1) {
    if (f1 < f2) {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = a + r * (b - a);
      f2 = C(x2);
    } else {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = b - r * (b - a);
      f1 = C(x1);
    }
  }
  const g = (a + b) / 2;
  return { C: C(g), n: ns * (1 - g), g };
}

/** Point de fonctionnement stable sous un couple résistant Cr(n) ; null en cas de calage. */
function pointStable(M, f, U, Cr) {
  const ns = (60 * Math.max(f, 0.05)) / M.p;
  const max = coupleMax(M, f, U);
  if (max.C < Cr(max.n)) return null;
  let bas = max.n;
  let haut = ns * (1 - 1e-7);
  for (let i = 0; i < 70; i += 1) {
    const m = (bas + haut) / 2;
    if (etat(M, f, U, m).C > Cr(m)) bas = m;
    else haut = m;
  }
  return { n: bas, e: etat(M, f, U, bas), max };
}

/** Écart de vitesse et tension qui tiennent le flux nominal sous le couple C. */
function fluxNominal(M, f, C) {
  const a = f / 50;
  const E = M.EsurF * f;
  const ns = (60 * f) / M.p;
  const calc = (dn) => {
    const g = dn / ns;
    const Z2 = cx(M.R2 / g, M.X2 * a);
    const I2 = cDiv(cx(E, 0), Z2);
    const I2m = cMod(I2);
    const Cv = (3 * M.R2 * I2m * I2m) / ((g * TAU * f) / M.p);
    const I1 = cAdd(I2, cDiv(cx(E, 0), cx(0, M.Xm * a)));
    const V = cAdd(cx(E, 0), cMul(cx(M.R1, M.X1 * a), I1));
    return { C: Cv, V: cMod(V), I1, I2, dn };
  };
  let bas = 1e-4;
  let haut = ns * 0.3;
  if (calc(haut).C < C) return null;
  for (let i = 0; i < 70; i += 1) {
    const m = (bas + haut) / 2;
    if (calc(m).C < C) bas = m;
    else haut = m;
  }
  const r = calc(bas);
  return { dn: bas, U: r.V * RAC3, I1: r.I1, I2: r.I2 };
}

/** Lois de commande : proportionnelle, compensée, quadratique. */
function loiTension(loi, f, U0, Umax, Ub = 400, fb = 50) {
  let U;
  if (loi === 0) U = (Ub * f) / fb;
  else if (loi === 2) U = U0 + (Ub - U0) * Math.pow(f / fb, 2);
  else U = U0 + ((Ub - U0) * f) / fb;
  return Math.min(Umax, U);
}

/** Point de fonctionnement avec tension à flux nominal, plafonnée à Umax. */
function pointFluxIdeal(M, f, Cr, Umax = 400) {
  const cible = (n) => Cr(n);
  let n = (60 * f) / M.p - M.dnn;
  let r = null;
  for (let k = 0; k < 6; k += 1) {
    r = fluxNominal(M, f, Math.max(1e-6, cible(Math.max(0, n))));
    if (!r) break;
    n = (60 * f) / M.p - r.dn;
  }
  if (r && r.U <= Umax) return { U: r.U, point: pointStable(M, f, r.U, Cr) };
  return { U: Umax, point: pointStable(M, f, Umax, Cr) };
}

const MOTEUR_CONVOYEUR = preparer({ nom: "moteur du convoyeur", R1: 0.55, R2: 0.313, X1: 1.05, X2: 1.35, Xm: 32, p: 2, Pn: 11000, nn: 1460, In: 19.8, Un: 400 });
const MOTEUR_POMPE = preparer({ nom: "moteur de la pompe", R1: 0.115, R2: 0.076, X1: 0.36, X2: 0.48, Xm: 11.5, p: 2, Pn: 30000, nn: 1475, In: 52.6, Un: 400 });

/* Moteur 230/400 V de même puissance, couplé en triangle sur 400 V : impédances divisées par 3. */
const MOTEUR_87 = preparer({ nom: "moteur 230/400 V", R1: 0.55 / 3, R2: 0.313 / 3, X1: 1.05 / 3, X2: 1.35 / 3, Xm: 32 / 3, p: 2, Pn: 11000, nn: 1460, In: 19.8 * RAC3, Un: 230.94 });

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

function marqueur(id, ouvert) {
  return (
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto-start-reverse">' +
    (ouvert ? '<path d="M0 0 9 4 0 8" fill="none" stroke="currentColor" stroke-width="1.4"/>' : '<path d="M0 0 9 4 0 8Z" fill="currentColor"/>') +
    "</marker>"
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
    const aGauche = px > repere.boite.x + repere.boite.l * 0.7;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

function ligneH(c, repere, couleurs, y, libelle, tirets = [7, 5]) {
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
    c.fillText(libelle, repere.boite.x + repere.boite.l - 4, py - 6);
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

function traceCorrection(moteurApi, conteneur, options) {
  const traceur = moteurApi.sim.traceur(conteneur, {
    genre: "Correction visuelle",
    ratio: 0.42,
    echantillons: 300,
    ...options,
  });
  if (traceur) ressources.push(traceur);
  return traceur;
}

/** Schéma annoté inséré dans une correction, tracé progressivement. */
function schemaCorrection(moteurApi, conteneur, viewBox, dessin, legende) {
  const figure = document.createElement("figure");
  figure.className = "visuel-correction";
  const svg = svgEl("svg", { viewBox, role: "img", "aria-label": legende });
  svg.innerHTML = dessin;
  figure.appendChild(svg);
  const texteLegende = document.createElement("figcaption");
  texteLegende.textContent = legende;
  figure.appendChild(texteLegende);
  conteneur.appendChild(figure);
  const trace = moteurApi.dessiner(svg, { duree: 1.4 });
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

/** Barres horizontales annotées, pour comparer des grandeurs dans une correction. */
function dessinBarres(lignes, maximum, unite, largeur = 560) {
  const x0 = 210;
  const l = largeur - x0 - 100;
  let d = TRAITS + ' stroke-width="1.4"><path d="M' + x0 + " 14V" + (24 + lignes.length * 30) + '"/></g>';
  d += '<g stroke="currentColor" stroke-width="1.4">';
  lignes.forEach(([, valeur, plein], i) => {
    const w = Math.max(1, (valeur / maximum) * l);
    d += '<rect x="' + x0 + '" y="' + (20 + i * 30) + '" width="' + w.toFixed(1) + '" height="18" rx="2" fill="currentColor" fill-opacity="' + (plein ? 0.45 : 0.12) + '"/>';
  });
  d += "</g>" + ECRITS;
  lignes.forEach(([nom, valeur], i) => {
    d += texte(12, 33 + i * 30, nom) + texte(x0 + Math.max(1, (valeur / maximum) * l) + 8, 33 + i * 30, String(valeur).replace(".", ",") + " " + unite);
  });
  return d + "</g>";
}

function hauteurBarres(n) {
  return 34 + n * 30;
}

/** Chaîne de variation de vitesse simplifiée, pour la question de lecture de schéma. */
function dessinChaine(id) {
  return (
    "<defs>" + marqueur(id) + "</defs>" +
    TRAITS + ' stroke-width="2">' +
    '<path d="M20 100H90M180 70H300M180 130H300M390 100H440"/>' +
    '<rect x="90" y="60" width="90" height="80" rx="6"/>' +
    '<path d="M222 70V92M222 108V130"/><path d="M206 92H238M206 108H238" stroke-width="3"/>' +
    '<rect x="300" y="60" width="90" height="80" rx="6"/>' +
    '<circle cx="470" cy="100" r="30"/></g>' +
    TRAITS + ' stroke-width="2.4"><path d="M30 40H76" marker-end="url(#' + id + ')"/><path d="M400 40H446" marker-end="url(#' + id + ')"/></g>' +
    ECRITS + texte(20, 92, "réseau") + texte(100, 104, "redresseur") + texte(246, 104, "C") + texte(196, 160, "bus continu") +
    texte(312, 104, "onduleur") + texte(458, 104, "M 3~") + texte(20, 196, "flèches : sens de l'énergie en fonctionnement moteur") + "</g>"
  );
}

const ZONES_CHAINE = [
  { x: 86, y: 56, largeur: 98, hauteur: 88, etiquette: "redresseur" },
  { x: 192, y: 62, largeur: 62, hauteur: 76, etiquette: "bus continu" },
  { x: 296, y: 56, largeur: 98, hauteur: 88, etiquette: "onduleur" },
  { x: 436, y: 66, largeur: 68, hauteur: 68, etiquette: "moteur" },
];

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
  construireAnimFlux(racine, api);
  construireAnimTapis(racine, api);
  construireAnimFresnel(racine, api);
  construireSimCouple(racine, api);
  construireSimZones(racine, api);
  construireAnimRampe(racine, api);
  construireSimPompe(racine, api);
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
    ["#d-chaine-figure svg", 1.6],
    ["#e-schema-figure svg", 1.5],
    ["#f-schema-principal svg", 1.8],
    ["#f-zones-figure svg", 1.6],
    ["#h-figure svg", 1.4],
    ["#i-pompe-figure svg", 1.7],
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
   Synchronisation d'une poignée, d'un curseur et d'un lecteur
   -------------------------------------------------------------------------- */

function synchroniseur(dessiner, options = {}) {
  const etatSync = { poignee: null, curseurs: null, lecteur: null, idCurseur: options.idCurseur, verrou: false, valeur: null };
  etatSync.appliquer = (valeur, source) => {
    if (etatSync.verrou) return;
    etatSync.verrou = true;
    etatSync.valeur = valeur;
    dessiner(valeur);
    if (source !== "poignee" && etatSync.poignee) etatSync.poignee.set(valeur, false);
    if (source !== "curseur" && etatSync.curseurs) etatSync.curseurs.definir(etatSync.idCurseur, valeur);
    if (source !== "lecteur" && etatSync.lecteur) etatSync.lecteur.suivre(valeur);
    etatSync.verrou = false;
  };
  etatSync.redessiner = () => {
    if (etatSync.valeur != null) dessiner(etatSync.valeur);
  };
  return etatSync;
}

function chaine(points) {
  return points.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-synchronisme",
      titre: "Fréquence et vitesse de synchronisme",
      niveau: "prérequis",
      enonce:
        "<p>Un moteur asynchrone à quatre pôles doit avoir un champ tournant à $900\\ \\mathrm{tr/min}$. Quelle fréquence le variateur doit-il " +
        "appliquer ?</p>",
      valeur: 30,
      unite: "Hz",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Fréquence $f$",
      etapes: [
        { texte: "Quatre pôles, soit $p = 2$ paires de pôles." },
        { texte: "$n_s = 60f/p$, donc $f = p\\,n_s/60 = 2 \\times 900/60 = 30\\ \\mathrm{Hz}$." },
        { texte: "Contrôle : à $50\\ \\mathrm{Hz}$, $n_s = 1500\\ \\mathrm{tr/min}$ ; $900/1500 = 30/50$.", note: "La vitesse de synchronisme est strictement proportionnelle à la fréquence." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurEtapes(3),
          dessinEtapes(["4 pôles : p = 2", "f = p n_s / 60 = 2 × 900 / 60", "f = 30 Hz"], 560),
          "Étapes révélées une à une, de la vitesse du champ à la fréquence."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-flux",
      titre: "Flux sous tension fixe et fréquence réduite",
      niveau: "prérequis",
      enonce:
        "<p>Un enroulement prévu pour $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$ est alimenté sous $230\\ \\mathrm{V}$ à $40\\ \\mathrm{Hz}$. En négligeant sa " +
        "résistance, que vaut son flux crête rapporté au flux crête nominal ?</p>",
      valeur: 1.25,
      unite: "",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Rapport $\\hat{\\varPhi}/\\hat{\\varPhi}_n$",
      etapes: [
        { texte: "$E = 4{,}44\\,N f\\,\\hat{\\varPhi}$, donc $\\hat{\\varPhi} \\propto E/f \\approx V/f$." },
        { texte: "$\\hat{\\varPhi}/\\hat{\\varPhi}_n = (230/40)/(230/50) = 50/40 = 1{,}25$." },
        { texte: "Le flux augmente de $25\\ \\%$ : le fer sature et le courant magnétisant croît bien plus que de $25\\ \\%$.", note: "Pour garder le flux, il faudrait $230 \\times 40/50 = 184\\ \\mathrm{V}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Flux crête relatif sous 230 V en fonction de la fréquence",
          xTitre: "fréquence",
          xUnite: "Hz",
          yTitre: "flux relatif",
          xMin: 20,
          xMax: 80,
          yMin: 0,
          yMax: 2.6,
          series: [{ id: "phi", nom: "flux crête relatif, 50 / f", couleur: "serie-1", epaisseur: 2.4, fonction: (f) => 50 / f }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 1, "flux nominal");
            pointTrace(c, repere, couleurs, 40, 1.25, "1,25 à 40 Hz");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-glissement",
      titre: "Vitesse à demi-charge",
      niveau: "prérequis",
      enonce:
        "<p>Un moteur à quatre pôles, $50\\ \\mathrm{Hz}$, tourne à $1460\\ \\mathrm{tr/min}$ sous son couple nominal. Dans la zone utile, où le " +
        "glissement est proportionnel au couple, à quelle vitesse tourne-t-il sous la moitié de ce couple ?</p>",
      valeur: 1480,
      unite: "tr/min",
      tolerance: 0.002,
      chiffres: 0,
      libelleChamp: "Vitesse $n$",
      etapes: [
        { texte: "Écart nominal : $1500 - 1460 = 40\\ \\mathrm{tr/min}$." },
        { texte: "À demi-couple, l'écart est divisé par deux : $20\\ \\mathrm{tr/min}$." },
        { texte: "$n = 1500 - 20 = 1480\\ \\mathrm{tr/min}$.", note: "Cette proportionnalité est la base de tout le calcul de fréquence de la séance." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const M = MOTEUR_CONVOYEUR;
        traceCorrection(moteurApi, conteneur, {
          titre: "Zone utile de la courbe couple-vitesse à 50 Hz",
          xTitre: "vitesse n",
          xUnite: "tr/min",
          yTitre: "couple",
          yUnite: "× C_n",
          xMin: 1400,
          xMax: 1500,
          yMin: 0,
          yMax: 1.6,
          series: [{ id: "c", nom: "couple du moteur à 50 Hz", couleur: "serie-1", epaisseur: 2.4, fonction: (n) => etat(M, 50, 400, n).C / M.Cn }],
          surDessin({ c, repere, couleurs }) {
            pointTrace(c, repere, couleurs, 1460, 1, "C_n à 1460");
            pointTrace(c, repere, couleurs, 1480, 0.5, "C_n/2 vers 1480");
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : le flux imposé par la tension et la fréquence
   -------------------------------------------------------------------------- */

const NOMS_LOIS_FLUX = ["tension fixe 400 V", "U/f constant, sans plafond", "U/f constant, plafonné à 400 V"];

function courantMagnetisant(phi) {
  return phi + 8 * Math.pow(Math.max(0, phi - 1), 2);
}

function construireAnimFlux(racine, api) {
  const conteneur = racine.querySelector("#d-flux");
  if (!conteneur) return;

  const reglages = { f: 50, loi: 2 };
  const T_MAX = 0.1;
  const G = { x0: 60, x1: 500, yc: 180, k: 52 };
  const D = { x0: 570, x1: 720, yb: 300, yh: 70 };
  const AXE = { x0: 60, x1: 500, y: 352 };
  const xT = (t) => G.x0 + (t / T_MAX) * (G.x1 - G.x0);
  const yG = (v) => G.yc - Math.max(-2.6, Math.min(2.6, v)) * G.k;
  const xPhi = (phi) => D.x0 + (Math.min(phi, 2.5) / 2.5) * (D.x1 - D.x0);
  const yIm = (i) => D.yb - (Math.min(i, 12) / 12) * (D.yb - D.yh);
  const id = nouveauMarqueur("fl-d-flux");

  const svg = svgEl("svg", {
    viewBox: "0 0 740 392",
    role: "img",
    "aria-label": "Tension et flux d'une phase en fonction du temps pour la fréquence et la loi choisies, et courant magnétisant correspondant sur une courbe de saturation supposée",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(id);
  let fond =
    TRAITS + ' stroke-width="1.4">' +
    '<path d="M' + G.x0 + " " + (G.yc + 145) + "V" + (G.yc - 150) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + (G.x0 - 6) + " " + G.yc + "H" + (G.x1 + 16) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + D.x0 + " " + (D.yb + 6) + "V" + (D.yh - 16) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + (D.x0 - 6) + " " + D.yb + "H" + (D.x1 + 14) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + AXE.x0 + " " + AXE.y + "H" + AXE.x1 + '"/>';
  let ecrits = "";
  for (let k = 0; k <= 10; k += 1) {
    const t = k * 0.01;
    fond += '<path d="M' + xT(t).toFixed(1) + " " + (AXE.y - 5) + 'v10"/>';
    if (k % 2 === 0) ecrits += texte(xT(t) - 8, AXE.y + 22, String(k * 10));
  }
  for (const v of [-2, -1, 1, 2]) {
    fond += '<path d="M' + G.x0 + " " + yG(v).toFixed(1) + 'h-5"/>';
    ecrits += texte(G.x0 - 22, yG(v) + 4, String(v));
  }
  for (const phi of [1, 2]) {
    fond += '<path d="M' + xPhi(phi).toFixed(1) + " " + D.yb + 'v5"/>';
    ecrits += texte(xPhi(phi) - 4, D.yb + 18, String(phi));
  }
  for (const i of [4, 8, 12]) {
    fond += '<path d="M' + D.x0 + " " + yIm(i).toFixed(1) + 'h-5"/>';
    ecrits += texte(D.x0 - 22, yIm(i) + 4, String(i));
  }
  fond += "</g>";
  fond += TRAITS + ' stroke-width="1.2" stroke-dasharray="7 5"><path d="M' + G.x0 + " " + yG(1).toFixed(1) + "H" + G.x1 + "M" + G.x0 + " " + yG(-1).toFixed(1) + "H" + G.x1 + '"/></g>';
  const sat = [];
  for (let i = 0; i <= 120; i += 1) {
    const phi = (2.5 * i) / 120;
    if (courantMagnetisant(phi) > 12) break;
    sat.push([xPhi(phi), yIm(courantMagnetisant(phi))]);
  }
  fond += '<polyline points="' + chaine(sat) + '" fill="none" stroke="currentColor" stroke-width="2"/>';
  ecrits +=
    texte(G.x0 - 10, 18, "valeur relative à la crête nominale") +
    texte(G.x1 - 10, G.yc - 8, "t") +
    texte(G.x1 - 120, yG(1) - 6, "flux nominal") +
    texte(D.x0 - 10, D.yh - 22, "i_µ / i_µn") +
    texte(D.x1 - 30, D.yb + 34, "Φ / Φ_n") +
    texte(D.x0, D.yb + 52, "saturation supposée") +
    texte(AXE.x1 - 50, AXE.y - 10, "t (ms)");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecrits + "</g>";
  const clipId = nouveauMarqueur("clip-d-flux");
  const clip = svgEl("clipPath", { id: clipId });
  clip.appendChild(svgEl("rect", { x: G.x0, y: G.yc - 142, width: G.x1 - G.x0, height: 284 }));
  defs.appendChild(clip);
  const courbes = svgEl("g", { fill: "none", stroke: "currentColor", "clip-path": "url(#" + clipId + ")" });
  const mobile = svgEl("g", { fill: "none", stroke: "currentColor" });
  const ecritsMobiles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, groupeFond, courbes, mobile, ecritsMobiles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-flux-valeurs", [
    { id: "t", libelle: "Instant", unite: "ms", decimales: 1 },
    { id: "U", libelle: "Tension composée appliquée", unite: "V", decimales: 1 },
    { id: "UsurF", libelle: "Rapport U/f", unite: "V/Hz", decimales: 2 },
    { id: "phi", libelle: "Flux crête / flux nominal", decimales: 2 },
    { id: "im", libelle: "Courant magnétisant / nominal", decimales: 2 },
    { id: "etat", libelle: "État du circuit magnétique", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function grandeurs() {
    const f = reglages.f;
    let U = 400;
    if (reglages.loi === 1) U = 8 * f;
    else if (reglages.loi === 2) U = Math.min(400, 8 * f);
    return { f, U, u: U / 400, phi: (U / 400) * (50 / f) };
  }

  function tracerCourbes() {
    const g = grandeurs();
    const ptsV = [];
    const ptsP = [];
    for (let i = 0; i <= 400; i += 1) {
      const t = (T_MAX * i) / 400;
      ptsV.push([xT(t), yG(g.u * Math.sin(TAU * g.f * t))]);
      ptsP.push([xT(t), yG(-g.phi * Math.cos(TAU * g.f * t))]);
    }
    courbes.innerHTML =
      '<polyline points="' + chaine(ptsV) + '" stroke-width="1.5"/>' +
      '<polyline points="' + chaine(ptsP) + '" stroke-width="3" stroke-linejoin="round"/>';
  }

  function dessiner(t) {
    const g = grandeurs();
    const v = g.u * Math.sin(TAU * g.f * t);
    const p = -g.phi * Math.cos(TAU * g.f * t);
    const im = courantMagnetisant(g.phi);
    const x = xT(t);
    mobile.innerHTML =
      '<path d="M' + x.toFixed(1) + " " + (G.yc - 142) + "V" + (G.yc + 142) + '" stroke-width="1" stroke-dasharray="3 3"/>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + yG(p).toFixed(1) + '" r="5" fill="currentColor"/>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + yG(v).toFixed(1) + '" r="4" fill="none" stroke-width="1.6"/>' +
      '<circle cx="' + xPhi(g.phi).toFixed(1) + '" cy="' + yIm(im).toFixed(1) + '" r="5" fill="currentColor"/>' +
      '<path d="M' + xPhi(g.phi).toFixed(1) + " " + D.yb + "V" + yIm(im).toFixed(1) + "H" + D.x0 + '" stroke-width="1" stroke-dasharray="3 3"/>';
    const hors = g.phi > 2.6 ? " ; flux hors échelle, écrêté à l'affichage" : "";
    ecritsMobiles.innerHTML =
      texte(G.x0 + 8, G.yc + 136, nombre(api, g.f, 0) + " Hz, " + nombre(api, g.U, 0) + " V : flux crête " + nombre(api, g.phi, 2) + " fois le nominal" + hors) +
      texte(D.x0, D.yh - 4, im > 12 ? "i_µ hors échelle" : "");
    let etatCircuit = "flux nominal";
    if (g.phi > 1.02) etatCircuit = im > 3 ? "saturation forte" : "saturation";
    else if (g.phi < 0.98) etatCircuit = "flux réduit, défluxage";
    if (valeurs) valeurs.maj({ t: t * 1000, U: g.U, UsurF: g.U / g.f, phi: g.phi, im, etat: etatCircuit });
  }

  const synchro = synchroniseur(dessiner, { idCurseur: "t" });

  const reglagesCurseurs = api.sim.curseurs(
    "#d-flux-curseurs",
    [
      { id: "f", libelle: "Fréquence f", min: 5, max: 100, pas: 1, valeur: 50, unite: "Hz" },
      { id: "loi", libelle: "Loi de commande", min: 0, max: 2, pas: 1, valeur: 2, format: (v) => NOMS_LOIS_FLUX[Math.round(v)] },
      { id: "t", libelle: "Instant observé", min: 0, max: T_MAX, pas: 0.0005, valeur: 0, format: (v) => nombre(api, v * 1000, 1) + " ms" },
    ],
    (lues) => {
      const change = lues.f !== reglages.f || Math.round(lues.loi) !== reglages.loi;
      reglages.f = lues.f;
      reglages.loi = Math.round(lues.loi);
      if (change) tracerCourbes();
      synchro.appliquer(lues.t, "curseur");
    }
  );
  if (reglagesCurseurs) ressources.push(reglagesCurseurs);
  synchro.curseurs = reglagesCurseurs;

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: AXE.x0, y: AXE.y },
    a: { x: AXE.x1, y: AXE.y },
    min: 0,
    max: T_MAX,
    pas: 0.0005,
    valeur: 0,
    libelle: "Instant observé sur l'axe du temps",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  synchro.lecteur = api.sim.lecteur("#d-flux-lecteur", {
    de: 0,
    a: T_MAX,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Défilement du temps, ralenti cent fois",
    rappel: (t) => synchro.appliquer(t, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);

  tracerCourbes();
  synchro.appliquer(0, null);
}

/* --------------------------------------------------------------------------
   D. Animation : l'écart de vitesse constant
   -------------------------------------------------------------------------- */

/** Écart de vitesse du moteur du convoyeur : flux nominal tant que la tension le permet, puis 400 V. */
function pointTapis(f, C) {
  const M = MOTEUR_CONVOYEUR;
  const r = fluxNominal(M, f, C);
  if (r && r.U <= 400) return { dn: r.dn, U: r.U, psi: 1, mode: "flux nominal" };
  const p = pointStable(M, f, 400, () => C);
  if (!p) return { dn: NaN, U: 400, psi: NaN, mode: "décrochage" };
  return { dn: (60 * f) / M.p - p.n, U: 400, psi: p.e.psi / M.Psin, mode: "défluxage" };
}

function construireAnimTapis(racine, api) {
  const conteneur = racine.querySelector("#d-tapis");
  if (!conteneur) return;

  const reglages = { f: 25, C: 60 };
  let point = pointTapis(25, 60);
  const T_MAX = 30;
  const DISQUE = { x: 200, y: 120, r: 88 };
  const VIT = { x0: 60, x1: 700, y: 268 };
  const FREQ = { x0: 60, x1: 700, y: 352, fMin: 5, fMax: 100 };
  const xV = (n) => VIT.x0 + (n / 3200) * (VIT.x1 - VIT.x0);
  const xF = (f) => FREQ.x0 + ((f - FREQ.fMin) / (FREQ.fMax - FREQ.fMin)) * (FREQ.x1 - FREQ.x0);
  const id = nouveauMarqueur("fl-d-tap");
  const idOuvert = nouveauMarqueur("fl-d-tap-o");
  const hach = nouveauMarqueur("hach-d-tap");

  const svg = svgEl("svg", {
    viewBox: "0 0 740 390",
    role: "img",
    "aria-label": "Disque du champ tournant et du rotor, et axe des vitesses portant la vitesse de synchronisme, la vitesse du rotor et leur écart, pour la fréquence choisie sur l'axe des fréquences",
  });
  const defs = svgEl("defs");
  defs.innerHTML =
    marqueur(id) + marqueur(idOuvert, true) +
    '<pattern id="' + hach + '" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<path d="M0 0V7" stroke="currentColor" stroke-width="1.6" opacity="0.5"/></pattern>';
  let fond =
    TRAITS + ' stroke-width="1.6"><circle cx="' + DISQUE.x + '" cy="' + DISQUE.y + '" r="' + DISQUE.r + '"/></g>' +
    TRAITS + ' stroke-width="1.4">' +
    '<path d="M' + VIT.x0 + " " + VIT.y + "H" + (VIT.x1 + 14) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + FREQ.x0 + " " + FREQ.y + "H" + FREQ.x1 + '"/>';
  let ecrits = "";
  for (let n = 0; n <= 3000; n += 500) {
    fond += '<path d="M' + xV(n).toFixed(1) + " " + VIT.y + 'v6"/>';
    ecrits += texte(xV(n) - 12, VIT.y + 22, String(n));
  }
  for (const f of [5, 25, 50, 75, 100]) {
    fond += '<path d="M' + xF(f).toFixed(1) + " " + (FREQ.y - 5) + 'v10"/>';
    ecrits += texte(xF(f) - 8, FREQ.y + 24, String(f));
  }
  fond += "</g>";
  ecrits +=
    texte(VIT.x1 - 60, VIT.y - 12, "n (tr/min)") + texte(FREQ.x1 - 40, FREQ.y - 12, "f (Hz)") +
    texte(330, 52, "flèche creuse : champ tournant, n_s") + texte(330, 72, "flèche pleine : rotor, n") +
    texte(330, 92, "secteur hachuré : retard accumulé") + texte(330, 112, "vitesses de rotation divisées par 100");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecrits + "</g>";
  const mobile = svgEl("g", { fill: "none", stroke: "currentColor" });
  const ecritsMobiles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, groupeFond, mobile, ecritsMobiles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-tapis-valeurs", [
    { id: "f", libelle: "Fréquence", unite: "Hz", decimales: 1 },
    { id: "U", libelle: "Tension appliquée", unite: "V", decimales: 1 },
    { id: "ns", libelle: "Vitesse de synchronisme", unite: "tr/min", decimales: 1 },
    { id: "n", libelle: "Vitesse du rotor", unite: "tr/min", decimales: 1 },
    { id: "dn", libelle: "Écart Δn", unite: "tr/min", decimales: 1 },
    { id: "g", libelle: "Glissement relatif", unite: "%", decimales: 2 },
    { id: "fr", libelle: "Fréquence rotorique", unite: "Hz", decimales: 3 },
    { id: "psi", libelle: "Flux / flux nominal", decimales: 3 },
    { id: "mode", libelle: "Régime", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  let temps = 0;
  function rayon(angle, longueur) {
    return [DISQUE.x + longueur * Math.cos(angle), DISQUE.y - longueur * Math.sin(angle)];
  }

  function dessiner() {
    const f = reglages.f;
    const ns = 30 * f;
    const cale = !Number.isFinite(point.dn);
    const n = cale ? 0 : ns - point.dn;
    const aS = (TAU * ns * temps) / 6000;
    const aR = (TAU * n * temps) / 6000;
    const [xs, ys] = rayon(aS, DISQUE.r - 6);
    const [xr, yr] = rayon(aR, DISQUE.r - 22);
    const retard = Math.min(aS - aR, TAU * 0.999);
    let secteur = "";
    if (retard > 0.002) {
      const [xa, ya] = rayon(aR, DISQUE.r - 30);
      const [xb, yb] = rayon(aS, DISQUE.r - 30);
      secteur =
        '<path d="M' + DISQUE.x + " " + DISQUE.y + "L" + xa.toFixed(1) + " " + ya.toFixed(1) + "A" + (DISQUE.r - 30) + " " + (DISQUE.r - 30) + " 0 " +
        (retard > Math.PI ? 1 : 0) + " 0 " + xb.toFixed(1) + " " + yb.toFixed(1) + 'Z" fill="url(#' + hach + ')" stroke="none"/>';
    }
    const xns = xV(ns);
    const xn = xV(n);
    mobile.innerHTML =
      secteur +
      '<path d="M' + DISQUE.x + " " + DISQUE.y + "L" + xs.toFixed(1) + " " + ys.toFixed(1) + '" stroke-width="2.4" marker-end="url(#' + idOuvert + ')"/>' +
      '<path d="M' + DISQUE.x + " " + DISQUE.y + "L" + xr.toFixed(1) + " " + yr.toFixed(1) + '" stroke-width="3.6" marker-end="url(#' + id + ')"/>' +
      '<circle cx="' + DISQUE.x + '" cy="' + DISQUE.y + '" r="4" fill="currentColor"/>' +
      '<path d="M' + xns.toFixed(1) + " " + (VIT.y - 4) + "l-7 -12h14z" + '" fill="none" stroke-width="1.8"/>' +
      (cale ? "" : '<circle cx="' + xn.toFixed(1) + '" cy="' + (VIT.y - 10) + '" r="5.5" fill="currentColor"/>') +
      (cale ? "" : '<path d="M' + xn.toFixed(1) + " " + (VIT.y - 30) + "v-6H" + xns.toFixed(1) + "v6" + '" stroke-width="1.4"/>');
    ecritsMobiles.innerHTML =
      texte(xns - 10, VIT.y - 22, "n_s") +
      (cale
        ? texte(VIT.x0 + 10, VIT.y - 48, "décrochage : le couple demandé dépasse le couple maximal à cette fréquence")
        : texte(Math.min(xn, xns) - 30, VIT.y - 44, "Δn = " + nombre(api, point.dn, 1) + " tr/min")) +
      texte(330, 150, nombre(api, f, 1) + " Hz, " + nombre(api, point.U, 0) + " V, " + nombre(api, reglages.C, 0) + " N·m") +
      texte(330, 172, point.mode);
    if (valeurs) {
      valeurs.maj({
        f,
        U: point.U,
        ns,
        n: cale ? NaN : n,
        dn: point.dn,
        g: cale ? NaN : (point.dn / ns) * 100,
        fr: cale ? NaN : (point.dn * 2) / 60,
        psi: point.psi,
        mode: point.mode,
      });
    }
  }

  const synchro = synchroniseur(
    (f) => {
      reglages.f = f;
      point = pointTapis(f, reglages.C);
      dessiner();
    },
    { idCurseur: "f" }
  );

  synchro.curseurs = api.sim.curseurs(
    "#d-tapis-curseurs",
    [
      { id: "f", libelle: "Fréquence f", min: 5, max: 100, pas: 0.5, valeur: 25, unite: "Hz" },
      { id: "C", libelle: "Couple de charge", min: 0, max: 90, pas: 1, valeur: 60, format: (v) => nombre(api, v, 0) + " N·m" },
    ],
    (lues) => {
      if (lues.C !== reglages.C) {
        reglages.C = lues.C;
        point = pointTapis(reglages.f, reglages.C);
        dessiner();
      }
      synchro.appliquer(lues.f, "curseur");
    }
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: FREQ.x0, y: FREQ.y },
    a: { x: FREQ.x1, y: FREQ.y },
    min: FREQ.fMin,
    max: FREQ.fMax,
    pas: 0.5,
    valeur: 25,
    libelle: "Fréquence sur l'axe des fréquences",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  const lecteur = api.sim.lecteur("#d-tapis-lecteur", {
    de: 0,
    a: T_MAX,
    duree: T_MAX,
    boucle: false,
    auto: false,
    libelle: "Rotation du champ et du rotor, ralentie cent fois",
    rappel: (t) => {
      temps = t;
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);

  synchro.appliquer(25, null);
}

/* --------------------------------------------------------------------------
   E. Animation : diagramme de Fresnel de la maille statorique
   -------------------------------------------------------------------------- */

const NOMS_LOIS_FRESNEL = ["proportionnelle, 8 V/Hz", "compensation fixe U0 = 12 V", "compensation idéale, flux nominal"];

function construireAnimFresnel(racine, api) {
  const conteneur = racine.querySelector("#e-fresnel");
  if (!conteneur) return;
  const M = MOTEUR_CONVOYEUR;
  const reglages = { loi: 2, charge: 1 };
  const O = { x: 70, y: 250 };
  const LONGUEUR = 470;
  const ECH_I = 150 / M.In;
  const AXE = { x0: 70, x1: 680, y: 340, fMin: 2, fMax: 100 };
  const xF = (f) => AXE.x0 + ((f - AXE.fMin) / (AXE.fMax - AXE.fMin)) * (AXE.x1 - AXE.x0);
  const id = nouveauMarqueur("fl-e-fr");
  const idOuvert = nouveauMarqueur("fl-e-fr-o");

  const svg = svgEl("svg", {
    viewBox: "0 0 740 380",
    role: "img",
    "aria-label": "Diagramme de Fresnel de la maille statorique : force électromotrice, chute dans la résistance, chute dans la réactance de fuite et tension appliquée, pour la fréquence choisie sur l'axe du bas",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(id) + marqueur(idOuvert, true);
  let fond = TRAITS + ' stroke-width="1.2" stroke-dasharray="2 4"><path d="M' + O.x + " " + O.y + "H" + (O.x + LONGUEUR + 60) + '"/></g>';
  fond += TRAITS + ' stroke-width="1.4"><path d="M' + AXE.x0 + " " + AXE.y + "H" + AXE.x1 + '"/>';
  let ecrits = "";
  for (const f of [2, 10, 25, 50, 75, 100]) {
    fond += '<path d="M' + xF(f).toFixed(1) + " " + (AXE.y - 5) + 'v10"/>';
    ecrits += texte(xF(f) - 8, AXE.y + 24, String(f));
  }
  fond += "</g>";
  ecrits += texte(AXE.x1 - 40, AXE.y - 12, "f (Hz)") + texte(O.x + LONGUEUR - 40, O.y + 40, "axe de E, référence des phases");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecrits + "</g>";
  const mobile = svgEl("g", { fill: "none", stroke: "currentColor" });
  const ecritsMobiles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, groupeFond, mobile, ecritsMobiles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-fresnel-valeurs", [
    { id: "f", libelle: "Fréquence", unite: "Hz", decimales: 1 },
    { id: "U", libelle: "Tension composée", unite: "V", decimales: 1 },
    { id: "V", libelle: "Tension simple V", unite: "V", decimales: 1 },
    { id: "E", libelle: "Force électromotrice E", unite: "V", decimales: 1 },
    { id: "RI", libelle: "Chute R1 I1", unite: "V", decimales: 2 },
    { id: "XI", libelle: "Chute X1 I1", unite: "V", decimales: 2 },
    { id: "part", libelle: "R1 I1 / V", unite: "%", decimales: 1 },
    { id: "psi", libelle: "Flux / flux nominal", decimales: 3 },
    { id: "I", libelle: "Courant I1", unite: "A", decimales: 2 },
    { id: "n", libelle: "Vitesse", unite: "tr/min", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function calculer(f) {
    const C = reglages.charge * M.Cn;
    const Cr = () => C;
    let U;
    let p;
    if (reglages.loi === 2) {
      const r = pointFluxIdeal(M, f, Cr, 400);
      U = r.U;
      p = r.point;
    } else {
      U = loiTension(reglages.loi, f, 12, 400);
      p = pointStable(M, f, U, Cr);
    }
    return { U, p };
  }

  function dessiner(f) {
    const { U, p } = calculer(f);
    if (!p) {
      mobile.innerHTML = "";
      ecritsMobiles.innerHTML =
        texte(O.x, 80, "calage : à " + nombre(api, f, 1) + " Hz sous " + nombre(api, U, 1) + " V, le moteur ne porte pas ce couple") +
        texte(O.x, 102, "pas de point de fonctionnement, donc pas de diagramme") +
        '<circle cx="' + xF(f).toFixed(1) + '" cy="' + AXE.y + '" r="0"/>';
      if (valeurs) valeurs.maj({ f, U, V: U / RAC3, E: NaN, RI: NaN, XI: NaN, part: NaN, psi: NaN, I: NaN, n: NaN });
      return;
    }
    const e = p.e;
    const a = f / 50;
    const ref = cx(e.Ecx.re / e.E, -e.Ecx.im / e.E);
    const I1 = cMul(e.I1, ref);
    const Evec = cx(e.E, 0);
    const RI = cScal(I1, M.R1);
    const XI = cMul(cx(0, M.X1 * a), I1);
    const V = cAdd(cAdd(Evec, RI), XI);
    const k = LONGUEUR / cMod(V);
    const P = (z) => [O.x + z.re * k, O.y - z.im * k];
    const pE = P(Evec);
    const pR = P(cAdd(Evec, RI));
    const pV = P(V);
    const pI = [O.x + I1.re * ECH_I, O.y - I1.im * ECH_I];
    const seg = (a1, b1, attributs) => '<path d="M' + a1[0].toFixed(1) + " " + a1[1].toFixed(1) + "L" + b1[0].toFixed(1) + " " + b1[1].toFixed(1) + '"' + attributs + "/>";
    mobile.innerHTML =
      seg([O.x, O.y], pI, ' stroke-width="1.4" marker-end="url(#' + idOuvert + ')"') +
      seg([O.x, O.y], pE, ' stroke-width="4"') +
      seg(pE, pR, ' stroke-width="2.4"') +
      seg(pR, pV, ' stroke-width="2.4" stroke-dasharray="7 4"') +
      seg([O.x, O.y], pV, ' stroke-width="2.8" marker-end="url(#' + id + ')"') +
      '<circle cx="' + O.x + '" cy="' + O.y + '" r="3.5" fill="currentColor"/>';
    const pmR = [(pE[0] + pR[0]) / 2, (pE[1] + pR[1]) / 2];
    const pmX = [(pR[0] + pV[0]) / 2, (pR[1] + pV[1]) / 2];
    ecritsMobiles.innerHTML =
      texte((O.x + pE[0]) / 2 - 10, O.y + 22, "E") +
      texte(pmR[0] + 8, pmR[1] + 18, "R1 I1") +
      texte(pmX[0] + 10, pmX[1], "j X1 I1") +
      texte(pV[0] - 70, pV[1] - 14, "V") +
      texte(pI[0] + 8, pI[1] + 14, "I1") +
      texte(430, 40, "échelle : " + nombre(api, cMod(V) / LONGUEUR * 100, 2) + " V pour 100 px") +
      texte(430, 60, "courant : " + nombre(api, 100 / ECH_I, 1) + " A pour 100 px") +
      texte(O.x, 40, nombre(api, f, 1) + " Hz, " + nombre(api, U, 1) + " V, " + nombre(api, reglages.charge, 2) + " C_n");
    if (valeurs) {
      valeurs.maj({
        f,
        U,
        V: U / RAC3,
        E: e.E,
        RI: M.R1 * e.I,
        XI: M.X1 * a * e.I,
        part: ((M.R1 * e.I) / (U / RAC3)) * 100,
        psi: e.psi / M.Psin,
        I: e.I,
        n: p.n,
      });
    }
  }

  const synchro = synchroniseur(dessiner, { idCurseur: "f" });
  synchro.curseurs = api.sim.curseurs(
    "#e-fresnel-curseurs",
    [
      { id: "f", libelle: "Fréquence f", min: 2, max: 100, pas: 0.5, valeur: 50, unite: "Hz" },
      { id: "loi", libelle: "Loi de commande", min: 0, max: 2, pas: 1, valeur: 2, format: (v) => NOMS_LOIS_FRESNEL[Math.round(v)] },
      { id: "charge", libelle: "Couple de charge", min: 0.1, max: 1.5, pas: 0.05, valeur: 1, format: (v) => nombre(api, v, 2) + " C_n" },
    ],
    (lues) => {
      reglages.loi = Math.round(lues.loi);
      reglages.charge = lues.charge;
      synchro.appliquer(lues.f, "curseur");
    }
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: AXE.x0, y: AXE.y },
    a: { x: AXE.x1, y: AXE.y },
    min: AXE.fMin,
    max: AXE.fMax,
    pas: 0.5,
    valeur: 50,
    libelle: "Fréquence sur l'axe des fréquences",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  synchro.lecteur = api.sim.lecteur("#e-fresnel-lecteur", {
    de: AXE.fMin,
    a: AXE.fMax,
    duree: 20,
    boucle: false,
    auto: false,
    libelle: "Balayage de la fréquence de 2 à 100 Hz",
    rappel: (f) => synchro.appliquer(f, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);

  synchro.appliquer(50, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : courbes couple-vitesse sous variation de fréquence
   -------------------------------------------------------------------------- */

const NOMS_LOIS_COUPLE = ["proportionnelle, 8 V/Hz", "compensation fixe U0", "quadratique avec U0", "flux nominal idéal"];
const NOMS_CHARGES = ["couple constant", "couple quadratique, pompe"];

function construireSimCouple(racine, api) {
  const M = MOTEUR_CONVOYEUR;
  const reglages = { f: 25, loi: 1, U0: 12, type: 0, niveau: 1 };
  let resultat = null;

  const chargeDe = () => (reglages.type === 0 ? () => reglages.niveau * M.Cn : (n) => reglages.niveau * M.Cn * Math.pow(Math.max(0, n) / M.nn, 2));

  const trace = api.sim.traceur("#e-couple-trace", {
    titre: "Couple en fonction de la vitesse à la fréquence choisie",
    xTitre: "vitesse n",
    xUnite: "tr/min",
    yTitre: "couple",
    yUnite: "× C_n",
    xMin: 0,
    xMax: 3200,
    yMin: 0,
    yMax: 3,
    echantillons: 400,
    series: [
      { id: "f", nom: "courbe à la fréquence choisie", couleur: "serie-1", epaisseur: 3 },
      { id: "ref", nom: "référence 50 Hz, 400 V", couleur: "serie-6", epaisseur: 1.4 },
      { id: "charge", nom: "couple résistant", couleur: "serie-5", epaisseur: 2.2 },
    ],
    surDessin({ c, repere, couleurs }) {
      if (!resultat) return;
      ligneV(c, repere, couleurs, resultat.ns, "n_s");
      if (resultat.point) pointTrace(c, repere, couleurs, resultat.point.n, resultat.point.e.C / M.Cn, "fonctionnement");
      else pointTrace(c, repere, couleurs, resultat.max.n, resultat.max.C / M.Cn, "calage", true);
    },
  });
  if (trace) ressources.push(trace);

  const siFini = (decimales, unite) => (v) => (Number.isFinite(v) ? nombre(api, v, decimales) + (unite ? " " + unite : "") : "sans objet");
  const valeurs = api.sim.valeurs("#e-couple-valeurs", [
    { id: "ns", libelle: "Vitesse de synchronisme", format: siFini(1, "tr/min") },
    { id: "U", libelle: "Tension appliquée", format: siFini(1, "V") },
    { id: "UsurF", libelle: "Rapport U/f", format: siFini(2, "V/Hz") },
    { id: "cmax", libelle: "Couple maximal / C_n", format: siFini(2, "") },
    { id: "n", libelle: "Vitesse de fonctionnement", format: siFini(1, "tr/min") },
    { id: "dn", libelle: "Écart Δn", format: siFini(1, "tr/min") },
    { id: "g", libelle: "Glissement relatif", format: siFini(2, "%") },
    { id: "psi", libelle: "Flux / flux nominal", format: siFini(3, "") },
    { id: "I", libelle: "Courant de ligne", format: siFini(2, "A") },
    { id: "P", libelle: "Puissance mécanique", format: siFini(2, "kW") },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    const f = reglages.f;
    const Cr = chargeDe();
    let U;
    let point;
    if (reglages.loi === 3) {
      const r = pointFluxIdeal(M, f, Cr, 400);
      U = r.U;
      point = r.point;
    } else {
      U = loiTension(reglages.loi, f, reglages.U0, 400);
      point = pointStable(M, f, U, Cr);
    }
    const max = coupleMax(M, f, U);
    const ns = 30 * f;
    resultat = { ns, point, max };
    if (trace) {
      trace.definirFonction("f", (n) => (n < ns ? etat(M, f, U, n).C / M.Cn : NaN));
      trace.definirFonction("ref", (n) => (n < 1500 ? etat(M, 50, 400, n).C / M.Cn : NaN));
      trace.definirFonction("charge", (n) => Cr(n) / M.Cn);
    }
    let verdict = "fonctionnement stable";
    if (!point) verdict = "calage : le couple résistant dépasse le couple maximal";
    else if (point.e.I > 1.05 * M.In) verdict = "surcharge : courant supérieur au courant nominal";
    else if (max.C < 1.3 * Cr(point.n)) verdict = "marge au décrochage inférieure à 30 %";
    else if (point.e.psi / M.Psin > 1.08) verdict = "moteur surexcité";
    if (valeurs) {
      valeurs.maj({
        ns,
        U,
        UsurF: U / f,
        cmax: max.C / M.Cn,
        n: point ? point.n : NaN,
        dn: point ? ns - point.n : NaN,
        g: point ? ((ns - point.n) / ns) * 100 : NaN,
        psi: point ? point.e.psi / M.Psin : NaN,
        I: point ? point.e.I : NaN,
        P: point ? point.e.Pm / 1000 : NaN,
        verdict,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-couple-curseurs",
    [
      { id: "f", libelle: "Fréquence f", min: 1, max: 100, pas: 0.5, valeur: 25, unite: "Hz" },
      { id: "loi", libelle: "Loi de commande", min: 0, max: 3, pas: 1, valeur: 1, format: (v) => NOMS_LOIS_COUPLE[Math.round(v)] },
      { id: "U0", libelle: "Compensation U0", min: 0, max: 40, pas: 1, valeur: 12, unite: "V" },
      { id: "type", libelle: "Type de charge", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => NOMS_CHARGES[Math.round(v)] },
      { id: "niveau", libelle: "Niveau de charge", min: 0, max: 1.5, pas: 0.05, valeur: 1, format: (v) => nombre(api, v, 2) + " C_n" },
    ],
    (lues) => {
      reglages.f = lues.f;
      reglages.loi = Math.round(lues.loi);
      reglages.U0 = lues.U0;
      reglages.type = Math.round(lues.type);
      reglages.niveau = lues.niveau;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   E. Simulation : zones de fonctionnement à courant nominal
   -------------------------------------------------------------------------- */

/** Grandeurs disponibles à courant nominal pour une fréquence donnée. */
function disponibleAIn(M, f, U) {
  const ns = (60 * f) / M.p;
  const max = coupleMax(M, f, U);
  if (etat(M, f, U, max.n).I < M.In) return { C: max.C, e: etat(M, f, U, max.n), n: max.n, max };
  let bas = max.n;
  let haut = ns * (1 - 1e-7);
  for (let i = 0; i < 60; i += 1) {
    const m = (bas + haut) / 2;
    if (etat(M, f, U, m).I > M.In) bas = m;
    else haut = m;
  }
  const e = etat(M, f, U, haut);
  return { C: e.C, e, n: haut, max };
}

function construireSimZones(racine, api) {
  const reglages = { Umax: 400, couplage: 0 };
  let fb = 50;

  const trace = api.sim.traceur("#e-zones-trace", {
    titre: "Ce que le moteur fournit à courant nominal, en fonction de la fréquence",
    xTitre: "fréquence f",
    xUnite: "Hz",
    yTitre: "valeur relative",
    xMin: 0,
    xMax: 120,
    yMin: 0,
    yMax: 2,
    series: [
      { id: "U", nom: "tension U / U_n du moteur", couleur: "serie-6", epaisseur: 2.6 },
      { id: "psi", nom: "flux Ψ / Ψ_n", couleur: "serie-4", epaisseur: 2 },
      { id: "C", nom: "couple à I_n, C / C_n", couleur: "serie-1", epaisseur: 3 },
      { id: "P", nom: "puissance à I_n, P / P_n", couleur: "serie-3", epaisseur: 2.4 },
      { id: "Cmax", nom: "couple maximal / (2 C_n)", couleur: "serie-5", epaisseur: 1.8 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, fb, "f_b");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-zones-valeurs", [
    { id: "fb", libelle: "Fréquence de base", unite: "Hz", decimales: 1 },
    { id: "C50", libelle: "Couple à I_n à 50 Hz / C_n", decimales: 3 },
    { id: "Cmax50", libelle: "Couple maximal à 50 Hz / C_n", decimales: 2 },
    { id: "P80", libelle: "Puissance à I_n à 80 Hz / P_n", decimales: 2 },
    { id: "Cmax80", libelle: "Couple maximal à 80 Hz / C_n", decimales: 2 },
    { id: "Iligne", libelle: "Courant nominal de ligne du variateur", unite: "A", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    const M = reglages.couplage === 1 ? MOTEUR_87 : MOTEUR_CONVOYEUR;
    const Ub = M.Un;
    const U0 = Ub * 0.03;
    const loi = (f) => Math.min(reglages.Umax, U0 + ((Ub - U0) * f) / 50);
    fb = (50 * (reglages.Umax - U0)) / (Ub - U0);
    const pts = { U: [], psi: [], C: [], P: [], Cmax: [] };
    for (let i = 1; i <= 120; i += 1) {
      const f = i;
      const U = loi(f);
      const d = disponibleAIn(M, f, U);
      pts.U.push([f, U / Ub]);
      pts.psi.push([f, d.e.psi / M.Psin]);
      pts.C.push([f, d.C / M.Cn]);
      pts.P.push([f, (d.C * d.n * TAU) / 60 / M.Pn]);
      pts.Cmax.push([f, d.max.C / M.Cn / 2]);
    }
    if (trace) for (const cle of Object.keys(pts)) trace.definirDonnees(cle, pts[cle]);
    const lire = (f) => disponibleAIn(M, f, loi(f));
    const a50 = lire(50);
    const a80 = lire(80);
    if (valeurs) {
      valeurs.maj({
        fb,
        C50: a50.C / M.Cn,
        Cmax50: a50.max.C / M.Cn,
        P80: (a80.C * a80.n * TAU) / 60 / M.Pn,
        Cmax80: a80.max.C / M.Cn,
        Iligne: M.In,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-zones-curseurs",
    [
      { id: "Umax", libelle: "Tension maximale du variateur", min: 340, max: 440, pas: 5, valeur: 400, unite: "V" },
      { id: "couplage", libelle: "Moteur et couplage", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (Math.round(v) === 1 ? "230/400 V en triangle, dit 87 Hz" : "400/690 V en triangle, base 50 Hz") },
    ],
    (lues) => {
      reglages.Umax = lues.Umax;
      reglages.couplage = Math.round(lues.couplage);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   E. Animation : démarrage du convoyeur sur rampe de fréquence
   -------------------------------------------------------------------------- */

function simulerRampe(Tr, U0, options = {}) {
  const M = MOTEUR_CONVOYEUR;
  const J = options.J || 0.6;
  const Cr = options.Cr || 60;
  const Ilim = 1.5 * M.In;
  const dt = 0.001;
  const T = options.T || 12;
  let f = 0;
  let W = 0;
  let gel = 0;
  let tDecollage = null;
  const trace = [];
  for (let k = 0; k * dt < T; k += 1) {
    const t = k * dt;
    const fc = Math.max(f, 0.2);
    const U = Math.min(400, U0 + ((400 - U0) * fc) / 50);
    const n = (W * 30) / Math.PI;
    const e = etat(M, fc, U, Math.min(n, 30 * fc - 1e-6));
    if (e.I > Ilim && f < 50) gel += dt;
    else f = Math.min(50, f + (50 / Tr) * dt);
    let acc = (e.C - Cr) / J;
    if (W <= 0 && acc < 0) acc = 0;
    W += acc * dt;
    if (tDecollage == null && W > 0.5) tDecollage = t;
    if (k % 20 === 0) trace.push({ t, f: fc, ns: 30 * fc, n, I: e.I, C: e.C });
  }
  const fin = trace[trace.length - 1];
  const t95 = fin.n > 10 ? (trace.find((p) => p.n >= 0.95 * fin.n) || fin).t : NaN;
  let Imax = 0;
  for (const p of trace) Imax = Math.max(Imax, p.I);
  return { trace, gel, tDecollage, t95, Imax, fin };
}

function construireAnimRampe(racine, api) {
  const conteneur = racine.querySelector("#e-rampe");
  if (!conteneur) return;
  const M = MOTEUR_CONVOYEUR;
  const T_MAX = 12;
  const reglages = { Tr: 5, U0: 20 };
  let essai = simulerRampe(5, 20);

  const G = { x0: 60, x1: 340, yb: 290, yh: 50 };
  const D = { x0: 420, x1: 700, yb: 290, yh: 50 };
  const AXE = { x0: 60, x1: 700, y: 372 };
  const xG = (t) => G.x0 + (t / T_MAX) * (G.x1 - G.x0);
  const xD = (t) => D.x0 + (t / T_MAX) * (D.x1 - D.x0);
  const yN = (n) => G.yb - (n / 1600) * (G.yb - G.yh);
  const yI = (i) => D.yb - (Math.min(i, 3) / 3) * (D.yb - D.yh);
  const xT = (t) => AXE.x0 + (t / T_MAX) * (AXE.x1 - AXE.x0);
  const id = nouveauMarqueur("fl-e-ra");

  const svg = svgEl("svg", {
    viewBox: "0 0 740 410",
    role: "img",
    "aria-label": "Démarrage du convoyeur sur rampe : vitesse de synchronisme et vitesse du rotor en fonction du temps, courant de ligne rapporté au courant nominal en fonction du temps, et instant choisi sur l'axe du bas",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(id);
  let fond =
    TRAITS + ' stroke-width="1.4">' +
    '<path d="M' + G.x0 + " " + (G.yb + 6) + "V" + (G.yh - 18) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + (G.x0 - 6) + " " + G.yb + "H" + (G.x1 + 16) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + D.x0 + " " + (D.yb + 6) + "V" + (D.yh - 18) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + (D.x0 - 6) + " " + D.yb + "H" + (D.x1 + 16) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="M' + AXE.x0 + " " + AXE.y + "H" + AXE.x1 + '"/>';
  let ecrits = "";
  for (let t = 0; t <= 12; t += 2) {
    fond += '<path d="M' + xG(t).toFixed(1) + " " + G.yb + "v5M" + xD(t).toFixed(1) + " " + D.yb + "v5M" + xT(t).toFixed(1) + " " + (AXE.y - 5) + 'v10"/>';
    ecrits += texte(xG(t) - 4, G.yb + 18, String(t)) + texte(xD(t) - 4, D.yb + 18, String(t)) + texte(xT(t) - 4, AXE.y + 22, String(t));
  }
  for (let n = 0; n <= 1500; n += 500) {
    fond += '<path d="M' + G.x0 + " " + yN(n).toFixed(1) + 'h-5"/>';
    ecrits += texte(G.x0 - 40, yN(n) + 4, String(n));
  }
  for (let i = 0; i <= 3; i += 1) {
    fond += '<path d="M' + D.x0 + " " + yI(i).toFixed(1) + 'h-5"/>';
    ecrits += texte(D.x0 - 18, yI(i) + 4, String(i));
  }
  fond += "</g>" + TRAITS + ' stroke-width="1.2" stroke-dasharray="7 5"><path d="M' + D.x0 + " " + yI(1.5).toFixed(1) + "H" + D.x1 + '"/></g>';
  ecrits +=
    texte(G.x0 - 10, G.yh - 26, "vitesse (tr/min)") + texte(G.x1 - 20, G.yb + 36, "t (s)") +
    texte(D.x0 - 10, D.yh - 26, "courant de ligne (× I_n)") + texte(D.x1 - 20, D.yb + 36, "t (s)") +
    texte(D.x1 - 110, yI(1.5) - 6, "limite 1,5 I_n") + texte(AXE.x1 - 40, AXE.y - 12, "t (s)");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecrits + "</g>";
  const courbes = svgEl("g", { fill: "none", stroke: "currentColor" });
  const mobile = svgEl("g", { fill: "none", stroke: "currentColor" });
  const ecritsMobiles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, groupeFond, courbes, mobile, ecritsMobiles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-rampe-valeurs", [
    { id: "t", libelle: "Instant", unite: "s", decimales: 2 },
    { id: "f", libelle: "Fréquence appliquée", unite: "Hz", decimales: 2 },
    { id: "ns", libelle: "Vitesse de synchronisme", unite: "tr/min", decimales: 0 },
    { id: "n", libelle: "Vitesse du rotor", unite: "tr/min", decimales: 0 },
    { id: "dn", libelle: "Écart Δn", unite: "tr/min", decimales: 1 },
    { id: "I", libelle: "Courant / I_n", decimales: 2 },
    { id: "Imax", libelle: "Courant maximal du démarrage / I_n", decimales: 2 },
    { id: "gel", libelle: "Durée de gel de la rampe", unite: "s", decimales: 2 },
    { id: "t95", libelle: "Durée jusqu'à 95 % de la vitesse finale", format: (v) => (Number.isFinite(v) ? nombre(api, v, 2) + " s" : "non atteinte") },
  ]);
  if (valeurs) ressources.push(valeurs);

  function tracerCourbes() {
    const tr = essai.trace;
    courbes.innerHTML =
      '<polyline points="' + chaine(tr.map((p) => [xG(p.t), yN(p.ns)])) + '" stroke-width="1.4"/>' +
      '<polyline points="' + chaine(tr.map((p) => [xG(p.t), yN(Math.max(0, p.n))])) + '" stroke-width="3" stroke-linejoin="round"/>' +
      '<polyline points="' + chaine(tr.map((p) => [xD(p.t), yI(p.I / M.In)])) + '" stroke-width="3" stroke-linejoin="round"/>';
  }

  function echantillon(t) {
    const tr = essai.trace;
    const k = Math.min(tr.length - 1, Math.max(0, Math.round(t / 0.02)));
    return tr[k];
  }

  function dessiner(t) {
    const p = echantillon(t);
    const n = Math.max(0, p.n);
    mobile.innerHTML =
      '<path d="M' + xG(p.t).toFixed(1) + " " + G.yb + "V" + G.yh + "M" + xD(p.t).toFixed(1) + " " + D.yb + "V" + D.yh + '" stroke-width="1" stroke-dasharray="3 3"/>' +
      '<circle cx="' + xG(p.t).toFixed(1) + '" cy="' + yN(n).toFixed(1) + '" r="5" fill="currentColor"/>' +
      '<circle cx="' + xG(p.t).toFixed(1) + '" cy="' + yN(p.ns).toFixed(1) + '" r="4" stroke-width="1.6"/>' +
      '<circle cx="' + xD(p.t).toFixed(1) + '" cy="' + yI(p.I / M.In).toFixed(1) + '" r="5" fill="currentColor"/>';
    const bloque = !Number.isFinite(essai.t95);
    ecritsMobiles.innerHTML =
      texte(G.x0 + 10, G.yh - 4, "n_s, trait fin ; n, trait épais") +
      (bloque ? texte(D.x0 + 10, D.yh - 4, "rampe gelée : le moteur ne suit pas") : "");
    if (valeurs) {
      valeurs.maj({
        t: p.t,
        f: p.f,
        ns: p.ns,
        n,
        dn: p.ns - n,
        I: p.I / M.In,
        Imax: essai.Imax / M.In,
        gel: essai.gel,
        t95: essai.t95,
      });
    }
  }

  const synchro = synchroniseur(dessiner, { idCurseur: "t" });

  const reglagesCurseurs = api.sim.curseurs(
    "#e-rampe-reglages",
    [
      { id: "Tr", libelle: "Durée de rampe de 0 à 50 Hz", min: 1, max: 10, pas: 0.5, valeur: 5, unite: "s" },
      { id: "U0", libelle: "Compensation U0", min: 0, max: 40, pas: 1, valeur: 20, unite: "V" },
    ],
    (lues) => {
      if (lues.Tr === reglages.Tr && lues.U0 === reglages.U0) return;
      reglages.Tr = lues.Tr;
      reglages.U0 = lues.U0;
      essai = simulerRampe(reglages.Tr, reglages.U0);
      tracerCourbes();
      synchro.redessiner();
    }
  );
  if (reglagesCurseurs) ressources.push(reglagesCurseurs);

  synchro.curseurs = api.sim.curseurs(
    "#e-rampe-curseurs",
    [{ id: "t", libelle: "Instant depuis l'ordre de marche", min: 0, max: T_MAX, pas: 0.02, valeur: 0, format: (v) => nombre(api, v, 2) + " s" }],
    (lues) => synchro.appliquer(lues.t, "curseur")
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: AXE.x0, y: AXE.y },
    a: { x: AXE.x1, y: AXE.y },
    min: 0,
    max: T_MAX,
    pas: 0.02,
    valeur: 0,
    libelle: "Instant sur l'axe du temps",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  synchro.lecteur = api.sim.lecteur("#e-rampe-lecteur", {
    de: 0,
    a: T_MAX,
    duree: 12,
    boucle: false,
    auto: false,
    libelle: "Démarrage en temps réel",
    rappel: (t) => synchro.appliquer(t, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);

  tracerCourbes();
  synchro.appliquer(0, null);
}

/* --------------------------------------------------------------------------
   I. Simulation : consigne de vitesse de la pompe du site
   -------------------------------------------------------------------------- */

const NOMS_SOURCES = ["réseau normal, 400 V", "réseau bas, 360 V", "groupe électrogène, 400 V"];
const RENDEMENT_MOTEUR = 0.94;
const RENDEMENT_VARIATEUR = 0.97;
const HEURES_AN = 6000;

function pointPompe(n, loi, source) {
  const M = MOTEUR_POMPE;
  const Umax = source === 1 ? 360 : 400;
  const fmax = source === 2 ? 40 : source === 1 ? 48 : 50;
  const U0 = 8;
  const Cr = (v) => M.Cn * Math.pow(Math.max(0, v) / M.nn, 2);
  const loiU = (f, l) => loiTension(l === 1 ? 2 : 1, f, U0, Umax);
  const resoudre = (l, plafond) => {
    let bas = 5;
    let haut = plafond;
    const pointA = (f) => pointStable(M, f, loiU(f, l), Cr);
    const pMax = pointA(plafond);
    if (pMax && pMax.n < n) return { f: plafond, p: pMax, limite: true };
    for (let i = 0; i < 50; i += 1) {
      const m = (bas + haut) / 2;
      const p = pointA(m);
      if (p && p.n < n) bas = m;
      else haut = m;
    }
    return { f: haut, p: pointA(haut), limite: false };
  };
  const r = resoudre(loi, fmax);
  const ref = resoudre(0, fmax);
  const U = loiU(r.f, loi);
  return { ...r, U, fmax, extra: r.p && ref.p ? r.p.e.Pin - ref.p.e.Pin : 0 };
}

function puissancesPompe(n, extra = 0) {
  const q = n / MOTEUR_POMPE.nn;
  const arbre = 30 * Math.pow(q, 3);
  const variateur = (arbre / RENDEMENT_MOTEUR + extra / 1000) / RENDEMENT_VARIATEUR;
  const vanne = (30 * (0.45 + 0.55 * Math.min(q, 1))) / RENDEMENT_MOTEUR;
  return { arbre, variateur, vanne };
}

function construireSimPompe(racine, api) {
  const M = MOTEUR_POMPE;
  const reglages = { n: 1250, loi: 0, source: 0 };
  const courbeTracee = { loi: 0, source: 0 };
  let resultat = null;
  const pointGroupe = pointPompe(2000, 0, 2);
  const Q_LIMITE_GROUPE = pointGroupe.p ? pointGroupe.p.n / M.nn : 0.8;

  const trace = api.sim.traceur("#i-pompe-trace", {
    titre: "Puissance prise au réseau en fonction du débit relatif",
    xTitre: "débit relatif Q / Q1",
    yTitre: "puissance au réseau",
    yUnite: "kW",
    xMin: 0.45,
    xMax: 1.05,
    yMin: 0,
    yMax: 40,
    series: [
      { id: "var", nom: "variateur, loi choisie", couleur: "serie-1", epaisseur: 3 },
      { id: "vanne", nom: "vanne d'étranglement, moteur direct", couleur: "serie-6", epaisseur: 1.6 },
    ],
    surDessin({ c, repere, couleurs }) {
      if (!resultat) return;
      if (reglages.source === 2) ligneV(c, repere, couleurs, resultat.qLimite, "limite sur groupe");
      if (resultat.point) pointTrace(c, repere, couleurs, resultat.q, resultat.pVar, "consigne");
    },
  });
  if (trace) {
    ressources.push(trace);
    trace.definirFonction("var", (q) => puissancesPompe(q * M.nn).variateur);
    trace.definirFonction("vanne", (q) => (q <= 1 ? puissancesPompe(q * M.nn).vanne : NaN));
  }

  const siFini = (decimales, unite) => (v) => (Number.isFinite(v) ? nombre(api, v, decimales) + (unite ? " " + unite : "") : "sans objet");
  const valeurs = api.sim.valeurs("#i-pompe-valeurs", [
    { id: "f", libelle: "Fréquence", format: siFini(2, "Hz") },
    { id: "U", libelle: "Tension appliquée", format: siFini(1, "V") },
    { id: "n", libelle: "Vitesse obtenue", format: siFini(0, "tr/min") },
    { id: "dn", libelle: "Écart Δn", format: siFini(1, "tr/min") },
    { id: "I", libelle: "Courant du moteur", format: siFini(1, "A") },
    { id: "cos", libelle: "Facteur de puissance du moteur", format: siFini(3, "") },
    { id: "arbre", libelle: "Puissance sur l'arbre", format: siFini(2, "kW") },
    { id: "var", libelle: "Puissance au réseau, variateur", format: siFini(2, "kW") },
    { id: "vanne", libelle: "Puissance au réseau, vanne", format: siFini(2, "kW") },
    { id: "eco", libelle: "Économie annuelle", format: siFini(1, "MWh") },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    const r = pointPompe(reglages.n, reglages.loi, reglages.source);
    const nReel = r.p ? r.p.n : NaN;
    const pu = puissancesPompe(nReel, reglages.loi === 1 ? r.extra : 0);
    const q = nReel / M.nn;
    resultat = { point: r.p, q, pVar: pu.variateur, qLimite: Q_LIMITE_GROUPE };
    if (trace && (reglages.loi !== courbeTracee.loi || reglages.source !== courbeTracee.source)) {
      courbeTracee.loi = reglages.loi;
      courbeTracee.source = reglages.source;
      if (reglages.loi === 0) trace.definirFonction("var", (x) => puissancesPompe(x * M.nn).variateur);
      else {
        const points = [];
        for (let i = 0; i <= 24; i += 1) {
          const x = 0.45 + (0.6 * i) / 24;
          const pp = pointPompe(x * M.nn, 1, reglages.source);
          points.push([x, pp.limite ? NaN : puissancesPompe(x * M.nn, pp.extra).variateur]);
        }
        trace.definirDonnees("var", points);
      }
    }
    let verdict = "consigne tenue";
    if (r.limite) verdict = "consigne limitée par la fréquence maximale de " + nombre(api, r.fmax, 0) + " Hz";
    else if (r.p && r.p.e.I > 1.02 * M.In) verdict = "surcharge du moteur";
    if (valeurs) {
      valeurs.maj({
        f: r.f,
        U: r.U,
        n: nReel,
        dn: r.p ? 30 * r.f - nReel : NaN,
        I: r.p ? r.p.e.I : NaN,
        cos: r.p ? r.p.e.cos : NaN,
        arbre: pu.arbre,
        var: pu.variateur,
        vanne: q <= 1 ? pu.vanne : NaN,
        eco: q <= 1 ? ((pu.vanne - pu.variateur) * HEURES_AN) / 1000 : NaN,
        verdict,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-pompe-curseurs",
    [
      { id: "n", libelle: "Consigne de vitesse", min: 700, max: 1550, pas: 5, valeur: 1250, unite: "tr/min" },
      { id: "loi", libelle: "Loi de commande", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (Math.round(v) === 1 ? "quadratique, U0 = 8 V" : "linéaire, U0 = 8 V") },
      { id: "source", libelle: "Source", min: 0, max: 2, pas: 1, valeur: 0, format: (v) => NOMS_SOURCES[Math.round(v)] },
    ],
    (lues) => {
      reglages.n = lues.n;
      reglages.loi = Math.round(lues.loi);
      reglages.source = Math.round(lues.source);
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
  const MC = MOTEUR_CONVOYEUR;

  /* 1. Fondamental : application directe */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-frequence",
      titre: "Fréquence pour une vitesse sous couple nominal",
      niveau: "fondamental",
      enonce:
        "<p>Un moteur à quatre pôles, $50\\ \\mathrm{Hz}$, tourne à $1460\\ \\mathrm{tr/min}$ sous son couple nominal. On veut qu'il tourne à " +
        "$900\\ \\mathrm{tr/min}$ sous ce même couple, en loi $U/f$ correctement compensée. Quelle fréquence le variateur doit-il appliquer ?</p>",
      valeur: (900 + 40) / 30,
      unite: "Hz",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Fréquence $f$",
      etapes: [
        { texte: "À flux nominal, l'écart de vitesse sous couple nominal reste celui de la plaque : $\\Delta n = 1500 - 1460 = 40\\ \\mathrm{tr/min}$." },
        { texte: "Vitesse de synchronisme à viser : $n_s = 900 + 40 = 940\\ \\mathrm{tr/min}$." },
        { texte: "$f = p\\,n_s/60 = 2 \\times 940/60 = 31{,}33\\ \\mathrm{Hz}$, et $U \\approx 8 \\times 31{,}33 = 251\\ \\mathrm{V}$ plus la compensation.", note: "Erreur classique : garder $g = 2{,}67\\ \\%$, ce qui donnerait $30{,}82\\ \\mathrm{Hz}$ et $885\\ \\mathrm{tr/min}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const U3133 = fluxNominal(MC, 31.333, MC.Cn).U;
        traceCorrection(moteurApi, conteneur, {
          titre: "Courbes à 50 Hz et à 31,33 Hz, flux nominal",
          xTitre: "vitesse n",
          xUnite: "tr/min",
          yTitre: "couple",
          yUnite: "× C_n",
          xMin: 600,
          xMax: 1550,
          yMin: 0,
          yMax: 2.5,
          series: [
            { id: "a", nom: "50 Hz", couleur: "serie-6", epaisseur: 1.6, fonction: (n) => (n < 1500 ? etat(MC, 50, 400, n).C / MC.Cn : NaN) },
            { id: "b", nom: "31,33 Hz, tension à flux nominal", couleur: "serie-1", epaisseur: 2.6, fonction: (n) => (n < 940 ? etat(MC, 31.333, U3133, n).C / MC.Cn : NaN) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 1, "C_n");
            pointTrace(c, repere, couleurs, 1460, 1, "1460");
            pointTrace(c, repere, couleurs, 900, 1, "900");
          },
        });
      },
    })
  );

  /* 2. Fondamental : ce qui reste constant */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-constantes",
      titre: "Ce qui ne change pas dans la zone de couple constant",
      niveau: "fondamental",
      enonce:
        "<p>Un moteur est alimenté par un variateur en loi $U/f$ parfaitement compensée, entre $10$ et $50\\ \\mathrm{Hz}$, sous un couple de charge " +
        "constant. Quelles grandeurs restent constantes quand la fréquence varie ?</p>",
      options: [
        { texte: "Le flux d'entrefer.", juste: true },
        { texte: "L'écart de vitesse $n_s - n$.", juste: true },
        { texte: "Le glissement relatif $g$." },
        { texte: "Le couple maximal disponible.", juste: true },
        { texte: "La puissance mécanique fournie." },
      ],
      multiple: true,
      etapes: [
        { texte: "La compensation tient $E/f$, donc le flux $\\varPsi = E/\\omega$ constant." },
        { texte: "À flux constant, le couple ne dépend que de $\\omega_r$ : même couple, même $f_r$, même $\\Delta n = 60f_r/p$ ; le couple maximal $3p\\varPsi^2/(2L_2')$ ne dépend pas de $f$." },
        { texte: "$g = \\Delta n/n_s$ augmente quand $n_s$ baisse, et la puissance $C\\varOmega$ diminue avec la vitesse.", note: "C'est pourquoi on raisonne en écart de vitesse, pas en glissement relatif." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurEtapes(4),
          dessinEtapes(["constants : Ψ, Δn, f_r, C_max", "variables : n_s, n, g = Δn / n_s", "puissance P = C Ω : proportionnelle à n", "zone de couple constant, pas de puissance constante"], 560),
          "Classement révélé ligne par ligne."
        );
      },
    })
  );

  /* 3. Intermédiaire : défluxage */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-deflux",
      titre: "Couple maximal en défluxage",
      niveau: "intermédiaire",
      enonce:
        "<p>Un moteur $400\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$ a un couple maximal de $2{,}25\\ C_n$ sous tension nominale. Le variateur l'alimente à " +
        "$75\\ \\mathrm{Hz}$ sous $400\\ \\mathrm{V}$, sa tension maximale. Par la loi approchée du défluxage, quel est son couple maximal, en multiples de " +
        "$C_n$ ? Peut-il entraîner une charge à couple constant égal à $C_n$ ?</p>",
      valeur: 2.25 * Math.pow(50 / 75, 2),
      unite: "C_n",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Couple maximal $C_{max}/C_n$",
      etapes: [
        { texte: "À tension constante, le flux varie comme $f_b/f = 50/75 = 0{,}667$." },
        { texte: "Le couple maximal varie comme le carré du flux : $C_{max} = 2{,}25 \\times 0{,}667^2 = 2{,}25 \\times 0{,}444 = 1{,}00\\ C_n$." },
        { texte: "Une charge de $C_n$ serait à la limite du décrochage, sans aucune marge ; de plus, à courant nominal, le moteur ne fournit que $C_n \\times 50/75 = 0{,}67\\ C_n$ : il serait en surcharge.", note: "Le modèle complet du moteur du convoyeur donne $1{,}08\\ C_n$ : l'approximation est prudente." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Couple maximal et couple à courant nominal au-delà de 50 Hz",
          xTitre: "fréquence",
          xUnite: "Hz",
          yTitre: "couple",
          yUnite: "× C_n",
          xMin: 50,
          xMax: 100,
          yMin: 0,
          yMax: 2.4,
          series: [
            { id: "m", nom: "couple maximal, 2,25 (50/f)²", couleur: "serie-5", epaisseur: 2.4, fonction: (f) => 2.25 * Math.pow(50 / f, 2) },
            { id: "c", nom: "couple à I_n, 50/f", couleur: "serie-1", epaisseur: 2.4, fonction: (f) => 50 / f },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 1, "charge C_n");
            pointTrace(c, repere, couleurs, 75, 1, "1,00 à 75 Hz");
          },
        });
      },
    })
  );

  /* 4. Intermédiaire : lois de similitude */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-pompe",
      titre: "Puissance d'une pompe à vitesse réduite",
      niveau: "intermédiaire",
      enonce:
        "<p>Une pompe centrifuge absorbe $30\\ \\mathrm{kW}$ sur l'arbre à $1475\\ \\mathrm{tr/min}$, sur un circuit sans hauteur statique. Quelle " +
        "puissance absorbe-t-elle à $1100\\ \\mathrm{tr/min}$, et quelle fréquence faut-il approximativement, pour un moteur à quatre pôles dont l'écart " +
        "nominal est de $25\\ \\mathrm{tr/min}$ ? Répondez par la puissance, en kilowatts.</p>",
      valeur: 30 * Math.pow(1100 / 1475, 3),
      unite: "kW",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Puissance sur l'arbre $P$",
      etapes: [
        { texte: "Lois de similitude : $P/P_1 = (n/n_1)^3 = (1100/1475)^3 = 0{,}7458^3 = 0{,}4148$." },
        { texte: "$P = 30 \\times 0{,}4148 = 12{,}44\\ \\mathrm{kW}$ ; le couple vaut $(0{,}7458)^2 = 0{,}556$ fois le couple de référence." },
        { texte: "Si le couple de référence est le couple nominal, $\\Delta n = 25 \\times 0{,}556 = 13{,}9\\ \\mathrm{tr/min}$ et $f = 2 \\times 1113{,}9/60 = 37{,}13\\ \\mathrm{Hz}$.", note: "Le débit, lui, ne baisse que de $25\\ \\%$ : c'est tout l'intérêt de la vitesse variable." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Lois de similitude de la pompe",
          xTitre: "vitesse n",
          xUnite: "tr/min",
          yTitre: "valeur relative",
          xMin: 600,
          xMax: 1500,
          yMin: 0,
          yMax: 1.05,
          series: [
            { id: "q", nom: "débit, n/n1", couleur: "serie-3", epaisseur: 1.8, fonction: (n) => n / 1475 },
            { id: "c", nom: "couple, (n/n1)²", couleur: "serie-4", epaisseur: 1.8, fonction: (n) => Math.pow(n / 1475, 2) },
            { id: "p", nom: "puissance, (n/n1)³", couleur: "serie-1", epaisseur: 2.8, fonction: (n) => Math.pow(n / 1475, 3) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 1100, "1100 tr/min");
            pointTrace(c, repere, couleurs, 1100, Math.pow(1100 / 1475, 3), "0,415 soit 12,44 kW");
          },
        });
      },
    })
  );

  /* 5. Avancé : compensation à basse fréquence */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-compensation",
      titre: "Tension à appliquer à 5 Hz sous couple nominal",
      niveau: "avancé",
      enonce:
        "<p>Le moteur du convoyeur, $E_n/f_n = 4{,}233\\ \\mathrm{V/Hz}$ par phase, $R_1 = 0{,}55\\ \\mathrm{\\Omega}$ par phase de l'étoile équivalente, " +
        "doit porter son couple nominal à $5\\ \\mathrm{Hz}$ à flux nominal ; il absorbe alors environ $19{,}8\\ \\mathrm{A}$. En supposant les réactances " +
        "négligeables à cette fréquence, quelle tension composée le variateur doit-il appliquer ? Comparez à la loi proportionnelle.</p>",
      valeur: RAC3 * (4.233 * 5 + 0.55 * 19.8),
      unite: "V",
      tolerance: 0.03,
      chiffres: 1,
      libelleChamp: "Tension composée $U$",
      etapes: [
        { texte: "Force électromotrice à flux nominal : $E = 4{,}233 \\times 5 = 21{,}17\\ \\mathrm{V}$ par phase." },
        { texte: "À $5\\ \\mathrm{Hz}$, $X_1 f/50 = 0{,}105\\ \\mathrm{\\Omega}$ est petite et $I_1$ presque en phase avec $E$ : $V \\approx E + R_1I_1 = 21{,}17 + 0{,}55 \\times 19{,}8 = 21{,}17 + 10{,}89 = 32{,}06\\ \\mathrm{V}$." },
        { texte: "$U = \\sqrt{3} \\times 32{,}06 = 55{,}5\\ \\mathrm{V}$, au lieu de $40\\ \\mathrm{V}$ en loi proportionnelle : la compensation vaut $15{,}5\\ \\mathrm{V}$, soit $39\\ \\%$ de plus que la loi proportionnelle.", note: "Le schéma équivalent complet donne $55{,}4\\ \\mathrm{V}$ ; sans cette compensation, le couple maximal tombe à $0{,}59\\ C_n$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurBarres(3),
          dessinBarres([["U proportionnelle", 40, false], ["U compensée", 55.5, true], ["dont √3 R1 I1", 18.9, false]], 60, "V", 560),
          "Tensions comparées à 5 Hz sous couple nominal : la chute ohmique représente plus du tiers de la tension nécessaire."
        );
      },
    })
  );

  /* 6. Diagnostic industriel */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Un ventilateur qui met son variateur en défaut à chaque arrêt",
      niveau: "diagnostic",
      enonce:
        "<p>Un ventilateur de tirage de $J = 10\\ \\mathrm{kg \\cdot m^2}$ tourne à $1480\\ \\mathrm{tr/min}$ sur un variateur à redresseur à diodes, sans " +
        "résistance de freinage. La rampe de décélération est réglée à $5\\ \\mathrm{s}$. À chaque ordre d'arrêt, le variateur se met en défaut de " +
        "surtension du bus continu après environ une seconde. Quelles explications et quelles corrections sont pertinentes ?</p>",
      options: [
        { texte: "Le ventilateur ralentit naturellement moins vite que la rampe : le moteur passe en générateur et charge le bus.", juste: true },
        { texte: "Le bus de quelques millifarads ne peut absorber que quelques centaines de joules, contre environ $120\\ \\mathrm{kJ}$ d'énergie cinétique.", juste: true },
        { texte: "Allonger la rampe de décélération, ou choisir l'arrêt en roue libre, supprime le défaut.", juste: true },
        { texte: "Ajouter une résistance de freinage pilotée par un hacheur permet de garder un arrêt rapide.", juste: true },
        { texte: "Augmenter la compensation $U_0$ réduit la tension du bus au freinage." },
      ],
      multiple: true,
      etapes: [
        { texte: "Énergie cinétique : $\\tfrac{1}{2}J\\varOmega^2 = 0{,}5 \\times 10 \\times 155^2 = 120\\ \\mathrm{kJ}$." },
        { texte: "Si la fréquence baisse plus vite que le rotor, $n > n_s$, $g < 0$ : le moteur renvoie de la puissance vers le bus, que le redresseur à diodes ne peut pas renvoyer au réseau." },
        { texte: "Le bus de $2{,}2\\ \\mathrm{mF}$ passe de $565{,}7$ à $800\\ \\mathrm{V}$ avec seulement $352\\ \\mathrm{J}$ : défaut en une fraction de seconde. Remèdes : rampe plus longue ou roue libre, résistance de freinage, redresseur actif ; $U_0$ n'agit qu'à basse fréquence et ne change rien.", note: "Beaucoup de variateurs offrent aussi un régulateur de tension du bus qui allonge la rampe automatiquement." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurBarres(2),
          dessinBarres([["énergie cinétique", 120000, true], ["capacité du bus", 352, false]], 120000, "J", 560),
          "Ordres de grandeur : le bus continu ne peut absorber qu'une infime partie de l'énergie cinétique du ventilateur."
        );
      },
    })
  );

  /* 7. Conceptuelle */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Pourquoi U/f constant, puis plus du tout",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi le variateur garde le rapport $U/f$ constant en dessous de la fréquence de base, et pourquoi il ne peut " +
        "plus le faire au-delà. Dites ce qu'il advient alors du couple disponible.</p>",
      motsCles: [["flux"], ["satur", "magnetis"], ["tension maximale", "bus", "plafon", "limite"], ["couple", "puissance constante", "diminu", "baisse"]],
      minimum: 3,
      exemple: "Trois phrases : ce que fixe le rapport U/f, ce qui limite la tension, ce que devient le couple.",
      etapes: [
        { texte: "La tension appliquée est équilibrée par $E = \\omega\\varPsi$ : garder $U/f$ revient à garder le flux nominal, ni saturé ni affaibli, donc le couple par ampère." },
        { texte: "Au-delà de la fréquence de base, la tension ne peut plus croître : elle est limitée par le bus continu, donc par le réseau." },
        { texte: "Le flux décroît alors comme $1/f$ : à courant nominal le couple décroît comme $1/f$, la puissance reste constante, et le couple maximal décroît comme $1/f^2$.", note: "C'est la zone de défluxage, ou de puissance constante." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension et flux de part et d'autre de la fréquence de base",
          xTitre: "fréquence",
          xUnite: "Hz",
          yTitre: "valeur relative",
          xMin: 0,
          xMax: 100,
          yMin: 0,
          yMax: 1.2,
          series: [
            { id: "u", nom: "tension U / U_n", couleur: "serie-6", epaisseur: 2.4, fonction: (f) => Math.min(1, f / 50) },
            { id: "p", nom: "flux Ψ / Ψ_n", couleur: "serie-1", epaisseur: 2.4, fonction: (f) => (f <= 50 ? 1 : 50 / f) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 50, "fréquence de base");
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const VISUELS_QUIZ = [
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["flux constant : C ne dépend que de ω_r", "même couple : même f_r", "Δn = 60 f_r / p constant"], 540), legende: "À flux constant, l'écart de vitesse est fixé par le couple." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["f > f_b : U plafonnée, Ψ en f_b / f", "à I_n : C ≈ C_n f_b / f", "à 100 Hz : C ≈ 0,5 C_n"], 540), legende: "Le couple disponible décroît au-delà de la fréquence de base." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["p = 1 : n_s = 60 f", "n_s = 2000 + 90 = 2090 tr/min", "f = 2090 / 60 = 34,83 Hz"], 540), legende: "Fréquence d'un moteur à deux pôles." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["V = E + R1 I1 : R1 I1 indépendant de f", "basse fréquence : E petit devant R1 I1", "sans compensation : flux et couple s'effondrent"], 540), legende: "Pourquoi la compensation est indispensable à basse fréquence." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["U / f = 400 / 50 = 8 V/Hz", "U = 8 × 30", "U = 240 V"], 540), legende: "Tension en loi proportionnelle." },
  { viewBox: "0 0 540 220", dessin: dessinChaine(nouveauMarqueur("fl-l-ch-c")), legende: "Les condensateurs du bus continu reçoivent l'énergie de freinage." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["P / P1 = (n / n1)³", "= (1200 / 1500)³ = 0,8³", "= 0,512, soit 51 %"], 540), legende: "Puissance d'un ventilateur à vitesse réduite." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["redresseur à diodes : courant à sens unique", "énergie de freinage stockée dans le bus", "évacuée par résistance ou redresseur actif"], 540), legende: "Un redresseur à diodes ne renvoie rien au réseau." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["C_max ∝ (f_b / f)²", "(50 / 100)² = 0,25", "C_max(100 Hz) = 0,25 C_max(50 Hz)"], 540), legende: "Couple maximal à 100 Hz." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["convoyeur : couple constant jusqu'à basse vitesse", "U/f compensée ou contrôle vectoriel", "loi quadratique : couple insuffisant à basse vitesse"], 540), legende: "Choix de la loi pour une charge à couple constant." },
];

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>À flux constant, quelle grandeur est fixée par le couple demandé, quelle que soit la fréquence ?</p>",
        options: ["Le glissement relatif $g$", "L'écart de vitesse $n_s - n$", "La vitesse $n$", "La tension $U$"],
        bonnes: [1],
        explication: "Le couple ne dépend que de $\\omega_r = 2\\pi f_r$, et $f_r = p(n_s - n)/60$ : l'écart de vitesse est fixé, pas $g$.",
        resume: "Grandeur fixée par le couple",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Au-delà de $50\\ \\mathrm{Hz}$, sous tension plafonnée, le moteur garde son couple nominal à courant nominal.</p>",
        reponse: false,
        explication: "Le flux baisse comme $f_b/f$ : à courant nominal le couple baisse dans le même rapport, la puissance reste à peu près constante.",
        resume: "Couple en défluxage",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Un moteur à deux pôles a un écart nominal de $90\\ \\mathrm{tr/min}$. Quelle fréquence faut-il pour qu'il tourne à $2000\\ \\mathrm{tr/min}$ sous son couple nominal, à flux nominal, en hertz ?</p>",
        valeur: 2090 / 60,
        unite: "Hz",
        tolerance: 0.01,
        explication: "$p = 1$, $n_s = 2000 + 90 = 2090\\ \\mathrm{tr/min}$, $f = 2090/60 = 34{,}83\\ \\mathrm{Hz}$.",
        resume: "Fréquence d'un moteur à deux pôles",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi une loi $U/f$ strictement proportionnelle ne suffit-elle pas à basse fréquence ?</p>",
        motsCles: [["resistance", "r1", "ohmique"], ["chute"], ["flux", "fem", "force electromotrice"], ["couple", "cale", "calage"]],
        minimum: 2,
        explication: "La chute $R_1I_1$ ne diminue pas avec la fréquence, alors que la tension diminue : la force électromotrice, donc le flux, devient trop faible, et le couple maximal s'effondre. Il faut ajouter une compensation.",
        resume: "Compensation à basse fréquence",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Un moteur $400\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$ est alimenté à $30\\ \\mathrm{Hz}$ en loi proportionnelle, sans compensation. Quelle tension composée reçoit-il, en volts ?</p>",
        valeur: 240,
        unite: "V",
        tolerance: 0.01,
        explication: "$U = 8\\ \\mathrm{V/Hz} \\times 30\\ \\mathrm{Hz} = 240\\ \\mathrm{V}$.",
        resume: "Tension en loi proportionnelle",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Sur cette chaîne de variation de vitesse, où va l'énergie renvoyée par le moteur quand il freine une charge à forte inertie ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 540 220",
        dessin: dessinChaine(nouveauMarqueur("fl-l-ch")),
        zones: ZONES_CHAINE.map((z) => ({ ...z, juste: z.etiquette === "bus continu" })),
        explication: "L'onduleur est réversible, mais le redresseur à diodes ne l'est pas : l'énergie charge les condensateurs du bus continu, dont la tension monte jusqu'au seuil de défaut si rien ne l'évacue.",
        resume: "Destination de l'énergie de freinage",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Un ventilateur passe de $1500$ à $1200\\ \\mathrm{tr/min}$. Sa puissance devient environ :</p>",
        options: ["$80\\ \\%$ de la puissance initiale", "$64\\ \\%$", "$51\\ \\%$", "$41\\ \\%$"],
        bonnes: [2],
        explication: "$P \\propto n^3$ : $0{,}8^3 = 0{,}512$, soit $51\\ \\%$, sur un circuit sans pression statique.",
        resume: "Puissance d'un ventilateur",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Avec un variateur à redresseur à diodes, l'énergie de freinage du moteur retourne au réseau.</p>",
        reponse: false,
        explication: "Le redresseur à diodes ne conduit que du réseau vers le bus : l'énergie reste dans le bus, puis doit être dissipée dans une résistance de freinage ou renvoyée par un redresseur actif.",
        resume: "Redresseur et freinage",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Par la loi approchée du défluxage, que vaut le couple maximal à $100\\ \\mathrm{Hz}$ rapporté au couple maximal à $50\\ \\mathrm{Hz}$, tension plafonnée ?</p>",
        valeur: 0.25,
        unite: "",
        tolerance: 0.02,
        explication: "$C_{max} \\propto (f_b/f)^2 = (50/100)^2 = 0{,}25$.",
        resume: "Couple maximal à 100 Hz",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Pour un convoyeur qui doit tenir son couple nominal de $5$ à $50\\ \\mathrm{Hz}$, quelles commandes conviennent ?</p>",
        options: [
          { texte: "Loi $U/f$ linéaire avec compensation de la chute ohmique.", juste: true },
          { texte: "Contrôle vectoriel de flux.", juste: true },
          { texte: "Loi quadratique." },
          { texte: "Gradateur à thyristors à fréquence fixe." },
        ],
        multiple: true,
        explication: "La loi quadratique affaiblit le flux à basse vitesse, ce qui convient à une pompe mais pas à un couple constant ; le gradateur ne change pas la vitesse de synchronisme et surchauffe le rotor.",
        resume: "Commande d'un convoyeur",
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
      { categorie: "Principe", question: "Comment un variateur fait-il varier la vitesse d'un moteur asynchrone ?", reponse: "Il impose la fréquence statorique, donc la vitesse du champ $n_s = 60f/p$ ; le rotor suit avec un écart de vitesse fixé par le couple." },
      { categorie: "Flux", question: "Quelle grandeur fixe le flux du moteur ?", reponse: "Le rapport $E/f \\approx U/f$ : $\\varPsi = E/(2\\pi f)$. À tension fixe et fréquence réduite, le moteur sature." },
      { categorie: "Couple", question: "De quoi dépend le couple à flux constant ?", reponse: "De la seule pulsation rotorique $\\omega_r$ : $C \\approx 3p\\varPsi^2\\omega_r/R_2'$. D'où des courbes couple-vitesse qui se translatent." },
      { categorie: "Calcul", question: "Quelle fréquence pour une vitesse $n$ sous un couple $C$, en zone de couple constant ?", reponse: "$\\Delta n = \\Delta n_n\\,C/C_n$, puis $f = p(n + \\Delta n)/60$, et $U = U_nf/f_b$ plus la compensation.", rappel: "Convoyeur : $600\\ \\mathrm{tr/min}$ sous $60\\ \\mathrm{N \\cdot m}$ donnent $21{,}11\\ \\mathrm{Hz}$ et $175\\ \\mathrm{V}$." },
      { categorie: "Compensation", question: "Pourquoi et comment compenser à basse fréquence ?", reponse: "La chute $R_1I_1$ ne baisse pas avec $f$ : on ajoute $U_0$, ou $\\sqrt{3}R_1I_1$ mesuré ; trop de compensation surexcite le moteur à vide." },
      { categorie: "Défluxage", question: "Que se passe-t-il au-delà de la fréquence de base ?", reponse: "$U$ plafonne, $\\varPsi \\propto 1/f$, couple à $I_n$ en $1/f$, puissance constante, couple maximal en $1/f^2$." },
      { categorie: "Tension", question: "Quelle tension maximale un variateur peut-il fournir ?", reponse: "Environ $U_{dc}/\\sqrt{2}$, soit la tension du réseau : $400\\ \\mathrm{V}$ pour $565{,}7\\ \\mathrm{V}$ de bus, $360\\ \\mathrm{V}$ sous un réseau bas de $10\\ \\%$." },
      { categorie: "Charges", question: "Quelles lois suivent une pompe ou un ventilateur ?", reponse: "Sans hauteur statique : $Q \\propto n$, $H \\propto n^2$, $C \\propto n^2$, $P \\propto n^3$ ; jamais au-delà de la fréquence nominale." },
      { categorie: "Freinage", question: "Pourquoi un variateur se met-il en défaut de surtension au ralentissement ?", reponse: "Le moteur devient générateur ($g < 0$) et charge le bus, que le redresseur à diodes ne peut vider : rampe plus longue, résistance de freinage ou redresseur actif." },
      { categorie: "Échauffement", question: "Quelle limite apparaît à basse vitesse et couple constant ?", reponse: "L'échauffement d'un moteur autoventilé : couple permanent à déclasser selon le constructeur, ou ventilation forcée." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["n_s = 1200 + 30 = 1230 tr/min", "f = 2 × 1230 / 60", "f = 41,0 Hz"], 540), legende: "Fréquence pour 1200 tr/min." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["loi quadratique : flux réduit", "charge élevée : courant rotorique accru", "pompe du site à 72 % de C_n : 44,4 A au lieu de 39,6 A"], 540), legende: "La loi quadratique n'est pas toujours la plus économe." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["U plafonnée : Ψ / Ψ_n ≈ f_b / f", "= 50 / 60", "= 0,833"], 540), legende: "Flux relatif à 60 Hz." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["étoile : I_LY = I_d / 3", "= 300 / 3", "= 100 A"], 540), legende: "Courant de ligne en étoile." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["direct : le rotor glisse de n_s à 0", "variateur : il ne glisse que de Δn à chaque instant", "p_jr = g P_tr reste petit pendant tout le démarrage"], 540), legende: "Pourquoi le variateur ménage le rotor." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["Dyn11 : indice horaire 11", "11 × 30° = 330° de retard", "soit 30° d'avance de la basse tension"], 540), legende: "Déphasage d'un couplage Dyn11." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["τ = R C", "= 47 × 2,2 × 10⁻³", "= 0,1034 s = 103,4 ms"], 540), legende: "Constante de temps de la précharge du bus." },
];

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Un moteur à quatre pôles doit tourner à $1200\\ \\mathrm{tr/min}$ sous une charge qui lui impose un écart de $30\\ \\mathrm{tr/min}$ à flux nominal. Quelle fréquence faut-il, en hertz ?</p>",
        valeur: 41,
        unite: "Hz",
        tolerance: 0.01,
        explication: "$n_s = 1230\\ \\mathrm{tr/min}$, $f = 2 \\times 1230/60 = 41{,}0\\ \\mathrm{Hz}$.",
        resume: "Fréquence pour une consigne",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Sur une pompe, la loi quadratique est toujours plus économe que la loi linéaire.</p>",
        reponse: false,
        explication: "Elle réduit le flux ; sous une charge encore importante, le courant rotorique augmente plus que le courant magnétisant ne diminue. Au point de service de la pompe du site, elle donne $44{,}4\\ \\mathrm{A}$ au lieu de $39{,}6\\ \\mathrm{A}$.",
        resume: "Loi quadratique et pompe",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Cette séance. Un moteur $400\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$ est alimenté à $60\\ \\mathrm{Hz}$ sous $400\\ \\mathrm{V}$. Que vaut approximativement son flux rapporté au flux nominal ?</p>",
        valeur: 50 / 60,
        unite: "",
        tolerance: 0.01,
        explication: "$\\varPsi/\\varPsi_n \\approx f_b/f = 50/60 = 0{,}833$.",
        resume: "Flux en défluxage",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Démarrage des moteurs asynchrones. Un moteur a un courant de démarrage direct de $300\\ \\mathrm{A}$. Quel courant de ligne prend-il en étoile, en ampères ?</p>",
        valeur: 100,
        unite: "A",
        tolerance: 0.01,
        explication: "$I_{LY} = I_d/3 = 100\\ \\mathrm{A}$, réseau supposé parfait.",
        resume: "Courant en étoile",
      },
      {
        type: "qcm",
        enonce: repere(4) + "<p>Cours Démarrage des moteurs asynchrones. Un démarrage direct dissipe dans le rotor au moins $\\tfrac{1}{2}J\\varOmega_s^2$. Pourquoi un démarrage au variateur sur rampe en dissipe-t-il beaucoup moins ?</p>",
        options: [
          "Parce que le rotor ne glisse à chaque instant que de quelques dizaines de tours par minute, au lieu de toute la vitesse de synchronisme",
          "Parce que le variateur réduit l'inertie de la charge",
          "Parce que la résistance rotorique diminue à basse fréquence",
          "Parce que le courant de démarrage est nul",
        ],
        bonnes: [0],
        explication: "Les pertes rotoriques valent $p_{jr} = gP_{tr}$ ; sur rampe, $g$ reste faible en permanence, alors qu'un démarrage direct fait glisser le rotor de $n_s$ jusqu'à $\\Delta n$.",
        resume: "Énergie rotorique au variateur",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Transformateurs triphasés. Le transformateur du poste est couplé en Dyn11. De combien de degrés la tension basse tension est-elle en avance sur la tension haute tension homologue ?</p>",
        valeur: 30,
        unite: "°",
        tolerance: 0.01,
        explication: "L'indice horaire $11$ correspond à $11 \\times 30 = 330^\\circ$ de retard, soit $30^\\circ$ d'avance.",
        resume: "Déphasage Dyn11",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Régime transitoire RC. Le bus continu du variateur de la pompe, $2{,}2\\ \\mathrm{mF}$, se précharge à travers $47\\ \\mathrm{\\Omega}$. Quelle est la constante de temps, en millisecondes ?</p>",
        valeur: 47 * 2.2e-3 * 1000,
        unite: "ms",
        tolerance: 0.01,
        explication: "$\\tau = RC = 47 \\times 2{,}2 \\times 10^{-3} = 0{,}1034\\ \\mathrm{s}$, soit $103{,}4\\ \\mathrm{ms}$ ; le contacteur de court-circuit est temporisé à environ $5{,}8\\,\\tau$.",
        resume: "Précharge du bus",
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
    titre: "Où en suis-je sur la variation de vitesse des moteurs asynchrones ?",
  });
  if (auto) ressources.push(auto);
}
