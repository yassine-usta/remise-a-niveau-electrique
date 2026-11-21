/* ==========================================================================
   cours/commande-numerique/cours.js
   Commande numérique : échantillonnage et maintien d'une sinusoïde avec
   poignée et lecteur, chronogramme d'une tâche d'automate, discrétisation
   d'un premier ordre et plan des pôles, PI numérique du four, implantation
   de la régulation de pression, exercices, quiz, cartes, révision et bilan.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = 2 * Math.PI;
const DEG = 180 / Math.PI;

/* Four de l'exemple : K en K/%, constantes de temps en secondes. */
const FOUR = { K: 2, t1: 400, t2: 40, Kc: 2.551, Ti: 400 };
/* Régulation de pression : modèle supposé du projet fil rouge. */
const PR = { Kg: 0.15, th: 1.2, tc: 0.13, retard: 0.05, Kc: 6, Ti: 1.2 };

/* --------------------------------------------------------------------------
   Outils généraux
   -------------------------------------------------------------------------- */

function svgEl(nom, attributs = {}) {
  const element = document.createElementNS(SVG_NS, nom);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function nb(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
}

function marqueur(id) {
  return (
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto-start-reverse">' +
    '<path d="M0 0 10 5 0 10Z" fill="currentColor"/></marker>'
  );
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";

function ligneH(c, repere, couleurs, y, libelle, motif = [7, 5]) {
  const py = repere.versY(y);
  if (!Number.isFinite(py) || py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.setLineDash(motif);
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

function ligneV(c, repere, couleurs, x, motif = [1, 3]) {
  const px = repere.versX(x);
  if (!Number.isFinite(px) || px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  c.save();
  c.setLineDash(motif);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(px, repere.boite.y);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  c.restore();
}

/** Points hors de la fenêtre verticale masqués : la courbe est interrompue. */
function ecreter(points, yMin, yMax) {
  return points.map(([t, v]) => [t, Number.isFinite(v) && v >= yMin && v <= yMax ? v : NaN]);
}

/** Suite discrète tracée en escalier : chaque valeur maintenue une période. */
function escalier(valeurs, Te, tMax) {
  const points = [];
  for (let k = 0; k < valeurs.length; k += 1) {
    const t0 = k * Te;
    if (t0 > tMax) break;
    const t1 = Math.min((k + 1) * Te, tMax);
    points.push([t0, valeurs[k]], [t1, valeurs[k]]);
  }
  return points;
}

function traceCorrection(moteurApi, conteneur, options) {
  const traceur = moteurApi.sim.traceur(conteneur, { genre: "Correction visuelle", ratio: 0.42, echantillons: 400, ...options });
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
function dessinEtapes(lignes, largeur = 640) {
  const hauteur = 30 + lignes.length * 22;
  return (
    TRAITS + ' stroke-width="1.4"><rect x="6" y="6" width="' + (largeur - 12) + '" height="' + (hauteur - 12) + '" rx="8"/></g>' +
    ECRITS + lignes.map((ligne, i) => texte(22, 32 + i * 22, ligne)).join("") + "</g>"
  );
}

function etapes(lignes, legende, largeur = 640) {
  return { viewBox: "0 0 " + largeur + " " + (30 + lignes.length * 22), dessin: dessinEtapes(lignes, largeur), legende };
}

function correctionEtapes(lignes, legende, largeur = 640) {
  return (conteneur, moteurApi) => {
    const v = etapes(lignes, legende, largeur);
    schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
  };
}

function repere(index) {
  return '<span hidden data-q="' + index + '"></span>';
}

/** Ajoute un visuel animé sous le verdict de chaque question d'un quiz. */
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

/* --------------------------------------------------------------------------
   Calcul : boucles numériques du four et de la pression
   -------------------------------------------------------------------------- */

/** Performances : dépassement en % et instant de dernière sortie de la bande. */
function performances(ts, ys, yf, bande = 0.05) {
  let pic = -Infinity;
  let t5 = 0;
  for (let i = 0; i < ts.length; i += 1) {
    if (ys[i] > pic) pic = ys[i];
    if (Math.abs(ys[i] - yf) > bande * Math.abs(yf)) t5 = ts[i];
  }
  return { D: Math.max(0, ((pic - yf) / yf) * 100), t5 };
}

/**
 * Four commandé par un PI, continu ou numérique.
 * o : { Te, delai (0 ou 1), continu, r0, tMax, h, pasSortie }
 */
function simFour(o) {
  const h = o.h || 0.02;
  const n = Math.round(o.tMax / h);
  const nT = Math.max(1, Math.round((o.Te || 1) / h));
  const a1 = Math.exp(-h / FOUR.t1);
  const a2 = Math.exp(-h / FOUR.t2);
  let x1 = 0;
  let x2 = 0;
  let xi = 0;
  let ucmd = 0;
  let enAttente = 0;
  let ci = 0;
  const ts = [];
  const ys = [];
  const us = [];
  const tsTout = [];
  const ysTout = [];
  for (let k = 0; k < n; k += 1) {
    const t = k * h;
    let ua;
    if (o.continu) {
      const e = o.r0 - x2;
      ci += (FOUR.Kc / FOUR.Ti) * e * h;
      ua = FOUR.Kc * e + ci;
    } else {
      if (k % nT === 0) {
        const e = o.r0 - x2;
        xi += ((FOUR.Kc * o.Te) / FOUR.Ti) * e;
        const uk = FOUR.Kc * e + xi;
        if (o.delai) {
          ucmd = enAttente;
          enAttente = uk;
        } else ucmd = uk;
      }
      ua = ucmd;
    }
    x1 = a1 * x1 + (1 - a1) * FOUR.K * ua;
    x2 = a2 * x2 + (1 - a2) * x1;
    tsTout.push(t);
    ysTout.push(x2);
    if (k % (o.pasSortie || 25) === 0) {
      ts.push(t);
      ys.push(x2);
      us.push(ua);
    }
  }
  return { ts, ys, us, perf: performances(tsTout, ysTout, o.r0) };
}

/**
 * Régulation de pression : PI continu ou numérique, retard de 50 ms, capteur.
 * o : { Te, delai (0 ou 1), methode ("arriere" ou "tustin"), continu, r0, tMax }
 */
function simPression(o) {
  const h = 0.0005;
  const n = Math.round(o.tMax / h);
  const nRetard = Math.round(PR.retard / h);
  const file = new Array(nRetard + 1).fill(0);
  let tete = 0;
  const ah = Math.exp(-h / PR.th);
  const ac = Math.exp(-h / PR.tc);
  const nT = Math.max(1, Math.round((o.Te || 0.1) / h));
  let xh = 0;
  let xc = 0;
  let xi = 0;
  let ePrec = 0;
  let ucmd = 0;
  let enAttente = 0;
  let ci = 0;
  let u0 = null;
  const ts = [];
  const ys = [];
  const us = [];
  const tsTout = [];
  const ysTout = [];
  for (let k = 0; k < n; k += 1) {
    const t = k * h;
    let ua;
    if (o.continu) {
      const e = o.r0 - xc;
      ci += (PR.Kc / PR.Ti) * e * h;
      ua = PR.Kc * e + ci;
    } else {
      if (k % nT === 0) {
        const e = o.r0 - xc;
        if (o.methode === "tustin") xi += ((PR.Kc * o.Te) / (2 * PR.Ti)) * (e + ePrec);
        else xi += ((PR.Kc * o.Te) / PR.Ti) * e;
        ePrec = e;
        const uk = PR.Kc * e + xi;
        if (u0 === null) u0 = uk;
        if (o.delai) {
          ucmd = enAttente;
          enAttente = uk;
        } else ucmd = uk;
      }
      ua = ucmd;
    }
    if (o.continu && u0 === null) u0 = ua;
    /* file circulaire : la valeur lue a été écrite nRetard pas plus tôt */
    file[tete] = ua;
    tete = (tete + 1) % file.length;
    const retardee = file[tete];
    xh = ah * xh + (1 - ah) * PR.Kg * retardee;
    xc = ac * xc + (1 - ac) * xh;
    tsTout.push(t);
    ysTout.push(xh);
    if (k % 10 === 0) {
      ts.push(t);
      ys.push(xh);
      us.push(ua);
    }
  }
  return { ts, ys, us, u0, perf: performances(tsTout, ysTout, o.r0) };
}

/** Boucle ouverte de la pression avec un retard supplémentaire, en complexe. */
function Lpression(w, extra) {
  /* PI : Kc (1 - j/(w Ti)) */
  let re = PR.Kc;
  let im = -PR.Kc / (w * PR.Ti);
  const mul = (a, b) => {
    const r = re * a - im * b;
    im = re * b + im * a;
    re = r;
  };
  const div1 = (tau) => {
    /* multiplier par 1/(1 + j w tau) */
    const d = 1 + (w * tau) ** 2;
    mul(1 / d, (-w * tau) / d);
  };
  mul(PR.Kg, 0);
  div1(PR.th);
  div1(PR.tc);
  const phi = -w * (PR.retard + extra);
  mul(Math.cos(phi), Math.sin(phi));
  return { mod: Math.hypot(re, im), arg: Math.atan2(im, re) };
}

function margePression(extra) {
  let bas = 0.01;
  let haut = 100;
  for (let i = 0; i < 100; i += 1) {
    const m = Math.sqrt(bas * haut);
    if (Lpression(m, extra).mod > 1) bas = m;
    else haut = m;
  }
  const wc = Math.sqrt(bas * haut);
  let arg = Lpression(wc, extra).arg;
  while (arg > 0) arg -= TAU;
  return { wc, Mphi: 180 + arg * DEG };
}

/* --------------------------------------------------------------------------
   Initialisation et nettoyage
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  detruire();
  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireEchantillonnage(racine, api);
  construireCycle(racine, api);
  construireDiscret(racine, api);
  construireReponsesExemple(racine, api);
  construireNumerique(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  ressources.push(
    api.reveler(racine.querySelectorAll(".formule-cle, .encadre, #f-comparatif, #e-methodes, #e-statut-tableau"), { decalage: 0.05 })
  );
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
   Renvois et tracés statiques
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
    ["#e-bloqueur-figure svg", 2],
    ["#e-integration-figure svg", 2],
    ["#f-schema-principal svg", 2.6],
  ];
  for (const [selecteur, d] of schemas) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree: d }));
  }
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  if (!racine.querySelector("#c-minitest")) return;
  const cible = "#c-minitest";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c1-retard",
      titre: "Phase d'un retard pur",
      niveau: "fondamental",
      enonce: "<p>Un retard pur de $50\\ \\mathrm{ms}$ est placé dans une boucle. Quelle phase, en degrés et en valeur absolue, retire-t-il à la pulsation $\\omega = 2\\ \\mathrm{rad/s}$ ?</p>",
      valeur: 2 * 0.05 * DEG,
      unite: "°",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Phase retirée",
      etapes: [
        { texte: "Phase d'un retard : $\\arg e^{-j\\omega\\theta} = -\\omega\\theta$, en radians." },
        { texte: "$\\omega\\theta = 2 \\times 0{,}05 = 0{,}1\\ \\mathrm{rad}$." },
        { texte: "$0{,}1 \\times 180/\\pi = 5{,}73^\\circ$, sans changement du module.", note: "La phase retirée est proportionnelle à la pulsation : $11{,}5^\\circ$ à $4\\ \\mathrm{rad/s}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Phase retirée par un retard de 50 ms",
          xTitre: "pulsation",
          xUnite: "rad/s",
          yTitre: "phase retirée",
          yUnite: "°",
          xMin: 0,
          xMax: 4,
          yMin: 0,
          yMax: 12,
          series: [{ id: "p", nom: "ω θ en degrés", fonction: (w) => w * 0.05 * DEG }],
          surDessin({ c, repere: r, couleurs }) {
            ligneV(c, r, couleurs, 2, [6, 4]);
            ligneH(c, r, couleurs, 5.73, "5,73° à 2 rad/s", [3, 4]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-rectangles",
      titre: "Intégrale approchée par des rectangles",
      niveau: "fondamental",
      enonce: "<p>On approche $\\int_0^1 t\\,dt$ par quatre rectangles de largeur $0{,}25$, chacun de hauteur égale à la valeur de $t$ au début de son intervalle. Quelle valeur obtient-on ?</p>",
      valeur: 0.375,
      unite: "",
      tolerance: 0.005,
      chiffres: 3,
      libelleChamp: "Somme des rectangles",
      etapes: [
        { texte: "Hauteurs : $0$, $0{,}25$, $0{,}5$ et $0{,}75$." },
        { texte: "Somme : $0{,}25 \\times (0 + 0{,}25 + 0{,}5 + 0{,}75) = 0{,}25 \\times 1{,}5 = 0{,}375$." },
        { texte: "Valeur exacte : $0{,}5$. Les rectangles à gauche sous-estiment l'aire d'une fonction croissante ; les trapèzes donneraient ici la valeur exacte.", note: "C'est la différence entre Euler avant et Tustin." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Rectangles à gauche sous la droite y = t",
          xTitre: "t",
          xUnite: "",
          yTitre: "y",
          yUnite: "",
          xMin: 0,
          xMax: 1,
          yMin: 0,
          yMax: 1.05,
          series: [
            { id: "f", nom: "y = t", fonction: (t) => t },
            { id: "r", nom: "rectangles à gauche", points: escalier([0, 0.25, 0.5, 0.75], 0.25, 1) },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "c3-suites",
      titre: "Convergence d'une suite géométrique",
      niveau: "fondamental",
      enonce: "<p>Pour quelles valeurs de $a$ la récurrence $y_{k+1} = a\\,y_k$, partie de $y_0 = 1$, tend-elle vers zéro ?</p>",
      options: [
        { texte: "$a = 0{,}9$", juste: true },
        { texte: "$a = -0{,}8$", juste: true },
        { texte: "$a = 1{,}1$" },
        { texte: "$a = -1{,}2$" },
      ],
      etapes: [
        { texte: "$y_k = a^k$ : la suite tend vers zéro si et seulement si $|a| &lt; 1$." },
        { texte: "$0{,}9$ et $-0{,}8$ conviennent ; avec $-0{,}8$, les termes changent de signe à chaque pas en décroissant." },
        { texte: "$1{,}1$ croît sans limite ; $-1{,}2$ alterne en divergeant.", note: "Le coefficient $a$ joue le rôle du pôle discret : stable à l'intérieur du cercle unité." },
      ],
      visuelCorrection(conteneur, moteur) {
        const suite = (a) => Array.from({ length: 12 }, (_, k) => a ** k);
        traceCorrection(moteur, conteneur, {
          titre: "Termes des quatre suites, maintenus entre deux pas",
          xTitre: "pas k",
          xUnite: "",
          yTitre: "y(k)",
          yUnite: "",
          xMin: 0,
          xMax: 11,
          yMin: -3,
          yMax: 3,
          series: [
            { id: "a", nom: "a = 0,9", points: escalier(suite(0.9), 1, 11) },
            { id: "b", nom: "a = -0,8", points: escalier(suite(-0.8), 1, 11) },
            { id: "c", nom: "a = 1,1", points: ecreter(escalier(suite(1.1), 1, 11), -3, 3) },
            { id: "d", nom: "a = -1,2", points: ecreter(escalier(suite(-1.2), 1, 11), -3, 3) },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Échantillonnage et maintien : poignée sur Te, curseur sur f, lecteur
   -------------------------------------------------------------------------- */

function construireEchantillonnage(racine, api) {
  const conteneur = racine.querySelector("#d-echant-vivant");
  if (!conteneur) return;
  const P = { x0: 60, x1: 690, tMax: 2, yc: 150, amp: 95, rail: 318, teMin: 0.02, teMax: 0.5 };
  const X = (t) => P.x0 + ((P.x1 - P.x0) * t) / P.tMax;
  const Y = (v) => P.yc - P.amp * v;
  const XR = (te) => P.x0 + ((P.x1 - P.x0) * (te - P.teMin)) / (P.teMax - P.teMin);
  const etat = { Te: 0.1, f: 1.2, t: P.tMax };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 360",
    role: "img",
    "aria-label": "Sinusoïde échantillonnée sur deux secondes : signal continu, échantillons, escalier du bloqueur, signal retardé d'une demi-période et sinusoïde apparente ; poignée de réglage de la période sur un rail gradué de 0,02 à 0,5 seconde",
  });
  const decor = svgEl("g");
  let d = "<defs>" + marqueur("d-ec-fl") + "</defs>" + TRAITS + ' stroke-width="1.3">';
  d += '<path d="M' + P.x0 + " " + P.yc + "H" + (P.x1 + 16) + '" marker-end="url(#d-ec-fl)"/>';
  d += '<path d="M' + P.x0 + " " + (Y(-1) + 14) + "V" + (Y(1) - 18) + '" marker-end="url(#d-ec-fl)"/>';
  let grad = "";
  for (let i = 1; i <= 4; i += 1) grad += "M" + X(i * 0.5).toFixed(1) + " " + (P.yc - 4) + "v8";
  for (const v of [-1, 1]) grad += "M" + (P.x0 - 4) + " " + Y(v) + "h8";
  d += '<path d="' + grad + '"/>';
  d += '<path d="M' + P.x0 + " " + P.rail + "H" + P.x1 + '" stroke-width="1" stroke-dasharray="2 4"/>';
  let gradRail = "";
  for (const te of [0.02, 0.1, 0.2, 0.3, 0.4, 0.5]) gradRail += "M" + XR(te).toFixed(1) + " " + (P.rail - 5) + "v10";
  d += '<path d="' + gradRail + '" stroke-width="1"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  for (let i = 1; i <= 4; i += 1) d += texte(X(i * 0.5), P.yc + 16, String(i * 0.5).replace(".", ","), ' text-anchor="middle"');
  d += texte(P.x0 - 8, Y(1) + 4, "1", ' text-anchor="end"') + texte(P.x0 - 8, Y(-1) + 4, "-1", ' text-anchor="end"');
  d += texte(P.x1 + 16, P.yc - 8, "t (s)", ' text-anchor="end"') + texte(P.x0 + 8, Y(1) - 12, "y");
  for (const te of [0.02, 0.1, 0.2, 0.3, 0.4, 0.5]) d += texte(XR(te), P.rail + 20, String(te).replace(".", ","), ' text-anchor="middle"');
  d += texte(P.x0, P.rail - 14, "période d'échantillonnage Te (s) : déplacer la poignée le long du rail") + "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const continu = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.3", opacity: "0.8" });
  const retarde = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-dasharray": "8 5" });
  const apparente = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-dasharray": "2 4" });
  const marches = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "3.2", "stroke-linejoin": "miter" });
  const points = svgEl("g", { fill: "currentColor", stroke: "none" });
  const present = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "3 3" });
  const etiquette = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(continu, retarde, apparente, marches, points, present, etiquette);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#d-echant-valeurs", [
    { id: "te", libelle: "Période Te et fréquence fe", format: (v) => v },
    { id: "f", libelle: "Fréquence du signal f", format: (v) => v },
    { id: "nyq", libelle: "Limite fe / 2", format: (v) => v },
    { id: "app", libelle: "Fréquence apparente |f - m fe|", format: (v) => v },
    { id: "ret", libelle: "Retard moyen du bloqueur Te / 2", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function chemin(fonction, t0, t1, pas = 500) {
    let s = "";
    for (let i = 0; i <= pas; i += 1) {
      const t = t0 + ((t1 - t0) * i) / pas;
      s += (i ? "L" : "M") + X(t).toFixed(1) + " " + Y(fonction(t)).toFixed(1);
    }
    return s;
  }

  function toutRecalculer() {
    const { Te, f } = etat;
    const tNow = Math.max(0, Math.min(P.tMax, etat.t));
    const fe = 1 / Te;
    const m = Math.round(f / fe);
    const fSigne = f - m * fe;
    const y = (t) => Math.sin(TAU * f * t);
    continu.setAttribute("d", chemin(y, 0, P.tMax));
    const debutRetard = Math.min(Te / 2, P.tMax);
    retarde.setAttribute("d", tNow > debutRetard ? chemin((t) => y(t - Te / 2), debutRetard, tNow) : "");
    apparente.setAttribute("d", tNow > 0 ? chemin((t) => Math.sin(TAU * fSigne * t), 0, tNow, 300) : "");
    let marche = "";
    let pts = "";
    const kMax = Math.floor(tNow / Te + 1e-9);
    for (let k = 0; k <= kMax; k += 1) {
      const t0 = k * Te;
      const t1 = Math.min((k + 1) * Te, P.tMax);
      const v = y(t0);
      marche += (k ? "L" : "M") + X(t0).toFixed(1) + " " + Y(v).toFixed(1) + "L" + X(t1).toFixed(1) + " " + Y(v).toFixed(1);
      pts += '<circle cx="' + X(t0).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="3.6"/>';
    }
    marches.setAttribute("d", marche);
    points.innerHTML = pts;
    present.setAttribute("d", "M" + X(tNow).toFixed(1) + " " + (Y(1) - 6) + "V" + (Y(-1) + 6));
    const aDroite = X(tNow) > 520;
    let lib = texte(X(tNow) + (aDroite ? -6 : 6), Y(-1) + 22, "instant présent " + nb(api, tNow, 2) + " s", aDroite ? ' text-anchor="end"' : "");
    if (f > fe / 2) lib += texte(P.x1, Y(1) - 22, "f au-delà de fe / 2 : repliement", ' text-anchor="end" font-weight="700"');
    etiquette.innerHTML = lib;
    if (valeurs) {
      valeurs.maj({
        te: nb(api, Te, 2) + " s, " + nb(api, fe, 1) + " Hz",
        f: nb(api, f, 2) + " Hz",
        nyq: nb(api, fe / 2, 2) + " Hz",
        app: nb(api, Math.abs(fSigne), 2) + " Hz" + (m ? " (m = " + m + ")" : ""),
        ret: nb(api, (Te / 2) * 1000, 0) + " ms",
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: XR(P.teMin), y: P.rail },
    a: { x: XR(P.teMax), y: P.rail },
    min: P.teMin,
    max: P.teMax,
    pas: 0.01,
    valeur: etat.Te,
    libelle: "Période d'échantillonnage Te, en secondes",
    format: (m) => "Te = " + nb(api, typeof m === "number" ? m : m.valeur, 2) + " s",
    rappel(m) {
      etat.Te = Math.max(P.teMin, typeof m === "number" ? m : m.valeur);
      toutRecalculer();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-echant-curseurs",
    [{ id: "f", libelle: "Fréquence du signal f", min: 0.2, max: 12, pas: 0.1, valeur: etat.f, unite: "Hz" }],
    (v) => {
      etat.f = v.f;
      toutRecalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-echant-lecteur", {
    de: 0,
    a: P.tMax,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Avancée de l'instant présent",
    rappel: (t) => {
      etat.t = t;
      toutRecalculer();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(P.tMax);
  }
  toutRecalculer();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.4 }));
}

/* --------------------------------------------------------------------------
   E. Chronogramme d'une tâche périodique : lecteur et curseurs
   -------------------------------------------------------------------------- */

function construireCycle(racine, api) {
  const conteneur = racine.querySelector("#e-cycle-vivant");
  if (!conteneur) return;
  const Te = 0.1;
  const P = { x0: 110, x1: 690, tMax: 0.4, yH: 44, yM: 112, aM: 30, yC: 176, yS: 262, aS: 30 };
  const X = (t) => P.x0 + ((P.x1 - P.x0) * t) / P.tMax;
  const mesure = (t) => 0.75 * Math.sin(TAU * 1.6 * t + 0.4) + 0.2 * Math.sin(TAU * 3.1 * t);
  const T0 = 0.25;
  const etat = { t: T0, mode: 0, calc: 0.02 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 330",
    role: "img",
    "aria-label": "Chronogramme sur quatre périodes de 100 millisecondes : tops d'horloge, mesure et échantillons, calculs hachurés, commande appliquée en escalier, instant présent et âge de la mesure contenue dans la commande",
  });
  const decor = svgEl("g");
  let d = "<defs>" + marqueur("e-cy-fl");
  d += '<pattern id="e-cy-h" patternUnits="userSpaceOnUse" width="7" height="7"><path d="M0 7L7 0" stroke="currentColor" stroke-width="1"/></pattern></defs>';
  d += TRAITS + ' stroke-width="1.2">';
  d += '<path d="M' + P.x0 + " " + P.yH + "H" + (P.x1 + 12) + '" marker-end="url(#e-cy-fl)"/>';
  let ticks = "";
  for (let k = 0; k <= 4; k += 1) ticks += "M" + X(k * Te).toFixed(1) + " " + (P.yH - 14) + "V" + (P.yH + 4);
  d += '<path d="' + ticks + '" stroke-width="2.2"/>';
  let guides = "";
  for (let k = 0; k <= 4; k += 1) guides += "M" + X(k * Te).toFixed(1) + " " + (P.yH + 6) + "V" + (P.yS + P.aS + 6);
  d += '<path d="' + guides + '" stroke-dasharray="1 4" opacity="0.6"/>';
  d += '<path d="M' + P.x0 + " " + P.yM + "H" + P.x1 + '" opacity="0.4"/>';
  d += '<path d="M' + P.x0 + " " + (P.yC + 10) + "H" + P.x1 + '" opacity="0.4"/>';
  d += '<path d="M' + P.x0 + " " + P.yS + "H" + P.x1 + '" opacity="0.4"/>';
  let courbe = "";
  for (let i = 0; i <= 300; i += 1) {
    const t = (P.tMax * i) / 300;
    courbe += (i ? "L" : "M") + X(t).toFixed(1) + " " + (P.yM - P.aM * mesure(t)).toFixed(1);
  }
  d += '<path d="' + courbe + '" stroke-width="1.5"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  d += texte(12, P.yH + 4, "horloge") + texte(12, P.yM + 4, "mesure y(t)") + texte(12, P.yC + 14, "calcul") + texte(12, P.yS + 4, "commande");
  for (let k = 0; k <= 4; k += 1) d += texte(X(k * Te), P.yH - 18, k + "Te", ' text-anchor="middle"');
  d += texte(P.x1 + 12, P.yH + 16, "t", ' text-anchor="end"');
  d += "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const echantillons = svgEl("g", { fill: "currentColor", stroke: "none" });
  const calculs = svgEl("g", { fill: "url(#e-cy-h)", stroke: "currentColor", "stroke-width": "1.2" });
  const sortie = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "3", "stroke-linejoin": "miter" });
  const present = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "3", "stroke-linecap": "round" });
  const age = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.6", "marker-end": "url(#e-cy-fl)" });
  const lien = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-dasharray": "3 3" });
  const etiquette = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(echantillons, calculs, sortie, lien, present, age, etiquette);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#e-cycle-valeurs", [
    { id: "t", libelle: "Instant présent", format: (v) => v },
    { id: "age", libelle: "Âge de la mesure appliquée", format: (v) => v },
    { id: "plage", libelle: "Âge minimal et maximal", format: (v) => v },
    { id: "moy", libelle: "Âge moyen, retard équivalent", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  /** Instant où la commande calculée au top k devient effective. */
  function instantEffet(k) {
    return etat.mode === 1 ? (k + 1) * Te : k * Te + etat.calc;
  }

  function toutRecalculer() {
    const t = etat.t;
    let pts = "";
    for (let k = 0; k <= 4; k += 1) pts += '<circle cx="' + X(k * Te).toFixed(1) + '" cy="' + (P.yM - P.aM * mesure(k * Te)).toFixed(1) + '" r="4"/>';
    echantillons.innerHTML = pts;
    let rects = "";
    for (let k = 0; k < 4; k += 1) {
      rects += '<rect x="' + X(k * Te).toFixed(1) + '" y="' + P.yC + '" width="' + (X(etat.calc) - X(0)).toFixed(1) + '" height="20"/>';
    }
    calculs.innerHTML = rects;
    /* escalier de la commande : valeur de l'échantillon k à partir de instantEffet(k) */
    const Yc = (k) => P.yS - P.aS * mesure(k * Te);
    let s = "M" + X(0).toFixed(1) + " " + Yc(-1).toFixed(1);
    let dernier = -1;
    for (let k = 0; k <= 4; k += 1) {
      const te = instantEffet(k);
      if (te > P.tMax) break;
      s += "L" + X(te).toFixed(1) + " " + Yc(k - 1).toFixed(1) + "L" + X(te).toFixed(1) + " " + Yc(k).toFixed(1);
      dernier = k;
    }
    s += "L" + X(P.tMax).toFixed(1) + " " + Yc(dernier).toFixed(1);
    sortie.setAttribute("d", s);
    /* échantillon contenu dans la commande appliquée à l'instant t */
    let kUtilise = -1;
    for (let k = 0; k <= 4; k += 1) if (instantEffet(k) <= t + 1e-12) kUtilise = k;
    const tMesure = kUtilise * Te;
    const ageValeur = t - tMesure;
    present.setAttribute("d", "M" + X(t).toFixed(1) + " " + (P.yH - 10) + "V" + (P.yS + P.aS + 10));
    const yFleche = P.yS + P.aS + 22;
    const xDebut = X(Math.max(tMesure, -0.02));
    age.setAttribute("d", "M" + X(t).toFixed(1) + " " + yFleche + "H" + Math.max(P.x0 - 30, xDebut + 2).toFixed(1));
    lien.setAttribute("d", kUtilise >= 0 ? "M" + X(tMesure).toFixed(1) + " " + (P.yM - P.aM * mesure(tMesure)).toFixed(1) + "V" + yFleche : "");
    const xLib = Math.min(Math.max((X(t) + xDebut) / 2, P.x0 + 40), P.x1 - 60);
    etiquette.innerHTML = texte(xLib, yFleche + 16, "âge " + nb(api, ageValeur * 1000, 0) + " ms", ' text-anchor="middle"');
    const ageMin = etat.mode === 1 ? Te : etat.calc;
    if (valeurs) {
      valeurs.maj({
        t: nb(api, t * 1000, 0) + " ms",
        age: nb(api, ageValeur * 1000, 0) + " ms",
        plage: nb(api, ageMin * 1000, 0) + " à " + nb(api, (ageMin + Te) * 1000, 0) + " ms",
        moy: nb(api, (ageMin + Te / 2) * 1000, 0) + " ms",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-cycle-curseurs",
    [
      { id: "mode", libelle: "Écriture de la sortie", min: 0, max: 1, pas: 1, valeur: etat.mode, format: (v) => (v ? "au top suivant" : "dès la fin du calcul") },
      { id: "calc", libelle: "Durée du calcul", min: 5, max: 80, pas: 5, valeur: etat.calc * 1000, unite: "ms" },
    ],
    (v) => {
      etat.mode = v.mode;
      etat.calc = v.calc / 1000;
      toutRecalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#e-cycle-lecteur", {
    de: 0,
    a: P.tMax,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Instant présent sur le chronogramme",
    rappel: (t) => {
      etat.t = t;
      toutRecalculer();
    },
  });
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.definir(T0);
  }
  toutRecalculer();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.4 }));
}

