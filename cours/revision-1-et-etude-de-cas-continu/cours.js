/* ==========================================================================
   cours/revision-1-et-etude-de-cas-continu/cours.js
   Révision 1 et étude de cas continu.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";

/* Étude de cas : alimentation 48 V, câble, chauffage et lampe témoin. */
const ETUDE = { e: 48, r: 0.2, rho: 1.8e-8, l: 12.5, s: 1.5, rch: 12, rlampe: 480, umin: 44, imax: 10, psmax: 400 };

/* Sections normalisées proposées au curseur, en mm². */
const SECTIONS = [0.75, 1, 1.5, 2.5, 4, 6, 10];

/* Bus 24 V secouru vu de l'armoire, câble de l'armoire déportée. */
const BUS = { eth: 25.5, rth: 0.25, rarmoire: 6, rcable: 0.576, ebat: 24, rbat: 0.5 };

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

/** Nombre destiné à une formule KaTeX : la virgule décimale est protégée. */
function nombreMath(api, valeur, decimales) {
  return nombre(api, valeur, decimales).replace(",", "{,}");
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
function marquerPoint(c, repere, couleurs, x, y, texte, decalageY) {
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
    c.fillText(texte, px + (c.textAlign === "right" ? -8 : 8), py + (decalageY != null ? decalageY : -8));
  }
  c.restore();
}

