/* ==========================================================================
   cours/conversion-analogique-numerique/cours.js
   Conversion analogique-numérique : repliement manipulable (point déplaçable
   sur l'axe des fréquences, lecteur au ralenti), quantification et moyennage,
   filtre anti-repliement, convertisseur à approximations successives pas à
   pas, comparaison des cartes de la station de pesée, exercices, quiz, cartes,
   révision espacée et auto-évaluation.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const PE = 10;

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

function signe(api, valeur, decimales) {
  return (valeur > 0 ? "+" : "") + nb(api, valeur, decimales);
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

function ligneH(c, repere, couleurs, y, libelle, motif = [7, 5], aGauche = false) {
  const py = repere.versY(y);
  if (!Number.isFinite(py) || py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.setLineDash(motif);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(repere.boite.x, py);
  c.lineTo(repere.boite.x + repere.boite.l, py);
  c.stroke();
  c.setLineDash([]);
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    c.textAlign = aGauche ? "left" : "right";
    c.fillText(libelle, aGauche ? repere.boite.x + 4 : repere.boite.x + repere.boite.l - 4, py - 6);
  }
  c.restore();
}

function ligneV(c, repere, couleurs, x, motif = [1, 3], libelle, enBas = false, epaisseur = 1.3) {
  const px = repere.versX(x);
  if (!Number.isFinite(px) || px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  c.save();
  c.setLineDash(motif);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = epaisseur;
  c.beginPath();
  c.moveTo(px, repere.boite.y);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  if (libelle) {
    c.setLineDash([]);
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    c.textAlign = px > repere.boite.x + repere.boite.l * 0.7 ? "right" : "left";
    c.fillText(libelle, px + (c.textAlign === "right" ? -5 : 5), enBas ? repere.boite.y + repere.boite.h - 8 : repere.boite.y + 14);
  }
  c.restore();
}

/** Petits disques aux points donnés, couleur du texte des simulations. */
function disques(c, repere, couleurs, points, rayon = 3.2) {
  c.save();
  c.fillStyle = couleurs.texte;
  for (const [x, y] of points) {
    const px = repere.versX(x);
    const py = repere.versY(y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    if (px < repere.boite.x - 2 || px > repere.boite.x + repere.boite.l + 2) continue;
    c.beginPath();
    c.arc(px, py, rayon, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
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
function dessinEtapes(lignes, largeur = 660) {
  const hauteur = 30 + lignes.length * 22;
  return (
    TRAITS + ' stroke-width="1.4"><rect x="6" y="6" width="' + (largeur - 12) + '" height="' + (hauteur - 12) + '" rx="8"/></g>' +
    ECRITS + lignes.map((ligne, i) => texte(22, 32 + i * 22, ligne)).join("") + "</g>"
  );
}

function etapes(lignes, legende, largeur = 660) {
  return { viewBox: "0 0 " + largeur + " " + (30 + lignes.length * 22), dessin: dessinEtapes(lignes, largeur), legende };
}

function correctionEtapes(lignes, legende, largeur = 660) {
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
   Modèles
   -------------------------------------------------------------------------- */

/** Fréquence apparente après échantillonnage, et inversion de phase. */
function repli(f, fe) {
  const k = Math.round(f / fe);
  const d = f - k * fe;
  return { fa: Math.abs(d), k, inverse: d < -1e-9 };
}

/** Générateur pseudo-aléatoire congruentiel, graine fixe. */
function generateur(graine) {
  let etat = graine >>> 0;
  return () => {
    etat = (Math.imul(etat, 1664525) + 1013904223) >>> 0;
    return etat / 4294967296;
  };
}

function gauss(alea) {
  let u = alea();
  if (u < 1e-12) u = 1e-12;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * alea());
}

/**
 * Conversion d'une période de sinusoïde à 50 Hz : N bits, niveau en dBFS,
 * bruit gaussien en pas, moyenne de M conversions par point affiché. Le
 * signal est supposé lent devant la cadence de conversion : les M
 * conversions d'un paquet portent sur la même valeur, seul le bruit change.
 */
function simulerQuantif(n, adb, sigma, m, points = 512) {
  const codes = Math.pow(2, n);
  const q = PE / codes;
  const centre = ((codes - 1) * q) / 2;
  const amplitude = Math.pow(10, adb / 20) * centre;
  const alea = generateur(20261127);
  const entree = [];
  const sortie = [];
  const erreur = [];
  let somme2 = 0;
  for (let k = 0; k < points; k += 1) {
    /* Signal lent devant la cadence de conversion : M conversions de la même valeur. */
    const xm = centre + amplitude * Math.sin((2 * Math.PI * (k + 0.5)) / points);
    let sQ = 0;
    for (let j = 0; j < m; j += 1) {
      const brut = xm / q + sigma * gauss(alea);
      const code = Math.min(codes - 1, Math.max(0, Math.round(brut)));
      sQ += code * q;
    }
    const y = sQ / m;
    const e = y - xm;
    somme2 += e * e;
    const t0 = (k / points) * 20;
    const t1 = ((k + 1) / points) * 20;
    entree.push([(t0 + t1) / 2, xm]);
    sortie.push([t0, y], [t1, y]);
    erreur.push([(t0 + t1) / 2, e / q]);
  }
  const eeff = Math.sqrt(somme2 / points);
  const snr = 10 * Math.log10((amplitude * amplitude) / 2 / (eeff * eeff));
  return { q, entree, sortie, erreur, eeffLsb: eeff / q, snr, snrTh: 6.02 * n + 1.76 + adb };
}

/** Pesée binaire d'un convertisseur à approximations successives. */
function sar(ve, n) {
  const q = PE / Math.pow(2, n);
  let code = 0;
  const pas = [];
  for (let k = 1; k <= n; k += 1) {
    const poids = Math.pow(2, n - k);
    const essai = code + poids;
    const vcna = (essai - 0.5) * q;
    const garde = ve >= vcna;
    if (garde) code = essai;
    pas.push({ k, poids, essai, vcna, garde, code });
  }
  return { q, code, pas };
}

/** Atténuation d'un Butterworth d'ordre n, en décibels positifs. */
function attenuation(f, fc, n) {
  return 10 * Math.log10(1 + Math.pow(f / fc, 2 * n));
}

/* --------------------------------------------------------------------------
   Initialisation et nettoyage
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  detruire();
  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireRepliement(racine, api);
  construireQuantification(racine, api);
  construireAntiRepliement(racine, api);
  construireSar(racine, api);
  construireComparaison(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  ressources.push(
    api.reveler(racine.querySelectorAll(".formule-cle, .encadre, #f-comparatif, #e-statut-tableau, #h-tableau, #j-tableau"), {
      decalage: 0.05,
    })
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
    ["#e-spectre-figure svg", 2.2],
    ["#e-quantif-figure svg", 2.2],
    ["#e-eb-figure svg", 2.4],
    ["#e-sd-figure svg", 2],
    ["#f-schema-principal svg", 2.8],
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
      id: "c1-pas",
      titre: "Pas d'une entrée de 12 bits",
      niveau: "fondamental",
      enonce: "<p>Une entrée de $0$-$10\\ \\mathrm{V}$ est convertie sur $12$ bits. Combien de niveaux distingue-t-elle, et quel est l'écart de tension entre deux niveaux voisins, en millivolts ?</p>",
      valeur: (10 / 4096) * 1000,
      unite: "mV",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Écart entre niveaux",
      etapes: [
        { texte: "$2^{12} = 4096$ niveaux, codés de $0$ à $4095$." },
        { texte: "$10\\ \\mathrm{V}/4096 = 2{,}441\\ \\mathrm{mV}$." },
        { texte: "Chaque bit de plus divise cet écart par deux : $1{,}221\\ \\mathrm{mV}$ à $13$ bits, $0{,}153\\ \\mathrm{mV}$ à $16$ bits.", note: "C'est le pas de quantification $q$ de la section E." },
      ],
      visuelCorrection: correctionEtapes(["2¹² = 4096 niveaux, codes 0 à 4095", "q = 10 V / 4096 = 2,441 mV", "16 bits : q = 10 V / 65 536 = 0,153 mV"], "Un bit de plus, un pas deux fois plus fin."),
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-efficace",
      titre: "Valeur efficace d'une sinusoïde à pleine échelle",
      niveau: "fondamental",
      enonce: "<p>Une sinusoïde occupe toute l'étendue $0$-$10\\ \\mathrm{V}$ : elle oscille entre $0$ et $10\\ \\mathrm{V}$ autour de $5\\ \\mathrm{V}$. Quelle est la valeur efficace de sa composante alternative, en volts ?</p>",
      valeur: 5 / Math.SQRT2,
      unite: "V",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Valeur efficace",
      etapes: [
        { texte: "Amplitude : $A = (10 - 0)/2 = 5\\ \\mathrm{V}$." },
        { texte: "Valeur efficace : $A/\\sqrt 2 = 3{,}536\\ \\mathrm{V}$." },
        { texte: "Elle servira au numérateur du rapport signal sur bruit idéal.", note: "La composante continue de $5\\ \\mathrm{V}$ n'entre pas dans le calcul." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Sinusoïde à pleine échelle et sa valeur efficace",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 20,
          yMin: -0.5,
          yMax: 10.5,
          series: [{ id: "s", nom: "5 + 5 sin(2π 50 t)", fonction: (t) => 5 + 5 * Math.sin((2 * Math.PI * t) / 20) }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 5 + 5 / Math.SQRT2, "5 V + 3,536 V", [7, 5]);
            ligneH(c, r, couleurs, 5, "composante continue", [1, 3], true);
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c3-tau",
      titre: "Combien de constantes de temps ?",
      niveau: "fondamental",
      enonce: "<p>Un condensateur se charge à travers une résistance. Combien de constantes de temps faut-il pour que l'écart à la valeur finale passe sous $1/8192$ de l'écart initial ?</p>",
      valeur: Math.log(8192),
      unite: "τ",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Nombre de constantes de temps",
      etapes: [
        { texte: "L'écart vaut $e^{-t/\\tau}$ fois l'écart initial ; on veut $e^{-t/\\tau} \\leq 1/8192$." },
        { texte: "$t/\\tau \\geq \\ln 8192 = 13\\ln 2 = 9{,}01$." },
        { texte: "$1/8192 = 2^{-13}$ est un demi-pas de $12$ bits : c'est le temps d'acquisition d'un bloqueur de $12$ bits.", note: "Pour $16$ bits : $17\\ln 2 = 11{,}8$ constantes de temps." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Écart relatif à la valeur finale, en bits résolus",
          xTitre: "temps",
          xUnite: "τ",
          yTitre: "bits résolus",
          yUnite: "",
          xMin: 0,
          xMax: 14,
          yMin: 0,
          yMax: 20,
          series: [{ id: "b", nom: "log₂(1 / écart) = t / (τ ln 2)", fonction: (t) => t / Math.LN2 }],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 13, "13 bits, soit q/2 à 12 bits", [7, 5], true);
            ligneV(c, r, couleurs, Math.log(8192), [1, 3], "9,01 τ", true);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Repliement : point déplaçable, curseurs, lecteur, tracé, valeurs
   -------------------------------------------------------------------------- */

function construireRepliement(racine, api) {
  const conteneur = racine.querySelector("#d-repliement-vivant");
  if (!conteneur) return;
  const X0 = 60;
  const LFE = 220;
  const YB = 190;
  const ECH = 240;
  const etat = { r: 0.9, fe: 100, phase: 30, t0: 0 };

  const svg = svgEl("svg", {
    viewBox: "0 0 760 252",
    role: "img",
    "aria-label": "Diagramme en accordéon de la fréquence apparente en fonction de la fréquence réelle, avec un point déplaçable sur l'axe des fréquences",
  });
  const decor = svgEl("g");
  let d = "<defs>" + marqueur("d-re-fl") + "</defs>" + TRAITS + ' stroke-width="1.7">';
  d += '<path d="M50 190H738" marker-end="url(#d-re-fl)" stroke-width="1.3"/>';
  d += '<path d="M60 200V46" marker-end="url(#d-re-fl)" stroke-width="1.3"/>';
  d += '<path d="M60 190L170 70L280 190L390 70L500 190L610 70L720 190" stroke-width="2.2"/>';
  d += '<path d="M56 70H64" stroke-width="1.2"/>';
  for (let i = 1; i <= 6; i += 1) d += '<path d="M' + (X0 + 110 * i) + ' 190V196" stroke-width="1.2"/>';
  d += '<path d="M60 228H720" stroke-dasharray="2 5" stroke-width="1.1"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  const graduations = ["0", "fe/2", "fe", "3fe/2", "2fe", "5fe/2", "3fe"];
  graduations.forEach((g, i) => {
    d += texte(X0 + 110 * i - (i === 0 ? 4 : 12), 210, g);
  });
  d += texte(14, 74, "fe/2") + texte(70, 44, "fréquence apparente fa") + texte(742, 194, "f");
  d += texte(96, 132, "zone 1") + texte(196, 132, "zone 2") + texte(306, 132, "zone 3") + texte(416, 132, "zone 4") + texte(526, 132, "zone 5") + texte(636, 132, "zone 6");
  d += texte(60, 248, "point déplaçable : fréquence réelle f du signal");
  d += "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const guides = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.4", "stroke-dasharray": "6 4" });
  const point = svgEl("circle", { r: "5", fill: "currentColor", stroke: "none" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "12" });
  svg.append(guides, point, libelles);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#d-repliement-valeurs", [
    { id: "f", libelle: "Fréquence réelle f", format: (v) => v },
    { id: "nyq", libelle: "Fréquence de Nyquist fe/2", format: (v) => v },
    { id: "fa", libelle: "Fréquence apparente fa = |f - k fe|", format: (v) => v },
    { id: "k", libelle: "Entier k et zone de Nyquist", format: (v) => v },
    { id: "sens", libelle: "Phase de la sinusoïde apparente", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  const NB = 40;
  const trace = api.sim.traceur("#d-repliement-trace", {
    titre: "Signal réel, échantillons et sinusoïde apparente",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "v / A",
    yUnite: "",
    xMin: 0,
    xMax: 400,
    yMin: -1.3,
    yMax: 1.3,
    ratio: 0.42,
    echantillons: 2400,
    series: [
      { id: "reel", nom: "signal réel", epaisseur: 1.2 },
      { id: "app", nom: "sinusoïde apparente", epaisseur: 2.2 },
      { id: "bloq", nom: "valeur bloquée", epaisseur: 1.6 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      const te = 1 / etat.fe;
      const debut = Math.ceil(etat.t0 / te - 1e-9);
      const pts = [];
      for (let n = debut; n <= debut + NB; n += 1) {
        const t = n * te;
        pts.push([t * 1000, Math.sin(2 * Math.PI * etat.r * etat.fe * t + (etat.phase * Math.PI) / 180)]);
      }
      disques(c, r, couleurs, pts, 3.4);
      ligneH(c, r, couleurs, 0, "", [1, 3]);
    },
  });
  if (trace) ressources.push(trace);

  function rendreSvg() {
    const fe = etat.fe;
    const f = etat.r * fe;
    const res = repli(f, fe);
    const x = X0 + LFE * etat.r;
    const y = YB - (res.fa / fe) * ECH;
    guides.setAttribute("d", "M" + x.toFixed(1) + " 228V" + y.toFixed(1) + "H" + X0);
    point.setAttribute("cx", x.toFixed(1));
    point.setAttribute("cy", y.toFixed(1));
    const aDroite = x < 520;
    libelles.innerHTML =
      texte(66, y - 8, "fa = " + nb(api, res.fa, 1) + " Hz") +
      texte(aDroite ? x + 10 : x - 140, Math.min(184, y + 22), "f = " + nb(api, f, 1) + " Hz");
    if (valeurs) {
      const zone = Math.min(6, Math.floor(etat.r * 2 + 1e-9) + 1);
      valeurs.maj({
        f: nb(api, f, 1) + " Hz, soit " + nb(api, etat.r, 2) + " fe",
        nyq: nb(api, fe / 2, 1) + " Hz",
        fa: nb(api, res.fa, 2) + " Hz",
        k: "k = " + res.k + ", zone " + zone,
        sens:
          res.fa < 1e-9
            ? "fréquence nulle : constante, valeur fixée par la phase"
            : Math.abs(res.fa - fe / 2) < 1e-9
              ? "à fe/2 : échantillons alternés d'amplitude A |sin φ|"
              : res.inverse
                ? "inversée : la sinusoïde apparente progresse à l'envers"
                : "conservée",
      });
    }
  }

  function rendreTrace() {
    if (!trace) return;
    const fe = etat.fe;
    const te = 1 / fe;
    const f = etat.r * fe;
    const res = repli(f, fe);
    const ph = (etat.phase * Math.PI) / 180;
    const d = f - res.k * fe;
    const t0 = etat.t0;
    trace.definirPlage({ xMin: t0 * 1000, xMax: (t0 + NB * te) * 1000 });
    trace.definirFonction("reel", (tms) => Math.sin(2 * Math.PI * f * tms * 1e-3 + ph));
    trace.definirFonction("app", (tms) => Math.sin(2 * Math.PI * d * tms * 1e-3 + ph));
    const pts = [];
    const debut = Math.floor(t0 / te);
    for (let n = debut; n <= debut + NB + 1; n += 1) {
      const t = n * te;
      const v = Math.sin(2 * Math.PI * f * t + ph);
      pts.push([t * 1000, v], [(t + te) * 1000, v]);
    }
    trace.definirDonnees("bloq", pts);
  }

  function rendre() {
    rendreSvg();
    rendreTrace();
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: X0, y: 228 },
    a: { x: X0 + 3 * LFE, y: 228 },
    min: 0,
    max: 3,
    pas: 0.01,
    valeur: etat.r,
    libelle: "Fréquence réelle du signal",
    format: (m) => "f = " + nb(api, (typeof m === "number" ? m : m.valeur) * etat.fe, 1) + " Hz",
    rappel(m) {
      etat.r = typeof m === "number" ? m : m.valeur;
      rendre();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-repliement-curseurs",
    [
      { id: "fe", libelle: "Fréquence d'échantillonnage fe", min: 50, max: 1000, pas: 10, valeur: etat.fe, unite: "Hz" },
      { id: "phase", libelle: "Phase initiale φ du signal", min: 0, max: 180, pas: 5, valeur: etat.phase, unite: "°" },
    ],
    (v) => {
      etat.fe = v.fe;
      etat.phase = v.phase;
      rendre();
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-repliement-lecteur", {
    de: 0,
    a: 2,
    duree: 20,
    boucle: true,
    auto: false,
    libelle: "Temps au ralenti, dix fois plus lent",
    rappel: (t) => {
      etat.t0 = t;
      rendreTrace();
    },
  });
  if (lecteur) ressources.push(lecteur);
  rendre();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.6 }));
}

/* --------------------------------------------------------------------------
   E. Quantification, bruit et moyennage : curseurs, deux tracés, valeurs
   -------------------------------------------------------------------------- */

const MOYENNES = [1, 4, 16, 64, 256];

function construireQuantification(racine, api) {
  if (!racine.querySelector("#e-quantif-trace")) return;
  const etat = { n: 8, adb: 0, sigma: 0, m: 0 };

  const trace = api.sim.traceur("#e-quantif-trace", {
    titre: "Entrée analogique et sortie numérique ramenée en volts",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "tension",
    yUnite: "V",
    xMin: 0,
    xMax: 20,
    yMin: -0.3,
    yMax: 10.3,
    ratio: 0.4,
    series: [
      { id: "e", nom: "entrée analogique", epaisseur: 1.4 },
      { id: "s", nom: "sortie numérique, en escalier", epaisseur: 2 },
    ],
  });
  if (trace) ressources.push(trace);

  let echelle = 0.6;
  const traceErreur = api.sim.traceur("#e-quantif-erreur", {
    titre: "Erreur de conversion, en pas de quantification",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "erreur",
    yUnite: "pas",
    xMin: 0,
    xMax: 20,
    yMin: -0.6,
    yMax: 0.6,
    ratio: 0.3,
    series: [{ id: "err", nom: "erreur = sortie - entrée", epaisseur: 1.4 }],
    surDessin({ c, repere: r, couleurs }) {
      if (echelle < 3) {
        ligneH(c, r, couleurs, 0.5, "+q/2", [1, 3], true);
        ligneH(c, r, couleurs, -0.5, "-q/2", [1, 3], true);
      }
    },
  });
  if (traceErreur) ressources.push(traceErreur);

  const valeurs = api.sim.valeurs("#e-quantif-valeurs", [
    { id: "q", libelle: "Pas q = 10 V / 2^N", format: (v) => v },
    { id: "eeff", libelle: "Erreur efficace mesurée, référence q/√12 = 0,289 pas", format: (v) => v },
    { id: "snr", libelle: "SNR mesuré", format: (v) => v },
    { id: "th", libelle: "SNR idéal 6,02 N + 1,76 + niveau", format: (v) => v },
    { id: "enob", libelle: "Bits effectifs (SNR - 1,76) / 6,02", format: (v) => v },
    { id: "gain", libelle: "Gain du moyennage par rapport à M = 1", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function recalculer() {
    const m = MOYENNES[etat.m];
    const res = simulerQuantif(etat.n, etat.adb, etat.sigma, m);
    const seul = m === 1 ? res : simulerQuantif(etat.n, etat.adb, etat.sigma, 1);
    if (trace) {
      trace.definirDonnees("e", res.entree);
      trace.definirDonnees("s", res.sortie);
    }
    if (traceErreur) {
      let max = 0;
      for (const [, e] of res.erreur) max = Math.max(max, Math.abs(e));
      echelle = Math.max(0.6, max * 1.15);
      traceErreur.definirPlage({ yMin: -echelle, yMax: echelle });
      traceErreur.definirDonnees("err", res.erreur);
    }
    if (valeurs) {
      const qmV = res.q * 1000;
      valeurs.maj({
        q: qmV >= 1 ? nb(api, qmV, 3) + " mV" : nb(api, qmV * 1000, 1) + " µV",
        eeff: nb(api, res.eeffLsb, 3) + " pas",
        snr: nb(api, res.snr, 1) + " dB",
        th: nb(api, res.snrTh, 1) + " dB, bruit ajouté non compris",
        enob: nb(api, (res.snr - 1.76) / 6.02, 2) + " bits",
        gain: m === 1 ? "sans objet, M = 1" : signe(api, res.snr - seul.snr, 1) + " dB pour M = " + m + ", attendu " + nb(api, 10 * Math.log10(m), 1) + " dB si le bruit suffit",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-quantif-curseurs",
    [
      { id: "n", libelle: "Nombre de bits N", min: 2, max: 16, pas: 1, valeur: etat.n },
      { id: "adb", libelle: "Niveau du signal", min: -40, max: 0, pas: 1, valeur: etat.adb, unite: "dBFS" },
      { id: "sigma", libelle: "Bruit ajouté avant conversion, écart-type", min: 0, max: 2, pas: 0.05, valeur: etat.sigma, unite: "pas", chiffres: 2 },
      { id: "m", libelle: "Échantillons moyennés M", min: 0, max: 4, pas: 1, valeur: etat.m, format: (v) => String(MOYENNES[Math.round(v)]) },
    ],
    (v) => {
      etat.n = Math.round(v.n);
      etat.adb = v.adb;
      etat.sigma = v.sigma;
      etat.m = Math.round(v.m);
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);
  recalculer();
}

/* --------------------------------------------------------------------------
   E. Filtre anti-repliement : curseurs, tracé, valeurs
   -------------------------------------------------------------------------- */

function construireAntiRepliement(racine, api) {
  if (!racine.querySelector("#e-aa-trace")) return;
  const etat = { fe: 1000, fB: 50, n: 2, fc: 100, bits: 12, fp: 950, ap: 1 };

  const trace = api.sim.traceur("#e-aa-trace", {
    titre: "Atténuation du filtre et image repliée",
    xTitre: "fréquence",
    xUnite: "Hz",
    yTitre: "gain",
    yUnite: "dB",
    xMin: 0,
    xMax: 2500,
    yMin: -130,
    yMax: 5,
    ratio: 0.42,
    echantillons: 800,
    series: [
      { id: "h", nom: "filtre à la fréquence lue", epaisseur: 2 },
      { id: "img", nom: "composantes repliées sur cette fréquence", epaisseur: 2 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      const objectif = -(6.02 * etat.bits + 1.76);
      ligneH(c, r, couleurs, objectif, "objectif " + nb(api, objectif, 1) + " dB", [7, 5]);
      ligneV(c, r, couleurs, etat.fB, [1, 3], "fB");
      ligneV(c, r, couleurs, etat.fe / 2, [1, 3], "fe/2");
      ligneV(c, r, couleurs, etat.fe - etat.fB, [1, 3], "fe - fB", true);
      ligneV(c, r, couleurs, etat.fp, [], "", false, 1.6);
      const res = repli(etat.fp, etat.fe);
      const px = r.versX(res.fa);
      const py = r.versY(-attenuation(etat.fp, etat.fc, etat.n));
      if (Number.isFinite(px) && Number.isFinite(py) && py >= r.boite.y && py <= r.boite.y + r.boite.h) {
        c.save();
        c.fillStyle = couleurs.texte;
        c.beginPath();
        c.moveTo(px, py - 7);
        c.lineTo(px + 7, py);
        c.lineTo(px, py + 7);
        c.lineTo(px - 7, py);
        c.closePath();
        c.fill();
        c.font = POLICE;
        c.textAlign = "left";
        c.fillText("perturbation repliée", px + 10, py + 4);
        c.restore();
      }
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-aa-valeurs", [
    { id: "att", libelle: "Atténuation à fe - fB, comparée à l'objectif", format: (v) => v },
    { id: "fa", libelle: "Fréquence apparente de la perturbation", format: (v) => v },
    { id: "res", libelle: "Perturbation après filtre", format: (v) => v },
    { id: "verdict", libelle: "Conséquence", format: (v) => v },
    { id: "bande", libelle: "Affaiblissement de la bande utile à fB", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function recalculer() {
    const objectif = 6.02 * etat.bits + 1.76;
    if (trace) {
      trace.definirPlage({ xMin: 0, xMax: 2.5 * etat.fe });
      trace.definirFonction("h", (f) => -attenuation(f, etat.fc, etat.n));
      trace.definirFonction("img", (f) => (f <= etat.fe / 2 ? -attenuation(etat.fe - f, etat.fc, etat.n) : NaN));
    }
    if (valeurs) {
      const a = attenuation(etat.fe - etat.fB, etat.fc, etat.n);
      const res = repli(etat.fp, etat.fe);
      const ap = attenuation(etat.fp, etat.fc, etat.n);
      const reste = etat.ap * Math.pow(10, -ap / 20);
      const q = PE / Math.pow(2, etat.bits);
      const lsb = reste / q;
      let verdict;
      if (etat.fp <= etat.fB) verdict = "la perturbation est dans la bande utile : aucun filtre ne la sépare du signal";
      else if (res.fa <= etat.fB && etat.fp > etat.fe / 2) verdict = lsb >= 0.5 ? "repliée dans la bande utile et visible : mesure faussée" : "repliée dans la bande utile mais sous le demi-pas";
      else if (etat.fp > etat.fe / 2) verdict = "repliée hors de la bande utile : un filtre numérique peut la retirer";
      else verdict = "non repliée, hors de la bande utile : un filtre numérique peut la retirer";
      const b = attenuation(etat.fB, etat.fc, etat.n);
      valeurs.maj({
        att: nb(api, a, 1) + " dB pour " + nb(api, objectif, 1) + " dB visés : " + (a >= objectif ? "suffisante" : "insuffisante"),
        fa: nb(api, res.fa, 1) + " Hz" + (etat.fp > etat.fe / 2 ? ", repliée" : ", non repliée"),
        res: (reste >= 1e-3 ? nb(api, reste * 1000, 2) + " mV" : nb(api, reste * 1e6, 1) + " µV") + ", soit " + nb(api, lsb, 2) + " pas",
        verdict,
        bande: nb(api, b, 3) + " dB, soit " + nb(api, (1 - Math.pow(10, -b / 20)) * 100, 2) + " %",
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-aa-curseurs",
    [
      { id: "fe", libelle: "Fréquence d'échantillonnage fe", min: 200, max: 10000, pas: 100, valeur: etat.fe, unite: "Hz" },
      { id: "fB", libelle: "Bande utile fB", min: 10, max: 200, pas: 5, valeur: etat.fB, unite: "Hz" },
      { id: "n", libelle: "Ordre du Butterworth", min: 1, max: 8, pas: 1, valeur: etat.n },
      { id: "fc", libelle: "Fréquence de coupure fc", min: 20, max: 2000, pas: 10, valeur: etat.fc, unite: "Hz" },
      { id: "bits", libelle: "Nombre de bits N", min: 8, max: 16, pas: 1, valeur: etat.bits },
      { id: "fp", libelle: "Fréquence de la perturbation", min: 50, max: 10000, pas: 10, valeur: etat.fp, unite: "Hz" },
      { id: "ap", libelle: "Amplitude crête de la perturbation", min: 0.01, max: 5, pas: 0.01, valeur: etat.ap, unite: "V", chiffres: 2 },
    ],
    (v) => {
      etat.fe = v.fe;
      etat.fB = v.fB;
      etat.n = Math.round(v.n);
      etat.fc = v.fc;
      etat.bits = Math.round(v.bits);
      etat.fp = v.fp;
      etat.ap = v.ap;
      recalculer();
    }
  );
  if (curseurs) ressources.push(curseurs);
  recalculer();
}

/* --------------------------------------------------------------------------
   E. Approximations successives : point déplaçable, lecteur, valeurs
   -------------------------------------------------------------------------- */

function construireSar(racine, api) {
  const conteneur = racine.querySelector("#e-sar-vivant");
  if (!conteneur) return;
  const Y0 = 260;
  const ECH = 22;
  const etat = { ve: 6.3, n: 8, etape: 0 };
  const vy = (v) => Y0 - v * ECH;

  const svg = svgEl("svg", {
    viewBox: "0 0 760 300",
    role: "img",
    "aria-label": "Conversion par approximations successives : tension d'entrée réglable, tension proposée à chaque étape et registre des bits",
  });
  const decor = svgEl("g");
  let d = "<defs>" + marqueur("e-sa-fl") + "</defs>" + TRAITS + ' stroke-width="1.6">';
  d += '<path d="M70 268V30" marker-end="url(#e-sa-fl)" stroke-width="1.3"/>';
  d += '<path d="M62 260H470" stroke-width="1.3"/>';
  for (let v = 0; v <= 10; v += 2.5) d += '<path d="M64 ' + vy(v).toFixed(1) + 'H70" stroke-width="1.2"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  for (let v = 0; v <= 10; v += 2.5) d += texte(20, vy(v) + 4, nb(api, v, 1) + " V");
  d += texte(78, 26, "tension proposée par le CNA interne") + texte(500, 26, "registre");
  d += texte(500, 200, "comparateur : ve ≥ vCNA ?") + texte(500, 216, "oui : bit gardé à 1") + texte(500, 232, "non : bit remis à 0");
  d += texte(14, 292, "point déplaçable : tension d'entrée ve, repérée au 0 V");
  d += "</g>";
  decor.innerHTML = d;
  svg.appendChild(decor);

  const ligneVe = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-dasharray": "7 5" });
  const barres = svgEl("g", { stroke: "currentColor", "stroke-linejoin": "round" });
  const registre = svgEl("g", { stroke: "currentColor", fill: "none" });
  const ecrits = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": "12" });
  svg.append(ligneVe, barres, registre, ecrits);
  conteneur.appendChild(svg);
  nettoyeurs.push(() => svg.remove());

  const valeurs = api.sim.valeurs("#e-sar-valeurs", [
    { id: "etape", libelle: "Étape", format: (v) => v },
    { id: "essai", libelle: "Code d'essai et tension proposée", format: (v) => v },
    { id: "decision", libelle: "Décision du comparateur", format: (v) => v },
    { id: "code", libelle: "Code final, décimal et binaire", format: (v) => v },
    { id: "err", libelle: "Tension du code et erreur", format: (v) => v },
  ]);
  if (valeurs) ressources.push(valeurs);

  function rendre() {
    const res = sar(etat.ve, etat.n);
    const n = etat.n;
    const etape = Math.min(n, Math.max(0, Math.floor(etat.etape + 1e-9)));
    ligneVe.setAttribute("d", "M70 " + vy(etat.ve).toFixed(1) + "H480");
    const largeurCase = 380 / n;
    const largeur = Math.min(30, largeurCase * 0.6);
    let b = "";
    let e = texte(484, vy(etat.ve) + 4, "ve");
    for (let i = 0; i < etape; i += 1) {
      const p = res.pas[i];
      const x = 90 + largeurCase * i + (largeurCase - largeur) / 2;
      const haut = vy(Math.min(PE, p.vcna));
      const courant = i === etape - 1;
      b +=
        '<rect x="' + x.toFixed(1) + '" y="' + haut.toFixed(1) + '" width="' + largeur.toFixed(1) + '" height="' + (Y0 - haut).toFixed(1) +
        '" fill="' + (p.garde ? "currentColor" : "none") + '" fill-opacity="0.35"' + (p.garde ? "" : ' stroke-dasharray="4 3"') +
        ' stroke-width="' + (courant ? 3 : 1.3) + '"/>';
      if (n <= 8 || i % 2 === 0) e += texte(x + largeur / 2 - 6, 278, "b" + (n - 1 - i));
    }
    barres.innerHTML = b;
    let r = "";
    const larg = Math.min(26, 236 / n);
    for (let i = 0; i < n; i += 1) {
      const x = 500 + larg * i;
      r += '<rect x="' + x.toFixed(1) + '" y="44" width="' + (larg - 3).toFixed(1) + '" height="30" rx="3" stroke-width="' + (i === etape - 1 ? 2.6 : 1.3) + '"/>';
      const bit = i < etape ? (res.pas[i].garde ? "1" : "0") : "?";
      e += texte(x + (larg - 3) / 2 - 4, 64, bit);
      if (n <= 8) e += texte(x + 1, 92, String(Math.pow(2, n - 1 - i)), ' font-size="9"');
    }
    registre.innerHTML = r;
    const provisoire = etape > 0 ? res.pas[etape - 1].code : 0;
    e += texte(500, 120, "code provisoire : " + provisoire);
    e += texte(500, 140, "q = " + nb(api, res.q * 1000, 2) + " mV");
    if (etape === n) {
      e += texte(500, 164, "code final : " + res.code + " = " + res.code.toString(2).padStart(n, "0"));
      e += texte(500, 182, "soit " + nb(api, res.code * res.q, 4) + " V");
    }
    ecrits.innerHTML = e;
    if (valeurs) {
      const p = etape > 0 ? res.pas[etape - 1] : null;
      const vcode = res.code * res.q;
      valeurs.maj({
        etape: etape + " sur " + n,
        essai: p ? p.essai + " : (" + p.essai + " - 0,5) q = " + nb(api, p.vcna, 4) + " V" : "aucun essai, registre à zéro",
        decision: p ? (p.garde ? "ve ≥ vCNA, bit de poids " + p.poids + " gardé" : "ve < vCNA, bit de poids " + p.poids + " remis à 0") : "en attente de la première comparaison",
        code: etape === n ? res.code + " = " + res.code.toString(2).padStart(n, "0") : "inconnu avant la dernière étape",
        err: etape === n ? nb(api, vcode, 4) + " V, erreur " + signe(api, (vcode - etat.ve) * 1000, 2) + " mV, q/2 = " + nb(api, res.q * 500, 2) + " mV" : "inconnues avant la dernière étape",
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: 70, y: Y0 },
    a: { x: 70, y: vy(PE) },
    min: 0,
    max: PE,
    pas: 0.01,
    valeur: etat.ve,
    libelle: "Tension d'entrée",
    format: (m) => "ve = " + nb(api, typeof m === "number" ? m : m.valeur, 2) + " V",
    rappel(m) {
      etat.ve = typeof m === "number" ? m : m.valeur;
      rendre();
    },
  });
  if (poignee) ressources.push(poignee);

  let lecteur = null;
  function creerLecteur() {
    if (lecteur) {
      try {
        lecteur.detruire();
      } catch (erreur) {
        /* lecteur déjà retiré */
      }
      ressources = ressources.filter((element) => element !== lecteur);
    }
    lecteur = api.sim.lecteur("#e-sar-lecteur", {
      de: 0,
      a: etat.n,
      duree: etat.n * 1.2,
      boucle: false,
      auto: false,
      libelle: "Étapes de la conversion",
      rappel: (t) => {
        etat.etape = t;
        rendre();
      },
    });
    if (lecteur) ressources.push(lecteur);
  }

  const curseurs = api.sim.curseurs("#e-sar-curseurs", [{ id: "n", libelle: "Nombre de bits N", min: 4, max: 10, pas: 1, valeur: etat.n }], (v) => {
    const n = Math.round(v.n);
    if (n !== etat.n) {
      etat.n = n;
      etat.etape = 0;
      creerLecteur();
    }
    rendre();
  });
  if (curseurs) ressources.push(curseurs);
  creerLecteur();
  rendre();
  ressources.push(api.dessiner(decor, { declencheur: conteneur, duree: 1.4 }));
}

/* --------------------------------------------------------------------------
   H. Comparaison des deux cartes
   -------------------------------------------------------------------------- */

function construireComparaison(racine, api) {
  if (!racine.querySelector("#h-comparaison-barres")) return;
  const barres = api.sim.spectre("#h-comparaison-barres", {
    titre: "Contributions de la conversion, station de pesée",
    genre: "Comparaison",
    description: "Contribution à la résolution utile, en kilogrammes, pour chaque carte",
    yTitre: "contribution",
    unite: "kg",
    xTitre: "contribution et carte",
    barres: [
      { etiquette: "q/2 12b", valeur: 0.305, couleur: "serie-1" },
      { etiquette: "q/2 16b", valeur: 0.019, couleur: "serie-2" },
      { etiquette: "biais 12b", valeur: 0.116, couleur: "serie-1" },
      { etiquette: "biais 16b", valeur: 0.00002, couleur: "serie-2" },
      { etiquette: "σ 12b", valeur: 0.061, couleur: "serie-1" },
      { etiquette: "σ 16b", valeur: 0.02, couleur: "serie-2" },
      { etiquette: "50 Hz 12b", valeur: 0.25, couleur: "serie-1" },
      { etiquette: "50 Hz 16b", valeur: 0.0005, couleur: "serie-2" },
    ],
    mesures: [
      { nom: "Exigence", valeur: "0,1 kg pour chaque contribution" },
      { nom: "Carte de 12 bits", valeur: "trois contributions au-dessus de l'exigence" },
      { nom: "Carte de 16 bits", valeur: "toutes sous 0,02 kg" },
    ],
  });
  if (barres) ressources.push(barres);
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : pas d'une carte bipolaire */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-pas",
      titre: "Pas d'une carte bipolaire",
      niveau: "fondamental",
      enonce: "<p>Une carte d'entrée accepte $-10$ à $+10\\ \\mathrm{V}$ et code sur $16$ bits. Quel est son pas de quantification, en microvolts ? La correction en déduit l'erreur efficace de quantification.</p>",
      valeur: (20 / 65536) * 1e6,
      unite: "µV",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Pas q",
      etapes: [
        { texte: "Pleine échelle : $PE = 10 - (-10) = 20\\ \\mathrm{V}$." },
        { texte: "$q = 20/2^{16} = 20/65\\,536 = 305{,}2\\ \\mathrm{\\mu V}$." },
        { texte: "Erreur efficace : $q/\\sqrt{12} = 88{,}1\\ \\mathrm{\\mu V}$.", note: "Une carte bipolaire perd un facteur deux de résolution sur un signal unipolaire : la moitié des codes ne sert jamais." },
      ],
      visuelCorrection: correctionEtapes(["PE = 10 - (-10) = 20 V", "q = 20 V / 65 536 = 305,2 µV", "q / √12 = 88,1 µV efficaces", "signal 0-10 V : la moitié des codes reste inutilisée"], "Pas d'une entrée bipolaire."),
    })
  );

  /* Fondamental 2 : fréquence apparente */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-repli",
      titre: "Vibration échantillonnée trop lentement",
      niveau: "fondamental",
      enonce: "<p>Un accéléromètre placé sur un palier vibre à $180\\ \\mathrm{Hz}$ ; son signal est échantillonné à $200\\ \\mathrm{Hz}$ sans filtre. À quelle fréquence la vibration apparaît-elle dans les données, en hertz ?</p>",
      valeur: 20,
      unite: "Hz",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "Fréquence apparente",
      etapes: [
        { texte: "$f_e/2 = 100\\ \\mathrm{Hz} < 180\\ \\mathrm{Hz}$ : il y a repliement." },
        { texte: "$k = \\operatorname{arrondi}(180/200) = 1$ ; $f_a = |180 - 200| = 20\\ \\mathrm{Hz}$, phase inversée." },
        { texte: "Une vibration rapide se présente comme une oscillation lente de $20\\ \\mathrm{Hz}$ : un diagnostic vibratoire conclurait à un défaut qui n'existe pas.", note: "Il faut $f_e$ de plusieurs fois $180\\ \\mathrm{Hz}$ et un filtre anti-repliement." },
      ],
      visuelCorrection(conteneur, moteur) {
        const te = 1 / 200;
        traceCorrection(moteur, conteneur, {
          titre: "180 Hz échantillonné à 200 Hz : les points dessinent 20 Hz",
          xTitre: "temps",
          xUnite: "ms",
          yTitre: "v / A",
          yUnite: "",
          xMin: 0,
          xMax: 60,
          yMin: -1.3,
          yMax: 1.3,
          echantillons: 1200,
          series: [
            { id: "r", nom: "vibration réelle, 180 Hz", epaisseur: 1.1, fonction: (t) => Math.sin(2 * Math.PI * 180 * t * 1e-3 + 0.6) },
            { id: "a", nom: "sinusoïde apparente, 20 Hz", epaisseur: 2.2, fonction: (t) => Math.sin(-2 * Math.PI * 20 * t * 1e-3 + 0.6) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            const pts = [];
            for (let n = 0; n <= 12; n += 1) pts.push([n * te * 1000, Math.sin(2 * Math.PI * 180 * n * te + 0.6)]);
            disques(c, r, couleurs, pts, 3.6);
          },
        });
      },
    })
  );

  /* Intermédiaire 1 : bits effectifs */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-enob",
      titre: "Ce que valent vraiment seize bits",
      niveau: "intermédiaire",
      enonce: "<p>La fiche d'une carte de $16$ bits indique un SINAD de $82\\ \\mathrm{dB}$ pour une sinusoïde à pleine échelle. Combien de bits effectifs offre-t-elle ? La correction en déduit l'écart-type de bruit sur une étendue de $20\\ \\mathrm{V}$.</p>",
      valeur: (82 - 1.76) / 6.02,
      unite: "bits",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "ENOB",
      etapes: [
        { texte: "$\\mathrm{ENOB} = (82 - 1{,}76)/6{,}02 = 13{,}33$ bits." },
        { texte: "Pas équivalent : $20\\ \\mathrm{V}/2^{13{,}33} = 1{,}94\\ \\mathrm{mV}$ ; bruit efficace équivalent $1{,}94/\\sqrt{12} = 0{,}56\\ \\mathrm{mV}$." },
        { texte: "Les trois derniers bits environ sont du bruit : utiles seulement après moyennage.", note: "Le SINAD dépend de la fréquence et du niveau d'essai : à lire dans les conditions de l'application." },
      ],
      visuelCorrection: correctionEtapes(["ENOB = (SINAD - 1,76) / 6,02 = (82 - 1,76) / 6,02", "= 13,33 bits sur 16", "pas équivalent : 20 V / 2^13,33 = 1,94 mV", "bruit équivalent : 1,94 mV / √12 = 0,56 mV"], "Des bits écrits aux bits utiles."),
    })
  );

  /* Intermédiaire 2 : ordre du filtre anti-repliement */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-ordre",
      titre: "Ordre d'un filtre anti-repliement",
      niveau: "intermédiaire",
      enonce: "<p>Une mesure de bande utile $50\\ \\mathrm{Hz}$ est échantillonnée à $1\\ \\mathrm{kHz}$. Le filtre anti-repliement est un Butterworth coupé à $100\\ \\mathrm{Hz}$ ; toute composante qui se replierait dans la bande utile doit être atténuée d'au moins $60\\ \\mathrm{dB}$. Quel ordre minimal faut-il ?</p>",
      valeur: 4,
      unite: "",
      tolerance: 0.001,
      chiffres: 2,
      libelleChamp: "Ordre n",
      etapes: [
        { texte: "La plus basse fréquence qui se replie dans $[0, 50]\\ \\mathrm{Hz}$ est $f_e - f_B = 950\\ \\mathrm{Hz}$, soit $9{,}5f_c$." },
        { texte: "$A = 10\\log_{10}(1 + 9{,}5^{2n})$ : $n = 2$ donne $39{,}1\\ \\mathrm{dB}$, $n = 3$ donne $58{,}7\\ \\mathrm{dB}$, $n = 4$ donne $78{,}2\\ \\mathrm{dB}$." },
        { texte: "Il faut $n = 4$ ; l'affaiblissement à $50\\ \\mathrm{Hz}$ n'est alors que de $0{,}017\\ \\mathrm{dB}$.", note: "Échantillonner à $10\\ \\mathrm{kHz}$ permettrait de garder un second ordre : $79{,}9\\ \\mathrm{dB}$ à $9950\\ \\mathrm{Hz}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Atténuation des Butterworth coupés à 100 Hz",
          xTitre: "fréquence",
          xUnite: "Hz",
          yTitre: "gain",
          yUnite: "dB",
          xMin: 0,
          xMax: 1200,
          yMin: -100,
          yMax: 5,
          series: [
            { id: "n2", nom: "ordre 2", fonction: (f) => -attenuation(f, 100, 2) },
            { id: "n3", nom: "ordre 3", fonction: (f) => -attenuation(f, 100, 3) },
            { id: "n4", nom: "ordre 4", fonction: (f) => -attenuation(f, 100, 4) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, -60, "- 60 dB exigés", [7, 5], true);
            ligneV(c, r, couleurs, 950, [1, 3], "fe - fB = 950 Hz", true);
          },
        });
      },
    })
  );

  /* Avancé : temps d'acquisition et résistance de source */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-acquisition",
      titre: "Résistance de source admissible d'un bloqueur",
      niveau: "avancé",
      enonce:
        "<p>Un convertisseur à approximations successives de $16$ bits balaye plusieurs voies par un multiplexeur. Son condensateur d'échantillonnage vaut $C_h = 20\\ \\mathrm{pF}$, son interrupteur $R_{\\text{on}} = 100\\ \\Omega$, et la phase d'acquisition dure $2\\ \\mu\\mathrm{s}$. Deux voies successives peuvent être à $0$ et à pleine échelle. Quelle résistance de source maximale, en kilohms, garantit une erreur inférieure à un demi-pas ? La correction propose deux remèdes si la source réelle fait $10\\ \\mathrm{k\\Omega}$.</p>",
      valeur: (2e-6 / (20e-12 * Math.log(Math.pow(2, 17))) - 100) / 1000,
      unite: "kΩ",
      tolerance: 0.01,
      chiffres: 4,
      libelleChamp: "R_s maximale",
      etapes: [
        { texte: "Erreur relative admissible : $q/2 = PE/2^{17}$, donc $t_{\\text{acq}} \\geq \\tau\\ln 2^{17} = 11{,}78\\,\\tau$." },
        { texte: "$\\tau \\leq 2\\ \\mu\\mathrm{s}/11{,}78 = 169{,}7\\ \\mathrm{ns}$, d'où $R_s + R_{\\text{on}} \\leq 169{,}7\\ \\mathrm{ns}/20\\ \\mathrm{pF} = 8{,}49\\ \\mathrm{k\\Omega}$." },
        { texte: "$R_s \\leq 8{,}49 - 0{,}10 = 8{,}39\\ \\mathrm{k\\Omega}$." },
        { texte: "Avec $10\\ \\mathrm{k\\Omega}$ : un suiveur par voie, ou un condensateur tampon de quelques nanofarads sur l'entrée, qui fournit la charge instantanément ; à défaut, allonger l'acquisition à $2{,}38\\ \\mu\\mathrm{s}$.", note: "Le condensateur tampon forme avec $R_s$ un filtre : il doit rester compatible avec la bande utile." },
      ],
      visuelCorrection(conteneur, moteur) {
        const tau1 = 1100 * 20e-12 * 1e9;
        const tau2 = 8486.4 * 20e-12 * 1e9;
        traceCorrection(moteur, conteneur, {
          titre: "Bits résolus en fin d'acquisition, en fonction du temps",
          xTitre: "temps",
          xUnite: "ns",
          yTitre: "bits résolus",
          yUnite: "",
          xMin: 0,
          xMax: 2500,
          yMin: 0,
          yMax: 24,
          series: [
            { id: "a", nom: "Rs + Ron = 1,1 kΩ", fonction: (t) => Math.min(24, t / tau1 / Math.LN2 - 1) },
            { id: "b", nom: "Rs + Ron = 8,49 kΩ", fonction: (t) => t / tau2 / Math.LN2 - 1 },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 16, "16 bits : écart sous q/2", [7, 5], true);
            ligneV(c, r, couleurs, 2000, [1, 3], "fin d'acquisition, 2 µs", true);
          },
        });
      },
    })
  );

  /* Diagnostic industriel */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-diagnostic",
      titre: "Une pression qui respire toutes les douze secondes",
      niveau: "diagnostic",
      enonce:
        "<p>Sur un autre site, la pression d'un réseau d'eau, lue par une entrée analogique d'automate, oscille de $\\pm 0{,}05\\ \\mathrm{bar}$ avec une période d'environ $12{,}5\\ \\mathrm{s}$, alors qu'un manomètre placé au même point reste parfaitement stable. La valeur est lue par une tâche cyclique de $20\\ \\mathrm{ms}$, sur une carte sans filtre interne ; le câble du transmetteur longe des câbles de puissance. Le fréquencemètre du tableau indique $49{,}92\\ \\mathrm{Hz}$. Quelles affirmations sont exactes ?</p>",
      options: [
        { texte: "Une perturbation à la fréquence du réseau, échantillonnée à $50\\ \\mathrm{Hz}$, se replie à $|49{,}92 - 50| = 0{,}08\\ \\mathrm{Hz}$, soit une période de $12{,}5\\ \\mathrm{s}$.", juste: true },
        { texte: "Le régulateur de pression est instable et doit être réglé plus mou." },
        { texte: "Passer la tâche à $17\\ \\mathrm{ms}$ supprime le défaut." },
        { texte: "Un filtre analogique avant la carte, ou une carte à intégration sur $20\\ \\mathrm{ms}$, supprime le défaut à sa source.", juste: true },
        { texte: "Une moyenne glissante de $0{,}5\\ \\mathrm{s}$ dans l'automate ne corrige pas cette oscillation.", juste: true },
      ],
      etapes: [
        { texte: "Le manomètre est stable : la pression réelle ne bouge pas, le défaut est dans la chaîne de mesure, pas dans la régulation." },
        { texte: "$f_e = 1/0{,}02 = 50\\ \\mathrm{Hz}$ ; une perturbation à $49{,}92\\ \\mathrm{Hz}$ donne $f_a = 0{,}08\\ \\mathrm{Hz}$, période $12{,}5\\ \\mathrm{s}$ : la signature est exacte." },
        { texte: "À $17\\ \\mathrm{ms}$, $f_e = 58{,}8\\ \\mathrm{Hz}$ et $f_a = 8{,}9\\ \\mathrm{Hz}$ : le défaut change de forme sans disparaître." },
        { texte: "Une moyenne de $0{,}5\\ \\mathrm{s}$ ne touche pas une oscillation de $12{,}5\\ \\mathrm{s}$ ; il faut agir avant l'échantillonnage.", note: "Séparer aussi le câble du transmetteur des câbles de puissance et vérifier le raccordement du blindage." },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Échantillons d'une perturbation à 49,92 Hz lus toutes les 20 ms",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "perturbation lue",
          yUnite: "bar",
          xMin: 0,
          xMax: 25,
          yMin: -0.07,
          yMax: 0.07,
          echantillons: 1250,
          series: [
            {
              id: "e",
              nom: "valeurs lues par la tâche de 20 ms",
              fonction: (t) => {
                const n = Math.round(t / 0.02);
                return 0.05 * Math.sin(2 * Math.PI * 49.92 * n * 0.02 + 0.4);
              },
            },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneV(c, r, couleurs, 12.5, [1, 3], "12,5 s", true);
            ligneH(c, r, couleurs, 0, "pression réelle constante", [7, 5], true);
          },
        });
      },
    })
  );

  /* Question conceptuelle */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-sigmadelta",
      titre: "Vingt-quatre bits avec un comparateur d'un bit",
      niveau: "conceptuel",
      enonce: "<p>Sans calcul, expliquez comment un convertisseur sigma-delta, dont le comparateur ne fournit qu'un bit à chaque coup d'horloge, peut délivrer des mots de $24$ bits, et ce qu'il sacrifie en échange.</p>",
      motsCles: [
        ["surechantillon", "tres rapide", "frequence elevee", "beaucoup plus vite", "fm"],
        ["moyenne", "densite", "proportion", "filtre numerique", "decimation"],
        ["mise en forme", "integrateur", "hautes frequences", "repousse le bruit", "boucle"],
        ["latence", "retard", "lent", "debit", "multiplex"],
      ],
      minimum: 3,
      exemple: "Trois ou quatre phrases : suréchantillonnage, moyenne du flux par le filtre numérique, mise en forme du bruit par l'intégrateur, latence.",
      visuelCorrection: correctionEtapes(
        [
          "comparateur 1 bit cadencé à fm = M fe, très au-delà de la bande utile",
          "la proportion de 1 du flux est proportionnelle à ve",
          "l'intégrateur repousse le bruit de quantification vers les hautes fréquences",
          "le filtre numérique moyenne, garde la bande utile et décime par M",
          "prix : latence de plusieurs Te, débit limité, multiplexage difficile",
        ],
        "Du flux de bits aux mots de 24 bits."
      ),
      etapes: [
        { texte: "Le modulateur fonctionne à $f_m = Mf_e$, des centaines de fois la fréquence de sortie : chaque mot résulte de $M$ décisions d'un bit." },
        { texte: "La contre-réaction force la proportion de $1$ du flux à représenter $v_e$ ; le filtre numérique en fait la moyenne, ce qui affine la résolution." },
        { texte: "L'intégrateur dans la boucle repousse le bruit de quantification vers les hautes fréquences, où le filtre numérique le supprime : c'est la mise en forme du bruit, bien plus efficace qu'un simple moyennage." },
        { texte: "En échange : la latence du filtre numérique, un débit de sortie modeste et une mauvaise aptitude au multiplexage rapide.", note: "Les derniers bits restent limités par le bruit thermique et la référence." },
      ],
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

