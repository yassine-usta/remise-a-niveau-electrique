/* ==========================================================================
   cours/onduleurs-monophases/cours.js
   Onduleurs monophasés : bras, demi-pont, pont en H, commande décalée,
   modulation sinusoïdale, filtre LC, puissance pulsée du bus.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const TAU = 2 * Math.PI;

/* --------------------------------------------------------------------------
   Modèles physiques
   -------------------------------------------------------------------------- */

/** Porteuse triangulaire d'amplitude 1, de période 1, valant -1 à l'origine. */
function triangle(x) {
  const u = ((x % 1) + 1) % 1;
  return u < 0.5 ? 4 * u - 1 : 3 - 4 * u;
}

/** Tension découpée rapportée à E, u étant le temps en périodes de sortie. */
function mli(u, ma, mf, unipolaire) {
  const ref = ma * Math.sin(TAU * u);
  const porteuse = triangle(mf * u);
  if (!unipolaire) return ref > porteuse ? 1 : -1;
  return (ref > porteuse ? 1 : 0) - (-ref > porteuse ? 1 : 0);
}

/** Tension de commande décalée rapportée à E, alpha en degrés. */
function decale(u, alphaDeg) {
  const deg = ((((u % 1) + 1) % 1) * 360);
  if (deg > alphaDeg && deg < 180 - alphaDeg) return 1;
  if (deg > 180 + alphaDeg && deg < 360 - alphaDeg) return -1;
  return 0;
}

/** Amplitudes crêtes des harmoniques 1 à hMax d'un signal échantillonné sur une période. */
function amplitudes(echantillons, hMax) {
  const N = echantillons.length;
  const resultat = [0];
  for (let h = 1; h <= hMax; h += 1) {
    let a = 0;
    let b = 0;
    for (let k = 0; k < N; k += 1) {
      const angle = (TAU * h * k) / N;
      a += echantillons[k] * Math.cos(angle);
      b += echantillons[k] * Math.sin(angle);
    }
    resultat.push((2 / N) * Math.hypot(a, b));
  }
  return resultat;
}

/** Courant d'une charge R-L en régime établi sous un carré +E / -E de période T. */
function courantCarre(E, R, tau, T) {
  const demi = T / 2;
  const I0 = -(E / R) * Math.tanh(demi / (2 * tau));
  return (t) => {
    const tt = ((t % T) + T) % T;
    if (tt < demi) return E / R + (I0 - E / R) * Math.exp(-tt / tau);
    const s = tt - demi;
    return -(E / R + (I0 - E / R) * Math.exp(-s / tau));
  };
}

/* --------------------------------------------------------------------------
   Utilitaires de dessin
   -------------------------------------------------------------------------- */

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
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

