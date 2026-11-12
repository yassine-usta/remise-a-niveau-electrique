/* ==========================================================================
   cours/compatibilite-electromagnetique/cours.js
   Compatibilité électromagnétique : source, chemin et victime ; modes
   différentiel et commun ; spectre d'un front ; couplages par impédance
   commune, capacitif, inductif et rayonné ; courant de mode commun d'un
   variateur, blindage, masse et filtrage ; armoire de la pompe du projet
   fil rouge.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = 2 * Math.PI;
const MU0_2PI = 2e-7;

/* Hypothèses communes du cours (câble blindé et bus de la pompe). */
const CABLE = { Lp: 0.15e-6, Cp: 300e-12 };
const BUS = 540;

/* --------------------------------------------------------------------------
   Modèles physiques
   -------------------------------------------------------------------------- */

/** Crête non amortie du courant de mode commun : (ΔV/Z0) |sin x / x|, x = π f0 tr. */
function creteModeCommun(dV, L, C, tr) {
  const Z0 = Math.sqrt(L / C);
  const f0 = 1 / (TAU * Math.sqrt(L * C));
  const x = Math.PI * f0 * tr;
  const sinc = x < 1e-9 ? 1 : Math.sin(x) / x;
  return { Z0, f0, x, I: (dV / Z0) * Math.abs(sinc) };
}

/**
 * Boucle de mode commun d'un onduleur triphasé sur une période de découpage :
 * modulation sinus-triangle centrée (m = 0,8, angle 30 degrés), fronts en
 * rampe de durée tr, circuit L R C série intégré par Euler semi-implicite.
 * r : l (m), tr (ns), Lt (µH), fd (kHz), R (Ω), Cm (nF).
 */
function simulerModeCommun(r) {
  const E = BUS;
  const m = 0.8;
  const th = Math.PI / 6;
  const L = CABLE.Lp * r.l + r.Lt * 1e-6;
  const C = CABLE.Cp * r.l + r.Cm * 1e-9;
  const tr = r.tr * 1e-9;
  const T = 1 / (r.fd * 1000);
  const d = [0, 1, 2].map((k) => 0.5 + 0.5 * m * Math.cos(th - (TAU * k) / 3));
  const instants = [];
  for (const dk of d) instants.push(((1 - dk) * T) / 2, ((1 + dk) * T) / 2);

  function vmc(t) {
    let v = 0;
    for (const dk of d) {
      const t1 = ((1 - dk) * T) / 2;
      const t2 = ((1 + dk) * T) / 2;
      let u;
      if (t < t1) u = -E / 2;
      else if (t < t1 + tr) u = -E / 2 + (E * (t - t1)) / tr;
      else if (t < t2) u = E / 2;
      else if (t < t2 + tr) u = E / 2 - (E * (t - t2)) / tr;
      else u = -E / 2;
      v += u;
    }
    return v / 3;
  }

  const f0 = 1 / (TAU * Math.sqrt(L * C));
  const dt = Math.min(2e-9, tr / 10, 1 / (f0 * 80));
  const n = Math.ceil(T / dt);
  const parBin = Math.max(1, Math.floor(n / 600));
  const t0 = Math.min(...instants);
  const fen = Math.max(4 / f0, 6 * tr, 2e-6);
  const pasZoom = Math.max(1, Math.floor(fen / dt / 500));
  let i = 0;
  let vc = -E / 2;
  let s2 = 0;
  let pk = 0;
  let binMax = 0;
  let cpt = 0;
  const periode = [];
  const zoom = [];
  for (let k = 0; k < n; k += 1) {
    const t = k * dt;
    const v = vmc(t);
    i += ((v - r.R * i - vc) / L) * dt;
    vc += (i / C) * dt;
    s2 += i * i * dt;
    const a = Math.abs(i);
    if (a > pk) pk = a;
    if (a >= Math.abs(binMax)) binMax = i;
    cpt += 1;
    if (cpt >= parBin) {
      periode.push({ t, i: binMax, v });
      binMax = 0;
      cpt = 0;
    }
    if (t >= t0 - 0.1 * fen && t <= t0 + fen && k % pasZoom === 0) zoom.push({ t: t - t0, i, v });
  }
  const crete = creteModeCommun(E / 3, L, C, tr);
  return {
    L,
    C,
    Z0: crete.Z0,
    f0,
    Ipk: crete.I,
    pk,
    rms: Math.sqrt(s2 / T),
    P: (r.R * s2) / T,
    W: 0.5 * C * (E / 3) * (E / 3),
    T,
    periode,
    zoom,
    fen,
  };
}

/** Enveloppe du spectre d'un trapèze : 2 A d min(1, 1/(π n d)) min(1, 1/(π f tr)). */
function enveloppe(f, A, d, fd, tr) {
  const n = f / fd;
  const a = Math.min(1, 1 / (Math.PI * n * d));
  const b = tr > 0 ? Math.min(1, 1 / (Math.PI * f * tr)) : 1;
  return 2 * A * d * a * b;
}

/** Tension de la victime par couplage capacitif, rampe de durée tr puis décroissance. */
function tensionCapacitive(t, p) {
  const S = p.dV / p.tr;
  const tau = p.Rv * (p.Cc + p.Cv);
  const plateau = p.Rv * p.Cc * S;
  if (t <= 0) return 0;
  if (t <= p.tr) return plateau * (1 - Math.exp(-t / tau));
  return plateau * (1 - Math.exp(-p.tr / tau)) * Math.exp(-(t - p.tr) / tau);
}

