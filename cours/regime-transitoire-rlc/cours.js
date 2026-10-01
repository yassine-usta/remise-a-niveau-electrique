/* ==========================================================================
   cours/regime-transitoire-rlc/cours.js
   Régime transitoire RLC.
   ========================================================================== */

let ressources = [];
let nettoyeursAnimation = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const POLICE = "500 11px 'JetBrains Mono', ui-monospace, monospace";

/* Exemple de la section H : branchement à chaud d'un module 24 V. */
const MODULE = { e: 24, l: 10e-6, c: 100e-6, r: 0.1, rAmorti: 0.49, tenue: 36 };

/* Bus continu du variateur de la pompe (section I). */
const BUS = { e: 400 * Math.SQRT2, l: 1e-3, c: 2.2e-3, r: 0.1, tenue: 900 };

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

/**
 * Réponse d'un circuit RLC série à un échelon E, depuis u_C(0) = u0 et i(0) = i0.
 * Renvoie les paramètres et les fonctions u(t) et i(t), t en secondes.
 */
function rlcSerie(r, l, c, e, u0 = 0, i0 = 0) {
  const w0 = 1 / Math.sqrt(l * c);
  const a = r / (2 * l);
  const z = a / w0;
  const A = u0 - e;
  const dA = i0 / c;
  let regime;
  let u;
  let du;
  let wd = 0;
  let r1 = 0;
  let r2 = 0;
  if (Math.abs(z - 1) < 1e-4) {
    regime = "critique";
    const B = dA + w0 * A;
    u = (t) => e + (A + B * t) * Math.exp(-w0 * t);
    du = (t) => (B - w0 * (A + B * t)) * Math.exp(-w0 * t);
    r1 = -w0;
    r2 = -w0;
  } else if (z < 1) {
    regime = "pseudo-périodique";
    wd = w0 * Math.sqrt(1 - z * z);
    const B = (dA + a * A) / wd;
    u = (t) => e + Math.exp(-a * t) * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
    du = (t) => Math.exp(-a * t) * ((-a * A + wd * B) * Math.cos(wd * t) + (-a * B - wd * A) * Math.sin(wd * t));
  } else {
    regime = "apériodique";
    const s = Math.sqrt(a * a - w0 * w0);
    r1 = -a + s;
    r2 = -a - s;
    const A1 = (dA - r2 * A) / (r1 - r2);
    const A2 = A - A1;
    u = (t) => e + A1 * Math.exp(r1 * t) + A2 * Math.exp(r2 * t);
    du = (t) => r1 * A1 * Math.exp(r1 * t) + r2 * A2 * Math.exp(r2 * t);
  }
  const d = z < 1 ? Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z)) : 0;
  return {
    w0,
    a,
    z,
    wd,
    r1,
    r2,
    regime,
    q: 1 / (2 * z),
    z0: Math.sqrt(l / c),
    d,
    tp: z < 1 ? Math.PI / wd : NaN,
    u,
    i: (t) => c * du(t),
  };
}

/** Dépassement relatif pour un amortissement donné. */
function depassement(z) {
  return z < 1 ? Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z)) : 0;
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

/** Boucles d'une bobine verticale : quatre spires de haut en bas. */
function spires(x, y) {
  return "M" + x + " " + y + "a10 10 0 0 1 0 20a10 10 0 0 1 0 20a10 10 0 0 1 0 20a10 10 0 0 1 0 20";
}

/** Boucles d'une bobine horizontale : quatre spires de gauche à droite. */
function spiresH(x, y) {
  return "M" + x + " " + y + "a10 10 0 0 1 20 0a10 10 0 0 1 20 0a10 10 0 0 1 20 0a10 10 0 0 1 20 0";
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
    c.font = POLICE;
    const gauche = px > repere.boite.x + repere.boite.l * 0.6;
    c.textAlign = gauche ? "right" : "left";
    c.fillText(texte, px + (gauche ? -6 : 6), repere.boite.y + 14);
  }
  c.restore();
}

