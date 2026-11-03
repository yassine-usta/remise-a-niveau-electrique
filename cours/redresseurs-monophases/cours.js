/* ==========================================================================
   cours/redresseurs-monophases/cours.js
   Redresseurs monophasés : pont de Graetz vu comme un aiguillage, condensateur
   réservoir, simulation du pont sur trois charges, dimensionnement du
   condensateur de filtrage, exercices, quiz, cartes, révision espacée et
   auto-évaluation.
   Le module n'utilise que l'objet api et le DOM de la racine du cours.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];
let compteurMarqueurs = 0;

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const TAU = 2 * Math.PI;
const RAC2 = Math.SQRT2;
const F_RESEAU = 50;

/* --------------------------------------------------------------------------
   Modèles physiques
   -------------------------------------------------------------------------- */

/**
 * Pont de Graetz en régime établi, seuil V0 par diode, résistance de source Rs.
 * type 1 : R seule ; type 2 : R et L en série ; type 3 : R et C en parallèle.
 * Intégration exponentielle par pas, exacte pour chaque état linéaire.
 * Renvoie deux périodes d'échantillons et les grandeurs de synthèse.
 */
function simulerPont(p) {
  const V0 = 1.0;
  const T = 1 / F_RESEAU;
  const N = 800;
  const dt = T / N;
  const Vm = p.Veff * RAC2;
  const R = Math.max(0.1, p.R);
  const Rs = Math.max(0.01, p.Rs);
  const L = Math.max(1e-4, p.L);
  const C = Math.max(1e-6, p.C);
  const type = p.type;
  let i = type === 2 ? Math.max(0, ((2 * Vm) / Math.PI - 2 * V0) / (R + Rs)) : 0;
  let v = type === 3 ? Math.max(0, Vm - 2 * V0) * 0.95 : 0;
  const periodes = type === 1 ? 2 : 40;
  const points = [];
  for (let k = 0; k < periodes * N; k += 1) {
    const t = k * dt;
    const vs = Vm * Math.sin(TAU * F_RESEAU * t);
    const a = Math.abs(vs) - 2 * V0;
    let ib = 0;
    let vch = 0;
    let ich = 0;
    if (type === 1) {
      ib = a > 0 ? a / (R + Rs) : 0;
      vch = R * ib;
      ich = ib;
    } else if (type === 2) {
      if (i > 0 || a > 0) {
        const cible = a / (R + Rs);
        i = cible + (i - cible) * Math.exp((-(R + Rs) * dt) / L);
        if (i < 0) i = 0;
      }
      ib = i;
      vch = i > 0 ? a - Rs * i : 0;
      ich = i;
    } else {
      if (a > v) {
        const g = 1 / Rs + 1 / R;
        const cible = a / Rs / g;
        v = cible + (v - cible) * Math.exp((-g * dt) / C);
        ib = Math.max(0, (a - v) / Rs);
      } else {
        v *= Math.exp(-dt / (R * C));
        ib = 0;
      }
      vch = v;
      ich = v / R;
    }
    if (k >= (periodes - 2) * N) {
      const is = vs >= 0 ? ib : -ib;
      const vD1 = vs >= 0 ? (ib > 0 ? V0 : (vs - vch) / 2) : ib > 0 ? -V0 - vch : (vs - vch) / 2;
      points.push({ t: (t - (periodes - 2) * T) * 1000, vs, abs: Math.abs(vs), vch, is, ich, ib, vD1 });
    }
  }
  return { ...synthese(points, p.Veff, Vm), points };
}

/** Pont de Graetz chargé par un courant constant I, condensateur C, source Rs. */
function simulerCourantConstant(Veff, Rs, C, I, N = 800, periodes = 30) {
  const V0 = 1.0;
  const T = 1 / F_RESEAU;
  const dt = T / N;
  const Vm = Veff * RAC2;
  const rs = Math.max(0.01, Rs);
  let v = Math.max(0, Vm - 2 * V0 - (I * T) / (4 * C));
  const points = [];
  for (let k = 0; k < periodes * N; k += 1) {
    const t = k * dt;
    const vs = Vm * Math.sin(TAU * F_RESEAU * t);
    const a = Math.abs(vs) - 2 * V0;
    let ib = 0;
    if (a > v) {
      const cible = a - rs * I;
      v = cible + (v - cible) * Math.exp(-dt / (rs * C));
      ib = Math.max(0, (a - v) / rs);
    } else {
      v -= (I * dt) / C;
      if (v < 0) v = 0;
    }
    if (k >= (periodes - 2) * N) {
      points.push({ t: (t - (periodes - 2) * T) * 1000, vs, abs: Math.abs(vs), a, vch: v, is: vs >= 0 ? ib : -ib, ich: I, ib });
    }
  }
  return { ...synthese(points, Veff, Vm), points };
}

/** Moyennes, valeurs efficaces, fondamental et facteur de puissance sur deux périodes. */
function synthese(points, Veff, Vm) {
  const n = points.length;
  let sV = 0;
  let sI2 = 0;
  let sP = 0;
  let a1 = 0;
  let b1 = 0;
  let vmin = Infinity;
  let vmax = -Infinity;
  let ipk = 0;
  let cond = 0;
  let sIch = 0;
  let sIc2 = 0;
  let sIb = 0;
  let sIb2 = 0;
  points.forEach((q, k) => {
    sV += q.vch;
    sI2 += q.is * q.is;
    sP += q.vs * q.is;
    const phase = (TAU * 2 * k) / n;
    a1 += q.is * Math.cos(phase);
    b1 += q.is * Math.sin(phase);
    if (q.vch < vmin) vmin = q.vch;
    if (q.vch > vmax) vmax = q.vch;
    if (q.ib > ipk) ipk = q.ib;
    if (q.ib > 1e-6) cond += 1;
    sIch += q.ich;
    sIc2 += (q.ib - q.ich) * (q.ib - q.ich);
    sIb += q.ib;
    sIb2 += q.ib * q.ib;
  });
  const Ieff = Math.sqrt(sI2 / n);
  const I1 = Math.hypot((2 * a1) / n, (2 * b1) / n) / RAC2;
  const P = sP / n;
  return {
    Vm,
    Vmoy: sV / n,
    vmin,
    vmax,
    dV: vmax - vmin,
    Ieff,
    I1,
    P,
    FP: Ieff > 0 ? P / (Veff * Ieff) : 0,
    THD: I1 > 0 ? Math.sqrt(Math.max(0, Ieff * Ieff - I1 * I1)) / I1 : 0,
    ipk,
    cond: ((cond / n) * 720) / 2 / 2,
    Ich: sIch / n,
    Ic: Math.sqrt(sIc2 / n),
    IDmoy: sIb / n / 2,
    IDeff: Math.sqrt(sIb2 / n / 2),
  };
}

