/* ==========================================================================
   cours/condensateurs-et-champ-electrique/cours.js
   Condensateurs et champ électrique.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";

/* Permittivité du vide, en farads par mètre. */
const EPS0 = 8.854e-12;

/* Bus continu du variateur de la pompe (sections H et I). */
const BUS = { u: 400 * Math.SQRT2, uMax: 440 * Math.SQRT2, ceq: 2.2e-3, re: 47e3, rp: 47 };

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

/** Ligne verticale en tirets marquant l'instant courant sur un tracé. */
function ligneVerticale(c, repere, couleurs, x) {
  const px = repere.versX(x);
  c.save();
  c.setLineDash([4, 4]);
  c.strokeStyle = couleurs.texte;
  c.globalAlpha = 0.6;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(px, repere.boite.y);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
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

function longueursDe(points) {
  const liste = [];
  for (let k = 0; k < points.length - 1; k += 1) {
    liste.push(Math.hypot(points[k + 1].x - points[k].x, points[k + 1].y - points[k].y));
  }
  return liste;
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
  construireAnimationCharge(racine, api);
  construirePlan(racine, api);
  construireCharge(racine, api);
  construireAssociation(racine, api);
  construireCourbeEquilibrage(racine, api);
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
  const selecteurs = [
    "#d-structure-figure svg",
    "#e-deplacement-figure svg",
    "#f-chronogramme svg",
    "#h-banc-figure svg",
  ];
  for (const selecteur of selecteurs) {
    const svg = racine.querySelector(selecteur);
    if (svg) ressources.push(api.dessiner(svg, { duree: 1.4 }));
  }
  /* Le schéma principal se trace plus lentement : les trois instants dans l'ordre de lecture. */
  const principal = racine.querySelector("#f-schema-principal svg");
  if (principal) ressources.push(api.dessiner(principal, { duree: 2.2 }));
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-charge",
      titre: "Charge transportée par un courant constant",
      niveau: "diagnostic",
      enonce: "<p>Un courant constant de $2\\ \\mathrm{mA}$ circule pendant $5\\ \\mathrm{s}$. Quelle charge a-t-il transportée, en millicoulombs ?</p>",
      valeur: 10,
      unite: "mC",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "q",
      etapes: [
        { texte: "Courant constant : $q = I\\,\\Delta t$, aire du rectangle sous la courbe $i(t)$." },
        { texte: "$q = 2 \\times 10^{-3} \\times 5 = 10^{-2}\\ \\mathrm{C} = 10\\ \\mathrm{mC}$.", note: "C'est exactement la charge qu'accumule un condensateur alimenté à courant constant pendant ce temps." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "La charge est l'aire sous le courant",
          genre: "Correction visuelle",
          xTitre: "t",
          xUnite: "s",
          yTitre: "i",
          yUnite: "mA",
          xMin: 0,
          xMax: 7,
          yMin: 0,
          yMax: 3,
          ratio: 0.4,
          series: [{ id: "i", nom: "i(t) = 2 mA pendant 5 s", couleur: "serie-1", fonction: (t) => (t <= 5 ? 2 : 0) }],
          surDessin({ c, repere, couleurs }) {
            c.save();
            c.fillStyle = couleurs.texte;
            c.globalAlpha = 0.12;
            c.fillRect(repere.versX(0), repere.versY(2), repere.versX(5) - repere.versX(0), repere.versY(0) - repere.versY(2));
            c.globalAlpha = 1;
            c.font = "500 12px 'JetBrains Mono', ui-monospace, monospace";
            c.textAlign = "center";
            c.fillText("aire = 10 mC", repere.versX(2.5), repere.versY(1));
            c.restore();
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-energie",
      titre: "Énergie reçue sous puissance constante",
      niveau: "diagnostic",
      enonce: "<p>Un appareil reçoit une puissance constante de $10\\ \\mathrm{W}$ pendant $3\\ \\mathrm{min}$. Quelle énergie a-t-il reçue, en joules ?</p>",
      valeur: 1800,
      unite: "J",
      tolerance: 0.02,
      chiffres: 0,
      libelleChamp: "W",
      etapes: [
        { texte: "$W = \\int p\\,\\mathrm{d}t = P\\,\\Delta t$ pour une puissance constante." },
        { texte: "$\\Delta t = 3 \\times 60 = 180\\ \\mathrm{s}$, donc $W = 10 \\times 180 = 1800\\ \\mathrm{J}$.", note: "Convertir d'abord les minutes en secondes : l'erreur fréquente donne $30\\ \\mathrm{J}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 200",
          '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8"><path d="M60 160H520M60 170V30"/></g>' +
            '<rect x="60" y="70" width="380" height="90" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2.4"/>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<text x="52" y="74" text-anchor="end">10 W</text><text x="440" y="184" text-anchor="middle">180 s</text>' +
            '<text x="250" y="120" text-anchor="middle">W = 10 × 180 = 1800 J</text>' +
            '<text x="528" y="164">t</text><text x="52" y="30" text-anchor="end">p</text></g>',
          "Rectangle de hauteur 10 watts et de largeur 180 secondes : 1800 joules"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-pente",
      titre: "Pente d'une tension en rampe",
      niveau: "diagnostic",
      enonce: "<p>Une tension croît linéairement de $0$ à $6\\ \\mathrm{V}$ en $2\\ \\mathrm{ms}$. Quelle est sa dérivée $\\mathrm{d}u/\\mathrm{d}t$, en volts par seconde ?</p>",
      valeur: 3000,
      unite: "V/s",
      tolerance: 0.02,
      chiffres: 0,
      libelleChamp: "du/dt",
      etapes: [
        { texte: "Variation linéaire : la dérivée est la pente, $\\Delta u/\\Delta t$." },
        { texte: "$\\dfrac{6}{2 \\times 10^{-3}} = 3000\\ \\mathrm{V/s}$, soit $3\\ \\mathrm{V/ms}$.", note: "Multipliée par une capacité, cette pente donnera un courant : $i = C\\,\\mathrm{d}u/\\mathrm{d}t$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Rampe de tension",
          genre: "Correction visuelle",
          xTitre: "t",
          xUnite: "ms",
          yTitre: "u",
          yUnite: "V",
          xMin: 0,
          xMax: 3,
          yMin: 0,
          yMax: 7,
          ratio: 0.4,
          series: [{ id: "u", nom: "u(t), pente 3 V/ms", couleur: "serie-1", fonction: (t) => Math.min(6, 3 * t) }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 2, 6, "6 V en 2 ms");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : la charge d'un condensateur plan, pas à pas
   -------------------------------------------------------------------------- */

function construireAnimationCharge(racine, api) {
  const conteneur = racine.querySelector("#d-charge");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 400",
    role: "img",
    "aria-label": "Charge d'un condensateur plan à travers une résistance : électrons en mouvement dans les fils, charges des armatures, lignes de champ et jauges de tension et de courant",
  });
  const fond = svgEl("g");
  fond.innerHTML =
    "<defs>" + marqueur("fl-d-ch") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
    '<path d="M80 166V70H190"/><rect x="190" y="57" width="100" height="26" rx="3"/><path d="M290 70H460V140"/>' +
    '<path d="M460 250V310H80V214"/><circle cx="80" cy="190" r="24"/>' +
    '<path d="M200 310V324M186 324H214M192 331H208M197 338H203"/></g>' +
    '<g stroke="currentColor" stroke-width="2.2" fill="currentColor"><rect x="370" y="140" width="180" height="10" rx="2" fill-opacity="0.25"/>' +
    '<rect x="370" y="240" width="180" height="10" rx="2" fill-opacity="0.25"/></g>' +
    '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M320 70H356" marker-end="url(#fl-d-ch)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    '<text x="80" y="185" text-anchor="middle" font-weight="600">+</text><text x="80" y="206" text-anchor="middle" font-weight="600">-</text>' +
    '<text x="48" y="195" text-anchor="end">E</text><text x="240" y="104" text-anchor="middle">R</text>' +
    '<text x="338" y="58" text-anchor="middle">i</text><text x="222" y="334" font-size="11.5">référence 0 V</text>' +
    '<text x="566" y="200">C</text></g>';
  const champ = svgEl("g", { stroke: "currentColor", "stroke-width": 1.6, fill: "none", "stroke-linecap": "round" });
  const charges = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 13, "font-weight": 600 });
  const electrons = svgEl("g", { fill: "currentColor", stroke: "none" });
  const jauges = svgEl("g");
  svg.append(fond, champ, charges, electrons, jauges);
  conteneur.appendChild(svg);

  /* Chemins des électrons : de l'armature haute vers la borne +, de la borne - vers l'armature basse. */
  const haut = [{ x: 460, y: 140 }, { x: 460, y: 70 }, { x: 80, y: 70 }, { x: 80, y: 166 }];
  const bas = [{ x: 80, y: 214 }, { x: 80, y: 310 }, { x: 460, y: 310 }, { x: 460, y: 250 }];
  const chemins = [haut, bas].map((points) => {
    const longueurs = longueursDe(points);
    return { points, longueurs, total: longueurs.reduce((a, b) => a + b, 0) };
  });
  const pas = 30;
  const points = [];
  for (const chemin of chemins) {
    for (let s = 0; s < chemin.total; s += pas) {
      const rond = svgEl("circle", { r: 3.4 });
      electrons.appendChild(rond);
      points.push({ chemin, s0: s, rond });
    }
  }

  const valeurs = api.sim.valeurs("#d-charge-valeurs", [
    { id: "t", libelle: "Temps rapporté à RC", decimales: 2 },
    { id: "u", libelle: "Tension u / E", unite: "%", decimales: 1 },
    { id: "i", libelle: "Courant i / I0", unite: "%", decimales: 1 },
    { id: "id", libelle: "Courant de déplacement dans l'isolant / I0", unite: "%", decimales: 1 },
    { id: "wc", libelle: "Énergie stockée / (C E² / 2)", unite: "%", decimales: 1 },
    { id: "wr", libelle: "Énergie dissipée dans R / (C E² / 2)", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function jauge(y, libelle, fraction) {
    return (
      '<text x="80" y="' + (y + 11) + '" font-family="ui-monospace, monospace" font-size="12" fill="currentColor">' + libelle + "</text>" +
      '<rect x="200" y="' + y + '" width="360" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>' +
      '<rect x="200" y="' + y + '" width="' + (360 * fraction).toFixed(1) + '" height="14" rx="3" style="fill: var(--serie-1)"/>' +
      '<text x="572" y="' + (y + 11) + '" font-family="ui-monospace, monospace" font-size="12" fill="currentColor">' + Math.round(fraction * 100) + " %</text>"
    );
  }

  function afficher(t) {
    const q = 1 - Math.exp(-t);
    const i = Math.exp(-t);
    /* Déplacement des électrons proportionnel à la charge transférée. */
    const decalage = q * 150;
    for (const p of points) {
      const s = (p.s0 + decalage) % p.chemin.total;
      const position = pointSurChemin(p.chemin.points, p.chemin.longueurs, s);
      const cache = position.y > 166 && position.y < 214 && Math.abs(position.x - 80) < 2;
      p.rond.setAttribute("cx", position.x.toFixed(1));
      p.rond.setAttribute("cy", position.y.toFixed(1));
      p.rond.setAttribute("opacity", cache ? "0" : "0.85");
    }
    const nCharges = Math.round(q * 9);
    let m = "";
    for (let k = 0; k < nCharges; k += 1) {
      const x = 382 + k * 19;
      m += '<text x="' + x + '" y="132" text-anchor="middle">+</text><text x="' + x + '" y="268" text-anchor="middle">-</text>';
    }
    charges.innerHTML = m;
    const nLignes = Math.round(q * 8);
    let lignes = "";
    for (let k = 0; k < nLignes; k += 1) {
      const x = 384 + k * 22;
      lignes += '<path d="M' + x + ' 156V232" marker-end="url(#fl-d-ch)"/>';
    }
    champ.innerHTML = lignes;
    jauges.innerHTML = jauge(358, "u / E", q) + jauge(378, "i / I0", i);
    if (valeurs) {
      valeurs.maj({
        t,
        u: q * 100,
        i: i * 100,
        id: i * 100,
        wc: q * q * 100,
        wr: (1 - Math.exp(-2 * t)) * 100,
      });
    }
  }

  const lecteur = api.sim.lecteur("#d-charge-lecteur", {
    de: 0,
    a: 5,
    duree: 10,
    boucle: false,
    auto: false,
    libelle: "Charger le condensateur",
    rappel: (valeur) => afficher(valeur),
  });
  if (lecteur) ressources.push(lecteur);
  else afficher(0);
}

/* --------------------------------------------------------------------------
   E. Simulation : le condensateur plan
   -------------------------------------------------------------------------- */

const PLAN = { xG: 260, xD: 560, yBas: 270, dMin: 0.2, dMax: 5, pxMin: 20, pxMax: 190 };

function pxDe(d) {
  return PLAN.pxMin + ((d - PLAN.dMin) / (PLAN.dMax - PLAN.dMin)) * (PLAN.pxMax - PLAN.pxMin);
}

function construirePlan(racine, api) {
  const conteneur = racine.querySelector("#e-plan");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 352",
    role: "img",
    "aria-label": "Condensateur plan en coupe dont l'armature supérieure se déplace, avec charges, lignes de champ, source et interrupteur",
  });
  const groupe = svgEl("g");
  svg.appendChild(groupe);
  conteneur.appendChild(svg);
  const note = noteSous(conteneur);

  const etat = { mode: 0, s: 100, d: 1, er: 1, u: 1000, q0: null };
  const reference = { q: (EPS0 * 0.01) / 1e-3 * 1000 };

  const valeurs = api.sim.valeurs("#e-plan-valeurs", [
    { id: "c", libelle: "Capacité C = ε0 εr S / d", unite: "pF", decimales: 2 },
    { id: "u", libelle: "Tension U", unite: "V", decimales: 0 },
    { id: "q", libelle: "Charge Q = C U", unite: "nC", decimales: 2 },
    { id: "e", libelle: "Champ E = U / d", unite: "MV/m", decimales: 3 },
    { id: "w", libelle: "Énergie W = C U² / 2", unite: "µJ", decimales: 2 },
    { id: "f", libelle: "Force d'attraction Q² / (2 ε S)", unite: "mN", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function calculer() {
    const eps = EPS0 * etat.er;
    const s = etat.s * 1e-4;
    const d = etat.d * 1e-3;
    const c = (eps * s) / d;
    let q;
    let u;
    if (etat.mode === 1 && etat.q0 != null) {
      q = etat.q0;
      u = q / c;
    } else {
      u = etat.u;
      q = c * u;
    }
    return { c, q, u, e: u / d, w: 0.5 * c * u * u, f: (q * q) / (2 * eps * s) };
  }

  function dessiner() {
    const r = calculer();
    const px = pxDe(etat.d);
    const yT = PLAN.yBas - px;
    const isole = etat.mode === 1;
    const f = (v, dec) => nombre(api, v, dec);

    let m =
      "<defs>" + marqueur("fl-e-pl") + marqueur("fl-e-pl-u", "var(--serie-2)") + "</defs>" +
      '<g stroke="currentColor" stroke-width="2.2" fill="currentColor">' +
      '<rect x="' + PLAN.xG + '" y="' + (yT - 10) + '" width="' + (PLAN.xD - PLAN.xG) + '" height="10" rx="2" fill-opacity="0.25"/>' +
      '<rect x="' + PLAN.xG + '" y="' + PLAN.yBas + '" width="' + (PLAN.xD - PLAN.xG) + '" height="10" rx="2" fill-opacity="0.25"/></g>' +
      '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
      '<path d="M100 166V40H150"/>' +
      '<path d="M190 40H230V' + (yT - 5) + "H" + PLAN.xG + '"/>' +
      (isole ? "" : '<path d="M150 40H190"/>') +
      '<path d="M100 214V318H' + (PLAN.xG + 150) + "V" + (PLAN.yBas + 10) + '"/>' +
      '<circle cx="100" cy="190" r="24"/>' +
      '<path d="M200 318V328M188 328H212M193 334H207M197 340H203"/></g>';
    if (isole) {
      m +=
        '<g stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"><path d="M150 40L184 20"/></g>' +
        '<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="150" cy="40" r="3.5"/><circle cx="190" cy="40" r="3.5"/></g>';
    }
    /* Lignes de champ : nombre proportionnel à l'intensité du champ. */
    const nLignes = Math.round(borner((r.e / 1e6) * 6, 0, 18));
    if (nLignes > 0 && px > 26) {
      m += '<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round">';
      const largeur = PLAN.xD - PLAN.xG - 30;
      for (let k = 0; k < nLignes; k += 1) {
        const x = PLAN.xG + 15 + (nLignes === 1 ? largeur / 2 : (k * largeur) / (nLignes - 1));
        m += '<path d="M' + x.toFixed(1) + " " + (yT + 4) + "V" + (PLAN.yBas - 6) + '" marker-end="url(#fl-e-pl)"/>';
      }
      m += "</g>";
    }
    /* Charges : nombre proportionnel à la charge, rapporté aux réglages de départ. */
    const nCharges = Math.round(borner((r.q / reference.q) * 8, 0, 22));
    m += '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5" font-weight="600">';
    for (let k = 0; k < nCharges; k += 1) {
      const x = PLAN.xG + 8 + (k * (PLAN.xD - PLAN.xG - 16)) / Math.max(1, nCharges - 1);
      m += '<text x="' + x.toFixed(1) + '" y="' + (yT - 14) + '" text-anchor="middle">+</text>';
      m += '<text x="' + x.toFixed(1) + '" y="' + (PLAN.yBas + 26) + '" text-anchor="middle">-</text>';
    }
    m += "</g>";
    /* Cote d, tension, jauge de champ. */
    m +=
      '<g stroke="currentColor" stroke-width="1.3" fill="none"><path d="M' + (PLAN.xD + 50) + " " + yT + "V" + PLAN.yBas + '"/>' +
      '<path d="M' + (PLAN.xD + 42) + " " + yT + "H" + (PLAN.xD + 58) + "M" + (PLAN.xD + 42) + " " + PLAN.yBas + "H" + (PLAN.xD + 58) + '"/></g>' +
      '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M60 ' + (PLAN.yBas + 4) + "V" + (yT + 6) + '" marker-end="url(#fl-e-pl-u)"/></g>';
    const fraction = borner(r.e / 3e6, 0, 1.2);
    m +=
      '<rect x="470" y="16" width="200" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>' +
      '<rect x="470" y="16" width="' + (Math.min(1, fraction) * 200).toFixed(1) + '" height="12" rx="3" style="fill: var(--serie-' + (fraction >= 1 ? 5 : 1) + ')"/>' +
      '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
      '<text x="470" y="46">E / 3 MV/m (air sec) : ' + f(fraction * 100, 0) + " %</text>" +
      '<text x="100" y="185" text-anchor="middle" font-weight="600">+</text>' +
      '<text x="100" y="206" text-anchor="middle" font-size="11">' + (isole ? "" : f(etat.u, 0) + " V") + "</text>" +
      '<text x="' + (PLAN.xD + 62) + '" y="' + ((yT + PLAN.yBas) / 2 + 4) + '">d = ' + f(etat.d, 1) + " mm</text>" +
      '<text x="48" y="' + ((yT + PLAN.yBas) / 2 + 4) + '" text-anchor="end" fill="var(--serie-2)">U</text>' +
      '<text x="470" y="68">S = ' + f(etat.s, 0) + " cm², εr = " + f(etat.er, 1) + "</text>" +
      '<text x="170" y="64" text-anchor="middle" font-size="11">' + (isole ? "isolé : Q imposée" : "relié : U imposée") + "</text>" +
      '<text x="' + (PLAN.xD + 12) + '" y="' + (yT - 22) + '" font-size="11">poignée</text>' +
      '<text x="222" y="340" font-size="11">armature fixe, référence 0 V</text></g>';
    groupe.innerHTML = m;

    let texte = isole
      ? "Mode isolé : la charge Q est figée à la valeur qu'elle avait à l'ouverture de l'interrupteur ; le curseur de tension est sans effet, et c'est U = Q / C qui change quand vous déplacez l'armature."
      : "Mode relié : la source impose U ; la charge Q = C U suit chaque changement de géométrie.";
    if (etat.er === 1 && r.e >= 3e6) texte += " Le champ dépasse la rigidité diélectrique de l'air sec : un arc est probable.";
    note.textContent = texte;

    if (valeurs) {
      valeurs.maj({ c: r.c * 1e12, u: r.u, q: r.q * 1e9, e: r.e / 1e6, w: r.w * 1e6, f: r.f * 1e3 });
    }
  }

  let curseurs = null;
  let depuisPoignee = false;
  let poignee = null;

  poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: PLAN.xD + 16, y: PLAN.yBas - pxDe(PLAN.dMin) - 5 },
    a: { x: PLAN.xD + 16, y: PLAN.yBas - pxDe(PLAN.dMax) - 5 },
    min: PLAN.dMin,
    max: PLAN.dMax,
    pas: 0.1,
    valeur: etat.d,
    libelle: "Armature supérieure : distance entre les armatures",
    format: (mesure) => "d = " + nombre(api, mesure.valeur, 1) + " mm",
    diffuserAuDepart: false,
    rappel: (mesure) => {
      etat.d = Math.round(mesure.valeur * 10) / 10;
      if (curseurs) {
        depuisPoignee = true;
        curseurs.definir("d", etat.d);
        depuisPoignee = false;
      } else {
        dessiner();
      }
    },
  });
  if (poignee) ressources.push(poignee);

  curseurs = api.sim.curseurs(
    "#e-plan-curseurs",
    [
      { id: "mode", libelle: "Condensateur", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (Math.round(v) === 1 ? "isolé de la source" : "relié à la source") },
      { id: "s", libelle: "Surface en regard S", min: 20, max: 400, pas: 10, valeur: etat.s, unite: "cm²" },
      { id: "d", libelle: "Distance entre armatures d", min: PLAN.dMin, max: PLAN.dMax, pas: 0.1, valeur: etat.d, unite: "mm" },
      { id: "er", libelle: "Permittivité relative εr", min: 1, max: 10, pas: 0.1, valeur: etat.er },
      { id: "u", libelle: "Tension de la source U", min: 0, max: 3000, pas: 50, valeur: etat.u, unite: "V" },
    ],
    (lues) => {
      const mode = Math.round(lues.mode);
      if (mode === 1 && etat.mode !== 1) {
        /* À l'ouverture de l'interrupteur, la charge présente est figée. */
        etat.q0 = calculer().q;
      }
      if (mode === 0) etat.q0 = null;
      etat.mode = mode;
      etat.s = lues.s;
      etat.d = lues.d;
      etat.er = lues.er;
      etat.u = lues.u;
      if (!depuisPoignee && poignee) poignee.set(etat.d, false);
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  else dessiner();
}

/* --------------------------------------------------------------------------
   E. Simulation : charge à courant constant ou à travers une résistance
   -------------------------------------------------------------------------- */

function construireCharge(racine, api) {
  const etat = { mode: 1, c: 100, e: 12, r: 1, i: 2, x: 0 };
  let donnees = null;

  /* Intégration pas à pas de i = C du/dt, sans solution analytique. */
  function calculer() {
    const c = etat.c * 1e-6;
    const e = etat.e;
    const n = 4000;
    const courantConstant = etat.mode === 0;
    const r = etat.r * 1e3;
    const i0 = etat.i * 1e-3;
    const duree = courantConstant ? (1.25 * c * e) / i0 : 8 * r * c;
    const dt = duree / n;
    const t = [0];
    const u = [0];
    const i = [courantConstant ? i0 : e / r];
    const ws = [0];
    const wr = [0];
    let uk = 0;
    let wsk = 0;
    let wrk = 0;
    for (let k = 1; k <= n; k += 1) {
      let ik;
      if (courantConstant) {
        ik = uk < e ? i0 : 0;
        wsk += uk * ik * dt;
      } else {
        ik = (e - uk) / r;
        wsk += e * ik * dt;
        wrk += r * ik * ik * dt;
      }
      uk = Math.min(courantConstant ? e : Infinity, uk + (ik * dt) / c);
      t.push(k * dt);
      u.push(uk);
      i.push(courantConstant ? (uk < e ? i0 : 0) : (e - uk) / r);
      ws.push(wsk);
      wr.push(wrk);
    }
    donnees = { t, u, i, ws, wr, duree, c, e, imax: courantConstant ? i0 : e / r, courantConstant };
  }

  function indice(x) {
    return Math.min(donnees.t.length - 1, Math.max(0, Math.round((x / donnees.duree) * (donnees.t.length - 1))));
  }

  const tCourant = () => etat.x * donnees.duree;

  calculer();

  const traceurU = api.sim.traceur("#e-charge-tension", {
    titre: "Tension aux bornes du condensateur",
    genre: "Simulation",
    xTitre: "t",
    xUnite: "s",
    yTitre: "u",
    yUnite: "V",
    xMin: 0,
    xMax: donnees.duree,
    yMin: 0,
    yMax: 13.2,
    ratio: 0.42,
    series: [
      {
        id: "u",
        nom: "u(t), jusqu'à l'instant courant",
        couleur: "serie-1",
        epaisseur: 2.6,
        fonction: (x) => (x <= tCourant() + 1e-12 ? donnees.u[indice(x)] : NaN),
      },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, donnees.e, "E = " + nombre(api, donnees.e, 1) + " V");
      const k = indice(tCourant());
      marquerPoint(c, repere, couleurs, donnees.t[k], donnees.u[k], "u = " + nombre(api, donnees.u[k], 2) + " V");
    },
  });
  if (traceurU) ressources.push(traceurU);

  const traceurI = api.sim.traceur("#e-charge-courant", {
    titre: "Courant de charge",
    genre: "Simulation",
    xTitre: "t",
    xUnite: "s",
    yTitre: "i",
    yUnite: "mA",
    xMin: 0,
    xMax: donnees.duree,
    yMin: 0,
    yMax: 13.2,
    ratio: 0.36,
    series: [
      {
        id: "i",
        nom: "i(t), jusqu'à l'instant courant",
        couleur: "serie-4",
        epaisseur: 2.6,
        fonction: (x) => (x <= tCourant() + 1e-12 ? donnees.i[indice(x)] * 1e3 : NaN),
      },
    ],
    surDessin({ c, repere, couleurs }) {
      const k = indice(tCourant());
      marquerPoint(c, repere, couleurs, donnees.t[k], donnees.i[k] * 1e3, "i = " + nombre(api, donnees.i[k] * 1e3, 2) + " mA");
    },
  });
  if (traceurI) ressources.push(traceurI);

  const valeurs = api.sim.valeurs("#e-charge-valeurs", [
    { id: "t", libelle: "Temps t", unite: "s", decimales: 3 },
    { id: "u", libelle: "Tension u", unite: "V", decimales: 2 },
    { id: "i", libelle: "Courant i", unite: "mA", decimales: 3 },
    { id: "ws", libelle: "Énergie fournie par la source", unite: "mJ", decimales: 3 },
    { id: "wc", libelle: "Énergie stockée C u² / 2", unite: "mJ", decimales: 3 },
    { id: "wr", libelle: "Énergie dissipée dans R", unite: "mJ", decimales: 3 },
    { id: "part", libelle: "Part stockée de l'énergie fournie", unite: "%", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher() {
    const k = indice(tCourant());
    const wc = 0.5 * donnees.c * donnees.u[k] * donnees.u[k];
    if (traceurU) {
      traceurU.definirPlage({ xMin: 0, xMax: donnees.duree, yMin: 0, yMax: donnees.e * 1.1 });
    }
    if (traceurI) {
      traceurI.definirPlage({ xMin: 0, xMax: donnees.duree, yMin: 0, yMax: donnees.imax * 1e3 * 1.1 });
    }
    if (valeurs) {
      valeurs.maj({
        t: donnees.t[k],
        u: donnees.u[k],
        i: donnees.i[k] * 1e3,
        ws: donnees.ws[k] * 1e3,
        wc: wc * 1e3,
        wr: donnees.wr[k] * 1e3,
        part: donnees.ws[k] > 0 ? (wc / donnees.ws[k]) * 100 : 0,
      });
    }
  }

  let lecteur = null;
  lecteur = api.sim.lecteur("#e-charge-lecteur", {
    de: 0,
    a: 1,
    duree: 8,
    boucle: false,
    auto: false,
    libelle: "Lancer la charge",
    rappel: (valeur) => {
      etat.x = valeur;
      afficher();
    },
  });
  if (lecteur) ressources.push(lecteur);

  const curseurs = api.sim.curseurs(
    "#e-charge-curseurs",
    [
      { id: "mode", libelle: "Mode de charge", min: 0, max: 1, pas: 1, valeur: etat.mode, format: (v) => (Math.round(v) === 0 ? "courant constant I" : "source E et résistance R") },
      { id: "c", libelle: "Capacité C", min: 10, max: 1000, pas: 10, valeur: etat.c, unite: "µF" },
      { id: "e", libelle: "Tension de la source, ou consigne, E", min: 1, max: 24, pas: 0.5, valeur: etat.e, unite: "V" },
      { id: "r", libelle: "Résistance R (second mode)", min: 0.1, max: 10, pas: 0.1, valeur: etat.r, unite: "kΩ" },
      { id: "i", libelle: "Courant imposé I (premier mode)", min: 0.5, max: 10, pas: 0.5, valeur: etat.i, unite: "mA" },
    ],
    (lues) => {
      etat.mode = Math.round(lues.mode);
      etat.c = lues.c;
      etat.e = lues.e;
      etat.r = lues.r;
      etat.i = lues.i;
      calculer();
      afficher();
    }
  );
  if (curseurs) ressources.push(curseurs);
  else afficher();
}

/* --------------------------------------------------------------------------
   E. Simulation : associations série et parallèle
   -------------------------------------------------------------------------- */

function construireAssociation(racine, api) {
  const conteneur = racine.querySelector("#e-association");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 450",
    role: "img",
    "aria-label": "Deux condensateurs associés en série ou en parallèle sous une tension U, avec leurs charges, leurs tensions et leurs énergies",
  });
  const groupe = svgEl("g");
  svg.appendChild(groupe);
  conteneur.appendChild(svg);
  const note = noteSous(conteneur);

  const etat = { mode: 0, c1: 10, c2: 40, u: 100 };
  let modeDessine = -1;

  const valeurs = api.sim.valeurs("#e-association-valeurs", [
    { id: "ceq", libelle: "Capacité équivalente", unite: "µF", decimales: 2 },
    { id: "q1", libelle: "Charge Q1", unite: "µC", decimales: 1 },
    { id: "q2", libelle: "Charge Q2", unite: "µC", decimales: 1 },
    { id: "u1", libelle: "Tension U1", unite: "V", decimales: 2 },
    { id: "u2", libelle: "Tension U2", unite: "V", decimales: 2 },
    { id: "w1", libelle: "Énergie W1", unite: "mJ", decimales: 2 },
    { id: "w2", libelle: "Énergie W2", unite: "mJ", decimales: 2 },
    { id: "w", libelle: "Énergie totale C_eq U² / 2", unite: "mJ", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function calculer() {
    const c1 = etat.c1 * 1e-6;
    const c2 = etat.c2 * 1e-6;
    if (etat.mode === 0) {
      const ceq = (c1 * c2) / (c1 + c2);
      const q = ceq * etat.u;
      return { ceq, q1: q, q2: q, u1: q / c1, u2: q / c2 };
    }
    return { ceq: c1 + c2, q1: c1 * etat.u, q2: c2 * etat.u, u1: etat.u, u2: etat.u };
  }

  function condensateur(x, y, nom, q, uk, f) {
    /* Condensateur vertical : armature + en haut (y - 7), armature - en bas (y + 7). */
    return (
      '<path d="M' + (x - 24) + " " + (y - 7) + "H" + (x + 24) + "M" + (x - 24) + " " + (y + 7) + "H" + (x + 24) + '" stroke="currentColor" stroke-width="3.2" fill="none"/>' +
      '<path d="M' + (x + 44) + " " + (y + 26) + "V" + (y - 22) + '" stroke="var(--serie-2)" stroke-width="2" fill="none" marker-end="url(#fl-e-as-u)"/>' +
      '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
      '<text x="' + (x - 30) + '" y="' + (y - 12) + '" text-anchor="end">+' + f(q * 1e6, 0) + " µC</text>" +
      '<text x="' + (x - 30) + '" y="' + (y + 22) + '" text-anchor="end">-' + f(q * 1e6, 0) + " µC</text>" +
      '<text x="' + (x + 54) + '" y="' + (y - 2) + '" fill="var(--serie-2)">' + nom.replace("C", "U") + "</text>" +
      '<text x="' + (x + 54) + '" y="' + (y + 14) + '" fill="var(--serie-2)">' + f(uk, 1) + " V</text>" +
      '<text x="' + (x - 30) + '" y="' + (y + 42) + '" text-anchor="end" font-weight="600">' + nom + " = " + f(nom === "C1" ? etat.c1 : etat.c2, 0) + " µF</text></g>"
    );
  }

  function barre(y, largeur, libelle, texte, remplissage) {
    return (
      '<text x="30" y="' + (y + 11) + '">' + libelle + "</text>" +
      '<rect x="190" y="' + y + '" width="' + Math.max(1, largeur).toFixed(1) + '" height="14" rx="3" style="fill: var(' + remplissage + ')"/>' +
      '<text x="' + (196 + Math.max(1, largeur)).toFixed(1) + '" y="' + (y + 11) + '">' + texte + "</text>"
    );
  }

  function dessiner() {
    const r = calculer();
    const f = (v, d) => nombre(api, v, d);
    const w1 = 0.5 * etat.c1 * 1e-6 * r.u1 * r.u1;
    const w2 = 0.5 * etat.c2 * 1e-6 * r.u2 * r.u2;
    let m =
      "<defs>" + marqueur("fl-e-as") + marqueur("fl-e-as-u", "var(--serie-2)") + "</defs>" +
      '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
      '<circle cx="80" cy="180" r="24"/><path d="M80 156V50"/><path d="M80 204V310"/>' +
      '<path d="M200 310V322M188 322H212M193 328H207M197 334H203"/>';
    if (etat.mode === 0) {
      m +=
        '<path d="M80 50H400V103"/><path d="M400 117V243"/><path d="M400 257V310H80"/></g>' +
        '<g fill="currentColor" stroke="none"><circle cx="400" cy="180" r="4.5"/></g>' +
        condensateur(400, 110, "C1", r.q1, r.u1, f) +
        '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12"><text x="388" y="176" text-anchor="end">nœud isolé :</text><text x="388" y="194" text-anchor="end">charge nette nulle</text></g>' +
        condensateur(400, 250, "C2", r.q2, r.u2, f);
    } else {
      m +=
        '<path d="M80 50H520"/><path d="M80 310H520"/>' +
        '<path d="M320 50V173M320 187V310"/><path d="M520 50V173M520 187V310"/></g>' +
        '<g fill="currentColor" stroke="none"><circle cx="320" cy="50" r="4.5"/><circle cx="320" cy="310" r="4.5"/></g>' +
        condensateur(320, 180, "C1", r.q1, r.u1, f) +
        condensateur(520, 180, "C2", r.q2, r.u2, f);
    }
    const maxQ = Math.max(r.q1, r.q2, 1e-12);
    const maxW = Math.max(w1, w2, 1e-12);
    m +=
      '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M130 50H170" marker-end="url(#fl-e-as)"/></g>' +
      '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
      '<text x="80" y="176" text-anchor="middle" font-weight="600">+</text>' +
      '<text x="92" y="244">U = ' + f(etat.u, 0) + " V</text>" +
      '<text x="182" y="46">i</text>' +
      '<text x="20" y="26" font-weight="600">' + (etat.mode === 0 ? "Série : même charge, tensions additionnées" : "Parallèle : même tension, charges additionnées") + "</text>" +
      '<text x="200" y="352" text-anchor="middle" font-size="11.5">référence 0 V</text>' +
      barre(368, (r.q1 / maxQ) * 300, "charge Q1", f(r.q1 * 1e6, 0) + " µC", "--serie-1") +
      barre(386, (r.q2 / maxQ) * 300, "charge Q2", f(r.q2 * 1e6, 0) + " µC", "--serie-1") +
      barre(410, (w1 / maxW) * 300, "énergie W1", f(w1 * 1e3, 1) + " mJ", "--serie-4") +
      barre(428, (w2 / maxW) * 300, "énergie W2", f(w2 * 1e3, 1) + " mJ", "--serie-4") +
      "</g>";
    groupe.innerHTML = m;

    note.textContent =
      etat.mode === 0
        ? "En série, le plus petit condensateur porte la plus grande tension : U1 / U2 = C2 / C1. La capacité équivalente est inférieure à la plus petite des deux."
        : "En parallèle, les deux condensateurs ont la tension de la source ; les charges et les énergies sont proportionnelles aux capacités.";

    if (modeDessine !== etat.mode) {
      if (modeDessine >= 0) fondu(api, groupe);
      modeDessine = etat.mode;
    }

    if (valeurs) {
      valeurs.maj({
        ceq: r.ceq * 1e6,
        q1: r.q1 * 1e6,
        q2: r.q2 * 1e6,
        u1: r.u1,
        u2: r.u2,
        w1: w1 * 1e3,
        w2: w2 * 1e3,
        w: 0.5 * r.ceq * etat.u * etat.u * 1e3,
      });
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-association-curseurs",
    [
      { id: "mode", libelle: "Association", min: 0, max: 1, pas: 1, valeur: 0, format: (v) => (Math.round(v) === 0 ? "série" : "parallèle") },
      { id: "c1", libelle: "Capacité C1", min: 1, max: 100, pas: 1, valeur: etat.c1, unite: "µF" },
      { id: "c2", libelle: "Capacité C2", min: 1, max: 100, pas: 1, valeur: etat.c2, unite: "µF" },
      { id: "u", libelle: "Tension de la source U", min: 10, max: 400, pas: 5, valeur: etat.u, unite: "V" },
    ],
    (lues) => {
      etat.mode = Math.round(lues.mode);
      etat.c1 = lues.c1;
      etat.c2 = lues.c2;
      etat.u = lues.u;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  else dessiner();
}

/* --------------------------------------------------------------------------
   H. Courbe : tension de l'étage le plus chargé selon les fuites
   -------------------------------------------------------------------------- */

function parallele(a, b) {
  return (a * b) / (a + b);
}

function construireCourbeEquilibrage(racine, api) {
  const sans = (k) => (BUS.uMax * k) / (1 + k);
  const avec = (k) => {
    const r1 = parallele(BUS.re, 1e6);
    const r2 = parallele(BUS.re, k * 1e6);
    return (BUS.uMax * r2) / (r1 + r2);
  };
  const traceur = api.sim.traceur("#h-equilibrage-trace", {
    titre: "Tension de l'étage le plus chargé au réseau haut",
    genre: "Tracé",
    xTitre: "k, rapport des fuites",
    yTitre: "tension d'étage",
    yUnite: "V",
    xMin: 1,
    xMax: 10,
    yMin: 280,
    yMax: 600,
    ratio: 0.46,
    series: [
      { id: "sans", nom: "sans équilibrage", couleur: "serie-5", epaisseur: 2.6, fonction: sans },
      { id: "avec", nom: "avec 47 kΩ par étage", couleur: "serie-1", epaisseur: 2.6, fonction: avec },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, 450, "tension nominale 450 V");
      marquerPoint(c, repere, couleurs, 3, sans(3), "k = 3 : 466,7 V", true);
      marquerPoint(c, repere, couleurs, 3, avec(3), "k = 3 : 315,9 V", true);
    },
    note: "Sans équilibrage, la tension nominale est dépassée dès que le rapport des fuites atteint environ 2,6.",
  });
  if (traceur) ressources.push(traceur);
}

/* --------------------------------------------------------------------------
   I. Animation : la précharge du bus continu
   -------------------------------------------------------------------------- */

function construirePrecharge(racine, api) {
  const conteneur = racine.querySelector("#i-precharge");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 340",
    role: "img",
    "aria-label": "Précharge du bus continu d'un variateur : source redressée, résistance de précharge shuntée par un contacteur, banc de condensateurs et onduleur à l'arrêt",
  });
  const groupe = svgEl("g");
  svg.appendChild(groupe);
  conteneur.appendChild(svg);

  const etat = { rp: BUS.rp, x: 0 };

  function modele() {
    const tau = etat.rp * BUS.ceq;
    const tK = 5 * tau;
    const duree = 7 * tau;
    return { tau, tK, duree, imax: BUS.u / etat.rp };
  }

  function grandeurs(t) {
    const mdl = modele();
    if (t < mdl.tK) {
      const e = Math.exp(-t / mdl.tau);
      return {
        u: BUS.u * (1 - e),
        i: mdl.imax * e,
        wr: 0.5 * BUS.ceq * BUS.u * BUS.u * (1 - Math.exp((-2 * t) / mdl.tau)),
        ferme: false,
      };
    }
    const e = Math.exp(-5);
    return {
      u: BUS.u,
      i: 0,
      wr: 0.5 * BUS.ceq * BUS.u * BUS.u * (1 - e * e),
      ferme: true,
    };
  }

  const valeurs = api.sim.valeurs("#i-precharge-valeurs", [
    { id: "t", libelle: "Temps t", unite: "ms", decimales: 0 },
    { id: "u", libelle: "Tension du bus u", unite: "V", decimales: 1 },
    { id: "i", libelle: "Courant de charge i", unite: "A", decimales: 2 },
    { id: "imax", libelle: "Pointe de courant U / Rp", unite: "A", decimales: 2 },
    { id: "wr", libelle: "Énergie dissipée dans Rp", unite: "J", decimales: 1 },
    { id: "wc", libelle: "Énergie stockée dans le banc", unite: "J", decimales: 1 },
    { id: "tk", libelle: "Fermeture de K, 5 Rp C", unite: "ms", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const mdl = modele();
    const t = etat.x * mdl.duree;
    const g = grandeurs(t);
    const f = (v, d) => nombre(api, v, d);
    const epaisseur = 1.5 + 5 * (g.i / mdl.imax);
    const actifRp = !g.ferme;
    let m =
      "<defs>" + marqueur("fl-i-pc") + marqueur("fl-i-pc-u", "var(--serie-2)") + "</defs>" +
      '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
      '<circle cx="80" cy="180" r="26"/><path d="M80 154V90H160"/><path d="M80 206V290H600"/>' +
      '<path d="M340 90H600"/><path d="M460 90V173M460 187V290"/>' +
      '<path d="M200 290V302M188 302H212M193 308H207M197 314H203"/>' +
      '<rect x="560" y="140" width="100" height="90" rx="10"/></g>' +
      '<path d="M436 173H484M436 187H484" stroke="currentColor" stroke-width="3.2" fill="none"/>' +
      '<g fill="currentColor" stroke="none"><circle cx="460" cy="90" r="4.5"/><circle cx="460" cy="290" r="4.5"/>' +
      '<circle cx="160" cy="90" r="4.5"/><circle cx="340" cy="90" r="4.5"/></g>' +
      /* Branche de la résistance de précharge. */
      '<path d="M160 90H200M280 90H340" stroke="currentColor" stroke-width="' + (actifRp ? 4.2 : 1.6) + '" fill="none" stroke-linecap="round"/>' +
      '<rect x="200" y="77" width="80" height="26" rx="3" fill="none" stroke="currentColor" stroke-width="' + (actifRp ? 3.4 : 1.8) + '"/>' +
      /* Branche du contacteur K. */
      '<path d="M160 90V40H225M265 40H340V90" stroke="currentColor" stroke-width="' + (actifRp ? 1.6 : 4.2) + '" fill="none" stroke-linecap="round"/>' +
      (g.ferme
        ? '<path d="M225 40H265" stroke="currentColor" stroke-width="4.2" fill="none" stroke-linecap="round"/>'
        : '<path d="M225 40L260 22" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>') +
      '<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="225" cy="40" r="3.5"/><circle cx="265" cy="40" r="3.5"/></g>';
    if (g.i > 1e-6) {
      m +=
        '<path d="M376 90H420" stroke="currentColor" stroke-width="' + epaisseur.toFixed(2) + '" fill="none"/>' +
        '<path d="M418 81L434 90L418 99Z" fill="currentColor" stroke="none"/>';
    }
    m +=
      '<path d="M510 270V110" stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round" marker-end="url(#fl-i-pc-u)"/>' +
      '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
      '<text x="80" y="176" text-anchor="middle" font-weight="600">+</text>' +
      '<text x="92" y="228" font-size="11">565,7 V</text>' +
      '<text x="92" y="244" font-size="11">redresseur</text>' +
      '<text x="240" y="124" text-anchor="middle">Rp = ' + f(etat.rp, 0) + " Ω</text>" +
      '<text x="245" y="16" text-anchor="middle">K ' + (g.ferme ? "fermé" : "ouvert") + "</text>" +
      '<text x="400" y="70" text-anchor="middle">i = ' + f(g.i, 2) + " A</text>" +
      '<text x="430" y="170" text-anchor="end" font-weight="600">+</text>' +
      '<text x="430" y="214" text-anchor="end">Ceq</text>' +
      '<text x="430" y="230" text-anchor="end" font-size="11">2,2 mF</text>' +
      '<text x="522" y="194" fill="var(--serie-2)">u</text>' +
      '<text x="610" y="182" text-anchor="middle" font-size="11.5">onduleur</text>' +
      '<text x="610" y="198" text-anchor="middle" font-size="11.5">à l\'arrêt</text>' +
      '<text x="200" y="334" text-anchor="middle" font-size="11.5">pôle - du bus : référence 0 V</text>' +
      '<text x="520" y="334" text-anchor="middle" font-size="11.5">t = ' + f(t * 1000, 0) + " ms ; u = " + f(g.u, 1) + " V</text>" +
      "</g>";
    groupe.innerHTML = m;

    if (valeurs) {
      valeurs.maj({
        t: t * 1000,
        u: g.u,
        i: g.i,
        imax: mdl.imax,
        wr: g.wr,
        wc: 0.5 * BUS.ceq * g.u * g.u,
        tk: mdl.tK * 1000,
      });
    }
    if (traceur) {
      traceur.definirPlage({ xMin: 0, xMax: mdl.duree * 1000 });
    }
  }

  const traceur = api.sim.traceur("#i-precharge-trace", {
    titre: "Tension du bus et courant de précharge",
    genre: "Simulation",
    xTitre: "t",
    xUnite: "ms",
    yTitre: "rapport",
    xMin: 0,
    xMax: modele().duree * 1000,
    yMin: 0,
    yMax: 1.1,
    ratio: 0.4,
    series: [
      {
        id: "u",
        nom: "u / U",
        couleur: "serie-1",
        epaisseur: 2.6,
        fonction: (x) => {
          const mdl = modele();
          return x / 1000 <= etat.x * mdl.duree + 1e-12 ? grandeurs(x / 1000).u / BUS.u : NaN;
        },
      },
      {
        id: "i",
        nom: "i / imax",
        couleur: "serie-4",
        epaisseur: 2.6,
        fonction: (x) => {
          const mdl = modele();
          return x / 1000 <= etat.x * mdl.duree + 1e-12 ? grandeurs(x / 1000).i / mdl.imax : NaN;
        },
      },
    ],
    surDessin({ c, repere, couleurs }) {
      const mdl = modele();
      ligneVerticale(c, repere, couleurs, mdl.tK * 1000);
      c.save();
      c.fillStyle = couleurs.texte;
      c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
      c.textAlign = "right";
      c.fillText("fermeture de K", repere.versX(mdl.tK * 1000) - 6, repere.boite.y + 14);
      c.restore();
    },
  });
  if (traceur) ressources.push(traceur);

  const lecteur = api.sim.lecteur("#i-precharge-lecteur", {
    de: 0,
    a: 1,
    duree: 9,
    boucle: false,
    auto: false,
    libelle: "Mettre le variateur sous tension",
    rappel: (valeur) => {
      etat.x = valeur;
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);

  const curseurs = api.sim.curseurs(
    "#i-precharge-curseurs",
    [{ id: "rp", libelle: "Résistance de précharge Rp", min: 10, max: 200, pas: 1, valeur: etat.rp, unite: "Ω" }],
    (lues) => {
      etat.rp = lues.rp;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);
  else dessiner();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function construireExercices(racine, api) {
  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-1",
      titre: "Capacité d'un condensateur à film",
      niveau: "fondamental",
      enonce:
        "<p>Un condensateur plan est formé de deux armatures de $200\\ \\mathrm{cm^2}$ en regard, séparées par un film de polypropylène de $0{,}1\\ \\mathrm{mm}$ d'épaisseur, de permittivité relative $\\varepsilon_r = 2{,}2$. Calculez sa capacité, en nanofarads.</p>",
      valeur: 3.896,
      unite: "nF",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "C",
      etapes: [
        { texte: "Unités SI : $S = 200 \\times 10^{-4} = 0{,}02\\ \\mathrm{m^2}$, $d = 10^{-4}\\ \\mathrm{m}$." },
        { texte: "$C = \\dfrac{\\varepsilon_0\\varepsilon_rS}{d} = \\dfrac{8{,}854 \\times 10^{-12} \\times 2{,}2 \\times 0{,}02}{10^{-4}}$." },
        { texte: "$C = 3{,}896 \\times 10^{-9}\\ \\mathrm{F} = 3{,}90\\ \\mathrm{nF}$." },
        { texte: "Contrôle : sans le film, avec de l'air, on aurait $1{,}77\\ \\mathrm{nF}$ ; le diélectrique multiplie la capacité par $2{,}2$.", note: "Erreur fréquente : oublier de convertir les centimètres carrés, ce qui donne un résultat dix mille fois trop grand." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 220",
          "<defs>" + marqueur("fl-k1") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="currentColor"><rect x="100" y="70" width="300" height="10" rx="2" fill-opacity="0.25"/><rect x="100" y="130" width="300" height="10" rx="2" fill-opacity="0.25"/></g>' +
            '<g stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"><path d="M140 84V124" marker-end="url(#fl-k1)"/><path d="M200 84V124" marker-end="url(#fl-k1)"/><path d="M260 84V124" marker-end="url(#fl-k1)"/><path d="M320 84V124" marker-end="url(#fl-k1)"/><path d="M380 84V124" marker-end="url(#fl-k1)"/></g>' +
            '<g stroke="currentColor" stroke-width="1.3" fill="none"><path d="M430 80V130M422 80H438M422 130H438"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
            '<text x="250" y="58" text-anchor="middle">S = 0,02 m²</text><text x="446" y="110">d = 0,1 mm</text>' +
            '<text x="250" y="166" text-anchor="middle">polypropylène, εr = 2,2</text>' +
            '<text x="250" y="200" text-anchor="middle" font-weight="600">C = 8,854e-12 × 2,2 × 0,02 / 1e-4 = 3,90 nF</text></g>',
          "Condensateur plan de 0,02 mètre carré et 0,1 millimètre de polypropylène : 3,90 nanofarads"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-fond-2",
      titre: "Charge et énergie d'un condensateur de filtrage",
      niveau: "fondamental",
      enonce:
        "<p>Un condensateur de filtrage de $470\\ \\mu\\mathrm{F}$ est chargé sous $24\\ \\mathrm{V}$. Calculez l'énergie qu'il stocke, en millijoules. La correction donne aussi sa charge.</p>",
      valeur: 135.36,
      unite: "mJ",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "W",
      etapes: [
        { texte: "Charge : $Q = CU = 470 \\times 10^{-6} \\times 24 = 11{,}28 \\times 10^{-3}\\ \\mathrm{C} = 11{,}28\\ \\mathrm{mC}$." },
        { texte: "Énergie : $W = \\tfrac{1}{2}CU^2 = 0{,}5 \\times 470 \\times 10^{-6} \\times 576 = 0{,}1354\\ \\mathrm{J} = 135{,}4\\ \\mathrm{mJ}$." },
        { texte: "Contrôle : $\\tfrac{1}{2}QU = 0{,}5 \\times 11{,}28 \\times 10^{-3} \\times 24 = 135{,}4\\ \\mathrm{mJ}$, identique.", note: "Doubler la tension, $48\\ \\mathrm{V}$, quadruplerait l'énergie : $541{,}4\\ \\mathrm{mJ}$." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Énergie stockée en fonction de la tension",
          genre: "Correction visuelle",
          xTitre: "U",
          xUnite: "V",
          yTitre: "W",
          yUnite: "mJ",
          xMin: 0,
          xMax: 50,
          yMin: 0,
          yMax: 600,
          ratio: 0.42,
          series: [{ id: "w", nom: "W = C U² / 2 pour 470 µF", couleur: "serie-1", fonction: (u) => 0.5 * 470e-6 * u * u * 1e3 }],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, 24, 135.36, "24 V : 135,4 mJ", false);
            marquerPoint(c, repere, couleurs, 48, 541.44, "48 V : 541,4 mJ");
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-1",
      titre: "Association mixte et tension la plus forte",
      niveau: "intermédiaire",
      enonce:
        "<p>Un condensateur de $10\\ \\mu\\mathrm{F}$ est placé en série avec un groupe formé de $22\\ \\mu\\mathrm{F}$ en parallèle avec $4{,}7\\ \\mu\\mathrm{F}$. L'ensemble, initialement déchargé, est chargé sous $100\\ \\mathrm{V}$. Quelle tension supporte le condensateur de $10\\ \\mu\\mathrm{F}$, en volts ?</p>",
      valeur: 72.752,
      unite: "V",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "U10",
      etapes: [
        { texte: "Groupe parallèle : $22 + 4{,}7 = 26{,}7\\ \\mu\\mathrm{F}$." },
        { texte: "Série : $C_{eq} = \\dfrac{10 \\times 26{,}7}{10 + 26{,}7} = 7{,}275\\ \\mu\\mathrm{F}$." },
        { texte: "Charge commune : $Q = 7{,}275 \\times 10^{-6} \\times 100 = 727{,}5\\ \\mu\\mathrm{C}$." },
        { texte: "$U_{10} = Q/C = 727{,}5/10 = 72{,}75\\ \\mathrm{V}$ ; le groupe reçoit $727{,}5/26{,}7 = 27{,}25\\ \\mathrm{V}$.", note: "Contrôle : $72{,}75 + 27{,}25 = 100\\ \\mathrm{V}$. Le plus petit élément de la chaîne prend la plus grande tension ; un $10\\ \\mu\\mathrm{F}$ de $63\\ \\mathrm{V}$ serait détruit." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 300",
          "<defs>" + marqueur("fl-k3-u", "var(--serie-2)") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
            '<circle cx="70" cy="150" r="22"/><path d="M70 128V40H300V83M300 97V150"/><path d="M230 150H370"/>' +
            '<path d="M230 150V193M230 207V260M370 150V193M370 207V260"/><path d="M230 260H370"/><path d="M300 260V280H70V172"/></g>' +
            '<path d="M276 83H324M276 97H324M206 193H254M206 207H254M346 193H394M346 207H394" stroke="currentColor" stroke-width="3.2" fill="none"/>' +
            '<g fill="currentColor" stroke="none"><circle cx="300" cy="150" r="4"/><circle cx="300" cy="260" r="4"/></g>' +
            '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M340 140V52" marker-end="url(#fl-k3-u)"/><path d="M420 250V162" marker-end="url(#fl-k3-u)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
            '<text x="70" y="146" text-anchor="middle" font-weight="600">+</text><text x="40" y="155" text-anchor="end">100 V</text>' +
            '<text x="266" y="94" text-anchor="end">10 µF</text><text x="196" y="204" text-anchor="end">22 µF</text><text x="336" y="224" text-anchor="end">4,7 µF</text>' +
            '<text x="352" y="100" fill="var(--serie-2)">72,75 V</text><text x="432" y="210" fill="var(--serie-2)">27,25 V</text>' +
            '<text x="450" y="60">Q = 727,5 µC</text><text x="450" y="80">dans chaque élément</text><text x="450" y="100">de la chaîne série</text></g>',
          "Condensateur de 10 microfarads en série avec 26,7 microfarads sous 100 volts : 72,75 volts et 27,25 volts"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-inter-2",
      titre: "Courant imposé par une variation rapide de tension",
      niveau: "intermédiaire",
      enonce:
        "<p>Aux bornes d'un condensateur de $4{,}7\\ \\mu\\mathrm{F}$, la tension passe linéairement de $0$ à $10\\ \\mathrm{V}$ en $50\\ \\mu\\mathrm{s}$, puis reste constante. Quel courant le traverse pendant la montée, en ampères ? Et après ?</p>",
      valeur: 0.94,
      unite: "A",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "i",
      etapes: [
        { texte: "Pente de la tension : $\\dfrac{\\mathrm{d}u}{\\mathrm{d}t} = \\dfrac{10}{50 \\times 10^{-6}} = 2 \\times 10^5\\ \\mathrm{V/s}$." },
        { texte: "$i = C\\,\\dfrac{\\mathrm{d}u}{\\mathrm{d}t} = 4{,}7 \\times 10^{-6} \\times 2 \\times 10^5 = 0{,}94\\ \\mathrm{A}$ pendant la montée." },
        { texte: "Après la montée, la tension est constante : $i = 0$. Le courant est un créneau de $0{,}94\\ \\mathrm{A}$ pendant $50\\ \\mu\\mathrm{s}$.", note: "Contrôle : charge transportée $0{,}94 \\times 50 \\times 10^{-6} = 47\\ \\mu\\mathrm{C} = CU$. Une variation rapide fait passer un fort courant dans une petite capacité." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 280",
          '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8"><path d="M70 120H560M70 130V20"/><path d="M70 250H560M70 260V160"/></g>' +
            '<g stroke="currentColor" stroke-width="1.2" fill="none" stroke-dasharray="5 4" opacity="0.7"><path d="M270 120V250"/></g>' +
            '<g stroke="currentColor" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M70 120L270 40H556"/><path d="M70 250V180H270V250H556"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
            '<text x="62" y="44" text-anchor="end">10 V</text><text x="62" y="24" text-anchor="end" font-size="11">u</text>' +
            '<text x="62" y="184" text-anchor="end">0,94 A</text><text x="62" y="164" text-anchor="end" font-size="11">i</text>' +
            '<text x="270" y="272" text-anchor="middle">50 µs</text><text x="568" y="124">t</text><text x="568" y="254">t</text>' +
            '<text x="120" y="80">pente 2e5 V/s</text><text x="300" y="206">i = C du/dt = 0 : tension constante</text></g>',
          "Rampe de 10 volts en 50 microsecondes et créneau de courant de 0,94 ampère"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-avance",
      titre: "Dimensionner un module de maintien 24 V",
      niveau: "avancé",
      enonce:
        "<p>Un module de maintien doit alimenter une unité centrale d'automate de $18\\ \\mathrm{W}$ pendant une microcoupure de $30\\ \\mathrm{ms}$. Ses condensateurs sont chargés à $24\\ \\mathrm{V}$ ; le convertisseur qui les suit a un rendement de $90\\ \\%$ et fonctionne tant que leur tension reste au-dessus de $18\\ \\mathrm{V}$. Quelle capacité minimale faut-il, en millifarads ? Combien de condensateurs de $2\\,200\\ \\mu\\mathrm{F}$ à $\\pm 20\\ \\%$ faut-il mettre en parallèle ?</p>",
      valeur: 4.762,
      unite: "mF",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "C min",
      etapes: [
        { texte: "Énergie à prélever sur les condensateurs : $W = \\dfrac{P\\,\\Delta t}{\\eta} = \\dfrac{18 \\times 0{,}030}{0{,}9} = 0{,}60\\ \\mathrm{J}$." },
        { texte: "Énergie utilisable entre $24$ et $18\\ \\mathrm{V}$ : $\\tfrac{1}{2}C(U_1^2 - U_2^2) = \\tfrac{1}{2}C(576 - 324) = 126\\,C$." },
        { texte: "$126\\,C \\geq 0{,}60$, donc $C \\geq 4{,}762 \\times 10^{-3}\\ \\mathrm{F} = 4{,}76\\ \\mathrm{mF}$." },
        { texte: "Valeur minimale garantie d'un condensateur : $2\\,200 \\times 0{,}8 = 1\\,760\\ \\mu\\mathrm{F}$. Il en faut $4\\,762/1\\,760 = 2{,}71$, donc trois en parallèle, soit au moins $5{,}28\\ \\mathrm{mF}$.", note: "Seuls $43{,}75\\ \\%$ de l'énergie stockée sont utilisables. Il faudra aussi limiter le courant d'appel de $6{,}6\\ \\mathrm{mF}$ à la mise sous tension du bus secouru, et tenir compte du vieillissement, qui réduit encore la capacité." },
      ],
      visuelCorrection(conteneur, moteur) {
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Énergie stockée par 4,76 mF et fenêtre utilisable",
          genre: "Correction visuelle",
          xTitre: "U",
          xUnite: "V",
          yTitre: "W",
          yUnite: "J",
          xMin: 0,
          xMax: 26,
          yMin: 0,
          yMax: 1.6,
          ratio: 0.42,
          series: [{ id: "w", nom: "W = C U² / 2 pour 4,76 mF", couleur: "serie-1", fonction: (u) => 0.5 * 4.762e-3 * u * u }],
          surDessin({ c, repere, couleurs }) {
            c.save();
            c.fillStyle = couleurs.texte;
            c.globalAlpha = 0.1;
            c.fillRect(repere.versX(18), repere.boite.y, repere.versX(24) - repere.versX(18), repere.boite.h);
            c.restore();
            marquerPoint(c, repere, couleurs, 18, 0.5 * 4.762e-3 * 324, "18 V : 0,771 J", false);
            marquerPoint(c, repere, couleurs, 24, 0.5 * 4.762e-3 * 576, "24 V : 1,371 J");
          },
          note: "La bande grisée est la fenêtre de fonctionnement du convertisseur : 1,371 - 0,771 = 0,600 J utilisables.",
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#k-exercices-blocs", {
      id: "k-diagnostic",
      titre: "Condensateur de bus continu gonflé",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Sur un variateur dont un condensateur du bus continu a gonflé, on mesure, bus sous tension et moteur à l'arrêt, $565{,}7\\ \\mathrm{V}$ entre les pôles, $140{,}0\\ \\mathrm{V}$ sur l'étage du haut et $425{,}7\\ \\mathrm{V}$ sur l'étage du bas. Les étages sont identiques, de tension nominale $450\\ \\mathrm{V}$. Si le réseau monte à $+10\\ \\%$ (bus à $622{,}3\\ \\mathrm{V}$), quelle tension atteindrait l'étage du bas, en volts ? Concluez sur la cause probable et l'action.</p>",
      valeur: 468.27,
      unite: "V",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "U bas",
      etapes: [
        { texte: "Moteur à l'arrêt, bus établi : régime continu. Les étages se partagent la tension selon leurs résistances en parallèle (fuites et équilibrage), comme un diviseur ; le rapport $425{,}7/565{,}7 = 0{,}7525$ est fixé par ces résistances." },
        { texte: "Au réseau haut, le rapport est inchangé : $622{,}3 \\times 0{,}7525 = 468{,}3\\ \\mathrm{V}$, au-dessus des $450\\ \\mathrm{V}$ nominaux." },
        { texte: "La résistance équivalente de l'étage du bas est environ trois fois celle de l'étage du haut ($425{,}7/140{,}0 = 3{,}04$). Avec des résistances d'équilibrage intactes, dominantes, le rapport serait proche de $1$ : la résistance d'équilibrage de l'étage du bas est vraisemblablement coupée, ou l'étage du haut fuit anormalement." },
        { texte: "Action : consigner, attendre le délai de décharge et vérifier l'absence de tension ; contrôler les deux résistances d'équilibrage et le courant de fuite des condensateurs ; remplacer l'étage entier, jamais un seul condensateur vieilli à côté d'un neuf, et les résistances défectueuses.", note: "Le condensateur gonflé est un symptôme : la surtension permanente l'a fait vieillir. Le changer sans corriger l'équilibrage reproduira la panne." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 300",
          "<defs>" + marqueur("fl-k6-u", "var(--serie-2)") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">' +
            '<path d="M100 40H400M100 260H400M100 150H400"/><path d="M200 40V88M200 102V150M200 150V198M200 212V260"/>' +
            '<path d="M330 40V60M330 130V150M330 150V170M330 240V260"/><rect x="317" y="60" width="26" height="70" rx="3"/><rect x="317" y="170" width="26" height="70" rx="3" stroke-dasharray="6 5"/></g>' +
            '<path d="M176 88H224M176 102H224M176 198H224M176 212H224" stroke="currentColor" stroke-width="3.2" fill="none"/>' +
            '<g stroke="var(--serie-2)" stroke-width="2" fill="none" stroke-linecap="round"><path d="M440 140V52" marker-end="url(#fl-k6-u)"/><path d="M440 250V162" marker-end="url(#fl-k6-u)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
            '<text x="96" y="44" text-anchor="end">+ bus</text><text x="96" y="264" text-anchor="end">- bus</text>' +
            '<text x="452" y="100" fill="var(--serie-2)">140,0 V</text><text x="452" y="210" fill="var(--serie-2)">425,7 V</text>' +
            '<text x="452" y="228" fill="var(--serie-2)">468,3 V si +10 %</text>' +
            '<text x="356" y="210">Re coupée ?</text><text x="300" y="292" text-anchor="middle">rapport 3,04 : équilibrage inopérant</text></g>',
          "Deux étages de bus continu à 140 et 425,7 volts : l'étage du bas atteindrait 468,3 volts au réseau haut"
        );
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte("#k-exercices-blocs", {
      id: "k-conceptuel",
      titre: "Un courant qui traverse un isolant",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez comment un ampèremètre placé dans le fil d'un côté d'un condensateur et un autre placé de l'autre côté peuvent indiquer exactement le même courant pendant la charge, alors qu'aucune charge ne traverse le diélectrique.</p>",
      motsCles: [
        ["accumul", "charge", "armature", "separ"],
        ["champ", "deplacement", "maxwell"],
        ["egal", "meme", "oppose", "autant", "symetr"],
      ],
      minimum: 2,
      exemple: "Trois phrases suffisent : ce qui arrive sur une armature, ce qui quitte l'autre, et ce qui se passe dans l'isolant.",
      etapes: [
        { texte: "Les électrons qui quittent une armature n'y reviennent pas à travers l'isolant : ils font le tour du circuit. Chaque charge $+\\mathrm{d}Q$ qui apparaît sur une armature s'accompagne d'une charge $-\\mathrm{d}Q$ sur l'autre, donc le courant qui entre d'un côté égale celui qui sort de l'autre." },
        { texte: "Pendant ce temps, le champ entre les armatures croît. Sa variation constitue le courant de déplacement $\\varepsilon S\\,\\mathrm{d}E/\\mathrm{d}t = C\\,\\mathrm{d}u/\\mathrm{d}t$, égal au courant de conduction : le courant total est continu." },
        { texte: "En régime continu, le champ ne varie plus : plus de courant de déplacement, et plus de courant dans les fils.", note: "Ce courant de déplacement crée un champ magnétique comme un courant ordinaire ; c'est lui qui laisse passer les courants de fuite capacitifs vers la terre." },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 600 240",
          "<defs>" + marqueur("fl-k7") + "</defs>" +
            '<g stroke="currentColor" stroke-width="2.2" fill="currentColor"><rect x="240" y="60" width="120" height="10" rx="2" fill-opacity="0.25"/><rect x="240" y="150" width="120" height="10" rx="2" fill-opacity="0.25"/></g>' +
            '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"><path d="M300 60V20H80"/><path d="M300 160V210H80"/></g>' +
            '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M150 20H200" marker-end="url(#fl-k7)"/><path d="M200 210H150" marker-end="url(#fl-k7)"/></g>' +
            '<g stroke="currentColor" stroke-width="1.8" fill="none" stroke-dasharray="6 4"><path d="M270 76V142" marker-end="url(#fl-k7)"/><path d="M300 76V142" marker-end="url(#fl-k7)"/><path d="M330 76V142" marker-end="url(#fl-k7)"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
            '<text x="175" y="12" text-anchor="middle">i entre</text><text x="175" y="234" text-anchor="middle">i sort</text>' +
            '<text x="376" y="70">+dQ = i dt</text><text x="376" y="162">-dQ = -i dt</text>' +
            '<text x="376" y="112">iD = C du/dt = i</text></g>',
          "Courant de conduction dans les fils et courant de déplacement dans l'isolant, égaux"
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
  '<path d="M190 40H380"/><path d="M260 40V122"/><path d="M260 136V220"/>' +
  '<path d="M380 40V90"/><rect x="368" y="90" width="24" height="80" rx="3"/><path d="M380 170V220"/>' +
  '<path d="M60 150V220H380"/></g>' +
  '<path d="M238 122H282M238 136H282" stroke="currentColor" stroke-width="3" fill="none"/>' +
  '<g fill="currentColor" stroke="none"><circle cx="260" cy="40" r="4"/><circle cx="260" cy="220" r="4"/></g>' +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
  '<text x="60" y="126" text-anchor="middle" font-weight="600">+</text><text x="30" y="134" text-anchor="end">E</text>' +
  '<text x="150" y="72" text-anchor="middle">R1</text><text x="296" y="134">C</text><text x="404" y="134">R2</text>' +
  '<text x="230" y="250" text-anchor="middle" font-size="12">régime continu établi</text></g>';

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>En régime continu établi, un condensateur idéal se comporte comme :</p>",
        options: ["un court-circuit", "un circuit ouvert", "une résistance égale à $1/C$", "une source de courant"],
        bonnes: [1],
        explication: "Tension constante, donc $\\mathrm{d}u/\\mathrm{d}t = 0$ et $i = C\\,\\mathrm{d}u/\\mathrm{d}t = 0$.",
        resume: "Régime continu",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Dans un circuit où tous les courants restent finis, la tension d'un condensateur peut sauter d'une valeur à une autre à un instant donné.</p>",
        reponse: false,
        explication: "Un saut de tension exigerait $\\mathrm{d}u/\\mathrm{d}t$ infinie, donc un courant infini : la tension d'un condensateur est continue.",
        resume: "Continuité de la tension",
      },
      {
        type: "calcul",
        enonce: "<p>Trois condensateurs de $30\\ \\mu\\mathrm{F}$ sont montés en série. Quelle est la capacité équivalente, en microfarads ?</p>",
        valeur: 10,
        unite: "µF",
        chiffres: 1,
        explication: "$1/C_{eq} = 3/30$, donc $C_{eq} = 10\\ \\mu\\mathrm{F}$ ; la tension admissible est, elle, multipliée par trois si les tensions sont équilibrées.",
        resume: "Association série",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle énergie stocke un condensateur de $1000\\ \\mu\\mathrm{F}$ chargé sous $100\\ \\mathrm{V}$, en joules ?</p>",
        valeur: 5,
        unite: "J",
        chiffres: 2,
        explication: "$W = \\tfrac{1}{2} \\times 10^{-3} \\times 100^2 = 5\\ \\mathrm{J}$.",
        resume: "Énergie stockée",
      },
      {
        type: "courte",
        enonce: "<p>Comment appelle-t-on le terme qui, dans l'isolant d'un condensateur, prolonge le courant de conduction des fils ?</p>",
        motsCles: [["deplacement"]],
        minimum: 1,
        explication: "Le courant de déplacement, $\\varepsilon S\\,\\mathrm{d}E/\\mathrm{d}t$, égal à $C\\,\\mathrm{d}u/\\mathrm{d}t$ : il ne transporte aucune charge mais assure la continuité du courant total.",
        resume: "Courant de déplacement",
      },
      {
        type: "qcm",
        enonce: "<p>On double la tension aux bornes d'un condensateur. Son énergie stockée est :</p>",
        options: ["inchangée", "multipliée par deux", "multipliée par quatre", "divisée par deux"],
        bonnes: [2],
        explication: "$W = \\tfrac{1}{2}CU^2$ : l'énergie croît comme le carré de la tension.",
        resume: "Énergie et tension",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Dans deux condensateurs en série initialement déchargés, c'est le plus petit qui reçoit la plus grande tension.</p>",
        reponse: true,
        explication: "Même charge $Q$ pour les deux, donc $U_k = Q/C_k$ : la plus petite capacité porte la plus grande tension.",
        resume: "Répartition en série",
      },
      {
        type: "calcul",
        enonce: "<p>Deux plaques de $50\\ \\mathrm{cm^2}$ sont séparées de $0{,}5\\ \\mathrm{mm}$ d'air. Quelle est leur capacité, en picofarads ?</p>",
        valeur: 88.54,
        unite: "pF",
        tolerance: 0.02,
        chiffres: 1,
        explication: "$C = 8{,}854 \\times 10^{-12} \\times 5 \\times 10^{-3}/(5 \\times 10^{-4}) = 88{,}54\\ \\mathrm{pF}$ : même rapport $S/d$ que dans la simulation de la section E.",
        resume: "Capacité d'un condensateur plan",
      },
      {
        type: "schema",
        enonce: "<p>Le circuit est en régime continu établi. Dans quel élément le courant est-il nul ?</p>",
        consigne: "Cliquez sur l'élément correspondant.",
        viewBox: "0 0 460 260",
        dessin: DESSIN_QUIZ,
        zones: [
          { x: 30, y: 100, largeur: 60, hauteur: 60, etiquette: "source E" },
          { x: 110, y: 18, largeur: 80, hauteur: 44, etiquette: "résistance R1" },
          { x: 228, y: 104, largeur: 64, hauteur: 50, etiquette: "condensateur C", juste: true },
          { x: 356, y: 90, largeur: 48, hauteur: 80, etiquette: "résistance R2" },
        ],
        explication: "En régime continu, le condensateur est un circuit ouvert : aucun courant ne le traverse, et le courant de $E$ passe par $R_1$ et $R_2$ en série. La tension de $C$ est celle de $R_2$, soit $E\\,R_2/(R_1 + R_2)$.",
        resume: "Condensateur en régime continu",
      },
      {
        type: "qcm",
        enonce: "<p>Lesquelles de ces modifications augmentent la capacité d'un condensateur plan ?</p>",
        options: [
          { texte: "Augmenter la surface des armatures", juste: true },
          { texte: "Réduire l'épaisseur du diélectrique", juste: true },
          { texte: "Choisir un diélectrique de permittivité plus élevée", juste: true },
          { texte: "Augmenter la tension appliquée" },
        ],
        multiple: true,
        explication: "$C = \\varepsilon_0\\varepsilon_rS/d$ ne dépend que de la géométrie et du matériau ; la tension change la charge, pas la capacité d'un condensateur idéal.",
        resume: "Paramètres de la capacité",
      },
    ],
    { titre: "Dix questions sur les condensateurs et le champ électrique" }
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
      { categorie: "Définition", question: "Qu'est-ce que la capacité d'un condensateur ?", reponse: "Le rapport $C = Q/U$ entre la charge portée par l'armature positive et la tension ; elle s'exprime en farads, $1\\ \\mathrm{F} = 1\\ \\mathrm{C/V}$." },
      { categorie: "Formule", question: "Capacité d'un condensateur plan ?", reponse: "$C = \\varepsilon_0\\varepsilon_rS/d$, avec $\\varepsilon_0 = 8{,}854 \\times 10^{-12}\\ \\mathrm{F/m}$ ; effets de bord négligés." },
      { categorie: "Loi", question: "Relation entre champ et tension dans un condensateur plan ?", reponse: "$E = U/d$, en $\\mathrm{V/m}$ ; c'est le champ, pas la tension, qui fait claquer le diélectrique." },
      { categorie: "Formule", question: "Relation courant et tension d'un condensateur ?", reponse: "$i = C\\,\\mathrm{d}u/\\mathrm{d}t$ en convention récepteur ; en convention générateur, un signe moins apparaît." },
      { categorie: "Comportement", question: "Que devient un condensateur en régime continu établi ?", reponse: "Un circuit ouvert : $\\mathrm{d}u/\\mathrm{d}t = 0$ donc $i = 0$, fuite exceptée." },
      { categorie: "Comportement", question: "Que devient un condensateur déchargé à la mise sous tension ?", reponse: "Un court-circuit momentané : sa tension, continue, vaut encore zéro. Le courant d'appel n'est limité que par le reste du circuit." },
      { categorie: "Formule", question: "Énergie stockée ?", reponse: "$W = \\tfrac{1}{2}CU^2 = \\tfrac{1}{2}QU = Q^2/(2C)$, localisée dans le champ, densité $\\tfrac{1}{2}\\varepsilon E^2$." },
      { categorie: "Association", question: "Capacité équivalente en série et en parallèle ?", reponse: "Parallèle : somme des capacités, même tension. Série : somme des inverses, même charge ; le plus petit prend la plus grande tension." },
      { categorie: "Bilan", question: "Quelle énergie perd-on en chargeant un condensateur à travers une résistance depuis une source idéale ?", reponse: "$\\tfrac{1}{2}CE^2$, autant que l'énergie stockée, quelle que soit la résistance." },
      {
        categorie: "Industriel",
        question: "Pourquoi place-t-on des résistances d'équilibrage sur une chaîne série de condensateurs ?",
        reponse: "En régime continu, les fuites fixent la répartition de la tension ; des résistances nettement plus faibles que les fuites imposent un partage égal, et déchargent le banc à l'arrêt.",
        rappel: "Bus du variateur : 47 kΩ par étage, 1,70 W chacune, décharge sous 50 V en environ 8 min.",
      },
    ],
    { titre: "Dix cartes sur les condensateurs et le champ électrique" }
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
        enonce: "<p>La tension d'un condensateur de $10\\ \\mu\\mathrm{F}$ croît de $5\\ \\mathrm{V}$ par milliseconde. Quel courant le traverse, en milliampères ?</p>",
        valeur: 50,
        unite: "mA",
        chiffres: 1,
        explication: "$\\mathrm{d}u/\\mathrm{d}t = 5000\\ \\mathrm{V/s}$, $i = 10^{-5} \\times 5000 = 0{,}05\\ \\mathrm{A} = 50\\ \\mathrm{mA}$.",
        resume: "Relation i = C du/dt (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>En chargeant un condensateur depuis une source de tension idéale à travers une résistance, l'énergie dissipée dans la résistance ne dépend pas de sa valeur.</p>",
        reponse: true,
        explication: "La source fournit $CE^2$, le condensateur stocke $\\tfrac{1}{2}CE^2$ : la résistance dissipe toujours $\\tfrac{1}{2}CE^2$.",
        resume: "Bilan de la charge (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Un condensateur de $47\\ \\mu\\mathrm{F}$ est chargé sous $400\\ \\mathrm{V}$. Quelle charge porte son armature positive, en millicoulombs ?</p>",
        valeur: 18.8,
        unite: "mC",
        chiffres: 2,
        explication: "$Q = CU = 47 \\times 10^{-6} \\times 400 = 18{,}8 \\times 10^{-3}\\ \\mathrm{C}$.",
        resume: "Charge Q = C U (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Dans l'étude de cas du coffret de vannes, une alimentation de $48\\ \\mathrm{V}$ et $0{,}2\\ \\Omega$ dessert, par un câble de $0{,}3\\ \\Omega$, un chauffage de $12\\ \\Omega$ et une lampe de $480\\ \\Omega$ en parallèle. Quelle tension reçoit le coffret, en volts ?</p>",
        valeur: 46.03,
        unite: "V",
        tolerance: 0.01,
        chiffres: 2,
        explication: "$12 /\\!/ 480 = 11{,}707\\ \\Omega$, puis diviseur : $48 \\times 11{,}707/(11{,}707 + 0{,}5) = 46{,}03\\ \\mathrm{V}$. Révisé du cours Révision 1 et étude de cas continu.",
        resume: "Alimentation résistive (cours précédent)",
      },
      {
        type: "qcm",
        enonce: "<p>Pour trouver la plus grande puissance de chauffe installable sans que la tension du coffret descende sous un minimum, quelle méthode est la plus directe ?</p>",
        options: ["Refaire la méthode des nœuds pour chaque valeur de chauffage", "L'équivalent de Thévenin vu des bornes du chauffage", "La superposition des sources", "Le théorème de Millman appliqué à la seule lampe"],
        bonnes: [1],
        explication: "La charge est l'inconnue : l'équivalent de Thévenin vu du chauffage donne la tension en une ligne pour toute valeur. Révisé du cours Révision 1 et étude de cas continu.",
        resume: "Choix de méthode (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Exprimez $3{,}3 \\times 10^{-9}\\ \\mathrm{F}$ en nanofarads.</p>",
        valeur: 3.3,
        unite: "nF",
        tolerance: 0.01,
        chiffres: 1,
        explication: "Le préfixe nano vaut $10^{-9}$ : $3{,}3\\ \\mathrm{nF}$. Révisé du cours Diagnostic initial et remise à niveau mathématique, vieux d'une semaine.",
        resume: "Préfixes SI (cours vieux d'une semaine)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Autour d'une seule armature d'un condensateur en charge, les courants de conduction qui entrent ne sont pas égaux à ceux qui sortent ; la loi des nœuds reste valable si l'on tient compte de l'accumulation de charge, ou du courant de déplacement.</p>",
        reponse: true,
        explication: "La loi des nœuds du cours Lois de Kirchhoff suppose qu'aucune charge ne s'accumule ; sur une armature, elle s'accumule au rythme $\\mathrm{d}Q/\\mathrm{d}t = i$, que le courant de déplacement compense exactement.",
        resume: "Loi des nœuds généralisée (Lois de Kirchhoff)",
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
    titre: "Où en suis-je sur les condensateurs et le champ électrique ?",
  });
  if (auto) ressources.push(auto);
}
