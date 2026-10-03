/* ==========================================================================
   cours/revision-2-et-mini-projet-capteur/cours.js
   Révision 2 et mini-projet capteur.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const MONO = 'font-family="ui-monospace, monospace"';

/* Capteur et interface du mini-projet : Ω, V, K, F. */
const CTN = { r25: 10e3, b: 3950, t25: 298.15, delta: 1.5e-3 };
const INTERFACE = { e: 2.5, rf: 10e3, rs: 10e3, rin: 100e3, c: 22e-6 };
const PAS_CAN = 10 / 4096;
const OMEGA_50 = 2 * Math.PI * 50;

/* Pont de platine de la section D. */
const PONT = { e: 0.2, r0: 100, alpha: 0.00385 };

/* --------------------------------------------------------------------------
   Modèles
   -------------------------------------------------------------------------- */

function resistanceCtn(theta) {
  return CTN.r25 * Math.exp(CTN.b * (1 / (theta + 273.15) - 1 / CTN.t25));
}

function temperatureCtn(r) {
  return 1 / (1 / CTN.t25 + Math.log(r / CTN.r25) / CTN.b) - 273.15;
}

function parallele(a, b) {
  return (a * b) / (a + b);
}

/** Interface chargée : potentiels, sensibilité, filtre et auto-échauffement. */
function interfaceChargee(theta, p = {}) {
  const e = p.e != null ? p.e : INTERFACE.e;
  const rf = p.rf != null ? p.rf : INTERFACE.rf;
  const rs = p.rs != null ? p.rs : INTERFACE.rs;
  const rin = p.rin != null ? p.rin : INTERFACE.rin;
  const c = p.c != null ? p.c : INTERFACE.c;
  const rt = resistanceCtn(theta);
  const rp = parallele(rf, rs + rin);
  const k = rin / (rs + rin);
  const va = (e * rp) / (rt + rp);
  const vb = k * va;
  const t = theta + 273.15;
  const sensibilite = (k * e * CTN.b * rp * rt) / (t * t * (rt + rp) * (rt + rp));
  const courant = e / (rt + rp);
  const puissance = courant * courant * rt;
  const rth = parallele(rt, rf);
  const req = parallele(rth + rs, rin);
  const kPrime = rin / (rth + rs + rin);
  const tau = req * c;
  const attenuation = 1 / Math.sqrt(1 + Math.pow(OMEGA_50 * tau, 2));
  return { rt, rp, k, va, vb, sensibilite, courant, puissance, rth, req, kPrime, tau, attenuation, e, rf, rs, rin, c };
}

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

function marqueur(id) {
  return (
    '<marker id="' + id + '" markerWidth="9" markerHeight="9" refX="6" refY="4" orient="auto">' +
    '<path d="M0 0 8 4 0 8Z" fill="currentColor"/></marker>'
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
    c.font = POLICE;
    const gauche = aGauche != null ? aGauche : px > repere.boite.x + repere.boite.l * 0.6;
    c.textAlign = gauche ? "right" : "left";
    c.fillText(texte, px + (gauche ? -8 : 8), py - 8);
  }
  c.restore();
}

/** Ligne horizontale en tirets sur un tracé, avec son libellé. */
function ligneHorizontale(c, repere, couleurs, y, texte, enDessous) {
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
    c.font = POLICE;
    c.textAlign = "right";
    c.fillText(texte, repere.boite.x + repere.boite.l - 4, py + (enDessous ? 14 : -6));
  }
  c.restore();
}

