/* ==========================================================================
   cours/regime-transitoire-rc/cours.js
   Régime transitoire RC.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";

/* Exemple de la section H : temporisation par pont et condensateur. */
const EX = { e: 24, r1: 10e3, r2: 15e3, c: 47e-6, seuil: 10, ouverture: 2, rearmement: 2 };
EX.eth = (EX.e * EX.r2) / (EX.r1 + EX.r2);
EX.rth = (EX.r1 * EX.r2) / (EX.r1 + EX.r2);
EX.tau = EX.rth * EX.c;
EX.tau2 = EX.r2 * EX.c;
EX.t10 = EX.tau * Math.log(EX.eth / (EX.eth - EX.seuil));
EX.u2 = EX.eth * (1 - Math.exp(-EX.ouverture / EX.tau));
EX.t2 = EX.tau2 * Math.log(EX.u2 / EX.rearmement);

/* Bus continu du variateur de la pompe (section I). */
const BUS = { c: 2.2e-3, rp: 47, tkm: 0.6, ures: 400, rFermeture: 0.1 };

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

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeursAnimation = [];

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireAnimCharge(racine, api);
  construireTangente(racine, api);
  construireEuler(racine, api);
  construireCarre(racine, api);
  construireTraceExemple(racine, api);
  construirePrecharge(racine, api);
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
      titre: "Inverser une exponentielle",
      niveau: "diagnostic",
      enonce: "<p>Pour quelle valeur de $x$ a-t-on $e^{-x} = 0{,}25$ ? Donnez $x$ avec trois chiffres significatifs.</p>",
      valeur: Math.log(4),
      unite: "",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "x",
      etapes: [
        { texte: "On prend le logarithme népérien des deux membres : $-x = \\ln 0{,}25$." },
        {
          texte: "$x = -\\ln 0{,}25 = \\ln 4 = 1{,}386$.",
          note: "Ce geste donnera l'instant d'un seuil : si l'écart doit tomber à $25\\ \\%$ de sa valeur initiale, il faut attendre $1{,}386\\,\\tau$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Lecture sur la courbe de e^-x",
          genre: "Correction visuelle",
          xTitre: "x",
          yTitre: "e^-x",
          xMin: 0,
          xMax: 4,
          yMin: 0,
          yMax: 1.05,
          ratio: 0.4,
          series: [{ id: "e", nom: "e^-x", couleur: "serie-1", fonction: (x) => Math.exp(-x) }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, Math.log(4), 0.25, "0,25 pour x = 1,386");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-thevenin",
      titre: "Résistance vue entre deux bornes",
      niveau: "diagnostic",
      enonce:
        "<p>Une source de tension idéale alimente $R_1 = 6\\ \\mathrm{k\\Omega}$ en série avec $R_2 = 3\\ \\mathrm{k\\Omega}$ reliée à la masse. Quelle est la résistance de Thévenin vue entre le point commun à $R_1$ et $R_2$ et la masse, en kilohms ?</p>",
      valeur: 2,
      unite: "kΩ",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "R_th",
      etapes: [
        { texte: "On éteint la source de tension : elle devient un fil, qui relie l'extrémité libre de $R_1$ à la masse." },
        { texte: "Vues du point commun, $R_1$ et $R_2$ vont toutes deux à la masse : elles sont en parallèle." },
        {
          texte: "$R_{th} = \\dfrac{6 \\times 3}{6 + 3} = 2\\ \\mathrm{k\\Omega}$.",
          note: "Un condensateur branché en ce point se chargerait avec $\\tau = R_{th}C$, et non avec $R_1C$.",
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
            '<text x="150" y="70" text-anchor="middle">R1 = 6 kΩ</text><text x="282" y="114">R2 = 3 kΩ</text>' +
            '<text x="66" y="112">source éteinte = fil</text><text x="268" y="34">A</text>' +
            '<text x="470" y="70" text-anchor="middle">R_th</text><text x="450" y="118" text-anchor="middle">6 × 3 / (6 + 3)</text>' +
            '<text x="450" y="140" text-anchor="middle">= 2 kΩ</text><text x="300" y="210" text-anchor="middle">vue entre A et la masse : R1 en parallèle avec R2</text></g>',
          "Source éteinte remplacée par un fil : R1 et R2 en parallèle entre A et la masse, 2 kilohms"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-courant-c",
      titre: "Courant d'un condensateur",
      niveau: "diagnostic",
      enonce:
        "<p>Rappel du cours Condensateurs et champ électrique : la tension d'un condensateur de $10\\ \\mu\\mathrm{F}$ croît de $500\\ \\mathrm{V}$ par seconde. Quel courant le traverse, en milliampères, en convention récepteur ?</p>",
      valeur: 5,
      unite: "mA",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "i",
      etapes: [
        { texte: "$i = C\\,\\dfrac{\\mathrm{d}u}{\\mathrm{d}t} = 10 \\times 10^{-6} \\times 500$." },
        {
          texte: "$i = 5 \\times 10^{-3}\\ \\mathrm{A} = 5\\ \\mathrm{mA}$.",
          note: "Dans un circuit RC, ce courant est aussi celui de la résistance : c'est ainsi que naît l'équation différentielle.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Tension en rampe et courant constant",
          genre: "Correction visuelle",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "u",
          yUnite: "V",
          xMin: 0,
          xMax: 20,
          yMin: 0,
          yMax: 12,
          ratio: 0.4,
          series: [{ id: "u", nom: "u(t), pente 500 V/s soit 0,5 V/ms", couleur: "serie-1", fonction: (t) => 0.5 * t }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 10, 5, "i = C du/dt = 5 mA, constant");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : charge puis décharge
   -------------------------------------------------------------------------- */

function construireAnimCharge(racine, api) {
  const conteneur = racine.querySelector("#d-anim");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 420",
    role: "img",
    "aria-label": "Charge puis décharge d'un condensateur à travers une résistance : inverseur, porteurs en mouvement, charges sur les armatures et jauges de tension et de courant",
  });
  const fond = svgEl("g");
  fond.innerHTML =
    "<defs>" + marqueur("fl-d-anim") + marqueur("fl-d-anim-u", "var(--serie-2)") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="90" cy="200" r="24"/><path d="M90 176V80H180M183 133V320M243 80H280M380 80H480V175M480 195V320H90V224"/>' +
    '<rect x="280" y="67" width="100" height="26" rx="3"/>' +
    '<path d="M440 175H520M440 195H520" stroke-width="3.4"/>' +
    '<path d="M320 320V332M306 332H334M311 338H329M316 344H324"/></g>' +
    '<g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="183" cy="80" r="3.2"/><circle cx="183" cy="130" r="3.2"/><circle cx="240" cy="80" r="3.2"/></g>' +
    '<circle cx="183" cy="320" r="4" fill="currentColor"/>' +
    '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M400 80H436" marker-end="url(#fl-d-anim)"/></g>' +
    '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M566 250V120" marker-end="url(#fl-d-anim-u)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    '<text x="90" y="195" text-anchor="middle" font-weight="600">+</text><text x="90" y="216" text-anchor="middle" font-weight="600">-</text>' +
    '<text x="58" y="205" text-anchor="end">E</text><text x="170" y="72" text-anchor="end">1</text><text x="170" y="140" text-anchor="end">2</text>' +
    '<text x="212" y="62" text-anchor="middle">K</text><text x="330" y="114" text-anchor="middle">R</text>' +
    '<text x="418" y="68" text-anchor="middle">i</text><text x="432" y="172" text-anchor="end" font-weight="600">+</text>' +
    '<text x="530" y="222">C</text><text x="576" y="190" style="fill: var(--serie-2)">u_C</text>' +
    '<text x="338" y="346" font-size="11.5">référence 0 V</text></g>';
  const lame = svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-linecap": "round" });
  const phase = svgEl("text", { x: 350, y: 30, "text-anchor": "middle", "font-family": "ui-monospace, monospace", "font-size": 13, "font-weight": 600, fill: "currentColor" });
  const charges = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 13, "font-weight": 600 });
  const porteurs = svgEl("g", { fill: "currentColor", stroke: "none" });
  const jauges = svgEl("g");
  svg.append(fond, lame, phase, charges, porteurs, jauges);
  conteneur.appendChild(svg);

  /* Boucles parcourues dans le sens réel du courant. */
  const boucleCharge = cheminOuvert([
    { x: 90, y: 176 },
    { x: 90, y: 80 },
    { x: 480, y: 80 },
    { x: 480, y: 320 },
    { x: 90, y: 320 },
    { x: 90, y: 224 },
  ]);
  const boucleDecharge = cheminOuvert([
    { x: 480, y: 175 },
    { x: 480, y: 80 },
    { x: 240, y: 80 },
    { x: 183, y: 130 },
    { x: 183, y: 320 },
    { x: 480, y: 320 },
    { x: 480, y: 195 },
  ]);
  const ronds = [];
  for (let k = 0; k < 40; k += 1) {
    const rond = svgEl("circle", { r: 3.4 });
    porteurs.appendChild(rond);
    ronds.push(rond);
  }
  const pas = 30;
  const echelle = 260;

  const valeurs = api.sim.valeurs("#d-anim-valeurs", [
    { id: "k", libelle: "Position de K", format: (v) => (v ? "2, décharge" : "1, charge") },
    { id: "t", libelle: "Temps rapporté à la constante de temps", decimales: 2 },
    { id: "u", libelle: "Tension u_C / E", unite: "%", decimales: 1 },
    { id: "i", libelle: "Courant i / I0, signé", unite: "%", decimales: 1 },
    { id: "wc", libelle: "Énergie stockée / (C E² / 2)", unite: "%", decimales: 1 },
    { id: "ws", libelle: "Énergie fournie par la source / (C E² / 2)", unite: "%", decimales: 1 },
    { id: "wr", libelle: "Énergie dissipée dans R / (C E² / 2)", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const u5 = 1 - Math.exp(-5);

  function afficher(t) {
    const enCharge = t <= 5;
    let u;
    let i;
    let ws;
    if (enCharge) {
      u = 1 - Math.exp(-t);
      i = Math.exp(-t);
      ws = 2 * u;
    } else {
      u = u5 * Math.exp(-(t - 5));
      i = -u;
      ws = 2 * u5;
    }
    const wc = u * u;

    lame.setAttribute("d", enCharge ? "M240 80L186 74" : "M240 80L186 126");
    phase.textContent = enCharge ? "charge : K en position 1" : "décharge : K en position 2";

    const chemin = enCharge ? boucleCharge : boucleDecharge;
    const decalage = (enCharge ? u : u5 - u) * echelle;
    const nombreRonds = Math.floor(chemin.total / pas);
    ronds.forEach((rond, index) => {
      if (index >= nombreRonds) {
        rond.setAttribute("opacity", "0");
        return;
      }
      const s = (index * pas + decalage) % chemin.total;
      const p = pointSurChemin(chemin, s);
      const dansSource = Math.abs(p.x - 90) < 2 && p.y > 176 && p.y < 224;
      const dansIsolant = Math.abs(p.x - 480) < 2 && p.y > 176 && p.y < 194;
      rond.setAttribute("cx", p.x.toFixed(1));
      rond.setAttribute("cy", p.y.toFixed(1));
      rond.setAttribute("opacity", dansSource || dansIsolant ? "0" : "0.85");
    });

    const n = Math.round(u * 6);
    let signes = "";
    for (let k = 0; k < n; k += 1) {
      signes += '<text x="' + (447 + k * 12) + '" y="170">+</text><text x="' + (447 + k * 12) + '" y="212">-</text>';
    }
    charges.innerHTML = signes;

    jauges.innerHTML =
      jauge(250, 372, 330, "u_C / E", u, Math.round(u * 100) + " %") +
      jauge(250, 396, 330, "|i| / I0", Math.abs(i), Math.round(Math.abs(i) * 100) + " %");

    if (valeurs) valeurs.maj({ k: enCharge ? 0 : 1, t, u: u * 100, i: i * 100, wc: wc * 100, ws: ws * 100, wr: (ws - wc) * 100 });
  }

  const lecteur = api.sim.lecteur("#d-anim-lecteur", {
    de: 0,
    a: 10,
    duree: 16,
    boucle: false,
    auto: false,
    libelle: "Charger le condensateur puis basculer K pour le décharger",
    rappel: (valeur) => afficher(valeur),
  });
  if (lecteur) ressources.push(lecteur);
  afficher(0);
}

/* --------------------------------------------------------------------------
   E. Simulation : la courbe et sa tangente
   -------------------------------------------------------------------------- */

const TAN = { x0: 70, x1: 590, yBas: 270, yHaut: 50, yAxe: 308 };

function construireTangente(racine, api) {
  const conteneur = racine.querySelector("#e-tangente");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 660 350",
    role: "img",
    "aria-label": "Courbe de charge ou de décharge d'un condensateur, avec sa valeur finale et la tangente en un instant choisi par une poignée sur l'axe des temps",
  });
  const pxTau = (TAN.x1 - TAN.x0) / 5;
  const fond = svgEl("g");
  let graduations = "";
  for (let k = 1; k <= 5; k += 1) {
    const x = TAN.x0 + k * pxTau;
    graduations += '<path d="M' + x + " " + TAN.yBas + "v6M" + x + " " + TAN.yAxe + 'v-6"/>';
  }
  fond.innerHTML =
    '<defs><clipPath id="clip-e-tan"><rect x="' + TAN.x0 + '" y="30" width="' + (TAN.x1 - TAN.x0 + 20) + '" height="' + (TAN.yBas - 30) + '"/></clipPath></defs>' +
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8">' +
    '<path d="M' + TAN.x0 + " " + TAN.yBas + "H" + (TAN.x1 + 16) + "M" + TAN.x0 + " " + (TAN.yBas + 8) + 'V30"/>' +
    '<path d="M' + TAN.x0 + " " + TAN.yAxe + "H" + TAN.x1 + '" stroke-width="3" opacity="0.5"/>' + graduations + "</g>" +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5">' +
    '<text x="' + (TAN.x1 + 20) + '" y="' + (TAN.yBas + 4) + '">t</text><text x="' + (TAN.x0 - 8) + '" y="26" text-anchor="end">u_C</text>' +
    '<text x="' + (TAN.x0 - 8) + '" y="' + (TAN.yBas + 4) + '" text-anchor="end">0</text>' +
    '<text x="' + (TAN.x0 - 8) + '" y="' + (TAN.yAxe + 4) + '" text-anchor="end">t</text></g>';
  const textesAxe = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11 });
  const zone = svgEl("g", { "clip-path": "url(#clip-e-tan)" });
  const asymptote = svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", "stroke-dasharray": "10 6", opacity: 0.75 });
  const guides = svgEl("path", { stroke: "currentColor", "stroke-width": 1, fill: "none", opacity: 0.55 });
  const courbe = svgEl("path", { stroke: "currentColor", "stroke-width": 2.8, fill: "none", "stroke-linecap": "round" });
  const tangente = svgEl("path", { "stroke-width": 2, fill: "none", "stroke-dasharray": "4 4", style: "stroke: var(--serie-2)" });
  const point = svgEl("circle", { r: 5, fill: "currentColor" });
  zone.append(asymptote, guides, courbe, tangente, point);
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  svg.append(fond, zone, textesAxe, etiquettes);
  conteneur.appendChild(svg);

  const etat = { r: 10, c: 47, e: 12, u0: 0, t: 1 };

  const valeurs = api.sim.valeurs("#e-tangente-valeurs", [
    { id: "tau", libelle: "Constante de temps R C", unite: "ms", decimales: 1 },
    { id: "t", libelle: "Instant étudié t", unite: "ms", decimales: 1 },
    { id: "ttau", libelle: "Instant rapporté à R C", decimales: 2 },
    { id: "u", libelle: "Tension u_C(t)", unite: "V", decimales: 2 },
    { id: "i", libelle: "Courant i(t)", unite: "mA", decimales: 3 },
    { id: "ecart", libelle: "Écart restant / écart initial", unite: "%", decimales: 1 },
    { id: "pente", libelle: "Pente du/dt = écart / R C", unite: "V/s", decimales: 1 },
    { id: "w", libelle: "Énergie stockée C u_C² / 2", unite: "mJ", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const tau = etat.r * 1e3 * etat.c * 1e-6;
    const umax = Math.max(etat.e, etat.u0, 1) * 1.12;
    const vy = (u) => TAN.yBas - ((TAN.yBas - TAN.yHaut) * u) / (umax / 1.12);
    const vx = (n) => TAN.x0 + n * pxTau;
    const f = (n) => etat.e + (etat.u0 - etat.e) * Math.exp(-n);

    let d = "";
    for (let k = 0; k <= 100; k += 1) {
      const n = (5 * k) / 100;
      d += (k ? "L" : "M") + vx(n).toFixed(1) + " " + vy(f(n)).toFixed(1);
    }
    courbe.setAttribute("d", d);
    asymptote.setAttribute("d", "M" + TAN.x0 + " " + vy(etat.e).toFixed(1) + "H" + (TAN.x1 + 16));

    const n0 = etat.t;
    const u = f(n0);
    const px = vx(n0);
    const py = vy(u);
    tangente.setAttribute("d", "M" + px.toFixed(1) + " " + py.toFixed(1) + "L" + vx(n0 + 1).toFixed(1) + " " + vy(etat.e).toFixed(1));
    guides.setAttribute(
      "d",
      "M" + px.toFixed(1) + " " + py.toFixed(1) + "V" + TAN.yBas + "M" + vx(n0 + 1).toFixed(1) + " " + vy(etat.e).toFixed(1) + "V" + TAN.yBas
    );
    point.setAttribute("cx", px.toFixed(1));
    point.setAttribute("cy", py.toFixed(1));

    let textes = "";
    for (let k = 1; k <= 5; k += 1) {
      textes += '<text x="' + vx(k) + '" y="' + (TAN.yBas + 18) + '" text-anchor="middle">' + (k === 1 ? "τ" : k + "τ") + "</text>";
      textes += '<text x="' + vx(k) + '" y="' + (TAN.yAxe + 18) + '" text-anchor="middle">' + nombre(api, k * tau * 1000, k * tau * 1000 >= 100 ? 0 : 1) + " ms</text>";
    }
    textesAxe.innerHTML = textes;
    etiquettes.innerHTML =
      '<text x="' + (TAN.x0 - 8) + '" y="' + (vy(etat.e) + 4).toFixed(1) + '" text-anchor="end">E</text>' +
      (Math.abs(etat.u0 - etat.e) > 0.05 * umax && etat.u0 > 0.04 * umax
        ? '<text x="' + (TAN.x0 - 8) + '" y="' + (vy(etat.u0) + 4).toFixed(1) + '" text-anchor="end">U0</text>'
        : "") +
      '<text x="' + (TAN.x1 + 16) + '" y="' + (vy(etat.e) - 8).toFixed(1) + '" text-anchor="end">valeur finale ' + nombre(api, etat.e, 1) + " V</text>" +
      (n0 + 1 <= 5.05
        ? '<text x="' + vx(n0 + 1).toFixed(1) + '" y="' + (TAN.yBas - 6) + '" text-anchor="middle">t + τ</text>'
        : "");

    if (valeurs) {
      const ecart0 = etat.e - etat.u0;
      valeurs.maj({
        tau: tau * 1000,
        t: n0 * tau * 1000,
        ttau: n0,
        u,
        i: ((etat.e - u) / (etat.r * 1e3)) * 1000,
        ecart: Math.abs(ecart0) < 1e-9 ? 0 : ((etat.e - u) / ecart0) * 100,
        pente: (etat.e - u) / tau,
        w: 0.5 * etat.c * 1e-6 * u * u * 1000,
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
      { id: "r", libelle: "Résistance R", min: 1, max: 100, pas: 1, valeur: etat.r, unite: "kΩ" },
      { id: "c", libelle: "Capacité C", min: 1, max: 470, pas: 1, valeur: etat.c, unite: "µF" },
      { id: "e", libelle: "Tension de source E", min: 1, max: 24, pas: 0.5, valeur: etat.e, unite: "V" },
      { id: "u0", libelle: "Tension initiale U0", min: 0, max: 24, pas: 0.5, valeur: etat.u0, unite: "V" },
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
   E. Animation : construction de l'exponentielle par la méthode d'Euler
   -------------------------------------------------------------------------- */

const EUL = { x0: 70, px: 100, y0: 250, py: 150 };

function construireEuler(racine, api) {
  const conteneur = racine.querySelector("#e-euler");
  if (!conteneur) return;

  const vx = (n) => EUL.x0 + n * EUL.px;
  const vy = (u) => EUL.y0 - u * EUL.py;

  const svg = svgEl("svg", {
    viewBox: "0 0 660 340",
    role: "img",
    "aria-label": "Construction de la courbe de charge par la méthode d'Euler : segments de tangente successifs comparés à l'exponentielle exacte",
  });
  let exacte = "";
  for (let k = 0; k <= 100; k += 1) {
    const n = (5.2 * k) / 100;
    exacte += (k ? "L" : "M") + vx(n).toFixed(1) + " " + vy(1 - Math.exp(-n)).toFixed(1);
  }
  let graduations = "";
  let libelles = "";
  for (let k = 1; k <= 5; k += 1) {
    graduations += '<path d="M' + vx(k) + " " + EUL.y0 + 'v6"/>';
    libelles += '<text x="' + vx(k) + '" y="' + (EUL.y0 + 18) + '" text-anchor="middle">' + (k === 1 ? "τ" : k + "τ") + "</text>";
  }
  const fond = svgEl("g");
  fond.innerHTML =
    '<defs><clipPath id="clip-e-eul"><rect x="' + EUL.x0 + '" y="8" width="540" height="326"/></clipPath></defs>' +
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8"><path d="M' + EUL.x0 + " " + EUL.y0 + 'H620M70 334V10"/>' + graduations + "</g>" +
    '<path d="M70 ' + vy(1) + 'H620" stroke="currentColor" stroke-width="1.3" fill="none" stroke-dasharray="10 6" opacity="0.7"/>' +
    '<path d="' + exacte + '" stroke="currentColor" stroke-width="1.4" fill="none" stroke-dasharray="4 4" opacity="0.8"/>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5">' +
    '<text x="62" y="' + (vy(1) + 4) + '" text-anchor="end">E</text><text x="62" y="' + (EUL.y0 + 4) + '" text-anchor="end">0</text>' +
    '<text x="62" y="' + (vy(-0.5) + 4) + '" text-anchor="end">-0,5 E</text><text x="62" y="' + (vy(1.5) + 4) + '" text-anchor="end">1,5 E</text>' +
    '<text x="626" y="' + (EUL.y0 + 4) + '">t</text><text x="80" y="20">u_C / E</text>' + libelles +
    '<text x="560" y="' + (vy(1) - 8) + '" text-anchor="end">valeur finale</text></g>';
  const construction = svgEl("g", { "clip-path": "url(#clip-e-eul)" });
  svg.append(fond, construction);
  conteneur.appendChild(svg);

  const etat = { dt: 0.5, progression: 0 };

  const valeurs = api.sim.valeurs("#e-euler-valeurs", [
    { id: "dt", libelle: "Pas rapporté à R C", decimales: 2 },
    { id: "k", libelle: "Pas effectués", decimales: 0 },
    { id: "t", libelle: "Instant atteint, rapporté à R C", decimales: 2 },
    { id: "ue", libelle: "Tension par Euler u / E", decimales: 4 },
    { id: "ux", libelle: "Tension exacte u / E", decimales: 4 },
    { id: "err", libelle: "Écart Euler moins exact", unite: "% de E", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const dt = etat.dt;
    const total = Math.min(120, Math.ceil(5 / dt));
    const avance = etat.progression * total;
    const complets = Math.floor(avance);
    const partiel = avance - complets;
    let segments = "";
    let points = "";
    let u = 0;
    let t = 0;
    points += '<circle cx="' + vx(0) + '" cy="' + vy(0) + '" r="3.6"/>';
    for (let k = 0; k < complets; k += 1) {
      const suivant = u + dt * (1 - u);
      segments += "M" + vx(t).toFixed(1) + " " + vy(u).toFixed(1) + "L" + vx(t + dt).toFixed(1) + " " + vy(suivant).toFixed(1);
      u = suivant;
      t += dt;
      points += '<circle cx="' + vx(t).toFixed(1) + '" cy="' + vy(u).toFixed(1) + '" r="3.6"/>';
    }
    let uAffiche = u;
    let tAffiche = t;
    if (complets < total && partiel > 0) {
      const pente = 1 - u;
      tAffiche = t + partiel * dt;
      uAffiche = u + pente * partiel * dt;
      segments += "M" + vx(t).toFixed(1) + " " + vy(u).toFixed(1) + "L" + vx(tAffiche).toFixed(1) + " " + vy(uAffiche).toFixed(1);
    }
    construction.innerHTML =
      '<path d="' + segments + '" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<g fill="currentColor" stroke="none">' + points + "</g>";
    if (valeurs) {
      const exact = 1 - Math.exp(-t);
      valeurs.maj({ dt, k: complets, t, ue: u, ux: exact, err: (u - exact) * 100 });
    }
  }

  const lecteur = api.sim.lecteur("#e-euler-lecteur", {
    de: 0,
    a: 1,
    duree: 9,
    boucle: false,
    auto: false,
    libelle: "Construire la courbe pas à pas",
    rappel: (valeur) => {
      etat.progression = valeur;
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);

  const curseurs = api.sim.curseurs(
    "#e-euler-curseurs",
    [{ id: "dt", libelle: "Pas de calcul Δt / τ", min: 0.05, max: 2.4, pas: 0.05, valeur: etat.dt, chiffres: 2 }],
    (lues) => {
      etat.dt = lues.dt;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : réponse à un signal carré
   -------------------------------------------------------------------------- */

function construireCarre(racine, api) {
  const E = 10;
  const etat = { r: 10, c: 1, f: 20 };
  let bornes = [];
  let h = 0;
  let tau = 0;
  let umin = 0;
  let umax = 0;

  function preparer() {
    tau = etat.r * 1e3 * etat.c * 1e-6;
    h = 1 / (2 * etat.f);
    bornes = [0];
    for (let k = 0; k < 16; k += 1) {
      const niveau = k % 2 === 0 ? E : 0;
      bornes.push(niveau + (bornes[k] - niveau) * Math.exp(-h / tau));
    }
    const a = Math.exp(-h / tau);
    umax = E / (1 + a);
    umin = (E * a) / (1 + a);
  }

  function source(tms) {
    const k = Math.floor(tms / 1000 / h);
    return k % 2 === 0 ? E : 0;
  }

  function reponse(tms) {
    const t = tms / 1000;
    const k = Math.min(15, Math.floor(t / h));
    const niveau = k % 2 === 0 ? E : 0;
    return niveau + (bornes[k] - niveau) * Math.exp(-(t - k * h) / tau);
  }

  preparer();
  const traceur = api.sim.traceur("#e-carre-trace", {
    titre: "Tension de la source et tension du condensateur",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "tension",
    yUnite: "V",
    xMin: 0,
    xMax: 8000 / etat.f,
    yMin: -0.5,
    yMax: 11,
    echantillons: 800,
    series: [
      { id: "ue", nom: "tension de la source, carré de 0 à 10 V", couleur: "serie-1", epaisseur: 1.6, fonction: source },
      { id: "uc", nom: "tension u_C du condensateur", couleur: "serie-2", epaisseur: 3, fonction: reponse },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, umax, "U max établi");
      ligneHorizontale(c, repere, couleurs, umin, "U min établi");
    },
    note: "Huit périodes sont affichées, en partant d'un condensateur déchargé.",
  });
  if (traceur) ressources.push(traceur);

  function maj() {
    preparer();
    if (!traceur) return;
    traceur.definirPlage({ xMin: 0, xMax: 8000 / etat.f });
    traceur.definirFonction("ue", source);
    traceur.definirFonction("uc", reponse);
    traceur.definirMesures([
      { nom: "Constante de temps R C", valeur: nombre(api, tau * 1000, 2) + " ms" },
      { nom: "Demi-période h", valeur: nombre(api, h * 1000, 2) + " ms" },
      { nom: "Demi-période rapportée à R C", valeur: nombre(api, h / tau, 2) },
      { nom: "U min et U max établis", valeur: nombre(api, umin, 2) + " V et " + nombre(api, umax, 2) + " V" },
      { nom: "Ondulation crête à crête", valeur: nombre(api, umax - umin, 2) + " V" },
      { nom: "Valeur moyenne établie", valeur: "5,00 V" },
    ]);
  }

  const curseurs = api.sim.curseurs(
    "#e-carre-curseurs",
    [
      { id: "r", libelle: "Résistance R", min: 1, max: 100, pas: 1, valeur: etat.r, unite: "kΩ" },
      { id: "c", libelle: "Capacité C", min: 0.1, max: 10, pas: 0.1, valeur: etat.c, unite: "µF", chiffres: 1 },
      { id: "f", libelle: "Fréquence du carré", min: 1, max: 500, pas: 1, valeur: etat.f, unite: "Hz" },
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
   H. Courbe calculée de l'exemple
   -------------------------------------------------------------------------- */

function construireTraceExemple(racine, api) {
  const u = (t) =>
    t < EX.ouverture ? EX.eth * (1 - Math.exp(-t / EX.tau)) : EX.u2 * Math.exp(-(t - EX.ouverture) / EX.tau2);
  const traceur = api.sim.traceur("#h-trace", {
    titre: "Temporisation : charge puis décharge",
    genre: "Tracé",
    xTitre: "t",
    xUnite: "s",
    yTitre: "u_C",
    yUnite: "V",
    xMin: 0,
    xMax: 4.5,
    yMin: 0,
    yMax: 16,
    ratio: 0.45,
    echantillons: 600,
    series: [{ id: "u", nom: "u_C(t) calculée", couleur: "serie-1", epaisseur: 2.6, fonction: u }],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, EX.seuil, "seuil de validation 10 V");
      ligneHorizontale(c, repere, couleurs, EX.rearmement, "");
      marquerPoint(c, repere, couleurs, EX.t10, EX.seuil, "0,334 s", false);
      marquerPoint(c, repere, couleurs, EX.ouverture, EX.u2, "ouverture de K, 14,39 V", false);
      marquerPoint(c, repere, couleurs, EX.ouverture + EX.t2, EX.rearmement, "réarmement : 2 V à 3,39 s", true);
    },
  });
  if (traceur) ressources.push(traceur);
}

/* --------------------------------------------------------------------------
   I. Animation et simulation : précharge du bus continu
   -------------------------------------------------------------------------- */

function construirePrecharge(racine, api) {
  const conteneur = racine.querySelector("#i-precharge");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 310",
    role: "img",
    "aria-label": "Circuit de précharge du bus continu : source redressée, résistance de précharge court-circuitée par le contact KM2, capacité du bus et résistances d'équilibrage ; épaisseur de la flèche de courant et jauge de tension mises à jour",
  });
  const fond = svgEl("g");
  fond.innerHTML =
    "<defs>" + '<marker id="fl-i-pre" markerWidth="14" markerHeight="14" refX="9" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 12 6 0 12Z" fill="currentColor"/></marker>' + marqueur("fl-i-pre-u", "var(--serie-2)") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="80" cy="150" r="24"/><path d="M80 126V60H180M270 60H540V110M540 180V240H80V174"/>' +
    '<rect x="180" y="48" width="90" height="24" rx="3"/>' +
    '<path d="M150 60V22H200M250 22H300V60"/>' +
    '<path d="M420 60V130M420 150V240"/><path d="M390 130H450M390 150H450" stroke-width="3.4"/>' +
    '<rect x="528" y="110" width="24" height="70" rx="3"/></g>' +
    '<g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="203" cy="22" r="3.2"/><circle cx="247" cy="22" r="3.2"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="150" cy="60" r="3.6"/><circle cx="300" cy="60" r="3.6"/><circle cx="420" cy="60" r="3.6"/><circle cx="420" cy="240" r="3.6"/></g>' +
    '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M476 220V80" marker-end="url(#fl-i-pre-u)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    '<text x="80" y="145" text-anchor="middle" font-weight="600">+</text><text x="80" y="166" text-anchor="middle" font-weight="600">-</text>' +
    '<text x="80" y="200" text-anchor="middle" font-size="11.5">redresseur</text>' +
    '<text x="225" y="94" text-anchor="middle">R_p</text><text x="225" y="40" text-anchor="middle">KM2</text>' +
    '<text x="402" y="126" text-anchor="end" font-weight="600">+</text><text x="402" y="176" text-anchor="end">C = 2,2 mF</text>' +
    '<text x="486" y="160" style="fill: var(--serie-2)">u_C</text><text x="562" y="150">R_e</text>' +
    '<text x="330" y="260" text-anchor="middle" font-size="11.5">pôle - du bus : référence de potentiel</text></g>';
  const lame = svgEl("path", { stroke: "currentColor", "stroke-width": 3, fill: "none", "stroke-linecap": "round" });
  const fleche = svgEl("path", { stroke: "currentColor", fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-i-pre)" });
  const dynamiques = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  const jaugeG = svgEl("g");
  svg.append(fond, lame, fleche, dynamiques, jaugeG);
  conteneur.appendChild(svg);

  const etat = { rp: BUS.rp, tkm: BUS.tkm, ures: BUS.ures, t: 0 };
  let calc = {};

  function calculer() {
    const u = etat.ures * Math.SQRT2;
    const tau = etat.rp * BUS.c;
    const ecart = u * Math.exp(-etat.tkm / tau);
    const xMax = Math.ceil(Math.max(1, etat.tkm + 0.3, 5 * tau) * 10) / 10;
    calc = {
      u,
      tau,
      ecart,
      xMax,
      i0: u / etat.rp,
      pointe: ecart / BUS.rFermeture,
      wFermeture: 0.5 * BUS.c * ecart * ecart,
      wr: 0.5 * BUS.c * u * u * (1 - Math.exp((-2 * etat.tkm) / tau)),
      wFinal: 0.5 * BUS.c * u * u,
    };
  }

  const uC = (t) => (t < etat.tkm ? calc.u * (1 - Math.exp(-t / calc.tau)) : calc.u);
  const iR = (t) => (t < etat.tkm ? calc.i0 * Math.exp(-t / calc.tau) : 0);

  function curseurTemps(c, repere, couleurs, fonction) {
    ligneVerticale(c, repere, couleurs, etat.tkm, "fermeture de KM2");
    const px = repere.versX(etat.t);
    const py = repere.versY(fonction(etat.t));
    c.save();
    c.fillStyle = couleurs.texte;
    c.beginPath();
    c.arc(px, py, 5, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  calculer();
  const traceTension = api.sim.traceur("#i-precharge-tension", {
    titre: "Tension du bus",
    xTitre: "t",
    xUnite: "s",
    yTitre: "u_C",
    yUnite: "V",
    xMin: 0,
    xMax: calc.xMax,
    yMin: 0,
    yMax: 700,
    ratio: 0.36,
    series: [{ id: "u", nom: "u_C(t), tension du bus", couleur: "serie-1", epaisseur: 2.6, fonction: uC }],
    surDessin({ c, repere, couleurs }) {
      curseurTemps(c, repere, couleurs, uC);
    },
  });
  if (traceTension) ressources.push(traceTension);

  const traceCourant = api.sim.traceur("#i-precharge-courant", {
    titre: "Courant dans la résistance de précharge",
    xTitre: "t",
    xUnite: "s",
    yTitre: "i",
    yUnite: "A",
    xMin: 0,
    xMax: calc.xMax,
    yMin: 0,
    yMax: 15,
    ratio: 0.36,
    series: [{ id: "i", nom: "i(t) dans R_p", couleur: "serie-3", epaisseur: 2.6, fonction: iR }],
    surDessin({ c, repere, couleurs }) {
      curseurTemps(c, repere, couleurs, iR);
      const px = repere.versX(etat.tkm);
      c.save();
      c.fillStyle = couleurs.texte;
      c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
      const gauche = px > repere.boite.x + repere.boite.l * 0.45;
      c.textAlign = gauche ? "right" : "left";
      c.fillText(
        "pointe dans KM2 : " + nombre(api, calc.pointe, 0) + " A, hors échelle",
        px + (gauche ? -6 : 6),
        repere.boite.y + 30
      );
      c.restore();
    },
  });
  if (traceCourant) ressources.push(traceCourant);

  const valeurs = api.sim.valeurs("#i-precharge-valeurs", [
    { id: "t", libelle: "Instant t", unite: "s", decimales: 3 },
    { id: "u", libelle: "Tension du bus u_C", unite: "V", decimales: 1 },
    { id: "i", libelle: "Courant dans R_p", unite: "A", decimales: 2 },
    { id: "p", libelle: "Puissance dans R_p", unite: "W", decimales: 0 },
    { id: "w", libelle: "Énergie dissipée dans R_p depuis t = 0", unite: "J", decimales: 1 },
    { id: "tau", libelle: "Constante de temps R_p C", unite: "ms", decimales: 1 },
    { id: "ecart", libelle: "Écart restant à la fermeture de KM2", unite: "V", decimales: 2 },
    { id: "pointe", libelle: "Pointe à la fermeture, sous 0,1 Ω", unite: "A", decimales: 0 },
    { id: "wf", libelle: "Énergie dissipée à la fermeture, C ΔU² / 2", unite: "J", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher() {
    const t = etat.t;
    const u = uC(t);
    const i = iR(t);
    const ferme = t >= etat.tkm;
    lame.setAttribute("d", ferme ? "M206 22L244 22" : "M206 22L238 8");
    fleche.setAttribute("d", "M318 60H370");
    fleche.setAttribute("stroke-width", (1.4 + 5 * Math.min(1, i / 13.3)).toFixed(2));
    fleche.setAttribute("opacity", i > 0.02 ? "1" : "0.25");
    dynamiques.innerHTML =
      '<text x="344" y="48" text-anchor="middle">i</text>' +
      '<text x="30" y="104" font-size="11.5">' + nombre(api, calc.u, 1) + " V</text>" +
      '<text x="660" y="40" text-anchor="end" font-weight="600">' + (ferme ? "KM2 fermé" : "KM2 ouvert, précharge") + "</text>";
    jaugeG.innerHTML = jauge(250, 280, 300, "u_C / U", u / calc.u, Math.round((u / calc.u) * 100) + " %");
    if (valeurs) {
      const tc = Math.min(t, etat.tkm);
      valeurs.maj({
        t,
        u,
        i,
        p: etat.rp * i * i,
        w: 0.5 * BUS.c * calc.u * calc.u * (1 - Math.exp((-2 * tc) / calc.tau)),
        tau: calc.tau * 1000,
        ecart: calc.ecart,
        pointe: calc.pointe,
        wf: calc.wFermeture,
      });
    }
    if (traceTension) traceTension.demanderRendu();
    if (traceCourant) traceCourant.demanderRendu();
  }

  let lecteur = null;

  function majParametres() {
    calculer();
    if (traceTension) {
      traceTension.definirPlage({ xMin: 0, xMax: calc.xMax, yMin: 0, yMax: Math.ceil((calc.u * 1.12) / 50) * 50 });
      traceTension.definirFonction("u", uC);
    }
    if (traceCourant) {
      traceCourant.definirPlage({ xMin: 0, xMax: calc.xMax, yMin: 0, yMax: Math.ceil(calc.i0 * 1.15) });
      traceCourant.definirFonction("i", iR);
    }
    etat.t = (lecteur ? lecteur.valeur() : 0) * calc.xMax;
    afficher();
  }

  lecteur = api.sim.lecteur("#i-precharge-lecteur", {
    de: 0,
    a: 1,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Mettre le variateur sous tension et suivre la précharge",
    rappel: (valeur) => {
      etat.t = valeur * calc.xMax;
      afficher();
    },
  });
  if (lecteur) ressources.push(lecteur);

  const curseurs = api.sim.curseurs(
    "#i-precharge-curseurs",
    [
      { id: "rp", libelle: "Résistance de précharge R_p", min: 10, max: 150, pas: 1, valeur: etat.rp, unite: "Ω" },
      { id: "tkm", libelle: "Instant de fermeture de KM2", min: 0.05, max: 1, pas: 0.01, valeur: etat.tkm, unite: "s", chiffres: 2 },
      { id: "ures", libelle: "Tension composée du réseau", min: 360, max: 440, pas: 5, valeur: etat.ures, unite: "V" },
    ],
    (lues) => {
      etat.rp = lues.rp;
      etat.tkm = lues.tkm;
      etat.ures = lues.ures;
      majParametres();
    }
  );
  if (curseurs) ressources.push(curseurs);
  majParametres();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/* Filtre d'entrée de l'exercice avancé : R série, entrée de 10 kilohms en parallèle sur 1 microfarad. */
function retardFiltre(r) {
  const rin = 10e3;
  const eth = (24 * rin) / (r + rin);
  const rth = (r * rin) / (r + rin);
  if (eth <= 11) return Infinity;
  return rth * 1e-6 * Math.log(eth / (eth - 11));
}

function rMinFiltre() {
  let bas = 100;
  let haut = 11800;
  for (let k = 0; k < 80; k += 1) {
    const milieu = (bas + haut) / 2;
    if (retardFiltre(milieu) < 2e-3) bas = milieu;
    else haut = milieu;
  }
  return (bas + haut) / 2;
}

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : charge depuis zéro. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-charge",
      titre: "Tension atteinte pendant une charge",
      niveau: "fondamental",
      enonce:
        "<p>Un condensateur déchargé de $1\\ \\mu\\mathrm{F}$ est chargé sous $E = 10\\ \\mathrm{V}$ à travers $R = 2{,}2\\ \\mathrm{k\\Omega}$. Quelle est sa tension $3\\ \\mathrm{ms}$ après la fermeture, en volts ?</p>",
      valeur: 10 * (1 - Math.exp(-3 / 2.2)),
      unite: "V",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "u_C(3 ms)",
      etapes: [
        { texte: "Constante de temps : $\\tau = RC = 2{,}2 \\times 10^3 \\times 10^{-6} = 2{,}2\\ \\mathrm{ms}$." },
        { texte: "Trois grandeurs : $u_C(0^+) = 0$, $u_\\infty = 10\\ \\mathrm{V}$, $\\tau = 2{,}2\\ \\mathrm{ms}$, d'où $u_C = 10\\,(1 - e^{-t/\\tau})$." },
        { texte: "$t/\\tau = 3/2{,}2 = 1{,}364$ et $e^{-1{,}364} = 0{,}2557$." },
        {
          texte: "$u_C = 10 \\times (1 - 0{,}2557) = 7{,}44\\ \\mathrm{V}$.",
          note: "Contrôle : entre $\\tau$ ($6{,}32\\ \\mathrm{V}$) et $2\\tau$ ($8{,}65\\ \\mathrm{V}$), cohérent avec $1{,}36\\,\\tau$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Charge sous 10 V avec τ = 2,2 ms",
          genre: "Correction visuelle",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "u_C",
          yUnite: "V",
          xMin: 0,
          xMax: 11,
          yMin: 0,
          yMax: 11,
          ratio: 0.42,
          series: [{ id: "u", nom: "u_C(t)", couleur: "serie-1", fonction: (t) => 10 * (1 - Math.exp(-t / 2.2)) }],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 10, "E = 10 V");
            marquerPoint(c, repere, couleurs, 2.2, 10 * (1 - Math.exp(-1)), "τ : 6,32 V", false);
            marquerPoint(c, repere, couleurs, 3, 10 * (1 - Math.exp(-3 / 2.2)), "3 ms : 7,44 V", false);
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  /* Fondamental 2 : durée d'une décharge. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-decharge",
      titre: "Durée d'une décharge jusqu'à un seuil",
      niveau: "fondamental",
      enonce:
        "<p>Un condensateur de $100\\ \\mu\\mathrm{F}$ chargé à $50\\ \\mathrm{V}$ se décharge dans une résistance de $1\\ \\mathrm{k\\Omega}$. Au bout de combien de temps sa tension passe-t-elle sous $5\\ \\mathrm{V}$, en secondes ?</p>",
      valeur: 0.1 * Math.log(10),
      unite: "s",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "t",
      etapes: [
        { texte: "$\\tau = 10^3 \\times 100 \\times 10^{-6} = 0{,}1\\ \\mathrm{s}$ ; $u_C(0^+) = 50\\ \\mathrm{V}$, $u_\\infty = 0$." },
        { texte: "$t = \\tau\\ln\\dfrac{50 - 0}{5 - 0} = 0{,}1 \\times \\ln 10$." },
        {
          texte: "$t = 0{,}1 \\times 2{,}303 = 0{,}230\\ \\mathrm{s}$.",
          note: "Repère utile : diviser une tension par dix prend $2{,}3\\,\\tau$, par cent $4{,}6\\,\\tau$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Décharge de 50 V avec τ = 0,1 s",
          genre: "Correction visuelle",
          xTitre: "t",
          xUnite: "s",
          yTitre: "u_C",
          yUnite: "V",
          xMin: 0,
          xMax: 0.5,
          yMin: 0,
          yMax: 55,
          ratio: 0.42,
          series: [{ id: "u", nom: "u_C(t) = 50 exp(-t / 0,1)", couleur: "serie-1", fonction: (t) => 50 * Math.exp(-t / 0.1) }],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 5, "seuil 5 V");
            marquerPoint(c, repere, couleurs, 0.1 * Math.log(10), 5, "0,230 s", false);
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  /* Intermédiaire 1 : constante de temps vue par le condensateur. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-thevenin",
      titre: "Constante de temps dans un pont",
      niveau: "intermédiaire",
      enonce:
        "<p>Une source de $12\\ \\mathrm{V}$ charge, à travers $R_1 = 4{,}7\\ \\mathrm{k\\Omega}$, un condensateur de $10\\ \\mu\\mathrm{F}$ en parallèle avec $R_2 = 4{,}7\\ \\mathrm{k\\Omega}$. Quelle est la constante de temps de la charge, en millisecondes ? Vers quelle tension le condensateur tend-il ?</p>",
      valeur: 23.5,
      unite: "ms",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "τ",
      etapes: [
        { texte: "Source éteinte, le condensateur voit $R_1 \\parallel R_2 = 4{,}7/2 = 2{,}35\\ \\mathrm{k\\Omega}$." },
        { texte: "$\\tau = 2{,}35 \\times 10^3 \\times 10 \\times 10^{-6} = 23{,}5\\ \\mathrm{ms}$." },
        {
          texte: "Valeur finale : tension à vide du pont, $12 \\times 4{,}7/(4{,}7 + 4{,}7) = 6\\ \\mathrm{V}$, et non $12\\ \\mathrm{V}$.",
          note: "Erreur typique : $\\tau = R_1C = 47\\ \\mathrm{ms}$ et une valeur finale de $12\\ \\mathrm{V}$, deux fautes qui se compensent en partie au début de la charge et trompent le contrôle visuel.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 620 230",
          '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<circle cx="50" cy="110" r="18"/><path d="M50 92V40H90M150 40H260V90M260 130V180H50V128"/><rect x="90" y="28" width="60" height="24" rx="3"/>' +
            '<path d="M200 40V80M200 140V180"/><rect x="188" y="80" width="24" height="60" rx="3"/><path d="M230 90H290M230 110H290" stroke-width="3"/>' +
            '<circle cx="410" cy="110" r="18"/><path d="M410 92V40H450M510 40H560V90M560 130V180H410V128"/><rect x="450" y="28" width="60" height="24" rx="3"/>' +
            '<path d="M530 90H590M530 110H590" stroke-width="3"/><path d="M320 110H372"/><path d="M362 104 372 110 362 116"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
            '<text x="50" y="114" text-anchor="middle">12 V</text><text x="120" y="70" text-anchor="middle">4,7 kΩ</text><text x="176" y="114" text-anchor="end">4,7 kΩ</text>' +
            '<text x="298" y="104">10 µF</text><text x="410" y="114" text-anchor="middle">6 V</text><text x="480" y="70" text-anchor="middle">2,35 kΩ</text>' +
            '<text x="598" y="104" text-anchor="end">10 µF</text><text x="346" y="98" text-anchor="middle">Thévenin</text>' +
            '<text x="310" y="214" text-anchor="middle">τ = 2,35 kΩ × 10 µF = 23,5 ms ; u_C tend vers 6 V</text></g>',
          "Réduction du pont : source de 6 volts et résistance de 2,35 kilohms, constante de temps 23,5 millisecondes"
        );
      },
    })
  );

  /* Intermédiaire 2 : condition initiale non nulle. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-initiale",
      titre: "Recharge d'un condensateur déjà chargé",
      niveau: "intermédiaire",
      enonce:
        "<p>Un condensateur de $22\\ \\mu\\mathrm{F}$, chargé à $5\\ \\mathrm{V}$, est relié à $t = 0$ à une source de $15\\ \\mathrm{V}$ par une résistance de $10\\ \\mathrm{k\\Omega}$. À quel instant sa tension atteint-elle $12\\ \\mathrm{V}$, en secondes ?</p>",
      valeur: 0.22 * Math.log(10 / 3),
      unite: "s",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "t",
      etapes: [
        { texte: "$\\tau = 10^4 \\times 22 \\times 10^{-6} = 0{,}22\\ \\mathrm{s}$ ; $u_C(0^+) = 5\\ \\mathrm{V}$ par continuité ; $u_\\infty = 15\\ \\mathrm{V}$." },
        { texte: "$t = \\tau\\ln\\dfrac{5 - 15}{12 - 15} = 0{,}22 \\times \\ln\\dfrac{10}{3}$." },
        {
          texte: "$t = 0{,}22 \\times 1{,}204 = 0{,}265\\ \\mathrm{s}$.",
          note: "En oubliant la tension initiale, on trouverait $0{,}22 \\ln(15/3) = 0{,}354\\ \\mathrm{s}$ : $34\\ \\%$ de trop.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Recharge de 5 V vers 15 V",
          genre: "Correction visuelle",
          xTitre: "t",
          xUnite: "s",
          yTitre: "u_C",
          yUnite: "V",
          xMin: 0,
          xMax: 1.1,
          yMin: 0,
          yMax: 16,
          ratio: 0.42,
          series: [
            { id: "u", nom: "u_C(t) depuis 5 V", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => 15 - 10 * Math.exp(-t / 0.22) },
            { id: "v", nom: "même charge depuis 0 V, pour comparaison", couleur: "serie-6", epaisseur: 1.4, fonction: (t) => 15 - 15 * Math.exp(-t / 0.22) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 12, "12 V");
            marquerPoint(c, repere, couleurs, 0.22 * Math.log(10 / 3), 12, "0,265 s", true);
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  /* Avancé : filtre antirebond d'une entrée d'automate. */
  const rMin = rMinFiltre();
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-antirebond",
      titre: "Dimensionner un filtre antirebond",
      niveau: "avancé",
      enonce:
        "<p>Une entrée tout ou rien d'automate, alimentée par un contact sous $24\\ \\mathrm{V}$, est modélisée par une résistance d'entrée de $10\\ \\mathrm{k\\Omega}$ ; elle bascule à l'état haut quand sa tension dépasse $11\\ \\mathrm{V}$. On place un condensateur de $1\\ \\mu\\mathrm{F}$ en parallèle sur l'entrée et une résistance $R$ en série entre le contact et l'entrée. Le contact rebondit : une fermeture de moins de $2\\ \\mathrm{ms}$ ne doit pas faire basculer l'entrée. Quelle est la valeur minimale de $R$, en kilohms ? Quelle valeur de la série E12 retenez-vous, et quelle marge garde-t-elle sur le seuil ?</p>",
      valeur: rMin / 1000,
      unite: "kΩ",
      tolerance: 0.03,
      chiffres: 2,
      libelleChamp: "R minimale",
      etapes: [
        { texte: "Vu du condensateur : $E_{th} = 24\\,\\dfrac{10}{R + 10}$ (en kilohms) et $R_{th} = \\dfrac{10\\,R}{R + 10}$ ; le condensateur part de zéro." },
        { texte: "Retard de basculement : $t_s = R_{th}C\\,\\ln\\dfrac{E_{th}}{E_{th} - 11}$, à rendre supérieur ou égal à $2\\ \\mathrm{ms}$." },
        { texte: "Contrainte opposée : le seuil doit rester accessible, $E_{th} > 11\\ \\mathrm{V}$, donc $R < 10 \\times (24/11 - 1) = 11{,}8\\ \\mathrm{k\\Omega}$." },
        { texte: "$t_s$ croît avec $R$ : on résout $t_s(R) = 2\\ \\mathrm{ms}$ par essais successifs ou par dichotomie, et l'on trouve $R_{\\min} = 2{,}89\\ \\mathrm{k\\Omega}$." },
        {
          texte: "Valeur E12 retenue : $3{,}3\\ \\mathrm{k\\Omega}$, qui donne $E_{th} = 18{,}0\\ \\mathrm{V}$, $R_{th} = 2{,}48\\ \\mathrm{k\\Omega}$, $\\tau = 2{,}48\\ \\mathrm{ms}$ et $t_s = 2{,}33\\ \\mathrm{ms}$.",
          note: "Marge sur le seuil : $18{,}0\\ \\mathrm{V}$ contre $11\\ \\mathrm{V}$ ; à la retombée, le condensateur se décharge dans l'entrée seule, avec $\\tau = 10\\ \\mathrm{ms}$, et le retard à l'ouverture devient plus long que le retard à la fermeture : à vérifier contre le temps de cycle de l'automate.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Retard de basculement en fonction de R",
          genre: "Correction visuelle",
          xTitre: "R",
          xUnite: "kΩ",
          yTitre: "retard",
          yUnite: "ms",
          xMin: 0.5,
          xMax: 11.5,
          yMin: 0,
          yMax: 12,
          ratio: 0.42,
          series: [{ id: "t", nom: "retard t_s(R)", couleur: "serie-1", fonction: (rk) => Math.min(20, retardFiltre(rk * 1000) * 1000) }],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 2, "exigence 2 ms");
            marquerPoint(c, repere, couleurs, rMin / 1000, 2, "R min = 2,89 kΩ", false);
            marquerPoint(c, repere, couleurs, 3.3, retardFiltre(3300) * 1000, "3,3 kΩ : 2,33 ms", false);
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
      titre: "Résistance de précharge brûlée",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Sur le variateur de la pompe, la tension du bus monte normalement en une fraction de seconde à chaque mise sous tension, et les mises sous tension sont rares. Pourtant, la résistance de précharge est retrouvée brûlée après quelques minutes de fonctionnement du moteur, et le variateur signale des défauts de sous-tension du bus en charge. Quelles hypothèses sont compatibles avec ces symptômes ?</p>",
      options: [
        { texte: "Le contacteur $KM2$ de court-circuit ne se ferme pas, ou ses contacts ne conduisent plus.", juste: true },
        { texte: "La commande de $KM2$ est défaillante : bobine coupée, sortie de commande ou temporisation en défaut.", juste: true },
        { texte: "L'énergie de précharge $\\tfrac{1}{2}CU^2$ est trop grande pour la résistance." },
        { texte: "La capacité du bus a diminué par vieillissement des condensateurs." },
        { texte: "La résistance de précharge a une valeur trop forte." },
      ],
      etapes: [
        { texte: "La précharge elle-même est normale : montée rapide, mises sous tension rares. L'énergie impulsionnelle n'est donc pas en cause." },
        { texte: "La résistance brûle pendant le fonctionnement du moteur : elle est parcourue par le courant de charge, ce qui n'arrive que si $KM2$ ne la court-circuite pas." },
        { texte: "La chute de tension dans la résistance explique aussi les défauts de sous-tension du bus en charge." },
        {
          texte: "Une capacité plus faible accélérerait la précharge sans échauffer la résistance en service ; une résistance plus forte la ralentirait. Aucune des deux n'explique les symptômes.",
          note: "Vérification sur site, hors tension puis en respectant les consignes : mesurer en service la tension aux bornes de $R_p$, qui doit être quasi nulle, puis contrôler la bobine et la commande de $KM2$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 620 220",
          "<defs>" + marqueur("fl-k-diag") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<circle cx="60" cy="110" r="20"/><path d="M60 90V60H160M250 60H420V90M420 110V180H60V130"/><rect x="160" y="48" width="90" height="24" rx="3"/>' +
            '<path d="M130 60V24H180M226 24H280V60"/><path d="M186 24L216 8"/><path d="M390 90H450M390 110H450" stroke-width="3"/>' +
            '<path d="M420 60H560V90"/><rect x="540" y="90" width="40" height="60" rx="4"/><path d="M560 150V180H420"/></g>' +
            '<g stroke="currentColor" stroke-width="3.6" fill="none" stroke-linecap="round"><path d="M280 60H330" marker-end="url(#fl-k-diag)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
            '<text x="205" y="94" text-anchor="middle">R_p chauffe</text><text x="205" y="14" text-anchor="start" dx="24">KM2 resté ouvert</text>' +
            '<text x="560" y="124" text-anchor="middle">onduleur</text><text x="560" y="138" text-anchor="middle">et moteur</text>' +
            '<text x="300" y="46" text-anchor="middle">courant du moteur</text>' +
            '<text x="310" y="210" text-anchor="middle">en service, tension non nulle aux bornes de R_p : KM2 ou sa commande en défaut</text></g>',
          "Contacteur de court-circuit resté ouvert : le courant du moteur traverse la résistance de précharge"
        );
      },
    })
  );

  /* Conceptuel. */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-conceptuel",
      titre: "La moitié de l'énergie, quelle que soit la résistance",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul long, expliquez pourquoi la charge d'un condensateur déchargé sous une tension $E$, à travers une résistance, dissipe toujours dans cette résistance la moitié de l'énergie fournie par la source, quelle que soit sa valeur. Comment pourrait-on charger ce condensateur avec moins de pertes ?</p>",
      motsCles: [
        ["moitie", "50 %", "autant", "egale"],
        ["courant", "intens", "pointe"],
        ["duree", "long", "bref", "temps", "rapide"],
        ["ecart", "progressi", "paliers", "etapes", "rampe", "inductance", "hacheur", "convertisseur"],
      ],
      minimum: 3,
      exemple: "Trois ou quatre phrases : reliez la valeur de R à l'intensité et à la durée du courant, puis proposez une autre manière de charger.",
      etapes: [
        { texte: "La source débite la charge $Q = CE$ sous la tension $E$ : elle fournit $CE^2$ ; le condensateur en garde $\\tfrac{1}{2}CE^2$." },
        { texte: "Une résistance faible donne un courant fort mais bref, une résistance forte un courant faible mais long : l'énergie $\\int Ri^2\\,\\mathrm{d}t$ est proportionnelle à $R \\times (E/R)^2 \\times RC/2$, où $R$ disparaît." },
        { texte: "La perte vaut en réalité $\\tfrac{1}{2}C\\,\\Delta U^2$ : elle dépend de l'écart de tension entre la source et le condensateur au moment de la manœuvre." },
        {
          texte: "Pour réduire les pertes, il faut réduire cet écart : charger par paliers successifs, par une source dont la tension suit celle du condensateur, ou à travers une inductance, comme dans un convertisseur à découpage.",
          note: "En $n$ paliers égaux, la perte totale est divisée par $n$ : $n \\times \\tfrac{1}{2}C(E/n)^2 = \\tfrac{1}{2}CE^2/n$.",
        },
      ],
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const DESSIN_QUIZ =
  '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="60" cy="135" r="22"/><path d="M60 113V40H120M200 40H400V110M400 130V230H60V157"/>' +
  '<rect x="120" y="28" width="80" height="24" rx="3"/><path d="M260 40V100M260 170V230"/><rect x="248" y="100" width="24" height="70" rx="3"/>' +
  '<path d="M370 110H430M370 130H430" stroke-width="3.2"/></g>' +
  '<g fill="currentColor" stroke="none"><circle cx="260" cy="40" r="4"/><circle cx="260" cy="230" r="4"/></g>' +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
  '<text x="60" y="131" text-anchor="middle" font-weight="600">+</text><text x="30" y="140" text-anchor="end">E</text>' +
  '<text x="160" y="72" text-anchor="middle">R1</text><text x="284" y="140">R2</text><text x="440" y="124">C</text>' +
  '<text x="230" y="256" text-anchor="middle" font-size="11.5">masse : référence 0 V</text></g>';

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Un condensateur déchargé est chargé à travers une résistance. Quelle fraction de la tension finale atteint-il après une constante de temps ?</p>",
        options: ["$37\\ \\%$", "$50\\ \\%$", "$63\\ \\%$", "$95\\ \\%$"],
        bonnes: [2],
        explication: "$1 - e^{-1} = 0{,}632$ : il reste $37\\ \\%$ de l'écart. $50\\ \\%$ est atteint en $0{,}69\\,\\tau$ et $95\\ \\%$ en $3\\tau$.",
        resume: "Repère à une constante de temps",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Le courant d'un condensateur peut changer brusquement de valeur à l'instant d'une manœuvre.</p>",
        reponse: true,
        explication: "Seule la tension du condensateur est continue. Son courant saute, par exemple de $0$ à $E/R$ à la fermeture, ou change de signe au passage à la décharge.",
        resume: "Discontinuité du courant",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la constante de temps d'un circuit RC avec $R = 3{,}3\\ \\mathrm{k\\Omega}$ et $C = 220\\ \\mu\\mathrm{F}$, en secondes ?</p>",
        valeur: 0.726,
        unite: "s",
        tolerance: 0.02,
        chiffres: 3,
        explication: "$\\tau = 3{,}3 \\times 10^3 \\times 220 \\times 10^{-6} = 0{,}726\\ \\mathrm{s}$.",
        resume: "Calcul de τ",
      },
      {
        type: "calcul",
        enonce: "<p>Avec $\\tau = 10\\ \\mathrm{ms}$, combien de temps faut-il à un condensateur déchargé pour atteindre la moitié de sa tension finale, en millisecondes ?</p>",
        valeur: 10 * Math.log(2),
        unite: "ms",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$t = \\tau\\ln 2 = 10 \\times 0{,}693 = 6{,}93\\ \\mathrm{ms}$.",
        resume: "Temps de mi-parcours",
      },
      {
        type: "courte",
        enonce: "<p>Quelle résistance faut-il utiliser pour calculer la constante de temps d'un condensateur placé dans un réseau résistif quelconque ?</p>",
        motsCles: [["thevenin", "vue", "equivalente"]],
        minimum: 1,
        explication: "La résistance de Thévenin vue des bornes du condensateur, sources indépendantes éteintes, dans le circuit qui existe après la manœuvre.",
        resume: "Résistance vue par C",
      },
      {
        type: "qcm",
        enonce: "<p>Quels paramètres modifient la constante de temps d'un circuit RC série ?</p>",
        options: [
          { texte: "La résistance $R$", juste: true },
          { texte: "La capacité $C$", juste: true },
          { texte: "La tension de la source $E$" },
          { texte: "La tension initiale $U_0$" },
        ],
        multiple: true,
        explication: "$\\tau = RC$ ne dépend que des composants. $E$ et $U_0$ fixent les valeurs finale et initiale, pas la vitesse relative du rattrapage.",
        resume: "Paramètres de τ",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Charger un condensateur à travers une résistance plus forte réduit l'énergie dissipée pendant la charge.</p>",
        reponse: false,
        explication: "L'énergie dissipée vaut $\\tfrac{1}{2}C(E - U_0)^2$ quelle que soit $R$ : une résistance plus forte réduit la pointe de courant, pas l'énergie.",
        resume: "Énergie dissipée et résistance",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle énergie la résistance dissipe-t-elle pendant la charge complète d'un condensateur déchargé de $1000\\ \\mu\\mathrm{F}$ sous $24\\ \\mathrm{V}$, en joules ?</p>",
        valeur: 0.288,
        unite: "J",
        tolerance: 0.02,
        chiffres: 3,
        explication: "$W_R = \\tfrac{1}{2}CE^2 = 0{,}5 \\times 10^{-3} \\times 576 = 0{,}288\\ \\mathrm{J}$, autant que l'énergie stockée.",
        resume: "Énergie perdue à la charge",
      },
      {
        type: "schema",
        enonce: "<p>Le circuit est en régime continu établi depuis longtemps. Quelle branche ne porte aucun courant ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 470 270",
        dessin: DESSIN_QUIZ,
        zones: [
          { x: 30, y: 105, largeur: 60, hauteur: 60, etiquette: "source E" },
          { x: 112, y: 18, largeur: 96, hauteur: 44, etiquette: "résistance R1" },
          { x: 236, y: 92, largeur: 48, hauteur: 86, etiquette: "résistance R2" },
          { x: 360, y: 95, largeur: 90, hauteur: 50, etiquette: "condensateur C", juste: true },
        ],
        explication: "En régime établi, la tension du condensateur ne varie plus, donc $i = C\\,\\mathrm{d}u/\\mathrm{d}t = 0$ : c'est un circuit ouvert. Le courant $E/(R_1 + R_2)$ traverse la source, $R_1$ et $R_2$.",
        resume: "Condensateur en régime établi",
      },
      {
        type: "calcul",
        enonce: "<p>Le temps de montée de $10\\ \\%$ à $90\\ \\%$ d'un circuit RC vaut $\\tau\\ln 9$. Que vaut-il pour $\\tau = 1\\ \\mathrm{ms}$, en millisecondes ?</p>",
        valeur: Math.log(9),
        unite: "ms",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$\\ln 9 = 2{,}197$, donc $2{,}20\\ \\mathrm{ms}$ : le temps de montée d'un premier ordre vaut $2{,}2\\,\\tau$.",
        resume: "Temps de montée",
      },
    ],
    { titre: "Dix questions sur le régime transitoire RC" }
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
      { categorie: "Équation", question: "Quelle équation régit la tension d'un condensateur chargé par une source E à travers R ?", reponse: "$RC\\,\\mathrm{d}u_C/\\mathrm{d}t + u_C = E$, obtenue par la loi des mailles et $i = C\\,\\mathrm{d}u_C/\\mathrm{d}t$." },
      { categorie: "Définition", question: "Que représente la constante de temps τ ?", reponse: "$\\tau = R_{th}C$, en secondes : la durée pendant laquelle l'écart à la valeur finale est divisé par $e$, et celle que met la tangente pour atteindre la valeur finale." },
      { categorie: "Formule", question: "Forme universelle d'une grandeur d'un circuit du premier ordre ?", reponse: "$x(t) = x_\\infty + (x(0^+) - x_\\infty)\\,e^{-t/\\tau}$, pour des sources constantes." },
      { categorie: "Formule", question: "Instant où une grandeur atteint la valeur x ?", reponse: "$t = \\tau\\ln\\dfrac{x(0^+) - x_\\infty}{x - x_\\infty}$ ; si le logarithme est indéfini, le seuil n'est jamais atteint." },
      { categorie: "Repère", question: "Fractions du chemin parcourues à τ, 2τ, 3τ et 5τ ?", reponse: "$63{,}2\\ \\%$, $86{,}5\\ \\%$, $95{,}0\\ \\%$ et $99{,}3\\ \\%$ ; la moitié en $0{,}69\\,\\tau$, de $10$ à $90\\ \\%$ en $2{,}2\\,\\tau$." },
      { categorie: "Continuité", question: "Quelle grandeur est continue dans un circuit RC, et laquelle peut sauter ?", reponse: "La tension du condensateur est continue ; son courant et la tension de la résistance peuvent sauter à chaque manœuvre." },
      { categorie: "Méthode", question: "Comment obtenir x(0+) et x∞ ?", reponse: "À $0^+$ : condensateur remplacé par une source $U_0$ (un fil si déchargé). En régime établi : condensateur remplacé par un circuit ouvert." },
      { categorie: "Énergie", question: "Quelle énergie la résistance dissipe-t-elle pendant une charge de U0 à E ?", reponse: "$\\tfrac{1}{2}C(E - U_0)^2$, indépendamment de $R$ ; depuis zéro, autant que l'énergie stockée $\\tfrac{1}{2}CE^2$." },
      { categorie: "Signal carré", question: "Que devient la tension d'un RC soumis à un carré de période courte devant τ ?", reponse: "Un triangle de faible amplitude, $\\Delta U \\approx Eh/(2\\tau)$, centré sur la valeur moyenne $E/2$ : le circuit filtre." },
      {
        categorie: "Industriel",
        question: "Pourquoi temporise-t-on la fermeture du contacteur de court-circuit d'une résistance de précharge ?",
        reponse: "À sa fermeture, l'écart restant est comblé à travers une très faible résistance : pointe $\\Delta U/r$ et énergie $\\tfrac{1}{2}C\\,\\Delta U^2$. On attend $5\\tau$ au moins, ou un seuil de tension du bus.",
        rappel: "Bus de la pompe : 47 Ω et 2,2 mF, τ = 0,103 s, 352 J par précharge, KM2 fermé à 0,6 s avec 1,7 V d'écart.",
      },
    ],
    { titre: "Dix cartes sur le régime transitoire RC" }
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
        enonce: "<p>Quel pourcentage de la tension finale un condensateur initialement déchargé atteint-il après trois constantes de temps ?</p>",
        valeur: 95.0,
        unite: "%",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$1 - e^{-3} = 0{,}950$, soit $95{,}0\\ \\%$.",
        resume: "Repère à 3τ (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Doubler la tension de la source double la constante de temps d'un circuit RC.</p>",
        reponse: false,
        explication: "$\\tau = RC$ ne dépend pas de $E$ ; doubler $E$ double les tensions et les courants, pas la durée du transitoire.",
        resume: "τ indépendante de E (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Un condensateur se décharge avec $\\tau = 0{,}5\\ \\mathrm{s}$. Au bout de combien de temps sa tension est-elle tombée à $1\\ \\%$ de sa valeur initiale, en secondes ?</p>",
        valeur: 0.5 * Math.log(100),
        unite: "s",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$t = \\tau\\ln 100 = 0{,}5 \\times 4{,}605 = 2{,}30\\ \\mathrm{s}$.",
        resume: "Décharge à 1 % (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle énergie stocke une bobine de $0{,}3\\ \\mathrm{H}$ parcourue par $2\\ \\mathrm{A}$, en joules ?</p>",
        valeur: 0.6,
        unite: "J",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$W = \\tfrac{1}{2}LI^2 = 0{,}5 \\times 0{,}3 \\times 4 = 0{,}6\\ \\mathrm{J}$. Révisé du cours Inductances et champ magnétique.",
        resume: "Énergie magnétique (cours précédent)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>À la fermeture d'un circuit, une bobine qui ne portait aucun courant se comporte comme un circuit ouvert, alors qu'un condensateur déchargé se comporte comme un court-circuit.</p>",
        reponse: true,
        explication: "Le courant de la bobine et la tension du condensateur sont continus : la bobine garde $i = 0$, le condensateur garde $u = 0$. Révisé du cours Inductances et champ magnétique.",
        resume: "Dualité à la fermeture (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la résistance à $20\\ ^{\\circ}\\mathrm{C}$ de $50\\ \\mathrm{m}$ de câble en cuivre de $1{,}5\\ \\mathrm{mm^2}$, de résistivité $1{,}72 \\times 10^{-8}\\ \\Omega \\cdot \\mathrm{m}$, pour un seul conducteur, en ohms ?</p>",
        valeur: (1.72e-8 * 50) / 1.5e-6,
        unite: "Ω",
        tolerance: 0.02,
        chiffres: 3,
        explication: "$R = \\rho\\ell/S = 1{,}72 \\times 10^{-8} \\times 50/1{,}5 \\times 10^{-6} = 0{,}573\\ \\Omega$. Une telle résistance, en série avec un condensateur de précharge, ferait partie de $R_{th}$. Révisé du cours Loi d'Ohm et résistivité, vieux d'une semaine.",
        resume: "Résistance d'un câble (cours vieux d'une semaine)",
      },
      {
        type: "calcul",
        enonce: "<p>Un condensateur est relié, par un nœud commun, à une source idéale à travers $10\\ \\mathrm{k\\Omega}$ et à la masse à travers $40\\ \\mathrm{k\\Omega}$. Quelle résistance voit-il, en kilohms ?</p>",
        valeur: 8,
        unite: "kΩ",
        tolerance: 0.02,
        chiffres: 1,
        explication: "Source éteinte : $10 \\parallel 40 = \\dfrac{10 \\times 40}{50} = 8\\ \\mathrm{k\\Omega}$. Révisé du cours Théorèmes de Thévenin, Norton et superposition.",
        resume: "Résistance de Thévenin (Thévenin, Norton et superposition)",
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
    titre: "Où en suis-je sur le régime transitoire RC ?",
  });
  if (auto) ressources.push(auto);
}