/** Ligne horizontale en tirets sur un tracé, avec son libellé. */
function ligneHorizontale(c, repere, couleurs, y, texte, xDebut, xFin) {
  const py = repere.versY(y);
  const x0 = xDebut != null ? repere.versX(xDebut) : repere.boite.x;
  const x1 = xFin != null ? repere.versX(xFin) : repere.boite.x + repere.boite.l;
  c.save();
  c.setLineDash([7, 5]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(x0, py);
  c.lineTo(x1, py);
  c.stroke();
  c.setLineDash([]);
  if (texte) {
    c.fillStyle = couleurs.texte;
    c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
    c.textAlign = "right";
    c.fillText(texte, x1 - 4, py - 6);
  }
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

function texte(x, y, contenu, extra) {
  return '<text x="' + x + '" y="' + y + '"' + (extra ? " " + extra : "") + ">" + contenu + "</text>";
}

/* --------------------------------------------------------------------------
   Calculs de l'étude de cas
   -------------------------------------------------------------------------- */

function resistanceLigne(l, s) {
  return (ETUDE.rho * 2 * l) / (s * 1e-6);
}

function calculEtude(e, r, rl, rch, rlampe) {
  const rp = parallele(rch, rlampe);
  const i = e / (r + rl + rp);
  const uch = rp * i;
  const us = e - r * i;
  return {
    rp,
    i,
    uch,
    us,
    vsp: us,
    va: us - (rl / 2) * i,
    vb: (rl / 2) * i,
    ich: uch / rch,
    il: uch / rlampe,
    pch: (uch * uch) / rch,
    plampe: (uch * uch) / rlampe,
    pr: r * i * i,
    pligne: rl * i * i,
    pe: e * i,
    eta: uch / e,
    chute: (us - uch) / us,
  };
}

/** Équivalent vu du chauffage et limites de courant du cahier des charges. */
function calculDomaine(rl, umin, imax, psmax) {
  const e = ETUDE.e;
  const r = ETUDE.r;
  const rla = ETUDE.rlampe;
  const rs = r + rl;
  const eth = (e * rla) / (rla + rs);
  const rth = parallele(rs, rla);
  const ichU = Math.max(0, (eth - umin) / rth);
  const uF = e - rs * imax;
  const ichF = imax - uF / rla;
  const disc = e * e - 4 * r * psmax;
  const iP = disc >= 0 ? (e - Math.sqrt(disc)) / (2 * r) : Infinity;
  const ichP = Number.isFinite(iP) ? iP - (e - rs * iP) / rla : Infinity;
  const limites = [
    { id: "tension", valeur: ichU, nom: "tension minimale" },
    { id: "fusible", valeur: ichF, nom: "calibre du fusible" },
    { id: "alimentation", valeur: ichP, nom: "puissance de l'alimentation" },
  ];
  let active = limites[0];
  for (const limite of limites) if (limite.valeur < active.valeur) active = limite;
  const ichMax = active.valeur;
  const uOpt = eth - rth * ichMax;
  return { eth, rth, rs, ichU, ichF, ichP, active, ichMax, uOpt, pOpt: uOpt * ichMax, rMin: uOpt / ichMax };
}

/* --------------------------------------------------------------------------
   Dessin du circuit de l'étude, commun à la simulation et à l'animation
   -------------------------------------------------------------------------- */

function circuitEtude(id, t) {
  const cadres = (t.cadres || [])
    .map(
      (c) =>
        '<rect x="' + c[0] + '" y="' + c[1] + '" width="' + c[2] + '" height="' + c[3] +
        '" rx="10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="6 5" opacity="0.9"/>'
    )
    .join("");
  const fleches = t.fleches !== false;
  return (
    "<defs>" + marqueur(id) + marqueur(id + "-u", "var(--serie-2)") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
    '<path d="M70 166V70H110"/><circle cx="70" cy="190" r="24"/><rect x="110" y="56" width="70" height="28" rx="3"/>' +
    '<path d="M180 70H214"/><path d="M226 70H300"/><rect x="300" y="56" width="100" height="28" rx="3"/>' +
    '<path d="M400 70H660V110"/><path d="M540 70V110"/><rect x="526" y="110" width="28" height="120" rx="3"/>' +
    '<path d="M540 230V300"/><rect x="646" y="110" width="28" height="120" rx="3"/><path d="M660 230V300H400"/>' +
    '<rect x="300" y="286" width="100" height="28" rx="3"/><path d="M300 300H226"/><path d="M214 300H70V214"/>' +
    '<path d="M140 300V314M126 314H154M132 321H148M137 328H143"/></g>' +
    '<g fill="currentColor" stroke="none"><circle cx="540" cy="70" r="4.5"/><circle cx="540" cy="300" r="4.5"/></g>' +
    '<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="220" cy="70" r="6"/><circle cx="220" cy="300" r="6"/></g>' +
    cadres +
    (fleches
      ? '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round">' +
        '<path d="M240 70H288" marker-end="url(#' + id + ')"/><path d="M470 300H428" marker-end="url(#' + id + ')"/>' +
        '<path d="M540 80V104" marker-end="url(#' + id + ')"/><path d="M660 80V104" marker-end="url(#' + id + ')"/>' +
        '<path d="M70 202V184" marker-end="url(#' + id + ')"/></g>' +
        '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round">' +
        '<path d="M250 288V84" marker-end="url(#' + id + '-u)"/><path d="M588 222V118" marker-end="url(#' + id + '-u)"/></g>'
      : "") +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    texte(46, 176, "+", 'text-anchor="end" font-weight="600"') +
    texte(40, 200, t.e || "E", 'text-anchor="end" font-size="11.5"') +
    texte(145, 104, t.r || "r", 'text-anchor="middle" font-size="12"') +
    texte(350, 104, t.aller || "Rl / 2, aller", 'text-anchor="middle" font-size="12"') +
    texte(350, 278, t.retour || "Rl / 2, retour", 'text-anchor="middle" font-size="12"') +
    texte(214, 100, "S+", 'text-anchor="end" font-weight="600"') +
    texte(220, 334, "S-", 'text-anchor="middle" font-weight="600"') +
    texte(540, 52, "A", 'text-anchor="middle" font-weight="600"') +
    texte(540, 334, "B", 'text-anchor="middle" font-weight="600"') +
    texte(516, 166, "Rch", 'text-anchor="end"') +
    texte(516, 184, t.rch || "", 'text-anchor="end" font-size="11.5"') +
    texte(686, 166, "lampe") +
    texte(686, 184, t.rlampe || "480 Ω", 'font-size="11.5"') +
    (fleches ? texte(264, 58, t.i || "I", 'text-anchor="middle" font-size="11.5"') : "") +
    (fleches && t.ich ? texte(528, 98, t.ich, 'text-anchor="end" font-size="11"') : "") +
    (fleches && t.il ? texte(648, 98, t.il, 'text-anchor="end" font-size="11"') : "") +
    (fleches ? texte(258, 196, t.us || "Us", 'fill="var(--serie-2)" font-size="12"') : "") +
    (fleches ? texte(596, 166, "Uch", 'fill="var(--serie-2)" font-size="11.5"') : "") +
    (fleches && t.uch ? texte(596, 182, t.uch, 'fill="var(--serie-2)" font-size="11"') : "") +
    (t.vsp ? texte(236, 40, t.vsp, 'font-size="11"') : "") +
    (t.va ? texte(556, 56, t.va, 'font-size="11"') : "") +
    (t.vb ? texte(556, 322, t.vb, 'font-size="11"') : "") +
    (t.vsm ? texte(208, 318, t.vsm, 'text-anchor="end" font-size="11"') : "") +
    texte(140, 346, "référence 0 V", 'text-anchor="middle" font-size="11"') +
    (t.titre ? texte(20, 24, t.titre, 'font-weight="600"') : "") +
    (t.bandeau ? texte(740, 24, t.bandeau, 'text-anchor="end" font-weight="600"') : "") +
    (t.lignes || []).map((ligne, k) => texte(380, 372 + 20 * k, ligne, 'text-anchor="middle" font-size="12"')).join("") +
    "</g>"
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
  construireProfil(racine, api);
  construireDomaine(racine, api);
  construirePasAPas(racine, api);
  construireCourbeEtude(racine, api);
  construireCourbeBus(racine, api);
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
    "#d-paysage-figure svg",
    "#e-modele-figure svg",
    "#h-thevenin-figure svg",
    "#h-solution-figure svg",
    "#i-bus-figure svg",
  ];
  for (const selecteur of selecteurs) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree: 1.4 }));
  }
  /* Le schéma principal se trace plus lentement : source, ligne, puis récepteurs, dans l'ordre de lecture. */
  const principal = racine.querySelector("#f-schema-principal svg");
  if (principal) ressources.push(api.dessiner(principal, { duree: 2.2 }));
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-cable",
      titre: "Résistance d'une liaison à deux conducteurs",
      niveau: "diagnostic",
      enonce:
        "<p>Une liaison de $20\\ \\mathrm{m}$ est réalisée en câble cuivre $2 \\times 2{,}5\\ \\mathrm{mm^2}$, de résistivité $\\rho = 1{,}8 \\times 10^{-8}\\ \\Omega\\cdot\\mathrm{m}$. Quelle est la résistance totale aller et retour, en ohms ?</p>",
      valeur: 0.288,
      unite: "Ω",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "Rl",
      etapes: [
        { texte: "Deux conducteurs : longueur parcourue $2L = 40\\ \\mathrm{m}$. Section : $2{,}5\\ \\mathrm{mm^2} = 2{,}5 \\times 10^{-6}\\ \\mathrm{m^2}$." },
        { texte: "$R_l = \\rho\\,\\dfrac{2L}{S} = 1{,}8 \\times 10^{-8} \\times \\dfrac{40}{2{,}5 \\times 10^{-6}} = 0{,}288\\ \\Omega$." },
        { texte: "Dimensions : $\\Omega\\cdot\\mathrm{m} \\times \\mathrm{m}/\\mathrm{m^2} = \\Omega$.", note: "Oublier le retour donnerait $0{,}144\\ \\Omega$ ; oublier le carré du préfixe, $0{,}000\\,288\\ \\Omega$." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 200",
          "<defs>" + marqueur("fl-c-cab") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
            '<path d="M60 60H200"/><rect x="200" y="46" width="200" height="28" rx="3"/><path d="M400 60H540V140H400"/>' +
            '<rect x="200" y="126" width="200" height="28" rx="3"/><path d="M200 140H60"/></g>' +
            '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M100 60H150" marker-end="url(#fl-c-cab)"/><path d="M480 140H440" marker-end="url(#fl-c-cab)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<text x="300" y="36" text-anchor="middle">aller : 20 m, 0,144 Ω</text><text x="300" y="178" text-anchor="middle">retour : 20 m, 0,144 Ω</text>' +
            '<text x="556" y="104">charge</text><text x="40" y="104" text-anchor="middle">source</text>' +
            '<text x="300" y="104" text-anchor="middle" font-weight="600">Rl = 0,288 Ω</text></g>',
          "Liaison de 20 mètres : deux conducteurs de 0,144 ohm, soit 0,288 ohm aller et retour"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-noeud",
      titre: "Loi des nœuds",
      niveau: "diagnostic",
      enonce:
        "<p>Un nœud reçoit un courant de $3\\ \\mathrm{A}$. Deux branches en sortent avec $1{,}2\\ \\mathrm{A}$ et $0{,}5\\ \\mathrm{A}$. Quel courant sort par la troisième branche, en ampères ?</p>",
      valeur: 1.3,
      unite: "A",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "I3",
      etapes: [
        { texte: "Conservation de la charge : $\\sum i_{\\text{entrants}} = \\sum i_{\\text{sortants}}$, soit $3 = 1{,}2 + 0{,}5 + I_3$." },
        { texte: "$I_3 = 3 - 1{,}7 = 1{,}3\\ \\mathrm{A}$, sortant.", note: "Un résultat négatif aurait signifié un courant réellement entrant par cette branche." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 520 220",
          "<defs>" + marqueur("fl-c-nd") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M60 110H260"/><path d="M260 110L420 40"/><path d="M260 110H460"/><path d="M260 110L420 180"/></g>' +
            '<circle cx="260" cy="110" r="6" fill="currentColor"/>' +
            '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M120 110H180" marker-end="url(#fl-c-nd)"/>' +
            '<path d="M320 84L368 63" marker-end="url(#fl-c-nd)"/><path d="M340 110H400" marker-end="url(#fl-c-nd)"/><path d="M320 136L368 157" marker-end="url(#fl-c-nd)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<text x="150" y="96" text-anchor="middle">3 A</text><text x="430" y="36">1,2 A</text><text x="468" y="115">1,3 A</text><text x="430" y="196">0,5 A</text>' +
            '<text x="260" y="210" text-anchor="middle" font-size="12">entre 3 A, sortent 1,2 + 1,3 + 0,5 = 3 A</text></g>',
          "Nœud recevant 3 ampères et distribuant 1,2, 1,3 et 0,5 ampère"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-source",
      titre: "Source réelle chargée",
      niveau: "diagnostic",
      enonce:
        "<p>Une source de force électromotrice $E = 24\\ \\mathrm{V}$ et de résistance interne $r = 0{,}5\\ \\Omega$ alimente une résistance de $11{,}5\\ \\Omega$. Quelle tension mesure-t-on aux bornes de la source, en volts ?</p>",
      valeur: 23,
      unite: "V",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "U",
      etapes: [
        { texte: "Une seule maille : $I = \\dfrac{24}{0{,}5 + 11{,}5} = 2\\ \\mathrm{A}$." },
        { texte: "Convention générateur : $U = E - rI = 24 - 1 = 23\\ \\mathrm{V}$, égal à $11{,}5 \\times 2$.", note: "C'est déjà le raisonnement de toute l'étude de cas : ce qui reste de $E$ après les chutes." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Caractéristique de la source et droite de charge",
          genre: "Correction visuelle",
          xTitre: "I",
          xUnite: "A",
          yTitre: "U",
          yUnite: "V",
          xMin: 0,
          xMax: 6,
          yMin: 0,
          yMax: 26,
          ratio: 0.42,
          series: [
            { id: "s", nom: "source : U = 24 - 0,5 I", couleur: "serie-1", fonction: (i) => 24 - 0.5 * i },
            { id: "c", nom: "charge : U = 11,5 I", couleur: "serie-4", fonction: (i) => 11.5 * i },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 2, 23, "2 A ; 23 V", 18);
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   E. Simulation : étude de cas et profil de potentiel
   -------------------------------------------------------------------------- */

/* Bornes des tronçons sur l'axe du parcours de la boucle. */
const TRONCONS = [
  { de: 0, a: 1, nom: "source" },
  { de: 1, a: 2, nom: "r" },
  { de: 2, a: 3.5, nom: "aller" },
  { de: 3.5, a: 5, nom: "charge" },
  { de: 5, a: 6.5, nom: "retour" },
];

function profilPotentiel(x, e, res) {
  const lin = (x0, x1, v0, v1) => v0 + ((v1 - v0) * (x - x0)) / (x1 - x0);
  if (x <= 1) return lin(0, 1, 0, e);
  if (x <= 2) return lin(1, 2, e, res.vsp);
  if (x <= 3.5) return lin(2, 3.5, res.vsp, res.va);
  if (x <= 5) return lin(3.5, 5, res.va, res.vb);
  return lin(5, 6.5, res.vb, 0);
}

function construireProfil(racine, api) {
  const conteneur = racine.querySelector("#e-profil");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 760 400",
    role: "img",
    "aria-label": "Circuit de l'étude de cas recalculé à chaque réglage : courants, tensions, potentiels des nœuds et respect de la tension minimale",
  });
  const groupe = svgEl("g");
  svg.appendChild(groupe);
  conteneur.appendChild(svg);

  const etat = { e: ETUDE.e, l: ETUDE.l, s: ETUDE.s, rch: ETUDE.rch, umin: ETUDE.umin };
  let res = calculEtude(etat.e, ETUDE.r, resistanceLigne(etat.l, etat.s), etat.rch, ETUDE.rlampe);

  const valeurs = api.sim.valeurs("#e-profil-valeurs", [
    { id: "rl", libelle: "Résistance de ligne Rl", unite: "Ω", decimales: 3 },
    { id: "i", libelle: "Courant de ligne I", unite: "A", decimales: 3 },
    { id: "us", libelle: "Tension de sortie Us", unite: "V", decimales: 2 },
    { id: "uch", libelle: "Tension au récepteur Uch", unite: "V", decimales: 2 },
    { id: "chute", libelle: "Chute de ligne rapportée à Us", unite: "%", decimales: 2 },
    { id: "pch", libelle: "Puissance du chauffage", unite: "W", decimales: 1 },
    { id: "plampe", libelle: "Puissance de la lampe", unite: "W", decimales: 2 },
    { id: "pligne", libelle: "Pertes Joule de la ligne", unite: "W", decimales: 2 },
    { id: "pr", libelle: "Pertes internes de la source", unite: "W", decimales: 2 },
    { id: "pe", libelle: "Puissance convertie E I", unite: "W", decimales: 1 },
    { id: "somme", libelle: "Somme des puissances reçues", unite: "W", decimales: 1 },
    { id: "eta", libelle: "Rendement Uch / E", unite: "%", decimales: 1 },
    { id: "marge", libelle: "Marge Uch - Umin", unite: "V", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const traceur = api.sim.traceur("#e-profil-trace", {
    titre: "Potentiel le long de la boucle",
    genre: "Simulation",
    xTitre: "parcours de la boucle",
    yTitre: "V",
    yUnite: "V",
    xMin: 0,
    xMax: 6.5,
    yMin: 0,
    yMax: 55,
    ratio: 0.42,
    series: [{ id: "v", nom: "potentiel par rapport à la borne - de la source", couleur: "serie-1", epaisseur: 2.8, fonction: (x) => profilPotentiel(x, etat.e, res) }],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, res.vb + etat.umin, "VB + Umin", 3.2, 5.3);
      c.save();
      c.fillStyle = couleurs.texte;
      c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
      c.textAlign = "center";
      for (const troncon of TRONCONS) {
        c.fillText(troncon.nom, repere.versX((troncon.de + troncon.a) / 2), repere.boite.y + repere.boite.h - 8);
      }
      c.setLineDash([3, 5]);
      c.strokeStyle = couleurs.texte;
      c.globalAlpha = 0.45;
      c.lineWidth = 1;
      for (const borne of [1, 2, 3.5, 5]) {
        c.beginPath();
        c.moveTo(repere.versX(borne), repere.boite.y);
        c.lineTo(repere.versX(borne), repere.boite.y + repere.boite.h);
        c.stroke();
      }
      c.restore();
    },
  });
  if (traceur) ressources.push(traceur);

  function afficher() {
    const rl = resistanceLigne(etat.l, etat.s);
    res = calculEtude(etat.e, ETUDE.r, rl, etat.rch, ETUDE.rlampe);
    const f = (v, d) => nombre(api, v, d);
    const respecte = res.uch >= etat.umin;
    groupe.innerHTML = circuitEtude("fl-e-pr", {
      e: f(etat.e, 0) + " V",
      r: "r = 0,2 Ω",
      aller: f(rl / 2, 3) + " Ω, aller",
      retour: f(rl / 2, 3) + " Ω, retour",
      rch: f(etat.rch, 1) + " Ω",
      i: "I = " + f(res.i, 3) + " A",
      ich: f(res.ich, 3) + " A",
      il: f(res.il, 4) + " A",
      us: "Us = " + f(res.us, 2) + " V",
      uch: f(res.uch, 2) + " V",
      vsp: f(res.vsp, 2) + " V",
      va: f(res.va, 2) + " V",
      vb: f(res.vb, 3) + " V",
      vsm: "0 V",
      titre: "Câble " + f(etat.l, 1) + " m, 2 × " + f(etat.s, 2) + " mm²",
      bandeau: "Uch ≥ " + f(etat.umin, 1) + " V : " + (respecte ? "respectée" : "non respectée"),
      lignes: [
        "E I = " + f(res.pe, 1) + " W = " + f(res.pch, 1) + " (chauffage) + " + f(res.plampe, 2) + " (lampe) + " +
          f(res.pligne, 2) + " (ligne) + " + f(res.pr, 2) + " (source)",
      ],
    });
    if (valeurs) {
      valeurs.maj({
        rl,
        i: res.i,
        us: res.us,
        uch: res.uch,
        chute: res.chute * 100,
        pch: res.pch,
        plampe: res.plampe,
        pligne: res.pligne,
        pr: res.pr,
        pe: res.pe,
        somme: res.pch + res.plampe + res.pligne + res.pr,
        eta: res.eta * 100,
        marge: res.uch - etat.umin,
      });
    }
    if (traceur) {
      traceur.definirPlage({ yMax: Math.max(10, Math.ceil((etat.e * 1.12) / 5) * 5) });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-profil-curseurs",
    [
      { id: "e", libelle: "Force électromotrice E", min: 24, max: 60, pas: 1, valeur: etat.e, unite: "V" },
      { id: "l", libelle: "Longueur de la liaison L", min: 2, max: 60, pas: 0.5, valeur: etat.l, unite: "m" },
      {
        id: "s",
        libelle: "Section d'un conducteur S",
        min: 0,
        max: SECTIONS.length - 1,
        pas: 1,
        valeur: SECTIONS.indexOf(ETUDE.s),
        format: (v) => nombre(api, SECTIONS[Math.round(v)], 2) + " mm²",
      },
      { id: "rch", libelle: "Résistance du chauffage Rch", min: 2, max: 40, pas: 0.1, valeur: etat.rch, unite: "Ω" },
      { id: "umin", libelle: "Tension minimale exigée Umin", min: 30, max: 50, pas: 0.5, valeur: etat.umin, unite: "V" },
    ],
    (lues) => {
      etat.e = lues.e;
      etat.l = lues.l;
      etat.s = SECTIONS[Math.round(lues.s)];
      etat.rch = lues.rch;
      etat.umin = lues.umin;
      afficher();
    }
  );
  if (curseurs) ressources.push(curseurs);

  afficher();
}

/* --------------------------------------------------------------------------
   E. Simulation : domaine admissible dans le plan tension-courant
   -------------------------------------------------------------------------- */

const PLAN = { x0: 70, x1: 630, y0: 350, y1: 50, iMax: 25, uMin: 30, uMax: 50 };

function versPx(i) {
  return PLAN.x0 + ((PLAN.x1 - PLAN.x0) * i) / PLAN.iMax;
}

function versPy(u) {
  return PLAN.y0 - ((PLAN.y0 - PLAN.y1) * (u - PLAN.uMin)) / (PLAN.uMax - PLAN.uMin);
}

function depuisPx(x) {
  return ((x - PLAN.x0) * PLAN.iMax) / (PLAN.x1 - PLAN.x0);
}

function construireDomaine(racine, api) {
  const conteneur = racine.querySelector("#e-domaine-plan");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 660 400",
    role: "img",
    "aria-label": "Plan tension-courant du chauffage : caractéristique de la source et de la ligne, limites de tension, de courant et de puissance, zone interdite hachurée et point de fonctionnement déplaçable",
  });

  let graduations = "";
  for (let i = 0; i <= 25; i += 5) {
    graduations +=
      '<path d="M' + versPx(i) + " " + PLAN.y0 + "V" + (PLAN.y0 + 6) + '"/>' ;
  }
  for (let u = 30; u <= 50; u += 5) {
    graduations += '<path d="M' + (PLAN.x0 - 6) + " " + versPy(u) + "H" + PLAN.x0 + '"/>';
  }
  let etiquettes = "";
  for (let i = 0; i <= 25; i += 5) etiquettes += texte(versPx(i), PLAN.y0 + 20, String(i), 'text-anchor="middle" font-size="11"');
  for (let u = 30; u <= 50; u += 5) etiquettes += texte(PLAN.x0 - 10, versPy(u) + 4, String(u), 'text-anchor="end" font-size="11"');

  const fond = svgEl("g");
  fond.innerHTML =
    '<defs><pattern id="hach-e-dom" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<path d="M0 0V8" stroke="currentColor" stroke-width="1.5" opacity="0.35"/></pattern></defs>' +
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8"><path d="M' + PLAN.x0 + " " + PLAN.y0 + "H" + (PLAN.x1 + 10) + '"/>' +
    '<path d="M' + PLAN.x0 + " " + (PLAN.y0 + 6) + "V" + (PLAN.y1 - 12) + '"/>' + graduations + "</g>" +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' + etiquettes +
    texte(PLAN.x1 + 10, PLAN.y0 + 38, "Ich [A]", 'text-anchor="end"') + texte(PLAN.x0 - 8, PLAN.y1 - 20, "Uch [V]", 'text-anchor="end"') +
    "</g>";

  const zoneTension = svgEl("rect", { fill: "url(#hach-e-dom)", stroke: "none" });
  const zoneCourant = svgEl("rect", { fill: "url(#hach-e-dom)", stroke: "none" });
  const admissible = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 12, "stroke-linecap": "round", opacity: 0.22 });
  const caracteristique = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 3, "stroke-linecap": "round" });
  const ligneUmin = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-dasharray": "8 5" });
  const ligneFusible = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-dasharray": "2 4", "stroke-linecap": "round" });
  const ligneAlim = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-dasharray": "14 6" });
  const hyperbole = svgEl("path", { fill: "none", stroke: "currentColor", "stroke-width": 1.3, "stroke-dasharray": "3 3", opacity: 0.85 });
  const losange = svgEl("path", { fill: "currentColor", stroke: "none" });
  const textes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  const tUmin = svgEl("text", { "text-anchor": "end" });
  const tFusible = svgEl("text", { "text-anchor": "middle" });
  const tAlim = svgEl("text", { "text-anchor": "middle" });
  const tOpt = svgEl("text", {});
  const tPoint = svgEl("text", { "font-size": 12 });
  const tEtat = svgEl("text", { x: PLAN.x1, y: 24, "text-anchor": "end", "font-weight": 600, "font-size": 12.5 });
  const tCar = svgEl("text", { x: PLAN.x0 + 8, y: 24, "font-size": 12 });
  textes.append(tUmin, tFusible, tAlim, tOpt, tPoint, tEtat, tCar);
  svg.append(fond, zoneTension, zoneCourant, admissible, caracteristique, ligneUmin, ligneFusible, ligneAlim, hyperbole, losange, textes);
  conteneur.appendChild(svg);

  const etat = { ich: 3.836, rl: 0.3, umin: ETUDE.umin, imax: ETUDE.imax, psmax: ETUDE.psmax };
  let dom = calculDomaine(etat.rl, etat.umin, etat.imax, etat.psmax);

  const valeurs = api.sim.valeurs("#e-domaine-valeurs", [
    { id: "eth", libelle: "Eth vue du chauffage", unite: "V", decimales: 3 },
    { id: "rth", libelle: "Rth vue du chauffage", unite: "Ω", decimales: 4 },
    { id: "ich", libelle: "Courant du chauffage Ich", unite: "A", decimales: 3 },
    { id: "uch", libelle: "Tension Uch", unite: "V", decimales: 2 },
    { id: "rch", libelle: "Résistance Rch = Uch / Ich", unite: "Ω", decimales: 2 },
    { id: "pch", libelle: "Puissance du chauffage", unite: "W", decimales: 1 },
    { id: "itot", libelle: "Courant de ligne, lampe comprise", unite: "A", decimales: 3 },
    { id: "ps", libelle: "Puissance de sortie de l'alimentation", unite: "W", decimales: 1 },
    { id: "admis", libelle: "Point courant", format: (v) => (v ? "admissible" : "interdit") },
    { id: "active", libelle: "Contrainte active", format: (v) => ["tension minimale", "calibre du fusible", "puissance de l'alimentation"][v] || "" },
    { id: "pmax", libelle: "Puissance admissible maximale", unite: "W", decimales: 1 },
    { id: "rmin", libelle: "Résistance minimale Rch", unite: "Ω", decimales: 3 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function uSur(ich) {
    return dom.eth - dom.rth * ich;
  }

  function iBorne() {
    return Math.min(PLAN.iMax, (dom.eth - PLAN.uMin) / dom.rth);
  }

  function afficher() {
    dom = calculDomaine(etat.rl, etat.umin, etat.imax, etat.psmax);
    const f = (v, d) => nombre(api, v, d);
    const iFin = iBorne();
    etat.ich = Math.min(Math.max(etat.ich, 0.2), iFin);
    const ich = etat.ich;
    const uch = uSur(ich);
    const p = uch * ich;
    const itot = ich + uch / ETUDE.rlampe;
    const ps = (ETUDE.e - ETUDE.r * itot) * itot;
    const admis = ich <= dom.ichMax + 1e-9;

    caracteristique.setAttribute("d", "M" + versPx(0) + " " + versPy(uSur(0)).toFixed(1) + "L" + versPx(iFin).toFixed(1) + " " + versPy(uSur(iFin)).toFixed(1));
    const iAdm = Math.min(dom.ichMax, iFin);
    admissible.setAttribute("d", "M" + versPx(0) + " " + versPy(uSur(0)).toFixed(1) + "L" + versPx(iAdm).toFixed(1) + " " + versPy(uSur(iAdm)).toFixed(1));

    const yUmin = versPy(Math.min(Math.max(etat.umin, PLAN.uMin), PLAN.uMax));
    ligneUmin.setAttribute("d", "M" + PLAN.x0 + " " + yUmin.toFixed(1) + "H" + PLAN.x1);
    zoneTension.setAttribute("x", PLAN.x0);
    zoneTension.setAttribute("y", yUmin.toFixed(1));
    zoneTension.setAttribute("width", PLAN.x1 - PLAN.x0);
    zoneTension.setAttribute("height", Math.max(0, PLAN.y0 - yUmin).toFixed(1));

    const iCourant = Math.min(dom.ichF, dom.ichP);
    const xF = versPx(Math.min(dom.ichF, PLAN.iMax));
    const xP = versPx(Math.min(dom.ichP, PLAN.iMax));
    ligneFusible.setAttribute("d", "M" + xF.toFixed(1) + " " + PLAN.y0 + "V" + PLAN.y1);
    ligneFusible.setAttribute("opacity", dom.ichF <= PLAN.iMax ? "1" : "0");
    ligneAlim.setAttribute("d", "M" + xP.toFixed(1) + " " + PLAN.y0 + "V" + PLAN.y1);
    ligneAlim.setAttribute("opacity", dom.ichP <= PLAN.iMax ? "1" : "0");
    const xC = versPx(Math.min(iCourant, PLAN.iMax));
    zoneCourant.setAttribute("x", xC.toFixed(1));
    zoneCourant.setAttribute("y", PLAN.y1);
    zoneCourant.setAttribute("width", Math.max(0, PLAN.x1 - xC).toFixed(1));
    zoneCourant.setAttribute("height", Math.max(0, yUmin - PLAN.y1).toFixed(1));

    tUmin.textContent = "Umin = " + f(etat.umin, 1) + " V";
    tUmin.setAttribute("x", PLAN.x1 - 4);
    tUmin.setAttribute("y", (yUmin + 16).toFixed(1));
    tFusible.textContent = "fusible";
    tFusible.setAttribute("x", xF.toFixed(1));
    tFusible.setAttribute("y", PLAN.y1 - 6);
    tFusible.setAttribute("opacity", dom.ichF <= PLAN.iMax ? "1" : "0");
    tAlim.textContent = "alimentation";
    tAlim.setAttribute("x", xP.toFixed(1));
    tAlim.setAttribute("y", PLAN.y1 + 10);
    tAlim.setAttribute("opacity", dom.ichP <= PLAN.iMax ? "1" : "0");
    if (Math.abs(xF - xP) < 70) tAlim.setAttribute("y", PLAN.y1 + 24);

    const xo = versPx(Math.min(dom.ichMax, PLAN.iMax));
    const yo = versPy(Math.max(PLAN.uMin, dom.uOpt));
    losange.setAttribute("d", "M" + xo.toFixed(1) + " " + (yo - 9).toFixed(1) + "l9 9l-9 9l-9 -9z");
    tOpt.textContent = "maximum admissible : " + f(dom.pOpt, 0) + " W";
    tOpt.setAttribute("x", (xo + 12).toFixed(1));
    tOpt.setAttribute("y", (yo - 16).toFixed(1));
    tOpt.setAttribute("text-anchor", xo > 420 ? "end" : "start");
    if (xo > 420) tOpt.setAttribute("x", (xo - 12).toFixed(1));

    let d = "";
    for (let k = 0; k <= 60; k += 1) {
      const i = 0.3 + ((PLAN.iMax - 0.3) * k) / 60;
      const u = p / i;
      if (u < PLAN.uMin - 0.5 || u > PLAN.uMax + 0.5) continue;
      d += (d ? "L" : "M") + versPx(i).toFixed(1) + " " + versPy(u).toFixed(1);
    }
    hyperbole.setAttribute("d", d);

    const px = versPx(ich);
    const py = versPy(uch);
    tPoint.textContent = "P = " + f(p, 0) + " W ; Rch = " + f(uch / ich, 2) + " Ω";
    tPoint.setAttribute("x", (px + (px > 420 ? -14 : 14)).toFixed(1));
    tPoint.setAttribute("y", (py - 16).toFixed(1));
    tPoint.setAttribute("text-anchor", px > 420 ? "end" : "start");
    tEtat.textContent = admis ? "point admissible" : "interdit : limite " + { tension: "de tension", fusible: "du fusible", alimentation: "de l'alimentation" }[dom.active.id];
    tCar.textContent = "Eth = " + f(dom.eth, 2) + " V ; Rth = " + f(dom.rth, 3) + " Ω";

    if (valeurs) {
      valeurs.maj({
        eth: dom.eth,
        rth: dom.rth,
        ich,
        uch,
        rch: uch / ich,
        pch: p,
        itot,
        ps,
        admis: admis ? 1 : 0,
        active: ["tension", "fusible", "alimentation"].indexOf(dom.active.id),
        pmax: dom.pOpt,
        rmin: dom.rMin,
      });
    }
  }

  let lecteur = null;
  let poignee = null;

  function placerPoignee() {
    if (poignee) poignee.set({ x: versPx(etat.ich), y: versPy(uSur(etat.ich)) }, false);
  }

  poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: PLAN.x0, y: PLAN.y1, largeur: PLAN.x1 - PLAN.x0, hauteur: PLAN.y0 - PLAN.y1 },
    valeur: { x: versPx(etat.ich), y: versPy(uSur(etat.ich)) },
    pas: 4,
    libelle: "Point de fonctionnement du chauffage sur la caractéristique",
    format: () => "Ich = " + nombre(api, etat.ich, 2) + " A",
    diffuserAuDepart: false,
    rappel: (mesure) => {
      etat.ich = depuisPx(mesure.x);
      afficher();
      placerPoignee();
      if (lecteur) lecteur.suivre(etat.ich);
    },
  });
  if (poignee) ressources.push(poignee);

  lecteur = api.sim.lecteur("#e-domaine-lecteur", {
    de: 0.5,
    a: 20,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Balayer la charge, de la marche à vide vers les forts courants",
    rappel: (valeur) => {
      etat.ich = valeur;
      afficher();
      placerPoignee();
    },
  });
  /* La création du lecteur a diffusé sa valeur de départ : on revient au réglage initial. */
  etat.ich = 3.836;
  if (lecteur) {
    ressources.push(lecteur);
    lecteur.suivre(etat.ich);
  }

  const curseurs = api.sim.curseurs(
    "#e-domaine-curseurs",
    [
      { id: "rl", libelle: "Résistance de ligne Rl, aller et retour", min: 0.05, max: 1.5, pas: 0.01, valeur: etat.rl, unite: "Ω" },
      { id: "umin", libelle: "Tension minimale exigée Umin", min: 40, max: 47, pas: 0.5, valeur: etat.umin, unite: "V" },
      { id: "imax", libelle: "Calibre du fusible, courant de ligne", min: 4, max: 20, pas: 1, valeur: etat.imax, unite: "A" },
      { id: "psmax", libelle: "Puissance de sortie maximale de l'alimentation", min: 150, max: 800, pas: 10, valeur: etat.psmax, unite: "W" },
    ],
    (lues) => {
      etat.rl = lues.rl;
      etat.umin = lues.umin;
      etat.imax = lues.imax;
      etat.psmax = lues.psmax;
      afficher();
      placerPoignee();
    }
  );
  if (curseurs) ressources.push(curseurs);

  afficher();
  placerPoignee();
}