/** Ligne verticale en pointillé sur un tracé, avec son libellé. */
function ligneVerticale(c, repere, couleurs, x, texte) {
  const px = repere.versX(x);
  if (px < repere.boite.x || px > repere.boite.x + repere.boite.l) return;
  c.save();
  c.setLineDash([2, 4]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(px, repere.boite.y);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  c.setLineDash([]);
  if (texte) {
    c.fillStyle = couleurs.texte;
    c.font = POLICE;
    const gauche = px > repere.boite.x + repere.boite.l * 0.7;
    c.textAlign = gauche ? "right" : "left";
    c.fillText(texte, px + (gauche ? -6 : 6), repere.boite.y + 14);
  }
  c.restore();
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
  construirePont(racine, api);
  construireDemiPont(racine, api);
  construireThermique(racine, api);
  construireQuantification(racine, api);
  construireInterface(racine, api);
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
  const lents = ["#f-schema-principal svg", "#h-interface-figure svg", "#e-troisfils-figure svg"];
  const rapides = ["#e-rt-figure svg", "#e-demipont-figure svg", "#e-thermique-figure svg"];
  for (const selecteur of lents) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree: 2.2 }));
  }
  for (const selecteur of rapides) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree: 1.5 }));
  }
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-diviseur-charge",
      titre: "Diviseur chargé",
      niveau: "diagnostic",
      enonce:
        "<p>Un diviseur formé de deux résistances de $10\\ \\mathrm{k\\Omega}$ est alimenté sous $10\\ \\mathrm{V}$. On branche sur sa sortie une entrée de mesure de $100\\ \\mathrm{k\\Omega}$. Quelle tension cette entrée reçoit-elle, en volts ?</p>",
      valeur: 10 * (1 / (1 / 10 + 1 / 100)) / (10 + 1 / (1 / 10 + 1 / 100)),
      unite: "V",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Tension de sortie chargée",
      etapes: [
        { texte: "La charge est en parallèle sur la résistance du bas : $10 \\parallel 100 = 1\\,000/110 = 9{,}091\\ \\mathrm{k\\Omega}$." },
        { texte: "Diviseur : $V = 10 \\times 9{,}091/(10 + 9{,}091) = 10 \\times 0{,}4762 = 4{,}762\\ \\mathrm{V}$." },
        {
          texte: "À vide, on aurait $5\\ \\mathrm{V}$ : la charge retire $4{,}8\\ \\%$.",
          note: "Révisé du cours Associations de résistances et diviseurs ; c'est l'effet que l'entrée de l'automate exerce sur le pont du mini-projet.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 520 230",
          '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<circle cx="60" cy="115" r="20"/><path d="M60 95V30H200V50M200 100V130M200 180V200H60V135M200 115H340V130M340 180V200H200"/>' +
            '<rect x="188" y="50" width="24" height="50" rx="3"/><rect x="188" y="130" width="24" height="50" rx="3"/><rect x="328" y="130" width="24" height="50" rx="3"/></g>' +
            '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12"><circle cx="200" cy="115" r="4.5"/>' +
            '<text x="60" y="111" text-anchor="middle" font-weight="600">+</text><text x="34" y="120" text-anchor="end">10 V</text>' +
            '<text x="222" y="80">10 kΩ</text><text x="222" y="160">10 kΩ</text><text x="362" y="160">100 kΩ, entrée</text>' +
            '<text x="210" y="108">4,762 V au lieu de 5 V</text><text x="260" y="222" text-anchor="middle">bas : 10 // 100 = 9,091 kΩ</text></g>',
          "Diviseur chargé annoté : 4,762 volts au point milieu"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-thevenin",
      titre: "Résistance de Thévenin d'un demi-pont",
      niveau: "diagnostic",
      enonce:
        "<p>Un demi-pont est alimenté par une source idéale de $2{,}5\\ \\mathrm{V}$ : $15\\ \\mathrm{k\\Omega}$ en haut, $10\\ \\mathrm{k\\Omega}$ en bas. Quelle est sa résistance de Thévenin vue du point milieu, en kiloohms ?</p>",
      valeur: 6,
      unite: "kΩ",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Résistance de Thévenin",
      etapes: [
        { texte: "Source de tension éteinte, c'est-à-dire remplacée par un fil : les deux résistances relient chacune le point milieu à la référence." },
        { texte: "Elles sont donc en parallèle : $15 \\times 10/(15 + 10) = 150/25 = 6\\ \\mathrm{k\\Omega}$." },
        {
          texte: "La tension de Thévenin vaut $2{,}5 \\times 10/25 = 1\\ \\mathrm{V}$.",
          note: "Révisé du cours Théorèmes de Thévenin, Norton et superposition ; c'est la résistance que verra le condensateur du filtre.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 520 200",
          "<defs>" + marqueur("fl-c-th") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<path d="M60 40H120V60M120 100V130M60 40V180H120V170M120 115H200"/>' +
            '<rect x="108" y="60" width="24" height="40" rx="3"/><rect x="108" y="130" width="24" height="40" rx="3"/>' +
            '<path d="M220 100H260" marker-end="url(#fl-c-th)"/>' +
            '<circle cx="320" cy="110" r="18"/><path d="M320 92V60H360M420 60H460M320 128V160H460"/><rect x="360" y="48" width="60" height="24" rx="3"/></g>' +
            '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12">' +
            '<text x="40" y="110" text-anchor="end">fil</text><text x="142" y="86">15 kΩ</text><text x="142" y="156">10 kΩ</text>' +
            '<text x="320" y="106" text-anchor="middle" font-weight="600">+</text><text x="296" y="140" text-anchor="end">1 V</text>' +
            '<text x="390" y="40" text-anchor="middle">6 kΩ</text><text x="466" y="64">sortie</text><text x="260" y="192" text-anchor="middle">source éteinte : 15 // 10 = 6 kΩ</text></g>',
          "Demi-pont source éteinte et son équivalent de Thévenin : 1 volt et 6 kiloohms"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-etablissement",
      titre: "Délai d'établissement d'un premier ordre",
      niveau: "diagnostic",
      enonce:
        "<p>Un circuit RC de constante de temps $\\tau = 0{,}2\\ \\mathrm{s}$ reçoit un échelon. Au bout de combien de temps l'écart à la valeur finale devient-il inférieur à $1\\ \\%$ de l'échelon, en secondes ?</p>",
      valeur: 0.2 * Math.log(100),
      unite: "s",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "Délai",
      etapes: [
        { texte: "L'écart relatif vaut $e^{-t/\\tau}$ ; on cherche $e^{-t/\\tau} = 0{,}01$." },
        { texte: "D'où $t = \\tau\\ln 100 = 4{,}605\\,\\tau$." },
        {
          texte: "$t = 0{,}2 \\times 4{,}605 = 0{,}921\\ \\mathrm{s}$.",
          note: "Révisé du cours Régime transitoire RC. Pour un demi-pas d'un convertisseur 12 bits, on remplace $100$ par $\\Delta V/(q/2)$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const tracage = moteur.sim.traceur(conteneur, {
          titre: "Écart relatif à la valeur finale",
          genre: "Correction visuelle",
          xTitre: "temps",
          xUnite: "s",
          yTitre: "écart",
          yUnite: "%",
          xMin: 0,
          xMax: 1.2,
          yMin: 0,
          yMax: 100,
          ratio: 0.42,
          series: [{ id: "ecart", nom: "écart relatif, en pour cent", fonction: (t) => 100 * Math.exp(-t / 0.2) }],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 1, "1 %", false);
            marquerPoint(c, repere, couleurs, 0.2 * Math.log(100), 1, "0,921 s", true);
          },
        });
        ressources.push(tracage);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : pont de platine qui se déséquilibre
   -------------------------------------------------------------------------- */

function etatPont(theta) {
  const x = PONT.alpha * theta;
  const rpt = PONT.r0 * (1 + x);
  const vb = PONT.e / 2;
  const vc = (PONT.e * rpt) / (PONT.r0 + rpt);
  const um = vc - vb;
  const approx = (PONT.e * x) / 4;
  return { x, rpt, vb, vc, um, approx, ecart: um > 1e-12 ? (approx / um - 1) * 100 : 0 };
}

function construirePont(racine, api) {
  const conteneur = racine.querySelector("#d-pont");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "-30 0 670 420",
    role: "img",
    "aria-label": "Pont de Wheatstone à sonde Pt100 alimenté sous 0,2 volt, avec thermomètre réglable et jauges des potentiels des points milieux",
  });
  const fixe = svgEl("g");
  fixe.innerHTML =
    "<defs>" + marqueur("fl-d-pont") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="60" cy="160" r="20"/>' +
    '<path d="M60 140V40H380V70M200 40V70M200 130V190M200 250V290M380 130V190M380 250V290M60 180V290H380"/>' +
    '<rect x="188" y="70" width="24" height="60" rx="3"/><rect x="188" y="190" width="24" height="60" rx="3"/>' +
    '<rect x="368" y="70" width="24" height="60" rx="3"/><rect x="368" y="190" width="24" height="60" rx="3"/>' +
    '<path d="M356 248L404 192"/>' +
    '<rect x="510" y="50" width="20" height="230" rx="10"/><circle cx="520" cy="300" r="18"/>' +
    '<path d="M290 290V302M276 302H304M281 308H299M286 314H294"/></g>' +
    '<g stroke="currentColor" stroke-width="1.2" fill="none" opacity="0.7">' +
    '<path d="M534 270h10M534 165h10M534 60h10"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="200" cy="160" r="5"/><circle cx="380" cy="160" r="5"/></g>' +
    '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12">' +
    '<text x="60" y="156" text-anchor="middle" font-weight="600">+</text>' +
    '<text x="34" y="156" text-anchor="end">E</text><text x="34" y="172" text-anchor="end">0,2 V</text>' +
    '<text x="222" y="104">R1</text><text x="222" y="120">100 Ω</text>' +
    '<text x="222" y="224">R2</text><text x="222" y="240">100 Ω</text>' +
    '<text x="358" y="104" text-anchor="end">R3</text><text x="358" y="120" text-anchor="end">100 Ω</text>' +
    '<text x="408" y="214">Pt100</text>' +
    '<text x="186" y="164" text-anchor="end" font-weight="600">B</text><text x="394" y="164" font-weight="600">C</text>' +
    '<text x="550" y="274">0 °C</text><text x="550" y="169">50 °C</text><text x="550" y="64">100 °C</text>' +
    '<text x="290" y="334" text-anchor="middle">0 V, référence</text>' +
    '<text x="10" y="364">VB, pointillé</text><text x="10" y="394">VC, trait plein</text>' +
    '<text x="140" y="410">95 mV</text><text x="470" y="410" text-anchor="end">110 mV</text></g>' +
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.6"><path d="M150 352V400M460 352V400"/></g>';

  const colonne = svgEl("rect", { x: 514, y: 270, width: 12, height: 20, rx: 6, fill: "currentColor", opacity: 0.55 });
  const fleche = svgEl("path", { d: "M212 160H366", stroke: "currentColor", "stroke-width": 2, fill: "none", "marker-end": "url(#fl-d-pont)" });
  const barreB = svgEl("rect", { x: 150, y: 352, width: 10, height: 14, fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-dasharray": "4 3" });
  const barreC = svgEl("rect", { x: 150, y: 382, width: 10, height: 14, fill: "currentColor", "fill-opacity": 0.35, stroke: "currentColor", "stroke-width": 1.6 });
  const textes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  svg.append(fixe, colonne, fleche, barreB, barreC, textes);
  conteneur.appendChild(svg);
  ressources.push(api.dessiner(fixe, { duree: 1.6 }));

  const valeurs = api.sim.valeurs("#d-pont-valeurs", [
    { id: "theta", libelle: "Température de la sonde", unite: "°C", decimales: 1 },
    { id: "rpt", libelle: "Résistance de la Pt100", unite: "Ω", decimales: 2 },
    { id: "vb", libelle: "VB", unite: "mV", decimales: 2 },
    { id: "vc", libelle: "VC", unite: "mV", decimales: 2 },
    { id: "um", libelle: "Um = VC - VB", unite: "mV", decimales: 3 },
    { id: "approx", libelle: "Approximation E x / 4", unite: "mV", decimales: 3 },
    { id: "ecart", libelle: "Excès de l'approximation", unite: "%", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const echelle = (v) => 150 + ((v - 0.095) / 0.015) * 310;
  let synchronisation = false;
  let poignee = null;
  let lecteur = null;

  function tracer(theta) {
    const s = etatPont(theta);
    const yColonne = 270 - (theta / 100) * 210;
    colonne.setAttribute("y", String(yColonne));
    colonne.setAttribute("height", String(Math.max(4, 292 - yColonne)));
    barreB.setAttribute("width", String(Math.max(2, echelle(s.vb) - 150)));
    barreC.setAttribute("width", String(Math.max(2, echelle(s.vc) - 150)));
    const n = (v, d) => nombre(api, v, d);
    textes.innerHTML =
      '<text x="290" y="150" text-anchor="middle" font-weight="600">Um = ' + n(s.um * 1000, 2) + " mV</text>" +
      '<text x="408" y="232">' + n(s.rpt, 2) + " Ω</text>" +
      '<text x="520" y="34" text-anchor="middle">θ = ' + n(theta, 1) + " °C</text>" +
      '<text x="166" y="180" text-anchor="end">' + n(s.vb * 1000, 1) + " mV</text>" +
      '<text x="394" y="180">' + n(s.vc * 1000, 2) + " mV</text>";
    if (valeurs) {
      valeurs.maj({
        theta,
        rpt: s.rpt,
        vb: s.vb * 1000,
        vc: s.vc * 1000,
        um: s.um * 1000,
        approx: s.approx * 1000,
        ecart: s.ecart,
      });
    }
  }

  function appliquer(theta, source) {
    if (synchronisation) return;
    synchronisation = true;
    const t = borner(Number(theta), 0, 100);
    tracer(t);
    if (source !== "poignee" && poignee) poignee.set(t, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(t);
    synchronisation = false;
  }

  poignee = api.sim.poignee(svg, {
    type: "segment",
    de: { x: 520, y: 270 },
    a: { x: 520, y: 60 },
    min: 0,
    max: 100,
    pas: 1,
    valeur: 0,
    unite: "°C",
    libelle: "Température de la sonde Pt100",
    diffuserAuDepart: false,
    rappel: (mesure) => appliquer(mesure.valeur, "poignee"),
  });
  if (poignee) ressources.push(poignee);

  lecteur = api.sim.lecteur("#d-pont-lecteur", {
    de: 0,
    a: 100,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Échauffement de la sonde de 0 à 100 °C",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  appliquer(0, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : choix de la résistance fixe et de l'alimentation
   -------------------------------------------------------------------------- */

function construireDemiPont(racine, api) {
  const conteneur = racine.querySelector("#e-demipont-sim");
  if (!conteneur) return;

  const boite = { x: 70, y: 30, l: 520, h: 230 };
  const versX = (theta) => boite.x + ((theta + 10) / 70) * boite.l;
  const versY = (v, e) => boite.y + boite.h - (v / e) * boite.h;

  const svg = svgEl("svg", {
    viewBox: "0 0 640 340",
    role: "img",
    "aria-label": "Tension de sortie du demi-pont à CTN en fonction de la température, avec point de fonctionnement réglable et tangente",
  });
  const axes = svgEl("g");
  let graduations = "";
  for (let t = -10; t <= 60; t += 10) {
    graduations += '<path d="M' + versX(t) + " " + (boite.y + boite.h) + "v6" + '"/>';
  }
  let grille = "";
  for (let i = 1; i <= 4; i += 1) {
    const y = boite.y + boite.h - (i / 4) * boite.h;
    grille += '<path d="M' + boite.x + " " + y + "H" + (boite.x + boite.l) + '"/>';
  }
  let etiquettesT = "";
  for (let t = -10; t <= 60; t += 10) {
    etiquettesT += '<text x="' + versX(t) + '" y="' + (boite.y + boite.h + 20) + '" text-anchor="middle">' + t + "</text>";
  }
  let reglette = "";
  for (let t = -10; t <= 60; t += 5) {
    reglette += '<path d="M' + versX(t) + " 312v" + (t % 10 === 0 ? -8 : -4) + '"/>';
  }
  axes.innerHTML =
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.6">' +
    '<path d="M' + boite.x + " " + (boite.y + boite.h) + "H" + (boite.x + boite.l) + "M" + boite.x + " " + (boite.y + boite.h) + "V" + boite.y + '"/>' +
    graduations + "</g>" +
    '<g stroke="currentColor" stroke-width="1" fill="none" opacity="0.25" stroke-dasharray="2 5">' + grille + "</g>" +
    '<g stroke="currentColor" stroke-width="1.6" fill="none" opacity="0.6"><path d="M' + boite.x + " 312H" + (boite.x + boite.l) + '"/>' + reglette + "</g>" +
    '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="11.5">' + etiquettesT +
    '<text x="600" y="316">θ, °C</text><text x="14" y="22">V (V)</text></g>';

  const courbeRef = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-dasharray": "6 5", opacity: 0.7 });
  const courbe = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.6, "stroke-linecap": "round" });
  const tangente = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 6, "stroke-linecap": "round", opacity: 0.45 });
  const repere = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.2, "stroke-dasharray": "3 4", opacity: 0.8 });
  const point = svgEl("circle", { r: 5, fill: "currentColor" });
  const textes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  svg.append(axes, courbeRef, courbe, repere, tangente, point, textes);
  conteneur.appendChild(svg);
  ressources.push(api.dessiner(axes, { duree: 1.2 }));

  const valeurs = api.sim.valeurs("#e-demipont-valeurs", [
    { id: "theta", libelle: "Température", unite: "°C", decimales: 1 },
    { id: "rt", libelle: "Résistance de la CTN", unite: "kΩ", decimales: 3 },
    { id: "v", libelle: "Tension de sortie à vide", unite: "V", decimales: 4 },
    { id: "s", libelle: "Sensibilité S", unite: "mV/K", decimales: 2 },
    { id: "res", libelle: "Résolution avec un pas de 2,44 mV", unite: "K", decimales: 3 },
    { id: "p", libelle: "Puissance dans la CTN", unite: "mW", decimales: 4 },
    { id: "dt", libelle: "Auto-échauffement (δ = 1,5 mW/K)", unite: "K", decimales: 3 },
    { id: "ropt", libelle: "Rf optimale à cette température", unite: "kΩ", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const etat = { rf: 10e3, e: 2.5, theta: 25 };

  function sortie(theta, rf, e) {
    const rt = resistanceCtn(theta);
    return (e * rf) / (rf + rt);
  }

  function chemin(rf, e) {
    let d = "";
    for (let t = -10; t <= 60.001; t += 1) {
      d += (d ? "L" : "M") + versX(t).toFixed(1) + " " + versY(sortie(t, rf, e), e).toFixed(1);
    }
    return d;
  }

  function dessiner() {
    const { rf, e, theta } = etat;
    courbe.setAttribute("d", chemin(rf, e));
    courbeRef.setAttribute("d", chemin(10e3, e));
    const rt = resistanceCtn(theta);
    const v = sortie(theta, rf, e);
    const t = theta + 273.15;
    const s = (e * CTN.b * rf * rt) / (t * t * (rf + rt) * (rf + rt));
    const px = versX(theta);
    const py = versY(v, e);
    point.setAttribute("cx", String(px));
    point.setAttribute("cy", String(py));
    const dTheta = 12;
    tangente.setAttribute(
      "d",
      "M" + versX(theta - dTheta) + " " + versY(v - s * dTheta, e) + "L" + versX(theta + dTheta) + " " + versY(v + s * dTheta, e)
    );
    repere.setAttribute("d", "M" + px + " " + py + "V312");
    const courant = e / (rf + rt);
    const p = courant * courant * rt;
    const n = (x, d) => nombre(api, x, d);
    textes.innerHTML =
      '<text x="' + (boite.x - 6) + '" y="' + (boite.y + 4) + '" text-anchor="end">' + n(e, 1) + "</text>" +
      '<text x="' + (boite.x - 6) + '" y="' + (boite.y + boite.h / 2 + 4) + '" text-anchor="end">' + n(e / 2, 2) + "</text>" +
      '<text x="' + (boite.x - 6) + '" y="' + (boite.y + boite.h + 4) + '" text-anchor="end">0</text>' +
      '<text x="' + borner(px + 10, 80, 470) + '" y="' + borner(py - 12, 46, 250) + '">S = ' + n(s * 1000, 1) + " mV/K</text>";
    if (valeurs) {
      valeurs.maj({
        theta,
        rt: rt / 1000,
        v,
        s: s * 1000,
        res: PAS_CAN / s,
        p: p * 1000,
        dt: p / CTN.delta,
        ropt: rt / 1000,
      });
    }
  }

  const poignee = api.sim.poignee(svg, {
    type: "segment",
    de: { x: versX(-10), y: 312 },
    a: { x: versX(60), y: 312 },
    min: -10,
    max: 60,
    pas: 0.5,
    valeur: etat.theta,
    unite: "°C",
    libelle: "Température de la CTN",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.theta = mesure.valeur;
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-demipont-curseurs",
    [
      { id: "rf", libelle: "Résistance fixe Rf", min: 1, max: 60, pas: 0.5, valeur: 10, unite: "kΩ", chiffres: 1 },
      { id: "e", libelle: "Tension d'alimentation E", min: 0.5, max: 10, pas: 0.1, valeur: 2.5, unite: "V", chiffres: 1 },
    ],
    (lues) => {
      etat.rf = lues.rf * 1000;
      etat.e = lues.e;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   E. Animation : réponse thermique de la sonde
   -------------------------------------------------------------------------- */

const THERMIQUE = { tau: 10, initiale: 25, air: 5 };

function construireThermique(racine, api) {
  if (!racine.querySelector("#e-thermique-anim")) return;
  let instant = 0;
  const temperature = (t) => THERMIQUE.air + (THERMIQUE.initiale - THERMIQUE.air) * Math.exp(-t / THERMIQUE.tau);

  const traceur = api.sim.traceur("#e-thermique-anim", {
    titre: "Température de la sonde après le changement d'air",
    genre: "Animation",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "température",
    yUnite: "°C",
    xMin: 0,
    xMax: 60,
    yMin: 0,
    yMax: 27,
    ratio: 0.45,
    series: [{ id: "sonde", nom: "température de la sonde", fonction: () => NaN }],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, THERMIQUE.air, "air : 5 °C", true);
      marquerPoint(c, repere, couleurs, instant, temperature(instant), nombre(api, temperature(instant), 1) + " °C");
    },
  });
  if (traceur) ressources.push(traceur);

  const valeurs = api.sim.valeurs("#e-thermique-valeurs", [
    { id: "t", libelle: "Temps écoulé", unite: "s", decimales: 1 },
    { id: "rapport", libelle: "t / τth", decimales: 2 },
    { id: "temp", libelle: "Température de la sonde", unite: "°C", decimales: 2 },
    { id: "ecart", libelle: "Écart à l'air", unite: "K", decimales: 2 },
    { id: "parcouru", libelle: "Part de l'écart parcourue", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj(t) {
    instant = borner(t, 0, 60);
    if (traceur) traceur.definirFonction("sonde", (x) => (x <= instant + 1e-9 ? temperature(x) : NaN));
    const temp = temperature(instant);
    if (valeurs) {
      valeurs.maj({
        t: instant,
        rapport: instant / THERMIQUE.tau,
        temp,
        ecart: temp - THERMIQUE.air,
        parcouru: (1 - Math.exp(-instant / THERMIQUE.tau)) * 100,
      });
    }
  }

  const lecteur = api.sim.lecteur("#e-thermique-lecteur", {
    de: 0,
    a: 60,
    duree: 12,
    boucle: false,
    auto: false,
    libelle: "Écoulement du temps après le changement d'air",
    rappel: (valeur) => maj(valeur),
  });
  if (lecteur) ressources.push(lecteur);
  maj(0);
}

/* --------------------------------------------------------------------------
   E. Animation : quantification du convertisseur
   -------------------------------------------------------------------------- */

function construireQuantification(racine, api) {
  if (!racine.querySelector("#e-quantif")) return;
  const q = PAS_CAN * 1000;
  const vMax = 10 * q;
  let entree = 0;
  const code = (v) => Math.round(v / q);
  const erreur = (v) => code(v) * q - v;

  const traceur = api.sim.traceur("#e-quantif", {
    titre: "Entrée, sortie quantifiée et erreur",
    genre: "Animation",
    xTitre: "tension d'entrée",
    xUnite: "mV",
    yTitre: "tension",
    yUnite: "mV",
    xMin: 0,
    xMax: vMax,
    yMin: -9,
    yMax: 27,
    ratio: 0.5,
    echantillons: 1200,
    series: [
      { id: "sortie", nom: "sortie quantifiée N q", fonction: () => NaN, epaisseur: 2.6 },
      { id: "entree", nom: "entrée idéale", fonction: () => NaN },
      { id: "erreur", nom: "erreur x 3, centrée sur -5 mV", fonction: () => NaN },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, -5, "erreur nulle", true);
      marquerPoint(c, repere, couleurs, entree, code(entree) * q, "N = " + code(entree));
    },
  });
  if (traceur) ressources.push(traceur);

  const valeurs = api.sim.valeurs("#e-quantif-valeurs", [
    { id: "v", libelle: "Tension d'entrée", unite: "mV", decimales: 3 },
    { id: "n", libelle: "Code N", decimales: 0 },
    { id: "vq", libelle: "Sortie N q", unite: "mV", decimales: 3 },
    { id: "e", libelle: "Erreur N q - V", unite: "mV", decimales: 3 },
    { id: "eq", libelle: "Erreur rapportée au pas q", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj(v) {
    entree = borner(v, 0, vMax);
    if (traceur) {
      const jusque = (f) => (x) => (x <= entree + 1e-9 ? f(x) : NaN);
      traceur.definirFonction("sortie", jusque((x) => code(x) * q));
      traceur.definirFonction("entree", jusque((x) => x));
      traceur.definirFonction("erreur", jusque((x) => -5 + 3 * erreur(x)));
    }
    if (valeurs) {
      valeurs.maj({ v: entree, n: code(entree), vq: code(entree) * q, e: erreur(entree), eq: erreur(entree) / q });
    }
  }

  const lecteur = api.sim.lecteur("#e-quantif-lecteur", {
    de: 0,
    a: vMax,
    duree: 14,
    boucle: false,
    auto: false,
    libelle: "Balayage lent de la tension d'entrée",
    rappel: (valeur) => maj(valeur),
  });
  if (lecteur) ressources.push(lecteur);
  maj(0);
}

/* --------------------------------------------------------------------------
   I. Simulation : interface complète à la mise sous tension
   -------------------------------------------------------------------------- */

function reponseInterface(s, amplitude) {
  const vfin = s.vb;
  const wt = OMEGA_50 * s.tau;
  const facteur = (s.kPrime * amplitude) / (1 + wt * wt);
  return (t) =>
    vfin * (1 - Math.exp(-t / s.tau)) +
    facteur * (Math.sin(OMEGA_50 * t) - wt * Math.cos(OMEGA_50 * t) + wt * Math.exp(-t / s.tau));
}

function construireInterface(racine, api) {
  if (!racine.querySelector("#i-interface-sim")) return;

  let etablissement = NaN;
  let residuCrete = 0;
  const qDemi = PAS_CAN / 2;

  const traceur = api.sim.traceur("#i-interface-sim", {
    titre: "Tension d'entrée de l'automate après la mise sous tension",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "VB",
    yUnite: "V",
    xMin: 0,
    xMax: 4,
    yMin: 0,
    yMax: 1.5,
    ratio: 0.45,
    echantillons: 3200,
    series: [
      { id: "vb", nom: "VB(t), perturbation comprise" },
      { id: "fin", nom: "valeur finale sans perturbation" },
    ],
    surDessin({ c, repere, couleurs }) {
      if (Number.isFinite(etablissement)) ligneVerticale(c, repere, couleurs, etablissement, "établi à q/2 : " + nombre(api, etablissement, 2) + " s");
    },
  });
  if (traceur) ressources.push(traceur);

  const zoom = api.sim.traceur("#i-interface-sim", {
    titre: "Écart à la valeur finale, vu de près",
    xTitre: "temps",
    xUnite: "s",
    yTitre: "écart",
    yUnite: "mV",
    xMin: 0,
    xMax: 4,
    yMin: -4,
    yMax: 4,
    ratio: 0.38,
    echantillons: 3200,
    series: [{ id: "ecart", nom: "VB(t) moins valeur finale" }],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, qDemi * 1000, "+ q/2", false);
      ligneHorizontale(c, repere, couleurs, -qDemi * 1000, "- q/2", true);
      if (Number.isFinite(etablissement)) ligneVerticale(c, repere, couleurs, etablissement, "");
    },
  });
  if (zoom) ressources.push(zoom);

  const valeurs = api.sim.valeurs("#i-interface-valeurs", [
    { id: "rt", libelle: "Résistance de la CTN", unite: "kΩ", decimales: 3 },
    { id: "vb", libelle: "VB finale", unite: "V", decimales: 4 },
    { id: "code", libelle: "Code du convertisseur", decimales: 0 },
    { id: "req", libelle: "Résistance vue par C", unite: "kΩ", decimales: 2 },
    { id: "tau", libelle: "Constante de temps τ", unite: "s", decimales: 3 },
    { id: "att", libelle: "Atténuation à 50 Hz", unite: "dB", decimales: 1 },
    { id: "residu", libelle: "Résidu crête à 50 Hz", unite: "mV", decimales: 3 },
    { id: "etab", libelle: "Délai d'établissement à q/2", format: (v) => (Number.isFinite(v) ? api.util.formaterDecimal(v, 2) + " s" : "jamais : résidu au-delà de q/2") },
    { id: "naif", libelle: "Lecture d'un programme ignorant la charge", unite: "°C", decimales: 2 },
    { id: "auto", libelle: "Auto-échauffement", unite: "K", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const etat = { theta: 25, c: 22, rs: 10, a: 100 };

  function dessiner() {
    const s = interfaceChargee(etat.theta, { c: etat.c * 1e-6, rs: etat.rs * 1e3 });
    const amplitude = etat.a / 1000;
    residuCrete = s.kPrime * amplitude * s.attenuation;
    etablissement = residuCrete < qDemi ? s.tau * Math.log(s.vb / qDemi) : NaN;
    const f = reponseInterface(s, amplitude);
    if (traceur) {
      traceur.definirPlage({ yMin: 0, yMax: Math.max(0.3, s.vb * 1.35 + amplitude * 0.2) });
      traceur.definirFonction("vb", f);
      traceur.definirFonction("fin", () => s.vb);
    }
    if (zoom) zoom.definirFonction("ecart", (t) => (f(t) - s.vb) * 1000);
    const vNaive = s.vb;
    const rNaive = INTERFACE.rf * (INTERFACE.e / vNaive - 1);
    if (valeurs) {
      valeurs.maj({
        rt: s.rt / 1000,
        vb: s.vb,
        code: Math.round(s.vb / PAS_CAN),
        req: s.req / 1000,
        tau: s.tau,
        att: 20 * Math.log10(s.attenuation),
        residu: residuCrete * 1000,
        etab: etablissement,
        naif: rNaive > 0 ? temperatureCtn(rNaive) : NaN,
        auto: s.puissance / CTN.delta,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-interface-curseurs",
    [
      { id: "theta", libelle: "Température de l'armoire", min: -10, max: 60, pas: 1, valeur: etat.theta, unite: "°C", chiffres: 0 },
      { id: "c", libelle: "Condensateur C", min: 1, max: 47, pas: 1, valeur: etat.c, unite: "µF", chiffres: 0 },
      { id: "rs", libelle: "Résistance série Rs", min: 0, max: 47, pas: 1, valeur: etat.rs, unite: "kΩ", chiffres: 0 },
      { id: "a", libelle: "Perturbation à 50 Hz, crête", min: 0, max: 300, pas: 10, valeur: etat.a, unite: "mV", chiffres: 0 },
    ],
    (lues) => {
      etat.theta = lues.theta;
      etat.c = lues.c;
      etat.rs = lues.rs;
      etat.a = lues.a;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  dessiner();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : résistance d'une CTN. */
  const r0 = resistanceCtn(0);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-ctn-zero",
      titre: "Résistance d'une thermistance au point de gel",
      niveau: "fondamental",
      enonce:
        "<p>Calculez la résistance de la CTN du mini-projet ($R_{25} = 10\\ \\mathrm{k\\Omega}$, $B = 3\\,950\\ \\mathrm{K}$) à $0\\ ^\\circ\\mathrm{C}$, en kiloohms.</p>",
      valeur: r0 / 1000,
      unite: "kΩ",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "RT à 0 °C",
      etapes: [
        { texte: "Températures absolues : $T = 273{,}15\\ \\mathrm{K}$ et $T_{25} = 298{,}15\\ \\mathrm{K}$." },
        { texte: "$\\dfrac{1}{T} - \\dfrac{1}{T_{25}} = 3{,}66099 \\times 10^{-3} - 3{,}35402 \\times 10^{-3} = 3{,}0697 \\times 10^{-4}\\ \\mathrm{K^{-1}}$." },
        { texte: "Exposant : $3\\,950 \\times 3{,}0697 \\times 10^{-4} = 1{,}2125$, et $e^{1{,}2125} = 3{,}362$." },
        {
          texte: "$R_T = 10 \\times 3{,}362 = 33{,}62\\ \\mathrm{k\\Omega}$.",
          note: "Contrôle : il fait plus froid, la CTN est plus résistante ; le facteur $3{,}4$ pour $25\\ \\mathrm{K}$ est cohérent avec un coefficient d'environ $-5\\ \\%$ par kelvin.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const tracage = moteur.sim.traceur(conteneur, {
          titre: "Résistance de la CTN en fonction de la température",
          genre: "Correction visuelle",
          xTitre: "température",
          xUnite: "°C",
          yTitre: "RT",
          yUnite: "kΩ",
          xMin: -10,
          xMax: 60,
          yMin: 0,
          yMax: 60,
          ratio: 0.42,
          series: [{ id: "rt", nom: "RT(θ), modèle B", fonction: (t) => resistanceCtn(t) / 1000 }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 0, r0 / 1000, "33,62 kΩ à 0 °C", false);
            marquerPoint(c, repere, couleurs, 25, 10, "10 kΩ à 25 °C", false);
          },
        });
        ressources.push(tracage);
      },
    })
  );

  /* Fondamental 2 : pont de Wheatstone à Pt100. */
  const pont50 = etatPont(50);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-pont-pt100",
      titre: "Tension de déséquilibre d'un pont à Pt100",
      niveau: "fondamental",
      enonce:
        "<p>Un pont de Wheatstone est formé de trois résistances de $100\\ \\Omega$ et d'une Pt100 ($\\alpha = 0{,}00385\\ \\mathrm{K^{-1}}$), alimenté sous $E = 0{,}2\\ \\mathrm{V}$. La sonde est à $50\\ ^\\circ\\mathrm{C}$. Calculez la tension de déséquilibre exacte, en millivolts, puis comparez-la à l'approximation $Ex/4$.</p>",
      valeur: pont50.um * 1000,
      unite: "mV",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "Um",
      etapes: [
        { texte: "Variation relative : $x = 0{,}00385 \\times 50 = 0{,}1925$, soit $R_{\\mathrm{Pt}} = 119{,}25\\ \\Omega$." },
        { texte: "Formule exacte : $U_m = \\dfrac{E\\,x}{2(2 + x)} = \\dfrac{0{,}2 \\times 0{,}1925}{2 \\times 2{,}1925} = 8{,}780\\ \\mathrm{mV}$." },
        { texte: "Vérification par les potentiels : $V_B = 100\\ \\mathrm{mV}$, $V_C = 0{,}2 \\times 119{,}25/219{,}25 = 108{,}780\\ \\mathrm{mV}$." },
        {
          texte: "Approximation : $Ex/4 = 9{,}625\\ \\mathrm{mV}$, trop forte de $9{,}6\\ \\%$, soit $x/2$.",
          note: "Quelques millivolts seulement : il faudra amplifier, ce qui sera l'objet du cours Conditionnement analogique.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 260",
          "<defs>" + marqueur("fl-k-pont") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<circle cx="50" cy="130" r="18"/><path d="M50 112V30H380V50M200 30V50M200 100V160M200 210V240H50V148M380 100V160M380 210V240H200"/>' +
            '<rect x="188" y="50" width="24" height="50" rx="3"/><rect x="188" y="160" width="24" height="50" rx="3"/>' +
            '<rect x="368" y="50" width="24" height="50" rx="3"/><rect x="368" y="160" width="24" height="50" rx="3"/>' +
            '<path d="M212 130H366" marker-end="url(#fl-k-pont)"/></g>' +
            '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12"><circle cx="200" cy="130" r="4.5"/><circle cx="380" cy="130" r="4.5"/>' +
            '<text x="50" y="126" text-anchor="middle" font-weight="600">+</text><text x="26" y="160" text-anchor="end">0,2 V</text>' +
            '<text x="222" y="80">100 Ω</text><text x="222" y="190">100 Ω</text><text x="400" y="80">100 Ω</text><text x="400" y="190">Pt100 : 119,25 Ω</text>' +
            '<text x="180" y="134" text-anchor="end">B : 100 mV</text><text x="400" y="134">C : 108,78 mV</text>' +
            '<text x="290" y="120" text-anchor="middle" font-weight="600">Um = 8,780 mV</text>' +
            '<text x="290" y="256" text-anchor="middle">approximation E x / 4 = 9,625 mV, + 9,6 %</text></g>',
          "Pont à Pt100 annoté à 50 degrés : 100 millivolts en B, 108,78 millivolts en C, déséquilibre 8,780 millivolts"
        );
      },
    })
  );

  /* Intermédiaire 1 : alimentation maximale pour un auto-échauffement imposé. */
  const eMax = Math.sqrt(4 * 10e3 * CTN.delta * 0.05);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-auto-echauffement",
      titre: "Alimentation maximale d'un demi-pont",
      niveau: "intermédiaire",
      enonce:
        "<p>Une CTN de $10\\ \\mathrm{k\\Omega}$ est montée en demi-pont avec $R_f = 10\\ \\mathrm{k\\Omega}$, sans charge. Sa constante de dissipation vaut $1{,}5\\ \\mathrm{mW/K}$. Quelle tension $E$ maximale garantit un auto-échauffement inférieur à $0{,}05\\ \\mathrm{K}$ quelle que soit la température, en volts ?</p>",
      valeur: eMax,
      unite: "V",
      tolerance: 0.01,
      chiffres: 3,
      libelleChamp: "E maximale",
      etapes: [
        { texte: "Puissance admissible : $P_{\\max} = \\delta\\,\\Delta T_{\\max} = 1{,}5 \\times 0{,}05 = 0{,}075\\ \\mathrm{mW}$." },
        { texte: "La puissance dans la CTN est maximale quand $R_T = R_f$ : $P = E^2/(4R_f)$, transfert maximal de puissance." },
        { texte: "D'où $E_{\\max} = \\sqrt{4 R_f P_{\\max}} = \\sqrt{4 \\times 10^4 \\times 7{,}5 \\times 10^{-5}} = \\sqrt{3} = 1{,}732\\ \\mathrm{V}$." },
        {
          texte: "Prix à payer : la sensibilité maximale tombe à $1{,}732 \\times 0{,}0444/4 = 19{,}2\\ \\mathrm{mV/K}$, contre $27{,}8$ sous $2{,}5\\ \\mathrm{V}$.",
          note: "Dimension : $\\sqrt{\\Omega \\cdot \\mathrm{W}} = \\sqrt{\\mathrm{V^2}} = \\mathrm{V}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const tracage = moteur.sim.traceur(conteneur, {
          titre: "Auto-échauffement maximal en fonction de E",
          genre: "Correction visuelle",
          xTitre: "E",
          xUnite: "V",
          yTitre: "ΔT max",
          yUnite: "K",
          xMin: 0,
          xMax: 3,
          yMin: 0,
          yMax: 0.16,
          ratio: 0.42,
          series: [{ id: "dt", nom: "ΔT max = E² / (4 Rf δ)", fonction: (e) => (e * e) / (4 * 10e3 * CTN.delta) }],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 0.05, "0,05 K", false);
            marquerPoint(c, repere, couleurs, eMax, 0.05, "1,732 V", true);
          },
        });
        ressources.push(tracage);
      },
    })
  );

  /* Intermédiaire 2 : condensateur minimal du filtre. */
  const s60 = interfaceChargee(60);
  const cMin = Math.sqrt(100 * 100 - 1) / (OMEGA_50 * s60.req);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-filtre",
      titre: "Condensateur minimal du filtre au pire cas",
      niveau: "intermédiaire",
      enonce:
        "<p>Dans l'interface du mini-projet ($R_f = R_s = 10\\ \\mathrm{k\\Omega}$, $R_{\\mathrm{in}} = 100\\ \\mathrm{k\\Omega}$), on veut que le filtre divise par au moins $100$ une perturbation à $50\\ \\mathrm{Hz}$, par rapport au gain continu, sur toute la plage $-10$ à $60\\ ^\\circ\\mathrm{C}$. Quelle capacité minimale faut-il, en microfarads ?</p>",
      valeur: cMin * 1e6,
      unite: "µF",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "C minimale",
      etapes: [
        { texte: "Le pire cas est le plus chaud : $R_T$ y est le plus faible, $2{,}486\\ \\mathrm{k\\Omega}$ à $60\\ ^\\circ\\mathrm{C}$, donc la résistance vue par $C$ aussi." },
        { texte: "$R_T \\parallel R_f = 1{,}991\\ \\mathrm{k\\Omega}$ ; $R_{\\mathrm{eq}} = (1{,}991 + 10) \\parallel 100 = 10{,}707\\ \\mathrm{k\\Omega}$." },
        { texte: "Condition : $\\sqrt{1 + (\\omega\\tau)^2} \\geq 100$, soit $\\omega\\tau \\geq \\sqrt{9\\,999} = 99{,}995$, avec $\\omega = 314{,}16\\ \\mathrm{rad/s}$." },
        { texte: "$\\tau \\geq 0{,}3183\\ \\mathrm{s}$, donc $C \\geq 0{,}3183/10\\,707 = 29{,}7\\ \\mu\\mathrm{F}$." },
        {
          texte: "On retient la valeur normalisée supérieure, $33\\ \\mu\\mathrm{F}$ ; le délai d'établissement passe alors à environ $3\\ \\mathrm{s}$.",
          note: "Le mini-projet s'est contenté de $22\\ \\mu\\mathrm{F}$, car son exigence portait sur le résidu sous $q/2$, plus souple que ce facteur $100$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const tracage = moteur.sim.traceur(conteneur, {
          titre: "Atténuation à 50 Hz en fonction de C, au pire cas chaud",
          genre: "Correction visuelle",
          xTitre: "C",
          xUnite: "µF",
          yTitre: "atténuation",
          yUnite: "dB",
          xMin: 1,
          xMax: 47,
          yMin: -50,
          yMax: 0,
          ratio: 0.42,
          series: [
            {
              id: "att",
              nom: "gain à 50 Hz rapporté au gain continu, 60 °C",
              fonction: (cu) => -10 * Math.log10(1 + Math.pow(OMEGA_50 * s60.req * cu * 1e-6, 2)),
            },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, -40, "- 40 dB, facteur 100", true);
            marquerPoint(c, repere, couleurs, cMin * 1e6, -40, "29,7 µF", false);
          },
        });
        ressources.push(tracage);
      },
    })
  );

  /* Avancé : du code à la température de l'air. */
  const vCode = 600 * PAS_CAN;
  const sRef = interfaceChargee(25);
  const rCode = sRef.rp * ((sRef.k * INTERFACE.e) / vCode - 1);
  const tCode = temperatureCtn(rCode);
  const iCode = INTERFACE.e / (rCode + sRef.rp);
  const dtCode = (iCode * iCode * rCode) / CTN.delta;
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-code",
      titre: "Du code du convertisseur à la température de l'air",
      niveau: "avancé",
      enonce:
        "<p>L'automate du mini-projet lit le code $N = 600$ (convertisseur $12$ bits, $0$ à $10\\ \\mathrm{V}$). Avec le modèle chargé ($E = 2{,}5\\ \\mathrm{V}$, $R_p = 9{,}167\\ \\mathrm{k\\Omega}$, $k = 0{,}9091$), calculez la température de la sonde, puis celle de l'air en retranchant l'auto-échauffement ($\\delta = 1{,}5\\ \\mathrm{mW/K}$). Donnez la température de l'air en degrés Celsius.</p>",
      valeur: tCode - dtCode,
      unite: "°C",
      tolerance: 0.004,
      chiffres: 2,
      libelleChamp: "Température de l'air",
      etapes: [
        { texte: "Tension : $V_B = 600 \\times 10/4\\,096 = 1{,}4648\\ \\mathrm{V}$." },
        { texte: "Résistance : $R_T = R_p\\left(\\dfrac{kE}{V_B} - 1\\right) = 9{,}167 \\times \\left(\\dfrac{2{,}2727}{1{,}4648} - 1\\right) = 9{,}167 \\times 0{,}5515 = 5{,}056\\ \\mathrm{k\\Omega}$." },
        { texte: "Température de la sonde : $\\dfrac{1}{T} = \\dfrac{1}{298{,}15} + \\dfrac{\\ln(0{,}5056)}{3\\,950} = 3{,}35402 \\times 10^{-3} - 1{,}7267 \\times 10^{-4}$, d'où $T = 314{,}33\\ \\mathrm{K}$, soit $41{,}18\\ ^\\circ\\mathrm{C}$." },
        { texte: "Courant : $I = 2{,}5/(5{,}056 + 9{,}167) = 0{,}1758\\ \\mathrm{mA}$ ; puissance $P = 5\\,056 \\times (1{,}758 \\times 10^{-4})^2 = 0{,}156\\ \\mathrm{mW}$ ; échauffement $0{,}156/1{,}5 = 0{,}104\\ \\mathrm{K}$." },
        {
          texte: "Air : $41{,}18 - 0{,}10 = 41{,}08\\ ^\\circ\\mathrm{C}$.",
          note: "Contrôle : le code $600$ est un peu au-dessus du code $590$ attendu à $40\\ ^\\circ\\mathrm{C}$, et la résolution y vaut $0{,}11\\ \\mathrm{K}$ par pas : dix pas de plus font bien environ $1{,}2\\ \\mathrm{K}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 640 150",
          "<defs>" + marqueur("fl-k-code") + "</defs>" +
            '<g stroke="currentColor" stroke-width="1.8" fill="none">' +
            '<rect x="10" y="40" width="100" height="60" rx="8"/><rect x="140" y="40" width="100" height="60" rx="8"/>' +
            '<rect x="270" y="40" width="110" height="60" rx="8"/><rect x="410" y="40" width="100" height="60" rx="8"/><rect x="540" y="40" width="94" height="60" rx="8"/>' +
            '<path d="M112 70H134" marker-end="url(#fl-k-code)"/><path d="M242 70H264" marker-end="url(#fl-k-code)"/>' +
            '<path d="M382 70H404" marker-end="url(#fl-k-code)"/><path d="M512 70H534" marker-end="url(#fl-k-code)"/></g>' +
            '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12" text-anchor="middle">' +
            '<text x="60" y="66">code</text><text x="60" y="84">N = 600</text>' +
            '<text x="190" y="66">VB</text><text x="190" y="84">1,4648 V</text>' +
            '<text x="325" y="66">RT</text><text x="325" y="84">5,056 kΩ</text>' +
            '<text x="460" y="66">sonde</text><text x="460" y="84">41,18 °C</text>' +
            '<text x="587" y="66">air</text><text x="587" y="84">41,08 °C</text>' +
            '<text x="123" y="30">x q</text><text x="253" y="30">modèle</text><text x="393" y="30">modèle B</text><text x="523" y="30">- 0,10 K</text>' +
            '<text x="320" y="130">chaque flèche est une formule programmée dans l\'automate</text></g>',
          "Chaîne de calcul de l'automate : code 600, 1,4648 volt, 5,056 kiloohms, 41,18 degrés pour la sonde, 41,08 degrés pour l'air"
        );
      },
    })
  );

  /* Diagnostic industriel. */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Le réchauffage tourne en plein été",
      niveau: "diagnostic",
      enonce:
        "<p>Un après-midi d'été, l'exploitant constate que le réchauffage de l'armoire déportée est enclenché. La supervision affiche une température de l'armoire inférieure à $-30\\ ^\\circ\\mathrm{C}$ et la tension d'entrée lue vaut $0{,}00\\ \\mathrm{V}$. La CTN est en haut du demi-pont, comme dans le mini-projet. Quelles causes sont compatibles avec ces symptômes ?</p>",
      options: [
        { texte: "Une coupure de la CTN ou d'un conducteur du câble.", juste: true },
        { texte: "Une borne de la CTN desserrée dans l'armoire déportée.", juste: true },
        { texte: "Un court-circuit entre les deux conducteurs du câble." },
        { texte: "Le condensateur du filtre en court-circuit.", juste: true },
        { texte: "La résistance fixe $R_f$ coupée." },
      ],
      multiple: true,
      etapes: [
        { texte: "Une tension nulle à l'entrée signifie qu'aucun courant n'arrive par la CTN, ou que le point $B$ est relié à la référence." },
        { texte: "Coupure de la CTN, d'un conducteur ou borne desserrée : courant nul, $V_A = 0$, donc $V_B = 0$. Condensateur en court-circuit : $V_B = 0$ directement." },
        { texte: "Court-circuit du câble : la CTN est shuntée, $V_B = kE = 2{,}273\\ \\mathrm{V}$, lu comme une chaleur extrême. $R_f$ coupée : $V_B$ monte, vers $2{,}08\\ \\mathrm{V}$ à $25\\ ^\\circ\\mathrm{C}$, lu comme une chaleur d'environ $94\\ ^\\circ\\mathrm{C}$." },
        {
          texte: "Pour départager, mesurer $V_A$ : nulle si le défaut est côté CTN, non nulle, environ $0{,}83\\ \\mathrm{V}$ à $25\\ ^\\circ\\mathrm{C}$, si c'est le condensateur ; puis mesurer la résistance de la boucle câble et CTN, alimentation coupée.",
          note: "Le défaut aurait dû être signalé : sous $0{,}10\\ \\mathrm{V}$, l'automate doit déclarer la mesure invalide et placer le réchauffage dans son état sûr au lieu de réguler.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 230",
          '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<circle cx="50" cy="120" r="18"/><path d="M50 102V30H160V50M160 110V140M160 190V210H50V138M160 130H260M320 130H400V150M400 170V210H160"/>' +
            '<rect x="148" y="50" width="24" height="60" rx="3"/><rect x="148" y="150" width="24" height="40" rx="3"/><rect x="260" y="118" width="60" height="24" rx="3"/>' +
            '<path d="M384 150H416M384 162H416" stroke-width="3"/><path d="M400 162V170"/></g>' +
            '<g stroke="currentColor" stroke-width="2.4" fill="none"><path d="M128 64L192 96M128 96L192 64"/><path d="M436 146L456 166M436 166L456 146"/></g>' +
            '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12">' +
            '<text x="50" y="116" text-anchor="middle" font-weight="600">+</text><text x="24" y="150" text-anchor="end">2,5 V</text>' +
            '<text x="200" y="40">CTN coupée : I = 0</text><text x="184" y="176">Rf</text><text x="290" y="110" text-anchor="middle">Rs</text>' +
            '<text x="466" y="150">ou C en court-circuit</text><text x="410" y="124">B : 0 V</text><text x="300" y="228" text-anchor="middle">0 V lu, interprété comme un froid extrême</text></g>',
          "Demi-pont avec les deux défauts qui donnent zéro volt : CTN coupée et condensateur en court-circuit"
        );
      },
    })
  );

  /* Conceptuelle. */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-concept",
      titre: "Pont et trois fils pour la Pt100, demi-pont et deux fils pour la CTN",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul long, expliquez pourquoi une sonde Pt100 placée à $40\\ \\mathrm{m}$ se monte dans un pont de Wheatstone en trois fils, suivi d'un amplificateur, alors qu'une CTN de $10\\ \\mathrm{k\\Omega}$ au même endroit se contente d'un demi-pont en deux fils.</p>",
      motsCles: [
        ["faible", "petite", "0,385", "millivolt", "mv"],
        ["decalage", "zero", "offset", "e/2", "equilibre"],
        ["cable", "fil", "ligne"],
        ["amplif"],
      ],
      minimum: 3,
      exemple: "Trois ou quatre phrases : variation relative, décalage, résistance du câble.",
      etapes: [
        { texte: "La Pt100 varie de $0{,}385\\ \\Omega$ par kelvin, soit $0{,}385\\ \\%$ : son signal est de quelques millivolts, posé sur un décalage de l'ordre de $E/2$ dans un demi-pont." },
        { texte: "Le pont retire ce décalage : on peut alors amplifier le seul écart sans saturer l'amplificateur." },
        { texte: "Le câble de $40\\ \\mathrm{m}$ ajoute $2{,}88\\ \\Omega$, soit $7{,}5\\ \\mathrm{K}$ d'erreur ; le montage trois fils place deux fils dans deux bras adjacents, où leurs effets se compensent." },
        {
          texte: "La CTN varie de $4{,}4\\ \\%$ par kelvin sur $10\\ \\mathrm{k\\Omega}$ : $444\\ \\Omega$ par kelvin. Son signal atteint des centaines de millivolts et le câble ne pèse que $0{,}006\\ \\mathrm{K}$.",
          note: "Le choix du montage découle du rapport entre la variation du capteur, la résistance du câble et la pleine échelle du convertisseur.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 200",
          '<g stroke="currentColor" stroke-width="1.6" fill="none">' +
            '<path d="M150 20V170M150 170H580"/>' +
            '<rect x="150" y="40" width="420" height="26" fill="currentColor" fill-opacity="0.35"/>' +
            '<rect x="150" y="90" width="3.6" height="26" fill="currentColor" fill-opacity="0.6"/>' +
            '<rect x="150" y="128" width="27" height="26" fill="none" stroke-dasharray="4 3"/></g>' +
            '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12">' +
            '<text x="140" y="58" text-anchor="end">CTN, Ω/K</text><text x="140" y="108" text-anchor="end">Pt100, Ω/K</text><text x="140" y="146" text-anchor="end">câble 40 m, Ω</text>' +
            '<text x="560" y="58" text-anchor="end">444</text><text x="162" y="108">0,385</text><text x="186" y="146">2,88</text>' +
            '<text x="365" y="192" text-anchor="middle">le câble pèse 7,5 K sur la Pt100, 0,006 K sur la CTN</text></g>',
          "Comparaison à la même échelle : 444 ohms par kelvin pour la CTN, 0,385 pour la Pt100, 2,88 ohms de câble"
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const DESSIN_QUIZ =
  '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
  '<circle cx="60" cy="120" r="18"/><path d="M60 102V30H180V50M180 110V140M180 190V210H60V138M180 125H270M330 125H420V145M420 157V210H180"/>' +
  '<rect x="168" y="50" width="24" height="60" rx="3"/><path d="M158 106L202 54"/><rect x="168" y="140" width="24" height="50" rx="3"/>' +
  '<rect x="270" y="113" width="60" height="24" rx="3"/><path d="M404 145H436M404 157H436" stroke-width="3"/>' +
  '<path d="M420 125H500"/></g>' +
  '<g fill="currentColor" stroke="none" ' + MONO + ' font-size="12.5">' +
  '<circle cx="180" cy="125" r="4.5"/><circle cx="420" cy="125" r="4.5"/>' +
  '<text x="60" y="116" text-anchor="middle" font-weight="600">+</text><text x="34" y="126" text-anchor="end">E</text>' +
  '<text x="204" y="82">CTN</text><text x="204" y="170">R1</text><text x="300" y="104" text-anchor="middle">R2</text>' +
  '<text x="446" y="156">C</text><text x="506" y="129">vers le CAN</text>' +
  '<text x="270" y="236" text-anchor="middle">référence en bas</text></g>';

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Lequel de ces capteurs voit sa résistance diminuer quand la température augmente ?</p>",
        options: ["Une sonde Pt100", "Une thermistance CTN", "Une sonde Ni100", "Un fil de cuivre"],
        bonnes: [1],
        explication: "Dans le semi-conducteur d'une CTN, le nombre de porteurs croît très vite avec la température : la résistance chute. Dans les métaux, elle croît.",
        resume: "Coefficient négatif",
      },
      {
        type: "vraiFaux",
        enonce: "<p>La tension de déséquilibre d'un pont de Wheatstone à trois bras égaux est exactement proportionnelle à la variation relative $x$ du capteur.</p>",
        reponse: false,
        explication: "$U_m = Ex/[2(2 + x)]$ : le $x$ du dénominateur courbe la caractéristique ; l'approximation $Ex/4$ est trop forte de $x/2$.",
        resume: "Non-linéarité du pont",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est le pas de quantification d'un convertisseur $12$ bits de pleine échelle $10\\ \\mathrm{V}$, en millivolts ?</p>",
        valeur: PAS_CAN * 1000,
        unite: "mV",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$q = 10/2^{12} = 10/4\\,096 = 2{,}441\\ \\mathrm{mV}$.",
        resume: "Pas de quantification",
      },
      {
        type: "courte",
        enonce: "<p>Comment appelle-t-on l'erreur due à la puissance que le courant de mesure dissipe dans le capteur lui-même ?</p>",
        motsCles: [["auto", "self", "echauff"]],
        minimum: 1,
        explication: "L'auto-échauffement : $\\Delta T = P/\\delta$, où $\\delta$ est la constante de dissipation du capteur.",
        resume: "Auto-échauffement",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la valeur absolue du coefficient de température d'une CTN de $B = 3\\,950\\ \\mathrm{K}$ à $25\\ ^\\circ\\mathrm{C}$, en pour cent par kelvin ?</p>",
        valeur: (CTN.b / (CTN.t25 * CTN.t25)) * 100,
        unite: "%/K",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$|\\alpha_T| = B/T^2 = 3\\,950/298{,}15^2 = 0{,}0444\\ \\mathrm{K^{-1}}$, soit $4{,}44\\ \\%$ par kelvin.",
        resume: "Coefficient d'une CTN",
      },
      {
        type: "schema",
        enonce: "<p>Dans cette interface, quelle résistance doit valoir la résistance de la CTN au point de lecture le plus fin, pour une sensibilité maximale ?</p>",
        consigne: "Cliquez sur la résistance correspondante.",
        viewBox: "0 0 560 250",
        dessin: DESSIN_QUIZ,
        zones: [
          { x: 160, y: 136, largeur: 70, hauteur: 60, etiquette: "R1", juste: true },
          { x: 262, y: 96, largeur: 76, hauteur: 46, etiquette: "R2" },
          { x: 396, y: 136, largeur: 70, hauteur: 34, etiquette: "C" },
        ],
        explication: "$R_1$ forme le demi-pont avec la CTN : la sensibilité $E\\,|\\alpha|\\,R_1R_T/(R_1 + R_T)^2$ est maximale pour $R_1 = R_T$. $R_2$ et $C$ forment le filtre.",
        resume: "Résistance fixe du demi-pont",
      },
      {
        type: "calcul",
        enonce: "<p>Un capteur dissipe $0{,}2\\ \\mathrm{mW}$ et sa constante de dissipation vaut $2\\ \\mathrm{mW/K}$. De combien est-il plus chaud que le milieu mesuré, en kelvins ?</p>",
        valeur: 0.1,
        unite: "K",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$\\Delta T = P/\\delta = 0{,}2/2 = 0{,}1\\ \\mathrm{K}$.",
        resume: "Échauffement d'un capteur",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Doubler le condensateur du filtre divise environ par deux le résidu à $50\\ \\mathrm{Hz}$ et double le délai d'établissement.</p>",
        reponse: true,
        explication: "Loin de sa coupure, un premier ordre atténue comme $1/(\\omega\\tau)$ ; le délai vaut $\\tau\\ln(\\Delta V/(q/2))$, proportionnel à $\\tau$.",
        resume: "Filtrage contre rapidité",
      },
      {
        type: "calcul",
        enonce: "<p>Un filtre de constante de temps $0{,}3\\ \\mathrm{s}$ reçoit un échelon de $1\\ \\mathrm{V}$. Combien de temps faut-il pour s'en approcher à $q/2$ près, avec $q = 2{,}441\\ \\mathrm{mV}$, en secondes ?</p>",
        valeur: 0.3 * Math.log(1 / (PAS_CAN / 2)),
        unite: "s",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$t = 0{,}3 \\times \\ln(1/0{,}0012207) = 0{,}3 \\times 6{,}708 = 2{,}01\\ \\mathrm{s}$.",
        resume: "Délai d'établissement",
      },
      {
        type: "qcm",
        enonce: "<p>Qu'est-ce que le montage trois fils d'une Pt100 compense, au voisinage de l'équilibre du pont ?</p>",
        options: [
          { texte: "La résistance des fils de liaison.", juste: true },
          { texte: "La variation de cette résistance avec la température du câble.", juste: true },
          { texte: "L'auto-échauffement de la sonde." },
          { texte: "La non-linéarité du pont." },
        ],
        multiple: true,
        explication: "Les deux fils de même résistance sont dans deux bras adjacents ; leurs effets, et leurs variations communes, s'annulent à l'équilibre. L'échauffement et la non-linéarité ne sont pas concernés.",
        resume: "Montage trois fils",
      },
    ],
    { titre: "Dix questions sur l'interface d'un capteur résistif" }
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
      { categorie: "Capteurs", question: "Comment varie la résistance d'une Pt100 et d'une CTN avec la température ?", reponse: "Pt100 : $R_0(1 + \\alpha\\theta)$, $\\alpha = 0{,}00385\\ \\mathrm{K^{-1}}$. CTN : $R_{25}\\,e^{B(1/T - 1/T_{25})}$, coefficient $-B/T^2$, environ $-4{,}4\\ \\%$ par kelvin à $25\\ ^\\circ\\mathrm{C}$." },
      { categorie: "Demi-pont", question: "Quelle résistance fixe donne la meilleure sensibilité ?", reponse: "$R_f = R_T$ à la température de lecture la plus fine ; $S_{\\max} = E\\,|\\alpha_T|/4$." },
      { categorie: "Pont", question: "Que vaut la tension de déséquilibre d'un pont à trois bras égaux ?", reponse: "$U_m = Ex/[2(2 + x)]$ ; l'approximation $Ex/4$ est trop forte de $x/2$." },
      { categorie: "Câble", question: "Pourquoi trois fils pour une Pt100 lointaine ?", reponse: "Les deux fils de courant sont dans deux bras adjacents et se compensent à l'équilibre ; en deux fils, $40\\ \\mathrm{m}$ en $0{,}5\\ \\mathrm{mm^2}$ ajoutent $7{,}5\\ \\mathrm{K}$." },
      { categorie: "Modèle", question: "Quelle formule l'automate doit-il programmer pour une interface chargée ?", reponse: "$R_T = R_p\\,(kE/V_B - 1)$, avec $R_p = R_f \\parallel (R_s + R_{\\mathrm{in}})$ et $k = R_{\\mathrm{in}}/(R_s + R_{\\mathrm{in}})$, puis le modèle $B$ inversé." },
      { categorie: "Échauffement", question: "Quelle puissance maximale dissipe le capteur d'un demi-pont ?", reponse: "$E^2/(4R_p)$, atteinte pour $R_T = R_p$ ; l'échauffement vaut $P/\\delta$.", rappel: "Sous 10 V, la CTN du mini-projet se chaufferait de 1,8 K ; sous 2,5 V, de 0,11 K." },
      { categorie: "Thermique", question: "Quelle est l'analogie électrique de l'échauffement d'un capteur ?", reponse: "Un circuit RC : température comme tension, puissance comme courant, $1/\\delta$ comme résistance, $C_{\\mathrm{th}}$ comme capacité ; $\\tau_{\\mathrm{th}} = C_{\\mathrm{th}}/\\delta$." },
      { categorie: "Filtre", question: "Quelle résistance entre dans la constante de temps du filtre ?", reponse: "La résistance de Thévenin vue par le condensateur : $[(R_T \\parallel R_f) + R_s] \\parallel R_{\\mathrm{in}}$ ; pire cas d'atténuation au chaud." },
      { categorie: "Conversion", question: "Que valent le pas et la résolution en température ?", reponse: "$q = V_{\\mathrm{PE}}/2^n$, $2{,}44\\ \\mathrm{mV}$ sur $12$ bits et $10\\ \\mathrm{V}$ ; résolution $q/S$, $0{,}1$ à $0{,}18\\ \\mathrm{K}$ dans le mini-projet." },
      {
        categorie: "Industriel",
        question: "Comment l'automate détecte-t-il un défaut de câblage de la CTN ?",
        reponse: "CTN en haut du demi-pont : coupure, $V_B = 0$ ; court-circuit, $V_B = kE$. Mesure invalide sous $0{,}10\\ \\mathrm{V}$ et au-dessus de $2{,}11\\ \\mathrm{V}$.",
        rappel: "Sur défaut, le réchauffage passe dans son état sûr et une alarme est émise.",
      },
    ],
    { titre: "Dix cartes sur l'interface d'un capteur résistif" }
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
        enonce: "<p>On veut lire le plus finement possible vers $40\\ ^\\circ\\mathrm{C}$ avec la CTN du mini-projet. Quelle résistance fixe choisir, en kiloohms ?</p>",
        valeur: resistanceCtn(40) / 1000,
        unite: "kΩ",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$R_f = R_T(40\\ ^\\circ\\mathrm{C}) = 10\\,e^{3\\,950(1/313{,}15 - 1/298{,}15)} = 5{,}30\\ \\mathrm{k\\Omega}$.",
        resume: "Résistance fixe optimale (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Avec la CTN en haut du demi-pont, une coupure du câble fait lire à l'automate une température très basse.</p>",
        reponse: true,
        explication: "Sans courant, le point milieu tombe à $0\\ \\mathrm{V}$, la valeur qui correspond à une résistance infinie, donc à un froid extrême.",
        resume: "Diagnostic de coupure (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Une Pt100 est raccordée en deux fils par une boucle de $2\\ \\Omega$. De combien la lecture est-elle trop haute, en kelvins ?</p>",
        valeur: 2 / 0.385,
        unite: "K",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$2/0{,}385 = 5{,}19\\ \\mathrm{K}$ : la résistance des fils s'ajoute à celle de la sonde.",
        resume: "Erreur du câble deux fils (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Un nœud est relié à une source de $24\\ \\mathrm{V}$ par $0{,}5\\ \\Omega$, à une source de $27\\ \\mathrm{V}$ par $0{,}5\\ \\Omega$ et à la référence par $6\\ \\Omega$. Quel est son potentiel, en volts ?</p>",
        valeur: (24 / 0.5 + 27 / 0.5) / (2 + 2 + 1 / 6),
        unite: "V",
        tolerance: 0.01,
        chiffres: 2,
        explication: "Méthode des nœuds à une inconnue : $V = (48 + 54)/(2 + 2 + 0{,}1667) = 102/4{,}1667 = 24{,}48\\ \\mathrm{V}$. Révisé du cours Méthodes de résolution systématique.",
        resume: "Méthode des nœuds (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>On simule le filtre du mini-projet, $\\tau = 0{,}287\\ \\mathrm{s}$, par la méthode d'Euler explicite. Au-delà de quel pas de calcul la simulation devient-elle instable, en secondes ?</p>",
        valeur: 2 * 0.287,
        unite: "s",
        tolerance: 0.01,
        chiffres: 3,
        explication: "Le facteur d'amplification $1 - h/\\tau$ dépasse $1$ en valeur absolue pour $h \\gt 2\\tau = 0{,}574\\ \\mathrm{s}$. Révisé du cours Méthodes de résolution systématique.",
        resume: "Stabilité d'Euler explicite (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Un dipôle de Thévenin de $12\\ \\mathrm{V}$ et $6\\ \\Omega$ alimente une charge réglable. Quelle puissance maximale peut-il lui fournir, en watts ?</p>",
        valeur: 6,
        unite: "W",
        tolerance: 0.01,
        chiffres: 2,
        explication: "Maximum pour une charge égale à $6\\ \\Omega$ : $E^2/(4R) = 144/24 = 6\\ \\mathrm{W}$. C'est la même relation qui borne l'auto-échauffement du capteur. Révisé du cours Révision 1 et étude de cas continu.",
        resume: "Transfert maximal de puissance (Révision 1 et étude de cas continu)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la résistance de $80\\ \\mathrm{m}$ de conducteur en cuivre de $0{,}5\\ \\mathrm{mm^2}$, avec $\\rho = 0{,}018\\ \\Omega \\cdot \\mathrm{mm^2/m}$, en ohms ?</p>",
        valeur: (0.018 * 80) / 0.5,
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$R = \\rho L/S = 0{,}018 \\times 80/0{,}5 = 2{,}88\\ \\Omega$ : la boucle de $40\\ \\mathrm{m}$ du mini-projet. Révisé du cours Loi d'Ohm et résistivité.",
        resume: "Résistance d'un câble (Loi d'Ohm et résistivité)",
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
    titre: "Où en suis-je en fin de module sur les circuits continus et transitoires ?",
  });
  if (auto) ressources.push(auto);
}