/** Ondulation de la méthode affinée, source idéale : itération sur theta1. */
function ondulationAffinee(VCmax, I, C) {
  let dV = I / (2 * F_RESEAU * C);
  for (let k = 0; k < 40; k += 1) {
    const s = Math.max(0, Math.min(1, 1 - dV / VCmax));
    const th = Math.asin(s);
    const td = (Math.PI / 2 + th) / (TAU * F_RESEAU);
    dV = (I * td) / C;
  }
  return dV;
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

function chaine(points) {
  return points.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';

/** Diode verticale, anode en bas, cathode en haut. */
function diodeHaut(x, yb, yh, s = 10) {
  const m = (yb + yh) / 2;
  const a = m + s * 0.7;
  const b = m - s * 0.7;
  return (
    '<path d="M' + x + " " + yb + "V" + a + "M" + x + " " + b + "V" + yh + '"/>' +
    '<path d="M' + (x - s) + " " + a + "L" + x + " " + b + "L" + (x + s) + " " + a + 'Z"/>' +
    '<path d="M' + (x - s) + " " + b + "H" + (x + s) + '"/>'
  );
}

function source(cx, cy, r = 22) {
  return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/><path d="M' + (cx - 12) + " " + cy + 'c4 -10 8 -10 12 0s8 10 12 0"/>';
}

function ligneV(c, repere, couleurs, x, libelle) {
  const px = repere.versX(x);
  c.save();
  c.setLineDash([4, 4]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.1;
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

function ligneH(c, repere, couleurs, y, libelle) {
  const py = repere.versY(y);
  c.save();
  c.setLineDash([2, 4]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.3;
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

/** Courbe tracée avec un style de trait, à partir de points {t, cle}. */
function courbeStylee(c, repere, couleurs, points, cle, tirets, epaisseur, abscisse = "t") {
  c.save();
  c.setLineDash(tirets);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = epaisseur;
  c.beginPath();
  let premier = true;
  for (const q of points) {
    const px = repere.versX(q[abscisse]);
    const py = Math.max(repere.boite.y, Math.min(repere.boite.y + repere.boite.h, repere.versY(q[cle])));
    if (premier) c.moveTo(px, py);
    else c.lineTo(px, py);
    premier = false;
  }
  c.stroke();
  c.restore();
}

function traceCorrection(moteurApi, conteneur, options) {
  const traceur = moteurApi.sim.traceur(conteneur, { genre: "Correction visuelle", ratio: 0.42, echantillons: 300, ...options });
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

/** Lignes de calcul révélées une à une, dans un cadre. */
function dessinEtapes(lignes, largeur = 560) {
  const hauteur = 30 + lignes.length * 22;
  return (
    TRAITS + ' stroke-width="1.4"><rect x="6" y="6" width="' + (largeur - 12) + '" height="' + (hauteur - 12) + '" rx="8"/></g>' +
    ECRITS + lignes.map((ligne, i) => texte(22, 32 + i * 22, ligne)).join("") + "</g>"
  );
}

function etapes(lignes, legende, largeur = 560) {
  return { viewBox: "0 0 " + largeur + " " + (30 + lignes.length * 22), dessin: dessinEtapes(lignes, largeur), legende };
}

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeurs = [];
  compteurMarqueurs = 0;

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireAiguillage(racine, api);
  construireReservoir(racine, api);
  construireSimulationPont(racine, api);
  construireDimensionnement(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  api.reveler(racine.querySelectorAll(".formule-cle, .encadre, .cadre-tableau"), { decalage: 0.05 });
}

export function detruire() {
  for (const nettoyeur of nettoyeurs) {
    try {
      nettoyeur();
    } catch (erreur) {
      /* le nettoyage ne doit jamais empêcher le chargement du cours suivant */
    }
  }
  nettoyeurs = [];
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
   Renvois vers les schémas placés au fil du texte, tracés statiques
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
  nettoyeurs.push(() => {
    for (const lien of liens) lien.removeEventListener("click", surClic);
  });
}

function construireDessinsStatiques(racine, api) {
  const schemas = [
    ["#e-p2-figure svg", 1.5],
    ["#e-spectre-figure svg", 1.4],
    ["#f-schema-principal svg", 1.9],
    ["#h-figure svg", 1.6],
    ["#i-chargeur-figure svg", 1.7],
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
  nettoyeurs.push(() => observateur.disconnect());
}

/** Synchronise une poignée, des curseurs et un lecteur sur une même grandeur. */
function synchroniseur(dessiner, options = {}) {
  const etat = { poignee: null, curseurs: null, lecteur: null, idCurseur: options.idCurseur, verrou: false, valeur: null };
  etat.appliquer = (valeur, source) => {
    if (etat.verrou) return;
    etat.verrou = true;
    etat.valeur = valeur;
    dessiner(valeur);
    if (source !== "poignee" && etat.poignee) etat.poignee.set(valeur, false);
    if (source !== "curseur" && etat.curseurs && etat.idCurseur) etat.curseurs.definir(etat.idCurseur, valeur);
    if (source !== "lecteur" && etat.lecteur) etat.lecteur.suivre(valeur);
    etat.verrou = false;
  };
  etat.redessiner = () => {
    if (etat.valeur != null) dessiner(etat.valeur);
  };
  return etat;
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-moyenne-abs",
      titre: "Valeur moyenne d'une sinusoïde redressée",
      niveau: "prérequis",
      enonce: "<p>Quelle est la valeur moyenne de $|100\\sin\\theta|$, en volts, sur une période ?</p>",
      valeur: 200 / Math.PI,
      unite: "V",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Valeur moyenne",
      etapes: [
        { texte: "Le signal se répète tous les $\\pi$ : $\\langle v\\rangle = \\dfrac{1}{\\pi}\\int_0^{\\pi} 100\\sin\\theta\\,\\mathrm{d}\\theta$." },
        { texte: "$\\int_0^{\\pi}\\sin\\theta\\,\\mathrm{d}\\theta = 2$, d'où $\\langle v\\rangle = 200/\\pi = 63{,}66\\ \\mathrm{V}$." },
        { texte: "C'est le double du simple alternance, $100/\\pi = 31{,}83\\ \\mathrm{V}$.", note: "Le pont de Graetz idéal donne exactement ce résultat sur une charge résistive." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Sinusoïde redressée et sa moyenne",
          xTitre: "angle",
          xUnite: "rad",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 2 * TAU,
          yMin: -10,
          yMax: 110,
          series: [{ id: "v", nom: "|100 sin θ|", couleur: "serie-1", epaisseur: 2.4, fonction: (x) => Math.abs(100 * Math.sin(x)) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 200 / Math.PI, "moyenne 63,66 V");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-decharge",
      titre: "Décharge d'un condensateur à courant constant",
      niveau: "prérequis",
      enonce: "<p>Un condensateur de $10\\ \\mathrm{mF}$ fournit un courant constant de $2\\ \\mathrm{A}$ pendant $10\\ \\mathrm{ms}$, sans être rechargé. De combien sa tension baisse-t-elle ?</p>",
      valeur: 2,
      unite: "V",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Baisse de tension $\\Delta V$",
      etapes: [
        { texte: "Charge perdue : $Q = I\\,\\Delta t = 2 \\times 0{,}010 = 0{,}020\\ \\mathrm{C}$." },
        { texte: "$\\Delta V = Q/C = 0{,}020/0{,}010 = 2\\ \\mathrm{V}$." },
        { texte: "La tension décroît linéairement, de $I/C = 200\\ \\mathrm{V/s}$.", note: "C'est exactement la phase de décharge d'un condensateur de filtrage." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Décharge linéaire à courant constant",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 10,
          yMin: 20,
          yMax: 25,
          series: [{ id: "v", nom: "v_C(t), départ à 24 V", couleur: "serie-1", epaisseur: 2.4, fonction: (t) => 24 - 0.2 * t }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 22, "24 - 2 = 22 V à 10 ms");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-facteur",
      titre: "Facteur de puissance d'un courant déformé",
      niveau: "prérequis",
      enonce:
        "<p>Sous une tension sinusoïdale, un appareil absorbe un courant de valeur efficace $5\\ \\mathrm{A}$ dont le fondamental, de valeur efficace $4\\ \\mathrm{A}$, est en phase avec la tension. Quel est son facteur de puissance ?</p>",
      valeur: 0.8,
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Facteur de puissance $\\lambda$",
      etapes: [
        { texte: "Seul le fondamental transporte la puissance active : $P = V I_1\\cos\\varphi_1 = 4V$." },
        { texte: "$S = V I_{eff} = 5V$, donc $\\lambda = P/S = 4/5 = 0{,}80$." },
        { texte: "Le courant est en phase, et pourtant $\\lambda &lt; 1$ : la déformation suffit à le dégrader.", note: "C'est la situation de tout redresseur à condensateur." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["P = V I_1 cos φ_1 = V × 4 × 1", "S = V I_eff = V × 5", "λ = P / S = 0,80"], "Le facteur de puissance d'un courant déformé.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : le pont, un aiguillage
   -------------------------------------------------------------------------- */

function construireAiguillage(racine, api) {
  const conteneur = racine.querySelector("#d-aiguillage");
  if (!conteneur) return;
  const Vm = 230 * RAC2;
  const R = 100;
  const X0G = 230;
  const XB = 370;
  const YP = 40;
  const YN = 200;
  const YM = 120;
  const XR = 560;
  const TX0 = 90;
  const TX1 = 700;
  const CY = 300;
  const AMP = 52;
  const AXE = 384;
  const versX = (t) => TX0 + ((TX1 - TX0) * t) / 40;
  const id = nouveauMarqueur("fl-d-ai");
  const idO = nouveauMarqueur("fl-d-ai-o");

  const svg = svgEl("svg", {
    viewBox: "0 0 760 430",
    role: "img",
    "aria-label": "Pont de Graetz sur charge résistive : diodes passantes et chemin du courant à l'instant choisi, avec les chronogrammes de la tension de source et de la tension de charge",
  });
  let fond = "<defs>" + marqueur(id) + marqueur(idO, true) + "</defs>";
  fond += TRAITS + ' stroke-width="1.4">' + diodeHaut(X0G, YM, YP) + diodeHaut(X0G, YN, YM) + diodeHaut(XB, YM, YP) + diodeHaut(XB, YN, YM);
  fond += source(300, YM) + '<path d="M' + X0G + " " + YM + "H278M322 " + YM + "H" + XB + '"/>';
  fond += '<path d="M' + X0G + " " + YP + "H" + XR + "V80M" + XR + " 160V" + YN + "H" + X0G + '"/><rect x="' + (XR - 8) + '" y="80" width="16" height="80" rx="2"/>';
  fond += '<path d="M470 ' + YN + "V212M456 212H484M461 218H479M466 224H474" + '"/></g>';
  fond += '<g fill="currentColor" stroke="none">';
  for (const [x, y] of [[X0G, YM], [XB, YM], [X0G, YP], [XB, YP], [X0G, YN], [XB, YN], [470, YN]]) fond += '<circle cx="' + x + '" cy="' + y + '" r="3"/>';
  fond += "</g>";
  fond += TRAITS + ' stroke-width="1.5">' + seg([318, 156], [282, 156], ' marker-end="url(#' + idO + ')"') + seg([606, 180], [606, 60], ' marker-end="url(#' + idO + ')"') + "</g>";
  fond += ECRITS + texte(246, 84, "D1") + texte(246, 168, "D2") + texte(386, 84, "D3") + texte(386, 168, "D4") + texte(196, 114, "A") + texte(380, 114, "B");
  fond += texte(196, 34, "P") + texte(196, 222, "N") + texte(290, 176, "v_s") + texte(578, 124, "R") + texte(616, 124, "v_ch") + texte(486, 228, "référence N") + "</g>";
  /* chronogrammes */
  fond += TRAITS + ' stroke-width="1.2"><path d="M' + TX0 + " " + CY + "H" + TX1 + "M" + TX0 + " " + (CY - AMP - 6) + "V" + (CY + AMP + 6) + "M" + TX0 + " " + AXE + "H" + TX1 + '"/>';
  let ecr = "";
  for (let t = 0; t <= 40; t += 5) {
    fond += '<path d="M' + versX(t).toFixed(1) + " " + (AXE - 5) + 'v10"/>';
    ecr += texte(versX(t) - (t < 10 ? 4 : 8), AXE + 22, String(t));
  }
  fond += "</g>";
  const pVs = [];
  const pAbs = [];
  for (let k = 0; k <= 400; k += 1) {
    const t = (k / 400) * 40;
    const s = Math.sin((TAU * t) / 20);
    pVs.push([versX(t), CY - AMP * s]);
    pAbs.push([versX(t), CY - AMP * Math.abs(s)]);
  }
  fond += '<polyline fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="7 5" points="' + chaine(pVs) + '"/>';
  fond += '<polyline fill="none" stroke="currentColor" stroke-width="2.6" points="' + chaine(pAbs) + '"/>';
  ecr += texte(12, CY - AMP - 10, "tirets v_s") + texte(12, CY - AMP + 6, "plein v_ch") + texte(TX0, AXE + 42, "instant t (ms) : poignée ronde sur cet axe");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecr + "</g>";
  const actif = svgEl("g");
  const curseur = svgEl("g");
  svg.append(groupeFond, actif, curseur);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-aiguillage-valeurs", [
    { id: "t", libelle: "Instant t", unite: "ms", decimales: 2 },
    { id: "theta", libelle: "Angle θ = ωt", unite: "°", decimales: 0 },
    { id: "vs", libelle: "v_s", unite: "V", decimales: 0 },
    { id: "vch", libelle: "v_ch", unite: "V", decimales: 0 },
    { id: "is", libelle: "i_s", unite: "A", decimales: 2 },
    { id: "vD1", libelle: "v_D1", unite: "V", decimales: 0 },
    { id: "etat", libelle: "Diodes passantes", format: (x) => x },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner(t) {
    const vs = Vm * Math.sin((TAU * t) / 20);
    const positif = vs >= 0;
    const conduit = Math.abs(vs) > 1;
    let s = "";
    if (conduit) {
      s += TRAITS + ' stroke-width="3.6">';
      if (positif) {
        s += diodeHaut(X0G, YM, YP) + diodeHaut(XB, YN, YM);
        s += '<path d="M' + X0G + " " + YM + "H278M" + X0G + " " + YP + "H" + XR + "V80M" + XR + " 160V" + YN + "H" + XB + "M322 " + YM + "H" + XB + '"/>';
      } else {
        s += diodeHaut(XB, YM, YP) + diodeHaut(X0G, YN, YM);
        s += '<path d="M' + XB + " " + YM + "H322M" + XB + " " + YP + "H" + XR + "V80M" + XR + " 160V" + YN + "H" + X0G + "M278 " + YM + "H" + X0G + '"/>';
      }
      s += '<rect x="' + (XR - 8) + '" y="80" width="16" height="80" rx="2"/></g>';
      s += TRAITS + ' stroke-width="1.8">';
      s += seg([470, YP - 12], [510, YP - 12], ' marker-end="url(#' + id + ')"');
      s += seg([XR - 22, 92], [XR - 22, 148], ' marker-end="url(#' + id + ')"');
      s += seg([532, YN + 12], [496, YN + 12], ' marker-end="url(#' + id + ')"');
      if (positif) s += seg([X0G - 14, 100], [X0G - 14, 58], ' marker-end="url(#' + id + ')"') + seg([XB - 16, 182], [XB - 16, 138], ' marker-end="url(#' + id + ')"');
      else s += seg([XB - 16, 100], [XB - 16, 58], ' marker-end="url(#' + id + ')"') + seg([X0G - 14, 182], [X0G - 14, 138], ' marker-end="url(#' + id + ')"');
      s += "</g>";
    }
    s += ECRITS + texte(positif ? 262 : 330, 142, "+") + texte(positif ? 330 : 262, 142, "-") + texte(436, 30, conduit ? "i_ch" : "") + "</g>";
    actif.innerHTML = s;
    const x = versX(t);
    curseur.innerHTML =
      TRAITS + ' stroke-width="1" stroke-dasharray="3 4"><path d="M' + x.toFixed(1) + " " + (CY - AMP - 8) + "V" + AXE + '"/></g>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + (CY - AMP * Math.abs(Math.sin((TAU * t) / 20))).toFixed(1) + '" r="5" fill="currentColor"/>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + (CY - AMP * Math.sin((TAU * t) / 20)).toFixed(1) + '" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/>';
    const vch = Math.abs(vs);
    if (valeurs) {
      valeurs.maj({
        t,
        theta: ((t / 20) * 360) % 360,
        vs,
        vch,
        is: vs / R,
        vD1: positif ? 0 : -vch,
        etat: !conduit ? "aucune, v_s nulle" : positif ? "D1 et D4" : "D3 et D2",
      });
    }
  }

  const synchro = synchroniseur(dessiner);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: TX0, y: AXE },
    a: { x: TX1, y: AXE },
    min: 0,
    max: 40,
    pas: 0.1,
    valeur: 4,
    unite: "ms",
    libelle: "Instant d'observation",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);
  synchro.lecteur = api.sim.lecteur("#d-aiguillage-lecteur", {
    de: 0,
    a: 40,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Lecture sur deux périodes",
    rappel: (t) => synchro.appliquer(t, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  synchro.appliquer(4, null);
}

/* --------------------------------------------------------------------------
   D. Animation : le condensateur réservoir
   -------------------------------------------------------------------------- */

function construireReservoir(racine, api) {
  const conteneur = racine.querySelector("#d-reservoir");
  if (!conteneur) return;
  const VS = 18;
  const RS = 0.3;
  const C = 0.03;
  const TX0 = 80;
  const TX1 = 620;
  const VY0 = 30;
  const VY1 = 210;
  const VMIN = 14;
  const VMAX = 25;
  const IY0 = 240;
  const IY1 = 330;
  const IMAX = 30;
  const AXE = 362;
  const versX = (t) => TX0 + ((TX1 - TX0) * t) / 40;
  const versV = (v) => VY1 - ((Math.max(VMIN, Math.min(VMAX, v)) - VMIN) / (VMAX - VMIN)) * (VY1 - VY0);
  const versI = (i) => IY1 - (Math.min(IMAX, i) / IMAX) * (IY1 - IY0);
  const reglages = { I: 2 };
  let resultat = null;
  const id = nouveauMarqueur("fl-d-re");

  const svg = svgEl("svg", {
    viewBox: "0 0 760 410",
    role: "img",
    "aria-label": "Condensateur de filtrage vu comme un réservoir : tension disponible après les diodes, tension du condensateur, fenêtres de recharge, courant du pont et jauge de niveau",
  });
  let fond = "<defs>" + marqueur(id) + "</defs>";
  fond += TRAITS + ' stroke-width="1.2"><path d="M' + TX0 + " " + VY0 + "V" + VY1 + "H" + TX1 + "M" + TX0 + " " + IY0 + "V" + IY1 + "H" + TX1 + "M" + TX0 + " " + AXE + "H" + TX1 + '"/>';
  let ecr = "";
  for (const v of [15, 17, 19, 21, 23, 25]) {
    fond += '<path d="M' + (TX0 - 5) + " " + versV(v).toFixed(1) + 'h5"/>';
    ecr += texte(TX0 - 30, versV(v) + 4, String(v));
  }
  for (const i of [0, 10, 20, 30]) {
    fond += '<path d="M' + (TX0 - 5) + " " + versI(i).toFixed(1) + 'h5"/>';
    ecr += texte(TX0 - 26, versI(i) + 4, String(i));
  }
  for (let t = 0; t <= 40; t += 5) {
    fond += '<path d="M' + versX(t).toFixed(1) + " " + (AXE - 5) + 'v10"/>';
    ecr += texte(versX(t) - (t < 10 ? 4 : 8), AXE + 22, String(t));
  }
  fond += '<rect x="680" y="' + VY0 + '" width="40" height="' + (VY1 - VY0) + '" rx="4"/></g>';
  ecr += texte(TX0 + 4, VY0 - 10, "tension (V), échelle de 14 à 25 V") + texte(TX0 + 4, IY0 - 8, "courant du pont i_b (A)") + texte(TX0, AXE + 42, "instant t (ms) : poignée ronde sur cet axe");
  ecr += texte(664, VY1 + 22, "niveau v_C") + texte(728, VY0 + 6, "25 V") + texte(728, VY1, "0 V");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecr + "</g>";
  const bandes = svgEl("g");
  const courbes = svgEl("g");
  const mobile = svgEl("g");
  svg.append(bandes, groupeFond, courbes, mobile);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-reservoir-valeurs", [
    { id: "t", libelle: "Instant t", unite: "ms", decimales: 2 },
    { id: "a", libelle: "|v_s| - 2V_F", unite: "V", decimales: 2 },
    { id: "vc", libelle: "v_C", unite: "V", decimales: 2 },
    { id: "ib", libelle: "i_b", unite: "A", decimales: 2 },
    { id: "etat", libelle: "Phase", format: (x) => x },
    { id: "dV", libelle: "Ondulation ΔV", unite: "V", decimales: 2 },
    { id: "vmoy", libelle: "Tension moyenne", unite: "V", decimales: 2 },
    { id: "cond", libelle: "Conduction par alternance", unite: "°", decimales: 1 },
    { id: "ipk", libelle: "Pointe de courant", unite: "A", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function calculer() {
    resultat = simulerCourantConstant(VS, RS, C, reglages.I, 800, 30);
    const pts = resultat.points;
    let b = "";
    let debut = null;
    pts.forEach((q, k) => {
      const enCours = q.ib > 1e-6;
      if (enCours && debut === null) debut = q.t;
      if ((!enCours || k === pts.length - 1) && debut !== null) {
        const x1 = versX(debut);
        const x2 = versX(q.t);
        b += '<rect x="' + x1.toFixed(1) + '" y="' + VY0 + '" width="' + Math.max(1, x2 - x1).toFixed(1) + '" height="' + (IY1 - VY0) + '" fill="currentColor" fill-opacity="0.1"/>';
        debut = null;
      }
    });
    bandes.innerHTML = b;
    const pa = [];
    const pv = [];
    const pi = [];
    pts.forEach((q, k) => {
      if (k % 4 !== 0) return;
      pa.push([versX(q.t), versV(q.a)]);
      pv.push([versX(q.t), versV(q.vch)]);
      pi.push([versX(q.t), versI(q.ib)]);
    });
    courbes.innerHTML =
      '<polyline fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="7 5" points="' + chaine(pa) + '"/>' +
      '<polyline fill="none" stroke="currentColor" stroke-width="2.8" points="' + chaine(pv) + '"/>' +
      '<polyline fill="none" stroke="currentColor" stroke-width="2.2" points="' + chaine(pi) + '"/>';
  }

  function dessiner(t) {
    if (!resultat) return;
    const pts = resultat.points;
    const k = Math.max(0, Math.min(pts.length - 1, Math.round((t / 40) * (pts.length - 1))));
    const q = pts[k];
    const x = versX(t);
    const recharge = q.ib > 1e-6;
    const niveau = VY1 - (Math.max(0, Math.min(25, q.vch)) / 25) * (VY1 - VY0);
    let s = TRAITS + ' stroke-width="1" stroke-dasharray="3 4"><path d="M' + x.toFixed(1) + " " + VY0 + "V" + AXE + '"/></g>';
    s += '<circle cx="' + x.toFixed(1) + '" cy="' + versV(q.vch).toFixed(1) + '" r="5" fill="currentColor"/>';
    s += '<circle cx="' + x.toFixed(1) + '" cy="' + versI(q.ib).toFixed(1) + '" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/>';
    s += '<rect x="682" y="' + niveau.toFixed(1) + '" width="36" height="' + (VY1 - niveau - 2).toFixed(1) + '" rx="2" fill="currentColor" fill-opacity="0.35"/>';
    if (recharge) s += TRAITS + ' stroke-width="2">' + seg([700, VY0 - 22], [700, niveau - 6], ' marker-end="url(#' + id + ')"') + "</g>";
    s += ECRITS + texte(632, VY0 - 10, recharge ? "recharge" : "décharge") + "</g>";
    mobile.innerHTML = s;
    if (valeurs) {
      valeurs.maj({
        t,
        a: q.a,
        vc: q.vch,
        ib: q.ib,
        etat: recharge ? "recharge : deux diodes conduisent" : "décharge : toutes les diodes bloquées",
        dV: resultat.dV,
        vmoy: resultat.Vmoy,
        cond: resultat.cond,
        ipk: resultat.ipk,
      });
    }
  }

  const synchro = synchroniseur(dessiner);
  const curseurs = api.sim.curseurs(
    "#d-reservoir-curseurs",
    [{ id: "I", libelle: "Courant de la charge I", min: 0.5, max: 6, pas: 0.1, valeur: 2, unite: "A" }],
    (lues) => {
      if (lues.I !== reglages.I) {
        reglages.I = lues.I;
        calculer();
        synchro.redessiner();
      }
    }
  );
  if (curseurs) ressources.push(curseurs);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: TX0, y: AXE },
    a: { x: TX1, y: AXE },
    min: 0,
    max: 40,
    pas: 0.05,
    valeur: 4,
    unite: "ms",
    libelle: "Instant d'observation",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);
  synchro.lecteur = api.sim.lecteur("#d-reservoir-lecteur", {
    de: 0,
    a: 40,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Lecture sur deux périodes",
    rappel: (t) => synchro.appliquer(t, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  calculer();
  synchro.appliquer(4, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : le pont sur trois charges
   -------------------------------------------------------------------------- */

const NOMS_CHARGES = ["", "R seule", "R et L en série", "R et C en parallèle"];

function construireSimulationPont(racine, api) {
  if (!racine.querySelector("#e-pont-tensions")) return;
  const reglages = { type: 1, Veff: 230, R: 100, L: 0.2, C: 0.001, Rs: 1 };
  let resultat = null;
  let instant = 5;

  const tensions = api.sim.traceur("#e-pont-tensions", {
    titre: "Tensions du pont sur deux périodes",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "tension",
    yUnite: "V",
    xMin: 0,
    xMax: 40,
    yMin: -10,
    yMax: 360,
    ratio: 0.42,
    series: [{ id: "vch", nom: "v_ch, tension de la charge (trait plein)", couleur: "serie-1", epaisseur: 2.6 }],
    note: "Tirets : |v_s|. Pointillés horizontaux : valeur moyenne de v_ch. Trait vertical : instant d'observation.",
    surDessin({ c, repere: r, couleurs }) {
      if (!resultat) return;
      courbeStylee(c, r, couleurs, resultat.points, "abs", [7, 5], 1.4);
      ligneH(c, r, couleurs, resultat.Vmoy, "moyenne de v_ch");
      ligneV(c, r, couleurs, instant, "t = " + nombre(api, instant, 1) + " ms");
    },
  });
  if (tensions) ressources.push(tensions);
  const courants = api.sim.traceur("#e-pont-courants", {
    titre: "Courants sur deux périodes",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "courant",
    yUnite: "A",
    xMin: 0,
    xMax: 40,
    yMin: -5,
    yMax: 5,
    ratio: 0.38,
    series: [{ id: "is", nom: "i_s, courant de la source (trait plein)", couleur: "serie-3", epaisseur: 2.4 }],
    note: "Tirets : courant de la charge i_ch.",
    surDessin({ c, repere: r, couleurs }) {
      if (!resultat) return;
      courbeStylee(c, r, couleurs, resultat.points, "ich", [7, 5], 1.6);
      ligneV(c, r, couleurs, instant, "");
    },
  });
  if (courants) ressources.push(courants);

  const valeurs = api.sim.valeurs("#e-pont-valeurs", [
    { id: "charge", libelle: "Charge", format: (x) => x },
    { id: "Vmoy", libelle: "V_moy de v_ch", unite: "V", decimales: 1 },
    { id: "dV", libelle: "Ondulation crête à crête", unite: "V", decimales: 1 },
    { id: "Ich", libelle: "Courant moyen de la charge", unite: "A", decimales: 2 },
    { id: "Ieff", libelle: "I_s efficace", unite: "A", decimales: 2 },
    { id: "ipk", libelle: "Pointe de courant", unite: "A", decimales: 2 },
    { id: "cond", libelle: "Conduction par alternance", unite: "°", decimales: 0 },
    { id: "FP", libelle: "Facteur de puissance λ", decimales: 3 },
    { id: "THD", libelle: "Taux de distorsion de i_s", unite: "%", decimales: 0 },
    { id: "vt", libelle: "v_ch à l'instant t", unite: "V", decimales: 1 },
    { id: "it", libelle: "i_s à l'instant t", unite: "A", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function calculer() {
    resultat = simulerPont(reglages);
    const Vm = resultat.Vm;
    if (tensions) {
      tensions.definirPlage({ yMin: -0.05 * Vm, yMax: 1.12 * Vm });
      tensions.definirDonnees("vch", resultat.points.map((q) => [q.t, q.vch]));
    }
    if (courants) {
      let m = 0;
      for (const q of resultat.points) m = Math.max(m, Math.abs(q.is), Math.abs(q.ich));
      m = Math.max(0.1, m * 1.12);
      courants.definirPlage({ yMin: -m, yMax: m });
      courants.definirDonnees("is", resultat.points.map((q) => [q.t, q.is]));
    }
  }

  function majValeurs() {
    if (!resultat || !valeurs) return;
    const pts = resultat.points;
    const k = Math.max(0, Math.min(pts.length - 1, Math.round((instant / 40) * (pts.length - 1))));
    valeurs.maj({
      charge: NOMS_CHARGES[reglages.type],
      Vmoy: resultat.Vmoy,
      dV: resultat.dV,
      Ich: resultat.Ich,
      Ieff: resultat.Ieff,
      ipk: resultat.ipk,
      cond: resultat.cond,
      FP: resultat.FP,
      THD: resultat.THD * 100,
      vt: pts[k].vch,
      it: pts[k].is,
    });
  }

  function placerInstant(t) {
    instant = t;
    if (tensions) tensions.demanderRendu();
    if (courants) courants.demanderRendu();
    majValeurs();
  }

  const synchro = synchroniseur(placerInstant, { idCurseur: "t" });
  synchro.curseurs = api.sim.curseurs(
    "#e-pont-curseurs",
    [
      { id: "type", libelle: "Charge : 1 R, 2 R-L, 3 R-C", min: 1, max: 3, pas: 1, valeur: 1 },
      { id: "Veff", libelle: "Tension efficace de la source V_s", min: 12, max: 240, pas: 1, valeur: 230, unite: "V" },
      { id: "R", libelle: "Résistance de la charge R", min: 5, max: 200, pas: 1, valeur: 100, unite: "Ω" },
      { id: "L", libelle: "Inductance L (charge 2)", min: 10, max: 500, pas: 5, valeur: 200, unite: "mH" },
      { id: "C", libelle: "Capacité C (charge 3)", min: 0.1, max: 10, pas: 0.1, valeur: 1, unite: "mF" },
      { id: "Rs", libelle: "Résistance de la source R_s", min: 0.1, max: 3, pas: 0.05, valeur: 1, unite: "Ω" },
      { id: "t", libelle: "Instant d'observation t", min: 0, max: 40, pas: 0.1, valeur: 5, unite: "ms" },
    ],
    (lues) => {
      const nouveaux = { type: Math.round(lues.type), Veff: lues.Veff, R: lues.R, L: lues.L / 1000, C: lues.C / 1000, Rs: lues.Rs };
      const change = Object.keys(nouveaux).some((cle) => nouveaux[cle] !== reglages[cle]);
      if (change) {
        Object.assign(reglages, nouveaux);
        calculer();
      }
      synchro.appliquer(lues.t, "curseur");
    }
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);
  synchro.lecteur = api.sim.lecteur("#e-pont-lecteur", {
    de: 0,
    a: 40,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Instant d'observation sur deux périodes",
    rappel: (t) => synchro.appliquer(t, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  calculer();
  synchro.appliquer(5, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : dimensionnement du condensateur
   -------------------------------------------------------------------------- */

function construireDimensionnement(racine, api) {
  if (!racine.querySelector("#e-dimension-courbe")) return;
  const reglages = { I: 2, Veff: 18, Rs: 0.3, C: 30 };
  let courbe = [];
  let choisi = null;

  const VCmax = () => reglages.Veff * RAC2 - 2;

  const graphe = api.sim.traceur("#e-dimension-courbe", {
    titre: "Ondulation en fonction de la capacité",
    xTitre: "capacité C",
    xUnite: "mF",
    yTitre: "ondulation ΔV",
    yUnite: "V",
    xMin: 2,
    xMax: 50,
    yMin: 0,
    yMax: 6,
    ratio: 0.45,
    series: [{ id: "sim", nom: "ΔV simulé avec R_s (trait plein)", couleur: "serie-1", epaisseur: 2.6 }],
    note: "Tirets : formule simplifiée I/(2fC). Pointillés : méthode affinée, source idéale. Trait vertical : capacité choisie.",
    surDessin({ c, repere: r, couleurs }) {
      const simple = [];
      const affinee = [];
      for (let k = 0; k <= 96; k += 1) {
        const Cm = 2 + (48 * k) / 96;
        simple.push({ x: Cm, y: reglages.I / (2 * F_RESEAU * (Cm / 1000)) });
        affinee.push({ x: Cm, y: ondulationAffinee(VCmax(), reglages.I, Cm / 1000) });
      }
      courbeStylee(c, r, couleurs, simple, "y", [7, 5], 1.5, "x");
      courbeStylee(c, r, couleurs, affinee, "y", [2, 4], 1.7, "x");
      ligneV(c, r, couleurs, reglages.C, "C = " + nombre(api, reglages.C, 1) + " mF");
    },
  });
  if (graphe) ressources.push(graphe);

  const temps = api.sim.traceur("#e-dimension-temps", {
    titre: "Tension du condensateur pour la capacité choisie",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "tension",
    yUnite: "V",
    xMin: 0,
    xMax: 40,
    yMin: 0,
    yMax: 30,
    ratio: 0.38,
    series: [{ id: "vc", nom: "v_C (trait plein)", couleur: "serie-2", epaisseur: 2.6 }],
    note: "Tirets : |v_s| - 2V_F, tension disponible après les deux diodes.",
    surDessin({ c, repere: r, couleurs }) {
      if (!choisi) return;
      courbeStylee(c, r, couleurs, choisi.points, "a", [7, 5], 1.4);
    },
  });
  if (temps) ressources.push(temps);

  const valeurs = api.sim.valeurs("#e-dimension-valeurs", [
    { id: "simple", libelle: "ΔV, formule simplifiée", unite: "V", decimales: 2 },
    { id: "affinee", libelle: "ΔV, méthode affinée", unite: "V", decimales: 2 },
    { id: "sim", libelle: "ΔV simulé avec R_s", unite: "V", decimales: 2 },
    { id: "vmax", libelle: "v_C maximale", unite: "V", decimales: 2 },
    { id: "vmin", libelle: "v_C minimale", unite: "V", decimales: 2 },
    { id: "ideal", libelle: "V_C max sans R_s", unite: "V", decimales: 2 },
    { id: "ipk", libelle: "Pointe de courant", unite: "A", decimales: 1 },
    { id: "Ieff", libelle: "I_s efficace", unite: "A", decimales: 2 },
    { id: "Ic", libelle: "I_C efficace", unite: "A", decimales: 2 },
    { id: "cond", libelle: "Conduction par alternance", unite: "°", decimales: 1 },
    { id: "FP", libelle: "Facteur de puissance λ", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function calculerCourbe() {
    courbe = [];
    let max = 0;
    for (let k = 0; k <= 24; k += 1) {
      const Cm = 2 + 2 * k;
      const r = simulerCourantConstant(reglages.Veff, reglages.Rs, Cm / 1000, reglages.I, 400, 16);
      courbe.push([Cm, r.dV]);
      max = Math.max(max, r.dV, reglages.I / (2 * F_RESEAU * (Cm / 1000)));
    }
    if (graphe) {
      graphe.definirPlage({ yMin: 0, yMax: Math.min(max * 1.08, Math.max(1, VCmax())) });
      graphe.definirDonnees("sim", courbe);
    }
  }

  function calculerChoix() {
    choisi = simulerCourantConstant(reglages.Veff, reglages.Rs, reglages.C / 1000, reglages.I, 800, 30);
    if (temps) {
      const haut = reglages.Veff * RAC2;
      temps.definirPlage({ yMin: Math.max(0, choisi.vmin - Math.max(2, 3 * choisi.dV)), yMax: haut });
      temps.definirDonnees("vc", choisi.points.map((q) => [q.t, q.vch]));
    }
    if (graphe) graphe.demanderRendu();
    if (valeurs) {
      valeurs.maj({
        simple: reglages.I / (2 * F_RESEAU * (reglages.C / 1000)),
        affinee: ondulationAffinee(VCmax(), reglages.I, reglages.C / 1000),
        sim: choisi.dV,
        vmax: choisi.vmax,
        vmin: choisi.vmin,
        ideal: VCmax(),
        ipk: choisi.ipk,
        Ieff: choisi.Ieff,
        Ic: choisi.Ic,
        cond: choisi.cond,
        FP: choisi.FP,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-dimension-curseurs",
    [
      { id: "I", libelle: "Courant continu de la charge I", min: 0.5, max: 10, pas: 0.1, valeur: 2, unite: "A" },
      { id: "Veff", libelle: "Tension du secondaire V_s", min: 12, max: 48, pas: 0.5, valeur: 18, unite: "V" },
      { id: "Rs", libelle: "Résistance de la source R_s", min: 0.05, max: 1, pas: 0.01, valeur: 0.3, unite: "Ω" },
      { id: "C", libelle: "Capacité choisie C", min: 2, max: 50, pas: 0.5, valeur: 30, unite: "mF" },
    ],
    (lues) => {
      const courbeChange = lues.I !== reglages.I || lues.Veff !== reglages.Veff || lues.Rs !== reglages.Rs;
      Object.assign(reglages, lues);
      if (courbeChange || !courbe.length) calculerCourbe();
      calculerChoix();
    }
  );
  if (curseurs) ressources.push(curseurs);
  calculerCourbe();
  calculerChoix();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function dessinPontQuiz(idM) {
  const X0G = 150;
  const XB = 290;
  return (
    "<defs>" + marqueur(idM) + "</defs>" +
    TRAITS + ' stroke-width="2">' + diodeHaut(X0G, 130, 40) + diodeHaut(X0G, 220, 130) + diodeHaut(XB, 130, 40) + diodeHaut(XB, 220, 130) +
    source(220, 130) + '<path d="M' + X0G + ' 130H198M242 130H' + XB + "M" + X0G + " 40H460V90M460 170V220H" + X0G + '"/><rect x="452" y="90" width="16" height="80" rx="2"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="' + X0G + '" cy="130" r="3"/><circle cx="' + XB + '" cy="130" r="3"/><circle cx="' + X0G + '" cy="40" r="3"/><circle cx="' + XB + '" cy="40" r="3"/><circle cx="' + X0G + '" cy="220" r="3"/><circle cx="' + XB + '" cy="220" r="3"/></g>' +
    TRAITS + ' stroke-width="1.6">' + seg([238, 166], [202, 166], ' marker-end="url(#' + idM + ')"') + "</g>" +
    ECRITS + texte(166, 92, "D1") + texte(166, 182, "D2") + texte(306, 92, "D3") + texte(306, 182, "D4") + texte(132, 124, "A") + texte(300, 124, "B") +
    texte(182, 152, "+") + texte(250, 152, "-") + texte(206, 186, "v_s") + texte(478, 134, "R") + texte(20, 250, "alternance positive : A au-dessus de B ; D1 conduit") + "</g>"
  );
}

const ZONES_PONT = [
  { x: 130, y: 60, largeur: 52, hauteur: 60, etiquette: "D1" },
  { x: 130, y: 146, largeur: 52, hauteur: 64, etiquette: "D2" },
  { x: 270, y: 60, largeur: 52, hauteur: 60, etiquette: "D3" },
  { x: 270, y: 146, largeur: 52, hauteur: 64, etiquette: "D4", juste: true },
];

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* 1. Fondamental : tension moyenne d'un pont */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-moyenne",
      titre: "Tension moyenne d'un pont sur résistance",
      niveau: "fondamental",
      enonce:
        "<p>Un transformateur délivre $48\\ \\mathrm{V}$ efficaces à un pont de Graetz qui alimente une résistance. En considérant les diodes idéales, quelle est la tension moyenne de la charge ?</p>",
      valeur: (2 * RAC2 * 48) / Math.PI,
      unite: "V",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Tension moyenne $V_{moy}$",
      etapes: [
        { texte: "$V_m = \\sqrt{2} \\times 48 = 67{,}88\\ \\mathrm{V}$." },
        { texte: "$V_{moy} = 2V_m/\\pi = 2 \\times 67{,}88/3{,}1416 = 43{,}22\\ \\mathrm{V}$, soit $0{,}900 \\times 48$." },
        { texte: "Avec deux chutes de $0{,}9\\ \\mathrm{V}$, on obtiendrait environ $41{,}4\\ \\mathrm{V}$.", note: "Le simple alternance n'en donnerait que la moitié, $21{,}61\\ \\mathrm{V}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension redressée par le pont et sa moyenne",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 40,
          yMin: -5,
          yMax: 75,
          series: [{ id: "v", nom: "v_ch(t) = |v_s|", couleur: "serie-1", epaisseur: 2.4, fonction: (t) => Math.abs(48 * RAC2 * Math.sin((TAU * t) / 20)) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, (2 * RAC2 * 48) / Math.PI, "V_moy = 43,22 V");
          },
        });
      },
    })
  );

  /* 2. Fondamental : capacité par la formule simplifiée */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-capacite",
      titre: "Capacité pour une ondulation imposée",
      niveau: "fondamental",
      enonce:
        "<p>Un pont de Graetz alimenté en $50\\ \\mathrm{Hz}$ charge un condensateur qui fournit $1{,}5\\ \\mathrm{A}$ constants à un régulateur. Quelle capacité, en millifarads, faut-il au minimum pour limiter l'ondulation à $2\\ \\mathrm{V}$ crête à crête, selon la formule simplifiée ?</p>",
      valeur: 7.5,
      unite: "mF",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Capacité $C$",
      etapes: [
        { texte: "Recharge deux fois par période : la décharge dure au plus $T/2 = 10\\ \\mathrm{ms}$." },
        { texte: "$C \\geq I/(2f\\Delta V) = 1{,}5/(2 \\times 50 \\times 2) = 7{,}5 \\times 10^{-3}\\ \\mathrm{F} = 7{,}5\\ \\mathrm{mF}$." },
        { texte: "Valeur prudente : la méthode affinée donnerait un peu moins ; la tolérance du condensateur impose ensuite une marge.", note: "En simple alternance, il faudrait le double, $15\\ \\mathrm{mF}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["charge perdue par alternance : Q = I × T/2 = 1,5 × 0,01 = 15 mC", "ΔV = Q / C ≤ 2 V", "C ≥ 15 mC / 2 V = 7,5 mF"], "Bilan de charge sur une demi-période.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );

  /* 3. Intermédiaire : pertes d'une diode avec courant lissé */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-pertes",
      titre: "Pertes d'une diode du pont avec un courant lissé",
      niveau: "intermédiaire",
      enonce:
        "<p>Un pont de Graetz alimente un induit très inductif sous un courant lissé $I_d = 20\\ \\mathrm{A}$. Ses diodes ont, à chaud, $V_{F0} = 0{,}9\\ \\mathrm{V}$ et $r_F = 10\\ \\mathrm{m\\Omega}$. Quelles sont les pertes de conduction d'une diode ?</p>",
      valeur: 11,
      unite: "W",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Pertes d'une diode",
      etapes: [
        { texte: "Chaque diode conduit $I_d$ pendant une alternance sur deux : $I_{D,moy} = I_d/2 = 10\\ \\mathrm{A}$, $I_{D,eff} = I_d/\\sqrt{2} = 14{,}14\\ \\mathrm{A}$." },
        { texte: "$P = V_{F0}\\,I_{D,moy} + r_F\\,I_{D,eff}^2 = 0{,}9 \\times 10 + 0{,}010 \\times 200 = 9 + 2 = 11\\ \\mathrm{W}$." },
        { texte: "Le pont dissipe $4 \\times 11 = 44\\ \\mathrm{W}$.", note: "Avec $V_{moy} \\approx 0{,}9 \\times 230 = 207\\ \\mathrm{V}$ et $20\\ \\mathrm{A}$, soit $4{,}1\\ \\mathrm{kW}$, cela fait environ $1{,}1\\ \\%$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Courant d'une diode du pont avec courant lissé",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "courant",
          yUnite: "A",
          xMin: 0,
          xMax: 40,
          yMin: -2,
          yMax: 24,
          series: [{ id: "i", nom: "i_D1(t), créneau de 20 A une alternance sur deux", couleur: "serie-3", epaisseur: 2.4, fonction: (t) => ((t % 20) < 10 ? 20 : 0) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 10, "moyenne 10 A");
            ligneH(c, r, couleurs, 20 / RAC2, "efficace 14,14 A");
          },
        });
      },
    })
  );

  /* 4. Intermédiaire : choix de montage et tension inverse */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-inverse",
      titre: "Tension inverse dans un montage à point milieu",
      niveau: "intermédiaire",
      enonce:
        "<p>Pour une alimentation de forte intensité sous basse tension, on hésite entre un pont et un transformateur à point milieu de $2 \\times 24\\ \\mathrm{V}$ efficaces. Quelle tension inverse maximale, en volts, une diode du montage à point milieu doit-elle supporter, diodes idéales ?</p>",
      valeur: 2 * 24 * RAC2,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension inverse maximale",
      etapes: [
        { texte: "Crête d'un demi-secondaire : $V_m = 24\\sqrt{2} = 33{,}94\\ \\mathrm{V}$." },
        { texte: "Quand l'autre diode conduit, la diode bloquée voit sa demi-bobine et la charge, à $V_m$ chacune : $2V_m = 67{,}9\\ \\mathrm{V}$." },
        { texte: "Dans un pont alimenté par $24\\ \\mathrm{V}$, la tension inverse ne serait que $33{,}9\\ \\mathrm{V}$, mais avec deux chutes de diodes au lieu d'une.", note: "En très basse tension, l'économie d'une chute justifie le point milieu ; sa tension inverse double se gère aisément." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension de la diode Da du montage à point milieu",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 40,
          yMin: -75,
          yMax: 10,
          series: [{ id: "v", nom: "v_Da(t) = v_s - |v_s|", couleur: "serie-1", epaisseur: 2.4, fonction: (t) => { const v = 24 * RAC2 * Math.sin((TAU * t) / 20); return v - Math.abs(v); } }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, -2 * 24 * RAC2, "-2V_m = -67,9 V");
          },
        });
      },
    })
  );

  /* 5. Avancé : méthode affinée */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-affinee",
      titre: "Capacité par la méthode affinée",
      niveau: "avancé",
      enonce:
        "<p>Un condensateur alimenté par un pont en $50\\ \\mathrm{Hz}$ se charge jusqu'à $\\hat V_C = 30\\ \\mathrm{V}$ et alimente un régulateur qui absorbe $3\\ \\mathrm{A}$ et exige au moins $28\\ \\mathrm{V}$. Source supposée idéale. Calculez l'angle de reprise de conduction, la durée de décharge, puis la capacité minimale en millifarads.</p>",
      valeur: (3 * ((Math.PI / 2 + Math.asin(28 / 30)) / (TAU * 50))) / 2 * 1000,
      unite: "mF",
      tolerance: 0.015,
      chiffres: 2,
      libelleChamp: "Capacité $C$",
      etapes: [
        { texte: "$\\Delta V = 30 - 28 = 2\\ \\mathrm{V}$ ; $\\sin\\theta_1 = 28/30 = 0{,}9333$, d'où $\\theta_1 = 68{,}96^\\circ = 1{,}2036\\ \\mathrm{rad}$." },
        { texte: "$t_d = (\\pi/2 + \\theta_1)/\\omega = (1{,}5708 + 1{,}2036)/314{,}16 = 8{,}83\\ \\mathrm{ms}$." },
        { texte: "$C = I\\,t_d/\\Delta V = 3 \\times 8{,}83 \\times 10^{-3}/2 = 13{,}25\\ \\mathrm{mF}$." },
        { texte: "La formule simplifiée aurait donné $3/(100 \\times 2) = 15\\ \\mathrm{mF}$, $13\\ \\%$ de plus.", note: "Il reste à vérifier la tension minimale avec la résistance réelle de la source, qui abaisse $\\hat V_C$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const VC = 30;
        const th = Math.asin(28 / 30);
        const td = ((Math.PI / 2 + th) / TAU) * 20;
        traceCorrection(moteurApi, conteneur, {
          titre: "Décharge de la crête jusqu'à la reprise de conduction",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 20,
          yMin: 20,
          yMax: 31,
          series: [
            { id: "abs", nom: "|v_s| - 2V_F, crête 30 V", couleur: "serie-2", epaisseur: 1.6, fonction: (t) => VC * Math.abs(Math.sin((TAU * t) / 20)) },
            { id: "vc", nom: "v_C(t)", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => (t < 5 ? VC * Math.sin((TAU * t) / 20) : t < 5 + td ? VC - (3 * (t - 5)) / 1000 / 0.01325 : VC * Math.abs(Math.sin((TAU * t) / 20))) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 28, "28 V minimum");
            ligneV(c, r, couleurs, 5 + td, "reprise après t_d = 8,83 ms");
          },
        });
      },
    })
  );

  /* 6. Diagnostic industriel */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Ondulation anormale sur une alimentation d'automate",
      niveau: "diagnostic",
      enonce:
        "<p>Une alimentation à pont et condensateur, en service depuis cinq ans, fait décrocher l'automate au réseau bas. À l'oscilloscope, à travers une sonde différentielle, l'ondulation de la tension continue a doublé et se répète maintenant toutes les $20\\ \\mathrm{ms}$ au lieu de $10\\ \\mathrm{ms}$. Le transformateur ronfle davantage. Quelle est la cause la plus probable ?</p>",
      options: [
        "Le condensateur a perdu la moitié de sa capacité",
        "Une diode ou une branche du pont est coupée",
        "Une diode du pont est en court-circuit",
        "La tension du réseau est trop basse",
      ],
      bonnes: [1],
      etapes: [
        { texte: "La période de l'ondulation est passée de $10$ à $20\\ \\mathrm{ms}$ : le condensateur ne se recharge plus qu'une fois par période, le montage fonctionne en simple alternance." },
        { texte: "La décharge dure presque une période au lieu d'une demi-période : l'ondulation double, $I/(fC)$ au lieu de $I/(2fC)$, et la tension minimale baisse." },
        { texte: "Le courant du transformateur n'a plus qu'une alternance : sa composante continue magnétise le noyau et le fait ronfler.", note: "Un condensateur dégradé augmenterait l'ondulation sans changer sa période ; une diode en court-circuit ferait fondre le fusible." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const sain = (t) => { const ph = (t % 10) / 10; return 23.4 - 0.9 * ph; };
        const defaut = (t) => { const ph = (t % 20) / 20; return 23.4 - 1.8 * ph; };
        traceCorrection(moteurApi, conteneur, {
          titre: "Ondulation saine et ondulation avec une branche coupée (schématique)",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 40,
          yMin: 21,
          yMax: 24,
          series: [
            { id: "sain", nom: "pont sain, recharge toutes les 10 ms", couleur: "serie-2", epaisseur: 1.8, fonction: sain },
            { id: "def", nom: "branche coupée, recharge toutes les 20 ms", couleur: "serie-1", epaisseur: 2.6, fonction: defaut },
          ],
        });
      },
    })
  );

  /* 7. Conceptuel */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Un courant en phase et un mauvais facteur de puissance",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi un redresseur à condensateur a un facteur de puissance voisin de $0{,}7$ alors que son courant est en phase avec la tension, et pourquoi un condensateur plus gros l'aggrave.</p>",
      motsCles: [["impulsion", "pointe", "bref", "breve", "etroit"], ["harmonique", "deforme", "deformation", "fondamental"], ["efficace"], ["fenetre", "conduction", "plus court", "plus haut", "plus intense"]],
      minimum: 3,
      exemple: "Trois phrases : la forme du courant, ce qui transporte la puissance, l'effet d'un condensateur plus gros.",
      etapes: [
        { texte: "Le pont ne conduit que près des crêtes : le courant est fait d'impulsions brèves et intenses, centrées sur les crêtes, donc en phase." },
        { texte: "Seul le fondamental transporte la puissance active ; les harmoniques, surtout de rang 3, augmentent la valeur efficace sans rien transporter : $\\lambda = I_1/I_{eff}$." },
        { texte: "Un condensateur plus gros raccourcit la fenêtre de recharge ; la même charge passe en moins de temps : impulsions plus hautes, valeur efficace plus grande, $\\lambda$ plus faible.", note: "Une self de lissage ou un correcteur actif élargit au contraire la conduction." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["recharge près des crêtes : impulsions en phase", "P portée par I_1 seul ; I_eff gonflée par les harmoniques", "λ = I_1 / I_eff ≈ 0,7", "C plus gros : fenêtre plus courte, λ plus faible"], "Ce qui dégrade le facteur de puissance.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const VISUELS_QUIZ = [
  etapes(["deux recharges par période", "f_ondulation = 2 × 50 = 100 Hz", "simple alternance : 50 Hz"], "Fréquence de l'ondulation d'un pont."),
  etapes(["diode bloquée : sa demi-bobine + la charge", "v_Da = v_s - |v_s| = 2 v_s quand v_s < 0", "minimum : -2 V_m"], "Tension inverse au point milieu."),
  etapes(["V_m = 24 × √2 = 33,94 V", "V_moy = 2 V_m / π", "= 21,61 V"], "Tension moyenne d'un pont sur résistance."),
  etapes(["chemin du courant : A, D1, charge, D4, B", "deux diodes en série à chaque alternance", "chute totale ≈ 2 V_F"], "Pourquoi deux chutes de diodes."),
  etapes(["C = I / (2 f ΔV)", "= 0,5 / (2 × 50 × 1)", "= 5 mF"], "Capacité par la formule simplifiée."),
  () => ({ viewBox: "0 0 520 260", dessin: dessinPontQuiz(nouveauMarqueur("fl-l-pq-c")), legende: "Alternance positive : D1 et D4 conduisent ensemble." }),
  etapes(["créneau ±I_d : I_eff = I_d", "I_1 = 2√2 / π × I_d = 0,900 I_d", "λ = I_1 / I_eff = 0,900"], "Facteur de puissance d'un courant en créneaux."),
  etapes(["C double : ΔV divisée par 2 environ", "fenêtre de recharge plus courte", "pointes plus hautes, I_eff plus grande"], "Le coût d'un gros condensateur."),
  etapes(["i_C = i_b - I, de moyenne nulle", "I_C eff² = I_s eff² - I²", "= 25 - 9 = 16 : I_C eff = 4 A"], "Courant efficace du condensateur."),
  etapes(["ΔV_moy = 2 ω L_s I_d / π", "= 2 × 314,16 × 0,0005 × 10 / π", "= 1,0 V"], "Chute due à l'empiètement."),
];

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Un pont de Graetz est alimenté par le réseau à $50\\ \\mathrm{Hz}$. À quelle fréquence la tension redressée ondule-t-elle ?</p>",
        options: ["$25\\ \\mathrm{Hz}$", "$50\\ \\mathrm{Hz}$", "$100\\ \\mathrm{Hz}$", "$300\\ \\mathrm{Hz}$"],
        bonnes: [2],
        explication: "Le pont donne $|v_s|$, qui se répète à chaque alternance : $2f = 100\\ \\mathrm{Hz}$. Le simple alternance ondule à $50\\ \\mathrm{Hz}$, le pont triphasé à $300\\ \\mathrm{Hz}$.",
        resume: "Fréquence d'ondulation",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Dans un redresseur double alternance à transformateur à point milieu, chaque diode doit supporter en inverse deux fois la crête d'un demi-secondaire.</p>",
        reponse: true,
        explication: "La diode bloquée voit sa demi-bobine et la charge en série : $2V_m$. Dans le pont, ce n'est que $V_m$.",
        resume: "Tension inverse au point milieu",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Un pont de Graetz à diodes idéales est alimenté sous $24\\ \\mathrm{V}$ efficaces et débite sur une résistance. Tension moyenne de la charge, en volts ?</p>",
        valeur: (2 * RAC2 * 24) / Math.PI,
        unite: "V",
        tolerance: 0.01,
        explication: "$V_{moy} = 2\\sqrt{2} \\times 24/\\pi = 21{,}61\\ \\mathrm{V}$.",
        resume: "Tension moyenne du pont",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi la tension continue d'un pont de Graetz est-elle diminuée de deux chutes de diode, et non d'une seule ?</p>",
        motsCles: [["deux", "2", "paire"], ["serie", "chemin", "traverse", "passe"], ["diode", "diodes"]],
        minimum: 2,
        explication: "À chaque alternance, le courant part de la source, traverse une diode vers la borne $+$, la charge, puis une seconde diode vers l'autre borne de la source : deux diodes en série.",
        resume: "Deux chutes de diode",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Un pont en $50\\ \\mathrm{Hz}$ alimente une charge de $0{,}5\\ \\mathrm{A}$ constants. Capacité minimale, en millifarads, pour une ondulation de $1\\ \\mathrm{V}$, formule simplifiée ?</p>",
        valeur: 5,
        unite: "mF",
        tolerance: 0.01,
        explication: "$C = I/(2f\\Delta V) = 0{,}5/(100 \\times 1) = 5\\ \\mathrm{mF}$.",
        resume: "Capacité de filtrage",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Pendant l'alternance positive, $D_1$ conduit. Quelle autre diode conduit en même temps qu'elle ?</p>",
        consigne: "Cliquez sur la diode correspondante.",
        viewBox: "0 0 520 260",
        dessin: dessinPontQuiz("fl-l-pq"),
        zones: ZONES_PONT,
        explication: "Le courant sort de A, traverse $D_1$ vers P, la charge de P vers N, puis $D_4$ de N vers B pour revenir à la source. $D_2$ et $D_3$ sont bloquées.",
        resume: "Lecture du pont",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Un pont de Graetz débite un courant parfaitement lissé par une forte inductance. Quel est son facteur de puissance côté source ?</p>",
        options: ["$1{,}00$", "$0{,}90$", "$0{,}70$", "$0{,}64$"],
        bonnes: [1],
        explication: "Le courant de source est un créneau $\\pm I_d$ : $I_1 = 0{,}900\\,I_d$, $I_{eff} = I_d$, fondamental en phase : $\\lambda = 2\\sqrt{2}/\\pi = 0{,}90$.",
        resume: "Facteur de puissance en créneaux",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Doubler la capacité de filtrage divise l'ondulation à peu près par deux, sans autre conséquence sur les diodes ni sur le transformateur.</p>",
        reponse: false,
        explication: "L'ondulation baisse bien, mais la fenêtre de recharge se rétrécit : impulsions plus hautes, courant efficace et appel à la mise sous tension plus grands.",
        resume: "Effet d'un gros condensateur",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Le courant de source d'un redresseur à condensateur vaut $5\\ \\mathrm{A}$ efficaces et la charge consomme $3\\ \\mathrm{A}$ continus. Courant efficace dans le condensateur, en ampères ?</p>",
        valeur: 4,
        unite: "A",
        tolerance: 0.01,
        explication: "$i_C = i_b - I$ est de moyenne nulle et $i_b$ a la valeur efficace de $i_s$ : $I_{C,eff} = \\sqrt{5^2 - 3^2} = 4\\ \\mathrm{A}$.",
        resume: "Courant du condensateur",
      },
      {
        type: "calcul",
        enonce: repere(9) + "<p>Un transformateur présente une inductance de fuite de $0{,}5\\ \\mathrm{mH}$ ramenée au secondaire ; le pont débite $10\\ \\mathrm{A}$ lissés à $50\\ \\mathrm{Hz}$. Chute de tension moyenne due à l'empiètement, en volts ?</p>",
        valeur: (2 * TAU * 50 * 0.0005 * 10) / Math.PI,
        unite: "V",
        tolerance: 0.02,
        explication: "$\\Delta V_{moy} = 2\\omega L_s I_d/\\pi = 2 \\times 314{,}16 \\times 0{,}0005 \\times 10/\\pi = 1{,}0\\ \\mathrm{V}$.",
        resume: "Chute d'empiètement",
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
      { categorie: "Principe", question: "Que fait un pont de Graetz ?", reponse: "Il donne $|v_s|$ à la charge : une paire de diodes conduit pendant chaque alternance, et le courant traverse la charge toujours dans le même sens." },
      { categorie: "Formule", question: "Tension moyenne d'un pont sur résistance ?", reponse: "$V_{moy} = 2V_m/\\pi = 0{,}900\\,V_s$, moins deux chutes de diode ; le simple alternance donne la moitié." },
      { categorie: "Diodes", question: "Tension inverse d'une diode de pont ?", reponse: "$V_m$ ; au point milieu ou en simple alternance filtré, $2V_m$ ; à prendre au réseau haut avec une marge de $1{,}5$ à $2{,}5$." },
      { categorie: "Spectre", question: "Que contient la tension redressée par un pont ?", reponse: "Une moyenne $2V_m/\\pi$ et des rangs pairs : $100\\ \\mathrm{Hz}$ d'amplitude $4V_m/(3\\pi)$, puis $200\\ \\mathrm{Hz}$, et ainsi de suite." },
      { categorie: "Inductance", question: "Effet d'une forte inductance de lissage ?", reponse: "Courant de charge constant $I_d$, courant de source en créneaux, $\\lambda = 0{,}90$, diodes à $I_d/2$ moyens et $I_d/\\sqrt{2}$ efficaces." },
      { categorie: "Condensateur", question: "Comment se calcule l'ondulation ?", reponse: "$\\Delta V = I\\,t_d/C \\leq I/(2fC)$ : la charge perdue pendant la décharge, divisée par $C$.", rappel: "Exemple : $2\\ \\mathrm{A}$, $1\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$ : $20\\ \\mathrm{mF}$ simplifié, $18{,}1\\ \\mathrm{mF}$ affiné." },
      { categorie: "Courants", question: "Pourquoi les pointes de courant ?", reponse: "La charge $I\\,T/2$ est rendue pendant une courte fenêtre près de la crête ; seule l'impédance de la source limite la pointe." },
      { categorie: "Condensateur", question: "Quel courant chauffe le condensateur ?", reponse: "$I_{C,eff} = \\sqrt{I_{s,eff}^2 - I^2}$, souvent supérieur au courant continu : à comparer au courant admissible à $100\\ \\mathrm{Hz}$." },
      { categorie: "Réseau", question: "Facteur de puissance d'un redresseur à condensateur ?", reponse: "Environ $0{,}6$ à $0{,}75$ avec un fondamental en phase ; harmoniques de rang 3 qui s'additionnent dans le neutre." },
      { categorie: "Protection", question: "Pourquoi une précharge ?", reponse: "Condensateur vide : appel $V_m/R_s$, des centaines d'ampères possibles ; une résistance court-circuitée ensuite le limite, en dissipant $\\tfrac{1}{2}CV^2$." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["branche : D1 en haut, D2 en bas", "D2 passante relie A à N", "D1 voit P - N = v_ch ≤ V_m"], "Tension inverse dans le pont."),
  etapes(["ΔV ≈ I / (2 f C)", "= 4 / (2 × 50 × 0,010)", "= 4 V"], "Ondulation par la formule simplifiée."),
  etapes(["condensateur : courant impulsionnel, λ ≈ 0,7", "inductance : créneaux, λ = 0,90", "résistance : sinusoïde, λ = 1"], "Facteur de puissance selon le filtrage."),
  etapes(["P = V_F0 I_moy + r_F I_eff²", "= 1,0 × 5 + 0,02 × 8²", "= 5 + 1,28 = 6,28 W"], "Pertes de conduction d'une diode."),
  etapes(["V_m = 24 × √2 = 33,94 V", "C chargé à +V_m, source à -V_m", "v_D = -2 V_m = -67,9 V"], "Tension inverse en simple alternance filtré."),
  etapes(["n_s = 60 f / p = 1500 tr/min", "g = (1500 - 1470) / 1500", "= 0,02 = 2 %"], "Glissement d'un moteur asynchrone."),
  etapes(["f_c = 1 / (2 π R C)", "= 1 / (2 π × 10 000 × 22 × 10⁻⁶)", "= 0,723 Hz"], "Fréquence de coupure d'un filtre RC."),
];

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "vraiFaux",
        enonce: repere(0) + "<p>Cette séance. Dans un pont de Graetz, une diode bloquée supporte au plus la tension de crête $V_m$ de la source.</p>",
        reponse: true,
        explication: "La diode passante de la même branche relie l'une de ses bornes à la barre N : elle voit la tension entre P et N, au plus $V_m$.",
        resume: "Tension inverse dans le pont",
      },
      {
        type: "calcul",
        enonce: repere(1) + "<p>Cette séance. Un pont en $50\\ \\mathrm{Hz}$ charge un condensateur de $10\\ \\mathrm{mF}$ qui débite $4\\ \\mathrm{A}$ constants. Ondulation crête à crête selon la formule simplifiée, en volts ?</p>",
        valeur: 4,
        unite: "V",
        tolerance: 0.01,
        explication: "$\\Delta V = I/(2fC) = 4/(100 \\times 0{,}010) = 4\\ \\mathrm{V}$.",
        resume: "Ondulation",
      },
      {
        type: "qcm",
        enonce: repere(2) + "<p>Cette séance. Classez par facteur de puissance décroissant le pont de Graetz chargé par une résistance seule (a), par une forte inductance (b), par un condensateur (c).</p>",
        options: ["a, b, c", "b, a, c", "c, b, a", "a, c, b"],
        bonnes: [0],
        explication: "Résistance : courant sinusoïdal, $\\lambda = 1$ ; inductance : créneaux, $0{,}90$ ; condensateur : impulsions, environ $0{,}7$.",
        resume: "Facteur de puissance et filtrage",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Diodes de puissance. Une diode de paramètres $V_{F0} = 1{,}0\\ \\mathrm{V}$ et $r_F = 20\\ \\mathrm{m\\Omega}$ conduit $5\\ \\mathrm{A}$ moyens et $8\\ \\mathrm{A}$ efficaces. Pertes de conduction, en watts ?</p>",
        valeur: 6.28,
        unite: "W",
        tolerance: 0.01,
        explication: "$P = 1{,}0 \\times 5 + 0{,}020 \\times 8^2 = 5 + 1{,}28 = 6{,}28\\ \\mathrm{W}$.",
        resume: "Pertes d'une diode",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Cours Diodes de puissance. Un redresseur simple alternance filtré par un condensateur est alimenté sous $24\\ \\mathrm{V}$ efficaces. Tension inverse maximale de la diode, en volts, diodes idéales ?</p>",
        valeur: 2 * 24 * RAC2,
        unite: "V",
        tolerance: 0.01,
        explication: "Le condensateur reste chargé à $V_m = 33{,}94\\ \\mathrm{V}$ quand la source passe à $-V_m$ : la diode voit $2V_m = 67{,}9\\ \\mathrm{V}$.",
        resume: "Tension inverse avec condensateur",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Moteur asynchrone triphasé. Un moteur à quatre pôles alimenté en $50\\ \\mathrm{Hz}$ tourne à $1470\\ \\mathrm{tr/min}$. Glissement, en pour cent ?</p>",
        valeur: 2,
        unite: "%",
        tolerance: 0.01,
        explication: "$n_s = 60f/p = 1500\\ \\mathrm{tr/min}$ avec $p = 2$ paires de pôles ; $g = (1500 - 1470)/1500 = 2\\ \\%$.",
        resume: "Glissement",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Révision 2 et mini-projet capteur. Le filtre de la mesure de température de l'armoire déportée associe $10\\ \\mathrm{k\\Omega}$ et $22\\ \\mathrm{\\mu F}$. Fréquence de coupure, en hertz ?</p>",
        valeur: 1 / (TAU * 10000 * 22e-6),
        unite: "Hz",
        tolerance: 0.01,
        explication: "$f_c = 1/(2\\pi RC) = 1/(2\\pi \\times 10^4 \\times 22 \\times 10^{-6}) = 0{,}723\\ \\mathrm{Hz}$ : un filtre passe-bas, comme le condensateur d'un redresseur, mais pour un signal de mesure.",
        resume: "Fréquence de coupure",
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
    titre: "Où en suis-je sur les redresseurs monophasés ?",
  });
  if (auto) ressources.push(auto);
}
