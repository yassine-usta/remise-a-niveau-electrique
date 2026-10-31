/* ==========================================================================
   cours/machine-synchrone/cours.js
   Machine synchrone : roue polaire et angle interne, diagramme de Fresnel de
   l'alternateur, puissance en fonction de l'angle, synchroscope, courbes en V
   et diagramme de fonctionnement du groupe électrogène du site.
   Le module n'utilise que l'objet api et le DOM de la racine du cours.
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

const cx = (re, im) => ({ re, im });
const cAdd = (a, b) => cx(a.re + b.re, a.im + b.im);
const cSub = (a, b) => cx(a.re - b.re, a.im - b.im);
const cMul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cScal = (a, k) => cx(a.re * k, a.im * k);
const cMod = (a) => Math.hypot(a.re, a.im);
const cArg = (a) => Math.atan2(a.im, a.re);
const cConj = (a) => cx(a.re, -a.im);
const cPolaire = (m, deg) => cx(m * Math.cos(deg * DEG), m * Math.sin(deg * DEG));

/* --------------------------------------------------------------------------
   Modèle de Behn-Eschenburg, résistance négligée, par phase
   -------------------------------------------------------------------------- */

const V_RES = 400 / RAC3;

/* Alternateur de la microcentrale : 250 kVA, 400 V, 8 pôles, x_s = 1,5. */
const MICRO = { V: V_RES, Xs: 0.96, If0: 20, Sn: 250e3, In: 250e3 / (RAC3 * 400), Om: (TAU * 750) / 60 };
/* Groupe électrogène du site : 100 kVA, 400 V, 4 pôles, x_s = 2,0, x'_d = 0,2. */
const GROUPE = { V: V_RES, Xs: 3.2, Xd1: 0.318, Xr: 0.06149, Sn: 100e3, In: 100e3 / (RAC3 * 400), Pd: 80e3, Emax: 2.8, Qmin: -30e3 };

/** Alternateur, convention générateur : P et Q fournis, en W et var. */
function alternateur(V, Xs, P, Q) {
  const I = cConj(cScal(cx(P, Q), 1 / (3 * V)));
  const E = cAdd(cx(V, 0), cMul(cx(0, Xs), I));
  return { I, E, Em: cMod(E), delta: cArg(E) / DEG, Imod: cMod(I), phi: Math.atan2(Q, P) / DEG };
}

/** Alternateur couplé à excitation fixée : P imposée, E fixée. */
function pointExcitation(V, Xs, P, Em) {
  const s = (P * Xs) / (3 * V * Em);
  if (Math.abs(s) > 1) return null;
  const d = Math.asin(s);
  const Q = (3 * V * (Em * Math.cos(d) - V)) / Xs;
  return { delta: d / DEG, Q, I: Math.hypot(P, Q) / (3 * V) };
}

