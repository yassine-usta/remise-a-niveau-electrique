/* ==========================================================================
   cours/inductances-et-champ-magnetique/cours.js
   Inductances et champ magnétique.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";

/* Perméabilité du vide, en henrys par mètre. */
const MU0 = 4e-7 * Math.PI;

/* Bobine du contacteur KM1 du départ pompe (sections H et I). */
const KM = { u: 24, r: 48, l: 1.2 };
KM.i = KM.u / KM.r;
KM.tau = KM.l / KM.r;
KM.w = 0.5 * KM.l * KM.i * KM.i;

/* --------------------------------------------------------------------------
   Utilitaires
   -------------------------------------------------------------------------- */

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function nombre(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
}

function borner(valeur, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, valeur));
}

/** Marqueur de flèche, défini une fois par schéma. */
function marqueur(id, remplissage) {
  return (
    '<marker id="' + id + '" markerWidth="9" markerHeight="9" refX="6" refY="4" orient="auto">' +
    '<path d="M0 0 8 4 0 8Z" fill="' + (remplissage || "currentColor") + '"/></marker>'
  );
}

/** Tracé d'une bobine verticale : n demi-cercles de 24 unités à partir de (x, y). */
function spires(x, y, n) {
  let d = "M" + x + " " + y;
  for (let k = 0; k < n; k += 1) d += "a12 12 0 0 1 0 24";
  return d;
}

/** Schéma SVG de correction, tracé progressivement par api.dessiner. */
function visuelSvg(conteneur, api, viewBox, contenu, libelle) {
  const cadre = document.createElement("div");
  cadre.className = "schema-vivant";
  cadre.innerHTML = '<svg viewBox="' + viewBox + '" role="img" aria-label="' + libelle + '">' + contenu + "</svg>";
  conteneur.appendChild(cadre);
  const svg = cadre.querySelector("svg");
  if (svg) ressources.push(api.dessiner(svg, { duree: 1.4 }));
}

/** Point marqué sur un tracé, avec rappels pointillés vers les axes. */
function marquerPoint(c, repere, couleurs, x, y, texte, droite) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.setLineDash([5, 4]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(repere.boite.x, py);
  c.lineTo(px, py);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = couleurs.texte;
  c.beginPath();
  c.arc(px, py, 4.5, 0, Math.PI * 2);
  c.fill();
  if (texte) {
    c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
    const aDroite = droite != null ? !droite : px > repere.boite.x + repere.boite.l * 0.6;
    c.textAlign = aDroite ? "right" : "left";
    c.fillText(texte, px + (aDroite ? -8 : 8), py - 8);
  }
  c.restore();
}

/** Ligne horizontale en tirets sur un tracé, avec son libellé. */
function ligneHorizontale(c, repere, couleurs, y, texte) {
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
  if (texte) {
    c.fillStyle = couleurs.texte;
    c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
    c.textAlign = "right";
    c.fillText(texte, repere.boite.x + repere.boite.l - 4, py - 6);
  }
  c.restore();
}