/** Chaîne simplifiée pour la question de schéma. */
function dessinChaineQuiz() {
  let d = "<defs>" + marqueur("l-ch-fl") + "</defs>" + TRAITS + ' stroke-width="1.5">';
  const blocs = [10, 120, 230, 340, 450];
  for (const x of blocs) d += '<rect x="' + x + '" y="50" width="90" height="60" rx="6"/>';
  for (const x of blocs.slice(0, 4)) d += '<path d="M' + (x + 90) + ' 80H' + (x + 108) + '" marker-end="url(#l-ch-fl)"/>';
  d += '<path d="M10 150H540" stroke-width="2"/>';
  for (const x of blocs) d += '<path d="M' + (x + 45) + ' 110V150"/>';
  d += "</g>" + ECRITS.replace('font-size="12"', 'font-size="11"');
  d += texte(16, 76, "conditionneur") + texte(16, 92, "0-10 V");
  d += texte(126, 76, "passe-bas") + texte(126, 92, "analogique");
  d += texte(236, 76, "échantillon.") + texte(236, 92, "bloqueur");
  d += texte(346, 76, "CAN 16 bits") + texte(346, 92, "SAR");
  d += texte(456, 76, "filtre") + texte(456, 92, "numérique");
  d += texte(14, 170, "0 V analogique, référence de toutes les tensions");
  d += "</g>";
  return d;
}