/** Moteur synchrone, convention récepteur : P absorbée, E = V I_f / I_f0. */
function moteurV(V, Xs, P, If, If0) {
  const Em = (V * If) / If0;
  if (Em <= 0) return null;
  const s = (P * Xs) / (3 * V * Em);
  if (s > 1) return null;
  const d = Math.asin(s);
  const E = cPolaire(Em, -d / DEG);
  const I = cMul(cSub(cx(V, 0), E), cx(0, -1 / Xs));
  const S = cScal(cMul(cx(V, 0), cConj(I)), 3);
  return { I: cMod(I), Qabs: S.im, delta: d / DEG, Em, cos: S.re / Math.max(1e-9, Math.hypot(S.re, S.im)) };
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

function marqueur(id, ouvert) {
  return (
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto-start-reverse">' +
    (ouvert ? '<path d="M0 0 10 5 0 10" fill="none" stroke="currentColor" stroke-width="1.6"/>' : '<path d="M0 0 10 5 0 10Z" fill="currentColor"/>') +
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

function seg(a, b, attributs = "") {
  return '<path d="M' + a[0].toFixed(1) + " " + a[1].toFixed(1) + "L" + b[0].toFixed(1) + " " + b[1].toFixed(1) + '"' + attributs + "/>";
}

/** Arc de cercle en coordonnées SVG, angles en degrés comptés dans le sens trigonométrique. */
function arcSvg(cx0, cy0, r, a0, a1) {
  const x0 = cx0 + r * Math.cos(a0 * DEG);
  const y0 = cy0 - r * Math.sin(a0 * DEG);
  const x1 = cx0 + r * Math.cos(a1 * DEG);
  const y1 = cy0 - r * Math.sin(a1 * DEG);
  const grand = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sens = a1 > a0 ? 0 : 1;
  return "M" + x0.toFixed(1) + " " + y0.toFixed(1) + "A" + r + " " + r + " 0 " + grand + " " + sens + " " + x1.toFixed(1) + " " + y1.toFixed(1);
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
  if (!Number.isFinite(px) || !Number.isFinite(py)) return;
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

/** Courbe en tirets tracée sur le canevas d'un traceur. */
function courbeTirets(c, repere, couleurs, points, tirets = [6, 5]) {
  c.save();
  c.setLineDash(tirets);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.4;
  c.beginPath();
  let premier = true;
  for (const [x, y] of points) {
    const px = repere.versX(x);
    const py = repere.versY(y);
    if (!Number.isFinite(px) || !Number.isFinite(py) || py < repere.boite.y || py > repere.boite.y + repere.boite.h) {
      premier = true;
      continue;
    }
    if (premier) c.moveTo(px, py);
    else c.lineTo(px, py);
    premier = false;
  }
  c.stroke();
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
  const x0 = 230;
  const l = largeur - x0 - 110;
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

/**
 * Diagramme de Fresnel d'un alternateur ou d'un moteur, pour les corrections.
 * phi en degrés, positif quand le courant est en retard ; mode "gen" ou "mot".
 */
function dessinFresnel(options) {
  const { V, I, phi, Xs, mode = "gen", kV = 0.5, kI = 0.4, largeur = 560, hauteur = 300, origine = [60, 230], notes = [], notesPos = null } = options;
  const id = nouveauMarqueur("fl-corr");
  const idO = nouveauMarqueur("fl-corr-o");
  const Ic = cPolaire(I, -phi);
  const chute = cMul(cx(0, mode === "gen" ? Xs : -Xs), Ic);
  const E = cAdd(cx(V, 0), chute);
  const P = (z, k) => [origine[0] + z.re * k, origine[1] - z.im * k];
  const pV = P(cx(V, 0), kV);
  const pE = P(E, kV);
  const pI = P(Ic, kI);
  const d = cArg(E) / DEG;
  let s = "<defs>" + marqueur(id) + marqueur(idO, true) + "</defs>";
  s += TRAITS + ' stroke-width="1.1" stroke-dasharray="2 4"><path d="M' + origine[0] + " " + origine[1] + "H" + (largeur - 20) + '"/></g>';
  s += TRAITS + ' stroke-width="2.4">' + seg(origine, pV, ' marker-end="url(#' + id + ')"') + "</g>";
  s += TRAITS + ' stroke-width="2" stroke-dasharray="7 4">' + seg(pV, pE) + "</g>";
  s += TRAITS + ' stroke-width="3.2">' + seg(origine, pE, ' marker-end="url(#' + id + ')"') + "</g>";
  s += TRAITS + ' stroke-width="1.6">' + seg(origine, pI, ' marker-end="url(#' + idO + ')"') + "</g>";
  s += TRAITS + ' stroke-width="1.2"><path d="' + arcSvg(origine[0], origine[1], 54, 0, d) + '"/></g>';
  const milieu = [(pV[0] + pE[0]) / 2, (pV[1] + pE[1]) / 2];
  s += ECRITS + texte(pV[0] - 8, origine[1] + 20, "V") + texte(pE[0] + 8, pE[1] - 4, "E") + texte(pI[0] + 6, pI[1] + 14, "I") +
    texte(milieu[0] + 10, milieu[1] + 4, mode === "gen" ? "j X_s I" : "- j X_s I") +
    texte(origine[0] + 60, origine[1] + (d >= 0 ? -10 : 22), "δ") +
    notes.map((n, i) => texte(notesPos ? notesPos[0] : largeur - 230, (notesPos ? notesPos[1] : 28) + i * 18, n)).join("") + "</g>";
  return { dessin: s, viewBox: "0 0 " + largeur + " " + hauteur };
}

/** Triangle des puissances, pour une correction. */
function dessinTriangle(P, Q, unites) {
  const k = 300 / Math.max(P, Math.abs(Q), 1);
  const O = [40, 210];
  const A = [O[0] + P * k, O[1]];
  const B = [A[0], O[1] - Q * k];
  return (
    TRAITS + ' stroke-width="2.4">' + seg(O, A) + seg(A, B, ' stroke-dasharray="7 4"') + "</g>" +
    TRAITS + ' stroke-width="3">' + seg(O, B) + "</g>" +
    TRAITS + ' stroke-width="1.2"><path d="' + arcSvg(O[0], O[1], 46, 0, Math.atan2(Q, P) / DEG) + '"/></g>' +
    ECRITS + texte((O[0] + A[0]) / 2 - 20, O[1] + 20, "P = " + unites[0]) + texte(A[0] + 8, (A[1] + B[1]) / 2, "Q = " + unites[1]) +
    texte((O[0] + B[0]) / 2 - 90, (O[1] + B[1]) / 2 - 8, "S = " + unites[2]) + texte(O[0] + 52, O[1] - 8, "φ") + "</g>"
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
  construireAnimRoue(racine, api);
  construireAnimFresnel(racine, api);
  construireSimPdelta(racine, api);
  construireAnimSynchro(racine, api);
  construireSimCourbesV(racine, api);
  construireDiagramme(racine, api);
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
    ["#d-coupe-figure svg", 1.8],
    ["#e-vide-figure svg", 1.6],
    ["#e-schema-figure svg", 1.5],
    ["#f-schema-principal svg", 1.8],
    ["#f-lieu-figure svg", 1.7],
    ["#h-figure svg", 1.5],
    ["#i-groupe-figure svg", 1.7],
  ];
  for (const [selecteur, duree] of schemas) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree }));
  }
}

/* --------------------------------------------------------------------------
   Corrections visuelles des questions de quiz
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
    const v = typeof visuel === "function" ? visuel() : visuel;
    schemaCorrection(api, conteneur, v.viewBox, v.dessin, v.legende);
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
    if (source !== "curseur" && etatSync.curseurs && etatSync.idCurseur) etatSync.curseurs.definir(etatSync.idCurseur, valeur);
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
      id: "c-poles",
      titre: "Nombre de pôles d'un alternateur lent",
      niveau: "prérequis",
      enonce:
        "<p>Une turbine hydraulique tourne à $300\\ \\mathrm{tr/min}$ et entraîne directement un alternateur qui doit produire du $50\\ \\mathrm{Hz}$. " +
        "Combien de pôles l'alternateur doit-il avoir ?</p>",
      valeur: 20,
      unite: "pôles",
      tolerance: 0.001,
      chiffres: 0,
      libelleChamp: "Nombre de pôles $2p$",
      etapes: [
        { texte: "La relation du champ tournant s'écrit $n = 60f/p$, donc $p = 60f/n$." },
        { texte: "$p = 60 \\times 50/300 = 10$ paires de pôles." },
        { texte: "Soit $2p = 20$ pôles.", note: "Plus la machine est lente, plus elle a de pôles : c'est le cas de toutes les machines hydrauliques." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurEtapes(3),
          dessinEtapes(["n = 60 f / p  donc  p = 60 f / n", "p = 60 × 50 / 300 = 10 paires", "2p = 20 pôles"], 560),
          "Étapes révélées une à une, de la vitesse au nombre de pôles."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-reactif",
      titre: "Puissance réactive d'une charge triphasée",
      niveau: "prérequis",
      enonce:
        "<p>Une charge triphasée équilibrée est alimentée sous une tension simple de $230\\ \\mathrm{V}$ et absorbe $100\\ \\mathrm{A}$ par phase, en retard de " +
        "$30^\\circ$ sur la tension. Quelle puissance réactive absorbe-t-elle, en kilovars ?</p>",
      valeur: 34.5,
      unite: "kvar",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Puissance réactive $Q$",
      etapes: [
        { texte: "Par phase : $Q_1 = VI\\sin\\varphi = 230 \\times 100 \\times 0{,}5 = 11{,}5\\ \\mathrm{kvar}$." },
        { texte: "Trois phases : $Q = 3VI\\sin\\varphi = 34{,}5\\ \\mathrm{kvar}$." },
        { texte: "Contrôle : $P = 3VI\\cos\\varphi = 59{,}76\\ \\mathrm{kW}$ et $\\tan 30^\\circ = 0{,}577$, $59{,}76 \\times 0{,}577 = 34{,}5$.", note: "Une charge à courant en retard absorbe du réactif : c'est ce réactif qu'un alternateur surexcité fournit." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 250",
          dessinTriangle(59.76, 34.5, ["59,76 kW", "34,5 kvar", "69,0 kVA"]),
          "Triangle des puissances : la puissance réactive est le côté opposé à l'angle φ."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-phaseur",
      titre: "Ajouter une chute inductive à un phaseur",
      niveau: "prérequis",
      enonce:
        "<p>On ajoute à une tension $\\underline{V} = 230\\ \\mathrm{V}$, prise comme référence, la chute $jX\\underline{I}$ dans une réactance " +
        "$X = 2\\ \\mathrm{\\Omega}$ parcourue par un courant de $50\\ \\mathrm{A}$ en phase avec $\\underline{V}$. Quel est le module de la somme ?</p>",
      valeur: Math.hypot(230, 100),
      unite: "V",
      tolerance: 0.005,
      chiffres: 1,
      libelleChamp: "Module $|\\underline{V} + jX\\underline{I}|$",
      etapes: [
        { texte: "$X\\underline{I} = 2 \\times 50 = 100\\ \\mathrm{V}$ en phase avec $\\underline{V}$ ; multiplier par $j$ le fait tourner de $+90^\\circ$." },
        { texte: "La somme vaut $230 + j\\,100\\ \\mathrm{V}$ : deux côtés d'un triangle rectangle." },
        { texte: "Module : $\\sqrt{230^2 + 100^2} = 250{,}8\\ \\mathrm{V}$, argument $\\arctan(100/230) = 23{,}5^\\circ$.", note: "C'est exactement la construction du diagramme de Fresnel de l'alternateur, à facteur de puissance unitaire." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const f = dessinFresnel({ V: 230, I: 50, phi: 0, Xs: 2, kV: 1.1, kI: 1.2, hauteur: 260, origine: [60, 220], notes: ["V = 230 V", "j X I = j 100 V", "somme : 250,8 V à 23,5°"] });
        schemaCorrection(moteurApi, conteneur, f.viewBox, f.dessin, "La chute inductive est perpendiculaire au courant ; ici le courant est en phase avec V.");
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : roue polaire accrochée au champ tournant
   -------------------------------------------------------------------------- */

function construireAnimRoue(racine, api) {
  const conteneur = racine.querySelector("#d-roue");
  if (!conteneur) return;
  const M = MICRO;
  const C0 = { x: 180, y: 200 };
  const XD = (d) => 570 + d * (160 / 180);
  const YC = 190;
  const AMPL = 120;
  const E_REF = 2.5;
  const cmaxDe = (ev) => (3 * M.V * M.V * ev) / (M.Xs * M.Om);
  const CREF = cmaxDe(E_REF);
  const AXE_Y = 362;
  const reglages = { ev: 1.985, theta: 90 };
  const id = nouveauMarqueur("fl-d-roue");
  const idO = nouveauMarqueur("fl-d-roue-o");

  const svg = svgEl("svg", {
    viewBox: "0 0 760 440",
    role: "img",
    "aria-label": "Roue polaire et champ tournant d'une machine bipolaire, avec la courbe du couple électromagnétique en fonction de l'angle interne",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(id) + marqueur(idO, true);

  let fond = TRAITS + ' stroke-width="2"><circle cx="' + C0.x + '" cy="' + C0.y + '" r="150"/><circle cx="' + C0.x + '" cy="' + C0.y + '" r="116"/></g>';
  fond += TRAITS + ' stroke-width="1.5"><path d="' + arcSvg(C0.x, C0.y, 166, 22, 52) + '" marker-end="url(#' + id + ')"/></g>';
  fond += '<rect x="' + XD(-90).toFixed(1) + '" y="56" width="' + (XD(90) - XD(-90)).toFixed(1) + '" height="268" fill="currentColor" fill-opacity="0.07" stroke="none"/>';
  fond += TRAITS + ' stroke-width="1.3"><path d="M' + XD(-180) + " " + YC + "H" + XD(180) + '"/><path d="M' + XD(0) + ' 50V330"/>';
  fond += '<path d="M' + XD(-180) + " " + AXE_Y + "H" + XD(180) + '"/>';
  let ecrits = "";
  for (const d of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) {
    fond += '<path d="M' + XD(d).toFixed(1) + " " + (AXE_Y - 5) + 'v10"/>';
    if (d % 90 === 0) ecrits += texte(XD(d) - (d < 0 ? 16 : d === 0 ? 4 : 10), AXE_Y + 22, String(d));
  }
  fond += "</g>";
  ecrits +=
    texte(XD(0) + 6, 64, "couple C (N·m)") + texte(XD(150), YC + 20, "δ (°)") + texte(XD(-84), 318, "zone stable, |δ| < 90°") +
    texte(XD(-180), 40, "moteur : δ < 0") + texte(XD(36), 40, "alternateur : δ > 0") + texte(XD(-180), AXE_Y + 42, "angle interne δ, poignée sur l'axe") +
    texte(C0.x + 92, C0.y - 158, "rotation") + texte(20, 430, "flèche pleine : pôles du rotor ; flèche ouverte en tirets : champ du stator");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecrits + "</g>";
  const courbe = svgEl("polyline", { fill: "none", stroke: "currentColor", "stroke-width": 2.6, "stroke-linejoin": "round" });
  const mobile = svgEl("g", { fill: "none", stroke: "currentColor" });
  const ecritsMobiles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, groupeFond, courbe, mobile, ecritsMobiles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-roue-valeurs", [
    { id: "delta", libelle: "Angle interne δ", unite: "°", decimales: 1 },
    { id: "ev", libelle: "Excitation E / V", decimales: 3 },
    { id: "C", libelle: "Couple électromagnétique", unite: "N·m", decimales: 0 },
    { id: "rap", libelle: "C / C_max", decimales: 3 },
    { id: "P", libelle: "Puissance échangée", unite: "kW", decimales: 1 },
    { id: "regime", libelle: "Régime", format: (v) => v },
    { id: "stab", libelle: "Stabilité", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function tracerCourbe() {
    const cmax = cmaxDe(reglages.ev);
    const pts = [];
    for (let d = -180; d <= 180; d += 3) pts.push([XD(d), YC - (cmax * Math.sin(d * DEG) * AMPL) / CREF]);
    courbe.setAttribute("points", chaine(pts));
  }

  function rotor(theta) {
    /* Contour de la roue polaire, axe à l'angle theta. */
    const local = [
      [-30, -70], [-60, -92], null, [60, -92], [30, -70], [30, 70], [60, 92], null, [-60, 92], [-30, 70],
    ];
    const r = (theta - 90) * DEG;
    const tourne = ([x, y]) => [C0.x + x * Math.cos(r) + y * Math.sin(r), C0.y - x * Math.sin(r) + y * Math.cos(r)];
    const p = local.map((q) => (q ? tourne(q) : null));
    const f = (q) => q[0].toFixed(1) + " " + q[1].toFixed(1);
    return (
      "M" + f(p[0]) + "L" + f(p[1]) + "A110 110 0 0 1 " + f(p[3]) + "L" + f(p[4]) + "L" + f(p[5]) + "L" + f(p[6]) +
      "A110 110 0 0 1 " + f(p[8]) + "L" + f(p[9]) + "Z"
    );
  }

  function dessiner(delta) {
    const theta = reglages.theta;
    const thR = theta + delta;
    const bout = (ang, r) => [C0.x + r * Math.cos(ang * DEG), C0.y - r * Math.sin(ang * DEG)];
    const cmax = cmaxDe(reglages.ev);
    const C = cmax * Math.sin(delta * DEG);
    const pN = bout(thR + 16, 82);
    const pS = bout(thR + 196, 82);
    mobile.innerHTML =
      '<path d="' + rotor(thR) + '" stroke-width="2"/>' +
      seg([C0.x, C0.y], bout(thR, 100), ' stroke-width="3" marker-end="url(#' + id + ')"') +
      seg(bout(theta + 180, 30), bout(theta, 146), ' stroke-width="2.2" stroke-dasharray="8 5" marker-end="url(#' + idO + ')"') +
      (Math.abs(delta) > 1 ? '<path d="' + arcSvg(C0.x, C0.y, 56, theta, thR) + '" stroke-width="1.4"/>' : "") +
      '<path d="M' + XD(-180) + " " + (YC - (cmax * AMPL) / CREF).toFixed(1) + "H" + XD(180) + '" stroke-width="1" stroke-dasharray="4 4"/>' +
      '<circle cx="' + XD(delta).toFixed(1) + '" cy="' + (YC - (C * AMPL) / CREF).toFixed(1) + '" r="5.5" fill="currentColor"/>' +
      '<path d="M' + XD(delta).toFixed(1) + " " + (YC - (C * AMPL) / CREF).toFixed(1) + "V" + (AXE_Y - 8) + '" stroke-width="1" stroke-dasharray="2 4"/>';
    const pD = bout(theta + delta / 2, 68);
    ecritsMobiles.innerHTML =
      texte(pN[0] - 5, pN[1] + 5, "N") + texte(pS[0] - 4, pS[1] + 5, "S") + (Math.abs(delta) > 6 ? texte(pD[0] - 4, pD[1] + 4, "δ") : "") +
      texte(XD(-178), YC - (cmax * AMPL) / CREF - 6, "C_max = " + nombre(api, cmax, 0) + " N·m");
    const regime = delta > 0.5 ? "alternateur, rotor en avance" : delta < -0.5 ? "moteur, rotor en retard" : "à vide, axes alignés";
    const stab = Math.abs(delta) < 90 ? "stable, couple de rappel" : Math.abs(delta) === 90 ? "limite de décrochage" : "instable : décrochage";
    if (valeurs) valeurs.maj({ delta, ev: reglages.ev, C, rap: Math.sin(delta * DEG), P: (C * M.Om) / 1000, regime, stab });
  }

  const synchro = synchroniseur(dessiner, { idCurseur: "delta" });
  synchro.curseurs = api.sim.curseurs(
    "#d-roue-curseurs",
    [
      { id: "delta", libelle: "Angle interne δ", min: -180, max: 180, pas: 0.5, valeur: 37, unite: "°" },
      { id: "ev", libelle: "Excitation E / V", min: 0.5, max: 2.5, pas: 0.005, valeur: 1.985, format: (v) => nombre(api, v, 3) },
    ],
    (lues) => {
      const change = lues.ev !== reglages.ev;
      reglages.ev = lues.ev;
      if (change) tracerCourbe();
      synchro.appliquer(lues.delta, "curseur");
    }
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: XD(-180), y: AXE_Y },
    a: { x: XD(180), y: AXE_Y },
    min: -180,
    max: 180,
    pas: 1,
    valeur: 37,
    unite: "°",
    libelle: "Angle interne sur l'axe gradué",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  const lecteur = api.sim.lecteur("#d-roue-lecteur", {
    de: 0,
    a: 1,
    duree: 8,
    boucle: true,
    auto: false,
    libelle: "Rotation à la vitesse du synchronisme, ralentie",
    rappel: (t) => {
      reglages.theta = 90 + 360 * t;
      synchro.redessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);

  tracerCourbe();
  synchro.appliquer(37, null);
}

/* --------------------------------------------------------------------------
   E. Animation : diagramme de Fresnel de l'alternateur
   -------------------------------------------------------------------------- */

function construireAnimFresnel(racine, api) {
  const conteneur = racine.querySelector("#e-fresnel");
  if (!conteneur) return;
  const M = MICRO;
  const O = { x: 250, y: 320 };
  const KV = 0.5;
  const KI = 0.3;
  const AXE = { x0: 80, x1: 680, y: 476 };
  const xPhi = (p) => AXE.x0 + ((p + 90) / 180) * (AXE.x1 - AXE.x0);
  const reglages = { I: 320.75, Xs: 0.96 };
  const id = nouveauMarqueur("fl-e-fr");
  const idO = nouveauMarqueur("fl-e-fr-o");

  const svg = svgEl("svg", {
    viewBox: "0 0 760 510",
    role: "img",
    "aria-label": "Diagramme de Fresnel de l'alternateur : tension simple de référence, courant, chute dans la réactance synchrone et force électromotrice, pour le déphasage choisi sur l'axe du bas",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(id) + marqueur(idO, true);
  let fond = TRAITS + ' stroke-width="1.1" stroke-dasharray="2 4"><path d="M40 ' + O.y + 'H740"/></g>';
  fond += TRAITS + ' stroke-width="1.4"><path d="M' + AXE.x0 + " " + AXE.y + "H" + AXE.x1 + '"/>';
  let ecrits = "";
  for (const p of [-90, -60, -30, 0, 30, 60, 90]) {
    fond += '<path d="M' + xPhi(p).toFixed(1) + " " + (AXE.y - 5) + 'v10"/>';
    ecrits += texte(xPhi(p) - (p < 0 ? 12 : p === 0 ? 4 : 8), AXE.y + 22, String(p));
  }
  fond += "</g>";
  ecrits +=
    texte(AXE.x0, AXE.y - 12, "φ (°) : I en avance, capacitif") + texte(AXE.x1 - 150, AXE.y - 12, "I en retard, inductif") +
    texte(470, 34, "échelles : 100 V pour 50 px,") + texte(470, 50, "100 A pour 30 px") + texte(560, O.y + 18, "axe de V, référence");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecrits + "</g>";
  const mobile = svgEl("g", { fill: "none", stroke: "currentColor" });
  const ecritsMobiles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, groupeFond, mobile, ecritsMobiles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-fresnel-valeurs", [
    { id: "phi", libelle: "Déphasage φ", unite: "°", decimales: 1 },
    { id: "cos", libelle: "Facteur de puissance", format: (v) => v },
    { id: "I", libelle: "Courant I", unite: "A", decimales: 1 },
    { id: "XI", libelle: "Chute X_s I", unite: "V", decimales: 1 },
    { id: "E", libelle: "Force électromotrice E", unite: "V", decimales: 1 },
    { id: "ev", libelle: "E / V", decimales: 3 },
    { id: "delta", libelle: "Angle interne δ", unite: "°", decimales: 1 },
    { id: "P", libelle: "Puissance active fournie", unite: "kW", decimales: 1 },
    { id: "Q", libelle: "Puissance réactive fournie", unite: "kvar", decimales: 1 },
    { id: "If", libelle: "Excitation I_f, modèle linéaire", unite: "A", decimales: 1 },
    { id: "etat", libelle: "Excitation", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner(phi) {
    const I = cPolaire(reglages.I, -phi);
    const chute = cMul(cx(0, reglages.Xs), I);
    const E = cAdd(cx(M.V, 0), chute);
    const Em = cMod(E);
    const d = cArg(E) / DEG;
    const P = (z, k) => [O.x + z.re * k, O.y - z.im * k];
    const pV = P(cx(M.V, 0), KV);
    const pE = P(E, KV);
    const pI = P(I, KI);
    const o = [O.x, O.y];
    mobile.innerHTML =
      '<path d="M40 ' + pE[1].toFixed(1) + 'H740" stroke-width="1" stroke-dasharray="1 5"/>' +
      seg(o, pI, ' stroke-width="1.8" marker-end="url(#' + idO + ')"') +
      seg(pV, pE, ' stroke-width="2.2" stroke-dasharray="8 4"') +
      seg(o, pV, ' stroke-width="2" marker-end="url(#' + id + ')"') +
      seg(o, pE, ' stroke-width="3.4" marker-end="url(#' + id + ')"') +
      (Math.abs(d) > 1 ? '<path d="' + arcSvg(O.x, O.y, 62, 0, d) + '" stroke-width="1.3"/>' : "") +
      (Math.abs(phi) > 1 ? '<path d="' + arcSvg(O.x, O.y, 44, 0, -phi) + '" stroke-width="1.1" stroke-dasharray="3 3"/>' : "") +
      '<circle cx="' + O.x + '" cy="' + O.y + '" r="3.5" fill="currentColor"/>';
    const milieu = [(pV[0] + pE[0]) / 2, (pV[1] + pE[1]) / 2];
    const pd = [O.x + 76 * Math.cos((d / 2) * DEG), O.y - 76 * Math.sin((d / 2) * DEG)];
    ecritsMobiles.innerHTML =
      texte(pV[0] - 6, O.y + (phi >= 0 ? -10 : 20), "V") + texte(pE[0] + (pE[0] > O.x ? 8 : -20), pE[1] - 6, "E") +
      texte(pI[0] + 6, pI[1] + (phi >= 0 ? 14 : -6), "I") + texte(milieu[0] + 10, milieu[1], "j X_s I") +
      (Math.abs(d) > 6 ? texte(pd[0], pd[1] + 4, "δ") : "") + texte(44, pE[1] - 6, "hauteur : X_s I cos φ");
    const Pw = 3 * M.V * reglages.I * Math.cos(phi * DEG);
    const Qv = 3 * M.V * reglages.I * Math.sin(phi * DEG);
    const ev = Em / M.V;
    const cosT = nombre(api, Math.abs(Math.cos(phi * DEG)), 3) + (phi > 0.05 ? " en retard" : phi < -0.05 ? " en avance" : "");
    const etat = ev > 1.0005 ? "surexcité : fournit du réactif" : ev < 0.9995 ? "sous-excité : absorbe du réactif" : "E = V";
    if (valeurs) valeurs.maj({ phi, cos: cosT, I: reglages.I, XI: reglages.Xs * reglages.I, E: Em, ev, delta: d, P: Pw / 1000, Q: Qv / 1000, If: ev * M.If0, etat });
  }

  const synchro = synchroniseur(dessiner, { idCurseur: "phi" });
  synchro.curseurs = api.sim.curseurs(
    "#e-fresnel-curseurs",
    [
      { id: "phi", libelle: "Déphasage φ du courant", min: -90, max: 90, pas: 0.01, valeur: 25.84, unite: "°" },
      { id: "I", libelle: "Courant I", min: 0, max: 400, pas: 0.25, valeur: 320.75, unite: "A" },
      { id: "Xs", libelle: "Réactance synchrone X_s", min: 0.3, max: 1.5, pas: 0.01, valeur: 0.96, unite: "Ω" },
    ],
    (lues) => {
      reglages.I = lues.I;
      reglages.Xs = lues.Xs;
      synchro.appliquer(lues.phi, "curseur");
    }
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: AXE.x0, y: AXE.y },
    a: { x: AXE.x1, y: AXE.y },
    min: -90,
    max: 90,
    pas: 0.5,
    valeur: 25.84,
    unite: "°",
    libelle: "Déphasage du courant sur l'axe gradué",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  synchro.lecteur = api.sim.lecteur("#e-fresnel-lecteur", {
    de: -90,
    a: 90,
    duree: 18,
    boucle: false,
    auto: false,
    libelle: "Balayage du déphasage de -90 à +90 degrés",
    rappel: (p) => synchro.appliquer(p, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);

  synchro.appliquer(25.84, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : puissance active en fonction de l'angle interne
   -------------------------------------------------------------------------- */

function construireSimPdelta(racine, api) {
  const M = MICRO;
  const reglages = { ev: 1.985, Xs: 0.96, Pm: 200 };
  const pmaxKW = () => (3 * M.V * M.V * reglages.ev) / reglages.Xs / 1000;

  const trace = api.sim.traceur("#e-pdelta-trace", {
    titre: "Puissance active de l'alternateur et puissance de la turbine",
    xTitre: "angle interne δ",
    xUnite: "°",
    yTitre: "puissance",
    yUnite: "kW",
    xMin: 0,
    xMax: 180,
    yMin: 0,
    yMax: 400,
    ratio: 0.5,
    series: [
      { id: "p", nom: "P(δ), excitation réglée", couleur: "serie-1", epaisseur: 2.8, fonction: (d) => pmaxKW() * Math.sin(d * DEG) },
      { id: "p1", nom: "P(δ), excitation à vide E = V", couleur: "serie-6", epaisseur: 1.4, fonction: (d) => ((3 * M.V * M.V) / reglages.Xs / 1000) * Math.sin(d * DEG) },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, reglages.Pm, "turbine : " + nombre(api, reglages.Pm, 0) + " kW");
      ligneV(c, repere, couleurs, 90, "90°");
      const pmax = pmaxKW();
      if (reglages.Pm <= pmax) {
        const d1 = Math.asin(reglages.Pm / pmax) / DEG;
        pointTrace(c, repere, couleurs, d1, reglages.Pm, "stable, " + nombre(api, d1, 1) + "°");
        pointTrace(c, repere, couleurs, 180 - d1, reglages.Pm, "instable, " + nombre(api, 180 - d1, 1) + "°", true);
      }
    },
  });
  if (trace) ressources.push(trace);

  const curseurs = api.sim.curseurs(
    "#e-pdelta-curseurs",
    [
      { id: "ev", libelle: "Excitation E / V", min: 0.5, max: 3, pas: 0.005, valeur: 1.985, format: (v) => nombre(api, v, 3) },
      { id: "Xs", libelle: "Réactance synchrone X_s", min: 0.5, max: 2, pas: 0.01, valeur: 0.96, unite: "Ω" },
      { id: "Pm", libelle: "Puissance mécanique de la turbine", min: 0, max: 400, pas: 1, valeur: 200, unite: "kW" },
    ],
    (lues) => {
      reglages.ev = lues.ev;
      reglages.Xs = lues.Xs;
      reglages.Pm = lues.Pm;
      if (!trace) return;
      const pmax = pmaxKW();
      trace.definirPlage({ xMin: 0, xMax: 180, yMin: 0, yMax: Math.max(100, Math.ceil((Math.max(pmax, reglages.Pm, (3 * M.V * M.V) / reglages.Xs / 1000) * 1.12) / 50) * 50) });
      trace.definirFonction("p", (d) => pmax * Math.sin(d * DEG));
      trace.definirFonction("p1", (d) => ((3 * M.V * M.V) / reglages.Xs / 1000) * Math.sin(d * DEG));
      const pt = pointExcitation(M.V, reglages.Xs, reglages.Pm * 1000, reglages.ev * M.V);
      trace.definirMesures(
        pt
          ? [
              { nom: "Puissance maximale", valeur: nombre(api, pmax, 1) + " kW" },
              { nom: "Angle stable", valeur: nombre(api, pt.delta, 1) + "°" },
              { nom: "Marge P_max / P", valeur: reglages.Pm > 0 ? nombre(api, pmax / reglages.Pm, 2) : "infinie" },
              { nom: "Réactif fourni", valeur: nombre(api, pt.Q / 1000, 1) + " kvar" },
              { nom: "Courant", valeur: nombre(api, pt.I, 1) + " A" },
            ]
          : [
              { nom: "Puissance maximale", valeur: nombre(api, pmax, 1) + " kW" },
              { nom: "Point d'équilibre", valeur: "aucun : la turbine dépasse P_max, décrochage" },
            ]
      );
    }
  );
  if (curseurs) ressources.push(curseurs);
}

/* --------------------------------------------------------------------------
   E. Animation : synchroscope et battement au couplage
   -------------------------------------------------------------------------- */

function construireAnimSynchro(racine, api) {
  const conteneur = racine.querySelector("#e-synchro");
  if (!conteneur) return;
  const G = GROUPE;
  const S0 = { x: 160, y: 200 };
  const R = 100;
  const GX = (t) => 340 + t * 19.5;
  const GY = (v) => 300 - v * 0.46;
  const AXE_Y = 346;
  const reglages = { df: 0.1, du: 0, th0: -150 };
  const id = nouveauMarqueur("fl-e-sy");

  const svg = svgEl("svg", {
    viewBox: "0 0 760 432",
    role: "img",
    "aria-label": "Synchroscope : tension du réseau fixe, tension de l'alternateur tournante, tension aux bornes du disjoncteur, et enveloppe du battement en fonction du temps",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(id);
  let fond = TRAITS + ' stroke-width="1.4"><circle cx="' + S0.x + '" cy="' + S0.y + '" r="' + (R + 22) + '"/></g>';
  fond += TRAITS + ' stroke-width="5"><path d="' + arcSvg(S0.x, S0.y, R + 22, 80, 100) + '"/></g>';
  fond += TRAITS + ' stroke-width="1.3"><path d="M' + GX(0) + " " + GY(0) + "H" + GX(20) + '"/><path d="M' + GX(0) + " " + GY(0) + "V" + GY(500) + '"/>';
  fond += '<path d="M' + GX(0) + " " + AXE_Y + "H" + GX(20) + '"/>';
  let ecrits = "";
  for (const t of [0, 5, 10, 15, 20]) {
    fond += '<path d="M' + GX(t).toFixed(1) + " " + (AXE_Y - 5) + 'v10"/>';
    ecrits += texte(GX(t) - 6, AXE_Y + 22, String(t));
  }
  for (const v of [100, 200, 300, 400, 500]) {
    fond += '<path d="M' + (GX(0) - 5) + " " + GY(v).toFixed(1) + 'h5"/>';
    ecrits += texte(GX(0) - 34, GY(v) + 4, String(v));
  }
  fond += "</g>";
  ecrits +=
    texte(S0.x - 52, S0.y - R - 32, "fenêtre ±10°") + texte(GX(0) + 6, GY(500) - 6, "ΔV (V)") + texte(GX(20) - 34, AXE_Y - 10, "t (s)") +
    texte(GX(0), AXE_Y + 40, "temps, poignée sur l'axe") + texte(20, 424, "flèche fine : réseau ; flèche épaisse : groupe ; tirets : ΔV aux bornes du disjoncteur");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecrits + "</g>";
  const enveloppe = svgEl("polyline", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "stroke-linejoin": "round" });
  const mobile = svgEl("g", { fill: "none", stroke: "currentColor" });
  const ecritsMobiles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, groupeFond, enveloppe, mobile, ecritsMobiles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-synchro-valeurs", [
    { id: "t", libelle: "Instant t", unite: "s", decimales: 2 },
    { id: "th", libelle: "Écart de phase", unite: "°", decimales: 1 },
    { id: "dv", libelle: "Tension aux bornes du disjoncteur", unite: "V", decimales: 1 },
    { id: "i", libelle: "Courant si fermeture à cet instant", unite: "A", decimales: 0 },
    { id: "rap", libelle: "Rapport au courant nominal", decimales: 2 },
    { id: "periode", libelle: "Période du battement", format: (v) => v },
    { id: "verdict", libelle: "Synchroniseur", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const phase = (t) => {
    const brut = reglages.th0 + 360 * reglages.df * t;
    return ((((brut + 180) % 360) + 360) % 360) - 180;
  };
  const deltaV = (t) => G.V * cMod(cSub(cPolaire(1 + reglages.du / 100, phase(t)), cx(1, 0)));

  function tracerEnveloppe() {
    const pts = [];
    for (let t = 0; t <= 20.0001; t += 0.05) pts.push([GX(t), GY(deltaV(t))]);
    enveloppe.setAttribute("points", chaine(pts));
  }

  function dessiner(t) {
    const th = phase(t);
    const pr = [S0.x, S0.y - R];
    const ag = 90 + th;
    const lg = R * (1 + reglages.du / 100);
    const pg = [S0.x + lg * Math.cos(ag * DEG), S0.y - lg * Math.sin(ag * DEG)];
    const dv = deltaV(t);
    mobile.innerHTML =
      seg([S0.x, S0.y], pr, ' stroke-width="1.8" marker-end="url(#' + id + ')"') +
      seg([S0.x, S0.y], pg, ' stroke-width="3.2" marker-end="url(#' + id + ')"') +
      seg(pr, pg, ' stroke-width="1.8" stroke-dasharray="6 4"') +
      '<circle cx="' + S0.x + '" cy="' + S0.y + '" r="3.5" fill="currentColor"/>' +
      '<path d="M' + GX(t).toFixed(1) + " " + GY(500) + "V" + (AXE_Y - 8) + '" stroke-width="1.2"/>' +
      '<circle cx="' + GX(t).toFixed(1) + '" cy="' + GY(dv).toFixed(1) + '" r="5" fill="currentColor"/>';
    ecritsMobiles.innerHTML =
      texte(pr[0] + 6, pr[1] + 16, "réseau") + texte(pg[0] + (pg[0] >= S0.x ? 8 : -60), pg[1] + (pg[1] < S0.y ? -6 : 16), "groupe") +
      texte((pr[0] + pg[0]) / 2 + 6, (pr[1] + pg[1]) / 2 + 4, "ΔV");
    const i = dv / (G.Xd1 + G.Xr);
    const raisons = [];
    if (Math.abs(th) > 10) raisons.push("phase");
    if (Math.abs(reglages.df) > 0.2) raisons.push("fréquence");
    if (Math.abs(reglages.du) > 5) raisons.push("tension");
    const verdict = raisons.length ? "fermeture refusée : " + raisons.join(", ") : "fermeture autorisée";
    const periode = Math.abs(reglages.df) > 1e-6 ? nombre(api, 1 / Math.abs(reglages.df), 2) + " s" : "infinie, phase figée";
    if (valeurs) valeurs.maj({ t, th, dv, i, rap: i / G.In, periode, verdict });
  }

  const synchro = synchroniseur(dessiner, {});
  const curseurs = api.sim.curseurs(
    "#e-synchro-curseurs",
    [
      { id: "df", libelle: "Écart de fréquence, groupe moins réseau", min: -0.5, max: 0.5, pas: 0.01, valeur: 0.1, unite: "Hz" },
      { id: "du", libelle: "Écart de tension", min: -10, max: 10, pas: 0.5, valeur: 0, unite: "%" },
      { id: "th0", libelle: "Écart de phase à t = 0", min: -180, max: 180, pas: 1, valeur: -150, unite: "°" },
    ],
    (lues) => {
      reglages.df = lues.df;
      reglages.du = lues.du;
      reglages.th0 = lues.th0;
      tracerEnveloppe();
      synchro.redessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: GX(0), y: AXE_Y },
    a: { x: GX(20), y: AXE_Y },
    min: 0,
    max: 20,
    pas: 0.05,
    valeur: 0,
    unite: "s",
    libelle: "Instant sur l'axe du temps",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  synchro.lecteur = api.sim.lecteur("#e-synchro-lecteur", {
    de: 0,
    a: 20,
    duree: 20,
    boucle: false,
    auto: false,
    libelle: "Écoulement du temps, de 0 à 20 s",
    rappel: (t) => synchro.appliquer(t, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);

  tracerEnveloppe();
  synchro.appliquer(0, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : courbes en V du moteur synchrone
   -------------------------------------------------------------------------- */

function construireSimCourbesV(racine, api) {
  const M = MICRO;
  const reglages = { P: 150, If: 35 };
  const courant = (Pk) => (If) => {
    const r = moteurV(M.V, M.Xs, Pk * 1000, If, M.If0);
    return r ? r.I : NaN;
  };
  const ifMin = (Pk) => (M.If0 / M.V) * Math.hypot(M.V, (Pk * 1000 * M.Xs) / (3 * M.V));

  const trace = api.sim.traceur("#e-courbesv-trace", {
    titre: "Courbes en V du moteur synchrone de 250 kVA",
    xTitre: "courant d'excitation I_f",
    xUnite: "A",
    yTitre: "courant de ligne I",
    yUnite: "A",
    xMin: 0,
    xMax: 60,
    yMin: 0,
    yMax: 600,
    ratio: 0.5,
    echantillons: 480,
    series: [
      { id: "p0", nom: "0 kW, compensateur", couleur: "serie-6", epaisseur: 1.3, fonction: courant(0) },
      { id: "p100", nom: "100 kW", couleur: "serie-4", epaisseur: 1.3, fonction: courant(100) },
      { id: "p200", nom: "200 kW", couleur: "serie-3", epaisseur: 1.3, fonction: courant(200) },
      { id: "pc", nom: "puissance choisie", couleur: "serie-1", epaisseur: 3, fonction: courant(150) },
    ],
    surDessin({ c, repere, couleurs }) {
      const pts = [];
      for (let Pk = 0; Pk <= 400; Pk += 5) pts.push([ifMin(Pk), (Pk * 1000) / (3 * M.V)]);
      courbeTirets(c, repere, couleurs, pts);
      const r = moteurV(M.V, M.Xs, reglages.P * 1000, reglages.If, M.If0);
      if (r) pointTrace(c, repere, couleurs, reglages.If, r.I, nombre(api, r.I, 1) + " A");
      ligneV(c, repere, couleurs, M.If0, "I_f0", [3, 4]);
    },
  });
  if (trace) ressources.push(trace);

  const curseurs = api.sim.curseurs(
    "#e-courbesv-curseurs",
    [
      { id: "P", libelle: "Puissance absorbée P", min: 0, max: 300, pas: 5, valeur: 150, unite: "kW" },
      { id: "If", libelle: "Courant d'excitation I_f", min: 5, max: 60, pas: 0.1, valeur: 35, unite: "A" },
    ],
    (lues) => {
      reglages.P = lues.P;
      reglages.If = lues.If;
      if (!trace) return;
      trace.definirFonction("pc", courant(lues.P));
      const r = moteurV(M.V, M.Xs, lues.P * 1000, lues.If, M.If0);
      const decroche = (M.If0 / M.V) * ((lues.P * 1000 * M.Xs) / (3 * M.V));
      if (!r) {
        trace.definirMesures([
          { nom: "Point de fonctionnement", valeur: "aucun : δ atteindrait 90°, décrochage" },
          { nom: "Excitation minimale", valeur: nombre(api, decroche, 1) + " A" },
        ]);
        return;
      }
      const Q = r.Qabs / 1000;
      trace.definirMesures([
        { nom: "E / V", valeur: nombre(api, r.Em / M.V, 3) },
        { nom: "Angle interne", valeur: nombre(api, r.delta, 1) + "°" },
        { nom: "Courant", valeur: nombre(api, r.I, 1) + " A" },
        { nom: "Facteur de puissance", valeur: nombre(api, Math.abs(r.cos), 3) + (Q > 0.05 ? " en retard" : Q < -0.05 ? " en avance" : "") },
        { nom: "Réactif", valeur: Q > 0.05 ? nombre(api, Q, 1) + " kvar absorbés" : Q < -0.05 ? nombre(api, -Q, 1) + " kvar fournis" : "nul" },
        { nom: "Courant minimal", valeur: nombre(api, (lues.P * 1000) / (3 * M.V), 1) + " A à I_f = " + nombre(api, ifMin(lues.P), 1) + " A" },
        { nom: "Décrochage", valeur: "sous I_f = " + nombre(api, decroche, 1) + " A" },
      ]);
    }
  );
  if (curseurs) ressources.push(curseurs);
}

/* --------------------------------------------------------------------------
   I. Simulation : diagramme de fonctionnement du groupe électrogène
   -------------------------------------------------------------------------- */

function construireDiagramme(racine, api) {
  const conteneur = racine.querySelector("#i-diagramme");
  if (!conteneur) return;
  const G = GROUPE;
  const K = 2.4;
  const X0 = 70;
  const Y0 = 316;
  const X = (p) => X0 + p * K;
  const Y = (q) => Y0 - q * K;
  const Q0 = (3 * G.V * G.V) / G.Xs / 1000;
  const REMAX = G.Emax * Q0;
  const SN = G.Sn / 1000;
  const PD = G.Pd / 1000;
  const QMIN = G.Qmin / 1000;
  const id = nouveauMarqueur("fl-i-pq");

  const svg = svgEl("svg", {
    viewBox: "0 0 760 520",
    role: "img",
    "aria-label": "Diagramme de fonctionnement P-Q du groupe électrogène : courant nominal, puissance du moteur diesel, excitation maximale, limite de sous-excitation et limite de stabilité, avec un point de fonctionnement déplaçable",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(id);

  /* Domaine admissible : Q >= Qmin, P <= PD, S <= SN, E <= Emax. */
  const domaine = [];
  domaine.push([0, QMIN], [PD, QMIN]);
  const qS = (p) => Math.sqrt(Math.max(0, SN * SN - p * p));
  const qE = (p) => Math.sqrt(Math.max(0, REMAX * REMAX - p * p)) - Q0;
  for (let p = PD; p >= 0; p -= 1) domaine.push([p, Math.min(qS(p), qE(p))]);
  const poly = domaine.map(([p, q]) => [X(p), Y(q)]);

  let fond = '<polygon points="' + chaine(poly) + '" fill="currentColor" fill-opacity="0.07" stroke="none"/>';
  fond += TRAITS + ' stroke-width="1.3"><path d="M' + X0 + " " + Y0 + "H" + X(135) + '" marker-end="url(#' + id + ')"/><path d="M' + X0 + " " + Y(-72) + "V" + Y(120) + '" marker-end="url(#' + id + ')"/>';
  let ecrits = "";
  for (let p = 20; p <= 120; p += 20) {
    fond += '<path d="M' + X(p) + " " + (Y0 - 4) + 'v8"/>';
    ecrits += texte(X(p) - 9, Y0 + 18, String(p));
  }
  for (let q = -60; q <= 100; q += 20) {
    if (q === 0) continue;
    fond += '<path d="M' + (X0 - 4) + " " + Y(q) + 'h8"/>';
    ecrits += texte(X0 - 34, Y(q) + 4, String(q));
  }
  fond += "</g>";
  /* Courant nominal */
  const ptsS = [];
  for (let a = -44; a <= 90; a += 2) ptsS.push([X(SN * Math.cos(a * DEG)), Y(SN * Math.sin(a * DEG))]);
  fond += '<polyline points="' + chaine(ptsS) + '" fill="none" stroke="currentColor" stroke-width="2.6"/>';
  /* Diesel */
  fond += TRAITS + ' stroke-width="1.8"><path d="M' + X(PD) + " " + Y(-70) + "V" + Y(112) + '"/></g>';
  /* Excitation maximale */
  const ptsE = [];
  for (let p = 0; p <= 130; p += 2) ptsE.push([X(p), Y(qE(p))]);
  fond += '<polyline points="' + chaine(ptsE) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="8 5"/>';
  /* Sous-excitation et stabilité */
  fond += TRAITS + ' stroke-width="1.6" stroke-dasharray="10 4 2 4"><path d="M' + X0 + " " + Y(QMIN) + "H" + X(130) + '"/></g>';
  fond += TRAITS + ' stroke-width="1.2" stroke-dasharray="1 4"><path d="M' + X0 + " " + Y(-Q0) + "H" + X(130) + '"/></g>';
  /* Points étudiés */
  const etudies = [
    ["A", 48.88, 9.14],
    ["B", 80, 60],
    ["C", 14.22, -2.19],
  ];
  for (const [nom, p, q] of etudies) {
    fond += '<rect x="' + (X(p) - 4) + '" y="' + (Y(q) - 4) + '" width="8" height="8" fill="currentColor"/>';
    ecrits += texte(X(p) + 7, Y(q) - 7, nom);
  }
  ecrits +=
    texte(X(135) - 20, Y0 + 34, "P (kW)") + texte(X0 + 8, Y(120) + 4, "Q (kvar)") + texte(X0 - 14, Y0 + 18, "0") +
    texte(X(PD) + 4, Y(108), "diesel 80 kW") + texte(X(20), Y(QMIN) + 16, "sous-excitation, -30 kvar") + texte(X(20), Y(-Q0) + 16, "stabilité en parallèle, δ = 90°");
  const leg = [
    "trait plein épais : courant nominal, S = 100 kVA",
    "trait plein : puissance du diesel, 80 kW",
    "tirets : excitation maximale, E = 2,8 V",
    "tirets mixtes : sous-excitation supposée",
    "pointillés fins : δ = 90°, centre du cercle",
    "aplat clair : domaine admissible",
    "A : marche dégradée du site",
    "B : point nominal, 80 kW, 60 kvar",
    "C : KM4 collé, faible charge",
  ];
  leg.forEach((l, i) => {
    ecrits += texte(410, 40 + i * 20, l);
  });
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS.replace('font-size="12"', 'font-size="11.5"') + ecrits + "</g>";
  const mobile = svgEl("g", { fill: "none", stroke: "currentColor" });
  svg.append(defs, groupeFond, mobile);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#i-diagramme-valeurs", [
    { id: "P", libelle: "Puissance active", unite: "kW", decimales: 1 },
    { id: "Q", libelle: "Puissance réactive fournie", unite: "kvar", decimales: 1 },
    { id: "S", libelle: "Puissance apparente", unite: "kVA", decimales: 1 },
    { id: "I", libelle: "Courant", unite: "A", decimales: 1 },
    { id: "cos", libelle: "Facteur de puissance", format: (v) => v },
    { id: "ev", libelle: "E / V, soit I_f / I_f0", decimales: 3 },
    { id: "delta", libelle: "Angle interne δ", unite: "°", decimales: 1 },
    { id: "diesel", libelle: "Charge du diesel", unite: "%", decimales: 1 },
    { id: "verdict", libelle: "Limites", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner(P, Q) {
    const r = alternateur(G.V, G.Xs, P * 1000, Q * 1000);
    const S = Math.hypot(P, Q);
    const ev = r.Em / G.V;
    const depasse = [];
    if (S > SN + 1e-9) depasse.push("courant nominal");
    if (P > PD + 1e-9) depasse.push("diesel");
    if (ev > G.Emax + 1e-9) depasse.push("excitation maximale");
    if (Q < QMIN - 1e-9) depasse.push("sous-excitation");
    mobile.innerHTML =
      seg([X0, Y0], [X(P), Y(Q)], ' stroke-width="1.2" stroke-dasharray="4 3"') +
      seg([X(P), Y(Q)], [X(P), Y0], ' stroke-width="1" stroke-dasharray="1 4"');
    const cosT = S > 1e-6 ? nombre(api, P / S, 3) + (Q > 0.05 ? " en retard" : Q < -0.05 ? " en avance" : "") : "indéfini";
    if (valeurs) {
      valeurs.maj({
        P,
        Q,
        S,
        I: r.Imod,
        cos: cosT,
        ev,
        delta: r.delta,
        diesel: (P / PD) * 100,
        verdict: depasse.length ? "dépassée : " + depasse.join(", ") : "point admissible",
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: X0, y: Y(115), largeur: 130 * K, hauteur: (115 + 70) * K },
    valeur: { x: X(48.88), y: Y(9.14) },
    pas: 2.4,
    libelle: "Point de fonctionnement dans le plan P-Q",
    rappel: (mesure) => dessiner((mesure.x - X0) / K, (Y0 - mesure.y) / K),
  });
  if (poignee) ressources.push(poignee);
  else dessiner(48.88, 9.14);
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";
  const M = MICRO;
  const G = GROUPE;

  /* 1. Fondamental : nombre de pôles */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-poles",
      titre: "Alternateur d'une centrale au fil de l'eau",
      niveau: "fondamental",
      enonce:
        "<p>Une turbine Kaplan de basse chute tourne à $125\\ \\mathrm{tr/min}$ et entraîne directement un alternateur raccordé à un réseau de " +
        "$50\\ \\mathrm{Hz}$. Combien de pôles l'alternateur doit-il avoir ?</p>",
      valeur: 48,
      unite: "pôles",
      tolerance: 0.001,
      chiffres: 0,
      libelleChamp: "Nombre de pôles $2p$",
      etapes: [
        { texte: "$p = 60f/n = 60 \\times 50/125 = 24$ paires de pôles." },
        { texte: "Soit $2p = 48$ pôles." },
        { texte: "Contrôle : $n = 60 \\times 50/24 = 125\\ \\mathrm{tr/min}$.", note: "Une telle roue polaire a un grand diamètre : la vitesse périphérique, et non la vitesse de rotation, fixe les contraintes mécaniques." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurBarres(4),
          dessinBarres([["2 pôles", 3000, false], ["8 pôles", 750, false], ["20 pôles", 300, false], ["48 pôles", 125, true]], 3000, "tr/min", 560),
          "Vitesse à 50 Hz selon le nombre de pôles : la barre foncée est la réponse."
        );
      },
    })
  );

  /* 2. Fondamental : puissance réactive fournie */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-reactif",
      titre: "Puissance réactive fournie par un alternateur",
      niveau: "fondamental",
      enonce:
        "<p>Un alternateur débite $150\\ \\mathrm{A}$ sous $400\\ \\mathrm{V}$ entre phases, avec un facteur de puissance de $0{,}85$, le courant étant en " +
        "retard sur la tension. Quelle puissance réactive fournit-il au réseau, en kilovars ?</p>",
      valeur: RAC3 * 400 * 150 * Math.sin(Math.acos(0.85)) / 1000,
      unite: "kvar",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Puissance réactive $Q$",
      etapes: [
        { texte: "$\\sin\\varphi = \\sqrt{1 - 0{,}85^2} = 0{,}5268$." },
        { texte: "$Q = \\sqrt{3}\\,UI\\sin\\varphi = \\sqrt{3} \\times 400 \\times 150 \\times 0{,}5268 = 54{,}74\\ \\mathrm{kvar}$." },
        { texte: "En convention générateur, un courant en retard correspond à une puissance réactive fournie : l'alternateur est surexcité.", note: "$P = 88{,}33\\ \\mathrm{kW}$ et $S = 103{,}9\\ \\mathrm{kVA}$ complètent le triangle." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(moteurApi, conteneur, "0 0 560 250", dessinTriangle(88.33, 54.74, ["88,33 kW", "54,74 kvar", "103,9 kVA"]), "Triangle des puissances fournies par l'alternateur.");
      },
    })
  );

  /* 3. Intermédiaire : force électromotrice au point nominal du groupe */
  const nominal = alternateur(G.V, G.Xs, 80e3, 60e3);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-fem",
      titre: "Excitation du groupe électrogène à pleine charge",
      niveau: "intermédiaire",
      enonce:
        "<p>Le groupe électrogène du site, $100\\ \\mathrm{kVA}$, $400\\ \\mathrm{V}$, $x_s = 2{,}0$, débite sa puissance nominale, $80\\ \\mathrm{kW}$ et " +
        "$60\\ \\mathrm{kvar}$, sur une charge isolée. Résistance négligée, quelle force électromotrice par phase son excitation doit-elle produire ?</p>",
      valeur: nominal.Em,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Force électromotrice $E$",
      etapes: [
        { texte: "$Z_b = 400^2/100\\,000 = 1{,}6\\ \\mathrm{\\Omega}$, donc $X_s = 3{,}2\\ \\mathrm{\\Omega}$ ; $I_n = 144{,}34\\ \\mathrm{A}$, $\\cos\\varphi = 0{,}8$ en retard, $\\varphi = 36{,}87^\\circ$." },
        { texte: "$X_sI = 3{,}2 \\times 144{,}34 = 461{,}9\\ \\mathrm{V}$, à $90^\\circ - 36{,}87^\\circ = 53{,}13^\\circ$ : $jX_s\\underline{I} = 277{,}1 + j\\,369{,}5\\ \\mathrm{V}$." },
        { texte: "$\\underline{E} = 230{,}94 + 277{,}1 + j\\,369{,}5 = 508{,}1 + j\\,369{,}5\\ \\mathrm{V}$, soit $E = 628{,}2\\ \\mathrm{V}$ et $\\delta = 36{,}0^\\circ$." },
        { texte: "$E/V = 2{,}72$ : l'excitation à pleine charge vaut près de trois fois l'excitation à vide.", note: "En valeurs relatives : $|1 + j2(0{,}8 - j0{,}6)| = |2{,}2 + j1{,}6| = 2{,}72$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const f = dessinFresnel({ V: G.V, I: G.In, phi: 36.87, Xs: G.Xs, kV: 0.45, kI: 0.6, hauteur: 340, origine: [50, 236], notesPos: [330, 272], notes: ["V = 230,9 V", "I = 144,3 A, φ = 36,9°", "X_s I = 461,9 V", "E = 628,2 V, δ = 36,0°"] });
        schemaCorrection(moteurApi, conteneur, f.viewBox, f.dessin, "Diagramme de Fresnel du groupe à pleine charge, convention générateur.");
      },
    })
  );

  /* 4. Intermédiaire : compensation par moteur synchrone */
  const Qusine = 800 * Math.tan(Math.acos(0.75));
  const Qcible = 1000 * Math.tan(Math.acos(0.95));
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-compensation",
      titre: "Relever le facteur de puissance avec un moteur synchrone",
      niveau: "intermédiaire",
      enonce:
        "<p>Une usine absorbe $800\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}75$ inductif. On ajoute un moteur synchrone qui entraîne un compresseur de " +
        "$200\\ \\mathrm{kW}$, pertes comprises, et l'on veut que l'ensemble présente $\\cos\\varphi = 0{,}95$ inductif. Quelle puissance réactive le moteur " +
        "doit-il fournir, en kilovars ?</p>",
      valeur: Qusine - Qcible,
      unite: "kvar",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Puissance réactive fournie $Q_m$",
      etapes: [
        { texte: "Réactif de l'usine : $Q_u = 800\\tan(\\arccos 0{,}75) = 800 \\times 0{,}8819 = 705{,}5\\ \\mathrm{kvar}$." },
        { texte: "Après ajout du moteur, $P = 1000\\ \\mathrm{kW}$ ; réactif admis : $Q_t = 1000 \\times \\tan(\\arccos 0{,}95) = 328{,}7\\ \\mathrm{kvar}$." },
        { texte: "Le moteur doit fournir $Q_m = 705{,}5 - 328{,}7 = 376{,}8\\ \\mathrm{kvar}$." },
        { texte: "Sa puissance apparente vaut $\\sqrt{200^2 + 376{,}8^2} = 426{,}6\\ \\mathrm{kVA}$, à $\\cos\\varphi = 0{,}469$ capacitif : il faut un moteur largement surdimensionné et fortement surexcité.", note: "On compare alors avec une batterie de condensateurs de même réactif : moins chère, mais fixe ou par gradins." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 " + hauteurBarres(3),
          dessinBarres([["réactif de l'usine", 705.5, false], ["réactif admis", 328.7, false], ["fourni par le moteur", 376.8, true]], 705.5, "kvar", 560),
          "Bilan de puissance réactive : le moteur synchrone comble l'écart."
        );
      },
    })
  );

  /* 5. Avancé : dimensionnement de l'excitation sous contrainte */
  const p225 = alternateur(M.V, M.Xs, 225e3, 225e3 * Math.tan(Math.acos(0.9)));
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-excitation",
      titre: "Tenir le facteur de puissance quand le débit augmente",
      niveau: "avancé",
      enonce:
        "<p>L'alternateur de la microcentrale, $250\\ \\mathrm{kVA}$, $400\\ \\mathrm{V}$, $X_s = 0{,}96\\ \\mathrm{\\Omega}$, $I_{f0} = 20\\ \\mathrm{A}$, " +
        "passe à $225\\ \\mathrm{kW}$. Le gestionnaire du réseau exige toujours $\\cos\\varphi = 0{,}9$, réactif fourni. Quel courant d'excitation faut-il, " +
        "dans le modèle linéaire ? Vérifiez ensuite le courant du stator et l'angle interne.</p>",
      valeur: (p225.Em / M.V) * M.If0,
      unite: "A",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Courant d'excitation $I_f$",
      etapes: [
        { texte: "$Q = 225 \\times 0{,}4843 = 109{,}0\\ \\mathrm{kvar}$ ; $I = 225\\,000/(\\sqrt{3} \\times 400 \\times 0{,}9) = 360{,}8\\ \\mathrm{A}$, exactement $I_n$." },
        { texte: "$X_sI = 346{,}4\\ \\mathrm{V}$ à $64{,}16^\\circ$ : $jX_s\\underline{I} = 151{,}0 + j\\,311{,}8\\ \\mathrm{V}$." },
        { texte: "$\\underline{E} = 381{,}9 + j\\,311{,}8\\ \\mathrm{V}$, $E = 493{,}0\\ \\mathrm{V}$, $\\delta = 39{,}2^\\circ$, $E/V = 2{,}135$." },
        { texte: "$I_f = 2{,}135 \\times 20 = 42{,}7\\ \\mathrm{A}$, contre $39{,}7\\ \\mathrm{A}$ à $200\\ \\mathrm{kW}$.", note: "Le stator est à son courant nominal : $225\\ \\mathrm{kW}$ à $\\cos\\varphi = 0{,}9$ est la limite de la machine. L'angle reste confortable, la marge $P_{max}/P = 1{,}58$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const f = dessinFresnel({ V: M.V, I: 360.84, phi: 25.84, Xs: M.Xs, kV: 0.55, kI: 0.32, hauteur: 330, origine: [50, 250], notes: ["225 kW, cos φ = 0,9", "I = I_n = 360,8 A", "E = 493,0 V, δ = 39,2°", "I_f = 42,7 A"] });
        schemaCorrection(moteurApi, conteneur, f.viewBox, f.dessin, "Diagramme de Fresnel à 225 kW : la force électromotrice s'allonge pour tenir le réactif.");
      },
    })
  );

  /* 6. Diagnostic industriel */
  const diag = alternateur(M.V, M.Xs, 200e3, -110e3);
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Courant anormal après une intervention sur le régulateur",
      niveau: "diagnostic",
      enonce:
        "<p>Après le remplacement de la carte du régulateur de tension de la microcentrale, l'exploitant relève, alternateur couplé : $200\\ \\mathrm{kW}$ " +
        "comme avant, mais $329\\ \\mathrm{A}$ au lieu de $321\\ \\mathrm{A}$, et un varmètre qui indique $110\\ \\mathrm{kvar}$ absorbés au lieu de " +
        "$97\\ \\mathrm{kvar}$ fournis. Quelles conclusions sont justes ?</p>",
      options: [
        { texte: "L'alternateur est sous-excité : la consigne du nouveau régulateur est trop basse.", juste: true },
        { texte: "L'angle interne a fortement augmenté, et la marge de stabilité est devenue très faible.", juste: true },
        { texte: "La turbine fournit plus de puissance qu'avant." },
        { texte: "Le courant d'excitation a augmenté." },
        { texte: "Il faut rétablir l'excitation avant tout à-coup de réseau, et vérifier la limite de sous-excitation du régulateur.", juste: true },
      ],
      multiple: true,
      etapes: [
        { texte: "$P$ inchangée : la turbine n'a pas bougé. Le réactif a changé de signe : c'est l'excitation qui a baissé." },
        { texte: "Avec $P = 200\\ \\mathrm{kW}$ et $Q = -110\\ \\mathrm{kvar}$ : $\\underline{E} = \\underline{V} + jX_s\\underline{I}$ donne $E = 288{,}0\\ \\mathrm{V}$, soit $1{,}247\\,V$ et $I_f = 24{,}9\\ \\mathrm{A}$ au lieu de $39{,}7\\ \\mathrm{A}$." },
        { texte: "L'angle interne vaut alors $74{,}2^\\circ$, et $P_{max} = 3VE/X_s = 207{,}9\\ \\mathrm{kW}$ : la marge n'est plus que de $1{,}04$.", note: "Un creux de tension du réseau suffirait à faire décrocher la machine : la protection contre la perte d'excitation doit pouvoir agir." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const phi = Math.atan2(-110, 200) / DEG;
        const f = dessinFresnel({ V: M.V, I: diag.Imod, phi, Xs: M.Xs, kV: 0.7, kI: 0.35, hauteur: 290, origine: [60, 250], notes: ["P = 200 kW, Q = -110 kvar", "E = 288,0 V, δ = 74,2°", "marge P_max / P = 1,04"] });
        schemaCorrection(moteurApi, conteneur, f.viewBox, f.dessin, "Machine sous-excitée : courant en avance, force électromotrice courte et presque verticale.");
      },
    })
  );

  /* 7. Conceptuelle */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Pourquoi un moteur synchrone ne démarre pas seul",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi un moteur synchrone dont l'inducteur est alimenté ne démarre pas lorsqu'on ferme son contacteur sur le " +
        "réseau, et citez deux moyens de le démarrer.</p>",
      motsCles: [["moyen", "nul", "alterne", "alternatif"], ["attire", "repousse", "defile", "tourne trop vite", "inertie"], ["cage", "amortiss", "asynchrone"], ["variateur", "frequence", "onduleur", "convertisseur"]],
      minimum: 3,
      exemple: "Trois phrases : ce que voit le rotor immobile, pourquoi le couple moyen est nul, comment on contourne le problème.",
      etapes: [
        { texte: "Rotor immobile, le champ du stator tourne déjà à $60f/p$ : il défile devant les pôles, qui sont attirés pendant une demi-période puis repoussés pendant l'autre." },
        { texte: "Le couple est alternatif à $f$, de valeur moyenne nulle ; l'inertie du rotor l'empêche de suivre : il vibre sans démarrer." },
        { texte: "On démarre en asynchrone grâce à la cage d'amortisseurs, inducteur fermé sur une résistance, puis on excite près du synchronisme ; ou l'on alimente le moteur par un variateur dont la fréquence part de zéro.", note: "Un moteur synchrone autopiloté à aimants n'a jamais ce problème, puisque son onduleur suit la position du rotor." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Couple d'un rotor immobile dans le champ tournant",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "couple relatif",
          xMin: 0,
          xMax: 60,
          yMin: -1.2,
          yMax: 1.2,
          series: [{ id: "c", nom: "C(t) / C_max, rotor bloqué", couleur: "serie-1", epaisseur: 2.4, fonction: (t) => Math.sin(TAU * 0.05 * t) }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 0, "valeur moyenne nulle");
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

/** Diagramme de Fresnel fixe, pour la question de lecture de schéma. */
function dessinQuizFresnel(id) {
  const O = [60, 250];
  const pV = [260, 250];
  const pE = [400, 90];
  const pI = [165, 340];
  return (
    "<defs>" + marqueur(id) + marqueur(id + "-o", true) + "</defs>" +
    TRAITS + ' stroke-width="1.1" stroke-dasharray="2 4"><path d="M40 250H500"/></g>' +
    TRAITS + ' stroke-width="2.4">' + seg(O, pV, ' marker-end="url(#' + id + ')"') + "</g>" +
    TRAITS + ' stroke-width="2" stroke-dasharray="7 4">' + seg(pV, pE) + "</g>" +
    TRAITS + ' stroke-width="3.2">' + seg(O, pE, ' marker-end="url(#' + id + ')"') + "</g>" +
    TRAITS + ' stroke-width="1.6">' + seg(O, pI, ' marker-end="url(#' + id + '-o)"') + "</g>" +
    ECRITS + texte(250, 272, "1") + texte(408, 86, "2") + texte(342, 178, "3") + texte(142, 352, "4") +
    texte(20, 382, "alternateur, convention générateur, V horizontale") + "</g>"
  );
}

const ZONES_FRESNEL = [
  { x: 140, y: 230, largeur: 110, hauteur: 34, etiquette: "1" },
  { x: 380, y: 66, largeur: 50, hauteur: 40, etiquette: "2" },
  { x: 300, y: 130, largeur: 70, hauteur: 70, etiquette: "3" },
  { x: 110, y: 290, largeur: 80, hauteur: 70, etiquette: "4" },
];

const VISUELS_QUIZ = [
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["8 pôles : p = 4", "n = 60 × 50 / 4", "n = 750 tr/min, exactement"], 540), legende: "Vitesse d'un moteur synchrone à huit pôles." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["surexcité : E cos δ > V", "Q = 3 V (E cos δ - V) / X_s > 0", "l'alternateur fournit du réactif"], 540), legende: "Surexcitation et puissance réactive." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["2 pôles : p = 1", "f = p n / 60 = 3600 / 60", "f = 60 Hz"], 540), legende: "Fréquence d'un alternateur bipolaire." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["asynchrone : couple porté par le glissement g", "synchrone : couple porté par l'angle interne δ", "C = C_max sin δ"], 540), legende: "L'angle interne remplace le glissement." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["P = 3 V E sin δ / X_s", "= 3 × 230 × 300 × 0,5 / 2", "= 51 750 W = 51,75 kW"], 540), legende: "Puissance active à angle interne donné." },
  () => ({ viewBox: "0 0 540 390", dessin: dessinQuizFresnel(nouveauMarqueur("fl-l-fr-c")), legende: "Le segment 3 part de l'extrémité de V et ferme le triangle : c'est j X_s I." }),
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["réseau infini : P fixée par l'arbre", "I_f augmente : E augmente, δ diminue", "Q fournie augmente"], 540), legende: "L'excitation règle le réactif." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["δ > 90° : dP / dδ < 0", "une avance réduit P électrique", "le rotor s'emballe : instable"], 540), legende: "Au-delà de 90 degrés, pas de couple de rappel." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["f = f0 - s f_n P / P_n", "= 52 - 0,04 × 50 × 48,88 / 80", "= 50,78 Hz"], 540), legende: "Fréquence d'un groupe en statisme." },
  { viewBox: "0 0 540 " + hauteurEtapes(4), dessin: dessinEtapes(["même ordre des phases", "même tension efficace", "même fréquence", "phases en coïncidence"], 540), legende: "Les quatre conditions du couplage." },
];

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Un moteur synchrone à huit pôles est alimenté par le réseau à $50\\ \\mathrm{Hz}$. À pleine charge, il tourne à :</p>",
        options: ["$750\\ \\mathrm{tr/min}$ exactement", "environ $735\\ \\mathrm{tr/min}$", "$1500\\ \\mathrm{tr/min}$", "une vitesse qui dépend de son excitation"],
        bonnes: [0],
        explication: "$n = 60f/p = 60 \\times 50/4 = 750\\ \\mathrm{tr/min}$, sans glissement, quelle que soit la charge tant qu'il reste accroché.",
        resume: "Vitesse d'un moteur synchrone",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Un alternateur surexcité couplé à un réseau puissant fournit de la puissance réactive à ce réseau.</p>",
        reponse: true,
        explication: "Surexcité, $E\\cos\\delta > V$, donc $Q = 3V(E\\cos\\delta - V)/X_s > 0$ en convention générateur : il se comporte comme un condensateur vu du réseau.",
        resume: "Surexcitation",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Un turboalternateur à deux pôles tourne à $3600\\ \\mathrm{tr/min}$. Quelle est sa fréquence, en hertz ?</p>",
        valeur: 60,
        unite: "Hz",
        tolerance: 0.001,
        explication: "$f = pn/60 = 1 \\times 3600/60 = 60\\ \\mathrm{Hz}$ : c'est la vitesse d'un réseau à $60\\ \\mathrm{Hz}$.",
        resume: "Fréquence d'un turboalternateur",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Quelle grandeur joue, dans une machine synchrone, le rôle que joue le glissement dans une machine asynchrone ?</p>",
        motsCles: [["angle"], ["interne", "charge", "delta", "decalage", "polaire"]],
        minimum: 2,
        explication: "L'angle interne, ou angle de charge, $\\delta$ : le décalage électrique entre la force électromotrice et la tension, image du décalage entre les pôles du rotor et le champ du stator. Le couple vaut $C_{max}\\sin\\delta$.",
        resume: "Grandeur analogue au glissement",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Une machine couplée à un réseau de tension simple $230\\ \\mathrm{V}$ a $E = 300\\ \\mathrm{V}$, $X_s = 2\\ \\mathrm{\\Omega}$ et $\\delta = 30^\\circ$. Quelle puissance active échange-t-elle, en kilowatts ?</p>",
        valeur: 51.75,
        unite: "kW",
        tolerance: 0.01,
        explication: "$P = 3VE\\sin\\delta/X_s = 3 \\times 230 \\times 300 \\times 0{,}5/2 = 51\\,750\\ \\mathrm{W}$.",
        resume: "Puissance en fonction de l'angle",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Sur ce diagramme de Fresnel d'alternateur, quel segment représente la chute de tension dans la réactance synchrone ?</p>",
        consigne: "Cliquez sur le segment correspondant.",
        viewBox: "0 0 540 390",
        dessin: dessinQuizFresnel(nouveauMarqueur("fl-l-fr")),
        zones: ZONES_FRESNEL.map((z) => ({ ...z, juste: z.etiquette === "3" })),
        explication: "Le segment 3, en tirets, part de l'extrémité de $V$, segment 1, et rejoint celle de $E$, segment 2 : $\\underline{E} = \\underline{V} + jX_s\\underline{I}$. Il est perpendiculaire au courant, segment 4.",
        resume: "Lecture d'un diagramme de Fresnel",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Un alternateur couplé à un réseau puissant fournit $200\\ \\mathrm{kW}$. On augmente son courant d'excitation sans toucher à la turbine. Que se passe-t-il en régime établi ?</p>",
        options: [
          { texte: "La puissance active reste la même.", juste: true },
          { texte: "La puissance réactive fournie augmente.", juste: true },
          { texte: "L'angle interne diminue.", juste: true },
          { texte: "La vitesse augmente." },
        ],
        multiple: true,
        explication: "La puissance active vient de l'arbre ; $E$ augmente, $E\\sin\\delta$ reste constant donc $\\delta$ diminue, et $E\\cos\\delta - V$ augmente, donc $Q$. La vitesse est imposée par le réseau.",
        resume: "Effet de l'excitation sur réseau infini",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Un alternateur couplé peut fonctionner de façon stable avec un angle interne de $110^\\circ$, à condition que sa turbine soit bien régulée.</p>",
        reponse: false,
        explication: "Au-delà de $90^\\circ$, $\\mathrm{d}P/\\mathrm{d}\\delta < 0$ : une petite avance réduit la puissance renvoyée au réseau, le rotor accélère encore et décroche, quel que soit le régulateur de la turbine, trop lent pour ce phénomène.",
        resume: "Stabilité au-delà de 90 degrés",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Le régulateur du groupe du site est réglé en statisme de $4\\ \\%$, à $52\\ \\mathrm{Hz}$ à vide, pour $80\\ \\mathrm{kW}$ nominaux. Quelle fréquence obtient-on sous $48{,}88\\ \\mathrm{kW}$, en hertz ?</p>",
        valeur: 52 - (0.04 * 50 * 48.88) / 80,
        unite: "Hz",
        tolerance: 0.001,
        explication: "$f = 52 - 0{,}04 \\times 50 \\times 48{,}88/80 = 52 - 1{,}222 = 50{,}78\\ \\mathrm{Hz}$ : en îlotage, il faut un régulateur isochrone ou recaler la consigne.",
        resume: "Fréquence en statisme",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Avant de fermer le disjoncteur qui couple un alternateur au réseau, quelles conditions faut-il réunir ?</p>",
        options: [
          { texte: "Même ordre de succession des phases.", juste: true },
          { texte: "Même valeur efficace de tension, à quelques pour cent près.", juste: true },
          { texte: "Même fréquence, à quelques dixièmes de hertz près.", juste: true },
          { texte: "Tensions en phase, à une dizaine de degrés près.", juste: true },
          { texte: "Même facteur de puissance que le réseau." },
        ],
        multiple: true,
        explication: "Le facteur de puissance n'existe qu'après le couplage, quand un courant circule ; il se règle ensuite par l'excitation. Les quatre autres conditions annulent la tension aux bornes du disjoncteur.",
        resume: "Conditions de couplage",
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
      { categorie: "Vitesse", question: "À quelle vitesse tourne une machine synchrone ?", reponse: "Exactement $n = 60f/p$, sans glissement ; un angle électrique vaut $p$ fois l'angle mécanique." },
      { categorie: "Structure", question: "Que porte le rotor d'une machine synchrone ?", reponse: "$2p$ pôles aimantés par le courant continu $I_f$, amené par bagues ou excitatrice sans balais, ou par des aimants permanents." },
      { categorie: "Couple", question: "D'où vient le couple, et quand la machine décroche-t-elle ?", reponse: "De l'angle interne $\\delta$ entre pôles du rotor et champ du stator : $C = C_{max}\\sin\\delta$ ; décrochage au-delà de $90^\\circ$." },
      { categorie: "Modèle", question: "Quel est le modèle de Behn-Eschenburg ?", reponse: "Par phase, une force électromotrice $E(I_f)$ en série avec la réactance synchrone $X_s$ : $\\underline{E} = \\underline{V} + jX_s\\underline{I}$ en alternateur." },
      { categorie: "Mesure", question: "Comment mesure-t-on la réactance synchrone ?", reponse: "Essais à vide et en court-circuit à la même excitation : $X_s = E_0(I_f)/I_{cc}(I_f)$, valeur saturée prise à la tension nominale.", rappel: "Ordre de grandeur : $x_s$ de $1$ à $2{,}5$ pour les machines rapides." },
      { categorie: "Puissances", question: "Que valent $P$ et $Q$ en fonction de $\\delta$ ?", reponse: "$P = 3VE\\sin\\delta/X_s$ et $Q = 3V(E\\cos\\delta - V)/X_s$, fournies en convention générateur." },
      { categorie: "Réglages", question: "Sur un réseau puissant, qui règle $P$ et qui règle $Q$ ?", reponse: "La puissance mécanique de l'arbre règle $P$, donc $\\delta$ ; l'excitation règle $Q$. Surexcitée, la machine fournit du réactif." },
      { categorie: "Îlotage", question: "Que règlent les deux régulateurs d'un groupe en îlotage ?", reponse: "Le régulateur de vitesse tient la fréquence, le régulateur de tension tient $V$ par $I_f$ ; $P$ et $Q$ sont imposées par la charge." },
      { categorie: "Moteur", question: "Que montrent les courbes en V ?", reponse: "À $P$ constante, $I$ en fonction de $I_f$ : minimum $P/(3V)$ à $\\cos\\varphi = 1$, sous-excité à gauche, surexcité et fournisseur de réactif à droite." },
      { categorie: "Couplage", question: "Quelles sont les conditions de couplage d'un alternateur ?", reponse: "Même ordre des phases, même tension, même fréquence, phases en coïncidence ; sinon courant limité par $X'_d$ et à-coup de couple." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["6 pôles : p = 3", "n = 60 × 60 / 3", "n = 1200 tr/min"], 540), legende: "Vitesse à 60 Hz." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["P vient de l'arbre", "I_f agit sur E, donc sur Q et δ", "P inchangée"], 540), legende: "L'excitation ne fournit pas de puissance active." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["P_max = 3 V E / X_s", "= 3 × 230,94 × 400 / 2", "= 138,6 kW"], 540), legende: "Limite de stabilité statique." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["Δn = 25 tr/min au couple nominal", "n_s = 1000 + 25 = 1025 tr/min", "f = 2 × 1025 / 60 = 34,17 Hz"], 540), legende: "Fréquence pour une consigne de vitesse." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["f > f_b : tension plafonnée", "flux en f_b / f", "C_max en (f_b / f)²"], 540), legende: "Couple maximal en défluxage." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["rapport du TP : 400 / 100 = 4", "ΔV primaire = 4 × 5 V", "= 20 V entre phases"], 540), legende: "Lecture d'une tension à travers un TP." },
  { viewBox: "0 0 540 " + hauteurEtapes(3), dessin: dessinEtapes(["τ = L / R", "= 0,9 / 1,5", "= 0,6 s ; 95 % atteints après 3 τ = 1,8 s"], 540), legende: "Constante de temps de l'inducteur." },
];

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Un moteur synchrone à six pôles est alimenté par un réseau à $60\\ \\mathrm{Hz}$. À quelle vitesse tourne-t-il, en tours par minute ?</p>",
        valeur: 1200,
        unite: "tr/min",
        tolerance: 0.001,
        explication: "$n = 60f/p = 60 \\times 60/3 = 1200\\ \\mathrm{tr/min}$.",
        resume: "Vitesse de synchronisme",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Augmenter le courant d'excitation d'un alternateur couplé à un réseau puissant augmente la puissance active qu'il fournit.</p>",
        reponse: false,
        explication: "La puissance active est fixée par la puissance mécanique de l'arbre ; l'excitation modifie $E$, donc $Q$ et $\\delta$, mais pas $P$ en régime établi.",
        resume: "Excitation et puissance active",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Cette séance. Une machine a $E = 400\\ \\mathrm{V}$ par phase et $X_s = 2\\ \\mathrm{\\Omega}$, sur un réseau de tension simple $230{,}94\\ \\mathrm{V}$. Quelle est sa puissance maximale, en kilowatts ?</p>",
        valeur: (3 * 230.94 * 400) / 2 / 1000,
        unite: "kW",
        tolerance: 0.01,
        explication: "$P_{max} = 3VE/X_s = 3 \\times 230{,}94 \\times 400/2 = 138{,}6\\ \\mathrm{kW}$, à $\\delta = 90^\\circ$.",
        resume: "Puissance maximale",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Variation de vitesse des moteurs asynchrones. Un moteur à quatre pôles a un écart nominal de $25\\ \\mathrm{tr/min}$. Quelle fréquence faut-il, à flux nominal, pour qu'il tourne à $1000\\ \\mathrm{tr/min}$ sous son couple nominal, en hertz ?</p>",
        valeur: (2 * 1025) / 60,
        unite: "Hz",
        tolerance: 0.01,
        explication: "L'écart reste $25\\ \\mathrm{tr/min}$ : $n_s = 1025\\ \\mathrm{tr/min}$, $f = 2 \\times 1025/60 = 34{,}17\\ \\mathrm{Hz}$. Un moteur synchrone n'aurait aucun écart : $33{,}33\\ \\mathrm{Hz}$.",
        resume: "Fréquence pour une consigne",
      },
      {
        type: "vraiFaux",
        enonce: repere(4) + "<p>Cours Variation de vitesse des moteurs asynchrones. Au-delà de la fréquence de base, tension plafonnée, le couple maximal d'un moteur asynchrone décroît à peu près comme le carré de l'inverse de la fréquence.</p>",
        reponse: true,
        explication: "Le flux décroît comme $f_b/f$, et le couple maximal comme le carré du flux : $C_{max} \\approx C_{max,b}(f_b/f)^2$.",
        resume: "Couple maximal en défluxage",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Autotransformateurs, TC et TP. Le synchroniseur du groupe reçoit les tensions composées des deux côtés du disjoncteur par deux TP de rapport $400/100\\ \\mathrm{V}$. Il mesure $5\\ \\mathrm{V}$ entre les deux secondaires homologues. Quelle tension règne entre les deux côtés du disjoncteur, en volts ?</p>",
        valeur: 20,
        unite: "V",
        tolerance: 0.001,
        explication: "Les deux TP ont le même rapport $4$ : la différence des secondaires est l'image de celle des primaires, $4 \\times 5 = 20\\ \\mathrm{V}$, aux erreurs de rapport et de phase des TP près.",
        resume: "Mesure à travers un TP",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Régime transitoire RL. L'inducteur d'un alternateur a une résistance de $1{,}5\\ \\mathrm{\\Omega}$ et une inductance de $0{,}9\\ \\mathrm{H}$. Quelle est la constante de temps de son courant après un échelon de tension d'excitation, en secondes ?</p>",
        valeur: 0.6,
        unite: "s",
        tolerance: 0.001,
        explication: "$\\tau = L/R = 0{,}9/1{,}5 = 0{,}6\\ \\mathrm{s}$ : le courant d'excitation atteint $95\\ \\%$ de sa valeur finale après $1{,}8\\ \\mathrm{s}$. C'est pourquoi les régulateurs de tension appliquent une surtension d'excitation transitoire pour réagir plus vite.",
        resume: "Constante de temps de l'inducteur",
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
    titre: "Où en suis-je sur la machine synchrone ?",
  });
  if (auto) ressources.push(auto);
}
