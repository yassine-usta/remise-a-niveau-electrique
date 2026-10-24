/* ==========================================================================
   cours/autotransformateurs-tc-et-tp/cours.js
   Autotransformateurs, TC et TP : puissance propre d'un autotransformateur,
   transformateur de courant comme source de courant, polarités, erreurs et
   charge, saturation et secondaire ouvert, choix d'un TC pour l'arrivée du
   tableau général et le départ de la pompe du site.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];
let compteurMarqueurs = 0;

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const RAC2 = Math.SQRT2;
const RAC3 = Math.sqrt(3);
const MU0 = 4e-7 * Math.PI;
const OMEGA = 2 * Math.PI * 50;

/* TC d'étude 150/5 A : tore et secondaire, hypothèses du cours. */
const TC = { N1: 1, N2: 30, K: 30, A: 7.5e-4, l: 0.3, mur: 5e4, Bs: 1.5, musat: 5, Rct: 0.1, Rf: 120, I2n: 5 };
TC.Xm = (OMEGA * MU0 * TC.mur * TC.N2 * TC.N2 * TC.A) / TC.l;
TC.Hk = TC.Bs / (MU0 * TC.mur);

/* Autotransformateur de l'animation : 50 kVA triphasé sous 400 V. */
const AUTO = { S: 50e3, U1: 400 };
AUTO.I1 = AUTO.S / (RAC3 * AUTO.U1);

/* --------------------------------------------------------------------------
   Nombres complexes
   -------------------------------------------------------------------------- */

const C = {
  n: (re, im = 0) => ({ re, im }),
  add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  div: (a, b) => {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  },
  k: (a, k) => ({ re: a.re * k, im: a.im * k }),
  abs: (a) => Math.hypot(a.re, a.im),
  arg: (a) => Math.atan2(a.im, a.re),
};

/** Erreurs du TC au courant assigné, modèle linéaire, charge Sb (VA) de facteur de puissance cosb. */
function erreursTC(Sb, cosb) {
  const Rb = Sb / (TC.I2n * TC.I2n);
  const sinb = Math.sqrt(Math.max(0, 1 - cosb * cosb));
  const Z = C.n(TC.Rct + Rb * cosb, Rb * sinb);
  const I2 = C.n(TC.I2n);
  const E = C.mul(Z, I2);
  const Y = C.n(1 / TC.Rf, -1 / TC.Xm);
  const I0 = C.mul(E, Y);
  const I1K = C.add(I2, I0);
  return {
    Rb,
    Z,
    E,
    I0,
    I1K,
    eps: ((C.abs(I2) - C.abs(I1K)) / C.abs(I1K)) * 100,
    delta: ((C.arg(I2) - C.arg(I1K)) / DEG) * 60,
  };
}

/* --------------------------------------------------------------------------
   Modèle temporel du TC : noyau linéaire puis saturé, résolution implicite
   -------------------------------------------------------------------------- */

function champ(B) {
  if (Math.abs(B) <= TC.Bs) return B / (MU0 * TC.mur);
  const s = B > 0 ? 1 : -1;
  return s * (TC.Hk + (Math.abs(B) - TC.Bs) / (MU0 * TC.musat));
}

function induction(H) {
  if (Math.abs(H) <= TC.Hk) return H * MU0 * TC.mur;
  const s = H > 0 ? 1 : -1;
  return s * (TC.Bs + (Math.abs(H) - TC.Hk) * MU0 * TC.musat);
}

/**
 * Une période en régime établi. I1 : courant primaire efficace (A) ;
 * Rb : charge extérieure (ohms), ou null pour un secondaire ouvert.
 */
function simulerTC(I1, Rb) {
  const n = 20000;
  const dt = 0.02 / n;
  const Ipk = I1 * RAC2;
  const R = Rb == null ? null : TC.Rct + Rb;
  let B;
  if (R == null) B = induction(0);
  else B = -Math.min((R * Ipk) / TC.K / (TC.N2 * TC.A * OMEGA), TC.Bs);
  const t = [];
  const iid = [];
  const i2 = [];
  const e2 = [];
  let s2 = 0;
  let eMax = 0;
  let bMax = 0;
  for (let periode = 0; periode < 2; periode += 1) {
    for (let j = 0; j < n; j += 1) {
      const temps = (periode * n + j + 1) * dt;
      const i1 = Ipk * Math.sin(OMEGA * temps);
      let Bn;
      let courant;
      let tension;
      if (R == null) {
        Bn = induction((TC.N1 * i1) / TC.l);
        tension = (TC.N2 * TC.A * (Bn - B)) / dt;
        courant = 0;
      } else {
        const c = (dt * R) / (TC.N2 * TC.N2 * TC.A);
        let bas = -TC.Bs - 1;
        let haut = TC.Bs + 1;
        for (let k = 0; k < 40; k += 1) {
          const m = (bas + haut) / 2;
          const g = m - B - c * (TC.N1 * i1 - champ(m) * TC.l);
          if (g > 0) haut = m;
          else bas = m;
        }
        Bn = (bas + haut) / 2;
        courant = (TC.N1 * i1 - champ(Bn) * TC.l) / TC.N2;
        tension = R * courant;
      }
      B = Bn;
      if (periode === 1) {
        t.push(j * dt * 1000);
        iid.push(i1 / TC.K);
        i2.push(courant);
        e2.push(tension);
        s2 += courant * courant;
        eMax = Math.max(eMax, Math.abs(tension));
        bMax = Math.max(bMax, Math.abs(Bn));
      }
    }
  }
  return { t, iid, i2, e2, I2: Math.sqrt(s2 / n), Iid: I1 / TC.K, eMax, bMax };
}

/** Réduit une série à environ 2 points par case en conservant les extrêmes. */
function reduire(t, y, cases = 700) {
  const points = [];
  const pas = Math.max(1, Math.floor(t.length / cases));
  for (let i = 0; i < t.length; i += pas) {
    let iMin = i;
    let iMax = i;
    for (let j = i; j < Math.min(t.length, i + pas); j += 1) {
      if (y[j] < y[iMin]) iMin = j;
      if (y[j] > y[iMax]) iMax = j;
    }
    const a = Math.min(iMin, iMax);
    const b = Math.max(iMin, iMax);
    points.push([t[a], y[a]]);
    if (b !== a) points.push([t[b], y[b]]);
  }
  return points;
}

/* --------------------------------------------------------------------------
   Limites d'erreur des classes de mesure (interpolation linéaire)
   -------------------------------------------------------------------------- */

const CLASSE_05 = [[5, 1.5], [20, 0.75], [100, 0.5], [120, 0.5]];
const CLASSE_05S = [[1, 1.5], [5, 0.75], [20, 0.5], [100, 0.5], [120, 0.5]];

function limite(points, p) {
  if (p < points[0][0] || p > points[points.length - 1][0]) return NaN;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [a, ea] = points[i];
    const [b, eb] = points[i + 1];
    if (p >= a && p <= b) return ea + ((eb - ea) * (p - a)) / (b - a);
  }
  return NaN;
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
    const w = Math.max(1, Math.min(1.25, Math.abs(barre.valeur) / barre.max) * l);
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