/* --------------------------------------------------------------------------
   G. Animation : la méthode appliquée pas à pas
   -------------------------------------------------------------------------- */

const ETAPES_METHODE = [
  {
    nom: "données, inconnues, contraintes",
    note: "On commence par trois listes, avant tout calcul. Les unités sont converties tout de suite : 1,5 mm² = 1,5 × 10⁻⁶ m².",
    cadres: [],
    lignes: ["Données : E = 48 V, r = 0,2 Ω, câble 12,5 m en 2 × 1,5 mm², Rch = 12 Ω, lampe 480 Ω.", "Inconnues : I, Us, Uch, puissances. Contrainte : Uch ≥ 44 V."],
  },
  {
    nom: "schéma équivalent",
    note: "La ligne est représentée par ses deux conducteurs, aller et retour. C'est l'étape où l'on oublie le plus souvent le retour.",
    cadres: [[290, 44, 120, 70], [290, 266, 120, 70]],
    lignes: ["Rl = ρ 2L / S = 1,8 × 10⁻⁸ × 25 / (1,5 × 10⁻⁶) = 0,300 Ω", "soit 0,15 Ω par conducteur."],
  },
  {
    nom: "conventions",
    note: "Référence à la borne - de la source. Source en convention générateur (courant et tension de même sens), récepteurs en convention récepteur.",
    cadres: [[36, 150, 70, 90], [506, 96, 190, 150]],
    lignes: ["I sort par S+ ; Us entre S+ et S- ; Uch entre A et B.", "Le signe de chaque puissance en découle : fournie par la source, reçue par les récepteurs."],
  },
  {
    nom: "linéarité",
    note: "La lampe est modélisée par une résistance fixe : c'est une hypothèse, à signaler. Un filament réel serait non linéaire.",
    cadres: [[636, 96, 90, 150]],
    lignes: ["Résistances supposées constantes, source linéaire autour du point de fonctionnement :", "le réseau est linéaire, tous les outils de la semaine s'appliquent."],
  },
  {
    nom: "choix de la méthode",
    note: "Une seule source, un réseau réductible : la réduction série-parallèle suffit, aucun système n'est à écrire.",
    cadres: [[506, 96, 190, 150]],
    lignes: ["Rp = 12 × 480 / (12 + 480) = 11,707 Ω", "puis une seule maille : Rtot = 0,2 + 0,3 + 11,707 = 12,207 Ω."],
  },
  {
    nom: "équations et calcul",
    note: "Formules littérales d'abord, valeurs ensuite, quatre chiffres significatifs gardés jusqu'au bout.",
    cadres: [],
    valeurs: true,
    lignes: ["I = E / (r + Rl + Rp) = 48 / 12,207 = 3,932 A", "Us = 48 - 0,2 × 3,932 = 47,21 V ; Uch = Rp I = 46,03 V"],
  },
  {
    nom: "contraintes",
    note: "Chaque contrainte est vérifiée à l'endroit où elle s'applique : la tension minimale aux bornes du récepteur, pas à la sortie de l'alimentation.",
    cadres: [[506, 96, 110, 150]],
    valeurs: true,
    lignes: ["Uch = 46,03 V ≥ 44 V : respectée ; I = 3,93 A ≤ 10 A : respectée", "Us I = 185,6 W ≤ 400 W : respectée."],
  },
  {
    nom: "contrôles",
    note: "Trois contrôles indépendants : loi des nœuds en A, loi des mailles, bilan de puissance. Ils bouclent aux arrondis près.",
    cadres: [[506, 44, 190, 70]],
    valeurs: true,
    lignes: ["Nœud A : 3,836 + 0,096 = 3,932 A ; maille : 0,786 + 1,180 + 46,03 = 48,00 V", "Bilan : E I = 188,7 W = 176,6 + 4,41 + 4,64 + 3,09 W"],
  },
  {
    nom: "conclusion",
    note: "Le résultat n'est complet qu'avec ses hypothèses et sa marge : c'est ce qui permettra de le réutiliser ou de le remettre en cause.",
    cadres: [],
    valeurs: true,
    lignes: ["Chauffage : 176,6 W sous 46,03 V, marge de 2,03 V sur la tension minimale.", "Hypothèses : source linéaire, ρ fixée, résistances constantes."],
  },
];