/** Mutuelle par mètre entre un conducteur source à hs au-dessus d'un plan et une boucle victime. */
function mutuelleParMetre(x, y, hs, mode, s) {
  const rS = Math.hypot(x, y - hs);
  const rI = Math.hypot(x, y + hs);
  if (mode === 0) return MU0_2PI * Math.log(rI / rS);
  const y2 = y - s;
  const rS2 = Math.hypot(x, y2 - hs);
  const rI2 = Math.hypot(x, y2 + hs);
  return Math.abs(MU0_2PI * (Math.log(rS2 / rS) - Math.log(rI2 / rI)));
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

function fleche(x1, y1, x2, y2, id, attributs = "") {
  return '<path d="M' + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + x2.toFixed(1) + " " + y2.toFixed(1) + '" marker-end="url(#' + id + ')"' + attributs + "/>";
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";

function ligneH(c, repere, couleurs, y, libelle, motif = [7, 5]) {
  const py = repere.versY(y);
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

function ligneV(c, repere, couleurs, x, libelle, motif = [2, 4]) {
  const px = repere.versX(x);
  c.save();
  c.setLineDash(motif);
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

function pointRepere(c, repere, couleurs, x, y, libelle) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.fillStyle = couleurs.accent;
  c.beginPath();
  c.arc(px, py, 5, 0, TAU);
  c.fill();
  if (libelle) {
    c.font = POLICE;
    c.fillStyle = couleurs.texte;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.62;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -9 : 9), py - 9);
  }
  c.restore();
}

function traceCorrection(moteurApi, conteneur, options) {
  const traceur = moteurApi.sim.traceur(conteneur, { genre: "Correction visuelle", ratio: 0.42, echantillons: 500, ...options });
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

/** Boucle d'animation suspendue hors écran et arrêtée au nettoyage. */
function boucleAnimation(api, conteneur, pas) {
  if (api.mouvementReduit || typeof requestAnimationFrame !== "function") return;
  let visible = true;
  let id = 0;
  let dernier = 0;
  function image(instant) {
    id = 0;
    if (!visible) return;
    const ecoule = dernier ? Math.min(0.05, (instant - dernier) / 1000) : 0;
    dernier = instant;
    pas(ecoule);
    id = requestAnimationFrame(image);
  }
  if (typeof IntersectionObserver === "function") {
    const observateur = new IntersectionObserver((entrees) => {
      visible = entrees.some((e) => e.isIntersecting);
      if (visible && !id) {
        dernier = 0;
        id = requestAnimationFrame(image);
      }
    });
    observateur.observe(conteneur);
    nettoyeurs.push(() => observateur.disconnect());
  }
  id = requestAnimationFrame(image);
  nettoyeurs.push(() => {
    visible = false;
    if (id) cancelAnimationFrame(id);
    id = 0;
  });
}

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeurs = [];

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireModes(racine, api);
  construireSpectre(racine, api);
  construireCapacitif(racine, api);
  construireInductif(racine, api);
  construireModeCommun(racine, api);
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
    ["#d-chaine-figure svg", 1.3],
    ["#e-modes-figure svg", 1.6],
    ["#e-impedance-figure svg", 1.4],
    ["#e-capacitif-figure svg", 1.3],
    ["#e-boucle-figure svg", 1.3],
    ["#e-blindage-figure svg", 1.4],
    ["#e-filtre-figure svg", 1.5],
    ["#f-schema-principal svg", 1.8],
    ["#h-figure svg", 1.3],
    ["#i-figure svg", 1.3],
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
      id: "c1-cdvdt",
      titre: "Courant dans une capacité parasite",
      niveau: "fondamental",
      enonce: "<p>Une capacité parasite de $100\\ \\mathrm{pF}$ subit une variation de tension de $5\\ \\mathrm{kV/\\mu s}$. Quel courant la traverse pendant le front, en ampères ?</p>",
      valeur: 100e-12 * 5e9,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant",
      etapes: [
        { texte: "Conversion : $5\\ \\mathrm{kV/\\mu s} = 5 \\times 10^{3}/10^{-6} = 5 \\times 10^{9}\\ \\mathrm{V/s}$." },
        { texte: "$i = C\\,\\mathrm{d}v/\\mathrm{d}t = 100 \\times 10^{-12} \\times 5 \\times 10^{9} = 0{,}5\\ \\mathrm{A}$.", note: "Un demi-ampère à travers cent picofarads : à ces vitesses, un isolant laisse passer des courants comparables à ceux d'un circuit de commande." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Courant dans 100 pF selon la pente de tension",
          xTitre: "pente", xUnite: "kV/µs", yTitre: "courant", yUnite: "A",
          xMin: 0, xMax: 12, yMin: 0, yMax: 1.3,
          series: [{ id: "i", nom: "i = C dv/dt", couleur: "serie-1", epaisseur: 2.4, fonction: (s) => 100e-12 * s * 1e9 }],
          surDessin({ c, repere: r, couleurs }) {
            pointRepere(c, r, couleurs, 5, 0.5, "0,5 A à 5 kV/µs");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-ldidt",
      titre: "Tension aux bornes d'un fil",
      niveau: "fondamental",
      enonce: "<p>Un conducteur d'un mètre, d'inductance $1\\ \\mu\\mathrm{H}$, voit son courant passer de $0$ à $10\\ \\mathrm{A}$ en $1\\ \\mu\\mathrm{s}$. Quelle tension apparaît à ses bornes pendant la variation, en volts ?</p>",
      valeur: 10,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension",
      etapes: [
        { texte: "$\\mathrm{d}i/\\mathrm{d}t = 10/10^{-6} = 10^{7}\\ \\mathrm{A/s}$." },
        { texte: "$v = L\\,\\mathrm{d}i/\\mathrm{d}t = 10^{-6} \\times 10^{7} = 10\\ \\mathrm{V}$.", note: "Dix volts sur un simple fil : un conducteur de retour partagé ne peut pas servir de référence à une mesure de quelques millivolts." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Courant et tension du fil",
          xTitre: "temps", xUnite: "µs", yTitre: "A ou V", yUnite: "",
          xMin: 0, xMax: 2, yMin: 0, yMax: 12,
          series: [
            { id: "i", nom: "courant, A", couleur: "serie-1", epaisseur: 2.4, fonction: (t) => (t < 0.5 ? 0 : t < 1.5 ? 10 * (t - 0.5) : 10) },
            { id: "v", nom: "tension L di/dt, V", couleur: "serie-5", epaisseur: 2.4, fonction: (t) => (t > 0.5 && t < 1.5 ? 10 : 0) },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "c3-impedance",
      titre: "Impédance d'un condensateur à 1 MHz",
      niveau: "fondamental",
      enonce: "<p>Quelle est l'impédance d'un condensateur de $4{,}7\\ \\mathrm{nF}$ à $1\\ \\mathrm{MHz}$ ?</p>",
      options: [
        { texte: "Environ $34\\ \\Omega$", juste: true },
        { texte: "Environ $3{,}4\\ \\mathrm{k\\Omega}$" },
        { texte: "Environ $0{,}03\\ \\Omega$" },
        { texte: "Elle est infinie, puisqu'un condensateur bloque le courant." },
      ],
      etapes: [
        { texte: "$Z = 1/(C\\omega) = 1/(2\\pi \\times 10^{6} \\times 4{,}7 \\times 10^{-9})$." },
        { texte: "$2\\pi \\times 10^{6} \\times 4{,}7 \\times 10^{-9} = 0{,}02953\\ \\mathrm{S}$, d'où $Z = 33{,}9\\ \\Omega$.", note: "C'est l'ordre de grandeur des condensateurs de filtrage CEM : ils sont presque des courts-circuits à quelques mégahertz, et presque des circuits ouverts à $50\\ \\mathrm{Hz}$, où ils présentent $677\\ \\mathrm{k\\Omega}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Impédance de 4,7 nF selon la fréquence",
          xTitre: "log10 de la fréquence", xUnite: "", yTitre: "log10 de Z", yUnite: "",
          xMin: 1, xMax: 8, yMin: 0, yMax: 7,
          series: [{ id: "z", nom: "log10 (1 / C ω)", couleur: "serie-3", epaisseur: 2.4, fonction: (u) => Math.log10(1 / (TAU * Math.pow(10, u) * 4.7e-9)) }],
          surDessin({ c, repere: r, couleurs }) {
            pointRepere(c, r, couleurs, 6, Math.log10(33.86), "33,9 Ω à 1 MHz");
            pointRepere(c, r, couleurs, Math.log10(50), Math.log10(677255), "677 kΩ à 50 Hz");
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Modes différentiel et commun
   -------------------------------------------------------------------------- */

function construireModes(racine, api) {
  const conteneur = racine.querySelector("#d-modes-vivant");
  if (!conteneur) return;
  const etat = { i1: 10.1, i2: -9.9, phases: [0, 0, 0] };

  const svg = svgEl("svg", {
    viewBox: "0 0 900 340",
    "aria-label": "Source et charge reliées par deux conducteurs, retour du mode commun par la charpente ; sens et intensité des trois courants, pince ampèremétrique autour des deux conducteurs",
  });
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" });
  fond.innerHTML =
    '<rect x="30" y="60" width="100" height="120" rx="8"/><rect x="770" y="60" width="100" height="120" rx="8"/>' +
    '<path d="M80 180V290M820 180V222M820 236V290"/><path d="M806 222H834M806 236H834" stroke-width="2.6"/>' +
    '<ellipse cx="620" cy="120" rx="26" ry="58" stroke-dasharray="6 4" stroke-width="1.4"/>';
  svg.appendChild(fond);
  const hach = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.1", opacity: "0.6" });
  let h = "";
  for (let x = 100; x <= 820; x += 30) h += "M" + x + " 296l-10 10";
  hach.innerHTML = '<path d="' + h + '"/>';
  svg.appendChild(hach);

  const CHEMINS = [
    { id: "c1", de: [130, 90], a: [770, 90] },
    { id: "c2", de: [130, 150], a: [770, 150] },
    { id: "ct", de: [80, 290], a: [820, 290] },
  ];
  const traits = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-linecap": "round" });
  const pointes = svgEl("g", { fill: "currentColor", stroke: "none" });
  const points = svgEl("g", { stroke: "none", style: "fill: var(--serie-2)" });
  for (const ch of CHEMINS) {
    ch.trait = svgEl("path", { d: "M" + ch.de[0] + " " + ch.de[1] + "H" + ch.a[0] });
    traits.appendChild(ch.trait);
    ch.pointe = svgEl("path", { d: "" });
    pointes.appendChild(ch.pointe);
    ch.points = [0, 1, 2, 3, 4, 5].map(() => {
      const p = svgEl("circle", { r: 3.6, cx: ch.de[0], cy: ch.de[1], opacity: "0" });
      points.appendChild(p);
      return p;
    });
  }
  svg.append(traits, pointes, points);

  const ecrits = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "12" });
  ecrits.innerHTML =
    texte(44, 112, "source") + texte(44, 130, "réf. de", ' font-size="11"') + texte(44, 146, "potentiel", ' font-size="11"') +
    texte(784, 112, "charge") + texte(842, 252, "C", ' font-size="11"') + texte(842, 266, "parasite", ' font-size="10.5"') +
    texte(150, 80, "conducteur 1, i_1 fléché vers la charge") + texte(150, 172, "conducteur 2, i_2 fléché vers la charge") +
    texte(150, 278, "retour par la charpente : -(i_1 + i_2)") + texte(560, 50, "pince : lit i_1 + i_2 = i_MC", ' font-size="11"') +
    texte(150, 330, "flèches et points : sens réel de chaque courant ; épaisseur du trait proportionnelle à son intensité", ' font-size="10.5"');
  svg.appendChild(ecrits);
  const lecture = svgEl("text", { x: 420, y: 200, fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "12" });
  const lecture2 = svgEl("text", { x: 420, y: 218, fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "12" });
  svg.append(lecture, lecture2);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-modes-valeurs", [
    { id: "md", libelle: "Mode différentiel (i_1 - i_2)/2", unite: "A", decimales: 2 },
    { id: "mc", libelle: "Mode commun i_1 + i_2", unite: "A", decimales: 2 },
    { id: "bmd", libelle: "Champ du mode différentiel à 1 m", unite: "µT", decimales: 3 },
    { id: "bmc", libelle: "Champ du mode commun à 1 m", unite: "µT", decimales: 3 },
    { id: "r", libelle: "Rapport des champs MC / MD", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function courants() {
    return { c1: etat.i1, c2: etat.i2, ct: -(etat.i1 + etat.i2) };
  }

  function pointe(ch, sens) {
    if (!sens) return "";
    const mx = (ch.de[0] + ch.a[0]) / 2;
    const y = ch.de[1];
    return sens > 0
      ? "M" + (mx + 8) + " " + y + "L" + (mx - 6) + " " + (y - 7) + "L" + (mx - 6) + " " + (y + 7) + "Z"
      : "M" + (mx - 8) + " " + y + "L" + (mx + 6) + " " + (y - 7) + "L" + (mx + 6) + " " + (y + 7) + "Z";
  }

  function dessiner() {
    const c = courants();
    for (const ch of CHEMINS) {
      const i = c[ch.id];
      const sens = Math.abs(i) < 0.02 ? 0 : Math.sign(i);
      ch.trait.setAttribute("stroke-width", (1.4 + Math.min(6, 0.45 * Math.abs(i))).toFixed(2));
      ch.trait.setAttribute("stroke-dasharray", sens ? "" : "3 5");
      ch.pointe.setAttribute("d", pointe(ch, sens));
    }
    const md = (etat.i1 - etat.i2) / 2;
    const mc = etat.i1 + etat.i2;
    const bmd = (MU0_2PI * Math.abs(md) * 0.01) / 1;
    const bmc = (MU0_2PI * Math.abs(mc)) / 1;
    lecture.textContent = "i_MD = " + nb(api, md, 2) + " A";
    lecture2.textContent = "i_MC = " + nb(api, mc, 2) + " A";
    if (valeurs) {
      valeurs.maj({
        md,
        mc,
        bmd: bmd * 1e6,
        bmc: bmc * 1e6,
        r: bmd > 1e-15 ? nb(api, bmc / bmd, 2) : bmc > 0 ? "mode commun seul" : "aucun champ",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#d-modes-curseurs",
    [
      { id: "i1", libelle: "Courant i_1 du conducteur 1", min: -12, max: 12, pas: 0.1, valeur: etat.i1, unite: "A" },
      { id: "i2", libelle: "Courant i_2 du conducteur 2", min: -12, max: 12, pas: 0.1, valeur: etat.i2, unite: "A" },
    ],
    (lues) => {
      etat.i1 = lues.i1;
      etat.i2 = lues.i2;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  boucleAnimation(api, conteneur, (ecoule) => {
    const c = courants();
    CHEMINS.forEach((ch, k) => {
      const i = c[ch.id];
      const sens = Math.abs(i) < 0.02 ? 0 : Math.sign(i);
      etat.phases[k] = (etat.phases[k] + ecoule * (0.08 + 0.05 * Math.min(12, Math.abs(i)))) % 1;
      ch.points.forEach((p, j) => {
        if (!sens) {
          p.setAttribute("opacity", "0");
          return;
        }
        let u = (etat.phases[k] + j / ch.points.length) % 1;
        if (sens < 0) u = 1 - u;
        p.setAttribute("cx", (ch.de[0] + u * (ch.a[0] - ch.de[0])).toFixed(1));
        p.setAttribute("opacity", "1");
      });
    });
  });

  ressources.push(api.dessiner(fond, { declencheur: conteneur, duree: 1.1 }));
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Enveloppe du spectre d'un front
   -------------------------------------------------------------------------- */

function construireSpectre(racine, api) {
  if (!racine.querySelector("#e-spectre-trace")) return;
  const reglages = { fd: 4, d: 0.5, tr: 76 };
  const dB = (v) => 20 * Math.log10(Math.max(v, 1e-12));

  const trace = api.sim.traceur("#e-spectre-trace", {
    titre: "Enveloppe du spectre d'une tension de découpage de 540 V",
    xTitre: "log10 de la fréquence en Hz", xUnite: "", yTitre: "amplitude", yUnite: "dBV",
    xMin: 3, xMax: 8, yMin: -100, yMax: 70,
    echantillons: 400,
    series: [
      { id: "e", nom: "enveloppe, fronts de durée t_r", couleur: "serie-1", epaisseur: 3 },
      { id: "r", nom: "front idéal, t_r = 0", couleur: "serie-6", epaisseur: 1.4 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      const f1 = (reglages.fd * 1000) / (Math.PI * reglages.d);
      const f2 = 1 / (Math.PI * reglages.tr * 1e-9);
      ligneV(c, r, couleurs, Math.log10(f1), "f_1", [8, 5]);
      if (Math.log10(f2) < 8) ligneV(c, r, couleurs, Math.log10(f2), "f_2", [8, 5]);
    },
  });
  if (trace) ressources.push(trace);

  function maj() {
    if (!trace) return;
    const { fd, d, tr } = reglages;
    trace.definirFonction("e", (u) => dB(enveloppe(Math.pow(10, u), BUS, d, fd * 1000, tr * 1e-9)));
    trace.definirFonction("r", (u) => dB(enveloppe(Math.pow(10, u), BUS, d, fd * 1000, 0)));
    const f1 = (fd * 1000) / (Math.PI * d);
    const f2 = 1 / (Math.PI * tr * 1e-9);
    const ecart = (f) => Math.max(0, 20 * Math.log10(Math.PI * f * tr * 1e-9));
    trace.definirMesures([
      { nom: "Plateau 2 A d", valeur: nb(api, dB(2 * BUS * d), 1) + " dBV" },
      { nom: "Première cassure f_1 = 1/(π d T)", valeur: nb(api, f1 / 1000, 2) + " kHz" },
      { nom: "Seconde cassure f_2 = 1/(π t_r)", valeur: nb(api, f2 / 1e6, 2) + " MHz" },
      { nom: "Écart au front idéal à 10 MHz", valeur: nb(api, ecart(1e7), 1) + " dB" },
      { nom: "Écart au front idéal à 100 MHz", valeur: nb(api, ecart(1e8), 1) + " dB" },
    ]);
  }

  const curseurs = api.sim.curseurs(
    "#e-spectre-curseurs",
    [
      { id: "fd", libelle: "Fréquence de découpage", min: 1, max: 20, pas: 0.5, valeur: reglages.fd, unite: "kHz" },
      { id: "d", libelle: "Rapport cyclique d", min: 0.1, max: 0.9, pas: 0.05, valeur: reglages.d },
      { id: "tr", libelle: "Durée des fronts t_r", min: 5, max: 500, pas: 1, valeur: reglages.tr, unite: "ns" },
    ],
    (lues) => {
      reglages.fd = lues.fd;
      reglages.d = lues.d;
      reglages.tr = lues.tr;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   E. Couplage capacitif
   -------------------------------------------------------------------------- */

const IMPEDANCES_VICTIME = [50, 250, 1000, 10000, 100000];

function construireCapacitif(racine, api) {
  if (!racine.querySelector("#e-capa-trace")) return;
  const reglages = { dV: 540, tr: 100, cp: 10, l: 5, rv: 1, ecran: 0 };

  function parametres() {
    const Cc = (reglages.cp * 1e-12 * reglages.l) / (reglages.ecran ? 100 : 1);
    return { dV: reglages.dV, tr: reglages.tr * 1e-9, Cc, Cv: 50e-12 * reglages.l, Rv: IMPEDANCES_VICTIME[reglages.rv] };
  }

  let fenetre = 1;
  const trace = api.sim.traceur("#e-capa-trace", {
    titre: "Tension perturbatrice aux bornes de la victime",
    xTitre: "temps", xUnite: "µs", yTitre: "tension", yUnite: "V",
    xMin: 0, xMax: 1,
    echantillons: 600,
    series: [
      { id: "v", nom: "tension de la victime v_v", couleur: "serie-5", epaisseur: 3 },
      { id: "s", nom: "tension de la source divisée par 10", couleur: "serie-6", epaisseur: 1.4 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, reglages.tr / 1000, "fin du front", [8, 5]);
    },
  });
  if (trace) ressources.push(trace);

  function maj() {
    if (!trace) return;
    const p = parametres();
    const tau = p.Rv * (p.Cc + p.Cv);
    fenetre = Math.min(2000, Math.max(3 * p.tr, p.tr + 5 * tau)) * 1e6;
    trace.definirPlage({ xMin: 0, xMax: fenetre });
    trace.definirFonction("v", (t) => tensionCapacitive(t * 1e-6, p));
    trace.definirFonction("s", (t) => (Math.min(1, Math.max(0, (t * 1e-6) / p.tr)) * p.dV) / 10);
    const crete = tensionCapacitive(p.tr, p);
    trace.definirMesures([
      { nom: "Capacité de couplage C_c", valeur: nb(api, p.Cc * 1e12, 1) + " pF" },
      { nom: "Capacité de la victime C_v", valeur: nb(api, p.Cv * 1e12, 0) + " pF" },
      { nom: "Constante de temps τ = R_v (C_c + C_v)", valeur: tau < 1e-6 ? nb(api, tau * 1e9, 1) + " ns" : nb(api, tau * 1e6, 2) + " µs" },
      { nom: "Plateau R_v C_c S", valeur: nb(api, (p.Rv * p.Cc * p.dV) / p.tr, 1) + " V" },
      { nom: "Crête à la fin du front", valeur: nb(api, crete, 2) + " V" },
      { nom: "Diviseur capacitif C_c ΔV / (C_c + C_v)", valeur: nb(api, (p.Cc * p.dV) / (p.Cc + p.Cv), 1) + " V" },
    ]);
  }

  const curseurs = api.sim.curseurs(
    "#e-capa-curseurs",
    [
      { id: "dV", libelle: "Saut de tension de la source ΔV", min: 50, max: 800, pas: 10, valeur: reglages.dV, unite: "V" },
      { id: "tr", libelle: "Durée du front t_r", min: 10, max: 500, pas: 5, valeur: reglages.tr, unite: "ns" },
      { id: "cp", libelle: "Capacité de couplage par mètre", min: 1, max: 50, pas: 1, valeur: reglages.cp, unite: "pF/m" },
      { id: "l", libelle: "Longueur parallèle", min: 1, max: 30, pas: 1, valeur: reglages.l, unite: "m" },
      { id: "rv", libelle: "Impédance de la victime R_v", min: 0, max: 4, pas: 1, valeur: reglages.rv, format: (x) => ["50 Ω", "250 Ω", "1 kΩ", "10 kΩ", "100 kΩ"][Math.round(x)] },
      { id: "ecran", libelle: "Câble de la victime", min: 0, max: 1, pas: 1, valeur: reglages.ecran, format: (x) => (Math.round(x) ? "blindé, écran relié" : "non blindé") },
    ],
    (lues) => {
      reglages.dV = lues.dV;
      reglages.tr = lues.tr;
      reglages.cp = lues.cp;
      reglages.l = lues.l;
      reglages.rv = Math.round(lues.rv);
      reglages.ecran = Math.round(lues.ecran);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   E. Couplage inductif en coupe
   -------------------------------------------------------------------------- */

function construireInductif(racine, api) {
  const conteneur = racine.querySelector("#e-inductif-vivant");
  if (!conteneur) return;
  /* Échelle : 20 px par centimètre ; plan en y = 280 ; source à 5 cm du plan. */
  const ECH = 20;
  const XS = 140;
  const YP = 280;
  const HS = 5;
  const etat = { x: XS + 10 * ECH, y: YP - 5 * ECH, mode: 0, l: 10, didt: 50 };

  const svg = svgEl("svg", {
    viewBox: "0 0 640 400",
    "aria-label": "Coupe transversale : plan de masse, conducteur source à 5 cm du plan avec son image, lignes de champ, conducteur victime déplaçable et sa boucle de retour",
  });
  const fond = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "1.2", opacity: "0.55" });
  let lignes = "";
  for (const mu of [1.0, 1.4, 2.0, 2.8]) {
    const cy = YP - HS * ECH * (Math.cosh(mu) / Math.sinh(mu));
    const r = (HS * ECH) / Math.sinh(mu);
    lignes += '<circle cx="' + XS + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '"/>';
  }
  fond.innerHTML = lignes;
  svg.appendChild(fond);
  const structure = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": "3", "stroke-linecap": "round" });
  let hach = "";
  for (let x = 20; x <= 630; x += 22) hach += "M" + x + " " + (YP + 4) + "l-10 10";
  structure.innerHTML =
    '<path d="M10 ' + YP + 'H630"/>' +
    '<g stroke-width="1.1" opacity="0.6"><path d="' + hach + '"/></g>' +
    '<circle cx="' + XS + '" cy="' + (YP - HS * ECH) + '" r="10" stroke-width="2"/>' +
    '<circle cx="' + XS + '" cy="' + (YP + HS * ECH) + '" r="10" stroke-width="1.6" stroke-dasharray="4 3"/>' +
    '<path d="M' + (XS - 6) + " " + (YP + HS * ECH - 6) + "l12 12M" + (XS + 6) + " " + (YP + HS * ECH - 6) + 'l-12 12" stroke-width="1.6"/>';
  svg.appendChild(structure);
  const pointSource = svgEl("circle", { cx: XS, cy: YP - HS * ECH, r: 3, fill: "currentColor", stroke: "none" });
  svg.appendChild(pointSource);
  const boucle = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-dasharray": "2 4" });
  const second = svgEl("circle", { r: 6, fill: "none", stroke: "currentColor", "stroke-width": "2" });
  svg.append(boucle, second);
  const ecrits = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "11.5" });
  ecrits.innerHTML =
    texte(180, YP + 56, "source : disque à point, à 5 cm du plan, i_s sortant") +
    texte(XS + 18, YP + HS * ECH + 4, "image : -i_s, sous le plan") +
    texte(180, YP + 36, "chemin de câbles métallique : plan de masse 0 V") +
    texte(20, 24, "coupe transversale, 1 cm = 20 unités ; faites glisser le conducteur victime");
  svg.appendChild(ecrits);
  const cote = svgEl("text", { x: 20, y: 46, fill: "currentColor", "font-family": "ui-monospace, monospace", "font-size": "11.5" });
  svg.appendChild(cote);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-inductif-valeurs", [
    { id: "x", libelle: "Distance horizontale à la source", unite: "cm", decimales: 1 },
    { id: "y", libelle: "Hauteur de la victime au-dessus du plan", unite: "cm", decimales: 1 },
    { id: "mp", libelle: "Mutuelle par mètre", unite: "nH/m", decimales: 1 },
    { id: "m", libelle: "Mutuelle totale", unite: "µH", decimales: 3 },
    { id: "v", libelle: "Tension induite M di/dt", unite: "V", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    const xm = (etat.x - XS) / ECH / 100;
    const ym = (YP - etat.y) / ECH / 100;
    const mp = mutuelleParMetre(xm, ym, HS / 100, etat.mode, 0.01);
    const M = mp * etat.l;
    const v = M * etat.didt * 1e6;
    if (etat.mode === 0) {
      boucle.setAttribute("d", "M" + etat.x + " " + etat.y + "V" + YP);
      second.setAttribute("opacity", "0");
    } else {
      boucle.setAttribute("d", "M" + etat.x + " " + etat.y + "V" + (etat.y + ECH));
      second.setAttribute("cx", etat.x);
      second.setAttribute("cy", etat.y + ECH);
      second.setAttribute("opacity", "1");
    }
    cote.textContent = etat.mode === 0 ? "boucle victime : conducteur et retour par le plan (pointillé)" : "boucle victime : paire, second conducteur 1 cm en dessous";
    if (valeurs) valeurs.maj({ x: xm * 100, y: ym * 100, mp: mp * 1e9, m: M * 1e6, v });
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: XS + 20, y: 90, largeur: 470, hauteur: YP - 24 - 90 },
    valeur: { x: etat.x, y: etat.y },
    pas: 4,
    libelle: "Position du conducteur victime dans la coupe",
    rappel(mesure) {
      etat.x = mesure.x;
      etat.y = mesure.y;
      maj();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-inductif-curseurs",
    [
      { id: "mode", libelle: "Retour de la boucle victime", min: 0, max: 1, pas: 1, valeur: 0, format: (x) => (Math.round(x) ? "second conducteur à 1 cm" : "par le plan de masse") },
      { id: "l", libelle: "Longueur parallèle", min: 1, max: 50, pas: 1, valeur: etat.l, unite: "m" },
      { id: "didt", libelle: "Pente du courant source", min: 1, max: 200, pas: 1, valeur: etat.didt, unite: "A/µs" },
    ],
    (lues) => {
      etat.mode = Math.round(lues.mode);
      etat.l = lues.l;
      etat.didt = lues.didt;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);

  ressources.push(api.dessiner(structure, { declencheur: conteneur, duree: 1.1 }));
  ressources.push(api.dessiner(fond, { declencheur: conteneur, duree: 1.2 }));
  maj();
}

/* --------------------------------------------------------------------------
   H. Courant de mode commun d'un variateur sur une période
   -------------------------------------------------------------------------- */

function construireModeCommun(racine, api) {
  if (!racine.querySelector("#h-sim-periode")) return;
  const reglages = { l: 20, tr: 100, Lt: 0, fd: 4, R: 5, Cm: 2 };
  let res = simulerModeCommun(reglages);
  let curseurT = 0;

  const periode = api.sim.traceur("#h-sim-periode", {
    titre: "Tension et courant de mode commun sur une période de découpage",
    xTitre: "temps", xUnite: "µs", yTitre: "A, ou V divisés par 20", yUnite: "",
    xMin: 0, xMax: res.T * 1e6,
    ratio: 0.38,
    series: [
      { id: "v", nom: "v_MC / 20", couleur: "serie-6", epaisseur: 1.4 },
      { id: "i", nom: "courant de mode commun i_MC", couleur: "serie-1", epaisseur: 2.6 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, 0, "", [2, 3]);
      ligneV(c, r, couleurs, curseurT * 1e6, "");
    },
  });
  if (periode) ressources.push(periode);

  const zoom = api.sim.traceur("#h-sim-zoom", {
    titre: "Agrandissement du premier front",
    xTitre: "temps après le front", xUnite: "µs", yTitre: "A, ou V divisés par 20", yUnite: "",
    xMin: -0.1 * res.fen * 1e6, xMax: res.fen * 1e6,
    ratio: 0.36,
    series: [
      { id: "v", nom: "v_MC / 20", couleur: "serie-6", epaisseur: 1.4 },
      { id: "i", nom: "courant de mode commun i_MC", couleur: "serie-1", epaisseur: 2.6 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneH(c, r, couleurs, res.Ipk, "crête non amortie (ΔV/Z_0)|sin x/x|");
      ligneH(c, r, couleurs, 0, "", [2, 3]);
    },
  });
  if (zoom) ressources.push(zoom);

  const valeurs = api.sim.valeurs("#h-sim-valeurs", [
    { id: "t", libelle: "Instant dans la période", unite: "µs", decimales: 1 },
    { id: "v", libelle: "Tension de mode commun v_MC", unite: "V", decimales: 0 },
    { id: "i", libelle: "Courant crête autour de l'instant", unite: "A", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function echantillonA(t) {
    const liste = res.periode;
    let meilleur = liste[0];
    for (const e of liste) {
      if (e.t > t) break;
      meilleur = e;
    }
    return meilleur;
  }

  function majCurseur(fraction) {
    curseurT = fraction * res.T;
    const e = echantillonA(curseurT);
    if (valeurs && e) valeurs.maj({ t: curseurT * 1e6, v: e.v, i: e.i });
    if (periode) periode.rafraichir();
  }

  function maj() {
    res = simulerModeCommun(reglages);
    if (periode) {
      periode.definirPlage({ xMin: 0, xMax: res.T * 1e6 });
      periode.definirDonnees("v", res.periode.map((e) => [e.t * 1e6, e.v / 20]));
      periode.definirDonnees("i", res.periode.map((e) => [e.t * 1e6, e.i]));
      periode.definirMesures([
        { nom: "L_MC et C_MC", valeur: nb(api, res.L * 1e6, 2) + " µH ; " + nb(api, res.C * 1e9, 2) + " nF" },
        { nom: "Z_0 et f_0", valeur: nb(api, res.Z0, 1) + " Ω ; " + nb(api, res.f0 / 1000, 0) + " kHz" },
        { nom: "Crête par la formule, sans amortissement", valeur: nb(api, res.Ipk, 2) + " A" },
        { nom: "Crête simulée", valeur: nb(api, res.pk, 2) + " A" },
        { nom: "Valeur efficace sur la période", valeur: nb(api, res.rms, 3) + " A" },
        { nom: "Énergie par front ½ C ΔV²", valeur: nb(api, res.W * 1e6, 1) + " µJ" },
        { nom: "Puissance dissipée dans R", valeur: nb(api, res.P, 2) + " W" },
      ]);
    }
    if (zoom) {
      zoom.definirPlage({ xMin: -0.1 * res.fen * 1e6, xMax: res.fen * 1e6 });
      zoom.definirDonnees("v", res.zoom.map((e) => [e.t * 1e6, e.v / 20]));
      zoom.definirDonnees("i", res.zoom.map((e) => [e.t * 1e6, e.i]));
    }
    majCurseur(curseurT / (res.T || 1));
  }

  const curseurs = api.sim.curseurs(
    "#h-sim-curseurs",
    [
      { id: "l", libelle: "Longueur du câble moteur", min: 5, max: 150, pas: 5, valeur: reglages.l, unite: "m" },
      { id: "tr", libelle: "Durée des fronts t_r", min: 10, max: 300, pas: 5, valeur: reglages.tr, unite: "ns" },
      { id: "Lt", libelle: "Inductance du tore de mode commun", min: 0, max: 500, pas: 10, valeur: reglages.Lt, unite: "µH" },
      { id: "fd", libelle: "Fréquence de découpage", min: 2, max: 16, pas: 1, valeur: reglages.fd, unite: "kHz" },
      { id: "R", libelle: "Résistance d'amortissement R", min: 1, max: 60, pas: 1, valeur: reglages.R, unite: "Ω" },
    ],
    (lues) => {
      reglages.l = lues.l;
      reglages.tr = lues.tr;
      reglages.Lt = lues.Lt;
      reglages.fd = lues.fd;
      reglages.R = lues.R;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#h-sim-lecteur", {
    de: 0,
    a: 1,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Parcours de la période de découpage",
    rappel: (fraction) => majCurseur(fraction),
  });
  if (lecteur) ressources.push(lecteur);
  maj();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function dessinTore(id) {
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="2">';
  s += '<ellipse cx="260" cy="110" rx="70" ry="80"/><ellipse cx="260" cy="110" rx="40" ry="50"/>';
  s += '<path d="M40 90H480M40 130H480"/></g>';
  s += TRAITS + ' stroke-width="1.8">' + fleche(70, 80, 140, 80, id) + fleche(140, 142, 70, 142, id) + "</g>";
  s += TRAITS + ' stroke-width="1.6" stroke-dasharray="4 4">' + fleche(380, 80, 450, 80, id) + fleche(380, 120, 450, 120, id) + "</g>";
  s += ECRITS + texte(40, 30, "mode différentiel : aller et retour") + texte(40, 48, "flux opposés, somme nulle dans le noyau");
  s += texte(330, 200, "mode commun : même sens") + texte(330, 218, "flux ajoutés, forte inductance") + texte(196, 214, "noyau") + "</g>";
  return s;
}

function dessinDiagnostic(id) {
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="1.8">';
  s += '<rect x="10" y="20" width="200" height="54" rx="8"/><rect x="250" y="20" width="200" height="54" rx="8"/><rect x="490" y="20" width="200" height="54" rx="8"/>';
  s += '<rect x="250" y="120" width="200" height="54" rx="8"/><rect x="490" y="120" width="200" height="54" rx="8"/>';
  s += fleche(210, 47, 250, 47, id) + fleche(450, 47, 490, 47, id) + fleche(350, 74, 350, 120, id) + fleche(590, 74, 590, 120, id) + "</g>";
  s += ECRITS.replace('font-size="12"', 'font-size="11"');
  s += texte(20, 42, "saute variateur en marche,") + texte(20, 60, "stable à l'arrêt");
  s += texte(260, 42, "pince sur 3 phases :") + texte(260, 60, "courant de mode commun");
  s += texte(500, 42, "écran côté moteur") + texte(500, 60, "non raccordé");
  s += texte(260, 142, "câbles séparés, croisés") + texte(260, 160, "paire torsadée blindée");
  s += texte(500, 142, "colliers 360° aux deux") + texte(500, 160, "extrémités, puis mesure");
  s += "</g>";
  return s;
}

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-radiateur",
      titre: "Courant vers le radiateur",
      niveau: "fondamental",
      enonce: "<p>La capacité entre le collecteur d'un IGBT et son radiateur, relié au conducteur de protection, vaut $150\\ \\mathrm{pF}$. Le collecteur passe de $0$ à $600\\ \\mathrm{V}$ en $60\\ \\mathrm{ns}$. Quel courant circule vers la terre pendant le front, en ampères ?</p>",
      valeur: (150e-12 * 600) / 60e-9,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant vers la terre",
      etapes: [
        { texte: "Pente : $\\mathrm{d}v/\\mathrm{d}t = 600/(60 \\times 10^{-9}) = 10^{10}\\ \\mathrm{V/s}$, soit $10\\ \\mathrm{kV/\\mu s}$." },
        { texte: "$i = C\\,\\mathrm{d}v/\\mathrm{d}t = 150 \\times 10^{-12} \\times 10^{10} = 1{,}5\\ \\mathrm{A}$ pendant $60\\ \\mathrm{ns}$." },
        { texte: "Charge transférée : $Q = C\\Delta V = 90\\ \\mathrm{nC}$, identique quelle que soit la durée du front.", note: "Ce courant de mode commun naît dans le module de puissance lui-même : il faut lui offrir un retour court, par le radiateur et le filtre, vers le bus." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Front de tension et courant capacitif",
          xTitre: "temps", xUnite: "ns", yTitre: "A, ou V divisés par 400", yUnite: "",
          xMin: 0, xMax: 160, yMin: 0, yMax: 2,
          series: [
            { id: "v", nom: "tension du collecteur / 400", couleur: "serie-6", epaisseur: 1.6, fonction: (t) => (t < 40 ? 0 : t < 100 ? (600 * (t - 40)) / 60 / 400 : 1.5) },
            { id: "i", nom: "courant vers la terre", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => (t > 40 && t < 100 ? 1.5 : 0) },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-modes",
      titre: "Décomposer deux courants",
      niveau: "fondamental",
      enonce: "<p>Sur une liaison à deux conducteurs, on mesure, avec des courants fléchés tous deux de la source vers la charge, $i_1 = 10{,}3\\ \\mathrm{A}$ et $i_2 = -9{,}7\\ \\mathrm{A}$. Quel courant de mode commun, au sens du courant total qui revient par la terre, circule sur cette liaison, en ampères ?</p>",
      valeur: 0.6,
      unite: "A",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Courant de mode commun",
      etapes: [
        { texte: "$i_\\mathrm{MC} = i_1 + i_2 = 10{,}3 - 9{,}7 = 0{,}6\\ \\mathrm{A}$, qui revient par la terre." },
        { texte: "$i_\\mathrm{MD} = (i_1 - i_2)/2 = (10{,}3 + 9{,}7)/2 = 10\\ \\mathrm{A}$." },
        { texte: "Contrôle : $i_1 = 10 + 0{,}3$ et $i_2 = -10 + 0{,}3$.", note: "À $1\\ \\mathrm{m}$ avec $1\\ \\mathrm{cm}$ entre conducteurs, ces $0{,}6\\ \\mathrm{A}$ créent un champ $0{,}06 \\times 100 = 6$ fois plus fort que les $10\\ \\mathrm{A}$ de mode différentiel." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["i_1 = 10,3 A ; i_2 = -9,7 A (fléchés vers la charge)", "mode différentiel : (10,3 + 9,7) / 2 = 10 A", "mode commun : 10,3 - 9,7 = 0,6 A par la terre", "pince autour des deux conducteurs : 0,6 A"], "Décomposition en modes différentiel et commun, étape par étape.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );

  const M3 = MU0_2PI * 10 * Math.log(3);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-mutuelle",
      titre: "Tension induite dans une boucle de capteur",
      niveau: "intermédiaire",
      enonce: "<p>Un câble porte un courant de mode commun qui varie de $5\\ \\mathrm{A}$ en $200\\ \\mathrm{ns}$. Sur $10\\ \\mathrm{m}$, une boucle de capteur est formée d'un conducteur à $10\\ \\mathrm{cm}$ du câble et d'un retour à $30\\ \\mathrm{cm}$, dans le même plan. On néglige le retour du courant source. Quelle tension est induite dans la boucle, en volts ?</p>",
      valeur: M3 * (5 / 200e-9),
      unite: "V",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Tension induite",
      etapes: [
        { texte: "$M = \\frac{\\mu_0\\ell}{2\\pi}\\ln\\frac{r_2}{r_1} = 2 \\times 10^{-7} \\times 10 \\times \\ln 3 = 2{,}197\\ \\mu\\mathrm{H}$." },
        { texte: "$\\mathrm{d}i/\\mathrm{d}t = 5/(200 \\times 10^{-9}) = 2{,}5 \\times 10^{7}\\ \\mathrm{A/s}$." },
        { texte: "$v = M\\,\\mathrm{d}i/\\mathrm{d}t = 2{,}197 \\times 10^{-6} \\times 2{,}5 \\times 10^{7} = 54{,}9\\ \\mathrm{V}$.", note: "La boucle de $20\\ \\mathrm{cm}$ de large est le vrai problème : avec un retour jointif, à $1\\ \\mathrm{cm}$, $\\ln(0{,}11/0{,}10)$ remplace $\\ln 3$ et la tension tombe à $4{,}8\\ \\mathrm{V}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension induite selon la position du retour, r_1 = 10 cm",
          xTitre: "distance du retour r_2", xUnite: "cm", yTitre: "tension", yUnite: "V",
          xMin: 10, xMax: 60, yMin: 0, yMax: 100,
          series: [{ id: "v", nom: "v = M di/dt", couleur: "serie-1", epaisseur: 2.6, fonction: (r2) => MU0_2PI * 10 * Math.log(r2 / 10) * 2.5e7 }],
          surDessin({ c, repere: r, couleurs }) {
            pointRepere(c, r, couleurs, 30, M3 * 2.5e7, "54,9 V pour r_2 = 30 cm");
            pointRepere(c, r, couleurs, 11, MU0_2PI * 10 * Math.log(1.1) * 2.5e7, "4,8 V, retour jointif");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-tore",
      titre: "Inductance d'un tore de mode commun",
      niveau: "intermédiaire",
      enonce: "<p>Un onduleur produit des sauts de mode commun de $180\\ \\mathrm{V}$ très raides sur une boucle de capacité $C_\\mathrm{MC} = 20\\ \\mathrm{nF}$. On veut limiter la crête du courant de mode commun à $2\\ \\mathrm{A}$. En négligeant l'inductance propre du câble, quelle inductance minimale doit avoir le tore, en microhenrys ?</p>",
      valeur: Math.pow(180 / 2, 2) * 20e-9 * 1e6,
      unite: "µH",
      tolerance: 0.02,
      chiffres: 0,
      libelleChamp: "Inductance minimale",
      etapes: [
        { texte: "Front très raide : $\\hat{I} \\approx \\Delta V/Z_0$, donc il faut $Z_0 \\ge 180/2 = 90\\ \\Omega$." },
        { texte: "$Z_0 = \\sqrt{L/C}$, d'où $L \\ge Z_0^2 C = 8100 \\times 20 \\times 10^{-9} = 162\\ \\mu\\mathrm{H}$." },
        { texte: "Fréquence propre obtenue : $1/(2\\pi\\sqrt{162 \\times 10^{-6} \\times 20 \\times 10^{-9}}) = 88{,}4\\ \\mathrm{kHz}$.", note: "Le tore ne doit pas saturer : son noyau ne voit que le flux du mode commun, mais la crête et la durée des salves fixent la section nécessaire. L'énergie par front, $324\\ \\mu\\mathrm{J}$, reste à dissiper." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Crête du courant de mode commun selon l'inductance",
          xTitre: "inductance de la boucle", xUnite: "µH", yTitre: "crête", yUnite: "A",
          xMin: 10, xMax: 500, yMin: 0, yMax: 8,
          series: [{ id: "i", nom: "ΔV / √(L / C)", couleur: "serie-1", epaisseur: 2.6, fonction: (L) => 180 / Math.sqrt((L * 1e-6) / 20e-9) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 2, "objectif 2 A");
            pointRepere(c, r, couleurs, 162, 2, "162 µH");
          },
        });
      },
    })
  );

  const Rc = (1.72e-8 * 2) / 1.5e-6;
  const lsb = (2 * Rc) / (10 / 4096);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-impedance-commune",
      titre: "Erreur due à un retour partagé",
      niveau: "avancé",
      enonce: "<p>Une électrovanne absorbant $2\\ \\mathrm{A}$ et un capteur $0$-$10\\ \\mathrm{V}$ partagent $2\\ \\mathrm{m}$ de conducteur de $0\\ \\mathrm{V}$ en cuivre de $1{,}5\\ \\mathrm{mm^2}$ ($\\rho = 1{,}72 \\times 10^{-8}\\ \\Omega \\cdot \\mathrm{m}$). L'entrée analogique, unipolaire, mesure par rapport à l'extrémité de ce conducteur côté automate et convertit $0$ à $10\\ \\mathrm{V}$ sur $12$ bits. De combien de pas de quantification la mesure est-elle décalée en régime établi quand l'électrovanne est alimentée ?</p>",
      valeur: lsb,
      unite: "pas",
      tolerance: 0.03,
      chiffres: 1,
      libelleChamp: "Décalage en pas",
      etapes: [
        { texte: "Résistance du tronçon commun : $R_c = \\rho\\ell/S = 1{,}72 \\times 10^{-8} \\times 2/(1{,}5 \\times 10^{-6}) = 22{,}9\\ \\mathrm{m\\Omega}$." },
        { texte: "Chute de tension : $v_c = R_c i_1 = 0{,}0229 \\times 2 = 45{,}9\\ \\mathrm{mV}$, soit $0{,}46\\ \\%$ de l'échelle." },
        { texte: "Pas de quantification : $10/4096 = 2{,}44\\ \\mathrm{mV}$ ; décalage $45{,}9/2{,}44 = 18{,}8$ pas." },
        { texte: "En commutation, $2\\ \\mu\\mathrm{H}$ de fil et $2\\ \\mathrm{A/\\mu s}$ ajoutent des pointes de $4\\ \\mathrm{V}$.", note: "Remède : retour de l'électrovanne séparé, ramené directement à l'alimentation, et entrée différentielle qui mesure entre les deux fils du capteur." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const v = etapes(["R_c = 1,72e-8 × 2 / 1,5e-6 = 22,9 mΩ", "v_c = 22,9 mΩ × 2 A = 45,9 mV", "pas = 10 V / 4096 = 2,44 mV", "décalage = 45,9 / 2,44 = 18,8 pas", "en commutation : 2 µH × 2 A/µs = 4 V de pointe"], "Couplage par impédance commune : du conducteur partagé à l'erreur de mesure.");
        schemaCorrection(moteurApi, conteneur, v.viewBox, v.dessin, v.legende);
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-diagnostic",
      titre: "Mesure de pression qui saute",
      niveau: "diagnostic",
      enonce: "<p>La mesure $4$-$20\\ \\mathrm{mA}$ de pression d'une pompe saute de $\\pm 3\\ \\%$ dès que le variateur tourne, et redevient stable à son arrêt. Le câble du capteur, non blindé, partage sur $20\\ \\mathrm{m}$ le chemin de câbles du câble moteur. L'écran du câble moteur est raccordé côté variateur par une queue de cochon, et pas du tout côté moteur. Quelles affirmations sont justes ?</p>",
      options: [
        { texte: "Le courant de mode commun du moteur, faute de retour par l'écran côté moteur, revient par la charpente et forme une grande boucle qui couple inductivement le câble du capteur.", juste: true },
        { texte: "La longueur parallèle de $20\\ \\mathrm{m}$ sans écran favorise aussi un couplage capacitif depuis les phases du câble moteur.", juste: true },
        { texte: "Une pince ampèremétrique autour des trois phases du câble moteur permet de mesurer le courant de mode commun avant et après correction.", juste: true },
        { texte: "Il suffit de remplacer le capteur par un modèle de meilleure précision." },
        { texte: "Augmenter la fréquence de découpage éloignera la perturbation de la bande utile et la fera disparaître." },
      ],
      multiple: true,
      etapes: [
        { texte: "La dépendance à la marche du variateur désigne la source : les fronts de l'onduleur." },
        { texte: "Écran non raccordé côté moteur : le mode commun revient par la structure, boucle large, couplage inductif ; câbles voisins non blindés : couplage capacitif." },
        { texte: "La pince sur les trois phases mesure $i_\\mathrm{MC}$ ; elle sert de référence pour juger les corrections." },
        { texte: "Corrections : colliers $360$ degrés aux deux extrémités, câble de capteur en paire torsadée blindée dans un chemin séparé, croisements à angle droit, éventuellement tore de mode commun.", note: "Plus de fronts par seconde augmenterait la puissance perturbatrice ; la précision du capteur n'a rien à voir avec un couplage." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(moteurApi, conteneur, "0 0 700 190", dessinDiagnostic("fl-k6"), "Démarche : symptôme, mesure du mode commun, cause, corrections, nouvelle mesure.");
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-conceptuel",
      titre: "Pourquoi le tore épargne le courant utile",
      niveau: "conceptuel",
      enonce: "<p>Sans calcul, expliquez pourquoi un tore magnétique enfilé sur les trois phases d'un câble moteur ne gêne pas le courant utile de plusieurs dizaines d'ampères, alors qu'il réduit fortement le courant de mode commun.</p>",
      motsCles: [["somme", "nulle", "s'annulent", "annulent", "compensent", "opposes"], ["flux", "champ", "noyau"], ["mode commun", "meme sens", "s'ajoutent", "ajoutent"], ["inductance", "impedance"]],
      minimum: 3,
      exemple: "Trois ou quatre phrases : somme des courants utiles, flux dans le noyau, cas du mode commun, conséquence sur l'inductance vue.",
      etapes: [
        { texte: "Le tore voit la somme des courants qui le traversent. Pour le courant utile, $i_a + i_b + i_c = 0$ : les flux s'annulent dans le noyau, qui ne présente aucune inductance et ne sature pas." },
        { texte: "Le courant de mode commun parcourt les trois phases dans le même sens : les flux s'ajoutent, le tore présente une forte inductance qui augmente $Z_0$ et réduit la crête." },
        { texte: "Le conducteur de protection doit rester hors du tore : sinon le retour du mode commun le traverserait aussi, et les flux s'annuleraient de nouveau.", note: "C'est le même principe que celui du dispositif différentiel, qui mesure la somme des courants actifs." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(moteurApi, conteneur, "0 0 500 230", dessinTore("fl-k7"), "Mode différentiel : flux opposés, somme nulle. Mode commun : flux ajoutés, forte inductance.");
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

function dessinFiltreQuiz(id) {
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="2">';
  s += '<path d="M20 60H140M220 60H560M20 140H140M220 140H560"/>';
  s += '<rect x="140" y="40" width="80" height="120" rx="8"/>';
  s += '<path d="M300 60V92M300 108V140"/><path d="M420 60V40M420 24V10H560"/><path d="M480 140V162M480 178V200H560"/></g>';
  s += TRAITS + ' stroke-width="2.8"><path d="M282 92H318M282 108H318M402 40H438M402 24H438M462 162H498M462 178H498"/></g>';
  s += ECRITS.replace('font-size="12"', 'font-size="11"');
  s += texte(150, 100, "élément A") + texte(326, 104, "élément B") + texte(444, 30, "élément C") + texte(504, 176, "élément C") + texte(520, 224, "vers PE");
  s += texte(20, 50, "L1") + texte(20, 130, "L2");
  s += "</g>";
  return s;
}

const ZONES_FILTRE = [
  { x: 135, y: 35, largeur: 90, hauteur: 130, etiquette: "élément A" },
  { x: 270, y: 80, largeur: 110, hauteur: 40, etiquette: "élément B" },
  { x: 395, y: 6, largeur: 110, hauteur: 44, etiquette: "élément C", juste: true },
  { x: 455, y: 152, largeur: 110, hauteur: 34, etiquette: "élément C", juste: true },
];

const VISUELS_QUIZ = [
  etapes(["capacitif : i = C dv/dt", "la pente de tension pilote le courant injecté", "inductif : M di/dt, pente de courant"], "Couplage gouverné par dv/dt."),
  etapes(["pince sur a, b, c : lit i_a + i_b + i_c", "courants utiles : somme nulle", "reste : le courant de mode commun"], "Mesure du mode commun à la pince."),
  etapes(["dv/dt = 10 kV/µs = 1e10 V/s", "i = 200e-12 × 1e10", "= 2 A"], "Courant capacitif."),
  etapes(["mode différentiel : flux opposés", "somme nulle dans le noyau", "inductance quasi nulle, pas de saturation"], "Self de mode commun et courant utile."),
  etapes(["f_2 = 1 / (π t_r)", "= 1 / (π × 50e-9)", "= 6,37 MHz"], "Seconde cassure du spectre."),
  () => ({ viewBox: "0 0 600 240", dessin: dessinFiltreQuiz("fl-qv5"), legende: "Les condensateurs C_Y, élément C, ramènent le mode commun vers la terre ; A est la self de mode commun, B le condensateur C_X." }),
  etapes(["collier 360° : L ≈ 1 nH", "queue de cochon 10 cm : L ≈ 100 nH", "écran relié aux deux extrémités : retour du mode commun"], "Raccordement d'écran en haute fréquence."),
  etapes(["terre : sécurité, 50 Hz, protection des personnes", "masse : référence équipotentielle en haute fréquence", "reliées, mais exigences différentes"], "Terre et masse."),
  etapes(["v = M di/dt", "= 0,5e-6 × 20e6", "= 10 V"], "Tension induite."),
  etapes(["tore : Z_0 plus grand, crête plus faible", "câble plus court : C_MC plus faible", "fronts plus lents : spectre réduit", "f_d plus haute : plus de fronts, pire"], "Moyens de réduire le courant de mode commun."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Quel chemin de couplage est directement proportionnel à la pente de tension $\\mathrm{d}v/\\mathrm{d}t$ de la source ?</p>",
        options: ["Le couplage inductif", "Le couplage capacitif", "Le couplage par impédance commune en continu", "Aucun"],
        bonnes: [1],
        explication: "Le courant injecté vaut $C_c\\,\\mathrm{d}v/\\mathrm{d}t$ ; le couplage inductif dépend de $\\mathrm{d}i/\\mathrm{d}t$.",
        resume: "Couplage capacitif",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Une pince ampèremétrique qui entoure les trois phases, et elles seules, d'un câble moteur mesure le courant de mode commun.</p>",
        reponse: true,
        explication: "Les courants utiles ont une somme nulle ; la pince lit $i_a + i_b + i_c = i_\\mathrm{MC}$.",
        resume: "Pince et mode commun",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Courant dans une capacité parasite de $200\\ \\mathrm{pF}$ soumise à $10\\ \\mathrm{kV/\\mu s}$, en ampères ?</p>",
        valeur: 2,
        unite: "A",
        tolerance: 0.02,
        explication: "$200 \\times 10^{-12} \\times 10^{10} = 2\\ \\mathrm{A}$.",
        resume: "Courant capacitif",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Pourquoi une self de mode commun ne freine-t-elle pas le courant utile qui la traverse ?</p>",
        motsCles: [["flux", "champ"], ["annulent", "s'annulent", "nulle", "opposes", "compensent"]],
        minimum: 2,
        explication: "Aller et retour traversent le même noyau en sens opposés : leurs flux s'annulent, et l'inductance vue par le mode différentiel est presque nulle.",
        resume: "Self de mode commun",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Seconde cassure $f_2 = 1/(\\pi t_r)$ du spectre d'un front de $50\\ \\mathrm{ns}$, en mégahertz ?</p>",
        valeur: 1 / (Math.PI * 50e-9) / 1e6,
        unite: "MHz",
        tolerance: 0.02,
        explication: "$1/(\\pi \\times 50 \\times 10^{-9}) = 6{,}37\\ \\mathrm{MHz}$ ; au-delà, l'enveloppe décroît de $40\\ \\mathrm{dB}$ par décade.",
        resume: "Cassure du spectre",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Sur ce filtre CEM simplifié, quel élément ramène le courant de mode commun vers la terre ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 600 240",
        dessin: dessinFiltreQuiz("fl-qz"),
        zones: ZONES_FILTRE,
        explication: "Les condensateurs entre chaque conducteur et le PE, dits $C_Y$, dérivent le mode commun vers la terre ; $C_X$, entre conducteurs, ne traite que le mode différentiel.",
        resume: "Lecture du filtre",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>Pour un câble moteur blindé de variateur, quel raccordement de l'écran est le plus efficace en haute fréquence ?</p>",
        options: [
          "Une queue de cochon à une seule extrémité",
          "Un collier serré sur tout le pourtour, aux deux extrémités",
          "Aucun raccordement, pour éviter les boucles de masse",
          "Une queue de cochon aux deux extrémités, la plus longue possible",
        ],
        bonnes: [1],
        explication: "Le collier $360$ degrés aux deux extrémités offre au mode commun un retour de très faible inductance au plus près de l'aller.",
        resume: "Raccordement d'écran",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>En CEM, terre et masse sont synonymes : un conducteur de protection de forte section assure une bonne masse à $10\\ \\mathrm{MHz}$.</p>",
        reponse: false,
        explication: "La terre est une fonction de sécurité à $50\\ \\mathrm{Hz}$ ; à $10\\ \\mathrm{MHz}$, deux mètres de conducteur présentent plus de $100\\ \\Omega$, quelle que soit la section.",
        resume: "Terre et masse",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Mutuelle de $0{,}5\\ \\mu\\mathrm{H}$, pente de courant de $20\\ \\mathrm{A/\\mu s}$. Tension induite, en volts ?</p>",
        valeur: 10,
        unite: "V",
        tolerance: 0.02,
        explication: "$0{,}5 \\times 10^{-6} \\times 2 \\times 10^{7} = 10\\ \\mathrm{V}$.",
        resume: "Tension induite",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Quelles mesures réduisent la crête du courant de mode commun d'un variateur ?</p>",
        options: [
          { texte: "Ajouter un tore de mode commun en sortie", juste: true },
          { texte: "Raccourcir le câble moteur", juste: true },
          { texte: "Ralentir les fronts de commutation", juste: true },
          { texte: "Augmenter la fréquence de découpage" },
          { texte: "Allonger la queue de cochon de l'écran" },
        ],
        multiple: true,
        explication: "Le tore augmente $Z_0$ ; un câble plus court réduit $C_\\mathrm{MC}$ et l'énergie par front ; des fronts plus lents agissent par le facteur $|\\sin x/x|$ et sur le spectre. La fréquence de découpage ne change pas la crête mais multiplie les salves.",
        resume: "Réduire le mode commun",
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
      { categorie: "Définition", question: "Qu'est-ce que la compatibilité électromagnétique ?", reponse: "L'aptitude d'un appareil à fonctionner correctement dans son environnement électromagnétique sans y introduire de perturbations intolérables : émission et immunité." },
      { categorie: "Modèle", question: "Quels sont les trois éléments d'une perturbation ?", reponse: "Une source, un chemin de couplage et une victime ; supprimer l'un des trois suffit." },
      { categorie: "Chemins", question: "Quels sont les quatre chemins de couplage ?", reponse: "Impédance commune, capacitif en $C\\,\\mathrm{d}v/\\mathrm{d}t$, inductif en $M\\,\\mathrm{d}i/\\mathrm{d}t$, rayonné par les câbles et les ouvertures." },
      { categorie: "Convention", question: "Comment définir les modes différentiel et commun ?", reponse: "$i_\\mathrm{MD} = (i_1 - i_2)/2$, $i_\\mathrm{MC} = i_1 + i_2$, avec les deux courants fléchés vers la charge ; le mode commun revient par la terre." },
      { categorie: "Physique", question: "Pourquoi le mode commun perturbe-t-il davantage ?", reponse: "Son retour est éloigné : sa boucle est grande, et son champ décroît en $1/r$ au lieu de $s/r^2$. Rapport des champs : $(i_\\mathrm{MC}/i_\\mathrm{MD})(r/s)$." },
      { categorie: "Spectre", question: "Où se situent les cassures du spectre d'un front ?", reponse: "$f_1 = 1/(\\pi dT)$ puis $f_2 = 1/(\\pi t_r)$ ; $-20$ puis $-40\\ \\mathrm{dB}$ par décade. Ralentir les fronts abaisse $f_2$." },
      { categorie: "Variateur", question: "Quelle crête de courant de mode commun pour un variateur ?", reponse: "$(\\Delta V/Z_0)|\\sin x/x|$ avec $\\Delta V = E/3$, $Z_0 = \\sqrt{L_\\mathrm{MC}/C_\\mathrm{MC}}$, $x = \\pi f_0 t_r$ : environ $9\\ \\mathrm{A}$ pour la pompe." },
      { categorie: "Énergie", question: "Que change un tore de mode commun à l'énergie par front ?", reponse: "Rien : $\\frac{1}{2}C_\\mathrm{MC}\\Delta V^2$ par front. Il abaisse la crête et la fréquence, l'énergie est dissipée plus lentement." },
      { categorie: "Blindage", question: "Comment raccorder l'écran d'un câble moteur ?", reponse: "Par un collier $360$ degrés sur une plaque nue, aux deux extrémités, sans queue de cochon, avec des masses maillées." },
      { categorie: "Diagnostic", question: "Premier geste face à une perturbation liée à un variateur ?", reponse: "Vérifier qu'elle disparaît variateur arrêté, puis mesurer le courant de mode commun à la pince sur les trois phases et sur les câbles de la victime." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["Z_0 = √(6e-6 / 15e-9) = 20 Ω", "crête ≈ ΔV / Z_0 = 180 / 20", "= 9 A"], "Crête du courant de mode commun."),
  etapes(["énergie par front = ½ C ΔV²", "indépendante de L et de R", "le tore étale le courant, pas l'énergie"], "Tore et énergie."),
  etapes(["queue de cochon : 100 nH, plusieurs volts", "collier 360° : environ 1 nH", "retour sur tout le pourtour"], "Raccordement d'écran."),
  etapes(["R_f ≤ E_on² / P_g,max", "= 760² / 20 000", "= 28,9 Ω"], "Résistance de freinage maximale."),
  etapes(["W = ½ × 1,1 mF × (800² - 540²)", "= 0,55e-3 × 348 400", "= 192 J"], "Réserve du bus."),
  etapes(["V_d0 = 1,3505 × 400 = 540,2 V", "V = V_d0 cos 120°", "= -270,1 V : fonctionnement en onduleur"], "Pont PD3 à thyristors."),
  etapes(["Q = √3 (W_1 - W_2)", "= 1,732 × (12 - 6)", "= 10,39 kvar"], "Méthode des deux wattmètres."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Boucle de mode commun de $6\\ \\mu\\mathrm{H}$ et $15\\ \\mathrm{nF}$, saut très raide de $180\\ \\mathrm{V}$. Crête du courant, en ampères ?</p>",
        valeur: 180 / Math.sqrt(6e-6 / 15e-9),
        unite: "A",
        tolerance: 0.02,
        explication: "$Z_0 = \\sqrt{6 \\times 10^{-6}/15 \\times 10^{-9}} = 20\\ \\Omega$ ; $180/20 = 9\\ \\mathrm{A}$.",
        resume: "Crête de mode commun",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Un tore de mode commun réduit l'énergie dissipée à chaque front de commutation.</p>",
        reponse: false,
        explication: "L'énergie par front vaut $\\frac{1}{2}C_\\mathrm{MC}\\Delta V^2$, indépendante de l'inductance : le tore réduit la crête et la fréquence, pas l'énergie.",
        resume: "Tore et énergie",
      },
      {
        type: "courte",
        enonce: repere(2) + "<p>Cette séance. Pourquoi raccorde-t-on l'écran d'un câble moteur par un collier sur tout son pourtour plutôt que par une queue de cochon ?</p>",
        motsCles: [["inductance", "impedance", "nh"], ["tension", "di/dt", "chute"], ["pourtour", "360", "court", "retour"]],
        minimum: 2,
        explication: "La queue de cochon a une inductance d'environ $100\\ \\mathrm{nH}$ : le courant de mode commun y crée plusieurs volts ; le collier offre un retour court sur tout le pourtour, d'environ $1\\ \\mathrm{nH}$.",
        resume: "Collier 360 degrés",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Convertisseurs et moteurs. Hacheur de freinage enclenché à $760\\ \\mathrm{V}$, puissance de freinage crête de $20\\ \\mathrm{kW}$. Résistance maximale, en ohms ?</p>",
        valeur: (760 * 760) / 20000,
        unite: "Ω",
        tolerance: 0.02,
        explication: "$R_f \\le 760^2/20\\,000 = 28{,}9\\ \\Omega$.",
        resume: "Résistance de freinage",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Cours Convertisseurs et moteurs. Énergie qu'un bus de $1{,}1\\ \\mathrm{mF}$ peut absorber entre $540$ et $800\\ \\mathrm{V}$, en joules ?</p>",
        valeur: 0.5 * 1.1e-3 * (800 * 800 - 540 * 540),
        unite: "J",
        tolerance: 0.02,
        explication: "$\\frac{1}{2} \\times 1{,}1 \\times 10^{-3} \\times (800^2 - 540^2) = 192\\ \\mathrm{J}$.",
        resume: "Réserve du bus",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Thyristors et redresseurs commandés. Pont PD3 à thyristors sur un réseau de $400\\ \\mathrm{V}$ entre phases, angle de retard $120$ degrés. Tension moyenne de sortie, en volts ?</p>",
        valeur: ((3 * Math.SQRT2 * 400) / Math.PI) * Math.cos((120 * Math.PI) / 180),
        unite: "V",
        tolerance: 0.02,
        explication: "$V_{d0}\\cos\\alpha = 540{,}2 \\times \\cos 120^\\circ = -270{,}1\\ \\mathrm{V}$ : le pont fonctionne en onduleur et peut renvoyer de l'énergie au réseau.",
        resume: "Redresseur commandé",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Puissance en triphasé. Méthode des deux wattmètres sur une charge équilibrée : $W_1 = 12\\ \\mathrm{kW}$, $W_2 = 6\\ \\mathrm{kW}$. Valeur absolue de la puissance réactive, en kvar ?</p>",
        valeur: Math.sqrt(3) * 6,
        unite: "kvar",
        tolerance: 0.02,
        explication: "$|Q| = \\sqrt{3}\\,|W_1 - W_2| = 1{,}732 \\times 6 = 10{,}39\\ \\mathrm{kvar}$ ; $P = W_1 + W_2 = 18\\ \\mathrm{kW}$.",
        resume: "Deux wattmètres",
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
    titre: "Où en suis-je sur la compatibilité électromagnétique ?",
  });
  if (auto) ressources.push(auto);
}