/** TC à primaire traversant, petit format, avec valeurs. */
function dessinPetitTC(lignes, options = {}) {
  const id = nouveauMarqueur("fl-ptc");
  return (
    "<defs>" + marqueur(id) + "</defs>" +
    TRAITS + ' stroke-width="4"><path d="M20 70H250"/></g>' +
    TRAITS + ' stroke-width="2"><ellipse cx="135" cy="70" rx="16" ry="42"/><path d="M125 108V150M145 108V150M125 150H110V180H160V150H145"/>' +
    '<circle cx="135" cy="180" r="14"/></g>' +
    TRAITS + ' stroke-width="1.6"><path d="M40 50H90" marker-end="url(#' + id + ')"/><path d="M110 120V146" marker-end="url(#' + id + ')"/></g>' +
    ECRITS + texte(20, 92, options.p1 || "P1") + texte(226, 92, options.p2 || "P2") + texte(48, 42, options.i1 || "i1") +
    texte(98, 116, "S1") + texte(150, 116, "S2") + texte(130, 185, "A") + texte(84, 138, options.i2 || "i2") +
    lignes.map((ligne, i) => texte(280, 40 + i * 22, ligne)).join("") + "</g>"
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
  construireAnimAuto(racine, api);
  construireAnimPolarite(racine, api);
  construireAnimFresnel(racine, api);
  construireSimSaturation(racine, api);
  construireSimChoix(racine, api);
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
    ["#d-sources-figure svg", 1.6],
    ["#e-auto-figure svg", 1.6],
    ["#e-tc-figure svg", 1.8],
    ["#e-tp-figure svg", 1.6],
    ["#f-schema-principal svg", 2],
    ["#h-donnees-figure svg", 1.5],
    ["#i-bornier-figure svg", 1.5],
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
      id: "c-amperes-tours",
      titre: "Compensation des ampères-tours",
      niveau: "prérequis",
      enonce:
        "<p>Un tore porte un primaire d'une spire, parcouru par $150\\ \\mathrm{A}$, et un secondaire de $30$ spires refermé sur une " +
        "impédance négligeable. En supposant le noyau parfait, quel courant circule dans le secondaire ?</p>",
      valeur: 150 / 30,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant secondaire $I_2$",
      etapes: [
        { texte: "Noyau parfait : le flux ne demande aucun ampère-tour, donc $N_1 I_1 = N_2 I_2$." },
        { texte: "$I_2 = N_1 I_1/N_2 = 1 \\times 150/30 = 5\\ \\mathrm{A}$." },
        { texte: "C'est exactement un transformateur de courant $150/5\\ \\mathrm{A}$ : son rapport est le rapport inverse des spires.", note: "Le noyau réel demande un petit courant magnétisant, source de l'erreur du TC." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 220",
          dessinPetitTC(["N1 = 1 spire, 150 A", "N2 = 30 spires", "N1 I1 = N2 I2", "I2 = 150 / 30 = 5 A"], { i1: "150 A", i2: "5 A" }),
          "Tore traversé par le conducteur primaire, une spire, et secondaire de 30 spires fermé sur un ampèremètre : les ampères-tours se compensent, d'où 5 A au secondaire."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-faraday",
      titre: "Tension d'une variation rapide de flux",
      niveau: "prérequis",
      enonce:
        "<p>Le flux dans un noyau passe de $-1\\ \\mathrm{mWb}$ à $+1\\ \\mathrm{mWb}$ en $0{,}2\\ \\mathrm{ms}$, à vitesse constante. Quelle " +
        "tension apparaît aux bornes d'un enroulement de $30$ spires ?</p>",
      valeur: (30 * 2e-3) / 0.2e-3,
      unite: "V",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "Tension $e$",
      etapes: [
        { texte: "Loi de Faraday : $e = N\\,\\Delta\\Phi/\\Delta t$ pour une variation à vitesse constante." },
        { texte: "$\\Delta\\Phi = 2\\ \\mathrm{mWb}$, $\\Delta t = 0{,}2\\ \\mathrm{ms}$ : $e = 30 \\times 2 \\times 10^{-3}/0{,}2 \\times 10^{-3} = 300\\ \\mathrm{V}$." },
        { texte: "Une petite variation de flux suffit si elle est brève : c'est le mécanisme du secondaire de TC ouvert.", note: "La même variation en $10\\ \\mathrm{ms}$ ne donnerait que $6\\ \\mathrm{V}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 200",
          TRAITS + ' stroke-width="1.2"><path d="M40 20V180M40 100H300"/></g>' +
            TRAITS + ' stroke-width="2.6"><path d="M40 150H140L170 50H300"/></g>' +
            TRAITS + ' stroke-width="2.6" stroke-dasharray="7 4"><path d="M40 170H140V130H170V170H300"/></g>' +
            ECRITS + texte(46, 34, "Φ : +1 mWb") + texte(46, 146, "-1 mWb") + texte(130, 196, "0,2 ms") + texte(176, 126, "e = 300 V") +
            texte(330, 50, "Φ en trait plein") + texte(330, 72, "e en tirets") + texte(330, 104, "e = N ΔΦ / Δt") + texte(330, 126, "= 30 × 2 mWb / 0,2 ms") + texte(330, 148, "= 300 V") + "</g>",
          "Chronogramme : le flux, trait plein, bascule de -1 à +1 mWb en 0,2 ms ; la tension, en tirets, forme un créneau de 300 V pendant ce basculement."
        );
      },
    })
  );

  ressources.push(
    api.exercice.qcm("#c-minitest", {
      id: "c-vide",
      titre: "Transformateur de puissance à vide",
      niveau: "prérequis",
      enonce:
        "<p>Un transformateur de puissance est alimenté sous sa tension assignée. On ouvre son secondaire. Que devient le flux " +
        "dans le noyau ?</p>",
      options: [
        { texte: "Il reste à peu près le même, puisqu'il est imposé par la tension primaire.", juste: true },
        { texte: "Il devient nul, faute de courant secondaire." },
        { texte: "Il augmente jusqu'à la saturation." },
        { texte: "Il double." },
      ],
      etapes: [
        { texte: "$v_1 = N_1\\,\\mathrm{d}\\Phi/\\mathrm{d}t$ : la tension imposée fixe le flux, que le secondaire soit chargé ou non." },
        { texte: "Le courant primaire se réduit au courant magnétisant : l'essai à vide n'a rien de dangereux." },
        { texte: "Dans un TC, c'est le courant primaire qui est imposé, non la tension : l'ouverture du secondaire a un tout autre effet.", note: "C'est la dualité entre source de tension et source de courant de la section D." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 600 150",
          dessinBarres(
            [
              { nom: "transfo, vide", valeur: 100, max: 100, texte: "flux inchangé : imposé par v1" },
              { nom: "TC, ouvert", valeur: 125, max: 100, texte: "flux saturé : imposé par i1" },
            ],
            { x0: 150, l: 260, pied: "tirets : flux normal de service" }
          ),
          "Comparaison du flux après ouverture du secondaire : inchangé dans un transformateur de puissance, porté à la saturation dans un TC."
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : où passe la puissance d'un autotransformateur
   -------------------------------------------------------------------------- */

function construireAnimAuto(racine, api) {
  const conteneur = racine.querySelector("#d-auto");
  if (!conteneur) return;
  const etat = { k: 0.9, wt: 0 };
  const DEPART_WT = 90;
  const X = 170;
  const YA = 50;
  const YN = 340;
  const L = YN - YA;
  const yPrise = (k) => YN - k * L;
  const regle = { de: { x: 215, y: yPrise(0.2) }, a: { x: 215, y: YA } };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 400",
    role: "img",
    "aria-label": "Une phase d'autotransformateur abaisseur avec prise réglable, courants instantanés d'entrée, de sortie et de l'enroulement commun, et comparaison des puissances transmises par conduction et par induction",
  });
  const idm = nouveauMarqueur("fl-d-au");
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(idm);
  const fixes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" });
  let t = "M" + X + " " + YA + "H60V175M60 215V" + YN + "H" + X;
  t += "M" + regle.de.x + " " + regle.de.y + "V" + regle.a.y;
  for (const k of [0.2, 0.5, 0.9, 1]) t += "M" + (regle.de.x - 5) + " " + yPrise(k).toFixed(1) + "h10";
  fixes.innerHTML =
    '<path d="' + t + '"/><circle cx="60" cy="195" r="20"/><path d="M49 195q5.5 -8 11 0t11 0"/>' +
    '<path d="M196 56V334M202 56V334" stroke-width="3"/><path d="M330 326V' + YN + "H" + X + '"/>' +
    '<rect x="318" y="296" width="24" height="30" rx="3"/>';
  const serie = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3.4 });
  const commune = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3.4, "stroke-dasharray": "8 5" });
  const sortie = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round" });
  const fleches = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "stroke-linecap": "round" });
  const barres = svgEl("g", { fill: "currentColor", "fill-opacity": 0.3, stroke: "currentColor", "stroke-width": 1.4 });
  const ecrits = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  ecrits.innerHTML =
    texte(98, 72, "A, 400 V") + texte(X + 8, YN + 18, "N, référence") + texte(20, 250, "source") +
    texte(346, 316, "charge") + texte(420, 340, "règle : k de 0,2, en bas, à 1, en haut") +
    texte(420, 358, "graduations : 0,2 ; 0,5 ; 0,9 ; 1") + texte(420, 60, "puissance transmise, 50 kVA :") + texte(420, 196, "barre pleine : conduction, k S") +
    texte(420, 214, "barre hachurée : induction, (1 - k) S") + texte(420, 250, "trait plein épais : partie série A-a") +
    texte(420, 268, "tirets épais : partie commune a-N") + texte(420, 304, "flèches : courants instantanés,") + texte(420, 322, "longueur proportionnelle");
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  const hachures = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1 });
  svg.append(defs, fixes, serie, commune, sortie, barres, hachures, fleches, ecrits, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-auto-valeurs", [
    { id: "k", libelle: "k = U2 / U1", decimales: 2 },
    { id: "u2", libelle: "U2 entre phases", unite: "V", decimales: 0 },
    { id: "i1", libelle: "I1, entrée", unite: "A", decimales: 2 },
    { id: "i2", libelle: "I2, sortie", unite: "A", decimales: 2 },
    { id: "ic", libelle: "Ic, partie commune", unite: "A", decimales: 2 },
    { id: "sp", libelle: "Puissance propre", unite: "kVA", decimales: 1 },
    { id: "part", libelle: "Part transmise par induction", unite: "%", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const k = etat.k;
    const yp = yPrise(k);
    serie.setAttribute("d", k < 0.995 ? "M" + X + " " + YA + "V" + yp.toFixed(1) : "");
    commune.setAttribute("d", "M" + X + " " + yp.toFixed(1) + "V" + YN);
    sortie.setAttribute("d", "M" + X + " " + yp.toFixed(1) + "H330V296");
    const I2 = AUTO.I1 / k;
    const Ic = I2 - AUTO.I1;
    const s = Math.sin(etat.wt * DEG);
    const lmax = 60;
    const l1 = lmax * (AUTO.I1 / I2) * s;
    const l2 = lmax * s;
    const lc = lmax * (Ic / I2) * s;
    let f = "";
    if (Math.abs(l1) > 3) f += '<path d="' + segment(115 - l1 / 2, YA - 14, 115 + l1 / 2, YA - 14) + '" marker-end="url(#' + idm + ')"/>';
    if (Math.abs(l2) > 3) f += '<path d="' + segment(290 - l2 / 2, yp - 14, 290 + l2 / 2, yp - 14) + '" marker-end="url(#' + idm + ')"/>';
    const yc = (yp + YN) / 2;
    if (Math.abs(lc) > 3) f += '<path d="' + segment(X - 24, yc + lc / 2, X - 24, yc - lc / 2) + '" marker-end="url(#' + idm + ')"/>';
    fleches.innerHTML = f;
    const x0 = 420;
    const lb = 260;
    barres.innerHTML =
      '<rect x="' + x0 + '" y="90" width="' + Math.max(1, lb * k).toFixed(1) + '" height="22" rx="2"/>' +
      '<rect x="' + x0 + '" y="130" width="' + Math.max(1, lb * (1 - k)).toFixed(1) + '" height="22" rx="2" fill-opacity="0"/>';
    let h = "";
    for (let x = x0 + 6; x < x0 + lb * (1 - k); x += 8) h += "M" + x.toFixed(1) + " 152L" + Math.min(x + 10, x0 + lb * (1 - k)).toFixed(1) + " 130";
    hachures.innerHTML = '<path d="' + h + '"/>';
    libelles.innerHTML =
      texte(224, yp + 18, "a, " + nombre(api, 400 * k, 0) + " V") +
      texte(96, YA - 22, "i1") + texte(292, yp - 22, "i2") + texte(X - 52, yc + 4, "ic") +
      texte(x0 + lb * k + 8, 106, nombre(api, 50 * k, 1) + " kVA") +
      texte(x0 + lb * (1 - k) + 8, 146, nombre(api, 50 * (1 - k), 1) + " kVA");
    if (valeurs) {
      valeurs.maj({ k, u2: 400 * k, i1: AUTO.I1, i2: I2, ic: Ic, sp: 50 * (1 - k), part: 100 * (1 - k) });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: regle.de,
    a: regle.a,
    min: 0.2,
    max: 1,
    pas: 0.01,
    valeur: etat.k,
    libelle: "Position de la prise, rapport k",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.k = Number(mesure.valeur);
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const lecteur = api.sim.lecteur("#d-auto-lecteur", {
    de: 0,
    a: 360,
    duree: 6,
    boucle: true,
    auto: false,
    libelle: "Courants instantanés sur une période, ωt",
    rappel: (valeur) => {
      etat.wt = Number(valeur);
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.suivre(DEPART_WT);
  }
  etat.wt = DEPART_WT;
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Animation : polarités et signe de la puissance mesurée
   -------------------------------------------------------------------------- */

const CABLAGES = [
  { nom: "correct", s: 1, retourne: false, croise: false },
  { nom: "S1 et S2 inversés", s: -1, retourne: false, croise: true },
  { nom: "TC retourné", s: -1, retourne: true, croise: false },
  { nom: "TC retourné et S1, S2 inversés", s: 1, retourne: true, croise: true },
];

function construireAnimPolarite(racine, api) {
  const conteneur = racine.querySelector("#e-polarite");
  if (!conteneur) return;
  const etat = { c: 0, phi: 15.9, wt: 0 };
  const DEPART_WT = 60;
  const V = 230;
  const I = 108.2;
  const T0 = 400;
  const T1 = 700;
  const Y0 = 170;
  const AMP = 80;
  const versT = (d) => T0 + ((T1 - T0) * d) / 360;

  const svg = svgEl("svg", {
    viewBox: "0 0 720 330",
    role: "img",
    "aria-label": "Transformateur de courant sur la phase L1 raccordé à une centrale de mesure, courants instantanés primaire et secondaire, et chronogramme de la tension, du courant mesuré et de la puissance instantanée",
  });
  const idm = nouveauMarqueur("fl-e-po");
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(idm);
  const fixes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" });
  fixes.innerHTML =
    '<path d="M30 80H330" stroke-width="4.5"/><ellipse cx="180" cy="80" rx="14" ry="38"/>' +
    '<rect x="110" y="220" width="160" height="70" rx="6"/><path d="M170 118V140M192 118V140"/>';
  const axes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.55 });
  axes.innerHTML = '<path d="M' + T0 + " " + Y0 + "H" + (T1 + 8) + "M" + T0 + " " + (Y0 - AMP - 10) + "V" + (Y0 + AMP + 10) + '"/>';
  const fils = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" });
  const courbeV = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.4 });
  const courbeI = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3 });
  const courbeP = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-dasharray": "7 4" });
  const moyenne = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.4, "stroke-dasharray": "2 4" });
  const curseurT = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.2 });
  const fleches = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "stroke-linecap": "round" });
  const ecrits = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  ecrits.innerHTML =
    texte(20, 24, "L1 : source à gauche, départs à droite") + texte(130, 250, "centrale PM1") + texte(130, 270, "entrée de courant") +
    texte(132, 216, "I+") + texte(232, 216, "I-") + texte(T0, 40, "v : trait fin ; i mesuré : trait épais") + texte(T0, 58, "p = v i : tirets ; moyenne : pointillés") +
    texte(versT(360) - 16, Y0 + 18, "360°") + texte(T0, Y0 + AMP + 34, "ωt");
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, axes, fixes, fils, courbeV, courbeI, courbeP, moyenne, curseurT, fleches, ecrits, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-polarite-valeurs", [
    { id: "cablage", libelle: "Câblage", format: (v) => v },
    { id: "ilu", libelle: "Courant lu", unite: "A", decimales: 1 },
    { id: "preel", libelle: "Puissance réelle de la phase", unite: "kW", decimales: 2 },
    { id: "paff", libelle: "Puissance affichée", unite: "kW", decimales: 2 },
    { id: "diag", libelle: "Diagnostic", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function tracerCourbes() {
    const cab = CABLAGES[etat.c];
    const pv = [];
    const pi = [];
    const pp = [];
    for (let d = 0; d <= 360; d += 3) {
      const x = versT(d).toFixed(1);
      const v = Math.sin(d * DEG);
      const i = cab.s * Math.sin((d - etat.phi) * DEG);
      pv.push(x + " " + (Y0 - AMP * v).toFixed(1));
      pi.push(x + " " + (Y0 - AMP * 0.8 * i).toFixed(1));
      pp.push(x + " " + (Y0 - AMP * v * i).toFixed(1));
    }
    courbeV.setAttribute("d", "M" + pv.join(" L"));
    courbeI.setAttribute("d", "M" + pi.join(" L"));
    courbeP.setAttribute("d", "M" + pp.join(" L"));
    const m = (cab.s * Math.cos(etat.phi * DEG)) / 2;
    moyenne.setAttribute("d", "M" + T0 + " " + (Y0 - AMP * m).toFixed(1) + "H" + T1);
    /* Le fil de gauche porte S1, ou S2 si le TC est retourné ; il rejoint I+ quand ces deux écarts se compensent. */
    let d = "M170 140V168H150V220M192 140V180H250V220";
    if (cab.retourne !== cab.croise) d = "M170 140V168H250V220M192 140V180H150V220";
    fils.setAttribute("d", d);
  }

  function dessiner() {
    const cab = CABLAGES[etat.c];
    const s1 = Math.sin(etat.wt * DEG - etat.phi * DEG);
    const lp = 60 * s1;
    const li = 34 * s1;
    let f = "";
    if (Math.abs(lp) > 3) f += '<path d="' + segment(90 - lp / 2, 54, 90 + lp / 2, 54) + '" marker-end="url(#' + idm + ')"/>';
    const li2 = li * cab.s;
    if (Math.abs(li2) > 3) f += '<path d="' + segment(136, 198 - li2 / 2, 136, 198 + li2 / 2) + '" marker-end="url(#' + idm + ')"/>';
    fleches.innerHTML = f;
    const xt = versT(etat.wt);
    curseurT.setAttribute("d", "M" + xt.toFixed(1) + " " + (Y0 - AMP - 6) + "V" + (Y0 + AMP + 6));
    libelles.innerHTML =
      texte(cab.retourne ? 196 : 142, 112, "P1") + texte(cab.retourne ? 142 : 196, 112, "P2") +
      texte(cab.retourne ? 196 : 152, 152, "S1") + texte(cab.retourne ? 152 : 196, 152, "S2") +
      texte(60, 44, "i1") + texte(112, 202, "i") + texte(20, 316, cab.nom);
    const preel = (V * I * Math.cos(etat.phi * DEG)) / 1000;
    if (valeurs) {
      valeurs.maj({
        cablage: cab.nom,
        ilu: I,
        preel,
        paff: cab.s * preel,
        diag: cab.s > 0 ? "signe correct" : "puissance retournée : polarité à corriger",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-polarite-curseurs",
    [
      { id: "c", libelle: "Câblage du TC", min: 0, max: 3, pas: 1, valeur: etat.c, format: (v) => CABLAGES[Number(v)].nom },
      { id: "phi", libelle: "Déphasage de la charge φ", min: 0, max: 90, pas: 0.1, valeur: etat.phi, format: (v) => nombre(api, v, 1) + " °" },
    ],
    (lues) => {
      etat.c = Math.round(lues.c);
      etat.phi = Number(lues.phi);
      tracerCourbes();
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-polarite-lecteur", {
    de: 0,
    a: 360,
    duree: 6,
    boucle: true,
    auto: false,
    libelle: "Instant de la période, ωt",
    rappel: (valeur) => {
      etat.wt = Number(valeur);
      dessiner();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.suivre(DEPART_WT);
  }
  etat.wt = DEPART_WT;
  tracerCourbes();
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Animation : diagramme d'erreur du TC
   -------------------------------------------------------------------------- */

function construireAnimFresnel(racine, api) {
  const conteneur = racine.querySelector("#e-fresnel");
  if (!conteneur) return;
  const etat = { sb: 3.25, cos: 1 };
  const O = { x: 90, y: 190 };
  const ECH_I = 420 / TC.I2n;
  const LOUPE = 20;
  const ECH_E = 25;
  const OE = { x: 510, y: 150 };
  const regle = { de: { x: 90, y: 352 }, a: { x: 610, y: 352 } };
  const versR = (sb) => regle.de.x + ((regle.a.x - regle.de.x) * (sb - 0.5)) / 29.5;

  const svg = svgEl("svg", {
    viewBox: "0 0 720 400",
    role: "img",
    "aria-label": "Diagramme de Fresnel d'un transformateur de courant : courant secondaire de référence, tension interne, courant magnétisant agrandi et image du courant primaire, avec une règle pour régler la charge en voltampères",
  });
  const idm = nouveauMarqueur("fl-e-fr");
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(idm);
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.55 });
  let t = "M" + (O.x - 20) + " " + O.y + "H640M" + OE.x + " " + OE.y + "H" + (OE.x + 170) + "M" + regle.de.x + " " + regle.de.y + "H" + regle.a.x;
  for (const v of [0.5, 5, 10, 15, 20, 25, 30]) t += "M" + versR(v).toFixed(1) + " " + (regle.de.y - 5) + "v10";
  fond.innerHTML = '<path d="' + t + '"/><path d="M' + versR(1.25).toFixed(1) + " " + (regle.de.y - 18) + "v36M" + versR(5).toFixed(1) + " " + (regle.de.y - 18) + 'v36" stroke-dasharray="3 3" stroke-width="1.4"/>';
  const vI2 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3.4, "marker-end": "url(#" + idm + ")" });
  const vI1 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3, "stroke-dasharray": "8 5", "marker-end": "url(#" + idm + ")" });
  const vI0 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.6, "marker-end": "url(#" + idm + ")" });
  const vE = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-dasharray": "2 4", "marker-end": "url(#" + idm + ")" });
  const ecrits = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  ecrits.innerHTML =
    texte(20, 26, "TC 150/5 A au courant assigné, triangle d'erreur agrandi 20 fois") +
    texte(OE.x, OE.y + 20, "E2 : origine séparée") +
    texte(versR(0.5) - 8, regle.de.y + 24, "0,5") + texte(versR(5) - 6, regle.de.y + 24, "5") + texte(versR(15) - 8, regle.de.y + 24, "15") +
    texte(versR(30) - 8, regle.de.y + 24, "30 VA") + texte(versR(1.25) - 30, regle.de.y - 24, "25 %") + texte(versR(5) - 14, regle.de.y - 24, "100 %") +
    texte(regle.de.x, regle.de.y + 44, "charge du secondaire en VA, au courant de 5 A");
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(defs, fond, vE, vI2, vI0, vI1, ecrits, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-fresnel-valeurs", [
    { id: "sb", libelle: "Charge Sb", unite: "VA", decimales: 2 },
    { id: "zb", libelle: "Impédance Zb", unite: "Ω", decimales: 3 },
    { id: "e2", libelle: "Tension interne E2", unite: "V", decimales: 2 },
    { id: "i0", libelle: "Courant magnétisant I0", unite: "mA", decimales: 1 },
    { id: "eps", libelle: "Erreur de courant ε", unite: "%", decimales: 3 },
    { id: "delta", libelle: "Déphasage δ", unite: "min", decimales: 1 },
    { id: "verdict", libelle: "Classe 0,5 à 100 % de In", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const r = erreursTC(etat.sb, etat.cos);
    const p2 = { x: O.x + TC.I2n * ECH_I, y: O.y };
    const p1 = { x: p2.x + r.I0.re * ECH_I * LOUPE, y: p2.y - r.I0.im * ECH_I * LOUPE };
    const pe = { x: OE.x + r.E.re * ECH_E, y: OE.y - r.E.im * ECH_E };
    vI2.setAttribute("d", fleche(O, p2));
    vI1.setAttribute("d", fleche(O, p1));
    vI0.setAttribute("d", C.abs(r.I0) * ECH_I * LOUPE > 6 ? fleche(p2, p1) : "");
    vE.setAttribute("d", fleche(OE, pe));
    libelles.innerHTML =
      texte(p2.x - 30, p2.y - 10, "I2") + texte(p1.x + 8, p1.y + 4, "I1 / K") + texte((p2.x + p1.x) / 2 + 8, (p2.y + p1.y) / 2 - 4, "I0 × 20") +
      texte(pe.x + 6, pe.y - 8, "E2");
    const conforme = Math.abs(r.eps) <= 0.5 && Math.abs(r.delta) <= 30;
    const plage = etat.sb >= 1.25 && etat.sb <= 5;
    let verdict = conforme ? "respectée" : "dépassée";
    if (!plage) verdict += ", charge hors plage 25 à 100 %";
    if (valeurs) {
      valeurs.maj({
        sb: etat.sb,
        zb: r.Rb,
        e2: C.abs(r.E),
        i0: C.abs(r.I0) * 1000,
        eps: r.eps,
        delta: r.delta,
        verdict,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: regle.de,
    a: regle.a,
    min: 0.5,
    max: 30,
    pas: 0.25,
    valeur: etat.sb,
    unite: "VA",
    libelle: "Charge du secondaire en voltampères",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.sb = Number(mesure.valeur);
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-fresnel-curseurs",
    [{ id: "cos", libelle: "Facteur de puissance de la charge", min: 0.5, max: 1, pas: 0.01, valeur: etat.cos, format: (v) => nombre(api, v, 2) }],
    (lues) => {
      etat.cos = Number(lues.cos);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : saturation du TC et secondaire ouvert
   -------------------------------------------------------------------------- */

const COURANTS_PCT = [10, 20, 33.3, 50, 100, 120, 200, 500, 1000, 2300];
const CHARGES = [0.05, 0.13, 0.2, 0.5, 1, 2, 5, 20, null];

function texteCharge(api, rb) {
  return rb == null ? "ouvert" : nombre(api, rb, rb < 1 ? 2 : 0) + " Ω";
}

function construireSimSaturation(racine, api) {
  const etat = { ip: 4, rb: 1 };
  let resultat = null;
  let attente = 0;

  const traceI = api.sim.traceur("#e-sat-courants", {
    titre: "Courants du TC sur une période",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "courant",
    yUnite: "A",
    xMin: 0,
    xMax: 20,
    yMin: -8,
    yMax: 8,
    series: [
      { id: "reel", nom: "i2, réel, trait épais", couleur: "serie-5", epaisseur: 4.2, points: [] },
      { id: "ideal", nom: "i1 / K, idéal, trait fin", couleur: "serie-1", epaisseur: 1.6, points: [] },
    ],
    surDessin({ c, repere, couleurs }) {
      if (resultat) ligneH(c, repere, couleurs, resultat.Iid * RAC2, "crête idéale", false);
    },
  });
  if (traceI) ressources.push(traceI);

  const traceE = api.sim.traceur("#e-sat-tension", {
    titre: "Tension aux bornes du secondaire",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "e2",
    yUnite: "V",
    xMin: 0,
    xMax: 20,
    yMin: -2,
    yMax: 2,
    ratio: 0.36,
    series: [{ id: "e", nom: "e2", couleur: "serie-4", epaisseur: 2.2, points: [] }],
  });
  if (traceE) ressources.push(traceE);

  const valeurs = api.sim.valeurs("#e-sat-valeurs", [
    { id: "i1", libelle: "Courant primaire", unite: "A", decimales: 1 },
    { id: "iid", libelle: "i1 / K efficace", unite: "A", decimales: 3 },
    { id: "i2", libelle: "i2 efficace", unite: "A", decimales: 3 },
    { id: "err", libelle: "Écart", unite: "%", decimales: 2 },
    { id: "e", libelle: "Tension crête", unite: "V", decimales: 1 },
    { id: "b", libelle: "Induction crête", unite: "T", decimales: 2 },
    { id: "etat", libelle: "État du noyau", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function calculer() {
    attente = 0;
    const I1 = (COURANTS_PCT[etat.ip] / 100) * 150;
    const rb = CHARGES[etat.rb];
    resultat = simulerTC(I1, rb);
    const r = resultat;
    const crete = r.Iid * RAC2;
    if (traceI) {
      traceI.definirPlage({ yMin: -1.25 * crete, yMax: 1.25 * crete });
      traceI.definirDonnees("ideal", reduire(r.t, r.iid));
      traceI.definirDonnees("reel", reduire(r.t, r.i2));
    }
    if (traceE) {
      const m = Math.max(1, r.eMax * 1.15);
      traceE.definirPlage({ yMin: -m, yMax: m });
      traceE.definirDonnees("e", reduire(r.t, r.e2));
    }
    let texteEtat = "linéaire";
    if (rb == null) texteEtat = "secondaire ouvert, saturé";
    else if (r.bMax > TC.Bs * 0.999) texteEtat = "saturé à chaque demi-période";
    if (valeurs) {
      valeurs.maj({
        i1: I1,
        iid: r.Iid,
        i2: r.I2,
        err: ((r.I2 - r.Iid) / r.Iid) * 100,
        e: r.eMax,
        b: r.bMax,
        etat: texteEtat,
      });
    }
  }

  function planifier() {
    if (attente) return;
    if (typeof requestAnimationFrame === "function") attente = requestAnimationFrame(calculer);
    else calculer();
  }
  nettoyeursAnimation.push(() => {
    if (attente && typeof cancelAnimationFrame === "function") cancelAnimationFrame(attente);
    attente = 0;
  });

  const curseurs = api.sim.curseurs(
    "#e-sat-curseurs",
    [
      { id: "ip", libelle: "Courant primaire, en % de In = 150 A", min: 0, max: COURANTS_PCT.length - 1, pas: 1, valeur: etat.ip, format: (v) => nombre(api, COURANTS_PCT[Number(v)], COURANTS_PCT[Number(v)] % 1 ? 1 : 0) + " %" },
      { id: "rb", libelle: "Charge extérieure Rb", min: 0, max: CHARGES.length - 1, pas: 1, valeur: etat.rb, format: (v) => texteCharge(api, CHARGES[Number(v)]) },
    ],
    (lues) => {
      etat.ip = Math.round(lues.ip);
      etat.rb = Math.round(lues.rb);
      planifier();
    }
  );
  if (curseurs) ressources.push(curseurs);
  calculer();
}

/* --------------------------------------------------------------------------
   H. Simulation : choisir un TC
   -------------------------------------------------------------------------- */

const CALIBRES = [50, 60, 75, 100, 125, 150, 200, 250, 300, 400];
const SECTIONS = [1.5, 2.5, 4, 6];
const PRECISIONS = [1, 2.5, 5, 10, 15, 30];
const RHO = 0.0225;

function choixTC(p) {
  const In = CALIBRES[p.cal];
  const I2n = p.sec === 0 ? 1 : 5;
  const Rcable = (RHO * 2 * p.lg) / SECTIONS[p.sect];
  const Scables = Rcable * I2n * I2n;
  const Sb = Scables + 0.02 * I2n * I2n + p.app;
  const Sn = PRECISIONS[p.sn];
  const Sct = 2.5;
  const pmax = (100 * p.imax) / In;
  const pmin = (100 * p.imin) / In;
  return {
    In,
    I2n,
    Scables,
    Sb,
    Sn,
    pmax,
    pmin,
    taux: (100 * Sb) / Sn,
    fs: (5 * (Sct + Sn)) / (Sct + Sb),
    e05max: limite(CLASSE_05, pmax),
    e05min: limite(CLASSE_05, pmin),
    e05Smin: limite(CLASSE_05S, pmin),
  };
}

function construireSimChoix(racine, api) {
  const etat = { imax: 108.2, imin: 15, cal: 5, sec: 1, lg: 5, sect: 1, sn: 2, app: 0.5 };
  let r = choixTC(etat);

  const trace = api.sim.traceur("#h-sim-trace", {
    titre: "Limites d'erreur de courant et points de fonctionnement",
    xTitre: "courant primaire",
    xUnite: "% de In",
    yTitre: "erreur limite",
    yUnite: "%",
    xMin: 0,
    xMax: 150,
    yMin: 0,
    yMax: 2,
    echantillons: 600,
    series: [
      { id: "c05", nom: "classe 0,5", couleur: "serie-1", epaisseur: 2.6, fonction: (p) => limite(CLASSE_05, p) },
      { id: "c05s", nom: "classe 0,5S", couleur: "serie-5", epaisseur: 2.2, fonction: (p) => limite(CLASSE_05S, p) },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneV(c, repere, couleurs, Math.min(149, r.pmin), "I min " + nombre(api, r.pmin, 1) + " %", [5, 4]);
      ligneV(c, repere, couleurs, Math.min(149, r.pmax), "I max " + nombre(api, r.pmax, 1) + " %", [5, 4]);
      if (Number.isFinite(r.e05max)) pointTrace(c, repere, couleurs, r.pmax, r.e05max, "");
      if (Number.isFinite(r.e05min)) pointTrace(c, repere, couleurs, r.pmin, r.e05min, "");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#h-sim-valeurs", [
    { id: "tc", libelle: "TC", format: (v) => v },
    { id: "pmax", libelle: "I max / In", unite: "%", decimales: 1 },
    { id: "pmin", libelle: "I min / In", unite: "%", decimales: 1 },
    { id: "scab", libelle: "Câbles", unite: "VA", decimales: 2 },
    { id: "sb", libelle: "Charge totale", unite: "VA", decimales: 2 },
    { id: "taux", libelle: "Charge / puissance de précision", unite: "%", decimales: 0 },
    { id: "emax", libelle: "Limite classe 0,5 à I max", format: (v) => v },
    { id: "emin", libelle: "Limite à I min, 0,5 et 0,5S", format: (v) => v },
    { id: "fs", libelle: "Facteur de sécurité réel", decimales: 2 },
    { id: "verdict", libelle: "Verdict", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const pourcent = (x) => (Number.isFinite(x) ? nombre(api, x, 2) + " %" : "non garantie");

  function maj() {
    r = choixTC(etat);
    if (trace) trace.rafraichir();
    const remarques = [];
    if (r.pmax > 120) remarques.push("calibre trop faible");
    else if (r.pmax < 50) remarques.push("calibre surdimensionné");
    if (r.Sb > r.Sn) remarques.push("charge excessive");
    else if (r.Sb < 0.25 * r.Sn) remarques.push("puissance de précision trop élevée");
    if (r.pmin < 5) remarques.push(r.pmin >= 1 ? "classe S nécessaire à I min" : "I min non mesurable avec précision");
    if (valeurs) {
      valeurs.maj({
        tc: r.In + "/" + r.I2n + " A, " + nombre(api, r.Sn, r.Sn % 1 ? 1 : 0) + " VA",
        pmax: r.pmax,
        pmin: r.pmin,
        scab: r.Scables,
        sb: r.Sb,
        taux: r.taux,
        emax: pourcent(r.e05max),
        emin: pourcent(r.e05min) + " ; " + pourcent(r.e05Smin),
        fs: r.fs,
        verdict: remarques.length ? remarques.join(", ") : "choix cohérent",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#h-sim-curseurs",
    [
      { id: "imax", libelle: "Courant maximal de service", min: 10, max: 250, pas: 0.1, valeur: etat.imax, format: (v) => nombre(api, v, 1) + " A" },
      { id: "imin", libelle: "Courant minimal à mesurer", min: 1, max: 100, pas: 0.5, valeur: etat.imin, format: (v) => nombre(api, v, 1) + " A" },
      { id: "cal", libelle: "Calibre primaire", min: 0, max: CALIBRES.length - 1, pas: 1, valeur: etat.cal, format: (v) => CALIBRES[Number(v)] + " A" },
      { id: "sec", libelle: "Courant secondaire assigné", min: 0, max: 1, pas: 1, valeur: etat.sec, format: (v) => (Number(v) === 0 ? "1 A" : "5 A") },
      { id: "lg", libelle: "Longueur aller des câbles", min: 1, max: 60, pas: 1, valeur: etat.lg, format: (v) => nombre(api, v, 0) + " m" },
      { id: "sect", libelle: "Section des câbles", min: 0, max: SECTIONS.length - 1, pas: 1, valeur: etat.sect, format: (v) => nombre(api, SECTIONS[Number(v)], 1) + " mm²" },
      { id: "sn", libelle: "Puissance de précision", min: 0, max: PRECISIONS.length - 1, pas: 1, valeur: etat.sn, format: (v) => nombre(api, PRECISIONS[Number(v)], PRECISIONS[Number(v)] % 1 ? 1 : 0) + " VA" },
      { id: "app", libelle: "Consommation des appareils", min: 0.05, max: 2, pas: 0.05, valeur: etat.app, format: (v) => nombre(api, v, 2) + " VA" },
    ],
    (lues) => {
      etat.imax = Number(lues.imax);
      etat.imin = Number(lues.imin);
      etat.cal = Math.round(lues.cal);
      etat.sec = Math.round(lues.sec);
      etat.lg = Number(lues.lg);
      etat.sect = Math.round(lues.sect);
      etat.sn = Math.round(lues.sn);
      etat.app = Number(lues.app);
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
      id: "k-auto-propre",
      titre: "Puissance transmise par induction",
      niveau: "fondamental",
      enonce:
        "<p>Un autotransformateur triphasé abaisseur de $50\\ \\mathrm{kVA}$, $400\\ \\mathrm{V} / 360\\ \\mathrm{V}$, fonctionne à pleine charge. " +
        "Quelle puissance apparente traverse son circuit magnétique, c'est-à-dire sa puissance propre ?</p>",
      valeur: 50 * (1 - 360 / 400),
      unite: "kVA",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Puissance propre $S_{propre}$",
      etapes: [
        { texte: "$k = U_2/U_1 = 360/400 = 0{,}9$." },
        { texte: "$S_{propre} = (1 - k)\\,S = 0{,}1 \\times 50 = 5\\ \\mathrm{kVA}$ ; le reste, $45\\ \\mathrm{kVA}$, passe par conduction." },
        { texte: "Contrôle par l'enroulement série : $(400 - 360) \\times 72{,}17 \\times \\sqrt{3} = 5{,}0\\ \\mathrm{kVA}$.", note: "L'appareil a la taille d'un transformateur de $5\\ \\mathrm{kVA}$ à deux enroulements." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 600 150",
          dessinBarres(
            [
              { nom: "conduction", valeur: 45, max: 50, texte: "45 kVA = k S" },
              { nom: "induction", valeur: 5, max: 50, texte: "5 kVA = (1 - k) S" },
            ],
            { x0: 130, l: 300, pied: "tirets : 50 kVA transmis" }
          ),
          "Partage de la puissance transmise : 45 kVA par conduction directe, 5 kVA seulement par induction dans le noyau."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-courant-secondaire",
      titre: "Courant secondaire de l'arrivée",
      niveau: "fondamental",
      enonce: "<p>Un TC $150/5\\ \\mathrm{A}$ est placé sur une phase parcourue par $108{,}2\\ \\mathrm{A}$. Quel courant circule dans la centrale de mesure ?</p>",
      valeur: 108.2 / 30,
      unite: "A",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Courant secondaire $I_2$",
      etapes: [
        { texte: "Rapport assigné : $K = 150/5 = 30$." },
        { texte: "$I_2 = I_1/K = 108{,}2/30 = 3{,}607\\ \\mathrm{A}$." },
        { texte: "Le TC fonctionne à $72{,}1\\ \\%$ de son courant assigné : la centrale, réglée sur le rapport 30, affiche bien $108{,}2\\ \\mathrm{A}$.", note: "Une erreur de rapport programmée, 200/5 par exemple, ferait afficher $144{,}3\\ \\mathrm{A}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 560 220",
          dessinPetitTC(["K = 150 / 5 = 30", "I2 = 108,2 / 30", "   = 3,607 A", "72,1 % de In"], { i1: "108,2 A", i2: "3,607 A" }),
          "TC de rapport 30 sur une phase de 108,2 A : l'ampèremètre du secondaire voit 3,607 A."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-charge",
      titre: "Charge d'un TC éloigné de son appareil",
      niveau: "intermédiaire",
      enonce:
        "<p>Un TC à secondaire $5\\ \\mathrm{A}$ alimente un appareil de $0{,}5\\ \\mathrm{VA}$ situé à $15\\ \\mathrm{m}$, par deux conducteurs en cuivre de " +
        "$2{,}5\\ \\mathrm{mm^2}$, $\\rho = 0{,}022\\,5\\ \\Omega\\,\\mathrm{mm^2/m}$. Connexions négligées, quelle est la charge totale vue par le TC, en voltampères ?</p>",
      valeur: (0.0225 * 30) / 2.5 * 25 + 0.5,
      unite: "VA",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Charge totale $S_b$",
      etapes: [
        { texte: "Longueur aller et retour : $30\\ \\mathrm{m}$ ; $R = 0{,}022\\,5 \\times 30/2{,}5 = 0{,}270\\ \\Omega$." },
        { texte: "Câbles : $R\\,I_{2n}^2 = 0{,}270 \\times 25 = 6{,}75\\ \\mathrm{VA}$." },
        { texte: "Total : $6{,}75 + 0{,}5 = 7{,}25\\ \\mathrm{VA}$, plus qu'un TC de $5\\ \\mathrm{VA}$ ne peut porter dans sa classe." },
        { texte: "En $1\\ \\mathrm{A}$ : $0{,}270 \\times 1 + 0{,}5 = 0{,}77\\ \\mathrm{VA}$ avec un appareil de même consommation.", note: "Les câbles pèsent 25 fois moins : c'est la raison d'être du secondaire de 1 A." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 600 190",
          dessinBarres(
            [
              { nom: "câbles, 5 A", valeur: 6.75, max: 5, texte: "6,75 VA" },
              { nom: "appareil", valeur: 0.5, max: 5, texte: "0,5 VA" },
              { nom: "total, 5 A", valeur: 7.25, max: 5, texte: "7,25 VA : trop" },
              { nom: "total, 1 A", valeur: 0.77, max: 5, texte: "0,77 VA" },
            ],
            { x0: 130, l: 260, pied: "tirets : puissance de précision de 5 VA ; barres tronquées à 125 %" }
          ),
          "Décomposition de la charge : en 5 A, les câbles dominent et la charge dépasse 5 VA ; en 1 A, elle tombe sous 1 VA."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-alf",
      titre: "Facteur limite de précision réel",
      niveau: "intermédiaire",
      enonce:
        "<p>Un TC de protection $5\\mathrm{P}10$, $15\\ \\mathrm{VA}$, secondaire $5\\ \\mathrm{A}$, a une résistance interne $R_{ct} = 0{,}25\\ \\Omega$. Il alimente " +
        "un relais numérique et ses câbles, qui ne représentent que $3\\ \\mathrm{VA}$. Quel est son facteur limite de précision réel ?</p>",
      valeur: (10 * (6.25 + 15)) / (6.25 + 3),
      unite: "",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Facteur limite réel $F'$",
      etapes: [
        { texte: "Pertes internes : $S_{ct} = R_{ct}\\,I_{2n}^2 = 0{,}25 \\times 25 = 6{,}25\\ \\mathrm{VA}$." },
        { texte: "$F' = 10 \\times (6{,}25 + 15)/(6{,}25 + 3) = 10 \\times 21{,}25/9{,}25 = 22{,}97$." },
        { texte: "Le TC reste précis à $5\\ \\%$ jusqu'à environ $23$ fois son courant assigné, et non $10$ fois.", note: "Avec $30\\ \\mathrm{VA}$ réels, on tomberait à $F' = 5{,}9$ : le relais verrait mal un fort défaut." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Facteur limite réel en fonction de la charge réelle",
          xTitre: "charge réelle",
          xUnite: "VA",
          yTitre: "F'",
          xMin: 0,
          xMax: 40,
          yMin: 0,
          yMax: 36,
          series: [{ id: "f", nom: "F' = 10 (6,25 + 15) / (6,25 + S)", couleur: "serie-1", epaisseur: 2.6, fonction: (s) => (10 * 21.25) / (6.25 + s) }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 10, "facteur assigné 10", false);
            ligneV(c, repere, couleurs, 15, "15 VA", [2, 3]);
            pointTrace(c, repere, couleurs, 3, (10 * 21.25) / 9.25, "3 VA : F' = 22,97");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-ouvert",
      titre: "Tension d'un secondaire de TC ouvert",
      niveau: "avancé",
      enonce:
        "<p>Un TC $150/5\\ \\mathrm{A}$, $N_1 = 1$, $N_2 = 30$, a un tore de section $A = 7{,}5\\ \\mathrm{cm^2}$ et de longueur moyenne $l = 30\\ \\mathrm{cm}$, " +
        "de perméabilité relative $\\mu_r = 50\\,000$ jusqu'à $B_{sat} = 1{,}5\\ \\mathrm{T}$, puis saturé. On ouvre son secondaire sous $150\\ \\mathrm{A}$ " +
        "efficaces à $50\\ \\mathrm{Hz}$. Estimez la tension crête qui apparaît à ses bornes.</p>",
      valeur: (30 * 7.5e-4 * MU0 * 5e4 * 150 * RAC2 * OMEGA) / 0.3,
      unite: "V",
      tolerance: 0.03,
      chiffres: 0,
      libelleChamp: "Tension crête $e_{2,max}$",
      etapes: [
        { texte: "Ampères-tours de saturation : $H_{sat}\\,l = B_{sat}\\,l/(\\mu_0\\mu_r) = 1{,}5 \\times 0{,}3/(4\\pi \\times 10^{-7} \\times 50\\,000) = 7{,}16\\ \\mathrm{A}$." },
        { texte: "Pente du courant au passage par zéro : $\\sqrt{2} \\times 150 \\times 314{,}2 = 66\\,640\\ \\mathrm{A/s}$ ; basculement en $\\Delta t = 2 \\times 7{,}16/66\\,640 = 215\\ \\mu\\mathrm{s}$." },
        { texte: "Variation de flux : $\\Delta\\Phi = 2 \\times 1{,}5 \\times 7{,}5 \\times 10^{-4} = 2{,}25\\ \\mathrm{mWb}$." },
        { texte: "$e_{2,max} = N_2\\,\\Delta\\Phi/\\Delta t = 30 \\times 2{,}25 \\times 10^{-3}/215 \\times 10^{-6} = 314\\ \\mathrm{V}$.", note: "Proportionnelle au courant : environ $105\\ \\mathrm{V}$ sous $50\\ \\mathrm{A}$ et $7{,}2\\ \\mathrm{kV}$ sous $3445\\ \\mathrm{A}$ dans ce modèle." },
      ],
      visuelCorrection(conteneur, moteur) {
        const e150 = (30 * 7.5e-4 * MU0 * 5e4 * 150 * RAC2 * OMEGA) / 0.3;
        traceCorrection(moteur, conteneur, {
          titre: "Tension crête du secondaire ouvert en fonction du courant primaire",
          xTitre: "I1",
          xUnite: "A",
          yTitre: "e2 max",
          yUnite: "V",
          xMin: 0,
          xMax: 200,
          yMin: 0,
          yMax: 450,
          series: [{ id: "e", nom: "e2 max, modèle linéaire puis saturé", couleur: "serie-1", epaisseur: 2.6, fonction: (i) => (e150 * i) / 150 }],
          surDessin({ c, repere, couleurs }) {
            pointTrace(c, repere, couleurs, 50, e150 / 3, "pompe : 105 V");
            pointTrace(c, repere, couleurs, 150, e150, "150 A : 314 V");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Une puissance négative sur une seule phase",
      niveau: "diagnostic",
      enonce:
        "<p>Après le remplacement d'une centrale de mesure, l'arrivée affiche $P_1 = +7{,}1\\ \\mathrm{kW}$, $P_2 = -6{,}9\\ \\mathrm{kW}$ et $P_3 = +6{,}8\\ \\mathrm{kW}$, " +
        "soit $7{,}0\\ \\mathrm{kW}$ au total, alors que le compteur du distributeur indique environ $21\\ \\mathrm{kW}$. Les trois courants affichés sont " +
        "cohérents avec une pince de contrôle. Quelle est la cause la plus probable ?</p>",
      options: [
        { texte: "Les fils S1 et S2 du TC de la phase L2 ont été inversés au bornier.", juste: true },
        { texte: "Le TC de la phase L2 a un rapport différent des deux autres." },
        { texte: "Le secondaire du TC de la phase L2 est ouvert." },
        { texte: "La tension de la phase L2 est absente." },
      ],
      etapes: [
        { texte: "Les courants sont justes : le rapport est bon et le secondaire n'est pas ouvert, sinon le courant serait nul ou faux." },
        { texte: "Une tension absente donnerait une puissance nulle, non négative." },
        { texte: "Seul le signe de $P_2$ est faux : le courant de L2 arrive retourné, par inversion de S1 et S2 ou par un TC retourné." },
        { texte: "Puissance vraie : $7{,}1 + 6{,}9 + 6{,}8 = 20{,}8\\ \\mathrm{kW}$, conforme au compteur.", note: "Correction : court-circuiter le circuit de L2 au bornier avant de croiser les fils, jamais l'inverse." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 600 200",
          dessinBarres(
            [
              { nom: "P1", valeur: 7.1, max: 8, texte: "+7,1 kW" },
              { nom: "P2 affichée", valeur: 6.9, max: 8, texte: "-6,9 kW : signe retourné" },
              { nom: "P3", valeur: 6.8, max: 8, texte: "+6,8 kW" },
              { nom: "total vrai", valeur: 20.8, max: 8, texte: "20,8 kW au lieu de 7,0" },
            ],
            { x0: 140, l: 240, pied: "barres de longueur proportionnelle à la valeur absolue ; tirets : 8 kW" }
          ),
          "Puissances de phase affichées : les modules sont plausibles, seule la phase L2 a un signe négatif, signature d'une polarité inversée."
        );
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Pourquoi deux règles opposées",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi le secondaire d'un TC ne doit jamais être ouvert, alors que celui d'un TP ne doit jamais être " +
        "court-circuité.</p>",
      motsCles: [["source de courant", "courant impose", "impose le courant", "serie"], ["source de tension", "tension imposee", "impose la tension", "parallele"], ["satur", "flux", "faraday", "surtension", "tension elevee"], ["court-circuit", "courant eleve", "detrui", "fusible"]],
      minimum: 3,
      exemple: "Trois ou quatre phrases : dites ce qui est imposé à chaque appareil, et ce qui se passe quand on supprime la charge ou qu'on la réduit à zéro.",
      etapes: [
        { texte: "Le TC est en série : le courant primaire lui est imposé, son secondaire se comporte comme une source de courant." },
        { texte: "Ouvert, ce courant ne peut plus circuler au secondaire : il devient entièrement magnétisant, le noyau sature et le basculement du flux crée des pointes de tension par la loi de Faraday." },
        { texte: "Le TP est en parallèle : la tension lui est imposée, son secondaire se comporte comme une source de tension." },
        { texte: "Court-circuité, seule sa faible impédance interne limite le courant, qui détruit l'enroulement.", note: "Les deux règles sont duales, comme les deux modèles de source." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 600 150",
          dessinEtapes(["TC : source de courant, en série", "  ouverture : i2 = 0, i1 tout magnétisant, saturation, pointes", "TP : source de tension, en parallèle", "  court-circuit : courant limité par Z interne seule"], 580),
          "Dualité des deux appareils de mesure : ce qui est imposé décide de la situation interdite."
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

function dessinQuizTC() {
  const id = "fl-q-tc";
  return (
    "<defs>" + marqueur(id) + "</defs>" +
    TRAITS + ' stroke-width="4"><path d="M20 60H280"/></g>' +
    TRAITS + ' stroke-width="2"><ellipse cx="150" cy="60" rx="14" ry="36"/><path d="M138 94V140M162 94V140"/></g>' +
    TRAITS + ' stroke-width="1.6"><path d="M40 40H90" marker-end="url(#' + id + ')"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="138" cy="148" r="5"/><circle cx="162" cy="148" r="5"/></g>' +
    ECRITS + texte(24, 82, "P1") + texte(256, 82, "P2") + texte(52, 32, "i1") + texte(112, 176, "S1") + texte(170, 176, "S2") + "</g>"
  );
}

const VISUELS_QUIZ = [
  {
    viewBox: "0 0 600 150",
    dessin: dessinBarres(
      [
        { nom: "k = 0,9", valeur: 10, max: 100, texte: "10 % par induction" },
        { nom: "k = 0,5", valeur: 50, max: 100, texte: "50 % par induction" },
      ],
      { x0: 110, l: 300, pied: "tirets : transformateur à deux enroulements, 100 %" }
    ),
    legende: "Part de la puissance qui traverse le noyau : faible pour un rapport voisin de 1, d'où la compacité de l'autotransformateur.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["enroulement commun : liaison galvanique", "perte du neutre ou de la partie commune :", "  la borne BT passe au potentiel HT", "pas d'isolation : jamais en séparation"], 540),
    legende: "L'autotransformateur relie électriquement ses deux côtés par l'enroulement commun.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["ucc = (1 - k) ucc propre = 0,1 × 4 %", "    = 0,4 %", "Ik / In = 1 / 0,004 = 250", "réseau amont supposé infini"], 540),
    legende: "Calcul du courant de court-circuit d'un autotransformateur, étapes révélées une à une.",
  },
  {
    viewBox: "0 0 520 200",
    dessin:
      dessinQuizTC() + TRAITS + ' stroke-width="1.6"><path d="M138 156V188" marker-end="url(#fl-q-tc)"/></g>' +
      ECRITS + texte(300, 50, "i1 entre par P1") + texte(300, 72, "i2 sort par S1") + texte(300, 94, "dans le circuit extérieur") + "</g>",
    legende: "Convention de polarité : le courant secondaire sort par S1 quand le courant primaire entre par P1.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["1. fermer le pont de court-circuit côté TC", "2. vérifier que le courant passe par le pont", "3. ouvrir les liens côté appareil", "4. déposer l'appareil"], 540),
    legende: "Ordre des opérations pour débrancher un appareil d'un TC en service.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["V1 = 20 800 / √3 = 12 009 V", "K = (20 000 / √3) / (100 / √3) = 200", "u2 = 12 009 / 200 = 60,04 V", "nominal : 57,74 V"], 540),
    legende: "Tension secondaire d'un TP unipolaire sous 20,8 kV entre phases.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["5 : erreur composée au plus 5 %", "P : protection", "10 : jusqu'à 10 fois In", "sous la charge de précision"], 540),
    legende: "Lecture de la classe 5P10.",
  },
  {
    viewBox: "0 0 600 150",
    dessin: dessinBarres(
      [
        { nom: "5 VA, charge 3 VA", valeur: 5 * 7.5 / 5.5, max: 20, texte: "F' = 6,8" },
        { nom: "15 VA, charge 3 VA", valeur: 5 * 17.5 / 5.5, max: 20, texte: "F' = 15,9 : appareils moins protégés" },
      ],
      { x0: 150, l: 220, pied: "FS5, Sct = 2,5 VA ; tirets : F' = 20" }
    ),
    legende: "Un TC de mesure surdimensionné en puissance de précision sature plus tard : son facteur de sécurité réel augmente.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["F' = 5 × (2,5 + 10) / (2,5 + 2,5)", "   = 5 × 12,5 / 5", "   = 12,5"], 540),
    legende: "Calcul du facteur de sécurité réel, étapes révélées une à une.",
  },
  {
    viewBox: "0 0 600 150",
    dessin: dessinBarres(
      [
        { nom: "câble en 5 A", valeur: 25, max: 25, texte: "R × 25" },
        { nom: "câble en 1 A", valeur: 1, max: 25, texte: "R × 1" },
      ],
      { x0: 130, l: 300 }
    ),
    legende: "La puissance absorbée par un même câble varie comme le carré du courant : 25 fois plus en 5 A qu'en 1 A.",
  },
];

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Pourquoi un autotransformateur de rapport voisin de 1 est-il plus petit qu'un transformateur à deux enroulements de même puissance ?</p>",
        options: [
          "Seule la puissance (1 - k) S traverse son circuit magnétique, le reste passant par conduction",
          "Son noyau travaille à une induction plus élevée",
          "Il n'a pas de pertes fer",
          "Son courant d'entrée est plus faible que celui d'un transformateur ordinaire",
        ],
        bonnes: [0],
        explication: "Seule la différence des tensions est transformée : la puissance propre vaut $(1 - k)S$, $10\\ \\%$ pour $k = 0{,}9$.",
        resume: "Compacité de l'autotransformateur",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Un autotransformateur assure l'isolation galvanique entre ses deux côtés.</p>",
        reponse: false,
        explication: "L'enroulement commun relie électriquement les deux côtés : un défaut ou une perte du neutre côté haute tension se reporte côté basse tension.",
        resume: "Isolation de l'autotransformateur",
      },
      {
        type: "calcul",
        enonce:
          repere(2) + "<p>Les deux parties bobinées d'un autotransformateur de rapport $k = 0{,}9$ ont une tension de court-circuit de $4\\ \\%$ rapportée à sa puissance propre. Réseau amont infini, combien de fois le courant assigné vaut le courant de court-circuit ?</p>",
        valeur: 250,
        unite: "",
        tolerance: 0.02,
        chiffres: 0,
        explication: "$u_{cc} = (1 - k) \\times 4\\ \\% = 0{,}4\\ \\%$ rapportée à la puissance transmise, donc $I_k/I_n = 1/0{,}004 = 250$.",
        resume: "Court-circuit d'un autotransformateur",
      },
      {
        type: "schema",
        enonce: repere(3) + "<p>Le courant primaire entre par P1. Par quelle borne le courant secondaire sort-il vers l'appareil de mesure ?</p>",
        consigne: "Cliquez sur la borne de sortie du courant secondaire.",
        viewBox: "0 0 300 200",
        dessin: dessinQuizTC(),
        zones: [
          { x: 114, y: 128, largeur: 34, hauteur: 40, etiquette: "S1", juste: true },
          { x: 152, y: 128, largeur: 34, hauteur: 40, etiquette: "S2", juste: false },
        ],
        explication: "Convention de polarité : quand le courant primaire entre par P1, le courant secondaire sort par S1 dans le circuit extérieur.",
        resume: "Polarité d'un TC",
      },
      {
        type: "courte",
        enonce: repere(4) + "<p>Que faut-il faire avant de débrancher l'ampèremètre alimenté par un TC en service ?</p>",
        motsCles: [["court-circuit", "court-circuiter", "shunt", "pont"], ["secondaire", "s1", "s2", "bornier", "cote tc", "bornes"]],
        minimum: 2,
        explication: "Court-circuiter le secondaire côté TC, par le pont du bornier d'essai, avant d'ouvrir le circuit côté appareil ; le TC ne doit jamais être ouvert.",
        resume: "Débrancher un appareil sur TC",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Un TP unipolaire $20\\,000/\\sqrt{3}\\ /\\ 100/\\sqrt{3}\\ \\mathrm{V}$ est raccordé entre phase et terre sur un réseau dont la tension entre phases est de $20{,}8\\ \\mathrm{kV}$. Quelle tension lit-on au secondaire, en volts ?</p>",
        valeur: 20800 / RAC3 / 200,
        unite: "V",
        tolerance: 0.01,
        chiffres: 2,
        explication: "Rapport $K = 200$ ; tension simple $20\\,800/\\sqrt{3} = 12\\,009\\ \\mathrm{V}$ ; secondaire $12\\,009/200 = 60{,}04\\ \\mathrm{V}$.",
        resume: "Tension secondaire d'un TP",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Que signifie la classe $5\\mathrm{P}10$ d'un TC ?</p>",
        options: [
          "Erreur composée d'au plus 5 % jusqu'à 10 fois le courant assigné, sous la charge de précision",
          "Erreur de 10 % jusqu'à 5 fois le courant assigné",
          "Puissance de précision de 5 VA et courant secondaire de 10 A",
          "Classe de mesure 0,5 pour 10 % de charge",
        ],
        bonnes: [0],
        explication: "5 : erreur composée limite ; P : protection ; 10 : facteur limite de précision, valable sous la charge de précision.",
        resume: "Classe de protection",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Pour une charge réelle de $3\\ \\mathrm{VA}$, choisir un TC de mesure de $15\\ \\mathrm{VA}$ plutôt que de $5\\ \\mathrm{VA}$ protège mieux les appareils en cas de court-circuit.</p>",
        reponse: false,
        explication: "Le TC peu chargé sature plus tard : son facteur de sécurité réel monte, de $6{,}8$ à $15{,}9$ avec $S_{ct} = 2{,}5\\ \\mathrm{VA}$, et les appareils reçoivent davantage de courant. Sa précision n'est en outre plus garantie sous $25\\ \\%$ de charge.",
        resume: "Surdimensionnement de la puissance de précision",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Un TC de mesure $\\mathrm{FS}5$, $10\\ \\mathrm{VA}$, a des pertes internes $S_{ct} = 2{,}5\\ \\mathrm{VA}$ ; sa charge réelle est de $2{,}5\\ \\mathrm{VA}$. Quel est son facteur de sécurité réel ?</p>",
        valeur: 12.5,
        unite: "",
        tolerance: 0.02,
        chiffres: 1,
        explication: "$F' = 5 \\times (2{,}5 + 10)/(2{,}5 + 2{,}5) = 12{,}5$ : les appareils voient jusqu'à environ $12{,}5$ fois leur courant assigné.",
        resume: "Facteur de sécurité réel",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Pour un même câble, combien de fois la puissance qu'il absorbe est-elle plus grande avec un secondaire de $5\\ \\mathrm{A}$ qu'avec un secondaire de $1\\ \\mathrm{A}$ ?</p>",
        options: ["25 fois", "5 fois", "√5 fois", "Autant"],
        bonnes: [0],
        explication: "La puissance vaut $R\\,I_{2n}^2$ : $5^2 = 25$. Au-delà de quelques dizaines de mètres, le secondaire de $1\\ \\mathrm{A}$ s'impose.",
        resume: "Secondaire 1 A ou 5 A",
      },
    ],
    { titre: "Dix questions sur les autotransformateurs, TC et TP" }
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
      { categorie: "Autotransformateur", question: "Quelle puissance traverse le noyau d'un autotransformateur de rapport $k$ ?", reponse: "La puissance propre $(1 - k)S$ ; le reste, $kS$, passe par conduction dans l'enroulement commun.", rappel: "$400/360\\ \\mathrm{V}$ : $10\\ \\%$." },
      { categorie: "Autotransformateur", question: "Quel courant porte l'enroulement commun ?", reponse: "$I_c = I_2 - I_1 = (1 - k)\\,I_2$, faible quand $k$ est voisin de 1." },
      { categorie: "Autotransformateur", question: "Quels sont les deux inconvénients majeurs de l'autotransformateur ?", reponse: "Aucune isolation galvanique, et une tension de court-circuit réduite à $(1 - k)\\,u_{cc,propre}$, donc de forts courants de défaut." },
      { categorie: "TC", question: "Pourquoi un TC se comporte-t-il comme une source de courant ?", reponse: "Il est en série : le courant primaire lui est imposé par le réseau, et son secondaire délivre $i_1/K$ quelle que soit la charge, tant qu'il ne sature pas." },
      { categorie: "TC", question: "Que se passe-t-il si l'on ouvre un secondaire de TC en service ?", reponse: "Tout l'ampère-tour devient magnétisant : saturation, pointes de tension de centaines de volts à plusieurs kilovolts aux passages par zéro, échauffement et rémanence." },
      { categorie: "TC", question: "Quelle est la convention de polarité d'un TC ?", reponse: "Quand le courant primaire entre par P1, le courant secondaire sort par S1 dans le circuit extérieur. P1 côté source, S1 vers I+." },
      { categorie: "TC", question: "Comment calcule-t-on la charge d'un TC ?", reponse: "$S_b = (R_{cable} + R_{connexions})\\,I_{2n}^2 + S_{appareils}$, avec la longueur aller et retour ; elle doit rester entre $25$ et $100\\ \\%$ de $S_n$." },
      { categorie: "TC", question: "Que signifient FS5 et 5P10 ?", reponse: "FS5 : TC de mesure qui sature vers 5 fois $I_n$ pour protéger les appareils. 5P10 : TC de protection juste à $5\\ \\%$ jusqu'à 10 fois $I_n$." },
      { categorie: "TC", question: "Comment varie le facteur réel avec la charge ?", reponse: "$F' = F_n\\,(S_{ct} + S_n)/(S_{ct} + S_{reelle})$ : il augmente quand le TC est moins chargé que prévu." },
      { categorie: "TP", question: "Quelles sont les règles propres au TP ?", reponse: "Appareils en parallèle, secondaire jamais court-circuité et protégé par fusible ou disjoncteur, un point du secondaire à la terre, attention à la ferrorésonance sur neutre isolé." },
    ],
    { titre: "Dix cartes sur les autotransformateurs, TC et TP" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

function dessinCreneau() {
  const pts = [];
  for (let i = 0; i <= 120; i += 1) {
    const d = i * 3;
    pts.push((40 + (d / 360) * 300).toFixed(1) + " " + (100 - 50 * (4 / Math.PI) * Math.sin(d * DEG)).toFixed(1));
  }
  return (
    TRAITS + ' stroke-width="1.2"><path d="M40 20V180M40 100H350"/></g>' +
    TRAITS + ' stroke-width="2.6"><path d="M40 50H190V150H340V100"/></g>' +
    TRAITS + ' stroke-width="2" stroke-dasharray="7 4"><path d="M' + pts.join(" L") + '"/></g>' +
    ECRITS + texte(46, 44, "+10 A") + texte(46, 166, "-10 A") + texte(372, 50, "créneau : trait plein") + texte(372, 72, "fondamental : tirets") +
    texte(372, 104, "b1 = 4 A / π") + texte(372, 126, "= 12,73 A crête") + "</g>"
  );
}

function dessinHolmgreen() {
  const id = "fl-r-ho";
  const o = { x: 130, y: 110 };
  const a = pt(o, 0, 90);
  const b = pt(a, -120, 90);
  const c = pt(b, 120, 72);
  return (
    "<defs>" + marqueur(id) + "</defs>" +
    TRAITS + ' stroke-width="2"><path d="' + fleche(o, a) + '" marker-end="url(#' + id + ')"/><path d="' + fleche(a, b) + '" marker-end="url(#' + id + ')"/>' +
    '<path d="' + fleche(b, c) + '" marker-end="url(#' + id + ')"/></g>' +
    TRAITS + ' stroke-width="3" stroke-dasharray="7 4"><path d="' + fleche(o, c) + '" marker-end="url(#' + id + ')"/></g>' +
    ECRITS + texte(160, 100, "I1 = 100 A") + texte(a.x - 10, (a.y + b.y) / 2 + 4, "I2 = 100 A") + texte(b.x - 92, (b.y + c.y) / 2 + 10, "I3 = 80 A") +
    texte(o.x - 70, (o.y + c.y) / 2 + 12, "IN") + texte(330, 60, "IN = I1 + I2 + I3") + texte(330, 82, "= 20 A à -60°") + texte(330, 112, "secondaire 150/5 :") + texte(330, 134, "0,667 A") + "</g>"
  );
}

const VISUELS_REVISION = [
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["I2 = 50 000 / (√3 × 360) = 80,19 A", "I1 = 50 000 / (√3 × 400) = 72,17 A", "Ic = I2 - I1 = 8,02 A"], 540),
    legende: "Courant de l'enroulement commun de l'autotransformateur 400/360 V de 50 kVA.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["i2 = 0 : AT primaires non compensés", "flux saturé, basculements brefs", "pointes de tension, noyau chaud", "rémanence après refermeture"], 540),
    legende: "Conséquences d'un secondaire de TC ouvert en service.",
  },
  {
    viewBox: "0 0 600 150",
    dessin: dessinBarres(
      [
        { nom: "TP, secondaire", valeur: 100, max: 100, texte: "fusible ou disjoncteur : oui" },
        { nom: "TC, secondaire", valeur: 1, max: 100, texte: "fusible : jamais" },
      ],
      { x0: 150, l: 200 }
    ),
    legende: "Protection des secondaires : le TP est protégé contre les courts-circuits, le TC ne comporte jamais d'organe qui puisse l'ouvrir.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["Dyn11 : BT en avance de 30°", "courants HT et BT : rapport m et décalage", "le relais différentiel compense", "rapport et 30°, sinon faux déclenchement"], 540),
    legende: "Une protection différentielle de transformateur doit compenser le rapport et le déphasage du groupe de couplage.",
  },
  {
    viewBox: "0 0 560 140",
    dessin: dessinEtapes(["I ligne HT = 100 000 / (√3 × 20 000)", "          = 2,887 A", "TC 5/1 A : I2 = 2,887 / 5", "          = 0,577 A"], 540),
    legende: "Courant secondaire d'un TC 5/1 A sur une ligne haute tension du transformateur du poste à pleine charge.",
  },
  {
    viewBox: "0 0 580 200",
    dessin: dessinCreneau(),
    legende: "Un courant en créneau de ±10 A et son fondamental de 12,73 A crête : un TC saturé déforme le courant et crée des harmoniques.",
  },
  {
    viewBox: "0 0 560 220",
    dessin: dessinHolmgreen(),
    legende: "Somme vectorielle des trois courants de phase : le courant de neutre, mesuré par la somme des trois secondaires de TC.",
  },
];

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Un autotransformateur triphasé de $50\\ \\mathrm{kVA}$, $400\\ \\mathrm{V} / 360\\ \\mathrm{V}$, est à pleine charge. Quel courant circule dans son enroulement commun, en ampères ?</p>",
        valeur: 50e3 / (RAC3 * 360) - 50e3 / (RAC3 * 400),
        unite: "A",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$I_c = I_2 - I_1 = 80{,}19 - 72{,}17 = 8{,}02\\ \\mathrm{A}$, soit $(1 - k)\\,I_2$.",
        resume: "Courant de l'enroulement commun",
      },
      {
        type: "qcm",
        enonce: repere(1) + "<p>Cette séance. Quelles sont les conséquences d'un secondaire de TC ouvert en service ?</p>",
        options: [
          { texte: "Des pointes de tension élevées aux bornes du secondaire", juste: true },
          { texte: "Un échauffement du noyau saturé", juste: true },
          { texte: "Une aimantation rémanente qui dégrade la précision", juste: true },
          { texte: "Une coupure du courant primaire" },
        ],
        multiple: true,
        explication: "Le courant primaire, imposé par le réseau, continue de circuler ; il devient entièrement magnétisant, d'où saturation, pointes, échauffement et rémanence.",
        resume: "Secondaire ouvert",
      },
      {
        type: "vraiFaux",
        enonce: repere(2) + "<p>Cette séance. Le secondaire d'un TP se protège par fusible ou disjoncteur, alors qu'un circuit de TC ne doit jamais en comporter.</p>",
        reponse: true,
        explication: "Un fusible protège la source de tension qu'est le TP contre un court-circuit ; dans un circuit de TC, sa fusion ouvrirait le secondaire.",
        resume: "Protection des secondaires",
      },
      {
        type: "qcm",
        enonce:
          repere(3) + "<p>Cours <a href=\"#/cours/transformateurs-triphases\">Transformateurs triphasés</a>. Une protection différentielle compare les courants mesurés par des TC côté haute et côté basse tension d'un Dyn11. Que doit-elle compenser ?</p>",
        options: [
          "Le rapport de transformation et le déphasage de 30° du groupe",
          "Seulement le rapport de transformation",
          "Seulement le déphasage de 30°",
          "Rien, les courants sont égaux en régime normal",
        ],
        bonnes: [0],
        explication: "Les courants diffèrent en module, par le rapport, et en phase, par l'indice horaire : sans double compensation, le relais verrait un courant différentiel permanent.",
        resume: "Différentielle de transformateur",
      },
      {
        type: "calcul",
        enonce:
          repere(4) + "<p>Cours <a href=\"#/cours/transformateurs-triphases\">Transformateurs triphasés</a>. Le transformateur du poste, $100\\ \\mathrm{kVA}$, $20\\ \\mathrm{kV}$, est à pleine charge. Quel courant délivre un TC $5/1\\ \\mathrm{A}$ placé sur une ligne haute tension, en ampères ?</p>",
        valeur: 100e3 / (RAC3 * 20e3) / 5,
        unite: "A",
        tolerance: 0.01,
        chiffres: 3,
        explication: "Courant de ligne $2{,}887\\ \\mathrm{A}$, divisé par le rapport $5$ : $0{,}577\\ \\mathrm{A}$, soit $58\\ \\%$ du courant assigné du TC.",
        resume: "TC côté haute tension",
      },
      {
        type: "calcul",
        enonce:
          repere(5) + "<p>Cours <a href=\"#/cours/introduction-a-fourier\">Introduction à Fourier</a>. Un TC saturé délivre un courant presque en créneau de $\\pm 10\\ \\mathrm{A}$. Quelle est l'amplitude crête de son fondamental, en ampères ?</p>",
        valeur: 40 / Math.PI,
        unite: "A",
        tolerance: 0.01,
        chiffres: 2,
        explication: "Pour un créneau d'amplitude $A$, $b_1 = 4A/\\pi = 12{,}73\\ \\mathrm{A}$ ; les harmoniques impairs, en $1/n$, représentent la déformation.",
        resume: "Fondamental d'un créneau",
      },
      {
        type: "calcul",
        enonce:
          repere(6) + "<p>Cours <a href=\"#/cours/lois-de-kirchhoff\">Lois de Kirchhoff</a>. Les trois secondaires d'une arrivée sont mis en parallèle pour mesurer le courant de neutre. Les courants primaires valent $100\\angle 0^\\circ$, $100\\angle{-120^\\circ}$ et $80\\angle 120^\\circ\\ \\mathrm{A}$. Quel courant de neutre mesure-t-on, ramené au primaire, en ampères ?</p>",
        valeur: 20,
        unite: "A",
        tolerance: 0.02,
        chiffres: 1,
        explication: "Loi des nœuds au point commun des secondaires : $\\underline{I}_N = \\underline{I}_1 + \\underline{I}_2 + \\underline{I}_3 = -20\\angle 120^\\circ = 20\\angle{-60^\\circ}\\ \\mathrm{A}$, soit $0{,}667\\ \\mathrm{A}$ au secondaire d'un $150/5$.",
        resume: "Courant résiduel",
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
    titre: "Où en suis-je sur les autotransformateurs, TC et TP ?",
  });
  if (auto) ressources.push(auto);
}
