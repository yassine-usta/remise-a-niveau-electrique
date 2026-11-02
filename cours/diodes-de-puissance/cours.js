/* ==========================================================================
   cours/diodes-de-puissance/cours.js
   Diodes de puissance : jonction PN manipulable, caractéristique en
   température, redresseur simple alternance sur cinq charges, récupération
   inverse, exercices, quiz, cartes, révision espacée et auto-évaluation.
   Le module n'utilise que l'objet api et le DOM de la racine du cours.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];
let compteurMarqueurs = 0;

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const TAU = 2 * Math.PI;
const RAC2 = Math.SQRT2;

/* --------------------------------------------------------------------------
   Modèles physiques
   -------------------------------------------------------------------------- */

const K_Q = 8.617333e-5; /* k / q, en V/K */

/* Diode de 1200 V, 40 A de la séance : n = 1,5, r_s = 4 mohms à 25 degrés,
   I_S réglé pour v = 0,85 V à 10 A et 25 degrés, E_g = 1,11 eV, XTI = 3. */
const DIODE = { n: 1.5, rs0: 0.004, beta: 0.006, Eg: 1.11, T0: 298.15 };
DIODE.Is0 = 10 / Math.exp((0.85 - DIODE.rs0 * 10) / (DIODE.n * K_Q * DIODE.T0));

function vDiode(i, T) {
  const Tk = T + 273.15;
  const Vt = K_Q * Tk;
  const Is = DIODE.Is0 * Math.pow(Tk / DIODE.T0, 3 / DIODE.n) * Math.exp(((Tk / DIODE.T0 - 1) * DIODE.Eg) / (DIODE.n * Vt));
  return DIODE.n * Vt * Math.log(i / Is + 1) + DIODE.rs0 * (1 + DIODE.beta * (T - 25)) * i;
}

/** Modèle linéaire tiré entre 20 et 80 A à la température T. */
function modeleLineaire(T) {
  const v1 = vDiode(20, T);
  const v2 = vDiode(80, T);
  const r = (v2 - v1) / 60;
  return { V0: v1 - 20 * r, r };
}

/** Jonction PN idéale de démonstration : I_S = 1 pA, n = 1, 300 K. */
const JONCTION = { Is: 1e-12, Vt: K_Q * 300, Vbi: 0.7 };

const CHARGES = ["", "R seule", "R et L en série", "R et L avec roue libre", "R et batterie E", "R et condensateur C"];

/**
 * Redresseur simple alternance en régime établi, diode V0 = 0,8 V et
 * r = 10 mohms, source sans impédance sauf 0,5 ohm pour la charge capacitive.
 * Intégration exponentielle par pas, exacte pour chaque état linéaire.
 */
function redresseur(p) {
  const V0 = 0.8;
  const r = 0.01;
  const rs = 0.5;
  const f = 50;
  const T = 1 / f;
  const N = 1000;
  const dt = T / N;
  const Vm = p.Veff * RAC2;
  const type = p.type;
  const R = p.R;
  const L = Math.max(1e-4, p.L);
  const C = p.C;
  const E = p.E;
  let i = type === 3 ? Vm / Math.PI / R : 0;
  let vc = type === 5 ? Math.max(0, Vm - V0) * 0.9 : 0;
  const periodes = 30;
  const points = [];
  for (let k = 0; k < periodes * N; k += 1) {
    const t = k * dt;
    const vs = Vm * Math.sin(TAU * f * t);
    let vch = 0;
    let iD = 0;
    let iCh = 0;
    let iRL = 0;
    if (type === 1) {
      iD = vs > V0 ? (vs - V0) / (R + r) : 0;
      vch = R * iD;
      iCh = iD;
    } else if (type === 2) {
      if (i > 0 || vs > V0) {
        const cible = (vs - V0) / (R + r);
        i = cible + (i - cible) * Math.exp((-(R + r) * dt) / L);
        if (i < 0) i = 0;
      }
      iD = i;
      vch = i > 0 ? vs - V0 - r * i : 0;
      iCh = i;
    } else if (type === 3) {
      const vapp = vs > 0 ? vs - V0 : i > 0 ? -V0 : 0;
      const Req = vs > 0 ? R + r : R;
      const cible = vapp / Req;
      i = cible + (i - cible) * Math.exp((-Req * dt) / L);
      if (i < 0) i = 0;
      iD = vs > 0 ? i : 0;
      iRL = vs > 0 ? 0 : i;
      vch = vs > 0 ? vs - V0 - r * i : i > 0 ? -V0 : 0;
      iCh = i;
    } else if (type === 4) {
      iD = vs - V0 - E > 0 ? (vs - V0 - E) / (R + r) : 0;
      vch = E + R * iD;
      iCh = iD;
    } else {
      if (vs - V0 > vc) {
        const g = 1 / rs + 1 / R;
        const cible = (vs - V0) / rs / g;
        vc = cible + (vc - cible) * Math.exp((-g * dt) / C);
      } else {
        vc *= Math.exp(-dt / (R * C));
      }
      iD = Math.max(0, (vs - V0 - vc) / rs);
      vch = vc;
      iCh = vc / R;
    }
    if (k >= (periodes - 2) * N) {
      points.push({ t: (t - (periodes - 2) * T) * 1000, vs, vch, vD: vs - vch, iD, iCh, iRL });
    }
  }
  const n = points.length;
  let sV = 0;
  let sI = 0;
  let sI2 = 0;
  let sP = 0;
  let cond = 0;
  let vinv = 0;
  let imax = 0;
  let ichMin = Infinity;
  let ichMax = -Infinity;
  let sCh = 0;
  for (const q of points) {
    sV += q.vch;
    sI += q.iD;
    sI2 += q.iD * q.iD;
    sCh += q.iCh;
    if (q.iD > 0) sP += (V0 + r * q.iD) * q.iD;
    if (q.iD > 1e-6) cond += 1;
    if (q.vD < vinv) vinv = q.vD;
    if (q.iD > imax) imax = q.iD;
    if (q.iCh < ichMin) ichMin = q.iCh;
    if (q.iCh > ichMax) ichMax = q.iCh;
  }
  return {
    points,
    Vm,
    Vmoy: sV / n,
    Imoy: sI / n,
    Ieff: Math.sqrt(sI2 / n),
    Pd: sP / n,
    angle: (cond / n) * 360,
    vinv,
    imax,
    ichMoy: sCh / n,
    ichMin,
    ichMax,
  };
}

