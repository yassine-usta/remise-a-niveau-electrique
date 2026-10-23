/* ==========================================================================
   cours/transformateurs-triphases/cours.js
   Transformateurs triphasés : origine des trente degrés, zigzag et décalage
   réglable, indice horaire de tous les couplages, charge monophasée et flux
   homopolaire, mise en parallèle de deux transformateurs, essai de groupe et
   choix du second transformateur du poste du site.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];
let compteurMarqueurs = 0;

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const RAC3 = Math.sqrt(3);

/* Exemple de la section H : T1 fixé, T2 réglable, jeu de barres 410 V. */
const EX = { U2: 410, Sn1: 400e3, ucc1: 0.04, Pcc1: 4600, Sn2: 630e3, ucc2: 0.06, Pcc2: 6500, cos: 0.85 };
EX.V = EX.U2 / RAC3;

/* Transformateur du poste du site, Dyn11, 100 kVA, 20 kV / 410 V. */
const POSTE = { n: 410 / RAC3 / 20000, nYy: 410 / 20000, nYz: (410 / 20000) * (2 / RAC3), I2n: 100e3 / (RAC3 * 410) };

/* --------------------------------------------------------------------------
   Nombres complexes
   -------------------------------------------------------------------------- */

const C = {
  n: (re, im = 0) => ({ re, im }),
  pol: (module, argument) => ({ re: module * Math.cos(argument), im: module * Math.sin(argument) }),
  add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
  mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  div: (a, b) => {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  },
  k: (a, k) => ({ re: a.re * k, im: a.im * k }),
  abs: (a) => Math.hypot(a.re, a.im),
  arg: (a) => Math.atan2(a.im, a.re),
};

/** Impédance de court-circuit par phase côté 410 V, en ohms. */
function zcc(Sn, ucc, Pcc) {
  const Zb = (EX.U2 * EX.U2) / Sn;
  const ur = Pcc / Sn;
  const ux = Math.sqrt(Math.max(0, ucc * ucc - ur * ur));
  return C.n(ur * Zb, ux * Zb);
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

/** Point d'un phaseur d'angle mathématique a (degrés) et de longueur l, depuis o. */
function pt(o, a, l) {
  return { x: o.x + l * Math.cos(a * DEG), y: o.y - l * Math.sin(a * DEG) };
}

function fleche(o, p) {
  return segment(o.x, o.y, p.x, p.y);
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';

/** Cadran d'horloge : phaseur haute tension sur 12, phaseur basse tension sur h. */
function dessinHorloge(h, options = {}) {
  const id = nouveauMarqueur("fl-hor");
  const o = { x: options.cx || 100, y: options.cy || 100 };
  const r = options.r || 78;
  let traits = "";
  for (let k = 0; k < 12; k += 1) {
    const a = 90 - 30 * k;
    const p0 = pt(o, a, r);
    const p1 = pt(o, a, r - 9);
    traits += segment(p0.x, p0.y, p1.x, p1.y);
  }
  let chiffres = "";
  for (const k of [12, 3, 6, 9].concat(options.chiffres || [h === 0 ? 12 : h])) {
    const p = pt(o, 90 - 30 * (k % 12), r + 13);
    chiffres += texte(p.x - (k >= 10 ? 7 : 4), p.y + 4, String(k));
  }
  const pA = pt(o, 90, r - 14);
  const pa = pt(o, 90 - 30 * h, r - 30);
  const marques = (options.marques || [])
    .map((k) => {
      const p = pt(o, 90 - 30 * k, r - 22);
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/>';
    })
    .join("");
  return (
    "<defs>" + marqueur(id) + "</defs>" +
    TRAITS + ' stroke-width="1.5"><circle cx="' + o.x + '" cy="' + o.y + '" r="' + r + '"/><path d="' + traits + '"/></g>' +
    TRAITS + '><path d="' + fleche(o, pA) + '" stroke-width="3" marker-end="url(#' + id + ')"/>' +
    '<path d="' + fleche(o, pa) + '" stroke-width="3" stroke-dasharray="7 4" marker-end="url(#' + id + ')"/>' + marques + "</g>" +
    ECRITS + chiffres + texte(pA.x + 6, pA.y + 14, options.nomA || "A") + texte(pa.x + (h > 6 ? -18 : 6), pa.y + (h > 3 && h < 9 ? -6 : 14), options.nomA2 || "a") +
    (options.lignes || []).map((ligne, i) => texte(options.xTexte || 210, 40 + i * 20, ligne)).join("") +
    "</g>"
  );
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

function barresCorrection(moteur, conteneur, options, barres) {
  const spectre = moteur.sim.spectre(conteneur, {
    genre: "Correction visuelle",
    ratio: 0.4,
    ...options,
  });
  if (spectre) {
    spectre.definirBarres(barres);
    ressources.push(spectre);
  }
  return spectre;
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

/* --------------------------------------------------------------------------
   Petits dessins réutilisés par les corrections
   -------------------------------------------------------------------------- */

/** Triangle haute tension avec courants d'enroulement et de ligne. */
function dessinTriangleCourants(J, I, options = {}) {
  const id = nouveauMarqueur("fl-tri");
  return (
    "<defs>" + marqueur(id) + "</defs>" +
    TRAITS + ' stroke-width="2"><path d="M120 40L200 178L40 178Z"/><path d="M120 40V14M200 178l22 12M40 178l-22 12"/></g>' +
    TRAITS + ' stroke-width="1.6"><path d="M108 12V34" marker-end="url(#' + id + ')"/>' +
    '<path d="M138 62L178 132" marker-end="url(#' + id + ')"/><path d="M62 132L102 62" marker-end="url(#' + id + ')"/>' +
    (options.seulCol1 ? "" : '<path d="M170 192H70" marker-end="url(#' + id + ')"/>') +
    "</g>" +
    ECRITS + texte(90, 18, "I") + texte(166, 88, "J_AB") + texte(40, 88, "J_CA") + texte(126, 34, "A") + texte(208, 176, "B") + texte(22, 176, "C") +
    (options.seulCol1 ? "" : texte(108, 208, "J_BC")) +
    texte(250, 40, options.l1 || "I_A = J_AB - J_CA") +
    texte(250, 62, options.l2 || "équilibré : I = √3 J") +
    texte(250, 92, options.l3 || "I = " + I) +
    texte(250, 114, options.l4 || "J = I / √3 = " + J) +
    (options.l5 ? texte(250, 144, options.l5) : "") +
    (options.l6 ? texte(250, 166, options.l6) : "") +
    "</g>"
  );
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
  construireAnimTrente(racine, api);
  construireAnimZigzag(racine, api);
  construireSimHorloge(racine, api);
  construireAnimHomopolaire(racine, api);
  construireSimParallele(racine, api);
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
    ["#d-noyau-figure svg", 1.6],
    ["#e-couplages-figure svg", 1.8],
    ["#e-horloge-figure svg", 1.5],
    ["#e-parallele-figure svg", 1.6],
    ["#f-schema-principal svg", 2],
    ["#h-donnees-figure svg", 1.4],
    ["#i-poste-figure svg", 1.6],
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
      id: "c-simple",
      titre: "Tension simple d'un réseau de 410 V",
      niveau: "prérequis",
      enonce: "<p>Un jeu de barres basse tension présente $410\\ \\mathrm{V}$ entre phases. Quelle est la tension entre une phase et le neutre ?</p>",
      valeur: 410 / RAC3,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension simple $V$",
      etapes: [
        { texte: "En système équilibré, $U = \\sqrt{3}\\,V$ : la tension composée est la base d'un triangle isocèle dont les côtés égaux sont deux tensions simples à $120^\\circ$." },
        { texte: "$V = 410/\\sqrt{3} = 236{,}7\\ \\mathrm{V}$." },
        { texte: "C'est la tension que porte chaque enroulement basse tension en étoile du transformateur du poste.", note: "Un enroulement en triangle porterait les $410\\ \\mathrm{V}$ complets." },
      ],
      visuelCorrection(conteneur, moteur) {
        const id = nouveauMarqueur("fl-c-s");
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 460 230",
          "<defs>" + marqueur(id) + "</defs>" +
            TRAITS + ' stroke-width="2.4"><path d="M120 150V52" marker-end="url(#' + id + ')"/><path d="M120 150L204.9 199" stroke-dasharray="7 4" marker-end="url(#' + id + ')"/></g>' +
            TRAITS + ' stroke-width="1.6"><path d="M206.6 200L121.5 52.6" marker-end="url(#' + id + ')"/><path d="M120 120A30 30 0 0 1 146 165"/></g>' +
            ECRITS + texte(70, 46, "V_A = 236,7 V") + texte(212, 212, "V_B") + texte(170, 110, "U_AB = 410 V") + texte(150, 150, "120°") +
            texte(270, 40, "U = 2 V cos 30°") + texte(270, 62, "  = √3 V") + texte(270, 92, "V = 410 / √3") + texte(270, 114, "  = 236,7 V") + "</g>",
          "Diagramme : tension simple V_A verticale en trait plein, V_B en tirets à 120 degrés, tension composée U_AB en trait fin de l'extrémité de V_B à celle de V_A ; le triangle donne U = √3 V."
        );
      },
    })
  );

  ressources.push(
    api.exercice.qcm("#c-minitest", {
      id: "c-trente",
      titre: "Position de la tension composée",
      niveau: "prérequis",
      enonce: "<p>Dans un système direct, comment la tension composée $\\underline{U}_{AB} = \\underline{V}_A - \\underline{V}_B$ se situe-t-elle par rapport à $\\underline{V}_A$ ?</p>",
      options: [
        { texte: "En avance de $30^\\circ$, et $\\sqrt{3}$ fois plus grande.", juste: true },
        { texte: "En retard de $30^\\circ$, et $\\sqrt{3}$ fois plus grande." },
        { texte: "En phase, et deux fois plus grande." },
        { texte: "En avance de $120^\\circ$, de même module." },
      ],
      etapes: [
        { texte: "$\\underline{V}_B = \\underline{V}_A e^{-j120^\\circ}$, donc $\\underline{U}_{AB} = \\underline{V}_A(1 - e^{-j120^\\circ})$." },
        { texte: "$1 - e^{-j120^\\circ} = 1 + 0{,}5 + j0{,}866 = 1{,}5 + j0{,}866 = \\sqrt{3}\\,e^{j30^\\circ}$." },
        { texte: "La tension composée est donc en avance de $30^\\circ$ : c'est l'origine du décalage introduit par un enroulement en triangle.", note: "$\\underline{U}_{AC} = \\underline{V}_A - \\underline{V}_C$ serait au contraire en retard de $30^\\circ$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const id = nouveauMarqueur("fl-c-t");
        const o = { x: 140, y: 130 };
        const A = pt(o, 90, 90);
        const B = pt(o, -30, 90);
        const U = { x: o.x + (A.x - B.x) * 0.95, y: o.y + (A.y - B.y) * 0.95 };
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 460 240",
          "<defs>" + marqueur(id) + "</defs>" +
            TRAITS + ' stroke-width="2"><path d="' + fleche(o, A) + '" marker-end="url(#' + id + ')"/><path d="' + fleche(o, B) + '" stroke-dasharray="6 4" marker-end="url(#' + id + ')"/></g>' +
            TRAITS + ' stroke-width="3"><path d="' + fleche(o, U) + '" marker-end="url(#' + id + ')"/></g>' +
            TRAITS + ' stroke-width="1.4"><path d="M140 80A50 50 0 0 0 115 86.7"/></g>' +
            ECRITS + texte(A.x + 6, A.y + 4, "V_A") + texte(B.x + 4, B.y + 14, "V_B") + texte(U.x - 50, U.y - 6, "U_AB") + texte(104, 74, "30°") +
            texte(270, 50, "U_AB = V_A - V_B") + texte(270, 72, "module : √3 V") + texte(270, 94, "avance : 30°") + texte(270, 130, "tracée depuis l'origine") + "</g>",
          "Diagramme : V_A verticale en trait plein, V_B en tirets à moins 120 degrés, U_AB en trait épais reportée depuis l'origine : elle est en avance de 30 degrés sur V_A."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-triangle",
      titre: "Courant dans une branche de triangle",
      niveau: "prérequis",
      enonce: "<p>Une charge équilibrée couplée en triangle absorbe $2{,}887\\ \\mathrm{A}$ par ligne. Quel courant traverse chacune de ses branches ?</p>",
      valeur: 2.887 / RAC3,
      unite: "A",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Courant de branche $J$",
      etapes: [
        { texte: "Loi des nœuds en A : $\\underline{I}_A = \\underline{J}_{AB} - \\underline{J}_{CA}$, différence de deux courants décalés de $120^\\circ$." },
        { texte: "En régime équilibré, $I = \\sqrt{3}\\,J$, donc $J = 2{,}887/\\sqrt{3} = 1{,}667\\ \\mathrm{A}$." },
        { texte: "C'est le courant assigné de chaque enroulement haute tension du transformateur du poste.", note: "Les pertes Joule se calculent avec $J$ et la résistance d'un enroulement, ou avec $I$ et la résistance de l'étoile équivalente : même résultat." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(moteur, conteneur, "0 0 480 220", dessinTriangleCourants("1,667 A", "2,887 A"), "Triangle : courant de ligne I entrant en A, courants de branche J dans chaque côté ; la loi des nœuds donne I = √3 J en régime équilibré.");
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : d'où viennent les trente degrés
   -------------------------------------------------------------------------- */

function construireAnimTrente(racine, api) {
  const conteneur = racine.querySelector("#d-anim");
  if (!conteneur) return;

  const O = { x: 180, y: 190 };
  const R = 125;
  const T0 = 400;
  const T1 = 690;
  const Y0 = 190;
  const A = 115;
  const versT = (deg) => T0 + ((T1 - T0) * deg) / 360;
  let theta = 20;

  const svg = svgEl("svg", {
    viewBox: "0 0 720 380",
    role: "img",
    "aria-label": "Phaseurs tournants des tensions simples haute tension, de la tension composée U_AB et de la tension simple basse tension V_a, avec les formes d'onde de v_A et v_a sur une période",
  });
  const idm = nouveauMarqueur("fl-d-an");
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(idm);
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.55 });
  let axes = "M" + (O.x - R - 20) + " " + O.y + "H" + (O.x + R + 20) + "M" + O.x + " " + (O.y - R - 20) + "V" + (O.y + R + 20);
  axes += "M" + T0 + " " + Y0 + "H" + (T1 + 8) + "M" + T0 + " " + (Y0 - A - 10) + "V" + (Y0 + A + 10);
  for (const d of [90, 180, 270, 360]) axes += "M" + versT(d) + " " + (Y0 - 4) + "v8";
  fond.innerHTML = '<path d="' + axes + '"/><circle cx="' + O.x + '" cy="' + O.y + '" r="' + R + '" stroke-dasharray="3 5"/>';

  const courbes = svgEl("g", { fill: "none", stroke: "currentColor" });
  const pA = [];
  const pa = [];
  for (let k = 0; k <= 180; k += 1) {
    const deg = k * 2;
    pA.push(versT(deg).toFixed(1) + " " + (Y0 - A * Math.cos(deg * DEG)).toFixed(1));
    pa.push(versT(deg).toFixed(1) + " " + (Y0 - A * Math.cos((deg + 30) * DEG)).toFixed(1));
  }
  courbes.innerHTML =
    '<path d="M' + pA.join(" L") + '" stroke-width="1.6"/>' +
    '<path d="M' + pa.join(" L") + '" stroke-width="3" stroke-dasharray="8 5"/>';

  const simples = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.6, "marker-end": "url(#" + idm + ")" });
  const vB = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.6, "marker-end": "url(#" + idm + ")" });
  const vC = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.6, "marker-end": "url(#" + idm + ")" });
  const uAB = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3.4, "marker-end": "url(#" + idm + ")" });
  const va = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3.4, "stroke-dasharray": "8 5", "marker-end": "url(#" + idm + ")" });
  const projections = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.2, "stroke-dasharray": "2 4" });
  const curseurT = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.2 });
  const points = svgEl("g", { fill: "currentColor", stroke: "none" });
  const fixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  fixes.innerHTML =
    texte(T0, 40, "v_A : trait fin ; v_a : tirets épais") +
    texte(T0, 58, "valeurs rapportées à leur crête") +
    texte(versT(180) - 14, Y0 + 18, "180°") +
    texte(versT(360) - 16, Y0 + 18, "360°") +
    texte(T0, Y0 + A + 34, "ωt : instant de la période") +
    texte(20, 368, "poignée : extrémité de V_A ; V_a ramenée à l'échelle de V_A");
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, courbes, projections, simples, vB, vC, uAB, va, curseurT, points, fixes, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-anim-valeurs", [
    { id: "angle", libelle: "ωt", unite: "°", decimales: 0 },
    { id: "temps", libelle: "Instant à 50 Hz", unite: "ms", decimales: 2 },
    { id: "vA", libelle: "v_A / V crête", decimales: 3 },
    { id: "uAB", libelle: "u_AB / U crête", decimales: 3 },
    { id: "va", libelle: "v_a / v crête", decimales: 3 },
    { id: "avance", libelle: "Avance de v_a sur v_A", unite: "ms", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const a = 90 + theta;
    const tA = pt(O, a, R);
    const tB = pt(O, a - 120, R);
    const tC = pt(O, a + 120, R);
    const ta = pt(O, a + 30, R);
    simples.setAttribute("d", fleche(O, tA));
    vB.setAttribute("d", fleche(O, tB));
    vC.setAttribute("d", fleche(O, tC));
    uAB.setAttribute("d", fleche(tB, { x: tB.x + (tA.x - tB.x) * 0.97, y: tB.y + (tA.y - tB.y) * 0.97 }));
    va.setAttribute("d", fleche(O, ta));
    projections.setAttribute("d", segment(tA.x, tA.y, O.x, tA.y) + segment(ta.x, ta.y, O.x, ta.y));
    const xt = versT(theta);
    curseurT.setAttribute("d", "M" + xt.toFixed(1) + " " + (Y0 - A - 6) + "V" + (Y0 + A + 6));
    const yA = Y0 - A * Math.cos(theta * DEG);
    const ya = Y0 - A * Math.cos((theta + 30) * DEG);
    points.innerHTML =
      '<circle cx="' + xt.toFixed(1) + '" cy="' + yA.toFixed(1) + '" r="4"/>' +
      '<rect x="' + (xt - 4).toFixed(1) + '" y="' + (ya - 4).toFixed(1) + '" width="8" height="8"/>';
    const etiquette = (p, nom, dx = 8, dy = -6) => texte(p.x + (p.x < O.x ? -dx - 26 : dx), p.y + dy, nom);
    const milieuU = { x: (tA.x + tB.x) / 2, y: (tA.y + tB.y) / 2 };
    libelles.innerHTML =
      etiquette(tA, "V_A") + etiquette(tB, "V_B") + etiquette(tC, "V_C") + etiquette(pt(O, a + 30, R * 0.62), "V_a", 10, 4) +
      texte(milieuU.x + (milieuU.x < O.x ? -46 : 8), milieuU.y + 4, "U_AB");
    if (valeurs) {
      valeurs.maj({
        angle: theta,
        temps: (theta / 360) * 20,
        vA: Math.cos(theta * DEG),
        uAB: Math.cos((theta + 30) * DEG),
        va: Math.cos((theta + 30) * DEG),
        avance: (30 / 360) * 20,
      });
    }
  }

  let synchro = false;
  let poignee = null;
  let lecteur = null;
  function appliquer(valeur, source) {
    if (synchro) return;
    synchro = true;
    theta = ((Number(valeur) % 360) + 360) % 360;
    dessiner();
    if (source !== "poignee" && poignee) poignee.set(90 + theta, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(theta);
    synchro = false;
  }

  poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: O,
    rayon: R,
    valeur: 90 + theta,
    pas: 1,
    libelle: "Extrémité du phaseur V_A",
    diffuserAuDepart: false,
    rappel: (mesure) => appliquer(mesure.angle - 90, "poignee"),
  });
  if (poignee) ressources.push(poignee);

  lecteur = api.sim.lecteur("#d-anim-lecteur", {
    de: 0,
    a: 360,
    duree: 8,
    boucle: true,
    auto: false,
    libelle: "Rotation des phaseurs sur une période",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);
  appliquer(theta, null);
}