/** Petit disque sur une courbe, à l'instant courant d'un lecteur. */
function disqueInstant(c, repere, couleurs, x, y) {
  if (!Number.isFinite(y)) return;
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

/** Jauge horizontale dessinée en SVG, remplissage de la couleur de série indiquée. */
function jauge(x, y, largeur, libelle, fraction, texteValeur, serie) {
  const f = borner(fraction, 0, 1);
  return (
    '<text x="' + (x - 12) + '" y="' + (y + 11) + '" text-anchor="end" font-family="ui-monospace, monospace" font-size="12" fill="currentColor">' + libelle + "</text>" +
    '<rect x="' + x + '" y="' + y + '" width="' + largeur + '" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>' +
    '<rect x="' + x + '" y="' + y + '" width="' + (largeur * f).toFixed(1) + '" height="14" rx="3" style="fill: var(--' + (serie || "serie-1") + ')"/>' +
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

/** Chemin SVG d'une courbe échantillonnée. */
function cheminCourbe(n, fx, fy) {
  let d = "";
  for (let k = 0; k <= n; k += 1) {
    const x = fx(k);
    const y = fy(k);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    d += (d ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
  }
  return d;
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
  construireAnimDecharge(racine, api);
  construireReponse(racine, api);
  construirePoles(racine, api);
  construireResonance(racine, api);
  construireTraceExemple(racine, api);
  construireBus(racine, api);
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
  const circuit = racine.querySelector("#h-circuit-figure svg");
  if (circuit) ressources.push(api.dessiner(circuit, { duree: 1.4 }));
  /* Les trois réponses et le schéma principal : tracés plus lents, dans l'ordre de lecture. */
  const trois = racine.querySelector("#e-trois-figure svg");
  if (trois) ressources.push(api.dessiner(trois, { duree: 2.2 }));
  const principal = racine.querySelector("#f-schema-principal svg");
  if (principal) ressources.push(api.dessiner(principal, { duree: 2.2 }));
}

/* --------------------------------------------------------------------------
   C. Mini-test des prérequis
   -------------------------------------------------------------------------- */

function construireMinitest(racine, api) {
  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-racines",
      titre: "Racines complexes d'une équation du second degré",
      niveau: "diagnostic",
      enonce:
        "<p>Rappel du cours Diagnostic initial et remise à niveau mathématique : l'équation $r^2 + 2r + 5 = 0$ a deux racines complexes conjuguées $\\sigma \\pm j\\omega$. Quelle est la valeur positive de $\\omega$ ?</p>",
      valeur: 2,
      unite: "",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "ω",
      etapes: [
        { texte: "Discriminant réduit : $\\Delta' = 1^2 - 5 = -4 < 0$, donc deux racines complexes conjuguées." },
        { texte: "$r = -1 \\pm \\sqrt{-4} = -1 \\pm 2j$." },
        {
          texte: "$\\sigma = -1$ et $\\omega = 2$.",
          note: "Dans un circuit RLC, $\\sigma = -\\alpha$ fixera la décroissance de l'enveloppe et $\\omega = \\omega_d$ la pulsation des oscillations : $e^{(-1 \\pm 2j)t} = e^{-t}(\\cos 2t \\pm j\\sin 2t)$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 520 230",
          '<g stroke="currentColor" stroke-width="1.6" fill="none" opacity="0.8"><path d="M40 115H300M220 20V210"/>' +
            '<path d="M180 111v8M140 111v8M100 111v8M216 75h8M216 35h8M216 155h8M216 195h8"/></g>' +
            '<g stroke="currentColor" stroke-width="1.2" fill="none" stroke-dasharray="5 4" opacity="0.7"><path d="M180 35V195M180 35H220M180 195H220"/></g>' +
            '<g fill="currentColor" stroke="none"><circle cx="180" cy="35" r="6"/></g>' +
            '<circle cx="180" cy="195" r="6" fill="none" stroke="currentColor" stroke-width="2"/>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
            '<text x="306" y="119">Re</text><text x="228" y="22">Im</text><text x="180" y="132" text-anchor="middle">-1</text>' +
            '<text x="230" y="39">2</text><text x="230" y="199">-2</text>' +
            '<text x="168" y="30" text-anchor="end">r1 = -1 + 2j</text><text x="168" y="214" text-anchor="end">r2 = -1 - 2j</text>' +
            '<text x="330" y="70">partie réelle -1 :</text><text x="330" y="88">enveloppe e^(-t)</text>' +
            '<text x="330" y="130">partie imaginaire ± 2 :</text><text x="330" y="148">oscillation cos 2t</text></g>',
          "Plan complexe : racines moins un plus deux j et moins un moins deux j, symétriques par rapport à l'axe réel"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-ul-initial",
      titre: "Tension de la bobine juste après la fermeture",
      niveau: "diagnostic",
      enonce:
        "<p>Un circuit RLC série au repos, condensateur déchargé et bobine sans courant, est relié à $t = 0$ à une source de $12\\ \\mathrm{V}$. Quelle tension $u_L(0^+)$ apparaît aux bornes de la bobine, en volts, en convention récepteur ?</p>",
      valeur: 12,
      unite: "V",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "u_L(0+)",
      etapes: [
        { texte: "Continuité : $u_C(0^+) = 0$, le condensateur équivaut à un fil ; $i(0^+) = 0$, la bobine équivaut à un circuit ouvert." },
        { texte: "Courant nul, donc $u_R(0^+) = R \\times 0 = 0$." },
        {
          texte: "Loi des mailles : $u_L(0^+) = E - u_R - u_C = 12\\ \\mathrm{V}$.",
          note: "La pente initiale du courant vaut donc $E/L$, et celle de $u_C$ est nulle puisque $i(0^+) = 0$ : c'est la tangente horizontale des réponses du second ordre.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        visuelSvg(
          conteneur,
          moteur,
          "0 0 560 230",
          '<g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">' +
            '<circle cx="60" cy="115" r="18"/><path d="M60 97V40H140M200 40H380V70M380 160V190H60V133"/><rect x="140" y="28" width="60" height="24" rx="3"/>' +
            '<path d="M380 70V96M380 134V160"/><path d="M366 96H394" stroke-dasharray="3 3"/><path d="M366 134H394" stroke-dasharray="3 3"/>' +
            '<path d="M280 40V190" stroke-width="3"/></g>' +
            '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
            '<text x="60" y="111" text-anchor="middle" font-weight="600">+</text><text x="34" y="120" text-anchor="end">12 V</text>' +
            '<text x="170" y="70" text-anchor="middle">R : u_R = 0</text><text x="290" y="120">C = fil</text>' +
            '<text x="398" y="112">L = circuit ouvert</text><text x="398" y="130">u_L(0+) = 12 V</text>' +
            '<text x="280" y="216" text-anchor="middle">i(0+) = 0 : toute la tension se retrouve aux bornes de L</text></g>',
          "Circuit équivalent à l'instant zéro plus : condensateur remplacé par un fil, bobine par un circuit ouvert qui reçoit les 12 volts"
        );
      },
    })
  );

  ressources.push(
    api.exercice.numerique("#c-minitest", {
      id: "c-amplitude",
      titre: "Amplitude d'une somme de cosinus et de sinus",
      niveau: "diagnostic",
      enonce:
        "<p>On écrit $3\\cos x + 4\\sin x = A\\cos(x - \\varphi)$. Que vaut l'amplitude $A$ ?</p>",
      valeur: 5,
      unite: "",
      tolerance: 0.01,
      chiffres: 2,
      libelleChamp: "A",
      etapes: [
        { texte: "Développement : $A\\cos(x - \\varphi) = A\\cos\\varphi\\cos x + A\\sin\\varphi\\sin x$." },
        { texte: "Identification : $A\\cos\\varphi = 3$ et $A\\sin\\varphi = 4$." },
        {
          texte: "$A = \\sqrt{3^2 + 4^2} = 5$ et $\\varphi = \\arctan(4/3) = 53{,}1^\\circ$.",
          note: "La solution pseudo-périodique $e^{-\\alpha t}(A\\cos\\omega_dt + B\\sin\\omega_dt)$ est une sinusoïde amortie d'amplitude initiale $\\sqrt{A^2 + B^2}$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const phi = Math.atan2(4, 3);
        const traceur = moteur.sim.traceur(conteneur, {
          titre: "Deux écritures de la même sinusoïde",
          genre: "Correction visuelle",
          xTitre: "x",
          xUnite: "rad",
          yTitre: "valeur",
          xMin: 0,
          xMax: 2 * Math.PI,
          yMin: -5.6,
          yMax: 5.6,
          ratio: 0.4,
          series: [
            { id: "s", nom: "3 cos x + 4 sin x, trait épais", couleur: "serie-1", epaisseur: 4, fonction: (x) => 3 * Math.cos(x) + 4 * Math.sin(x) },
            { id: "a", nom: "5 cos(x - 0,927), trait fin superposé", couleur: "serie-2", epaisseur: 1.6, fonction: (x) => 5 * Math.cos(x - phi) },
          ],
          surDessin({ c, repere, couleurs }) {
            marquerPoint(c, repere, couleurs, phi, 5, "maximum 5 en x = φ = 0,927 rad", false);
          },
        });
        if (traceur) ressources.push(traceur);
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Animation : décharge oscillante d'un condensateur dans une bobine
   -------------------------------------------------------------------------- */

function construireAnimDecharge(racine, api) {
  const conteneur = racine.querySelector("#d-anim");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 700 440",
    role: "img",
    "aria-label": "Décharge d'un condensateur dans une bobine et une résistance : porteurs en mouvement alterné, jauges des énergies électrique, magnétique et dissipée",
  });
  const fond = svgEl("g");
  fond.innerHTML =
    "<defs>" + marqueur("fl-d-anim") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M110 190V80H169M229 80H290M350 80H520V130M520 210V320H110V204"/>' +
    '<path d="M88 190H132M88 204H132" stroke-width="3"/>' +
    '<rect x="290" y="68" width="60" height="24" rx="3"/>' +
    '<path d="' + spires(520, 130) + '"/></g>' +
    '<g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="172" cy="80" r="3.2"/><circle cx="226" cy="80" r="3.2"/></g>' +
    '<path d="M174 80L224 77" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<g stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M392 80H432" marker-end="url(#fl-d-anim)"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12.5">' +
    '<text x="76" y="186" text-anchor="end" font-weight="600">+</text><text x="76" y="202" text-anchor="end">C</text>' +
    '<text x="199" y="104" text-anchor="middle">K</text><text x="320" y="112" text-anchor="middle">R</text>' +
    '<text x="542" y="174">L</text><text x="412" y="70" text-anchor="middle">i</text>' +
    '<text x="300" y="342" font-size="11.5">référence 0 V</text></g>';
  const etatC = svgEl("text", { x: 76, y: 228, "text-anchor": "end", "font-family": "ui-monospace, monospace", "font-size": 12, fill: "currentColor" });
  const phase = svgEl("text", { x: 350, y: 30, "text-anchor": "middle", "font-family": "ui-monospace, monospace", "font-size": 13, "font-weight": 600, fill: "currentColor" });
  const porteurs = svgEl("g", { fill: "currentColor", stroke: "none" });
  const jauges = svgEl("g");
  svg.append(fond, etatC, phase, porteurs, jauges);
  conteneur.appendChild(svg);

  /* Boucle parcourue dans le sens horaire, sens de référence du courant. */
  const boucle = cheminOuvert([
    { x: 110, y: 190 },
    { x: 110, y: 80 },
    { x: 520, y: 80 },
    { x: 520, y: 320 },
    { x: 110, y: 320 },
    { x: 110, y: 204 },
  ]);
  const ronds = [];
  for (let k = 0; k < 44; k += 1) {
    const rond = svgEl("circle", { r: 3.4 });
    porteurs.appendChild(rond);
    ronds.push(rond);
  }
  const pas = 28;
  const echelle = 110;

  const valeurs = api.sim.valeurs("#d-anim-valeurs", [
    { id: "t", libelle: "Temps rapporté à la période propre 2π√(LC)", decimales: 2 },
    { id: "u", libelle: "Tension u_C / U0, signée", unite: "%", decimales: 1 },
    { id: "i", libelle: "Courant i / (U0 / Z0), signé", unite: "%", decimales: 1 },
    { id: "wc", libelle: "Énergie électrique W_C", unite: "%", decimales: 1 },
    { id: "wl", libelle: "Énergie magnétique W_L", unite: "%", decimales: 1 },
    { id: "wr", libelle: "Énergie dissipée W_R", unite: "%", decimales: 1 },
    { id: "z", libelle: "Coefficient d'amortissement ζ = R / R_c", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  let rapport = 0.1;
  let tCourant = 0;
  let sol = rlcSerie(2 * rapport, 1, 1, 0, 1, 0);

  function afficher(t) {
    tCourant = t;
    const u = sol.u(t);
    const i = -sol.i(t);
    const q = 1 - u;
    const wc = u * u;
    const wl = i * i;
    const wr = Math.max(0, 1 - wc - wl);

    phase.textContent = t <= 0 ? "K vient de se fermer : C chargé, courant nul" : i >= 0 ? "courant dans le sens de référence" : "courant inversé : retour vers C";
    etatC.textContent = u >= 0 ? "u_C > 0" : "u_C < 0";

    const decalage = q * echelle;
    const nombreRonds = Math.floor(boucle.total / pas);
    ronds.forEach((rond, index) => {
      if (index >= nombreRonds) {
        rond.setAttribute("opacity", "0");
        return;
      }
      const s = (((index * pas + decalage) % boucle.total) + boucle.total) % boucle.total;
      const p = pointSurChemin(boucle, s);
      rond.setAttribute("cx", p.x.toFixed(1));
      rond.setAttribute("cy", p.y.toFixed(1));
      rond.setAttribute("opacity", "0.85");
    });

    jauges.innerHTML =
      jauge(250, 364, 330, "W_C électrique", wc, Math.round(wc * 100) + " %", "serie-1") +
      jauge(250, 388, 330, "W_L magnétique", wl, Math.round(wl * 100) + " %", "serie-3") +
      jauge(250, 412, 330, "W_R dissipée", wr, Math.round(wr * 100) + " %", "serie-5");

    if (valeurs) valeurs.maj({ t: t / (2 * Math.PI), u: u * 100, i: i * 100, wc: wc * 100, wl: wl * 100, wr: wr * 100, z: rapport });
  }

  const curseurs = api.sim.curseurs(
    "#d-anim-curseurs",
    [{ id: "rapport", libelle: "Résistance R rapportée à la résistance critique R_c", min: 0.05, max: 2, pas: 0.01, valeur: rapport, chiffres: 2 }],
    (lues) => {
      rapport = lues.rapport;
      sol = rlcSerie(2 * rapport, 1, 1, 0, 1, 0);
      afficher(tCourant);
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#d-anim-lecteur", {
    de: 0,
    a: 30,
    duree: 24,
    boucle: false,
    auto: false,
    libelle: "Fermer K et laisser l'énergie osciller",
    rappel: (valeur) => afficher(valeur),
  });
  if (lecteur) ressources.push(lecteur);
  afficher(0);
}

/* --------------------------------------------------------------------------
   E. Simulation : réponse à un échelon et lecture des paramètres
   -------------------------------------------------------------------------- */

const REP = { x0: 70, x1: 590, yBas: 190, yHaut: 40, yI: 292, hI: 52, yAxe: 380 };

function fenetreTemps(sol) {
  if (sol.z < 1) {
    const td = (2 * Math.PI) / sol.wd;
    return borner(4.6 / sol.a, 2.2 * td, 10 * td);
  }
  if (sol.regime === "critique") return 8 / sol.w0;
  return 6 / Math.abs(sol.r1);
}

function construireReponse(racine, api) {
  const conteneur = racine.querySelector("#e-reponse");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 660 404",
    role: "img",
    "aria-label": "Réponse d'un circuit RLC série à un échelon : tension du condensateur avec sa valeur finale et son enveloppe, courant, et instant choisi par une poignée sur l'axe des temps",
  });
  const fond = svgEl("g");
  fond.innerHTML =
    "<defs>" +
    '<clipPath id="clip-e-rep-u"><rect x="' + REP.x0 + '" y="20" width="' + (REP.x1 - REP.x0 + 20) + '" height="' + (REP.yBas - 20) + '"/></clipPath>' +
    '<clipPath id="clip-e-rep-i"><rect x="' + REP.x0 + '" y="' + (REP.yI - REP.hI - 6) + '" width="' + (REP.x1 - REP.x0 + 20) + '" height="' + (2 * REP.hI + 12) + '"/></clipPath>' +
    "</defs>" +
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8">' +
    '<path d="M' + REP.x0 + " " + REP.yBas + "H" + (REP.x1 + 16) + "M" + REP.x0 + " " + (REP.yBas + 8) + 'V20"/>' +
    '<path d="M' + REP.x0 + " " + REP.yI + "H" + (REP.x1 + 16) + "M" + REP.x0 + " " + (REP.yI + REP.hI + 6) + "V" + (REP.yI - REP.hI - 8) + '"/>' +
    '<path d="M' + REP.x0 + " " + REP.yAxe + "H" + REP.x1 + '" stroke-width="3" opacity="0.5"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11.5">' +
    '<text x="' + (REP.x1 + 20) + '" y="' + (REP.yBas + 4) + '">t</text><text x="' + (REP.x0 - 8) + '" y="20" text-anchor="end">u_C</text>' +
    '<text x="' + (REP.x0 - 8) + '" y="' + (REP.yBas + 4) + '" text-anchor="end">0</text>' +
    '<text x="' + (REP.x1 + 20) + '" y="' + (REP.yI + 4) + '">t</text><text x="' + (REP.x0 - 8) + '" y="' + (REP.yI - REP.hI - 10) + '" text-anchor="end">i</text>' +
    '<text x="' + (REP.x0 - 8) + '" y="' + (REP.yI + 4) + '" text-anchor="end">0</text>' +
    '<text x="' + (REP.x0 - 8) + '" y="' + (REP.yAxe + 4) + '" text-anchor="end">t</text></g>';
  const graduations = svgEl("g", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", opacity: 0.8 });
  const textesAxe = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11 });
  const zoneU = svgEl("g", { "clip-path": "url(#clip-e-rep-u)" });
  const zoneI = svgEl("g", { "clip-path": "url(#clip-e-rep-i)" });
  const finale = svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", "stroke-dasharray": "10 6", opacity: 0.75 });
  const enveloppe = svgEl("path", { "stroke-width": 1.3, fill: "none", "stroke-dasharray": "4 4", style: "stroke: var(--serie-2)" });
  const courbeU = svgEl("path", { stroke: "currentColor", "stroke-width": 2.8, fill: "none", "stroke-linecap": "round" });
  const losange = svgEl("path", { fill: "currentColor", stroke: "none" });
  const guideU = svgEl("path", { stroke: "currentColor", "stroke-width": 1, fill: "none", opacity: 0.55 });
  const pointU = svgEl("circle", { r: 5, fill: "currentColor" });
  const courbeI = svgEl("path", { stroke: "currentColor", "stroke-width": 2.8, fill: "none", "stroke-linecap": "round" });
  const guideI = svgEl("path", { stroke: "currentColor", "stroke-width": 1, fill: "none", opacity: 0.55 });
  const pointI = svgEl("circle", { r: 5, fill: "currentColor" });
  zoneU.append(finale, enveloppe, courbeU, losange, guideU, pointU);
  zoneI.append(courbeI, guideI, pointI);
  const etiquettes = svgEl("g", { fill: "currentColor", stroke: "none", "font-family": "ui-monospace, monospace", "font-size": 11.5 });
  svg.append(fond, graduations, zoneU, zoneI, textesAxe, etiquettes);
  conteneur.appendChild(svg);

  const etat = { r: 40, l: 10, c: 1, e: 10, f: 0.2 };
  const NOMS_REGIMES = ["apériodique", "critique", "pseudo-périodique"];

  const valeurs = api.sim.valeurs("#e-reponse-valeurs", [
    { id: "regime", libelle: "Régime", format: (v) => NOMS_REGIMES[v] || "" },
    { id: "w0", libelle: "Pulsation propre ω0", unite: "rad/s", decimales: 0 },
    { id: "f0", libelle: "Fréquence propre f0", unite: "Hz", decimales: 1 },
    { id: "z", libelle: "Coefficient d'amortissement ζ", decimales: 3 },
    { id: "q", libelle: "Facteur de qualité Q", decimales: 2 },
    { id: "rc", libelle: "Résistance critique R_c", unite: "Ω", decimales: 1 },
    { id: "d", libelle: "Dépassement D", unite: "%", decimales: 1 },
    { id: "tp", libelle: "Instant du premier maximum t_p", unite: "ms", decimales: 3 },
    { id: "t", libelle: "Instant étudié t", unite: "ms", decimales: 3 },
    { id: "u", libelle: "Tension u_C(t)", unite: "V", decimales: 2 },
    { id: "i", libelle: "Courant i(t)", unite: "mA", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const l = etat.l / 1000;
    const c = etat.c * 1e-6;
    const sol = rlcSerie(etat.r, l, c, etat.e);
    const tfin = fenetreTemps(sol);
    const n = 260;
    const ts = (k) => (tfin * k) / n;
    let umax = etat.e * 1.08;
    let imax = 1e-9;
    for (let k = 0; k <= n; k += 1) {
      umax = Math.max(umax, sol.u(ts(k)) * 1.08);
      imax = Math.max(imax, Math.abs(sol.i(ts(k))));
    }
    const vx = (t) => REP.x0 + ((REP.x1 - REP.x0) * t) / tfin;
    const vyU = (u) => REP.yBas - ((REP.yBas - REP.yHaut) * u) / umax;
    const vyI = (i) => REP.yI - (REP.hI * i) / imax;

    courbeU.setAttribute("d", cheminCourbe(n, (k) => vx(ts(k)), (k) => vyU(sol.u(ts(k)))));
    courbeI.setAttribute("d", cheminCourbe(n, (k) => vx(ts(k)), (k) => vyI(sol.i(ts(k)))));
    finale.setAttribute("d", "M" + REP.x0 + " " + vyU(etat.e).toFixed(1) + "H" + (REP.x1 + 16));
    if (sol.z < 1) {
      const env = (t) => (etat.e * Math.exp(-sol.a * t)) / Math.sqrt(1 - sol.z * sol.z);
      enveloppe.setAttribute(
        "d",
        cheminCourbe(n, (k) => vx(ts(k)), (k) => vyU(etat.e + env(ts(k)))) +
          cheminCourbe(n, (k) => vx(ts(k)), (k) => vyU(etat.e - env(ts(k)))).replace(/^M/, "M")
      );
      const xp = vx(sol.tp);
      const yp = vyU(etat.e * (1 + sol.d));
      losange.setAttribute("d", sol.tp <= tfin ? "M" + xp.toFixed(1) + " " + (yp - 7).toFixed(1) + "l6 7l-6 7l-6 -7Z" : "");
    } else {
      enveloppe.setAttribute("d", "");
      losange.setAttribute("d", "");
    }

    const t = etat.f * tfin;
    const u = sol.u(t);
    const i = sol.i(t);
    const px = vx(t);
    guideU.setAttribute("d", "M" + px.toFixed(1) + " 20V" + REP.yBas);
    pointU.setAttribute("cx", px.toFixed(1));
    pointU.setAttribute("cy", vyU(u).toFixed(1));
    guideI.setAttribute("d", "M" + px.toFixed(1) + " " + (REP.yI - REP.hI - 4) + "V" + (REP.yI + REP.hI + 4));
    pointI.setAttribute("cx", px.toFixed(1));
    pointI.setAttribute("cy", vyI(i).toFixed(1));

    const pasMs = api.util.pasJoli(tfin * 1000, 6);
    let traits = "";
    let textes = "";
    for (let v = pasMs; v <= tfin * 1000 + 1e-9; v += pasMs) {
      const x = vx(v / 1000);
      traits += "M" + x.toFixed(1) + " " + REP.yBas + "v6M" + x.toFixed(1) + " " + REP.yI + "v6M" + x.toFixed(1) + " " + REP.yAxe + "v-6";
      const decimales = pasMs >= 1 ? 0 : pasMs >= 0.1 ? 1 : pasMs >= 0.01 ? 2 : 3;
      textes += '<text x="' + x.toFixed(1) + '" y="' + (REP.yAxe + 18) + '" text-anchor="middle">' + nombre(api, v, decimales) + "</text>";
    }
    textes += '<text x="' + REP.x1 + '" y="' + (REP.yAxe + 34) + '" text-anchor="end">ms</text>';
    graduations.innerHTML = '<path d="' + traits + '"/>';
    textesAxe.innerHTML = textes;
    etiquettes.innerHTML =
      '<text x="' + (REP.x0 - 8) + '" y="' + (vyU(etat.e) + 4).toFixed(1) + '" text-anchor="end">E</text>' +
      '<text x="' + (REP.x1 + 16) + '" y="34" text-anchor="end" font-weight="600">régime ' + sol.regime + "</text>" +
      '<text x="' + (REP.x0 - 8) + '" y="' + (REP.yI - REP.hI + 4) + '" text-anchor="end">' + nombre(api, imax * 1000, imax * 1000 >= 100 ? 0 : 1) + "</text>" +
      '<text x="' + (REP.x0 + 6) + '" y="' + (REP.yI - REP.hI - 10) + '">mA</text>';

    if (valeurs) {
      valeurs.maj({
        regime: sol.regime === "apériodique" ? 0 : sol.regime === "critique" ? 1 : 2,
        w0: sol.w0,
        f0: sol.w0 / (2 * Math.PI),
        z: sol.z,
        q: sol.q,
        rc: 2 * sol.z0,
        d: sol.d * 100,
        tp: sol.tp * 1000,
        t: t * 1000,
        u,
        i: i * 1000,
      });
    }
  }

  const poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: REP.x0, y: REP.yAxe },
    a: { x: REP.x1, y: REP.yAxe },
    min: 0,
    max: 1,
    pas: 0.005,
    valeur: etat.f,
    libelle: "Instant étudié, en fraction de la fenêtre de temps",
    format: (mesure) => api.util.formater(mesure.valeur * 100, 1) + " % de la fenêtre",
    diffuserAuDepart: false,
    rappel(mesure) {
      etat.f = mesure.valeur;
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-reponse-curseurs",
    [
      { id: "r", libelle: "Résistance totale R", min: 1, max: 400, pas: 1, valeur: etat.r, unite: "Ω" },
      { id: "l", libelle: "Inductance L", min: 1, max: 100, pas: 1, valeur: etat.l, unite: "mH" },
      { id: "c", libelle: "Capacité C", min: 0.1, max: 10, pas: 0.1, valeur: etat.c, unite: "µF", chiffres: 1 },
      { id: "e", libelle: "Échelon de tension E", min: 1, max: 24, pas: 0.5, valeur: etat.e, unite: "V" },
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
   E. Simulation : placer les pôles dans le plan complexe
   -------------------------------------------------------------------------- */

const PLAN = { ox: 258, oy: 170, u: 19, xMin: 30, xMax: 286, yMin: 18, yMax: 322 };
const REPONSE_POLES = { x0: 360, x1: 740, yBas: 290, yHaut: 40, tMs: 5 };

function construirePoles(racine, api) {
  const conteneur = racine.querySelector("#e-poles");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 760 340",
    role: "img",
    "aria-label": "Plan complexe des pôles d'un circuit RLC, pôle supérieur déplaçable et pôle conjugué, avec à droite la réponse normalisée à un échelon",
  });
  let marques = "";
  for (let k = -12; k <= 1; k += 2) {
    const x = PLAN.ox + k * PLAN.u;
    marques += "M" + x + " " + (PLAN.oy - 4) + "v8";
  }
  for (let k = -8; k <= 8; k += 2) {
    if (k === 0) continue;
    const y = PLAN.oy - k * PLAN.u;
    marques += "M" + (PLAN.ox - 4) + " " + y + "h8";
  }
  let lignesZeta = "";
  let textesZeta = "";
  for (const z of [0.2, 0.5, 0.7]) {
    const s = Math.sqrt(1 - z * z);
    const longueur = Math.min(11.5 / z, 7.6 / s);
    const x = PLAN.ox - z * longueur * PLAN.u;
    const yh = PLAN.oy - s * longueur * PLAN.u;
    const yb = PLAN.oy + s * longueur * PLAN.u;
    lignesZeta += "M" + PLAN.ox + " " + PLAN.oy + "L" + x.toFixed(1) + " " + yh.toFixed(1) + "M" + PLAN.ox + " " + PLAN.oy + "L" + x.toFixed(1) + " " + yb.toFixed(1);
    textesZeta += '<text x="' + (x - 4).toFixed(1) + '" y="' + (yh - 4).toFixed(1) + '" text-anchor="end">ζ = ' + String(z).replace(".", ",") + "</text>";
  }
  const fond = svgEl("g");
  fond.innerHTML =
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8">' +
    '<path d="M' + PLAN.xMin + " " + PLAN.oy + "H" + PLAN.xMax + "M" + PLAN.ox + " " + PLAN.yMin + "V" + PLAN.yMax + '"/>' +
    '<path d="' + marques + '"/></g>' +
    '<path d="' + lignesZeta + '" stroke="currentColor" stroke-width="1" fill="none" stroke-dasharray="2 4" opacity="0.7"/>' +
    '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8">' +
    '<path d="M' + REPONSE_POLES.x0 + " " + REPONSE_POLES.yBas + "H" + REPONSE_POLES.x1 + "M" + REPONSE_POLES.x0 + " " + (REPONSE_POLES.yBas + 6) + "V" + (REPONSE_POLES.yHaut - 12) + '"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="11">' +
    '<text x="' + PLAN.xMax + '" y="' + (PLAN.oy + 18) + '" text-anchor="end">σ</text>' +
    '<text x="' + (PLAN.ox + 8) + '" y="' + (PLAN.yMin + 10) + '">ω</text>' +
    '<text x="' + (PLAN.ox - 10 * PLAN.u) + '" y="' + (PLAN.oy + 18) + '" text-anchor="middle">-10</text>' +
    '<text x="' + (PLAN.ox - 5 * PLAN.u) + '" y="' + (PLAN.oy + 18) + '" text-anchor="middle">-5</text>' +
    '<text x="' + (PLAN.ox + 8) + '" y="' + (PLAN.oy - 5 * PLAN.u + 4) + '">5</text>' +
    '<text x="' + (PLAN.ox + 8) + '" y="' + (PLAN.oy + 5 * PLAN.u + 4) + '">-5</text>' +
    '<text x="' + PLAN.xMin + '" y="' + (PLAN.yMax + 14) + '">unités : 1000 s⁻¹ et 1000 rad/s</text>' +
    textesZeta +
    '<text x="' + (REPONSE_POLES.x0 - 6) + '" y="' + (REPONSE_POLES.yBas + 4) + '" text-anchor="end">0</text>' +
    '<text x="' + (REPONSE_POLES.x0 - 6) + '" y="' + (REPONSE_POLES.yBas - 125 + 4) + '" text-anchor="end">1</text>' +
    '<text x="' + (REPONSE_POLES.x0 - 6) + '" y="' + (REPONSE_POLES.yHaut + 4) + '" text-anchor="end">2</text>' +
    '<text x="' + REPONSE_POLES.x0 + '" y="' + (REPONSE_POLES.yHaut - 16) + '">u_C / E</text>' +
    '<text x="' + REPONSE_POLES.x1 + '" y="' + (REPONSE_POLES.yBas + 18) + '" text-anchor="end">5 ms</text>' +
    '<text x="' + ((REPONSE_POLES.x0 + REPONSE_POLES.x1) / 2) + '" y="' + (REPONSE_POLES.yBas + 18) + '" text-anchor="middle">2,5 ms</text></g>' +
    '<path d="M' + REPONSE_POLES.x0 + " " + (REPONSE_POLES.yBas - 125) + "H" + REPONSE_POLES.x1 + '" stroke="currentColor" stroke-width="1.3" fill="none" stroke-dasharray="10 6" opacity="0.75"/>';
  const rayon = svgEl("path", { stroke: "currentColor", "stroke-width": 2, fill: "none" });
  const arc = svgEl("path", { stroke: "currentColor", "stroke-width": 1.4, fill: "none", "stroke-dasharray": "4 3" });
  const conjugue = svgEl("circle", { r: 6.5, fill: "none", stroke: "currentColor", "stroke-width": 2 });
  const texteTheta = svgEl("text", { "font-family": "ui-monospace, monospace", "font-size": 11.5, fill: "currentColor", "text-anchor": "end" });
  const zoneReponse = svgEl("g");
  const enveloppe = svgEl("path", { "stroke-width": 1.3, fill: "none", "stroke-dasharray": "4 4", style: "stroke: var(--serie-2)" });
  const courbe = svgEl("path", { stroke: "currentColor", "stroke-width": 2.8, fill: "none", "stroke-linecap": "round" });
  zoneReponse.append(enveloppe, courbe);
  svg.append(fond, rayon, arc, conjugue, texteTheta, zoneReponse);
  conteneur.appendChild(svg);

  const valeurs = api.sim.valeurs("#e-poles-valeurs", [
    { id: "alpha", libelle: "Atténuation α = -σ", unite: "s⁻¹", decimales: 0 },
    { id: "wd", libelle: "Pseudo-pulsation ω_d", unite: "rad/s", decimales: 0 },
    { id: "w0", libelle: "Pulsation propre ω0 = |r|", unite: "rad/s", decimales: 0 },
    { id: "z", libelle: "Coefficient d'amortissement ζ = cos θ", decimales: 3 },
    { id: "q", libelle: "Facteur de qualité Q", decimales: 2 },
    { id: "d", libelle: "Dépassement D", unite: "%", decimales: 1 },
    { id: "tp", libelle: "Premier maximum t_p", unite: "ms", decimales: 3 },
    { id: "ts", libelle: "Établissement à 5 %, environ 3 / α", unite: "ms", decimales: 2 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner(point) {
    const sigma = (point.x - PLAN.ox) / PLAN.u;
    const omega = Math.max(0, (PLAN.oy - point.y) / PLAN.u);
    const alpha = -sigma * 1000;
    const wd = omega * 1000;
    const w0 = Math.hypot(alpha, wd);
    const z = alpha / w0;
    const sol = rlcSerie(2 * alpha, 1, 1 / (w0 * w0), 1);

    rayon.setAttribute("d", "M" + PLAN.ox + " " + PLAN.oy + "L" + point.x.toFixed(1) + " " + point.y.toFixed(1));
    conjugue.setAttribute("cx", point.x.toFixed(1));
    conjugue.setAttribute("cy", (2 * PLAN.oy - point.y).toFixed(1));
    conjugue.setAttribute("opacity", omega > 0.05 ? "1" : "0");
    const theta = Math.atan2(omega, -sigma);
    const ra = 34;
    const fin = { x: PLAN.ox - ra * Math.cos(theta), y: PLAN.oy - ra * Math.sin(theta) };
    arc.setAttribute("d", theta > 0.02 ? "M" + (PLAN.ox - ra) + " " + PLAN.oy + "A" + ra + " " + ra + " 0 0 1 " + fin.x.toFixed(1) + " " + fin.y.toFixed(1) : "");
    texteTheta.setAttribute("x", (PLAN.ox - ra - 6).toFixed(1));
    texteTheta.setAttribute("y", (PLAN.oy - 8).toFixed(1));
    texteTheta.textContent = theta > 0.12 ? "θ" : "";

    const n = 300;
    const tMax = REPONSE_POLES.tMs / 1000;
    const vx = (k) => REPONSE_POLES.x0 + ((REPONSE_POLES.x1 - REPONSE_POLES.x0) * k) / n;
    const vy = (u) => REPONSE_POLES.yBas - 125 * borner(u, -0.2, 2.15);
    courbe.setAttribute("d", cheminCourbe(n, vx, (k) => vy(sol.u((tMax * k) / n))));
    if (z < 0.999) {
      const s = Math.sqrt(1 - z * z);
      const env = (k) => Math.exp((-alpha * tMax * k) / n) / s;
      enveloppe.setAttribute("d", cheminCourbe(n, vx, (k) => vy(1 + env(k))) + cheminCourbe(n, vx, (k) => vy(1 - env(k))));
    } else {
      enveloppe.setAttribute("d", "");
    }

    if (valeurs) {
      valeurs.maj({
        alpha,
        wd,
        w0,
        z,
        q: 1 / (2 * z),
        d: depassement(z) * 100,
        tp: wd > 1 ? (Math.PI / wd) * 1000 : NaN,
        ts: (3 / alpha) * 1000,
      });
    }
  }

  const depart = { x: PLAN.ox - 1.5 * PLAN.u, y: PLAN.oy - 5 * PLAN.u };
  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: PLAN.xMin, y: PLAN.yMin, largeur: PLAN.ox - 4 - PLAN.xMin, hauteur: PLAN.oy - PLAN.yMin },
    valeur: depart,
    pas: 3.8,
    libelle: "Pôle supérieur dans le plan complexe",
    format: (mesure) =>
      "σ = " + api.util.formater((mesure.x - PLAN.ox) / PLAN.u, 2) + ", ω = " + api.util.formater((PLAN.oy - mesure.y) / PLAN.u, 2) + " (milliers)",
    rappel(mesure) {
      dessiner({ x: mesure.x, y: mesure.y });
    },
  });
  if (poignee) ressources.push(poignee);
  else dessiner(depart);
}

/* --------------------------------------------------------------------------
   E. Animation : résonance transitoire
   -------------------------------------------------------------------------- */

function simulerResonance(rapport, q) {
  const f0 = 1000;
  const w0 = 2 * Math.PI * f0;
  const l = 1;
  const c = 1 / (w0 * w0);
  const r = w0 / q;
  const w = rapport * w0;
  const h = 1 / (f0 * 100);
  const pas = Math.round(0.04 / h);
  const deriv = (t, u, i) => [i / c, (Math.sin(w * t) - r * i - u) / l];
  let u = 0;
  let i = 0;
  const pointsU = [[0, 0]];
  const pointsE = [[0, 0]];
  for (let k = 0; k < pas; k += 1) {
    const t = k * h;
    const k1 = deriv(t, u, i);
    const k2 = deriv(t + h / 2, u + (h / 2) * k1[0], i + (h / 2) * k1[1]);
    const k3 = deriv(t + h / 2, u + (h / 2) * k2[0], i + (h / 2) * k2[1]);
    const k4 = deriv(t + h, u + h * k3[0], i + h * k3[1]);
    u += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    i += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    const tms = (t + h) * 1000;
    pointsU.push([tms, u]);
    pointsE.push([tms, Math.sin(w * (t + h))]);
  }
  return { pointsU, pointsE, hMs: h * 1000, w0 };
}

function construireResonance(racine, api) {
  if (!racine.querySelector("#e-resonance-trace")) return;

  let rapport = 1;
  let q = 10;
  let tCourant = 0;
  let calcul = simulerResonance(rapport, q);

  const traceur = api.sim.traceur("#e-resonance-trace", {
    titre: "Sinusoïde appliquée à t = 0 à un circuit de fréquence propre 1 kHz",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "tension",
    yUnite: "V",
    xMin: 0,
    xMax: 40,
    yMin: -11.5,
    yMax: 11.5,
    ratio: 0.46,
    series: [
      { id: "uc", nom: "u_C(t), tension du condensateur", couleur: "serie-1", epaisseur: 2.4, points: [] },
      { id: "e", nom: "e(t), tension de la source, 1 V crête", couleur: "serie-6", epaisseur: 1.2, points: [] },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, q, "+Q E_m");
      ligneHorizontale(c, repere, couleurs, -q, "-Q E_m", true);
      const index = Math.min(calcul.pointsU.length - 1, Math.round(tCourant / calcul.hMs));
      const point = calcul.pointsU[index];
      if (point) disqueInstant(c, repere, couleurs, point[0], point[1]);
    },
  });
  if (traceur) ressources.push(traceur);

  const valeurs = api.sim.valeurs("#e-resonance-valeurs", [
    { id: "t", libelle: "Temps écoulé", unite: "ms", decimales: 2 },
    { id: "periodes", libelle: "Périodes propres écoulées", decimales: 1 },
    { id: "atteinte", libelle: "Amplitude déjà atteinte par u_C", unite: "V", decimales: 2 },
    { id: "finale", libelle: "Amplitude du régime établi", unite: "V", decimales: 2 },
    { id: "tau", libelle: "Constante de l'enveloppe 1 / α = 2Q / ω0", unite: "ms", decimales: 2 },
    { id: "battement", libelle: "Fréquence de battement |f - f0|", unite: "Hz", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher(t) {
    tCourant = t;
    const index = Math.min(calcul.pointsU.length - 1, Math.round(t / calcul.hMs));
    let atteinte = 0;
    for (let k = 0; k <= index; k += 1) atteinte = Math.max(atteinte, Math.abs(calcul.pointsU[k][1]));
    if (traceur) {
      traceur.definirDonnees("uc", calcul.pointsU.slice(0, index + 1));
      traceur.definirDonnees("e", calcul.pointsE.slice(0, index + 1));
    }
    const finale = 1 / Math.sqrt(Math.pow(1 - rapport * rapport, 2) + Math.pow(rapport / q, 2));
    if (valeurs) {
      valeurs.maj({
        t,
        periodes: t,
        atteinte,
        finale,
        tau: ((2 * q) / calcul.w0) * 1000,
        battement: Math.abs(rapport - 1) * 1000,
      });
    }
  }

  const lecteur = api.sim.lecteur("#e-resonance-lecteur", {
    de: 0,
    a: 40,
    duree: 16,
    boucle: false,
    auto: false,
    libelle: "Appliquer la sinusoïde et laisser l'amplitude s'établir",
    rappel: (valeur) => afficher(valeur),
  });
  if (lecteur) ressources.push(lecteur);

  const curseurs = api.sim.curseurs(
    "#e-resonance-curseurs",
    [
      { id: "rapport", libelle: "Rapport f / f0 de la fréquence de la source", min: 0.5, max: 1.5, pas: 0.01, valeur: rapport, chiffres: 2 },
      { id: "q", libelle: "Facteur de qualité Q", min: 2, max: 30, pas: 1, valeur: q },
    ],
    (lues) => {
      rapport = lues.rapport;
      q = lues.q;
      calcul = simulerResonance(rapport, q);
      const haut = Math.max(2, q * 1.15);
      if (traceur) traceur.definirPlage({ yMin: -haut, yMax: haut });
      afficher(tCourant);
    }
  );
  if (curseurs) ressources.push(curseurs);
  afficher(tCourant);
}

/* --------------------------------------------------------------------------
   H. Courbes de l'exemple : branchement à chaud
   -------------------------------------------------------------------------- */

function construireTraceExemple(racine, api) {
  if (!racine.querySelector("#h-trace")) return;
  const brut = rlcSerie(MODULE.r, MODULE.l, MODULE.c, MODULE.e);
  const amorti = rlcSerie(MODULE.rAmorti, MODULE.l, MODULE.c, MODULE.e);
  const traceur = api.sim.traceur("#h-trace", {
    titre: "Tension d'entrée du module après le branchement",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "u_C",
    yUnite: "V",
    xMin: 0,
    xMax: 0.6,
    yMin: 0,
    yMax: 42,
    ratio: 0.46,
    echantillons: 480,
    series: [
      { id: "brut", nom: "R = 0,1 Ω, sans amortissement ajouté", couleur: "serie-1", epaisseur: 2.8, fonction: (t) => brut.u(t / 1000) },
      { id: "amorti", nom: "R = 0,49 Ω, résistance série de 0,39 Ω", couleur: "serie-6", epaisseur: 1.6, fonction: (t) => amorti.u(t / 1000) },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, MODULE.tenue, "tenue de l'entrée : 36 V");
      ligneHorizontale(c, repere, couleurs, MODULE.e, "24 V nominal", true);
      marquerPoint(c, repere, couleurs, brut.tp * 1000, MODULE.e * (1 + brut.d), "38,5 V à 101 µs", false);
      marquerPoint(c, repere, couleurs, amorti.tp * 1000, MODULE.e * (1 + amorti.d), "24,5 V à 157 µs", false);
    },
  });
  if (traceur) ressources.push(traceur);
}

/* --------------------------------------------------------------------------
   I. Animation : court-circuit de la précharge du bus continu
   -------------------------------------------------------------------------- */

function modeleBus(fraction) {
  const u0 = fraction * BUS.e;
  const sol = rlcSerie(BUS.r, BUS.l, BUS.c, BUS.e, u0, 0);
  const ecart = BUS.e - u0;
  const tArret = ecart > 1e-9 ? Math.PI / sol.wd : 0;
  const uArret = ecart > 1e-9 ? sol.u(tArret) : u0;
  return {
    u0,
    ecart,
    sol,
    tArret,
    uLin: (t) => sol.u(t),
    iLin: (t) => sol.i(t),
    uDiode: (t) => (t <= tArret ? sol.u(t) : uArret),
    iDiode: (t) => (t <= tArret ? Math.max(0, sol.i(t)) : 0),
    crete: ecart > 1e-9 ? BUS.e + ecart * sol.d : u0,
    iCrete: ecart > 1e-9 ? sol.i(Math.atan(sol.wd / sol.a) / sol.wd) : 0,
  };
}

function construireBus(racine, api) {
  const conteneur = racine.querySelector("#i-bus");
  if (!conteneur) return;

  const svg = svgEl("svg", {
    viewBox: "0 0 720 300",
    role: "img",
    "aria-label": "Bus continu du variateur : source redressée, diode du pont, résistance de précharge court-circuitée par KM2, self de lissage et condensateurs du bus, flèche de courant et jauge de tension",
  });
  const echelleJauge = 210 / BUS.tenue;
  const yNominal = 250 - BUS.e * echelleJauge;
  const fond = svgEl("g");
  fond.innerHTML =
    "<defs>" + marqueurFixe("fl-i-bus") + "</defs>" +
    '<g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="60" cy="170" r="22"/><path d="M60 148V70H100M124 70H190M250 70H330"/>' +
    '<path d="M100 58V82L124 70Z"/><path d="M124 58V82"/>' +
    '<rect x="190" y="58" width="60" height="24" rx="3"/>' +
    '<path d="M170 70V30H196M244 30H290V70"/>' +
    '<path d="' + spiresH(330, 70) + '"/><path d="M410 70H540V150M540 164V250H60V192"/>' +
    '<path d="M518 150H562M518 164H562" stroke-width="3"/>' +
    '<path d="M201 30L239 28" stroke-width="3"/>' +
    '<path d="M300 250V262M286 262H314M291 268H309M296 274H304"/>' +
    '<rect x="620" y="40" width="20" height="210" rx="3" stroke-width="1.2" opacity="0.6"/></g>' +
    '<g fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="199" cy="30" r="3.2"/><circle cx="241" cy="30" r="3.2"/></g>' +
    '<g stroke="currentColor" stroke-width="1.2" fill="none" stroke-dasharray="4 3"><path d="M612 40H648M612 ' + yNominal.toFixed(1) + 'H648"/></g>' +
    '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">' +
    '<text x="60" y="166" text-anchor="middle" font-weight="600">+</text><text x="60" y="214" text-anchor="middle">565,7 V</text>' +
    '<text x="112" y="50" text-anchor="middle">D</text><text x="220" y="104" text-anchor="middle">R_p = 47 Ω</text>' +
    '<text x="220" y="18" text-anchor="middle">KM2 fermé à t = 0</text><text x="370" y="50" text-anchor="middle">L = 1 mH</text>' +
    '<text x="526" y="146" text-anchor="end" font-weight="600">+</text><text x="510" y="190" text-anchor="end">C = 2,2 mF</text>' +
    '<text x="470" y="56" text-anchor="middle">i</text><text x="322" y="282" font-size="11.5">masse : 0 V</text>' +
    '<text x="652" y="44" font-size="11">900 V</text><text x="652" y="' + (yNominal + 4).toFixed(1) + '" font-size="11">565,7 V</text>' +
    "</g>";
  const remplissage = svgEl("rect", { x: 620, width: 20, rx: 3, style: "fill: var(--serie-1)" });
  const fleche = svgEl("path", { stroke: "currentColor", fill: "none", "stroke-linecap": "round", "marker-end": "url(#fl-i-bus)" });
  const statut1 = svgEl("text", { x: 300, y: 150, "text-anchor": "middle", "font-family": "ui-monospace, monospace", "font-size": 12.5, "font-weight": 600, fill: "currentColor" });
  const statut2 = svgEl("text", { x: 300, y: 172, "text-anchor": "middle", "font-family": "ui-monospace, monospace", "font-size": 12, fill: "currentColor" });
  const valeurJauge = svgEl("text", { x: 630, y: 270, "text-anchor": "middle", "font-family": "ui-monospace, monospace", "font-size": 11.5, fill: "currentColor" });
  svg.append(fond, remplissage, fleche, statut1, statut2, valeurJauge);
  conteneur.appendChild(svg);

  let fraction = 0.5;
  let tCourant = 0;
  let modele = modeleBus(fraction);

  const traceU = api.sim.traceur("#i-bus-tension", {
    titre: "Tension du bus après la fermeture de KM2",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "u_bus",
    yUnite: "V",
    xMin: 0,
    xMax: 40,
    yMin: 250,
    yMax: 830,
    ratio: 0.4,
    series: [
      { id: "lin", nom: "modèle linéaire, courant inversable", couleur: "serie-6", epaisseur: 1.6, fonction: (t) => modele.uLin(t / 1000) },
      { id: "diode", nom: "avec le pont de diodes, courant bloqué en inverse", couleur: "serie-1", epaisseur: 2.8, fonction: (t) => modele.uDiode(t / 1000) },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, BUS.e, "565,7 V nominal", true);
      disqueInstant(c, repere, couleurs, tCourant, modele.uDiode(tCourant / 1000));
    },
  });
  if (traceU) ressources.push(traceU);

  const traceI = api.sim.traceur("#i-bus-courant", {
    titre: "Courant dans la self de lissage",
    xTitre: "temps",
    xUnite: "ms",
    yTitre: "i",
    yUnite: "A",
    xMin: 0,
    xMax: 40,
    yMin: -420,
    yMax: 420,
    ratio: 0.36,
    series: [
      { id: "lin", nom: "modèle linéaire", couleur: "serie-6", epaisseur: 1.6, fonction: (t) => modele.iLin(t / 1000) },
      { id: "diode", nom: "avec le pont de diodes", couleur: "serie-1", epaisseur: 2.8, fonction: (t) => modele.iDiode(t / 1000) },
    ],
    surDessin({ c, repere, couleurs }) {
      ligneHorizontale(c, repere, couleurs, 0, "");
      disqueInstant(c, repere, couleurs, tCourant, modele.iDiode(tCourant / 1000));
    },
  });
  if (traceI) ressources.push(traceI);

  const valeurs = api.sim.valeurs("#i-bus-valeurs", [
    { id: "u0", libelle: "Tension du bus à la fermeture de KM2", unite: "V", decimales: 1 },
    { id: "ecart", libelle: "Écart à combler", unite: "V", decimales: 1 },
    { id: "crete", libelle: "Tension crête", unite: "V", decimales: 1 },
    { id: "icrete", libelle: "Courant crête", unite: "A", decimales: 1 },
    { id: "t", libelle: "Instant après la fermeture", unite: "ms", decimales: 2 },
    { id: "ud", libelle: "Tension du bus avec le pont de diodes", unite: "V", decimales: 1 },
    { id: "ul", libelle: "Tension du bus, modèle linéaire", unite: "V", decimales: 1 },
    { id: "id", libelle: "Courant avec le pont de diodes", unite: "A", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function afficher(tMs) {
    tCourant = tMs;
    const t = tMs / 1000;
    const ud = modele.uDiode(t);
    const id = modele.iDiode(t);
    const hauteur = borner(ud, 0, BUS.tenue) * echelleJauge;
    remplissage.setAttribute("y", (250 - hauteur).toFixed(1));
    remplissage.setAttribute("height", hauteur.toFixed(1));
    valeurJauge.textContent = "u_bus = " + nombre(api, ud, 0) + " V";
    reglerFleche(fleche, "M440 70H500", id / 400);
    if (modele.ecart <= 1e-9) {
      statut1.textContent = "bus déjà à la tension nominale";
      statut2.textContent = "aucun transitoire";
    } else if (t <= modele.tArret) {
      statut1.textContent = "la self pousse le courant vers C";
      statut2.textContent = id > 0.5 ? "diodes passantes" : "courant presque nul";
    } else {
      statut1.textContent = "courant annulé au maximum de tension";
      statut2.textContent = "diodes bloquées : le bus reste à la crête";
    }
    if (valeurs) {
      valeurs.maj({
        u0: modele.u0,
        ecart: modele.ecart,
        crete: modele.crete,
        icrete: modele.iCrete,
        t: tMs,
        ud,
        ul: modele.uLin(t),
        id,
      });
    }
    if (traceU) traceU.demanderRendu();
    if (traceI) traceI.demanderRendu();
  }

  const curseurs = api.sim.curseurs(
    "#i-bus-curseurs",
    [{ id: "pourcent", libelle: "Tension du bus à la fermeture de KM2, en % du nominal", min: 50, max: 100, pas: 1, valeur: fraction * 100, unite: "%" }],
    (lues) => {
      fraction = lues.pourcent / 100;
      modele = modeleBus(fraction);
      if (traceU) {
        traceU.definirFonction("lin", (t) => modele.uLin(t / 1000));
        traceU.definirFonction("diode", (t) => modele.uDiode(t / 1000));
      }
      if (traceI) {
        traceI.definirFonction("lin", (t) => modele.iLin(t / 1000));
        traceI.definirFonction("diode", (t) => modele.iDiode(t / 1000));
      }
      afficher(tCourant);
    }
  );
  if (curseurs) ressources.push(curseurs);

  const lecteur = api.sim.lecteur("#i-bus-lecteur", {
    de: 0,
    a: 40,
    duree: 12,
    boucle: false,
    auto: false,
    libelle: "Fermer KM2 et suivre le bus",
    rappel: (valeur) => afficher(valeur),
  });
  if (lecteur) ressources.push(lecteur);
  afficher(0);
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

/** Tracé de correction d'une réponse indicielle, temps en millisecondes. */
function traceCorrection(moteur, conteneur, options) {
  const traceur = moteur.sim.traceur(conteneur, {
    genre: "Correction visuelle",
    xTitre: "t",
    xUnite: "ms",
    ratio: 0.42,
    echantillons: 420,
    ...options,
  });
  if (traceur) ressources.push(traceur);
}

function construireExercices(racine, api) {
  const cible = "#k-exercices-blocs";

  /* Fondamental 1 : calcul de ζ et classement. */
  const ex1 = rlcSerie(100, 0.05, 2e-6, 1);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-classement",
      titre: "Classer un circuit RLC série",
      niveau: "fondamental",
      enonce:
        "<p>Un circuit RLC série comporte $R = 100\\ \\Omega$, $L = 50\\ \\mathrm{mH}$ et $C = 2\\ \\mu\\mathrm{F}$. Calculez son coefficient d'amortissement $\\zeta$, puis déduisez-en son régime.</p>",
      valeur: 50 * Math.sqrt(2e-6 / 0.05),
      unite: "",
      tolerance: 0.02,
      chiffres: 3,
      libelleChamp: "ζ",
      etapes: [
        { texte: "Impédance caractéristique : $Z_0 = \\sqrt{L/C} = \\sqrt{0{,}05/(2 \\times 10^{-6})} = \\sqrt{25\\,000} = 158{,}1\\ \\Omega$." },
        { texte: "$\\zeta = \\dfrac{R}{2Z_0} = \\dfrac{100}{316{,}2} = 0{,}316$." },
        { texte: "$\\zeta < 1$ : régime pseudo-périodique ; la résistance critique vaut $R_c = 2Z_0 = 316\\ \\Omega$." },
        {
          texte: "Paramètres associés : $\\omega_0 = 1/\\sqrt{10^{-7}} = 3\\,162\\ \\mathrm{rad/s}$, $D = e^{-\\pi \\times 0{,}316/0{,}949} = 35\\ \\%$.",
          note: "Contrôle : $\\zeta$ est sans dimension, rapport de deux résistances.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réponse à un échelon unité : ζ = 0,316",
          yTitre: "u_C / E",
          xMin: 0,
          xMax: 6,
          yMin: 0,
          yMax: 1.5,
          series: [{ id: "u", nom: "u_C / E", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => ex1.u(t / 1000) }],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 1, "valeur finale", true);
            marquerPoint(c, repere, couleurs, ex1.tp * 1000, 1 + ex1.d, "dépassement 35 %", false);
          },
        });
      },
    })
  );

  /* Fondamental 2 : fréquence propre. */
  const ex2 = rlcSerie(20, 0.01, 1e-6, 1);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-frequence",
      titre: "Fréquence propre d'un circuit LC",
      niveau: "fondamental",
      enonce:
        "<p>Quelle est la fréquence propre $f_0$, en hertz, d'un circuit formé d'une bobine de $10\\ \\mathrm{mH}$ et d'un condensateur de $1\\ \\mu\\mathrm{F}$ ?</p>",
      valeur: 1 / (2 * Math.PI * Math.sqrt(1e-8)),
      unite: "Hz",
      tolerance: 0.02,
      chiffres: 0,
      libelleChamp: "f0",
      etapes: [
        { texte: "$LC = 10^{-2} \\times 10^{-6} = 10^{-8}\\ \\mathrm{s^2}$, donc $\\omega_0 = 1/\\sqrt{10^{-8}} = 10^4\\ \\mathrm{rad/s}$." },
        { texte: "$f_0 = \\omega_0/(2\\pi) = 10\\,000/6{,}283 = 1\\,592\\ \\mathrm{Hz}$." },
        {
          texte: "Période propre $T_0 = 1/f_0 = 0{,}628\\ \\mathrm{ms}$.",
          note: "Piège classique : prendre $1/\\sqrt{LC}$ pour une fréquence donne $10\\ \\mathrm{kHz}$, six fois trop.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Oscillation peu amortie (R = 20 Ω) : période voisine de 0,63 ms",
          yTitre: "u_C / E",
          xMin: 0,
          xMax: 3,
          yMin: 0,
          yMax: 2,
          series: [{ id: "u", nom: "u_C / E, ζ = 0,1", couleur: "serie-1", epaisseur: 2.4, fonction: (t) => ex2.u(t / 1000) }],
          surDessin({ c, repere, couleurs }) {
            const td = (2 * Math.PI) / ex2.wd;
            marquerPoint(c, repere, couleurs, ex2.tp * 1000, 1 + ex2.d, "1er maximum", false);
            marquerPoint(c, repere, couleurs, (ex2.tp + td) * 1000, 1 + ex2.d * Math.exp(-ex2.a * td), "une pseudo-période plus tard", false);
          },
        });
      },
    })
  );

  /* Intermédiaire 1 : tension crête. */
  const ex3 = (() => {
    const w0 = 1000;
    const z = 0.2;
    return rlcSerie(2 * z * w0, 1, 1 / (w0 * w0), 10);
  })();
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-crete",
      titre: "Tension crête d'une réponse pseudo-périodique",
      niveau: "intermédiaire",
      enonce:
        "<p>Un circuit RLC série de pulsation propre $\\omega_0 = 1\\,000\\ \\mathrm{rad/s}$ et de coefficient d'amortissement $\\zeta = 0{,}2$ reçoit, depuis le repos, un échelon de $10\\ \\mathrm{V}$. Quelle tension crête atteint le condensateur, en volts ?</p>",
      valeur: 10 * (1 + depassement(0.2)),
      unite: "V",
      tolerance: 0.02,
      chiffres: 2,
      libelleChamp: "u_max",
      etapes: [
        { texte: "$\\zeta < 1$ : régime pseudo-périodique, dépassement $D = e^{-\\pi\\zeta/\\sqrt{1 - \\zeta^2}}$." },
        { texte: "$\\pi \\times 0{,}2/\\sqrt{0{,}96} = 0{,}6413$, donc $D = e^{-0{,}6413} = 0{,}527$." },
        { texte: "$u_{\\max} = E(1 + D) = 10 \\times 1{,}527 = 15{,}3\\ \\mathrm{V}$." },
        {
          texte: "Instant : $\\omega_d = 1\\,000\\sqrt{0{,}96} = 979{,}8\\ \\mathrm{rad/s}$ et $t_p = \\pi/\\omega_d = 3{,}21\\ \\mathrm{ms}$.",
          note: "Le dépassement ne dépend que de $\\zeta$ ; $\\omega_0$ ne fixe que l'instant du maximum.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Échelon de 10 V, ζ = 0,2",
          yTitre: "u_C",
          yUnite: "V",
          xMin: 0,
          xMax: 15,
          yMin: 0,
          yMax: 17,
          series: [{ id: "u", nom: "u_C(t)", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => ex3.u(t / 1000) }],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 10, "E = 10 V", true);
            marquerPoint(c, repere, couleurs, ex3.tp * 1000, 10 * (1 + ex3.d), "15,3 V à 3,21 ms", false);
          },
        });
      },
    })
  );

  /* Intermédiaire 2 : identification sur un relevé. */
  const zId = -Math.log(0.3) / Math.sqrt(Math.PI * Math.PI + Math.log(0.3) ** 2);
  const w0Id = (2 * Math.PI) / 2e-3 / Math.sqrt(1 - zId * zId);
  const lId = 1 / (w0Id * w0Id * 10e-6);
  const ex4 = rlcSerie(2 * zId * w0Id * lId, lId, 10e-6, 1);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-identification",
      titre: "Identifier une inductance sur un relevé d'oscilloscope",
      niveau: "intermédiaire",
      enonce:
        "<p>La tension d'un condensateur de $10\\ \\mu\\mathrm{F}$, relevée à l'oscilloscope après un échelon, présente un dépassement de $30\\ \\%$ et une pseudo-période de $2\\ \\mathrm{ms}$. Quelle est l'inductance de la maille série, en millihenrys ?</p>",
      valeur: lId * 1000,
      unite: "mH",
      tolerance: 0.03,
      chiffres: 2,
      libelleChamp: "L",
      etapes: [
        { texte: "Amortissement : $\\ln 0{,}3 = -1{,}204$, donc $\\zeta = 1{,}204/\\sqrt{\\pi^2 + 1{,}450} = 1{,}204/3{,}364 = 0{,}358$." },
        { texte: "Pseudo-pulsation : $\\omega_d = 2\\pi/T_d = 2\\pi/0{,}002 = 3\\,142\\ \\mathrm{rad/s}$." },
        { texte: "Pulsation propre : $\\omega_0 = \\omega_d/\\sqrt{1 - \\zeta^2} = 3\\,142/0{,}934 = 3\\,364\\ \\mathrm{rad/s}$." },
        {
          texte: "$L = \\dfrac{1}{\\omega_0^2C} = \\dfrac{1}{3\\,364^2 \\times 10^{-5}} = 8{,}83\\ \\mathrm{mH}$.",
          note: "Confondre $\\omega_d$ et $\\omega_0$ donnerait $10{,}1\\ \\mathrm{mH}$, soit $15\\ \\%$ d'erreur. On en tire aussi $R = 2\\zeta\\sqrt{L/C} = 21{,}3\\ \\Omega$.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        traceCorrection(moteur, conteneur, {
          titre: "Réponse reconstruite : L = 8,83 mH, C = 10 µF, R = 21,3 Ω",
          yTitre: "u_C / E",
          xMin: 0,
          xMax: 8,
          yMin: 0,
          yMax: 1.45,
          series: [{ id: "u", nom: "u_C / E", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => ex4.u(t / 1000) }],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 1, "valeur finale", true);
            marquerPoint(c, repere, couleurs, ex4.tp * 1000, 1 + ex4.d, "D = 30 % à 1 ms", false);
            marquerPoint(c, repere, couleurs, ex4.tp * 1000 + 2, 1 + ex4.d ** 3, "2 ms plus tard", false);
          },
        });
      },
    })
  );

  /* Avancé : condensateur d'amortissement sur une bobine. */
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k-snubber",
      titre: "Remplacer l'écrêteur par un condensateur",
      niveau: "avancé",
      enonce:
        "<p>On envisage de protéger la sortie à transistor qui commande la bobine de $KM1$ ($1{,}2\\ \\mathrm{H}$, $0{,}5\\ \\mathrm{A}$, bus $24\\ \\mathrm{V}$, tenue de la sortie $60\\ \\mathrm{V}$) par un simple condensateur placé en parallèle sur la bobine, au lieu de l'écrêteur diode et Zener. En négligeant la résistance de la bobine et la tension initiale du condensateur, et en admettant que la tension de la bobine ne doit pas dépasser $36\\ \\mathrm{V}$ pour que la sortie voie au plus $24 + 36 = 60\\ \\mathrm{V}$, quelle capacité minimale faut-il, en microfarads ? Le choix est-il raisonnable ?</p>",
      valeur: (1.2 * 0.25) / (36 * 36) * 1e6,
      unite: "µF",
      tolerance: 0.03,
      chiffres: 0,
      libelleChamp: "C_min",
      etapes: [
        { texte: "Sans résistance, l'énergie de la bobine passe entièrement dans le condensateur au premier quart de période : $\\tfrac{1}{2}CU^2 = \\tfrac{1}{2}LI_0^2$, d'où $U = I_0\\sqrt{L/C}$." },
        { texte: "Condition $U \\leq 36\\ \\mathrm{V}$ : $C \\geq LI_0^2/U^2 = 1{,}2 \\times 0{,}25/1\\,296 = 231\\ \\mu\\mathrm{F}$." },
        { texte: "Fréquence propre : $f_0 = 1/(2\\pi\\sqrt{1{,}2 \\times 231 \\times 10^{-6}}) = 9{,}5\\ \\mathrm{Hz}$ ; le premier quart de période dure $26\\ \\mathrm{ms}$." },
        { texte: "Avec la résistance de $48\\ \\Omega$ et les $24\\ \\mathrm{V}$ initiaux, la simulation donne un minimum de $-18{,}3\\ \\mathrm{V}$ : la sortie voit $42\\ \\mathrm{V}$, l'estimation simplifiée est prudente." },
        {
          texte: "Le choix n'est pas raisonnable : un condensateur de $231\\ \\mu\\mathrm{F}$ non polarisé est encombrant, il est chargé brutalement par le transistor à chaque activation, d'où une pointe de courant destructrice, et la tension de la bobine s'inverse lentement, ce qui ralentit la retombée.",
          note: "C'est pourquoi un condensateur seul, ou un circuit résistance et condensateur, ne convient qu'aux petites bobines ; pour une bobine de $1{,}2\\ \\mathrm{H}$, la diode et la Zener restent la bonne solution.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        /* Bobine (L, r) refermée sur C : L di/dt + r i = u, du/dt = -i/C. */
        const l = 1.2;
        const r = 48;
        const c = 231.5e-6;
        const h = 1e-4;
        const pointsAvec = [];
        let i = 0.5;
        let u = 24;
        for (let k = 0; k <= 1200; k += 1) {
          if (k % 4 === 0) pointsAvec.push([k * h * 1000, u]);
          const k1 = [(u - r * i) / l, -i / c];
          const k2 = [(u + (h / 2) * k1[1] - r * (i + (h / 2) * k1[0])) / l, -(i + (h / 2) * k1[0]) / c];
          const k3 = [(u + (h / 2) * k2[1] - r * (i + (h / 2) * k2[0])) / l, -(i + (h / 2) * k2[0]) / c];
          const k4 = [(u + h * k3[1] - r * (i + h * k3[0])) / l, -(i + h * k3[0]) / c];
          i += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
          u += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        }
        const w0 = 1 / Math.sqrt(l * c);
        traceCorrection(moteur, conteneur, {
          titre: "Tension de la bobine de KM1 coupée sur 231 µF",
          yTitre: "tension de la bobine",
          yUnite: "V",
          xMin: 0,
          xMax: 120,
          yMin: -40,
          yMax: 40,
          series: [
            { id: "simple", nom: "sans résistance ni tension initiale : crête de 36 V", couleur: "serie-6", epaisseur: 1.6, fonction: (t) => -0.5 * Math.sqrt(l / c) * Math.sin((w0 * t) / 1000) },
            { id: "reel", nom: "avec r = 48 Ω et 24 V initiaux : minimum de -18,3 V", couleur: "serie-1", epaisseur: 2.6, points: pointsAvec },
          ],
          surDessin({ c: ctx, repere, couleurs }) {
            ligneHorizontale(ctx, repere, couleurs, -36, "-36 V : sortie à 60 V", true);
          },
        });
      },
    })
  );

  /* Diagnostic industriel. */
  ressources.push(
    api.exercice.qcm(cible, {
      id: "k-diagnostic",
      titre: "Variateur en surtension à la mise sous tension",
      niveau: "diagnostic industriel",
      enonce:
        "<p>Depuis une intervention, le variateur de la pompe déclenche en surtension du bus continu à chaque mise sous tension, exactement au moment du collage de $KM2$, alors qu'il fonctionne normalement une fois réarmé. Quelles causes sont compatibles avec ce symptôme ?</p>",
      options: [
        { texte: "La temporisation de $KM2$ a été réduite, par exemple à $0{,}1\\ \\mathrm{s}$.", juste: true },
        { texte: "La résistance de précharge de $47\\ \\Omega$ a été remplacée par une résistance de $470\\ \\Omega$.", juste: true },
        { texte: "Les condensateurs du bus ont été remplacés par des modèles de capacité double." },
        { texte: "La self de lissage a été court-circuitée par erreur." },
        { texte: "La tension du réseau est inférieure de $10\\ \\%$ à sa valeur nominale." },
      ],
      etapes: [
        { texte: "Le dépassement à la fermeture de $KM2$ vaut $79\\ \\%$ de l'écart restant : le symptôme signale un bus loin de sa valeur finale au moment de la fermeture." },
        { texte: "Temporisation de $0{,}1\\ \\mathrm{s}$ : bus à $350{,}6\\ \\mathrm{V}$, crête de $735{,}9\\ \\mathrm{V}$. Résistance de $470\\ \\Omega$ : $\\tau = 1{,}03\\ \\mathrm{s}$, bus à $249\\ \\mathrm{V}$ seulement à $0{,}6\\ \\mathrm{s}$, crête de $816\\ \\mathrm{V}$." },
        { texte: "Capacité double : $\\tau = 0{,}207\\ \\mathrm{s}$, écart résiduel de $31\\ \\mathrm{V}$ à $0{,}6\\ \\mathrm{s}$ et $\\zeta = 0{,}105$ : crête de $588\\ \\mathrm{V}$ seulement, compatible avec un fonctionnement normal." },
        {
          texte: "Self court-circuitée : plus de circuit oscillant, donc pas de dépassement à la fermeture. Réseau bas : tous les niveaux baissent, la surtension est moins probable.",
          note: "Vérification : relever la tension du bus au moment du collage de $KM2$ et la comparer à la valeur attendue de $564\\ \\mathrm{V}$ ; une autorisation de fermeture conditionnée à cette tension supprime le risque.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const cas = [
          { fraction: 1 - Math.exp(-0.6 / 0.1034), c: 2.2e-3, nom: "réglage correct, 0,6 s : 567 V", couleur: "serie-3", epaisseur: 1.6 },
          { fraction: 1 - Math.exp(-0.1 / 0.1034), c: 2.2e-3, nom: "temporisation de 0,1 s : 735,9 V", couleur: "serie-5", epaisseur: 2.2 },
          { fraction: 1 - Math.exp(-0.6 / 1.034), c: 2.2e-3, nom: "précharge de 470 Ω : 816 V", couleur: "serie-1", epaisseur: 2.6 },
        ];
        traceCorrection(moteur, conteneur, {
          titre: "Tension du bus après la fermeture de KM2, pont de diodes compris",
          yTitre: "u_bus",
          yUnite: "V",
          xMin: 0,
          xMax: 20,
          yMin: 200,
          yMax: 860,
          series: cas.map((cas, index) => {
            const sol = rlcSerie(BUS.r, BUS.l, cas.c, BUS.e, cas.fraction * BUS.e, 0);
            const tArret = Math.PI / sol.wd;
            const uArret = sol.u(tArret);
            return {
              id: "cas" + index,
              nom: cas.nom,
              couleur: cas.couleur,
              epaisseur: cas.epaisseur,
              fonction: (t) => (t / 1000 <= tArret ? sol.u(t / 1000) : uArret),
            };
          }),
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, BUS.e, "565,7 V nominal", true);
          },
        });
      },
    })
  );

  /* Conceptuel. */
  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k-conceptuel",
      titre: "Pourquoi le second ordre peut dépasser",
      niveau: "conceptuel",
      enonce:
        "<p>Sans calcul, expliquez pourquoi la tension d'un condensateur chargé à travers une résistance ne dépasse jamais sa valeur finale, alors qu'elle peut la dépasser quand une bobine est ajoutée en série. Quel rôle joue la résistance dans ce second cas ?</p>",
      motsCles: [
        ["courant", "inertie", "bobine", "continu"],
        ["energie", "magnetique", "echange", "stock"],
        ["nul", "annule", "zero", "valeur finale", "atteint"],
        ["resistance", "dissip", "amorti", "frein"],
      ],
      minimum: 3,
      exemple: "Trois ou quatre phrases : que vaut le courant quand la tension atteint la valeur finale, dans chaque circuit ?",
      etapes: [
        { texte: "Circuit RC : le courant vaut $(E - u_C)/R$ ; il s'annule exactement quand $u_C$ atteint $E$, et la charge s'arrête : aucun dépassement possible." },
        { texte: "Circuit RLC : quand $u_C$ atteint $E$, le courant n'est pas nul, car celui de la bobine ne peut pas s'annuler instantanément ; la bobine a stocké l'énergie $\\tfrac{1}{2}Li^2$ et continue de pousser le courant." },
        { texte: "Le condensateur continue donc de se charger au-delà de $E$, jusqu'à ce que l'énergie magnétique soit transférée : c'est le dépassement, puis le mouvement s'inverse." },
        {
          texte: "La résistance dissipe l'énergie pendant l'échange : si elle est assez forte, $R \\geq 2\\sqrt{L/C}$, le courant s'annule avant que $u_C$ n'atteigne $E$, et le dépassement disparaît.",
          note: "C'est l'analogue de la masse qui dépasse sa position d'équilibre grâce à sa vitesse, sauf si le frottement est suffisant.",
        },
      ],
      visuelCorrection(conteneur, moteur) {
        const rc = 1e-3;
        const rlc = rlcSerie(2 * 0.2 * 2000, 1, 1 / (2000 * 2000), 1);
        traceCorrection(moteur, conteneur, {
          titre: "Charge d'un condensateur avec et sans bobine",
          yTitre: "u_C / E",
          xMin: 0,
          xMax: 8,
          yMin: 0,
          yMax: 1.6,
          series: [
            { id: "rc", nom: "circuit RC : monotone, courant nul à l'arrivée", couleur: "serie-6", epaisseur: 1.8, fonction: (t) => 1 - Math.exp(-t / 1000 / rc) },
            { id: "rlc", nom: "circuit RLC, ζ = 0,2 : la bobine pousse au-delà", couleur: "serie-1", epaisseur: 2.6, fonction: (t) => rlc.u(t / 1000) },
          ],
          surDessin({ c, repere, couleurs }) {
            ligneHorizontale(c, repere, couleurs, 1, "valeur finale E", true);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz de fin de séance
   -------------------------------------------------------------------------- */

const DESSIN_QUIZ =
  '<g stroke="currentColor" stroke-width="1.4" fill="none" opacity="0.8"><path d="M40 200H450M40 206V40"/></g>' +
  '<path d="M40 110H440" stroke="currentColor" stroke-width="1.2" fill="none" stroke-dasharray="6 5" opacity="0.7"/>' +
  '<g stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M40.0 200.0L46.7 198.3L53.3 193.3L60.0 185.7L66.7 176.0L73.3 164.6L80.0 152.3L86.7 139.5L93.3 126.9L100.0 114.8L106.7 103.6L113.3 93.8L120.0 85.5L126.7 79.0L133.3 74.2L140.0 71.2L146.7 70.0L153.3 70.5L160.0 72.4L166.7 75.5L173.3 79.6L180.0 84.6L186.7 90.0L193.3 95.6L200.0 101.3L206.7 106.7L213.3 111.8L220.0 116.3L226.7 120.1L233.3 123.2L240.0 125.5L246.7 127.0L253.3 127.7L260.0 127.7L266.7 127.0L273.3 125.7L280.0 123.9L286.7 121.8L293.3 119.5L300.0 117.0L306.7 114.4L313.3 112.0L320.0 109.7L326.7 107.6L333.3 105.9L340.0 104.4L346.7 103.3L353.3 102.6L360.0 102.2L366.7 102.1L373.3 102.4L380.0 102.9L386.7 103.6L393.3 104.5L400.0 105.6L406.7 106.7L413.3 107.8L420.0 108.9L426.7 109.9L433.3 110.9L440.0 111.7"/>' +
  '<path d="M40.0 200.0L46.7 198.8L53.3 196.3L60.0 193.6L66.7 190.8L73.3 188.1L80.0 185.5L86.7 182.9L93.3 180.5L100.0 178.1L106.7 175.8L113.3 173.6L120.0 171.4L126.7 169.4L133.3 167.4L140.0 165.4L146.7 163.6L153.3 161.7L160.0 160.0L166.7 158.3L173.3 156.7L180.0 155.1L186.7 153.6L193.3 152.1L200.0 150.7L206.7 149.3L213.3 148.0L220.0 146.7L226.7 145.5L233.3 144.3L240.0 143.1L246.7 142.0L253.3 140.9L260.0 139.9L266.7 138.9L273.3 137.9L280.0 137.0L286.7 136.1L293.3 135.2L300.0 134.3L306.7 133.5L313.3 132.7L320.0 131.9L326.7 131.2L333.3 130.5L340.0 129.8L346.7 129.1L353.3 128.5L360.0 127.9L366.7 127.3L373.3 126.7L380.0 126.1L386.7 125.6L393.3 125.0L400.0 124.5L406.7 124.0L413.3 123.6L420.0 123.1L426.7 122.7L433.3 122.2L440.0 121.8" stroke-dasharray="2 5"/>' +
  '<path d="M40.0 200.0L46.7 198.4L53.3 194.5L60.0 189.0L66.7 182.8L73.3 176.2L80.0 169.6L86.7 163.3L93.3 157.2L100.0 151.7L106.7 146.5L113.3 141.9L120.0 137.8L126.7 134.1L133.3 130.8L140.0 127.9L146.7 125.4L153.3 123.2L160.0 121.3L166.7 119.7L173.3 118.2L180.0 117.0L186.7 116.0L193.3 115.1L200.0 114.3L206.7 113.6L213.3 113.1L220.0 112.6L226.7 112.2L233.3 111.9L240.0 111.6L246.7 111.3L253.3 111.1L260.0 110.9L266.7 110.8L273.3 110.7L280.0 110.6L286.7 110.5L293.3 110.4L300.0 110.3L306.7 110.3L313.3 110.2L320.0 110.2L326.7 110.2L333.3 110.1L340.0 110.1L346.7 110.1L353.3 110.1L360.0 110.1L373.3 110.0L440.0 110.0" stroke-dasharray="12 6"/></g>' +
  '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="13">' +
  '<text x="146" y="58" text-anchor="middle" font-weight="600">A</text>' +
  '<text x="226" y="166" text-anchor="middle" font-weight="600">B</text>' +
  '<text x="132" y="122" text-anchor="middle" font-weight="600">C</text>' +
  '<text x="34" y="114" text-anchor="end">E</text><text x="34" y="204" text-anchor="end">0</text>' +
  '<text x="454" y="204">t</text>' +
  '<text x="245" y="232" text-anchor="middle" font-size="11.5">A : trait plein ; B : pointillés ; C : tirets longs ; même ω0</text></g>';

function construireQuiz(racine, api) {
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: "<p>Quelle est l'unité de $1/\\sqrt{LC}$, avec $L$ en henrys et $C$ en farads ?</p>",
        options: ["La seconde", "Le radian par seconde", "L'ohm", "Le henry par farad"],
        bonnes: [1],
        explication: "$LC$ est en $\\mathrm{s^2}$ : $1/\\sqrt{LC}$ est l'inverse d'un temps, une pulsation en $\\mathrm{rad/s}$. C'est $\\sqrt{L/C}$ qui est en ohms.",
        resume: "Unité de la pulsation propre",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Dans un circuit RLC série, augmenter la résistance augmente le coefficient d'amortissement.</p>",
        reponse: true,
        explication: "$\\zeta = \\tfrac{R}{2}\\sqrt{C/L}$ est proportionnel à $R$ en série. C'est l'inverse en parallèle.",
        resume: "Effet de R en série",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la fréquence propre d'un circuit avec $L = 1\\ \\mathrm{mH}$ et $C = 10\\ \\mu\\mathrm{F}$, en hertz ?</p>",
        valeur: 1 / (2 * Math.PI * Math.sqrt(1e-8)),
        unite: "Hz",
        tolerance: 0.02,
        chiffres: 0,
        explication: "$\\omega_0 = 1/\\sqrt{10^{-8}} = 10^4\\ \\mathrm{rad/s}$ et $f_0 = 10^4/(2\\pi) = 1\\,592\\ \\mathrm{Hz}$.",
        resume: "Fréquence propre",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la résistance critique d'un circuit RLC série avec $L = 4\\ \\mathrm{mH}$ et $C = 1\\ \\mu\\mathrm{F}$, en ohms ?</p>",
        valeur: 2 * Math.sqrt(4e-3 / 1e-6),
        unite: "Ω",
        tolerance: 0.02,
        chiffres: 1,
        explication: "$R_c = 2\\sqrt{L/C} = 2\\sqrt{4\\,000} = 126{,}5\\ \\Omega$.",
        resume: "Résistance critique",
      },
      {
        type: "courte",
        enonce: "<p>Dans quel régime la réponse d'un circuit RLC à un échelon dépasse-t-elle sa valeur finale ?</p>",
        motsCles: [["pseudo", "oscill", "sous-amorti", "sous amorti"]],
        minimum: 1,
        explication: "Le régime pseudo-périodique, $\\zeta < 1$ : seul régime où le courant change de signe et où la tension dépasse $E$.",
        resume: "Régime avec dépassement",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est le dépassement d'une réponse indicielle avec $\\zeta = 0{,}5$, en pourcentage ?</p>",
        valeur: depassement(0.5) * 100,
        unite: "%",
        tolerance: 0.03,
        chiffres: 1,
        explication: "$D = e^{-\\pi \\times 0{,}5/\\sqrt{0{,}75}} = e^{-1{,}814} = 0{,}163$, soit $16{,}3\\ \\%$.",
        resume: "Dépassement pour ζ = 0,5",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Dans un circuit RLC parallèle alimenté par une source de courant, augmenter la résistance augmente l'amortissement.</p>",
        reponse: false,
        explication: "En parallèle, $\\zeta = \\tfrac{1}{2R}\\sqrt{L/C}$ : une résistance plus forte détourne moins de courant de l'échange entre $L$ et $C$, donc amortit moins.",
        resume: "Effet de R en parallèle",
      },
      {
        type: "qcm",
        enonce: "<p>Quelles modifications changent le coefficient d'amortissement d'un circuit RLC série sans changer sa pulsation propre ?</p>",
        options: [
          { texte: "Modifier $R$", juste: true },
          { texte: "Multiplier $L$ par $k$ et diviser $C$ par $k$", juste: true },
          { texte: "Modifier l'échelon $E$" },
          { texte: "Multiplier $L$ et $C$ par le même facteur $k$" },
        ],
        multiple: true,
        explication: "$\\omega_0$ ne dépend que du produit $LC$. Modifier $R$, ou le rapport $L/C$ à produit constant, change $\\zeta$. Multiplier $L$ et $C$ par $k$ divise $\\omega_0$ par $k$ sans changer $\\zeta$ ; $E$ ne change rien à la dynamique.",
        resume: "Paramètres de ζ et ω0",
      },
      {
        type: "schema",
        enonce: "<p>Les trois courbes sont les réponses à un même échelon de trois circuits de même pulsation propre. Laquelle correspond au régime critique ?</p>",
        consigne: "Cliquez sur l'étiquette de la courbe correspondante.",
        viewBox: "0 0 470 245",
        dessin: DESSIN_QUIZ,
        zones: [
          { x: 126, y: 36, largeur: 40, hauteur: 32, etiquette: "courbe A" },
          { x: 206, y: 146, largeur: 40, hauteur: 30, etiquette: "courbe B" },
          { x: 112, y: 102, largeur: 40, hauteur: 30, etiquette: "courbe C", juste: true },
        ],
        explication: "La courbe C, en tirets longs, atteint la valeur finale le plus vite sans la dépasser : régime critique. A dépasse et oscille (pseudo-périodique) ; B monte lentement sans dépasser (apériodique).",
        resume: "Reconnaître le régime critique",
      },
      {
        type: "calcul",
        enonce: "<p>Quel est le facteur de qualité d'un circuit RLC série avec $R = 10\\ \\Omega$, $L = 10\\ \\mathrm{mH}$ et $C = 1\\ \\mu\\mathrm{F}$ ?</p>",
        valeur: 10,
        unite: "",
        tolerance: 0.02,
        chiffres: 1,
        explication: "$Q = \\tfrac{1}{R}\\sqrt{L/C} = \\tfrac{1}{10}\\sqrt{10\\,000} = 10$, soit $\\zeta = 0{,}05$ : une dizaine d'oscillations visibles.",
        resume: "Facteur de qualité",
      },
    ],
    { titre: "Dix questions sur le régime transitoire RLC" }
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
      { categorie: "Équation", question: "Quelle équation régit la tension du condensateur d'un circuit RLC série soumis à E ?", reponse: "$LC\\,u_C'' + RC\\,u_C' + u_C = E$, soit $u_C'' + 2\\zeta\\omega_0u_C' + \\omega_0^2u_C = \\omega_0^2E$." },
      { categorie: "Définition", question: "Que valent ω0, ζ et Q pour un circuit RLC série ?", reponse: "$\\omega_0 = 1/\\sqrt{LC}$, $\\zeta = \\tfrac{R}{2}\\sqrt{C/L}$, $Q = 1/(2\\zeta) = \\tfrac{1}{R}\\sqrt{L/C}$." },
      { categorie: "Classement", question: "Comment classer un circuit RLC d'après ζ ?", reponse: "$\\zeta > 1$ : apériodique ; $\\zeta = 1$ : critique ; $\\zeta < 1$ : pseudo-périodique, seul régime avec dépassement." },
      { categorie: "Résistance critique", question: "Quelle résistance sépare les régimes d'un circuit série ?", reponse: "$R_c = 2\\sqrt{L/C}$, le double de l'impédance caractéristique." },
      { categorie: "Conditions initiales", question: "Quelles sont les deux conditions initiales d'un circuit RLC série ?", reponse: "$u_C(0^+) = U_0$ par continuité de la tension, et $\\mathrm{d}u_C/\\mathrm{d}t(0^+) = I_0/C$ par continuité du courant de la bobine." },
      { categorie: "Dépassement", question: "Formule du dépassement et instant du premier maximum ?", reponse: "$D = e^{-\\pi\\zeta/\\sqrt{1 - \\zeta^2}}$ et $t_p = \\pi/\\omega_d$, avec $\\omega_d = \\omega_0\\sqrt{1 - \\zeta^2}$. Repères : $16\\ \\%$ pour $\\zeta = 0{,}5$, $5\\ \\%$ pour $0{,}69$." },
      { categorie: "Identification", question: "Comment remonter à ζ et ω0 depuis un relevé ?", reponse: "$\\zeta = -\\ln D/\\sqrt{\\pi^2 + \\ln^2 D}$ (ou par le décrément logarithmique), puis $\\omega_0 = (2\\pi/T_d)/\\sqrt{1 - \\zeta^2}$." },
      { categorie: "Parallèle", question: "Coefficient d'amortissement d'un RLC parallèle ?", reponse: "$\\zeta = \\tfrac{1}{2R}\\sqrt{L/C}$ : une résistance plus forte amortit moins." },
      { categorie: "Énergie", question: "Que devient l'énergie pendant une réponse pseudo-périodique ?", reponse: "Elle oscille entre $\\tfrac{1}{2}Cu_C^2$ et $\\tfrac{1}{2}Li^2$ et décroît par $Ri^2$ ; pour un échelon, la résistance dissipe $\\tfrac{1}{2}CE^2$ quels que soient $R$ et $L$." },
      {
        categorie: "Industriel",
        question: "Pourquoi ne pas court-circuiter trop tôt la précharge d'un bus continu muni d'une self ?",
        reponse: "Le bus devient un RLC peu amorti ($\\zeta = 0{,}074$) : l'écart restant est dépassé de $79\\ \\%$, et le pont de diodes fige la crête.",
        rappel: "Bus de la pompe : fermeture à mi-charge, 790 V et 375 A crête ; à 0,6 s, 1,35 V de dépassement seulement.",
      },
    ],
    { titre: "Dix cartes sur le régime transitoire RLC" }
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
        enonce: "<p>Quel est le coefficient d'amortissement d'un circuit RLC série avec $R = 50\\ \\Omega$, $L = 25\\ \\mathrm{mH}$ et $C = 10\\ \\mu\\mathrm{F}$ ?</p>",
        valeur: 0.5,
        unite: "",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$\\zeta = \\tfrac{50}{2}\\sqrt{10^{-5}/0{,}025} = 25 \\times 0{,}02 = 0{,}5$ : pseudo-périodique, $16\\ \\%$ de dépassement.",
        resume: "Calcul de ζ (cette séance)",
      },
      {
        type: "vraiFaux",
        enonce: "<p>Pour un circuit RLC série partant du repos et soumis à un échelon, la pente initiale de la tension du condensateur est nulle.</p>",
        reponse: true,
        explication: "$\\mathrm{d}u_C/\\mathrm{d}t(0^+) = i(0^+)/C = 0$, car le courant de la bobine est nul au départ : tangente horizontale.",
        resume: "Pente initiale (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Un circuit a $\\omega_0 = 2\\,000\\ \\mathrm{rad/s}$ et $\\zeta = 0{,}6$. À quel instant survient le premier maximum de sa réponse indicielle, en millisecondes ?</p>",
        valeur: (Math.PI / 1600) * 1000,
        unite: "ms",
        tolerance: 0.02,
        chiffres: 2,
        explication: "$\\omega_d = 2\\,000\\sqrt{1 - 0{,}36} = 1\\,600\\ \\mathrm{rad/s}$, donc $t_p = \\pi/1\\,600 = 1{,}96\\ \\mathrm{ms}$.",
        resume: "Instant du premier maximum (cette séance)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle est la constante de temps d'une bobine de $0{,}6\\ \\mathrm{H}$ dans une maille de résistance totale $30\\ \\Omega$, en millisecondes ?</p>",
        valeur: 20,
        unite: "ms",
        tolerance: 0.02,
        chiffres: 1,
        explication: "$\\tau = L/R = 0{,}6/30 = 20\\ \\mathrm{ms}$. Révisé du cours Régime transitoire RL.",
        resume: "Constante de temps RL (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Une bobine alimentée sous $24\\ \\mathrm{V}$ est protégée par un écrêteur de $30\\ \\mathrm{V}$. Quelle tension l'interrupteur supporte-t-il pendant la coupure, en volts ?</p>",
        valeur: 54,
        unite: "V",
        tolerance: 0.02,
        chiffres: 0,
        explication: "$u_K = E + U_e = 24 + 30 = 54\\ \\mathrm{V}$. Révisé du cours Régime transitoire RL.",
        resume: "Tension d'ouverture (cours précédent)",
      },
      {
        type: "calcul",
        enonce: "<p>Un diviseur à vide est formé de $R_1 = 10\\ \\mathrm{k\\Omega}$ côté source et $R_2 = 20\\ \\mathrm{k\\Omega}$ côté masse, alimenté sous $24\\ \\mathrm{V}$. Quelle est la tension de sortie aux bornes de $R_2$, en volts ?</p>",
        valeur: 16,
        unite: "V",
        tolerance: 0.02,
        chiffres: 1,
        explication: "$U = 24 \\times 20/(10 + 20) = 16\\ \\mathrm{V}$. Révisé du cours Associations de résistances et diviseurs, vieux d'une semaine.",
        resume: "Diviseur de tension (Associations de résistances et diviseurs)",
      },
      {
        type: "calcul",
        enonce: "<p>Quelle énergie stockent les condensateurs du bus du variateur, $2{,}2\\ \\mathrm{mF}$ sous $565{,}7\\ \\mathrm{V}$, en joules ?</p>",
        valeur: 0.5 * 2.2e-3 * BUS.e * BUS.e,
        unite: "J",
        tolerance: 0.02,
        chiffres: 0,
        explication: "$W = \\tfrac{1}{2}CU^2 = 0{,}5 \\times 2{,}2 \\times 10^{-3} \\times 565{,}7^2 = 352\\ \\mathrm{J}$. Révisé du cours Condensateurs et champ électrique.",
        resume: "Énergie électrique (Condensateurs et champ électrique)",
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
    titre: "Où en suis-je sur le régime transitoire RLC ?",
  });
  if (auto) ressources.push(auto);
}
