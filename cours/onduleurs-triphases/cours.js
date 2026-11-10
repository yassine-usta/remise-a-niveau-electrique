/* ==========================================================================
   cours/onduleurs-triphases/cours.js
   Onduleurs triphasés : table de commutation, pleine onde, vecteur spatial,
   hexagone, modulation vectorielle, sinus-triangle avec injection de mode
   commun, tension disponible d'un variateur.
   Le module n'utilise que l'objet api et le DOM de sa racine.
   ========================================================================== */

let ressources = [];
let nettoyeurs = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = 2 * Math.PI;
const RAC3 = Math.sqrt(3);
const RAC2 = Math.SQRT2;
const ETATS = ["100", "110", "010", "011", "001", "101"];
const ROMAINS = ["I", "II", "III", "IV", "V", "VI"];

/* --------------------------------------------------------------------------
   Modèles physiques
   -------------------------------------------------------------------------- */

/** Porteuse triangulaire d'amplitude 1, de période 1, valant -1 à l'origine. */
function triangle(x) {
  const u = ((x % 1) + 1) % 1;
  return u < 0.5 ? 4 * u - 1 : 3 - 4 * u;
}

/** États des bras en pleine onde, références en cosinus, angle en degrés. */
function etatsPleineOnde(deg) {
  const d = ((deg % 360) + 360) % 360;
  return {
    a: Math.cos((d * Math.PI) / 180) > 0 ? 1 : 0,
    b: Math.cos(((d - 120) * Math.PI) / 180) > 0 ? 1 : 0,
    c: Math.cos(((d + 120) * Math.PI) / 180) > 0 ? 1 : 0,
  };
}

/** Tensions d'un état, rapportées à E. */
function tensionsEtat(s) {
  return {
    ab: s.a - s.b,
    bc: s.b - s.c,
    ca: s.c - s.a,
    an: (2 * s.a - s.b - s.c) / 3,
    bn: (2 * s.b - s.a - s.c) / 3,
    cn: (2 * s.c - s.a - s.b) / 3,
    nO: (s.a + s.b + s.c) / 3 - 0.5,
  };
}

function numeroVecteur(code) {
  const i = ETATS.indexOf(code);
  return i < 0 ? 0 : i + 1;
}

/** Modulation vectorielle : renvoie secteur, durées relatives et rapports cycliques. */
function vectorielle(module, angleDeg, E) {
  const ang = ((angleDeg % 360) + 360) % 360;
  const k = Math.min(5, Math.floor(ang / 60));
  const th = ((ang - 60 * k) * Math.PI) / 180;
  const coef = (RAC3 * module) / E;
  let t1 = coef * Math.sin(Math.PI / 3 - th);
  let t2 = coef * Math.sin(th);
  let t0 = 1 - t1 - t2;
  if (t0 < 0) {
    const s = t1 + t2;
    t1 /= s;
    t2 /= s;
    t0 = 0;
  }
  const premier = ETATS[k];
  const second = ETATS[(k + 1) % 6];
  const d = [0, 1, 2].map((i) => t1 * Number(premier[i]) + t2 * Number(second[i]) + t0 / 2);
  return { k, th: (th * 180) / Math.PI, t1, t2, t0, d, premier, second };
}

/** Rayon de l'hexagone dans la direction donnée, en unités de 2E/3. */
function rayonHexagone(angleDeg) {
  const local = ((((angleDeg % 60) + 60) % 60) - 30) * (Math.PI / 180);
  return Math.cos(Math.PI / 6) / Math.cos(local);
}

/** Amplitudes crêtes des harmoniques 1 à hMax d'un signal échantillonné sur une période. */
function amplitudes(echantillons, hMax) {
  const N = echantillons.length;
  const resultat = [0];
  for (let h = 1; h <= hMax; h += 1) {
    let a = 0;
    let b = 0;
    for (let k = 0; k < N; k += 1) {
      const angle = (TAU * h * (k + 0.5)) / N;
      a += echantillons[k] * Math.cos(angle);
      b += echantillons[k] * Math.sin(angle);
    }
    resultat.push((2 / N) * Math.hypot(a, b));
  }
  return resultat;
}

/* --------------------------------------------------------------------------
   Utilitaires de dessin
   -------------------------------------------------------------------------- */

function svgEl(balise, attributs = {}) {
  const element = document.createElementNS(SVG_NS, balise);
  for (const [cle, valeur] of Object.entries(attributs)) element.setAttribute(cle, String(valeur));
  return element;
}

function nb(api, valeur, decimales) {
  return api.util.formaterDecimal(valeur, decimales);
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

function chaine(points) {
  return points.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
}

function fleche(x1, y1, x2, y2, id, attributs = "") {
  return '<path d="M' + x1.toFixed(1) + " " + y1.toFixed(1) + "L" + x2.toFixed(1) + " " + y2.toFixed(1) + '" marker-end="url(#' + id + ')"' + attributs + "/>";
}

const TRAITS = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
const ECRITS = '<g fill="currentColor" stroke="none" font-family="ui-monospace, monospace" font-size="12">';

function ligneH(c, repere, couleurs, y, libelle) {
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
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
    c.textAlign = "right";
    c.fillText(libelle, repere.boite.x + repere.boite.l - 4, py - 6);
  }
  c.restore();
}

function ligneV(c, repere, couleurs, x, libelle) {
  const px = repere.versX(x);
  c.save();
  c.setLineDash([2, 4]);
  c.strokeStyle = couleurs.texte;
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(px, repere.boite.y);
  c.lineTo(px, repere.boite.y + repere.boite.h);
  c.stroke();
  c.setLineDash([]);
  if (libelle) {
    c.fillStyle = couleurs.texte;
    c.font = "500 11px 'JetBrains Mono', ui-monospace, monospace";
    const aGauche = px > repere.boite.x + repere.boite.l * 0.62;
    c.textAlign = aGauche ? "right" : "left";
    c.fillText(libelle, px + (aGauche ? -5 : 5), repere.boite.y + 14);
  }
  c.restore();
}

function traceCorrection(moteurApi, conteneur, options) {
  const traceur = moteurApi.sim.traceur(conteneur, { genre: "Correction visuelle", ratio: 0.42, echantillons: 900, ...options });
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
function dessinEtapes(lignes, largeur = 600) {
  const hauteur = 30 + lignes.length * 22;
  return (
    TRAITS + ' stroke-width="1.4"><rect x="6" y="6" width="' + (largeur - 12) + '" height="' + (hauteur - 12) + '" rx="8"/></g>' +
    ECRITS + lignes.map((ligne, i) => texte(22, 32 + i * 22, ligne)).join("") + "</g>"
  );
}

function etapes(lignes, legende, largeur = 600) {
  return { viewBox: "0 0 " + largeur + " " + (30 + lignes.length * 22), dessin: dessinEtapes(lignes, largeur), legende };
}

function repere(index) {
  return '<span hidden data-q="' + index + '"></span>';
}

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

/** Synchronise une poignée et un lecteur sur une même grandeur. */
function synchroniseur(dessiner) {
  const etat = { poignee: null, lecteur: null, verrou: false, valeur: null };
  etat.appliquer = (valeur, source) => {
    if (etat.verrou) return;
    etat.verrou = true;
    etat.valeur = valeur;
    dessiner(valeur);
    if (source !== "poignee" && etat.poignee) etat.poignee.set(valeur, false);
    if (source !== "lecteur" && etat.lecteur) etat.lecteur.suivre(valeur);
    etat.verrou = false;
  };
  etat.redessiner = () => {
    if (etat.valeur != null) dessiner(etat.valeur);
  };
  return etat;
}

/**
 * Hexagone des vecteurs de tension.
 * options : { cx, cy, R, id, etiquettes ("etats", "numeros", "aucune"), cercle, secteurs }
 */
function dessinHexagone(options) {
  const { cx, cy, R, id } = options;
  const P = (r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)];
  let s = "<defs>" + marqueur(id) + "</defs>";
  const sommets = [0, 1, 2, 3, 4, 5].map((k) => P(R, 60 * k));
  s += TRAITS + ' stroke-width="1.8"><polygon points="' + chaine(sommets) + '"/>';
  if (options.cercle) s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R * Math.cos(Math.PI / 6)).toFixed(1) + '" stroke-width="1.3" stroke-dasharray="7 5"/>';
  if (options.secteurs) {
    for (let k = 0; k < 6; k += 1) {
      const p = P(R * Math.cos(Math.PI / 6), 60 * k + 30);
      s += '<path d="M' + cx + " " + cy + "L" + p[0].toFixed(1) + " " + p[1].toFixed(1) + '" stroke-width="0.8" opacity="0.4"/>';
    }
  }
  s += "</g>" + TRAITS + ' stroke-width="1.4" opacity="0.75">';
  for (let k = 0; k < 6; k += 1) {
    const p = P(R - 3, 60 * k);
    s += fleche(cx, cy, p[0], p[1], id);
  }
  s += "</g>";
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="3.5" fill="currentColor"/>';
  const mode = options.etiquettes || "etats";
  if (mode !== "aucune") {
    s += ECRITS.replace('font-size="12"', 'font-size="11"');
    const dec = [[8, 4], [4, -8], [-44, -8], [-58, 4], [-44, 18], [4, 18]];
    for (let k = 0; k < 6; k += 1) {
      const p = P(R, 60 * k);
      const libelle = mode === "numeros" ? "V" + (k + 1) : "V" + (k + 1) + " " + ETATS[k];
      const dx = mode === "numeros" ? dec[k][0] * 0.5 : dec[k][0] * (k === 3 ? 1.4 : 1);
      s += texte(p[0] + dx, p[1] + dec[k][1], libelle);
    }
    s += "</g>";
  }
  return s;
}

/* --------------------------------------------------------------------------
   Cycle de vie
   -------------------------------------------------------------------------- */

