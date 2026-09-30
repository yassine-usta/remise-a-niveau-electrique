/* ==========================================================================
   cours/regime-transitoire-rl/cours.js
   Régime transitoire RL.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";

/* Exemple de la section H : frein électromagnétique à manque de courant. */
const FREIN = { e: 24, l: 0.64, r: 16, desserrage: 1.2, serrage: 0.3, ud: 0.8, ue: 39, ordre: 300 };
FREIN.tau = FREIN.l / FREIN.r;
FREIN.i = FREIN.e / FREIN.r;

/* Bobine du contacteur KM1 (sections E et I). */
const KM1 = { l: 1.2, r: 48, e: 24, appel: 0.3, retombee: 0.1 };
KM1.tau = KM1.l / KM1.r;
KM1.i = KM1.e / KM1.r;

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

/** Courant d'une bobine refermée sur un écrêteur de tension ue, à l'instant s après l'ouverture. */
function courantEcrete(i0, ue, r, tau, s) {
  const x = ue / r;
  return Math.max(0, (i0 + x) * Math.exp(-s / tau) - x);
}

/** Durée d'annulation du courant sous écrêtage. */
function dureeAnnulation(i0, ue, r, tau) {
  return tau * Math.log(1 + (r * i0) / ue);
}

/** Instant, après l'ouverture, où le courant passe sous le seuil. */
function instantSeuil(i0, ue, r, tau, seuil) {
  const x = ue / r;
  return tau * Math.log((i0 + x) / (seuil + x));
}

/** Charge ayant traversé l'écrêteur entre l'ouverture et l'instant s. */
function chargeEcretee(i0, ue, r, tau, s) {
  const t0 = dureeAnnulation(i0, ue, r, tau);
  const d = Math.min(s, t0);
  const x = ue / r;
  return (i0 + x) * tau * (1 - Math.exp(-d / tau)) - x * d;
}

/** Marqueur de flèche, défini une fois par schéma. */
function marqueur(id, remplissage) {
  return (
    '<marker id="' + id + '" markerWidth="9" markerHeight="9" refX="6" refY="4" orient="auto">' +
    '<path d="M0 0 8 4 0 8Z" fill="' + (remplissage || "currentColor") + '"/></marker>'
  );
}

/** Marqueur à taille fixe, pour les flèches dont l'épaisseur varie. */
function marqueurFixe(id) {
  return (
    '<marker id="' + id + '" markerWidth="14" markerHeight="14" refX="9" refY="6" orient="auto" markerUnits="userSpaceOnUse">' +
    '<path d="M0 0 12 6 0 12Z" fill="currentColor"/></marker>'
  );
}