/** Récupération inverse, modèle triangulaire. Unités SI. */
function recouvrement(Qrr, didt, S, VR, Ls) {
  const Irrm = Math.sqrt((2 * Qrr * didt) / (1 + S));
  const ta = Irrm / didt;
  const tb = S * ta;
  return { Irrm, ta, tb, trr: ta + tb, dV: (Ls * Irrm) / tb, Ed: (VR * Irrm * tb) / 6, Et: VR * Qrr };
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

/** Notation scientifique à la française : 1,25e-3 devient 1,25 × 10^-3. */
function scientifique(valeur, chiffres = 3) {
  if (!Number.isFinite(valeur)) return "-";
  if (valeur === 0) return "0";
  const exposant = Math.floor(Math.log10(Math.abs(valeur)));
  if (exposant >= -2 && exposant <= 3) return valeur.toFixed(Math.max(0, chiffres - 1 - exposant)).replace(".", ",");
  const mantisse = valeur / Math.pow(10, exposant);
  return mantisse.toFixed(chiffres - 1).replace(".", ",") + " × 10^" + exposant;
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

/** Diode horizontale, anode à gauche. */
function diodeH(x1, x2, y, s = 11) {
  const m = (x1 + x2) / 2;
  const a = m - s * 0.7;
  const b = m + s * 0.7;
  return (
    '<path d="M' + x1 + " " + y + "H" + a + "M" + b + " " + y + "H" + x2 + '"/>' +
    '<path d="M' + a + " " + (y - s) + "L" + b + " " + y + "L" + a + " " + (y + s) + 'Z"/>' +
    '<path d="M' + b + " " + (y - s) + "V" + (y + s) + '"/>'
  );
}

/** Diode verticale, anode en bas, cathode en haut. */
function diodeHaut(x, yb, yh, s = 11) {
  const m = (yb + yh) / 2;
  const a = m + s * 0.7;
  const b = m - s * 0.7;
  return (
    '<path d="M' + x + " " + yb + "V" + a + "M" + x + " " + b + "V" + yh + '"/>' +
    '<path d="M' + (x - s) + " " + a + "L" + x + " " + b + "L" + (x + s) + " " + a + 'Z"/>' +
    '<path d="M' + (x - s) + " " + b + "H" + (x + s) + '"/>'
  );
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
  c.setLineDash([7, 5]);
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

function hauteurEtapes(n) {
  return 30 + n * 22;
}

function etapes(lignes, legende, largeur = 560) {
  return { viewBox: "0 0 " + largeur + " " + hauteurEtapes(lignes.length), dessin: dessinEtapes(lignes, largeur), legende };
}

/** Barres horizontales annotées, pour comparer des grandeurs. */
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
  construireJonction(racine, api);
  construireCaracteristique(racine, api);
  construireRedresseur(racine, api);
  construireRecouvrement(racine, api);
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
  nettoyeurs.push(() => {
    for (const lien of liens) lien.removeEventListener("click", surClic);
  });
}

function construireDessinsStatiques(racine, api) {
  const schemas = [
    ["#d-structure-figure svg", 1.6],
    ["#e-carac-figure svg", 1.6],
    ["#e-formes-figure svg", 1.4],
    ["#f-schema-principal svg", 1.9],
    ["#h-figure svg", 1.5],
    ["#i-variateur-figure svg", 1.8],
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
  const etat = { poignee: null, curseurs: null, lecteur: null, idCurseur: options.idCurseur, versCurseur: options.versCurseur, verrou: false, valeur: null };
  etat.appliquer = (valeur, source) => {
    if (etat.verrou) return;
    etat.verrou = true;
    etat.valeur = valeur;
    dessiner(valeur);
    if (source !== "poignee" && etat.poignee) etat.poignee.set(valeur, false);
    if (source !== "curseur" && etat.curseurs && etat.idCurseur) {
      etat.curseurs.definir(etat.idCurseur, etat.versCurseur ? etat.versCurseur(valeur) : valeur);
    }
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
      id: "c-moyenne",
      titre: "Valeur moyenne d'une alternance seule",
      niveau: "prérequis",
      enonce:
        "<p>Un signal vaut $100\\sin\\theta$ volts pendant la première demi-période et $0$ pendant la seconde. Quelle est sa valeur moyenne sur une période ?</p>",
      valeur: 100 / Math.PI,
      unite: "V",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Valeur moyenne",
      etapes: [
        { texte: "$\\langle v\\rangle = \\dfrac{1}{2\\pi}\\int_0^{\\pi} 100\\sin\\theta\\,\\mathrm{d}\\theta$." },
        { texte: "$\\int_0^{\\pi}\\sin\\theta\\,\\mathrm{d}\\theta = [-\\cos\\theta]_0^{\\pi} = 2$." },
        { texte: "$\\langle v\\rangle = 200/(2\\pi) = 100/\\pi = 31{,}83\\ \\mathrm{V}$.", note: "C'est la tension moyenne d'un redresseur simple alternance idéal de crête $100\\ \\mathrm{V}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Alternance positive seule et sa moyenne",
          xTitre: "angle",
          xUnite: "rad",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 2 * TAU,
          yMin: -10,
          yMax: 110,
          series: [{ id: "v", nom: "v(θ), une alternance sur deux", couleur: "serie-1", epaisseur: 2.4, fonction: (x) => Math.max(0, 100 * Math.sin(x)) }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 100 / Math.PI, "moyenne 31,83 V");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-efficace",
      titre: "Valeur efficace de la même alternance",
      niveau: "prérequis",
      enonce: "<p>Quelle est la valeur efficace du même signal, $100\\sin\\theta$ sur la première demi-période et $0$ sur la seconde ?</p>",
      valeur: 50,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Valeur efficace",
      etapes: [
        { texte: "$V_{eff}^2 = \\dfrac{1}{2\\pi}\\int_0^{\\pi} 100^2\\sin^2\\theta\\,\\mathrm{d}\\theta$, avec $\\int_0^{\\pi}\\sin^2\\theta\\,\\mathrm{d}\\theta = \\pi/2$." },
        { texte: "$V_{eff}^2 = 10\\,000 \\times (\\pi/2)/(2\\pi) = 2500\\ \\mathrm{V^2}$." },
        { texte: "$V_{eff} = 50\\ \\mathrm{V} = V_m/2$.", note: "Le rapport efficace sur moyenne vaut $\\pi/2 = 1{,}571$ : il reviendra dans les pertes des diodes." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["sinusoïde complète : V_eff = 100 / √2 = 70,7 V", "une alternance sur deux : énergie divisée par 2", "V_eff = 70,7 / √2 = 50 V"], "Moitié de l'énergie, donc valeur efficace divisée par racine de deux.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-energie",
      titre: "Énergie d'une bobine de frein",
      niveau: "prérequis",
      enonce: "<p>Une bobine de frein de $10\\ \\mathrm{H}$ est parcourue par $0{,}5\\ \\mathrm{A}$. Quelle énergie faut-il dissiper quand on coupe son alimentation ?</p>",
      valeur: 1.25,
      unite: "J",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Énergie stockée",
      etapes: [
        { texte: "$W = \\tfrac{1}{2}LI^2$." },
        { texte: "$W = 0{,}5 \\times 10 \\times 0{,}5^2 = 1{,}25\\ \\mathrm{J}$." },
        { texte: "Cette énergie doit trouver un chemin : diode de roue libre, varistance ou diode Zener.", note: "Sans chemin, la surtension $L\\,\\mathrm{d}i/\\mathrm{d}t$ claque l'interrupteur ou la diode." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["W = L I² / 2", "= 0,5 × 10 × 0,25", "= 1,25 J à évacuer à la coupure"], "Énergie magnétique de la bobine.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : jonction PN sous tension
   -------------------------------------------------------------------------- */

function tensionDe(u) {
  return u <= 0.6 ? -20 + (u / 0.6) * 20 : ((u - 0.6) / 0.4) * 0.8;
}

function uDe(v) {
  return v <= 0 ? ((v + 20) / 20) * 0.6 : 0.6 + (v / 0.8) * 0.4;
}

function construireJonction(racine, api) {
  const conteneur = racine.querySelector("#d-jonction");
  if (!conteneur) return;
  const X0 = 120;
  const X1 = 640;
  const XM = 380;
  const Y0 = 70;
  const Y1 = 200;
  const W0 = 60;
  const AXE = 280;
  const id = nouveauMarqueur("fl-d-jo");
  const idO = nouveauMarqueur("fl-d-jo-o");

  const svg = svgEl("svg", {
    viewBox: "0 0 760 350",
    role: "img",
    "aria-label": "Jonction PN : zone de charge d'espace dont la largeur varie avec la tension appliquée, porteurs majoritaires et injection en direct",
  });
  let fond = "<defs>" + marqueur(id) + marqueur(idO, true) + "</defs>";
  fond += TRAITS + ' stroke-width="2"><rect x="' + X0 + '" y="' + Y0 + '" width="' + (X1 - X0) + '" height="' + (Y1 - Y0) + '" rx="3"/>';
  fond += '<path d="M' + X0 + " " + (Y0 + 65) + "H70M" + X1 + " " + (Y0 + 65) + 'H690"/></g>';
  fond += TRAITS + ' stroke-width="1" stroke-dasharray="2 4"><path d="M' + XM + " " + (Y0 - 8) + "V" + (Y1 + 8) + '"/></g>';
  fond += TRAITS + ' stroke-width="1.3"><path d="M' + X0 + " " + AXE + "H" + X1 + '"/>';
  let ecr = "";
  for (const v of [-20, -15, -10, -5, 0, 0.4, 0.8]) {
    const x = X0 + uDe(v) * (X1 - X0);
    fond += '<path d="M' + x.toFixed(1) + " " + (AXE - 5) + 'v10"/>';
    ecr += texte(x - (v < 0 ? 12 : v === 0 ? 4 : 10), AXE + 22, String(v).replace(".", ","));
  }
  fond += "</g>";
  ecr +=
    texte(X0 + 8, Y0 - 10, "P : anode") + texte(X1 - 92, Y0 - 10, "N : cathode") + texte(30, Y0 + 60, "A") + texte(700, Y0 + 60, "K") +
    texte(X0, AXE + 42, "tension appliquée v = v_A - v_K (V), échelle dilatée au-dessus de 0") + texte(X0, 342, "cathode : potentiel de référence");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecr + "</g>";
  const zone = svgEl("g");
  const porteurs = svgEl("g");
  const fleches = svgEl("g");
  const legendes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(groupeFond, zone, porteurs, fleches, legendes);
  conteneur.appendChild(svg);

  /* Positions fixes des porteurs, réparties sans hasard. */
  const positions = [];
  for (let k = 0; k < 64; k += 1) {
    const x = X0 + 14 + (k % 8) * 32 + (Math.floor(k / 8) % 2) * 16;
    const y = Y0 + 12 + Math.floor(k / 8) * 15;
    positions.push([x, y]);
  }

  const valeurs = api.sim.valeurs("#d-jonction-valeurs", [
    { id: "v", libelle: "Tension appliquée v", unite: "V", decimales: 2 },
    { id: "w", libelle: "Largeur W / W(0)", decimales: 2 },
    { id: "i", libelle: "Courant", format: (x) => scientifique(x, 3) + " A" },
    { id: "regime", libelle: "Régime", format: (x) => x },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner(u) {
    const v = tensionDe(u);
    const rapport = Math.sqrt(Math.max(0.01, (JONCTION.Vbi - v) / JONCTION.Vbi));
    const W = W0 * rapport;
    const g = XM - W / 2;
    const d = XM + W / 2;
    const i = JONCTION.Is * (Math.exp(v / JONCTION.Vt) - 1);
    let s = TRAITS + ' stroke-width="1.6" stroke-dasharray="6 4"><rect x="' + g.toFixed(1) + '" y="' + (Y0 + 4) + '" width="' + W.toFixed(1) + '" height="' + (Y1 - Y0 - 8) + '"/></g>';
    s += ECRITS;
    if (W > 14) {
      const colonnes = Math.max(1, Math.floor(W / 2 / 18));
      for (let c = 0; c < colonnes; c += 1) {
        for (let r = 0; r < 4; r += 1) {
          const y = Y0 + 32 + r * 28;
          s += texte(XM - 12 - c * 18, y, "-") + texte(XM + 5 + c * 18, y, "+");
        }
      }
    }
    s += "</g>";
    zone.innerHTML = s;
    let p = "";
    for (const [x, y] of positions) {
      if (x < g - 4) p += '<circle cx="' + x + '" cy="' + y + '" r="3.4" fill="currentColor"/>';
      const xn = 2 * XM - x;
      if (xn > d + 4) p += '<circle cx="' + xn + '" cy="' + y + '" r="3.4" fill="none" stroke="currentColor" stroke-width="1.3"/>';
    }
    porteurs.innerHTML = p;
    const nb = i > 1e-4 ? Math.min(6, Math.max(1, Math.round(Math.log10(i / 1e-4)))) : 0;
    let f = "";
    for (let k = 0; k < nb; k += 1) {
      const y = Y0 + 20 + k * 18;
      if (k % 2 === 0) f += seg([XM - 70, y], [XM + 60, y], ' marker-end="url(#' + id + ')"');
      else f += seg([XM + 70, y], [XM - 60, y], ' marker-end="url(#' + idO + ')"');
    }
    let sens = "";
    if (i > 1e-6) sens = seg([300, 30], [460, 30], ' marker-end="url(#' + id + ')"');
    else if (v < -0.1) sens = seg([440, 30], [320, 30], ' stroke-dasharray="3 4" marker-end="url(#' + id + ')"');
    fleches.innerHTML = TRAITS + ' stroke-width="1.8">' + f + sens + "</g>";
    legendes.innerHTML =
      texte(470, 34, i > 1e-6 ? "courant direct i" : v < -0.1 ? "fuite -I_S, infime" : "courant quasi nul") +
      texte(g - 10 > X0 + 4 ? Math.max(X0 + 4, XM - 90) : X0 + 4, Y1 + 22, "zone de charge d'espace, W = " + nombre(api, rapport, 2) + " W(0)");
    const regime = v < -0.1 ? "inverse : barrière renforcée, zone élargie" : v < 0.45 ? "direct faible : courant encore négligeable" : "direct : barrière abaissée, injection";
    if (valeurs) valeurs.maj({ v, w: rapport, i, regime });
  }

  const synchro = synchroniseur(dessiner, { idCurseur: "v", versCurseur: (u) => Math.round(tensionDe(u) * 100) / 100 });
  synchro.curseurs = api.sim.curseurs(
    "#d-jonction-curseurs",
    [{ id: "v", libelle: "Tension appliquée v", min: -20, max: 0.8, pas: 0.01, valeur: -5, unite: "V" }],
    (lues) => synchro.appliquer(uDe(lues.v), "curseur")
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: X0, y: AXE },
    a: { x: X1, y: AXE },
    min: 0,
    max: 1,
    pas: 0.005,
    valeur: uDe(-5),
    libelle: "Tension appliquée à la jonction",
    format: (m) => nombre(api, tensionDe(m.valeur), 2) + " volts",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);
  synchro.lecteur = api.sim.lecteur("#d-jonction-lecteur", {
    de: 0,
    a: 1,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Balayage de -20 à +0,8 V",
    rappel: (u) => synchro.appliquer(u, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  synchro.appliquer(uDe(-5), null);
}

/* --------------------------------------------------------------------------
   E. Simulation : caractéristique directe en température
   -------------------------------------------------------------------------- */

function construireCaracteristique(racine, api) {
  const conteneur = racine.querySelector("#e-carac-sim");
  if (!conteneur) return;
  const BX = 90;
  const BL = 610;
  const BY = 30;
  const BH = 320;
  const IMAX = 120;
  const versX = (i) => BX + (i / IMAX) * BL;
  const versY = (v) => BY + BH - ((v - 0.3) / 1.5) * BH;
  const reglages = { T: 125 };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 430",
    role: "img",
    "aria-label": "Caractéristique directe de la diode à 25 degrés et à la température choisie, avec le modèle linéaire et le point de fonctionnement",
  });
  let fond = TRAITS + ' stroke-width="1.3"><path d="M' + BX + " " + (BY + BH) + "H" + (BX + BL) + "M" + BX + " " + (BY + BH) + "V" + BY + '"/>';
  let ecr = "";
  for (let i = 0; i <= IMAX; i += 20) {
    fond += '<path d="M' + versX(i).toFixed(1) + " " + (BY + BH) + 'v6"/>';
    ecr += texte(versX(i) - (i < 10 ? 4 : i < 100 ? 8 : 12), BY + BH + 22, String(i));
  }
  for (const v of [0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8]) {
    fond += '<path d="M' + (BX - 6) + " " + versY(v).toFixed(1) + 'h6"/>';
    ecr += texte(BX - 38, versY(v) + 4, v.toFixed(1).replace(".", ","));
  }
  fond += "</g>";
  ecr += texte(BX + BL - 150, BY + BH + 44, "courant i_F (A)") + texte(BX + 8, BY + 12, "tension directe v_F (V)") + texte(BX, BY + BH + 66, "poignée : courant de la diode, sur l'axe des abscisses");
  const groupeFond = svgEl("g");
  groupeFond.innerHTML = fond + ECRITS + ecr + "</g>";
  const ref = svgEl("polyline", { fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-dasharray": "8 5" });
  const chaud = svgEl("polyline", { fill: "none", stroke: "currentColor", "stroke-width": 2.8, "stroke-linejoin": "round" });
  const lineaire = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.5, "stroke-dasharray": "2 4" });
  const mobile = svgEl("g");
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(groupeFond, ref, chaud, lineaire, mobile, etiquettes);
  conteneur.appendChild(svg);

  const pts25 = [];
  for (let k = 0; k <= 120; k += 1) {
    const i = (k / 120) * IMAX;
    const v = vDiode(Math.max(i, 1e-3), 25);
    if (v >= 0.3) pts25.push([versX(i), versY(v)]);
  }
  ref.setAttribute("points", chaine(pts25));

  const valeurs = api.sim.valeurs("#e-carac-valeurs", [
    { id: "i", libelle: "Courant i_F", unite: "A", decimales: 1 },
    { id: "vT", libelle: "v_F à la température choisie", unite: "V", decimales: 3 },
    { id: "v25", libelle: "v_F à 25 °C", unite: "V", decimales: 3 },
    { id: "dvdT", libelle: "Coefficient de température", unite: "mV/K", decimales: 2 },
    { id: "V0", libelle: "V_F0 du modèle linéaire", unite: "V", decimales: 3 },
    { id: "r", libelle: "r_F du modèle linéaire", unite: "mΩ", decimales: 2 },
    { id: "erreur", libelle: "Écart modèle linéaire - courbe", unite: "mV", decimales: 0 },
    { id: "p", libelle: "Puissance instantanée v_F i_F", unite: "W", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function tracerChaud() {
    const pts = [];
    for (let k = 0; k <= 120; k += 1) {
      const i = (k / 120) * IMAX;
      const v = vDiode(Math.max(i, 1e-3), reglages.T);
      if (v >= 0.3 && v <= 1.8) pts.push([versX(i), versY(v)]);
    }
    chaud.setAttribute("points", chaine(pts));
    const m = modeleLineaire(reglages.T);
    const iFin = Math.min(IMAX, (1.8 - m.V0) / m.r);
    lineaire.setAttribute("d", "M" + versX(0).toFixed(1) + " " + versY(m.V0).toFixed(1) + "L" + versX(iFin).toFixed(1) + " " + versY(m.V0 + m.r * iFin).toFixed(1));
  }

  function dessiner(i) {
    const T = reglages.T;
    const vT = vDiode(i, T);
    const v25 = vDiode(i, 25);
    const m = modeleLineaire(T);
    const x = versX(i);
    mobile.innerHTML =
      TRAITS + ' stroke-width="1" stroke-dasharray="2 4"><path d="M' + x.toFixed(1) + " " + (BY + BH) + "V" + Math.min(versY(vT), versY(v25)).toFixed(1) + '"/></g>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + versY(vT).toFixed(1) + '" r="5.5" fill="currentColor"/>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + versY(v25).toFixed(1) + '" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/>';
    const xEt = x > BX + BL * 0.6 ? x - 210 : x + 12;
    etiquettes.innerHTML =
      texte(xEt, versY(Math.max(vT, v25)) - 14, "plein : " + T + " °C, creux : 25 °C") +
      texte(BX + BL - 330, versY(0.45), "tirets : 25 °C") + texte(BX + BL - 330, versY(0.38), "trait plein : " + T + " °C, pointillés : linéaire");
    const dvdT = ((vDiode(i, T + 1) - vDiode(i, T - 1)) / 2) * 1000;
    if (valeurs) {
      valeurs.maj({ i, vT, v25, dvdT, V0: m.V0, r: m.r * 1000, erreur: (m.V0 + m.r * i - vT) * 1000, p: vT * i });
    }
  }

  const synchro = synchroniseur(dessiner, { idCurseur: "i" });
  synchro.curseurs = api.sim.curseurs(
    "#e-carac-curseurs",
    [
      { id: "T", libelle: "Température de jonction", min: 25, max: 150, pas: 1, valeur: 125, unite: "°C" },
      { id: "i", libelle: "Courant direct i_F", min: 0.5, max: 120, pas: 0.5, valeur: 5, unite: "A" },
    ],
    (lues) => {
      if (lues.T !== reglages.T) {
        reglages.T = lues.T;
        tracerChaud();
        synchro.redessiner();
      }
      synchro.appliquer(lues.i, "curseur");
    }
  );
  if (synchro.curseurs) ressources.push(synchro.curseurs);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: versX(0.5), y: BY + BH },
    a: { x: versX(120), y: BY + BH },
    min: 0.5,
    max: 120,
    pas: 0.5,
    valeur: 5,
    unite: "A",
    libelle: "Courant direct de la diode",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);
  tracerChaud();
  synchro.appliquer(5, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : redresseur simple alternance sur cinq charges
   -------------------------------------------------------------------------- */

function courbeStylee(c, repere, couleurs, points, cle, tirets, epaisseur) {
  c.save();
  c.setLineDash(tirets);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = epaisseur;
  c.beginPath();
  let premier = true;
  for (const q of points) {
    const px = repere.versX(q.t);
    const py = Math.max(repere.boite.y, Math.min(repere.boite.y + repere.boite.h, repere.versY(q[cle])));
    if (premier) c.moveTo(px, py);
    else c.lineTo(px, py);
    premier = false;
  }
  c.stroke();
  c.restore();
}

function construireRedresseur(racine, api) {
  const conteneur = racine.querySelector("#e-redresseur");
  if (!conteneur) return;
  const reglages = { type: 1, Veff: 230, R: 20, L: 0.1, E: 24, C: 4.7e-3 };
  let resultat = null;
  let instant = 5;
  const AXE = 250;
  const TX0 = 120;
  const TX1 = 700;
  const id = nouveauMarqueur("fl-e-red");
  const idO = nouveauMarqueur("fl-e-red-o");

  const svg = svgEl("svg", {
    viewBox: "0 0 760 300",
    role: "img",
    "aria-label": "Schéma du redresseur simple alternance pour la charge choisie, avec les branches parcourues par le courant à l'instant d'observation",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur(id) + marqueur(idO, true);
  const circuit = svgEl("g");
  const axe = svgEl("g");
  let a = TRAITS + ' stroke-width="1.3"><path d="M' + TX0 + " " + AXE + "H" + TX1 + '"/>';
  let ae = "";
  for (let t = 0; t <= 40; t += 5) {
    const x = TX0 + (t / 40) * (TX1 - TX0);
    a += '<path d="M' + x.toFixed(1) + " " + (AXE - 5) + 'v10"/>';
    ae += texte(x - (t < 10 ? 4 : 8), AXE + 22, String(t));
  }
  a += "</g>";
  ae += texte(TX0, AXE + 42, "instant d'observation t (ms), deux périodes de 20 ms");
  axe.innerHTML = a + ECRITS + ae + "</g>";
  svg.append(defs, circuit, axe);
  conteneur.appendChild(svg);

  const tensions = api.sim.traceur("#e-redresseur-tensions", {
    titre: "Tensions sur deux périodes",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "tension",
    yUnite: "V",
    xMin: 0,
    xMax: 40,
    yMin: -400,
    yMax: 400,
    ratio: 0.45,
    series: [{ id: "vch", nom: "v_ch, tension de la charge (trait plein)", couleur: "serie-1", epaisseur: 2.6 }],
    note: "Tirets : tension de source v_s. Pointillés : tension de la diode v_D. Trait vertical : instant d'observation.",
    surDessin({ c, repere, couleurs }) {
      if (!resultat) return;
      courbeStylee(c, repere, couleurs, resultat.points, "vs", [7, 5], 1.4);
      courbeStylee(c, repere, couleurs, resultat.points, "vD", [2, 4], 1.6);
      ligneV(c, repere, couleurs, instant, "t = " + nombre(api, instant, 1) + " ms");
      ligneH(c, repere, couleurs, resultat.Vmoy, "moyenne de v_ch");
    },
  });
  if (tensions) ressources.push(tensions);
  const courants = api.sim.traceur("#e-redresseur-courants", {
    titre: "Courants sur deux périodes",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "courant",
    yUnite: "A",
    xMin: 0,
    xMax: 40,
    yMin: 0,
    yMax: 20,
    ratio: 0.38,
    series: [{ id: "iD", nom: "i_D, courant de la diode D (trait plein)", couleur: "serie-3", epaisseur: 2.6 }],
    note: "Tirets : courant de la charge, quand il diffère de celui de la diode (roue libre, condensateur).",
    surDessin({ c, repere, couleurs }) {
      if (!resultat) return;
      if (reglages.type === 3 || reglages.type === 5) courbeStylee(c, repere, couleurs, resultat.points, "iCh", [7, 5], 1.6);
      ligneV(c, repere, couleurs, instant, "");
    },
  });
  if (courants) ressources.push(courants);

  const valeurs = api.sim.valeurs("#e-redresseur-valeurs", [
    { id: "t", libelle: "Instant t", unite: "ms", decimales: 2 },
    { id: "vs", libelle: "v_s", unite: "V", decimales: 1 },
    { id: "vch", libelle: "v_ch", unite: "V", decimales: 1 },
    { id: "vD", libelle: "v_D", unite: "V", decimales: 1 },
    { id: "iD", libelle: "i_D", unite: "A", decimales: 2 },
    { id: "iCh", libelle: "Courant de la charge", unite: "A", decimales: 2 },
    { id: "etat", libelle: "État des diodes", format: (x) => x },
  ]);
  if (valeurs) ressources.push(valeurs);

  function epais(oui) {
    return oui ? ' stroke-width="3.4"' : ' stroke-width="1.4"';
  }

  function dessinerCircuit(q) {
    const type = reglages.type;
    const conduitD = q.iD > 1e-4;
    const conduitRL = type === 3 && q.iRL > 1e-4;
    const chargeParcourue = Math.abs(q.iCh) > 1e-4;
    let s = "";
    /* Branche source et diode D. */
    s += TRAITS + epais(conduitD) + '><circle cx="80" cy="120" r="24"/><path d="M68 120c4 -10 8 -10 12 0s8 10 12 0"/>';
    s += '<path d="M80 96V50H170M80 144V210H330"/>' + diodeH(170, 250, 50) + '<path d="M250 50H330"/></g>';
    /* Branche de la charge. */
    let col = '<path d="M330 50H460V70M460 120V' + (type === 2 || type === 3 ? 135 : type === 4 ? 180 : 210) + '"/><rect x="452" y="70" width="16" height="50" rx="2"/>';
    if (type === 2 || type === 3) col += '<path d="M460 135c12 0 12 10 0 10c12 0 12 10 0 10c12 0 12 10 0 10c12 0 12 10 0 10M460 175V210"/>';
    if (type === 4) col += '<path d="M444 180H476M452 190H468M460 190V210"/>';
    col += '<path d="M460 210H330"/>';
    s += TRAITS + epais(chargeParcourue || conduitD) + ">" + col + "</g>";
    if (type === 3) s += TRAITS + epais(conduitRL) + ">" + diodeHaut(330, 210, 50) + "</g>";
    if (type === 5) s += TRAITS + epais(true) + '><path d="M460 50H580V122M564 122H596M564 134H596M580 134V210H460"/></g>';
    s += '<g fill="currentColor" stroke="none"><circle cx="330" cy="50" r="3.2"/><circle cx="330" cy="210" r="3.2"/>' + (type === 5 ? '<circle cx="460" cy="50" r="3.2"/><circle cx="460" cy="210" r="3.2"/>' : "") + "</g>";
    s += TRAITS + ' stroke-width="2"><path d="M80 210V226M66 226H94M71 232H89M76 238H84"/></g>';
    s += TRAITS + ' stroke-width="1.6">' + seg([30, 150], [30, 90], ' marker-end="url(#' + id + ')"') + seg([270, 50], [306, 50], ' marker-end="url(#' + id + ')"') +
      seg([236, 24], [184, 24], ' marker-end="url(#' + idO + ')"') + seg([510, 190], [510, 70], ' marker-end="url(#' + idO + ')"') + "</g>";
    let e = ECRITS + texte(12, 84, "v_s") + texte(92, 92, "+") + texte(196, 18, "v_D") + texte(276, 42, "i") + texte(200, 84, "D " + (conduitD ? "passante" : "bloquée")) +
      texte(478, 100, "R") + texte(520, 134, "v_ch") + texte(100, 238, "référence");
    if (type === 2 || type === 3) e += texte(478, 160, "L");
    if (type === 4) e += texte(478, 186, "E") + texte(440, 176, "+");
    if (type === 3) e += texte(250, 150, "D_RL") + texte(236, 166, conduitRL ? "passante" : "bloquée");
    if (type === 5) e += texte(604, 132, "C");
    e += texte(620, 40, "trait épais :") + texte(620, 56, "branche parcourue") + texte(620, 72, "par un courant") + "</g>";
    circuit.innerHTML = s + e;
  }

  function echantillon(t) {
    if (!resultat) return null;
    const pts = resultat.points;
    const k = Math.max(0, Math.min(pts.length - 1, Math.round((t / 40) * (pts.length - 1))));
    return pts[k];
  }

  function dessiner(t) {
    instant = t;
    const q = echantillon(t);
    if (!q) return;
    dessinerCircuit(q);
    const etat = "D " + (q.iD > 1e-4 ? "passante" : "bloquée") + (reglages.type === 3 ? ", D_RL " + (q.iRL > 1e-4 ? "passante" : "bloquée") : "");
    if (valeurs) valeurs.maj({ t, vs: q.vs, vch: q.vch, vD: q.vD, iD: q.iD, iCh: q.iCh, etat });
    if (tensions) tensions.demanderRendu();
    if (courants) courants.demanderRendu();
  }

  function recalculer() {
    resultat = redresseur(reglages);
    const pts = resultat.points;
    const Vm = resultat.Vm;
    const Vlim = Math.max(30, Math.max(Vm, -resultat.vinv) * 1.12);
    tensions.definirPlage({ xMin: 0, xMax: 40, yMin: -Vlim, yMax: Vlim });
    tensions.definirDonnees("vch", pts.map((q) => [q.t, q.vch]));
    const Imax = Math.max(0.1, Math.max(resultat.imax, resultat.ichMax) * 1.15);
    courants.definirPlage({ xMin: 0, xMax: 40, yMin: 0, yMax: Imax });
    courants.definirDonnees("iD", pts.map((q) => [q.t, q.iD]));
    tensions.definirMesures([
      { nom: "Tension moyenne de la charge", valeur: nombre(api, resultat.Vmoy, 1) + " V" },
      { nom: "Référence V_m / π", valeur: nombre(api, Vm / Math.PI, 1) + " V" },
      { nom: "Tension inverse maximale de D", valeur: nombre(api, -resultat.vinv, 1) + " V" },
      { nom: "Angle de conduction de D", valeur: nombre(api, resultat.angle, 0) + " °" },
    ]);
    courants.definirMesures([
      { nom: "I moyen de D", valeur: nombre(api, resultat.Imoy, 2) + " A" },
      { nom: "I efficace de D", valeur: nombre(api, resultat.Ieff, 2) + " A" },
      { nom: "Courant de crête de D", valeur: nombre(api, resultat.imax, 2) + " A" },
      { nom: "Pertes de conduction de D", valeur: nombre(api, resultat.Pd, 2) + " W" },
      { nom: "Courant moyen de la charge", valeur: nombre(api, resultat.ichMoy, 2) + " A" },
    ]);
  }

  const synchro = synchroniseur(dessiner, {});
  const curseurs = api.sim.curseurs(
    "#e-redresseur-curseurs",
    [
      { id: "type", libelle: "Charge", min: 1, max: 5, pas: 1, valeur: 1, format: (v) => CHARGES[Math.round(v)] },
      { id: "Veff", libelle: "Tension efficace de la source", min: 12, max: 400, pas: 1, valeur: 230, unite: "V" },
      { id: "R", libelle: "Résistance R", min: 1, max: 200, pas: 0.5, valeur: 20, unite: "Ω" },
      { id: "L", libelle: "Inductance L (charges 2 et 3)", min: 0.001, max: 1, pas: 0.001, valeur: 0.1, format: (v) => nombre(api, v * 1000, 0) + " mH" },
      { id: "E", libelle: "Force électromotrice E (charge 4)", min: 0, max: 300, pas: 1, valeur: 24, unite: "V" },
      { id: "C", libelle: "Capacité C (charge 5)", min: 100, max: 10000, pas: 100, valeur: 4700, unite: "µF" },
    ],
    (lues) => {
      reglages.type = Math.round(lues.type);
      reglages.Veff = lues.Veff;
      reglages.R = lues.R;
      reglages.L = lues.L;
      reglages.E = lues.E;
      reglages.C = lues.C * 1e-6;
      if (!tensions || !courants) return;
      recalculer();
      synchro.redessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: TX0, y: AXE },
    a: { x: TX1, y: AXE },
    min: 0,
    max: 40,
    pas: 0.2,
    valeur: 5,
    unite: "ms",
    libelle: "Instant d'observation",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);
  synchro.lecteur = api.sim.lecteur("#e-redresseur-lecteur", {
    de: 0,
    a: 40,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Parcours des deux périodes, ralenti",
    rappel: (t) => synchro.appliquer(t, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);

  if (tensions && courants) {
    recalculer();
    synchro.appliquer(5, null);
  }
}

/* --------------------------------------------------------------------------
   E. Animation : récupération inverse
   -------------------------------------------------------------------------- */

function construireRecouvrement(racine, api) {
  const conteneur = racine.querySelector("#e-recouvrement");
  if (!conteneur) return;
  const IF = 30;
  const VR = 400;
  const reglages = { didt: 200, Qrr: 3, S: 1, Ls: 100 };
  const X0 = 90;
  const X1 = 720;
  const YI = 130;
  const YV = 270;
  const AXE = 370;
  let modele = null;
  let fenetre = { debut: 0, fin: 1 };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 420",
    role: "img",
    "aria-label": "Chronogramme du blocage d'une diode : courant avec pointe inverse et tension inverse avec surtension",
  });
  const fond = svgEl("g");
  const courbes = svgEl("g");
  const mobile = svgEl("g");
  const ecrits = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(fond, courbes, mobile, ecrits);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-recouvrement-valeurs", [
    { id: "Irrm", libelle: "I_RRM", unite: "A", decimales: 1 },
    { id: "ta", libelle: "t_a", unite: "ns", decimales: 0 },
    { id: "tb", libelle: "t_b", unite: "ns", decimales: 0 },
    { id: "trr", libelle: "t_rr", unite: "ns", decimales: 0 },
    { id: "dV", libelle: "Surtension L_σ I_RRM / t_b", unite: "V", decimales: 0 },
    { id: "Ed", libelle: "Énergie dans la diode", unite: "mJ", decimales: 3 },
    { id: "Et", libelle: "Supplément pour le transistor", unite: "mJ", decimales: 2 },
    { id: "t", libelle: "Instant", unite: "ns", decimales: 0 },
    { id: "i", libelle: "i_F à cet instant", unite: "A", decimales: 1 },
    { id: "v", libelle: "v_F à cet instant", unite: "V", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  /* Temps en nanosecondes, origine au passage par zéro du courant. */
  function courant(t) {
    const m = modele;
    const t0 = (IF / m.didt) * 1e9;
    const ta = m.ta * 1e9;
    const tb = m.tb * 1e9;
    if (t < -t0) return IF;
    if (t < ta) return -(m.didt * 1e-9) * t;
    if (t < ta + tb) return -m.Irrm * (1 - (t - ta) / tb);
    return 0;
  }

  function tension(t) {
    const m = modele;
    const ta = m.ta * 1e9;
    const tb = m.tb * 1e9;
    if (t < 0) return 1.2;
    if (t < ta) return 1.2 * (1 - t / ta);
    if (t < ta + tb) return -(VR + m.dV) * ((t - ta) / tb);
    const u = t - ta - tb;
    const tau = Math.max(tb, 20) * 0.8;
    return -VR - m.dV * Math.exp(-u / tau) * Math.cos((TAU * u) / (2.5 * tau));
  }

  function construire() {
    modele = recouvrement(reglages.Qrr * 1e-6, reglages.didt * 1e6, reglages.S, VR, reglages.Ls * 1e-9);
    modele.didt = reglages.didt * 1e6;
    const t0 = (IF / modele.didt) * 1e9;
    const trr = modele.trr * 1e9;
    fenetre = { debut: -t0 * 1.15, fin: trr * 2.2 };
    const versX = (t) => X0 + ((t - fenetre.debut) / (fenetre.fin - fenetre.debut)) * (X1 - X0);
    const kI = 70 / Math.max(IF, modele.Irrm);
    const vMax = VR + modele.dV;
    const kV = 80 / vMax;
    modele.versX = versX;
    modele.yI = (i) => YI - i * kI;
    modele.yV = (v) => YV - v * kV;

    let f = TRAITS + ' stroke-width="1.3"><path d="M' + X0 + " " + YI + "H" + X1 + "M" + X0 + " " + YV + "H" + X1 + "M" + X0 + " " + AXE + "H" + X1 + '"/>';
    f += '<path d="M' + versX(0).toFixed(1) + " 40V" + (YV + 100) + '" stroke-dasharray="2 4"/>';
    let e = "";
    const pas = api.util.pasJoli(fenetre.fin - fenetre.debut, 8);
    for (let t = Math.ceil(fenetre.debut / pas) * pas; t <= fenetre.fin; t += pas) {
      const x = versX(t);
      f += '<path d="M' + x.toFixed(1) + " " + (AXE - 5) + 'v10"/>';
      e += texte(x - 10, AXE + 22, String(Math.round(t)));
    }
    f += "</g>";
    f += TRAITS + ' stroke-width="1.2" stroke-dasharray="7 5"><path d="M' + X0 + " " + modele.yV(-VR).toFixed(1) + "H" + X1 + '"/></g>';
    e += texte(X0 - 70, YI + 4, "i_F") + texte(X0 - 70, YV + 4, "v_F") + texte(X0 + 4, YI - 76, "i_F = " + IF + " A") + texte(X1 - 120, modele.yV(-VR) - 6, "-V_R = -400 V") +
      texte(X0, AXE + 42, "temps (ns) depuis le passage par zéro du courant, poignée sur l'axe");
    fond.innerHTML = f + ECRITS + e + "</g>";

    const ptsI = [];
    const ptsV = [];
    const ptsQ = [];
    for (let k = 0; k <= 400; k += 1) {
      const t = fenetre.debut + ((fenetre.fin - fenetre.debut) * k) / 400;
      ptsI.push([versX(t), modele.yI(courant(t))]);
      ptsV.push([versX(t), modele.yV(tension(t))]);
      if (t >= 0 && t <= trr) ptsQ.push([versX(t), modele.yI(courant(t))]);
    }
    let c = "";
    if (ptsQ.length > 1) {
      c += '<polygon points="' + versX(0).toFixed(1) + "," + YI + " " + chaine(ptsQ) + " " + versX(trr).toFixed(1) + "," + YI + '" fill="currentColor" fill-opacity="0.18" stroke="none"/>';
    }
    c += TRAITS + ' stroke-width="2.8"><polyline points="' + chaine(ptsI) + '"/></g>';
    c += TRAITS + ' stroke-width="2.2"><polyline points="' + chaine(ptsV) + '"/></g>';
    const xa = versX(modele.ta * 1e9);
    const xb = versX(trr);
    c += TRAITS + ' stroke-width="1" stroke-dasharray="2 4"><path d="M' + xa.toFixed(1) + " " + (YI - 80) + "V" + (YV + 100) + "M" + xb.toFixed(1) + " " + (YI - 80) + "V" + (YV + 100) + '"/></g>';
    c += ECRITS + texte(xa + 4, modele.yI(-modele.Irrm) + 16, "-I_RRM") + texte((versX(0) + xa) / 2 - 8, YI - 84, "t_a") + texte((xa + xb) / 2 - 8, YI - 84, "t_b") +
      texte(xb + 6, modele.yV(-VR - modele.dV) + 4, "surtension") + texte(versX(0) + 4, YI + 30, "Q_rr") + "</g>";
    courbes.innerHTML = c;
    if (valeurs) {
      valeurs.maj({
        Irrm: modele.Irrm,
        ta: modele.ta * 1e9,
        tb: modele.tb * 1e9,
        trr,
        dV: modele.dV,
        Ed: modele.Ed * 1000,
        Et: modele.Et * 1000,
      });
    }
  }

  function dessiner(u) {
    if (!modele) return;
    const t = fenetre.debut + u * (fenetre.fin - fenetre.debut);
    const x = modele.versX(t);
    const i = courant(t);
    const v = tension(t);
    mobile.innerHTML =
      TRAITS + ' stroke-width="1"><path d="M' + x.toFixed(1) + " 40V" + AXE + '"/></g>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + modele.yI(i).toFixed(1) + '" r="5" fill="currentColor"/>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + modele.yV(v).toFixed(1) + '" r="5" fill="currentColor"/>';
    ecrits.innerHTML = "";
    if (valeurs) valeurs.maj({ t, i, v });
  }

  const synchro = synchroniseur(dessiner, {});
  const curseurs = api.sim.curseurs(
    "#e-recouvrement-curseurs",
    [
      { id: "didt", libelle: "Pente di/dt", min: 50, max: 1000, pas: 10, valeur: 200, unite: "A/µs" },
      { id: "Qrr", libelle: "Charge de recouvrement Q_rr", min: 0.1, max: 10, pas: 0.1, valeur: 3, unite: "µC" },
      { id: "S", libelle: "Douceur S = t_b / t_a", min: 0.2, max: 2, pas: 0.05, valeur: 1 },
      { id: "Ls", libelle: "Inductance de maille L_σ", min: 10, max: 300, pas: 10, valeur: 100, unite: "nH" },
    ],
    (lues) => {
      Object.assign(reglages, lues);
      construire();
      synchro.redessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: X0, y: AXE },
    a: { x: X1, y: AXE },
    min: 0,
    max: 1,
    pas: 0.005,
    valeur: 0.5,
    libelle: "Instant sur le chronogramme du blocage",
    format: (m) => nombre(api, fenetre.debut + m.valeur * (fenetre.fin - fenetre.debut), 0) + " nanosecondes",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);
  synchro.lecteur = api.sim.lecteur("#e-recouvrement-lecteur", {
    de: 0,
    a: 1,
    duree: 8,
    boucle: true,
    auto: false,
    libelle: "Déroulement du blocage, très ralenti",
    rappel: (u) => synchro.appliquer(u, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  construire();
  synchro.appliquer(0.5, null);
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* 1. Fondamental : tension moyenne */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-moyenne",
      titre: "Tension moyenne d'un redresseur de commande",
      niveau: "fondamental",
      enonce:
        "<p>Un transformateur de commande délivre $48\\ \\mathrm{V}$ efficaces à $50\\ \\mathrm{Hz}$ à un redresseur simple alternance qui alimente une résistance. " +
        "En considérant la diode idéale, quelle est la tension moyenne aux bornes de la résistance ?</p>",
      valeur: (48 * RAC2) / Math.PI,
      unite: "V",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Tension moyenne $V_{moy}$",
      etapes: [
        { texte: "$V_m = \\sqrt{2} \\times 48 = 67{,}88\\ \\mathrm{V}$." },
        { texte: "$V_{moy} = V_m/\\pi = 67{,}88/3{,}1416 = 21{,}61\\ \\mathrm{V}$." },
        { texte: "Avec $V_{F0} = 0{,}8\\ \\mathrm{V}$, on perdrait environ $0{,}8/\\pi \\approx 0{,}25\\ \\mathrm{V}$, un peu plus de $1\\ \\%$.", note: "En basse tension, la chute de la diode n'est plus négligeable : à $12\\ \\mathrm{V}$ efficaces, elle coûterait $5\\ \\%$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension redressée et sa moyenne",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 40,
          yMin: -5,
          yMax: 75,
          series: [{ id: "v", nom: "v_R(t), simple alternance", couleur: "serie-1", epaisseur: 2.4, fonction: (t) => Math.max(0, 48 * RAC2 * Math.sin((TAU * t) / 20)) }],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, (48 * RAC2) / Math.PI, "V_moy = 21,61 V");
          },
        });
      },
    })
  );

  /* 2. Fondamental : pertes de conduction */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-pertes",
      titre: "Pertes d'une diode parcourue par des demi-sinusoïdes",
      niveau: "fondamental",
      enonce:
        "<p>Une diode, de paramètres à chaud $V_{F0} = 0{,}9\\ \\mathrm{V}$ et $r_F = 10\\ \\mathrm{m\\Omega}$, conduit des demi-sinusoïdes une alternance sur deux, " +
        "avec un courant moyen de $20\\ \\mathrm{A}$. Quelles sont ses pertes de conduction ?</p>",
      valeur: 0.9 * 20 + 0.01 * Math.pow((20 * Math.PI) / 2, 2),
      unite: "W",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Pertes $P_{cond}$",
      etapes: [
        { texte: "Pour une demi-sinusoïde sur une période, $I_{eff} = \\dfrac{\\pi}{2}\\,I_{moy} = 1{,}571 \\times 20 = 31{,}42\\ \\mathrm{A}$." },
        { texte: "Terme de seuil : $V_{F0}\\,I_{moy} = 0{,}9 \\times 20 = 18{,}0\\ \\mathrm{W}$." },
        { texte: "Terme résistif : $r_F\\,I_{eff}^2 = 0{,}01 \\times 31{,}42^2 = 9{,}87\\ \\mathrm{W}$." },
        { texte: "Total : $27{,}87\\ \\mathrm{W}$.", note: "Avec le seul courant moyen, $0{,}9 \\times 20 + 0{,}01 \\times 20^2 = 22\\ \\mathrm{W}$ : $21\\ \\%$ d'erreur par défaut." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 124",
          dessinBarres([["V_F0 I_moy", 18, false], ["r_F I_eff²", 9.87, false], ["total", 27.87, true]], 30, "W", 560),
          "Répartition des pertes : la barre foncée est le total."
        );
      },
    })
  );

  /* 3. Intermédiaire : tension inverse avec condensateur */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-inverse",
      titre: "Tension inverse d'un redresseur filtré",
      niveau: "intermédiaire",
      enonce:
        "<p>Un redresseur simple alternance alimenté en $230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$ charge un condensateur de filtrage de forte capacité, peu chargé. " +
        "Diode idéale, ondulation négligeable : quelle tension inverse maximale la diode doit-elle supporter ?</p>",
      valeur: 2 * 230 * RAC2,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension inverse maximale",
      etapes: [
        { texte: "Choix de la méthode : écrire la maille à l'instant le plus défavorable, au creux de l'alternance négative, $\\theta = 3\\pi/2$." },
        { texte: "Le condensateur est resté chargé à $V_m = 325{,}3\\ \\mathrm{V}$, cathode positive ; l'anode est à $v_s = -325{,}3\\ \\mathrm{V}$." },
        { texte: "$v_D = v_s - v_C = -325{,}3 - 325{,}3 = -650{,}5\\ \\mathrm{V}$.", note: "Avec $+10\\ \\%$ sur le réseau et une marge de $1{,}5$, il faut au moins $1073\\ \\mathrm{V}$ : une diode de $1200\\ \\mathrm{V}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const Vm = 230 * RAC2;
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension de la diode avec condensateur chargé",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 40,
          yMin: -700,
          yMax: 400,
          series: [
            { id: "vs", nom: "v_s(t)", couleur: "serie-1", epaisseur: 1.6, fonction: (t) => Vm * Math.sin((TAU * t) / 20) },
            { id: "vd", nom: "v_D(t) = v_s - V_m", couleur: "serie-3", epaisseur: 2.6, fonction: (t) => Vm * Math.sin((TAU * t) / 20) - Vm },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, -2 * Vm, "-2 V_m = -650,5 V");
          },
        });
      },
    })
  );

  /* 4. Intermédiaire : pertes liées au recouvrement */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-recouvrement",
      titre: "Coût du recouvrement dans un hacheur",
      niveau: "intermédiaire",
      enonce:
        "<p>Dans un hacheur alimenté sous $400\\ \\mathrm{V}$ et découpant à $16\\ \\mathrm{kHz}$, la diode de roue libre a une charge de recouvrement de " +
        "$3\\ \\mathrm{\\mu C}$ et une douceur $S = 1$ dans les conditions de fonctionnement. Avec les approximations de la séance, $E_D = V_R\\,Q_{rr}\\,S/(3(1+S))$ " +
        "pour la diode et $V_R\\,Q_{rr}$ pour le transistor, quelle puissance totale le recouvrement coûte-t-il ?</p>",
      valeur: (400 * 3e-6 / 6 + 400 * 3e-6) * 16000,
      unite: "W",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Pertes dues au recouvrement",
      etapes: [
        { texte: "Diode : $E_D = V_R I_{RRM} t_b/6$ ; avec $Q_{rr} = \\tfrac{1}{2}I_{RRM}(t_a + t_b)$ et $t_b = S t_a$, $I_{RRM}t_b = 2Q_{rr}S/(1+S)$, donc $E_D = V_R Q_{rr}/6 = 0{,}2\\ \\mathrm{mJ}$ pour $S = 1$." },
        { texte: "Transistor : $E_T \\approx V_R\\,Q_{rr} = 400 \\times 3 \\times 10^{-6} = 1{,}2\\ \\mathrm{mJ}$." },
        { texte: "Puissance : $(0{,}2 + 1{,}2) \\times 10^{-3} \\times 16\\,000 = 22{,}4\\ \\mathrm{W}$.", note: "Une diode SiC sans charge stockée supprime l'essentiel de ces pertes ; il ne reste que la charge de sa capacité." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(
          moteurApi,
          conteneur,
          "0 0 560 124",
          dessinBarres([["diode, 0,2 mJ x f", 3.2, false], ["transistor, 1,2 mJ x f", 19.2, false], ["total", 22.4, true]], 25, "W", 560),
          "Le recouvrement pénalise surtout le transistor : la barre foncée est le total."
        );
      },
    })
  );

  /* 5. Avancé : bobine de frein avec roue libre */
  const Vmoy = (230 * RAC2) / Math.PI;
  const I0 = Vmoy / 200;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-frein",
      titre: "Retombée d'un frein alimenté par un redresseur",
      niveau: "avancé",
      enonce:
        "<p>Le frein à manque de courant d'un moteur de convoyeur a une bobine de $200\\ \\Omega$ et $10\\ \\mathrm{H}$. Il est alimenté en $230\\ \\mathrm{V}$ par un redresseur " +
        "simple alternance muni d'une diode de roue libre, diodes idéales. Le frein retombe quand le courant passe sous $0{,}15\\ \\mathrm{A}$. On coupe l'alimentation " +
        "alternative : combien de temps s'écoule-t-il avant la retombée, en partant du courant moyen ?</p>",
      valeur: 1000 * (10 / 200) * Math.log(I0 / 0.15),
      unite: "ms",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Temps de retombée",
      etapes: [
        { texte: "Tension moyenne de la bobine avec roue libre : $V_m/\\pi = 103{,}5\\ \\mathrm{V}$ ; courant moyen $I_0 = 103{,}5/200 = 0{,}518\\ \\mathrm{A}$, puisque la tension moyenne d'une inductance est nulle en régime établi." },
        { texte: "Après la coupure, le courant circule dans la roue libre : $L\\,\\mathrm{d}i/\\mathrm{d}t + Ri = 0$, d'où $i = I_0 e^{-t/\\tau}$ avec $\\tau = L/R = 50\\ \\mathrm{ms}$." },
        { texte: "$t = \\tau\\ln(I_0/0{,}15) = 50 \\times \\ln(3{,}451) = 50 \\times 1{,}239 = 61{,}9\\ \\mathrm{ms}$." },
        { texte: "Le courant ondule entre $0{,}46$ et $0{,}57\\ \\mathrm{A}$ : selon l'instant de coupure, de $56$ à $67\\ \\mathrm{ms}$.", note: "Pour un freinage rapide, on coupe aussi côté continu et une varistance de $400\\ \\mathrm{V}$ absorbe l'énergie : $t = \\tau\\ln\\frac{400 + 103{,}5}{400 + 30} = 7{,}9\\ \\mathrm{ms}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Décroissance du courant de la bobine après la coupure",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "courant",
          yUnite: "A",
          xMin: 0,
          xMax: 150,
          yMin: 0,
          yMax: 0.6,
          series: [
            { id: "rl", nom: "roue libre seule", couleur: "serie-1", epaisseur: 2.4, fonction: (t) => I0 * Math.exp(-t / 50) },
            {
              id: "va",
              nom: "coupure côté continu et varistance de 400 V",
              couleur: "serie-4",
              epaisseur: 2.4,
              fonction: (t) => Math.max(0, (I0 + 400 / 200) * Math.exp(-t / 50) - 400 / 200),
            },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneH(c, repere, couleurs, 0.15, "seuil de retombée 0,15 A");
            ligneV(c, repere, couleurs, 1000 * 0.05 * Math.log(I0 / 0.15), "61,9 ms");
          },
        });
      },
    })
  );

  /* 6. Diagnostic industriel */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Fusibles qui fondent à la mise sous tension d'un variateur",
      niveau: "diagnostic",
      enonce:
        "<p>À chaque remise sous tension du variateur de la pompe, les fusibles aR des phases L1 et L2 fondent. Hors tension, condensateurs déchargés, le multimètre " +
        "en test de diode lit $0{,}02\\ \\mathrm{V}$ dans les deux sens entre L1 et la barre $+$, et $0{,}45\\ \\mathrm{V}$ dans un seul sens pour toutes les autres " +
        "paires phase-barre. Quelles conclusions sont justes ?</p>",
      options: [
        { texte: "La diode D1, entre L1 et la barre $+$, est en court-circuit.", juste: true },
        { texte: "À la mise sous tension, L1 et L2 sont en court-circuit à travers D1 et la diode saine D3, pendant les alternances où L2 est plus positive que L1.", juste: true },
        { texte: "La résistance de précharge est coupée." },
        { texte: "Remplacer seulement les fusibles suffit à remettre le variateur en service." },
        { texte: "Avant de remplacer le module, il faut chercher la cause : surtension, échauffement, ventilation, coordination des varistances.", juste: true },
      ],
      multiple: true,
      etapes: [
        { texte: "Une diode saine lit environ $0{,}45\\ \\mathrm{V}$ dans le sens direct et un dépassement dans le sens inverse ; $0{,}02\\ \\mathrm{V}$ dans les deux sens signale un court-circuit : D1." },
        { texte: "D1 court-circuitée relie L1 à la barre $+$ ; quand L2 dépasse L1, D3 conduit de L2 vers la barre $+$, puis vers L1 par D1 : court-circuit entre phases, limité seulement par le réseau et la self de ligne. Il en va de même avec L3 par D5 : les fusibles qui fondent les premiers dépendent de l'instant de mise sous tension." },
        { texte: "La précharge, en aval sur la barre $+$, n'est pas traversée par ce courant : elle n'est pas en cause, et ce court-circuit ne passe par aucune charge.", note: "Une diode qui claque a une cause : on vérifie les varistances, le dissipateur et l'historique des défauts avant de remettre sous tension." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["D1 en court-circuit : L1 reliée à la barre +", "L2 > L1 : D3 conduit de L2 vers la barre +", "retour par D1 vers L1 : court-circuit L1-L2", "seuls les fusibles aR L1 et L2 l'interrompent"], "Chemin du courant de défaut à travers la diode claquée.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );

  /* 7. Conceptuelle */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Pourquoi un pont de diodes ne renvoie pas l'énergie de freinage",
      niveau: "conceptuel",
      enonce:
        "<p>Expliquez, sans calcul, pourquoi l'énergie de freinage d'un moteur ne peut pas revenir au réseau à travers le pont de diodes d'entrée d'un variateur, " +
        "et ce qui se passe sur le bus continu pendant un freinage.</p>",
      motsCles: [["sens", "unidirectionnel", "un seul sens", "positif"], ["tension", "moyenne", "signe"], ["puissance", "produit", "energie"], ["bus", "condensateur", "monte", "surtension", "resistance", "hacheur"]],
      minimum: 3,
      exemple: "Trois phrases : le signe du courant du pont, le signe de sa tension, la conséquence pour le bus.",
      etapes: [
        { texte: "Le courant d'une diode ne peut pas s'inverser : le courant $I_d$ du pont reste positif, du réseau vers le bus." },
        { texte: "La tension moyenne d'un pont de diodes ne dépend que du réseau et reste positive : la puissance $U_d I_d$ ne peut aller que du réseau vers le bus." },
        { texte: "En freinage, le moteur renvoie de l'énergie qui charge le condensateur : la tension du bus monte, les diodes se bloquent toutes ; il faut un hacheur et une résistance de freinage, ou un pont actif.", note: "Le cours Thyristors et redresseurs commandés montrera qu'un pont commandé peut, lui, inverser sa tension moyenne." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["i_D ≥ 0 pour chaque diode : I_d ≥ 0", "U_d moyenne ≈ 1,35 U > 0, fixée par le réseau", "P = U_d I_d ≥ 0 : réseau vers bus seulement", "freinage : le bus monte, les diodes se bloquent"], "Les deux signes qui interdisent le retour d'énergie.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

function dessinRoueLibre(id) {
  return (
    "<defs>" + marqueur(id) + "</defs>" +
    TRAITS + ' stroke-width="2"><circle cx="70" cy="130" r="22"/><path d="M58 130c4 -10 8 -10 12 0s8 10 12 0"/>' +
    '<path d="M70 108V50H150M70 152V210H420M230 50H420V70M420 120V135M420 175V210"/>' + diodeH(150, 230, 50) + diodeHaut(300, 210, 50) +
    '<rect x="412" y="70" width="16" height="50" rx="2"/><path d="M420 135c12 0 12 10 0 10c12 0 12 10 0 10c12 0 12 10 0 10c12 0 12 10 0 10"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="300" cy="50" r="3.2"/><circle cx="300" cy="210" r="3.2"/></g>' +
    ECRITS + texte(178, 30, "D") + texte(312, 134, "D_RL") + texte(440, 100, "R") + texte(440, 160, "L") + texte(30, 100, "v_s") + texte(20, 245, "source sinusoïdale, alternance négative : v_s < 0") + "</g>"
  );
}

const ZONES_ROUE_LIBRE = [
  { x: 40, y: 100, largeur: 62, hauteur: 60, etiquette: "source" },
  { x: 145, y: 28, largeur: 92, hauteur: 44, etiquette: "D" },
  { x: 276, y: 104, largeur: 50, hauteur: 52, etiquette: "D_RL", juste: true },
  { x: 398, y: 64, largeur: 46, hauteur: 62, etiquette: "R" },
];

const VISUELS_QUIZ = [
  etapes(["Schottky SiC : jonction métal-semiconducteur", "pas d'injection de porteurs minoritaires", "pas de charge stockée : seule la capacité se charge"], "Pourquoi la diode Schottky n'a pas de recouvrement."),
  etapes(["faible courant : dv/dT ≈ -2 mV/K", "I_S croît très vite avec T", "à courant fixé, v_F diminue"], "Coefficient de température aux faibles courants."),
  etapes(["V_m = 24 × √2 = 33,94 V", "V_moy = V_m / π", "= 10,80 V"], "Tension moyenne en simple alternance."),
  etapes(["alternance négative : v_s = -V_m", "condensateur resté chargé à +V_m", "v_D = -V_m - V_m = -2 V_m"], "Les deux tensions s'ajoutent sur la diode bloquée."),
  etapes(["P = V_F0 I_moy + r_F I_eff²", "= 1 × 10 + 0,01 × 15²", "= 10 + 2,25 = 12,25 W"], "Pertes de conduction."),
  () => ({ viewBox: "0 0 540 260", dessin: dessinRoueLibre(nouveauMarqueur("fl-l-rl-c")), legende: "Alternance négative : D bloquée, le courant de L passe par D_RL." }),
  etapes(["fusible aR : I²t de coupure", "diode : I²t = I_FSM² × 0,005 s", "I²t fusible < I²t diode"], "Coordination fusible et diode."),
  etapes(["caractéristiques jamais identiques", "sous le point d'inversion : la plus chaude prend plus", "déclassement, appairage, même dissipateur"], "La mise en parallèle ne double pas le courant."),
  etapes(["I_RRM = √(2 Q_rr di/dt / (1 + S))", "= √(2 × 2 µC × 100 A/µs / 2)", "= √200 = 14,14 A"], "Courant inverse maximal."),
  etapes(["U_d0 = 3 √2 U / π", "= 1,3505 × 400", "= 540,2 V"], "Tension moyenne d'un pont de six diodes."),
];

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Quelle famille de diodes n'a pratiquement pas de récupération inverse tout en tenant $1200\\ \\mathrm{V}$ ?</p>",
        options: ["La diode de redressement standard", "La diode ultrarapide au silicium", "La diode Schottky au carbure de silicium", "La diode Zener"],
        bonnes: [2],
        explication: "Une diode Schottky n'injecte pas de porteurs minoritaires : pas de charge stockée. Au carbure de silicium, elle tient jusqu'à $1700\\ \\mathrm{V}$.",
        resume: "Diode sans recouvrement",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>À faible courant, la tension directe d'une diode au silicium diminue quand sa température augmente.</p>",
        reponse: true,
        explication: "Le courant de saturation croît très vite avec $T$ : à courant fixé, $v_F$ baisse d'environ $2\\ \\mathrm{mV/K}$. Aux forts courants, la résistance série inverse la tendance.",
        resume: "Coefficient de température",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Un redresseur simple alternance idéal est alimenté sous $24\\ \\mathrm{V}$ efficaces et débite sur une résistance. Tension moyenne de la charge, en volts ?</p>",
        valeur: (24 * RAC2) / Math.PI,
        unite: "V",
        tolerance: 0.01,
        explication: "$V_{moy} = \\sqrt{2} \\times 24/\\pi = 10{,}80\\ \\mathrm{V}$.",
        resume: "Tension moyenne simple alternance",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi la diode d'un redresseur simple alternance filtré par un condensateur doit-elle tenir environ $2V_m$ en inverse ?</p>",
        motsCles: [["condensateur", "capacite"], ["charge", "reste", "garde"], ["ajoute", "somme", "additionne", "deux", "2"]],
        minimum: 2,
        explication: "Le condensateur reste chargé à $V_m$ pendant l'alternance négative ; la diode voit la différence entre $-V_m$ côté anode et $+V_m$ côté cathode : $2V_m$.",
        resume: "Tension inverse avec condensateur",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Une diode de paramètres $V_{F0} = 1\\ \\mathrm{V}$ et $r_F = 10\\ \\mathrm{m\\Omega}$ conduit un courant de $10\\ \\mathrm{A}$ moyens et $15\\ \\mathrm{A}$ efficaces. Pertes de conduction, en watts ?</p>",
        valeur: 12.25,
        unite: "W",
        tolerance: 0.01,
        explication: "$P = 1 \\times 10 + 0{,}01 \\times 15^2 = 12{,}25\\ \\mathrm{W}$.",
        resume: "Pertes de conduction",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Pendant l'alternance négative de la source, quel élément porte le courant de l'inductance ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 540 260",
        dessin: dessinRoueLibre("fl-l-rl"),
        zones: ZONES_ROUE_LIBRE,
        explication: "La source négative bloque $D$ ; le courant de $L$, qui ne peut pas s'interrompre, se referme par la diode de roue libre $D_{RL}$, et la tension de la charge reste voisine de zéro.",
        resume: "Lecture du schéma de roue libre",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Quelle grandeur de la fiche technique d'une diode compare-t-on à celle d'un fusible ultrarapide pour vérifier qu'il la protège d'un court-circuit ?</p>",
        options: ["$V_{RRM}$", "$I_{F(AV)}$", "La contrainte thermique $I^2t$", "$Q_{rr}$"],
        bonnes: [2],
        explication: "Le fusible doit couper avec un $I^2t$ inférieur à celui que la diode supporte, $I_{FSM}^2 \\times 0{,}005\\ \\mathrm{s}$ pour une demi-sinusoïde de $10\\ \\mathrm{ms}$.",
        resume: "Coordination par I²t",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Mettre deux diodes identiques en parallèle double toujours le courant admissible.</p>",
        reponse: false,
        explication: "Les caractéristiques diffèrent toujours un peu, et sous le point d'inversion du coefficient de température la plus chaude prend davantage de courant. On déclasse et on appaire.",
        resume: "Mise en parallèle",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Une diode a $Q_{rr} = 2\\ \\mathrm{\\mu C}$ et une douceur $S = 1$ ; on la bloque avec $100\\ \\mathrm{A/\\mu s}$. Courant inverse maximal, en ampères, selon le modèle triangulaire ?</p>",
        valeur: Math.sqrt((2 * 2e-6 * 1e8) / 2),
        unite: "A",
        tolerance: 0.02,
        explication: "$I_{RRM} = \\sqrt{2 \\times 2 \\times 10^{-6} \\times 10^{8}/2} = \\sqrt{200} = 14{,}1\\ \\mathrm{A}$.",
        resume: "Courant inverse maximal",
      },
      {
        type: "calcul",
        enonce: repere(9) + "<p>Quelle est la tension moyenne, en volts, d'un pont de six diodes alimenté par un réseau de $400\\ \\mathrm{V}$ entre phases, courant continu lissé ?</p>",
        valeur: ((3 * RAC2) / Math.PI) * 400,
        unite: "V",
        tolerance: 0.01,
        explication: "$U_{d0} = 3\\sqrt{2}\\,U/\\pi = 1{,}35 \\times 400 = 540{,}2\\ \\mathrm{V}$ ; le cours Redresseurs triphasés établira cette formule.",
        resume: "Tension d'un pont triphasé",
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
      { categorie: "Physique", question: "Pourquoi une diode ne conduit-elle que dans un sens ?", reponse: "La tension directe abaisse la barrière de la jonction PN et le courant croît exponentiellement ; la tension inverse la renforce et seul un courant de fuite passe." },
      { categorie: "Formule", question: "Quelle est l'équation de Shockley ?", reponse: "$i_F = I_S(e^{v_F/(nV_{th})} - 1)$, avec $V_{th} = kT/q \\approx 26\\ \\mathrm{mV}$ à $300\\ \\mathrm{K}$ : $60n\\ \\mathrm{mV}$ par décade de courant." },
      { categorie: "Structure", question: "À quoi sert la zone N- d'une diode de puissance ?", reponse: "À tenir la tension inverse en y étalant la zone de charge d'espace ; en direct, elle est inondée de porteurs, d'où la charge stockée." },
      { categorie: "Modèle", question: "Quel modèle pour calculer des pertes ?", reponse: "$v_F = V_{F0} + r_F\\,i_F$, avec les paramètres à la température de jonction maximale de la fiche technique." },
      { categorie: "Pertes", question: "Que valent les pertes de conduction ?", reponse: "$P = V_{F0}\\,I_{moy} + r_F\\,I_{eff}^2$ : il faut la moyenne et la valeur efficace du courant." },
      { categorie: "Redresseur", question: "Tension moyenne d'un simple alternance sur R ?", reponse: "$V_m/\\pi$, valeur efficace $V_m/2$, tension inverse $V_m$, puissance moitié de celle sans diode." },
      { categorie: "Charges", question: "Effet d'une inductance et d'une roue libre ?", reponse: "L'inductance prolonge la conduction au-delà de $\\pi$ et abaisse $V_{moy}$ ; la roue libre supprime la partie négative et rétablit $V_m/\\pi$.", rappel: "Avec $230\\ \\mathrm{V}$, $20\\ \\Omega$ et $0{,}1\\ \\mathrm{H}$ : $77\\ \\mathrm{V}$ sans roue libre, $103\\ \\mathrm{V}$ avec." },
      { categorie: "Dynamique", question: "Qu'est-ce que la récupération inverse ?", reponse: "L'évacuation de la charge stockée au blocage : courant inverse jusqu'à $I_{RRM}$, durée $t_{rr}$, charge $Q_{rr}$, pertes et surtension $L_\\sigma\\,I_{RRM}/t_b$." },
      { categorie: "Choix", question: "Quelle marge sur la tension inverse ?", reponse: "$V_{RRM}$ de $1{,}5$ à $2{,}5$ fois la tension inverse maximale au réseau haut : règle de conception, pas loi." },
      { categorie: "Protection", question: "Comment protéger une diode d'un court-circuit ?", reponse: "Par un fusible ultrarapide dont l'$I^2t$ de coupure est inférieur à celui de la diode, $I_{FSM}^2 \\times 0{,}005\\ \\mathrm{s}$." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["V_m = 230 × √2 = 325,3 V", "V_eff = V_m / 2", "= 162,6 V"], "Valeur efficace en simple alternance."),
  etapes(["sans roue libre : tension négative après π", "avec roue libre : v_ch ≈ 0 quand v_s < 0", "V_moy remonte à V_m / π"], "Effet de la roue libre."),
  etapes(["T_j = T_a + P R_th", "= 45 + 10 × 2,5", "= 70 °C"], "Température de jonction."),
  etapes(["Ω = 2π × 3000 / 60 = 314,16 rad/s", "W = J Ω² / 2 = 0,5 × 2 × 314,16²", "= 98,7 kJ"], "Énergie cinétique d'une centrifugeuse."),
  etapes(["pompe centrifuge : P proportionnelle à n³", "0,8³ = 0,512", "51,2 % de la puissance à pleine vitesse"], "Loi de puissance d'une pompe centrifuge."),
  etapes(["Ω = 2π × 2780 / 60 = 291,1 rad/s", "E = KΦ Ω = 0,070 × 291,1", "= 20,38 V"], "Force électromotrice du moteur à courant continu."),
  etapes(["(V_A - 12) / 10 + V_A / 100 + (V_A - 0,7) / 0,5 = 0", "V_A (0,1 + 0,01 + 2) = 1,2 + 1,4", "V_A = 2,6 / 2,11 = 1,232 V ; i_D = 1,06 A > 0"], "Équation nodale avec une diode linéarisée."),
];

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Un redresseur simple alternance idéal est alimenté en $230\\ \\mathrm{V}$ et débite sur une résistance. Tension efficace de la charge, en volts ?</p>",
        valeur: (230 * RAC2) / 2,
        unite: "V",
        tolerance: 0.01,
        explication: "$V_{eff} = V_m/2 = 325{,}3/2 = 162{,}6\\ \\mathrm{V}$.",
        resume: "Valeur efficace en simple alternance",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Sur une charge R-L alimentée en simple alternance, ajouter une diode de roue libre augmente la tension moyenne de la charge.</p>",
        reponse: true,
        explication: "Sans roue libre, la charge reçoit une tension négative tant que l'inductance prolonge la conduction ; la roue libre la supprime et rétablit $V_m/\\pi$.",
        resume: "Roue libre et tension moyenne",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Cette séance. Une diode dissipe $10\\ \\mathrm{W}$ ; la résistance thermique totale jonction-ambiance vaut $2{,}5\\ \\mathrm{K/W}$ et l'ambiance est à $45\\ ^\\circ\\mathrm{C}$. Température de jonction, en degrés Celsius ?</p>",
        valeur: 70,
        unite: "°C",
        tolerance: 0.01,
        explication: "$T_j = 45 + 10 \\times 2{,}5 = 70\\ ^\\circ\\mathrm{C}$.",
        resume: "Température de jonction",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Révision 6 et sélection d'un entraînement. Un rotor de centrifugeuse de moment d'inertie $2\\ \\mathrm{kg \\cdot m^2}$ tourne à $3000\\ \\mathrm{tr/min}$. Énergie cinétique, en kilojoules ?</p>",
        valeur: (0.5 * 2 * Math.pow((TAU * 3000) / 60, 2)) / 1000,
        unite: "kJ",
        tolerance: 0.01,
        explication: "$W = \\tfrac{1}{2}J\\varOmega^2 = 0{,}5 \\times 2 \\times 314{,}16^2 = 98{,}7\\ \\mathrm{kJ}$, énergie que le freinage renvoie vers le bus continu.",
        resume: "Énergie cinétique",
      },
      {
        type: "vraiFaux",
        enonce: repere(4) + "<p>Cours Révision 6 et sélection d'un entraînement. Une pompe centrifuge sans hauteur statique, ralentie à $80\\ \\%$ de sa vitesse, absorbe environ la moitié de sa puissance à pleine vitesse.</p>",
        reponse: true,
        explication: "Puissance proportionnelle au cube de la vitesse : $0{,}8^3 = 0{,}512$, soit $51\\ \\%$.",
        resume: "Puissance d'une pompe centrifuge",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Machine à courant continu. L'actionneur de vanne du site a une constante $K\\varPhi = 0{,}070\\ \\mathrm{V \\cdot s/rad}$. Quelle force électromotrice développe-t-il à $2780\\ \\mathrm{tr/min}$, en volts ?</p>",
        valeur: 0.07 * ((TAU * 2780) / 60),
        unite: "V",
        tolerance: 0.01,
        explication: "$E = K\\varPhi\\,\\varOmega = 0{,}070 \\times 291{,}1 = 20{,}38\\ \\mathrm{V}$.",
        resume: "Force électromotrice",
      },
      {
        type: "calcul",
        enonce:
          repere(6) +
          "<p>Cours Méthodes de résolution systématique. Une source de $12\\ \\mathrm{V}$ alimente le nœud A par $10\\ \\Omega$ ; entre A et la masse sont branchées une résistance de $100\\ \\Omega$ et une diode modélisée par $0{,}7\\ \\mathrm{V}$ en série avec $0{,}5\\ \\Omega$. Potentiel du nœud A, en volts ?</p>",
        valeur: 2.6 / 2.11,
        unite: "V",
        tolerance: 0.01,
        explication: "Loi des nœuds en A : $(V_A - 12)/10 + V_A/100 + (V_A - 0{,}7)/0{,}5 = 0$, d'où $V_A = 2{,}6/2{,}11 = 1{,}232\\ \\mathrm{V}$ ; on vérifie que la diode conduit : $i_D = 1{,}06\\ \\mathrm{A} > 0$.",
        resume: "Analyse nodale avec une diode",
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
    titre: "Où en suis-je sur les diodes de puissance ?",
  });
  if (auto) ressources.push(auto);
}
