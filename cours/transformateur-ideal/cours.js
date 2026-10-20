/* ==========================================================================
   cours/transformateur-ideal/cours.js
   Transformateur idéal : flux commun et rapport des tensions, équilibre des
   ampères-tours et rapport des courants, conservation de la puissance,
   bornes homologues et essai de polarité, transfert d'impédance et
   adaptation, transformateur à plusieurs secondaires, prises du
   transformateur du poste du site.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";
const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;
const RAC2 = Math.SQRT2;
const RAC3 = Math.sqrt(3);

/* Transformateur de l'exemple numérique : 400 V, 600 spires, 25 cm² nets. */
const EX = { U1: 400, f: 50, N1: 600, N2: 345, N3: 36, S: 25e-4 };
/* Transformateur du poste du site, hypothèses d'étude. */
const POSTE = { U1: 20000, U2: 410, Sn: 100e3 };
const PRISES = [-5, -2.5, 0, 2.5, 5];

/** Bilan des ampères-tours de l'exemple : charges en VA et W, angle du courant de l'atelier en degrés. */
function bilanExemple(s2, p3, angleI2) {
  const m2 = EX.N2 / EX.N1;
  const m3 = EX.N3 / EX.N1;
  const i2 = s2 / 230;
  const i3 = p3 / 24;
  const a = { re: m2 * i2 * Math.cos(angleI2 * DEG), im: m2 * i2 * Math.sin(angleI2 * DEG) };
  const b = { re: m3 * i3, im: 0 };
  const i1 = { re: a.re + b.re, im: a.im + b.im };
  const module = Math.hypot(i1.re, i1.im);
  const phase = Math.atan2(i1.im, i1.re) / DEG;
  return {
    a,
    b,
    i1,
    module,
    phase,
    arith: m2 * i2 + m3 * i3,
    P: EX.U1 * i1.re,
    Q: -EX.U1 * i1.im,
    S: EX.U1 * module,
  };
}

/** Tension secondaire composée du poste, à vide, pour une tension HTA en volts et une prise en %. */
function tensionPoste(uHta, prise) {
  return (POSTE.U2 * (uHta / POSTE.U1)) / (1 + prise / 100);
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

function marqueur(id) {
  return (
    '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto-start-reverse">' +
    '<path d="M0 0 9 4 0 8Z" fill="currentColor"/></marker>'
  );
}

function texte(x, y, contenu, options = "") {
  return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + options + ">" + contenu + "</text>";
}

function ligneV(c, repere, couleurs, x, libelle, tirets = [5, 5]) {
  const px = repere.versX(x);
  if (px < repere.boite.x - 1 || px > repere.boite.x + repere.boite.l + 1) return;
  c.save();
  c.setLineDash(tirets);
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
    const aGauche = px > repere.boite.x + repere.boite.l * 0.72;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

function ligneH(c, repere, couleurs, y, libelle, enDessous, tirets = [7, 5]) {
  const py = repere.versY(y);
  if (py < repere.boite.y - 1 || py > repere.boite.y + repere.boite.h + 1) return;
  c.save();
  c.setLineDash(tirets);
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
    c.fillText(libelle, repere.boite.x + repere.boite.l - 4, py + (enDessous ? 14 : -6));
  }
  c.restore();
}

function pointTrace(c, repere, couleurs, x, y, libelle) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.fillStyle = couleurs.texte;
  c.beginPath();
  c.arc(px, py, 4.5, 0, TAU);
  c.fill();
  if (libelle) {
    c.font = POLICE;
    const aGauche = px > repere.boite.x + repere.boite.l * 0.65;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -8 : 8), py - 8);
  }
  c.restore();
}

function traceCorrection(moteur, conteneur, options) {
  const traceur = moteur.sim.traceur(conteneur, {
    genre: "Correction visuelle",
    ratio: 0.42,
    echantillons: 400,
    ...options,
  });
  if (traceur) ressources.push(traceur);
  return traceur;
}

function barresCorrection(moteur, conteneur, options, barres) {
  const spectre = moteur.sim.spectre(conteneur, {
    genre: "Correction visuelle",
    ratio: 0.4,
    ...options,
  });
  if (spectre) {
    spectre.definirBarres(barres);
    ressources.push(spectre);
  }
  return spectre;
}

/** Schéma annoté inséré dans une correction, tracé progressivement. */
function schemaCorrection(moteur, conteneur, viewBox, dessin, legende) {
  const figure = document.createElement("figure");
  const svg = svgEl("svg", { viewBox, role: "img", "aria-label": legende });
  svg.innerHTML = dessin;
  figure.appendChild(svg);
  const texteLegende = document.createElement("figcaption");
  texteLegende.textContent = legende;
  figure.appendChild(texteLegende);
  conteneur.appendChild(figure);
  const trace = moteur.dessiner(svg, { duree: 1.4 });
  if (trace) ressources.push(trace);
}