/** Boucles d'une bobine : quatre spires dessinées en arcs, de haut en bas. */
function spires(x, y) {
  return "M" + x + " " + y + "a10 10 0 0 1 0 20a10 10 0 0 1 0 20a10 10 0 0 1 0 20a10 10 0 0 1 0 20";
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
function marquerPoint(c, repere, couleurs, x, y, texte, aGauche) {
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
    const gauche = aGauche != null ? aGauche : px > repere.boite.x + repere.boite.l * 0.6;
    c.textAlign = gauche ? "right" : "left";
    c.fillText(texte, px + (gauche ? -8 : 8), py - 8);
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

/** Ligne verticale en tirets sur un tracé, avec son libellé. */
function ligneVerticale(c, repere, couleurs, x, texte) {
  const px = repere.versX(x);
  c.save();
  c.setLineDash([6, 5]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.3;
  c.beginPath();
  c.moveTo(px, repere.boite.y);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  c.setLineDash([]);
  if (texte) {
    c.fillStyle = couleurs.texte;
    c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
    const gauche = px > repere.boite.x + repere.boite.l * 0.6;
    c.textAlign = gauche ? "right" : "left";
    c.fillText(texte, px + (gauche ? -6 : 6), repere.boite.y + 14);
  }
  c.restore();
}

/** Petit disque sur une courbe, à l'instant courant d'un lecteur. */
function disqueInstant(c, repere, couleurs, x, y) {
  c.save();
  c.fillStyle = couleurs.texte;
  c.beginPath();
  c.arc(repere.versX(x), repere.versY(y), 5, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** Point situé à l'abscisse curviligne s d'une ligne brisée. */
function pointSurChemin(chemin, s) {
  let reste = s;
  for (let k = 0; k < chemin.longueurs.length; k += 1) {
    if (reste <= chemin.longueurs[k] || k === chemin.longueurs.length - 1) {
      const a = chemin.points[k];
      const b = chemin.points[k + 1];
      const t = borner(reste / (chemin.longueurs[k] || 1), 0, 1);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    reste -= chemin.longueurs[k];
  }
  return chemin.points[chemin.points.length - 1];
}

function cheminOuvert(points) {
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

/** Flèche de courant dont l'épaisseur suit l'intensité, masquée si le courant est nul. */
function reglerFleche(fleche, d, fraction) {
  const f = borner(Math.abs(fraction), 0, 1);
  fleche.setAttribute("d", d);
  fleche.setAttribute("stroke-width", (1.4 + 5 * f).toFixed(2));
  fleche.setAttribute("opacity", f > 0.01 ? "1" : "0");
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
  construireAnimEtablissement(racine, api);
  construireTangente(racine, api);
  construireCoupure(racine, api);
  construireMli(racine, api);
  construireTraceExemple(racine, api);
  construireKm1(racine, api);
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
  const selecteurs = ["#e-thevenin-figure svg", "#h-circuit-figure svg"];
  for (const selecteur of selecteurs) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree: 1.4 }));
  }
  /* Chronogramme et schéma principal : tracés plus lents, dans l'ordre de lecture. */
  const chrono = racine.querySelector("#e-chrono-figure svg");
  if (chrono) ressources.push(api.dessiner(chrono, { duree: 2 }));
  const principal = racine.querySelector("#f-schema-principal svg");
  if (principal) ressources.push(api.dessiner(principal, { duree: 2.2 }));
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-logarithme",
      titre: "Temps pour parcourir 90 % du chemin",
      niveau: "diagnostic",
      enonce:
        "<p>Rappel du cours Régime transitoire RC : une grandeur du premier ordre a parcouru la fraction $1 - e^{-x}$ du chemin vers sa valeur finale après $x$ constantes de temps. Pour quelle valeur de $x$ a-t-elle parcouru $90\\ \\%$ du chemin ? Donnez $x$ avec trois chiffres significatifs.</p>",
      valeur: Math.log(10),
      unite: "",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "x",
      etapes: [
        { texte: "Il reste $10\\ \\%$ de l'écart : $e^{-x} = 0{,}1$." },
        { texte: "En prenant le logarithme népérien : $x = -\\ln 0{,}1 = \\ln 10$." },
        {
          texte: "$x = 2{,}303$.",
          note: "Ce repère servira à l'appel d'un contacteur : atteindre $90\\ \\%$ du courant final demande $2{,}3\\,\\tau$, soit $57{,}6\\ \\mathrm{ms}$ pour la bobine de $KM1$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Fraction du chemin parcourue",
          genre: "Correction visuelle",
          xTitre: "x = t / τ",
          yTitre: "1 - e^-x",
          xMin: 0,
          xMax: 5,
          yMin: 0,
          yMax: 1.05,
          ratio: 0.4,
          series: [{ id: "f", nom: "1 - e^-x", couleur: "serie-1", fonction: (x) => 1 - Math.exp(-x) }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, Math.log(10), 0.9, "90 % pour x = 2,303");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-tension-l",
      titre: "Tension d'une inductance",
      niveau: "diagnostic",
      enonce:
        "<p>Rappel du cours Inductances et champ magnétique : le courant d'une inductance idéale de $0{,}2\\ \\mathrm{H}$ croît de $50\\ \\mathrm{A}$ par seconde. Quelle tension apparaît à ses bornes, en volts, en convention récepteur ?</p>",
      valeur: 10,
      unite: "V",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "u_L",
      etapes: [
        { texte: "$u_L = L\\,\\dfrac{\\mathrm{d}i}{\\mathrm{d}t} = 0{,}2 \\times 50$." },
        {
          texte: "$u_L = 10\\ \\mathrm{V}$, positive puisque le courant croît.",
          note: "Réciproquement, une tension de $10\\ \\mathrm{V}$ imposée à cette inductance fait croître son courant de $50\\ \\mathrm{A/s}$ : c'est la pente initiale d'un établissement.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Courant en rampe et tension constante",
          genre: "Correction visuelle",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "i",
          yUnite: "A",
          xMin: 0,
          xMax: 40,
          yMin: 0,
          yMax: 2.2,
          ratio: 0.4,
          series: [{ id: "i", nom: "i(t), pente 50 A/s soit 0,05 A/ms", couleur: "serie-1", fonction: (t) => 0.05 * t }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 20, 1, "u_L = L di/dt = 10 V, constante");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-thevenin",
      titre: "Résistance vue par une bobine",
      niveau: "diagnostic",
      enonce:
        "<p>Une source de tension idéale alimente, à travers $R_1 = 30\\ \\Omega$, un nœud $A$ relié à la masse par $R_2 = 60\\ \\Omega$. Une bobine est branchée entre $A$ et la masse. Quelle résistance de Thévenin la bobine voit-elle, en ohms ?</p>",
      valeur: 20,
      unite: "Ω",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "R_th",
      etapes: [
        { texte: "On éteint la source de tension : elle devient un fil, qui relie l'extrémité libre de $R_1$ à la masse." },
        { texte: "Vues du nœud $A$, $R_1$ et $R_2$ vont toutes deux à la masse : elles sont en parallèle." },
        {
          texte: "$R_{th} = \\dfrac{30 \\times 60}{30 + 60} = 20\\ \\Omega$.",
          note: "La constante de temps de la bobine sera $L/R_{th}$ : plus longue qu'avec $R_1$ seule.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 220",
          '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<path d="M60 40H120M180 40H260V80M260 140V180H60V40"/><rect x="120" y="28" width="60" height="24" rx="3"/><rect x="248" y="80" width="24" height="60" rx="3"/>' +
            '<path d="M380 40H440M500 40H520V180H380V40"/><rect x="440" y="28" width="60" height="24" rx="3"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
            '<circle cx="260" cy="40" r="4"/><circle cx="260" cy="180" r="4"/>' +
            '<text x="150" y="70" text-anchor="middle">R1 = 30 Ω</text><text x="282" y="114">R2 = 60 Ω</text>' +
            '<text x="66" y="112">source éteinte = fil</text><text x="268" y="34">A</text>' +
            '<text x="470" y="70" text-anchor="middle">R_th</text><text x="450" y="118" text-anchor="middle">30 × 60 / 90</text>' +
            '<text x="450" y="140" text-anchor="middle">= 20 Ω</text><text x="300" y="210" text-anchor="middle">vue entre A et la masse : R1 en parallèle avec R2</text></g>',
          "Source éteinte remplacée par un fil : R1 et R2 en parallèle entre A et la masse, 20 ohms"
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : établissement puis roue libre
   -------------------------------------------------------------------------- */

function construireAnimEtablissement(racine, api) {
  const conteneur = racine.querySelector("#d-anim");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 420",
    role: "img",
    "aria-label": "Établissement du courant dans une bobine puis roue libre par une diode : interrupteur, porteurs en mouvement, jauges de courant et d'énergie stockée",
  });
  const fond = svgEl("g");
  fond.innerHTML =
    "<defs>" + marqueur("fl-d-anim") + marqueur("fl-d-anim-u", "var(--serie-2)") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="90" cy="200" r="24"/><path d="M90 176V80H180M243 80H520V176M400 80V110M400 190V210M400 260V320M520 206V320H90V224"/>' +
    '<path d="' + spires(400, 110) + '"/>' +
    '<rect x="388" y="210" width="24" height="50" rx="3"/>' +
    '<path d="M504 176H536"/><path d="M504 206H536L520 178Z"/>' +
    '<path d="M250 320V332M236 332H264M241 338H259M246 344H254"/></g>' +
    '<g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="183" cy="80" r="3.2"/><circle cx="240" cy="80" r="3.2"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="400" cy="80" r="4"/><circle cx="400" cy="320" r="4"/></g>' +
    '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M372 214V250" marker-end="url(#fl-d-anim)"/></g>' +
    '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M446 188V116" marker-end="url(#fl-d-anim-u)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    '<text x="90" y="195" text-anchor="middle" font-weight="600">+</text><text x="90" y="216" text-anchor="middle" font-weight="600">-</text>' +
    '<text x="58" y="205" text-anchor="end">E</text><text x="212" y="104" text-anchor="middle">K</text>' +
    '<text x="408" y="72">A</text><text x="408" y="340">B</text><text x="386" y="116" text-anchor="end" font-weight="600">+</text>' +
    '<text x="420" y="152">L</text><text x="424" y="240">r</text><text x="364" y="236" text-anchor="end">i</text>' +
    '<text x="548" y="196">D</text><text x="454" y="156" style="fill: var(--serie-2)">u_L</text>' +
    '<text x="268" y="346" font-size="11.5">référence 0 V</text></g>';
  const lame = svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-linecap": "round" });
  const phase = svgEl("text", { x: 350, y: 30, "text-anchor": "middle", "font-family": "ui-monospace, monospace", "font-size": 13, "font-weight": 600, fill: "currentColor" });
  const porteurs = svgEl("g", { fill: "currentColor", stroke: "none" });
  const jauges = svgEl("g");
  svg.append(fond, lame, phase, porteurs, jauges);
  conteneur.appendChild(svg);

  /* Boucles parcourues dans le sens réel du courant. */
  const boucleEtablissement = cheminOuvert([
    { x: 90, y: 176 },
    { x: 90, y: 80 },
    { x: 400, y: 80 },
    { x: 400, y: 320 },
    { x: 90, y: 320 },
    { x: 90, y: 224 },
  ]);
  const boucleRoueLibre = cheminOuvert([
    { x: 400, y: 80 },
    { x: 400, y: 320 },
    { x: 520, y: 320 },
    { x: 520, y: 80 },
    { x: 400, y: 80 },
  ]);
  const ronds = [];
  for (let k = 0; k < 40; k += 1) {
    const rond = svgEl("circle", { r: 3.4 });
    porteurs.appendChild(rond);
    ronds.push(rond);
  }
  const pas = 30;
  const echelle = 60;

  const valeurs = api.sim.valeurs("#d-anim-valeurs", [
    { id: "k", libelle: "État de K", format: (v) => (v ? "ouvert, roue libre par D" : "fermé, établissement") },
    { id: "t", libelle: "Temps rapporté à la constante de temps L / r", decimales: 2 },
    { id: "i", libelle: "Courant i / I∞", unite: "%", decimales: 1 },
    { id: "u", libelle: "Tension u_L / E, signée", unite: "%", decimales: 1 },
    { id: "wl", libelle: "Énergie stockée / (L I∞² / 2)", unite: "%", decimales: 1 },
    { id: "ws", libelle: "Énergie fournie par la source / (L I∞² / 2)", unite: "%", decimales: 1 },
    { id: "wr", libelle: "Énergie dissipée dans r / (L I∞² / 2)", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const i5 = 1 - Math.exp(-5);
  const q5 = 5 - i5;

  function afficher(t) {
    const ferme = t <= 5;
    let i;
    let u;
    let q;
    if (ferme) {
      i = 1 - Math.exp(-t);
      u = Math.exp(-t);
      q = t - i;
    } else {
      i = i5 * Math.exp(-(t - 5));
      u = -i;
      q = q5 + (i5 - i);
    }
    const ws = 2 * (ferme ? q : q5);
    const wl = i * i;

    lame.setAttribute("d", ferme ? "M183 80L237 78" : "M183 80L226 56");
    phase.textContent = ferme ? "établissement : K fermé" : "roue libre : K ouvert, D conduit";

    const chemin = ferme ? boucleEtablissement : boucleRoueLibre;
    const decalage = q * echelle;
    const nombreRonds = Math.floor(chemin.total / pas);
    ronds.forEach((rond, index) => {
      if (index >= nombreRonds) {
        rond.setAttribute("opacity", "0");
        return;
      }
      const s = (index * pas + decalage) % chemin.total;
      const p = pointSurChemin(chemin, s);
      const dansSource = Math.abs(p.x - 90) < 2 && p.y > 176 && p.y < 224;
      rond.setAttribute("cx", p.x.toFixed(1));
      rond.setAttribute("cy", p.y.toFixed(1));
      rond.setAttribute("opacity", dansSource ? "0" : "0.85");
    });

    jauges.innerHTML =
      jauge(250, 372, 330, "i / I∞", i, Math.round(i * 100) + " %") +
      jauge(250, 396, 330, "W_L / W∞", wl, Math.round(wl * 100) + " %");

    if (valeurs) valeurs.maj({ k: ferme ? 0 : 1, t, i: i * 100, u: u * 100, wl: wl * 100, ws: ws * 100, wr: (ws - wl) * 100 });
  }

  const lecteur = api.sim.lecteur("#d-anim-lecteur", {
    de: 0,
    a: 10,
    duree: 16,
    boucle: false,
    auto: false,
    libelle: "Établir le courant puis ouvrir K",
    rappel: (valeur) => afficher(valeur),
  });
  if (lecteur) ressources.push(lecteur);
  afficher(0);
}

/* --------------------------------------------------------------------------
   E. Simulation : courant, tension de l'inductance et tangente
   -------------------------------------------------------------------------- */

const TAN = { x0: 70, x1: 590, yBas: 190, yHaut: 44, yU: 292, hU: 52, yAxe: 380 };

function construireTangente(racine, api) {
  const conteneur = racine.querySelector("#e-tangente");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 660 404",
    role: "img",
    "aria-label": "Courant d'une bobine et tension de son inductance en fonction du temps, avec la valeur finale du courant et la tangente en un instant choisi par une poignée sur l'axe des temps",
  });
  const pxTau = (TAN.x1 - TAN.x0) / 5;
  let graduations = "";
  for (let k = 1; k <= 5; k += 1) {
    const x = TAN.x0 + k * pxTau;
    graduations += '<path d="M' + x + " " + TAN.yBas + "v6M" + x + " " + TAN.yU + "v6M" + x + " " + TAN.yAxe + 'v-6"/>';
  }
  const fond = svgEl("g");
  fond.innerHTML =
    "<defs>" +
    '<clipPath id="clip-e-tan-i"><rect x="' + TAN.x0 + '" y="24" width="' + (TAN.x1 - TAN.x0 + 20) + '" height="' + (TAN.yBas - 24) + '"/></clipPath>' +
    '<clipPath id="clip-e-tan-u"><rect x="' + TAN.x0 + '" y="' + (TAN.yU - TAN.hU - 6) + '" width="' + (TAN.x1 - TAN.x0 + 20) + '" height="' + (2 * TAN.hU + 12) + '"/></clipPath>' +
    "</defs>" +
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8">' +
    '<path d="M' + TAN.x0 + " " + TAN.yBas + "H" + (TAN.x1 + 16) + "M" + TAN.x0 + " " + (TAN.yBas + 8) + 'V24"/>' +
    '<path d="M' + TAN.x0 + " " + TAN.yU + "H" + (TAN.x1 + 16) + "M" + TAN.x0 + " " + (TAN.yU + TAN.hU + 6) + "V" + (TAN.yU - TAN.hU - 8) + '"/>' +
    '<path d="M' + TAN.x0 + " " + TAN.yAxe + "H" + TAN.x1 + '" stroke-width="3" opacity="0.5"/>' + graduations + "</g>" +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5">' +
    '<text x="' + (TAN.x1 + 20) + '" y="' + (TAN.yBas + 4) + '">t</text><text x="' + (TAN.x0 - 8) + '" y="22" text-anchor="end">i</text>' +
    '<text x="' + (TAN.x0 - 8) + '" y="' + (TAN.yBas + 4) + '" text-anchor="end">0</text>' +
    '<text x="' + (TAN.x1 + 20) + '" y="' + (TAN.yU + 4) + '">t</text><text x="' + (TAN.x0 - 8) + '" y="' + (TAN.yU - TAN.hU - 10) + '" text-anchor="end">u_L</text>' +
    '<text x="' + (TAN.x0 - 8) + '" y="' + (TAN.yU + 4) + '" text-anchor="end">0</text>' +
    '<text x="' + (TAN.x0 - 8) + '" y="' + (TAN.yAxe + 4) + '" text-anchor="end">t</text></g>';
  const textesAxe = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11 });
  const zoneI = svgEl("g", { "clip-path": "url(#clip-e-tan-i)" });
  const zoneU = svgEl("g", { "clip-path": "url(#clip-e-tan-u)" });
  const asymptote = svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", "stroke-dasharray": "10 6", opacity: 0.75 });
  const guides = svgEl("path", { stroke: "currentColor", "stroke-width": 1, fill: "none", opacity: 0.55 });
  const courbeI = svgEl("path", { stroke: "currentColor", "stroke-width": 2.8, fill: "none", "stroke-linecap": "round" });
  const tangente = svgEl("path", { "stroke-width": 2, fill: "none", "stroke-dasharray": "4 4", style: "stroke: var(--serie-2)" });
  const pointI = svgEl("circle", { r: 5, fill: "currentColor" });
  const courbeU = svgEl("path", { stroke: "currentColor", "stroke-width": 2.8, fill: "none", "stroke-linecap": "round" });
  const guideU = svgEl("path", { stroke: "currentColor", "stroke-width": 1, fill: "none", opacity: 0.55 });
  const pointU = svgEl("circle", { r: 5, fill: "currentColor" });
  zoneI.append(asymptote, guides, courbeI, tangente, pointI);
  zoneU.append(guideU, courbeU, pointU);
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  svg.append(fond, zoneI, zoneU, textesAxe, etiquettes);
  conteneur.appendChild(svg);

  const etat = { l: 1200, r: 48, e: 24, i0: 0, t: 1 };

  const valeurs = api.sim.valeurs("#e-tangente-valeurs", [
    { id: "tau", libelle: "Constante de temps L / R", unite: "ms", decimales: 2 },
    { id: "t", libelle: "Instant étudié t", unite: "ms", decimales: 2 },
    { id: "ttau", libelle: "Instant rapporté à L / R", decimales: 2 },
    { id: "iinf", libelle: "Courant final E / R", unite: "A", decimales: 3 },
    { id: "i", libelle: "Courant i(t)", unite: "A", decimales: 3 },
    { id: "u", libelle: "Tension u_L(t)", unite: "V", decimales: 2 },
    { id: "pente", libelle: "Pente di/dt = u_L / L", unite: "A/s", decimales: 2 },
    { id: "ecart", libelle: "Écart restant / écart initial", unite: "%", decimales: 1 },
    { id: "w", libelle: "Énergie stockée L i² / 2", unite: "mJ", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const l = etat.l / 1000;
    const tau = l / etat.r;
    const iinf = etat.e / etat.r;
    const imax = Math.max(iinf, etat.i0, 0.001) * 1.12;
    const u0 = etat.e - etat.r * etat.i0;
    const umax = Math.max(Math.abs(u0), 0.001);
    const vyI = (i) => TAN.yBas - ((TAN.yBas - TAN.yHaut) * i) / (imax / 1.12);
    const vyU = (u) => TAN.yU - (TAN.hU * u) / umax;
    const vx = (n) => TAN.x0 + n * pxTau;
    const fi = (n) => iinf + (etat.i0 - iinf) * Math.exp(-n);
    const fu = (n) => u0 * Math.exp(-n);

    let di = "";
    let du = "";
    for (let k = 0; k <= 100; k += 1) {
      const n = (5 * k) / 100;
      di += (k ? "L" : "M") + vx(n).toFixed(1) + " " + vyI(fi(n)).toFixed(1);
      du += (k ? "L" : "M") + vx(n).toFixed(1) + " " + vyU(fu(n)).toFixed(1);
    }
    courbeI.setAttribute("d", di);
    courbeU.setAttribute("d", du);
    asymptote.setAttribute("d", "M" + TAN.x0 + " " + vyI(iinf).toFixed(1) + "H" + (TAN.x1 + 16));

    const n0 = etat.t;
    const i = fi(n0);
    const u = fu(n0);
    const px = vx(n0);
    const py = vyI(i);
    tangente.setAttribute("d", "M" + px.toFixed(1) + " " + py.toFixed(1) + "L" + vx(n0 + 1).toFixed(1) + " " + vyI(iinf).toFixed(1));
    guides.setAttribute(
      "d",
      "M" + px.toFixed(1) + " " + py.toFixed(1) + "V" + TAN.yBas + "M" + vx(n0 + 1).toFixed(1) + " " + vyI(iinf).toFixed(1) + "V" + TAN.yBas
    );
    pointI.setAttribute("cx", px.toFixed(1));
    pointI.setAttribute("cy", py.toFixed(1));
    guideU.setAttribute("d", "M" + px.toFixed(1) + " " + (TAN.yU - TAN.hU - 4) + "V" + (TAN.yU + TAN.hU + 4));
    pointU.setAttribute("cx", px.toFixed(1));
    pointU.setAttribute("cy", vyU(u).toFixed(1));

    let textes = "";
    for (let k = 1; k <= 5; k += 1) {
      textes += '<text x="' + vx(k) + '" y="' + (TAN.yBas + 18) + '" text-anchor="middle">' + (k === 1 ? "τ" : k + "τ") + "</text>";
      const ms = k * tau * 1000;
      textes += '<text x="' + vx(k) + '" y="' + (TAN.yAxe + 18) + '" text-anchor="middle">' + nombre(api, ms, ms >= 100 ? 0 : 1) + " ms</text>";
    }
    textesAxe.innerHTML = textes;
    etiquettes.innerHTML =
      '<text x="' + (TAN.x0 - 8) + '" y="' + (vyI(iinf) + 4).toFixed(1) + '" text-anchor="end">E/R</text>' +
      (Math.abs(etat.i0 - iinf) > 0.05 * imax && etat.i0 > 0.04 * imax
        ? '<text x="' + (TAN.x0 - 8) + '" y="' + (vyI(etat.i0) + 4).toFixed(1) + '" text-anchor="end">I0</text>'
        : "") +
      '<text x="' + (TAN.x1 + 16) + '" y="' + (vyI(iinf) - 8).toFixed(1) + '" text-anchor="end">valeur finale ' + nombre(api, iinf, 3) + " A</text>" +
      '<text x="' + (TAN.x0 + 8) + '" y="' + (vyU(u0) + (u0 >= 0 ? -8 : 16)).toFixed(1) + '">u_L(0+) = ' + nombre(api, u0, 1) + " V</text>" +
      (n0 + 1 <= 5.05 ? '<text x="' + vx(n0 + 1).toFixed(1) + '" y="' + (TAN.yBas - 6) + '" text-anchor="middle">t + τ</text>' : "");

    if (valeurs) {
      const ecart0 = etat.i0 - iinf;
      valeurs.maj({
        tau: tau * 1000,
        t: n0 * tau * 1000,
        ttau: n0,
        iinf,
        i,
        u,
        pente: u / l,
        ecart: Math.abs(ecart0) < 1e-12 ? 0 : ((i - iinf) / ecart0) * 100,
        w: 0.5 * l * i * i * 1000,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: TAN.x0, y: TAN.yAxe },
    a: { x: TAN.x1, y: TAN.yAxe },
    min: 0,
    max: 5,
    pas: 0.05,
    valeur: etat.t,
    libelle: "Instant étudié, en multiples de τ",
    format: (mesure) => api.util.formater(mesure.valeur, 2) + " τ",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.t = mesure.valeur;
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-tangente-curseurs",
    [
      { id: "l", libelle: "Inductance L", min: 10, max: 2000, pas: 10, valeur: etat.l, unite: "mH" },
      { id: "r", libelle: "Résistance totale R", min: 5, max: 200, pas: 1, valeur: etat.r, unite: "Ω" },
      { id: "e", libelle: "Tension de source E", min: 0, max: 48, pas: 0.5, valeur: etat.e, unite: "V" },
      { id: "i0", libelle: "Courant initial I0", min: 0, max: 2, pas: 0.05, valeur: etat.i0, unite: "A", chiffres: 2 },
    ],
    (lues) => {
      Object.assign(etat, lues);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Animation et simulation : coupure sur une résistance de décharge
   -------------------------------------------------------------------------- */

function construireCoupure(racine, api) {
  const conteneur = racine.querySelector("#e-coupure");
  if (!conteneur) return;

  const OUVERTURE = 10;
  const XMAX = 60;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 310",
    role: "img",
    "aria-label": "Bobine du contacteur KM1 alimentée par un interrupteur K et shuntée par une résistance de décharge R d ; flèches de courant dont l'épaisseur suit l'intensité et jauge du courant de la bobine",
  });
  const fond = svgEl("g");
  fond.innerHTML =
    "<defs>" + marqueurFixe("fl-e-coup") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="80" cy="150" r="24"/><path d="M80 126V50H170M233 50H480V110M360 50V80M360 160V172M360 216V250M480 180V250H80V174"/>' +
    '<path d="' + spires(360, 80) + '"/>' +
    '<rect x="348" y="172" width="24" height="44" rx="3"/><rect x="468" y="110" width="24" height="70" rx="3"/>' +
    '<path d="M250 250V262M236 262H264M241 268H259M246 274H254"/></g>' +
    '<g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="173" cy="50" r="3.2"/><circle cx="230" cy="50" r="3.2"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="360" cy="50" r="4"/><circle cx="360" cy="250" r="4"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    '<text x="80" y="145" text-anchor="middle" font-weight="600">+</text><text x="80" y="166" text-anchor="middle" font-weight="600">-</text>' +
    '<text x="48" y="154" text-anchor="end">24 V</text><text x="202" y="74" text-anchor="middle">K</text>' +
    '<text x="368" y="42">A</text><text x="348" y="86" text-anchor="end" font-weight="600">+</text>' +
    '<text x="380" y="126">L = 1,2 H</text><text x="380" y="200">r = 48 Ω</text><text x="460" y="150" text-anchor="end">R_d</text>' +
    '<text x="272" y="272" font-size="11.5">référence 0 V</text></g>';
  const lame = svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-linecap": "round" });
  const flecheK = svgEl("path", { stroke: "currentColor", fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-coup)" });
  const flecheL = svgEl("path", { stroke: "currentColor", fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-coup)" });
  const flecheD = svgEl("path", { stroke: "currentColor", fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-e-coup)" });
  const dynamiques = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  const jaugeG = svgEl("g");
  svg.append(fond, lame, flecheK, flecheL, flecheD, dynamiques, jaugeG);
  conteneur.appendChild(svg);

  const etat = { rd: 10, t: 0 };
  let calc = {};

  function calculer() {
    const tau = KM1.l / (KM1.r + etat.rd);
    calc = {
      tau: tau * 1000,
      umax: KM1.e + etat.rd * KM1.i,
      wrd: 0.5 * KM1.l * KM1.i * KM1.i * (etat.rd / (KM1.r + etat.rd)),
      wr: 0.5 * KM1.l * KM1.i * KM1.i * (KM1.r / (KM1.r + etat.rd)),
      tseuil: tau * 1000 * Math.log(KM1.i / KM1.retombee),
      p: (KM1.e * KM1.e) / etat.rd,
    };
  }

  const courant = (t) => (t < OUVERTURE ? KM1.i : KM1.i * Math.exp(-(t - OUVERTURE) / calc.tau));
  const tensionK = (t) => (t < OUVERTURE ? 0 : KM1.e + etat.rd * courant(t));

  calculer();
  const traceI = api.sim.traceur("#e-coupure-courant", {
    titre: "Courant de la bobine",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "i",
    yUnite: "A",
    xMin: 0,
    xMax: XMAX,
    yMin: 0,
    yMax: 0.6,
    ratio: 0.34,
    echantillons: 600,
    series: [{ id: "i", nom: "i(t) dans la bobine", couleur: "serie-1", epaisseur: 2.6, fonction: courant }],
    surDessin({ c, repere, couleurs }) {
      ligneVerticale(c, repere, couleurs, OUVERTURE, "ouverture de K");
      ligneHorizontale(c, repere, couleurs, KM1.retombee, "0,1 A");
      disqueInstant(c, repere, couleurs, etat.t, courant(etat.t));
    },
  });
  if (traceI) ressources.push(traceI);

  const traceU = api.sim.traceur("#e-coupure-tension", {
    titre: "Tension aux bornes de l'interrupteur",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "u_K",
    yUnite: "V",
    xMin: 0,
    xMax: XMAX,
    yMin: 0,
    yMax: 70,
    ratio: 0.34,
    echantillons: 600,
    series: [{ id: "u", nom: "u_K(t) = E + R_d i après l'ouverture", couleur: "serie-3", epaisseur: 2.6, fonction: tensionK }],
    surDessin({ c, repere, couleurs }) {
      ligneVerticale(c, repere, couleurs, OUVERTURE, "");
      ligneHorizontale(c, repere, couleurs, 60, "tenue de la sortie 60 V");
      disqueInstant(c, repere, couleurs, etat.t, tensionK(etat.t));
    },
  });
  if (traceU) ressources.push(traceU);

  const valeurs = api.sim.valeurs("#e-coupure-valeurs", [
    { id: "t", libelle: "Instant t", unite: "ms", decimales: 1 },
    { id: "i", libelle: "Courant de la bobine", unite: "A", decimales: 3 },
    { id: "u", libelle: "Tension aux bornes de K", unite: "V", decimales: 1 },
    { id: "umax", libelle: "Tension maximale sur K, E + R_d I0", unite: "V", decimales: 0 },
    { id: "tau", libelle: "Constante de temps d'extinction L / (r + R_d)", unite: "ms", decimales: 2 },
    { id: "ts", libelle: "Durée pour passer sous 0,1 A", unite: "ms", decimales: 1 },
    { id: "wrd", libelle: "Énergie dissipée dans R_d", unite: "mJ", decimales: 1 },
    { id: "wr", libelle: "Énergie dissipée dans r", unite: "mJ", decimales: 1 },
    { id: "p", libelle: "Consommation permanente de R_d, K fermé", unite: "W", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher() {
    const t = etat.t;
    const ferme = t < OUVERTURE;
    const i = courant(t);
    const id = ferme ? KM1.e / etat.rd : i;
    lame.setAttribute("d", ferme ? "M173 50L227 48" : "M173 50L216 26");
    reglerFleche(flecheK, "M268 50H316", ferme ? (KM1.i + KM1.e / etat.rd) / 1.5 : 0);
    reglerFleche(flecheL, "M330 92V138", i / KM1.i);
    reglerFleche(flecheD, ferme ? "M516 122V168" : "M516 168V122", id / 1.5);
    dynamiques.innerHTML =
      '<text x="660" y="30" text-anchor="end" font-weight="600">' + (ferme ? "K fermé" : "K ouvert : i passe par R_d") + "</text>" +
      '<text x="292" y="42" text-anchor="middle">i_K</text><text x="322" y="118" text-anchor="end">i</text>' +
      '<text x="530" y="200">' + (ferme ? "E / R_d" : "i") + "</text>" +
      '<text x="660" y="60" text-anchor="end">R_d = ' + nombre(api, etat.rd, 0) + " Ω</text>";
    jaugeG.innerHTML = jauge(250, 280, 300, "i / 0,5 A", i / KM1.i, Math.round((i / KM1.i) * 100) + " %");
    if (valeurs) {
      valeurs.maj({ t, i, u: tensionK(t), umax: calc.umax, tau: calc.tau, ts: calc.tseuil, wrd: calc.wrd * 1000, wr: calc.wr * 1000, p: calc.p });
    }
    if (traceI) traceI.demanderRendu();
    if (traceU) traceU.demanderRendu();
  }

  let lecteur = null;

  function majParametres() {
    calculer();
    if (traceI) traceI.definirFonction("i", courant);
    if (traceU) {
      traceU.definirPlage({ xMin: 0, xMax: XMAX, yMin: 0, yMax: Math.max(70, Math.ceil((calc.umax * 1.12) / 50) * 50) });
      traceU.definirFonction("u", tensionK);
    }
    etat.t = (lecteur ? lecteur.valeur() : 0) * XMAX;
    afficher();
  }

  lecteur = api.sim.lecteur("#e-coupure-lecteur", {
    de: 0,
    a: 1,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Ouvrir K et suivre l'extinction du courant",
    rappel: (valeur) => {
      etat.t = valeur * XMAX;
      afficher();
    },
  });
  if (lecteur) ressources.push(lecteur);

  const curseurs = api.sim.curseurs(
    "#e-coupure-curseurs",
    [{ id: "rd", libelle: "Résistance de décharge R_d", min: 10, max: 1000, pas: 2, valeur: etat.rd, unite: "Ω" }],
    (lues) => {
      etat.rd = lues.rd;
      majParametres();
    }
  );
  if (curseurs) ressources.push(curseurs);
  majParametres();
}

/* --------------------------------------------------------------------------
   E. Simulation : commande en modulation de largeur d'impulsion
   -------------------------------------------------------------------------- */

function regimeMli(e, r, lH, f, alpha) {
  const tau = lH / r;
  const T = 1 / f;
  const iinf = e / r;
  const a = Math.exp((-alpha * T) / tau);
  const b = Math.exp((-(1 - alpha) * T) / tau);
  const imax = (iinf * (1 - a)) / (1 - a * b);
  const imin = imax * b;
  return { tau, T, iinf, a, b, imax, imin, moyen: alpha * iinf, diode: (imax * tau * (1 - b)) / T };
}

function construireMli(racine, api) {
  const E = 24;
  const R = 24;
  const etat = { l: 120, f: 1000, alpha: 0.5 };
  let reg = regimeMli(E, R, etat.l / 1000, etat.f, etat.alpha);

  function courant(tms) {
    const t = tms / 1000;
    const s = t - Math.floor(t / reg.T) * reg.T;
    const ton = etat.alpha * reg.T;
    if (s < ton) return reg.iinf + (reg.imin - reg.iinf) * Math.exp(-s / reg.tau);
    return reg.imax * Math.exp(-(s - ton) / reg.tau);
  }

  const traceur = api.sim.traceur("#e-mli-trace", {
    titre: "Courant d'une électrovanne commandée en MLI, régime établi",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "i",
    yUnite: "A",
    xMin: 0,
    xMax: 3000 / etat.f,
    yMin: 0,
    yMax: 1.1,
    echantillons: 900,
    series: [
      { id: "i", nom: "courant i(t) de la bobine", couleur: "serie-1", epaisseur: 2.8, fonction: courant },
      { id: "m", nom: "courant moyen α E / r", couleur: "serie-3", epaisseur: 1.4, fonction: () => reg.moyen },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, reg.imax, "I max");
      ligneHorizontale(c, repere, couleurs, reg.imin, "I min");
    },
    note: "Trois périodes en régime établi ; E = 24 V, r = 24 Ω, diode supposée idéale.",
  });
  if (traceur) ressources.push(traceur);

  function maj() {
    reg = regimeMli(E, R, etat.l / 1000, etat.f, etat.alpha);
    if (!traceur) return;
    traceur.definirPlage({ xMin: 0, xMax: 3000 / etat.f });
    traceur.definirFonction("i", courant);
    traceur.definirFonction("m", () => reg.moyen);
    const approx = (E * etat.alpha * (1 - etat.alpha)) / ((etat.l / 1000) * etat.f);
    traceur.definirMesures([
      { nom: "Constante de temps L / r", valeur: nombre(api, reg.tau * 1000, 2) + " ms" },
      { nom: "Période T et rapport T sur L / r", valeur: nombre(api, reg.T * 1000, 3) + " ms ; " + nombre(api, reg.T / reg.tau, 3) },
      { nom: "Courant moyen, rapport cyclique fois E / r", valeur: nombre(api, reg.moyen, 3) + " A" },
      { nom: "I min et I max établis", valeur: nombre(api, reg.imin, 3) + " A et " + nombre(api, reg.imax, 3) + " A" },
      { nom: "Ondulation crête à crête exacte", valeur: nombre(api, (reg.imax - reg.imin) * 1000, 1) + " mA" },
      { nom: "Ondulation approchée, si T petit devant L / r", valeur: nombre(api, approx * 1000, 1) + " mA" },
      { nom: "Courant moyen dans la diode", valeur: nombre(api, reg.diode, 3) + " A" },
    ]);
  }

  const curseurs = api.sim.curseurs(
    "#e-mli-curseurs",
    [
      { id: "l", libelle: "Inductance L", min: 10, max: 500, pas: 5, valeur: etat.l, unite: "mH" },
      { id: "f", libelle: "Fréquence de découpage f", min: 50, max: 5000, pas: 10, valeur: etat.f, unite: "Hz" },
      { id: "alpha", libelle: "Rapport cyclique α", min: 0.05, max: 0.95, pas: 0.01, valeur: etat.alpha, chiffres: 2 },
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
   H. Courbes calculées de l'exemple du frein
   -------------------------------------------------------------------------- */

function construireTraceExemple(racine, api) {
  const F = FREIN;
  const tauMs = F.tau * 1000;
  const etab = (t) => F.i * (1 - Math.exp(-t / tauMs));
  const i0 = etab(F.ordre);
  const apres = (ue) => (t) => (t < F.ordre ? etab(t) : courantEcrete(i0, ue, F.r, tauMs, t - F.ordre));
  const tsDiode = instantSeuil(i0, F.ud, F.r, tauMs, F.serrage);
  const tsZener = instantSeuil(i0, F.ue, F.r, tauMs, F.serrage);
  const td = tauMs * Math.log(F.i / (F.i - F.desserrage));

  const traceur = api.sim.traceur("#h-trace", {
    titre: "Frein : desserrage puis serrage",
    genre: "Tracé",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "i",
    yUnite: "A",
    xMin: 0,
    xMax: 420,
    yMin: 0,
    yMax: 1.7,
    ratio: 0.45,
    echantillons: 840,
    series: [
      { id: "d", nom: "diode seule, 0,8 V", couleur: "serie-6", epaisseur: 1.4, fonction: apres(F.ud) },
      { id: "z", nom: "écrêteur 39 V", couleur: "serie-1", epaisseur: 2.8, fonction: apres(F.ue) },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, F.desserrage, "desserrage 1,2 A");
      ligneHorizontale(c, repere, couleurs, F.serrage, "");
      ligneVerticale(c, repere, couleurs, F.ordre, "ordre de freinage");
      marquerPoint(c, repere, couleurs, td, F.desserrage, "64,4 ms", false);
      marquerPoint(c, repere, couleurs, F.ordre + tsZener, F.serrage, "serrage 0,3 A : + 14,5 ms", true);
      marquerPoint(c, repere, couleurs, F.ordre + tsDiode, F.serrage, "+ 59,5 ms", false);
    },
  });
  if (traceur) ressources.push(traceur);
}

/* --------------------------------------------------------------------------
   I. Animation : appel et retombée du contacteur KM1
   -------------------------------------------------------------------------- */

function construireKm1(racine, api) {
  const conteneur = racine.querySelector("#i-km1");
  if (!conteneur) return;

  const COUPURE = 200;
  const XMAX = 320;
  const tauMs = KM1.tau * 1000;
  const tAppel = tauMs * Math.log(KM1.i / (KM1.i - KM1.appel));
  const i0 = KM1.i * (1 - Math.exp(-COUPURE / tauMs));

  const svg = svgEl("svg", {
    viewBox: "0 0 700 330",
    role: "img",
    "aria-label": "Bobine du contacteur KM1 commandée par la sortie Q de l'automate sur le bus 24 volts, écrêteur en parallèle, contact principal collé ou retombé ; flèches de courant dont l'épaisseur suit l'intensité",
  });
  const fond = svgEl("g");
  fond.innerHTML =
    "<defs>" + marqueurFixe("fl-i-km1") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M60 60H120M168 60H340V90M340 170V185M340 230V280H60M220 60V120M220 190V280"/>' +
    '<path d="' + spires(340, 90) + '"/>' +
    '<rect x="328" y="185" width="24" height="45" rx="3"/><rect x="200" y="120" width="40" height="70" rx="4"/>' +
    '<path d="M600 70V110M600 170V210"/></g>' +
    '<path d="M358 130H586" stroke="currentColor" stroke-width="1.4" fill="none" stroke-dasharray="6 5" opacity="0.7"/>' +
    '<g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="123" cy="60" r="3.2"/><circle cx="165" cy="60" r="3.2"/><circle cx="600" cy="110" r="3.2"/><circle cx="600" cy="170" r="3.2"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="220" cy="60" r="4"/><circle cx="220" cy="280" r="4"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    '<text x="54" y="64" text-anchor="end">+24 V</text><text x="54" y="284" text-anchor="end">0 V</text>' +
    '<text x="144" y="84" text-anchor="middle">Q</text><text x="228" y="52">A</text><text x="228" y="298">B</text>' +
    '<text x="220" y="152" text-anchor="middle">U_e</text><text x="220" y="170" text-anchor="middle" font-size="11">D + Z</text>' +
    '<text x="328" y="96" text-anchor="end" font-weight="600">+</text>' +
    '<text x="360" y="112">KM1</text><text x="360" y="160">1,2 H</text><text x="360" y="212">48 Ω</text>' +
    '<text x="600" y="236" text-anchor="middle" font-size="11.5">contact principal</text><text x="600" y="252" text-anchor="middle" font-size="11.5">de KM1</text></g>';
  const lameQ = svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-linecap": "round" });
  const lameKM = svgEl("path", { stroke: "currentColor", "stroke-width": 3.4, fill: "none", "stroke-linecap": "round" });
  const flecheQ = svgEl("path", { stroke: "currentColor", fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-i-km1)" });
  const flecheL = svgEl("path", { stroke: "currentColor", fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-i-km1)" });
  const flecheE = svgEl("path", { stroke: "currentColor", fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-i-km1)" });
  const dynamiques = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  const jaugeG = svgEl("g");
  svg.append(fond, lameQ, lameKM, flecheQ, flecheL, flecheE, dynamiques, jaugeG);
  conteneur.appendChild(svg);

  const etat = { ue: 30, t: 0 };
  let calc = {};

  function calculer() {
    calc = {
      t0: dureeAnnulation(i0, etat.ue, KM1.r, tauMs),
      tret: instantSeuil(i0, etat.ue, KM1.r, tauMs, KM1.retombee),
      we: etat.ue * chargeEcretee(i0, etat.ue, KM1.r, tauMs, Infinity) / 1000,
      w: 0.5 * KM1.l * i0 * i0,
    };
  }

  const courant = (t) =>
    t < COUPURE ? KM1.i * (1 - Math.exp(-t / tauMs)) : courantEcrete(i0, etat.ue, KM1.r, tauMs, t - COUPURE);
  const colle = (t) => t >= tAppel && t < COUPURE + calc.tret;

  calculer();
  const traceur = api.sim.traceur("#i-km1-trace", {
    titre: "Courant de la bobine de KM1",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "i",
    yUnite: "A",
    xMin: 0,
    xMax: XMAX,
    yMin: 0,
    yMax: 0.6,
    ratio: 0.36,
    echantillons: 640,
    series: [{ id: "i", nom: "i(t) dans la bobine de KM1", couleur: "serie-1", epaisseur: 2.6, fonction: courant }],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, KM1.appel, "appel 0,3 A");
      ligneHorizontale(c, repere, couleurs, KM1.retombee, "retombée 0,1 A");
      ligneVerticale(c, repere, couleurs, COUPURE, "sortie désactivée");
      disqueInstant(c, repere, couleurs, etat.t, courant(etat.t));
    },
  });
  if (traceur) ressources.push(traceur);

  const valeurs = api.sim.valeurs("#i-km1-valeurs", [
    { id: "t", libelle: "Instant t", unite: "ms", decimales: 1 },
    { id: "i", libelle: "Courant de la bobine", unite: "A", decimales: 3 },
    { id: "uq", libelle: "Tension vue par la sortie Q", unite: "V", decimales: 1 },
    { id: "etat", libelle: "Contact principal", format: (v) => (v ? "fermé, KM1 collé" : "ouvert, KM1 retombé") },
    { id: "wc", libelle: "Énergie absorbée par l'écrêteur depuis la coupure", unite: "mJ", decimales: 1 },
    { id: "appel", libelle: "Temps d'appel, seuil 0,3 A", unite: "ms", decimales: 1 },
    { id: "tret", libelle: "Retard de retombée après la coupure, seuil 0,1 A", unite: "ms", decimales: 1 },
    { id: "t0", libelle: "Durée d'annulation du courant", unite: "ms", decimales: 1 },
    { id: "we", libelle: "Énergie totale dans l'écrêteur, par coupure", unite: "mJ", decimales: 1 },
    { id: "wr", libelle: "Énergie dissipée dans le fil, par coupure", unite: "mJ", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher() {
    const t = etat.t;
    const active = t < COUPURE;
    const i = courant(t);
    const enContact = colle(t);
    const ecreteur = !active && i > 1e-4;
    lameQ.setAttribute("d", active ? "M123 60L162 58" : "M123 60L156 38");
    lameKM.setAttribute("d", enContact ? "M600 170L600 113" : "M600 170L628 124");
    reglerFleche(flecheQ, "M268 60H314", active ? i / KM1.i : 0);
    reglerFleche(flecheL, "M372 196V230", i / KM1.i);
    reglerFleche(flecheE, "M252 176V132", ecreteur ? i / KM1.i : 0);
    const uq = active ? 0 : KM1.e + (ecreteur ? etat.ue : 0);
    dynamiques.innerHTML =
      '<text x="350" y="24" text-anchor="middle" font-weight="600">' +
      (active ? "sortie active : établissement" : ecreteur ? "sortie bloquée : le courant passe par l'écrêteur" : "sortie bloquée : courant éteint") +
      "</text>" +
      '<text x="640" y="144" font-weight="600">' + (enContact ? "collé" : "retombé") + "</text>" +
      '<text x="264" y="158">' + (ecreteur ? "i" : "") + "</text>" +
      '<text x="380" y="252">U_e = ' + nombre(api, etat.ue, 1) + " V</text>";
    jaugeG.innerHTML = jauge(250, 304, 300, "i / 0,5 A", i / KM1.i, Math.round((i / KM1.i) * 100) + " %");
    if (valeurs) {
      const s = Math.max(0, t - COUPURE);
      valeurs.maj({
        t,
        i,
        uq,
        etat: enContact ? 1 : 0,
        wc: active ? 0 : etat.ue * chargeEcretee(i0, etat.ue, KM1.r, tauMs, s),
        appel: tAppel,
        tret: calc.tret,
        t0: calc.t0,
        we: calc.we * 1000,
        wr: (calc.w - calc.we) * 1000,
      });
    }
    if (traceur) traceur.demanderRendu();
  }

  let lecteur = null;

  function majParametres() {
    calculer();
    if (traceur) traceur.definirFonction("i", courant);
    etat.t = (lecteur ? lecteur.valeur() : 0) * XMAX;
    afficher();
  }

  lecteur = api.sim.lecteur("#i-km1-lecteur", {
    de: 0,
    a: 1,
    duree: 12,
    boucle: false,
    auto: false,
    libelle: "Activer puis désactiver la sortie de l'automate",
    rappel: (valeur) => {
      etat.t = valeur * XMAX;
      afficher();
    },
  });
  if (lecteur) ressources.push(lecteur);

  const curseurs = api.sim.curseurs(
    "#i-km1-curseurs",
    [{ id: "ue", libelle: "Tension d'écrêtage U_e", min: 0.7, max: 33, pas: 0.1, valeur: etat.ue, unite: "V", chiffres: 1 }],
    (lues) => {
      etat.ue = lues.ue;
      majParametres();
    }
  );
  if (curseurs) ressources.push(curseurs);
  majParametres();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : établissement depuis zéro. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-etablissement",
      titre: "Courant atteint pendant un établissement",
      niveau: "fondamental",
      enonce:
        "<p>Une bobine d'inductance $L = 0{,}5\\ \\mathrm{H}$ et de résistance totale $R = 10\\ \\Omega$, sans courant initial, est mise sous $E = 24\\ \\mathrm{V}$ à $t = 0$. Quel est son courant à $t = 100\\ \\mathrm{ms}$, en ampères ?</p>",
      valeur: 2.4 * (1 - Math.exp(-2)),
      unite: "A",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "i(100 ms)",
      etapes: [
        { texte: "Constante de temps : $\\tau = L/R = 0{,}5/10 = 50\\ \\mathrm{ms}$." },
        { texte: "Trois grandeurs : $i(0^+) = 0$ par continuité, $I_\\infty = 24/10 = 2{,}4\\ \\mathrm{A}$, $\\tau = 50\\ \\mathrm{ms}$, d'où $i = 2{,}4\\,(1 - e^{-t/\\tau})$." },
        { texte: "$t/\\tau = 100/50 = 2$ et $e^{-2} = 0{,}1353$." },
        {
          texte: "$i = 2{,}4 \\times (1 - 0{,}1353) = 2{,}08\\ \\mathrm{A}$.",
          note: "Contrôle : à $2\\tau$, $86{,}5\\ \\%$ du chemin est parcouru, et $0{,}865 \\times 2{,}4 = 2{,}08\\ \\mathrm{A}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Établissement sous 24 V avec τ = 50 ms",
          genre: "Correction visuelle",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "i",
          yUnite: "A",
          xMin: 0,
          xMax: 250,
          yMin: 0,
          yMax: 2.7,
          ratio: 0.42,
          series: [{ id: "i", nom: "i(t)", couleur: "serie-1", fonction: (t) => 2.4 * (1 - Math.exp(-t / 50)) }],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 2.4, "E / R = 2,4 A");
            marquerPoint(c, repere, couleurs, 50, 2.4 * (1 - Math.exp(-1)), "τ : 1,52 A", false);
            marquerPoint(c, repere, couleurs, 100, 2.4 * (1 - Math.exp(-2)), "100 ms : 2,08 A", false);
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  /* Fondamental 2 : extinction dans une résistance. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-extinction",
      titre: "Durée d'une extinction jusqu'à un seuil",
      niveau: "fondamental",
      enonce:
        "<p>Une bobine de $0{,}3\\ \\mathrm{H}$ parcourue par $2\\ \\mathrm{A}$ est refermée à $t = 0$ sur une maille de résistance totale $60\\ \\Omega$, sans source. Au bout de combien de temps son courant passe-t-il sous $0{,}1\\ \\mathrm{A}$, en millisecondes ?</p>",
      valeur: 5 * Math.log(20),
      unite: "ms",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "t",
      etapes: [
        { texte: "$\\tau' = 0{,}3/60 = 5\\ \\mathrm{ms}$ ; $i(0^+) = 2\\ \\mathrm{A}$ par continuité, $I_\\infty = 0$." },
        { texte: "$t = \\tau'\\ln\\dfrac{2 - 0}{0{,}1 - 0} = 5 \\times \\ln 20$." },
        {
          texte: "$t = 5 \\times 2{,}996 = 15{,}0\\ \\mathrm{ms}$.",
          note: "Repère utile : diviser un courant par vingt prend $3\\tau$ environ, car $e^{-3} = 0{,}050$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Extinction de 2 A avec τ' = 5 ms",
          genre: "Correction visuelle",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "i",
          yUnite: "A",
          xMin: 0,
          xMax: 25,
          yMin: 0,
          yMax: 2.2,
          ratio: 0.42,
          series: [{ id: "i", nom: "i(t) = 2 exp(-t / 5 ms)", couleur: "serie-1", fonction: (t) => 2 * Math.exp(-t / 5) }],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 0.1, "seuil 0,1 A");
            marquerPoint(c, repere, couleurs, 5 * Math.log(20), 0.1, "15,0 ms", false);
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  /* Intermédiaire 1 : constante de temps vue par la bobine. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-thevenin",
      titre: "Constante de temps d'une bobine shuntée",
      niveau: "intermédiaire",
      enonce:
        "<p>Une source de $12\\ \\mathrm{V}$ alimente, à travers $R_1 = 30\\ \\Omega$, une inductance idéale de $0{,}6\\ \\mathrm{H}$ en parallèle avec $R_2 = 60\\ \\Omega$. Quelle est la constante de temps de l'établissement, en millisecondes ? Vers quel courant l'inductance tend-elle ?</p>",
      valeur: 30,
      unite: "ms",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "τ",
      etapes: [
        { texte: "Source éteinte, l'inductance voit $R_1 \\parallel R_2 = \\dfrac{30 \\times 60}{90} = 20\\ \\Omega$." },
        { texte: "$\\tau = L/R_{th} = 0{,}6/20 = 30\\ \\mathrm{ms}$." },
        {
          texte: "Courant final : en régime établi l'inductance est un fil qui court-circuite $R_2$, donc $I_\\infty = 12/30 = 0{,}4\\ \\mathrm{A}$, aussi égal à $E_{th}/R_{th} = 8/20$.",
          note: "Erreur typique : $\\tau = L/R_1 = 20\\ \\mathrm{ms}$ ou $L/(R_1 + R_2) = 6{,}7\\ \\mathrm{ms}$. La résistance en parallèle allonge la constante de temps, à l'inverse du circuit RC.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 620 240",
          '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<circle cx="50" cy="110" r="18"/><path d="M50 92V40H90M150 40H260V70M260 150V180H50V128"/><rect x="90" y="28" width="60" height="24" rx="3"/>' +
            '<path d="M200 40V80M200 140V180"/><rect x="188" y="80" width="24" height="60" rx="3"/><path d="' + spires(260, 70) + '"/>' +
            '<circle cx="410" cy="110" r="18"/><path d="M410 92V40H450M510 40H560V70M560 150V180H410V128"/><rect x="450" y="28" width="60" height="24" rx="3"/>' +
            '<path d="' + spires(560, 70) + '"/><path d="M332 110H380"/><path d="M370 104 380 110 370 116"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
            '<text x="50" y="114" text-anchor="middle">12 V</text><text x="120" y="70" text-anchor="middle">30 Ω</text><text x="176" y="114" text-anchor="end">60 Ω</text>' +
            '<text x="280" y="114">0,6 H</text><text x="410" y="114" text-anchor="middle">8 V</text><text x="480" y="70" text-anchor="middle">20 Ω</text>' +
            '<text x="580" y="114">0,6 H</text><text x="356" y="98" text-anchor="middle">Thévenin</text>' +
            '<text x="310" y="214" text-anchor="middle">τ = 0,6 H / 20 Ω = 30 ms ; i tend vers 8 / 20 = 0,4 A</text></g>',
          "Réduction du réseau : source de 8 volts et résistance de 20 ohms, constante de temps 30 millisecondes"
        );
      },
    })
  );

  /* Intermédiaire 2 : surtension sur résistance de décharge. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-surtension",
      titre: "Tension d'un interrupteur à l'ouverture",
      niveau: "intermédiaire",
      enonce:
        "<p>Une bobine de $2\\ \\mathrm{H}$ et $20\\ \\Omega$, alimentée sous $24\\ \\mathrm{V}$ par un interrupteur, est shuntée par une résistance de décharge de $100\\ \\Omega$. L'interrupteur s'ouvre en régime établi. Quelle tension supporte-t-il juste après l'ouverture, en volts ? Quelle est la constante de temps de l'extinction ?</p>",
      valeur: 144,
      unite: "V",
      tolerance: 0.02,
      chiffres: 0,
      libelleChamp: "u_K(0+)",
      etapes: [
        { texte: "Avant l'ouverture : courant de la bobine $I_0 = 24/20 = 1{,}2\\ \\mathrm{A}$ ; la résistance de décharge porte en plus $24/100 = 0{,}24\\ \\mathrm{A}$." },
        { texte: "Juste après : la bobine impose $1{,}2\\ \\mathrm{A}$, qui ne peut passer que par la résistance de décharge, en remontant : sa tension vaut $100 \\times 1{,}2 = 120\\ \\mathrm{V}$, le nœud haut de la bobine passe à $-120\\ \\mathrm{V}$." },
        { texte: "Loi des mailles sur la source, l'interrupteur et la bobine : $u_K = 24 + 120 = 144\\ \\mathrm{V}$." },
        {
          texte: "Constante de temps : $\\tau' = 2/(20 + 100) = 16{,}7\\ \\mathrm{ms}$.",
          note: "Pour un interrupteur de tenue $100\\ \\mathrm{V}$, il faudrait $R_d \\leq (100 - 24)/1{,}2 = 63\\ \\Omega$, au prix d'une consommation permanente de $24^2/63 = 9{,}1\\ \\mathrm{W}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 620 250",
          "<defs>" + marqueur("fl-k-sur") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<circle cx="60" cy="120" r="20"/><path d="M60 100V40H120M170 40H400V80M400 160V200H60V140"/><path d="M123 40L160 18"/>' +
            '<path d="' + spires(300, 80) + '"/><path d="M300 40V80M300 160V200"/><rect x="388" y="80" width="24" height="80" rx="3"/></g>' +
            '<g stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"><path d="M278 96V140" marker-end="url(#fl-k-sur)"/><path d="M432 150V96" marker-end="url(#fl-k-sur)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
            '<text x="60" y="124" text-anchor="middle">24 V</text><text x="142" y="62" text-anchor="middle">K ouvert</text>' +
            '<text x="316" y="124">2 H, 20 Ω</text><text x="420" y="176">100 Ω</text>' +
            '<text x="270" y="122" text-anchor="end">1,2 A</text><text x="440" y="126">1,2 A</text>' +
            '<text x="480" y="60">haut de la bobine :</text><text x="480" y="78">-120 V</text>' +
            '<text x="310" y="234" text-anchor="middle">u_K = 24 - (-120) = 144 V ; τ\' = 2 / 120 = 16,7 ms</text></g>',
          "À l'ouverture, le courant de 1,2 ampère de la bobine remonte par la résistance de 100 ohms : le nœud haut passe à moins 120 volts et l'interrupteur supporte 144 volts"
        );
      },
    })
  );

  /* Avancé : fréquence de découpage minimale. */
  const fMin = 1 / (4 * 0.005 * Math.atanh(0.02));
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-mli",
      titre: "Choisir la fréquence de découpage d'une électrovanne",
      niveau: "avancé",
      enonce:
        "<p>Une électrovanne de $24\\ \\mathrm{V}$, $r = 24\\ \\Omega$ et $L = 0{,}12\\ \\mathrm{H}$ est commandée en modulation de largeur d'impulsion avec $\\alpha = 0{,}5$, diode de roue libre supposée idéale. Pour limiter les vibrations de l'armature, l'ondulation crête à crête du courant ne doit pas dépasser $20\\ \\mathrm{mA}$. Quelle est la fréquence de découpage minimale, en hertz ? Quel courant moyen la diode doit-elle supporter en permanence ?</p>",
      valeur: fMin,
      unite: "Hz",
      tolerance: 0.03,
      chiffres: 0,
      libelleChamp: "f min",
      etapes: [
        { texte: "Données : $\\tau = L/r = 5\\ \\mathrm{ms}$, $I_\\infty = 24/24 = 1\\ \\mathrm{A}$, courant moyen $\\bar{I} = \\alpha I_\\infty = 0{,}5\\ \\mathrm{A}$." },
        { texte: "Pour $\\alpha = 0{,}5$, $a = b = e^{-T/(2\\tau)}$ et $\\Delta I = I_\\infty\\,\\dfrac{1 - a}{1 + a} = I_\\infty \\tanh\\dfrac{T}{4\\tau}$." },
        { texte: "Condition : $\\tanh\\dfrac{T}{4\\tau} \\leq 0{,}02$, soit $T \\leq 4 \\times 5\\ \\mathrm{ms} \\times 0{,}020003 = 0{,}4001\\ \\mathrm{ms}$." },
        { texte: "Fréquence minimale : $f \\geq 1/T = 2\\,500\\ \\mathrm{Hz}$. L'approximation $\\Delta I \\approx E\\alpha(1 - \\alpha)/(Lf)$ donne $f \\geq 24 \\times 0{,}25/(0{,}12 \\times 0{,}02) = 2\\,500\\ \\mathrm{Hz}$, identique car $T \\ll \\tau$." },
        {
          texte: "Diode : elle conduit pendant la moitié de chaque période un courant voisin de $0{,}5\\ \\mathrm{A}$, soit environ $0{,}25\\ \\mathrm{A}$ en moyenne, à dimensionner en courant permanent, avec une tension inverse d'au moins $50\\ \\mathrm{V}$ et une commutation rapide.",
          note: "Une fréquence plus élevée réduit l'ondulation mais augmente les pertes de commutation de l'interrupteur et de la diode : le choix final est un compromis, repris dans le cours Hacheurs DC-DC.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Ondulation en fonction de la fréquence de découpage",
          genre: "Correction visuelle",
          xTitre: "f",
          xUnite: "Hz",
          yTitre: "ΔI",
          yUnite: "mA",
          xMin: 500,
          xMax: 6000,
          yMin: 0,
          yMax: 110,
          ratio: 0.42,
          series: [{ id: "d", nom: "ΔI(f) exacte, α = 0,5", couleur: "serie-1", fonction: (f) => 1000 * Math.tanh(1 / (f * 4 * 0.005)) }],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 20, "exigence 20 mA");
            marquerPoint(c, repere, couleurs, fMin, 20, "f min = 2 500 Hz", false);
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  /* Diagnostic industriel. */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Contacteur qui retombe lentement",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Depuis une intervention de maintenance, le contacteur $KM1$ de la pompe retombe environ $40\\ \\mathrm{ms}$ après la désactivation de la sortie de l'automate, contre une dizaine de millisecondes auparavant. La sortie fonctionne normalement, le contacteur colle sans difficulté et la tension du bus est normale. Quelles hypothèses sont compatibles avec ces symptômes ?</p>",
      options: [
        { texte: "La diode Zener de l'écrêteur est passée en court-circuit.", juste: true },
        { texte: "Le module de protection a été remplacé par une simple diode de roue libre.", juste: true },
        { texte: "La diode de l'écrêteur a été remontée à l'envers." },
        { texte: "La diode de l'écrêteur est coupée." },
        { texte: "La tension du bus est descendue à $22\\ \\mathrm{V}$." },
      ],
      etapes: [
        { texte: "Avec l'écrêteur de $30\\ \\mathrm{V}$, la retombée survient en $11{,}0\\ \\mathrm{ms}$ ; avec une diode seule, en $37{,}6\\ \\mathrm{ms}$. Le symptôme correspond exactement à une protection réduite à une diode." },
        { texte: "Une Zener claquée se met généralement en court-circuit : l'écrêteur dégénère en diode seule. Un remplacement par une diode simple donne le même résultat." },
        { texte: "Une diode montée à l'envers court-circuiterait la bobine dès l'activation : le contacteur ne collerait pas. Une diode coupée supprimerait le chemin : retombée très rapide, mais surtension destructrice sur la sortie." },
        {
          texte: "Un bus plus bas réduirait le courant, donc l'énergie à évacuer : la retombée serait un peu plus rapide, pas plus lente.",
          note: "Vérification : relever à l'oscilloscope la tension de la sortie à la coupure, qui doit monter à $54\\ \\mathrm{V}$ avec un écrêteur sain et reste voisine de $24{,}7\\ \\mathrm{V}$ avec une diode seule.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const tauMs = KM1.tau * 1000;
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Extinction du courant de KM1 selon la protection",
          genre: "Correction visuelle",
          xTitre: "temps après la coupure",
          xUnite: "ms",
          yTitre: "i",
          yUnite: "A",
          xMin: 0,
          xMax: 100,
          yMin: 0,
          yMax: 0.55,
          ratio: 0.42,
          series: [
            { id: "z", nom: "écrêteur sain, 30 V", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => courantEcrete(KM1.i, 30, KM1.r, tauMs, t) },
            { id: "d", nom: "Zener en court-circuit, 0,7 V", couleur: "serie-6", epaisseur: 1.6, fonction: (t) => courantEcrete(KM1.i, 0.7, KM1.r, tauMs, t) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, KM1.retombee, "retombée 0,1 A");
            marquerPoint(c, repere, couleurs, instantSeuil(KM1.i, 30, KM1.r, tauMs, 0.1), 0.1, "11,0 ms", true);
            marquerPoint(c, repere, couleurs, instantSeuil(KM1.i, 0.7, KM1.r, tauMs, 0.1), 0.1, "37,6 ms", false);
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  /* Conceptuel. */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-conceptuel",
      titre: "Protéger la sortie ou couper vite",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul long, expliquez pourquoi on ne peut pas à la fois limiter la tension vue par l'interrupteur à l'ouverture d'une bobine et annuler très vite son courant. Que devient l'énergie stockée dans chacun des deux cas ?</p>",
      motsCles: [
        ["flux", "faraday", "l di/dt", "di/dt", "aire"],
        ["tension", "ecretage", "zener"],
        ["duree", "temps", "lent", "vite", "rapide"],
        ["energie", "dissip", "chaleur", "resistance", "fil"],
      ],
      minimum: 3,
      exemple: "Trois ou quatre phrases : reliez la vitesse de variation du courant à la tension de la bobine, puis dites où part l'énergie.",
      etapes: [
        { texte: "La tension de la bobine vaut $L\\,\\mathrm{d}i/\\mathrm{d}t$ : faire passer le courant de $I_0$ à zéro en une durée $\\Delta t$ exige une tension moyenne de l'ordre de $LI_0/\\Delta t$." },
        { texte: "Autrement dit, détruire le flux lié $LI_0$ demande une aire tension fois temps fixée : une tension faible implique une extinction longue, une extinction brève une tension élevée, que l'interrupteur voit augmentée de la tension d'alimentation." },
        { texte: "L'énergie $\\tfrac{1}{2}LI_0^2$ est toujours évacuée en totalité. Avec une diode seule, elle part presque entièrement dans la résistance du fil, lentement ; avec un écrêteur élevé, surtout dans l'écrêteur, rapidement." },
        {
          texte: "Le choix de la protection ne décide donc que de la répartition de l'énergie et de la durée de l'extinction, sous la contrainte de la tenue de l'interrupteur.",
          note: "C'est le compromis chiffré par $t_0 = \\tau\\ln(1 + rI_0/U_e)$ : à $U_e = 0{,}7$, $15$ et $30\\ \\mathrm{V}$, la bobine de $KM1$ s'éteint en $89$, $24$ et $15\\ \\mathrm{ms}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const tauMs = KM1.tau * 1000;
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Extinction de KM1 pour trois tensions d'écrêtage",
          genre: "Correction visuelle",
          xTitre: "temps après la coupure",
          xUnite: "ms",
          yTitre: "i",
          yUnite: "A",
          xMin: 0,
          xMax: 100,
          yMin: 0,
          yMax: 0.55,
          ratio: 0.42,
          series: [
            { id: "a", nom: "U_e = 0,7 V : 24,7 V sur la sortie", couleur: "serie-6", epaisseur: 1.6, fonction: (t) => courantEcrete(KM1.i, 0.7, KM1.r, tauMs, t) },
            { id: "b", nom: "U_e = 15 V : 39 V sur la sortie", couleur: "serie-3", epaisseur: 2, fonction: (t) => courantEcrete(KM1.i, 15, KM1.r, tauMs, t) },
            { id: "c", nom: "U_e = 30 V : 54 V sur la sortie", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => courantEcrete(KM1.i, 30, KM1.r, tauMs, t) },
          ],
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const DESSIN_QUIZ =
  '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="60" cy="135" r="22"/><path d="M60 113V40H120M173 40H400V112M280 40V80M280 160V230M400 142V230H60V157"/>' +
  '<path d="M123 40L162 20" stroke-width="3"/>' +
  '<path d="' + spires(280, 80) + '"/>' +
  '<path d="M386 112H414"/><path d="M386 142H414L400 114Z"/></g>' +
  '<g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="120" cy="40" r="3.2"/><circle cx="170" cy="40" r="3.2"/></g>' +
  '<g fill="currentColor" stroke="none"><circle cx="280" cy="40" r="4"/><circle cx="280" cy="230" r="4"/></g>' +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
  '<text x="60" y="131" text-anchor="middle" font-weight="600">+</text><text x="30" y="140" text-anchor="end">E</text>' +
  '<text x="146" y="66" text-anchor="middle">K ouvert</text><text x="300" y="124">L, r</text><text x="424" y="132">D</text>' +
  '<text x="230" y="256" text-anchor="middle" font-size="11.5">masse : référence 0 V</text></g>';

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Une bobine sans courant initial est mise sous tension continue à travers une résistance. Quelle fraction de son courant final atteint-elle après une constante de temps ?</p>",
        options: ["$37\\ \\%$", "$50\\ \\%$", "$63\\ \\%$", "$95\\ \\%$"],
        bonnes: [2],
        explication: "$1 - e^{-1} = 0{,}632$ : même repère que la charge d'un condensateur, appliqué ici au courant.",
        resume: "Repère à une constante de temps",
      },
      {
        type: "vraiFaux",
        enonce: "<p>La tension aux bornes d'une bobine peut changer brusquement de valeur, et même de signe, à l'instant d'une manœuvre.</p>",
        reponse: true,
        explication: "Seul le courant de la bobine est continu. Sa tension saute de $0$ à $E$ à la fermeture et devient négative à l'ouverture.",
        resume: "Discontinuité de la tension",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la constante de temps d'une bobine de $0{,}5\\ \\mathrm{H}$ dans une maille de résistance totale $25\\ \\Omega$, en millisecondes ?</p>",
        valeur: 20,
        unite: "ms",
        tolerance: 0.02,
        chiffres: 1,
        explication: "$\\tau = L/R = 0{,}5/25 = 0{,}02\\ \\mathrm{s} = 20\\ \\mathrm{ms}$.",
        resume: "Calcul de τ = L / R",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle énergie une bobine de $0{,}4\\ \\mathrm{H}$ parcourue par $3\\ \\mathrm{A}$ doit-elle évacuer à l'ouverture, en joules ?</p>",
        valeur: 1.8,
        unite: "J",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$W = \\tfrac{1}{2}LI^2 = 0{,}5 \\times 0{,}4 \\times 9 = 1{,}8\\ \\mathrm{J}$, quelle que soit la protection.",
        resume: "Énergie à évacuer",
      },
      {
        type: "courte",
        enonce: "<p>Quelle grandeur d'une bobine est continue à chaque manœuvre ?</p>",
        motsCles: [["courant", "intensite", "flux"]],
        minimum: 1,
        explication: "Le courant, et donc le flux lié $Li$ : une discontinuité exigerait une tension infinie.",
        resume: "Grandeur continue",
      },
      {
        type: "qcm",
        enonce: "<p>Quelles modifications allongent la constante de temps d'un circuit RL série ?</p>",
        options: [
          { texte: "Augmenter l'inductance $L$", juste: true },
          { texte: "Augmenter la résistance $R$" },
          { texte: "Diminuer la résistance $R$", juste: true },
          { texte: "Augmenter la tension de la source $E$" },
        ],
        multiple: true,
        explication: "$\\tau = L/R$ croît avec $L$ et décroît quand $R$ croît. $E$ fixe le courant final, pas la durée du transitoire.",
        resume: "Paramètres de τ",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Remplacer l'écrêteur diode et Zener d'une bobine de contacteur par une simple diode de roue libre accélère la retombée du contacteur.</p>",
        reponse: false,
        explication: "La diode seule n'impose que $0{,}7\\ \\mathrm{V}$ : le courant ne décroît plus que par la résistance du fil, et la retombée est retardée d'un facteur trois ou quatre.",
        resume: "Diode seule et retombée",
      },
      {
        type: "calcul",
        enonce: "<p>Une bobine parcourue par $2\\ \\mathrm{A}$, alimentée sous $24\\ \\mathrm{V}$, est shuntée par une résistance de décharge de $50\\ \\Omega$. Quelle tension l'interrupteur supporte-t-il juste après son ouverture, en volts ?</p>",
        valeur: 124,
        unite: "V",
        tolerance: 0.02,
        chiffres: 0,
        explication: "$u_K = E + R_dI_0 = 24 + 50 \\times 2 = 124\\ \\mathrm{V}$.",
        resume: "Tension d'ouverture",
      },
      {
        type: "schema",
        enonce: "<p>$K$ vient de s'ouvrir alors que la bobine était parcourue par son courant établi. Par quel élément ce courant se referme-t-il ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 470 270",
        dessin: DESSIN_QUIZ,
        zones: [
          { x: 30, y: 105, largeur: 60, hauteur: 60, etiquette: "source E" },
          { x: 108, y: 12, largeur: 76, hauteur: 60, etiquette: "interrupteur K" },
          { x: 256, y: 72, largeur: 72, hauteur: 96, etiquette: "bobine L, r" },
          { x: 372, y: 100, largeur: 70, hauteur: 56, etiquette: "diode D", juste: true },
        ],
        explication: "Le courant de la bobine garde son sens, de haut en bas dans la bobine, et remonte par la diode, qui se débloque d'elle-même : c'est la roue libre. La source et $K$ ne portent plus aucun courant.",
        resume: "Chemin de roue libre",
      },
      {
        type: "calcul",
        enonce: "<p>Un écrêteur de $50\\ \\mathrm{V}$, grand devant la chute résistive, coupe une bobine de $1\\ \\mathrm{H}$ parcourue par $0{,}5\\ \\mathrm{A}$. Avec l'approximation linéaire, en combien de millisecondes le courant s'annule-t-il ?</p>",
        valeur: 10,
        unite: "ms",
        tolerance: 0.02,
        chiffres: 1,
        explication: "$t_0 \\approx LI_0/U_e = 1 \\times 0{,}5/50 = 10\\ \\mathrm{ms}$ ; la valeur exacte est un peu plus courte, la résistance du fil aidant l'écrêteur.",
        resume: "Extinction linéaire",
      },
    ],
    { titre: "Dix questions sur le régime transitoire RL" }
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
      { categorie: "Équation", question: "Quelle équation régit le courant d'une bobine alimentée par E à travers R ?", reponse: "$L\\,\\mathrm{d}i/\\mathrm{d}t + Ri = E$, obtenue par la loi des mailles et $u_L = L\\,\\mathrm{d}i/\\mathrm{d}t$." },
      { categorie: "Définition", question: "Que vaut la constante de temps d'un circuit RL, et comment varie-t-elle avec R ?", reponse: "$\\tau = L/R_{th}$, en secondes ; elle diminue quand la résistance augmente, à l'inverse du circuit RC." },
      { categorie: "Continuité", question: "Quelle grandeur est continue dans une bobine, et laquelle peut sauter ?", reponse: "Le courant est continu ; la tension peut sauter, et s'inverse à l'ouverture." },
      { categorie: "Méthode", question: "Par quoi remplace-t-on la bobine à l'instant 0+ et en régime établi ?", reponse: "À $0^+$ : une source de courant $I_0$ (un circuit ouvert si $I_0 = 0$). En régime établi : un fil." },
      { categorie: "Formule", question: "Courant et tension d'un établissement depuis I0 ?", reponse: "$i = I_\\infty + (I_0 - I_\\infty)e^{-t/\\tau}$ et $u_L = (E - RI_0)e^{-t/\\tau}$, avec $I_\\infty = E/R$." },
      { categorie: "Ouverture", question: "Que se passe-t-il si l'on ouvre une bobine parcourue par un courant sans lui offrir de chemin ?", reponse: "La tension monte jusqu'à créer un chemin : arc, claquage du transistor, capacités parasites. La surtension peut atteindre des kilovolts." },
      { categorie: "Résistance de décharge", question: "Tension sur l'interrupteur et constante de temps avec une résistance de décharge R_d ?", reponse: "$u_K = E + R_dI_0$ et $\\tau' = L/(r + R_d)$ ; $R_d$ consomme en permanence $E^2/R_d$." },
      { categorie: "Écrêteur", question: "Durée d'annulation du courant sous une tension d'écrêtage U_e ?", reponse: "$t_0 = \\tau\\ln(1 + rI_0/U_e)$, voisine de $LI_0/U_e$ si $U_e \\gg rI_0$ ; énergie $W_e = U_e(\\tau I_0 - U_et_0/r)$." },
      { categorie: "MLI", question: "Courant moyen et ondulation d'une bobine découpée à la fréquence f avec le rapport cyclique α ?", reponse: "$\\bar{I} = \\alpha E/r$ ; $\\Delta I \\approx E\\alpha(1 - \\alpha)/(Lf)$ si $T \\ll \\tau$. La diode conduit en permanence pendant $(1 - \\alpha)T$." },
      {
        categorie: "Industriel",
        question: "Pourquoi éviter une diode seule sur la bobine du contacteur de la pompe ?",
        reponse: "Elle protège la sortie mais ne fixe que $0{,}7\\ \\mathrm{V}$ : le courant décroît par la seule résistance du fil, et la retombée est trois à quatre fois plus lente qu'avec un écrêteur.",
        rappel: "KM1 : 1,2 H, 48 Ω, τ = 25 ms ; retombée à 0,1 A en 37,6 ms avec une diode seule, 11,0 ms avec diode et Zener de 30 V.",
      },
    ],
    { titre: "Dix cartes sur le régime transitoire RL" }
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
        enonce: "<p>Une bobine a une constante de temps de $20\\ \\mathrm{ms}$. Au bout de combien de temps son courant atteint-il $95\\ \\%$ de sa valeur finale, depuis zéro, en millisecondes ?</p>",
        valeur: 20 * Math.log(20),
        unite: "ms",
        tolerance: 0.03,
        chiffres: 1,
        explication: "$t = \\tau\\ln 20 = 20 \\times 2{,}996 = 59{,}9\\ \\mathrm{ms}$, soit $3\\tau$ environ.",
        resume: "Repère à 3τ (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Augmenter la résistance d'un circuit RL série allonge la durée de son régime transitoire.</p>",
        reponse: false,
        explication: "$\\tau = L/R$ diminue quand $R$ augmente : le transitoire est plus court, vers un courant final plus faible.",
        resume: "Sens de variation de τ (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Une bobine parcourue par $1\\ \\mathrm{A}$ se referme sur une diode idéale ; sa constante de temps vaut $50\\ \\mathrm{ms}$. Au bout de combien de temps son courant est-il tombé à $0{,}1\\ \\mathrm{A}$, en millisecondes ?</p>",
        valeur: 50 * Math.log(10),
        unite: "ms",
        tolerance: 0.02,
        chiffres: 0,
        explication: "Diode idéale : $i = I_0\\,e^{-t/\\tau}$, donc $t = 50 \\times \\ln 10 = 115\\ \\mathrm{ms}$. La roue libre sans écrêtage est lente.",
        resume: "Roue libre idéale (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la constante de temps d'un circuit RC avec $R = 4{,}7\\ \\mathrm{k\\Omega}$ et $C = 100\\ \\mu\\mathrm{F}$, en secondes ?</p>",
        valeur: 0.47,
        unite: "s",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$\\tau = RC = 4{,}7 \\times 10^3 \\times 100 \\times 10^{-6} = 0{,}47\\ \\mathrm{s}$. Révisé du cours Régime transitoire RC.",
        resume: "Constante de temps RC (cours précédent)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Charger un condensateur déchargé à travers une résistance plus faible réduit l'énergie dissipée pendant la charge.</p>",
        reponse: false,
        explication: "L'énergie dissipée vaut $\\tfrac{1}{2}CE^2$ quelle que soit $R$ ; seules la pointe et la durée changent. Révisé du cours Régime transitoire RC.",
        resume: "Énergie perdue à la charge (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Juste après l'ouverture partielle d'un transistor qui commande une bobine, la bobine porte $0{,}5\\ \\mathrm{A}$ et le transistor conduit encore $0{,}2\\ \\mathrm{A}$. Quel courant traverse la diode de roue libre, en ampères ?</p>",
        valeur: 0.3,
        unite: "A",
        tolerance: 0.02,
        chiffres: 2,
        explication: "Loi des nœuds au nœud $A$ du schéma principal : $i_K + i_D = i_L$, donc $i_D = 0{,}5 - 0{,}2 = 0{,}3\\ \\mathrm{A}$. Révisé du cours Lois de Kirchhoff, vieux d'une semaine.",
        resume: "Loi des nœuds (Lois de Kirchhoff)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle énergie stocke la bobine du contacteur $KM1$, $1{,}2\\ \\mathrm{H}$ parcourue par $0{,}5\\ \\mathrm{A}$, en joules ?</p>",
        valeur: 0.15,
        unite: "J",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$W = \\tfrac{1}{2}LI^2 = 0{,}5 \\times 1{,}2 \\times 0{,}25 = 0{,}15\\ \\mathrm{J}$, l'énergie que tout chemin de roue libre doit évacuer. Révisé du cours Inductances et champ magnétique.",
        resume: "Énergie magnétique (Inductances et champ magnétique)",
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
    titre: "Où en suis-je sur le régime transitoire RL ?",
  });
  if (auto) ressources.push(auto);
}
