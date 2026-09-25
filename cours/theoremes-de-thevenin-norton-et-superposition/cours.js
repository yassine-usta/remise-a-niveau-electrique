/* ==========================================================================
   cours/theoremes-de-thevenin-norton-et-superposition/cours.js
   Théorèmes de Thévenin, Norton et superposition.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";

/* Bus 24 V secouru : chargeur, batterie et armoire. */
const BUS = { e1: 27, r1: 0.5, e2: 24, r2: 0.5, r3: 6 };

/* Pont de mesure de la section H. */
const PONT = { e: 2, r1: 1000, r2: 1000, r3: 1000, rx: 1100, rl: 1000 };

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

function parallele(...resistances) {
  let somme = 0;
  for (const r of resistances) {
    if (r === 0) return 0;
    if (Number.isFinite(r)) somme += 1 / r;
  }
  return somme === 0 ? Infinity : 1 / somme;
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
function marquerPoint(c, repere, couleurs, x, y, texte) {
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
    c.textAlign = px > repere.boite.x + repere.boite.l * 0.6 ? "right" : "left";
    c.fillText(texte, px + (c.textAlign === "right" ? -8 : 8), py - 8);
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

/** Point marqué avec un rappel vertical et un libellé placé sous le point. */
function marquerPointBas(c, repere, couleurs, x, y, texte, decalage, alignement) {
  const px = repere.versX(x);
  const py = repere.versY(y);
  c.save();
  c.setLineDash([5, 4]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(px, py);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = couleurs.texte;
  c.beginPath();
  c.arc(px, py, 4.5, 0, Math.PI * 2);
  c.fill();
  c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
  c.textAlign = alignement;
  c.fillText(texte, px + (alignement === "right" ? -8 : 8), py + decalage);
  c.restore();
}

/** Fondu d'entrée d'un groupe redessiné, sans effet en mouvement réduit. */
function fondu(api, element) {
  if (api.mouvementReduit || !api.gsap || !element) return;
  const tween = api.gsap.fromTo(element, { opacity: 0.15 }, { opacity: 1, duration: 0.55, ease: "power1.out" });
  nettoyeursAnimation.push(() => tween.kill());
}

/** Paragraphe explicatif placé sous un schéma animé. */
function noteSous(conteneur) {
  const note = document.createElement("p");
  note.className = "m-sim-note";
  note.setAttribute("aria-live", "polite");
  note.style.padding = "0 1rem";
  conteneur.after(note);
  nettoyeursAnimation.push(() => note.remove());
  return note;
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
  construireSuperposition(racine, api);
  construireTransformation(racine, api);
  construirePuissance(racine, api);
  construireCourbePont(racine, api);
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
  const selecteurs = [
    "#d-caracteristique-figure svg",
    "#e-extinction-figure svg",
    "#e-modeles-figure svg",
    "#h-schema-figure svg",
    "#i-armoire-figure svg",
  ];
  for (const selecteur of selecteurs) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree: 1.4 }));
  }
  /* Le schéma principal se trace plus lentement : réseau, puis modèles, dans l'ordre de lecture. */
  const principal = racine.querySelector("#f-schema-principal svg");
  if (principal) ressources.push(api.dessiner(principal, { duree: 2.2 }));
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-parallele",
      titre: "Deux résistances en parallèle",
      niveau: "diagnostic",
      enonce: "<p>Quelle est la résistance équivalente de $6\\ \\Omega$ en parallèle avec $12\\ \\Omega$, en ohms ?</p>",
      valeur: 4,
      unite: "Ω",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Réq",
      etapes: [
        { texte: "Produit sur somme : $\\dfrac{6 \\times 12}{6 + 12} = \\dfrac{72}{18} = 4\\ \\Omega$." },
        { texte: "Contrôle : le résultat est inférieur à $6\\ \\Omega$, la plus petite des deux.", note: "C'est l'opération que l'on refait pour chaque $R_{th}$ de cette séance." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 200",
          '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
            '<path d="M40 40H300"/><path d="M40 170H300"/><path d="M130 40V70"/><rect x="116" y="70" width="28" height="70" rx="3"/><path d="M130 140V170"/>' +
            '<path d="M240 40V70"/><rect x="226" y="70" width="28" height="70" rx="3"/><path d="M240 140V170"/>' +
            '<rect x="430" y="70" width="28" height="70" rx="3" stroke-width="4"/><path d="M444 40V70M444 140V170"/></g>' +
            '<g fill="currentColor" stroke="none"><circle cx="130" cy="40" r="4"/><circle cx="130" cy="170" r="4"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<text x="156" y="110">6 Ω</text><text x="266" y="110">12 Ω</text>' +
            '<text x="370" y="110" text-anchor="middle">donne</text><text x="470" y="110">4 Ω</text>' +
            '<text x="170" y="194" text-anchor="middle" font-size="12">mêmes deux nœuds : parallèle</text>' +
            '<text x="444" y="194" text-anchor="middle" font-size="12">72 / 18</text></g>',
          "Six ohms en parallèle avec douze ohms donnent quatre ohms"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-diviseur",
      titre: "Diviseur de tension à vide",
      niveau: "diagnostic",
      enonce:
        "<p>Un diviseur à vide est formé de $R_1 = 8\\ \\mathrm{k\\Omega}$ (en haut) et $R_2 = 4\\ \\mathrm{k\\Omega}$ (en bas), alimenté sous $12\\ \\mathrm{V}$. Quelle tension règne aux bornes de $R_2$, en volts ?</p>",
      valeur: 4,
      unite: "V",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "VS",
      etapes: [
        { texte: "$V_S = E\\,\\dfrac{R_2}{R_1 + R_2} = 12 \\times \\dfrac{4}{12} = 4\\ \\mathrm{V}$." },
        { texte: "La sortie étant à vide, $R_1$ et $R_2$ portent le même courant, $12/12\\,000 = 1\\ \\mathrm{mA}$.", note: "Cette tension à vide est exactement le $E_{th}$ du diviseur vu de sa sortie." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 260",
          "<defs>" + marqueur("fl-c-div-u", "var(--serie-2)") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
            '<path d="M80 230V152"/><circle cx="80" cy="130" r="22"/><path d="M80 108V30H260V50"/><rect x="246" y="50" width="28" height="70" rx="3"/>' +
            '<path d="M260 120V150"/><rect x="246" y="150" width="28" height="50" rx="3"/><path d="M260 200V230H80"/><path d="M260 135H380"/><path d="M260 230H380"/></g>' +
            '<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="386" cy="135" r="5"/><circle cx="386" cy="230" r="5"/></g>' +
            '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M420 224V146" marker-end="url(#fl-c-div-u)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<text x="80" y="135" text-anchor="middle">12 V</text><text x="56" y="116" text-anchor="end" font-weight="600">+</text>' +
            '<text x="288" y="90">R1 = 8 kΩ, 8 V</text><text x="288" y="180">R2 = 4 kΩ</text>' +
            '<text x="432" y="190" fill="var(--serie-2)" font-weight="600">VS = 4 V</text>' +
            '<text x="170" y="22" text-anchor="middle" font-size="12">I = 1 mA</text></g>',
          "Diviseur de 8 et 4 kilohms sous 12 volts : 8 volts sur R1, 4 volts en sortie"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-source",
      titre: "Tension aux bornes d'une source réelle",
      niveau: "diagnostic",
      enonce:
        "<p>Une source réelle de force électromotrice $E = 12\\ \\mathrm{V}$ et de résistance interne $r = 0{,}5\\ \\Omega$ débite $4\\ \\mathrm{A}$. Quelle tension mesure-t-on à ses bornes, en volts ?</p>",
      valeur: 10,
      unite: "V",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "U",
      etapes: [
        { texte: "Convention générateur : $U = E - rI = 12 - 0{,}5 \\times 4$." },
        { texte: "$U = 12 - 2 = 10\\ \\mathrm{V}$.", note: "La caractéristique $U(I)$ est une droite de pente $-r$ : c'est déjà un modèle de Thévenin, sujet de cette séance." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Caractéristique de la source réelle",
          genre: "Correction visuelle",
          xTitre: "I",
          xUnite: "A",
          yTitre: "U",
          yUnite: "V",
          xMin: 0,
          xMax: 24,
          yMin: 0,
          yMax: 13,
          ratio: 0.42,
          series: [{ id: "u", nom: "U = 12 - 0,5 I", couleur: "serie-1", fonction: (i) => 12 - 0.5 * i }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 4, 10, "4 A ; 10 V");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   E. Simulation : superposition sur le chargeur et la batterie
   -------------------------------------------------------------------------- */

const ETAPES_SUPERPOSITION = [
  { nom: "circuit complet", note: "Les deux sources sont actives : ce sont les grandeurs réelles, celles du cours Lois de Kirchhoff." },
  { nom: "chargeur seul", note: "La batterie est éteinte : sa force électromotrice est remplacée par un fil, sa résistance interne reste en place. Le chargeur débite dans deux résistances en parallèle, R2 et R3." },
  { nom: "batterie seule", note: "Le chargeur est éteint à son tour, la batterie est rallumée. Elle débite dans R1 et R3 en parallèle ; les courants partiels sont fictifs, ce sont des étapes de calcul." },
  { nom: "somme des contributions", note: "Chaque courant réel est la somme algébrique de ses deux contributions. La puissance de l'armoire, elle, n'est pas la somme des puissances partielles : le terme croisé manque." },
];

function calculSuperposition(e1, e2, r3) {
  const g1 = 1 / BUS.r1;
  const g2 = 1 / BUS.r2;
  const g3 = 1 / r3;
  const somme = g1 + g2 + g3;
  const va1 = (e1 * g1) / somme;
  const va2 = (e2 * g2) / somme;
  const partiel1 = { va: va1, i1: (e1 - va1) * g1, i2: -va1 * g2, i3: va1 * g3 };
  const partiel2 = { va: va2, i1: -va2 * g1, i2: (e2 - va2) * g2, i3: va2 * g3 };
  const total = {
    va: va1 + va2,
    i1: partiel1.i1 + partiel2.i1,
    i2: partiel1.i2 + partiel2.i2,
    i3: partiel1.i3 + partiel2.i3,
  };
  return {
    partiel1,
    partiel2,
    total,
    p3a: r3 * partiel1.i3 * partiel1.i3,
    p3b: r3 * partiel2.i3 * partiel2.i3,
    p3: r3 * total.i3 * total.i3,
    croise: 2 * r3 * partiel1.i3 * partiel2.i3,
  };
}

function construireSuperposition(racine, api) {
  const conteneur = racine.querySelector("#e-superposition");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 520",
    role: "img",
    "aria-label": "Chargeur et batterie en parallèle sur l'armoire, calculés par superposition, avec les courants de chaque étape et la comparaison des puissances",
  });
  const groupe = svgEl("g");
  svg.appendChild(groupe);
  conteneur.appendChild(svg);
  const note = noteSous(conteneur);

  const etat = { etape: 0, e1: BUS.e1, e2: BUS.e2, r3: BUS.r3 };
  let etapeDessinee = -1;

  const valeurs = api.sim.valeurs("#e-superposition-valeurs", [
    { id: "va1", libelle: "VA, chargeur seul", unite: "V", decimales: 2 },
    { id: "va2", libelle: "VA, batterie seule", unite: "V", decimales: 2 },
    { id: "va", libelle: "VA, somme", unite: "V", decimales: 2 },
    { id: "i3a", libelle: "I3, chargeur seul", unite: "A", decimales: 3 },
    { id: "i3b", libelle: "I3, batterie seule", unite: "A", decimales: 3 },
    { id: "i3", libelle: "I3, somme", unite: "A", decimales: 3 },
    { id: "i2", libelle: "I2 réel, batterie", unite: "A", decimales: 3 },
    { id: "pp", libelle: "Somme des puissances partielles de R3", unite: "W", decimales: 2 },
    { id: "p3", libelle: "Puissance réelle de R3", unite: "W", decimales: 2 },
    { id: "croise", libelle: "Terme croisé 2 R3 I3' I3''", unite: "W", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function source(x, active, nom, valeur) {
    if (active) {
      return (
        '<g stroke="currentColor" stroke-width="2.2" fill="none"><circle cx="' + x + '" cy="200" r="24"/></g>' +
        '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
        '<text x="' + x + '" y="194" text-anchor="middle" font-weight="600">+</text>' +
        '<text x="' + x + '" y="218" text-anchor="middle" font-weight="600">-</text>' +
        '<text x="' + (x < 350 ? x + 32 : x - 32) + '" y="252" text-anchor="' + (x < 350 ? "start" : "end") + '">' + nom + " = " + valeur + " V</text></g>"
      );
    }
    return (
      '<path d="M' + x + ' 176V224" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
      '<text x="' + (x < 350 ? x + 12 : x - 12) + '" y="196" text-anchor="' + (x < 350 ? "start" : "end") + '">' + nom + " éteinte :</text>" +
      '<text x="' + (x < 350 ? x + 12 : x - 12) + '" y="212" text-anchor="' + (x < 350 ? "start" : "end") + '">court-circuit</text></g>'
    );
  }

  function barre(y, largeur, libelle, valeur, active, remplissage) {
    return (
      '<text x="20" y="' + (y + 11) + '" opacity="' + (active ? 1 : 0.45) + '">' + libelle + "</text>" +
      '<rect x="250" y="' + y + '" width="' + Math.max(1, largeur).toFixed(1) + '" height="14" rx="3" style="fill: var(' + remplissage + ')" opacity="' + (active ? 1 : 0.35) + '"/>' +
      '<text x="' + (256 + Math.max(1, largeur)).toFixed(1) + '" y="' + (y + 11) + '" opacity="' + (active ? 1 : 0.45) + '">' + valeur + "</text>"
    );
  }

  function dessiner() {
    const r = calculSuperposition(etat.e1, etat.e2, etat.r3);
    const e = etat.etape;
    const s1 = e !== 2;
    const s2 = e !== 1;
    const g = e === 1 ? r.partiel1 : e === 2 ? r.partiel2 : r.total;
    const f = (v, d) => nombre(api, v, d);
    const somme = (a, b, d) => f(a, d) + (b < 0 ? " - " + f(-b, d) : " + " + f(b, d));

    let texteI1 = "I1 = " + f(g.i1, 2) + " A";
    let texteI2 = "I2 = " + f(g.i2, 2) + " A";
    let texteI3 = "I3 = " + f(g.i3, 2) + " A";
    let texteVA = "VA = " + f(g.va, 2) + " V";
    if (e === 3) {
      texteI1 = "I1 = " + somme(r.partiel1.i1, r.partiel2.i1, 2) + " = " + f(r.total.i1, 2) + " A";
      texteI2 = "I2 = " + somme(r.partiel1.i2, r.partiel2.i2, 2) + " = " + f(r.total.i2, 2) + " A";
      texteI3 = "I3 = " + somme(r.partiel1.i3, r.partiel2.i3, 2) + " = " + f(r.total.i3, 2) + " A";
      texteVA = "VA = " + somme(r.partiel1.va, r.partiel2.va, 2) + " = " + f(r.total.va, 2) + " V";
    }

    const maxI = Math.max(Math.abs(r.partiel1.i3), Math.abs(r.partiel2.i3), Math.abs(r.total.i3), 1e-9);
    const maxP = Math.max(r.p3a + r.p3b, r.p3, 1e-9);
    const echelleI = 300 / maxI;
    const echelleP = 300 / maxP;

    groupe.innerHTML =
      "<defs>" + marqueur("fl-e-sup") + "</defs>" +
      '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
      '<path d="M100 176V80H170"/><rect x="170" y="66" width="100" height="28" rx="3"/><path d="M270 80H530"/>' +
      '<rect x="430" y="66" width="100" height="28" rx="3"/><path d="M530 80H600V176"/>' +
      '<path d="M350 80V150"/><rect x="336" y="150" width="28" height="90" rx="3"/><path d="M350 240V320"/>' +
      '<path d="M100 224V320H600V224"/><path d="M350 320V334M336 334H364M342 341H358M347 348H353"/></g>' +
      '<g fill="currentColor" stroke="none"><circle cx="350" cy="80" r="5"/><circle cx="350" cy="320" r="5"/></g>' +
      source(100, s1, "E1", f(etat.e1, 1)) +
      source(600, s2, "E2", f(etat.e2, 1)) +
      '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round">' +
      '<path d="M130 80H160" marker-end="url(#fl-e-sup)"/><path d="M570 80H540" marker-end="url(#fl-e-sup)"/>' +
      '<path d="M350 98V134" marker-end="url(#fl-e-sup)"/></g>' +
      '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
      '<text x="20" y="26" font-weight="600">Étape ' + (e + 1) + " sur 4 : " + ETAPES_SUPERPOSITION[e].nom + "</text>" +
      '<text x="220" y="116" text-anchor="middle">R1 = 0,5 Ω</text><text x="480" y="116" text-anchor="middle">R2 = 0,5 Ω</text>' +
      '<text x="376" y="200">R3 = ' + f(etat.r3, 1) + " Ω</text>" +
      '<text x="132" y="272">chargeur</text><text x="568" y="272" text-anchor="end">batterie</text>' +
      '<text x="350" y="66" text-anchor="middle" font-weight="600">A</text>' +
      '<text x="350" y="376" text-anchor="middle" font-size="11.5">référence 0 V</text>' +
      '<text x="324" y="140" text-anchor="end" font-size="12">' + texteVA + "</text>" +
      '<text x="112" y="56" font-size="12">' + texteI1 + "</text>" +
      '<text x="588" y="56" text-anchor="end" font-size="12">' + texteI2 + "</text>" +
      '<text x="376" y="228" font-size="12">' + texteI3 + "</text>" +
      '<text x="20" y="402" font-weight="600" font-size="12">Courant dans l\'armoire</text>' +
      barre(410, Math.abs(r.partiel1.i3) * echelleI, "I3', chargeur seul", f(r.partiel1.i3, 2) + " A", e === 1 || e === 3, "--serie-1") +
      barre(430, Math.abs(r.partiel2.i3) * echelleI, "I3'', batterie seule", f(r.partiel2.i3, 2) + " A", e === 2 || e === 3, "--serie-1") +
      barre(450, Math.abs(r.total.i3) * echelleI, "I3 réel", f(r.total.i3, 2) + " A", e === 0 || e === 3, "--serie-1") +
      '<text x="20" y="484" font-weight="600" font-size="12">Puissance de l\'armoire</text>' +
      barre(490, (r.p3a + r.p3b) * echelleP, "P3' + P3''", f(r.p3a + r.p3b, 1) + " W", e === 3, "--serie-4") +
      barre(506, r.p3 * echelleP, "P3 réelle", f(r.p3, 1) + " W", e === 0 || e === 3, "--serie-4") +
      "</g>";

    note.textContent = ETAPES_SUPERPOSITION[e].note;
    if (etapeDessinee !== e) {
      if (etapeDessinee >= 0) fondu(api, groupe);
      etapeDessinee = e;
    }

    if (valeurs) {
      valeurs.maj({
        va1: r.partiel1.va,
        va2: r.partiel2.va,
        va: r.total.va,
        i3a: r.partiel1.i3,
        i3b: r.partiel2.i3,
        i3: r.total.i3,
        i2: r.total.i2,
        pp: r.p3a + r.p3b,
        p3: r.p3,
        croise: r.croise,
      });
    }
  }

  let curseurs = null;
  let depuisLecteur = false;

  const lecteur = api.sim.lecteur("#e-superposition-lecteur", {
    de: 0,
    a: 4,
    duree: 14,
    boucle: true,
    auto: false,
    libelle: "Enchaîner les étapes",
    rappel: (valeur) => {
      const etape = Math.min(3, Math.max(0, Math.floor(valeur)));
      if (etape === etat.etape && etapeDessinee >= 0) return;
      etat.etape = etape;
      if (curseurs) {
        depuisLecteur = true;
        curseurs.definir("etape", etape);
        depuisLecteur = false;
      } else {
        dessiner();
      }
    },
  });
  if (lecteur) ressources.push(lecteur);

  curseurs = api.sim.curseurs(
    "#e-superposition-curseurs",
    [
      { id: "etape", libelle: "Étape", min: 0, max: 3, pas: 1, valeur: 0, format: (v) => ETAPES_SUPERPOSITION[Math.round(v)].nom },
      { id: "e1", libelle: "Force électromotrice du chargeur E1", min: 20, max: 32, pas: 0.5, valeur: BUS.e1, unite: "V" },
      { id: "e2", libelle: "Force électromotrice de la batterie E2", min: 20, max: 28, pas: 0.5, valeur: BUS.e2, unite: "V" },
      { id: "r3", libelle: "Résistance de l'armoire R3", min: 1, max: 30, pas: 0.5, valeur: BUS.r3, unite: "Ω" },
    ],
    (lues) => {
      etat.etape = Math.round(lues.etape);
      etat.e1 = lues.e1;
      etat.e2 = lues.e2;
      etat.r3 = lues.r3;
      if (!depuisLecteur && lecteur) lecteur.suivre(etat.etape + 0.5);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  if (etapeDessinee < 0) dessiner();
}

/* --------------------------------------------------------------------------
   E. Animation : du pont aux modèles de Thévenin et de Norton
   -------------------------------------------------------------------------- */

const ETAPES_TRANSFORMATION = [
  { nom: "réseau et charge", note: "Le pont chargé ne contient aucun groupe série ou parallèle : RL relie les deux points milieux. On cherche ce que voit la charge." },
  { nom: "charge retirée : tension à vide", note: "Sans la charge, chaque côté du pont est un diviseur à vide. La tension à vide entre B et A est la différence des deux sorties : c'est Eth." },
  { nom: "source éteinte : résistance vue", note: "La source de tension devient un fil : le haut et le bas du pont ne forment plus qu'un nœud. R1 et R2 relient ce nœud à A, R3 et Rx le relient à B ; vu de A et B, deux groupes parallèles en série." },
  { nom: "modèle de Thévenin chargé", note: "Eth en série avec Rth, borne + du côté de B. La charge forme avec Rth un diviseur : une seule maille à calculer." },
  { nom: "modèle de Norton chargé", note: "IN = Eth / Rth en parallèle avec RN = Rth. Le courant imposé se partage entre RN et la charge, qui reçoit le même courant qu'avec le modèle de Thévenin." },
  { nom: "retour au réseau", note: "Dans le réseau complet, la méthode des nœuds redonne le même courant de charge. En revanche, les courants des quatre bras ne se lisent sur aucun des deux modèles." },
];

function calculPont(rx, rl) {
  const va0 = (PONT.e * PONT.r2) / (PONT.r1 + PONT.r2);
  const vb0 = (PONT.e * rx) / (PONT.r3 + rx);
  const eth = vb0 - va0;
  const rth = parallele(PONT.r1, PONT.r2) + parallele(PONT.r3, rx);
  const inorton = eth / rth;
  const il = eth / (rth + rl);
  const ul = il * rl;
  /* Méthode des nœuds, pont chargé : inconnues VA et VB. */
  const a11 = 1 / PONT.r1 + 1 / PONT.r2 + 1 / rl;
  const a12 = -1 / rl;
  const a22 = 1 / PONT.r3 + 1 / rx + 1 / rl;
  const b1 = PONT.e / PONT.r1;
  const b2 = PONT.e / PONT.r3;
  const det = a11 * a22 - a12 * a12;
  const va = (b1 * a22 - a12 * b2) / det;
  const vb = (a11 * b2 - a12 * b1) / det;
  return { va0, vb0, eth, rth, inorton, il, ul, p: il * il * rl, va, vb, irn: inorton - il };
}

function construireTransformation(racine, api) {
  const conteneur = racine.querySelector("#e-transformation");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 400",
    role: "img",
    "aria-label": "Transformation pas à pas d'un pont de mesure en modèles de Thévenin et de Norton vus de la charge",
  });
  const groupe = svgEl("g");
  svg.appendChild(groupe);
  conteneur.appendChild(svg);
  const note = noteSous(conteneur);

  const etat = { etape: 0, rx: PONT.rx, rl: PONT.rl };
  let etapeDessinee = -1;

  const valeurs = api.sim.valeurs("#e-transformation-valeurs", [
    { id: "va0", libelle: "VA0, à vide", unite: "V", decimales: 4 },
    { id: "vb0", libelle: "VB0, à vide", unite: "V", decimales: 4 },
    { id: "eth", libelle: "Eth = VB0 - VA0", unite: "mV", decimales: 2 },
    { id: "rth", libelle: "Rth vue de B et A", unite: "Ω", decimales: 1 },
    { id: "in", libelle: "IN = Eth / Rth", unite: "µA", decimales: 2 },
    { id: "il", libelle: "Courant IL dans la charge", unite: "µA", decimales: 2 },
    { id: "ul", libelle: "Tension u aux bornes de la charge", unite: "mV", decimales: 2 },
    { id: "p", libelle: "Puissance reçue par la charge", unite: "µW", decimales: 4 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const texte = (x, y, contenu, extra) =>
    '<text x="' + x + '" y="' + y + '"' + (extra ? " " + extra : "") + ">" + contenu + "</text>";

  function pont(r, options) {
    const sourceActive = options.source !== false;
    let m =
      '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
      '<path d="M70 176V60H520V90"/><path d="M70 224V340H520V300"/>' +
      '<path d="M200 60V90"/><rect x="186" y="90" width="28" height="70" rx="3"/><path d="M200 160V230"/>' +
      '<rect x="186" y="230" width="28" height="70" rx="3"/><path d="M200 300V340"/>' +
      '<rect x="506" y="90" width="28" height="70" rx="3"/><path d="M520 160V230"/><rect x="506" y="230" width="28" height="70" rx="3"/>' +
      '<path d="M130 340V354M116 354H144M122 361H138M127 368H133"/></g>' +
      '<g fill="currentColor" stroke="none"><circle cx="200" cy="60" r="4"/><circle cx="200" cy="340" r="4"/>' +
      '<circle cx="200" cy="195" r="4.5"/><circle cx="520" cy="195" r="4.5"/></g>';
    if (sourceActive) {
      m +=
        '<g stroke="currentColor" stroke-width="2.2" fill="none"><circle cx="70" cy="200" r="24"/></g>' +
        '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
        texte(70, 205, "2 V", 'text-anchor="middle"') + texte(44, 184, "+", 'text-anchor="end" font-weight="600"') + "</g>";
    } else {
      m +=
        '<path d="M70 176V224" stroke="currentColor" stroke-width="4.2" fill="none" stroke-linecap="round"/>' +
        '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5">' +
        texte(58, 200, "court-circuit", 'text-anchor="middle" transform="rotate(-90 58 200)"') + "</g>";
    }
    m +=
      '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
      texte(164, 130, "R1 = 1 kΩ", 'text-anchor="end"') + texte(164, 270, "R2 = 1 kΩ", 'text-anchor="end"') +
      texte(558, 130, "R3 = 1 kΩ") + texte(558, 270, "Rx = " + nombre(api, etat.rx, 0) + " Ω") +
      texte(186, 186, "A", 'text-anchor="end" font-weight="600"') + texte(534, 186, "B", 'font-weight="600"') +
      texte(130, 392, "référence 0 V", 'text-anchor="middle" font-size="11.5"') + "</g>";
    return m;
  }

  function chargeEntreAetB(r, avecCourant) {
    return (
      '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
      '<path d="M200 195H310"/><rect x="310" y="181" width="100" height="28" rx="3"/><path d="M410 195H520"/></g>' +
      (avecCourant
        ? '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M490 195H454" marker-end="url(#fl-e-tr)"/></g>'
        : "") +
      '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
      texte(360, 200, "RL = " + nombre(api, etat.rl, 0) + " Ω", 'text-anchor="middle"') +
      (avecCourant ? texte(470, 176, "IL = " + nombre(api, r.il * 1e6, 2) + " µA", 'text-anchor="middle" font-size="11.5"') : "") +
      "</g>"
    );
  }

  function bornesOuvertes() {
    return (
      '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M200 195H290"/><path d="M520 195H430"/></g>' +
      '<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="296" cy="195" r="6"/><circle cx="424" cy="195" r="6"/></g>'
    );
  }

  function dessiner() {
    const r = calculPont(etat.rx, etat.rl);
    const e = etat.etape;
    let m = "<defs>" + marqueur("fl-e-tr") + marqueur("fl-e-tr-u", "var(--serie-2)") + "</defs>";
    const f = (v, d) => nombre(api, v, d);

    if (e === 0 || e === 5) {
      m += pont(r, { source: true }) + chargeEntreAetB(r, e === 5);
      if (e === 5) {
        m +=
          '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5">' +
          texte(228, 216, "VA = " + f(r.va, 4) + " V") + texte(492, 216, "VB = " + f(r.vb, 4) + " V", 'text-anchor="end"') +
          texte(360, 250, "u = VB - VA = " + f(r.ul * 1000, 2) + " mV", 'text-anchor="middle"') + "</g>";
      }
    } else if (e === 1) {
      m +=
        pont(r, { source: true }) + bornesOuvertes() +
        '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M304 232H416" marker-end="url(#fl-e-tr-u)"/></g>' +
        '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
        texte(228, 216, "VA0 = " + f(r.va0, 4) + " V") + texte(492, 216, "VB0 = " + f(r.vb0, 4) + " V", 'text-anchor="end"') +
        texte(360, 256, "Eth = " + f(r.eth * 1000, 2) + " mV", 'text-anchor="middle" fill="var(--serie-2)" font-weight="600"') +
        texte(360, 176, "charge retirée", 'text-anchor="middle" font-size="11.5"') + "</g>";
    } else if (e === 2) {
      m +=
        pont(r, { source: false }) + bornesOuvertes() +
        '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 5" opacity="0.85">' +
        '<rect x="172" y="76" width="56" height="240" rx="10"/><rect x="492" y="76" width="56" height="240" rx="10"/></g>' +
        '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
        texte(360, 150, "R1 // R2 = " + f(parallele(PONT.r1, PONT.r2), 1) + " Ω", 'text-anchor="middle"') +
        texte(360, 168, "R3 // Rx = " + f(parallele(PONT.r3, etat.rx), 1) + " Ω", 'text-anchor="middle"') +
        texte(360, 236, "Rth = " + f(r.rth, 1) + " Ω", 'text-anchor="middle" font-weight="600"') +
        texte(360, 254, "deux groupes en série entre A et B", 'text-anchor="middle" font-size="11.5"') + "</g>";
    } else if (e === 3) {
      m +=
        '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
        '<path d="M200 176V90H280"/><circle cx="200" cy="200" r="24"/><rect x="280" y="76" width="110" height="28" rx="3"/>' +
        '<path d="M390 90H520V150"/><rect x="506" y="150" width="28" height="90" rx="3"/><path d="M520 240V310H200V224"/></g>' +
        '<g fill="currentColor" stroke="none"><circle cx="520" cy="90" r="4.5"/><circle cx="520" cy="310" r="4.5"/></g>' +
        '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M520 104V138" marker-end="url(#fl-e-tr)"/></g>' +
        '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M600 300V100" marker-end="url(#fl-e-tr-u)"/></g>' +
        '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
        texte(200, 194, "+", 'text-anchor="middle" font-weight="600"') + texte(200, 218, "-", 'text-anchor="middle" font-weight="600"') +
        texte(168, 205, "Eth = " + f(r.eth * 1000, 2) + " mV", 'text-anchor="end"') +
        texte(335, 124, "Rth = " + f(r.rth, 1) + " Ω", 'text-anchor="middle"') +
        texte(496, 200, "RL = " + f(etat.rl, 0) + " Ω", 'text-anchor="end"') +
        texte(534, 130, "IL = " + f(r.il * 1e6, 2) + " µA", 'font-size="11.5"') +
        texte(534, 82, "B", 'font-weight="600"') + texte(534, 330, "A", 'font-weight="600"') +
        texte(612, 205, "u = " + f(r.ul * 1000, 2) + " mV", 'fill="var(--serie-2)"') +
        texte(360, 370, "IL = Eth / (Rth + RL)", 'text-anchor="middle" font-size="12"') + "</g>";
    } else {
      m +=
        '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
        '<path d="M200 176V90H520V150"/><circle cx="200" cy="200" r="24"/>' +
        '<path d="M360 90V150"/><rect x="346" y="150" width="28" height="90" rx="3"/><path d="M360 240V310"/>' +
        '<rect x="506" y="150" width="28" height="90" rx="3"/><path d="M520 240V310H200V224"/></g>' +
        '<g fill="currentColor" stroke="none"><circle cx="360" cy="90" r="4.5"/><circle cx="360" cy="310" r="4.5"/>' +
        '<circle cx="520" cy="90" r="4.5"/><circle cx="520" cy="310" r="4.5"/></g>' +
        '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M200 214V188" marker-end="url(#fl-e-tr)"/></g>' +
        '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round">' +
        '<path d="M360 104V138" marker-end="url(#fl-e-tr)"/><path d="M520 104V138" marker-end="url(#fl-e-tr)"/></g>' +
        '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
        texte(168, 205, "IN = " + f(r.inorton * 1e6, 2) + " µA", 'text-anchor="end"') +
        texte(334, 200, "RN = " + f(r.rth, 1) + " Ω", 'text-anchor="end"') +
        texte(374, 130, f(r.irn * 1e6, 2) + " µA", 'font-size="11.5"') +
        texte(496, 200, "RL = " + f(etat.rl, 0) + " Ω", 'text-anchor="end"') +
        texte(534, 130, "IL = " + f(r.il * 1e6, 2) + " µA", 'font-size="11.5"') +
        texte(534, 82, "B", 'font-weight="600"') + texte(534, 330, "A", 'font-weight="600"') +
        texte(360, 370, "IN se partage entre RN et RL", 'text-anchor="middle" font-size="12"') + "</g>";
    }

    m +=
      '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
      texte(20, 26, "Étape " + (e + 1) + " sur 6 : " + ETAPES_TRANSFORMATION[e].nom, 'font-weight="600"') + "</g>";
    groupe.innerHTML = m;

    let explication = ETAPES_TRANSFORMATION[e].note;
    if (r.eth < 0) explication += " Ici Eth est négative : Rx est inférieure à R3, c'est A qui est au potentiel le plus élevé, et le courant de charge change de sens.";
    note.textContent = explication;

    if (etapeDessinee !== e) {
      if (etapeDessinee >= 0) fondu(api, groupe);
      etapeDessinee = e;
    }

    if (valeurs) {
      valeurs.maj({
        va0: r.va0,
        vb0: r.vb0,
        eth: r.eth * 1000,
        rth: r.rth,
        in: r.inorton * 1e6,
        il: r.il * 1e6,
        ul: r.ul * 1000,
        p: r.p * 1e6,
      });
    }
  }

  let curseurs = null;
  let depuisLecteur = false;

  const lecteur = api.sim.lecteur("#e-transformation-lecteur", {
    de: 0,
    a: 6,
    duree: 21,
    boucle: true,
    auto: false,
    libelle: "Enchaîner les étapes",
    rappel: (valeur) => {
      const etape = Math.min(5, Math.max(0, Math.floor(valeur)));
      if (etape === etat.etape && etapeDessinee >= 0) return;
      etat.etape = etape;
      if (curseurs) {
        depuisLecteur = true;
        curseurs.definir("etape", etape);
        depuisLecteur = false;
      } else {
        dessiner();
      }
    },
  });
  if (lecteur) ressources.push(lecteur);

  curseurs = api.sim.curseurs(
    "#e-transformation-curseurs",
    [
      { id: "etape", libelle: "Étape", min: 0, max: 5, pas: 1, valeur: 0, format: (v) => ETAPES_TRANSFORMATION[Math.round(v)].nom },
      { id: "rx", libelle: "Résistance de la sonde Rx", min: 900, max: 1300, pas: 10, valeur: PONT.rx, unite: "Ω" },
      { id: "rl", libelle: "Résistance de la charge RL", min: 100, max: 10000, pas: 50, valeur: PONT.rl, unite: "Ω" },
    ],
    (lues) => {
      etat.etape = Math.round(lues.etape);
      etat.rx = lues.rx;
      etat.rl = lues.rl;
      if (!depuisLecteur && lecteur) lecteur.suivre(etat.etape + 0.5);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  if (etapeDessinee < 0) dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : point de fonctionnement et puissance reçue
   -------------------------------------------------------------------------- */

const PLAN = { ox: 80, oy: 310, lx: 480, hy: 260 };

function construirePuissance(racine, api) {
  const conteneur = racine.querySelector("#e-puissance-plan");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 640 360",
    role: "img",
    "aria-label": "Plan tension-courant : caractéristique d'un équivalent de Thévenin, point de fonctionnement déplaçable et rectangle dont l'aire est la puissance reçue",
  });
  const fond = svgEl("g");
  fond.innerHTML =
    '<defs><pattern id="hach-e-puis" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<path d="M0 0V8" stroke="currentColor" stroke-width="1.6" opacity="0.4"/></pattern></defs>' +
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8"><path d="M80 310H610"/><path d="M80 320V30"/></g>' +
    '<path d="M80 50L560 310" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>';
  const rectangle = svgEl("rect", { x: 80, y: 180, width: 100, height: 130, fill: "url(#hach-e-puis)", stroke: "currentColor", "stroke-width": 1.2, "stroke-dasharray": "4 4" });
  const droiteCharge = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-dasharray": "8 5" });
  const textes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 12.5 });
  const tEth = svgEl("text", { x: 90, y: 42 });
  const tIcc = svgEl("text", { x: 560, y: 334, "text-anchor": "middle" });
  const tU = svgEl("text", { x: 72, y: 34, "text-anchor": "end" });
  tU.textContent = "u";
  const tI = svgEl("text", { x: 618, y: 314 });
  tI.textContent = "i";
  const tRL = svgEl("text", { x: 400, y: 40, "font-size": 12 });
  const tP = svgEl("text", { "text-anchor": "middle", "font-size": 12, "font-weight": 600 });
  const tPoint = svgEl("text", { "font-size": 12 });
  textes.append(tEth, tIcc, tU, tI, tRL, tP, tPoint);
  svg.append(fond, rectangle, droiteCharge, textes);
  conteneur.appendChild(svg);

  const etat = { x: 0.3, eth: 24, rth: 2 };
  let traceur = null;

  const valeurs = api.sim.valeurs("#e-puissance-valeurs", [
    { id: "i", libelle: "Courant i", unite: "A", decimales: 2 },
    { id: "u", libelle: "Tension u", unite: "V", decimales: 2 },
    { id: "rl", libelle: "Charge RL = u / i", unite: "Ω", decimales: 2 },
    { id: "rapport", libelle: "Rapport RL / Rth", decimales: 2 },
    { id: "p", libelle: "Puissance reçue P = u i", unite: "W", decimales: 2 },
    { id: "pmax", libelle: "Puissance maximale Eth² / (4 Rth)", unite: "W", decimales: 2 },
    { id: "relatif", libelle: "P / Pmax", unite: "%", decimales: 1 },
    { id: "eta", libelle: "Rendement RL / (RL + Rth)", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher() {
    const x = etat.x;
    const icc = etat.eth / etat.rth;
    const i = x * icc;
    const u = etat.eth * (1 - x);
    const rl = u / i;
    const p = u * i;
    const pmax = (etat.eth * etat.eth) / (4 * etat.rth);
    const px = PLAN.ox + PLAN.lx * x;
    const py = PLAN.oy - PLAN.hy + PLAN.hy * x;

    rectangle.setAttribute("x", PLAN.ox);
    rectangle.setAttribute("y", py.toFixed(1));
    rectangle.setAttribute("width", (px - PLAN.ox).toFixed(1));
    rectangle.setAttribute("height", (PLAN.oy - py).toFixed(1));

    const dx = px - PLAN.ox;
    const dy = PLAN.oy - py;
    const t = Math.min((610 - PLAN.ox) / Math.max(dx, 1e-6), (PLAN.oy - 36) / Math.max(dy, 1e-6));
    droiteCharge.setAttribute("d", "M" + PLAN.ox + " " + PLAN.oy + "L" + (PLAN.ox + dx * t).toFixed(1) + " " + (PLAN.oy - dy * t).toFixed(1));

    tEth.textContent = "Eth = " + nombre(api, etat.eth, 1) + " V";
    tIcc.textContent = "Icc = " + nombre(api, icc, 2) + " A";
    tRL.textContent = "droite de charge : RL = " + nombre(api, rl, 2) + " Ω";
    tP.textContent = "P = " + nombre(api, p, 1) + " W";
    tP.setAttribute("x", ((PLAN.ox + px) / 2).toFixed(1));
    tP.setAttribute("y", ((py + PLAN.oy) / 2 + 4).toFixed(1));
    tP.setAttribute("opacity", dx > 70 && dy > 26 ? "1" : "0");
    tPoint.textContent = "u = " + nombre(api, u, 2) + " V ; i = " + nombre(api, i, 2) + " A";
    tPoint.setAttribute("x", (px + 14).toFixed(1));
    tPoint.setAttribute("y", (py - 12).toFixed(1));
    tPoint.setAttribute("text-anchor", x > 0.62 ? "end" : "start");
    if (x > 0.62) tPoint.setAttribute("x", (px - 14).toFixed(1));

    if (valeurs) {
      valeurs.maj({
        i,
        u,
        rl,
        rapport: rl / etat.rth,
        p,
        pmax,
        relatif: (p / pmax) * 100,
        eta: (rl / (rl + etat.rth)) * 100,
      });
    }
    if (traceur) traceur.rafraichir();
  }

  traceur = api.sim.traceur("#e-puissance-trace", {
    titre: "Puissance rapportée et rendement en fonction de la charge",
    genre: "Simulation",
    xTitre: "RL / Rth",
    yTitre: "rapport",
    xMin: 0,
    xMax: 10,
    yMin: 0,
    yMax: 1.08,
    ratio: 0.46,
    series: [
      { id: "p", nom: "P / Pmax", couleur: "serie-1", epaisseur: 2.6, fonction: (r) => (4 * r) / ((1 + r) * (1 + r)) },
      { id: "eta", nom: "rendement RL / (RL + Rth)", couleur: "serie-4", fonction: (r) => r / (1 + r) },
    ],
    surDessin({ c, repere, couleurs }) {
      const r = (1 - etat.x) / etat.x;
      if (r <= 10) marquerPoint(c, repere, couleurs, r, (4 * r) / ((1 + r) * (1 + r)), "position courante");
    },
  });
  if (traceur) ressources.push(traceur);

  /* Le segment s'arrête un peu avant les extrémités : charge ni infinie ni nulle. */
  const debut = 0.01;
  const fin = 0.99;
  let lecteur = null;
  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: PLAN.ox + PLAN.lx * debut, y: PLAN.oy - PLAN.hy + PLAN.hy * debut },
    a: { x: PLAN.ox + PLAN.lx * fin, y: PLAN.oy - PLAN.hy + PLAN.hy * fin },
    min: debut,
    max: fin,
    pas: 0.01,
    valeur: etat.x,
    libelle: "Point de fonctionnement sur la caractéristique",
    format: (mesure) => "i / Icc = " + nombre(api, mesure.valeur, 2),
    diffuserAuDepart: false,
    rappel: (mesure) => {
      etat.x = mesure.valeur;
      if (lecteur) lecteur.suivre(mesure.valeur);
      afficher();
    },
  });
  if (poignee) ressources.push(poignee);

  lecteur = api.sim.lecteur("#e-puissance-lecteur", {
    de: debut,
    a: fin,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Balayer la charge, de la charge ouverte au court-circuit",
    rappel: (valeur) => {
      etat.x = valeur;
      if (poignee) poignee.set(valeur, false);
      afficher();
    },
  });
  /* La création du lecteur a diffusé sa valeur de départ : on revient au réglage initial. */
  etat.x = 0.3;
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.suivre(etat.x);
  }
  if (poignee) poignee.set(etat.x, false);

  const curseurs = api.sim.curseurs(
    "#e-puissance-curseurs",
    [
      { id: "eth", libelle: "Tension à vide Eth", min: 1, max: 48, pas: 0.5, valeur: etat.eth, unite: "V" },
      { id: "rth", libelle: "Résistance de Thévenin Rth", min: 0.1, max: 10, pas: 0.1, valeur: etat.rth, unite: "Ω" },
    ],
    (lues) => {
      etat.eth = lues.eth;
      etat.rth = lues.rth;
      afficher();
    }
  );
  if (curseurs) ressources.push(curseurs);

  afficher();
}

/* --------------------------------------------------------------------------
   H. Courbe : puissance reçue et tension lue selon l'instrument
   -------------------------------------------------------------------------- */

function construireCourbePont(racine, api) {
  const base = calculPont(PONT.rx, PONT.rl);
  const rth = base.rth;
  const puissance = (lg) => {
    const rl = Math.pow(10, lg);
    return (4 * rl * rth) / ((rl + rth) * (rl + rth));
  };
  const tension = (lg) => {
    const rl = Math.pow(10, lg);
    return rl / (rl + rth);
  };
  const traceur = api.sim.traceur("#h-courbe-trace", {
    titre: "Puissance reçue et tension lue selon la résistance d'entrée",
    genre: "Tracé",
    xTitre: "log10 de RL en ohms",
    yTitre: "rapport",
    xMin: 1,
    xMax: 8,
    yMin: 0,
    yMax: 1.1,
    ratio: 0.46,
    series: [
      { id: "p", nom: "P / Pmax", couleur: "serie-1", epaisseur: 2.6, fonction: puissance },
      { id: "u", nom: "U / Eth", couleur: "serie-4", fonction: tension },
    ],
    surDessin({ c, repere, couleurs }) {
      marquerPointBas(c, repere, couleurs, 3, puissance(3), "indicateur 1 kΩ", 22, "left");
      marquerPointBas(c, repere, couleurs, 5, tension(5), "automate 100 kΩ", 44, "left");
      marquerPointBas(c, repere, couleurs, 7, tension(7), "amplificateur 10 MΩ", 22, "right");
    },
    note: "Les points marqués sont lus sur la courbe de puissance pour l'indicateur, sur la courbe de tension pour les deux autres instruments.",
  });
  if (traceur) ressources.push(traceur);
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function modeleThevenin(id, eth, rth, rl, texteIl, texteU) {
  return (
    "<defs>" + marqueur(id) + marqueur(id + "-u", "var(--serie-2)") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
    '<path d="M90 146V60H170"/><circle cx="90" cy="170" r="24"/><rect x="170" y="46" width="100" height="28" rx="3"/>' +
    '<path d="M270 60H400V110"/><rect x="386" y="110" width="28" height="90" rx="3"/><path d="M400 200V260H90V194"/></g>' +
    '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M320 60H356" marker-end="url(#' + id + ')"/></g>' +
    '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M460 250V76" marker-end="url(#' + id + '-u)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
    '<text x="90" y="164" text-anchor="middle" font-weight="600">+</text><text x="90" y="188" text-anchor="middle" font-weight="600">-</text>' +
    '<text x="124" y="175">Eth = ' + eth + "</text>" +
    '<text x="220" y="100" text-anchor="middle">Rth = ' + rth + "</text>" +
    '<text x="376" y="160" text-anchor="end">RL = ' + rl + "</text>" +
    '<text x="338" y="44" text-anchor="middle">' + texteIl + "</text>" +
    '<text x="472" y="170" fill="var(--serie-2)">' + texteU + "</text></g>"
  );
}

function construireExercices(racine, api) {
  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-1",
      titre: "Équivalent d'un diviseur et courant de charge",
      niveau: "fondamental",
      enonce:
        "<p>Un pont formé de $R_1 = 4\\ \\mathrm{k\\Omega}$ (en haut) et $R_2 = 12\\ \\mathrm{k\\Omega}$ (en bas) est alimenté sous $E = 12\\ \\mathrm{V}$. Une charge $R_L = 6\\ \\mathrm{k\\Omega}$ est branchée aux bornes de $R_2$. En passant par l'équivalent de Thévenin vu de la charge, calculez le courant qui la traverse, en milliampères.</p>",
      valeur: 1,
      unite: "mA",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "IL",
      etapes: [
        { texte: "Charge retirée : $E_{th} = 12 \\times \\dfrac{12}{4 + 12} = 9\\ \\mathrm{V}$." },
        { texte: "Source éteinte (fil) : $R_1$ et $R_2$ relient tous deux la sortie à la référence, donc $R_{th} = 4 /\\!/ 12 = \\dfrac{48}{16} = 3\\ \\mathrm{k\\Omega}$." },
        { texte: "Charge rebranchée : $I_L = \\dfrac{9}{3 + 6} = 1\\ \\mathrm{mA}$, et $U_L = 6\\ \\mathrm{V}$." },
        { texte: "Contrôle par le diviseur chargé : $R_2 /\\!/ R_L = 4\\ \\mathrm{k\\Omega}$, $U_L = 12 \\times 4/(4 + 4) = 6\\ \\mathrm{V}$, identique.", note: "Des volts divisés par des kilohms donnent des milliampères." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 280",
          modeleThevenin("fl-k1", "9 V", "3 kΩ", "6 kΩ", "IL = 1 mA", "UL = 6 V"),
          "Modèle de Thévenin de 9 volts et 3 kilohms chargé par 6 kilohms : 1 milliampère, 6 volts"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-2",
      titre: "Du modèle de Norton au modèle de Thévenin",
      niveau: "fondamental",
      enonce:
        "<p>Un réseau a pour modèle de Norton une source de courant $I_N = 5\\ \\mathrm{mA}$ en parallèle avec $R_N = 2\\ \\mathrm{k\\Omega}$. Quelle est la force électromotrice $E_{th}$ de son modèle de Thévenin, en volts ?</p>",
      valeur: 10,
      unite: "V",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Eth",
      etapes: [
        { texte: "À vide, tout le courant $I_N$ traverse $R_N$ : $E_{th} = R_N I_N$." },
        { texte: "$E_{th} = 2000 \\times 0{,}005 = 10\\ \\mathrm{V}$, et $R_{th} = R_N = 2\\ \\mathrm{k\\Omega}$." },
        { texte: "La caractéristique commune va de $10\\ \\mathrm{V}$ à vide à $5\\ \\mathrm{mA}$ en court-circuit.", note: "La borne $+$ du modèle de Thévenin est celle vers laquelle pointe la flèche de $I_N$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Caractéristique commune aux deux modèles",
          genre: "Correction visuelle",
          xTitre: "i",
          xUnite: "mA",
          yTitre: "u",
          yUnite: "V",
          xMin: 0,
          xMax: 6,
          yMin: 0,
          yMax: 11,
          ratio: 0.42,
          series: [{ id: "u", nom: "u = 10 - 2 i (i en mA)", couleur: "serie-1", fonction: (i) => Math.max(0, 10 - 2 * i) }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 0, 10, "Eth = 10 V");
            marquerPoint(c, repere, couleurs, 5, 0, "IN = 5 mA");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-1",
      titre: "Superposition avec une source de courant",
      niveau: "intermédiaire",
      enonce:
        "<p>Une source de tension $E_1 = 12\\ \\mathrm{V}$, en série avec $R_1 = 2\\ \\Omega$, alimente un nœud $A$. Une source de courant $I_0 = 2\\ \\mathrm{A}$ injecte son courant dans le même nœud depuis la référence. Une résistance $R_3 = 6\\ \\Omega$ relie $A$ à la référence. Par superposition, calculez le courant dans $R_3$, en ampères.</p>",
      valeur: 2,
      unite: "A",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "I3",
      etapes: [
        { texte: "$E_1$ seule : la source de courant éteinte est un circuit ouvert. $R_1$ et $R_3$ forment un diviseur : $V_A' = 12 \\times 6/8 = 9\\ \\mathrm{V}$, $I_3' = 1{,}5\\ \\mathrm{A}$." },
        { texte: "$I_0$ seule : la source de tension éteinte est un fil. $I_0$ se partage entre $R_1$ et $R_3$ en parallèle, $1{,}5\\ \\Omega$ : $V_A'' = 2 \\times 1{,}5 = 3\\ \\mathrm{V}$, $I_3'' = 0{,}5\\ \\mathrm{A}$." },
        { texte: "Somme : $I_3 = 1{,}5 + 0{,}5 = 2\\ \\mathrm{A}$ et $V_A = 12\\ \\mathrm{V}$." },
        { texte: "Contrôle par Millman : $V_A = (12/2 + 2)/(1/2 + 1/6) = 8/0{,}6667 = 12\\ \\mathrm{V}$. Le courant dans $R_1$ est nul : $V_A = E_1$.", note: "Inverser les règles d'extinction donnerait ici un résultat faux dès la première étape." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 300",
          "<defs>" + marqueur("fl-k3") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
            '<path d="M70 126V50H140"/><circle cx="70" cy="150" r="22"/><rect x="140" y="36" width="90" height="28" rx="3"/><path d="M230 50H420"/>' +
            '<path d="M300 50V126"/><circle cx="300" cy="150" r="22"/><path d="M300 172V240"/>' +
            '<path d="M420 50V100"/><rect x="406" y="100" width="28" height="90" rx="3"/><path d="M420 190V240H70V172"/></g>' +
            '<g fill="currentColor" stroke="none"><circle cx="300" cy="50" r="4.5"/><circle cx="300" cy="240" r="4.5"/></g>' +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M300 164V138" marker-end="url(#fl-k3)"/></g>' +
            '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M420 64V92" marker-end="url(#fl-k3)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
            '<text x="70" y="144" text-anchor="middle" font-weight="600">+</text><text x="40" y="155" text-anchor="end">12 V</text>' +
            '<text x="185" y="86" text-anchor="middle">R1 = 2 Ω</text><text x="330" y="155">I0 = 2 A</text>' +
            '<text x="446" y="150">R3 = 6 Ω</text><text x="300" y="36" text-anchor="middle" font-weight="600">A</text>' +
            '<text x="446" y="84">I3</text>' +
            '<text x="300" y="272" text-anchor="middle" font-size="12">E1 seule : 1,5 A ; I0 seule : 0,5 A ; total : 2 A</text>' +
            '<text x="300" y="292" text-anchor="middle" font-size="12">VA = 9 + 3 = 12 V</text></g>',
          "Source de 12 volts et 2 ohms, source de courant de 2 ampères et résistance de 6 ohms : 1,5 plus 0,5 font 2 ampères"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-2",
      titre: "Puissance maximale vers une charge",
      niveau: "intermédiaire",
      enonce:
        "<p>Une source $E = 30\\ \\mathrm{V}$ alimente un pont $R_1 = 6\\ \\Omega$ (en haut), $R_2 = 3\\ \\Omega$ (en bas). Le point milieu est relié à la borne $A$ par $R_3 = 2\\ \\Omega$ ; la borne $B$ est la référence. Quelle est la plus grande puissance qu'une charge résistive branchée entre $A$ et $B$ puisse recevoir, en watts ?</p>",
      valeur: 6.25,
      unite: "W",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Pmax",
      etapes: [
        { texte: "Tension à vide : aucun courant dans $R_3$, donc $E_{th} = 30 \\times 3/9 = 10\\ \\mathrm{V}$." },
        { texte: "Source éteinte : $R_{th} = R_3 + R_1 /\\!/ R_2 = 2 + 2 = 4\\ \\Omega$." },
        { texte: "Maximum pour $R_L = R_{th} = 4\\ \\Omega$ : $P_{\\max} = \\dfrac{E_{th}^2}{4R_{th}} = \\dfrac{100}{16} = 6{,}25\\ \\mathrm{W}$." },
        { texte: "Contrôle : $I_L = 10/8 = 1{,}25\\ \\mathrm{A}$, $U_L = 5\\ \\mathrm{V}$, $P = 6{,}25\\ \\mathrm{W}$ ; le rendement du modèle vaut $50\\ \\%$.", note: "Le réseau réel dissipe davantage : la source fournit $30 \\times 3{,}75 = 112{,}5\\ \\mathrm{W}$ pour $6{,}25\\ \\mathrm{W}$ utiles, car elle débite aussi dans $R_2$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Puissance reçue en fonction de la charge",
          genre: "Correction visuelle",
          xTitre: "RL",
          xUnite: "Ω",
          yTitre: "P",
          yUnite: "W",
          xMin: 0,
          xMax: 20,
          yMin: 0,
          yMax: 7,
          ratio: 0.42,
          series: [{ id: "p", nom: "P = 100 RL / (4 + RL)²", couleur: "serie-1", fonction: (r) => (100 * r) / ((4 + r) * (4 + r)) }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 4, 6.25, "RL = 4 Ω ; 6,25 W");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-avance",
      titre: "Identifier une source par deux mesures, puis dimensionner",
      niveau: "avancé",
      enonce:
        "<p>On ne connaît pas l'intérieur d'un module d'alimentation continue. On mesure $12\\ \\mathrm{V}$ à ses bornes lorsqu'il débite dans $12\\ \\Omega$, et $8\\ \\mathrm{V}$ lorsqu'il débite dans $4\\ \\Omega$. On suppose le module linéaire. Quelle est la plus petite résistance de charge qui garantit une tension d'au moins $10\\ \\mathrm{V}$, en ohms ?</p>",
      valeur: 20 / 3,
      unite: "Ω",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "RL min",
      etapes: [
        { texte: "Courants : $I_1 = 12/12 = 1\\ \\mathrm{A}$ et $I_2 = 8/4 = 2\\ \\mathrm{A}$." },
        { texte: "Deux points de la droite $u = E_{th} - R_{th}i$ : $12 = E_{th} - R_{th}$ et $8 = E_{th} - 2R_{th}$. Par différence, $R_{th} = 4\\ \\Omega$, puis $E_{th} = 16\\ \\mathrm{V}$." },
        { texte: "Contrainte : $16\\,\\dfrac{R_L}{R_L + 4} \\geq 10 \\iff 16R_L \\geq 10R_L + 40 \\iff R_L \\geq 6{,}67\\ \\Omega$." },
        { texte: "À la limite : $I_L = 1{,}5\\ \\mathrm{A}$, $P_L = 15\\ \\mathrm{W}$, rendement du modèle $6{,}67/10{,}67 = 62{,}5\\ \\%$.", note: "Hypothèse forte : le module doit rester linéaire. Une alimentation régulée ne l'est pas ; deux mesures de plus, à d'autres charges, permettent de le vérifier." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Droite passant par les deux mesures",
          genre: "Correction visuelle",
          xTitre: "i",
          xUnite: "A",
          yTitre: "u",
          yUnite: "V",
          xMin: 0,
          xMax: 4,
          yMin: 0,
          yMax: 17,
          ratio: 0.42,
          series: [{ id: "u", nom: "u = 16 - 4 i", couleur: "serie-1", fonction: (i) => 16 - 4 * i }],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 10, "limite 10 V");
            marquerPoint(c, repere, couleurs, 1, 12, "12 Ω : 1 A ; 12 V");
            marquerPoint(c, repere, couleurs, 2, 8, "4 Ω : 2 A ; 8 V");
            marquerPoint(c, repere, couleurs, 1.5, 10, "RL = 6,67 Ω");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-diagnostic",
      titre: "Transmetteur dont la mesure baisse une fois raccordé",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Un transmetteur à sortie $0$ à $10\\ \\mathrm{V}$ est réglé en pleine échelle. Au multimètre ($10\\ \\mathrm{M\\Omega}$), on lit $10{,}00\\ \\mathrm{V}$ sur ses bornes, sortie déconnectée. Raccordée à l'entrée de l'automate ($10\\ \\mathrm{k\\Omega}$), la sortie ne vaut plus que $9{,}52\\ \\mathrm{V}$ aux bornes de l'automate. La documentation annonce une résistance de sortie d'au plus $100\\ \\Omega$. Quelle résistance de Thévenin voit l'automate, en ohms ? Concluez sur l'état de l'installation.</p>",
      valeur: 10000 * (10 / 9.52 - 1),
      unite: "Ω",
      tolerance: 0.03,
      chiffres: 0,
      libelleChamp: "Rth",
      etapes: [
        { texte: "La lecture au multimètre de $10\\ \\mathrm{M\\Omega}$ est une tension à vide : l'erreur de charge est de l'ordre de $R_{th}/10^7$, négligeable. $E_{th} = 10{,}00\\ \\mathrm{V}$." },
        { texte: "En charge : $U_L = E_{th}\\,\\dfrac{R_L}{R_L + R_{th}}$, donc $R_{th} = R_L\\left(\\dfrac{E_{th}}{U_L} - 1\\right) = 10\\,000 \\times \\left(\\dfrac{10}{9{,}52} - 1\\right) = 504\\ \\Omega$." },
        { texte: "C'est cinq fois la valeur annoncée. Un câble ne l'explique pas : $1\\ \\mathrm{km}$ de conducteur de $0{,}5\\ \\mathrm{mm^2}$ aller et retour ne fait qu'environ $69\\ \\Omega$." },
        { texte: "Causes probables : borne oxydée ou mal serrée, connecteur dégradé, résistance de protection ajoutée en série, étage de sortie endommagé. Localisation : mesurer, sous charge, la tension aux bornes du transmetteur puis aux bornes de l'automate ; l'écart situe la résistance parasite.", note: "L'automate affiche $4{,}8\\ \\%$ de moins que la valeur réelle en haut d'échelle : une erreur de mesure qui se traduit directement en erreur de régulation." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 280",
          modeleThevenin("fl-k6", "10,00 V", "504 Ω", "10 kΩ", "IL = 0,952 mA", "9,52 V") +
            '<rect x="150" y="22" width="140" height="66" rx="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 5" opacity="0.8"/>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
            '<text x="220" y="16" text-anchor="middle">annoncé : 100 Ω au plus</text>' +
            '<text x="300" y="276" text-anchor="middle">chute dans Rth : 504 × 0,952 mA = 0,48 V</text>' +
            '<text x="400" y="222" text-anchor="middle" font-size="11">entrée automate</text></g>',
          "Transmetteur de 10 volts et 504 ohms raccordé à une entrée de 10 kilohms : 9,52 volts et 0,48 volt perdus"
        );
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte("#k-exercices-blocs", {
      id: "k-conceptuel",
      titre: "Pourquoi ne pas adapter un réseau d'énergie",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi un réseau de distribution, une batterie ou un chargeur ne sont jamais exploités au transfert maximal de puissance, alors que ce réglage est recherché pour certains capteurs ou certaines liaisons de signal.</p>",
      motsCles: [
        ["rendement", "50", "moitie", "perte", "pertes", "gaspill"],
        ["tension", "chute", "moitie de la tension"],
        ["courant", "echauff", "court-circuit", "surintensite", "protection"],
        ["signal", "faible", "capteur", "antenne", "microwatt"],
      ],
      minimum: 2,
      exemple: "Trois phrases suffisent : parlez du rendement, de la tension reçue et de ce qui compte pour un signal faible.",
      etapes: [
        { texte: "Au transfert maximal, $R_L = R_{th}$ : la moitié de la puissance fournie est perdue dans $R_{th}$, soit un rendement de $50\\ \\%$ ; pour de l'énergie, ces pertes coûtent et échauffent les équipements." },
        { texte: "La tension reçue n'est que la moitié de la tension à vide, et le courant la moitié du courant de court-circuit : les appareils ne fonctionneraient pas à leur tension nominale, et les protections verraient un quasi-court-circuit." },
        { texte: "Pour un signal faible, l'énergie disponible est minuscule et gratuite : ce qui compte est d'en recevoir le plus possible, ou d'éviter les réflexions sur une ligne ; le rendement importe peu.", note: "Pour mesurer une tension, on vise encore autre chose : $R_L \\gg R_{th}$, comme dans l'exemple du pont de la section H." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Puissance rapportée et rendement",
          genre: "Correction visuelle",
          xTitre: "RL / Rth",
          yTitre: "rapport",
          xMin: 0,
          xMax: 20,
          yMin: 0,
          yMax: 1.08,
          ratio: 0.42,
          series: [
            { id: "p", nom: "P / Pmax", couleur: "serie-1", fonction: (r) => (4 * r) / ((1 + r) * (1 + r)) },
            { id: "eta", nom: "rendement", couleur: "serie-4", fonction: (r) => r / (1 + r) },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 1, 1, "adaptation : rendement 50 %");
            marquerPoint(c, repere, couleurs, 19, 0.95, "réseau d'énergie");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

/* Réseau à deux sources pour la question d'interprétation de schéma. */
const DESSIN_QUIZ =
  '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
  '<circle cx="60" cy="130" r="20"/><path d="M60 110V40H110"/><rect x="110" y="28" width="80" height="24" rx="3"/>' +
  '<path d="M190 40H400"/><path d="M250 40V110"/><circle cx="250" cy="130" r="20"/><path d="M250 150V220"/>' +
  '<path d="M340 40V90"/><rect x="328" y="90" width="24" height="80" rx="3"/><path d="M340 170V220"/>' +
  '<path d="M400 40H440M400 220H440"/><path d="M60 150V220H400"/></g>' +
  '<g fill="currentColor" stroke="none"><circle cx="250" cy="40" r="4"/><circle cx="340" cy="40" r="4"/><circle cx="250" cy="220" r="4"/><circle cx="340" cy="220" r="4"/></g>' +
  '<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="446" cy="40" r="5"/><circle cx="446" cy="220" r="5"/></g>' +
  '<path d="M250 142V120" stroke="currentColor" stroke-width="2" fill="none"/><path d="M244 124 250 114 256 124" stroke="currentColor" stroke-width="2" fill="none"/>' +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
  '<text x="60" y="126" text-anchor="middle" font-weight="600">+</text><text x="30" y="134" text-anchor="end">E</text>' +
  '<text x="150" y="70" text-anchor="middle">R1</text><text x="284" y="134">I0</text><text x="364" y="134">R2</text>' +
  '<text x="446" y="28" text-anchor="middle" font-weight="600">A</text><text x="446" y="244" text-anchor="middle" font-weight="600">B</text></g>';

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Pour calculer une résistance de Thévenin, par quoi remplace-t-on une source de tension idéale ?</p>",
        options: ["Par un circuit ouvert", "Par un court-circuit", "Par sa résistance interne seule, en parallèle", "On la laisse en place"],
        bonnes: [1],
        explication: "Une source de tension de force électromotrice nulle impose $u = 0$ quel que soit le courant : c'est un fil.",
        resume: "Extinction d'une source de tension",
      },
      {
        type: "vraiFaux",
        enonce: "<p>La puissance reçue par une résistance est la somme des puissances calculées avec chaque source agissant seule.</p>",
        reponse: false,
        explication: "$R(i_1 + i_2)^2 = Ri_1^2 + Ri_2^2 + 2Ri_1i_2$ : le terme croisé manque. On superpose les courants, pas les puissances.",
        resume: "Superposition des puissances",
      },
      {
        type: "calcul",
        enonce: "<p>Un réseau a pour équivalent $E_{th} = 12\\ \\mathrm{V}$, $R_{th} = 3\\ \\Omega$. Quel est son courant de Norton, en ampères ?</p>",
        valeur: 4,
        unite: "A",
        chiffres: 2,
        explication: "$I_N = E_{th}/R_{th} = 12/3 = 4\\ \\mathrm{A}$, avec $R_N = 3\\ \\Omega$.",
        resume: "Conversion Thévenin et Norton",
      },
      {
        type: "calcul",
        enonce: "<p>Un équivalent $E_{th} = 20\\ \\mathrm{V}$, $R_{th} = 5\\ \\Omega$ alimente une charge de $5\\ \\Omega$. Quelle puissance reçoit-elle, en watts ?</p>",
        valeur: 20,
        unite: "W",
        chiffres: 1,
        explication: "$I_L = 20/10 = 2\\ \\mathrm{A}$, $P_L = 5 \\times 2^2 = 20\\ \\mathrm{W}$, soit $E_{th}^2/(4R_{th})$ : c'est le maximum.",
        resume: "Puissance à l'adaptation",
      },
      {
        type: "courte",
        enonce: "<p>Quelles sont les deux mesures les plus directes pour identifier l'équivalent d'un réseau linéaire vu de deux bornes ?</p>",
        motsCles: [["vide", "circuit ouvert"], ["court-circuit", "court circuit", "icc", "norton", "deux charges", "en charge"]],
        minimum: 2,
        explication: "La tension à vide donne $E_{th}$, le courant de court-circuit donne $I_N$, et $R_{th} = E_{th}/I_N$. Quand le court-circuit est dangereux, on le remplace par une mesure sous une charge connue.",
        resume: "Identification par mesures",
      },
      {
        type: "qcm",
        enonce: "<p>Lorsqu'une charge reçoit la puissance maximale d'un équivalent de Thévenin, quel est le rendement du modèle ?</p>",
        options: ["$25\\ \\%$", "$50\\ \\%$", "$71\\ \\%$", "$100\\ \\%$"],
        bonnes: [1],
        explication: "$\\eta = R_L/(R_L + R_{th}) = 1/2$ pour $R_L = R_{th}$ : autant de puissance est perdue dans $R_{th}$ que reçue par la charge.",
        resume: "Rendement à l'adaptation",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Le même réseau vu de deux paires de bornes différentes a en général deux équivalents de Thévenin différents.</p>",
        reponse: true,
        explication: "$E_{th}$ et $R_{th}$ se calculent entre les bornes choisies ; changer de bornes change la tension à vide et la résistance vue.",
        resume: "Dépendance aux bornes",
      },
      {
        type: "calcul",
        enonce: "<p>Un diviseur à vide de deux résistances de $10\\ \\mathrm{k\\Omega}$ est alimenté sous $10\\ \\mathrm{V}$. Quelle résistance de Thévenin présente sa sortie, en kilohms ?</p>",
        valeur: 5,
        unite: "kΩ",
        chiffres: 1,
        explication: "Source éteinte, les deux résistances relient la sortie à la référence : $10 /\\!/ 10 = 5\\ \\mathrm{k\\Omega}$. La tension à vide vaut $5\\ \\mathrm{V}$.",
        resume: "Résistance de sortie d'un diviseur",
      },
      {
        type: "schema",
        enonce: "<p>On veut la résistance de Thévenin de ce réseau vue des bornes $A$ et $B$. Quel élément doit être remplacé par un circuit ouvert ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 470 260",
        dessin: DESSIN_QUIZ,
        zones: [
          { x: 30, y: 100, largeur: 60, hauteur: 60, etiquette: "source de tension E" },
          { x: 110, y: 18, largeur: 80, hauteur: 44, etiquette: "résistance R1" },
          { x: 220, y: 100, largeur: 60, hauteur: 60, etiquette: "source de courant I0", juste: true },
          { x: 316, y: 90, largeur: 48, hauteur: 80, etiquette: "résistance R2" },
        ],
        explication: "La source de courant $I_0$ s'éteint en circuit ouvert ; la source de tension $E$ en court-circuit. Il reste $R_1$ en parallèle avec $R_2$ entre $A$ et $B$.",
        resume: "Éteindre une source de courant",
      },
      {
        type: "qcm",
        enonce: "<p>Lesquels de ces outils supposent que le réseau étudié est linéaire ?</p>",
        options: [
          { texte: "Le principe de superposition", juste: true },
          { texte: "Le théorème de Thévenin", juste: true },
          { texte: "La loi des nœuds" },
          { texte: "La loi des mailles" },
        ],
        multiple: true,
        explication: "Les lois de Kirchhoff valent pour tout circuit, linéaire ou non ; la superposition et les équivalents de Thévenin et de Norton exigent la linéarité du réseau remplacé.",
        resume: "Domaine de validité",
      },
    ],
    { titre: "Dix questions sur Thévenin, Norton et la superposition" }
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
      { categorie: "Principe", question: "Qu'énonce le principe de superposition ?", reponse: "Dans un réseau linéaire, chaque courant et chaque tension est la somme des contributions de chaque source indépendante agissant seule." },
      { categorie: "Règle", question: "Comment éteint-on une source de tension et une source de courant ?", reponse: "Tension : court-circuit (fil). Courant : circuit ouvert (coupure). Les résistances internes et les sources commandées restent." },
      { categorie: "Vigilance", question: "Peut-on superposer des puissances ?", reponse: "Non : $R(i_1 + i_2)^2$ contient le terme croisé $2Ri_1i_2$. On superpose les courants, puis on calcule la puissance." },
      { categorie: "Théorème", question: "Que dit le théorème de Thévenin ?", reponse: "Vu de deux bornes, tout réseau linéaire équivaut à $E_{th}$ en série avec $R_{th}$ : $u = E_{th} - R_{th}i$." },
      { categorie: "Définition", question: "Comment obtient-on $E_{th}$ et $R_{th}$ ?", reponse: "$E_{th}$ : tension à vide, charge retirée. $R_{th}$ : résistance vue sources éteintes, ou $E_{th}/I_{cc}$, ou source d'essai." },
      { categorie: "Conversion", question: "Comment passer du modèle de Thévenin au modèle de Norton ?", reponse: "$I_N = E_{th}/R_{th}$, $R_N = R_{th}$ ; la flèche de $I_N$ pointe vers la borne $+$ de $E_{th}$." },
      { categorie: "Formule", question: "Quelle charge reçoit la puissance maximale, et combien ?", reponse: "$R_L = R_{th}$, $P_{\\max} = E_{th}^2/(4R_{th})$, avec un rendement de $50\\ \\%$." },
      { categorie: "Formule", question: "Que donne le théorème de Millman ?", reponse: "$V_A = \\sum (E_k/R_k) / \\sum (1/R_k)$ pour des branches en parallèle entre $A$ et la référence." },
      { categorie: "Limite", question: "Que ne dit pas un équivalent de Thévenin ?", reponse: "Rien sur l'intérieur du réseau : ni les courants internes, ni les pertes, ni le courant d'une batterie dans un bus secouru." },
      {
        categorie: "Industriel",
        question: "À quoi sert le courant de Norton dans une installation ?",
        reponse: "C'est le courant de court-circuit aux bornes considérées : il fixe le pouvoir de coupure des protections et la tenue des câbles.",
        rappel: "Bus 24 V secouru : 25,5 V, 0,25 Ω, soit 102 A dans le modèle linéaire.",
      },
    ],
    { titre: "Dix cartes sur Thévenin, Norton et la superposition" }
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
        enonce: "<p>Un réseau a pour équivalent $E_{th} = 9\\ \\mathrm{V}$, $R_{th} = 450\\ \\Omega$. Quel est son courant de court-circuit, en milliampères ?</p>",
        valeur: 20,
        unite: "mA",
        chiffres: 1,
        explication: "$I_{cc} = I_N = 9/450 = 0{,}020\\ \\mathrm{A} = 20\\ \\mathrm{mA}$.",
        resume: "Courant de Norton (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Pour appliquer la superposition, une source de courant éteinte est remplacée par un circuit ouvert.</p>",
        reponse: true,
        explication: "Un courant imposé nul, c'est une coupure : aucune charge ne peut traverser la branche.",
        resume: "Extinction d'une source de courant (cette séance)",
      },
      {
        type: "qcm",
        enonce: "<p>Pour quelle résistance de charge un équivalent de Thévenin fournit-il la plus grande puissance ?</p>",
        options: ["$R_L \\to 0$", "$R_L = R_{th}/2$", "$R_L = R_{th}$", "$R_L \\to \\infty$"],
        bonnes: [2],
        explication: "$\\mathrm{d}P_L/\\mathrm{d}R_L$ s'annule pour $R_L = R_{th}$ ; aux deux extrémités, la puissance est nulle.",
        resume: "Adaptation (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Une résistance de $2\\ \\Omega$ est en série avec l'ensemble $6\\ \\Omega /\\!/ 3\\ \\Omega$. Quelle est la résistance équivalente, en ohms ?</p>",
        valeur: 4,
        unite: "Ω",
        chiffres: 1,
        explication: "$6 /\\!/ 3 = 18/9 = 2\\ \\Omega$, plus $2\\ \\Omega$ en série : $4\\ \\Omega$. Révisé du cours Associations de résistances et diviseurs.",
        resume: "Réduction série-parallèle (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Un diviseur a une tension à vide de $6\\ \\mathrm{V}$ et une résistance de sortie de $5\\ \\mathrm{k\\Omega}$. Quelle tension délivre-t-il à une charge de $10\\ \\mathrm{k\\Omega}$, en volts ?</p>",
        valeur: 4,
        unite: "V",
        chiffres: 2,
        explication: "$V_S = 6 \\times 10/(10 + 5) = 4\\ \\mathrm{V}$ : le diviseur chargé du cours Associations de résistances et diviseurs était déjà un modèle de Thévenin.",
        resume: "Diviseur chargé (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Une source réelle $E = 12\\ \\mathrm{V}$, $r = 0{,}2\\ \\Omega$ débite $5\\ \\mathrm{A}$ en convention générateur. Quelle tension mesure-t-on à ses bornes, en volts ?</p>",
        valeur: 11,
        unite: "V",
        chiffres: 2,
        explication: "$U = E - rI = 12 - 1 = 11\\ \\mathrm{V}$. Révisé du cours Tension, courant, charge et puissance ; c'est la droite $u = E_{th} - R_{th}i$.",
        resume: "Source réelle (Tension, courant, charge et puissance)",
      },
      {
        type: "calcul",
        enonce: "<p>Exprimez $4{,}762 \\times 10^{-2}\\ \\mathrm{V}$ en millivolts.</p>",
        valeur: 47.62,
        unite: "mV",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$4{,}762 \\times 10^{-2}\\ \\mathrm{V} = 47{,}62 \\times 10^{-3}\\ \\mathrm{V} = 47{,}62\\ \\mathrm{mV}$, la tension à vide du pont de la section H. Révisé du cours Diagnostic initial et remise à niveau mathématique.",
        resume: "Notation scientifique (cours le plus ancien)",
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
    titre: "Où en suis-je sur Thévenin, Norton et la superposition ?",
  });
  if (auto) ressources.push(auto);
}