/* --------------------------------------------------------------------------
   E. Animation : le zigzag et le décalage réglable
   -------------------------------------------------------------------------- */

function zigzag(k) {
  const re = k + 0.5 * (1 - k);
  const im = (RAC3 / 2) * (1 - k);
  return { f: Math.hypot(re, im), delta: Math.atan2(im, re) / DEG };
}

function construireAnimZigzag(racine, api) {
  const conteneur = racine.querySelector("#e-zigzag");
  if (!conteneur) return;

  const O = { x: 200, y: 200 };
  const L = 150;
  const regle = { de: { x: 60, y: 385 }, a: { x: 340, y: 385 } };
  const etat = { k: 0.5, wt: 0 };
  const B0 = 205;
  const colonnes = [480, 570, 660];

  const svg = svgEl("svg", {
    viewBox: "0 0 720 420",
    role: "img",
    "aria-label": "Composition du phaseur d'une phase en zigzag à partir de deux demi-enroulements pris sur deux colonnes, avec réglage de la proportion des spires et ampères-tours homopolaires résiduels",
  });
  const idm = nouveauMarqueur("fl-e-zz");
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(idm);
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.55 });
  let traits = "M" + regle.de.x + " " + regle.de.y + "H" + regle.a.x;
  for (let i = 0; i <= 4; i += 1) traits += "M" + (regle.de.x + (i * (regle.a.x - regle.de.x)) / 4) + " " + (regle.de.y - 6) + "v12";
  traits += "M" + (colonnes[0] - 40) + " " + B0 + "H" + (colonnes[2] + 40);
  fond.innerHTML = '<path d="' + traits + '"/><circle cx="' + O.x + '" cy="' + O.y + '" r="' + L + '" stroke-dasharray="3 5"/>';

  const reference = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.2, "stroke-dasharray": "2 4" });
  const part1 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "marker-end": "url(#" + idm + ")" });
  const part2 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "stroke-dasharray": "7 4", "marker-end": "url(#" + idm + ")" });
  const resultante = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3.6, "marker-end": "url(#" + idm + ")" });
  const arc = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.3 });
  const barres = svgEl("g", { fill: "currentColor", "fill-opacity": 0.3, stroke: "currentColor", "stroke-width": 1.4 });
  const fixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  fixes.innerHTML =
    texte(regle.de.x - 4, regle.de.y + 22, "0") +
    texte(regle.a.x - 4, regle.a.y + 22, "1") +
    texte(regle.de.x + (regle.a.x - regle.de.x) / 2 - 10, regle.de.y + 22, "0,5") +
    texte(regle.de.x, regle.de.y - 16, "k : part des spires sur la colonne 1") +
    texte(430, 40, "AT homopolaires résiduels") +
    texte(430, 58, "par colonne, rapportés à") +
    texte(430, 76, "ceux d'une phase complète") +
    texte(colonnes[0] - 22, 370, "col. 1") +
    texte(colonnes[1] - 22, 370, "col. 2") +
    texte(colonnes[2] - 22, 370, "col. 3") +
    texte(colonnes[0] - 40, B0 - 106, "+50 %") +
    texte(colonnes[0] - 40, B0 + 116, "-50 %");
  const echelle = svgEl("path", {
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1,
    "stroke-dasharray": "3 4",
    opacity: 0.6,
    d: "M" + (colonnes[0] - 40) + " " + (B0 - 100) + "H" + (colonnes[2] + 40) + "M" + (colonnes[0] - 40) + " " + (B0 + 100) + "H" + (colonnes[2] + 40),
  });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, echelle, reference, part1, part2, resultante, arc, barres, fixes, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-zigzag-valeurs", [
    { id: "k", libelle: "k, part sur la colonne 1", decimales: 3 },
    { id: "delta", libelle: "Décalage angulaire", unite: "°", decimales: 1 },
    { id: "f", libelle: "Facteur de tension", decimales: 3 },
    { id: "spires", libelle: "Spires en plus qu'en étoile", unite: "%", decimales: 1 },
    { id: "residu", libelle: "AT homopolaires résiduels", unite: "%", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const k = etat.k;
    const z = zigzag(k);
    const phi = 90 + etat.wt;
    const pRef = pt(O, phi, L);
    const p1 = pt(O, phi, k * L);
    const p2 = pt(p1, phi + 60, (1 - k) * L);
    const pR = pt(O, phi + z.delta, z.f * L);
    reference.setAttribute("d", fleche(O, pRef));
    part1.setAttribute("d", k > 0.02 ? fleche(O, p1) : "");
    part2.setAttribute("d", k < 0.98 ? fleche(p1, p2) : "");
    resultante.setAttribute("d", fleche(O, { x: O.x + (pR.x - O.x) * 0.985, y: O.y + (pR.y - O.y) * 0.985 }));
    const r = 46;
    const a0 = pt(O, phi, r);
    const a1 = pt(O, phi + z.delta, r);
    arc.setAttribute("d", z.delta > 1 ? "M" + a0.x.toFixed(1) + " " + a0.y.toFixed(1) + "A" + r + " " + r + " 0 0 0 " + a1.x.toFixed(1) + " " + a1.y.toFixed(1) : "");
    const residu = 2 * k - 1;
    let rects = "";
    for (const x of colonnes) {
      const h = residu * 200;
      rects += '<rect x="' + (x - 14) + '" y="' + (h >= 0 ? B0 - h : B0).toFixed(1) + '" width="28" height="' + Math.max(1, Math.abs(h)).toFixed(1) + '"/>';
    }
    barres.innerHTML = rects;
    const pm = pt(O, phi + z.delta / 2, r + 16);
    libelles.innerHTML =
      (k > 0.12 ? texte((O.x + p1.x) / 2 + 8, (O.y + p1.y) / 2, "k") : "") +
      (k < 0.88 ? texte((p1.x + p2.x) / 2 - 30, (p1.y + p2.y) / 2 - 6, "1 - k") : "") +
      texte(pR.x + (pR.x < O.x ? -64 : 8), pR.y - 8, "phase a") +
      (z.delta > 6 ? texte(pm.x - 4, pm.y + 4, "δ") : "") +
      texte(pRef.x + 6, pRef.y + 14, "col. 1");
    if (valeurs) {
      valeurs.maj({ k, delta: z.delta, f: z.f, spires: 100 * (1 / z.f - 1), residu: 100 * Math.abs(residu) });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: regle.de,
    a: regle.a,
    min: 0,
    max: 1,
    pas: 0.01,
    valeur: etat.k,
    libelle: "Part k des spires sur la colonne 1",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.k = Number(mesure.valeur);
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const lecteur = api.sim.lecteur("#e-zigzag-lecteur", {
    de: 0,
    a: 360,
    duree: 8,
    boucle: true,
    auto: false,
    libelle: "Rotation des phaseurs, ωt",
    rappel: (valeur) => {
      etat.wt = Number(valeur);
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : construire l'indice horaire
   -------------------------------------------------------------------------- */

const NOMS_HT = ["Y", "D"];
const NOMS_BT = ["y", "d", "z"];

/** Phaseurs unitaires : V_A vertical, système direct. */
function phaseursHT() {
  return [C.pol(1, 90 * DEG), C.pol(1, -30 * DEG), C.pol(1, 210 * DEG)];
}

function groupe(ht, bt, fermeture, polarite) {
  const V = phaseursHT();
  let w;
  if (ht === 0) w = V.slice();
  else if (bt === 0 && fermeture === 1) w = [C.sub(V[0], V[2]), C.sub(V[1], V[0]), C.sub(V[2], V[1])];
  else w = [C.sub(V[0], V[1]), C.sub(V[1], V[2]), C.sub(V[2], V[0])];
  const s = polarite === 1 ? -1 : 1;
  const ws = w.map((x) => C.k(x, s));
  let va;
  if (bt === 0) va = ws[0];
  else if (bt === 1) va = C.div(ws[0], C.pol(RAC3, (fermeture === 0 ? 30 : -30) * DEG));
  else va = C.k(C.sub(ws[0], fermeture === 0 ? ws[1] : ws[2]), 0.5);
  const retard = (C.arg(V[0]) - C.arg(va)) / DEG;
  const h = ((Math.round(retard / 30) % 12) + 12) % 12;
  return { V, w, va, h, f: C.abs(va), nom: NOMS_HT[ht] + NOMS_BT[bt] + (bt !== 1 ? "n" : "") + h };
}

function construireSimHorloge(racine, api) {
  const conteneur = racine.querySelector("#e-horloge-sim");
  if (!conteneur) return;
  const etat = { ht: 1, bt: 0, fermeture: 0, polarite: 0 };
  const OH = { x: 120, y: 160 };
  const OB = { x: 345, y: 160 };
  const OC = { x: 590, y: 160 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 320",
    role: "img",
    "aria-label": "Construction de l'indice horaire : figure des tensions haute tension, figure des tensions basse tension et cadran d'horloge",
  });
  const idm = nouveauMarqueur("fl-e-hs");
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(idm);
  const cadran = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.4 });
  let ticks = "";
  for (let k = 0; k < 12; k += 1) {
    const p0 = pt(OC, 90 - 30 * k, 100);
    const p1 = pt(OC, 90 - 30 * k, 90);
    ticks += segment(p0.x, p0.y, p1.x, p1.y);
  }
  cadran.innerHTML = '<circle cx="' + OC.x + '" cy="' + OC.y + '" r="100"/><path d="' + ticks + '"/>';
  const chiffres = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11, opacity: 0.8 });
  let c = "";
  for (let k = 1; k <= 12; k += 1) {
    const p = pt(OC, 90 - 30 * (k % 12), 78);
    c += texte(p.x - (k >= 10 ? 7 : 3.5), p.y + 4, String(k));
  }
  chiffres.innerHTML = c + texte(40, 22, "haute tension") + texte(285, 22, "basse tension") + texte(545, 22, "cadran");
  const figHT = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round" });
  const figBT = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round" });
  const aiguilles = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, cadran, chiffres, figHT, figBT, aiguilles, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-horloge-valeurs", [
    { id: "nom", libelle: "Désignation", format: (v) => v },
    { id: "h", libelle: "Indice horaire", decimales: 0 },
    { id: "dephasage", libelle: "Position de V_a", format: (v) => v },
    { id: "f", libelle: "U2 / U1 rapporté à N2 / N1", decimales: 3 },
    { id: "famille", libelle: "Famille d'indices", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const versP = (o, z, l) => ({ x: o.x + z.re * l, y: o.y - z.im * l });

  function dessiner() {
    const g = groupe(etat.ht, etat.bt, etat.fermeture, etat.polarite);
    const rH = 72;
    const tips = g.V.map((v) => versP(OH, v, rH));
    let ht = "";
    let ecrits = "";
    if (etat.ht === 0) {
      ht += '<path d="' + tips.map((p) => fleche(OH, p)).join("") + '" stroke-width="1.6"/>';
    } else {
      ht += '<path d="M' + tips[0].x.toFixed(1) + " " + tips[0].y.toFixed(1) + "L" + tips[1].x.toFixed(1) + " " + tips[1].y.toFixed(1) + "L" + tips[2].x.toFixed(1) + " " + tips[2].y.toFixed(1) + 'Z" stroke-width="1.6"/>';
      ht += '<path d="' + fleche(OH, tips[0]) + '" stroke-width="1" stroke-dasharray="3 4"/>';
      const ordre = etat.bt === 0 && etat.fermeture === 1 ? [[0, 2], [1, 0], [2, 1]] : [[0, 1], [1, 2], [2, 0]];
      ordre.forEach(([i, j], col) => {
        const m = { x: (tips[i].x + tips[j].x) / 2, y: (tips[i].y + tips[j].y) / 2 };
        const dx = m.x - OH.x;
        const dy = m.y - OH.y;
        const n = Math.hypot(dx, dy) || 1;
        ecrits += texte(m.x + (dx / n) * 12 - 4, m.y + (dy / n) * 12 + 4, String(col + 1));
      });
      const w1 = g.w[0];
      const depart = etat.bt === 0 && etat.fermeture === 1 ? tips[2] : tips[1];
      ht += '<path d="' + fleche(depart, { x: depart.x + w1.re * rH * 0.96, y: depart.y - w1.im * rH * 0.96 }) + '" stroke-width="3" marker-end="url(#' + idm + ')"/>';
    }
    ["A", "B", "C"].forEach((nom, i) => {
      ecrits += texte(tips[i].x + (tips[i].x < OH.x ? -14 : 6), tips[i].y + (i === 0 ? -6 : 12), nom);
    });
    figHT.innerHTML = ht;

    const rB = 52 / Math.max(0.6, g.f);
    const vas = [g.va, C.mul(g.va, C.pol(1, -120 * DEG)), C.mul(g.va, C.pol(1, 120 * DEG))];
    const bt = vas.map((v) => versP(OB, v, rB));
    let b = "";
    if (etat.bt === 1) {
      b += '<path d="M' + bt[0].x.toFixed(1) + " " + bt[0].y.toFixed(1) + "L" + bt[1].x.toFixed(1) + " " + bt[1].y.toFixed(1) + "L" + bt[2].x.toFixed(1) + " " + bt[2].y.toFixed(1) + 'Z" stroke-width="1.4"/>';
    }
    if (etat.bt === 2) {
      const s = etat.polarite === 1 ? -1 : 1;
      const demi = C.k(g.w[0], 0.5 * s);
      const p1 = versP(OB, demi, rB);
      b += '<path d="' + fleche(OB, p1) + fleche(p1, bt[0]) + '" stroke-width="1.6" stroke-dasharray="2 3"/>';
    }
    b += '<path d="' + fleche(OB, bt[1]) + fleche(OB, bt[2]) + '" stroke-width="1.6" marker-end="url(#' + idm + ')"/>';
    b += '<path d="' + fleche(OB, bt[0]) + '" stroke-width="3" stroke-dasharray="7 4" marker-end="url(#' + idm + ')"/>';
    b += '<path d="M' + OB.x + " " + OB.y + "V" + (OB.y - 80) + '" stroke-width="1" stroke-dasharray="3 4"/>';
    figBT.innerHTML = b;
    ["a", "b", "c"].forEach((nom, i) => {
      ecrits += texte(bt[i].x + (bt[i].x < OB.x ? -14 : 6), bt[i].y + (bt[i].y < OB.y ? -4 : 14), nom);
    });

    const pA = pt(OC, 90, 66);
    const pa = pt(OC, 90 - 30 * g.h, 50);
    aiguilles.innerHTML =
      '<path d="' + fleche(OC, pA) + '" stroke-width="3" marker-end="url(#' + idm + ')"/>' +
      '<path d="' + fleche(OC, pa) + '" stroke-width="3" stroke-dasharray="7 4" marker-end="url(#' + idm + ')"/>';
    ecrits += texte(OC.x - 30, 300, g.nom);
    libelles.innerHTML = ecrits;

    const familles = { 0: "0, 4, 8", 4: "0, 4, 8", 8: "0, 4, 8", 6: "6, 10, 2", 10: "6, 10, 2", 2: "6, 10, 2", 1: "1, 5, 9", 5: "1, 5, 9", 9: "1, 5, 9", 11: "11, 7, 3", 7: "11, 7, 3", 3: "11, 7, 3" };
    const retard = 30 * g.h;
    if (valeurs) {
      valeurs.maj({
        nom: g.nom,
        h: g.h,
        dephasage: retard === 0 ? "en phase avec V_A" : retard > 180 ? "avance de " + (360 - retard) + "°" : "retard de " + retard + "°",
        f: g.f,
        famille: familles[g.h],
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-horloge-curseurs",
    [
      { id: "ht", libelle: "Couplage haute tension", min: 0, max: 1, pas: 1, valeur: etat.ht, format: (v) => (Number(v) === 0 ? "étoile Y" : "triangle D") },
      { id: "bt", libelle: "Couplage basse tension", min: 0, max: 2, pas: 1, valeur: etat.bt, format: (v) => ["étoile y", "triangle d", "zigzag z"][Number(v)] },
      {
        id: "fermeture",
        libelle: "Sens de fermeture du triangle ou du zigzag",
        min: 0,
        max: 1,
        pas: 1,
        valeur: etat.fermeture,
        format: (v) => (Number(v) === 0 ? "colonne 1 vers la phase suivante" : "colonne 1 vers la phase précédente"),
      },
      { id: "polarite", libelle: "Raccordement des enroulements BT", min: 0, max: 1, pas: 1, valeur: etat.polarite, format: (v) => (Number(v) === 0 ? "borne repérée côté ligne" : "inversé") },
    ],
    (lues) => {
      etat.ht = Math.round(lues.ht);
      etat.bt = Math.round(lues.bt);
      etat.fermeture = Math.round(lues.fermeture);
      etat.polarite = Math.round(lues.polarite);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Animation : une charge monophasée vue des deux côtés
   -------------------------------------------------------------------------- */

const MODELES_HOMO = [
  { nom: "Dyn11", bt: [1, 0, 0], ht: [POSTE.n, 0, 0], lignes: [POSTE.n, -POSTE.n, 0], residu: [0, 0, 0] },
  {
    nom: "Yyn0",
    bt: [1, 0, 0],
    ht: [(2 / 3) * POSTE.nYy, (-1 / 3) * POSTE.nYy, (-1 / 3) * POSTE.nYy],
    lignes: [(2 / 3) * POSTE.nYy, (-1 / 3) * POSTE.nYy, (-1 / 3) * POSTE.nYy],
    residu: [1 / 3, 1 / 3, 1 / 3],
  },
  { nom: "Yzn11", bt: [1, -1, 0], ht: [POSTE.nYz / 2, -POSTE.nYz / 2, 0], lignes: [POSTE.nYz / 2, -POSTE.nYz / 2, 0], residu: [0, 0, 0] },
];

function construireAnimHomopolaire(racine, api) {
  const conteneur = racine.querySelector("#e-homo");
  if (!conteneur) return;
  const etat = { c: 0, ia: 100, wt: 30 };
  const X = [200, 360, 520];
  const regle = { de: { x: 160, y: 455 }, a: { x: 560, y: 455 } };
  const BASE = 392;

  const svg = svgEl("svg", {
    viewBox: "0 0 720 490",
    role: "img",
    "aria-label": "Transformateur à trois colonnes alimentant une charge monophasée entre la phase a et le neutre : courants des enroulements, courants de ligne haute tension et ampères-tours résiduels de chaque colonne",
  });
  const idm = nouveauMarqueur("fl-e-hm");
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(idm);
  const noyau = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.8, opacity: 0.8 });
  noyau.innerHTML =
    '<rect x="184" y="100" width="352" height="232" rx="3"/><rect x="216" y="116" width="128" height="200" rx="2"/><rect x="376" y="116" width="128" height="200" rx="2"/>';
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.55 });
  let t = "M" + regle.de.x + " " + regle.de.y + "H" + regle.a.x + "M150 " + BASE + "H570";
  for (let i = 0; i <= 4; i += 1) t += "M" + (regle.de.x + i * 100) + " " + (regle.de.y - 6) + "v12";
  fond.innerHTML = '<path d="' + t + '"/>';
  const lignes = [0, 1, 2].map(() => svgEl("path", { fill: "none", stroke: "currentColor", "stroke-linecap": "round" }));
  const enrHT = X.map((x) => svgEl("rect", { x: x - 34, y: 132, width: 68, height: 52, rx: 5, fill: "none", stroke: "currentColor" }));
  const enrBT = X.map((x) => svgEl("rect", { x: x - 28, y: 222, width: 56, height: 52, rx: 5, fill: "none", stroke: "currentColor" }));
  const fleches = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round" });
  const barres = svgEl("g", { fill: "currentColor", "fill-opacity": 0.3, stroke: "currentColor", "stroke-width": 1.4 });
  const fuite = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-dasharray": "5 5" });
  fuite.innerHTML =
    '<path d="M200 100C200 76 150 70 140 100S150 330 184 340"/><path d="M520 100C520 76 570 70 580 100S570 330 536 340"/><path d="M360 100V84"/>';
  const points = svgEl("g", { fill: "currentColor", stroke: "none" });
  points.innerHTML = X.map((x) => '<circle cx="' + (x - 28) + '" cy="140" r="3.5"/><circle cx="' + (x - 22) + '" cy="230" r="3.5"/>').join("");
  const fixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  fixes.innerHTML =
    texte(40, 34, "A") + texte(40, 54, "B") + texte(40, 74, "C") +
    X.map((x, i) => texte(x - 10, 162, "HT") + texte(x - 10, 252, "BT") + texte(x - 22, 352, "col. " + (i + 1))).join("") +
    texte(20, BASE - 22, "AT non") + texte(20, BASE - 6, "compensés") +
    texte(regle.de.x - 4, regle.de.y + 22, "0") + texte(regle.a.x - 30, regle.a.y + 22, "140,8 A") +
    texte(regle.de.x, regle.de.y - 14, "courant de la charge phase a - neutre") +
    texte(560, 260, "BT : a, b, c, n") + texte(560, 278, "charge sur a seule");
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, noyau, fuite, ...lignes, ...enrHT, ...enrBT, points, fleches, barres, fixes, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-homo-valeurs", [
    { id: "nom", libelle: "Couplage", format: (v) => v },
    { id: "ia", libelle: "Courant de la phase a", unite: "A", decimales: 1 },
    { id: "iA", libelle: "Ligne A", unite: "A", decimales: 3 },
    { id: "iB", libelle: "Ligne B", unite: "A", decimales: 3 },
    { id: "iC", libelle: "Ligne C", unite: "A", decimales: 3 },
    { id: "residu", libelle: "AT non compensés par colonne", unite: "N2 Ia", decimales: 3 },
    { id: "flux", libelle: "Flux homopolaire", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const m = MODELES_HOMO[etat.c];
    const inst = Math.SQRT2 * Math.cos(etat.wt * DEG);
    const iMaxHT = 0.0137 * 140.8;
    for (let i = 0; i < 3; i += 1) {
      const eff = Math.abs(m.lignes[i]) * etat.ia;
      lignes[i].setAttribute("d", "M60 " + (30 + 20 * i) + "H600");
      lignes[i].setAttribute("stroke-width", (1 + (5 * eff) / iMaxHT).toFixed(2));
      enrHT[i].setAttribute("stroke-width", (1.2 + (6 * Math.abs(m.ht[i]) * etat.ia) / iMaxHT).toFixed(2));
      enrBT[i].setAttribute("stroke-width", (1.2 + (6 * Math.abs(m.bt[i]) * etat.ia) / 140.8).toFixed(2));
    }
    let f = "";
    for (let i = 0; i < 3; i += 1) {
      const vHT = (m.ht[i] / 0.0137) * (etat.ia / 140.8) * inst * 18;
      const vBT = m.bt[i] * (etat.ia / 140.8) * inst * 18;
      if (Math.abs(vHT) > 2) f += '<path d="M' + (X[i] + 44) + " 158v" + (-vHT).toFixed(1) + '" marker-end="url(#' + idm + ')"/>';
      if (Math.abs(vBT) > 2) f += '<path d="M' + (X[i] + 38) + " 248v" + (-vBT).toFixed(1) + '" marker-end="url(#' + idm + ')"/>';
    }
    fleches.innerHTML = f;
    let b = "";
    for (let i = 0; i < 3; i += 1) {
      const h = m.residu[i] * inst * (etat.ia / 140.8) * 60;
      b += '<rect x="' + (X[i] - 14) + '" y="' + (h >= 0 ? BASE - h : BASE).toFixed(1) + '" width="28" height="' + Math.max(1, Math.abs(h)).toFixed(1) + '"/>';
    }
    barres.innerHTML = b;
    const homopolaire = m.residu[0] > 0 && etat.ia > 1;
    fuite.setAttribute("opacity", homopolaire ? "0.9" : "0");
    libelles.innerHTML =
      [0, 1, 2].map((i) => texte(610, 34 + 20 * i, nombre(api, Math.abs(m.lignes[i]) * etat.ia, 3) + " A")).join("") +
      texte(560, 120, m.nom) +
      (homopolaire ? texte(560, 200, "flux par la cuve") : texte(560, 200, "AT compensés"));
    if (valeurs) {
      valeurs.maj({
        nom: m.nom,
        ia: etat.ia,
        iA: Math.abs(m.lignes[0]) * etat.ia,
        iB: Math.abs(m.lignes[1]) * etat.ia,
        iC: Math.abs(m.lignes[2]) * etat.ia,
        residu: m.residu[0],
        flux: homopolaire ? "présent, se referme par la cuve" : "nul",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-homo-curseurs",
    [{ id: "c", libelle: "Couplage du transformateur", min: 0, max: 2, pas: 1, valeur: etat.c, format: (v) => MODELES_HOMO[Number(v)].nom }],
    (lues) => {
      etat.c = Math.round(lues.c);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: regle.de,
    a: regle.a,
    min: 0,
    max: 140.8,
    pas: 0.5,
    valeur: etat.ia,
    unite: "A",
    libelle: "Courant de la charge monophasée",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.ia = Number(mesure.valeur);
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const lecteur = api.sim.lecteur("#e-homo-lecteur", {
    de: 0,
    a: 360,
    duree: 6,
    boucle: true,
    auto: false,
    libelle: "Courants instantanés sur une période",
    rappel: (valeur) => {
      etat.wt = Number(valeur);
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);
  if (lecteur) lecteur.suivre(etat.wt);
  dessiner();
}

/* --------------------------------------------------------------------------
   H. Simulation : vérifier une mise en parallèle
   -------------------------------------------------------------------------- */

/** Courants des deux appareils pour une charge totale S (VA) et l'état des curseurs. */
function parallele(S, p) {
  const Z1 = zcc(EX.Sn1, EX.ucc1, EX.Pcc1);
  const ur2 = p.ur2 / 100;
  const ucc2 = Math.max(p.ucc2 / 100, ur2 + 1e-4);
  const Z2 = zcc(p.Sn2 * 1e3, ucc2, ur2 * p.Sn2 * 1e3);
  const Zs = C.add(Z1, Z2);
  const E1 = C.n(EX.V);
  const E2 = C.pol(EX.V * (1 + p.delta / 100), -30 * p.decalage * DEG);
  const Ic = C.div(C.sub(E1, E2), Zs);
  const IL = C.pol(S / (3 * EX.V), -Math.acos(EX.cos));
  const I1 = C.add(C.mul(IL, C.div(Z2, Zs)), Ic);
  const I2 = C.sub(C.mul(IL, C.div(Z1, Zs)), Ic);
  const In1 = EX.Sn1 / (3 * EX.V);
  const In2 = (p.Sn2 * 1e3) / (3 * EX.V);
  return { x1: C.abs(I1) / In1, x2: C.abs(I2) / In2, Ic: C.abs(Ic), In1, Z1, Z2 };
}

function chargeAdmissible(p) {
  const total = EX.Sn1 + p.Sn2 * 1e3;
  if (Math.max(parallele(0, p).x1, parallele(0, p).x2) >= 1) return 0;
  let bas = 0;
  let haut = total * 1.6;
  if (Math.max(parallele(haut, p).x1, parallele(haut, p).x2) < 1) return haut;
  for (let i = 0; i < 60; i += 1) {
    const milieu = (bas + haut) / 2;
    const r = parallele(milieu, p);
    if (Math.max(r.x1, r.x2) >= 1) haut = milieu;
    else bas = milieu;
  }
  return bas;
}

function construireSimParallele(racine, api) {
  const etat = { Sn2: 630, ucc2: 6, ur2: (100 * 6500) / 630e3, delta: 0, decalage: 0 };
  let smax = chargeAdmissible(etat);

  const trace = api.sim.traceur("#h-sim-trace", {
    titre: "Taux de charge des deux transformateurs en parallèle",
    xTitre: "charge totale S",
    xUnite: "kVA",
    yTitre: "I / In",
    xMin: 0,
    xMax: 1340,
    yMin: 0,
    yMax: 1.6,
    series: [
      { id: "t1", nom: "T1, 400 kVA, ucc 4 %", couleur: "serie-1", epaisseur: 2.8, fonction: (s) => parallele(s * 1e3, etat).x1 },
      { id: "t2", nom: "T2, réglable", couleur: "serie-5", epaisseur: 2.4, fonction: (s) => parallele(s * 1e3, etat).x2 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 1, "pleine charge", false);
      if (smax > 0) ligneV(c, repere, couleurs, smax / 1e3, "admissible " + nombre(api, smax / 1e3, 0) + " kVA", [2, 3]);
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#h-sim-valeurs", [
    { id: "x1", libelle: "T1 sous 800 kVA", unite: "%", decimales: 1 },
    { id: "x2", libelle: "T2 sous 800 kVA", unite: "%", decimales: 1 },
    { id: "smax", libelle: "Charge totale admissible", unite: "kVA", decimales: 1 },
    { id: "util", libelle: "Part de la puissance installée", unite: "%", decimales: 1 },
    { id: "ic", libelle: "Courant de circulation", unite: "A", decimales: 1 },
    { id: "icpu", libelle: "Circulation / In de T1", unite: "%", decimales: 1 },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    smax = chargeAdmissible(etat);
    const total = EX.Sn1 / 1e3 + etat.Sn2;
    const r = parallele(800e3, etat);
    const r0 = parallele(0, etat);
    const yMax = Math.max(1.6, Math.min(12, Math.ceil(Math.max(r0.x1, r0.x2) * 1.3 * 2) / 2));
    if (trace) {
      trace.definirPlage({ xMin: 0, xMax: Math.round(total * 1.3), yMin: 0, yMax });
      trace.rafraichir();
    }
    let verdict = "parallèle correct";
    if (etat.decalage > 0) verdict = "interdit : indices différents";
    else if (r0.x1 > 0.1 || r0.x2 > 0.1) verdict = "prises à aligner";
    else if (smax / 1e3 < 0.9 * total) verdict = "possible, puissance mal utilisée";
    if (valeurs) {
      valeurs.maj({
        x1: 100 * r.x1,
        x2: 100 * r.x2,
        smax: smax / 1e3,
        util: (100 * smax) / 1e3 / total,
        ic: r0.Ic,
        icpu: (100 * r0.Ic) / r0.In1,
        verdict,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#h-sim-curseurs",
    [
      { id: "Sn2", libelle: "Puissance assignée de T2", min: 160, max: 1000, pas: 10, valeur: etat.Sn2, format: (v) => nombre(api, v, 0) + " kVA" },
      { id: "ucc2", libelle: "Tension de court-circuit de T2", min: 3, max: 8, pas: 0.1, valeur: etat.ucc2, format: (v) => nombre(api, v, 1) + " %" },
      { id: "ur2", libelle: "Part résistive ur de T2", min: 0.5, max: 2.5, pas: 0.01, valeur: etat.ur2, format: (v) => nombre(api, v, 2) + " %" },
      { id: "delta", libelle: "Écart de tension à vide de T2", min: -5, max: 5, pas: 0.5, valeur: etat.delta, format: (v) => nombre(api, v, 1) + " %" },
      { id: "decalage", libelle: "Écart d'indice horaire de T2", min: 0, max: 2, pas: 1, valeur: etat.decalage, format: (v) => nombre(api, v, 0) + " h" },
    ],
    (lues) => {
      Object.assign(etat, lues);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function dessinCadranZones() {
  return dessinHorloge(0, { chiffres: [1, 5, 7, 11], nomA2: "", lignes: [] }).replace(/<path d="M100[^"]*" stroke-width="3" stroke-dasharray="7 4"[^>]*>/, "");
}

function zonesCadran(juste) {
  return [1, 5, 7, 11].map((h) => {
    const p = pt({ x: 100, y: 100 }, 90 - 30 * h, 58);
    return { x: p.x - 18, y: p.y - 18, largeur: 36, hauteur: 36, etiquette: h + " h", juste: h === juste };
  });
}

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-courants",
      titre: "Courants d'enroulement d'un Dyn11 de 400 kVA",
      niveau: "fondamental",
      enonce:
        "<p>Un transformateur Dyn11 de $400\\ \\mathrm{kVA}$, $20\\ \\mathrm{kV} / 410\\ \\mathrm{V}$, fonctionne à pleine charge. " +
        "Quel courant traverse chacun de ses enroulements haute tension ?</p>",
      valeur: 400e3 / (RAC3 * 20e3) / RAC3,
      unite: "A",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Courant d'enroulement $J_1$",
      etapes: [
        { texte: "Courant de ligne : $I_1 = S_n/(\\sqrt{3}\\,U_1) = 400\\,000/(\\sqrt{3} \\times 20\\,000) = 11{,}55\\ \\mathrm{A}$." },
        { texte: "D : les enroulements haute tension sont en triangle, donc $J_1 = I_1/\\sqrt{3} = 6{,}667\\ \\mathrm{A}$." },
        {
          texte: "Contrôle : $20\\,000 \\times 6{,}667 = 133{,}3\\ \\mathrm{kVA} = S_n/3$ par enroulement.",
          note: "Côté basse tension, en étoile, le courant d'enroulement est le courant de ligne, $563{,}3\\ \\mathrm{A}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 520 220",
          dessinTriangleCourants("6,667 A", "11,55 A", { l5: "contrôle : 20 kV × 6,667 A", l6: "= 133,3 kVA = Sn / 3" }),
          "Triangle haute tension : courant de ligne I de 11,55 A entrant en A, courants J de 6,667 A dans chaque enroulement ; la puissance d'un enroulement vaut le tiers de la puissance assignée."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-resistance",
      titre: "Résistance d'un enroulement en triangle",
      niveau: "fondamental",
      enonce:
        "<p>Entre deux bornes haute tension d'un transformateur Dyn11, enroulements à $22\\ ^\\circ\\mathrm{C}$, un ohmmètre lit " +
        "$53{,}6\\ \\Omega$. Quelle est la résistance d'un enroulement du triangle ?</p>",
      valeur: 1.5 * 53.6,
      unite: "Ω",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Résistance d'enroulement $R_{ph}$",
      etapes: [
        { texte: "Entre A et B, l'ohmmètre voit l'enroulement A-B en parallèle avec les deux autres en série : $R_{mes} = R_{ph} \\parallel 2R_{ph} = \\tfrac{2}{3}R_{ph}$." },
        { texte: "$R_{ph} = 1{,}5 \\times 53{,}6 = 80{,}4\\ \\Omega$." },
        {
          texte: "Étoile équivalente : $R_Y = R_{ph}/3 = 26{,}8\\ \\Omega$, valeur du procès-verbal du poste.",
          note: "Contrôle par les pertes : $3 \\times 80{,}4 \\times 1{,}667^2 = 3 \\times 26{,}8 \\times 2{,}887^2 = 670\\ \\mathrm{W}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const id = nouveauMarqueur("fl-k-r");
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 520 230",
          "<defs>" + marqueur(id) + "</defs>" +
            TRAITS + ' stroke-width="2"><path d="M120 40L150 92M170 126L200 178L150 178M90 178L40 178L70 126M90 92L120 40"/>' +
            '<rect x="146" y="88" width="16" height="42" rx="2" transform="rotate(-30 160 109)"/><rect x="99" y="170" width="42" height="16" rx="2"/><rect x="72" y="88" width="16" height="42" rx="2" transform="rotate(30 80 109)"/>' +
            '<circle cx="230" cy="80" r="16"/><path d="M120 40H230V64M200 178H250V96"/></g>' +
            ECRITS + texte(225, 84, "Ω") + texte(110, 34, "A") + texte(206, 194, "B") + texte(26, 194, "C") + texte(166, 108, "Rph") + texte(104, 200, "Rph") + texte(44, 108, "Rph") +
            texte(290, 50, "entre A et B :") + texte(290, 72, "Rph // 2 Rph") + texte(290, 94, "= 2/3 Rph = 53,6 Ω") + texte(290, 128, "Rph = 80,4 Ω") + texte(290, 150, "étoile équivalente :") + texte(290, 172, "Rph / 3 = 26,8 Ω") + "</g>",
          "Triangle des trois enroulements de résistance Rph ; l'ohmmètre branché entre A et B voit une branche en parallèle avec les deux autres en série, soit deux tiers de Rph."
        );
      },
    })
  );

  ressources.push(
    api.exercice.schema(cible, {
      id: "k-cadran",
      titre: "Lecture du cadran d'un Yd",
      niveau: "intermédiaire",
      consigne: "Cliquez sur la position du phaseur basse tension a.",
      enonce:
        "<p>Un transformateur a ses enroulements haute tension en étoile. Côté basse tension, en triangle, l'enroulement de la colonne 1 " +
        "relie la borne a, raccordée à sa borne repérée, à la borne b. Le phaseur $\\underline{V}_A$ est sur 12 heures. Où tombe la tension " +
        "simple $\\underline{V}_a$ de l'étoile équivalente ?</p>",
      viewBox: "0 0 300 200",
      dessin: dessinCadranZones(),
      zones: zonesCadran(1),
      etapes: [
        { texte: "Étoile haute tension : l'enroulement de la colonne 1 porte $\\underline{V}_A$, sur 12 heures." },
        { texte: "L'enroulement basse tension de la même colonne est en phase : $\\underline{U}_{ab}$ est parallèle à $\\underline{V}_A$." },
        { texte: "Dans un triangle, $\\underline{U}_{ab} = \\sqrt{3}\\,\\underline{V}_a e^{j30^\\circ}$, donc $\\underline{V}_a$ est en retard de $30^\\circ$ sur $\\underline{U}_{ab}$." },
        { texte: "Retard de $30^\\circ$ sur $\\underline{V}_A$ : 1 heure, groupe Yd1.", note: "Avec l'enroulement de la colonne 1 entre a et c, on obtiendrait Yd11." },
      ],
      visuelCorrection(conteneur, moteur) {
        const id = nouveauMarqueur("fl-k-c");
        const o = { x: 110, y: 130 };
        const A = pt(o, 90, 90);
        const Uab = pt({ x: 330, y: 190 }, 90, 110);
        const a = pt({ x: 330, y: 190 }, 60, 64);
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 230",
          "<defs>" + marqueur(id) + "</defs>" +
            TRAITS + ' stroke-width="2"><path d="' + fleche(o, A) + '" marker-end="url(#' + id + ')"/><path d="' + fleche({ x: 330, y: 190 }, Uab) + '" marker-end="url(#' + id + ')"/></g>' +
            TRAITS + ' stroke-width="3" stroke-dasharray="7 4"><path d="' + fleche({ x: 330, y: 190 }, a) + '" marker-end="url(#' + id + ')"/></g>' +
            TRAITS + ' stroke-width="1.4"><path d="M330 150A40 40 0 0 1 350 155.4"/></g>' +
            ECRITS + texte(A.x + 6, A.y + 10, "V_A, colonne 1") + texte(Uab.x + 8, Uab.y + 10, "U_ab, même colonne") + texte(a.x + 6, a.y + 4, "V_a") + texte(296, 160, "30°") +
            texte(400, 120, "V_a en retard") + texte(400, 140, "de 30° : 1 h") + texte(400, 170, "groupe Yd1") + "</g>",
          "Construction : V_A en trait plein, U_ab parallèle à V_A sur la même colonne, puis V_a en tirets épais, en retard de 30 degrés sur U_ab : le phaseur a tombe sur 1 heure."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-partage",
      titre: "Partage entre 400 kVA à 4 % et 630 kVA à 6 %",
      niveau: "intermédiaire",
      enonce:
        "<p>Deux transformateurs de même groupe et de même rapport, T1 de $400\\ \\mathrm{kVA}$ avec $u_{cc} = 4\\ \\%$ et T2 de " +
        "$630\\ \\mathrm{kVA}$ avec $u_{cc} = 6\\ \\%$, alimentent ensemble $800\\ \\mathrm{kVA}$. Quelle puissance débite T1 ? On supposera " +
        "les rapports $X/R$ égaux.</p>",
      valeur: (800 * 100) / 205,
      unite: "kVA",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Puissance de T1, $S_1$",
      etapes: [
        { texte: "Les taux de charge sont en raison inverse des $u_{cc}$ : $S_i \\propto S_{ni}/u_{cci}$." },
        { texte: "$S_{n1}/u_{cc1} = 400/4 = 100$ et $S_{n2}/u_{cc2} = 630/6 = 105$." },
        { texte: "$S_1 = 800 \\times 100/205 = 390{,}2\\ \\mathrm{kVA}$, soit $97{,}6\\ \\%$ de T1 ; $S_2 = 409{,}8\\ \\mathrm{kVA}$, $65{,}0\\ \\%$ de T2." },
        {
          texte: "Avec les impédances complexes, on trouve $390{,}9\\ \\mathrm{kVA}$ : l'écart vient des rapports $X/R$ différents.",
          note: "T1 atteint sa pleine charge vers $820\\ \\mathrm{kVA}$ de charge totale, pour $1030\\ \\mathrm{kVA}$ installés.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Taux de charge en fonction de la charge totale",
          xTitre: "S",
          xUnite: "kVA",
          yTitre: "S / Sn",
          xMin: 0,
          xMax: 1100,
          yMin: 0,
          yMax: 1.4,
          series: [
            { id: "a", nom: "T1, 400 kVA, 4 %", couleur: "serie-1", epaisseur: 2.6, fonction: (s) => (s * 100) / 205 / 400 },
            { id: "b", nom: "T2, 630 kVA, 6 %", couleur: "serie-5", epaisseur: 2.2, fonction: (s) => (s * 105) / 205 / 630 },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 1, "pleine charge", false);
            ligneV(c, repere, couleurs, 800, "800 kVA", [2, 3]);
            pointTrace(c, repere, couleurs, 800, 800 / 205 / 4, "T1 : 97,6 %");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-circulation",
      titre: "Courant de circulation dû à une prise mal réglée",
      niveau: "avancé",
      enonce:
        "<p>Deux transformateurs identiques de $630\\ \\mathrm{kVA}$, $20\\ \\mathrm{kV} / 410\\ \\mathrm{V}$, Dyn11, $u_{cc} = 4\\ \\%$, " +
        "$P_{cc} = 6500\\ \\mathrm{W}$, sont couplés en parallèle à vide. Le premier donne $410\\ \\mathrm{V}$ à vide ; le second, réglé sur " +
        "une autre prise, donne $400\\ \\mathrm{V}$. Quel courant circule entre eux ?</p>",
      valeur: (10 / RAC3) / (2 * 0.04 * (410 * 410) / 630e3),
      unite: "A",
      tolerance: 0.03,
      chiffres: 1,
      libelleChamp: "Courant de circulation $I_c$",
      etapes: [
        { texte: "Écart des forces électromotrices par phase : $\\Delta E = (410 - 400)/\\sqrt{3} = 5{,}774\\ \\mathrm{V}$, en phase puisque les indices sont identiques." },
        { texte: "Impédance de court-circuit de chacun : $Z_{cc} = 0{,}04 \\times 410^2/630\\,000 = 10{,}67\\ \\mathrm{m\\Omega}$ ; mêmes rapports $X/R$, donc $|\\underline{Z}_1 + \\underline{Z}_2| = 21{,}35\\ \\mathrm{m\\Omega}$." },
        { texte: "$I_c = 5{,}774/0{,}021\\,35 = 270{,}5\\ \\mathrm{A}$." },
        {
          texte: "Courant assigné : $630\\,000/(\\sqrt{3} \\times 410) = 887{,}1\\ \\mathrm{A}$ ; la circulation en représente $30{,}5\\ \\%$, à vide.",
          note: "Formule en grandeurs relatives : $i_c = \\Delta u/(2u_{cc}) = 2{,}44/8 = 30{,}5\\ \\%$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Courant de circulation en fonction de l'écart de tension à vide",
          xTitre: "écart",
          xUnite: "%",
          yTitre: "Ic",
          yUnite: "A",
          xMin: 0,
          xMax: 5,
          yMin: 0,
          yMax: 600,
          series: [{ id: "ic", nom: "Ic = ΔE / (2 Zcc)", couleur: "serie-1", epaisseur: 2.6, fonction: (d) => ((d / 100) * 236.71) / 0.021346 }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 887.1 * 0.5, "50 % de In", false);
            pointTrace(c, repere, couleurs, 2.439, 270.5, "270,5 A pour 2,44 %");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Deux disjoncteurs chargés sans charge",
      niveau: "diagnostic",
      enonce:
        "<p>Après le remplacement de l'un d'eux, deux transformateurs Dyn11 de $630\\ \\mathrm{kVA}$, $u_{cc} = 4\\ \\%$, sont recouplés " +
        "en parallèle. Charge débranchée, chaque disjoncteur basse tension affiche environ $270\\ \\mathrm{A}$, et les deux appareils " +
        "chauffent. Le couplage n'a provoqué aucun déclenchement. Quelle est la cause la plus probable ?</p>",
      options: [
        { texte: "Les deux transformateurs ne sont pas réglés sur la même prise.", juste: true },
        { texte: "Leurs indices horaires diffèrent d'une heure." },
        { texte: "Leurs tensions de court-circuit diffèrent légèrement." },
        { texte: "Le neutre basse tension commun est mal raccordé." },
      ],
      etapes: [
        { texte: "À vide, seul un écart de forces électromotrices fait circuler un courant entre les deux appareils." },
        { texte: "Un écart d'une heure donnerait $\\Delta E = 122{,}5\\ \\mathrm{V}$ et environ $5700\\ \\mathrm{A}$ : déclenchement immédiat." },
        { texte: "Des $u_{cc}$ différentes changent le partage en charge, mais ne créent rien à vide ; un neutre mal raccordé ne crée pas de courant de ligne à vide." },
        { texte: "Un écart de prise de $2{,}5\\ \\%$ donne $270\\ \\mathrm{A}$, $30\\ \\%$ du courant assigné : c'est le symptôme observé.", note: "Vérification : mesurer la tension entre pôles homologues du disjoncteur de couplage ouvert, environ $10\\ \\mathrm{V}$ entre phases." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 700 200",
          dessinBarres(
            [
              { nom: "prise 2,5 %", valeur: 30.5, max: 100, texte: "30,5 % de In" },
              { nom: "ucc 4 et 6 %", valeur: 0.5, max: 100, texte: "0 % à vide" },
              { nom: "indice 1 h", valeur: 647, max: 100, texte: "647 % : déclenchement" },
            ],
            { pied: "trait vertical en tirets : courant assigné ; barre tronquée au-delà de 125 %" }
          ),
          "Courant de circulation à vide selon la cause, en pour cent du courant assigné : seule une différence de prise donne l'ordre de grandeur observé sans déclenchement."
        );
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Pourquoi Dyn en distribution",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi les transformateurs qui alimentent un réseau basse tension avec neutre distribué et charges " +
        "monophasées sont presque toujours couplés en Dyn plutôt qu'en Yyn.</p>",
      motsCles: [["triangle", "delta"], ["homopolaire", "neutre", "desequilibr", "monophas"], ["compens", "circul", "equilibr"], ["flux", "cuve", "ampere"]],
      minimum: 3,
      exemple: "Trois ou quatre phrases : reliez le courant de neutre, les ampères-tours de chaque colonne et le couplage haute tension.",
      etapes: [
        { texte: "Une charge monophasée crée côté basse tension des ampères-tours sur une seule colonne, avec une composante homopolaire." },
        { texte: "Un triangle haute tension peut faire circuler le courant compensateur dans l'enroulement de cette seule colonne : les ampères-tours sont compensés colonne par colonne." },
        { texte: "Une étoile haute tension sans neutre impose des courants de somme nulle : un tiers des ampères-tours reste non compensé sur chaque colonne, en phase, d'où un flux homopolaire qui passe par la cuve et déplace le neutre." },
        { texte: "Le triangle confine aussi les courants de rang 3 et garde le flux sinusoïdal.", note: "Le Yzn obtient la même compensation par le zigzag, au prix de $15\\ \\%$ de spires en plus." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 600 210",
          dessinBarres(
            [
              { nom: "Dyn : col. 1, 2, 3", valeur: 0.5, max: 33.3, texte: "0 : compensés" },
              { nom: "Yyn : col. 1", valeur: 33.3, max: 33.3, texte: "N2 Ia / 3" },
              { nom: "Yyn : col. 2", valeur: 33.3, max: 33.3, texte: "N2 Ia / 3" },
              { nom: "Yyn : col. 3", valeur: 33.3, max: 33.3, texte: "N2 Ia / 3, en phase" },
            ],
            { x0: 170, l: 260 }
          ),
          "Ampères-tours non compensés par colonne pour une charge monophasée : nuls en Dyn ; un tiers de N2 Ia sur chaque colonne en Yyn, en phase sur les trois, ce qui crée un flux homopolaire."
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
    viewBox: "0 0 520 200",
    dessin: dessinHorloge(11, { lignes: ["D : triangle côté HT", "yn : étoile côté BT,", "     neutre sorti", "11 : retard 330°", "   = avance de 30°"] }),
    legende: "Cadran du Dyn11 : phaseur haute tension A sur 12 heures en trait plein, phaseur basse tension a sur 11 heures en tirets.",
  },
  {
    viewBox: "0 0 520 200",
    dessin:
      "<defs>" + marqueur("fl-q2") + "</defs>" +
      TRAITS + ' stroke-width="2.4"><path d="M60 170V40" marker-end="url(#fl-q2)"/><path d="M110 170V70" stroke-dasharray="7 4" marker-end="url(#fl-q2)"/>' +
      '<path d="M300 170V50" marker-end="url(#fl-q2)"/><path d="M300 170L360 66" stroke-width="3" marker-end="url(#fl-q2)"/></g>' +
      TRAITS + ' stroke-width="1.3"><path d="M300 120A50 50 0 0 0 325 126.7"/></g>' +
      ECRITS + texte(20, 196, "colonne 1 : HT et BT en phase") + texte(66, 46, "HT") + texte(116, 76, "BT") +
      texte(250, 196, "lignes : V_A et U_AB à 30°") + texte(306, 44, "V_A") + texte(366, 70, "U_AB") + texte(316, 112, "30°") + "</g>",
    legende: "À gauche, une colonne : tensions des enroulements HT, trait plein, et BT, tirets, parallèles. À droite, le décalage de 30 degrés apparaît entre une tension simple et une tension composée.",
  },
  {
    viewBox: "0 0 520 220",
    dessin: dessinTriangleCourants("1,667 A", "2,887 A"),
    legende: "Triangle haute tension : 2,887 A par ligne et 1,667 A par enroulement, dans le rapport √3.",
  },
  {
    viewBox: "0 0 520 200",
    dessin: dessinHorloge(5, { lignes: ["Dy5 : retard de 150°", "= Dy11 avec enroulements", "  BT inversés (+ 6 h)"] }),
    legende: "Cadran du Dy5 : phaseur a sur 5 heures, en retard de 150 degrés sur A.",
  },
  {
    viewBox: "0 0 560 200",
    dessin:
      "<defs>" + marqueur("fl-q5") + "</defs>" +
      TRAITS + ' stroke-width="1.8"><rect x="60" y="30" width="30" height="150" rx="3"/><rect x="40" y="50" width="70" height="40" rx="5"/><rect x="40" y="120" width="70" height="40" rx="5"/></g>' +
      TRAITS + ' stroke-width="1.8"><path d="M124 92V54" marker-end="url(#fl-q5)"/><path d="M124 122V158" marker-end="url(#fl-q5)"/></g>' +
      ECRITS + texte(130, 76, "demi-enroulement phase a : + I0") + texte(130, 146, "demi-enroulement phase c inversé : - I0") +
      texte(130, 190, "même colonne : AT homopolaires opposés, somme nulle") + "</g>",
    legende: "Une colonne d'un zigzag porte deux demi-enroulements de phases différentes, l'un inversé : un courant homopolaire y crée des ampères-tours opposés qui se compensent.",
  },
  {
    viewBox: "0 0 560 150",
    dessin: dessinBarres(
      [
        { nom: "ucc 4 % : 222,2 kVA", valeur: 222.2, max: 250, texte: "88,9 %" },
        { nom: "ucc 5 % : 177,8 kVA", valeur: 177.8, max: 250, texte: "71,1 %" },
      ],
      { pied: "S1 = 400 × (1/4) / (1/4 + 1/5) ; tirets : 250 kVA" }
    ),
    legende: "Partage de 400 kVA entre deux appareils de 250 kVA : celui de plus faible tension de court-circuit est le plus chargé.",
  },
  {
    viewBox: "0 0 520 160",
    dessin: dessinEtapes(["même ordre des phases : indispensable", "même indice horaire : indispensable", "même rapport et même prise : indispensable", "même puissance : non, règle de conception"], 500),
    legende: "Les trois premières conditions sont indispensables ; l'égalité des puissances n'est qu'une recommandation.",
  },
  {
    viewBox: "0 0 580 225",
    dessin: dessinHorloge(1, { cx: 110, lignes: [] }) + '<g transform="translate(270 0)">' + dessinHorloge(11, { cx: 110, lignes: [] }) + "</g>" +
      ECRITS + texte(60, 218, "Dyn1, tel quel") + texte(300, 218, "B et C croisés des deux côtés") + "</g>",
    legende: "À gauche, Dyn1 : a sur 1 heure. À droite, le même appareil vu par le réseau après croisement de deux phases côté haute et basse tension : a sur 11 heures.",
  },
  {
    viewBox: "0 0 520 140",
    dessin: dessinEtapes(["ΔE = 1 % de E", "Z1 + Z2 = 5 % + 5 % = 10 %", "ic = 1 % / 10 % = 10 % de In", "présent même à vide"], 500),
    legende: "Calcul du courant de circulation en grandeurs relatives, étapes révélées une à une.",
  },
  {
    viewBox: "0 0 520 200",
    dessin: dessinHorloge(11, { marques: [11, 7, 3], chiffres: [11, 7], lignes: ["famille 11, 7, 3 :", "renommage circulaire", "des bornes BT : ± 4 h", "Yd11 → Yd7 → Yd3"] }),
    legende: "Cadran : les indices 11, 7 et 3, entourés, forment une famille ; on passe de l'un à l'autre en renommant circulairement les bornes.",
  },
];

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Que signifie le symbole Dyn11 ?</p>",
        options: [
          "Triangle côté haute tension, étoile avec neutre sorti côté basse tension, basse tension en avance de 30°",
          "Triangle côté basse tension, étoile côté haute tension, basse tension en retard de 330°",
          "Triangle côté haute tension, étoile côté basse tension, basse tension en retard de 30°",
          "Deux étoiles avec neutre, déphasage de 11°",
        ],
        bonnes: [0],
        explication: "Majuscule côté haute tension, minuscule côté basse tension, n pour le neutre sorti ; l'indice 11 est un retard de $330^\\circ$, donc une avance de $30^\\circ$.",
        resume: "Lecture du symbole Dyn11",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Sur une même colonne, la tension de l'enroulement basse tension est déphasée de $30^\\circ$ sur celle de l'enroulement haute tension.</p>",
        reponse: false,
        explication: "Sur une colonne, les deux enroulements voient le même flux : leurs tensions sont en phase entre bornes repérées. Le décalage apparaît entre tensions de ligne, à cause des couplages.",
        resume: "Tensions d'une même colonne",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Un transformateur Dyn de $100\\ \\mathrm{kVA}$, $20\\ \\mathrm{kV}$, absorbe $2{,}887\\ \\mathrm{A}$ par ligne haute tension. Quel courant traverse chaque enroulement du triangle, en ampères ?</p>",
        valeur: 2.887 / RAC3,
        unite: "A",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$J = I/\\sqrt{3} = 2{,}887/1{,}732 = 1{,}667\\ \\mathrm{A}$.",
        resume: "Courant d'enroulement en triangle",
      },
      {
        type: "schema",
        enonce: repere(3) + "<p>Pour un transformateur Dy5, où tombe le phaseur basse tension a sur le cadran ?</p>",
        consigne: "Cliquez sur la position du phaseur a.",
        viewBox: "0 0 300 200",
        dessin: dessinCadranZones(),
        zones: zonesCadran(5),
        explication: "L'indice 5 place $\\underline{V}_a$ sur 5 heures : retard de $150^\\circ$ sur $\\underline{V}_A$.",
        resume: "Position du phaseur d'un Dy5",
      },
      {
        type: "courte",
        enonce: repere(4) + "<p>Pourquoi utilise-t-on un enroulement basse tension en zigzag sur un petit transformateur dont la haute tension est en étoile ?</p>",
        motsCles: [["homopolaire", "neutre", "desequilibr", "monophas"], ["compens", "annul", "oppos"], ["flux", "colonne", "ampere"]],
        minimum: 2,
        explication: "Chaque colonne porte deux demi-enroulements de phases différentes, l'un inversé : les ampères-tours homopolaires s'y compensent, si bien que le neutre peut être chargé sans flux homopolaire, malgré l'étoile haute tension sans neutre.",
        resume: "Rôle du zigzag",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Deux transformateurs de $250\\ \\mathrm{kVA}$, de même indice et de même rapport, ont des $u_{cc}$ de $4\\ \\%$ et $5\\ \\%$. Ils alimentent ensemble $400\\ \\mathrm{kVA}$. Quelle puissance débite celui de $4\\ \\%$, en kVA ?</p>",
        valeur: (400 * 0.25) / 0.45,
        unite: "kVA",
        tolerance: 0.02,
        chiffres: 1,
        explication: "$S_1 = 400 \\times (1/4)/(1/4 + 1/5) = 222{,}2\\ \\mathrm{kVA}$, soit $88{,}9\\ \\%$ de sa puissance ; l'autre débite $177{,}8\\ \\mathrm{kVA}$.",
        resume: "Partage selon les ucc",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Quelles conditions sont indispensables pour mettre deux transformateurs en parallèle sans courant de circulation notable ?</p>",
        options: [
          { texte: "Même ordre des phases", juste: true },
          { texte: "Même indice horaire, ou indices rendus identiques", juste: true },
          { texte: "Même rapport de transformation et même prise", juste: true },
          { texte: "Même puissance assignée" },
        ],
        multiple: true,
        explication: "Les trois premières évitent un écart de forces électromotrices ; des puissances différentes sont admises, avec un rapport souvent limité à environ 2 par règle de conception.",
        resume: "Conditions de mise en parallèle",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Un Dyn1 peut être mis en parallèle avec un Dyn11 en croisant deux phases côté haute tension et les deux mêmes côté basse tension sur l'un des appareils.</p>",
        reponse: true,
        explication: "Le croisement fait voir à l'appareil le système inverse, pour lequel son déphasage change de signe : son retard de $30^\\circ$ devient une avance de $30^\\circ$.",
        resume: "Croisement de deux phases",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Deux transformateurs identiques de $u_{cc} = 5\\ \\%$ sont couplés en parallèle ; leurs tensions à vide diffèrent de $1\\ \\%$. Quel est le courant de circulation, en pour cent du courant assigné ?</p>",
        valeur: 10,
        unite: "%",
        tolerance: 0.02,
        chiffres: 1,
        explication: "$i_c = \\Delta u/(u_{cc1} + u_{cc2}) = 1/10 = 10\\ \\%$ du courant assigné, même sans charge.",
        resume: "Courant de circulation relatif",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Avec quel groupe un Yd11 peut-il être mis en parallèle par un simple renommage circulaire des bornes ?</p>",
        options: ["Yd7", "Yd1", "Yd5", "Yd0"],
        bonnes: [0],
        explication: "Le renommage circulaire décale l'indice de 4 heures : 11, 7 et 3 forment une famille. Yd1 demande le croisement de deux phases, Yd0 n'existe pas.",
        resume: "Familles d'indices",
      },
    ],
    { titre: "Dix questions sur les transformateurs triphasés" }
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
      { categorie: "Principe", question: "D'où vient le déphasage d'un transformateur triphasé ?", reponse: "Des couplages : sur une colonne, les deux enroulements sont en phase, mais l'un peut porter une tension simple et l'autre une tension composée, décalée de $30^\\circ$." },
      { categorie: "Couplages", question: "Quelle tension et quel courant porte un enroulement en triangle ?", reponse: "La tension composée $U$ et le courant $I/\\sqrt{3}$ ; en étoile, $U/\\sqrt{3}$ et $I$. La puissance d'un enroulement vaut toujours $S_n/3$." },
      { categorie: "Désignation", question: "Que signifient les lettres de Dyn11 ?", reponse: "D : triangle côté haute tension ; y : étoile côté basse tension ; n : neutre basse tension sorti ; 11 : indice horaire." },
      { categorie: "Indice", question: "Comment lit-on l'indice horaire ?", reponse: "$\\underline{V}_A$ sur 12 heures ; $\\underline{V}_a$ tombe sur $h$ : la basse tension est en retard de $h \\times 30^\\circ$.", rappel: "Dyn11 : retard de $330^\\circ$, soit avance de $30^\\circ$." },
      { categorie: "Rapport", question: "Quel est le rapport des tensions d'un Dy en fonction des spires ?", reponse: "$U_2/U_1 = \\sqrt{3}\\,N_2/N_1$.", rappel: "Poste : $m = 0{,}020\\,5$ mais $N_2/N_1 = 0{,}011\\,84$." },
      { categorie: "Zigzag", question: "Quels sont le prix et l'intérêt du zigzag ?", reponse: "$15{,}5\\ \\%$ de spires en plus pour la même tension ; en échange, les ampères-tours homopolaires se compensent sur chaque colonne." },
      { categorie: "Homopolaire", question: "Pourquoi un Yyn supporte-t-il mal une charge monophasée ?", reponse: "L'étoile haute tension sans neutre impose des courants de somme nulle : $N_2I_a/3$ restent non compensés sur chaque colonne, d'où un flux homopolaire par la cuve et un déplacement du neutre." },
      { categorie: "Parallèle", question: "Quelles sont les conditions indispensables d'une mise en parallèle ?", reponse: "Même ordre des phases, même indice horaire, même rapport et même prise. L'écart de $u_{cc}$ et de puissance relève des règles de conception." },
      { categorie: "Parallèle", question: "Comment se partage la charge entre deux transformateurs en parallèle ?", reponse: "En raison inverse des impédances de court-circuit : $S_1 = S\\,|\\underline{Z}_2/(\\underline{Z}_1 + \\underline{Z}_2)|$ ; le plus faible $u_{cc}$ atteint le premier sa pleine charge." },
      { categorie: "Parallèle", question: "Que provoque un écart de prise de $2{,}5\\ \\%$ entre deux appareils identiques de $4\\ \\%$ ?", reponse: "Un courant de circulation d'environ $2{,}44/8 = 30\\ \\%$ du courant assigné, présent même à vide." },
    ],
    { titre: "Dix cartes sur les transformateurs triphasés" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

function dessinBodeRevision() {
  const pts = [];
  for (let i = 0; i <= 60; i += 1) {
    const f = Math.pow(10, 1 + (i / 60) * 3);
    const g = -10 * Math.log10(1 + Math.pow(f / 1000, 2));
    pts.push((40 + (i / 60) * 300).toFixed(1) + " " + (30 - g * 3.2).toFixed(1));
  }
  const x5 = 40 + (Math.log10(5000) - 1) * 100;
  const y5 = 30 + 14.15 * 3.2;
  return (
    TRAITS + ' stroke-width="1.2"><path d="M40 20V170H350"/><path d="M240 20V170M' + x5.toFixed(1) + ' 20V170" stroke-dasharray="3 4"/></g>' +
    TRAITS + ' stroke-width="2.6"><path d="M' + pts.join(" L") + '"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="' + x5.toFixed(1) + '" cy="' + y5.toFixed(1) + '" r="4.5"/></g>' +
    ECRITS + texte(234, 188, "1 kHz") + texte(x5 - 14, 188, "5 kHz") + texte(x5 + 8, y5 - 6, "-14,15 dB") + texte(380, 50, "G = 1 / √(1 + 25)") + texte(380, 72, "= 0,196") + texte(380, 94, "20 log 0,196") + texte(380, 116, "= -14,15 dB") + "</g>"
  );
}

const VISUELS_REVISION = [
  {
    viewBox: "0 0 520 200",
    dessin:
      "<defs>" + marqueur("fl-r1") + "</defs>" +
      TRAITS + ' stroke-width="2"><path d="M130 170V97" marker-end="url(#fl-r1)"/><path d="M130 95L67 58.5" stroke-dasharray="7 4" marker-end="url(#fl-r1)"/></g>' +
      TRAITS + ' stroke-width="3"><path d="M130 170L66.5 60" marker-end="url(#fl-r1)"/></g>' +
      ECRITS + texte(138, 140, "N/2, col. 1") + texte(104, 60, "N/2, col. 2 inversée") + texte(40, 130, "phase a") +
      texte(290, 60, "deux demi-tensions à 60°") + texte(290, 82, "résultante : 0,866 × somme") + texte(290, 112, "spires en plus : 1 / 0,866 - 1") + texte(290, 134, "= 15,47 %") + "</g>",
    legende: "Deux demi-tensions de même module, décalées de 60 degrés une fois la seconde inversée, donnent une résultante de 0,866 fois leur somme arithmétique.",
  },
  {
    viewBox: "0 0 520 220",
    dessin: dessinTriangleCourants("1,18 A", "1,18 A", { seulCol1: true, l1: "charge sur a seule : 100 A", l2: "colonne 1 seule : J_AB = 1,18 A", l3: "sort par A et revient par B", l4: "ligne C : aucun courant" }),
    legende: "En Dyn11, une charge monophasée sur la phase a ne sollicite que l'enroulement de la colonne 1, relié aux lignes A et B.",
  },
  {
    viewBox: "0 0 560 150",
    dessin: dessinBarres(
      [
        { nom: "T1, 400 kVA, 4 %", valeur: 97.7, max: 100, texte: "97,7 %" },
        { nom: "T2, 630 kVA, 6 %", valeur: 65.2, max: 100, texte: "65,2 %" },
      ],
      { pied: "sous 800 kVA ; tirets : pleine charge" }
    ),
    legende: "Taux de charge sous 800 kVA : le partage suit l'inverse des tensions de court-circuit, non les puissances assignées.",
  },
  {
    viewBox: "0 0 520 140",
    dessin: dessinEtapes(["par phase : P / 3 = 496,7 W", "I = 2,887 A (ligne = étoile équivalente)", "R = 496,7 / 2,887² = 59,6 Ω", "côté HT, à 22 °C"], 500),
    legende: "Étapes du calcul de la résistance série par phase d'étoile équivalente.",
  },
  {
    viewBox: "0 0 660 150",
    dessin: dessinBarres(
      [
        { nom: "côté BT : 410 V", valeur: 410, max: 20000, texte: "2,2 A, source facile" },
        { nom: "côté HT : 20 kV", valeur: 20000, max: 20000, texte: "45 mA sous 20 kV" },
      ],
      { pied: "même puissance d'essai, 1,56 kVA : la tension décide" }
    ),
    legende: "L'essai à vide demande la tension assignée de l'enroulement alimenté : 410 V côté basse tension contre 20 kV côté haute tension.",
  },
  {
    viewBox: "0 0 560 200",
    dessin: dessinBodeRevision(),
    legende: "Gain du passe-bas du premier ordre de 1 kHz : à 5 kHz, le point se trouve à -14,15 dB.",
  },
  {
    viewBox: "0 0 520 200",
    dessin:
      TRAITS + ' stroke-width="1.2"><path d="M40 20V170H330"/></g>' +
      TRAITS + ' stroke-width="2.6"><path d="M40 136L330 52"/></g>' +
      '<g fill="currentColor" stroke="none"><circle cx="102" cy="118" r="4.5"/><circle cx="257" cy="73" r="4.5"/></g>' +
      ECRITS + texte(92, 188, "22 °C") + texte(246, 188, "75 °C") + texte(110, 112, "80,4 Ω") + texte(200, 64, "96,98 Ω") +
      texte(350, 60, "R75 = R22 × (235 + 75)") + texte(350, 82, "        / (235 + 22)") + texte(350, 104, "= 80,4 × 1,206") + texte(350, 126, "= 96,98 Ω") + "</g>",
    legende: "Droite de la résistance du cuivre en fonction de la température : de 80,4 ohms à 22 degrés à 96,98 ohms à 75 degrés.",
  },
];

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. De combien de pour cent faut-il augmenter le nombre de spires d'un enroulement basse tension en zigzag, par rapport à une étoile, pour obtenir la même tension ?</p>",
        valeur: 100 * (2 / RAC3 - 1),
        unite: "%",
        tolerance: 0.02,
        chiffres: 2,
        explication: "La tension d'une phase en zigzag vaut $\\sqrt{3}/2 = 0{,}866$ fois la somme arithmétique des deux demi-tensions : il faut $1/0{,}866 - 1 = 15{,}47\\ \\%$ de spires en plus.",
        resume: "Surcroît de spires du zigzag",
      },
      {
        type: "qcm",
        enonce: repere(1) + "<p>Cette séance. En Dyn11, une charge est branchée entre la phase a et le neutre, les autres phases étant à vide. Quelles lignes haute tension portent un courant ?</p>",
        options: ["A et B", "A seulement", "A, B et C", "Aucune"],
        bonnes: [0],
        explication: "Seul l'enroulement de la colonne 1, relié entre A et B, compense la charge : $1{,}18\\ \\mathrm{A}$ pour $100\\ \\mathrm{A}$ côté basse tension, sur A et B.",
        resume: "Charge monophasée vue de la haute tension",
      },
      {
        type: "vraiFaux",
        enonce: repere(2) + "<p>Cette séance. Deux transformateurs de même indice et de même rapport, de tensions de court-circuit $4\\ \\%$ et $6\\ \\%$, se partagent la charge au prorata de leurs puissances assignées.</p>",
        reponse: false,
        explication: "Le partage suit l'inverse des tensions de court-circuit : sous $800\\ \\mathrm{kVA}$, le $400\\ \\mathrm{kVA}$ à $4\\ \\%$ est à $97{,}7\\ \\%$ et le $630\\ \\mathrm{kVA}$ à $6\\ \\%$ à $65{,}2\\ \\%$.",
        resume: "Partage de la charge",
      },
      {
        type: "calcul",
        enonce:
          repere(3) + "<p>Cours <a href=\"#/cours/essais-a-vide-et-en-court-circuit\">Essais à vide et en court-circuit</a>. Un essai en court-circuit triphasé donne $1490\\ \\mathrm{W}$ au courant de ligne de $2{,}887\\ \\mathrm{A}$. Quelle est la résistance série par phase d'étoile équivalente, en ohms ?</p>",
        valeur: 1490 / (3 * 2.887 * 2.887),
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$R = P/(3I^2) = 1490/(3 \\times 2{,}887^2) = 59{,}6\\ \\Omega$, vue de la haute tension, à la température d'essai.",
        resume: "Résistance série par phase",
      },
      {
        type: "qcm",
        enonce:
          repere(4) + "<p>Cours <a href=\"#/cours/essais-a-vide-et-en-court-circuit\">Essais à vide et en court-circuit</a>. Pourquoi l'essai à vide d'un transformateur $20\\ \\mathrm{kV} / 410\\ \\mathrm{V}$ se fait-il habituellement côté basse tension ?</p>",
        options: [
          "Il faut la tension assignée de l'enroulement alimenté, et 410 V se produisent bien plus facilement que 20 kV",
          "Le courant à vide serait trop fort côté haute tension",
          "Les pertes fer n'existent que côté basse tension",
          "Le rapport de transformation serait inversé",
        ],
        bonnes: [0],
        explication: "La puissance d'essai est la même des deux côtés ; seule change la tension à produire. Le courant à vide vu de la haute tension n'est que de $45\\ \\mathrm{mA}$.",
        resume: "Côté alimenté à vide",
      },
      {
        type: "calcul",
        enonce:
          repere(5) + "<p>Cours <a href=\"#/cours/filtres-passifs\">Filtres passifs</a>. Un filtre passe-bas du premier ordre a une fréquence de coupure de $1\\ \\mathrm{kHz}$. Quelle atténuation apporte-t-il à $5\\ \\mathrm{kHz}$, en décibels ?</p>",
        valeur: 10 * Math.log10(26),
        unite: "dB",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$|H| = 1/\\sqrt{1 + 5^2} = 0{,}196$, soit $20\\log_{10}(0{,}196) = -14{,}15\\ \\mathrm{dB}$ : atténuation de $14{,}15\\ \\mathrm{dB}$.",
        resume: "Atténuation d'un passe-bas",
      },
      {
        type: "calcul",
        enonce:
          repere(6) + "<p>Cours <a href=\"#/cours/loi-d-ohm-et-resistivite\">Loi d'Ohm et résistivité</a>. Un enroulement en cuivre mesure $80{,}4\\ \\Omega$ à $22\\ ^\\circ\\mathrm{C}$. Quelle est sa résistance à $75\\ ^\\circ\\mathrm{C}$, en ohms ?</p>",
        valeur: (80.4 * 310) / 257,
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$R_{75} = 80{,}4 \\times (235 + 75)/(235 + 22) = 80{,}4 \\times 1{,}206 = 96{,}98\\ \\Omega$.",
        resume: "Résistance en fonction de la température",
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
    titre: "Où en suis-je sur les transformateurs triphasés ?",
  });
  if (auto) ressources.push(auto);
}