/** Chemin d'une flèche de phaseur, de (x0, y0) à (x1, y1). */
function segment(x0, y0, x1, y1) {
  return "M" + x0.toFixed(1) + " " + y0.toFixed(1) + "L" + x1.toFixed(1) + " " + y1.toFixed(1);
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
  construireAnimFlux(racine, api);
  construireEssai(racine, api);
  construireSimAdaptation(racine, api);
  construirePhaseurs(racine, api);
  construireSimPrises(racine, api);
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
  const schemas = [
    ["#d-principe-figure svg", 1.8],
    ["#e-conventions-figure svg", 1.6],
    ["#e-impedance-figure svg", 1.6],
    ["#f-schema-principal svg", 1.8],
    ["#h-donnees-figure svg", 1.8],
    ["#i-poste-figure svg", 1.8],
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
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-boucherot",
      titre: "Flux imposé par la tension",
      niveau: "prérequis",
      enonce:
        "<p>Un bobinage de $460$ spires, enroulé sur un noyau de $20\\ \\mathrm{cm^2}$ de section nette, est alimenté sous " +
        "$230\\ \\mathrm{V}$, $50\\ \\mathrm{Hz}$. Quelle est l'induction crête dans le noyau, en teslas ?</p>",
      valeur: 230 / (Math.PI * RAC2 * 50 * 460 * 20e-4),
      unite: "T",
      tolerance: 0.015,
      chiffres: 3,
      libelleChamp: "Induction crête $\\hat{B}$",
      etapes: [
        { texte: "Formule de Boucherot : $U = 4{,}44\\,fNS\\hat{B}$, d'où $\\hat{B} = U/(4{,}44\\,fNS)$." },
        { texte: "$4{,}443 \\times 50 \\times 460 \\times 20 \\times 10^{-4} = 204{,}4\\ \\mathrm{V/T}$." },
        {
          texte: "$\\hat{B} = 230/204{,}4 = 1{,}125\\ \\mathrm{T}$, sous le coude d'une tôle courante.",
          note: "La tension par spire vaut $230/460 = 0{,}5\\ \\mathrm{V}$ : tout autre bobinage du même noyau aurait $0{,}5\\ \\mathrm{V}$ par spire.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Induction crête en fonction de la tension, N = 460",
          xTitre: "U",
          xUnite: "V",
          yTitre: "B crête",
          yUnite: "T",
          xMin: 0,
          xMax: 320,
          yMin: 0,
          yMax: 1.8,
          series: [{ id: "b", nom: "B crête = U / (4,44 f N S)", couleur: "serie-1", epaisseur: 2.6, fonction: (u) => u / (Math.PI * RAC2 * 50 * 460 * 20e-4) }],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 230, "230 V");
            pointTrace(c, repere, couleurs, 230, 1.1254, "1,125 T");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm("#c-minitest", {
      id: "c-conventions",
      titre: "Conventions récepteur et générateur",
      niveau: "prérequis",
      enonce:
        "<p>Un dipôle est fléché en convention générateur : le courant $i$ sort par la borne vers laquelle pointe la flèche de " +
        "$u$. On mesure $u = 230\\ \\mathrm{V}$ et $i = 4\\ \\mathrm{A}$ à un instant donné. Quelles affirmations sont exactes ?</p>",
      options: [
        { texte: "Le produit $ui = 920\\ \\mathrm{W}$ est la puissance fournie par le dipôle au reste du circuit.", juste: true },
        { texte: "Le produit $ui$ est la puissance reçue par le dipôle." },
        { texte: "Si l'on fléchait le même dipôle en convention récepteur, on écrirait $i' = -4\\ \\mathrm{A}$ et $ui' = -920\\ \\mathrm{W}$ reçus.", juste: true },
        { texte: "Le choix de convention change la puissance physiquement échangée." },
      ],
      etapes: [
        { texte: "En convention générateur, $ui$ est la puissance fournie ; en convention récepteur, la puissance reçue." },
        { texte: "Changer de convention, c'est retourner la flèche du courant : le signe du produit change, pas le phénomène." },
        {
          texte: "Le transformateur utilise les deux : récepteur au primaire, générateur au secondaire, si bien que $v_1i_1 = v_2i_2$ exprime une puissance reçue d'un côté et fournie de l'autre.",
          note: "C'est le choix qui donne des courants positifs et une puissance qui traverse l'appareil.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 520 170",
          "<defs>" + marqueur("fl-c-conv") + "</defs>" +
            '<g fill="none" stroke="currentColor" stroke-width="2"><rect x="90" y="50" width="34" height="70" rx="3"/><path d="M107 20V50M107 120V150"/>' +
            '<rect x="370" y="50" width="34" height="70" rx="3"/><path d="M387 20V50M387 120V150"/></g>' +
            '<g fill="none" stroke="currentColor" stroke-width="1.6"><path d="M107 46V24" marker-end="url(#fl-c-conv)"/><path d="M60 128V42" marker-end="url(#fl-c-conv)"/>' +
            '<path d="M387 24V46" marker-end="url(#fl-c-conv)"/><path d="M340 128V42" marker-end="url(#fl-c-conv)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
            '<text x="116" y="36">i sort</text><text x="40" y="90">u</text><text x="140" y="80">générateur :</text><text x="140" y="96">u i fournie</text>' +
            '<text x="396" y="36">i entre</text><text x="320" y="90">u</text><text x="420" y="80">récepteur :</text><text x="420" y="96">u i reçue</text></g>',
          "Même dipôle, deux fléchages : à gauche, le courant sort par la borne pointée par la flèche de u, convention générateur ; à droite, il y entre, convention récepteur."
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-impedance",
      titre: "Courant dans une impédance complexe",
      niveau: "prérequis",
      enonce:
        "<p>Une charge d'impédance $\\underline{Z} = 12 + j16\\ \\Omega$ est alimentée sous $400\\ \\mathrm{V}$ efficaces. Quel est le " +
        "courant efficace, en ampères ? Quel est son déphasage par rapport à la tension ?</p>",
      valeur: 20,
      unite: "A",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "Courant $I$",
      etapes: [
        { texte: "Module : $Z = \\sqrt{12^2 + 16^2} = 20\\ \\Omega$ ; argument : $\\arctan(16/12) = 53{,}13^\\circ$." },
        { texte: "$I = V/Z = 400/20 = 20\\ \\mathrm{A}$." },
        { texte: "Le courant est en retard de $53{,}13^\\circ$ sur la tension : $\\cos\\varphi = 0{,}6$, charge inductive.", note: "Un transformateur idéal conservera cet argument en ramenant l'impédance de l'autre côté." },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 420 220",
          "<defs>" + marqueur("fl-c-imp") + "</defs>" +
            '<g fill="none" stroke="currentColor" stroke-width="1" opacity="0.6"><path d="M40 180H380M60 200V20"/></g>' +
            '<g fill="none" stroke="currentColor" stroke-width="2.4"><path d="M60 180H240" marker-end="url(#fl-c-imp)"/><path d="M240 180V40" marker-end="url(#fl-c-imp)"/><path d="M60 180L240 40" stroke-width="3" marker-end="url(#fl-c-imp)"/></g>' +
            '<path d="M110 180A50 50 0 0 0 99.5 149.3" fill="none" stroke="currentColor" stroke-width="1.2"/>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
            '<text x="130" y="198">R = 12 Ω</text><text x="250" y="114">X = 16 Ω</text><text x="90" y="96">Z = 20 Ω</text><text x="116" y="166">53,13°</text></g>',
          "Triangle d'impédance : partie réelle 12 Ω, partie imaginaire 16 Ω, module 20 Ω et argument 53,13 degrés."
        );
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : flux commun et équilibre des ampères-tours
   -------------------------------------------------------------------------- */

function construireAnimFlux(racine, api) {
  const conteneur = racine.querySelector("#d-anim");
  if (!conteneur) return;

  const etat = { N2: EX.N2, I2: 10, Im: 0, phase: 40 };
  const omega = TAU * EX.f;
  const phiCrete = (RAC2 * EX.U1) / (EX.N1 * omega);
  const T0 = 400;
  const T1 = 700;
  const YV = 110;
  const DV = 62;
  const YI = 268;
  const DI = 62;
  const YP = 370;
  const versT = (deg) => T0 + ((T1 - T0) * deg) / 360;

  const svg = svgEl("svg", {
    viewBox: "0 0 720 400",
    role: "img",
    "aria-label": "Transformateur en fonctionnement : flux commun, courants primaire et secondaire, et formes d'onde des tensions, du flux et des courants sur une période",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-d-anim");
  const noyau = svgEl("path", {
    d: "M60 60H300V320H60Z M110 110V270H250V110Z",
    fill: "rgba(128,128,128,0.16)",
    "fill-rule": "evenodd",
    stroke: "currentColor",
    "stroke-width": 2,
  });
  const bobinages = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round" });
  bobinages.innerHTML =
    '<path d="M50 152L120 144M50 168L120 160M50 184L120 176M50 200L120 192M50 216L120 208M50 232L120 224"/>' +
    '<path d="M50 152H24M50 232V250H24"/>' +
    '<path d="M240 144L310 152M240 160L310 168M240 176L310 184M240 192L310 200M240 208L310 216M240 224L310 232"/>' +
    '<path d="M310 152H350V168M310 232V250H350V226"/>' +
    '<rect x="340" y="168" width="20" height="58" rx="3"/>';
  const ligneMoyenne = svgEl("path", {
    d: "M85 85H275V295H85Z",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.4,
    "stroke-dasharray": "6 5",
    opacity: 0.7,
  });
  const fluxFleches = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2.4, "stroke-linecap": "round" });
  const courants = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round" });
  const points = svgEl("g", { fill: "currentColor", stroke: "none" });
  points.innerHTML = '<circle cx="56" cy="136" r="4.5"/><circle cx="306" cy="138" r="4.5"/><circle cx="24" cy="152" r="3.5"/><circle cx="24" cy="250" r="3.5"/>';
  const signes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 15, "font-weight": 700 });
  const axes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.55 });
  let traits = "M" + T0 + " " + YV + "H" + (T1 + 8) + "M" + T0 + " " + (YV + DV + 6) + "V" + (YV - DV - 6);
  traits += "M" + T0 + " " + YI + "H" + (T1 + 8) + "M" + T0 + " " + (YI + DI + 6) + "V" + (YI - DI - 6);
  for (const d of [90, 180, 270, 360]) traits += "M" + versT(d) + " " + (YV - 4) + "v8M" + versT(d) + " " + (YI - 4) + "v8";
  axes.innerHTML = '<path d="' + traits + '"/>';
  const piste = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1, opacity: 0.3, d: "M" + T0 + " " + YP + "H" + T1 });
  const courbeV1 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.4 });
  const courbeV2 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-dasharray": "7 5" });
  const courbePhi = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-dasharray": "2 3" });
  const courbeI1 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3 });
  const courbeMI2 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-dasharray": "7 5" });
  const courbeIm = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-dasharray": "2 3" });
  const curseurT = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, "stroke-dasharray": "4 4", opacity: 0.85 });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  const libellesFixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  libellesFixes.innerHTML =
    texte(150, 40, "Φ commun") +
    texte(10, 345, "N1 = 600") +
    texte(10, 361, "400 V, 50 Hz") +
    texte(364, 202, "R") +
    texte(T0 + 6, YV - DV - 10, "v1 plein, v2 tirets, Φ pointillés") +
    texte(T0 + 6, YI - DI - 10, "i1 épais, m i2 tirets, i_m pointillés") +
    texte(versT(180) - 14, YV + 18, "180°") +
    texte(versT(360) - 16, YV + 18, "360°") +
    texte(versT(180) - 14, YI + 18, "180°") +
    texte(versT(360) - 16, YI + 18, "360°") +
    texte(T0, YP + 22, "poignée : instant ωt");
  svg.append(defs, noyau, ligneMoyenne, bobinages, fluxFleches, courants, points, signes, axes, piste, courbePhi, courbeV2, courbeV1, courbeIm, courbeMI2, courbeI1, curseurT, libellesFixes, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#d-anim-valeurs", [
    { id: "phase", libelle: "Instant ωt", unite: "°", decimales: 0 },
    { id: "v1", libelle: "v1", unite: "V", decimales: 1 },
    { id: "v2", libelle: "v2", unite: "V", decimales: 1 },
    { id: "phi", libelle: "Flux Φ", unite: "mWb", decimales: 3 },
    { id: "i1", libelle: "i1", unite: "A", decimales: 3 },
    { id: "i2", libelle: "i2", unite: "A", decimales: 3 },
    { id: "at", libelle: "N1 i1 - N2 i2", unite: "A", decimales: 2 },
    { id: "phiC", libelle: "Flux crête", unite: "mWb", decimales: 3 },
    { id: "u2", libelle: "U2 efficace", unite: "V", decimales: 1 },
    { id: "i1e", libelle: "I1 efficace", unite: "A", decimales: 3 },
    { id: "p", libelle: "P1 = P2", unite: "W", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  let echV = 600;
  let echI = 10;

  function grandeurs(theta) {
    const m = etat.N2 / EX.N1;
    const v1 = RAC2 * EX.U1 * Math.cos(theta);
    const v2 = m * v1;
    const phi = phiCrete * Math.sin(theta);
    const i2 = RAC2 * etat.I2 * Math.cos(theta);
    const im = RAC2 * etat.Im * Math.sin(theta);
    const i1 = m * i2 + im;
    return { m, v1, v2, phi, i2, im, i1 };
  }

  function tracer() {
    const m = etat.N2 / EX.N1;
    echV = Math.max(RAC2 * EX.U1, RAC2 * EX.U1 * m) * 1.08;
    echI = Math.max(0.1, RAC2 * Math.hypot(m * etat.I2, etat.Im) * 1.12, RAC2 * etat.Im * 1.12);
    const yV = (v) => YV - (DV * v) / echV;
    const yI = (i) => YI - (DI * i) / echI;
    const pV1 = [];
    const pV2 = [];
    const pPhi = [];
    const pI1 = [];
    const pMI2 = [];
    const pIm = [];
    for (let k = 0; k <= 180; k += 1) {
      const deg = k * 2;
      const g = grandeurs(deg * DEG);
      const x = versT(deg).toFixed(1);
      pV1.push(x + " " + yV(g.v1).toFixed(1));
      pV2.push(x + " " + yV(g.v2).toFixed(1));
      pPhi.push(x + " " + (YV - (DV * 0.8 * g.phi) / phiCrete).toFixed(1));
      pI1.push(x + " " + yI(g.i1).toFixed(1));
      pMI2.push(x + " " + yI(g.m * g.i2).toFixed(1));
      pIm.push(x + " " + yI(g.im).toFixed(1));
    }
    courbeV1.setAttribute("d", "M" + pV1.join(" L"));
    courbeV2.setAttribute("d", "M" + pV2.join(" L"));
    courbePhi.setAttribute("d", "M" + pPhi.join(" L"));
    courbeI1.setAttribute("d", "M" + pI1.join(" L"));
    courbeMI2.setAttribute("d", "M" + pMI2.join(" L"));
    courbeIm.setAttribute("d", "M" + pIm.join(" L"));
  }

  function fleche(x0, y0, x1, y1) {
    return '<path d="' + segment(x0, y0, x1, y1) + '" marker-end="url(#fl-d-anim)"/>';
  }

  function dessinerInstant() {
    const theta = etat.phase * DEG;
    const g = grandeurs(theta);
    const rel = g.phi / phiCrete;
    const sens = rel >= 0 ? 1 : -1;
    const opacite = Math.max(0.08, Math.abs(rel));
    fluxFleches.setAttribute("opacity", opacite.toFixed(2));
    fluxFleches.innerHTML =
      fleche(85, 205 + 15 * sens, 85, 205 - 15 * sens) +
      fleche(180 - 15 * sens, 85, 180 + 15 * sens, 85) +
      fleche(275, 205 - 15 * sens, 275, 205 + 15 * sens) +
      fleche(180 + 15 * sens, 295, 180 - 15 * sens, 295);
    const l1 = (22 * g.i1) / echI;
    const l2 = (22 * g.i2 * g.m) / echI;
    let contenu = "";
    /* i1 positif entre par le point, i2 positif sort par le point : flèches vers la droite. */
    if (Math.abs(l1) > 1.5) contenu += l1 > 0 ? fleche(26, 152, 26 + l1, 152) : fleche(48, 152, 48 + l1, 152);
    if (Math.abs(l2) > 1.5) contenu += l2 > 0 ? fleche(312, 152, 312 + l2, 152) : fleche(346, 152, 346 + l2, 152);
    courants.innerHTML = contenu;
    const haut = g.v1 >= 0 ? "+" : "-";
    const bas = g.v1 >= 0 ? "-" : "+";
    signes.innerHTML =
      texte(6, 158, haut) + texte(6, 262, bas) + texte(360, 152, haut) + texte(360, 268, bas);
    const xt = versT(etat.phase);
    curseurT.setAttribute("d", "M" + xt.toFixed(1) + " " + (YV - DV - 4) + "V" + (YI + DI + 4));
    libelles.innerHTML =
      texte(26, 142, "i1") +
      texte(318, 144, "i2") +
      texte(200, 345, "N2 = " + nombre(api, etat.N2, 0)) +
      texte(200, 361, "m = " + nombre(api, g.m, 3));
    if (valeurs) {
      valeurs.maj({
        phase: etat.phase,
        v1: g.v1,
        v2: g.v2,
        phi: g.phi * 1000,
        i1: g.i1,
        i2: g.i2,
        at: EX.N1 * g.i1 - etat.N2 * g.i2,
        phiC: phiCrete * 1000,
        u2: EX.U1 * g.m,
        i1e: Math.hypot(g.m * etat.I2, etat.Im),
        p: EX.U1 * g.m * etat.I2,
      });
    }
  }

  let synchro = false;
  let poignee = null;
  let lecteur = null;
  function appliquer(deg, source) {
    if (synchro) return;
    synchro = true;
    etat.phase = Math.max(0, Math.min(360, Number(deg)));
    dessinerInstant();
    if (source !== "poignee" && poignee) poignee.set(etat.phase, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(etat.phase);
    synchro = false;
  }

  tracer();

  poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: T0, y: YP },
    a: { x: T1, y: YP },
    min: 0,
    max: 360,
    pas: 2,
    valeur: etat.phase,
    unite: "°",
    libelle: "Instant ωt sur l'axe des temps",
    diffuserAuDepart: false,
    rappel(mesure) {
      appliquer(mesure.valeur, "poignee");
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#d-anim-curseurs",
    [
      { id: "N2", libelle: "Spires du secondaire N2", min: 30, max: 1200, pas: 5, valeur: etat.N2, format: (v) => String(Math.round(v)) },
      { id: "I2", libelle: "Courant de la charge I2", min: 0, max: 20, pas: 0.5, valeur: etat.I2, unite: "A" },
      { id: "Im", libelle: "Courant magnétisant I_m", min: 0, max: 0.6, pas: 0.01, valeur: etat.Im, unite: "A" },
    ],
    (lues) => {
      Object.assign(etat, lues);
      tracer();
      dessinerInstant();
    }
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#d-anim-lecteur", {
    de: 0,
    a: 360,
    duree: 8,
    boucle: true,
    auto: false,
    libelle: "Une période de la tension du réseau",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  appliquer(40, null);
}

/* --------------------------------------------------------------------------
   E. Animation : essai de polarité au voltmètre
   -------------------------------------------------------------------------- */

function construireEssai(racine, api) {
  const conteneur = racine.querySelector("#e-essai");
  if (!conteneur) return;

  const etat = { U1: 400, m: 0.575, cablage: 0, phase: 60 };
  const O = { x: 470, y: 190 };
  const R = 110;
  const AXE1 = 625;
  const AXE2 = 690;

  const svg = svgEl("svg", {
    viewBox: "0 0 720 380",
    role: "img",
    "aria-label": "Essai de polarité : montage avec pont entre A2 et a2 et voltmètre entre A1 et a1, et diagramme de Fresnel des tensions V1, V2 et de la tension mesurée",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-e-essai");
  const montage = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" });
  montage.innerHTML =
    '<path d="M120 100c18 0 18 24 0 24c18 0 18 24 0 24c18 0 18 24 0 24c18 0 18 24 0 24"/>' +
    '<path d="M200 100c-18 0 -18 24 0 24c-18 0 -18 24 0 24c-18 0 -18 24 0 24c-18 0 -18 24 0 24"/>' +
    '<path d="M152 94V202M168 94V202"/>' +
    '<circle cx="40" cy="148" r="20"/><path d="M31 148c4 -7 7 -7 9 0s5 7 9 0"/>' +
    '<path d="M40 128V100H120M40 168V196H120"/>' +
    '<path d="M200 100H260M200 196H260"/>' +
    '<path d="M90 196V250H260V196"/>' +
    '<path d="M90 100V44H164M196 44H260V100"/>' +
    '<circle cx="180" cy="44" r="16"/>';
  const bornes = svgEl("g", { fill: "currentColor", stroke: "none" });
  bornes.innerHTML = '<circle cx="90" cy="100" r="3.5"/><circle cx="90" cy="196" r="3.5"/><circle cx="260" cy="100" r="3.5"/><circle cx="260" cy="196" r="3.5"/><circle cx="108" cy="90" r="5"/>';
  const pointSec = svgEl("circle", { r: 5, fill: "currentColor" });
  const axes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.55 });
  axes.innerHTML =
    '<path d="M' + (O.x - R - 20) + " " + O.y + "H" + (O.x + R + 20) + "M" + O.x + " " + (O.y + R + 20) + "V" + (O.y - R - 20) + '"/>' +
    '<circle cx="' + O.x + '" cy="' + O.y + '" r="' + R + '" stroke-dasharray="2 4"/>' +
    '<path d="M' + AXE1 + " " + (O.y - R - 10) + "V" + (O.y + R + 10) + "M" + AXE2 + " " + (O.y - R - 10) + "V" + (O.y + R + 10) + '"/>';
  const vecV1 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 9, "stroke-linecap": "round", opacity: 0.32 });
  const vecV2 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "stroke-dasharray": "7 5", "marker-end": "url(#fl-e-essai)" });
  const vecMes = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.4, "marker-end": "url(#fl-e-essai)" });
  const projections = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1, "stroke-dasharray": "2 3", opacity: 0.9 });
  const barre = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 6, "stroke-linecap": "butt", opacity: 0.75 });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  const libellesFixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  libellesFixes.innerHTML =
    texte(64, 94, "A1") +
    texte(64, 214, "A2") +
    texte(266, 94, "a1") +
    texte(266, 214, "a2") +
    texte(175, 48, "V") +
    texte(150, 268, "pont A2 - a2") +
    texte(6, 152, "U1") +
    texte(20, 24, "voltmètre entre A1 et a1") +
    texte(40, 300, "point du primaire : A1") +
    texte(O.x - 60, 26, "phaseurs des tensions") +
    texte(AXE1 - 14, O.y + R + 28, "v1, v2") +
    texte(AXE2 - 20, O.y + R + 28, "v mes") +
    texte(380, 370, "poignée : extrémité de V1, instant ωt");
  svg.append(defs, montage, bornes, pointSec, axes, projections, barre, vecV2, vecV1, vecMes, libellesFixes, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-essai-valeurs", [
    { id: "v1", libelle: "V1 efficace", unite: "V", decimales: 1 },
    { id: "v2", libelle: "V2 efficace", unite: "V", decimales: 1 },
    { id: "vm", libelle: "Lecture du voltmètre", unite: "V", decimales: 1 },
    { id: "type", libelle: "Polarité", format: (v) => (v < 0.5 ? "soustractive" : "additive") },
    { id: "phase", libelle: "Instant ωt", unite: "°", decimales: 0 },
    { id: "i1", libelle: "v1 instantanée", unite: "V", decimales: 1 },
    { id: "im", libelle: "v mesurée instantanée", unite: "V", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const theta = etat.phase * DEG;
    const signe = etat.cablage < 0.5 ? 1 : -1;
    const x1 = O.x + R * Math.cos(theta);
    const y1 = O.y - R * Math.sin(theta);
    const x2 = O.x + signe * etat.m * R * Math.cos(theta);
    const y2 = O.y - signe * etat.m * R * Math.sin(theta);
    vecV1.setAttribute("d", segment(O.x, O.y, x1, y1));
    vecV2.setAttribute("d", segment(O.x, O.y, x2, y2));
    /* Cote de la tension mesurée, décalée de 12 px perpendiculairement aux phaseurs. */
    const dx = -12 * Math.sin(theta);
    const dy = -12 * Math.cos(theta);
    vecMes.setAttribute("d", segment(x2 + dx, y2 + dy, x1 + dx, y1 + dy));
    pointSec.setAttribute("cx", 212);
    pointSec.setAttribute("cy", signe > 0 ? 90 : 206);
    const ech = R / (1 + etat.m);
    const yMes = O.y - (1 - signe * etat.m) * ech * Math.sin(theta);
    projections.setAttribute(
      "d",
      "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "H" + (AXE1 + 6) + "M" + x2.toFixed(1) + " " + y2.toFixed(1) + "H" + (AXE1 + 6)
    );
    barre.setAttribute("d", "M" + AXE2 + " " + O.y + "V" + yMes.toFixed(1));
    libelles.innerHTML =
      texte(x1 + (Math.cos(theta) >= 0 ? 8 : -30), y1 - 8, "V1") +
      texte(x2 + (signe * Math.cos(theta) >= 0 ? 8 : -30), y2 + 16, "V2") +
      texte(AXE1 + 8, y1 + 4, "v1") +
      texte(AXE1 + 8, y2 + 4, "v2") +
      texte(20, 330, "U1 = " + nombre(api, etat.U1, 0) + " V ; m = " + nombre(api, etat.m, 3)) +
      texte(20, 348, etat.cablage < 0.5 ? "réel : a1 homologue de A1" : "réel : a2 homologue de A1");
    if (valeurs) {
      const v1i = RAC2 * etat.U1 * Math.sin(theta);
      valeurs.maj({
        v1: etat.U1,
        v2: etat.U1 * etat.m,
        vm: etat.U1 * (1 - signe * etat.m),
        type: etat.cablage,
        phase: etat.phase,
        i1: v1i,
        im: v1i * (1 - signe * etat.m),
      });
    }
  }

  let synchro = false;
  let poignee = null;
  let lecteur = null;
  function appliquer(deg, source) {
    if (synchro) return;
    synchro = true;
    etat.phase = ((Number(deg) % 360) + 360) % 360;
    dessiner();
    if (source !== "poignee" && poignee) poignee.set(etat.phase, false);
    if (source !== "lecteur" && lecteur) lecteur.suivre(etat.phase);
    synchro = false;
  }

  poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: { x: O.x, y: O.y },
    rayon: R,
    valeur: etat.phase,
    pas: 5,
    libelle: "Instant ωt : rotation des phaseurs",
    diffuserAuDepart: false,
    rappel(mesure) {
      appliquer(mesure.angle, "poignee");
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-essai-curseurs",
    [
      { id: "U1", libelle: "Tension d'essai U1", min: 50, max: 400, pas: 10, valeur: etat.U1, unite: "V" },
      { id: "m", libelle: "Rapport m = N2/N1", min: 0.02, max: 1, pas: 0.005, valeur: etat.m, format: (v) => nombre(api, v, 3) },
      {
        id: "cablage",
        libelle: "Câblage réel du secondaire",
        min: 0,
        max: 1,
        pas: 1,
        valeur: etat.cablage,
        format: (v) => (v < 0.5 ? "a1 homologue de A1" : "a2 homologue de A1"),
      },
    ],
    (lues) => {
      Object.assign(etat, lues);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#e-essai-lecteur", {
    de: 0,
    a: 360,
    duree: 8,
    boucle: true,
    auto: false,
    libelle: "Rotation des phaseurs sur une période",
    rappel: (valeur) => appliquer(valeur, "lecteur"),
  });
  if (lecteur) ressources.push(lecteur);

  appliquer(60, null);
}