const VISUELS_QUIZ = [
  etapes(["Shannon : fe > 2 fmax", "fmax = 1 kHz", "fe > 2 kHz, en pratique 2,5 à 10 fois plus"], "Fréquence d'échantillonnage minimale."),
  etapes(["16 bits fixent le pas q = PE / 65 536", "l'exactitude dépend de Vréf, du gain, des dérives", "résolution et exactitude sont deux grandeurs"], "Bits et exactitude."),
  etapes(["SNR = 6,02 N + 1,76 dB", "= 6,02 × 10 + 1,76", "= 61,96 dB"], "Rapport signal sur bruit idéal."),
  etapes(["placé avant l'échantillonneur-bloqueur", "atténue tout ce qui dépasserait fe / 2", "nom : filtre anti-repliement"], "Le filtre avant la conversion."),
  etapes(["k = arrondi(470 / 500) = 1", "fa = |470 - 500| = 30 Hz", "phase inversée"], "Fréquence apparente."),
  etapes(["le passe-bas analogique précède l'échantillonnage", "le filtre numérique arrive trop tard", "la composante repliée est déjà dans la bande"], "Où se joue le repliement."),
  etapes(["σ divisé par √M = √16 = 4", "gain 10 log10 16 = 12 dB", "soit 2 bits, si le bruit atteint q/2"], "Moyennage."),
  etapes(["code maximal 4095", "4095 × 10 V / 4096 = 9,998 V", "10 V n'est jamais codé"], "Dernier code."),
  etapes(["SNR = - 20 log10(2π f σt)", "= - 20 log10(2π × 50 × 10⁻⁵)", "= 50,1 dB"], "Gigue d'échantillonnage."),
  etapes(["intégration sur T = 20 ms", "|H| = |sin(πfT) / (πfT)| nul à 50, 100, 150 Hz", "principe des multimètres de précision"], "Convertisseur à intégration."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Un signal ne contient aucune composante au-delà de $1\\ \\mathrm{kHz}$. Quelle condition théorique la fréquence d'échantillonnage doit-elle remplir ?</p>",
        options: ["$f_e > 500\\ \\mathrm{Hz}$", "$f_e > 1\\ \\mathrm{kHz}$", "$f_e > 2\\ \\mathrm{kHz}$", "$f_e > 10\\ \\mathrm{kHz}$"],
        bonnes: [2],
        explication: "Théorème de Shannon : $f_e > 2f_{\\max}$ ; en pratique, on prend une marge et un filtre anti-repliement.",
        resume: "Shannon",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Une carte d'entrée de $16$ bits est forcément plus exacte qu'une carte de $12$ bits.</p>",
        reponse: false,
        explication: "Le nombre de bits fixe le pas ; l'exactitude dépend de la référence, du gain, des dérives et des non-linéarités.",
        resume: "Résolution et exactitude",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Rapport signal sur bruit idéal d'un convertisseur de $10$ bits pour une sinusoïde à pleine échelle, en décibels ?</p>",
        valeur: 61.96,
        unite: "dB",
        tolerance: 0.01,
        explication: "$6{,}02 \\times 10 + 1{,}76 = 61{,}96\\ \\mathrm{dB}$.",
        resume: "SNR idéal",
      },
      {
        type: "courte",
        enonce: repere(3) + "<p>Comment appelle-t-on le filtre passe-bas analogique placé juste avant l'échantillonneur-bloqueur ?</p>",
        motsCles: [["anti-repliement", "antirepliement", "anti repliement", "anti-aliasing", "antialiasing", "repliement"]],
        minimum: 1,
        explication: "Filtre anti-repliement : il atténue les composantes qui, au-delà de $f_e/2$, se replieraient dans la bande utile.",
        resume: "Filtre anti-repliement",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Une composante de $470\\ \\mathrm{Hz}$ est échantillonnée à $500\\ \\mathrm{Hz}$. Fréquence apparente, en hertz ?</p>",
        valeur: 30,
        unite: "Hz",
        tolerance: 0.01,
        explication: "$|470 - 500| = 30\\ \\mathrm{Hz}$, avec une phase inversée.",
        resume: "Repliement",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Sur cette chaîne de conversion, quel bloc empêche le repliement ?</p>",
        consigne: "Cliquez sur le bloc qui empêche le repliement.",
        viewBox: "0 0 560 180",
        dessin: dessinChaineQuiz(),
        zones: [
          { x: 10, y: 50, largeur: 90, hauteur: 60, etiquette: "conditionneur" },
          { x: 120, y: 50, largeur: 90, hauteur: 60, etiquette: "passe-bas analogique", juste: true },
          { x: 230, y: 50, largeur: 90, hauteur: 60, etiquette: "échantillonneur-bloqueur" },
          { x: 340, y: 50, largeur: 90, hauteur: 60, etiquette: "convertisseur" },
          { x: 450, y: 50, largeur: 90, hauteur: 60, etiquette: "filtre numérique" },
        ],
        explication: "Seul le passe-bas analogique agit avant l'échantillonnage ; le filtre numérique reçoit des composantes déjà repliées, indiscernables du signal.",
        resume: "Lecture d'une chaîne de conversion",
      },
      {
        type: "qcm",
        enonce: repere(6) + "<p>On moyenne $16$ échantillons dont le bruit est indépendant et d'écart-type supérieur au demi-pas. Combien de bits de résolution gagne-t-on ?</p>",
        options: ["Aucun", "$1$ bit", "$2$ bits", "$4$ bits"],
        bonnes: [2],
        explication: "$\\sigma$ est divisé par $\\sqrt{16} = 4$, soit $12\\ \\mathrm{dB}$ et deux bits.",
        resume: "Moyennage",
      },
      {
        type: "vraiFaux",
        enonce: repere(7) + "<p>Le code le plus élevé d'un convertisseur de $12$ bits d'étendue $0$-$10\\ \\mathrm{V}$ correspond exactement à $10\\ \\mathrm{V}$.</p>",
        reponse: false,
        explication: "Le code $4095$ correspond à $PE - q = 9{,}998\\ \\mathrm{V}$ ; toute tension supérieure donne le même code.",
        resume: "Pleine échelle",
      },
      {
        type: "calcul",
        enonce: repere(8) + "<p>Une sinusoïde de $50\\ \\mathrm{Hz}$ est échantillonnée avec une gigue de $10\\ \\mathrm{\\mu s}$ efficaces. SNR limité par la gigue, en décibels ?</p>",
        valeur: -20 * Math.log10(2 * Math.PI * 50 * 1e-5),
        unite: "dB",
        tolerance: 0.01,
        explication: "$-20\\log_{10}(2\\pi \\times 50 \\times 10^{-5}) = 50{,}1\\ \\mathrm{dB}$, l'équivalent de huit bits.",
        resume: "Gigue",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Quelle architecture rejette naturellement le $50\\ \\mathrm{Hz}$ et ses harmoniques, et équipe les multimètres de précision ?</p>",
        options: ["Flash", "Approximations successives", "Intégration, double rampe", "Pipeline"],
        bonnes: [2],
        explication: "L'intégration sur $20\\ \\mathrm{ms}$ ou un multiple donne un filtre en sinus cardinal nul à $50\\ \\mathrm{Hz}$ et à ses harmoniques.",
        resume: "Architectures",
      },
    ],
    { titre: "Quiz : dix questions" }
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
      { categorie: "Échantillonnage", question: "Quelle fréquence apparente donne $f$ échantillonnée à $f_e$ ?", reponse: "$f_a = |f - kf_e|$ avec $k$ l'entier le plus proche de $f/f_e$ ; phase inversée si $f - kf_e < 0$." },
      { categorie: "Shannon", question: "Condition de Shannon, et règle pratique ?", reponse: "$f_e > 2f_B$ pour un signal strictement limité ; en pratique $f_e$ de $2{,}5$ à $10$ fois $f_B$, avec un filtre anti-repliement." },
      { categorie: "Quantification", question: "Pas et erreur efficace d'un convertisseur de $N$ bits ?", reponse: "$q = PE/2^N$ ; erreur entre $\\pm q/2$, de valeur efficace $q/\\sqrt{12}$ si elle est décorrélée du signal." },
      { categorie: "SNR", question: "SNR idéal pour une sinusoïde à pleine échelle ?", reponse: "$6{,}02N + 1{,}76\\ \\mathrm{dB}$ : $74{,}0\\ \\mathrm{dB}$ à $12$ bits, $98{,}1\\ \\mathrm{dB}$ à $16$ bits ; on retranche le niveau en dBFS." },
      { categorie: "Bits effectifs", question: "Comment calcule-t-on l'ENOB ?", reponse: "$(\\mathrm{SINAD} - 1{,}76)/6{,}02$, avec le SINAD mesuré ou garanti par la fiche à une fréquence donnée." },
      { categorie: "Moyennage", question: "Que gagne-t-on en moyennant $M$ échantillons ?", reponse: "$10\\log_{10}M\\ \\mathrm{dB}$, un bit par facteur quatre, seulement si le bruit est indépendant et d'au moins $q/2$ environ." },
      { categorie: "Anti-repliement", question: "Où dimensionne-t-on l'atténuation du filtre anti-repliement ?", reponse: "À $f_e - f_B$, plus basse fréquence qui se replie dans la bande utile ; on vise une atténuation au moins égale au SNR voulu." },
      { categorie: "Bloqueur", question: "Temps d'acquisition d'un bloqueur de $N$ bits ?", reponse: "$t_{\\text{acq}} \\geq (N + 1)\\ln 2\\,(R_s + R_{\\text{on}})C_h$ : $9{,}0\\tau$ à $12$ bits, $11{,}8\\tau$ à $16$ bits." },
      { categorie: "Architectures", question: "SAR, sigma-delta, intégration : un usage type pour chacun ?", reponse: "SAR : courants de variateur, cartes rapides ; sigma-delta : pesage, température ; intégration : multimètres, rejet du $50\\ \\mathrm{Hz}$." },
      { categorie: "Diagnostic", question: "Quelle signature trahit un repliement du réseau ?", reponse: "Une dérive lente ou un décalage qui change à chaque démarrage, de période $1/|f_{\\text{réseau}} - kf_e|$, absent d'un instrument indépendant." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["q = PE / 2^N = 5 V / 256", "= 19,53 mV"], "Pas de 8 bits."),
  etapes(["après échantillonnage, la composante repliée", "a la même fréquence que le signal utile", "seul un traitement avant la conversion agit"], "Filtre numérique et repliement."),
  etapes(["modulateur suréchantillonné, flux d'un bit", "filtre numérique et décimation", "haute résolution, latence de plusieurs Te"], "Sigma-delta."),
  etapes(["G = 1 + 49,4 kΩ / RG", "= 1 + 49 400 / 499", "= 100,0"], "Résistance de gain."),
  etapes(["TRMC ≈ (1 + G) / (4 t) = 2 / 0,004 = 500", "20 log10 500 = 54 dB"], "Soustracteur à 0,1 %."),
  etapes(["u = Kp (e + (1 / Ti) ∫ e dt)", "= 2 × (1 + 2 / 4)", "= 3"], "Action proportionnelle et intégrale."),
  etapes(["pertes Joule rotor = g × Ptr", "= 0,04 × 10 kW", "= 400 W"], "Bilan du moteur asynchrone."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Pas de quantification d'un convertisseur de $8$ bits d'étendue $0$-$5\\ \\mathrm{V}$, en millivolts ?</p>",
        valeur: (5 / 256) * 1000,
        unite: "mV",
        tolerance: 0.01,
        explication: "$5/256 = 19{,}53\\ \\mathrm{mV}$.",
        resume: "Pas de quantification",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Un filtre numérique placé après la conversion ne peut pas supprimer une composante qui s'est repliée dans la bande utile.</p>",
        reponse: true,
        explication: "Après repliement, la composante a la fréquence d'un signal utile : plus rien ne la distingue.",
        resume: "Repliement",
      },
      {
        type: "qcm",
        enonce: repere(2) + "<p>Cette séance. Quelles caractéristiques décrivent un convertisseur sigma-delta ?</p>",
        options: [
          { texte: "Modulateur suréchantillonné à un bit suivi d'un filtre numérique décimateur.", juste: true },
          { texte: "Haute résolution, mais latence de plusieurs périodes d'échantillonnage.", juste: true },
          { texte: "Une seule comparaison par bit, avec un résultat immédiat." },
          { texte: "Filtre anti-repliement analogique d'ordre très élevé obligatoire." },
        ],
        multiple: true,
        explication: "Le sigma-delta suréchantillonne et filtre numériquement ; sa fréquence de modulation élevée simplifie le filtre analogique.",
        resume: "Sigma-delta",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours précédent. Gain d'un amplificateur d'instrumentation de relation $G = 1 + 49{,}4\\ \\mathrm{k\\Omega}/R_G$ avec $R_G = 499\\ \\Omega$ ?</p>",
        valeur: 1 + 49400 / 499,
        unite: "",
        tolerance: 0.005,
        explication: "$1 + 49\\,400/499 = 100{,}0$.",
        resume: "Amplificateur d'instrumentation",
      },
      {
        type: "calcul",
        enonce: repere(4) + "<p>Cours précédent. Taux de réjection du mode commun, dans le cas le plus défavorable, d'un soustracteur de gain $1$ à résistances de $0{,}1\\ \\%$, en décibels ?</p>",
        valeur: 20 * Math.log10(500),
        unite: "dB",
        tolerance: 0.01,
        explication: "$(1 + G)/(4t) = 2/0{,}004 = 500$, soit $54\\ \\mathrm{dB}$.",
        resume: "Soustracteur",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours vieux d'une semaine. Un correcteur PI de gain $K_p = 2$ et de temps d'intégrale $T_i = 4\\ \\mathrm{s}$ reçoit, à partir de $t = 0$, une erreur constante de $1$. Que vaut sa sortie à $t = 2\\ \\mathrm{s}$ ?</p>",
        valeur: 3,
        unite: "",
        tolerance: 0.01,
        explication: "$u = K_p\\left(e + \\frac{1}{T_i}\\int e\\,\\mathrm{d}t\\right) = 2(1 + 2/4) = 3$.",
        resume: "Correcteur PI",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours vieux d'un mois. Un moteur asynchrone transmet $10\\ \\mathrm{kW}$ à son rotor avec un glissement de $4\\ \\%$. Pertes Joule au rotor, en watts ?</p>",
        valeur: 400,
        unite: "W",
        tolerance: 0.01,
        explication: "$P_{jr} = gP_{tr} = 0{,}04 \\times 10\\,000 = 400\\ \\mathrm{W}$ : la résistance $R_2'/g$ du schéma équivalent partage $P_{tr}$ entre pertes et puissance mécanique.",
        resume: "Schéma équivalent",
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
    titre: "Où en suis-je sur la conversion analogique-numérique ?",
  });
  if (auto) ressources.push(auto);
}