function construirePasAPas(racine, api) {
  const conteneur = racine.querySelector("#g-pas");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 760 420",
    role: "img",
    "aria-label": "La méthode générale appliquée pas à pas à l'étude de cas, de l'énoncé au résultat vérifié",
  });
  const groupe = svgEl("g");
  svg.appendChild(groupe);
  conteneur.appendChild(svg);
  const note = noteSous(conteneur);

  const etat = { etape: 0 };
  let etapeDessinee = -1;

  function dessiner() {
    const e = etat.etape;
    const etape = ETAPES_METHODE[e];
    const avecValeurs = Boolean(etape.valeurs);
    groupe.innerHTML = circuitEtude("fl-g-pas", {
      e: "48 V",
      r: "r = 0,2 Ω",
      aller: e >= 1 ? "0,15 Ω, aller" : "câble, aller",
      retour: e >= 1 ? "0,15 Ω, retour" : "câble, retour",
      rch: "12 Ω",
      fleches: e >= 2,
      i: avecValeurs ? "I = 3,932 A" : "I",
      ich: avecValeurs ? "3,836 A" : "",
      il: avecValeurs ? "0,0959 A" : "",
      us: avecValeurs ? "Us = 47,21 V" : "Us",
      uch: avecValeurs ? "46,03 V" : "",
      va: e >= 7 ? "46,62 V" : "",
      vb: e >= 7 ? "0,590 V" : "",
      vsp: e >= 7 ? "47,21 V" : "",
      vsm: e >= 2 ? "0 V" : "",
      titre: "Étape " + (e + 1) + " sur 9 : " + etape.nom,
      cadres: etape.cadres,
      lignes: etape.lignes,
    });
    note.textContent = etape.note;
    if (etapeDessinee !== e) {
      if (etapeDessinee >= 0) fondu(api, groupe);
      etapeDessinee = e;
    }
  }

  let curseurs = null;
  let depuisLecteur = false;

  const lecteur = api.sim.lecteur("#g-pas-lecteur", {
    de: 0,
    a: 9,
    duree: 36,
    boucle: true,
    auto: false,
    libelle: "Enchaîner les étapes de la méthode",
    rappel: (valeur) => {
      const etape = Math.min(8, Math.max(0, Math.floor(valeur)));
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
    "#g-pas-curseurs",
    [{ id: "etape", libelle: "Étape", min: 0, max: 8, pas: 1, valeur: 0, format: (v) => ETAPES_METHODE[Math.round(v)].nom }],
    (lues) => {
      etat.etape = Math.round(lues.etape);
      if (!depuisLecteur && lecteur) lecteur.suivre(etat.etape + 0.5);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  if (etapeDessinee < 0) dessiner();
}

/* --------------------------------------------------------------------------
   H. Courbe : puissance et tension du chauffage selon sa résistance
   -------------------------------------------------------------------------- */

function construireCourbeEtude(racine, api) {
  const dom = calculDomaine(0.3, ETUDE.umin, ETUDE.imax, ETUDE.psmax);
  const tension = (r) => (dom.eth * r) / (r + dom.rth);
  const puissance = (r) => (tension(r) * tension(r)) / r;
  const traceur = api.sim.traceur("#h-courbe-trace", {
    titre: "Puissance de chauffe et tension au coffret selon Rch",
    genre: "Tracé",
    xTitre: "Rch",
    xUnite: "Ω",
    yTitre: "P / 100 W et U / 10 V",
    xMin: 2,
    xMax: 20,
    yMin: 0,
    yMax: 8,
    ratio: 0.46,
    series: [
      { id: "p", nom: "Pch / 100 W", couleur: "serie-1", epaisseur: 2.6, fonction: (r) => puissance(r) / 100 },
      { id: "u", nom: "Uch / 10 V", couleur: "serie-4", fonction: (r) => tension(r) / 10 },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, ETUDE.umin / 10, "Umin / 10 = 4,4");
      marquerPoint(c, repere, couleurs, dom.rMin, puissance(dom.rMin) / 100, "limite 5,56 Ω : 348 W", -10);
      marquerPoint(c, repere, couleurs, 6.2, puissance(6.2) / 100, "retenu 6,2 Ω : 318 W", 18);
      marquerPoint(c, repere, couleurs, 12, puissance(12) / 100, "initial 12 Ω : 177 W", -10);
    },
    note: "La puissance décroît quand Rch augmente, la tension croît : la plus grande puissance admissible est à la plus petite résistance qui garde la tension au-dessus de la limite.",
  });
  if (traceur) ressources.push(traceur);
}

/* --------------------------------------------------------------------------
   I. Courbe : courant de la batterie selon le réchauffage
   -------------------------------------------------------------------------- */

function courantBatterie(pNominale) {
  const rh = (24 * 24) / pNominale;
  const g = 1 / BUS.rarmoire + 1 / (BUS.rcable + rh);
  const u = BUS.eth / BUS.rth / (1 / BUS.rth + g);
  return (BUS.ebat - u) / BUS.rbat;
}

function construireCourbeBus(racine, api) {
  const traceur = api.sim.traceur("#i-courbe-trace", {
    titre: "Courant de la batterie selon la puissance nominale du réchauffage",
    genre: "Tracé",
    xTitre: "puissance nominale sous 24 V",
    xUnite: "W",
    yTitre: "Ibat",
    yUnite: "A",
    xMin: 10,
    xMax: 100,
    yMin: -1,
    yMax: 1,
    ratio: 0.44,
    series: [{ id: "ib", nom: "courant de la batterie, positif en décharge", couleur: "serie-1", epaisseur: 2.6, fonction: courantBatterie }],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, 0, "zéro : recharge en dessous", 10, 100);
      marquerPoint(c, repere, couleurs, 60, courantBatterie(60), "60 W : 0,17 A en décharge", -24);
    },
  });
  if (traceur) ressources.push(traceur);
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-1",
      titre: "Chute de tension dans un câble",
      niveau: "fondamental",
      enonce:
        "<p>Un câble cuivre $2 \\times 1{,}5\\ \\mathrm{mm^2}$ de $30\\ \\mathrm{m}$ ($\\rho = 1{,}8 \\times 10^{-8}\\ \\Omega\\cdot\\mathrm{m}$) alimente un récepteur qui absorbe $5\\ \\mathrm{A}$. Quelle est la chute de tension dans le câble, aller et retour, en volts ?</p>",
      valeur: 3.6,
      unite: "V",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "ΔU",
      etapes: [
        { texte: "$R_l = 1{,}8 \\times 10^{-8} \\times \\dfrac{60}{1{,}5 \\times 10^{-6}} = 0{,}72\\ \\Omega$ (deux conducteurs de $30\\ \\mathrm{m}$)." },
        { texte: "$\\Delta U = R_l I = 0{,}72 \\times 5 = 3{,}6\\ \\mathrm{V}$." },
        { texte: "Ordre de grandeur : $15\\ \\%$ de $24\\ \\mathrm{V}$, $1{,}6\\ \\%$ de $230\\ \\mathrm{V}$.", note: "La même chute est anodine en $230\\ \\mathrm{V}$ et rédhibitoire en très basse tension." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Chute de tension en fonction du courant",
          genre: "Correction visuelle",
          xTitre: "I",
          xUnite: "A",
          yTitre: "ΔU",
          yUnite: "V",
          xMin: 0,
          xMax: 10,
          yMin: 0,
          yMax: 8,
          ratio: 0.4,
          series: [{ id: "du", nom: "ΔU = 0,72 I", couleur: "serie-1", fonction: (i) => 0.72 * i }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 5, 3.6, "5 A ; 3,6 V");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-2",
      titre: "Rendement d'une source réelle chargée",
      niveau: "fondamental",
      enonce:
        "<p>Une source $E = 24\\ \\mathrm{V}$, $r = 0{,}4\\ \\Omega$ alimente directement une charge de $5{,}6\\ \\Omega$. Quel est le rendement, rapport de la puissance reçue par la charge à la puissance convertie $EI$, en pour cent ?</p>",
      valeur: 93.33,
      unite: "%",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "η",
      etapes: [
        { texte: "$I = 24/(0{,}4 + 5{,}6) = 4\\ \\mathrm{A}$." },
        { texte: "$P_{ch} = 5{,}6 \\times 16 = 89{,}6\\ \\mathrm{W}$ ; pertes $0{,}4 \\times 16 = 6{,}4\\ \\mathrm{W}$ ; $EI = 96\\ \\mathrm{W} = 89{,}6 + 6{,}4$." },
        { texte: "$\\eta = 89{,}6/96 = 93{,}33\\ \\%$, égal à $U/E = 22{,}4/24$.", note: "Dans une chaîne série, le rendement est le rapport des tensions." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 170",
          '<g fill="none" stroke="currentColor" stroke-width="2"><rect x="40" y="50" width="480" height="36" rx="4"/><path d="M488 50V86"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<text x="280" y="36" text-anchor="middle">E I = 96 W</text><text x="264" y="74" text-anchor="middle">charge : 89,6 W</text>' +
            '<text x="504" y="112" text-anchor="middle">6,4 W</text><text x="504" y="130" text-anchor="middle" font-size="11">pertes r</text>' +
            '<text x="280" y="160" text-anchor="middle" font-size="12">η = 89,6 / 96 = 93,3 %</text></g>',
          "Barre de puissance : 96 watts convertis, 89,6 reçus par la charge et 6,4 perdus dans la source"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-1",
      titre: "Choisir la méthode : diviseur chargé par une entrée",
      niveau: "intermédiaire",
      enonce:
        "<p>Un diviseur formé de $R_1 = 15\\ \\mathrm{k\\Omega}$ (en haut) et $R_2 = 10\\ \\mathrm{k\\Omega}$ (en bas) est alimenté sous $24\\ \\mathrm{V}$. Sa sortie est raccordée à une entrée de $20\\ \\mathrm{k\\Omega}$. Choisissez la méthode la plus courte et calculez la tension lue par l'entrée, en volts.</p>",
      valeur: 9.6 * 20 / 26,
      unite: "V",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "U",
      etapes: [
        { texte: "Une charge branchée sur un réseau fixe : l'équivalent de Thévenin vu de l'entrée est le plus direct." },
        { texte: "À vide : $E_{th} = 24 \\times 10/25 = 9{,}6\\ \\mathrm{V}$ ; source éteinte : $R_{th} = 15 /\\!/ 10 = 6\\ \\mathrm{k\\Omega}$." },
        { texte: "$U = 9{,}6 \\times \\dfrac{20}{20 + 6} = 7{,}385\\ \\mathrm{V}$." },
        { texte: "Contrôle par réduction : $10 /\\!/ 20 = 6{,}667\\ \\mathrm{k\\Omega}$, $U = 24 \\times 6{,}667/21{,}667 = 7{,}385\\ \\mathrm{V}$.", note: "L'entrée fait perdre $23\\ \\%$ de la tension à vide : elle est trop peu résistante pour ce diviseur." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 260",
          "<defs>" + marqueur("fl-k3") + marqueur("fl-k3-u", "var(--serie-2)") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
            '<path d="M90 106V40H170"/><circle cx="90" cy="130" r="24"/><rect x="170" y="26" width="100" height="28" rx="3"/>' +
            '<path d="M270 40H400V80"/><rect x="386" y="80" width="28" height="100" rx="3"/><path d="M400 180V220H90V154"/></g>' +
            '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M320 40H356" marker-end="url(#fl-k3)"/></g>' +
            '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M460 210V56" marker-end="url(#fl-k3-u)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<text x="90" y="124" text-anchor="middle" font-weight="600">+</text><text x="120" y="136">Eth = 9,6 V</text>' +
            '<text x="220" y="80" text-anchor="middle">Rth = 6 kΩ</text><text x="376" y="136" text-anchor="end">20 kΩ</text>' +
            '<text x="338" y="28" text-anchor="middle">0,369 mA</text><text x="472" y="136" fill="var(--serie-2)">7,385 V</text>' +
            '<text x="300" y="250" text-anchor="middle" font-size="12">diviseur 15 kΩ et 10 kΩ vu de sa sortie</text></g>',
          "Équivalent de Thévenin de 9,6 volts et 6 kilohms chargé par 20 kilohms : 7,385 volts"
        );
      },
    })
  );

  const ex4 = (() => {
    const rb = 0.3 + 12;
    const ra = parallele(8, rb);
    const i = 48 / (0.2 + ra);
    const ua = ra * i;
    return { ua, ub: (ua * 12) / rb, i, ib: ua / rb, ia: ua / 8 };
  })();

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-2",
      titre: "Deux récepteurs répartis le long d'une ligne",
      niveau: "intermédiaire",
      enonce:
        "<p>Une source idéale de $48\\ \\mathrm{V}$ alimente une ligne. Un premier tronçon, de résistance $0{,}2\\ \\Omega$ aller et retour, mène au point $A$, où est raccordé un récepteur de $8\\ \\Omega$. Un second tronçon, de $0{,}3\\ \\Omega$ aller et retour, prolonge la ligne jusqu'au point $B$, où est raccordé un récepteur de $12\\ \\Omega$. Quelle tension reçoit le récepteur situé en $B$, en volts ?</p>",
      valeur: ex4.ub,
      unite: "V",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "UB",
      etapes: [
        { texte: "Réduction depuis l'extrémité : second tronçon et récepteur $B$ en série, $0{,}3 + 12 = 12{,}3\\ \\Omega$." },
        { texte: "En parallèle avec le récepteur $A$ : $8 /\\!/ 12{,}3 = 4{,}847\\ \\Omega$ ; en série avec le premier tronçon : $5{,}047\\ \\Omega$." },
        { texte: "$I = 48/5{,}047 = " + nombreMath(api, ex4.i, 3) + "\\ \\mathrm{A}$ ; $U_A = 4{,}847 \\times I = " + nombreMath(api, ex4.ua, 2) + "\\ \\mathrm{V}$." },
        { texte: "Diviseur sur la branche $B$ : $U_B = U_A \\times 12/12{,}3 = " + nombreMath(api, ex4.ub, 2) + "\\ \\mathrm{V}$.", note: "Contrôle au nœud $A$ : $" + nombreMath(api, ex4.ia, 3) + " + " + nombreMath(api, ex4.ib, 3) + " = " + nombreMath(api, ex4.i, 3) + "\\ \\mathrm{A}$. Le premier tronçon porte le courant des deux récepteurs : c'est lui qui doit être le plus gros." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 640 250",
          "<defs>" + marqueur("fl-k4") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
            '<path d="M60 106V50H140"/><circle cx="60" cy="130" r="22"/><rect x="140" y="36" width="90" height="28" rx="3"/>' +
            '<path d="M230 50H380"/><path d="M300 50V90"/><rect x="286" y="90" width="28" height="80" rx="3"/><path d="M300 170V200"/>' +
            '<rect x="380" y="36" width="90" height="28" rx="3"/><path d="M470 50H540V90"/><rect x="526" y="90" width="28" height="80" rx="3"/>' +
            '<path d="M540 170V200H60V152"/></g>' +
            '<g fill="currentColor" stroke="none"><circle cx="300" cy="50" r="4.5"/><circle cx="300" cy="200" r="4.5"/></g>' +
            '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M240 50H280" marker-end="url(#fl-k4)"/><path d="M300 60V84" marker-end="url(#fl-k4)"/><path d="M490 50H520" marker-end="url(#fl-k4)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
            '<text x="36" y="118" text-anchor="end" font-weight="600">+</text><text x="60" y="135" text-anchor="middle" font-size="11">48 V</text>' +
            '<text x="185" y="86" text-anchor="middle">0,2 Ω</text><text x="425" y="86" text-anchor="middle">0,3 Ω</text>' +
            '<text x="276" y="134" text-anchor="end">8 Ω</text><text x="566" y="134">12 Ω</text>' +
            '<text x="300" y="30" text-anchor="middle" font-weight="600">A</text><text x="540" y="30" text-anchor="middle" font-weight="600">B</text>' +
            '<text x="258" y="40" text-anchor="middle" font-size="11">' + nombre(api, ex4.i, 2) + ' A</text>' +
            '<text x="324" y="80" font-size="11">' + nombre(api, ex4.ia, 2) + ' A</text>' +
            '<text x="505" y="40" text-anchor="middle" font-size="11">' + nombre(api, ex4.ib, 2) + ' A</text>' +
            '<text x="320" y="236" text-anchor="middle" font-size="12">UA = ' + nombre(api, ex4.ua, 2) + ' V ; UB = ' + nombre(api, ex4.ub, 2) + ' V ; référence : conducteur du bas</text></g>',
          "Ligne à deux tronçons alimentant deux récepteurs, avec les courants et les tensions obtenus"
        );
      },
    })
  );

  const sMin = (1.8e-8 * 60) / ((24 - 22.8) / (22.8 / 5.76) - 0.1) * 1e6;

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-avance",
      titre: "Section minimale sous contrainte de tension",
      niveau: "avancé",
      enonce:
        "<p>Un réchauffeur de $100\\ \\mathrm{W}$ nominal sous $24\\ \\mathrm{V}$ (résistance supposée constante) est alimenté par une source $E = 24\\ \\mathrm{V}$, $r = 0{,}1\\ \\Omega$, à travers une liaison cuivre de $30\\ \\mathrm{m}$ ($\\rho = 1{,}8 \\times 10^{-8}\\ \\Omega\\cdot\\mathrm{m}$). Il doit recevoir au moins $22{,}8\\ \\mathrm{V}$. Quelle est la section minimale d'un conducteur, en mm² ? Quelle section normalisée retenez-vous ?</p>",
      valeur: sMin,
      unite: "mm²",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "Smin",
      etapes: [
        { texte: "Résistance du réchauffeur : $R_h = 24^2/100 = 5{,}76\\ \\Omega$. À la limite, $I = 22{,}8/5{,}76 = 3{,}958\\ \\mathrm{A}$." },
        { texte: "Budget de chute : $(r + R_l)\\,I \\leq 24 - 22{,}8 = 1{,}2\\ \\mathrm{V}$, donc $r + R_l \\leq 0{,}3032\\ \\Omega$ et $R_l \\leq 0{,}2032\\ \\Omega$." },
        { texte: "$S_{\\min} = \\rho\\,\\dfrac{2L}{R_{l,\\max}} = 1{,}8 \\times 10^{-8} \\times \\dfrac{60}{0{,}2032} = " + nombreMath(api, sMin, 2) + "\\ \\mathrm{mm^2}$." },
        { texte: "Section normalisée supérieure : $6\\ \\mathrm{mm^2}$. Vérification : $R_l = 0{,}18\\ \\Omega$, $U_h = 24 \\times 5{,}76/(5{,}76 + 0{,}28) = 22{,}89\\ \\mathrm{V} \\geq 22{,}8\\ \\mathrm{V}$.", note: "La résistance interne de la source consomme à elle seule un tiers du budget de chute : une source plus raide autoriserait une section plus faible." },
      ],
      visuelCorrection(conteneur, moteur) {
        const uh = (s) => (24 * 5.76) / (5.76 + 0.1 + (1.8e-8 * 60) / (s * 1e-6));
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Tension au réchauffeur selon la section",
          genre: "Correction visuelle",
          xTitre: "S",
          xUnite: "mm²",
          yTitre: "Uh",
          yUnite: "V",
          xMin: 1,
          xMax: 12,
          yMin: 20,
          yMax: 24,
          ratio: 0.42,
          series: [{ id: "u", nom: "tension au réchauffeur", couleur: "serie-1", fonction: uh }],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 22.8, "limite 22,8 V");
            marquerPoint(c, repere, couleurs, sMin, 22.8, "Smin = " + nombre(api, sMin, 2) + " mm²", 18);
            marquerPoint(c, repere, couleurs, 6, uh(6), "6 mm² : " + nombre(api, uh(6), 2) + " V", -10);
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  const rParasite = (47.2 - 42.1) / 7 - 0.3;

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-diagnostic",
      titre: "Chauffage qui ne chauffe plus assez",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Sur l'installation de l'étude de cas, équipée d'un chauffage neuf, l'exploitant signale un coffret qui peine à rester hors gel. Sous charge, on mesure $47{,}2\\ \\mathrm{V}$ aux bornes de l'alimentation, $42{,}1\\ \\mathrm{V}$ aux bornes du chauffage, et une pince ampèremétrique indique $7{,}0\\ \\mathrm{A}$ dans le câble. Le câble devrait présenter $0{,}30\\ \\Omega$ aller et retour. Quelle résistance parasite s'est ajoutée à la liaison, en ohms ? Quelle puissance y est dissipée, et que faire ?</p>",
      valeur: rParasite,
      unite: "Ω",
      tolerance: 0.03,
      chiffres: 3,
      libelleChamp: "Rparasite",
      etapes: [
        { texte: "Résistance apparente de la liaison : $(47{,}2 - 42{,}1)/7{,}0 = 0{,}729\\ \\Omega$, pour $0{,}30\\ \\Omega$ attendus." },
        { texte: "Résistance parasite : $0{,}729 - 0{,}300 = " + nombreMath(api, rParasite, 3) + "\\ \\Omega$." },
        { texte: "Puissance dissipée : $" + nombreMath(api, rParasite, 3) + " \\times 7{,}0^2 = " + nombreMath(api, rParasite * 49, 1) + "\\ \\mathrm{W}$, concentrée en un point : une borne desserrée ou oxydée, une épissure, un contact de sectionneur dégradé.", note: "Vingt watts dans un bornier suffisent à le carboniser : c'est un risque d'incendie, pas seulement un défaut de chauffage." },
        { texte: "Localisation : mesurer, sous charge, la chute de tension le long du conducteur aller puis du retour, puis de part et d'autre de chaque connexion ; l'échauffement se voit aussi à la caméra thermique. Remède : refaire la connexion, puis contrôler la tension au chauffage, qui doit revenir vers $44\\ \\mathrm{V}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Profil du potentiel mesuré le long de l'aller",
          genre: "Correction visuelle",
          xTitre: "position sur le conducteur aller",
          xUnite: "m",
          yTitre: "V",
          yUnite: "V",
          xMin: 0,
          xMax: 12.5,
          yMin: 42,
          yMax: 48,
          ratio: 0.42,
          series: [
            { id: "sain", nom: "câble sain : 0,15 Ω par conducteur", couleur: "serie-4", fonction: (x) => 47.2 - (0.15 * 7 * x) / 12.5 },
            {
              id: "defaut",
              nom: "résistance parasite à 8 m (hypothèse de localisation)",
              couleur: "serie-1",
              epaisseur: 2.6,
              fonction: (x) => 47.2 - (0.15 * 7 * x) / 12.5 - (x > 8 ? rParasite * 7 : 0),
            },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 8, 47.2 - (0.15 * 7 * 8) / 12.5 - rParasite * 7, "saut de " + nombre(api, rParasite * 7, 1) + " V", 18);
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte("#k-exercices-blocs", {
      id: "k-conceptuel",
      titre: "Contrainte de tension et transfert maximal",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi, dans l'étude de cas, la tension minimale exigée fixe à elle seule la plus grande puissance de chauffe, et pourquoi le théorème du transfert maximal de puissance n'y joue aucun rôle.</p>",
      motsCles: [
        ["courant", "chute", "chutes"],
        ["tension baisse", "tension diminue", "la tension", "baisse", "diminue"],
        ["moitie", "e/2", "eth/2", "24 v", "50"],
        ["rendement", "pertes", "perte", "gaspill"],
      ],
      minimum: 2,
      exemple: "Trois phrases suffisent : ce que fait le courant aux chutes en amont, ce qui se passe à la limite de tension, et où se trouverait l'adaptation.",
      etapes: [
        { texte: "Pour augmenter la puissance d'une charge résistive, on diminue sa résistance ; le courant augmente, donc les chutes dans la source et dans la ligne augmentent, et la tension de la charge baisse." },
        { texte: "Tant que la tension reste au-dessus de la moitié de $E_{th}$, la puissance croît quand la tension baisse : on descend donc jusqu'à la limite $U_{\\min}$, qui devient la contrainte active." },
        { texte: "Le transfert maximal se produirait vers $24\\ \\mathrm{V}$, soit la moitié de $E_{th}$, avec un rendement de $50\\ \\%$ : très en dessous de la tension exigée, il est hors du domaine admissible.", note: "Dans une installation d'énergie, on travaille toujours très loin de l'adaptation, du côté des fortes tensions et des bons rendements." },
      ],
      visuelCorrection(conteneur, moteur) {
        const dom = calculDomaine(0.3, 44, 1e9, 1e9);
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Puissance en fonction de la tension de la charge",
          genre: "Correction visuelle",
          xTitre: "Uch",
          xUnite: "V",
          yTitre: "P",
          yUnite: "W",
          xMin: 0,
          xMax: 48,
          yMin: 0,
          yMax: 1250,
          ratio: 0.42,
          series: [{ id: "p", nom: "P = Uch (Eth - Uch) / Rth", couleur: "serie-1", fonction: (u) => Math.max(0, (u * (dom.eth - u)) / dom.rth) }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, dom.eth / 2, (dom.eth * dom.eth) / (4 * dom.rth), "adaptation : 1151 W sous 24 V", -10);
            marquerPoint(c, repere, couleurs, 44, (44 * (dom.eth - 44)) / dom.rth, "limite 44 V : 348 W", -10);
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

/* Circuit de l'étude pour la question d'interprétation de schéma. */
const DESSIN_QUIZ =
  '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
  '<circle cx="50" cy="130" r="20"/><path d="M50 110V40H80"/><rect x="80" y="28" width="60" height="24" rx="3"/><path d="M140 40H180"/>' +
  '<rect x="180" y="28" width="80" height="24" rx="3"/><path d="M260 40H420"/><path d="M320 40V80"/><rect x="308" y="80" width="24" height="90" rx="3"/>' +
  '<path d="M320 170V220"/><path d="M420 40V80"/><rect x="408" y="80" width="24" height="90" rx="3"/><path d="M420 170V220H260"/>' +
  '<rect x="180" y="208" width="80" height="24" rx="3"/><path d="M180 220H50V150"/></g>' +
  '<g fill="currentColor" stroke="none"><circle cx="320" cy="40" r="4"/><circle cx="320" cy="220" r="4"/></g>' +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
  '<text x="50" y="126" text-anchor="middle" font-weight="600">+</text><text x="50" y="145" text-anchor="middle" font-size="10">48 V</text>' +
  '<text x="110" y="72" text-anchor="middle">0,2 Ω</text><text x="220" y="72" text-anchor="middle">0,15 Ω</text><text x="220" y="252" text-anchor="middle">0,15 Ω</text>' +
  '<text x="300" y="130" text-anchor="end">12 Ω</text><text x="440" y="130">480 Ω</text></g>';

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Quelle loi traduit la conservation de la charge électrique en régime continu ?</p>",
        options: ["La loi d'Ohm", "La loi des nœuds", "La loi des mailles", "Le théorème de Thévenin"],
        bonnes: [1],
        explication: "Aucun nœud n'accumule de charge : ce qui entre ressort. La loi des mailles traduit l'existence du potentiel.",
        resume: "Statut de la loi des nœuds",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Pour calculer la chute de tension d'une liaison, on prend la résistance d'un seul conducteur, car le retour est au potentiel de référence.</p>",
        reponse: false,
        explication: "Le courant parcourt l'aller et le retour : $R_l = \\rho\\,2L/S$. Le retour n'est pas à $0\\ \\mathrm{V}$ côté charge, il porte une chute lui aussi.",
        resume: "Conducteur retour",
      },
      {
        type: "calcul",
        enonce: "<p>Une source $12\\ \\mathrm{V}$, $0{,}5\\ \\Omega$ alimente une charge de $5{,}5\\ \\Omega$. Quelle puissance reçoit la charge, en watts ?</p>",
        valeur: 22,
        unite: "W",
        chiffres: 1,
        explication: "$I = 12/6 = 2\\ \\mathrm{A}$ ; $P = 5{,}5 \\times 4 = 22\\ \\mathrm{W}$ ; la source perd $2\\ \\mathrm{W}$ et convertit $24\\ \\mathrm{W}$.",
        resume: "Source réelle chargée",
      },
      {
        type: "calcul",
        enonce: "<p>Une alimentation convertit $50\\ \\mathrm{W}$ ; la ligne et la source perdent $5\\ \\mathrm{W}$ au total. Quel est le rendement, en pour cent ?</p>",
        valeur: 90,
        unite: "%",
        chiffres: 1,
        explication: "$\\eta = 45/50 = 90\\ \\%$ : le bilan de puissance donne directement la puissance utile.",
        resume: "Rendement par le bilan",
      },
      {
        type: "courte",
        enonce: "<p>Citez deux vérifications indépendantes d'un résultat de circuit continu.</p>",
        motsCles: [
          ["bilan", "puissance"],
          ["noeud", "noeuds", "maille", "mailles", "kirchhoff"],
          ["dimension", "unite", "unites", "homogen"],
          ["ordre de grandeur", "cas limite", "limite", "vide", "court-circuit"],
        ],
        minimum: 2,
        explication: "Analyse dimensionnelle, ordre de grandeur, cas limites, lois des nœuds et des mailles, bilan de puissance : deux d'entre elles, au moins, pour chaque résultat.",
        resume: "Vérifications",
      },
      {
        type: "qcm",
        enonce: "<p>Un équivalent $(E_{th}, R_{th})$ alimente une charge résistive qui doit recevoir au moins $U_{\\min} > E_{th}/2$. Où se trouve la puissance maximale admissible ?</p>",
        options: ["À $R_L = R_{th}$", "À $U = U_{\\min}$", "À $U = E_{th}$", "À mi-chemin entre $U_{\\min}$ et $E_{th}$"],
        bonnes: [1],
        explication: "Au-dessus de $E_{th}/2$, la puissance croît quand la tension baisse : l'optimum sature la contrainte, $P = U_{\\min}(E_{th} - U_{\\min})/R_{th}$.",
        resume: "Puissance sous contrainte",
      },
      {
        type: "vraiFaux",
        enonce: "<p>À courant égal, diviser par deux la section d'un câble double la chute de tension.</p>",
        reponse: true,
        explication: "$R = \\rho L/S$ : la résistance, donc la chute $RI$, est inversement proportionnelle à la section.",
        resume: "Section et chute",
      },
      {
        type: "calcul",
        enonce: "<p>Une liaison de $10\\ \\mathrm{m}$ porte $10\\ \\mathrm{A}$ ; la chute admissible est de $1\\ \\mathrm{V}$ et $\\rho = 1{,}8 \\times 10^{-8}\\ \\Omega\\cdot\\mathrm{m}$. Quelle section minimale faut-il, en mm² ?</p>",
        valeur: 3.6,
        unite: "mm²",
        chiffres: 2,
        explication: "$S = \\rho\\,2LI/\\Delta U = 1{,}8 \\times 10^{-8} \\times 20 \\times 10/1 = 3{,}6 \\times 10^{-6}\\ \\mathrm{m^2}$, soit $3{,}6\\ \\mathrm{mm^2}$ ; on retient $4\\ \\mathrm{mm^2}$.",
        resume: "Section minimale",
      },
      {
        type: "schema",
        enonce: "<p>Dans le circuit de l'étude de cas, quel élément est traversé par le courant le plus faible ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 480 260",
        dessin: DESSIN_QUIZ,
        zones: [
          { x: 76, y: 18, largeur: 68, hauteur: 44, etiquette: "résistance interne" },
          { x: 176, y: 18, largeur: 88, hauteur: 44, etiquette: "conducteur aller" },
          { x: 296, y: 76, largeur: 48, hauteur: 98, etiquette: "chauffage" },
          { x: 396, y: 76, largeur: 48, hauteur: 98, etiquette: "lampe témoin", juste: true },
          { x: 176, y: 198, largeur: 88, hauteur: 44, etiquette: "conducteur retour" },
        ],
        explication: "La source, les deux conducteurs portent tout le courant de ligne ; au nœud, il se partage, et la lampe de $480\\ \\Omega$ n'en prend que $0{,}096\\ \\mathrm{A}$ contre $3{,}84\\ \\mathrm{A}$ pour le chauffage.",
        resume: "Lecture de schéma",
      },
      {
        type: "qcm",
        enonce: "<p>Lesquels de ces énoncés sont des conventions, et non des lois ?</p>",
        options: [
          { texte: "Le choix du nœud de référence", juste: true },
          { texte: "La convention récepteur pour une charge", juste: true },
          { texte: "La loi des mailles" },
          { texte: "Le sens de référence choisi pour un courant", juste: true },
        ],
        multiple: true,
        explication: "Référence, sens de référence et convention récepteur ou générateur sont des choix d'écriture ; la loi des mailles traduit l'existence du potentiel.",
        resume: "Loi ou convention",
      },
    ],
    { titre: "Dix questions sur les circuits continus" }
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
      { categorie: "Lois", question: "Quelles sont les trois relations de base d'un circuit continu, et leur statut ?", reponse: "Loi des nœuds et loi des mailles : lois physiques. Loi d'Ohm $u = Ri$ : modèle constitutif, valable dans une plage." },
      { categorie: "Convention", question: "Qu'est-ce qui distingue les conventions récepteur et générateur ?", reponse: "Récepteur : flèches de courant et de tension opposées, $p = ui$ reçue. Générateur : même sens, $p = ui$ fournie." },
      { categorie: "Formule", question: "Quelle est la résistance d'une liaison à deux conducteurs ?", reponse: "$R_l = \\rho\\,2L/S$, avec $S$ en $\\mathrm{m^2}$ : $1\\ \\mathrm{mm^2} = 10^{-6}\\ \\mathrm{m^2}$." },
      { categorie: "Modèle", question: "Que vaut la tension au récepteur dans le modèle source, ligne, charges ?", reponse: "$U_{ch} = E - (r + R_l)I$, avec $I = E/(r + R_l + R_{eq})$ : ce qui reste après les chutes." },
      { categorie: "Bilan", question: "Comment s'écrit le bilan de puissance d'une boucle ?", reponse: "$EI = rI^2 + R_lI^2 + \\sum P_k$ ; le rendement vaut $U_{ch}/E$." },
      { categorie: "Dimensionnement", question: "Quelle est la puissance maximale sous contrainte $U \\geq U_{\\min}$ ?", reponse: "$P = U_{\\min}(E_{th} - U_{\\min})/R_{th}$, obtenue pour $R_{\\min} = R_{th}U_{\\min}/(E_{th} - U_{\\min})$." },
      { categorie: "Dimensionnement", question: "Quelle section minimale garantit une chute $\\Delta U_{\\max}$ ?", reponse: "$S_{\\min} = \\rho\\,2LI/\\Delta U_{\\max}$, puis section normalisée supérieure." },
      { categorie: "Méthode", question: "Quelle méthode pour une charge à dimensionner ?", reponse: "L'équivalent de Thévenin vu de cette charge, en gardant toutes les autres charges dans le réseau." },
      { categorie: "Vigilance", question: "Comment choisir une valeur normalisée ?", reponse: "La plus petite valeur qui respecte la contrainte à la borne défavorable de sa tolérance, pas la plus proche du minimum calculé." },
      {
        categorie: "Industriel",
        question: "Pourquoi un budget de courant sur le bus 24 V secouru ?",
        reponse: "Au-delà de 6 A, la tension du bus passe sous 24 V et la batterie se décharge alors que le chargeur est en service.",
        rappel: "Réchauffage de 60 W : 6,34 A, 0,17 A tirés de la batterie.",
      },
    ],
    { titre: "Dix cartes sur les circuits continus" }
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
        enonce: "<p>Un équivalent $E_{th} = 50\\ \\mathrm{V}$, $R_{th} = 1\\ \\Omega$ alimente une charge qui doit recevoir au moins $45\\ \\mathrm{V}$. Quelle puissance maximale peut-elle recevoir, en watts ?</p>",
        valeur: 225,
        unite: "W",
        chiffres: 0,
        explication: "$I_{\\max} = (50 - 45)/1 = 5\\ \\mathrm{A}$ ; $P = 45 \\times 5 = 225\\ \\mathrm{W}$, pour $R_{\\min} = 9\\ \\Omega$.",
        resume: "Puissance sous contrainte (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Choisir la valeur normalisée la plus proche au-dessus de la résistance minimale calculée garantit toujours la contrainte de tension.</p>",
        reponse: false,
        explication: "La tolérance peut faire descendre la valeur réelle sous le minimum : avec $5{,}6\\ \\Omega$ à $\\pm 5\\ \\%$, la tension tombait à $43{,}83\\ \\mathrm{V}$.",
        resume: "Tolérance (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Une source convertit $240\\ \\mathrm{W}$ ; la ligne dissipe $12\\ \\mathrm{W}$ et la résistance interne $8\\ \\mathrm{W}$. Quelle puissance reçoivent les charges, en watts ?</p>",
        valeur: 220,
        unite: "W",
        chiffres: 0,
        explication: "Bilan : $240 - 12 - 8 = 220\\ \\mathrm{W}$, rendement $91{,}7\\ \\%$.",
        resume: "Bilan de puissance (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Deux branches en parallèle entre un nœud et la référence : $12\\ \\mathrm{V}$ en série avec $1\\ \\Omega$, et $6\\ \\mathrm{V}$ en série avec $2\\ \\Omega$. Quelle est la tension du nœud à vide, en volts ?</p>",
        valeur: 10,
        unite: "V",
        chiffres: 1,
        explication: "Millman : $(12/1 + 6/2)/(1/1 + 1/2) = 15/1{,}5 = 10\\ \\mathrm{V}$. Révisé du cours Théorèmes de Thévenin, Norton et superposition.",
        resume: "Millman (cours précédent)",
      },
      {
        type: "qcm",
        enonce: "<p>Un diviseur de $6\\ \\mathrm{k\\Omega}$ (en haut) et $3\\ \\mathrm{k\\Omega}$ (en bas) est alimenté par une source idéale. Quelle résistance de Thévenin présente sa sortie ?</p>",
        options: ["$9\\ \\mathrm{k\\Omega}$", "$3\\ \\mathrm{k\\Omega}$", "$2\\ \\mathrm{k\\Omega}$", "$4{,}5\\ \\mathrm{k\\Omega}$"],
        bonnes: [2],
        explication: "Source éteinte, les deux résistances relient la sortie à la référence : $6 /\\!/ 3 = 2\\ \\mathrm{k\\Omega}$. Révisé du cours Théorèmes de Thévenin, Norton et superposition.",
        resume: "Résistance vue (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Dans une maille, une source de $48\\ \\mathrm{V}$ alimente une charge ; les chutes en amont valent $1{,}45\\ \\mathrm{V}$ et $2{,}175\\ \\mathrm{V}$. Quelle tension reste aux bornes de la charge, en volts ?</p>",
        valeur: 44.375,
        unite: "V",
        tolerance: 0.005,
        chiffres: 2,
        explication: "Loi des mailles : $48 - 1{,}45 - 2{,}175 = 44{,}375\\ \\mathrm{V}$, la solution retenue de l'étude de cas. Révisé du cours Lois de Kirchhoff.",
        resume: "Loi des mailles (Lois de Kirchhoff)",
      },
      {
        type: "calcul",
        enonce: "<p>Calculez $1{,}8 \\times 10^{-8} \\times 25 / (1{,}5 \\times 10^{-6})$.</p>",
        valeur: 0.3,
        unite: "Ω",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$1{,}8 \\times 25/1{,}5 = 30$, et $10^{-8}/10^{-6} = 10^{-2}$ : $30 \\times 10^{-2} = 0{,}3\\ \\Omega$, la résistance du câble de l'étude de cas. Révisé du cours Diagnostic initial et remise à niveau mathématique.",
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
    titre: "Où en suis-je sur les circuits continus ?",
  });
  if (auto) ressources.push(auto);
}