/* --------------------------------------------------------------------------
   E. Simulation : adaptation d'une charge par le rapport
   -------------------------------------------------------------------------- */

function construireSimAdaptation(racine, api) {
  const etat = { E: 230, Rs: 0.5, RL: 20, a: 5 };

  function bilan(a) {
    const rl = etat.RL * 1e-3;
    const rlp = rl * a * a;
    const i1 = etat.E / (etat.Rs + rlp);
    return { rlp, i1, i2: i1 * a, p: i1 * i1 * rlp, eta: rlp / (etat.Rs + rlp) };
  }

  const trace = api.sim.traceur("#e-sim-adaptation-trace", {
    titre: "Puissance utile et rendement en fonction de N1/N2",
    xTitre: "rapport N1/N2",
    yTitre: "pour cent",
    yUnite: "%",
    xMin: 1,
    xMax: 15,
    yMin: 0,
    yMax: 105,
    series: [
      { id: "p", nom: "puissance reçue / maximum", couleur: "serie-1", epaisseur: 2.8, fonction: () => 0 },
      { id: "eta", nom: "rendement de la transmission", couleur: "serie-5", epaisseur: 2, fonction: () => 0 },
    ],
    surDessin({ c, repere, couleurs }) {
      const opt = Math.sqrt(etat.Rs / (etat.RL * 1e-3));
      if (Math.abs(etat.a - opt) < 0.04 * opt) {
        ligneV(c, repere, couleurs, etat.a, "réglé = optimum");
      } else {
        ligneV(c, repere, couleurs, opt, "optimum " + nombre(api, opt, 2), [2, 3]);
        ligneV(c, repere, couleurs, etat.a, "réglé " + nombre(api, etat.a, 1));
      }
      const b = bilan(etat.a);
      const pMax = (etat.E * etat.E) / (4 * etat.Rs);
      const y = (100 * b.p) / pMax;
      pointTrace(c, repere, couleurs, etat.a, y, null);
      c.save();
      c.fillStyle = couleurs.texte;
      c.font = POLICE;
      c.textAlign = "left";
      c.fillText(nombre(api, y, 0) + " %", repere.versX(etat.a) + 8, repere.versY(y) + 16);
      c.restore();
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#e-sim-adaptation-valeurs", [
    { id: "rlp", libelle: "Charge vue du primaire RL'", unite: "Ω", decimales: 3 },
    { id: "i1", libelle: "Courant primaire", unite: "A", decimales: 1 },
    { id: "i2", libelle: "Courant secondaire", unite: "A", decimales: 0 },
    { id: "p", libelle: "Puissance reçue par la charge", unite: "kW", decimales: 2 },
    { id: "eta", libelle: "Rendement", unite: "%", decimales: 1 },
    { id: "opt", libelle: "Rapport optimal", decimales: 2 },
    { id: "direct", libelle: "Sans transformateur", unite: "kW", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    const opt = Math.sqrt(etat.Rs / (etat.RL * 1e-3));
    const xMax = Math.min(40, Math.max(15, opt * 2, etat.a * 1.1));
    const pMax = (etat.E * etat.E) / (4 * etat.Rs);
    if (trace) {
      trace.definirPlage({ xMin: 1, xMax, yMin: 0, yMax: 105 });
      trace.definirFonction("p", (a) => (100 * bilan(a).p) / pMax);
      trace.definirFonction("eta", (a) => 100 * bilan(a).eta);
    }
    const b = bilan(etat.a);
    const rl = etat.RL * 1e-3;
    if (valeurs) {
      valeurs.maj({
        rlp: b.rlp,
        i1: b.i1,
        i2: b.i2,
        p: b.p / 1000,
        eta: b.eta * 100,
        opt,
        direct: (Math.pow(etat.E / (etat.Rs + rl), 2) * rl) / 1000,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-sim-adaptation-curseurs",
    [
      { id: "E", libelle: "Force électromotrice E", min: 50, max: 400, pas: 5, valeur: etat.E, unite: "V" },
      { id: "Rs", libelle: "Résistance de la source Rs", min: 0.05, max: 2, pas: 0.01, valeur: etat.Rs, unite: "Ω" },
      { id: "RL", libelle: "Résistance de la charge RL", min: 5, max: 100, pas: 1, valeur: etat.RL, unite: "mΩ" },
      { id: "a", libelle: "Rapport N1/N2", min: 1, max: 30, pas: 0.1, valeur: etat.a, format: (v) => nombre(api, v, 1) },
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
   H. Animation : bilan des ampères-tours en phaseurs
   -------------------------------------------------------------------------- */

function construirePhaseurs(racine, api) {
  const conteneur = racine.querySelector("#h-phaseurs");
  if (!conteneur) return;

  const etat = { s2: 2300, p3: 120, angle: -36.87 };
  const O = { x: 80, y: 210 };
  const K = 36;
  const DIAL = { x: 600, y: 210, r: 66 };

  const svg = svgEl("svg", {
    viewBox: "0 0 720 440",
    role: "img",
    "aria-label": "Diagramme de Fresnel des courants ramenés au primaire et cadran de réglage de l'angle du courant de l'atelier",
  });
  const defs = svgEl("defs");
  defs.innerHTML = marqueur("fl-h-ph");
  const axes = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1.1, opacity: 0.55 });
  axes.innerHTML =
    '<path d="M' + (O.x - 30) + " " + O.y + "H" + 450 + "M" + O.x + " " + 10 + "V" + 430 + '"/>' +
    '<circle cx="' + DIAL.x + '" cy="' + DIAL.y + '" r="' + DIAL.r + '"/>' +
    '<path d="M' + (DIAL.x - DIAL.r - 10) + " " + DIAL.y + "H" + (DIAL.x + DIAL.r + 10) + '"/>';
  const graduations = svgEl("g", { fill: "none", stroke: "currentColor", "stroke-width": 1, opacity: 0.55 });
  let grad = "";
  for (let a = 1; a <= 7; a += 1) grad += "M" + (O.x + a * K) + " " + (O.y - 4) + "v8";
  graduations.innerHTML = '<path d="' + grad + '"/>';
  const vecV = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.4, "marker-end": "url(#fl-h-ph)", d: segment(O.x, O.y, 440, O.y) });
  const vecA = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "stroke-dasharray": "7 5", "marker-end": "url(#fl-h-ph)" });
  const vecB = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "stroke-dasharray": "2 3", "marker-end": "url(#fl-h-ph)" });
  const vecI1 = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3.4, "marker-end": "url(#fl-h-ph)" });
  const arc = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.2 });
  const rayon = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 2.2, "marker-end": "url(#fl-h-ph)" });
  const libelles = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  const libellesFixes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12 });
  libellesFixes.innerHTML =
    texte(350, O.y - 10, "V1, référence") +
    texte(O.x + K - 10, O.y - 10, "1 A") +
    texte(O.x + 5 * K - 10, O.y - 10, "5 A") +
    texte(DIAL.x - 110, DIAL.y - DIAL.r - 16, "angle du courant de l'atelier") +
    texte(DIAL.x + DIAL.r + 4, DIAL.y + 16, "0°") +
    texte(DIAL.x - 30, DIAL.y + DIAL.r + 22, "inductif") +
    texte(DIAL.x - 34, DIAL.y - DIAL.r + 30, "capacitif") +
    texte(486, 420, "poignée : direction de I2");
  svg.append(defs, axes, graduations, vecV, arc, vecA, vecB, vecI1, rayon, libellesFixes, libelles);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#h-phaseurs-valeurs", [
    { id: "phi2", libelle: "φ2 de l'atelier", unite: "°", decimales: 1 },
    { id: "cos2", libelle: "cos φ2", decimales: 3 },
    { id: "i1", libelle: "Courant primaire I1", unite: "A", decimales: 3 },
    { id: "phi1", libelle: "Argument de I1", unite: "°", decimales: 2 },
    { id: "cos1", libelle: "cos φ1 vu du réseau", decimales: 3 },
    { id: "p", libelle: "P1 = P2 + P3", unite: "W", decimales: 0 },
    { id: "q", libelle: "Q1 = Q2", unite: "var", decimales: 0 },
    { id: "s", libelle: "S1", unite: "VA", decimales: 0 },
    { id: "arith", libelle: "Somme arithmétique", unite: "A", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const b = bilanExemple(etat.s2, etat.p3, etat.angle);
    const ax = O.x + K * b.a.re;
    const ay = O.y - K * b.a.im;
    const bx = ax + K * b.b.re;
    const by = ay - K * b.b.im;
    vecA.setAttribute("d", segment(O.x, O.y, ax, ay));
    vecB.setAttribute("d", b.b.re > 0.02 ? segment(ax, ay, bx, by) : "");
    vecI1.setAttribute("d", segment(O.x, O.y, bx, by));
    const r = 46;
    const ph = b.phase * DEG;
    const xa = O.x + r * Math.cos(ph);
    const ya = O.y - r * Math.sin(ph);
    arc.setAttribute("d", "M" + (O.x + r) + " " + O.y + "A" + r + " " + r + " 0 0 " + (ph < 0 ? 1 : 0) + " " + xa.toFixed(1) + " " + ya.toFixed(1));
    const t = etat.angle * DEG;
    rayon.setAttribute("d", segment(DIAL.x, DIAL.y, DIAL.x + (DIAL.r - 8) * Math.cos(t), DIAL.y - (DIAL.r - 8) * Math.sin(t)));
    /* Étiquette de m2 I2 sur le côté du vecteur opposé à I1, étiquette de I1 au-delà de sa pointe. */
    const la = Math.hypot(ax - O.x, ay - O.y) || 1;
    let nx = (ay - O.y) / la;
    let ny = -(ax - O.x) / la;
    if ((bx - O.x) * nx + (by - O.y) * ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const li = Math.hypot(bx - O.x, by - O.y) || 1;
    libelles.innerHTML =
      texte((O.x + ax) / 2 + 22 * nx - 20, (O.y + ay) / 2 + 22 * ny + 4, "m2 I2") +
      (b.b.re > 0.02 ? texte(bx + 10, by - 12, "m3 I3") : "") +
      texte(bx + (18 * (bx - O.x)) / li - 30, by + (18 * (by - O.y)) / li + 14, "I1 = " + nombre(api, b.module, 2) + " A") +
      texte(O.x + 64 * Math.cos(ph / 2) - 6, O.y - 64 * Math.sin(ph / 2) + 4, "φ1");
    if (valeurs) {
      valeurs.maj({
        phi2: -etat.angle,
        cos2: Math.cos(etat.angle * DEG),
        i1: b.module,
        phi1: b.phase,
        cos1: Math.cos(b.phase * DEG),
        p: b.P,
        q: b.Q,
        s: b.S,
        arith: b.arith,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: { x: DIAL.x, y: DIAL.y },
    rayon: DIAL.r,
    min: -90,
    max: 60,
    boucle: false,
    pas: 1,
    valeur: etat.angle,
    libelle: "Angle du courant de l'atelier par rapport à sa tension",
    diffuserAuDepart: false,
    rappel(mesure) {
      let angle = mesure.angle;
      if (angle > 180) angle -= 360;
      etat.angle = Math.max(-90, Math.min(60, angle));
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#h-phaseurs-curseurs",
    [
      { id: "s2", libelle: "Puissance apparente de l'atelier", min: 200, max: 2500, pas: 50, valeur: etat.s2, unite: "VA" },
      { id: "p3", libelle: "Puissance de la charge 24 V", min: 0, max: 300, pas: 10, valeur: etat.p3, unite: "W" },
    ],
    (lues) => {
      etat.s2 = lues.s2;
      etat.p3 = lues.p3;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  dessiner();
}

/* --------------------------------------------------------------------------
   I. Simulation : prises du transformateur du poste
   -------------------------------------------------------------------------- */

function construireSimPrises(racine, api) {
  const etat = { uHta: 20.8, prise: 2, s: 66.5 };

  const trace = api.sim.traceur("#i-sim-prises-trace", {
    titre: "Tension secondaire à vide selon la prise",
    xTitre: "tension HTA",
    xUnite: "kV",
    yTitre: "U2 à vide",
    yUnite: "V",
    xMin: 19,
    xMax: 22,
    yMin: 360,
    yMax: 470,
    series: PRISES.map((p, rang) => ({
      id: "p" + rang,
      nom: "prise " + (p > 0 ? "+" : "") + nombre(api, p, 1) + " %",
      couleur: "serie-" + (rang + 1),
      epaisseur: rang === 2 ? 2.6 : 1.8,
      fonction: (u) => tensionPoste(u * 1000, p),
    })),
    surDessin({ c, repere, couleurs }) {
      ligneH(c, repere, couleurs, 410, "410 V", true);
      ligneV(c, repere, couleurs, etat.uHta, nombre(api, etat.uHta, 2) + " kV", [2, 3]);
      const u2 = tensionPoste(etat.uHta * 1000, PRISES[etat.prise]);
      pointTrace(c, repere, couleurs, etat.uHta, u2, nombre(api, u2, 1) + " V");
    },
  });
  if (trace) ressources.push(trace);

  const valeurs = api.sim.valeurs("#i-sim-prises-valeurs", [
    { id: "u2", libelle: "U2 composée à vide", unite: "V", decimales: 1 },
    { id: "ecart", libelle: "Écart à 410 V", unite: "%", decimales: 2 },
    { id: "m", libelle: "Rapport effectif m", decimales: 5 },
    { id: "b", libelle: "Induction relative", unite: "%", decimales: 1 },
    { id: "i1", libelle: "Courant HTA I1", unite: "A", decimales: 3 },
    { id: "i2", libelle: "Courant BT I2", unite: "A", decimales: 1 },
    { id: "z", libelle: "Charge vue de la HTA, par phase", unite: "Ω", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function maj() {
    const p = PRISES[etat.prise];
    const uh = etat.uHta * 1000;
    const u2 = tensionPoste(uh, p);
    const m = POSTE.U2 / POSTE.U1 / (1 + p / 100);
    const s = etat.s * 1000;
    const i1 = s / (RAC3 * uh);
    const i2 = s > 0 ? s / (RAC3 * u2) : 0;
    if (trace) trace.rafraichir();
    if (valeurs) {
      valeurs.maj({
        u2,
        ecart: (u2 / 410 - 1) * 100,
        m,
        b: ((uh / POSTE.U1) / (1 + p / 100)) * 100,
        i1,
        i2,
        z: s > 0 ? (uh * uh) / s : NaN,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-sim-prises-curseurs",
    [
      { id: "uHta", libelle: "Tension HTA du réseau", min: 19, max: 22, pas: 0.05, valeur: etat.uHta, unite: "kV" },
      {
        id: "prise",
        libelle: "Prise du régleur",
        min: 0,
        max: 4,
        pas: 1,
        valeur: etat.prise,
        format: (v) => {
          const p = PRISES[Math.round(v)];
          return (p > 0 ? "+" : "") + nombre(api, p, 1) + " %";
        },
      },
      { id: "s", libelle: "Charge du site", min: 0, max: 100, pas: 0.5, valeur: etat.s, unite: "kVA" },
    ],
    (lues) => {
      etat.uHta = lues.uHta;
      etat.prise = Math.round(lues.prise);
      etat.s = lues.s;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

const DESSIN_DEUX_SEC =
  '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<path d="M80 40c16 0 16 22 0 22c16 0 16 22 0 22c16 0 16 22 0 22c16 0 16 22 0 22c16 0 16 22 0 22"/>' +
  '<path d="M106 34V156M120 34V156"/>' +
  '<path d="M146 40c-16 0 -16 22 0 22c-16 0 -16 22 0 22"/><path d="M146 106c-16 0 -16 22 0 22"/>' +
  '<path d="M80 40H30M80 150H30M146 40H200M146 84H200M146 106H200M146 128H200"/></g>' +
  '<g fill="currentColor" stroke="none"><circle cx="70" cy="32" r="4"/><circle cx="156" cy="32" r="4"/><circle cx="156" cy="98" r="4"/></g>' +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
  '<text x="4" y="100">230 V</text><text x="206" y="66">110 V, 2 A</text><text x="206" y="122">24 V, 3 A</text></g>';

const DESSIN_QUIZ_POLARITE =
  '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<path d="M180 50c20 0 20 30 0 30c20 0 20 30 0 30c20 0 20 30 0 30c20 0 20 30 0 30"/>' +
  '<path d="M300 50c-20 0 -20 30 0 30c-20 0 -20 30 0 30c-20 0 -20 30 0 30c-20 0 -20 30 0 30"/>' +
  '<path d="M232 44V176M248 44V176"/>' +
  '<path d="M180 50H100M180 170H100M300 50H400M300 170H400"/></g>' +
  '<g fill="none" stroke="currentColor" stroke-width="1.6"><path d="M110 50H150" marker-end="url(#fl-q-pol)"/></g>' +
  '<g fill="currentColor" stroke="none"><circle cx="166" cy="40" r="5"/><circle cx="314" cy="182" r="5"/>' +
  '<circle cx="400" cy="50" r="4"/><circle cx="400" cy="170" r="4"/></g>' +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
  '<text x="116" y="40">i1</text><text x="410" y="54">borne haute</text><text x="410" y="174">borne basse</text></g>';

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-courants-plaque",
      titre: "Courants assignés d'un transformateur de commande",
      niveau: "fondamental",
      enonce:
        "<p>Un transformateur monophasé de commande porte la plaque $60\\ \\mathrm{VA}$, $230\\ \\mathrm{V} / 12\\ \\mathrm{V}$. On le " +
        "suppose idéal. Quel est son courant primaire assigné, en ampères ? Quel est son courant secondaire assigné ?</p>",
      valeur: 60 / 230,
      unite: "A",
      tolerance: 0.015,
      chiffres: 3,
      libelleChamp: "Courant primaire $I_{1n}$",
      etapes: [
        { texte: "Puissance apparente conservée : $S_n = U_{1n}I_{1n} = U_{2n}I_{2n}$." },
        { texte: "$I_{1n} = 60/230 = 0{,}261\\ \\mathrm{A}$ ; $I_{2n} = 60/12 = 5\\ \\mathrm{A}$." },
        {
          texte: "Contrôle : $m = 12/230 = 0{,}0522$ et $I_{1n} = mI_{2n} = 0{,}0522 \\times 5 = 0{,}261\\ \\mathrm{A}$.",
          note: "Le courant est plus fort du côté de la tension la plus faible : le bobinage $12\\ \\mathrm{V}$ est en fil plus gros.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        barresCorrection(
          moteur,
          conteneur,
          { titre: "Tension et courant de chaque côté", xTitre: "grandeur", yTitre: "valeur", unite: "" },
          [
            { etiquette: "U1 / 100 (V)", valeur: 2.3 },
            { etiquette: "I1 (A)", valeur: 0.261 },
            { etiquette: "U2 / 100 (V)", valeur: 0.12 },
            { etiquette: "I2 (A)", valeur: 5 },
          ]
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-impedance-ramenee",
      titre: "Impédance ramenée au primaire",
      niveau: "fondamental",
      enonce:
        "<p>Un transformateur idéal $400\\ \\mathrm{V} / 100\\ \\mathrm{V}$ alimente au secondaire une résistance de $4\\ \\Omega$. Quelle " +
        "résistance voit la source raccordée au primaire, en ohms ?</p>",
      valeur: 64,
      unite: "Ω",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Résistance vue du primaire",
      etapes: [
        { texte: "$m = 100/400 = 0{,}25$ ; l'impédance ramenée au primaire vaut $Z_2/m^2$." },
        { texte: "$4/0{,}25^2 = 4/0{,}0625 = 64\\ \\Omega$." },
        {
          texte: "Contrôle par les courants : $I_2 = 100/4 = 25\\ \\mathrm{A}$, $I_1 = 0{,}25 \\times 25 = 6{,}25\\ \\mathrm{A}$, et $400/6{,}25 = 64\\ \\Omega$.",
          note: "Avec $m$ au lieu de $m^2$, on aurait trouvé $16\\ \\Omega$ : quatre fois trop peu.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Résistance vue du primaire en fonction du rapport m",
          xTitre: "m",
          yTitre: "R vue",
          yUnite: "Ω",
          xMin: 0.1,
          xMax: 1,
          yMin: 0,
          yMax: 160,
          series: [{ id: "r", nom: "4 / m²", couleur: "serie-1", epaisseur: 2.6, fonction: (m) => 4 / (m * m) }],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 0.25, "m = 0,25");
            pointTrace(c, repere, couleurs, 0.25, 64, "64 Ω");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-deux-secondaires",
      titre: "Courant primaire avec deux secondaires",
      niveau: "intermédiaire",
      enonce:
        "<p>Un transformateur idéal de primaire $230\\ \\mathrm{V}$ porte deux secondaires : $110\\ \\mathrm{V}$ débitant $2\\ \\mathrm{A}$ " +
        "dans une charge résistive, et $24\\ \\mathrm{V}$ débitant $3\\ \\mathrm{A}$ sous $\\cos\\varphi = 0{,}6$ inductif. Quel est le " +
        "courant primaire efficace, en ampères ?</p>" +
        '<svg viewBox="0 0 300 170" role="img" aria-label="Transformateur à un primaire de 230 V et deux secondaires de 110 V et 24 V" style="max-width:300px">' +
        DESSIN_DEUX_SEC +
        "</svg>",
      valeur: 1.17143,
      unite: "A",
      tolerance: 0.015,
      chiffres: 3,
      libelleChamp: "Courant primaire $I_1$",
      etapes: [
        { texte: "Méthode : bilan des ampères-tours en phaseurs, $\\underline{I}_1 = m_a\\underline{I}_a + m_b\\underline{I}_b$, avec $\\underline{V}_1$ comme référence." },
        { texte: "$m_a = 110/230 = 0{,}4783$, $m_a I_a = 0{,}9565\\ \\mathrm{A}$ à $0^\\circ$." },
        { texte: "$m_b = 24/230 = 0{,}1043$, $m_b I_b = 0{,}3130\\ \\mathrm{A}$ à $-53{,}13^\\circ$, soit $0{,}1878 - j0{,}2504\\ \\mathrm{A}$." },
        { texte: "Somme : $1{,}1443 - j0{,}2504\\ \\mathrm{A}$, de module $1{,}171\\ \\mathrm{A}$, à $-12{,}34^\\circ$." },
        {
          texte: "Contrôle : $\\underline{S}_1 = 230 \\times (1{,}1443 + j0{,}2504) = 263{,}2 + j57{,}6\\ \\mathrm{VA}$, égal à $220 + 43{,}2$ W et $57{,}6$ var des charges.",
          note: "La somme arithmétique donnerait $1{,}270\\ \\mathrm{A}$, $8\\ \\%$ de trop.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        schemaCorrection(
          moteur,
          conteneur,
          "0 0 420 200",
          "<defs>" + marqueur("fl-k-sec") + "</defs>" +
            '<g fill="none" stroke="currentColor" stroke-width="1" opacity="0.6"><path d="M30 60H400M50 20V190"/></g>' +
            '<g fill="none" stroke="currentColor" stroke-width="2.2">' +
            '<path d="M50 60H241" stroke-dasharray="7 5" marker-end="url(#fl-k-sec)"/>' +
            '<path d="M241 60L278.6 110.1" stroke-dasharray="2 3" marker-end="url(#fl-k-sec)"/>' +
            '<path d="M50 60L278.6 110.1" stroke-width="3.2" marker-end="url(#fl-k-sec)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
            '<text x="300" y="54">V1, référence</text><text x="110" y="50">0,957 A (110 V)</text><text x="250" y="96">0,313 A</text>' +
            '<text x="100" y="128">I1 = 1,171 A, -12,34°</text><text x="40" y="186">échelle : 200 px par ampère</text></g>',
          "Bilan des ampères-tours : contribution du secondaire 110 V en tirets, contribution du secondaire 24 V en pointillés, somme I1 en trait épais."
        );
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-serie-polarite",
      titre: "Deux secondaires en série qui se retranchent",
      niveau: "intermédiaire",
      enonce:
        "<p>Pour obtenir $36\\ \\mathrm{V}$, un technicien met en série les secondaires $24\\ \\mathrm{V}$ et $12\\ \\mathrm{V}$ d'un " +
        "transformateur de commande, dont le repérage est effacé. Il mesure $12\\ \\mathrm{V}$ aux bornes de l'ensemble. Quelles " +
        "affirmations sont exactes ?</p>",
      options: [
        { texte: "Les deux enroulements sont reliés borne homologue contre borne homologue : leurs tensions se retranchent.", juste: true },
        { texte: "Permuter les deux fils de l'un des deux enroulements donnera $36\\ \\mathrm{V}$.", juste: true },
        { texte: "Le transformateur est défectueux : la moitié des spires du $24\\ \\mathrm{V}$ est en court-circuit." },
        { texte: "La mesure suffit à repérer les bornes homologues des deux secondaires.", juste: true },
        { texte: "Le courant débité dans une charge de $36\\ \\mathrm{V}$ ainsi raccordée serait correct, seule la tension étant fausse." },
      ],
      etapes: [
        { texte: "Les deux tensions sont en phase ou en opposition selon le repérage : $24 + 12 = 36\\ \\mathrm{V}$ ou $24 - 12 = 12\\ \\mathrm{V}$." },
        { texte: "$12\\ \\mathrm{V}$ signe l'opposition : les deux bornes reliées entre elles sont homologues, ou les deux non homologues." },
        { texte: "Inverser un seul enroulement remet les tensions en phase : $36\\ \\mathrm{V}$. Les bornes reliées deviennent alors une borne pointée et une borne non pointée." },
        {
          texte: "Une charge prévue pour $36\\ \\mathrm{V}$ sous $12\\ \\mathrm{V}$ recevrait un courant trois fois trop faible, et une puissance neuf fois trop faible pour une résistance.",
          note: "Une spire en court-circuit ferait chauffer le transformateur à vide : ce n'est pas le symptôme décrit.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Tensions instantanées des deux branchements",
          xTitre: "ωt",
          xUnite: "°",
          yTitre: "tension",
          yUnite: "V",
          xMin: 0,
          xMax: 360,
          yMin: -55,
          yMax: 55,
          series: [
            { id: "add", nom: "en phase : 36 V efficaces", couleur: "serie-1", epaisseur: 2.6, fonction: (d) => 36 * RAC2 * Math.sin(d * DEG) },
            { id: "sous", nom: "en opposition : 12 V efficaces", couleur: "serie-5", epaisseur: 2.2, fonction: (d) => 12 * RAC2 * Math.sin(d * DEG) },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-adaptation",
      titre: "Choisir le rapport d'un transformateur de chauffage",
      niveau: "avancé",
      enonce:
        "<p>Une source $230\\ \\mathrm{V}$ de résistance interne $0{,}5\\ \\Omega$ doit chauffer par effet Joule une pièce de résistance " +
        "$0{,}02\\ \\Omega$, à travers un transformateur supposé idéal. Quel rapport $N_1/N_2$ rend la puissance reçue par la pièce " +
        "maximale ? Calculez ensuite cette puissance, les courants et le rendement, et comparez avec $N_1/N_2 = 10$.</p>",
      valeur: 5,
      unite: "",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Rapport $N_1/N_2$",
      etapes: [
        { texte: "Vue de la source, la pièce vaut $R_L' = R_L (N_1/N_2)^2$. La puissance reçue est maximale quand $R_L' = R_s$ (Thévenin)." },
        { texte: "$(N_1/N_2)^2 = R_s/R_L = 0{,}5/0{,}02 = 25$, d'où $N_1/N_2 = 5$." },
        { texte: "Courant primaire $230/(0{,}5 + 0{,}5) = 230\\ \\mathrm{A}$, courant secondaire $5 \\times 230 = 1150\\ \\mathrm{A}$, puissance $230^2 \\times 0{,}5 = 26{,}45\\ \\mathrm{kW}$, rendement $50\\ \\%$." },
        { texte: "Avec $N_1/N_2 = 10$ : $R_L' = 2\\ \\Omega$, $I_1 = 92\\ \\mathrm{A}$, $P = 16{,}9\\ \\mathrm{kW}$, rendement $80\\ \\%$." },
        {
          texte: "Sans transformateur : $P = (230/0{,}52)^2 \\times 0{,}02 = 3{,}91\\ \\mathrm{kW}$ et un rendement de $3{,}8\\ \\%$.",
          note: "Compromis : l'adaptation maximise la puissance mais dissipe autant dans la source ; un rapport plus élevé sacrifie un tiers de la puissance pour gagner $30$ points de rendement.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const p = (a) => {
          const r = 0.02 * a * a;
          return (100 * Math.pow(230 / (0.5 + r), 2) * r) / 26450;
        };
        traceCorrection(moteur, conteneur, {
          titre: "Puissance reçue par la pièce, en % du maximum",
          xTitre: "N1/N2",
          yTitre: "P / P max",
          yUnite: "%",
          xMin: 1,
          xMax: 15,
          yMin: 0,
          yMax: 105,
          series: [
            { id: "p", nom: "puissance reçue", couleur: "serie-1", epaisseur: 2.6, fonction: p },
            { id: "eta", nom: "rendement", couleur: "serie-5", epaisseur: 2, fonction: (a) => (100 * 0.02 * a * a) / (0.5 + 0.02 * a * a) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneV(c, repere, couleurs, 5, "N1/N2 = 5");
            ligneV(c, repere, couleurs, 10, "10", [2, 3]);
            pointTrace(c, repere, couleurs, 5, 100, "26,45 kW");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic-inversion",
      titre: "Diagnostic : tension secondaire trop basse après remplacement",
      niveau: "diagnostic",
      enonce:
        "<p>Après le remplacement d'un transformateur $400\\ \\mathrm{V} / 230\\ \\mathrm{V}$ alimentant un coffret de prises, on mesure " +
        "$132\\ \\mathrm{V}$ au lieu de $230\\ \\mathrm{V}$ à vide. Le transformateur ne chauffe pas. Le réseau délivre bien " +
        "$400\\ \\mathrm{V}$ entre phases et $230\\ \\mathrm{V}$ entre phase et neutre. Quelles hypothèses sont compatibles avec ces " +
        "symptômes ?</p>",
      options: [
        { texte: "Le primaire $400\\ \\mathrm{V}$ a été raccordé entre phase et neutre, sous $230\\ \\mathrm{V}$.", juste: true },
        { texte: "Le transformateur est raccordé à l'envers, $400\\ \\mathrm{V}$ sur l'enroulement $230\\ \\mathrm{V}$." },
        { texte: "Le flux du noyau est plus faible que prévu, d'où l'absence d'échauffement à vide.", juste: true },
        { texte: "Une polarité inversée du secondaire explique la baisse de tension." },
        { texte: "Le remède consiste à raccorder le primaire entre deux phases.", juste: true },
      ],
      etapes: [
        { texte: "Rapport $m = 230/400 = 0{,}575$ ; sous $230\\ \\mathrm{V}$ au primaire, $0{,}575 \\times 230 = 132\\ \\mathrm{V}$ : c'est exactement la mesure." },
        { texte: "Le flux est réduit dans le rapport $230/400$ : courant magnétisant et pertes fer plus faibles, aucun échauffement." },
        { texte: "Raccordé à l'envers sous $400\\ \\mathrm{V}$, il donnerait $400 \\times 400/230 = 696\\ \\mathrm{V}$ et un flux multiplié par $1{,}74$ : saturation, courant d'appel énorme, protection déclenchée." },
        {
          texte: "Une polarité inversée change le signe de la tension, pas sa valeur efficace : elle ne compte que lorsqu'on associe des enroulements.",
          note: "Vérifier toujours la tension réellement appliquée au primaire avant d'incriminer l'appareil.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        barresCorrection(
          moteur,
          conteneur,
          { titre: "Tension secondaire et flux relatif selon le raccordement", xTitre: "raccordement", yTitre: "tension", unite: "V" },
          [
            { etiquette: "400 V sur 400 V", valeur: 230 },
            { etiquette: "230 V sur 400 V", valeur: 132.25 },
            { etiquette: "400 V sur 230 V", valeur: 695.7 },
          ]
        );
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-conceptuel-charge",
      titre: "Pourquoi le primaire sait-il que le secondaire est chargé ?",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez par quel mécanisme le courant primaire d'un transformateur augmente quand on charge son " +
        "secondaire, alors que les deux enroulements ne sont reliés par aucun conducteur et que le flux du noyau ne change pas.</p>",
      motsCles: [["ampere-tours", "amperes-tours", "ampere tours", "amperes tours", "force magnetomotrice"], ["flux"], ["tension", "faraday", "impose"], ["compens", "oppos", "equilibr", "annul"]],
      minimum: 3,
      exemple: "Trois ou quatre phrases : dites ce qui impose le flux, ce que font les ampères-tours du secondaire et comment le primaire réagit.",
      etapes: [
        { texte: "Le flux est imposé par la tension primaire et la fréquence, par la loi de Faraday : il ne peut pas changer tant que $V_1$ ne change pas." },
        { texte: "Le courant secondaire crée des ampères-tours $N_2 i_2$ qui tendraient à réduire ce flux." },
        { texte: "Pour maintenir le flux, le primaire appelle un courant dont les ampères-tours $N_1 i_1$ compensent exactement ceux du secondaire : $N_1 i_1 = N_2 i_2$ dans le modèle idéal." },
        {
          texte: "La puissance passe ainsi d'un enroulement à l'autre par le champ magnétique, sans aucune liaison galvanique.",
          note: "Le noyau ne stocke presque rien : c'est un médiateur, pas un réservoir.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Ampères-tours instantanés, transformateur de l'exemple chargé à 10 A",
          xTitre: "ωt",
          xUnite: "°",
          yTitre: "ampères-tours",
          yUnite: "A",
          xMin: 0,
          xMax: 360,
          yMin: -6000,
          yMax: 6000,
          series: [
            { id: "n1", nom: "N1 i1", couleur: "serie-1", epaisseur: 3, fonction: (d) => 600 * 0.575 * 10 * RAC2 * Math.cos(d * DEG) },
            { id: "n2", nom: "N2 i2, superposé", couleur: "serie-5", epaisseur: 1.6, fonction: (d) => 345 * 10 * RAC2 * Math.cos(d * DEG) },
            { id: "diff", nom: "différence, nulle", couleur: "serie-3", epaisseur: 2, fonction: () => 0 },
          ],
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Un transformateur a pour plaque $20\\ \\mathrm{kV} / 410\\ \\mathrm{V}$. Que vaut son rapport $m = N_2/N_1$ ?</p>",
        options: ["0,0205", "48,8", "0,041", "20,5"],
        bonnes: [0],
        explication: "$m = U_2/U_1 = 410/20\\,000 = 0{,}0205$ ; son inverse, $48{,}8$, est le rapport $N_1/N_2$.",
        resume: "Rapport de transformation",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Dans le modèle du transformateur idéal, la tension secondaire baisse quand le courant débité augmente.</p>",
        reponse: false,
        explication: "Le modèle idéal donne $V_2 = mV_1$ quelle que soit la charge ; la chute en charge vient des résistances et des fuites, absentes du modèle.",
        resume: "Tension secondaire et charge",
      },
      {
        type: "calcul",
        enonce: "<p>Le secondaire d'un transformateur idéal de rapport $m = 0{,}0205$ débite $140{,}8\\ \\mathrm{A}$. Quel est le courant primaire, en ampères ?</p>",
        valeur: 0.0205 * 140.8,
        unite: "A",
        tolerance: 0.01,
        chiffres: 3,
        explication: "$I_1 = mI_2 = 0{,}0205 \\times 140{,}8 = 2{,}886\\ \\mathrm{A}$, le courant assigné haute tension du poste.",
        resume: "Rapport des courants",
      },
      {
        type: "courte",
        enonce: "<p>Pourquoi un transformateur ne peut-il pas transmettre une tension continue ?</p>",
        motsCles: [["flux", "faraday", "variation", "derivee"], ["satur", "croit", "augmente", "sans limite", "constant", "nul"]],
        minimum: 2,
        explication:
          "La tension induite est $N\\,\\mathrm{d}\\Phi/\\mathrm{d}t$ : une tension continue impose un flux qui croît sans limite, jusqu'à la saturation ; aucune tension n'est induite en régime établi au secondaire et le primaire n'est plus limité que par sa résistance.",
        resume: "Transformateur et continu",
      },
      {
        type: "calcul",
        enonce: "<p>Une résistance de $0{,}5\\ \\Omega$ est raccordée au secondaire d'un transformateur idéal $400\\ \\mathrm{V} / 24\\ \\mathrm{V}$. Quelle résistance voit-on du primaire, en ohms ?</p>",
        valeur: 0.5 * Math.pow(400 / 24, 2),
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$0{,}5 \\times (400/24)^2 = 0{,}5 \\times 277{,}8 = 138{,}9\\ \\Omega$.",
        resume: "Impédance ramenée",
      },
      {
        type: "schema",
        enonce:
          "<p>Le courant $i_1$ entre par la borne pointée du primaire. Par quelle borne du secondaire sort un courant en phase avec $i_1$ ?</p>",
        consigne: "Cliquez sur la borne correspondante.",
        viewBox: "0 0 520 220",
        dessin: "<defs>" + marqueur("fl-q-pol") + "</defs>" + DESSIN_QUIZ_POLARITE,
        zones: [
          { x: 380, y: 30, largeur: 120, hauteur: 40, etiquette: "borne haute du secondaire" },
          { x: 380, y: 150, largeur: 120, hauteur: 40, etiquette: "borne basse du secondaire", juste: true },
        ],
        explication: "Le point du secondaire est en bas : c'est la borne homologue de la borne pointée du primaire, et le courant qui en sort est en phase avec $i_1$.",
        resume: "Lecture des points de polarité",
      },
      {
        type: "qcm",
        enonce: "<p>Quelles grandeurs fixent le flux crête d'un transformateur idéal alimenté en tension sinusoïdale ?</p>",
        options: [
          { texte: "La tension primaire", juste: true },
          { texte: "La fréquence", juste: true },
          { texte: "Le nombre de spires du primaire", juste: true },
          { texte: "Le courant de la charge" },
          { texte: "Le nombre de spires du secondaire" },
        ],
        multiple: true,
        explication: "$\\hat{\\Phi} = \\sqrt{2}\\,V_1/(N_1\\omega)$ : ni la charge ni le secondaire n'interviennent.",
        resume: "Ce qui fixe le flux",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Le facteur de puissance vu du primaire d'un transformateur idéal est égal à celui de sa charge.</p>",
        reponse: true,
        explication: "Le transfert d'impédance divise le module par $m^2$ sans changer l'argument ; $P$ et $Q$ sont conservés séparément.",
        resume: "Facteur de puissance transmis",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la tension par spire d'un noyau de $40\\ \\mathrm{cm^2}$ nets travaillant à $1{,}5\\ \\mathrm{T}$ crête sous $50\\ \\mathrm{Hz}$, en volts ?</p>",
        valeur: Math.PI * RAC2 * 50 * 40e-4 * 1.5,
        unite: "V",
        tolerance: 0.015,
        chiffres: 3,
        explication: "$4{,}443 \\times 50 \\times 40 \\times 10^{-4} \\times 1{,}5 = 1{,}333\\ \\mathrm{V}$ par spire ; un enroulement de $230\\ \\mathrm{V}$ demanderait $173$ spires.",
        resume: "Tension par spire",
      },
      {
        type: "qcm",
        enonce: "<p>Deux transformateurs identiques sont mis en parallèle, mais l'un a ses bornes secondaires inversées. Que se passe-t-il à la fermeture du disjoncteur secondaire ?</p>",
        options: [
          "Un courant de court-circuit circule entre les deux secondaires",
          "Rien : les tensions efficaces sont égales",
          "La tension du jeu de barres double",
          "Les deux transformateurs se partagent mieux la charge",
        ],
        bonnes: [0],
        explication: "Les deux tensions sont en opposition : la boucle formée par les deux secondaires voit $2V_2$ appliqués à leurs seules impédances internes, d'où un courant de court-circuit.",
        resume: "Parallèle et polarité",
      },
    ],
    { titre: "Dix questions sur le transformateur idéal" }
  );
  if (quiz) ressources.push(quiz);
}

/* --------------------------------------------------------------------------
   M. Cartes de mémorisation
   -------------------------------------------------------------------------- */

function construireCartesMemo(racine, api) {
  const cartes = api.cartes(
    "#m-cartes",
    [
      { categorie: "Hypothèses", question: "Quelles sont les quatre hypothèses du transformateur idéal ?", reponse: "Résistances nulles, aucune fuite de flux, réluctance du noyau nulle, aucune perte fer ; régime variable et noyau non saturé." },
      { categorie: "Loi", question: "D'où vient le rapport des tensions ?", reponse: "De la loi de Faraday appliquée à un flux commun : même tension par spire $\\mathrm{d}\\Phi/\\mathrm{d}t$, donc $v_2/v_1 = N_2/N_1 = m$." },
      { categorie: "Loi", question: "D'où vient le rapport des courants ?", reponse: "Du théorème d'Ampère avec une réluctance nulle : $N_1 i_1 - N_2 i_2 = \\mathcal{R}\\Phi = 0$, donc $i_1 = m\\,i_2$." },
      { categorie: "Puissance", question: "Que se conserve-t-il dans un transformateur idéal ?", reponse: "La puissance instantanée, donc $P$, $Q$ et $\\underline{S}$ séparément ; le facteur de puissance vu du primaire est celui de la charge." },
      { categorie: "Impédance", question: "Comment ramener une impédance du secondaire au primaire ?", reponse: "La diviser par $m^2$, soit la multiplier par $(N_1/N_2)^2$ ; l'argument est conservé." },
      { categorie: "Thévenin", question: "Que devient une source $\\underline{E}$ d'impédance $\\underline{Z}$ du primaire vue du secondaire ?", reponse: "Une source $m\\underline{E}$ d'impédance $m^2\\underline{Z}$." },
      { categorie: "Polarité", question: "Que signifient deux points de polarité ?", reponse: "Des bornes homologues : des courants entrant par elles créent des flux de même sens, et elles sont positives en même temps." },
      {
        categorie: "Essai",
        question: "Comment se fait l'essai de polarité au voltmètre ?",
        reponse: "On relie une borne de chaque enroulement, on alimente le primaire sous tension réduite et l'on mesure entre les deux bornes libres : $V_1 - V_2$, soustractive, ou $V_1 + V_2$, additive.",
        rappel: "Exemple du cours : $400\\ \\mathrm{V}$ et $m = 0{,}575$ donnent $170$ ou $630\\ \\mathrm{V}$.",
      },
      { categorie: "Plusieurs secondaires", question: "Comment calculer le courant primaire avec plusieurs secondaires ?", reponse: "$N_1\\underline{I}_1 = \\sum N_k\\underline{I}_k$, en phaseurs : la somme arithmétique n'est qu'un majorant." },
      {
        categorie: "Industriel",
        question: "Que change la prise $+5\\ \\%$ du régleur d'un transformateur de poste ?",
        reponse: "Elle ajoute $5\\ \\%$ de spires au primaire : tension secondaire et induction divisées par $1{,}05$.",
        rappel: "Poste du site sous $20{,}8\\ \\mathrm{kV}$ : $406{,}1\\ \\mathrm{V}$ à vide et $99\\ \\%$ d'induction.",
      },
    ],
    { titre: "Dix cartes sur le transformateur idéal" }
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
        enonce: "<p>Cette séance. Un transformateur idéal $400\\ \\mathrm{V} / 230\\ \\mathrm{V}$ débite $20\\ \\mathrm{A}$ au secondaire. Quel est le courant primaire, en ampères ?</p>",
        valeur: 11.5,
        unite: "A",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$I_1 = mI_2 = 0{,}575 \\times 20 = 11{,}5\\ \\mathrm{A}$ ; contrôle : $400 \\times 11{,}5 = 230 \\times 20 = 4600\\ \\mathrm{VA}$.",
        resume: "Rapport des courants",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Cette séance. Lors d'un essai de polarité, le voltmètre lit $V_1 - V_2$ : la borne du secondaire reliée au voltmètre est homologue de celle du primaire reliée au voltmètre.</p>",
        reponse: true,
        explication: "Les deux bornes libres sont alors simultanément positives : leurs potentiels se retranchent, polarité soustractive.",
        resume: "Lecture d'un essai de polarité",
      },
      {
        type: "qcm",
        enonce: "<p>Cette séance. Comment ramène-t-on au secondaire l'impédance du réseau amont, raccordée au primaire ?</p>",
        options: ["En la multipliant par $m^2$", "En la divisant par $m^2$", "En la multipliant par $m$", "Elle ne change pas"],
        bonnes: [0],
        explication: "Du primaire vers le secondaire, les impédances sont multipliées par $m^2$ : $1{,}6\\ \\Omega$ deviennent $0{,}672\\ \\mathrm{m\\Omega}$ au poste du site.",
        resume: "Impédance vers le secondaire",
      },
      {
        type: "calcul",
        enonce:
          "<p>Cours <a href=\"#/cours/circuits-magnetiques\">Circuits magnétiques</a>. Quelle est la réluctance d'un entrefer de $1\\ \\mathrm{mm}$ sur une section de $16\\ \\mathrm{cm^2}$, en kiloampères par weber ?</p>",
        valeur: 1e-3 / (4 * Math.PI * 1e-7 * 16e-4) / 1000,
        unite: "kA/Wb",
        tolerance: 0.01,
        chiffres: 1,
        explication: "$\\mathcal{R}_e = e/(\\mu_0 S) = 10^{-3}/(4\\pi \\times 10^{-7} \\times 1{,}6 \\times 10^{-3}) = 497{,}4\\ \\mathrm{kA/Wb}$.",
        resume: "Réluctance d'un entrefer",
      },
      {
        type: "vraiFaux",
        enonce:
          "<p>Cours <a href=\"#/cours/circuits-magnetiques\">Circuits magnétiques</a>. Sous tension alternative imposée, un entrefer accidentel dans le noyau d'un transformateur augmente son courant à vide sans réduire son flux.</p>",
        reponse: true,
        explication: "La tension impose le flux ; le courant magnétisant vaut $\\mathcal{R}\\Phi/N$ et croît avec la réluctance. C'est pourquoi un transformateur n'a pas d'entrefer.",
        resume: "Entrefer et courant à vide",
      },
      {
        type: "calcul",
        enonce:
          "<p>Cours <a href=\"#/cours/puissance-en-triphase\">Puissance en triphasé</a>. Le compresseur absorbe $32\\ \\mathrm{A}$ sous $400\\ \\mathrm{V}$ entre phases, à $\\cos\\varphi = 0{,}8$. Quelle est sa puissance active, en kilowatts ?</p>",
        valeur: (RAC3 * 400 * 32 * 0.8) / 1000,
        unite: "kW",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$P = \\sqrt{3}\\,UI\\cos\\varphi = 1{,}732 \\times 400 \\times 32 \\times 0{,}8 = 17{,}74\\ \\mathrm{kW}$.",
        resume: "Puissance active triphasée",
      },
      {
        type: "calcul",
        enonce:
          "<p>Cours <a href=\"#/cours/diagnostic-initial-et-remise-a-niveau-mathematique\">Diagnostic initial et remise à niveau mathématique</a>. Calculez le module de $230\\angle 0^\\circ / (40\\angle 36{,}87^\\circ)$, en ampères.</p>",
        valeur: 5.75,
        unite: "A",
        tolerance: 0.01,
        chiffres: 2,
        explication: "En polaire, on divise les modules et on retranche les arguments : $230/40 = 5{,}75$ à $-36{,}87^\\circ$, soit $4{,}6 - j3{,}45$ : la contribution de l'atelier au courant primaire de l'exemple.",
        resume: "Division de complexes en polaire",
      },
    ],
    { titre: "Sept questions de révision espacée" }
  );
  if (quiz) ressources.push(quiz);
}

/* --------------------------------------------------------------------------
   P. Auto-évaluation
   -------------------------------------------------------------------------- */

function construireAutoEval(racine, api) {
  const auto = api.autoEvaluation("#p-autoevaluation-grille", null, {
    titre: "Où en suis-je sur le transformateur idéal ?",
  });
  if (auto) ressources.push(auto);
}