export async function init(racine, api) {
  ressources = [];
  nettoyeurs = [];

  brancherRenvois(racine, api);
  construireDessinsStatiques(racine, api);
  construireMinitest(racine, api);
  construireSixPas(racine, api);
  construireVecteur(racine, api);
  construireSvm(racine, api);
  construireMli(racine, api);
  construireTension(racine, api);
  construireExercices(racine, api);
  construireQuiz(racine, api);
  construireCartesMemo(racine, api);
  construireRevision(racine, api);
  construireAutoEval(racine, api);

  api.reveler(racine.querySelectorAll(".formule-cle, .encadre, .cadre-tableau"), { decalage: 0.05 });
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
    ["#d-onduleur-figure svg", 1.7],
    ["#e-construction-figure svg", 1.4],
    ["#f-schema-principal svg", 1.6],
    ["#h-figure svg", 1.4],
    ["#i-figure svg", 1.5],
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
  if (!racine.querySelector("#c-minitest")) return;
  const cible = "#c-minitest";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c1-composee",
      titre: "Tension composée d'un réseau équilibré",
      niveau: "fondamental",
      enonce: "<p>Un système triphasé équilibré a des tensions simples de $230\\ \\mathrm{V}$ efficaces. Quelle est la valeur efficace des tensions composées, en volts ?</p>",
      valeur: 230 * RAC3,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension composée efficace",
      etapes: [
        { texte: "$\\underline{U}_{ab} = \\underline{V}_a - \\underline{V}_b = \\underline{V}_a(1 - a^2)$, et $|1 - a^2| = \\sqrt{3}$." },
        { texte: "$U = \\sqrt{3} \\times 230 = 398{,}4\\ \\mathrm{V}$, arrondi à $400\\ \\mathrm{V}$ sur les plaques.", note: "La tension composée est en avance de $30$ degrés sur la tension simple de même indice." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension simple et tension composée",
          xTitre: "angle", xUnite: "degrés", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 360, yMin: -600, yMax: 600,
          series: [
            { id: "va", nom: "v_a, 325,3 V crête", couleur: "serie-1", epaisseur: 2, fonction: (d) => 230 * RAC2 * Math.cos((d * Math.PI) / 180) },
            { id: "uab", nom: "u_ab, 563,4 V crête", couleur: "serie-3", epaisseur: 2.6, fonction: (d) => 230 * RAC2 * RAC3 * Math.cos(((d + 30) * Math.PI) / 180) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneV(c, r, couleurs, 330, "crête de u_ab : 30° d'avance");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "c2-fondamental-bras",
      titre: "Fondamental d'un bras en pleine onde",
      niveau: "fondamental",
      enonce: "<p>Un bras d'onduleur sur un bus de $540\\ \\mathrm{V}$ est commandé en pleine onde : par rapport au point milieu du bus, son point milieu vaut $+270\\ \\mathrm{V}$ pendant une demi-période et $-270\\ \\mathrm{V}$ pendant l'autre. Quelle est l'amplitude crête du fondamental de cette tension, en volts ?</p>",
      valeur: (2 * 540) / Math.PI,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Fondamental crête",
      etapes: [
        { texte: "Carré d'amplitude $A = E/2 = 270\\ \\mathrm{V}$ : fondamental crête $4A/\\pi$." },
        { texte: "$\\hat{V}_1 = 4 \\times 270/\\pi = 2E/\\pi = 343{,}8\\ \\mathrm{V}$, soit $243{,}1\\ \\mathrm{V}$ efficaces.", note: "C'est aussi le fondamental de la tension simple en pleine onde triphasée, car le mode commun ne contient que des rangs multiples de 3." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension d'un bras et son fondamental",
          xTitre: "angle", xUnite: "degrés", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 360, yMin: -420, yMax: 420,
          series: [
            { id: "v", nom: "v_AO, carré ±270 V", couleur: "serie-1", epaisseur: 1.8, fonction: (d) => (Math.cos((d * Math.PI) / 180) > 0 ? 270 : -270) },
            { id: "f", nom: "fondamental, 343,8 V crête", couleur: "serie-3", epaisseur: 2.6, fonction: (d) => (1080 / Math.PI) * Math.cos((d * Math.PI) / 180) },
          ],
        });
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "c3-somme-a",
      titre: "L'opérateur a",
      niveau: "fondamental",
      enonce: "<p>Avec $a = e^{j2\\pi/3}$, que vaut $1 + a + a^2$ ?</p>",
      options: [
        { texte: "$0$", juste: true },
        { texte: "$1$" },
        { texte: "$3$" },
        { texte: "$j\\sqrt{3}$" },
      ],
      etapes: [
        { texte: "$a = -\\frac{1}{2} + j\\frac{\\sqrt{3}}{2}$ et $a^2 = -\\frac{1}{2} - j\\frac{\\sqrt{3}}{2}$." },
        { texte: "$1 + a + a^2 = 1 - \\frac{1}{2} - \\frac{1}{2} + j\\left(\\frac{\\sqrt{3}}{2} - \\frac{\\sqrt{3}}{2}\\right) = 0$.", note: "Conséquence de cette séance : une tension commune aux trois bras ne change pas le vecteur spatial." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const id = "fl-c3";
        let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="2">';
        s += fleche(60, 150, 180, 150, id) + fleche(180, 150, 120, 46.1, id) + fleche(120, 46.1, 60, 150, id) + "</g>";
        s += ECRITS + texte(110, 170, "1") + texte(160, 92, "a") + texte(70, 92, "a²") + texte(220, 100, "les trois vecteurs se referment :") + texte(220, 120, "leur somme est nulle") + "</g>";
        schemaCorrection(moteurApi, conteneur, "0 0 480 190", s, "1, a et a² mis bout à bout forment un triangle équilatéral fermé.");
      },
    })
  );
}

/* --------------------------------------------------------------------------
   D. Pleine onde : animation manipulable
   -------------------------------------------------------------------------- */

function construireSixPas(racine, api) {
  const conteneur = racine.querySelector("#d-sixstep");
  if (!conteneur) return;
  const E = 540;
  const G = { hx: 135, hy: 170, R: 100, x0: 320, l: 420, piste: 336 };
  const xA = (deg) => G.x0 + (G.l * deg) / 360;

  const svg = svgEl("svg", {
    viewBox: "0 0 780 360",
    role: "img",
    "aria-label": "Pleine onde : hexagone avec le vecteur de l'état courant, commandes des trois bras, tension composée et tension simple sur une période",
  });
  const fond = svgEl("g");
  const vecteur = svgEl("g");
  const curseur = svgEl("g");
  svg.append(fond, vecteur, curseur);
  conteneur.appendChild(svg);

  const lignes = { a: 52, b: 84, c: 116 };
  const yAB = 176;
  const kAB = 34;
  const yAN = 282;
  const kAN = 60;

  function chemin(fonction, yc, k) {
    let d = "";
    let precedent = null;
    for (let i = 0; i <= 1440; i += 1) {
      const deg = i / 4;
      const v = fonction(deg);
      const x = xA(deg).toFixed(1);
      const y = (yc - k * v).toFixed(1);
      if (precedent === null) d = "M" + x + " " + y;
      else if (v !== precedent) d += "H" + x + "V" + y;
      precedent = v;
    }
    return d + "H" + xA(360).toFixed(1);
  }

  let s = dessinHexagone({ cx: G.hx, cy: G.hy, R: G.R, id: "fl-6p", etiquettes: "etats" });
  s += TRAITS + ' stroke-width="1.2" opacity="0.7">';
  s += '<path d="M' + G.x0 + " " + yAB + "H" + (G.x0 + G.l + 8) + "M" + G.x0 + " " + yAN + "H" + (G.x0 + G.l + 8) + '"/>';
  s += '<path d="M' + G.x0 + " " + G.piste + "H" + (G.x0 + G.l) + '" stroke-width="1.8"/>';
  for (const deg of [60, 120, 180, 240, 300]) s += '<path d="M' + xA(deg).toFixed(1) + ' 30V' + (yAN + 56) + '" stroke-dasharray="1 5" opacity="0.6"/>';
  s += "</g>";
  s += TRAITS + ' stroke-width="2">';
  for (const [nom, y] of Object.entries(lignes)) s += '<path d="' + chemin((deg) => etatsPleineOnde(deg)[nom], y, 16) + '"/>';
  s += '<path d="' + chemin((deg) => tensionsEtat(etatsPleineOnde(deg)).ab, yAB, kAB) + '" stroke-width="2.2"/>';
  s += '<path d="' + chemin((deg) => tensionsEtat(etatsPleineOnde(deg)).an, yAN, kAN) + '" stroke-width="2.6"/>';
  s += "</g>";
  const fond1 = [];
  for (let i = 0; i <= 180; i += 1) fond1.push([xA(i * 2), yAN - kAN * (2 / Math.PI) * Math.cos((i * 2 * Math.PI) / 180)]);
  s += TRAITS + ' stroke-width="1.4" stroke-dasharray="6 4"><polyline points="' + chaine(fond1) + '"/></g>';
  s += ECRITS;
  s += texte(G.x0 - 34, lignes.a - 2, "s_a") + texte(G.x0 - 34, lignes.b - 2, "s_b") + texte(G.x0 - 34, lignes.c - 2, "s_c");
  s += texte(G.x0 - 40, yAB - kAB + 4, "+E") + texte(G.x0 - 40, yAB + kAB + 4, "-E") + texte(G.x0 + 4, yAB - kAB - 8, "v_AB", ' font-size="11"');
  s += texte(G.x0 - 50, yAN - kAN * (2 / 3) + 4, "2E/3") + texte(G.x0 - 50, yAN - kAN / 3 + 4, "E/3") + texte(G.x0 + 4, yAN - kAN * (2 / 3) - 8, "v_An", ' font-size="11"');
  for (const deg of [0, 120, 240, 360]) s += texte(xA(deg) - 8, 22, String(deg), ' font-size="10.5"');
  s += texte(G.x0, G.piste + 20, "angle ωt : faire glisser la poignée", ' font-size="11"');
  s += "</g>";
  fond.innerHTML = s;

  const valeurs = api.sim.valeurs("#d-sixstep-valeurs", [
    { id: "angle", libelle: "Angle ωt", unite: "°", decimales: 0 },
    { id: "etat", libelle: "État s_a s_b s_c", format: (x) => x },
    { id: "fermes", libelle: "Interrupteurs fermés", format: (x) => x },
    { id: "ab", libelle: "v_AB", unite: "V", decimales: 0 },
    { id: "bc", libelle: "v_BC", unite: "V", decimales: 0 },
    { id: "an", libelle: "v_An", unite: "V", decimales: 0 },
    { id: "no", libelle: "Mode commun v_nO", unite: "V", decimales: 0 },
  ]);
  if (valeurs) ressources.push(valeurs);

  function placer(deg) {
    const d = Math.min(Math.max(deg, 0), 359.9);
    const etat = etatsPleineOnde(d);
    const code = "" + etat.a + etat.b + etat.c;
    const n = numeroVecteur(code);
    const t = tensionsEtat(etat);
    const ang = (n - 1) * 60;
    const px = G.hx + (G.R - 4) * Math.cos((ang * Math.PI) / 180);
    const py = G.hy - (G.R - 4) * Math.sin((ang * Math.PI) / 180);
    vecteur.innerHTML =
      TRAITS + ' stroke-width="4.2">' + fleche(G.hx, G.hy, px, py, "fl-6p") + "</g>" +
      ECRITS + texte(18, 24, "état " + code + " : V" + n, ' font-size="13" font-weight="600"') + "</g>";
    curseur.innerHTML =
      TRAITS + ' stroke-width="1" stroke-dasharray="3 4"><path d="M' + xA(d).toFixed(1) + " 30V" + G.piste + '"/></g>' +
      '<circle cx="' + xA(d).toFixed(1) + '" cy="' + (yAN - kAN * t.an).toFixed(1) + '" r="5" fill="currentColor"/>';
    const fermes = [etat.a ? "T1" : "T4", etat.b ? "T3" : "T6", etat.c ? "T5" : "T2"].join(", ");
    if (valeurs) valeurs.maj({ angle: d, etat: code, fermes, ab: t.ab * E, bc: t.bc * E, an: t.an * E, no: t.nO * E });
  }

  const synchro = synchroniseur(placer);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "segment",
    de: { x: G.x0, y: G.piste },
    a: { x: G.x0 + G.l, y: G.piste },
    min: 0,
    max: 360,
    pas: 1,
    valeur: 10,
    unite: "°",
    libelle: "Angle électrique sur une période",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(mesure.valeur, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  synchro.lecteur = api.sim.lecteur("#d-sixstep-lecteur", {
    de: 0,
    a: 360,
    duree: 12,
    boucle: true,
    auto: false,
    libelle: "Parcours d'une période",
    rappel: (deg) => synchro.appliquer(deg, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  synchro.appliquer(10, null);
  ressources.push(api.dessiner(fond, { declencheur: conteneur, duree: 1.3 }));
}

/* --------------------------------------------------------------------------
   E. Construction du vecteur spatial
   -------------------------------------------------------------------------- */

function construireVecteur(racine, api) {
  const conteneur = racine.querySelector("#e-vecteur");
  if (!conteneur) return;
  const G = { cx: 175, cy: 165, R: 100, x0: 390, l: 360, yc: 165, A: 58 };
  const reglages = { k: 0 };
  const xA = (deg) => G.x0 + (G.l * deg) / 360;
  const P = (r, deg) => [G.cx + r * Math.cos((deg * Math.PI) / 180), G.cy - r * Math.sin((deg * Math.PI) / 180)];

  const svg = svgEl("svg", {
    viewBox: "0 0 780 330",
    role: "img",
    "aria-label": "Construction du vecteur spatial : contributions des trois phases le long de leurs axes, mises bout à bout, et tensions des trois phases en fonction de l'angle",
  });
  const fond = svgEl("g");
  const courbes = svgEl("g");
  const chaineVec = svgEl("g");
  const curseur = svgEl("g");
  svg.append(fond, courbes, chaineVec, curseur);
  conteneur.appendChild(svg);

  let s = "<defs>" + marqueur("fl-vs") + "</defs>";
  s += TRAITS + ' stroke-width="1.1" stroke-dasharray="5 5" opacity="0.65">';
  for (const deg of [0, 120, 240]) {
    const a = P(-70, deg);
    const b = P(150, deg);
    s += '<path d="M' + a[0].toFixed(1) + " " + a[1].toFixed(1) + "L" + b[0].toFixed(1) + " " + b[1].toFixed(1) + '"/>';
  }
  s += '<circle cx="' + G.cx + '" cy="' + G.cy + '" r="' + G.R + '" stroke-dasharray="2 4"/>';
  s += "</g>";
  s += TRAITS + ' stroke-width="1.2" opacity="0.75"><path d="M' + G.x0 + " " + G.yc + "H" + (G.x0 + G.l + 8) + "M" + G.x0 + " " + (G.yc - 100) + "V" + (G.yc + 100) + '"/></g>';
  s += ECRITS;
  const la = P(156, 0);
  const lb = P(156, 120);
  const lc = P(156, 240);
  s += texte(la[0] - 40, la[1] - 8, "axe a") + texte(lb[0] - 6, lb[1] - 4, "axe b") + texte(lc[0] - 10, lc[1] + 14, "axe c");
  s += texte(G.x0 - 28, G.yc - G.A + 4, "+1") + texte(G.x0 - 28, G.yc + G.A + 4, "-1") + texte(G.x0 + G.l - 10, G.yc + 18, "θ", ' font-size="12"');
  s += "</g>";
  fond.innerHTML = s;

  const valeurs = api.sim.valeurs("#e-vecteur-valeurs", [
    { id: "theta", libelle: "Angle θ", unite: "°", decimales: 0 },
    { id: "va", libelle: "v_a", decimales: 3 },
    { id: "vb", libelle: "v_b", decimales: 3 },
    { id: "vc", libelle: "v_c", decimales: 3 },
    { id: "somme", libelle: "v_a + v_b + v_c", decimales: 3 },
    { id: "mod", libelle: "Module de v", decimales: 3 },
    { id: "arg", libelle: "Argument de v", unite: "°", decimales: 1 },
  ]);
  if (valeurs) ressources.push(valeurs);

  const v0 = (deg) => reglages.k * Math.cos((3 * deg * Math.PI) / 180);
  const phase = (deg, decal) => Math.cos(((deg - decal) * Math.PI) / 180) + v0(deg);

  function tracerCourbes() {
    const motifs = [["v_a", 0, ""], ["v_b", 120, ' stroke-dasharray="7 4"'], ["v_c", 240, ' stroke-dasharray="2 4"']];
    let t = "";
    let e = ECRITS.replace('font-size="12"', 'font-size="11"');
    for (const [nom, decal, style] of motifs) {
      const pts = [];
      for (let i = 0; i <= 180; i += 1) pts.push([xA(2 * i), G.yc - G.A * phase(2 * i, decal)]);
      t += TRAITS + ' stroke-width="2"' + style + '><polyline points="' + chaine(pts) + '"/></g>';
      const ref = (decal + 360) % 360;
      const xl = ref === 0 ? 0 : ref;
      e += texte(xA(xl) + 4, G.yc - G.A * phase(xl, decal) - 8, nom);
    }
    courbes.innerHTML = t + e + "</g>";
  }

  function placer(deg) {
    const d = ((deg % 360) + 360) % 360;
    const vk = [phase(d, 0), phase(d, 120), phase(d, 240)];
    const axes = [0, 120, 240];
    let p = [G.cx, G.cy];
    let h = TRAITS + ' stroke-width="1.8">';
    let e = ECRITS.replace('font-size="12"', 'font-size="11.5"');
    ["a", "b", "c"].forEach((nom, i) => {
      const l = (2 / 3) * vk[i] * G.R;
      const q = [p[0] + l * Math.cos((axes[i] * Math.PI) / 180), p[1] - l * Math.sin((axes[i] * Math.PI) / 180)];
      if (Math.abs(l) > 2) h += fleche(p[0], p[1], q[0], q[1], "fl-vs");
      e += texte((p[0] + q[0]) / 2 + 6, (p[1] + q[1]) / 2 - 6, nom);
      p = q;
    });
    h += "</g>";
    const re = (2 / 3) * (vk[0] - 0.5 * vk[1] - 0.5 * vk[2]);
    const im = (2 / 3) * ((RAC3 / 2) * vk[1] - (RAC3 / 2) * vk[2]);
    h += TRAITS + ' stroke-width="4">' + fleche(G.cx, G.cy, G.cx + G.R * re, G.cy - G.R * im, "fl-vs") + "</g>";
    chaineVec.innerHTML = h + e + "</g>";
    curseur.innerHTML = TRAITS + ' stroke-width="1" stroke-dasharray="3 4"><path d="M' + xA(d).toFixed(1) + " " + (G.yc - 100) + "V" + (G.yc + 100) + '"/></g>';
    let arg = (Math.atan2(im, re) * 180) / Math.PI;
    if (arg < 0) arg += 360;
    if (valeurs) valeurs.maj({ theta: d, va: vk[0], vb: vk[1], vc: vk[2], somme: vk[0] + vk[1] + vk[2], mod: Math.hypot(re, im), arg });
  }

  const synchro = synchroniseur(placer);
  synchro.poignee = api.sim.poignee(conteneur, {
    type: "cercle",
    centre: { x: G.cx, y: G.cy },
    rayon: G.R,
    min: 0,
    max: 360,
    pas: 1,
    valeur: 25,
    unite: "°",
    libelle: "Angle θ du vecteur spatial",
    diffuserAuDepart: false,
    rappel: (mesure) => synchro.appliquer(((mesure.valeur % 360) + 360) % 360, "poignee"),
  });
  if (synchro.poignee) ressources.push(synchro.poignee);

  const curseurs = api.sim.curseurs(
    "#e-vecteur-curseurs",
    [{ id: "k", libelle: "Composante commune k cos 3θ ajoutée aux trois phases", min: 0, max: 0.5, pas: 0.01, valeur: 0, format: (x) => nb(api, x, 2) }],
    (lues) => {
      reglages.k = lues.k;
      tracerCourbes();
      synchro.redessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  synchro.lecteur = api.sim.lecteur("#e-vecteur-lecteur", {
    de: 0,
    a: 360,
    duree: 10,
    boucle: true,
    auto: false,
    libelle: "Rotation du vecteur sur un tour",
    rappel: (deg) => synchro.appliquer(deg, "lecteur"),
  });
  if (synchro.lecteur) ressources.push(synchro.lecteur);
  tracerCourbes();
  synchro.appliquer(25, null);
  ressources.push(api.dessiner(fond, { declencheur: conteneur, duree: 1.2 }));
}

/* --------------------------------------------------------------------------
   E. Modulation vectorielle : simulation
   -------------------------------------------------------------------------- */

function construireSvm(racine, api) {
  const conteneur = racine.querySelector("#e-svm");
  if (!conteneur) return;
  const G = { hx: 180, hy: 180, R: 140, x0: 410, l: 340 };
  const reglages = { E: 600, fd: 5000 };
  const ref = { r: 0.896 * Math.cos(Math.PI / 6), angle: 40 };

  const svg = svgEl("svg", {
    viewBox: "0 0 780 360",
    role: "img",
    "aria-label": "Modulation vectorielle : référence déplaçable dans l'hexagone, décomposition sur les deux vecteurs voisins, commandes des trois bras et tension de mode commun sur une période de découpage",
  });
  const fond = svgEl("g");
  const dyn = svgEl("g");
  svg.append(fond, dyn);
  conteneur.appendChild(svg);

  let s = dessinHexagone({ cx: G.hx, cy: G.hy, R: G.R, id: "fl-svm", etiquettes: "etats", cercle: true, secteurs: true });
  s += ECRITS.replace('font-size="12"', 'font-size="11.5" font-weight="600"');
  for (let k = 0; k < 6; k += 1) {
    const a = ((60 * k + 30) * Math.PI) / 180;
    s += texte(G.hx + 0.62 * G.R * Math.cos(a) - 6, G.hy - 0.62 * G.R * Math.sin(a) + 4, ROMAINS[k]);
  }
  s += "</g>";
  s += TRAITS + ' stroke-width="1.2" opacity="0.7"><path d="M' + G.x0 + " 330H" + (G.x0 + G.l) + '"/>';
  s += '<path d="M' + G.x0 + " 326v8M" + (G.x0 + G.l / 2) + " 326v8M" + (G.x0 + G.l) + ' 326v8"/></g>';
  s += ECRITS.replace('font-size="12"', 'font-size="11"');
  s += texte(G.x0 - 34, 62, "s_a") + texte(G.x0 - 34, 122, "s_b") + texte(G.x0 - 34, 182, "s_c") + texte(G.x0 - 40, 262, "v_nO");
  s += texte(G.x0 - 4, 348, "0") + texte(G.x0 + G.l / 2 - 14, 348, "Td/2") + texte(G.x0 + G.l - 10, 348, "Td");
  s += texte(G.x0 + G.l + 4, 226, "+E/2") + texte(G.x0 + G.l + 4, 306, "-E/2");
  s += "</g>";
  fond.innerHTML = s;

  const valeurs = api.sim.valeurs("#e-svm-valeurs", [
    { id: "secteur", libelle: "Secteur et vecteurs", format: (x) => x },
    { id: "module", libelle: "Module de la référence", unite: "V", decimales: 1 },
    { id: "u", libelle: "Tension composée efficace équivalente", unite: "V", decimales: 1 },
    { id: "m", libelle: "Indice m = |v*| / (E/√3)", decimales: 3 },
    { id: "t1", libelle: "t1", unite: "µs", decimales: 1 },
    { id: "t2", libelle: "t2", unite: "µs", decimales: 1 },
    { id: "t0", libelle: "t0", unite: "µs", decimales: 1 },
    { id: "d", libelle: "Rapports cycliques d_a, d_b, d_c", format: (x) => x },
    { id: "zone", libelle: "Zone", format: (x) => x },
  ]);
  if (valeurs) ressources.push(valeurs);

  function dessiner() {
    const { E, fd } = reglages;
    const Td = 1e6 / fd;
    const rMax = rayonHexagone(ref.angle);
    const hors = ref.r > rMax + 1e-9;
    const r = Math.min(ref.r, rMax);
    const module = (r * 2 * E) / 3;
    const sv = vectorielle(module, ref.angle, E);
    const a = (ref.angle * Math.PI) / 180;
    const px = G.hx + G.R * r * Math.cos(a);
    const py = G.hy - G.R * r * Math.sin(a);
    const a1 = (60 * sv.k * Math.PI) / 180;
    const a2 = (60 * (sv.k + 1) * Math.PI) / 180;
    const q1 = [G.hx + G.R * sv.t1 * Math.cos(a1), G.hy - G.R * sv.t1 * Math.sin(a1)];
    const q2 = [q1[0] + G.R * sv.t2 * Math.cos(a2), q1[1] - G.R * sv.t2 * Math.sin(a2)];
    let h = TRAITS + ' stroke-width="1.8" stroke-dasharray="5 4">';
    if (sv.t1 > 0.02) h += fleche(G.hx, G.hy, q1[0], q1[1], "fl-svm");
    if (sv.t2 > 0.02) h += fleche(q1[0], q1[1], q2[0], q2[1], "fl-svm");
    h += "</g>" + TRAITS + ' stroke-width="4">' + fleche(G.hx, G.hy, px, py, "fl-svm") + "</g>";
    h += ECRITS + texte(px + 8, py - 8, "v*") + "</g>";
    if (hors) {
      h += TRAITS + ' stroke-width="1.2" stroke-dasharray="2 3"><path d="M' + px.toFixed(1) + " " + py.toFixed(1) + "L" +
        (G.hx + G.R * ref.r * Math.cos(a)).toFixed(1) + " " + (G.hy - G.R * ref.r * Math.sin(a)).toFixed(1) + '"/></g>';
    }
    /* commandes centrées des bras */
    const lignes = [62, 122, 182];
    h += TRAITS + ' stroke-width="2.2">';
    sv.d.forEach((d, i) => {
      const y = lignes[i];
      const xa = G.x0 + (G.l * (1 - d)) / 2;
      const xb = G.x0 + (G.l * (1 + d)) / 2;
      h += '<path d="M' + G.x0 + " " + y + "H" + xa.toFixed(1) + "V" + (y - 26) + "H" + xb.toFixed(1) + "V" + y + "H" + (G.x0 + G.l) + '"/>';
    });
    /* mode commun */
    const instants = [0, 1];
    sv.d.forEach((d) => instants.push((1 - d) / 2, (1 + d) / 2));
    instants.sort((x, y) => x - y);
    const yc = 266;
    const kv = 80;
    let dmc = "";
    let somme = 0;
    for (let i = 0; i < instants.length - 1; i += 1) {
      const m = (instants[i] + instants[i + 1]) / 2;
      const n = sv.d.reduce((acc, d) => acc + (Math.abs(m - 0.5) < d / 2 ? 1 : 0), 0);
      const v = (2 * n - 3) / 6;
      somme += v * (instants[i + 1] - instants[i]);
      const y = (yc - kv * v).toFixed(1);
      const x1 = (G.x0 + G.l * instants[i]).toFixed(1);
      const x2 = (G.x0 + G.l * instants[i + 1]).toFixed(1);
      dmc += (i === 0 ? "M" + x1 + " " + y : "V" + y) + "H" + x2;
    }
    h += '<path d="' + dmc + '"/></g>';
    h += TRAITS + ' stroke-width="1.1" stroke-dasharray="6 4"><path d="M' + G.x0 + " " + (yc - kv * somme).toFixed(1) + "H" + (G.x0 + G.l) + '"/></g>';
    dyn.innerHTML = h;
    const lin = r <= Math.cos(Math.PI / 6) + 1e-9;
    if (valeurs) {
      valeurs.maj({
        secteur: ROMAINS[sv.k] + " : V" + (sv.k + 1) + " (" + sv.premier + ") et V" + (((sv.k + 1) % 6) + 1) + " (" + sv.second + ")",
        module,
        u: (RAC3 * module) / RAC2,
        m: module / (E / RAC3),
        t1: sv.t1 * Td,
        t2: sv.t2 * Td,
        t0: sv.t0 * Td,
        d: sv.d.map((x) => nb(api, x, 3)).join(" ; "),
        zone: hors ? "hors hexagone : ramenée sur le bord" : lin ? "linéaire, dans le cercle inscrit" : "entre cercle et hexagone : surmodulation si la référence tourne",
      });
    }
  }

  function versPoint() {
    const a = (ref.angle * Math.PI) / 180;
    return { x: G.hx + G.R * ref.r * Math.cos(a), y: G.hy - G.R * ref.r * Math.sin(a) };
  }

  let lecteur = null;
  const poignee = api.sim.poignee(conteneur, {
    type: "zone",
    boite: { x: G.hx - G.R, y: G.hy - G.R, largeur: 2 * G.R, hauteur: 2 * G.R },
    valeur: versPoint(),
    pas: 2,
    libelle: "Extrémité de la référence dans l'hexagone",
    diffuserAuDepart: false,
    rappel: (mesure) => {
      const dx = (mesure.x - G.hx) / G.R;
      const dy = -(mesure.y - G.hy) / G.R;
      ref.r = Math.hypot(dx, dy);
      let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (ang < 0) ang += 360;
      ref.angle = ang;
      if (lecteur) lecteur.suivre(ang);
      dessiner();
    },
  });
  if (poignee) ressources.push(poignee);

  const curseurs = api.sim.curseurs(
    "#e-svm-curseurs",
    [
      { id: "E", libelle: "Tension du bus E", min: 300, max: 800, pas: 10, valeur: 600, unite: "V" },
      { id: "fd", libelle: "Fréquence de découpage f_d", min: 2, max: 16, pas: 0.5, valeur: 5, unite: "kHz" },
    ],
    (lues) => {
      reglages.E = lues.E;
      reglages.fd = lues.fd * 1000;
      dessiner();
    }
  );
  if (curseurs) ressources.push(curseurs);

  lecteur = api.sim.lecteur("#e-svm-lecteur", {
    de: 0,
    a: 360,
    duree: 14,
    boucle: true,
    auto: false,
    libelle: "Rotation de la référence à module constant",
    rappel: (ang) => {
      ref.angle = ang;
      if (poignee) poignee.set(versPoint(), false);
      dessiner();
    },
  });
  if (lecteur) ressources.push(lecteur);
  ref.angle = 40;
  ref.r = 0.896 * Math.cos(Math.PI / 6);
  if (poignee) poignee.set(versPoint(), false);
  if (lecteur) lecteur.suivre(40);
  dessiner();
  ressources.push(api.dessiner(fond, { declencheur: conteneur, duree: 1.3 }));
}

/* --------------------------------------------------------------------------
   E. Sinus-triangle triphasé et injection de mode commun
   -------------------------------------------------------------------------- */

function references(u, ma, mode) {
  const r = [0, 1, 2].map((k) => ma * Math.cos(TAU * u - (k * TAU) / 3));
  let v0 = 0;
  if (mode === 1) v0 = -(ma / 6) * Math.cos(3 * TAU * u);
  else if (mode === 2) v0 = -0.5 * (Math.max(r[0], r[1], r[2]) + Math.min(r[0], r[1], r[2]));
  return r.map((x) => x + v0);
}

function vab(u, ma, mf, mode) {
  const r = references(u, ma, mode);
  const p = triangle(mf * u);
  return (r[0] > p ? 1 : 0) - (r[1] > p ? 1 : 0);
}

function construireMli(racine, api) {
  if (!racine.querySelector("#e-mli-sortie")) return;
  const reglages = { ma: 0.9, mf: 15, mode: 0 };
  const N = 8192;
  const noms = ["sinus-triangle seul", "injection de rang 3 au sixième", "injection min-max"];

  const comparaison = api.sim.traceur("#e-mli-comparaison", {
    titre: "Porteuse et références des trois bras",
    xTitre: "temps", xUnite: "ms", yTitre: "niveau", yUnite: "",
    xMin: 0, xMax: 20, yMin: -1.5, yMax: 1.5,
    echantillons: 1600,
    series: [
      { id: "tri", nom: "porteuse", couleur: "serie-6", epaisseur: 1.1 },
      { id: "ra", nom: "référence a", couleur: "serie-1", epaisseur: 2.4 },
      { id: "rb", nom: "référence b", couleur: "serie-2", epaisseur: 2.4 },
      { id: "rc", nom: "référence c", couleur: "serie-3", epaisseur: 2.4 },
    ],
  });
  if (comparaison) ressources.push(comparaison);

  const sortie = api.sim.traceur("#e-mli-sortie", {
    titre: "Tension composée v_AB rapportée à E",
    xTitre: "temps", xUnite: "ms", yTitre: "v_AB / E", yUnite: "",
    xMin: 0, xMax: 20, yMin: -1.4, yMax: 1.4,
    echantillons: 3000,
    series: [
      { id: "v", nom: "v_AB / E", couleur: "serie-1", epaisseur: 1.1 },
      { id: "f", nom: "fondamental", couleur: "serie-3", epaisseur: 2.8 },
    ],
  });
  if (sortie) ressources.push(sortie);

  const spectre = api.sim.spectre("#e-mli-spectre", {
    titre: "Spectre de v_AB rapporté à E, amplitudes crêtes",
    xTitre: "rang h",
    yTitre: "V_h crête / E",
    unite: "",
    barres: [],
    yMax: 1.1,
  });
  if (spectre) ressources.push(spectre);

  function maj() {
    const { ma, mf, mode } = reglages;
    const ech = new Array(N);
    for (let k = 0; k < N; k += 1) ech[k] = vab((k + 0.5) / N, ma, mf, mode);
    const hMax = Math.min(3 * mf + 4, 140);
    const A = amplitudes(ech, hMax);
    let a1 = 0;
    let b1 = 0;
    for (let k = 0; k < N; k += 1) {
      const angle = (TAU * (k + 0.5)) / N;
      a1 += ech[k] * Math.cos(angle);
      b1 += ech[k] * Math.sin(angle);
    }
    a1 *= 2 / N;
    b1 *= 2 / N;
    const rms = Math.sqrt(ech.reduce((s, x) => s + x * x, 0) / N);
    const thd = Math.sqrt(Math.max(0, rms * rms - (A[1] * A[1]) / 2)) / (A[1] / RAC2);
    let crete = 0;
    for (let k = 0; k < 720; k += 1) crete = Math.max(crete, Math.abs(references(k / 720, ma, mode)[0]));
    const limite = mode === 0 ? 1 : 2 / RAC3;
    const lineaire = ma <= limite + 1e-9;
    let bas = 0;
    for (const h of [5, 7]) bas = Math.max(bas, A[h]);

    if (comparaison) {
      comparaison.definirFonction("tri", (tms) => triangle((mf * tms) / 20));
      comparaison.definirFonction("ra", (tms) => references(tms / 20, ma, mode)[0]);
      comparaison.definirFonction("rb", (tms) => references(tms / 20, ma, mode)[1]);
      comparaison.definirFonction("rc", (tms) => references(tms / 20, ma, mode)[2]);
      comparaison.definirMesures([
        { nom: "Modulation", valeur: noms[mode] },
        { nom: "Crête des références", valeur: nb(api, crete, 3) + (crete > 1 ? ", hors porteuse" : ", dans la porteuse") },
      ]);
    }
    if (sortie) {
      sortie.definirFonction("v", (tms) => vab(tms / 20, ma, mf, mode));
      sortie.definirFonction("f", (tms) => a1 * Math.cos((TAU * tms) / 20) + b1 * Math.sin((TAU * tms) / 20));
      sortie.definirMesures([
        { nom: "Fondamental calculé", valeur: nb(api, A[1], 3) + " E crête, soit " + nb(api, A[1] / RAC2, 3) + " E eff" },
        { nom: "Théorie linéaire √3 m_a / 2", valeur: nb(api, (RAC3 * ma) / 2, 3) + (lineaire ? "" : ", hors zone linéaire") },
        { nom: "Rangs 5 et 7, le plus fort", valeur: nb(api, bas, 3) + " E crête" },
        { nom: "Taux de distorsion de v_AB", valeur: A[1] > 1e-6 ? nb(api, thd * 100, 0) + " %" : "indéfini" },
        { nom: "Raie au rang m_f", valeur: nb(api, A[mf] || 0, 3) + " E crête" },
      ]);
    }
    if (spectre) {
      const marques = new Set([1, 5, 7, mf, 2 * mf, 3 * mf]);
      const barres = [];
      for (let h = 1; h <= hMax; h += 1) barres.push({ etiquette: marques.has(h) ? String(h) : " ", valeur: A[h] });
      spectre.definirBarres(barres);
    }
  }

  const curseurs = api.sim.curseurs(
    "#e-mli-curseurs",
    [
      { id: "ma", libelle: "Indice de modulation m_a", min: 0.1, max: 1.3, pas: 0.01, valeur: reglages.ma, format: (x) => nb(api, x, 2) },
      { id: "mf", libelle: "Indice de fréquence m_f", min: 6, max: 45, pas: 1, valeur: reglages.mf, format: (x) => String(Math.round(x)) },
      { id: "mode", libelle: "Modulation : 0 seule, 1 rang 3, 2 min-max", min: 0, max: 2, pas: 1, valeur: 0, format: (x) => noms[Math.round(x)] },
    ],
    (lues) => {
      reglages.ma = lues.ma;
      reglages.mf = Math.round(lues.mf);
      reglages.mode = Math.round(lues.mode);
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   I. Tension disponible et loi U/f
   -------------------------------------------------------------------------- */

function construireTension(racine, api) {
  if (!racine.querySelector("#i-tension-trace")) return;
  const reglages = { E: 514, U0: 8 };
  const COEF = [RAC3 / (2 * RAC2), 1 / RAC2, Math.sqrt(6) / Math.PI];

  const loi = (f) => (f <= 50 ? reglages.U0 + ((400 - reglages.U0) * f) / 50 : 400);

  const trace = api.sim.traceur("#i-tension-trace", {
    titre: "Tension composée demandée et tensions disponibles",
    xTitre: "fréquence", xUnite: "Hz", yTitre: "tension composée efficace", yUnite: "V",
    xMin: 0, xMax: 55, yMin: 0, yMax: 520,
    echantillons: 400,
    series: [
      { id: "uf", nom: "loi U/f demandée", couleur: "serie-1", epaisseur: 3.2 },
      { id: "st", nom: "maximum sinus-triangle", couleur: "serie-2", epaisseur: 1.6 },
      { id: "sv", nom: "maximum vectorielle linéaire", couleur: "serie-3", epaisseur: 1.6 },
      { id: "po", nom: "maximum pleine onde", couleur: "serie-4", epaisseur: 1.6 },
    ],
    surDessin({ c, repere: r, couleurs }) {
      ligneV(c, r, couleurs, 42.25, "point de service");
    },
  });
  if (trace) ressources.push(trace);

  function saturation(Umax) {
    if (Umax >= 400) return "aucune jusqu'à 50 Hz";
    if (Umax <= reglages.U0) return "dès 0 Hz";
    return nb(api, ((Umax - reglages.U0) * 50) / (400 - reglages.U0), 1) + " Hz";
  }

  function maj() {
    const { E } = reglages;
    const max = COEF.map((k) => k * E);
    if (trace) {
      trace.definirFonction("uf", loi);
      trace.definirFonction("st", () => max[0]);
      trace.definirFonction("sv", () => max[1]);
      trace.definirFonction("po", () => max[2]);
      trace.definirMesures([
        { nom: "Maxima : sinus-triangle, vectorielle, pleine onde", valeur: max.map((x) => nb(api, x, 1)).join(" ; ") + " V" },
        { nom: "Saturation en sinus-triangle", valeur: saturation(max[0]) },
        { nom: "Saturation en vectorielle", valeur: saturation(max[1]) },
        { nom: "Saturation en pleine onde", valeur: saturation(max[2]) },
        { nom: "Tension disponible à 50 Hz, linéaire", valeur: nb(api, Math.min(1, max[1] / 400) * 100, 1) + " % de 400 V" },
      ]);
    }
  }

  const curseurs = api.sim.curseurs(
    "#i-tension-curseurs",
    [
      { id: "E", libelle: "Tension du bus E", min: 450, max: 650, pas: 1, valeur: reglages.E, unite: "V" },
      { id: "U0", libelle: "Tension de démarrage U_0 de la loi U/f", min: 0, max: 20, pas: 0.5, valeur: reglages.U0, unite: "V" },
    ],
    (lues) => {
      reglages.E = lues.E;
      reglages.U0 = lues.U0;
      maj();
    }
  );
  if (curseurs) ressources.push(curseurs);
  maj();
}

/* --------------------------------------------------------------------------
   K. Exercices progressifs
   -------------------------------------------------------------------------- */

function dessinEtoile(id) {
  let s = "<defs>" + marqueur(id) + "</defs>" + TRAITS + ' stroke-width="2">';
  s += '<path d="M40 40H120M40 200H120M120 40V60M120 100V130M120 130H180M180 110V60H120M180 150V200H120"/>';
  s += '<rect x="110" y="60" width="20" height="40" rx="3"/><rect x="170" y="110" width="20" height="40" rx="3"/>';
  s += '<path d="M120 130V145M120 185V200"/><rect x="110" y="145" width="20" height="40" rx="3"/>';
  s += "</g>";
  s += '<circle cx="120" cy="130" r="4" fill="currentColor"/>';
  s += ECRITS;
  s += texte(20, 36, "+E = 600 V, phase a") + texte(20, 218, "0 V, phases b et c");
  s += texte(140, 84, "Z") + texte(196, 134, "Z") + texte(140, 170, "Z") + texte(130, 126, "n");
  s += texte(240, 70, "b et c en parallèle : Z/2") + texte(240, 92, "diviseur : v_n = E × (Z/2) / (Z + Z/2)") + texte(240, 114, "v_n = E/3 = 200 V au-dessus de 0 V");
  s += texte(240, 150, "v_An = 600 - 200 = 400 V = 2E/3") + texte(240, 172, "v_Bn = v_Cn = -200 V = -E/3");
  s += "</g>";
  return s;
}

function hexagoneAvecReference(id, angle, t1, t2, legendeRef) {
  const cx = 170;
  const cy = 160;
  const R = 130;
  let s = dessinHexagone({ cx, cy, R, id, etiquettes: "etats", cercle: true, secteurs: true });
  const k = Math.min(5, Math.floor((((angle % 360) + 360) % 360) / 60));
  const a1 = (60 * k * Math.PI) / 180;
  const a2 = (60 * (k + 1) * Math.PI) / 180;
  const q1 = [cx + R * t1 * Math.cos(a1), cy - R * t1 * Math.sin(a1)];
  const q2 = [q1[0] + R * t2 * Math.cos(a2), q1[1] - R * t2 * Math.sin(a2)];
  s += TRAITS + ' stroke-width="1.8" stroke-dasharray="5 4">' + fleche(cx, cy, q1[0], q1[1], id) + fleche(q1[0], q1[1], q2[0], q2[1], id) + "</g>";
  s += TRAITS + ' stroke-width="4">' + fleche(cx, cy, q2[0], q2[1], id) + "</g>";
  s += ECRITS + texte(q2[0] + 8, q2[1] - 6, legendeRef) + "</g>";
  return s;
}

function construireExercices(racine, api) {
  if (!racine.querySelector("#k-exercices-blocs")) return;
  const cible = "#k-exercices-blocs";

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k1-etat-100",
      titre: "Tension simple dans un état actif",
      niveau: "fondamental",
      enonce: "<p>Un onduleur triphasé sur un bus de $600\\ \\mathrm{V}$ alimente une charge équilibrée en étoile, neutre isolé. Il est dans l'état $100$. Quelle est la tension simple $v_{An}$, en volts ?</p>",
      valeur: 400,
      unite: "V",
      tolerance: 0.01,
      chiffres: 0,
      libelleChamp: "$v_{An}$",
      etapes: [
        { texte: "État $100$ : $A$ relié à $+E$, $B$ et $C$ reliés à $0\\ \\mathrm{V}$." },
        { texte: "Les impédances des phases $b$ et $c$ sont en parallèle, $Z/2$, en série avec $Z$ : le neutre est au tiers, $v_n = E/3 = 200\\ \\mathrm{V}$ au-dessus de $0\\ \\mathrm{V}$." },
        { texte: "$v_{An} = 600 - 200 = 400\\ \\mathrm{V}$, conforme à $\\frac{E}{3}(2s_a - s_b - s_c) = \\frac{2E}{3}$.", note: "Erreur fréquente : répondre $300\\ \\mathrm{V}$, c'est-à-dire $v_{AO}$, la tension du bras par rapport au point milieu." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(moteurApi, conteneur, "0 0 600 230", dessinEtoile("fl-k1"), "État 100 : la charge en étoile forme un diviseur, le neutre se place à E/3.");
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k2-sinus-triangle",
      titre: "Tension composée en sinus-triangle",
      niveau: "fondamental",
      enonce: "<p>Un onduleur triphasé sur un bus de $700\\ \\mathrm{V}$ est commandé en modulation sinus-triangle avec $m_a = 0{,}9$, sans injection. Quelle est la valeur efficace du fondamental de la tension composée, en volts ?</p>",
      valeur: (RAC3 / (2 * RAC2)) * 0.9 * 700,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "$U_{AB,1}$",
      etapes: [
        { texte: "Chaque bras : fondamental $m_a\\frac{E}{2} = 0{,}9 \\times 350 = 315\\ \\mathrm{V}$ crête par rapport au point milieu." },
        { texte: "Tension composée : $\\sqrt{3} \\times 315 = 545{,}6\\ \\mathrm{V}$ crête." },
        { texte: "Valeur efficace : $545{,}6/\\sqrt{2} = 385{,}8\\ \\mathrm{V}$, soit $0{,}612 \\times 0{,}9 \\times 700$.", note: "Erreur classique : appliquer la formule du pont en H, $m_aE/\\sqrt{2} = 445{,}5\\ \\mathrm{V}$." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Moyennes glissantes des bras A et B et tension composée",
          xTitre: "angle", xUnite: "degrés", yTitre: "tension", yUnite: "V",
          xMin: 0, xMax: 360, yMin: -600, yMax: 600,
          series: [
            { id: "a", nom: "v_AO moyenne, 315 V crête", couleur: "serie-1", epaisseur: 1.8, fonction: (d) => 315 * Math.cos((d * Math.PI) / 180) },
            { id: "b", nom: "v_BO moyenne", couleur: "serie-2", epaisseur: 1.8, fonction: (d) => 315 * Math.cos(((d - 120) * Math.PI) / 180) },
            { id: "ab", nom: "v_AB, 545,6 V crête", couleur: "serie-3", epaisseur: 2.8, fonction: (d) => 315 * RAC3 * Math.cos(((d + 30) * Math.PI) / 180) },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 545.6, "545,6 V crête, 385,8 V eff");
          },
        });
      },
    })
  );

  const k3 = vectorielle((340 * RAC2) / RAC3, 15, 560);
  ressources.push(
    api.exercice.numerique(cible, {
      id: "k3-duree-nulle",
      titre: "Durée des vecteurs nuls en modulation vectorielle",
      niveau: "intermédiaire",
      enonce: "<p>Un onduleur sur un bus de $560\\ \\mathrm{V}$ découpe à $10\\ \\mathrm{kHz}$ en modulation vectorielle. La référence correspond à une tension composée de $340\\ \\mathrm{V}$ efficaces ; à l'instant étudié, elle fait un angle de $15$ degrés avec l'axe $a$. Quelle est la durée totale $t_0$ des vecteurs nuls dans la période de découpage, en microsecondes ?</p>",
      valeur: k3.t0 * 100,
      unite: "µs",
      tolerance: 0.02,
      chiffres: 1,
      libelleChamp: "$t_0$",
      etapes: [
        { texte: "$|\\vec{v}^*| = 340\\sqrt{2}/\\sqrt{3} = 277{,}6\\ \\mathrm{V}$, inférieur à $E/\\sqrt{3} = 323{,}3\\ \\mathrm{V}$ : zone linéaire, $T_d = 100\\ \\mu\\mathrm{s}$, secteur I." },
        { texte: "Coefficient $\\sqrt{3} \\times 277{,}6/560 = 0{,}8586$ ; $t_1 = 100 \\times 0{,}8586 \\times \\sin 45^\\circ = 60{,}7\\ \\mu\\mathrm{s}$ ; $t_2 = 100 \\times 0{,}8586 \\times \\sin 15^\\circ = 22{,}2\\ \\mu\\mathrm{s}$." },
        { texte: "$t_0 = 100 - 60{,}7 - 22{,}2 = 17{,}1\\ \\mu\\mathrm{s}$, réparti en $4{,}3\\ \\mu\\mathrm{s}$ de $000$ à chaque extrémité et $8{,}5\\ \\mu\\mathrm{s}$ de $111$ au centre.", note: "Près de $V_1$, $t_1$ domine : la référence est presque alignée sur ce sommet." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(moteurApi, conteneur, "0 0 340 320", hexagoneAvecReference("fl-k3", 15, k3.t1, k3.t2, "v*, 15°"), "Référence à 15 degrés : 0,607 V1 + 0,222 V2, le reste en vecteurs nuls.");
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k4-bus-minimal",
      titre: "Bus minimal pour alimenter un moteur de 400 V",
      niveau: "intermédiaire",
      enonce: "<p>Un moteur demande $400\\ \\mathrm{V}$ entre phases à $50\\ \\mathrm{Hz}$. On veut rester en zone linéaire, avec la modulation la plus économe en tension de bus. Quelle tension de bus minimale faut-il, en volts, chutes dans l'onduleur et le câble négligées ?</p>",
      valeur: 400 * RAC2,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "$E_{min}$",
      etapes: [
        { texte: "Choix de la méthode : en zone linéaire, la modulation vectorielle, ou l'injection min-max, donne le maximum, $0{,}707E$ entre phases." },
        { texte: "$E_{min} = 400/0{,}7071 = 400\\sqrt{2} = 565{,}7\\ \\mathrm{V}$, la crête du réseau de $400\\ \\mathrm{V}$." },
        { texte: "En sinus-triangle, il faudrait $400/0{,}612 = 653{,}2\\ \\mathrm{V}$ ; un redresseur à diodes sur $400\\ \\mathrm{V}$ ne donne que $540\\ \\mathrm{V}$ en moyenne, et moins en charge.", note: "D'où la règle pratique : un variateur à redresseur à diodes ne restitue pas tout à fait la tension du réseau en zone linéaire ; il recourt à la surmodulation près de la vitesse nominale." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension composée maximale selon le bus",
          xTitre: "bus E", xUnite: "V", yTitre: "tension composée efficace", yUnite: "V",
          xMin: 400, xMax: 700, yMin: 200, yMax: 560,
          series: [
            { id: "st", nom: "sinus-triangle, 0,612 E", couleur: "serie-2", epaisseur: 2.2, fonction: (E) => (RAC3 / (2 * RAC2)) * E },
            { id: "sv", nom: "vectorielle, 0,707 E", couleur: "serie-3", epaisseur: 2.8, fonction: (E) => E / RAC2 },
            { id: "po", nom: "pleine onde, 0,780 E", couleur: "serie-4", epaisseur: 2.2, fonction: (E) => (Math.sqrt(6) / Math.PI) * E },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 400, "400 V demandés");
            ligneV(c, r, couleurs, 565.7, "565,7 V");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.numerique(cible, {
      id: "k5-table",
      titre: "Interpréter une table de commutation",
      niveau: "avancé",
      enonce:
        "<p>Sur un bus de $600\\ \\mathrm{V}$, la commande d'un onduleur applique pendant une période de découpage de $100\\ \\mu\\mathrm{s}$ la table suivante : $000$ pendant $10\\ \\mu\\mathrm{s}$, $110$ pendant $30\\ \\mu\\mathrm{s}$, $010$ pendant $40\\ \\mu\\mathrm{s}$, $111$ pendant $20\\ \\mu\\mathrm{s}$. " +
        "En supposant que la commande répète ce motif en faisant tourner la référence à module constant, quelle tension composée efficace fournit-elle, en volts ? Précisez au passage le secteur et l'angle de la référence.</p>",
      valeur: 297.99,
      unite: "V",
      tolerance: 0.01,
      chiffres: 1,
      libelleChamp: "Tension composée efficace",
      etapes: [
        { texte: "Rapports cycliques : $A$ haut dans $110$ et $111$, $d_a = 0{,}5$ ; $B$ haut dans $110$, $010$ et $111$, $d_b = 0{,}9$ ; $C$ haut dans $111$ seulement, $d_c = 0{,}2$." },
        { texte: "Tensions composées moyennes : $v_{AB} = 600 \\times (0{,}5 - 0{,}9) = -240\\ \\mathrm{V}$ ; $v_{BC} = 420\\ \\mathrm{V}$ ; $v_{CA} = -180\\ \\mathrm{V}$. Somme nulle." },
        { texte: "Vecteur moyen : $0{,}3\\,V_2 + 0{,}4\\,V_3 = 400 \\times (0{,}3\\,e^{j60^\\circ} + 0{,}4\\,e^{j120^\\circ}) = -20 + j242{,}5\\ \\mathrm{V}$ : module $243{,}3\\ \\mathrm{V}$, angle $94{,}7$ degrés, secteur II." },
        { texte: "Module inférieur à $E/\\sqrt{3} = 346{,}4\\ \\mathrm{V}$ : réalisable sur tout le tour. Tension composée : $\\sqrt{3} \\times 243{,}3/\\sqrt{2} = 298{,}0\\ \\mathrm{V}$ efficaces.", note: "Le motif n'est pas symétrique : il donne la même moyenne qu'une séquence centrée, mais avec un spectre de découpage moins favorable." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        schemaCorrection(moteurApi, conteneur, "0 0 340 320", hexagoneAvecReference("fl-k5", 94.7, 0.3, 0.4, "v moyen"), "Vecteur moyen de la période : 0,3 V2 + 0,4 V3, soit 243,3 V à 94,7 degrés, dans le secteur II.");
      },
    })
  );

  ressources.push(
    api.exercice.qcm(cible, {
      id: "k6-diagnostic",
      titre: "Diagnostic : différentiel qui déclenche et roulements marqués",
      niveau: "diagnostic",
      enonce: "<p>Après la mise en service d'un variateur de $30\\ \\mathrm{kW}$ (bus de $540\\ \\mathrm{V}$, modulation vectorielle) avec un câble moteur non blindé de $85\\ \\mathrm{m}$, le dispositif différentiel de $300\\ \\mathrm{mA}$ du départ déclenche de façon intempestive, surtout depuis que la fréquence de découpage est passée de $4$ à $8\\ \\mathrm{kHz}$. Les trois courants de phase sont équilibrés et sinusoïdaux. Huit mois plus tard, les pistes des roulements du moteur présentent des stries régulières. Quelles conclusions sont justifiées ?</p>",
      options: [
        { texte: "La cause est le courant de mode commun : chaque commutation fait sauter $v_{nO}$ d'environ $180\\ \\mathrm{V}$ et charge les capacités du câble et du moteur vers la terre.", juste: true },
        { texte: "Un bras de l'onduleur est défaillant : il faut remplacer les modules." },
        { texte: "Remèdes : câble blindé à écran relié aux deux extrémités, self ou filtre de mode commun, retour à $4\\ \\mathrm{kHz}$, roulement isolé, dispositif différentiel adapté aux variateurs.", juste: true },
        { texte: "La surmodulation crée des harmoniques 5 et 7 qui font déclencher le différentiel." },
      ],
      etapes: [
        { texte: "Courants de phase équilibrés et sinusoïdaux : ni bras défaillant, ni surmodulation marquée. Le différentiel mesure la somme des trois courants, donc le courant qui fuit vers la terre." },
        { texte: "La tension de mode commun saute de $E/3 = 180\\ \\mathrm{V}$ à chaque commutation, six fois par période de découpage : $24\\,000$ fronts par seconde à $4\\ \\mathrm{kHz}$, $48\\,000$ à $8\\ \\mathrm{kHz}$. Chaque front charge les capacités parasites : $i = C\\,\\mathrm{d}v/\\mathrm{d}t$." },
        { texte: "Le courant de mode commun traverse aussi les roulements quand la tension d'arbre perce le film d'huile : les décharges répétées creusent des stries régulières.", note: "Doubler la fréquence de découpage double le nombre de fronts, donc le courant de fuite moyen : c'est cohérent avec l'aggravation observée." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        const d = [0.8, 0.5, 0.2];
        const vno = (t) => {
          const n = d.reduce((acc, x) => acc + (Math.abs(t / 250 - 0.5) < x / 2 ? 1 : 0), 0);
          return (540 * (2 * n - 3)) / 6;
        };
        traceCorrection(moteurApi, conteneur, {
          titre: "Tension de mode commun sur une période de 250 µs",
          xTitre: "temps", xUnite: "µs", yTitre: "v_nO", yUnite: "V",
          xMin: 0, xMax: 250, yMin: -330, yMax: 330,
          echantillons: 1200,
          series: [{ id: "v", nom: "v_nO, sauts de 180 V", couleur: "serie-1", epaisseur: 2.4, fonction: vno }],
          surDessin({ c, repere: r, couleurs }) {
            for (const x of [0.8, 0.5, 0.2]) {
              ligneV(c, r, couleurs, 125 - 125 * x, null);
              ligneV(c, r, couleurs, 125 + 125 * x, null);
            }
            ligneH(c, r, couleurs, 0, "chaque front : impulsion de courant vers la terre");
          },
        });
      },
    })
  );

  ressources.push(
    api.exercice.reponseCourte(cible, {
      id: "k7-mode-commun",
      titre: "Pourquoi l'injection ne déforme pas les courants",
      niveau: "conceptuel",
      enonce: "<p>Sans calcul : pourquoi ajouter la même composante aux trois références d'un onduleur qui alimente un moteur en étoile, neutre isolé, ne modifie-t-il pas les courants du moteur ? Et pourquoi cela permet-il d'augmenter la tension disponible ?</p>",
      motsCles: [["commun", "meme", "identique"], ["difference", "compose", "entre phases", "v_ab"], ["courant", "neutre", "somme", "isole"], ["crete", "ecret", "aplat", "porteuse", "satur", "marge"]],
      minimum: 3,
      exemple: "Trois ou quatre phrases : reliez la composante commune, les tensions composées, le neutre isolé, puis la crête des références.",
      etapes: [
        { texte: "Les tensions composées sont des différences de tensions de bras : une composante commune s'y annule." },
        { texte: "Neutre isolé : la somme des courants est nulle, aucun courant homopolaire ne peut circuler ; la composante commune ne fait que déplacer le potentiel du neutre." },
        { texte: "Choisie pour aplatir les crêtes, par exemple $-\\frac{1}{2}(\\max + \\min)$, elle ramène les références dans la porteuse alors que leur amplitude dépasse $1$ : on gagne $2/\\sqrt{3}$, soit $15{,}5\\ \\%$.", note: "Limite : si le neutre est relié, ou s'il existe des capacités vers la terre, la composante commune fait circuler du courant." },
      ],
      visuelCorrection(conteneur, moteurApi) {
        traceCorrection(moteurApi, conteneur, {
          titre: "Références à m_a = 1,15, avant et après injection min-max",
          xTitre: "angle", xUnite: "degrés", yTitre: "niveau", yUnite: "",
          xMin: 0, xMax: 360, yMin: -1.3, yMax: 1.3,
          series: [
            { id: "s", nom: "référence a seule, hors porteuse", couleur: "serie-6", epaisseur: 1.6, fonction: (d) => 1.15 * Math.cos((d * Math.PI) / 180) },
            { id: "i", nom: "référence a avec injection", couleur: "serie-1", epaisseur: 2.8, fonction: (d) => references(d / 360, 1.15, 2)[0] },
          ],
          surDessin({ c, repere: r, couleurs }) {
            ligneH(c, r, couleurs, 1, "crête de la porteuse");
            ligneH(c, r, couleurs, -1, null);
          },
        });
      },
    })
  );
}

/* --------------------------------------------------------------------------
   L. Quiz
   -------------------------------------------------------------------------- */

const HEX_QUIZ = { cx: 180, cy: 150, R: 120 };
const ZONES_HEX = [0, 1, 2, 3, 4, 5].map((k) => ({
  cx: (HEX_QUIZ.cx + HEX_QUIZ.R * Math.cos((60 * k * Math.PI) / 180)).toFixed(1),
  cy: (HEX_QUIZ.cy - HEX_QUIZ.R * Math.sin((60 * k * Math.PI) / 180)).toFixed(1),
  r: 17,
  juste: k === 3,
}));

function dessinHexQuiz(id) {
  let s = dessinHexagone({ cx: HEX_QUIZ.cx, cy: HEX_QUIZ.cy, R: HEX_QUIZ.R, id, etiquettes: "aucune" });
  s += ECRITS + texte(HEX_QUIZ.cx + HEX_QUIZ.R + 22, HEX_QUIZ.cy + 4, "V1 = 100, axe a") + "</g>";
  return s;
}

const VISUELS_QUIZ = [
  etapes(["3 bras à 2 positions", "2 × 2 × 2 = 8 états", "6 actifs, 2 nuls (000 et 111)"], "Nombre d'états."),
  etapes(["U_AB1 = (√6 / π) E", "= 0,7797 × 540", "= 421,0 V efficaces"], "Fondamental de la pleine onde."),
  etapes(["composante identique sur les trois bras", "v_AB = v_AO - v_BO : elle s'annule", "neutre isolé : aucun courant homopolaire"], "Injection de rang 3."),
  etapes(["v_An = (E/3)(2 s_a - s_b - s_c)", "= 200 × (2 - 1 - 0)", "= 200 V"], "Tension simple de l'état 110."),
  etapes(["sommets : 2E/3", "cercle inscrit : (2E/3) cos 30° = E/√3", "limite linéaire d'une référence qui tourne"], "Limite linéaire."),
  () => ({
    viewBox: "0 0 420 300",
    dessin: dessinHexagone({ cx: HEX_QUIZ.cx, cy: HEX_QUIZ.cy, R: HEX_QUIZ.R, id: "fl-qv5", etiquettes: "etats" }),
    legende: "011 est le complémentaire de 100 : sommet opposé à V1, à 180 degrés, c'est V4.",
  }),
  etapes(["m_f multiple de 3 : raie m_f identique sur les 3 bras", "3 × m_f × 120° = multiple de 360°", "mode commun : absente de v_AB"], "Choix de m_f."),
  etapes(["t2 = Td (√3 |v| / E) sin θ", "= 100 × (√3 × 300 / 600) × 0,5", "= 43,3 µs"], "Durée du second vecteur."),
  etapes(["v_nO = (E/6)(2 Σ s - 3)", "un bras commute : Σ s change de 1", "saut de E/3"], "Saut de mode commun."),
  etapes(["rangs multiples de 3 : mode commun", "rangs pairs : absents par symétrie", "restent 6k ± 1 : 5, 7, 11, 13"], "Harmoniques de la pleine onde."),
];

function construireQuiz(racine, api) {
  if (!racine.querySelector("#l-quiz-bloc")) return;
  const quiz = api.quiz(
    "#l-quiz-bloc",
    [
      {
        type: "qcm",
        enonce: repere(0) + "<p>Combien d'états de commutation distincts possède un onduleur triphasé de tension à deux niveaux ?</p>",
        options: ["$6$", "$8$", "$9$", "$27$"],
        bonnes: [1],
        explication: "Trois bras à deux positions : $2^3 = 8$ états, dont six actifs et deux nuls.",
        resume: "Nombre d'états",
      },
      {
        type: "calcul",
        enonce: repere(1) + "<p>Onduleur triphasé en pleine onde sur un bus de $540\\ \\mathrm{V}$. Fondamental efficace de la tension composée, en volts ?</p>",
        valeur: (Math.sqrt(6) / Math.PI) * 540,
        unite: "V",
        tolerance: 0.02,
        explication: "$U_{AB,1} = \\frac{\\sqrt{6}}{\\pi}E = 0{,}780 \\times 540 = 421{,}0\\ \\mathrm{V}$.",
        resume: "Pleine onde",
      },
      {
        type: "vraiFaux",
        enonce: repere(2) + "<p>L'injection d'une composante de rang 3 dans les trois références déforme les courants d'un moteur couplé en étoile à neutre isolé.</p>",
        reponse: false,
        explication: "La composante est commune aux trois bras : elle s'annule dans les tensions composées, et le neutre isolé interdit tout courant homopolaire.",
        resume: "Injection de rang 3",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Bus de $600\\ \\mathrm{V}$, charge équilibrée en étoile. Tension simple $v_{An}$ dans l'état $110$, en volts ?</p>",
        valeur: 200,
        unite: "V",
        tolerance: 0.02,
        explication: "$v_{An} = \\frac{E}{3}(2 \\times 1 - 1 - 0) = \\frac{E}{3} = 200\\ \\mathrm{V}$.",
        resume: "Tension simple",
      },
      {
        type: "qcm",
        enonce: repere(4) + "<p>En modulation vectorielle, jusqu'à quel module une référence qui tourne reste-t-elle en zone linéaire ?</p>",
        options: ["$2E/3$", "$E/\\sqrt{3}$", "$E/2$", "$E$"],
        bonnes: [1],
        explication: "C'est le rayon du cercle inscrit dans l'hexagone : $\\frac{2E}{3}\\cos 30^\\circ = E/\\sqrt{3}$. $E/2$ est la limite du sinus-triangle.",
        resume: "Limite linéaire",
      },
      {
        type: "schema",
        enonce: repere(5) + "<p>Sur cet hexagone, seul $V_1$ (état $100$) est repéré. Quel sommet correspond à l'état $011$ ?</p>",
        consigne: "Cliquez sur le sommet correspondant.",
        viewBox: "0 0 420 300",
        dessin: dessinHexQuiz("fl-qz"),
        zones: ZONES_HEX,
        explication: "$011$ est le complémentaire de $100$ : son vecteur est opposé, à $180$ degrés. C'est $V_4$.",
        resume: "Lecture de l'hexagone",
      },
      {
        type: "courte",
        enonce: repere(6) + "<p>Pourquoi choisit-on un indice de fréquence $m_f$ multiple de 3 quand la fréquence de découpage est faible ?</p>",
        motsCles: [["commun", "identique", "meme", "phase"], ["compos", "entre phases", "v_ab", "disparai", "annul", "absent"]],
        minimum: 2,
        explication: "La raie au rang $m_f$, la plus forte de chaque bras, est alors identique en phase sur les trois bras : elle est de mode commun et disparaît des tensions composées.",
        resume: "Choix de m_f",
      },
      {
        type: "calcul",
        enonce: repere(7) + "<p>Modulation vectorielle, bus de $600\\ \\mathrm{V}$, $T_d = 100\\ \\mu\\mathrm{s}$, référence de $300\\ \\mathrm{V}$ à $30$ degrés dans le secteur I. Durée $t_2$ du vecteur $V_2$, en microsecondes ?</p>",
        valeur: 100 * ((RAC3 * 300) / 600) * 0.5,
        unite: "µs",
        tolerance: 0.02,
        explication: "$t_2 = T_d\\frac{\\sqrt{3}|\\vec{v}^*|}{E}\\sin\\theta = 100 \\times 0{,}866 \\times 0{,}5 = 43{,}3\\ \\mu\\mathrm{s}$, égal à $t_1$ au milieu du secteur.",
        resume: "Durée t2",
      },
      {
        type: "vraiFaux",
        enonce: repere(8) + "<p>À chaque commutation d'un bras, la tension de mode commun $v_{nO}$ varie de $E/3$.</p>",
        reponse: true,
        explication: "$v_{nO} = \\frac{E}{6}(2\\sum s_k - 3)$ : quand un $s_k$ change, la somme change de $1$ et $v_{nO}$ de $E/3$.",
        resume: "Saut de mode commun",
      },
      {
        type: "qcm",
        enonce: repere(9) + "<p>Quels rangs harmoniques contient la tension composée d'un onduleur triphasé en pleine onde ?</p>",
        options: ["$3$, $5$, $7$, $9$", "$5$, $7$, $11$, $13$", "$2$, $4$, $6$", "aucun"],
        bonnes: [1],
        explication: "Les rangs multiples de 3 sont de mode commun et les rangs pairs absents par symétrie : restent les rangs $6k \\pm 1$.",
        resume: "Harmoniques de la pleine onde",
      },
    ],
    { titre: "Dix questions de fin de séance" }
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
      { categorie: "Structure", question: "Combien d'états possède un onduleur triphasé à deux niveaux ?", reponse: "Huit : six états actifs, qui forment les sommets de l'hexagone, et deux états nuls, $000$ et $111$." },
      { categorie: "Formule", question: "Tension composée en fonction des états ?", reponse: "$v_{AB} = E(s_a - s_b)$, quelle que soit la charge." },
      { categorie: "Formule", question: "Tension simple d'une charge équilibrée à neutre isolé ?", reponse: "$v_{An} = \\frac{E}{3}(2s_a - s_b - s_c)$ : niveaux $0$, $\\pm E/3$, $\\pm 2E/3$." },
      { categorie: "Définition", question: "Qu'est-ce que la tension de mode commun ?", reponse: "$v_{nO} = \\frac{1}{3}(v_{AO} + v_{BO} + v_{CO})$, potentiel du neutre par rapport au point milieu ; elle saute de $E/3$ à chaque commutation." },
      { categorie: "Pleine onde", question: "Fondamental et harmoniques de la pleine onde ?", reponse: "$0{,}780E$ entre phases, $0{,}450E$ par phase ; rangs $6k \\pm 1$ en $V_1/h$." },
      { categorie: "Convention", question: "Définition du vecteur spatial ?", reponse: "$\\vec{v} = \\frac{2}{3}(v_a + av_b + a^2v_c)$ ; il vaut $\\hat{V}e^{j\\theta}$ pour un système équilibré et ignore le mode commun." },
      { categorie: "Hexagone", question: "Module des vecteurs actifs et rayon du cercle inscrit ?", reponse: "Sommets à $2E/3$ ; cercle inscrit de rayon $E/\\sqrt{3}$, limite linéaire de la modulation vectorielle." },
      { categorie: "Méthode", question: "Durées de la modulation vectorielle dans le secteur I ?", reponse: "$t_1 = T_d\\frac{\\sqrt{3}|\\vec{v}^*|}{E}\\sin(60^\\circ - \\theta)$, $t_2 = T_d\\frac{\\sqrt{3}|\\vec{v}^*|}{E}\\sin\\theta$, $t_0 = T_d - t_1 - t_2$, partagé entre $000$ et $111$." },
      { categorie: "Comparaison", question: "Tension composée maximale selon la modulation ?", reponse: "$0{,}612E$ en sinus-triangle, $0{,}707E$ avec injection min-max ou en vectorielle, $0{,}780E$ en pleine onde." },
      { categorie: "Bus", question: "Le bus d'un onduleur triphasé ondule-t-il à $2f$ ?", reponse: "Non pour une charge équilibrée : la puissance triphasée instantanée est constante. Le courant moyen du bus vaut $\\frac{3}{4}m_a\\hat{I}\\cos\\varphi$." },
    ],
    { titre: "Dix cartes à retourner" }
  );
  if (cartes) ressources.push(cartes);
}

/* --------------------------------------------------------------------------
   N. Révision espacée
   -------------------------------------------------------------------------- */

const VISUELS_REVISION = [
  etapes(["|Vk| = 2E/3", "= 2 × 540 / 3", "= 360 V"], "Sommets de l'hexagone."),
  etapes(["p(t) = v_a i_a + v_b i_b + v_c i_c", "= 3 V I cos φ, constante en équilibré", "pas de composante à 2f dans le bus"], "Puissance triphasée constante."),
  etapes(["U max = E / √2", "= 600 / 1,4142", "= 424,3 V efficaces"], "Limite linéaire avec injection."),
  etapes(["V1 crête = 230 × √2 = 325,3 V", "m_a = 325,3 / 380", "= 0,856"], "Indice de modulation du pont en H."),
  etapes(["bipolaire : Δi max = E / (2 L f_d)", "unipolaire : Δi max = E / (8 L f_d)", "rapport 4"], "Ondulation de courant."),
  etapes(["V_moy = 2 √2 V / π", "= 2 × 1,4142 × 230 / π", "= 207,1 V"], "Pont de Graetz sur charge résistive."),
  etapes(["P = 3 + 2 = 5 kW", "Q = 3 × tan(arccos 0,8) = 2,25 kvar", "S = 5,483 kVA, I = 5483 / 230 = 23,8 A"], "Théorème de Boucherot."),
];

function construireRevision(racine, api) {
  if (!racine.querySelector("#n-revision-bloc")) return;
  const quiz = api.quiz(
    "#n-revision-bloc",
    [
      {
        type: "calcul",
        enonce: repere(0) + "<p>Cette séance. Module des vecteurs actifs de l'hexagone pour un bus de $540\\ \\mathrm{V}$, en volts ?</p>",
        valeur: 360,
        unite: "V",
        tolerance: 0.01,
        explication: "$|V_k| = 2E/3 = 360\\ \\mathrm{V}$.",
        resume: "Sommets de l'hexagone",
      },
      {
        type: "vraiFaux",
        enonce: repere(1) + "<p>Cette séance. Le condensateur du bus d'un onduleur triphasé qui alimente un moteur équilibré n'a pas à absorber de pulsation de puissance à deux fois la fréquence de sortie.</p>",
        reponse: true,
        explication: "La puissance instantanée d'un récepteur triphasé équilibré est constante, contrairement au monophasé.",
        resume: "Bus triphasé",
      },
      {
        type: "calcul",
        enonce: repere(2) + "<p>Cette séance. Tension composée efficace maximale en zone linéaire avec injection min-max, pour un bus de $600\\ \\mathrm{V}$, en volts ?</p>",
        valeur: 600 / RAC2,
        unite: "V",
        tolerance: 0.01,
        explication: "$E/\\sqrt{2} = 424{,}3\\ \\mathrm{V}$, contre $367{,}4\\ \\mathrm{V}$ en sinus-triangle seul.",
        resume: "Limite avec injection",
      },
      {
        type: "calcul",
        enonce: repere(3) + "<p>Cours Onduleurs monophasés. Un pont en H sur un bus de $380\\ \\mathrm{V}$ doit fournir $230\\ \\mathrm{V}$ efficaces au fondamental. Quel indice de modulation faut-il ?</p>",
        valeur: (230 * RAC2) / 380,
        unite: "",
        tolerance: 0.01,
        explication: "$m_a = 230\\sqrt{2}/380 = 0{,}856$.",
        resume: "Indice du pont en H",
      },
      {
        type: "vraiFaux",
        enonce: repere(4) + "<p>Cours Onduleurs monophasés. À fréquence de découpage égale, l'ondulation maximale du courant de sortie est quatre fois plus faible en modulation unipolaire qu'en bipolaire.</p>",
        reponse: true,
        explication: "$E/(8Lf_d)$ contre $E/(2Lf_d)$.",
        resume: "Ondulation de courant",
      },
      {
        type: "calcul",
        enonce: repere(5) + "<p>Cours Redresseurs monophasés. Tension moyenne d'un pont de Graetz idéal alimenté sous $230\\ \\mathrm{V}$ efficaces, sur charge résistive, en volts ?</p>",
        valeur: (2 * RAC2 * 230) / Math.PI,
        unite: "V",
        tolerance: 0.01,
        explication: "$V_{moy} = 2\\sqrt{2}V/\\pi = 207{,}1\\ \\mathrm{V}$.",
        resume: "Pont de Graetz",
      },
      {
        type: "calcul",
        enonce: repere(6) + "<p>Cours Révision 3 et analyse d'une charge AC. Une installation monophasée en $230\\ \\mathrm{V}$ alimente une charge de $3\\ \\mathrm{kW}$ à facteur de puissance $0{,}8$ inductif et une charge résistive de $2\\ \\mathrm{kW}$. Courant total, en ampères ?</p>",
        valeur: Math.hypot(5000, 2250) / 230,
        unite: "A",
        tolerance: 0.02,
        explication: "Boucherot : $P = 5\\ \\mathrm{kW}$, $Q = 2{,}25\\ \\mathrm{kvar}$, $S = 5{,}483\\ \\mathrm{kVA}$, $I = 23{,}8\\ \\mathrm{A}$.",
        resume: "Théorème de Boucherot",
      },
    ],
    { titre: "Sept questions de révision espacée" }
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
    titre: "Où en suis-je sur les onduleurs triphasés ?",
  });
  if (auto) ressources.push(auto);
}