/** Point situé à l'abscisse curviligne s d'une ligne brisée. */
function pointSurChemin(points, longueurs, s) {
  for (let k = 0; k < longueurs.length; k += 1) {
    if (s <= longueurs[k] || k === longueurs.length - 1) {
      const a = points[k];
      const b = points[k + 1];
      const l = longueurs[k] || 1;
      const t = borner(s / l, 0, 1);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    s -= longueurs[k];
  }
  return points[points.length - 1];
}

function cheminFerme(points) {
  const longueurs = [];
  for (let k = 0; k < points.length - 1; k += 1) {
    longueurs.push(Math.hypot(points[k + 1].x - points[k].x, points[k + 1].y - points[k].y));
  }
  return { points, longueurs, total: longueurs.reduce((a, b) => a + b, 0) };
}

/** Jauge horizontale dessinée en SVG, remplissage de la couleur de série 1. */
function jauge(x, y, largeur, libelle, fraction, texteValeur) {
  const f = borner(fraction, 0, 1);
  return (
    '<text x="' + (x - 12) + '" y="' + (y + 11) + '" text-anchor="end" font-family="ui-monospace, monospace" font-size="12" fill="currentColor">' + libelle + "</text>" +
    '<rect x="' + x + '" y="' + y + '" width="' + largeur + '" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>' +
    '<rect x="' + x + '" y="' + y + '" width="' + (largeur * f).toFixed(1) + '" height="14" rx="3" style="fill: var(--serie-1)"/>' +
    '<text x="' + (x + largeur + 10) + '" y="' + (y + 11) + '" font-family="ui-monospace, monospace" font-size="12" fill="currentColor">' + texteValeur + "</text>"
  );
}

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeursAnimation = [];

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireEtablissement(racine, api);
  construireSolenoide(racine, api);
  construireTension(racine, api);
  construireCourbeCoupure(racine, api);
  construireCoupure(racine, api);
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
   Animations : tracé progressif des schémas statiques
   -------------------------------------------------------------------------- */

function construireDessinsStatiques(racine, api) {
  const selecteurs = ["#d-bobine-figure svg", "#f-chronogramme svg", "#h-km-figure svg"];
  for (const selecteur of selecteurs) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree: 1.4 }));
  }
  /* Le schéma principal se trace plus lentement : les quatre instants dans l'ordre de lecture. */
  const principal = racine.querySelector("#f-schema-principal svg");
  if (principal) ressources.push(api.dessiner(principal, { duree: 2.4 }));
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-aire",
      titre: "Aire sous une tension constante",
      niveau: "diagnostic",
      enonce:
        "<p>Une tension constante de $12\\ \\mathrm{V}$ est appliquée pendant $5\\ \\mathrm{ms}$. Que vaut l'intégrale $\\int u\\,\\mathrm{d}t$ sur cette durée, en millivolts-secondes ($\\mathrm{mV \\cdot s}$) ?</p>",
      valeur: 60,
      unite: "mV·s",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "∫ u dt",
      etapes: [
        { texte: "Tension constante : l'intégrale est l'aire du rectangle, $U\\,\\Delta t$." },
        {
          texte: "$12 \\times 5 \\times 10^{-3} = 0{,}06\\ \\mathrm{V \\cdot s} = 60\\ \\mathrm{mV \\cdot s}$.",
          note: "Le volt-seconde est aussi le weber : cette aire mesure un flux lié, et divisée par une inductance, elle donnera une variation de courant.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 200",
          '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8"><path d="M60 160H520M60 170V30"/></g>' +
            '<rect x="60" y="70" width="300" height="90" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2.4"/>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<text x="52" y="74" text-anchor="end">12 V</text><text x="360" y="184" text-anchor="middle">5 ms</text>' +
            '<text x="210" y="120" text-anchor="middle">aire = 12 × 0,005 = 0,06 V·s</text>' +
            '<text x="528" y="164">t</text><text x="52" y="30" text-anchor="end">u</text></g>',
          "Rectangle de hauteur 12 volts et de largeur 5 millisecondes : 0,06 volt-seconde"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-pente",
      titre: "Pente d'un courant en rampe",
      niveau: "diagnostic",
      enonce:
        "<p>Un courant croît linéairement de $0$ à $2\\ \\mathrm{A}$ en $4\\ \\mathrm{ms}$. Quelle est sa dérivée $\\mathrm{d}i/\\mathrm{d}t$, en ampères par seconde ?</p>",
      valeur: 500,
      unite: "A/s",
      tolerance: 0.02,
      chiffres: 0,
      libelleChamp: "di/dt",
      etapes: [
        { texte: "Variation linéaire : la dérivée est la pente, $\\Delta i/\\Delta t$." },
        {
          texte: "$\\dfrac{2}{4 \\times 10^{-3}} = 500\\ \\mathrm{A/s}$.",
          note: "Multipliée par une inductance, cette pente donnera une tension : $u = L\\,\\mathrm{d}i/\\mathrm{d}t$, soit $5\\ \\mathrm{V}$ pour $10\\ \\mathrm{mH}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Rampe de courant",
          genre: "Correction visuelle",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "i",
          yUnite: "A",
          xMin: 0,
          xMax: 6,
          yMin: 0,
          yMax: 2.5,
          ratio: 0.4,
          series: [{ id: "i", nom: "i(t), pente 0,5 A/ms", couleur: "serie-1", fonction: (t) => Math.min(2, 0.5 * t) }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 4, 2, "2 A en 4 ms");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-energie-c",
      titre: "Énergie d'un condensateur, pour préparer la dualité",
      niveau: "diagnostic",
      enonce:
        "<p>Rappel du cours précédent : quelle énergie stocke un condensateur de $100\\ \\mu\\mathrm{F}$ chargé sous $24\\ \\mathrm{V}$, en millijoules ?</p>",
      valeur: 28.8,
      unite: "mJ",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "W",
      etapes: [
        { texte: "$W = \\tfrac{1}{2}CU^2 = 0{,}5 \\times 100 \\times 10^{-6} \\times 24^2$." },
        {
          texte: "$W = 0{,}5 \\times 10^{-4} \\times 576 = 0{,}0288\\ \\mathrm{J} = 28{,}8\\ \\mathrm{mJ}$.",
          note: "La bobine aura la formule duale, $\\tfrac{1}{2}LI^2$ : la capacité devient l'inductance, la tension devient le courant.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Énergie d'un condensateur de 100 µF",
          genre: "Correction visuelle",
          xTitre: "U",
          xUnite: "V",
          yTitre: "W",
          yUnite: "mJ",
          xMin: 0,
          xMax: 30,
          yMin: 0,
          yMax: 50,
          ratio: 0.4,
          series: [{ id: "w", nom: "W = C U² / 2", couleur: "serie-1", fonction: (u) => 0.5 * 100e-6 * u * u * 1e3 }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 24, 28.8, "24 V : 28,8 mJ");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : l'établissement du courant dans une bobine
   -------------------------------------------------------------------------- */

function construireEtablissement(racine, api) {
  const conteneur = racine.querySelector("#d-etablissement");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 420",
    role: "img",
    "aria-label": "Établissement du courant dans une bobine alimentée par une source continue à travers une résistance : porteurs en mouvement, lignes de champ et jauges de courant et de tension",
  });
  const fond = svgEl("g");
  fond.innerHTML =
    "<defs>" + marqueur("fl-d-et") + marqueur("fl-d-et-u", "var(--serie-2)") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
    '<path d="M80 166V70H130M136 70H170M176 70H190"/><rect x="190" y="57" width="100" height="26" rx="3"/>' +
    '<path d="M290 70H460V130"/><path d="' + spires(460, 130, 5) + '"/><path d="M460 250V310H80V214"/>' +
    '<circle cx="80" cy="190" r="24"/>' +
    '<path d="M200 310V324M186 324H214M192 331H208M197 338H203"/></g>' +
    '<g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="133" cy="70" r="3"/><circle cx="173" cy="70" r="3"/></g>' +
    '<rect x="486" y="126" width="84" height="128" rx="8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="5 5" opacity="0.55"/>' +
    '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M320 70H356" marker-end="url(#fl-d-et)"/></g>' +
    '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M420 248V138" marker-end="url(#fl-d-et-u)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    '<text x="80" y="185" text-anchor="middle" font-weight="600">+</text><text x="80" y="206" text-anchor="middle" font-weight="600">-</text>' +
    '<text x="48" y="195" text-anchor="end">E</text><text x="153" y="54" text-anchor="middle">K</text><text x="240" y="104" text-anchor="middle">R</text>' +
    '<text x="338" y="58" text-anchor="middle">i</text><text x="222" y="334" font-size="11.5">référence 0 V</text>' +
    '<text x="448" y="140" text-anchor="end" font-weight="600">+</text>' +
    '<text x="408" y="198" text-anchor="end" fill="var(--serie-2)">u_L</text><text x="486" y="272" font-size="11.5">L</text>' +
    '<text x="528" y="116" text-anchor="middle" font-size="11.5">lignes de champ</text></g>';
  const champ = svgEl("g", { stroke: "currentColor", "stroke-width": 1.6, fill: "none", "stroke-linecap": "round" });
  const porteurs = svgEl("g", { fill: "currentColor", stroke: "none" });
  const jauges = svgEl("g");
  svg.append(fond, champ, porteurs, jauges);
  conteneur.appendChild(svg);

  /* Boucle parcourue dans le sens du courant : borne +, résistance, bobine, retour. */
  const boucle = cheminFerme([
    { x: 80, y: 166 },
    { x: 80, y: 70 },
    { x: 460, y: 70 },
    { x: 460, y: 310 },
    { x: 80, y: 310 },
    { x: 80, y: 214 },
  ]);
  const pas = 32;
  const points = [];
  for (let s = 0; s < boucle.total; s += pas) {
    const rond = svgEl("circle", { r: 3.4 });
    porteurs.appendChild(rond);
    points.push({ s0: s, rond });
  }

  const valeurs = api.sim.valeurs("#d-etablissement-valeurs", [
    { id: "t", libelle: "Temps rapporté à L / R", decimales: 2 },
    { id: "i", libelle: "Courant i / I∞", unite: "%", decimales: 1 },
    { id: "ul", libelle: "Tension de la bobine u_L / E", unite: "%", decimales: 1 },
    { id: "ur", libelle: "Tension de la résistance R i / E", unite: "%", decimales: 1 },
    { id: "wl", libelle: "Énergie stockée / (L I∞² / 2)", unite: "%", decimales: 1 },
    { id: "ws", libelle: "Énergie fournie par la source / (L I∞² / 2)", unite: "%", decimales: 1 },
    { id: "wr", libelle: "Énergie dissipée dans R / (L I∞² / 2)", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher(t) {
    const x = 1 - Math.exp(-t);
    const ul = Math.exp(-t);
    /* Charge écoulée, en unités de I∞ L / R : déplacement des porteurs. */
    const q = t - x;
    const decalage = q * 70;
    for (const p of points) {
      const s = (p.s0 + decalage) % boucle.total;
      const position = pointSurChemin(boucle.points, boucle.longueurs, s);
      const cache = Math.abs(position.x - 80) < 2 && position.y > 166 && position.y < 214;
      p.rond.setAttribute("cx", position.x.toFixed(1));
      p.rond.setAttribute("cy", position.y.toFixed(1));
      p.rond.setAttribute("opacity", cache ? "0" : "0.85");
    }
    const n = Math.round(x * 6);
    let lignes = "";
    for (let k = 0; k < n; k += 1) {
      const xl = 500 + k * 12;
      lignes += '<path d="M' + xl + ' 240V142" marker-end="url(#fl-d-et)"/>';
    }
    champ.innerHTML = lignes;
    jauges.innerHTML =
      jauge(250, 362, 330, "i / I∞", x, Math.round(x * 100) + " %") +
      jauge(250, 386, 330, "u_L / E", ul, Math.round(ul * 100) + " %");
    if (valeurs) {
      const ws = 2 * q;
      valeurs.maj({ t, i: x * 100, ul: ul * 100, ur: x * 100, wl: x * x * 100, ws: ws * 100, wr: (ws - x * x) * 100 });
    }
  }

  const lecteur = api.sim.lecteur("#d-etablissement-lecteur", {
    de: 0,
    a: 5,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Fermer l'interrupteur et laisser le courant s'établir",
    rappel: (valeur) => afficher(valeur),
  });
  if (lecteur) ressources.push(lecteur);
  afficher(0);
}

/* --------------------------------------------------------------------------
   E. Simulation : le solénoïde
   -------------------------------------------------------------------------- */

const SOL = { x0: 100, pxParCm: 32, lMin: 2, lMax: 16, yHaut: 130, yBas: 250, yPoignee: 190 };

function construireSolenoide(racine, api) {
  const conteneur = racine.querySelector("#e-solenoide");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 360",
    role: "img",
    "aria-label": "Coupe longitudinale d'un solénoïde : spires, lignes de champ, noyau éventuel, longueur réglable par une poignée et jauge de l'induction",
  });
  const fond = svgEl("g");
  fond.innerHTML = "<defs>" + marqueur("fl-e-sol") + "</defs>";
  const noyau = svgEl("rect", { y: SOL.yHaut + 14, height: SOL.yBas - SOL.yHaut - 28, rx: 6, fill: "none", stroke: "currentColor", "stroke-width": 1.3, "stroke-dasharray": "6 5", opacity: 0.7 });
  const spiresG = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.6 });
  const champ = svgEl("g", { stroke: "currentColor", "stroke-width": 1.6, fill: "none", "stroke-linecap": "round" });
  const cote = svgEl("g", { stroke: "currentColor", "stroke-width": 1.3, fill: "none" });
  const textes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  const jaugeG = svgEl("g");
  svg.append(fond, noyau, spiresG, champ, cote, textes, jaugeG);
  conteneur.appendChild(svg);

  const etat = { n: 500, s: 4, mur: 1, i: 0.5, l: 5 };

  const valeurs = api.sim.valeurs("#e-solenoide-valeurs", [
    { id: "h", libelle: "Excitation H = N i / l", unite: "A/m", decimales: 0 },
    { id: "b", libelle: "Induction B", unite: "mT", decimales: 3 },
    { id: "phi", libelle: "Flux d'une spire Φ = B S", unite: "µWb", decimales: 3 },
    { id: "psi", libelle: "Flux lié ψ = N Φ", unite: "mWb", decimales: 4 },
    { id: "L", libelle: "Inductance L = ψ / i", unite: "mH", decimales: 3 },
    { id: "w", libelle: "Énergie L i² / 2", unite: "mJ", decimales: 4 },
    {
      id: "etat",
      libelle: "Validité du modèle linéaire",
      format: (v) => (v >= 1.5 ? "B au-delà de 1,5 T : noyau saturé, valeurs non physiques" : v >= 0.3 && v < 1.5 ? "sous 1,5 T : valable pour un noyau de fer, pas pour une ferrite" : "valable"),
    },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const x1 = SOL.x0 + etat.l * SOL.pxParCm;
    const largeur = x1 - SOL.x0;
    const mu = MU0 * etat.mur;
    const h = (etat.n * etat.i) / (etat.l / 100);
    const b = mu * h;
    const s = etat.s * 1e-4;
    const phi = b * s;
    const psi = etat.n * phi;
    const L = (mu * etat.n * etat.n * s) / (etat.l / 100);
    const w = 0.5 * L * etat.i * etat.i;

    noyau.setAttribute("x", String(SOL.x0 + 6));
    noyau.setAttribute("width", String(Math.max(10, largeur - 12)));
    noyau.setAttribute("opacity", etat.mur > 1 ? "0.7" : "0");

    /* Sections de spires : point en haut (courant sortant), croix en bas (courant entrant). */
    const nDessin = borner(Math.round(etat.n / 50), 2, Math.floor(largeur / 13));
    let m = "";
    for (let k = 0; k < nDessin; k += 1) {
      const x = nDessin === 1 ? SOL.x0 : SOL.x0 + 6 + (k * (largeur - 12)) / (nDessin - 1);
      m += '<circle cx="' + x.toFixed(1) + '" cy="' + SOL.yHaut + '" r="5.5"/>';
      m += '<circle cx="' + x.toFixed(1) + '" cy="' + SOL.yHaut + '" r="1.6" fill="currentColor"/>';
      m += '<circle cx="' + x.toFixed(1) + '" cy="' + SOL.yBas + '" r="5.5"/>';
      m += '<path d="M' + (x - 3.6).toFixed(1) + " " + (SOL.yBas - 3.6) + "l7.2 7.2M" + (x - 3.6).toFixed(1) + " " + (SOL.yBas + 3.6) + 'l7.2 -7.2"/>';
    }
    spiresG.innerHTML = m;

    /* Lignes de champ : nombre croissant avec B, sur une échelle logarithmique. */
    const nLignes = borner(1 + Math.round(1.6 * Math.log10(Math.max(b, 1e-5) / 1e-4)), 1, 9);
    let lignes = "";
    for (let k = 0; k < nLignes; k += 1) {
      const y = SOL.yHaut + 20 + ((k + 0.5) * (SOL.yBas - SOL.yHaut - 40)) / nLignes;
      lignes += '<path d="M' + (SOL.x0 + 10) + " " + y.toFixed(1) + "H" + (x1 - 12) + '" marker-end="url(#fl-e-sol)"/>';
    }
    champ.innerHTML = lignes;

    cote.innerHTML =
      '<path d="M' + SOL.x0 + " 290H" + x1 + "M" + SOL.x0 + " 283V297M" + x1 + ' 283V297"/>';
    textes.innerHTML =
      '<text x="' + ((SOL.x0 + x1) / 2) + '" y="314" text-anchor="middle">l = ' + nombre(api, etat.l, 1) + " cm</text>" +
      '<text x="' + SOL.x0 + '" y="' + (SOL.yHaut - 18) + '" font-size="11.5">N = ' + etat.n + " spires, i = " + nombre(api, etat.i, 2) + " A</text>" +
      '<text x="' + ((SOL.x0 + x1) / 2) + '" y="' + (SOL.yBas + 30) + '" text-anchor="middle" font-size="11.5">' + (etat.mur > 1 ? "noyau, μr = " + etat.mur : "air, μr = 1") + "</text>" +
      '<text x="' + (x1 + 22) + '" y="' + (SOL.yPoignee + 4) + '" font-size="11.5">B</text>';
    jaugeG.innerHTML = jauge(250, 40, 280, "B / 1,5 T", b / 1.5, b >= 1.5 ? "saturé" : Math.round((b / 1.5) * 100) + " %");

    if (valeurs) {
      valeurs.maj({ h, b: b * 1e3, phi: phi * 1e6, psi: psi * 1e3, L: L * 1e3, w: w * 1e3, etat: b });
    }
  }

  let poignee = null;
  poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: SOL.x0 + SOL.lMin * SOL.pxParCm, y: SOL.yPoignee },
    a: { x: SOL.x0 + SOL.lMax * SOL.pxParCm, y: SOL.yPoignee },
    min: SOL.lMin,
    max: SOL.lMax,
    pas: 0.5,
    valeur: etat.l,
    unite: "cm",
    libelle: "Extrémité droite du solénoïde : longueur l",
    rappel(mesure) {
      etat.l = mesure.valeur;
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-solenoide-curseurs",
    [
      { id: "n", libelle: "Nombre de spires N", min: 50, max: 2000, pas: 50, valeur: etat.n },
      { id: "s", libelle: "Section S", min: 1, max: 20, pas: 0.5, valeur: etat.s, unite: "cm²" },
      { id: "mur", libelle: "Perméabilité relative du noyau μr", min: 1, max: 2000, pas: 1, valeur: etat.mur },
      { id: "i", libelle: "Courant i", min: 0.05, max: 5, pas: 0.05, valeur: etat.i, unite: "A" },
    ],
    (lues) => {
      etat.n = Math.round(lues.n);
      etat.s = lues.s;
      etat.mur = Math.round(lues.mur);
      etat.i = lues.i;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : du courant imposé à la tension induite
   -------------------------------------------------------------------------- */

function construireTension(racine, api) {
  const etat = { l: 1.2, imax: 0.5, tm: 25, tp: 30, td: 20, x: 0 };

  const duree = () => etat.tm + etat.tp + etat.td + 10;
  const uMontee = () => (etat.l * etat.imax) / (etat.tm / 1000);
  const uDescente = () => -(etat.l * etat.imax) / (etat.td / 1000);

  /* Courant en trapèze et tension, t en millisecondes. */
  function courant(t) {
    if (t <= 0) return 0;
    if (t < etat.tm) return (etat.imax * t) / etat.tm;
    if (t < etat.tm + etat.tp) return etat.imax;
    if (t < etat.tm + etat.tp + etat.td) return etat.imax * (1 - (t - etat.tm - etat.tp) / etat.td);
    return 0;
  }
  function tension(t) {
    if (t < 0) return 0;
    if (t < etat.tm) return uMontee();
    if (t < etat.tm + etat.tp) return 0;
    if (t < etat.tm + etat.tp + etat.td) return uDescente();
    return 0;
  }

  /* Polylignes exactes jusqu'à l'instant courant, sommets compris. */
  function points(tFin) {
    const t1 = etat.tm;
    const t2 = etat.tm + etat.tp;
    const t3 = t2 + etat.td;
    const pi = [[0, 0]];
    const pu = [[0, 0], [0, uMontee()]];
    for (const [ta, tb, ua] of [[0, t1, uMontee()], [t1, t2, 0], [t2, t3, uDescente()], [t3, duree(), 0]]) {
      if (tFin <= ta) break;
      const fin = Math.min(tFin, tb);
      pi.push([fin, courant(fin - 1e-9)]);
      if (pu.length && pu[pu.length - 1][1] !== ua) pu.push([ta, ua]);
      pu.push([fin, ua]);
    }
    return { pi, pu };
  }

  const tCourant = () => etat.x * duree();

  const traceurI = api.sim.traceur("#e-tension-courant", {
    titre: "Courant imposé à l'inductance",
    genre: "Simulation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "i",
    yUnite: "A",
    xMin: 0,
    xMax: duree(),
    yMin: 0,
    yMax: etat.imax * 1.15,
    ratio: 0.36,
    series: [{ id: "i", nom: "i(t), jusqu'à l'instant courant", couleur: "serie-1", epaisseur: 2.6 }],
    surDessin({ c, repere, couleurs }) {
      const t = tCourant();
      marquerPoint(c, repere, couleurs, t, courant(t), "i = " + nombre(api, courant(t), 3) + " A");
    },
  });
  if (traceurI) ressources.push(traceurI);

  const traceurU = api.sim.traceur("#e-tension-tension", {
    titre: "Tension u = L di/dt",
    genre: "Simulation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "u",
    yUnite: "V",
    xMin: 0,
    xMax: duree(),
    yMin: uDescente() * 1.15,
    yMax: uMontee() * 1.15,
    ratio: 0.36,
    series: [{ id: "u", nom: "u(t), jusqu'à l'instant courant", couleur: "serie-4", epaisseur: 2.6 }],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, 0, "0 V");
      const t = tCourant();
      marquerPoint(c, repere, couleurs, t, tension(t), "u = " + nombre(api, tension(t), 1) + " V");
    },
  });
  if (traceurU) ressources.push(traceurU);

  const valeurs = api.sim.valeurs("#e-tension-valeurs", [
    { id: "t", libelle: "Temps t", unite: "ms", decimales: 2 },
    { id: "i", libelle: "Courant i", unite: "A", decimales: 3 },
    { id: "u", libelle: "Tension u", unite: "V", decimales: 1 },
    { id: "p", libelle: "Puissance reçue u i", unite: "W", decimales: 2 },
    { id: "w", libelle: "Énergie stockée L i² / 2", unite: "J", decimales: 4 },
    { id: "um", libelle: "Tension pendant la montée", unite: "V", decimales: 1 },
    { id: "ud", libelle: "Tension pendant la descente", unite: "V", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher(plages) {
    const t = tCourant();
    const { pi, pu } = points(t);
    if (plages) {
      if (traceurI) traceurI.definirPlage({ xMin: 0, xMax: duree(), yMin: 0, yMax: etat.imax * 1.15 });
      if (traceurU) traceurU.definirPlage({ xMin: 0, xMax: duree(), yMin: uDescente() * 1.15, yMax: uMontee() * 1.15 });
    }
    if (traceurI) traceurI.definirDonnees("i", pi);
    if (traceurU) traceurU.definirDonnees("u", pu);
    if (valeurs) {
      const i = courant(t);
      const u = tension(t);
      valeurs.maj({ t, i, u, p: u * i, w: 0.5 * etat.l * i * i, um: uMontee(), ud: uDescente() });
    }
  }

  const lecteur = api.sim.lecteur("#e-tension-lecteur", {
    de: 0,
    a: 1,
    duree: 8,
    boucle: false,
    auto: false,
    libelle: "Parcourir le temps",
    rappel: (valeur) => {
      etat.x = valeur;
      afficher(false);
    },
  });
  if (lecteur) ressources.push(lecteur);

  const curseurs = api.sim.curseurs(
    "#e-tension-curseurs",
    [
      { id: "l", libelle: "Inductance L", min: 0.01, max: 2, pas: 0.01, valeur: etat.l, unite: "H" },
      { id: "imax", libelle: "Courant maximal", min: 0.1, max: 2, pas: 0.05, valeur: etat.imax, unite: "A" },
      { id: "tm", libelle: "Durée de montée", min: 1, max: 50, pas: 1, valeur: etat.tm, unite: "ms" },
      { id: "tp", libelle: "Durée du palier", min: 0, max: 50, pas: 1, valeur: etat.tp, unite: "ms" },
      { id: "td", libelle: "Durée de descente", min: 0.1, max: 50, pas: 0.1, valeur: etat.td, unite: "ms" },
    ],
    (lues) => {
      etat.l = lues.l;
      etat.imax = lues.imax;
      etat.tm = lues.tm;
      etat.tp = lues.tp;
      etat.td = lues.td;
      afficher(true);
    }
  );
  if (curseurs) ressources.push(curseurs);
  afficher(true);
}

/* --------------------------------------------------------------------------
   H. Tension de coupure en fonction de la durée de décroissance
   -------------------------------------------------------------------------- */

function construireCourbeCoupure(racine, api) {
  const flux = KM.l * KM.i;
  const traceur = api.sim.traceur("#h-coupure-trace", {
    titre: "Tension de coupure de la bobine de KM1 selon la durée de décroissance",
    genre: "Tracé",
    xTitre: "durée de décroissance",
    xUnite: "ms",
    yTitre: "|u_L|",
    yUnite: "V",
    xMin: 1,
    xMax: 50,
    yMin: 0,
    yMax: 200,
    ratio: 0.45,
    echantillons: 600,
    series: [
      {
        id: "u",
        nom: "|u_L| = L I / Δt, avec L I = 0,6 Wb",
        couleur: "serie-1",
        epaisseur: 2.6,
        fonction: (tms) => {
          const u = flux / (tms / 1000);
          return u <= 200 ? u : NaN;
        },
      },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, 30, "limite retenue : 30 V");
      marquerPoint(c, repere, couleurs, 20, 30, "20 ms, 30 V", true);
    },
  });
  if (traceur) ressources.push(traceur);
}

/* --------------------------------------------------------------------------
   I. Animation : la coupure d'une bobine protégée par un écrêteur
   -------------------------------------------------------------------------- */

/** Coupure avec écrêteur idéal de tension ue : grandeurs à l'instant t (secondes). */
function etatCoupure(ue, t) {
  const tau = KM.tau;
  const a = ue / KM.r;
  const t0 = tau * Math.log(1 + (KM.r * KM.i) / ue);
  const tt = Math.min(t, t0);
  const i = t >= t0 ? 0 : (KM.i + a) * Math.exp(-tt / tau) - a;
  const integrale = (KM.i + a) * tau * (1 - Math.exp(-tt / tau)) - a * tt;
  const we = ue * integrale;
  const wr = KM.w - 0.5 * KM.l * i * i - we;
  return { t0, i, we, wr, conduit: t < t0 };
}

function construireCoupure(racine, api) {
  const conteneur = racine.querySelector("#i-coupure");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 400",
    role: "img",
    "aria-label": "Coupure de la bobine du contacteur : sortie ouverte, courant de la bobine refermé par l'écrêteur, porteurs en mouvement et tensions de la bobine et de la sortie",
  });
  const fond = svgEl("g");
  fond.innerHTML =
    "<defs>" + marqueur("fl-i-c") + marqueur("fl-i-c-u", "var(--serie-2)") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M60 50H470M160 50V90M160 90L184 122M160 128V160H420V215M300 160V176"/>' +
    '<path d="' + spires(300, 176, 4) + 'V282"/><rect x="289" y="282" width="22" height="36" rx="3"/>' +
    '<path d="M300 318V340M60 340H470M420 285V340"/><rect x="398" y="215" width="44" height="70" rx="4"/>' +
    '<path d="M100 340V352M88 352H112M93 358H107M97 364H103"/></g>' +
    '<g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="160" cy="90" r="3"/><circle cx="160" cy="128" r="3"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="160" cy="160" r="4"/><circle cx="300" cy="160" r="4"/><circle cx="300" cy="340" r="4"/><circle cx="420" cy="340" r="4"/></g>' +
    '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M340 188V228" marker-end="url(#fl-i-c)"/></g>' +
    '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M250 318V184" marker-end="url(#fl-i-c-u)"/><path d="M120 150V62" marker-end="url(#fl-i-c-u)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    '<text x="60" y="42">+24 V</text><text x="60" y="332">0 V, référence</text>' +
    '<text x="192" y="104" font-size="11.5">Q ouverte</text><text x="352" y="212">i</text>' +
    '<text x="316" y="236" font-size="11.5">L = 1,2 H</text><text x="318" y="306" font-size="11.5">r = 48 Ω</text>' +
    '<text x="452" y="246" font-size="12">U_e</text><text x="452" y="228" font-size="11.5">écrêteur</text>' +
    '<text x="288" y="190" text-anchor="end" font-weight="600">+</text>' +
    '<text x="242" y="246" text-anchor="end" fill="var(--serie-2)">u_L</text><text x="112" y="100" text-anchor="end" fill="var(--serie-2)">u_Q</text></g>';
  const chemin = svgEl("path", {
    d: "M300 160V340H420V285M420 215V160H300",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 5,
    "stroke-linejoin": "round",
    opacity: 0.35,
  });
  const porteurs = svgEl("g", { fill: "currentColor", stroke: "none" });
  const dynamiques = svgEl("g", { fill: "var(--serie-2)", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(chemin, fond, porteurs, dynamiques);
  conteneur.appendChild(svg);

  /* Boucle du courant après l'ouverture : bobine vers le bas, retour par l'écrêteur. */
  const boucle = cheminFerme([
    { x: 300, y: 160 },
    { x: 300, y: 340 },
    { x: 420, y: 340 },
    { x: 420, y: 160 },
    { x: 300, y: 160 },
  ]);
  const points = [];
  for (let s = 0; s < boucle.total; s += 30) {
    const rond = svgEl("circle", { r: 3.4 });
    porteurs.appendChild(rond);
    points.push({ s0: s, rond });
  }

  const etat = { ue: 30, tms: 0 };
  const tMax = 100;

  const traceur = api.sim.traceur("#i-coupure-trace", {
    titre: "Courant et tension de la bobine après l'ouverture",
    genre: "Simulation",
    xTitre: "t après l'ouverture",
    xUnite: "ms",
    yTitre: "valeur rapportée",
    xMin: 0,
    xMax: tMax,
    yMin: -1.15,
    yMax: 1.15,
    ratio: 0.42,
    series: [
      {
        id: "i",
        nom: "i / 0,5 A",
        couleur: "serie-1",
        epaisseur: 2.6,
        fonction: (t) => (t <= etat.tms + 1e-9 ? etatCoupure(etat.ue, t / 1000).i / KM.i : NaN),
      },
      {
        id: "u",
        nom: "u_L / U_e, tension de la bobine entière",
        couleur: "serie-4",
        epaisseur: 2.2,
        fonction: (t) => (t <= etat.tms + 1e-9 ? (etatCoupure(etat.ue, t / 1000).conduit ? -1 : 0) : NaN),
      },
    ],
    echantillons: 500,
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, 0, "");
      const e = etatCoupure(etat.ue, etat.tms / 1000);
      if (e.t0 * 1000 <= tMax) marquerPoint(c, repere, couleurs, e.t0 * 1000, 0, "t0 = " + nombre(api, e.t0 * 1000, 1) + " ms");
    },
  });
  if (traceur) ressources.push(traceur);

  const valeurs = api.sim.valeurs("#i-coupure-valeurs", [
    { id: "t", libelle: "Temps depuis l'ouverture", unite: "ms", decimales: 1 },
    { id: "i", libelle: "Courant i", unite: "A", decimales: 3 },
    { id: "ub", libelle: "Tension de la bobine entière u_L", unite: "V", decimales: 1 },
    { id: "ul", libelle: "Tension de l'inductance idéale L di/dt", unite: "V", decimales: 1 },
    { id: "uq", libelle: "Tension vue par la sortie u_Q", unite: "V", decimales: 1 },
    { id: "we", libelle: "Énergie absorbée par l'écrêteur", unite: "mJ", decimales: 1 },
    { id: "wr", libelle: "Énergie dissipée dans r", unite: "mJ", decimales: 1 },
    { id: "t0", libelle: "Durée d'annulation du courant t0", unite: "ms", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher() {
    const e = etatCoupure(etat.ue, etat.tms / 1000);
    const integrale = e.we / etat.ue / (KM.i * KM.tau);
    const decalage = integrale * 150;
    for (const p of points) {
      const s = (p.s0 + decalage) % boucle.total;
      const position = pointSurChemin(boucle.points, boucle.longueurs, s);
      p.rond.setAttribute("cx", position.x.toFixed(1));
      p.rond.setAttribute("cy", position.y.toFixed(1));
      const dansBloc = Math.abs(position.x - 420) < 2 && position.y > 213 && position.y < 287;
      p.rond.setAttribute("opacity", e.conduit && !dansBloc ? "0.85" : "0");
    }
    chemin.setAttribute("opacity", e.conduit ? "0.35" : "0");
    const ub = e.conduit ? -etat.ue : 0;
    const uq = e.conduit ? KM.u + etat.ue : KM.u;
    dynamiques.innerHTML =
      '<text x="242" y="262" text-anchor="end">' + nombre(api, ub, 1) + " V</text>" +
      '<text x="112" y="116" text-anchor="end">' + nombre(api, uq, 1) + " V</text>";
    if (traceur) traceur.rafraichir();
    if (valeurs) {
      valeurs.maj({
        t: etat.tms,
        i: e.i,
        ub,
        ul: e.conduit ? -(etat.ue + KM.r * e.i) : 0,
        uq,
        we: e.we * 1000,
        wr: e.wr * 1000,
        t0: e.t0 * 1000,
      });
    }
  }

  const lecteur = api.sim.lecteur("#i-coupure-lecteur", {
    de: 0,
    a: tMax,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Ouvrir la sortie et suivre la coupure",
    rappel: (valeur) => {
      etat.tms = valeur;
      afficher();
    },
  });
  if (lecteur) ressources.push(lecteur);

  const curseurs = api.sim.curseurs(
    "#i-coupure-curseurs",
    [
      {
        id: "ue",
        libelle: "Tension d'écrêtage U_e",
        min: 0.7,
        max: 60,
        pas: 0.1,
        valeur: etat.ue,
        format: (v) => nombre(api, v, 1) + " V" + (v < 1.5 ? " (diode seule)" : ""),
      },
    ],
    (lues) => {
      etat.ue = lues.ue;
      afficher();
    }
  );
  if (curseurs) ressources.push(curseurs);
  afficher();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-1",
      titre: "Inductance d'un solénoïde à air",
      niveau: "fondamental",
      enonce:
        "<p>Un solénoïde à air comporte $300$ spires jointives réparties sur $6\\ \\mathrm{cm}$ de longueur, avec une section intérieure de $3\\ \\mathrm{cm^2}$. En le supposant long, calculez son inductance, en microhenrys.</p>",
      valeur: 565.49,
      unite: "µH",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "L",
      etapes: [
        { texte: "Unités SI : $S = 3 \\times 10^{-4}\\ \\mathrm{m^2}$, $l = 0{,}06\\ \\mathrm{m}$, $\\mu_r = 1$." },
        { texte: "$L = \\dfrac{\\mu_0N^2S}{l} = \\dfrac{1{,}2566 \\times 10^{-6} \\times 300^2 \\times 3 \\times 10^{-4}}{0{,}06}$." },
        { texte: "$300^2 = 90\\,000$, donc $L = \\dfrac{1{,}2566 \\times 10^{-6} \\times 9 \\times 10^4 \\times 3 \\times 10^{-4}}{0{,}06} = 5{,}655 \\times 10^{-4}\\ \\mathrm{H} = 565{,}5\\ \\mu\\mathrm{H}$." },
        {
          texte: "Contrôle : avec $600$ spires sur la même longueur, on trouverait quatre fois plus, $2{,}26\\ \\mathrm{mH}$.",
          note: "Erreur fréquente : oublier de mettre $N$ au carré, ce qui donne un résultat $300$ fois trop petit, ou oublier de convertir les centimètres carrés.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 240",
          "<defs>" + marqueur("fl-k1") + "</defs>" +
            '<g fill="none" stroke="currentColor" stroke-width="1.6">' +
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => '<circle cx="' + (140 + k * 32) + '" cy="70" r="6"/><circle cx="' + (140 + k * 32) + '" cy="150" r="6"/>').join("") +
            "</g>" +
            '<g stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="M140 95H420" marker-end="url(#fl-k1)"/><path d="M140 110H420" marker-end="url(#fl-k1)"/><path d="M140 125H420" marker-end="url(#fl-k1)"/></g>' +
            '<g stroke="currentColor" stroke-width="1.3" fill="none"><path d="M134 180H434M134 174V186M434 174V186"/><path d="M470 70V150M464 70H476M464 150H476"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<text x="284" y="200" text-anchor="middle">l = 0,06 m</text><text x="486" y="114">S = 3e-4 m²</text>' +
            '<text x="284" y="44" text-anchor="middle">N = 300 spires, air</text>' +
            '<text x="300" y="228" text-anchor="middle" font-weight="600">L = 1,2566e-6 × 300² × 3e-4 / 0,06 = 565,5 µH</text></g>',
          "Solénoïde de 300 spires, 6 centimètres de long et 3 centimètres carrés de section : 565,5 microhenrys"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-2",
      titre: "Énergie d'une self de lissage",
      niveau: "fondamental",
      enonce:
        "<p>La self de lissage du bus continu d'un variateur a une inductance de $2\\ \\mathrm{mH}$ et porte un courant continu de $40\\ \\mathrm{A}$. Calculez l'énergie qu'elle stocke, en joules. La correction donne aussi son flux lié.</p>",
      valeur: 1.6,
      unite: "J",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "W",
      etapes: [
        { texte: "Flux lié : $\\psi = LI = 2 \\times 10^{-3} \\times 40 = 0{,}08\\ \\mathrm{Wb}$." },
        { texte: "Énergie : $W = \\tfrac{1}{2}LI^2 = 0{,}5 \\times 2 \\times 10^{-3} \\times 1600 = 1{,}6\\ \\mathrm{J}$." },
        {
          texte: "Contrôle : $\\tfrac{1}{2}\\psi I = 0{,}5 \\times 0{,}08 \\times 40 = 1{,}6\\ \\mathrm{J}$, identique.",
          note: "À $80\\ \\mathrm{A}$, si le noyau ne saturait pas, l'énergie serait quatre fois plus grande : $6{,}4\\ \\mathrm{J}$. En pratique, la saturation fixe le courant maximal d'une self.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Énergie stockée en fonction du courant",
          genre: "Correction visuelle",
          xTitre: "I",
          xUnite: "A",
          yTitre: "W",
          yUnite: "J",
          xMin: 0,
          xMax: 90,
          yMin: 0,
          yMax: 8,
          ratio: 0.42,
          series: [{ id: "w", nom: "W = L I² / 2 pour 2 mH", couleur: "serie-1", fonction: (i) => 0.5 * 2e-3 * i * i }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 40, 1.6, "40 A : 1,6 J", false);
            marquerPoint(c, repere, couleurs, 80, 6.4, "80 A : 6,4 J");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-1",
      titre: "Ondulation de courant dans l'inductance d'un hacheur",
      niveau: "intermédiaire",
      enonce:
        "<p>Dans un hacheur abaisseur, l'inductance de $220\\ \\mu\\mathrm{H}$ reçoit une tension constante de $12\\ \\mathrm{V}$ pendant $5\\ \\mu\\mathrm{s}$, durée de conduction du transistor. De combien son courant augmente-t-il pendant cette durée, en milliampères ?</p>",
      valeur: 272.73,
      unite: "mA",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "Δi",
      etapes: [
        { texte: "Méthode : la tension est connue, on intègre. $\\Delta i = \\dfrac{1}{L}\\int u\\,\\mathrm{d}t = \\dfrac{U\\,\\Delta t}{L}$ pour une tension constante." },
        { texte: "Aire de la tension : $12 \\times 5 \\times 10^{-6} = 6 \\times 10^{-5}\\ \\mathrm{V \\cdot s}$." },
        { texte: "$\\Delta i = \\dfrac{6 \\times 10^{-5}}{220 \\times 10^{-6}} = 0{,}2727\\ \\mathrm{A} = 272{,}7\\ \\mathrm{mA}$." },
        {
          texte: "Le courant croît en rampe de pente $U/L = 54\\,545\\ \\mathrm{A/s}$ ; pendant le blocage du transistor, une tension de sens opposé le fait redescendre.",
          note: "C'est l'ondulation crête à crête du courant, grandeur de dimensionnement du cours Hacheurs DC-DC. Doubler l'inductance la diviserait par deux.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 280",
          '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8"><path d="M70 120H560M70 130V20"/><path d="M70 250H560M70 260V150"/></g>' +
            '<g stroke="currentColor" stroke-width="1.2" fill="none" stroke-dasharray="5 4" opacity="0.7"><path d="M320 120V250"/><path d="M70 170H320"/></g>' +
            '<g stroke="currentColor" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M70 120V40H320V120H556"/><path d="M70 230L320 170L556 230"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
            '<text x="62" y="44" text-anchor="end">12 V</text><text x="62" y="24" text-anchor="end" font-size="11">u_L</text>' +
            '<text x="62" y="160" text-anchor="end" font-size="11">i</text><text x="330" y="164">Δi = 272,7 mA</text>' +
            '<text x="320" y="272" text-anchor="middle">5 µs</text><text x="568" y="124">t</text><text x="568" y="254">t</text>' +
            '<text x="120" y="84">aire = 6e-5 V·s</text><text x="120" y="222">pente U/L</text></g>',
          "Créneau de tension de 12 volts pendant 5 microsecondes et rampe de courant de 272,7 milliampères"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-2",
      titre: "Association mixte et partage du courant",
      niveau: "intermédiaire",
      enonce:
        "<p>Deux inductances non couplées de $10\\ \\mathrm{mH}$ et $15\\ \\mathrm{mH}$ sont montées en parallèle, et l'ensemble est placé en série avec une inductance de $4\\ \\mathrm{mH}$. Toutes les résistances sont négligeables et tous les courants sont nuls au départ. Quand le courant total atteint $2\\ \\mathrm{A}$, quel courant traverse l'inductance de $10\\ \\mathrm{mH}$, en ampères ? La correction donne aussi l'inductance équivalente.</p>",
      valeur: 1.2,
      unite: "A",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "i10",
      etapes: [
        { texte: "Groupe parallèle : $\\dfrac{10 \\times 15}{10 + 15} = 6\\ \\mathrm{mH}$. En série avec $4\\ \\mathrm{mH}$ : $L_{eq} = 10\\ \\mathrm{mH}$." },
        { texte: "Les deux branches parallèles ont la même tension, donc $10\\,\\mathrm{d}i_{10}/\\mathrm{d}t = 15\\,\\mathrm{d}i_{15}/\\mathrm{d}t$ ; partant de zéro, $i_{10}/i_{15} = 15/10 = 1{,}5$." },
        { texte: "$i_{10} = \\dfrac{L_{\\parallel}}{10}\\,i = \\dfrac{6}{10} \\times 2 = 1{,}2\\ \\mathrm{A}$ et $i_{15} = \\dfrac{6}{15} \\times 2 = 0{,}8\\ \\mathrm{A}$." },
        {
          texte: "Contrôle : $1{,}2 + 0{,}8 = 2\\ \\mathrm{A}$. La plus petite inductance prend le plus grand courant.",
          note: "Avec des résistances de fil, la répartition en régime continu établi serait fixée par ces résistances et non par les inductances.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 260",
          "<defs>" + marqueur("fl-k4") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
            '<path d="M40 130H100"/>' +
            '<path d="M100 130H112a12 12 0 0 1 24 0a12 12 0 0 1 24 0a12 12 0 0 1 24 0a12 12 0 0 1 24 0H260"/>' +
            '<path d="M260 130V60H300a12 12 0 0 1 24 0a12 12 0 0 1 24 0a12 12 0 0 1 24 0a12 12 0 0 1 24 0H440V130"/>' +
            '<path d="M260 130V200H300a12 12 0 0 1 24 0a12 12 0 0 1 24 0a12 12 0 0 1 24 0a12 12 0 0 1 24 0H440V130"/>' +
            '<path d="M440 130H540"/></g>' +
            '<g fill="currentColor" stroke="none"><circle cx="260" cy="130" r="4"/><circle cx="440" cy="130" r="4"/></g>' +
            '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M50 118H86" marker-end="url(#fl-k4)"/><path d="M270 48H296" marker-end="url(#fl-k4)"/><path d="M270 188H296" marker-end="url(#fl-k4)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
            '<text x="68" y="106" text-anchor="middle">2 A</text><text x="160" y="160" text-anchor="middle">4 mH</text>' +
            '<text x="348" y="90" text-anchor="middle">10 mH</text><text x="348" y="230" text-anchor="middle">15 mH</text>' +
            '<text x="283" y="38" text-anchor="middle">1,2 A</text><text x="283" y="178" text-anchor="middle">0,8 A</text>' +
            '<text x="300" y="254" text-anchor="middle">Leq = 6 + 4 = 10 mH ; même tension sur les deux branches parallèles</text></g>',
          "Inductances de 10 et 15 millihenrys en parallèle, en série avec 4 millihenrys : 1,2 et 0,8 ampère"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-avance",
      titre: "Protéger la bobine d'une électrovanne",
      niveau: "avancé",
      enonce:
        "<p>Une électrovanne en $24\\ \\mathrm{V}$ continu a une bobine de $30\\ \\Omega$ et de $0{,}45\\ \\mathrm{H}$. Elle est commandée par une sortie à transistor dont la tension ne doit jamais dépasser $50\\ \\mathrm{V}$, sur un bus qui peut monter à $26{,}4\\ \\mathrm{V}$. Déterminez la tension d'écrêtage maximale admissible aux bornes de la bobine, puis, avec cette tension et au courant nominal sous $24\\ \\mathrm{V}$, la durée d'annulation du courant, en millisecondes, à l'aide de la relation de la section I. La correction donne aussi l'énergie absorbée par l'écrêteur.</p>",
      valeur: 10.524,
      unite: "ms",
      tolerance: 0.03,
      chiffres: 2,
      libelleChamp: "t0",
      etapes: [
        { texte: "Pendant la coupure, la sortie supporte $u_Q = U_{bus} + U_e$. Au bus le plus haut : $26{,}4 + U_e \\leq 50$, donc $U_e \\leq 23{,}6\\ \\mathrm{V}$." },
        { texte: "Courant nominal : $I = 24/30 = 0{,}8\\ \\mathrm{A}$ ; constante de temps : $\\tau = L/r = 0{,}45/30 = 15\\ \\mathrm{ms}$ ; énergie stockée : $\\tfrac{1}{2} \\times 0{,}45 \\times 0{,}8^2 = 0{,}144\\ \\mathrm{J}$." },
        { texte: "$t_0 = \\tau\\ln\\left(1 + \\dfrac{rI}{U_e}\\right) = 15 \\times \\ln\\left(1 + \\dfrac{24}{23{,}6}\\right) = 15 \\times \\ln(2{,}0169) = 15 \\times 0{,}7016 = 10{,}52\\ \\mathrm{ms}$." },
        { texte: "Énergie de l'écrêteur : $\\int i\\,\\mathrm{d}t = \\tau I - \\dfrac{U_e}{r}t_0 = 0{,}012 - 0{,}7867 \\times 0{,}010\\,52 = 3{,}72 \\times 10^{-3}\\ \\mathrm{C}$, d'où $W_e = 23{,}6 \\times 3{,}72 \\times 10^{-3} = 87{,}8\\ \\mathrm{mJ}$ ; le fil dissipe le reste, $56{,}2\\ \\mathrm{mJ}$." },
        {
          texte: "Contrôle : l'approximation linéaire, qui néglige $r$, donne $LI/U_e = 0{,}36/23{,}6 = 15{,}3\\ \\mathrm{ms}$ ; la résistance du fil aide le courant à décroître, le résultat exact est plus court.",
          note: "En pratique, on choisit une valeur normalisée d'écrêtage juste en dessous de $23{,}6\\ \\mathrm{V}$, en tenant compte de sa tolérance, et un composant capable d'absorber $88\\ \\mathrm{mJ}$ à chaque coupure.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const ue = 23.6;
        const r = 30;
        const tau = 0.015;
        const i0 = 0.8;
        const t0 = tau * Math.log(1 + (r * i0) / ue);
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Décroissance du courant de l'électrovanne avec un écrêtage de 23,6 V",
          genre: "Correction visuelle",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "i",
          yUnite: "A",
          xMin: 0,
          xMax: 20,
          yMin: 0,
          yMax: 0.9,
          ratio: 0.42,
          series: [
            {
              id: "i",
              nom: "i(t) avec écrêteur de 23,6 V",
              couleur: "serie-1",
              fonction: (tms) => (tms / 1000 < t0 ? (i0 + ue / r) * Math.exp(-tms / 1000 / tau) - ue / r : 0),
            },
            {
              id: "lin",
              nom: "approximation linéaire, r négligée",
              couleur: "serie-6",
              fonction: (tms) => Math.max(0, i0 - (ue / 0.45) * (tms / 1000)),
            },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, t0 * 1000, 0, "t0 = 10,52 ms", false);
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-diagnostic",
      titre: "Contacteur qui retombe trop tard",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Après remplacement du module de protection de la bobine de $KM1$ ($1{,}2\\ \\mathrm{H}$, $48\\ \\Omega$, $0{,}5\\ \\mathrm{A}$), l'automate signale que le retour d'état du contacteur arrive environ $90\\ \\mathrm{ms}$ après l'ordre d'arrêt, au lieu d'une quinzaine de millisecondes auparavant. La sortie est intacte. On soupçonne qu'une simple diode a remplacé l'écrêteur de $30\\ \\mathrm{V}$. Calculez la durée d'annulation du courant avec une diode seule, en prenant $U_e = 0{,}7\\ \\mathrm{V}$, en millisecondes. Concluez sur la cause et l'action.</p>",
      valeur: 89.087,
      unite: "ms",
      tolerance: 0.03,
      chiffres: 1,
      libelleChamp: "t0",
      etapes: [
        { texte: "Constante de temps de la bobine : $\\tau = L/r = 1{,}2/48 = 25\\ \\mathrm{ms}$ ; $rI = 24\\ \\mathrm{V}$." },
        { texte: "Diode seule : $t_0 = 25 \\times \\ln\\left(1 + \\dfrac{24}{0{,}7}\\right) = 25 \\times \\ln(35{,}29) = 25 \\times 3{,}564 = 89{,}1\\ \\mathrm{ms}$." },
        { texte: "Avec l'écrêteur de $30\\ \\mathrm{V}$ d'origine : $t_0 = 25 \\times \\ln(1{,}8) = 14{,}7\\ \\mathrm{ms}$. Les deux valeurs correspondent aux deux symptômes : la cause est bien le changement de protection." },
        {
          texte: "Action : remettre un module diode et Zener, ou équivalent, de tension d'écrêtage compatible avec la sortie ; vérifier que le temps de retombée est de nouveau conforme, et que la fonction d'arrêt n'a pas été dégradée pendant l'intervalle.",
          note: "La diode seule n'endommage rien, ce qui rend le défaut discret : c'est le temps de réponse de la fonction d'arrêt qui en souffre. Une modification de protection de bobine est une modification de l'installation, à documenter.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Décroissance du courant de KM1 selon la protection",
          genre: "Correction visuelle",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "i",
          yUnite: "A",
          xMin: 0,
          xMax: 100,
          yMin: 0,
          yMax: 0.55,
          ratio: 0.42,
          series: [
            { id: "d", nom: "diode seule, 0,7 V", couleur: "serie-1", fonction: (tms) => Math.max(0, etatCoupure(0.7, tms / 1000).i) },
            { id: "z", nom: "diode et Zener, 30 V", couleur: "serie-4", fonction: (tms) => Math.max(0, etatCoupure(30, tms / 1000).i) },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 89.09, 0, "89,1 ms", false);
            marquerPoint(c, repere, couleurs, 14.69, 0, "14,7 ms", true);
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte("#k-exercices-blocs", {
      id: "k-conceptuel",
      titre: "Une étincelle à l'ouverture, pas à la fermeture",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi une étincelle apparaît entre les contacts d'un interrupteur qui alimente une bobine au moment où on l'ouvre, et pas au moment où on le ferme.</p>",
      motsCles: [
        ["continu", "saut", "brusque", "instantan"],
        ["tension", "surtension", "di/dt", "derivee"],
        ["energie", "stock", "champ"],
        ["arc", "etincelle", "air", "claqu", "ionis"],
      ],
      minimum: 2,
      exemple: "Trois phrases suffisent : ce que fait le courant de la bobine, ce que devient la tension, et où passe l'énergie.",
      etapes: [
        { texte: "À la fermeture, le courant de la bobine part de zéro et croît progressivement : la bobine prend toute la tension de la source, mais cette tension est bornée par la source. Rien n'impose de tension excessive." },
        { texte: "À l'ouverture, le courant ne peut pas s'annuler instantanément : $u = L\\,\\mathrm{d}i/\\mathrm{d}t$ devient très grande, de signe opposé, et s'ajoute à la tension de la source entre les contacts qui s'écartent." },
        {
          texte: "Cette tension ionise l'air entre les contacts encore proches : un arc se forme et le courant continue à passer, jusqu'à ce que l'énergie $\\tfrac{1}{2}LI^2$ soit dissipée dans l'arc.",
          note: "C'est le dual du condensateur : lui produit un courant d'appel à la fermeture ; la bobine produit une surtension à l'ouverture.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 240",
          "<defs>" + marqueur("fl-k7") + "</defs>" +
            '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8"><path d="M60 110H290M60 120V20"/><path d="M330 110H570M330 120V20"/><path d="M60 230H290M60 240V140"/><path d="M330 230H570M330 240V140"/></g>' +
            '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M60 110C100 50 150 40 286 38"/><path d="M60 230V160C110 200 170 220 286 228"/><path d="M330 38H420C440 60 450 100 460 110H566"/><path d="M330 230H420V150L426 230H566"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
            '<text x="175" y="14" text-anchor="middle" font-weight="600">fermeture</text><text x="450" y="14" text-anchor="middle" font-weight="600">ouverture</text>' +
            '<text x="52" y="30" text-anchor="end">i</text><text x="322" y="30" text-anchor="end">i</text>' +
            '<text x="52" y="150" text-anchor="end">u_L</text><text x="322" y="150" text-anchor="end">u_L</text>' +
            '<text x="52" y="166" text-anchor="end">E</text><text x="436" y="160">pic très négatif</text><text x="436" y="176">borné par l\'arc</text>' +
            '<text x="120" y="210">u_L ≤ E</text></g>',
          "Courant et tension d'une bobine à la fermeture et à l'ouverture : tension bornée par la source à la fermeture, pic très négatif à l'ouverture"
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

/* Circuit en régime continu pour la question d'interprétation de schéma. */
const DESSIN_QUIZ =
  '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
  '<circle cx="60" cy="130" r="20"/><path d="M60 110V40H110"/><rect x="110" y="28" width="80" height="24" rx="3"/>' +
  '<path d="M190 40H380V90"/><path d="' + spires(380, 90, 4) + '"/><path d="M380 186V220H270"/>' +
  '<rect x="190" y="208" width="80" height="24" rx="3"/><path d="M190 220H60V150"/></g>' +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
  '<text x="60" y="126" text-anchor="middle" font-weight="600">+</text><text x="30" y="134" text-anchor="end">E</text>' +
  '<text x="150" y="72" text-anchor="middle">R1</text><text x="410" y="142">L</text><text x="230" y="252" text-anchor="middle">R2</text>' +
  '<text x="230" y="130" text-anchor="middle" font-size="12">régime continu établi</text></g>';

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>En régime continu établi, une inductance idéale se comporte comme :</p>",
        options: ["un circuit ouvert", "un court-circuit", "une résistance égale à $L$", "une source de tension"],
        bonnes: [1],
        explication: "Courant constant, donc $\\mathrm{d}i/\\mathrm{d}t = 0$ et $u = L\\,\\mathrm{d}i/\\mathrm{d}t = 0$.",
        resume: "Régime continu",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Dans un circuit où toutes les tensions restent finies, le courant d'une inductance peut sauter d'une valeur à une autre à un instant donné.</p>",
        reponse: false,
        explication: "Un saut de courant exigerait $\\mathrm{d}i/\\mathrm{d}t$ infinie, donc une tension infinie : le courant d'une inductance est continu.",
        resume: "Continuité du courant",
      },
      {
        type: "calcul",
        enonce: "<p>Deux inductances non couplées de $3\\ \\mathrm{mH}$ et $6\\ \\mathrm{mH}$ sont montées en parallèle. Quelle est l'inductance équivalente, en millihenrys ?</p>",
        valeur: 2,
        unite: "mH",
        chiffres: 2,
        explication: "$\\dfrac{3 \\times 6}{3 + 6} = 2\\ \\mathrm{mH}$ : les inductances s'associent comme les résistances.",
        resume: "Association en parallèle",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle énergie stocke une bobine de $0{,}5\\ \\mathrm{H}$ parcourue par $2\\ \\mathrm{A}$, en joules ?</p>",
        valeur: 1,
        unite: "J",
        chiffres: 2,
        explication: "$W = \\tfrac{1}{2} \\times 0{,}5 \\times 2^2 = 1\\ \\mathrm{J}$.",
        resume: "Énergie magnétique",
      },
      {
        type: "courte",
        enonce: "<p>Quelle loi indique que la tension induite dans une bobine s'oppose à la variation de courant qui l'a créée ?</p>",
        motsCles: [["lenz"]],
        minimum: 1,
        explication: "La loi de Lenz, traduite par le signe moins de la loi de Faraday, $e = -\\mathrm{d}\\psi/\\mathrm{d}t$.",
        resume: "Loi de Lenz",
      },
      {
        type: "qcm",
        enonce: "<p>On double le nombre de spires d'un solénoïde long, à longueur, section et noyau inchangés. Son inductance est :</p>",
        options: ["inchangée", "multipliée par deux", "multipliée par quatre", "divisée par deux"],
        bonnes: [2],
        explication: "$L = \\mu_0\\mu_rN^2S/l$ : l'inductance croît comme le carré du nombre de spires.",
        resume: "Inductance et nombre de spires",
      },
      {
        type: "vraiFaux",
        enonce: "<p>En convention récepteur, lorsque le courant positif d'une bobine décroît, la tension à ses bornes est négative et la bobine fournit de la puissance au reste du circuit.</p>",
        reponse: true,
        explication: "$\\mathrm{d}i/\\mathrm{d}t < 0$ donne $u < 0$, donc $p = ui < 0$ : la bobine restitue l'énergie de son champ.",
        resume: "Signe de la tension et de la puissance",
      },
      {
        type: "calcul",
        enonce: "<p>Le courant d'une inductance de $10\\ \\mathrm{mH}$ croît linéairement de $0$ à $3\\ \\mathrm{A}$ en $1{,}5\\ \\mathrm{ms}$. Quelle tension porte-t-elle, en volts ?</p>",
        valeur: 20,
        unite: "V",
        chiffres: 1,
        explication: "$\\mathrm{d}i/\\mathrm{d}t = 3/1{,}5 \\times 10^{-3} = 2000\\ \\mathrm{A/s}$, et $u = 10^{-2} \\times 2000 = 20\\ \\mathrm{V}$.",
        resume: "Relation u = L di/dt",
      },
      {
        type: "schema",
        enonce: "<p>Le circuit est en régime continu établi. Aux bornes de quel élément la tension est-elle nulle ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 460 270",
        dessin: DESSIN_QUIZ,
        zones: [
          { x: 30, y: 100, largeur: 60, hauteur: 60, etiquette: "source E" },
          { x: 110, y: 18, largeur: 80, hauteur: 44, etiquette: "résistance R1" },
          { x: 356, y: 84, largeur: 60, hauteur: 110, etiquette: "inductance L", juste: true },
          { x: 190, y: 198, largeur: 80, hauteur: 44, etiquette: "résistance R2" },
        ],
        explication: "En régime continu, l'inductance idéale est un court-circuit : sa tension est nulle, et le courant vaut $E/(R_1 + R_2)$. Les deux résistances portent chacune une tension non nulle.",
        resume: "Inductance en régime continu",
      },
      {
        type: "qcm",
        enonce: "<p>Lesquelles de ces modifications augmentent l'inductance d'un solénoïde long ?</p>",
        options: [
          { texte: "Augmenter le nombre de spires", juste: true },
          { texte: "Augmenter la section", juste: true },
          { texte: "Ajouter un noyau de perméabilité élevée, sans le saturer", juste: true },
          { texte: "Augmenter le courant" },
        ],
        multiple: true,
        explication: "$L = \\mu_0\\mu_rN^2S/l$ ne dépend que de la géométrie et du matériau ; le courant change le flux, pas l'inductance d'une bobine linéaire.",
        resume: "Paramètres de l'inductance",
      },
    ],
    { titre: "Dix questions sur les inductances et le champ magnétique" }
  );
  if (quiz) ressources.push(quiz);
}

/* --------------------------------------------------------------------------
   M. Fiche de mémorisation
   -------------------------------------------------------------------------- */

function construireCartesMemo(racine, api) {
  const cartes = api.cartes(
    "#m-cartes",
    [
      { categorie: "Définition", question: "Qu'est-ce que l'inductance d'une bobine ?", reponse: "Le rapport $L = \\psi/i$ entre le flux lié et le courant ; elle s'exprime en henrys, $1\\ \\mathrm{H} = 1\\ \\mathrm{Wb/A} = 1\\ \\mathrm{V \\cdot s/A}$." },
      { categorie: "Formule", question: "Champ au centre d'un solénoïde long ?", reponse: "$B = \\mu_0\\mu_rNi/l$, issu du théorème d'Ampère $Hl = Ni$ ; champ extérieur négligé." },
      { categorie: "Formule", question: "Inductance d'un solénoïde long ?", reponse: "$L = \\mu_0\\mu_rN^2S/l$, avec $\\mu_0 = 4\\pi \\times 10^{-7}\\ \\mathrm{H/m}$ ; proportionnelle au carré du nombre de spires." },
      { categorie: "Loi", question: "Que dit la loi de Faraday ?", reponse: "Un flux lié variable induit $e = -\\mathrm{d}\\psi/\\mathrm{d}t$ ; le signe moins est la loi de Lenz : l'effet s'oppose à sa cause." },
      { categorie: "Formule", question: "Relation tension et courant d'une inductance ?", reponse: "$u = L\\,\\mathrm{d}i/\\mathrm{d}t$ en convention récepteur ; en convention générateur, un signe moins apparaît." },
      { categorie: "Comportement", question: "Que devient une inductance idéale en régime continu établi ?", reponse: "Un court-circuit : $\\mathrm{d}i/\\mathrm{d}t = 0$ donc $u = 0$ ; une bobine réelle garde sa résistance de fil." },
      { categorie: "Comportement", question: "Que devient une bobine sans courant à la fermeture d'un circuit ?", reponse: "Un circuit ouvert momentané : son courant, continu, vaut encore zéro, et elle prend toute la tension disponible." },
      { categorie: "Formule", question: "Énergie stockée dans une inductance ?", reponse: "$W = \\tfrac{1}{2}LI^2 = \\psi^2/(2L)$, localisée dans le champ magnétique, densité $B^2/(2\\mu)$." },
      { categorie: "Association", question: "Inductance équivalente en série et en parallèle, sans couplage ?", reponse: "Série : somme des inductances. Parallèle : somme des inverses ; la plus petite inductance prend le plus grand courant." },
      {
        categorie: "Industriel",
        question: "Pourquoi protège-t-on la bobine d'un contacteur commandée par une sortie à transistor ?",
        reponse: "À l'ouverture, le courant ne peut pas s'annuler d'un coup : sans chemin, la tension $L\\,\\mathrm{d}i/\\mathrm{d}t$ détruit la sortie. L'écrêteur offre un chemin et fixe la tension, donc la durée de retombée.",
        rappel: "KM1 : 1,2 H, 0,5 A, 0,15 J ; écrêteur de 30 V, sortie à 54 V, courant nul en 14,7 ms.",
      },
    ],
    { titre: "Dix cartes sur les inductances et le champ magnétique" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

function construireRevision(racine, api) {
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: "<p>Le courant d'une bobine de $0{,}2\\ \\mathrm{H}$ croît de $50\\ \\mathrm{A}$ par seconde. Quelle tension porte-t-elle, en volts ?</p>",
        valeur: 10,
        unite: "V",
        chiffres: 1,
        explication: "$u = L\\,\\mathrm{d}i/\\mathrm{d}t = 0{,}2 \\times 50 = 10\\ \\mathrm{V}$.",
        resume: "Relation u = L di/dt (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Une inductance idéale parcourue par un courant constant de $10\\ \\mathrm{A}$ a une tension nulle à ses bornes.</p>",
        reponse: true,
        explication: "La tension dépend de la variation du courant, pas de sa valeur : $\\mathrm{d}i/\\mathrm{d}t = 0$ donne $u = 0$.",
        resume: "Tension et courant constant (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Une inductance de $25\\ \\mathrm{mH}$ porte $4\\ \\mathrm{A}$. Quel est son flux lié, en webers ?</p>",
        valeur: 0.1,
        unite: "Wb",
        chiffres: 3,
        explication: "$\\psi = LI = 25 \\times 10^{-3} \\times 4 = 0{,}1\\ \\mathrm{Wb}$.",
        resume: "Flux lié (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Deux condensateurs de $100\\ \\mu\\mathrm{F}$ et $47\\ \\mu\\mathrm{F}$ sont montés en série. Quelle est la capacité équivalente, en microfarads ?</p>",
        valeur: 31.97,
        unite: "µF",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$\\dfrac{100 \\times 47}{100 + 47} = 31{,}97\\ \\mu\\mathrm{F}$ : en série, les inverses s'additionnent, à l'opposé des inductances. Révisé du cours Condensateurs et champ électrique.",
        resume: "Association série (cours précédent)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>À la mise sous tension, un condensateur déchargé se comporte comme un circuit ouvert.</p>",
        reponse: false,
        explication: "Un condensateur déchargé impose $u = 0$ : c'est un court-circuit momentané. C'est la bobine sans courant qui se comporte comme un circuit ouvert à la fermeture. Révisé du cours Condensateurs et champ électrique.",
        resume: "Dualité à la mise sous tension (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Pendant une coupure, une bobine décrite en convention récepteur porte $u = -30\\ \\mathrm{V}$ alors que son courant vaut $i = 0{,}4\\ \\mathrm{A}$. Quelle puissance reçoit-elle, en watts ?</p>",
        valeur: -12,
        unite: "W",
        chiffres: 1,
        explication: "$p = ui = -30 \\times 0{,}4 = -12\\ \\mathrm{W}$ : puissance reçue négative, la bobine fournit $12\\ \\mathrm{W}$ à l'écrêteur. Révisé du cours Tension, courant, charge et puissance, vieux d'une semaine.",
        resume: "Puissance reçue et fournie (cours vieux d'une semaine)",
      },
      {
        type: "calcul",
        enonce: "<p>Une bobine est enroulée avec $120\\ \\mathrm{m}$ de fil de cuivre de $0{,}2\\ \\mathrm{mm}$ de diamètre, de résistivité $1{,}72 \\times 10^{-8}\\ \\Omega \\cdot \\mathrm{m}$ à $20\\ ^{\\circ}\\mathrm{C}$. Quelle est sa résistance, en ohms ?</p>",
        valeur: 65.7,
        unite: "Ω",
        tolerance: 0.02,
        chiffres: 1,
        explication: "Section $\\pi \\times (0{,}1 \\times 10^{-3})^2 = 3{,}142 \\times 10^{-8}\\ \\mathrm{m^2}$, puis $R = \\rho\\ell/s = 1{,}72 \\times 10^{-8} \\times 120/3{,}142 \\times 10^{-8} = 65{,}7\\ \\Omega$. C'est cette résistance qui fixe le courant de la bobine en régime continu. Révisé du cours Loi d'Ohm et résistivité.",
        resume: "Résistance du fil (Loi d'Ohm et résistivité)",
      },
    ],
    { titre: "Révision espacée : cette séance et les cours précédents" }
  );
  if (quiz) ressources.push(quiz);
}

/* --------------------------------------------------------------------------
   P. Auto-évaluation
   -------------------------------------------------------------------------- */

function construireAutoEval(racine, api) {
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur les inductances et le champ magnétique ?",
  });
  if (auto) ressources.push(auto);
}