/* --------------------------------------------------------------------------
   E. Discrétisation d'un premier ordre : réponses et plan des pôles
   -------------------------------------------------------------------------- */

const METHODES = [
  { id: "exact", nom: "invariance indicielle", court: "exacte", forme: "rond" },
  { id: "avant", nom: "Euler avant", court: "avant", forme: "carre" },
  { id: "arriere", nom: "Euler arrière", court: "arrière", forme: "triangle" },
  { id: "tustin", nom: "Tustin", court: "Tustin", forme: "croix" },
];

function polesDiscrets(r) {
  return {
    exact: Math.exp(-r),
    avant: 1 - r,
    arriere: 1 / (1 + r),
    tustin: (1 - r / 2) / (1 + r / 2),
  };
}

/** Réponse indicielle discrète du filtre 1/(1 + tau s), r = Te / tau. */
function reponsesDiscretes(r, kMax) {
  const p = polesDiscrets(r);
  const b = r / 2 / (1 + r / 2);
  const y = { exact: [], avant: [], arriere: [], tustin: [] };
  let ye = 0;
  let ya = 0;
  let yr = 0;
  let yt = 0;
  for (let k = 0; k <= kMax; k += 1) {
    if (k > 0) {
      ye = p.exact * ye + (1 - p.exact);
      ya = p.avant * ya + r;
    }
    yr = (yr + r) / (1 + r);
    yt = p.tustin * yt + b * (1 + (k > 0 ? 1 : 0));
    y.exact.push(ye);
    y.avant.push(ya);
    y.arriere.push(yr);
    y.tustin.push(yt);
  }
  return y;
}