function chaine(points) {
  return points.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';

function ligneH(c, repere, couleurs, y, libelle) {
  const py = repere.versY(y);
  c.save();
  c.setLineDash([7, 5]);
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

function ligneV(c, repere, couleurs, x, libelle) {
  const px = repere.versX(x);
  c.save();
  c.setLineDash([2, 4]);
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
    const aGauche = px > repere.boite.x + repere.boite.l * 0.62;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

function traceCorrection(moteurApi, conteneur, options) {
  const traceur = moteurApi.sim.traceur(conteneur, { genre: "Correction visuelle", ratio: 0.42, echantillons: 900, ...options });
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
function dessinEtapes(lignes, largeur = 600) {
  const hauteur = 30 + lignes.length * 22;
  return (
    TRAITS + ' stroke-width="1.4"><rect x="6" y="6" width="' + (largeur - 12) + '" height="' + (hauteur - 12) + '" rx="8"/></g>' +
    ECRITS + lignes.map((ligne, i) => texte(22, 32 + i * 22, ligne)).join("") + "</g>"
  );
}

function etapes(lignes, legende, largeur = 600) {
  return { viewBox: "0 0 " + largeur + " " + (30 + lignes.length * 22), dessin: dessinEtapes(lignes, largeur), legende };
}

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

/** Synchronise une poignée et un lecteur sur une même grandeur. */
function synchroniseur(dessiner) {
  const etat = { poignee: null, lecteur: null, verrou: false, valeur: null };
  etat.appliquer = (valeur, source) => {
    if (etat.verrou) return;
    etat.verrou = true;
    etat.valeur = valeur;
    dessiner(valeur);
    if (source !== "poignee" && etat.poignee) etat.poignee.set(valeur, false);
    if (source !== "lecteur" && etat.lecteur) etat.lecteur.suivre(valeur);
    etat.verrou = false;
  };
  etat.redessiner = () => {
    if (etat.valeur != null) dessiner(etat.valeur);
  };
  return etat;
}

function longueurPolyligne(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i += 1) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

function pointSurPolyligne(pts, s) {
  let reste = s;
  for (let i = 1; i < pts.length; i += 1) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (reste <= l) {
      const r = l > 0 ? reste / l : 0;
      return [pts[i - 1][0] + r * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + r * (pts[i][1] - pts[i - 1][1])];
    }
    reste -= l;
  }
  return pts[pts.length - 1];
}

/* --------------------------------------------------------------------------
   Pont en H dessiné en SVG, réutilisé par l'animation, le quiz et les corrections
   -------------------------------------------------------------------------- */

const XA = 120;
const XB = 280;

function cellule(x, haut, fermee) {
  const y1 = haut ? 65 : 195;
  const y2 = haut ? 115 : 245;
  const lame = fermee ? "M" + x + " " + y2 + "V" + y1 : "M" + x + " " + y2 + "L" + (x - 16) + " " + (y1 + 8);
  const d = x + 30;
  const diode = haut
    ? "M" + x + " 50H" + d + "V86M" + d + " 104V140H" + x
    : "M" + x + " 170H" + d + "V206M" + d + " 224V260H" + x;
  const ty = haut ? 104 : 224;
  const by = haut ? 86 : 206;
  return (
    '<circle cx="' + x + '" cy="' + y1 + '" r="3"/><circle cx="' + x + '" cy="' + y2 + '" r="3"/>' +
    '<path d="' + lame + '" stroke-width="2.4"/>' +
    '<path d="' + diode + '"/>' +
    '<path d="M' + (d - 10) + " " + ty + "L" + d + " " + by + "L" + (d + 10) + " " + ty + 'Z"/>' +
    '<path d="M' + (d - 10) + " " + by + 'h20" stroke-width="2.6"/>'
  );
}

/** Pont en H : fermes liste les interrupteurs commandés, par exemple ["T1", "T4"]. */
function dessinPont(fermes = [], idMarqueur = "fl-pq") {
  const f = new Set(fermes);
  let s = "<defs>" + marqueur(idMarqueur) + "</defs>";
  s += TRAITS + ' stroke-width="2.2">';
  s += '<path d="M40 40H' + XB + "M40 270H" + XB + '"/>';
  s += '<path d="M40 40V135M40 175V270"/><circle cx="40" cy="155" r="20"/>';
  for (const x of [XA, XB]) s += '<path d="M' + x + " 40V65M" + x + " 115V195M" + x + ' 245V270"/>';
  s += cellule(XA, true, f.has("T1")) + cellule(XA, false, f.has("T2"));
  s += cellule(XB, true, f.has("T3")) + cellule(XB, false, f.has("T4"));
  s += '<path d="M' + XA + ' 155H160"/><rect x="160" y="145" width="30" height="20" rx="3"/>';
  s += '<path d="M190 155H196a7 7 0 0 1 14 0a7 7 0 0 1 14 0a7 7 0 0 1 14 0a7 7 0 0 1 14 0H' + XB + '"/>';
  s += "</g>";
  s += '<g fill="currentColor" stroke="none"><circle cx="' + XA + '" cy="155" r="3.8"/><circle cx="' + XB + '" cy="155" r="3.8"/></g>';
  s += TRAITS + ' stroke-width="1.4"><path d="M200 132H236" marker-end="url(#' + idMarqueur + ')"/>';
  s += '<path d="M262 186H164" marker-end="url(#' + idMarqueur + ')" stroke-dasharray="5 4"/></g>';
  s += ECRITS;
  s += texte(34, 147, "+") + texte(35, 175, "-") + texte(8, 160, "E");
  s += texte(XA - 36, 95, "T1") + texte(XA - 36, 225, "T2") + texte(XA + 44, 100, "D1") + texte(XA + 44, 220, "D2");
  s += texte(XB - 36, 95, "T3") + texte(XB - 36, 225, "T4") + texte(XB + 44, 100, "D3") + texte(XB + 44, 220, "D4");
  s += texte(XA - 16, 150, "A") + texte(XB - 16, 150, "B");
  s += texte(166, 180, "R", ' font-size="11"') + texte(218, 172, "L", ' font-size="11"');
  s += texte(206, 124, "i_s", ' font-size="11"') + texte(206, 204, "v_s", ' font-size="11"');
  s += texte(150, 32, "+E", ' font-size="11"') + texte(150, 290, "0 V", ' font-size="11"');
  s += "</g>";
  return s;
}

/** Mailles parcourues, dans le sens réel du courant. */
const MAILLES = {
  T1T4: [[40, 135], [40, 40], [XA, 40], [XA, 155], [XB, 155], [XB, 270], [40, 270], [40, 175]],
  D1D4: [[40, 175], [40, 270], [XB, 270], [XB, 260], [XB + 30, 260], [XB + 30, 170], [XB, 170], [XB, 155], [XA, 155], [XA, 140], [XA + 30, 140], [XA + 30, 50], [XA, 50], [XA, 40], [40, 40], [40, 135]],
  T2T3: [[40, 135], [40, 40], [XB, 40], [XB, 155], [XA, 155], [XA, 270], [40, 270], [40, 175]],
  D2D3: [[40, 175], [40, 270], [XA, 270], [XA, 260], [XA + 30, 260], [XA + 30, 170], [XA, 170], [XA, 155], [XB, 155], [XB, 140], [XB + 30, 140], [XB + 30, 50], [XB, 50], [XB, 40], [40, 40], [40, 135]],
};

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeurs = [];

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireGlissante(racine, api);
  construireQuadrants(racine, api);
  construireDecale(racine, api);
  construireMli(racine, api);
  construireFiltre(racine, api);
  construireBus(racine, api);
  construireFresnel(racine, api);
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
    ["#d-bras-figure svg", 1.5],
    ["#e-demi-pont-figure svg", 1.5],
    ["#e-pont-figure svg", 1.7],
    ["#f-schema-principal svg", 1.6],
    ["#h-figure svg", 1.4],
    ["#i-figure svg", 1.5],
  ];
  for (const [selecteur, duree] of schemas) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree }));
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
      id: "c1-moyenne-creneau",
      titre: "Valeur moyenne d'un créneau symétrique",
      niveau: "fondamental",
      enonce: "<p>Une tension vaut $+400\\ \\mathrm{V}$ pendant $70\\ \\%$ de chaque période et $-400\\ \\mathrm{V}$ le reste du temps. Quelle est sa valeur moyenne, en volts ?</p>",
      valeur: 160,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Valeur moyenne",
      etapes: [
        { texte: "Valeur moyenne d'un créneau à deux niveaux : $\\langle v\\rangle = dV_h + (1 - d)V_b$." },
        { texte: "$\\langle v\\rangle = 0{,}7 \\times 400 + 0{,}3 \\times (-400) = 280 - 120 = 160\\ \\mathrm{V}$." },
        { texte: "Forme compacte : $(2d - 1)E = 0{,}4 \\times 400 = 160\\ \\mathrm{V}$.", note: "C'est la relation qui fonde la modulation : faire varier $d$ fait varier la moyenne entre $-E$ et $+E$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Créneau à 70 % et sa valeur moyenne",
          xTitre: "temps", xUnite: "période", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 3, yMin: -480, yMax: 480,
          series: [{ id: "v", nom: "v(t)", couleur: "serie-1", epaisseur: 2.2, fonction: (u) => ((u % 1) < 0.7 ? 400 : -400) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 160, "moyenne : 160 V");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-fondamental-carre",
      titre: "Fondamental d'un signal carré",
      niveau: "fondamental",
      enonce: "<p>Un signal carré symétrique vaut alternativement $+100\\ \\mathrm{V}$ et $-100\\ \\mathrm{V}$. Quelle est l'amplitude crête de son fondamental, en volts ?</p>",
      valeur: 400 / Math.PI,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Amplitude crête du fondamental",
      etapes: [
        { texte: "Série de Fourier du carré $\\pm A$ : harmoniques impairs d'amplitude $4A/(h\\pi)$." },
        { texte: "Rang 1 : $\\hat{V}_1 = 4 \\times 100/\\pi = 127{,}3\\ \\mathrm{V}$." },
        { texte: "Le fondamental dépasse l'amplitude du carré de $27\\ \\%$ ; sa valeur efficace vaut $90{,}0\\ \\mathrm{V}$, contre $100\\ \\mathrm{V}$ pour le carré entier.", note: "La différence, $43{,}5\\ \\mathrm{V}$ efficaces, est portée par les harmoniques." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Carré et fondamental",
          xTitre: "angle", xUnite: "degrés", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 720, yMin: -150, yMax: 150,
          series: [
            { id: "v", nom: "carré ±100 V", couleur: "serie-1", epaisseur: 1.8, fonction: (d) => (((d % 360) + 360) % 360 < 180 ? 100 : -100) },
            { id: "f", nom: "fondamental, 127,3 V crête", couleur: "serie-3", epaisseur: 2.6, fonction: (d) => (400 / Math.PI) * Math.sin((d * Math.PI) / 180) },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "c3-frequence-propre",
      titre: "Fréquence propre d'un filtre LC",
      niveau: "fondamental",
      enonce: "<p>Une inductance de $1\\ \\mathrm{mH}$ suivie d'un condensateur de $10\\ \\mathrm{\\mu F}$ forme un passe-bas. Quelle est sa fréquence propre ?</p>",
      options: [
        { texte: "$159\\ \\mathrm{Hz}$" },
        { texte: "$1{,}59\\ \\mathrm{kHz}$", juste: true },
        { texte: "$10\\ \\mathrm{kHz}$" },
        { texte: "$15{,}9\\ \\mathrm{kHz}$" },
      ],
      etapes: [
        { texte: "$f_0 = \\dfrac{1}{2\\pi\\sqrt{LC}}$ avec $LC = 10^{-3} \\times 10^{-5} = 10^{-8}\\ \\mathrm{s^2}$." },
        { texte: "$\\sqrt{LC} = 10^{-4}\\ \\mathrm{s}$, donc $f_0 = 1/(2\\pi \\times 10^{-4}) = 1592\\ \\mathrm{Hz}$." },
        { texte: "Au-delà de $f_0$, l'atténuation croît en $(f_0/f)^2$ : à $32\\ \\mathrm{kHz}$, environ $1/400$.", note: "C'est le filtre de sortie retenu pour l'ASI du projet fil rouge." },
      ],
    })
  );
}

/* --------------------------------------------------------------------------
   D. Valeur moyenne glissante : animation manipulable
   -------------------------------------------------------------------------- */

function construireGlissante(racine, api) {
  const conteneur = racine.querySelector("#d-glissante");
  if (!conteneur) return;
  const G = { x0: 70, l: 640, yc: 150, A: 92, piste: 296 };
  const E = 400;
  const N = 4000;
  const reglages = { ma: 0.8, mf: 12 };
  let v = [];
  let cumul = [];

  const svg = svgEl("svg", {
    viewBox: "0 0 760 330",
    role: "img",
    "aria-label": "Valeur moyenne glissante d'une tension découpée en modulation bipolaire, avec fenêtre de calcul déplaçable",
  });
  const axes = svgEl("g");
  const fenetre = svgEl("g");
  const courbes = svgEl("g");
  const moyenne = svgEl("g");
  const curseur = svgEl("g");
  svg.append(axes, fenetre, courbes, moyenne, curseur);
  conteneur.appendChild(svg);

  const xT = (u) => G.x0 + G.l * u;
  const yV = (val) => G.yc - G.A * val;

  axes.innerHTML =
    TRAITS + ' stroke-width="1.3" opacity="0.75">' +
    '<path d="M' + G.x0 + " " + G.yc + "H" + (G.x0 + G.l + 10) + '"/>' +
    '<path d="M' + G.x0 + " 36V264" + '"/>' +
    '<path d="M' + (G.x0 - 5) + " " + yV(1) + "h10M" + (G.x0 - 5) + " " + yV(-1) + 'h10"/>' +
    '<path d="M' + G.x0 + " " + G.piste + "H" + (G.x0 + G.l) + '" stroke-width="1.8"/>' +
    "</g>" +
    ECRITS +
    texte(G.x0 - 30, yV(1) + 4, "+E") + texte(G.x0 - 30, yV(-1) + 4, "-E") + texte(G.x0 - 18, G.yc + 4, "0") +
    texte(G.x0 + G.l + 14, G.yc + 4, "t") + texte(G.x0 + G.l - 36, G.yc + 18, "20 ms", ' font-size="11"') +
    texte(G.x0, G.piste + 22, "instant observé : faire glisser la poignée", ' font-size="11"') +
    "</g>";

  const valeurs = api.sim.valeurs("#d-glissante-valeurs", [
    { id: "t", libelle: "Instant", unite: "ms", decimales: 2 },
    { id: "d", libelle: "Rapport cyclique local d", decimales: 3 },
    { id: "moy", libelle: "Moyenne glissante", unite: "V", decimales: 1 },
    { id: "ref", libelle: "Référence m_a E sin ωt", unite: "V", decimales: 1 },
    { id: "ecart", libelle: "Écart", unite: "V", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function moyenneEn(k) {
    const w = Math.max(2, Math.round(N / reglages.mf));
    const debut = k - Math.floor(w / 2);
    let somme = 0;
    for (let j = 0; j < w; j += 1) somme += v[(((debut + j) % N) + N) % N];
    return somme / w;
  }

  function recalculer() {
    v = new Array(N);
    for (let k = 0; k < N; k += 1) v[k] = mli(k / N, reglages.ma, reglages.mf, false);
    cumul = new Array(N);
    for (let k = 0; k < N; k += 1) cumul[k] = moyenneEn(k);
    let d = "M" + xT(0).toFixed(1) + " " + yV(v[0]).toFixed(1);
    for (let k = 1; k < N; k += 1) {
      if (v[k] !== v[k - 1]) d += "H" + xT(k / N).toFixed(1) + "V" + yV(v[k]).toFixed(1);
    }
    d += "H" + xT(1).toFixed(1);
    const ref = [];
    for (let k = 0; k <= 200; k += 1) ref.push([xT(k / 200), yV(Math.max(-1.25, Math.min(1.25, reglages.ma * Math.sin((TAU * k) / 200))))]);
    courbes.innerHTML =
      TRAITS + ' stroke-width="1.1" opacity="0.7"><path d="' + d + '"/></g>' +
      TRAITS + ' stroke-width="1.8" stroke-dasharray="6 5"><polyline points="' + chaine(ref) + '"/></g>';
  }

  function placer(tms) {
    const u = Math.min(Math.max(tms / 20, 0), 0.99999);
    const k = Math.floor(u * N);
    const pts = [];
    for (let j = 0; j <= k; j += 8) pts.push([xT(j / N), yV(cumul[j])]);
    pts.push([xT(u), yV(cumul[k])]);
    moyenne.innerHTML = TRAITS + ' stroke-width="3.2"><polyline points="' + chaine(pts) + '"/></g>';
    const largeur = G.l / reglages.mf;
    const xg = xT(u) - largeur / 2;
    fenetre.innerHTML =
      '<rect x="' + xg.toFixed(1) + '" y="' + (yV(1) - 8) + '" width="' + largeur.toFixed(1) + '" height="' + (2 * G.A + 16) + '" rx="3" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-opacity="0.5" stroke-width="1"/>';
    curseur.innerHTML =
      TRAITS + ' stroke-width="1" stroke-dasharray="3 4"><path d="M' + xT(u).toFixed(1) + " 36V" + G.piste + '"/></g>' +
      '<circle cx="' + xT(u).toFixed(1) + '" cy="' + yV(cumul[k]).toFixed(1) + '" r="5.5" fill="currentColor"/>';
    const moy = cumul[k] * E;
    const refV = reglages.ma * E * Math.sin(TAU * u);
    if (valeurs) {
      valeurs.maj({
        t: u * 20,
        d: (cumul[k] + 1) / 2,
        moy,
        ref: refV,
        ecart: moy - refV,
      });
    }
  }

  const synchro = synchroniseur(placer);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: G.x0, y: G.piste },
    a: { x: G.x0 + G.l, y: G.piste },
    min: 0,
    max: 20,
    pas: 0.05,
    valeur: 2.5,
    unite: "ms",
    libelle: "Instant observé sur une période de 20 ms",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  const curseurs = api.sim.curseurs(
    "#d-glissante-curseurs",
    [
      { id: "ma", libelle: "Indice de modulation m_a", min: 0, max: 1.4, pas: 0.01, valeur: reglages.ma, format: (x) => nb(api, x, 2) },
      { id: "mf", libelle: "Périodes de découpage par période, m_f", min: 6, max: 30, pas: 1, valeur: reglages.mf, format: (x) => String(Math.round(x)) },
    ],
    (lues) => {
      reglages.ma = lues.ma;
      reglages.mf = Math.round(lues.mf);
      recalculer();
      synchro.redessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  synchro.lecteur = api.sim.lecteur("#d-glissante-lecteur", {
    de: 0,
    a: 20,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Parcours d'une période de sortie",
    rappel: (t) => synchro.appliquer(t, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  if (!v.length) recalculer();
  synchro.appliquer(2.5, null);
  ressources.push(api.dessiner(axes, { declencheur: conteneur, duree: 1.1 }));
}

/* --------------------------------------------------------------------------
   E. Quatre quadrants : pont en H manipulable
   -------------------------------------------------------------------------- */

function construireQuadrants(racine, api) {
  const conteneur = racine.querySelector("#e-quadrants");
  if (!conteneur) return;
  const E = 400;
  const R = 10;
  const T = 0.02;
  const C = { x0: 390, l: 350, yc: 150, Av: 62, Ai: 88, piste: 300 };
  const reglages = { tau: 4e-3 };
  let i = null;
  let Imax = 1;
  let charge = [];

  const svg = svgEl("svg", {
    viewBox: "0 0 780 330",
    role: "img",
    "aria-label": "Pont en H en pleine onde sur charge inductive : maille parcourue, composants passants, chronogrammes de la tension et du courant",
  });
  const pont = svgEl("g");
  const maille = svgEl("g");
  const points = svgEl("g", { fill: "currentColor", stroke: "none" });
  const chrono = svgEl("g");
  const curseur = svgEl("g");
  svg.append(pont, maille, chrono, curseur, points);
  conteneur.appendChild(svg);

  const xA = (deg) => C.x0 + (C.l * deg) / 360;
  const yv = (val) => C.yc - (C.Av * val) / E;
  const yi = (val) => C.yc - (C.Ai * val) / Imax;

  const valeurs = api.sim.valeurs("#e-quadrants-valeurs", [
    { id: "angle", libelle: "Angle ωt", unite: "°", decimales: 0 },
    { id: "v", libelle: "v_s", unite: "V", decimales: 0 },
    { id: "i", libelle: "i_s", unite: "A", decimales: 2 },
    { id: "passants", libelle: "Composants passants", format: (x) => x },
    { id: "p", libelle: "Puissance fournie par le bus", unite: "kW", decimales: 2 },
    { id: "echange", libelle: "Échange", format: (x) => x },
  ]);
  if (valeurs) ressources.push(valeurs);

  function recalculer() {
    i = courantCarre(E, R, reglages.tau, T);
    Imax = Math.max(0.5, (E / R) * Math.tanh(T / 2 / (2 * reglages.tau))) * 1.08;
    charge = [0];
    for (let d = 1; d <= 360; d += 1) charge.push(charge[d - 1] + Math.abs(i(((d - 0.5) / 360) * T)));
    let s = "<defs>" + '<pattern id="hach-q" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V7" stroke="currentColor" stroke-width="1.6" opacity="0.5"/></pattern></defs>';
    s += TRAITS + ' stroke-width="1.3" opacity="0.75">';
    s += '<path d="M' + C.x0 + " " + C.yc + "H" + (C.x0 + C.l + 10) + "M" + C.x0 + ' 50V250"/>';
    s += '<path d="M' + C.x0 + " " + C.piste + "H" + (C.x0 + C.l) + '" stroke-width="1.8"/>';
    for (const deg of [90, 180, 270, 360]) s += '<path d="M' + xA(deg).toFixed(1) + " " + (C.yc - 4) + "v8" + '"/>';
    s += "</g>";
    /* zones où v et i sont de signes opposés */
    const tz = reglages.tau * Math.log(1 + Math.tanh(T / 2 / (2 * reglages.tau)));
    const dz = (tz / T) * 360;
    for (const debut of [0, 180]) {
      s += '<rect x="' + xA(debut).toFixed(1) + '" y="56" width="' + (xA(debut + dz) - xA(debut)).toFixed(1) + '" height="188" fill="url(#hach-q)" stroke="none"/>';
    }
    const vpts = "M" + xA(0) + " " + yv(E) + "H" + xA(180) + "V" + yv(-E) + "H" + xA(360);
    s += TRAITS + ' stroke-width="1.4"><path d="' + vpts + '"/></g>';
    const ipts = [];
    for (let d = 0; d <= 360; d += 2) ipts.push([xA(d), yi(i((d / 360) * T))]);
    s += TRAITS + ' stroke-width="3"><polyline points="' + chaine(ipts) + '"/></g>';
    s += ECRITS + texte(C.x0 - 34, yv(E) + 4, "+E") + texte(C.x0 - 34, yv(-E) + 4, "-E");
    s += texte(C.x0 + 4, 46, "v_s en trait fin, i_s en trait épais", ' font-size="11"');
    s += texte(xA(180) - 10, C.yc + 20, "180", ' font-size="10.5"') + texte(xA(360) - 14, C.yc + 20, "360", ' font-size="10.5"');
    s += texte(C.x0, C.piste + 22, "angle ωt : faire glisser la poignée", ' font-size="11"') + "</g>";
    chrono.innerHTML = s;
  }

  function placer(deg) {
    if (!i) return;
    const d = Math.min(Math.max(deg, 0), 359.9);
    const t = (d / 360) * T;
    const vs = d < 180 ? E : -E;
    const is = i(t);
    let cle;
    if (vs > 0) cle = is >= 0 ? "T1T4" : "D1D4";
    else cle = is <= 0 ? "T2T3" : "D2D3";
    const fermes = vs > 0 ? ["T1", "T4"] : ["T2", "T3"];
    pont.innerHTML = dessinPont(fermes, "fl-quad");
    const pts = MAILLES[cle];
    maille.innerHTML =
      '<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="8" opacity="0.5" style="stroke: var(--serie-2)"><polyline points="' + chaine(pts) + '"/></g>';
    const lg = longueurPolyligne(pts);
    const avance = (charge[Math.round(d)] / Math.max(1e-6, charge[360])) * 360 * 2.2;
    let p = "";
    if (Math.abs(is) > 0.02 * Imax) {
      for (let s = avance % 40; s < lg; s += 40) {
        const pt = pointSurPolyligne(pts, s);
        p += '<circle cx="' + pt[0].toFixed(1) + '" cy="' + pt[1].toFixed(1) + '" r="3.4"/>';
      }
    }
    points.innerHTML = p;
    curseur.innerHTML =
      TRAITS + ' stroke-width="1" stroke-dasharray="3 4"><path d="M' + xA(d).toFixed(1) + " 50V" + C.piste + '"/></g>' +
      '<circle cx="' + xA(d).toFixed(1) + '" cy="' + yi(is).toFixed(1) + '" r="5" fill="currentColor"/>';
    const noms = { T1T4: "transistors T1 et T4", D1D4: "diodes D1 et D4", T2T3: "transistors T2 et T3", D2D3: "diodes D2 et D3" };
    if (valeurs) {
      valeurs.maj({
        angle: d,
        v: vs,
        i: is,
        passants: noms[cle],
        p: (vs * is) / 1000,
        echange: vs * is >= 0 ? "le bus fournit" : "le bus reçoit",
      });
    }
  }

  const synchro = synchroniseur(placer);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: C.x0, y: C.piste },
    a: { x: C.x0 + C.l, y: C.piste },
    min: 0,
    max: 360,
    pas: 1,
    valeur: 20,
    unite: "°",
    libelle: "Angle électrique sur une période",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  const curseurs = api.sim.curseurs(
    "#e-quadrants-curseurs",
    [{ id: "tau", libelle: "Constante de temps τ = L/R de la charge", min: 0.5, max: 15, pas: 0.5, valeur: 4, unite: "ms" }],
    (lues) => {
      reglages.tau = lues.tau / 1000;
      recalculer();
      synchro.redessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  synchro.lecteur = api.sim.lecteur("#e-quadrants-lecteur", {
    de: 0,
    a: 360,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Parcours d'une période",
    rappel: (deg) => synchro.appliquer(deg, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  if (!i) recalculer();
  synchro.appliquer(20, null);
  ressources.push(api.dessiner(chrono, { declencheur: conteneur, duree: 1.2 }));
}

/* --------------------------------------------------------------------------
   E. Commande décalée
   -------------------------------------------------------------------------- */

function construireDecale(racine, api) {
  if (!racine.querySelector("#e-decale-trace")) return;
  const reglages = { alpha: 30, E: 400 };

  const trace = api.sim.traceur("#e-decale-trace", {
    titre: "Tension quasi carrée et fondamental",
    xTitre: "temps", xUnite: "ms", yTitre: "tension", yUnite: "V",
    xMin: 0, xMax: 20, yMin: -700, yMax: 700,
    echantillons: 1600,
    series: [
      { id: "v", nom: "v_s(t), commande décalée", couleur: "serie-1", epaisseur: 1.6 },
      { id: "f", nom: "fondamental", couleur: "serie-3", epaisseur: 2.8 },
    ],
  });
  if (trace) ressources.push(trace);

  const spectre = api.sim.spectre("#e-decale-spectre", {
    titre: "Spectre en valeurs efficaces, rangs 1 à 15",
    xTitre: "rang h",
    yTitre: "V_h",
    unite: "V",
    barres: [],
  });
  if (spectre) ressources.push(spectre);

  function maj() {
    const { alpha, E } = reglages;
    const ar = (alpha * Math.PI) / 180;
    const Vh = (h) => Math.abs(((2 * Math.SQRT2 * E) / (h * Math.PI)) * Math.cos(h * ar));
    const V1 = Vh(1);
    let somme = 0;
    for (let h = 3; h <= 199; h += 2) somme += Vh(h) * Vh(h);
    const Vtot = E * Math.sqrt(Math.max(0, 1 - (2 * ar) / Math.PI));
    if (trace) {
      trace.definirPlage({ yMin: -1.6 * E, yMax: 1.6 * E });
      trace.definirFonction("v", (tms) => E * decale(tms / 20, alpha));
      trace.definirFonction("f", (tms) => ((4 * E) / Math.PI) * Math.cos(ar) * Math.sin((TAU * tms) / 20));
      trace.definirMesures([
        { nom: "Valeur efficace totale", valeur: nb(api, Vtot, 1) + " V" },
        { nom: "Fondamental V1", valeur: nb(api, V1, 1) + " V" },
        { nom: "Taux de distorsion, rangs 3 à 199", valeur: V1 > 1e-6 ? nb(api, (Math.sqrt(somme) / V1) * 100, 1) + " %" : "indéfini" },
        { nom: "Rang 3 et rang 5", valeur: nb(api, Vh(3), 1) + " V et " + nb(api, Vh(5), 1) + " V" },
      ]);
    }
    if (spectre) {
      const barres = [];
      for (let h = 1; h <= 15; h += 2) barres.push({ etiquette: String(h), valeur: Vh(h) });
      spectre.definirBarres(barres);
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-decale-curseurs",
    [
      { id: "alpha", libelle: "Demi-largeur des paliers nuls α", min: 0, max: 90, pas: 0.5, valeur: reglages.alpha, unite: "°" },
      { id: "E", libelle: "Tension du bus E", min: 100, max: 600, pas: 10, valeur: reglages.E, unite: "V" },
    ],
    (lues) => {
      reglages.alpha = lues.alpha;
      reglages.E = lues.E;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   E. Modulation de largeur d'impulsion sinusoïdale
   -------------------------------------------------------------------------- */

function construireMli(racine, api) {
  if (!racine.querySelector("#e-mli-sortie")) return;
  const reglages = { ma: 0.8, mf: 15, uni: false };
  const N = 8192;

  const comparaison = api.sim.traceur("#e-mli-comparaison", {
    titre: "Porteuse et références",
    xTitre: "temps", xUnite: "ms", yTitre: "niveau", yUnite: "",
    xMin: 0, xMax: 20, yMin: -1.5, yMax: 1.5,
    echantillons: 1800,
    series: [
      { id: "tri", nom: "porteuse triangulaire", couleur: "serie-6", epaisseur: 1.2 },
      { id: "ref", nom: "référence m_a sin ωt, bras A", couleur: "serie-1", epaisseur: 2.4 },
      { id: "refb", nom: "référence opposée, bras B en unipolaire", couleur: "serie-5", epaisseur: 2.4 },
    ],
  });
  if (comparaison) ressources.push(comparaison);

  const sortie = api.sim.traceur("#e-mli-sortie", {
    titre: "Tension de sortie rapportée à E",
    xTitre: "temps", xUnite: "ms", yTitre: "v_s / E", yUnite: "",
    xMin: 0, xMax: 20, yMin: -1.5, yMax: 1.5,
    echantillons: 3000,
    series: [
      { id: "v", nom: "v_s / E", couleur: "serie-1", epaisseur: 1.1 },
      { id: "f", nom: "fondamental", couleur: "serie-3", epaisseur: 2.8 },
    ],
  });
  if (sortie) ressources.push(sortie);

  const spectre = api.sim.spectre("#e-mli-spectre", {
    titre: "Spectre de v_s rapporté à E, amplitudes crêtes",
    xTitre: "rang h",
    yTitre: "V_h crête / E",
    unite: "",
    barres: [],
    yMax: 1.35,
  });
  if (spectre) ressources.push(spectre);

  function maj() {
    const { ma, mf, uni } = reglages;
    const ech = new Array(N);
    for (let k = 0; k < N; k += 1) ech[k] = mli((k + 0.5) / N, ma, mf, uni);
    const hMax = Math.min(3 * mf + 3, 130);
    const A = amplitudes(ech, hMax);
    /* phase du fondamental pour le tracé */
    let a1 = 0;
    let b1 = 0;
    for (let k = 0; k < N; k += 1) {
      const angle = (TAU * (k + 0.5)) / N;
      a1 += ech[k] * Math.cos(angle);
      b1 += ech[k] * Math.sin(angle);
    }
    a1 *= 2 / N;
    b1 *= 2 / N;
    let somme = 0;
    let premier = null;
    for (let h = 2; h <= hMax; h += 1) {
      somme += A[h] * A[h];
      if (premier === null && A[h] > 0.05) premier = h;
    }
    const rms = Math.sqrt(ech.reduce((s, x) => s + x * x, 0) / N);
    const thd = Math.sqrt(Math.max(0, rms * rms - (A[1] * A[1]) / 2)) / (A[1] / Math.SQRT2);

    if (comparaison) {
      comparaison.definirFonction("tri", (tms) => triangle((mf * tms) / 20));
      comparaison.definirFonction("ref", (tms) => ma * Math.sin((TAU * tms) / 20));
      comparaison.definirFonction("refb", (tms) => (uni ? -ma * Math.sin((TAU * tms) / 20) : NaN));
    }
    if (sortie) {
      sortie.definirFonction("v", (tms) => mli(tms / 20, ma, mf, uni));
      sortie.definirFonction("f", (tms) => a1 * Math.cos((TAU * tms) / 20) + b1 * Math.sin((TAU * tms) / 20));
      sortie.definirMesures([
        { nom: "Fondamental calculé", valeur: nb(api, A[1], 3) + " E crête" },
        { nom: "Valeur théorique m_a", valeur: nb(api, Math.min(ma, 99), 3) + (ma > 1 ? ", hors zone linéaire" : "") },
        { nom: "Taux de distorsion de v_s", valeur: A[1] > 1e-6 ? nb(api, thd * 100, 0) + " %" : "indéfini" },
        { nom: "Première raie supérieure à 5 %", valeur: premier ? "rang " + premier : "aucune jusqu'au rang " + hMax },
      ]);
    }
    if (spectre) {
      const marques = new Set([1, mf, 2 * mf, 3 * mf]);
      const barres = [];
      for (let h = 1; h <= hMax; h += 1) barres.push({ etiquette: marques.has(h) ? String(h) : " ", valeur: A[h] });
      spectre.definirBarres(barres);
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-mli-curseurs",
    [
      { id: "ma", libelle: "Indice de modulation m_a", min: 0.1, max: 1.4, pas: 0.01, valeur: reglages.ma, format: (x) => nb(api, x, 2) },
      { id: "mf", libelle: "Indice de fréquence m_f", min: 5, max: 41, pas: 1, valeur: reglages.mf, format: (x) => String(Math.round(x)) },
      { id: "mode", libelle: "Modulation : 1 bipolaire, 2 unipolaire", min: 1, max: 2, pas: 1, valeur: 1, format: (x) => (Math.round(x) === 2 ? "unipolaire" : "bipolaire") },
    ],
    (lues) => {
      reglages.ma = lues.ma;
      reglages.mf = Math.round(lues.mf);
      reglages.uni = Math.round(lues.mode) === 2;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   E. Filtre de sortie LC
   -------------------------------------------------------------------------- */

function construireFiltre(racine, api) {
  if (!racine.querySelector("#e-filtre-bode")) return;
  const reglages = { L: 1e-3, C: 10e-6, fd: 16000, charge: 100 };
  const E = 400;

  function H(f) {
    const w = TAU * f;
    const R = reglages.charge > 0 ? (230 * 230) / (1600 * reglages.charge / 100) : Infinity;
    const re = 1 - w * w * reglages.L * reglages.C;
    const im = Number.isFinite(R) ? (w * reglages.L) / R : 0;
    const d = re * re + im * im;
    return { re: re / d, im: -im / d };
  }

  const bode = api.sim.bode("#e-filtre-bode", {
    titre: "Filtre LC chargé : gain et phase",
    fMin: 10,
    fMax: 100000,
    fonction: H,
    coupure: 1592,
    libelleCoupure: "f0",
    gainMin: -90,
    gainMax: 40,
  });
  if (bode) ressources.push(bode);

  function maj() {
    const { L, C, fd, charge } = reglages;
    const f0 = 1 / (TAU * Math.sqrt(L * C));
    const Z0 = Math.sqrt(L / C);
    const R = charge > 0 ? (230 * 230) / (1600 * charge / 100) : Infinity;
    const h2 = H(2 * fd);
    const att = 20 * Math.log10(Math.hypot(h2.re, h2.im));
    if (bode) {
      bode.definirFonction(H);
      bode.definirCoupure(f0);
      bode.definirMesures([
        { nom: "f0 et rang", valeur: nb(api, f0, 0) + " Hz, rang " + nb(api, f0 / 50, 1) },
        { nom: "Z0", valeur: nb(api, Z0, 2) + " Ω" },
        { nom: "Facteur de qualité R / Z0", valeur: Number.isFinite(R) ? nb(api, R / Z0, 2) : "infini, à vide" },
        { nom: "Atténuation à 2 f_d", valeur: nb(api, att, 1) + " dB" },
        { nom: "Ondulation maximale, unipolaire", valeur: nb(api, E / (8 * L * fd), 2) + " A" },
        { nom: "Courant réactif de C à 50 Hz", valeur: nb(api, 230 * TAU * 50 * C, 2) + " A" },
      ]);
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-filtre-curseurs",
    [
      { id: "L", libelle: "Inductance L_f", min: 0.2, max: 3, pas: 0.05, valeur: 1, unite: "mH" },
      { id: "C", libelle: "Capacité C_f", min: 1, max: 40, pas: 0.5, valeur: 10, unite: "µF" },
      { id: "fd", libelle: "Fréquence de découpage f_d", min: 4, max: 40, pas: 0.5, valeur: 16, unite: "kHz" },
      { id: "charge", libelle: "Charge, en % de 1,6 kW", min: 0, max: 150, pas: 5, valeur: 100, unite: "%" },
    ],
    (lues) => {
      reglages.L = lues.L / 1000;
      reglages.C = lues.C * 1e-6;
      reglages.fd = lues.fd * 1000;
      reglages.charge = lues.charge;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   E. Puissance pulsée et condensateur du bus
   -------------------------------------------------------------------------- */

function construireBus(racine, api) {
  if (!racine.querySelector("#e-bus-puissance")) return;
  const reglages = { S: 2000, fp: 0.8, C: 1e-3 };
  const E = 400;
  const w = TAU * 50;

  const puissance = api.sim.traceur("#e-bus-puissance", {
    titre: "Puissance instantanée de la charge",
    xTitre: "temps", xUnite: "ms", yTitre: "puissance", yUnite: "kW",
    xMin: 0, xMax: 40, yMin: -2, yMax: 5,
    series: [
      { id: "p", nom: "p(t)", couleur: "serie-1", epaisseur: 2.6 },
      { id: "P", nom: "P, valeur moyenne", couleur: "serie-6", epaisseur: 1.4 },
    ],
  });
  if (puissance) ressources.push(puissance);

  const tension = api.sim.traceur("#e-bus-tension", {
    titre: "Tension du bus alimenté à puissance constante",
    xTitre: "temps", xUnite: "ms", yTitre: "v_E", yUnite: "V",
    xMin: 0, xMax: 40, yMin: 360, yMax: 440,
    series: [{ id: "v", nom: "v_E(t)", couleur: "serie-3", epaisseur: 2.6 }],
  });
  if (tension) ressources.push(tension);

  function maj() {
    const { S, fp, C } = reglages;
    const phi = Math.acos(fp);
    const P = S * fp;
    const dV = S / (w * C * E);
    if (puissance) {
      const haut = (P + S) / 1000;
      const bas = (P - S) / 1000;
      puissance.definirPlage({ yMin: Math.min(-0.5, bas * 1.15), yMax: haut * 1.15 });
      puissance.definirFonction("p", (tms) => (P - S * Math.cos(2 * w * tms / 1000 - phi)) / 1000);
      puissance.definirFonction("P", () => P / 1000);
      puissance.definirMesures([
        { nom: "Puissance active P", valeur: nb(api, P / 1000, 2) + " kW" },
        { nom: "Amplitude de la pulsation", valeur: nb(api, S / 1000, 2) + " kVA" },
        { nom: "Courant à 100 Hz dans C", valeur: nb(api, S / (E * Math.SQRT2), 2) + " A eff" },
      ]);
    }
    if (tension) {
      const marge = Math.max(10, dV * 0.9);
      tension.definirPlage({ yMin: E - marge, yMax: E + marge });
      tension.definirFonction("v", (tms) => E + (S / (2 * w * C * E)) * Math.sin(2 * w * tms / 1000 - phi));
      tension.definirMesures([
        { nom: "Ondulation crête à crête", valeur: nb(api, dV, 1) + " V" },
        { nom: "En pour cent de E", valeur: nb(api, (dV / E) * 100, 1) + " %" },
      ]);
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-bus-curseurs",
    [
      { id: "S", libelle: "Puissance apparente S", min: 0.5, max: 4, pas: 0.1, valeur: 2, unite: "kVA" },
      { id: "fp", libelle: "Facteur de puissance", min: 0.3, max: 1, pas: 0.01, valeur: 0.8, format: (x) => nb(api, x, 2) },
      { id: "C", libelle: "Capacité du bus", min: 0.2, max: 3, pas: 0.05, valeur: 1, unite: "mF" },
    ],
    (lues) => {
      reglages.S = lues.S * 1000;
      reglages.fp = lues.fp;
      reglages.C = lues.C / 1000;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   I. Diagramme de Fresnel des courants de l'étage de sortie
   -------------------------------------------------------------------------- */

function construireFresnel(racine, api) {
  if (!racine.querySelector("#i-fresnel")) return;
  const reglages = { charge: 100, fp: 0.8 };
  const L = 1e-3;
  const C = 10e-6;
  const w = TAU * 50;
  const Ic = 230 * w * C;

  const fresnel = api.sim.fresnel("#i-fresnel", {
    titre: "Courants de l'étage de sortie, V_o en origine des phases",
    rotation: false,
    vecteurs: [
      { id: "io", nom: "I_o", amplitude: 8.7, phase: -36.87, unite: "A", couleur: "serie-1" },
      { id: "ic", nom: "I_C", amplitude: Ic, phase: 90, unite: "A", couleur: "serie-4" },
    ],
    somme: true,
    nomSomme: "I_L",
  });
  if (fresnel) ressources.push(fresnel);

  function maj() {
    const Io = (2000 * reglages.charge) / 100 / 230;
    const phi = Math.acos(reglages.fp);
    const re = Io * Math.cos(-phi);
    const im = Io * Math.sin(-phi) + Ic;
    const IL = Math.hypot(re, im);
    const angle = (Math.atan2(im, re) * 180) / Math.PI;
    const vpRe = 230 - w * L * im;
    const vpIm = w * L * re;
    const Vp = Math.hypot(vpRe, vpIm);
    if (fresnel) {
      fresnel.definirVecteur("io", { amplitude: Io, phase: (-phi * 180) / Math.PI });
      fresnel.definirVecteur("ic", { amplitude: Ic, phase: 90 });
      fresnel.definirMesures([
        { nom: "Courant du pont I_L", valeur: nb(api, IL, 2) + " A, " + nb(api, angle, 1) + "°" },
        { nom: "Tension du pont V_p", valeur: nb(api, Vp, 1) + " V" },
        { nom: "m_a à 400 V et à 360 V", valeur: nb(api, (Vp * Math.SQRT2) / 400, 3) + " et " + nb(api, (Vp * Math.SQRT2) / 360, 3) },
      ]);
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-fresnel-curseurs",
    [
      { id: "charge", libelle: "Charge, en % de 2 kVA", min: 0, max: 120, pas: 5, valeur: 100, unite: "%" },
      { id: "fp", libelle: "Facteur de puissance des charges, inductif", min: 0.5, max: 1, pas: 0.01, valeur: 0.8, format: (x) => nb(api, x, 2) },
    ],
    (lues) => {
      reglages.charge = lues.charge;
      reglages.fp = lues.fp;
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
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-demi-pont",
      titre: "Fondamental d'un demi-pont en pleine onde",
      niveau: "fondamental",
      enonce: "<p>Un demi-pont est alimenté par un bus de $600\\ \\mathrm{V}$ partagé par deux condensateurs égaux. Il est commandé en pleine onde à $50\\ \\mathrm{Hz}$. Quelle est la valeur efficace du fondamental de la tension appliquée à la charge, en volts ?</p>",
      valeur: (4 * 300) / (Math.PI * Math.SQRT2),
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Fondamental efficace $V_1$",
      etapes: [
        { texte: "Le demi-pont applique $\\pm E/2 = \\pm 300\\ \\mathrm{V}$ à la charge : c'est un carré d'amplitude $A = 300\\ \\mathrm{V}$." },
        { texte: "Fondamental crête : $\\hat{V}_1 = 4A/\\pi = 1200/\\pi = 382{,}0\\ \\mathrm{V}$." },
        { texte: "Valeur efficace : $V_1 = 382{,}0/\\sqrt{2} = 270{,}1\\ \\mathrm{V}$, soit $0{,}45E$.", note: "Contrôle : un pont complet sur le même bus donnerait le double, $540{,}2\\ \\mathrm{V}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension du demi-pont et son fondamental",
          xTitre: "temps", xUnite: "ms", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 40, yMin: -450, yMax: 450,
          series: [
            { id: "v", nom: "v_AO, carré ±300 V", couleur: "serie-1", epaisseur: 1.8, fonction: (t) => (((t % 20) + 20) % 20 < 10 ? 300 : -300) },
            { id: "f", nom: "fondamental, 382 V crête", couleur: "serie-3", epaisseur: 2.6, fonction: (t) => (1200 / Math.PI) * Math.sin((TAU * t) / 20) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 1200 / Math.PI, "382 V crête, 270,1 V eff");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-mli-bipolaire",
      titre: "Tension fondamentale en modulation bipolaire",
      niveau: "fondamental",
      enonce: "<p>Un pont complet alimenté sous $350\\ \\mathrm{V}$ est commandé en modulation sinusoïdale bipolaire avec $m_a = 0{,}9$. Quelle est la valeur efficace du fondamental de $v_s$, en volts ?</p>",
      valeur: (0.9 * 350) / Math.SQRT2,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Fondamental efficace $V_1$",
      etapes: [
        { texte: "Zone linéaire, $m_a \\le 1$ : la moyenne glissante vaut $m_aE\\sin\\omega t$, donc $\\hat{V}_1 = m_aE$." },
        { texte: "$\\hat{V}_1 = 0{,}9 \\times 350 = 315\\ \\mathrm{V}$ crête." },
        { texte: "$V_1 = 315/\\sqrt{2} = 222{,}7\\ \\mathrm{V}$ efficaces.", note: "Erreur classique : répondre $315\\ \\mathrm{V}$, c'est-à-dire confondre crête et efficace." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["zone linéaire : m_a = 0,9 ≤ 1", "V1 crête = m_a E = 0,9 × 350 = 315 V", "V1 eff = 315 / √2 = 222,7 V", "maximum linéaire (m_a = 1) : 247,5 V eff"], "Modulation bipolaire : le fondamental suit m_a.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-decale-rang5",
      titre: "Commande décalée sans harmonique 5",
      niveau: "intermédiaire",
      enonce: "<p>Un pont complet sous $300\\ \\mathrm{V}$ est commandé en commande décalée. On choisit la demi-largeur $\\alpha$ des paliers nuls pour supprimer l'harmonique de rang 5. Quelle est alors la valeur efficace du fondamental, en volts ?</p>",
      valeur: ((4 * 300) / (Math.PI * Math.SQRT2)) * Math.cos(Math.PI / 10),
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Fondamental efficace $V_1$",
      etapes: [
        { texte: "$V_h = \\dfrac{2\\sqrt{2}E}{h\\pi}\\cos h\\alpha$ : le rang 5 disparaît si $5\\alpha = 90^\\circ$, soit $\\alpha = 18^\\circ$." },
        { texte: "Fondamental : $V_1 = 0{,}9003 \\times 300 \\times \\cos 18^\\circ = 270{,}1 \\times 0{,}9511 = 256{,}9\\ \\mathrm{V}$." },
        { texte: "Harmoniques restants : $V_3 = 90{,}0 \\times \\cos 54^\\circ = 52{,}9\\ \\mathrm{V}$, $V_7 = 38{,}6 \\times |\\cos 126^\\circ| = 22{,}7\\ \\mathrm{V}$.", note: "On ne choisit qu'un angle, donc on n'élimine qu'un rang ; plusieurs angles par quart de période permettraient d'en éliminer plusieurs." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Onde quasi carrée à α = 18 degrés",
          xTitre: "angle", xUnite: "degrés", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 360, yMin: -450, yMax: 450,
          series: [
            { id: "v", nom: "v_s, paliers nuls de 18 degrés", couleur: "serie-1", epaisseur: 1.8, fonction: (d) => 300 * decale(d / 360, 18) },
            { id: "f", nom: "fondamental, 256,9 V eff", couleur: "serie-3", epaisseur: 2.6, fonction: (d) => (1200 / Math.PI) * Math.cos(Math.PI / 10) * Math.sin((d * Math.PI) / 180) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneV(c, r, couleurs, 18, "α = 18°");
            ligneV(c, r, couleurs, 162, "180° - α");
          },
        });
      },
    })
  );

  const Ck4 = 1 / (Math.pow(TAU * 2000, 2) * 1.5e-3);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-filtre",
      titre: "Choix du condensateur d'un filtre de sortie",
      niveau: "intermédiaire",
      enonce: "<p>Un onduleur monophasé en modulation unipolaire découpe à $f_d = 10\\ \\mathrm{kHz}$. Son inductance de filtre vaut $1{,}5\\ \\mathrm{mH}$. On veut placer la fréquence propre du filtre une décade sous la première raie de découpage. Quelle capacité faut-il, en microfarads ?</p>",
      valeur: Ck4 * 1e6,
      unite: "µF",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Capacité $C_f$",
      etapes: [
        { texte: "En unipolaire, la première raie est en $2f_d = 20\\ \\mathrm{kHz}$ ; une décade en dessous : $f_0 = 2\\ \\mathrm{kHz}$." },
        { texte: "$C_f = \\dfrac{1}{(2\\pi f_0)^2L_f} = \\dfrac{1}{(12\\,566)^2 \\times 1{,}5 \\times 10^{-3}} = 4{,}22\\ \\mathrm{\\mu F}$." },
        { texte: "Atténuation à $20\\ \\mathrm{kHz}$ : $1/((20/2)^2 - 1) = 1/99$, soit $-39{,}9\\ \\mathrm{dB}$ ; courant réactif à $50\\ \\mathrm{Hz}$ sous $230\\ \\mathrm{V}$ : $0{,}30\\ \\mathrm{A}$.", note: "Si l'on avait pris $f_d$ au lieu de $2f_d$, on aurait surdimensionné le condensateur d'un facteur 4." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["première raie : 2 f_d = 20 kHz", "f0 = 20 kHz / 10 = 2 kHz", "C = 1 / ((2π × 2000)² × 1,5 mH) = 4,22 µF", "atténuation à 20 kHz : 1/99, soit -39,9 dB"], "Placement de la fréquence propre du filtre.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );

  const Ck5 = 5000 / (TAU * 50 * 380 * 10);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-bus",
      titre: "Condensateur du bus d'un onduleur monophasé",
      niveau: "avancé",
      enonce: "<p>Un onduleur photovoltaïque monophasé injecte $5\\ \\mathrm{kVA}$ dans le réseau à $50\\ \\mathrm{Hz}$. Son bus est régulé à $380\\ \\mathrm{V}$ par l'étage élévateur, qui prélève une puissance constante sur les panneaux. L'ondulation du bus doit rester inférieure à $10\\ \\mathrm{V}$ crête à crête pour ne pas perturber la recherche du point de puissance maximale. Quelle capacité minimale faut-il, en millifarads ?</p>",
      valeur: Ck5 * 1000,
      unite: "mF",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Capacité minimale $C$",
      etapes: [
        { texte: "La puissance injectée pulse : $p(t) = P - S\\cos(2\\omega t - \\varphi)$ ; l'étage élévateur fournit $P$ constant, le condensateur absorbe le terme à $100\\ \\mathrm{Hz}$." },
        { texte: "$CE\\,\\mathrm{d}v/\\mathrm{d}t = S\\cos(2\\omega t - \\varphi)$ donne $\\Delta V_{cc} = S/(\\omega CE)$." },
        { texte: "$C = \\dfrac{S}{\\omega E\\,\\Delta V} = \\dfrac{5000}{314{,}16 \\times 380 \\times 10} = 4{,}19\\ \\mathrm{mF}$." },
        { texte: "Courant efficace à $100\\ \\mathrm{Hz}$ dans les condensateurs : $S/(E\\sqrt{2}) = 9{,}30\\ \\mathrm{A}$, qui fixe le nombre de condensateurs en parallèle autant que la capacité.", note: "C'est cette contrainte qui pousse à remplacer les condensateurs électrolytiques par des condensateurs à film, ou à ajouter un étage de découplage actif de puissance." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const C = Ck5;
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension du bus avec 4,19 mF",
          xTitre: "temps", xUnite: "ms", yTitre: "v_E", yUnite: "V",
          xMin: 0, xMax: 40, yMin: 370, yMax: 390,
          series: [{ id: "v", nom: "v_E(t)", couleur: "serie-3", epaisseur: 2.6, fonction: (t) => 380 + (5000 / (2 * TAU * 50 * C * 380)) * Math.sin(2 * TAU * 50 * t / 1000) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 385, "385 V");
            ligneH(c, r, couleurs, 375, "375 V : 10 V crête à crête");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-diagnostic",
      titre: "Diagnostic : une ASI qui déforme sa tension à faible charge",
      niveau: "diagnostic",
      enonce: "<p>Après remplacement de sa carte de commande, une ASI monophasée ($400\\ \\mathrm{V}$ de bus, $20\\ \\mathrm{kHz}$, modulation unipolaire) délivre une tension dont la forme présente un méplat net à chaque passage par zéro du courant de sortie. La distorsion, faite surtout des rangs 3, 5 et 7, est plus visible à faible charge ; la tension du bus est stable et son ondulation normale ; la tension efficace de sortie est un peu basse en charge. Le paramètre de temps mort de la nouvelle carte est réglé à $3\\ \\mu\\mathrm{s}$ et sa compensation est désactivée. Quelles conclusions sont justifiées ?</p>",
      options: [
        { texte: "La cause la plus probable est le temps mort non compensé : $2t_mf_dE = 48\\ \\mathrm{V}$ d'erreur moyenne, de signe opposé au courant.", juste: true },
        { texte: "Le filtre $LC$ entre en résonance : il faut augmenter sa capacité." },
        { texte: "Il faut réactiver la compensation du temps mort et vérifier la valeur minimale de temps mort exigée par les modules.", juste: true },
        { texte: "L'indice de modulation dépasse 1 : il faut augmenter la tension du bus." },
      ],
      etapes: [
        { texte: "Le méplat suit le passage par zéro du courant, pas celui de la tension : c'est la signature du temps mort, dont l'erreur change de signe avec le courant." },
        { texte: "Ordre de grandeur : $2 \\times 3 \\times 10^{-6} \\times 20\\,000 \\times 400 = 48\\ \\mathrm{V}$ moyens, soit un fondamental d'erreur d'environ $\\frac{4}{\\pi} \\times 48/\\sqrt{2} = 43\\ \\mathrm{V}$ efficaces, en phase avec le courant : la tension baisse en charge." },
        { texte: "À faible charge, le courant passe lentement par zéro et oscille autour : la zone déformée s'élargit, d'où la distorsion plus visible." },
        { texte: "Une résonance donnerait une oscillation vers $f_0$ après les variations de charge ; une surmodulation aplatirait les crêtes, surtout au bus bas : aucun de ces symptômes n'est décrit.", note: "Action : réactiver la compensation, ramener le temps mort au minimum permis par la documentation des modules, puis vérifier le taux de distorsion à vide et en charge." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const phi = (30 * Math.PI) / 180;
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension moyenne avec un temps mort non compensé",
          xTitre: "angle", xUnite: "degrés", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 360, yMin: -420, yMax: 420,
          series: [
            { id: "id", nom: "tension idéale", couleur: "serie-6", epaisseur: 1.6, fonction: (d) => 325 * Math.sin((d * Math.PI) / 180) },
            { id: "re", nom: "tension avec 48 V d'erreur", couleur: "serie-1", epaisseur: 2.6, fonction: (d) => 325 * Math.sin((d * Math.PI) / 180) - 48 * Math.sign(Math.sin((d * Math.PI) / 180 - phi)) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneV(c, r, couleurs, 30, "i passe par 0");
            ligneV(c, r, couleurs, 210, "i passe par 0");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-diodes",
      titre: "Rôle des diodes en antiparallèle",
      niveau: "conceptuel",
      enonce: "<p>Sans calcul : pourquoi chaque transistor d'un onduleur de tension qui alimente une charge inductive doit-il être muni d'une diode en antiparallèle ? Que se passerait-il sans elle ?</p>",
      motsCles: [["courant"], ["retard", "dephas", "inductive", "inductance"], ["signe", "inverse", "oppose", "sens"], ["energie", "bus", "renvoi", "restitu", "revient"], ["surtension", "coupure", "interromp"]],
      minimum: 3,
      exemple: "Trois ou quatre phrases : reliez le retard du courant, le signe du courant au moment de la commutation et l'énergie de l'inductance.",
      etapes: [
        { texte: "Le courant d'une charge inductive est en retard sur la tension : juste après chaque inversion de $v_s$, il garde son ancien signe." },
        { texte: "Le transistor commandé ne conduit que dans un sens ; c'est la diode du même interrupteur qui porte ce courant de signe opposé, en le renvoyant vers le bus." },
        { texte: "La tension reste ainsi imposée par la commande quel que soit le signe du courant : le bras est réversible en courant et l'énergie de l'inductance revient au condensateur du bus." },
        { texte: "Sans diode, ouvrir un transistor parcouru par un courant inductif imposerait $L\\,\\mathrm{d}i/\\mathrm{d}t$ très grand : surtension et destruction, comme la coupure d'une bobine sans roue libre.", note: "Les MOSFET possèdent une diode intrinsèque qui peut jouer ce rôle ; les IGBT exigent une diode ajoutée dans le module." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const dessin = dessinPont(["T1", "T4"], "fl-k7") +
          '<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="7" opacity="0.5" style="stroke: var(--serie-2)"><polyline points="' + chaine(MAILLES.D1D4) + '"/></g>';
        schemaCorrection(moteurApi, conteneur, "0 0 360 300", dessin, "Juste après l'inversion de v_s, T1 et T4 sont commandés mais le courant, encore négatif, passe par D1 et D4 et renvoie de l'énergie au bus : maille surlignée en trait épais translucide.");
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

const ZONES_PONT = [
  { x: 94, y: 58, largeur: 34, hauteur: 64, etiquette: "T1" },
  { x: 134, y: 76, largeur: 32, hauteur: 38, etiquette: "D1", juste: true },
  { x: 94, y: 188, largeur: 34, hauteur: 64, etiquette: "T2" },
  { x: 134, y: 196, largeur: 32, hauteur: 38, etiquette: "D2" },
  { x: 254, y: 58, largeur: 34, hauteur: 64, etiquette: "T3" },
  { x: 294, y: 76, largeur: 32, hauteur: 38, etiquette: "D3" },
  { x: 254, y: 188, largeur: 34, hauteur: 64, etiquette: "T4" },
  { x: 294, y: 196, largeur: 32, hauteur: 38, etiquette: "D4", juste: true },
];

const VISUELS_QUIZ = [
  etapes(["carré ±E : b1 = 4E / π", "= 1,273 E crête", "soit 0,900 E efficaces"], "Fondamental de la pleine onde."),
  etapes(["chaque bras commute à f_d", "les raies autour de m_f s'annulent entre les bras", "première raie en 2 m_f ± 1"], "Modulation unipolaire."),
  etapes(["V1 crête = m_a E = 0,7 × 500 = 350 V", "V1 eff = 350 / √2", "= 247,5 V"], "Zone linéaire de la modulation."),
  etapes(["m_a > 1 : d sature à 0 ou 1 près des crêtes", "le fondamental croît moins vite que m_a", "rangs 3, 5, 7 réapparaissent"], "Surmodulation."),
  etapes(["LC = 2 mH × 5 µF = 10⁻⁸ s²", "f0 = 1 / (2π × 10⁻⁴ s)", "= 1592 Hz"], "Fréquence propre."),
  () => ({
    viewBox: "0 0 360 300",
    dessin: dessinPont(["T1", "T4"], "fl-q6") + '<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="7" opacity="0.5" style="stroke: var(--serie-2)"><polyline points="' + chaine(MAILLES.D1D4) + '"/></g>',
    legende: "v_s > 0 et i_s < 0 : le courant remonte par D1 et D4 vers le bus, maille surlignée.",
  }),
  etapes(["demi-pont : carré ±E/2, V1 = 0,45 E", "pont complet : carré ±E, V1 = 0,90 E", "rapport 2"], "Demi-pont et pont complet."),
  etapes(["V_h proportionnel à cos(h α)", "h = 3 : 3 α = 90°", "α = 30°"], "Élimination du rang 3."),
  etapes(["ΔV = 2 t_m f_d E", "= 2 × 2 µs × 10 kHz × 400 V", "= 16 V"], "Erreur de temps mort."),
  etapes(["p(t) = P - S cos(2ωt - φ)", "terme à 2 f = 100 Hz d'amplitude S", "absorbé par le condensateur du bus"], "Puissance pulsée."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Quelle est l'amplitude crête du fondamental d'un pont complet commandé en pleine onde sur un bus $E$ ?</p>",
        options: ["$E$", "$4E/\\pi$", "$E/\\sqrt{2}$", "$2E/\\pi$"],
        bonnes: [1],
        explication: "$v_s$ est un carré $\\pm E$, dont le fondamental vaut $4E/\\pi \\approx 1{,}27E$ crête ; $2E/\\pi$ est celui du demi-pont.",
        resume: "Fondamental de la pleine onde",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>À fréquence de commutation des interrupteurs égale, la modulation unipolaire place la première raie harmonique à une fréquence double de celle de la modulation bipolaire.</p>",
        reponse: true,
        explication: "En unipolaire, les raies autour de $m_f$ s'annulent entre les deux bras ; la première apparaît en $2m_f \\pm 1$.",
        resume: "Unipolaire et fréquence apparente",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Pont complet, bus de $500\\ \\mathrm{V}$, modulation sinusoïdale avec $m_a = 0{,}7$. Fondamental efficace de $v_s$, en volts ?</p>",
        valeur: (0.7 * 500) / Math.SQRT2,
        unite: "V",
        tolerance: 0.02,
        explication: "$V_1 = m_aE/\\sqrt{2} = 350/\\sqrt{2} = 247{,}5\\ \\mathrm{V}$.",
        resume: "Fondamental en modulation",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Que se passe-t-il quand l'indice de modulation dépasse 1 ?</p>",
        motsCles: [["satur", "bloque", "sort"], ["harmonique", "rang", "distor", "deform"], ["lineaire", "proportion", "moins vite"]],
        minimum: 2,
        explication: "Le rapport cyclique demandé sort de $[0, 1]$ et sature près des crêtes : la relation $\\hat{V}_1 = m_aE$ cesse d'être linéaire et des harmoniques de rang faible réapparaissent.",
        resume: "Surmodulation",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Fréquence propre d'un filtre de sortie de $2\\ \\mathrm{mH}$ et $5\\ \\mathrm{\\mu F}$, en hertz ?</p>",
        valeur: 1 / (TAU * Math.sqrt(2e-3 * 5e-6)),
        unite: "Hz",
        tolerance: 0.02,
        explication: "$f_0 = 1/(2\\pi\\sqrt{10^{-8}}) = 1592\\ \\mathrm{Hz}$.",
        resume: "Fréquence propre",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Les interrupteurs $T_1$ et $T_4$ sont commandés, donc $v_s = +E$, mais le courant $i_s$ est encore négatif. Quels composants conduisent ?</p>",
        consigne: "Cliquez sur les deux composants passants.",
        viewBox: "0 0 360 300",
        dessin: dessinPont(["T1", "T4"], "fl-qz"),
        zones: ZONES_PONT,
        explication: "Le courant, négatif, va de $B$ vers $A$ dans la charge : il ne peut pas traverser $T_1$ et $T_4$ à l'envers, il passe par $D_1$ et $D_4$ et renvoie de l'énergie au bus.",
        resume: "Composants passants",
      },
      {
        type: "vraiFaux",
        enonce: repere(6) + "<p>Pour la même tension de bus, un demi-pont en pleine onde fournit le même fondamental qu'un pont complet en pleine onde.</p>",
        reponse: false,
        explication: "Le demi-pont applique $\\pm E/2$, le pont complet $\\pm E$ : le fondamental du demi-pont est deux fois plus petit.",
        resume: "Demi-pont et pont complet",
      },
      {
        type: "qcm",
        enonce: repere(7) + "<p>En commande décalée, quelle demi-largeur des paliers nuls supprime l'harmonique de rang 3 ?</p>",
        options: ["$18$ degrés", "$30$ degrés", "$45$ degrés", "$60$ degrés"],
        bonnes: [1],
        explication: "$V_3 \\propto \\cos 3\\alpha$ s'annule pour $3\\alpha = 90^\\circ$, soit $\\alpha = 30^\\circ$.",
        resume: "Élimination du rang 3",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Temps mort de $2\\ \\mu\\mathrm{s}$, découpage à $10\\ \\mathrm{kHz}$, bus de $400\\ \\mathrm{V}$. Erreur moyenne de tension d'un pont complet, en volts ?</p>",
        valeur: 16,
        unite: "V",
        tolerance: 0.02,
        explication: "$\\Delta V = 2t_mf_dE = 2 \\times 2 \\times 10^{-6} \\times 10^4 \\times 400 = 16\\ \\mathrm{V}$, de signe opposé au courant.",
        resume: "Erreur de temps mort",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Pourquoi le bus d'un onduleur monophasé ondule-t-il à $100\\ \\mathrm{Hz}$, même alimenté par une batterie ?</p>",
        options: [
          "Parce que le redresseur d'entrée est monophasé",
          "Parce que la puissance instantanée d'une charge monophasée pulse à deux fois la fréquence de sortie",
          "À cause du temps mort",
          "À cause de la fréquence de découpage",
        ],
        bonnes: [1],
        explication: "$p(t) = P - S\\cos(2\\omega t - \\varphi)$ : le terme à $2f$, d'amplitude $S$, est fourni par le condensateur du bus, même si la source est parfaitement continue.",
        resume: "Ondulation du bus",
      },
    ],
    { titre: "Dix questions de fin de séance" }
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
      { categorie: "Physique", question: "Pourquoi une diode en antiparallèle sur chaque interrupteur ?", reponse: "Pour porter le courant de la charge quand il est de signe opposé à celui que permet le transistor : le bras impose sa tension quel que soit le signe du courant, et l'énergie inductive revient au bus." },
      { categorie: "Règle", question: "Que se passe-t-il si les deux interrupteurs d'un bras conduisent ensemble ?", reponse: "Le bus est court-circuité : courant destructeur. Le temps mort l'empêche, au prix d'une erreur de tension de $2t_mf_dE$ pour un pont." },
      { categorie: "Commande", question: "Quel rapport cyclique local en modulation bipolaire ?", reponse: "$d = \\frac{1}{2}(1 + m_a\\sin\\omega t)$, ce qui donne une moyenne glissante $(2d - 1)E = m_aE\\sin\\omega t$." },
      { categorie: "Formule", question: "Fondamental efficace en pleine onde ?", reponse: "$0{,}900E$ pour un pont complet, $0{,}450E$ pour un demi-pont ; harmoniques impairs en $V_1/h$." },
      { categorie: "Formule", question: "Harmoniques de la commande décalée ?", reponse: "$V_h = \\dfrac{2\\sqrt{2}E}{h\\pi}\\cos h\\alpha$ ; le rang $h$ disparaît pour $\\alpha = 90^\\circ/h$." },
      { categorie: "Définition", question: "Que sont $m_a$ et $m_f$ ?", reponse: "$m_a$ : rapport des amplitudes de la référence et de la porteuse ; $m_f = f_d/f$. Zone linéaire : $\\hat{V}_1 = m_aE$ pour $m_a \\le 1$." },
      { categorie: "Spectre", question: "Où sont les harmoniques en modulation bipolaire et unipolaire ?", reponse: "Autour de $m_f$, $2m_f$, $3m_f$ en bipolaire ; à partir de $2m_f \\pm 1$ en unipolaire. Rien de notable aux rangs faibles tant que $m_a \\le 1$." },
      { categorie: "Dimensionnement", question: "Ondulation maximale du courant de sortie ?", reponse: "$E/(2Lf_d)$ en bipolaire, atteinte à $v = 0$ ; $E/(8Lf_d)$ en unipolaire, atteinte à $v = E/2$." },
      { categorie: "Filtre", question: "Où placer la fréquence propre du filtre $LC$ ?", reponse: "À au moins une décade de la fréquence de sortie et de la première raie de découpage, avec un amortissement, actif ou passif, pour le fonctionnement à vide." },
      { categorie: "Bus", question: "Ondulation du bus d'un onduleur monophasé ?", reponse: "$\\Delta V_{cc} = S/(\\omega CE)$, avec un courant à $2f$ de $S/(E\\sqrt{2})$ efficaces dans les condensateurs ; nulle en triphasé équilibré." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["V1 crête = 230 × √2 = 325,3 V", "m_a = 325,3 / 360", "= 0,904, encore linéaire"], "Indice de modulation au bus minimal."),
  etapes(["Δi max (unipolaire) = E / (8 L f_d)", "= 400 / (8 × 1 mH × 16 kHz)", "= 3,13 A"], "Ondulation du courant de filtre."),
  etapes(["p(t) = P - S cos(2ωt - φ)", "l'amplitude de la pulsation est S", "2 kvar ou 2 kW : même ondulation"], "La pulsation dépend de S, pas de P."),
  etapes(["½ C (V_max² - V_min²) = P t_d", "C = 2 × 150 × 0,01 / (40² - 30²)", "= 3 / 700 = 4,29 mF"], "Méthode énergétique."),
  etapes(["puissance constante : I = P / V", "V baisse donc I augmente", "la charge est à résistance incrémentale négative"], "Charge à puissance constante."),
  etapes(["P = V_F0 I_moy + r_F I_eff²", "= 0,85 × 20 + 0,005 × 35²", "= 17 + 6,1 = 23,1 W"], "Pertes d'une diode."),
  etapes(["Q = (1 / R) √(L / C)", "= (1 / 1) × √(10⁻³ / 10⁻⁵)", "= 10"], "Facteur de qualité d'un RLC série."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Une ASI doit produire $230\\ \\mathrm{V}$ efficaces quand son bus descend à $360\\ \\mathrm{V}$. Quel indice de modulation faut-il, chute dans le filtre négligée ?</p>",
        valeur: (230 * Math.SQRT2) / 360,
        unite: "",
        tolerance: 0.01,
        explication: "$m_a = 230\\sqrt{2}/360 = 325{,}3/360 = 0{,}904$ : la zone linéaire est tenue.",
        resume: "Indice de modulation",
      },
      {
        type: "calcul",
        enonce: repere(1) + "<p>Cette séance. Ondulation maximale crête à crête du courant d'un filtre de $1\\ \\mathrm{mH}$, en modulation unipolaire à $16\\ \\mathrm{kHz}$ sur un bus de $400\\ \\mathrm{V}$, en ampères ?</p>",
        valeur: 400 / (8 * 1e-3 * 16000),
        unite: "A",
        tolerance: 0.02,
        explication: "$\\Delta i = E/(8Lf_d) = 400/(8 \\times 10^{-3} \\times 16\\,000) = 3{,}13\\ \\mathrm{A}$.",
        resume: "Ondulation de courant",
      },
      {
        type: "vraiFaux",
        enonce: repere(2) + "<p>Cette séance. Une charge purement réactive de $2\\ \\mathrm{kvar}$ fait onduler le bus d'un onduleur monophasé autant qu'une charge résistive de $2\\ \\mathrm{kW}$.</p>",
        reponse: true,
        explication: "L'amplitude du terme à $2f$ de la puissance instantanée vaut $S$ dans les deux cas : $2\\ \\mathrm{kVA}$. Seule sa phase change.",
        resume: "Pulsation et puissance apparente",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Révision 7 et mini-projet alimentation. Un hacheur absorbe $150\\ \\mathrm{W}$ constants. Quelle capacité de bus maintient son entrée au-dessus de $30\\ \\mathrm{V}$ pendant $10\\ \\mathrm{ms}$ de coupure, si le bus part de $40\\ \\mathrm{V}$ ? Réponse en millifarads.</p>",
        valeur: ((2 * 150 * 0.01) / (40 * 40 - 30 * 30)) * 1000,
        unite: "mF",
        tolerance: 0.02,
        explication: "$\\frac{1}{2}C(V_{max}^2 - V_{min}^2) = Pt_d$ donne $C = 3/700 = 4{,}29\\ \\mathrm{mF}$.",
        resume: "Maintien par le bus",
      },
      {
        type: "vraiFaux",
        enonce: repere(4) + "<p>Cours Révision 7 et mini-projet alimentation. Quand la tension de son bus baisse, un hacheur régulé absorbe un courant plus faible.</p>",
        reponse: false,
        explication: "Il absorbe une puissance constante : $I = P/V$ augmente quand $V$ baisse. C'est une charge à résistance incrémentale négative.",
        resume: "Charge à puissance constante",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Diodes de puissance. Une diode de seuil $0{,}85\\ \\mathrm{V}$ et de résistance dynamique $5\\ \\mathrm{m\\Omega}$ conduit $20\\ \\mathrm{A}$ moyens et $35\\ \\mathrm{A}$ efficaces. Pertes de conduction, en watts ?</p>",
        valeur: 0.85 * 20 + 0.005 * 35 * 35,
        unite: "W",
        tolerance: 0.02,
        explication: "$P = V_{F0}I_{moy} + r_FI_{eff}^2 = 17 + 6{,}1 = 23{,}1\\ \\mathrm{W}$.",
        resume: "Pertes d'une diode",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Résonance série et parallèle. Facteur de qualité d'un circuit RLC série de $1\\ \\Omega$, $1\\ \\mathrm{mH}$ et $10\\ \\mathrm{\\mu F}$ ?</p>",
        valeur: 10,
        unite: "",
        tolerance: 0.02,
        explication: "$Q = \\frac{1}{R}\\sqrt{L/C} = \\sqrt{100} = 10$, à $f_0 = 1592\\ \\mathrm{Hz}$ : c'est le filtre de l'ASI, dont la faible résistance série explique le besoin d'amortissement.",
        resume: "Facteur de qualité",
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
  if (!racine.querySelector("#p-autoevaluation-grille")) return;
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur les onduleurs monophasés ?",
  });
  if (auto) ressources.push(auto);
}