function construireDiscret(racine, api) {
  if (!racine.querySelector("#e-discret-trace")) return;
  const etat = { r: 0.5 };
  const tMax = 8;

  const valeurs = api.sim.valeurs("#e-discret-valeurs", [
    { id: "exact", libelle: "Pôle exact e^(-Te/τ)", format: (v) => v },
    { id: "avant", libelle: "Pôle Euler avant", format: (v) => v },
    { id: "arriere", libelle: "Pôle Euler arrière", format: (v) => v },
    { id: "tustin", libelle: "Pôle Tustin", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#e-discret-trace", {
    titre: "Réponses indicielles du filtre 1 / (1 + τ s) discrétisé",
    xTitre: "t / τ",
    xUnite: "",
    yTitre: "sortie",
    yUnite: "",
    xMin: 0,
    xMax: tMax,
    yMin: -0.6,
    yMax: 1.8,
    echantillons: 400,
    series: [
      { id: "continu", nom: "continu (référence)", fonction: (t) => 1 - Math.exp(-t), epaisseur: 1.5 },
      ...METHODES.map((m) => ({ id: m.id, nom: m.nom, points: [] })),
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 1, "valeur finale", [7, 5]);
    },
    note: "Une courbe interrompue est sortie du cadre : la récurrence correspondante diverge.",
  });
  if (trace) ressources.push(trace);

  /* Plan des pôles discrets */
  const plan = racine.querySelector("#e-discret-plan");
  const Z = { cx: 400, cy: 120, R: 100, zMin: -1.8, zMax: 1.4 };
  const XZ = (z) => Z.cx + z * Z.R;
  const svg = svgEl("svg", {
    viewBox: "0 0 720 250",
    role: "img",
    "aria-label": "Plan complexe des pôles discrets : cercle unité et pôles réels des quatre méthodes, repérés par des formes différentes",
  });
  const decor = svgEl("g");
  let d = "<defs>" + marqueur("e-dz-fl");
  d += '<pattern id="e-dz-h" patternUnits="userSpaceOnUse" width="9" height="9"><path d="M0 9L9 0" stroke="currentColor" stroke-width="0.7"/></pattern></defs>';
  d += '<path d="M' + XZ(Z.zMin) + " " + (Z.cy - 105) + "H" + Z.cx + "V" + (Z.cy + 105) + "H" + XZ(Z.zMin) + 'Z" fill="url(#e-dz-h)" stroke="none" opacity="0.35"/>';
  d += TRAITS + ' stroke-width="1.3">';
  d += '<circle cx="' + Z.cx + '" cy="' + Z.cy + '" r="' + Z.R + '" stroke-width="2"/>';
  d += '<path d="M' + XZ(Z.zMin) + " " + Z.cy + "H" + (XZ(Z.zMax) + 10) + '" marker-end="url(#e-dz-fl)"/>';
  d += '<path d="M' + Z.cx + " " + (Z.cy + 112) + "V" + (Z.cy - 112) + '" marker-end="url(#e-dz-fl)"/>';
  let grad = "";
  for (const z of [-1.5, -1, -0.5, 0.5, 1]) grad += "M" + XZ(z) + " " + (Z.cy - 4) + "v8";
  d += '<path d="' + grad + '"/></g>' + ECRITS.replace('font-size="12"', 'font-size="11"');
  for (const z of [-1.5, -1, -0.5, 0.5, 1]) d += texte(XZ(z), Z.cy + 18, String(z).replace(".", ","), ' text-anchor="middle"');
  d += texte(XZ(Z.zMax) + 10, Z.cy - 8, "Re z", ' text-anchor="end"') + texte(Z.cx + 6, Z.cy - 100, "Im z");
  d += texte(XZ(Z.zMin) + 4, Z.cy - 92, "pôles négatifs :") + texte(XZ(Z.zMin) + 4, Z.cy - 78, "sortie alternée");
  d += texte(Z.cx + 74, Z.cy + 92, "cercle unité : limite de stabilité") + "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);
  const poles = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "2" });
  const noms = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11" });
  svg.append(poles, noms);
  if (plan) {
    plan.appendChild(svg);
    nettoyeurs.push(() => svg.remove());
    ressources.push(api.dessiner(decor, { declencheur: plan, duree: 1.2 }));
  }

  function forme(type, x, y) {
    if (type === "rond") return '<circle cx="' + x + '" cy="' + y + '" r="6"/>';
    if (type === "carre") return '<rect x="' + (x - 6) + '" y="' + (y - 6) + '" width="12" height="12"/>';
    if (type === "triangle") return '<path d="M' + x + " " + (y - 7) + "L" + (x + 7) + " " + (y + 6) + "H" + (x - 7) + 'Z"/>';
    return '<path d="M' + (x - 6) + " " + (y - 6) + "L" + (x + 6) + " " + (y + 6) + "M" + (x + 6) + " " + (y - 6) + "L" + (x - 6) + " " + (y + 6) + '"/>';
  }

  function toutRecalculer() {
    const r = etat.r;
    const kMax = Math.ceil(tMax / r) + 1;
    const y = reponsesDiscretes(r, kMax);
    if (trace) {
      for (const m of METHODES) trace.definirDonnees(m.id, ecreter(escalier(y[m.id], r, tMax), -0.6, 1.8));
    }
    const p = polesDiscrets(r);
    const rangs = [-58, -34, 34, 58];
    let s = "";
    let n = "";
    METHODES.forEach((m, i) => {
      const z = Math.max(Z.zMin, Math.min(Z.zMax, p[m.id]));
      const x = XZ(z);
      s += forme(m.forme, x, Z.cy);
      const yLib = Z.cy + rangs[i];
      s += '<path d="M' + x + " " + (Z.cy + (rangs[i] < 0 ? -8 : 8)) + "V" + (yLib + (rangs[i] < 0 ? 4 : -12)) + '" stroke-width="0.8" stroke-dasharray="2 2"/>';
      n += texte(Math.min(Math.max(x, 60), 660), yLib, m.court + " " + nb(api, p[m.id], 3), ' text-anchor="middle"');
    });
    poles.innerHTML = s;
    noms.innerHTML = n;
    if (valeurs) {
      const etatPole = (v) => (Math.abs(v) >= 1 ? " instable" : v < 0 ? " alterné" : "");
      valeurs.maj({
        exact: nb(api, p.exact, 3) + etatPole(p.exact),
        avant: nb(api, p.avant, 3) + etatPole(p.avant),
        arriere: nb(api, p.arriere, 3) + etatPole(p.arriere),
        tustin: nb(api, p.tustin, 3) + etatPole(p.tustin),
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-discret-curseurs",
    [{ id: "r", libelle: "Rapport Te / τ", min: 0.05, max: 2.6, pas: 0.05, valeur: etat.r, chiffres: 2 }],
    (v) => {
      etat.r = v.r;
      toutRecalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);
  toutRecalculer();
}

/* --------------------------------------------------------------------------
   H. Réponses du four : continu, numérique 2 s, numérique 20 s avec délai
   -------------------------------------------------------------------------- */

function construireReponsesExemple(racine, api) {
  if (!racine.querySelector("#h-reponses")) return;
  const tMax = 600;
  const cas = [
    { id: "c", nom: "PI continu", o: { continu: true } },
    { id: "n2", nom: "numérique, Te = 2 s, sans délai", o: { Te: 2, delai: 0 } },
    { id: "n20", nom: "numérique, Te = 20 s, sortie au top suivant", o: { Te: 20, delai: 1 } },
  ];
  const res = cas.map((c) => simFour({ ...c.o, r0: 10, tMax, h: 0.02, pasSortie: 25 }));

  const trace = api.sim.traceur("#h-reponses", {
    titre: "Température du four pour un échelon de consigne de 10 K",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "température",
    yUnite: "K",
    xMin: 0,
    xMax: tMax,
    yMin: 0,
    yMax: 13,
    series: cas.map((c, i) => ({ id: c.id, nom: c.nom, points: res[i].ts.map((t, j) => [t, res[i].ys[j]]) })),
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 10, "", [7, 5]);
      ligneH(c, r, couleurs, 10.5, "consigne et bande ± 5 %", [2, 4]);
      ligneH(c, r, couleurs, 9.5, "", [2, 4]);
    },
  });
  if (trace) {
    ressources.push(trace);
    trace.definirMesures(
      cas.map((c, i) => ({ nom: "Dépassement, " + c.nom, valeur: nb(api, res[i].perf.D, 2) + " %" }))
    );
  }

  const commandes = api.sim.traceur("#h-commandes", {
    titre: "Commande de puissance",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "commande",
    yUnite: "%",
    xMin: 0,
    xMax: tMax,
    yMin: 0,
    yMax: 30,
    ratio: 0.36,
    series: cas.map((c, i) => ({ id: c.id, nom: c.nom, points: res[i].ts.map((t, j) => [t, res[i].us[j]]) })),
  });
  if (commandes) ressources.push(commandes);
}

/* --------------------------------------------------------------------------
   I. Régulation de pression numérique : période, délai, méthode
   -------------------------------------------------------------------------- */

const METHODES_PI = ["Euler arrière", "Tustin"];

function construireNumerique(racine, api) {
  if (!racine.querySelector("#i-numerique-trace")) return;
  const tMax = 10;
  const r0 = 0.1;
  const etat = { Te: 0.1, delai: 0, methode: 0 };
  const continu = simPression({ continu: true, r0, tMax });
  const margeContinue = margePression(0);

  const valeurs = api.sim.valeurs("#i-numerique-valeurs", [
    { id: "coef", libelle: "Coefficients q0 et q1", format: (v) => v },
    { id: "perte", libelle: "Perte de phase ωc (Te/2 + τcalc)", format: (v) => v },
    { id: "marge", libelle: "Marge de phase avec retard équivalent", format: (v) => v },
    { id: "D", libelle: "Dépassement simulé", format: (v) => v },
    { id: "t5", libelle: "Temps d'établissement à 5 %", format: (v) => v },
    { id: "u0", libelle: "Commande initiale", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const trace = api.sim.traceur("#i-numerique-trace", {
    titre: "Pression après un échelon de consigne de 0,1 bar",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "pression",
    yUnite: "bar",
    xMin: 0,
    xMax: tMax,
    yMin: 0,
    yMax: 0.2,
    series: [
      { id: "c", nom: "PI continu", points: continu.ts.map((t, i) => [t, continu.ys[i]]) },
      { id: "n", nom: "PI numérique", points: [] },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, r0, "", [7, 5]);
      ligneH(c, r, couleurs, r0 * 1.05, "consigne et bande ± 5 %", [2, 4]);
      ligneH(c, r, couleurs, r0 * 0.95, "", [2, 4]);
    },
  });
  if (trace) ressources.push(trace);

  const commande = api.sim.traceur("#i-numerique-commande", {
    titre: "Consigne de fréquence envoyée au variateur",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "fréquence",
    yUnite: "Hz",
    xMin: 0,
    xMax: tMax,
    yMin: -0.2,
    yMax: 1.4,
    ratio: 0.36,
    series: [
      { id: "c", nom: "PI continu", points: continu.ts.map((t, i) => [t, continu.us[i]]) },
      { id: "n", nom: "PI numérique", points: [] },
    ],
  });
  if (commande) ressources.push(commande);

  function recalculer() {
    const methode = etat.methode ? "tustin" : "arriere";
    const res = simPression({ Te: etat.Te, delai: etat.delai, methode, r0, tMax });
    if (trace) trace.definirDonnees("n", ecreter(res.ts.map((t, i) => [t, res.ys[i]]), -1, 0.2));
    if (commande) commande.definirDonnees("n", ecreter(res.ts.map((t, i) => [t, res.us[i]]), -0.2, 1.4));
    const extra = etat.Te / 2 + etat.delai * etat.Te;
    const marge = margePression(extra);
    const q0 = etat.methode ? PR.Kc * (1 + etat.Te / (2 * PR.Ti)) : PR.Kc * (1 + etat.Te / PR.Ti);
    const q1 = etat.methode ? -PR.Kc * (1 - etat.Te / (2 * PR.Ti)) : -PR.Kc;
    if (valeurs) {
      valeurs.maj({
        coef: nb(api, q0, 3) + " et " + nb(api, q1, 3) + " Hz/bar",
        perte: nb(api, margeContinue.wc * extra * DEG, 2) + "°",
        marge: nb(api, marge.Mphi, 1) + "° (continu " + nb(api, margeContinue.Mphi, 1) + "°)",
        D: res.perf.D < 0.05 ? "aucun" : nb(api, res.perf.D, 1) + " %",
        t5: res.perf.t5 >= tMax - 0.01 ? "au-delà de 10 s" : nb(api, res.perf.t5, 2) + " s (continu " + nb(api, continu.perf.t5, 2) + " s)",
        u0: nb(api, res.u0, 3) + " Hz",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-numerique-curseurs",
    [
      { id: "Te", libelle: "Période d'échantillonnage Te", min: 0.01, max: 1, pas: 0.01, valeur: etat.Te, unite: "s", chiffres: 2 },
      { id: "delai", libelle: "Délai de calcul", min: 0, max: 1, pas: 1, valeur: etat.delai, format: (v) => (v ? "une période" : "aucun") },
      { id: "methode", libelle: "Discrétisation de l'intégrale", min: 0, max: 1, pas: 1, valeur: etat.methode, format: (v) => METHODES_PI[v] },
    ],
    (v) => {
      etat.Te = v.Te;
      etat.delai = v.delai;
      etat.methode = v.methode;
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);
  recalculer();
}

/* --------------------------------------------------------------------------
   K. Exercices
   -------------------------------------------------------------------------- */

function dessinDiagnostic() {
  const X = (t) => 70 + t * 5.6;
  let s = "<defs>" + marqueur("k6-fl") + "</defs>" + TRAITS + ' stroke-width="1.4">';
  s += '<path d="M70 70H640" marker-end="url(#k6-fl)"/><path d="M70 170H640" marker-end="url(#k6-fl)"/>';
  const libres = [0, 8, 20, 30, 52, 60, 68, 90, 100];
  let tl = "";
  for (const t of libres) tl += "M" + X(t).toFixed(1) + " 52V70";
  s += '<path d="' + tl + '" stroke-width="2.4"/>';
  let tp = "";
  for (const t of [0, 100]) tp += "M" + X(t).toFixed(1) + " 152V170";
  s += '<path d="' + tp + '" stroke-width="2.4"/>';
  s += "</g>" + ECRITS;
  s += texte(70, 36, "cycle libre : 8 appels en 100 ms, chacun avec un incrément prévu pour 100 ms");
  s += texte(70, 136, "tâche périodique : 1 appel toutes les 100 ms, conforme au paramètre");
  s += texte(X(100), 90, "100 ms", ' text-anchor="middle"') + texte(X(100), 190, "100 ms", ' text-anchor="middle"');
  s += texte(70, 222, "action intégrale réelle : × (100 ms / période réelle), soit de 1,7 à 12,5");
  s += "</g>";
  return s;
}

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-bloqueur",
      titre: "Phase perdue par le bloqueur",
      niveau: "fondamental",
      enonce: "<p>Une boucle de vitesse a une pulsation de coupure $\\omega_c = 2\\ \\mathrm{rad/s}$. Elle est implantée avec $T_e = 0{,}2\\ \\mathrm{s}$, la sortie étant écrite dès la fin d'un calcul de durée négligeable. Quelle phase, en degrés, l'échantillonnage retire-t-il à la marge ?</p>",
      valeur: ((2 * 0.2) / 2) * DEG,
      unite: "°",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Phase retirée",
      etapes: [
        { texte: "Retard équivalent : $\\theta_{\\mathrm{num}} = T_e/2 + \\tau_{\\mathrm{calc}} = 0{,}1\\ \\mathrm{s}$." },
        { texte: "$\\Delta\\varphi = \\omega_c\\theta_{\\mathrm{num}} = 2 \\times 0{,}1 = 0{,}2\\ \\mathrm{rad}$." },
        { texte: "$0{,}2 \\times 180/\\pi = 11{,}46^\\circ$.", note: "Avec une sortie au top suivant, la perte triplerait : $34{,}4^\\circ$. Période trop longue pour cette boucle." },
      ],
      visuelCorrection: correctionEtapes(
        ["θnum = Te/2 + τcalc = 0,2/2 + 0 = 0,1 s", "Δφ = ωc θnum = 2 × 0,1 = 0,2 rad", "= 11,46° ; avec sortie au top suivant : 34,4°"],
        "Phase retirée par l'échantillonnage."
      ),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-coefficients",
      titre: "Coefficients d'un PI numérique",
      niveau: "fondamental",
      enonce: "<p>Un PI de forme standard a $K_c = 2$ et $T_i = 4\\ \\mathrm{s}$. Il est discrétisé par Euler arrière avec $T_e = 0{,}5\\ \\mathrm{s}$, sous la forme $u_k = u_{k-1} + q_0e_k + q_1e_{k-1}$. Quelle est la valeur de $q_0$ ?</p>",
      valeur: 2.25,
      unite: "",
      tolerance: 0.005,
      chiffres: 3,
      libelleChamp: "Coefficient q0",
      etapes: [
        { texte: "$q_0 = K_c(1 + T_e/T_i) = 2 \\times (1 + 0{,}125) = 2{,}25$." },
        { texte: "$q_1 = -K_c = -2$ ; $q_0 + q_1 = K_cT_e/T_i = 0{,}25$, la part intégrale ajoutée par période pour un écart unité." },
        { texte: "Pour un écart constant $e = 1$ : $u_k = 2 + 0{,}25(k + 1)$, à comparer au continu $u(t) = 2 + 0{,}5t$.", note: "Le numérique est en avance d'un pas : Euler arrière intègre l'écart du pas courant." },
      ],
      visuelCorrection(conteneur, moteur) {
        const uk = Array.from({ length: 13 }, (_, k) => 2 + 0.25 * (k + 1));
        traceCorrection(moteur, conteneur, {
          titre: "Commande pour un écart constant unité",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "commande",
          yUnite: "",
          xMin: 0,
          xMax: 6,
          yMin: 1.5,
          yMax: 5.5,
          series: [
            { id: "c", nom: "PI continu : 2 + 0,5 t", fonction: (t) => 2 + 0.5 * t },
            { id: "n", nom: "PI numérique en escalier", points: escalier(uk, 0.5, 6) },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-euler-avant",
      titre: "Filtre de mesure discrétisé par Euler avant",
      niveau: "intermédiaire",
      enonce: "<p>Un filtre de mesure $1/(1 + \\tau s)$ avec $\\tau = 20\\ \\mathrm{ms}$ est programmé par Euler avant dans une tâche de $50\\ \\mathrm{ms}$. Quel est le pôle discret $p$ de la récurrence obtenue ? Conclure sur sa stabilité.</p>",
      valeur: 1 - 50 / 20,
      unite: "",
      tolerance: 0.005,
      chiffres: 2,
      libelleChamp: "Pôle discret p",
      etapes: [
        { texte: "Euler avant : $y_{k+1} = y_k + (T_e/\\tau)(u_k - y_k)$, soit $p = 1 - T_e/\\tau$." },
        { texte: "$p = 1 - 50/20 = -1{,}5$." },
        { texte: "$|p| &gt; 1$ : la récurrence diverge en alternant, alors que le filtre continu est stable.", note: "Il faudrait $T_e &lt; 40\\ \\mathrm{ms}$ pour la stabilité et $T_e &lt; 20\\ \\mathrm{ms}$ pour éviter l'alternance ; en invariance indicielle, $p = e^{-2{,}5} = 0{,}082$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const y = reponsesDiscretes(2.5, 8);
        traceCorrection(moteur, conteneur, {
          titre: "Réponse à un échelon unité, temps en millisecondes",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "sortie",
          yUnite: "",
          xMin: 0,
          xMax: 350,
          yMin: -4,
          yMax: 5,
          series: [
            { id: "c", nom: "filtre continu", fonction: (t) => 1 - Math.exp(-t / 20) },
            { id: "a", nom: "Euler avant, p = -1,5", points: ecreter(escalier(y.avant, 50, 350), -4, 5) },
            { id: "e", nom: "invariance indicielle, p = 0,082", points: escalier(y.exact, 50, 350) },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-periode",
      titre: "Période maximale d'une boucle de courant",
      niveau: "intermédiaire",
      enonce: "<p>Une boucle a une pulsation de coupure $\\omega_c = 15\\ \\mathrm{rad/s}$. La sortie est écrite au top suivant. Quelle est la période maximale, en millisecondes, pour une perte de phase d'au plus $5^\\circ$ ?</p>",
      valeur: (((5 / DEG) / (1.5 * 15)) * 1000),
      unite: "ms",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Période maximale",
      etapes: [
        { texte: "Sortie au top suivant : $\\tau_{\\mathrm{calc}} = T_e$, donc $\\Delta\\varphi = 1{,}5\\,\\omega_cT_e$." },
        { texte: "$5^\\circ = 0{,}08727\\ \\mathrm{rad}$ ; $T_e \\le 0{,}08727/(1{,}5 \\times 15) = 3{,}88 \\times 10^{-3}\\ \\mathrm{s}$." },
        { texte: "Choix d'une période standard inférieure : $2\\ \\mathrm{ms}$ ou $2{,}5\\ \\mathrm{ms}$ selon le matériel.", note: "Sortie écrite dès la fin du calcul : la borne triplerait, $11{,}6\\ \\mathrm{ms}$ avec un calcul négligeable." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Perte de phase en fonction de la période",
          xTitre: "période",
          xUnite: "ms",
          yTitre: "perte",
          yUnite: "°",
          xMin: 0,
          xMax: 12,
          yMin: 0,
          yMax: 16,
          series: [
            { id: "s", nom: "sortie au top suivant : 1,5 ωc Te", fonction: (t) => 1.5 * 15 * t * 1e-3 * DEG },
            { id: "i", nom: "sortie immédiate : 0,5 ωc Te", fonction: (t) => 0.5 * 15 * t * 1e-3 * DEG },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 5, "budget 5°", [7, 5]);
            ligneV(c, r, couleurs, 3.88, [3, 4]);
          },
        });
      },
    })
  );

  const fP = 211.35;
  const tauMin = Math.sqrt(1 / 0.01 ** 2 - 1) / (TAU * fP);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-repliement",
      titre: "Repliement d'une pulsation de pompe",
      niveau: "avancé",
      enonce:
        "<p>Une pompe produit une pulsation de pression de $0{,}05\\ \\mathrm{bar}$ à $211{,}35\\ \\mathrm{Hz}$. La mesure est échantillonnée à $10\\ \\mathrm{Hz}$ par l'automate. " +
        "On veut que la composante repliée ne dépasse pas $0{,}5\\ \\mathrm{mbar}$. À quelle fréquence apparaît-elle, et quelle constante de temps minimale, en millisecondes, doit avoir un filtre du premier ordre placé avant l'échantillonnage ? " +
        "Saisir la constante de temps ; évaluer ensuite la phase qu'il retire à $\\omega_c = 0{,}746\\ \\mathrm{rad/s}$.</p>",
      valeur: tauMin * 1000,
      unite: "ms",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Constante de temps minimale",
      etapes: [
        { texte: "Fréquence apparente : $m = \\mathrm{arrondi}(211{,}35/10) = 21$, $f_{\\mathrm{app}} = |211{,}35 - 210| = 1{,}35\\ \\mathrm{Hz}$." },
        { texte: "Atténuation requise : $0{,}5/50 = 0{,}01$, soit $\\sqrt{1 + (2\\pi f\\tau_f)^2} \\ge 100$ et $2\\pi f\\tau_f \\ge 99{,}995$." },
        { texte: "$\\tau_f \\ge 99{,}995/(2\\pi \\times 211{,}35) = 75{,}3\\ \\mathrm{ms}$." },
        { texte: "Phase retirée à $\\omega_c$ : $\\arctan(0{,}746 \\times 0{,}0753) = 3{,}22^\\circ$, compatible avec le budget.", note: "Le capteur de $0{,}13\\ \\mathrm{s}$ du site convient : résidu de $0{,}29\\ \\mathrm{mbar}$ pour $5{,}5^\\circ$ déjà comptés dans le modèle." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Amplitude repliée en fonction de la constante de temps du filtre",
          xTitre: "constante de temps",
          xUnite: "ms",
          yTitre: "amplitude repliée",
          yUnite: "mbar",
          xMin: 0,
          xMax: 200,
          yMin: 0,
          yMax: 5,
          series: [{ id: "a", nom: "50 / √(1 + (2π f τ)²)", fonction: (t) => 50 / Math.sqrt(1 + (TAU * fP * t * 1e-3) ** 2) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 0.5, "limite 0,5 mbar", [7, 5]);
            ligneV(c, r, couleurs, tauMin * 1000, [3, 4]);
            ligneV(c, r, couleurs, 130, [1, 3]);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-cycle-libre",
      titre: "Régulation qui oscille aux heures chargées",
      niveau: "diagnostic",
      enonce:
        "<p>Sur un site analogue, la régulation de pression, calme à la mise en service, oscille depuis l'ajout d'une supervision, surtout aux heures de forte activité. " +
        "Le bloc PI est appelé dans le cycle libre de l'automate ; son paramètre de période vaut $100\\ \\mathrm{ms}$ ; le cycle mesuré varie de $8$ à $60\\ \\mathrm{ms}$. Quelles affirmations sont exactes ?</p>",
      options: [
        { texte: "Le bloc ajoute à chaque appel un incrément intégral prévu pour 100 ms : son action intégrale est de 1,7 à 12,5 fois trop forte, et varie avec la charge.", juste: true },
        { texte: "Il faut appeler le bloc dans une tâche périodique de 100 ms, ou lui fournir le temps réellement écoulé à chaque appel.", juste: true },
        { texte: "Le capteur de pression est certainement défaillant, puisque le réglage n'a pas changé." },
        { texte: "Réduire le paramètre de période à 8 ms résout le problème dans tous les cas." },
      ],
      etapes: [
        { texte: "Incrément par appel : $K_cT_{e,\\mathrm{param}}e/T_i$ ; nombre d'appels par seconde : $1/T_{e,\\text{réel}}$." },
        { texte: "Action intégrale réelle multipliée par $T_{e,\\mathrm{param}}/T_{e,\\text{réel}}$ : $100/60 = 1{,}7$ à $100/8 = 12{,}5$. La supervision a raccourci ou rendu irrégulier le cycle." },
        { texte: "Correction : tâche périodique à période fixe ; à défaut, mesurer $\\Delta t$ à chaque appel. Un paramètre fixe de $8\\ \\mathrm{ms}$ resterait faux dès que le cycle varie.", note: "Le capteur n'est pas en cause : le symptôme dépend de la charge de l'automate, pas du procédé." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(moteur, conteneur, "0 0 680 240", dessinDiagnostic(), "Appels du bloc PI : cycle libre irrégulier contre tâche périodique.");
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-demi-periode",
      titre: "Pourquoi une demi-période ?",
      niveau: "conceptuel",
      enonce: "<p>Expliquez sans calcul pourquoi un bloqueur d'ordre zéro se comporte, pour les signaux lents, comme un retard d'une demi-période, et pourquoi ce retard ne dépend pas de la fréquence du signal.</p>",
      motsCles: [["palier", "maintien", "maintenu", "constant", "escalier"], ["milieu", "moyen", "moyenne", "centre"], ["demi", "te/2", "moitie"], ["periode", "duree"]],
      minimum: 2,
      exemple: "Deux phrases suffisent : décrivez un palier, puis situez son milieu.",
      etapes: [
        { texte: "Chaque palier commence à l'instant de mesure et dure une période entière $T_e$." },
        { texte: "Sa valeur représente donc le signal avec un décalage qui va de $0$ au début à $T_e$ à la fin : en moyenne $T_e/2$." },
        { texte: "Ce décalage est fixé par la construction du palier, pas par le signal : il est le même pour toute fréquence lente devant $f_e$.", note: "C'est pourquoi la phase perdue, $\\omega T_e/2$, croît proportionnellement à la pulsation, comme pour tout retard pur." },
      ],
      visuelCorrection: correctionEtapes(
        ["palier : de t(k) à t(k) + Te", "décalage entre 0 et Te, moyenne Te/2", "retard fixe ⇒ phase ω Te/2, proportionnelle à ω"],
        "Origine du retard du bloqueur."
      ),
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

function dessinPlanQuiz(id) {
  const cx = 300;
  const cy = 140;
  const R = 100;
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.4">';
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" stroke-width="2"/>';
  s += '<path d="M120 ' + cy + 'H500" marker-end="url(#' + id + ')"/><path d="M' + cx + ' 255V24" marker-end="url(#' + id + ')"/>';
  s += '<path d="M' + (cx + R) + " " + (cy - 4) + "v8M" + (cx - R) + " " + (cy - 4) + 'v8"/>';
  s += "</g>" + TRAITS + ' stroke-width="2.6">';
  for (const z of [0.6, -0.6, -1.3]) {
    const x = cx + z * R;
    s += '<path d="M' + (x - 7) + " " + (cy - 7) + "L" + (x + 7) + " " + (cy + 7) + "M" + (x + 7) + " " + (cy - 7) + "L" + (x - 7) + " " + (cy + 7) + '"/>';
  }
  s += "</g>" + ECRITS;
  s += texte(cx + 0.6 * R, cy - 22, "A", ' text-anchor="middle" font-weight="700" font-size="15"');
  s += texte(cx - 0.6 * R, cy - 22, "B", ' text-anchor="middle" font-weight="700" font-size="15"');
  s += texte(cx - 1.3 * R, cy - 22, "C", ' text-anchor="middle" font-weight="700" font-size="15"');
  s += texte(cx + R + 4, cy + 18, "1") + texte(cx - R - 4, cy + 18, "-1", ' text-anchor="end"');
  s += texte(500, cy - 8, "Re z", ' text-anchor="end"') + texte(cx + 6, 34, "Im z");
  s += texte(cx + 70, cy + 96, "cercle unité") + "</g>";
  return s;
}

function zonesPlanQuiz() {
  const cx = 300;
  const cy = 140;
  const R = 100;
  return [
    { x: cx + 0.6 * R - 22, y: cy - 40, largeur: 44, hauteur: 56, etiquette: "pôle A" },
    { x: cx - 0.6 * R - 22, y: cy - 40, largeur: 44, hauteur: 56, etiquette: "pôle B", juste: true },
    { x: cx - 1.3 * R - 22, y: cy - 40, largeur: 44, hauteur: 56, etiquette: "pôle C" },
  ];
}

const VISUELS_QUIZ = [
  etapes(["Euler avant : p = 1 - Te/τ, sort du cercle si Te > 2τ", "Euler arrière : 0 < p < 1 toujours", "Tustin : |p| < 1 toujours ; exacte : e^(-Te/τ)"], "Stabilité conservée selon la méthode."),
  etapes(["bruit et pulsations au-delà de fe/2", "se replient dans la bande utile", "filtre anti-repliement indispensable"], "Le théorème suppose un spectre limité."),
  etapes(["Δφ = ωc Te / 2", "= 0,746 × 0,05 = 0,0373 rad", "= 2,14°"], "Phase perdue par le bloqueur seul."),
  etapes(["cycle libre : période variable", "bloc PI : période supposée fixe", "tâche périodique : Te constant et connu"], "Pourquoi une tâche périodique."),
  etapes(["q0 = Kc (1 + Te/Ti)", "= 6 × (1 + 0,1/1,2)", "= 6,5 Hz/bar"], "Coefficient q0 par Euler arrière."),
  () => ({ viewBox: "0 0 560 280", dessin: dessinPlanQuiz("fl-qv5"), legende: "B, réel négatif à l'intérieur du cercle : sortie alternée amortie. A : décroissance sans alternance. C : divergence alternée." }),
  etapes(["p = 1 - Te/τ", "|p| < 1 ⇔ 0 < Te < 2τ", "τ = 10 ms ⇒ Te < 20 ms"], "Limite de stabilité d'Euler avant."),
  etapes(["forme incrémentale : u(k) = sat(u(k-1) + Δu(k))", "la commande mémorisée reste dans les butées", "pas d'état intégral qui s'emballe"], "Forme incrémentale et saturation."),
  etapes(["m = arrondi(211,35/200) = 1", "fapp = |211,35 - 200|", "= 11,35 Hz"], "Fréquence apparente."),
  etapes(["moyenne de N = 10 échantillons, Ts = 10 ms", "retard = (N - 1) Ts / 2", "= 9 × 10 / 2 = 45 ms"], "Retard d'une moyenne glissante."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Quelles méthodes transforment toujours un filtre continu stable en récurrence stable, quelle que soit la période ?</p>",
        options: [{ texte: "Euler avant" }, { texte: "Euler arrière", juste: true }, { texte: "Tustin", juste: true }, { texte: "Invariance indicielle", juste: true }],
        multiple: true,
        explication: "Euler avant donne $p = 1 - T_e/\\tau$, instable dès $T_e &gt; 2\\tau$ ; les trois autres placent toujours le pôle à l'intérieur du cercle unité.",
        resume: "Stabilité et méthode",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Si le signal utile ne dépasse pas $2\\ \\mathrm{Hz}$, échantillonner à $5\\ \\mathrm{Hz}$ suffit, même si la mesure contient du bruit à $50\\ \\mathrm{Hz}$.</p>",
        reponse: false,
        explication: "Le théorème porte sur tout le contenu du signal échantillonné : le bruit de $50\\ \\mathrm{Hz}$ se replie à $|50 - 10 \\times 5| = 0\\ \\mathrm{Hz}$, un décalage qui semble constant. Il faut filtrer avant.",
        resume: "Théorème d'échantillonnage",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Boucle de pression, $\\omega_c = 0{,}746\\ \\mathrm{rad/s}$, $T_e = 100\\ \\mathrm{ms}$, calcul de durée négligeable avec écriture immédiate. Phase perdue, en degrés ?</p>",
        valeur: 0.746 * 0.05 * DEG,
        unite: "°",
        tolerance: 0.01,
        explication: "$\\Delta\\varphi = \\omega_cT_e/2 = 0{,}746 \\times 0{,}05 = 0{,}0373\\ \\mathrm{rad} = 2{,}14^\\circ$.",
        resume: "Phase du bloqueur",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi exécuter un bloc PID dans une tâche périodique plutôt que dans le cycle libre de l'automate ?</p>",
        motsCles: [["periode", "te", "intervalle", "cadence"], ["fixe", "constant", "regulier", "connu"], ["integr", "derive", "coefficient", "increment"]],
        minimum: 2,
        explication: "Les coefficients du bloc supposent une période fixe et connue ; dans le cycle libre, la période varie avec la charge, ce qui fausse l'intégrale et la dérivée.",
        resume: "Tâche périodique",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>PI $K_c = 6\\ \\mathrm{Hz/bar}$, $T_i = 1{,}2\\ \\mathrm{s}$, discrétisé par Euler arrière avec $T_e = 0{,}1\\ \\mathrm{s}$. Valeur de $q_0$, en Hz/bar ?</p>",
        valeur: 6.5,
        unite: "Hz/bar",
        tolerance: 0.005,
        explication: "$q_0 = 6 \\times (1 + 0{,}1/1{,}2) = 6{,}5\\ \\mathrm{Hz/bar}$ ; $q_1 = -6\\ \\mathrm{Hz/bar}$.",
        resume: "Coefficient q0",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Trois pôles discrets réels, A, B et C, sont placés dans le plan $z$. Lequel donne une sortie qui alterne d'un échantillon à l'autre tout en s'amortissant ?</p>",
        consigne: "Cliquez sur le pôle correspondant.",
        viewBox: "0 0 560 280",
        dessin: dessinPlanQuiz("fl-q5"),
        zones: zonesPlanQuiz(),
        explication: "B vaut $-0{,}6$ : réel négatif, donc alternance, et de module inférieur à $1$, donc amortissement. A vaut $0{,}6$ : décroissance monotone. C vaut $-1{,}3$, hors du cercle unité : divergence alternée.",
        resume: "Plan des pôles discrets",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Un filtre de constante de temps $10\\ \\mathrm{ms}$ est discrétisé par Euler avant. Au-delà de quelle période la récurrence devient-elle instable ?</p>",
        options: ["$5\\ \\mathrm{ms}$", "$10\\ \\mathrm{ms}$", "$20\\ \\mathrm{ms}$", "jamais"],
        bonnes: [2],
        explication: "$p = 1 - T_e/\\tau$ sort du cercle unité pour $T_e &gt; 2\\tau = 20\\ \\mathrm{ms}$ ; dès $10\\ \\mathrm{ms}$, la sortie alterne.",
        resume: "Euler avant",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Avec la forme incrémentale $u_k = u_{k-1} + \\Delta u_k$, borner $u_k$ avant de le mémoriser suffit à éviter l'emballement de l'intégrale.</p>",
        reponse: true,
        explication: "La commande mémorisée reste dans les butées ; aucun état intégral ne continue de croître. C'est un avantage de la forme incrémentale, qui en revanche ne sépare pas les contributions P et I.",
        resume: "Forme incrémentale",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Une carte d'entrée échantillonne à $200\\ \\mathrm{Hz}$ une mesure qui contient une pulsation de $211{,}35\\ \\mathrm{Hz}$. À quelle fréquence apparente la retrouve-t-on, en hertz ?</p>",
        valeur: 11.35,
        unite: "Hz",
        tolerance: 0.01,
        explication: "$m = \\mathrm{arrondi}(211{,}35/200) = 1$, $f_{\\mathrm{app}} = |211{,}35 - 200| = 11{,}35\\ \\mathrm{Hz}$.",
        resume: "Fréquence apparente",
      },
      {
        type: "calcul",
        enonce: repere(9) + "<p>Une moyenne glissante porte sur $10$ échantillons pris toutes les $10\\ \\mathrm{ms}$. Quel retard ajoute-t-elle, en millisecondes ?</p>",
        valeur: 45,
        unite: "ms",
        tolerance: 0.01,
        explication: "Retard $(N - 1)T_s/2 = 9 \\times 10/2 = 45\\ \\mathrm{ms}$ ; elle annule en échange les fréquences multiples de $10\\ \\mathrm{Hz}$.",
        resume: "Moyenne glissante",
      },
    ],
    { titre: "Quiz : dix questions mélangées" }
  );
  if (quiz) ressources.push(quiz);
  brancherVisuelsQuiz(racine, api, "#l-quiz-bloc", VISUELS_QUIZ);
}

/* --------------------------------------------------------------------------
   M. Cartes
   -------------------------------------------------------------------------- */

function construireCartesMemo(racine, api) {
  if (!racine.querySelector("#m-cartes")) return;
  const cartes = api.cartes(
    "#m-cartes",
    [
      { categorie: "Bloqueur", question: "Quelle est la fonction de transfert du bloqueur d'ordre zéro, et à quoi équivaut-il ?", reponse: "$B_0(s) = (1 - e^{-T_es})/s$ ; avec le gain $1/T_e$ de l'échantillonnage, un retard de $T_e/2$ et un gain $\\mathrm{sinc}(\\omega T_e/2)$ voisin de $1$." },
      { categorie: "Retard", question: "Quelle phase perd une boucle implantée en numérique ?", reponse: "$\\Delta\\varphi = \\omega_c(T_e/2 + \\tau_{\\mathrm{calc}})$ ; sortie au top suivant : $1{,}5\\,\\omega_cT_e$." },
      { categorie: "Repliement", question: "Où apparaît une composante de fréquence $f$ échantillonnée à $f_e$ ?", reponse: "À $|f - mf_e|$, avec $m$ l'entier le plus proche de $f/f_e$ : toujours entre $0$ et $f_e/2$." },
      { categorie: "Anti-repliement", question: "Où placer le filtre anti-repliement ?", reponse: "Avant l'échantillonnage : filtre analogique, amortissement du capteur, ou suréchantillonnage puis moyenne. Après, le repliement est irréversible." },
      { categorie: "Discrétisation", question: "Quelles substitutions donnent Euler avant, Euler arrière et Tustin ?", reponse: "$s \\leftarrow (z - 1)/T_e$, $(z - 1)/(zT_e)$ et $(2/T_e)(z - 1)/(z + 1)$." },
      { categorie: "Stabilité", question: "Quel est le piège d'Euler avant ?", reponse: "Le pôle $1 - T_e/\\tau$ alterne dès $T_e &gt; \\tau$ et sort du cercle unité dès $T_e &gt; 2\\tau$ : un filtre stable devient une récurrence instable." },
      { categorie: "Exact", question: "Qu'est-ce que l'invariance indicielle ?", reponse: "La récurrence exacte d'un système à entrée maintenue : pôles $z = e^{sT_e}$ ; pour un premier ordre, $y_k = e^{-T_e/\\tau}y_{k-1} + (1 - e^{-T_e/\\tau})u_{k-1}$." },
      { categorie: "PI numérique", question: "Quels sont les coefficients d'un PI discrétisé par Euler arrière ?", reponse: "$u_k = u_{k-1} + q_0e_k + q_1e_{k-1}$, $q_0 = K_c(1 + T_e/T_i)$, $q_1 = -K_c$ ; part intégrale par période $K_cT_e/T_i$." },
      { categorie: "Anti-emballement", question: "Comment s'écrit le recalcul en numérique, et quelle condition respecter ?", reponse: "$x_k \\leftarrow x_k + (T_e/T_t)(u_s - u_c)$ après l'écriture de la sortie ; stable si $T_e/T_t &lt; 2$, sans alternance si $T_e \\le T_t$." },
      { categorie: "Période", question: "Comment choisir la période d'échantillonnage ?", reponse: "Budget de phase de $5$ à $10^\\circ$, une dizaine d'échantillons par temps de montée, repliement maîtrisé, puis limites du matériel : charge, bruit de la dérivée, arrondi de l'intégrale." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["q0 = Kc (1 + Te/Ti)", "= 4 × (1 + 0,2/2)", "= 4,4"], "Coefficient q0 par Euler arrière."),
  etapes(["θnum = Te/2 + τcalc", "Te doublé : Te/2 doublé", "perte de phase doublée si τcalc = 0"], "Le retard du bloqueur suit la période."),
  etapes(["m = arrondi(48/50) = 1", "fapp = |48 - 50|", "= 2 Hz"], "Fréquence apparente."),
  etapes(["Ki = Kc / Ti", "= 6 / 1,2", "= 5 Hz/(bar.s)"], "Forme parallèle du PI de pression."),
  etapes(["|C(j∞)| = Kc (1 + N)", "= 2 × (1 + 10)", "= 22"], "Gain haute fréquence du PID filtré."),
  etapes(["τ = R C = 47 × 2,2 × 10⁻³ = 0,1034 s", "95 % atteints à 3τ", "= 0,31 s"], "Durée de précharge du bus continu."),
  etapes(["Zcc = U1cc / I1n = 800 / 20 = 40 Ω", "Rcc = P1cc / I1n² = 1200 / 400 = 3 Ω", "Xcc = √(40² - 3²) = 39,89 Ω"], "Paramètres de l'essai en court-circuit."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. PI $K_c = 4$, $T_i = 2\\ \\mathrm{s}$, discrétisé par Euler arrière avec $T_e = 0{,}2\\ \\mathrm{s}$. Valeur de $q_0$ ?</p>",
        valeur: 4.4,
        unite: "",
        tolerance: 0.005,
        explication: "$q_0 = 4 \\times (1 + 0{,}1) = 4{,}4$ ; $q_1 = -4$.",
        resume: "Coefficients du PI",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Avec un calcul de durée négligeable et une écriture immédiate, doubler la période double la phase perdue à la pulsation de coupure.</p>",
        reponse: true,
        explication: "$\\Delta\\varphi = \\omega_cT_e/2$ est proportionnelle à $T_e$ ; avec un délai de calcul fixe non nul, la perte ferait moins que doubler.",
        resume: "Période et phase",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Cette séance. Une ondulation de $48\\ \\mathrm{Hz}$ est échantillonnée à $50\\ \\mathrm{Hz}$. Fréquence apparente, en hertz ?</p>",
        valeur: 2,
        unite: "Hz",
        tolerance: 0.01,
        explication: "$m = 1$, $f_{\\mathrm{app}} = |48 - 50| = 2\\ \\mathrm{Hz}$ : une oscillation lente que rien ne distingue d'une vraie variation.",
        resume: "Repliement",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours précédent. Le PI de pression a $K_c = 6\\ \\mathrm{Hz/bar}$ et $T_i = 1{,}2\\ \\mathrm{s}$ en forme standard. Valeur de $K_i$ en forme parallèle, en Hz/(bar.s) ?</p>",
        valeur: 5,
        unite: "Hz/(bar.s)",
        tolerance: 0.005,
        explication: "$K_i = K_c/T_i = 6/1{,}2 = 5{,}0\\ \\mathrm{Hz/(bar.s)}$ ; vérifier l'unité de temps attendue par le bloc.",
        resume: "Conversion de forme",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Cours précédent. PID filtré de forme standard, $K_c = 2$ et $N = 10$. Gain en haute fréquence ?</p>",
        valeur: 22,
        unite: "",
        tolerance: 0.005,
        explication: "$|C(j\\infty)| = K_c(1 + N) = 22$ : le bruit de mesure est amplifié onze fois plus que par le seul gain $K_c$.",
        resume: "Dérivée filtrée",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours vieux d'une semaine. Un bus continu de $2{,}2\\ \\mathrm{mF}$ est préchargé à travers une résistance de $47\\ \\Omega$. Au bout de combien de temps, en secondes, atteint-il $95\\ \\%$ de sa tension finale ?</p>",
        valeur: 3 * 47 * 2.2e-3,
        unite: "s",
        tolerance: 0.02,
        explication: "$\\tau = RC = 0{,}1034\\ \\mathrm{s}$ ; $95\\ \\%$ sont atteints à $3\\tau \\approx 0{,}31\\ \\mathrm{s}$, plus exactement $\\tau\\ln 20 = 0{,}310\\ \\mathrm{s}$.",
        resume: "Précharge",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours vieux d'un mois. Essai en court-circuit d'un transformateur monophasé : $U_{1cc} = 800\\ \\mathrm{V}$, $I_{1n} = 20\\ \\mathrm{A}$, $P_{1cc} = 1200\\ \\mathrm{W}$. Réactance de fuite ramenée au primaire, en ohms ?</p>",
        valeur: Math.sqrt(40 * 40 - 9),
        unite: "Ω",
        tolerance: 0.01,
        explication: "$Z_{cc} = 800/20 = 40\\ \\Omega$, $R_{cc} = 1200/400 = 3\\ \\Omega$, $X_{cc} = \\sqrt{40^2 - 3^2} = 39{,}89\\ \\Omega$.",
        resume: "Essai en court-circuit",
      },
    ],
    { titre: "Révision espacée : sept questions" }
  );
  if (quiz) ressources.push(quiz);
  brancherVisuelsQuiz(racine, api, "#n-revision-bloc", VISUELS_REVISION);
}

/* --------------------------------------------------------------------------
   P. Auto-évaluation
   -------------------------------------------------------------------------- */

function construireAutoEval(racine, api) {
  if (!racine.querySelector("#p-autoevaluation-grille")) return;
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur la commande numérique ?",
  });
  if (auto) ressources.push(auto);
}
